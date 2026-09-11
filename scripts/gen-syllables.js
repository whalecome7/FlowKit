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
