# Trigger JS 层闭环实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Android 上跑通「建规则 → 模拟短信 → AND 匹配 → 真实动作(vibrate/notify) → 日志」完整链路，修复 RuleEngine 匹配 bug，实现条件/动作编辑 UI。

**Architecture:** 保持现有模块化架构最小侵入改造。修复 RuleEngine AND 语义（全条件匹配且非空）；ActionExecutor 真实实现 vibrate（RN Vibration）与 notify（Notifee）；编辑页单页表单（名称 + 条件列表 + 动作列表，动态增删）；规则列表页增加模拟短信 Modal 触发 processSms。数据模型与 processSms 接口不变，为阶段 2 原生接入预留。

**Tech Stack:** React Native 0.86, TypeScript, Zustand, @notifee/react-native, Jest

**Spec:** `docs/superpowers/specs/2026-08-13-trigger-js-layer-design.md`

---

### Task 1: 修复 RuleEngine AND 匹配逻辑（TDD）

**Files:**
- Create: `__tests__/RuleEngine.test.ts`
- Modify: `src/modules/trigger/services/RuleEngine.ts`

- [ ] **Step 1: 写失败测试**

Write to `__tests__/RuleEngine.test.ts`:

```typescript
import { RuleEngine } from '../src/modules/trigger/services/RuleEngine';
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest __tests__/RuleEngine.test.ts`
Expected: FAIL——"多条件仅部分匹配时不命中" 用例失败（当前实现 OR 语义误命中），其余通过

- [ ] **Step 3: 修复 matchRule**

In `src/modules/trigger/services/RuleEngine.ts`, replace the `matchRule` method body:

```typescript
  matchRule(rule: TriggerRule, sms: SmsPayload): MatchResult | null {
    if (!rule.enabled || rule.conditions.length === 0) return null;

    const matchedConditions = rule.conditions.filter((cond) =>
      matchCondition(cond, sms),
    );

    if (matchedConditions.length === rule.conditions.length) {
      return { rule, matchedConditions };
    }

    return null;
  },
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest __tests__/RuleEngine.test.ts`
Expected: PASS（8 个用例全绿）

- [ ] **Step 5: 提交**

```bash
git add __tests__/RuleEngine.test.ts src/modules/trigger/services/RuleEngine.ts
git commit -m "fix: rule engine AND matching semantics with empty-conditions guard"
```

---

### Task 2: 安装 @notifee/react-native

**Files:**
- Modify: `package.json`（npm install 自动）

- [ ] **Step 1: 安装依赖**

Run: `npm install @notifee/react-native`
Expected: 安装成功，package.json 增加 `"@notifee/react-native": "^9.x.x"`

- [ ] **Step 2: 确认 Android 配置就绪（Notifee 自动链接，minSdk 24 ≥ 21 满足）**

Run: `npx react-native config | grep -A 5 -i notifee`
Expected: 输出包含 `notifee` 的 dependency 配置（autolinking 已识别）

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: add @notifee/react-native for local notifications"
```

---

### Task 3: 动作元数据 + ActionExecutor 真实动作

**Files:**
- Modify: `src/modules/trigger/types/index.ts`
- Modify: `src/modules/trigger/services/ActionExecutor.ts`
- Modify: `src/modules/trigger/index.ts`

- [ ] **Step 1: 在 types 增加动作元数据**

Append to `src/modules/trigger/types/index.ts`:

```typescript
/** 动作参数表单定义 */
export interface ActionParamMeta {
  key: string;
  label: string;
  placeholder?: string;
  numeric?: boolean;
}

/** 动作元数据：驱动编辑 UI 渲染 */
export interface ActionMeta {
  type: string;
  label: string;
  params: ActionParamMeta[];
}

export const ACTION_META: ActionMeta[] = [
  {
    type: 'notify',
    label: '状态栏通知',
    params: [
      { key: 'title', label: '标题', placeholder: 'FlowKit 提醒' },
      { key: 'body', label: '正文', placeholder: '收到匹配短信' },
    ],
  },
  {
    type: 'vibrate',
    label: '震动',
    params: [{ key: 'duration', label: '时长(ms)', placeholder: '500', numeric: true }],
  },
  {
    type: 'ringtone',
    label: '播放铃声',
    params: [{ key: 'url', label: '铃声地址(可选)', placeholder: '留空使用系统铃声' }],
  },
  {
    type: 'pushToWatch',
    label: '推送到手表',
    params: [
      { key: 'title', label: '标题', placeholder: 'FlowKit 提醒' },
      { key: 'body', label: '正文', placeholder: '收到匹配短信' },
    ],
  },
];

