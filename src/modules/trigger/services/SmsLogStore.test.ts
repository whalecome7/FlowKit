/**
 * SmsLogStore 记录写入的并发行为回归测试。
 * 背景：SmsBridge 事件监听器 fire-and-forget 调用 processSms，补记队列、
 * 实时事件与记录页加载会交错；此前"读-改-写"非原子导致记录被覆盖丢失。
 * 用受控 AsyncStorage + 自动泵驱动，验证队列修复后的合并语义。
 */
import { useSmsLogStore } from './SmsLogStore';
import type { SmsRecord } from '../types';

const KEY = '@flowkit:trigger:sms-log';

type PendingGet = { key: string; resolve: (v: string | null) => void };
type PendingSet = { key: string; value: string; resolve: () => void };

// jest.mock 工厂只能引用 mock 前缀的外部变量
const mockMem: Record<string, string> = {};
const mockPendingGets: PendingGet[] = [];
const mockPendingSets: PendingSet[] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (key: string) =>
      new Promise<string | null>((resolve) => {
        mockPendingGets.push({ key, resolve });
      }),
    setItem: (key: string, value: string) =>
      new Promise<void>((resolve) => {
        mockPendingSets.push({
          key,
          value,
          resolve: () => {
            mockMem[key] = value;
            resolve();
          },
        });
      }),
  },
}));

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** 自动泵：驱动队列任务与挂起的 IO 依次完成（固定轮数，覆盖所有任务） */
async function pump(rounds = 50): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    if (mockPendingGets.length > 0) {
      const g = mockPendingGets.shift()!;
      g.resolve(mockMem[g.key] ?? null);
    }
    if (mockPendingSets.length > 0) {
      mockPendingSets.shift()!.resolve();
    }
    await tick();
  }
}

function storedIds(): string[] {
  const raw = mockMem[KEY];
  return raw ? (JSON.parse(raw) as { id: string }[]).map((r) => r.id) : [];
}
function rec(id: string): SmsRecord {
  return { id, sender: '10086', body: id, receivedAt: 0, matchedRuleNames: [] };
}

beforeEach(() => {
  delete mockMem[KEY];
  mockPendingGets.length = 0;
  mockPendingSets.length = 0;
  useSmsLogStore.setState({ records: [], loaded: false });
});

describe('SmsLogStore 并发写入', () => {
  it('两个事件并发 add：两条记录都保留', async () => {
    mockMem[KEY] = JSON.stringify([rec('H')]);
    const p = useSmsLogStore.getState().load();
    await pump();
    await p;

    // 两个事件几乎同时到达（监听器不等待前一个完成）
    void useSmsLogStore.getState().add(rec('A'));
    void useSmsLogStore.getState().add(rec('B'));
    await pump();

    expect(storedIds()).toEqual(['H', 'A', 'B']);
  });

  it('补记 add 与记录页 load 并发：记录与历史都保留', async () => {
    mockMem[KEY] = JSON.stringify([rec('H')]);

    // 冷启动：补记 N（历史未加载）与用户进入记录页 load() 并发发起
    void useSmsLogStore.getState().add(rec('N'));
    void useSmsLogStore.getState().load();
    await pump();

    expect(storedIds()).toEqual(['H', 'N']);
    expect(useSmsLogStore.getState().records.map((r) => r.id)).toEqual(['H', 'N']);
  });

  it('历史未加载时 add：先合并历史而非覆盖', async () => {
    mockMem[KEY] = JSON.stringify([rec('H1'), rec('H2')]);

    void useSmsLogStore.getState().add(rec('N'));
    await pump();

    expect(storedIds()).toEqual(['H1', 'H2', 'N']);
  });
});
