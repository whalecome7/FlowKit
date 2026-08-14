import { create } from 'zustand';
import type { TriggerRule, ExecutionLog } from '../types';
import { RuleStorage } from '../services/RuleStorage';
import { RuleEngine } from '../services/RuleEngine';
import { ActionExecutor } from '../services/ActionExecutor';
import { useSmsLogStore } from '../services/SmsLogStore';
import { generateId } from '../../../shared/types';

interface TriggerState {
  rules: TriggerRule[];
  logs: ExecutionLog[];
  loading: boolean;

  loadRules: () => Promise<void>;
  addRule: (rule: Omit<TriggerRule, 'id' | 'createdAt'>) => Promise<void>;
  updateRule: (id: string, updates: Partial<TriggerRule>) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  toggleRule: (id: string) => Promise<void>;
  loadLogs: () => Promise<void>;
  processSms: (sender: string, body: string) => Promise<void>;
}

export const useTriggerStore = create<TriggerState>((set, get) => ({
  rules: [],
  logs: [],
  loading: false,

  async loadRules() {
    const rules = await RuleStorage.loadRules();
    set({ rules });
  },

  async addRule(input) {
    const newRule: TriggerRule = {
      ...input,
      id: generateId(),
      createdAt: Date.now(),
    };
    const rules = [...get().rules, newRule];
    await RuleStorage.saveRules(rules);
    set({ rules });
  },

  async updateRule(id, updates) {
    const rules = get().rules.map((r) =>
      r.id === id ? { ...r, ...updates } : r,
    );
    await RuleStorage.saveRules(rules);
    set({ rules });
  },

  async deleteRule(id) {
    const rules = get().rules.filter((r) => r.id !== id);
    await RuleStorage.saveRules(rules);
    set({ rules });
  },

  async toggleRule(id) {
    const rules = get().rules.map((r) =>
      r.id === id ? { ...r, enabled: !r.enabled } : r,
    );
    await RuleStorage.saveRules(rules);
    set({ rules });
  },

  async loadLogs() {
    const logs = await RuleStorage.loadLogs<ExecutionLog>();
    set({ logs });
  },

  async processSms(sender, body) {
    const { rules } = get();
    // 若内存无日志（如进程刚启动），先从存储加载，避免覆盖历史
    if (get().logs.length === 0) {
      await get().loadLogs();
    }
    const { logs } = get();
    const matches = RuleEngine.compare({ sender, body }, rules);
    const matchedRuleNames = matches.map((m) => m.rule.name);
    await useSmsLogStore.getState().add({
      id: generateId(),
      sender,
      body,
      receivedAt: Date.now(),
      matchedRuleNames,
    });
    if (matches.length > 0) {
      const newLogs = await ActionExecutor.execute(matches, { sender, body });
      const updatedLogs = [...logs, ...newLogs];
      await RuleStorage.saveLogs(updatedLogs);
      set({ logs: updatedLogs });
    }
  },
}));
