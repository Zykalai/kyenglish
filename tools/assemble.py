# -*- coding: utf-8 -*-
"""Assemble single-file HTML: template + papers + JS."""
import json, os, re, glob, sys, io
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

BASE = Path(__file__).resolve().parents[1]
TPL = os.path.join(BASE, "英语二真题划词翻译.template.html")
SRC = os.path.join(BASE, "src")
PAPER_DIR = os.path.join(BASE, "data", "papers")
PAPER_CARDS = os.path.join(BASE, "data", "paper-cards.json")
OUT = os.path.join(BASE, "index.html")

def validate(p):
    y = p["year"]
    problems = []
    if not p.get("cloze"): problems.append("cloze")
    else:
        if len(p["cloze"].get("questions", [])) != 20: problems.append("cloze-qcount")
        if len(re.findall(r"\{\{(\d+)\}\}", p["cloze"].get("passage", ""))) != 20: problems.append("cloze-blanks")
    if not p.get("reading") or len(p["reading"]) != 4: problems.append("reading-count")
    else:
        for i, t in enumerate(p["reading"]):
            if len(t.get("questions", [])) != 5: problems.append(f"reading{i+1}-qcount")
            if not t.get("passage"): problems.append(f"reading{i+1}-nopassage")
    if not p.get("newtype"): problems.append("newtype")
    if not p.get("translation", {}).get("passage"): problems.append("translation")
    if not p.get("writing") or len(p["writing"]) < 2: problems.append("writing")
    return problems

papers = []
report = []
for f in sorted(glob.glob(os.path.join(PAPER_DIR, "*.json"))):
    if os.path.basename(f).startswith("_"): continue
    with open(f, encoding="utf-8") as fh:
        p = json.load(fh)
    probs = validate(p)
    report.append((p["year"], probs, os.path.getsize(f)))
    papers.append(p)

papers.sort(key=lambda x: x["year"])
with open(PAPER_CARDS, encoding="utf-8") as f:
    paper_cards_blob = f.read()
exam_blob = json.dumps({"papers": papers}, ensure_ascii=False, separators=(",", ":"))

with open(TPL, encoding="utf-8") as f:
    html = f.read()

with open(os.path.join(SRC, "app_core.js"), encoding="utf-8") as f:
    core = f.read()
with open(os.path.join(SRC, "app_interact.js"), encoding="utf-8") as f:
    interact = f.read()
with open(os.path.join(SRC, "alarm_bell.js"), encoding="utf-8") as f:
    bell = f.read()

# inject data into core anchor
data_js = ("const PAPER_CARDS_DATA = " + paper_cards_blob + ";\n" +
           "const EXAM_DATA = " + exam_blob + ";\n")
core = core.replace("/* __DATA_ANCHOR__ */", data_js)

script = "<script>\n" + bell + "\n" + core + "\n" + interact + "\n</script>"
html = html.replace("<!-- __SCRIPT__ -->", script)

with open(OUT, "w", encoding="utf-8", newline="") as f:
    f.write(html)

print("papers:", [p["year"] for p in papers])
for y, probs, sz in report:
    print(y, "OK" if not probs else "PROBLEMS: " + ",".join(probs), f"{sz/1024:.0f}KB")
print("output size: %.2f MB" % (os.path.getsize(OUT) / 1048576))
print("OUT:", OUT)
