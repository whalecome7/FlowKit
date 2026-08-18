import { RuleEngine, normalizePhone, inTimeWindow } from './RuleEngine';
import type { TriggerRule } from '../types';

const baseRule: TriggerRule = {
  id: 'r1',
  name: '测试',
  enabled: true,
  conditions: [{ field: 'body', matchType: 'contains', value: '违停' }],
  actions: [{ type: 'notify', params: {} }],
  createdAt: 0,
};

describe('normalizePhone', () => {
  it('去掉 +86 前缀', () => {
    expect(normalizePhone('+8618650301429')).toBe('18650301429');
  });
  it('去掉空格和横线', () => {
    expect(normalizePhone('186 5030 1429')).toBe('18650301429');
    expect(normalizePhone('186-5030-1429')).toBe('18650301429');
  });
  it('去掉 0086 前缀', () => {
    expect(normalizePhone('008618650301429')).toBe('18650301429');
  });
});

describe('inTimeWindow', () => {
  const t = (h: number, m = 0) => new Date(2026, 7, 18, h, m);
  it('普通窗口内', () => {
    expect(inTimeWindow({ start: '08:00', end: '22:00' }, t(10))).toBe(true);
  });
  it('普通窗口外', () => {
    expect(inTimeWindow({ start: '08:00', end: '22:00' }, t(23))).toBe(false);
  });
  it('跨天窗口（22:00-08:00）夜间命中', () => {
    expect(inTimeWindow({ start: '22:00', end: '08:00' }, t(23))).toBe(true);
  });
  it('跨天窗口（22:00-08:00）清晨命中', () => {
    expect(inTimeWindow({ start: '22:00', end: '08:00' }, t(7))).toBe(true);
  });
  it('跨天窗口（22:00-08:00）白天不命中', () => {
    expect(inTimeWindow({ start: '22:00', end: '08:00' }, t(12))).toBe(false);
  });
});

describe('matchRule 过滤', () => {
  const sms = { sender: '18650301429', body: '您有违停记录' };
  it('黑名单命中则排除', () => {
    const rule = { ...baseRule, senderBlacklist: ['18650301429'] };
    expect(RuleEngine.matchRule(rule, sms)).toBeNull();
  });
  it('黑名单未命中则放行', () => {
    const rule = { ...baseRule, senderBlacklist: ['10086'] };
    expect(RuleEngine.matchRule(rule, sms)).not.toBeNull();
  });
  it('白名单：不在名单则排除', () => {
    const rule = { ...baseRule, senderWhitelist: ['10086'] };
    expect(RuleEngine.matchRule(rule, sms)).toBeNull();
  });
  it('白名单：在名单则放行（归一化匹配 +86）', () => {
    const rule = { ...baseRule, senderWhitelist: ['+86 186-5030-1429'] };
    expect(RuleEngine.matchRule(rule, sms)).not.toBeNull();
  });
  it('白名单和黑名单同时存在：白名单内且不在黑名单才放行', () => {
    const rule = {
      ...baseRule,
      senderWhitelist: ['18650301429'],
      senderBlacklist: ['18650301429'],
    };
    expect(RuleEngine.matchRule(rule, sms)).toBeNull();
  });
  it('时间窗口外完全静默', () => {
    const rule = {
      ...baseRule,
      timeWindow: { enabled: true, start: '08:00', end: '22:00' },
    };
    expect(RuleEngine.matchRule(rule, sms, new Date(2026, 7, 18, 23))).toBeNull();
  });
  it('时间窗口内正常触发', () => {
    const rule = {
      ...baseRule,
      timeWindow: { enabled: true, start: '08:00', end: '22:00' },
    };
    expect(RuleEngine.matchRule(rule, sms, new Date(2026, 7, 18, 10))).not.toBeNull();
  });
  it('旧规则无 timeWindow 字段：不限制', () => {
    expect(RuleEngine.matchRule(baseRule, sms, new Date(2026, 7, 18, 23))).not.toBeNull();
  });
});
