import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadBest,
  upsertBest,
  loadMazeHistory,
  addHistoryRecord,
  removeHistoryRecord,
  clearMazeHistory,
} from './storage';
import { STORAGE_HISTORY, HISTORY_LIMIT } from '../constants';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('最佳成绩', () => {
  it('空存储返回空对象', async () => {
    expect(await loadBest()).toEqual({});
  });

  it('更快成绩刷新记录，更慢成绩不覆盖', async () => {
    await upsertBest('easy', { timeMs: 60000, steps: 100 });
    const refreshed = await upsertBest('easy', { timeMs: 50000, steps: 90 });
    expect(refreshed).toBe(true);
    const notRefreshed = await upsertBest('easy', { timeMs: 70000, steps: 120 });
    expect(notRefreshed).toBe(false);
    const best = await loadBest();
    expect(best.easy).toEqual({ timeMs: 50000, steps: 90 });
  });

  it('不同难度互不影响', async () => {
    await upsertBest('easy', { timeMs: 1, steps: 1 });
    await upsertBest('hell', { timeMs: 2, steps: 2 });
    const best = await loadBest();
    expect(best.easy?.timeMs).toBe(1);
    expect(best.hell?.timeMs).toBe(2);
  });
});

describe('历史记录', () => {
  const rec = (at: number) => ({
    difficulty: 'easy' as const,
    seed: 1234567,
    timeMs: 30000,
    steps: 40,
    at,
    trail: 'AAAA',
  });

  it('新增置顶（最近在前）', async () => {
    await addHistoryRecord(rec(1));
    const list = await addHistoryRecord(rec(2));
    expect(list).toHaveLength(2);
    expect(list[0].at).toBe(2);
  });

  it(`超过 ${HISTORY_LIMIT} 条淘汰最旧`, async () => {
    for (let i = 0; i <= HISTORY_LIMIT; i++) {
      await addHistoryRecord(rec(i));
    }
    const list = await loadMazeHistory();
    expect(list).toHaveLength(HISTORY_LIMIT);
    expect(list.some((r) => r.at === 0)).toBe(false);
  });

  it('按 at 删除单条', async () => {
    await addHistoryRecord(rec(1));
    await addHistoryRecord(rec(2));
    const after = await removeHistoryRecord(2);
    expect(after).toHaveLength(1);
    expect(after[0].at).toBe(1);
  });

  it('清空', async () => {
    await addHistoryRecord(rec(1));
    await clearMazeHistory();
    expect(await loadMazeHistory()).toEqual([]);
  });

  it('损坏数据容错：返回空数组', async () => {
    await AsyncStorage.setItem(STORAGE_HISTORY, '{bad json');
    expect(await loadMazeHistory()).toEqual([]);
  });

  it('脏条目被类型守卫过滤', async () => {
    await AsyncStorage.setItem(STORAGE_HISTORY, JSON.stringify([{ bad: true }, rec(3)]));
    const list = await loadMazeHistory();
    expect(list).toHaveLength(1);
    expect(list[0].at).toBe(3);
  });
});
