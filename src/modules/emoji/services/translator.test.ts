import {
  translate,
  renderTokens,
  displayChar,
  nextPick,
  splitGraphemes,
  type Dictionary,
} from './translator';

// 注入字典：与生产数据隔离的确定性单测
const testDict: Dictionary = {
  syllables: {
    ma: {
      exact: [
        { emoji: '🐴', label: '马' },
        { emoji: '👩', label: '妈' },
      ],
      similar: [{ emoji: '🤫', label: '嘛' }],
    },
    xin: { exact: [{ emoji: '❤️', label: '心' }], similar: [] },
    dia: { exact: [], similar: [] },
  },
  phrases: {
    马虎: ['🐴', '🐯'],
    马马虎虎: ['🐴', '🐴', '🐯', '🐯'],
  },
};

describe('短语匹配', () => {
  it('最长优先：马马虎虎命中 4 字条目而非两次 2 字条目', () => {
    const tokens = translate('马马虎虎', testDict);
    expect(tokens).toHaveLength(4);
    expect(renderTokens(tokens, 'exact')).toBe('🐴🐴🐯🐯');
  });

  it('短语命中：candidates[0] 为短语编排，其后接音节表候选，exactCount 正确', () => {
    const tokens = translate('马虎', testDict);
    expect(tokens[0].char).toBe('马');
    expect(tokens[0].candidates[0]).toBe('🐴');
    expect(tokens[0].candidates).toContain('👩'); // 「马」的音节表候选可切换
    expect(tokens[0].exactCount).toBe(2); // 短语编排 1 + exact 去重剩余 1
    expect(tokens[0].candidates).toEqual(['🐴', '👩', '🤫']);
  });
});

describe('候选与降级', () => {
  it('未命中短语：精确在前、近似在后', () => {
    const tokens = translate('马', testDict);
    expect(tokens[0].candidates).toEqual(['🐴', '👩', '🤫']);
    expect(tokens[0].exactCount).toBe(2);
  });

  it('表中无候选（空条目）：精确版显示原字，纯 emoji 版显示 ❓', () => {
    const tokens = translate('嗲', testDict); // 嗲 → dia，dia 为空条目
    expect(tokens[0].candidates).toEqual([]);
    expect(renderTokens(tokens, 'exact')).toBe('嗲');
    expect(renderTokens(tokens, 'emoji')).toBe('❓');
  });

  it('字库外汉字不导致后续字音节错位', () => {
    // 「龥」(U+9FA5) 在基本区内但 pinyin-pro 不识别（实测基本区共 49 个此类字）；
    // 若不防御，音节数组会与字符错位，导致「马」拿不到音节
    const tokens = translate('龥马', testDict);
    expect(tokens[0].candidates).toEqual([]); // 龥：无音节 → 无候选
    expect(tokens[1].candidates[0]).toBe('🐴'); // 马：仍正确取到 ma
  });

  it('标点/数字/英文原样保留（两版一致）', () => {
    const tokens = translate('马2go，', testDict);
    expect(renderTokens(tokens, 'exact')).toBe('🐴2go，');
    expect(renderTokens(tokens, 'emoji')).toBe('🐴2go，');
  });

  it('displayChar：手动选择优先于默认', () => {
    const tokens = translate('马', testDict);
    expect(displayChar(tokens[0], 'exact', 1)).toBe('👩');
    expect(displayChar(tokens[0], 'emoji', 2)).toBe('🤫');
  });

  it('越界或非整数 pick 回落到默认渲染', () => {
    const tokens = translate('马', testDict);
    expect(displayChar(tokens[0], 'exact', -1)).toBe('🐴');
    expect(displayChar(tokens[0], 'exact', 99)).toBe('🐴');
    expect(displayChar(tokens[0], 'exact', 1.5)).toBe('🐴');
  });

  it('similar 候选在纯 emoji 版参与默认渲染（无 exact 时）', () => {
    const dict: Dictionary = {
      syllables: { zhu: { exact: [], similar: [{ emoji: '🍚', label: '粥' }] } },
      phrases: {},
    };
    const tokens = translate('竹', dict);
    expect(renderTokens(tokens, 'exact')).toBe('竹');
    expect(renderTokens(tokens, 'emoji')).toBe('🍚');
  });

  it('空串与纯标点', () => {
    expect(translate('', testDict)).toEqual([]);
    const punct = translate('。，！', testDict);
    expect(renderTokens(punct, 'exact')).toBe('。，！');
    expect(renderTokens(punct, 'emoji')).toBe('。，！');
  });

  it('CRLF 换行归一化为 LF', () => {
    const tokens = translate('马\r\n虎', testDict);
    expect(tokens).toHaveLength(3);
    expect(tokens[1].char).toBe('\n');
  });

  it('非对齐模式下短语仍正确命中', () => {
    // 「龥」使音节数与汉字数失配，触发逐字回退；短语匹配不受影响
    const tokens = translate('龥马虎', testDict);
    expect(tokens[0].candidates).toEqual([]); // 龥：无候选
    expect(tokens[1].candidates[0]).toBe('🐴'); // 马：短语编排
    expect(tokens[2].candidates[0]).toBe('🐯'); // 虎：短语编排
  });

  it('similar 中的短语 emoji 会被去重', () => {
    const dict: Dictionary = {
      syllables: { xin: { exact: [], similar: [{ emoji: '💗', label: '心' }] } },
      phrases: { 心心: ['💗', '💗'] },
    };
    const tokens = translate('心心', dict);
    expect(tokens[0].candidates).toEqual(['💗']); // similar 中的 💗 被去重
    expect(tokens[0].exactCount).toBe(1);
  });
});

