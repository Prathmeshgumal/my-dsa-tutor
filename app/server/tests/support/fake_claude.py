#!/usr/bin/env python3
"""A stand-in for the `claude` CLI that the Agent SDK launches, for checking the server without a login or tokens.

It writes down everything the server's SDK sends it (arguments, the initialize request, the editor tools as the
engine would see them, the prompt, every tool result), and plays back a reply from a script. Both servers are
pointed at it with DSA_CLAUDE_CLI, so their records can be compared exactly.

  FAKE_CLAUDE_LOG     where to append the record (JSON lines)
  FAKE_CLAUDE_SCRIPT  the reply: a JSON list of steps
      {"emit": {...}}                     a message to print as the engine would (session_id is filled in)
      {"call": "read_file", "args": {}}   call an editor tool; its result is recorded and sent back as a tool_result
"""

import json
import os
import sys

SESSION = "00000000-0000-4000-8000-000000000001"
LOG = os.environ.get("FAKE_CLAUDE_LOG")
SCRIPT = os.environ.get("FAKE_CLAUDE_SCRIPT")
counter = 0


def record(kind: str, value) -> None:
    if LOG:
        with open(LOG, "a") as f:
            f.write(json.dumps({"kind": kind, "value": value}) + "\n")


def send(message: dict) -> None:
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


def read() -> dict | None:
    line = sys.stdin.readline()
    if not line:
        return None
    return json.loads(line)


def request(body: dict) -> dict:
    """Sends a control request to the SDK and waits for its answer, recording anything else that arrives."""
    global counter
    counter += 1
    rid = f"fake_{counter}"
    send({"type": "control_request", "request_id": rid, "request": body})
    while True:
        msg = read()
        if msg is None:
            sys.exit(0)
        if msg.get("type") == "control_response" and msg["response"].get("request_id") == rid:
            return msg["response"]
        record("unexpected", msg)


def mcp(method: str, params: dict | None = None, notify: bool = False) -> dict:
    message = {"jsonrpc": "2.0", "method": method, **({"params": params} if params is not None else {})}
    if not notify:
        message["id"] = counter + 1
    answer = request({"subtype": "mcp_message", "server_name": "editor", "message": message})
    return answer.get("response", {}).get("mcp_response", answer)


def run_turn(user: dict) -> None:
    mcp("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "fake-claude", "version": "0"}})
    mcp("notifications/initialized", notify=True)
    tools = mcp("tools/list", {})
    record("tools", tools.get("result", tools))
    send({"type": "system", "subtype": "init", "session_id": SESSION, "cwd": os.getcwd(), "tools": [], "mcp_servers": [{"name": "editor", "status": "connected"}], "model": "fake", "permissionMode": "default", "apiKeySource": "none", "uuid": "00000000-0000-4000-8000-0000000000aa"})
    steps = json.load(open(SCRIPT)) if SCRIPT else []
    for step in steps:
        if "emit" in step:
            send({**step["emit"], "session_id": SESSION})
        elif "call" in step:
            answer = mcp("tools/call", {"name": step["call"], "arguments": step.get("args", {})})
            result = answer.get("result", answer)
            record("tool_result", {"name": step["call"], "result": result})
            send({"type": "user", "parent_tool_use_id": None, "session_id": SESSION, "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": step.get("id", "toolu_1"), "content": result.get("content", [])}]}})
    record("done", None)


def main() -> None:
    record("argv", sys.argv[1:])
    # Values too (they can change how the engine behaves), except secrets and what differs on every run.
    changing = ("TOKEN", "KEY", "SOCKET", "SESSION_ID", "PID", "EXECPATH")
    record("env", {k: ("<varies>" if any(c in k for c in changing) else v) for k, v in sorted(os.environ.items()) if k.startswith(("CLAUDE", "ANTHROPIC"))})
    while True:
        msg = read()
        if msg is None:
            return
        if msg.get("type") == "control_request":
            body = msg["request"]
            record("control_request", body)
            response = {"commands": [], "output_style": "default", "available_output_styles": ["default"], "models": [], "account": {}} if body.get("subtype") == "initialize" else {}
            send({"type": "control_response", "response": {"subtype": "success", "request_id": msg["request_id"], "response": response}})
        elif msg.get("type") == "user":
            record("user", msg)
            run_turn(msg)
        else:
            record("other", msg)


if __name__ == "__main__":
    main()
