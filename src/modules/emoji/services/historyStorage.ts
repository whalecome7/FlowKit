import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId } from '../../../shared/types';
import type { HistoryItem } from '../types';

const STORAGE_KEY = '@flowkit:emoji:history';
const MAX_ITEMS = 100;

function isHistoryItem(v: unknown): v is HistoryItem {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.text === 'string' &&
    typeof o.createdAt === 'number'
  );
}

export async function loadHistory(): Promise<HistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryItem);
  } catch {
    return [];
  }
}

export async function saveHistory(items: HistoryItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

/** 新增一条（同文本去重置顶），返回更新后的完整列表 */
export async function addHistory(text: string): Promise<HistoryItem[]> {
  const items = await loadHistory();
  const next: HistoryItem[] = [
    { id: generateId(), text, createdAt: Date.now() },
    ...items.filter((i) => i.text !== text),
  ].slice(0, MAX_ITEMS);
  await saveHistory(next);
  return next;
}

export async function removeHistory(id: string): Promise<HistoryItem[]> {
  const next = (await loadHistory()).filter((i) => i.id !== id);
  await saveHistory(next);
  return next;
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
