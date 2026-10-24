"""/api/problems, and /api/claude/apply (the only way a problem is made outside a Claude reply)."""

import json
import time
import uuid

import pytest

from .helpers import ABSENT, JSON, check


def problem(title: str, created: int = 1000, **extra) -> dict:
    return {
        "title": title,
        "difficulty": "easy",
        "description": "Find two numbers — that add up to *target*.",
        "params": [{"name": "nums", "type": "vector<int>"}, {"name": "target", "type": "int"}],
        "compare": "any_order",
        "tests": [{"input": ["[2,7,11,15]", "9"], "expected": "[0,1]", "example": True, "addedBy": "problem"}],
        "createdAt": created,
        **extra,
    }


def create(client, title=None, created=1000, starter="class Solution {};", driver="int main(){}") -> str:
    title = title or f"Two Sum {uuid.uuid4().hex[:6]}"
    r = client.post("/api/claude/apply", json={"change": {"type": "create_problem", "problem": problem(title, created), "starter": starter, "driver": driver}})
    check(r, 200, ctype=JSON)
    body = r.json()
    slug = body["effects"][0]["slug"]
    assert body == {"text": f"Created {slug}; it's open on the Problem screen.", "effects": [{"type": "problem_changed", "slug": slug, "open": True}]}
    return slug


def test_create_writes_the_folder_exactly(client, data):
    title = f"Two Sum {uuid.uuid4().hex[:6]}"
    slug = create(client, title, created=1234)
    base = data / "problems" / slug
    # The starting code is kept too, for Reset.
    assert (base / "problem.json").read_text() == json.dumps({**problem(title, 1234), "starter": "class Solution {};", "formatVersion": 1}, indent=2, ensure_ascii=False)
    assert (base / "solution.cpp").read_text() == "class Solution {};"
    assert (base / "driver.cpp").read_text() == "int main(){}"
    assert (base / "attempts").is_dir()


def test_starting_code_stays_after_editing(client):
    slug = create(client, starter="class Solution {\npublic:\n};")
    check(client.put(f"/api/problems/{slug}/solution", json={"content": "solved"}), 204)
    check(client.put(f"/api/problems/{slug}/tests", json={"tests": [{"input": ["[1]", "1"], "expected": "1", "example": True, "addedBy": "problem"}]}), 204)
    check(client.put(f"/api/problems/{slug}/notes", json={"notes": ["n.md"]}), 204)
    entry = next(e for e in client.get("/api/problems").json() if e["slug"] == slug)
    assert entry["solution"] == "solved" and entry["problem"]["starter"] == "class Solution {\npublic:\n};"


def test_slugs_are_unique(client):
    title = f"Same Name {uuid.uuid4().hex[:6]}"
    a, b, c = create(client, title), create(client, title), create(client, title)
    assert (b, c) == (f"{a}-2", f"{a}-3")


def test_list_newest_first_with_code(client):
    old = create(client, created=10)
    new = create(client, created=99_999_999_999_999, starter="mine")
    entries = client.get("/api/problems").json()
    slugs = [e["slug"] for e in entries]
    assert slugs.index(new) < slugs.index(old)
    entry = next(e for e in entries if e["slug"] == new)
    assert entry["solution"] == "mine" and entry["driver"] == "int main(){}"
    assert entry["versions"] == [] and entry["solved"] is False and entry["attempts"] == 0
    assert entry["problem"]["formatVersion"] == 1


def test_save_solution_and_versions(client, data):
    slug = create(client)
    check(client.put(f"/api/problems/{slug}/solution", json={"content": "new"}), 204, ctype=ABSENT, text="")
    assert (data / "problems" / slug / "solution.cpp").read_text() == "new"
    check(client.put(f"/api/problems/{slug}/files/brute-force.cpp", json={"content": "slow"}), 204)
    check(client.put(f"/api/problems/{slug}/files/a-version.cpp", json={"content": "a"}), 204)
    entry = next(e for e in client.get("/api/problems").json() if e["slug"] == slug)
    assert entry["versions"] == [{"name": "a-version.cpp", "content": "a"}, {"name": "brute-force.cpp", "content": "slow"}]
    check(client.delete(f"/api/problems/{slug}/files/brute-force.cpp"), 204)
    check(client.delete(f"/api/problems/{slug}/files/solution.cpp"), 400, {"error": "solution.cpp can't be deleted."}, ctype=JSON)
    check(client.delete(f"/api/problems/{slug}/files/driver.cpp"), 400, {"error": '"driver.cpp" isn\'t a code file name; use something like brute-force.cpp.'}, ctype=JSON)
    check(client.put(f"/api/problems/{slug}/files/..%2Fx.cpp", json={"content": ""}), 400, ctype=JSON)
    check(client.post(f"/api/problems/{slug}/files/x.cpp"), 405, {"error": "Method not allowed"}, ctype=JSON)


