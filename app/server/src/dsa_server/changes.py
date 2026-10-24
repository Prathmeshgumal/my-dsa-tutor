"""Applies a change Claude proposed and the user approved (see @dsa/core's changes.ts). Used by the editor tools
while Claude waits for the answer, and by POST /api/claude/apply for a proposal approved later."""

import os
import re

from . import problem_store as store
from .atomic_write import write_file_atomic
from .core import is_code_name, is_slug, js_trim, language_from_filename, next_note_name
from .web import js_truthy


class ToolError(Exception):
    """A problem with the request Claude can read and act on."""

    def __init__(self, message: str, for_person: str | None = None):
        super().__init__(message)
        # The same problem in words for the person, when they apply a change themselves ("Apply anyway").
        self.for_person = message if for_person is None else for_person


def _js_length(text: str) -> int:
    return len(text) + sum(1 for c in text if ord(c) > 0xFFFF)


def check_name(name: str) -> None:
    """A plain code file name directly inside the solutions folder."""
    ok = 0 < _js_length(name) <= 255 and not re.search(r"[/\\\0]", name) and not name.startswith(".") and language_from_filename(name) is not None
    if not ok:
        raise ToolError(f'"{name}" isn\'t a valid solution file name (use something like two_sum.cpp, Main.java or bfs.py).')


_NOTE_NAME = re.compile(r"[^/\\\0]+\.md", re.IGNORECASE)


def check_note_name(name: str) -> None:
    """A plain .md file name directly inside the notes folder."""
    ok = bool(_NOTE_NAME.fullmatch(name)) and not name.startswith(".") and _js_length(name) <= 255
    if not ok:
        raise ToolError(f'"{name}" isn\'t a note name; use list_notes to see them (e.g. note-1.md).')


