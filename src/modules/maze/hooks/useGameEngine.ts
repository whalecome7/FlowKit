import { useEffect, useRef } from 'react';
import type { View } from 'react-native';
import {
  BALL_R,
  END_TOL,
  INITIAL_CELL_DP,
  JOY_DEAD,
  MAX_SCALE_DP,
  MIN_SCALE_DP,
  SPEED,
} from '../constants';
import { moveBall } from '../services/collision';
import type { BallPos, CellPoint, JoyVector, MazeData } from '../types';

export interface EngineOptions {
  /** 小球首次移动（开始计时） */
  onStart: () => void;
  /** 进入新格（含起点外每步） */
  onEnterCell: (cell: CellPoint) => void;
  /** 通关（elapsedMs 为首次移动至今） */
  onWin: (elapsedMs: number) => void;
  maze: MazeData;
  joyRef: React.MutableRefObject<JoyVector>;
  ballViewRef: React.RefObject<View | null>;
  containerRef: React.RefObject<View | null>;
  viewport: { width: number; height: number };
  /** 变化时重置一局（重开/换局） */
  resetToken: number;
  /** 镜头：相对基准格的缩放倍数（Task 15 会由此 hook 接管计算） */
  camScaleRef: React.MutableRefObject<number>;
  /** MazeSvg 当前绘制单元尺寸（澄清缩放后由屏幕更新） */
  cellPxRef: React.MutableRefObject<number>;
}

/**
 * 引擎职责：
 * - requestAnimationFrame 循环读取摇杆向量 → moveBall 物理 → 步数/通关事件
 * - 小球视图直写（位置含镜头变换）
 * - 容器平移直写（镜头跟随，Task 15 完善手动模式）
 */
