/** 年龄档：6–8 / 9–11 / 12–16 / 17 岁及以上 */
export type AgeBand = '6-8' | '9-11' | '12-16' | 'adult';

export const AGE_BANDS: AgeBand[] = ['6-8', '9-11', '12-16', 'adult'];

/** 测试模式：专业模拟版 / 轻量趣味版 */
export type TestMode = 'pro' | 'light';

/** 专业版维度 */
export type Dimension = 'fluid' | 'verbal' | 'memory' | 'speed';

/** 图形基元类型（Unicode 几何符号白名单，itemBank.test 校验） */
export type ShapeKind = 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'arrow' | 'line';

export type ShapeRotation = 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315;

/** 单个图形基元（图形题最小单元） */
export interface ShapeSpec {
  kind: ShapeKind;
  fill: 'solid' | 'hollow'; // line 基元忽略
  count: number; // 1..4，同格内重复个数
  rotation?: ShapeRotation; // 仅 arrow / line 使用
  size?: 'small' | 'large'; // 省略 = 'large'（cellKey 与渲染均以此为默认）
}

/** 一格的内容（可多基元组合，按序流式排列） */
export interface MatrixCell {
  shapes: ShapeSpec[];
}

/** 矩阵 / 序列题（原创题，仅借鉴题型范式，非任何临床量表原题） */
export interface MatrixItem {
  id: string;
  kind: 'matrix' | 'sequence'; // matrix: 3×3 缺第 9 格；sequence: 1×5 缺第 5 格
  difficulty: number; // 1..10
  ageBands: AgeBand[];
  rule: string; // 规律说明（数据维护用，运行时不使用）
  cells: (MatrixCell | null)[]; // matrix 长度 9（末格 null）；sequence 长度 5（末格 null）
  options: MatrixCell[]; // 六选一，选项间不允许重复
  answerIndex: number; // 0..5
}

/** 言语类比关系类型 */
export type VerbalRelation =
  | 'antonym' // 反义
  | 'category' // 种属
  | 'function' // 功能
  | 'part-whole' // 部分-整体
  | 'degree' // 程度
  | 'cause'; // 因果

/** 言语类比题：A : B ＝ C : ?（每题唯一正确关系） */
export interface VerbalItem {
  id: string;
  difficulty: number; // 1..10
  ageBands: AgeBand[];
  relation: VerbalRelation;
  a: string;
  b: string;
  c: string;
  options: string[]; // 四选一，选项间不允许重复
  answerIndex: number; // 0..3
}

/** 数字广度固定序列（非随机数据，每个「模式 × 长度」2 试） */
export interface MemoryTrial {
  id: string;
  mode: 'forward' | 'backward';
  length: number;
  digits: number[];
}

/** 符号检索行：一行 5 个符号，是否含目标符号 */
export interface SpeedRow {
  symbols: ShapeKind[];
  hasTarget: boolean;
}

/** 符号检索任务配置（行流预生成固化） */
export interface SpeedTask {
  target: ShapeKind;
  rows: SpeedRow[];
  durationMs: number;
}

/** 一份卷面（确定性组卷产物） */
export interface Paper {
  id: string; // `${mode}:${ageBand}`
  mode: TestMode;
  ageBand: AgeBand;
  fluidItems: MatrixItem[]; // 专业 28（矩阵 20 + 序列 8）/ 轻量 12
  verbalItems: VerbalItem[]; // 专业 14 / 轻量 0
  memoryTrials: MemoryTrial[]; // 专业按年龄档长度范围（升序，每长度 2 试）/ 轻量 0
  speed: SpeedTask; // 专业 90 秒 / 轻量 30 秒
}

/** 作答记录（用时仅作记录，不参与计分） */
export interface Responses {
  choice: Record<string, { optionIndex: number; elapsedMs: number }>;
  memory: Record<string, { input: number[]; elapsedMs: number }>;
  speed: { correct: number; wrong: number } | null;
}

export interface ProReport {
  kind: 'pro';
  dimensionIndices: Record<Dimension, number>; // 各维度指数（M=100、SD=15 口径的估算）
  total: {
    estimate: number; // 加权合成点值
    iqLow: number; // estimate − 7.5（取整）
    iqHigh: number; // estimate + 7.5（取整）
    percentile: number; // 百分位（正态假设，保留 1 位小数）
  };
}

export interface LightReport {
  kind: 'light';
  starLevel: number; // 1..5
  summary: string; // 趣味评语
  detail: {
    matrixCorrect: number;
    matrixTotal: number;
    speedCorrect: number;
    speedWrong: number;
  };
}

export type Report = ProReport | LightReport;

/** 已完成的测试结果（持久化到 AsyncStorage） */
export interface TestResult {
  id: string;
  mode: TestMode;
  ageBand: AgeBand;
  createdAt: number;
  durationMs: number;
  report: Report;
}

/** 施测步骤（线性序列；stepIndex 越过末位即完成） */
export type SessionStep =
  | { kind: 'practice'; section: Dimension; index: number } // 不计分练习
  | { kind: 'test'; section: Dimension; index: number } // 正式计分题
  | { kind: 'speed-ready' }; // 速配说明与倒计时入口

/** 一次施测会话（内存态，不持久化） */
export interface Session {
  paper: Paper;
  steps: SessionStep[];
  stepIndex: number;
  startedAt: number;
  responses: Responses;
}
