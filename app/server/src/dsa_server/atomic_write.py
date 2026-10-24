"""Saves a file so that a crash or power cut mid-save can never leave it half-written: the content goes to a
temporary file next to it, is flushed to disk, and then replaces the file in one step (rename)."""

import os
import secrets
import time

from .own_changes import note_own_change
from .web import utf8

TEMP_SUFFIX = ".saving"
"""Temporary files end in this, so folder listings and watchers can skip them."""


def is_temp_file(name: str) -> bool:
    return name.endswith(TEMP_SUFFIX)


def write_file_atomic(file: str, content: str, exclusive: bool = False) -> None:
    """Writes `content` to `file` atomically. With `exclusive`, raises FileExistsError instead of replacing a file
    that is already there."""
    folder, name = os.path.split(file)
    temp = os.path.join(folder, f".{name}.{secrets.token_hex(4)}{TEMP_SUFFIX}")
    note_own_change(file, content)
    try:
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o666)
        try:
            data = utf8(content)
            view = memoryview(data)
            while view:
                view = view[os.write(fd, view) :]
            os.fsync(fd)
        finally:
            os.close(fd)
        # link() refuses to replace an existing file, which is what exclusive needs; rename() replaces it.
        if exclusive:
            os.link(temp, file)
        else:
            os.replace(temp, file)
    finally:
        try:
            os.unlink(temp)
        except FileNotFoundError:
            pass


LEFTOVER_MS = 10 * 60 * 1000
"""A temporary file older than this can't belong to a save still in progress."""


def remove_leftover_temp_files(folders: list[str], now: float | None = None) -> None:
    """Deletes temporary files that a crash or power cut left behind (the real files are untouched), in these
    folders and their subfolders. Missing folders are skipped."""
    now = time.time() * 1000 if now is None else now
    for folder in folders:
        for parent, _dirs, files in os.walk(folder):
            for name in files:
                if not is_temp_file(name):
                    continue
                file = os.path.join(parent, name)
                try:
                    mtime = os.stat(file).st_mtime * 1000
                except OSError:
                    continue
                if now - mtime > LEFTOVER_MS:
                    try:
                        os.unlink(file)
                    except FileNotFoundError:
                        pass
