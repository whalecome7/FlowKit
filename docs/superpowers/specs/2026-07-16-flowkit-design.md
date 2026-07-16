# FlowKit（流光）设计文档

> 创建日期：2026-07-16

## 项目概述

FlowKit（中文名"流光"）是一个 React Native 个人工具集应用，面向自用和朋友分享场景。项目采用模块化架构，后续可陆续添加各种日常实用小功能模块。首个模块为 **trigger**——一个事件驱动的自动化执行器。

## 技术栈选择

| 项目 | 选择 | 理由 |
|------|------|------|
| 框架 | React Native CLI（裸工作流） | 需要 Android 原生 SMS 广播权限，Expo 有不确定性 |
| 语言 | TypeScript | 类型安全，更好的 IDE 支持，便于维护和协作 |
| 导航 | React Navigation (Stack) | 生态事实标准，社区活跃 |
| 状态管理 | Zustand | 轻量、简洁、TypeScript 友好，适合模块化项目 |
| 模块架构 | 功能模块目录（modules/xxx/） | 每个模块自包含，低耦合，便于独立开发 |
| 模块注册 | 显式注册（手动 import） | 简单直观，完全可控 |

## 项目结构

```
FlowKit/
├── android/                          # Android 原生代码
│   └── .../trigger/                  # SMS BroadcastReceiver（trigger 模块原生层）
├── ios/                              # iOS 原生代码（trigger 模块在 iOS 上禁用）
├── src/
│   ├── app/
│   │   ├── App.tsx                   # 根组件
│   │   ├── navigation/
│   │   │   └── RootNavigator.tsx     # 根导航器，组装各模块路由
│   │   └── module-registry.ts       # 模块注册中心
│   ├── shared/                       # 跨模块共享资源
│   │   ├── types/                    # 公共类型定义
│   │   ├── hooks/                    # 公共自定义 hooks
│   │   ├── components/               # 公共 UI 组件
│   │   └── utils/                    # 公共工具函数
│   └── modules/                      # 功能模块集合
│       └── trigger/                  # 首个模块：事件驱动自动化
│           ├── index.ts              # 模块入口（注册路由、store、配置）
│           ├── components/           # 模块专属 UI 组件
│           ├── screens/              # 模块页面
│           │   ├── RuleListScreen.tsx   # 规则列表
│           │   ├── RuleEditScreen.tsx   # 创建/编辑规则
│           │   └── LogScreen.tsx        # 触发日志
│           ├── store/                # Zustand store
│           ├── services/             # 核心服务
│           │   ├── RuleEngine.ts     # 规则匹配引擎
│           │   ├── ActionExecutor.ts # 动作执行器
│           │   ├── SmsBridge.ts      # 原生 SMS Bridge 封装
│           │   └── RuleStorage.ts    # 规则持久化存储
│           └── types/                # 模块类型定义
│               └── index.ts
├── AGENTS.md                         # AI 编码助手项目级指令
├── README.md                         # 项目说明文档
└── package.json
```

## Trigger 模块设计

### 定位

Android Only 的事件驱动自动化模块，核心流程：**监听 → 匹配 → 触发**。

### 数据模型

```typescript
// 规则
interface TriggerRule {
  id: string;
  name: string;                    // 规则名称，如"银行验证码"
  enabled: boolean;                // 启用/暂停
  conditions: TriggerCondition[];  // 匹配条件（AND 关系）
  actions: TriggerAction[];        // 触发后执行的动作
  createdAt: number;
}

// 匹配条件
interface TriggerCondition {
  field: 'sender' | 'body';        // 匹配字段
  matchType: 'contains' | 'regex' | 'equals'; // 匹配方式
  value: string;                   // 匹配值
}

// 动作（接口抽象，支持扩展）
interface TriggerAction {
  type: string;                    // 动作类型标识
  params: Record<string, unknown>; // 动作参数
}

// 执行日志
interface ExecutionLog {
  id: string;
  ruleId: string;                  // 触发的规则 ID
  ruleName: string;                // 规则名称（冗余，便于展示）
  smsSender: string;               // 短信发件人
  smsBody: string;                 // 短信正文（截断存储）
  triggeredAt: number;             // 触发时间
  actions: Array<{
    type: string;
    success: boolean;
    error?: string;
  }>;
}
```

### 功能流转