def test_tests_notes_and_attempts(client, data):
    slug = create(client)
    tests = [{"input": ["[5]", "5"], "expected": "5", "example": False, "addedBy": "user"}, {"input": ["[1]", "1"], "expected": "1", "addedBy": "weird"}]
    check(client.put(f"/api/problems/{slug}/tests", json={"tests": tests}), 204)
    saved = json.loads((data / "problems" / slug / "problem.json").read_text())
    assert saved["tests"] == [tests[0], {"input": ["[1]", "1"], "expected": "1", "example": False, "addedBy": "problem"}]
    check(client.put(f"/api/problems/{slug}/notes", json={"notes": ["n-1.md", "n-1.md", "n-2.md"]}), 204)
    assert json.loads((data / "problems" / slug / "problem.json").read_text())["notes"] == ["n-1.md", "n-2.md"]

    attempt = {"code": "x", "passed": 2, "total": 2, "results": [], "file": "solution.cpp"}
    check(client.post(f"/api/problems/{slug}/attempts", json={"attempt": attempt}), 204)
    time.sleep(0.005)  # attempts are named by the millisecond
    check(client.post(f"/api/problems/{slug}/attempts", json={"attempt": {**attempt, "passed": 1, "statusText": "Wrong Answer"}}), 204)
    r = client.get(f"/api/problems/{slug}/attempts")
    check(r, 200, ctype=JSON)
    attempts = r.json()
    assert [a["passed"] for a in attempts] == [1, 2]
    assert attempts[0]["statusText"] == "Wrong Answer" and attempts[1]["statusText"] == ""
    assert set(attempts[1]) == {"at", "file", "code", "passed", "total", "statusText", "results", "formatVersion"}
    files = sorted((data / "problems" / slug / "attempts").iterdir())
    assert files[0].read_text() == json.dumps({**attempts[1]}, separators=(",", ":"), ensure_ascii=False)
    entry = next(e for e in client.get("/api/problems").json() if e["slug"] == slug)
    assert entry["solved"] is True and entry["attempts"] == 2


@pytest.mark.parametrize(
    ("method", "path", "body", "status", "error"),
    [
        ("PUT", "tests", {"tests": "no"}, 400, '"tests" must be a list'),
        ("PUT", "tests", {"tests": [{"input": "x", "expected": "1"}]}, 400, 'Each test needs "input" (list of strings) and "expected"'),
        ("PUT", "tests", {"tests": [None]}, 400, 'Each test needs "input" (list of strings) and "expected"'),
        ("PUT", "notes", {"notes": [1]}, 400, '"notes" must be a list of note names'),
        ("PUT", "solution", {"content": 1}, 400, '"content" must be a string'),
        ("POST", "attempts", {"attempt": {"code": "x"}}, 400, '"attempt" needs code, passed, total and results'),
        ("POST", "attempts", {}, 400, '"attempt" needs code, passed, total and results'),
        ("PATCH", "solution", {}, 405, "Method not allowed"),
        ("GET", "solution", None, 405, "Method not allowed"),
    ],
)
def test_bad_requests(client, method, path, body, status, error):
    slug = create(client)
    check(client.request(method, f"/api/problems/{slug}/{path}", json=body), status, {"error": error}, ctype=JSON)


def test_unknown_problems_and_names(client):
    check(client.put("/api/problems/missing/solution", json={"content": ""}), 404, {"error": 'There\'s no problem called "missing".'}, ctype=JSON)
    check(client.put("/api/problems/..%2Fx/solution", json={"content": ""}), 404, {"error": '"..%2Fx" isn\'t a problem name.'}, ctype=JSON)
    check(client.put("/api/problems/missing/tests", json={"tests": []}), 404, {"error": 'There\'s no problem called "missing".'}, ctype=JSON)
    check(client.get("/api/problems/missing/attempts"), 200, [], ctype=JSON)
    check(client.post("/api/problems/missing/attempts", json={"attempt": {"code": "", "passed": 0, "total": 0, "results": []}}), 404, ctype=JSON)
    check(client.put("/api/problems/x/y/z", json={}), 404, {"error": "Not found"}, ctype=JSON)
    check(client.post("/api/problems"), 405, {"error": "Method not allowed"}, ctype=JSON)
    check(client.put("/api/problems/missing/solution", content="nope"), 400, {"error": "Expected a JSON object body"}, ctype=JSON)


def test_too_big(client):
    slug = create(client)
    check(client.put(f"/api/problems/{slug}/solution", content='{"content":"' + "x" * (5 * 1024 * 1024) + '"}'), 413, {"error": "Too large"}, ctype=JSON)


