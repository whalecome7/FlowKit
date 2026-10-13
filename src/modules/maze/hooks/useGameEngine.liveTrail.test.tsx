/* 轨迹几何回归：端到端（真实 useGameEngine tick）随机行走，
 * 屏幕层同款采样（services/liveTrail）产生"球真实路径折线"，
 * 验证采样折线各段与末段（最后采样点→球）线心深穿 ≤ 0.05 单元内零穿墙。
 * 背景：旧"格中心折线 + 直线尾巴"模型存在固有领先/落后（格边界步进）与斜穿墙角问题，
 * 改为球路径采样后，几何正确性由本测试持续保障。
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { View } from 'react-native';
import { useGameEngine } from './useGameEngine';
import { generateMaze } from '../services/generator';
import { BASE_CELL_DP } from '../constants';
import { collidesRect } from '../services/collision';
import { mulberry32 } from '../services/rng';
import { createLivePath, pushPoint } from '../services/liveTrail';
import type { JoyVector, MazeData } from '../types';

type EngineApi = ReturnType<typeof useGameEngine>;
type RafCb = (ts: number) => void;

let env: {
  joyRef: { current: JoyVector };
  camScaleRef: { current: number };
  cellPxRef: { current: number };
};
let api: EngineApi | null = null;

function Harness(props: { maze: MazeData; onTick: () => void }) {
  const view = { setNativeProps: jest.fn() } as unknown as View;
  api = useGameEngine({
    maze: props.maze,
    joyRef: env.joyRef,
    ballViewRef: { current: view },
    containerRef: { current: view },
    viewport: { width: 600, height: 500 },
    resetToken: 0,
    camScaleRef: env.camScaleRef,
    cellPxRef: env.cellPxRef,
    onStart: () => {},
    onEnterCell: () => {},
    onWin: () => {},
    onTick: props.onTick,
  });
  return null;
}

let rafQueue: RafCb[] = [];
let rafId = 0;
let frameClock = 0;
let origRaf: typeof globalThis.requestAnimationFrame;
let origCaf: typeof globalThis.cancelAnimationFrame;

beforeAll(() => {
  origRaf = globalThis.requestAnimationFrame;
  origCaf = globalThis.cancelAnimationFrame;
});

beforeEach(() => {
  rafQueue = [];
  rafId = 0;
  frameClock = 0;
  globalThis.requestAnimationFrame = (cb: RafCb) => {
    rafQueue.push(cb);
    return ++rafId;
  };
  globalThis.cancelAnimationFrame = () => {};
});

afterAll(() => {
  globalThis.requestAnimationFrame = origRaf;
  globalThis.cancelAnimationFrame = origCaf;
});

async function stepFrames(n: number) {
  for (let i = 0; i < n; i++) {
    frameClock += 16;
    const due = rafQueue;
    rafQueue = [];
    const ts = frameClock;
    await ReactTestRenderer.act(() => {
      for (const cb of due) cb(ts);
    });
  }
}

/** 线心深穿：直线上"点落入墙单元内部"的最大连续长度（单元比例） */
function segDeepWall(maze: MazeData, x0: number, y0: number, x1: number, y1: number): number {
  let run = 0;
  let maxRun = 0;
  const steps = 120;
  const stepLen = Math.hypot(x1 - x0, y1 - y0) / steps;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (collidesRect(maze, x - 0.005, y - 0.005, x + 0.005, y + 0.005)) {
      run += stepLen;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
  }
  return maxRun;
}

describe('轨迹几何：球真实路径采样', () => {
  it('随机行走 1500 帧：采样折线与末段（最后采样点→球）零穿墙', async () => {
    env = {
      joyRef: { current: { x: 0, y: 0 } },
      camScaleRef: { current: 1 },
      cellPxRef: { current: BASE_CELL_DP },
    };
    const maze = generateMaze(1000000, 'easy');
    const state = createLivePath(2 * maze.start[0] + 1.5, 2 * maze.start[1] + 1.5);
    const violations: string[] = [];
    let frame = 0;
    const onTick = () => {
      const b = api!.getBall();
      if (pushPoint(state, b.x, b.y)) {
        frame++;
      }
      // 末段（最后采样点→球当前位置）每帧检查：端点恒贴球的实时延长线
      const n = state.xs.length - 1;
      if (n >= 1) {
        const depth = segDeepWall(maze, state.xs[n], state.ys[n], b.x, b.y);
        if (depth > 0.05) {
          violations.push(`f=${frame} 末段 depth=${depth.toFixed(2)}`);
        }
      }
    };
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(React.createElement(Harness, { maze, onTick }));
    });
    const rng = mulberry32(20261013);
    let dx = 0;
    let dy = 0;
    for (let f = 0; f < 1500; f++) {
      if (f % 15 === 0) {
        const ang = rng() * Math.PI * 2;
        dx = Math.cos(ang);
        dy = Math.sin(ang);
      }
      env.joyRef.current = { x: dx, y: dy };
      await stepFrames(1);
    }
    // 全量折线检查（相邻采样点段）
    for (let k = 0; k + 1 < state.xs.length; k++) {
      const depth = segDeepWall(maze, state.xs[k], state.ys[k], state.xs[k + 1], state.ys[k + 1]);
      if (depth > 0.05) {
        violations.push(`seg ${k} depth=${depth.toFixed(2)}`);
      }
    }
    // 确认确实产生了足量采样（防 rAF/判据回归导致空走）
    expect(state.xs.length).toBeGreaterThan(100);
    expect(violations).toEqual([]);
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });
});
