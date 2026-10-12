import { collidesRect, moveBall } from './collision';
import { generateMaze } from './generator';
import { BALL_R, SPEED, END_TOL, DIFF_ORDER } from '../constants';
import { mulberry32 } from './rng';
import type { BallPos, CellPoint, MazeData } from '../types';

const STEP = SPEED / 60;

function ballAtCell(m: MazeData, cell: CellPoint): BallPos {
  return { x: 2 * cell[0] + 1.5, y: 2 * cell[1] + 1.5 };
}

function noWallClip(m: MazeData, b: BallPos): boolean {
  return !collidesRect(m, b.x - BALL_R, b.y - BALL_R, b.x + BALL_R, b.y + BALL_R);
}

function bfsCellPath(m: MazeData, from: CellPoint, to: CellPoint): CellPoint[] | null {
  const keyOf = (i: number, j: number) => i + ',' + j;
  const seen = new Set<string>([keyOf(from[0], from[1])]);
  const q: CellPoint[] = [from];
  const prev: Record<string, CellPoint> = {};
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let found = false;
  while (q.length) {
    const cur = q.shift()!;
    if (cur[0] === to[0] && cur[1] === to[1]) {
      found = true;
      break;
    }
    for (const [di, dj] of dirs) {
      const ni = cur[0] + di;
      const nj = cur[1] + dj;
      if (ni < 0 || nj < 0 || ni >= m.N || nj >= m.N) continue;
      if (m.cells[2 * nj + 1][2 * ni + 1] !== 0) continue;
      if (m.cells[2 * cur[1] + 1 + dj][2 * cur[0] + 1 + di] !== 0) continue;
      const k = keyOf(ni, nj);
      if (seen.has(k)) continue;
      seen.add(k);
      prev[k] = cur;
      q.push([ni, nj]);
    }
  }
  if (!found) return null;
  const path: CellPoint[] = [];
  let node: CellPoint | undefined = [to[0], to[1]];
  while (node) {
    path.unshift(node);
    node = prev[keyOf(node[0], node[1])];
  }
  return path;
}

describe('碰撞物理', () => {
  const seeds = [1000007, 2718281, 3141592, 4242424, 5555555, 6666666, 7777777, 8888888];

  it('8 种子 × 4 难度：随机行走 1800 帧零穿墙', () => {
    for (const seed of seeds) {
      for (const diff of DIFF_ORDER) {
        const m = generateMaze(seed, diff);
        const b = ballAtCell(m, m.start);
        expect(noWallClip(m, b)).toBe(true);
        const rng = mulberry32(seed ^ 0xabcd);
        let dx = 0;
        let dy = 0;
        for (let f = 0; f < 1800; f++) {
          if (f % 20 === 0) {
            const ang = rng() * Math.PI * 2;
            dx = Math.cos(ang);
            dy = Math.sin(ang);
          }
          moveBall(m, b, dx * STEP, dy * STEP);
          if (!noWallClip(m, b)) {
            throw new Error(`穿墙：seed=${seed} diff=${diff} frame=${f}`);
          }
        }
      }
    }
  });

  it('8 种子 × 4 难度：沿 BFS 路径行进可到达终点', () => {
    for (const seed of seeds) {
      for (const diff of DIFF_ORDER) {
        const m = generateMaze(seed, diff);
        const b = ballAtCell(m, m.start);
        const path = bfsCellPath(m, m.start, m.end);
        expect(path).not.toBeNull();
        for (let n = 1; n < path!.length; n++) {
          const tx = 2 * path![n][0] + 1.5;
          const ty = 2 * path![n][1] + 1.5;
          let guard = 0;
          while (guard++ < 500) {
            const dx = tx - b.x;
            const dy = ty - b.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= 0.09) break;
            const step = Math.min(STEP, dist);
            moveBall(m, b, (dx / dist) * step, (dy / dist) * step);
          }
        }
        const d = Math.hypot(2 * m.end[0] + 1.5 - b.x, 2 * m.end[1] + 1.5 - b.y);
        expect(d).toBeLessThan(END_TOL);
      }
    }
  });
});
