import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AppState } from 'react-native';
import type { AppStateStatus, View } from 'react-native';
import { useGameEngine } from './useGameEngine';
import { generateMaze } from '../services/generator';
import { BASE_CELL_DP, INITIAL_CELL_DP, MAX_SCALE_DP, MIN_SCALE_DP } from '../constants';
import type { JoyVector, MazeData } from '../types';

type EngineApi = ReturnType<typeof useGameEngine>;

function makeEnv() {
  const view = { setNativeProps: jest.fn() } as unknown as View;
  return {
    joyRef: { current: { x: 0, y: 0 } as JoyVector },
    camScaleRef: { current: 1 },
    cellPxRef: { current: BASE_CELL_DP },
    ballViewRef: { current: view } as React.RefObject<View | null>,
    containerRef: { current: view } as React.RefObject<View | null>,
    onStart: jest.fn(),
    onEnterCell: jest.fn(),
    onWin: jest.fn(),
  };
}
type Env = ReturnType<typeof makeEnv>;

interface HarnessProps {
  maze: MazeData;
  viewport: { width: number; height: number };
  resetToken: number;
  env: Env;
  onApi: (api: EngineApi) => void;
}

// 测试专用宿主组件：真实调用 useGameEngine（假 refs + 手动 rAF）
function Harness({ maze, viewport, resetToken, env, onApi }: HarnessProps) {
  const engine = useGameEngine({
    maze,
    joyRef: env.joyRef,
    ballViewRef: env.ballViewRef,
    containerRef: env.containerRef,
    viewport,
    resetToken,
    camScaleRef: env.camScaleRef,
    cellPxRef: env.cellPxRef,
    onStart: env.onStart,
    onEnterCell: env.onEnterCell,
    onWin: env.onWin,
  });
  onApi(engine);
  return null;
}

const VIEWPORT = { width: 300, height: 300 };

type RafCb = (ts: number) => void;
let rafQueue: RafCb[] = [];
let rafId = 0;
let frameClock = 0;
let origRaf: typeof globalThis.requestAnimationFrame;
let origCaf: typeof globalThis.cancelAnimationFrame;
const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

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

afterEach(async () => {
  for (const tree of mounted.splice(0)) {
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  }
  globalThis.requestAnimationFrame = origRaf;
  globalThis.cancelAnimationFrame = origCaf;
});

/** 手动推进 n 帧（默认 16ms/帧，低于 tick 的 33ms dt 上限；可传大 dtMs 模拟时间跳跃） */
async function stepFrames(n: number, dtMs = 16) {
  for (let i = 0; i < n; i++) {
    frameClock += dtMs;
    const due = rafQueue;
    rafQueue = [];
    const ts = frameClock;
    await ReactTestRenderer.act(() => {
      for (const cb of due) cb(ts);
    });
  }
}

/** 起点格可通行方向（世界坐标单位向量；贯通性保证至少一条通道） */
function openDirAtStart(maze: MazeData): JoyVector {
  const [i, j] = maze.start;
  const r = 2 * j + 1;
  const c = 2 * i + 1;
  if (maze.cells[r][c + 1] === 0) return { x: 1, y: 0 };
  if (maze.cells[r][c - 1] === 0) return { x: -1, y: 0 };
  if (maze.cells[r + 1][c] === 0) return { x: 0, y: 1 };
  return { x: 0, y: -1 };
}

async function mountHarness(maze: MazeData, viewport = VIEWPORT) {
  const env = makeEnv();
  let api!: EngineApi;
  const el = (vp: { width: number; height: number }, token: number) =>
    React.createElement(Harness, {
      maze,
      viewport: vp,
      resetToken: token,
      env,
      onApi: (a: EngineApi) => {
        api = a;
      },
    });
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(el(viewport, 0));
  });
  mounted.push(tree);
  return {
    env,
    getApi: () => api,
    /** 手动卸载（从全局挂载列表移除，避免 afterEach 二次卸载） */
    unmount: async () => {
      const idx = mounted.indexOf(tree);
      if (idx >= 0) mounted.splice(idx, 1);
      await ReactTestRenderer.act(() => {
        tree.unmount();
      });
    },
    rerender: async (vp = viewport, token = 0) => {
      await ReactTestRenderer.act(() => {
        tree.update(el(vp, token));
      });
    },
  };
}

