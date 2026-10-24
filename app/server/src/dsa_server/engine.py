"""Runs one Claude reply on the Claude Code engine (the `claude` program), speaking to it exactly as the Node server's
Agent SDK (@anthropic-ai/claude-agent-sdk 0.3.302) did: the same command line, settings, first messages and answers.
That keeps Claude's replies the same, since everything Claude sees comes from here and the editor tools.

The engine runs as a child process. Both sides write one JSON message per line:
  us → engine: an initialize request (system prompt, the editor tools), then the person's message
  engine → us: the reply as it streams, plus requests to run an editor tool (mcp_message) or to ask permission
After the reply's result, once the engine says it is idle, its input is closed and it exits.
"""

import asyncio
import contextlib
import os
import random
import re
import signal
import string
from collections.abc import AsyncIterator, Awaitable, Callable
from pathlib import Path

from .web import dumps, loads

SDK_VERSION = "0.3.302"
"""The Agent SDK version the Node server used; the engine is told it, as the SDK did."""

APP_DIR = Path(__file__).resolve().parents[3]
BUNDLED_ENGINE = APP_DIR / "node_modules" / "@anthropic-ai" / "claude-agent-sdk-linux-x64" / "claude"

STDERR_TAIL = 2048
RUN_END_CEILING = 600.0
"""If the engine never says it is idle after a result, its input is closed after this long anyway."""

PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"]
SERVER_INFO = {"name": "editor", "version": "1.0.0"}
CAPABILITIES = {"tools": {"listChanged": True}}


class EngineError(Exception):
    pass


class Aborted(Exception):
    """The reply was stopped (Stop, or nobody watching for too long)."""


def engine_path() -> str:
    """The engine to run: DSA_CLAUDE_CLI if set (the server's checks use a stand-in), else the one npm installed,
    else `claude` on the PATH (the Docker image puts it there)."""
    override = os.environ.get("DSA_CLAUDE_CLI")
    if override:
        return override
    return str(BUNDLED_ENGINE) if BUNDLED_ENGINE.exists() else "claude"


def _request_id() -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=10))


# Secrets that may turn up in the engine's error output are hidden before it is shown (as the SDK does).
_SECRETS = [
    (re.compile(r"\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}", re.I), r"\1<token>"),
    (re.compile(r"\b(Basic\s+)[A-Za-z0-9+/=]{8,}", re.I), r"\1<token>"),
    (re.compile(r"sk-(?=[A-Za-z0-9_-]{0,64}?[A-Za-z0-9]{20})[A-Za-z0-9_-]{20,}"), "<token>"),
    (re.compile(r"\b(gh[pousr]_)[A-Za-z0-9]{20,}"), "<token>"),
    (re.compile(r"\bAKIA[A-Z0-9]{16}\b"), "<token>"),
    (re.compile(r"AIza[\w-]{35}"), "<token>"),
]


def _redact(text: str) -> str:
    for pattern, replacement in _SECRETS:
        text = pattern.sub(replacement, text)
    return text


def _tail(text: str, n: int) -> str:
    """The last n characters (UTF-16 units), not starting halfway through a character."""
    units = text.encode("utf-16-le", "surrogatepass")
    if len(units) <= n * 2:
        return text
    cut = units[-n * 2 :]
    if 0xDC00 <= int.from_bytes(cut[:2], "little") <= 0xDFFF:
        cut = cut[2:]
    return cut.decode("utf-16-le", "replace")


ToolCall = Callable[[str, object], Awaitable[dict]]
"""Runs an editor tool on the input Claude sent; returns the MCP result ({content, isError?})."""


