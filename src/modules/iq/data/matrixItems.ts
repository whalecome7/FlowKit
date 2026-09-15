import type { MatrixCell, MatrixItem, ShapeSpec } from '../types';

/** 便捷构造：单基元格 */
export const one = (kind: ShapeSpec['kind'], count = 1, fill: ShapeSpec['fill'] = 'solid', rotation?: ShapeSpec['rotation']): MatrixCell => ({
  shapes: [{ kind, fill, count, rotation }],
});

/** 流体推理题池（原创题目，仅借鉴临床题型范式）。
 *  全量构成：矩阵 28 题 + 序列 13 题 = 41 题
 *  难度分层：1–2 数量递进 / 3–4 旋转 / 5–6 组合叠加 / 7–8 叠加消去 / 9–10 多规则复合
 *  标签规则：d1–2 矩阵不打 'adult'；d8–10 矩阵只打 ['12-16','adult']；序列见任务说明。 */
export const matrixPool: MatrixItem[] = [
  // ===== 示例 1：数量递进（难度 1）=====
  {
    id: 'm01',
    kind: 'matrix',
    difficulty: 1,
    ageBands: ['6-8', '9-11', '12-16'],
    rule: '每行图形数量向右每格递增（1→2→3）',
    cells: [
      one('circle', 1), one('circle', 2), one('circle', 3),
      one('square', 1), one('square', 2), one('square', 3),
      one('triangle', 1), one('triangle', 2), null,
    ],
    options: [
      one('triangle', 3),
      one('triangle', 2),
      one('triangle', 4),
      one('square', 3),
      one('triangle', 3, 'hollow'),
      one('circle', 3),
    ],
    answerIndex: 0,
  },

  // ===== 示例 2：序列·数量递增（难度 2）=====
  // 注：count 上限为 4（测试约束），故规律改为「每两格递增一次」，避免出现 count=5
  // 注：id 前缀保留历史编号（m 系），为记录中的例外（其余序列题均为 s 前缀）
  {
    id: 'm02',
    kind: 'sequence',
    difficulty: 2,
    ageBands: ['6-8', '9-11'],
    rule: '序列图形数量每两格递增一次（1,1,2,2→3）',
    cells: [one('star', 1), one('star', 1), one('star', 2), one('star', 2), null],
    options: [
      one('star', 2),
      one('star', 3),
      one('star', 4),
      one('circle', 3),
      one('star', 3, 'hollow'),
      one('diamond', 3),
    ],
    answerIndex: 1,
  },

  // ===== 示例 3：旋转（难度 3）=====
  {
    id: 'm03',
    kind: 'matrix',
    difficulty: 3,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '每行箭头顺时针旋转 90°',
    cells: [
      one('arrow', 1, 'solid', 0), one('arrow', 1, 'solid', 90), one('arrow', 1, 'solid', 180),
      one('arrow', 1, 'solid', 270), one('arrow', 1, 'solid', 0), one('arrow', 1, 'solid', 90),
      one('arrow', 1, 'solid', 180), one('arrow', 1, 'solid', 270), null,
    ],
    options: [
      one('arrow', 1, 'solid', 90),
      one('arrow', 1, 'solid', 180),
      one('arrow', 1, 'solid', 0),
      one('arrow', 1, 'solid', 270),
      one('arrow', 1, 'solid', 45),
      one('arrow', 1, 'solid', 315),
    ],
    answerIndex: 2,
  },

  // ===== 示例 4：组合叠加（难度 5）=====
  {
    id: 'm04',
    kind: 'matrix',
    difficulty: 5,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '每行第三格 = 前两格的组合（并集，均保留）',
    cells: [
      one('circle', 1), one('square', 1),
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'square', fill: 'solid', count: 1 }] },
      one('triangle', 1), one('diamond', 1),
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 1 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      one('star', 1), one('circle', 1), null,
    ],
    options: [
      one('star', 1),
      one('circle', 1),
      { shapes: [{ kind: 'star', fill: 'solid', count: 1 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      one('star', 2),
      one('circle', 1, 'hollow'),
    ],
    answerIndex: 3,
  },

  // ===== 示例 5：叠加消去（难度 8）=====
  {
    id: 'm05',
    kind: 'matrix',
    difficulty: 8,
    ageBands: ['12-16', 'adult'],
    rule: '前两格中「同时出现」的图形抵消，只保留各出现一次的图形（对称差）',
    cells: [
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'triangle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 1 }, { kind: 'square', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'square', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 1 }, { kind: 'star', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'star', fill: 'solid', count: 1 }] },
      null,
    ],
    options: [
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'star', fill: 'solid', count: 1 }] },
      { shapes: [
        { kind: 'square', fill: 'solid', count: 1 },
        { kind: 'circle', fill: 'solid', count: 1 },
        { kind: 'star', fill: 'solid', count: 1 },
      ] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'star', fill: 'solid', count: 1 }] },
      one('circle', 1),
    ],
    answerIndex: 4,
  },

  // ===== 批 1：数量递进 =====
  // m06（难度 1）：行内数量递减
  {
    id: 'm06',
    kind: 'matrix',
    difficulty: 1,
    ageBands: ['6-8', '9-11', '12-16'],
    rule: '每行图形数量向右每格递减（3→2→1），行间图形不同',
    cells: [
      one('star', 3), one('star', 2), one('star', 1),
      one('diamond', 3), one('diamond', 2), one('diamond', 1),
      one('square', 3), one('square', 2), null,
    ],
    options: [
      one('square', 2),
      one('square', 3),
      one('square', 1, 'hollow'),
      one('star', 1),
      one('diamond', 2),
      one('square', 1),
    ],
    answerIndex: 5,
  },

  // m07（难度 1）：行内数量恒定，逐行（逐列）递增
  {
    id: 'm07',
    kind: 'matrix',
    difficulty: 1,
    ageBands: ['6-8', '9-11', '12-16'],
    rule: '每行三格数量相同，且向下每行递增（1→2→3）',
    cells: [
      one('star', 1), one('star', 1), one('star', 1),
      one('diamond', 2), one('diamond', 2), one('diamond', 2),
      one('circle', 3), one('circle', 3), null,
    ],
    options: [
      one('circle', 3),
      one('circle', 2),
      one('circle', 4),
      one('circle', 3, 'hollow'),
      one('star', 3),
      one('diamond', 3),
    ],
    answerIndex: 0,
  },

  // m08（难度 2）：数量=列号 + 形状拉丁方循环
  {
    id: 'm08',
    kind: 'matrix',
    difficulty: 2,
    ageBands: ['6-8', '9-11', '12-16'],
    rule: '每格数量等于列号（1→2→3）；三种形状行间循环左移一位（circle→square→triangle）',
    cells: [
      one('circle', 1), one('square', 2), one('triangle', 3),
      one('square', 1), one('triangle', 2), one('circle', 3),
      one('triangle', 1), one('circle', 2), null,
    ],
    options: [
      one('square', 2),
      one('square', 3),
      one('triangle', 3),
      one('circle', 3),
      one('square', 4),
      one('square', 3, 'hollow'),
    ],
    answerIndex: 1,
  },

  // m09（难度 2）：数量=列号 + 行内首尾同形
  {
    id: 'm09',
    kind: 'matrix',
    difficulty: 2,
    ageBands: ['6-8', '9-11', '12-16'],
    rule: '每格数量等于列号（1→2→3）；每行第 1、3 格形状相同',
    cells: [
      one('circle', 1), one('square', 2), one('circle', 3),
      one('star', 1), one('diamond', 2), one('star', 3),
      one('triangle', 1), one('circle', 2), null,
    ],
    options: [
      one('triangle', 2),
      one('triangle', 4),
      one('triangle', 3),
      one('circle', 3),
      one('square', 3),
      one('triangle', 3, 'hollow'),
    ],
    answerIndex: 2,
  },

  // m10（难度 2）：数量区间平移（2→3→4）
  {
    id: 'm10',
    kind: 'matrix',
    difficulty: 2,
    ageBands: ['6-8', '9-11', '12-16'],
    rule: '每行图形数量向右每格递增（2→3→4），行间图形不同',
    cells: [
      one('star', 2), one('star', 3), one('star', 4),
      one('circle', 2), one('circle', 3), one('circle', 4),
      one('diamond', 2), one('diamond', 3), null,
    ],
    options: [
      one('diamond', 3),
      one('diamond', 2),
      one('star', 4),
      one('diamond', 4),
      one('circle', 4),
      one('diamond', 4, 'hollow'),
    ],
    answerIndex: 3,
  },

  // ===== 批 2：旋转 / 对称 =====
  // m11（难度 3）：双向等差旋转（行 +90°、列 +45°）
  {
    id: 'm11',
    kind: 'matrix',
    difficulty: 3,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '箭头方向向右每格旋转 +45°、向下每格旋转 +90°（左上 0°）',
    cells: [
      one('arrow', 1, 'solid', 0), one('arrow', 1, 'solid', 45), one('arrow', 1, 'solid', 90),
      one('arrow', 1, 'solid', 90), one('arrow', 1, 'solid', 135), one('arrow', 1, 'solid', 180),
      one('arrow', 1, 'solid', 180), one('arrow', 1, 'solid', 225), null,
    ],
    options: [
      one('arrow', 1, 'solid', 225),
      one('arrow', 1, 'solid', 315),
      one('arrow', 1, 'solid', 180),
      one('arrow', 1, 'solid', 90),
      one('arrow', 1, 'solid', 270),
      one('arrow', 1, 'solid', 0),
    ],
    answerIndex: 4,
  },

  // m12（难度 3）：行内两段旋转（+45° 再 +135°），行起点 +90°
  {
    id: 'm12',
    kind: 'matrix',
    difficulty: 3,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '每行三格方向为 X、X+45°、X+180°；行间起点 X 递增 90°',
    cells: [
      one('arrow', 1, 'solid', 0), one('arrow', 1, 'solid', 45), one('arrow', 1, 'solid', 180),
      one('arrow', 1, 'solid', 90), one('arrow', 1, 'solid', 135), one('arrow', 1, 'solid', 270),
      one('arrow', 1, 'solid', 180), one('arrow', 1, 'solid', 225), null,
    ],
    options: [
      one('arrow', 1, 'solid', 180),
      one('arrow', 1, 'solid', 315),
      one('arrow', 1, 'solid', 225),
      one('arrow', 1, 'solid', 45),
      one('arrow', 1, 'solid', 90),
      one('arrow', 1, 'solid', 0),
    ],
    answerIndex: 5,
  },

  // m13（难度 4）：对角等差旋转（行 +45°、列 +90°）
  {
    id: 'm13',
    kind: 'matrix',
    difficulty: 4,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '箭头方向向右每格旋转 +90°、向下每格旋转 +45°（左上 0°）',
    cells: [
      one('arrow', 1, 'solid', 0), one('arrow', 1, 'solid', 90), one('arrow', 1, 'solid', 180),
      one('arrow', 1, 'solid', 45), one('arrow', 1, 'solid', 135), one('arrow', 1, 'solid', 225),
      one('arrow', 1, 'solid', 90), one('arrow', 1, 'solid', 180), null,
    ],
    options: [
      one('arrow', 1, 'solid', 270),
      one('arrow', 1, 'solid', 225),
      one('arrow', 1, 'solid', 315),
      one('arrow', 1, 'solid', 180),
      one('arrow', 1, 'solid', 0),
      one('arrow', 1, 'solid', 90),
    ],
    answerIndex: 0,
  },

  // m14（难度 4）：行内重复 + 反向，行间起点逆时针 90°
  {
    id: 'm14',
    kind: 'matrix',
    difficulty: 4,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '每行第 1、2 格方向相同，第 3 格与其相反（+180°）；行间起点逆时针 90°',
    cells: [
      one('arrow', 1, 'solid', 90), one('arrow', 1, 'solid', 90), one('arrow', 1, 'solid', 270),
      one('arrow', 1, 'solid', 0), one('arrow', 1, 'solid', 0), one('arrow', 1, 'solid', 180),
      one('arrow', 1, 'solid', 270), one('arrow', 1, 'solid', 270), null,
    ],
    options: [
      one('arrow', 1, 'solid', 270),
      one('arrow', 1, 'solid', 90),
      one('arrow', 1, 'solid', 180),
      one('arrow', 1, 'solid', 0),
      one('arrow', 1, 'solid', 45),
      one('arrow', 1, 'solid', 315),
    ],
    answerIndex: 1,
  },

  // m15（难度 4）：旋转 + 填充（中间列空心）
  {
    id: 'm15',
    kind: 'matrix',
    difficulty: 4,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '每格箭头顺时针 +90° 递增（行与列皆然）；中间一列箭头为空心，其余实心',
    cells: [
      one('arrow', 1, 'solid', 0), one('arrow', 1, 'hollow', 90), one('arrow', 1, 'solid', 180),
      one('arrow', 1, 'solid', 90), one('arrow', 1, 'hollow', 180), one('arrow', 1, 'solid', 270),
      one('arrow', 1, 'solid', 180), one('arrow', 1, 'hollow', 270), null,
    ],
    options: [
      one('arrow', 1, 'solid', 90),
      one('arrow', 1, 'solid', 270),
      one('arrow', 1, 'solid', 0),
      one('arrow', 1, 'solid', 180),
      one('arrow', 1, 'hollow', 0),
      one('arrow', 1, 'hollow', 180),
    ],
    answerIndex: 2,
  },

  // ===== 批 3：组合叠加 =====
  // m16（难度 5）：并集，各形状数量保持
  {
    id: 'm16',
    kind: 'matrix',
    difficulty: 5,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '每行第 3 格 = 前两格图形的并集（各自数量保持不变）',
    cells: [
      one('circle', 1), one('star', 1),
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'star', fill: 'solid', count: 1 }] },
      one('triangle', 2), one('diamond', 1),
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 2 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      one('square', 1), one('circle', 2), null,
    ],
    options: [
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 3 }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 2 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 2 }] },
      one('square', 1),
      { shapes: [{ kind: 'square', fill: 'hollow', count: 1 }, { kind: 'circle', fill: 'solid', count: 2 }] },
    ],
    answerIndex: 3,
  },

  // m17（难度 5）：并集，第 2 格形状在结果中变空心
  {
    id: 'm17',
    kind: 'matrix',
    difficulty: 5,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '每行第 3 格 = 第 1 格形状（实心）+ 第 2 格形状（空心）的并集',
    cells: [
      one('circle', 1), one('square', 1),
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'square', fill: 'hollow', count: 1 }] },
      one('star', 1), one('triangle', 1),
      { shapes: [{ kind: 'star', fill: 'solid', count: 1 }, { kind: 'triangle', fill: 'hollow', count: 1 }] },
      one('diamond', 1), one('star', 1), null,
    ],
    options: [
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 1 }, { kind: 'star', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'diamond', fill: 'hollow', count: 1 }, { kind: 'star', fill: 'solid', count: 1 }] },
      one('diamond', 1),
      one('star', 1, 'hollow'),
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 1 }, { kind: 'star', fill: 'hollow', count: 1 }] },
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 1 }, { kind: 'square', fill: 'hollow', count: 1 }] },
    ],
    answerIndex: 4,
  },

  // m18（难度 5）：并集，相同形状数量相加
  {
    id: 'm18',
    kind: 'matrix',
    difficulty: 5,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '每行第 3 格 = 前两格并集；同一形状数量相加',
    cells: [
      one('circle', 1),
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'star', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'circle', fill: 'solid', count: 2 }, { kind: 'star', fill: 'solid', count: 1 }] },
      one('square', 2), one('diamond', 1),
      { shapes: [{ kind: 'square', fill: 'solid', count: 2 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      one('star', 1),
      { shapes: [{ kind: 'star', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      null,
    ],
    options: [
      { shapes: [{ kind: 'star', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 3 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      one('star', 2),
      { shapes: [{ kind: 'star', fill: 'solid', count: 2 }, { kind: 'circle', fill: 'hollow', count: 1 }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 2 }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 2 }, { kind: 'circle', fill: 'solid', count: 1 }] },
    ],
    answerIndex: 5,
  },

  // m19（难度 6）：并集去重（保持首次出现顺序）
  {
    id: 'm19',
    kind: 'matrix',
    difficulty: 6,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '每行第 3 格 = 前两格图形的并集去重（重复形状只保留一次）',
    cells: [
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'star', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 1 }, { kind: 'square', fill: 'solid', count: 1 }] },
      { shapes: [
        { kind: 'circle', fill: 'solid', count: 1 },
        { kind: 'star', fill: 'solid', count: 1 },
        { kind: 'square', fill: 'solid', count: 1 },
      ] },
      one('diamond', 1),
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'triangle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      null,
    ],
    options: [
      { shapes: [
        { kind: 'square', fill: 'solid', count: 1 },
        { kind: 'triangle', fill: 'solid', count: 1 },
        { kind: 'circle', fill: 'solid', count: 1 },
      ] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'triangle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [
        { kind: 'square', fill: 'solid', count: 1 },
        { kind: 'triangle', fill: 'solid', count: 1 },
        { kind: 'circle', fill: 'solid', count: 2 },
      ] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'triangle', fill: 'solid', count: 1 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      { shapes: [
        { kind: 'square', fill: 'hollow', count: 1 },
        { kind: 'triangle', fill: 'solid', count: 1 },
        { kind: 'circle', fill: 'solid', count: 1 },
      ] },
    ],
    answerIndex: 0,
  },

  // m20（难度 6）：并集，同形状数量取较大者
  {
    id: 'm20',
    kind: 'matrix',
    difficulty: 6,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '每行第 3 格 = 前两格并集；同一形状数量取两者中较大者',
    cells: [
      one('circle', 3),
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'star', fill: 'solid', count: 2 }] },
      { shapes: [{ kind: 'circle', fill: 'solid', count: 3 }, { kind: 'star', fill: 'solid', count: 2 }] },
      one('square', 2), one('square', 4),
      one('square', 4),
      one('diamond', 2),
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 3 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      null,
    ],
    options: [
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 2 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 3 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 4 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      one('diamond', 3),
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 3 }, { kind: 'circle', fill: 'solid', count: 2 }] },
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 3 }, { kind: 'circle', fill: 'hollow', count: 1 }] },
    ],
    answerIndex: 1,
  },

  // m21（难度 6）：并集 + 第 1 格箭头顺时针 90°
  {
    id: 'm21',
    kind: 'matrix',
    difficulty: 6,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '每行第 3 格 = 第 1 格箭头顺时针旋转 90° 后与第 2 格形状的并集',
    cells: [
      one('arrow', 1, 'solid', 0), one('circle', 1),
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 90 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      one('arrow', 1, 'solid', 45), one('star', 1),
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 135 }, { kind: 'star', fill: 'solid', count: 1 }] },
      one('arrow', 1, 'solid', 90), one('diamond', 1), null,
    ],
    options: [
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 90 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 0 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 180 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 135 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      one('arrow', 1, 'solid', 180),
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 180 }, { kind: 'diamond', fill: 'hollow', count: 1 }] },
    ],
    answerIndex: 2,
  },

  // m22（难度 6）：并集 + 第 2 格形状数量翻倍
  {
    id: 'm22',
    kind: 'matrix',
    difficulty: 6,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '每行第 3 格 = 第 1 格形状 + 第 2 格形状（数量翻倍）的并集',
    cells: [
      one('circle', 1), one('star', 1),
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'star', fill: 'solid', count: 2 }] },
      one('triangle', 1), one('diamond', 2),
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 1 }, { kind: 'diamond', fill: 'solid', count: 4 }] },
      one('square', 1), one('circle', 1), null,
    ],
    options: [
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 3 }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 4 }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 2 }] },
      one('square', 1),
      { shapes: [{ kind: 'square', fill: 'hollow', count: 1 }, { kind: 'circle', fill: 'solid', count: 2 }] },
    ],
    answerIndex: 3,
  },

  // ===== 批 4：叠加消去 =====
  // m23（难度 7）：对称差（同时出现的图形抵消）
  {
    id: 'm23',
    kind: 'matrix',
    difficulty: 7,
    ageBands: ['12-16', 'adult'],
    rule: '每行前两格中「同时出现」的图形抵消，只保留各出现一次的图形（对称差）',
    cells: [
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 1 }, { kind: 'star', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 1 }, { kind: 'square', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 1 }, { kind: 'square', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 1 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 1 }, { kind: 'triangle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 1 }, { kind: 'square', fill: 'solid', count: 1 }] },
      null,
    ],
    options: [
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 1 }, { kind: 'square', fill: 'solid', count: 1 }] },
      { shapes: [
        { kind: 'star', fill: 'solid', count: 1 },
        { kind: 'square', fill: 'solid', count: 1 },
        { kind: 'triangle', fill: 'solid', count: 1 },
      ] },
      one('star', 1),
      one('square', 1),
      { shapes: [{ kind: 'star', fill: 'solid', count: 1 }, { kind: 'square', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'star', fill: 'hollow', count: 1 }, { kind: 'square', fill: 'solid', count: 1 }] },
    ],
    answerIndex: 4,
  },

  // m24（难度 7）：交集（只保留两格同时出现的图形）
  {
    id: 'm24',
    kind: 'matrix',
    difficulty: 7,
    ageBands: ['12-16', 'adult'],
    rule: '每行第 3 格只保留前两格「同时出现」的图形（交集，独有图形消去）',
    cells: [
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'star', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'square', fill: 'solid', count: 1 }] },
      one('circle', 1),
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 1 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 1 }, { kind: 'star', fill: 'solid', count: 1 }] },
      one('triangle', 1),
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      null,
    ],
    options: [
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      one('square', 1, 'hollow'),
      one('square', 2),
      one('square', 1),
    ],
    answerIndex: 5,
  },

  // m25（难度 7）：条件抵消（数量相同抵消，数量不同相加）
  {
    id: 'm25',
    kind: 'matrix',
    difficulty: 7,
    ageBands: ['12-16', 'adult'],
    rule: '前两格同一形状：数量相同则抵消；数量不同则数量相加保留',
    cells: [
      one('circle', 2),
      { shapes: [{ kind: 'circle', fill: 'solid', count: 2 }, { kind: 'star', fill: 'solid', count: 1 }] },
      one('star', 1),
      one('triangle', 3),
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 1 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 4 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 2 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 2 }, { kind: 'square', fill: 'solid', count: 1 }] },
      null,
    ],
    options: [
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'square', fill: 'solid', count: 1 }] },
      { shapes: [
        { kind: 'star', fill: 'solid', count: 2 },
        { kind: 'circle', fill: 'solid', count: 1 },
        { kind: 'square', fill: 'solid', count: 1 },
      ] },
      one('square', 1),
      one('circle', 1),
      { shapes: [{ kind: 'circle', fill: 'solid', count: 2 }, { kind: 'square', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'circle', fill: 'hollow', count: 1 }, { kind: 'square', fill: 'solid', count: 1 }] },
    ],
    answerIndex: 0,
  },

  // m26（难度 8）：对称差 + 结果统一空心
  {
    id: 'm26',
    kind: 'matrix',
    difficulty: 8,
    ageBands: ['12-16', 'adult'],
    rule: '前两格同时出现的图形抵消；保留的独有图形在结果中全部变空心',
    cells: [
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 1 }, { kind: 'star', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'triangle', fill: 'hollow', count: 1 }, { kind: 'circle', fill: 'hollow', count: 1 }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 1 }, { kind: 'diamond', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'diamond', fill: 'solid', count: 1 }, { kind: 'star', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'triangle', fill: 'hollow', count: 1 }, { kind: 'star', fill: 'hollow', count: 1 }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1 }, { kind: 'triangle', fill: 'solid', count: 1 }] },
      null,
    ],
    options: [
      { shapes: [{ kind: 'square', fill: 'solid', count: 1 }, { kind: 'triangle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'square', fill: 'hollow', count: 1 }, { kind: 'triangle', fill: 'hollow', count: 1 }] },
      { shapes: [{ kind: 'square', fill: 'hollow', count: 1 }, { kind: 'triangle', fill: 'solid', count: 1 }] },
      { shapes: [
        { kind: 'square', fill: 'hollow', count: 1 },
        { kind: 'triangle', fill: 'hollow', count: 1 },
        { kind: 'circle', fill: 'hollow', count: 1 },
      ] },
      one('square', 1, 'hollow'),
      { shapes: [{ kind: 'square', fill: 'hollow', count: 1 }, { kind: 'diamond', fill: 'hollow', count: 1 }] },
    ],
    answerIndex: 1,
  },

  // ===== 批 5：多规则复合（移动 + 数量 / 大小）=====
  // m27（难度 9）：star 对角线右移 + 数量复合
  {
    id: 'm27',
    kind: 'matrix',
    difficulty: 9,
    ageBands: ['12-16', 'adult'],
    rule: 'star 每行位置右移一格（行内 star 数量 = 行号；行号从 1 起计数）；各格基础形状数量 = 列号',
    cells: [
      { shapes: [{ kind: 'star', fill: 'solid', count: 1 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      one('circle', 2),
      one('circle', 3),
      one('square', 1),
      { shapes: [{ kind: 'star', fill: 'solid', count: 2 }, { kind: 'square', fill: 'solid', count: 2 }] },
      one('square', 3),
      one('triangle', 1),
      one('triangle', 2),
      null,
    ],
    options: [
      { shapes: [{ kind: 'star', fill: 'solid', count: 1 }, { kind: 'triangle', fill: 'solid', count: 3 }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 3 }, { kind: 'triangle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 3 }, { kind: 'triangle', fill: 'solid', count: 3 }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 2 }, { kind: 'triangle', fill: 'solid', count: 3 }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 3 }, { kind: 'triangle', fill: 'solid', count: 4 }] },
      { shapes: [{ kind: 'star', fill: 'hollow', count: 3 }, { kind: 'triangle', fill: 'solid', count: 3 }] },
    ],
    answerIndex: 2,
  },

  // m28（难度 10）：数量蛇形折返 + 大小棋盘交替 + 形状轮换
  {
    id: 'm28',
    kind: 'matrix',
    difficulty: 10,
    ageBands: ['12-16', 'adult'],
    rule: '数量沿行蛇形折返（1,2,3→3,2,1→1,2,3）；大小按「行+列」奇偶棋盘交替（偶小奇大）；每行形状轮换',
    cells: [
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1, size: 'small' }] },
      { shapes: [{ kind: 'circle', fill: 'solid', count: 2, size: 'large' }] },
      { shapes: [{ kind: 'circle', fill: 'solid', count: 3, size: 'small' }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 3, size: 'large' }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 2, size: 'small' }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1, size: 'large' }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 1, size: 'small' }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 2, size: 'large' }] },
      null,
    ],
    options: [
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 3, size: 'large' }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 2, size: 'small' }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 2, size: 'large' }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 3, size: 'small' }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 4, size: 'small' }] },
      { shapes: [{ kind: 'triangle', fill: 'hollow', count: 3, size: 'small' }] },
    ],
    answerIndex: 3,
  },

  // m29（难度 10）：star 反向对角线移动 + 数量 = 列号 + 大小按列交替
  {
    id: 'm29',
    kind: 'matrix',
    difficulty: 10,
    ageBands: ['12-16', 'adult'],
    rule: 'star 每行位置左移一格（从右上到左下，每格 1 个）；各格基础形状数量 = 列号；大小按列交替（列 1、3 大，列 2 小）',
    cells: [
      { shapes: [{ kind: 'circle', fill: 'solid', count: 1, size: 'large' }] },
      { shapes: [{ kind: 'circle', fill: 'solid', count: 2, size: 'small' }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 1, size: 'large' }, { kind: 'circle', fill: 'solid', count: 3, size: 'large' }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 1, size: 'large' }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 1, size: 'small' }, { kind: 'square', fill: 'solid', count: 2, size: 'small' }] },
      { shapes: [{ kind: 'square', fill: 'solid', count: 3, size: 'large' }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 1, size: 'large' }, { kind: 'triangle', fill: 'solid', count: 1, size: 'large' }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 2, size: 'small' }] },
      null,
    ],
    options: [
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 3, size: 'small' }] },
      { shapes: [{ kind: 'star', fill: 'solid', count: 1, size: 'large' }, { kind: 'triangle', fill: 'solid', count: 3, size: 'large' }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 2, size: 'large' }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 4, size: 'large' }] },
      { shapes: [{ kind: 'triangle', fill: 'solid', count: 3, size: 'large' }] },
      { shapes: [{ kind: 'triangle', fill: 'hollow', count: 3, size: 'large' }] },
    ],
    answerIndex: 4,
  },

  // ===== 批 6：序列题 =====
  // s01（难度 1）：数量 1、2 交替
  {
    id: 's01',
    kind: 'sequence',
    difficulty: 1,
    ageBands: ['6-8', '9-11'],
    rule: '图形数量按 1、2 交替',
    cells: [one('star', 1), one('star', 2), one('star', 1), one('star', 2), null],
    options: [
      one('star', 2),
      one('star', 3),
      one('star', 1, 'hollow'),
      one('circle', 2),
      one('diamond', 1),
      one('star', 1),
    ],
    answerIndex: 5,
  },

  // s02（难度 3）：数量山峰（先增后减）
  {
    id: 's02',
    kind: 'sequence',
    difficulty: 3,
    ageBands: ['6-8', '9-11'],
    rule: '图形数量先递增再递减（1,2,3,2→1）',
    cells: [one('star', 1), one('star', 2), one('star', 3), one('star', 2), null],
    options: [
      one('star', 1),
      one('star', 2),
      one('star', 3),
      one('star', 4),
      one('star', 1, 'hollow'),
      one('circle', 1),
    ],
    answerIndex: 0,
  },

  // s03（难度 3）：箭头每次顺时针 +45°
  {
    id: 's03',
    kind: 'sequence',
    difficulty: 3,
    ageBands: ['6-8', '9-11'],
    rule: '箭头每次顺时针旋转 45°',
    cells: [
      one('arrow', 1, 'solid', 0), one('arrow', 1, 'solid', 45),
      one('arrow', 1, 'solid', 90), one('arrow', 1, 'solid', 135), null,
    ],
    options: [
      one('arrow', 1, 'solid', 225),
      one('arrow', 1, 'solid', 180),
      one('arrow', 1, 'solid', 135),
      one('arrow', 1, 'solid', 90),
      one('arrow', 1, 'solid', 0),
      one('arrow', 1, 'hollow', 180),
    ],
    answerIndex: 1,
  },

  // s04（难度 3）：形状三循环 + 数量恒定
  {
    id: 's04',
    kind: 'sequence',
    difficulty: 3,
    ageBands: ['6-8', '9-11'],
    rule: '形状按 circle、square、triangle 循环，数量恒为 2',
    cells: [one('circle', 2), one('square', 2), one('triangle', 2), one('circle', 2), null],
    options: [
      one('circle', 2),
      one('triangle', 2),
      one('square', 2),
      one('square', 3),
      one('diamond', 2),
      one('square', 2, 'hollow'),
    ],
    answerIndex: 2,
  },

  // s05（难度 4）：形状循环 + 填充交替
  {
    id: 's05',
    kind: 'sequence',
    difficulty: 4,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '形状按 circle、square、triangle 循环；填充按实心、空心交替',
    cells: [
      one('circle', 1), one('square', 1, 'hollow'), one('triangle', 1),
      one('circle', 1, 'hollow'), null,
    ],
    options: [
      one('square', 1, 'hollow'),
      one('circle', 1),
      one('triangle', 1),
      one('square', 1),
      one('diamond', 1),
      one('circle', 1, 'hollow'),
    ],
    answerIndex: 3,
  },

  // s06（难度 4）：三格一组，组内数量 3→2→1
  {
    id: 's06',
    kind: 'sequence',
    difficulty: 4,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '每 3 格一组：组内数量 3→2→1 递减，组间更换形状',
    cells: [one('circle', 3), one('circle', 2), one('circle', 1), one('star', 3), null],
    options: [
      one('star', 1),
      one('star', 3),
      one('star', 4),
      one('circle', 2),
      one('star', 2),
      one('star', 2, 'hollow'),
    ],
    answerIndex: 4,
  },

  // s07（难度 5）：交错规律（奇数格箭头旋转、偶数格圆）
  {
    id: 's07',
    kind: 'sequence',
    difficulty: 5,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '奇数格为箭头且每次顺时针 +90°，偶数格固定为圆形',
    cells: [
      one('arrow', 1, 'solid', 0), one('circle', 1),
      one('arrow', 1, 'solid', 90), one('circle', 1), null,
    ],
    options: [
      one('arrow', 1, 'solid', 270),
      one('arrow', 1, 'solid', 90),
      one('arrow', 1, 'solid', 0),
      one('circle', 1),
      one('arrow', 1, 'hollow', 180),
      one('arrow', 1, 'solid', 180),
    ],
    answerIndex: 5,
  },

  // s08（难度 6）：箭头旋转 + 数量每两格 +1
  {
    id: 's08',
    kind: 'sequence',
    difficulty: 6,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '箭头每次 +45°；数量每两格递增一次（1,1,2,2→3）',
    cells: [
      one('arrow', 1, 'solid', 0), one('arrow', 1, 'solid', 45),
      one('arrow', 2, 'solid', 90), one('arrow', 2, 'solid', 135), null,
    ],
    options: [
      one('arrow', 3, 'solid', 180),
      one('arrow', 2, 'solid', 180),
      one('arrow', 3, 'solid', 225),
      one('arrow', 2, 'solid', 225),
      one('arrow', 4, 'solid', 180),
      one('arrow', 3, 'hollow', 180),
    ],
    answerIndex: 0,
  },

  // s09（难度 7）：箭头 +90° 回绕 + 填充交替
  {
    id: 's09',
    kind: 'sequence',
    difficulty: 7,
    ageBands: ['12-16', 'adult'],
    rule: '箭头每次顺时针 +90°（转满一圈回到起点）；填充实心、空心交替',
    cells: [
      one('arrow', 1, 'solid', 0), one('arrow', 1, 'hollow', 90),
      one('arrow', 1, 'solid', 180), one('arrow', 1, 'hollow', 270), null,
    ],
    options: [
      one('arrow', 1, 'hollow', 0),
      one('arrow', 1, 'solid', 0),
      one('arrow', 1, 'solid', 45),
      one('arrow', 1, 'solid', 90),
      one('arrow', 1, 'solid', 270),
      one('arrow', 1, 'solid', 315),
    ],
    answerIndex: 1,
  },

  // s10（难度 7）：形状三循环 + 数量 2、3 交替
  {
    id: 's10',
    kind: 'sequence',
    difficulty: 7,
    ageBands: ['12-16', 'adult'],
    rule: '形状按 circle、star、square 循环（周期 3）；数量按 2、3 交替',
    cells: [one('circle', 2), one('star', 3), one('square', 2), one('circle', 3), null],
    options: [
      one('star', 3),
      one('star', 4),
      one('star', 2),
      one('square', 2),
      one('circle', 3),
      one('star', 2, 'hollow'),
    ],
    answerIndex: 2,
  },

  // s11（难度 8）：箭头旋转 + 伴随圆数量交替
  {
    id: 's11',
    kind: 'sequence',
    difficulty: 8,
    ageBands: ['12-16', 'adult'],
    rule: '每格含箭头与圆：箭头每次 +45°；圆数量按 1、2 交替',
    cells: [
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 0 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 45 }, { kind: 'circle', fill: 'solid', count: 2 }] },
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 90 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 135 }, { kind: 'circle', fill: 'solid', count: 2 }] },
      null,
    ],
    options: [
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 180 }, { kind: 'circle', fill: 'solid', count: 2 }] },
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 225 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 135 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 180 }, { kind: 'circle', fill: 'solid', count: 1 }] },
      { shapes: [{ kind: 'arrow', fill: 'solid', count: 1, rotation: 90 }, { kind: 'circle', fill: 'solid', count: 2 }] },
      { shapes: [{ kind: 'arrow', fill: 'hollow', count: 1, rotation: 180 }, { kind: 'circle', fill: 'solid', count: 1 }] },
    ],
    answerIndex: 3,
  },

  // s12（难度 8）：数量山峰 + 形状交替
  {
    id: 's12',
    kind: 'sequence',
    difficulty: 8,
    ageBands: ['12-16', 'adult'],
    rule: '数量先增后减（2,3,4,3→2）；形状按 circle、star 交替',
    cells: [one('circle', 2), one('star', 3), one('circle', 4), one('star', 3), null],
    options: [
      one('star', 2),
      one('circle', 1),
      one('circle', 3),
      one('star', 4),
      one('circle', 2),
      one('circle', 2, 'hollow'),
    ],
    answerIndex: 4,
  },
];
