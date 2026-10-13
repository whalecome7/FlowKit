import React, { useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import {
  FADE_CUTOFF,
  FADE_DECAY,
  GHOST_COLOR,
  PATH_COLOR,
  TRAIL_WIDTH,
  type Palette,
} from '../constants';
import type { CellPoint, MazeData, TrailStyle } from '../types';

interface Props {
  maze: MazeData;
  cellPx: number;
  palette: Palette;
  trailStyle: TrailStyle;
  trail: CellPoint[];
  ghost: CellPoint[] | null;
  shortestPath: CellPoint[] | null;
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

/** 12 个彩虹桶中心色（hue = 15 + 30k） */
const RAINBOW_BUCKETS: string[] = Array.from({ length: 12 }, (_, k) => hslToHex(15 + 30 * k, 0.85, 0.52));
const FADE_STEPS = 8;

function cellPoint(cell: CellPoint, cellPx: number): string {
  return `${(2 * cell[0] + 1.5) * cellPx} ${(2 * cell[1] + 1.5) * cellPx}`;
}

function buildSegments(trail: CellPoint[], cellPx: number): string[] {
  const segs: string[] = [];
  for (let n = 1; n < trail.length; n++) {
    segs.push(`M ${cellPoint(trail[n - 1], cellPx)} L ${cellPoint(trail[n], cellPx)}`);
  }
  return segs;
}

function TrailLayerInner({ maze, cellPx, palette, trailStyle, trail, ghost, shortestPath }: Props) {
  const size = maze.G * cellPx;

  const paths = useMemo(() => {
    if (trail.length < 2) return [] as { d: string; color: string; opacity: number }[];
    // 全段静态折线（到当前格中心）；"球离开格中心后的实时部分"由屏幕层的尾巴线绘制（格中心→球）
    const segs = buildSegments(trail, cellPx);
    if (segs.length === 0) return [] as { d: string; color: string; opacity: number }[];
    if (trailStyle === 'mono') {
      return [{ d: segs.join(' '), color: palette.wallDark, opacity: 1 }];
    }
    if (trailStyle === 'fade') {
      // 单色 8 档透明度：越旧越淡，低于阈值直接丢弃
      const buckets: string[][] = Array.from({ length: FADE_STEPS }, () => []);
      const total = segs.length;
      for (let n = 0; n < total; n++) {
        const age = total - 1 - n;
        const alpha = Math.pow(FADE_DECAY, age);
        if (alpha < FADE_CUTOFF) continue;
        const step = Math.min(FADE_STEPS - 1, Math.floor(alpha * FADE_STEPS));
        buckets[step].push(segs[n]);
      }
      return buckets
        .map((list, step) => ({
          d: list.join(' '),
          color: palette.wallDark,
          opacity: (step + 1) / FADE_STEPS,
        }))
        .filter((p) => p.d.length > 0);
    }
    // rainbow：hue = (步序 × 15) % 360 → 12 桶（色桶中心取 30° 台阶）
    const buckets: string[][] = Array.from({ length: 12 }, () => []);
    for (let n = 0; n < segs.length; n++) {
      const hue = ((n + 1) * 15) % 360;
      buckets[Math.floor(hue / 30) % 12].push(segs[n]);
    }
    return buckets
      .map((list, k) => ({ d: list.join(' '), color: RAINBOW_BUCKETS[k], opacity: 1 }))
      .filter((p) => p.d.length > 0);
  }, [trail, cellPx, trailStyle, palette.wallDark]);

  const ghostD = useMemo(() => (ghost ? buildSegments(ghost, cellPx).join(' ') : ''), [ghost, cellPx]);
  const pathD = useMemo(
    () => (shortestPath ? buildSegments(shortestPath, cellPx).join(' ') : ''),
    [shortestPath, cellPx],
  );

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ position: 'absolute', left: 0, top: 0 }}>
      {ghostD !== '' && (
        <Path
          d={ghostD}
          stroke={GHOST_COLOR}
          strokeWidth={cellPx * 0.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
      {pathD !== '' && (
        <Path
          d={pathD}
          stroke={PATH_COLOR}
          strokeWidth={cellPx * 0.16}
          strokeLinecap="round"
          strokeDasharray={`${cellPx * 0.42} ${cellPx * 0.42}`}
          fill="none"
        />
      )}
      {paths.map((p, idx) => (
        <Path
          key={idx}
          d={p.d}
          stroke={p.color}
          strokeWidth={cellPx * TRAIL_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity={p.opacity}
          fill="none"
        />
      ))}
    </Svg>
  );
}

export default React.memo(TrailLayerInner);
