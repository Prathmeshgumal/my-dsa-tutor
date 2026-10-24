"""What reaches the Claude engine, and what the page gets back, checked against a record taken from the Node server.

The server is pointed at a stand-in engine (support/fake_claude.py) that writes down everything the server's Agent
SDK sends it: the command line, settings, system prompt, the 20 editor tools as the engine sees them, the prompt,
and every tool result. It then plays back a scripted reply. Together with the events the page receives and what
was sent to Piston, that is everything that decides the quality of Claude's answers, so it must match exactly.

    RECORD_FIXTURES=1 CONTRACT_SERVER=node uv run pytest tests/contract/test_claude_engine.py   (re-record from Node)
"""

import json
import os
import re
import tempfile
from pathlib import Path

import httpx
import pytest

from support.servers import SUPPORT, start

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "engine"
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

TWO_SUM = """#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    cin >> n;
    cout << n * 2 << endl;
}
"""
SOLUTION = """class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        return {};
    }
};
"""


# The scripted reply, in the engine's own message shapes.

def stream(event: dict, parent=None) -> dict:
    return {"emit": {"type": "stream_event", "uuid": "00000000-0000-4000-8000-0000000000cc", "parent_tool_use_id": parent, "event": event}}


def text_block(index: int, *chunks: str, parent=None) -> list[dict]:
    return [
        stream({"type": "content_block_start", "index": index, "content_block": {"type": "text", "text": ""}}, parent),
        *[stream({"type": "content_block_delta", "index": index, "delta": {"type": "text_delta", "text": c}}, parent) for c in chunks],
        stream({"type": "content_block_stop", "index": index}, parent),
    ]


def tool_block(index: int, name: str, *chunks: str) -> list[dict]:
    return [
        stream({"type": "content_block_start", "index": index, "content_block": {"type": "tool_use", "id": f"toolu_{index}", "name": f"mcp__editor__{name}", "input": {}}}),
        *[stream({"type": "content_block_delta", "index": index, "delta": {"type": "input_json_delta", "partial_json": c}}) for c in chunks],
        stream({"type": "content_block_stop", "index": index}),
    ]


