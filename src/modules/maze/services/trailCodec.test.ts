import { encodeTrail, decodeTrail } from './trailCodec';
import type { CellPoint } from '../types';

describe('trailCodec', () => {
  it('空轨迹编解码为空数组', () => {
    expect(encodeTrail([])).toBe('');
    expect(decodeTrail('')).toEqual([]);
  });

  it('损坏输入安全返回空数组', () => {
    expect(decodeTrail('zzzz')).toEqual([]);
    expect(decodeTrail('!!!!')).toEqual([]);
    expect(decodeTrail('AAAA')).toEqual([]);
  });

  it('L 型 3 格：精确长度并往返一致', () => {
    // bits = 16(计数) + 8(i) + 8(j) + 2×2(方向) = 36 bit → 5 字节 → base64 8 字符
    const trail: CellPoint[] = [
      [5, 6],
      [6, 6],
      [6, 7],
    ];
    const enc = encodeTrail(trail);
    expect(enc.length).toBe(8);
    expect(decodeTrail(enc)).toEqual(trail);
  });

  it('200 步随机游走往返一致', () => {
    const trail: CellPoint[] = [[10, 10]];
    const dirs: CellPoint[] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    let rngState = 7;
    const rnd = () => {
      rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
      return rngState / 0x7fffffff;
    };
    for (let n = 1; n < 200; n++) {
      const prev = trail[n - 1];
      const d = dirs[Math.floor(rnd() * 4)];
      trail.push([prev[0] + d[0], prev[1] + d[1]]);
    }
    const dec = decodeTrail(encodeTrail(trail));
    expect(dec).toEqual(trail);
  });
});
