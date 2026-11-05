/* ============================================================
 * 交互层：单词气泡、生词/句子收藏、黑夜模式、倒计时、工具条
 * 词典与真题完全离线；AI 问答按需联网
 * ============================================================ */
'use strict';

/* ============================================================
 * 豆包 AI 配置（本地自用版）
 * 安全提醒：填入 Key 后仅限本机打开，切勿上传公开 GitHub 或分享他人，
 *           否则密钥泄露可能产生调用费用。
 * 申请入口：火山引擎方舟控制台 →「API Key 管理」+「在线推理」接入点
 * ============================================================ */
/* API 默认走 Cloudflare Pages 代理（*.pages.dev 在多数国内网络可达），
 * Pages Functions 再转发到 Worker，真实 Key 只存 Worker 服务端，前端零密钥。
 * 如果 Pages 不可用，可把 baseUrl 指回 Worker 或其他代理：
 *   window.DSH_AI_BASE_URL = 'https://kyenglish.a965684016.workers.dev';  // 页面加载前
 *   localStorage.setItem('e2_aiBaseUrl', 'https://kyenglish.a965684016.workers.dev'); // 加载后刷新
 */
function getAiBaseOverride() {
  try {
    const raw = localStorage.getItem('e2_aiBaseUrl');
    if (!raw) return '';
    // 同时接受裸 URL 和 JSON 字符串（lsSet 写法）
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'string' ? parsed : raw;
    } catch (e) {
      return raw;
    }
  } catch (e) {
    return '';
  }
}
const AI_BASE_URL = String(
  (typeof window !== 'undefined' && window.DSH_AI_BASE_URL) ||
  getAiBaseOverride() ||
  'https://kyenglish-ai-proxy.pages.dev'
).trim().replace(/\/+$/, '');
const DOUBAO_CONFIG = {
  endpointId: 'ep-20261104014041-94z74', // 火山方舟接入点（当前实际为豆包 Seed 2.0 Mini）
  baseUrl: AI_BASE_URL
};

/* 调用层人设：只拼进每次 API 请求的 messages，不写入 aiHistory，也不在页面上显示。 */
const AI_SYSTEM_PROMPT = [
  '你是一个考研英语讲解AI。只讲解用户发来的英文，所有内容围绕这段英文，不做无关延伸。',
  '',
  '讲解要准确、到位；在不漏关键信息的前提下尽量简短，不说废话、不重复、不寒暄。注意：简短不等于省略必要内容，废话少也不等于回复内容少——该讲的词义、用法、例句都要讲全，只是不要空话和跑题。',
  '',
  '如果用户发来的是单词：',
  '1. 先给核心含义和高频用法；',
  '2. 每个高频词性都必须单独成点，配一句真题风格的英文例句并附中文翻译，不能只讲其中一个词性；',
  '3. 只讲高频义项和常见搭配，不堆冷僻义；例句标注“例句”，不要冒充某年真题原句。',
  '',
  '如果用户发来的是句子：',
  '1. 必须拆解句子，不能只给整段翻译，也不能只分两三段带过。把句子按原文顺序切成尽量小的片段，一段一段讲；每个片段都要有英文原文、中文意思。',
  '2. 每个片段除了中文意思，还必须用一句大白话说明它和前后怎么连：是在说前面哪个词是什么、是谁、什么范围、什么结果，还是对谁而言；不能只报中文意思。',
  '3. 拆解时用大白话讲清楚句子怎么组合：谁做了什么、什么成了什么、哪部分说的是哪个词、范围到哪里、对谁而言、前面和后面怎么接上。回答中任何位置都不要出现语法术语，包括但不限于“主语、谓语、宾语、定语、状语、从句、主句、前置、后置、非谓语、分词、不定式、介词短语、并列、修饰、成分、结构、时态、现在完成时、一般现在时、过去时、完成时、语态、被动语态、词性”等，也不要使用同类术语；最后的总结同样不能出现。',
  '4. 例如：of the high-speed rail network 是在说明 launch 的是什么；between Rome and Milan 是在说明 network 的范围；the preferred means 是 trains 成了什么；of travel 是在说明 means 是“出行的”方式；for locals and tourists alike 是在说明对谁而言。',
  '5. 一直讲到句子最后一个词，不能跳过任何片段；像 across Italy、for locals and tourists alike 这样的小短语也要单独讲，不能只在整句翻译里带过。',
  '6. 每个片段里如果有影响理解的词或短语，按“X 的意思是……”补一句中文；不要贴“名词/动词/形容词”等标签，也不要展开成单词例句。',
  '7. 全部讲完后给整句通顺翻译，再用一两句话总结整句意思和最值得记住的表达；不要只讲大意。',
  '',
  '如果词义或意思有歧义，说明需要上下文，不要武断编造。'
].join('\n');

/* ---------------- 单词气泡 ---------------- */
const bubble = $('#wordBubble');
let bubbleCtx = null;
let bubbleWord = null; // 当前气泡所属单词（小写原文），用于"再点同一词关闭"
let suppressNextLookup = false; // 首页/导航跳转的那一下点击，抑制穿透查词
let blockLookupUntil = 0; // 移动端软键盘发送后，短窗口屏蔽合成点击穿透到正文查词
let downHit = null;       // mousedown 时先锁定单词，避免移动端点击后页面滚动导致 mouseup 取错词
let downScroll = { x: 0, y: 0 };

/* ---------------- 朗读：浏览器内置 Web Speech，选默认女声 ---------------- */
const SPEAKER_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">' +
  '<path d="M3 10v4h4l5 5V5L7 10H3z"/>' +
  '<path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
  '<path d="M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
let cachedVoices = [];
function loadVoices() {
  if (!('speechSynthesis' in window)) return [];
  cachedVoices = window.speechSynthesis.getVoices() || [];
  return cachedVoices;
}
if ('speechSynthesis' in window) {
  loadVoices();
  window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
}
/* 英文女声优先：明确女声 > 非男声 > 兜底；其余参数全用浏览器默认 */
function pickVoice(voices) {
  const en = voices.filter(v => /^en/i.test(v.lang));
  if (!en.length) return null;
  const us = en.filter(v => /en-us/i.test(v.lang));
  // 明确女声（注意：不能用 natural 当线索，男声在线语音也带 (Natural)）
  const FEMALE = /female|zira|samantha|jenny|aria|susan|linda|victoria|emma|olivia|ava|ana|michelle|sarah|sara|hazel|coral|joanna|karen|nancy|rachel|emily|madison|chloe|grace|natasha|clara|sonia|libby|maisie|molly|rosa|woman|girl/i;
  // 明确男声（\bmale\b 不会误命中 female）
  const MALE = /\bmale\b|david|guy|mark|george|daniel|james|thomas|fred|ryan|brian|alex|richard|robert|william|henry|jack|kevin|steven|paul|john|michael|andrew|christopher|matthew|anthony|donald|eric|roger|steffan|liam|ryan|connor|prabhat|chilemba|abeo|mitchell/i;
  const isFemale = v => FEMALE.test(v.name) && !MALE.test(v.name);
  const isNotMale = v => !MALE.test(v.name);
  return (
    us.find(isFemale) ||   // 1. 美音女声优先
    en.find(isFemale) ||   // 2. 任意英文女声
    us.find(isNotMale) ||  // 3. 美音非男声
    en.find(isNotMale) ||  // 4. 任意非男声
    en[0]                  // 5. 兜底
  );
}
function speakText(text) {
  if (!('speechSynthesis' in window)) { toast('当前浏览器不支持朗读功能'); return; }
  const say = () => {
    window.speechSynthesis.cancel(); // 先停掉上一段
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    const v = pickVoice(loadVoices());
    try { if (v) { u.voice = v; u.lang = v.lang; } }
    catch (e) { /* 语音赋值异常时退回默认嗓音，不影响朗读 */ }
    window.speechSynthesis.speak(u);
  };
  if (!loadVoices().length) {
    let tries = 0;
    const t = setInterval(() => {
      if (loadVoices().length || ++tries > 20) { clearInterval(t); say(); }
    }, 100); // 语音列表未就绪时等待，确保选到女声
  } else say();
}

/* 兼容两种释义格式：考研词典用真实 \n 分行；compact 词典用词性标签空格连接 */
function meaningLines(t) {
  if (!t) return [];
  if (t.includes('\n')) return t.split('\n').map(x => x.trim()).filter(Boolean);
  return splitMeanings(t);
}

