"""The parts of @dsa/core (packages/core/src) the server uses: languages, problems, saved formats, note names.

The browser keeps using the TypeScript originals, so each function here must behave exactly like its original.
JavaScript regexes without the u flag are ASCII-only (\\w, \\s, [a-z] with i), hence re.ASCII throughout.
"""

import re
import unicodedata

from .web import loads

# languages.ts

LANGUAGES = {
    "cpp": {"id": "cpp", "label": "C++", "ext": ".cpp", "monaco": "cpp", "piston": {"language": "c++", "fileName": "main"}},
    "java": {"id": "java", "label": "Java", "ext": ".java", "monaco": "java", "piston": {"language": "java", "fileName": "Main.java"}},
    "python": {"id": "python", "label": "Python", "ext": ".py", "monaco": "python", "piston": {"language": "python", "fileName": "main.py"}},
}


def split_ext(name: str) -> tuple[str, str]:
    dot = name.rfind(".")
    return (name[:dot], name[dot:]) if dot > 0 else (name, "")


def language_from_filename(name: str) -> dict | None:
    ext = split_ext(name)[1].lower()
    return next((lang for lang in LANGUAGES.values() if lang["ext"] == ext), None)


# formats.ts

FORMATS = {"problem": 1, "attempt": 1, "dryRun": 1}


class NewerFormatError(Exception):
    pass


def stamp(kind: str, data: dict) -> dict:
    return {**data, "formatVersion": FORMATS[kind]}


def upgrade(kind: str, raw) -> dict:
    if not isinstance(raw, dict):
        raise ValueError("Not a saved object")
    saved = raw.get("formatVersion", 0) if "formatVersion" in raw else 0
    if isinstance(saved, bool) or not isinstance(saved, (int, float)) or not float(saved).is_integer() or saved < 0:
        raise ValueError("Unreadable format version")
    if saved > FORMATS[kind]:
        raise NewerFormatError("This was saved by a newer version of the editor. Update the editor to open it.")
    # Every migration so far only adds the number.
    return {**raw, "formatVersion": FORMATS[kind]}


def parse_saved(kind: str, text: str) -> dict:
    return upgrade(kind, loads(text))


# problems.ts

SOLUTION_FILE = "solution.cpp"
DIFFICULTIES = ["easy", "medium", "hard"]

# JavaScript's \s: ASCII whitespace plus the Unicode spaces.
_JS_SPACE = "\t\n\v\f\r    -     　﻿"


def slugify(title: str) -> str:
    """"Two Sum II" → "two-sum-ii"."""
    slug = unicodedata.normalize("NFKD", title.lower())
    slug = re.sub(rf"[^A-Za-z0-9_{_JS_SPACE}-]", "", slug)
    slug = re.sub(rf"[{_JS_SPACE}_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    slug = re.sub(r"^-|-$", "", slug)[:60]
    return slug or "problem"


def unique_slug(title: str, taken: list[str]) -> str:
    """A slug not in `taken`: two-sum, two-sum-2, two-sum-3…"""
    base = slugify(title)
    used = set(taken)
    if base not in used:
        return base
    n = 2
    while f"{base}-{n}" in used:
        n += 1
    return f"{base}-{n}"


_SLUG = re.compile(r"[a-z0-9][a-z0-9-]{0,79}")
_CODE_NAME = re.compile(r"[a-z0-9][\w-]{0,59}\.cpp", re.ASCII | re.IGNORECASE)


def is_slug(s: str) -> bool:
    return bool(_SLUG.fullmatch(s))


def is_code_name(name: str) -> bool:
    """A code file name in a problem folder: brute-force.cpp, solution-2.cpp. Not the hidden driver."""
    return bool(_CODE_NAME.fullmatch(name)) and name != "driver.cpp"


# noteTitle.ts


def note_title(content: str) -> str:
    """A note's title is its first non-empty line, without Markdown heading marks."""
    for line in content.split("\n"):
        title = js_trim(re.sub(rf"^[{_JS_SPACE}]*#+[{_JS_SPACE}]*", "", line))
        if title:
            return title
    return "Untitled note"


def next_note_name(names: list[str]) -> str:
    """note-1.md, note-2.md, … : the first one not taken."""
    taken = {n.lower() for n in names}
    i = 1
    while f"note-{i}.md" in taken:
        i += 1
    return f"note-{i}.md"


def js_trim(text: str) -> str:
    """String.prototype.trim."""
    return text.strip(_TRIM)


_TRIM = "".join(chr(c) for c in (9, 10, 11, 12, 13, 32, 0xA0, 0x1680, *range(0x2000, 0x200B), 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF))
