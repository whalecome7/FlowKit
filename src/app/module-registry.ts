import type { ModuleConfig } from './types';

class ModuleRegistry {
  private modules = new Map<string, ModuleConfig>();

  register(config: ModuleConfig): void {
    if (this.modules.has(config.id)) {
      console.warn(`Module "${config.id}" is already registered. Overwriting.`);
    }
    this.modules.set(config.id, config);
  }

  getEnabledModules(): ModuleConfig[] {
    return Array.from(this.modules.values()).filter((m) => m.enabled);
  }

  getAllRoutes(): React.ReactNode[] {
    return this.getEnabledModules().flatMap((m) => m.getRoutes());
  }

  getModule(id: string): ModuleConfig | undefined {
    return this.modules.get(id);
  }
}

export const moduleRegistry = new ModuleRegistry();
