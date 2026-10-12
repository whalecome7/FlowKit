import { moduleRegistry } from '../../app/module-registry';
import type { ModuleConfig } from '../../app/types';

const mazeModuleConfig: ModuleConfig = {
  id: 'maze',
  name: '迷境',
  homeRoute: 'MazeGame',
  enabled: true,
  getRoutes: () => [],
};

export function registerMazeModule(): void {
  moduleRegistry.register(mazeModuleConfig);
}

export { mazeModuleConfig };
