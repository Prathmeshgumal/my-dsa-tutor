"""/api/files, /api/notes and /api/playground: folders of real files."""

import uuid

import pytest

from .helpers import ABSENT, JSON, check

STORES = [
    ("/api/files", "solutions", ".cpp"),
    ("/api/notes", "notes", ".md"),
    ("/api/playground", "playground", ".json"),
]


def unique(ext: str) -> str:
    return f"t{uuid.uuid4().hex[:8]}{ext}"


@pytest.mark.parametrize(("route", "folder", "ext"), STORES)
def test_save_list_rename_delete(client, data, route, folder, ext):
    name, renamed = unique(ext), unique(ext)
    check(client.put(f"{route}/{name}", json={"content": "héllo\n"}), 204, ctype=ABSENT, text="")
    assert (data / folder / name).read_text() == "héllo\n"
    assert {"name": name, "content": "héllo\n"} in client.get(route).json()
    check(client.post(f"{route}/{name}/rename", json={"to": renamed}), 204, text="")
    assert not (data / folder / name).exists()
    assert (data / folder / renamed).read_text() == "héllo\n"
    check(client.delete(f"{route}/{renamed}"), 204, text="")
    assert not (data / folder / renamed).exists()
    # Deleting is idempotent.
    check(client.delete(f"{route}/{renamed}"), 204)


@pytest.mark.parametrize(("route", "folder", "ext"), STORES)
@pytest.mark.parametrize("url_suffix", ["", "/", "?x=1"])
def test_list_forms(client, route, folder, ext, url_suffix):
    check(client.get(f"{route}{url_suffix}"), 200, ctype=JSON, cache=ABSENT)


def test_list_is_sorted_like_the_page_expects(client, data):
    folder = data / "solutions"
    for f in folder.iterdir():
        f.unlink()
    names = ["b.cpp", "A.cpp", "a.cpp", "two_sum.cpp", "two-sum.cpp", "twoSum.cpp", "Two.cpp", "10.cpp", "9.cpp", "_x.cpp", "z.py", "Main.java", "ä.cpp", "a b.cpp"]
    for n in names:
        (folder / n).write_text(n)
    # Hidden files, other kinds of file and folders are left out.
    (folder / ".hidden.cpp").write_text("")
    (folder / "notes.txt").write_text("")
    (folder / "sub.cpp").mkdir()
    listed = [f["name"] for f in client.get("/api/files").json()]
    assert listed == ["_x.cpp", "10.cpp", "9.cpp", "a b.cpp", "a.cpp", "A.cpp", "ä.cpp", "b.cpp", "Main.java", "two_sum.cpp", "two-sum.cpp", "Two.cpp", "twoSum.cpp", "z.py"]
    assert client.get("/api/files").json()[0] == {"name": "_x.cpp", "content": "_x.cpp"}
    for n in names:
        (folder / n).unlink()
    (folder / ".hidden.cpp").unlink()
    (folder / "notes.txt").unlink()
    (folder / "sub.cpp").rmdir()


@pytest.mark.parametrize(
    ("route", "bad"),
    [
        ("/api/files", "a.txt"),
        ("/api/files", ".a.cpp"),
        ("/api/files", "a"),
        ("/api/files", "a%5Cb.cpp"),
        ("/api/notes", "a.cpp"),
        ("/api/playground", "a b.json"),
        ("/api/playground", "a.md"),
    ],
)
def test_bad_names_are_refused(client, route, bad):
    from urllib.parse import unquote

    check(client.put(f"{route}/{bad}", json={"content": ""}), 400, {"error": f'Invalid file name: "{unquote(bad)}"'.replace("\\", "\\\\")}, ctype=JSON)


def test_long_names_are_refused(client):
    name = "a" * 252 + ".cpp"
    check(client.put(f"/api/files/{name}", json={"content": ""}), 400, ctype=JSON)


def test_note_names_ignore_case_of_the_extension(client, data):
    name = f"{uuid.uuid4().hex[:6]}.MD"
    check(client.put(f"/api/notes/{name}", json={"content": "x"}), 204)
    (data / "notes" / name).unlink()


