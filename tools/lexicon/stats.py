# -*- coding: utf-8 -*-
"""Exploratory stats for the paper-word lexicon rebuild.

Reads the 17 paper JSONs, runs spaCy (en_core_web_sm) over every section,
and reports how many surface forms have one vs. several context lemmas.
"""
import csv
import json
import os
import sys
import io
from collections import Counter, defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import spacy

BASE = r"C:\Users\Lenovo\Doubao\chats\2026-10-26\new-chat-1\english2-exam"
PAPERS = os.path.join(BASE, "data", "papers")
ECDICT = os.path.join(BASE, "data", "dict", "ecdict.csv")

HEAD_TEXT = "English II Section I Section II Part A Part B Section III Section IV"


def section_texts(p):
    """Yield (section_key, text) in paper reading order; only exam-paper text."""
    c = p.get("cloze") or {}
    parts = [c.get("instruction") or "", c.get("passage") or ""]
    for q in c.get("questions") or []:
        for k in "ABCD":
            if q.get(k):
                parts.append(q[k])
    yield "cloze", "\n\n".join(x for x in parts if x)

    for i, t in enumerate(p.get("reading") or [], 1):
        parts = [t.get("instruction") or "", t.get("passage") or ""]
        for q in t.get("questions") or []:
            if q.get("stem"):
                parts.append(q["stem"])
            for k in "ABCD":
                if q.get(k):
                    parts.append(q[k])
        yield f"reading{i}", "\n\n".join(x for x in parts if x)

    n = p.get("newtype") or {}
    parts = [n.get("instruction") or "", n.get("passage") or ""]
    for k in "ABCDEFG":
        if (n.get("options") or {}).get(k):
            parts.append(n["options"][k])
    for it in n.get("items") or []:
        if it.get("stem"):
            parts.append(it["stem"])
    for q in n.get("questions") or []:
        if q.get("stem"):
            parts.append(q["stem"])
        for k in "ABCD":
            if q.get(k):
                parts.append(q[k])
    yield "newtype", "\n\n".join(x for x in parts if x)

    tr = p.get("translation") or {}
    yield "translation", "\n\n".join(x for x in [tr.get("instruction") or "", tr.get("passage") or ""] if x)

    parts = []
    for w in p.get("writing") or []:
        parts.append(w.get("instruction") or "")
        parts.append(w.get("prompt") or "")
    yield "writing", "\n\n".join(x for x in parts if x)


def main():
    print("loading spaCy ...")
    nlp = spacy.load("en_core_web_sm", disable=["ner"])
    # dictionary lemma set
    print("loading ECDICT ...")
    dict_words = set()
    with open(ECDICT, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            w = (row.get("word") or "").strip().lower()
            if w:
                dict_words.add(w)

    papers = []
    for fn in sorted(os.listdir(PAPERS)):
        if not fn.endswith(".json") or fn.startswith("_"):
            continue
        with open(os.path.join(PAPERS, fn), encoding="utf-8") as f:
            papers.append(json.load(f))

    # (year, section, surface_case) -> Counter(lemma)
    by_section = defaultdict(Counter)
    by_year = defaultdict(Counter)
    all_forms = Counter()
    tokens = 0
    contexts = defaultdict(list)
    unknown = Counter()

    for p in papers:
        year = p["year"]
        for sec, text in [("head", HEAD_TEXT)] + list(section_texts(p)):
            if not text.strip():
                continue
            doc = nlp(text)
            for sent in doc.sents:
                sent_txt = " ".join(sent.text.split())
                for tok in sent:
                    if not tok.is_alpha:
                        continue
                    surface = tok.text
                    lemma = tok.lemma_.lower()
                    form = surface.lower()
                    if not form or not any(ch.isalpha() for ch in form):
                        continue
                    tokens += 1
                    all_forms[form] += 1
                    by_section[(year, sec, form)][lemma] += 1
                    by_year[(year, form)][lemma] += 1
                    if len(contexts[(year, form, lemma)]) < 2:
                        contexts[(year, form, lemma)].append(sent_txt)
                    if lemma not in dict_words:
                        unknown[lemma] += 1

    print(f"papers: {len(papers)}  tokens: {tokens}  unique lower forms: {len(all_forms)}")
    multi_year = [(k, v) for k, v in by_year.items() if len(v) > 1]
    multi_sec = [(k, v) for k, v in by_section.items() if len(v) > 1]
    print(f"forms with >1 lemma across the same year: {len(multi_year)}")
    print(f"(year, section, form) with >1 lemma: {len(multi_sec)}")
    print(f"lemmas missing from ECDICT: {len(unknown)} distinct, {sum(unknown.values())} tokens")
    print("\nTop 40 year-level ambiguities:")
    for (year, form), counter in sorted(multi_year, key=lambda kv: -sum(kv[1].values()))[:40]:
        print(f"  {year} {form:18} {dict(counter)}")
    print("\nTop 40 section-level ambiguities:")
    for (year, sec, form), counter in sorted(multi_sec, key=lambda kv: -sum(kv[1].values()))[:40]:
        print(f"  {year} {sec:12} {form:18} {dict(counter)}")
    print("\nUnknown lemmas (top 60):")
    for lemma, n in unknown.most_common(60):
        print(f"  {lemma:24} {n}")


if __name__ == "__main__":
    main()
