// Foundation: Cards, HandEval, Equity
const C = (s) => Cards.parseList(s);
const sc = (s) => HandEval.score(C(s));

test('cards: parse/format roundtrip, codes', () => {
  for (let c = 0; c < 52; c++) assert.strictEqual(Cards.parse(Cards.str(c)), c);
  assert.strictEqual(Cards.str(Cards.parse('Th')), '10♥');
  assert.deepStrictEqual(C('AsKd'), C('A♠ K♦'));
  assert.strictEqual(Cards.handCode(...C('Kd As')), 'AKo');
  assert.strictEqual(Cards.handCode(...C('7h 7c')), '77');
  assert.strictEqual(Cards.handCode(...C('9s Ts')), 'T9s');
  assert.strictEqual(Cards.HAND_CODES.length, 169);
  assert.strictEqual(new Set(Cards.HAND_CODES).size, 169);
  assert.strictEqual(Cards.gridCode(0, 1), 'AKs');
  assert.strictEqual(Cards.gridCode(1, 0), 'AKo');
  assert.strictEqual(Cards.HAND_CODES.reduce((s, c) => s + Cards.codeCombos(c), 0), 1326);
  for (const code of Cards.HAND_CODES) {
    const combos = Cards.codeToCombos(code);
    assert.strictEqual(combos.length, Cards.codeCombos(code), code);
    for (const [a, b] of combos) assert.strictEqual(Cards.handCode(a, b), code);
  }
});

test('cards: range notation', () => {
  const r = (s) => [...Cards.parseRange(s)].sort().join(' ');
  assert.strictEqual(r('77+'), '77 88 99 AA JJ KK QQ TT');
  assert.strictEqual(r('AJs+'), 'AJs AKs AQs');
  assert.strictEqual(r('T8s+'), 'T8s T9s');
  assert.strictEqual(r('97s+'), '97s 98s');
  assert.strictEqual(r('KQs'), 'KQs');
  assert.strictEqual(r('AK'), 'AKo AKs');
  assert.strictEqual(r('JJ-22').split(' ').length, 10);
  assert.strictEqual(r('A5s-A2s'), 'A2s A3s A4s A5s');
  assert.strictEqual(Cards.parseRange('22+, A2s+, A7o+, K7s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, K9o+, Q9o+, J9o+, T9o').size,
    13 + 12 + 7 + 6 + 4 + 3 + 2 + 2 + 2 + 1 + 1 + 4 + 3 + 2 + 1);
  assert.throws(() => Cards.parseRange('KAs'));
  assert.strictEqual(Cards.suitRu(1, 4), 'червы');
  assert.strictEqual(Cards.suitRu(1, 13), 'черв');
});

test('handeval: categories', () => {
  const cat = (s) => HandEval.cat(sc(s));
  assert.strictEqual(cat('As Ks Qs Js Ts 2d 3c'), 8);
  assert.strictEqual(cat('Ah 2h 3h 4h 5h Kd Kc'), 8);
  assert.strictEqual(cat('9c 9d 9h 9s 2d 3c 4h'), 7);
  assert.strictEqual(cat('9c 9d 9h 2s 2d 3c 4h'), 6);
  assert.strictEqual(cat('9c 9d 9h 2s 2d 2c 4h'), 6);
  assert.strictEqual(cat('Ac 9c 7c 4c 2c Kd Kh'), 5);
  assert.strictEqual(cat('Ac 2d 3h 4s 5c Kd Kh'), 4);
  assert.strictEqual(cat('Tc Jd Qh Ks Ac 2d 2h'), 4);
  assert.strictEqual(cat('7c 7d 7h Ks Ac 2d 3h'), 3);
  assert.strictEqual(cat('7c 7d Kh Ks Ac 2d 3h'), 2);
  assert.strictEqual(cat('7c 7d Kh Ks 2c 2d 3h'), 2);
  assert.strictEqual(cat('7c 7d Kh Qs Ac 2d 3h'), 1);
  assert.strictEqual(cat('7c 8d Kh Qs Ac 2d 3h'), 0);
  assert.strictEqual(cat('Kd Kc 7h 2s'), 1); // 4 cards: pair only
  assert.strictEqual(HandEval.describe(sc('Ac 2d 3h 4s 5c Kd Kh')), 'Стрит до пятёрки');
  assert.strictEqual(HandEval.describe(sc('As Ks Qs Js Ts 2d 3c')), 'Роял-флеш');
  assert.strictEqual(HandEval.describe(sc('7c 7d Kh Ks Ac 2d 3h')), 'Две пары: короли и семёрки');
  assert.strictEqual(HandEval.describe(sc('9c 9d 9h 2s 2d 3c 4h')), 'Фулл-хаус: тройка девяток и пара двоек');
});

