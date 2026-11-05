# 离线词形与词典

卷面点词的词形、释义和「只在卷面识别」的规则都由这里离线产出，运行时不再做启发式还原。

## 文件

| 文件 | 作用 |
|---|---|
| `decisions.json` | AI 审核后的词形决策：`global`（全库）、`blocks`（段落/题块）、`fixes`（spaCy 误还原、缩写、拼写变体） |
| `extras.json` | ECDICT 缺失或释义不对的词条：缩写、人名、新词、复合词 |
| `lexicon.json` | 生成的词典：`lemma -> [中文释义, 音标]` |
| `wordmap.json` | 生成的查表：`global` + `sections` + `blocks`，运行时按 段落 → 板块 → 全局 查找 |
| `work/` | 生成过程中的中间文件（`blocks.json`、审核报告），不参与网页构建 |

## 环境

已在 Python 3.13.15 上验证，依赖固定在仓库根目录的 `requirements.txt`：

```powershell
python -m pip install -r requirements.txt
python -m playwright install chromium   # 仅在用 PLAYWRIGHT_CHANNEL=chromium 时需要
```

`verify.py` 默认使用 Edge；没有 Edge 的环境可以：

```powershell
$env:PLAYWRIGHT_CHANNEL = "chromium"
python tools/lexicon/verify.py
```

`build.py` 需要 `data/dict/ecdict.csv`（66MB，未入库）。脚本会从 ECDICT 的固定 commit `9c46923` 下载并校验 SHA256：

```powershell
python tools/lexicon/download_ecdict.py
```

## 构建

```powershell
python tools/lexicon/download_ecdict.py  # 首次：下载并校验 66MB ECDICT
python tools/lexicon/build.py            # 生成 lexicon.json + wordmap.json
python tools/assemble.py                 # 合并成 index.html
python tools/lexicon/verify.py           # Playwright 端到端检查（唯一验收）
```

三个入口都用 `Path(__file__)` 推导项目根目录，不依赖本机绝对路径；换机器或 CI 只需安装依赖、准备 ECDICT。

## 词形流程

1. 用 spaCy 的上下文词性/词形跑完 17 套卷子的所有段落、题干、选项、翻译和写作题干（含图表文字说明）。
2. 用 lemminflect 补候选，用 ECDICT 验证；spaCy 的 `blogge`、`cofounde` 这类错误词形会被修正或交给人工。
3. 去重后只剩两类：
   - 唯一词形：直接采用。
   - 多候选：读取 `decisions.json` 的 AI 决策；同一板块内 spaCy 上下文一致的，写入 `sections` 覆盖；段落内多义的，写入 `blocks`。
4. 规则性复数优先还原单数（`agencies -> agency`、`houses -> house`），专有名词保留原拼写（`Charles`、`Gates`、`Brown`）。
5. 生成词典时去掉 `[网络]`、`[计]` 等百科/专业标签和重复义项，按卷面词性把常用义排前，最多 3 行 × 4 个义项。

## 运行时

`src/app_core.js` 里的 `lookupWord(raw, sec, blk)` 只做三件事：

1. 把原词规范化为查表 key（弯引号转直引号、去掉首尾标点）。
2. 依次查 `wordmap.blocks[year][sec][blk]`、`sections[year][sec]`、`global`。
3. 用 `lexicon[lemma]` 取释义；找不到时回退到原词。

单词卡只在卷面 `.can-lookup` 内出现；AI 对话、收藏、目录、首页使用 `.can-select`，只保留划句，不触发点词。

## 测试

`tools/lexicon/verify.py` 是唯一验收脚本，覆盖 17 套真题的逐词释义、词形覆盖、卷面点词、AI/收藏点词排除等 16 项检查。旧版 `tools/selftest.py` 与调试脚本已归档到 `_archive/tools-legacy-2026-11-05/`，不再参与构建。

## 网络配置

- **划句翻译**：Google 优先，失败时回退到 MyMemory；长句会按句切块。
- **AI 窗口**：默认走 `https://kyenglish.a965684016.workers.dev`。如果当前网络访问 `workers.dev` 不稳定，可以在页面加载前设置自定义 Worker 地址：

```js
window.DSH_AI_BASE_URL = 'https://your-worker.example.com';
```

或加载后在控制台执行：

```js
localStorage.setItem('e2_aiBaseUrl', 'https://your-worker.example.com');
location.reload();
```

## 覆盖

当前 17 套卷子共 64,194 个可点击词位、9,902 个 surface 键、6,055 个词条；`verify.py` 会逐词检查「卷面每个单词都有词典释义」。
