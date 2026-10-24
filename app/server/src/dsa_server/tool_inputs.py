"""Checks the input Claude sends with each editor tool call, the way the Node server's zod schemas did: the same
rules, the same error text (Claude reads it to fix its call), and the same cleaned-up input (unknown keys dropped,
keys in schema order). Only the parts of zod the editor tools use are here.

A check returns (value, issues). Issues are dicts in zod's own key order; `input` and `continue` are kept while
checking (for the message, and to know whether later checks still run) and dropped when the issue is reported.
"""

import math
from typing import Any

from .web import dumps, js_key_order


class _Undefined:
    """A missing key: JavaScript's undefined, which isn't the same as null."""

    def __repr__(self) -> str:
        return "undefined"


UNDEFINED: Any = _Undefined()
MAX_SAFE = 2**53 - 1


def parsed_type(value: Any) -> str:
    if value is UNDEFINED:
        return "undefined"
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "nan" if isinstance(value, float) and math.isnan(value) else "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    return "object"


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _js_string(value: Any) -> str:
    """String(value) for the numbers and strings that show up in messages."""
    if isinstance(value, float):
        if math.isinf(value):
            return "Infinity" if value > 0 else "-Infinity"
        if math.isnan(value):
            return "NaN"
    return dumps(value) if _is_number(value) else str(value)


def _stringify_primitive(value: Any) -> str:
    if isinstance(value, str):
        return f'"{value}"'
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    return _js_string(value)


def _message(issue: dict) -> str:
    code = issue["code"]
    if code == "invalid_type":
        received = parsed_type(issue.get("input", UNDEFINED))
        if received == "number" and not math.isfinite(issue["input"]):
            received = _js_string(issue["input"])
        elif received == "nan":
            received = "NaN"
        return f"Invalid input: expected {issue['expected']}, received {received}"
    if code == "invalid_value":
        values = issue["values"]
        if len(values) == 1:
            return f"Invalid input: expected {_stringify_primitive(values[0])}"
        return f"Invalid option: expected one of {'|'.join(_stringify_primitive(v) for v in values)}"
    if code in ("too_big", "too_small"):
        big = code == "too_big"
        adj = ("<=" if issue["inclusive"] else "<") if big else (">=" if issue["inclusive"] else ">")
        bound = _js_string(issue["maximum" if big else "minimum"])
        word = "big" if big else "small"
        if issue.get("origin") == "array":
            return f"Too {word}: expected array to have {adj}{bound} items"
        return f"Too {word}: expected {issue.get('origin', 'value')} to be {adj}{bound}"
    if code == "invalid_union" and issue.get("options"):
        return "Invalid discriminator value. Expected " + " | ".join(f"'{o}'" for o in issue["options"])
    return "Invalid input"


def finalize(issue: dict) -> dict:
    full = {k: v for k, v in issue.items() if k not in ("input", "continue")}
    full.setdefault("path", [])
    full["message"] = _message(issue)
    return full


def _prefix(key, issues: list[dict]) -> list[dict]:
    for issue in issues:
        issue.setdefault("path", [])
        issue["path"].insert(0, key)
    return issues


def aborted(issues: list[dict], start: int = 0) -> bool:
    return any(issue.get("continue") is not True for issue in issues[start:])


class Schema:
    optional = False

    def run(self, value: Any) -> tuple[Any, list[dict]]:
        raise NotImplementedError


class Str(Schema):
    def run(self, value):
        if isinstance(value, str):
            return value, []
        return value, [{"expected": "string", "code": "invalid_type", "input": value}]


class Bool(Schema):
    def run(self, value):
        if isinstance(value, bool):
            return value, []
        return value, [{"expected": "boolean", "code": "invalid_type", "input": value}]


class Null(Schema):
    def run(self, value):
        if value is None:
            return value, []
        return value, [{"expected": "null", "code": "invalid_type", "input": value}]


class Num(Schema):
    """z.number(), with .int() and .min(n) when asked."""

    def __init__(self, integer: bool = False, minimum: int | None = None):
        self.integer = integer
        self.minimum = minimum

    def run(self, value):
        if not _is_number(value) or (isinstance(value, float) and not math.isfinite(value)):
            issue = {"expected": "number", "code": "invalid_type", "input": value}
            if _is_number(value):
                issue["received"] = _js_string(value)
            return value, [issue]
        issues: list[dict] = []
        if self.integer:
            if isinstance(value, float) and not value.is_integer():
                return value, [{"expected": "int", "format": "safeint", "code": "invalid_type", "continue": False, "input": value}]
            if abs(value) > MAX_SAFE:
                if value > 0:
                    issues.append({"input": value, "code": "too_big", "maximum": MAX_SAFE, "note": "Integers must be within the safe integer range.", "origin": "int", "inclusive": True, "continue": True})
                else:
                    issues.append({"input": value, "code": "too_small", "minimum": -MAX_SAFE, "note": "Integers must be within the safe integer range.", "origin": "int", "inclusive": True, "continue": True})
        if self.minimum is not None and not value >= self.minimum:
            issues.append({"origin": "number", "code": "too_small", "minimum": self.minimum, "input": value, "inclusive": True, "continue": True})
        # JSON's 2.0 is JavaScript's 2.
        if isinstance(value, float) and value.is_integer() and abs(value) < 1e21:
            value = int(value)
        return value, issues


