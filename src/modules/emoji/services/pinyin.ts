import { pinyin } from 'pinyin-pro';

/**
 * 逐字取无调音节：返回数组与文本中「汉字」按序一一对应。
 * nonZh: 'removed' 保证非汉字（标点/数字/英文/空白）不占位。
 * ü 系音节输出 lü/nü/lüe，音节表键的写法须与此一致。
 */
export function getSyllables(text: string): string[] {
  return pinyin(text, {
    type: 'array',
    toneType: 'none',
    nonZh: 'removed',
  });
}
