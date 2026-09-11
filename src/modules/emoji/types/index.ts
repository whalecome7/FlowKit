/** 单个 emoji 候选 */
export interface EmojiCandidate {
  emoji: string;
  /** 所选谐音/意象字或理由（仅数据维护参考，运行时不使用） */
  label: string;
}

/** 音节表条目（键为无调拼音，ü 写作 lü/nü/lüe） */
export interface SyllableEntry {
  /** 精确（同音）候选，有序，第一个为默认；可为空数组（冷门音节无合适 emoji） */
  exact: EmojiCandidate[];
  /** 近似音候选（平翘舌/前后鼻音/n-l/f-h 等口音变体），纯 emoji 版兜底用 */
  similar: EmojiCandidate[];
}

/** 短语库：emoji 数组与文字逐字对应（长度等于字符数） */
export type PhraseEntry = string[];

/** 转化结果中的单个字符位 */
export interface Token {
  char: string;
  type: 'hanzi' | 'other';
  /** 候选 emoji，精确在前近似在后；空数组表示无候选（走降级） */
  candidates: string[];
  /** candidates 中前 exactCount 个为精确候选（短语编排计为 1 个精确候选） */
  exactCount: number;
}

export type RenderMode = 'exact' | 'emoji';

/** 生成历史 */
export interface HistoryItem {
  id: string;
  text: string;
  createdAt: number;
}

/** 输入长度上限（超出不生成） */
export const MAX_INPUT_LENGTH = 200;
