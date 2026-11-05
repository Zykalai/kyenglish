"""Build the lazy-loaded dictionary used for words outside the exam paper.

Output: data/live-dict.js (a global window.__LIVE_DICT__ object).

It is intentionally a separate asset: the paper still uses lexicon.json /
wordmap.json, and page.html stays small. The live asset covers high-frequency
single-word ECDICT entries plus every lemma used by the papers. Forms are
generated with Lemminflect and merged with ECDICT's exchange field.

The page shows multiple candidates; candidates are ordered by ECDICT frequency
(lower frq/bnc rank first). No context is used here.
"""
import collections
import csv
import json
import os

from lemminflect import getAllInflections

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ECDICT = os.path.join(BASE, "data", "dict", "ecdict.csv")
LEXICON = os.path.join(BASE, "data", "lexicon", "lexicon.json")
OUT = os.path.join(BASE, "data", "live-dict.js")


def rank(row):
    vals = []
    for key in ("frq", "bnc"):
        try:
            value = int(row.get(key) or 0)
        except ValueError:
            value = 0
        if value > 0:
            vals.append(value)
    return min(vals) if vals else 10 ** 9


def main():
    rows = {}
    with open(ECDICT, encoding="utf-8", errors="replace", newline="") as f:
        for row in csv.DictReader(f):
            word = (row.get("word") or "").strip().lower()
            translation = (row.get("translation") or "").strip()
            if not word or not translation or not word.isalpha():
                continue
            if rank(row) >= 10 ** 9:
                continue
            if word not in rows or rank(row) < rank(rows[word]):
                rows[word] = row

    # Keep every lemma that the exam papers already use.
    with open(LEXICON, encoding="utf-8") as f:
        paper_lexicon = json.load(f)
    for word, (meaning, phonetic) in paper_lexicon.items():
        word = word.lower()
        if word not in rows and word.isalpha():
            rows[word] = {"word": word, "translation": meaning,
                          "phonetic": phonetic, "frq": "0", "bnc": "0"}

    forms = collections.defaultdict(set)
    entries = {}
    for word, row in rows.items():
        translation = (row.get("translation") or "").strip()
        if not translation:
            continue
        entries[word] = [translation, (row.get("phonetic") or "").strip()]
        forms[word].add(word)
        try:
            inflections = getAllInflections(word)
        except Exception:
            inflections = {}
        for values in inflections.values():
            for form in values:
                form = str(form).strip().lower()
                if len(form) >= 2 and form.isalpha():
                    forms[form].add(word)
        for part in (row.get("exchange") or "").split("/"):
            if ":" not in part:
                continue
            key, value = part.split(":", 1)
            value = value.strip().lower()
            if key != "0" and value.isalpha():
                forms[value].add(word)

    ranked = {}
    for surface, lemmas in forms.items():
        candidates = sorted(
            (lemma for lemma in lemmas if lemma in entries),
            key=lambda lemma: (rank(rows[lemma]), lemma),
        )
        unique = []
        for lemma in candidates:
            if lemma not in unique:
                unique.append(lemma)
        if unique:
            ranked[surface] = unique

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("window.__LIVE_DICT__=")
        json.dump({"forms": ranked, "entries": entries}, f,
                  ensure_ascii=False, separators=(",", ":"))
        f.write(";")
    print(f"lemmas={len(entries)} surfaces={len(ranked)} bytes={os.path.getsize(OUT)}")


if __name__ == "__main__":
    main()
