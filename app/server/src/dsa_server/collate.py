"""JavaScript's `a.localeCompare(b)` (ICU, root order), for sorting names exactly as the Node server did.

Names that are all ASCII, which is nearly all of them, use a table read off ICU's own order: punctuation, then
digits, then letters, case ignored first and lowercase before uppercase after. Anything else falls back to the
Unicode Collation Algorithm (pyuca), loaded the first time it's needed. tests/test_collate.py checks both
against Node on thousands of random names.
"""

import re
from functools import cache

# ICU's primary order for printable ASCII; characters in one group differ only in case.
_GROUPS = [" ", "_", "-", ",", ";", ":", "!", "?", ".", "'", '"', "(", ")", "[", "]", "{", "}", "@", "*", "/", "\\", "&", "#", "%", "`", "^", "+", "<", "=", ">", "|", "~", "$", *"0123456789", *(c + c.upper() for c in "abcdefghijklmnopqrstuvwxyz")]
_PRIMARY = {c: i for i, group in enumerate(_GROUPS) for c in group}
_TERTIARY = {c: 1 if c.isupper() else 0 for c in _PRIMARY}
_DIGIT = _PRIMARY["0"]
_DIGITS = re.compile(r"[0-9]+")


def _ascii_key(name: str, numeric: bool) -> tuple:
    primary: list[tuple] = []
    tertiary: list[int] = []
    i = 0
    while i < len(name):
        if numeric and name[i].isdigit():
            run = _DIGITS.match(name, i)[0]  # type: ignore[index]
            # A number counts by its value, leading zeros ignored, as with { numeric: true }.
            value = run.lstrip("0") or "0"
            primary.append((_DIGIT, len(value), value))
            tertiary.append(0)
            i += len(run)
            continue
        c = name[i]
        primary.append((_PRIMARY[c], 0, ""))
        tertiary.append(_TERTIARY[c])
        i += 1
    return (tuple(primary), tuple(tertiary))


@cache
def _collator():
    from pyuca import Collator

    return Collator()


def _is_plain_ascii(name: str) -> bool:
    return all(c in _PRIMARY for c in name)


def sort_names(names: list[str], numeric: bool = False) -> list[str]:
    """`names.sort((a, b) => a.localeCompare(b, undefined, { numeric }))`. Stable, like Array.sort."""
    if all(_is_plain_ascii(n) for n in names):
        return sorted(names, key=lambda n: _ascii_key(n, numeric))
    collator = _collator()
    if not numeric:
        return sorted(names, key=collator.sort_key)

    def key(name: str):
        # Each number becomes its digit count then its digits (7 → 017), so it sorts by value among digits.
        return collator.sort_key(_DIGITS.sub(lambda m: f"{len(v := m[0].lstrip('0') or '0'):02d}{v}", name))

    return sorted(names, key=key)
