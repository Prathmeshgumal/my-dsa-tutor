"""The editor's Claude routes.
  POST /api/claude/apply     { change }  → applies a proposal Claude stopped waiting for
"""

from .changes import ToolError, apply_change, parse_change
from .web import Request, dumps

APPLY_ROUTE = "/api/claude/apply"


def claude_routes(folders: dict[str, str]):
    stores = {"solutions": folders["solutions"], "notes": folders["notes"], "problems": folders["problems"]}

    async def handle(req: Request) -> bool:
        if req.method != "POST" or req.path != APPLY_ROUTE:
            return False
        body = await req.json_object()
        change = parse_change(body.get("change") if body is not None else None)
        headers = {"Content-Type": "application/json"}
        if change is None:
            await req.respond(400, dumps({"error": "That isn’t a change the editor can apply."}), headers)
            return True
        try:
            await req.respond(200, dumps(apply_change(stores, change)), headers)
        except ToolError as e:
            # The change no longer fits: the file changed since, or is already there.
            await req.respond(409, dumps({"error": e.for_person}), headers)
        except Exception as e:
            await req.respond(500, dumps({"error": str(e)}), headers)
        return True

    return handle
