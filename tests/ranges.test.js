// Ranges: preflop tables, situations, verdicts and texts — hands built with the real Engine.
(() => {
  const NAMES = ['Ты', 'Игорь', 'Марина', 'Олег', 'Анна', 'Сергей', 'Ольга', 'Павел', 'Вера'];
  // Hero = seat 0 at position `pos` on an n-handed table. Engine deals with deck.pop() from the END:
  // two hole cards per seat in hand.seats order, so the hero's cards are placed where seat 0 is dealt.
  function deal(n, pos, hole, { stacks = {}, styles = {} } = {}) {
    const k = Engine.positionNames(n).indexOf(pos);
    const button = n === 2 ? (pos === 'BTN' ? 0 : 1) : (((n - 3 - k) % n) + n) % n;
    const table = Engine.createTable({ button, players: NAMES.slice(0, n).map((name, i) => ({ name, isHuman: !i, style: i ? styles[i] || 'reg' : null, baseStyle: i ? styles[i] || 'reg' : null, stack: stacks[i] || 2000 })) });
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
    for (const key of ['UTG', 'BTN', 'BB', 'vsRaise', 'vs3bet', 'limped:BTN']) {
      const g = Ranges.grid(key);
      assert.strictEqual(g.length, 13);
      g.forEach((row, i) => { assert.strictEqual(row.length, 13); row.forEach((c, j) => assert.strictEqual(c.code, Cards.gridCode(i, j))); });
    }
    const count = (key) => Ranges.grid(key).flat().reduce((a, c) => ((a[c.cls] = (a[c.cls] || 0) + 1), a), {});
    assert.deepStrictEqual(count('UTG'), { in: 14, border: 4, out: 151 });
    assert.strictEqual(Ranges.grid('vsRaise')[2][2].cls, 'raise');  // QQ
    assert.strictEqual(Ranges.grid('vsRaise')[3][3].cls, 'call');   // JJ
    assert.strictEqual(Ranges.grid('BB')[0][12].cls, 'in');         // A2s: BB raises with the CO range
    // a late, cheap open is defended much wider than an early one
    const n = (key) => Ranges.grid(key).flat().filter((c) => c.cls === 'call' || c.cls === 'raise').length;
    assert.ok(n('vsRaise:BB:from=BTN:x=2.5') > 2 * n('vsRaise:BB:from=UTG:x=4'), `${n('vsRaise:BB:from=BTN:x=2.5')} vs ${n('vsRaise:BB:from=UTG:x=4')}`);
    assert.ok(n('vsRaise:BTN:from=CO:style=maniac') > n('vsRaise:BTN:from=CO:style=rock'));
  });

  test('ranges: the vs-raise grid follows the hero position, stack and raiser, like the verdict', () => {
    const cell = (key, code, ctx) => Ranges.grid(key, ctx).flat().find((c) => c.code === code).cls;
    assert.strictEqual(cell('vsRaise:BTN:from=UTG', '87s'), 'call');            // in position, deep: speculative call
    assert.strictEqual(cell('vsRaise:UTG+1:from=UTG', '87s'), 'border');        // many players behind
    assert.strictEqual(cell('vsRaise:BTN:from=UTG', '33'), 'call');             // set mining 100 BB / 3 BB
    assert.strictEqual(cell('vsRaise:BTN:from=UTG', '33', { deep: false }), 'out');
    assert.strictEqual(cell('vsRaise:BB:from=BTN:x=2.5', 'K9o'), 'call');
    assert.strictEqual(cell('vsRaise:SB:from=BTN:x=2.5', 'K9o'), 'out');
    assert.ok(Ranges.VS_RAISE_TEXT.includes('по шансам банка'));
    // every real spot: the grid of its key shows the verdict for the hero's hand
    U.seed(5);
    let n = 0;
    for (let k = 0; k < 150; k++) {
      const d = U.shuffle(Cards.deck()), hole = Cards.strList(d.slice(0, 2));
      const script = [['raise:60'], ['raise:50', 'call'], ['fold', 'fold', 'fold', 'fold', 'fold', 'fold', 'raise:50']][k % 3];
      let s;
      try { s = at(9, U.pick(['BTN', 'CO', 'SB', 'BB', 'HJ']), hole, script, { styles: { 1: 'maniac', 3: 'rock', 7: 'station' } }); } catch (e) { continue; }
      const fb = ev(s, 'fold');
      if (fb.situation.kind !== 'vsRaise') continue;
      n++;
      const want = { raise: 'raise', call: 'call' }[fb.best] || (Object.values(fb.verdicts).includes('ok') ? 'border' : 'out');
      assert.strictEqual(cell(fb.grid.key, fb.code), want, `${fb.grid.key} ${fb.code}`);
    }
    assert.ok(n > 50, 'spots ' + n);
    U.seed(null);
  });

  // ---------- round 4: a realistic model — price, position, raiser, players, stacks ----------
  const btnOpen = (to = 50) => ['fold', 'fold', 'fold', 'fold', 'fold', 'fold', `raise:${to}`]; // 9-max: everybody folds to the BTN
  test('round 4: BB defends by price — vs a 2.5 BB BTN open K9o, 76s, 55 call; vs a 4 BB UTG rock K9o folds', () => {
    for (const h of ['Kd 9c', '7h 6h', '5h 5d']) {
      const s = at(9, 'BB', h, [...btnOpen(), 'fold']);
      const fb = ev(s, 'call');
      assert.deepStrictEqual([fb.best, fb.verdict], ['call', 'correct'], `${h}: ${fb.lines.join(' / ')}`);
      assert.strictEqual(verdict(s, 'fold'), h === '7h 6h' ? 'acceptable' : 'mistake', h);
    }
    assert.ok(ev(at(9, 'BB', 'Kd 9c', [...btnOpen(), 'fold']), 'call').lines[0].includes('27% итогового банка'));
    assert.strictEqual(verdict(at(9, 'BB', 'Jd 4c', [...btnOpen(), 'fold']), 'fold'), 'correct');
    const rock = at(9, 'BB', 'Kd 9c', ['raise:80'], { styles: { 1: 'rock' } });   // seat 1 = UTG
    assert.strictEqual(rock.hand.pos[1], 'UTG');
    assert.deepStrictEqual([ev(rock, 'fold').best, verdict(rock, 'call')], ['fold', 'mistake']);
    assert.ok(all(ev(rock, 'fold')).some((l) => l.includes('судя по игре, повышает только с сильными руками')), all(ev(rock, 'fold')).join(' | '));
    // heads-up: the BTN opens wide, the BB defends KQo
    assert.strictEqual(verdict(at(2, 'BB', 'Kd Qc', ['raise:50']), 'call'), 'correct');
  });

  test('round 4: SB vs a BTN open — 3-bet or fold; vs a maniac AJo 3-bets or calls', () => {
    for (const [h, best] of [['Ah Jc', 'raise'], ['9h 9d', 'raise'], ['Kd Jc', 'fold'], ['7h 6h', 'fold'], ['Qh Tc', 'fold']]) {
      const fb = ev(at(9, 'SB', h, btnOpen()), 'fold');
      assert.strictEqual(fb.best, best, h);
      assert.notStrictEqual(fb.verdicts.call, 'best', h);
    }
    assert.ok(ev(at(9, 'SB', 'Kd Jc', btnOpen()), 'fold').lines[0].startsWith('С малого блайнда ты без позиции: 3-бет или сброс.'));
    const m = ev(at(9, 'BB', 'Ah Jc', [...btnOpen(), 'fold'], { styles: { 7: 'maniac' } }), 'fold');
    assert.strictEqual(m.situation.rStyle, 'maniac');
    assert.ok(['raise', 'call'].includes(m.best) && m.verdicts.raise !== 'mistake' && m.verdicts.call !== 'mistake', JSON.stringify(m.verdicts));
    assert.strictEqual(m.verdicts.fold, 'mistake');
    // vs a reg's BTN open AJo in the BB is no fold either
    assert.notStrictEqual(ev(at(9, 'BB', 'Ah Jc', [...btnOpen(), 'fold']), 'fold').verdict, 'correct');
  });

  test('round 4: number of players — 66 set-mines after a raise and a call, AJo folds; squeeze with premiums', () => {
    const six = ev(at(9, 'BTN', '6h 6d', ['raise:60', 'fold', 'call']), 'call');
    assert.deepStrictEqual([six.verdict, six.situation.callers], ['correct', 1]);
    assert.ok(all(six).some((l) => l.startsWith('Перед тобой уже 1 колл')));
    const aj = at(9, 'CO', 'Ah Jc', ['raise:60', 'fold', 'call']);
    assert.deepStrictEqual([ev(aj, 'fold').verdict, verdict(aj, 'call')], ['correct', 'mistake']);
    assert.ok(ev(aj, 'fold').lines[0].includes('доминированы'));
    const kk = ev(at(9, 'BTN', 'Kh Kd', ['raise:60', 'fold', 'call']), 'raise');
    assert.strictEqual(kk.verdict, 'correct');
    assert.ok(kk.lines[0].includes('сквиз'));
  });

  test('round 4: short stack 20 BB — 88 vs a CO open is a shove, calls are mistakes', () => {
    const s = at(9, 'BTN', '8h 8d', ['fold', 'fold', 'fold', 'fold', 'fold', 'raise:50'], { stacks: { 0: 400 } });
    const fb = ev(s, 'raise');
    assert.deepStrictEqual([fb.best, fb.verdict, verdict(s, 'call')], ['raise', 'correct', 'mistake']);
    assert.ok(fb.lines[0].startsWith('Стек 20 BB — коротко: олл-ин или сброс.'));
    const a = Ranges.advise(s.hand, 0, s.table);
    assert.deepStrictEqual([a.best, a.size, a.title], ['raise', 400, '👨‍🏫 Лучше: 3-бет до 400 (олл-ин)']);
    assert.strictEqual(Ranges.evaluate(s.hand, 0, { type: 'allin' }, s.table).verdict, 'correct');
    assert.strictEqual(verdict(at(9, 'BTN', '7h 6h', ['fold', 'fold', 'fold', 'fold', 'fold', 'raise:50'], { stacks: { 0: 400 } }), 'call'), 'mistake');
  });

  test('round 4: raise sizes are graded — open 2.5 BB ✅, 8 BB acceptable with a note, 3-bet 3× IP / 4× OOP', () => {
    const s = at(9, 'BTN', 'Ah Kd');
    const r = (to, x = s) => Ranges.evaluate(x.hand, 0, { type: 'raise', to }, x.table);
    assert.deepStrictEqual([r(50).verdict, r(50).lines[1]], ['correct', 'Размер ✅: до 50 (2,5 BB).']);
    const big = r(160);
    assert.deepStrictEqual([big.verdict, big.title], ['acceptable', '⚠️ Префлоп: рейз — верно, но размер неудачный.']);
    assert.strictEqual(big.lines[1], 'Размер: рейз до 160 — много, хватит 60 (3 BB).');
    assert.strictEqual(r(100).verdict, 'correct');                                  // 5 BB: too big, but not 2× off
    assert.ok(r(100).lines[1].startsWith('Размер: рейз до 100 — много'));
    const limp = at(9, 'BTN', 'Ah Kd', ['call']);                                   // +1 BB per limper
    assert.strictEqual(r(80, limp).lines[1], 'Размер ✅: до 80 (4 BB).');
    const ip = at(9, 'BTN', 'Ah Ad', ['raise:60']);
    assert.deepStrictEqual([r(180, ip).verdict, r(180, ip).lines[1]], ['correct', 'Размер ✅: до 180 (3× рейза).']);
    assert.strictEqual(r(120, ip).verdict, 'correct');                              // a min 3-bet is small, not 2× off
    const oop = at(9, 'BB', 'Ah Ad', ['raise:60']);
    assert.strictEqual(Ranges.advise(oop.hand, 0, oop.table).size, 240);
    assert.ok(r(180, oop).lines[1].startsWith('Размер: рейз до 180 — мало, лучше 240 (4× рейза)'), r(180, oop).lines[1]);
    // a fold-worthy hand stays a mistake whatever the size; the call has no size line
    assert.strictEqual(r(60, at(9, 'UTG', '7h 2d')).verdict, 'mistake');
    assert.strictEqual(ev(ip, 'call').lines.some((l) => l.startsWith('Размер')), false);
  });

  // ---------- round 4 audit: an independent coach review of 18 000 real-Engine spots ----------
  test('audit: texts — a hand name inside a sentence is not capitalised; a female raiser is «неё»', () => {
    const midCap = (fb) => all(fb).filter((l) => /[^.!?] Пар[аы] /.test(l));
    const spots = [
      ev(at(9, 'BTN', 'Kh Kd', ['raise:60', 'fold', 'call']), 'raise'),                                   // squeeze
      ev(at(9, 'BTN', '9h 9d', [...Array(6).fill('fold'), 'raise:50', 'raise:210'], { styles: { 1: 'rock' } }), 'fold'),     // vs a 3-bet
      ev(at(9, 'BTN', 'Ah Ad', [...Array(6).fill('fold'), 'raise:50', 'raise:150'], { stacks: { 0: 400 } }), 'raise'),       // short vs a 3-bet
      ev(at(9, 'BTN', 'Qh Qd', [...Array(6).fill('fold'), 'raise:50', 'raise:2000']), 'call'),            // vs a 3-bet all-in
      ev(at(9, 'BTN', 'Qh Qd', [...Array(6).fill('fold'), 'raise:50', 'raise:210'], { styles: { 1: 'station' } }), 'call'), // vs a 3-bet of AA/KK only
    ];
    for (const fb of spots) assert.deepStrictEqual(midCap(fb), [], all(fb).join(' | '));
    const m = ev(at(3, 'BB', '9h 9d', ['fold', 'raise:50'], { styles: { 2: 'maniac' } }), 'call');       // Марина (SB) raises
    assert.strictEqual(m.situation.rName, 'Марина');
    assert.ok(all(m).some((l) => l.includes('играй против неё шире')), all(m).join(' | '));
    assert.ok(!all(m).some((l) => l.includes('против него')));
  });

  test('audit: short stacks — a 3× 3-bet at 20 BB is not «✅» (shove or fold); a 15 BB open-shove is ✅', () => {
    const s = at(9, 'BTN', '8h 8d', ['fold', 'fold', 'fold', 'fold', 'fold', 'raise:50'], { stacks: { 0: 400 } });
    const r3 = Ranges.evaluate(s.hand, 0, { type: 'raise', to: 150 }, s.table);
    assert.notStrictEqual(r3.verdict, 'correct', r3.lines.join(' / '));
    assert.ok(r3.lines[1].includes('олл-ин'), r3.lines[1]);
    const o = at(9, 'BTN', 'Ah Kd', [], { stacks: { 0: 300 } });                                        // 15 BB, folded to the BTN
    const shove = Ranges.evaluate(o.hand, 0, { type: 'allin' }, o.table);
    assert.deepStrictEqual([shove.verdict, shove.lines[1]], ['correct', 'Размер ✅: до 300 (олл-ин).']);
    assert.strictEqual(Ranges.evaluate(o.hand, 0, { type: 'raise', to: 50 }, o.table).verdict, 'correct');
    const deep = at(9, 'BTN', 'Ah Kd');                                                                // 100 BB: the shove is still silly
    assert.strictEqual(Ranges.evaluate(deep.hand, 0, { type: 'allin' }, deep.table).verdict, 'acceptable');
  });

  test('audit: BB defence — suited connectors vs a 2.2 BB BTN open at 30 BB call; vs the SB the BB is in position', () => {
    for (const h of ['6h 5h', '7h 6h', '8h 7h']) {
      const fb = ev(at(9, 'BB', h, [...btnOpen(44), 'fold'], { stacks: { 0: 600, 7: 600 } }), 'call');
      assert.deepStrictEqual([fb.best, fb.verdict], ['call', 'correct'], `${h}: ${fb.lines.join(' / ')}`);
    }
    const sb = ev(at(9, 'BB', 'Kh 5h', [...Array(7).fill('fold'), 'raise:50']), 'call');
    assert.strictEqual(sb.situation.rPos, 'SB');
    assert.deepStrictEqual([sb.best, sb.verdict], ['call', 'correct'], sb.lines.join(' / '));
    // a tight (rock) BTN at 25 BB: folding small suited connectors stays right
    assert.strictEqual(ev(at(9, 'BB', '6h 5h', [...btnOpen(50), 'fold'], { stacks: { 0: 500, 7: 500 }, styles: { 7: 'rock' } }), 'fold').verdict, 'correct');
  });

  test('audit: A-K vs a 3-bet — calls a rock, folds to a 3-bet that only AA/KK make (and says why)', () => {
    const vs = (style, h = 'Ah Kc') => ev(at(9, 'BTN', h, [...Array(6).fill('fold'), 'raise:50', 'raise:210'], { styles: { 1: style } }), 'call');
    const rock = vs('rock');
    assert.strictEqual(rock.situation.kind, 'vs3bet');
    assert.deepStrictEqual([rock.best, rock.verdict], ['call', 'correct'], rock.lines.join(' / '));
    const st = vs('station');
    assert.deepStrictEqual([st.best, st.verdict], ['fold', 'acceptable'], st.lines.join(' / '));
    assert.ok(/только/.test(st.lines[0]) && !/станци/i.test(all(st).join(' ')), st.lines.join(' / '));
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

  test('ranges: limped pots — isolate with strong hands, over-limp speculative hands late or multiway', () => {
    const btn = at(9, 'BTN', '7h 6h', ['call']); // UTG limps
    const sit = Ranges.situation(btn.hand, 0);
    assert.strictEqual(sit.kind, 'limped');
    assert.strictEqual(sit.limpers, 1);
    assert.strictEqual(verdict(btn, 'call'), 'correct');
    assert.strictEqual(verdict(btn, 'raise'), 'acceptable');
    const five = ev(at(9, 'BTN', '5h 5d', ['call']), 'call');
    assert.strictEqual(five.verdict, 'correct');
    assert.ok(five.lines[0].includes('оверлимп'));
    assert.strictEqual(verdict(at(9, 'CO', '2h 2c', ['call', 'call']), 'call'), 'correct');
    assert.strictEqual(verdict(at(9, 'BTN', 'Ah Qd', ['call']), 'raise'), 'correct');
    assert.strictEqual(verdict(at(9, 'BTN', 'Ah Qd', ['call']), 'call'), 'mistake');
    const junk = ev(at(9, 'BTN', 'Kh 2c', ['call']), 'call');
    assert.strictEqual(junk.verdict, 'mistake');
    assert.ok(all(junk).includes('Доплачивать с такой рукой — лишние потери: она слабая и без потенциала.'));
    const mp = at(9, 'MP', '9h 8h', ['call']);
    assert.strictEqual(verdict(mp, 'fold'), 'correct');
    assert.strictEqual(verdict(mp, 'call'), 'mistake');  // speculative, but many players behind
    assert.strictEqual(verdict(at(9, 'HJ', 'Ac Kd', ['call']), 'call'), 'mistake');
    assert.ok(all(ev(at(9, 'CO', 'Ac Kd', ['call', 'call']), 'raise')).some((l) => l.startsWith('Перед тобой 2 лимпера')));
    // BB after limps: check or raise for value
    assert.strictEqual(verdict(at(9, 'BB', 'Ah Kd', ['call', 'call']), 'raise'), 'correct');
    assert.strictEqual(verdict(at(9, 'BB', 'Kh 9h', ['call', 'call']), 'raise'), 'mistake'); // several limpers: K9s just checks
  });

  test('ranges: vs a raise — 3-bet, set mining by stack, speculative hands in position, borders', () => {
    const vs = (pos, hole, opts) => at(9, pos, hole, ['raise:60'], opts); // UTG raises to 60
    const qq = vs('BTN', 'Qh Qd');
    const sit = Ranges.situation(qq.hand, 0);
    assert.strictEqual(sit.kind, 'vsRaise');
    assert.strictEqual(sit.raiser, qq.hand.order[0]);
    assert.strictEqual(sit.raiseTo, 60);
    assert.strictEqual(sit.playersAfter, 2);
    assert.deepStrictEqual([sit.rPos, sit.ip, sit.callers, sit.x, sit.d], ['UTG', true, 0, 3, 100]);
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
    assert.strictEqual(verdict(vs('BTN', 'Jh Jd'), 'call'), 'correct');
    assert.strictEqual(verdict(vs('BTN', '9h 9d'), 'raise'), 'mistake');
    assert.strictEqual(verdict(vs('MP', 'Ah Qh'), 'call'), 'correct');
    assert.strictEqual(verdict(vs('BTN', 'Kh Qh'), 'call'), 'correct');                  // suited broadway in position
    assert.strictEqual(verdict(vs('BTN', '8h 7h'), 'call'), 'correct');
    assert.strictEqual(verdict(vs('MP', '8h 7h'), 'call'), 'acceptable');                // in position, but 6 players behind
    assert.strictEqual(verdict(vs('MP', '8h 7h'), 'fold'), 'correct');
    assert.strictEqual(verdict(vs('HJ', 'Kh Jd'), 'call'), 'mistake');
    const junk = ev(vs('BB', '7h 2d'), 'call');
    assert.strictEqual(junk.verdict, 'mistake');
    assert.ok(junk.more[0].endsWith('После тебя никого нет — ты ходишь последним.'));
  });

  test('ranges: vs a 3-bet — 4-bet the top, call the next layer', () => {
    const three = (hole, style) => {
      const { table, hand } = deal(9, 'UTG', hole, { styles: style ? { 5: style } : {} });
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
    assert.strictEqual(verdict(jj, 'call'), 'correct');
    assert.strictEqual(verdict(jj, 'raise'), 'mistake');
    assert.strictEqual(verdict(three('8h 8d'), 'fold'), 'correct');
    assert.strictEqual(verdict(three('Kh Jd'), 'call'), 'mistake');
    // a rock 3-bets only monsters: QQ calls instead of 4-betting
    const rq = three('Qh Qd', 'rock');
    assert.strictEqual(rq.hand.pos[5], 'CO');
    assert.strictEqual(ev(rq, 'fold').best, 'call');
    assert.strictEqual(Ranges.advise(ak.hand, 0, ak.table).size, 410);              // 4-bet ~2.3×
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
    assert.strictEqual(fb.verdict, 'correct');
    assert.ok(all(fb).some((l) => l.startsWith('Ты в поздней позиции или на SB: пары, одномастные тузы и связки')), all(fb).join(' | '));
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
      assert.strictEqual(Ranges.evaluate(s.hand, 0, { type: a.best, to: a.size }, s.table).verdict, 'correct', `${pos} ${hole}: teacher says ${a.best} ${a.size}`);
      if (a.best === 'raise') assert.ok(a.size > s.hand.bb && a.title.endsWith(U.fmt(a.size)), a.title);
    }
    assert.ok(n > 60, 'spots ' + n);
    U.seed(null);
  });

  test('round 3: grid keys follow the situation; limped and stack-aware vs-raise grids', () => {
    assert.strictEqual(ev(at(9, 'BTN', '5h 5d', ['raise:60']), 'call').grid.key, 'vsRaise:BTN:from=UTG:style=reg:n=9:c=0:r=1:x=3:d=100:p=40');
    assert.ok(ev(at(9, 'BTN', '5h 5d', ['raise:60'], { stacks: { 0: 1000 } }), 'call').grid.key.endsWith(':d=50:p=40'));
    assert.strictEqual(ev(at(9, 'BTN', '7h 6h', ['call']), 'call').grid.key, 'limped:BTN:lim=1');
    assert.strictEqual(ev(at(2, 'BB', '7c 2d', ['call']), 'check').grid.key, 'BB');
    const cell = (key, code) => Ranges.grid(key).flat().find((c) => c.code === code).cls;
    assert.deepStrictEqual(['33', '87s', 'AA', '72o'].map((c) => cell('vsRaise:BTN:deep', c)), ['call', 'call', 'raise', 'out']);
    assert.strictEqual(cell('vsRaise:BTN:short', '33'), 'out');
    assert.deepStrictEqual(['AKo', '76s', 'K2o'].map((c) => cell('limped:BTN', c)), ['raise', 'call', 'out']);
    assert.strictEqual(cell('limped:CO', '54s'), 'call');
    const my = Ranges.mySituation(at(9, 'BTN', '5h 5d', ['raise:60']).hand, 0);
    assert.deepStrictEqual(my, { key: 'vsRaise:BTN:from=UTG:style=reg:n=9:c=0:r=1:x=3:d=100:p=40', caption: 'BTN: против рейза с UTG, 3 BB, стек 100 BB', hl: '55' });
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
