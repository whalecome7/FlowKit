import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { ThemeProvider } from '../../../theme';
import MazeGameScreen from './MazeGameScreen';
import { useMazeStore } from '../store';
import type { HistoryRecord } from '../types';

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

  it('二次进入相同 seed 的记录会重置并显示查看横幅', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
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
      viewportNode.props.onLayout({ nativeEvent: { layout: { width: 320, height: 480 } } });
    });

    // 模拟「先玩了一会」：playing + 3 步
    await ReactTestRenderer.act(() => {
      useMazeStore.getState().startGame(Date.now());
      useMazeStore.getState().addStep();
      useMazeStore.getState().addStep();
      useMazeStore.getState().addStep();
    });
    expect(useMazeStore.getState().steps).toBe(3);

    // 记录与当前 store 的 seed/difficulty 相同（maze 引用不变）：此前缺 resetToken bump 不会重置引擎
    mockParams = {
      viewRecord: {
        difficulty: useMazeStore.getState().difficulty,
        seed: useMazeStore.getState().seed,
        timeMs: 45000,
        steps: 9,
        at: 1,
        trail: '',
      },
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
    // 横幅可见（文本含「历史迷宫」）
    const texts = tree.root
      .findAllByType(Text)
      .map((n) => n.props.children)
      .filter((c): c is string => typeof c === 'string');
    expect(texts.some((s) => s.includes('历史迷宫'))).toBe(true);
    // trail '' 解码为空数组 → 无幽灵 Path（TrailLayer 为 React.memo 包裹，按唯一 props 特征定位）
    const trailLayerNode = tree.root
      .findAll((n) => n.props.trail !== undefined && n.props.ghost !== undefined)
      .at(0)!;
    expect(trailLayerNode.props.ghost).toEqual([]);
    // 参数已消费，避免关闭横幅后 route.params 残留
    expect(mockSetParams).toHaveBeenCalledWith({ viewRecord: undefined });

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });
});
