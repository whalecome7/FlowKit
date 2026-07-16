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
    // 铃声 - 由原生层实现，这里占位
    this.registerHandler('ringtone', async (action) => {
      // TODO: 调用原生 RingtoneModule
      console.log('[ActionExecutor] ringtone:', action.params);
      return { success: true };
    });

    // 震动
    this.registerHandler('vibrate', async (action) => {
      // TODO: 调用 Vibration API
      console.log('[ActionExecutor] vibrate:', action.params);
      return { success: true };
    });

    // 通知
    this.registerHandler('notify', async (action) => {
      // TODO: 调用原生 NotificationModule
      console.log('[ActionExecutor] notify:', action.params);
      return { success: true };
    });

    // 推送到手表
    this.registerHandler('pushToWatch', async (action) => {
      // TODO: 调用 Wearable API
      console.log('[ActionExecutor] pushToWatch:', action.params);
      return { success: true };
    });
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
