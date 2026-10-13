import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { ThemeProvider } from '../../../theme';
import MazeGameScreen from './MazeGameScreen';
import FloatingJoystick from '../components/FloatingJoystick';
import { generateMaze } from '../services/generator';
import { useMazeStore } from '../store';
import type { CellPoint, HistoryRecord } from '../types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

// 屏幕依赖 useNavigation/useRoute（T17 历史查看模式）；本测试不包裹 NavigationContainer，按最小面 mock。
// mockParams 可变：模拟「从历史页二次进入」时 route.params 由无到有（tree.update 前先赋值再触发渲染）。
// navigation 保持稳定引用（与真实 react-navigation 一致），否则 effect 依赖 navigation 会随渲染反复触发。
let mockParams: { viewRecord?: HistoryRecord } | undefined;
const mockNavigate = jest.fn();
const mockSetParams = jest.fn((p: { viewRecord?: HistoryRecord | undefined }) => {
  mockParams = mockParams ? { ...mockParams, ...p } : mockParams;
});
const mockNavigation = { navigate: mockNavigate, setParams: mockSetParams };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockParams }),
}));

// ---- 手动 rAF 控制（「真引擎链路」用例专用）：队列 + 真实 cancel 语义 ----
// 陷阱：cancelAnimationFrame 必须真正移除队列回调。屏幕 onLayout 后 tick effect 重建，
// 若旧 tick（viewport 闭包为 0）残留，它会每帧先执行并更新共享 lastTsRef，
// 导致新 tick 的 dt 恒为 0、球永远不动。
type RafCb = (ts: number) => void;
let rafCallbacks = new Map<number, RafCb>();
let rafIdSeq = 0;
let frameClock = 0;
let origRaf: typeof globalThis.requestAnimationFrame;
let origCancelRaf: typeof globalThis.cancelAnimationFrame;

function installManualRaf() {
  origRaf = globalThis.requestAnimationFrame;
  origCancelRaf = globalThis.cancelAnimationFrame;
  rafCallbacks = new Map();
  rafIdSeq = 0;
  frameClock = 0;
  globalThis.requestAnimationFrame = (cb: RafCb) => {
    rafIdSeq += 1;
    rafCallbacks.set(rafIdSeq, cb);
    return rafIdSeq;
  };
  globalThis.cancelAnimationFrame = (id: number | null | undefined) => {
    if (typeof id === 'number') rafCallbacks.delete(id);
  };
}

function restoreManualRaf() {
  globalThis.requestAnimationFrame = origRaf;
  globalThis.cancelAnimationFrame = origCancelRaf;
  rafCallbacks = new Map();
}

/** 手动推进 n 帧（16ms/帧）：每帧先取走本帧回调再执行，回调内新注册的进入下一帧 */
async function stepFrames(n: number) {
  for (let i = 0; i < n; i++) {
    frameClock += 16;
    const due = Array.from(rafCallbacks.values());
    rafCallbacks.clear();
    const ts = frameClock;
    await ReactTestRenderer.act(() => {
      for (const cb of due) cb(ts);
    });
  }
}

/** 与既有用例相同的 props 特征定位 React.memo(TrailLayerInner)（Minimap 有 trail 无 ghost） */
function findTrailLayer(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root
    .findAll((n) => n.props.trail !== undefined && n.props.ghost !== undefined)
    .at(0)!;
}

describe('MazeGameScreen', () => {
  beforeEach(() => {
    useMazeStore.setState(useMazeStore.getInitialState(), true);
    mockParams = undefined;
    mockNavigate.mockClear();
    mockSetParams.mockClear();
  });

  it('渲染难度 chips 不崩溃', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <ThemeProvider>
          <MazeGameScreen />
        </ThemeProvider>,
      );
    });
    expect(tree).toBeTruthy();
    // HUD 难度 chips 全部渲染
    const texts = tree.root
      .findAllByType(Text)
      .map((n) => n.props.children)
      .filter((c): c is string => typeof c === 'string');
    expect(texts).toEqual(expect.arrayContaining(['轻松', '普通', '困难', '地狱']));
    // 卸载以清理屏幕内 100ms 计时器，避免 teardown 后 setInterval 回调触发报错
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('二次进入相同 seed 的记录会重置并显示查看横幅（真引擎链路）', async () => {
    installManualRaf();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    try {
      // 首次渲染（route.params 为 undefined）：普通对局
      await ReactTestRenderer.act(() => {
        tree = ReactTestRenderer.create(
          <ThemeProvider>
            <MazeGameScreen />
          </ThemeProvider>,
        );
      });

      // 手动触发视口布局（测试环境不发生真实 layout）：viewport.width > 0 后 TrailLayer 才会渲染
      const viewportNode = tree.root
        .findAll((n) => typeof n.props.onLayout === 'function' && n.props.style?.overflow === 'hidden')
        .at(0)!;
      await ReactTestRenderer.act(() => {
        viewportNode.props.onLayout({ nativeEvent: { layout: { width: 300, height: 500 } } });
      });

      // 通过屏幕渲染的 FloatingJoystick 实例写摇杆（其 onMove 即屏幕写 joyRef 的回调）。
      // 默认 store（seed 1000000 / easy，起点 [2,10]）向右是通道：推 {x:1,y:0}
      const joystick = tree.root.findByType(FloatingJoystick);
      joystick.props.onMove({ x: 1, y: 0 });
      // 推进 30 帧让引擎真实跑 moveBall/onEnterCell，球移动出起步格产生轨迹
      await stepFrames(30);

      // 引擎已真实驱出多格轨迹与步数
      const playedTrail = findTrailLayer(tree).props.trail as CellPoint[];
      expect(playedTrail.length).toBeGreaterThan(1);
      expect(useMazeStore.getState().steps).toBeGreaterThan(0);
      // 松手停杆（模拟用户放手后去历史页）
      joystick.props.onMove({ x: 0, y: 0 });

      // 二次进入相同 seed/difficulty 的记录（maze 引用不变）：缺 resetToken bump 时引擎与轨迹都不会重置
      const { difficulty, seed } = useMazeStore.getState();
      mockParams = {
        viewRecord: { difficulty, seed, timeMs: 45000, steps: 9, at: 1, trail: '' },
      };
      await ReactTestRenderer.act(() => {
        tree.update(
          <ThemeProvider>
            <MazeGameScreen />
          </ThemeProvider>,
        );
      });

      // 播种 effect 生效：store 归零
      const state = useMazeStore.getState();
      expect(state.phase).toBe('ready');
      expect(state.steps).toBe(0);
      // 核心断言（对 C1 敏感）：轨迹复位为仅含起点——缺 resetToken bump 时保留推杆产生的游玩轨迹
      const { start } = generateMaze(seed, difficulty);
      const trailLayerNode = findTrailLayer(tree);
      expect(trailLayerNode.props.trail).toEqual([[start[0], start[1]]]);
      // trail '' 解码为空数组 → 无幽灵 Path
      expect(trailLayerNode.props.ghost).toEqual([]);
      // 横幅可见（文本含「历史迷宫」）
      const texts = tree.root
        .findAllByType(Text)
        .map((n) => n.props.children)
        .filter((c): c is string => typeof c === 'string');
      expect(texts.some((s) => s.includes('历史迷宫'))).toBe(true);
      // 参数已消费，避免关闭横幅后 route.params 残留
      expect(mockSetParams).toHaveBeenCalledWith({ viewRecord: undefined });
    } finally {
      await ReactTestRenderer.act(() => {
        tree.unmount();
      });
      restoreManualRaf();
    }
  });
});
