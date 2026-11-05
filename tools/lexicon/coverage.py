# -*- coding: utf-8 -*-
"""Compare browser-clickable surfaces (regex) with spaCy token surfaces."""
import json
import os
import re
import sys
import io
from collections import Counter

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import spacy

BASE = r"C:\Users\Lenovo\Doubao\chats\2026-10-26\new-chat-1\english2-exam"
PAPERS = os.path.join(BASE, "data", "papers")
WORD_RE = re.compile(r"[A-Za-z][A-Za-z'’\-]*")


def paras(text):
    return [p.strip() for p in (text or "").split("\n\n") if p.strip()]


def section_texts(p):
    c = p.get("cloze") or {}
    parts = [c.get("instruction") or "", c.get("passage") or ""]
    for q in c.get("questions") or []:
        parts += [q.get(k) or "" for k in "ABCD"]
    yield "cloze", "\n\n".join(x for x in parts if x)

    for i, t in enumerate(p.get("reading") or [], 1):
        parts = [t.get("instruction") or "", t.get("passage") or ""]
        for q in t.get("questions") or []:
            parts.append(q.get("stem") or "")
            parts += [q.get(k) or "" for k in "ABCD"]
        yield f"reading{i}", "\n\n".join(x for x in parts if x)

    n = p.get("newtype") or {}
    parts = [n.get("instruction") or "", n.get("passage") or ""]
    parts += [(n.get("options") or {}).get(k) or "" for k in "ABCDEFG"]
    for it in n.get("items") or []:
        parts.append(it.get("stem") or "")
    for q in n.get("questions") or []:
        parts.append(q.get("stem") or "")
        parts += [q.get(k) or "" for k in "ABCD"]
    yield "newtype", "\n\n".join(x for x in parts if x)

    tr = p.get("translation") or {}
    yield "translation", "\n\n".join(x for x in [tr.get("instruction") or "", tr.get("passage") or ""] if x)

    parts = []
    for w in p.get("writing") or []:
        parts += [w.get("instruction") or "", w.get("prompt") or ""]
    yield "writing", "\n\n".join(x for x in parts if x)


def main():
    nlp = spacy.load("en_core_web_sm", disable=["ner"])
    regex_forms = Counter()
    spacy_forms = Counter()
    examples = {}
    for fn in sorted(os.listdir(PAPERS)):
        if not fn.endswith(".json") or fn.startswith("_"):
            continue
        with open(os.path.join(PAPERS, fn), encoding="utf-8") as f:
            p = json.load(f)
        for sec, text in section_texts(p):
            if not text.strip():
                continue
            for m in WORD_RE.finditer(text):
                s = m.group(0).strip("-")
                if s and any(ch.isalpha() for ch in s):
                    regex_forms[s] += 1
                    examples.setdefault(s, (p["year"], sec, text[max(0, m.start() - 40):m.end() + 40].replace("\n", " ")))
            doc = nlp(text)
            for t in doc:
                if t.is_alpha:
                    spacy_forms[t.text] += 1

    only_regex = [(s, n) for s, n in regex_forms.items() if s not in spacy_forms]
    only_spacy = [(s, n) for s, n in spacy_forms.items() if s not in regex_forms]
    print("regex surfaces:", len(regex_forms), "spacy surfaces:", len(spacy_forms))
    print("only regex:", len(only_regex), "only spacy:", len(only_spacy))
    print("\n-- only regex (top 80) --")
    for s, n in sorted(only_regex, key=lambda x: -x[1])[:80]:
        print(f"{n:4} {s:28} {examples[s][0]} {examples[s][1]} | {examples[s][2][:100]}")
    print("\n-- only spacy (top 40) --")
    for s, n in sorted(only_spacy, key=lambda x: -x[1])[:40]:
        print(f"{n:4} {s}")
    print("\n-- hyphenated regex forms (top 80) --")
    hy = [(s, n) for s, n in regex_forms.items() if "-" in s]
    print("count:", len(hy))
    for s, n in sorted(hy, key=lambda x: -x[1])[:80]:
        print(f"{n:4} {s}")


if __name__ == "__main__":
    main()
