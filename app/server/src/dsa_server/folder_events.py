"""Tells the browser when files in the data folders change outside the editor (VS Code, git, a script), so it can
show the change without a reload.
  GET /api/events → server-sent events: data: {"area":"files"|"notes"|"playground"|"problems"}
"""

import asyncio
import contextlib
import os

import anyio
from watchfiles import awatch

from .atomic_write import is_temp_file
from .own_changes import is_own_change
from .web import Request, dumps

ROUTE = "/api/events"
SETTLE = 0.3
"""Changes arrive in bursts (a save, a git checkout); one event per area per burst is enough."""
HEARTBEAT = 25


class FolderEvents:
    def __init__(self, folders: dict[str, str]):
        self.folders = {area: os.path.abspath(path) for area, path in folders.items()}
        self.clients: set[asyncio.Queue] = set()
        self.timers: dict[str, asyncio.TimerHandle] = {}
        self.watching: asyncio.Task | None = None
        self.stop_event: anyio.Event | None = None

    def broadcast(self, area: str) -> None:
        self.timers.pop(area, None)
        message = f"data: {dumps({'area': area})}\n\n"
        for queue in self.clients:
            queue.put_nowait(message)

    def changed(self, path: str) -> None:
        name = os.path.basename(path)
        if is_temp_file(name) or is_own_change(path):
            return
        loop = asyncio.get_running_loop()
        for area, folder in self.folders.items():
            if path == folder or path.startswith(folder + os.sep):
                if area in self.timers:
                    self.timers[area].cancel()
                self.timers[area] = loop.call_later(SETTLE, self.broadcast, area)

    async def watch(self, stop: anyio.Event) -> None:
        # A missing folder is reported by the setup check; nothing to watch there.
        paths = [p for p in self.folders.values() if os.path.isdir(p)]
        if not paths:
            return
        with contextlib.suppress(Exception):
            async for changes in awatch(*paths, watch_filter=None, step=5, debounce=1600, stop_event=stop, rust_timeout=1000, ignore_permission_denied=True):
                for _change, path in changes:
                    self.changed(path)

    def start(self) -> None:
        self.stop_event = anyio.Event()
        self.watching = asyncio.ensure_future(self.watch(self.stop_event))

    def stop(self) -> None:
        if self.stop_event:
            self.stop_event.set()
        for timer in self.timers.values():
            timer.cancel()
        self.timers.clear()

    async def handle(self, req: Request) -> bool:
        if req.method != "GET" or req.path != ROUTE:
            return False
        await req.start(200, {"Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive"})
        await req.write(": connected\n\n")
        if not self.clients:
            self.start()
        queue: asyncio.Queue[str] = asyncio.Queue()
        self.clients.add(queue)
        gone = asyncio.ensure_future(req.wait_for_disconnect())
        getting = asyncio.ensure_future(queue.get())
        try:
            while True:
                done, _ = await asyncio.wait({getting, gone}, timeout=HEARTBEAT, return_when=asyncio.FIRST_COMPLETED)
                if gone in done:
                    break
                if getting in done:
                    await req.write(getting.result())
                    getting = asyncio.ensure_future(queue.get())
                else:
                    await req.write(": ping\n\n")
        except OSError:
            pass
        finally:
            gone.cancel()
            getting.cancel()
            self.clients.discard(queue)
            if not self.clients:
                self.stop()
        return True

    def close(self) -> None:
        """Ends every open stream at shutdown."""
        self.stop()
