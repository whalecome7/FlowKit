import { mulberry32 } from './rng';

describe('mulberry32', () => {
  it('同种子产生相同序列', () => {
    const a = mulberry32(1234567);
    const b = mulberry32(1234567);
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b());
    }
  });

  it('不同种子序列不同', () => {
    const a = mulberry32(1111111);
    const b = mulberry32(2222222);
    expect(a()).not.toBe(b());
  });

  it('输出在 [0, 1) 区间', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
