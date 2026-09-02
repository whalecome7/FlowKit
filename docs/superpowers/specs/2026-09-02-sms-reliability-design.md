# 短信触发可靠性修复设计（重复铃声 / 通知可见性 / 后台保活）

日期：2026-09-02
状态：已批准

## 背景

真机（小米 HyperOS/MIUI）数天实际使用发现三个问题：

1. **一条短信响两次铃**：锁屏时触发一次铃声（正常），解锁打开应用后又触发一次。
2. **常驻通知被清空**：「FlowKit 正在工作」通知消失，但后台任务中应用仍在（升级小米系统后出现，疑似通知权限/渠道被重置）。
3. **后台偶发被杀**：已设置后台运行锁 + 自启动，仍出现一次后台任务中应用消失。

### 根因分析

**问题 1 —— 双链路重复触发**：短信处理存在两条互不感知的链路：

| 链路 | 入口 | 动作执行方 |
|------|------|-----------|
| 广播链 | `SmsReceiver`（SMS_RECEIVED）→ `emitSms()` 直发 JS 事件 | JS（RuleEngine + ActionExecutor） |
| 数据库链 | `checkNewSms()`（ContentObserver + 10 秒轮询 + 30 秒闹钟） | 原生（SmsNativeEngine 闭环） |

两个叠加 bug：

- 广播链的 `emitSms` 不更新去重标记 `lastSmsId`，绕过 `checkNewSms` 的 id 去重 → 两条链各处理一次。
- `emitSms`/`emitSmsWithLog` 把短信缓存进 `pendingSms` 且**从不清除**；JS 启动时 `getPendingSms` 补发且不带 `nativeHandled` 标记 → JS 再次匹配执行 → 第二次铃响。小米 ROM 不分发短信广播（代码注释已记录），锁屏第一次铃来自数据库链原生闭环，第二次铃即来自补发重放。

**问题 2 —— 通知渠道问题（独立于服务存活）**：用户确认「后台还在、通知没了」，即服务未死、通知消失。最可能原因：升级 HyperOS 重置了通知权限或渠道设置（Android 13+ 通知权限被关时前台服务照常运行但通知不显示）；且现有渠道 `flowkit-keepalive` 为 IMPORTANCE_MIN，会被 MIUI 智能收纳。

**通知的功能性评估**：常驻通知不承担任何功能（服务运行、触发执行均不依赖它），但它是用户感知后台存活的唯一信号，应保留并修复可见性。

**问题 3 —— 保活链三处断裂**：

1. `setExactAndAllowWhileIdle` 为一次性闹钟，仅在 `KeepAliveService.onCreate()` 注册；闹钟 fire 后 `KeepAliveAlarmReceiver` 只 `startForegroundService`，服务存活时走 `onStartCommand` 不重新注册闹钟 → 服务连续存活 30 秒后闹钟保活链永久断裂，被杀后无机制唤回。
2. targetSdk 36 上 `setExactAndAllowWhileIdle` 需要 Manifest 声明 `SCHEDULE_EXACT_ALARM` 权限，目前未声明 → 每次抛 `SecurityException` 静默降级为不可靠的 inexact `set()`（catch 兜底掩盖了问题）。
3. START_STICKY 在 MIUI 上经常被忽略，只能依赖闹钟兜底——而闹钟链已断。

用户环境：小米 HyperOS/MIUI，已开启自启动，已加后台运行锁。

## 设计

### 第 1 节：触发去重（问题 1）

**原则：短信处理收敛到数据库链，广播只负责拉起服务。**

| 文件 | 改动 |
|------|------|
| `SmsReceiver.kt` | `onReceive` 保留拉起 `KeepAliveService`，删除 `emitSms()` 调用 |
| `SmsBridgeModule.kt` | 删除 `pendingSms` 变量、`getPendingSms` 方法、`emitSms`/`emitSmsWithLog` 中的缓存写入；两个 emit 静态方法保留（仍是 `checkNewSms` 通知 JS 的通道） |
| `SmsBridge.ts` | `initSmsBridge` 删除 `getPendingSms` 补发块 |

**数据流（改后）**：短信入库 → ContentObserver（秒级）/ 10 秒轮询 / 30 秒闹钟兜底 → `checkNewSms` 以 `lastSmsId` 去重 → `SmsNativeEngine.handleSms` 原生执行动作 → JS 收 `nativeHandled` 事件仅记日志；无规则快照时发裸事件（JS 活着则记短信日志）。

