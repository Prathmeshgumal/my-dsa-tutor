"""Choosing Claude's model and effort: the list comes from the engine, and the choice reaches it as --model / --effort."""

import json
import tempfile
from pathlib import Path

import httpx
import pytest

from support.servers import SUPPORT, start

MODELS = [
    {"value": "default", "resolvedModel": "claude-opus-5-5", "displayName": "Default (recommended)", "description": "Opus 5.5 · Best for everyday, complex tasks", "supportsEffort": True, "supportedEffortLevels": ["low", "medium", "high", "xhigh", "max"]},
    {"value": "sonnet", "resolvedModel": "claude-sonnet-5-5", "displayName": "Sonnet 5.5", "description": "Most efficient for simpler tasks", "supportsEffort": True, "supportedEffortLevels": ["low", "medium", "high", "xhigh", "max"]},
    {"value": "claude-sonnet-4-6", "displayName": "Sonnet 4.6", "description": "Efficient for routine tasks", "supportsEffort": True, "supportedEffortLevels": ["low", "medium", "high", "max"]},
    {"value": "claude-haiku-4-5-20251001", "displayName": "Haiku 4.5", "description": "Fastest for quick answers"},
]


@pytest.fixture(scope="module")
def engine():
    tmp = Path(tempfile.mkdtemp(prefix="models-"))
    log, script = tmp / "engine.log", tmp / "script.json"
    script.write_text(json.dumps([{"emit": {"type": "result", "subtype": "success", "is_error": False, "result": "ok"}}]))
    running = start(
        tmp / "data",
        extra_env={"DSA_CLAUDE_CLI": str(SUPPORT / "fake_claude.py"), "FAKE_CLAUDE_LOG": str(log), "FAKE_CLAUDE_SCRIPT": str(script), "FAKE_CLAUDE_MODELS": json.dumps(MODELS)},
    )
    yield running, log
    running.close()


def argv_of_runs(log: Path) -> list[list[str]]:
    return [r["value"] for r in map(json.loads, log.read_text().splitlines()) if r["kind"] == "argv"] if log.exists() else []


def chat(base: str, **extra) -> httpx.Response:
    with httpx.Client(base_url=base, timeout=60) as c:
        return c.post("/api/claude/chat", json={"message": "hi", "context": {}, **extra})


def test_the_models_come_from_the_engine_and_are_asked_for_once(engine):
    running, log = engine
    r = httpx.get(f"{running.base}/api/claude/models")
    assert r.status_code == 200, r.text
    assert r.json() == {
        "models": [
            {"value": "default", "displayName": "Default (recommended)", "description": "Opus 5.5 · Best for everyday, complex tasks", "efforts": ["low", "medium", "high", "xhigh", "max"]},
            {"value": "sonnet", "displayName": "Sonnet 5.5", "description": "Most efficient for simpler tasks", "efforts": ["low", "medium", "high", "xhigh", "max"]},
            {"value": "claude-sonnet-4-6", "displayName": "Sonnet 4.6", "description": "Efficient for routine tasks", "efforts": ["low", "medium", "high", "max"]},
            {"value": "claude-haiku-4-5-20251001", "displayName": "Haiku 4.5", "description": "Fastest for quick answers", "efforts": []},
        ]
    }
    runs = len(argv_of_runs(log))
    assert httpx.get(f"{running.base}/api/claude/models").status_code == 200
    assert len(argv_of_runs(log)) == runs


def test_with_no_choice_the_engine_is_started_as_before(engine):
    running, log = engine
    log.unlink(missing_ok=True)
    r = chat(running.base)
    assert r.status_code == 200, r.text
    argv = argv_of_runs(log)[-1]
    assert not any(a.startswith(("--model", "--effort")) for a in argv)


def test_the_chosen_model_and_effort_reach_the_engine_where_the_sdk_puts_them(engine):
    running, log = engine
    log.unlink(missing_ok=True)
    assert chat(running.base, model="sonnet", effort="xhigh").status_code == 200
    argv = argv_of_runs(log)[-1]
    turns = argv.index("--max-turns=30")
    assert argv[turns - 1] == "--effort=xhigh"
    assert argv[turns + 1] == "--model=sonnet"


def test_effort_alone_goes_with_the_default_model(engine):
    running, log = engine
    log.unlink(missing_ok=True)
    assert chat(running.base, model=None, effort="low").status_code == 200
    argv = argv_of_runs(log)[-1]
    assert "--effort=low" in argv and not any(a.startswith("--model") for a in argv)


@pytest.mark.parametrize(
    ("choice", "error"),
    [
        ({"model": "gpt-5"}, "That model isn’t available. Pick one from the list."),
        ({"model": "claude-sonnet-4-6", "effort": "xhigh"}, "Sonnet 4.6 doesn’t have that effort level."),
        ({"model": "claude-haiku-4-5-20251001", "effort": "low"}, "Haiku 4.5 doesn’t have that effort level."),
        ({"effort": "turbo"}, "Default (recommended) doesn’t have that effort level."),
        ({"model": 5}, '"model" must be text'),
    ],
)
def test_a_choice_the_engine_doesnt_offer_is_refused(engine, choice, error):
    running, _ = engine
    r = chat(running.base, **choice)
    assert r.status_code == 400
    assert r.json() == {"error": error}
