"""Signing in and out of Claude from the Setup dialog. A stand-in `claude` plays the sign-in, so no real account is
touched: it keeps its pretend login in whatever CLAUDE_CONFIG_DIR the server gives it."""

import json
import tempfile
from pathlib import Path

import httpx
import pytest

from support.fake_claude import GOOD_CODE
from support.servers import SUPPORT, start


@pytest.fixture(scope="module")
def editor():
    tmp = Path(tempfile.mkdtemp(prefix="account-"))
    log = tmp / "engine.log"
    running = start(
        tmp / "data",
        # A login token from outside must not count: only the Setup dialog's login does.
        extra_env={"DSA_CLAUDE_CLI": str(SUPPORT / "fake_claude.py"), "FAKE_CLAUDE_LOG": str(log), "CLAUDE_CODE_OAUTH_TOKEN": "from-env"},
    )
    yield running, log
    running.close()


@pytest.fixture
def client(editor):
    running, log = editor
    log.unlink(missing_ok=True)
    with httpx.Client(base_url=running.base, timeout=30) as c:
        yield c
        c.post("/api/claude/account/logout")


def records(log: Path, kind: str) -> list:
    return [r["value"] for r in map(json.loads, log.read_text().splitlines()) if r["kind"] == kind] if log.exists() else []


def sign_in(c: httpx.Client, code: str = GOOD_CODE) -> httpx.Response:
    started = c.post("/api/claude/account/login")
    assert started.status_code == 200, started.text
    return c.post("/api/claude/account/login/code", json={"code": code})


def test_signed_out_to_start_with_and_an_outside_token_doesnt_count(client, editor):
    _, log = editor
    r = client.get("/api/claude/account")
    assert r.status_code == 200, r.text
    assert r.json() == {"signedIn": False}
    assert r.headers["cache-control"] == "no-store"
    [env] = records(log, "env")
    assert "CLAUDE_CODE_OAUTH_TOKEN" not in env


def test_the_login_is_the_editors_own_folder(client, editor):
    running, log = editor
    client.get("/api/claude/account")
    [env] = records(log, "env")
    assert env["CLAUDE_CONFIG_DIR"] == str(running.data / "state" / "claude")
    assert env["BROWSER"] == "true"


def test_sign_in_gives_the_link_then_takes_the_code(client, editor):
    running, log = editor
    started = client.post("/api/claude/account/login")
    assert started.json() == {"url": "https://claude.com/cai/oauth/authorize?code=true&client_id=fake&state=fake-state"}
    r = client.post("/api/claude/account/login/code", json={"code": f"  {GOOD_CODE}  "})
    assert r.status_code == 200, r.text
    assert r.json() == {"signedIn": True, "method": "claude.ai", "email": "fake@example.com", "plan": "pro", "org": "Fake Org"}
    assert records(log, "login_code") == [GOOD_CODE]
    assert (running.data / "state" / "claude" / "fake-login.json").exists()
    assert client.get("/api/claude/account").json()["email"] == "fake@example.com"


def test_a_wrong_code_is_explained_and_the_sign_in_must_start_again(client):
    r = sign_in(client, "nope")
    assert r.status_code == 400
    assert r.json() == {"error": "Claude didn’t accept that code. Copy the whole code from the sign-in page (or start again: each code works once)."}
    again = client.post("/api/claude/account/login/code", json={"code": GOOD_CODE})
    assert again.status_code == 400
    assert again.json() == {"error": "That sign-in has ended. Click Sign in to start again."}
    assert client.get("/api/claude/account").json() == {"signedIn": False}


@pytest.mark.parametrize("body", [{}, {"code": ""}, {"code": "   "}, {"code": 5}, {"code": "a\nb"}, {"code": "x" * 2001}])
def test_a_missing_or_odd_code_is_refused_before_claude_sees_it(client, editor, body):
    _, log = editor
    client.post("/api/claude/account/login")
    r = client.post("/api/claude/account/login/code", json=body)
    assert r.status_code == 400
    assert r.json() == {"error": "Paste the code from the sign-in page."}
    assert records(log, "login_code") == []
    client.post("/api/claude/account/login/cancel")


def test_a_code_with_no_sign_in_started(client):
    client.post("/api/claude/account/login/cancel")
    r = client.post("/api/claude/account/login/code", json={"code": GOOD_CODE})
    assert r.status_code == 400
    assert "Click Sign in to start again" in r.json()["error"]


def test_cancel_drops_the_sign_in(client):
    client.post("/api/claude/account/login")
    assert client.post("/api/claude/account/login/cancel").status_code == 204
    assert client.post("/api/claude/account/login/code", json={"code": GOOD_CODE}).status_code == 400


def test_starting_again_replaces_the_first_sign_in(client):
    client.post("/api/claude/account/login")
    r = sign_in(client)
    assert r.status_code == 200, r.text
    assert r.json()["signedIn"] is True


def test_sign_out(client, editor):
    running, _ = editor
    assert sign_in(client).status_code == 200
    r = client.post("/api/claude/account/logout")
    assert r.status_code == 200, r.text
    assert r.json() == {"signedIn": False}
    assert not (running.data / "state" / "claude" / "fake-login.json").exists()


def test_signing_in_or_out_asks_for_the_models_again(client, editor):
    _, log = editor
    assert client.get("/api/claude/models").status_code == 200
    assert client.get("/api/claude/models").status_code == 200
    asked = len([a for a in records(log, "argv") if a[:1] != ["auth"]])
    assert asked == 1
    assert sign_in(client).status_code == 200
    assert client.get("/api/claude/models").status_code == 200
    assert len([a for a in records(log, "argv") if a[:1] != ["auth"]]) == 2


def test_other_methods_arent_routes(client):
    assert client.post("/api/claude/account").status_code == 404
    assert client.get("/api/claude/account/logout").status_code == 404
