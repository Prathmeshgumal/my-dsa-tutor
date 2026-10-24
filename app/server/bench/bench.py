"""Measures the editor's server the way the page uses it, against the Node server it replaced.

    uv run python bench/bench.py           # median of 3 runs, saves bench/results-python.json
    uv run python bench/bench.py compare   # against bench/results-node.json, measured before Node was removed

The budget: every timing within max(+10 %, +2 ms) of Node's; idle memory within +30 MB. Timings depend on the
computer, so compare numbers measured on the same one.
"""

import json
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

import httpx
from websockets.sync.client import connect

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tests.support.servers import DIST, SUPPORT, free_port, start, stop, wait_until_up  # noqa: E402

HERE = Path(__file__).resolve().parent
ROUNDS = 300
RUNS = 3
"""One run's p95 moves 10-60 % between runs on the same server, so each result is the median of several runs."""
WARMUP = 30


def percentiles(samples: list[float]) -> dict:
    ms = sorted(s * 1000 for s in samples)
    return {"p50": round(statistics.median(ms), 3), "p95": round(ms[int(len(ms) * 0.95) - 1], 3)}


def timed(fn, rounds=ROUNDS, warmup=WARMUP) -> dict:
    for _ in range(warmup):
        fn()
    samples = []
    for _ in range(rounds):
        t = time.perf_counter()
        fn()
        samples.append(time.perf_counter() - t)
    return percentiles(samples)


def rss_mb(pid: int) -> float:
    for line in Path(f"/proc/{pid}/status").read_text().splitlines():
        if line.startswith("VmRSS:"):
            return round(int(line.split()[1]) / 1024, 1)
    raise RuntimeError("no VmRSS")


def measure() -> dict:
    results: dict = {}
    with tempfile.TemporaryDirectory() as tmp:
        data = Path(tmp) / "data"
        t = time.perf_counter()
        server = start(data)
        results["startup_ms"] = round((time.perf_counter() - t) * 1000)
        try:
            time.sleep(1)
            results["idle_memory_mb"] = rss_mb(server.process.pid)
            # A realistic folder: 60 solutions of a few KB each.
            for i in range(60):
                (data / "solutions" / f"problem_{i:02}.cpp").write_text("#include <bits/stdc++.h>\n" + "int x;\n" * 300)
            state = json.dumps({"chats": ["m" * 1000] * 1000})  # about 1 MB, a long chat history
            asset = next(p.name for p in (DIST / "assets").iterdir() if p.suffix == ".js")
            with httpx.Client(base_url=server.base, timeout=30) as c:
                c.put("/api/state/ai", content=state)
                results["list_files"] = timed(lambda: c.get("/api/files").raise_for_status())
                results["save_file"] = timed(lambda: c.put("/api/files/bench.cpp", json={"content": "int main() {}\n" * 100}).raise_for_status())
                results["get_state"] = timed(lambda: c.get("/api/state").raise_for_status(), rounds=100)
                results["put_state_1mb"] = timed(lambda: c.put("/api/state/ai", content=state).raise_for_status(), rounds=100)
                results["page"] = timed(lambda: c.get("/").raise_for_status())
                results["static_asset"] = timed(lambda: c.get(f"/assets/{asset}").raise_for_status(), rounds=100)
                results["health"] = timed(lambda: c.get("/api/health").raise_for_status(), rounds=100)
                body = json.dumps({"language": "c++", "version": "*", "files": [{"content": "int main(){}" * 50}]})
                with httpx.Client(base_url=server.piston) as direct:
                    plain = timed(lambda: direct.post("/api/v2/execute", content=body).raise_for_status())
                through = timed(lambda: c.post("/piston/execute", content=body).raise_for_status())
                results["piston_http_overhead"] = {k: round(through[k] - plain[k], 3) for k in through}
            results["piston_ws_first_output"], results["piston_ws_stdin_round_trip"] = websocket_timings(server)
            results["file_event_latency"] = event_latency(server, data)
        finally:
            server.close()
        results["chat_first_text"], results["chat_with_tool"] = chat_timings(Path(tmp))
    return results


CHATS = 10


