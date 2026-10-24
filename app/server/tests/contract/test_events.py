"""/api/events: the page hears about changes made outside the editor, and not about its own saves."""

import queue
import threading
import time
import uuid

import httpx

from .helpers import check


class Listener:
    """Reads /api/events on a thread, so a test can make changes and then see what arrived."""

    def __init__(self, base: str):
        self.lines: queue.Queue[str] = queue.Queue()
        self.client = httpx.Client(base_url=base, timeout=None)
        self.ready = threading.Event()
        self.response = None
        threading.Thread(target=self._read, daemon=True).start()
        assert self.ready.wait(5)

    def _read(self):
        try:
            with self.client.stream("GET", "/api/events") as r:
                self.response = r
                for line in r.iter_lines():
                    self.lines.put(line)
                    self.ready.set()
        except httpx.HTTPError:
            pass

    def events(self, wait: float) -> list[str]:
        time.sleep(wait)
        out = []
        while not self.lines.empty():
            line = self.lines.get()
            if line.startswith("data: "):
                out.append(line.removeprefix("data: "))
        return out

    def close(self):
        self.client.close()


def test_stream_headers_and_greeting(server):
    with httpx.Client(base_url=server.base) as c, c.stream("GET", "/api/events?x=1") as r:
        check(r, 200, ctype="text/event-stream", cache="no-cache")
        assert r.headers["connection"] == "keep-alive"
        assert next(r.iter_raw()) == b": connected\n\n"


def test_only_get(client):
    check(client.post("/api/events"), 404, {"error": "Not found"})


def test_outside_changes_are_announced_once_per_burst(server, data):
    listener = Listener(server.base)
    try:
        listener.events(0.2)
        name = f"e{uuid.uuid4().hex[:6]}"
        for i in range(5):
            (data / "solutions" / f"{name}.cpp").write_text(str(i))
        (data / "notes" / f"{name}.md").write_text("x")
        sub = data / "problems" / name
        sub.mkdir()
        (sub / "deep.txt").write_text("x")
        assert sorted(listener.events(0.9)) == ['{"area":"files"}', '{"area":"notes"}', '{"area":"problems"}']
        (data / "playground" / f"{name}.json").write_text("{}")
        assert listener.events(0.9) == ['{"area":"playground"}']
    finally:
        listener.close()


def test_own_saves_are_not_announced(server, data, client):
    listener = Listener(server.base)
    try:
        listener.events(0.2)
        name = f"o{uuid.uuid4().hex[:6]}.cpp"
        client.put(f"/api/files/{name}", json={"content": "a"})
        client.put(f"/api/files/{name}", json={"content": "b"})
        client.post(f"/api/files/{name}/rename", json={"to": "r" + name})
        client.delete(f"/api/files/r{name}")
        client.put("/api/state/settings", content="{}")
        # A renamed-away name counts as the editor's own for 2 s, so this outside write is missed too.
        (data / "solutions" / name).write_text("outside")
        assert listener.events(0.9) == []
        # Other files changed meanwhile are still announced.
        (data / "solutions" / f"other-{name}").write_text("outside")
        assert listener.events(0.9) == ['{"area":"files"}']
    finally:
        listener.close()


def test_a_renamed_away_name_is_watched_again_after_2s(server, data, client):
    # The Node server failed this one: Node 24's recursive fs.watch on Linux stops reporting a name after a quick
    # save, rename and delete.
    listener = Listener(server.base)
    try:
        listener.events(0.2)
        name = f"w{uuid.uuid4().hex[:6]}.cpp"
        client.put(f"/api/files/{name}", json={"content": "a"})
        client.put(f"/api/files/{name}", json={"content": "b"})
        client.post(f"/api/files/{name}/rename", json={"to": "r" + name})
        client.delete(f"/api/files/r{name}")
        time.sleep(2.2)
        (data / "solutions" / name).write_text("outside")
        assert listener.events(0.9) == ['{"area":"files"}']
    finally:
        listener.close()


def test_temp_files_are_ignored(server, data):
    listener = Listener(server.base)
    try:
        listener.events(0.2)
        (data / "notes" / ".x.0123abcd.saving").write_text("")
        assert listener.events(0.9) == []
        (data / "notes" / ".x.0123abcd.saving").unlink()
    finally:
        listener.close()
