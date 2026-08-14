import { NativeModules, Vibration } from 'react-native';
import notifee, { AndroidImportance, AndroidVisibility, AuthorizationStatus } from '@notifee/react-native';
import type { TriggerAction, MatchResult, ActionLog, ExecutionLog } from '../types';
import { generateId } from '../../../shared/types';

type ActionHandler = (action: TriggerAction) => Promise<{ success: boolean; error?: string }>;

const actionHandlers = new Map<string, ActionHandler>();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const ActionExecutor = {
  /** 注册自定义动作处理器 */
  registerHandler(type: string, handler: ActionHandler): void {
    actionHandlers.set(type, handler);
  },

  /** 注册内置默认处理器 */
  registerDefaults(): void {
    // 震动：优先原生 VibrationModule（支持模式/节奏/力度），无原生时降级 RN Vibration
    this.registerHandler('vibrate', async (action) => {
      const params = action.params ?? {};
      const mode = String(params.mode ?? 'standard');
      const patternRaw = typeof params.pattern === 'string' ? params.pattern : '';
      const amplitude = typeof params.amplitude === 'number' ? params.amplitude : 0;
      let pattern: string;
      switch (mode) {
        case 'gentle':
          pattern = '100';
          break;
        case 'urgent':
          pattern = '200,80,200,80,300';
          break;
        case 'custom':
          pattern = patternRaw || '200,100,200';
          break;
        case 'standard':
        default:
          pattern = '300';
          break;
      }
      const nativeVibrate = NativeModules.VibrationModule;
      if (nativeVibrate) {
        nativeVibrate.vibrate(pattern, amplitude);
        return { success: true };
      }
      // 降级：RN 内置 Vibration
      const parts = pattern.split(',').map((p) => Number(p) || 0);
      Vibration.vibrate(parts.length > 1 ? parts : parts[0], false);
      return { success: true };
    });

    // 状态栏通知：Notifee
    this.registerHandler('notify', async (action) => {
      const title = String(action.params?.title ?? 'FlowKit 提醒');
      const body = String(action.params?.body ?? '');
      const permission = await notifee.requestPermission();
      if (permission.authorizationStatus < AuthorizationStatus.AUTHORIZED) {
        return { success: false, error: '通知权限未授权' };
      }
      const channelId = await notifee.createChannel({
        id: 'flowkit-trigger',
        name: '短信触发器',
      });
      await notifee.displayNotification({
        title,
        body,
        android: { channelId, importance: AndroidImportance.HIGH },
      });
      return { success: true };
    });

    // 铃声：原生 RingtoneModule（闹钟流，静音也响），duration 后自动停止
    this.registerHandler('ringtone', async (action) => {
      const ringtoneModule = NativeModules.RingtoneModule;
      if (!ringtoneModule) {
        return { success: false, error: 'RingtoneModule 未注册（iOS 不支持）' };
      }
      const url = typeof action.params?.url === 'string' ? action.params.url : null;
      const raw = action.params?.duration;
      const duration = typeof raw === 'number' && raw > 0 ? raw : 5000;
      try {
        ringtoneModule.play(url);
        await sleep(duration);
        ringtoneModule.stop();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });

    // 推送到手表：发高重要级通知（华为 Watch 3 / Wear OS 均会镜像到手表）
    // channel 锁住 importance 防止系统降级（小米等 ROM 会静默低优先级第三方通知）
    this.registerHandler('pushToWatch', async (action) => {
      const title = String(action.params?.title ?? 'FlowKit 手表提醒');
      const body = String(action.params?.body ?? '');
      const permission = await notifee.requestPermission();
      if (permission.authorizationStatus < AuthorizationStatus.AUTHORIZED) {
        return { success: false, error: '通知权限未授权' };
      }
      const channelId = await notifee.createChannel({
        id: 'flowkit-watch-v2',
        name: '手表推送',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        sound: 'default',
        vibration: true,
      });
      await notifee.displayNotification({
        // 唯一 id 避免被系统去重/聚合吞掉
        id: `watch-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        title: `⌚ ${title}`,
        body,
        android: {
          channelId,
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          smallIcon: 'ic_launcher',
          pressAction: { id: 'default' },
          autoCancel: true,
          showTimestamp: true,
        },
      });
      return { success: true };
    });
  },

  /** 执行匹配结果中的所有动作 */
  async execute(matches: MatchResult[], sms: { sender: string; body: string }): Promise<ExecutionLog[]> {
    const logs: ExecutionLog[] = [];

    for (const match of matches) {
      const actionLogs: ActionLog[] = [];

      for (const action of match.rule.actions) {
        if (action.enabled === false) {
          actionLogs.push({
            type: action.type,
            success: true,
            error: '已停用',
          });
          continue;
        }

        const handler = actionHandlers.get(action.type);
        if (handler) {
          let result: { success: boolean; error?: string };
          try {
            result = await handler(action);
          } catch (err) {
            result = {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
          actionLogs.push({
            type: action.type,
            success: result.success,
            error: result.error,
          });
        } else {
          actionLogs.push({
            type: action.type,
            success: false,
            error: `No handler registered for action type: ${action.type}`,
          });
        }
      }

      logs.push({
        id: generateId(),
        ruleId: match.rule.id,
        ruleName: match.rule.name,
        smsSender: sms.sender,
        smsBody: sms.body,
        triggeredAt: Date.now(),
        actions: actionLogs,
      });
    }

    return logs;
  },
};
