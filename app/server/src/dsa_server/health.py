"""The setup check, shown in the Setup dialog and on start-up when something is wrong.
  GET /api/health → Health (see @dsa/core's health.ts)
"""

import asyncio
import errno
import os
import sys
from pathlib import Path

import httpx

from .engine import CONFIG_DIR_ENV
from .web import Request

ROUTE = "/api/health"

PISTON_LANGUAGES = {"cpp": "c++", "java": "java", "python": "python"}
"""Piston's names for the editor's languages."""
LANGUAGE_NAMES = {"cpp": "C++", "java": "Java", "python": "Python"}

INSTALL_HINT = "Run ./start.sh (or: docker compose up -d piston-setup) to install it."


async def check_piston(piston_url: str, client: httpx.AsyncClient) -> dict:
    none = {"cpp": False, "java": False, "python": False}
    try:
        res = await client.get(f"{piston_url}/api/v2/runtimes", timeout=3)
        if not res.is_success:
            return {"ok": False, "languages": none, "problem": f"Piston answered with HTTP {res.status_code}."}
        runtimes = res.json()
        if not isinstance(runtimes, list):
            raise TypeError("runtimes isn't a list")

        def has(name: str) -> bool:
            # runtimes.some((r) => r.language === name): a null before a match throws, like in JavaScript.
            for r in runtimes:
                if r is None:
                    raise TypeError("null runtime")
                if isinstance(r, dict) and r.get("language") == name:
                    return True
            return False

        languages = {key: has(name) for key, name in PISTON_LANGUAGES.items()}
        missing = [LANGUAGE_NAMES[key] for key, ok in languages.items() if not ok]
        out = {"ok": True, "languages": languages}
        if missing:
            out["problem"] = f"{', '.join(missing)} {'isn’t' if len(missing) == 1 else 'aren’t'} installed yet. {INSTALL_HINT}"
        return out
    except Exception:
        return {"ok": False, "languages": none, "problem": "Can’t reach Piston, which runs your code. Start it with ./start.sh."}


NOT_SIGNED_IN = "Claude isn’t signed in. Click Sign in below."


def check_claude(env: dict[str, str], platform: str) -> dict:
    """A quick look for the editor's own login (the Setup dialog's account section asks Claude Code for the details)."""
    if env.get("ANTHROPIC_API_KEY"):
        return {"signedIn": True}
    config_dir = env.get(CONFIG_DIR_ENV)
    if config_dir and os.path.exists(os.path.join(config_dir, ".credentials.json")):
        return {"signedIn": True}
    # On macOS, Claude Code keeps the login in the keychain, where the server can't look.
    if platform == "darwin":
        return {"signedIn": "unknown"}
    return {"signedIn": False, "problem": NOT_SIGNED_IN}


def check_folder(name: str, folder: str) -> dict:
    probe = Path(folder) / f".write-check-{os.getpid()}"
    try:
        probe.write_bytes(b"")
        probe.unlink(missing_ok=True)
        return {"name": name, "ok": True}
    except OSError as e:
        code = errno.errorcode.get(e.errno or 0, "UNKNOWN")
        why = "doesn’t exist" if code == "ENOENT" else "isn’t writable" if code in ("EACCES", "EPERM") else f"can’t be written ({code})"
        return {"name": name, "ok": False, "problem": f"The {name} folder {why}, so work there won’t be saved."}


def health_routes(piston_url: str, folders: dict[str, str], client: httpx.AsyncClient):
    async def handle(req: Request) -> bool:
        if req.method != "GET" or req.path != ROUTE:
            return False
        # The folder checks take microseconds; they run while Piston answers.
        piston = asyncio.ensure_future(check_piston(piston_url, client))
        claude = check_claude(dict(os.environ), sys.platform)
        dirs = [check_folder(name, folder) for name, folder in folders.items()]
        await req.send_json(200, {"piston": await piston, "claude": claude, "folders": dirs}, {"Cache-Control": "no-store"})
        return True

    return handle
