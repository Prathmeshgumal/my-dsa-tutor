"""Checks a dry run Claude made before it is saved for the Playground (core/dryRun.ts)."""

from .web import dumps

MAX_STEPS = 200


def format_scalar(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, str):
        return v
    if isinstance(v, bool):
        return "true" if v else "false"
    return dumps(v)


def cell_ref(name: str, *index) -> str:
    """The name an arrow uses for one box: arr[3], seen[7], dp[1][2]."""
    return name + "".join(f"[{format_scalar(i)}]" for i in index)


def step_refs(step: dict) -> set[str]:
    """Every box an arrow can point at in this step."""
    refs = set(step.get("vars", {}))
    for s in step.get("structures", []):
        kind = s["kind"]
        if kind in ("array", "stack", "queue"):
            refs.update(cell_ref(s["name"], i) for i in range(len(s["values"])))
        elif kind == "linked_list":
            refs.update(cell_ref(s["name"], i) for i in range(len(s["nodes"])))
        elif kind == "map":
            refs.update(cell_ref(s["name"], k) for k, _ in s["entries"])
        elif kind == "grid":
            refs.update(cell_ref(s["name"], r, c) for r, row in enumerate(s["rows"]) for c in range(len(row)))
        elif kind == "tree":
            refs.update(cell_ref(s["name"], i) for i, v in enumerate(s["nodes"]) if v is not None)
        elif kind == "graph":
            refs.update(cell_ref(s["name"], n) for n in s["nodes"])
    return refs


def dry_run_problems(code: str | None, steps: list[dict]) -> list[str]:
    """Problems with a dry run that would make it draw wrongly; empty when it's fine."""
    problems = []
    if not steps:
        problems.append("It needs at least one step.")
    if len(steps) > MAX_STEPS:
        problems.append(f"Keep it to {MAX_STEPS} steps or fewer (it has {len(steps)}).")
    lines = len(code.split("\n")) if code else 0
    for i, step in enumerate(steps):
        where = f"Step {i + 1}"
        line = step.get("line")
        if line is not None and (not code or line < 1 or line > lines):
            problems.append(f"{where}: line {dumps(line)} isn't in the code (it has {lines} lines).")
        if step.get("moves"):
            refs = step_refs(step)
            for m in step["moves"]:
                if m["from"] not in refs:
                    problems.append(f'{where}: arrow from "{m["from"]}" points at something not drawn in this step.')
                if m["to"] not in refs:
                    problems.append(f'{where}: arrow to "{m["to"]}" points at something not drawn in this step.')
        for s in step.get("structures", []):
            if s["kind"] == "array":
                n = len(s["values"])
                if "capacity" in s and s["capacity"] < n:
                    problems.append(f"{where}: {s['name']} capacity {dumps(s['capacity'])} is smaller than its {n} values.")
                for p, idx in s.get("pointers", {}).items():
                    if idx < -1 or idx > n:
                        problems.append(f"{where}: pointer {p}={dumps(idx)} is outside {s['name']} (length {n}).")
            if s["kind"] == "grid" and "current" in s:
                r, c = s["current"]
                rows = s["rows"]
                if not 0 <= r < len(rows) or c < 0 or c >= len(rows[r]):
                    problems.append(f"{where}: current cell [{dumps(r)}, {dumps(c)}] is outside {s['name']}.")
            if s["kind"] == "graph":
                known = set(s["nodes"])
                for edge in s["edges"]:
                    a, b = edge[0], edge[1]
                    if a not in known or b not in known:
                        problems.append(f"{where}: edge {a}→{b} in {s['name']} uses a node that isn't listed.")
    return problems
