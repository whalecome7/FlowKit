/* 轨迹尾巴线几何回归：
 * 端到端（真实 useGameEngine tick + 屏幕层同款 onTick 尾巴几何）随机行走，
 * 验证"球当前格中心 → 球"的实时尾巴直线永不穿墙（线心深穿阈值 0.05 单元）。
 * 背景：曾用"上一格中心"作锚点，球进入当前格的下方通道（格判定未切换）时会斜穿角位墙。
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { View } from 'react-native';
import { useGameEngine } from './useGameEngine';
import { generateMaze } from '../services/generator';
import { BASE_CELL_DP } from '../constants';
import { collidesRect } from '../services/collision';
import { mulberry32 } from '../services/rng';
import type { CellPoint, JoyVector, MazeData } from '../types';

type EngineApi = ReturnType<typeof useGameEngine>;
type RafCb = (ts: number) => void;

let env: {
  joyRef: { current: JoyVector };
  camScaleRef: { current: number };
  cellPxRef: { current: number };
};
let api: EngineApi | null = null;

function Harness(props: { maze: MazeData; onEnterCell: (c: CellPoint) => void; onTick: () => void }) {
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
    onEnterCell: props.onEnterCell,
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

describe('轨迹尾巴线几何', () => {
  it('随机行走 1500 帧：当前格中心→球的尾巴直线零穿墙', async () => {
    env = {
      joyRef: { current: { x: 0, y: 0 } },
      camScaleRef: { current: 1 },
      cellPxRef: { current: BASE_CELL_DP },
    };
    const maze = generateMaze(1000000, 'easy');
    const trail: CellPoint[] = [[maze.start[0], maze.start[1]]];
    const violations: string[] = [];
    let frame = 0;
    const onTick = () => {
      const cell = trail[trail.length - 1];
      const cx = 2 * cell[0] + 1.5;
      const cy = 2 * cell[1] + 1.5;
      const b = api!.getBall();
      if (segDeepWall(maze, cx, cy, b.x, b.y) > 0.05) {
        violations.push(`f=${frame} cell=[${cell}] ball=(${b.x.toFixed(2)},${b.y.toFixed(2)})`);
      }
      frame++;
    };
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        React.createElement(Harness, {
          maze,
          onEnterCell: (c: CellPoint) => {
            trail.push(c);
          },
          onTick,
        }),
      );
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
    expect(violations).toEqual([]);
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });
});
