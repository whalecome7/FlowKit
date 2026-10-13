import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { TRAIL_WIDTH, type Palette } from '../constants';
import {
  FREEZE_AT,
  FREEZE_BATCH,
  LIVE_SLOTS,
  blockAlive,
  buildBlock,
  createLivePath,
  pushPoint,
  segStyleAt,
  type LivePathState,
  type LiveStyleSpec,
  type SegStyle,
  type TrailBlock,
} from '../services/liveTrail';
import type { MazeData, TrailStyle } from '../types';

export interface LiveTrailHandle {
  /** 换局/重开：重置为单起点，清空静态块与全部段槽 */
  reset(x: number, y: number): void;
  /** 引擎 onTick 驱动（球世界坐标）；端点恒为球 */
  tick(x: number, y: number): void;
  /** 轨迹样式/配色切换：重建静态块并重写显示中的段 */
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
 * - 活跃部分：固定槽位 View 段池，环形复用，tick 只直写新增/末段槽（每帧 ≤2 次 setNativeProps）；
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
  const ballRef = useRef({ x: 0, y: 0 });
  const segRefs = useRef<(View | null)[]>(Array(LIVE_SLOTS).fill(null));
  /** 各槽最近写入的透明度：fade 跨档检查用（避免每帧盲写全窗口） */
  const lastOpacityRef = useRef<number[]>(Array(LIVE_SLOTS).fill(-1));
  const specRef = useRef<LiveStyleSpec>({ trailStyle, monoColor: palette.wallDark });
  specRef.current = { trailStyle, monoColor: palette.wallDark };
  const cellPxRef = useRef(cellPx);
  cellPxRef.current = cellPx;

  const segRefSetters = useMemo(
    () =>
      Array.from({ length: LIVE_SLOTS }, (_, i) => (el: View | null) => {
        segRefs.current[i] = el;
      }),
    [],
  );

  /** 直写一段（槽 = 段号 % LIVE_SLOTS）：世界坐标 → 容器局部像素 */
  const writeSeg = (
    slot: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    st: SegStyle,
  ) => {
    const v = segRefs.current[slot];
    if (!v) return;
    lastOpacityRef.current[slot] = st.opacity;
    if (st.opacity <= 0) {
      v.setNativeProps({ style: { opacity: 0 } });
      return;
    }
    const k = cellPxRef.current;
    const w = TRAIL_WIDTH * k;
    const px0 = x0 * k;
    const py0 = y0 * k;
    const px1 = x1 * k;
    const py1 = y1 * k;
    const len = Math.hypot(px1 - px0, py1 - py0);
    if (len < 0.5) {
      v.setNativeProps({ style: { opacity: 0 } });
      return;
    }
    const angle = (Math.atan2(py1 - py0, px1 - px0) * 180) / Math.PI;
    v.setNativeProps({
      style: {
        opacity: st.opacity,
        left: (px0 + px1) / 2 - len / 2,
        top: (py0 + py1) / 2 - w / 2,
        width: len,
        height: w,
        borderRadius: w / 2,
        backgroundColor: st.color,
        transform: [{ rotate: `${angle}deg` }],
      },
    });
  };

  /** 冻结：段 [frozen, frozen + FREEZE_BATCH) 构建为静态块并前移冻结前沿 */
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
  };

  /** 重写显示窗口内的段：完整段 [frozen, n-1] + 末段（最后采样点 → 球当前） */
  const redrawWindow = () => {
    const s = stateRef.current;
    const spec = specRef.current;
    const n = s.xs.length - 1;
    if (n < 1) return;
    const headLen = s.lens[n];
    for (let k = frozenRef.current; k <= n - 1; k++) {
      writeSeg(
        k % LIVE_SLOTS,
        s.xs[k],
        s.ys[k],
        s.xs[k + 1],
        s.ys[k + 1],
        segStyleAt(spec, s.lens[k + 1], headLen),
      );
    }
    writeSeg(
      n % LIVE_SLOTS,
      s.xs[n],
      s.ys[n],
      ballRef.current.x,
      ballRef.current.y,
      segStyleAt(spec, s.lens[n], headLen),
    );
  };

  /** 重置为单起点：清空静态块与全部段槽（handle.reset 与挂载初始化共用） */
  const resetTo = (x: number, y: number) => {
    stateRef.current = createLivePath(x, y);
    frozenRef.current = 0;
    blocksRef.current = [];
    ballRef.current = { x, y };
    setBlocks([]);
    for (let i = 0; i < LIVE_SLOTS; i++) {
      writeSeg(i, 0, 0, 0, 0, { color: specRef.current.monoColor, opacity: 0 });
    }
  };

  useImperativeHandle(ref, () => ({
    reset(x, y) {
      resetTo(x, y);
    },
    tick(x, y) {
      ballRef.current = { x, y };
      const s = stateRef.current;
      const spec = specRef.current;
      const pushed = pushPoint(s, x, y);
      const n = s.xs.length - 1;
      if (pushed) {
        // 新完整段写入其槽；下一槽（未来的末段槽）先行清空，防上一圈残影
        writeSeg(
          (n - 1) % LIVE_SLOTS,
          s.xs[n - 1],
          s.ys[n - 1],
          s.xs[n],
          s.ys[n],
          segStyleAt(spec, s.lens[n], s.lens[n]),
        );
        writeSeg(n % LIVE_SLOTS, s.xs[n], s.ys[n], x, y, { color: spec.monoColor, opacity: 0 });
        if (n - frozenRef.current >= FREEZE_AT) freeze();
      } else {
        // 末段：最后采样点 → 球（每帧伸长，端点恒贴球）
        writeSeg(n % LIVE_SLOTS, s.xs[n], s.ys[n], x, y, segStyleAt(spec, s.lens[n], s.lens[n]));
      }
      if (spec.trailStyle === 'fade') {
        // 头部推进使窗口内旧段跨档：只重写透明度实际变化的段（通常每帧 0-2 段）
        const headLen = s.lens[n];
        for (let k = n - 1; k >= frozenRef.current; k--) {
          const st = segStyleAt(spec, s.lens[k + 1], headLen);
          if (Math.abs(st.opacity - lastOpacityRef.current[k % LIVE_SLOTS]) > 1e-9) {
            writeSeg(k % LIVE_SLOTS, s.xs[k], s.ys[k], s.xs[k + 1], s.ys[k + 1], st);
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
      redrawWindow();
    },
  }));

  // 挂载/换迷宫：以起点初始化采样。
  // 本组件挂在 world 容器内（viewport 布局落定才渲染），挂载晚于屏幕初始化 effect——
  // 若只依赖外部 imperative reset，会以初始 (0,0) 存活导致首帧拉出跨图长线。
  useEffect(() => {
    resetTo(2 * maze.start[0] + 1.5, 2 * maze.start[1] + 1.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maze]);

  // cellPx 变化（布局/缩放澄清落地）：段为像素直写需全量重写；静态块经 viewBox 与像素解耦
  useEffect(() => {
    redrawWindow();
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
      {segRefSetters.map((setter, i) => (
        <View key={i} ref={setter} testID={`trail-seg-${i}`} style={styles.seg} />
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
  // 段池：位置/尺寸/颜色全部由 setNativeProps 直写（style 引用恒定，重渲染不覆盖直写值）
  seg: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, opacity: 0 },
});
