# emoji 翻译器实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 FlowKit 新增「emoji 翻译器」模块：输入中文文本逐字转为谐音/意象 emoji（精确版 / 纯 emoji 版双版本输出），支持单字候选切换与历史记录，完全离线。

**Architecture:** 两层静态词库（约 400 音节表 + 300~500 条短语库，JSON 打包资源）+ pinyin-pro 逐字取无调音节；`translator.ts` 纯函数核心（Token 化 + 双版本渲染）；Zustand 管状态，AsyncStorage 存历史。

**Tech Stack:** React Native 0.86、TypeScript strict、Zustand、AsyncStorage、pinyin-pro 3.x、Jest。

参考设计：`docs/superpowers/specs/2026-09-11-emoji-translator-design.md`

---

## 前置说明（执行者必读）

### 已验证的技术事实（勿重复验证）

1. `pinyin-pro`（3.29.3）为纯 JS CJS 包：无原生依赖、无 lookbehind、无 TextEncoder/fs 依赖，Jest 与 Metro 可直接使用，**无需修改 jest.config.js**；自带 TS 类型。
2. `pinyin(text, { type: 'array', toneType: 'none', nonZh: 'removed' })` 实测行为：
   - 返回数组，**每个汉字一个无调音节**，非汉字（标点/数字/英文/空白）全部移除
   - 多音字按上下文判断：`长大→['zhang','da']`、`银行→['yin','hang']`、`音乐→['yin','yue']`
   - ü 系音节写作 `lü`/`nü`/`lüe`（音节表键必须同写法）
   - 生僻字也有拼音：`龘→['da']`、`嗲→['dia']`；单字多音字取最常见读音（`长→['chang']`）
3. RN 0.86 仍内置 `Clipboard`（`import { Clipboard } from 'react-native'`，有 deprecation 警告但可用，`Clipboard.setString()` 同步）。**本项目不新增剪贴板依赖。**
4. Node 26 的 `new TextDecoder('gb2312')` 可用（Task 4 工具脚本用）。
5. 命令：单测 `npx jest <路径>`、全量 `npm test`、类型检查 `npx tsc --noEmit`。

### 项目约定

- 全部中文注释与提交信息；提交风格 `feat: ...` / `fix: ...`
- 模块目录遵循 AGENTS.md：`src/modules/emoji/{index,types,data,services,store,screens,components}`
- 测试与源码同目录 `*.test.ts`
- UI 用 `useTheme()` 的 `colors`（`src/theme`），样式模式参照 `src/modules/reaction/screens/ReactionHome.tsx`
- UI 组件测试用 `react-test-renderer`（参考 `__tests__/App.test.tsx`）

### 数据与测试的编码注意

- 计划中的 emoji 字面量请**在同一会话内复制粘贴**（保证码点一致）；若某条黄金用例失败但肉眼一致，用 `[...str]` 打印码点对比后校准。
- 短语库 JSON 的每个 emoji 是数组的一个元素（ZWJ 序列不拆分）。

## 任务总览

| # | 任务 | 产出 |
|---|------|------|
| 1 | 依赖与拼音封装 | `services/pinyin.ts` + 测试 |
| 2 | 类型与词库种子 | `types/index.ts`；`data/*.json`（种子）；`dictData.test.ts` |
| 3 | 转化核心 | `services/translator.ts` + 测试（黄金 14 例） |
| 4 | 音节表全量 | 扩充 `data/syllables.json` 至约 400 音节 |
| 5 | 短语库扩充 | 扩充 `data/phrases.json` 至 300~500 条 |
| 6 | 历史存储 | `services/historyStorage.ts` + 测试 |
| 7 | 状态管理 | `store/index.ts` + 测试 |
| 8 | 主页 UI | `components/EmojiResultView.tsx`、`screens/EmojiTranslatorScreen.tsx` |
| 9 | 历史页 UI | `screens/EmojiHistoryScreen.tsx` |
| 10 | 接线与验收 | `index.ts`、`App.tsx`、类型检查、全量测试、真机验收 |

---

## Task 1: 依赖安装与拼音封装

**Files:**
- Modify: `package.json`、`yarn.lock`（yarn add 自动）
- Create: `src/modules/emoji/services/pinyin.ts`
- Test: `src/modules/emoji/services/pinyin.test.ts`

- [ ] **Step 1: 安装 pinyin-pro**

```bash
yarn add pinyin-pro
```

预期：`package.json` dependencies 出现 `"pinyin-pro": "^3.29.3"`（版本以实际为准）。

- [ ] **Step 2: 写失败测试**

创建 `src/modules/emoji/services/pinyin.test.ts`：

```ts
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
    expect(getSyllables('床前明月光\n疑是地上霜')).toHaveLength(10);
    expect(getSyllables('hello')).toEqual([]);
    expect(getSyllables('')).toEqual([]);
  });

  it('生僻字也能得到音节', () => {
    expect(getSyllables('龘')).toEqual(['da']);
    expect(getSyllables('嗲')).toEqual(['dia']);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
npx jest src/modules/emoji/services/pinyin.test.ts
```

预期：FAIL，`Cannot find module './pinyin'`。

- [ ] **Step 4: 实现 pinyin.ts**

创建 `src/modules/emoji/services/pinyin.ts`：

```ts
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
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npx jest src/modules/emoji/services/pinyin.test.ts
```

预期：PASS（5 个用例全绿）。

- [ ] **Step 6: 提交**

```bash
git add package.json yarn.lock src/modules/emoji/services/pinyin.ts src/modules/emoji/services/pinyin.test.ts
git commit -m "feat: emoji 模块安装 pinyin-pro 并封装音节提取"
```

---

## Task 2: 类型定义与词库种子

**Files:**
- Create: `src/modules/emoji/types/index.ts`
- Create: `src/modules/emoji/data/syllables.json`
- Create: `src/modules/emoji/data/phrases.json`
- Test: `src/modules/emoji/services/dictData.test.ts`

- [ ] **Step 1: 写失败测试（词库结构校验）**

创建 `src/modules/emoji/services/dictData.test.ts`：

