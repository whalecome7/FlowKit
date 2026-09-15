import { moduleRegistry } from '../../app/module-registry';
import type { ModuleConfig } from '../../app/types';

const iqModuleConfig: ModuleConfig = {
  id: 'iq',
  name: 'IQ 测试',
  homeRoute: 'IqHome',
  enabled: true,
  getRoutes: () => [],
};

export function registerIqModule(): void {
  moduleRegistry.register(iqModuleConfig);
}

export { iqModuleConfig };
