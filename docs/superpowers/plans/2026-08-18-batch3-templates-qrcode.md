# 批次 3（模板库 + 二维码导出分享）Implementation Plan — 阶段 A

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增规则模板库（预填编辑）与规则二维码导出（本地生成，无后端）。

**Architecture:** 模板为静态数组（RuleTemplates.ts），新建规则时弹层选择模板 → 以 navigation param 传递 templateId → 编辑页预填；二维码用 `qrcode-generator`（纯 JS 生成矩阵）+ RN View 渲染黑白块（无原生依赖），导出弹窗提供二维码/复制 JSON/分享。

**Tech Stack:** TypeScript / RN 0.86 / qrcode-generator（新增依赖）

**阶段 B（扫码导入）**：需相机能力（react-native-vision-camera 或原生 ZXing，成本/体积权衡），阶段 A 验收后单独评估；导入先保留「粘贴 JSON + 文件」两种方式（已有）。

---

### Task 1: 模板库（数据 + 新建弹层 + 预填编辑）

**Files:**
- Create: `src/modules/trigger/services/RuleTemplates.ts`
- Modify: `src/modules/trigger/screens/RuleListScreen.tsx`（新建按钮弹层）
- Modify: `src/modules/trigger/screens/RuleEditScreen.tsx`（接收模板参数预填）

- [ ] **Step 1: 安装依赖**

Run: `npm install qrcode-generator`（为 Task 2 准备，模板任务不依赖它；可跳过到 Task 2 再装——建议本步直接装）

- [ ] **Step 2: 创建 RuleTemplates.ts**

创建 `src/modules/trigger/services/RuleTemplates.ts`：

```ts
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
```

- [ ] **Step 3: RuleListScreen 新建弹层**

读 `RuleListScreen.tsx` 找到「＋」新建按钮（`onPress` 跳转 `TriggerRuleEdit` 的地方）。改造为弹层选择模板：

新增 state：`const [templateVisible, setTemplateVisible] = useState(false);`

「＋」按钮改为打开弹层。新增 Modal（复用页面 Modal 模式，或新建）：

```tsx
<Modal visible={templateVisible} transparent animationType="fade" onRequestClose={() => setTemplateVisible(false)}>
  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
    <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, maxHeight: '85%' }}>
      <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 12, color: colors.text }}>
        新建规则
      </Text>
      <ScrollView>
        <TouchableOpacity
          onPress={() => { setTemplateVisible(false); navigation.navigate('TriggerRuleEdit', {}); }}
          style={{ padding: 12, borderRadius: 10, backgroundColor: colors.surfaceAlt, marginBottom: 8 }}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>⬜ 空白规则</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>从零开始配置</Text>
        </TouchableOpacity>
        {RULE_TEMPLATES.map((t) => (
          <TouchableOpacity
            key={t.id}
            onPress={() => { setTemplateVisible(false); navigation.navigate('TriggerRuleEdit', { templateId: t.id }); }}
            style={{ padding: 12, borderRadius: 10, backgroundColor: colors.surfaceAlt, marginBottom: 8 }}>
            <Text style={{ color: colors.text, fontWeight: '500' }}>{t.icon} {t.name}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t.description}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  </View>
</Modal>
```

import `RULE_TEMPLATES`；`ScrollView` 从 react-native 导入（若未导入）。

- [ ] **Step 4: RuleEditScreen 接收模板预填**

`RuleEditScreen.tsx`：
- route params 类型加 `templateId?: string`
- 组件内（state 初始化前）：

```ts
const template = route.params?.templateId
  ? RULE_TEMPLATES.find((t) => t.id === route.params?.templateId)
  : undefined;
// 模板预填：仅新建（无 existingRule）时应用
const templateName = template && !existingRule ? template.name : undefined;
```

- state 初始化改为（模板优先）：

```ts
const [name, setName] = useState(existingRule?.name ?? templateName ?? '');
const [conditions, setConditions] = useState<TriggerCondition[]>(
  existingRule?.conditions ?? template?.conditions ?? [],
);
const [actions, setActions] = useState<TriggerAction[]>(
  existingRule?.actions ?? template?.actions ?? [],
);
```

- 若有 `template.needsAttention`，保存成功后 Alert 提示（或在页面顶部显示提示条）：
  - 简单方案：`handleSave` 成功后若 `template?.needsAttention` 存在 → `Alert.alert('提示', template.needsAttention)`（保存后提示补充）
- import `RULE_TEMPLATES`