/** 动作类型 → 元数据 查找 */
export function getActionMeta(type: string): ActionMeta | undefined {
  return ACTION_META.find((m) => m.type === type);
}
```

- [ ] **Step 2: 重写 ActionExecutor 的 registerDefaults**

In `src/modules/trigger/services/ActionExecutor.ts`:
- 在文件顶部 import 改为（替换第 1 行 import）：

```typescript
import { Vibration } from 'react-native';
import notifee, { AndroidImportance } from '@notifee/react-native';
import type { TriggerAction, MatchResult, ActionLog, ExecutionLog } from '../types';
import { generateId } from '../../../shared/types';
```

- 替换整个 `registerDefaults` 方法：

```typescript
  /** 注册内置默认处理器 */
  registerDefaults(): void {
    // 震动：RN 内置 Vibration API
    this.registerHandler('vibrate', async (action) => {
      const raw = action.params?.duration;
      const duration =
        typeof raw === 'number' && raw > 0 ? raw : 500;
      Vibration.vibrate(duration);
      return { success: true };
    });

    // 状态栏通知：Notifee
    this.registerHandler('notify', async (action) => {
      const title = String(action.params?.title ?? 'FlowKit 提醒');
      const body = String(action.params?.body ?? '');
      const permission = await notifee.requestPermission();
      if (permission.authorizationStatus < 2) {
        return { success: false, error: '通知权限未授权' };
      }
      const channelId = await notifee.createChannel({
        id: 'flowkit-trigger',
        name: '短信触发器',
      });
      await notifee.displayNotification({
        title,
        body,
        android: { channelId, importance: AndroidImportance.HIGH },
      });
      return { success: true };
    });

    // 铃声/推手表：阶段 1 占位，明确失败
    this.registerHandler('ringtone', async () => ({
      success: false,
      error: 'ringtone 动作未实现',
    }));
    this.registerHandler('pushToWatch', async () => ({
      success: false,
      error: 'pushToWatch 动作未实现',
    }));
  },
```

- [ ] **Step 3: 模块注册时初始化默认动作**

In `src/modules/trigger/index.ts`, replace file content:

```typescript
import { Platform } from 'react-native';
import { moduleRegistry } from '../../app/module-registry';
import type { ModuleConfig } from '../../app/types';
import { ActionExecutor } from './services/ActionExecutor';

const triggerModuleConfig: ModuleConfig = {
  id: 'trigger',
  name: '短信触发器',
  homeRoute: 'TriggerRuleList',
  enabled: Platform.OS === 'android',
  getRoutes: () => [],
};

export function registerTriggerModule(): void {
  ActionExecutor.registerDefaults();
  moduleRegistry.register(triggerModuleConfig);
}

export { triggerModuleConfig };
```

- [ ] **Step 4: 类型检查 + 提交**

Run: `npx tsc --noEmit`
Expected: 0 报错

```bash
git add src/modules/trigger/types/index.ts src/modules/trigger/services/ActionExecutor.ts src/modules/trigger/index.ts
git commit -m "feat: implement real vibrate/notify actions with action metadata"
```

---

### Task 4: ConditionEditor 组件

**Files:**
- Create: `src/modules/trigger/components/ConditionEditor.tsx`

- [ ] **Step 1: 编写组件**

Write to `src/modules/trigger/components/ConditionEditor.tsx`:

```typescript
import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import type { TriggerCondition } from '../types';

const FIELDS: Array<{ value: TriggerCondition['field']; label: string }> = [
  { value: 'sender', label: '发件人' },
  { value: 'body', label: '正文' },
];

const MATCH_TYPES: Array<{ value: TriggerCondition['matchType']; label: string }> = [
  { value: 'contains', label: '包含' },
  { value: 'equals', label: '等于' },
  { value: 'regex', label: '正则' },
];

interface Props {
  condition: TriggerCondition;
  onChange: (condition: TriggerCondition) => void;
  onRemove: () => void;
}

