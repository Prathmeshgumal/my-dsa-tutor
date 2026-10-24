"""Checking Claude's tool input: the server must accept, clean up and reject exactly what the Node server's zod
schemas did, with the same error text, since Claude reads that text to fix its call.

The answers were recorded from the Node server's real tool definitions before it was removed, so they can't be
re-recorded. A deliberate change to a tool's input means editing the matching cases in the fixture.
"""

import copy
import json
import random
from pathlib import Path

from dsa_server.tool_inputs import INPUTS, check_input
from dsa_server.web import dumps, loads

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "tool_inputs.json"

STEP = {
    "line": 2,
    "note": "n",
    "vars": {"b": 1, "a": "x", "10": None, "2": True},
    "structures": [
        {"kind": "array", "name": "a", "values": [1, "x", None], "pointers": {"i": 0}, "highlight": [1], "swapped": [0], "done": [2], "capacity": 4},
        {"kind": "grid", "name": "g", "rows": [[1, 2], [3, 4]], "rowLabels": ["r"], "colLabels": ["c"], "current": [0, 1], "highlight": [[1, 1]]},
        {"kind": "map", "name": "m", "entries": [[1, "a"], ["k", None]], "highlight": [1]},
        {"kind": "stack", "name": "s", "values": [1, 2], "highlight": [0]},
        {"kind": "queue", "name": "q", "values": [], "highlight": []},
        {"kind": "linked_list", "name": "l", "nodes": [1, 2], "pointers": {"slow": 0, "prev": None}, "highlight": [1], "cycleTo": 0},
        {"kind": "tree", "name": "t", "nodes": [1, None, 2], "highlight": [0], "done": [2], "pointers": {"cur": None}},
        {"kind": "graph", "name": "gr", "nodes": ["a", "b"], "edges": [["a", "b"], ["b", "a", 3]], "directed": True, "current": "a", "visited": ["a"], "activeEdges": [["a", "b"]]},
    ],
    "output": "o",
    "mistake": False,
    "moves": [{"from": "a[0]", "to": "a[1]", "label": "swap"}],
    "check": {"expr": "1 < 2", "result": True},
    "calc": "c",
    "loop": "l",
    "callStack": ["main()"],
    "phase": "p",
}
VALID = {
    "get_editor_state": {},
    "list_files": {},
    "read_file": {"name": "a.cpp", "start_line": 1, "end_line": 3},
    "get_last_run": {},
    "run_code": {"name": "a.cpp", "stdin": "1"},
    "edit_file": {"name": "a.cpp", "old_text": "a", "new_text": "b", "explanation": "e"},
    "create_file": {"name": "a.cpp", "content": "c", "explanation": "e"},
    "list_notes": {},
    "read_note": {"name": "note-1.md"},
    "create_note": {"content": "# T", "explanation": "e"},
    "edit_note": {"name": "note-1.md", "old_text": "a", "new_text": "b", "explanation": "e"},
    "create_visualization": {"title": "t", "file": "a.cpp", "problem": "p", "input": "i", "expected": "x", "steps": [STEP]},
    "list_problems": {},
    "get_problem": {"slug": "two-sum"},
    "create_problem": {
        "title": "T",
        "difficulty": "easy",
        "description": "d",
        "params": [{"name": "n", "type": "int"}],
        "compare": "any_order",
        "tests": [{"input": ["1"], "expected": "2", "example": True}],
        "starter": "s",
        "driver": "d",
        "explanation": "e",
    },
    "add_test_case": {"slug": "s", "input": ["1"], "expected": "2", "explanation": "e"},
    "edit_solution": {"slug": "s", "file": "solution.cpp", "old_text": "a", "new_text": "b", "explanation": "e"},
    "run_tests": {"slug": "s", "file": "solution.cpp", "all": True},
    "save_code_version": {"slug": "s", "name": "b.cpp", "content": "c", "explanation": "e"},
    "list_attempts": {"slug": "s"},
}
ODD_VALUES = [None, True, False, 0, -1, 1, 2.0, 1.5, -0.5, 1e300, -1e300, 2**60, "", "x", "easy", "array", [], [1], [1, 2], [1, 2, 3], ["a", "b"], {}, {"a": 1}, {"kind": "array"}, {"kind": "zzz"}]


