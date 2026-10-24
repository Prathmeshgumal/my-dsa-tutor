#!/usr/bin/env python3
"""Sits between a server's SDK and the real Claude Code engine and writes down their whole conversation:
every line each way, signals, when input ends, and how the engine exits. For learning exactly what the SDK
says to the engine, so another SDK can be checked against it.

  TEE_CLAUDE_REAL  the real engine (the claude binary)
  TEE_CLAUDE_LOG   where to append the record (JSON lines)
"""

import json
import os
import signal
import subprocess
import sys
import threading
import time

LOG = os.environ["TEE_CLAUDE_LOG"]
lock = threading.Lock()
start = time.monotonic()


def record(kind: str, value) -> None:
    with lock, open(LOG, "a") as f:
        f.write(json.dumps({"t": round(time.monotonic() - start, 3), "kind": kind, "value": value}) + "\n")


def parse(line: bytes):
    try:
        return json.loads(line)
    except ValueError:
        return line.decode(errors="replace")


record("argv", sys.argv[1:])
record("env", {k: v for k, v in sorted(os.environ.items()) if k.startswith(("CLAUDE", "ANTHROPIC")) and "KEY" not in k and "TOKEN" not in k})
child = subprocess.Popen([os.environ["TEE_CLAUDE_REAL"], *sys.argv[1:]], stdin=subprocess.PIPE, stdout=subprocess.PIPE)


def forward_signal(signum, _frame):
    record("signal", signal.Signals(signum).name)
    child.send_signal(signum)


for s in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
    signal.signal(s, forward_signal)


def pump_in():
    for line in sys.stdin.buffer:
        record("in", parse(line))
        child.stdin.write(line)
        child.stdin.flush()
    record("in_closed", None)
    child.stdin.close()


threading.Thread(target=pump_in, daemon=True).start()
for line in child.stdout:
    record("out", parse(line))
    sys.stdout.buffer.write(line)
    sys.stdout.buffer.flush()
record("exit", child.wait())
