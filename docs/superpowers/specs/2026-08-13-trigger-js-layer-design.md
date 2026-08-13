# Trigger 模块 JS 层闭环设计文档

> 创建日期：2026-08-13
> 状态：已批准（主人确认方案 A 与全部设计章节）

## 背景

FlowKit（流光）首个模块 trigger（短信触发器）的 JS 层骨架已搭建完成，但核心链路未闭环：

1. `RuleEngine.matchRule` 匹配逻辑有 bug——设计为多条件 **AND** 关系，实际实现 `matchedConditions.length > 0` 即命中（等价 OR）
2. `RuleEditScreen` 只能编辑规则名称，条件/动作编辑 UI 缺失 → 新建规则 `conditions` 为空 → 永远无法匹配
3. `ActionExecutor.registerDefaults()` 从未被调用，4 个内置动作（ringtone/vibrate/notify/pushToWatch）全部是 `console.log` 占位
4. 无任何调用入口触发 `store.processSms()`（原生 SmsBridge 属阶段 2，本阶段不做）

**目标**：在 Android 上跑通「建规则 → 模拟短信 → 匹配 → 真实动作 → 日志」完整链路，且不改动数据模型与 `processSms` 接口（为阶段 2 原生接入预留）。

## 范围

### 本阶段（阶段 1）包含

- 修复 RuleEngine AND 匹配逻辑（含空条件规则语义）
- 编辑页条件/动作编辑 UI
- 真实动作：`vibrate`（RN 内置 Vibration）、`notify`（@notifee/react-native）
- 规则列表页「模拟短信」调试入口（Modal 输入发件人/正文 → `processSms`）
- 核心逻辑单测（RuleEngine）
- Android 跑通全链路

### 本阶段不包含（后续阶段）

- 原生 SMS BroadcastReceiver 与 SmsBridge（阶段 2）
- 运行时权限请求 RECEIVE_SMS（阶段 2）
- `ringtone` / `pushToWatch` 真实实现（硬件/音频相关，保留占位）
- 模块注册机制动态化（getRoutes 收尾，工程收尾阶段）

## 设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 实现方式 | 方案 A：现有架构最小侵入改造 | 改动集中、符合项目规范、接口零变化 |
| 通知方案 | @notifee/react-native | Android 通知事实标准，支持渠道/权限 API，iOS 不受影响 |
| 动作元数据 | types 中新增动作元数据（label + 参数表单定义） | 驱动编辑 UI 按类型渲染参数表单 |
| 验证入口 | 规则列表页 headerRight「模拟」按钮 | 开发期最方便，后续可藏入调试菜单 |

## 改动清单

### 修改

| 文件 | 改动 |
|------|------|
| `src/modules/trigger/services/RuleEngine.ts` | `matchRule`：全部条件 AND 匹配且 `conditions.length > 0` 才命中 |
| `src/modules/trigger/services/ActionExecutor.ts` | `registerDefaults()`：真实实现 vibrate/notify；ringtone/pushToWatch 返回 `{success:false, error:'未实现'}` |
| `src/modules/trigger/screens/RuleEditScreen.tsx` | 单页表单：名称 + 条件列表 + 动作列表（动态增删） |
| `src/modules/trigger/screens/RuleListScreen.tsx` | headerRight 增加「模拟」按钮，弹出 SimulateSmsModal |
| `src/modules/trigger/index.ts` | `registerTriggerModule()` 内调用 `ActionExecutor.registerDefaults()` |
| `src/modules/trigger/types/index.ts` | 新增动作元数据（类型标签、参数表单定义） |

### 新增

| 文件 | 职责 |
|------|------|
| `src/modules/trigger/components/ConditionEditor.tsx` | 单条条件：字段（sender/body）× 匹配方式（contains/equals/regex）× 值输入 + 删除 |
| `src/modules/trigger/components/ActionEditor.tsx` | 单条动作：类型选择器 + 按类型渲染参数表单（notify → title/body）+ 删除 |
| `src/modules/trigger/components/SimulateSmsModal.tsx` | 模拟短信弹窗：发件人 + 正文 → `store.processSms(sender, body)` |
| `__tests__/RuleEngine.test.ts` | RuleEngine 单元测试 |

### 依赖

- 新增 `@notifee/react-native`（含 Android 原生配置：MainApplication/gradle，随实现计划落地）

## 数据流

```
编辑页保存 → store.addRule/updateRule → RuleStorage(AsyncStorage) → store.rules
     ↓
规则列表「模拟」→ Modal 输入 发件人/正文 → store.processSms(sender, body)
     ↓
RuleEngine.compare → 遍历 enabled 规则 → 全部条件 AND 匹配
     ↓
ActionExecutor.execute → vibrate（Vibration API）/ notify（Notifee 通知）
     ↓
写入 ExecutionLog → RuleStorage 保留最近 200 条 → 日志页倒序展示
```

## 错误处理

| 场景 | 处理 |
|------|------|
| 条件为空时保存 | 编辑页 Alert 拦截："至少添加一个条件" |
| 正则非法 | 匹配时 try/catch 返回 false；编辑页正则输入即时格式提示（弱校验） |
| 通知权限被拒（Android 13+） | notify 动作返回 `{success:false, error:'通知权限未授权'}`，日志页标红 |
| 未注册动作类型 | 现有逻辑记录 `No handler registered for action type` 错误日志 |
| 模拟短信无匹配 | Modal 提示"没有规则匹配"，不产生日志 |

## 测试

`__tests__/RuleEngine.test.ts`：
- AND 语义：多条件全匹配 → 命中；部分匹配 → 不命中
- 空 conditions 规则 → 不命中
- 禁用规则 → 不命中
- contains / equals / regex 三种匹配方式
- 非法正则 → 不报错、返回不匹配

验证：`npx tsc --noEmit`、`npx jest RuleEngine`、Android 模拟器/真机跑通全链路。
