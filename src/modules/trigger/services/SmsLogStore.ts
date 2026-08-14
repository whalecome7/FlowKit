import { create } from 'zustand';
import type { SmsRecord } from '../types';
import { SmsLogStorage } from './SmsLogStorage';

interface SmsLogState {
  records: SmsRecord[];
  load: () => Promise<void>;
  add: (record: SmsRecord) => Promise<void>;
}

export const useSmsLogStore = create<SmsLogState>((set, get) => ({
  records: [],
  async load() {
    const records = await SmsLogStorage.load();
    set({ records });
  },
  async add(record) {
    const records = [...get().records, record];
    await SmsLogStorage.save(records);
    set({ records });
  },
}));
