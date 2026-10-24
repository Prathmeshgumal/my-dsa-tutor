"""/piston, passed through to Piston: plain requests (Run) and WebSockets (interactive runs, where typed input goes
to the running program). Closing either side of an interactive run closes the other."""

import asyncio
import contextlib
import re

import httpx
import websockets
from websockets.exceptions import ConnectionClosed, InvalidStatus

from .web import Receive, Request, Send

PISTON = re.compile(r"^/piston(/|$)")
UNREACHABLE = {"error": "Couldn’t reach Piston. Is it running? (docker compose up -d)"}

# Not passed on: they describe this connection, not the message.
_HOP = {"connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "te", "trailer", "host", "content-length"}


def target(piston_url: str, url: str) -> str:
    return piston_url.rstrip("/") + re.sub(r"^/piston", "/api/v2", url, count=1)


async def forward_to_piston(req: Request, piston_url: str, client: httpx.AsyncClient) -> None:
    url = target(piston_url, req.path + (f"?{req.query}" if req.query else ""))
    body = await req.body()
    headers = [(k, v) for k, v in req.headers.items() if k not in _HOP]

    async def forward() -> None:
        request = client.build_request(req.method, url, headers=headers, content=body or None)
        try:
            answer = await client.send(request, stream=True)
        except httpx.HTTPError:
            await req.send_json(502, UNREACHABLE)
            return
        try:
            out = {k: v for k, v in answer.headers.multi_items() if k.lower() not in _HOP}
            await req.start(answer.status_code, out)
            async for chunk in answer.aiter_raw():
                await req.write(chunk)
            await req.end()
        finally:
            await answer.aclose()

    # The browser gave up (Stop, closed tab): don't keep Piston's side open waiting for an answer nobody reads.
    running = asyncio.ensure_future(forward())
    gone = asyncio.ensure_future(req.wait_for_disconnect())
    try:
        await asyncio.wait({running, gone}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        gone.cancel()
        if not running.done():
            running.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await running
        elif running.exception():
            raise running.exception()  # type: ignore[misc]


async def refuse(scope: dict, send: Send, status: int) -> None:
    """Turns down a WebSocket before it opens, with this HTTP status."""
    if "websocket.http.response" in scope.get("extensions", {}):
        await send({"type": "websocket.http.response.start", "status": status, "headers": [(b"connection", b"close")]})
        await send({"type": "websocket.http.response.body", "body": b""})
    else:
        await send({"type": "websocket.close", "code": 1008})


async def join_websockets(scope: dict, receive: Receive, send: Send, piston_url: str, open_runs: set) -> None:
    """Interactive runs: the browser's WebSocket is joined to Piston's, message for message."""
    path = scope.get("raw_path", scope["path"].encode()).decode("latin-1")
    query = scope["query_string"].decode("latin-1")
    url = target(piston_url, path + (f"?{query}" if query else "")).replace("http", "ws", 1)
    # The browser's opening message arrives first; take it so the rest of `receive` is the conversation.
    first = await receive()
    if first["type"] != "websocket.connect":
        return
    try:
        upstream = await websockets.connect(url, ping_interval=None, max_size=None, compression=None, open_timeout=None, close_timeout=1)
    except InvalidStatus as e:
        await refuse(scope, send, e.response.status_code)
        return
    except (OSError, websockets.exceptions.WebSocketException, asyncio.TimeoutError):
        await refuse(scope, send, 502)
        return
    await send({"type": "websocket.accept"})
    task = asyncio.current_task()
    open_runs.add(task)

    async def browser_to_piston() -> None:
        while True:
            message = await receive()
            if message["type"] == "websocket.receive":
                await upstream.send(message["text"] if message.get("text") is not None else message.get("bytes", b""))
            else:  # websocket.disconnect
                await upstream.close(_closable(message.get("code", 1000)), message.get("reason", "") or "")
                return

    async def piston_to_browser() -> None:
        try:
            async for message in upstream:
                if isinstance(message, str):
                    await send({"type": "websocket.send", "text": message})
                else:
                    await send({"type": "websocket.send", "bytes": message})
        except ConnectionClosed:
            pass
        code = upstream.close_code or 1000
        with contextlib.suppress(Exception):
            await send({"type": "websocket.close", "code": _closable(code), "reason": upstream.close_reason or ""})

    a = asyncio.ensure_future(browser_to_piston())
    b = asyncio.ensure_future(piston_to_browser())
    try:
        await asyncio.wait({a, b}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        open_runs.discard(task)
        for t in (a, b):
            t.cancel()
        with contextlib.suppress(Exception):
            await upstream.close()
        with contextlib.suppress(Exception):
            await send({"type": "websocket.close", "code": 1000})


def _closable(code: int) -> int:
    """Codes like 1005 (no code) and 1006 (dropped) describe a close but can't be sent in one."""
    return 1000 if code in (1005, 1006, 1015) else code
