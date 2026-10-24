"""/api/claude: chat turns as a numbered event stream, reconnecting, Stop, and approvals.

These run with no Claude login, so a turn ends with the same "not logged in" error every time and costs nothing.
"""

import httpx
import pytest

from .helpers import ABSENT, check

NO_LONGER = {"error": "That reply is no longer available (the editor may have restarted)."}


def parse(text: str) -> list[tuple[int, dict]]:
    import json

    out = []
    for block in text.split("\n\n"):
        if not block:
            continue
        id_line, data_line = block.split("\n")
        out.append((int(id_line.removeprefix("id: ")), json.loads(data_line.removeprefix("data: "))))
    return out


@pytest.fixture
def turn(client):
    r = client.post("/api/claude/chat", json={"message": "hi"}, timeout=60)
    check(r, 200, ctype="text/event-stream", cache="no-cache")
    return r


def test_a_turn_without_a_login(turn):
    assert turn.headers["connection"] == "keep-alive"
    assert turn.text.endswith("\n\n")
    events = parse(turn.text)
    assert [i for i, _ in events] == [1, 2, 3, 4]
    assert events[0][1]["type"] == "turn" and len(events[0][1]["turnId"]) == 36
    assert events[1][1]["type"] == "session" and len(events[1][1]["sessionId"]) == 36
    assert [e for _, e in events[2:]] == [
        {"type": "error", "message": "Claude stopped with an error."},
        {"type": "error", "message": "Claude Code returned an error result: Not logged in · Please run /login"},
    ]


def test_reconnecting_replays_what_was_missed(client, turn):
    events = parse(turn.text)
    turn_id = events[0][1]["turnId"]
    for after, expected in [("", events), ("?after=0", events), ("?after=2", events[2:]), ("?after=4", []), ("?after=99", []), ("?after=-3", events), ("?after=abc", events)]:
        r = client.get(f"/api/claude/turns/{turn_id}{after}")
        check(r, 200, ctype="text/event-stream", cache="no-cache")
        assert parse(r.text) == expected


def test_stop(client, turn):
    turn_id = parse(turn.text)[0][1]["turnId"]
    check(client.post(f"/api/claude/turns/{turn_id}/stop"), 204, ctype=ABSENT, text="")
    check(client.post("/api/claude/turns/nope/stop"), 404, ctype=ABSENT, text="")


def test_unknown_turns(client):
    check(client.get("/api/claude/turns/nope"), 404, NO_LONGER, ctype=ABSENT)
    check(client.post("/api/claude/turns/nope"), 404, {"error": "Not found"})
    check(client.get("/api/claude/turns/nope/stop"), 404, {"error": "Not found"})


def test_images_still_start_a_turn(client):
    png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    r = client.post("/api/claude/chat", json={"images": [{"mediaType": "image/png", "data": png}]}, timeout=60)
    check(r, 200, ctype="text/event-stream")
    assert parse(r.text)[0][1]["type"] == "turn"


@pytest.mark.parametrize(
    ("body", "error"),
    [
        (None, "Expected a JSON body"),
        ("nope", "Expected a JSON body"),
        ({}, '"message" is required'),
        ([], '"message" is required'),
        ({"message": "   "}, '"message" is required'),
        ({"message": 5}, '"message" is required'),
        ({"message": "hi", "images": "x"}, '"images" must be a list'),
    ],
)
def test_bad_chats(client, body, error):
    r = client.post("/api/claude/chat", content=body) if isinstance(body, str) else client.post("/api/claude/chat", json=body)
    check(r, 400, {"error": error}, ctype=ABSENT)


@pytest.mark.parametrize("body", [None, {}, {"id": 1}, {"id": "nope", "approved": True}])
def test_unknown_approvals(client, body):
    check(client.post("/api/claude/approval", json=body), 404, ctype=ABSENT, text="")


@pytest.mark.parametrize("url", ["/api/claude/chat", "/api/claude/approval", "/api/claude/apply"])
def test_only_post(client, url):
    check(client.get(url), 404, {"error": "Not found"})


def test_a_turn_outlives_the_browser_that_started_it(server):
    with httpx.Client(base_url=server.base, timeout=60) as c:
        with c.stream("POST", "/api/claude/chat", json={"message": "hi"}) as r:
            lines = r.iter_lines()
            assert next(lines) == "id: 1"
            turn_id = parse_one(next(lines))["turnId"]
        # The page went away after the first event; the turn still ran to the end and can be picked up.
        r = c.get(f"/api/claude/turns/{turn_id}")
        events = parse(r.text)
        assert [i for i, _ in events] == [1, 2, 3, 4]
        assert events[-1][1]["type"] == "error"


def parse_one(line: str) -> dict:
    import json

    return json.loads(line.removeprefix("data: "))
