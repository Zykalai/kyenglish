# -*- coding: utf-8 -*-
"""Step 1: run spaCy over every exam-paper block and emit review material.

Outputs (under data/lexicon/work/):
  blocks.json       paper -> section -> block -> token sequence
  ambig_sections.json  (year, section, surface) with >1 spaCy lemma
  ambig_blocks.json    (year, section, block, surface) with >1 lemma
  unknown.json         lemmas absent from ECDICT
  report.md            human/AI review sheet
"""
import csv
import json
import os
from pathlib import Path
import sys
import io
from collections import Counter, defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import spacy

BASE = Path(__file__).resolve().parents[2]
PAPERS = os.path.join(BASE, "data", "papers")
ECDICT = os.path.join(BASE, "data", "dict", "ecdict.csv")
WORK = os.path.join(BASE, "data", "lexicon", "work")
os.makedirs(WORK, exist_ok=True)


def paras(text):
    return [p.strip() for p in (text or "").split("\n\n") if p.strip()]


def blocks(p):
    """Yield (section, block_id, text) in the same order the page renders it."""
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


def clip(text, n=220):
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1] + "…"


def main():
    print("loading spaCy ...")
    nlp = spacy.load("en_core_web_sm", disable=["ner"])

    print("loading ECDICT ...")
    ecdict = {}
    with open(ECDICT, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            w = (row.get("word") or "").strip().lower()
            if w and w not in ecdict:
                ecdict[w] = row

    papers = []
    for fn in sorted(os.listdir(PAPERS)):
        if fn.endswith(".json") and not fn.startswith("_"):
            with open(os.path.join(PAPERS, fn), encoding="utf-8") as f:
                papers.append(json.load(f))

    blocks_out = {}
    sec_counts = defaultdict(Counter)
    block_counts = defaultdict(Counter)
    contexts = defaultdict(list)  # (year, sec, surface, lemma) -> [sent]
    lemma_pos = defaultdict(Counter)
    all_forms = Counter()
    token_total = 0

    for p in papers:
        year = str(p["year"])
        blocks_out[year] = {}
        for sec, bid, text in blocks(p):
            if not text.strip():
                continue
            doc = nlp(text)
            toks = []
            for sent in doc.sents:
                sent_txt = clip(sent.text)
                for tok in sent:
                    if not tok.is_alpha:
                        continue
                    surface = tok.text
                    lemma = tok.lemma_.lower()
                    if not lemma or not any(ch.isalpha() for ch in lemma):
                        continue
                    rec = {"s": surface, "l": lemma, "p": tok.pos_, "t": tok.tag_}
                    toks.append(rec)
                    token_total += 1
                    all_forms[surface.lower()] += 1
                    sec_counts[(year, sec, surface)][lemma] += 1
                    block_counts[(year, sec, bid, surface)][lemma] += 1
                    lemma_pos[lemma][tok.pos_] += 1
                    key = (year, sec, surface, lemma)
                    if len(contexts[key]) < 2:
                        contexts[key].append(sent_txt)
            if toks:
                blocks_out[year].setdefault(sec, {})[bid] = toks

    ambig_sections = []
    for (year, sec, surface), counter in sorted(sec_counts.items()):
        if len(counter) > 1:
            ambig_sections.append({
                "year": year, "section": sec, "surface": surface,
                "candidates": [
                    {"lemma": lemma, "count": n,
                     "pos": lemma_pos[lemma].most_common(3),
                     "senses": (ecdict.get(lemma, {}).get("translation") or "").split("\\n")[:3],
                     "contexts": contexts[(year, sec, surface, lemma)]}
                    for lemma, n in counter.most_common()
                ],
            })

    ambig_blocks = []
    for (year, sec, bid, surface), counter in sorted(block_counts.items()):
        if len(counter) > 1:
            ambig_blocks.append({
                "year": year, "section": sec, "block": bid, "surface": surface,
                "candidates": [
                    {"lemma": lemma, "count": n,
                     "senses": (ecdict.get(lemma, {}).get("translation") or "").split("\\n")[:2],
                     "contexts": contexts[(year, sec, surface, lemma)]}
                    for lemma, n in counter.most_common()
                ],
            })

    unknown = []
    for (year, sec, surface, lemma), counter in []:
        pass
    unknown_map = defaultdict(lambda: {"count": 0, "examples": [], "pos": Counter()})
    for (year, sec, surface), counter in sec_counts.items():
        for lemma in counter:
            if lemma not in ecdict:
                item = unknown_map[lemma]
                item["count"] += sum(v for k, v in counter.items() if k == lemma)
                item["pos"][lemma_pos[lemma].most_common(1)[0][0]] += 1
                for key, ctxs in contexts.items():
                    if key[0] == year and key[1] == sec and key[2] == surface and key[3] == lemma:
                        for c in ctxs[:1]:
                            if c not in item["examples"] and len(item["examples"]) < 2:
                                item["examples"].append(c)
    for lemma, item in sorted(unknown_map.items()):
        item["pos"] = item["pos"].most_common()
        unknown.append({"lemma": lemma, **item})

    with open(os.path.join(WORK, "blocks.json"), "w", encoding="utf-8") as f:
        json.dump(blocks_out, f, ensure_ascii=False)
    with open(os.path.join(WORK, "ambig_sections.json"), "w", encoding="utf-8") as f:
        json.dump(ambig_sections, f, ensure_ascii=False, indent=1)
    with open(os.path.join(WORK, "ambig_blocks.json"), "w", encoding="utf-8") as f:
        json.dump(ambig_blocks, f, ensure_ascii=False, indent=1)
    with open(os.path.join(WORK, "unknown.json"), "w", encoding="utf-8") as f:
        json.dump(unknown, f, ensure_ascii=False, indent=1)

    # Markdown review sheet
    lines = ["# Lemmatization review sheet", ""]
    lines.append(f"tokens: {token_total}  unique lower forms: {len(all_forms)}  "
                 f"section ambiguities: {len(ambig_sections)}  block ambiguities: {len(ambig_blocks)}  "
                 f"unknown lemmas: {len(unknown)}")
    lines.append("")
    lines.append("## Section-level ambiguities")
    for item in ambig_sections:
        lines.append(f"### {item['year']} · {item['section']} · **{item['surface']}**")
        for c in item["candidates"]:
            senses = " / ".join(x.strip() for x in c["senses"] if x.strip())[:180]
            lines.append(f"- `{c['lemma']}` ×{c['count']} ({', '.join(f'{p}:{n}' for p, n in c['pos'])}) — {senses}")
            for ctx in c["contexts"][:1]:
                lines.append(f"  - “{ctx}”")
        lines.append("")
    lines.append("## Block-level ambiguities")
    for item in ambig_blocks:
        lines.append(f"### {item['year']} · {item['section']} · {item['block']} · **{item['surface']}**")
        for c in item["candidates"]:
            lines.append(f"- `{c['lemma']}` ×{c['count']}")
        lines.append("")
    lines.append("## Unknown lemmas (not in ECDICT)")
    for item in unknown:
        lines.append(f"### {item['lemma']} ({item['pos']}) ×{item['count']}")
        for ctx in item["examples"]:
            lines.append(f"- “{ctx}”")
        lines.append("")

    with open(os.path.join(WORK, "report.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"tokens={token_total} forms={len(all_forms)} section_ambig={len(ambig_sections)} "
          f"block_ambig={len(ambig_blocks)} unknown={len(unknown)}")
    print("wrote", WORK)


if __name__ == "__main__":
    main()
