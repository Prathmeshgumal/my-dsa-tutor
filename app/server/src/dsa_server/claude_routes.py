"""The editor's Claude agent (the Claude Code engine, using the existing Claude Code login).
  POST /api/claude/chat      { message, sessionId, context, model?, effort? } → one turn, streamed as server-sent events
  GET  /api/claude/models                                    → the models (and their effort levels) the engine offers
  GET  /api/claude/turns/:id?after=n                         → the same turn's events after the nth (reconnect)
  POST /api/claude/turns/:id/stop                            → stops the turn
  POST /api/claude/approval  { id, approved }                → the user's answer to a proposed change
  POST /api/claude/apply     { change }                      → applies a proposal Claude stopped waiting for
The agent can only use the editor tools in editor_tools.py: Claude Code's own tools, the user's settings,
CLAUDE.md, plugins and MCP servers are all switched off.
"""

import asyncio
import contextlib
import re
import uuid
from collections.abc import Awaitable, Callable
from pathlib import Path

import httpx

from .changes import ToolError, apply_change, parse_change
from .core import js_trim, language_from_filename
from .editor_tools import TOOL_NAMES, TOOLS, EditorTools, js_length
from .engine import Aborted, Engine, EngineError, list_models
from .log import Logger
from .runner import PistonRunner
from .tool_inputs import UNDEFINED, check_input
from .web import Request, dumps, js_to_number, loads

ROUTE = "/api/claude/chat"
APPROVAL_ROUTE = "/api/claude/approval"
APPLY_ROUTE = "/api/claude/apply"
MODELS_ROUTE = "/api/claude/models"
TURN_ROUTE = re.compile(r"/api/claude/turns/([\w-]+)(/stop)?", re.ASCII)

SYSTEM_PROMPT = (Path(__file__).parent / "data" / "system_prompt.md").read_text(encoding="utf-8")
TOOL_PREFIX = "mcp__editor__"
IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"]
MAX_IMAGES = 5
MAX_IMAGE_BYTES = 5 * 1024 * 1024
"""Claude's limit is 5 MB per image; base64 makes that about 6.7M characters."""
PROGRESS_EVERY = 1000
"""Report tool-input progress at most once per this many characters."""
KEEP_FINISHED = 10 * 60.0
"""How long a finished turn's events stay available for a reconnect."""
STOP_UNWATCHED = 15 * 60.0
"""A running turn nobody is connected to is stopped after this long (it may be waiting on an approval)."""

Send = Callable[[dict], None]


def build_prompt(message: str, context: dict) -> str:
    lines = ["<editor_context>"]
    active = context["activeFile"]
    if active:
        language = language_from_filename(active["name"])
        lines += [f"The user is looking at `{active['name']}` in the editor. Its current contents:", "```" + (language["monaco"] if language else ""), active["content"], "```"]
    else:
        lines.append("No file is open in the editor right now.")
    others = [n for n in context["openFiles"] if n != (active["name"] if active else None)]
    if others:
        lines.append(f"Other open tabs: {', '.join(others)}")
    note = context["openNote"]
    if note:
        lines.append(f"Open in the Notes panel: {note['name']} ({note['title']})")
    problem = context["openProblem"]
    if problem:
        file = problem.get("file")
        shown = f", with its {file} open in the editor" if file and file != "solution.cpp" else ""
        lines.append(f'The Problem screen is showing "{problem["title"]}" (slug {problem["slug"]}){shown}; use get_problem to read it.')
    lines += ["</editor_context>", "", message]
    return "\n".join(lines)


def _join(values) -> str:
    """Array.join("\\n"): null and undefined become empty."""
    return "\n".join("" if v is None else v if isinstance(v, str) else dumps(v) if isinstance(v, (int, float, bool)) else str(v) for v in values)