function bubbleHtml(lk) {
  const e = lk.entry;
  let lemmaNote = '';
  if (lk.key.toLowerCase() !== lk.lemma.toLowerCase()) {
    const label = lk.kind === 'compound' ? ' 中的核心词'
      : lk.kind === 'possessive' ? ' 的所有格'
      : lk.kind === 'contraction' ? ' 的缩写'
      : ' 的原形';
    lemmaNote = `<span class="lemma">‹ ${esc(lk.key)}${label}</span>`;
  }
  let body = '';
  if (e) {
    const lines = meaningLines(e[0]);
    body = lines.map(ln => {
      const m = ln.match(/^([a-z]+)\.\s*(.*)$/);
      if (m) return `<div class="pos-line"><span class="pos">${m[1]}.</span>${esc(m[2])}</div>`;
      return `<div class="pos-line">${esc(ln)}</div>`;
    }).join('');
  } else {
    body = `<div class="wb-loading">词典未收录该词。</div>`;
  }
  const faved = isWordFav(lk.lemma);
  return `<div class="wb-head">
      <div class="wb-word">${esc(lk.lemma)}${lemmaNote}
        ${e && e[1] ? `<div class="wb-phon">/${esc(e[1])}/</div>` : ''}
      </div>
    </div>
    <div class="wb-body">${body}</div>
    <div class="wb-actions">
      <button id="wbSpeakBtn" class="icon-btn" title="朗读单词">${SPEAKER_ICON}</button>
      <button id="wbFavBtn" class="${faved ? 'faved' : ''}">${faved ? '取消收藏' : '收藏该词'}</button>
      <button id="wbAiBtn">讲解</button>
      <button id="wbAiCustomBtn">追问</button>
    </div>`;
}

function bindFavBtn(lk) {
  const favBtn = $('#wbFavBtn');
  if (!favBtn) return;
  favBtn.onclick = () => {
    const faved = toggleWordFav(lk);
    if (faved) state.favTab = 'word';
    renderFavorites();
    const b = $('#wbFavBtn');
    if (b) {
      b.textContent = faved ? '取消收藏' : '收藏该词';
      b.classList.toggle('faved', faved);
    }
  };
}

function bindSpeakBtn(word) {
  const btn = $('#wbSpeakBtn');
  if (btn) btn.onclick = ev => { ev.stopPropagation(); speakText(word); };
}
function bindAiBtn(word) {
  const btn = $('#wbAiBtn');
  if (btn) btn.onclick = ev => {
    ev.stopPropagation();
    bubble.style.display = 'none'; // 点讲解后关闭单词气泡
    bubbleWord = null;
    askAi('word', word);
  };
  const customBtn = $('#wbAiCustomBtn');
  if (customBtn) customBtn.onclick = ev => {
    ev.stopPropagation();
    bubble.style.display = 'none'; // 点追问后关闭单词气泡，转到输入框自己写
    bubbleWord = null;
    askAiCustom('word', word);
  };
}
function showBubbleAt(lk, rect) {
  bubble.innerHTML = bubbleHtml(lk);
  bubble.style.display = 'block';
  positionPop(bubble, rect);
  bubbleCtx = lk;
  bindFavBtn(lk);
  bindSpeakBtn(lk.lemma);
  bindAiBtn(lk.lemma);
}

/* 点击位置取词：必须真正落在单词文字的实际包围盒内，行内空白/间隙不触发 */
function pointInWordRects(rects, x, y, tx, ty) {
  tx = tx == null ? 2 : tx; ty = ty == null ? 1 : ty;
  for (const rc of rects) {
    if (!rc || (rc.width === 0 && rc.height === 0)) continue;
    if (x >= rc.left - tx && x <= rc.right + tx &&
        y >= rc.top - ty && y <= rc.bottom + ty) return true;
  }
  return false;
}
function wordAtPoint(x, y) {
  let node, offset;
  if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (!r) return null;
    node = r.startContainer; offset = r.startOffset;
  } else if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    if (!p) return null;
    node = p.offsetNode; offset = p.offset;
  } else return null;
  if (node.nodeType !== 3) return null;
  // 只在卷面（.can-lookup）内取词；AI 对话、收藏、目录、首页一律不弹单词卡
  const hostEl = node.parentElement;
  if (!hostEl || !hostEl.closest || !hostEl.closest('.can-lookup')) return null;
  const text = node.textContent;
  const isWord = c => /[A-Za-zÀ-ÖØ-öø-ÿ0-9'’&.\-]/.test(c);
  let s = offset, e = offset;
  while (s > 0 && isWord(text[s - 1])) s--;
  while (e < text.length && isWord(text[e])) e++;
  // 去掉首尾标点，但保留词内连字符、撇号、& 和缩写点（H1N1 / R&D / U.S.）
  const raw = text.slice(s, e).replace(/^[.'’&\-]+|[.'’&\-]+$/g, '');
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(raw)) return null;
  const range = document.createRange();
  range.setStart(node, s);
  range.setEnd(node, e);
  const rects = range.getClientRects();
  const rect = range.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) return null;
  // 精确判定：坐标必须落在文字实际宽度/高度内（caret API 会吸附到邻近字符，
  // 点在词旁空白、行间距一律不触发），兼容跨换行的多矩形单词
  if (!pointInWordRects(rects, x, y)) return null;
  const secEl = hostEl.closest('.sec');
  const sec = secEl ? secEl.id.replace(/^sec-/, '') : 'head';
  const blkEl = hostEl.closest('[data-blk]');
  const blk = blkEl ? blkEl.getAttribute('data-blk') : null;
  return { raw, rect, sec, blk };
}

/* ---------------- 浮层定位 ---------------- */
function positionPop(el, rect) {
  el.style.display = 'block';
  const rw = el.offsetWidth, rh = el.offsetHeight;
  let left = rect.left + window.scrollX + (rect.width / 2) - rw / 2;
  let top = rect.bottom + window.scrollY + 10;
  left = Math.max(10, Math.min(left, window.scrollX + document.documentElement.clientWidth - rw - 10));
  if (top + rh > window.scrollY + document.documentElement.clientHeight - 20) {
    top = rect.top + window.scrollY - rh - 10;
  }
  el.style.left = left + 'px';
  el.style.top = Math.max(60, top) + 'px';
}

/* ---------------- 收藏：生词 + 句子 ---------------- */
function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function saveFavorites() { lsSet('e2_favorites', state.favorites); }
function isWordFav(lemma) {
  return state.favorites.some(f => f.type === 'word' && f.lemma === lemma);
}
function toggleWordFav(lk) {
  const i = state.favorites.findIndex(f => f.type === 'word' && f.lemma === lk.lemma);
  if (i >= 0) {
    state.favorites.splice(i, 1);
    saveFavorites();
    toast('已取消收藏');
    return false;
  }
  const e = lk.entry;
  state.favorites.unshift({
    type: 'word',
    lemma: lk.lemma,
    key: lk.key,
    phonetic: e && e[1] ? e[1] : '',
    meaning: e ? e[0] : '',
    time: nowHHMM()
  });
  saveFavorites();
  toast('已收藏「' + lk.lemma + '」');
  return true;
}
function addSentFav(text, label) {
  const norm = text.replace(/\s+/g, ' ').trim();
  if (state.favorites.some(f => f.type === 'sent' && f.text === norm)) {
    toast('该句子已收藏过');
    return false;
  }
  state.favorites.unshift({ type: 'sent', text: norm, label: label || '', time: nowHHMM() });
  saveFavorites();
  toast('已收藏本句');
  return true;
}

/* 自定义确认弹层（页面内实现，不使用浏览器原生确认框） */
function askConfirm(msg, title) {
  return new Promise(resolve => {
    const m = $('#confirmModal');
    $('#cmTitle').textContent = title || '确认操作';
    $('#cmMsg').textContent = msg;
    const ok = $('#cmOk'), cancel = $('#cmCancel');
    const done = val => {
      m.classList.remove('show');
      ok.onclick = null; cancel.onclick = null; m.onclick = null;
      resolve(val);
    };
    ok.onclick = () => done(true);
    cancel.onclick = () => done(false);
    m.onclick = ev => { if (ev.target === m) done(false); };
    m.classList.add('show');
  });
}

function renderFavorites() {
  const body = $('#wpBody');
  const words = state.favorites.filter(f => f.type === 'word');
  const sents = state.favorites.filter(f => f.type === 'sent');
  $('#wpCount').textContent = state.favorites.length ? `（共 ${state.favorites.length}）` : '';
  $('#ftWn').textContent = words.length;
  $('#ftSn').textContent = sents.length;
  $$('.wp-tab').forEach(t => t.classList.toggle('active', t.getAttribute('data-favtab') === state.favTab));
  $('#wpClear').disabled = state.favorites.length === 0;
  $('#wpClear').style.opacity = state.favorites.length === 0 ? '.5' : '';
  const tab = state.favTab;
  const list = tab === 'word' ? words : sents;
  if (!list.length) {
    const hint = state.favorites.length === 0
      ? '点击单词后在释义气泡里点「收藏」；<br>按住鼠标划选句子或段落，点「收藏本句」。<br>收藏内容保存在本机，离线可用。'
      : (tab === 'word' ? '还没有收藏单词。<br>点击正文中的单词，在释义气泡里点「收藏」即可。'
                        : '还没有收藏句子。<br>按住鼠标划选句子或段落，点「收藏本句」即可。');
    body.innerHTML = `<div class="wp-empty">${hint}</div>`;
    return;
  }
  body.innerHTML = list.map(f => {
    if (f.type === 'word') {
      return `<div class="wp-word" tabindex="0" data-key="${esc(f.lemma)}">
        <div class="w-top">
          <span class="w-lemma">${esc(f.lemma)}</span>
          ${f.phonetic ? `<span class="w-phon">/${esc(f.phonetic)}/</span>` : ''}
          <button class="w-del" data-del="word" data-key="${esc(f.lemma)}">删除</button>
        </div>
        <div class="w-mean">${esc(shortMean(f.meaning || ''))}</div>
      </div>`;
    }
    const key = f.text.replace(/\s+/g, ' ').trim();
    return `<div class="wp-sent">
      <div class="s-text can-select">${esc(f.text)}</div>
      <div class="s-meta">
        <span>句子${f.label ? ' · ' + esc(f.label) : ''}</span>
        <span>${f.time || ''}</span>
        <button class="s-del" data-del="sent" data-key="${esc(key)}">删除</button>
      </div>
    </div>`;
  }).join('');
}

