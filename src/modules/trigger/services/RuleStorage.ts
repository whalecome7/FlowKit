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
    // 保留最近 200 条
    const trimmed = logs.slice(-200);
    await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(trimmed));
  },
};
