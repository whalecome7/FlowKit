import { create } from 'zustand';
import type { SmsRecord } from '../types';
import { SmsLogStorage } from './SmsLogStorage';

interface SmsLogState {
  records: SmsRecord[];
  /** 历史是否已从存储加载（未加载时 add 先合并，防止覆盖历史） */
  loaded: boolean;
  load: () => Promise<void>;
  add: (record: SmsRecord) => Promise<void>;
}

/**
 * 串行队列：load/add 必须顺序执行。
 * 补记队列、实时事件与记录页加载会并发调用，
 * "读-改-写"交错会导致记录被覆盖丢失。
 */
let queue: Promise<void> = Promise.resolve();
const enqueue = (task: () => Promise<void>): Promise<void> => {
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  return next;
};

export const useSmsLogStore = create<SmsLogState>((set, get) => ({
  records: [],
  loaded: false,

  async load() {
    return enqueue(async () => {
      const records = await SmsLogStorage.load();
      set({ records, loaded: true });
    });
  },

  async add(record) {
    return enqueue(async () => {
      if (!get().loaded) {
        set({ records: await SmsLogStorage.load(), loaded: true });
      }
      const records = [...get().records, record];
      await SmsLogStorage.save(records);
      set({ records });
    });
  },
}));
