"""Running code for Claude's tools: Piston's answer turned into a run result (core/runner/piston.ts), and a
problem's test cases run and judged in one program (core/problems.ts and core/cppHarness.ts)."""

import math
import re
from pathlib import Path

import httpx

from .core import LANGUAGES, js_trim
from .web import dumps, js_truthy, loads

BATCH_TIMEOUT_MS = 3000
"""How long a run without typing may take, so an infinite loop stops quickly."""

# Piston's g++ wrapper chmods a.out even when compilation failed; that line is noise.
CHMOD_NOISE = re.compile(r"^chmod: cannot access 'a\.out'[^\n\r  ]*\n?", re.M)


class RunnerError(Exception):
    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind


def _js(value) -> str:
    """A value in a template string, as JavaScript writes it."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return dumps(value)
    return str(value)


def _run_status(run: dict) -> tuple[str, str]:
    status = run.get("status")
    if status == "TO":
        return "time_limit", "Time limit exceeded"
    if status in ("XX", "IE"):
        message = run.get("message")
        return "internal_error", message if message is not None else "Internal error"
    if js_truthy(run.get("signal")):
        return "runtime_error", f"Runtime error ({_js(run.get('signal'))})"
    if run.get("code") != 0:
        return "runtime_error", f"Runtime error (exit {_js(run.get('code', 'undefined'))})"
    return "success", "Accepted"


def _js_round(x: float) -> int:
    return math.floor(x + 0.5)


class PistonRunner:
    """Runs code on Piston's v2 API at base_url (e.g. http://127.0.0.1:2000/api/v2)."""

    def __init__(self, base_url: str, client: httpx.AsyncClient):
        self.base_url = base_url
        self.client = client

    async def run(self, language: dict, source: str, stdin: str) -> dict:
        body = {
            "language": language["piston"]["language"],
            "version": "*",
            "files": [{"name": language["piston"]["fileName"], "content": source}],
            "stdin": stdin,
            # Piston's maximum is raised for interactive runs (they wait for typing); a batch run still gets 3 s.
            "run_timeout": BATCH_TIMEOUT_MS,
        }
        try:
            res = await self.client.post(f"{self.base_url}/execute", content=dumps(body).encode(), headers={"Content-Type": "application/json"})
        except httpx.HTTPError:
            raise RunnerError("network", "Couldn’t reach Piston — start it with “docker compose up -d”.") from None
        if not 200 <= res.status_code < 300:
            try:
                answer = loads(res.text)
                if isinstance(answer, dict) and isinstance(answer.get("message"), str):
                    raise RunnerError("http", f"Piston: {answer['message']}")
            except ValueError:
                pass  # not JSON — fall through to the generic message
            raise RunnerError("http", f"Piston error (HTTP {res.status_code}).")
        try:
            answer = loads(res.text)
        except ValueError:
            raise ValueError("Piston's answer isn't valid JSON") from None
        compile_stage, run = answer.get("compile"), answer.get("run")
        if js_truthy(compile_stage) and compile_stage.get("code") != 0:
            stderr = CHMOD_NOISE.sub("", compile_stage.get("stderr") or "", count=1)
            return {
                "status": "compile_error",
                "statusText": "Compilation Error",
                "stdout": "",
                "stderr": "",
                "compileOutput": stderr or compile_stage.get("stdout"),
                "timeMs": None,
                "memoryKb": None,
            }
        if not isinstance(run, dict):
            raise TypeError("Cannot read properties of undefined (reading 'status')")
        status, status_text = _run_status(run)
        memory = run.get("memory")
        return {
            "status": status,
            "statusText": status_text,
            "stdout": run.get("stdout"),
            "stderr": run.get("stderr"),
            "compileOutput": "",
            "timeMs": run.get("cpu_time"),
            "memoryKb": None if memory is None else _js_round(memory / 1024),
        }


# The C++ program a problem's tests run as: HARNESS + solution.cpp + driver.cpp (see data/cpp_harness.cpp).

RESULT_MARK = "@@RESULT@@"
CASE_MARK = "@@CASE@@"
CPP_HARNESS = (Path(__file__).parent / "data" / "cpp_harness.cpp").read_text(encoding="utf-8")


