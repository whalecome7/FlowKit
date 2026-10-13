import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { GestureResponderEvent } from 'react-native';
import FloatingJoystick from './FloatingJoystick';
import type { JoyVector } from '../types';

// ------------------------------------------------------------------
// PanResponder 的包装层会消费事件的 touchHistory：grant 用
// currentCentroidX/Y（单触点路径要求 touchBank[indexOfSingleActiveTouch]
// 的 touchActive 且 currentTimeStamp > 0），move 用 mostRecentTimeStamp
// 做去重守卫、并用 touchBank 的 current/previous 位置更新 gestureState。
// 因此裸 `{nativeEvent:{locationX,locationY}}` 会抛错，需按
// ResponderTouchHistoryStore 的 touchTrack 结构手工构造单指触摸事件
// （构造法沿用原 Joystick 测试；touches 条目额外携带 locationX/Y 供组件读取）。
// ------------------------------------------------------------------
const PAGE_OFFSET = 400;

/** 构造 PanResponder 可消费的单指 responder 事件（previous 为上一次采样位置） */
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

const pointAt = (locationX: number, locationY: number) => ({
  pageX: PAGE_OFFSET + locationX,
  pageY: PAGE_OFFSET + locationY,
});

// RN jest preset 将 View mock 为"复合组件 + 宿主组件"两层，props 均含 testID；
// 仅统计宿主节点（type 为字符串）以保证数量断言精确
function hostNodes(tree: ReactTestRenderer.ReactTestRenderer, testID: string) {
  return tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === testID);
}

/** 热区宿主节点（responder 事件 props 挂在宿主上） */
function findZone(tree: ReactTestRenderer.ReactTestRenderer) {
  return tree.root.find((n) => typeof n.type === 'string' && n.props.testID === 'joy-zone');
}

/** 松手淡出由 mock 原生动画（16ms 回调）完成，推进真实计时器让视觉收起 */
async function flushFade() {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>((r) => setTimeout(r, 30));
  });
}

describe('FloatingJoystick', () => {
  it('渲染热区；初始无浮动底座，按下出现、松手淡出收起', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<FloatingJoystick onMove={() => {}} />);
    });
    expect(hostNodes(tree, 'joy-zone').length).toBe(1);
    expect(hostNodes(tree, 'joy-base-float').length).toBe(0);

    await ReactTestRenderer.act(() => {
      findZone(tree).props.onResponderGrant(makeResponderEvent(30, 20, 1));
    });
    expect(hostNodes(tree, 'joy-base-float').length).toBe(1);
    expect(hostNodes(tree, 'joy-knob-float').length).toBe(1);

    await ReactTestRenderer.act(() => {
      findZone(tree).props.onResponderRelease(makeResponderEvent(30, 20, 2));
    });
    await flushFade();
    expect(hostNodes(tree, 'joy-base-float').length).toBe(0);
  });

  it('grant 不输出非零向量；拖动输出钳制后归一化向量，松手归零', async () => {
    const moves: JoyVector[] = [];
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<FloatingJoystick onMove={(v) => moves.push(v)} />);
    });
    const zone = findZone(tree);

    await ReactTestRenderer.act(() => {
      zone.props.onResponderGrant(makeResponderEvent(30, 20, 1));
    });
    // 按下不产生移动输出（若产生也应为 (0,0)）
    expect(moves.every((m) => m.x === 0 && m.y === 0)).toBe(true);

    await ReactTestRenderer.act(() => {
      // dx=+44（恰为有效半径 44dp）→ (1,0)
      zone.props.onResponderMove(makeResponderEvent(74, 20, 2, pointAt(30, 20)));
      // dx=+88 超界 → 仍钳制到 (1,0)
      zone.props.onResponderMove(makeResponderEvent(118, 20, 3, pointAt(74, 20)));
      // 松手归零
      zone.props.onResponderRelease(makeResponderEvent(118, 20, 4, pointAt(118, 20)));
    });

    expect(moves).toHaveLength(3);
    expect(moves[0]).toEqual({ x: 1, y: 0 });
    expect(moves[1]).toEqual({ x: 1, y: 0 });
    expect(moves[2]).toEqual({ x: 0, y: 0 });
    await flushFade();
  });

  it('热区内快速两次轻触触发 onDoubleTap', async () => {
    const onDoubleTap = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <FloatingJoystick onMove={() => {}} onDoubleTap={onDoubleTap} />,
      );
    });
    const zone = findZone(tree);

    await ReactTestRenderer.act(() => {
      // 第一次轻触
      zone.props.onResponderGrant(makeResponderEvent(40, 30, 1));
      zone.props.onResponderRelease(makeResponderEvent(40, 30, 2));
      // 第二次轻触（同一事件循环内，间隔明显 <300ms）
      zone.props.onResponderGrant(makeResponderEvent(60, 40, 3));
      zone.props.onResponderRelease(makeResponderEvent(60, 40, 4));
    });

    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    await flushFade();
  });
});