class EventMapper:
    """Turns engine messages into the few events the chat UI needs (top-level agent only). One per reply."""

    def __init__(self):
        self.sent_text = False
        self.progress: dict | None = None

    def __call__(self, message: dict) -> list[dict]:
        top_level = "parent_tool_use_id" in message and message["parent_tool_use_id"] is None
        kind = message.get("type")
        if kind == "stream_event" and top_level:
            event = message.get("event") or {}
            if event.get("type") == "content_block_start":
                block = event["content_block"]
                # A new text block after earlier text (e.g. after a tool call) starts a new paragraph.
                if block.get("type") == "text" and self.sent_text:
                    return [{"type": "text", "text": "\n\n"}]
                if block.get("type") == "tool_use":
                    self.progress = {"name": block["name"].replace(TOOL_PREFIX, "", 1), "chars": 0, "reported": 0}
                    return [{"type": "tool_progress", "name": self.progress["name"], "chars": 0}]
                return []
            if event.get("type") == "content_block_delta":
                delta = event["delta"]
                if delta.get("type") == "text_delta":
                    self.sent_text = True
                    return [{"type": "text", "text": delta["text"]}]
                if delta.get("type") == "input_json_delta" and self.progress:
                    self.progress["chars"] += js_length(delta["partial_json"])
                    if self.progress["chars"] - self.progress["reported"] >= PROGRESS_EVERY:
                        self.progress["reported"] = self.progress["chars"]
                        return [{"type": "tool_progress", "name": self.progress["name"], "chars": self.progress["chars"]}]
            return []
        if kind == "assistant" and top_level:
            return [
                {"type": "tool", "name": block["name"].replace(TOOL_PREFIX, "", 1), "detail": block["input"]["name"] if isinstance(block.get("input"), dict) and isinstance(block["input"].get("name"), str) else ""}
                for block in message["message"]["content"]
                if block.get("type") == "tool_use"
            ]
        if kind == "result":
            if message.get("subtype") == "success" and not message.get("is_error"):
                return [{"type": "done"}]
            errors = message.get("errors", []) if "errors" in message else []
            return [{"type": "error", "message": _join(errors) or "Claude stopped with an error."}]
        return []


def parse_images(raw) -> list[dict] | str:
    """Images from the request, or a reason they can't be sent."""
    if raw is None:
        return []
    if not isinstance(raw, list):
        return '"images" must be a list'
    if len(raw) > MAX_IMAGES:
        return f"At most {MAX_IMAGES} images per message"
    images = []
    for img in raw:
        media_type = img.get("mediaType") if isinstance(img, dict) else None
        if not isinstance(media_type, str) or media_type not in IMAGE_TYPES:
            return "Images must be PNG, JPEG, GIF or WebP"
        data = img.get("data")
        if not isinstance(data, str) or not data:
            return "Image data is missing"
        # base64 → bytes is 3/4 of the length
        if js_length(data) * 3 / 4 > MAX_IMAGE_BYTES:
            return "Each image must be under 5 MB"
        images.append({"mediaType": media_type, "data": data})
    return images


