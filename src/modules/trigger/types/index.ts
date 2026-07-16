/** 匹配条件 */
export interface TriggerCondition {
  field: 'sender' | 'body';
  matchType: 'contains' | 'regex' | 'equals';
  value: string;
}

/** 触发动作 */
export interface TriggerAction {
  type: 'ringtone' | 'vibrate' | 'notify' | 'pushToWatch';
  params: Record<string, unknown>;
}

/** 规则 */
export interface TriggerRule {
  id: string;
  name: string;
  enabled: boolean;
  conditions: TriggerCondition[];
  actions: TriggerAction[];
  createdAt: number;
}

/** 匹配结果 */
export interface MatchResult {
  rule: TriggerRule;
  matchedConditions: TriggerCondition[];
}

/** 动作执行记录 */
export interface ActionLog {
  type: string;
  success: boolean;
  error?: string;
}

/** 执行日志 */
export interface ExecutionLog {
  id: string;
  ruleId: string;
  ruleName: string;
  smsSender: string;
  smsBody: string;
  triggeredAt: number;
  actions: ActionLog[];
}
