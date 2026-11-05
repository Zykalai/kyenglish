# 考研英语二真题 JSON Schema（抓取子任务统一规范）

## 总则
- 每年一个 JSON 文件，文件名就是年份：`2010.json`、`2011.json` … `2026.json`，写入本目录。
- 用 Python 的 `json.dump(obj, f, ensure_ascii=False, indent=1)` 写文件，UTF-8 无 BOM。
- **所有英文正文、题干、选项必须逐字忠实于真题原文**（保留原标点、大小写、连字符），不得改写、精简、凭记忆补全。
- 段落之间用 `\n\n` 分隔；段内不换行。
- 英文引号直接用原字符；JSON 转义由 json.dump 负责。
- 不要答案解析、不要中文译文。答案字母（A/B/C/D）为可选字段，仅当来源页面明确给出答案时才填。
- 某板块确实抓不到：该板块值设为 `null`，把板块名加入顶层 `missing` 数组，并在 `notes` 里说明原因；**严禁用假数据或凭记忆填充**。

## 完整结构示例
```json
{
  "year": 2026,
  "sources": ["https://...", "https://..."],
  "notes": "可选：抓取与缺失说明",
  "missing": [],
  "cloze": {
    "instruction": "Directions: Read the following text. ...（逐字）",
    "passage": "Happy people work differently. ... {{1}} ...",
    "questions": [
      {"no": 1, "A": "boast", "B": "review", "C": "share", "D": "continue", "answer": "C"}
    ],
    "fills": {"1": "share"}
  },
  "reading": [
    {
      "name": "Text 1",
      "instruction": "（该 Part 指令，若与通用指令一致也照抄来源页面）",
      "passage": "第一段。\n\n第二段。",
      "questions": [
        {"no": 21, "stem": "According to Paragraph 1, ...", "A": "...", "B": "...", "C": "...", "D": "...", "answer": "A"}
      ]
    }
  ],
  "newtype": {
    "form": "heading",
    "instruction": "...",
    "passage": "...（heading 形式中空缺小标题的位置用 {{41}} … {{45}} 标记）",
    "options": {"A": "...", "B": "...", "C": "...", "D": "...", "E": "...", "F": "...", "G": "..."},
    "items": [
      {"no": 41, "stem": "（matching/tf 形式用：左栏陈述或判断句；heading 形式可省略 stem）", "answer": "A"}
    ],
    "questions": null
  },
  "translation": {
    "instruction": "Directions: Translate the following paragraph into Chinese. ...",
    "passage": "约150词的待翻译英文段落原文，逐字"
  },
  "writing": [
    {"part": "A", "type": "应用文", "instruction": "51. Directions: ...", "prompt": "完整英文题干（含 Suppose ... Write ... 约100词 等）"},
    {"part": "B", "type": "图表作文", "instruction": "52. Directions: ...", "prompt": "完整英文题干（含 Write an essay based on the chart below...）", "chart_desc": "图表内容的文字描述：类型（柱状/折线/饼图/表格）、横纵轴/分项、各数据与趋势；中文描述，数据必须与真题图表一致"}
  ]
}
```

## 字段细则
1. **cloze（Section I Use of English，完形）**
   - `passage` 中每个空用 `{{题号}}` 标记，题序 1–20，位置必须与原文一致。
   - `questions` 20 个，每个 4 个选项 A/B/C/D。
   - `fills` 可选：答案词（用于精读时"显示完整文章"），与 answer 对应；拿不到就省略。
2. **reading（Section II Part A）**：数组固定 4 项 Text 1–4；`questions` 题号 21–40（21–25 / 26–30 / 31–35 / 36–40）。
3. **newtype（Section II Part B 新题型）**，`form` 取值：
   - `heading`：小标题匹配。`passage` 用 `{{41}}`–`{{45}}` 标空缺标题处，`options` 给 A–G（7 个候选小标题）；`items` 只需 no+answer。
   - `matching`：多项对应/连线（左栏 41–45 陈述，右栏 A–G 人名/观点）。`items` 给左栏陈述，`options` 给右栏；`passage` 为正文。
   - `tf`：判断正误（2010 年）。`items` 给 41–45 陈述句；`options` 省略。
   - `multiple`：常规四选一（若遇到），用 `questions` 数组，结构同 reading。
4. **translation（Section III Translation）**：英语二是段落英译汉，只给英文原文段落，约 150 词。
5. **writing（Section IV Writing）**：两项，Part A 小作文（应用文/书信/通知等），Part B 大作文（图表作文）。
   - `prompt` 必须是完整英文题干逐字。
   - 大作文必须有 `chart_desc`：把图表内容用文字完整描述（类型、分项、数值、趋势），因为最终网站不嵌图。
6. **instruction** 若来源页面没有逐字指令，可省略该字段或给空串，但正文/题干/选项绝不能缺。
7. 真题中出现的特殊字符（如破折号 –、引号 ’、斜体）照原样保留；斜体等排版不需要标记。
