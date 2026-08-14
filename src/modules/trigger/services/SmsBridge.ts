import { NativeModules, DeviceEventEmitter } from 'react-native';
import { useTriggerStore } from '../store';

const { SmsBridge } = NativeModules;

let initialized = false;

/**
 * 初始化短信桥接：注册事件监听 + 竞态补发 + 启动保活服务。
 * 在模块注册时调用一次。
 * 注意：原生模块通过 DeviceEventEmitterModule 发事件，JS 侧必须用
 * 全局 DeviceEventEmitter 监听（经典 NativeModule 无 addListener，
 * 用 NativeEventEmitter 会警告并可能在新架构下崩溃）。
 */
export function initSmsBridge(): void {
  if (!SmsBridge || initialized) return;

  DeviceEventEmitter.addListener(
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

  // 尝试注册短信数据库监听（READ_SMS 已授权时；未授权则等授权后 refreshWatcher）
  SmsBridge.refreshWatcher?.();

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