function findFavIndex(type, key) {
  return state.favorites.findIndex(f =>
    type === 'word' ? (f.type === 'word' && f.lemma === key)
                    : (f.type === 'sent' && f.text.replace(/\s+/g, ' ').trim() === key));
}

/* ---------------- 划选收藏条 ---------------- */
const favBar = $('#favBar');
let currentSel = null; // {text, rect, range}

function getEnglishSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const text = sel.toString().replace(/\s+/g, ' ').trim();
  if (!text || !/[A-Za-z]{2,}/.test(text)) return null;
  const range = sel.getRangeAt(0);
  const anchor = range.commonAncestorContainer;
  const host = anchor.nodeType === 1 ? anchor : anchor.parentElement;
  if (!host || !host.closest || !host.closest('.can-lookup, .can-select')) return null;
  const rect = range.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) return null;
  return { text, rect, range };
}

function showFavBar(sel, pt) {
  const norm = sel.text.replace(/\s+/g, ' ').trim();
  const alreadyFav = state.favorites.some(f => f.type === 'sent' && f.text === norm);
  favBar.innerHTML = `
    <button class="icon-btn" id="selSpeakBtn" title="朗读句子">${SPEAKER_ICON}</button>
    <button id="selAiBtn">讲解</button>
    <button id="selAiCustomBtn">追问</button>
    <button id="selFavBtn" class="${alreadyFav ? 'faved' : ''}">${alreadyFav ? '取消收藏' : '收藏本句'}</button>
    <button id="selDismissBtn">取消</button>
    <span class="sel-hint">${sel.text.length} 字符</span>`;
  favBar.style.display = 'block';
  // 定位：以选区包围盒为基准做避让，优先选区正下方（不遮挡划选内容），
  // 下方放不下改正上方，上下都紧张再放右/左，最后视口内兜底。卷面与 AI 窗共用。
  const w = favBar.offsetWidth, h = favBar.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const sx = window.scrollX, sy = window.scrollY;
  const gap = 8, M = 10;
  const clamp = (v, min, max) => Math.max(min, Math.min(v, max));
  const rc = sel.rect; // 选区视口包围盒
  let lv, tv;
  const hx = clamp(rc.left, M, vw - w - M); // 水平优先对齐选区左缘
  if (rc.bottom + gap + h <= vh - M) {
    // 1) 选区正下方
    tv = rc.bottom + gap; lv = hx;
  } else if (rc.top - gap - h >= M) {
    // 2) 下方放不下：选区正上方
    tv = rc.top - gap - h; lv = hx;
  } else if (rc.right + gap + w <= vw - M) {
    // 3) 上下都紧张：选区右侧
    lv = rc.right + gap; tv = clamp(rc.top, M, vh - h - M);
  } else if (rc.left - gap - w >= M) {
    // 4) 选区左侧
    lv = rc.left - gap - w; tv = clamp(rc.top, M, vh - h - M);
  } else {
    // 5) 极端兜底：视口顶部
    tv = M; lv = hx;
  }
  favBar.style.left = (lv + sx) + 'px';
  favBar.style.top = (tv + sy) + 'px';
  $('#selFavBtn').onclick = ev => {
    ev.preventDefault(); ev.stopPropagation();
    if (!currentSel) return;
    const btn = $('#selFavBtn');
    const nText = currentSel.text.replace(/\s+/g, ' ').trim();
    const idx = findFavIndex('sent', nText);
    if (idx >= 0) {
      // 已收藏 → 取消收藏，工具条保留
      state.favorites.splice(idx, 1);
      saveFavorites();
      toast('已取消收藏');
      btn.classList.remove('faved');
      btn.textContent = '收藏本句';
    } else {
      // 未收藏 → 加入收藏，按钮转为“取消收藏”，工具条保留
      state.favorites.unshift({
        type: 'sent', text: nText,
        label: currentSecLabel(currentSel.range) || '',
        time: nowHHMM()
      });
      saveFavorites();
      toast('已收藏本句');
      btn.classList.add('faved');
      btn.textContent = '取消收藏';
    }
    state.favTab = 'sent';
    renderFavorites();
  };
  $('#selDismissBtn').onclick = ev => {
    ev.preventDefault();
    // 取消：隐藏工具条的同时清除文本选中高亮
    window.getSelection().removeAllRanges();
    currentSel = null;
    hideFavBar();
  };
  $('#selSpeakBtn').onclick = ev => {
    ev.preventDefault();
    ev.stopPropagation();
    speakText(sel.text); // 朗读选中的整句/整段
  };
  $('#selAiBtn').onclick = ev => {
    ev.preventDefault();
    ev.stopPropagation();
    if (currentSel) {
      const text = currentSel.text;
      window.getSelection().removeAllRanges();
      currentSel = null;
      hideFavBar(); // 点讲解后关闭划句工具条
      askAi('sentence', text);
    }
  };
  $('#selAiCustomBtn').onclick = ev => {
    ev.preventDefault();
    ev.stopPropagation();
    if (currentSel) {
      const text = currentSel.text;
      window.getSelection().removeAllRanges();
      currentSel = null;
      hideFavBar(); // 点追问后关闭工具条，转到输入框自己写
      askAiCustom('sentence', text);
    }
  };
}
function hideFavBar() { favBar.style.display = 'none'; }


/* ============================================================
 * 豆包 AI 迷你聊天：流式调用火山方舟，多轮上下文，安全渲染
 * ============================================================ */
const aiChat = $('#aiChat');
const aiFab = $('#aiFab');
const aiMessages = $('#aicMessages');
const aiInput = $('#aicInput');
const aiSendBtn = $('#aicSend');
const aiStopBtn = $('#aicStop');
let aiHistory = [];     // OpenAI 格式的多轮历史
let aiStreaming = false; // 是否正在流式输出
let aiAbort = null;
let stickBottom = true;  // 是否贴底跟随：用户手动上滑后置 false，滑回最底恢复 true
let streamingEndedResolve = null; // 供“发新问题等旧流结束”挂接的回调
/* 等待当前流真正结束（finally 已复位），避免新旧流程并发 */
function waitStreamingEnd() {
  if (!aiStreaming) return Promise.resolve();
  return new Promise(r => { streamingEndedResolve = r; });
}
/* 主动打断当前流：abort 会让 streamChat 抛 AbortError */
function stopStreaming() { if (aiAbort) aiAbort.abort(); }

/* 仅在贴底状态下自动滚动到最新；用户上滑查看历史时不打断 */
function followBottom() {
  if (stickBottom) aiMessages.scrollTop = aiMessages.scrollHeight;
}
/* 滚轮/触摸拖动都会触发 scroll：据此判断用户是否在最底部 */
aiMessages.addEventListener('scroll', () => {
  const atBottom = aiMessages.scrollHeight - aiMessages.scrollTop - aiMessages.clientHeight < 24;
  stickBottom = atBottom;
}, { passive: true });

