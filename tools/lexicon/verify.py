# -*- coding: utf-8 -*-
"""End-to-end checks for the rebuilt lexicon.

Run after tools/lexicon/build.py + tools/assemble.py:
    python tools/lexicon/verify.py
"""
import os
from pathlib import Path
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from playwright.sync_api import sync_playwright

BASE = Path(__file__).resolve().parents[2]
URL = (BASE / "index.html").as_uri()
WORD_RE = r"[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-z0-9À-ÖØ-öø-ÿ'’&.\-]*"
CHANNEL = os.environ.get("PLAYWRIGHT_CHANNEL", "msedge").strip()
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (" | " + str(detail) if detail else ""))


COVER_JS = """
() => {
  const out = { total: 0, missing: [] };
  document.querySelectorAll('#paperView [data-blk]').forEach(block => {
    const sec = block.closest('.sec') ? block.closest('.sec').id.replace(/^sec-/, '') : 'head';
    const blk = block.getAttribute('data-blk');
    const text = block.innerText || '';
    const re = /%s/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0].replace(/^[.'’&\\-]+|[.'’&\\-]+$/g, '');
      if (!raw || !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(raw)) continue;
      out.total++;
      const r = lookupWord(raw, sec, blk);
      if (!r || !r.entry) {
        out.missing.push([sec, blk, raw, r && r.lemma]);
      }
    }
  });
  return out;
}
""" % WORD_RE

# find a word inside a block, scroll the containing paragraph into view, return click point
LOCATE_JS = """
([sel, word]) => {
  const root = document.querySelector(sel);
  if (!root) return null;
  const target = word.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while (node = walker.nextNode()) {
    const text = node.textContent;
    const idx = text.toLowerCase().indexOf(target);
    if (idx >= 0) {
      const block = node.parentElement.closest('p') || node.parentElement;
      block.scrollIntoView({ block: 'center' });
      return true;
    }
  }
  return false;
}
"""
COORD_JS = """
([sel, word]) => {
  const root = document.querySelector(sel);
  if (!root) return null;
  const target = word.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while (node = walker.nextNode()) {
    const text = node.textContent;
    const idx = text.toLowerCase().indexOf(target);
    if (idx >= 0) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + word.length);
      const rc = range.getBoundingClientRect();
      return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
    }
  }
  return null;
}
"""

with sync_playwright() as p:
    launch_kwargs = {"headless": True}
    if CHANNEL and CHANNEL.lower() != "chromium":
        launch_kwargs["channel"] = CHANNEL
    browser = p.chromium.launch(**launch_kwargs)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_timeout(800)

    check("首页 17 套真题", page.eval_on_selector_all(".year-card", "els => els.length") == 17)
    check("页面无 JS 异常", not errors, errors[:3])
    check("无考研徽章节点", page.eval_on_selector_all(".wb-ky", "els => els.length") == 0)

    # every rendered paper word resolves to an entry
    grand = {"total": 0, "missing": []}
    for year in range(2010, 2027):
        page.goto(URL + "#/" + str(year))
        page.wait_for_timeout(180)
        r = page.evaluate(COVER_JS)
        grand["total"] += r["total"]
        grand["missing"].extend([[year] + x for x in r["missing"]])
    check("卷面全部单词有词典释义", not grand["missing"],
          f"{grand['total']} tokens, missing {len(grand['missing'])}" + (
              " " + str(grand["missing"][:5]) if grand["missing"] else ""))

    # direct lemma checks
    page.goto(URL + "#/2022")
    page.wait_for_timeout(400)
    checks = [
        (("Brown’s", "reading1", "p0"), "Brown"),
        (("studies", "reading2", None), "study"),
        (("US", "reading1", None), "US"),
        (("us", "reading1", None), "we"),
        (("don't", "reading2", "p0"), "do"),
    ]
    for args, expected in checks:
        r = page.evaluate("([raw,sec,blk]) => { const x = lookupWord(raw,sec,blk); return x && x.lemma; }", list(args))
        check(f"词形 {args[0]} -> {expected}", r == expected, r)

    page.goto(URL + "#/2011")
    page.wait_for_timeout(400)
    for blk, expected in [("p0", "follow"), ("instr", "following")]:
        r = page.evaluate("([blk]) => { const x = lookupWord('following','reading3',blk); return x && x.lemma; }", [blk])
        check(f"2011 following {blk} -> {expected}", r == expected, r)

    page.goto(URL + "#/2026")
    page.wait_for_timeout(400)
    for blk, expected in [("p4", "leave"), ("instr", "left")]:
        r = page.evaluate("([blk]) => { const x = lookupWord('left','newtype',blk); return x && x.lemma; }", [blk])
        check(f"2026 left {blk} -> {expected}", r == expected, r)

    # paper word -> bubble; AI / favorites -> no bubble
    page.goto(URL + "#/2025/reading1")
    page.wait_for_timeout(700)
    ok = page.evaluate(LOCATE_JS, ["#sec-reading1 .passage", "tipped"])
    page.wait_for_timeout(250)
    pos = page.evaluate(COORD_JS, ["#sec-reading1 .passage", "tipped"]) if ok else None
    if pos:
        page.mouse.click(pos["x"], pos["y"])
        page.wait_for_timeout(350)
    txt = page.eval_on_selector("#wordBubble", "el => el.innerText")
    check("卷面点词弹出卡片", "tip" in txt and "考研" not in txt, txt[:80].replace("\n", " | "))

    page.evaluate("document.getElementById('aiChat').hidden=false; document.getElementById('aiFab').hidden=true; appendMsg('ai','This is a test sentence for clicking.');")
    page.wait_for_timeout(300)
    page.eval_on_selector("#aicMessages .aic-ai", "el => el.scrollIntoView({block:'center'})")
    page.wait_for_timeout(200)
    pos = page.evaluate(COORD_JS, ["#aicMessages .aic-ai", "test"])
    if pos:
        page.mouse.click(pos["x"], pos["y"])
        page.wait_for_timeout(300)
    disp = page.eval_on_selector("#wordBubble", "el => el.style.display")
    check("AI 窗点词不弹卡片", disp == "none", disp)

    page.evaluate("state.favorites=[{type:'sent',text:'This is a favorite sentence.',label:'T',time:'12:00'}]; state.favTab='sent'; renderFavorites(); togglePanel(true);")
    page.wait_for_timeout(300)
    page.eval_on_selector("#wpBody .s-text", "el => el.scrollIntoView({block:'center'})")
    page.wait_for_timeout(200)
    pos = page.evaluate(COORD_JS, ["#wpBody .s-text", "favorite"])
    if pos:
        page.mouse.click(pos["x"], pos["y"])
        page.wait_for_timeout(300)
    disp = page.eval_on_selector("#wordBubble", "el => el.style.display")
    check("收藏句子点词不弹卡片", disp == "none", disp)

    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
if failed:
    sys.exit(1)
