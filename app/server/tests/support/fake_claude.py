#!/usr/bin/env python3
"""A stand-in for the `claude` CLI that the Agent SDK launches, for checking the server without a login or tokens.

It writes down everything the server's SDK sends it (arguments, the initialize request, the editor tools as the
engine would see them, the prompt, every tool result), and plays back a reply from a script. Both servers are
pointed at it with DSA_CLAUDE_CLI, so their records can be compared exactly.

  FAKE_CLAUDE_LOG     where to append the record (JSON lines)
  FAKE_CLAUDE_MODELS  the models its initialize answer lists (JSON; none if unset)
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


FAKE_URL = "https://claude.com/cai/oauth/authorize?code=true&client_id=fake&state=fake-state"
GOOD_CODE = "good-code#fake-state"


def auth(command: str) -> int:
    """`claude auth status|login|logout`, keeping a pretend login in CLAUDE_CONFIG_DIR (so a test can see which
    folder the server used). The code `good-code#fake-state` signs in as fake@example.com."""
    file = os.path.join(os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude"), "fake-login.json")
    if command == "status":
        login = json.load(open(file)) if os.path.exists(file) else None
        status = {"loggedIn": False, "authMethod": "none", "apiProvider": "firstParty"}
        if login:
            status = {"loggedIn": True, "authMethod": "claude.ai", "apiProvider": "firstParty", "email": login["email"], "orgName": "Fake Org", "subscriptionType": "pro"}
        print(json.dumps(status, indent=2))
        return 0 if login else 1
    if command == "logout":
        if os.path.exists(file):
            os.unlink(file)
        print("Successfully logged out from your Anthropic account.")
        return 0
    if command == "login":
        print("Opening browser to sign in…")
        print(f"If the browser didn't open, visit: {FAKE_URL}", flush=True)
        sys.stdout.write("Paste code here if prompted > ")
        sys.stdout.flush()
        code = sys.stdin.readline().strip()
        record("login_code", code)
        if code != GOOD_CODE:
            print("Login failed: Request failed with status code 400")
            return 1
        os.makedirs(os.path.dirname(file), exist_ok=True)
        json.dump({"email": "fake@example.com"}, open(file, "w"))
        print("Login successful.")
        return 0
    return 2


def main() -> None:
    record("argv", sys.argv[1:])
    if sys.argv[1:2] == ["auth"]:
        record("env", {k: v for k, v in sorted(os.environ.items()) if k in ("CLAUDE_CONFIG_DIR", "CLAUDE_CODE_OAUTH_TOKEN", "BROWSER")})
        sys.exit(auth(sys.argv[2] if len(sys.argv) > 2 else ""))
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
            models = json.loads(os.environ.get("FAKE_CLAUDE_MODELS") or "[]")
            response = {"commands": [], "output_style": "default", "available_output_styles": ["default"], "models": models, "account": {}} if body.get("subtype") == "initialize" else {}
            send({"type": "control_response", "response": {"subtype": "success", "request_id": msg["request_id"], "response": response}})
        elif msg.get("type") == "user":
            record("user", msg)
            run_turn(msg)
        else:
            record("other", msg)


if __name__ == "__main__":
    main()
