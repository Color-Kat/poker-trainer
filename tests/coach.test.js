// Coach: outs, rule of 2 and 4, pot odds, action verdicts, real equity, reads, tells, timing — real Engine hands.
(() => {
  const L = (s) => Cards.parseList(s);
  // Button = seat 1. Heads-up: hero (seat 0) is the BB and acts first after the flop.
  // 3-handed: seat 1 BTN, seat 2 SB, seat 0 BB. Dealing pops from the END of the deck: hole cards in
  // hand.seats order, then the board; unspecified cards come from the rest of the deck.
  function deal({ n = 2, styles = {}, revealed = false, holes = {}, board = '', stacks = {}, names = ['Ты', 'Игорь', 'Марина'] } = {}) {
    const button = 1;
    const table = Engine.createTable({ button, players: names.slice(0, n).map((name, i) => ({
      name, isHuman: !i, style: i ? styles[i] || 'reg' : null, baseStyle: i ? styles[i] || 'reg' : null, stack: stacks[i] || 2000, revealed: !!i && revealed })) });
    const fixed = [...Object.values(holes), board].flatMap(L), rest = Cards.deck().filter((c) => !fixed.includes(c));
    const seq = [];
    for (let j = 1; j <= n; j++) { const s = (button + j) % n; seq.push(...(holes[s] ? L(holes[s]) : [rest.shift(), rest.shift()])); }
    seq.push(...L(board));
    return { table, hand: Engine.startHand(table, { deck: [...rest, ...seq.reverse()] }) };
  }
  const play = (hand, script) => {
    for (const a of script) {
      if (a === 'next') { Engine.advance(hand); continue; }
      const [type, to] = a.split(':');
      Engine.act(hand, { type, to: to && +to });
    }
  };
  const spotOf = (opts, script) => { const s = deal(opts); play(s.hand, script); assert.strictEqual(s.hand.toAct, 0); return { ...s, spot: Coach.analyze(s.hand, 0, s.table) }; };
  const HU = (bet) => ['raise:50', 'call', 'next', 'check', `raise:${bet}`];     // pot 100, villain bets
  const MW = (bet) => ['raise:50', 'call', 'call', 'next', `raise:${bet}`];      // pot 150, SB bets, BTN behind
  const ck = (spot, q, v, a) => Coach.check(spot, q, v, a);
  const act = (spot, type) => Coach.evaluateAction(spot, { type });

  test('coach: SPEC 7.3 — A♥K♥ on 9♥5♥2♣, bank 100 + bet 100 from a revealed rock', () => {
    const { spot } = spotOf({ styles: { 1: 'rock' }, revealed: true, holes: { 0: 'Ah Kh', 1: 'Ks Qd' }, board: '9h 5h 2c' }, HU(100));
    assert.strictEqual(spot.kind, 'draw');
    assert.ok(spot.facing);
    assert.deepStrictEqual([spot.pot, spot.toCall, spot.betTo, spot.bettor, spot.sizeFrac, spot.nOpp, spot.multiway], [200, 100, 100, 1, 1, 1, false]);
    assert.deepStrictEqual([spot.outs.total, spot.outs.clean, spot.outs.dirty, spot.outs.over], [9, 8, 1, 6]);
    assert.strictEqual(spot.outs.dirtyList[0].c, Cards.parse('2h'));
    assert.deepStrictEqual(spot.acceptedOuts, [9]); // big bet: overcards are not counted
    assert.deepStrictEqual([spot.correctOuts, spot.cardsToSee, spot.ruleEq, Math.round(spot.needed), spot.foldEq], [9, 1, 18, 33, 'high']);
    assert.deepStrictEqual(spot.verdicts, { fold: 'best', raise: 'best', call: 'mistake' });
    assert.strictEqual(spot.best, 'fold');
    assert.deepStrictEqual(spot.questions, ['outs', 'cards', 'equity', 'potodds']);

    const o = ck(spot, 'outs', 12);
    assert.strictEqual(o.kind, 'outs');
    assert.strictEqual(o.verdict, 'mistake');
    assert.strictEqual(o.ok, false);
    assert.strictEqual(o.title, '❌ Ауты: ты указал 12, правильно 9.');
    assert.deepStrictEqual(o.lines, [
      'У тебя 4 червы (A♥ K♥ + 9♥ 5♥ на борде). Черв в колоде 13, видно 4 → осталось 9 аутов.',
      'Тузы и короли не считаем: соперник ставил крупно, и пары туза может не хватить.',
      'Грязные ауты: 2♥ — спаривает борд, у соперника может быть фулл-хаус.',
    ]);
    assert.strictEqual(ck(spot, 'outs', 15).verdict, 'mistake');
    assert.strictEqual(ck(spot, 'equity', 18).title, '✅ Эквити: 9 × 2 = 18% (одна карта, ставка не олл-ин).');
    const p = ck(spot, 'potodds', 25);
    assert.strictEqual(p.title, '❌ Шансы банка: ты указал 25%, правильно 33%.');
    assert.deepStrictEqual(p.lines, ['Банк 100 + ставка 100 = 200. Твой колл 100. 100 ÷ (200 + 100) = 33%.']);
    const a = act(spot, 'call');
    assert.strictEqual(a.kind, 'action');
    assert.strictEqual(a.title, '❌ Действие: ты заколлировал, правильно — сброс (или рейз-полублеф).');
    assert.deepStrictEqual(a.lines, ['18% < 33% — колл в долгую невыгоден.',
      'Соперник «Камень» (сбрасывает часто), поэтому рейз как полублеф тоже был бы разумным вариантом.']);
    assert.strictEqual(act(spot, 'fold').verdict, 'correct');
    assert.strictEqual(act(spot, 'raise').title, '✅ Действие: рейз-полублеф — верно.');
    assert.strictEqual(ck(spot, 'cards', 1).title, '✅ Карты: одна — верно.');
    assert.strictEqual(ck(spot, 'cards', 2).verdict, 'mistake');
  });

  test('coach: overcards accepted heads-up vs a small bet; hidden style is described, not named', () => {
    const { spot } = spotOf({ styles: { 1: 'rock' }, holes: { 0: 'Ah Kh', 1: 'Ks Qd' }, board: '9h 5h 2c' }, HU(30));
    assert.deepStrictEqual(spot.acceptedOuts, [9, 15]);
    const ok15 = ck(spot, 'outs', 15);
    assert.strictEqual(ok15.title, '✅ Ауты: 15 — засчитано (с оверкартами; без них 9).');
    assert.ok(ok15.lines.includes('Тузы и короли можно посчитать как оверкарты, по 3 аута на каждую: ставка небольшая, и пары туза может хватить. Тогда 15 — тоже верно.'));
    for (const v of [8, 9, 10, 14, 16]) assert.ok(ck(spot, 'outs', v).ok, 'outs ' + v);
    for (const v of [7, 11, 12, 13, 17]) assert.ok(!ck(spot, 'outs', v).ok, 'outs ' + v);
    assert.strictEqual(ck(spot, 'equity', 30).verdict, 'correct');      // 15 × 2 with the accepted alternative
    const a = act(spot, 'call');
    assert.ok(a.lines.includes('Этот соперник часто сбрасывает на агрессию, поэтому рейз как полублеф тоже был бы разумным вариантом.'));
    assert.ok(!a.lines.join(' ').includes('Камень'));
  });

  test('coach: tolerance edges — outs ±1, equity ±3, pot odds ±2', () => {
    const { spot } = spotOf({ holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, HU(100));
    assert.deepStrictEqual([8, 10, 7, 11].map((v) => ck(spot, 'outs', v).ok), [true, true, false, false]);
    assert.deepStrictEqual([15, 21, 14, 22].map((v) => ck(spot, 'equity', v).ok), [true, true, false, false]);
    // needed 33,3 and the answer is shown as 33%: ±2 around either (31 is not "wrong, right is 33")
    assert.deepStrictEqual([32, 35, 31, 36, 30.9].map((v) => ck(spot, 'potodds', v).ok), [true, true, true, false, false]);
    assert.strictEqual(ck(spot, 'potodds', '33,3').verdict, 'correct');
    const accept = ck(spot, 'equity', 24, { outs: 12 });
    assert.strictEqual(accept.verdict, 'acceptable');
    assert.strictEqual(accept.title, '⚠️ Эквити: метод верный (12 × 2 = 24%), но ауты посчитаны неверно.');
    assert.deepStrictEqual(accept.lines, ['Правильно: 9 × 2 = 18% (одна карта, ставка не олл-ин).']);
    const wrong = ck(spot, 'equity', 36, { outs: 9 });
    assert.strictEqual(wrong.title, '❌ Эквити: ты указал 36%, правильно 18%.');
    assert.strictEqual(wrong.lines[0], '9 × 2 = 18% (одна карта, ставка не олл-ин).');
  });

  test('coach: straight draws — OESD 8, double gutshot 8, gutshot 4', () => {
    const sp = (hole, board) => spotOf({ holes: { 0: hole }, board }, HU(100)).spot;
    const oesd = sp('8s 7d', '6h 5c 2d');
    assert.deepStrictEqual(oesd.outs.draws.map((d) => [d.type, d.n]), [['oesd', 8]]);
    assert.strictEqual(oesd.outs.draws[0].text, 'Открытое стрит-дро: стрит дают четвёрки и девятки (2 × 4 = 8 аутов).');
    assert.strictEqual(oesd.correctOuts, 8);
    assert.strictEqual(oesd.outs.over, 6);        // 8 and 7 are above the board: alternative only
    const dbl = sp('9s 7d', 'Jh 8c 5d');
    assert.deepStrictEqual(dbl.outs.draws.map((d) => [d.type, d.n]), [['double', 8]]);
    const gut = sp('9s 8d', 'Qh Jc 2d');
    assert.deepStrictEqual(gut.outs.draws.map((d) => [d.type, d.n]), [['gutshot', 4]]);
    assert.strictEqual(gut.outs.draws[0].text, 'Гатшот: стрит дают только десятки (4 аута).');
    assert.strictEqual(gut.ruleEq, 8);
    assert.deepStrictEqual(gut.verdicts, { fold: 'best', call: 'mistake', raise: 'mistake' });
    const wheel = Coach.computeOuts(L('4s 3d'), L('5h 2c Kd'));          // 2-3-4-5: ace or six
    assert.deepStrictEqual(wheel.draws.map((d) => [d.type, d.n]), [['oesd', 8]]);
  });

  test('coach: combo draws — FD + OESD 15, FD + gutshot 12', () => {
    const big = spotOf({ holes: { 0: '8h 7h' }, board: '6h 5h Kc' }, HU(100)).spot;
    assert.strictEqual(big.outs.total, 15);
    assert.deepStrictEqual(big.outs.draws.map((d) => [d.type, d.n]), [['flush', 9], ['oesd', 8]]);
    assert.deepStrictEqual(big.outs.dirtyList.map((d) => [Cards.str(d.c), d.code]), [['K♥', 'pair']]);
    assert.ok(ck(big, 'outs', 14).lines.includes('Всего: 9 + 8 − 2 (4♥, 9♥: эти карты посчитаны дважды) = 15 аутов.'));
    const fg = spotOf({ holes: { 0: '9h 8h' }, board: 'Qh Tc 2h' }, HU(100)).spot;
    assert.strictEqual(fg.correctOuts, 12);
    assert.deepStrictEqual(fg.outs.draws.map((d) => [d.type, d.n]), [['flush', 9], ['gutshot', 4]]);
    assert.ok(ck(fg, 'outs', 12).lines.includes('Всего: 9 + 4 − 1 (J♥: эта карта посчитана дважды) = 12 аутов.'));
  });

  test('coach: set 2, two overcards 6, one pair → two pair/trips 5', () => {
    const set = spotOf({ holes: { 0: '7s 7d' }, board: 'Kh Qc 2d' }, HU(100)).spot;
    assert.strictEqual(set.kind, 'draw');
    assert.strictEqual(set.made.label, 'слабая пара');
    assert.deepStrictEqual(set.outs.draws.map((d) => [d.type, d.n, d.text]), [['set', 2, 'Карманная пара: сет дают оставшиеся семёрки (2 аута).']]);
    const over = spotOf({ holes: { 0: 'As Kd' }, board: '9h 5c 2d' }, HU(30)).spot;
    assert.strictEqual(over.kind, 'draw');
    assert.deepStrictEqual([over.outs.total, over.outs.over], [0, 6]);
    assert.deepStrictEqual(over.acceptedOuts, [0, 6]);
    assert.strictEqual(ck(over, 'outs', 6).title, '✅ Ауты: 6 — засчитано (с оверкартами; без них 0).');
    assert.strictEqual(ck(over, 'outs', 0).title, '✅ Ауты: 0 — верно.');
    assert.strictEqual(ck(over, 'outs', 3).verdict, 'mistake');
    assert.deepStrictEqual(spotOf({ holes: { 0: 'As Kd' }, board: '9h 5c 2d' }, HU(100)).spot.acceptedOuts, [0]);
    const pair = spotOf({ holes: { 0: 'Kh Qc' }, board: 'As Qd 2c' }, HU(100)).spot;
    assert.strictEqual(pair.kind, 'draw');
    assert.strictEqual(pair.correctOuts, 5);
    assert.deepStrictEqual(ck(pair, 'outs', 5).lines, ['Пара дам: тройку дают оставшиеся дамы (2 аута).',
      'Две пары дают оставшиеся короли (3 аута).', 'Всего: 2 + 3 = 5 аутов.']);
  });

  test('coach: multiway pots count only clean outs (board pair, flush possible, non-nut flush)', () => {
    const mw = (hole, board) => spotOf({ n: 3, holes: { 0: hole }, board }, MW(100)).spot;
    const fd = mw('Ah Kh', '9h 5h 2c');
    assert.deepStrictEqual([fd.multiway, fd.nOpp, fd.outs.total, fd.outs.clean, fd.correctOuts], [true, 2, 9, 8, 8]);
    assert.deepStrictEqual(fd.acceptedOuts, [8]);
    assert.strictEqual(Math.round(fd.needed), 29);           // 100 ÷ (250 + 100)
    assert.ok(ck(fd, 'outs', 9).ok);
    const wrong = ck(fd, 'outs', 11);
    assert.strictEqual(wrong.title, '❌ Ауты: ты указал 11, правильно 8.');
    assert.ok(wrong.lines.includes('Тузы и короли не считаем: соперников несколько, и пары туза может не хватить.'));
    assert.ok(wrong.lines.includes('В банке 3+ игроков — считаем только чистые ауты: против нескольких соперников грязные слишком часто проигрывают. 9 − 1 = 8.'));
    const st = mw('Ts 7d', 'Kh 9h 8c');
    assert.deepStrictEqual([st.outs.total, st.outs.clean, st.correctOuts], [8, 6, 6]);
    assert.deepStrictEqual(st.outs.dirtyList.map((d) => [Cards.str(d.c), d.code]), [['6♥', 'flush'], ['J♥', 'flush']]);
    assert.ok(ck(st, 'outs', 8).lines.includes('Грязные ауты: 6♥, J♥ — дают стрит, но на борде будет минимум 3 карты одной масти: у соперника может быть флеш.'));
    const nn = mw('Qs Jd', 'Ks 7s 2s');
    assert.deepStrictEqual([nn.outs.total, nn.outs.clean, nn.correctOuts], [9, 1, 1]);
    assert.deepStrictEqual(nn.outs.cleanList.map(Cards.str), ['A♠']);
    assert.ok(nn.outs.dirtyList.every((d) => d.code === 'nonnut'));
    assert.strictEqual(spotOf({ holes: { 0: 'Qs Jd' }, board: 'Ks 7s 2s' }, HU(100)).spot.correctOuts, 9); // heads-up: all count
  });

  test('coach: two cards only for a flop all-in — 15 × 4 − (15 − 8) = 53%', () => {
    const { spot } = spotOf({ holes: { 0: '8h 7h' }, board: '6h 5h Kc', stacks: { 1: 300 } }, HU(250)); // villain shoves
    assert.ok(spot.allInSpot);
    assert.strictEqual(spot.cardsToSee, 2);
    assert.strictEqual(spot.ruleEq, 53);
    assert.strictEqual(spot.canRaise, false);
    assert.deepStrictEqual(spot.verdicts, { call: 'best', fold: 'mistake' });
    assert.strictEqual(ck(spot, 'equity', 53).title, '✅ Эквити: 15 × 4 − (15 − 8) = 53% (две карты: олл-ин на флопе).');
    assert.deepStrictEqual([50, 56, 49, 57].map((v) => ck(spot, 'equity', v).ok), [true, true, false, false]);
    assert.strictEqual(ck(spot, 'cards', 2).title, '✅ Карты: две — верно.');
    const c1 = ck(spot, 'cards', 1);
    assert.strictEqual(c1.title, '❌ Карты: ты указал «одну», правильно — две.');
    assert.deepStrictEqual(c1.lines, ['Олл-ин на флопе: после колла ставок больше не будет, и ты увидишь и тёрн, и ривер.']);
    // the hero's own call is all-in for less: only the matched part of the bet can be won
    const short = spotOf({ holes: { 0: '8h 7h' }, board: '6h 5h Kc', stacks: { 0: 200 } }, HU(300)).spot;
    assert.deepStrictEqual([short.toCall, short.pot, short.cardsToSee, short.short], [150, 250, 2, true]);
    assert.deepStrictEqual(ck(short, 'potodds', 38).lines, ['Банк, который ты можешь выиграть, — 250 (лишнее сверх твоего стека тебе не достанется). Твой колл 150. 150 ÷ (250 + 150) = 38%.']);
    // an all-in on the turn is still one card
    const turn = spotOf({ holes: { 0: 'Ah Kh' }, board: '9h 5h 2c Jd', stacks: { 1: 300 } }, ['raise:50', 'call', 'next', 'check', 'check', 'next', 'check', 'raise:250']).spot;
    assert.deepStrictEqual([turn.street, turn.allInSpot, turn.cardsToSee], ['turn', true, 1]);
    assert.strictEqual(ck(turn, 'equity', 18).title, '✅ Эквити: 9 × 2 = 18% (одна карта: впереди только ривер).');
  });

  test('coach: 12+ outs — raise unless the bettor never folds; explaining chips already in', () => {
    // 30% < 33%: calling is unprofitable by the rule (SPEC 7.2), the raise is preferred, folding is the fallback
    const reg = spotOf({ styles: { 1: 'reg' }, holes: { 0: '8h 7h' }, board: '6h 5h Kc' }, HU(100)).spot;
    assert.deepStrictEqual(reg.verdicts, { raise: 'best', fold: 'ok', call: 'mistake' });
    assert.strictEqual(act(reg, 'call').title, '❌ Действие: ты заколлировал, правильно — рейз-полублеф.');
    assert.strictEqual(act(reg, 'call').lines[0], '30% < 33% — колл в долгую невыгоден.');
    assert.strictEqual(act(reg, 'fold').title, '⚠️ Действие: сброс — допустимо, но лучше рейз-полублеф.');
    const regCheap = spotOf({ styles: { 1: 'reg' }, holes: { 0: '8h 7h' }, board: '6h 5h Kc' }, HU(40)).spot; // 30% ≥ 22%
    assert.deepStrictEqual(regCheap.verdicts, { raise: 'best', call: 'ok', fold: 'mistake' });
    assert.strictEqual(act(regCheap, 'fold').title, '❌ Действие: ты сбросил, правильно — рейз-полублеф.');
    const st = spotOf({ styles: { 1: 'station' }, revealed: true, holes: { 0: '8h 7h' }, board: '6h 5h Kc' }, HU(100)).spot;
    assert.strictEqual(st.foldEq, 'none');
    assert.deepStrictEqual(st.verdicts, { fold: 'best', call: 'mistake', raise: 'mistake' }); // 30% < 33%
    assert.ok(act(st, 'raise').lines.includes('Соперник «Коллинг-станция» (почти никогда не сбрасывает) — полублеф против него не сработает.'));
    const cheap = spotOf({ styles: { 1: 'station' }, holes: { 0: '8h 7h' }, board: '6h 5h Kc' }, HU(40)).spot;
    assert.strictEqual(cheap.best, 'call');                                                   // 30% ≥ 22%
    assert.strictEqual(act(cheap, 'call').lines[0], '30% ≥ 22% — колл окупается в долгую.');
    // hero bet 50, villain raised to 200: "доплатить" is explained
    const re = spotOf({ holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, ['raise:50', 'call', 'next', 'raise:50', 'raise:200']).spot;
    assert.deepStrictEqual([re.pot, re.toCall, Math.round(re.needed)], [350, 150, 30]);
    assert.deepStrictEqual(ck(re, 'potodds', 30).lines, ['Банк 100 + ставки на этой улице 250 = 350. Ты уже вложил 50 на этой улице — доплатить нужно 150. Твой колл 150. 150 ÷ (350 + 150) = 30%.']);
  });

  test('coach: no bet — draw asks outs only; check is free, semi-bluff vs folders; nothing to teach otherwise', () => {
    const s = deal({ styles: { 1: 'rock' }, holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' });
    play(s.hand, ['raise:50', 'call']);
    assert.strictEqual(Coach.analyze(s.hand, 0, s.table), null);           // round over preflop
    play(s.hand, ['next']);
    const spot = Coach.analyze(s.hand, 0, s.table);
    assert.deepStrictEqual([spot.kind, spot.facing, spot.questions], ['draw', false, ['outs']]);
    assert.deepStrictEqual(spot.verdicts, { check: 'best', raise: 'best', fold: 'mistake' });
    const f = act(spot, 'fold');
    assert.strictEqual(f.title, '❌ Действие: ты сбросил, правильно — чек (или ставка-полублеф).');
    assert.ok(f.lines.includes('Никогда не сбрасывай, когда можно бесплатно чекнуть.'));
    assert.strictEqual(act(spot, 'call').title, '✅ Действие: чек — верно.');
    assert.strictEqual(act(spot, 'raise').title, '✅ Действие: ставка-полублеф — верно.');
    assert.strictEqual(spotOf({ styles: { 1: 'station' }, holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, ['raise:50', 'call', 'next']).spot.verdicts.raise, 'mistake');
    assert.strictEqual(spotOf({ styles: { 1: 'reg' }, holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, ['raise:50', 'call', 'next']).spot.verdicts.raise, 'best');
    assert.strictEqual(spotOf({ holes: { 0: 'Ah Tc' }, board: 'Ac 7d 2s' }, ['raise:50', 'call', 'next']).spot, null); // made, no bet
    const pre = deal({ holes: { 0: 'Ah Kh' } });
    assert.strictEqual(Coach.analyze(pre.hand, 1, pre.table), null);                                          // preflop
  });

  test('coach: made hands — pot odds vs an estimated range; a big late raise from a rock is the nuts', () => {
    U.seed(11);
    const tp = spotOf({ styles: { 1: 'rock' }, holes: { 0: 'Ad Tc' }, board: 'Ac 7d 2s' }, HU(100)).spot;
    assert.deepStrictEqual([tp.kind, tp.made.label, tp.questions], ['made', 'топ-пара', ['potodds']]);
    assert.ok(tp.estEq > 0.05 && tp.estEq < 0.33, 'rock pot bet crushes top pair weak kicker: ' + tp.estEq);
    assert.strictEqual(tp.best, 'fold');
    assert.strictEqual(act(tp, 'call').lines[0], 'Твоя рука: пара тузов (топ-пара).');
    const maniac = spotOf({ styles: { 1: 'maniac' }, holes: { 0: 'Ad Tc' }, board: 'Ac 7d 2s' }, HU(100)).spot;
    assert.ok(maniac.estEq > 0.5, 'vs a maniac top pair is ahead: ' + maniac.estEq);
    assert.strictEqual(maniac.best, 'call');
    const set = spotOf({ styles: { 1: 'reg' }, holes: { 0: '7c 7s' }, board: 'Ts 7d 2s' }, HU(100)).spot;
    assert.strictEqual(set.made.label, 'сет');
    assert.deepStrictEqual(set.verdicts, { call: 'best', raise: 'best', fold: 'mistake' });
    // turn: hero bets 50, the rock raises to 250
    const late = spotOf({ styles: { 1: 'rock' }, holes: { 0: 'Ad Tc' }, board: 'Ac 7d 2s 3h' },
      ['raise:50', 'call', 'next', 'check', 'check', 'next', 'raise:50', 'raise:250']).spot;
    assert.ok(late.bigLate);
    assert.strictEqual(late.best, 'fold');
    const lc = act(late, 'call');
    assert.strictEqual(lc.verdict, 'mistake');
    assert.ok(lc.lines.includes('Этот соперник редко ставит крупно: крупный рейз на поздней улице от такого соперника — почти всегда натс. С одной парой — сброс.'));
    // river: a weak pair facing a bet is a bluff-catch decision (pot odds only)
    const river = spotOf({ styles: { 1: 'maniac' }, holes: { 0: '8d 8c' }, board: 'Ts 7d 2s 3h 4c' },
      ['raise:50', 'call', 'next', 'check', 'check', 'next', 'check', 'check', 'next', 'check', 'raise:100']).spot;
    assert.deepStrictEqual([river.street, river.kind, river.questions, river.outs.total], ['river', 'nodraw', ['potodds'], 0]);
    assert.ok(river.estEq > 0 && river.estEq < 1);
    U.seed(null);
  });

  test('coach: questions follow the settings toggles and carry pot-odds info', () => {
    const { spot } = spotOf({ holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, HU(100));
    const all = Coach.questions(spot, { questions: { outs: true, equity: true, potodds: true } });
    assert.deepStrictEqual(all.map((q) => [q.id, q.type]), [['outs', 'number'], ['cards', 'choice'], ['equity', 'number'], ['potodds', 'number']]);
    assert.deepStrictEqual(all.map((q) => q.prompt), ['Сколько у тебя аутов?', 'Сколько карт увидишь за эту ставку?', 'Твоё эквити по правилу 2 и 4?', 'Какой процент нужен по шансам банка?']);
    assert.deepStrictEqual(all[1].options.map((o) => o.v), [1, 2]);
    assert.deepStrictEqual(all[3].info, { pot: 200, bet: 100, toCall: 100 });
    assert.ok(all.every((q) => q.hint && q.hint.length > 20));
    assert.deepStrictEqual(Coach.questions(spot, { questions: { outs: false, equity: true, potodds: true } }).map((q) => q.id), ['equity', 'potodds']);
    assert.deepStrictEqual(Coach.questions(spot, { questions: { outs: true, equity: false, potodds: false } }).map((q) => q.id), ['outs', 'cards']);
    assert.strictEqual(Coach.questions(spot).length, 4);
  });

  test('coach: real equity after the hand vs the actual cards (SPEC 7.4)', () => {
    const near = spotOf({ holes: { 0: '8h 7h', 1: 'Ks Qs' }, board: 'Kh 6c 2h' }, HU(100));
    const r1 = Coach.realEquity(near.spot, near.hand);
    assert.strictEqual(r1.kind, 'realEquity');
    assert.strictEqual(r1.verdict, 'info');
    assert.strictEqual(r1.title, 'ℹ️ Флоп: по правилу 18%. Реально против K♠Q♠ (Игорь): 20,0%.');
    assert.deepStrictEqual(r1.lines, ['Правило 2 и 4 работает: разница всего 2 п.п.']);
    const low = spotOf({ holes: { 0: '7h 6h', 1: 'Ah Qh' }, board: 'Kh 9h 2c' }, HU(100));
    const r2 = Coach.realEquity(low.spot, low.hand);
    assert.strictEqual(r2.title, 'ℹ️ Флоп: по правилу 18%. Реально против A♥Q♥ (Игорь): 13,3%.');
    assert.deepStrictEqual(r2.lines, ['Реально меньше: часть аутов не работает (Q♥, A♥ — у соперника на руках; 2♥, 3♥, 4♥, 5♥, 8♥, 10♥, J♥ не спасают: с ними у соперника рука становится сильнее твоей).']);
    const high = spotOf({ holes: { 0: 'Ah Kh', 1: 'Ks Qd' }, board: '9h 5h 2c' }, HU(100));
    const r3 = Coach.realEquity(high.spot, high.hand);
    assert.strictEqual(r3.title, 'ℹ️ Флоп: по правилу 18%. Реально против K♠Q♦ (Игорь): 95,6%.');
    assert.ok(r3.lines[0].startsWith('Реально больше'));
    U.seed(3);
    const made = spotOf({ holes: { 0: 'Ad Tc' }, board: 'Ac 7d 2s' }, HU(100));
    assert.strictEqual(Coach.realEquity(made.spot, made.hand), null);   // no outs question in a made spot
    U.seed(null);
  });

  test('coach: read question on big bets and the post-hand review (SPEC 9.3)', () => {
    const big = spotOf({ styles: { 1: 'rock' }, holes: { 0: 'Ah Qh', 1: 'Ks Kd' }, board: 'Kh 7c 2d' }, HU(100));
    const rq = Coach.readQuestion(big.hand, 0, big.table);
    assert.deepStrictEqual([rq.bettor, rq.truth, rq.sizeFrac, rq.street], [1, 'strong', 1, 'flop']);
    assert.deepStrictEqual(rq.options.map((o) => o.label), ['Очень сильная рука', 'Средняя рука', 'Дро', 'Блеф']);
    const small = spotOf({ holes: { 0: 'Ah Qh' }, board: 'Kh 7c 2d' }, HU(50));
    assert.strictEqual(Coach.readQuestion(small.hand, 0, small.table), null);
    const tell = { seat: 1, shown: 'strength', truth: 'strong', acting: false, random: false, text: 'бросает быстрый взгляд на свои фишки', meaning: 'это часто сигнал, что флоп попал' };
    const rv = Coach.readReview(rq, 'bluff', big.hand, big.table, { thinkMs: 800, tellsSeen: [tell] });
    assert.strictEqual(rv.kind, 'read');
    assert.strictEqual(rv.verdict, 'mistake');
    assert.strictEqual(rv.title, '❌ Чтение соперника: ты выбрал «Блеф», а на самом деле — очень сильная рука.');
    assert.deepStrictEqual(rv.lines, [
      'Признаки:',
      'Статистики у Игоря пока мало (0 раздач) — опирайся на остальные признаки.',
      'Позиция: BTN — из поздней позиции чаще ставят широким диапазоном, в том числе блефуют.',
      'Префлоп: открытие рейзом — это говорит о сильном диапазоне.',
      'Размер ставки: 100% банка — крупно: так ставят с очень сильной рукой или с блефом, средние руки обычно ставят меньше.',
      'Тайминг: быстрая ставка (0,8 с) — часто это заранее решённое действие: сильная рука или блеф.',
      'Телл: Игорь бросает быстрый взгляд на свои фишки — это часто сигнал, что флоп попал.',
      'На самом деле у Игоря: K♠K♦ — сет королей (очень сильная рука).',
    ]);
    const good = Coach.readReview(rq, 'strong', big.hand, big.table, { thinkMs: 4000, tellsSeen: [] });
    assert.strictEqual(good.title, '✅ Чтение соперника: верно — очень сильная рука.');
    assert.ok(good.lines.includes('Теллов у Игоря ты не видел.'));
    assert.ok(good.lines.some((l) => l.startsWith('Тайминг: долгое раздумье (4 с)')));
    big.table.players[1].revealed = true;
    assert.ok(Coach.readReview(rq, 'strong', big.hand, big.table, {}).lines[1].startsWith('Игорь — «Камень» (тайтовый пассивный). Такой игрок играет'));
    const marina = deal({ styles: { 1: 'maniac' }, names: ['Ты', 'Марина'], holes: { 0: 'Ah Qh', 1: '9s 8s' }, board: 'Kh 7s 2s' });
    marina.table.players[1].hud = { hands: 20, vpip: 9, pfr: 6 };
    play(marina.hand, HU(100));
    const mq = Coach.readQuestion(marina.hand, 0, marina.table);
    assert.strictEqual(mq.truth, 'draw');
    const mr = Coach.readReview(mq, 'draw', marina.hand, marina.table, {});
    assert.strictEqual(mr.verdict, 'correct');
    assert.strictEqual(mr.lines[1], 'Марина играет 45% раздач и повышает префлоп в 30% раздач — по первым 20 раздачам похоже, это лузовый агрессивный игрок: часто ставит крупно с чем угодно.');
    assert.strictEqual(mr.lines[mr.lines.length - 1], 'На самом деле у Марины: 9♠8♠ — старшая карта: король + флеш-дро (дро).');
  });

  test('coach: look hint names the most informative honest reaction the player missed (SPEC 9.1)', () => {
    const { table } = deal({ n: 3 });
    const honest = { seat: 1, shown: 'strength', truth: 'strong', acting: false, random: false, text: 'бросает быстрый взгляд на свои фишки', meaning: 'это часто сигнал, что флоп попал' };
    const weak = { seat: 2, shown: 'weakness', truth: 'weak', acting: false, random: false, text: 'безразлично отводит взгляд в сторону', meaning: 'так часто ведут себя, когда флоп не попал' };
    const fake = { seat: 2, shown: 'weakness', truth: 'strong', acting: true, random: false, text: 'демонстративно вздыхает', meaning: 'показная слабость часто скрывает сильную руку' };
    const h = Coach.lookHint([fake, weak, honest], table, 'flop');
    assert.strictEqual(h.kind, 'tells');
    assert.strictEqual(h.verdict, 'mistake');
    assert.deepStrictEqual(h.lines, ['Пока ты смотрел на борд, ты пропустил реакцию: Игорь бросает быстрый взгляд на свои фишки — это часто сигнал, что флоп попал. Смотри на соперников, борд никуда не денется.']);
    assert.strictEqual(Coach.lookHint([weak], table, 'turn').title, '❌ Теллы: ты смотрел на борд, когда открывался тёрн.');
    assert.strictEqual(Coach.lookHint([fake, { ...honest, random: true }], table, 'river'), null);
    assert.strictEqual(Coach.lookHint([], table, 'flop'), null);
  });

  test('coach: timing warning after a > 2 s gap between strong and weak hands; heroStrong', () => {
    const T = Coach.timing;
    T.reset();
    for (let i = 0; i < 3; i++) { T.add(5200, true); T.add(1500, false); }
    assert.strictEqual(T.warning(), 'Твой тайминг выдаёт силу руки. Держи одинаковую паузу перед каждым действием.');
    T.reset();
    for (let i = 0; i < 3; i++) { T.add(3000, true); T.add(1500, false); }
    assert.strictEqual(T.warning(), null);                                  // 1.5 s gap only
    T.reset();
    T.add(9000, true); T.add(9000, true); T.add(1000, false); T.add(1000, false); T.add(1000, false);
    assert.strictEqual(T.warning(), null);                                  // fewer than 3 strong samples
    for (let i = 0; i < 20; i++) T.add(2000, i % 2 === 0);
    assert.strictEqual(T.warning(), null);                                  // only the last 20 count
    T.reset();
    assert.ok(Coach.heroStrong(L('As Ad'), []));
    assert.ok(!Coach.heroStrong(L('7c 2d'), []));
    assert.ok(Coach.heroStrong(L('7c 7d'), L('7h Kd 2s')));
    assert.ok(!Coach.heroStrong(L('8c 3d'), L('Ah Kd Qs')));
  });

  // ---------- audit ----------
  test('audit: a weak made pair has showdown value — QQ on K72 is not a fold vs a maniac’s small bet', () => {
    U.seed(5);
    const qq = spotOf({ styles: { 1: 'maniac' }, holes: { 0: 'Qs Qd' }, board: 'Kh 7c 2d' }, HU(33)).spot;
    assert.deepStrictEqual([qq.kind, qq.made.label, qq.correctOuts, qq.questions], ['draw', 'слабая пара', 2, ['outs', 'cards', 'equity', 'potodds']]);
    assert.ok(qq.estEq * 100 > qq.needed, 'a pair vs a maniac’s small-bet range: ' + qq.estEq);
    assert.strictEqual(qq.best, 'call');
    assert.strictEqual(qq.verdicts.fold, 'ok');
    const c = act(qq, 'call');
    assert.strictEqual(c.verdict, 'correct');
    assert.strictEqual(c.lines[0], 'По аутам 4% < 20% — как дро колл невыгоден.');
    assert.ok(c.lines[1].startsWith('Но у тебя уже есть готовая рука (пара дам): против рук, с которыми этот соперник так ставит, у тебя примерно '), c.lines[1]);
    assert.strictEqual(act(qq, 'fold').title, '⚠️ Действие: сброс — допустимо, но лучше колл.');
    assert.strictEqual(spotOf({ styles: { 1: 'maniac' }, holes: { 0: 'As 7d' }, board: 'Kh 7c 2d' }, HU(33)).spot.best, 'call');
    const rock = spotOf({ styles: { 1: 'rock' }, holes: { 0: 'Qs Qd' }, board: 'Kh 7c 2d' }, HU(100)).spot;  // a rock’s pot bet: still a fold
    assert.deepStrictEqual([rock.best, rock.verdicts.call], ['fold', 'mistake']);
    U.seed(null);
  });

  test('audit: made hands near the break-even point — the other option is acceptable, not a mistake', () => {
    // bets ≥ ⅔ pot share one range model, so with a fixed seed the estimate does not depend on the size
    const at = (bet) => { U.seed(42); return spotOf({ styles: { 1: 'reg' }, holes: { 0: 'Ad 4c' }, board: 'Ac 9h 8h' }, HU(bet)).spot; };
    const eq = at(100).estEq * 100, betFor = (need) => Math.round((100 * need) / (100 - 2 * need));
    assert.ok(eq > 31 && eq < 47, 'estimate in a testable range: ' + eq);
    const above = at(betFor(eq + 1.5));
    assert.deepStrictEqual([above.best, above.verdicts.call], ['fold', 'ok']);
    assert.ok(/\d,\d% эквити — нужно \d+,\d%/.test(act(above, 'call').lines[1]), act(above, 'call').lines[1]);
    const below = at(betFor(eq - 1.5));
    assert.deepStrictEqual([below.best, below.verdicts.fold], ['call', 'ok']);
    assert.deepStrictEqual([at(betFor(eq + 6)).verdicts.call, at(betFor(eq - 6)).verdicts.fold], ['mistake', 'mistake']);
    U.seed(null);
  });

  test('audit: outs texts stay true — straight cards that make a flush on the board, made straights, 4-flush boards', () => {
    const o = Coach.computeOuts(L('Qc As'), L('9d Td Jd 3d'));
    assert.deepStrictEqual(o.draws.map((d) => [d.type, d.n]), [['oesd', 6]]);
    assert.strictEqual(o.draws[0].text, 'Открытое стрит-дро: стрит дают восьмёрки и короли (2 × 4 = 8, но 8♦ и K♦ не в счёт: с ними на борде флеш — 6 аутов).');
    const g = Coach.computeOuts(L('Ac Ks'), L('Qd Jd 4d 2d'));
    assert.strictEqual(g.draws[0].text, 'Гатшот: стрит дают только десятки (10♦ не в счёт: с ней на борде флеш — 3 аута).');
    const mw = spotOf({ n: 3, holes: { 0: 'Qc As' }, board: '9d Td Jd 3d' }, [...MW(100).slice(0, 4), 'check', 'check', 'check', 'next', 'raise:100']).spot;
    assert.ok(ck(mw, 'outs', 0).lines.includes('Грязные ауты: 8♠, 8♥, 8♣, K♠, K♥, K♣ — дают стрит, но на борде будет минимум 3 карты одной масти: у соперника может быть флеш.'));
    // a made straight has no straight "draw" (the read review used to say «стрит до десятки + гатшот»)
    assert.deepStrictEqual(Coach.computeOuts(L('2c 7h'), L('9h 6d 8c Th')).draws.map((d) => d.type), []);
    assert.deepStrictEqual(Coach.madeInfo(L('2c 2d'), L('9h Tc Jd Qs Kh')).label, 'играет борд');
  });

  test('audit: draw shapes — one-ended wheel/broadway, the board plays, made flush', () => {
    const types = (h, b) => Coach.computeOuts(L(h), L(b)).draws.map((d) => [d.type, d.n]);
    assert.deepStrictEqual(types('As 2d', '3h 4c Kd'), [['gutshot', 4]]);           // A-2-3-4: only a five
    assert.deepStrictEqual(types('As Kd', 'Qh Jc 3d'), [['gutshot', 4]]);           // A-K-Q-J: only a ten
    assert.deepStrictEqual(types('Ks Qd', 'Jh Tc 3d'), [['oesd', 8]]);
    assert.deepStrictEqual(types('As 2d', '5h 6c 7d 8s'), []);                       // a 4 or 9 makes the board's straight
    const fl = spotOf({ holes: { 0: 'Ah Kh' }, board: 'Qh 7h 2h' }, HU(100)).spot;
    assert.deepStrictEqual([fl.kind, fl.made.label, fl.questions], ['made', 'флеш', ['potodds']]);
  });

  test('audit: Russian texts — empty answers, one overcard, no pair vs the nuts, positions, raise frequency', () => {
    const { spot } = spotOf({ holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, HU(100));
    assert.strictEqual(ck(spot, 'outs', '').title, '❌ Ауты: ты ничего не указал, правильно 9.');
    assert.strictEqual(ck(spot, 'cards', '').title, '❌ Карты: ты ничего не указал, правильно — одна.');
    assert.strictEqual(ck(spot, 'equity', '').title, '❌ Эквити: ты ничего не указал, правильно 18%.');
    assert.strictEqual(ck(spot, 'potodds', '').title, '❌ Шансы банка: ты ничего не указал, правильно 33%.');
    const q = spotOf({ holes: { 0: 'Qh 4c' }, board: 'Jd 7s 2h' }, HU(30)).spot;
    assert.ok(ck(q, 'outs', 3).lines.includes('Даму можно посчитать как оверкарту — ещё 3 аута: ставка небольшая, и пары дамы может хватить. Тогда 3 — тоже верно.'));
    U.seed(1);
    const nuts = spotOf({ styles: { 1: 'rock' }, holes: { 0: 'Ad Kc' }, board: 'Qc 7d 2s 3h 9c' },
      ['raise:50', 'call', 'next', 'check', 'check', 'next', 'check', 'check', 'next', 'raise:50', 'raise:250']).spot;
    assert.ok(nuts.bigLate);
    assert.strictEqual(act(nuts, 'call').lines[1], 'Этот соперник редко ставит крупно: крупный рейз на поздней улице от такого соперника — почти всегда натс. Твои карты не дали даже пары — сброс.');
    U.seed(null);
    const big = spotOf({ styles: { 1: 'rock' }, holes: { 0: 'Ah Qh', 1: 'Ks Kd' }, board: 'Kh 7c 2d' }, HU(100));
    const rq = Coach.readQuestion(big.hand, 0, big.table);
    big.hand.pos[1] = 'MP';
    assert.ok(Coach.readReview(rq, 'strong', big.hand, big.table, {}).lines.includes('Позиция: MP — из средней позиции играют чуть шире, чем из ранней, но всё ещё довольно сильные руки.'));
    big.hand.pos[1] = 'UTG+1';
    assert.ok(Coach.readReview(rq, 'strong', big.hand, big.table, {}).lines.includes('Позиция: UTG+1 — из ранней позиции обычно играют сильные руки.'));
    // a revealed female bot: the style description's «его ставка» must not refer to Марина
    const m = spotOf({ styles: { 1: 'rock' }, revealed: true, names: ['Ты', 'Марина'], holes: { 0: 'Ah Qh', 1: 'Ks Kd' }, board: 'Kh 7c 2d' }, HU(100));
    const line = Coach.readReview(Coach.readQuestion(m.hand, 0, m.table), 'strong', m.hand, m.table, {}).lines[1];
    assert.ok(line.startsWith('Марина — «Камень» (тайтовый пассивный). Такой игрок играет мало рук'), line);
    // 4-handed: hero CO limps, the big blind checks and then bets big on the flop
    const bb = spotOf({ n: 4, names: ['Ты', 'Игорь', 'Марина', 'Олег'], styles: { 3: 'maniac' }, holes: { 0: 'Ah Qh' }, board: 'Kh 7c 2d' },
      ['call', 'fold', 'fold', 'check', 'next', 'raise:40']);
    const bq = Coach.readQuestion(bb.hand, 0, bb.table);
    assert.strictEqual(bq.bettor, 3);
    assert.ok(Coach.readReview(bq, 'bluff', bb.hand, bb.table, {}).lines.includes('Префлоп: чек на большом блайнде — рука может быть любой: флоп был бесплатным.'));
  });

  test('audit: a raise with a weak draw is explained; a read review does not credit the board pair to the bot', () => {
    const gut = spotOf({ holes: { 0: '9s 8d' }, board: 'Qh Jc 2d' }, HU(100)).spot;
    assert.ok(act(gut, 'raise').lines.includes('Рейз как полублеф имеет смысл только с сильным дро (8+ аутов) против соперника, который умеет сбрасывать, а у тебя 4 аута.'));
    assert.ok(!act(gut, 'fold').lines.some((l) => l.startsWith('Рейз как полублеф')));
    const s = spotOf({ styles: { 1: 'maniac' }, holes: { 0: 'Ah Qh', 1: '8s 2s' }, board: '5c 5d 9h' }, HU(100));
    const rq = Coach.readQuestion(s.hand, 0, s.table);
    assert.strictEqual(rq.truth, 'bluff');
    const rv = Coach.readReview(rq, 'bluff', s.hand, s.table, {});
    assert.strictEqual(rv.lines[rv.lines.length - 1], 'На самом деле у Игоря: 8♠2♠ — ничего, пара пятёрок только на борде (блеф).');
  });

  test('audit: real equity explains a higher number honestly; multiway with no outs; no semi-bluff vs a calling station', () => {
    // three-way, hero behind both: the extra equity comes from the dirty (non-nut) flush cards, not from being ahead
    const s = spotOf({ n: 3, holes: { 0: 'Qs Jd', 1: 'Kd Qc', 2: '7d 7c' }, board: 'Ks 7s 2s' }, MW(100));
    assert.deepStrictEqual([s.spot.correctOuts, s.spot.ruleEq], [1, 2]);
    const r = Coach.realEquity(s.spot, s.hand);
    assert.strictEqual(r.title, 'ℹ️ Флоп: по правилу 2%. Реально против 7♦7♣ (Марина) и K♦Q♣ (Игорь): 20,9%.');
    assert.ok(r.lines[0].startsWith('Реально больше: против этих рук выигрывают и карты, которые не вошли в подсчёт: 3♠, 4♠, '), r.lines[0]);
    const ahead = spotOf({ holes: { 0: 'Ah Kh', 1: 'Ks Qd' }, board: '9h 5h 2c' }, HU(100));
    assert.strictEqual(Coach.realEquity(ahead.spot, ahead.hand).lines[0], 'Реально больше: ты выигрываешь и без попадания — сейчас твоя рука сильнее.');
    const none = spotOf({ n: 3, holes: { 0: '9c 4d' }, board: 'Ks Qh 2d' }, MW(100)).spot;
    assert.strictEqual(none.correctOuts, 0);
    assert.ok(!ck(none, 'outs', 0).lines.some((l) => l.includes('все ауты чистые')));
    const st = spotOf({ styles: { 1: 'station' }, holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, ['raise:50', 'call', 'next']).spot;
    assert.strictEqual(act(st, 'raise').verdict, 'mistake');
    assert.ok(act(st, 'check').lines.includes('Этот соперник почти никогда не сбрасывает — полублеф против него не сработает. У тебя 9 аутов — около 18% попасть на следующей карте: без сбросов соперника ставка только раздувает банк, а промахиваешься ты чаще. Бери бесплатную карту.'));
    // multiway, nobody bet: name the opponent the advice is about (the one least likely to fold)
    const mwFree = spotOf({ n: 3, styles: { 1: 'rock', 2: 'reg' }, holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, [...MW(100).slice(0, 4), 'check']).spot;
    assert.ok(act(mwFree, 'check').lines.includes('Самый цепкий из соперников, Марина, иногда сбрасывает на агрессию — ставка-полублеф допустима, но бесплатная карта надёжнее.'));
    const huge = spotOf({ styles: { 1: 'station' }, holes: { 0: '8h 7h' }, board: '6h 5h Kc' }, ['raise:50', 'call', 'next']).spot; // 15 outs
    assert.strictEqual(huge.verdicts.raise, 'ok');
    assert.ok(act(huge, 'raise').lines.includes('Этот соперник почти никогда не сбрасывает, так что блефовать бессмысленно. Но у тебя 15 аутов: ставка допустима — такое дро часто выигрывает и само. Бесплатная карта тоже хороша.'));
  });

  test('coach: brute force — every structural out improves the hero, nothing clearly improving is missed', () => {
    const { CAT } = HandEval, R = Cards.rank, S = Cards.suit;
    const mask = (cs) => cs.reduce((m, c) => m | (1 << R(c)), 0);
    U.seed(2024);
    let withOuts = 0, checked = 0;
    for (let i = 0; i < 400; i++) {
      const d = U.shuffle(Cards.deck()), hole = d.slice(0, 2), board = d.slice(2, i % 2 ? 6 : 5);
      const all = [...hole, ...board], cur = HandEval.score(all), hr = hole.map(R);
      const o = Coach.computeOuts(hole, board), list = new Set(o.list);
      assert.strictEqual(o.total, list.size);
      assert.strictEqual(o.clean + o.dirty, o.total);
      assert.ok(o.overList.every((c) => !list.has(c)));
      if (o.total) withOuts++;
      for (const x of Cards.deck()) {
        if (all.includes(x)) continue;
        const s = HandEval.score([...all, x]), cat = HandEval.cat(s), k = HandEval.kickers(s);
        const tag = `${Cards.strList(hole)} | ${Cards.strList(board)} + ${Cards.str(x)}`;
        if (list.has(x)) assert.ok(s > cur && cat >= CAT.TWO_PAIR && s > HandEval.score([...board, x]), 'not a real out: ' + tag);
        let clear = false;
        if (s > cur && cat > HandEval.cat(cur)) {        // a better category, not just a kicker
          const fs = [0, 1, 2, 3].find((su) => [...all, x].filter((c) => S(c) === su).length >= 5);
          if (cat === CAT.FLUSH) clear = HandEval.cat(cur) < CAT.FLUSH && hole.some((c) => S(c) === fs) && HandEval.cat(HandEval.score([...board, x])) < CAT.FLUSH;
          if (cat === CAT.STRAIGHT) clear = HandEval.cat(cur) < CAT.STRAIGHT && HandEval.straightTop(mask([...all, x])) > HandEval.straightTop(mask([...board, x]));
          if (cat === CAT.TRIPS || cat === CAT.FULL_HOUSE || cat === CAT.QUADS) clear = hr.includes(k[0]);
          if (cat === CAT.TWO_PAIR) clear = hr[0] !== hr[1] && hr.includes(k[0]) && hr.includes(k[1]);
        }
        if (clear) { checked++; assert.ok(list.has(x), 'missed out: ' + tag); }
      }
    }
    assert.ok(withOuts > 150 && checked > 1000, `${withOuts} spots with outs, ${checked} improving cards`);
    U.seed(null);
  });

  // ---------- QA findings (fixer round) ----------
  const TURN = (bet) => ['raise:50', 'call', 'next', 'check', 'check', 'next', 'check', `raise:${bet}`]; // pot 100 on the turn
  const RIVER = (bet, re) => ['raise:50', 'call', 'next', 'check', 'check', 'next', 'check', 'check', 'next', `raise:${bet}`, `raise:${re}`];

  test('fix: real equity names an opponent who already has a better made hand; street in the title', () => {
    const s = spotOf({ holes: { 0: '7c 8s', 1: 'Ts 8d' }, board: '2h Qd Js 9h' }, TURN(50));
    assert.strictEqual(s.spot.cardsToSee, 1);
    const r = Coach.realEquity(s.spot, s.hand);
    assert.ok(r.title.startsWith('ℹ️ Тёрн: по правилу 8%.'), r.title);
    assert.strictEqual(r.lines[0], 'Реально меньше: часть аутов не работает (10♠ — у соперника на руках; у соперника уже стрит до дамы — с 10♥, 10♦, 10♣ только делишь банк).');
  });

  test('fix: a made hand with a real draw asks the outs questions; the verdict stays on the made-hand estimate', () => {
    U.seed(4);
    const s = spotOf({ holes: { 0: 'Kh Qh' }, board: 'Kc 7h 2h' }, HU(100)).spot;
    assert.strictEqual(s.kind, 'made');
    assert.ok(s.drawToo);
    assert.deepStrictEqual(s.questions, ['outs', 'cards', 'equity', 'potodds']);
    assert.ok(act(s, 'call').lines.some((l) => l.startsWith(`По правилу 2 и 4 одни улучшения (${s.correctOuts} аутов) дают ${s.ruleEq}%, но ты и так часто впереди`)));
    assert.deepStrictEqual(spotOf({ holes: { 0: 'Kh Qc' }, board: 'Kc 7h 2d' }, HU(100)).spot.questions, ['potodds']); // no draw
    U.seed(null);
  });

  test('fix: accepted overcard outs make the call acceptable, not a mistake', () => {
    const s = spotOf({ holes: { 0: 'As Kd' }, board: 'Qc Jh 5d' }, HU(30)).spot; // needs 30/160 = 18.75%
    assert.deepStrictEqual(s.acceptedOuts, [4, 10]);
    assert.strictEqual(ck(s, 'equity', 20).verdict, 'correct');
    const a = act(s, 'call');
    assert.strictEqual(a.verdict, 'acceptable');
    assert.ok(a.lines.includes('С оверкартами (10 аутов) — 20% ≥ 19%: колл тоже допустим, но пара из оверкарты может и не выиграть, а без них у тебя только 8%.'), a.lines.join('\n'));
    assert.strictEqual(act(spotOf({ holes: { 0: 'As Kd' }, board: 'Qc Jh 5d' }, HU(100)).spot, 'call').verdict, 'mistake'); // big bet: no overcards
  });

  test('fix: dirty outs — a low two-card flush, set outs on a flush board, straight-board danger', () => {
    const low = Coach.computeOuts(L('5h 4h'), L('Ah Th 8c'));
    assert.ok(low.dirtyList.filter((d) => d.code === 'nonnut').length >= 7);
    const nine = Coach.computeOuts(L('8h 7h'), L('6h 5h Kc'));       // 8-high flush: not flagged
    assert.ok(!nine.dirtyList.some((d) => d.code === 'nonnut'));
    const mono = Coach.computeOuts(L('9d 9c'), L('Qs 8s Ts'));
    assert.strictEqual(mono.clean, 0);
    assert.deepStrictEqual(mono.dirtyList.filter((d) => d.code === 'flush2').map((d) => Cards.str(d.c)).sort(), ['9♠', '9♥']);
    const mw = spotOf({ n: 3, holes: { 0: '9d 9c' }, board: 'Qs 8s Ts' }, MW(100)).spot;
    assert.strictEqual(ck(mw, 'outs', 0).verdict, 'correct');
    const str = Coach.computeOuts(L('Kh 2c'), L('Kd Js Tc 9h'));     // trips K: board K J T 9 (+K) — any Q makes a straight
    assert.ok(str.dirtyList.some((d) => d.code === 'straight2'), JSON.stringify(str.dirtyList));
  });

  test('fix: numeric answers are strict and echoed in Russian format', () => {
    const s = spotOf({ holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, HU(100)).spot;
    assert.strictEqual(ck(s, 'outs', '12abc').title, '❌ Ауты: ты ничего не указал, правильно 9.');
    assert.strictEqual(ck(s, 'outs', '0x10').verdict, 'mistake');
    assert.strictEqual(ck(s, 'outs', 13.5).title, '❌ Ауты: ты указал 13,5, правильно 9.');
    assert.strictEqual(ck(s, 'outs', '9,5').verdict, 'correct');
    assert.strictEqual(ck(s, 'potodds', 1e20).title, '❌ Шансы банка: ты указал больше миллиона%, правильно 33%.');
    assert.strictEqual(ck(s, 'outs', 10).title, '✅ Ауты: 9 — верно (ты указал 10, допуск ±1).');
  });

  test('fix: no pair of your own on the river — folding is never a mistake; board pair is shared', () => {
    for (const seed of [1, 2, 3]) {
      U.seed(seed);
      const s = spotOf({ styles: { 1: 'maniac' }, holes: { 0: 'Kc 9d' }, board: '3s 5h 4c Ts 3h' }, RIVER(60, 200)).spot;
      assert.strictEqual(s.made.strength, 'none');
      assert.strictEqual(act(s, 'fold').verdict, 'correct');
      assert.strictEqual(act(s, 'call').verdict, 'mistake'); // unrevealed bettor, big raise
      assert.strictEqual(act(s, 'fold').lines[0], 'Твоя рука: только старшая карта — король (пара троек на борде общая).');
    }
    U.seed(null);
    assert.strictEqual(Coach.madeInfo(L('6h 6c'), L('4d Qs 7d 4h')).ru, 'пара шестёрок (слабая пара) + пара четвёрок на борде — общая');
  });

  test('fix: multiway value raise with two pair is fine; a raise mistake is explained', () => {
    U.seed(3);
    const s = spotOf({ n: 3, styles: { 1: 'station', 2: 'maniac' }, holes: { 0: 'Ks Jh' }, board: 'Js Kd 9h' }, MW(150)).spot;
    assert.notStrictEqual(s.verdicts.raise, 'mistake');
    const weak = spotOf({ n: 3, styles: { 1: 'rock', 2: 'rock' }, holes: { 0: 'Ah 9c' }, board: 'As Kd Qh' }, MW(150)).spot;
    assert.strictEqual(weak.verdicts.raise, 'mistake');
    assert.ok(act(weak, 'raise').lines.some((l) => /Рейз (за ценностью нужен|с рукой, которой не хватает)/.test(l)));
    U.seed(null);
  });

  test('fix: read question truth uses the coach vocabulary; adjacent answers are ⚠️', () => {
    const g = spotOf({ styles: { 1: 'reg' }, holes: { 0: '8s 8d', 1: 'Qc Td' }, board: 'Kh Ah 2d' }, HU(100));
    assert.strictEqual(Coach.readQuestion(g.hand, 0, g.table).truth, 'draw');      // gutshot = draw
    const tp = spotOf({ styles: { 1: 'reg' }, holes: { 0: '8s 8d', 1: 'Jh Kd' }, board: '9d 4s Jc' }, HU(100));
    assert.strictEqual(Coach.readQuestion(tp.hand, 0, tp.table).truth, 'medium');   // top pair = medium, as madeInfo
    const w = spotOf({ styles: { 1: 'reg' }, holes: { 0: '8s 8d', 1: '3h 3c' }, board: 'Kd 9s 7c' }, HU(100));
    const wq = Coach.readQuestion(w.hand, 0, w.table);
    assert.deepStrictEqual([wq.truth, wq.alt], ['bluff', 'medium']);
    const rv = Coach.readReview(wq, 'medium', w.hand, w.table, {});
    assert.strictEqual(rv.verdict, 'acceptable');
    assert.ok(rv.ok);
  });

  test('fix: read review — random tells are flagged, huge bets readable, blinds commented, HUD types by absolute PFR', () => {
    const big = spotOf({ styles: { 1: 'maniac' }, holes: { 0: 'Ah Qh', 1: 'Js 4c' }, board: 'Kh 7c 2d' }, HU(100));
    const rq = Coach.readQuestion(big.hand, 0, big.table);
    const tell = { seat: 1, shown: 'strength', truth: 'weak', acting: false, random: true, text: 'замирает', meaning: 'это часто сигнал, что флоп попал' };
    const rv = Coach.readReview(rq, 'bluff', big.hand, big.table, { tellsSeen: [tell] });
    assert.ok(rv.lines.includes('Телл: Игорь замирает — это часто сигнал, что флоп попал (на деле эта реакция была случайной — теллы надёжны не на 100%).'));
    assert.ok(rv.lines.includes('Реакции Игоря не совпадали с картами — на теллы этого игрока лучше не опираться.'));
    assert.ok(Coach.readReview({ ...rq, sizeFrac: 25.2 }, 'bluff', big.hand, big.table, {}).lines.some((l) => l.startsWith('Размер ставки: в 25 раз больше банка')));
    const type = (hud) => { big.table.players[1].hud = hud; return Coach.readReview(rq, 'bluff', big.hand, big.table, {}).lines[1]; };
    assert.ok(type({ hands: 20, vpip: 3, pfr: 2 }).includes('тайтовый пассивный'));    // rock 15/10
    assert.ok(type({ hands: 20, vpip: 4, pfr: 3 }).includes('тайтовый агрессивный'));  // reg 20/15
    assert.ok(type({ hands: 20, vpip: 10, pfr: 1 }).includes('лузовый пассивный'));     // station 50/5
    assert.ok(type({ hands: 20, vpip: 9, pfr: 5 }).includes('лузовый агрессивный'));   // maniac 45/25
    assert.ok(type({ hands: 10, vpip: 0, pfr: 0 }).startsWith('Статистики у Игоря пока мало'));
    assert.ok(type({ hands: 14, vpip: 0, pfr: 0 }).includes('тайтовый пассивный'));    // 0/0 is not aggressive
  });

  test('fix: Russian texts — female pronoun, one card «не спасает», equity without the 9+ correction', () => {
    const f = spotOf({ n: 3, names: ['Ты', 'Игорь', 'Ольга'], styles: { 1: 'reg', 2: 'station' }, holes: { 0: '6h 5d' }, board: '8d Jd 4c' }, [...MW(100).slice(0, 4), 'check']).spot;
    assert.deepStrictEqual([f.villain.name, f.verdicts.raise], ['Ольга', 'mistake']);
    assert.ok(act(f, 'raise').lines.some((l) => l.includes('против неё')));
    const allin = spotOf({ styles: { 1: 'maniac' }, holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, ['raise:50', 'call', 'next', 'check', 'raise:1950']).spot;
    assert.strictEqual(allin.cardsToSee, 2);
    const e = ck(allin, 'equity', 40, { outs: 10 });
    assert.strictEqual(e.title, '❌ Эквити: ты указал 40% — это 10 × 4 без поправки.');
    assert.strictEqual(ck(allin, 'equity', 38, { outs: 10 }).verdict, 'correct'); // within ±3 of 35
    const o = Coach.computeOuts(L('2d 3s'), L('3h 8h 8c'));
    assert.ok(o.draws.find((d) => d.type === 'trips').text.includes('фулл-хаус'));
  });
})();
