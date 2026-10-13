import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { TRAIL_WIDTH, type Palette } from '../constants';
import {
  FREEZE_AT,
  FREEZE_BATCH,
  LIVE_SLOTS,
  advanceTo,
  blockAlive,
  buildBlock,
  createLivePath,
  segStyleAt,
  type LivePathState,
  type LiveStyleSpec,
  type SegStyle,
  type TrailBlock,
} from '../services/liveTrail';
import type { MazeData, TrailStyle } from '../types';

export interface LiveTrailHandle {
  /** 换局/重开：重置为单起点，清空静态块与全部点槽 */
  reset(x: number, y: number): void;
  /** 引擎 onTick 驱动（球世界坐标）；快移帧自动插值补点 */
  tick(x: number, y: number): void;
  /** 轨迹样式/配色切换：重建静态块并重写显示中的点 */
  restyle(): void;
}

interface Props {
  maze: MazeData;
  cellPx: number;
  trailStyle: TrailStyle;
  palette: Palette;
}

/**
 * 实时轨迹层：球真实路径的连续折线（替代旧的"格中心折线 + 直线尾巴"近似）。
 * - 冻结部分：Svg（viewBox 世界坐标）——随容器变换自动跟随镜头，与像素尺寸解耦；
 * - 活跃部分：固定槽位 View **圆点池**（环形复用）——只直写 left/top/尺寸/颜色/透明度，
 *   刻意不做逐段旋转：Fabric 下 setNativeProps 直写 transform(rotate) 不生效（真机验证），
 *   圆点以固定密度重叠成平滑线条（点距 LIVE_STEP ≪ 点直径），几何上无需旋转；
 * - 世界坐标 → 容器局部像素直写（×cellPx），镜头平移/缩放零重画。
 */
