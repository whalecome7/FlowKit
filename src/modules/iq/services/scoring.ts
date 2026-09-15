import { conversionTables, type Anchor } from '../data/conversionTables';
import { STAR_SUMMARIES } from './texts';
import type {
  LightReport,
  MatrixItem,
  MemoryTrial,
  Paper,
  ProReport,
  Report,
  Responses,
  VerbalItem,
} from '../types';

/** 分段线性插值 + 端点钳制 */
export function interpolate(anchors: Anchor[], raw: number): number {
  if (anchors.length === 0) return 100;
  if (raw <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (raw >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (raw <= x1) return Math.round(y0 + ((y1 - y0) * (raw - x0)) / (x1 - x0));
  }
  return last[1];
}

/** 标准正态累积分布（Abramowitz–Stegun 7.1.26 近似，误差 < 1e-7） */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  let p =
    d *
    t *
    (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  if (z > 0) p = 1 - p;
  return p;
}

/** 数字广度单试通过判定（顺背原序、倒背逆序，长度须一致） */
export function isMemoryPass(trial: MemoryTrial, input: number[] | undefined): boolean {
  if (!input) return false;
  const expected = trial.mode === 'forward' ? trial.digits : [...trial.digits].reverse();
  return input.length === expected.length && input.every((d, i) => d === expected[i]);
}

type ScorableItem = Pick<MatrixItem | VerbalItem, 'id' | 'difficulty' | 'answerIndex'>;

/** 难度加权答对率（0..1）与答对数 */
function weightedRatio(
  items: ScorableItem[],
  choice: Responses['choice'],
): { ratio: number; correct: number } {
  let got = 0;
  let total = 0;
  let correct = 0;
  for (const item of items) {
    total += item.difficulty;
    if (choice[item.id]?.optionIndex === item.answerIndex) {
      got += item.difficulty;
      correct++;
    }
  }
  return { ratio: total > 0 ? got / total : 0, correct };
}

/** 数字广度：最长顺背 / 最长倒背 / 通过试数 */
export function scoreMemory(
  paper: Paper,
  responses: Responses,
): { maxF: number; maxB: number; passed: number } {
  let maxF = 0;
  let maxB = 0;
  let passed = 0;
  for (const trial of paper.memoryTrials) {
    if (isMemoryPass(trial, responses.memory[trial.id]?.input)) {
      passed++;
      if (trial.mode === 'forward') maxF = Math.max(maxF, trial.length);
      else maxB = Math.max(maxB, trial.length);
    }
  }
  return { maxF, maxB, passed };
}

const WEIGHTS = { fluid: 0.4, verbal: 0.25, memory: 0.2, speed: 0.15 } as const;

/** 专业版报告：维度指数 + 估算区间 + 百分位（设计标定，非诊断） */
export function computeProReport(paper: Paper, responses: Responses): ProReport {
  const table = conversionTables[paper.ageBand];
  const fluid = weightedRatio(paper.fluidItems, responses.choice);
  const verbal = weightedRatio(paper.verbalItems, responses.choice);
  const memory = scoreMemory(paper, responses);
  const net = Math.max(0, (responses.speed?.correct ?? 0) - (responses.speed?.wrong ?? 0));

  const dimensionIndices = {
    fluid: interpolate(table.fluid, fluid.ratio),
    verbal: interpolate(table.verbal, verbal.ratio),
    memory: interpolate(table.memory, memory.maxF + memory.maxB),
    speed: interpolate(table.speed, net),
  };
  const estimate = Math.round(
    dimensionIndices.fluid * WEIGHTS.fluid +
      dimensionIndices.verbal * WEIGHTS.verbal +
      dimensionIndices.memory * WEIGHTS.memory +
      dimensionIndices.speed * WEIGHTS.speed,
  );
  const percentile = Math.min(
    99.9,
    Math.max(0.1, Math.round(normalCdf((estimate - 100) / 15) * 1000) / 10),
  );
  return {
    kind: 'pro',
    dimensionIndices,
    total: {
      estimate,
      iqLow: Math.round(estimate - 7.5),
      iqHigh: Math.round(estimate + 7.5),
      percentile,
    },
  };
}

/** 轻量版报告：星级 + 评语（不输出数字 IQ，避免伪精确） */
export function computeLightReport(paper: Paper, responses: Responses): LightReport {
  const fluid = weightedRatio(paper.fluidItems, responses.choice);
  const net = Math.max(0, (responses.speed?.correct ?? 0) - (responses.speed?.wrong ?? 0));
  const combined = fluid.ratio * 0.7 + Math.min(net / 30, 1) * 0.3;
  const starLevel =
    combined >= 0.85 ? 5 : combined >= 0.7 ? 4 : combined >= 0.55 ? 3 : combined >= 0.4 ? 2 : 1;
  return {
    kind: 'light',
    starLevel,
    summary: STAR_SUMMARIES[starLevel],
    detail: {
      matrixCorrect: fluid.correct,
      matrixTotal: paper.fluidItems.length,
      speedCorrect: responses.speed?.correct ?? 0,
      speedWrong: responses.speed?.wrong ?? 0,
    },
  };
}

export function computeReport(paper: Paper, responses: Responses): Report {
  return paper.mode === 'pro' ? computeProReport(paper, responses) : computeLightReport(paper, responses);
}
