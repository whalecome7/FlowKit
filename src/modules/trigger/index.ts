import { Platform } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import { moduleRegistry } from '../../app/module-registry';
import type { ModuleConfig } from '../../app/types';
import { ActionExecutor } from './services/ActionExecutor';
import { initSmsBridge } from './services/SmsBridge';
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
    notifee.onForegroundEvent(({ type }) => {
      if (type === EventType.PRESS) {
        navigateToLog();
      }
    });
  }
  moduleRegistry.register(triggerModuleConfig);
}

export { triggerModuleConfig };