```ts
import syllables from '../data/syllables.json';
import phrases from '../data/phrases.json';
import { getSyllables } from './pinyin';
import type { SyllableEntry } from '../types';

// 单个 emoji：Extended_Pictographic 起始（可含 ZWJ 链、变体选择符、肤色修饰符），
// 或数字/符号键帽序列（如 8️⃣ = '8' + FE0F + 20E3）
const EMOJI_RE =
  /^(\p{Extended_Pictographic}(\u200d\p{Extended_Pictographic})*[\uFE0F\p{Emoji_Modifier}]*|[0-9#*]\uFE0F?\u20E3)$/u;
const HANZI_RE = /^[\u4e00-\u9fff]+$/;
const SYLLABLE_RE = /^[a-zü]+$/;

const entries = Object.entries(syllables) as [string, SyllableEntry][];

describe('音节表结构', () => {
  it('音节键为合法无调拼音', () => {
    for (const [key] of entries) {
      expect(key).toMatch(SYLLABLE_RE);
    }
  });

  it('候选 emoji 合法、label 非空、同音节内无重复', () => {
    for (const [, entry] of entries) {
      expect(Array.isArray(entry.exact)).toBe(true);
      expect(Array.isArray(entry.similar)).toBe(true);
      const all = [...entry.exact, ...entry.similar];
      for (const c of all) {
        expect(EMOJI_RE.test(c.emoji)).toBe(true);
        expect(c.label.length).toBeGreaterThan(0);
      }
      const emojis = all.map((c) => c.emoji);
      expect(new Set(emojis).size).toBe(emojis.length);
    }
  });
});

describe('短语库结构', () => {
  const phraseEntries = Object.entries(phrases) as [string, string[]][];

  it('文本为纯汉字，emoji 数组与文字逐字对应', () => {
    for (const [text, emojis] of phraseEntries) {
      expect(text).toMatch(HANZI_RE);
      expect(Array.isArray(emojis)).toBe(true);
      expect(emojis).toHaveLength(Array.from(text).length);
      for (const e of emojis) {
        expect(EMOJI_RE.test(e)).toBe(true);
      }
    }
  });

  it('短语包含的汉字在音节表中都有键', () => {
    for (const [text] of phraseEntries) {
      for (const syllable of getSyllables(text)) {
        expect(syllables).toHaveProperty(syllable);
      }
    }
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx jest src/modules/emoji/services/dictData.test.ts
```

预期：FAIL，`Cannot find module '../data/syllables.json'`。

- [ ] **Step 3: 写类型定义**

创建 `src/modules/emoji/types/index.ts`：

```ts
/** 单个 emoji 候选 */
export interface EmojiCandidate {
  emoji: string;
  /** 所选谐音/意象字或理由（仅数据维护参考，运行时不使用） */
  label: string;
}

/** 音节表条目（键为无调拼音，ü 写作 lü/nü/lüe） */
export interface SyllableEntry {
  /** 精确（同音）候选，有序，第一个为默认；可为空数组（冷门音节无合适 emoji） */
  exact: EmojiCandidate[];
  /** 近似音候选（平翘舌/前后鼻音/n-l/f-h 等口音变体），纯 emoji 版兜底用 */
  similar: EmojiCandidate[];
}

/** 短语库：emoji 数组与文字逐字对应（长度等于字符数） */
export type PhraseEntry = string[];

/** 转化结果中的单个字符位 */
export interface Token {
  char: string;
  type: 'hanzi' | 'other';
  /** 候选 emoji，精确在前近似在后；空数组表示无候选（走降级） */
  candidates: string[];
  /** candidates 中前 exactCount 个为精确候选（短语编排计为 1 个精确候选） */
  exactCount: number;
}

export type RenderMode = 'exact' | 'emoji';

/** 生成历史 */
export interface HistoryItem {
  id: string;
  text: string;
  createdAt: number;
}

/** 输入长度上限（超出不生成） */
export const MAX_INPUT_LENGTH = 200;
```

- [ ] **Step 4: 写词库种子数据**

创建 `src/modules/emoji/data/syllables.json`（覆盖黄金 14 例与测试诗句的全部音节，Task 4 会扩充到全量）：

```json
{
  "ba": { "exact": [{ "emoji": "8️⃣", "label": "八" }], "similar": [] },
  "bao": { "exact": [{ "emoji": "💎", "label": "宝" }, { "emoji": "👜", "label": "包" }, { "emoji": "📰", "label": "报" }], "similar": [] },
  "bin": { "exact": [{ "emoji": "🧊", "label": "彬（借冰 bīng 近音）" }], "similar": [] },
  "chuang": { "exact": [{ "emoji": "🛏️", "label": "床" }, { "emoji": "🪟", "label": "窗" }], "similar": [] },
  "da": { "exact": [{ "emoji": "🔨", "label": "打" }, { "emoji": "🐘", "label": "大（大象）" }], "similar": [] },
  "dan": { "exact": [{ "emoji": "🥚", "label": "蛋" }, { "emoji": "🎫", "label": "单" }], "similar": [] },
  "di": { "exact": [{ "emoji": "🌍", "label": "地" }, { "emoji": "👦", "label": "弟" }], "similar": [] },
  "dui": { "exact": [{ "emoji": "✅", "label": "对（对勾意象）" }], "similar": [] },
  "fei": { "exact": [{ "emoji": "✈️", "label": "飞" }, { "emoji": "💰", "label": "费" }], "similar": [] },
  "gou": { "exact": [{ "emoji": "🐶", "label": "狗" }, { "emoji": "🛒", "label": "购" }], "similar": [] },
  "guan": { "exact": [{ "emoji": "👀", "label": "观" }, { "emoji": "🏛️", "label": "馆" }], "similar": [] },
  "guang": { "exact": [{ "emoji": "✨", "label": "光" }], "similar": [] },
  "hang": { "exact": [{ "emoji": "🏦", "label": "行（银行）" }], "similar": [] },
  "hua": { "exact": [{ "emoji": "🌸", "label": "花" }, { "emoji": "🎨", "label": "画" }, { "emoji": "🗣️", "label": "话" }], "similar": [] },
  "ji": { "exact": [{ "emoji": "🐔", "label": "鸡" }, { "emoji": "⚡", "label": "急" }, { "emoji": "📝", "label": "记" }], "similar": [] },
  "lao": { "exact": [{ "emoji": "🧓", "label": "老" }], "similar": [] },
  "li": { "exact": [{ "emoji": "🎁", "label": "礼" }, { "emoji": "🍐", "label": "梨" }], "similar": [] },
  "liang": { "exact": [{ "emoji": "💡", "label": "亮" }, { "emoji": "🍚", "label": "粮" }, { "emoji": "🌉", "label": "梁（桥梁）" }], "similar": [] },
  "ma": { "exact": [{ "emoji": "🐴", "label": "马" }, { "emoji": "👩", "label": "妈" }], "similar": [] },
  "mei": { "exact": [{ "emoji": "🌹", "label": "梅/眉/玫" }, { "emoji": "🫐", "label": "莓" }, { "emoji": "😍", "label": "美" }], "similar": [] },
  "ming": { "exact": [{ "emoji": "☀️", "label": "明（明亮）" }], "similar": [] },
  "nan": { "exact": [{ "emoji": "👨", "label": "男" }, { "emoji": "😫", "label": "难" }], "similar": [] },
  "niao": { "exact": [{ "emoji": "🐦", "label": "鸟" }], "similar": [] },
  "niu": { "exact": [{ "emoji": "🐂", "label": "牛" }], "similar": [] },
  "nü": { "exact": [{ "emoji": "👩", "label": "女" }], "similar": [] },
  "qi": { "exact": [{ "emoji": "🎈", "label": "气（气球）" }, { "emoji": "7️⃣", "label": "七" }, { "emoji": "🚗", "label": "汽" }], "similar": [] },
  "qian": { "exact": [{ "emoji": "💰", "label": "钱" }, { "emoji": "⬅️", "label": "前（向前）" }], "similar": [] },
  "qiang": { "exact": [{ "emoji": "🧱", "label": "墙" }, { "emoji": "💪", "label": "强" }], "similar": [] },
  "qin": { "exact": [{ "emoji": "🎹", "label": "琴" }, { "emoji": "👪", "label": "亲" }], "similar": [] },
  "qing": { "exact": [{ "emoji": "🍏", "label": "青（青苹果）" }, { "emoji": "🧊", "label": "清" }, { "emoji": "☀️", "label": "晴" }, { "emoji": "🎉", "label": "庆" }], "similar": [] },
  "rao": { "exact": [{ "emoji": "♻️", "label": "绕（循环）" }], "similar": [] },
  "ri": { "exact": [{ "emoji": "🌞", "label": "日" }, { "emoji": "📅", "label": "日（日期）" }], "similar": [] },
  "shang": { "exact": [{ "emoji": "👆", "label": "上（向上指）" }, { "emoji": "🏪", "label": "商（商店）" }], "similar": [] },
  "shao": { "exact": [{ "emoji": "🔥", "label": "烧（借梢近音）" }, { "emoji": "🥄", "label": "勺" }], "similar": [] },
  "she": { "exact": [{ "emoji": "🐍", "label": "蛇" }, { "emoji": "👅", "label": "舌" }], "similar": [] },
  "shi": { "exact": [{ "emoji": "🔟", "label": "十" }, { "emoji": "🦁", "label": "狮" }, { "emoji": "🕐", "label": "时" }], "similar": [] },
  "shuang": { "exact": [{ "emoji": "❄️", "label": "霜（雪霜）" }, { "emoji": "👯", "label": "双" }], "similar": [] },
  "tan": { "exact": [{ "emoji": "🤘🏼", "label": "弹（摇滚手势）" }], "similar": [] },
  "tian": { "exact": [{ "emoji": "🌤️", "label": "天" }, { "emoji": "➕", "label": "添" }], "similar": [] },
  "tiao": { "exact": [{ "emoji": "🪂", "label": "跳（跳伞）" }], "similar": [] },
  "xi": { "exact": [{ "emoji": "😄", "label": "喜" }, { "emoji": "🧼", "label": "洗" }], "similar": [] },
  "xiang": { "exact": [{ "emoji": "🤔", "label": "想/香" }, { "emoji": "🐘", "label": "象" }], "similar": [] },
  "yin": { "exact": [{ "emoji": "🎵", "label": "音" }, { "emoji": "🥈", "label": "银" }, { "emoji": "☁️", "label": "阴" }], "similar": [] },
  "yi": { "exact": [{ "emoji": "1️⃣", "label": "一" }, { "emoji": "👕", "label": "衣" }, { "emoji": "🏥", "label": "医" }], "similar": [] },
  "you": { "exact": [{ "emoji": "🈶", "label": "有" }, { "emoji": "🛢️", "label": "油" }], "similar": [] },
  "yu": { "exact": [{ "emoji": "🐟", "label": "鱼/余" }, { "emoji": "🌧️", "label": "雨" }, { "emoji": "💬", "label": "语" }], "similar": [] },
  "yue": { "exact": [{ "emoji": "🌙", "label": "月" }, { "emoji": "🎵", "label": "乐（音乐）" }, { "emoji": "🤝", "label": "约" }], "similar": [] },
  "zhang": { "exact": [{ "emoji": "📏", "label": "长（长度）" }, { "emoji": "📖", "label": "章" }], "similar": [] },
  "zheng": { "exact": [{ "emoji": "♨️", "label": "蒸" }, { "emoji": "📏", "label": "正" }], "similar": [] },
  "zhu": { "exact": [{ "emoji": "🐷", "label": "猪" }, { "emoji": "🎋", "label": "竹" }], "similar": [{ "emoji": "🍚", "label": "粥（zhu↔zhou 近音）" }] },
  "zou": { "exact": [{ "emoji": "🚶", "label": "走" }], "similar": [] },
  "zu": { "exact": [{ "emoji": "🦶", "label": "足" }], "similar": [] },
  "zui": { "exact": [{ "emoji": "👄", "label": "嘴" }, { "emoji": "🍺", "label": "醉" }], "similar": [] }
}
```

