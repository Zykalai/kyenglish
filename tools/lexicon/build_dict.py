# -*- coding: utf-8 -*-
"""Build the direct ECDICT lookup chunks.

Everything is dictionary-first now: no spaCy, no lemmatization. Each surface
word is looked up as-is; if its definition contains a form note such as
"unspeak的过去分词", the browser looks up the base word and appends it to the
card.

Output: data/dict-parts/<first-two-letters>.js
"""
import collections
import csv
import json
import os

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ECDICT = os.path.join(BASE, "data", "dict", "ecdict.csv")
OUTDIR = os.path.join(BASE, "data", "dict-parts")


def part_of(word):
    two = word[:2]
    if len(two) == 2 and two.isascii() and two.isalpha():
        return two
    one = word[:1]
    return one if one.isascii() and one.isalpha() else "_"


def main():
    groups = collections.defaultdict(dict)
    with open(ECDICT, encoding="utf-8", errors="replace", newline="") as f:
        for row in csv.DictReader(f):
            word = (row.get("word") or "").strip().lower()
            translation = (row.get("translation") or "").strip()
            if not word or not translation:
                continue
            groups[part_of(word)].setdefault(
                word, [translation, (row.get("phonetic") or "").strip()]
            )

    os.makedirs(OUTDIR, exist_ok=True)
    for old in os.listdir(OUTDIR):
        if old.endswith(".js"):
            os.remove(os.path.join(OUTDIR, old))

    total = 0
    for part, entries in sorted(groups.items()):
        path = os.path.join(OUTDIR, part + ".js")
        with open(path, "w", encoding="utf-8") as f:
            f.write("window.__DICT_PARTS__=window.__DICT_PARTS__||{};")
            f.write("window.__DICT_PARTS__[" + json.dumps(part) + "]=")
            json.dump(entries, f, ensure_ascii=False, separators=(",", ":"))
            f.write(";")
        total += os.path.getsize(path)
    print(f"parts={len(groups)} entries={sum(len(v) for v in groups.values())} bytes={total}")


if __name__ == "__main__":
    main()
