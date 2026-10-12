import AsyncStorage from '@react-native-async-storage/async-storage';
import { HISTORY_LIMIT, STORAGE_BEST, STORAGE_HISTORY } from '../constants';
import type { BestRecord, HistoryRecord, MazeDifficulty } from '../types';

export type BestMap = Partial<Record<MazeDifficulty, BestRecord>>;

export async function loadBest(): Promise<BestMap> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_BEST);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as BestMap;
  } catch {
    return {};
  }
}

/** 仅当更快时覆盖；返回是否刷新了记录 */
export async function upsertBest(difficulty: MazeDifficulty, rec: BestRecord): Promise<boolean> {
  const best = await loadBest();
  const prev = best[difficulty];
  if (prev && prev.timeMs <= rec.timeMs) return false;
  best[difficulty] = rec;
  await AsyncStorage.setItem(STORAGE_BEST, JSON.stringify(best));
  return true;
}

function isHistoryRecord(v: unknown): v is HistoryRecord {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.difficulty === 'string' &&
    typeof o.seed === 'number' &&
    typeof o.timeMs === 'number' &&
    typeof o.steps === 'number' &&
    typeof o.at === 'number' &&
    typeof o.trail === 'string'
  );
}

export async function loadMazeHistory(): Promise<HistoryRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_HISTORY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryRecord);
  } catch {
    return [];
  }
}

/** 新增一条（置顶），返回更新后的列表 */
export async function addHistoryRecord(rec: HistoryRecord): Promise<HistoryRecord[]> {
  const list = await loadMazeHistory();
  const next = [rec, ...list].slice(0, HISTORY_LIMIT);
  await AsyncStorage.setItem(STORAGE_HISTORY, JSON.stringify(next));
  return next;
}

export async function removeHistoryRecord(at: number): Promise<HistoryRecord[]> {
  const next = (await loadMazeHistory()).filter((r) => r.at !== at);
  await AsyncStorage.setItem(STORAGE_HISTORY, JSON.stringify(next));
  return next;
}

export async function clearMazeHistory(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_HISTORY);
}
