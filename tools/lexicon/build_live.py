"""Build the lazy-loaded dictionary used for words outside the exam paper.

Output: data/live-dict/<letter>.js, one small script per first letter.
The paper still uses lexicon.json / wordmap.json; page.html stays small.

Coverage: high-frequency single-word ECDICT entries plus every lemma used by
the papers. Forms are generated with Lemminflect and merged with ECDICT's
exchange field. Candidates are ordered by ECDICT frequency (lower frq/bnc rank
first); no context is used.
"""
import collections
import csv
import json
import os

from lemminflect import getAllInflections

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ECDICT = os.path.join(BASE, "data", "dict", "ecdict.csv")
LEXICON = os.path.join(BASE, "data", "lexicon", "lexicon.json")
OUTDIR = os.path.join(BASE, "data", "live-dict")


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


def part_of(surface):
    first = surface[:1]
    return first if "a" <= first <= "z" else "_"


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

    groups = collections.defaultdict(lambda: {"forms": {}, "entries": {}})
    for surface, lemmas in ranked.items():
        group = groups[part_of(surface)]
        group["forms"][surface] = lemmas
        for lemma in lemmas:
            if lemma in entries:
                group["entries"][lemma] = entries[lemma]

    os.makedirs(OUTDIR, exist_ok=True)
    for old in os.listdir(OUTDIR):
        if old.endswith(".js"):
            os.remove(os.path.join(OUTDIR, old))
    total = 0
    for part in sorted(groups):
        path = os.path.join(OUTDIR, part + ".js")
        with open(path, "w", encoding="utf-8") as f:
            f.write("window.__LIVE_DICT_PARTS__=window.__LIVE_DICT_PARTS__||{};")
            f.write("window.__LIVE_DICT_PARTS__[")
            f.write(json.dumps(part))
            f.write("]=")
            json.dump(groups[part], f, ensure_ascii=False, separators=(",", ":"))
            f.write(";")
        total += os.path.getsize(path)
    print(f"lemmas={len(entries)} surfaces={len(ranked)} parts={len(groups)} bytes={total}")


if __name__ == "__main__":
    main()