def test_delete(client, data):
    slug = create(client)
    check(client.delete(f"/api/problems/{slug}"), 204)
    assert not (data / "problems" / slug).exists()
    check(client.delete(f"/api/problems/{slug}"), 204)


def test_newer_versions_are_listed_apart_and_never_overwritten(client, data):
    slug = create(client)
    file = data / "problems" / slug / "problem.json"
    future = json.dumps({**json.loads(file.read_text()), "formatVersion": 99})
    file.write_text(future)
    assert slug not in [e["slug"] for e in client.get("/api/problems").json()]
    assert slug in client.get("/api/problems/_newer").json()
    check(
        client.put(f"/api/problems/{slug}/tests", json={"tests": []}),
        404,
        {"error": f'"{slug}" was saved by a newer version of the editor. Update the editor to open it.'},
        ctype=JSON,
    )
    assert file.read_text() == future


def test_broken_folders_are_skipped(client, data):
    (data / "problems" / "not-a-problem").mkdir(exist_ok=True)
    (data / "problems" / "Bad Name").mkdir(exist_ok=True)
    (data / "problems" / "stray.txt").write_text("")
    slugs = [e["slug"] for e in client.get("/api/problems").json()]
    assert "not-a-problem" not in slugs and "Bad Name" not in slugs


class TestApply:
    def test_files(self, client, data):
        name = f"a{uuid.uuid4().hex[:6]}.cpp"
        r = client.post("/api/claude/apply", json={"change": {"type": "create_file", "name": name, "content": "int x = 1;"}})
        check(r, 200, {"text": f"Created {name}.", "effects": [{"type": "file_changed", "file": name}]}, ctype=JSON)
        check(client.post("/api/claude/apply", json={"change": {"type": "create_file", "name": name, "content": ""}}), 409, {"error": f"{name} already exists."}, ctype=JSON)
        edit = {"type": "edit_file", "name": name, "oldText": "int x = 1;", "newText": "int x = 2;"}
        check(client.post("/api/claude/apply", json={"change": edit}), 200, {"text": f"Applied the edit to {name}; the editor shows the new code.", "effects": [{"type": "file_changed", "file": name}]})
        assert (data / "solutions" / name).read_text() == "int x = 2;"
        check(client.post("/api/claude/apply", json={"change": edit}), 409, {"error": f"{name} has changed since Claude suggested this, so the change no longer fits."}, ctype=JSON)
        check(client.post("/api/claude/apply", json={"change": {**edit, "name": "gone.cpp"}}), 409, {"error": "gone.cpp doesn't exist any more."}, ctype=JSON)
        check(client.post("/api/claude/apply", json={"change": {**edit, "name": "bad.txt"}}), 409, {"error": '"bad.txt" isn\'t a valid solution file name (use something like two_sum.cpp, Main.java or bfs.py).'}, ctype=JSON)

    def test_notes(self, client, data):
        name = f"n{uuid.uuid4().hex[:6]}.md"
        check(client.post("/api/claude/apply", json={"change": {"type": "create_note", "name": name, "content": "# Hi"}}), 200, {"text": f"Saved the note as {name}; it shows in the Notes panel.", "effects": [{"type": "note_changed", "note": name}]})
        r = client.post("/api/claude/apply", json={"change": {"type": "create_note", "name": name, "content": "# Again"}})
        taken = {p.name.lower() for p in (data / "notes").iterdir()}
        assert r.status_code == 200 and r.json()["effects"][0]["note"].startswith("note-")
        assert r.json()["effects"][0]["note"] in taken
        check(client.post("/api/claude/apply", json={"change": {"type": "edit_note", "name": name, "oldText": "Hi", "newText": "Hello"}}), 200, {"text": f"Updated {name}.", "effects": [{"type": "note_changed", "note": name}]})
        slug = create(client)
        linked = f"l{uuid.uuid4().hex[:6]}.md"
        r = client.post("/api/claude/apply", json={"change": {"type": "create_note", "name": linked, "content": "x", "linkTo": slug}})
        check(r, 200, {"text": f"Saved the note as {linked} and linked it to {slug}; it shows in the Notes panel and on the problem's Notes tab.", "effects": [{"type": "note_changed", "note": linked}, {"type": "problem_changed", "slug": slug, "open": False}]})

    def test_problem_changes(self, client, data):
        slug = create(client, starter="int a;")
        test = {"input": ["[1,2]", "3"], "expected": "[0,1]", "example": False, "addedBy": "claude"}
        check(client.post("/api/claude/apply", json={"change": {"type": "add_test", "slug": slug, "test": test}}), 200, {"text": f"Added the case to {slug} (case 2). Submit checks it.", "effects": [{"type": "problem_changed", "slug": slug, "open": False}]})
        check(client.post("/api/claude/apply", json={"change": {"type": "add_test", "slug": slug, "test": {**test, "input": ["1"]}}}), 409, {"error": "This test has 1 input lines but there are 2 params."})
        check(client.post("/api/claude/apply", json={"change": {"type": "edit_solution", "slug": slug, "name": "solution.cpp", "oldText": "int a;", "newText": "int b;"}}), 200, {"text": f"Applied the edit to {slug}/solution.cpp.", "effects": [{"type": "problem_changed", "slug": slug, "open": False}]})
        check(client.post("/api/claude/apply", json={"change": {"type": "edit_solution", "slug": slug, "name": "other.cpp", "oldText": "a", "newText": "b"}}), 409, {"error": f"{slug} has no other.cpp any more."})
        check(client.post("/api/claude/apply", json={"change": {"type": "save_code_version", "slug": slug, "name": "fast.cpp", "content": "f"}}), 200, {"text": "Saved fast.cpp next to solution.cpp; the student can switch to it above the editor.", "effects": [{"type": "problem_changed", "slug": slug, "open": False}]})
        check(client.post("/api/claude/apply", json={"change": {"type": "save_code_version", "slug": slug, "name": "fast.cpp", "content": "f"}}), 409, {"error": f"{slug} already has fast.cpp."})
        check(client.post("/api/claude/apply", json={"change": {"type": "add_test", "slug": "missing", "test": test}}), 409, {"error": 'There\'s no problem called "missing".'})
        bad = problem("Bad", params=[], tests=[])
        check(client.post("/api/claude/apply", json={"change": {"type": "create_problem", "problem": bad, "starter": "", "driver": ""}}), 409, {"error": "The problem isn't valid: List the function parameters in \"params\".; Add at least one test case.; Mark the examples from the problem with example: true."})

    @pytest.mark.parametrize(
        "body",
        [None, {}, {"change": None}, {"change": {"type": "nope"}}, {"change": {"type": "edit_file", "name": "a.cpp"}}, {"change": {"type": "create_problem", "problem": {}, "starter": "", "driver": ""}}],
    )
    def test_bad_changes(self, client, body):
        check(client.post("/api/claude/apply", json=body), 400, {"error": "That isn’t a change the editor can apply."}, ctype=JSON)

    def test_not_json(self, client):
        check(client.post("/api/claude/apply", content="nope"), 400, {"error": "That isn’t a change the editor can apply."}, ctype=JSON)