def build_cpp_source(solution: str, driver: str) -> str:
    return f'{CPP_HARNESS}\n#line 1 "solution.cpp"\n{solution}\n#line 1 "driver.cpp"\n{driver}\n'


def cases_for(problem: dict, kind: str) -> list[int]:
    """Which cases a Run checks: the examples and the student's own cases. Submit checks all."""
    return [i for i, t in enumerate(problem["tests"]) if kind == "submit" or js_truthy(t.get("example")) or t.get("addedBy") == "user"]


def build_stdin(tests: list[dict]) -> str:
    return "\n".join([str(len(tests)), *(line for t in tests for line in t["input"])]) + "\n"


def describe_input(params: list[dict], test: dict) -> str:
    """nums = [2,7,11,15], target = 9"""
    return ", ".join(f"{params[i]['name'] if i < len(params) else f'arg{i + 1}'} = {v}" for i, v in enumerate(test["input"]))


def _utf16(text: str) -> bytes:
    """Strings compared the way JavaScript's < does: by UTF-16 code units."""
    return text.encode("utf-16-be", "surrogatepass")


def _sort_deep(value, nested: bool):
    if not isinstance(value, list):
        return value
    items = [_sort_deep(v, True) for v in value] if nested else value
    return sorted(items, key=lambda v: _utf16(dumps(v)))


def _normalize(text: str, compare: str) -> str:
    trimmed = js_trim(text)
    try:
        value = loads(trimmed)
    except ValueError:
        return trimmed
    return dumps(value if compare == "exact" else _sort_deep(value, compare == "any_order_nested"))


def same_answer(output: str, expected: str, compare: str) -> bool:
    return _normalize(output, compare) == _normalize(expected, compare)


def judge_output(stdout: str, tests: list[dict], compare: str, finished: bool) -> list[dict]:
    """Splits one program run into per-case results."""
    chunks = stdout.split(f"\n{CASE_MARK}\n")
    results = []
    for i, test in enumerate(tests):
        chunk = chunks[i] if i < len(chunks) else None
        complete = i < len(chunks) - 1
        if chunk is None or not complete:
            # The case that was running when the program stopped gets its printed text; later ones never started.
            printed = chunk.split(f"\n{RESULT_MARK}\n")[0].removeprefix("\n") if chunk is not None else ""
            status = "error" if not finished and chunk is not None and i == len(chunks) - 1 else "not_run"
            results.append({"status": status, "output": "", "stdout": printed if status == "error" else ""})
            continue
        at = chunk.rfind(f"\n{RESULT_MARK}\n")
        output = "" if at == -1 else chunk[at + len(RESULT_MARK) + 2 :]
        printed = (chunk if at == -1 else chunk[:at]).removeprefix("\n")
        results.append({"status": "pass" if same_answer(output, test["expected"], compare) else "fail", "output": output, "stdout": printed})
    return results


async def run_tests(runner: PistonRunner, entry: dict, kind: str) -> dict:
    """Compiles the solution once and checks the chosen cases."""
    problem = entry["problem"]
    cases = cases_for(problem, kind)
    tests = [problem["tests"][i] for i in cases]
    result = await runner.run(LANGUAGES["cpp"], build_cpp_source(entry["solution"], entry["driver"]), build_stdin(tests))
    finished = result["status"] == "success"
    if result["status"] == "compile_error":
        results = [{"status": "not_run", "output": "", "stdout": ""} for _ in tests]
    else:
        results = judge_output(result["stdout"], tests, problem["compare"], finished)
    passed = sum(1 for r in results if r["status"] == "pass")
    if result["status"] == "compile_error":
        error_text = result["compileOutput"] or result["stderr"]
    else:
        error_text = "" if finished else result["stderr"]
    status_text = ("Accepted" if passed == len(tests) else "Wrong Answer") if finished else result["statusText"]
    return {
        "kind": kind,
        "cases": cases,
        "results": results,
        "status": result["status"],
        "statusText": status_text,
        "errorText": error_text,
        "timeMs": result["timeMs"],
        "passed": passed,
        "total": len(tests),
    }
