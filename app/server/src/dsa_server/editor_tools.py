"""The only things the editor's Claude agent can do. Each tool works on the solutions folder or on what the editor
sent with the message; nothing else (no shell, no web, no other folders).

Every answer is the text Claude reads, so each one is word for word what the Node server's editorTools.ts said.
"""

import errno
import json
import os
import time
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from . import problem_store as store
from .atomic_write import write_file_atomic
from .changes import ToolError, apply_change, check_name, check_note_name, code_of, problem_problems
from .collate import sort_names
from .core import SOLUTION_FILE, is_code_name, language_from_filename, next_note_name, note_title, parse_saved, stamp
from .dry_run import dry_run_problems
from .runner import PistonRunner, describe_input, run_tests
from .web import dumps, js_truthy

TOOLS = json.loads((Path(__file__).parent / "data" / "editor_tools.json").read_text(encoding="utf-8"))
"""The tools as Claude sees them (names, descriptions, input schemas), exactly as the Node server described them."""
TOOL_NAMES = [t["name"] for t in TOOLS["tools"]]

MAX_OUTPUT = 8000


def js_length(text: str) -> int:
    """text.length: characters outside the BMP count twice in JavaScript."""
    return len(text) + sum(1 for c in text if ord(c) > 0xFFFF) if not text.isascii() else len(text)


def js_slice(text: str, end: int) -> str:
    """text.slice(0, end) in UTF-16 units (it may cut a character in half, as JavaScript does)."""
    if text.isascii() or js_length(text) == len(text):
        return text[:end]
    return text.encode("utf-16-le", "surrogatepass")[: end * 2].decode("utf-16-le", "surrogatepass")


def clip(text: str) -> str:
    n = js_length(text)
    return f"{js_slice(text, MAX_OUTPUT)}\n… ({n - MAX_OUTPUT} more characters cut)" if n > MAX_OUTPUT else text


