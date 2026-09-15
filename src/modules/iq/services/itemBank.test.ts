import { matrixPool } from '../data/matrixItems';
import { memoryPool } from '../data/memorySequences';
import { speedTask, LIGHT_SPEED_ROW_COUNT } from '../data/speedTask';
import { verbalPool } from '../data/verbalItems';
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

describe('言语类比题库', () => {
  it('结构合法：四选项、答案索引合法、选项无重复', () => {
    for (const item of verbalPool) {
      expect(item.options).toHaveLength(4);
      expect(new Set(item.options).size).toBe(4);
      expect(item.answerIndex).toBeGreaterThanOrEqual(0);
      expect(item.answerIndex).toBeLessThan(4);
      for (const t of [item.a, item.b, item.c]) expect(t.length).toBeGreaterThan(0);
      expect(item.ageBands.length).toBeGreaterThan(0);
      expect(item.difficulty).toBeGreaterThanOrEqual(1);
      expect(item.difficulty).toBeLessThanOrEqual(10);
    }
  });

  it('id 唯一、每年龄档 ≥14 题', () => {
    const ids = verbalPool.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const band of AGE_BANDS) {
      expect(verbalPool.filter((i) => i.ageBands.includes(band)).length).toBeGreaterThanOrEqual(14);
    }
  });

  it('答案位置分布：0..3 各位置出现次数 ≥5 且 ≤10', () => {
    const counts = [0, 1, 2, 3].map((p) => verbalPool.filter((i) => i.answerIndex === p).length);
    for (const c of counts) {
      expect(c).toBeGreaterThanOrEqual(5);
      expect(c).toBeLessThanOrEqual(10);
    }
  });
});

describe('数字广度序列库', () => {
  it('位数匹配、无三位以上连续重复、每「模式 × 长度」恰 2 试', () => {
    const seen = new Map<string, number>();
    for (const t of memoryPool) {
      expect(t.digits).toHaveLength(t.length);
      expect(t.digits.every((d) => d >= 0 && d <= 9)).toBe(true);
      for (let i = 2; i < t.digits.length; i++) {
        expect(!(t.digits[i] === t.digits[i - 1] && t.digits[i] === t.digits[i - 2])).toBe(true);
      }
      const k = `${t.mode}:${t.length}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    for (let l = 3; l <= 9; l++) expect(seen.get(`forward:${l}`)).toBe(2);
    for (let l = 2; l <= 7; l++) expect(seen.get(`backward:${l}`)).toBe(2);
  });
});

describe('速度任务', () => {
  it('行流结构合法且 hasTarget 与实际一致', () => {
    expect(speedTask.rows.length).toBeGreaterThanOrEqual(120);
    for (const row of speedTask.rows) {
      expect(row.symbols).toHaveLength(5);
      for (const s of row.symbols) expect(SHAPE_WHITELIST).toContain(s);
      expect(row.hasTarget).toBe(row.symbols.includes(speedTask.target));
    }
  });

  it('目标行密度 25%–50%，轻量前 40 行至少 8 个目标', () => {
    const density = speedTask.rows.filter((r) => r.hasTarget).length / speedTask.rows.length;
    expect(density).toBeGreaterThanOrEqual(0.25);
    expect(density).toBeLessThanOrEqual(0.5);
    expect(
      speedTask.rows.slice(0, LIGHT_SPEED_ROW_COUNT).filter((r) => r.hasTarget).length,
    ).toBeGreaterThanOrEqual(8);
  });
});
