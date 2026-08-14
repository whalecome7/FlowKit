# 铃声动作三选一 + 文字播报（TTS）实现计划

**Goal:** ringtone 动作三选一（系统默认/自定义文件/文字播报）+ 系统 TTS 语音播报

**Spec:** `docs/superpowers/specs/2026-08-14-ringtone-tts-design.md`

---

### Task 1: 原生 TtsModule + 注册

**Files:**
- Create: `android/app/src/main/java/com/flowkit/TtsModule.kt`
- Modify: `android/app/src/main/java/com/flowkit/FlowKitPackage.kt`

- [ ] TtsModule.kt：TextToSpeech 封装（init 异步、USAGE_ALARM 闹钟流、speak(text,rate,pitch) Promise、播完自动停）

```kotlin
package com.flowkit

import android.media.AudioAttributes
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

class TtsModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var tts: TextToSpeech? = null
  private var ready = false

  override fun getName(): String = "TtsModule"

  init {
    tts = TextToSpeech(reactContext) { status ->
      ready = status == TextToSpeech.SUCCESS
      if (ready) {
        tts?.language = Locale.getDefault()
      }
    }
  }

  @ReactMethod
  fun speak(text: String, rate: Double, pitch: Double, promise: Promise) {
    val engine = tts ?: run { promise.reject("TTS_UNAVAILABLE", "TTS 引擎不可用"); return }
    if (!ready) {
      promise.reject("TTS_NOT_READY", "TTS 未初始化完成")
      return
    }
    engine.setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    )
    engine.setSpeechRate(rate.toFloat().coerceIn(0.5f, 2.0f))
    engine.setPitch(pitch.toFloat().coerceIn(0.5f, 2.0f))
    engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String?) {}
      override fun onDone(utteranceId: String?) { promise.resolve(true) }
      override fun onError(utteranceId: String?) {
        promise.reject("TTS_ERROR", "播报失败")
      }
      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String?, errorCode: Int) {
        promise.reject("TTS_ERROR", "播报失败 code=$errorCode")
      }
    })
    engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "flowkit-tts")
  }

  @ReactMethod
  fun stop() {
    tts?.stop()
  }
}
```

- [ ] FlowKitPackage.kt listOf 追加 `TtsModule(reactContext)`

### Task 2: 类型重构（showWhen + ringtone 参数）

**Files:** Modify: `src/modules/trigger/types/index.ts`

- [ ] `ActionParamMeta` 加 `showWhen?: { key: string; value: string }`
- [ ] ringtone params 重构：

```typescript
{
  type: 'ringtone',
  label: '播放铃声',
  params: [
    {
      key: 'source',
      label: '声音来源',
      disableInput: true,
      presets: [
        { label: '系统默认', value: 'default' },
        { label: '自定义文件', value: 'file' },
        { label: '文字播报', value: 'speech' },
      ],
    },
    {
      key: 'url',
      label: '铃声文件（可选）',
      filePicker: 'audio',
      showWhen: { key: 'source', value: 'file' },
    },
    {
      key: 'speakText',
      label: '播报文字（可选）',
      placeholder: '输入文字将语音播报，留空则播铃声',
      showWhen: { key: 'source', value: 'speech' },
    },
    {
      key: 'rate',
      label: '语速',
      disableInput: true,
      showWhen: { key: 'source', value: 'speech' },
      presets: [
        { label: '慢', value: '0.7' },
        { label: '正常', value: '1.0' },
        { label: '快', value: '1.5' },
      ],
    },
    {
      key: 'pitch',
      label: '音调',
      disableInput: true,
      showWhen: { key: 'source', value: 'speech' },
      presets: [
        { label: '低沉', value: '0.7' },
        { label: '正常', value: '1.0' },
        { label: '高昂', value: '1.3' },
      ],
    },
    { key: 'duration', label: '响铃时长(ms)', placeholder: '5000', numeric: true },
  ],
},
```

### Task 3: ActionEditor 支持 showWhen

**Files:** Modify: `src/modules/trigger/components/ActionEditor.tsx`

- [ ] 参数渲染前判断：`if (param.showWhen && String(action.params?.[param.showWhen.key] ?? '') !== param.showWhen.value) return null;`

### Task 4: ringtone handler 三分支

**Files:** Modify: `src/modules/trigger/services/ActionExecutor.ts`

- [ ] ringtone handler 顶部加：

```typescript
      const params = action.params ?? {};
      const source = String(params.source ?? 'default');
      const speakText =
        typeof params.speakText === 'string' ? params.speakText.trim() : '';
      // 文字播报（TTS）：有播报文字时优先，不播铃声
      if (source === 'speech' && speakText) {
        const rate = typeof params.rate === 'number' ? params.rate : 1.0;
        const pitch = typeof params.pitch === 'number' ? params.pitch : 1.0;
        const nativeTts = NativeModules.TtsModule;
        if (nativeTts) {
          await nativeTts.speak(speakText, rate, pitch);
          return { success: true };
        }
        return { success: false, error: 'TTS 不可用' };
      }
      // 自定义文件铃声（现有 RingtoneModule 逻辑，source=file 或 url 非空）
      const url = String(params.url ?? '');
      ...（现有逻辑，url 空则系统默认）
```

### Task 5: 验证 + 提交

- [ ] `npx tsc --noEmit` 0 报错
- [ ] `cd android && ./gradlew :app:compileDebugKotlin` BUILD SUCCESSFUL
- [ ] 构建安装真机：source=speech 配文字 → 触发听到语音；source=file → 播文件；默认 → 系统铃声
- [ ] commit + push
