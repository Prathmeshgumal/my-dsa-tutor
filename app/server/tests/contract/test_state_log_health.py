"""/api/state (tabs, chats, settings), /api/log(s), and /api/health (the Setup checks)."""

import json
import os
import time

import pytest

from .helpers import ABSENT, JSON, check


class TestState:
    def test_round_trip_keeps_the_exact_text(self, client, data):
        text = '{"state":{"theme":"dark","emoji":"✓"},  "version":1}'
        check(client.put("/api/state/settings", content=text), 204, cache="no-store", ctype=ABSENT, text="")
        assert (data / "state" / "settings.json").read_text() == text
        r = client.get("/api/state")
        check(r, 200, ctype=JSON, cache="no-store")
        body = r.json()
        assert set(body) == {"settings", "workspace", "ai", "problems"}
        assert list(body) == ["settings", "workspace", "ai", "problems"]
        assert body["settings"] == text

    def test_never_saved_is_null(self, client, data):
        (data / "state" / "problems.json").unlink(missing_ok=True)
        assert client.get("/api/state").json()["problems"] is None

    @pytest.mark.parametrize("key", ["nope", "constructor", "Settings", "", "settings/x", "__proto__"])
    def test_unknown_keys(self, client, key):
        check(client.put(f"/api/state/{key}", content="{}"), 404, {"error": "Not found"}, ctype=JSON, cache="no-store")

    def test_wrong_method(self, client):
        check(client.get("/api/state/settings"), 405, {"error": "Method not allowed"}, ctype=JSON, cache="no-store")
        check(client.post("/api/state"), 404, {"error": "Not found"}, ctype=JSON, cache="no-store")

    @pytest.mark.parametrize("body", ["", "nope", "{", "{'a':1}"])
    def test_not_json(self, client, body):
        check(client.put("/api/state/workspace", content=body), 400, {"error": "Expected JSON"}, ctype=JSON, cache="no-store")

    @pytest.mark.parametrize("body", ["1", "null", '"text"', "[1,2]"])
    def test_any_json_is_kept(self, client, body):
        check(client.put("/api/state/problems", content=body), 204)
        assert client.get("/api/state").json()["problems"] == body

    def test_large_chats_are_fine_but_not_too_large(self, client):
        big = json.dumps({"x": "y" * (20 * 1024 * 1024)})
        check(client.put("/api/state/ai", content=big), 204)
        assert client.get("/api/state").json()["ai"] == big
        check(client.put("/api/state/ai", content="[" + " " * (50 * 1024 * 1024) + "]"), 413, {"error": "Too large"}, ctype=JSON, cache="no-store")
        client.put("/api/state/ai", content="null")


class TestLog:
    def test_browser_errors_are_logged_and_tail_returns_them(self, client, data):
        check(client.post("/api/log", json={"level": "warn", "message": "boom", "detail": {"a": 1}}), 204, ctype=ABSENT, text="")
        check(client.post("/api/log", json={"level": "bogus", "message": "two"}), 204)
        check(client.post("/api/log", content="not json"), 204)
        check(client.post("/api/log", json={"message": 5}), 204)
        r = client.get("/api/logs?tail=2")
        check(r, 200, ctype="text/plain; charset=utf-8", cache="no-store")
        lines = [json.loads(line) for line in r.text.split("\n")]
        assert [(e["level"], e["message"]) for e in lines] == [("warn", "[browser] boom"), ("error", "[browser] two")]
        assert lines[0]["detail"] == '{"a":1}' and "detail" not in lines[1]
        assert list(lines[0]) == ["at", "level", "message", "detail"]
        assert lines[0]["at"].endswith("Z") and len(lines[0]["at"]) == 24

    @pytest.mark.parametrize(("query", "count"), [("", 100), ("?tail=abc", 100), ("?tail=0", 100), ("?tail=-5", 1), ("?tail=3", 3), ("?tail=9999", 500)])
    def test_tail_size(self, client, query, count):
        for i in range(105):
            client.post("/api/log", json={"level": "info", "message": f"m{i}"})
        assert len(client.get(f"/api/logs{query}").text.split("\n")) == min(count, len(client.get("/api/logs?tail=500").text.split("\n")))

    def test_long_messages_are_cut(self, client):
        client.post("/api/log", json={"message": "x" * 5000})
        last = json.loads(client.get("/api/logs?tail=1").text)
        assert last["message"] == "[browser] " + "x" * 3990 + "…"

    def test_too_big_is_ignored(self, client):
        before = client.get("/api/logs?tail=1").text
        check(client.post("/api/log", content=json.dumps({"message": "y" * 70_000})), 204)
        assert client.get("/api/logs?tail=1").text == before


class TestHealth:
    def test_reports_piston_claude_and_folders(self, client):
        r = client.get("/api/health")
        check(r, 200, ctype=JSON, cache="no-store")
        assert r.json() == {
            "piston": {
                "ok": True,
                "languages": {"cpp": True, "java": False, "python": True},
                "problem": "Java isn’t installed yet. Run ./start.sh (or: docker compose up -d piston-setup) to install it.",
            },
            "claude": {"signedIn": False, "problem": "Claude isn’t signed in. Run claude setup-token, then ./start.sh and paste the token."},
            "folders": [{"name": n, "ok": True} for n in ["solutions", "notes", "playground", "problems", "state", "logs"]],
        }

    def test_a_login_file_counts_as_signed_in(self, client, data):
        creds = data / "home" / ".claude" / ".credentials.json"
        creds.parent.mkdir(parents=True, exist_ok=True)
        creds.write_text("{}")
        assert client.get("/api/health").json()["claude"] == {"signedIn": True}
        creds.unlink()

    def test_an_unwritable_folder_is_reported(self, client, data):
        if os.geteuid() == 0:
            pytest.skip("root can write anywhere")
        folder = data / "notes"
        folder.chmod(0o500)
        try:
            notes = next(f for f in client.get("/api/health").json()["folders"] if f["name"] == "notes")
            assert notes == {"name": "notes", "ok": False, "problem": "The notes folder isn’t writable, so work there won’t be saved."}
        finally:
            folder.chmod(0o755)

    def test_a_missing_folder_is_reported(self, client, data):
        import shutil

        shutil.rmtree(data / "logs")
        try:
            logs = next(f for f in client.get("/api/health").json()["folders"] if f["name"] == "logs")
            assert logs == {"name": "logs", "ok": False, "problem": "The logs folder doesn’t exist, so work there won’t be saved."}
        finally:
            (data / "logs").mkdir()
            time.sleep(0.05)

    def test_leaves_no_probe_files(self, client, data):
        client.get("/api/health")
        assert not [p for p in data.rglob(".write-check-*")]