def chat_timings(tmp: Path) -> tuple[dict, dict]:
    """Claude chat with the real engine, against a stand-in for Anthropic's API that answers at once: what the
    server and engine add before Claude's first words arrive, and for a whole reply that uses one tool."""
    first_text, whole = [], []
    replies, log = tmp / "replies.json", tmp / "api.log"
    look = [{"type": "text", "text": "Let me look."}, {"type": "tool_use", "id": "toolu_01", "name": "mcp__editor__list_files", "input": {}}]
    replies.write_text(json.dumps([look, [{"type": "text", "text": "Done."}]] * (CHATS + 2)))
    port = free_port()
    api = subprocess.Popen([sys.executable, str(SUPPORT / "fake_anthropic.py"), str(port), str(log), str(replies)])
    wait_until_up(f"http://127.0.0.1:{port}/health", api)
    env = {"ANTHROPIC_BASE_URL": f"http://127.0.0.1:{port}", "ANTHROPIC_API_KEY": "sk-ant-fake-key", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": "1"}
    server = start(tmp / "chat-data", extra_env=env)
    try:
        with httpx.Client(base_url=server.base, timeout=120) as c:
            for i in range(CHATS + 2):
                t = time.perf_counter()
                text_at = None
                with c.stream("POST", "/api/claude/chat", json={"message": "hello"}) as r:
                    for line in r.iter_lines():
                        if line.startswith("data: ") and json.loads(line[6:])["type"] == "text" and text_at is None:
                            text_at = time.perf_counter()
                done = time.perf_counter()
                if i >= 2:
                    first_text.append(text_at - t)
                    whole.append(done - t)
    finally:
        server.close()
        stop(api)
    return percentiles(first_text), percentiles(whole)


def websocket_timings(server) -> tuple[dict, dict]:
    """Interactive runs: time from sending the code to the first output, and from typing a line to the answer."""
    first, round_trip = [], []
    for i in range(WARMUP + 100):
        with connect(f"ws://127.0.0.1:{server.port}/piston/connect") as ws:
            t = time.perf_counter()
            ws.send(json.dumps({"type": "init", "language": "c++", "version": "*", "files": [{"content": "x"}]}))
            ws.recv(5)
            ws.recv(5)
            t1 = time.perf_counter()
            ws.send(json.dumps({"type": "data", "stream": "stdin", "data": "Ada\n"}))
            ws.recv(5)
            t2 = time.perf_counter()
            ws.recv(5)
            if i >= WARMUP:
                first.append(t1 - t)
                round_trip.append(t2 - t1)
    return percentiles(first), percentiles(round_trip)


def event_latency(server, data: Path) -> dict:
    """From a file changing outside the editor to the page hearing about it (includes the 300 ms settle)."""
    got = threading.Event()

    def listen():
        try:
            with httpx.Client(base_url=server.base, timeout=None) as c, c.stream("GET", "/api/events") as r:
                for line in r.iter_lines():
                    if line.startswith("data: "):
                        got.set()
        except httpx.HTTPError:
            pass  # the server stopped at the end of the run

    threading.Thread(target=listen, daemon=True).start()
    time.sleep(0.5)
    samples = []
    for i in range(20):
        got.clear()
        t = time.perf_counter()
        (data / "notes" / f"bench-{i}.md").write_text("x")
        assert got.wait(5), "no event"
        samples.append(time.perf_counter() - t)
        time.sleep(0.1)
    return percentiles(samples)


def median_of(runs: list[dict]) -> dict:
    out = {}
    for key, first in runs[0].items():
        if isinstance(first, dict):
            out[key] = {stat: round(statistics.median(r[key][stat] for r in runs), 3) for stat in first}
        else:
            out[key] = round(statistics.median(r[key] for r in runs), 1)
    return out


def compare() -> int:
    node = json.loads((HERE / "results-node.json").read_text())
    python = json.loads((HERE / "results-python.json").read_text())
    failures = 0
    print(f"{'measure':28} {'node':>12} {'python':>12}  ok")
    for key, n in node.items():
        p = python[key]
        if isinstance(n, dict):
            for stat in ("p50", "p95"):
                limit = max(n[stat] * 1.1, n[stat] + 2)
                ok = p[stat] <= limit
                failures += not ok
                print(f"{key + ' ' + stat:28} {n[stat]:>10.3f}ms {p[stat]:>10.3f}ms  {'✓' if ok else '✗'}")
        else:
            limit = n + 30 if key == "idle_memory_mb" else max(n * 1.1, n + 2)
            ok = p <= limit
            failures += not ok
            print(f"{key:28} {n:>12} {p:>12}  {'✓' if ok else '✗'}")
    print("within budget" if not failures else f"{failures} over budget")
    return 1 if failures else 0


if __name__ == "__main__":
    if sys.argv[1:] == ["compare"]:
        sys.exit(compare())
    out = median_of([measure() for _ in range(RUNS)])
    (HERE / "results-python.json").write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out, indent=2))
