# -*- coding: utf-8 -*-
"""Build the offline paper lexicon + surface map.

Pipeline:
  papers -> spaCy (context POS/lemma) -> lemminflect candidates
        -> ECDICT validation -> AI decisions/extras
        -> data/lexicon/lexicon.json + wordmap.json
"""
import csv
import json
import os
import re
import sys
import io
from collections import Counter, defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import spacy
from lemminflect import getAllLemmas

BASE = r"C:\Users\Lenovo\Doubao\chats\2026-10-26\new-chat-1\english2-exam"
PAPERS = os.path.join(BASE, "data", "papers")
ECDICT = os.path.join(BASE, "data", "dict", "ecdict.csv")
LEXDIR = os.path.join(BASE, "data", "lexicon")
OUT_LEX = os.path.join(LEXDIR, "lexicon.json")
OUT_MAP = os.path.join(LEXDIR, "wordmap.json")

WORD_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-z0-9À-ÖØ-öø-ÿ'’&.\-]*")
HEAD_TEXT = "English II Section I Section II Part A Part B Section III Section IV T / F"
POSS_RE = re.compile(r"^(.+?)(?:['’]s|s['’])$")
CONTENT_POS = {"NOUN", "PROPN", "VERB", "AUX", "ADJ", "ADV"}
POS_UP = {"NOUN": "NOUN", "PROPN": "PROPN", "VERB": "VERB", "AUX": "VERB",
          "ADJ": "ADJ", "ADV": "ADV", "ADP": "ADP", "DET": "DET", "PRON": "PRON",
          "CCONJ": "CCONJ", "SCONJ": "SCONJ", "NUM": "NUM", "PART": "PART",
          "INTJ": "INTJ", "X": "X"}

CONTRACTIONS = {
    "don't": "do", "doesn't": "do", "didn't": "do", "isn't": "be", "aren't": "be",
    "wasn't": "be", "weren't": "be", "hasn't": "have", "haven't": "have", "hadn't": "have",
    "won't": "will", "wouldn't": "will", "can't": "can", "cannot": "can", "couldn't": "can",
    "shouldn't": "should", "mustn't": "must", "needn't": "need", "let's": "let",
    "it's": "it", "that's": "that", "there's": "there", "he's": "he", "she's": "she",
    "what's": "what", "who's": "who", "where's": "where", "when's": "when", "how's": "how",
    "i'm": "I", "i've": "have", "i'll": "will", "i'd": "would",
    "you're": "you", "we're": "we", "they're": "they",
    "you've": "have", "we've": "have", "they've": "have",
    "you'll": "will", "we'll": "will", "they'll": "will",
    "you'd": "would", "we'd": "would", "they'd": "would",
    "he'd": "would", "she'd": "would", "it'd": "would",
    "here's": "here", "that'll": "that", "there'll": "there",
}

PLURAL_STOP = {
    "news", "series", "species", "means", "headquarters", "premises", "clothes", "thanks",
    "economics", "politics", "mathematics", "physics", "ethics", "statistics", "athletics",
    "gymnastics", "linguistics", "electronics", "genetics", "logistics", "measles", "diabetes",
    "rabies", "herpes", "analysis", "basis", "crisis", "thesis", "emphasis", "status", "campus",
    "focus", "bonus", "census", "plus", "thus", "gas", "bus", "yes", "this", "his", "is", "was",
    "has", "does", "goes", "says", "us", "as", "its", "always", "sometimes", "towards",
    "afterwards", "besides", "moreover", "otherwise", "whereas", "unless", "across", "less",
    "regardless", "nevertheless", "perhaps", "species", "sales", "goods", "customs", "earnings",
    "gates", "charles", "harris", "ellis", "curtis", "downs", "angeles", "arbutus", "bauhaus",
    "brookings", "engels", "chabris", "gaines", "freeths", "reding", "berning", "airbus", "christmas",
}

