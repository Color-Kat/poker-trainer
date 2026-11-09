// ===== Engine: No-Limit Hold'em hand state machine (pure, synchronous, no DOM) =====
// Chips move between table.players[seat].stack and the hand immediately. Dealing uses deck.pop():
// two hole cards per seat in hand.seats order, then flop (3), turn, river; no burn cards.
const Engine = (() => {
  const POSITIONS = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  const STREETS = ['preflop', 'flop', 'turn', 'river'];
  const positionNames = (n) => (n === 2 ? ['BTN', 'BB'] : POSITIONS.slice(POSITIONS.length - n));
  const eligible = (p) => !p.busted && p.stack > 0;

  function createTable({ players, sb = 10, bb = 20, button = 0 }) {
    return {
      players: players.map((p, seat) => {
        const name = p.name || 'Игрок ' + (seat + 1);
        return {
          isHuman: false, style: null, baseStyle: null, stack: bb * 100, busted: false, revealed: false,
          avatar: { initials: name.slice(0, 1).toUpperCase(), color: '#64748b' }, hud: { hands: 0, vpip: 0, pfr: 0 },
          ...p, name, seat,
        };
      }),
      button, sb, bb, handNo: 0,
    };
  }

  // Next seat clockwise after `seat` (wrapping; `seat` itself last) where pred(player, seat) holds, else null.
  // Accepts a table or a hand (both carry .players).
  function nextSeat(table, seat, pred = () => true) {
    const P = table.players, n = P.length;
    for (let k = 1; k <= n; k++) {
      const s = (((seat + k) % n) + n) % n;
      if (pred(P[s], s)) return s;
    }
    return null;
  }

  const pot = (hand) => U.sum(hand.committed) - U.sum(hand.returned || []);
  const inHand = (hand, seat) => !!hand.dealt[seat] && !hand.folded[seat];
  const live = (hand) => hand.seats.filter((s) => !hand.folded[s]);
  const canAct = (hand, s) => inHand(hand, s) && !hand.allIn[s];
  // Owes an action: hasn't acted since the last full raise, or hasn't matched the current bet.
  const pending = (hand, s) => canAct(hand, s) && (!hand.acted[s] || hand.bets[s] < hand.currentBet);

  function roundDone(hand) {
    const L = live(hand), actors = L.filter((s) => !hand.allIn[s]);
    if (L.length < 2 || !actors.length) return true;
    // A lone actor who already covers every live bet has nobody left to bet against. Compared with the real bets,
    // not the nominal currentBet: a SB of 10 facing a BB all-in for 5 has nothing to decide.
    if (actors.length === 1 && hand.bets[actors[0]] >= Math.max(...L.map((s) => hand.bets[s]))) return true;
    return !actors.some((s) => pending(hand, s));
  }

  function nextTurn(hand, from) {
    hand.toAct = roundDone(hand) ? null : nextSeat(hand, from, (p, s) => pending(hand, s));
    hand.phase = hand.toAct === null ? 'roundEnd' : 'betting';
  }

  function move(hand, s, add) {
    const p = hand.players[s];
    p.stack -= add; hand.bets[s] += add; hand.committed[s] += add;
    hand.allIn[s] = p.stack === 0;
  }

  function record(hand, s, type, add, facing, potBefore, incomplete = false) {
    const e = { i: hand.log.length, street: hand.street, seat: s, type, add, to: hand.bets[s], allIn: hand.allIn[s],
      incomplete, facing, potBefore, potAfter: pot(hand) };
    hand.log.push(e);
    return e;
  }

  function post(hand, s, type, amount) {
    const before = pot(hand), add = Math.min(amount, hand.players[s].stack);
    move(hand, s, add);
    record(hand, s, type, add, 0, before);
  }

  function startHand(table, opts = {}) {
    const P = table.players, N = P.length;
    const nEligible = P.filter(eligible).length;
    if (nEligible < 2) throw new Error('Engine.startHand: need at least 2 players with chips');
    if (table.handNo > 0 || !P[table.button] || !eligible(P[table.button])) table.button = nextSeat(table, table.button, eligible);
    // Heads-up the button posts the SB, so last hand's BB takes the button: nobody posts the BB twice in a row (TDA).
    // In steady heads-up play this is the normal rotation; it only matters when play becomes heads-up.
    if (nEligible === 2 && P[table.lastBB] && eligible(P[table.lastBB])) table.button = table.lastBB;
    table.handNo++;
    const btn = table.button, seats = [];
    for (let k = 1; k <= N; k++) if (eligible(P[(btn + k) % N])) seats.push((btn + k) % N);
    const hu = seats.length === 2, arr = (v) => new Array(N).fill(v);
    const deck = opts.deck ? opts.deck.slice() : U.shuffle(Cards.deck());
    const hand = {
      no: table.handNo, sb: table.sb, bb: table.bb, button: btn,
      sbSeat: hu ? btn : seats[0], bbSeat: hu ? seats[0] : seats[1],
      dealt: arr(false), seats, order: hu ? [btn, seats[0]] : [...seats.slice(2), ...seats.slice(0, 2)],
      pos: arr(null), hole: arr(null), board: [], deck,
      street: 'preflop', phase: 'betting', toAct: null,
      bets: arr(0), committed: arr(0), returned: arr(0), startStacks: P.map((p) => p.stack),
      folded: arr(false), allIn: arr(false), acted: arr(false),
      currentBet: 0, minRaise: table.bb, lastRaiser: null, raises: 0, potAtStreetStart: 0,
      log: [], result: null, players: P,
    };
    const names = positionNames(seats.length);
    hand.order.forEach((s, i) => { hand.dealt[s] = true; hand.pos[s] = names[i]; });
    for (const s of seats) hand.hole[s] = [deck.pop(), deck.pop()];
    post(hand, hand.sbSeat, 'sb', table.sb);
    post(hand, hand.bbSeat, 'bb', table.bb);
    table.lastBB = hand.bbSeat;
    hand.currentBet = table.bb; // nominal even when the big blind is short: callers owe the full BB
    nextTurn(hand, hand.bbSeat);
    return hand;
  }

  function legal(hand) {
    if (hand.phase !== 'betting' || hand.toAct === null) return null;
    const s = hand.toAct, stack = hand.players[s].stack, myBet = hand.bets[s], maxTo = myBet + stack;
    const owe = Math.max(0, hand.currentBet - myBet);
    const others = hand.seats.some((x) => x !== s && canAct(hand, x));
    // Short all-in raises don't reopen betting for someone who already acted, unless together they add up to a full raise (TDA).
    const canRaise = stack > owe && others && (!hand.acted[s] || owe >= hand.minRaise);
    return {
      seat: s, toCall: Math.min(owe, stack), canFold: true, canCheck: owe === 0, canCall: owe > 0, canRaise,
      minTo: Math.min(hand.currentBet + hand.minRaise, maxTo), maxTo, isBet: hand.currentBet === 0,
      pot: pot(hand), stack, currentBet: hand.currentBet, myBet,
    };
  }

  function act(hand, action = {}) {
    if (hand.phase !== 'betting') throw new Error(`Engine.act: hand phase is '${hand.phase}', nobody can act`);
    const L = legal(hand), s = L.seat, owe = hand.currentBet - L.myBet, before = pot(hand);
    let type = action.type === 'bet' ? 'raise' : action.type, add = 0, incomplete = false;
    if (type === 'raise' && !L.canRaise) type = 'call'; // all-in for no more than the call, or betting not reopened
    if (type === 'call' && !L.canCall) type = 'check';
    if (type === 'fold') hand.folded[s] = true;
    else if (type === 'check') {
      if (!L.canCheck) throw new Error(`Engine.act: seat ${s} cannot check facing a bet of ${owe}`);
    } else if (type === 'call') add = L.toCall;
    else if (type === 'raise') {
      const want = Math.round(+action.to);
      const to = want >= L.maxTo ? L.maxTo : want >= L.minTo ? want : L.minTo; // NaN → min raise
      add = to - L.myBet;
      incomplete = to - hand.currentBet < hand.minRaise;
      if (!incomplete) { hand.minRaise = to - hand.currentBet; hand.acted.fill(false); }
      type = hand.currentBet === 0 ? 'bet' : 'raise';
      hand.currentBet = to; hand.lastRaiser = s; hand.raises++;
    } else throw new Error('Engine.act: unknown action type ' + type);
    if (add) move(hand, s, add);
    hand.acted[s] = true;
    const e = record(hand, s, type, add, owe, before, incomplete);
    nextTurn(hand, s);
    return e;
  }

  // The largest contribution (folded players included) is only called up to the second largest; the rest goes back.
  function returnUncalled(hand) {
    const c = hand.seats.map((s) => [hand.committed[s] - hand.returned[s], s]).sort((a, b) => b[0] - a[0]);
    const amount = c[0][0] - c[1][0], s = c[0][1];
    if (amount <= 0) return null;
    hand.returned[s] += amount; hand.bets[s] -= amount; hand.players[s].stack += amount; hand.allIn[s] = false;
    return { seat: s, amount };
  }

  // Pots split at each all-in level of a live player; folded chips fill the pots they reached.
  function sidePots(hand, L) {
    const paid = (s) => hand.committed[s] - hand.returned[s];
    const levels = [...new Set([...L.filter((s) => hand.allIn[s]).map(paid), Math.max(...L.map(paid))])].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    levels.forEach((lvl, i) => {
      const cap = i === levels.length - 1 ? Infinity : lvl; // the top pot also takes any dead chips above it
      const amount = U.sum(hand.seats.map((s) => Math.max(0, Math.min(paid(s), cap) - prev)));
      const eligible = L.filter((s) => paid(s) >= lvl);
      const last = pots[pots.length - 1];
      if (last && last.eligible.join() === eligible.join()) last.amount += amount;
      else if (amount > 0) pots.push({ amount, eligible });
      prev = lvl;
    });
    return pots;
  }

  function finish(hand, pots, uncontested) {
    const arr = (v) => new Array(hand.players.length).fill(v);
    const payouts = arr(0), scores = arr(null), names = arr(null), best = arr(null);
    const shown = uncontested ? [] : live(hand);
    for (const s of shown) {
      const ev = HandEval.evaluate(hand.hole[s].concat(hand.board));
      scores[s] = ev.score; names[s] = ev.name; best[s] = ev.best;
    }
    pots.forEach((p, i) => {
      p.name = i === 0 ? 'Основной банк' : 'Побочный банк ' + i;
      const top = Math.max(...p.eligible.map((s) => scores[s]));
      // eligible follows hand.seats (clockwise from the button's left), so odd chips go to the first winners
      p.winners = uncontested ? p.eligible : p.eligible.filter((s) => scores[s] === top);
      const share = Math.floor(p.amount / p.winners.length), odd = p.amount - share * p.winners.length;
      p.winners.forEach((w, k) => { payouts[w] += share + (k < odd ? 1 : 0); });
    });
    hand.players.forEach((p, s) => { p.stack += payouts[s]; });
    hand.bets.fill(0);
    hand.phase = 'done'; hand.toAct = null;
    return (hand.result = {
      uncontested, pots, payouts, returned: hand.returned.slice(),
      net: hand.players.map((p, s) => p.stack - hand.startStacks[s]),
      winners: [...new Set(pots.flatMap((p) => p.winners))], shown, names, best, scores,
    });
  }

  function advance(hand) {
    if (hand.phase !== 'roundEnd') throw new Error(`Engine.advance: hand phase is '${hand.phase}', expected 'roundEnd'`);
    const returned = returnUncalled(hand), L = live(hand);
    if (L.length === 1) return { type: 'uncontested', result: finish(hand, [{ amount: pot(hand), eligible: L }], true), returned };
    if (hand.street === 'river') return { type: 'showdown', result: finish(hand, sidePots(hand, L), false), returned };
    const cards = [];
    for (let k = hand.street === 'preflop' ? 3 : 1; k > 0; k--) cards.push(hand.deck.pop());
    hand.board.push(...cards);
    hand.street = STREETS[STREETS.indexOf(hand.street) + 1];
    hand.bets.fill(0); hand.acted.fill(false);
    Object.assign(hand, { currentBet: 0, minRaise: hand.bb, lastRaiser: null, raises: 0, potAtStreetStart: pot(hand) });
    nextTurn(hand, hand.button); // stays 'roundEnd' when fewer than 2 players can bet (all-in run-out)
    return { type: 'street', street: hand.street, cards, returned };
  }

  function sizeTo(hand, frac) {
    const L = legal(hand);
    return L && U.clamp(Math.round(L.myBet + L.toCall + frac * (L.pot + L.toCall)), L.minTo, L.maxTo);
  }

  return { POSITIONS, positionNames, createTable, startHand, legal, act, advance, pot, sizeTo, inHand, nextSeat };
})();
