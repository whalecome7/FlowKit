import { useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { Dimensions, PanResponder } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent, View } from 'react-native';
import { joystickZoneHeight } from '../constants';
import type { JoyVector } from '../types';
import type { JoystickViewHandle } from '../components/JoystickView';

/** 摇杆有效半径（dp）：位移钳制与向量归一化基准 */
export const JOY_RADIUS = 44;
/** 轻触判定上限：按压时长（ms） */
export const TAP_MAX_MS = 300;
/** 轻触判定上限：总位移（dp），超出即视为拖动（不参与双击） */
export const TAP_MAX_DIST = 6;
/** 双击判定窗口（ms） */
export const DOUBLE_TAP_MS = 300;

/** 从引擎取用的镜头操作（由屏幕转发） */
export interface CamApi {
  manual: () => void;
  pan: (dxScreen: number, dyScreen: number) => void;
  zoomAt: (sx: number, sy: number, factor: number) => void;
  followBall: () => void;
}

export interface RegionApi {
  /** 摇杆输出（写给引擎的 joyRef） */
  onJoystickVector: (v: JoyVector) => void;
  joystickRef: RefObject<JoystickViewHandle | null>;
  /** 从引擎取用的镜头操作 */
  cam: CamApi;
  /** 镜头触摸清空（镜头空闲）时回调：屏幕层据此调度缩放澄清 */
  onCameraIdle?: () => void;
}

interface Point {
  x: number;
  y: number;
}

/** 触摸 identifier（RN TS 类型标为 string，运行时为 number——按原值跟踪，不做转换） */
type TouchId = number | string;

/** 轻触候选（双击判定用）：按下时刻与起点，移动超限即作废 */
interface TapCandidate {
  t: number;
  x: number;
  y: number;
  moved: boolean;
}

/**
 * 统一手势层：整个游戏区（迷宫 viewport + 底部摇杆带）由单个 PanResponder 管理，
 * 触摸归属在按下瞬间按区域分配——带内=摇杆（首个触摸）、迷宫区=镜头；
 * 归属一经锁定直到抬起不变（拖到任何区域都继续原逻辑，不触发其他动作），多指并行自然成立。
 *
 * 坐标约定：事件一律用 pageX/pageY；区域原点经 measureInWindow 缓存
 * （真机异步补偿，默认 (0,0)；测试环境该回调不触发时直接按区域坐标使用）。
 */
