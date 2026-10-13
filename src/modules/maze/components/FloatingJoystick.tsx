import React, { useEffect, useMemo, useRef } from 'react';
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
/** 按下吸附到指尖的位移时长（ms） */
const GRAB_MS = 60;
/** 按下变清晰时长（ms） */
const GRAB_FADE_MS = 80;
/** 松手回常驻位 / 透明度恢复时长（ms） */
const RETURN_MS = 180;
/** 待机透明度 */
const IDLE_OPACITY = 0.55;
/** 底座半径（128dp 直径） */
const BASE_R = 64;
/** 旋钮直径（dp） */
const KNOB_D = 56;

interface Props {
  onMove: (v: JoyVector) => void;
  /** 热区内快速两次轻触（双击）时回调 */
  onDoubleTap?: () => void;
}

/**
 * 常驻浮动摇杆：底座+旋钮始终渲染——待机时半透明停在热区中央，
 * 按下即吸附到指尖并变清晰，拖动输出归一化向量，松手回常驻位。
 * 热区不放置其他可接收触摸的子元素（视觉层 pointerEvents="none"），
 * 因此 locationX/locationY 的触摸 target 恒为热区自身，坐标稳定。
 * 高度由父级容器的摇杆带决定（根容器 flex:1 填充）。
 */
export default function FloatingJoystick({ onMove, onDoubleTap }: Props) {
  // 活跃触摸 identifier（按事件原值比较；RN 类型标为 string，运行时为 number）
  const activeRef = useRef<number | string | null>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);
  const downAtRef = useRef(0);
  const lastTapRef = useRef(0);
  const knobRef = useRef<View>(null);
  /** 热区尺寸（onLayout 记录）：常驻位中心 = (w/2, h/2) */
  const zoneSizeRef = useRef({ w: 0, h: 0 });
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onDoubleTapRef = useRef(onDoubleTap);
  onDoubleTapRef.current = onDoubleTap;

  /** 常驻视觉相对常驻位（根容器中心）的平移（native driver） */
  const offset = useRef(new Animated.ValueXY()).current;
  /** 常驻视觉透明度：待机 IDLE_OPACITY，按下 1 */
  const opacity = useRef(new Animated.Value(IDLE_OPACITY)).current;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // 手势进行中拒绝父级（如 viewport 拖动）的接管请求：绝不因被 terminate 而丢杆
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          if (activeRef.current !== null) return; // 只跟踪第一个触摸
          activeRef.current = evt.nativeEvent.identifier ?? 0;
          const { locationX, locationY } = evt.nativeEvent;
          originRef.current = { x: locationX, y: locationY };
          movedRef.current = false;
          downAtRef.current = Date.now();
          // 旋钮归中，等待本轮拖动位移
          knobRef.current?.setNativeProps({
            style: { transform: [{ translateX: 0 }, { translateY: 0 }] },
          });
          // 底座从常驻位吸附到指尖（相对容器中心的偏移）
          Animated.timing(offset, {
            toValue: {
              x: locationX - zoneSizeRef.current.w / 2,
              y: locationY - zoneSizeRef.current.h / 2,
            },
            duration: GRAB_MS,
            useNativeDriver: true,
          }).start();
          Animated.timing(opacity, {
            toValue: 1,
            duration: GRAB_FADE_MS,
            useNativeDriver: true,
          }).start();
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

  // 卸载：停止可能挂起的常驻视觉动画
  useEffect(
    () => () => {
      offset.stopAnimation();
      opacity.stopAnimation();
    },
    [offset, opacity],
  );

  /** 复位：归零输出、旋钮回中、底座回常驻位、透明度回待机（松手与 terminate 共用） */
  function end() {
    if (activeRef.current === null) return;
    activeRef.current = null;
    onMoveRef.current({ x: 0, y: 0 });
    knobRef.current?.setNativeProps({
      style: { transform: [{ translateX: 0 }, { translateY: 0 }] },
    });
    Animated.timing(offset, {
      toValue: { x: 0, y: 0 },
      duration: RETURN_MS,
      useNativeDriver: true,
    }).start();
    Animated.timing(opacity, {
      toValue: IDLE_OPACITY,
      duration: RETURN_MS,
      useNativeDriver: true,
    }).start();
  }

  /** 正常松手：先做双击判定，再复位回常驻位（terminate 与续杆中断只走 end） */
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
      style={styles.root}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        zoneSizeRef.current = { w: width, h: height };
      }}
      {...responder.panHandlers}>
      {/* 常驻视觉：不随触摸挂载/卸载 */}
      <Animated.View
        testID="joy-base-float"
        pointerEvents="none"
        style={[styles.base, { transform: offset.getTranslateTransform(), opacity }]}>
        <View testID="joy-knob-float" ref={knobRef} style={styles.knob} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }, // 填充父容器（屏幕的摇杆带），透明无视觉但必须能接收触摸
  base: {
    position: 'absolute',
    // 常驻位 = 根容器中心（margin 回退半个底座，保证居中）
    left: '50%',
    top: '50%',
    marginLeft: -BASE_R,
    marginTop: -BASE_R,
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
