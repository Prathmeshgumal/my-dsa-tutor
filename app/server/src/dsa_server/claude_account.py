"""Which Claude account the Claude panel uses, and signing in and out of it (the Setup dialog).
  GET  /api/claude/account               → Account: { signedIn, method?, email?, plan?, org? }
  POST /api/claude/account/login         → { url }: a sign-in has started. Open url, approve, and copy the code shown
  POST /api/claude/account/login/code    { code } → Account, once Claude accepts the code
  POST /api/claude/account/login/cancel  → 204: the sign-in that was started is dropped
  POST /api/claude/account/logout        → Account
Each one runs the engine's own `claude auth` command on the editor's login folder (engine.claude_env), never on the
login your terminal's Claude Code uses.
"""

import asyncio
import contextlib
import re
from collections.abc import Callable

from .engine import _redact, claude_env, engine_path
from .log import Logger
from .web import Request, dumps, loads

ROUTE = "/api/claude/account"
LOGIN_ROUTE = "/api/claude/account/login"
CODE_ROUTE = "/api/claude/account/login/code"
CANCEL_ROUTE = "/api/claude/account/login/cancel"
LOGOUT_ROUTE = "/api/claude/account/logout"

COMMAND_TIMEOUT = 30.0
"""`claude auth status` and `logout` answer in about a second; this is how long before giving up."""
URL_TIMEOUT = 30.0
"""How long `claude auth login` may take to print its sign-in link."""
CODE_TIMEOUT = 60.0
"""How long Claude may take to check a pasted code."""
LOGIN_EXPIRES = 15 * 60.0
"""A started sign-in nobody finishes is dropped after this long."""
MAX_CODE = 2000

AUTHORIZE = re.compile(r"https://\S+/oauth/authorize\?\S+")
PROMPT = "Paste code here if prompted >"


class AccountError(Exception):
    """Something to tell the person, worded for them."""


def env() -> dict[str, str]:
    # The page opens the sign-in link itself; the server shouldn't also try to open a browser where it runs.
    return {**claude_env(), "BROWSER": "true"}


def parse_status(text: str) -> dict:
    """`claude auth status --json`, cut down to what the Setup dialog shows."""
    try:
        status = loads(text)
    except ValueError:
        status = None
    if not isinstance(status, dict):
        raise AccountError("Couldn’t read Claude’s sign-in status.")
    if status.get("loggedIn") is not True:
        return {"signedIn": False}
    account: dict = {"signedIn": True}
    for key, field in (("method", "authMethod"), ("email", "email"), ("plan", "subscriptionType"), ("org", "orgName")):
        if isinstance(status.get(field), str) and status[field]:
            account[key] = status[field]
    return account


def failure(output: str) -> str:
    """The last thing `claude auth login` said, as advice."""
    lines = [line.replace(PROMPT, "").strip() for line in output.splitlines()]
    last = next((line for line in reversed(lines) if line), "")
    if "status code 400" in last or "invalid" in last.lower():
        return "Claude didn’t accept that code. Copy the whole code from the sign-in page (or start again: each code works once)."
    return _redact(last) or "Signing in didn’t finish. Start again."


async def run(*args: str) -> tuple[int, str]:
    try:
        process = await asyncio.create_subprocess_exec(
            engine_path(), "auth", *args, env=env(), stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
        )
    except OSError as e:
        raise AccountError(f"Couldn’t start Claude Code: {e.strerror or e}") from None
    try:
        out, _ = await asyncio.wait_for(process.communicate(), COMMAND_TIMEOUT)
    except TimeoutError:
        with contextlib.suppress(ProcessLookupError):
            process.kill()
        await process.wait()
        raise AccountError("Claude Code took too long to answer.") from None
    return process.returncode or 0, out.decode("utf-8", "replace")


async def status() -> dict:
    # Signed out, it exits 1 but still prints the status.
    _, out = await run("status", "--json")
    return parse_status(out)


