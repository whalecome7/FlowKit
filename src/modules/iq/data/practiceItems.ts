import type { MatrixItem, MemoryTrial, VerbalItem } from '../types';
import { one } from './matrixItems';

/** 各维度练习题目（不计分）：答错给提示可重来，训练操作方式用。 */

/** 图形推理练习 2 题（专业版用 2 题、轻量版用第 1 题） */
export const PRACTICE_MATRIX: MatrixItem[] = [
  {
    id: 'prac-m1',
    kind: 'matrix',
    difficulty: 1,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '每列从上到下「圆 → 方 → 三角」循环',
    cells: [
      one('circle', 1), one('square', 1), one('triangle', 1),
      one('square', 1), one('triangle', 1), one('circle', 1),
      one('triangle', 1), one('circle', 1), null,
    ],
    options: [
      one('square', 1), one('circle', 1), one('triangle', 1),
      one('diamond', 1), one('star', 1), one('square', 1, 'hollow'),
    ],
    answerIndex: 0,
  },
  {
    id: 'prac-m2',
    kind: 'sequence',
    difficulty: 1,
    ageBands: ['6-8', '9-11', '12-16', 'adult'],
    rule: '● 与 ■ 交替出现',
    cells: [one('circle', 1), one('square', 1), one('circle', 1), one('square', 1), null],
    options: [
      one('circle', 1), one('square', 1), one('triangle', 1),
      one('circle', 2), one('star', 1), one('diamond', 1),
    ],
    answerIndex: 0,
  },
];

/** 言语类比练习 1 题 */
export const PRACTICE_VERBAL: VerbalItem = {
  id: 'prac-v1',
  difficulty: 1,
  ageBands: ['6-8', '9-11', '12-16', 'adult'],
  relation: 'antonym',
  a: '白天',
  b: '太阳',
  c: '夜晚',
  options: ['月亮', '星星', '灯光', '云朵'],
  answerIndex: 0,
};

/** 数字记忆练习 1 试（顺背 2 位，最容易，先让受试者理解流程） */
export const PRACTICE_MEMORY: MemoryTrial = {
  id: 'prac-mem1',
  mode: 'forward',
  length: 2,
  digits: [3, 6],
};
