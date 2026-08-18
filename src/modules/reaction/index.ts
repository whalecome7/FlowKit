import { Platform } from 'react-native';
import { moduleRegistry } from '../../app/module-registry';
import type { ModuleConfig } from '../../app/types';

const reactionModuleConfig: ModuleConfig = {
  id: 'reaction',
  name: '反应力测试',
  homeRoute: 'ReactionHome',
  enabled: Platform.OS === 'android',
  getRoutes: () => [],
};

export function registerReactionModule(): void {
  moduleRegistry.register(reactionModuleConfig);
}

export { reactionModuleConfig };