def assistant(*content: dict, parent=None) -> dict:
    return {"emit": {"type": "assistant", "uuid": "00000000-0000-4000-8000-0000000000dd", "parent_tool_use_id": parent, "message": {"id": "msg_1", "type": "message", "role": "assistant", "model": "fake", "content": list(content), "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 1, "output_tokens": 1}}}}


def use(tool: str, /, **args) -> dict:
    return {"type": "tool_use", "id": "toolu_x", "name": f"mcp__editor__{tool}", "input": args}


def call(tool: str, /, **args) -> dict:
    return {"call": tool, "args": args}


def result(subtype="success", is_error=False, errors=None) -> dict:
    body = {"type": "result", "subtype": subtype, "is_error": is_error, "duration_ms": 1, "duration_api_ms": 1, "num_turns": 1, "total_cost_usd": 0, "usage": {}, "uuid": "00000000-0000-4000-8000-0000000000ee", "permission_denials": []}
    if subtype == "success":
        body["result"] = "ok"
    if errors is not None:
        body["errors"] = errors
    return {"emit": body}


VIZ_STEPS = [
    {"line": 5, "note": "Read n", "vars": {"n": 5}},
    {"line": 6, "note": "Print double", "vars": {"n": 5}, "output": "10\n", "calc": "n * 2 = 10"},
]

SCENARIOS = {
    # Reading: every read-only tool, a long tool input (progress events), and text before and after the tools.
    "reads": {
        "request": {
            "message": "  Why does this print 10?  ",
            "sessionId": "11111111-1111-4111-8111-111111111111",
            "context": {
                "activeFile": {"name": "two_sum.cpp", "content": TWO_SUM},
                "openFiles": ["two_sum.cpp", "bfs.py", 5],
                "lastRun": {"file": "two_sum.cpp", "stdin": "5\n", "result": {"status": "success", "statusText": "Accepted", "stdout": "10\n", "stderr": "", "compileOutput": "", "timeMs": 3, "memoryKb": 1184}},
                "openNote": {"name": "note-1.md", "title": "Arrays"},
                "openProblem": {"slug": "two-sum", "title": "Two Sum", "file": "brute-force.cpp"},
            },
        },
        "script": [
            *text_block(0, "Let me ", "look."),
            *tool_block(1, "read_file", '{"name": "' + "x" * 900, "y" * 900, "z" * 800 + '"}'),
            assistant({"type": "text", "text": "Let me look."}, use("read_file", name="two_sum.cpp")),
            call("read_file", name="two_sum.cpp"),
            call("read_file", name="two_sum.cpp", start_line=5, end_line=6),
            call("read_file", name="missing.cpp"),
            call("get_editor_state"),
            call("list_files"),
            call("get_last_run"),
            call("list_notes"),
            call("read_note", name="note-1.md"),
            call("list_problems"),
            call("get_problem", slug="two-sum"),
            call("get_problem"),
            call("list_attempts", slug="two-sum"),
            *text_block(2, "It doubles ", "n."),
            # A subagent's messages aren't shown.
            *text_block(0, "hidden", parent="toolu_9"),
            assistant(use("read_file", name="hidden.cpp"), parent="toolu_9"),
            assistant({"type": "text", "text": "It doubles n."}),
            result(),
        ],
    },
    # Changes: each proposal waits for the person's answer.
    "changes": {
        "request": {"message": "fix it", "context": {"activeFile": {"name": "two_sum.cpp", "content": TWO_SUM}, "openFiles": ["two_sum.cpp"]}},
        "answers": [True, False, True, True, True, True, True, True],
        "script": [
            assistant(use("edit_file", name="two_sum.cpp")),
            call("edit_file", name="two_sum.cpp", old_text="n * 2", new_text="n * 3", explanation="Triple it."),
            call("edit_file", name="two_sum.cpp", old_text="not there", new_text="x", explanation="Nope."),
            call("create_file", name="new.cpp", content="int main() {}\n", explanation="A new file."),
            call("create_note", content="# Doubling\n\nMultiply by 2.\n", explanation="Save it."),
            call("edit_note", name="note-1.md", old_text="Arrays", new_text="Arrays and vectors", explanation="Rename."),
            call("add_test_case", slug="two-sum", input=["[3,3]", "6"], expected="[0,1]", explanation="Duplicates."),
            call("edit_solution", slug="two-sum", old_text="return {};", new_text="return {0, 1};", explanation="Start."),
            call("save_code_version", slug="two-sum", name="brute-force.cpp", content=SOLUTION, explanation="Brute force."),
            call(
                "create_problem",
                title="Reverse String",
                difficulty="easy",
                description="Reverse a string.",
                params=[{"name": "s", "type": "string"}],
                compare="exact",
                tests=[{"input": ['"abc"'], "expected": '"cba"', "example": True}],
                starter="class Solution {\npublic:\n    string reverseString(string s) {\n        return s;\n    }\n};\n",
                driver="",
                explanation="Practice.",
            ),
            call("create_file", name="bad.txt", content="", explanation="Bad name."),
            result(),
        ],
    },
    # Runs: code and tests go to Piston (the C++ harness is checked through what Piston was sent); dry runs.
    "runs": {
        "request": {"message": "run it", "context": {"activeFile": {"name": "two_sum.cpp", "content": TWO_SUM}, "openFiles": [], "openProblem": {"slug": "two-sum", "title": "Two Sum"}}},
        "script": [
            call("run_code", name="two_sum.cpp", stdin="5\n"),
            call("run_code"),
            call("run_tests", slug="two-sum"),
            call("run_tests", slug="two-sum", file="solution.cpp", all=True),
            call("create_visualization", title="Dry run", file="two_sum.cpp", steps=VIZ_STEPS),
            call("create_visualization", title="Linked", problem="two-sum", steps=VIZ_STEPS, expected="10"),
            call("create_visualization", title="Broken", steps=[]),
            result("error_max_turns", True, []),
        ],
    },
    # Images, and a reply that ends in an error.
    "images": {
        "request": {"message": "", "images": [{"mediaType": "image/png", "data": PNG}, {"mediaType": "image/jpeg", "data": PNG}], "context": {}},
        "script": [*text_block(0, "A picture."), result("error_during_execution", True, ["boom", "bang"])],
    },
}


@pytest.fixture(scope="module")
def engine(server):
    tmp = Path(tempfile.mkdtemp(prefix="engine-"))
    log, script, piston_log = tmp / "engine.log", tmp / "script.json", tmp / "piston.log"
    running = start(
        server.kind,
        tmp / "data",
        extra_env={"DSA_CLAUDE_CLI": str(SUPPORT / "fake_claude.py"), "FAKE_CLAUDE_LOG": str(log), "FAKE_CLAUDE_SCRIPT": str(script)},
        piston_log=piston_log,
    )
    yield running, log, script, piston_log
    running.close()


def seed(base: str, data: Path) -> None:
    """The same files and problem for every scenario."""
    for folder in ("solutions", "notes", "playground", "problems"):
        for p in sorted((data / folder).glob("*"), reverse=True):
            if p.is_dir():
                import shutil

                shutil.rmtree(p)
            else:
                p.unlink()
    (data / "solutions" / "two_sum.cpp").write_text(TWO_SUM)
    (data / "solutions" / "bfs.py").write_text("print('bfs')\n")
    (data / "notes" / "note-1.md").write_text("# Arrays\n\nContiguous memory.\n")
    problem = {
        "title": "Two Sum",
        "difficulty": "easy",
        "description": "Find two indices that add up to target.",
        "params": [{"name": "nums", "type": "vector<int>"}, {"name": "target", "type": "int"}],
        "compare": "any_order",
        "tests": [{"input": ["[2,7,11,15]", "9"], "expected": "[0,1]", "example": True, "addedBy": "problem"}],
        "createdAt": 1700000000000,
    }
    r = httpx.post(f"{base}/api/claude/apply", json={"change": {"type": "create_problem", "problem": problem, "starter": SOLUTION, "driver": ""}})
    assert r.json()["effects"][0]["slug"] == "two-sum", r.text


def run_turn(base: str, request: dict, answers: list[bool]) -> list[dict]:
    """Sends the chat like the page does, answering each proposal in turn, and returns every event."""
    events, answers = [], list(answers)
    with httpx.Client(base_url=base, timeout=60) as c, c.stream("POST", "/api/claude/chat", json=request) as r:
        assert r.status_code == 200, r.read()
        for line in r.iter_lines():
            if line.startswith("data: "):
                event = json.loads(line.removeprefix("data: "))
                events.append(event)
                if event["type"] == "approval":
                    c.post("/api/claude/approval", json={"id": event["id"], "approved": answers.pop(0)})
    assert not answers, "unused answers"
    return events


def normalize(value, data: Path):
    """Takes out what differs on every run: ids, temp folders, times."""
    text = json.dumps(value, ensure_ascii=False)
    text = text.replace(str(data), "<data>")
    ids: dict[str, str] = {}
    text = re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", lambda m: ids.setdefault(m[0], m[0] if m[0].startswith(("00000000", "11111111")) else f"<id{len(ids)}>"), text)
    text = re.sub(r'"(at|createdAt)": ?\d{13}', r'"\1": "<time>"', text)
    text = re.sub(r"\b1[7-9]\d{11}\b", "<time>", text)
    return json.loads(text)


@pytest.mark.parametrize("name", list(SCENARIOS))
def test_engine_sees_and_page_gets_the_same(engine, name):
    running, log, script, piston_log = engine
    scenario = SCENARIOS[name]
    seed(running.base, running.data)
    script.write_text(json.dumps(scenario["script"]))
    log.unlink(missing_ok=True)
    piston_log.unlink(missing_ok=True)

    events = run_turn(running.base, scenario["request"], scenario.get("answers", []))
    record = [json.loads(line) for line in log.read_text().splitlines()]
    sent_to_piston = [json.loads(line) for line in piston_log.read_text().splitlines()] if piston_log.exists() else []
    files = {str(p.relative_to(running.data)): p.read_text() for p in sorted(running.data.rglob("*")) if p.is_file() and "home" not in p.parts and "logs" not in p.parts and p.parent.name != "state"}
    got = normalize({"events": events, "engine": record, "piston": sent_to_piston, "files": files}, running.data)

    fixture = FIXTURES / f"{name}.json"
    if os.environ.get("RECORD_FIXTURES"):
        assert running.kind == "node", "fixtures are recorded from the Node server"
        fixture.parent.mkdir(parents=True, exist_ok=True)
        fixture.write_text(json.dumps(got, indent=1, ensure_ascii=False) + "\n")
    expected = json.loads(fixture.read_text())
    # Section by section, so a difference is easy to find.
    for section in ("events", "piston", "files"):
        assert got[section] == expected[section], section
    assert len(got["engine"]) == len(expected["engine"])
    for g, e in zip(got["engine"], expected["engine"]):
        assert g == e, g["kind"]
