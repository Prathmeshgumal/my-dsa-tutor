"""The editor as a real app: the API routes, the built page from dist/, and /piston forwarded to Piston, all on
one server. `python -m dsa_server` runs it (see __main__.py)."""

import os
import posixpath
import re
from pathlib import Path

import httpx

from .atomic_write import remove_leftover_temp_files
from .claude_routes import Turns, claude_routes
from .config import Config
from .folder_events import FolderEvents
from .health import health_routes
from .log import Logger, log_routes
from .piston import forward_to_piston, join_websockets, refuse
from .problems_api import problems_routes
from .same_site import from_another_site, is_allowed_host, same_site_guard
from .state_api import state_routes
from .stores import notes_store, playground_store, solutions_store, store_routes
from .web import Handler, Receive, Request, Send, decode_uri_component, dumps

TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
}

PISTON = re.compile(r"^/piston(/|$)")
API = re.compile(r"^/api(/|$)")


class Page:
    """The built page: real files as they are, and index.html for any other address so reloading a page works."""

    def __init__(self, dist_dir: str):
        self.dist = os.path.realpath(dist_dir)
        # Files by path, kept while their size and time are unchanged (a rebuild changes both).
        self._cache: dict[str, tuple[int, int, bytes]] = {}

    def inside(self, url_path: str) -> str | None:
        """A file inside dist/, or None for anything that would leave it."""
        try:
            decoded = decode_uri_component(url_path)
        except ValueError:
            return None
        normalized = "/" + posixpath.normpath("/" + decoded).lstrip("/")
        file = os.path.normpath(os.path.join(self.dist, "." + normalized))
        return file if file == self.dist or file.startswith(self.dist + os.sep) else None

    def read(self, file: str) -> bytes | None:
        try:
            info = os.stat(file)
        except (OSError, ValueError):
            return None
        if not os.path.isfile(file):
            return None
        cached = self._cache.get(file)
        if cached and cached[0] == info.st_size and cached[1] == info.st_mtime_ns:
            return cached[2]
        try:
            data = Path(file).read_bytes()
        except OSError:
            return None
        self._cache[file] = (info.st_size, info.st_mtime_ns, data)
        return data

    async def serve_file(self, req: Request, file: str, cache: str) -> bool:
        data = self.read(file)
        if data is None:
            return False
        ext = os.path.splitext(file)[1]
        await req.respond(200, data, {"Content-Type": TYPES.get(ext, "application/octet-stream"), "Cache-Control": cache})
        return True

    async def serve(self, req: Request) -> None:
        url_path = req.path
        if req.method not in ("GET", "HEAD"):
            await req.send_json(405, {"error": "Method not allowed"})
            return
        file = self.inside(url_path)
        if file is None:
            await req.send_json(404, {"error": "Not found"})
            return
        # Built files have their content's hash in their name, so they never change and can be kept forever.
        hashed = url_path.startswith("/assets/")
        if await self.serve_file(req, file, "public, max-age=31536000, immutable" if hashed else "no-cache"):
            return
        if hashed or posixpath.splitext(url_path)[1]:
            await req.send_json(404, {"error": "Not found"})
            return
        if not await self.serve_file(req, os.path.join(self.dist, "index.html"), "no-cache"):
            await req.send_json(503, {"error": "The page isn’t built yet. Run npm run build."})


class App:
    """The ASGI app uvicorn runs."""

    def __init__(self, config: Config, dist_dir: str, logger: Logger):
        self.config = config
        self.logger = logger
        self.page = Page(dist_dir)
        # No time limit: a run takes as long as Piston lets it.
        self.client = httpx.AsyncClient(timeout=None)
        self.open_runs: set = set()
        self.turns = Turns()
        folders = config.folders
        # A fresh data folder (first start, or a new DATA_DIR) gets everything it needs.
        for folder in folders.values():
            os.makedirs(folder, exist_ok=True)
        try:
            remove_leftover_temp_files([folders[name] for name in ("solutions", "notes", "playground", "problems", "state")])
        except OSError as e:
            logger.log("warn", "Couldn’t clear temporary files left by an interrupted save", e)
        self.events = FolderEvents({"files": folders["solutions"], "notes": folders["notes"], "playground": folders["playground"], "problems": folders["problems"]})
        self.routes: list[Handler] = [
            # First: other websites open in your browser may not use any of the routes below.
            same_site_guard,
            log_routes(logger),
            health_routes(config.piston_url, {name: folders[name] for name in ("solutions", "notes", "playground", "problems", "state", "logs")}, self.client),
            self.events.handle,
            store_routes(solutions_store(folders["solutions"])),
            store_routes(notes_store(folders["notes"])),
            store_routes(playground_store(folders["playground"])),
            problems_routes(folders["problems"]),
            # Tabs, chats and settings.
            state_routes(folders["state"]),
            claude_routes(folders, config.piston_url, self.client, logger, self.turns),
        ]

    async def __call__(self, scope: dict, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            await self.http(Request(scope, receive, send))
        elif scope["type"] == "websocket":
            await self.websocket(scope, receive, send)
        elif scope["type"] == "lifespan":
            await self.lifespan(receive, send)

    async def lifespan(self, receive: Receive, send: Send) -> None:
        while True:
            message = await receive()
            if message["type"] == "lifespan.startup":
                await send({"type": "lifespan.startup.complete"})
            elif message["type"] == "lifespan.shutdown":
                self.events.close()
                self.turns.close()
                for run in list(self.open_runs):
                    run.cancel()
                await self.client.aclose()
                await send({"type": "lifespan.shutdown.complete"})
                return

    async def http(self, req: Request) -> None:
        if not is_allowed_host(req.headers.get("host")):
            await req.send_json(403, {"error": "Blocked: open the editor at localhost."})
            return
        try:
            for handler in self.routes:
                if await handler(req):
                    return
            if PISTON.match(req.path):
                await self.forward_to_piston(req)
            elif API.match(req.path):
                await req.send_json(404, {"error": "Not found"})
            else:
                await self.page.serve(req)
        except Exception as e:
            self.logger.log("error", "Unhandled error in the server", e)
            if not req.started:
                await req.respond(500, dumps({"error": str(e)}))

    async def forward_to_piston(self, req: Request) -> None:
        await forward_to_piston(req, self.config.piston_url, self.client)

    async def websocket(self, scope: dict, receive: Receive, send: Send) -> None:
        headers = {k.decode("latin-1"): v.decode("latin-1") for k, v in scope["headers"]}
        path = scope.get("raw_path", scope["path"].encode()).decode("latin-1")
        allowed = is_allowed_host(headers.get("host")) and not from_another_site(headers) and PISTON.match(path)
        if not allowed:
            await refuse(scope, send, 403)
            return
        await join_websockets(scope, receive, send, self.config.piston_url, self.open_runs)
