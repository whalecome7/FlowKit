import { FADE_CUTOFF, FADE_DECAY } from '../constants';
import {
  AGE_UNIT,
  GROUP_SIZE,
  LIVE_STEP,
  advanceTo,
  blockAlive,
  buildBlock,
  createLivePath,
  segStyleAt,
} from './liveTrail';
import type { LiveStyleSpec } from './liveTrail';

const MONO: LiveStyleSpec = { trailStyle: 'mono', monoColor: '#123456' };
const RAINBOW: LiveStyleSpec = { trailStyle: 'rainbow', monoColor: '#000000' };
const FADE: LiveStyleSpec = { trailStyle: 'fade', monoColor: '#111111' };

/** 沿 +x 逐点采样（advanceTo 补点，步长恒为 LIVE_STEP） */
function samplePath(count: number, step = LIVE_STEP) {
  const s = createLivePath(0, 0);
  advanceTo(s, (count - 1) * step + 1e-9, 0);
  return s;
}

describe('liveTrail 采样（advanceTo 插值补点）', () => {
  it('按 LIVE_STEP 步长插值推进，返回本次追加点数', () => {
    const s = createLivePath(0, 0);
    expect(advanceTo(s, 0.05, 0)).toBe(0); // 不足一步
    expect(s.xs).toHaveLength(1);

    expect(advanceTo(s, 0.25, 0)).toBe(3); // 0.08 / 0.16 / 0.24，剩 0.01
    expect(s.xs).toHaveLength(4);
    expect(s.xs[1]).toBeCloseTo(0.08, 9);
    expect(s.xs[2]).toBeCloseTo(0.16, 9);
    expect(s.xs[3]).toBeCloseTo(0.24, 9);
    expect(s.lens[3]).toBeCloseTo(0.24, 9);

    // 继续推进：从 0.24 到 0.4 补 2 点
    expect(advanceTo(s, 0.4, 0)).toBe(2);
    expect(s.xs[5]).toBeCloseTo(0.4, 9);
  });

  it('斜向插值点严格落在连线上，相邻点距恒为 LIVE_STEP（快移自动拆点）', () => {
    const s = createLivePath(1, 1);
    const added = advanceTo(s, 4, 5); // 距离 5 → 62 点（5 / 0.08 = 62.5）
    expect(added).toBe(62);
    for (let k = 1; k <= 62; k++) {
      const prev = k - 1;
      expect(Math.hypot(s.xs[k] - s.xs[prev], s.ys[k] - s.ys[prev])).toBeCloseTo(LIVE_STEP, 9);
    }
    // 剩 0.04 < LIVE_STEP：末端不补点，球体自身覆盖（端点恒贴球）
    const rem = Math.hypot(4 - s.xs[62], 5 - s.ys[62]);
    expect(rem).toBeGreaterThan(0);
    expect(rem).toBeLessThan(LIVE_STEP);
  });
});

describe('liveTrail 样式', () => {
  it('mono：恒单色全亮', () => {
    expect(segStyleAt(MONO, 0, 10)).toEqual({ color: '#123456', opacity: 1 });
    expect(segStyleAt(MONO, 999, 0)).toEqual({ color: '#123456', opacity: 1 });
  });

  it('rainbow：按起点累计长度连续渐变色相（每 AGE_UNIT 走 15°，衔接无台阶）', () => {
    expect(segStyleAt(RAINBOW, 0, 100).color).toBe('hsl(0, 85%, 52%)');
    expect(segStyleAt(RAINBOW, 0.5 * AGE_UNIT, 100).color).toBe('hsl(7.5, 85%, 52%)');
    expect(segStyleAt(RAINBOW, 2 * AGE_UNIT, 100).color).toBe('hsl(30, 85%, 52%)');
    expect(segStyleAt(RAINBOW, 4 * AGE_UNIT, 100).color).toBe('hsl(60, 85%, 52%)');
    // 一圈（24 × AGE_UNIT = 48 世界单位）回绕
    expect(segStyleAt(RAINBOW, 24 * AGE_UNIT, 100).color).toBe('hsl(0, 85%, 52%)');
    // 相邻采样点（LIVE_STEP=0.08 世界单位，色相差 0.6°）颜色连续变化——无量化桶
    expect(segStyleAt(RAINBOW, 1, 100).color).toBe('hsl(7.5, 85%, 52%)');
    expect(segStyleAt(RAINBOW, 1.08, 100).color).toBe('hsl(8.1, 85%, 52%)');
    // 与头部距离无关（headLen 不影响 hue）
    expect(segStyleAt(RAINBOW, 2 * AGE_UNIT, 999).color).toBe('hsl(30, 85%, 52%)');
  });

  it('fade：按距头部长度 8 档衰减，低于 cutoff 返回 0', () => {
    // 头部（age 0）→ α=1 → 最高档 opacity 1
    expect(segStyleAt(FADE, 10, 10).opacity).toBe(1);
    // age 恰好 1 档（路径 AGE_UNIT）→ α=0.78 → step=floor(0.78*8)=6 → 7/8
    expect(segStyleAt(FADE, 10 - AGE_UNIT, 10).opacity).toBe(7 / 8);
    // 远距离：α = 0.78^(20/... 用 AGE_UNIT*20 → α≈0.0069 < 0.06 → 0
    expect(segStyleAt(FADE, 10 - AGE_UNIT * 20, 10).opacity).toBe(0);
    // 头部不可能低于头部（lenPos > headLen 被钳为 age 0）
    expect(segStyleAt(FADE, 99, 10).opacity).toBe(1);
  });
});