POS_ORDER = ["n.", "v.", "adj.", "adv.", "pron.", "prep.", "conj.", "num.", "art.", "aux.", "int."]
POS_MAP = {
    "n": "n.", "pl": "n.", "v": "v.", "vt": "v.", "vi": "v.", "aux": "aux.",
    "a": "adj.", "adj": "adj.", "ad": "adv.", "adv": "adv.", "prep": "prep.",
    "conj": "conj.", "pron": "pron.", "num": "num.", "art": "art.", "int": "int.",
    "suf": "suf.", "pref": "pref.", "abbr": "abbr.",
}
POS_LINE_RE = re.compile(r"^([a-zA-Z]+)\.\s*(.*)$")
DOMAIN_RE = re.compile(r"^\[[^\]]+\]\s*")


def paras(text):
    return [p.strip() for p in (text or "").split("\n\n") if p.strip()]


def blocks(p):
    c = p.get("cloze") or {}
    yield "cloze", "instr", c.get("instruction") or ""
    for i, para in enumerate(paras(c.get("passage"))):
        yield "cloze", f"p{i}", para
    for q in c.get("questions") or []:
        yield "cloze", f"q{q.get('no')}", " ".join(q.get(k) or "" for k in "ABCD")

    for ti, t in enumerate(p.get("reading") or [], 1):
        sec = f"reading{ti}"
        yield sec, "instr", t.get("instruction") or ""
        for i, para in enumerate(paras(t.get("passage"))):
            yield sec, f"p{i}", para
        for q in t.get("questions") or []:
            yield sec, f"q{q.get('no')}", (q.get("stem") or "") + " " + " ".join(q.get(k) or "" for k in "ABCD")

    n = p.get("newtype") or {}
    yield "newtype", "instr", n.get("instruction") or ""
    for i, para in enumerate(paras(n.get("passage"))):
        yield "newtype", f"p{i}", para
    yield "newtype", "options", " ".join((n.get("options") or {}).get(k) or "" for k in "ABCDEFG")
    for it in n.get("items") or []:
        yield "newtype", f"i{it.get('no')}", it.get("stem") or ""
    for q in n.get("questions") or []:
        yield "newtype", f"q{q.get('no')}", (q.get("stem") or "") + " " + " ".join(q.get(k) or "" for k in "ABCD")

    tr = p.get("translation") or {}
    yield "translation", "instr", tr.get("instruction") or ""
    for i, para in enumerate(paras(tr.get("passage"))):
        yield "translation", f"p{i}", para

    for wi, w in enumerate(p.get("writing") or []):
        yield "writing", f"w{wi}", " ".join(x for x in [
            w.get("instruction") or "", w.get("prompt") or "", w.get("chart_desc") or ""
        ] if x)


def strip_surface(s):
    return s.strip("-.'’&")


def clickable(text):
    out = []
    for m in WORD_RE.finditer(text or ""):
        s = strip_surface(m.group(0))
        if s and any(ch.isalpha() for ch in s):
            out.append(s)
    return out


def singular_candidates(w):
    out = []
    def add(v):
        if len(v) >= 3 and v not in out:
            out.append(v)
    if w.endswith("ies"):
        add(w[:-3] + "y")
    if w.endswith("s") and not w.endswith("ss"):
        add(w[:-1])
    if w.endswith(("ses", "xes", "zes", "ches", "shes", "oes")):
        add(w[:-2])
    if w.endswith("ves"):
        add(w[:-3] + "f")
        add(w[:-3] + "fe")
    return out


def clean_phonetic(ph):
    if not ph:
        return ""
    ph = ph.strip()
    ph = ph.replace("ә", "ə").replace("'", "ˈ").replace(":", "ː")
    if ph.startswith("."):
        ph = "ˌ" + ph[1:]
    ph = ph.strip("/")
    return ph


def split_senses(rest):
    parts = re.split(r"[,，;；]", rest)
    out = []
    for p in parts:
        p = p.strip(" .。;；,，")
        if not p:
            continue
        if p not in out:
            out.append(p)
        if len(out) >= 4:
            break
    return out