test('handeval: comparisons and kickers', () => {
  const gt = (a, b) => assert.ok(sc(a) > sc(b), `${a} > ${b}`);
  const eq = (a, b) => assert.strictEqual(sc(a), sc(b), `${a} == ${b}`);
  gt('Ac Kd 7h 7s 2c 3d 9h', 'Qc Jd 7h 7s 2c 3d 9h');       // pair kicker
  eq('Ac Kd 7h 7s Qc Jd 9h', 'Ac Kd 7h 7s Qc Jd 2h');       // 6th/7th card irrelevant
  gt('2c 3d 4h 5s 6c Kd Kh', 'Ac 2d 3h 4s 5c Kd Kh');       // 6-high straight > wheel
  gt('Ac 9c 7c 4c 3c', 'Ac 9c 7c 4c 2c');                   // flush 5th kicker
  gt('9c 9d 9h 2s 2d', 'Ac Kc Qc Jc 9c');                   // full house > flush
  gt('Kc Kd Kh 2s 2d', 'Qc Qd Qh As Ad');
  gt('7c 7d 3h 3s Ac', '7c 7d 3h 3s Kc');                   // two pair kicker
  eq('7c 7d 3h 3s 2c 2d Ac', '7h 7s 3c 3d Ad 5c 4c');       // 3 pairs: best two + kicker A
  gt('8c 8d 8h 8s 2c', '7c 7d 7h 7s Ac');
});

test('handeval: best five cards', () => {
  const r = HandEval.evaluate(C('Ah Kh 9h 5h 2c Th 3d'));
  assert.strictEqual(r.cat, 5);
  assert.strictEqual(r.best.length, 5);
  assert.ok(r.best.every((c) => Cards.suit(c) === 1));
  assert.strictEqual(HandEval.score(r.best), r.score);
});

test('equity: exact enumeration on turn (flush draw)', () => {
  // A♥K♥ on 9♥5♥2♣7♠ vs Q♠Q♦: hero wins with 9 hearts + 3 aces + 3 kings = 15 of 44 rivers
  const r = Equity.calc([C('Ah Kh'), C('Qs Qd')], C('9h 5h 2c 7s'));
  assert.ok(r.exact);
  assert.strictEqual(r.samples, 44);
  assert.ok(Math.abs(r.eq[0] - 15 / 44) < 1e-9, r.eq[0]);
  assert.ok(Math.abs(r.eq[0] + r.eq[1] - 1) < 1e-9);
});

test('equity: next card only (toCome = 1) on flop', () => {
  // 9 hearts vs a set of deuces → only 8 win on the turn: 2♥ gives villain quads (a "dirty" out)
  const r = Equity.calc([C('Ah Kh'), C('2s 2d')], C('9h 5h 2c'), { toCome: 1 });
  assert.strictEqual(r.samples, 45);
  assert.ok(Math.abs(r.eq[0] - 8 / 45) < 1e-9, r.eq[0]);
});

test('equity: preflop MC sanity', () => {
  U.seed(7);
  const r = Equity.calc([C('As Ad'), C('Ks Kd')], [], { iters: 20000 });
  assert.ok(!r.exact);
  assert.ok(r.eq[0] > 0.79 && r.eq[0] < 0.84, r.eq[0]);
  const v = Equity.vsRandom(C('As Ad'), [], 1, { iters: 20000 });
  assert.ok(v > 0.83 && v < 0.87, v);
  const f = Equity.vsRandom(C('7c 2d'), [], 1, { iters: 20000, oppFilter: (h) => Equity.holeTopPct(h) <= 0.05 });
  assert.ok(f < 0.25, 'vs top-5% range 72o is crushed: ' + f);
  U.seed(null);
});

test('equity: preflop order', () => {
  assert.strictEqual(Equity.PREFLOP_ORDER.length, 169);
  assert.strictEqual(new Set(Equity.PREFLOP_ORDER).size, 169);
  assert.strictEqual(Equity.PREFLOP_ORDER[0], 'AA');
  assert.strictEqual(Equity.PREFLOP_ORDER[168], '32o');
  assert.ok(Math.abs(Equity.preflopTopPct('32o') - 1) < 1e-9);
  assert.ok(Equity.preflopTopPct('AKs') < Equity.preflopTopPct('KQo'));
  assert.ok(Equity.preflopTopPct('76s') < Equity.preflopTopPct('76o'));
});

test('util: plural and formatting', () => {
  assert.strictEqual(U.plural(1, 'аут', 'аута', 'аутов'), 'аут');
  assert.strictEqual(U.plural(3, 'аут', 'аута', 'аутов'), 'аута');
  assert.strictEqual(U.plural(11, 'аут', 'аута', 'аутов'), 'аутов');
  assert.strictEqual(U.plural(21, 'аут', 'аута', 'аутов'), 'аут');
  assert.strictEqual(U.pct(0.196, 1), '19,6%');
  assert.strictEqual(U.fmt(12500), '12 500');
  U.seed(1); const a = [U.rng(), U.rng()]; U.seed(1); assert.deepStrictEqual([U.rng(), U.rng()], a); U.seed(null);
});
