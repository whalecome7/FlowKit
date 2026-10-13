import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Dimensions, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { joystickZoneHeight } from '../constants';
import { useGameGestures } from './useGameGestures';
import type { RegionApi } from './useGameGestures';
import type { JoystickViewHandle } from '../components/JoystickView';

// ------------------------------------------------------------------
// 事件构造：与 FloatingJoystick 旧测试同法——PanResponder 包装层消费
// touchHistory（grant 取 currentCentroid、move 做去重守卫并更新 gestureState），
// 裸 nativeEvent 会抛错/被吞。这里扩展为多指：touchBank 下标 = identifier，
// 每次事件的 mostRecentTimeStamp 严格递增（保住 move 去重路径）。
// ------------------------------------------------------------------

interface TouchSpec {
  id: number;
  pageX: number;
  pageY: number;
  /** 上一次采样位置（move 的 previous centroid 用） */
  prevPageX?: number;
  prevPageY?: number;
}

let seq = 0;
const nextTs = () => ++seq;

/** active=当前屏上所有活跃触点（含事件主指）；lead=事件主指（changedTouches/identifier） */
function makeEvent(
  active: TouchSpec[],
  lead: TouchSpec,
  timestamp: number,
): GestureResponderEvent {
  const bank: unknown[] = [];
  for (const t of active) {
    bank[t.id] = {
      touchActive: true,
      startPageX: t.prevPageX ?? t.pageX,
      startPageY: t.prevPageY ?? t.pageY,
      startTimeStamp: 1,
      currentPageX: t.pageX,
      currentPageY: t.pageY,
      currentTimeStamp: timestamp,
      previousPageX: t.prevPageX ?? t.pageX,
      previousPageY: t.prevPageY ?? t.pageY,
      previousTimeStamp: Math.max(1, timestamp - 1),
    };
  }
  const toTouch = (t: TouchSpec) => ({
    identifier: t.id,
    pageX: t.pageX,
    pageY: t.pageY,
    locationX: t.pageX,
    locationY: t.pageY,
    timestamp,
  });
  return {
    nativeEvent: {
      identifier: lead.id,
      pageX: lead.pageX,
      pageY: lead.pageY,
      locationX: lead.pageX,
      locationY: lead.pageY,
      timestamp,
      touches: active.map(toTouch),
      changedTouches: [toTouch(lead)],
    },
    touchHistory: {
      touchBank: bank,
      numberActiveTouches: active.length,
      indexOfSingleActiveTouch: active.length === 1 ? active[0].id : -1,
      mostRecentTimeStamp: timestamp,
    },
  } as unknown as GestureResponderEvent;
}

const REGION_W = 300;
const REGION_H = 600;
/** 摇杆带上边界（区域坐标）：600 - joystickZoneHeight(窗口高) */
const JOY_TOP = REGION_H - joystickZoneHeight(Dimensions.get('window').height);

// ------------------------------------------------------------------
// Harness：真实调用 useGameGestures，注入 jest mock 的 RegionApi
// ------------------------------------------------------------------

function Harness({ api }: { api: RegionApi }) {
  const g = useGameGestures(api);
  return <View testID="region" ref={g.regionRef} onLayout={g.onRegionLayout} {...g.regionHandlers} />;
}

function makeApi() {
  const joystick: JoystickViewHandle = {
    show: jest.fn(),
    moveKnob: jest.fn(),
    hide: jest.fn(),
  };
  const vector = jest.fn();
  const pan = jest.fn();
  const zoomAt = jest.fn();
  const manual = jest.fn();
  const followBall = jest.fn();
  const idle = jest.fn();
  const gestureStart = jest.fn();
  const api: RegionApi = {
    onJoystickVector: vector,
    joystickRef: { current: joystick },
    cam: { manual, pan, zoomAt, followBall },
    onCameraIdle: idle,
    onGestureStart: gestureStart,
  };
  return { api, joystick, vector, pan, zoomAt, manual, followBall, idle, gestureStart };
}

