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
    // 原生初始化（前台服务/短信监听）与规则加载放到当前渲染完成后，
    // 避免占用启动关键路径导致首屏触摸无响应
    setTimeout(() => {
      initSmsBridge();
      void useTriggerStore.getState().loadRules();
    }, 0);
    notifee.onForegroundEvent(({ type }) => {
      if (type === EventType.PRESS) {
        navigateToLog();
      }
    });
  }
  moduleRegistry.register(triggerModuleConfig);
}

export { triggerModuleConfig };