def _read_or(file: str, missing: str) -> str:
    try:
        with open(file, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        raise ToolError(missing, f"{os.path.basename(file)} doesn't exist any more.") from None


def _replace_once(content: str, old: str, new: str, changed: str, where: str) -> str:
    """Replaces old text that must still be there exactly as Claude saw it."""
    if not old or old not in content:
        raise ToolError(changed, f"{where} has changed since Claude suggested this, so the change no longer fits.")
    return content.replace(old, new, 1)


def _problem_entry(problems_dir: str, slug: str) -> dict:
    if not is_slug(slug):
        raise ToolError(f'"{slug}" isn\'t a problem.')
    try:
        return store.read_entry(problems_dir, slug)
    except store.ProblemNotFound as e:
        raise ToolError(f"{e} Use list_problems to see them.", str(e)) from None


def code_of(entry: dict, name: str) -> str | None:
    if name == store.SOLUTION_FILE:
        return entry["solution"]
    return next((v["content"] for v in entry["versions"] if v["name"] == name), None)


def _length(value, what: str) -> int:
    """value.length, failing like JavaScript does on a missing value."""
    if value is None:
        raise TypeError(f"Cannot read properties of undefined (reading '{what}')")
    return len(value)


def problem_problems(p: dict) -> list[str]:
    """Problems with a problem Claude is creating; empty when it's fine."""
    params, tests = p.get("params"), p.get("tests")
    problems = []
    if not _length(params, "length"):
        problems.append('List the function parameters in "params".')
    if not _length(tests, "length"):
        problems.append("Add at least one test case.")
    if not any(js_truthy(t.get("example")) for t in tests):
        problems.append("Mark the examples from the problem with example: true.")
    for i, t in enumerate(tests):
        if len(t["input"]) != len(params):
            problems.append(f"Test {i + 1} has {len(t['input'])} input lines but there are {len(params)} params.")
        if any("\n" in line for line in t["input"]):
            problems.append(f"Test {i + 1}: each input value must be on one line.")
        if not js_trim(t["expected"]):
            problems.append(f"Test {i + 1} has no expected answer.")
    return problems


def apply_change(folders: dict, change: dict) -> dict:
    """Writes the change. Raises ToolError when it no longer fits (the file changed, or is already there).
    `folders`: solutions, notes and problems."""
    solutions, notes, problems_dir = folders["solutions"], folders["notes"], folders["problems"]
    kind = change["type"]
    if kind == "edit_file":
        name = change["name"]
        check_name(name)
        latest = _read_or(os.path.join(solutions, name), f"{name} doesn't exist. Use list_files to see the files.")
        updated = _replace_once(latest, change["oldText"], change["newText"], f"{name} changed while waiting for approval; read it again.", name)
        write_file_atomic(os.path.join(solutions, name), updated)
        return {"text": f"Applied the edit to {name}; the editor shows the new code.", "effects": [{"type": "file_changed", "file": name}]}
    if kind == "create_file":
        name = change["name"]
        check_name(name)
        try:
            write_file_atomic(os.path.join(solutions, name), change["content"], exclusive=True)
        except FileExistsError:
            raise ToolError(f"{name} already exists; use edit_file to change it.", f"{name} already exists.") from None
        return {"text": f"Created {name}.", "effects": [{"type": "file_changed", "file": name}]}
    if kind == "create_note":
        check_note_name(change["name"])
        name = change["name"]
        try:
            write_file_atomic(os.path.join(notes, name), change["content"], exclusive=True)
        except FileExistsError:
            # Another note took the name meanwhile: use the next free one.
            name = next_note_name([n for n in os.listdir(notes) if n.lower().endswith(".md")])
            write_file_atomic(os.path.join(notes, name), change["content"], exclusive=True)
        effects = [{"type": "note_changed", "note": name}]
        link_to = change.get("linkTo")
        # A note made while a problem is open belongs to it.
        if link_to and is_slug(link_to):
            try:
                store.link_note(problems_dir, link_to, name)
                linked = True
            except Exception:
                linked = False
            if linked:
                effects.append({"type": "problem_changed", "slug": link_to, "open": False})
                return {"text": f"Saved the note as {name} and linked it to {link_to}; it shows in the Notes panel and on the problem's Notes tab.", "effects": effects}
        return {"text": f"Saved the note as {name}; it shows in the Notes panel.", "effects": effects}
    if kind == "edit_note":
        name = change["name"]
        check_note_name(name)
        latest = _read_or(os.path.join(notes, name), f"{name} doesn't exist. Use list_notes to see the notes.")
        updated = _replace_once(latest, change["oldText"], change["newText"], f"{name} changed while waiting for approval; read it again.", name)
        write_file_atomic(os.path.join(notes, name), updated)
        return {"text": f"Updated {name}.", "effects": [{"type": "note_changed", "note": name}]}
    if kind == "create_problem":
        found = problem_problems(change["problem"])
        if found:
            raise ToolError(f"The problem isn't valid: {'; '.join(found)}")
        slug = store.create_problem(problems_dir, change["problem"], change["starter"], change["driver"])
        return {"text": f"Created {slug}; it's open on the Problem screen.", "effects": [{"type": "problem_changed", "slug": slug, "open": True}]}
    if kind == "add_test":
        entry = _problem_entry(problems_dir, change["slug"])
        found = problem_problems({"params": entry["problem"]["params"], "tests": [{**change["test"], "example": True}]})
        if found:
            raise ToolError("\n".join(found).replace("Test 1", "This test"))
        store.write_tests(problems_dir, entry["slug"], [*entry["problem"]["tests"], change["test"]])
        return {"text": f"Added the case to {entry['slug']} (case {len(entry['problem']['tests']) + 1}). Submit checks it.", "effects": [{"type": "problem_changed", "slug": entry["slug"], "open": False}]}
    if kind == "edit_solution":
        entry = _problem_entry(problems_dir, change["slug"])
        where = f"{entry['slug']}/{change['name']}"
        latest = code_of(entry, change["name"])
        if latest is None:
            raise ToolError(f"{entry['slug']} has no {change['name']}.", f"{entry['slug']} has no {change['name']} any more.")
        updated = _replace_once(latest, change["oldText"], change["newText"], f"{where} changed while waiting for approval; read it again with get_problem.", where)
        store.write_code(problems_dir, entry["slug"], change["name"], updated)
        return {"text": f"Applied the edit to {where}.", "effects": [{"type": "problem_changed", "slug": entry["slug"], "open": False}]}
    if kind == "save_code_version":
        entry = _problem_entry(problems_dir, change["slug"])
        name = change["name"]
        if not is_code_name(name):
            raise ToolError(f'"{name}" isn\'t a good name; use something like brute-force.cpp.')
        if code_of(entry, name) is not None:
            raise ToolError(f'{entry["slug"]} already has {name}; use edit_solution with file "{name}" to change it.', f"{entry['slug']} already has {name}.")
        store.write_code(problems_dir, entry["slug"], name, change["content"])
        return {"text": f"Saved {name} next to solution.cpp; the student can switch to it above the editor.", "effects": [{"type": "problem_changed", "slug": entry["slug"], "open": False}]}
    raise ValueError(f"Unknown change {kind}")


# Checks a change sent back by the browser before it is applied, like the Node server's zod schema: the fields
# listed, of the right kinds, and nothing else kept (in this order). The problem itself is checked in apply_change.
_TEXT = "text"
SHAPES = {
    "edit_file": {"name": _TEXT, "oldText": _TEXT, "newText": _TEXT},
    "create_file": {"name": _TEXT, "content": _TEXT},
    "create_note": {"name": _TEXT, "content": _TEXT, "linkTo": "optional text"},
    "edit_note": {"name": _TEXT, "oldText": _TEXT, "newText": _TEXT},
    "create_problem": {"problem": "problem", "starter": _TEXT, "driver": _TEXT},
    "add_test": {"slug": _TEXT, "test": "test"},
    "edit_solution": {"slug": _TEXT, "name": _TEXT, "oldText": _TEXT, "newText": _TEXT},
    "save_code_version": {"slug": _TEXT, "name": _TEXT, "content": _TEXT},
}


def _test_case(value) -> dict | None:
    if not isinstance(value, dict):
        return None
    ok = (
        isinstance(value.get("input"), list)
        and all(isinstance(v, str) for v in value["input"])
        and isinstance(value.get("expected"), str)
        and isinstance(value.get("example"), bool)
        and value.get("addedBy") in ("problem", "claude", "user")
    )
    return {"input": value["input"], "expected": value["expected"], "example": value["example"], "addedBy": value["addedBy"]} if ok else None


def parse_change(raw) -> dict | None:
    """The change as the editor will apply it, or None if it isn't one."""
    if not isinstance(raw, dict) or raw.get("type") not in SHAPES:
        return None
    out = {"type": raw["type"]}
    for key, kind in SHAPES[raw["type"]].items():
        value = raw.get(key)
        if kind == _TEXT:
            if not isinstance(value, str):
                return None
        elif kind == "optional text":
            if key not in raw:
                continue
            if not isinstance(value, str):
                return None
        elif kind == "problem":
            if not isinstance(value, dict) or not isinstance(value.get("title"), str):
                return None
        elif kind == "test":
            value = _test_case(value)
            if value is None:
                return None
        out[key] = value
    return out
