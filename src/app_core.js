/* ============================================================
 * 考研英语二真题划词精读 —— 核心逻辑
 * 数据、词典、词形还原、派生词、路由、试卷渲染
 * ============================================================ */
'use strict';
/* __DATA_ANCHOR__ */

/* ---------------- 工具 ---------------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function normSp(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}
function toast(msg, ms) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms || 2200);
}
function lsGet(k, d) {
  try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }
  catch (e) { return d; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
}

/* ---------------- 全局状态 ---------------- */
const state = {
  view: 'home',
  year: null,
  fontSize: lsGet('e2_fontSize', 19),
  showAns: lsGet('e2_showAns', false),
  panelOpen: lsGet('e2_panelOpen', true),
  sidebarOpen: lsGet('e2_sidebarOpen', true) !== false,
  favorites: (function () {
    const v = lsGet('e2_favorites', []);
    // 本地数据损坏或被改成非数组时回退空列表，避免后续数组方法抛错
    return Array.isArray(v) ? v : [];
  })(),
  darkMode: lsGet('e2_dark', false),
  favTab: 'word'
};
const PAPERS = EXAM_DATA.papers.slice().sort((a, b) => a.year - b.year);
const PAPER_MAP = {};
PAPERS.forEach(p => PAPER_MAP[p.year] = p);

/* ============================================================
 * 词典释义展示辅助
 * ============================================================ */
const POS_RE = /\s+(?=(?:n|v|a|adj|adv|ad|vt|vi|prep|conj|pron|num|int|art|aux|suf|pref|abbr|neg)\.\s)/g;

function splitMeanings(t) {
  if (!t) return [];
  // 词典释义按词性标签分行
  const parts = t.split(POS_RE).map(x => x.trim()).filter(Boolean);
  return parts.length ? parts : [t];
}
function shortMean(t) {
  const m = splitMeanings(t);
  let s = m[0] || t || '';
  s = s.replace(/^(?:n|v|a|adj|adv|ad|vt|vi|prep|conj|pron|num|int|art|aux|suf|pref|abbr)\.\s*/, '');
  return s.split(/[；;,，]/)[0].slice(0, 16);
}

/* ============================================================
 * 渲染：侧栏 & 首页
 * ============================================================ */
function missingCount(p) {
  if (!p) return 99;
  const miss = [];
  if (!p.cloze) miss.push('cloze');
  if (!p.reading || p.reading.length < 4) miss.push('reading');
  if (!p.newtype) miss.push('newtype');
  if (!p.translation || !p.translation.passage) miss.push('translation');
  if (!p.writing || p.writing.length < 2) miss.push('writing');
  return miss;
}
function hasAnswers(p) {
  if (!p) return false;
  if (p.cloze && p.cloze.questions && p.cloze.questions.some(q => q.answer)) return true;
  if (p.reading && p.reading.some(t => t.questions && t.questions.some(q => q.answer))) return true;
  return false;
}
function renderSidebar() {
  const nav = $('#yearNav');
  let html = '';
  PAPERS.forEach(p => {
    const active = state.year === p.year;
    html += `<button class="side-year ${active ? 'active' : ''}" data-year="${p.year}">
      <span class="y">${p.year}</span><span>英语二</span>
      ${missingCount(p).length ? '<span class="tag">缺</span>' : ''}
    </button>`;
  });
  nav.innerHTML = html;
}
function renderHome() {
  let cards = '';
  PAPERS.forEach(p => {
    const miss = missingCount(p);
    cards += `<a class="year-card" href="#/${p.year}">
      <div class="yc-year">${p.year}</div>
      <div class="yc-sub">全国硕士研究生招生考试 · 英语（二）</div>
      <div class="yc-badges">
        ${miss.length === 0
          ? '<b class="badge-ok">完整收录</b>'
          : `<b class="badge-miss">缺 ${miss.length} 个板块</b>`}
        ${hasAnswers(p) ? '<b class="badge-key">含答案</b>' : ''}
      </div>
    </a>`;
  });
  $('#homeView').innerHTML = `
  <div class="home-hero">
    <h1>英语二真题<span class="zh"> · 划词精读</span></h1>
    <p>2010–2026 年全部 17 套考研英语（二）真题，纸质书般的阅读版面，内置离线词典、生词与句子收藏、黑夜模式与专注倒计时。</p>
    <p>文本仅用于精读对照，不含在线判卷。</p>
  </div>
  <div class="usage">
    <div class="card"><h3>点词查义</h3><p>点击试卷上任意英文单词，弹出词性与中文释义；释义中出现英文词时，会继续查原形或相关词并追加到卡片。</p></div>
    <div class="card"><h3>收藏生词与句子</h3><p>查词气泡里点「收藏」保存生词；按住鼠标划选句子或段落，点「收藏本句」整段保存，都在右侧「我的收藏」。</p></div>
    <div class="card"><h3>黑夜模式 · 倒计时</h3><p>工具栏一键切换护眼深色；倒计时可设时分秒，开始后始终显示剩余时间，结束时弹窗提示（全程静音）。</p></div>
  </div>
  <div class="year-grid">${cards}</div>`;
}

