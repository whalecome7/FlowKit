import { NativeModules, DeviceEventEmitter } from 'react-native';
import type { TriggerRule } from '../types';

const { SmsBridge } = NativeModules;

let initialized = false;

/** 原生闭环事件：原生已匹配并执行动作时的补充信息 */
export interface NativeHandledInfo {
  ruleName: string;
  actionResults: { type: string; success: boolean }[];
}

/**
 * 初始化短信桥接：注册事件监听 + 竞态补发 + 启动保活服务。
 * 在模块注册时调用一次。
 * 注意：原生模块通过 DeviceEventEmitterModule 发事件，JS 侧必须用
 * 全局 DeviceEventEmitter 监听（经典 NativeModule 无 addListener，
 * 用 NativeEventEmitter 会警告并可能在新架构下崩溃）。
 */
export function initSmsBridge(): void {
  if (!SmsBridge || initialized) return;

  // 延迟获取 store（避免 SmsBridge ↔ store 循环依赖初始化问题）
  const { useTriggerStore } = require('../store');

  DeviceEventEmitter.addListener(
    'onSmsReceived',
    (event: {
      sender: string;
      body: string;
      nativeHandled?: boolean;
      ruleName?: string;
      actionResults?: { type: string; success: boolean }[];
    }) => {
      const nativeInfo: NativeHandledInfo | undefined = event.nativeHandled
        ? {
            ruleName: event.ruleName ?? '',
            actionResults: event.actionResults ?? [],
          }
        : undefined;
      void useTriggerStore
        .getState()
        .processSms(event.sender, event.body, nativeInfo);
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

  // 同步规则快照到原生（锁屏时原生闭环匹配用）
  syncRulesToNative();

  initialized = true;
}

/** 同步规则快照到原生（规则变化时也调用） */
export function syncRulesToNative(): void {
  if (!SmsBridge?.setRules) return;
  try {
    // 延迟获取 store（避免循环依赖）
    const { useTriggerStore } = require('../store');
    const rules: TriggerRule[] = useTriggerStore.getState().rules;
    SmsBridge.setRules(JSON.stringify(rules));
  } catch {
    // 忽略同步失败（原生未就绪时下次规则变化再同步）
  }
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