function LiveTrailLayerInner(
  { maze, cellPx, trailStyle, palette }: Props,
  ref: React.Ref<LiveTrailHandle>,
) {
  const [blocks, setBlocks] = useState<TrailBlock[]>([]);
  // 可变数据全走 ref：imperative handle 每次 render 重建，但直写逻辑只依赖 ref 读取最新值
  const stateRef = useRef<LivePathState>(createLivePath(0, 0));
  const frozenRef = useRef(0);
  const blocksRef = useRef<TrailBlock[]>([]);
  const dotRefs = useRef<(View | null)[]>(Array(LIVE_SLOTS).fill(null));
  /** 各槽最近写入的透明度：fade 跨档检查用（避免每帧盲写全窗口） */
  const lastOpacityRef = useRef<number[]>(Array(LIVE_SLOTS).fill(-1));
  const specRef = useRef<LiveStyleSpec>({ trailStyle, monoColor: palette.wallDark });
  specRef.current = { trailStyle, monoColor: palette.wallDark };
  const cellPxRef = useRef(cellPx);
  cellPxRef.current = cellPx;

  const dotRefSetters = useMemo(
    () =>
      Array.from({ length: LIVE_SLOTS }, (_, i) => (el: View | null) => {
        dotRefs.current[i] = el;
      }),
    [],
  );

  /** 直写一个圆点（槽 = 点号 % LIVE_SLOTS）：世界坐标 → 容器局部像素；无 transform */
  const writeDot = (slot: number, x: number, y: number, st: SegStyle) => {
    const v = dotRefs.current[slot];
    if (!v) return;
    lastOpacityRef.current[slot] = st.opacity;
    if (st.opacity <= 0) {
      v.setNativeProps({ style: { opacity: 0 } });
      return;
    }
    const k = cellPxRef.current;
    const d = TRAIL_WIDTH * k;
    v.setNativeProps({
      style: {
        opacity: st.opacity,
        left: x * k - d / 2,
        top: y * k - d / 2,
        width: d,
        height: d,
        borderRadius: d / 2,
        backgroundColor: st.color,
      },
    });
  };

  /** 冻结：点 [frozen, frozen + FREEZE_BATCH) 构建为静态块（折线含边界尾点）并前移冻结前沿 */
  const freeze = () => {
    const s = stateRef.current;
    const from = frozenRef.current;
    const to = from + FREEZE_BATCH;
    const spec = specRef.current;
    const headLen = s.lens[s.xs.length - 1];
    blocksRef.current = [...blocksRef.current, buildBlock(s, from, to, spec, headLen)];
    frozenRef.current = to;
    if (spec.trailStyle === 'fade') {
      // 存活块用最新 headLen 重建（刷新透明度档），死亡块剔除
      blocksRef.current = blocksRef.current
        .filter((b) => blockAlive(b, headLen, spec))
        .map((b) => buildBlock(s, b.from, b.to, spec, headLen));
    }
    setBlocks(blocksRef.current);
    // 清掉刚冻结的点槽（显示由静态块接管）：消除残影与静态块在色桶/位置上的任何微差
    for (let k = from; k < to; k++) {
      writeDot(k % LIVE_SLOTS, 0, 0, { color: spec.monoColor, opacity: 0 });
    }
  };

  /** 重写显示中的点：未冻结区间 [frozen, n]（cellPx 变化/restyle 用） */
  const redrawDots = () => {
    const s = stateRef.current;
    const spec = specRef.current;
    const n = s.xs.length - 1;
    const headLen = s.lens[n];
    for (let k = frozenRef.current; k <= n; k++) {
      writeDot(k % LIVE_SLOTS, s.xs[k], s.ys[k], segStyleAt(spec, s.lens[k], headLen));
    }
  };

  /** 重置为单起点：清空静态块与全部点槽（handle.reset 与挂载初始化共用） */
  const resetTo = (x: number, y: number) => {
    stateRef.current = createLivePath(x, y);
    frozenRef.current = 0;
    blocksRef.current = [];
    setBlocks([]);
    for (let i = 0; i < LIVE_SLOTS; i++) {
      writeDot(i, 0, 0, { color: specRef.current.monoColor, opacity: 0 });
    }
    // 起点圆点即时可见：轨迹自起点出发（点 0 永不参与补点循环）
    writeDot(0, x, y, segStyleAt(specRef.current, 0, 0));
  };

  useImperativeHandle(ref, () => ({
    reset(x, y) {
      resetTo(x, y);
    },
    tick(x, y) {
      const s = stateRef.current;
      const spec = specRef.current;
      const before = s.xs.length;
      const added = advanceTo(s, x, y);
      if (added > 0) {
        const n = s.xs.length - 1;
        const headLen = s.lens[n];
        for (let k = before; k <= n; k++) {
          writeDot(k % LIVE_SLOTS, s.xs[k], s.ys[k], segStyleAt(spec, s.lens[k], headLen));
        }
        // while：补点较多时一次追平冻结前沿（每 tick 最多补 ~6 点）
        while (n - frozenRef.current >= FREEZE_AT) freeze();
      }
      if (spec.trailStyle === 'fade') {
        // 头部推进使窗口内旧点跨档：只重写透明度实际变化的点（通常每帧 0-2 个）
        const n = s.xs.length - 1;
        const headLen = s.lens[n];
        for (let k = n; k >= frozenRef.current; k--) {
          const st = segStyleAt(spec, s.lens[k], headLen);
          if (Math.abs(st.opacity - lastOpacityRef.current[k % LIVE_SLOTS]) > 1e-9) {
            writeDot(k % LIVE_SLOTS, s.xs[k], s.ys[k], st);
          }
        }
      }
    },
    restyle() {
      const s = stateRef.current;
      const spec = specRef.current;
      const headLen = s.lens[s.xs.length - 1];
      // 全量重建冻结块：fade 下历史被裁、切回其它样式时需从采样点复活完整历史
      const next: TrailBlock[] = [];
      for (let from = 0; from < frozenRef.current; from += FREEZE_BATCH) {
        const to = Math.min(from + FREEZE_BATCH, frozenRef.current);
        const block = buildBlock(s, from, to, spec, headLen);
        if (blockAlive(block, headLen, spec)) next.push(block);
      }
      blocksRef.current = next;
      setBlocks(next);
      redrawDots();
    },
  }));

  // 挂载/换迷宫：以起点初始化采样。
  // 本组件挂在 world 容器内（viewport 布局落定才渲染），挂载晚于屏幕初始化 effect——
  // 若只依赖外部 imperative reset，会以初始 (0,0) 存活导致首帧拉出跨图长线。
  useEffect(() => {
    resetTo(2 * maze.start[0] + 1.5, 2 * maze.start[1] + 1.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maze]);

  // cellPx 变化（布局/缩放澄清落地）：点槽为像素直写需全量重写；静态块经 viewBox 与像素解耦
  useEffect(() => {
    redrawDots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellPx]);

  const size = maze.G * cellPx;
  return (
    <View pointerEvents="none" style={[styles.root, { width: size, height: size }]}>
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${maze.G} ${maze.G}`}
        style={styles.svg}>
        {blocks.map((b, bi) =>
          b.paths.map((p, pi) => (
            <Path
              key={`${bi}-${pi}`}
              d={p.d}
              stroke={p.color}
              strokeOpacity={p.opacity}
              strokeWidth={TRAIL_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )),
        )}
      </Svg>
      {dotRefSetters.map((setter, i) => (
        <View key={i} ref={setter} testID={`trail-dot-${i}`} style={styles.dot} />
      ))}
    </View>
  );
}

const LiveTrailLayer = React.memo(forwardRef(LiveTrailLayerInner));
LiveTrailLayer.displayName = 'LiveTrailLayer';

export default LiveTrailLayer;

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, top: 0 },
  svg: { position: 'absolute', left: 0, top: 0 },
  // 点池：位置/尺寸/颜色全部由 setNativeProps 直写（style 引用恒定，重渲染不覆盖直写值）
  dot: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, opacity: 0 },
});
