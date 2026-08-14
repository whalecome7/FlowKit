# 铃声动作三选一 + 文字播报（TTS）设计文档

> 创建日期：2026-08-14
> 状态：设计中（待主人审阅）

## 背景与目标

FlowKit 的「播放铃声」动作当前仅支持：选择本地音频文件（可选）或系统默认铃声。
本次扩展：
1. **文字转语音（TTS）播报**——用户输入文字，应用语音播报（系统 TTS，离线可用）
2. **表单三选一交互**——「系统默认 / 自定义文件 / 文字播报」三种来源，按模式条件显示对应子表单

## 范围

- 原生层：新增 `TtsModule.kt`（系统 TextToSpeech 封装）
- 动作体系：`ringtone` 动作参数重构（source 三选一 + 条件子表单）
- 执行层：`ActionExecutor.ringtone` handler 三分支
- 通用机制：`ActionParamMeta.showWhen`（参数条件显示）

## 架构

```
原生层（新增）：TtsModule.kt
  - speak(text, rate, pitch) → 系统 TextToSpeech
  - 走闹钟流 USAGE_ALARM（静音也响，与铃声一致）
  - 播完自动停止（不循环）

动作体系（改造）：ACTION_META.ringtone
  source（三选一 chips）：default | file | speech
  url（filePicker）      → 仅 source=file 显示
  speakText/rate/pitch   → 仅 source=speech 显示
  duration（numeric）    → 总显示（speech 模式忽略）

执行层（改造）：ringtone handler 三分支
  source=speech 且有文字 → TTS 播报（不播铃声）
  source=file 且有 url   → 播放文件铃声（duration 限制）
  默认                   → 系统默认铃声（duration 限制）

通用机制（新增）：ActionParamMeta.showWhen?: { key: string; value: string }
  参数仅在 params[key] === value 时渲染（ActionEditor 支持）
```

## 表单设计（编辑动作 → 播放铃声）

| 参数 | 交互 | 显示条件 |
|------|------|----------|
| **声音来源** | chips：系统默认 / 自定义文件 / 文字播报 | 总显示 |
| 铃声文件（可选） | 文件选择器（现有组件） | source=file |
| 播报文字（可选） | 输入框，placeholder：*输入文字将语音播报，留空则播铃声* | source=speech |
| 语速 | chips：慢(0.7) / 正常(1.0) / 快(1.5) | source=speech |
| 音调 | chips：低沉(0.7) / 正常(1.0) / 高昂(1.3) | source=speech |
| 响铃时长(ms) | 数字输入 | 总显示（speech 忽略）|

## 数据流

```
触发短信 → RuleEngine 匹配 → ActionExecutor.execute
  → ringtone handler：
    speakText 非空（source=speech）
      → NativeModules.TtsModule.speak(text, rate, pitch)
    url 非空（source=file）
      → RingtoneModule.play(url, duration)  （现有）
    默认
      → RingtoneModule.play(null, duration) （系统默认铃声，现有）
```

## 原生 TtsModule 要点

- `TextToSpeech(context)` 异步初始化（OnInitListener），ready 前调用 reject 并日志标记失败
- `setAudioAttributes`：USAGE_ALARM + CONTENT_TYPE_SPEECH（闹钟流，静音也响）
- `setSpeechRate(0.7~1.5)`、`setPitch(0.7~1.3)`
- `speak(text, QUEUE_FLUSH, null, utteranceId)`；播完自动停止
- 引擎缺失/初始化失败 → Promise reject，ActionExecutor 记录失败日志（不影响其他动作）

## 错误处理与测试

| 项 | 处理 |
|----|------|
| TTS 引擎未就绪/缺失 | 动作日志标失败，不影响其他动作 |
| 播报文字留空（source=speech） | 视为无效，回退系统默认铃声 |
| 与铃声互斥 | 有播报文字时只播报，不播铃声（避免声音重叠） |
| 原生编译 | `./gradlew :app:compileDebugKotlin` 通过 |
| 真机回归 | ①source=speech 配文字 → 触发听到语音；②source=file → 播文件；③默认 → 系统铃声 |

## 范围界定（YAGNI）

- ❌ 不做：TTS 与铃声同时播放（互斥，避免重叠）
- ❌ 不做：播报变量（如播报短信内容 {body}）——后续可扩展
- ❌ 不做：TTS 音量键停止接入（播报短，播完自动停）
