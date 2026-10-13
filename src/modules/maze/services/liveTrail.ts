import { FADE_CUTOFF, FADE_DECAY } from '../constants';
import type { TrailStyle } from '../types';

/**
 * 实时轨迹核心：球真实路径的逐帧采样折线。
 *
 * 取代"格中心折线 + 直线尾巴"的近似模型——格折线以格边界为步进粒度，
 * 与球连续位置之间存在固有领先/落后（跨边界瞬间折线跳到格中心），
 * 且"格中心 → 球"的直线在十字路口附近可能斜穿墙角。
 * 采样折线的端点恒为球、相邻点间距有界（球不穿墙 ⇒ 折线不穿墙）。
 *
 * 数据流：append 采样点 → 环形段池绘制最近窗口 → 超出窗口批量冻结为静态块。
 */

/** 采样间距（世界单位）：距上一采样点不足该值不追加 */
export const LIVE_STEP = 0.08;
/** 段池槽数（环形）：须 ≥ 触发阈值 + 批量 + 余量，保证槽复用前旧段已冻结 */
export const LIVE_SLOTS = 112;
/** 未冻结完整段数达到该值时冻结一批 */
export const FREEZE_AT = 96;
/** 每次冻结的段数 */
export const FREEZE_BATCH = 48;
/** 静态块内路径分组（段数/组）：组内统一样式（色桶/透明度档的近似粒度） */
export const GROUP_SIZE = 16;
/** 样式"一步"折算路径长度（世界单位）：≈ 格中心间距，与原格折线步序对齐 */
export const AGE_UNIT = 2;
/** 渐隐档数（与原格折线一致） */
const FADE_STEPS = 8;

export interface LiveStyleSpec {
  trailStyle: TrailStyle;
  monoColor: string;
}

export interface SegStyle {
  color: string;
  opacity: number;
}

export interface TrailBlock {
  /** 覆盖段区间 [from, to)：段 k = 点 k → 点 k+1 */
  from: number;
  to: number;
  /** 块尾点累计路径长度（世界单位） */
  endLen: number;
  paths: { d: string; color: string; opacity: number }[];
}

export interface LivePathState {
  xs: number[];
  ys: number[];
  /** lens[k]：起点到点 k 的累计路径长度（世界单位） */
  lens: number[];
}

export function createLivePath(x: number, y: number): LivePathState {
  return { xs: [x], ys: [y], lens: [0] };
}

/**
 * 向 (x, y) 追加采样点：自最后一点起以 LIVE_STEP 为步长沿直线插值推进，
 * 每步追加一个点（相邻点距 = LIVE_STEP）；返回本次追加的点数。
 * 快移帧（一帧位移可达 ~0.36）自动补点，保证点距有界——
 * 圆点串以固定密度重叠成连续轨迹（点距 ≪ 点直径），不依赖逐段旋转。
 */
export function advanceTo(s: LivePathState, x: number, y: number): number {
  let n = s.xs.length - 1;
  let added = 0;
  for (;;) {
    const dist = Math.hypot(x - s.xs[n], y - s.ys[n]);
    if (dist < LIVE_STEP) break;
    const t = LIVE_STEP / dist;
    s.xs.push(s.xs[n] + (x - s.xs[n]) * t);
    s.ys.push(s.ys[n] + (y - s.ys[n]) * t);
    s.lens.push(s.lens[n] + LIVE_STEP);
    n++;
    added++;
  }
  return added;
}

/**
 * 段/点样式：mono 单色全亮；rainbow 按"起点累计长度"**连续渐变**色相
 * （每 AGE_UNIT 走 15°，0.1° 量化——点池逐点更新，相邻点色差 < 1°，衔接处无台阶）；
 * fade 按"距头部长度"8 档衰减（α = 0.78^(age/AGE_UNIT)），低于 cutoff 返回 0 表示不画。
 */
export function segStyleAt(spec: LiveStyleSpec, lenPos: number, headLen: number): SegStyle {
  if (spec.trailStyle === 'mono') return { color: spec.monoColor, opacity: 1 };
  if (spec.trailStyle === 'fade') {
    const alpha = Math.pow(FADE_DECAY, Math.max(0, headLen - lenPos) / AGE_UNIT);
    if (alpha < FADE_CUTOFF) return { color: spec.monoColor, opacity: 0 };
    const step = Math.min(FADE_STEPS - 1, Math.floor(alpha * FADE_STEPS));
    return { color: spec.monoColor, opacity: (step + 1) / FADE_STEPS };
  }
  const hue = Math.round((((lenPos / AGE_UNIT) * 15) % 360) * 10) / 10;
  return { color: `hsl(${hue}, 85%, 52%)`, opacity: 1 };
}

/**
 * 构建静态块：段 [from, to)（点 [from, to] 须已存在）。
 * d 使用世界坐标（配合 viewBox），与绘制像素尺寸解耦；
 * 组内样式按组头端 lenPos 取近似（跨组的桶/档台阶与原格折线一致）。
 */
export function buildBlock(
  s: LivePathState,
  from: number,
  to: number,
  spec: LiveStyleSpec,
  headLen: number,
): TrailBlock {
  const paths: TrailBlock['paths'] = [];
  for (let g = from; g < to; g += GROUP_SIZE) {
    const gEnd = Math.min(g + GROUP_SIZE, to);
    const st = segStyleAt(spec, s.lens[g], headLen);
    if (st.opacity <= 0) continue;
    let d = `M ${fmt(s.xs[g])} ${fmt(s.ys[g])}`;
    for (let k = g; k < gEnd; k++) {
      d += ` L ${fmt(s.xs[k + 1])} ${fmt(s.ys[k + 1])}`;
    }
    paths.push({ d, color: st.color, opacity: st.opacity });
  }
  return { from, to, endLen: s.lens[to], paths };
}

/** 块是否仍在渐隐可视范围内（非 fade 恒真；死亡块整块剔除） */
export function blockAlive(block: TrailBlock, headLen: number, spec: LiveStyleSpec): boolean {
  if (spec.trailStyle !== 'fade') return true;
  return Math.pow(FADE_DECAY, Math.max(0, headLen - block.endLen) / AGE_UNIT) >= FADE_CUTOFF;
}

function fmt(v: number): number {
  return Math.round(v * 100) / 100;
}
