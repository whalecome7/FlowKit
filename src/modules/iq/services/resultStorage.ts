import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TestResult } from '../types';

const STORAGE_KEY = '@flowkit:iq:results';
const MAX_ITEMS = 100;

function isTestResult(v: unknown): v is TestResult {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    (o.mode === 'pro' || o.mode === 'light') &&
    typeof o.ageBand === 'string' &&
    typeof o.createdAt === 'number' &&
    typeof o.durationMs === 'number' &&
    typeof o.report === 'object' &&
    o.report !== null
  );
}

export async function loadResults(): Promise<TestResult[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTestResult);
  } catch {
    return [];
  }
}

/** 新增一条（置顶），返回更新后的完整列表 */
export async function saveResult(result: TestResult): Promise<TestResult[]> {
  const next = [result, ...(await loadResults())].slice(0, MAX_ITEMS);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function removeResult(id: string): Promise<TestResult[]> {
  const next = (await loadResults()).filter((r) => r.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function clearResults(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
