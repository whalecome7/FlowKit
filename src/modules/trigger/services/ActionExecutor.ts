import { Vibration } from 'react-native';
import notifee, { AndroidImportance } from '@notifee/react-native';
import type { TriggerAction, MatchResult, ActionLog, ExecutionLog } from '../types';
import { generateId } from '../../../shared/types';

type ActionHandler = (action: TriggerAction) => Promise<{ success: boolean; error?: string }>;

const actionHandlers = new Map<string, ActionHandler>();

export const ActionExecutor = {
  /** 注册自定义动作处理器 */
  registerHandler(type: string, handler: ActionHandler): void {
    actionHandlers.set(type, handler);
  },

  /** 注册内置默认处理器 */
  registerDefaults(): void {
    // 震动：RN 内置 Vibration API
    this.registerHandler('vibrate', async (action) => {
      const raw = action.params?.duration;
      const duration =
        typeof raw === 'number' && raw > 0 ? raw : 500;
      Vibration.vibrate(duration);
      return { success: true };
    });

    // 状态栏通知：Notifee
    this.registerHandler('notify', async (action) => {
      const title = String(action.params?.title ?? 'FlowKit 提醒');
      const body = String(action.params?.body ?? '');
      const permission = await notifee.requestPermission();
      if (permission.authorizationStatus < 2) {
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

    // 铃声/推手表：阶段 1 占位，明确失败
    this.registerHandler('ringtone', async () => ({
      success: false,
      error: 'ringtone 动作未实现',
    }));
    this.registerHandler('pushToWatch', async () => ({
      success: false,
      error: 'pushToWatch 动作未实现',
    }));
  },

  /** 执行匹配结果中的所有动作 */
  async execute(matches: MatchResult[], sms: { sender: string; body: string }): Promise<ExecutionLog[]> {
    const logs: ExecutionLog[] = [];

    for (const match of matches) {
      const actionLogs: ActionLog[] = [];

      for (const action of match.rule.actions) {
        const handler = actionHandlers.get(action.type);
        if (handler) {
          const result = await handler(action);
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
