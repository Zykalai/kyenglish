# 英语二真题 · 划词精读

2010–2026 年考研英语（二）真题阅读器：保留纸质书式的版面，点击任意英文单词即可查词，支持 AI 讲解、整句翻译、收藏、黑夜模式和专注倒计时。

[在线使用](https://zykalai.github.io/kyenglish/) · [CI](https://github.com/Zykalai/kyenglish/actions/workflows/ci.yml)

[![CI](https://github.com/Zykalai/kyenglish/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Zykalai/kyenglish/actions/workflows/ci.yml)

## 功能

- **17 套真题**：2010–2026 英语（二），按年份和题型浏览。
- **点词查义**：直接查 ECDICT，完整显示词条释义；释义中出现英文词时，继续追加“原形 / 相关词”卡片，并带环检测和数量上限。
- **两套查词路径**：卷面词使用预计算卡片，点击即出；AI 回答、输入框、收藏句子按需加载词典分片。
- **AI 精读**：对单词、句子或段落发起讲解与追问。
- **整句翻译**：独立翻译通道，只发送当前句子，不携带聊天历史。
- **阅读体验**：生词/句子收藏、黑夜模式、专注倒计时、响应式排版。
- **无音标**：卡片只保留词性和释义，版面更紧凑。

卷面、真题和词典可以离线使用；AI 和翻译需要联网。

## 快速开始

```bash
git clone https://github.com/Zykalai/kyenglish.git
cd kyenglish
```

直接打开 `index.html` 即可。需要本地 HTTP 服务时：

```bash
python -m http.server 8000
```

然后访问 <http://localhost:8000>。

仓库自带真题、卷面卡片、词典分片和原始 ECDICT，克隆后不需要再下载数据；完整仓库约 110MB。

## 本地构建

```bash
pip install -r requirements.txt
python -m playwright install chromium

python tools/lexicon/build_dict.py
python tools/lexicon/build_paper_cards.py
python tools/assemble.py
python tools/lexicon/verify.py
```

`build_dict.py` 和 `build_paper_cards.py` 只依赖 Python 标准库；`verify.py` 使用 Playwright 做端到端检查。

## 项目结构

```text
index.html                  单文件前端（由 src 组装）
data/papers/                17 套真题 JSON
data/paper-cards.json       卷面单词的预计算卡片
data/dict-parts/            ECDICT 按两个字母拆分的查询分片
data/dict/ecdict.csv        原始 ECDICT
src/                        页面逻辑、交互、样式模板
tools/                      组装、词典构建、验证脚本
deploy/pages-proxy/         Cloudflare Pages 代理源码
cloudflare_worker.js        Cloudflare Worker 源码
```

## 部署

- **前端**：GitHub Pages 从 `main` 发布 `index.html` 和 `data/`。
- **AI 代理**：`cloudflare_worker.js`，单独部署到 Cloudflare Worker。
- **AI / 翻译代理**：`deploy/pages-proxy/`，单独部署到 Cloudflare Pages。
- **CI**：`.github/workflows/ci.yml` 检查组装一致性和端到端行为，不负责部署 Cloudflare。

## 密钥

仓库不包含任何密钥。重新部署代理时，在 Cloudflare 平台配置：

```text
Worker:  VOLC_API_KEY
Pages:   ARK_TRANSLATE_API_KEY
可选:    WORKER_URL, ALLOW_ORIGIN
```

密钥只放在 Cloudflare Secrets 中，不要写进仓库或前端代码。

## 说明

- 查词完全基于词典，不结合上下文；词典未收录的词会显示“词典未收录”。
- 词形还原依赖词典释义中的“XX的过去式 / 过去分词 / 复数”等注释；没有注释的词不会自动还原。
- 收藏目前保存在本机浏览器，账号同步尚未接入。