class Engine:
    def __init__(
        self,
        *,
        cwd: str,
        system_prompt: str,
        tools: dict,
        allowed_tools: list[str],
        call_tool: ToolCall,
        resume: str | None,
        max_turns: int = 30,
        model: str | None = None,
        effort: str | None = None,
    ):
        self.cwd = cwd
        self.system_prompt = system_prompt
        self.tools = tools
        self.allowed_tools = allowed_tools
        self.call_tool = call_tool
        self.resume = resume
        self.max_turns = max_turns
        self.model = model
        self.effort = effort
        self.process: asyncio.subprocess.Process | None = None
        self.stderr = ""
        self.write_lock = asyncio.Lock()
        self.handlers: dict[str, asyncio.Task] = {}
        self.stopped = False
        self.run_ended = False
        self.result_received = False
        self.session_state: str | None = None
        self.ceiling: asyncio.TimerHandle | None = None
        self.last_error_result: str | None = None

    def args(self) -> list[str]:
        # --effort and --model go where the SDK puts them; left out, the engine uses its own defaults.
        args = ["--output-format", "stream-json", "--verbose", "--input-format", "stream-json"]
        if self.effort:
            args.append(f"--effort={self.effort}")
        args.append(f"--max-turns={self.max_turns}")
        if self.model:
            args.append(f"--model={self.model}")
        args.append("--permission-prompt-tool=stdio")
        if self.resume:
            args.append(f"--resume={self.resume}")
        args += [f"--allowedTools={','.join(self.allowed_tools)}", "--tools=", "--setting-sources=", "--strict-mcp-config", "--include-partial-messages"]
        return args

    def env(self) -> dict[str, str]:
        env = dict(os.environ)
        env["CLAUDE_AGENT_SDK_VERSION"] = SDK_VERSION
        env["CLAUDE_CODE_SDK_READS_SESSION_STATE"] = "1"
        env.setdefault("CLAUDE_CODE_ENTRYPOINT", "sdk-ts")
        env.pop("NODE_OPTIONS", None)
        if env.get("DEBUG_CLAUDE_AGENT_SDK", "").lower() in ("1", "true", "yes", "on"):
            env["DEBUG"] = "1"
        else:
            env.pop("DEBUG", None)
        return env

    async def write(self, message: dict) -> None:
        if self.process is None or self.process.stdin is None or self.process.stdin.is_closing():
            return
        async with self.write_lock:
            with contextlib.suppress(ConnectionError, OSError):
                self.process.stdin.write((dumps(message) + "\n").encode("utf-8", "surrogatepass"))
                await self.process.stdin.drain()

    def end_input(self) -> None:
        if self.process and self.process.stdin and not self.process.stdin.is_closing():
            self.process.stdin.close()

    def end_run(self) -> None:
        if self.run_ended:
            return
        self.run_ended = True
        if self.ceiling:
            self.ceiling.cancel()
        self.end_input()

    def arm_ceiling(self) -> None:
        if self.ceiling:
            self.ceiling.cancel()
        if not self.run_ended:
            self.ceiling = asyncio.get_running_loop().call_later(RUN_END_CEILING, self.end_run)

    def stop(self) -> None:
        """Stop: the engine is ended at once."""
        self.stopped = True
        if self.process and self.process.returncode is None:
            with contextlib.suppress(ProcessLookupError):
                self.process.send_signal(signal.SIGTERM)

    # Answers to the engine's requests.

    async def mcp(self, message: dict) -> dict:
        """The editor tools' MCP server, as the SDK's in-process one answers."""
        method, rid = message.get("method"), message.get("id")
        params = message.get("params") or {}

        def result(value: dict) -> dict:
            return {"result": value, "jsonrpc": "2.0", "id": rid}

        if method == "initialize":
            asked = params.get("protocolVersion")
            version = asked if asked in PROTOCOL_VERSIONS else PROTOCOL_VERSIONS[0]
            return result({"protocolVersion": version, "capabilities": CAPABILITIES, "serverInfo": SERVER_INFO})
        if method == "ping":
            return result({})
        if method == "tools/list":
            return result(self.tools)
        if method == "tools/call":
            name = params.get("name")
            if name not in self.allowed_names:
                return result({"content": [{"type": "text", "text": f"MCP error -32602: Tool {name} not found"}], "isError": True})
            return result(await self.call_tool(name, params.get("arguments")))
        return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "Method not found"}}

    @property
    def allowed_names(self) -> set[str]:
        return {t["name"] for t in self.tools["tools"]}

    async def answer(self, request_id: str, request: dict) -> None:
        subtype = request.get("subtype")
        try:
            if subtype == "mcp_message":
                if request.get("server_name") != "editor":
                    raise EngineError(f"SDK MCP server not found: {request.get('server_name')}")
                message = request.get("message") or {}
                if "method" in message and message.get("id") is not None:
                    response = {"mcp_response": await self.mcp(message)}
                else:
                    response = {"mcp_response": {"jsonrpc": "2.0", "result": {}, "id": 0}}
            elif subtype == "can_use_tool":
                # Only the editor tools are allowed, and they never ask; anything else is turned down.
                response = {"behavior": "deny", "message": f"{request.get('tool_name')} isn't available in the editor."}
                if request.get("tool_use_id") is not None:
                    response["toolUseID"] = request["tool_use_id"]
            elif subtype == "elicitation":
                response = {"action": "decline"}
            elif subtype in ("remote_tool_call", "remote_plumbing_call", "remote_tools_probe", "remote_tools_reannounce", "request_user_dialog"):
                return
            else:
                raise EngineError(f"Unsupported control request subtype: {subtype}")
            reply = {"type": "control_response", "response": {"subtype": "success", "request_id": request_id, "response": response}}
        except asyncio.CancelledError:
            raise
        except Exception as e:
            reply = {"type": "control_response", "response": {"subtype": "error", "request_id": request_id, "error": str(e)}}
        await self.write(reply)

    def handle_request(self, message: dict) -> None:
        request_id = message.get("request_id")
        if request_id in self.handlers:
            return
        task = asyncio.ensure_future(self.answer(request_id, message.get("request") or {}))
        self.handlers[request_id] = task
        task.add_done_callback(lambda _: self.handlers.pop(request_id, None))

    # The reply.

    async def read_stderr(self) -> None:
        assert self.process and self.process.stderr
        while chunk := await self.process.stderr.read(65536):
            self.stderr = _tail(self.stderr + chunk.decode("utf-8", "replace"), STDERR_TAIL * 2)

    def stderr_tail(self) -> str:
        tail = _tail(_redact(self.stderr), STDERR_TAIL).strip()
        return f". stderr: {tail}" if tail else ""

    async def run(self, user_message: dict) -> AsyncIterator[dict]:
        """Starts the engine and yields its messages for the reply (control messages are answered here)."""
        try:
            self.process = await asyncio.create_subprocess_exec(
                engine_path(),
                *self.args(),
                cwd=self.cwd,
                env=self.env(),
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                limit=1 << 30,
            )
        except OSError as e:
            raise EngineError(f"Failed to spawn Claude Code process: {e.strerror or e}") from None
        stderr_task = asyncio.ensure_future(self.read_stderr())
        try:
            await self.write(
                {
                    "request_id": _request_id(),
                    "type": "control_request",
                    "request": {
                        "subtype": "initialize",
                        "sdkMcpServers": ["editor"],
                        "sdkMcpServerManifests": {"editor": {"initializeResult": {"protocolVersion": PROTOCOL_VERSIONS[0], "capabilities": CAPABILITIES, "serverInfo": SERVER_INFO}, "toolsListResult": self.tools}},
                        "systemPrompt": [self.system_prompt],
                    },
                }
            )
            await self.write(user_message)
            assert self.process.stdout
            while True:
                line = await self.process.stdout.readline()
                if not line:
                    break
                text = line.decode("utf-8", "replace")
                if not text.strip():
                    continue
                try:
                    message = loads(text)
                except ValueError:
                    continue
                if not isinstance(message, dict):
                    continue
                kind = message.get("type")
                if kind == "control_response" or kind == "keep_alive" or kind == "transcript_mirror":
                    continue
                if kind == "control_request":
                    self.handle_request(message)
                    continue
                if kind == "control_cancel_request":
                    continue
                if kind == "result":
                    if message.get("is_error"):
                        if message.get("subtype") == "success":
                            error = message.get("result")
                        else:
                            error = "; ".join(e.strip() for e in message.get("errors") or [] if isinstance(e, str) and e.strip())
                        self.last_error_result = error or None
                    else:
                        self.last_error_result = None
                    self.result_received = True
                    if self.session_state in (None, "idle"):
                        self.end_run()
                    else:
                        self.arm_ceiling()
                elif kind == "system" and message.get("subtype") == "session_state_changed":
                    self.session_state = message.get("state")
                    if self.session_state == "idle":
                        if self.result_received:
                            self.end_run()
                    elif not self.run_ended:
                        if self.session_state == "requires_action":
                            if self.ceiling:
                                self.ceiling.cancel()
                        elif self.result_received:
                            self.arm_ceiling()
                    if message.get("sdk_host_only") is True:
                        continue
                else:
                    self.last_error_result = None
                yield message
            code = await self.process.wait()
            await stderr_task
            if self.stopped:
                raise Aborted("Claude Code process aborted by user")
            error = None
            if code > 0:
                error = f"Claude Code process exited with code {code}{self.stderr_tail()}"
            elif code < 0:
                error = f"Claude Code process terminated by signal {signal.Signals(-code).name}{self.stderr_tail()}"
            if error:
                if self.last_error_result is not None:
                    error = f"Claude Code returned an error result: {self.last_error_result}"
                raise EngineError(error)
        finally:
            if self.ceiling:
                self.ceiling.cancel()
            for task in list(self.handlers.values()):
                task.cancel()
            if self.process.returncode is None:
                with contextlib.suppress(ProcessLookupError):
                    self.process.send_signal(signal.SIGTERM)
                with contextlib.suppress(Exception):
                    await asyncio.wait_for(self.process.wait(), 5)
            stderr_task.cancel()


