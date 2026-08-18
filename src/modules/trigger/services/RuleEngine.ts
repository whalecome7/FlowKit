import type { TriggerCondition, TriggerRule, MatchResult } from '../types';

interface SmsPayload {
  sender: string;
  body: string;
}

/** 号码归一化：去空格/横线/括号，去 +86/0086 前缀 */
export function normalizePhone(raw: string): string {
  let s = (raw ?? '').trim().replace(/[\s\-()]/g, '');
  if (s.startsWith('+86') && s.length > 11) s = s.slice(3);
  if (s.startsWith('0086') && s.length > 11) s = s.slice(4);
  return s;
}

/** 时间窗口判断（支持跨天，start > end 表示跨天） */
export function inTimeWindow(
  window: { start: string; end: string },
  now: Date = new Date(),
): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = toMin(window.start);
  const end = toMin(window.end);
  if (start <= end) return cur >= start && cur <= end;
  return cur >= start || cur <= end; // 跨天
}

function matchCondition(condition: TriggerCondition, sms: SmsPayload): boolean {
  const fieldValue = sms[condition.field] ?? '';

  switch (condition.matchType) {
    case 'contains':
      return fieldValue.includes(condition.value);
    case 'equals':
      return fieldValue === condition.value;
    case 'regex':
      try {
        const regex = new RegExp(condition.value);
        return regex.test(fieldValue);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

export const RuleEngine = {
  /**
   * 检查单条规则是否匹配短信
   */
  matchRule(rule: TriggerRule, sms: SmsPayload, now: Date = new Date()): MatchResult | null {
    if (!rule.enabled || rule.conditions.length === 0) return null;

    // ① 黑名单：命中则排除
    if (
      rule.senderBlacklist?.length &&
      rule.senderBlacklist.map(normalizePhone).includes(normalizePhone(sms.sender))
    ) {
      return null;
    }
    // ② 白名单：非空时 sender 必须在名单内
    if (
      rule.senderWhitelist?.length &&
      !rule.senderWhitelist.map(normalizePhone).includes(normalizePhone(sms.sender))
    ) {
      return null;
    }
    // ③ 时间窗口：窗口外完全静默
    if (rule.timeWindow?.enabled && !inTimeWindow(rule.timeWindow, now)) {
      return null;
    }

    const matchedConditions = rule.conditions.filter((cond) =>
      matchCondition(cond, sms),
    );

    if (matchedConditions.length === rule.conditions.length) {
      return { rule, matchedConditions };
    }

    return null;
  },

  /**
   * 从规则列表中找到所有匹配的规则
   */
  compare(sms: SmsPayload, rules: TriggerRule[]): MatchResult[] {
    const results: MatchResult[] = [];
    for (const rule of rules) {
      const result = this.matchRule(rule, sms);
      if (result) {
        results.push(result);
      }
    }
    return results;
  },
};
