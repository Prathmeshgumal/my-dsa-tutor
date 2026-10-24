"""Sorting names: the Python server must order them exactly as JavaScript's localeCompare does."""

import json
import random
import subprocess

import pytest

from dsa_server.collate import sort_names

ASCII = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
FILE_CHARS = "abcAB_-. 0129zZ"
ACCENTED = "aäáàâeéèêoöuüñçAÄÉÖÜßæøåœ"


def node_sort(names: list[str], numeric: bool) -> list[str]:
    script = "const [n, numeric] = JSON.parse(require('fs').readFileSync(0, 'utf8')); console.log(JSON.stringify(n.sort((a, b) => a.localeCompare(b, undefined, { numeric }))))"
    out = subprocess.run(["node", "-e", script], input=json.dumps([names, numeric]), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def names(alphabet: str, count: int, seed: int) -> list[str]:
    rng = random.Random(seed)
    return ["".join(rng.choice(alphabet) for _ in range(rng.randint(1, 8))) for _ in range(count)]


@pytest.mark.parametrize("numeric", [False, True])
@pytest.mark.parametrize(("alphabet", "seed"), [(ASCII, 1), (FILE_CHARS, 2), (FILE_CHARS, 3)])
def test_ascii_names_sort_like_node(alphabet, seed, numeric):
    sample = names(alphabet, 3000, seed)
    assert sort_names(sample, numeric) == node_sort(sample, numeric)


def test_accented_names_sort_like_node():
    sample = names(ACCENTED + "abz.-_ ", 3000, 4)
    assert sort_names(sample) == node_sort(sample, False)


def test_real_file_names():
    sample = ["b.cpp", "A.cpp", "a.cpp", "two_sum.cpp", "two-sum.cpp", "twoSum.cpp", "Two.cpp", "10.cpp", "9.cpp", "_x.cpp", "z.py", "Main.java", "ä.cpp", "a b.cpp", "note-10.md", "note-2.md", "note-1.md"]
    for numeric in (False, True):
        assert sort_names(sample, numeric) == node_sort(sample, numeric)


def test_accented_names_with_numbers_sort_like_node():
    sample = names(ACCENTED + "0129.-_ ", 3000, 5)
    assert sort_names(sample, True) == node_sort(sample, True)
