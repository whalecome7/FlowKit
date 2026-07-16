# AGENTS.md

> FlowKit（流光）项目级 AI 辅助编码指令。目标读者：AI 编码助手。

## 项目概况

FlowKit 是一个 React Native 个人工具集应用，中文名"流光"。面向自用和朋友分享场景，采用模块化架构，按需扩展各功能模块。

**技术栈：** React Native CLI（裸工作流）、TypeScript、React Navigation（Stack）、Zustand、AsyncStorage

## 目录约定

```
src/
├── app/              # 应用核心（导航、模块注册、首页）
├── shared/           # 跨模块共享资源（类型、hooks、组件、工具）
└── modules/          # 功能模块集合，每个模块自包含
    └── <module>/     # 模块目录
        ├── index.ts  # 模块入口，导出注册函数和配置
        ├── types/    # 模块专属类型
        ├── services/ # 模块服务层（业务逻辑）
        ├── store/    # Zustand store
        ├── screens/  # 页面组件
        └── components/ # 模块专属 UI 组件
```

## 模块开发规范

### 创建新模块

1. 在 `src/modules/<module-name>/` 下创建目录结构（参考 `trigger/`）
2. 定义模块类型 → 实现服务 → 创建 store → 构建页面
3. 编写 `index.ts`，导出 `ModuleConfig` 和 `registerXxxModule()` 函数
4. 在 `src/app/App.tsx` 中：
   - import 注册函数并调用
   - 添加模块路由的 `Stack.Screen`

### 命名约定

| 类别 | 约定 | 示例 |
|------|------|------|
| 文件 | PascalCase（组件）、camelCase（其他） | `HomeScreen.tsx`、`module-registry.ts` |
| 组件 | PascalCase | `RuleListScreen`、`LogCard` |
| Store | `useXxxStore` | `useTriggerStore` |
| 路由 | PascalCase，模块名前缀 | `TriggerRuleList`、`TriggerLog` |
| 类型 | I 前缀或描述性命名 | `TriggerRule`、`ModuleConfig` |

### 代码规范

- TypeScript strict 模式
- 组件使用函数式组件 + hooks
- 类型优先定义在模块 `types/` 目录
- 跨模块共享的类型放在 `src/shared/types/`
- 避免 any，使用 unknown + 类型守卫

### 当前限制

- **trigger 模块 Android Only**（iOS 不支持后台 SMS 监听）
  - 模块注册时 `enabled: Platform.OS === 'android'`
  - 首页卡片对 iOS 用户隐藏

## 常用命令

```bash
# 启动 Android
npx react-native run-android

# 启动 iOS
cd ios && pod install && cd .. && npx react-native run-ios

# TypeScript 类型检查
npx tsc --noEmit

# 清理缓存
npx react-native start --reset-cache
```
