import { create } from 'zustand';
import { translate, nextPick } from '../services/translator';
import * as historyStorage from '../services/historyStorage';
import { MAX_INPUT_LENGTH } from '../types';
import type { Token, RenderMode, HistoryItem } from '../types';

interface EmojiState {
  input: string;
  tokens: Token[];
  /** 精确版各字位的手动选择索引（与 tokens 等长；undefined = 默认） */
  picksExact: (number | undefined)[];
  /** 纯 emoji 版各字位的手动选择索引 */
  picksEmoji: (number | undefined)[];
  mode: RenderMode;
  history: HistoryItem[];

  setInput: (text: string) => void;
  setMode: (mode: RenderMode) => void;
  generate: () => void;
  cycleCandidate: (tokenIndex: number) => void;
  loadHistory: () => Promise<void>;
  removeHistory: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  applyHistory: (text: string) => void;
}

export const useEmojiStore = create<EmojiState>((set, get) => ({
  input: '',
  tokens: [],
  picksExact: [],
  picksEmoji: [],
  mode: 'exact',
  history: [],

  setInput(text) {
    set({ input: text });
  },

  setMode(mode) {
    set({ mode });
  },

  generate() {
    const text = get().input.trim();
    if (!text || text.length > MAX_INPUT_LENGTH) return;
    const tokens = translate(text);
    set({ tokens, picksExact: [], picksEmoji: [] });
    // 注：快速连续生成存在低概率的 RMW 竞态（历史可能丢一条），一期接受
    historyStorage
      .addHistory(text)
      .then((history) => set({ history }))
      .catch(() => console.warn('emoji: 历史保存失败'));
  },

  cycleCandidate(tokenIndex) {
    const { tokens, mode, picksExact, picksEmoji } = get();
    const token = tokens[tokenIndex];
    if (!token || token.candidates.length === 0) return;
    if (mode === 'exact') {
      const picks = [...picksExact];
      picks[tokenIndex] = nextPick(token, mode, picks[tokenIndex]);
      set({ picksExact: picks });
    } else {
      const picks = [...picksEmoji];
      picks[tokenIndex] = nextPick(token, mode, picks[tokenIndex]);
      set({ picksEmoji: picks });
    }
  },

  async loadHistory() {
    set({ history: await historyStorage.loadHistory() });
  },

  async removeHistory(id) {
    try {
      set({ history: await historyStorage.removeHistory(id) });
    } catch {
      console.warn('emoji: 删除历史失败');
    }
  },

  async clearHistory() {
    try {
      await historyStorage.clearHistory();
    } catch {
      console.warn('emoji: 清空历史失败');
    }
    set({ history: [] });
  },

  applyHistory(text) {
    set({ input: text });
    get().generate();
  },
}));
