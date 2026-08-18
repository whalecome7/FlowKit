import { create } from 'zustand';
import type { TriggerRule, ExecutionLog } from '../types';
import { RuleStorage } from '../services/RuleStorage';
import { RuleEngine } from '../services/RuleEngine';
import { ActionExecutor } from '../services/ActionExecutor';
import { useSmsLogStore } from '../services/SmsLogStore';
import { syncRulesToNative, type NativeHandledInfo } from '../services/SmsBridge';
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
  duplicateRule: (id: string) => Promise<void>;
  loadLogs: () => Promise<void>;
  processSms: (
    sender: string,
    body: string,
    nativeInfo?: NativeHandledInfo,
  ) => Promise<void>;
}

export const useTriggerStore = create<TriggerState>((set, get) => ({
  rules: [],
  logs: [],
  loading: false,

  async loadRules() {
    const rules = await RuleStorage.loadRules();
    set({ rules });
    syncRulesToNative();
  },

  async addRule(input) {
    const newRule: TriggerRule = {
      ...input,
      id: generateId(),
      createdAt: Date.now(),
      // 未设置时间窗口时默认 08:00-22:00（用户显式设置则保留）
      timeWindow: input.timeWindow ?? { enabled: true, start: '08:00', end: '22:00' },
    };
    const rules = [...get().rules, newRule];
    await RuleStorage.saveRules(rules);
    set({ rules });
    syncRulesToNative();
  },

  async updateRule(id, updates) {
    const rules = get().rules.map((r) =>
      r.id === id ? { ...r, ...updates } : r,
    );
    await RuleStorage.saveRules(rules);
    set({ rules });
    syncRulesToNative();
  },

  async deleteRule(id) {
    const rules = get().rules.filter((r) => r.id !== id);
    await RuleStorage.saveRules(rules);
    set({ rules });
    syncRulesToNative();
  },

  async toggleRule(id) {
    const rules = get().rules.map((r) =>
      r.id === id ? { ...r, enabled: !r.enabled } : r,
    );
    await RuleStorage.saveRules(rules);
    set({ rules });
    syncRulesToNative();
  },

  async duplicateRule(id) {
    const rule = get().rules.find((r) => r.id === id);
    if (!rule) return;
    const copy: TriggerRule = {
      ...rule,
      id: generateId(),
      name: `${rule.name} 副本`,
      createdAt: Date.now(),
    };
    const rules = [...get().rules, copy];
    await RuleStorage.saveRules(rules);
    set({ rules });
  },

  async loadLogs() {
    const logs = await RuleStorage.loadLogs<ExecutionLog>();
    set({ logs });
  },

  async processSms(sender, body, nativeInfo) {
    const { rules } = get();
    // 若内存无日志（如进程刚启动），先从存储加载，避免覆盖历史
    if (get().logs.length === 0) {
      await get().loadLogs();
    }
    const { logs } = get();

    // 记录短信记录（无论是否命中）
    const matches = nativeInfo
      ? []
      : RuleEngine.compare({ sender, body }, rules);
    const matchedRuleNames = nativeInfo
      ? [nativeInfo.ruleName]
      : matches.map((m) => m.rule.name);
    await useSmsLogStore.getState().add({
      id: generateId(),
      sender,
      body,
      receivedAt: Date.now(),
      matchedRuleNames,
    });

    if (nativeInfo) {
      // 原生闭环已执行动作：仅记录触发日志（不重复执行）
      const nativeLog: ExecutionLog = {
        id: generateId(),
        ruleId: 'native',
        ruleName: nativeInfo.ruleName,
        smsSender: sender,
        smsBody: body,
        triggeredAt: Date.now(),
        actions: nativeInfo.actionResults.map((a) => ({
          type: a.type,
          success: a.success,
        })),
      };
      const updatedLogs = [...logs, nativeLog];
      // 只传新增日志（saveLogs 内部会读存储合并，避免历史重复累积）
      await RuleStorage.saveLogs([nativeLog]);
      set({ logs: updatedLogs });
      return;
    }

    if (matches.length > 0) {
      const newLogs = await ActionExecutor.execute(matches, { sender, body });
      const updatedLogs = [...logs, ...newLogs];
      // 只传新增日志（saveLogs 内部会读存储合并，避免历史重复累积）
      await RuleStorage.saveLogs(newLogs);
      set({ logs: updatedLogs });
    }
  },
}));
