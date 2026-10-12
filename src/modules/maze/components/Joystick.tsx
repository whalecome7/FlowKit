import React, { useCallback, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import type { JoyVector } from '../types';

interface Props {
  onMove: (v: JoyVector) => void;
  /** 底座直径（建议保持默认 128；旋钮与半径按此尺寸设计） */
  size?: number;
}

/** 自研摇杆：拖动旋钮输出归一化向量 [-1,1]（直写实现，不触发 React 渲染） */
export default function Joystick({ onMove, size = 128 }: Props) {
  const knobRef = useRef<View>(null);
  const baseRef = useRef<View>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const radius = size / 2 - 26;

  const measure = useCallback(() => {
    baseRef.current?.measureInWindow((x, y) => {
      originRef.current = { x, y };
    });
  }, []);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => handle(evt),
        onPanResponderMove: (evt) => handle(evt),
        onPanResponderRelease: reset,
        onPanResponderTerminate: reset,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function handle(evt: GestureResponderEvent) {
    const px = evt.nativeEvent.pageX;
    const py = evt.nativeEvent.pageY;
    let dx = px - originRef.current.x - size / 2;
    let dy = py - originRef.current.y - size / 2;
    const mag = Math.hypot(dx, dy);
    if (mag > radius) {
      dx = (dx / mag) * radius;
      dy = (dy / mag) * radius;
    }
    knobRef.current?.setNativeProps({
      style: { transform: [{ translateX: dx }, { translateY: dy }] },
    });
    onMoveRef.current({ x: dx / radius, y: dy / radius });
  }

  function reset() {
    knobRef.current?.setNativeProps({ style: { transform: [{ translateX: 0 }, { translateY: 0 }] } });
    onMoveRef.current({ x: 0, y: 0 });
  }

  return (
    <View
      testID="joy-base"
      ref={baseRef}
      onLayout={measure}
      style={[styles.base, { width: size, height: size, borderRadius: size / 2 }]}
      {...responder.panHandlers}>
      <View testID="joy-knob" ref={knobRef} style={styles.knob} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 2,
    borderColor: '#e4dff2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  knob: {
    width: 58,
    height: 58,
    borderRadius: 29,
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
