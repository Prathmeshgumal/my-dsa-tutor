"""Files kept as real files in one folder each: code under /api/files (solutions), Markdown notes under
/api/notes, saved dry runs under /api/playground.
  GET    /api/files               → [{ name, content }]
  PUT    /api/files/:name         { content } → write (create or overwrite)
  DELETE /api/files/:name         → delete (idempotent)
  POST   /api/files/:name/rename  { to } → rename
"""

import os
import re
import shutil
from collections.abc import Callable

from .atomic_write import write_file_atomic
from .collate import sort_names
from .core import language_from_filename
from .own_changes import note_own_change
from .web import Request, decode_uri_component, dumps, loads

MAX_BODY_BYTES = 5 * 1024 * 1024


class HttpError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


async def read_json(req: Request, too_large: str) -> dict:
    """The body as a JSON object; 413 past 5 MB, 400 if it isn't an object."""
    raw = await req.body(MAX_BODY_BYTES)
    if raw is None:
        raise HttpError(413, too_large)
    try:
        body = loads(raw.decode("utf-8", errors="replace"))
    except ValueError:
        body = None
    if isinstance(body, (dict, list)):
        # typeof [] is 'object' too: an array passes, and its "content" is then missing.
        return body if isinstance(body, dict) else {}
    raise HttpError(400, "Expected a JSON object body")


def read_text(file: str) -> str:
    with open(file, encoding="utf-8", errors="replace") as f:
        return f.read()


class Store:
    def __init__(self, folder: str, prefix: str, allows: Callable[[str], bool]):
        self.dir = folder
        self.prefix = prefix
        self.allows = allows

    def check_name(self, name: str) -> None:
        """Only plain, visible files of the store's kind directly inside the folder — no paths, no traversal."""
        safe = 0 < _js_length(name) <= 255 and not re.search(r"[/\\\0]", name) and not name.startswith(".") and self.allows(name)
        if not safe:
            raise HttpError(400, f"Invalid file name: {dumps(name)}")

    def list(self) -> list[dict]:
        os.makedirs(self.dir, exist_ok=True)
        names = [e.name for e in os.scandir(self.dir) if e.is_file(follow_symlinks=False) and not e.name.startswith(".") and self.allows(e.name)]
        return [{"name": name, "content": read_text(os.path.join(self.dir, name))} for name in sort_names(names)]

    async def handle(self, req: Request) -> None:
        rest = req.path[len(self.prefix) :]
        method = req.method
        if rest in ("", "/"):
            if method != "GET":
                raise HttpError(405, "Method not allowed")
            await req.respond(200, dumps(self.list()), {"Content-Type": "application/json"})
            return

        encoded, *more = rest[1:].split("/")
        action, extra = (more[0], more[1:]) if more else (None, [])
        try:
            name = decode_uri_component(encoded)
        except ValueError:
            raise HttpError(400, "Malformed file name") from None
        if extra:
            raise HttpError(404, "Not found")
        self.check_name(name)
        file = os.path.join(self.dir, name)
        os.makedirs(self.dir, exist_ok=True)

        if action is None and method == "PUT":
            content = (await read_json(req, "File too large")).get("content")
            if not isinstance(content, str):
                raise HttpError(400, '"content" must be a string')
            write_file_atomic(file, content)
        elif action is None and method == "DELETE":
            note_own_change(file)
            _remove(file)
        elif action == "rename" and method == "POST":
            to = (await read_json(req, "File too large")).get("to")
            if not isinstance(to, str):
                raise HttpError(400, '"to" must be a string')
            self.check_name(to)
            clash = next((n for n in os.listdir(self.dir) if n.lower() == to.lower() and n != name), None)
            if clash:
                raise HttpError(409, f"{clash} already exists")
            if not os.path.exists(file):
                raise HttpError(404, f"{name} not found")
            note_own_change(file)
            note_own_change(os.path.join(self.dir, to))
            os.rename(file, os.path.join(self.dir, to))
        else:
            raise HttpError(405, "Method not allowed")
        await req.respond(204)


def _remove(file: str) -> None:
    """rm(file, { force: true }): gone already is fine; a folder of that name is removed too."""
    try:
        os.unlink(file)
    except FileNotFoundError:
        pass
    except IsADirectoryError:
        shutil.rmtree(file, ignore_errors=True)


def _js_length(text: str) -> int:
    """String length in UTF-16 units, as JavaScript counts it."""
    return len(text) + sum(1 for c in text if ord(c) > 0xFFFF)


def store_routes(store: Store):
    prefix = store.prefix

    async def handle(req: Request) -> bool:
        url = req.path + (f"?{req.query}" if req.query else "")
        if url != prefix and not url.startswith(f"{prefix}/") and not url.startswith(f"{prefix}?"):
            return False
        try:
            await store.handle(req)
        except HttpError as e:
            await req.send_json(e.status, {"error": str(e)})
        except Exception as e:
            await req.send_json(500, {"error": str(e)})
        return True

    return handle


def solutions_store(folder: str) -> Store:
    return Store(folder, "/api/files", lambda name: language_from_filename(name) is not None)


_PLAYGROUND_NAME = re.compile(r"[\w-]+\.json", re.ASCII)


def playground_store(folder: str) -> Store:
    """Saved dry runs for the Playground, one JSON file each."""
    return Store(folder, "/api/playground", lambda name: bool(_PLAYGROUND_NAME.fullmatch(name)))


def notes_store(folder: str) -> Store:
    return Store(folder, "/api/notes", lambda name: name.lower().endswith(".md"))