/* ============================================================
 * 渲染：试卷
 * ============================================================ */
function renderPassage(text, cls) {
  const paras = String(text || '').split(/\n{2,}/).map(normSp).filter(Boolean);
  return `<div class="passage ${cls || ''}">` + paras.map((para, i) => {
    // 完形空标记 {{n}}
    const html = esc(para).replace(/\{\{(\d+)\}\}/g, (m, n) =>
      `<span class="blank" data-n="${n}"><span class="bn">${n}</span><span class="filled"></span></span>`);
    return `<p data-blk="p${i}">${html}</p>`;
  }).join('') + `</div>`;
}
function fillClozeAnswers(p) {
  if (!p.cloze || !p.cloze.questions) return;
  const ans = {};
  p.cloze.questions.forEach(q => { if (q.answer) ans[q.no] = (q[q.answer] || ''); });
  $$('.blank', $('#paperView')).forEach(b => {
    const n = b.getAttribute('data-n');
    const f = $('.filled', b);
    if (f && ans[n]) f.textContent = ans[n];
  });
}
function renderOptions(opts, answer, cls) {
  const order = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  return `<ul class="opts ${cls || ''}">` + order.filter(k => opts[k] != null && opts[k] !== '').map(k =>
    `<li class="${answer === k ? 'correct' : ''}"><span class="ol">${k}.</span> ${esc(opts[k])}${answer === k ? `<span class="ans-letter">✓ ${k}</span>` : ''}</li>`
  ).join('') + `</ul>`;
}
function renderCloze(p) {
  const c = p.cloze;
  if (!c) return missBox('完形填空（Use of English）');
  let qs = (c.questions || []).map(q =>
    `<div class="q" data-blk="q${q.no}"><span class="stem"><span class="qno">${q.no}.</span></span>${renderOptions(q, q.answer)}</div>`
  ).join('');
  return `<section class="sec" id="sec-cloze">
    <h2 class="sec-title">Section I<span class="zh">英语知识运用 · 完形填空</span></h2>
    <div class="sec-instr" data-blk="instr">${esc(c.instruction || 'Read the following text. Choose the best word(s) for each numbered blank.')}</div>
    ${renderPassage(c.passage)}
    <div class="cloze-block" style="margin-top:18px;">${qs}</div>
  </section>`;
}
function renderReading(p) {
  if (!p.reading || !p.reading.length) return missBox('阅读理解 Part A');
  const blocks = p.reading.map((t, i) => {
    const qs = (t.questions || []).map(q =>
      `<div class="q" data-blk="q${q.no}"><div class="stem"><span class="qno">${q.no}.</span> ${esc(q.stem || '')}</div>${renderOptions(q, q.answer)}</div>`
    ).join('');
    return `<section class="sec" id="sec-reading${i + 1}">
      <h2 class="sec-title">Section II · Part A<span class="zh">阅读${i + 1}</span></h2>
      ${t.instruction ? `<div class="sec-instr" data-blk="instr">${esc(t.instruction)}</div>` : ''}
      ${renderPassage(t.passage)}
      <div style="margin-top:16px;">${qs}</div>
    </section>`;
  });
  return blocks.join('');
}
function renderNewtype(p) {
  const n = p.newtype;
  if (!n) return missBox('新题型 Part B');
  const order = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  let body = '';
  if (n.form === 'heading') {
    // 正文内的 {{41}} 标记替换成醒目的标题槽
    const paras = String(n.passage || '').split(/\n{2,}/).map(normSp).filter(Boolean);
    const passage = `<div class="passage">` + paras.map((para, i) => {
      const html = esc(para).replace(/\{\{(\d+)\}\}/g, (m, no) =>
        `<span class="heading-slot">${no}．（　　） 请从右侧候选小标题中选择</span>`);
      return `<p data-blk="p${i}">${html}</p>`;
    }).join('') + `</div>`;
    const opts = `<ul class="nt-opts" data-blk="options">` + order.filter(k => n.options && n.options[k] != null).map(k =>
      `<li><span class="ol">${k}.</span> ${esc(n.options[k])}</li>`).join('') + `</ul>`;
    body = passage + `<div class="nt-box" style="margin-top:18px;">${opts}</div>`;
  } else if (n.form === 'matching') {
    const items = `<ul class="nt-list">${(n.items || []).map(it =>
      `<li data-blk="i${it.no}"><span class="nno">${it.no}.</span> ${esc(it.stem || '')}${it.answer ? `<span class="ans-letter">✓ ${it.answer}</span>` : ''}</li>`).join('')}</ul>`;
    const opts = `<ul class="nt-opts" data-blk="options">${order.filter(k => n.options && n.options[k] != null).map(k =>
      `<li><span class="ol">${k}.</span> ${esc(n.options[k])}</li>`).join('')}</ul>`;
    body = renderPassage(n.passage) + `<div class="nt-cols" style="margin-top:18px;"><div>${items}</div><div>${opts}</div></div>`;
  } else if (n.form === 'tf') {
    const items = `<ul class="nt-list">${(n.items || []).map(it =>
      `<li data-blk="i${it.no}"><span class="nno">${it.no}.</span> ${esc(it.stem || '')}
      <span style="margin-left:8px;font-family:Georgia,serif;">［ T / F ］</span>${it.answer ? `<span class="ans-letter">✓ ${it.answer}</span>` : ''}</li>`).join('')}</ul>`;
    body = renderPassage(n.passage) + `<div class="nt-box" style="margin-top:18px;">${items}</div>`;
  } else {
    const qs = (n.questions || []).map(q =>
      `<div class="q" data-blk="q${q.no}"><div class="stem"><span class="qno">${q.no}.</span> ${esc(q.stem || '')}</div>${renderOptions(q, q.answer)}</div>`
    ).join('');
    body = renderPassage(n.passage) + `<div style="margin-top:16px;">${qs}</div>`;
  }
  return `<section class="sec" id="sec-newtype">
    <h2 class="sec-title">Section II · Part B<span class="zh">阅读理解新题型</span></h2>
    <div class="sec-instr" data-blk="instr">${esc(n.instruction || '')}</div>
    ${body}
  </section>`;
}
function renderTranslation(p) {
  const t = p.translation;
  if (!t || !t.passage) return missBox('翻译（英译汉）');
  return `<section class="sec" id="sec-translation">
    <h2 class="sec-title">Section III<span class="zh">翻译 · 英译汉</span></h2>
    <div class="sec-instr" data-blk="instr">${esc(t.instruction || 'Translate the following paragraph into Chinese.')}</div>
    <div class="trans-passage">${renderPassage(t.passage).replace(/^<div class="passage[^"]*">/, '').replace(/<\/div>$/, '')}</div>
  </section>`;
}
function renderWriting(p) {
  const w = p.writing;
  if (!w || !w.length) return missBox('写作');
  const blocks = w.map((b, i) => {
    const isChart = b.part === 'B' || i === 1;
    return `<div class="writing-block" data-blk="w${i}">
      <h4>Part ${esc(b.part)} · ${esc(b.type || (isChart ? '图表作文' : '应用文'))}
        <span style="font-weight:400;font-size:12px;color:var(--ink-faint);margin-left:6px;">${isChart ? '大作文' : '小作文'}</span></h4>
      <div class="prompt">${esc(b.instruction || '')}<br><br>${esc(b.prompt || '')}</div>
      ${b.chart_desc ? `<div class="chart-desc"><b>图表内容（原题图表的文字还原）：</b><br>${esc(b.chart_desc)}</div>` : ''}
    </div>`;
  }).join('');
  return `<section class="sec" id="sec-writing">
    <h2 class="sec-title">Section IV<span class="zh">写作</span></h2>
    ${blocks}
  </section>`;
}
function missBox(name) {
  return `<section class="sec"><div class="sec-miss">本套试卷的「${esc(name)}」板块未能取得可信原文，已如实标注缺失，未使用任何占位或虚构内容。</div></section>`;
}