**错误处理**：广播先到、短信未入库 → 等 Observer/轮询捕获（秒级延迟可接受）；开机后规则快照未同步的窗口期内短信由裸事件交给 JS（若 JS 已启动）。

**接受的取舍**：

- 非小米 ROM 上触发延迟从「广播即时」变为「入库后秒级」（用户为小米，无感知）。
- JS 未启动期间未命中规则的短信不记日志（影响极小）。
- 移除 `pendingSms` 补发机制：它保护的场景（app 被杀期间补发）在数据库链下已无意义。

### 第 2 节：通知可见性（问题 2）

| 文件 | 改动 |
|------|------|
| `KeepAliveService.kt` | 渠道 id 换为 `flowkit-keepalive-v2`，重要性 LOW（渠道重要性创建后不可改，须换新 id；LOW 显示状态栏图标且不被收纳，MIN 会被 MIUI 收纳） |
| `SmsBridgeModule.kt` | `getDiagnostics` 增加：保活渠道是否被禁用（`IMPORTANCE_NONE` 检测）、精确闹钟授权状态 |
| `SmsBridgeModule.kt` | 新增 `@ReactMethod openNotificationSettings()`：跳转系统应用通知设置页 |
| `DiagnosticsScreen.tsx` | 展示「保活通知」状态；权限被关/渠道被禁时红色提示 +「去开启」按钮 |

**渠道重要性选择说明**：用户询问能否设为最高。HIGH 会导致前台服务每次重启（被杀后自动拉回、开机拉起）都弹浮动横幅+提示音，日常吵闹；且通知被清空的根因是权限重置而非重要性不足。经确认选 LOW。

### 第 3 节：保活链修复（问题 3）

| 文件 | 改动 |
|------|------|
| `AndroidManifest.xml` | 增加 `SCHEDULE_EXACT_ALARM` 权限 |
| `KeepAliveService.kt` | `scheduleAlarm` 重构为静态 `scheduleNextAlarm(context)`；`onStartCommand` 每次被 start 都续期闹钟；`onDestroy` 写入 `service_dead_ts` 诊断时间戳 |
| `KeepAliveAlarmReceiver.kt` | `onReceive` 末尾重新注册下一次闹钟（自续期，修断链）；`startForegroundService` 包 try-catch（防御 Android 12+ FGS 启动限制） |
| `SmsReceiver.kt` / `BootReceiver.kt` | `startForegroundService` 同样包 try-catch |
| `SmsBridgeModule.kt` | `getDiagnostics` 增加 `canScheduleExactAlarms()`（API 31+）与 `serviceDeadTs` |
| `DiagnosticsScreen.tsx` | 展示精确闹钟授权（未授权可跳 `ACTION_REQUEST_SCHEDULE_EXACT_ALARM` 引导页）与「上次服务销毁时间」，用于定位被杀时机 |

**保活链（改后）**：闹钟 fire → 查短信 + 确保服务存活 → 重新注册下一次闹钟 → 无限循环。服务被杀后 30 秒内被闹钟唤回（精确闹钟授权后；未授权则降级 inexact，链不断但 Doze 下有分钟级延迟）。

**未采纳的备选**：WorkManager 周期兜底（15 分钟最小粒度、新依赖、MIUI 同样受限，留作本方案失效后的备选）；双前台服务互拉（过度工程）。

## 测试计划

- `npx tsc --noEmit` 类型检查；现有 `RuleEngine.test.ts` / `triggerStats.test.ts` 保持通过。
- 真机手动验证（小米）：
  1. 发一条真实短信 → **只响一次铃、日志只一条**（核心验收）。
  2. 冷启动/重新打开应用 → 不重放旧短信。
  3. `adb shell am kill com.flowkit`（保留闹钟的温和杀进程）→ 30 秒内诊断页心跳恢复。
  4. 通知权限关闭 → 诊断页红色提示、跳设置有效；升级安装后新渠道 LOW 生效、状态栏图标可见。

## 验收标准

1. 一条短信全链路（锁屏→解锁→打开应用）只触发一次动作。
2. 常驻通知在通知权限开启时稳定显示于状态栏与下拉栏。
3. 服务被系统杀死后 30 秒内自动恢复（诊断页心跳恢复、通知重新出现）。
4. 诊断页能展示：通知/渠道状态、精确闹钟授权、上次服务销毁时间，并提供对应跳转引导。
