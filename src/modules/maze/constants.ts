import type { MazeDifficulty, ShapeKey, TrailStyle } from './types';

export interface DifficultyConfig {
  label: string;
  N: number;
  braid: number;
  pool: ShapeKey[];
}

export const DIFF_ORDER: MazeDifficulty[] = ['easy', 'normal', 'hard', 'hell'];

export const DIFFS: Record<MazeDifficulty, DifficultyConfig> = {
  easy: { label: '轻松', N: 13, braid: 0.85, pool: ['circle', 'ellipse', 'capsule'] },
  normal: { label: '普通', N: 19, braid: 0.55, pool: ['heart', 'flower', 'hexagon', 'ellipse'] },
  hard: { label: '困难', N: 27, braid: 0.25, pool: ['star', 'crescent', 'flower'] },
  hell: { label: '地狱', N: 35, braid: 0, pool: ['star', 'crescent', 'organic'] },
};

export const SHAPE_NAMES: Record<ShapeKey, string> = {
  circle: '圆形',
  ellipse: '椭圆',
  capsule: '胶囊',
  hexagon: '六边形',
  heart: '心形',
  star: '星星',
  flower: '花朵',
  crescent: '月牙',
  organic: '有机形',
};

export interface Palette {
  name: string;
  wall: string;
  wallDark: string;
  bg: string;
}

export const PALETTES: Palette[] = [
  { name: '紫莓', wall: '#a78bfa', wallDark: '#8b5cf6', bg: '#faf7ff' },
  { name: '薄荷', wall: '#34d399', wallDark: '#10b981', bg: '#f2fdf8' },
  { name: '蜜桃', wall: '#fb923c', wallDark: '#f97316', bg: '#fff7ed' },
  { name: '蓝莓', wall: '#60a5fa', wallDark: '#3b82f6', bg: '#f3f8ff' },
  { name: '莓果', wall: '#f472b6', wallDark: '#ec4899', bg: '#fdf2f8' },
  { name: '抹茶', wall: '#84cc16', wallDark: '#65a30d', bg: '#f9fef0' },
];

export function paletteForSeed(seed: number): Palette {
  return PALETTES[seed % PALETTES.length];
}

/** 世界单位与物理（详见设计文档） */
export const BALL_R = 0.34;
export const SPEED = 8; // 单元/秒
export const JOY_DEAD = 0.12;
export const END_TOL = 0.6;

/** 轨迹 */
export const TRAIL_WIDTH = 0.24;
export const TRAIL_STYLES: TrailStyle[] = ['rainbow', 'mono', 'fade'];
export const TRAIL_STYLE_LABEL: Record<TrailStyle, string> = {
  rainbow: '🌈 轨迹·彩虹',
  mono: '🎨 轨迹·单色',
  fade: '🫥 轨迹·渐隐',
};
export const FADE_DECAY = 0.78;
export const FADE_CUTOFF = 0.06;

/** 标记配色 */
export const START_COLOR = '#22c55e';
export const FLAG_COLOR = '#f43f5e';
export const FLAG_POLE_COLOR = '#8d8578';
export const GHOST_COLOR = 'rgba(120, 118, 140, 0.85)';
export const PATH_COLOR = '#0d9488';
export const BALL_COLOR = '#64748b';

/** 墙体线厚度（单元比例，0~1）：墙单元内以中心为轴绘制细条带 */
export const WALL_THICKNESS = 0.6;

/** 存储键（对齐项目 @flowkit 前缀惯例） */
export const STORAGE_BEST = '@flowkit:maze:best';
export const STORAGE_HISTORY = '@flowkit:maze:history';
export const HISTORY_LIMIT = 50;

/** 镜头 */
export const BASE_CELL_DP = 12; // Svg 基础单元尺寸（缩放围绕它做 transform）
/** 初始视图的单元尺寸下限（dp）：低于它则进入跟随模式 */
export const INITIAL_CELL_DP = 10;
export const MIN_SCALE_DP = 4;
export const MAX_SCALE_DP = 22;

/** 底部摇杆带高度（dp）：屏高的 26%，clamp [200, 260]（屏幕布局与手势分区共用） */
export function joystickZoneHeight(windowHeight: number): number {
  return Math.min(260, Math.max(200, 0.26 * windowHeight));
}
