import { computeStats, DAILY_KEYS } from './triggerStats';
import type { ExecutionLog } from '../types';

const now = Date.now();
const day = 24 * 3600 * 1000;

function makeLog(offsetMs: number, ruleName: string, actions: { type: string; success: boolean }[]): ExecutionLog {
  return {
    id: Math.random().toString(),
    ruleId: 'r',
    ruleName,
    smsSender: 'x',
    smsBody: 'y',
    triggeredAt: now - offsetMs,
    actions,
  };
}

describe('computeStats', () => {
  it('空日志返回零值', () => {
    const s = computeStats([], now);
    expect(s.total).toBe(0);
    expect(s.last30Days).toBe(0);
    expect(s.successRate).toBe(1);
    expect(s.byRule).toEqual([]);
  });

  it('统计总数与近30天', () => {
    const logs = [
      makeLog(1 * day, 'A', []),
      makeLog(10 * day, 'A', []),
      makeLog(40 * day, 'B', []),
    ];
    const s = computeStats(logs, now);
    expect(s.total).toBe(3);
    expect(s.last30Days).toBe(2);
  });

  it('动作成功率（成功/总数，空动作按成功计）', () => {
    const logs = [
      makeLog(1 * day, 'A', [{ type: 'vibrate', success: true }, { type: 'ringtone', success: true }]),
      makeLog(2 * day, 'A', [{ type: 'vibrate', success: false }]),
    ];
    const s = computeStats(logs, now);
    expect(s.successRate).toBeCloseTo(2 / 3);
  });

  it('近7天分布键齐全且计数正确', () => {
    const logs = [
      makeLog(0.5 * day, 'A', []), // 今天
      makeLog(2 * day, 'B', []), // 2 天前
      makeLog(8 * day, 'C', []), // 8 天前（不在此列）
    ];
    const s = computeStats(logs, now);
    expect(s.daily.length).toBe(7);
    expect(s.daily[0].count).toBe(1); // 今天
    expect(s.daily[2].count).toBe(1); // 2 天前
    expect(s.daily.reduce((a, b) => a + b.count, 0)).toBe(2);
  });

  it('按规则排行（降序）', () => {
    const logs = [
      makeLog(1 * day, 'A', []),
      makeLog(2 * day, 'B', []),
      makeLog(3 * day, 'B', []),
      makeLog(4 * day, 'B', []),
    ];
    const s = computeStats(logs, now);
    expect(s.byRule[0]).toEqual({ name: 'B', count: 3 });
    expect(s.byRule[1]).toEqual({ name: 'A', count: 1 });
  });
});
