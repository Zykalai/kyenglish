# 词典构建（dictionary-first）

现在查词是“直接查 ECDICT 原词条”，不再预生成词形，也不使用 spaCy / lemminflect。

## 构建

```powershell
python tools/lexicon/download_ecdict.py   # 首次：下载并校验 ECDICT
python tools/lexicon/build_dict.py        # 生成 data/dict-parts/<两个字母>.js
python tools/lexicon/build_paper_cards.py # 预计算卷面词卡片 data/paper-cards.json
python tools/assemble.py                  # 把真题、卷面卡片和 JS 组装进 index.html
python tools/lexicon/verify.py            # 端到端检查
```

## 运行时逻辑

1. 点击任意英文单词，按前两个字母加载 `data/dict-parts/` 对应小文件；
2. 直接显示该 surface 的全部释义；
3. 释义里出现英文词（如 `space的复数`）时，再查该词的词典释义，作为“原形 xx / 相关词 xx”区块塞进卡片；可有限递归，带环检测和数量上限；
4. 卷面词、AI 回答、用户消息、收藏句子、AI 输入框走同一套逻辑。

词典没有收录某个 surface 时显示“词典未收录”，不做猜词形。
