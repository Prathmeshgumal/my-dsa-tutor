"""Just enough of Piston for the contract tests and the benchmark: run with `python fake_piston.py PORT`.

- GET  /api/v2/runtimes  C++ and Python installed, Java not (so the setup check has something to report)
- WS   /api/v2/connect   whatever the code: asks for a name, then greets it
- GET  /api/v2/hang      never answers (for tests where the browser gives up)
- POST /api/v2/execute   with files: a pretend run (records what it was sent to argv[2], if given)
- anything else          echoes the method, path and body as JSON
"""

import asyncio
import json
import sys

import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

app = FastAPI()


@app.get("/api/v2/runtimes")
async def runtimes():
    return [
        {"language": "c++", "version": "10.2.0", "aliases": []},
        {"language": "python", "version": "3.12.0", "aliases": []},
    ]


@app.get("/api/v2/hang")
async def hang():
    await asyncio.sleep(3600)


@app.websocket("/api/v2/connect")
async def connect(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            message = json.loads(await ws.receive_text())
            if message.get("type") == "init":
                await ws.send_text(json.dumps({"type": "stage", "stage": "run"}))
                await ws.send_text(json.dumps({"type": "data", "stream": "stdout", "data": "Name? "}))
            elif message.get("type") == "data":
                await ws.send_text(json.dumps({"type": "data", "stream": "stdout", "data": f"hi {message['data'].strip()}\n"}))
                await ws.send_text(json.dumps({"type": "exit", "stage": "run", "code": 0, "signal": None}))
    except WebSocketDisconnect:
        pass


@app.post("/api/v2/execute")
async def execute(request: Request):
    body = await request.json()
    if "files" not in body:
        return await echo("api/v2/execute", request)
    if len(sys.argv) > 2:
        with open(sys.argv[2], "a") as f:
            f.write(json.dumps(body) + "\n")
    source = body["files"][0]["content"]
    run = {"stdout": f"ran {len(source)} chars\nstdin: {body.get('stdin', '')}", "stderr": "", "code": 0, "signal": None, "output": "", "cpu_time": 3, "memory": 1212000, "message": None, "status": None}
    return {"language": body["language"], "version": "10.2.0", "compile": {**run, "stdout": ""}, "run": run}


async def echo(path: str, request: Request):
    body = (await request.body()).decode()
    return JSONResponse({"method": request.method, "path": f"/{path}", "query": request.url.query, "body": body})


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def echo_anything(path: str, request: Request):
    return await echo(path, request)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[1]), log_level="warning")
