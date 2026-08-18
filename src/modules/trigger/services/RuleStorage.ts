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
      const list = JSON.parse(raw) as T[];
      // 一次性迁移：按「短信内容 + 60 秒窗口」去重（清理历史重复累积的日志）
      const seen = new Map<string, number>();
      const deduped = list.filter((l) => {
        const item = l as {
          smsSender?: string;
          smsBody?: string;
          triggeredAt?: number;
        };
        const key = `${item.smsSender ?? ''}|${item.smsBody ?? ''}`;
        const last = seen.get(key);
        const ts = item.triggeredAt ?? 0;
        if (last !== undefined && ts - last < 60_000) return false;
        seen.set(key, ts);
        return true;
      });
      if (deduped.length !== list.length) {
        await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(deduped));
      }
      return deduped;
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