/* 行内 Markdown：行内代码 → 加粗 → 斜体（顺序避免 ** 被当成两个 *） */
function inlineMd(t) {
  return t
    .replace(/`([^`]+)`/g, (m, c) => '<code>' + c + '</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/(^|[^A-Za-z0-9_])_([^_]+)_(?![A-Za-z0-9_])/g, '$1<em>$2</em>');
}

/* 表格行：去掉首尾管道后按 | 拆成单元格 */
function splitTableRow(row) {
  let s = row.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}
/* 表格分隔行：仅由 | - : 空格组成且含 -（如 |---|:---:|） */
function isTableSep(s) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(s) && /-/.test(s) && /\|/.test(s);
}

/* 受控 Markdown 渲染：先转义杜绝 XSS，再按行处理块级（表格/标题/引用/分隔线/列表/段落），
   块内文本走 inlineMd，覆盖标题、斜体、加粗等常见语法 */
function renderMarkdown(src) {
  const lines = esc(src).split(/\r?\n/);
  let html = '', inUl = false, inOl = false, inQuote = false;
  const closeAll = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
    if (inQuote) { html += '</blockquote>'; inQuote = false; }
  };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    // 围栏代码块（``` 或 ~~~）：原样保留空白与换行，不解析内部 markdown；
    // 未闭合（流式输出中）也能正常显示已生成部分
    const fenceM = t.match(/^(`{3,}|~{3,})(.*)$/);
    if (fenceM) {
      closeAll();
      const mark = fenceM[1][0];
      const lang = (fenceM[2].match(/[A-Za-z0-9_+-]+/) || [''])[0];
      const buf = [];
      i++;
      while (i < lines.length) {
        const cm = lines[i].trim().match(/^(`{3,}|~{3,})\s*$/);
        if (cm && cm[1][0] === mark) break;
        buf.push(lines[i]); i++;
      }
      const langAttr = lang ? ' data-lang="' + lang + '"' : '';
      html += '<pre class="aic-pre"' + langAttr + '><code>' + buf.join('\n') + '</code></pre>';
      continue;
    }
    // 表格：当前行含管道，且下一行为分隔行；连续收集后续数据行
    if (t.indexOf('|') >= 0 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      closeAll();
      const header = splitTableRow(t);
      i += 2; // 跳过表头与分隔行
      const bodyRows = [];
      while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim() !== '') {
        bodyRows.push(splitTableRow(lines[i]));
        i++;
      }
      i--; // 抵消外层 for 的自增
      let tbl = '<table><thead><tr>';
      header.forEach(h => { tbl += '<th>' + inlineMd(h) + '</th>'; });
      tbl += '</tr></thead><tbody>';
      bodyRows.forEach(r => {
        tbl += '<tr>';
        r.forEach(c => { tbl += '<td>' + inlineMd(c) + '</td>'; });
        tbl += '</tr>';
      });
      tbl += '</tbody></table>';
      html += tbl;
      continue;
    }
    const hm = t.match(/^(#{1,6})\s+(.*)$/);
    const ulm = t.match(/^[-*]\s+(.*)$/);
    const olm = t.match(/^\d+[.、]\s+(.*)$/);
    const qm = t.match(/^(?:>|&gt;)\s?(.*)$/); // esc 后 > 变成 &gt;，两种都要匹配
    if (hm) {
      closeAll();
      const lv = hm[1].length;
      html += '<h' + lv + '>' + inlineMd(hm[2]) + '</h' + lv + '>';
    } else if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(t)) {
      closeAll();
      html += '<hr>';
    } else if (qm) {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inQuote) { html += '<blockquote>'; inQuote = true; }
      html += inlineMd(qm[1]);
    } else if (ulm) {
      if (inQuote) { html += '</blockquote>'; inQuote = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inUl) { html += '<ul>'; inUl = true; }
      html += '<li>' + inlineMd(ulm[1]) + '</li>';
    } else if (olm) {
      if (inQuote) { html += '</blockquote>'; inQuote = false; }
      if (inUl) { html += '</ul>'; inUl = false; }
      if (!inOl) { html += '<ol>'; inOl = true; }
      html += '<li>' + inlineMd(olm[1]) + '</li>';
    } else if (t === '') {
      closeAll();
    } else {
      closeAll();
      html += '<p>' + inlineMd(t) + '</p>';
    }
  }
  closeAll();
  return html;
}

function aiErrorText(e) {
  if (/未配置/.test(e.message)) return e.message;
  if (e.name === 'TypeError' || /Failed to fetch|NetworkError|Load failed/i.test(e.message)) {
    return 'AI 服务连接不通：当前网络可能访问不了默认的 pages.dev 代理。可设置 e2_aiBaseUrl 指向其他代理后重试。';
  }
  return '调用失败，请检查网络或配置后重试（' + e.message + '）';
}

/* 流式调用：POST Worker 代理 /chat/completions，逐行解析 SSE，onDelta 回传累计文本 */
function streamChat(messages, onDelta) {
  if (!DOUBAO_CONFIG.endpointId) {
    return Promise.reject(new Error('未配置接入点 ID，请在文件顶部 DOUBAO_CONFIG 填写'));
  }
  aiAbort = new AbortController();
  // 人设只在调用层注入：system 消息不进入 aiHistory，清空记忆/切换模型都不影响
  const payloadMessages = [{ role: 'system', content: AI_SYSTEM_PROMPT }, ...messages];
  return fetch(DOUBAO_CONFIG.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: DOUBAO_CONFIG.endpointId,
      messages: payloadMessages,
      stream: true,
      thinking: { type: 'disabled' } // 关闭深度思考：讲解类任务直接作答，大幅降低首字等待（非人设/格式约束）
    }),
    signal: aiAbort.signal
  }).then(async resp => {
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error('HTTP ' + resp.status + ' ' + t.slice(0, 120));
    }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buffer = '', full = '';
    try {
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        buffer += dec.decode(r.value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices && json.choices[0] && json.choices[0].delta;
            const piece = delta && delta.content;
            if (piece) { full += piece; onDelta(full); }
          } catch (e) { /* 分片偶发解析异常忽略，不影响后续 */ }
        }
      }
      return full;
    } finally {
      // 正常结束或 abort/异常都释放底层连接，避免流挂起
      reader.cancel().catch(() => {});
    }
  });
}

function appendMsg(role, text) {
  const div = document.createElement('div');
  // 用户消息支持划句，但不参与卷面点词（单词卡只在 .can-lookup 内出现）
  div.className = 'aic-msg aic-' + role + (role === 'user' ? ' can-select' : '');
  if (role === 'ai') div.innerHTML = renderMarkdown(text);
  else div.textContent = text;
  aiMessages.appendChild(div);
  followBottom();
  return div;
}

/* 输出中：输入框与发送按钮始终可用（可打字、可发新问题）；仅切换打断按钮显隐 */
function setStreamingUI(on) {
  aiStopBtn.classList.toggle('visible', on);
}

/* 发送一条用户消息并驱动 AI 流式回复；isPreset 为入口自动提问 */
async function sendUserMessage(text, isPreset) {
  // 正在输出：先打断旧流并等其复位，再发新问题（不并发）
  if (aiStreaming) { stopStreaming(); await waitStreamingEnd(); }
  const content = isPreset ? text : text.trim();
  if (!content) return;
  stickBottom = true; // 用户主动发起，强制贴底跟随本次回复
  appendMsg('user', content);
  aiHistory.push({ role: 'user', content: content });
  const aiDiv = document.createElement('div');
  aiDiv.className = 'aic-msg aic-ai can-select streaming'; // 生成内容支持划句，不参与卷面点词
  aiMessages.appendChild(aiDiv);
  followBottom();
  aiStreaming = true;
  setStreamingUI(true);
  let lastPartial = '';
  try {
    const reqMessages = aiHistory.slice(); // 不注入任何系统提示，体验原生 DeepSeek
    const full = await streamChat(reqMessages, partial => {
      lastPartial = partial;
      aiDiv.innerHTML = renderMarkdown(partial);
      followBottom(); // 流式逐字：仅在贴底时跟随，用户上滑不打断
    });
    aiDiv.classList.remove('streaming');
    aiDiv.innerHTML = renderMarkdown(full);
    aiHistory.push({ role: 'assistant', content: full });
  } catch (e) {
    if (e.name === 'AbortError') {
      // 用户主动打断：保留已生成内容（若有），历史对齐，不弹错误
      aiDiv.classList.remove('streaming');
      if (lastPartial && lastPartial.trim()) {
        aiDiv.innerHTML = renderMarkdown(lastPartial);
        const tag = document.createElement('div');
        tag.className = 'aic-stop-tag';
        tag.textContent = '已打断';
        aiDiv.appendChild(tag);
        aiHistory.push({ role: 'assistant', content: lastPartial });
      } else {
        aiDiv.remove();
        aiHistory.pop(); // 还没输出就打断：回滚用户消息
      }
    } else {
      aiDiv.remove();
      aiHistory.pop(); // 回滚失败的用户消息，保持历史对齐
      const errDiv = document.createElement('div');
      errDiv.className = 'aic-msg aic-error';
      errDiv.textContent = aiErrorText(e);
      aiMessages.appendChild(errDiv);
    }
  } finally {
    aiStreaming = false;
    setStreamingUI(false);
    followBottom();
    if (streamingEndedResolve) {
      const r = streamingEndedResolve; streamingEndedResolve = null; r();
    }
  }
}

/* ===== AI 聊天窗：头部拖动移动 + 四条边调整大小 + 记忆形态（localStorage） ===== */
const AI_RECT_KEY = 'aiWindowRectV1';
const AI_MIN_W = 300, AI_MIN_H = 320;