def clean_translation(raw, preferred_pos=None):
    if not raw:
        return ""
    lines = raw.split("\\n") if "\\n" in raw else raw.split("\n")
    parsed = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line.startswith("[网络]") or line.startswith("[Web"):
            continue
        m = POS_LINE_RE.match(line)
        if m:
            pos = POS_MAP.get(m.group(1).lower())
            rest = m.group(2).strip()
            if pos and rest:
                parsed.append((pos, split_senses(rest)))
        else:
            # lines such as "find的过去式和过去分词" or "pl. 牙齿":
            # attach them to the previous POS line when possible, so the card
            # does not show a bare Chinese fragment on its own line.
            if line.startswith("["):
                line = DOMAIN_RE.sub("", line).strip()
            if line:
                senses = split_senses(line)
                if parsed and parsed[-1][0]:
                    for s in senses:
                        if s not in parsed[-1][1]:
                            parsed[-1][1].append(s)
                else:
                    parsed.append(("", senses))
    if not parsed:
        # all lines were bracketed domains: keep their text without the tag
        for line in lines:
            line = DOMAIN_RE.sub("", line.strip()).strip()
            if line:
                parsed.append(("", [line]))
    # dedupe same pos, merge senses, preferred pos first
    merged = {}
    order = []
    for pos, senses in parsed:
        if pos not in merged:
            merged[pos] = []
            order.append(pos)
        for s in senses:
            if s not in merged[pos]:
                merged[pos].append(s)
    if preferred_pos:
        p = POS_MAP.get(preferred_pos.lower(), preferred_pos)
        if p in merged:
            order.remove(p)
            order.insert(0, p)
    out = []
    for pos in order:
        senses = merged[pos][:4]
        if not senses:
            continue
        text = "；".join(senses)
        out.append((pos + " " + text).strip() if pos else text)
        if len(out) >= 3:
            break
    return "\n".join(out)


def normalize_key(s):
    return s.replace("’", "'").strip()


