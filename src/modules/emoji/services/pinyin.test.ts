import { getSyllables } from './pinyin';

describe('getSyllables', () => {
  it('基础：逐字返回无调音节', () => {
    expect(getSyllables('青梅竹马')).toEqual(['qing', 'mei', 'zhu', 'ma']);
  });

  it('多音字按上下文判断', () => {
    expect(getSyllables('长大')).toEqual(['zhang', 'da']);
    expect(getSyllables('银行')).toEqual(['yin', 'hang']);
    expect(getSyllables('音乐')).toEqual(['yin', 'yue']);
    expect(getSyllables('重庆')).toEqual(['chong', 'qing']);
  });

  it('ü 系音节写作 lü/nü/lüe', () => {
    expect(getSyllables('绿色')).toEqual(['lü', 'se']);
    expect(getSyllables('女人')).toEqual(['nü', 'ren']);
    expect(getSyllables('省略')).toEqual(['sheng', 'lüe']);
  });

  it('非汉字被移除，数组长度等于文本中汉字数', () => {
    expect(getSyllables('我爱，你！')).toEqual(['wo', 'ai', 'ni']);
    expect(getSyllables('2024年快乐')).toEqual(['nian', 'kuai', 'le']);
    expect(getSyllables('床前明月光\n疑是地上霜')).toEqual([
      'chuang', 'qian', 'ming', 'yue', 'guang', 'yi', 'shi', 'di', 'shang', 'shuang',
    ]);
    expect(getSyllables('hello')).toEqual([]);
    expect(getSyllables('')).toEqual([]);
  });

  it('生僻字也能得到音节', () => {
    expect(getSyllables('龘')).toEqual(['da']);
    expect(getSyllables('嗲')).toEqual(['dia']);
  });
});
