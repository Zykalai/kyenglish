# 英语二真题划词精读

一个可离线打开、也可直接部署到 GitHub Pages 的考研英语（二）真题阅读器。

- 线上：<https://ab123666.github.io/kyenglish/>
- 仓库：<https://github.com/ab123666/kyenglish>

## 换电脑后如何得到同一版本

```powershell
git clone https://github.com/ab123666/kyenglish.git
cd kyenglish
pip install -r requirements.txt
```

仓库里已经包含：

- `index.html`：可直接打开的完整前端；
- `data/papers/`：17 套真题 JSON；
- `data/paper-cards.json`：卷面单词的预计算卡片；
- `data/dict-parts/`：AI/输入框按需查词的 ECDICT 分片；
- `data/dict/ecdict.csv`：构建词典用的原始 ECDICT；
- `src/`、`tools/`、`deploy/`、`.github/workflows/`：源码和构建脚本。

克隆后直接打开 `index.html` 就是当前线上版本。需要重新构建时：

```powershell
python tools/lexicon/build_dict.py
python tools/lexicon/build_paper_cards.py
python tools/assemble.py
python tools/lexicon/verify.py
```

`build_dict.py` / `build_paper_cards.py` 只依赖 Python 标准库；`verify.py` 需要 Playwright。

## 部署位置

- **GitHub Pages**：从 `main` 分支发布静态页面和 `data/` 资源；推送 `main` 后自动更新。
- **Cloudflare Worker**：`cloudflare_worker.js`，负责 AI 聊天转发。
- **Cloudflare Pages**：`deploy/pages-proxy/`，负责 AI 和翻译代理；需要单独在 Cloudflare 部署，GitHub 只保存源码。
- **CI**：`.github/workflows/ci.yml` 只做组装一致性和端到端检查，不负责部署 Cloudflare。

## 密钥

仓库里没有任何密钥。重新部署代理时，在对应平台手动配置：

| 平台 | 名称 | 用途 |
|---|---|---|
| Cloudflare Worker | `VOLC_API_KEY` | AI 聊天上游密钥 |
| Cloudflare Pages | `ARK_TRANSLATE_API_KEY` | 翻译通道密钥 |
| Cloudflare Pages（可选） | `WORKER_URL` | 聊天 Worker 地址 |
| Cloudflare Pages（可选） | `ALLOW_ORIGIN` | 允许的前端来源 |

密钥只放平台 Secrets，不要写进仓库、`.env` 或前端代码。

## 未入库的本地文件

以下只是本地备份、截图、旧预览或实验脚本，不属于当前运行版本，已被 `.gitignore` 排除：

- `_backup/`、`_archive/`、`_shots/`
- `_preview_*.html`
- `build_201*.py`、`check.py`
- `.wrangler/`、`__pycache__/`