export function useGameGestures(api: RegionApi) {
  // 手势闭包经 apiRef 读取最新 api（屏幕每次渲染新建对象，防闭包过期）
  const apiRef = useRef(api);
  apiRef.current = api;

  const regionRef = useRef<View>(null);
  /** 区域在窗口中的原点（默认 (0,0) = 未测量时视事件坐标为区域坐标） */
  const originRef = useRef<Point>({ x: 0, y: 0 });
  /** 摇杆带上边界（区域坐标 y）；layout 未知（≤0）时忽略触摸，避免误分 */
  const regionHRef = useRef(0);
  const joyTopRef = useRef(0);

  // 触摸归属（全部 ref：手势回调闭包不随渲染重建）
  const joyIdRef = useRef<TouchId | null>(null);
  const joyOriginRef = useRef<Point | null>(null);
  const camPointsRef = useRef<Map<TouchId, Point>>(new Map());
  const pinchDRef = useRef<number | null>(null);
  const joyTapRef = useRef<TapCandidate | null>(null);
  const camTapRef = useRef<TapCandidate | null>(null);
  const joyLastTapRef = useRef(0);
  const camLastTapRef = useRef(0);

  /** pageX/pageY → 区域坐标 */
  function toRegion(pageX: number, pageY: number): Point {
    return { x: pageX - originRef.current.x, y: pageY - originRef.current.y };
  }

  /** 分配触摸归属（grant=首指 / start=后续指）：按下瞬间按区域锁定 */
  function allocate(evt: GestureResponderEvent) {
    if (regionHRef.current <= 0) return; // 布局未知：忽略（不崩溃）
    const id = evt.nativeEvent.identifier ?? 0;
    const p = toRegion(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
    if (p.y >= joyTopRef.current) {
      // 摇杆带：仅首个触摸得到摇杆；已占用时忽略（不抢杆、也不归镜头）
      if (joyIdRef.current !== null) return;
      joyIdRef.current = id;
      joyOriginRef.current = p;
      apiRef.current.joystickRef.current?.show(p.x, p.y - joyTopRef.current);
      apiRef.current.onJoystickVector({ x: 0, y: 0 });
      joyTapRef.current = { t: Date.now(), x: p.x, y: p.y, moved: false };
      return;
    }
    // 迷宫区：归镜头（多指并行；第三指起仍纳入，捏合取前两指）
    camPointsRef.current.set(id, p);
    if (camPointsRef.current.size === 1) {
      camTapRef.current = { t: Date.now(), x: p.x, y: p.y, moved: false };
    } else {
      camTapRef.current = null; // 多指在手：不构成轻触候选
    }
    if (camPointsRef.current.size === 2) {
      const [a, b] = Array.from(camPointsRef.current.values());
      pinchDRef.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  /** 移动：按 touch.identifier 恢复归属——摇杆指继续杆逻辑（跨区不换），镜头指走平移/捏合 */
  function handleMove(evt: GestureResponderEvent) {
    const touches = evt.nativeEvent.touches;
    for (let i = 0; i < touches.length; i++) {
      const t = touches[i];
      const id = t.identifier ?? 0;
      if (id === joyIdRef.current && joyOriginRef.current !== null) {
        // 摇杆指：即使指尖移到迷宫区，也继续按摇杆逻辑输出（回归跨区乱触 bug）
        const p = toRegion(t.pageX, t.pageY);
        const origin = joyOriginRef.current;
        let dx = p.x - origin.x;
        let dy = p.y - origin.y;
        const mag = Math.hypot(dx, dy);
        if (mag > JOY_RADIUS) {
          dx = (dx / mag) * JOY_RADIUS;
          dy = (dy / mag) * JOY_RADIUS;
        }
        apiRef.current.joystickRef.current?.moveKnob(dx, dy);
        apiRef.current.onJoystickVector({ x: dx / JOY_RADIUS, y: dy / JOY_RADIUS });
        const tap = joyTapRef.current;
        if (tap && Math.hypot(p.x - tap.x, p.y - tap.y) > TAP_MAX_DIST) tap.moved = true;
        continue;
      }
      const prev = camPointsRef.current.get(id);
      if (!prev) continue;
      const p = toRegion(t.pageX, t.pageY);
      camPointsRef.current.set(id, p);
      const tap = camTapRef.current;
      if (tap && Math.hypot(p.x - tap.x, p.y - tap.y) > TAP_MAX_DIST) tap.moved = true;
      if (camPointsRef.current.size === 1) {
        // 单指平移：本次采样差（先算差再更新，Map 已在上方 set）
        apiRef.current.cam.pan(p.x - prev.x, p.y - prev.y);
        apiRef.current.cam.manual();
      }
    }
    if (camPointsRef.current.size >= 2) {
      // 两指（含更多）：全部镜头指位置更新后统一捏合一次（避免单事件多次 zoomAt）
      const [a, b] = Array.from(camPointsRef.current.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const base = pinchDRef.current;
      if (base === null) {
        pinchDRef.current = d; // 首帧基线（正常在第二指落下时已设，此处兜底）
      } else {
        if (base > 0 && d > 0) {
          apiRef.current.cam.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / base);
        }
        pinchDRef.current = d;
      }
      apiRef.current.cam.manual();
    }
  }

  /** 释放单指（release=末指抬起 / end=其余指仍活跃）：按归属复位；allowDoubleTap 仅 release/end 路径 */
  function endTouch(evt: GestureResponderEvent, allowDoubleTap: boolean) {
    const id = evt.nativeEvent.identifier ?? 0;
    if (joyIdRef.current !== null && id === joyIdRef.current) {
      apiRef.current.onJoystickVector({ x: 0, y: 0 });
      apiRef.current.joystickRef.current?.hide();
      if (allowDoubleTap) judgeDoubleTap(joyTapRef.current, joyLastTapRef);
      joyTapRef.current = null;
      joyIdRef.current = null;
      joyOriginRef.current = null;
    } else if (camPointsRef.current.has(id)) {
      camPointsRef.current.delete(id);
      if (camPointsRef.current.size < 2) pinchDRef.current = null;
      if (allowDoubleTap) judgeDoubleTap(camTapRef.current, camLastTapRef);
      camTapRef.current = null;
      // 镜头触摸清空（镜头空闲）→ 通知屏幕调度缩放澄清
      if (camPointsRef.current.size === 0) {
        apiRef.current.onCameraIdle?.();
      }
    } else {
      return; // 未知触摸：忽略
    }
  }

  /** 双击判定：快速轻触（未移动、按压未超时）且距上次轻触 < DOUBLE_TAP_MS → 回跟 */
  function judgeDoubleTap(tap: TapCandidate | null, lastRef: { current: number }) {
    if (!tap || tap.moved) return;
    const now = Date.now();
    if (now - tap.t > TAP_MAX_MS) return;
    if (now - lastRef.current < DOUBLE_TAP_MS) {
      lastRef.current = 0;
      apiRef.current.cam.followBall();
    } else {
      lastRef.current = now;
    }
  }

  /**
   * responder 被终止（极端情形，正常被 terminationRequest=false 拒绝）：
   * 手势回合已结束、后续事件不再到达，整体复位所有归属状态，避免摇杆卡死/镜头残留。
   */
  function terminateAll() {
    if (joyIdRef.current !== null) {
      apiRef.current.onJoystickVector({ x: 0, y: 0 });
      apiRef.current.joystickRef.current?.hide();
    }
    joyIdRef.current = null;
    joyOriginRef.current = null;
    joyTapRef.current = null;
    const hadCam = camPointsRef.current.size > 0;
    camPointsRef.current.clear();
    pinchDRef.current = null;
    camTapRef.current = null;
    if (hadCam) apiRef.current.onCameraIdle?.();
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // 手势进行中拒绝父级/兄弟接管：归属锁定后绝不放手
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: allocate,
        // 后续手指按下（responder 已建立）：与首指同规则按区域分配（多指并行基础）
        onPanResponderStart: allocate,
        onPanResponderMove: handleMove,
        onPanResponderRelease: (evt) => endTouch(evt, true),
        // 多指中单指抬起（responder 仍活跃）：按归属释放该指
        onPanResponderEnd: (evt) => endTouch(evt, true),
        onPanResponderTerminate: terminateAll,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** 区域布局（含尺寸变化）：重记分界与窗口原点（真机补偿；jest 下 no-op） */
  const onRegionLayout = (e: LayoutChangeEvent) => {
    const { height } = e.nativeEvent.layout;
    regionHRef.current = height;
    // 摇杆带分界 = 区域高 - 摇杆带高（布局变化时重取窗口高，防旋转/分屏过期）
    joyTopRef.current = height - joystickZoneHeight(Dimensions.get('window').height);
    regionRef.current?.measureInWindow((x, y) => {
      originRef.current = { x, y };
    });
  };

  return { regionHandlers: panResponder.panHandlers, regionRef, onRegionLayout };
}