describe('liveTrail 静态块', () => {
  it('buildBlock：按 GROUP_SIZE 分组，段数与 d 内容吻合，endLen 正确', () => {
    const s = samplePath(49); // 0..48 共 49 点 → 48 段
    const block = buildBlock(s, 0, 48, MONO, s.lens[48]);
    expect(block.from).toBe(0);
    expect(block.to).toBe(48);
    expect(block.endLen).toBeCloseTo(48 * LIVE_STEP, 9);
    // 48 段 / 16 = 3 组
    expect(block.paths).toHaveLength(3);
    // 每组 16 段 → d 中 1 个 M + 16 个 L
    for (const p of block.paths) {
      expect((p.d.match(/M /g) ?? []).length).toBe(1);
      expect((p.d.match(/L /g) ?? []).length).toBe(GROUP_SIZE);
    }
    // 世界坐标直入 d：首段起点 (0,0)
    expect(block.paths[0].d.startsWith('M 0 0')).toBe(true);
  });

  it('buildBlock：fade 下低于 cutoff 的组被跳过', () => {
    const s = samplePath(49);
    const headLen = s.lens[48];
    const alive = buildBlock(s, 0, 48, FADE, headLen); // 最老组 age=(48-0)*0.08/2≈1.92 → α≈0.62，均存活
    expect(alive.paths).toHaveLength(3);
    // 把头部推远：最老组 age=(160-0)*0.08/2=6.4 → α≈0.2 存活；更远则死亡
    const far = buildBlock(s, 0, 48, FADE, 160 * LIVE_STEP); // age 组头 6.4 / 组尾 6.4+0.64
    expect(far.paths.length).toBeGreaterThanOrEqual(1);
    const dead = buildBlock(s, 0, 48, FADE, 400); // age 16 → α=0.78^16≈0.019 < cutoff
    expect(dead.paths).toHaveLength(0);
  });

  it('blockAlive：非 fade 恒真；fade 按块尾端距头部长度判定', () => {
    const s = samplePath(49);
    const block = buildBlock(s, 0, 48, MONO, s.lens[48]);
    expect(blockAlive(block, 99999, MONO)).toBe(true);
    // 块尾 lenPos=3.84；headLen 同值 → α=1 存活
    expect(blockAlive(block, block.endLen, FADE)).toBe(true);
    // headLen 远离：age=(400-3.84)/2≈198 → α≈0 死亡
    expect(blockAlive(block, 400, FADE)).toBe(false);
    // 恰在 cutoff 边界附近：age 满足 α≥cutoff 即存活
    const ageAtCutoff = Math.log(FADE_CUTOFF) / Math.log(FADE_DECAY); // ≈11.33
    const headAt = block.endLen + ageAtCutoff * AGE_UNIT;
    expect(blockAlive(block, headAt - 0.01, FADE)).toBe(true);
    expect(blockAlive(block, headAt + 0.5, FADE)).toBe(false);
  });
});
