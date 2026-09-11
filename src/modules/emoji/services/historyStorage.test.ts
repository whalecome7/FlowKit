import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadHistory, addHistory, removeHistory, clearHistory } from './historyStorage';

// async-storage v3 官方 mock 入口为 /jest（v1/v2 时代的 jest/async-storage-mock 路径已移除）
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('historyStorage', () => {
  it('空存储返回空数组', async () => {
    expect(await loadHistory()).toEqual([]);
  });

  it('新增置顶，同文本去重', async () => {
    await addHistory('青梅竹马');
    await addHistory('七嘴八舌');
    const list = await addHistory('青梅竹马');
    expect(list).toHaveLength(2);
    expect(list[0].text).toBe('青梅竹马');
    expect(list[1].text).toBe('七嘴八舌');
  });

  it('超过 100 条淘汰最旧', async () => {
    for (let i = 0; i < 101; i++) {
      await addHistory(`文本${i}`);
    }
    const list = await loadHistory();
    expect(list).toHaveLength(100);
    expect(list.some((i) => i.text === '文本0')).toBe(false);
    expect(list[0].text).toBe('文本100');
  });

  it('删除单条', async () => {
    const list = await addHistory('测试');
    const after = await removeHistory(list[0].id);
    expect(after).toEqual([]);
  });

  it('清空', async () => {
    await addHistory('测试');
    await clearHistory();
    expect(await loadHistory()).toEqual([]);
  });

  it('损坏数据容错：返回空数组', async () => {
    await AsyncStorage.setItem('@flowkit:emoji:history', '{bad json');
    expect(await loadHistory()).toEqual([]);
    await AsyncStorage.setItem('@flowkit:emoji:history', JSON.stringify([{ bad: true }]));
    expect(await loadHistory()).toEqual([]);
  });
});
