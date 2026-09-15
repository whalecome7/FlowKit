import type { MemoryTrial } from '../types';

/** 数字广度固定序列池（非随机；每个「模式 × 长度」恰 2 试）。
 *  组卷时按年龄档截取长度范围；同一长度的 2 试在卷面中相邻。
 *  设计约束：无三位以上连续重复、无显眼升/降序规律。 */
export const memoryPool: MemoryTrial[] = [
  // 顺背 3–9 位
  { id: 'f3a', mode: 'forward', length: 3, digits: [7, 3, 9] },
  { id: 'f3b', mode: 'forward', length: 3, digits: [4, 8, 1] },
  { id: 'f4a', mode: 'forward', length: 4, digits: [5, 2, 8, 6] },
  { id: 'f4b', mode: 'forward', length: 4, digits: [9, 4, 1, 7] },
  { id: 'f5a', mode: 'forward', length: 5, digits: [3, 8, 1, 5, 7] },
  { id: 'f5b', mode: 'forward', length: 5, digits: [6, 2, 9, 4, 8] },
  { id: 'f6a', mode: 'forward', length: 6, digits: [4, 7, 2, 9, 5, 1] },
  { id: 'f6b', mode: 'forward', length: 6, digits: [8, 3, 6, 1, 9, 2] },
  { id: 'f7a', mode: 'forward', length: 7, digits: [2, 9, 4, 7, 1, 6, 3] },
  { id: 'f7b', mode: 'forward', length: 7, digits: [5, 1, 8, 3, 9, 2, 7] },
  { id: 'f8a', mode: 'forward', length: 8, digits: [6, 1, 9, 3, 7, 2, 8, 4] },
  { id: 'f8b', mode: 'forward', length: 8, digits: [3, 8, 2, 7, 5, 1, 9, 6] },
  { id: 'f9a', mode: 'forward', length: 9, digits: [7, 4, 9, 1, 6, 3, 8, 2, 5] },
  { id: 'f9b', mode: 'forward', length: 9, digits: [2, 8, 5, 3, 9, 6, 1, 7, 4] },
  // 倒背 2–7 位
  { id: 'b2a', mode: 'backward', length: 2, digits: [4, 7] },
  { id: 'b2b', mode: 'backward', length: 2, digits: [9, 2] },
  { id: 'b3a', mode: 'backward', length: 3, digits: [5, 2, 8] },
  { id: 'b3b', mode: 'backward', length: 3, digits: [3, 9, 1] },
  { id: 'b4a', mode: 'backward', length: 4, digits: [7, 1, 4, 9] },
  { id: 'b4b', mode: 'backward', length: 4, digits: [2, 6, 8, 3] },
  { id: 'b5a', mode: 'backward', length: 5, digits: [9, 3, 7, 1, 5] },
  { id: 'b5b', mode: 'backward', length: 5, digits: [4, 8, 2, 6, 1] },
  { id: 'b6a', mode: 'backward', length: 6, digits: [1, 5, 9, 2, 6, 4] },
  { id: 'b6b', mode: 'backward', length: 6, digits: [7, 2, 8, 4, 1, 9] },
  { id: 'b7a', mode: 'backward', length: 7, digits: [3, 7, 1, 9, 4, 8, 2] },
  { id: 'b7b', mode: 'backward', length: 7, digits: [6, 4, 9, 2, 5, 1, 7] },
];