function defaultAiRect() {
  const w = 384;
  const h = Math.min(580, window.innerHeight - 48);
  return { width: w, height: h, left: window.innerWidth - w - 24, top: window.innerHeight - h - 24 };
}
function clampAiRect(r) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const minW = Math.min(AI_MIN_W, vw), minH = Math.min(AI_MIN_H, vh);
  const width = Math.max(minW, Math.min(r.width, vw));
  const height = Math.max(minH, Math.min(r.height, vh));
  const left = Math.min(Math.max(r.left, 0), vw - width);
  const top = Math.min(Math.max(r.top, 0), vh - height);
  return { left, top, width, height };
}
function loadAiRect() {
  try {
    const raw = localStorage.getItem(AI_RECT_KEY);
    if (raw) {
      const r = JSON.parse(raw);
      if (r && [r.left, r.top, r.width, r.height].every(n => typeof n === 'number' && !isNaN(n)))
        return clampAiRect(r);
    }
  } catch (e) { /* 数据损坏则回退默认 */ }
  return defaultAiRect();
}
let aiRect = loadAiRect();
function saveAiRect() {
  try { localStorage.setItem(AI_RECT_KEY, JSON.stringify(aiRect)); } catch (e) {}
}
function smallScreen() { return window.matchMedia('(max-width:560px)').matches; }
function applyAiRect() {
  if (smallScreen()) {
    // 小屏交给 CSS 全屏样式，移除 inline 几何
    aiChat.style.left = aiChat.style.top = '';
    aiChat.style.width = aiChat.style.height = '';
    aiChat.style.right = aiChat.style.bottom = '';
    return;
  }
  aiRect = clampAiRect(aiRect);
  const s = aiChat.style;
  s.left = aiRect.left + 'px';
  s.top = aiRect.top + 'px';
  s.width = aiRect.width + 'px';
  s.height = aiRect.height + 'px';
  s.right = 'auto';
  s.bottom = 'auto';
}
function beginAiDrag(kind, e) {
  e.preventDefault();
  e.stopPropagation();
  const sx = e.clientX, sy = e.clientY;
  const start = clampAiRect(aiRect);
  const bodyClass = kind === 'move' ? 'aic-dragging-move' : 'aic-dragging-rz-' + kind;
  document.body.classList.add('aic-dragging', bodyClass);
  function onMove(ev) {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    let { left, top, width, height } = start;
    if (kind === 'move') { left = start.left + dx; top = start.top + dy; }
    else if (kind === 'r') { width = start.width + dx; }
    else if (kind === 'l') { left = start.left + dx; width = start.width - dx; }
    else if (kind === 'b') { height = start.height + dy; }
    else if (kind === 't') { top = start.top + dy; height = start.height - dy; }
    // 四个角：同时改变宽高
    else if (kind === 'br') { width = start.width + dx; height = start.height + dy; }
    else if (kind === 'tl') {
      left = start.left + dx; width = start.width - dx;
      top = start.top + dy; height = start.height - dy;
    }
    else if (kind === 'tr') {
      top = start.top + dy; height = start.height - dy; width = start.width + dx;
    }
    else if (kind === 'bl') {
      left = start.left + dx; width = start.width - dx; height = start.height + dy;
    }
    aiRect = clampAiRect({ left, top, width, height });
    applyAiRect();
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.body.classList.remove('aic-dragging', bodyClass);
    saveAiRect();
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}
// 头部拖动移动（点按钮不触发）
aiChat.querySelector('.aic-head').addEventListener('pointerdown', e => {
  if (smallScreen() || e.target.closest('button')) return;
  beginAiDrag('move', e);
});
// 四条边手柄调整大小
aiChat.querySelectorAll('.aic-rz').forEach(h => {
  h.addEventListener('pointerdown', e => {
    if (smallScreen()) return;
    beginAiDrag(h.dataset.rz, e);
  });
});
// 浏览器窗口变化时，把聊天窗重新约束在视口内
window.addEventListener('resize', () => { if (!aiChat.hidden) applyAiRect(); });

/* 唤出聊天窗、隐藏悬浮球；召回则相反（AI 平时以悬浮球住在右下角） */
function openAiPanel() {
  aiChat.hidden = false;
  aiFab.hidden = true;
  applyAiRect(); // 每次唤出恢复记忆的位置与尺寸
}
function dismissAiPanel() {
  aiChat.hidden = true;
  aiFab.hidden = false;
}

/* AI 窗内独立字号（与卷面 --body-size 互不影响），范围 12-22，记忆到本地 */
const AI_FONT_KEY = 'e2_aiFontSize';
let aiFontSize = (function () {
  const v = parseInt(lsGet(AI_FONT_KEY, 14), 10);
  return (!isNaN(v) && v >= 12 && v <= 22) ? v : 14;
})();
function setAiFontSize(v) {
  aiFontSize = Math.max(12, Math.min(22, v));
  aiChat.style.setProperty('--aic-size', aiFontSize + 'px');
  lsSet(AI_FONT_KEY, aiFontSize);
}
setAiFontSize(aiFontSize);
$('#aicFontDec').onclick = () => setAiFontSize(aiFontSize - 1);
$('#aicFontInc').onclick = () => setAiFontSize(aiFontSize + 1);

/* 三个入口统一调用：单词/句子统一开场请求，不再区分类型。
   开场只发一句简短请求，后续由用户自己追问。 */
function askAi(kind, content) {
  openAiPanel();
  // 只发简短请求，不附原文；上下文由用户自己追问
  const prompt = '请为我讲解“' + content + '”';
  // 讲解为预设自动发送，与输入框无关：无条件清空，避免残留追问/未发送的草稿
  aiInput.value = '';
  aiInput.style.height = 'auto';
  sendUserMessage(prompt, true);
}

/* 「追问」：打开 AI 窗，只在输入框预填引用前缀，不自动发送，
   光标定位到末尾，用户自己补充想问的内容后手动发送 */
function askAiCustom(kind, content) {
  openAiPanel();
  // 不区分单词/句子，统一"关于…"；引号仅界定引用内容
  const ref = '关于“' + content + '”，';
  aiInput.value = ref;
  autoGrowInput();
  aiInput.focus();
  const len = aiInput.value.length;
  if (aiInput.setSelectionRange) aiInput.setSelectionRange(len, len);
  else aiInput.selectionStart = aiInput.selectionEnd = len;
}

/* 防穿透：头部/输入区/悬浮球的交互不冒泡到正文；消息区(.can-select)只放行划句，
   点词仍由卷面 .can-lookup 门控（内部按钮直接绑定，不依赖冒泡） */
const aicHeadEl = aiChat.querySelector('.aic-head');
const aicInputEl = aiChat.querySelector('.aic-input-row');
['mousedown', 'mouseup', 'click'].forEach(type => {
  aicHeadEl.addEventListener(type, ev => ev.stopPropagation());
  aicInputEl.addEventListener(type, ev => ev.stopPropagation());
  aiFab.addEventListener(type, ev => ev.stopPropagation());
});

/* 悬浮球点击唤出；减号召回右下角；清空记忆则清空上下文与界面 */
aiFab.onclick = () => { clearTransient(); openAiPanel(); };
$('#aicMin').onclick = dismissAiPanel;
$('#aicClear').onclick = () => {
  if (aiStreaming) { toast('请等当前回复结束'); return; }
  aiHistory = [];
  aiMessages.innerHTML = '';
  toast('已清空记忆，接下来不再参考之前的对话');
};
/* 发送：按钮 + Enter（Shift+Enter 换行）；textarea 自适应高度 */
/* AI 窗内按钮统一按下触发：软键盘聚焦时，鼠标/触摸的首按常被浏览器先用于收起输入法、
   随后布局重排取消 click，导致要按两次。pointerdown 在按下瞬间抢先处理，去重拦截合成 click。
   仅作用于传入的按钮，正文的触摸/鼠标区分（手指划句、蓝牙鼠标划句）保持不变。 */
function bindAiPress(el, handler) {
  let lastFireAt = 0;
  const fire = e => {
    const now = Date.now();
    if (now - lastFireAt < 400) return; // pointerdown 后还会合成 click，去重避免一次操作触发两遍
    lastFireAt = now;
    handler(e);
  };
  el.addEventListener('pointerdown', fire);
  el.addEventListener('click', fire);
}
bindAiPress(aiStopBtn, e => {
  e.stopPropagation();
  stopStreaming(); // 只打断当前回答，不发新问题
});
bindAiPress(aiSendBtn, () => {
  const v = aiInput.value;
  aiInput.value = '';
  aiInput.style.height = 'auto';
  // 移动端软键盘发送后键盘收起，会有合成点击落到新露出的正文，短窗口屏蔽避免穿透查词
  if (smallScreen()) blockLookupUntil = Date.now() + 600;
  sendUserMessage(v, false);
});
aiInput.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    aiSendBtn.click();
  }
});
aiInput.addEventListener('input', () => {
  aiInput.style.height = 'auto';
  aiInput.style.height = Math.min(aiInput.scrollHeight, 120) + 'px';
});
function autoGrowInput() {
  aiInput.style.height = 'auto';
  aiInput.style.height = Math.min(aiInput.scrollHeight, 120) + 'px';
}

function currentSecLabel(range) {
  if (!range) return state.year ? state.year + ' ' : '';
  const anchor = range.commonAncestorContainer;
  if (!anchor) return state.year ? state.year + ' ' : '';
  const host = anchor.nodeType === 1 ? anchor : anchor.parentElement;
  let secName = '';
  const sec = host && host.closest ? host.closest('.sec') : null;
  if (sec) {
    const t = sec.querySelector('.sec-title');
    if (t) {
      const zh = t.querySelector('.zh');
      secName = zh ? zh.textContent.trim() : t.textContent.replace(/\s+/g, ' ').trim();
    }
  }
  return (state.year ? state.year + ' ' : '') + secName;
}

/* ---------------- 鼠标交互绑定 ---------------- */
/* 单词卡只属于卷面（.can-lookup）；.can-select 只放行划句，不触发点词 */
const LOOKUP_ZONE = '.can-lookup';
function isInside(el, target) {
  return el && el.contains(target);
}

