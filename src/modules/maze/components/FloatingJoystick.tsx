import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import type { JoyVector } from '../types';

/** 有效拖动半径（dp）：旋钮位移钳制到此半径，输出向量按此归一化 */
const RADIUS = 44;
/** 超过该位移（dp）视为拖动而非轻触（不参与双击判定） */
const MOVE_SLOP = 6;
/** 双击判定窗口（ms） */
const DOUBLE_TAP_MS = 300;
/** 轻触按压时长上限（ms）：按住超时的松手不参与双击判定 */
const TAP_HOLD_MS = 300;
/** 松手淡出时长（ms） */
const FADE_MS = 150;
/** 底座半径（128dp 直径） */
const BASE_R = 64;
/** 旋钮直径（dp） */
const KNOB_D = 56;

interface Props {
  onMove: (v: JoyVector) => void;
  /** 热区内快速两次轻触（双击）时回调 */
  onDoubleTap?: () => void;
  /** 热区高度占比（相对父容器高度），默认 0.3 */
  heightRatio?: number;
}

/**
 * 浮动摇杆：底部全宽热区内按下即在指尖生成，拖动输出归一化向量，松手淡出。
 * 热区不放置其他可接收触摸的子元素（浮动视觉 pointerEvents="none"），
 * 因此 locationX/locationY 的触摸 target 恒为热区自身，坐标稳定。
 */
export default function FloatingJoystick({ onMove, onDoubleTap, heightRatio = 0.3 }: Props) {
  /** 热区局部坐标（即 locationX/Y），null 时不渲染浮动视觉 */
  const [stick, setStick] = useState<{ x: number; y: number } | null>(null);
  // 活跃触摸 identifier（按事件原值比较；RN 类型标为 string，运行时为 number）
  const activeRef = useRef<number | string | null>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);
  const downAtRef = useRef(0);
  const lastTapRef = useRef(0);
  const knobRef = useRef<View>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onDoubleTapRef = useRef(onDoubleTap);
  onDoubleTapRef.current = onDoubleTap;

  const opacity = useRef(new Animated.Value(1)).current;
  const fadeRef = useRef<Animated.CompositeAnimation | null>(null);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          if (activeRef.current !== null) return; // 只跟踪第一个触摸
          activeRef.current = evt.nativeEvent.identifier ?? 0;
          const { locationX, locationY } = evt.nativeEvent;
          originRef.current = { x: locationX, y: locationY };
          movedRef.current = false;
          downAtRef.current = Date.now();
          // 快速再次按下：停止可能未完成的淡出并恢复可见
          fadeRef.current?.stop();
          fadeRef.current = null;
          opacity.setValue(1);
          knobRef.current?.setNativeProps({
            style: { transform: [{ translateX: 0 }, { translateY: 0 }] },
          });
          setStick({ x: locationX, y: locationY });
        },
        onPanResponderMove: (evt) => {
          if (activeRef.current === null) return;
          const ne = evt.nativeEvent;
          const touch = ne.touches.find((t) => t.identifier === activeRef.current);
          if (!touch) {
            // 首指已抬起（identifier 不在 touches 中）：直接结束本次杆操作，
            // 绝不让次指以首指原点续杆
            end();
            return;
          }
          const dx = touch.locationX - originRef.current.x;
          const dy = touch.locationY - originRef.current.y;
          const mag = Math.hypot(dx, dy);
          if (mag > MOVE_SLOP) movedRef.current = true;
          // 钳制到有效半径得旋钮位移
          let kx = dx;
          let ky = dy;
          if (mag > RADIUS) {
            kx = (dx / mag) * RADIUS;
            ky = (dy / mag) * RADIUS;
          }
          knobRef.current?.setNativeProps({
            style: { transform: [{ translateX: kx }, { translateY: ky }] },
          });
          onMoveRef.current({ x: kx / RADIUS, y: ky / RADIUS });
        },
        onPanResponderRelease: release,
        onPanResponderTerminate: end,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // 卸载：停止可能挂起的淡出动画
  useEffect(() => () => opacity.stopAnimation(), [opacity]);

  /** 复位并淡出：正常松手与"首指抬起中断"共用（不含双击判定） */
  function end() {
    if (activeRef.current === null) return;
    activeRef.current = null;
    onMoveRef.current({ x: 0, y: 0 });
    // 松手：淡出后收起浮动视觉
    fadeRef.current?.stop();
    const anim = Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_MS,
      useNativeDriver: true,
    });
    fadeRef.current = anim;
    anim.start(({ finished }) => {
      // 仅当前动画自然完成时收起（若已被新触摸打断则忽略）
      if (finished && fadeRef.current === anim) {
        fadeRef.current = null;
        setStick(null);
      }
    });
  }

  /** 正常松手：先做双击判定，再复位淡出（terminate 与续杆中断只走 end） */
  function release() {
    if (activeRef.current === null) return;
    // 双击判定：轻触（未拖动、按压未超时）且距上次轻触 < DOUBLE_TAP_MS
    if (!movedRef.current && Date.now() - downAtRef.current < TAP_HOLD_MS) {
      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        onDoubleTapRef.current?.();
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
    end();
  }

  return (
    <View
      testID="joy-zone"
      style={[styles.zone, { height: `${heightRatio * 100}%` }]}
      {...responder.panHandlers}>
      {stick !== null && (
        <Animated.View
          testID="joy-base-float"
          pointerEvents="none"
          style={[styles.base, { left: stick.x - BASE_R, top: stick.y - BASE_R, opacity }]}>
          <View testID="joy-knob-float" ref={knobRef} style={styles.knob} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent', // 透明无视觉，但必须能接收触摸
    zIndex: 5,
  },
  base: {
    position: 'absolute',
    width: BASE_R * 2,
    height: BASE_R * 2,
    borderRadius: BASE_R,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 2,
    borderColor: '#e4dff2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  knob: {
    width: KNOB_D,
    height: KNOB_D,
    borderRadius: KNOB_D / 2,
    borderWidth: 2,
    borderColor: '#b9aee0',
    backgroundColor: '#cfc6ea',
    shadowColor: 'rgba(70,50,140,0.35)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
});
