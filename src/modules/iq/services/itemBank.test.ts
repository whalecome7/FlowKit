import { matrixPool } from '../data/matrixItems';
import { AGE_BANDS } from '../types';
import type { MatrixCell, ShapeKind } from '../types';

// 注：言语 / 数字广度 / 速度任务的校验块，分别在 Task 3 / Task 4 落地各自数据时追加到本文件

const SHAPE_WHITELIST: ShapeKind[] = [
  'circle', 'square', 'triangle', 'diamond', 'star', 'arrow', 'line',
];
const ROTATIONS = [0, 45, 90, 135, 180, 225, 270, 315];

/** 选项去重用的规范化键 */
export function cellKey(cell: MatrixCell): string {
  return JSON.stringify(
    cell.shapes.map((s) => [s.kind, s.fill, s.count, s.rotation ?? 0, s.size ?? 'large']),
  );
}

describe('流体推理题库', () => {
  it('字段与难度合法', () => {
    for (const item of matrixPool) {
      expect(item.difficulty).toBeGreaterThanOrEqual(1);
      expect(item.difficulty).toBeLessThanOrEqual(10);
      expect(Number.isInteger(item.difficulty)).toBe(true);
      expect(item.ageBands.length).toBeGreaterThan(0);
      expect(item.answerIndex).toBeGreaterThanOrEqual(0);
      expect(item.answerIndex).toBeLessThan(item.options.length);
      expect(Number.isInteger(item.answerIndex)).toBe(true);
      expect(item.rule.length).toBeGreaterThan(0);
    }
  });

  it('矩阵 9 格缺第 9 格、序列 5 格缺第 5 格，均六选一', () => {
    for (const item of matrixPool) {
      if (item.kind === 'matrix') {
        expect(item.cells).toHaveLength(9);
        expect(item.cells[8]).toBeNull();
      } else {
        expect(item.cells).toHaveLength(5);
        expect(item.cells[4]).toBeNull();
      }
      expect(item.cells.slice(0, -1).every((c) => c !== null)).toBe(true);
      expect(item.options).toHaveLength(6);
    }
  });

  it('图形基元在白名单内且参数合法', () => {
    const allCells = matrixPool.flatMap((i) => [
      ...(i.cells.filter(Boolean) as MatrixCell[]),
      ...i.options,
    ]);
    for (const cell of allCells) {
      expect(cell.shapes.length).toBeGreaterThan(0);
      for (const s of cell.shapes) {
        expect(SHAPE_WHITELIST).toContain(s.kind);
        expect(['solid', 'hollow']).toContain(s.fill);
        expect(s.count).toBeGreaterThanOrEqual(1);
        expect(s.count).toBeLessThanOrEqual(4);
        if (s.rotation !== undefined) expect(ROTATIONS).toContain(s.rotation);
        if (!['arrow', 'line'].includes(s.kind)) expect(s.rotation ?? 0).toBe(0);
      }
    }
  });

  it('选项无重复', () => {
    for (const item of matrixPool) {
      const keys = item.options.map(cellKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('id 全局唯一', () => {
    const ids = matrixPool.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每年龄档 ≥20 矩阵与 ≥8 序列（供专业卷组卷）', () => {
    for (const band of AGE_BANDS) {
      const m = matrixPool.filter((i) => i.kind === 'matrix' && i.ageBands.includes(band));
      const s = matrixPool.filter((i) => i.kind === 'sequence' && i.ageBands.includes(band));
      expect(m.length).toBeGreaterThanOrEqual(20);
      expect(s.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('每年龄档难度 2–7 的流体题 ≥12（供轻量卷）', () => {
    for (const band of AGE_BANDS) {
      const light = matrixPool.filter(
        (i) => i.ageBands.includes(band) && i.difficulty >= 2 && i.difficulty <= 7,
      );
      expect(light.length).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('题库加固', () => {
  it('题干签名唯一：全池 cells 组合不重复', () => {
    const signature = (item: (typeof matrixPool)[number]) =>
      item.cells.map((c) => (c ? cellKey(c) : '?')).join('|');
    const sigs = matrixPool.map(signature);
    expect(new Set(sigs).size).toBe(sigs.length);
  });

  it('答案位置分布：0..5 各位置出现次数 ≥3 且 ≤10', () => {
    const counts = [0, 1, 2, 3, 4, 5].map(
      (p) => matrixPool.filter((i) => i.answerIndex === p).length,
    );
    for (const c of counts) {
      expect(c).toBeGreaterThanOrEqual(3);
      expect(c).toBeLessThanOrEqual(10);
    }
  });
});
