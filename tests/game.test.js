// Game controller: pure helpers (the DOM flow is covered by tools/e2e.js)
test('game: eliminations rank simultaneous busts by starting stack', () => {
  const players = [{ seat: 0, stack: 0 }, { seat: 1, stack: 0 }, { seat: 2, stack: 900 }, { seat: 3, stack: 0, busted: true, place: 4 }, { seat: 4, stack: 0 }];
  const out = Game.eliminate(players, [300, 800, 100, 0, 50]);
  // 4 alive before the hand → places 4, 3, 2 for the three busts; the smallest starting stack is out first
  assert.deepStrictEqual(out.map((p) => [p.seat, p.place]), [[4, 4], [0, 3], [1, 2]]);
  assert.ok(players[0].busted && players[1].busted && !players[2].busted);
  assert.strictEqual(players[3].place, 4, 'earlier busts keep their place');
  assert.deepStrictEqual(Game.eliminate(players, [0, 0, 0, 0, 0]), [], 'nobody new');
});

test('game: genitive names for «Стиль Игоря»', () => {
  const g = (n) => Game.gen(n);
  assert.deepStrictEqual(['Игорь', 'Олег', 'Марина', 'Дмитрий', 'Сергей', 'Наталья', 'Ольга', 'Павел', 'Юлия', 'Николай', 'Игорь 2'].map(g),
    ['Игоря', 'Олега', 'Марины', 'Дмитрия', 'Сергея', 'Натальи', 'Ольги', 'Павла', 'Юлии', 'Николая', 'Игоря 2']);
  for (const n of Bots.NAMES) assert.ok(g(n) !== n && /^[А-ЯЁ][а-яё]+$/.test(g(n)), n + ' → ' + g(n));
});

test('game: post-hand real-equity notes — only asked spots, one per street (last decision)', () => {
  const sp = (street, asked, total = 8, id = street) => ({ id, street, asked, outs: { total }, board: [] });
  const flopA = sp('flop', true, 8, 'f1'), flopB = sp('flop', true, 8, 'f2');
  const got = Game.reviewSpots([flopA, sp('turn', false), flopB, sp('river', true, 0)]);
  assert.deepStrictEqual(got.map((s) => s.id), ['f2'], 'duplicate street collapsed, unasked and no-outs spots dropped');
  assert.deepStrictEqual(Game.reviewSpots([sp('flop', true), sp('turn', true)]).map((s) => s.id), ['flop', 'turn']);
});

test('game: showdown kicker note when both hands share a name', () => {
  const C = (s) => Cards.parseList(s);
  const board = C('A♥ 9♣ 5♦ 3♠ 2♥');
  const ev = [C('A♣ K♦'), C('A♦ Q♠'), C('7♣ 7♦')].map((h) => HandEval.evaluate([...h, ...board]));
  const res = { uncontested: false, scores: ev.map((e) => e.score), names: ev.map((e) => e.name) };
  assert.strictEqual(Game.kickerNote(res, 0, [0, 1, 2]), ', кикер король против дамы');
  assert.strictEqual(Game.kickerNote(res, 0, [0, 2]), '', 'different hand names need no kicker');
  assert.strictEqual(Game.kickerNote({ ...res, uncontested: true }, 0, [0, 1]), '');
  const b2 = C('8♦ A♠ K♥ J♣ 10♦'), e2 = [C('3♥ 7♦'), C('4♠ 9♠')].map((h) => HandEval.evaluate([...h, ...b2]));
  const r2 = { scores: e2.map((e) => e.score), names: e2.map((e) => e.name) };
  assert.strictEqual(Game.kickerNote(r2, 1, [0, 1]), ', кикер девятка против восьмёрки');
});

test('game: read review quotes the think time the player saw', () => {
  const fb = { lines: ['Признаки:', 'Тайминг: долгое раздумье (3,2 с) — сомнение', 'Размер (3,2 с)'] };
  Game.shownSeconds(fb, 3200, 3200 * 0.45);
  assert.deepStrictEqual(fb.lines, ['Признаки:', 'Тайминг: долгое раздумье (1,4 с) — сомнение', 'Размер (3,2 с)']);
});

test('ui: raise sizes are chip-friendly and beginner-standard', () => {
  const L = { minTo: 40, maxTo: 2000 };
  assert.strictEqual(UI.nice(477, L, 20), 480);
  assert.strictEqual(UI.nice(106, L, 20), 110);
  assert.strictEqual(UI.nice(33, L, 20), 40, 'never below the minimum raise');
  assert.strictEqual(UI.nice(1617, L, 20), 1600);
  assert.strictEqual(UI.nice(1990, L, 20), 2000, 'close to all-in → exact all-in');
  assert.strictEqual(UI.nice(1950, { minTo: 40, maxTo: 1957 }, 20), 1957);
  // preflop: unopened with one limper → 3 BB + 1 BB; facing a raise → ×3
  U.seed(7);
  const players = [0, 1, 2, 3, 4, 5].map((i) => ({ name: 'P' + i, stack: 2000 }));
  const t = Engine.createTable({ players, sb: 10, bb: 20, button: 5 });
  const h = Engine.startHand(t); // seats: 0 SB, 1 BB, 2 UTG …, 5 BTN
  while (h.toAct !== 0) Engine.act(h, { type: h.toAct === 2 ? 'call' : 'fold' });
  let Lg = Engine.legal(h);
  assert.strictEqual(UI.defaultRaise(h, Lg), 80, 'open 3 BB + 1 BB for the limper');
  assert.deepStrictEqual(UI.quickSizes(h, Lg).map((q) => q[0]), ['2,5 BB', '3 BB', '4 BB', 'Банк', 'Олл-ин']);
  assert.deepStrictEqual(UI.quickSizes(h, Lg).slice(0, 3).map((q) => q[1]), [70, 80, 100]);
  Engine.act(h, { type: 'raise', to: 60 });
  Engine.act(h, { type: 'raise', to: 180 }); // BB 3-bets
  Engine.act(h, { type: 'fold' });
  Lg = Engine.legal(h);
  assert.strictEqual(h.toAct, 0);
  assert.strictEqual(UI.defaultRaise(h, Lg), 540, '×3 against a raise');
  assert.deepStrictEqual(UI.quickSizes(h, Lg).map((q) => q[0]).slice(0, 3), ['×2,5', '×3', '×4']);
  for (const [, v] of UI.quickSizes(h, Lg)) assert.ok(v >= Lg.minTo && v <= Lg.maxTo);
  U.seed(null);
});

test('ui: side pots never show an uncalled excess', () => {
  // 0: 2000 (all-in, covers everyone), 1: 300 all-in, 2: 800 all-in, 3: 1500 all-in
  const h = { seats: [0, 1, 2, 3], committed: [2000, 300, 800, 1500], returned: [0, 0, 0, 0], allIn: [true, true, true, true], folded: [false, false, false, false] };
  assert.deepStrictEqual(UI.sidePots(h), [1200, 1500, 1400]);
  h.returned[0] = 500; // after Engine returns it
  assert.deepStrictEqual(UI.sidePots(h), [1200, 1500, 1400]);
});