describe('nextPick 点按换候选', () => {
  it('默认态出发：精确版从第一个精确候选切到下一个', () => {
    const tokens = translate('马', testDict); // candidates = [🐴,👩,🤫]
    expect(nextPick(tokens[0], 'exact', undefined)).toBe(1);
    expect(nextPick(tokens[0], 'exact', 1)).toBe(2);
    expect(nextPick(tokens[0], 'exact', 2)).toBe(0); // 环绕
  });

  it('无精确候选时：精确版从「原字」出发切到第一个候选', () => {
    const token = { char: '竹', type: 'hanzi' as const, candidates: ['🍚'], exactCount: 0 };
    expect(nextPick(token, 'exact', undefined)).toBe(0);
  });

  it('纯 emoji 模式下默认态切到下一个候选', () => {
    const tokens = translate('马', testDict); // candidates = [🐴,👩,🤫]
    expect(nextPick(tokens[0], 'emoji', undefined)).toBe(1);
    expect(nextPick(tokens[0], 'emoji', 2)).toBe(0);
  });

  it('无候选与负数输入安全（不越界）', () => {
    const empty = { char: 'x', type: 'hanzi' as const, candidates: [], exactCount: 0 };
    expect(nextPick(empty, 'exact', undefined)).toBe(0);
    const tokens = translate('马', testDict);
    const neg = nextPick(tokens[0], 'exact', -2);
    expect(neg).toBeGreaterThanOrEqual(0);
    expect(neg).toBeLessThan(tokens[0].candidates.length);
  });
});

describe('splitGraphemes', () => {
  it('普通汉字逐字切分', () => {
    expect(splitGraphemes('青梅竹马')).toEqual(['青', '梅', '竹', '马']);
  });

  it('ZWJ 序列不拆分', () => {
    /* 用码点构造：emoji 字面量在文本传递中可能丢失 ZWJ U+200D */
    const zwj = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    expect(splitGraphemes(zwj)).toEqual([zwj]);
  });

  it('变体选择符与肤色修饰符并入前一个字符', () => {
    expect(splitGraphemes('🤔️')).toEqual(['🤔️']);
    expect(splitGraphemes('🤘🏼')).toEqual(['🤘🏼']);
  });

  it('键帽、国旗（RI 对）、标签序列均合为一簇', () => {
    expect(splitGraphemes('8\uFE0F\u20E3')).toEqual(['8\uFE0F\u20E3']);
    const flag = String.fromCodePoint(0x1f1e8, 0x1f1f3); // CN 国旗
    expect(splitGraphemes(flag)).toEqual([flag]);
    const tagFlag = String.fromCodePoint(
      0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f,
    );
    expect(splitGraphemes(tagFlag)).toEqual([tagFlag]);
  });
});

describe('黄金用例（生产词库）', () => {
  const GOLDEN: [string, string][] = [
    ['青梅竹马', '🍏🌹🐷🐴'],
    ['喜上眉梢', '😄👆🌹🔥'],
    ['鸡飞蛋打', '🐔✈️🥚🔨'],
    ['七嘴八舌', '🎈👄👈🐍'],
    ['对牛弹琴', '✅🐂🤘🏼🎹'],
    ['蒸蒸日上', '♨️♨️🌞👆'],
    ['彬彬有礼', '🧊🧊🈶🎁'],
    ['走马观花', '🚶🐴👀🌸'],
    ['余音绕梁', '🐠🎵♻️🍚'],
    ['画蛇添足', '🎨🐍☁️🦶'],
    ['鸟语花香', '🐦🌧️🌼🤔️'],
    ['珠光宝气', '🐷☀️💎🎈'],
    ['男女老少', '👨👩🧓🧒'],
    ['狗急跳墙', '🐶🐔🪂🧱'],
  ];

  it.each(GOLDEN)('精确版渲染 %s', (text, expected) => {
    expect(renderTokens(translate(text), 'exact')).toBe(expected);
  });

  it('诗句：所有汉字有候选、标点保留', () => {
    const tokens = translate('床前明月光，疑是地上霜。');
    expect(
      tokens.filter((t) => t.type === 'hanzi').every((t) => t.candidates.length > 0),
    ).toBe(true);
    const rendered = renderTokens(tokens, 'exact');
    expect(rendered).toContain('，');
    expect(rendered).toContain('。');
    expect(rendered).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
