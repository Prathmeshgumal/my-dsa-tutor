"""The API for practice problems (see problem_store.py for the folder layout).
  GET    /api/problems                    → ProblemEntry[]
  GET    /api/problems/_newer             → slugs of problems a newer editor saved (left out of the list)
  PUT    /api/problems/:slug/solution     { content } → save the student's code
  PUT    /api/problems/:slug/files/:name  { content } → save another version of the code (e.g. brute-force.cpp)
  DELETE /api/problems/:slug/files/:name  → delete a version (not solution.cpp)
  PUT    /api/problems/:slug/notes        { notes } → which notes (file names in notes/) belong to it
  PUT    /api/problems/:slug/tests        { tests } → replace the test cases
  PUT    /api/problems/:slug/link         { link } → where the question came from (a web address, or null)
  GET    /api/problems/:slug/attempts     → Attempt[] (newest first)
  POST   /api/problems/:slug/attempts     { attempt } → save a Submit
  DELETE /api/problems/:slug              → delete the problem and its attempts
"""

import time

from . import problem_store as store
from .stores import HttpError, read_json
from .web import Request, decode_uri_component, dumps

PREFIX = "/api/problems"


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def parse_tests(raw) -> list[dict]:
    if not isinstance(raw, list):
        raise HttpError(400, '"tests" must be a list')
    tests = []
    for t in raw:
        if not t or not isinstance(t, dict) or not isinstance(t.get("input"), list) or not all(isinstance(v, str) for v in t["input"]) or not isinstance(t.get("expected"), str):
            raise HttpError(400, 'Each test needs "input" (list of strings) and "expected"')
        added_by = t["addedBy"] if t.get("addedBy") in ("user", "claude") else "problem"
        tests.append({"input": t["input"], "expected": t["expected"], "example": t.get("example") is True, "addedBy": added_by})
    return tests


def parse_attempt(raw) -> dict:
    a = raw if isinstance(raw, dict) else None
    if not a or not isinstance(a.get("code"), str) or not _is_number(a.get("passed")) or not _is_number(a.get("total")) or not isinstance(a.get("results"), list):
        raise HttpError(400, '"attempt" needs code, passed, total and results')
    attempt = {"at": int(time.time() * 1000)}
    if isinstance(a.get("file"), str):
        attempt["file"] = a["file"]
    attempt.update({"code": a["code"], "passed": a["passed"], "total": a["total"], "statusText": a["statusText"] if isinstance(a.get("statusText"), str) else "", "results": a["results"]})
    return attempt


async def _json(req: Request, value) -> None:
    await req.respond(200, dumps(value), {"Content-Type": "application/json"})


async def _handle(base: str, req: Request) -> None:
    rest = req.path[len(PREFIX) :]
    method = req.method
    if rest in ("", "/"):
        if method != "GET":
            raise HttpError(405, "Method not allowed")
        return await _json(req, store.list_entries(base))
    if rest == "/_newer" and method == "GET":
        return await _json(req, store.list_newer(base))

    slug, *more = rest[1:].split("/")
    action, extra = (more[0], more[1:]) if more else (None, [])
    if action == "files" and len(extra) == 1:
        try:
            name = decode_uri_component(extra[0])
        except ValueError:
            raise RuntimeError("URI malformed") from None  # uncaught in the Node server too: a 500
        if method == "PUT":
            content = (await read_json(req, "Too large")).get("content")
            if not isinstance(content, str):
                raise HttpError(400, '"content" must be a string')
            store.write_code(base, slug, name, content)
        elif method == "DELETE":
            store.delete_code(base, slug, name)
        else:
            raise HttpError(405, "Method not allowed")
        await req.respond(204)
        return
    if extra:
        raise HttpError(404, "Not found")

    if action is None and method == "DELETE":
        store.delete_problem(base, slug)
    elif action == "notes" and method == "PUT":
        notes = (await read_json(req, "Too large")).get("notes")
        if not isinstance(notes, list) or not all(isinstance(n, str) for n in notes):
            raise HttpError(400, '"notes" must be a list of note names')
        store.write_note_links(base, slug, notes)
    elif action == "solution" and method == "PUT":
        content = (await read_json(req, "Too large")).get("content")
        if not isinstance(content, str):
            raise HttpError(400, '"content" must be a string')
        store.write_solution(base, slug, content)
    elif action == "tests" and method == "PUT":
        store.write_tests(base, slug, parse_tests((await read_json(req, "Too large")).get("tests")))
    elif action == "link" and method == "PUT":
        link = (await read_json(req, "Too large")).get("link")
        if link is not None and not store.web_link(link):
            raise HttpError(400, "The link must be a web address starting with https:// or http://.")
        store.write_link(base, slug, link)
    elif action == "attempts" and method == "GET":
        return await _json(req, store.list_attempts(base, slug))
    elif action == "attempts" and method == "POST":
        store.save_attempt(base, slug, parse_attempt((await read_json(req, "Too large")).get("attempt")))
    else:
        raise HttpError(405, "Method not allowed")
    await req.respond(204)


def problems_routes(base: str):
    async def handle(req: Request) -> bool:
        url = req.path + (f"?{req.query}" if req.query else "")
        if url != PREFIX and not url.startswith(f"{PREFIX}/") and not url.startswith(f"{PREFIX}?"):
            return False
        try:
            await _handle(base, req)
        except Exception as e:
            status = e.status if isinstance(e, HttpError) else 404 if isinstance(e, store.ProblemNotFound) else 400 if isinstance(e, store.BadName) else 500
            await req.send_json(status, {"error": str(e)})
        return True

    return handle