type Mounted = ReturnType<typeof makeApi> & {
  region: ReactTestRenderer.ReactTestInstance;
  unmount: () => Promise<void>;
};

/** 挂载 + 手动区域布局（300x600）；origin 保持默认 (0,0)（jest 下 measureInWindow 为 no-op） */
async function mount(withLayout = true): Promise<Mounted> {
  const mocks = makeApi();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<Harness api={mocks.api} />);
  });
  const region = tree.root.find((n) => typeof n.type === 'string' && n.props.testID === 'region');
  if (withLayout) {
    await ReactTestRenderer.act(() => {
      region.props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: REGION_W, height: REGION_H } },
      } as LayoutChangeEvent);
    });
  }
  return {
    ...mocks,
    region,
    unmount: async () => {
      await ReactTestRenderer.act(() => {
        tree.unmount();
      });
    },
  };
}

/** 首指按下（grant）；active 含新指 */
function grant(h: Mounted, active: TouchSpec[], lead: TouchSpec): void {
  ReactTestRenderer.act(() => {
    h.region.props.onResponderGrant(makeEvent(active, lead, nextTs()));
  });
}

/** 后续指按下（start，responder 已建立）；active 含新指 */
function start(h: Mounted, active: TouchSpec[], lead: TouchSpec): void {
  ReactTestRenderer.act(() => {
    h.region.props.onResponderStart(makeEvent(active, lead, nextTs()));
  });
}

/** 移动（active 为当前所有活跃触点） */
function move(h: Mounted, active: TouchSpec[], lead: TouchSpec): void {
  ReactTestRenderer.act(() => {
    h.region.props.onResponderMove(makeEvent(active, lead, nextTs()));
  });
}

/** 末指抬起（release）；active 为剩余触点 */
function release(h: Mounted, active: TouchSpec[], lead: TouchSpec): void {
  ReactTestRenderer.act(() => {
    h.region.props.onResponderRelease(makeEvent(active, lead, nextTs()));
  });
}

/** 多指中单指抬起（end）；active 为剩余触点 */
function end(h: Mounted, active: TouchSpec[], lead: TouchSpec): void {
  ReactTestRenderer.act(() => {
    h.region.props.onResponderEnd(makeEvent(active, lead, nextTs()));
  });
}

/** responder 被终止 */
function terminate(h: Mounted, active: TouchSpec[], lead: TouchSpec): void {
  ReactTestRenderer.act(() => {
    h.region.props.onResponderTerminate(makeEvent(active, lead, nextTs()));
  });
}

const lastCallArg = (fn: jest.Mock): unknown => fn.mock.calls[fn.mock.calls.length - 1][0];

// ------------------------------------------------------------------

