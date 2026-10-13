import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text, TouchableWithoutFeedback } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { ThemeProvider } from '../../../theme';
import ButtonDrawer from './ButtonDrawer';
import { PALETTES } from '../constants';

const LABELS = ['🎲 新迷宫', '↻ 重开', '🌈 轨迹·彩虹', '📜 历史', '🎯 跟球', '💡 提示'];

function makeActions() {
  return [
    { key: 'new', label: LABELS[0], highlight: true, onPress: jest.fn() },
    { key: 'restart', label: LABELS[1], onPress: jest.fn() },
    { key: 'trail', label: LABELS[2], onPress: jest.fn() },
    { key: 'history', label: LABELS[3], onPress: jest.fn() },
    { key: 'follow', label: LABELS[4], onPress: jest.fn() },
    { key: 'hint', label: LABELS[5], onPress: jest.fn() },
  ];
}

// PanResponder 包装层消费 touchHistory，事件须按 touchTrack 结构手工构造
// （详见 FloatingJoystick.test.tsx 同一构造法）
const PAGE_OFFSET = 400;

const makeResponderEvent = (
  locationX: number,
  locationY: number,
  timestamp: number,
  previous?: { pageX: number; pageY: number },
): GestureResponderEvent => {
  const pageX = PAGE_OFFSET + locationX;
  const pageY = PAGE_OFFSET + locationY;
  const previousPageX = previous ? previous.pageX : pageX;
  const previousPageY = previous ? previous.pageY : pageY;
  return {
    nativeEvent: {
      locationX,
      locationY,
      pageX,
      pageY,
      identifier: 0,
      target: 1,
      timestamp,
      touches: [{ identifier: 0, locationX, locationY, pageX, pageY, timestamp }],
      changedTouches: [{ identifier: 0, locationX, locationY, pageX, pageY, timestamp }],
    },
    touchHistory: {
      touchBank: [
        {
          touchActive: true,
          startPageX: previousPageX,
          startPageY: previousPageY,
          startTimeStamp: timestamp,
          currentPageX: pageX,
          currentPageY: pageY,
          currentTimeStamp: timestamp,
          previousPageX,
          previousPageY,
          previousTimeStamp: timestamp,
        },
      ],
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: timestamp,
    },
  } as unknown as GestureResponderEvent;
};

function hostNodes(tree: ReactTestRenderer.ReactTestRenderer, testID: string) {
  return tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === testID);
}

/** 把手宿主节点（responder 事件 props 挂在宿主上） */
function findHandle(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.find((n) => typeof n.type === 'string' && n.props.testID === 'drawer-handle');
}

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root
    .findAllByType(Text)
    .map((n) => n.props.children)
    .filter((c): c is string => typeof c === 'string');
}

async function renderDrawer(actions: ReturnType<typeof makeActions>) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeProvider>
        <ButtonDrawer actions={actions} palette={PALETTES[0]} />
      </ThemeProvider>,
    );
  });
  return tree;
}

/** 模拟把手点击打开（grant + release，无移动） */
async function tapHandle(tree: ReactTestRenderer.ReactTestRenderer) {
  await ReactTestRenderer.act(() => {
    const handle = findHandle(tree);
    handle.props.onResponderGrant(makeResponderEvent(48, 12, 1));
    handle.props.onResponderRelease(makeResponderEvent(48, 12, 2));
  });
}

/** 推进真实计时器让打开/关闭动画（mock 原生动画 16ms 回调）完成 */
async function settle() {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>((r) => setTimeout(r, 60));
  });
}

describe('ButtonDrawer', () => {
  it('初始渲染把手，无抽屉面板', async () => {
    const tree = await renderDrawer(makeActions());
    expect(hostNodes(tree, 'drawer-handle').length).toBe(1);
    expect(hostNodes(tree, 'drawer-panel').length).toBe(0);
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('容器覆盖全屏且 pointerEvents=box-none（不挡底层，仅把手/遮罩/面板吃触摸）', async () => {
    const tree = await renderDrawer(makeActions());
    const root = hostNodes(tree, 'drawer-root')[0];
    expect(root).toBeTruthy();
    expect(root.props.pointerEvents).toBe('box-none');
    expect(root.props.style).toEqual(
      expect.objectContaining({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }),
    );
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('把手点击打开抽屉，六个按钮文案齐全', async () => {
    const tree = await renderDrawer(makeActions());
    await tapHandle(tree);
    expect(hostNodes(tree, 'drawer-panel').length).toBe(1);
    expect(texts(tree)).toEqual(expect.arrayContaining(LABELS));
    await settle();
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('把手上滑（move 位移超阈值）也能打开抽屉', async () => {
    const tree = await renderDrawer(makeActions());
    await ReactTestRenderer.act(() => {
      const handle = findHandle(tree);
      handle.props.onResponderGrant(makeResponderEvent(48, 12, 1));
      // 上滑 12dp → 超过 -8dp 阈值
      handle.props.onResponderMove(makeResponderEvent(48, 0, 2, {
        pageX: PAGE_OFFSET + 48,
        pageY: PAGE_OFFSET + 12,
      }));
      handle.props.onResponderRelease(makeResponderEvent(48, 0, 3, {
        pageX: PAGE_OFFSET + 48,
        pageY: PAGE_OFFSET + 0,
      }));
    });
    expect(hostNodes(tree, 'drawer-panel').length).toBe(1);
    await settle();
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('点击「新迷宫」先关抽屉再执行回调，动画完成后面板卸载', async () => {
    const actions = makeActions();
    const tree = await renderDrawer(actions);
    await tapHandle(tree);

    const btn = tree.root.findAll((n) => n.props.testID === 'drawer-action-new').at(0)!;
    await ReactTestRenderer.act(() => {
      btn.props.onPress();
    });
    expect(actions[0].onPress).toHaveBeenCalledTimes(1);
    // 关闭动画完成后卸载面板
    await settle();
    expect(hostNodes(tree, 'drawer-panel').length).toBe(0);
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('点击遮罩关闭抽屉', async () => {
    const tree = await renderDrawer(makeActions());
    await tapHandle(tree);
    expect(hostNodes(tree, 'drawer-panel').length).toBe(1);

    const mask = tree.root.findByType(TouchableWithoutFeedback);
    await ReactTestRenderer.act(() => {
      mask.props.onPress();
    });
    await settle();
    expect(hostNodes(tree, 'drawer-panel').length).toBe(0);
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('面板下拉超过阈值（>40dp）触发关闭，动画完成后面板卸载', async () => {
    const tree = await renderDrawer(makeActions());
    await tapHandle(tree);
    expect(hostNodes(tree, 'drawer-panel').length).toBe(1);

    const panel = hostNodes(tree, 'drawer-panel')[0];
    // 模拟面板 responder 流程：move-should-set 协商 → grant → 下拉 55dp
    const grantEvt = makeResponderEvent(200, 60, 1);
    const moveEvt = makeResponderEvent(200, 115, 2, {
      pageX: PAGE_OFFSET + 200,
      pageY: PAGE_OFFSET + 60,
    });
    await ReactTestRenderer.act(() => {
      panel.props.onMoveShouldSetResponder(grantEvt);
      panel.props.onResponderGrant(grantEvt);
      panel.props.onResponderMove(moveEvt);
    });

    // 关闭动画完成后卸载面板
    await settle();
    expect(hostNodes(tree, 'drawer-panel').length).toBe(0);
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });
});
