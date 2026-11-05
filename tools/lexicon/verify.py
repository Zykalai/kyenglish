# -*- coding: utf-8 -*-
"""End-to-end checks for the dictionary-first reader.

Run after tools/assemble.py + tools/lexicon/build_dict.py:
    python tools/lexicon/verify.py
"""
import io
import os
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
from playwright.sync_api import sync_playwright

BASE = Path(__file__).resolve().parents[2]
URL = (BASE / "index.html").as_uri()
CHANNEL = os.environ.get("PLAYWRIGHT_CHANNEL", "msedge").strip()
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (" | " + str(detail) if detail else ""))


LOCATE_JS = """
([sel, word]) => {
  const root = document.querySelector(sel);
  if (!root) return null;
  const target = word.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while (node = walker.nextNode()) {
    const idx = node.textContent.toLowerCase().indexOf(target);
    if (idx >= 0) {
      (node.parentElement.closest('p') || node.parentElement).scrollIntoView({ block: 'center' });
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
    const idx = node.textContent.toLowerCase().indexOf(target);
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


def bubble_text(page):
    return page.eval_on_selector("#wordBubble", "el => el.innerText")


def wait_bubble(page, wanted):
    for _ in range(60):
        page.wait_for_timeout(100)
        text = bubble_text(page)
        if text and "加载中" not in text and wanted.lower() in text.lower():
            return text
    return bubble_text(page)


def click_word(page, selector, word):
    ok = page.evaluate(LOCATE_JS, [selector, word])
    page.wait_for_timeout(250)
    pos = page.evaluate(COORD_JS, [selector, word]) if ok else None
    if not pos:
        return ""
    page.mouse.click(pos["x"], pos["y"])
    return wait_bubble(page, word)


def close_bubble(page):
    page.evaluate("document.getElementById('wordBubble').style.display='none'; bubbleWord=null;")


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

    # paper: direct dictionary lookup
    page.goto(URL + "#/2025/reading1")
    page.wait_for_timeout(600)
    txt = click_word(page, "#sec-reading1 .passage", "tipped")
    check("卷面点词弹出卡片", "tip" in txt.lower() and "考研" not in txt, txt[:80].replace("\n", " | "))
    close_bubble(page)

    # AI answer: same dictionary path
    page.evaluate("document.getElementById('aiChat').hidden=false; document.getElementById('aiFab').hidden=true; appendMsg('ai','This is a test sentence for clicking.');")
    page.wait_for_timeout(300)
    page.eval_on_selector("#aicMessages .aic-ai", "el => el.scrollIntoView({block:'center'})")
    page.wait_for_timeout(150)
    txt = click_word(page, "#aicMessages .aic-ai", "test")
    check("AI 窗点词弹出卡片", "test" in txt.lower(), txt[:80].replace("\n", " | "))
    close_bubble(page)

    page.evaluate("appendMsg('ai','The spaces are limited.');")
    page.wait_for_timeout(250)
    page.eval_on_selector("#aicMessages .aic-ai:last-child", "el => el.scrollIntoView({block:'center'})")
    page.wait_for_timeout(150)
    txt = click_word(page, "#aicMessages .aic-ai:last-child", "spaces")
    check("释义中的英文词追加卡片", "原形" in txt and "space" in txt and "空间" in txt,
          txt[:120].replace("\n", " | "))
    close_bubble(page)

    # AI input: textarea caret -> dictionary card
    page.evaluate("""() => {
      const el = document.querySelector('#aicInput');
      el.value = 'The left side of the road';
      el.focus();
      el.setSelectionRange(4, 4);
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }""")
    txt = wait_bubble(page, "left")
    check("AI 输入框点词弹出卡片", "left" in txt.lower(), txt[:80].replace("\n", " | "))
    close_bubble(page)

    # favorites: same dictionary path
    page.evaluate("state.favorites=[{type:'sent',text:'This is a favorite sentence.',label:'T',time:'12:00'}]; state.favTab='sent'; renderFavorites(); togglePanel(true);")
    page.wait_for_timeout(300)
    page.eval_on_selector("#wpBody .s-text", "el => el.scrollIntoView({block:'center'})")
    page.wait_for_timeout(150)
    txt = click_word(page, "#wpBody .s-text", "favorite")
    check("收藏句子点词弹出卡片", "favorite" in txt.lower(), txt[:80].replace("\n", " | "))

    # form-note entries insert the base definition as an extra section
    page.goto(URL + "#/2025/reading4")
    page.wait_for_timeout(600)
    txt = click_word(page, "#sec-reading4", "unspoken")
    check("unspoken 显示原形 unspeak",
          "unspoken" in txt.lower() and "unspeak的过去分词" in txt and "原形" in txt and "unspeak" in txt,
          txt[:120].replace("\n", " | "))
    close_bubble(page)
    txt = click_word(page, "#sec-reading4", "trodden")
    check("trodden 显示原形 tread",
          "trodden" in txt.lower() and "tread的过去分词" in txt and "原形" in txt and "tread" in txt,
          txt[:120].replace("\n", " | "))

    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
if failed:
    sys.exit(1)