```
Android SMS 广播 (android.provider.Telephony.SMS_RECEIVED)
       ↓
  BroadcastReceiver → 解析 SMS (sender, body, timestamp)
       ↓
  通过 React Native Bridge → 发送到 JS 线程
       ↓
  RuleEngine.compare(sms, rules)
  ├── 遍历所有 enabled 规则
  ├── 对每条规则的 conditions 做 AND 匹配
  └── 返回匹配到的规则列表
       ↓
  ActionExecutor.execute(matchedRules)
  ├── 按规则顺序依次执行动作
  ├── 每个动作通过 ActionHandler 分发
  └── 记录执行日志
       ↓
  通知用户（可选：状态栏通知）
```

### 核心服务

| 服务 | 职责 |
|------|------|
| **SmsBridge** | 封装原生模块，注册 SMS BroadcastReceiver，接收并解析短信，通过 EventEmitter 发给 JS |
| **RuleEngine** | 纯函数式规则匹配引擎，输入短信内容和规则列表，输出匹配结果，匹配器接口可扩展 |
| **ActionExecutor** | 动作调度器，维护 ActionHandler 注册表，按 ActionType 分发执行，记录执行状态 |
| **RuleStorage** | AsyncStorage CRUD 封装，提供规则的增删改查接口，与 Zustand store 同步 |

### 内置动作类型

| 动作类型 | 说明 | 参数 |
|---------|------|------|
| `ringtone` | 播放铃声 | `url?: string` 铃声文件路径，默认系统铃声 |
| `vibrate` | 震动 | `duration?: number` 震动时长（毫秒） |
| `notify` | 状态栏通知 | `title: string, body: string` |
| `pushToWatch` | 推送到手表 | `title: string, body: string` |

### 权限与后台

- `android.permission.RECEIVE_SMS`：运行时权限，用户首次进入模块时请求
- `android.permission.FOREGROUND_SERVICE`（可选）：前台服务持久监听，提升后台存活率
- `android.permission.VIBRATE`：震动权限
- `android.permission.POST_NOTIFICATIONS`：通知权限（Android 13+）
- 兼容 Android 6.0+（API 23+）

### 存储方案

- **规则数据**：AsyncStorage，JSON 序列化存储
- **执行日志**：AsyncStorage，保留最近 200 条
- **未来扩展**：存储后端通过接口抽象，可替换为 SQLite 或其他方案

## 模块注册机制

```typescript
// src/app/module-registry.ts

interface ModuleConfig {
  id: string;
  name: string;            // 展示名称（中文）
  homeRoute: string;       // 模块首页路由名称
  enabled: boolean;        // 是否启用
  getRoutes: () => JSX.Element[];  // 返回该模块的导航路由组件
}

class ModuleRegistry {
  private modules: Map<string, ModuleConfig> = new Map();

  register(config: ModuleConfig): void { ... }
  getEnabledModules(): ModuleConfig[] { ... }
  getAllRoutes(): JSX.Element[] { ... }
}
```

## 导航结构

```
RootNavigator (Stack)
├── HomeScreen          # 首页：模块入口卡片列表
└── [模块路由动态注入]
    └── trigger
        ├── TriggerRuleList     # 规则列表
        ├── TriggerRuleEdit     # 创建/编辑规则
        └── TriggerLog          # 触发日志
```

首页显示已注册且已启用的模块卡片列表。新的功能模块注册后自动出现在首页。

## README.md 内容规划

- 项目名称和简介
- 功能模块列表（当前仅 trigger）
- 快速开始（环境要求、安装、运行 Android/iOS）
- 项目结构简述
- 如何添加新模块
- 许可（MIT）

## AGENTS.md 内容规划

- 项目概况和技术栈
- 目录约定和模块化结构说明
- 模块开发规范（创建、注册、导航）
- 命名约定（文件、组件、store、路由）
- 代码规范（TypeScript strict、组件风格）
- trigger 模块 Android Only 限制
- 常用命令

## 设计决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 平台 | RN CLI 裸工作流 | SMS 广播需原生能力 |
| 状态管理 | Zustand | 轻量、模块化友好 |
| 模块架构 | 功能目录 | 低耦合，易维护扩展 |
| 规则存储 | AsyncStorage | 简单够用，接口预留替换 |
| 动作系统 | 接口抽象 | 内置常用，支持扩展 |
| iOS 支持 | 禁用 trigger | iOS 后台短信监听不可行 |
