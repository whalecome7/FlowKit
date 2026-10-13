import React, { createRef } from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Path } from 'react-native-svg';
import type { View } from 'react-native';
import LiveTrailLayer from './LiveTrailLayer';
import type { LiveTrailHandle } from './LiveTrailLayer';
import { generateMaze } from '../services/generator';
import { LIVE_SLOTS } from '../services/liveTrail';
import { PALETTES, TRAIL_WIDTH } from '../constants';
import type { TrailStyle } from '../types';

const maze = generateMaze(1234567, 'easy'); // G=27
const CELL_PX = 12;
const DOT = TRAIL_WIDTH * CELL_PX; // 圆点直径（像素）
const START_X = 2 * maze.start[0] + 1.5;
const START_Y = 2 * maze.start[1] + 1.5;

// RN jest 环境的 View 为 class 组件：按实例安装自有 setNativeProps mock，
// 精确捕获每个点槽的直写参数（同 JoystickView.test 手法）。
function installNativeMock(tree: ReactTestRenderer.ReactTestRenderer, testID: string): jest.Mock {
  const inst = tree.root
    .findAll((n) => n.props.testID === testID && n.instance !== null)
    .at(0)!.instance as View & { setNativeProps: jest.Mock };
  const mock = jest.fn();
  inst.setNativeProps = mock;
  return mock;
}

function lastStyle(mock: jest.Mock): Record<string, unknown> {
  const { calls } = mock.mock;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0].style;
}

function hostDots(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.findAll(
    (n) =>
      typeof n.type === 'string' &&
      typeof n.props.testID === 'string' &&
      n.props.testID.startsWith('trail-dot-'),
  );
}

/** 圆点几何断言：以点 (wx, wy) 为圆心、DOT 为直径 */
function expectDotAt(style: Record<string, unknown>, wx: number, wy: number, cellPx: number) {
  const d = TRAIL_WIDTH * cellPx;
  expect(style.left as number).toBeCloseTo(wx * cellPx - d / 2, 6);
  expect(style.top as number).toBeCloseTo(wy * cellPx - d / 2, 6);
  expect(style.width as number).toBeCloseTo(d, 6);
  expect(style.height as number).toBeCloseTo(d, 6);
  expect(style.borderRadius as number).toBeCloseTo(d / 2, 6);
}

function renderLayer(trailStyle: TrailStyle = 'mono') {
  const ref = createRef<LiveTrailHandle>();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  const el = (px: number, style: TrailStyle) => (
    <LiveTrailLayer ref={ref} maze={maze} cellPx={px} trailStyle={style} palette={PALETTES[0]} />
  );
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(el(CELL_PX, trailStyle));
  });
  return {
    tree,
    ref,
    rerender: (px: number, style: TrailStyle) =>
      ReactTestRenderer.act(() => {
        tree.update(el(px, style));
      }),
  };
}

describe('LiveTrailLayer（球真实路径圆点链）', () => {
  it('渲染满槽位点池（LIVE_SLOTS 个）且初始无静态块 Path', async () => {
    const { tree } = renderLayer();
    expect(hostDots(tree)).toHaveLength(LIVE_SLOTS);
    expect(tree.root.findAllByType(Path)).toHaveLength(0);
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('挂载即以迷宫起点初始化：首个圆点自起点出发（不拉出世界原点长线）', async () => {
    const { tree, ref } = renderLayer('mono');
    const dot1 = installNativeMock(tree, 'trail-dot-1');

    ReactTestRenderer.act(() => {
      ref.current!.tick(START_X + 0.2, START_Y); // 补 2 点（+0.08 / +0.16）
    });

    const st = lastStyle(dot1);
    expect(st.opacity).toBe(1);
    expectDotAt(st, START_X + 0.08, START_Y, CELL_PX);
    expect(st.backgroundColor).toBe(PALETTES[0].wallDark);

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('快移帧插值补点：单帧大位移拆为多圆点（点距恒定、逐槽直写）', async () => {
    const { tree, ref } = renderLayer('mono');
    const dot5 = installNativeMock(tree, 'trail-dot-5');

    ReactTestRenderer.act(() => {
      ref.current!.tick(START_X + 0.44, START_Y); // 极限帧位移 → 5 点（+0.40），剩 0.04
    });

    expectDotAt(lastStyle(dot5), START_X + 0.4, START_Y, CELL_PX);

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('慢移不足一步：不补点、无直写（球体自身覆盖至视觉端点）', async () => {
    const { tree, ref } = renderLayer('mono');
    const dot0 = installNativeMock(tree, 'trail-dot-0');

    ReactTestRenderer.act(() => {
      ref.current!.reset(START_X, START_Y);
    });
    const callsAfterReset = dot0.mock.calls.length;
    ReactTestRenderer.act(() => {
      ref.current!.tick(START_X + 0.03, START_Y); // < LIVE_STEP
    });
    expect(dot0.mock.calls.length).toBe(callsAfterReset);

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('冻结：未冻结点数达 FREEZE_AT 批量转静态块（Svg Path）并清接管槽；reset 全清', async () => {
    const { tree, ref } = renderLayer('mono');
    const dot0 = installNativeMock(tree, 'trail-dot-0');

    ReactTestRenderer.act(() => {
      ref.current!.reset(0, 0);
      for (let i = 1; i <= 77; i++) {
        ref.current!.tick(i * 0.1, 0); // 每次位移 0.1 → 每帧补 1-2 点
      }
    });
    // 点数 floor(7.7/0.08)=96 → 触发冻结 [0,48)：48 段 / 16 = 3 组 → 3 Path
    expect(tree.root.findAllByType(Path)).toHaveLength(3);
    // 点 0（槽 0）已被静态块接管并清空
    expect(lastStyle(dot0).opacity).toBe(0);

    ReactTestRenderer.act(() => {
      for (let i = 78; i <= 144; i++) {
        ref.current!.tick(i * 0.1, 0); // 点数 180 → 触发第二冻 [48,96)
      }
    });
    expect(tree.root.findAllByType(Path)).toHaveLength(6);

    ReactTestRenderer.act(() => {
      ref.current!.reset(5, 5);
    });
    expect(tree.root.findAllByType(Path)).toHaveLength(0);
    // reset 后起点圆点即时直写（槽 0）
    expect(lastStyle(dot0).opacity).toBe(1);

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('cellPx 变化：点槽按新像素尺寸全量重写；静态块经 viewBox 与像素解耦', async () => {
    const { tree, ref, rerender } = renderLayer('mono');
    const dot0 = installNativeMock(tree, 'trail-dot-0');

    ReactTestRenderer.act(() => {
      ref.current!.reset(START_X, START_Y);
      ref.current!.tick(START_X + 0.2, START_Y);
    });
    expectDotAt(lastStyle(dot0), START_X, START_Y, CELL_PX);

    rerender(24, 'mono');
    expectDotAt(lastStyle(dot0), START_X, START_Y, 24);

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('restyle：切换渐隐后静态块按最新头部长重建（出现低于全亮的透明度档）', async () => {
    const { tree, ref, rerender } = renderLayer('mono');

    ReactTestRenderer.act(() => {
      ref.current!.reset(0, 0);
      for (let i = 1; i <= 96; i++) {
        ref.current!.tick(i * 0.1, 0);
      }
    });
    expect(tree.root.findAllByType(Path)).toHaveLength(3);

    rerender(CELL_PX, 'fade');
    ReactTestRenderer.act(() => {
      ref.current!.restyle();
    });
    const blocks = tree.root.findAllByType(Path);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.some((p) => (p.props.strokeOpacity as number) < 1)).toBe(true);

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });
});
