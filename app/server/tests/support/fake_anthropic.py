"""A stand-in for Anthropic's API, so the real Claude Code engine can run with no account and no cost:
`python fake_anthropic.py PORT LOG REPLIES`.

Every request is appended to LOG (method, path, headers that shape the request, JSON body). POST /v1/messages
answers with the next reply from REPLIES (a JSON list; each reply a list of content blocks, text or tool_use),
streamed the way the API streams; when the list runs out it answers "Done.".
"""

import json
import sys

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

LOG, REPLIES = sys.argv[2], sys.argv[3]
app = FastAPI()
count = 0
KEPT_HEADERS = ("anthropic-beta", "anthropic-version", "x-app", "content-type", "anthropic-dangerous-direct-browser-access")


def record(entry: dict) -> None:
    with open(LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def stream(blocks: list[dict], model: str):
    yield sse("message_start", {"type": "message_start", "message": {"id": f"msg_fake_{count}", "type": "message", "role": "assistant", "model": model, "content": [], "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 10, "output_tokens": 1}}})
    for i, block in enumerate(blocks):
        if block["type"] == "text":
            yield sse("content_block_start", {"type": "content_block_start", "index": i, "content_block": {"type": "text", "text": ""}})
            yield sse("content_block_delta", {"type": "content_block_delta", "index": i, "delta": {"type": "text_delta", "text": block["text"]}})
        else:
            yield sse("content_block_start", {"type": "content_block_start", "index": i, "content_block": {"type": "tool_use", "id": block["id"], "name": block["name"], "input": {}}})
            yield sse("content_block_delta", {"type": "content_block_delta", "index": i, "delta": {"type": "input_json_delta", "partial_json": json.dumps(block["input"])}})
        yield sse("content_block_stop", {"type": "content_block_stop", "index": i})
    stop = "tool_use" if any(b["type"] == "tool_use" for b in blocks) else "end_turn"
    yield sse("message_delta", {"type": "message_delta", "delta": {"stop_reason": stop, "stop_sequence": None}, "usage": {"output_tokens": 5}})
    yield sse("message_stop", {"type": "message_stop"})


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "HEAD"])
async def anything(path: str, request: Request):
    global count
    raw = await request.body()
    try:
        body = json.loads(raw) if raw else None
    except ValueError:
        body = raw.decode(errors="replace")
    record({"method": request.method, "path": f"/{path}", "query": request.url.query, "headers": {k: v for k, v in request.headers.items() if k in KEPT_HEADERS}, "body": body})
    if request.method == "POST" and path == "v1/messages" and isinstance(body, dict):
        if not body.get("stream"):
            return JSONResponse({"id": "msg_fake", "type": "message", "role": "assistant", "model": body.get("model"), "content": [{"type": "text", "text": "Done."}], "stop_reason": "end_turn", "stop_sequence": None, "usage": {"input_tokens": 1, "output_tokens": 1}})
        replies = json.load(open(REPLIES))
        blocks = replies[count] if count < len(replies) else [{"type": "text", "text": "Done."}]
        count += 1
        return StreamingResponse(stream(blocks, body.get("model", "")), media_type="text/event-stream")
    if path == "v1/messages/count_tokens":
        return {"input_tokens": 100}
    return JSONResponse({}, status_code=404)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[1]), log_level="warning")
