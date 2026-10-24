"""The contract tests: what the page relies on from the server, checked over real HTTP, SSE and WebSockets.

They were written against the Node server the editor used to have, and the Python server passed them unchanged
before the Node one was removed: uv run pytest tests/contract
"""

import sys
import tempfile
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from support.servers import DIST, Running, start  # noqa: E402


@pytest.fixture(scope="session")
def server():
    running = start(Path(tempfile.mkdtemp(prefix="contract-")) / "data")
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
