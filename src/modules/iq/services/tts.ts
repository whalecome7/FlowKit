import { NativeModules, Platform } from 'react-native';

/** 朗读文本（Android 复用 trigger 的原生 TtsModule；iOS 或其他环境静默降级）。
 *  volume 传 0 表示跟随系统音量。 */
export function speakText(text: string): void {
  if (Platform.OS !== 'android') return;
  const tts = NativeModules.TtsModule as
    | { speak: (t: string, rate: number, pitch: number, volume: number) => Promise<void> }
    | undefined;
  if (!tts) return;
  tts.speak(text, 1.0, 1.0, 0).catch(() => undefined);
}
