export type MazeDifficulty = 'easy' | 'normal' | 'hard' | 'hell';
export type ShapeKey =
  | 'circle'
  | 'ellipse'
  | 'capsule'
  | 'hexagon'
  | 'heart'
  | 'star'
  | 'flower'
  | 'crescent'
  | 'organic';
export type TrailStyle = 'rainbow' | 'mono' | 'fade';
export type GamePhase = 'ready' | 'playing' | 'won';

/** 格坐标 [i(列), j(行)] */
export type CellPoint = [number, number];

export interface MazeData {
  seed: number;
  difficulty: MazeDifficulty;
  /** 每边格数 */
  N: number;
  /** 网格边长 = 2N+1 */
  G: number;
  shapeKey: ShapeKey;
  /** cells[r][c]：0 通 / 1 墙 */
  cells: number[][];
  /** inS[r][c]：仅奇数坐标有效，格是否在形状内 */
  inS: boolean[][];
  /** 起点格 [i, j] */
  start: CellPoint;
  /** 终点格 [i, j] */
  end: CellPoint;
}

export interface BallPos {
  x: number;
  y: number;
}

export interface BestRecord {
  timeMs: number;
  steps: number;
}

export interface HistoryRecord {
  difficulty: MazeDifficulty;
  seed: number;
  timeMs: number;
  steps: number;
  at: number;
  /** trailCodec 编码的轨迹 */
  trail: string;
}

export interface JoyVector {
  x: number;
  y: number;
}
