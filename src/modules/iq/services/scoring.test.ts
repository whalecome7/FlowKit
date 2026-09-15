import {
  computeLightReport,
  computeProReport,
  interpolate,
  isMemoryPass,
  normalCdf,
  scoreMemory,
} from './scoring';
import type { MatrixItem, Paper, Responses, VerbalItem } from '../types';

const cell = { shapes: [{ kind: 'circle' as const, fill: 'solid' as const, count: 1 }] };

function mkMatrix(id: string, difficulty: number): MatrixItem {
  return {
    id,
    kind: 'matrix',
    difficulty,
    ageBands: ['adult'],
    rule: 'test',
    cells: [cell, cell, cell, cell, cell, cell, cell, cell, null],
    options: [cell, cell, cell, cell, cell, cell],
    answerIndex: 0,
  };
}

function mkVerbal(id: string, difficulty: number): VerbalItem {
  return {
    id,
    difficulty,
    ageBands: ['adult'],
    relation: 'category',
    a: '甲',
    b: '乙',
    c: '丙',
    options: ['A', 'B', 'C', 'D'],
    answerIndex: 0,
  };
}

/** 计分测试夹具：设计为「数字可精确预期」（见下方注释的锚点推导） */
function mkPaper(mode: 'pro' | 'light' = 'pro'): Paper {
  return {
    id: `${mode}:adult`,
    mode,
    ageBand: 'adult',
    fluidItems: [mkMatrix('m1', 5), mkMatrix('m2', 5)],
    verbalItems: mode === 'pro' ? [mkVerbal('v1', 5), mkVerbal('v2', 5)] : [],
    memoryTrials:
      mode === 'pro'
        ? [
            { id: 'f3', mode: 'forward', length: 3, digits: [7, 3, 9] },
            { id: 'f4', mode: 'forward', length: 4, digits: [5, 2, 8, 6] },
            { id: 'b2', mode: 'backward', length: 2, digits: [4, 7] },
          ]
        : [],
    speed: { target: 'diamond', rows: [], durationMs: 90000 },
  };
}

describe('interpolate', () => {
  it('端点钳制与中点插值', () => {
    expect(interpolate([[0, 55], [1, 135]], -0.5)).toBe(55);
    expect(interpolate([[0, 55], [1, 135]], 0.5)).toBe(95);
    expect(interpolate([[0, 55], [1, 135]], 2)).toBe(135);
  });
});

describe('normalCdf', () => {
  it('关键分位', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-3)).toBeCloseTo(0.00135, 4);
  });
});

describe('isMemoryPass / scoreMemory', () => {
  it('顺背按原序、倒背按逆序判定', () => {
    const f = { id: 'f', mode: 'forward' as const, length: 3, digits: [7, 3, 9] };
    const b = { id: 'b', mode: 'backward' as const, length: 3, digits: [5, 2, 8] };
    expect(isMemoryPass(f, [7, 3, 9])).toBe(true);
    expect(isMemoryPass(f, [9, 3, 7])).toBe(false);
    expect(isMemoryPass(f, [7, 3])).toBe(false);
    expect(isMemoryPass(b, [8, 2, 5])).toBe(true);
    expect(isMemoryPass(b, [5, 2, 8])).toBe(false);
  });

  it('取最长通过长度（顺/倒分别）', () => {
    const paper = mkPaper('pro');
    const responses: Responses = {
      choice: {},
      memory: {
        f3: { input: [7, 3, 9], elapsedMs: 0 },
        f4: { input: [5, 2, 8], elapsedMs: 0 },
        b2: { input: [7, 4], elapsedMs: 0 },
      },
      speed: null,
    };
    expect(scoreMemory(paper, responses)).toEqual({ maxF: 3, maxB: 2, passed: 2 });
  });
});

describe('computeProReport（golden：adult 档锚点可精确预期）', () => {
  // 推导：流体 2 题全对 → 比率 1 → 137；言语 1/2 对 → 比率 0.5 → 89；
  // 记忆 maxF3 + maxB2 = 5 → [4,68]~[6,80] 中点 → 74；
  // 速度 30−4=26 → [22,80]~[30,90] 四分之一 → 85；
  // 合成 = round(137×0.4 + 89×0.25 + 74×0.2 + 85×0.15) = round(104.6) = 105
  const responses: Responses = {
    choice: {
      m1: { optionIndex: 0, elapsedMs: 100 },
      m2: { optionIndex: 0, elapsedMs: 100 },
      v1: { optionIndex: 0, elapsedMs: 100 },
      v2: { optionIndex: 3, elapsedMs: 100 },
    },
    memory: {
      f3: { input: [7, 3, 9], elapsedMs: 0 },
      f4: { input: [5, 2, 8], elapsedMs: 0 },
      b2: { input: [7, 4], elapsedMs: 0 },
    },
    speed: { correct: 30, wrong: 4 },
  };

  it('维度指数与总分区间', () => {
    const report = computeProReport(mkPaper('pro'), responses);
    expect(report.dimensionIndices).toEqual({ fluid: 137, verbal: 89, memory: 74, speed: 85 });
    expect(report.total.estimate).toBe(105);
    expect(report.total.iqLow).toBe(98);
    expect(report.total.iqHigh).toBe(113);
    expect(report.total.percentile).toBeGreaterThan(62);
    expect(report.total.percentile).toBeLessThan(64);
  });

  it('全空作答：全部钳制到最低锚点', () => {
    const empty: Responses = { choice: {}, memory: {}, speed: null };
    const report = computeProReport(mkPaper('pro'), empty);
    expect(report.dimensionIndices).toEqual({ fluid: 55, verbal: 55, memory: 55, speed: 55 });
    expect(report.total.estimate).toBe(55);
    expect(report.total.iqLow).toBe(48);
    expect(report.total.iqHigh).toBe(63);
    expect(report.total.percentile).toBeLessThan(1);
  });
});

describe('computeLightReport', () => {
  it('全对 + 满速配 → 5 星；全错 → 1 星', () => {
    const good: Responses = {
      choice: { m1: { optionIndex: 0, elapsedMs: 0 }, m2: { optionIndex: 0, elapsedMs: 0 } },
      memory: {},
      speed: { correct: 30, wrong: 0 },
    };
    const goodReport = computeLightReport(mkPaper('light'), good);
    expect(goodReport.starLevel).toBe(5);
    expect(goodReport.summary.length).toBeGreaterThan(0);
    expect(goodReport.detail).toEqual({ matrixCorrect: 2, matrixTotal: 2, speedCorrect: 30, speedWrong: 0 });

    const bad: Responses = { choice: {}, memory: {}, speed: { correct: 0, wrong: 5 } };
    expect(computeLightReport(mkPaper('light'), bad).starLevel).toBe(1);
  });
});
