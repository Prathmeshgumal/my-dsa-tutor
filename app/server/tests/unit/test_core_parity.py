"""The server's copies of @dsa/core helpers must agree with the originals in packages/core (the browser keeps using
those): judging test output, comparing answers, and checking Claude's dry runs. Random inputs, both answers compared."""

import json
import random
import subprocess
from pathlib import Path

from dsa_server.dry_run import dry_run_problems
from dsa_server.runner import CASE_MARK, RESULT_MARK, build_cpp_source, build_stdin, describe_input, judge_output, same_answer

CORE = Path(__file__).resolve().parents[3] / "packages" / "core" / "src"


def node(script: str, data) -> list:
    out = subprocess.run(["node", "--input-type=module", "-e", script], input=json.dumps(data), capture_output=True, text=True, check=True, cwd=CORE)
    return json.loads(out.stdout)


def answer_text(rng: random.Random) -> str:
    pieces = ["[1,2]", "[2,1]", "[[1,2],[3]]", "[[3],[2,1]]", "1", " 1 ", "true", '"a"', '"é😀"', "[]", "{}", '{"b":1,"2":3}', "nope", "", "1.50000", "[1, 2]", "[null]", "1e400", "[\"b\",\"a\"]"]
    return rng.choice(pieces) + rng.choice(["", "\n", " ", "\t"])


def test_answers_compare_like_core():
    rng = random.Random(3)
    cases = [[answer_text(rng), answer_text(rng), rng.choice(["exact", "any_order", "any_order_nested"])] for _ in range(1500)]
    script = f"import {{ sameAnswer }} from '{CORE}/problems.ts'; import {{ readFileSync }} from 'node:fs'; const c = JSON.parse(readFileSync(0, 'utf8')); console.log(JSON.stringify(c.map(([o, e, m]) => sameAnswer(o, e, m))))"
    assert [same_answer(*c) for c in cases] == node(script, cases)


def program_output(rng: random.Random, cases: int) -> str:
    parts = []
    for _ in range(rng.randint(0, cases + 1)):
        printed = rng.choice(["", "debug\n", "\nx", "a\nb"])
        parts.append(f"{printed}\n{RESULT_MARK}\n{answer_text(rng).strip()}\n{CASE_MARK}\n" if rng.random() < 0.85 else printed)
    return "".join(parts)


def test_output_is_judged_like_core():
    rng = random.Random(4)
    cases = []
    for _ in range(800):
        n = rng.randint(0, 4)
        tests = [{"expected": answer_text(rng).strip()} for _ in range(n)]
        cases.append([program_output(rng, n), tests, rng.choice(["exact", "any_order"]), rng.random() < 0.5])
    script = f"import {{ judgeOutput }} from '{CORE}/problems.ts'; import {{ readFileSync }} from 'node:fs'; const c = JSON.parse(readFileSync(0, 'utf8')); console.log(JSON.stringify(c.map((a) => judgeOutput(...a))))"
    assert [judge_output(*c) for c in cases] == node(script, cases)


def test_test_input_and_program_like_core():
    params = [{"name": "nums", "type": "vector<int>"}, {"name": "target", "type": "int"}]
    tests = [{"input": ["[2,7]", "9"]}, {"input": ["[1]", "2", "extra"]}, {"input": []}]
    script = (
        f"import {{ buildStdin, describeInput }} from '{CORE}/problems.ts'; import {{ buildCppSource }} from '{CORE}/cppHarness.ts';"
        "import { readFileSync } from 'node:fs'; const [p, t] = JSON.parse(readFileSync(0, 'utf8'));"
        "console.log(JSON.stringify([buildStdin(t), t.map((x) => describeInput(p, x)), buildCppSource('class S {};', 'int main() {}')]))"
    )
    assert [build_stdin(tests), [describe_input(params, t) for t in tests], build_cpp_source("class S {};", "int main() {}")] == node(script, [params, tests])


def random_step(rng: random.Random) -> dict:
    step: dict = {"note": "n"}
    if rng.random() < 0.6:
        step["line"] = rng.randint(-1, 12)
    if rng.random() < 0.5:
        step["vars"] = {rng.choice(["i", "j", "sum"]): rng.randint(0, 3)}
    structures = []
    for _ in range(rng.randint(0, 3)):
        kind = rng.choice(["array", "grid", "map", "stack", "linked_list", "tree", "graph"])
        n = rng.randint(0, 4)
        if kind == "array":
            s = {"kind": "array", "name": "a", "values": list(range(n))}
            if rng.random() < 0.5:
                s["capacity"] = rng.randint(0, 6)
            if rng.random() < 0.5:
                s["pointers"] = {"i": rng.randint(-2, 6), "j": rng.randint(-2, 6)}
        elif kind == "grid":
            s = {"kind": "grid", "name": "dp", "rows": [[0] * rng.randint(0, 3) for _ in range(n)]}
            if rng.random() < 0.7:
                s["current"] = [rng.randint(-1, 4), rng.randint(-1, 4)]
        elif kind == "map":
            s = {"kind": "map", "name": "m", "entries": [[rng.choice([1, "k", None, True, 1.5]), 0] for _ in range(n)]}
        elif kind == "stack":
            s = {"kind": "stack", "name": "st", "values": list(range(n))}
        elif kind == "linked_list":
            s = {"kind": "linked_list", "name": "l", "nodes": list(range(n))}
        elif kind == "tree":
            s = {"kind": "tree", "name": "t", "nodes": [rng.choice([1, None]) for _ in range(n)]}
        else:
            s = {"kind": "graph", "name": "g", "nodes": ["a", "b"], "edges": [[rng.choice("abc"), rng.choice("abc")] for _ in range(n)]}
        structures.append(s)
    if structures:
        step["structures"] = structures
    if rng.random() < 0.5:
        refs = ["a[0]", "a[3]", "dp[0][0]", "m[1]", "m[k]", "m[null]", "m[true]", "m[1.5]", "st[1]", "l[0]", "t[0]", "t[1]", "g[a]", "i", "sum", "x"]
        step["moves"] = [{"from": rng.choice(refs), "to": rng.choice(refs)} for _ in range(rng.randint(1, 3))]
    return step


def test_dry_runs_are_checked_like_core():
    rng = random.Random(5)
    code = "\n".join(f"line {i}" for i in range(10))
    cases = [[rng.choice([None, "", code, "one"]), [random_step(rng) for _ in range(rng.choice([0, 1, 2, 5, 201]))]] for _ in range(400)]
    script = f"import {{ dryRunProblems }} from '{CORE}/dryRun.ts'; import {{ readFileSync }} from 'node:fs'; const c = JSON.parse(readFileSync(0, 'utf8')); console.log(JSON.stringify(c.map(([code, steps]) => dryRunProblems({{ code: code ?? undefined, steps }}))))"
    assert [dry_run_problems(c, s) for c, s in cases] == node(script, cases)