describe('useGameGestures 统一手势', () => {
  it('a) 带内 DOWN 立即 show（本地换算：y 减带上边界）；MOVE 输出归一化向量与旋钮位移', async () => {
    const h = await mount();
    const joy = { id: 0, pageX: 100, pageY: 400 };
    grant(h, [joy], joy);
    // 带内坐标 y=400 → 本地 y = 400 - JOY_TOP
    expect(h.joystick.show).toHaveBeenCalledWith(100, 400 - JOY_TOP);
    // dx=+44（有效半径边界）→ (1, 0)
    const moved = { ...joy, pageX: 144, prevPageX: 100, prevPageY: 400 };
    move(h, [moved], moved);
    expect(h.joystick.moveKnob).toHaveBeenLastCalledWith(44, 0);
    expect(lastCallArg(h.vector)).toEqual({ x: 1, y: 0 });
    // 超界 → 钳制到单位向量
    const far = { ...moved, pageX: 300, prevPageX: 144, prevPageY: 400 };
    move(h, [far], far);
    expect(h.joystick.moveKnob).toHaveBeenLastCalledWith(44, 0);
    expect(lastCallArg(h.vector)).toEqual({ x: 1, y: 0 });
  });

  it('b) 回归：带内按下后拖入迷宫区，仍走摇杆分支（向量继续、不触发镜头）', async () => {
    const h = await mount();
    const joy = { id: 0, pageX: 100, pageY: 400 };
    grant(h, [joy], joy);
    // 拖到迷宫区（y=100 < JOY_TOP）：位移 (50, -300)，钳制后仍按摇杆输出
    const moved = { ...joy, pageX: 150, pageY: 100, prevPageX: 100, prevPageY: 400 };
    move(h, [moved], moved);
    const v = lastCallArg(h.vector) as { x: number; y: number };
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeLessThan(0);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 9); // 摇杆输出恒为单位向量
    expect(h.joystick.moveKnob).toHaveBeenCalled();
    expect(h.pan).not.toHaveBeenCalled();
    expect(h.zoomAt).not.toHaveBeenCalled();
    expect(h.manual).not.toHaveBeenCalled();
  });

  it('c) 多指并行：摇杆在手时迷宫区第二指平移正常；带内第三指被忽略（不抢杆、不归镜头）', async () => {
    const h = await mount();
    const joy = { id: 0, pageX: 100, pageY: 400 };
    const cam = { id: 1, pageX: 100, pageY: 100 };
    grant(h, [joy], joy);
    expect(h.joystick.show).toHaveBeenCalledTimes(1);
    // 迷宫区第二指：grant 后 move → cam.pan(位移) + manual
    start(h, [joy, cam], cam);
    const camMoved = { ...cam, pageX: 130, pageY: 120, prevPageX: 100, prevPageY: 100 };
    move(h, [joy, camMoved], camMoved);
    expect(h.pan).toHaveBeenLastCalledWith(30, 20);
    expect(h.manual).toHaveBeenCalled();
    // 带内第三指：摇杆已被占用 → 忽略（无第二个 show、无镜头分配）
    const extra = { id: 2, pageX: 250, pageY: 380 };
    start(h, [joy, camMoved, extra], extra);
    expect(h.joystick.show).toHaveBeenCalledTimes(1);
    // 第三指大幅移动：若误归镜头则 camPoints.size=2 → 必走 zoomAt 分支；此处应无捏合
    const extraMoved = { ...extra, pageX: 200, pageY: 300, prevPageX: 250, prevPageY: 380 };
    move(h, [joy, camMoved, extraMoved], extraMoved);
    expect(h.zoomAt).not.toHaveBeenCalled();
    // 摇杆与镜头均不受其影响（镜头指未动 → 不再下发零平移，pan 次数不变）
    expect(h.pan).toHaveBeenCalledTimes(1);
  });

  it('d) 迷宫区两指捏合：zoomAt 增量 = 指距比（中点锚），单指抬起后重置基线回到平移', async () => {
    const h = await mount();
    const a = { id: 0, pageX: 100, pageY: 100 };
    const b = { id: 1, pageX: 200, pageY: 100 };
    grant(h, [a], a);
    // 第二指落下：基线 = 100（当前指距）
    start(h, [a, b], b);
    // B 右移 100 → 指距 200，factor = 200/100 = 2，中点 (200, 100)
    const bMoved = { ...b, pageX: 300, prevPageX: 200, prevPageY: 100 };
    move(h, [a, bMoved], bMoved);
    expect(h.zoomAt).toHaveBeenCalledTimes(1);
    expect(h.zoomAt).toHaveBeenLastCalledWith(200, 100, 2);
    expect(h.pan).not.toHaveBeenCalled();
    // B 抬起（A 仍按）：pinchD 重置；A 再移动 → 单指平移而非缩放
    end(h, [a], b);
    const aMoved = { ...a, pageX: 120, prevPageX: 100, prevPageY: 100 };
    move(h, [aMoved], aMoved);
    expect(h.pan).toHaveBeenLastCalledWith(20, 0);
    expect(h.zoomAt).toHaveBeenCalledTimes(1);
    expect(h.manual).toHaveBeenCalled();
  });

  describe('双击回跟', () => {
    let now = 0;
    let nowSpy: jest.SpyInstance<number, []>;
    beforeEach(() => {
      now = 1000;
      nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    });
    afterEach(() => {
      nowSpy.mockRestore();
    });

    it('e1) 带内快速两次轻触（无移动、<300ms）→ followBall 1 次', async () => {
      const h = await mount();
      grant(h, [{ id: 0, pageX: 100, pageY: 400 }], { id: 0, pageX: 100, pageY: 400 });
      release(h, [], { id: 0, pageX: 100, pageY: 400 });
      now = 1100;
      grant(h, [{ id: 0, pageX: 120, pageY: 420 }], { id: 0, pageX: 120, pageY: 420 });
      release(h, [], { id: 0, pageX: 120, pageY: 420 });
      expect(h.followBall).toHaveBeenCalledTimes(1);
    });

    it('e2) 带内轻触 + 拖动 → 不触发 followBall', async () => {
      const h = await mount();
      const p = { id: 0, pageX: 100, pageY: 400 };
      grant(h, [p], p);
      const moved = { ...p, pageX: 160, prevPageX: 100, prevPageY: 400 };
      move(h, [moved], moved); // 位移 60 > 6 → 不再是轻触候选
      release(h, [], moved);
      now = 1100;
      const p2 = { id: 0, pageX: 120, pageY: 420 };
      grant(h, [p2], p2);
      release(h, [], p2);
      expect(h.followBall).not.toHaveBeenCalled();
    });

    it('e3) 迷宫区快速两次轻触 → followBall 1 次（原行为保留）', async () => {
      const h = await mount();
      const p1 = { id: 0, pageX: 100, pageY: 100 };
      grant(h, [p1], p1);
      release(h, [], p1);
      now = 1150;
      const p2 = { id: 0, pageX: 130, pageY: 120 };
      grant(h, [p2], p2);
      release(h, [], p2);
      expect(h.followBall).toHaveBeenCalledTimes(1);
    });

    it('e4) 超过双击窗口（>300ms）的两次轻触不触发', async () => {
      const h = await mount();
      const p1 = { id: 0, pageX: 100, pageY: 100 };
      grant(h, [p1], p1);
      release(h, [], p1);
      now = 1500; // 与首次相隔 500ms > 300
      const p2 = { id: 0, pageX: 130, pageY: 120 };
      grant(h, [p2], p2);
      release(h, [], p2);
      expect(h.followBall).not.toHaveBeenCalled();
    });
  });

  it('f) 摇杆指 UP → 向量归零 + hide；镜头指释放清空 → onCameraIdle（调度澄清）', async () => {
    const h = await mount();
    // 摇杆：按下拖动后抬起（摇杆不构成镜头活动，不触发空闲回调）
    const joy = { id: 0, pageX: 100, pageY: 400 };
    grant(h, [joy], joy);
    const moved = { ...joy, pageX: 144, prevPageX: 100, prevPageY: 400 };
    move(h, [moved], moved);
    release(h, [], moved);
    expect(lastCallArg(h.vector)).toEqual({ x: 0, y: 0 });
    expect(h.joystick.hide).toHaveBeenCalledTimes(1);
    expect(h.idle).not.toHaveBeenCalled();
    // 镜头：按下抬起（无其他指）→ 空闲回调
    const cam = { id: 0, pageX: 100, pageY: 100 };
    grant(h, [cam], cam);
    expect(h.idle).not.toHaveBeenCalled();
    release(h, [], cam);
    expect(h.idle).toHaveBeenCalledTimes(1);
  });

  it('f2) 多指场景：镜头指抬起但仍有其他镜头指时不触发 onCameraIdle', async () => {
    const h = await mount();
    const a = { id: 0, pageX: 100, pageY: 100 };
    const b = { id: 1, pageX: 200, pageY: 100 };
    grant(h, [a], a);
    start(h, [a, b], b);
    end(h, [a], b); // b 抬起，a 仍在
    expect(h.idle).not.toHaveBeenCalled();
    release(h, [], a); // 末指抬起 → 空闲
    expect(h.idle).toHaveBeenCalledTimes(1);
  });

  it('g) 区域未布局（尺寸 0）时忽略事件（不崩溃、不分配）', async () => {
    const h = await mount(false);
    const joy = { id: 0, pageX: 100, pageY: 400 };
    grant(h, [joy], joy);
    expect(h.joystick.show).not.toHaveBeenCalled();
    const cam = { id: 1, pageX: 100, pageY: 100 };
    start(h, [joy, cam], cam);
    move(h, [cam], cam);
    expect(h.pan).not.toHaveBeenCalled();
  });

  it('h) terminate（极端情形）整体复位：摇杆归零/hide、镜头清空并触发 onCameraIdle', async () => {
    const h = await mount();
    const joy = { id: 0, pageX: 100, pageY: 400 };
    const cam = { id: 1, pageX: 100, pageY: 100 };
    grant(h, [joy], joy);
    start(h, [joy, cam], cam);
    terminate(h, [joy, cam], cam);
    expect(lastCallArg(h.vector)).toEqual({ x: 0, y: 0 });
    expect(h.joystick.hide).toHaveBeenCalledTimes(1);
    expect(h.idle).toHaveBeenCalledTimes(1);
    // 复位后新触摸正常分配
    const again = { id: 2, pageX: 200, pageY: 420 };
    grant(h, [again], again);
    expect(h.joystick.show).toHaveBeenCalledTimes(2);
  });

  it('i) 静止的镜头指不重复触发 pan/manual：仅坐标变化时下发，纯摇杆移动事件不干扰镜头', async () => {
    const h = await mount();
    const joy = { id: 0, pageX: 100, pageY: 400 };
    const cam = { id: 1, pageX: 100, pageY: 100 };
    grant(h, [joy], joy);
    start(h, [joy, cam], cam);
    // 镜头指移动两次：每次平移 20dp → pan/manual 各 +1
    const cam1 = { ...cam, pageX: 120, pageY: 100, prevPageX: 100, prevPageY: 100 };
    move(h, [joy, cam1], cam1);
    const cam2 = { ...cam1, pageX: 140, pageY: 100, prevPageX: 120, prevPageY: 100 };
    move(h, [joy, cam2], cam2);
    expect(h.pan).toHaveBeenCalledTimes(2);
    expect(h.pan).toHaveBeenLastCalledWith(20, 0);
    expect(h.manual).toHaveBeenCalledTimes(2);
    // 镜头指静止于同一坐标，摇杆指继续移动 3 个事件 → 镜头动作次数与移动次数一致（不含静止指的额外事件）
    const joy1 = { ...joy, pageX: 120, pageY: 380, prevPageX: 100, prevPageY: 400 };
    move(h, [joy1, cam2], joy1);
    const joy2 = { ...joy1, pageX: 140, pageY: 360, prevPageX: 120, prevPageY: 380 };
    move(h, [joy2, cam2], joy2);
    const joy3 = { ...joy2, pageX: 160, pageY: 340, prevPageX: 140, prevPageY: 360 };
    move(h, [joy3, cam2], joy3);
    expect(h.pan).toHaveBeenCalledTimes(2);
    expect(h.manual).toHaveBeenCalledTimes(2);
    // 摇杆向量正常输出（位移超有效半径 → 钳制后为单位向量）
    const v = lastCallArg(h.vector) as { x: number; y: number };
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 9);
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeLessThan(0);
    expect(h.joystick.moveKnob).toHaveBeenCalled();
  });

  it('j) 手势开始触发 onGestureStart：任一触摸按下（首触与后续）各通知一次', async () => {
    const h = await mount();
    const joy = { id: 0, pageX: 100, pageY: 400 };
    const cam = { id: 1, pageX: 100, pageY: 100 };
    grant(h, [joy], joy);
    expect(h.gestureStart).toHaveBeenCalledTimes(1);
    start(h, [joy, cam], cam);
    expect(h.gestureStart).toHaveBeenCalledTimes(2);
  });
});
