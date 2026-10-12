import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { GestureResponderEvent } from 'react-native';
import Joystick from './Joystick';
import type { JoyVector } from '../types';

describe('Joystick', () => {
  it('渲染底座与旋钮', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<Joystick onMove={() => {}} />);
    });
    // RN jest preset 将 View mock 为"复合组件 + 宿主组件"两层，props 均含 testID；
    // 仅统计宿主节点（type 为字符串）以保证数量断言精确
    const hostNodes = (testID: string) =>
      tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === testID);
    expect(hostNodes('joy-base').length).toBe(1);
    expect(hostNodes('joy-knob').length).toBe(1);
  });

  // ------------------------------------------------------------------
  // PanResponder 的包装层会消费事件的 touchHistory：grant 用
  // currentCentroidX/Y（单触点路径要求 touchBank[indexOfSingleActiveTouch]
  // 的 touchActive 且 currentTimeStamp > 0），move 用 mostRecentTimeStamp
  // 做去重守卫、并用 touchBank 的 current/previous 位置更新 gestureState。
  // 因此裸 `{nativeEvent:{locationX,locationY}}` 会抛错，需按
  // ResponderTouchHistoryStore 的 touchTrack 结构手工构造单指触摸事件。
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
        touches: [{ identifier: 0, pageX, pageY, timestamp }],
        changedTouches: [{ identifier: 0, pageX, pageY, timestamp }],
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

  it('拖拽输出钳制后的归一化向量，松手归零', async () => {
    const moves: JoyVector[] = [];
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<Joystick onMove={(v) => moves.push(v)} />);
    });
    const base = tree.root.find(
      (n) => typeof n.type === 'string' && n.props.testID === 'joy-base',
    );

    // 默认 size=128 → 圆心 (64,64)、半径 radius=64-26=38
    await ReactTestRenderer.act(() => {
      // 按下在超界 100px 处（圆心 + (100,0)）
      base.props.onResponderGrant(makeResponderEvent(164, 64, 1));
      base.props.onResponderMove(makeResponderEvent(83, 64, 2, pointAt(164, 64)));
      base.props.onResponderMove(makeResponderEvent(64, 64, 3, pointAt(83, 64)));
      base.props.onResponderRelease(makeResponderEvent(64, 64, 4, pointAt(64, 64)));
    });

    expect(moves).toHaveLength(4);
    expect(moves[0]).toEqual({ x: 1, y: 0 }); // 严重超界 → 沿半径方向钳制到边缘
    expect(moves[1]).toEqual({ x: 0.5, y: 0 }); // 界内 19px → 19/38
    expect(moves[2]).toEqual({ x: 0, y: 0 }); // 回到圆心
    expect(moves[3]).toEqual({ x: 0, y: 0 }); // 松手归零
  });
});
