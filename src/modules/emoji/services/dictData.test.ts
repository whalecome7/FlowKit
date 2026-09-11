import syllables from '../data/syllables.json';
import phrases from '../data/phrases.json';
import { getSyllables } from './pinyin';
import type { SyllableEntry } from '../types';

// 单个 emoji：Extended_Pictographic（每个组件后可跟变体选择符/肤色修饰符，支持 ZWJ 链），
// 或数字/符号键帽序列（如 8️⃣ = '8' + FE0F + 20E3）
const EMOJI_RE =
  /^\p{Extended_Pictographic}[\uFE0F\p{Emoji_Modifier}]*(\u200d\p{Extended_Pictographic}[\uFE0F\p{Emoji_Modifier}]*)*$|^[0-9#*]\uFE0F?\u20E3$/u;
// 汉字（基本区；扩展区字不在转换范围）
const HANZI_RE = /^[\u4e00-\u9fff]+$/;
const SYLLABLE_RE = /^[a-zü]+$/;

const entries = Object.entries(syllables) as [string, SyllableEntry][];

describe('音节表结构', () => {
  it('音节键为合法无调拼音', () => {
    for (const [key] of entries) {
      expect(key).toMatch(SYLLABLE_RE);
    }
  });

  it('候选 emoji 合法、label 非空、同音节内无重复', () => {
    for (const [, entry] of entries) {
      expect(Array.isArray(entry.exact)).toBe(true);
      expect(Array.isArray(entry.similar)).toBe(true);
      const all = [...entry.exact, ...entry.similar];
      for (const c of all) {
        expect(EMOJI_RE.test(c.emoji)).toBe(true);
        expect(c.label.length).toBeGreaterThan(0);
      }
      const emojis = all.map((c) => c.emoji);
      expect(new Set(emojis).size).toBe(emojis.length);
    }
  });

  it('精确候选非空的音节占比 ≥ 95%', () => {
    const withExact = entries.filter(([, e]) => e.exact.length > 0).length;
    expect(withExact / entries.length).toBeGreaterThanOrEqual(0.95);
  });
});

describe('短语库结构', () => {
  const phraseEntries = Object.entries(phrases) as [string, string[]][];

  it('文本为纯汉字，emoji 数组与文字逐字对应', () => {
    for (const [text, emojis] of phraseEntries) {
      expect(text).toMatch(HANZI_RE);
      expect(Array.isArray(emojis)).toBe(true);
      expect(emojis).toHaveLength(Array.from(text).length);
      for (const e of emojis) {
        expect(EMOJI_RE.test(e)).toBe(true);
      }
    }
  });

  it('短语包含的汉字在音节表中都有键', () => {
    for (const [text] of phraseEntries) {
      for (const syllable of getSyllables(text)) {
        expect(syllables).toHaveProperty(syllable);
      }
    }
  });

  it('短语 emoji 与对应音节候选不得在 VS16 归一化后重复', () => {
    const stripVS = (s: string) => s.replace(/\uFE0F/g, '');
    const conflicts: string[] = [];
    for (const [text, emojis] of phraseEntries) {
      const syllablesOfText = getSyllables(text);
      emojis.forEach((e, i) => {
        const entry = (syllables as Record<string, SyllableEntry>)[
          syllablesOfText[i]
        ];
        if (!entry) return;
        for (const c of [...entry.exact, ...entry.similar]) {
          if (c.emoji !== e && stripVS(c.emoji) === stripVS(e)) {
            conflicts.push(`${text}[${i}] ${c.emoji} ≈ ${e}`);
          }
        }
      });
    }
    expect(conflicts).toEqual([]);
  });
});