async def list_models(timeout: float = 30.0) -> list[dict]:
    """The models the engine offers this login, with their effort levels, as the SDK's supportedModels() gets them:
    from the engine's answer to initialize. No message is sent, so nothing is used up."""
    engine = Engine(cwd=str(Path.home()), system_prompt="", tools={"tools": []}, allowed_tools=[], call_tool=None, resume=None)  # type: ignore[arg-type]
    try:
        process = await asyncio.create_subprocess_exec(
            engine_path(),
            *engine.args(),
            cwd=engine.cwd,
            env=engine.env(),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            limit=1 << 30,
        )
    except OSError as e:
        raise EngineError(f"Failed to spawn Claude Code process: {e.strerror or e}") from None
    assert process.stdin and process.stdout
    request_id = _request_id()
    try:
        process.stdin.write((dumps({"request_id": request_id, "type": "control_request", "request": {"subtype": "initialize"}}) + "\n").encode())
        await process.stdin.drain()
        async with asyncio.timeout(timeout):
            while line := await process.stdout.readline():
                try:
                    message = loads(line.decode("utf-8", "replace"))
                except ValueError:
                    continue
                response = message.get("response") if isinstance(message, dict) and message.get("type") == "control_response" else None
                if not isinstance(response, dict) or response.get("request_id") != request_id:
                    continue
                if response.get("subtype") != "success":
                    raise EngineError(_redact(str(response.get("error") or "Claude Code couldn't start.")))
                models = (response.get("response") or {}).get("models")
                return [m for m in models if isinstance(m, dict) and isinstance(m.get("value"), str)] if isinstance(models, list) else []
        raise EngineError("Claude Code stopped before listing its models.")
    except TimeoutError:
        raise EngineError("Claude Code took too long to list its models.") from None
    finally:
        with contextlib.suppress(Exception):
            process.stdin.close()
        with contextlib.suppress(ProcessLookupError):
            process.kill()
        await process.wait()
