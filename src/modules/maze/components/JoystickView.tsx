import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

/** 待机透明度 */
const IDLE_OPACITY = 0.55;
/** 底座半径（128dp 直径） */
const BASE_R = 64;
/** 旋钮直径（dp） */
const KNOB_D = 56;

/**
 * 摇杆纯视觉句柄（全部为同步 setNativeProps 直写，零动画）：
 * - show(x, y)：底座立即出现在组件本地坐标 (x, y)，变清晰
 * - moveKnob(dx, dy)：旋钮位移直写（dx/dy 已由调用方钳制）
 * - hide()：底座立即回常驻位（根容器中心）并恢复半透明，旋钮归中
 * 本地坐标换算（区域坐标 → 带内坐标）由屏幕/手势层完成。
 */
export interface JoystickViewHandle {
  /** x/y 为组件本地坐标（带内）：x 不变、y 减摇杆带上边界 */
  show(x: number, y: number): void;
  moveKnob(dx: number, dy: number): void;
  hide(): void;
}

/**
 * 摇杆视图：纯视觉，无任何触摸/手势逻辑（触摸由 useGameGestures 统一分配）。
 * 常驻模型：底座 + 旋钮始终渲染——待机半透明停在摇杆带中央，
 * 按下即由外部经 show() 立即定位到指尖，拖动经 moveKnob() 直写，松手经 hide() 回位。
 */
const JoystickView = forwardRef<JoystickViewHandle, {}>((_props, ref) => {
  const baseRef = useRef<View>(null);
  const knobRef = useRef<View>(null);
  /** 自身尺寸（onLayout 记录）：常驻位中心 = (w/2, h/2) */
  const sizeRef = useRef({ w: 0, h: 0 });
  /** 底座当前是否被 show() 唤出（onLayout 重触发时不打扰进行中的拖动） */
  const shownRef = useRef(false);

  /** 直写常驻位 + 待机透明度（margin 一并归 0：初始居中占位依赖负 margin） */
  function writeRest() {
    const { w, h } = sizeRef.current;
    baseRef.current?.setNativeProps({
      style: {
        left: w / 2 - BASE_R,
        top: h / 2 - BASE_R,
        marginLeft: 0,
        marginTop: 0,
        opacity: IDLE_OPACITY,
      },
    });
  }

  useImperativeHandle(ref, () => ({
    show(x, y) {
      shownRef.current = true;
      baseRef.current?.setNativeProps({
        style: {
          left: x - BASE_R,
          top: y - BASE_R,
          marginLeft: 0,
          marginTop: 0,
          opacity: 1,
        },
      });
    },
    moveKnob(dx, dy) {
      knobRef.current?.setNativeProps({
        style: { transform: [{ translateX: dx }, { translateY: dy }] },
      });
    },
    hide() {
      shownRef.current = false;
      writeRest();
      knobRef.current?.setNativeProps({
        style: { transform: [{ translateX: 0 }, { translateY: 0 }] },
      });
    },
  }));

  return (
    <View
      testID="joy-zone"
      style={styles.root}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        sizeRef.current = { w: width, h: height };
        // 布局落定/尺寸变化：未拖动时立即把底座摆回常驻位
        if (!shownRef.current) writeRest();
      }}>
      <View testID="joy-base" ref={baseRef} pointerEvents="none" style={styles.base}>
        <View testID="joy-knob" ref={knobRef} style={styles.knob} />
      </View>
    </View>
  );
});

JoystickView.displayName = 'JoystickView';

export default JoystickView;

const styles = StyleSheet.create({
  root: { flex: 1 }, // 填充父容器（屏幕的摇杆带），纯视觉层
  base: {
    position: 'absolute',
    // 初始居中占位（onLayout 后经 setNativeProps 直写常驻位并把 margin 归 0）
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
    opacity: IDLE_OPACITY,
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