class Enum(Schema):
    def __init__(self, *values: str):
        self.values = list(values)

    def run(self, value):
        if isinstance(value, str) and value in self.values:
            return value, []
        return value, [{"code": "invalid_value", "values": list(self.values), "input": value}]


class Optional(Schema):
    optional = True

    def __init__(self, inner: Schema):
        self.inner = inner

    def run(self, value):
        if value is UNDEFINED:
            return value, []
        return self.inner.run(value)


class Nullable(Schema):
    def __init__(self, inner: Schema):
        self.inner = inner

    def run(self, value):
        if value is None:
            return value, []
        return self.inner.run(value)


class Array(Schema):
    def __init__(self, element: Schema):
        self.element = element

    def run(self, value):
        if not isinstance(value, list):
            return value, [{"expected": "array", "code": "invalid_type", "input": value}]
        out, issues = [], []
        for i, item in enumerate(value):
            v, item_issues = self.element.run(item)
            issues.extend(_prefix(i, item_issues))
            out.append(v)
        return out, issues


class Obj(Schema):
    """z.object(shape): keys not in the shape are dropped."""

    def __init__(self, shape: dict[str, Schema]):
        self.shape = shape

    def run(self, value):
        if not isinstance(value, dict):
            return value, [{"expected": "object", "code": "invalid_type", "input": value}]
        out, issues = {}, []
        for key, schema in self.shape.items():
            present = key in value
            if not present and schema.optional:
                continue
            v, key_issues = schema.run(value[key] if present else UNDEFINED)
            issues.extend(_prefix(key, key_issues))
            if not present:
                if not key_issues:
                    issues.append({"code": "invalid_type", "expected": "nonoptional", "input": UNDEFINED, "path": [key]})
                continue
            if v is not UNDEFINED:
                out[key] = v
        return out, issues


class Record(Schema):
    """z.record(z.string(), value)."""

    def __init__(self, value: Schema):
        self.value = value

    def run(self, value):
        if not isinstance(value, dict):
            return value, [{"expected": "record", "code": "invalid_type", "input": value}]
        out, issues = {}, []
        for key in js_key_order(value):
            if key == "__proto__":
                continue
            v, key_issues = self.value.run(value[key])
            issues.extend(_prefix(key, key_issues))
            out[key] = v
        return out, issues


class Tuple(Schema):
    def __init__(self, *items: Schema):
        self.items = items

    def run(self, value):
        if not isinstance(value, list):
            return value, [{"input": value, "expected": "tuple", "code": "invalid_type"}]
        n = len(self.items)
        if len(value) < n:
            return value, [{"code": "too_small", "minimum": n, "inclusive": True, "input": value, "origin": "array"}]
        issues: list[dict] = []
        if len(value) > n:
            issues.append({"code": "too_big", "maximum": n, "inclusive": True, "input": value, "origin": "array"})
        out = []
        for i, schema in enumerate(self.items):
            v, item_issues = schema.run(value[i])
            issues.extend(_prefix(i, item_issues))
            out.append(v)
        return out, issues


class Union(Schema):
    def __init__(self, *options: Schema):
        self.options = options

    def run(self, value):
        results = []
        for option in self.options:
            v, issues = option.run(value)
            if not issues:
                return v, []
            results.append((v, issues))
        nonaborted = [r for r in results if not aborted(r[1])]
        if len(nonaborted) == 1:
            return nonaborted[0]
        return value, [{"code": "invalid_union", "input": value, "errors": [[finalize(i) for i in issues] for _, issues in results]}]


class Tagged(Schema):
    """z.discriminatedUnion(key, options): the option is picked by its `key` value."""

    def __init__(self, key: str, options: list[Obj]):
        self.key = key
        self.by_value: dict[str, Obj] = {}
        for option in options:
            tag = option.shape[key]
            for v in tag.values:  # type: ignore[attr-defined]
                self.by_value.setdefault(v, option)

    def run(self, value):
        if not isinstance(value, dict):
            return value, [{"code": "invalid_type", "expected": "object", "input": value}]
        tag = value.get(self.key, UNDEFINED)
        option = self.by_value.get(tag) if isinstance(tag, str) else None
        if option is not None:
            return option.run(value)
        return value, [{"code": "invalid_union", "errors": [], "note": "No matching discriminator", "discriminator": self.key, "options": list(self.by_value), "input": value, "path": [self.key]}]


# The editor tools' inputs, as in the Node server's editorTools.ts.

def _opt(schema: Schema) -> Optional:
    return Optional(schema)