def tmpl(value: Any) -> str:
    """A value inside a JavaScript template string."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return dumps(value)
    if isinstance(value, list):
        return ",".join("" if v is None else tmpl(v) for v in value)
    if isinstance(value, dict):
        return "[object Object]"
    return str(value)


def _utf16(text: str) -> bytes:
    return text.encode("utf-16-be", "surrogatepass")


def line_count(text: str) -> int:
    return 0 if text == "" else len(text.removesuffix("\n").split("\n"))


def plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


_NODE_ERRORS = {
    errno.ENOENT: "no such file or directory",
    errno.EACCES: "permission denied",
    errno.EISDIR: "illegal operation on a directory",
    errno.ENOTDIR: "not a directory",
    errno.EPERM: "operation not permitted",
}


def node_error(e: BaseException, syscall: str) -> str:
    """An OS error worded the way Node words it: "ENOENT: no such file or directory, scandir '/x'"."""
    if isinstance(e, OSError) and e.errno in _NODE_ERRORS:
        code = errno.errorcode[e.errno]
        if e.errno == errno.EISDIR:
            return f"{code}: {_NODE_ERRORS[e.errno]}, read"
        return f"{code}: {_NODE_ERRORS[e.errno]}, {syscall} '{e.filename}'"
    return str(e)


class NodeError(Exception):
    """An unexpected error, already worded as Node words it."""


def _read_text(file: str) -> str:
    try:
        with open(file, encoding="utf-8", errors="replace", newline="") as f:
            return f.read()
    except OSError as e:
        raise NodeError(node_error(e, "open")) from None


def _list_dir(folder: str) -> list[str]:
    try:
        return os.listdir(folder)
    except OSError as e:
        raise NodeError(node_error(e, "scandir")) from None


def _make_dir(folder: str) -> None:
    try:
        os.makedirs(folder, exist_ok=True)
    except OSError as e:
        raise NodeError(node_error(e, "mkdir")) from None


def describe_run(file: str | None, result: dict, stdin: str | None = None) -> str:
    stats = [f"{tmpl(result['timeMs'])} ms" if result["timeMs"] is not None else None, f"{tmpl(result['memoryKb'])} KB" if result["memoryKb"] is not None else None]
    stats = [s for s in stats if s]
    lines = [f"File: {file if file is not None else '(unknown)'}", f"Result: {result['statusText']}{f' ({", ".join(stats)})' if stats else ''}"]
    if stdin is not None:
        lines += ["Input (stdin):", clip(stdin) if stdin else "(nothing typed)"]
    if result["compileOutput"]:
        lines += ["Compiler output:", clip(result["compileOutput"])]
    lines += ["stdout:", clip(result["stdout"]) if result["stdout"] else "(empty)"]
    if result["stderr"]:
        lines += ["stderr:", clip(result["stderr"])]
    return "\n".join(lines)


def unique_count(content: str, old_text: str, where: str) -> None:
    """Old text must appear exactly once; explains what to do otherwise."""
    if not old_text:
        raise ToolError("old_text is empty; copy the exact lines you want to replace.")
    count = content.count(old_text)
    if count == 0:
        raise ToolError(f"old_text wasn't found in {where}. Read it again and copy the lines exactly.")
    if count > 1:
        raise ToolError(f"old_text appears {count} times in {where}; include more surrounding lines so it is unique.")


def _numbered(text: str) -> list[str]:
    return [f"{i + 1}\t{line}" for i, line in enumerate(text.split("\n"))]


def describe_problem(entry: dict, notes: list[str], dry_runs: list[str]) -> str:
    problem = entry["problem"]
    tests = []
    for i, t in enumerate(problem["tests"]):
        added = t.get("addedBy", "undefined")
        tests.append(
            f"{i + 1}. {describe_input(problem['params'], t)} → {tmpl(t['expected'])}{' (example)' if js_truthy(t.get('example')) else ''}"
            f"{f' (added by {tmpl(added)})' if added != 'problem' else ''}"
        )
    lines = [
        f"# {tmpl(problem['title'])} ({tmpl(problem['difficulty'])}) — {entry['slug']}{', solved' if entry['solved'] else ''}",
        "",
        tmpl(problem["description"]),
        "",
        f"Function parameters: {', '.join(f'{tmpl(p['type'])} {tmpl(p['name'])}' for p in problem['params'])}",
        f"Answers compared: {tmpl(problem['compare'])}",
        "",
        "Test cases:",
        *tests,
        "",
        "solution.cpp (the student's code, with line numbers):",
        *_numbered(entry["solution"]),
        "",
        *[line for v in entry["versions"] for line in ["", f"{v['name']} (another version of their code):", *_numbered(v["content"])]],
        "",
        f"Notes linked to it: {', '.join(notes) or '(none)'}",
        f"Dry runs of it: {'; '.join(dry_runs) or '(none)'}",
        "",
        "driver.cpp (hidden from the student):",
        entry["driver"],
    ]
    return clip("\n".join(lines))


def describe_test_run(entry: dict, run: dict) -> str:
    problem = entry["problem"]
    lines = [f"{run['statusText']}: {run['passed']}/{run['total']} cases passed{f' ({tmpl(run['timeMs'])} ms)' if run['timeMs'] is not None else ''}"]
    if run["errorText"]:
        lines += ["Compiler output:" if run["status"] == "compile_error" else "Error output:", clip(run["errorText"])]
    for i, r in enumerate(run["results"]):
        test = problem["tests"][run["cases"][i]]
        got = f", got {r['output']}" if r["status"] in ("pass", "fail") else ""
        lines.append(f"Case {run['cases'][i] + 1} [{r['status']}]: {describe_input(problem['params'], test)} → expected {tmpl(test['expected'])}{got}")
        if r["stdout"]:
            lines.append(f"  printed: {clip(r['stdout'])}")
    return "\n".join(lines)


def iso_time(ms: Any) -> str:
    """new Date(ms).toISOString()"""
    if isinstance(ms, bool) or not isinstance(ms, (int, float)) or ms != ms or abs(ms) > 8.64e15:
        raise ValueError("Invalid time value")
    when = EPOCH + timedelta(milliseconds=int(ms))
    return f"{when.year:04d}-{when:%m-%dT%H:%M:%S}.{when.microsecond // 1000:03d}Z"


EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def now_ms() -> int:
    return int(time.time() * 1000)


class EditorTools:
    """The tools for one reply. `send` passes events to the page (runs, changed files, dry runs, problems);
    `request_approval` shows a proposed change and returns the person's answer."""

    def __init__(
        self,
        folders: dict[str, str],
        context: dict,
        runner: PistonRunner,
        request_approval: Callable[[dict], Awaitable[bool]],
        send: Callable[[dict], None],
    ):
        self.dir = folders["solutions"]
        self.notes_dir = folders["notes"]
        self.playground_dir = folders["playground"]
        self.problems_dir = folders["problems"]
        self.context = context
        self.runner = runner
        self.request_approval = request_approval
        self.send = send

    async def call(self, name: str, args: dict) -> dict:
        """Runs one tool. Bad input (a ToolError) comes back as an error Claude can read and recover from."""
        try:
            return await getattr(self, name)(**args)
        except ToolError as e:
            return {"text": str(e), "isError": True}
        except Exception as e:
            return {"text": f"Something went wrong: {e}", "isError": True}

    # Helpers.

    def problem_slug(self, slug: str | None) -> str:
        open_problem = self.context.get("openProblem")
        s = slug if slug is not None else (open_problem["slug"] if open_problem else None)
        if not s:
            raise ToolError("No problem is open; pass its slug (see list_problems).")
        return s

    def code_file(self, entry: dict, file: str | None) -> tuple[str, str]:
        """Which code file of a problem a tool means: the one asked for, else the one open on screen, else solution.cpp."""
        open_problem = self.context.get("openProblem")
        opened = open_problem.get("file") if open_problem and open_problem["slug"] == entry["slug"] else None
        name = file if file is not None else opened if opened is not None else SOLUTION_FILE
        code = code_of(entry, name)
        if code is None:
            names = ", ".join([SOLUTION_FILE, *(v["name"] for v in entry["versions"])])
            raise ToolError(f"{entry['slug']} has no {name}; its code files are {names}.")
        return name, code

    def dry_runs_of(self, slug: str) -> list[str]:
        try:
            names = os.listdir(self.playground_dir)
        except OSError:
            names = []
        found = []
        for n in names:
            if not n.endswith(".json"):
                continue
            try:
                run = parse_saved("dryRun", _read_text(os.path.join(self.playground_dir, n)))
            except Exception:
                continue
            if run.get("problem") == slug:
                found.append(f'"{tmpl(run.get("title"))}" ({len(run["steps"])} steps)')
        return found

    def problem(self, slug: str | None) -> dict:
        try:
            return store.read_entry(self.problems_dir, self.problem_slug(slug))
        except store.ProblemNotFound as e:
            raise ToolError(f"{e} Use list_problems to see them.") from None

    def read_note_text(self, name: str) -> str:
        check_note_name(name)
        try:
            return _read_text(os.path.join(self.notes_dir, name))
        except NodeError:
            raise ToolError(f"{name} doesn't exist. Use list_notes to see the notes.") from None

    def note_names(self) -> list[str]:
        _make_dir(self.notes_dir)
        return [n for n in _list_dir(self.notes_dir) if n.lower().endswith(".md") and not n.startswith(".")]

    def read_solution(self, name: str) -> str:
        check_name(name)
        try:
            return _read_text(os.path.join(self.dir, name))
        except NodeError:
            raise ToolError(f"{name} doesn't exist. Use list_files to see the files.") from None

    def exists(self, name: str) -> bool:
        return os.path.exists(os.path.join(self.dir, name))

    async def propose(self, request: dict, declined: str) -> dict:
        """Shows the change to the user; if they approve, writes it and lets the editor know what changed."""
        if not await self.request_approval(request):
            return {"text": declined}
        done = apply_change({"solutions": self.dir, "notes": self.notes_dir, "problems": self.problems_dir}, request["change"])
        for e in done["effects"]:
            if e["type"] == "file_changed":
                self.send({"type": "file_changed", "file": e["file"]})
            elif e["type"] == "note_changed":
                self.send({"type": "note_changed", "note": e["note"]})
            else:
                self.send({"type": "problem_changed", "slug": e["slug"], "open": e["open"]})
        return {"text": done["text"]}

    # The tools.

    async def get_editor_state(self) -> dict:
        active = self.context.get("activeFile")
        language = language_from_filename(active["name"]) if active else None
        open_problem = self.context.get("openProblem")
        return {
            "text": "\n".join(
                [
                    f"Open file: {active['name']}{f' ({language["label"]})' if language else ''}" if active else "No file is open.",
                    f"Open tabs: {', '.join(self.context['openFiles']) or '(none)'}",
                    f"On the Problem screen: {open_problem['title']} ({open_problem['slug']})" if open_problem else "The Problem screen isn't showing.",
                ]
            )
        }

    async def list_files(self) -> dict:
        names = sorted((n for n in _list_dir(self.dir) if not n.startswith(".") and language_from_filename(n)), key=_utf16)
        if not names:
            return {"text": "The solutions folder is empty."}
        rows = [f"{n} ({plural(line_count(_read_text(os.path.join(self.dir, n))), 'line')})" for n in names]
        return {"text": "\n".join(rows)}

    async def read_file(self, name: str, start_line: int | None = None, end_line: int | None = None) -> dict:
        lines = self.read_solution(name).split("\n")
        start = max(1, start_line if start_line is not None else 1)
        end = min(len(lines), end_line if end_line is not None else len(lines))
        numbered = [f"{start + i}\t{line}" for i, line in enumerate(lines[start - 1 : end])]
        return {"text": clip("\n".join(numbered)) or f"{name} is empty."}

    async def get_last_run(self) -> dict:
        last = self.context.get("lastRun")
        if not last:
            return {"text": "The code hasn’t run yet in the editor (the output panel is empty)."}
        if "error" in last:
            return {"text": f"The last run of {last['file'] if last['file'] is not None else 'the code'} failed to start: {last['error']}"}
        return {"text": describe_run(last["file"], last["result"], last.get("stdin"))}

    async def run_code(self, name: str | None = None, stdin: str | None = None) -> dict:
        active = self.context.get("activeFile")
        file = name if name is not None else (active["name"] if active else None)
        if not file:
            raise ToolError("No file is open; pass the file name to run.")
        source = self.read_solution(file)
        language = language_from_filename(file)
        try:
            result = await self.runner.run(language, source, stdin if stdin is not None else "")
        except Exception as e:
            return {"text": f"Couldn't run {file}: {e}", "isError": True}
        self.send({"type": "run", "file": file, "result": result, "stdin": stdin if stdin is not None else ""})
        return {"text": describe_run(file, result, stdin if stdin is not None else "")}

    async def edit_file(self, name: str, old_text: str, new_text: str, explanation: str) -> dict:
        unique_count(self.read_solution(name), old_text, name)
        return await self.propose(
            {
                "kind": "edit",
                "file": name,
                "before": old_text,
                "after": new_text,
                "explanation": explanation,
                "change": {"type": "edit_file", "name": name, "oldText": old_text, "newText": new_text},
            },
            f"The user declined this edit to {name}. Don't apply it another way; ask what they'd prefer.",
        )

    async def create_file(self, name: str, content: str, explanation: str) -> dict:
        check_name(name)
        if self.exists(name):
            raise ToolError(f"{name} already exists; use edit_file to change it.")
        return await self.propose(
            {"kind": "create", "file": name, "before": "", "after": content, "explanation": explanation, "change": {"type": "create_file", "name": name, "content": content}},
            f"The user declined creating {name}.",
        )

    async def list_notes(self) -> dict:
        names = sort_names(self.note_names(), True)
        if not names:
            return {"text": "There are no notes yet."}
        return {"text": "\n".join(f"{n}: {note_title(_read_text(os.path.join(self.notes_dir, n)))}" for n in names)}

    async def read_note(self, name: str) -> dict:
        return {"text": clip(self.read_note_text(name)) or f"{name} is empty."}

    async def create_note(self, content: str, explanation: str) -> dict:
        name = next_note_name(self.note_names())
        open_problem = self.context.get("openProblem")
        linked = open_problem["slug"] if open_problem else None
        change = {"type": "create_note", "name": name, "content": content, **({"linkTo": linked} if linked else {})}
        return await self.propose(
            {"kind": "create_note", "file": name, "before": "", "after": content, "explanation": explanation, "change": change},
            "The user declined creating this note.",
        )

    async def edit_note(self, name: str, old_text: str, new_text: str, explanation: str) -> dict:
        unique_count(self.read_note_text(name), old_text, name)
        return await self.propose(
            {
                "kind": "edit_note",
                "file": name,
                "before": old_text,
                "after": new_text,
                "explanation": explanation,
                "change": {"type": "edit_note", "name": name, "oldText": old_text, "newText": new_text},
            },
            f"The user declined this change to {name}. Ask what they'd prefer.",
        )

    async def create_visualization(
        self,
        title: str,
        steps: list[dict],
        file: str | None = None,
        problem: str | None = None,
        input: str | None = None,
        expected: str | None = None,
    ) -> dict:
        # The code comes from the real file, so step line numbers match what the student sees.
        code, shown = None, file
        if problem:
            shown, code = self.code_file(self.problem(problem), file)
        elif file:
            code = self.read_solution(file)
        problems = dry_run_problems(code, steps)
        if problems:
            return {"text": "The visualization wasn't saved. Fix these and call create_visualization again:\n- " + "\n- ".join(problems), "isError": True}
        # A dry run made while a problem is open belongs to it.
        open_problem = self.context.get("openProblem")
        belongs_to = problem if problem is not None else (open_problem["slug"] if open_problem else None)
        run: dict = {"id": str(uuid.uuid4()), "title": title}
        if shown:
            run.update({"file": shown, "language": language_from_filename(shown)["id"]})
            if code is not None:
                run["code"] = code
        if belongs_to:
            run["problem"] = belongs_to
        if input:
            run["input"] = input
        if expected is not None:
            run["expected"] = expected
        run["createdAt"] = now_ms()
        run["steps"] = steps
        _make_dir(self.playground_dir)
        write_file_atomic(os.path.join(self.playground_dir, f"{run['id']}.json"), dumps(stamp("dryRun", run)))
        self.send({"type": "visualization", "run": run})
        return {"text": f'Saved "{title}" ({len(steps)} steps). The student can watch it in the Playground; a card in the chat opens it.'}

    async def list_problems(self) -> dict:
        entries = store.list_entries(self.problems_dir)
        if not entries:
            return {"text": "There are no practice problems yet."}
        return {
            "text": "\n".join(
                f"{e['slug']}: {tmpl(e['problem']['title'])} ({tmpl(e['problem']['difficulty'])}){' ✓ solved' if e['solved'] else ''}, {plural(e['attempts'], 'attempt')}" for e in entries
            )
        }

    async def get_problem(self, slug: str | None = None) -> dict:
        entry = self.problem(slug)
        notes = self.note_names()
        linked = [n for n in (entry["problem"].get("notes") or []) if n in notes]
        return {"text": describe_problem(entry, linked, self.dry_runs_of(entry["slug"]))}

    async def create_problem(
        self,
        title: str,
        difficulty: str,
        description: str,
        params: list[dict],
        tests: list[dict],
        starter: str,
        driver: str,
        explanation: str,
        compare: str | None = None,
    ) -> dict:
        new_problem = {
            "title": title,
            "difficulty": difficulty,
            "description": description,
            "params": params,
            "compare": compare if compare is not None else "exact",
            "tests": [{**t, "addedBy": "problem"} for t in tests],
            "createdAt": now_ms(),
        }
        problems = problem_problems(new_problem)
        if problems:
            return {"text": "The problem wasn't created. Fix these and call create_problem again:\n- " + "\n- ".join(problems), "isError": True}
        # Make sure the driver and starter compile together before the student sees it.
        try:
            check = await run_tests(self.runner, {"problem": new_problem, "solution": starter, "driver": driver}, "run")
        except Exception as e:
            return {"text": f"Couldn't check the driver compiles: {e}", "isError": True}
        if check["status"] == "compile_error":
            return {"text": f"The starter code and driver don't compile together. Fix the driver (or starter) and try again:\n{clip(check['errorText'])}", "isError": True}
        preview = "\n".join(
            [
                f"# {title} ({difficulty})",
                "",
                description,
                "",
                "**Test cases**",
                "",
                *(f"- `{describe_input(params, t)}` → `{t['expected']}`{' (example)' if t['example'] else ''}" for t in new_problem["tests"]),
                "",
                "**Starting code**",
                "",
                "```cpp",
                starter,
                "```",
            ]
        )
        return await self.propose(
            {
                "kind": "create_problem",
                "file": title,
                "before": "",
                "after": preview,
                "explanation": explanation,
                "change": {"type": "create_problem", "problem": new_problem, "starter": starter, "driver": driver},
            },
            "The user declined creating this problem.",
        )

    async def add_test_case(self, input: list[str], expected: str, explanation: str, slug: str | None = None) -> dict:
        entry = self.problem(slug)
        test = {"input": input, "expected": expected, "example": False, "addedBy": "claude"}
        problems = problem_problems({"params": entry["problem"]["params"], "tests": [{**test, "example": True}]})
        if problems:
            return {"text": "\n".join(problems).replace("Test 1", "This test"), "isError": True}
        return await self.propose(
            {
                "kind": "add_test",
                "file": entry["problem"]["title"],
                "before": "",
                "after": f"{describe_input(entry['problem']['params'], test)} → {expected}",
                "explanation": explanation,
                "change": {"type": "add_test", "slug": entry["slug"], "test": test},
            },
            "The user declined adding this test case.",
        )

    async def edit_solution(self, old_text: str, new_text: str, explanation: str, slug: str | None = None, file: str | None = None) -> dict:
        entry = self.problem(slug)
        name, code = self.code_file(entry, file)
        where = f"{entry['slug']}/{name}"
        unique_count(code, old_text, where)
        return await self.propose(
            {
                "kind": "edit_solution",
                "file": where,
                "before": old_text,
                "after": new_text,
                "explanation": explanation,
                "change": {"type": "edit_solution", "slug": entry["slug"], "name": name, "oldText": old_text, "newText": new_text},
            },
            "The user declined this edit. Don't apply it another way; ask what they'd prefer.",
        )

    async def run_tests(self, slug: str | None = None, file: str | None = None, all: bool | None = None) -> dict:
        entry = self.problem(slug)
        name, code = self.code_file(entry, file)
        try:
            run = await run_tests(self.runner, {**entry, "solution": code}, "submit" if all else "run")
            return {"text": f"{name}: {describe_test_run(entry, run)}"}
        except Exception as e:
            return {"text": f"Couldn't run the tests: {e}", "isError": True}

    async def save_code_version(self, name: str, content: str, explanation: str, slug: str | None = None) -> dict:
        entry = self.problem(slug)
        if not is_code_name(name):
            raise ToolError(f'"{name}" isn\'t a good name; use something like brute-force.cpp.')
        if code_of(entry, name) is not None:
            raise ToolError(f'{entry["slug"]} already has {name}; use edit_solution with file "{name}" to change it.')
        return await self.propose(
            {
                "kind": "create",
                "file": f"{entry['slug']}/{name}",
                "before": "",
                "after": content,
                "explanation": explanation,
                "change": {"type": "save_code_version", "slug": entry["slug"], "name": name, "content": content},
            },
            f"The user declined saving {name}.",
        )

    async def list_attempts(self, slug: str | None = None) -> dict:
        entry = self.problem(slug)
        attempts = store.list_attempts(self.problems_dir, entry["slug"])
        if not attempts:
            return {"text": f"No submissions for {entry['slug']} yet."}
        return {
            "text": clip(
                "\n\n---\n\n".join(f"{iso_time(a.get('at'))}: {tmpl(a.get('statusText'))} {tmpl(a.get('passed'))}/{tmpl(a.get('total'))}\n{tmpl(a.get('code'))}" for a in attempts)
            )
        }