class Login:
    """The one sign-in in progress: `claude auth login`, waiting for the code its link shows after you approve."""

    def __init__(self):
        self.process: asyncio.subprocess.Process | None = None
        self.output = ""
        self.expiry: asyncio.TimerHandle | None = None
        self.lock = asyncio.Lock()

    async def start(self) -> str:
        async with self.lock:
            await self._drop()
            try:
                self.process = await asyncio.create_subprocess_exec(
                    engine_path(), "auth", "login", env=env(), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
                )
            except OSError as e:
                raise AccountError(f"Couldn’t start Claude Code: {e.strerror or e}") from None
            self.output = ""
            assert self.process.stdout
            try:
                async with asyncio.timeout(URL_TIMEOUT):
                    while line := await self.process.stdout.readline():
                        text = line.decode("utf-8", "replace")
                        self.output += text
                        found = AUTHORIZE.search(text)
                        if found:
                            self.expiry = asyncio.get_running_loop().call_later(LOGIN_EXPIRES, lambda: asyncio.ensure_future(self.cancel()))
                            return found.group(0)
            except TimeoutError:
                pass
            output = self.output
            await self._drop()
            raise AccountError(failure(output) if output.strip() else "Claude Code didn’t give a sign-in link.")

    async def finish(self, code: str) -> None:
        async with self.lock:
            process = self.process
            if process is None or process.returncode is not None or process.stdin is None:
                raise AccountError("That sign-in has ended. Click Sign in to start again.")
            try:
                process.stdin.write((code + "\n").encode())
                await process.stdin.drain()
                process.stdin.close()
                assert process.stdout
                rest = await asyncio.wait_for(process.stdout.read(), CODE_TIMEOUT)
                await asyncio.wait_for(process.wait(), CODE_TIMEOUT)
            except (TimeoutError, ConnectionError, BrokenPipeError):
                await self._drop()
                raise AccountError("Claude took too long to check the code. Start again.") from None
            output = self.output + rest.decode("utf-8", "replace")
            ok = process.returncode == 0 and "Login failed" not in output
            await self._drop()
            if not ok:
                raise AccountError(failure(output))

    async def cancel(self) -> None:
        async with self.lock:
            await self._drop()

    async def _drop(self) -> None:
        if self.expiry:
            self.expiry.cancel()
            self.expiry = None
        process, self.process = self.process, None
        if process and process.returncode is None:
            with contextlib.suppress(ProcessLookupError):
                process.kill()
            await process.wait()


def account_routes(logger: Logger, on_change: Callable[[], None], login: Login | None = None):
    """`on_change` runs after the account changes (the model list depends on it)."""
    login = login or Login()
    json_headers = {"Content-Type": "application/json", "Cache-Control": "no-store"}

    async def answer(req: Request, work) -> None:
        try:
            result = await work()
        except AccountError as e:
            await req.respond(400, dumps({"error": str(e)}), json_headers)
            return
        if result is None:
            await req.respond(204)
        else:
            await req.respond(200, dumps(result), json_headers)

    async def finish(req: Request):
        body = await req.json_object()
        code = body.get("code") if body is not None else None
        code = code.strip() if isinstance(code, str) else ""
        if not code or len(code) > MAX_CODE or any(c in code for c in "\r\n"):
            raise AccountError("Paste the code from the sign-in page.")
        await login.finish(code)
        on_change()
        logger.log("info", "Signed in to Claude from the Setup dialog")
        return await status()

    async def logout(req: Request):
        await login.cancel()
        code, out = await run("logout")
        on_change()
        if code != 0:
            raise AccountError(failure(out))
        logger.log("info", "Signed out of Claude from the Setup dialog")
        return await status()

    async def start(req: Request):
        return {"url": await login.start()}

    async def cancel(req: Request):
        await login.cancel()

    async def get_status(req: Request):
        return await status()

    posts = {LOGIN_ROUTE: start, CODE_ROUTE: finish, CANCEL_ROUTE: cancel, LOGOUT_ROUTE: logout}

    async def handle(req: Request) -> bool:
        if req.path == ROUTE and req.method == "GET":
            await answer(req, lambda: get_status(req))
            return True
        work = posts.get(req.path)
        if work is None or req.method != "POST":
            return False
        await answer(req, lambda: work(req))
        return True

    return handle