创建 `src/modules/emoji/data/phrases.json`（黄金 14 例，与用户示例逐字一致；**此文件是质量锚点，任何任务不得改动这些条目**）：

```json
{
  "青梅竹马": ["🍏", "🌹", "🐷", "🐴"],
  "喜上眉梢": ["😄", "👆", "🌹", "🔥"],
  "鸡飞蛋打": ["🐔", "✈️", "🥚", "🔨"],
  "七嘴八舌": ["🎈", "👄", "👈", "🐍"],
  "对牛弹琴": ["✅", "🐂", "🤘🏼", "🎹"],
  "蒸蒸日上": ["♨️", "♨️", "🌞", "👆"],
  "彬彬有礼": ["🧊", "🧊", "🈶", "🎁"],
  "走马观花": ["🚶", "🐴", "👀", "🌸"],
  "余音绕梁": ["🐠", "🎵", "♻️", "🍚"],
  "画蛇添足": ["🎨", "🐍", "☁️", "🦶"],
  "鸟语花香": ["🐦", "🌧️", "🌼", "🤔️"],
  "珠光宝气": ["🐷", "☀️", "💎", "🎈"],
  "男女老少": ["👨", "👩", "🧓", "🧒"],
  "狗急跳墙": ["🐶", "🐔", "🪂", "🧱"]
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npx jest src/modules/emoji/services/dictData.test.ts
```

预期：PASS（4 个用例全绿）。

- [ ] **Step 6: 提交**

```bash
git add src/modules/emoji/types/index.ts src/modules/emoji/data/syllables.json src/modules/emoji/data/phrases.json src/modules/emoji/services/dictData.test.ts
git commit -m "feat: emoji 模块类型定义与词库种子数据"
```

---

## Task 3: 转化核心 translator

**Files:**
- Create: `src/modules/emoji/services/translator.ts`
- Test: `src/modules/emoji/services/translator.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/modules/emoji/services/translator.test.ts`：

```ts
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

  it('similar 候选在纯 emoji 版参与默认渲染（无 exact 时）', () => {
    const dict: Dictionary = {
      syllables: { zhu: { exact: [], similar: [{ emoji: '🍚', label: '粥' }] } },
      phrases: {},
    };
    const tokens = translate('竹', dict);
    expect(renderTokens(tokens, 'exact')).toBe('竹');
    expect(renderTokens(tokens, 'emoji')).toBe('🍚');
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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx jest src/modules/emoji/services/translator.test.ts
```

预期：FAIL，`Cannot find module './translator'`。

- [ ] **Step 3: 实现 translator.ts**

创建 `src/modules/emoji/services/translator.ts`：

