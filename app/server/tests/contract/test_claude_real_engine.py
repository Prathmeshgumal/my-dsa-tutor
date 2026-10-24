"""What Claude itself receives, checked end to end with the real Claude Code engine.

The server runs its usual engine (the same `claude` program the Node server used), pointed at a stand-in for
Anthropic's API (support/fake_anthropic.py) that writes down every request and answers with scripted replies. So
this compares the actual requests Claude would get, Node against Python: system prompt, tools, every message and
tool result, and the settings that shape the answer. Two turns: tools and an approval, then a follow-up with an
image that resumes the same conversation.

    RECORD_FIXTURES=1 CONTRACT_SERVER=node uv run pytest tests/contract/test_claude_real_engine.py   (re-record)
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import httpx
import pytest

from dsa_server.engine import engine_path
from support.servers import SUPPORT, free_port, start, stop, wait_until_up

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "engine" / "real_api.json"
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
CODE = "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    int n;\n    cin >> n;\n    cout << n * 2 << endl;\n}\n"


def tool(id: str, name: str, /, **args) -> dict:
    return {"type": "tool_use", "id": id, "name": f"mcp__editor__{name}", "input": args}


REPLIES = [
    # Turn 1
    [{"type": "text", "text": "Let me look."}, tool("toolu_01", "list_files"), tool("toolu_02", "read_file", name="two_sum.cpp", start_line=5)],
    [tool("toolu_03", "run_code", name="two_sum.cpp", stdin="5\n"), tool("toolu_04", "read_file", name="two_sum.cpp", start_line=0)],
    [tool("toolu_05", "edit_file", name="two_sum.cpp", old_text="n * 2", new_text="n * 3", explanation="Triple it.")],
    [{"type": "text", "text": "Done: it triples now."}],
    # Turn 2
    [{"type": "text", "text": "Nice picture."}],
]


@pytest.fixture(scope="module")
def engine_and_api(server):
    if not Path(engine_path()).exists():
        pytest.skip("the Claude Code engine isn't installed (npm install in app/)")
    tmp = Path(tempfile.mkdtemp(prefix="real-api-"))
    log, replies = tmp / "api.log", tmp / "replies.json"
    replies.write_text(json.dumps(REPLIES))
    port = free_port()
    api = subprocess.Popen([sys.executable, str(SUPPORT / "fake_anthropic.py"), str(port), str(log), str(replies)])
    wait_until_up(f"http://127.0.0.1:{port}/health", api)
    env = {"ANTHROPIC_BASE_URL": f"http://127.0.0.1:{port}", "ANTHROPIC_API_KEY": "sk-ant-fake-key", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"}
    running = start(server.kind, tmp / "data", extra_env=env, piston_log=tmp / "piston.log")
    yield running, log
    running.close()
    stop(api)


def chat(base: str, request: dict) -> list[dict]:
    events = []
    with httpx.Client(base_url=base, timeout=120) as c, c.stream("POST", "/api/claude/chat", json=request) as r:
        assert r.status_code == 200, r.read()
        for line in r.iter_lines():
            if line.startswith("data: "):
                event = json.loads(line.removeprefix("data: "))
                events.append(event)
                if event["type"] == "approval":
                    c.post("/api/claude/approval", json={"id": event["id"], "approved": True})
    return events


def normalize(value, data: Path):
    """Takes out what differs on every run: temp folders, ids, times."""
    text = json.dumps(value, ensure_ascii=False)
    text = text.replace(str(data), "<data>")
    # The engine also names a temp folder after it (pasted images go there).
    text = text.replace(re.sub(r"[^A-Za-z0-9]", "-", str(data)), "<data-name>")
    ids: dict[str, str] = {}
    text = re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", lambda m: ids.setdefault(m[0], f"<id{len(ids)}>"), text)
    text = re.sub(r"\b[0-9a-f]{64}\b", "<hash>", text)
    text = re.sub(r'"(at|createdAt)": ?\d{13}', r'"\1": "<time>"', text)
    return json.loads(text)


def test_claude_gets_the_same_requests(engine_and_api):
    running, log = engine_and_api
    (running.data / "solutions" / "two_sum.cpp").write_text(CODE)
    context = {"activeFile": {"name": "two_sum.cpp", "content": CODE}, "openFiles": ["two_sum.cpp"]}
    first = chat(running.base, {"message": "Why does it print 10?", "context": context})
    session = next(e["sessionId"] for e in first if e["type"] == "session")
    second = chat(running.base, {"message": "And this?", "sessionId": session, "images": [{"mediaType": "image/png", "data": PNG}], "context": context})
    requests = [json.loads(line) for line in log.read_text().splitlines()]
    got = normalize({"events": [first, second], "api": [r for r in requests if r["path"] != "/health"]}, running.data)

    if os.environ.get("DUMP_TO"):
        Path(os.environ["DUMP_TO"]).write_text(json.dumps(got, indent=1, ensure_ascii=False))
    if os.environ.get("RECORD_FIXTURES"):
        assert running.kind == "node", "fixtures are recorded from the Node server"
        FIXTURE.write_text(json.dumps(got, indent=1, ensure_ascii=False) + "\n")
    expected = json.loads(FIXTURE.read_text())
    assert got["events"] == expected["events"]
    assert len(got["api"]) == len(expected["api"])
    for i, (g, e) in enumerate(zip(got["api"], expected["api"])):
        assert g == e, f"request {i + 1}: {g['method']} {g['path']}"
