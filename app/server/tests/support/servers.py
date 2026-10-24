"""Starts the editor's server (Node or Python) and the pretend Piston, each as its own process.

Shared by the contract tests and the benchmark, so both measure the same thing for either server.
"""

import os
import shutil
import socket
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

APP = Path(__file__).resolve().parents[3]
"""The app/ folder."""
DIST = APP / "packages" / "web" / "dist"
SUPPORT = Path(__file__).resolve().parent


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_until_up(url: str, process: subprocess.Popen, timeout: float = 30) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"{url} exited with code {process.returncode}")
        try:
            httpx.get(url, timeout=1)
            return
        except httpx.HTTPError:
            time.sleep(0.05)
    raise RuntimeError(f"{url} didn't start within {timeout}s")


def stop(process: subprocess.Popen) -> None:
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


@dataclass
class Running:
    kind: str
    base: str
    port: int
    piston: str
    data: Path
    process: subprocess.Popen
    piston_process: subprocess.Popen
    piston_log: Path | None = None

    def close(self) -> None:
        stop(self.process)
        stop(self.piston_process)

    def restart_piston(self) -> None:
        """Brings the pretend Piston back on the same port after a test stopped it."""
        stop(self.piston_process)
        self.piston_process = start_piston(int(self.piston.rsplit(":", 1)[1]), self.piston_log)


def server_command(kind: str) -> list[str]:
    if kind == "node":
        return ["node", "packages/server/src/main.ts"]
    if kind == "python":
        return [sys.executable, "-m", "dsa_server"]
    raise ValueError(f"Unknown server {kind!r}: use node or python")


def start_piston(port: int, log: Path | None = None) -> subprocess.Popen:
    process = subprocess.Popen([sys.executable, str(SUPPORT / "fake_piston.py"), str(port), *([str(log)] if log else [])])
    wait_until_up(f"http://127.0.0.1:{port}/api/v2/runtimes", process)
    return process


def start(kind: str, data: Path, *, extra_env: dict[str, str] | None = None, piston_log: Path | None = None) -> Running:
    """Starts the pretend Piston and the editor on a fresh data folder `data`."""
    if not (DIST / "index.html").exists():
        raise RuntimeError("Build the page first: cd app && npm run build")
    shutil.rmtree(data, ignore_errors=True)
    (data / "home").mkdir(parents=True)

    piston_port = free_port()
    piston_process = start_piston(piston_port, piston_log)
    piston = f"http://127.0.0.1:{piston_port}"

    port = free_port()
    # Nothing Claude-related from whoever runs this (a login, or a Claude Code session's own settings).
    env = {k: v for k, v in os.environ.items() if not k.startswith(("CLAUDE", "ANTHROPIC"))}
    env.update({"DATA_DIR": str(data), "PORT": str(port), "PISTON_URL": piston, "HOME": str(data / "home")})
    env.update(extra_env or {})
    process = subprocess.Popen(server_command(kind), cwd=APP, env=env, stdout=subprocess.DEVNULL)
    base = f"http://127.0.0.1:{port}"
    try:
        wait_until_up(f"{base}/api/health", process)
    except Exception:
        stop(piston_process)
        stop(process)
        raise
    return Running(kind, base, port, piston, data, process, piston_process, piston_log)
