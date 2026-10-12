import { BALL_R } from '../constants';
import type { BallPos, MazeData } from '../types';

/** 矩形是否与任何墙单元相交（世界单位） */
export function collidesRect(m: MazeData, x0: number, y0: number, x1: number, y1: number): boolean {
  const c0 = Math.floor(x0);
  const c1 = Math.floor(x1);
  const r0 = Math.floor(y0);
  const r1 = Math.floor(y1);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (c < 0 || r < 0 || c >= m.G || r >= m.G) return true;
      if (m.cells[r][c] === 1) return true;
    }
  }
  return false;
}

/** 单轴移动：畅通直行，否则二分逼近钳制到接触位置（撞墙滑行） */
function moveAxis(m: MazeData, ball: BallPos, axis: 'x' | 'y', amount: number): void {
  if (!amount) return;
  const test = (d: number): boolean => {
    const nx = axis === 'x' ? ball.x + d : ball.x;
    const ny = axis === 'y' ? ball.y + d : ball.y;
    return collidesRect(m, nx - BALL_R, ny - BALL_R, nx + BALL_R, ny + BALL_R);
  };
  if (!test(amount)) {
    if (axis === 'x') ball.x += amount;
    else ball.y += amount;
    return;
  }
  let lo = 0;
  let hi = amount;
  for (let k = 0; k < 8; k++) {
    const mid = (lo + hi) / 2;
    if (test(mid)) hi = mid;
    else lo = mid;
  }
  if (axis === 'x') ball.x += lo;
  else ball.y += lo;
}

/** 按位移移动小球（轴分离 + 滑行），原地修改 ball */
export function moveBall(m: MazeData, ball: BallPos, dx: number, dy: number): void {
  moveAxis(m, ball, 'x', dx);
  moveAxis(m, ball, 'y', dy);
}
