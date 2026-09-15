import { matrixPool } from '../data/matrixItems';
import { verbalPool } from '../data/verbalItems';
import { memoryPool } from '../data/memorySequences';
import { LIGHT_SPEED_DURATION_MS, LIGHT_SPEED_ROW_COUNT, speedTask } from '../data/speedTask';
import type { AgeBand, MatrixItem, Paper, TestMode } from '../types';

/** 各年龄档的记忆长度范围：[最短, 最长] */
export const MEMORY_RANGES: Record<AgeBand, { forward: [number, number]; backward: [number, number] }> = {
  '6-8': { forward: [3, 6], backward: [2, 4] },
  '9-11': { forward: [3, 7], backward: [2, 5] },
  '12-16': { forward: [4, 8], backward: [3, 6] },
  adult: { forward: [4, 9], backward: [3, 7] },
};

/** 从（按难度升序的）数组中确定性均匀取 n 个：跨度覆盖全难度区间，无随机、无重复 */
export function spreadPick<T>(sorted: T[], n: number): T[] {
  if (sorted.length <= n) return [...sorted];
  const picked: T[] = [];
  for (let i = 0; i < n; i++) {
    picked.push(sorted[Math.round((i * (sorted.length - 1)) / (n - 1))]);
  }
  return picked;
}

function byDifficulty<T extends { difficulty: number; ageBands: AgeBand[] }>(
  pool: T[],
  band: AgeBand,
): T[] {
  return pool
    .filter((i) => i.ageBands.includes(band))
    .sort((a, b) => a.difficulty - b.difficulty);
}

/** 组卷（确定性：同输入同输出，禁止随机）。
 *  专业版：矩阵 20 + 序列 8、言语 14、记忆按年龄档长度范围、速度 90 秒；
 *  轻量版：流体 12（难度 2–7 覆盖）、速度 30 秒（前 40 行）。 */
export function buildPaper(mode: TestMode, ageBand: AgeBand): Paper {
  const matrices = byDifficulty(matrixPool.filter((i) => i.kind === 'matrix'), ageBand);
  const sequences = byDifficulty(matrixPool.filter((i) => i.kind === 'sequence'), ageBand);
  const fluidItems: MatrixItem[] =
    mode === 'pro'
      ? [...spreadPick(matrices, 20), ...spreadPick(sequences, 8)]
      : spreadPick(
          byDifficulty(matrixPool, ageBand).filter((i) => i.difficulty >= 2 && i.difficulty <= 7),
          12,
        );

  const verbalItems =
    mode === 'pro' ? spreadPick(byDifficulty(verbalPool, ageBand), 14) : [];

  const range = MEMORY_RANGES[ageBand];
  const memoryTrials =
    mode === 'pro'
      ? (['forward', 'backward'] as const).flatMap((m) =>
          memoryPool
            .filter((t) => t.mode === m && t.length >= range[m][0] && t.length <= range[m][1])
            .sort((a, b) => a.length - b.length),
        )
      : [];

  const speed =
    mode === 'pro'
      ? speedTask
      : {
          ...speedTask,
          rows: speedTask.rows.slice(0, LIGHT_SPEED_ROW_COUNT),
          durationMs: LIGHT_SPEED_DURATION_MS,
        };

  return { id: `${mode}:${ageBand}`, mode, ageBand, fluidItems, verbalItems, memoryTrials, speed };
}