- [ ] **Step 5: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add src/modules/trigger/services/RuleTemplates.ts src/modules/trigger/screens/RuleListScreen.tsx src/modules/trigger/screens/RuleEditScreen.tsx
git commit -m "feat: 规则模板库（新建弹层+预填编辑）"
```

---

### Task 2: 二维码导出（qrcode-generator + 导出弹窗）

**Files:**
- Create: `src/modules/trigger/components/QRCodeView.tsx`
- Modify: `src/modules/trigger/screens/RuleListScreen.tsx`（导出弹窗）

- [ ] **Step 1: 安装依赖**

Run: `npm install qrcode-generator`
（若 Task 1 已装则跳过。确认 `package.json` 有 `qrcode-generator` 依赖。）

- [ ] **Step 2: 创建 QRCodeView**

创建 `src/modules/trigger/components/QRCodeView.tsx`：

```tsx
import { View, StyleSheet } from 'react-native';
import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** 二维码展示（qrcode-generator 矩阵 + View 渲染，无原生依赖） */
export function QRCodeView({
  value,
  size = 180,
}: {
  value: string;
  size?: number;
}) {
  const cells = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    return qr;
  }, [value]);

  const count = cells.getModuleCount();
  const cellSize = size / count;

  return (
    <View style={{ width: size, height: size, backgroundColor: '#fff', padding: 8 }}>
      {Array.from({ length: count }).map((_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {Array.from({ length: count }).map((_, col) => (
            <View
              key={col}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: cells.isDark(row, col) ? '#000' : '#fff',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
```

（注意：`qrcode-generator` 默认导出为 `qr` 函数，TS 类型若无则 `// @ts-ignore` 或 `declare module 'qrcode-generator';` 处理——检查其自带类型，若无则在文件顶部加 `declare module 'qrcode-generator';`。）

- [ ] **Step 3: 导出弹窗**

`RuleListScreen.tsx`：
- import `QRCodeView`、`serializeRules`（已有）
- 新增 state：`const [exportVisible, setExportVisible] = useState(false);`
- 「导出规则」菜单项改为：`setMoreVisible(false); setExportVisible(true);`
- 新增 Modal：

```tsx
<Modal visible={exportVisible} transparent animationType="fade" onRequestClose={() => setExportVisible(false)}>
  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
    <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, alignItems: 'center' }}>
      <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 12, color: colors.text }}>导出规则</Text>
      <QRCodeView value={serializeRules(rules)} />
      <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>
        扫码即导入规则（本地编码，无需联网）
      </Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <TouchableOpacity
          onPress={async () => { await exportRules(rules); }}
          style={{ padding: 10, borderRadius: 8, backgroundColor: colors.surfaceAlt }}>
          <Text style={{ color: colors.text, fontSize: 13 }}>📄 分享/存文件</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { Alert.alert('已复制', '规则 JSON 已复制到剪贴板'); void Clipboard.setString(serializeRules(rules)); }}
          style={{ padding: 10, borderRadius: 8, backgroundColor: colors.surfaceAlt }}>
          <Text style={{ color: colors.text, fontSize: 13 }}>📋 复制 JSON</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => setExportVisible(false)} style={{ marginTop: 12 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>关闭</Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>
```

注意：`Clipboard` 需 `@react-native-clipboard/clipboard` 依赖——**检查是否已安装**；未安装则改用 `Share`（`await exportRules(rules)` 已有）或 `Alert` 展示 JSON 让用户长按复制（简单方案：用 `Share` 分享 JSON 文本）。**若 clipboard 未装，复制按钮改为：Alert 弹窗展示 JSON 前 200 字 + 提示用分享**；或不加复制按钮（保留二维码 + 分享）。

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add src/modules/trigger/components/QRCodeView.tsx src/modules/trigger/screens/RuleListScreen.tsx package.json package-lock.json
git commit -m "feat: 规则二维码导出（本地生成）+ 导出弹窗"
```

---

### Task 3: 真机验收（阶段 A）

**Files:** 无

- [ ] **Step 1: 构建安装**

```bash
cd android && ./gradlew assembleRelease 2>&1 | tail -2
cd .. && cp android/app/build/outputs/apk/release/app-release.apk release/FlowKit-v1.1-release.apk
adb install -r release/FlowKit-v1.1-release.apk
```

- [ ] **Step 2: 主人验收（手动）**

1. 规则列表「＋」→ 弹层显示「空白规则 + 4 个模板」→ 选「找手机」→ 编辑页预填（含 needsAttention 提示）→ 修改号码保存
2. 选「违停提醒」→ 预填后保存 → 触发测试正常
3. ⋯ → 导出规则 → 二维码显示（可扫码验证内容）+ 分享/存文件

- [ ] **Step 3: 记录结果**

---

## Self-Review

**Spec 覆盖**：模板库（Task 1）✓；二维码导出（Task 2）✓；验收（Task 3）✓；扫码导入（阶段 B，标注待评估）✓。
**占位符**：无。
**类型一致**：RuleTemplate/QRCodeView/serializeRules 命名一致。
