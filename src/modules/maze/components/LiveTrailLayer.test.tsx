import React, { createRef } from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Path } from 'react-native-svg';
import type { View } from 'react-native';
import LiveTrailLayer from './LiveTrailLayer';
import type { LiveTrailHandle } from './LiveTrailLayer';
import { generateMaze } from '../services/generator';
import { LIVE_SLOTS } from '../services/liveTrail';
import { PALETTES } from '../constants';
import type { TrailStyle } from '../types';

const maze = generateMaze(1234567, 'easy'); // G=27

// RN jest 环境的 View 为 class 组件：按实例安装自有 setNativeProps mock，
// 精确捕获每个段槽的直写参数（同 JoystickView.test 手法）。
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

function hostSegs(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.findAll(
    (n) =>
      typeof n.type === 'string' &&
      typeof n.props.testID === 'string' &&
      n.props.testID.startsWith('trail-seg-'),
  );
}

function renderLayer(trailStyle: TrailStyle = 'mono') {
  const ref = createRef<LiveTrailHandle>();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  const el = (px: number, style: TrailStyle) => (
    <LiveTrailLayer ref={ref} maze={maze} cellPx={px} trailStyle={style} palette={PALETTES[0]} />
  );
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(el(12, trailStyle));
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

describe('LiveTrailLayer（球真实路径采样层）', () => {
  it('渲染满槽位段池（LIVE_SLOTS 个）且初始无静态块 Path', async () => {
    const { tree } = renderLayer();
    expect(hostSegs(tree)).toHaveLength(LIVE_SLOTS);
    expect(tree.root.findAllByType(Path)).toHaveLength(0);
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('挂载即以迷宫起点初始化：首个采样段从起点出发（不拉出世界原点长线）', async () => {
    const { tree, ref } = renderLayer('mono');
    const seg0 = installNativeMock(tree, 'trail-seg-0');
    const sx = 2 * maze.start[0] + 1.5;
    const sy = 2 * maze.start[1] + 1.5;

    ReactTestRenderer.act(() => {
      ref.current!.tick(sx + 1, sy); // 球自起点移动 1 世界单位（未先调 reset）
    });

    const st = lastStyle(seg0);
    expect(st.width as number).toBeCloseTo(12, 6); // 段长 1 世界单位 × cellPx
    expect(st.left as number).toBeCloseTo((sx + 0.5) * 12 - 6, 6);
    expect(st.top as number).toBeCloseTo(sy * 12 - 0.24 * 12 / 2, 6);

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('tick 追加采样点：完整段直写槽（世界→容器像素、颜色/旋转正确）', async () => {
    const { tree, ref } = renderLayer('mono');
    const seg0 = installNativeMock(tree, 'trail-seg-0');
    const seg1 = installNativeMock(tree, 'trail-seg-1');

    ReactTestRenderer.act(() => {
      ref.current!.reset(1.5, 1.5);
      ref.current!.tick(2.5, 1.5); // 位移 1.0 ≥ LIVE_STEP → 追加采样点
    });

    const st = lastStyle(seg0);
    expect(st.opacity).toBe(1);
    expect(st.left as number).toBeCloseTo(18, 6); // 中点 2.0*12 - len/2
    expect(st.top as number).toBeCloseTo(16.56, 6); // 1.5*12 - w/2
    expect(st.width as number).toBeCloseTo(12, 6);
    expect(st.height as number).toBeCloseTo(2.88, 6);
    expect(st.borderRadius as number).toBeCloseTo(1.44, 6);
    expect(st.backgroundColor).toBe(PALETTES[0].wallDark);
    expect(st.transform).toEqual([{ rotate: '0deg' }]);
    // 末段槽已被清空（等待后续帧从采样点向球伸长）
    expect(lastStyle(seg1).opacity).toBe(0);

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('未达采样阈值：末段从最后采样点直写伸长（端点恒贴球）', async () => {
    const { tree, ref } = renderLayer('mono');
    const seg1 = installNativeMock(tree, 'trail-seg-1');

    ReactTestRenderer.act(() => {
      ref.current!.reset(1.5, 1.5);
      ref.current!.tick(2.5, 1.5); // 采样点 n=1
      ref.current!.tick(2.56, 1.5); // 位移 0.06 < 0.08 → 末段伸长
    });

    const st = lastStyle(seg1);
    expect(st.opacity).toBe(1);
    expect(st.width as number).toBeCloseTo(0.72, 6); // 0.06 * 12
    expect(st.left as number).toBeCloseTo((2.5 + 2.56) / 2 * 12 - 0.36, 6);

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('冻结：未冻结段数达 FREEZE_AT 时批量转静态块（Svg Path），reset 全清', async () => {
    const { tree, ref } = renderLayer('mono');

    ReactTestRenderer.act(() => {
      ref.current!.reset(0, 0);
      for (let i = 1; i <= 96; i++) {
        ref.current!.tick(i * 0.1, 0); // 每次位移 0.1 ≥ 0.08 → 逐点采样
      }
    });
    // n=96 触发冻结 [0,48)：48 段 / 16 = 3 组 → 3 Path
    expect(tree.root.findAllByType(Path)).toHaveLength(3);

    ReactTestRenderer.act(() => {
      for (let i = 97; i <= 144; i++) {
        ref.current!.tick(i * 0.1, 0); // n=144 触发第二冻 [48,96)
      }
    });
    expect(tree.root.findAllByType(Path)).toHaveLength(6);

    ReactTestRenderer.act(() => {
      ref.current!.reset(5, 5);
    });
    expect(tree.root.findAllByType(Path)).toHaveLength(0);

    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('cellPx 变化：段槽按新像素尺寸全量重写；静态块经 viewBox 与像素解耦', async () => {
    const { tree, ref, rerender } = renderLayer('mono');
    const seg0 = installNativeMock(tree, 'trail-seg-0');

    ReactTestRenderer.act(() => {
      ref.current!.reset(1.5, 1.5);
      ref.current!.tick(2.5, 1.5);
    });
    expect(lastStyle(seg0).width as number).toBeCloseTo(12, 6);

    rerender(24, 'mono');
    expect(lastStyle(seg0).width as number).toBeCloseTo(24, 6);
    expect(lastStyle(seg0).height as number).toBeCloseTo(5.76, 6);

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

    rerender(12, 'fade');
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
