import { useEmojiStore } from './index';
import * as historyStorage from '../services/historyStorage';

jest.mock('../services/historyStorage', () => ({
  loadHistory: jest.fn().mockResolvedValue([]),
  addHistory: jest.fn().mockResolvedValue([]),
  removeHistory: jest.fn().mockResolvedValue([]),
  clearHistory: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  useEmojiStore.setState({
    input: '',
    tokens: [],
    picksExact: [],
    picksEmoji: [],
    mode: 'exact',
    history: [],
  });
});

describe('useEmojiStore', () => {
  it('generate：转化当前输入并清空手动选择', () => {
    useEmojiStore.getState().setInput('青梅竹马');
    useEmojiStore.getState().generate();
    const s = useEmojiStore.getState();
    expect(s.tokens).toHaveLength(4);
    expect(s.picksExact).toEqual([]);
    expect(s.picksEmoji).toEqual([]);
  });

  it('generate：空白输入不生成', () => {
    useEmojiStore.getState().setInput('   ');
    useEmojiStore.getState().generate();
    expect(useEmojiStore.getState().tokens).toEqual([]);
  });

  it('cycleCandidate：精确版与纯 emoji 版选择相互独立', () => {
    // 依赖生产数据：「马」有 2 个精确候选（🐴/👩），默认从第 0 个切到第 1 个
    useEmojiStore.getState().setInput('马');
    useEmojiStore.getState().generate();
    useEmojiStore.getState().cycleCandidate(0);
    expect(useEmojiStore.getState().picksExact[0]).toBe(1);
    expect(useEmojiStore.getState().picksEmoji[0]).toBeUndefined();

    useEmojiStore.getState().setMode('emoji');
    useEmojiStore.getState().cycleCandidate(0);
    expect(useEmojiStore.getState().picksEmoji[0]).toBe(1);
    expect(useEmojiStore.getState().picksExact[0]).toBe(1);
  });

  it('cycleCandidate：无候选的字位不产生选择', () => {
    // 「嗲」→ dia。生产音节表通常无该音节候选；
    // 若 Task 4 生成的数据中 dia 恰有候选，改用其他空条目音节（对照 /tmp/syllables.txt 与 syllables.json 找空条目）
    useEmojiStore.getState().setInput('嗲');
    useEmojiStore.getState().generate();
    useEmojiStore.getState().cycleCandidate(0);
    expect(useEmojiStore.getState().picksExact[0]).toBeUndefined();
  });

  it('applyHistory：回填并生成', () => {
    useEmojiStore.getState().applyHistory('七嘴八舌');
    const s = useEmojiStore.getState();
    expect(s.input).toBe('七嘴八舌');
    expect(s.tokens).toHaveLength(4);
  });

  it('generate：重新生成会清空已有的手动选择', () => {
    useEmojiStore.getState().setInput('马');
    useEmojiStore.getState().generate();
    useEmojiStore.getState().cycleCandidate(0);
    expect(useEmojiStore.getState().picksExact[0]).toBe(1);

    useEmojiStore.getState().setInput('七嘴八舌');
    useEmojiStore.getState().generate();
    expect(useEmojiStore.getState().picksExact).toEqual([]);
    expect(useEmojiStore.getState().picksEmoji).toEqual([]);
  });

  it('removeHistory：存储失败时状态保持不变', async () => {
    const item = { id: 'a', text: 'x', createdAt: 1 };
    useEmojiStore.setState({ history: [item] });
    (historyStorage.removeHistory as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    await useEmojiStore.getState().removeHistory('a');
    expect(useEmojiStore.getState().history).toEqual([item]);
  });

  it('clearHistory：存储失败仍重置本地列表（乐观清空）', async () => {
    useEmojiStore.setState({ history: [{ id: 'a', text: 'x', createdAt: 1 }] });
    (historyStorage.clearHistory as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    await useEmojiStore.getState().clearHistory();
    expect(useEmojiStore.getState().history).toEqual([]);
  });
});
