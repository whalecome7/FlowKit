import { Platform } from 'react-native';
import { moduleRegistry } from '../../app/module-registry';
import type { ModuleConfig } from '../../app/types';

const emojiModuleConfig: ModuleConfig = {
  id: 'emoji',
  name: 'emoji 翻译器',
  homeRoute: 'EmojiTranslator',
  enabled: Platform.OS === 'android',
  getRoutes: () => [],
};

export function registerEmojiModule(): void {
  moduleRegistry.register(emojiModuleConfig);
}

export { emojiModuleConfig };