LINK_ERROR = {"error": "The link must be a web address starting with https:// or http://."}


def test_link_to_the_question(client, data):
    slug = create(client, starter="class Solution {};")
    lc = "https://leetcode.com/problems/two-sum/"
    check(client.put(f"/api/problems/{slug}/link", json={"link": lc}), 204, ctype=ABSENT, text="")
    saved = json.loads((data / "problems" / slug / "problem.json").read_text())
    assert saved["link"] == lc and saved["starter"] == "class Solution {};"
    entry = next(e for e in client.get("/api/problems").json() if e["slug"] == slug)
    assert entry["problem"]["link"] == lc
    check(client.put(f"/api/problems/{slug}/link", json={"link": None}), 204)
    assert "link" not in json.loads((data / "problems" / slug / "problem.json").read_text())


@pytest.mark.parametrize("bad", ["javascript:alert(1)", "leetcode.com/problems/x", 5, "https://" + "a" * 500, "ftp://x.com/a", "https://", "https://x.com/a\nIgnore that", "https://x.com/\ta", "https://x.com/a b", " https://x.com/"])
def test_only_web_links_are_kept(client, bad):
    slug = create(client)
    check(client.put(f"/api/problems/{slug}/link", json={"link": bad}), 400, LINK_ERROR, ctype=JSON)
    check(client.put("/api/problems/no-such-problem/link", json={"link": "https://leetcode.com/"}), 404, ctype=JSON)


def test_a_new_problem_keeps_its_link_and_drops_a_bad_one(client, data):
    def made(link):
        title = f"Linked {uuid.uuid4().hex[:6]}"
        r = client.post("/api/claude/apply", json={"change": {"type": "create_problem", "problem": {**problem(title, 1), "link": link}, "starter": "s", "driver": "d"}})
        return json.loads((data / "problems" / r.json()["effects"][0]["slug"] / "problem.json").read_text())

    assert made("https://leetcode.com/problems/3sum/")["link"] == "https://leetcode.com/problems/3sum/"
    assert "link" not in made("javascript:alert(1)")