def containers(value) -> list:
    """Every dict and list inside value, value included."""
    found = [value] if isinstance(value, (dict, list)) else []
    for child in value.values() if isinstance(value, dict) else value if isinstance(value, list) else []:
        found += containers(child)
    return found


def mutate(value, rng: random.Random):
    """One random change at a random place inside value: a key dropped or added, or a value swapped for an odd one."""
    target = rng.choice(containers(value))
    roll = rng.random()
    if isinstance(target, dict):
        if target and roll < 0.25:
            del target[rng.choice(list(target))]
        elif not target or roll < 0.4:
            target[rng.choice(["extra", "7", "0", "kind", "name"])] = copy.deepcopy(rng.choice(ODD_VALUES))
        else:
            target[rng.choice(list(target))] = copy.deepcopy(rng.choice(ODD_VALUES))
    elif not target or roll < 0.2:
        target.append(copy.deepcopy(rng.choice(ODD_VALUES)))
    elif roll < 0.3:
        target.pop()
    else:
        target[rng.randrange(len(target))] = copy.deepcopy(rng.choice(ODD_VALUES))


def cases() -> list[tuple[str, object]]:
    rng = random.Random(7)
    out: list[tuple[str, object]] = [(tool, copy.deepcopy(args)) for tool, args in VALID.items()]
    for n in range(3000):
        # Half the cases are dry runs: their input is the deepest by far.
        tool = "create_visualization" if n % 2 else rng.choice(list(VALID))
        args = copy.deepcopy(VALID[tool])
        for _ in range(rng.randint(1, 4)):
            mutate(args, rng)
        out.append((tool, args))
    return out


def python_answer(tool: str, args) -> str:
    value, error = check_input(tool, args)
    return error if error is not None else dumps(value)


def test_tool_list_matches_the_checks():
    tools = json.loads((Path(__file__).resolve().parents[2] / "src" / "dsa_server" / "data" / "editor_tools.json").read_text())["tools"]
    assert [t["name"] for t in tools] == list(INPUTS)


def test_inputs_are_checked_like_node():
    inputs = cases()
    # Read the way the engine's messages are read: numbers as JavaScript has them.
    recorded = loads(FIXTURE.read_text())
    assert len(recorded) == len(inputs)
    mismatches = [(tool, args, expected, python_answer(tool, args)) for tool, args, expected in recorded if python_answer(tool, args) != expected]
    assert not mismatches, mismatches[:3]


def test_create_problem_takes_an_optional_link():
    args = {**VALID["create_problem"], "link": "https://leetcode.com/problems/two-sum/"}
    value, error = check_input("create_problem", args)
    assert error is None and value["link"] == "https://leetcode.com/problems/two-sum/"
    assert list(value)[-2:] == ["link", "explanation"]
    assert "link" not in check_input("create_problem", VALID["create_problem"])[0]
    _, error = check_input("create_problem", {**VALID["create_problem"], "link": 5})
    assert error is not None and '"link"' in error
    tools = json.loads((Path(__file__).resolve().parents[2] / "src" / "dsa_server" / "data" / "editor_tools.json").read_text())["tools"]
    schema = next(t for t in tools if t["name"] == "create_problem")["inputSchema"]
    assert schema["properties"]["link"]["type"] == "string" and "link" not in schema["required"]


def test_claude_sees_the_link_when_there_is_one():
    from dsa_server.editor_tools import describe_problem

    problem = {"title": "Two Sum", "difficulty": "easy", "description": "d", "params": [{"name": "n", "type": "int"}], "compare": "exact", "tests": []}
    entry = {"slug": "two-sum", "solved": False, "problem": problem, "solution": "", "versions": [], "driver": ""}
    assert "Link:" not in describe_problem(entry, [], [])
    lines = describe_problem({**entry, "problem": {**problem, "link": "https://leetcode.com/problems/two-sum/"}}, [], []).splitlines()
    assert lines[1] == "Link: https://leetcode.com/problems/two-sum/"
