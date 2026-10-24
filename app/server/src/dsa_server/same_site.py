"""Only the editor's own page may use the editor's routes. Without this, any website open in the browser could
send requests to localhost and run code, read your files, or ask Claude to change them. And only addresses that
can't belong to someone else's website are served at all."""

import re
from urllib.parse import urlsplit

from .web import Request

GUARDED = re.compile(r"^/(api|piston)(/|$)")
"""The routes that read or change your work, run code, or talk to Claude."""

_IPV4 = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$")


def _url_host(url: str) -> str | None:
    """`new URL(url).host` for an Origin header: host[:port] without a default port, lower-cased. None if invalid."""
    try:
        parts = urlsplit(url)
        if not parts.scheme or not parts.netloc or not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9+.-]*", parts.scheme):
            return None
        host = parts.hostname
        if host is None:
            return None
        port = parts.port
    except ValueError:
        return None
    if ":" in host:
        host = f"[{host}]"
    default = {"http": 80, "https": 443, "ws": 80, "wss": 443}.get(parts.scheme.lower())
    return host if port is None or port == default else f"{host}:{port}"


def from_another_site(headers: dict[str, str]) -> bool:
    # Sent by browsers on every request: same-origin for the editor's own page, none when you type the address.
    site = headers.get("sec-fetch-site")
    if site and site not in ("same-origin", "none"):
        return True
    origin = headers.get("origin")
    if not origin:
        return False
    host = _url_host(origin)
    return host is None or host != headers.get("host")


def host_name(host: str | None) -> str | None:
    """`new URL('http://' + host).hostname`, or None when that isn't a valid address."""
    if not host:
        return None
    try:
        parts = urlsplit(f"http://{host}")
        name = parts.hostname
        parts.port  # noqa: B018 — raises for a bad port, as new URL does
    except ValueError:
        return None
    if not name or parts.path or parts.query or parts.fragment or "@" in host:
        return None
    return f"[{name}]" if ":" in name else name


def is_allowed_host(host: str | None) -> bool:
    """Localhost names and plain IP addresses. A page on evil.example whose name was pointed at this computer
    (DNS rebinding) sends Host: evil.example and is refused."""
    name = host_name(host)
    if name is None:
        return False
    return name == "localhost" or name.endswith(".localhost") or bool(_IPV4.match(name)) or name.startswith("[")


async def same_site_guard(req: Request) -> bool:
    if not GUARDED.match(req.path) or not from_another_site(req.headers):
        return False
    await req.send_json(403, {"error": "Only the editor itself can use this."})
    return True
