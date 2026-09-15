import type { AgeBand, Dimension, TestMode } from '../types';

export const MODE_LABELS: Record<TestMode, string> = {
  pro: '专业模拟版',
  light: '轻量趣味版',
};

export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  '6-8': '6–8 岁',
  '9-11': '9–11 岁',
  '12-16': '12–16 岁',
  adult: '17 岁及以上',
};

export const SECTION_LABELS: Record<Dimension, string> = {
  fluid: '图形推理',
  verbal: '言语类比',
  memory: '数字记忆',
  speed: '符号检索',
};

export const PRACTICE_TIPS: Record<Dimension, string> = {
  fluid: '从六个选项中选出能填入问号处的图形（练习不计分）',
  verbal: '选出与前两个词关系一致的一项（练习不计分）',
  memory: '按顺序点出刚才闪过的数字；倒背时请倒着点。（练习不计分）',
  speed: '',
};

/** 言语题朗读 / 题干文案（TTS 与视觉共用） */
export function buildVerbalPrompt(a: string, b: string, c: string): string {
  return `${a} 对于 ${b}，相当于 ${c} 对于什么？`;
}

const DIMENSION_LEVELS: Record<Dimension, [string, string, string]> = {
  fluid: [
    '图形规律推理相对偏弱，可多尝试拼图、积木类活动。',
    '图形规律推理处于中等水平，能稳定发现常见规律。',
    '图形规律推理表现突出，对抽象规律的把握很快。',
  ],
  verbal: [
    '词语关系理解相对偏弱，日常阅读与表达可多加练习。',
    '词语关系理解处于中等水平。',
    '词语关系理解表现突出，语言类推能力强。',
  ],
  memory: [
    '短时记忆容量相对偏小，可从复述数字等小游戏练起。',
    '短时记忆处于中等水平。',
    '短时记忆容量突出，抗干扰能力强。',
  ],
  speed: [
    '处理速度相对偏慢，优先保证准确率即可。',
    '处理速度处于中等水平。',
    '处理速度快，视觉搜索效率高。',
  ],
};

/** 维度解读：指数 <85 偏低 / 85–114 中等 / ≥115 较高 */
export function dimensionComment(dim: Dimension, index: number): string {
  const level = index >= 115 ? 2 : index >= 85 ? 1 : 0;
  return DIMENSION_LEVELS[dim][level];
}

export function totalComment(estimate: number): string {
  if (estimate >= 125) return '整体认知能力表现突出，各维度发挥良好。';
  if (estimate >= 110) return '整体认知能力高于平均，发挥稳定。';
  if (estimate >= 90) return '整体认知能力处于普遍水平。';
  if (estimate >= 75) return '整体认知能力略低于平均，建议在状态好时复测。';
  return '本次发挥低于平均水平，休息后可再测一次；如持续如此可咨询专业人士。';
}

/** 轻量版星级评语 */
export const STAR_SUMMARIES: Record<number, string> = {
  1: '再试一次，或许会有惊喜。',
  2: '不错的开始，图形规律可以再多观察一会儿。',
  3: '表现稳健，观察与反应比较均衡。',
  4: '反应敏捷，规律识别能力很强。',
  5: '又快又准，观察力与反应速度俱佳！',
};

export const DISCLAIMER_ADULT =
  '本结果为认知能力自测参考，非医学诊断，不能替代专业心理评估。';
export const DISCLAIMER_CHILD =
  '儿童认知发展受多种因素影响，本结果仅供家长参考，不构成发育评估或诊断；如有需要请咨询儿童保健科或发育行为儿科。';
export const CHILD_BAND_TIP = '建议家长陪同：可以帮孩子读题，但不要提示答案。';
export const HOME_NOTE =
  '题目为原创自研，参考临床测验的维度结构与题型范式设计；结果区间为设计标定估算，非实测常模。';
