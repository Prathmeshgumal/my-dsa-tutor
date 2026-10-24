"""A small log file for when something goes wrong: server errors and errors the browser reports.
One JSON object per line in <logs>/editor.log; at 1 MB it moves to editor.log.1 and starts again.
  POST /api/log          { level, message, detail? } → the browser reports an error
  GET  /api/logs?tail=n  → the last n lines (for "Copy diagnostics")
"""

import math
import os
import threading
import traceback
from datetime import UTC, datetime
from pathlib import Path

from .web import Request, dumps, js_to_number

MAX_BYTES = 1024 * 1024
MAX_FIELD = 4000

_MISSING = object()


def _cut(text: str) -> str:
    return f"{text[:MAX_FIELD]}…" if len(text) > MAX_FIELD else text


def _describe(detail) -> str:
    if isinstance(detail, BaseException):
        return _cut("".join(traceback.format_exception(detail)).rstrip())
    return _cut(detail if isinstance(detail, str) else dumps(detail))


def now_iso() -> str:
    """Date.toISOString(): 2026-10-24T11:17:47.123Z."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class Logger:
    def __init__(self, folder: str):
        self.dir = Path(folder)
        self.file = self.dir / "editor.log"
        # Writes go one at a time, so lines never interleave and rotation never races a write.
        self._lock = threading.Lock()

    def log(self, level: str, message: str, detail=_MISSING) -> None:
        entry = {"at": now_iso(), "level": level, "message": _cut(message)}
        if detail is not _MISSING:
            entry["detail"] = _describe(detail)
        line = dumps(entry)
        try:
            with self._lock:
                self.dir.mkdir(parents=True, exist_ok=True)
                try:
                    size = self.file.stat().st_size
                except OSError:
                    size = 0
                if size > MAX_BYTES:
                    os.replace(self.file, f"{self.file}.1")
                with open(self.file, "a", encoding="utf-8") as f:
                    f.write(line + "\n")
        except OSError:
            pass  # Logging must never break the editor.

    def tail(self, lines: int) -> list[str]:
        with self._lock:
            try:
                text = self.file.read_text("utf-8")
            except OSError:
                text = ""
        kept = [line for line in text.split("\n") if line]
        return kept[-lines:] if lines > 0 else kept


def log_routes(logger: Logger):
    async def handle(req: Request) -> bool:
        if req.path == "/api/log" and req.method == "POST":
            body = await req.json_object(64 * 1024)
            if body is not None and isinstance(body.get("message"), str):
                level = body.get("level") if body.get("level") in ("warn", "info") else "error"
                logger.log(level, f"[browser] {body['message']}", body.get("detail", _MISSING))
            await req.respond(204)
            return True
        if req.path == "/api/logs" and req.method == "GET":
            n = js_to_number(req.param("tail"))
            n = 100 if math.isnan(n) or n == 0 else n
            n = min(500, max(1, n))
            lines = logger.tail(int(n))  # slice(-3.7) keeps 3 lines in JavaScript too
            await req.respond(200, "\n".join(lines), {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"})
            return True
        return False

    return handle
