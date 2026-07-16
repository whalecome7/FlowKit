# FlowKit（流光）

> 一个自用/朋友间的 React Native 日常工具集。模块化设计，按需扩展。

## 功能模块

| 模块 | 说明 | 平台 |
|------|------|------|
| 短信触发器 (trigger) | 监听短信，匹配规则，自动执行动作。即将上线 | Android |

## 快速开始

### 环境要求

- Node.js 18+
- React Native CLI
- Android Studio (Android)
- Xcode (iOS)

### 安装

```bash
git clone <repo-url>
cd FlowKit
npm install
```

### 运行

**Android:**

```bash
npx react-native run-android
```

**iOS:**

```bash
cd ios && pod install && cd ..
npx react-native run-ios
```

## 项目结构

```
src/
├── app/                  # 应用核心
│   ├── App.tsx           # 根组件
│   ├── navigation/       # 导航器
│   ├── screens/          # 首页
│   ├── module-registry.ts # 模块注册中心
│   └── types/            # 核心类型
├── shared/               # 跨模块共享
│   ├── types/            # 公共类型
│   ├── hooks/            # 公共 hooks
│   ├── components/       # 公共 UI 组件
│   └── utils/            # 公共工具
└── modules/              # 功能模块集合
    └── trigger/          # 短信触发器模块
        ├── index.ts      # 模块入口
        ├── screens/      # 页面
        ├── services/     # 服务层
        ├── store/        # Zustand store
        ├── components/   # UI 组件
        └── types/        # 类型定义
```

## 技术栈

- React Native CLI（裸工作流）
- TypeScript
- React Navigation
- Zustand（状态管理）
- AsyncStorage（本地存储）

## 添加新模块

1. 在 `src/modules/` 下创建模块目录（参考 `trigger/` 的结构）
2. 定义模块类型、服务、store、页面
3. 编写模块入口 `index.ts`，调用 `moduleRegistry.register()`
4. 在 `src/app/App.tsx` 中导入路由并添加 `Stack.Screen`

## 许可

MIT
