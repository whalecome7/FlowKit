import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useTheme } from '../../../theme';
import type { Palette } from '../constants';

/** 面板估算高度（dp）：关闭时 translateY 到该值滑出屏幕（含底部安全留白） */
const PANEL_H = 200;

interface DrawerAction {
  key: string;
  label: string;
  /** 高亮按钮（主色底白字） */
  highlight?: boolean;
  onPress: () => void;
}

interface Props {
  actions: DrawerAction[];
  palette: Palette;
}

/**
 * 按钮抽屉：底部中央把手点击/上滑打开；点遮罩或面板下拉关闭。
 * 渲染在屏幕根层：容器 absoluteFill 覆盖全屏且 pointerEvents="box-none"（透传底层触摸），
 * 把手浮于底部（zIndex 40），遮罩/面板（45）打开时覆盖全屏（HUD 与迷宫均不可操作）。
 */
export default function ButtonDrawer({ actions, palette }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  // 供持久化的手势闭包读取最新开关态（memo 内闭包不随渲染更新）
  const openRef = useRef(false);
  openRef.current = open;

  const maskAnim = useRef(new Animated.Value(0)).current;
  const panelAnim = useRef(new Animated.Value(PANEL_H)).current;
  const closeAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const startYRef = useRef(0);
  const openedByGestureRef = useRef(false);

  const openDrawer = () => {
    if (openRef.current) return;
    setOpen(true);
  };

  const closeDrawer = () => {
    if (!openRef.current) return;
    closeAnimRef.current?.stop();
    const anim = Animated.parallel([
      Animated.timing(maskAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(panelAnim, { toValue: PANEL_H, duration: 220, useNativeDriver: true }),
    ]);
    closeAnimRef.current = anim;
    anim.start(({ finished }) => {
      // 关闭动画完成后卸载；被打断则保持
      if (finished) setOpen(false);
    });
  };

  // 打开：遮罩淡入 + 面板从底部滑入
  useEffect(() => {
    if (!open) return;
    Animated.parallel([
      Animated.timing(maskAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(panelAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [open, maskAnim, panelAnim]);

  // 卸载：停止可能挂起的开/关动画
  useEffect(
    () => () => {
      maskAnim.stopAnimation();
      panelAnim.stopAnimation();
    },
    [maskAnim, panelAnim],
  );

  // 把手：点击或上滑打开（memo 持久化，闭包经 openRef 取最新态）
  const handleResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          startYRef.current = evt.nativeEvent.pageY;
          openedByGestureRef.current = false;
        },
        onPanResponderMove: (evt) => {
          if (evt.nativeEvent.pageY - startYRef.current < -8) {
            openedByGestureRef.current = true;
            openDrawer();
          }
        },
        onPanResponderRelease: () => {
          // 未上滑打开过则按点击语义打开
          if (!openedByGestureRef.current) openDrawer();
        },
      }),
    [],
  );

  // 面板顶部下拉关闭：claim 阈值 8dp，拖出 40dp 即关
  const panelResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
        onPanResponderMove: (_, g) => {
          if (g.dy > 40) closeDrawer();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <View testID="drawer-root" pointerEvents="box-none" style={styles.container}>
      <View testID="drawer-handle" style={styles.handle} {...handleResponder.panHandlers}>
        <Text style={styles.handleText}>≡</Text>
      </View>
      {open && (
        <>
          <TouchableWithoutFeedback onPress={closeDrawer}>
            <Animated.View style={[styles.mask, { opacity: maskAnim }]} />
          </TouchableWithoutFeedback>
          <Animated.View
            testID="drawer-panel"
            style={[
              styles.panel,
              { backgroundColor: colors.surface, transform: [{ translateY: panelAnim }] },
            ]}
            {...panelResponder.panHandlers}>
            <View style={styles.grid}>
              {actions.map((a) => (
                <TouchableOpacity
                  key={a.key}
                  testID={`drawer-action-${a.key}`}
                  style={[
                    styles.actionBtn,
                    { backgroundColor: a.highlight ? palette.wall : colors.surfaceAlt },
                  ]}
                  onPress={() => {
                    closeDrawer();
                    a.onPress();
                  }}>
                  <Text style={[styles.actionText, { color: a.highlight ? '#fff' : colors.text }]}>
                    {a.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 全屏容器（absoluteFillObject 等价写法）：box-none 只让把手/遮罩/面板吃触摸
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  handle: {
    position: 'absolute',
    bottom: 24, // 避开系统手势条（用户微调下移）
    alignSelf: 'center',
    width: 96,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: '#e4dff2',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  handleText: { fontSize: 14, color: '#8a86a0' },
  mask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
    zIndex: 45,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    paddingBottom: 40, // 系统手势条安全留白：按钮行与系统条分离
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 45,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  actionBtn: {
    flexBasis: '30%',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 14, fontWeight: '600' },
});
