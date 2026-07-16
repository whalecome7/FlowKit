import type { ReactNode } from 'react';

export interface ModuleConfig {
  id: string;
  name: string;
  homeRoute: string;
  enabled: boolean;
  getRoutes: () => ReactNode[];
}
