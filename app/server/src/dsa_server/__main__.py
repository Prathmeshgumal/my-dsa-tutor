"""Starts the editor as a real app: `npm run build` once, then `npm start`. Settings: see config.py."""

import os
import sys
from pathlib import Path

import uvicorn

from .app import App
from .config import ConfigError, load_config
from .log import Logger

APP_DIR = Path(__file__).resolve().parents[3]
"""The app/ folder."""
DIST_DIR = APP_DIR / "packages" / "web" / "dist"


def main() -> None:
    try:
        # Data lives in the project folder unless DATA_DIR says otherwise.
        config = load_config(str(APP_DIR.parent))
    except ConfigError as e:
        print(e, file=sys.stderr)
        sys.exit(1)

    if not (DIST_DIR / "index.html").exists():
        print("The page isn’t built yet: run npm run build first.", file=sys.stderr)

    logger = Logger(config.folders["logs"])
    app = App(config, str(DIST_DIR), logger)
    server = uvicorn.Server(
        uvicorn.Config(
            app,
            host=config.host,
            port=config.port,
            log_level="warning",
            access_log=False,
            server_header=False,
            lifespan="on",
            # Ctrl+C and `docker stop`: end open requests and runs rather than wait for them.
            timeout_graceful_shutdown=1,
            # Interactive runs pass straight through, as they did in the Node server: no extra pings, no size cap.
            ws_ping_interval=None,
            ws_max_size=1 << 30,
            ws_per_message_deflate=False,
        )
    )
    try:
        server.config.load()
        sock = server.config.bind_socket()
    except OSError as e:
        print(f"Port {config.port} is already in use. Set PORT to use another one." if e.errno == 98 else str(e), file=sys.stderr)
        sys.exit(1)
    print(f"Editor ready at http://localhost:{config.port} (data in {config.data_dir})", flush=True)
    try:
        server.run(sockets=[sock])
    except KeyboardInterrupt:
        pass  # Ctrl+C: the server has already shut down
    os._exit(0)


if __name__ == "__main__":
    main()
