"""Remembers the changes the server itself just made to the data folders, so the folder watcher (folder_events.py)
only tells the browser about changes made outside the editor, e.g. in VS Code."""

import hashlib
import os
import time

from .web import utf8

WINDOW_MS = 2000
"""How long after the server touches a path its watcher events are still treated as its own."""

# A write is recognised by what it wrote; deletes, renames and new folders by when they happened.
_recent: dict[str, tuple[float, str | None]] = {}


def _hash(content: str) -> str:
    return hashlib.sha1(utf8(content)).hexdigest()


def _now() -> float:
    return time.time() * 1000


def note_own_change(file: str, content: str | None = None, now: float | None = None) -> None:
    """Call when the server writes (with the content), renames or deletes `file`. Without content, a folder covers
    everything inside it."""
    now = _now() if now is None else now
    _recent[os.path.abspath(file)] = (now, None if content is None else _hash(content))
    if len(_recent) > 500:
        for p, (at, _) in list(_recent.items()):
            if now - at > WINDOW_MS:
                del _recent[p]


def is_own_change(file: str, now: float | None = None) -> bool:
    """Whether a watcher event for `file` is the server's own doing."""
    now = _now() if now is None else now
    target = os.path.abspath(file)
    written = _recent.get(target)
    # A file the server wrote: it's ours only while it still holds exactly what we wrote, however soon after
    # our write someone else changed it.
    if written and written[1] is not None:
        current = None
        if now - written[0] <= WINDOW_MS:
            try:
                with open(target, "rb") as f:
                    current = f.read()
            except OSError:
                current = None
        if current is not None and _hash(current.decode("utf-8", errors="replace")) == written[1]:
            return True
        # Changed by someone else (or long ago): from now on the file's changes aren't ours.
        _recent.pop(target, None)
        return False
    for p, (at, digest) in _recent.items():
        if digest is not None or now - at > WINDOW_MS:
            continue
        if target == p or target.startswith(p + os.sep):
            return True
    return False
