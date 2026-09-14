import { create } from 'zustand';
import { translate, nextPick } from '../services/translator';
import * as historyStorage from '../services/historyStorage';
import { MAX_INPUT_LENGTH } from '../types';
import type { Token, RenderMode, HistoryItem } from '../types';

interface EmojiState {
  input: string;
  tokens: Token[];
  /** 精确版各字位的手动选择索引（按索引对应 tokens 字位；缺省/undefined = 默认） */
  picksExact: (number | undefined)[];
  /** 纯 emoji 版各字位的手动选择索引（同上） */
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
  /** 清空编辑态（输入/结果/候选选择），保留 mode 与 history */
  resetEditor: () => void;
  /** 重置候选为最初输出（仅清手动选择），不重新生成、不写历史 */
  resetPicks: () => void;
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
    // 注：快速连续生成或与清空/删除交错时存在低概率竞态（历史可能丢一条/复活），一期接受
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
      // 乐观清空：存储清理失败也重置本地列表（「清空」意图优先，一期接受旧数据可能「复活」）
      console.warn('emoji: 清空历史失败');
    }
    set({ history: [] });
  },

  resetEditor() {
    set({ input: '', tokens: [], picksExact: [], picksEmoji: [] });
  },

  resetPicks() {
    set({ picksExact: [], picksEmoji: [] });
  },

  applyHistory(text) {
    set({ input: text });
    get().generate();
  },
}));