def main():
    print("loading ECDICT ...")
    ecdict = {}
    with open(ECDICT, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            w = (row.get("word") or "").strip()
            if w and w.lower() not in ecdict:
                ecdict[w.lower()] = row

    decisions = json.load(open(os.path.join(LEXDIR, "decisions.json"), encoding="utf-8"))
    extras_raw = json.load(open(os.path.join(LEXDIR, "extras.json"), encoding="utf-8"))
    extras = {k: v for k, v in extras_raw.items() if not k.startswith("_")}
    extras_lc = {k.lower(): (k, v) for k, v in extras.items()}
    fixes = {k.lower(): v for k, v in decisions.get("fixes", {}).items()}
    global_dec = {k: v for k, v in decisions.get("global", {}).items()}

    print("loading spaCy ...")
    nlp = spacy.load("en_core_web_sm", disable=["ner"])

    papers = []
    for fn in sorted(os.listdir(PAPERS)):
        if fn.endswith(".json") and not fn.startswith("_"):
            with open(os.path.join(PAPERS, fn), encoding="utf-8") as f:
                papers.append(json.load(f))

    # token analysis
    surface_counts = defaultdict(Counter)   # exact surface -> lemma counter
    sec_counts = defaultdict(Counter)       # (year, sec, surface) -> lemma counter
    block_counts = defaultdict(Counter)     # (year, sec, bid, surface) -> lemma counter
    lemma_pos = defaultdict(Counter)
    surface_pos = defaultdict(Counter)
    token_info = {}                         # (surface, lemma) -> pos counter

    def lem_candidates(surface, pos):
        up = POS_UP.get(pos, pos)
        out = set()
        for p, lems in getAllLemmas(surface).items():
            if p == up or (up == "PROPN" and p == "NOUN") or (up == "VERB" and p == "AUX"):
                out.update(x.lower() for x in lems)
        return out

    def corrected_lemma(surface, base, pos):
        low = surface.lower()
        if low in fixes:
            return fixes[low]
        base = (base or "").lower()
        cands = set()
        if base in ecdict:
            cands.add(base)
        for c in lem_candidates(surface, pos):
            if c in ecdict:
                cands.add(c)
        if len(cands) == 1:
            return next(iter(cands))
        if base in cands:
            return base
        if low in ecdict:
            return low
        return base or low

    for p in papers:
        year = str(p["year"])
        for sec, bid, text in blocks(p):
            if not text.strip():
                continue
            doc = nlp(text)
            for tok in doc:
                if not tok.is_alpha:
                    continue
                surface = normalize_key(tok.text)
                if not surface or not any(ch.isalpha() for ch in surface):
                    continue
                base = (tok.lemma_ or "").lower()
                lemma = corrected_lemma(surface, base, tok.pos_)
                surface_counts[surface][lemma] += 1
                sec_counts[(year, sec, surface)][lemma] += 1
                block_counts[(year, sec, bid, surface)][lemma] += 1
                lemma_pos[lemma][tok.pos_] += 1
                surface_pos[surface][tok.pos_] += 1
                token_info.setdefault((surface, lemma), Counter())[tok.pos_] += 1

    proper_lemmas = set()
    for (surface, lemma), posc in token_info.items():
        if surface[:1].isupper() and lemma not in ecdict:
            if any(p == "PROPN" for p in posc) or lemma not in extras_lc:
                proper_lemmas.add(lemma)

    # all clickable surfaces (paper text + static labels)
    surfaces = set()
    for p in papers:
        for _, _, text in [("head", "head", HEAD_TEXT)] + list(blocks(p)):
            surfaces.update(clickable(text))
    # exact-case + lower-case aliases
    print("clickable surfaces:", len(surfaces))

    # resolvers -----------------------------------------------------------
    def resolve(s, depth=0):
        s = normalize_key(s)
        low = s.lower()
        if depth > 3:
            return s, "surface"
        if low in fixes:
            return fixes[low], "fix"
        # exact-case extras first: "US" is a country, "us" is a pronoun
        if s in extras:
            return s, "extra"
        if low in extras:
            return low, "extra"
        # exact global decision
        if s in global_dec:
            return global_dec[s], "review"
        if low in global_dec:
            return global_dec[low], "review"
        # simple word seen by spaCy
        if s in surface_counts or low in surface_counts:
            cand = (surface_counts.get(s) or surface_counts.get(low)).most_common()
            # regular plural noun: prefer the singular headword (agencies -> agency).
            # Merge exact-case and lowercase POS counts: a sentence-initial "Agencies"
            # may be tagged PROPN while the same lowercase noun is tagged NOUN elsewhere.
            posc = Counter()
            posc.update(surface_pos.get(s) or {})
            posc.update(surface_pos.get(low) or {})
            if (low.endswith("s") and not low.endswith("ss") and low not in PLURAL_STOP
                    and posc.most_common(1) and posc.most_common(1)[0][0] == "NOUN"):
                for c in singular_candidates(low):
                    if c in ecdict:
                        return c, "auto"
            # capitalized proper noun: keep the spelling readers see (Charles, Gates)
            if (s[:1].isupper() and posc.most_common(1)
                    and posc.most_common(1)[0][0] == "PROPN"
                    and (low in ecdict or low in extras)):
                return s, "auto"
            # prefer a lemma that is a known entry; otherwise most common
            for lemma, _ in cand:
                if lemma in ecdict or lemma in extras:
                    return lemma, "auto"
            best = cand[0][0]
            # keep the surface spelling for proper nouns / names (Radesky, not radesky)
            if s[:1].isupper() and best not in ecdict and best not in extras:
                return s, "auto"
            return best, "auto"
        # possessive
        m = POSS_RE.match(s)
        if m:
            base_s = m.group(1)
            lemma, kind = resolve(base_s, depth + 1)
            return lemma, "possessive"
        # contraction
        if low in CONTRACTIONS:
            return CONTRACTIONS[low], "contraction"
        if low.endswith("n't"):
            return "not", "contraction"
        # hyphenated compound
        if "-" in s:
            if low in ecdict:
                return low, "compound"
            if s in extras:
                return s, "compound"
            if low in extras:
                return low, "compound"
            parts = [x for x in re.split(r"[-–—]", s) if x]
            for part in reversed(parts):
                pl = part.lower()
                if pl in ecdict or pl in extras or pl in surface_counts:
                    lemma, _ = resolve(part, depth + 1)
                    return lemma, "compound"
            if parts:
                return parts[-1].lower(), "compound"
        # abbreviation / uppercase / missing
        if low in ecdict:
            return low, "surface"
        # strip trailing period/dots for abbreviations
        alt = low.replace(".", "")
        if alt in extras:
            return alt, "extra"
        if alt in ecdict:
            return alt, "surface"
        return s, "surface"

    global_map = {}
    kinds = {}
    for s in sorted(surfaces, key=lambda x: (x.lower(), x)):
        lemma, kind = resolve(s)
        global_map[s] = lemma
        kinds[s] = kind

    # remaining undecided surfaces with more than one context lemma
    undecided = []
    for s, counter in surface_counts.items():
        if len(counter) > 1 and not (s in global_dec or s.lower() in global_dec
                                     or s.lower() in fixes or s in extras or s.lower() in extras):
            undecided.append({"surface": s, "candidates": dict(counter)})
    undecided.sort(key=lambda x: -sum(x["candidates"].values()))
    with open(os.path.join(LEXDIR, "work", "undecided.json"), "w", encoding="utf-8") as f:
        json.dump(undecided, f, ensure_ascii=False, indent=1)

    # lower-case aliases for capitalized sentence starts, but never overwrite
    # an exact-case key (US vs us, etc.)
    for s in list(global_map):
        low = s.lower()
        if low != s and low not in global_map:
            global_map[low] = global_map[s]
            kinds[low] = kinds[s]

    # curly -> straight apostrophe aliases; the browser normalizes ’ to '
    for s in list(global_map):
        alt = s.replace("’", "'")
        if alt != s and alt not in global_map:
            global_map[alt] = global_map[s]
            kinds[alt] = kinds[s]

    # section/block overrides ------------------------------------------------
    # Explicit AI decisions win. For surfaces the AI did not review, spaCy's
    # context lemma still carries useful section/paragraph information (found,
    # rose, saw, better ...), so keep it instead of flattening everything to the
    # corpus-wide choice.
    def is_decided(surface):
        return (surface in global_dec or surface.lower() in global_dec
                or surface.lower() in fixes
                or surface in extras or surface.lower() in extras)

    section_map = defaultdict(dict)
    for (year, sec, surface), counter in sec_counts.items():
        if is_decided(surface):
            continue
        g = global_map.get(surface) or global_map.get(surface.lower())
        if not g or len(counter) != 1:
            continue
        lemma = next(iter(counter))
        if lemma not in ecdict and lemma.lower() not in extras_lc:
            continue
        if lemma.lower() != g.lower():
            section_map[year].setdefault(sec, {})[surface] = lemma

    block_map = defaultdict(dict)
    for key, lemma in decisions.get("blocks", {}).items():
        parts = key.split("|")
        if len(parts) == 4:
            year, sec, bid, surface = parts
            block_map[year].setdefault(sec, {}).setdefault(bid, {})[surface] = lemma
            block_map[year][sec][bid].setdefault(surface.lower(), lemma)

    for (year, sec, bid, surface), counter in block_counts.items():
        if is_decided(surface) or len(counter) != 1:
            continue
        if surface in block_map.get(year, {}).get(sec, {}).get(bid, {}):
            continue
        lemma = next(iter(counter))
        if lemma not in ecdict and lemma.lower() not in extras_lc:
            continue
        sec_lemma = (section_map.get(year, {}).get(sec, {}).get(surface)
                     or section_map.get(year, {}).get(sec, {}).get(surface.lower())
                     or global_map.get(surface) or global_map.get(surface.lower()))
        if sec_lemma and lemma.lower() != sec_lemma.lower():
            block_map[year].setdefault(sec, {}).setdefault(bid, {})[surface] = lemma

    # lexicon entries -----------------------------------------------------
    lemmas = set(global_map.values())
    for secs in section_map.values():
        for m in secs.values():
            lemmas.update(m.values())
    for secs in block_map.values():
        for blks in secs.values():
            for m in blks.values():
                lemmas.update(m.values())
    lemmas.update(extras.keys())

    lexicon = {}
    missing = []
    for lemma in sorted(lemmas):
        if lemma in extras:
            meaning, phon = extras[lemma]
            lexicon[lemma] = [meaning, clean_phonetic(phon)]
            continue
        if lemma.lower() in extras_lc and lemma not in ecdict:
            canon, (meaning, phon) = extras_lc[lemma.lower()]
            lexicon[canon] = [meaning, clean_phonetic(phon)]
            continue
        row = ecdict.get(lemma.lower())
        if not row:
            # generic proper noun fallback
            if lemma in proper_lemmas or lemma[:1].isupper():
                lexicon[lemma] = ["n. 专有名词（人名、地名或机构名）", ""]
            else:
                missing.append(lemma)
            continue
        preferred = lemma_pos.get(lemma, Counter()).most_common(1)
        preferred = preferred[0][0] if preferred else None
        meaning = clean_translation(row.get("translation"), preferred)
        if not meaning:
            meaning = clean_translation(row.get("definition"), preferred)
        if not meaning:
            meaning = "（暂无中文释义）"
        lexicon[lemma] = [meaning, clean_phonetic(row.get("phonetic"))]

    # lower-case aliases for section/block maps (sentence-initial capitals)
    for year, secs in section_map.items():
        for sec, m in secs.items():
            for s in list(m):
                if s.lower() != s and s.lower() not in m:
                    m[s.lower()] = m[s]
                alt = s.replace("’", "'")
                if alt != s and alt not in m:
                    m[alt] = m[s]
    for year, secs in block_map.items():
        for sec, blks in secs.items():
            for bid, m in blks.items():
                for s in list(m):
                    if s.lower() != s and s.lower() not in m:
                        m[s.lower()] = m[s]
                    alt = s.replace("’", "'")
                    if alt != s and alt not in m:
                        m[alt] = m[s]

    wordmap = {
        "global": global_map,
        "blocks": {y: {s: {b: m for b, m in blks.items()} for s, blks in secs.items()}
                   for y, secs in block_map.items()},
        "sections": {y: dict(secs) for y, secs in section_map.items()},
    }

    os.makedirs(LEXDIR, exist_ok=True)
    with open(OUT_LEX, "w", encoding="utf-8") as f:
        json.dump(lexicon, f, ensure_ascii=False, separators=(",", ":"))
    with open(OUT_MAP, "w", encoding="utf-8") as f:
        json.dump(wordmap, f, ensure_ascii=False, separators=(",", ":"))

    # validate coverage ---------------------------------------------------
    no_map, no_entry = [], []
    for s in surfaces:
        lemma = global_map.get(s)
        if not lemma:
            no_map.append(s)
        elif lemma not in lexicon and lemma not in extras:
            no_entry.append(lemma)
    print(f"lemmas: {len(lexicon)}  global surfaces: {len(global_map)}  "
          f"block overrides: {sum(len(m) for y in wordmap['blocks'].values() for s in y.values() for m in s.values())}")
    print(f"missing from ECDICT (manual extras needed): {len(missing)}")
    if missing:
        print("  " + ", ".join(missing[:80]))
    print(f"surfaces without map: {len(no_map)}  lemmas without entry: {len(no_entry)}")
    if no_map:
        print("  surfaces:", ", ".join(sorted(set(no_map))[:60]))
    if no_entry:
        print("  lemmas:", ", ".join(sorted(set(no_entry))[:60]))
    print("sizes: lexicon %.1f KB, wordmap %.1f KB" % (
        os.path.getsize(OUT_LEX) / 1024, os.path.getsize(OUT_MAP) / 1024))


if __name__ == "__main__":
    main()

