"""Where the editor keeps its data, and how it's reached. Read once at start-up from, in order of priority:
  1. environment settings (PORT, HOST, PISTON_URL, DATA_DIR, SOLUTIONS_DIR, NOTES_DIR, PLAYGROUND_DIR,
     PROBLEMS_DIR, LOGS_DIR, STATE_DIR)
  2. dsa-tutor.json in the data folder (optional), e.g. { "port": 5199, "folders": { "notes": "my-notes" } }
  3. defaults: everything in the data folder, which is the project folder unless DATA_DIR says otherwise
"""

import json
import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

CONFIG_FILE = "dsa-tutor.json"

FOLDERS = ("solutions", "notes", "playground", "problems", "logs", "state")

FOLDER_ENV = {
    "solutions": "SOLUTIONS_DIR",
    "notes": "NOTES_DIR",
    "playground": "PLAYGROUND_DIR",
    "problems": "PROBLEMS_DIR",
    "logs": "LOGS_DIR",
    "state": "STATE_DIR",
}


@dataclass
class Config:
    port: int
    host: str
    """The address the server listens on: 127.0.0.1 keeps it to this computer."""
    piston_url: str
    data_dir: str
    folders: dict[str, str]


class ConfigError(Exception):
    pass


def _is_port(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 65535


def _check_file(raw) -> list[str]:
    """The problems with dsa-tutor.json, worded like the Node server's (zod) messages."""
    if not isinstance(raw, dict):
        return [f"Invalid input: expected object, received {_kind(raw)}"]
    problems = []
    for key, value in raw.items():
        if key == "port":
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                problems.append(f"port: Invalid input: expected number, received {_kind(value)}")
            elif not float(value).is_integer():
                problems.append("port: Invalid input: expected int, received number")
            elif value < 1:
                problems.append("port: Too small: expected number to be >=1")
            elif value > 65535:
                problems.append("port: Too big: expected number to be <=65535")
        elif key == "host":
            if not isinstance(value, str):
                problems.append(f"host: Invalid input: expected string, received {_kind(value)}")
            elif not value:
                problems.append("host: Too small: expected string to have >=1 characters")
        elif key == "pistonUrl":
            if not isinstance(value, str):
                problems.append(f"pistonUrl: Invalid input: expected string, received {_kind(value)}")
            elif not urlparse(value).scheme or ":" not in value:
                problems.append("pistonUrl: Invalid URL")
        elif key == "folders":
            if not isinstance(value, dict):
                problems.append(f"folders: Invalid input: expected object, received {_kind(value)}")
                continue
            for name, folder in value.items():
                if name not in FOLDERS:
                    problems.append(f'folders: Unrecognized key: "{name}"')
                elif not isinstance(folder, str):
                    problems.append(f"folders.{name}: Invalid input: expected string, received {_kind(folder)}")
                elif not folder:
                    problems.append(f"folders.{name}: Too small: expected string to have >=1 characters")
        else:
            problems.append(f'Unrecognized key: "{key}"')
    return problems


def _kind(value) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    return "object"


def _read_file(file: Path) -> dict:
    try:
        text = file.read_text("utf-8")
    except OSError:
        return {}
    try:
        raw = json.loads(text)
    except ValueError:
        raise ConfigError(f"{file} isn’t valid JSON.") from None
    problems = _check_file(raw)
    if problems:
        raise ConfigError(f"{file} has a problem: {'; '.join(problems)}")
    return raw


def _env_port(value: str | None) -> int | None:
    if value is None or value == "":
        return None
    try:
        n = float(value.strip()) if value.strip() else 0.0
    except ValueError:
        n = float("nan")
    if not (n == n and n.is_integer() and 1 <= n <= 65535):
        raise ConfigError("PORT must be a whole number from 1 to 65535.")
    return int(n)


def load_config(default_data_dir: str, env: dict[str, str] | None = None) -> Config:
    env = dict(os.environ) if env is None else env
    data_dir = os.path.abspath(env.get("DATA_DIR") or default_data_dir)
    file = _read_file(Path(data_dir) / CONFIG_FILE)
    file_folders = file.get("folders") or {}
    folders = {f: os.path.normpath(os.path.join(data_dir, env.get(FOLDER_ENV[f]) or file_folders.get(f) or f)) for f in FOLDERS}
    port = _env_port(env.get("PORT"))
    return Config(
        port=port if port is not None else int(file.get("port", 5199)),
        host=env.get("HOST") or file.get("host") or "127.0.0.1",
        piston_url=env.get("PISTON_URL") or file.get("pistonUrl") or "http://127.0.0.1:2000",
        data_dir=data_dir,
        folders=folders,
    )