const SECTIONS = [
  ['cloze', '完形'], ['reading', '阅读1'], ['reading2', '阅读2'], ['reading3', '阅读3'],
  ['reading4', '阅读4'], ['newtype', '新题型'], ['translation', '翻译'], ['writing', '写作']
];
/* 切换试卷/题型时的统一清零：关闭单词气泡、划句工具条、清除文本选区 */
function clearTransient() {
  try {
    if (typeof bubbleWord !== 'undefined') bubbleWord = null;
    if (typeof currentSel !== 'undefined') currentSel = null;
    const b = $('#wordBubble'); if (b) b.style.display = 'none';
    const fb = $('#favBar'); if (fb) fb.style.display = 'none';
    const tp = $('#transPop'); if (tp) tp.style.display = 'none';
    const sel = window.getSelection();
    if (sel && sel.rangeCount) sel.removeAllRanges();
  } catch (e) {}
}
function renderPaper(year) {
  const p = PAPER_MAP[year];
  if (!p) { location.hash = '#/'; return; }
  state.year = year; state.view = 'paper';
  $('#homeView').style.display = 'none';
  $('#paperView').style.display = 'block';
  const tabs = SECTIONS.map(s => `<a href="#/${year}/${s[0].replace('reading', 'reading')}" data-sec="${s[0]}">${s[1]}</a>`).join('');
  $('#paperView').innerHTML = `
  <div class="sheet can-lookup">
    <div class="paper-head">
      <h2>${year} 年全国硕士研究生招生考试</h2>
      <div class="sub">英 语 （ 二 ） · English (II)</div>
    </div>
    <div class="sec-tabs" id="secTabs">${tabs}</div>
    ${renderCloze(p)}
    ${renderReading(p)}
    ${renderNewtype(p)}
    ${renderTranslation(p)}
    ${renderWriting(p)}
  </div>`;
  fillClozeAnswers(p);
  renderSidebar();
  clearTransient(); // 换年份/首次进入：气泡、选区、工具条全部清零
  setupScrollSpy(); // 滚动时板块 tab 跟随高亮
  window.scrollTo(0, 0);
}