document.addEventListener('mouseup', ev => {
  // 收藏面板内：句子正文允许划句；单词卡不再参与卷面点词
  if (isInside($('#wordPanel'), ev.target) && !ev.target.closest('.s-text')) return;
  // 点击/划选发生在气泡、收藏条、弹层、工具条、侧栏内则不响应
  if (isInside(bubble, ev.target) || isInside(favBar, ev.target) ||
      isInside(aiFab, ev.target) ||
      // AI 窗内仅头部/输入区拦截；消息区放行划句（点词由 .can-lookup 门控）
      (isInside(aiChat, ev.target) &&
        (ev.target.closest('.aic-head') || ev.target.closest('.aic-input-row'))) ||
      isInside($('#timerPanel'), ev.target) ||
      isInside($('#timerModal'), ev.target) || isInside($('#confirmModal'), ev.target) ||
      isInside($('#topbar'), ev.target) ||
      isInside($('#sidebar'), ev.target)) return;
  setTimeout(() => {
    // 导航跳转导致的点击穿透：跳过本次查词
    if (suppressNextLookup) { suppressNextLookup = false; hideFavBar(); return; }
    // 软键盘发送后的合成点击穿透：屏蔽窗口内不查词、不弹收藏条
    if (Date.now() < blockLookupUntil) { hideFavBar(); return; }
    const sel = getEnglishSelection();
    if (sel) {
      // 拖拽划选：弹收藏条（不做单词查词），并收起旧气泡
      downHit = null;
      currentSel = sel;
      bubbleWord = null;
      bubble.style.display = 'none';
      showFavBar(sel, { x: ev.clientX, y: ev.clientY });
      return;
    }
    hideFavBar();
    // 无选区 → 点击查词；优先用 mousedown 锁定的词（移动端点击后可能滚动）
    const hit = (ev.target.closest('.can-lookup') ? downHit : null) || wordAtPoint(ev.clientX, ev.clientY);
    if (hit && hit === downHit) {
      const dx = window.scrollX - downScroll.x;
      const dy = window.scrollY - downScroll.y;
      if (dx || dy) {
        const r = hit.rect;
        hit.rect = { left: r.left - dx, right: r.right - dx, top: r.top - dy,
          bottom: r.bottom - dy, width: r.width, height: r.height };
      }
    }
    downHit = null;
    if (hit) {
      const key = hit.raw.toLowerCase();
      // 再点同一个单词：关闭气泡（mousedown 已先把它隐藏）
      if (bubbleWord === key) {
        bubbleWord = null;
        bubble.style.display = 'none';
        return;
      }
      const lk = lookupWord(hit.raw, hit.sec, hit.blk);
      if (!lk) { bubbleWord = null; return; }
      bubbleWord = key;
      showBubbleAt(lk, hit.rect);
    } else {
      // 点在空白处：关闭气泡
      bubbleWord = null;
      bubble.style.display = 'none';
    }
  }, 10);
});

document.addEventListener('mousedown', ev => {
  // 首页年份卡片 / 试卷板块标签：这次点击会触发视图跳转，置位抑制，防止穿透到新视图单词
  if (ev.target.closest('.year-card,.sec-tabs a')) suppressNextLookup = true;
  // 快速双击(detail=2)/三击(detail=3)会触发浏览器原生"选中单词/选中整句"，
  // 直接拦截默认行为，避免快速点词时选中文字
  if (ev.target.closest(LOOKUP_ZONE) && ev.detail > 1) ev.preventDefault();
  if (isInside(bubble, ev.target) || isInside(favBar, ev.target) ||
      isInside(aiFab, ev.target) ||
      (isInside(aiChat, ev.target) &&
        (ev.target.closest('.aic-head') || ev.target.closest('.aic-input-row')))) return;
  // 正文类可查词区域：按下先锁定单词并收起旧浮层（mouseup 再决定同词关闭/异词切换）
  if (ev.target.closest('.can-lookup')) {
    downHit = wordAtPoint(ev.clientX, ev.clientY);
    downScroll = { x: window.scrollX, y: window.scrollY };
    bubble.style.display = 'none';
    hideFavBar();
    return;
  }
});
/* 全站禁止快速双击/多击选中文字：双击选词、三击选段落都在非编辑区域拦截。
   mousedown(detail>1) 从源头阻止多击选词（覆盖三击），dblclick 再做双保险。
   输入框/文本域/可编辑区放行以保留编辑选词；首次点击(detail=1)与拖拽划句不受影响。 */
const EDIT_ZONE = 'input, textarea, [contenteditable], [contenteditable="true"]';
document.addEventListener('mousedown', ev => {
  if (ev.detail > 1 && !ev.target.closest(EDIT_ZONE)) ev.preventDefault();
});
document.addEventListener('dblclick', ev => {
  if (!ev.target.closest(EDIT_ZONE)) ev.preventDefault();
});

/* ---------------- 黑夜模式 ---------------- */
function setDark(v) {
  state.darkMode = v;
  document.body.classList.toggle('dark', v);
  const btn = $('#darkToggle');
  const l = btn.querySelector('.lbl-l'), s = btn.querySelector('.lbl-s');
  if (l) l.textContent = v ? '白天模式' : '黑夜模式';
  if (s) s.textContent = v ? '浅色' : '深色';
  btn.classList.toggle('active', v);
  lsSet('e2_dark', v);
}

/* ---------------- 倒计时 ---------------- */
const Timer = {
  endAt: 0, remain: 0, intervalId: null, running: false,
  overMode: false,  // 倒计时归零后进入"超时正计时"（只能由归零自动触发）
  overAt: 0,
  paused: false,    // 暂停态（倒计时/超时正计时通用）
  overElapsed: 0    // 超时正计时暂停时冻结的累计秒数
};
const tH = $('#tH'), tM = $('#tM'), tS = $('#tS'), tTime = $('#timerTime'), tTag = $('#timerTag');

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function clampNum(v, min, max) {
  v = Math.floor(Number(v) || 0);
  if (isNaN(v)) v = 0;
  return Math.max(min, Math.min(max, v));
}
function readInputs() {
  const h = clampNum(tH.value, 0, 99);
  const m = clampNum(tM.value, 0, 59);
  const s = clampNum(tS.value, 0, 59);
  tH.value = h; tM.value = m; tS.value = s;
  return h * 3600 + m * 60 + s;
}
function renderTimerTime() {
  const box = tTime.parentElement;
  if (Timer.overMode) {
    const over = Timer.paused
      ? Timer.overElapsed
      : Math.floor((Date.now() - Timer.overAt) / 1000);
    tTime.textContent = '+' + fmtTime(over);
    tTag.style.display = 'inline-block';
    box.classList.add('over');
  } else {
    tTime.textContent = fmtTime(Timer.remain);
    tTag.style.display = 'none';
    box.classList.remove('over');
  }
}
/* 小面板视图：未开始显示"时/分/秒 + 开始"；进行中/超时显示"大号时间 + 重置" */
function applyTimerView() {
  const active = Timer.running || Timer.overMode || Timer.paused;
  // 暂停态不绿，运行/超时走时才绿
  $('#timerBtn').classList.toggle('running', (Timer.running || Timer.overMode) && !Timer.paused);
  $('#tpInputs').hidden = active;
  $('#tpTime').style.display = active ? 'flex' : 'none';
  $('#tStart').hidden = active;
  $('#tPause').hidden = !active;
  $('#tPause').textContent = Timer.paused ? '继续' : '暂停';
  $('#tReset').hidden = !active;
}
function positionTimerPanel() {
  const panel = $('#timerPanel');
  const b = $('#timerBtn').getBoundingClientRect();
  const pw = panel.offsetWidth, ph = panel.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const m = 8;
  // 默认右对齐按钮右缘，靠近视口边缘时向内收
  let left = Math.max(m, Math.min(b.right - pw, vw - pw - m));
  let top = b.bottom + 8;
  let flipped = false;
  if (top + ph > vh - m) { top = b.top - ph - 8; flipped = true; }
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
  const caret = $('#tpCaret');
  if (caret) {
    const cx = b.left + b.width / 2 - left;
    caret.style.left = Math.max(16, Math.min(cx - 6, pw - 28)) + 'px';
    caret.style.display = flipped ? 'none' : 'block';
  }
}
function openTimerPanel() {
  if (!Timer.running && Timer.remain === 0 && !Timer.overMode) tTime.textContent = fmtTime(readInputs());
  if (Timer.overMode || Timer.paused) renderTimerTime(); // 重开面板显示最新/冻结读数
  $('#swPanel').classList.remove('show'); // 打开倒计时时收起秒表
  applyTimerView();
  $('#timerPanel').classList.add('show');
  positionTimerPanel();
}
function closeTimerPanel() { $('#timerPanel').classList.remove('show'); }
function timerTick() {
  if (Timer.paused) return; // 暂停期间不计时
  // 超时正计时：自动累加，直到用户重新设置并开始新一轮
  if (Timer.overMode) { renderTimerTime(); return; }
  Timer.remain = Math.max(0, Math.round((Timer.endAt - Date.now()) / 1000));
  renderTimerTime();
  if (Timer.remain <= 0) finishTimer();
}
function startTimer() {
  if (Timer.running) return;
  const secs = (!Timer.overMode && Timer.remain > 0) ? Timer.remain : readInputs();
  if (!secs) { toast('请先设置倒计时时长'); return; }
  // 在用户点击手势内预创建 AudioContext 并预解码电铃，保证归零时立即响铃
  preloadAlarm();
  // 新一轮倒计时：清掉上一次的超时正计时与暂停态
  Timer.overMode = false;
  Timer.overAt = 0;
  Timer.paused = false;
  Timer.overElapsed = 0;
  Timer.remain = secs;
  Timer.endAt = Date.now() + secs * 1000;
  Timer.running = true;
  renderTimerTime();
  applyTimerView();
  positionTimerPanel();
  if (Timer.intervalId) clearInterval(Timer.intervalId);
  Timer.intervalId = setInterval(timerTick, 250);
}
function resetTimer() {
  if (Timer.intervalId) clearInterval(Timer.intervalId);
  stopAlarm();
  Timer.running = false;
  Timer.remain = 0;
  Timer.overMode = false;
  Timer.overAt = 0;
  Timer.paused = false;
  Timer.overElapsed = 0;
  tTime.textContent = fmtTime(readInputs());
  renderTimerTime();
  applyTimerView();
  positionTimerPanel();
}
function finishTimer() {
  // 幂等：已进入超时正计时后，任何 tick 重复进入都直接返回
  if (Timer.overMode) return;
  if (Timer.intervalId) clearInterval(Timer.intervalId);
  Timer.running = false;
  Timer.remain = 0;
  Timer.paused = false;
  Timer.overElapsed = 0;
  // 归零瞬间自动启动"超时正计时"（唯一触发方式：倒计时归零；关闭弹窗、关闭面板也在后台继续）
  Timer.overMode = true;
  Timer.overAt = Date.now();
  renderTimerTime();
  applyTimerView();
  positionTimerPanel();
  Timer.intervalId = setInterval(timerTick, 250);
  // 弹窗居中 + 持续循环提示音（关弹窗即停）
  $('#timerModal').classList.add('show');
  startAlarm();
}
/* 暂停：倒计时冻结剩余秒数，超时正计时冻结累计秒数，停掉定时器 */
function pauseTimer() {
  if (Timer.paused) return;
  if (Timer.intervalId) { clearInterval(Timer.intervalId); Timer.intervalId = null; }
  if (Timer.overMode) {
    Timer.overElapsed = Math.floor((Date.now() - Timer.overAt) / 1000);
  } else if (Timer.running) {
    Timer.remain = Math.max(0, Math.round((Timer.endAt - Date.now()) / 1000));
    Timer.running = false;
  }
  Timer.paused = true;
  renderTimerTime();
  applyTimerView();
  positionTimerPanel();
}
/* 继续：超时正计时前移基准保持累计连续，倒计时按剩余秒重设截止，重启定时器 */
function resumeTimer() {
  if (!Timer.paused) return;
  if (Timer.overMode) {
    Timer.overAt = Date.now() - Timer.overElapsed * 1000;
  } else {
    Timer.endAt = Date.now() + Timer.remain * 1000;
    Timer.running = true;
  }
  Timer.paused = false;
  if (Timer.intervalId) clearInterval(Timer.intervalId);
  Timer.intervalId = setInterval(timerTick, 250);
  renderTimerTime();
  applyTimerView();
  positionTimerPanel();
}

