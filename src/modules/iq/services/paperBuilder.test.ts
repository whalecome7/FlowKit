import { buildPaper, spreadPick, MEMORY_RANGES } from './paperBuilder';
import { conversionTables } from '../data/conversionTables';
import { AGE_BANDS } from '../types';

describe('spreadPick', () => {
  it('不足或相等时原样返回', () => {
    expect(spreadPick([1, 2, 3], 5)).toEqual([1, 2, 3]);
    expect(spreadPick([1, 2, 3], 3)).toEqual([1, 2, 3]);
  });

  it('超额时均匀取且无重复', () => {
    const picked = spreadPick([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4);
    expect(picked).toHaveLength(4);
    expect(new Set(picked).size).toBe(4);
    expect(picked[0]).toBe(1);
    expect(picked[picked.length - 1]).toBe(10);
  });
});

describe('buildPaper', () => {
  it('专业版：28 流体（20 矩阵 + 8 序列）+ 14 言语 + 记忆按年龄档 + 90 秒速度', () => {
    const paper = buildPaper('pro', 'adult');
    expect(paper.fluidItems.filter((i) => i.kind === 'matrix')).toHaveLength(20);
    expect(paper.fluidItems.filter((i) => i.kind === 'sequence')).toHaveLength(8);
    expect(paper.verbalItems).toHaveLength(14);
    // adult：顺背 4–9（2 试/长度 = 12）+ 倒背 3–7（2 试/长度 = 10）
    expect(paper.memoryTrials).toHaveLength(22);
    expect(paper.memoryTrials.filter((t) => t.mode === 'forward')).toHaveLength(12);
    expect(paper.memoryTrials[0]).toMatchObject({ mode: 'forward', length: 4 });
    expect(paper.speed.rows.length).toBeGreaterThanOrEqual(120);
    expect(paper.speed.durationMs).toBe(90000);
    expect(paper.id).toBe('pro:adult');
  });

  it('专业版：6–8 档记忆范围更短', () => {
    const paper = buildPaper('pro', '6-8');
    // 6–8：顺背 3–6（8 试）+ 倒背 2–4（6 试）
    expect(paper.memoryTrials).toHaveLength(14);
    expect(paper.memoryTrials[0]).toMatchObject({ mode: 'forward', length: 3 });
    const backward = paper.memoryTrials.filter((t) => t.mode === 'backward');
    expect(backward[0]).toMatchObject({ length: 2 });
  });

  it('轻量版：12 流体、无言语/记忆、30 秒速度（40 行）', () => {
    const paper = buildPaper('light', '9-11');
    expect(paper.fluidItems).toHaveLength(12);
    expect(paper.verbalItems).toHaveLength(0);
    expect(paper.memoryTrials).toHaveLength(0);
    expect(paper.speed.rows).toHaveLength(40);
    expect(paper.speed.durationMs).toBe(30000);
  });

  it('确定性：同输入两次组卷完全一致（含题目顺序）', () => {
    for (const band of AGE_BANDS) {
      const a = buildPaper('pro', band);
      const b = buildPaper('pro', band);
      expect(a.fluidItems.map((i) => i.id)).toEqual(b.fluidItems.map((i) => i.id));
      expect(a.verbalItems.map((i) => i.id)).toEqual(b.verbalItems.map((i) => i.id));
      expect(a.memoryTrials.map((t) => t.id)).toEqual(b.memoryTrials.map((t) => t.id));
    }
  });

  it('题目无重复、难度梯度覆盖（矩阵升序且首尾难度差 ≥4）', () => {
    const paper = buildPaper('pro', 'adult');
    const ids = [...paper.fluidItems, ...paper.verbalItems].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const matrices = paper.fluidItems.filter((i) => i.kind === 'matrix');
    const difficulties = matrices.map((i) => i.difficulty);
    expect([...difficulties].sort((x, y) => x - y)).toEqual(difficulties);
    expect(difficulties[difficulties.length - 1] - difficulties[0]).toBeGreaterThanOrEqual(4);
  });

  it('轻量卷难度覆盖：每年龄档跨度 ≥4', () => {
    for (const band of AGE_BANDS) {
      const diffs = buildPaper('light', band).fluidItems.map((i) => i.difficulty);
      expect(Math.max(...diffs) - Math.min(...diffs)).toBeGreaterThanOrEqual(4);
    }
  });

  it('折算表记忆封顶 = 各档组卷记忆范围上限之和', () => {
    for (const band of AGE_BANDS) {
      const caps = conversionTables[band].memory;
      expect(caps[caps.length - 1][0]).toBe(
        MEMORY_RANGES[band].forward[1] + MEMORY_RANGES[band].backward[1],
      );
    }
  });
});