function Segmented<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onSelect: (v: T) => void;
}) {
  return (
    <View style={styles.segRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.segItem, value === opt.value && styles.segItemActive]}
          onPress={() => onSelect(opt.value)}>
          <Text
            style={[styles.segText, value === opt.value && styles.segTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function ConditionEditor({ condition, onChange, onRemove }: Props) {
  const isRegex = condition.matchType === 'regex';
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Segmented
          options={FIELDS}
          value={condition.field}
          onSelect={(field) => onChange({ ...condition, field })}
        />
        <TouchableOpacity onPress={onRemove} hitSlop={8}>
          <Text style={styles.remove}>✕</Text>
        </TouchableOpacity>
      </View>
      <Segmented
        options={MATCH_TYPES}
        value={condition.matchType}
        onSelect={(matchType) => onChange({ ...condition, matchType })}
      />
      <TextInput
        style={styles.input}
        value={condition.value}
        onChangeText={(value) => onChange({ ...condition, value })}
        placeholder={isRegex ? '正则表达式，如 \\d{6}' : '匹配内容'}
        placeholderTextColor="#ccc"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  segRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  segItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  segItemActive: {
    backgroundColor: '#4a90d9',
  },
  segText: {
    fontSize: 13,
    color: '#555',
  },
  segTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#f7f7f7',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  remove: {
    fontSize: 16,
    color: '#c62828',
    padding: 4,
  },
});
```

- [ ] **Step 2: 类型检查 + 提交**

Run: `npx tsc --noEmit`
Expected: 0 报错

```bash
git add src/modules/trigger/components/ConditionEditor.tsx
git commit -m "feat: add condition editor component"
```

---

### Task 5: ActionEditor 组件

**Files:**
- Create: `src/modules/trigger/components/ActionEditor.tsx`

- [ ] **Step 1: 编写组件**

Write to `src/modules/trigger/components/ActionEditor.tsx`:

```typescript
import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import type { TriggerAction } from '../types';
import { ACTION_META } from '../types';

interface Props {
  action: TriggerAction;
  onChange: (action: TriggerAction) => void;
  onRemove: () => void;
}

export default function ActionEditor({ action, onChange, onRemove }: Props) {
  const meta = ACTION_META.find((m) => m.type === action.type) ?? ACTION_META[0];

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>动作类型</Text>
        <TouchableOpacity onPress={onRemove} hitSlop={8}>
          <Text style={styles.remove}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.typeRow}>
        {ACTION_META.map((m) => (
          <TouchableOpacity
            key={m.type}
            style={[styles.typeItem, action.type === m.type && styles.typeItemActive]}
            onPress={() => onChange({ type: m.type, params: {} })}>
            <Text
              style={[styles.typeText, action.type === m.type && styles.typeTextActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {meta.params.map((param) => (
        <View key={param.key} style={styles.paramRow}>
          <Text style={styles.paramLabel}>{param.label}</Text>
          <TextInput
            style={styles.input}
            value={action.params?.[param.key] != null ? String(action.params[param.key]) : ''}
            onChangeText={(text) =>
              onChange({
                ...action,
                params: {
                  ...action.params,
                  [param.key]: param.numeric
                    ? (Number(text) || 0)
                    : text,
                },
              })
            }
            placeholder={param.placeholder}
            placeholderTextColor="#ccc"
            keyboardType={param.numeric ? 'numeric' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  remove: {
    fontSize: 16,
    color: '#c62828',
    padding: 4,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  typeItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  typeItemActive: {
    backgroundColor: '#4a90d9',
  },
  typeText: {
    fontSize: 13,
    color: '#555',
  },
  typeTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  paramRow: {
    marginBottom: 8,
  },
  paramLabel: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#f7f7f7',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
});
```

- [ ] **Step 2: 类型检查 + 提交**

Run: `npx tsc --noEmit`
Expected: 0 报错

```bash
git add src/modules/trigger/components/ActionEditor.tsx
git commit -m "feat: add action editor component with param forms"
```

---

### Task 6: RuleEditScreen 集成条件/动作编辑

**Files:**
- Modify: `src/modules/trigger/screens/RuleEditScreen.tsx`（整体重写）

- [ ] **Step 1: 重写 RuleEditScreen**

Replace `src/modules/trigger/screens/RuleEditScreen.tsx` with:

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useTriggerStore } from '../store';
import type { TriggerCondition, TriggerAction } from '../types';
import ConditionEditor from '../components/ConditionEditor';
import ActionEditor from '../components/ActionEditor';

type RouteParams = {
  TriggerRuleEdit: { ruleId?: string };
};

export default function RuleEditScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'TriggerRuleEdit'>>();
  const { rules, addRule, updateRule } = useTriggerStore();

  const ruleId = route.params?.ruleId;
  const existingRule = ruleId ? rules.find((r) => r.id === ruleId) : undefined;
  const isEditing = !!existingRule;

  const [name, setName] = useState(existingRule?.name ?? '');
  const [conditions, setConditions] = useState<TriggerCondition[]>(
    existingRule?.conditions ?? [],
  );
  const [actions, setActions] = useState<TriggerAction[]>(
    existingRule?.actions ?? [],
  );

  const addCondition = () => {
    setConditions((prev) => [
      ...prev,
      { field: 'body', matchType: 'contains', value: '' },
    ]);
  };

  const updateCondition = (index: number, condition: TriggerCondition) => {
    setConditions((prev) =>
      prev.map((c, i) => (i === index ? condition : c)),
    );
  };

  const removeCondition = (index: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  };

  const addAction = () => {
    setActions((prev) => [...prev, { type: 'notify', params: {} }]);
  };

  const updateAction = (index: number, action: TriggerAction) => {
    setActions((prev) => prev.map((a, i) => (i === index ? action : a)));
  };

  const removeAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('提示', '请输入规则名称');
      return;
    }
    if (conditions.length === 0) {
      Alert.alert('提示', '至少添加一个匹配条件');
      return;
    }
    if (conditions.some((c) => !c.value.trim())) {
      Alert.alert('提示', '请填写所有条件的匹配内容');
      return;
    }

    try {
      if (isEditing && existingRule) {
        await updateRule(existingRule.id, {
          name: name.trim(),
          conditions,
          actions,
        });
      } else {
        await addRule({
          name: name.trim(),
          enabled: true,
          conditions,
          actions,
        });
      }
      navigation.goBack();
    } catch {
      Alert.alert('错误', '保存失败');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>规则名称</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="例如：银行验证码"
        placeholderTextColor="#ccc"
      />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>匹配条件（全部满足）</Text>
        <TouchableOpacity onPress={addCondition} hitSlop={8}>
          <Text style={styles.addButton}>+ 添加条件</Text>
        </TouchableOpacity>
      </View>
      {conditions.length === 0 && (
        <Text style={styles.empty}>尚无条件，添加一个以启用规则</Text>
      )}
      {conditions.map((condition, index) => (
        <ConditionEditor
          key={index}
          condition={condition}
          onChange={(c) => updateCondition(index, c)}
          onRemove={() => removeCondition(index)}
        />
      ))}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>触发动作</Text>
        <TouchableOpacity onPress={addAction} hitSlop={8}>
          <Text style={styles.addButton}>+ 添加动作</Text>
        </TouchableOpacity>
      </View>
      {actions.length === 0 && <Text style={styles.empty}>尚无动作</Text>}
      {actions.map((action, index) => (
        <ActionEditor
          key={index}
          action={action}
          onChange={(a) => updateAction(index, a)}
          onRemove={() => removeAction(index)}
        />
      ))}

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>
          {isEditing ? '更新规则' : '创建规则'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16, paddingBottom: 40 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  addButton: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4a90d9',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  empty: {
    fontSize: 13,
    color: '#bbb',
    marginBottom: 10,
  },
  saveButton: {
    backgroundColor: '#4a90d9',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 2: 类型检查 + 提交**

Run: `npx tsc --noEmit`
Expected: 0 报错

```bash
git add src/modules/trigger/screens/RuleEditScreen.tsx
git commit -m "feat: add condition and action editing to rule editor"
```

---

### Task 7: 模拟短信 Modal + 规则列表入口

**Files:**
- Create: `src/modules/trigger/components/SimulateSmsModal.tsx`
- Modify: `src/modules/trigger/screens/RuleListScreen.tsx`

- [ ] **Step 1: 编写 SimulateSmsModal**

Write to `src/modules/trigger/components/SimulateSmsModal.tsx`:

```typescript
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useTriggerStore } from '../store';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function SimulateSmsModal({ visible, onClose }: Props) {
  const processSms = useTriggerStore((s) => s.processSms);
  const [sender, setSender] = useState('10086');
  const [body, setBody] = useState('');

  const handleSend = async () => {
    if (!body.trim()) {
      Alert.alert('提示', '请输入短信内容');
      return;
    }
    await processSms(sender.trim() || 'unknown', body.trim());
    Alert.alert('已模拟', '短信已进入匹配流程，可查看触发日志');
    setBody('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>模拟短信</Text>
          <Text style={styles.label}>发件人</Text>
          <TextInput
            style={styles.input}
            value={sender}
            onChangeText={setSender}
            placeholder="例如 10086"
            placeholderTextColor="#ccc"
            autoCapitalize="none"
          />
          <Text style={styles.label}>短信内容</Text>
          <TextInput
            style={[styles.input, styles.bodyInput]}
            value={body}
            onChangeText={setBody}
            placeholder="例如：您的验证码是 123456"
            placeholderTextColor="#ccc"
            multiline
          />
          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={onClose}>
              <Text style={styles.btnCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnSend]} onPress={handleSend}>
              <Text style={styles.btnSendText}>发送</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 14 },
  label: { fontSize: 13, color: '#888', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#f7f7f7',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  bodyInput: { minHeight: 80, textAlignVertical: 'top' },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center' },
  btnCancel: { backgroundColor: '#f0f0f0' },
  btnSend: { backgroundColor: '#4a90d9' },
  btnCancelText: { color: '#555', fontWeight: '600' },
  btnSendText: { color: '#fff', fontWeight: '600' },
});
```

- [ ] **Step 2: RuleListScreen 增加「模拟」入口**

In `src/modules/trigger/screens/RuleListScreen.tsx`:
- 顶部 import 增加 `useState`（替换 `import React, { useEffect, useLayoutEffect } from 'react';` 为 `import React, { useEffect, useLayoutEffect, useState } from 'react';`）
- 增加 import：`import SimulateSmsModal from '../components/SimulateSmsModal';`
- 组件内增加 state（`useLayoutEffect` 之前）：`const [simulateVisible, setSimulateVisible] = useState(false);`
- headerRight 的 View 内，在「日志」按钮前增加模拟按钮：

```typescript
          <TouchableOpacity onPress={() => setSimulateVisible(true)}>
            <Text style={{ fontSize: 14, color: '#4a90d9' }}>模拟</Text>
          </TouchableOpacity>
```

- 在 `useLayoutEffect` 依赖数组增加 `setSimulateVisible` 引用（保持 `[navigation]` 不变即可，setState 稳定）
- 在返回的 `<View style={styles.container}>` 内、`<FlatList />` 之后追加：

```typescript
      <SimulateSmsModal
        visible={simulateVisible}
        onClose={() => setSimulateVisible(false)}
      />
```

- [ ] **Step 3: 类型检查 + 提交**

Run: `npx tsc --noEmit`
Expected: 0 报错

```bash
git add src/modules/trigger/components/SimulateSmsModal.tsx src/modules/trigger/screens/RuleListScreen.tsx
git commit -m "feat: add simulate SMS entry to rule list"
```

---

### Task 8: 全量验证

**Files:** None（验证步骤）

- [ ] **Step 1: TypeScript 全量检查**

Run: `npx tsc --noEmit`
Expected: 0 报错

- [ ] **Step 2: 运行全部测试**

Run: `npx jest`
Expected: 原有 App.test.tsx + RuleEngine 全部 PASS

- [ ] **Step 3: Android 跑通**

Run: `npx react-native run-android`
Expected: 应用安装并启动成功

手动验证流程（主人操作或我协助）：
1. 首页 → 短信触发器 → 规则列表
2. 右上角「+」→ 创建规则：名称"银行验证码"，添加条件：发件人=10086 或 正文包含"验证码"，添加动作：状态栏通知（标题/正文），保存
3. 列表点右上角「模拟」→ 发件人 10086、内容"您的验证码是 123456" → 发送
4. 预期：状态栏弹出通知 + 手机震动；进入「日志」页可见一条触发记录（notify ✓）

- [ ] **Step 4: 最终提交**

```bash
git add -A
git status
git commit -m "chore: trigger JS layer closure validation"
```

---

## 计划自查

**1. Spec 覆盖：**
- RuleEngine AND 修复 ✓（Task 1）
- 条件/动作编辑 UI ✓（Task 4/5/6）
- vibrate/notify 真实动作 ✓（Task 2/3）
- 模拟短信入口 ✓（Task 7）
- 核心逻辑单测 ✓（Task 1）
- Android 跑通 ✓（Task 8）
- ringtone/pushToWatch 占位失败 ✓（Task 3）

**2. 占位符扫描：** 所有步骤含完整代码与命令，无 TBD/TODO 步骤。

**3. 类型一致性：**
- `ACTION_META`（Task 3 定义）在 ActionEditor（Task 5）中使用 ✓
- `ConditionEditor` Props `{condition, onChange, onRemove}`（Task 4）与 RuleEditScreen 调用（Task 6）一致 ✓
- `SimulateSmsModal` Props `{visible, onClose}`（Task 7）与 RuleListScreen 一致 ✓
- `processSms(sender, body)` 接口未变，SimulateSmsModal 调用与 store 定义一致 ✓
- `notifee.authorizationStatus < 2` 判定：0=NOT_DETERMINED/1=DENIED 视为未授权，2=AUTHORIZED 通过 ✓