```ts
import syllablesData from '../data/syllables.json';
import phrasesData from '../data/phrases.json';
import { getSyllables } from './pinyin';
import type { Token, RenderMode, SyllableEntry, PhraseEntry } from '../types';

/** 词库（可注入：生产用默认字典，测试用自定义小字典） */
export interface Dictionary {
  syllables: Record<string, SyllableEntry>;
  phrases: Record<string, PhraseEntry>;
}

const defaultDict: Dictionary = {
  syllables: syllablesData as Record<string, SyllableEntry>,
  phrases: phrasesData as Record<string, PhraseEntry>,
};

const HANZI_RE = /^[\u4e00-\u9fff]$/;
const ZWJ = '\u200d';
const VS_RE = /[\uFE00-\uFE0F]/;
const MODIFIER_RE = /[\u{1F3FB}-\u{1F3FF}]/u;
const KEYCAP = '\u20E3';

/** 按字素簇切分：合并 ZWJ 序列、变体选择符、肤色修饰符、键帽序列 */
export function splitGraphemes(text: string): string[] {
  const result: string[] = [];
  let current = '';
  let joinNext = false;
  for (const ch of text) {
    if (current === '' || joinNext) {
      current += ch;
      joinNext = false;
    } else if (ch === ZWJ) {
      current += ch;
      joinNext = true;
    } else if (VS_RE.test(ch) || MODIFIER_RE.test(ch) || ch === KEYCAP) {
      current += ch;
    } else {
      result.push(current);
      current = ch;
    }
  }
  if (current !== '') result.push(current);
  return result;
}

/** 构建单个字位的 Token：短语编排优先，其后接音节表候选（去重） */
function buildToken(
  char: string,
  syllable: string | undefined,
  phraseEmoji: string | undefined,
  dict: Dictionary,
): Token {
  const entry = syllable ? dict.syllables[syllable] : undefined;
  const exact = entry?.exact.map((c) => c.emoji) ?? [];
  const similar = entry?.similar.map((c) => c.emoji) ?? [];

  if (phraseEmoji !== undefined) {
    const exactRest = exact.filter((e) => e !== phraseEmoji);
    const similarRest = similar.filter((e) => e !== phraseEmoji);
    return {
      char,
      type: 'hanzi',
      candidates: [phraseEmoji, ...exactRest, ...similarRest],
      exactCount: 1 + exactRest.length,
    };
  }

  return {
    char,
    type: 'hanzi',
    candidates: [...exact, ...similar],
    exactCount: exact.length,
  };
}

/** 转化：短语库最长匹配优先，其余汉字逐字查音节表，非汉字原样保留 */
export function translate(text: string, dict: Dictionary = defaultDict): Token[] {
  // 统一换行（粘贴文本可能含 \r\n），保证 \r 不成为散字素
  const normalized = text.replace(/\r\n?/g, '\n');
  const graphemes = splitGraphemes(normalized);
  const syllablesList = getSyllables(normalized);

  // 防御：pinyin-pro 字库外的极少数基本区汉字（实测 49 个，如「龥」U+9FA5）不返回音节，
  // 会造成音节数组与汉字数不一致；不一致时改为逐字取音，避免后续字全部错位
  const hanziCount = graphemes.reduce((n, g) => (HANZI_RE.test(g) ? n + 1 : n), 0);
  const aligned = syllablesList.length === hanziCount;

  const maxPhraseLen = Object.keys(dict.phrases).reduce(
    (max, p) => Math.max(max, Array.from(p).length),
    0,
  );

  const tokens: Token[] = [];
  let si = 0; // 音节数组游标（与汉字一一对应）
  let i = 0;

  while (i < graphemes.length) {
    const char = graphemes[i];

    if (!HANZI_RE.test(char)) {
      tokens.push({ char, type: 'other', candidates: [], exactCount: 0 });
      i += 1;
      continue;
    }

    // 短语最长匹配
    let phraseHit: string[] | null = null;
    let phraseLen = 0;
    const maxTry = Math.min(maxPhraseLen, graphemes.length - i);
    for (let len = maxTry; len >= 2; len--) {
      const key = graphemes.slice(i, i + len).join('');
      const entry = dict.phrases[key];
      if (entry && entry.length === len) {
        phraseHit = entry;
        phraseLen = len;
        break;
      }
    }

    if (phraseHit) {
      for (let j = 0; j < phraseLen; j++) {
        const syllable = aligned
          ? syllablesList[si + j]
          : getSyllables(graphemes[i + j])[0];
        tokens.push(buildToken(graphemes[i + j], syllable, phraseHit[j], dict));
      }
      si += phraseLen;
      i += phraseLen;
      continue;
    }

    const syllable = aligned ? syllablesList[si] : getSyllables(char)[0];
    tokens.push(buildToken(char, syllable, undefined, dict));
    si += 1;
    i += 1;
  }

  return tokens;
}

/** 单个字位的显示：pick 为手动选择索引（undefined = 默认） */
export function displayChar(token: Token, mode: RenderMode, pick?: number): string {
  if (token.type === 'other') return token.char;
  if (pick != null && pick >= 0 && pick < token.candidates.length) {
    return token.candidates[pick];
  }
  if (mode === 'emoji') {
    return token.candidates.length > 0 ? token.candidates[0] : '❓';
  }
  return token.exactCount > 0 ? token.candidates[0] : token.char;
}

/** 整段渲染：picks 为每字位的手动选择索引数组（可为空） */
export function renderTokens(
  tokens: Token[],
  mode: RenderMode,
  picks: (number | undefined)[] = [],
): string {
  return tokens.map((t, i) => displayChar(t, mode, picks[i])).join('');
}

/** 点按换候选：返回下一个选择索引（环绕，不越界） */
export function nextPick(token: Token, mode: RenderMode, current: number | undefined): number {
  const len = token.candidates.length;
  if (len === 0) return 0;
  const shown =
    current != null ? current : mode === 'exact' ? (token.exactCount > 0 ? 0 : -1) : 0;
  return (shown + 1) % len;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx jest src/modules/emoji/services/translator.test.ts
```

预期：PASS（全绿，含 14 条黄金用例）。若个别黄金用例失败但肉眼一致，用 `[...str]` 对比码点校准测试或短语库。

- [ ] **Step 5: 回归与类型检查**

```bash
npx jest src/modules/emoji
npx tsc --noEmit
```

预期：emoji 模块全部测试通过；类型检查无错误。

- [ ] **Step 6: 提交**

```bash
git add src/modules/emoji/services/translator.ts src/modules/emoji/services/translator.test.ts
git commit -m "feat: emoji 模块转化核心（短语最长匹配/双版本渲染/候选切换）"
```

---

## Task 4: 音节表扩充至全量

**Files:**
- Create: `scripts/gen-syllables.js`（词库维护工具）
- Modify: `src/modules/emoji/data/syllables.json`
- Modify: `src/modules/emoji/services/dictData.test.ts`（增加覆盖率断言）

- [ ] **Step 1: 写音节清单工具脚本**

创建 `scripts/gen-syllables.js`：