_int = Num(integer=True)
_explanation = Str()
_scalar = Union(Num(), Str(), Bool(), Null())
_cell = Tuple(Num(integer=True), Num(integer=True))
_ints = Array(_int)
_structure = Tagged(
    "kind",
    [
        Obj({"kind": Enum("array"), "name": Str(), "values": Array(_scalar), "pointers": _opt(Record(_int)), "highlight": _opt(_ints), "swapped": _opt(_ints), "done": _opt(_ints), "capacity": _opt(_int)}),
        Obj({"kind": Enum("grid"), "name": Str(), "rows": Array(Array(_scalar)), "rowLabels": _opt(Array(Str())), "colLabels": _opt(Array(Str())), "current": _opt(_cell), "highlight": _opt(Array(_cell))}),
        Obj({"kind": Enum("map"), "name": Str(), "entries": Array(Tuple(_scalar, _scalar)), "highlight": _opt(Array(_scalar))}),
        Obj({"kind": Enum("stack", "queue"), "name": Str(), "values": Array(_scalar), "highlight": _opt(_ints)}),
        Obj({"kind": Enum("linked_list"), "name": Str(), "nodes": Array(_scalar), "pointers": _opt(Record(Nullable(_int))), "highlight": _opt(_ints), "cycleTo": _opt(_int)}),
        Obj({"kind": Enum("tree"), "name": Str(), "nodes": Array(_scalar), "highlight": _opt(_ints), "done": _opt(_ints), "pointers": _opt(Record(Nullable(_int)))}),
        Obj({"kind": Enum("graph"), "name": Str(), "nodes": Array(Str()), "edges": Array(Union(Tuple(Str(), Str()), Tuple(Str(), Str(), _scalar))), "directed": _opt(Bool()), "current": _opt(Str()), "visited": _opt(Array(Str())), "activeEdges": _opt(Array(Tuple(Str(), Str())))}),
    ],
)
_step = Obj(
    {
        "line": _opt(_int),
        "note": Str(),
        "vars": _opt(Record(_scalar)),
        "structures": _opt(Array(_structure)),
        "output": _opt(Str()),
        "mistake": _opt(Bool()),
        "moves": _opt(Array(Obj({"from": Str(), "to": Str(), "label": _opt(Str())}))),
        "check": _opt(Obj({"expr": Str(), "result": Bool()})),
        "calc": _opt(Str()),
        "loop": _opt(Str()),
        "callStack": _opt(Array(Str())),
        "phase": _opt(Str()),
    }
)

INPUTS: dict[str, Obj] = {
    "get_editor_state": Obj({}),
    "list_files": Obj({}),
    "read_file": Obj({"name": Str(), "start_line": _opt(Num(integer=True, minimum=1)), "end_line": _opt(Num(integer=True, minimum=1))}),
    "get_last_run": Obj({}),
    "run_code": Obj({"name": _opt(Str()), "stdin": _opt(Str())}),
    "edit_file": Obj({"name": Str(), "old_text": Str(), "new_text": Str(), "explanation": _explanation}),
    "create_file": Obj({"name": Str(), "content": Str(), "explanation": _explanation}),
    "list_notes": Obj({}),
    "read_note": Obj({"name": Str()}),
    "create_note": Obj({"content": Str(), "explanation": _explanation}),
    "edit_note": Obj({"name": Str(), "old_text": Str(), "new_text": Str(), "explanation": _explanation}),
    "create_visualization": Obj({"title": Str(), "file": _opt(Str()), "problem": _opt(Str()), "input": _opt(Str()), "expected": _opt(Str()), "steps": Array(_step)}),
    "list_problems": Obj({}),
    "get_problem": Obj({"slug": _opt(Str())}),
    "create_problem": Obj(
        {
            "title": Str(),
            "difficulty": Enum("easy", "medium", "hard"),
            "description": Str(),
            "params": Array(Obj({"name": Str(), "type": Str()})),
            "compare": _opt(Enum("exact", "any_order", "any_order_nested")),
            "tests": Array(Obj({"input": Array(Str()), "expected": Str(), "example": Bool()})),
            "starter": Str(),
            "driver": Str(),
            "link": _opt(Str()),
            "explanation": _explanation,
        }
    ),
    "add_test_case": Obj({"slug": _opt(Str()), "input": Array(Str()), "expected": Str(), "explanation": _explanation}),
    "edit_solution": Obj({"slug": _opt(Str()), "file": _opt(Str()), "old_text": Str(), "new_text": Str(), "explanation": _explanation}),
    "run_tests": Obj({"slug": _opt(Str()), "file": _opt(Str()), "all": _opt(Bool())}),
    "save_code_version": Obj({"slug": _opt(Str()), "name": Str(), "content": Str(), "explanation": _explanation}),
    "list_attempts": Obj({"slug": _opt(Str())}),
}


def check_input(tool: str, args: Any) -> tuple[dict | None, str | None]:
    """The tool's input after checking, or the error text Claude gets back."""
    value, issues = INPUTS[tool].run(args)
    if issues:
        detail = dumps([finalize(i) for i in issues], indent=2)
        return None, f"MCP error -32602: Input validation error: Invalid arguments for tool {tool}: {detail}"
    return value, None
