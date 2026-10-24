"""The small pieces every route uses: the request as Node saw it, responses, and JSON written exactly as
JavaScript writes it (so saved files and answers don't change by a byte when the server moved to Python)."""

import json
import math
import re
from collections.abc import Awaitable, Callable
from typing import Any
from urllib.parse import parse_qsl

Send = Callable[[dict], Awaitable[None]]
Receive = Callable[[], Awaitable[dict]]


class Request:
    """One HTTP request. `path` is the address exactly as sent (still %-encoded), like Node's req.url."""

    def __init__(self, scope: dict, receive: Receive, send: Send):
        self.scope = scope
        self.method: str = scope["method"]
        self.path: str = scope.get("raw_path", scope["path"].encode()).decode("latin-1")
        self.query: str = scope["query_string"].decode("latin-1")
        self.headers: dict[str, str] = {}
        for k, v in scope["headers"]:
            name = k.decode("latin-1")
            # Like Node: repeated headers are joined (cookies aside, which nothing here reads).
            value = v.decode("latin-1")
            self.headers[name] = f"{self.headers[name]}, {value}" if name in self.headers else value
        self._receive = receive
        self._send = send
        self.started = False
        self._body_read = False

    def param(self, name: str) -> str | None:
        """The first value of a query parameter, like URLSearchParams.get."""
        for k, v in parse_qsl(self.query, keep_blank_values=True):
            if k == name:
                return v
        return None

    async def body(self, limit: int | None = None) -> bytes | None:
        """The whole body; None as soon as it goes over `limit` bytes."""
        chunks: list[bytes] = []
        size = 0
        while not self._body_read:
            message = await self._receive()
            if message["type"] == "http.disconnect":
                self._body_read = True
                break
            chunk = message.get("body", b"")
            size += len(chunk)
            if limit is not None and size > limit:
                return None
            chunks.append(chunk)
            if not message.get("more_body"):
                self._body_read = True
        return b"".join(chunks)

    async def json_object(self, limit: int | None = None) -> dict | None:
        """The body as a JSON object, or None if it isn't one (like the Node routes' readBody)."""
        raw = await self.body(limit)
        if raw is None:
            return None
        try:
            value = loads(raw.decode("utf-8", errors="replace"))
        except ValueError:
            return None
        return value if isinstance(value, dict) else None

    async def respond(self, status: int, body: bytes | str = b"", headers: dict[str, str] | None = None) -> None:
        data = utf8(body) if isinstance(body, str) else body
        raw = [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in (headers or {}).items()]
        if status not in (204, 304):
            raw.append((b"content-length", str(len(data)).encode()))
        self.started = True
        await self._send({"type": "http.response.start", "status": status, "headers": raw})
        await self._send({"type": "http.response.body", "body": data})

    async def start(self, status: int, headers: dict[str, str]) -> None:
        """Starts a streamed response (server-sent events, files)."""
        self.started = True
        raw = [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in headers.items()]
        await self._send({"type": "http.response.start", "status": status, "headers": raw})

    async def write(self, chunk: bytes | str) -> None:
        data = utf8(chunk) if isinstance(chunk, str) else chunk
        await self._send({"type": "http.response.body", "body": data, "more_body": True})

    async def end(self, chunk: bytes = b"") -> None:
        await self._send({"type": "http.response.body", "body": chunk})

    async def send_json(self, status: int, value: Any, headers: dict[str, str] | None = None) -> None:
        await self.respond(status, dumps(value), {"Content-Type": "application/json", **(headers or {})})

    async def wait_for_disconnect(self) -> None:
        """Returns when the browser goes away (only once the body has been read)."""
        while True:
            message = await self._receive()
            if message["type"] == "http.disconnect":
                return


Handler = Callable[[Request], Awaitable[bool]]
"""A route: answers and returns True, or returns False to let the next one look at the request."""


# JSON, the JavaScript way.


def _reject_constant(name: str):
    raise ValueError(f"{name} isn't JSON")


def loads(text: str) -> Any:
    """JSON.parse: no NaN or Infinity."""
    return json.loads(text, parse_constant=_reject_constant)


