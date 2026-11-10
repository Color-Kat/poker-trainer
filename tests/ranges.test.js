// Ranges: preflop tables, situations, verdicts and texts — hands built with the real Engine.
(() => {
  const NAMES = ['Ты', 'Игорь', 'Марина', 'Олег', 'Анна', 'Сергей', 'Ольга', 'Павел', 'Вера'];
  // Hero = seat 0 at position `pos` on an n-handed table. Engine deals with deck.pop() from the END:
  // two hole cards per seat in hand.seats order, so the hero's cards are placed where seat 0 is dealt.
  function deal(n, pos, hole, { stacks = {} } = {}) {
    const k = Engine.positionNames(n).indexOf(pos);
    const button = n === 2 ? (pos === 'BTN' ? 0 : 1) : (((n - 3 - k) % n) + n) % n;
    const table = Engine.createTable({ button, players: NAMES.slice(0, n).map((name, i) => ({ name, isHuman: !i, style: i ? 'reg' : null, stack: stacks[i] || 2000 })) });
    const mine = Cards.parseList(hole), rest = Cards.deck().filter((c) => !mine.includes(c));
    const seq = [];
    for (let j = 1; j <= n; j++) seq.push(...((button + j) % n === 0 ? mine : [rest.shift(), rest.shift()]));
    const hand = Engine.startHand(table, { deck: [...rest, ...seq.reverse()] });
    assert.strictEqual(hand.pos[0], pos);
    return { table, hand };
  }
  const act = (hand, a) => { const [type, to] = a.split(':'); return Engine.act(hand, { type, to: to && +to }); };
  // Others act per script (in turn order), everybody else folds until it is the hero's turn.
  function at(n, pos, hole, script = [], opts) {
    const { table, hand } = deal(n, pos, hole, opts);
    for (const a of script) act(hand, a);
    while (hand.toAct !== 0) act(hand, 'fold');
    return { table, hand };
  }
  const ev = ({ hand, table }, type) => Ranges.evaluate(hand, 0, { type }, table);
  const verdict = (s, type) => ev(s, type).verdict;
  const all = (fb) => [...fb.lines, ...(fb.more || [])];

  test('ranges: SPEC 6.1 table texts, SB/BB = CO, borders one step below', () => {
    const T = Ranges.OPEN_TEXT;
    assert.strictEqual(T.UTG, '77+, AJs+, AQo+, KQs');
    assert.strictEqual(T['UTG+1'], T.UTG);
    assert.strictEqual(T.MP, '55+, ATs+, AJo+, KJs+, QJs, JTs, KQo');
    assert.strictEqual(T.LJ, T.MP);
    assert.strictEqual(T.HJ, '22+, A9s+, ATo+, KTs+, QTs+, JTs, T9s, KJo+');
    assert.strictEqual(T.CO, '22+, A2s+, A9o+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, KTo+, QTo+, JTo');
    assert.strictEqual(T.BTN, '22+, A2s+, A7o+, K7s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, K9o+, Q9o+, J9o+, T9o');
    assert.strictEqual(T.SB, T.CO);
    assert.strictEqual(T.BB, T.CO);
    const sorted = (s) => [...s].sort();
    assert.deepStrictEqual(sorted(Ranges.border('UTG')), ['66', 'ATs', 'AJo', 'KJs'].sort());
    assert.deepStrictEqual(sorted(Ranges.border('MP')), ['44', 'A9s', 'ATo', 'KTs', 'QTs', 'J9s', 'KJo'].sort());
    assert.deepStrictEqual(sorted(Ranges.border('CO')), ['A8o', 'K8s', 'Q8s', 'J8s', 'T8s', '97s', '86s', 'K9o', 'Q9o', 'J9o'].sort());
    for (const p of Engine.POSITIONS) {
      assert.ok(Ranges.open(p).size > 10, p);
      for (const c of Ranges.border(p)) assert.ok(!Ranges.open(p).has(c), p + ' ' + c);
      assert.ok(['Ранняя', 'Средняя', 'Поздняя', 'Блайнд'].includes(Ranges.POS_INFO[p].group), p);
      assert.ok(Ranges.POS_INFO[p].text.length > 40, p);
    }
    assert.strictEqual(Ranges.POS_INFO.UTG.group, 'Ранняя');
    assert.strictEqual(Ranges.POS_INFO.HJ.group, 'Средняя');
    assert.strictEqual(Ranges.POS_INFO.BTN.group, 'Поздняя');
    assert.strictEqual(Ranges.POS_INFO.SB.group, 'Блайнд');
  });

  test('ranges: grids are 13×13 with the right classes', () => {
    for (const key of ['UTG', 'BTN', 'BB', 'vsRaise', 'vs3bet']) {
      const g = Ranges.grid(key);
      assert.strictEqual(g.length, 13);
      g.forEach((row, i) => { assert.strictEqual(row.length, 13); row.forEach((c, j) => assert.strictEqual(c.code, Cards.gridCode(i, j))); });
    }
    const count = (key) => Ranges.grid(key).flat().reduce((a, c) => ((a[c.cls] = (a[c.cls] || 0) + 1), a), {});
    assert.deepStrictEqual(count('UTG'), { in: 14, border: 4, out: 151 });
    // no position / stack: connectors, small pairs and borderline calls are conditional ('border'), as in VS_RAISE_TEXT
    assert.deepStrictEqual(count('vsRaise'), { raise: 5, call: 8, border: 15, out: 141 });
    assert.deepStrictEqual(count('vs3bet'), { raise: 5, border: 2, out: 162 });
    assert.strictEqual(Ranges.grid('vsRaise')[2][2].cls, 'raise');  // QQ
    assert.strictEqual(Ranges.grid('vsRaise')[3][3].cls, 'call');   // JJ
    assert.strictEqual(Ranges.grid('BB')[0][12].cls, 'in');         // A2s: BB raises with the CO range
  });

  test('ranges: the vs-raise grid follows the hero position and stack, like the verdict (SPEC 6.3)', () => {
    const cell = (key, code, ctx) => Ranges.grid(key, ctx).flat().find((c) => c.code === code).cls;
    assert.strictEqual(cell('vsRaise:UTG+1', '87s'), 'out');
    assert.strictEqual(cell('vsRaise:MP', 'QJs'), 'border');
    assert.strictEqual(cell('vsRaise:BTN', '87s'), 'call');
    assert.strictEqual(cell('vsRaise', '87s', { pos: 'CO' }), 'call');
    assert.strictEqual(cell('vsRaise:BTN', '33'), 'border');              // stack unknown
    assert.strictEqual(cell('vsRaise:BTN', '33', { deep: true }), 'call');
    assert.strictEqual(cell('vsRaise:BTN', '33', { deep: false }), 'out');
    assert.strictEqual(cell('vsRaise:UTG', 'AQo'), 'border');
    assert.strictEqual(cell('vs3bet', 'JJ'), 'border');
    assert.ok(Ranges.VS_RAISE_TEXT.includes('только на BTN/CO'));
    // the grid agrees with the verdict for a real spot: UTG+1 calls a raise with 87s
    const h = at(9, 'UTG+1', '8h 7h', ['raise:50']);
    assert.strictEqual(verdict(h, 'call'), 'mistake');
  });

  test('ranges: BB defends against a steal — heads-up KQo call is correct, vs a 9-max BTN it is acceptable', () => {
    const hu = at(2, 'BB', 'Kd Qc', ['raise:50']);
    const e = ev(hu, 'call');
    assert.strictEqual(e.verdict, 'correct');
    assert.ok(all(e).some((l) => l.startsWith('Но на BB ты уже вложил блайнд и закрываешь торговлю')), e.lines.join('\n'));
    assert.strictEqual(verdict(hu, 'fold'), 'acceptable');
    assert.strictEqual(verdict(at(2, 'BB', '7c 2d', ['raise:50']), 'call'), 'mistake'); // not in the BTN range
    // 9-max: everybody folds to the BTN, who raises; the BB calls A9o
    const btn = at(9, 'BB', 'As 9d', ['fold', 'fold', 'fold', 'fold', 'fold', 'fold', 'raise:50', 'fold']);
    assert.strictEqual(btn.hand.pos[Ranges.situation(btn.hand, 0).raiser], 'BTN');
    assert.strictEqual(verdict(btn, 'call'), 'acceptable');
    assert.strictEqual(verdict(btn, 'fold'), 'correct');
    // an early raise is no steal: still a fold
    assert.strictEqual(verdict(at(9, 'BB', 'As 9d', ['raise:50']), 'call'), 'mistake');
  });

  test('ranges: SPEC 6.3 — UTG at 9 limps K-J offsuit', () => {
    const s = at(9, 'UTG', 'Kd Jc');
    const sit = Ranges.situation(s.hand, 0);
    assert.strictEqual(sit.kind, 'open');
    assert.strictEqual(sit.playersAfter, 8);
    assert.strictEqual(sit.n, 9);
    const fb = ev(s, 'call');
    assert.strictEqual(fb.kind, 'preflop');
    assert.strictEqual(fb.verdict, 'mistake');
    assert.strictEqual(fb.best, 'fold');
    assert.strictEqual(fb.code, 'KJo');
    assert.strictEqual(fb.title, '❌ Префлоп: ты сыграл «колл», правильно — сбросить.');
    assert.deepStrictEqual(fb.lines, ['K-J разномастные не входят в диапазон UTG — сброс.']);
    assert.strictEqual(fb.more[0], 'Ты на позиции UTG за столом на 9. После тебя ещё 8 игроков.');
    assert.deepStrictEqual(fb.grid, { key: 'UTG', hl: 'KJo' });
    assert.strictEqual(verdict(s, 'fold'), 'correct');
    assert.strictEqual(verdict(s, 'raise'), 'mistake');
  });

  test('ranges: open — in range, border (acceptable), limp with a range hand', () => {
    const aq = at(9, 'UTG', 'Ah Qh');
    assert.strictEqual(ev(aq, 'raise').title, '✅ Префлоп: рейз — верно.');
    assert.strictEqual(verdict(aq, 'fold'), 'mistake');
    const limp = ev(aq, 'call');
    assert.strictEqual(limp.verdict, 'mistake');
    assert.ok(all(limp).includes('Лимп отдаёт инициативу — либо рейз, либо сброс.'));
    assert.ok(all(limp).includes('A-Q одномастные входят в диапазон UTG — открывай рейзом.'));
    const sixes = at(9, 'UTG+1', '6s 6d');
    const b = ev(sixes, 'raise');
    assert.strictEqual(b.verdict, 'acceptable');
    assert.strictEqual(b.title, '⚠️ Префлоп: рейз — допустимо.');
    assert.ok(all(b).some((l) => l.includes('на границе диапазона UTG+1')));
    assert.ok(all(b).some((l) => l.startsWith('Пара шестёрок')));
    assert.strictEqual(verdict(sixes, 'fold'), 'correct');
    assert.strictEqual(verdict(sixes, 'call'), 'mistake');
    // CO: J8s is border (one step below J9s+), J7s is out
    assert.strictEqual(verdict(at(9, 'CO', 'Js 8s'), 'raise'), 'acceptable');
    assert.strictEqual(verdict(at(9, 'CO', 'Js 7s'), 'raise'), 'mistake');
    // SB opens with the CO range; one player behind
    const sb = at(9, 'SB', 'Kh 9h');
    assert.strictEqual(verdict(sb, 'raise'), 'correct');
    assert.ok(ev(sb, 'raise').more[0].endsWith('После тебя ещё 1 игрок.'));
    assert.ok(ev(at(9, 'CO', 'Ah Ad'), 'raise').more[0].endsWith('После тебя ещё 3 игрока.'));
  });

  test('ranges: 6-handed — the first position (LJ) uses the MP/LJ range', () => {
    const s = at(6, 'LJ', '5c 5d');
    const sit = Ranges.situation(s.hand, 0);
    assert.strictEqual(sit.kind, 'open');
    assert.strictEqual(sit.playersAfter, 5);
    const fb = ev(s, 'raise');
    assert.strictEqual(fb.verdict, 'correct');
    assert.strictEqual(fb.more[0], 'Ты на позиции LJ за столом на 6. После тебя ещё 5 игроков.');
    assert.strictEqual(verdict(at(6, 'LJ', '4c 4d'), 'raise'), 'acceptable');
    assert.strictEqual(verdict(at(6, 'LJ', 'Kc Td'), 'raise'), 'mistake');
    assert.strictEqual(verdict(at(6, 'BTN', 'Kc 9d'), 'raise'), 'correct');
  });

  test('ranges: heads-up — BTN opens with the BTN range, BB option', () => {
    const btn = at(2, 'BTN', 'Kd 9c');
    assert.strictEqual(Ranges.situation(btn.hand, 0).kind, 'open');
    assert.strictEqual(Ranges.situation(btn.hand, 0).playersAfter, 1);
    assert.strictEqual(verdict(btn, 'raise'), 'correct');
    assert.strictEqual(verdict(at(2, 'BTN', '8d 5c'), 'raise'), 'mistake');
    // BB after the button limps
    const bb = at(2, 'BB', '7c 2d', ['call']);
    const sit = Ranges.situation(bb.hand, 0);
    assert.strictEqual(sit.kind, 'bbOption');
    assert.strictEqual(sit.toCall, 0);
    assert.strictEqual(verdict(bb, 'check'), 'correct');
    assert.strictEqual(verdict(bb, 'call'), 'correct'); // call with nothing to call = check
    assert.strictEqual(verdict(bb, 'raise'), 'mistake');
    const fold = ev(bb, 'fold');
    assert.strictEqual(fold.verdict, 'mistake');
    assert.ok(all(fold).includes('Никогда не сбрасывай, когда можно бесплатно чекнуть.'));
    assert.strictEqual(fold.title, '❌ Префлоп: ты сыграл «сброс», правильно — чекнуть.');
    const a9 = at(2, 'BB', 'Ac 9d', ['call']);
    assert.strictEqual(verdict(a9, 'raise'), 'correct');
    assert.strictEqual(verdict(a9, 'check'), 'correct');
    assert.strictEqual(ev(a9, 'fold').title, '❌ Префлоп: ты сыграл «сброс», правильно — сделать рейз (или чекнуть).');
  });

  test('ranges: limped pots — raise with the open range, over-limp only speculative hands late', () => {
    const btn = at(9, 'BTN', '7h 6h', ['call']); // UTG limps
    const sit = Ranges.situation(btn.hand, 0);
    assert.strictEqual(sit.kind, 'limped');
    assert.strictEqual(sit.limpers, 1);
    assert.strictEqual(verdict(btn, 'raise'), 'correct');
    assert.strictEqual(verdict(btn, 'call'), 'acceptable');
    assert.strictEqual(verdict(at(9, 'CO', '2h 2c', ['call', 'call']), 'call'), 'acceptable');
    const junk = ev(at(9, 'BTN', 'Kh 2c', ['call']), 'call');
    assert.strictEqual(junk.verdict, 'mistake');
    assert.ok(all(junk).includes('Доплачивать с такой рукой — лишние потери: она слабая и без потенциала.'));
    const mp = at(9, 'MP', '9h 8h', ['call']);
    assert.strictEqual(verdict(mp, 'fold'), 'correct');
    assert.strictEqual(verdict(mp, 'call'), 'mistake');  // speculative, but not in late position
    assert.strictEqual(verdict(at(9, 'HJ', 'Ac Kd', ['call']), 'call'), 'mistake');
    assert.ok(all(ev(at(9, 'CO', 'Ac Kd', ['call', 'call']), 'raise')).some((l) => l.startsWith('Перед тобой 2 лимпера')));
  });

  test('ranges: vs a raise — 3-bet, set mining by stack, connectors only on BTN/CO, borders', () => {
    const vs = (pos, hole, opts) => at(9, pos, hole, ['raise:60'], opts); // UTG raises to 60
    const qq = vs('BTN', 'Qh Qd');
    const sit = Ranges.situation(qq.hand, 0);
    assert.strictEqual(sit.kind, 'vsRaise');
    assert.strictEqual(sit.raiser, qq.hand.order[0]);
    assert.strictEqual(sit.raiseTo, 60);
    assert.strictEqual(sit.playersAfter, 2);
    assert.strictEqual(ev(qq, 'raise').title, '✅ Префлоп: 3-бет — верно.');
    assert.strictEqual(verdict(qq, 'call'), 'acceptable');
    assert.strictEqual(verdict(qq, 'fold'), 'mistake');
    assert.ok(all(ev(qq, 'call')).includes(`${qq.table.players[qq.hand.order[0]].name} (UTG) повышает до 60.`));
    // set mining: 2000 / 60 = 33 raises → call; 1000 / 60 = 16 → fold
    const deep = vs('BTN', '5h 5d');
    assert.strictEqual(Ranges.situation(deep.hand, 0).effStack, 2000);
    assert.strictEqual(verdict(deep, 'call'), 'correct');
    assert.ok(all(ev(deep, 'call')).includes('Игра на сет: нужно ≥ 20 рейзов соперника в стеке, у тебя 33 — хватает, колл.'));
    const shallow = vs('BTN', '5h 5d', { stacks: { 0: 1000 } });
    assert.strictEqual(Ranges.situation(shallow.hand, 0).effStack, 1000);
    const sh = ev(shallow, 'call');
    assert.strictEqual(sh.verdict, 'mistake');
    assert.strictEqual(sh.title, '❌ Префлоп: ты сыграл «колл», правильно — сбросить.');
    assert.ok(all(sh).includes('Игра на сет: нужно ≥ 20 рейзов соперника в стеке, у тебя 16 — мало, сброс.'));
    assert.strictEqual(verdict(shallow, 'fold'), 'correct');
    assert.strictEqual(verdict(vs('CO', '9h 9d', { stacks: { 0: 600 } }), 'call'), 'correct'); // 77+ do not need the stack rule
    assert.strictEqual(verdict(vs('BTN', 'Jh Jd'), 'raise'), 'acceptable');
    assert.strictEqual(verdict(vs('BTN', '9h 9d'), 'raise'), 'mistake');
    assert.strictEqual(verdict(vs('MP', 'Ah Qh'), 'raise'), 'acceptable');
    assert.strictEqual(verdict(vs('MP', 'Kh Qh'), 'call'), 'correct');
    assert.strictEqual(verdict(vs('MP', 'Kh Qh'), 'raise'), 'mistake');
    assert.strictEqual(verdict(vs('BTN', '8h 7h'), 'call'), 'correct');
    assert.strictEqual(verdict(vs('MP', '8h 7h'), 'call'), 'mistake');
    assert.strictEqual(verdict(vs('MP', '8h 7h'), 'fold'), 'correct');
    assert.strictEqual(verdict(vs('SB', 'Qh Jh'), 'call'), 'acceptable');  // QJs outside BTN/CO is border
    assert.strictEqual(verdict(vs('CO', 'Qh Jh'), 'call'), 'correct');
    assert.strictEqual(verdict(vs('BTN', '6h 5h'), 'call'), 'acceptable');
    assert.strictEqual(verdict(vs('MP', '6h 5h'), 'call'), 'mistake');
    assert.strictEqual(verdict(vs('HJ', 'Ah Qd'), 'call'), 'acceptable');
    const junk = ev(vs('BB', '7h 2d'), 'call');
    assert.strictEqual(junk.verdict, 'mistake');
    assert.ok(junk.more[0].endsWith('После тебя никого нет — ты ходишь последним.'));
  });

  test('ranges: vs a 3-bet — only QQ+ and AK continue', () => {
    const three = (hole) => {
      const { table, hand } = deal(9, 'UTG', hole);
      act(hand, 'raise:60');                              // hero opens
      for (let k = 0; k < 4; k++) act(hand, 'fold');      // UTG+1 … HJ
      act(hand, 'raise:180');                              // CO 3-bets
      while (hand.toAct !== 0) act(hand, 'fold');
      return { table, hand };
    };
    const ak = three('Ac Kd');
    const sit = Ranges.situation(ak.hand, 0);
    assert.strictEqual(sit.kind, 'vs3bet');
    assert.strictEqual(sit.raises, 2);
    assert.strictEqual(sit.raiseTo, 180);
    assert.strictEqual(sit.toCall, 120);
    assert.strictEqual(ev(ak, 'raise').title, '✅ Префлоп: 4-бет — верно.');
    assert.strictEqual(verdict(ak, 'call'), 'acceptable');
    assert.strictEqual(verdict(ak, 'fold'), 'mistake');
    const jj = three('Jh Jd');
    assert.strictEqual(verdict(jj, 'call'), 'acceptable');
    assert.strictEqual(verdict(jj, 'fold'), 'correct');
    assert.strictEqual(verdict(jj, 'raise'), 'mistake');
    assert.strictEqual(verdict(three('9h 9d'), 'call'), 'mistake');
  });

  test('ranges: evaluation right after Engine.act matches evaluation before it', () => {
    for (const [pos, hole, script, type] of [['UTG', 'Kd Jc', [], 'call'], ['BTN', '5h 5d', ['raise:60'], 'call'], ['BB', '7c 2d', ['call'], 'check']]) {
      const s = at(9, pos, hole, script);
      const before = ev(s, type);
      Engine.act(s.hand, { type });
      const after = ev(s, type);
      assert.deepStrictEqual({ ...after, situation: null }, { ...before, situation: null }, pos);
      assert.strictEqual(after.situation.kind, before.situation.kind);
    }
  });

  // ---------- audit: all-ins (a raise may be impossible, the price may be tiny) ----------
  test('audit: facing an all-in that covers the hero — call is the way to continue with QQ+/AK', () => {
    const s = at(9, 'BTN', 'Ah Ad', ['raise:2000']);                     // UTG shoves 100 BB
    assert.strictEqual(Ranges.situation(s.hand, 0).canRaise, false);
    const call = ev(s, 'call');
    assert.strictEqual(call.verdict, 'correct');
    assert.strictEqual(call.best, 'call');
    assert.strictEqual(ev(s, 'fold').title, '❌ Префлоп: ты сыграл «сброс», правильно — заколлировать.');
    assert.ok(!('raise' in call.verdicts));
    // the hero opened, the 3-bet is a shove that covers him: no 4-bet possible
    const { table, hand } = deal(9, 'UTG', 'Ac Kd');
    act(hand, 'raise:60');
    for (let k = 0; k < 4; k++) act(hand, 'fold');
    act(hand, 'raise:2000');
    while (hand.toAct !== 0) act(hand, 'fold');
    assert.strictEqual(verdict({ table, hand }, 'call'), 'correct');
    assert.strictEqual(verdict({ table, hand }, 'fold'), 'mistake');
  });

  test('audit: a short all-in at a tiny price is a call with any hand', () => {
    // hero opens AJs, the 80-chip BB shoves (incomplete raise): 20 more into 150
    const { table, hand } = deal(9, 'UTG', 'Ah Jh', { stacks: { 8: 80 } });
    act(hand, 'raise:60');
    while (hand.toAct !== 8) act(hand, 'fold');
    act(hand, 'raise:80');
    const sit = Ranges.situation(hand, 0);
    assert.deepStrictEqual([sit.kind, sit.canRaise, sit.toCall], ['vs3bet', false, 20]);
    const fb = Ranges.evaluate(hand, 0, { type: 'call' }, table);
    assert.strictEqual(fb.verdict, 'correct');
    assert.ok(all(fb).some((l) => l.includes('доплатить нужно всего 20') && l.includes('12%')), fb.lines.join(' | '));
    assert.strictEqual(Ranges.evaluate(hand, 0, { type: 'fold' }, table).verdict, 'mistake');
    // big blind, a 30-chip UTG shove: 10 more into 60 even with 7-2
    const bb = at(9, 'BB', '7h 2d', ['raise:30'], { stacks: { 1: 30 } });
    assert.strictEqual(verdict(bb, 'call'), 'correct');
    assert.strictEqual(verdict(bb, 'fold'), 'mistake');
    // an ordinary raise is still judged by the table
    assert.strictEqual(verdict(at(9, 'BB', '7h 2d', ['raise:60']), 'fold'), 'correct');
    // the hero's own call is all-in for 5 more into 95
    const tiny = at(9, 'BB', '7h 2d', ['raise:60'], { stacks: { 0: 25 } });
    assert.strictEqual(verdict(tiny, 'call'), 'correct');
    assert.ok(all(ev(tiny, 'call')).some((l) => l.startsWith('Твой колл — это олл-ин, и доплатить нужно всего 5 при банке 90')));
    // 15 chips under the gun: no raise is possible, so a range hand just goes in with a call
    const short = at(9, 'UTG', 'Ah Ad', [], { stacks: { 0: 15 } });
    assert.strictEqual(Ranges.situation(short.hand, 0).canRaise, false);
    assert.deepStrictEqual([verdict(short, 'call'), ev(short, 'fold').title], ['correct', '❌ Префлоп: ты сыграл «сброс», правильно — заколлировать.']);
  });

  test('audit: the hint mentions the price of a cheap all-in', () => {
    const bb = at(9, 'BB', '7h 2d', ['raise:30'], { stacks: { 1: 30 } });
    assert.ok(all(Ranges.hint(bb.hand, 0, bb.table)).some((l) => l.includes('доплатить нужно всего 10 при банке 60')));
    const normal = at(9, 'BB', '7h 2d', ['raise:60']);
    assert.ok(!all(Ranges.hint(normal.hand, 0, normal.table)).some((l) => l.includes('доплатить нужно всего')));
  });

  test('audit: over-limp text fits the small blind too', () => {
    const fb = ev(at(9, 'SB', '9h 8h', ['call']), 'call');
    assert.strictEqual(fb.verdict, 'acceptable');
    assert.ok(all(fb).includes('Доплатить (оверлимп) допустимо: пары, одномастные коннекторы и одномастные тузы в поздней позиции и на малом блайнде дёшево смотрят флоп.'), fb.lines.join(' | '));
  });

  test('ranges: hint explains position, situation and range without a verdict', () => {
    const h = Ranges.hint(at(9, 'UTG', 'Kd Jc').hand, 0);
    assert.strictEqual(h.title, '💡 Подсказка: UTG — ранняя позиция');
    assert.deepStrictEqual(h.grid, { key: 'UTG', hl: 'KJo' });
    assert.ok(!all(h).some((l) => /[2-9TJQKA]{2}[so]?\+,/.test(l)), 'no range lists');
    assert.ok(all(h).some((l) => l.includes('(K-J разномастные)')));
    assert.ok(!h.lines.join(' ').includes('Правильно'));
    const s = at(9, 'BTN', '5h 5d', ['raise:60'], { stacks: { 0: 1000 } });
    const v = Ranges.hint(s.hand, 0, s.table);
    assert.strictEqual(v.title, '💡 Подсказка: BTN — поздняя позиция');
    assert.ok(all(v).some((l) => l.includes(`${s.table.players[s.hand.order[0]].name} (UTG) повышает до 60`)));
    assert.ok(all(v).some((l) => l.includes('(у тебя 16)')));
    assert.strictEqual(Ranges.hint(at(2, 'BB', '7c 2d', ['call']).hand, 0).title, '💡 Подсказка: BB — блайнд');
  });

  // ---------- round 3: grids instead of range lists, short texts, pot-odds question, teacher ----------
  const RANGE_LIST = /[2-9TJQKA]{2}[so]?\+,/;
  test('round 3: preflop feedback and hints are short, carry a grid and never a range list', () => {
    U.seed(31);
    const deck = Cards.deck();
    let n = 0;
    for (let k = 0; k < 120; k++) {
      const size = 2 + (k % 8), pos = U.pick(Engine.positionNames(size));
      const d = U.shuffle(deck.slice()), hole = Cards.strList(d.slice(0, 2));
      const script = k % 4 === 1 ? ['raise:60'] : k % 4 === 2 ? ['call'] : [];
      let s;
      try { s = at(size, pos, hole, script); } catch (e) { continue; }       // the script seat may be the hero
      n++;
      for (const t of ['fold', 'check', 'call', 'raise']) {
        const fb = ev(s, t);
        assert.ok(fb.lines.length <= 2 && fb.lines.every((l) => l.length <= 110), `${pos} ${hole} ${t}: ${fb.lines.join(' / ')}`);
        assert.ok(fb.grid && fb.grid.key && fb.grid.hl === fb.code, JSON.stringify(fb.grid));
        assert.strictEqual(Ranges.grid(fb.grid.key).length, 13);
        for (const l of [fb.title, ...all(fb)]) assert.ok(!RANGE_LIST.test(l), l);
      }
      const h = Ranges.hint(s.hand, 0, s.table);
      for (const l of all(h)) assert.ok(!RANGE_LIST.test(l), l);
      const a = Ranges.advise(s.hand, 0, s.table);
      assert.ok(a.title.startsWith('👨‍🏫 Лучше: ') && a.lines.length <= 3, a.title);
      assert.strictEqual(ev(s, a.best).verdict, 'correct', `${pos} ${hole}: teacher says ${a.best}`);
      if (a.best === 'raise') assert.ok(a.size > s.hand.bb && a.title.endsWith(U.fmt(a.size)), a.title);
    }
    assert.ok(n > 60, 'spots ' + n);
    U.seed(null);
  });

  test('round 3: grid keys follow the situation; limped and stack-aware vs-raise grids', () => {
    assert.strictEqual(ev(at(9, 'BTN', '5h 5d', ['raise:60']), 'call').grid.key, 'vsRaise:BTN:deep');
    assert.strictEqual(ev(at(9, 'BTN', '5h 5d', ['raise:60'], { stacks: { 0: 1000 } }), 'call').grid.key, 'vsRaise:BTN:short');
    assert.strictEqual(ev(at(9, 'BTN', '7h 6h', ['call']), 'call').grid.key, 'limped:BTN');
    assert.strictEqual(ev(at(2, 'BB', '7c 2d', ['call']), 'check').grid.key, 'BB');
    const cell = (key, code) => Ranges.grid(key).flat().find((c) => c.code === code).cls;
    assert.deepStrictEqual(['33', '87s', 'AA', '72o'].map((c) => cell('vsRaise:BTN:deep', c)), ['call', 'call', 'raise', 'out']);
    assert.strictEqual(cell('vsRaise:BTN:short', '33'), 'out');
    assert.deepStrictEqual(['AKo', '76s', 'K2o'].map((c) => cell('limped:BTN', c)), ['raise', 'raise', 'out']);
    assert.strictEqual(cell('limped:CO', '54s'), 'call');                     // over-limp is acceptable late
    assert.deepStrictEqual(Ranges.mySituation(at(9, 'BTN', '5h 5d', ['raise:60']).hand, 0), { key: 'vsRaise:BTN:deep', caption: 'BTN: против рейза', hl: '55' });
  });

  test('round 3: preflop pot-odds question when facing a raise; teacher sizes', () => {
    const s = at(9, 'BTN', '9h 8h', ['raise:60']);                              // pot 90 (blinds 30 + 60), call 60
    const [q] = Ranges.questions(s.hand, 0, s.table, {});
    assert.deepStrictEqual([q.id, q.type, q.unit, q.info], ['potodds', 'number', '%', { pot: 90, bet: 60, toCall: 60 }]);
    assert.deepStrictEqual(Ranges.questions(s.hand, 0, s.table, { questions: { potodds: false } }), []);
    assert.deepStrictEqual(Ranges.questions(at(9, 'UTG', 'Ah Ad').hand, 0, null, {}), []); // nothing to call
    const ok = Ranges.check(s.hand, 0, 'potodds', 40);
    assert.strictEqual(ok.title, '✅ Шансы банка: 40% — верно.');
    assert.deepStrictEqual(ok.lines, ['Банк 90 (блайнды и ставки). Твой колл 60. 60 ÷ (90 + 60) = 40%.', 'Быстро: 60 ÷ 150 ≈ 2/5 → 40%.']);
    assert.ok(!Ranges.check(s.hand, 0, 'potodds', 25).ok);
    assert.ok(Coach.check(q.spot, 'potodds', 41).ok);
    const open = Ranges.advise(at(9, 'UTG', 'Ah Ad').hand, 0);
    assert.deepStrictEqual([open.best, open.size, open.title], ['raise', 60, '👨‍🏫 Лучше: рейз до 60']);
    const three = Ranges.advise(at(9, 'BTN', 'Ah Ad', ['raise:60']).hand, 0);
    assert.deepStrictEqual([three.best, three.size, three.title], ['raise', 180, '👨‍🏫 Лучше: 3-бет до 180']);
    const fold = Ranges.advise(at(9, 'UTG', '7h 2d').hand, 0);
    assert.deepStrictEqual([fold.best, fold.lines[1]], ['fold', 'Сброс ничего не стоит.']);
  });

})();
