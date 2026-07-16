/** 通用日志条目 */
export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  level: 'info' | 'warn' | 'error';
}

/** 通用动作结果 */
export interface ActionResult {
  success: boolean;
  error?: string;
}

/** 唯一 ID 生成器 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
