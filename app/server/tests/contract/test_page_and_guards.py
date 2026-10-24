"""The built page, and the two checks every request passes: the Host name, and coming from the editor itself."""

from pathlib import Path

import pytest

from .helpers import ABSENT, JSON, check

HTML = "text/html; charset=utf-8"
NOT_FOUND = {"error": "Not found"}


def asset(dist: Path, suffix: str) -> Path:
    return next(p for p in sorted((dist / "assets").iterdir()) if p.suffix == suffix)


@pytest.mark.parametrize("url", ["/", "/problems/two-sum", "/x/y/z", "/?q=1"])
def test_page_for_any_address_so_reloads_work(client, dist, url):
    r = client.get(url)
    check(r, 200, ctype=HTML, cache="no-cache")
    assert r.content == (dist / "index.html").read_bytes()
    assert r.headers["content-length"] == str(len(r.content))


def test_head_sends_headers_only(client):
    r = client.head("/")
    check(r, 200, ctype=HTML, cache="no-cache")
    assert r.content == b""


@pytest.mark.parametrize(
    ("suffix", "ctype"),
    [(".js", "text/javascript; charset=utf-8"), (".css", "text/css; charset=utf-8"), (".woff2", "font/woff2")],
)
def test_built_files_are_cached_for_good(client, dist, suffix, ctype):
    file = asset(dist, suffix)
    r = client.get(f"/assets/{file.name}")
    check(r, 200, ctype=ctype, cache="public, max-age=31536000, immutable")
    assert r.content == file.read_bytes()


def test_other_files_are_checked_each_time(client, dist):
    r = client.get("/favicon.svg")
    check(r, 200, ctype="image/svg+xml", cache="no-cache")
    assert r.content == (dist / "favicon.svg").read_bytes()


@pytest.mark.parametrize("url", ["/assets/nope.js", "/nope.png", "/..%2f..%2fetc%2fpasswd", "/%E0%A4%A"])
def test_missing_files_are_404_not_the_page(client, url):
    check(client.get(url), 404, NOT_FOUND, ctype=JSON)


def test_nothing_outside_the_page_is_served(client):
    r = client.get("/%2e%2e/%2e%2e/etc/passwd")
    assert "root:" not in r.text
    check(r, 200, ctype=HTML)


def test_only_get_and_head_for_the_page(client):
    check(client.post("/"), 405, {"error": "Method not allowed"}, ctype=JSON)


@pytest.mark.parametrize("url", ["/api", "/api/", "/api/nope", "/api/claude/chat", "/api/claude/turns/abc/stop"])
def test_unknown_api_routes_are_a_json_404(client, url):
    check(client.get(url), 404, NOT_FOUND, ctype=JSON)


@pytest.mark.parametrize("host", ["evil.example", "evil.example:5199", "localhost.evil.example"])
@pytest.mark.parametrize("url", ["/", "/api/files", "/piston/runtimes"])
def test_other_host_names_are_refused(client, host, url):
    check(client.get(url, headers={"host": host}), 403, {"error": "Blocked: open the editor at localhost."}, ctype=JSON)


@pytest.mark.parametrize("host", ["localhost", "localhost:5199", "editor.localhost:1", "127.0.0.1", "[::1]:5199", "192.168.1.20"])
def test_local_host_names_are_allowed(client, host):
    check(client.get("/api/files", headers={"host": host}), 200)


@pytest.mark.parametrize(
    "headers",
    [{"sec-fetch-site": "cross-site"}, {"sec-fetch-site": "same-site"}, {"origin": "http://localhost:1"}, {"origin": "garbage"}],
)
@pytest.mark.parametrize("url", ["/api/files", "/api/state", "/piston/runtimes", "/api/claude/chat"])
def test_other_sites_cant_use_the_api_or_piston(client, headers, url):
    check(client.get(url, headers=headers), 403, {"error": "Only the editor itself can use this."}, ctype=JSON)


def test_other_sites_can_still_load_the_page(client):
    check(client.get("/", headers={"sec-fetch-site": "cross-site"}), 200, ctype=HTML)


@pytest.mark.parametrize("headers", [{"sec-fetch-site": "same-origin"}, {"sec-fetch-site": "none"}])
def test_the_editor_itself_and_typed_addresses_are_allowed(client, headers):
    check(client.get("/api/files", headers=headers), 200)


def test_same_origin_header_is_allowed(client, server):
    check(client.get("/api/files", headers={"origin": server.base}), 200)


def test_responses_carry_no_cache_header_unless_set(client):
    check(client.get("/api/files"), 200, ctype=JSON, cache=ABSENT)
