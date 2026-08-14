# FlowKit UX 打磨与功能增强设计文档

> 创建日期：2026-08-14
> 状态：设计中（待主人审阅）

## 背景

FlowKit 核心链路（短信触发 + 保活 + 四动作）已上线，本轮聚焦**用户体验打磨 + 10 项功能增强**。

## 范围（10 项）

| # | 功能 | 类型 |
|---|------|------|
| 1 | 全套深浅主题（浅色/深色/自适应） | 视觉 |
| 2 | 编辑页卡片弹窗化 + 动作开关 + 条件删除隐藏 | UI 重构 |
| 3 | 震动增强（模式/节奏/amplitude 力度） | 功能 |
| 4 | 日志全量记录修复 | Bug 修复 |
| 5 | 应用图标（主人选图，mipmap+adaptive icon 集成） | 视觉 |
| 6 | 模拟短信快捷模板 | 体验 |
| 7 | 规则复制 | 功能 |
| 8 | 通知直达日志 | 体验 |
| 9 | 规则导入导出（JSON） | 功能 |
| 10 | 短信监听记录列表（全部+命中状态） | 功能 |

## 架构

```
主题层（新增）：src/theme/colors.ts + ThemeContext.tsx
数据层（增强）：TriggerAction.enabled、SmsRecord + useSmsLogStore、日志全量
原生层（扩展）：VibrationModule amplitude、图标 mipmap
UI 层（改造）：编辑页 Modal 化、日志页 Tab、模拟模板、复制/导入导出入口
```

## 设计要点

### 1. 主题系统
- `src/theme/colors.ts`：light/dark 两套 token（background/surface/text/primary/border/muted 等）
- `src/theme/ThemeContext.tsx`：`ThemeProvider` + `useTheme()`，支持 `light | dark | system` 三态
- 手动切换入口：首页右上角按钮循环切换；system 模式用 `useColorScheme()` 跟随
- 全 UI 颜色 token 化（App.tsx / HomeScreen / trigger 全部页面组件）

### 2. 编辑页弹窗化 + 动作开关
- `TriggerAction` 增加 `enabled?: boolean`（缺省 true）
- 点击条件卡/动作卡 → Modal 内编辑表单（复用现有字段组件）
- 动作卡显示 Switch；`ActionExecutor.execute` 跳过 `enabled === false` 并记录 `skipped`
- 条件卡仅 1 条时隐藏 ✕ 删除按钮

### 3. 震动增强
- `ACTION_META.vibrate` 参数：`mode`（gentle/standard/urgent/custom）+ `pattern`（节奏串 "200,100,300"）+ `amplitude`（1-255）
- 原生 `VibrationModule.kt` 新增 amplitude 支持（VibrationEffect，API 26+；不支持则降级 pattern）
- `ActionExecutor.vibrate` handler 解析模式 → 参数 → 原生模块

### 4. 日志全量记录
- 修复 store 日志存储逻辑（当前只保留少量）
- 全部触发日志持久化，日志页 FlatList 虚拟化

### 5. 应用图标
- 主人选定源图（薄荷绿 3D 风格）→ 生成全套 mipmap（mdpi~xxxhdpi）+ adaptive icon（前景/背景）
- 替换 `android/app/src/main/res/mipmap-*/ic_launcher*`

### 6. 模拟短信快捷模板
- `SimulateSmsModal` 增加常用模板 chips（如「未按规定停放」/「您的验证码是」），点击填入正文

### 7. 规则复制
- 规则列表卡片长按 → 复制（深拷贝，新 id，名称加「副本」）

### 8. 通知直达日志
- Notifee `onForegroundEvent` / 背景事件处理 PRESS → 全局导航（navigationRef）跳 `TriggerLog`

### 9. 规则导入导出
- 触发页 header「导出」：规则 JSON（share 面板/复制）
- 「导入」：解析粘贴的 JSON，校验格式，失败提示不破坏现有数据

### 10. 短信监听记录列表
- 新 `useSmsLogStore`：记录全部监听短信 `{id, sender, body, time, matchedRuleNames[]}`，上限 500 滚动
- 写入点：`store.processSms`（无论是否匹配都记录）
- `LogScreen` 改 Tab：「触发日志」/「短信记录」

## 数据流

```
主题：App.tsx → ThemeProvider → useTheme() → 全 UI
短信记录：SmsReceiver → SmsBridge → processSms
  ├─ useSmsLogStore.add（全部 + 命中规则名）
  └─ RuleEngine 匹配 → ActionExecutor（disabled 动作跳过+skipped 标记）
通知直达：Notifee PRESS → navigationRef.navigate('TriggerLog')
导入导出：规则 JSON 序列化/反序列化
```

## 错误处理与测试

| 项 | 处理 |
|----|------|
| 主题 | 默认浅色兜底 |
| 导入失败 | 提示「规则文件格式无效」，不破坏现有 |
| amplitude 不支持 | 降级 pattern |
| 动作开关 | RuleEngine 单测：disabled 动作跳过 |
| 短信记录 | store 单测：500 滚动 + 命中状态 |
| 回归 | 现有 9 单测保持绿 + tsc 0 报错 |

## 范围界定（YAGNI）

- ❌ 不做：主题色自定义调色板（本轮仅 light/dark/system）
- ❌ 不做：日志云端同步、删除日志交互（后续）
- ❌ 不做：图标在 App 内更换（固定）