```js
// 词库维护工具：提取 GB2312 一级汉字（3755 字）的全部无调音节，
// 并列出每个音节下的常用字，供「音节表」候选挑选参考。
// 用法：node scripts/gen-syllables.js > /tmp/syllables.txt
const { pinyin } = require('pinyin-pro');

const decoder = new TextDecoder('gb2312');
const bySyllable = new Map();

for (let hi = 0xb0; hi <= 0xd7; hi++) {
  for (let lo = 0xa1; lo <= 0xfe; lo++) {
    const ch = decoder.decode(new Uint8Array([hi, lo]));
    if (!/^[\u4e00-\u9fff]$/.test(ch)) continue;
    const [syl] = pinyin(ch, { type: 'array', toneType: 'none' });
    if (!syl || syl === ch) continue;
    if (!bySyllable.has(syl)) bySyllable.set(syl, []);
    bySyllable.get(syl).push(ch);
  }
}

const sorted = [...bySyllable.keys()].sort((a, b) => a.localeCompare(b));
console.log(`音节总数: ${sorted.length}`);
for (const syl of sorted) {
  console.log(`${syl}: ${bySyllable.get(syl).join('')}`);
}
```

运行并查看：

```bash
node scripts/gen-syllables.js > /tmp/syllables.txt && head -8 /tmp/syllables.txt && wc -l /tmp/syllables.txt
```

预期：首行 `音节总数: 约400`，随后每行形如 `ba: 八扒叭巴芭疤吧拔跋把靶坝爸罢霸`。

- [ ] **Step 2: 增加覆盖率断言（写失败测试）**

在 `dictData.test.ts` 的 `describe('音节表结构')` 内追加：

```ts
  it('音节覆盖度：键数 ≥ 350', () => {
    expect(Object.keys(syllables).length).toBeGreaterThanOrEqual(350);
  });
```

（说明：「精确候选非空占比 ≥ 95%」的断言已在 Task 2 审查修复中加入 `dictData.test.ts`，此处只补键数断言。）

运行：

```bash
npx jest src/modules/emoji/services/dictData.test.ts
```

预期：FAIL（当前仅 53 个音节，断言不满足）。

- [ ] **Step 3: 分批生成候选并写入 syllables.json**

以 `/tmp/syllables.txt` 为工作清单，**跳过种子中已有的 53 个音节**（保留现状或等价改写），分批将剩余音节写入 `src/modules/emoji/data/syllables.json`。**每批写完立即运行结构测试**：

```bash
npx jest src/modules/emoji/services/dictData.test.ts
```

**数据质量标准（每批必须遵守）：**

1. `exact` 每音节 2~5 个（宁缺毋滥；可只给 1 个；确实无合适 emoji 时给空数组 `[]`）
2. `similar` 0~3 个，仅当有音近字可用（平翘舌 z/zh、c/ch、s/sh；前后鼻音 an/ang、en/eng、in/ing；n/l；f/h；u/ou）
3. 候选优先级：① 本义 emoji（马→🐴）② 同音常见字（竹→🐷）③ 意象/联想（上→👆、对→✅、青→🍏）
4. `label` 一句话写清来源字，如 `"猪"`、`"梅/眉/玫"`、`"粥（zhu↔zhou 近音）"`
5. 禁止：不雅/暴力/政治敏感 emoji、肤色修饰符、同音节内 emoji 重复
6. 种子 53 条保留（黄金用例与既有测试依赖）

**批次划分（按声母分组，每批约 35~65 个音节，合计约 400）：**

| 批 | 覆盖 | 预计 |
|---|---|---|
| 1 | 零声母（a/e/o 起）+ m/n/ng 成音节 + b + p | ~50 |
| 2 | m + f + d | ~50 |
| 3 | t + n + l | ~60 |
| 4 | g + k + h | ~55 |
| 5 | j + q + x + y + w | ~65 |
| 6 | zh + ch | ~40 |
| 7 | sh + r | ~35 |
| 8 | z + c + s | ~50 |

**格式示例（仅为格式参考，emoji 选择需按质量规则独立判断）：**

```json
"pa": { "exact": [{ "emoji": "🖐️", "label": "扒/趴" }, { "emoji": "🍽️", "label": "盘（pán 近音）" }], "similar": [] },
"peng": { "exact": [{ "emoji": "🤝", "label": "朋" }, { "emoji": "💥", "label": "碰" }], "similar": [{ "emoji": "🥧", "label": "盆（peng↔pen）" }] }
```

- [ ] **Step 4: 全量校验与回归**

```bash
npx jest src/modules/emoji
npx tsc --noEmit
```

预期：全部测试通过（覆盖度断言转绿；若精确候选非空占比 <95%，为冷门音节补充候选；确无合适 emoji 的音节保留空条目）。

- [ ] **Step 5: 人工抽检**

从 `/tmp/syllables.txt` 随机抽 10 个音节，检查：候选与该音节谐音或意象对应、无重复 emoji、label 描述准确。发现质量问题直接修正数据后重跑 Step 4。

- [ ] **Step 6: 提交**

```bash
git add scripts/gen-syllables.js src/modules/emoji/data/syllables.json src/modules/emoji/services/dictData.test.ts
git commit -m "feat: emoji 模块音节表扩充至全量音节"
```

---

## Task 5: 短语库扩充

**Files:**
- Modify: `src/modules/emoji/data/phrases.json`

- [ ] **Step 1: 分批生成（5 批 × 60~80 条，累计 300~400 条）**

每批聚焦一个主题，避免重复：

| 批 | 主题 |
|---|---|
| 1 | 动物与自然 |
| 2 | 数字与人体 |
| 3 | 情感与品格 |
| 4 | 生活与器物 |
| 5 | 历史典故与俗语 |

**每条规则：**

- 文本为纯汉字，以 4 字成语为主（可少量 3~5 字常见俗语），不长于 8 字
- emoji 数组与文字**逐字对应**（长度相等）；每个 emoji 尽量谐音或意象对应
- 优先单码点 emoji；避免肤色修饰符；禁止不雅/暴力/政治敏感
- 与已有条目（含黄金 14 例）不重复
- **黄金 14 例保持原样，严禁修改**

每批完成后运行结构校验（会抓长度不符、非纯汉字、emoji 非法、短语字音节缺失）：

```bash
npx jest src/modules/emoji/services/dictData.test.ts
```

若「短语包含的汉字在音节表中都有键」用例失败：说明新短语里出现了音节表没有的字，需先在 `syllables.json` 补充该字的音节条目（至少 1 个候选），再重跑。

**格式示例：**

```json
"九牛一毛": ["9️⃣", "🐂", "1️⃣", "🪶"],
"一心一意": ["1️⃣", "❤️", "1️⃣", "💭"]
```

- [ ] **Step 2: 全量回归**

```bash
npx jest src/modules/emoji
```

预期：全绿（黄金用例逐字一致）。

- [ ] **Step 3: 人工抽检**

随机抽 20 条检查谐音/意象质量与可猜性，确认无重复条目；质量问题直接修正 emoji 选择（不改结构）。

- [ ] **Step 4: 提交**

```bash
git add src/modules/emoji/data/phrases.json
git commit -m "feat: emoji 模块短语库扩充至 N 条"
```

（N 以实际数量为准）

---

## Task 6: 历史存储

**Files:**
- Create: `src/modules/emoji/services/historyStorage.ts`
- Test: `src/modules/emoji/services/historyStorage.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/modules/emoji/services/historyStorage.test.ts`：

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadHistory, addHistory, removeHistory, clearHistory } from './historyStorage';

