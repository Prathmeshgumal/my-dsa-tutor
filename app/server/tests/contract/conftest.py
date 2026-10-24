"""The contract tests: what the page relies on from the server, checked over real HTTP, SSE and WebSockets.

They run against either server, and must pass unchanged against both:
    CONTRACT_SERVER=node   uv run pytest tests/contract    (today's server: the reference)
    CONTRACT_SERVER=python uv run pytest tests/contract
"""

import os
import sys
import tempfile
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from support.servers import DIST, Running, start  # noqa: E402


@pytest.fixture(scope="session")
def server():
    kind = os.environ.get("CONTRACT_SERVER", "node")
    running = start(kind, Path(tempfile.mkdtemp(prefix="contract-")) / "data")
    yield running
    running.close()


@pytest.fixture(scope="session")
def data(server: Running) -> Path:
    return server.data


@pytest.fixture
def client(server: Running):
    with httpx.Client(base_url=server.base, timeout=10) as c:
        yield c


@pytest.fixture(scope="session")
def dist() -> Path:
    return DIST