/* ---- 超时提示音：内联"考试电铃"样本（Web Audio 无缝循环），仅超时弹窗期间响，关弹窗即停 ---- */
let alarmCtx = null, alarmBuffer = null, alarmSrc = null, alarmGain = null;
window.__alarmOn = false;
function ensureAlarmCtx() {
  if (!alarmCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { alarmCtx = new AC(); } catch (e) { return null; }
  }
  if (alarmCtx && alarmCtx.state === 'suspended') { alarmCtx.resume().catch(() => {}); }
  return alarmCtx;
}
function b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
// 用户点"开始"时预解码，保证归零瞬间立即响铃
function preloadAlarm() {
  const ctx = ensureAlarmCtx();
  if (!ctx || alarmBuffer || typeof ALARM_BELL_B64 === 'undefined') return;
  try {
    ctx.decodeAudioData(b64ToArrayBuffer(ALARM_BELL_B64),
      b => { alarmBuffer = b; },
      () => { alarmBuffer = null; });
  } catch (e) { alarmBuffer = null; }
}
function startAlarm() {
  const ctx = ensureAlarmCtx();
  if (!ctx) return;
  const go = () => {
    // 弹窗已被关闭则不再启动（处理异步回调晚于关闭的情况）
    if (!$('#timerModal').classList.contains('show')) return;
    stopAlarm();
    if (alarmBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = alarmBuffer;
      src.loop = true;                 // 样本首尾交叉淡化，循环无缝
      const g = ctx.createGain();
      g.gain.value = 0.9;
      src.connect(g); g.connect(ctx.destination);
      src.start(0);
      alarmSrc = src; alarmGain = g;
      window.__alarmLoop = src.loop;
      window.__alarmDur = src.buffer ? src.buffer.duration : 0;
    }
    window.__alarmOn = true;
  };
  if (alarmBuffer) {
    if (ctx.state === 'suspended') ctx.resume().then(go).catch(() => {});
    else go();
  } else if (typeof ALARM_BELL_B64 !== 'undefined') {
    try {
      ctx.decodeAudioData(b64ToArrayBuffer(ALARM_BELL_B64),
        b => { alarmBuffer = b; go(); },
        () => { window.__alarmOn = false; });
    } catch (e) { /* 无音频环境时静默 */ }
  }
}
function stopAlarm() {
  if (alarmSrc) {
    try { alarmSrc.stop(0); } catch (e) {}
    try { alarmSrc.disconnect(); } catch (e) {}
    alarmSrc = null;
  }
  if (alarmGain) { try { alarmGain.disconnect(); } catch (e) {} alarmGain = null; }
  window.__alarmOn = false;
  window.__alarmLoop = false;
}

/* ---------------- 工具条 / 设置 ---------------- */
function setFontSize(v) {
  state.fontSize = Math.max(15, Math.min(24, v));
  document.documentElement.style.setProperty('--body-size', state.fontSize + 'px');
  $('#fontVal').textContent = state.fontSize;
  lsSet('e2_fontSize', state.fontSize);
}
function setShowAns(v) {
  state.showAns = v;
  document.body.classList.toggle('show-answers', v);
  $('#ansToggle').classList.toggle('active', v);
  $('#ansToggle').textContent = v ? '隐藏答案' : '显示答案';
  lsSet('e2_showAns', v);
  if (v && state.year && !hasAnswers(PAPER_MAP[state.year]))
    toast('本套真题未取得官方答案，仅完形/阅读题干可正常显示');
}
function syncPanelCollapsed() {
  // 收藏面板隐藏时同步隐藏右侧分界线，避免鼠标移到边缘仍出现橙色热区
  document.body.classList.toggle('wp-collapsed', !state.panelOpen);
}
function togglePanel(force) {
  state.panelOpen = force != null ? force : !state.panelOpen;
  $('#wordPanel').classList.toggle('hidden', !state.panelOpen);
  $('#main').classList.toggle('withPanel', state.panelOpen);
  $('#panelToggle').classList.toggle('active', state.panelOpen);
  syncPanelCollapsed();
  lsSet('e2_panelOpen', state.panelOpen);
}
/* ===== 三栏宽度：拖动分界线调整，记忆到本地 ===== */
const SB_W_KEY = 'e2_sbWidth', WP_W_KEY = 'e2_wpWidth';
const SB_MIN = 180, SB_MAX = 440, WP_MIN = 280, WP_MAX = 560;
function isDesktop() { return window.matchMedia('(min-width:901px)').matches; }
function loadColWidth(key, def) {
  const v = parseInt(lsGet(key, def), 10);
  return isNaN(v) ? def : v;
}
let sbW = loadColWidth(SB_W_KEY, 236);
let wpW = loadColWidth(WP_W_KEY, 360);
function applyColWidths() {
  const root = document.documentElement.style;
  root.setProperty('--sb-w', sbW + 'px');
  root.setProperty('--wp-w', wpW + 'px');
}
function saveColWidths() { lsSet(SB_W_KEY, sbW); lsSet(WP_W_KEY, wpW); }
applyColWidths();

function syncSidebarCollapsed() {
  document.body.classList.toggle('sb-collapsed', !state.sidebarOpen);
}
function beginColDrag(kind, e) {
  e.preventDefault(); e.stopPropagation();
  const sx = e.clientX;
  const startW = kind === 'L' ? sbW : wpW;
  const divider = kind === 'L' ? $('#divL') : $('#divR');
  divider.classList.add('active');
  document.body.classList.add('col-resizing');
  function onMove(ev) {
    const dx = ev.clientX - sx;
    if (kind === 'L') sbW = Math.max(SB_MIN, Math.min(SB_MAX, startW + dx));
    else wpW = Math.max(WP_MIN, Math.min(WP_MAX, startW - dx)); // 鼠标往左拖，右栏变宽
    applyColWidths();
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    divider.classList.remove('active');
    document.body.classList.remove('col-resizing');
    saveColWidths();
  }
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}
$('#divL').addEventListener('pointerdown', e => { if (isDesktop()) beginColDrag('L', e); });
$('#divR').addEventListener('pointerdown', e => { if (isDesktop()) beginColDrag('R', e); });
// 断点切换：桌面按状态恢复折叠，抽屉模式移除该类避免冲突
window.matchMedia('(max-width:900px)').addEventListener('change', () => {
  if (isDesktop()) syncSidebarCollapsed();
  else document.body.classList.remove('sb-collapsed');
});
syncSidebarCollapsed();