describe('useGameEngine 镜头', () => {
  it('reset 后 camScale = max(fit, INITIAL_CELL_DP) / cellPx（小/大迷宫分支）', async () => {
    // 小迷宫（easy, G=27）：fit 高于下限 → 取 fit
    const easy = generateMaze(1234567, 'easy');
    const h1 = await mountHarness(easy, VIEWPORT);
    const fitEasy = Math.min(VIEWPORT.width, VIEWPORT.height) / (easy.G + 1.6);
    expect(fitEasy).toBeGreaterThan(INITIAL_CELL_DP);
    expect(h1.env.camScaleRef.current).toBeCloseTo(fitEasy / BASE_CELL_DP, 9);

    // 大迷宫（hell, G=71）：fit 低于下限 → 取 INITIAL_CELL_DP
    const hell = generateMaze(1234567, 'hell');
    const h2 = await mountHarness(hell, VIEWPORT);
    const fitHell = Math.min(VIEWPORT.width, VIEWPORT.height) / (hell.G + 1.6);
    expect(fitHell).toBeLessThan(INITIAL_CELL_DP);
    expect(h2.env.camScaleRef.current).toBeCloseTo(INITIAL_CELL_DP / BASE_CELL_DP, 9);
  });

  it('zoomAt 锚点世界坐标不变（两次缩放误差 < 1e-6），并钳制在 MIN/MAX_SCALE_DP', async () => {
    const maze = generateMaze(1234567, 'easy');
    const { env, getApi } = await mountHarness(maze, VIEWPORT);
    const worldAt = (sx: number, sy: number) => {
      const c = getApi().getCam();
      const k = env.cellPxRef.current * getApi().getCamScale();
      return {
        x: c.x + (sx - VIEWPORT.width / 2) / k,
        y: c.y + (sy - VIEWPORT.height / 2) / k,
      };
    };

    const sx = 100;
    const sy = 120;
    const w0 = worldAt(sx, sy);
    getApi().zoomAt(sx, sy, 1.5);
    const w1 = worldAt(sx, sy);
    expect(Math.abs(w1.x - w0.x)).toBeLessThan(1e-6);
    expect(Math.abs(w1.y - w0.y)).toBeLessThan(1e-6);

    getApi().zoomAt(sx, sy, 0.8);
    const w2 = worldAt(sx, sy);
    expect(Math.abs(w2.x - w1.x)).toBeLessThan(1e-6);
    expect(Math.abs(w2.y - w1.y)).toBeLessThan(1e-6);

    // 极端 factor 被 MIN/MAX_SCALE_DP 钳制（换算为相对 cellPx 的倍数）
    getApi().zoomAt(150, 150, 100);
    expect(env.camScaleRef.current).toBeCloseTo(MAX_SCALE_DP / env.cellPxRef.current, 9);
    getApi().zoomAt(150, 150, 1e-6);
    expect(env.camScaleRef.current).toBeCloseTo(MIN_SCALE_DP / env.cellPxRef.current, 9);
  });

  it('settleZoom：|s-1|<0.12 返回 null；否则只计算目标 cellPx（不改 camScale），applySettle 成对落地', async () => {
    const maze = generateMaze(1234567, 'easy');
    const { env, getApi } = await mountHarness(maze, VIEWPORT);

    // 微小差额：不清零，返回 null，camScale 不动
    env.camScaleRef.current = 1.05;
    expect(getApi().settleZoom()).toBeNull();
    expect(env.camScaleRef.current).toBe(1.05);
    env.camScaleRef.current = 0.9;
    expect(getApi().settleZoom()).toBeNull();
    expect(env.camScaleRef.current).toBe(0.9);

    // 显著差额：只返回目标绘制尺寸（1/4 粒度 → 乘积误差 ≤ 1/8），camScale 保持原值不落拍
    env.cellPxRef.current = BASE_CELL_DP;
    env.camScaleRef.current = 2.7;
    const px = getApi().settleZoom();
    expect(px).not.toBeNull();
    expect(env.camScaleRef.current).toBe(2.7);
    expect(Math.abs(px! - BASE_CELL_DP * 2.7)).toBeLessThanOrEqual(1 / 8 + 1e-9);

    // 屏幕更新 cellPx 后 applySettle 落地：camScale 归 1（乘积保持）并重写球/容器视图
    const view = env.ballViewRef.current as unknown as { setNativeProps: jest.Mock };
    const before = view.setNativeProps.mock.calls.length;
    env.cellPxRef.current = px!;
    getApi().applySettle();
    expect(env.camScaleRef.current).toBe(1);
    expect(env.cellPxRef.current * env.camScaleRef.current).toBe(px);
    expect(view.setNativeProps.mock.calls.length).toBe(before + 2); // writeBall + writeContainer
  });

  it('clampCam：视图小于迷宫时中心钳制在 [wW/2, G-wW/2]；全览时锁 G/2', async () => {
    const maze = generateMaze(1234567, 'easy'); // G=27
    const { env, getApi } = await mountHarness(maze, VIEWPORT);

    // k = 12 → 视图 25 格宽 < 27：可平移，钳制在边界
    env.camScaleRef.current = 1;
    getApi().jumpTo(-999, -999);
    expect(getApi().getCam().x).toBeCloseTo(25 / 2, 9);
    expect(getApi().getCam().y).toBeCloseTo(25 / 2, 9);
    getApi().jumpTo(999, 999);
    expect(getApi().getCam().x).toBeCloseTo(27 - 25 / 2, 9);
    expect(getApi().getCam().y).toBeCloseTo(27 - 25 / 2, 9);

    // 全览：视图大于迷宫 → 锁中心 G/2
    env.camScaleRef.current = 0.3; // k=3.6 → 83.3 格宽 > 27
    getApi().jumpTo(3, 3);
    expect(getApi().getCam().x).toBeCloseTo(27 / 2, 9);
    expect(getApi().getCam().y).toBeCloseTo(27 / 2, 9);
  });

  it('manual 后 hold 内 cam 不动；followBall 后恢复跟随', async () => {
    const maze = generateMaze(1234567, 'hell'); // G=71
    const { env, getApi } = await mountHarness(maze, VIEWPORT);
    const k = env.cellPxRef.current * getApi().getCamScale();
    const wW = VIEWPORT.width / k;
    // 把镜头推到小球对侧边界，制造 |cam-ball| 超出死区
    const ball = getApi().getBall();
    const targetX = ball.x < maze.G / 2 ? maze.G - wW / 2 : wW / 2;
    getApi().pan((getApi().getCam().x - targetX) * k, 0);
    expect(getApi().getCam().x).toBeCloseTo(targetX, 6);

    // manual：hold 期间（约 0.96s < 2s）cam 严格不动
    getApi().manual();
    const c1 = { ...getApi().getCam() };
    await stepFrames(60);
    expect(getApi().getCam().x).toBe(c1.x);
    expect(getApi().getCam().y).toBe(c1.y);

    // followBall 恢复：cam 开始朝小球追踪
    getApi().followBall();
    await stepFrames(20);
    const c2 = { ...getApi().getCam() };
    expect(Math.abs(c2.x - c1.x) + Math.abs(c2.y - c1.y)).toBeGreaterThan(0.5);
  });

  it('【防 C1 回归】澄清落地后 camScale 保持 1 不被 fit 重算覆盖；仅视口变化才重算', async () => {
    const maze = generateMaze(1234567, 'easy');
    const { env, getApi, rerender } = await mountHarness(maze, VIEWPORT);

    // 捏合放大后澄清：settleZoom 只计算，camScale 尚未落地
    getApi().zoomAt(150, 150, 1.5);
    expect(env.camScaleRef.current).toBeGreaterThan(1);
    const px = getApi().settleZoom();
    expect(px).not.toBeNull();
    expect(env.camScaleRef.current).toBeGreaterThan(1);

    // 屏幕 setCellPxState(px) 的效果：cellPx 更新 + 同一 effect 中 applySettle 归 1
    env.cellPxRef.current = px!;
    getApi().applySettle();
    expect(env.camScaleRef.current).toBe(1);
    await rerender();
    await stepFrames(5);
    expect(env.camScaleRef.current).toBe(1);

    // 反证：仅视口尺寸变化（旋转/分屏）才由引擎重算 fit
    await rerender({ width: 400, height: 500 });
    const fitNew = Math.min(400, 500) / (maze.G + 1.6);
    expect(env.camScaleRef.current).toBeCloseTo(
      Math.max(fitNew, INITIAL_CELL_DP) / env.cellPxRef.current,
      9,
    );
  });
});

