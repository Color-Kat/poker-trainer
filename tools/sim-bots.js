// All-bot simulations through the real Engine → per-style stats table (calibration of src/50-bots.js).
// Usage: node tools/sim-bots.js [hands=20000] [players=9,6] [stackBB=100] [seed]
//   stacks are reset every hand (cash-game depth); the lineup is re-drawn every 40 hands.
// Columns: VPIP / PFR (% of hands dealt), AF = postflop (bets+raises)/calls, Agg% = (bets+raises)/all postflop actions,
// F2B = folds when facing a postflop bet, WTSD = showdowns / flops seen, Bluff% = postflop bets/raises with
// classifyHolding 'bluff', CBet% = flop bets as the preflop raiser when checked to, bb/100 = win rate;
// then the measured composition of big (≥ 2/3 pot) bets/raises.
const fs = require('fs'), path = require('path'), vm = require('vm');

// Like tools/load.js, but a module that fails to load (another file mid-edit) is skipped with a warning.
const ctx = vm.createContext({ console, performance, setTimeout, clearTimeout, structuredClone });
const srcDir = path.join(__dirname, '..', 'src');
for (const f of fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort()) {
  try { vm.runInContext(fs.readFileSync(path.join(srcDir, f), 'utf8'), ctx, { filename: 'src/' + f }); } catch (e) { console.warn(`skip src/${f}: ${e.message}`); }
}
const { Engine, Bots, U } = vm.runInContext('({ Engine, Bots, U })', ctx);
const [HANDS = 20000, SIZES = '9,6', STACK = 100, SEED] = process.argv.slice(2);

function simulate({ hands, n, stackBB, seed }) {
  if (seed !== undefined) U.seed(+seed);
  const S = {}, row = (k) => (S[k] = S[k] || { hands: 0, vpip: 0, pfr: 0, br: 0, calls: 0, post: 0, facing: 0, folds: 0, flops: 0, sd: 0, bluff: 0, net: 0, cbOpp: 0, cb: 0 });
  const big = {}, timing = { n: 0, sum: 0, max: 0 };
  let table;
  for (let h = 0; h < hands; h++) {
    if (h % 40 === 0) {
      const used = [];
      const players = Bots.randomLineup(n).map((style) => { const b = Bots.createBot({ style, usedNames: used }); used.push(b.name); return b; });
      table = Engine.createTable({ players, sb: 10, bb: 20, button: U.randInt(0, n - 1) });
    }
    for (const p of table.players) { p.stack = stackBB * 20; p.busted = false; }
    const hand = Engine.startHand(table);
    while (hand.phase !== 'done') {
      if (hand.phase === 'roundEnd') { Engine.advance(hand); continue; }
      const seat = hand.toAct, t0 = performance.now();
      const d = Bots.decide({ table, hand, seat, legal: Engine.legal(hand), human: null });
      const dt = performance.now() - t0;
      timing.n++; timing.sum += dt; timing.max = Math.max(timing.max, dt);
      Engine.act(hand, d.action);
    }
    for (const s of hand.seats) {
      const p = table.players[s], b = p.baseStyle, r = row(p.style === 'actor' ? 'actor' : b); // actors get their own row
      const mine = hand.log.filter((e) => e.seat === s);
      const pre = mine.filter((e) => e.street === 'preflop');
      const post = mine.filter((e) => e.street !== 'preflop');
      const sawFlop = hand.board.length >= 3 && !pre.some((e) => e.type === 'fold');
      // c-bet chance: last preflop raiser, nobody bet the flop before its first flop action
      const preRaises = hand.log.filter((e) => e.street === 'preflop' && e.type === 'raise');
      const firstFlop = post.find((e) => e.street === 'flop');
      const cbOpp = firstFlop && preRaises.length && preRaises[preRaises.length - 1].seat === s
        && !hand.log.some((e) => e.street === 'flop' && e.i < firstFlop.i && e.type === 'bet');
      r.hands++;
      r.vpip += pre.some((e) => e.type === 'call' || e.type === 'raise') ? 1 : 0;
      r.pfr += pre.some((e) => e.type === 'raise') ? 1 : 0;
      r.flops += sawFlop ? 1 : 0;
      r.sd += sawFlop && hand.result.shown.includes(s) ? 1 : 0;
      r.net += hand.result.net[s];
      if (cbOpp) { r.cbOpp++; if (firstFlop.type === 'bet') r.cb++; }
      for (const e of post) {
        r.post++;
        if (e.type === 'call') r.calls++;
        if (e.facing > 0) { r.facing++; if (e.type === 'fold') r.folds++; }
        if (e.type !== 'bet' && e.type !== 'raise') continue;
        r.br++;
        const c = Bots.classifyHolding(hand.hole[s], hand.board.slice(0, { flop: 3, turn: 4, river: 5 }[e.street]));
        if (c === 'bluff') r.bluff++;
        if (e.add / e.potBefore >= 0.66) { // the same "big bet" test as Coach.readQuestion (chips put in vs the pot before)
          const m = (big[b] = big[b] || { strong: 0, medium: 0, draw: 0, bluff: 0, n: 0 });
          m[c]++; m.n++;
        }
      }
    }
  }
  U.seed(null);
  return { S, big, timing };
}

const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : '-').padStart(6);
const num = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-').padStart(6);
for (const n of String(SIZES).split(',').map(Number)) {
  const t0 = Date.now();
  const { S, big, timing } = simulate({ hands: +HANDS, n, stackBB: +STACK, seed: SEED });
  console.log(`\n=== ${n}-max, ${HANDS} hands, ${STACK} BB stacks (${((Date.now() - t0) / 1000).toFixed(1)} s; decision avg ${(timing.sum / timing.n).toFixed(2)} ms, max ${timing.max.toFixed(1)} ms)`);
  console.log('style      hands   VPIP    PFR     AF   Agg%   F2B%  WTSD%  Bluff%  CBet%  bb/100');
  for (const k of Bots.STYLE_IDS) {
    const r = S[k];
    if (!r) continue;
    console.log(k.padEnd(8) + String(r.hands).padStart(7) + pct(r.vpip, r.hands) + ' ' + pct(r.pfr, r.hands) + ' ' + num(r.br / r.calls)
      + ' ' + pct(r.br, r.post) + ' ' + pct(r.folds, r.facing) + ' ' + pct(r.sd, r.flops) + '  ' + pct(r.bluff, r.br)
      + ' ' + pct(r.cb, r.cbOpp) + '  ' + ((r.net / 20 / r.hands) * 100).toFixed(1).padStart(6));
  }
  console.log('big bets (≥ 2/3 pot) by classifyHolding, base style:   n   strong medium  draw  bluff');
  for (const k of Bots.BASE_STYLES) {
    const m = big[k];
    if (!m) continue;
    console.log('  ' + k.padEnd(8) + String(m.n).padStart(7) + ['strong', 'medium', 'draw', 'bluff'].map((c) => (m[c] / m.n).toFixed(2).padStart(7)).join(''));
  }
}
