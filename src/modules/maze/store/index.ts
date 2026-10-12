import { create } from 'zustand';
import { TRAIL_STYLES } from '../constants';
import type { BestRecord, GamePhase, HistoryRecord, MazeDifficulty, TrailStyle } from '../types';

interface MazeState {
  difficulty: MazeDifficulty;
  seed: number;
  phase: GamePhase;
  steps: number;
  /** 首次推杆的时间戳（0 = 未开始） */
  startedAt: number;
  /** 通关定格用时 */
  elapsedMs: number;
  best: Partial<Record<MazeDifficulty, BestRecord>>;
  history: HistoryRecord[];
  trailStyle: TrailStyle;
  setDifficulty: (d: MazeDifficulty) => void;
  setSeed: (s: number) => void;
  startGame: (at: number) => void;
  addStep: () => void;
  winGame: (elapsedMs: number) => void;
  resetGame: () => void;
  setBest: (best: Partial<Record<MazeDifficulty, BestRecord>>) => void;
  setHistory: (h: HistoryRecord[]) => void;
  cycleTrailStyle: () => void;
  setTrailStyle: (s: TrailStyle) => void;
}

export const useMazeStore = create<MazeState>()((set) => ({
  difficulty: 'easy',
  seed: 1000000,
  phase: 'ready',
  steps: 0,
  startedAt: 0,
  elapsedMs: 0,
  best: {},
  history: [],
  trailStyle: 'rainbow',
  setDifficulty: (difficulty) => set({ difficulty }),
  setSeed: (seed) => set({ seed }),
  startGame: (at) => set({ phase: 'playing', startedAt: at }),
  addStep: () => set((s) => ({ steps: s.steps + 1 })),
  winGame: (elapsedMs) => set({ phase: 'won', elapsedMs }),
  resetGame: () => set({ phase: 'ready', steps: 0, startedAt: 0, elapsedMs: 0 }),
  setBest: (best) => set({ best }),
  setHistory: (history) => set({ history }),
  cycleTrailStyle: () =>
    set((s) => ({
      trailStyle: TRAIL_STYLES[(TRAIL_STYLES.indexOf(s.trailStyle) + 1) % TRAIL_STYLES.length],
    })),
  setTrailStyle: (trailStyle) => set({ trailStyle }),
}));
