import { Platform } from 'react-native';
import { moduleRegistry } from '../../app/module-registry';
import type { ModuleConfig } from '../../app/types';

const triggerModuleConfig: ModuleConfig = {
  id: 'trigger',
  name: '短信触发器',
  homeRoute: 'TriggerRuleList',
  enabled: Platform.OS === 'android',
  getRoutes: () => [],
};

export function registerTriggerModule(): void {
  moduleRegistry.register(triggerModuleConfig);
}

export { triggerModuleConfig };
