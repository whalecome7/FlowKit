import React, { createRef } from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { View } from 'react-native';
import JoystickView from './JoystickView';
import type { JoystickViewHandle } from './JoystickView';

// RN jest 环境的 View 为 class 组件：实例上的 setNativeProps 是原型级共享 jest.fn，
// createNodeMock 不生效（React 19）。按实例安装自有属性 mock（遮蔽原型共享实现），
// 即可精确捕获每个节点（底座/旋钮）的直写参数。
function installNativeMock(
  tree: ReactTestRenderer.ReactTestRenderer,
  testID: string,
): jest.Mock {
  const inst = tree.root
    .findAll((n) => n.props.testID === testID && n.instance !== null)
    .at(0)!.instance as View & { setNativeProps: jest.Mock };
  const mock = jest.fn();
  inst.setNativeProps = mock;
  return mock;
}

function hostNode(tree: ReactTestRenderer.ReactTestRenderer, testID: string) {
  return tree.root.find((n) => typeof n.type === 'string' && n.props.testID === testID);
}

function renderJoystick() {
  const ref = createRef<JoystickViewHandle>();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<JoystickView ref={ref} />);
  });
  const zone = hostNode(tree, 'joy-zone');
  const baseMock = installNativeMock(tree, 'joy-base');
  const knobMock = installNativeMock(tree, 'joy-knob');
  return {
    tree,
    ref,
    baseMock,
    knobMock,
    zone,
    /** 手动触发根容器布局（测试环境不发生真实 layout） */
    layout: (w: number, h: number) =>
      ReactTestRenderer.act(() => {
        zone.props.onLayout({ nativeEvent: { layout: { width: w, height: h } } });
      }),
  };
}

/** 取 mock 最近一次 setNativeProps 直写的 style */
function lastStyle(mock: jest.Mock): Record<string, unknown> {
  const { calls } = mock.mock;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0].style;
}

describe('JoystickView（纯视觉 imperative 组件）', () => {
  it('常驻渲染：底座/旋钮初始即存在，根容器不挂任何手势 props', () => {
    const { tree, zone } = renderJoystick();
    expect(hostNode(tree, 'joy-base')).toBeTruthy();
    expect(hostNode(tree, 'joy-knob')).toBeTruthy();
    // 纯视觉：根容器无 responder 相关 props（触摸由 useGameGestures 统一分配）
    expect(zone.props.onStartShouldSetResponder).toBeUndefined();
    expect(zone.props.onResponderGrant).toBeUndefined();
    expect(zone.props.onResponderMove).toBeUndefined();
  });

  it('onLayout 后底座立即直写常驻位（根容器中心）与待机透明度', () => {
    const { baseMock, layout } = renderJoystick();
    layout(300, 200);
    expect(lastStyle(baseMock)).toMatchObject({
      left: 300 / 2 - 64, // 86
      top: 200 / 2 - 64, // 36
      marginLeft: 0,
      marginTop: 0,
      opacity: 0.55,
    });
  });

  it('show 立即定位到本地坐标（同步 setNativeProps，零动画）；moveKnob 直写 transform', () => {
    const { ref, baseMock, knobMock, layout } = renderJoystick();
    layout(300, 200);

    ReactTestRenderer.act(() => {
      ref.current?.show(100, 50);
    });
    expect(lastStyle(baseMock)).toMatchObject({
      left: 100 - 64, // 36
      top: 50 - 64, // -14
      opacity: 1,
    });

    ReactTestRenderer.act(() => {
      ref.current?.moveKnob(10, -10);
    });
    expect(lastStyle(knobMock).transform).toEqual([
      { translateX: 10 },
      { translateY: -10 },
    ]);
  });

  it('hide 立即回常驻位：底座归中 + 透明度 0.55 + 旋钮归中', () => {
    const { ref, baseMock, knobMock, layout } = renderJoystick();
    layout(300, 200);

    ReactTestRenderer.act(() => {
      ref.current?.show(100, 50);
      ref.current?.moveKnob(30, 20);
    });
    ReactTestRenderer.act(() => {
      ref.current?.hide();
    });
    expect(lastStyle(baseMock)).toMatchObject({
      left: 86,
      top: 36,
      opacity: 0.55,
    });
    expect(lastStyle(knobMock).transform).toEqual([
      { translateX: 0 },
      { translateY: 0 },
    ]);
  });

  it('拖动中 onLayout 重触发（尺寸变化）不打扰进行中的底座定位；hide 后用新尺寸回位', () => {
    const { ref, baseMock, layout } = renderJoystick();
    layout(300, 200);
    ReactTestRenderer.act(() => {
      ref.current?.show(100, 50);
    });
    const callsBefore = baseMock.mock.calls.length;
    layout(400, 300); // shown 中：只记尺寸，不直写
    expect(baseMock.mock.calls.length).toBe(callsBefore);
    ReactTestRenderer.act(() => {
      ref.current?.hide();
    });
    expect(lastStyle(baseMock)).toMatchObject({
      left: 400 / 2 - 64, // 136
      top: 300 / 2 - 64, // 86
      opacity: 0.55,
    });
  });
});