function toggleSidebar(force) {
  if (isDesktop()) {
    state.sidebarOpen = force != null ? force : !state.sidebarOpen;
    syncSidebarCollapsed();
    lsSet('e2_sidebarOpen', state.sidebarOpen);
    return;
  }
  // 移动端：抽屉逻辑
  const sb = $('#sidebar');
  const open = force != null ? force : !sb.classList.contains('open');
  sb.classList.toggle('open', open);
  $('#scrim').classList.toggle('show', open);
}

$('#fontDec').onclick = () => setFontSize(state.fontSize - 1);
$('#fontInc').onclick = () => setFontSize(state.fontSize + 1);
$('#ansToggle').onclick = () => setShowAns(!state.showAns);
$('#panelToggle').onclick = () => togglePanel();
$('#darkToggle').onclick = () => setDark(!state.darkMode);
$('#menuBtn').onclick = () => toggleSidebar();
$('#scrim').onclick = () => toggleSidebar(false);
$('#wpClear').onclick = async () => {
  if (!state.favorites.length) return;
  const ok = await askConfirm(`确定清空全部收藏吗？（共 ${state.favorites.length} 条，单词与句子都会被删除）`, '清空收藏');
  if (!ok) return;
  state.favorites = [];
  saveFavorites();
  renderFavorites();
  toast('收藏已清空');
};
// 收藏面板：单词 / 句子 Tab 切换
$$('.wp-tab').forEach(t => {
  t.onclick = () => {
    state.favTab = t.getAttribute('data-favtab') === 'sent' ? 'sent' : 'word';
    renderFavorites();
  };
});
// 收藏面板条目：仅删除（二次确认）；单词卡只在卷面点词
$('#wpBody').onclick = async ev => {
  const del = ev.target.closest('[data-del]');
  if (del) {
    ev.stopPropagation();
    const type = del.getAttribute('data-del');
    const key = del.getAttribute('data-key');
    const label = type === 'sent' ? '这条句子' : '「' + key + '」';
    const ok = await askConfirm(`确定删除${label}吗？`, '删除收藏');
    if (!ok) return;
    const i = findFavIndex(type, key);
    if (i >= 0) {
      state.favorites.splice(i, 1);
      saveFavorites();
      renderFavorites();
    }
    return;
  }
};

/* 倒计时控件：小面板以"倒计时"按钮为锚点展开/收起 */
$('#timerBtn').onclick = ev => {
  ev.stopPropagation();
  if ($('#timerPanel').classList.contains('show')) closeTimerPanel();
  else openTimerPanel();
};
$('#timerClose').onclick = () => closeTimerPanel();
$('#tStart').onclick = startTimer;
$('#tReset').onclick = resetTimer;
$('#tPause').onclick = () => (Timer.paused ? resumeTimer() : pauseTimer());
// 视口变化时重新定位（面板打开时）
window.addEventListener('resize', () => { if ($('#timerPanel').classList.contains('show')) positionTimerPanel(); });
window.addEventListener('scroll', () => { if ($('#timerPanel').classList.contains('show')) positionTimerPanel(); }, true);
// 点小面板与按钮之外的区域：收起小面板（结束弹窗显示期间、点击弹窗本身时不关）
document.addEventListener('mousedown', ev => {
  if (!$('#timerPanel').classList.contains('show')) return;
  if ($('#timerModal').classList.contains('show')) return;
  if (isInside($('#timerPanel'), ev.target) || isInside($('#timerBtn'), ev.target)) return;
  if (isInside($('#timerModal'), ev.target)) return;
  closeTimerPanel();
}, true);
$('#tmClose').onclick = () => {
  $('#timerModal').classList.remove('show');
  stopAlarm(); // 关闭弹窗瞬间停止提示音
};
[tH, tM, tS].forEach(i => i.addEventListener('input', () => {
  if (!Timer.running && Timer.remain === 0 && !Timer.overMode) tTime.textContent = fmtTime(readInputs());
}));

/* ---------------- 纯计时秒表（与倒计时完全独立，互不影响） ---------------- */
const SW = { elapsed: 0, running: false, startAt: 0, intervalId: null };
const swBtn = $('#swBtn'), swPanel = $('#swPanel'), swTime = $('#swTime');

function swRender() {
  const ms = SW.running ? SW.elapsed + (Date.now() - SW.startAt) : SW.elapsed;
  swTime.textContent = fmtTime(ms / 1000);
}
function positionSwPanel() {
  const b = swBtn.getBoundingClientRect();
  const pw = swPanel.offsetWidth, ph = swPanel.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const m = 8;
  let left = Math.max(m, Math.min(b.right - pw, vw - pw - m));
  let top = b.bottom + 8;
  let flipped = false;
  if (top + ph > vh - m) { top = b.top - ph - 8; flipped = true; }
  swPanel.style.left = left + 'px';
  swPanel.style.top = top + 'px';
  const caret = $('#swCaret');
  if (caret) {
    const cx = b.left + b.width / 2 - left;
    caret.style.left = Math.max(16, Math.min(cx - 6, pw - 28)) + 'px';
    caret.style.display = flipped ? 'none' : 'block';
  }
}
function openSwPanel() {
  $('#timerPanel').classList.remove('show'); // 打开秒表时收起倒计时
  swRender();
  swPanel.classList.add('show');
  positionSwPanel();
}
function closeSwPanel() { swPanel.classList.remove('show'); }
function swSetRunning(run) {
  if (run && !SW.running) { SW.startAt = Date.now(); SW.running = true; }
  else if (!run && SW.running) { SW.elapsed += Date.now() - SW.startAt; SW.running = false; }
  swBtn.classList.toggle('running', SW.running);
  $('#swToggle').textContent = SW.running ? '暂停' : '开始';
  if (SW.intervalId) clearInterval(SW.intervalId);
  if (SW.running) SW.intervalId = setInterval(swRender, 250);
  swRender();
}
swBtn.onclick = ev => {
  ev.stopPropagation();
  if (swPanel.classList.contains('show')) closeSwPanel();
  else openSwPanel();
};
$('#swClose').onclick = () => closeSwPanel();
$('#swToggle').onclick = () => swSetRunning(!SW.running);
$('#swReset').onclick = () => {
  // 重置即停止：清掉定时器与运行状态，读数归零
  if (SW.intervalId) { clearInterval(SW.intervalId); SW.intervalId = null; }
  SW.running = false;
  SW.elapsed = 0;
  SW.startAt = 0;
  swBtn.classList.remove('running');
  $('#swToggle').textContent = '开始';
  swRender();
};
window.addEventListener('resize', () => { if (swPanel.classList.contains('show')) positionSwPanel(); });
window.addEventListener('scroll', () => { if (swPanel.classList.contains('show')) positionSwPanel(); }, true);
// 点面板与按钮之外：收起秒表小面板（不影响运行状态）
document.addEventListener('mousedown', ev => {
  if (!swPanel.classList.contains('show')) return;
  if (isInside(swPanel, ev.target) || isInside(swBtn, ev.target)) return;
  closeSwPanel();
}, true);

/* 侧栏委托：点年份按钮展开/进入 */
$('#yearNav').addEventListener('click', ev => {
  const btn = ev.target.closest('.side-year');
  if (!btn) return;
  location.hash = '#/' + btn.getAttribute('data-year'); // 直接进入该年份，小题型在主界面切换
  if (window.innerWidth <= 900) toggleSidebar(false);
});

/* ---------------- 初始化 ---------------- */
function detectTV() {
  const ua = navigator.userAgent || '';
  const marked = /smart\s?tv|googletv|android\s?tv|AFT[A-Z]|web0s|webos|netcast|bravia|hbbttv|\bTV\b/i.test(ua);
  const androidTv = /android/i.test(ua) && !/mobile/i.test(ua) &&
    window.matchMedia('(hover:none) and (min-width:1000px)').matches;
  if (marked || androidTv) document.body.classList.add('tv');
}
function init() {
  detectTV();
  renderHome();
  renderSidebar();
  setFontSize(state.fontSize);
  setShowAns(state.showAns);
  setDark(state.darkMode);
  // 窄屏默认收起收藏面板，避免遮挡试卷（需要时点"我的收藏"滑出）
  if (window.innerWidth <= 900) state.panelOpen = false;
  togglePanel(state.panelOpen);
  renderFavorites();
  tTime.textContent = fmtTime(readInputs());
  applyTimerView();
  route();
}
document.addEventListener('DOMContentLoaded', init);
