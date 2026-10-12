import type { CellPoint } from '../types';

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64_CHARS[b2 & 63] : '=';
  }
  return out;
}

function base64ToBytes(s: string): number[] {
  const bytes: number[] = [];
  const clean = s.replace(/=+$/, '');
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_CHARS.indexOf(clean[i]);
    const c1 = i + 1 < clean.length ? B64_CHARS.indexOf(clean[i + 1]) : 0;
    const c2 = i + 2 < clean.length ? B64_CHARS.indexOf(clean[i + 2]) : 0;
    const c3 = i + 3 < clean.length ? B64_CHARS.indexOf(clean[i + 3]) : 0;
    bytes.push((c0 << 2) | (c1 >> 4));
    if (i + 2 < clean.length) bytes.push(((c1 & 15) << 4) | (c2 >> 2));
    if (i + 3 < clean.length) bytes.push(((c2 & 3) << 6) | c3);
  }
  return bytes;
}

/**
 * 编码轨迹：16bit 格数 + 8bit 起始 i + 8bit 起始 j + 每步 2bit 方向
 * 方向：0 上(j-1) / 1 右(i+1) / 2 下(j+1) / 3 左(i-1)
 * 一步约 0.25 字节 → 千步约 0.3KB
 */
export function encodeTrail(cells: CellPoint[]): string {
  if (!cells.length) return '';
  const bits: number[] = [];
  const pushN = (val: number, n: number) => {
    for (let b = n - 1; b >= 0; b--) bits.push((val >> b) & 1);
  };
  pushN(cells.length, 16);
  pushN(cells[0][0], 8);
  pushN(cells[0][1], 8);
  for (let n = 1; n < cells.length; n++) {
    const di = cells[n][0] - cells[n - 1][0];
    const dj = cells[n][1] - cells[n - 1][1];
    const dir = dj === 1 ? 2 : dj === -1 ? 0 : di === 1 ? 1 : 3;
    pushN(dir, 2);
  }
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | (bits[i + b] || 0);
    bytes.push(byte);
  }
  return bytesToBase64(bytes);
}

export function decodeTrail(s: string): CellPoint[] {
  if (!s) return [];
  const bytes = base64ToBytes(s);
  const bits: number[] = [];
  for (const v of bytes) {
    for (let b = 7; b >= 0; b--) bits.push((v >> b) & 1);
  }
  let pos = 0;
  const readN = (n: number): number => {
    let val = 0;
    for (let b = 0; b < n; b++) {
      val = (val << 1) | (bits[pos] || 0);
      pos++;
    }
    return val;
  };
  const count = readN(16);
  // 自洽校验：合法编码的位长恰为 32 + 2*(count-1)，字节数须恰好容纳且填充位 < 8；
  // 不满足即为损坏输入，安全返回空数组
  const needBits = 32 + 2 * (count - 1);
  if (count < 1 || needBits > bytes.length * 8 || needBits + 8 <= bytes.length * 8) return [];
  const list: CellPoint[] = [[readN(8), readN(8)]];
  for (let n = 1; n < count; n++) {
    const d = readN(2);
    const prev = list[list.length - 1];
    list.push([prev[0] + (d === 1 ? 1 : d === 3 ? -1 : 0), prev[1] + (d === 2 ? 1 : d === 0 ? -1 : 0)]);
  }
  return list;
}
