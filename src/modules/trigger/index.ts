import { Platform } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import { moduleRegistry } from '../../app/module-registry';
import type { ModuleConfig } from '../../app/types';
import { ActionExecutor } from './services/ActionExecutor';
import { initSmsBridge } from './services/SmsBridge';
import { useTriggerStore } from './store';
import { navigateToLog } from './services/NotificationNavigation';

const triggerModuleConfig: ModuleConfig = {
  id: 'trigger',
  name: '短信触发器',
  homeRoute: 'TriggerRuleList',
  enabled: Platform.OS === 'android',
  getRoutes: () => [],
};

export function registerTriggerModule(): void {
  ActionExecutor.registerDefaults();
  if (Platform.OS === 'android') {
    initSmsBridge();
    // 启动即加载规则（触发 loadRules 后的原生规则快照同步，供锁屏原生闭环匹配）
    void useTriggerStore.getState().loadRules();
    notifee.onForegroundEvent(({ type }) => {
      if (type === EventType.PRESS) {
        navigateToLog();
      }
    });
  }
  moduleRegistry.register(triggerModuleConfig);
}

export { triggerModuleConfig };
