import json

from dsa_server import problem_store as store
from dsa_server.editor_tools import TOOLS, EditorTools, describe_problem
from dsa_server.tool_inputs import check_input

LC = "https://leetcode.com/problems/two-sum/"
PROBLEM = {"title": "Two Sum", "difficulty": "easy", "description": "d", "params": [{"name": "n", "type": "int"}], "compare": "exact", "tests": [], "createdAt": 1}


def make_tools(tmp_path, open_slug=None):
    folders = {name: str(tmp_path / name) for name in ("solutions", "notes", "playground", "problems")}
    for f in folders.values():
        (tmp_path / f).mkdir(exist_ok=True)
    sent: list[dict] = []
    asked: list[dict] = []

    async def approve(change):
        asked.append(change)
        return True

    context = {"openProblem": {"slug": open_slug, "title": "Two Sum"} if open_slug else None}
    return EditorTools(folders, context, None, approve, sent.append), folders["problems"], sent, asked


def saved(problems, slug):
    with open(f"{store.folder(problems, slug)}/problem.json", encoding="utf-8") as f:
        return json.load(f)


async def test_claude_adds_the_link_to_the_open_problem_without_asking(tmp_path):
    tools, problems, sent, asked = make_tools(tmp_path, open_slug="two-sum")
    store.create_problem(problems, PROBLEM, "class Solution {};", "int main(){}")
    result = await tools.call("set_problem_link", {"link": LC})
    assert not result.get("isError"), result
    assert saved(problems, "two-sum")["link"] == LC
    assert sent == [{"type": "problem_changed", "slug": "two-sum", "open": False}]
    assert asked == []


async def test_a_link_can_be_removed_and_one_that_isnt_a_web_address_is_refused(tmp_path):
    tools, problems, _, _ = make_tools(tmp_path)
    store.create_problem(problems, {**PROBLEM, "link": LC}, "class Solution {};", "int main(){}")
    bad = await tools.call("set_problem_link", {"slug": "two-sum", "link": "javascript:alert(1)"})
    assert bad["isError"] and saved(problems, "two-sum")["link"] == LC
    await tools.call("set_problem_link", {"slug": "two-sum", "link": None})
    assert "link" not in saved(problems, "two-sum")


def test_the_tool_is_listed_and_its_input_checked():
    schema = next(t for t in TOOLS["tools"] if t["name"] == "set_problem_link")["inputSchema"]
    assert schema["required"] == ["link"]
    assert check_input("set_problem_link", {"link": LC}) == ({"link": LC}, None)
    assert check_input("set_problem_link", {"slug": "two-sum", "link": None})[1] is None
    assert check_input("set_problem_link", {"link": 5})[1] is not None


def test_claude_is_told_when_a_problem_has_no_link_yet():
    entry = {"slug": "two-sum", "solved": False, "problem": PROBLEM, "solution": "", "versions": [], "driver": ""}
    assert describe_problem(entry, [], []).splitlines()[1] == "Link: none yet (if it's a LeetCode question, add it with set_problem_link)"
