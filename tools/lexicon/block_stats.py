# -*- coding: utf-8 -*-
"""Block-level ambiguity stats: paragraph/question-sized blocks."""
import json
import os
import sys
import io
from collections import Counter, defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import spacy

BASE = r"C:\Users\Lenovo\Doubao\chats\2026-10-26\new-chat-1\english2-exam"
PAPERS = os.path.join(BASE, "data", "papers")


def paras(text):
    return [p.strip() for p in (text or "").split("\n\n") if p.strip()]


def blocks(p):
    """Yield (section, block_id, text) matching the renderer's visible order."""
    c = p.get("cloze") or {}
    yield "cloze", "instr", c.get("instruction") or ""
    for i, para in enumerate(paras(c.get("passage"))):
        yield "cloze", f"p{i}", para
    for q in c.get("questions") or []:
        opts = " ".join(q.get(k) or "" for k in "ABCD")
        yield "cloze", f"q{q.get('no')}", opts

    for ti, t in enumerate(p.get("reading") or [], 1):
        sec = f"reading{ti}"
        yield sec, "instr", t.get("instruction") or ""
        for i, para in enumerate(paras(t.get("passage"))):
            yield sec, f"p{i}", para
        for q in t.get("questions") or []:
            opts = " ".join(q.get(k) or "" for k in "ABCD")
            yield sec, f"q{q.get('no')}", (q.get("stem") or "") + " " + opts

    n = p.get("newtype") or {}
    yield "newtype", "instr", n.get("instruction") or ""
    for i, para in enumerate(paras(n.get("passage"))):
        yield "newtype", f"p{i}", para
    yield "newtype", "options", " ".join((n.get("options") or {}).get(k) or "" for k in "ABCDEFG")
    for it in n.get("items") or []:
        yield "newtype", f"i{it.get('no')}", it.get("stem") or ""
    for q in n.get("questions") or []:
        opts = " ".join(q.get(k) or "" for k in "ABCD")
        yield "newtype", f"q{q.get('no')}", (q.get("stem") or "") + " " + opts

    tr = p.get("translation") or {}
    yield "translation", "instr", tr.get("instruction") or ""
    for i, para in enumerate(paras(tr.get("passage"))):
        yield "translation", f"p{i}", para

    for wi, w in enumerate(p.get("writing") or []):
        yield "writing", f"w{wi}", " ".join(x for x in [w.get("instruction") or "", w.get("prompt") or ""] if x)


def main():
    nlp = spacy.load("en_core_web_sm", disable=["ner"])
    papers = []
    for fn in sorted(os.listdir(PAPERS)):
        if fn.endswith(".json") and not fn.startswith("_"):
            with open(os.path.join(PAPERS, fn), encoding="utf-8") as f:
                papers.append(json.load(f))

    by_block = defaultdict(Counter)
    for p in papers:
        for sec, bid, text in blocks(p):
            if not text.strip():
                continue
            doc = nlp(text)
            for tok in doc:
                if tok.is_alpha:
                    by_block[(p["year"], sec, bid, tok.text)][tok.lemma_.lower()] += 1

    multi = [(k, v) for k, v in by_block.items() if len(v) > 1]
    print("blocks with an ambiguous surface form:", len(multi))
    for (year, sec, bid, surface), counter in sorted(multi):
        print(f"  {year} {sec:12} {bid:8} {surface:18} {dict(counter)}")


if __name__ == "__main__":
    main()
