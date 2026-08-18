import type { TriggerCondition, TriggerAction } from '../types';

export interface RuleTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  conditions: TriggerCondition[];
  actions: TriggerAction[];
  /** 创建后需用户补充的提示（如找手机填号码） */
  needsAttention?: string;
}

const notify = (title: string, body: string): TriggerAction => ({
  type: 'notify',
  params: { title, body },
});
const vibrate = (pattern = '300', amplitude = 120): TriggerAction => ({
  type: 'vibrate',
  params: { pattern, amplitude },
});
const ringtone = (duration = 5000): TriggerAction => ({
  type: 'ringtone',
  params: { source: 'default', duration },
});

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    id: 'weiting',
    name: '违停提醒',
    icon: '🚗',
    description: '正文含「未按规定停放」→ 通知+震动+铃声',
    conditions: [{ field: 'body', matchType: 'contains', value: '未按规定停放' }],
    actions: [
      notify('FlowKit 提醒', '检测到违停短信'),
      vibrate(),
      ringtone(),
    ],
  },
  {
    id: 'verify-code',
    name: '验证码提取',
    icon: '🔐',
    description: '正文含「验证码」→ 通知',
    conditions: [{ field: 'body', matchType: 'contains', value: '验证码' }],
    actions: [notify('验证码提醒', '收到验证码短信')],
  },
  {
    id: 'bank',
    name: '银行动账',
    icon: '🏦',
    description: '正文含「消费/入账」→ 通知',
    conditions: [
      { field: 'body', matchType: 'contains', value: '消费' },
      { field: 'body', matchType: 'contains', value: '入账' },
    ],
    actions: [notify('银行动账提醒', '收到银行短信')],
  },
  {
    id: 'find-phone',
    name: '找手机',
    icon: '📱',
    description: '指定号码发短信 → 响铃+震动（静音也响）',
    conditions: [{ field: 'sender', matchType: 'contains', value: '你的另一个号码' }],
    actions: [vibrate('200,80,200,80,300', 200), ringtone(15000)],
    needsAttention: '请把匹配条件中的「你的另一个号码」改成你实际的另一个手机号',
  },
];