// async-storage v3 官方 mock 入口（v3 起旧路径 /jest/async-storage-mock 已移除）
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('historyStorage', () => {
  it('空存储返回空数组', async () => {
    expect(await loadHistory()).toEqual([]);
  });

  it('新增置顶，同文本去重', async () => {
    await addHistory('青梅竹马');
    await addHistory('七嘴八舌');
    const list = await addHistory('青梅竹马');
    expect(list).toHaveLength(2);
    expect(list[0].text).toBe('青梅竹马');
    expect(list[1].text).toBe('七嘴八舌');
  });

  it('超过 100 条淘汰最旧', async () => {
    for (let i = 0; i < 101; i++) {
      await addHistory(`文本${i}`);
    }
    const list = await loadHistory();
    expect(list).toHaveLength(100);
    expect(list.some((i) => i.text === '文本0')).toBe(false);
    expect(list[0].text).toBe('文本100');
  });

  it('删除单条', async () => {
    const list = await addHistory('测试');
    const after = await removeHistory(list[0].id);
    expect(after).toEqual([]);
  });

  it('清空', async () => {
    await addHistory('测试');
    await clearHistory();
    expect(await loadHistory()).toEqual([]);
  });

  it('损坏数据容错：返回空数组', async () => {
    await AsyncStorage.setItem('@flowkit:emoji:history', '{bad json');
    expect(await loadHistory()).toEqual([]);
    await AsyncStorage.setItem('@flowkit:emoji:history', JSON.stringify([{ bad: true }]));
    expect(await loadHistory()).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx jest src/modules/emoji/services/historyStorage.test.ts
```

预期：FAIL，`Cannot find module './historyStorage'`。

- [ ] **Step 3: 实现 historyStorage.ts**

创建 `src/modules/emoji/services/historyStorage.ts`：

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId } from '../../../shared/types';
import type { HistoryItem } from '../types';

const STORAGE_KEY = '@flowkit:emoji:history';
const MAX_ITEMS = 100;

function isHistoryItem(v: unknown): v is HistoryItem {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.text === 'string' &&
    typeof o.createdAt === 'number'
  );
}

export async function loadHistory(): Promise<HistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryItem);
  } catch {
    return [];
  }
}

export async function saveHistory(items: HistoryItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

/** 新增一条（同文本去重置顶），返回更新后的完整列表 */
export async function addHistory(text: string): Promise<HistoryItem[]> {
  const items = await loadHistory();
  const next: HistoryItem[] = [
    { id: generateId(), text, createdAt: Date.now() },
    ...items.filter((i) => i.text !== text),
  ].slice(0, MAX_ITEMS);
  await saveHistory(next);
  return next;
}

export async function removeHistory(id: string): Promise<HistoryItem[]> {
  const next = (await loadHistory()).filter((i) => i.id !== id);
  await saveHistory(next);
  return next;
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx jest src/modules/emoji/services/historyStorage.test.ts
```

预期：PASS（6 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/modules/emoji/services/historyStorage.ts src/modules/emoji/services/historyStorage.test.ts
git commit -m "feat: emoji 模块历史存储（AsyncStorage 持久化/去重/上限）"
```

---

## Task 7: 状态管理

**Files:**
- Create: `src/modules/emoji/store/index.ts`
- Test: `src/modules/emoji/store/store.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/modules/emoji/store/store.test.ts`：

```ts
import { useEmojiStore } from './index';

jest.mock('../services/historyStorage', () => ({
  loadHistory: jest.fn().mockResolvedValue([]),
  addHistory: jest.fn().mockResolvedValue([]),
  removeHistory: jest.fn().mockResolvedValue([]),
  clearHistory: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  useEmojiStore.setState({
    input: '',
    tokens: [],
    picksExact: [],
    picksEmoji: [],
    mode: 'exact',
    history: [],
  });
});

describe('useEmojiStore', () => {
  it('generate：转化当前输入并清空手动选择', () => {
    useEmojiStore.getState().setInput('青梅竹马');
    useEmojiStore.getState().generate();
    const s = useEmojiStore.getState();
    expect(s.tokens).toHaveLength(4);
    expect(s.picksExact).toEqual([]);
    expect(s.picksEmoji).toEqual([]);
  });

  it('generate：空白输入不生成', () => {
    useEmojiStore.getState().setInput('   ');
    useEmojiStore.getState().generate();
    expect(useEmojiStore.getState().tokens).toEqual([]);
  });

  it('cycleCandidate：精确版与纯 emoji 版选择相互独立', () => {
    useEmojiStore.getState().setInput('马');
    useEmojiStore.getState().generate();
    useEmojiStore.getState().cycleCandidate(0);
    expect(useEmojiStore.getState().picksExact[0]).toBe(1);
    expect(useEmojiStore.getState().picksEmoji[0]).toBeUndefined();

    useEmojiStore.getState().setMode('emoji');
    useEmojiStore.getState().cycleCandidate(0);
    expect(useEmojiStore.getState().picksEmoji[0]).toBe(1);
    expect(useEmojiStore.getState().picksExact[0]).toBe(1);
  });

  it('cycleCandidate：无候选的字位不产生选择', () => {
    // 「嗲」→ dia。生产音节表通常无该音节候选；
    // 若 Task 4 生成的数据中 dia 恰有候选，改用其他空条目音节（对照 /tmp/syllables.txt 与 syllables.json 找空条目）
    useEmojiStore.getState().setInput('嗲');
    useEmojiStore.getState().generate();
    useEmojiStore.getState().cycleCandidate(0);
    expect(useEmojiStore.getState().picksExact[0]).toBeUndefined();
  });

  it('applyHistory：回填并生成', () => {
    useEmojiStore.getState().applyHistory('七嘴八舌');
    const s = useEmojiStore.getState();
    expect(s.input).toBe('七嘴八舌');
    expect(s.tokens).toHaveLength(4);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx jest src/modules/emoji/store/store.test.ts
```

预期：FAIL，`Cannot find module './index'`。

- [ ] **Step 3: 实现 store/index.ts**

创建 `src/modules/emoji/store/index.ts`：

```ts
import { create } from 'zustand';
import { translate, nextPick } from '../services/translator';
import * as historyStorage from '../services/historyStorage';
import { MAX_INPUT_LENGTH } from '../types';
import type { Token, RenderMode, HistoryItem } from '../types';

interface EmojiState {
  input: string;
  tokens: Token[];
  /** 精确版各字位的手动选择索引（与 tokens 等长；undefined = 默认） */
  picksExact: (number | undefined)[];
  /** 纯 emoji 版各字位的手动选择索引 */
  picksEmoji: (number | undefined)[];
  mode: RenderMode;
  history: HistoryItem[];

  setInput: (text: string) => void;
  setMode: (mode: RenderMode) => void;
  generate: () => void;
  cycleCandidate: (tokenIndex: number) => void;
  loadHistory: () => Promise<void>;
  removeHistory: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  applyHistory: (text: string) => void;
}

export const useEmojiStore = create<EmojiState>((set, get) => ({
  input: '',
  tokens: [],
  picksExact: [],
  picksEmoji: [],
  mode: 'exact',
  history: [],

  setInput(text) {
    set({ input: text });
  },

  setMode(mode) {
    set({ mode });
  },

  generate() {
    const text = get().input.trim();
    if (!text || text.length > MAX_INPUT_LENGTH) return;
    const tokens = translate(text);
    set({ tokens, picksExact: [], picksEmoji: [] });
    historyStorage.addHistory(text).then((history) => set({ history }));
  },

  cycleCandidate(tokenIndex) {
    const { tokens, mode, picksExact, picksEmoji } = get();
    const token = tokens[tokenIndex];
    if (!token || token.candidates.length === 0) return;
    if (mode === 'exact') {
      const picks = [...picksExact];
      picks[tokenIndex] = nextPick(token, mode, picks[tokenIndex]);
      set({ picksExact: picks });
    } else {
      const picks = [...picksEmoji];
      picks[tokenIndex] = nextPick(token, mode, picks[tokenIndex]);
      set({ picksEmoji: picks });
    }
  },

  async loadHistory() {
    set({ history: await historyStorage.loadHistory() });
  },

  async removeHistory(id) {
    set({ history: await historyStorage.removeHistory(id) });
  },

  async clearHistory() {
    await historyStorage.clearHistory();
    set({ history: [] });
  },

  applyHistory(text) {
    set({ input: text });
    get().generate();
  },
}));
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx jest src/modules/emoji/store/store.test.ts
```

预期：PASS（5 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add src/modules/emoji/store/index.ts src/modules/emoji/store/store.test.ts
git commit -m "feat: emoji 模块状态管理（生成/双版候选切换/历史）"
```

---

## Task 8: 主页 UI（结果组件 + 转化屏幕）

**Files:**
- Create: `src/modules/emoji/components/EmojiResultView.tsx`
- Create: `src/modules/emoji/components/EmojiResultView.test.tsx`
- Create: `src/modules/emoji/screens/EmojiTranslatorScreen.tsx`

- [ ] **Step 1: 实现 EmojiResultView**

创建 `src/modules/emoji/components/EmojiResultView.tsx`：

```tsx
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../../theme';
import { displayChar } from '../services/translator';
import type { Token, RenderMode } from '../types';

interface Props {
  tokens: Token[];
  mode: RenderMode;
  picks: (number | undefined)[];
  onPick: (tokenIndex: number) => void;
}

/** 单版本结果渲染：汉字位大字号可点按（切换候选），非汉字原样小字号；按换行分行 */
export default function EmojiResultView({ tokens, mode, picks, onPick }: Props) {
  const { colors } = useTheme();

  const lines = useMemo(() => {
    const result: { token: Token; index: number }[][] = [[]];
    tokens.forEach((token, index) => {
      if (token.char === '\n') {
        result.push([]);
        return;
      }
      result[result.length - 1].push({ token, index });
    });
    return result;
  }, [tokens]);

  return (
    <View>
      {lines.map((line, li) => (
        <View key={li} style={styles.line}>
          {line.length === 0 ? (
            <View style={styles.emptyLine} />
          ) : (
            line.map(({ token, index }) => {
              const isHanzi = token.type === 'hanzi';
              const pressable = isHanzi && token.candidates.length > 0;
              return (
                <TouchableOpacity
                  key={index}
                  disabled={!pressable}
                  onPress={() => onPick(index)}>
                  <Text
                    style={[
                      isHanzi ? styles.emoji : styles.other,
                      { color: colors.text },
                    ]}>
                    {displayChar(token, mode, picks[index])}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 },
  emptyLine: { height: 20 },
  emoji: { fontSize: 28, marginRight: 2 },
  other: { fontSize: 18, marginRight: 2, opacity: 0.7 },
});
```

- [ ] **Step 2: 实现转化屏幕**

创建 `src/modules/emoji/screens/EmojiTranslatorScreen.tsx`：

```tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Clipboard,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { useEmojiStore } from '../store';
import EmojiResultView from '../components/EmojiResultView';
import { renderTokens } from '../services/translator';
import { MAX_INPUT_LENGTH } from '../types';
import type { RenderMode } from '../types';

type Nav = NativeStackNavigationProp<any>;

const MODE_OPTIONS: { key: RenderMode; label: string }[] = [
  { key: 'exact', label: '精确版' },
  { key: 'emoji', label: '纯 emoji 版' },
];

/** emoji 翻译器：输入中文 → 生成双版本 emoji（可点按换候选、复制、看历史） */
export default function EmojiTranslatorScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<any>();
  const {
    input,
    tokens,
    mode,
    picksExact,
    picksEmoji,
    setInput,
    setMode,
    generate,
    cycleCandidate,
    applyHistory,
  } = useEmojiStore();
  const [copied, setCopied] = useState(false);

  // 从历史页回填：有参数则直接生成并清掉参数（防重复触发）
  const routeText: string | undefined = route.params?.text;
  useEffect(() => {
    if (typeof routeText === 'string' && routeText) {
      applyHistory(routeText);
      navigation.setParams({ text: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeText]);

  const picks = mode === 'exact' ? picksExact : picksEmoji;
  const canGenerate = input.trim().length > 0;

  const onGenerate = () => {
    const text = input.trim();
    if (!text) return;
    if (text.length > MAX_INPUT_LENGTH) {
      Alert.alert('文字过长', `最多支持 ${MAX_INPUT_LENGTH} 个字符`);
      return;
    }
    generate();
  };

  const onCopy = () => {
    if (tokens.length === 0) return;
    Clipboard.setString(renderTokens(tokens, mode, picks));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>中文 → emoji</Text>
        <TouchableOpacity onPress={() => navigation.navigate('EmojiHistory')}>
          <Text style={{ color: colors.primary, fontSize: 14 }}>历史记录 ›</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        输入一段话或一首诗，逐字转成谐音 emoji
      </Text>

      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
        multiline
        placeholder={'例如：青梅竹马'}
        placeholderTextColor={colors.textMuted}
        value={input}
        onChangeText={setInput}
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[
          styles.generateBtn,
          { backgroundColor: colors.primary, opacity: canGenerate ? 1 : 0.4 },
        ]}
        disabled={!canGenerate}
        onPress={onGenerate}>
        <Text style={styles.generateText}>生成</Text>
      </TouchableOpacity>

      {tokens.length > 0 && (
        <View style={[styles.resultCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.modeRow, { backgroundColor: colors.surfaceAlt }]}>
            {MODE_OPTIONS.map((opt) => {
              const active = mode === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setMode(opt.key)}
                  style={[
                    styles.modeBtn,
                    active && { backgroundColor: colors.primary },
                  ]}>
                  <Text
                    style={{
                      fontSize: 13,
                      color: active ? '#fff' : colors.textSecondary,
                    }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <EmojiResultView tokens={tokens} mode={mode} picks={picks} onPick={cycleCandidate} />

          <TouchableOpacity
            style={[styles.copyBtn, { borderColor: colors.primary }]}
            onPress={onCopy}>
            <Text style={{ color: colors.primary, fontSize: 14 }}>
              {copied ? '已复制 ✓' : '复制'}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.hint, { color: colors.textMuted }]}>
            点按任意字可切换候选；纯 emoji 版中 ❓ 表示无可用 emoji 的字
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4, marginBottom: 12 },
  input: {
    minHeight: 96,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  generateBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  generateText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resultCard: { marginTop: 16, borderRadius: 14, padding: 16 },
  modeRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderRadius: 16,
    padding: 3,
    marginBottom: 12,
  },
  modeBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 13 },
  copyBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  hint: { fontSize: 12, marginTop: 10 },
});
```

- [ ] **Step 3: 写组件 smoke 测试**

创建 `src/modules/emoji/components/EmojiResultView.test.tsx`：

```tsx
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { ThemeProvider } from '../../../theme';
import EmojiResultView from './EmojiResultView';
import { translate } from '../services/translator';

describe('EmojiResultView', () => {
  it('渲染黄金用例的 emoji 与标点', async () => {
    const tokens = translate('青梅竹马，狗急跳墙。');
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <ThemeProvider>
          <EmojiResultView tokens={tokens} mode="exact" picks={[]} onPick={() => {}} />
        </ThemeProvider>,
      );
    });
    const texts = tree.root
      .findAllByType(Text)
      .map((n) => n.props.children)
      .filter((c): c is string => typeof c === 'string')
      .join('');
    expect(texts).toContain('🍏');
    expect(texts).toContain('，');
    expect(texts).toContain('🐶');
  });
});
```

- [ ] **Step 4: 运行测试与类型检查**

```bash
npx jest src/modules/emoji/components
npx tsc --noEmit
```

预期：PASS，类型检查无错误。

- [ ] **Step 5: 提交**

```bash
git add src/modules/emoji/components src/modules/emoji/screens/EmojiTranslatorScreen.tsx
git commit -m "feat: emoji 模块主页（输入生成/双版切换/点按换候选/复制）"
```

---

## Task 9: 历史页 UI

**Files:**
- Create: `src/modules/emoji/screens/EmojiHistoryScreen.tsx`

- [ ] **Step 1: 实现历史页**

创建 `src/modules/emoji/screens/EmojiHistoryScreen.tsx`：

```tsx
import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { useEmojiStore } from '../store';
import type { HistoryItem } from '../types';

type Nav = NativeStackNavigationProp<any>;

function formatTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 历史记录：点击回填主页重新生成，可删除单条或清空 */
export default function EmojiHistoryScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const { history, loadHistory, removeHistory, clearHistory } = useEmojiStore();

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onClear = () => {
    if (history.length === 0) return;
    Alert.alert('清空历史', '确定删除全部历史记录？', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: () => clearHistory() },
    ]);
  };

  const renderItem = ({ item }: { item: HistoryItem }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface }]}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('EmojiTranslator', { text: item.text })}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.text, { color: colors.text }]} numberOfLines={2}>
          {item.text}
        </Text>
        <Text style={[styles.time, { color: colors.textMuted }]}>
          {formatTime(item.createdAt)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => removeHistory(item.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={{ color: colors.textMuted, fontSize: 16 }}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>暂无历史记录</Text>
        }
      />
      {history.length > 0 && (
        <TouchableOpacity style={styles.clearBtn} onPress={onClear}>
          <Text style={{ color: '#d9534f', fontSize: 14 }}>清空全部</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  text: { fontSize: 15, fontWeight: '500' },
  time: { fontSize: 12, marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 60, fontSize: 14 },
  clearBtn: { alignItems: 'center', paddingVertical: 14 },
});
```

- [ ] **Step 2: 类型检查**

```bash
npx tsc --noEmit
```

预期：无错误。

- [ ] **Step 3: 提交**

```bash
git add src/modules/emoji/screens/EmojiHistoryScreen.tsx
git commit -m "feat: emoji 模块历史页（列表/删除/清空/回填）"
```

---

## Task 10: 模块接线与全量验收

**Files:**
- Create: `src/modules/emoji/index.ts`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: 创建模块入口**

创建 `src/modules/emoji/index.ts`：

```ts
import { moduleRegistry } from '../../app/module-registry';
import type { ModuleConfig } from '../../app/types';

const emojiModuleConfig: ModuleConfig = {
  id: 'emoji',
  name: 'emoji 翻译器',
  homeRoute: 'EmojiTranslator',
  enabled: true,
  getRoutes: () => [],
};

export function registerEmojiModule(): void {
  moduleRegistry.register(emojiModuleConfig);
}

export { emojiModuleConfig };
```

- [ ] **Step 2: 在 App.tsx 注册模块与路由**

修改 `src/app/App.tsx`：

```tsx
// 1) 文件顶部 import 区追加：
import { registerEmojiModule } from '../modules/emoji';
import EmojiTranslatorScreen from '../modules/emoji/screens/EmojiTranslatorScreen';
import EmojiHistoryScreen from '../modules/emoji/screens/EmojiHistoryScreen';

// 2) 模块注册区追加（现有 registerTriggerModule() / registerReactionModule() 之后）：
registerEmojiModule();

// 3) Stack.Navigator 内追加两个 Screen（放在 Reaction 的 Screen 之后）：
<Stack.Screen
  name="EmojiTranslator"
  component={EmojiTranslatorScreen}
  options={{ title: 'emoji 翻译器' }}
/>
<Stack.Screen
  name="EmojiHistory"
  component={EmojiHistoryScreen}
  options={{ title: '历史记录' }}
/>
```

- [ ] **Step 3: 全量测试与类型检查**

```bash
npx tsc --noEmit
npm test
```

预期：类型检查无错误；全部测试通过（含既有 trigger/reaction 测试与 `__tests__/App.test.tsx` 的 App 渲染回归）。

- [ ] **Step 4: 真机手动验收**

```bash
npx react-native run-android
```

按清单验收（逐项确认）：

1. 首页出现「emoji 翻译器」卡片 → 点击进入
2. 输入「青梅竹马」→ 生成 → 精确版显示 `🍏🌹🐷🐴`
3. 切到纯 emoji 版 → 显示 `🍏🌹🐷🐴`
4. 输入「嗲」→ 精确版显示「嗲」，纯 emoji 版显示 `❓`
5. 输入「床前明月光，疑是地上霜。」→ 标点保留、逐字 emoji（无汉字残留）
6. 点按结果中任一 emoji → 循环切换候选；两个版本的选择互不影响
7. 点「复制」→ 粘贴到微信/备忘录验证内容为当前版本纯文本
8. 顶部「历史记录 ›」→ 列表含刚生成的记录 → 点击某条 → 回主页自动重新生成
9. 历史页删除单条、清空全部（有确认弹窗）均正常
10. 输入超过 200 字 → 弹出「文字过长」提示且不生成

- [ ] **Step 5: 提交**

```bash
git add src/modules/emoji/index.ts src/app/App.tsx
git commit -m "feat: emoji 翻译器模块接入首页与导航"
```

---

## 完成标准

- `npx tsc --noEmit` 无错误；`npm test` 全绿
- 真机验收清单 10 项全部通过
- 黄金 14 例在测试中逐字一致（`translator.test.ts`）
- 词库：音节表 ≥350 键（精确候选非空 ≥95%）、短语库 300~400 条、结构校验测试通过
