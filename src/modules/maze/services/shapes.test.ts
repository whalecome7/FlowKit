import { makeShape, pointInPolygon } from './shapes';
import { mulberry32 } from './rng';

/** 用 rng 生成形状（organic 需要） */
function shape(key: Parameters<typeof makeShape>[0], seed = 1) {
  return makeShape(key, mulberry32(seed));
}

describe('pointInPolygon', () => {
  it('正方形内点判定', () => {
    const square: [number, number][] = [
      [0.5, 0.5],
      [-0.5, 0.5],
      [-0.5, -0.5],
      [0.5, -0.5],
    ];
    expect(pointInPolygon(0, 0, square)).toBe(true);
    expect(pointInPolygon(0.6, 0, square)).toBe(false);
  });
});

describe('形状库', () => {
  const roundShapeKeys = ['circle', 'ellipse', 'capsule', 'hexagon', 'heart', 'star', 'flower'] as const;

  it('圆/椭圆/胶囊/六边形/心形/星形/花朵：中心在内、远处在外', () => {
    for (const key of roundShapeKeys) {
      const poly = shape(key);
      expect(pointInPolygon(0, 0, poly)).toBe(true);
      expect(pointInPolygon(1.3, 0, poly)).toBe(false);
    }
  });

  it('心形顶部中央有凹陷（凹口处在外）', () => {
    const poly = shape('heart');
    expect(pointInPolygon(0, 0.99, poly)).toBe(false);
    expect(pointInPolygon(0.55, 0.8, poly)).toBe(true);
  });

  it('月牙：中心被"咬掉"、厚部在内、右侧凹口在外', () => {
    const poly = shape('crescent');
    // 原点位于内圆（被咬掉的缺口）内部 → 不在月牙内
    expect(pointInPolygon(0, 0, poly)).toBe(false);
    // 左侧厚部在内
    expect(pointInPolygon(-0.6, 0, poly)).toBe(true);
    // 右侧凹口区域（内圆内部）不在月牙内
    expect(pointInPolygon(0.9, 0, poly)).toBe(false);
    // 最右侧（内圆外缘之外）也不是月牙
    expect(pointInPolygon(1.3, 0, poly)).toBe(false);
  });

  it('有机形：近距离必在内、远距离必在外', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const poly = shape('organic', seed);
      expect(pointInPolygon(0, 0, poly)).toBe(true);
      expect(pointInPolygon(0.4, 0.2, poly)).toBe(true);
      expect(pointInPolygon(1.2, 0, poly)).toBe(false);
    }
  });

  it('形状为闭合多边形（点数足够）', () => {
    for (const key of [...roundShapeKeys, 'crescent', 'organic'] as const) {
      expect(shape(key).length).toBeGreaterThanOrEqual(6);
    }
  });
});