def js_number(value: float) -> int | float:
    """How JSON.stringify writes a number: 1.0 is 1."""
    if isinstance(value, float) and value.is_integer() and abs(value) < 1e21:
        return int(value)
    return value


def _plain(value: Any) -> Any:
    if isinstance(value, float):
        return js_number(value) if math.isfinite(value) else None
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    return value


_EXPONENT = re.compile(r"(?<=[0-9])e([+-])0*([0-9])")


def dumps(value: Any, indent: int | None = None) -> str:
    """JSON.stringify(value) / JSON.stringify(value, null, indent)."""
    text = json.dumps(_plain(value), ensure_ascii=False, indent=indent, separators=(",", ":") if indent is None else (",", ": "))
    # Python writes 1e-07 where JavaScript writes 1e-7. Rare (only tiny or huge floats), so only checked for then.
    if "e" in text and _has_exponent_float(value):
        text = _fix_exponents(text)
    # JSON.stringify escapes a lone surrogate (from "\ud800" in the browser's JSON) instead of writing it raw.
    if _SURROGATE.search(text):
        text = _SURROGATE.sub(lambda m: f"\\u{ord(m[0]):04x}", text)
    return text


_SURROGATE = re.compile("[\ud800-\udfff]")


def utf8(text: str) -> bytes:
    """Text as Node writes it: a lone surrogate becomes U+FFFD."""
    try:
        return text.encode("utf-8")
    except UnicodeEncodeError:
        return _SURROGATE.sub("\ufffd", text).encode("utf-8")


def _has_exponent_float(value: Any) -> bool:
    if isinstance(value, float):
        return "e" in repr(value)
    if isinstance(value, dict):
        return any(_has_exponent_float(v) for v in value.values())
    if isinstance(value, (list, tuple)):
        return any(_has_exponent_float(v) for v in value)
    return False


def _fix_exponents(text: str) -> str:
    """Rewrites exponents outside strings: 1e-07 → 1e-7, 1e+21 stays."""
    out, i, in_string = [], 0, False
    while i < len(text):
        c = text[i]
        if in_string:
            out.append(c)
            if c == "\\":
                out.append(text[i + 1])
                i += 2
                continue
            if c == '"':
                in_string = False
            i += 1
            continue
        if c == '"':
            in_string = True
            out.append(c)
            i += 1
            continue
        j = i
        while j < len(text) and text[j] not in '",[]{}:"':
            j += 1
        if j == i:
            out.append(c)
            i += 1
        else:
            out.append(_EXPONENT.sub(r"e\1\2", text[i:j]))
            i = j
    return "".join(out)


_DECIMAL = re.compile(r"[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?")
_RADIX = {"x": (16, re.compile(r"0[xX][0-9a-fA-F]+")), "o": (8, re.compile(r"0[oO][0-7]+")), "b": (2, re.compile(r"0[bB][01]+"))}


def js_to_number(text: str | None) -> float:
    """JavaScript's Number(text), for query parameters: Number(null) and Number("") are 0, junk is NaN."""
    if text is None:
        return 0.0
    s = text.strip()
    if s == "":
        return 0.0
    if s in ("Infinity", "+Infinity"):
        return math.inf
    if s == "-Infinity":
        return -math.inf
    if _DECIMAL.fullmatch(s):
        return float(s)
    if len(s) > 2 and s[1].lower() in _RADIX:
        base, pattern = _RADIX[s[1].lower()]
        if pattern.fullmatch(s):
            return float(int(s[2:], base))
    return math.nan


_PERCENT_RUN = re.compile(r"(?:%[0-9a-fA-F]{2})+")


def decode_uri_component(text: str) -> str:
    """JavaScript's decodeURIComponent: raises ValueError for a stray % or bytes that aren't UTF-8."""
    if "%" not in text:
        return text
    if re.search(r"%(?![0-9a-fA-F]{2})", text):
        raise ValueError("URI malformed")
    return _PERCENT_RUN.sub(lambda m: bytes.fromhex(m[0].replace("%", "")).decode("utf-8"), text)


def js_truthy(value) -> bool:
    """JavaScript truthiness: [] and {} are true, unlike in Python."""
    if value is None or value is False:
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value == value and value != 0
    if isinstance(value, str):
        return value != ""
    return True
