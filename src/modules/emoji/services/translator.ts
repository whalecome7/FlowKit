import syllablesData from '../data/syllables.json';
import phrasesData from '../data/phrases.json';
import { getSyllables } from './pinyin';
import type { Token, RenderMode, SyllableEntry, PhraseEntry } from '../types';

/** 词库（可注入：生产用默认字典，测试用自定义小字典） */
export interface Dictionary {
  syllables: Record<string, SyllableEntry>;
  phrases: Record<string, PhraseEntry>;
}

const defaultDict: Dictionary = {
  syllables: syllablesData as Record<string, SyllableEntry>,
  phrases: phrasesData as Record<string, PhraseEntry>,
};

const HANZI_RE = /^[\u4e00-\u9fff]$/;
const ZWJ = '\u200d';
const VS_RE = /[\uFE00-\uFE0F]/;
const MODIFIER_RE = /[\u{1F3FB}-\u{1F3FF}]/u;
const RI_RE = /[\u{1F1E6}-\u{1F1FF}]/u;
const TAG_RE = /[\u{E0020}-\u{E007F}]/u;
const KEYCAP = '\u20E3';

/** 按字素簇切分：合并 ZWJ 序列、变体选择符、肤色修饰符、键帽、国旗（RI 对）、标签序列 */
export function splitGraphemes(text: string): string[] {
  const result: string[] = [];
  let current = '';
  let joinNext = false;
  for (const ch of text) {
    if (current === '' || joinNext) {
      current += ch;
      joinNext = false;
    } else if (ch === ZWJ) {
      current += ch;
      joinNext = true;
    } else if (VS_RE.test(ch) || MODIFIER_RE.test(ch) || TAG_RE.test(ch) || ch === KEYCAP) {
      current += ch;
    } else if (RI_RE.test(ch) && RI_RE.test(current) && [...current].length === 1) {
      // 国旗：两个连续的区域指示符合为一簇
      current += ch;
    } else {
      result.push(current);
      current = ch;
    }
  }
  if (current !== '') result.push(current);
  return result;
}

/** 构建单个字位的 Token：短语编排优先，其后接音节表候选（去重） */
function buildToken(
  char: string,
  syllable: string | undefined,
  phraseEmoji: string | undefined,
  dict: Dictionary,
): Token {
  const entry = syllable ? dict.syllables[syllable] : undefined;
  const exact = entry?.exact.map((c) => c.emoji) ?? [];
  const similar = entry?.similar.map((c) => c.emoji) ?? [];

  if (phraseEmoji !== undefined) {
    const exactRest = exact.filter((e) => e !== phraseEmoji);
    const similarRest = similar.filter((e) => e !== phraseEmoji);
    return {
      char,
      type: 'hanzi',
      candidates: [phraseEmoji, ...exactRest, ...similarRest],
      exactCount: 1 + exactRest.length,
    };
  }

  return {
    char,
    type: 'hanzi',
    candidates: [...exact, ...similar],
    exactCount: exact.length,
  };
}

/** 转化：短语库最长匹配优先，其余汉字逐字查音节表，非汉字原样保留 */
export function translate(text: string, dict: Dictionary = defaultDict): Token[] {
  // 统一换行（粘贴文本可能含 \r\n），保证 \r 不成为散字素
  const normalized = text.replace(/\r\n?/g, '\n');
  const graphemes = splitGraphemes(normalized);
  const syllablesList = getSyllables(normalized);

  // 防御：pinyin-pro 字库外的极少数基本区汉字（实测 49 个，如「龥」U+9FA5）不返回音节，
  // 以及「〇/々」等 pinyin 认识但 HANZI_RE 不认的字符，都会造成音节数与汉字数不一致；
  // 不一致时改为逐字取音，避免后续字全部错位。
  // 注：逐字模式拿不到多音字上下文（取最常见读音），属有意接受的降级；用缓存避免重复查询
  const hanziCount = graphemes.reduce((n, g) => (HANZI_RE.test(g) ? n + 1 : n), 0);
  const aligned = syllablesList.length === hanziCount;
  const fallbackCache = new Map<string, string | undefined>();
  const fallbackSyllable = (c: string): string | undefined => {
    if (!fallbackCache.has(c)) fallbackCache.set(c, getSyllables(c)[0]);
    return fallbackCache.get(c);
  };

  const maxPhraseLen = Object.keys(dict.phrases).reduce(
    (max, p) => Math.max(max, Array.from(p).length),
    0,
  );

  const tokens: Token[] = [];
  let si = 0; // 音节数组游标（与汉字一一对应）
  let i = 0;

  while (i < graphemes.length) {
    const char = graphemes[i];

    if (!HANZI_RE.test(char)) {
      tokens.push({ char, type: 'other', candidates: [], exactCount: 0 });
      i += 1;
      continue;
    }

    // 短语最长匹配
    let phraseHit: string[] | null = null;
    let phraseLen = 0;
    const maxTry = Math.min(maxPhraseLen, graphemes.length - i);
    for (let len = maxTry; len >= 2; len--) {
      const key = graphemes.slice(i, i + len).join('');
      const entry = dict.phrases[key];
      if (entry && entry.length === len) {
        phraseHit = entry;
        phraseLen = len;
        break;
      }
    }

    if (phraseHit) {
      for (let j = 0; j < phraseLen; j++) {
        const syllable = aligned
          ? syllablesList[si + j]
          : fallbackSyllable(graphemes[i + j]);
        tokens.push(buildToken(graphemes[i + j], syllable, phraseHit[j], dict));
      }
      si += phraseLen;
      i += phraseLen;
      continue;
    }

    const syllable = aligned ? syllablesList[si] : fallbackSyllable(char);
    tokens.push(buildToken(char, syllable, undefined, dict));
    si += 1;
    i += 1;
  }

  return tokens;
}

/** 单个字位的显示：pick 为手动选择索引（undefined/越界/非整数 = 默认） */
export function displayChar(token: Token, mode: RenderMode, pick?: number): string {
  if (token.type === 'other') return token.char;
  if (pick != null && Number.isInteger(pick) && pick >= 0 && pick < token.candidates.length) {
    return token.candidates[pick];
  }
  if (mode === 'emoji') {
    return token.candidates.length > 0 ? token.candidates[0] : '❓';
  }
  return token.exactCount > 0 ? token.candidates[0] : token.char;
}

/** 整段渲染：picks 为每字位的手动选择索引数组（可为空） */
export function renderTokens(
  tokens: Token[],
  mode: RenderMode,
  picks: (number | undefined)[] = [],
): string {
  return tokens.map((t, i) => displayChar(t, mode, picks[i])).join('');
}

/** 点按换候选：返回下一个选择索引（环绕；len === 0 时返回值无意义，调用方需忽略） */
export function nextPick(token: Token, mode: RenderMode, current: number | undefined): number {
  const len = token.candidates.length;
  if (len === 0) return 0;
  const shown =
    current != null ? current : mode === 'exact' ? (token.exactCount > 0 ? 0 : -1) : 0;
  return (((shown + 1) % len) + len) % len;
}
