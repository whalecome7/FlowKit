// 符号检索行流生成工具（确定性 LCG，无 Math.random）。
// 用法：node scripts/gen-speed-rows.js > /tmp/speed-rows.txt
// 将输出的每一行（TS 数组元素）粘贴进 src/modules/iq/data/speedTask.ts 的 SPEED_ROWS。
const KINDS = ['circle', 'square', 'triangle', 'diamond', 'star'];
const TARGET = 'diamond';
let seed = 20260914;
function next() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const rows = [];
for (let r = 0; r < 120; r++) {
  const withTarget = next() < 0.35;
  const targetPos = Math.floor(next() * 5);
  const symbols = [];
  for (let i = 0; i < 5; i++) {
    if (withTarget && i === targetPos) {
      symbols.push(TARGET);
      continue;
    }
    let k = KINDS[Math.floor(next() * KINDS.length)];
    if (k === TARGET) k = KINDS[(KINDS.indexOf(k) + 1) % KINDS.length];
    symbols.push(k);
  }
  rows.push({ symbols, hasTarget: withTarget });
}
for (const row of rows) {
  console.log(`  { symbols: [${row.symbols.map((s) => `'${s}'`).join(', ')}], hasTarget: ${row.hasTarget} },`);
}