def _number(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _text(v) -> str:
    return v if isinstance(v, str) else ""


def parse_last_run(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None
    file = raw["file"] if isinstance(raw.get("file"), str) else None
    if isinstance(raw.get("error"), str):
        return {"file": file, "error": raw["error"]}
    stdin = raw["stdin"] if isinstance(raw.get("stdin"), str) else None
    r = raw.get("result")
    if not isinstance(r, dict) or not isinstance(r.get("statusText"), str):
        return None
    run = {
        "file": file,
        "result": {
            "status": _text(r.get("status")) or "success",
            "statusText": r["statusText"],
            "stdout": _text(r.get("stdout")),
            "stderr": _text(r.get("stderr")),
            "compileOutput": _text(r.get("compileOutput")),
            "timeMs": _number(r.get("timeMs")),
            "memoryKb": _number(r.get("memoryKb")),
        },
    }
    if stdin is not None:
        run["stdin"] = stdin
    return run


def parse_context(raw) -> dict:
    ctx = raw if isinstance(raw, dict) else {}
    file = ctx.get("activeFile")
    active = {"name": file["name"], "content": file["content"]} if isinstance(file, dict) and isinstance(file.get("name"), str) and isinstance(file.get("content"), str) else None
    files = ctx.get("openFiles")
    open_files = [n for n in files if isinstance(n, str)] if isinstance(files, list) else []
    note = ctx.get("openNote")
    open_note = {"name": note["name"], "title": note["title"]} if isinstance(note, dict) and isinstance(note.get("name"), str) and isinstance(note.get("title"), str) else None
    prob = ctx.get("openProblem")
    open_problem = None
    if isinstance(prob, dict) and isinstance(prob.get("slug"), str) and isinstance(prob.get("title"), str):
        open_problem = {"slug": prob["slug"], "title": prob["title"], **({"file": prob["file"]} if isinstance(prob.get("file"), str) else {})}
    return {"activeFile": active, "openFiles": open_files, "lastRun": parse_last_run(ctx.get("lastRun")), "openNote": open_note, "openProblem": open_problem}


class Approvals:
    """Proposed changes waiting for the user's yes/no, shared between the chat stream and the approval route."""

    def __init__(self):
        self.waiting: dict[str, asyncio.Future] = {}

    async def request(self, send: Send, stopped: asyncio.Event, change: dict) -> bool:
        """Sends the proposal to the browser and returns the decision (False if the turn is stopped)."""
        if stopped.is_set():
            return False
        id = str(uuid.uuid4())
        answer: asyncio.Future = asyncio.get_running_loop().create_future()
        self.waiting[id] = answer
        send({"type": "approval", "id": id, **change})
        stop = asyncio.ensure_future(stopped.wait())
        try:
            await asyncio.wait({answer, stop}, return_when=asyncio.FIRST_COMPLETED)
            return answer.result() if answer.done() else False
        finally:
            stop.cancel()
            self.waiting.pop(id, None)

    def decide(self, id: str, approved: bool) -> bool:
        answer = self.waiting.pop(id, None)
        if answer is None:
            return False
        if not answer.done():
            answer.set_result(approved)
        return True


class Turn:
    def __init__(self):
        self.events: list[dict] = []
        self.done = False
        self.stopped = asyncio.Event()
        self.listeners: set[asyncio.Queue] = set()
        self.timer: asyncio.TimerHandle | None = None
        self.task: asyncio.Task | None = None


class Turns:
    """Claude's replies ("turns") run on the server independently of the browser connection that started them.
    Every event is kept, numbered, so a browser that lost its connection (or reloaded the page) can reconnect and
    pick up where it left off. A turn ends when Claude finishes or the user presses Stop."""

    def __init__(self, keep: float = KEEP_FINISHED, unwatched: float = STOP_UNWATCHED):
        self.turns: dict[str, Turn] = {}
        self.keep = keep
        self.unwatched = unwatched

    def schedule(self, id: str) -> None:
        """Starts or stops the cleanup timer to match whether anyone is watching."""
        turn = self.turns.get(id)
        if not turn:
            return
        if turn.timer:
            turn.timer.cancel()
            turn.timer = None
        loop = asyncio.get_running_loop()
        if turn.done:
            turn.timer = loop.call_later(self.keep, self.turns.pop, id, None)
        elif not turn.listeners:
            turn.timer = loop.call_later(self.unwatched, turn.stopped.set)

    def start(self, run: Callable[[Send, asyncio.Event], Awaitable[None]]) -> str:
        """Starts a turn; `run` gets a send function and the event Stop sets. Returns the turn's id."""
        id = str(uuid.uuid4())
        turn = Turn()
        self.turns[id] = turn

        def send(event: dict) -> None:
            if turn.done:
                return
            turn.events.append(event)
            index = len(turn.events) - 1
            for queue in turn.listeners:
                queue.put_nowait((index, event))

        async def main() -> None:
            try:
                await run(send, turn.stopped)
            except (Aborted, asyncio.CancelledError):
                pass
            except Exception as e:
                if not turn.stopped.is_set():
                    send({"type": "error", "message": str(e)})
            finally:
                turn.done = True
                for queue in turn.listeners:
                    queue.put_nowait(None)
                turn.listeners.clear()
                self.schedule(id)

        send({"type": "turn", "turnId": id})
        turn.task = asyncio.ensure_future(main())
        self.schedule(id)
        return id

    async def watch(self, id: str, after: float, req: Request) -> bool:
        """Streams the turn's events after the `after`-th one, then live ones. False if there's no such turn."""
        turn = self.turns.get(id)
        if not turn:
            return False
        await req.start(200, {"Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive"})
        i = max(0, after)
        while i < len(turn.events):
            event = turn.events[int(i)] if float(i).is_integer() else UNDEFINED
            await req.write(_event_text(i, event))
            i += 1
        if turn.done:
            await req.end()
            return True
        queue: asyncio.Queue = asyncio.Queue()
        turn.listeners.add(queue)
        self.schedule(id)
        gone = asyncio.ensure_future(req.wait_for_disconnect())
        try:
            while True:
                getting = asyncio.ensure_future(queue.get())
                await asyncio.wait({getting, gone}, return_when=asyncio.FIRST_COMPLETED)
                if not getting.done():
                    getting.cancel()
                    break
                item = getting.result()
                if item is None:
                    await req.end()
                    break
                await req.write(_event_text(*item))
        except OSError:
            pass
        finally:
            gone.cancel()
            turn.listeners.discard(queue)
            self.schedule(id)
        return True

    def stop(self, id: str) -> bool:
        """Stops a running turn (the Stop button)."""
        turn = self.turns.get(id)
        if turn:
            turn.stopped.set()
        return turn is not None

    def close(self) -> None:
        """Stops every running turn (the server is shutting down)."""
        for turn in self.turns.values():
            turn.stopped.set()
            if turn.task:
                turn.task.cancel()
            if turn.timer:
                turn.timer.cancel()


def _event_text(index: float, event) -> str:
    data = "undefined" if event is UNDEFINED else dumps(event)
    return f"id: {dumps(index + 1)}\ndata: {data}\n\n"


class Models:
    """The engine's model list, asked for once (it starts the engine for a moment) and kept until the server restarts."""

    def __init__(self, fetch: Callable[[], Awaitable[list[dict]]] = list_models):
        self.fetch = fetch
        self.models: list[dict] | None = None
        self.lock = asyncio.Lock()

    async def get(self) -> list[dict]:
        async with self.lock:
            if self.models is None:
                self.models = [
                    {
                        "value": m["value"],
                        "displayName": m.get("displayName") if isinstance(m.get("displayName"), str) else m["value"],
                        "description": m.get("description") if isinstance(m.get("description"), str) else "",
                        "efforts": [e for e in m.get("supportedEffortLevels") or [] if isinstance(e, str)],
                    }
                    for m in await self.fetch()
                ]
            return self.models

    async def check(self, model, effort) -> tuple[str | None, str | None] | str:
        """The --model and --effort to start the engine with, or why the choice can't be used. "default" (or no
        model) leaves --model out, and no effort leaves --effort out: the engine then starts exactly as before."""
        if model is not None and not isinstance(model, str):
            return '"model" must be text'
        if effort is not None and not isinstance(effort, str):
            return '"effort" must be text'
        if model is None and effort is None:
            return None, None
        try:
            models = await self.get()
        except EngineError as e:
            return f"Couldn’t check the model: {e}"
        row = next((m for m in models if m["value"] == (model or "default")), None)
        if model is not None and row is None:
            return "That model isn’t available. Pick one from the list."
        if effort is not None and (row is None or effort not in row["efforts"]):
            return f"{row['displayName'] if row else 'This model'} doesn’t have that effort level."
        return (None if model in (None, "default") else model), effort


def claude_routes(folders: dict[str, str], piston_url: str, client: httpx.AsyncClient, logger: Logger, turns: Turns, approvals: Approvals | None = None, models: Models | None = None):
    models = models or Models()
    stores = {"solutions": folders["solutions"], "notes": folders["notes"], "problems": folders["problems"]}
    runner = PistonRunner(f"{piston_url}/api/v2", client)
    approvals = approvals or Approvals()

    async def apply(req: Request) -> None:
        body = await req.json_object()
        change = parse_change(body.get("change") if body is not None else None)
        headers = {"Content-Type": "application/json"}
        if change is None:
            await req.respond(400, dumps({"error": "That isn’t a change the editor can apply."}), headers)
            return
        try:
            await req.respond(200, dumps(apply_change(stores, change)), headers)
        except ToolError as e:
            # The change no longer fits: the file changed since, or is already there.
            await req.respond(409, dumps({"error": e.for_person}), headers)
        except Exception as e:
            await req.respond(500, dumps({"error": str(e)}), headers)

    async def chat(req: Request) -> None:
        raw = await req.body()
        try:
            parsed = loads(raw.decode("utf-8", errors="replace"))
        except ValueError:
            parsed = None
        # Like JavaScript's `typeof body === 'object'`: a list counts as a body too, just one without fields.
        body = parsed if isinstance(parsed, dict) else {} if isinstance(parsed, list) else None
        images = parse_images(body.get("images") if body is not None else None)
        message = js_trim(body["message"]) if body is not None and isinstance(body.get("message"), str) else ""
        if body is None:
            problem = "Expected a JSON body"
        elif isinstance(images, str):
            problem = images
        elif not message and not images:
            problem = '"message" is required'
        else:
            problem = None
        if body is None or problem is not None or isinstance(images, str):
            await req.respond(400, dumps({"error": problem}))
            return

        choice = await models.check(body.get("model"), body.get("effort"))
        if isinstance(choice, str):
            await req.respond(400, dumps({"error": choice}))
            return
        model, effort = choice

        context = parse_context(body.get("context"))
        session_id = body["sessionId"] if isinstance(body.get("sessionId"), str) else None

        async def run_turn(send_event: Send, stopped: asyncio.Event) -> None:
            def send(e: dict) -> None:
                if e["type"] == "error":
                    logger.log("error", "Claude reply failed", e["message"])
                send_event(e)

            tools = EditorTools(folders, context, runner, lambda change: approvals.request(send, stopped, change), send)

            async def call_tool(name: str, args) -> dict:
                checked, error = check_input(name, UNDEFINED if args is None else args)
                if error is not None:
                    return {"content": [{"type": "text", "text": error}], "isError": True}
                result = await tools.call(name, checked)
                return {"content": [{"type": "text", "text": result["text"]}], **({"isError": True} if result.get("isError") else {})}

            if images:
                text = build_prompt(message or "Have a look at this image.", context)
                content = [*({"type": "image", "source": {"type": "base64", "media_type": img["mediaType"], "data": img["data"]}} for img in images), {"type": "text", "text": text}]
                user = {"type": "user", "parent_tool_use_id": None, "message": {"role": "user", "content": content}}
            else:
                user = {"type": "user", "session_id": "", "message": {"role": "user", "content": [{"type": "text", "text": build_prompt(message, context)}]}, "parent_tool_use_id": None}

            engine = Engine(
                cwd=folders["solutions"],
                system_prompt=SYSTEM_PROMPT,
                tools=TOOLS,
                allowed_tools=[TOOL_PREFIX + n for n in TOOL_NAMES],
                call_tool=call_tool,
                resume=session_id,
                model=model,
                effort=effort,
            )
            to_events = EventMapper()
            session_sent = False
            # Stop ends the engine straight away.
            watcher = asyncio.ensure_future(stopped.wait())
            watcher.add_done_callback(lambda _: engine.stop() if stopped.is_set() else None)
            try:
                async for msg in engine.run(user):
                    if not session_sent and msg.get("session_id"):
                        send({"type": "session", "sessionId": msg["session_id"]})
                        session_sent = True
                    for event in to_events(msg):
                        send(event)
            except Aborted:
                raise
            except Exception as e:
                if not stopped.is_set():
                    logger.log("error", "Claude reply failed", e)
                raise
            finally:
                watcher.cancel()

        # The reply runs on its own: closing the page doesn't stop it, and the page can reconnect to it.
        await turns.watch(turns.start(run_turn), 0, req)

    async def handle(req: Request) -> bool:
        route = req.path
        turn_route = TURN_ROUTE.fullmatch(route)
        if turn_route:
            id, stop = turn_route.group(1), turn_route.group(2)
            if stop and req.method == "POST":
                await req.respond(204 if turns.stop(id) else 404)
                return True
            if not stop and req.method == "GET":
                after = js_to_number(req.param("after") if req.param("after") is not None else "0")
                if not await turns.watch(id, after if after == after and abs(after) != float("inf") else 0, req):
                    await req.respond(404, dumps({"error": "That reply is no longer available (the editor may have restarted)."}))
                return True
            return False
        if route == MODELS_ROUTE and req.method == "GET":
            try:
                await req.respond(200, dumps({"models": await models.get()}), {"Content-Type": "application/json"})
            except EngineError as e:
                logger.log("error", "Couldn't list Claude's models", e)
                await req.respond(502, dumps({"error": f"Couldn’t list the models: {e}"}), {"Content-Type": "application/json"})
            return True
        if req.method != "POST" or route not in (ROUTE, APPROVAL_ROUTE, APPLY_ROUTE):
            return False
        if route == APPLY_ROUTE:
            await apply(req)
        elif route == APPROVAL_ROUTE:
            body = await req.json_object()
            found = body is not None and isinstance(body.get("id"), str) and approvals.decide(body["id"], body.get("approved") is True)
            await req.respond(204 if found else 404)
        else:
            await chat(req)
        return True

    return handle

