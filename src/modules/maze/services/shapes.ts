import type { ShapeKey } from '../types';

/** 形状多边形：坐标 (u, v) ∈ [-1,1]，u 向右、v 向上 */
export type Polygon = [number, number][];

function rad(d: number): number {
  return (d * Math.PI) / 180;
}

export function circlePolygon(): Polygon {
  const pts: Polygon = [];
  for (let i = 0; i < 120; i++) {
    const th = (i / 120) * Math.PI * 2;
    pts.push([0.92 * Math.cos(th), 0.92 * Math.sin(th)]);
  }
  return pts;
}

export function ellipsePolygon(): Polygon {
  const pts: Polygon = [];
  for (let i = 0; i < 120; i++) {
    const th = (i / 120) * Math.PI * 2;
    pts.push([0.95 * Math.cos(th), 0.72 * Math.sin(th)]);
  }
  return pts;
}

export function capsulePolygon(): Polygon {
  const pts: Polygon = [];
  for (let i = 0; i <= 40; i++) {
    const t = -Math.PI / 2 + (Math.PI * i) / 40;
    pts.push([0.62 + 0.5 * Math.cos(t), 0.5 * Math.sin(t)]);
  }
  for (let i = 0; i <= 40; i++) {
    const t = Math.PI / 2 + (Math.PI * i) / 40;
    pts.push([-0.62 + 0.5 * Math.cos(t), 0.5 * Math.sin(t)]);
  }
  return pts;
}

export function hexagonPolygon(): Polygon {
  const pts: Polygon = [];
  for (let i = 0; i < 6; i++) {
    const th = rad(-90 + 60 * i + 30);
    pts.push([0.9 * Math.cos(th), 0.9 * Math.sin(th)]);
  }
  return pts;
}

export function heartPolygon(): Polygon {
  const pts: Polygon = [];
  for (let i = 0; i < 240; i++) {
    const t = (i / 240) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push([x / 16, (y + 17) / 14.6 - 1]);
  }
  return pts;
}

export function starPolygon(): Polygon {
  const pts: Polygon = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.95 : 0.42;
    const th = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([r * Math.cos(th), r * Math.sin(th)]);
  }
  return pts;
}

export function flowerPolygon(): Polygon {
  const pts: Polygon = [];
  for (let i = 0; i < 240; i++) {
    const th = (i / 240) * Math.PI * 2;
    const r = 0.62 + 0.33 * Math.cos(5 * th);
    pts.push([r * Math.cos(th), r * Math.sin(th)]);
  }
  return pts;
}

export function crescentPolygon(): Polygon {
  const pts: Polygon = [];
  for (let i = 0; i <= 60; i++) {
    const th = 57.5 + ((302.5 - 57.5) * i) / 60;
    pts.push([0.92 * Math.cos(rad(th)), 0.92 * Math.sin(rad(th))]);
  }
  for (let i = 0; i <= 40; i++) {
    const b = 284 - ((284 - 76) * i) / 40;
    pts.push([0.3 + 0.8 * Math.cos(rad(b)), 0.8 * Math.sin(rad(b))]);
  }
  return pts;
}

export function organicPolygon(rng: () => number): Polygon {
  const a1 = rng() * Math.PI * 2;
  const a2 = rng() * Math.PI * 2;
  const a3 = rng() * Math.PI * 2;
  const pts: Polygon = [];
  for (let i = 0; i < 240; i++) {
    const th = (i / 240) * Math.PI * 2;
    const r =
      0.86 * (1 + 0.1 * Math.sin(3 * th + a1) + 0.075 * Math.sin(5 * th + a2) + 0.05 * Math.sin(7 * th + a3));
    pts.push([r * Math.cos(th), r * Math.sin(th)]);
  }
  return pts;
}

export function makeShape(key: ShapeKey, rng: () => number): Polygon {
  switch (key) {
    case 'circle':
      return circlePolygon();
    case 'ellipse':
      return ellipsePolygon();
    case 'capsule':
      return capsulePolygon();
    case 'hexagon':
      return hexagonPolygon();
    case 'heart':
      return heartPolygon();
    case 'star':
      return starPolygon();
    case 'flower':
      return flowerPolygon();
    case 'crescent':
      return crescentPolygon();
    case 'organic':
      return organicPolygon(rng);
  }
}

/** 射线法点入判定 */
export function pointInPolygon(u: number, v: number, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
