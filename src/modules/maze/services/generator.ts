import { DIFFS } from '../constants';
import type { CellPoint, MazeData, MazeDifficulty, ShapeKey } from '../types';
import { mulberry32 } from './rng';
import { makeShape, pointInPolygon, type Polygon } from './shapes';

/** 形状网格：仅奇数坐标（格）做点入判定 */
export function buildShapeGrid(poly: Polygon, N: number): boolean[][] {
  const G = 2 * N + 1;
  const inS: boolean[][] = [];
  for (let r = 0; r < G; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < G; c++) {
      if (r % 2 === 1 && c % 2 === 1) {
        const u = (2 * c) / (G - 1) - 1;
        const v = 1 - (2 * r) / (G - 1);
        row.push(pointInPolygon(u, v, poly));
      } else {
        row.push(false);
      }
    }
    inS.push(row);
  }
  return inS;
}

/** 死路格计数（开放通道数 = 1，通道打开以两格之间的墙单元打通为准） */
export function countDeadEnds(cells: number[][], inS: boolean[][], G: number): number {
  const N = (G - 1) / 2;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let count = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (!inS[2 * j + 1][2 * i + 1] || cells[2 * j + 1][2 * i + 1] !== 0) continue;
      let open = 0;
      for (const [di, dj] of dirs) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        if (cells[2 * j + 1 + dj][2 * i + 1 + di] === 0) open++;
      }
      if (open === 1) count++;
    }
  }
  return count;
}

/** braid：按比例随机打通死路格的"对面在形状内"的墙，形成环路 */
export function braidMaze(
  cells: number[][],
  inS: boolean[][],
  G: number,
  rng: () => number,
  ratio: number,
): void {
  const N = (G - 1) / 2;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const deadEnds: CellPoint[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (!inS[2 * j + 1][2 * i + 1] || cells[2 * j + 1][2 * i + 1] !== 0) continue;
      let open = 0;
      for (const [di, dj] of dirs) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        if (cells[2 * j + 1 + dj][2 * i + 1 + di] === 0) open++;
      }
      if (open === 1) deadEnds.push([i, j]);
    }
  }
  for (let i = deadEnds.length - 1; i > 0; i--) {
    const k = Math.floor(rng() * (i + 1));
    const tmp = deadEnds[i];
    deadEnds[i] = deadEnds[k];
    deadEnds[k] = tmp;
  }
  const count = Math.floor(deadEnds.length * ratio);
  for (let n = 0; n < count; n++) {
    const [i, j] = deadEnds[n];
    const cands: CellPoint[] = []; // 候选墙单元网格坐标 [wc, wr]
    for (const [di, dj] of dirs) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      if (!inS[2 * nj + 1][2 * ni + 1]) continue; // 对面格须在形状内（原型行为）
      const wr = 2 * j + 1 + dj;
      const wc = 2 * i + 1 + di;
      if (wr > 0 && wr < G - 1 && wc > 0 && wc < G - 1 && cells[wr][wc] === 1) {
        cands.push([wc, wr]);
      }
    }
    if (cands.length) {
      const [wc, wr] = cands[Math.floor(rng() * cands.length)];
      cells[wr][wc] = 0;
    }
  }
}

/** 格坐标 BFS 最远点（只走 cells=0 的格与已打开通道） */
export function bfsFarthest(cells: number[][], N: number, from: CellPoint): CellPoint {
  const keyOf = (i: number, j: number) => i + ',' + j;
  const dist: Record<string, number> = { [keyOf(from[0], from[1])]: 0 };
  const q: CellPoint[] = [from];
  let far = from;
  let maxd = 0;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (q.length) {
    const cur = q.shift()!;
    const d = dist[keyOf(cur[0], cur[1])];
    if (d > maxd) {
      maxd = d;
      far = cur;
    }
    for (const [di, dj] of dirs) {
      const ni = cur[0] + di;
      const nj = cur[1] + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      if (cells[2 * nj + 1][2 * ni + 1] !== 0) continue;
      if (cells[2 * cur[1] + 1 + dj][2 * cur[0] + 1 + di] !== 0) continue;
      const k = keyOf(ni, nj);
      if (k in dist) continue;
      dist[k] = d + 1;
      q.push([ni, nj]);
    }
  }
  return far;
}

/** 完整生成：种子 + 难度 → 确定性迷宫（随机消费顺序固定，不可调换） */
export function generateMaze(seed: number, difficulty: MazeDifficulty): MazeData {
  const cfg = DIFFS[difficulty];
  const N = cfg.N;
  const G = 2 * N + 1;
  const rng = mulberry32(seed);
  const shapeKey: ShapeKey = cfg.pool[Math.floor(rng() * cfg.pool.length)];
  const poly = makeShape(shapeKey, rng);
  const inS = buildShapeGrid(poly, N);

  const cells: number[][] = [];
  for (let r = 0; r < G; r++) cells.push(new Array<number>(G).fill(1));

  // 起点：距形状中心最近的形状内格
  let startCell: CellPoint = [0, 0];
  let bestD = Infinity;
  for (let r = 1; r < G; r += 2) {
    for (let c = 1; c < G; c += 2) {
      if (!inS[r][c]) continue;
      const u = (2 * c) / (G - 1) - 1;
      const v = 1 - (2 * r) / (G - 1);
      const d = u * u + v * v;
      if (d < bestD) {
        bestD = d;
        startCell = [(c - 1) / 2, (r - 1) / 2];
      }
    }
  }

  // DFS 迭代回溯：仅在形状内格之间打通
  const sc = startCell;
  const stack: CellPoint[] = [sc];
  cells[2 * sc[1] + 1][2 * sc[0] + 1] = 0;
  const gridDirs = [
    [0, 2],
    [0, -2],
    [2, 0],
    [-2, 0],
  ];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const gr = 2 * cur[1] + 1;
    const gc = 2 * cur[0] + 1;
    const opts: CellPoint[] = [];
    for (const [dr, dc] of gridDirs) {
      const nr = gr + dr;
      const nc = gc + dc;
      if (nr > 0 && nr < G - 1 && nc > 0 && nc < G - 1 && cells[nr][nc] === 1 && inS[nr][nc]) {
        opts.push([(nc - 1) / 2, (nr - 1) / 2]);
      }
    }
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const pick = opts[Math.floor(rng() * opts.length)];
    cells[cur[1] + pick[1] + 1][cur[0] + pick[0] + 1] = 0;
    cells[2 * pick[1] + 1][2 * pick[0] + 1] = 0;
    stack.push(pick);
  }

  if (cfg.braid > 0) braidMaze(cells, inS, G, rng, cfg.braid);

  const a = bfsFarthest(cells, N, sc);
  const b = bfsFarthest(cells, N, a);
  return { seed, difficulty, N, G, shapeKey, cells, inS, start: a, end: b };
}
