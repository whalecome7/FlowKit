import { Share } from 'react-native';
import type { TriggerRule } from '../types';

export function serializeRules(rules: TriggerRule[]): string {
  // 紧凑 JSON（无缩进）：显著减小二维码矩阵，导入端解析不受影响
  return JSON.stringify(
    { app: 'FlowKit', version: 1, exportedAt: Date.now(), rules },
  );
}

export function parseRules(json: string): { rules: TriggerRule[]; error?: string } {
  try {
    const data = JSON.parse(json);
    if (!data || data.app !== 'FlowKit' || !Array.isArray(data.rules)) {
      return { rules: [], error: '不是有效的 FlowKit 规则文件' };
    }
    return { rules: data.rules as TriggerRule[] };
  } catch {
    return { rules: [], error: 'JSON 解析失败' };
  }
}

export async function exportRules(rules: TriggerRule[]): Promise<void> {
  await Share.share({ message: serializeRules(rules) });
}
