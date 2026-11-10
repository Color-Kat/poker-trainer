// Bots: hand classification, legality fuzz through the real Engine, style separation, tells.
{
  const C = (s) => Cards.parseList(s);
  const cls = (h, b) => Bots.classifyHolding(C(h), C(b));

  test('bots: classifyHolding', () => {
    const cases = [
      // strong
      ['Kh 7d', 'Ks 7c 2h', 'strong'],       // two pair, both hole cards
      ['7h 7d', 'Ks 7c 2h', 'strong'],       // set
      ['Ah 7d', '7s 7c 2h', 'strong'],       // trips with a hole card
      ['Ah 2h', '9h 5h Kh', 'strong'],       // flush
      ['6c 5d', '7s 8h 9c', 'strong'],       // straight
      ['Qh Qd', 'Js 7c 2h', 'strong'],       // overpair ≥ QQ
      ['Ad Kc', 'Ks 7c 2h', 'strong'],       // top pair, A kicker
      ['Ad Kc', 'As 7c 2h', 'strong'],       // top pair aces, K kicker
      ['Kd Ks', '7s 7c 7h 2d', 'strong'],    // full house with the pocket pair
      // medium
      ['Kd Qc', 'Ks 7c 2h', 'medium'],       // top pair, weaker kicker
      ['Jh Jd', 'Ts 7c 2h', 'medium'],       // overpair < QQ
      ['Kh Kd', 'As 7c 2h', 'medium'],       // pocket pair under the top card
      ['8h 7d', 'Ks 7c 2h', 'medium'],       // middle pair
      ['Ad Qc', 'Qs Kc Kh', 'medium'],       // pair of queens under the board kings = middle pair
      ['9h 9d', '7s 7c 3h', 'medium'],       // pocket pair over a paired board
      // draws
      ['Ah 4h', 'Kh 9h 2c', 'draw'],         // nut flush draw
      ['9c 8d', '7s 6h 2c', 'draw'],         // open-ended
      ['9h 7d', 'Js 8c 5h 2d', 'draw'],      // double gutshot (6 and T)
      ['Th 9h', 'Jh 8c 2h', 'draw'],         // flush draw + open-ended
      // bluff
      ['3h 2d', 'Ks 7c 3c', 'bluff'],        // bottom pair = weak pair
      ['Ah Qd', 'Ks 7c 2h', 'bluff'],        // ace high
      ['9c 8d', 'Js 7h 2c', 'bluff'],        // gutshot only
      ['Ah Kd', '7s 7c 3h 3d 2c', 'bluff'],  // board two pair, only a kicker
      ['Ah 4h', 'Kh 9h 2c 5s 7d', 'bluff'],  // missed draw on the river
      ['2c 3d', '9s Ts Js Qs Ks', 'bluff'],  // playing the board (straight flush on board)
      ['7d 3s', 'Qh Qc 7c 3c', 'medium'],    // pairs 7 and 3 under a board pair: middle pair, not a strong two pair
      // pocket pairs rank like the board card they sit under: below the second card = a weak pair
      ['8h 8d', 'Ks 7c 2h', 'medium'],       // between the top and the second card
      ['5h 5d', 'Ks 7c 2h', 'bluff'],        // under the second card = third pair
      ['2c 2d', 'Ah Kc Qd', 'bluff'],        // 22 under three overcards
      ['Jh Jd', 'As Kc Qd 4h', 'bluff'],
      ['5h 5d', '9s 9c 4h', 'medium'],       // over the only other board rank
      ['3h 3d', '9s 9c 4h', 'bluff'],
      // the board plays: a pair or a low card that does not beat the board's straight/flush
      ['Ac Kd', '2h 5h 9h Jh Kh', 'bluff'],  // pair of kings, but the board flush plays
      ['Ah Kd', '5s 6c 7h 8d 9s', 'bluff'],  // board straight
      ['Th 2d', '5s 6c 7h 8d 9s', 'strong'], // a higher straight with a hole card
      ['Ah Qd', 'Ks Kd 7c', 'bluff'],        // board pair + ace high
      // wheel draws
      ['Ah 2d', '3s 4c 9h', 'bluff'],        // A-2-3-4: only a five completes = gutshot
      ['6h 5d', 'As 3c 4h', 'draw'],         // 2 or 7 completes
      ['Ah 5d', '2s 3c Kh 9d', 'bluff'],     // wheel gutshot (4)
    ];
    for (const [h, b, want] of cases) assert.strictEqual(cls(h, b), want, `${h} | ${b}`);
  });

  test('bots: styles, names, lineups', () => {
    assert.deepStrictEqual(Object.keys(Bots.STYLES), Bots.STYLE_IDS);
    const fe = { rock: 'high', station: 'none', reg: 'medium', maniac: 'low' };
    for (const s of Bots.BASE_STYLES) assert.strictEqual(Bots.STYLES[s].foldEquity, fe[s]);
    for (const s of Bots.STYLE_IDS) assert.ok(Bots.STYLES[s].desc.length > 40 && /[а-я]/.test(Bots.STYLES[s].name), s);
    assert.ok(Bots.NAMES.length >= 16);
    const used = [];
    for (let i = 0; i < 9; i++) {
      const b = Bots.createBot({ style: Bots.STYLE_IDS[i % 5], usedNames: used });
      assert.ok(!used.includes(b.name));
      assert.strictEqual(b.avatar.initials, b.name.slice(0, 2));
      assert.ok(/^#[0-9a-f]{6}$/.test(b.avatar.color));
      assert.ok(Bots.BASE_STYLES.includes(b.baseStyle));
      if (b.style !== 'actor') assert.strictEqual(b.baseStyle, b.style);
      used.push(b.name);
    }
    assert.strictEqual(new Set(used).size, 9);
    assert.strictEqual(Bots.createBot({ style: 'actor', baseStyle: 'rock' }).baseStyle, 'rock');
    assert.strictEqual(Bots.foldEquity({ style: 'actor', baseStyle: 'station' }), 'none');
    for (let n = 1; n <= 8; n++) for (let k = 0; k < 30; k++) {
      const l = Bots.randomLineup(n);
      assert.strictEqual(l.length, n);
      assert.ok(l.every((s) => Bots.STYLE_IDS.includes(s)));
      assert.ok(l.filter((s) => s === 'actor').length <= 2);
      if (n >= 3) assert.ok(new Set(l).size >= 3, l.join());
    }
    for (const s of Bots.BASE_STYLES) {
      const r = Bots.READ_PROFILE[s];
      assert.ok(Math.abs(r.strong + r.medium + r.draw + r.bluff - 1) < 1e-9, s);
    }
  });
}

{
  const C = (s) => Cards.parseList(s);
  const lineupTable = (n, opts = {}) => {
    const used = [];
    const players = Bots.randomLineup(n).map((style) => { const b = Bots.createBot({ style, usedNames: used }); used.push(b.name); return b; });
    return Engine.createTable({ players, ...opts });
  };
  // One all-bot hand through the real Engine with optional hooks.
  function playHand(table, { human = null, onDecision, onAct, onStreet } = {}) {
    const hand = Engine.startHand(table);
    while (hand.phase !== 'done') {
      if (hand.phase === 'roundEnd') {
        const ev = Engine.advance(hand);
        if (ev.type === 'street' && onStreet) onStreet(hand, ev);
        continue;
      }
      const legal = Engine.legal(hand), t0 = U.now();
      const d = Bots.decide({ table, hand, seat: hand.toAct, legal, human });
      d.ms = U.now() - t0;
      if (onDecision) onDecision(hand, legal, d);
      const entry = Engine.act(hand, d.action);
      if (onAct) onAct(hand, entry);
    }
    return hand;
  }

  test('bots: decide() is always legal (fuzz through the real Engine, chips conserved)', () => {
    U.seed(101);
    const LEVELS = [[10, 20], [50, 100], [150, 300], [1000, 2000]];
    const DEPTH = [1, 3, 8, 15, 30, 60, 100, 100, 150, 250];
    let decisions = 0;
    for (let t = 0; t < 120; t++) {
      const n = U.randInt(2, 9), [sb, bb] = U.pick(LEVELS);
      const table = lineupTable(n, { sb, bb, button: U.randInt(0, n - 1) });
      const human = { seat: 0, lastAction: null, avgThinkMs: 2500 };
      for (let h = 0; h < 15; h++) {
        for (const p of table.players) if (p.stack <= 0 || U.chance(0.15)) p.stack = bb * U.pick(DEPTH) + U.randInt(0, bb);
        const total = U.sum(table.players.map((p) => p.stack));
        playHand(table, {
          human,
          onDecision(hand, L, d) {
            const a = d.action;
            decisions++;
            assert.ok(['fold', 'check', 'call', 'raise'].includes(a.type), a.type);
            if (a.type === 'fold') assert.ok(!L.canCheck, 'folded although checking was free');
            if (a.type === 'check') assert.ok(L.canCheck);
            if (a.type === 'call') assert.ok(L.canCall);
            if (a.type === 'raise') {
              assert.ok(L.canRaise && Number.isInteger(a.to) && a.to >= L.minTo && a.to <= L.maxTo, JSON.stringify({ a, L }));
              assert.ok(a.to === L.maxTo || a.to % (a.to > 1000 ? 25 : 5) === 0, 'round bets (5, or 25 over 1000): ' + a.to);
            }
            assert.ok(d.thinkMs >= 400 && d.thinkMs <= 3500, d.thinkMs);
            if (hand.street === 'preflop' && a.type === 'fold') assert.ok(d.thinkMs <= 800, 'preflop folds are quick: ' + d.thinkMs);
            assert.strictEqual(U.sum(table.players.map((p) => p.stack)) + Engine.pot(hand), total);
            human.lastAction = U.chance(0.5) ? { street: hand.street, type: U.pick(['bet', 'raise', 'call']), thinkMs: U.randInt(300, 9000) } : null;
          },
        });
        assert.strictEqual(U.sum(table.players.map((p) => p.stack)), total, 'chips conserved');
      }
    }
    U.seed(null);
    assert.ok(decisions > 10000, 'decisions: ' + decisions);
  });

  test('bots: styles separate in 9-max all-bot games (VPIP/PFR, limped pots, aggression, folds, sizing, big bets)', () => {
    U.seed(202);
    const S = {};
    let table;
    for (let h = 0; h < 3000; h++) {
      if (h % 40 === 0) table = lineupTable(9, { button: U.randInt(0, 8) });
      for (const p of table.players) p.stack = 2000;
      const hand = playHand(table);
      const preLog = hand.log.filter((e) => e.street === 'preflop' && e.type !== 'sb' && e.type !== 'bb');
      for (const s of hand.seats) {
        const r = (S[table.players[s].baseStyle] ||= { n: 0, vpip: 0, pfr: 0, br: 0, calls: 0, facing: 0, folds: 0,
          limped: 0, limpIn: 0, iso: 0, ct: 0, ctBet: 0, bets: [], shoves: 0, big: { strong: 0, medium: 0, draw: 0, bluff: 0, n: 0 }, lateRaises: [] });
        const mine = hand.log.filter((e) => e.seat === s);
        const pre = mine.filter((e) => e.street === 'preflop');
        r.n++;
        r.vpip += pre.some((e) => e.type === 'call' || e.type === 'raise');
        r.pfr += pre.some((e) => e.type === 'raise');
        // first decision behind limpers (not the big blind's free option)
        const i = preLog.findIndex((e) => e.seat === s), before = preLog.slice(0, i);
        if (i >= 0 && s !== hand.bbSeat && before.some((e) => e.type === 'call') && !before.some((e) => e.type === 'raise')) {
          r.limped++; r.limpIn += preLog[i].type !== 'fold'; r.iso += preLog[i].type === 'raise';
        }
        for (const e of mine) {
          if (e.street === 'preflop') continue;
          if (e.type === 'bet' || e.type === 'raise') {
            r.br++;
            const board = hand.board.slice(0, { flop: 3, turn: 4, river: 5 }[e.street]), c = Bots.classifyHolding(hand.hole[s], board);
            if (e.type === 'bet') { r.bets.push(e.add / e.potBefore); r.shoves += e.allIn; }
            if (e.add / e.potBefore >= 0.66) { r.big[c]++; r.big.n++; } // the read question's "big bet"
            if (e.type === 'raise' && e.street !== 'flop' && e.add / e.potBefore >= 0.66) r.lateRaises.push(c);
          }
          if (e.type === 'call') r.calls++;
          if (e.facing > 0) { r.facing++; if (e.type === 'fold') r.folds++; }
          if (e.facing === 0 && (e.type === 'check' || e.type === 'bet')) { r.ct++; r.ctBet += e.type === 'bet'; }
        }
      }
    }
    U.seed(null);
    // nobody "almost always checks": every style bets often enough when checked to, in style order
    const betX = (st) => S[st].ctBet / S[st].ct, MIN_BETX = { station: 0.12, rock: 0.22, reg: 0.4, maniac: 0.6 };
    for (const [st, min] of Object.entries(MIN_BETX)) assert.ok(betX(st) >= min, `${st} bets ${(100 * betX(st)).toFixed(1)}% when checked to (min ${100 * min}%)`);
    assert.ok(betX('station') < betX('rock') && betX('rock') < betX('reg') && betX('reg') < betX('maniac'), 'bet when checked to: ' + Bots.BASE_STYLES.map((st) => st + ' ' + betX(st).toFixed(2)));
    // tight styles stay tight behind limpers: the reg isolates TAG-like (tight early, wider late), well below the maniac
    const enters = (st) => S[st].limpIn / S[st].limped;
    assert.ok(S.reg.iso / S.reg.limped <= 0.35 && enters('reg') < 0.65 * enters('maniac'), `reg raises ${S.reg.iso}/${S.reg.limped} limped pots`);
    assert.ok(S.rock.limpIn / S.rock.limped <= 0.25, `rock enters ${S.rock.limpIn}/${S.rock.limped} limped pots`);
    // sizing: rock/station small, reg ½–¾ pot, maniac big and often all-in
    const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    assert.ok(med(S.rock.bets) <= 0.5 && med(S.station.bets) <= 0.5, 'small bets: ' + med(S.rock.bets) + ' ' + med(S.station.bets));
    assert.ok(med(S.reg.bets) >= 0.5 && med(S.reg.bets) <= 0.75, 'reg bet size ' + med(S.reg.bets));
    assert.ok(med(S.maniac.bets) >= 0.9 && S.maniac.shoves / S.maniac.bets.length >= 0.15, 'maniac sizing');
    // big turn/river raises from rock/station are (near) nuts; READ_PROFILE matches the measured big bets
    for (const st of ['rock', 'station']) assert.ok(S[st].lateRaises.every((c) => c === 'strong'), st + ' late raises: ' + S[st].lateRaises);
    for (const st of ['reg', 'maniac']) {
      for (const c of ['strong', 'medium', 'draw', 'bluff']) {
        const got = S[st].big[c] / S[st].big.n;
        assert.ok(Math.abs(got - Bots.READ_PROFILE[st][c]) <= 0.1, `${st} big bets ${c}: measured ${got.toFixed(2)}, READ_PROFILE ${Bots.READ_PROFILE[st][c]}`);
      }
    }
    const TARGET = { rock: [12, 15, 8, 8], station: [45, 55, 5, 5], reg: [18, 22, 15, 18], maniac: [40, 50, 30, 30] };
    for (const [st, [v1, v2, p1, p2]] of Object.entries(TARGET)) {
      const r = S[st], vpip = (100 * r.vpip) / r.n, pfr = (100 * r.pfr) / r.n;
      assert.ok(vpip >= v1 - 3 && vpip <= v2 + 3, `${st} VPIP ${vpip.toFixed(1)}%`);
      assert.ok(pfr >= p1 - 3 && pfr <= p2 + 3, `${st} PFR ${pfr.toFixed(1)}%`);
    }
    const af = (st) => S[st].br / S[st].calls, f2b = (st) => S[st].folds / S[st].facing;
    const show = (fn) => Bots.BASE_STYLES.map((st) => st + ' ' + fn(st).toFixed(2)).join(', ');
    assert.ok(af('maniac') > af('reg') && af('reg') > af('rock') && af('reg') > af('station'), 'AF: ' + show(af));
    assert.ok(f2b('station') < Math.min(f2b('rock'), f2b('reg'), f2b('maniac')), 'fold to bet: ' + show(f2b));
    assert.ok(f2b('rock') > f2b('reg') && f2b('reg') > f2b('maniac'), 'fold to bet: ' + show(f2b));
  });

  test('bots: short stacks keep their style (a short calling station is still the loosest)', () => {
    U.seed(505);
    const S = {};
    let table;
    for (let h = 0; h < 1500; h++) {
      if (h % 30 === 0) table = lineupTable(9, { button: U.randInt(0, 8) });
      for (const p of table.players) p.stack = 8 * 20; // a late-tournament 8 BB
      const hand = playHand(table);
      for (const s of hand.seats) {
        const r = (S[table.players[s].baseStyle] ||= { n: 0, vpip: 0 });
        r.n++;
        r.vpip += hand.log.some((e) => e.seat === s && e.street === 'preflop' && (e.type === 'call' || e.type === 'raise'));
      }
    }
    U.seed(null);
    const v = (st) => S[st].vpip / S[st].n, all = Bots.BASE_STYLES.map((st) => `${st} ${(100 * v(st)).toFixed(0)}%`).join(', ');
    assert.ok(v('station') >= 0.35 && Bots.BASE_STYLES.every((st) => st === 'station' || v(st) < v('station')), 'VPIP at 8 BB: ' + all);
    assert.ok(v('rock') < v('reg') && v('reg') < v('maniac'), 'VPIP at 8 BB: ' + all);
  });

  test('bots: reactions — shape, honest styles honest, actors reversed, some noise', () => {
    U.seed(303);
    const ANIMS = ['glance', 'freeze', 'tremble', 'quiet', 'lookaway', 'chatter', 'shrug', 'sigh', 'smile', 'toss'];
    const shape = (r, seat) => {
      assert.strictEqual(r.seat, seat);
      assert.ok(['strength', 'weakness'].includes(r.shown) && ['strong', 'weak', 'neutral'].includes(r.truth), JSON.stringify(r));
      assert.ok(typeof r.acting === 'boolean' && typeof r.random === 'boolean');
      assert.ok(ANIMS.includes(r.anim), r.anim);
      for (const k of ['text', 'bubble', 'meaning']) assert.ok(typeof r[k] === 'string' && /[а-яё]/i.test(r[k]), k + ': ' + r[k]);
    };
    const by = {};
    let table, bets = 0;
    for (let h = 0; h < 1500; h++) {
      if (h % 30 === 0) table = lineupTable(6);
      for (const p of table.players) p.stack = 2000;
      playHand(table, {
        onStreet(hand, ev) {
          for (const s of hand.seats) {
            if (hand.folded[s]) continue;
            const r = Bots.streetReaction({ table, hand, seat: s, newCards: ev.cards });
            const c = (by[table.players[s].style] ||= { asked: 0, shown: 0, random: 0, honest: 0, reversed: 0, strength: 0, strengthTrue: 0 });
            c.asked++;
            if (!r) continue;
            shape(r, s);
            c.shown++;
            if (r.random) assert.ok(!r.acting, 'a random reaction is not a performance');
            if (r.shown === 'strength') { c.strength++; c.strengthTrue += r.truth === 'strong'; }
            if (r.random) c.random++;
            else if (r.truth !== 'neutral') (r.shown === 'strength') === (r.truth === 'strong') ? c.honest++ : c.reversed++;
          }
        },
        onAct(hand, entry) {
          const r = Bots.betReaction({ table, hand, seat: entry.seat, entry });
          if (r) { shape(r, entry.seat); bets++; }
        },
      });
    }
    U.seed(null);
    assert.ok(by.actor.reversed > 3 * by.actor.honest, JSON.stringify(by.actor));
    for (const st of ['rock', 'station']) assert.ok(by[st].honest > 20 && by[st].reversed === 0, st + JSON.stringify(by[st]));
    // real strong changes are rare, so noise must not swamp the "strength" tell a beginner folds to (ТЗ 9: honest styles)
    for (const st of ['rock', 'station']) assert.ok(by[st].strengthTrue >= 0.78 * by[st].strength, st + ' strength tells: ' + JSON.stringify(by[st]));
    const rate = (st) => by[st].shown / by[st].asked;
    assert.ok(rate('station') > rate('rock') && rate('rock') > rate('reg'), 'show rates');
    const calm = ['rock', 'station', 'reg', 'actor'];
    const noise = U.sum(calm.map((st) => by[st].random)) / U.sum(calm.map((st) => by[st].shown));
    assert.ok(noise >= 0.1 && noise <= 0.2, 'noise share ' + noise); // ТЗ 9.2: 10–20% of reactions are random
    assert.ok(bets > 20, 'bet reactions: ' + bets);
    // the flop that makes a set is "strong"; a missed river draw is "weak"
    const t = { players: [{ style: 'station' }], button: 0 };
    const hand = { street: 'flop', hole: [C('7h 7d')], folded: [false], board: C('7s Kc 2h') };
    U.seed(5);
    const seen = new Set();
    for (let i = 0; i < 60; i++) { const r = Bots.streetReaction({ table: t, hand, seat: 0, newCards: hand.board }); if (r) seen.add(r.truth); }
    assert.deepStrictEqual([...seen], ['strong']);
    const river = { street: 'river', hole: [C('Ah 4h')], folded: [false], board: C('Kh 9h 2c 5s 7d') };
    seen.clear();
    for (let i = 0; i < 60; i++) { const r = Bots.streetReaction({ table: t, hand: river, seat: 0, newCards: C('7d') }); if (r) seen.add(r.truth); }
    assert.deepStrictEqual([...seen], ['weak']);
    U.seed(null);
  });

  test('bots: decisions stay fast (< 15 ms) and timing tells follow the style', () => {
    U.seed(404);
    let max = 0;
    const think = {};
    for (let t = 0; t < 40; t++) {
      const table = lineupTable(9);
      for (let h = 0; h < 5; h++) {
        for (const p of table.players) p.stack = 2000;
        playHand(table, {
          onDecision(hand, L, d) {
            max = Math.max(max, d.ms);
            const p = table.players[hand.toAct];
            const k = p.style + (d.action.type === 'fold' ? ':fold' : '');
            (think[k] ||= []).push(d.thinkMs);
          },
        });
      }
    }
    U.seed(null);
    assert.ok(max < 15, 'slowest decision ' + max.toFixed(1) + ' ms');
    const avg = (k) => U.sum(think[k]) / think[k].length;
    assert.ok(avg('rock:fold') < avg('reg:fold') && avg('station:fold') < avg('reg:fold'), 'honest styles fold fast');
  });
}

test('bots: random tells use the style\'s own wording, so noise cannot be filtered out', () => {
  const C = (s) => Cards.parseList(s);
  const spots = [ // a flopped set (truth: strong) and a missed draw on the river (truth: weak)
    { street: 'flop', hole: [C('7h 7d')], folded: [false], board: C('7s Kc 2h'), fresh: C('7s Kc 2h') },
    { street: 'river', hole: [C('Ah 4h')], folded: [false], board: C('Kh 9h 2c 5s 7d'), fresh: C('7d') },
  ];
  U.seed(31);
  for (const style of ['rock', 'station', 'reg', 'actor']) { // every maniac reaction is random anyway
    const table = { players: [{ style, baseStyle: style === 'actor' ? 'rock' : style }] }, real = new Set(), random = new Set();
    for (const hand of spots) for (let i = 0; i < 1500; i++) {
      const r = Bots.streetReaction({ table, hand, seat: 0, newCards: hand.fresh });
      if (r) (r.random ? random : real).add(r.text);
    }
    const odd = [...random].filter((t) => !real.has(t));
    assert.ok(random.size > 0 && odd.length === 0, `${style}: noise worded differently: ${odd.join(' / ')}`);
  }
  U.seed(null);
});

test('bots: bet tells are not 100% reliable either (10–20% noise)', () => {
  const C = (s) => Cards.parseList(s), entry = { type: 'bet' };
  const air = { street: 'turn', hole: [C('4h 3d')], board: C('Ks 7c 2h 9d') }; // truth: weak
  const set = { street: 'turn', hole: [C('7h 7d')], board: C('Ks 7c 2h 9d') }; // a monster
  U.seed(41);
  for (const style of ['rock', 'station', 'actor']) {
    const table = { players: [{ style, baseStyle: 'rock' }] }, rs = [];
    for (const hand of [air, set]) for (let i = 0; i < 3000; i++) { const r = Bots.betReaction({ table, hand, seat: 0, entry }); if (r) rs.push(r); }
    const noise = rs.filter((r) => r.random).length / rs.length;
    assert.ok(noise >= 0.08 && noise <= 0.22, `${style}: ${(100 * noise).toFixed(0)}% of bet tells are noise`);
    assert.ok(rs.every((r) => !r.random || !r.acting), 'a random tell is not a performance');
  }
  U.seed(null);
});

test('bots: a deep big blind calls a cheap short all-in far wider than an expensive one', () => {
  // 3-handed: the human on the button shoves `bb` big blinds, the SB folds, the bot in the BB (100 BB) decides.
  const callRate = (style, bb) => {
    let calls = 0;
    for (let i = 0; i < 300; i++) {
      const table = Engine.createTable({ players: [{ name: 'Ты', isHuman: true, stack: bb * 20 },
        { name: 'SB', style: 'rock', baseStyle: 'rock' }, { name: 'BB', style, baseStyle: style }], button: 0 });
      const hand = Engine.startHand(table);
      Engine.act(hand, { type: 'raise', to: bb * 20 });
      Engine.act(hand, { type: 'fold' });
      calls += Bots.decide({ table, hand, seat: 2, legal: Engine.legal(hand) }).action.type !== 'fold';
    }
    return calls / 300;
  };
  U.seed(55);
  const MIN = { rock: 0.4, reg: 0.75, maniac: 0.9, station: 0.9 }; // a 2 BB shove lays 3.5 : 1
  for (const st of Bots.BASE_STYLES) {
    const cheap = callRate(st, 2), dear = callRate(st, 12);
    assert.ok(cheap >= MIN[st] && cheap > dear + 0.2, `${st}: calls ${cheap} vs a 2 BB shove, ${dear} vs 12 BB`);
  }
  U.seed(null);
});

test('bots: a tiny bet does not buy the pot — folding depends on the price', () => {
  // Heads-up: the bot on the button raised to 10 BB, the human called and leads the flop into 400.
  const foldRate = (style, bet) => {
    let folds = 0;
    for (let i = 0; i < 300; i++) {
      const table = Engine.createTable({ players: [{ name: 'Ты', isHuman: true }, { name: 'B', style, baseStyle: style }], button: 1 });
      const hand = Engine.startHand(table);
      Engine.act(hand, { type: 'raise', to: 200 });
      Engine.act(hand, { type: 'call' });
      Engine.advance(hand);
      Engine.act(hand, { type: 'raise', to: bet });
      folds += Bots.decide({ table, hand, seat: 1, legal: Engine.legal(hand) }).action.type === 'fold';
    }
    return folds / 300;
  };
  U.seed(66);
  for (const st of Bots.BASE_STYLES) {
    const tiny = foldRate(st, 20), big = foldRate(st, 300); // 5% and 75% of the pot
    assert.ok(tiny <= 0.1 && tiny < big, `${st}: folds ${tiny} to a 5% pot bet, ${big} to 75%`);
  }
  U.seed(null);
});

test('bots: a reg folds medium hands more often when the human bet after a long think', () => {
  // Heads-up: seat 0 = human (button/SB), seat 1 = reg (BB) with middle pair on K♠ 9♥ 4♣.
  const C = (s) => Cards.parseList(s);
  const known = C('9c 8d 2s 3h Ks 9h 4c'); // dealt with pop(): reg hole, human hole, flop
  const deck = Cards.deck().filter((c) => !known.includes(c)).concat(known.slice().reverse());
  const table = Engine.createTable({ players: [{ name: 'Ты', isHuman: true }, { name: 'Рег', style: 'reg', baseStyle: 'reg' }], button: 0 });
  const hand = Engine.startHand(table, { deck });
  Engine.act(hand, { type: 'call' });
  Engine.act(hand, { type: 'check' });
  Engine.advance(hand);
  Engine.act(hand, { type: 'check' });
  Engine.act(hand, { type: 'raise', to: 30 }); // ¾ pot
  assert.strictEqual(hand.toAct, 1);
  const foldRate = (thinkMs) => {
    const human = { seat: 0, lastAction: { street: 'flop', type: 'bet', thinkMs }, avgThinkMs: 2000 };
    let f = 0;
    for (let i = 0; i < 400; i++) f += Bots.decide({ table, hand, seat: 1, legal: Engine.legal(hand), human }).action.type === 'fold';
    return f / 400;
  };
  U.seed(77);
  const fast = foldRate(1500), slow = foldRate(6000);
  U.seed(null);
  assert.ok(slow > fast + 0.2, `fold rate fast ${fast}, slow ${slow}`);
});

test('bots: the rock opens a subset of the ТЗ 6.1 table from every position', () => {
  U.seed(88);
  let opens = 0;
  for (let h = 0; h < 1500; h++) {
    const table = Engine.createTable({ players: Array.from({ length: 9 }, (_, i) => ({ name: 'R' + i, style: 'rock', baseStyle: 'rock' })), button: h % 9 });
    const hand = Engine.startHand(table);
    while (hand.phase === 'betting' && hand.street === 'preflop') {
      const seat = hand.toAct, firstIn = !hand.log.some((e) => e.street === 'preflop' && ['call', 'raise', 'bet'].includes(e.type));
      const a = Bots.decide({ table, hand, seat, legal: Engine.legal(hand) }).action;
      if (firstIn && a.type === 'raise' && hand.pos[seat] !== 'BB') {
        opens++;
        const code = Cards.handCode(hand.hole[seat][0], hand.hole[seat][1]);
        assert.ok(Ranges.open(hand.pos[seat]).has(code), `rock opens ${code} from ${hand.pos[seat]}`);
      }
      Engine.act(hand, a);
    }
  }
  U.seed(null);
  assert.ok(opens > 100, 'opens: ' + opens);
});

test('bots: an all-in call for less is priced against the chips the bot can win, not the shover\'s stack', () => {
  // seat 0 (SB) shoves into seat 1 (BB, 2000 chips); seat 2 (button) folded. Only the shover's stack changes.
  const C = (s) => Cards.parseList(s);
  const callRate = (style, hole, shover, flop) => {
    let calls = 0;
    for (let i = 0; i < 100; i++) {
      const table = Engine.createTable({ players: [{ name: 'A', style: 'maniac', baseStyle: 'maniac', stack: shover },
        { name: 'B', style, baseStyle: style, stack: 2000 }, { name: 'C', style: 'reg', baseStyle: 'reg', stack: 2000 }], button: 2 });
      const need = C(hole), rest = U.shuffle(Cards.deck().filter((c) => !need.includes(c))); // pop(): seat 0, then seat 1
      const hand = Engine.startHand(table, { deck: [...rest.slice(4), need[1], need[0], rest[0], rest[1]] });
      assert.strictEqual(Cards.strList(hand.hole[1]), Cards.strList(need));
      Engine.act(hand, { type: 'fold' });
      if (flop) { Engine.act(hand, { type: 'call' }); Engine.act(hand, { type: 'check' }); Engine.advance(hand); }
      Engine.act(hand, { type: 'raise', to: Infinity });
      calls += Bots.decide({ table, hand, seat: 1, legal: Engine.legal(hand) }).action.type !== 'fold';
    }
    return calls / 100;
  };
  U.seed(99);
  for (const [style, hole, flop] of [['rock', 'Kc Qd', false], ['rock', 'Ac 8d', false], ['reg', 'Ac Td', false], ['rock', 'Ac 8d', true], ['reg', 'Kc 9d', true]]) {
    const even = callRate(style, hole, 2000, flop), covered = callRate(style, hole, 15000, flop);
    assert.ok(Math.abs(covered - even) <= 0.15, `${style} ${hole}${flop ? ' flop' : ''}: calls ${even} vs 2000, ${covered} vs a covering 15000`);
  }
  U.seed(null);
});

test('bots: a station lets big late bets through with air; a rock defends top pair against small bets', () => {
  // Heads-up: the bot on the button raised to 10 BB, the human called; flop/turn/river checked through, then the human bets.
  const C = (s) => Cards.parseList(s);
  const rate = (style, hole, board, toBet, street, want) => {
    let n = 0;
    for (let i = 0; i < 300; i++) {
      const table = Engine.createTable({ players: [{ name: 'Ты', isHuman: true }, { name: 'B', style, baseStyle: style }], button: 1 });
      const known = [...C('2c 3d'), ...C(hole), ...C(board)]; // dealt with pop(): human hole, bot hole, board
      const deck = Cards.deck().filter((c) => !known.includes(c)).concat(known.slice().reverse());
      const hand = Engine.startHand(table, { deck });
      Engine.act(hand, { type: 'raise', to: 200 });
      Engine.act(hand, { type: 'call' });
      for (;;) {
        Engine.advance(hand);
        if (hand.street === street) break;
        Engine.act(hand, { type: 'check' }); Engine.act(hand, { type: 'check' });
      }
      assert.strictEqual(Cards.strList(hand.hole[1]), Cards.strList(C(hole)));
      Engine.act(hand, { type: 'raise', to: toBet });
      n += Bots.decide({ table, hand, seat: 1, legal: Engine.legal(hand) }).action.type === want;
    }
    return n / 300;
  };
  U.seed(111);
  const air = rate('station', 'Th 8c', 'Kd 4c 4d 3s 9c', 400, 'river', 'call'); // pot-size river bet with ten high
  assert.strictEqual(air, 0, 'station calls a pot-size river bet with air: ' + air);
  const tp = rate('rock', 'Ac 4c', '3h Td As', 120, 'flop', 'call'); // top pair vs 30% pot
  const op = rate('rock', 'Jd Jc', 'Th 7d 7c', 200, 'flop', 'call'); // overpair vs half pot
  assert.ok(tp >= 0.6 && op >= 0.6, `rock calls top pair ${tp}, overpair ${op}`);
  U.seed(null);
});
