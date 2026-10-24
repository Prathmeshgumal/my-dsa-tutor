"""What the editor remembers between visits (open tabs, chats, settings), saved as files so that clearing the
browser, using another browser or changing the port loses nothing.
  GET /api/state        → { settings, workspace, ai, problems }: each the JSON text saved, or null
  PUT /api/state/:key   JSON body → saved as <state folder>/<key>.json
"""

import os
import re

from .atomic_write import write_file_atomic
from .web import Request, dumps, loads

ROUTE = "/api/state"
STATE_KEYS = ("settings", "workspace", "ai", "problems")
MAX_BYTES = 50 * 1024 * 1024
"""Chats can hold pasted images, so this is generous."""

_KEY = re.compile(r"/[a-z]+")


def state_routes(folder: str, max_bytes: int = MAX_BYTES):
    def file(key: str) -> str:
        return os.path.join(folder, f"{key}.json")

    async def send(req: Request, status: int, body=None) -> None:
        if body is None:
            await req.respond(status, b"", {"Cache-Control": "no-store"})
        else:
            await req.respond(status, dumps(body), {"Cache-Control": "no-store", "Content-Type": "application/json"})

    def read(key: str) -> str | None:
        try:
            with open(file(key), encoding="utf-8", errors="replace", newline="") as f:
                return f.read()
        except OSError:
            return None

    async def handle(req: Request) -> bool:
        route = req.path
        if route != ROUTE and not route.startswith(f"{ROUTE}/"):
            return False
        rest = route[len(ROUTE) :]
        try:
            if rest == "" and req.method == "GET":
                await send(req, 200, {key: read(key) for key in STATE_KEYS})
                return True
            key = rest[1:]
            if not _KEY.fullmatch(rest) or key not in STATE_KEYS:
                await send(req, 404, {"error": "Not found"})
                return True
            if req.method != "PUT":
                await send(req, 405, {"error": "Method not allowed"})
                return True
            raw = await req.body(max_bytes)
            if raw is None:
                await send(req, 413, {"error": "Too large"})
                return True
            text = raw.decode("utf-8", errors="replace")
            try:
                loads(text)
            except ValueError:
                await send(req, 400, {"error": "Expected JSON"})
                return True
            os.makedirs(folder, exist_ok=True)
            write_file_atomic(file(key), text)
            await send(req, 204)
        except Exception as e:
            if not req.started:
                await send(req, 500, {"error": str(e)})
        return True

    return handle
