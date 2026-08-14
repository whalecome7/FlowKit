import { RuleEngine } from '../src/modules/trigger/services/RuleEngine';
import { ActionExecutor } from '../src/modules/trigger/services/ActionExecutor';
import type { TriggerRule } from '../src/modules/trigger/types';

function makeRule(overrides: Partial<TriggerRule> = {}): TriggerRule {
  return {
    id: 'r1',
    name: 'test',
    enabled: true,
    conditions: [{ field: 'body', matchType: 'contains', value: '验证码' }],
    actions: [],
    createdAt: 0,
    ...overrides,
  };
}

describe('RuleEngine', () => {
  test('多条件全部匹配（AND）才命中', () => {
    const rule = makeRule({
      conditions: [
        { field: 'sender', matchType: 'equals', value: '10086' },
        { field: 'body', matchType: 'contains', value: '验证码' },
      ],
    });
    const result = RuleEngine.matchRule(rule, {
      sender: '10086',
      body: '您的验证码是 123456',
    });
    expect(result).not.toBeNull();
  });

  test('多条件仅部分匹配时不命中（防 OR 回归）', () => {
    const rule = makeRule({
      conditions: [
        { field: 'sender', matchType: 'equals', value: '10086' },
        { field: 'body', matchType: 'contains', value: '验证码' },
      ],
    });
    const result = RuleEngine.matchRule(rule, {
      sender: '10000',
      body: '您的验证码是 123456',
    });
    expect(result).toBeNull();
  });

  test('空 conditions 规则不命中', () => {
    const rule = makeRule({ conditions: [] });
    expect(
      RuleEngine.matchRule(rule, { sender: '10086', body: '任意内容' }),
    ).toBeNull();
  });

  test('禁用规则不命中', () => {
    const rule = makeRule({ enabled: false });
    expect(
      RuleEngine.matchRule(rule, { sender: '10086', body: '您的验证码是 123456' }),
    ).toBeNull();
  });

  test('contains 匹配', () => {
    const rule = makeRule();
    expect(
      RuleEngine.matchRule(rule, { sender: 'x', body: '您的验证码是 123456' }),
    ).not.toBeNull();
  });

  test('equals 匹配', () => {
    const rule = makeRule({
      conditions: [{ field: 'sender', matchType: 'equals', value: '10086' }],
    });
    expect(
      RuleEngine.matchRule(rule, { sender: '10086', body: 'hi' }),
    ).not.toBeNull();
    expect(
      RuleEngine.matchRule(rule, { sender: '10000', body: 'hi' }),
    ).toBeNull();
  });

  test('regex 匹配与非法正则容错', () => {
    const rule = makeRule({
      conditions: [{ field: 'body', matchType: 'regex', value: '\\d{6}' }],
    });
    expect(
      RuleEngine.matchRule(rule, { sender: 'x', body: '验证码 123456' }),
    ).not.toBeNull();

    const bad = makeRule({
      conditions: [{ field: 'body', matchType: 'regex', value: '([' }],
    });
    expect(RuleEngine.matchRule(bad, { sender: 'x', body: '任意' })).toBeNull();
  });

  test('compare 返回所有匹配规则', () => {
    const r1 = makeRule({ id: 'a' });
    const r2 = makeRule({
      id: 'b',
      conditions: [{ field: 'body', matchType: 'contains', value: '不匹配' }],
    });
    const results = RuleEngine.compare(
      { sender: '10086', body: '您的验证码是 123456' },
      [r1, r2],
    );
    expect(results.map((r) => r.rule.id)).toEqual(['a']);
  });
});

describe('disabled action skipping', () => {
  it('skips actions with enabled=false in executor log', async () => {
    const logs = await ActionExecutor.execute(
      [
        {
          rule: {
            id: 'r1',
            name: 'r',
            enabled: true,
            conditions: [],
            actions: [{ id: 'a1', type: 'notify', params: { title: 't' }, enabled: false }],
          },
          matchedConditions: [],
        } as any,
      ],
      { sender: 's', body: 'b' },
    );
    expect(logs[0].actions[0].success).toBe(true);
    expect(logs[0].actions[0].error).toBe('已停用');
  });
});
