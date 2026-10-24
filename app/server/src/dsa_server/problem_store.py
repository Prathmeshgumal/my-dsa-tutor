"""Practice problems on disk, one folder each:
  problems/<slug>/problem.json   description, params, tests
  problems/<slug>/driver.cpp     hidden main() that feeds the tests to Solution
  problems/<slug>/solution.cpp   the student's code
  problems/<slug>/attempts/<time>.json   one per Submit
Used by the /api/problems routes and by Claude's problem tools.
"""

import os
import re
import shutil

from .atomic_write import write_file_atomic
from .core import SOLUTION_FILE, NewerFormatError, is_code_name, is_slug, parse_saved, stamp, unique_slug
from .own_changes import note_own_change
from .web import dumps


class ProblemNotFound(Exception):
    pass


class BadName(Exception):
    pass


def folder(base: str, slug: str) -> str:
    if not is_slug(slug):
        raise ProblemNotFound(f'"{slug}" isn\'t a problem name.')
    return os.path.join(base, slug)


def slugs(base: str) -> list[str]:
    os.makedirs(base, exist_ok=True)
    return [e.name for e in os.scandir(base) if e.is_dir(follow_symlinks=False) and is_slug(e.name)]


def read_text(file: str) -> str:
    try:
        with open(file, encoding="utf-8", errors="replace", newline="") as f:
            return f.read()
    except OSError:
        return ""


def _read(file: str) -> str:
    with open(file, encoding="utf-8", errors="replace", newline="") as f:
        return f.read()


_ATTEMPT_NAME = re.compile(r"\d+\.json", re.ASCII)


def list_attempts(base: str, slug: str) -> list[dict]:
    attempts_dir = os.path.join(folder(base, slug), "attempts")
    try:
        names = os.listdir(attempts_dir)
    except OSError:
        names = []
    attempts = []
    for name in names:
        if not _ATTEMPT_NAME.fullmatch(name):
            continue
        try:
            attempts.append(parse_saved("attempt", _read(os.path.join(attempts_dir, name))))
        except (OSError, ValueError, NewerFormatError):
            continue
    return sorted(attempts, key=lambda a: -_number(a.get("at")))


def _number(value) -> float:
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else 0


def read_entry(base: str, slug: str) -> dict:
    where = folder(base, slug)
    try:
        problem = parse_saved("problem", _read(os.path.join(where, "problem.json")))
    except NewerFormatError as e:
        raise ProblemNotFound(f'"{slug}" {re.sub(r"^This ", "", str(e))}') from None
    except (OSError, ValueError):
        raise ProblemNotFound(f'There\'s no problem called "{slug}".') from None
    attempts = list_attempts(base, slug)
    names = sorted(n for n in os.listdir(where) if is_code_name(n) and n != SOLUTION_FILE)
    return {
        "slug": slug,
        "problem": problem,
        "solution": read_text(os.path.join(where, SOLUTION_FILE)),
        "versions": [{"name": name, "content": read_text(os.path.join(where, name))} for name in names],
        "driver": read_text(os.path.join(where, "driver.cpp")),
        "solved": any(_number(a.get("total")) > 0 and a.get("passed") == a.get("total") for a in attempts),
        "attempts": len(attempts),
    }


def list_entries(base: str) -> list[dict]:
    """Every problem, newest first. Folders that aren't problems are skipped."""
    entries = []
    for slug in slugs(base):
        try:
            entries.append(read_entry(base, slug))
        except Exception:
            continue
    return sorted(entries, key=lambda e: -_number(e["problem"].get("createdAt")))


def list_newer(base: str) -> list[str]:
    """Problems saved by a newer version of the editor, which list_entries leaves out."""
    newer = []
    for slug in slugs(base):
        try:
            parse_saved("problem", _read(os.path.join(base, slug, "problem.json")))
        except NewerFormatError:
            newer.append(slug)
        except (OSError, ValueError):
            pass
    return sorted(newer)


def create_problem(base: str, problem: dict, solution: str, driver: str) -> str:
    slug = unique_slug(problem["title"], slugs(base))
    where = folder(base, slug)
    note_own_change(where)
    os.makedirs(os.path.join(where, "attempts"), exist_ok=True)
    # The starting code is kept for Reset.
    saved = {**problem, "starter": solution}
    write_file_atomic(os.path.join(where, "problem.json"), dumps(stamp("problem", saved), indent=2))
    write_file_atomic(os.path.join(where, "driver.cpp"), driver)
    write_file_atomic(os.path.join(where, "solution.cpp"), solution)
    return slug


def existing(base: str, slug: str) -> str:
    where = folder(base, slug)
    if not os.path.isdir(where):
        raise ProblemNotFound(f'There\'s no problem called "{slug}".')
    return where


def check_code_name(name: str) -> None:
    if not is_code_name(name):
        raise BadName(f'"{name}" isn\'t a code file name; use something like brute-force.cpp.')


def write_code(base: str, slug: str, name: str, content: str) -> None:
    """Writes solution.cpp or another version (created if new)."""
    check_code_name(name)
    write_file_atomic(os.path.join(existing(base, slug), name), content)


def write_solution(base: str, slug: str, content: str) -> None:
    write_code(base, slug, SOLUTION_FILE, content)


def delete_code(base: str, slug: str, name: str) -> None:
    """Deletes a version; solution.cpp always stays."""
    check_code_name(name)
    if name == SOLUTION_FILE:
        raise BadName(f"{SOLUTION_FILE} can't be deleted.")
    file = os.path.join(existing(base, slug), name)
    note_own_change(file)
    try:
        os.unlink(file)
    except FileNotFoundError:
        pass


def update_problem(base: str, slug: str, change) -> dict:
    problem = read_entry(base, slug)["problem"]
    updated = change(problem)
    write_file_atomic(os.path.join(folder(base, slug), "problem.json"), dumps(stamp("problem", updated), indent=2))
    return updated


def write_tests(base: str, slug: str, tests: list[dict]) -> None:
    update_problem(base, slug, lambda p: {**p, "tests": tests})


def link_note(base: str, slug: str, note: str) -> None:
    """Ties a note (by its file name in notes/) to a problem."""
    update_problem(base, slug, lambda p: {**p, "notes": list(dict.fromkeys([*(p.get("notes") or []), note]))})


def write_note_links(base: str, slug: str, notes: list[str]) -> None:
    update_problem(base, slug, lambda p: {**p, "notes": list(dict.fromkeys(notes))})


def save_attempt(base: str, slug: str, attempt: dict) -> None:
    attempts_dir = os.path.join(existing(base, slug), "attempts")
    note_own_change(attempts_dir)
    os.makedirs(attempts_dir, exist_ok=True)
    write_file_atomic(os.path.join(attempts_dir, f"{attempt['at']}.json"), dumps(stamp("attempt", attempt)))


def delete_problem(base: str, slug: str) -> None:
    note_own_change(folder(base, slug))
    shutil.rmtree(folder(base, slug), ignore_errors=True)
