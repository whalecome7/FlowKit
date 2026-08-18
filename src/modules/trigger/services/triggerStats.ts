import type { ExecutionLog } from '../types';

export const DAILY_KEYS = ['一', '二', '三', '四', '五', '六', '日'];

export interface RuleCount {
  name: string;
  count: number;
}

export interface StatsResult {
  total: number;
  last30Days: number;
  successRate: number;
  daily: { key: string; count: number }[];
  byRule: RuleCount[];
}

/** 从触发日志聚合统计（纯函数） */
export function computeStats(logs: ExecutionLog[], now: number = Date.now()): StatsResult {
  const total = logs.length;
  const last30Days = logs.filter((l) => now - l.triggeredAt <= 30 * 24 * 3600 * 1000).length;

  // 动作成功率：成功动作数 / 总动作数；无动作的触发按成功计 1
  let actionTotal = 0;
  let actionOk = 0;
  for (const l of logs) {
    if (l.actions.length === 0) {
      actionTotal += 1;
      actionOk += 1;
    } else {
      actionTotal += l.actions.length;
      actionOk += l.actions.filter((a) => a.success).length;
    }
  }
  const successRate = actionTotal === 0 ? 1 : actionOk / actionTotal;

  // 近 7 天分布（今天为 daily[0]）
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startTs = startOfToday.getTime();
  const daily = DAILY_KEYS.map((key, i) => {
    const dayStart = startTs - i * 24 * 3600 * 1000;
    const dayEnd = dayStart + 24 * 3600 * 1000;
    return {
      key,
      count: logs.filter((l) => l.triggeredAt >= dayStart && l.triggeredAt < dayEnd).length,
    };
  });

  // 按规则排行（降序）
  const ruleMap = new Map<string, number>();
  for (const l of logs) {
    ruleMap.set(l.ruleName, (ruleMap.get(l.ruleName) ?? 0) + 1);
  }
  const byRule = [...ruleMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return { total, last30Days, successRate, daily, byRule };
}
