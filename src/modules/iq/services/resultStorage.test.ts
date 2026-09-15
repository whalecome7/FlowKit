import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearResults, loadResults, removeResult, saveResult } from './resultStorage';
import type { TestResult } from '../types';

// async-storage v3 官方 mock 入口为 /jest
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

function mkResult(id: string): TestResult {
  return {
    id,
    mode: 'pro',
    ageBand: 'adult',
    createdAt: 1,
    durationMs: 1000,
    report: {
      kind: 'pro',
      dimensionIndices: { fluid: 100, verbal: 100, memory: 100, speed: 100 },
      total: { estimate: 100, iqLow: 93, iqHigh: 108, percentile: 50 },
    },
  };
}

describe('resultStorage', () => {
  it('空存储返回空数组', async () => {
    expect(await loadResults()).toEqual([]);
  });

  it('新增置顶', async () => {
    await saveResult(mkResult('a'));
    const list = await saveResult(mkResult('b'));
    expect(list.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('超过 100 条淘汰最旧', async () => {
    for (let i = 0; i < 101; i++) await saveResult(mkResult(`r${i}`));
    const list = await loadResults();
    expect(list).toHaveLength(100);
    expect(list.some((r) => r.id === 'r0')).toBe(false);
    expect(list[0].id).toBe('r100');
  });

  it('删除单条', async () => {
    await saveResult(mkResult('a'));
    expect(await removeResult('a')).toEqual([]);
  });

  it('清空', async () => {
    await saveResult(mkResult('a'));
    await clearResults();
    expect(await loadResults()).toEqual([]);
  });

  it('损坏数据容错：返回空数组或过滤非法项', async () => {
    await AsyncStorage.setItem('@flowkit:iq:results', '{bad json');
    expect(await loadResults()).toEqual([]);
    await AsyncStorage.setItem('@flowkit:iq:results', JSON.stringify([{ bad: true }]));
    expect(await loadResults()).toEqual([]);
    await AsyncStorage.setItem('@flowkit:iq:results', JSON.stringify([mkResult('ok'), { bad: true }]));
    expect((await loadResults()).map((r) => r.id)).toEqual(['ok']);
  });
});
