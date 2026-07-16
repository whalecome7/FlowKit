import type { TriggerCondition, TriggerRule, MatchResult } from '../types';

interface SmsPayload {
  sender: string;
  body: string;
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
  matchRule(rule: TriggerRule, sms: SmsPayload): MatchResult | null {
    if (!rule.enabled) return null;

    const matchedConditions = rule.conditions.filter((cond) =>
      matchCondition(cond, sms),
    );

    if (matchedConditions.length > 0) {
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
