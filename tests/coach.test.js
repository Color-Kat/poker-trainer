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
  const all = (fb) => [...fb.lines, ...(fb.more || [])];

  test('coach: SPEC 7.3 — A♥K♥ on 9♥5♥2♣, bank 100 + bet 100 from a revealed rock', () => {
    const { spot } = spotOf({ styles: { 1: 'rock' }, revealed: true, holes: { 0: 'Ah Kh', 1: 'Ks Qd' }, board: '9h 5h 2c' }, HU(100));
    assert.strictEqual(spot.kind, 'draw');
    assert.ok(spot.facing);
    assert.deepStrictEqual([spot.pot, spot.toCall, spot.betTo, spot.bettor, spot.sizeFrac, spot.nOpp, spot.multiway], [200, 100, 100, 1, 1, 1, false]);
    assert.deepStrictEqual([spot.outs.total, spot.outs.clean, spot.outs.dirty, spot.outs.over], [9, 8, 1, 6]);
    assert.strictEqual(spot.outs.dirtyList[0].c, Cards.parse('2h'));
    assert.deepStrictEqual(spot.acceptedOuts, [12, 9, 15]); // big bet: overcards count by half (9 + 3); 9 and 15 accepted
    assert.deepStrictEqual([spot.correctOuts, spot.cardsToSee, spot.ruleEq, Math.round(spot.needed), spot.foldEq], [12, 1, 24, 33, 'high']);
    // a rock's pot-size bet is strong: it never folds to a raise (no 12+ outs raise), and it pays off little when the
    // flush comes; 24% is close to the implied 26% — the call is no blunder, the raise only wins by equity
    assert.deepStrictEqual(spot.verdicts, { fold: 'best', call: 'ok', raise: 'ok' });
    assert.ok(spot.semi.fp < 0.15, String(spot.semi.fp));               // the rock almost never folds to a raise (Monte Carlo: 0–7%)
    assert.strictEqual(spot.best, 'fold');
    assert.deepStrictEqual([spot.implied.future, Math.round(spot.implied.neededImplied)], [90, 26]);
    assert.deepStrictEqual(spot.questions, ['outs', 'cards', 'equity', 'potodds']);

    const o = ck(spot, 'outs', 7);
    assert.strictEqual(o.kind, 'outs');
    assert.strictEqual(o.verdict, 'mistake');
    assert.strictEqual(o.ok, false);
    assert.strictEqual(o.title, '❌ Ауты: ты указал 7, правильно 12.');
    assert.deepStrictEqual(o.lines, [
      '9 на флеш + 3 на пару (тузы, короли, по половине) = 12 аутов.',
      'Против крупной ставки пары туза может не хватить — считаем по половине.',
    ]);
    assert.deepStrictEqual(o.more, ['У тебя 4 червы (A♥ K♥ + 9♥ 5♥ на борде). Черв в колоде 13, видно 4 → осталось 9 аутов.',
      'Оверкарты (старше всех карт борда): тузы, короли — по 3 аута на каждую, всего 6, по половине 3. Ответы 9 и 15 тоже засчитываются.',
      'Грязные ауты: 2♥ — спаривает борд, у соперника может быть фулл-хаус.']);
    assert.strictEqual(ck(spot, 'outs', 12).title, '✅ Ауты: 12 — верно.');
    assert.strictEqual(ck(spot, 'outs', 9).title, '✅ Ауты: 9 — засчитано (без оверкарт; основной ответ 12).');
    assert.strictEqual(ck(spot, 'outs', 15).title, '✅ Ауты: 15 — засчитано (оверкарты полностью; основной ответ 12).');
    assert.strictEqual(ck(spot, 'equity', 24).title, '✅ Эквити: 12 × 2 = 24% (одна карта, ставка не олл-ин).');
    assert.strictEqual(ck(spot, 'equity', 18).verdict, 'correct');      // 9 × 2, accepted
    const p = ck(spot, 'potodds', 25);
    assert.strictEqual(p.title, '❌ Шансы банка: ты указал 25%, правильно 33%.');
    assert.deepStrictEqual(p.lines, ['Банк 100 + ставка 100 = 200. Твой колл 100. 100 ÷ (200 + 100) = 33%.', 'Быстро: 100 ÷ 300 ≈ 1/3 → 33%.']);
    const a = act(spot, 'call');
    assert.strictEqual(a.kind, 'action');
    assert.strictEqual(a.title, '⚠️ Действие: колл — допустимо, но лучше сброс.');
    assert.deepStrictEqual(a.lines, ['24% < 33% — колл в долгую невыгоден.',
      'Соперник «Камень» (сбрасывает часто) — рейз-полублеф допустим, но сбросить надёжнее.']);
    assert.ok(all(a).includes('Неявные шансы: попадёшь — доплатят ещё ~90 («Камень» платит редко). Даже с ними нужно ~26% — мало.'), all(a).join('\n'));
    assert.strictEqual(act(spot, 'fold').verdict, 'correct');
    assert.strictEqual(act(spot, 'raise').title, '⚠️ Действие: рейз-полублеф — допустимо, но лучше сброс.');
    assert.strictEqual(ck(spot, 'cards', 1).title, '✅ Карты: одна — верно.');
    assert.strictEqual(ck(spot, 'cards', 2).verdict, 'mistake');
  });

  test('coach: overcards are full outs heads-up vs a 1/2-pot bet (9 + 6 = 15); half and none accepted; hidden style not named', () => {
    const { spot } = spotOf({ styles: { 1: 'rock' }, holes: { 0: 'Ah Kh', 1: 'Ks Qd' }, board: '9h 5h 2c' }, HU(50));
    assert.deepStrictEqual([spot.correctOuts, spot.ruleEq, spot.overHalf], [15, 30, false]);
    assert.deepStrictEqual(spot.acceptedOuts, [15, 12, 9]);
    const ok15 = ck(spot, 'outs', 15);
    assert.strictEqual(ok15.title, '✅ Ауты: 15 — верно.');
    assert.deepStrictEqual(ok15.lines, ['9 на флеш + 6 на пару (тузы, короли) = 15 аутов.',
      'Ставка небольшая — пары туза часто хватает: оверкарты считаем полностью.']);
    assert.ok(ok15.more.includes('Оверкарты (старше всех карт борда): тузы, короли — по 3 аута на каждую, всего 6. Ответы 9 и 12 тоже засчитываются.'));
    const half = ck(spot, 'outs', 12);
    assert.deepStrictEqual([half.verdict, half.title], ['correct', '✅ Ауты: 12 — засчитано (оверкарты по половине; основной ответ 15).']);
    const none = ck(spot, 'outs', 9);
    assert.deepStrictEqual([none.verdict, none.ok, none.title], ['acceptable', true, '⚠️ Ауты: 9 — засчитано без оверкарт, но правильно 15.']);
    for (const v of [8, 10, 11, 13, 14, 16]) assert.ok(ck(spot, 'outs', v).ok, 'outs ' + v);
    for (const v of [7, 17]) assert.ok(!ck(spot, 'outs', v).ok, 'outs ' + v);
    // the equity quiz and the action verdict use the same 15 outs = 30%
    assert.strictEqual(ck(spot, 'equity', 30).title, '✅ Эквити: 15 × 2 = 30% (одна карта, ставка не олл-ин).');
    assert.strictEqual(ck(spot, 'equity', 24).verdict, 'correct');
    assert.strictEqual(ck(spot, 'equity', 18).verdict, 'acceptable');
    const a = act(spot, 'call');
    assert.strictEqual(a.verdict, 'acceptable');                        // 15 outs vs a folder: the semi-bluff raise is best
    assert.deepStrictEqual(a.lines, ['15 аутов — очень сильное дро (около 53% до ривера): рейз-полублеф лучше колла.', '30% ≥ 25% — колл окупается в долгую.']);
    assert.ok(!all(a).join(' ').includes('Камень'));
  });

  test('coach: overcards vs a pot-size bet and multiway count by half; pairing an undercard is never an out', () => {
    const big = spotOf({ holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, HU(100)).spot;
    assert.deepStrictEqual([big.correctOuts, big.ruleEq, big.overHalf, big.acceptedOuts], [12, 24, true, [12, 9, 15]]);
    for (const v of [9, 12, 15]) assert.strictEqual(ck(big, 'outs', v).verdict, 'correct', 'outs ' + v);
    assert.strictEqual(ck(big, 'outs', 12).lines[1], 'Против крупной ставки пары туза может не хватить — считаем по половине.');
    const mw = spotOf({ n: 3, holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, MW(50)).spot;     // 1/3 pot, but 3 players
    assert.deepStrictEqual([mw.outs.clean, mw.correctOuts, mw.acceptedOuts], [8, 11, [11, 8, 14]]);
    assert.deepStrictEqual(ck(mw, 'outs', 11).lines, ['8 чистых на флеш + 3 на пару (тузы, короли, по половине) = 11 аутов.',
      'Соперников несколько — пары туза может не хватить: оверкарты считаем по половине.']);
    // A♣K♦ on Q♠J♦3♥: gutshot 4 + overcards 6 = 10 heads-up vs a small bet; the call is right by the same 20%
    const gs = spotOf({ holes: { 0: 'Ac Kd' }, board: 'Qs Jd 3h' }, HU(30)).spot;
    assert.deepStrictEqual([gs.correctOuts, gs.ruleEq, gs.acceptedOuts], [10, 20, [10, 7, 4]]);
    assert.strictEqual(ck(gs, 'outs', 10).lines[0], '4 на стрит + 6 на пару (тузы, короли) = 10 аутов.');
    assert.strictEqual(ck(gs, 'equity', 20).title, '✅ Эквити: 10 × 2 = 20% (одна карта, ставка не олл-ин).');
    const a = act(gs, 'call');
    assert.strictEqual(a.verdict, 'correct');
    assert.strictEqual(a.lines[0], '20% ≥ 19% — колл окупается в долгую.');
    // 7♠6♦ on K♥9♣2♦: a seven or a six only pairs below the king — 0 outs, one «more» line says why
    const low = spotOf({ holes: { 0: '7s 6d' }, board: 'Kh 9c 2d' }, HU(30)).spot;
    assert.deepStrictEqual([low.outs.total, low.outs.over, low.correctOuts], [0, 0, 0]);
    const z = ck(low, 'outs', 0);
    assert.deepStrictEqual([z.verdict, z.lines], ['correct', ['Ни одна карта не сделает твою руку сильной: дро нет — 0 аутов.']]);
    assert.deepStrictEqual(z.more, ['Семёрки и шестёрки не считаем: пара младше короля на борде почти никогда не выигрывает.']);
    assert.ok(!ck(low, 'outs', 6).ok);
  });

  test('coach: tolerance edges — outs ±1, equity ±3, pot odds ±2', () => {
    const { spot } = spotOf({ holes: { 0: 'Jh Th' }, board: 'Kh 5h 2c' }, HU(100)); // flush draw, no overcards
    assert.deepStrictEqual([8, 10, 7, 11].map((v) => ck(spot, 'outs', v).ok), [true, true, false, false]);
    assert.deepStrictEqual([15, 21, 14, 22].map((v) => ck(spot, 'equity', v).ok), [true, true, false, false]);
    // needed 33,3: ±3 pp of the exact value, and near 1/3 the fraction's 33% ±2
    assert.deepStrictEqual([32, 35, 31, 36, 30.4, 30.2, 36.4, 37].map((v) => ck(spot, 'potodds', v).ok), [true, true, true, true, true, false, false, false]);
    assert.strictEqual(ck(spot, 'potodds', 36).title, '✅ Шансы банка: 36% — засчитано (точно 33%).');
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
    assert.strictEqual(oesd.outs.over, 6);        // 8 and 7 are above the board
    assert.strictEqual(oesd.correctOuts, 11);     // pot-size bet: overcards by half, 8 + 3
    const dbl = sp('9s 7d', 'Jh 8c 5d');
    assert.deepStrictEqual(dbl.outs.draws.map((d) => [d.type, d.n]), [['double', 8]]);
    // a rock: vs a default reg the Monte Carlo fold rate (18–60%) sits near the raise's break-even and flips its verdict
    const gut = spotOf({ styles: { 1: 'rock' }, holes: { 0: '9s 8d' }, board: 'Qh Jc 2d' }, HU(100)).spot;
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
    assert.ok(all(ck(big, 'outs', 14)).includes('Всего: 9 + 8 − 2 (4♥, 9♥: эти карты посчитаны дважды) = 15 аутов.'));
    const fg = spotOf({ holes: { 0: '9h 8h' }, board: 'Qh Tc 2h' }, HU(100)).spot;
    assert.strictEqual(fg.correctOuts, 12);
    assert.deepStrictEqual(fg.outs.draws.map((d) => [d.type, d.n]), [['flush', 9], ['gutshot', 4]]);
    assert.ok(all(ck(fg, 'outs', 12)).includes('Всего: 9 + 4 − 1 (J♥: эта карта посчитана дважды) = 12 аутов.'));
  });

  test('coach: set 2, two overcards 6, one pair → two pair/trips 5', () => {
    const set = spotOf({ holes: { 0: '7s 7d' }, board: 'Kh Qc 2d' }, HU(100)).spot;
    assert.strictEqual(set.kind, 'draw');
    assert.strictEqual(set.made.label, 'слабая пара');
    assert.deepStrictEqual(set.outs.draws.map((d) => [d.type, d.n, d.text]), [['set', 2, 'Карманная пара: сет дают оставшиеся семёрки (2 аута).']]);
    const over = spotOf({ holes: { 0: 'As Kd' }, board: '9h 5c 2d' }, HU(30)).spot;
    assert.strictEqual(over.kind, 'draw');
    assert.deepStrictEqual([over.outs.total, over.outs.over], [0, 6]);
    assert.deepStrictEqual(over.acceptedOuts, [6, 3, 0]);
    assert.strictEqual(ck(over, 'outs', 6).title, '✅ Ауты: 6 — верно.');
    assert.strictEqual(ck(over, 'outs', 6).lines[0], '6 на пару (тузы, короли) = 6 аутов.');
    assert.strictEqual(ck(over, 'outs', 0).title, '⚠️ Ауты: 0 — засчитано без оверкарт, но правильно 6.');
    assert.strictEqual(ck(over, 'outs', 3).verdict, 'correct');
    assert.deepStrictEqual(spotOf({ holes: { 0: 'As Kd' }, board: '9h 5c 2d' }, HU(100)).spot.acceptedOuts, [3, 0, 6]);
    const pair = spotOf({ holes: { 0: 'Kh Qc' }, board: 'As Qd 2c' }, HU(100)).spot;
    assert.strictEqual(pair.kind, 'draw');
    assert.strictEqual(pair.correctOuts, 5);
    assert.deepStrictEqual(all(ck(pair, 'outs', 5)), ['До тройки 2 + до двух пар 3 = 5 аутов.', 'Пара дам: тройку дают оставшиеся дамы (2 аута).',
      'Две пары дают оставшиеся короли (3 аута).', 'Всего: 2 + 3 = 5 аутов.']);
  });

  test('coach: multiway pots count only clean outs (board pair, flush possible, non-nut flush)', () => {
    const mw = (hole, board) => spotOf({ n: 3, holes: { 0: hole }, board }, MW(100)).spot;
    const fd = mw('Ah Kh', '9h 5h 2c');
    assert.deepStrictEqual([fd.multiway, fd.nOpp, fd.outs.total, fd.outs.clean, fd.correctOuts], [true, 2, 9, 8, 11]); // 8 clean + 3 (half of 6 overcard outs)
    assert.deepStrictEqual(fd.acceptedOuts, [11, 8, 14]);
    assert.strictEqual(Math.round(fd.needed), 29);           // 100 ÷ (250 + 100)
    assert.ok(ck(fd, 'outs', 9).ok);
    const wrong = ck(fd, 'outs', 5);
    assert.strictEqual(wrong.title, '❌ Ауты: ты указал 5, правильно 11.');
    assert.ok(all(wrong).includes('Соперников несколько — пары туза может не хватить: оверкарты считаем по половине.'));
    assert.ok(all(wrong).includes('В банке 3+ игроков — считаем только чистые ауты: против нескольких соперников грязные слишком часто проигрывают. 9 − 1 = 8.'));
    const st = mw('Ts 7d', 'Kh 9h 8c');
    assert.deepStrictEqual([st.outs.total, st.outs.clean, st.correctOuts], [8, 6, 6]);
    assert.deepStrictEqual(st.outs.dirtyList.map((d) => [Cards.str(d.c), d.code]), [['6♥', 'flush'], ['J♥', 'flush']]);
    assert.ok(all(ck(st, 'outs', 8)).includes('Грязные ауты: 6♥, J♥ — дают стрит, но на борде будет минимум 3 карты одной масти: у соперника может быть флеш.'));
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
    assert.deepStrictEqual(ck(short, 'potodds', 38).lines, ['Банк 250, твой колл 150.', 'Быстро: 150 ÷ 400 ≈ 2/5 → 40% (точно 38%).']);
    assert.deepStrictEqual(ck(short, 'potodds', 38).more, ['Банк, который ты можешь выиграть, — 250 (лишнее сверх твоего стека тебе не достанется). Твой колл 150. 150 ÷ (250 + 150) = 38%.']);
    // an all-in on the turn is still one card
    const turn = spotOf({ holes: { 0: 'Ah Kh' }, board: '9h 5h 2c Jd', stacks: { 1: 300 } }, ['raise:50', 'call', 'next', 'check', 'check', 'next', 'check', 'raise:250']).spot;
    assert.deepStrictEqual([turn.street, turn.allInSpot, turn.cardsToSee], ['turn', true, 1]);
    assert.strictEqual(ck(turn, 'equity', 24).title, '✅ Эквити: 12 × 2 = 24% (одна карта: впереди только ривер).');
  });

  test('coach: 12+ outs — raise unless the bettor never folds; explaining chips already in', () => {
    // 30% < 33%: calling is unprofitable by the rule (SPEC 7.2), the raise is preferred, folding is the fallback
    // 30% < 33% by the rule, but the implied odds pay for a call: the raise is preferred, the call is fine too
    const reg = spotOf({ styles: { 1: 'reg' }, holes: { 0: '8h 7h' }, board: '6h 5h Kc' }, HU(100)).spot;
    assert.deepStrictEqual(reg.verdicts, { raise: 'best', call: 'ok', fold: 'mistake' });
    assert.strictEqual(act(reg, 'call').title, '⚠️ Действие: колл — допустимо, но лучше рейз-полублеф.');
    assert.strictEqual(act(reg, 'call').lines[0], '15 аутов — очень сильное дро (около 53% до ривера): рейз-полублеф лучше колла.'); // why the raise wins
    assert.ok(all(act(reg, 'call')).includes('Нужно 33%, у тебя 30%; с неявными шансами хватает ~22% — колл окупается.'));
    assert.strictEqual(act(reg, 'fold').title, '❌ Действие: ты сбросил, правильно — рейз-полублеф.');
    const shallow = spotOf({ styles: { 1: 'reg' }, holes: { 0: '8h 7h' }, board: '6h 5h Kc', stacks: { 0: 160, 1: 160 } }, HU(100)).spot;
    assert.deepStrictEqual(shallow.verdicts, { raise: 'best', fold: 'ok', call: 'mistake' }); // nothing left behind to win later
    const regCheap = spotOf({ styles: { 1: 'reg' }, holes: { 0: '8h 7h' }, board: '6h 5h Kc' }, HU(40)).spot; // 30% ≥ 22%
    assert.deepStrictEqual(regCheap.verdicts, { raise: 'best', call: 'ok', fold: 'mistake' });
    assert.strictEqual(act(regCheap, 'fold').title, '❌ Действие: ты сбросил, правильно — рейз-полублеф.');
    const st = spotOf({ styles: { 1: 'station' }, revealed: true, holes: { 0: '8h 7h' }, board: '6h 5h Kc' }, HU(100)).spot;
    assert.strictEqual(st.foldEq, 'none');
    assert.deepStrictEqual([st.best, st.verdicts.call, st.verdicts.fold], ['call', 'best', 'ok']); // a station pays when it comes
    assert.ok(act(st, 'call').lines[0].includes('с неявными шансами'));
    const cheap = spotOf({ styles: { 1: 'station' }, holes: { 0: '8h 7h' }, board: '6h 5h Kc' }, HU(40)).spot;
    assert.strictEqual(cheap.best, 'call');                                                   // 30% ≥ 22%
    assert.strictEqual(act(cheap, 'call').lines[0], '30% ≥ 22% — колл окупается в долгую.');
    // hero bet 50, villain raised to 200: "доплатить" is explained
    const re = spotOf({ holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, ['raise:50', 'call', 'next', 'raise:50', 'raise:200']).spot;
    assert.deepStrictEqual([re.pot, re.toCall, Math.round(re.needed)], [350, 150, 30]);
    assert.deepStrictEqual(all(ck(re, 'potodds', 30)), ['Банк 350, твой колл 150.', 'Быстро: 150 ÷ 500 ≈ 30%.',
      'Банк 100 + ставки на этой улице 250 = 350. Ты уже вложил 50 на этой улице — доплатить нужно 150. Твой колл 150. 150 ÷ (350 + 150) = 30%.']);
  });

  // ---------- round 4: implied odds, sizes ----------
  test('round 4: implied odds — a flush draw calls a 1/2-pot bet from a station, folds vs a rock; a turn gutshot folds', () => {
    const fd = (style, stacks) => spotOf({ styles: { 1: style }, holes: { 0: 'Qh Th' }, board: 'Kh 5h 2c', stacks }, HU(50)).spot; // no overcards
    const st = fd('station');                                              // pot 150, call 50: 25% needed, 18% by the rule
    assert.deepStrictEqual([st.ruleEq, Math.round(st.needed), st.implied.future, Math.round(st.implied.neededImplied)], [18, 25, 200, 13]);
    assert.deepStrictEqual([st.best, st.verdicts.call, st.verdicts.fold], ['call', 'best', 'ok']);
    const c = act(st, 'call');
    assert.deepStrictEqual([c.verdict, c.lines[0]], ['correct', 'Нужно 25%, у тебя 18%; с неявными шансами хватает ~13% — колл окупается.']);
    assert.ok(all(c).some((l) => l.startsWith('Неявные шансы: попадёшь — доплатят ещё ~200 (этот соперник платит почти всегда)')), all(c).join('\n'));
    assert.strictEqual(act(st, 'fold').verdict, 'acceptable');
    assert.strictEqual(Coach.advise(st).best, 'call');
    const rock = fd('rock', { 0: 300, 1: 300 });
    assert.deepStrictEqual([rock.best, rock.verdicts.call], ['fold', 'ok']);     // 9 outs, 18% vs ~20% with implied odds: close, no blunder
    const weak = spotOf({ styles: { 1: 'rock' }, holes: { 0: 'Qh Th' }, board: 'Kh 5h 2c' }, HU(150)).spot; // 1.5× pot: far from the price
    assert.deepStrictEqual([weak.best, weak.verdicts.call], ['fold', 'mistake']);
    // one-card flush draw: the flush shows on the board, it pays less
    const one = spotOf({ styles: { 1: 'station' }, holes: { 0: 'Ah 3c' }, board: 'Kh 8h 4h' }, HU(50)).spot;
    assert.ok(one.implied.why.includes('флеш соберётся 4 картами борда — его видно'), one.implied.why.join(', '));
    assert.ok(one.implied.future < st.implied.future);
    // turn gutshot vs a pot-size bet: one street left, no odds even with the implied ones
    const turn = spotOf({ styles: { 1: 'station' }, holes: { 0: '9s 8d' }, board: 'Qh Jc 2d 3s' },
      ['raise:50', 'call', 'next', 'check', 'check', 'next', 'check', 'raise:100']).spot;
    assert.deepStrictEqual([turn.street, turn.ruleEq, turn.best, turn.verdicts.call], ['turn', 8, 'fold', 'mistake']);
    assert.ok(turn.implied.why.includes('впереди только ривер'));
    // the all-in has no implied odds
    assert.strictEqual(spotOf({ holes: { 0: '8h 7h' }, board: '6h 5h Kc', stacks: { 1: 300 } }, HU(250)).spot.implied, undefined);
  });

  test('round 4: bet and raise sizes are graded — 2/3 pot ✅, 2× off is only acceptable, raise ~3× the bet', () => {
    const tp = spotOf({ holes: { 0: 'Ah Tc' }, board: 'Ac 7d 2s' }, ['raise:50', 'call', 'next']).spot;   // pot 100, value bet
    const bet = (sp, type, to) => Coach.evaluateAction(sp, { type, to });
    assert.deepStrictEqual([bet(tp, 'bet', 70).verdict, bet(tp, 'bet', 70).lines[1]], ['correct', 'Размер ✅: 70 (2/3 банка).']);
    assert.strictEqual(bet(tp, 'bet', 50).verdict, 'correct');
    const big = bet(tp, 'bet', 250);
    assert.deepStrictEqual([big.verdict, big.title, big.lines[1]], ['acceptable', '⚠️ Действие: ставка — верно, но размер неудачный.', 'Размер: ставка 250 — много, хватит 70 (2/3 банка).']);
    assert.strictEqual(bet(tp, 'bet', 20).verdict, 'acceptable');
    const set = spotOf({ holes: { 0: '7h 7d' }, board: '7c 5d 2s' }, HU(60)).spot;                     // a raise with a set
    assert.deepStrictEqual([bet(set, 'raise', 180).verdict, bet(set, 'raise', 180).lines[1]], ['correct', 'Размер ✅: до 180 (3× ставки).']);
    assert.strictEqual(bet(set, 'raise', 600).verdict, 'acceptable');
    assert.strictEqual(bet(set, 'call').lines.some((l) => l.startsWith('Размер')), false);
    // short stack: all-in is the size
    const sh = spotOf({ holes: { 0: '7h 7d' }, board: '7c 5d 2s', stacks: { 0: 150, 1: 2000 } }, HU(60)).spot;
    assert.strictEqual(bet(sh, 'allin').verdict, 'correct');
  });

  // ---------- round 4 audit ----------
  test('audit: top pair / overpair on the flop 3-way — bet for value (check is only ok); the text reads right', () => {
    for (const [h, b] of [['Ad Kc', 'Ks 8d 3c'], ['Qh Qc', 'Jd 7s 3c']]) {
      const { spot } = spotOf({ n: 3, holes: { 0: h }, board: b }, ['raise:50', 'call', 'call', 'next', 'check']);
      assert.deepStrictEqual([spot.nOpp, spot.facing], [2, false]);
      assert.deepStrictEqual([spot.best, spot.verdicts.raise, spot.verdicts.check], ['raise', 'best', 'ok'], h);
      assert.strictEqual(Coach.advise(spot).best, 'bet');
    }
    const river = spotOf({ n: 3, holes: { 0: 'Ad Kc' }, board: 'Ks 8d 3c 2h 5s' },
      ['raise:50', 'call', 'call', 'next', 'check', 'check', 'check', 'next', 'check', 'check', 'check', 'next', 'check']).spot;
    assert.strictEqual(river.best, 'check');
    assert.ok(!act(river, 'check').lines.some((l) => /несколько на ставку/.test(l)), act(river, 'check').lines.join(' / '));
  });

  test('audit: raises — a set facing a bet raises (teacher too); +1× only per caller of the bet, not per player behind', () => {
    const set = spotOf({ holes: { 0: '7h 7d' }, board: '7c 5d 2s' }, HU(60)).spot;
    assert.deepStrictEqual([set.best, Coach.advise(set).best, Coach.advise(set).size], ['raise', 'raise', 180]);
    // 3-handed: the SB bets 60, the BTN is still to act — 3× is the size, and the teacher's size is graded ✅
    const mw = spotOf({ n: 3, holes: { 0: '7h 7d' }, board: '7c 5d 2s' }, MW(60)).spot;
    assert.strictEqual(mw.nOpp, 2);
    const r = Coach.evaluateAction(mw, { type: 'raise', to: 180 });
    assert.deepStrictEqual([r.verdict, r.lines[1]], ['correct', 'Размер ✅: до 180 (3× ставки).']);
    const a = Coach.advise(mw);
    assert.strictEqual(Coach.evaluateAction(mw, { type: a.best, to: a.size }).verdict, 'correct');
  });

  test('coach: no bet — draw asks outs, equity and sizing; check is free, semi-bluff vs folders', () => {
    const s = deal({ styles: { 1: 'rock' }, holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' });
    play(s.hand, ['raise:50', 'call']);
    assert.strictEqual(Coach.analyze(s.hand, 0, s.table), null);           // round over preflop
    play(s.hand, ['next']);
    const spot = Coach.analyze(s.hand, 0, s.table);
    assert.deepStrictEqual([spot.kind, spot.facing, spot.questions], ['draw', false, ['outs', 'equity', 'sizing']]);
    assert.deepStrictEqual(spot.verdicts, { check: 'best', raise: 'best', fold: 'mistake' });
    const f = act(spot, 'fold');
    assert.strictEqual(f.title, '❌ Действие: ты сбросил, правильно — чек (или ставка-полублеф).');
    assert.ok(all(f).includes('Никогда не сбрасывай, когда можно бесплатно чекнуть.'));
    assert.strictEqual(act(spot, 'call').title, '✅ Действие: чек — верно.');
    assert.strictEqual(act(spot, 'raise').title, '✅ Действие: ставка-полублеф — верно.');
    assert.strictEqual(spotOf({ styles: { 1: 'station' }, holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, ['raise:50', 'call', 'next']).spot.verdicts.raise, 'ok'); // 15 outs
    assert.strictEqual(spotOf({ styles: { 1: 'station' }, holes: { 0: 'Qh Th' }, board: 'Kh 5h 2c' }, ['raise:50', 'call', 'next']).spot.verdicts.raise, 'mistake'); // 9
    assert.strictEqual(spotOf({ styles: { 1: 'reg' }, holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, ['raise:50', 'call', 'next']).spot.verdicts.raise, 'best');
    const tp = spotOf({ holes: { 0: 'Ah Tc' }, board: 'Ac 7d 2s' }, ['raise:50', 'call', 'next']).spot;      // made, no bet: value bet
    assert.deepStrictEqual([tp.best, tp.verdicts, tp.questions], ['raise', { raise: 'best', check: 'ok', fold: 'mistake' }, ['sizing']]);
    const pre = deal({ holes: { 0: 'Ah Kh' } });
    assert.strictEqual(Coach.analyze(pre.hand, 1, pre.table), null);                                          // preflop
  });

  test('coach: made hands — pot odds vs an estimated range; a big late raise from a rock is the nuts', () => {
    U.seed(11);
    const tp = spotOf({ styles: { 1: 'rock' }, holes: { 0: 'Ad Tc' }, board: 'Ac 7d 2s' }, HU(100)).spot;
    assert.deepStrictEqual([tp.kind, tp.made.label, tp.questions], ['made', 'топ-пара', ['potodds']]);
    assert.ok(tp.estEq > 0.05 && tp.estEq < 0.33, 'rock pot bet crushes top pair weak kicker: ' + tp.estEq);
    assert.strictEqual(tp.best, 'fold');
    assert.strictEqual(act(tp, 'call').lines[1], 'Твоя рука: пара тузов (топ-пара).');
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
    assert.ok(all(lc).includes('Этот соперник редко ставит крупно: крупный рейз на поздней улице от такого соперника — почти всегда натс. С одной парой — сброс.'));
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
    assert.deepStrictEqual(all(r2), ['Реально меньше: часть аутов не работает.', 'Q♥, A♥ — у соперника на руках; 2♥, 3♥, 4♥, 5♥, 8♥, 10♥, J♥ не спасают: с ними у соперника рука становится сильнее твоей.']);
    const high = spotOf({ holes: { 0: 'Ah Kh', 1: 'Ks Qd' }, board: '9h 5h 2c' }, HU(100));
    const r3 = Coach.realEquity(high.spot, high.hand);
    assert.strictEqual(r3.title, 'ℹ️ Флоп: по правилу 24%. Реально против K♠Q♦ (Игорь): 95,6%.'); // 9 + half of 6 overcard outs
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
    assert.deepStrictEqual(rv.lines, ['На самом деле у Игоря: K♠K♦ — сет королей (очень сильная рука).']);
    assert.deepStrictEqual(rv.more, [
      'Признаки:',
      'Статистики у Игоря пока мало (0 раздач) — опирайся на остальные признаки.',
      'Позиция: BTN — из поздней позиции чаще ставят широким диапазоном, в том числе блефуют.',
      'Префлоп: открытие рейзом — это говорит о сильном диапазоне.',
      'Размер ставки: 100% банка — крупно: так ставят с очень сильной рукой или с блефом, средние руки обычно ставят меньше.',
      'Тайминг: быстрая ставка (0,8 с) — часто это заранее решённое действие: сильная рука или блеф.',
      'Телл: Игорь бросает быстрый взгляд на свои фишки — это часто сигнал, что флоп попал.',
    ]);
    const good = Coach.readReview(rq, 'strong', big.hand, big.table, { thinkMs: 4000, tellsSeen: [] });
    assert.strictEqual(good.title, '✅ Чтение соперника: верно — очень сильная рука.');
    assert.ok(all(good).includes('Теллов у Игоря ты не видел.'));
    assert.ok(all(good).some((l) => l.startsWith('Тайминг: долгое раздумье (4 с)')));
    big.table.players[1].revealed = true;
    assert.ok(Coach.readReview(rq, 'strong', big.hand, big.table, {}).more[1].startsWith('Игорь — «Камень» (тайтовый пассивный). Такой игрок играет'));
    const marina = deal({ styles: { 1: 'maniac' }, names: ['Ты', 'Марина'], holes: { 0: 'Ah Qh', 1: '9s 8s' }, board: 'Kh 7s 2s' });
    marina.table.players[1].hud = { hands: 20, vpip: 9, pfr: 6 };
    play(marina.hand, HU(100));
    const mq = Coach.readQuestion(marina.hand, 0, marina.table);
    assert.strictEqual(mq.truth, 'draw');
    const mr = Coach.readReview(mq, 'draw', marina.hand, marina.table, {});
    assert.strictEqual(mr.verdict, 'correct');
    assert.strictEqual(mr.more[1], 'Марина играет 45% раздач и повышает префлоп в 30% раздач — по первым 20 раздачам похоже, это лузовый агрессивный игрок: часто ставит крупно с чем угодно.');
    assert.strictEqual(mr.lines[0], 'На самом деле у Марины: 9♠8♠ — старшая карта: король + флеш-дро (дро).');
  });

  test('coach: look hint names the most informative honest reaction the player missed (SPEC 9.1)', () => {
    const { table } = deal({ n: 3 });
    const honest = { seat: 1, shown: 'strength', truth: 'strong', acting: false, random: false, text: 'бросает быстрый взгляд на свои фишки', meaning: 'это часто сигнал, что флоп попал' };
    const weak = { seat: 2, shown: 'weakness', truth: 'weak', acting: false, random: false, text: 'безразлично отводит взгляд в сторону', meaning: 'так часто ведут себя, когда флоп не попал' };
    const fake = { seat: 2, shown: 'weakness', truth: 'strong', acting: true, random: false, text: 'демонстративно вздыхает', meaning: 'показная слабость часто скрывает сильную руку' };
    const h = Coach.lookHint([fake, weak, honest], table, 'flop');
    assert.strictEqual(h.kind, 'tells');
    assert.strictEqual(h.verdict, 'mistake');
    assert.deepStrictEqual(h.lines, ['Ты пропустил: Игорь бросает быстрый взгляд на свои фишки.', 'Это часто сигнал, что флоп попал. Смотри на соперников — борд никуда не денется.']);
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
    assert.ok(c.lines[1].startsWith('Но с готовой рукой (слабая пара) эквити ~'), c.lines[1]);
    assert.ok(all(c)[2].startsWith('Но у тебя уже есть готовая рука (пара дам): против рук, с которыми этот соперник так ставит, у тебя примерно '), all(c)[2]);
    assert.strictEqual(act(qq, 'fold').title, '⚠️ Действие: сброс — допустимо, но лучше колл.');
    const adv = Coach.advise(qq);                                           // the teacher names the made hand, not the 4% draw
    assert.ok(adv.lines[0].startsWith('Готовая рука (слабая пара): эквити ~') && adv.lines[0].endsWith('≥ 20% — колл окупается.'), adv.lines[0]);
    assert.ok(adv.lines[1].includes('Бьют тебя'), adv.lines[1]);
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
    assert.ok(/^Эквити ~\d+,\d% против нужных \d+,\d% — на грани\.$/.test(act(above, 'call').lines[0]), act(above, 'call').lines[0]);
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
    assert.ok(all(ck(mw, 'outs', 0)).includes('Грязные ауты: 8♠, 8♥, 8♣, K♠, K♥, K♣ — дают стрит, но на борде будет минимум 3 карты одной масти: у соперника может быть флеш.'));
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
    assert.strictEqual(ck(spot, 'outs', '').title, '❌ Ауты: ты ничего не указал, правильно 12.');
    assert.strictEqual(ck(spot, 'cards', '').title, '❌ Карты: ты ничего не указал, правильно — одна.');
    assert.strictEqual(ck(spot, 'equity', '').title, '❌ Эквити: ты ничего не указал, правильно 24%.');
    assert.strictEqual(ck(spot, 'potodds', '').title, '❌ Шансы банка: ты ничего не указал, правильно 33%.');
    const q = spotOf({ holes: { 0: 'Qh 4c' }, board: 'Jd 7s 2h' }, HU(30)).spot;
    const q3 = ck(q, 'outs', 3);
    assert.deepStrictEqual([q3.title, q3.lines], ['✅ Ауты: 3 — верно.', ['3 на пару (дамы) = 3 аута.', 'Ставка небольшая — пары дамы часто хватает: оверкарты считаем полностью.']]);
    assert.ok(q3.more.includes('Четвёрки не считаем: пара младше валета на борде почти никогда не выигрывает.'), q3.more.join('\n'));
    U.seed(1);
    const nuts = spotOf({ styles: { 1: 'rock' }, holes: { 0: 'Ad Kc' }, board: 'Qc 7d 2s 3h 9c' },
      ['raise:50', 'call', 'next', 'check', 'check', 'next', 'check', 'check', 'next', 'raise:50', 'raise:250']).spot;
    assert.ok(nuts.bigLate);
    assert.strictEqual(act(nuts, 'call').lines[0], 'Крупный рейз на поздней улице от такого соперника — почти всегда натс: сброс.');
    assert.strictEqual(all(act(nuts, 'call'))[2], 'Этот соперник редко ставит крупно: крупный рейз на поздней улице от такого соперника — почти всегда натс. Твои карты не дали даже пары — сброс.');
    U.seed(null);
    const big = spotOf({ styles: { 1: 'rock' }, holes: { 0: 'Ah Qh', 1: 'Ks Kd' }, board: 'Kh 7c 2d' }, HU(100));
    const rq = Coach.readQuestion(big.hand, 0, big.table);
    big.hand.pos[1] = 'MP';
    assert.ok(all(Coach.readReview(rq, 'strong', big.hand, big.table, {})).includes('Позиция: MP — из средней позиции играют чуть шире, чем из ранней, но всё ещё довольно сильные руки.'));
    big.hand.pos[1] = 'UTG+1';
    assert.ok(all(Coach.readReview(rq, 'strong', big.hand, big.table, {})).includes('Позиция: UTG+1 — из ранней позиции обычно играют сильные руки.'));
    // a revealed female bot: the style description's «его ставка» must not refer to Марина
    const m = spotOf({ styles: { 1: 'rock' }, revealed: true, names: ['Ты', 'Марина'], holes: { 0: 'Ah Qh', 1: 'Ks Kd' }, board: 'Kh 7c 2d' }, HU(100));
    const line = Coach.readReview(Coach.readQuestion(m.hand, 0, m.table), 'strong', m.hand, m.table, {}).more[1];
    assert.ok(line.startsWith('Марина — «Камень» (тайтовый пассивный). Такой игрок играет мало рук'), line);
    // 4-handed: hero CO limps, the big blind checks and then bets big on the flop
    const bb = spotOf({ n: 4, names: ['Ты', 'Игорь', 'Марина', 'Олег'], styles: { 3: 'maniac' }, holes: { 0: 'Ah Qh' }, board: 'Kh 7c 2d' },
      ['call', 'fold', 'fold', 'check', 'next', 'raise:40']);
    const bq = Coach.readQuestion(bb.hand, 0, bb.table);
    assert.strictEqual(bq.bettor, 3);
    assert.ok(all(Coach.readReview(bq, 'bluff', bb.hand, bb.table, {})).includes('Префлоп: чек на большом блайнде — рука может быть любой: флоп был бесплатным.'));
  });

  test('audit: a raise with a weak draw is explained; a read review does not credit the board pair to the bot', () => {
    const gut = spotOf({ styles: { 1: 'rock' }, holes: { 0: '9s 8d' }, board: 'Qh Jc 2d' }, HU(100)).spot; // a rock: the raise is a clear mistake
    assert.ok(all(act(gut, 'raise')).includes('Рейз как полублеф имеет смысл только с сильным дро (8+ аутов) против соперника, который умеет сбрасывать, а у тебя 4 аута.'));
    assert.ok(!all(act(gut, 'fold')).some((l) => l.startsWith('Рейз как полублеф')));
    const s = spotOf({ styles: { 1: 'maniac' }, holes: { 0: 'Ah Qh', 1: '8s 2s' }, board: '5c 5d 9h' }, HU(100));
    const rq = Coach.readQuestion(s.hand, 0, s.table);
    assert.strictEqual(rq.truth, 'bluff');
    const rv = Coach.readReview(rq, 'bluff', s.hand, s.table, {});
    assert.strictEqual(rv.lines[0], 'На самом деле у Игоря: 8♠2♠ — ничего, пара пятёрок только на борде (блеф).');
  });

  test('audit: real equity explains a higher number honestly; multiway with no outs; no semi-bluff vs a calling station', () => {
    // three-way, hero behind both: the extra equity comes from the dirty (non-nut) flush cards, not from being ahead
    const s = spotOf({ n: 3, holes: { 0: 'Qs Jd', 1: 'Kd Qc', 2: '7d 7c' }, board: 'Ks 7s 2s' }, MW(100));
    assert.deepStrictEqual([s.spot.correctOuts, s.spot.ruleEq], [1, 2]);
    const r = Coach.realEquity(s.spot, s.hand);
    assert.strictEqual(r.title, 'ℹ️ Флоп: по правилу 2%. Реально против 7♦7♣ (Марина) и K♦Q♣ (Игорь): 20,9%.');
    assert.strictEqual(r.lines[0], 'Реально больше: против этих рук выигрывают и карты, которые не вошли в подсчёт.');
    assert.ok(all(r)[1].startsWith('Эти карты: 3♠, 4♠, '), all(r)[1]);
    const ahead = spotOf({ holes: { 0: 'Ah Kh', 1: 'Ks Qd' }, board: '9h 5h 2c' }, HU(100));
    assert.strictEqual(Coach.realEquity(ahead.spot, ahead.hand).lines[0], 'Реально больше: ты выигрываешь и без попадания — сейчас твоя рука сильнее.');
    const none = spotOf({ n: 3, holes: { 0: '9c 4d' }, board: 'Ks Qh 2d' }, MW(100)).spot;
    assert.strictEqual(none.correctOuts, 0);
    assert.ok(!all(ck(none, 'outs', 0)).some((l) => l.includes('все ауты чистые')));
    const st = spotOf({ styles: { 1: 'station' }, holes: { 0: 'Qh Th' }, board: 'Kh 5h 2c' }, ['raise:50', 'call', 'next']).spot;
    assert.strictEqual(act(st, 'raise').verdict, 'mistake');
    assert.ok(all(act(st, 'check')).includes('Этот соперник почти никогда не сбрасывает — полублеф против него не сработает. У тебя 9 аутов — около 18% попасть на следующей карте: без сбросов соперника ставка только раздувает банк, а промахиваешься ты чаще. Бери бесплатную карту.'));
    // multiway, nobody bet: name the opponent the advice is about (the one least likely to fold)
    const mwFree = spotOf({ n: 3, styles: { 1: 'rock', 2: 'reg' }, holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, [...MW(100).slice(0, 4), 'check']).spot;
    assert.ok(all(act(mwFree, 'check')).includes('Самый цепкий из соперников, Марина, иногда сбрасывает на агрессию — ставка-полублеф допустима, но бесплатная карта надёжнее.'));
    const huge = spotOf({ styles: { 1: 'station' }, holes: { 0: '8h 7h' }, board: '6h 5h Kc' }, ['raise:50', 'call', 'next']).spot; // 15 outs
    assert.strictEqual(huge.verdicts.raise, 'ok');
    assert.ok(all(act(huge, 'raise')).includes('Этот соперник почти никогда не сбрасывает, так что блефовать бессмысленно. Но у тебя 15 аутов: ставка допустима — такое дро часто выигрывает и само. Бесплатная карта тоже хороша.'));
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
    assert.deepStrictEqual(all(r), ['Реально меньше: часть аутов не работает.', '10♠ — у соперника на руках; у соперника уже стрит до дамы — с 10♥, 10♦, 10♣ только делишь банк.']);
  });

  test('fix: a made hand with a real draw asks the outs questions; the verdict stays on the made-hand estimate', () => {
    U.seed(4);
    const s = spotOf({ holes: { 0: 'Kh Qh' }, board: 'Kc 7h 2h' }, HU(100)).spot;
    assert.strictEqual(s.kind, 'made');
    assert.ok(s.drawToo);
    assert.deepStrictEqual(s.questions, ['outs', 'cards', 'equity', 'potodds']);
    assert.ok(all(act(s, 'call')).some((l) => l.startsWith(`По правилу 2 и 4 одни улучшения (${s.correctOuts} аутов) дают ${s.ruleEq}%, но ты и так часто впереди`)));
    assert.deepStrictEqual(spotOf({ holes: { 0: 'Kh Qc' }, board: 'Kc 7h 2d' }, HU(100)).spot.questions, ['potodds']); // no draw
    U.seed(null);
  });

  test('fix: overcards by half vs a shove, but the accepted full count pays — the call is acceptable, not a mistake', () => {
    const s = spotOf({ holes: { 0: 'Ah Kh' }, board: '9h 5h 2c', stacks: { 1: 1000 } }, ['raise:50', 'call', 'next', 'check', 'raise:950']).spot;
    assert.deepStrictEqual([s.cardsToSee, s.correctOuts, s.ruleEq, Math.round(s.needed), s.implied], [2, 12, 44, 48, undefined]);
    const e = ck(s, 'equity', 53);
    assert.deepStrictEqual([e.verdict, e.lines], ['correct', ['Основной ответ: 12 × 4 − (12 − 8) = 44%.']]);
    const a = act(s, 'call');
    assert.strictEqual(a.verdict, 'acceptable');
    assert.ok(all(a).includes('С оверкартами полностью (15 аутов) — 53% ≥ 48%: колл тоже допустим, но пары может не хватить, а по половине у тебя 44%.'), all(a).join('\n'));
    assert.strictEqual(act(s, 'fold').verdict, 'correct');
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
    const s = spotOf({ holes: { 0: 'Jh Th' }, board: 'Kh 5h 2c' }, HU(100)).spot;
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
      assert.strictEqual(act(s, 'fold').lines[1], 'Твоя рука: только старшая карта — король (пара троек на борде общая).');
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
    assert.ok(all(act(weak, 'raise')).some((l) => /Рейз (за ценностью нужен|с рукой, которой не хватает)/.test(l)));
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
    assert.ok(all(rv).includes('Телл: Игорь замирает — это часто сигнал, что флоп попал (на деле эта реакция была случайной — теллы надёжны не на 100%).'));
    assert.ok(all(rv).includes('Реакции Игоря не совпадали с картами — на теллы этого игрока лучше не опираться.'));
    assert.ok(all(Coach.readReview({ ...rq, sizeFrac: 25.2 }, 'bluff', big.hand, big.table, {})).some((l) => l.startsWith('Размер ставки: в 25 раз больше банка')));
    const type = (hud) => { big.table.players[1].hud = hud; return Coach.readReview(rq, 'bluff', big.hand, big.table, {}).more[1]; };
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
    assert.ok(all(act(f, 'raise')).some((l) => l.includes('против неё')));
    const allin = spotOf({ styles: { 1: 'maniac' }, holes: { 0: 'Ah Kh' }, board: '9h 5h 2c' }, ['raise:50', 'call', 'next', 'check', 'raise:1950']).spot;
    assert.strictEqual(allin.cardsToSee, 2);
    const e = ck(allin, 'equity', 40, { outs: 10 });
    assert.strictEqual(e.title, '❌ Эквити: ты указал 40% — это 10 × 4 без поправки.');
    assert.strictEqual(ck(allin, 'equity', 38, { outs: 10 }).verdict, 'correct'); // within ±3 of 35
    const o = Coach.computeOuts(L('2d 3s'), L('3h 8h 8c'));
    assert.ok(o.draws.find((d) => d.type === 'trips').text.includes('фулл-хаус'));
  });

  // ---------- round 3: every decision graded, bluffs, approximate answers, teacher, tells ----------
  const RANGE_LIST = /[2-9TJQKA]{2}[so]?\+,/;
  const texts = (f) => [f.title, ...f.lines, ...(f.more || [])];
  function checkShape(f, tag) {
    assert.ok(f.lines.length <= 2, `${tag}: ${f.lines.length} lines\n${f.lines.join('\n')}`);
    for (const l of f.lines) assert.ok(l.length <= 110, `${tag}: long line (${l.length}) ${l}`);
    for (const t of texts(f)) assert.ok(!RANGE_LIST.test(t), `${tag}: range list in "${t}"`);
  }
  // Random hands with random actions until the hero (seat 0) has a postflop decision.
  function randomSpots(count, seed) {
    U.seed(seed);
    const out = [], STY = ['rock', 'station', 'reg', 'maniac', 'actor'];
    for (let k = 0; out.length < count && k < count * 20; k++) {
      const n = 2 + (k % 5);
      const table = Engine.createTable({ button: k % n, players: Array.from({ length: n }, (_, i) => ({ name: ['Ты', 'Игорь', 'Марина', 'Олег', 'Анна', 'Сергей'][i],
        isHuman: !i, style: i ? STY[(k + i) % 5] : null, baseStyle: i ? ['rock', 'station', 'reg', 'maniac'][(k + i) % 4] : null, stack: 1000 + 200 * ((k + i) % 6), revealed: !!(i && k % 3 === 0) })) });
      const hand = Engine.startHand(table), target = ['flop', 'turn', 'river'][k % 3];
      for (let step = 0; step < 80 && hand.phase !== 'done'; step++) {
        if (hand.phase === 'roundEnd') { Engine.advance(hand); continue; }
        const lg = Engine.legal(hand);
        if (hand.toAct === 0 && hand.street === target) { out.push({ hand, table, spot: Coach.analyze(hand, 0, table) }); break; }
        const r = U.rng(), hero = hand.toAct === 0;
        const a = lg.canRaise && r < 0.25 ? { type: 'raise', to: lg.minTo + Math.round(U.rng() * lg.pot) } : lg.canCheck ? { type: 'check' }
          : r < (hero ? 0.05 : 0.2) ? { type: 'fold' } : { type: 'call' };
        Engine.act(hand, a);
      }
    }
    U.seed(null);
    return out;
  }

  test('round 3: every postflop decision gets a spot; every action a short verdict; the teacher agrees with the grading', () => {
    const spots = randomSpots(36, 77);
    assert.ok(spots.length >= 30, 'spots: ' + spots.length);
    let free = 0, river = 0, bluffs = 0;
    for (const { spot, hand } of spots) {
      const tag = `${hand.street} ${Cards.strList(hand.hole[0])} | ${Cards.strList(hand.board)}`;
      assert.ok(spot, 'no spot: ' + tag);
      if (!spot.facing) { free++; assert.strictEqual(spot.verdicts.fold, 'mistake', 'never fold when the check is free: ' + tag); }
      if (spot.street === 'river') river++;
      if (spot.bluff) bluffs++;
      assert.strictEqual(spot.verdicts[spot.best], 'best', tag);
      for (const t of ['fold', 'check', 'call', 'bet', 'raise']) {
        const f = Coach.evaluateAction(spot, { type: t });
        assert.ok(['correct', 'acceptable', 'mistake'].includes(f.verdict), tag);
        checkShape(f, `${tag} ${t}`);
      }
      const adv = Coach.advise(spot);
      assert.ok(adv.title.startsWith('👨‍🏫 Лучше: '), adv.title);
      assert.ok(adv.lines.length >= 2 && adv.lines.length <= 3, tag + ' ' + adv.lines.join(' / '));
      for (const t of texts(adv)) assert.ok(!RANGE_LIST.test(t), t);
      assert.strictEqual(Coach.evaluateAction(spot, { type: adv.best, to: adv.size }).verdict, 'correct', `${tag}: teacher says ${adv.best} ${adv.size}`);
      if (adv.best === 'bet' || adv.best === 'raise') assert.ok(adv.size > 0, tag);
      for (const q of Coach.questions(spot, {})) {
        const f = Coach.check(spot, q.id, 7);
        assert.ok(f && f.title, q.id);
        checkShape(f, `${tag} q:${q.id}`);
      }
    }
    assert.ok(free > 5 && river > 3 && bluffs > 3, `free ${free}, river ${river}, bluffs ${bluffs}`);
  });

  test('round 3: bluffs are judged by the real fold probability — a rock folds, a station does not', () => {
    U.seed(21);
    const rock = spotOf({ styles: { 1: 'rock' }, holes: { 0: '7c 2d' }, board: 'Kh Qs 9c' }, ['raise:50', 'call', 'next']).spot;
    assert.deepStrictEqual([rock.kind, rock.facing], ['nodraw', false]);
    assert.ok(rock.bluff.fp > rock.bluff.be + 0.1, JSON.stringify(rock.bluff));
    assert.deepStrictEqual([rock.best, rock.verdicts.check], ['raise', 'ok']);
    const rb = Coach.evaluateAction(rock, { type: 'bet', to: rock.bluff.to });
    assert.strictEqual(rb.verdict, 'correct');
    assert.ok(/^Блеф \d+ выгоден: Игорь сбросит ~\d+%, нужно \d+%\.$/.test(rb.lines[0]), rb.lines[0]);
    assert.strictEqual(Coach.advise(rock).best, 'bet');
    const st = spotOf({ styles: { 1: 'station' }, revealed: true, holes: { 0: '7c 2d' }, board: 'Kh Qs 9c' }, ['raise:50', 'call', 'next']).spot;
    assert.ok(st.bluff.fp < st.bluff.be, JSON.stringify(st.bluff));
    assert.deepStrictEqual([st.best, st.verdicts.raise, st.verdicts.check], ['check', 'mistake', 'best']);
    const sb = Coach.evaluateAction(st, { type: 'bet', to: 60 });
    assert.strictEqual(sb.title, '❌ Действие: ты поставил, правильно — чек.');
    assert.ok(/не окупится: Игорь \(«Коллинг-станция»\) сбросит ~\d+%, нужно 38%/.test(sb.lines[0]), sb.lines[0]);
    // a river spot with nothing to call exists too; a huge overbet bluff vs the rock is judged at its own size
    const rv = spotOf({ styles: { 1: 'rock' }, holes: { 0: '7c 2d' }, board: 'Kh Qs 9c 4d 3s' },
      ['raise:50', 'call', 'next', 'check', 'check', 'next', 'check', 'check', 'next']).spot;
    assert.deepStrictEqual([rv.street, rv.facing, rv.verdicts.fold], ['river', false, 'mistake']);
    const huge = Coach.evaluateAction(rv, { type: 'bet', to: 1000 });
    assert.ok(huge.lines[0].startsWith(`Блеф ${U.fmt(1000)} `), huge.lines[0]);
    // facing a bet with air: the bluff-raise is measured too
    const fr = spotOf({ styles: { 1: 'station' }, holes: { 0: '7c 2d' }, board: 'Kh Qs 9c' }, HU(60)).spot;
    assert.deepStrictEqual([fr.best, fr.verdicts.raise], ['fold', 'mistake']);
    assert.ok(Coach.evaluateAction(fr, { type: 'raise', to: 180 }).lines[0].startsWith('Блеф-рейз до 180 не окупится'));
    U.seed(null);
  });

  test('round 3: foldProb uses the bot logic and stays fast', () => {
    const s = spotOf({ styles: { 1: 'reg' }, holes: { 0: '7c 2d' }, board: 'Kh Qs 9c' }, ['raise:50', 'call', 'next']);
    Coach.foldProb(s.hand, 0, s.table, 33);                    // warm up the board's combo table
    const t0 = performance.now(), p = Coach.foldProb(s.hand, 0, s.table, 66), ms = performance.now() - t0;
    assert.ok(p > 0 && p < 1, 'p ' + p);
    assert.ok(ms < 150, `foldProb took ${ms.toFixed(0)} ms`);   // ~30 ms on a dev machine; generous for slow CI
    assert.strictEqual(Coach.foldProb(s.hand, 0, s.table, 66), p); // cached per decision point
    const allin = spotOf({ styles: { 1: 'reg' }, holes: { 0: '7c 2d' }, board: 'Kh Qs 9c', stacks: { 1: 300 } }, ['raise:50', 'call', 'next', 'check', 'raise:250']);
    assert.strictEqual(Coach.foldProb(allin.hand, 0, allin.table, 500), 0); // an all-in player cannot fold
  });

  test('round 3: no-bet made hands — value bet with strong hands, medium vs ≤ 2 opponents (audit: 3-way top pair bets); sizing question', () => {
    const set = spotOf({ holes: { 0: '7c 7d' }, board: 'Kh 7s 2c 9d 3h' }, ['raise:50', 'call', 'next', 'check', 'check', 'next', 'check', 'check', 'next']).spot;
    assert.deepStrictEqual([set.best, set.verdicts, set.questions], ['raise', { raise: 'best', check: 'ok', fold: 'mistake' }, ['sizing']]);
    const mw = spotOf({ n: 3, holes: { 0: 'Kc Jd' }, board: 'Kh 7s 2c' }, [...MW(100).slice(0, 4), 'check']).spot;
    assert.deepStrictEqual([mw.best, mw.verdicts.raise, mw.verdicts.check], ['raise', 'best', 'ok']);
    const q = Coach.questions(set, {}).find((x) => x.id === 'sizing');
    assert.deepStrictEqual([q.prompt, q.unit, q.info.pot], ['Сколько фишек — ставка 2/3 банка?', 'фишек', 100]);
    assert.deepStrictEqual([67, 58, 77, 56, 78].map((v) => ck(set, 'sizing', v).ok), [true, true, true, false, false]);
    assert.strictEqual(ck(set, 'sizing', 50).title, '❌ Ставка 2/3 банка: ты указал 50, правильно 67.');
    assert.deepStrictEqual(Coach.questions(set, { questions: { potodds: false } }), []); // sizing follows the pot-odds toggle
    assert.strictEqual(Coach.advise(set).title, '👨‍🏫 Лучше: ставка 70');
  });

  test('round 3: approximate pot odds — mental-math rounding and simple fractions are accepted', () => {
    const sp = { pot: 470, toCall: 160, needed: (160 / 630) * 100, potStart: 310, myBet: 0, betTo: 160 }; // 25,4%
    assert.deepStrictEqual([25, 22.5, 28.3, 23, 27, 29, 21].map((v) => ck(sp, 'potodds', v).ok), [true, true, true, true, true, false, false]);
    const third = { pot: 320, toCall: 160, needed: (160 / 480) * 100, potStart: 160, myBet: 0, betTo: 160 };
    assert.ok(ck(third, 'potodds', 35).ok);
    assert.ok(all(ck(third, 'potodds', 33)).includes('Быстро: 160 ÷ 480 ≈ 1/3 → 33%.'));
    assert.ok(!ck(third, 'potodds', 38).ok);
  });

  test('round 3: the bluff question after a bet with a weak hand', () => {
    U.seed(8);
    const sp = spotOf({ styles: { 1: 'rock' }, holes: { 0: '7c 2d' }, board: 'Kh Qs 9c' }, ['raise:50', 'call', 'next']).spot;
    assert.deepStrictEqual(Coach.afterActionQuestions(sp, { type: 'check' }, {}), []);
    assert.deepStrictEqual(Coach.afterActionQuestions(sp, { type: 'bet', to: 50 }, { questions: { potodds: false } }), []);
    const [q] = Coach.afterActionQuestions(sp, { type: 'bet', to: 50 }, {});
    assert.deepStrictEqual([q.id, q.type, q.unit, q.prompt, q.info], ['bluff', 'number', '%', 'Как часто соперник должен сбросить, чтобы блеф окупился?', { pot: 100, bet: 50 }]);
    const ok = ck(sp, 'bluff', 33);
    assert.strictEqual(ok.title, '✅ Блеф: нужно 33% сбросов — верно.');
    assert.strictEqual(ok.lines[0], 'Быстро: ставка ÷ (банк + ставка) = 50 ÷ 150 ≈ 1/3 → 33%.');
    assert.ok(/^Игорь сбросит ~\d+%, нужно 33% — блеф (не )?окупается\.$/.test(ok.lines[1]), ok.lines[1]);
    assert.strictEqual(ck(sp, 'bluff', 50).title, '❌ Блеф: ты указал 50%, нужно 33% сбросов.');
    assert.ok(ck(sp, 'bluff', 35).ok);
    const value = spotOf({ holes: { 0: '7c 7d' }, board: 'Kh 7s 2c' }, ['raise:50', 'call', 'next']).spot;
    assert.deepStrictEqual(Coach.afterActionQuestions(value, { type: 'bet', to: 60 }, {}), []); // a value bet is no bluff
    U.seed(null);
  });

  test('round 3: questions — pot odds whenever facing a bet (any street), outs whenever there is a draw', () => {
    U.seed(2);
    const riv = spotOf({ styles: { 1: 'maniac' }, holes: { 0: '8d 8c' }, board: 'Ts 7d 2s 3h 4c' },
      ['raise:50', 'call', 'next', 'check', 'check', 'next', 'check', 'check', 'next', 'check', 'raise:100']).spot;
    assert.deepStrictEqual(riv.questions, ['potodds']);
    const tpfd = spotOf({ holes: { 0: 'Kh Qh' }, board: 'Kc 7h 2h' }, ['raise:50', 'call', 'next']).spot;  // made + flush draw, no bet
    assert.deepStrictEqual(tpfd.questions, ['outs', 'equity', 'sizing']);
    U.seed(null);
  });

  test('round 3: tells quiz — honest, acting and random reactions; the cheat sheet', () => {
    const { table, hand } = deal({ n: 3, holes: { 1: 'Ks Kd' }, board: 'Kh 7c 2d' });
    const shrug = { seat: 1, shown: 'weakness', truth: 'weak', acting: false, random: false, anim: 'shrug', text: 'едва заметно пожимает плечами', meaning: 'так часто ведут себя, когда флоп не попал' };
    const q = Coach.tellQuestion(shrug, table);
    assert.deepStrictEqual([q.id, q.type, q.prompt], ['tell', 'choice', 'Что значит: Игорь едва заметно пожимает плечами?']);
    assert.deepStrictEqual(q.options.map((o) => o.v), ['strength', 'weakness', 'acting', 'nothing']);
    assert.strictEqual(q.reaction, shrug);
    const g = (r, a) => Coach.tellReview(r, a, hand, table);
    assert.deepStrictEqual(['strength', 'weakness', 'acting', 'nothing'].map((a) => g(shrug, a).ok), [false, true, false, false]);
    const sigh = { ...shrug, shown: 'weakness', truth: 'strong', acting: true, anim: 'sigh', text: 'демонстративно вздыхает' };
    assert.deepStrictEqual(['strength', 'weakness', 'acting', 'nothing'].map((a) => g(sigh, a).ok), [false, false, true, false]);
    const noise = { ...shrug, random: true, truth: 'strong' };
    assert.deepStrictEqual(['strength', 'weakness', 'acting', 'nothing'].map((a) => g(noise, a).ok), [false, true, false, true]);
    const r = g(sigh, 'weakness');
    assert.strictEqual(r.kind, 'tells');
    assert.strictEqual(r.title, '❌ Телл: «слабость» → на деле актёрство.');
    assert.deepStrictEqual(r.lines, ['Это актёрство: показная слабость прикрывала силу.', 'У Игоря K♠K♦: сильная рука — карта помогла.']);
    assert.ok(r.more.some((l) => l.includes('скрыт')), 'hidden style is not named');
    assert.ok(!texts(r).join(' ').includes('Регуляр»'));
    table.players[1].revealed = true;
    assert.ok(g(sigh, 'acting').more.some((l) => l.startsWith('Игорь («Регуляр»)')));
    checkShape(r, 'tell');
    for (const anim of ['glance', 'freeze', 'quiet', 'tremble', 'lookaway', 'chatter', 'shrug', 'sigh', 'smile', 'toss']) {
      const e = Coach.TELLS_GUIDE.find((x) => x.anim === anim);
      assert.ok(e && e.sign && e.meaning && e.reliability, anim);
    }
  });

  test('round 3: every post-hand text is short too (outs, cards, equity, pot odds, real equity, reads, look hints)', () => {
    const { spot } = spotOf({ holes: { 0: '8h 7h' }, board: '6h 5h Kc' }, HU(100));
    for (const [q, v] of [['outs', 15], ['outs', 3], ['cards', 2], ['equity', 30], ['equity', 60], ['potodds', 33], ['potodds', 10]]) checkShape(ck(spot, q, v, { outs: 9 }), q);
    const mw = spotOf({ n: 3, holes: { 0: 'Qc As' }, board: '9d Td Jd 3d' }, [...MW(100).slice(0, 4), 'check', 'check', 'check', 'next', 'raise:100']).spot;
    checkShape(ck(mw, 'outs', 0), 'mw outs');
    const low = spotOf({ holes: { 0: '7h 6h', 1: 'Ah Qh' }, board: 'Kh 9h 2c' }, HU(100));
    checkShape(Coach.realEquity(low.spot, low.hand), 'real');
    const big = spotOf({ styles: { 1: 'rock' }, holes: { 0: 'Ah Qh', 1: 'Ks Kd' }, board: 'Kh 7c 2d' }, HU(100));
    checkShape(Coach.readReview(Coach.readQuestion(big.hand, 0, big.table), 'bluff', big.hand, big.table, { thinkMs: 800, tellsSeen: [] }), 'read');
    const t = { seat: 1, shown: 'weakness', truth: 'weak', acting: false, random: false, text: 'отворачивается от стола и безразлично смотрит в сторону', meaning: 'так часто ведут себя, когда флоп не попал' };
    checkShape(Coach.lookHint([t], big.table, 'flop'), 'look');
  });

})();