def test_malformed_name(client):
    check(client.put("/api/files/%E0%A4%A", json={"content": ""}), 400, {"error": "Malformed file name"}, ctype=JSON)


def test_bodies_are_checked(client):
    name = unique(".cpp")
    check(client.put(f"/api/files/{name}", content="not json"), 400, {"error": "Expected a JSON object body"}, ctype=JSON)
    check(client.put(f"/api/files/{name}", content="[1]"), 400, {"error": '"content" must be a string'}, ctype=JSON)
    check(client.put(f"/api/files/{name}", content="null"), 400, {"error": "Expected a JSON object body"}, ctype=JSON)
    check(client.put(f"/api/files/{name}", json={"content": 5}), 400, {"error": '"content" must be a string'}, ctype=JSON)
    check(client.put(f"/api/files/{name}", json={}), 400, {"error": '"content" must be a string'}, ctype=JSON)
    check(client.post(f"/api/files/{name}/rename", json={"to": 1}), 400, {"error": '"to" must be a string'}, ctype=JSON)


def test_too_big(client):
    name = unique(".cpp")
    big = '{"content":"' + "x" * (5 * 1024 * 1024) + '"}'
    check(client.put(f"/api/files/{name}", content=big), 413, {"error": "File too large"}, ctype=JSON)


def test_just_under_the_limit_is_fine(client, data):
    name = unique(".cpp")
    content = "x" * (5 * 1024 * 1024 - 20)
    check(client.put(f"/api/files/{name}", json={"content": content}), 204)
    (data / "solutions" / name).unlink()


def test_wrong_methods_and_paths(client):
    name = unique(".cpp")
    check(client.get(f"/api/files/{name}"), 405, {"error": "Method not allowed"}, ctype=JSON)
    check(client.post(f"/api/files/{name}"), 405, {"error": "Method not allowed"}, ctype=JSON)
    check(client.delete("/api/files"), 405, {"error": "Method not allowed"}, ctype=JSON)
    check(client.post("/api/files"), 405, {"error": "Method not allowed"}, ctype=JSON)
    check(client.put(f"/api/files/{name}/x/y", json={"content": ""}), 404, {"error": "Not found"}, ctype=JSON)
    check(client.put(f"/api/files/{name}/rename", json={"to": "x.cpp"}), 405, {"error": "Method not allowed"}, ctype=JSON)


def test_rename_problems(client, data):
    a, b = unique(".cpp"), unique(".cpp")
    check(client.post(f"/api/files/{a}/rename", json={"to": b}), 404, {"error": f"{a} not found"}, ctype=JSON)
    check(client.post(f"/api/files/{a}/rename", json={"to": "bad.txt"}), 400, {"error": 'Invalid file name: "bad.txt"'}, ctype=JSON)
    client.put(f"/api/files/{a}", json={"content": "1"})
    client.put(f"/api/files/{b}", json={"content": "2"})
    # A clash ignores case, so it also protects case-insensitive disks.
    check(client.post(f"/api/files/{a}/rename", json={"to": b.upper().replace(".CPP", ".cpp")}), 409, {"error": f"{b} already exists"}, ctype=JSON)
    # Changing only the case of a name is allowed.
    upper = a.replace("t", "T", 1)
    check(client.post(f"/api/files/{a}/rename", json={"to": upper}), 204)
    for n in (upper, b):
        (data / "solutions" / n).unlink()


def test_a_save_never_leaves_temp_files(client, data):
    name = unique(".cpp")
    client.put(f"/api/files/{name}", json={"content": "x"})
    assert not [p for p in (data / "solutions").iterdir() if p.name.endswith(".saving")]
    (data / "solutions" / name).unlink()


def test_folders_are_created_if_missing(client, data):
    import shutil

    shutil.rmtree(data / "playground")
    check(client.get("/api/playground"), 200, [])
    name = unique(".json")
    shutil.rmtree(data / "playground")
    check(client.put(f"/api/playground/{name}", json={"content": "{}"}), 204)
    assert (data / "playground" / name).exists()
