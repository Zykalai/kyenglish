# -*- coding: utf-8 -*-
"""Precompute instant word cards for words that appear on the exam paper.

Paper words are known ahead of time, so we can resolve their full card
(direct entry + form-note base sections) at build time. AI/outside text still
uses the lazy data/dict-parts lookup.

Output: data/paper-cards.json
"""
import csv
import json
import os
import re

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ECDICT = os.path.join(BASE, "data", "dict", "ecdict.csv")
PAPERS = os.path.join(BASE, "data", "papers")
OUT = os.path.join(BASE, "data", "paper-cards.json")

WORD_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-z0-9À-ÖØ-öø-ÿ'’&.\-]*")
POS = {"n", "v", "a", "ad", "adj", "adv", "vt", "vi", "prep", "conj",
       "pron", "num", "art", "aux", "suf", "pref", "abbr", "neg", "pl", "sing"}
STOP = {"the", "and", "or", "of", "to", "in", "on", "for", "with", "at",
        "by", "from", "as", "is", "are", "was", "were", "be", "been",
        "being", "this", "that", "these", "those", "it", "its", "he",
        "she", "they", "we", "you", "i", "not", "no", "do", "does", "did",
        "can", "could", "will", "would", "shall", "should", "may", "might",
        "must", "if", "than", "then", "so", "such", "etc"}
FORM = (r"(?:过去式|过去分词|现在分词|现在式|现在式第三人称单数?|复数|"
        r"第三人称单数|比较级|最高级|缩写|变形|形式)")


def walk_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from walk_strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk_strings(item)


def meaning_lines(entry):
    text = (entry[0] or "").replace("\\r", "\n").replace("\\n", "\n").replace("\r\n", "\n")
    lines = []
    for line in text.split("\n"):
        line = line.strip()
        if not line or re.match(r"^\[[^\]]{1,10}\]", line):
            continue
        line = re.sub(r"\s*\[[^\]]{1,10}\][\s\S]*$", "", line).strip()
        if line:
            lines.append(line)
    return lines


def refs(entry, surface):
    text = " ".join(meaning_lines(entry))
    out = []
    seen = set()
    for m in re.finditer(r"[A-Za-z][A-Za-z'-]*", text):
        token = m.group(0).lower().strip("'-")
        if len(token) < 2 or token in POS or token == surface or token in seen:
            continue
        is_form = re.search(re.escape(token) + r"\s*的\s*" + FORM, text) is not None
        if not is_form and token in STOP:
            continue
        seen.add(token)
        out.append((token, "原形" if is_form else "相关词"))
    return out


def main():
    ecdict = {}
    with open(ECDICT, encoding="utf-8", errors="replace", newline="") as f:
        for row in csv.DictReader(f):
            word = (row.get("word") or "").strip().lower()
            translation = (row.get("translation") or "").strip()
            if word and translation:
                ecdict.setdefault(word, [translation, (row.get("phonetic") or "").strip()])

    surfaces = set()
    for name in os.listdir(PAPERS):
        if not name.endswith(".json") or name.startswith("_"):
            continue
        with open(os.path.join(PAPERS, name), encoding="utf-8") as f:
            data = json.load(f)
        for text in walk_strings(data):
            for m in WORD_RE.finditer(text):
                word = m.group(0).replace("’", "'").strip(".'’&-").lower()
                if word and any(ch.isalpha() for ch in word):
                    surfaces.add(word)

    cards = {}
    for surface in surfaces:
        entry = ecdict.get(surface)
        if not entry:
            continue
        sections = []
        seen = {surface}
        queue = [(surface, entry, 0)]
        while queue and len(sections) < 8:
            key, current, depth = queue.pop(0)
            for token, label in refs(current, key):
                if token in seen:
                    continue
                seen.add(token)
                ref_entry = ecdict.get(token)
                if not ref_entry:
                    continue
                sections.append({"key": token, "label": label, "entry": ref_entry})
                if depth < 3 and len(sections) < 8:
                    queue.append((token, ref_entry, depth + 1))
        cards[surface] = {"entry": entry, "baseSections": sections}

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(cards, f, ensure_ascii=False, separators=(",", ":"))
    print(f"surfaces={len(surfaces)} cards={len(cards)} bytes={os.path.getsize(OUT)}")


if __name__ == "__main__":
    main()
