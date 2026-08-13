# Trigger 保活与权限设计文档

> 创建日期：2026-08-13
> 状态：已批准（主人确认方案 A 与全部设计章节）

## 背景

FlowKit 短信触发器需要 7x24 小时运行（监听"未按规定停放"等短信并即时提醒）。两个核心风险点：

1. **保活**：Android 8+ 后台限制（Doze/App Standby/厂商清理）会冻结或杀死普通后台 app，必须保证持续监听。
2. **权限**：打包安装后各权限必须正常工作（读短信、通知、铃声、震动、电池豁免）。

## 关键决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 保活方案 | 方案 A：前台服务 + 短信豁免广播 + 开机自启 + 电池白名单 | 覆盖两个风险点，无引导页，业界标准做法 |
| 常驻通知 | 接受（前台服务强制要求） | 保活核心，可低优先级折叠显示 |
| 参考 GKD | 仅借鉴思路，不照搬无障碍保活 | GKD 保活本质是无障碍服务（收不了短信广播），短信场景不适用；为保活请求无障碍权限体验重且敏感 |
| 引导页 | 不做（主人明确） | 电池白名单用系统标准弹窗授权即可 |

## 架构与组件

### 原生层（Kotlin，新增 4 文件）

| 组件 | 职责 |
|------|------|
| `SmsReceiver.kt`（BroadcastReceiver） | 监听 `SMS_RECEIVED`（Android 8+ 隐式广播豁免名单），解析 sender/body，确保前台服务运行，通过 NativeModule 推给 JS |
| `KeepAliveService.kt`（Foreground Service） | 常驻通知「FlowKit 正在监听短信」，保活核心；App 启动 / 短信到达 / 开机自启时拉起 |
| `SmsBridgeModule.kt`（NativeModule） | 向 JS 暴露 `startService()` 与短信事件通道（DeviceEventEmitter） |
| `BootReceiver.kt`（BroadcastReceiver） | `BOOT_COMPLETED` 开机后自动重启前台服务 |

### JS 层（新增 2 文件 + 2 处改动）

| 文件 | 职责 |
|------|------|
| `services/SmsBridge.ts` | 封装原生模块，监听短信事件 → `store.processSms`；启动竞态时缓存最近一条短信待 JS 就绪补发 |
| `services/Permissions.ts` | 权限请求编排 + `usePermissionStore`（Zustand：smsGranted/notifyGranted/batteryExempt 三态） |
| `screens/RuleListScreen.tsx` 改 | 首次进入触发权限请求 + 启动保活服务；顶部权限状态条 |
| `trigger/index.ts` 改 | 模块注册时初始化 SmsBridge 事件监听 |

## 短信全链路数据流

```
真实短信到达 (SMS_RECEIVED)
   → SmsReceiver 解析 sender/body（豁免广播，App 被杀也能唤醒）
   → 拉起/确认 KeepAliveService（常驻通知）
   → SmsBridgeModule 发事件给 JS
   → store.processSms(sender, body)
   → RuleEngine 匹配 → ActionExecutor 执行 4 动作 → 写日志
```

## Manifest 权限清单

| 权限 | 类型 | 用途 | 现状 |
|------|------|------|------|
| `RECEIVE_SMS` | 危险 | 接收短信 | ❌ 新增 |
| `POST_NOTIFICATIONS` | 危险 | 通知（Android 13+） | ✅ 已有 |
| `VIBRATE` | 普通 | 震动 | ✅ 已有 |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | 特殊 | 电池白名单（保活关键） | ❌ 新增 |
| `FOREGROUND_SERVICE` | 普通 | 前台服务 | ❌ 新增 |
| `FOREGROUND_SERVICE_SPECIAL_USE` | 普通 | Android 14+ 前台服务类型 | ❌ 新增 |
| `RECEIVE_BOOT_COMPLETED` | 普通 | 开机自启 | ❌ 新增 |

注：debug 与 release 包 manifest 一致，不存在"打包后权限失效"。

## 运行时权限请求流程

首次进入短信触发器，顺序执行：

1. `RECEIVE_SMS` → `PermissionsAndroid.request`；拒绝 → 列表页黄条「缺少短信权限，无法自动触发」，模拟按钮保留
2. `POST_NOTIFICATIONS` → Notifee.requestPermission（已实现）；华为等系统通知默认关 → Notifee 检测渠道状态 + 一次性提示手动开启
3. 电池白名单 → 原生弹系统授权框；拒绝 → 提示「可能被系统清理，建议开启」
4. 启动 KeepAliveService → 通知栏常驻通知

权限状态由 `usePermissionStore` 统一管理，列表页状态条实时反映。

## 错误处理与降级

| 场景 | 处理 |
|------|------|
| 短信权限被拒 | 黄条提示 + 模拟入口保留 |
| App 被系统杀死 | 豁免广播唤醒 → 自动拉起服务并触发 |
| 手机重启 | `BOOT_COMPLETED` 自动重启服务 |
| 前台服务被厂商深度清理 | 广播唤醒兜底；日志记录可观察 |
| 原生事件通道未就绪（启动竞态） | SmsBridge 缓存最近短信，JS 就绪后补发 |
| 通知被系统关闭 | 状态条提示一键跳系统设置 |

## 真机验证方案

| 验证项 | 方法 |
|--------|------|
| 真实短信触发 | `adb shell am broadcast -a android.provider.Telephony.SMS_RECEIVED --es sender "10086" --es body "未按规定停放"` |
| 被杀后仍触发 | 强制停止 App → 发短信广播 → 验证唤醒 + 4 动作全触发 |
| 保活持续 | 锁屏 1 小时 → 发短信 → 仍触发；常驻通知在位 |
| 开机自启 | 重启手机 → 常驻通知自动出现 |
| 打包权限 | release 包安装 → 权限流程 + 真实短信触发 |

## 范围界定（YAGNI）

- ❌ 不做：无障碍保活、双进程守护（Android 8+ 已废弃）、引导页
- ❌ 不做：多账号/云端同步等无关功能
- ✅ 做：方案 A 全部（前台服务 + 短信广播 + 开机自启 + 电池白名单 + 权限编排）
