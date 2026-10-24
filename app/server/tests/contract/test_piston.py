"""/piston: plain requests and interactive runs (WebSockets) passed through to Piston untouched."""

import json
import socket
import time

import httpx
import pytest
from websockets.sync.client import connect

from .helpers import JSON, check


def test_requests_are_passed_through(client):
    r = client.post("/piston/execute?x=1", content='{"code":"int main(){}"}', headers={"content-type": "application/json"})
    check(r, 200, {"method": "POST", "path": "/api/v2/execute", "query": "x=1", "body": '{"code":"int main(){}"}'}, ctype=JSON)
    assert client.get("/piston").json()["path"] == "/api/v2"
    assert client.delete("/piston/x/y").json() == {"method": "DELETE", "path": "/api/v2/x/y", "query": "", "body": ""}
    assert client.get("/piston/runtimes").json()[0]["language"] == "c++"


def test_pistonish_names_are_not_piston(client):
    check(client.get("/pistons"), 200, ctype="text/html; charset=utf-8")


def test_piston_down_is_a_clear_502(server):
    server.piston_process.terminate()
    server.piston_process.wait()
    try:
        with httpx.Client(base_url=server.base) as c:
            check(c.get("/piston/runtimes"), 502, {"error": "Couldn’t reach Piston. Is it running? (docker compose up -d)"}, ctype=JSON)
            h = c.get("/api/health").json()["piston"]
            assert h["ok"] is False
        with pytest.raises(Exception):
            connect(f"ws://127.0.0.1:{server.port}/piston/connect", open_timeout=5).close()
    finally:
        server.restart_piston()


def test_a_dropped_request_leaves_the_server_fine(server):
    s = socket.create_connection(("127.0.0.1", server.port))
    s.sendall(b"GET /piston/hang HTTP/1.1\r\nHost: localhost\r\n\r\n")
    time.sleep(0.2)
    s.close()
    with httpx.Client(base_url=server.base) as c:
        check(c.get("/api/files"), 200)


def test_interactive_run(server):
    with connect(f"ws://127.0.0.1:{server.port}/piston/connect") as ws:
        ws.send(json.dumps({"type": "init", "language": "c++", "version": "*", "files": [{"content": "x"}]}))
        assert json.loads(ws.recv(5)) == {"type": "stage", "stage": "run"}
        assert json.loads(ws.recv(5))["data"] == "Name? "
        ws.send(json.dumps({"type": "data", "stream": "stdin", "data": "Ada\n"}))
        assert json.loads(ws.recv(5))["data"] == "hi Ada\n"
        assert json.loads(ws.recv(5))["type"] == "exit"


@pytest.mark.parametrize(
    ("path", "headers"),
    [("/piston/connect", {"Host": "evil.example"}), ("/piston/connect", {"Origin": "http://evil.example"}), ("/api/events", {})],
)
def test_refused_upgrades(server, path, headers):
    s = socket.create_connection(("127.0.0.1", server.port))
    request = {"Host": "localhost", "Upgrade": "websocket", "Connection": "Upgrade", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", "Sec-WebSocket-Version": "13", **headers}
    s.sendall(f"GET {path} HTTP/1.1\r\n".encode() + "".join(f"{k}: {v}\r\n" for k, v in request.items()).encode() + b"\r\n")
    s.settimeout(5)
    answer = b""
    while chunk := s.recv(4096):
        answer += chunk
    s.close()
    assert answer == b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"


def test_a_dropped_websocket_leaves_the_server_fine(server):
    s = socket.create_connection(("127.0.0.1", server.port))
    s.sendall(b"GET /piston/connect HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n")
    s.close()
    time.sleep(0.2)
    test_interactive_run(server)
