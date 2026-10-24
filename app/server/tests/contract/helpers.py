import json

import httpx

ABSENT = object()
"""For `ctype`/`cache`: the header must not be sent at all."""


def check(r: httpx.Response, status: int, body=None, *, ctype=None, cache=None, text=None) -> None:
    """Checks a response the way the page sees it: status, JSON body, and the headers that matter."""
    assert r.status_code == status, f"{r.request.method} {r.request.url} → {r.status_code}: {r.text[:300]}"
    if body is not None:
        assert json.loads(r.text) == body
    if text is not None:
        assert r.text == text
    if ctype is ABSENT:
        assert "content-type" not in r.headers, r.headers.get("content-type")
    elif ctype is not None:
        assert r.headers.get("content-type") == ctype
    if cache is ABSENT:
        assert "cache-control" not in r.headers, r.headers.get("cache-control")
    elif cache is not None:
        assert r.headers.get("cache-control") == cache


JSON = "application/json"
