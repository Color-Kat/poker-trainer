// Generates Equity.PREFLOP_ORDER: 169 hands sorted by the average of their rank by
// equity vs 1 random hand and vs 2 random hands (MC). Writes it into src/30-equity.js.
const fs = require('fs');
const path = require('path');
const P = require('./load')();
const { Cards, Equity, U } = P;
U.seed(12345);
const ITERS = +process.argv[2] || 20000;
const rows = Cards.HAND_CODES.map((code) => {
  const hole = Cards.codeToCombos(code)[0];
  return { code, e1: Equity.vsRandom(hole, [], 1, { iters: ITERS }), e2: Equity.vsRandom(hole, [], 2, { iters: ITERS }) };
});
const rankBy = (k) => new Map([...rows].sort((a, b) => b[k] - a[k]).map((r, i) => [r.code, i]));
const r1 = rankBy('e1'), r2 = rankBy('e2');
rows.sort((a, b) => (r1.get(a.code) + r2.get(a.code)) - (r1.get(b.code) + r2.get(b.code)) || b.e1 - a.e1);
const order = rows.map((r) => r.code).join(' ');
const file = path.join(__dirname, '..', 'src', '30-equity.js');
const text = fs.readFileSync(file, 'utf8').replace(/const PREFLOP_ORDER = '[^']*'/, `const PREFLOP_ORDER = '${order}'`);
fs.writeFileSync(file, text);
console.log(order);
