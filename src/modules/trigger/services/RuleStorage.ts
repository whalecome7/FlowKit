import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TriggerRule } from '../types';

const RULES_KEY = '@flowkit:trigger:rules';
const LOGS_KEY = '@flowkit:trigger:logs';

/** 规则持久化存储 */
export const RuleStorage = {
  async loadRules(): Promise<TriggerRule[]> {
    const raw = await AsyncStorage.getItem(RULES_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as TriggerRule[];
    } catch {
      return [];
    }
  },

  async saveRules(rules: TriggerRule[]): Promise<void> {
    await AsyncStorage.setItem(RULES_KEY, JSON.stringify(rules));
  },

  async loadLogs<T>(): Promise<T[]> {
    const raw = await AsyncStorage.getItem(LOGS_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as T[];
    } catch {
      return [];
    }
  },

  async saveLogs<T>(logs: T[]): Promise<void> {
    // 从存储读现有日志再合并（避免进程内 state 为空时覆盖历史）
    const existing = await this.loadLogs<T>();
    const merged = [...existing, ...logs];
    const trimmed = merged.slice(-2000); // 上限提到 2000 条
    await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(trimmed));
  },
};