describe('useGameEngine AppState 生命周期', () => {
  let appStateHandler: ((s: AppStateStatus) => void) | null = null;
  let removeHandler: jest.Mock;
  let addSpy: jest.SpyInstance;

  beforeEach(() => {
    appStateHandler = null;
    removeHandler = jest.fn();
    addSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      appStateHandler = handler;
      return { remove: removeHandler };
    });
  });

  afterEach(() => {
    addSpy.mockRestore();
  });

  /** 手动触发 AppState change（捕获自引擎注册的监听） */
  function change(state: AppStateStatus) {
    expect(appStateHandler).not.toBeNull();
    appStateHandler!(state);
  }

  it('AppState 切后台后停止 rAF，回前台恢复并重置时间基准', async () => {
    const maze = generateMaze(1234567, 'easy');
    const { env, getApi } = await mountHarness(maze, VIEWPORT);
    expect(appStateHandler).not.toBeNull(); // 引擎已注册 AppState 监听

    // a) 推进一帧：rAF 链运行中（每帧结束后重新排队）
    await stepFrames(1);
    expect(rafQueue.length).toBe(1);

    // 推杆（朝起点格可通行方向），第一帧球正常移动
    env.joyRef.current = openDirAtStart(maze);
    const ball = getApi().getBall();
    const p0 = { x: ball.x, y: ball.y };
    await stepFrames(1);
    const p1 = { x: ball.x, y: ball.y };
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeGreaterThan(0.1);
    expect(rafQueue.length).toBe(1);

    // b) 切后台：下一帧 tick 早退，不再调度 → 队列空，球停住
    change('background');
    await stepFrames(1);
    expect(rafQueue.length).toBe(0);
    expect(ball.x).toBe(p1.x);
    expect(ball.y).toBe(p1.y);

    // c) 回前台：rAF 恢复排队
    change('active');
    expect(rafQueue.length).toBe(1);

    // d) 回前台第一帧带 10s 时间跳跃：lastTs 重置 → dt=0，球不因大 dt 瞬移
    // （若未重置，dt 会被 clamp 到 0.033，位移约 0.36 世界单位）
    await stepFrames(1, 10000);
    expect(ball.x).toBe(p1.x);
    expect(ball.y).toBe(p1.y);
    expect(rafQueue.length).toBe(1);

    // 后续帧恢复正常步进（16ms → 约 0.18 世界单位）
    await stepFrames(1);
    expect(Math.hypot(ball.x - p1.x, ball.y - p1.y)).toBeGreaterThan(0.1);
    expect(rafQueue.length).toBe(1);
  });

  it('重复 active 事件不叠加 rAF 链', async () => {
    const maze = generateMaze(1234567, 'easy');
    const { env, getApi } = await mountHarness(maze, VIEWPORT);
    await stepFrames(1); // 建立时间基准，链运行中

    // 切后台推进一帧：tick 早退清空队列
    change('background');
    await stepFrames(1);
    expect(rafQueue.length).toBe(0);

    // 回前台恢复单链
    change('active');
    expect(rafQueue.length).toBe(1);

    // 重复 active：wasActive 已为 true，不应再排新帧叠加
    change('active');
    change('active');
    expect(rafQueue.length).toBe(1);

    // 推进后仍是单链，且球随摇杆正常移动（恢复首帧 dt=0，次帧 16ms 步进）
    env.joyRef.current = openDirAtStart(maze);
    const ball = getApi().getBall();
    const p0 = { x: ball.x, y: ball.y };
    await stepFrames(2);
    expect(Math.hypot(ball.x - p0.x, ball.y - p0.y)).toBeGreaterThan(0.1);
    expect(rafQueue.length).toBe(1);
  });

  it('inactive/background → active 循环后恢复单链', async () => {
    const maze = generateMaze(1234567, 'easy');
    const { env, getApi } = await mountHarness(maze, VIEWPORT);
    await stepFrames(1); // 建立时间基准，链运行中
    env.joyRef.current = openDirAtStart(maze);

    // 循环 1：inactive（非活跃）→ 早退清空 → active 恢复单链
    change('inactive');
    await stepFrames(1);
    expect(rafQueue.length).toBe(0);
    change('active');
    expect(rafQueue.length).toBe(1);

    // 推进一帧：lastTs 重建为本帧 ts（此后若仅重启时重置，就留下大 dt 隐患）
    await stepFrames(1);
    expect(rafQueue.length).toBe(1);

    // 循环 2：background 下不消费帧（rAF 回调冻结在队列，rafRef!==0）→ active
    change('background');
    expect(rafQueue.length).toBe(1);
    change('active');
    expect(rafQueue.length).toBe(1);

    // 恢复首帧带 10s 时间跳跃：时间基准无条件重置 → dt=0，球不瞬移
    // （若仅 rafRef===0 时重置，此处 lastTs 为上一帧 ts，dt 被钳到 33ms → 球跳约 0.36 世界单位）
    const ball = getApi().getBall();
    const p0 = { x: ball.x, y: ball.y };
    await stepFrames(1, 10000);
    expect(ball.x).toBe(p0.x);
    expect(ball.y).toBe(p0.y);
    expect(rafQueue.length).toBe(1);

    // 后续 16ms 帧恢复正常步进
    await stepFrames(1);
    expect(Math.hypot(ball.x - p0.x, ball.y - p0.y)).toBeGreaterThan(0.1);
    expect(rafQueue.length).toBe(1);
  });

  it('卸载时移除 AppState 监听', async () => {
    const maze = generateMaze(1234567, 'easy');
    const h = await mountHarness(maze, VIEWPORT);
    expect(removeHandler).not.toHaveBeenCalled();

    await h.unmount();
    expect(removeHandler).toHaveBeenCalledTimes(1);
  });
});