export function useGameEngine(opts: EngineOptions) {
  const { maze, joyRef, ballViewRef, containerRef, viewport, resetToken, camScaleRef, cellPxRef } = opts;
  const cbRef = useRef(opts);
  cbRef.current = opts;

  const ball = useRef<BallPos>({ x: 0, y: 0 });
  const curCell = useRef<CellPoint>([0, 0]);
  const phaseRef = useRef<'ready' | 'playing' | 'won'>('ready');
  const startTimeRef = useRef(0);
  const cam = useRef({ x: maze.G / 2, y: maze.G / 2 });
  const followRef = useRef(true);
  const followHoldRef = useRef(0);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  // 终点世界坐标（每渲染重算；tick 闭包随 effect 依赖 maze 重建）
  const endPos = { x: 2 * maze.end[0] + 1.5, y: 2 * maze.end[1] + 1.5 };

  function camScale(): number {
    return camScaleRef.current;
  }

  /** 世界坐标 → 屏幕坐标（小球不经容器变换，直接换算） */
  function worldToScreen(x: number, y: number): { sx: number; sy: number } {
    const s = camScale();
    const k = cellPxRef.current * s;
    return {
      sx: (x - cam.current.x) * k + viewport.width / 2,
      sy: (y - cam.current.y) * k + viewport.height / 2,
    };
  }

  function writeBall() {
    const v = ballViewRef.current;
    if (!v) return;
    const { sx, sy } = worldToScreen(ball.current.x, ball.current.y);
    const d = BALL_R * 2 * cellPxRef.current * camScale();
    v.setNativeProps({
      style: {
        width: d,
        height: d,
        borderRadius: d / 2,
        transform: [{ translateX: sx - d / 2 }, { translateY: sy - d / 2 }],
      },
    });
  }

  function writeContainer() {
    const v = containerRef.current;
    if (!v) return;
    const s = camScale();
    // RN transform 围绕元素中心缩放：先居中平移（与 s 无关），
    // 再按 s 反向补偿镜头中心相对元素中心的偏移
    const size = maze.G * cellPxRef.current;
    const tx = viewport.width / 2 - size / 2 - s * (cam.current.x * cellPxRef.current - size / 2);
    const ty = viewport.height / 2 - size / 2 - s * (cam.current.y * cellPxRef.current - size / 2);
    v.setNativeProps({
      style: { transform: [{ translateX: tx }, { translateY: ty }, { scale: s }] },
    });
  }

  /** 手动操作：暂停跟随 */
  function manual() {
    followRef.current = false;
    followHoldRef.current = 2;
  }

  /** 回到跟随模式 */
  function followBall() {
    followRef.current = true;
    followHoldRef.current = 0;
  }

  /** 屏幕坐标平移镜头（dxScreen/dyScreen 为本次手势的位移） */
  function pan(dxScreen: number, dyScreen: number) {
    const k = cellPxRef.current * camScale();
    cam.current.x -= dxScreen / k;
    cam.current.y -= dyScreen / k;
    clampCam();
    writeContainer();
    writeBall();
  }

  /** 以屏幕点为锚缩放（factor 为本次增量倍率） */
  function zoomAt(sx: number, sy: number, factor: number) {
    const s0 = camScale();
    const s1 = Math.max(
      MIN_SCALE_DP / cellPxRef.current,
      Math.min(MAX_SCALE_DP / cellPxRef.current, s0 * factor),
    );
    const k0 = cellPxRef.current * s0;
    const wx = cam.current.x + (sx - viewport.width / 2) / k0;
    const wy = cam.current.y + (sy - viewport.height / 2) / k0;
    camScaleRef.current = s1;
    const k1 = cellPxRef.current * s1;
    cam.current.x = wx - (sx - viewport.width / 2) / k1;
    cam.current.y = wy - (sy - viewport.height / 2) / k1;
    clampCam();
    writeContainer();
    writeBall();
  }

  function clampCam() {
    const k = cellPxRef.current * camScale();
    const wW = viewport.width / k;
    const wH = viewport.height / k;
    cam.current.x = maze.G <= wW ? maze.G / 2 : Math.max(wW / 2, Math.min(maze.G - wW / 2, cam.current.x));
    cam.current.y = maze.G <= wH ? maze.G / 2 : Math.max(wH / 2, Math.min(maze.G - wH / 2, cam.current.y));
  }

  /** 缩放澄清：把手势缩放固化进绘制尺寸（避免位图放大模糊）。返回值即新的 cellPx（无变化返回 null） */
  function settleZoom(): number | null {
    const s = camScale();
    if (Math.abs(s - 1) < 0.12) return null;
    const targetPx = Math.round(cellPxRef.current * s * 4) / 4;
    camScaleRef.current = 1;
    return targetPx;
  }

  /** 镜头跳转到世界坐标（缩略图点击） */
  function jumpTo(wx: number, wy: number): void {
    cam.current.x = wx;
    cam.current.y = wy;
    clampCam();
    manual();
    writeContainer();
    writeBall();
  }

  /** 初始/重布局缩放：小迷宫全览、大迷宫按初始单元下限 */
  function computeFitScale(): number {
    const fit = Math.min(viewport.width, viewport.height) / (maze.G + 1.6);
    return Math.max(fit, INITIAL_CELL_DP) / cellPxRef.current;
  }

  function reset() {
    camScaleRef.current = computeFitScale();
    // 原地更新：保证 getBall/getCam 已流出的引用不失效（调用方可能缓存）
    ball.current.x = 2 * maze.start[0] + 1.5;
    ball.current.y = 2 * maze.start[1] + 1.5;
    curCell.current = [maze.start[0], maze.start[1]];
    phaseRef.current = 'ready';
    startTimeRef.current = 0;
    cam.current.x = maze.G / 2;
    cam.current.y = maze.G / 2;
    followRef.current = true;
    followHoldRef.current = 0;
    writeBall();
    writeContainer();
  }

  /** 跟随镜头：死区 30%，出界平滑追踪；手动模式接管与回跟随见 followRef */
  function updateCamera(dt: number) {
    if (followHoldRef.current > 0) followHoldRef.current -= dt;
    const s = camScale();
    const wW = viewport.width / (cellPxRef.current * s);
    const wH = viewport.height / (cellPxRef.current * s);
    if (maze.G <= wW && maze.G <= wH) {
      cam.current.x = maze.G / 2;
      cam.current.y = maze.G / 2;
      return;
    }
    const dx = ball.current.x - cam.current.x;
    const dy = ball.current.y - cam.current.y;
    const deadX = wW * 0.3;
    const deadY = wH * 0.3;
    const moving = Math.abs(joyRef.current.x) + Math.abs(joyRef.current.y) > 0.05;
    if (!followRef.current && followHoldRef.current <= 0 && moving && (Math.abs(dx) > deadX || Math.abs(dy) > deadY)) {
      followRef.current = true;
    }
    if (!followRef.current) return;
    let tx = cam.current.x;
    let ty = cam.current.y;
    if (dx > deadX) tx = ball.current.x - deadX;
    if (dx < -deadX) tx = ball.current.x + deadX;
    if (dy > deadY) ty = ball.current.y - deadY;
    if (dy < -deadY) ty = ball.current.y + deadY;
    const f = Math.min(1, dt * 7);
    cam.current.x += (tx - cam.current.x) * f;
    cam.current.y += (ty - cam.current.y) * f;
    clampCam();
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maze, resetToken]);

  // 视口变化（旋转/分屏）：重算 fit 并重布局，不重置对局
  useEffect(() => {
    if (viewport.width <= 0) return;
    camScaleRef.current = computeFitScale();
    writeBall();
    writeContainer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.width, viewport.height]);

  useEffect(() => {
    function tick(ts: number) {
      const dt = lastTsRef.current ? Math.min((ts - lastTsRef.current) / 1000, 0.033) : 0;
      lastTsRef.current = ts;
      if (phaseRef.current !== 'won' && viewport.width > 0) {
        const j = joyRef.current;
        const mag = Math.hypot(j.x, j.y);
        if (mag > JOY_DEAD) {
          if (phaseRef.current === 'ready') {
            phaseRef.current = 'playing';
            startTimeRef.current = Date.now();
            cbRef.current.onStart();
          }
          const amp = Math.pow((mag - JOY_DEAD) / (1 - JOY_DEAD), 1.15);
          const ux = j.x / mag;
          const uy = j.y / mag;
          moveBall(maze, ball.current, ux * SPEED * amp * dt, uy * SPEED * amp * dt);
          const ci = Math.floor((ball.current.x - 1) / 2);
          const cj = Math.floor((ball.current.y - 1) / 2);
          if (ci !== curCell.current[0] || cj !== curCell.current[1]) {
            curCell.current = [ci, cj];
            cbRef.current.onEnterCell([ci, cj]);
          }
          if (Math.hypot(ball.current.x - endPos.x, ball.current.y - endPos.y) < END_TOL) {
            phaseRef.current = 'won';
            cbRef.current.onWin(Date.now() - startTimeRef.current);
          }
        }
        updateCamera(dt);
        writeBall();
        writeContainer();
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maze, viewport.width, viewport.height]);

  return {
    /** 供外部读取当前球位置（幽灵/缩略图） */
    getBall: () => ball.current,
    getCam: () => cam.current,
    manual,
    followBall,
    pan,
    zoomAt,
    settleZoom,
    jumpTo,
    getCamScale: camScale,
  };
}
