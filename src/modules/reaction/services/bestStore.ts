import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (mode: string) => `@flowkit:reaction:best:${mode}`;

/** 读取本模式历史最佳（最快毫秒），无则 null */
export async function loadBest(mode: string): Promise<number | null> {
  const raw = await AsyncStorage.getItem(key(mode));
  const v = raw ? Number(raw) : 0;
  return v > 0 ? v : null;
}

/** 更新历史最佳，返回是否刷新记录 */
export async function updateBest(mode: string, timeMs: number): Promise<boolean> {
  const prev = await loadBest(mode);
  if (prev !== null && prev <= timeMs) return false;
  await AsyncStorage.setItem(key(mode), String(timeMs));
  return true;
}