/* ============================================================
 * 路由
 * ============================================================ */
/* 强制滚动到目标板块开头；reading 对应 sec-reading1。hash 是否变化都可调用，保证导航绝对准确 */
/* 程序触发的平滑滚动（点击题型）期间抑制 scroll spy，避免高亮在中间板块闪烁；
   滚动停止 150ms 后自动恢复，手动滚轮/拖动滑块不受影响 */
let navScrolling = false, spyTimer = null;
function endNavScroll() {
  navScrolling = false;
  clearTimeout(spyTimer);
  window.removeEventListener('scroll', onNavScroll);
}
function onNavScroll() {
  clearTimeout(spyTimer);
  spyTimer = setTimeout(endNavScroll, 150);
}
function beginNavScroll() {
  navScrolling = true;
  clearTimeout(spyTimer);
  window.removeEventListener('scroll', onNavScroll);
  window.addEventListener('scroll', onNavScroll, { passive: true });
  spyTimer = setTimeout(endNavScroll, 800); // 兜底：目标原地无需滚动时也能复位
}
function gotoSection(secKey) {
  const secId = 'sec-' + (secKey === 'reading' ? 'reading1' : secKey);
  const el = document.getElementById(secId);
  if (!el) return;
  // 立即把目标 tab 锁定为高亮，滚动期间 spy 被抑制，橙色始终停在目标
  const targetTab = document.querySelector('#secTabs a[data-sec="' + secKey + '"]');
  if (targetTab) {
    $$('#secTabs a').forEach(x => x.classList.remove('active'));
    targetTab.classList.add('active');
  }
  beginNavScroll();
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function route() {
  const hash = location.hash.replace(/^#\//, '');
  const parts = hash.split('/');
  if (parts[0] && /^\d{4}$/.test(parts[0])) {
    const year = Number(parts[0]);
    if (state.year !== year || state.view !== 'paper') renderPaper(year);
    else {
      // 同年内切换板块（阅读1-4/完形/新题型等）：气泡、选区、工具条一切清零
      $('#homeView').style.display = 'none';
      $('#paperView').style.display = 'block';
      clearTransient();
    }
    if (parts[1]) setTimeout(() => gotoSection(parts[1]), 80);
  } else {
    state.view = 'home'; state.year = null;
    $('#paperView').style.display = 'none';
    $('#homeView').style.display = 'block';
    renderSidebar();
    clearTransient(); // 回到首页同样清零
    window.scrollTo(0, 0);
  }
}
window.addEventListener('hashchange', route);

/* 滚动监听：高亮板块 tab */
let scrollSpyObs = null;
function setupScrollSpy() {
  // 每次重渲染都会重建 #secTabs，先断开旧观察器，避免泄漏与重复回调
  if (scrollSpyObs) { scrollSpyObs.disconnect(); scrollSpyObs = null; }
  const tabs = $$('#secTabs a');
  if (!tabs.length) return;
  // data-sec → 实际元素 id（reading 对应 sec-reading1）
  const secElId = k => 'sec-' + (k === 'reading' ? 'reading1' : k);
  const map = SECTIONS.map(s => ({
    tab: document.querySelector(`#secTabs a[data-sec="${s[0]}"]`),
    el: document.getElementById(secElId(s[0]))
  }));
  scrollSpyObs = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        if (navScrolling) return; // 程序平滑滚动中，高亮已锁定目标，忽略中间板块
        tabs.forEach(a => a.classList.remove('active'));
        const match = map.find(m => m.el === en.target);
        if (match && match.tab) match.tab.classList.add('active');
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });
  map.forEach(m => { if (m.el) scrollSpyObs.observe(m.el); });
}

/* 题型 tab 点击委托（#paperView 稳定，#secTabs 重建不影响）：
   已在该板块时 hash 不变、hashchange 不触发，这里强制滚动，保证每次点击都准确跳到板块开头 */
$('#paperView').addEventListener('click', ev => {
  const t = ev.target;
  const a = (t && t.closest) ? t.closest('#secTabs a') : null;
  if (!a) return;
  ev.preventDefault();
  const sec = a.getAttribute('data-sec');
  const targetHash = '#/' + state.year + '/' + sec;
  // gotoSection 统一负责立即高亮、抑制 spy、平滑滚动
  if (location.hash === targetHash) gotoSection(sec);
  else location.hash = targetHash;
});

