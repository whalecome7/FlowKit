import { NativeModules, NativeEventEmitter } from 'react-native';
import { useTriggerStore } from '../store';

const { SmsBridge } = NativeModules;

let initialized = false;

/**
 * 初始化短信桥接：注册事件监听 + 竞态补发 + 启动保活服务。
 * 在模块注册时调用一次。
 */
export function initSmsBridge(): void {
  if (!SmsBridge || initialized) return;

  const emitter = new NativeEventEmitter(SmsBridge);
  emitter.addListener(
    'onSmsReceived',
    (event: { sender: string; body: string }) => {
      void useTriggerStore.getState().processSms(event.sender, event.body);
    },
  );

  // 启动竞态补发：App 被杀期间到达的短信
  SmsBridge.getPendingSms?.(
    (pending: { sender: string; body: string } | null) => {
      if (pending) {
        void useTriggerStore.getState().processSms(pending.sender, pending.body);
      }
    },
  );

  // 确保保活服务在跑
  SmsBridge.startService?.();

  initialized = true;
}

/** 查询电池白名单状态 */
export function isBatteryExempt(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!SmsBridge?.isIgnoringBatteryOptimizations) {
      resolve(false);
      return;
    }
    SmsBridge.isIgnoringBatteryOptimizations((exempt: boolean) => resolve(exempt));
  });
}

/** 请求加入电池白名单（弹系统授权框） */
export function requestBatteryExempt(): void {
  SmsBridge?.requestIgnoreBatteryOptimizations?.();
}
