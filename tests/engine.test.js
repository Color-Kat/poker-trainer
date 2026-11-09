// Engine: positions, blinds, betting rules, side pots, showdown, chip-conservation fuzz.
// Wrapped in an IIFE: test files share one script scope with src/ and the other tests.
(() => {
  const C = (s) => Cards.parseList(s);
  // Deck whose pops deal `cards` in order: hole cards two per seat in hand.seats order, then flop, turn, river.
  const deckOf = (cards) => {
    const top = C(cards);
    return Cards.deck().filter((c) => !top.includes(c)).concat(top.reverse());
  };
  const mkTable = (stacks, o = {}) => Engine.createTable({ players: stacks.map((stack, i) => ({ name: 'P' + i, stack })), ...o });
  const stacks = (t) => t.players.map((p) => p.stack);
  // Act as `seat`, asserting it is that seat's turn.
  const go = (h, seat, type, to) => {
    assert.strictEqual(h.toAct, seat, `seat ${seat} should act, toAct = ${h.toAct}`);
    return Engine.act(h, { type, to });
  };
  // Check/call everything down to the end; returns the advance() events.
  const playOut = (h) => {
    const evs = [];
    for (let g = 0; h.phase !== 'done'; g++) {
      assert.ok(g < 200, 'hand does not terminate');
      if (h.phase === 'betting') Engine.act(h, { type: 'call' });
      else evs.push(Engine.advance(h));
    }
    return evs;
  };
  const foldOut = (h) => { while (h.phase === 'betting') Engine.act(h, { type: 'fold' }); return playOut(h); };

  test('engine: position names for 2–9 players', () => {
    const all = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
    assert.deepStrictEqual(Engine.positionNames(2), ['BTN', 'BB']);
    assert.deepStrictEqual(Engine.positionNames(3), ['BTN', 'SB', 'BB']);
    assert.deepStrictEqual(Engine.positionNames(6), ['LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
    for (let n = 3; n <= 9; n++) assert.deepStrictEqual(Engine.positionNames(n), all.slice(9 - n));
  });

  test('engine: seats, preflop order and position labels (9-, 6-, 3-, 2-handed)', () => {
    const check = (t, seats, order, sbSeat, bbSeat) => {
      const h = Engine.startHand(t);
      assert.deepStrictEqual(h.seats, seats);
      assert.deepStrictEqual(h.order, order);
      assert.deepStrictEqual(h.order.map((s) => h.pos[s]), Engine.positionNames(order.length));
      assert.deepStrictEqual([h.sbSeat, h.bbSeat, h.toAct], [sbSeat, bbSeat, order[0]]);
      t.players.forEach((p, s) => {
        assert.strictEqual(h.dealt[s], seats.includes(s));
        if (!h.dealt[s]) assert.ok(h.pos[s] === null && h.hole[s] === null);
      });
      assert.strictEqual(new Set(seats.flatMap((s) => h.hole[s])).size, seats.length * 2);
      assert.deepStrictEqual(h.log.map((e) => [e.i, e.type, e.seat, e.add, e.to]), [[0, 'sb', sbSeat, 10, 10], [1, 'bb', bbSeat, 20, 20]]);
      assert.deepStrictEqual([Engine.pot(h), h.currentBet, h.minRaise, h.raises, h.street, h.phase], [30, 20, 20, 0, 'preflop', 'betting']);
      return h;
    };
    let t = mkTable(new Array(9).fill(1000));
    let h = check(t, [1, 2, 3, 4, 5, 6, 7, 8, 0], [3, 4, 5, 6, 7, 8, 0, 1, 2], 1, 2);
    assert.deepStrictEqual([h.pos[3], h.pos[0], h.pos[1], h.pos[2]], ['UTG', 'BTN', 'SB', 'BB']);
    assert.deepStrictEqual(stacks(t), [1000, 990, 980, 1000, 1000, 1000, 1000, 1000, 1000]);
    assert.deepStrictEqual(h.startStacks, new Array(9).fill(1000));

    // 6 of 9 seats in play: seats 2 and 7 busted, seat 5 has no chips; button on seat 3
    t = mkTable([1000, 1000, 1000, 1000, 1000, 0, 1000, 1000, 1000], { button: 3 });
    t.players[2].busted = t.players[7].busted = true;
    h = check(t, [4, 6, 8, 0, 1, 3], [8, 0, 1, 3, 4, 6], 4, 6);
    assert.deepStrictEqual([h.pos[8], h.pos[0], h.pos[1], h.pos[3], h.pos[4], h.pos[6]], ['LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);

    h = check(mkTable([1000, 1000, 1000], { button: 1 }), [2, 0, 1], [1, 2, 0], 2, 0);
    assert.deepStrictEqual(h.pos, ['BB', 'BTN', 'SB']);

    // heads-up: the button posts the small blind and acts first preflop
    h = check(mkTable([1000, 1000]), [1, 0], [0, 1], 0, 1);
    assert.deepStrictEqual(h.pos, ['BTN', 'BB']);
  });

  test('engine: button moves clockwise, skipping busted and empty seats', () => {
    const t = mkTable([1000, 1000, 1000, 1000, 1000], { button: 2 });
    const seq = [];
    const next = () => { const h = Engine.startHand(t); seq.push([h.no, h.button, h.sbSeat, h.bbSeat]); foldOut(h); };
    next(); next();
    t.players[4].busted = true;
    t.players[0].stack = 0;
    next(); next(); next();
    t.players[3].busted = true;
    next(); next();
    // hand 6 goes heads-up: seat 2 had the BB in hand 5, so it takes the button (see the TDA test below)
    assert.deepStrictEqual(seq, [[1, 2, 3, 4], [2, 3, 4, 0], [3, 1, 2, 3], [4, 2, 3, 1], [5, 3, 1, 2], [6, 2, 2, 1], [7, 1, 1, 2]]);
    assert.strictEqual(t.handNo, 7);

    // first hand: an ineligible button moves on to the next eligible seat
    const t2 = mkTable([1000, 0, 1000, 1000], { button: 1 });
    const h = Engine.startHand(t2);
    assert.deepStrictEqual([t2.button, h.button, h.sbSeat, h.bbSeat], [2, 2, 3, 0]);
    assert.throws(() => Engine.startHand(mkTable([1000, 0])), /at least 2/);
  });

  test('engine: going heads-up, nobody posts the big blind twice in a row (TDA)', () => {
    // hand 1: button 0, SB 1, BB 2; then `bust` seats are eliminated. Heads-up the button posts the SB.
    const blinds = (n, bust) => {
      const t = mkTable(new Array(n).fill(1000));
      const seq = [];
      for (let k = 0; k < 3; k++) {
        const h = Engine.startHand(t);
        seq.push([h.button, h.bbSeat]);
        foldOut(h);
        if (!k) for (const s of bust) Object.assign(t.players[s], { stack: 0, busted: true });
      }
      return seq;
    };
    assert.deepStrictEqual(blinds(3, [0]), [[0, 2], [2, 1], [1, 2]]); // the button busts: last hand's BB takes the button
    assert.deepStrictEqual(blinds(4, [0, 3]), [[0, 2], [2, 1], [1, 2]]);
    assert.deepStrictEqual(blinds(3, [1]), [[0, 2], [2, 0], [0, 2]]); // plain rotation is already fine
    assert.deepStrictEqual(blinds(3, [2]), [[0, 2], [1, 0], [0, 1]]);
  });

  test('engine: first to act preflop and postflop (skipping folded and all-in players)', () => {
    // 4-handed, button 0 → seats [1, 2, 3, 0]; the SB (seat 1) calls all-in, so the BB leads postflop
    let h = Engine.startHand(mkTable([1000, 20, 1000, 1000]));
    go(h, 3, 'call'); go(h, 0, 'call');
    const e = go(h, 1, 'call');
    assert.deepStrictEqual([e.type, e.add, e.allIn], ['call', 10, true]);
    go(h, 2, 'check');
    Engine.advance(h);
    assert.strictEqual(h.toAct, 2);
    go(h, 2, 'check'); go(h, 3, 'check'); go(h, 0, 'check');
    assert.strictEqual(h.phase, 'roundEnd');

    // 3-handed, the SB folds preflop: the BB leads on every street
    h = Engine.startHand(mkTable([1000, 1000, 1000]));
    go(h, 0, 'call'); go(h, 1, 'fold'); go(h, 2, 'check');
    Engine.advance(h);
    go(h, 2, 'check'); go(h, 0, 'check');
    Engine.advance(h);
    assert.strictEqual(h.toAct, 2);

    // heads-up: the button acts first preflop, the BB first postflop
    h = Engine.startHand(mkTable([1000, 1000], { button: 1 }));
    assert.deepStrictEqual([h.sbSeat, h.bbSeat, h.toAct], [1, 0, 1]);
    go(h, 1, 'call'); go(h, 0, 'check');
    Engine.advance(h);
    go(h, 0, 'check'); go(h, 1, 'check');
    assert.strictEqual(Engine.advance(h).street, 'turn');
    assert.strictEqual(h.toAct, 0);
  });

  test('engine: min-raise sequence and raise-size normalization', () => {
    const h = Engine.startHand(mkTable([1000, 1000, 1000])); // button 0, SB 1, BB 2
    let L = Engine.legal(h);
    assert.deepStrictEqual([L.seat, L.toCall, L.minTo, L.maxTo, L.isBet, L.canCheck, L.canCall, L.canRaise, L.pot],
      [0, 20, 40, 1000, false, false, true, true, 30]);
    let e = go(h, 0, 'raise', 60);
    assert.deepStrictEqual([e.type, e.add, e.to, e.facing, e.potBefore, e.potAfter, e.street], ['raise', 60, 60, 20, 30, 90, 'preflop']);
    assert.deepStrictEqual([h.raises, h.minRaise, h.lastRaiser, Engine.legal(h).minTo], [1, 40, 0, 100]);
    go(h, 1, 'call'); go(h, 2, 'call');
    Engine.advance(h);
    // flop: min bet = BB; bet 40, raise to 100 → next min raise-to 160
    L = Engine.legal(h);
    assert.deepStrictEqual([L.seat, L.isBet, L.minTo, L.canCheck, L.canCall], [1, true, 20, true, false]);
    assert.strictEqual(go(h, 1, 'raise', 40).type, 'bet');
    assert.strictEqual(Engine.legal(h).minTo, 80);
    assert.strictEqual(go(h, 2, 'raise', 100).type, 'raise');
    L = Engine.legal(h);
    assert.deepStrictEqual([L.seat, L.toCall, L.minTo, h.minRaise], [0, 100, 160, 60]);
    e = go(h, 0, 'raise', 120); // below the minimum → raised to the minimum
    assert.deepStrictEqual([e.to, e.add, e.incomplete], [160, 160, false]);
    e = go(h, 1, 'raise', 99999); // more than the stack → all-in
    assert.deepStrictEqual([e.type, e.to, e.add, e.allIn, e.incomplete], ['raise', 940, 900, true, false]);
    assert.deepStrictEqual([h.raises, h.lastRaiser, h.minRaise], [4, 1, 780]);
  });

  test('engine: BB option when limped; check-around ends the street', () => {
    let h = Engine.startHand(mkTable([1000, 1000, 1000]));
    go(h, 0, 'call'); go(h, 1, 'call');
    const L = Engine.legal(h);
    assert.deepStrictEqual([L.seat, L.toCall, L.canCheck, L.canRaise, L.minTo], [2, 0, true, true, 40]);
    go(h, 2, 'check');
    assert.deepStrictEqual([h.phase, h.toAct, Engine.legal(h)], ['roundEnd', null, null]);
    const ev = Engine.advance(h);
    assert.deepStrictEqual([ev.type, ev.street, ev.cards.length, ev.returned], ['street', 'flop', 3, null]);
    assert.deepStrictEqual(h.board, ev.cards);
    assert.deepStrictEqual([h.phase, h.toAct, h.currentBet, h.raises, h.potAtStreetStart, h.bets], ['betting', 1, 0, 0, 60, [0, 0, 0]]);
    go(h, 1, 'check'); go(h, 2, 'check'); go(h, 0, 'check');
    assert.strictEqual(h.phase, 'roundEnd');
    assert.strictEqual(Engine.advance(h).street, 'turn');
    assert.strictEqual(h.board.length, 4);

    // the BB raises when limped to: the limpers act again
    h = Engine.startHand(mkTable([1000, 1000, 1000]));
    go(h, 0, 'call'); go(h, 1, 'call'); go(h, 2, 'raise', 80);
    assert.ok(Engine.legal(h).canRaise);
    go(h, 0, 'call'); go(h, 1, 'fold');
    assert.deepStrictEqual([h.phase, Engine.pot(h)], ['roundEnd', 180]);
  });

  test('engine: everyone folds → uncontested win, uncalled bet returned', () => {
    const t = mkTable([1000, 1000, 1000, 1000]); // button 0: SB 1, BB 2, first to act 3
    let h = Engine.startHand(t);
    go(h, 3, 'raise', 60); go(h, 0, 'fold'); go(h, 1, 'fold'); go(h, 2, 'fold');
    assert.deepStrictEqual([h.phase, Engine.pot(h)], ['roundEnd', 90]);
    let ev = Engine.advance(h);
    assert.strictEqual(ev.type, 'uncontested');
    assert.deepStrictEqual(ev.returned, { seat: 3, amount: 40 });
    const r = ev.result;
    assert.strictEqual(r, h.result);
    assert.ok(r.uncontested);
    assert.deepStrictEqual(r.pots, [{ amount: 50, eligible: [3], winners: [3], name: 'Основной банк' }]);
    assert.deepStrictEqual([r.payouts, r.returned, r.net, r.winners, r.shown], [[0, 0, 0, 50], [0, 0, 0, 40], [0, -10, -20, 30], [3], []]);
    assert.deepStrictEqual(stacks(t), [1000, 990, 980, 1030]);
    assert.deepStrictEqual([h.phase, h.toAct, Engine.pot(h)], ['done', null, 50]);
    assert.throws(() => Engine.act(h, { type: 'call' }), /phase/);
    assert.throws(() => Engine.advance(h), /phase/);

    // walk: everyone folds to the BB, the SB's half-blind is all it wins
    h = Engine.startHand(t); // button 1: SB 2, BB 3, first 0
    go(h, 0, 'fold'); go(h, 1, 'fold'); go(h, 2, 'fold');
    ev = Engine.advance(h);
    assert.deepStrictEqual([ev.returned, ev.result.payouts, ev.result.net], [{ seat: 3, amount: 10 }, [0, 0, 0, 20], [0, 0, -10, 10]]);

    // postflop bet, everyone folds: the bet comes back
    h = Engine.startHand(t); // button 2: SB 3, BB 0, first 1
    go(h, 1, 'call'); go(h, 2, 'call'); go(h, 3, 'call'); go(h, 0, 'check');
    Engine.advance(h);
    go(h, 3, 'raise', 50); go(h, 0, 'fold'); go(h, 1, 'fold'); go(h, 2, 'fold');
    ev = Engine.advance(h);
    assert.deepStrictEqual([ev.returned, ev.result.payouts], [{ seat: 3, amount: 50 }, [0, 0, 0, 80]]);
    assert.strictEqual(U.sum(stacks(t)), 4000);
  });

  test('engine: incomplete all-in raise does not reopen betting for players who acted', () => {
    // button 0 → A = seat 1 (SB), B = seat 2 (BB, short), C = seat 0 (BTN); limp to the flop
    const limpToFlop = (st) => {
      const h = Engine.startHand(mkTable(st));
      go(h, 0, 'call'); go(h, 1, 'call'); go(h, 2, 'check');
      Engine.advance(h);
      return h;
    };
    let h = limpToFlop([1000, 1000, 150]);
    go(h, 1, 'raise', 100);
    let e = go(h, 2, 'raise', 1000); // B is all-in for 130: +30 is less than a full raise
    assert.deepStrictEqual([e.type, e.to, e.add, e.allIn, e.incomplete, e.facing], ['raise', 130, 130, true, true, 100]);
    assert.deepStrictEqual([h.currentBet, h.minRaise, h.raises], [130, 100, 2]);
    let L = Engine.legal(h); // C has not acted yet: may raise, min raise-to = 130 + 100
    assert.deepStrictEqual([L.seat, L.toCall, L.canRaise, L.minTo], [0, 130, true, 230]);
    go(h, 0, 'call');
    L = Engine.legal(h); // A already acted and faces only the short raise: call or fold
    assert.deepStrictEqual([L.seat, L.toCall, L.canCall, L.canRaise], [1, 30, true, false]);
    e = go(h, 1, 'raise', 500); // a raise request becomes a call
    assert.deepStrictEqual([e.type, e.add, e.to], ['call', 30, 130]);
    assert.strictEqual(h.phase, 'roundEnd');

    // a full re-raise by C reopens the betting for A
    h = limpToFlop([1000, 1000, 150]);
    go(h, 1, 'raise', 100); go(h, 2, 'raise', 130);
    assert.ok(!go(h, 0, 'raise', 230).incomplete);
    L = Engine.legal(h);
    assert.deepStrictEqual([L.seat, L.toCall, L.canRaise, L.minTo], [1, 130, true, 330]);

    // short all-ins that add up to a full raise reopen it too (TDA): A bets 100, B all-in 150, C all-in 210
    h = Engine.startHand(mkTable([1000, 1000, 170, 230])); // button 0: postflop order 1, 2, 3, 0
    go(h, 3, 'call'); go(h, 0, 'call'); go(h, 1, 'call'); go(h, 2, 'check');
    Engine.advance(h);
    go(h, 1, 'raise', 100);
    assert.ok(go(h, 2, 'raise', 150).incomplete);
    assert.ok(go(h, 3, 'raise', 210).incomplete);
    go(h, 0, 'call');
    L = Engine.legal(h);
    assert.deepStrictEqual([L.seat, L.toCall, L.canRaise, L.minTo], [1, 110, true, 310]);

    // ...but only for those who acted before both: A bets 100, B calls, C all-in 150, D calls 150, E all-in 240.
    // A and B face +140 (≥ the full 100) and may raise; D faced only +90 → call or fold.
    h = Engine.startHand(mkTable([260, 1000, 1000, 170, 1000])); // button 0: postflop order 1, 2, 3, 4, 0
    go(h, 3, 'call'); go(h, 4, 'call'); go(h, 0, 'call'); go(h, 1, 'call'); go(h, 2, 'check');
    Engine.advance(h);
    go(h, 1, 'raise', 100); go(h, 2, 'call');
    assert.ok(go(h, 3, 'raise', 999).incomplete);
    go(h, 4, 'call');
    assert.ok(go(h, 0, 'raise', 999).incomplete);
    const view = () => { const x = Engine.legal(h); return [x.seat, x.toCall, x.canRaise, x.minTo]; };
    assert.deepStrictEqual(view(), [1, 140, true, 340]);
    go(h, 1, 'call');
    assert.deepStrictEqual(view(), [2, 140, true, 340]);
    go(h, 2, 'call');
    assert.deepStrictEqual(view().slice(0, 3), [4, 90, false]);
    assert.deepStrictEqual([go(h, 4, 'raise', 999)].map((x) => [x.type, x.add]), [['call', 90]]);
    assert.strictEqual(h.phase, 'roundEnd');
  });

  test('engine: short-stack blinds post all-in; callers still owe the full BB', () => {
    // button 0: SB = seat 1, BB = seat 2 with only 15 chips
    const t = mkTable([1000, 1000, 15]);
    let h = Engine.startHand(t, { deck: deckOf('7c 2d  Ah Ad  Kh Kd  3s 8h 9c Js 4d') });
    assert.deepStrictEqual([h.log[1].type, h.log[1].add, h.log[1].allIn], ['bb', 15, true]);
    const L = Engine.legal(h);
    assert.deepStrictEqual([L.seat, L.toCall, L.minTo, h.currentBet, h.minRaise], [0, 20, 40, 20, 20]);
    go(h, 0, 'call'); go(h, 1, 'call');
    assert.strictEqual(h.phase, 'roundEnd'); // the all-in BB has no option
    playOut(h);
    let r = h.result;
    assert.deepStrictEqual(r.pots.map((p) => [p.name, p.amount, p.eligible, p.winners]),
      [['Основной банк', 45, [1, 2, 0], [2]], ['Побочный банк 1', 10, [1, 0], [0]]]);
    assert.deepStrictEqual([r.payouts, r.net, r.shown], [[10, 0, 45], [-10, -20, 30], [1, 2, 0]]);
    assert.deepStrictEqual([r.names[2], r.names[0], r.names[1]], ['Пара тузов', 'Пара королей', 'Старшая карта: валет']);

    // a short SB posts all-in, the BB posts in full; if everyone folds the BB gets the unmatched 15 back
    h = Engine.startHand(mkTable([1000, 5, 1000]));
    assert.deepStrictEqual(h.log.map((e) => [e.type, e.add, e.allIn]), [['sb', 5, true], ['bb', 20, false]]);
    assert.strictEqual(Engine.legal(h).toCall, 20);
    go(h, 0, 'fold');
    assert.strictEqual(h.phase, 'roundEnd'); // the BB has nobody left to bet against
    assert.deepStrictEqual(Engine.advance(h).returned, { seat: 2, amount: 15 });

    // heads-up: the button can't cover the SB, the BB has nothing to decide; all-in run-out street by street
    const t2 = mkTable([7, 1000]);
    h = Engine.startHand(t2, { deck: deckOf('2c 7d  As Ks  3h 9s Jc Qd 4h') });
    assert.deepStrictEqual([h.phase, h.toAct, h.log[0].add, h.log[0].allIn], ['roundEnd', null, 7, true]);
    let ev = Engine.advance(h);
    assert.deepStrictEqual([ev.type, ev.street, ev.returned, h.phase], ['street', 'flop', { seat: 1, amount: 13 }, 'roundEnd']);
    assert.deepStrictEqual([Engine.advance(h).street, h.phase], ['turn', 'roundEnd']);
    assert.deepStrictEqual([Engine.advance(h).street, h.phase], ['river', 'roundEnd']);
    ev = Engine.advance(h);
    r = ev.result;
    assert.deepStrictEqual([ev.type, ev.returned, h.phase], ['showdown', null, 'done']);
    assert.deepStrictEqual(r.pots.map((p) => [p.amount, p.winners]), [[14, [0]]]);
    assert.deepStrictEqual([stacks(t2), r.net, r.returned], [[14, 993], [7, -7], [0, 13]]);
  });

  test('engine: a lone player who already covers a short all-in BB has nothing to decide', () => {
    // heads-up: the button posts the SB (10), the BB is all-in for 5 → straight to the run-out, 5 comes back
    const t = mkTable([1000, 5]);
    let h = Engine.startHand(t, { deck: deckOf('As Ad  Kc Qc  2h 7d 9s Jh 3c') });
    assert.deepStrictEqual([h.sbSeat, h.bbSeat, h.phase, h.toAct, Engine.legal(h)], [0, 1, 'roundEnd', null, null]);
    const evs = playOut(h);
    assert.deepStrictEqual(evs.map((x) => x.street || x.type), ['flop', 'turn', 'river', 'showdown']);
    assert.deepStrictEqual(evs[0].returned, { seat: 0, amount: 5 });
    assert.deepStrictEqual([h.result.pots.map((p) => [p.amount, p.winners]), stacks(t)], [[[10, [1]]], [995, 10]]);

    // 3-handed: the button folds, the SB's 10 already covers the BB's 5
    h = Engine.startHand(mkTable([1000, 1000, 5]));
    go(h, 0, 'fold');
    assert.deepStrictEqual([h.phase, h.toAct], ['roundEnd', null]);
    assert.deepStrictEqual(Engine.advance(h).returned, { seat: 1, amount: 5 });

    // a BB all-in for 15 still has to be called: the SB owes the full BB (10 more) and gets 5 back
    h = Engine.startHand(mkTable([1000, 15]));
    const L = Engine.legal(h);
    assert.deepStrictEqual([L.seat, L.toCall, L.canRaise], [0, 10, false]);
    go(h, 0, 'call');
    assert.deepStrictEqual(Engine.advance(h).returned, { seat: 0, amount: 5 });
  });

  test('engine: 4-way all-in preflop with a folded contributor → side pots, eligibility, payouts', () => {
    // button 0 → seats [1, 2, 3, 4, 0]; SB 1 (300), BB 2 (500); preflop order 3, 4, 0, 1, 2
    const t = mkTable([1000, 300, 500, 800, 1200]);
    const h = Engine.startHand(t, { deck: deckOf('Kh Kd  Jh Jd  3s 4s  9s 9d  As Ah  2c 7d 9h Js Kc') });
    go(h, 3, 'raise', 100);
    assert.ok(go(h, 4, 'raise', 5000).allIn); // 1200
    let e = go(h, 0, 'call'); // all-in for less: 1000
    assert.deepStrictEqual([e.type, e.add, e.allIn, e.facing], ['call', 1000, true, 1200]);
    assert.deepStrictEqual([go(h, 1, 'call').add, go(h, 2, 'call').add], [290, 480]);
    go(h, 3, 'fold'); // 100 stays in the pot
    assert.strictEqual(h.phase, 'roundEnd');
    const evs = [];
    while (h.phase !== 'done') {
      evs.push(Engine.advance(h));
      if (h.phase !== 'done') assert.deepStrictEqual([h.phase, h.toAct], ['roundEnd', null]);
    }
    assert.deepStrictEqual(evs.map((x) => x.street || x.type), ['flop', 'turn', 'river', 'showdown']);
    assert.deepStrictEqual(evs[0].returned, { seat: 4, amount: 200 }); // nobody covered the last 200
    assert.ok(!h.allIn[4]);
    const r = h.result;
    assert.deepStrictEqual(r.pots.map((p) => [p.name, p.amount, p.eligible, p.winners]), [
      ['Основной банк', 1300, [1, 2, 4, 0], [1]],
      ['Побочный банк 1', 600, [2, 4, 0], [2]],
      ['Побочный банк 2', 1000, [4, 0], [4]],
    ]);
    assert.deepStrictEqual(r.payouts, [0, 1300, 600, 0, 1000]);
    assert.deepStrictEqual(stacks(t), [0, 1300, 600, 700, 1200]);
    assert.deepStrictEqual(r.net, [-1000, 1000, 100, -100, 0]);
    assert.deepStrictEqual([r.shown, r.winners], [[1, 2, 4, 0], [1, 2, 4]]);
    assert.deepStrictEqual([r.names[1], r.names[2], r.names[4], r.names[0], r.names[3]],
      ['Тройка королей', 'Тройка валетов', 'Тройка девяток', 'Пара тузов', null]);
    assert.deepStrictEqual(r.best[1].slice().sort((a, b) => a - b), C('Kh Kd Kc Js 9h').sort((a, b) => a - b));
    assert.strictEqual(U.sum(r.payouts), U.sum(h.committed) - U.sum(h.returned));
  });

  test('engine: split pots — odd chip clockwise from the button; board plays', () => {
    // sb 5 / bb 10, button 0 → seats [1, 2, 0]; the SB folds, BTN and BB tie with A-K: 25 → 13 + 12
    let h = Engine.startHand(mkTable([1000, 1000, 1000], { sb: 5, bb: 10 }), { deck: deckOf('2d 3h  Ac Kc  Ah Kd  As Kh 7d 4s 9c') });
    go(h, 0, 'call'); go(h, 1, 'fold'); go(h, 2, 'check');
    playOut(h);
    let r = h.result;
    assert.deepStrictEqual(r.pots.map((p) => [p.amount, p.winners]), [[25, [2, 0]]]);
    assert.deepStrictEqual([r.payouts, r.shown], [[12, 0, 13], [2, 0]]);
    assert.strictEqual(r.scores[0], r.scores[2]);

    // the board (5–9 straight) plays for all three remaining players: 70 → 24 + 23 + 23
    const t = mkTable([1000, 1000, 1000, 1000]); // button 0 → seats [1, 2, 3, 0]
    h = Engine.startHand(t, { deck: deckOf('Qd Jd  2c 2d  3h 4h  Ah Kh  5c 6d 7h 8s 9c') });
    go(h, 3, 'call'); go(h, 0, 'call'); go(h, 1, 'fold'); go(h, 2, 'check');
    playOut(h);
    r = h.result;
    assert.deepStrictEqual(r.pots.map((p) => [p.amount, p.eligible, p.winners]), [[70, [2, 3, 0], [2, 3, 0]]]);
    assert.deepStrictEqual([r.payouts, r.winners], [[23, 0, 24, 23], [2, 3, 0]]);
    assert.ok([0, 2, 3].every((s) => r.names[s] === 'Стрит до девятки'));
    assert.deepStrictEqual(stacks(t), [1003, 990, 1004, 1003]);

    // sb 5 / bb 10, button 0 → seats [1, 2, 3, 4, 0]. Seat 4 calls all-in for 13 and wins the main pot (13 × 5);
    // the side pot holds the folded button's dead 17 + 3 × 77 = 248 → three-way split 83 + 83 + 82 (two odd chips).
    const t5 = mkTable([1000, 1000, 1000, 1000, 13], { sb: 5, bb: 10 });
    h = Engine.startHand(t5, { deck: deckOf('2c 3d  2d 3h  2h 3s  Tc Jd  As Ah  5c 6d 7h 8s 9c') });
    go(h, 3, 'raise', 30);
    assert.deepStrictEqual([go(h, 4, 'raise', 13)].map((x) => [x.type, x.add, x.allIn]), [['call', 13, true]]);
    go(h, 0, 'call'); go(h, 1, 'call'); go(h, 2, 'raise', 90); go(h, 3, 'call'); go(h, 0, 'fold'); go(h, 1, 'call');
    playOut(h);
    r = h.result;
    assert.deepStrictEqual(r.pots.map((p) => [p.amount, p.eligible, p.winners]), [[65, [1, 2, 3, 4], [4]], [248, [1, 2, 3], [1, 2, 3]]]);
    assert.deepStrictEqual([r.payouts, stacks(t5)], [[0, 83, 83, 82, 65], [970, 993, 993, 992, 65]]);
  });

  test('engine: illegal actions throw; call/raise normalization; sizeTo; createTable defaults', () => {
    const t = mkTable([1000, 1000, 1000]);
    assert.deepStrictEqual(Object.keys(t).sort(), ['bb', 'button', 'handNo', 'players', 'sb']);
    const p = t.players[1];
    assert.deepStrictEqual([p.seat, p.name, p.busted, p.revealed, p.isHuman, p.hud.hands], [1, 'P1', false, false, false, 0]);
    const h = Engine.startHand(t);
    assert.throws(() => Engine.act(h, { type: 'check' }), /cannot check/);
    assert.throws(() => Engine.act(h, { type: 'shove' }), /unknown action/);
    assert.throws(() => Engine.advance(h), /roundEnd/);
    // preflop pot 30, BTN calls 20: pot-sized raise to 20 + (30 + 20) = 70
    assert.deepStrictEqual([0, 0.5, 1, 100].map((f) => Engine.sizeTo(h, f)), [40, 45, 70, 1000]);
    go(h, 0, 'call'); go(h, 1, 'call');
    const e = go(h, 2, 'call'); // nothing to call → check
    assert.deepStrictEqual([e.type, e.add], ['check', 0]);
    assert.throws(() => Engine.act(h, { type: 'fold' }), /phase/);
    Engine.advance(h);
    assert.deepStrictEqual([1 / 3, 0.75].map((f) => Engine.sizeTo(h, f)), [20, 45]); // pot 60, min bet 20
    assert.strictEqual(Engine.act(h, { type: 'raise' }).to, 20); // no size → minimum
    assert.deepStrictEqual([Engine.act(h, { type: 'bet', to: 60 })].map((x) => [x.type, x.to]), [['raise', 60]]); // 'bet' = 'raise'
    go(h, 0, 'fold');
    assert.strictEqual(h.phase, 'betting');
    go(h, 1, 'call');
    Engine.advance(h);
    go(h, 1, 'check');
    go(h, 2, 'fold');
    assert.ok(Engine.inHand(h, 1) && !Engine.inHand(h, 2));
    assert.strictEqual(Engine.nextSeat(t, 2, (pl) => !pl.busted), 0);
    assert.strictEqual(Engine.nextSeat(h, 1, (pl, s) => Engine.inHand(h, s)), 1); // wraps around to itself last
    assert.strictEqual(Engine.nextSeat(t, 0, () => false), null);

    // pot-sized re-raise with chips already in: pot 100, BB bets 50, BTN raises to 150 (pot 300);
    // BB: 50 in + 100 to call + 1 × (300 + 100) = 550; half pot 350; zero → min raise-to 250
    const hu = Engine.startHand(mkTable([1000, 1000]));
    go(hu, 0, 'raise', 50); go(hu, 1, 'call');
    Engine.advance(hu);
    go(hu, 1, 'raise', 50); go(hu, 0, 'raise', 150);
    assert.deepStrictEqual([0, 0.5, 1].map((f) => Engine.sizeTo(hu, f)), [250, 350, 550]);
  });

  // ---- fuzz ----
  const randomAction = (L) => {
    const r = U.rng();
    if (r < (L.canCheck ? 0.03 : 0.2)) return { type: 'fold' };
    if (r < 0.5) { // sizes: in range, all-in, below the minimum, above the stack (also sent when raising isn't allowed)
      const k = U.rng();
      const to = k < 0.25 ? L.maxTo : k < 0.35 ? L.minTo - U.randInt(1, 50) : k < 0.4 ? L.maxTo + U.randInt(1, 500) : U.randInt(L.minTo, L.maxTo);
      return { type: 'raise', to };
    }
    return { type: U.chance(0.1) || !L.canCheck ? 'call' : 'check' };
  };

  const playRandom = (h) => {
    for (let g = 0; h.phase !== 'done'; g++) {
      assert.ok(g < 1000, 'hand stuck');
      const live = h.seats.filter((x) => !h.folded[x]), top = Math.max(...live.map((x) => h.bets[x]));
      if (h.phase === 'roundEnd') {
        assert.ok(live.length < 2 || live.every((x) => h.allIn[x] || h.bets[x] === top), 'round ended with a live bet unmatched');
        Engine.advance(h);
        continue;
      }
      const L = Engine.legal(h), s = h.toAct;
      assert.ok(Engine.inHand(h, s) && !h.allIn[s], 'toAct can act');
      assert.ok(h.bets[s] < top || live.some((x) => x !== s && !h.allIn[x]), 'toAct has a real decision');
      assert.ok(L.toCall <= L.stack && L.minTo <= L.maxTo && L.maxTo === L.myBet + L.stack);
      const e = Engine.act(h, randomAction(L));
      assert.strictEqual(e.seat, s);
      if (e.type === 'bet' || e.type === 'raise') {
        assert.ok(L.canRaise && e.to >= L.minTo && e.to <= L.maxTo && e.to > L.currentBet);
        assert.strictEqual(e.allIn, e.to === L.maxTo);
        assert.strictEqual(e.type === 'bet', L.currentBet === 0);
      } else if (e.type === 'call') assert.strictEqual(e.add, L.toCall);
      else if (e.type === 'check') assert.ok(L.canCheck);
      assert.strictEqual(h.raises, h.log.filter((x) => x.street === h.street && (x.type === 'bet' || x.type === 'raise')).length);
    }
  };

  const paidOf = (h) => h.committed.map((c, s) => c - h.returned[s]);

  const checkHand = (h, t, total) => {
    const r = h.result, st = stacks(t), paid = paidOf(h);
    assert.strictEqual(h.phase, 'done');
    assert.strictEqual(U.sum(st), total, 'chips conserved');
    assert.ok(st.every((x) => Number.isInteger(x) && x >= 0), 'stacks are non-negative integers');
    assert.strictEqual(U.sum(r.payouts), U.sum(h.committed) - U.sum(h.returned));
    assert.strictEqual(U.sum(r.pots.map((p) => p.amount)), U.sum(r.payouts));
    st.forEach((x, s) => assert.strictEqual(r.net[s], x - h.startStacks[s]));
    const desc = paid.slice().sort((a, b) => b - a);
    assert.strictEqual(desc[0], desc[1], 'uncalled chips returned');
    const live = h.seats.filter((s) => !h.folded[s]);
    r.pots.forEach((p, i) => {
      assert.ok(p.amount > 0 && p.winners.length > 0 && p.winners.every((s) => p.eligible.includes(s)));
      assert.ok(p.eligible.every((s) => live.includes(s)));
      if (i) assert.ok(p.eligible.every((s) => r.pots[i - 1].eligible.includes(s)), 'side pots nest');
      if (!r.uncontested) {
        const top = Math.max(...p.eligible.map((s) => r.scores[s]));
        assert.deepStrictEqual(p.winners, p.eligible.filter((s) => r.scores[s] === top));
      }
    });
    if (r.uncontested) assert.strictEqual(live.length, 1);
    else {
      assert.strictEqual(h.board.length, 5);
      assert.deepStrictEqual(r.shown, live);
      // independent side-pot check: a live player can win from each opponent at most what he put in himself
      for (const s of live) {
        const canWin = U.sum(h.seats.map((x) => Math.min(paid[x], paid[s])));
        assert.strictEqual(U.sum(r.pots.filter((p) => p.eligible.includes(s)).map((p) => p.amount)), canWin);
      }
    }
    const put = new Array(st.length).fill(0);
    h.log.forEach((e, i) => {
      assert.strictEqual(e.i, i);
      assert.strictEqual(e.potAfter - e.potBefore, e.add);
      put[e.seat] += e.add;
    });
    assert.deepStrictEqual(put, h.committed);
    assert.deepStrictEqual([h.log[0].type, h.log[1].type], ['sb', 'bb']);
    const cards = h.seats.flatMap((s) => h.hole[s]).concat(h.board);
    assert.strictEqual(new Set(cards).size, cards.length);
  };

  test('engine: chip-conservation fuzz, 2–9 players, played until one is left', () => {
    U.seed(20261109);
    const n = { hands: 0, showdowns: 0, sidePots: 0, returns: 0, splits: 0, tables: 0 };
    try {
      for (let players = 2; players <= 9; players++) {
        for (let handsHere = 0; handsHere < 400; n.tables++) {
          const bb = U.pick([2, 20, 50]);
          const t = mkTable(Array.from({ length: players }, () => (U.chance(0.25) ? U.randInt(1, 3 * bb) : U.randInt(10, 150) * bb)),
            { sb: bb / 2, bb, button: U.randInt(0, players - 1) });
          const total = U.sum(stacks(t));
          for (let k = 0; t.players.filter((p) => !p.busted).length > 1; k++) {
            assert.ok(k < 600, 'table never finishes');
            if (k && k % 25 === 0) { t.sb *= 2; t.bb *= 2; }
            const h = Engine.startHand(t);
            playRandom(h);
            checkHand(h, t, total);
            const r = h.result;
            n.hands++; handsHere++;
            if (!r.uncontested) n.showdowns++;
            if (r.pots.length > 1) n.sidePots++;
            if (U.sum(r.returned)) n.returns++;
            if (r.pots.some((p) => p.winners.length > 1)) n.splits++;
            t.players.forEach((p) => { if (p.stack === 0) p.busted = true; });
          }
          assert.strictEqual(t.players.filter((p) => p.stack > 0).length, 1);
        }
      }
    } finally {
      U.seed(null);
    }
    assert.ok(n.hands >= 3000, JSON.stringify(n));
    assert.ok(n.showdowns > 300 && n.sidePots > 100 && n.returns > 300 && n.splits > 20, JSON.stringify(n));
  });
})();
