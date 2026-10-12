import { generateMaze, braidMaze, countDeadEnds, findShortestPath } from './generator';
import { DIFF_ORDER } from '../constants';
import type { MazeData, CellPoint } from '../types';

function keyOf(i: number, j: number): string {
  return i + ',' + j;
}

/** 格坐标 BFS：起点能否到达终点 */
function reachable(m: MazeData): boolean {
  const seen = new Set<string>([keyOf(m.start[0], m.start[1])]);
  const q: CellPoint[] = [m.start];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  while (q.length) {
    const [i, j] = q.shift()!;
    if (i === m.end[0] && j === m.end[1]) return true;
    for (const [di, dj] of dirs) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= m.N || nj >= m.N) continue;
      if (m.cells[2 * nj + 1][2 * ni + 1] !== 0) continue;
      if (m.cells[2 * j + 1 + dj][2 * i + 1 + di] !== 0) continue;
      const k = keyOf(ni, nj);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push([ni, nj]);
    }
  }
  return false;
}

function cellInShape(m: MazeData, cell: CellPoint): boolean {
  return m.inS[2 * cell[1] + 1][2 * cell[0] + 1];
}

describe('generateMaze', () => {
  it('同种子同难度 → 完全一致（确定性）', () => {
    const a = generateMaze(1234567, 'normal');
    const b = generateMaze(1234567, 'normal');
    expect(b.shapeKey).toBe(a.shapeKey);
    expect(b.start).toEqual(a.start);
    expect(b.end).toEqual(a.end);
    expect(b.cells).toEqual(a.cells);
  });

  it('不同种子 → 迷宫结构不同', () => {
    const a = generateMaze(1234567, 'normal');
    const b = generateMaze(7654321, 'normal');
    expect(b.cells).not.toEqual(a.cells);
  });

  it('8 种子 × 4 难度：起终点在形状内、可走、且互相可达', () => {
    const seeds = [1000007, 2718281, 3141592, 4242424, 5555555, 6666666, 7777777, 8888888];
    for (const seed of seeds) {
      for (const diff of DIFF_ORDER) {
        const m = generateMaze(seed, diff);
        expect(cellInShape(m, m.start)).toBe(true);
        expect(cellInShape(m, m.end)).toBe(true);
        expect(m.cells[2 * m.start[1] + 1][2 * m.start[0] + 1]).toBe(0);
        expect(m.cells[2 * m.end[1] + 1][2 * m.end[0] + 1]).toBe(0);
        expect(reachable(m)).toBe(true);
      }
    }
  });

  it('braid 打通死路：打通后死路数显著减少', () => {
    const m = generateMaze(3141592, 'hell'); // hell braid=0，保留原始死路
    const before = countDeadEnds(m.cells, m.inS, m.G);
    expect(before).toBeGreaterThan(0);
    const copy = m.cells.map((row) => row.slice());
    braidMaze(copy, m.inS, m.G, mulberry32Lite(42), 0.85);
    const after = countDeadEnds(copy, m.inS, m.G);
    expect(after).toBeLessThan(before * 0.35);
  });
});

describe('findShortestPath', () => {
  it('返回含首尾的连续格路径', () => {
    const m = generateMaze(1234567, 'normal');
    const path = findShortestPath(m, m.start, m.end);
    expect(path).not.toBeNull();
    expect(path![0]).toEqual(m.start);
    expect(path![path!.length - 1]).toEqual(m.end);
    for (let n = 1; n < path!.length; n++) {
      const d = Math.abs(path![n][0] - path![n - 1][0]) + Math.abs(path![n][1] - path![n - 1][1]);
      expect(d).toBe(1);
    }
  });
});

/** 测试内联的简易 rng（braid 随机源） */
function mulberry32Lite(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
