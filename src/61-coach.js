// ===== Coach: postflop teaching (SPEC §7, §9.3, §9.4) — outs, rule of 2 and 4, pot odds, action, reads, tells, timing =====
const Coach = (() => {
  const { CAT } = HandEval;
  const R = Cards.rank, S = Cards.suit;
  const STREET_RU = { flop: 'флоп', turn: 'тёрн', river: 'ривер' };
  const LEVELS = ['none', 'low', 'medium', 'high'];
  // Cross-module access that survives a missing or broken module (a const in TDZ throws even for typeof).
  const eng = () => { try { return Engine; } catch (e) { return null; } };
  const bots = () => { try { return Bots; } catch (e) { return null; } };

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const joinRu = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' и ' + a[a.length - 1] : a.join(''));
  const outsW = (n) => n + ' ' + U.plural(n, 'аут', 'аута', 'аутов');
  const NP = (r) => Cards.rankRu(r, Cards.NOM_PL), GP = (r) => Cards.rankRu(r, Cards.GEN_PL);
  const cardsTight = (h) => h.map(Cards.str).join('');                 // 'K♠Q♦'
  const pctR = (x) => Math.round(x) + '%';
  // Genitive of a Russian first name (Bots.NAMES): Игорь → Игоря, Ольга → Ольги, Марина → Марины, Олег → Олега
  function gen(name) {
    const [w, ...rest] = String(name).split(' ');
    const g = w === 'Павел' ? 'Павла' : /[ьй]$/.test(w) ? w.slice(0, -1) + 'я' : /[гкхжшщч]а$/.test(w) ? w.slice(0, -1) + 'и'
      : /а$/.test(w) ? w.slice(0, -1) + 'ы' : /я$/.test(w) ? w.slice(0, -1) + 'и' : w + 'а';
    return [g, ...rest].join(' ');
  }

  // ---------- bot style info (with fallbacks when Bots is unavailable) ----------
  const FALLBACK = {
    rock: { name: 'Камень', foldEquity: 'high' }, station: { name: 'Коллинг-станция', foldEquity: 'none' },
    reg: { name: 'Регуляр', foldEquity: 'medium' }, maniac: { name: 'Маньяк', foldEquity: 'low' }, actor: { name: 'Актёр' },
  };
  const PROFILE = { // composition of big bets, used only without Bots.READ_PROFILE
    rock: { strong: 0.85, medium: 0.1, draw: 0.05, bluff: 0 }, station: { strong: 0.9, medium: 0.1, draw: 0, bluff: 0 },
    reg: { strong: 0.5, medium: 0.15, draw: 0.15, bluff: 0.2 }, maniac: { strong: 0.25, medium: 0.25, draw: 0.2, bluff: 0.3 },
  };
  const WEAK_MIX = { strong: 0.15, medium: 0.45, draw: 0.2, bluff: 0.2 };   // what small bets look like
  const LOOSE = { rock: 0.15, reg: 0.22, maniac: 0.5, station: 0.55 };      // preflop: holeTopPct ≤ x
  const baseOf = (p) => { const B = bots(); return (B && B.base ? B.base(p) : FALLBACK[p.baseStyle] ? p.baseStyle : p.style) || 'reg'; };
  const styleName = (p) => { const B = bots(); const st = (B && B.STYLES && B.STYLES[p.style]) || FALLBACK[p.style]; return st ? st.name : String(p.style); };
  const foldEqOf = (p) => { const B = bots(); return (B && B.foldEquity ? B.foldEquity(p) : (FALLBACK[baseOf(p)] || {}).foldEquity) || 'medium'; };
  const classify = (h, board) => { const B = bots(); return B && B.classifyHolding ? B.classifyHolding(h, board) : classifyLocal(h, board); };
  const lower = (f) => LEVELS[Math.max(0, LEVELS.indexOf(f) - 1)];

  // ---------- made hand ----------
  function madeInfo(hole, board) {
    const sc = HandEval.score([...hole, ...board]), cat = HandEval.cat(sc);
    const br = board.map(R), hr = hole.map(R), top = Math.max(...br);
    const on = (r) => br.filter((x) => x === r).length;
    let strength = 'none', label = 'ничего';
    if (hr[0] === hr[1]) {
      [strength, label] = on(hr[0]) ? ['strong', on(hr[0]) === 1 ? 'сет' : 'каре'] : hr[0] > top ? ['medium', 'оверпара'] : ['weak', 'слабая пара'];
    } else {
      const paired = hr.filter((r) => on(r));
      if (paired.some((r) => on(r) >= 2)) [strength, label] = ['strong', 'трипс'];
      else if (paired.length === 2) [strength, label] = ['strong', 'две пары'];
      else if (paired.length === 1) [strength, label] = paired[0] === top ? ['medium', 'топ-пара'] : ['weak', 'слабая пара'];
    }
    // straights, flushes, full houses made with a hole card
    if (cat >= CAT.STRAIGHT && (board.length < 5 || sc > HandEval.score(board))) [strength, label] = ['strong', HandEval.CAT_RU[cat].toLowerCase()];
    else if (board.length === 5 && sc === HandEval.score(board)) [strength, label] = ['none', 'играет борд'];
    return { cat, name: HandEval.describe(sc), strength, label };
  }

  // ---------- outs (structural, hero-specific, next card only) ----------
  const DIRTY_RU = {
    pair: ['спаривает борд, у соперника может быть фулл-хаус', 'спаривают борд, у соперника может быть фулл-хаус'],
    flush: ['даёт стрит, но на борде будет минимум 3 карты одной масти: у соперника может быть флеш', 'дают стрит, но на борде будет минимум 3 карты одной масти: у соперника может быть флеш'],
    nonnut: ['даёт не натсовый флеш: у соперника может быть флеш старше', 'дают не натсовый флеш: у соперника может быть флеш старше'],
  };
  const NO_OUTS = { total: 0, clean: 0, dirty: 0, over: 0, list: [], cleanList: [], dirtyList: [], overList: [], draws: [] };
  const fourIn = (m, x) => [0, 1, 2, 3].every((i) => m & (1 << (x + i)));
  // OESD: the two completing ranks sit on both ends of four ranks in a row (2-3-4-5 is open: ace or six).
  const openEnded = (m, [a, b]) => (b - a === 5 && fourIn(m, a + 1)) || (b === 14 && a === 6 && fourIn(m, 2));

  function computeOuts(hole, board) {
    const all = [...hole, ...board], known = new Set(all);
    const unseen = Cards.deck().filter((c) => !known.has(c));
    const cur = HandEval.score(all), curCat = HandEval.cat(cur);
    const br = board.map(R), hr = hole.map(R);
    const on = (r) => br.filter((x) => x === r).length;
    const ofRank = (...rs) => unseen.filter((c) => rs.includes(R(c)));
    const draws = [];
    const add = (type, cards, text) => {
      // an out must improve the hand, and beyond what the board alone would give (no board flushes/straights)
      cards = cards.filter((c) => { const s = HandEval.score([...all, c]); return s > cur && s > HandEval.score([...board, c]); });
      if (cards.length) draws.push({ type, n: cards.length, cards, text: text(cards.length, cards) });
    };
    if (curCat < CAT.FLUSH) {
      for (let s = 0; s < 4; s++) {
        const hs = hole.filter((c) => S(c) === s), bs = board.filter((c) => S(c) === s);
        if (hs.length && hs.length + bs.length === 4) {
          add('flush', unseen.filter((c) => S(c) === s), (n) => `У тебя 4 ${Cards.suitRu(s, 4)} (${Cards.strList(hs)} + ${Cards.strList(bs)} на борде). ` +
            `${cap(Cards.suitRu(s, 13))} в колоде 13, видно 4 → осталось ${outsW(n)}.`);
        }
      }
      const mask = (cs) => cs.reduce((m, c) => m | (1 << R(c)), 0);
      const am = mask(all), bm = mask(board), top = HandEval.straightTop(am), ranks = [];
      for (let r = 2; r <= 14 && !top; r++) { // a made straight has no straight draw
        const t = HandEval.straightTop(am | (1 << r));
        if (t > top && t > HandEval.straightTop(bm | (1 << r))) ranks.push(r);
      }
      if (ranks.length) {
        const type = ranks.length === 1 ? 'gutshot' : ranks.length > 2 ? 'straight' : openEnded(am, ranks) ? 'oesd' : 'double';
        const names = joinRu(ranks.map(NP)), k = ranks.length, full = ofRank(...ranks);
        const head = { gutshot: 'Гатшот', oesd: 'Открытое стрит-дро', double: 'Двойной гатшот', straight: 'Стрит-дро' }[type];
        add(type, full, (n, kept) => {
          // the only straight card that fails is a 5th card of the board's suit: the board itself then holds a flush
          const lost = full.filter((c) => !kept.includes(c));
          const why = lost.length ? `${joinRu(lost.map(Cards.str))} не в счёт: с ${lost.length > 1 ? 'ними' : 'ней'} на борде флеш — ` : '';
          return k === 1 ? `${head}: стрит дают только ${names} (${why}${outsW(n)}).`
            : `${head}: стрит дают ${names} (${k} × 4 = ${lost.length ? `${4 * k}, но ${why}` : ''}${outsW(n)}).`;
        });
      }
    }
    const caseText = (r) => `каре — ${Cards.strList(ofRank(r))}`;
    if (hr[0] === hr[1]) {
      const p = hr[0], others = [...new Set(br.filter((r) => r !== p))];
      if (!on(p)) add('set', ofRank(p), (n) => `Карманная пара: сет дают оставшиеся ${NP(p)} (${outsW(n)}).`);
      else if (on(p) === 1) add('boat', ofRank(p, ...others), (n) => `Сет ${GP(p)}: фулл-хаус дают ${joinRu(others.map(NP))} (спаривают борд), ${caseText(p)} (${outsW(n)}).`);
    } else {
      const trips = hr.find((r) => on(r) === 2), paired = hr.filter((r) => on(r) === 1);
      if (trips) {
        const kicker = hr.find((r) => r !== trips);
        const fill = [...new Set([...br.filter((r) => r !== trips), ...(on(kicker) ? [] : [kicker])])];
        add('boat', ofRank(trips, ...fill), (n) => `Тройка ${GP(trips)}: фулл-хаус дают ${joinRu(fill.map(NP))}, ${caseText(trips)} (${outsW(n)}).`);
      } else if (paired.length === 2) {
        add('boat', ofRank(...paired), (n) => `Две пары: фулл-хаус дают оставшиеся ${NP(paired[0])} и ${NP(paired[1])} (${outsW(n)}).`);
      } else if (paired.length === 1) {
        const r = paired[0], other = hr.find((x) => x !== r);
        add('trips', ofRank(r), (n) => `Пара ${GP(r)}: тройку дают оставшиеся ${NP(r)} (${outsW(n)}).`);
        if (!on(other)) add('twopair', ofRank(other), (n) => `Две пары дают оставшиеся ${NP(other)} (${outsW(n)}).`);
      }
    }
    const list = [...new Set(draws.flatMap((d) => d.cards))], inList = new Set(list);
    const dirtyCode = (x) => {
      const cat = HandEval.cat(HandEval.score([...all, x]));
      if ((cat === CAT.STRAIGHT || cat === CAT.FLUSH) && br.includes(R(x))) return 'pair';
      if (cat === CAT.STRAIGHT && [0, 1, 2, 3].some((s) => [...board, x].filter((c) => S(c) === s).length >= 3)) return 'flush';
      const mine = hole.filter((c) => S(c) === S(x));
      if (cat === CAT.FLUSH && mine.length === 1 && unseen.some((c) => c !== x && S(c) === S(x) && R(c) > R(mine[0]))) return 'nonnut';
      return null;
    };
    const dirtyList = [];
    for (const c of list) { const code = dirtyCode(c); if (code) dirtyList.push({ c, code, reason: DIRTY_RU[code][0] }); }
    const dirty = new Set(dirtyList.map((d) => d.c)), cleanList = list.filter((c) => !dirty.has(c));
    const holePair = hr[0] === hr[1] || hr.some(on), maxB = Math.max(...br);
    const overList = holePair || curCat >= CAT.STRAIGHT ? []
      : hole.filter((c) => R(c) > maxB).flatMap((c) => ofRank(R(c))).filter((c) => !inList.has(c));
    return { total: list.length, clean: cleanList.length, dirty: dirtyList.length, over: overList.length, list, cleanList, dirtyList, overList, draws };
  }

  // Without Bots: strong / medium made hands, strong draws, the rest is a bluff.
  function classifyLocal(h, board) {
    const m = madeInfo(h, board);
    if (m.strength === 'strong' || m.strength === 'medium') return m.strength;
    if (board.length < 5 && computeOuts(h, board).draws.some((d) => d.type === 'flush' || d.type === 'oesd' || d.type === 'double')) return 'draw';
    return 'bluff';
  }

  // ---------- equity vs style-weighted ranges (made spots) ----------
  function betMix(base, frac) {
    const B = bots(), p = (B && B.READ_PROFILE && B.READ_PROFILE[base]) || PROFILE[base] || PROFILE.reg;
    const k = U.clamp(frac / 0.66, 0.3, 1); // smaller bets → weaker mix
    const out = {};
    for (const c of Object.keys(WEAK_MIX)) out[c] = (p[c] || 0) * k + WEAK_MIX[c] * (1 - k);
    return out;
  }
  // Opponent holdings are drawn directly from the weighted combo list (rejection sampling with a few
  // tries cannot reach tight ranges like a rock's); each sample is run out once via Equity.calc.
  function estimateEq(hole, board, opps, iters = 1500) {
    const dead = new Set([...hole, ...board]), deck = Cards.deck().filter((c) => !dead.has(c));
    const combos = [], cls = [], top = [];
    for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) {
      const h = [deck[i], deck[j]];
      combos.push(h); cls.push(classify(h, board)); top.push(Equity.holeTopPct(h));
    }
    const samplers = opps.map(({ base, frac }) => {
      const mix = betMix(base, frac), loose = LOOSE[base] || 0.3, cnt = {};
      combos.forEach((h, k) => { if (top[k] <= loose) cnt[cls[k]] = (cnt[cls[k]] || 0) + 1; });
      let acc = 0;
      const cum = combos.map((h, k) => (acc += top[k] <= loose ? (mix[cls[k]] || 0) / cnt[cls[k]] : 0));
      return { cum, total: acc };
    });
    const pick = ({ cum, total }) => {
      if (!total) return combos[Math.floor(U.rng() * combos.length)];
      const x = U.rng() * total;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] > x) hi = m; else lo = m + 1; }
      return combos[lo];
    };
    let sum = 0, n = 0;
    for (let it = 0; it < iters; it++) {
      const used = new Set(), hands = [hole];
      for (const sm of samplers) {
        let h = pick(sm);
        for (let t = 0; t < 30 && (used.has(h[0]) || used.has(h[1])); t++) h = pick(sm);
        if (used.has(h[0]) || used.has(h[1])) break; // tight ranges collided: drop the sample, never share a card
        used.add(h[0]); used.add(h[1]); hands.push(h);
      }
      if (hands.length <= samplers.length) continue;
      sum += Equity.calc(hands, board, { iters: 1, exactLimit: 0 }).eq[0];
      n++;
    }
    return sum / Math.max(1, n);
  }

  // ---------- spot analysis ----------
  function legalFor(hand, seat, table) {
    const E = eng();
    if (E && E.legal && hand.toAct === seat && hand.phase === 'betting') {
      try { const L = E.legal(hand); if (L) return L; } catch (e) { /* fall back below */ }
    }
    const stack = table.players[seat].stack, myBet = hand.bets[seat] || 0;
    const toCall = Math.min(Math.max(0, hand.currentBet - myBet), stack);
    const others = hand.seats.some((s) => s !== seat && !hand.folded[s] && !hand.allIn[s]);
    return { toCall, stack, myBet, canRaise: stack > toCall && others };
  }
  // The latest bet/raise on the current street by someone other than `seat`.
  function lastWager(hand, seat) {
    for (let i = hand.log.length - 1; i >= 0; i--) {
      const e = hand.log[i];
      if (e.street !== hand.street) break;
      if (e.seat !== seat && (e.type === 'bet' || e.type === 'raise')) return e;
    }
    return null;
  }
  const paidOf = (hand, s) => (hand.committed[s] || 0) - ((hand.returned && hand.returned[s]) || 0);

  function analyze(hand, seat, table) {
    if (!hand || hand.street === 'preflop' || hand.phase === 'done') return null;
    const hole = hand.hole[seat], board = hand.board.slice();
    if (!hole || board.length < 3) return null;
    const lg = legalFor(hand, seat, table), toCall = lg.toCall, facing = toCall > 0;
    const street = hand.street, river = street === 'river';
    if (river && !facing) return null;
    const oppSeats = hand.seats.filter((s) => s !== seat && !hand.folded[s]);
    if (!oppSeats.length) return null;
    const made = madeInfo(hole, board), outs = river ? NO_OUTS : computeOuts(hole, board);
    const kind = made.strength === 'strong' || made.strength === 'medium' ? 'made' : !river && (outs.total || outs.over) ? 'draw' : 'nodraw';
    if (!facing && kind !== 'draw') return null;

    const nOpp = oppSeats.length, multiway = nOpp >= 2;
    const wager = facing ? lastWager(hand, seat) : null;
    const bettor = wager ? wager.seat : facing ? hand.lastRaiser : null;
    const sizeFrac = wager && wager.potBefore > 0 ? wager.add / wager.potBefore : 0;
    const myBet = hand.bets[seat] || 0, full = Math.max(0, hand.currentBet - myBet);
    const E = eng();
    let pot = E && E.pot ? E.pot(hand) : hand.seats.reduce((a, s) => a + paidOf(hand, s), 0);
    const short = facing && toCall < full; // hero can only call all-in for less: the excess is not his to win
    if (short) { const lim = paidOf(hand, seat) + toCall; pot = hand.seats.reduce((a, s) => a + Math.min(paidOf(hand, s), lim), 0); }
    const allInSpot = facing && (toCall >= lg.stack || oppSeats.every((s) => hand.allIn[s]));
    const cardsToSee = street === 'flop' && allInSpot ? 2 : 1;
    const correctOuts = multiway ? outs.clean : outs.total;
    const overOk = !multiway && outs.over > 0 && (!facing || sizeFrac < 0.5);
    const rule = (o) => (cardsToSee === 1 ? o * 2 : o * 4 - Math.max(0, o - 8));
    const needed = facing ? (toCall / (pot + toCall)) * 100 : 0;

    const P = (s) => table.players[s];
    const vSeat = bettor !== null && bettor !== undefined ? bettor
      : oppSeats.reduce((a, s) => (LEVELS.indexOf(foldEqOf(P(s))) < LEVELS.indexOf(foldEqOf(P(a))) ? s : a));
    const vp = P(vSeat), villainFE = foldEqOf(vp), base = baseOf(vp);
    const sp = {
      street, kind, facing, hole: hole.slice(), board, pot, toCall, betTo: hand.currentBet, bettor: facing ? bettor : null, sizeFrac, allInSpot,
      nOpp, multiway, outs, correctOuts, acceptedOuts: overOk ? [correctOuts, correctOuts + outs.over] : [correctOuts],
      cardsToSee, ruleEq: rule(correctOuts), needed, estEq: null, made, foldEq: multiway ? lower(villainFE) : villainFE,
      seat, myBet, short, canRaise: !!lg.canRaise, overOk, villainFE,
      potStart: hand.potAtStreetStart != null ? hand.potAtStreetStart : pot - U.sum(hand.bets),
      opps: oppSeats.map((s) => ({ seat: s, name: P(s).name })),
      villain: { seat: vSeat, name: vp.name, styleName: styleName(vp), base, revealed: !!vp.revealed },
      bigLate: !!(wager && wager.type === 'raise' && sizeFrac >= 0.66 && (street === 'turn' || street === 'river') && (base === 'rock' || base === 'station')),
    };
    if (facing && (kind === 'made' || river || made.strength === 'weak')) { // a weak pair also has showdown value
      sp.estEq = estimateEq(hole, board, oppSeats.map((s) => ({ base: baseOf(P(s)), frac: s === bettor ? sizeFrac : 0.33 })));
    }
    Object.assign(sp, kind === 'draw' || (kind === 'nodraw' && !river) ? drawVerdicts(sp) : madeVerdicts(sp));
    sp.questions = kind === 'made' || river ? ['potodds'] : facing ? ['outs', 'cards', 'equity', 'potodds'] : ['outs'];
    return sp;
  }

  const B = 'best', OK = 'ok', M = 'mistake';
  function drawVerdicts(sp) {
    const o = sp.correctOuts, fe = sp.foldEq, folds = fe === 'high' || fe === 'medium';
    let best, v;
    // no bet: a semi-bluff needs fold equity — against a calling station only a huge draw may bet
    if (!sp.facing) { best = 'check'; v = { check: B, raise: o >= 8 && folds ? B : fe === 'none' && o < 12 ? M : OK, fold: M }; }
    // 12+ outs: the raise is preferred; when the rule says the call loses, folding (not calling) is the fallback
    else if (o >= 12 && fe !== 'none' && sp.canRaise) { best = 'raise'; v = sp.ruleEq >= sp.needed ? { raise: B, call: OK, fold: M } : { raise: B, fold: OK, call: M }; }
    else if (sp.ruleEq >= sp.needed) { best = 'call'; v = { call: B, raise: o >= 8 && folds ? OK : M, fold: M }; }
    else if (o >= 8 && folds) { best = 'fold'; v = { fold: B, raise: B, call: M }; }
    else if (o >= 8 && fe === 'low') { best = 'fold'; v = { fold: B, raise: OK, call: M }; }
    else { best = 'fold'; v = { fold: B, call: M, raise: M }; }
    if (showdownCall(sp) && v.call === M) { // a weak pair that is often ahead of this bettor: calling is right too
      v = { ...v, call: B, fold: v.fold === M ? M : OK };
      if (best === 'fold') best = 'call';
    }
    if (!sp.canRaise) delete v.raise;
    return { best, verdicts: v };
  }
  const showdownCall = (sp) => sp.facing && sp.estEq != null && sp.ruleEq < sp.needed && sp.estEq * 100 >= sp.needed;
  // The estimate is a rough range model: within 3 pp of the price (less for tiny prices) call and fold are both acceptable.
  const isClose = (sp) => Math.abs(sp.estEq * 100 - sp.needed) < Math.min(3, sp.needed / 4);
  function madeVerdicts(sp) {
    const eq = sp.estEq, nutsRaise = sp.bigLate && sp.made.strength !== 'strong', close = isClose(sp);
    let res;
    if (nutsRaise || eq * 100 < sp.needed) res = { best: 'fold', verdicts: { fold: B, call: close && !nutsRaise ? OK : M, raise: M } };
    else res = { best: 'call', verdicts: { call: B, raise: eq >= 0.75 ? B : eq >= 0.65 ? OK : M, fold: close ? OK : M } };
    if (!sp.canRaise) delete res.verdicts.raise;
    return res;
  }

  // ---------- questions ----------
  const OUTS_HINT = 'Посчитай карты, которые сделают руку сильной: флеш-дро — 9 аутов, открытое стрит-дро — 8, гатшот — 4, ' +
    'карманная пара до сета — 2, пара до трипса — 2, вторая пара к своей карте — 3. Каждую карту считай один раз.';
  function questions(spot, settings) {
    if (!spot) return [];
    const on = (settings && settings.questions) || {};
    const Q = {
      outs: { id: 'outs', type: 'number', prompt: 'Сколько у тебя аутов?', unit: 'аутов',
        hint: OUTS_HINT + (spot.multiway ? ' В банке 3+ игроков — считай только чистые ауты.' : '') },
      cards: { id: 'cards', type: 'choice', prompt: 'Сколько карт увидишь за эту ставку?', options: [{ v: 1, label: 'Одну' }, { v: 2, label: 'Две' }],
        hint: 'Две карты — только если сейчас флоп и после твоего колла ставок больше не будет (олл-ин). Иначе — одну.' },
      equity: { id: 'equity', type: 'number', prompt: 'Твоё эквити по правилу 2 и 4?', unit: '%',
        hint: 'Одна карта: ауты × 2. Две карты: ауты × 4, а если аутов больше 8 — ауты × 4 − (ауты − 8).' },
      potodds: { id: 'potodds', type: 'number', prompt: 'Какой процент нужен по шансам банка?', unit: '%',
        info: { pot: spot.pot, bet: spot.betTo, toCall: spot.toCall },
        hint: 'Нужный % = твой колл ÷ (банк вместе со ставкой соперника + твой колл) × 100.' },
    };
    return (spot.questions || []).filter((id) => on[id === 'cards' ? 'outs' : id] !== false).map((id) => Q[id]);
  }

  // ---------- answer checks ----------
  const fb = (kind, verdict, title, lines) => ({ kind, verdict, title, lines, ok: verdict !== 'mistake' });
  const num = (v) => (typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')));
  const ruleOf = (sp) => (o) => (sp.cardsToSee === 1 ? o * 2 : o * 4 - Math.max(0, o - 8));
  const formula = (sp, o) => (sp.cardsToSee === 1 ? `${o} × 2 = ${o * 2}%` : o > 8 ? `${o} × 4 − (${o} − 8) = ${ruleOf(sp)(o)}%` : `${o} × 4 = ${o * 4}%`);
  const cardsNote = (sp) => (sp.cardsToSee === 2 ? '(две карты: олл-ин на флопе)' : sp.street === 'turn' ? '(одна карта: впереди только ривер)' : '(одна карта, ставка не олл-ин)');

  // accusative singular: туза, короля, валета, but даму, десятку …
  const accOf = (r) => { const n = Cards.rankRu(r); return n.endsWith('а') ? n.slice(0, -1) + 'у' : Cards.rankRu(r, Cards.GEN); };
  function overNote(sp) {
    const ranks = [...new Set(sp.outs.overList.map(R))].sort((a, b) => b - a);
    const names = cap(joinRu(ranks.map(NP))), pairOf = Cards.rankRu(ranks[0], Cards.GEN);
    if (!sp.overOk) return `${names} не считаем: ${sp.multiway ? 'соперников несколько' : 'соперник ставил крупно'}, и пары ${pairOf} может не хватить.`;
    const how = ranks.length > 1 ? `${names} можно посчитать как оверкарты, по 3 аута на каждую` : `${cap(accOf(ranks[0]))} можно посчитать как оверкарту — ещё 3 аута`;
    return `${how}: ${sp.facing ? 'ставка небольшая' : 'соперник не ставил'}, и пары ${pairOf} может хватить. Тогда ${sp.correctOuts + sp.outs.over} — тоже верно.`;
  }
  function outsLines(sp) {
    const o = sp.outs, lines = o.draws.map((d) => d.text);
    if (!o.draws.length) lines.push('Ни одна карта не сделает твою руку сильной: дро нет — 0 аутов.');
    else if (o.draws.length > 1) {
      const sum = U.sum(o.draws.map((d) => d.n)), dup = sum - o.total;
      lines.push(`Всего: ${o.draws.map((d) => d.n).join(' + ')}${dup ? ` − ${dup} (эти карты посчитаны дважды)` : ''} = ${outsW(o.total)}.`);
    }
    if (o.over) lines.push(overNote(sp));
    if (o.dirty) {
      lines.push('Грязные ауты: ' + Object.keys(DIRTY_RU).map((k) => {
        const cs = o.dirtyList.filter((d) => d.code === k).map((d) => Cards.str(d.c));
        return cs.length ? `${cs.join(', ')} — ${DIRTY_RU[k][cs.length > 1 ? 1 : 0]}` : null;
      }).filter(Boolean).join('; ') + '.');
    }
    if (sp.multiway && o.total) {
      lines.push(o.dirty ? `В банке 3+ игроков — считаем только чистые ауты: против нескольких соперников грязные слишком часто проигрывают. ${o.total} − ${o.dirty} = ${o.clean}.`
        : 'В банке 3+ игроков — считаем только чистые ауты; здесь все ауты чистые.');
    }
    return lines;
  }
  function potLines(sp) {
    const { pot, toCall, potStart, myBet } = sp, f = U.fmt;
    const bets = pot - potStart, n = Math.round(sp.needed);
    const head = sp.short ? `Банк, который ты можешь выиграть, — ${f(pot)} (лишнее сверх твоего стека тебе не достанется).`
      : bets === sp.betTo && !myBet ? `Банк ${f(potStart)} + ставка ${f(bets)} = ${f(pot)}.`
      : `Банк ${f(potStart)} + ставки на этой улице ${f(bets)} = ${f(pot)}.`;
    const mine = myBet ? ` Ты уже вложил ${f(myBet)} на этой улице — доплатить нужно ${f(toCall)}.` : '';
    return [`${head}${mine} Твой колл ${f(toCall)}. ${f(toCall)} ÷ (${f(pot)} + ${f(toCall)}) = ${n}%.`];
  }

  function check(spot, qid, value, answers = {}) {
    const sp = spot, x = num(value), rule = ruleOf(sp);
    const said = (s) => (Number.isFinite(x) ? `ты указал ${s}` : 'ты ничего не указал');
    if (qid === 'outs') {
      const hit = sp.acceptedOuts.find((a) => Math.abs(x - a) <= 1);
      const lines = outsLines(sp);
      if (hit === undefined) return fb('outs', M, `❌ Ауты: ${said(x)}, правильно ${sp.correctOuts}.`, lines);
      return fb('outs', 'correct', hit === sp.correctOuts ? `✅ Ауты: ${sp.correctOuts} — верно.` : `✅ Ауты: ${x} — засчитано (с оверкартами; без них ${sp.correctOuts}).`, lines);
    }
    if (qid === 'cards') {
      const w = (k) => (k === 2 ? 'две' : 'одна');
      const why = sp.cardsToSee === 2 ? 'Олл-ин на флопе: после колла ставок больше не будет, и ты увидишь и тёрн, и ривер.'
        : sp.street === 'turn' ? 'Сейчас тёрн — впереди только одна карта, ривер.'
        : 'Ставка не олл-ин: на тёрне соперник может поставить снова, поэтому этот колл покупает только одну карту.';
      return x === sp.cardsToSee ? fb('cards', 'correct', `✅ Карты: ${w(x)} — верно.`, [why])
        : fb('cards', M, `❌ Карты: ${said(`«${x === 2 ? 'две' : x === 1 ? 'одну' : x}»`)}, правильно — ${w(sp.cardsToSee)}.`, [why]);
    }
    if (qid === 'equity') {
      const note = cardsNote(sp), hit = sp.acceptedOuts.find((a) => Math.abs(x - rule(a)) <= 3);
      if (hit !== undefined) {
        return fb('equity', 'correct', hit === sp.correctOuts ? `✅ Эквити: ${formula(sp, hit)} ${note}.`
          : `✅ Эквити: ${formula(sp, hit)} ${note} — засчитано (с оверкартами).`, hit === sp.correctOuts ? [] : [`Без оверкарт: ${formula(sp, sp.correctOuts)}.`]);
      }
      const own = num(answers.outs);
      if (Number.isFinite(own) && Math.abs(x - rule(own)) <= 3) {
        return fb('equity', 'acceptable', `⚠️ Эквити: метод верный (${formula(sp, own)}), но ауты посчитаны неверно.`, [`Правильно: ${formula(sp, sp.correctOuts)} ${note}.`]);
      }
      return fb('equity', M, `❌ Эквити: ${said(x + '%')}, правильно ${sp.ruleEq}%.`,
        [`${formula(sp, sp.correctOuts)} ${note}.`, 'Правило 2 и 4: одна карта — ауты × 2, две карты (олл-ин на флопе) — ауты × 4, а при 9+ аутах вычти (ауты − 8).']);
    }
    if (qid === 'potodds') {
      const n = Math.round(sp.needed); // ±2 around the exact value or the rounded one the player is shown
      return Math.min(Math.abs(x - sp.needed), Math.abs(x - n)) <= 2 ? fb('potodds', 'correct', `✅ Шансы банка: ${n}% — верно.`, potLines(sp))
        : fb('potodds', M, `❌ Шансы банка: ${said(x + '%')}, правильно ${n}%.`, potLines(sp));
    }
    return null;
  }

  // ---------- action ----------
  const FE_RU = {
    high: ['сбрасывает часто', 'часто сбрасывает на агрессию'], medium: ['сбрасывает иногда', 'иногда сбрасывает на агрессию'],
    low: ['сбрасывает редко', 'редко сбрасывает на агрессию'], none: ['почти никогда не сбрасывает', 'почти никогда не сбрасывает'],
  };
  const who = (sp) => {
    const v = sp.villain, fe = FE_RU[sp.villainFE];
    if (sp.multiway && !sp.facing) return `Самый цепкий из соперников, ${v.name}${v.revealed ? ` («${v.styleName}»), ${fe[0]}` : `, ${fe[1]}`}`; // no bettor to point at
    return v.revealed ? `Соперник «${v.styleName}» (${fe[0]})` : `Этот соперник ${fe[1]}`;
  };
  const isDrawSpot = (sp) => sp.kind === 'draw' || (sp.kind === 'nodraw' && sp.street !== 'river');
  const nounOf = (sp, a) => (a === 'raise' ? (sp.kind === 'draw' ? (sp.facing ? 'рейз-полублеф' : 'ставка-полублеф') : sp.facing ? 'рейз' : 'ставка')
    : { fold: 'сброс', check: 'чек', call: 'колл' }[a]);
  const pastOf = (sp, a) => (a === 'raise' ? (sp.facing ? 'сделал рейз' : 'поставил') : { fold: 'сбросил', check: 'чекнул', call: 'заколлировал' }[a]);
  // '33%' or '33,3%' when rounding would hide which side of the comparison we are on
  const showNeed = (sp) => (Math.round(sp.needed) === sp.ruleEq && sp.ruleEq !== sp.needed ? U.pctNum(sp.needed, 1) : pctR(sp.needed));

  const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const rangeOf = (sp) => (sp.multiway ? 'соперники так играют' : 'этот соперник так ставит');
  function actionLines(sp, t) {
    const L = [], o = sp.correctOuts, E = sp.ruleEq, N = sp.needed, v = sp.verdicts;
    if (isDrawSpot(sp)) {
      if (!sp.facing) {
        L.push('Чек бесплатный: следующую карту ты увидишь, ничего не доплачивая.');
        if (v.raise === B) L.push(`${who(sp)}, а у тебя ${outsW(o)} — ставка-полублеф тоже хороша: можешь забрать банк сразу, а если заплатят, у тебя остаётся дро.`);
        else if (v.raise === OK) {
          L.push(o < 8 ? `У тебя всего ${outsW(o)} — ставка-полублеф допустима, но проще взять бесплатную карту.`
            : sp.foldEq === 'none' ? `${who(sp)}, так что блефовать бессмысленно. Но у тебя ${outsW(o)}: ставка допустима — такое дро часто выигрывает и само. Бесплатная карта тоже хороша.`
            : `${who(sp)} — ставка-полублеф допустима, но бесплатная карта надёжнее.`);
        } else if (v.raise === M) L.push(`${who(sp)} — полублеф против него не сработает, бери бесплатную карту.`);
        if (t === 'fold') L.push('Никогда не сбрасывай, когда можно бесплатно чекнуть.');
        return L;
      }
      if (showdownCall(sp)) {
        L.push(`По аутам ${E}% < ${showNeed(sp)} — как дро колл невыгоден.`);
        L.push(`Но у тебя уже есть готовая рука (${lowerFirst(sp.made.name)}): против рук, с которыми ${rangeOf(sp)}, у тебя примерно ${pctR(sp.estEq * 100)} эквити — колл окупается.`);
      } else L.push(`${E}% ${E >= N ? '≥' : '<'} ${showNeed(sp)} — колл ${E >= N ? 'окупается в долгую' : 'в долгую невыгоден'}.`);
      if (!o && sp.kind === 'nodraw') L.push('У тебя нет ни готовой руки, ни дро — платить не за что.');
      if (o >= 12 && v.raise === B) {
        const eqTo = sp.street === 'flop' ? `около ${o * 4 - (o - 8)}% до ривера` : `около ${o * 2}% на ривере`;
        L.push(`${outsW(o)} — очень сильное дро (${eqTo}): рейз-полублеф выигрывает сразу, если соперник сбросит, а если заплатит — у тебя всё равно много шансов.`);
      } else if (o >= 8 && sp.canRaise) {
        const fe = sp.foldEq;
        if (fe === 'high' || fe === 'medium') L.push(`${who(sp)}, поэтому рейз как полублеф ${E < N ? 'тоже был бы разумным вариантом' : 'тоже допустим'}.`);
        else if (fe === 'low') L.push(`${who(sp)} — рейз-полублеф ${E < N ? 'допустим, но сбросить надёжнее' : 'здесь не лучший вариант'}.`);
        else L.push(`${who(sp)} — полублеф против него не сработает.`);
        if (sp.multiway) L.push('Соперников несколько — шанс, что сбросят все, ниже.');
      } else if (t === 'raise' && o < 8) {
        L.push(`Рейз как полублеф имеет смысл только с сильным дро (8+ аутов) против соперника, который умеет сбрасывать${o ? `, а у тебя ${outsW(o)}` : ''}.`);
      }
      return L;
    }
    const m = sp.made, tag = ['сет', 'трипс', 'оверпара', 'топ-пара', 'слабая пара', 'играет борд'].includes(m.label) ? ` (${m.label})` : '';
    L.push(`Твоя рука: ${lowerFirst(m.name)}${tag}.`);
    if (sp.bigLate && m.strength !== 'strong') {
      const end = m.strength === 'none' ? 'Твои карты не дали даже пары — сброс.' : 'С одной парой — сброс.';
      L.push(sp.villain.revealed ? `Соперник «${sp.villain.styleName}»: крупный рейз на поздней улице от такого соперника — почти всегда натс. ${end}`
        : `Этот соперник редко ставит крупно: крупный рейз на поздней улице от такого соперника — почти всегда натс. ${end}`);
      return L;
    }
    const eq = sp.estEq * 100, ok = eq >= N, close = isClose(sp);
    const p = (x) => (close ? U.pctNum(x, 1) : pctR(x));
    L.push(`Против рук, с которыми ${rangeOf(sp)}, у тебя примерно ${p(eq)} эквити — нужно ${p(N)}. ` +
      (close ? `Это почти на грани: ${ok ? 'колл чуть выгоднее, сброс тоже допустим' : 'сброс чуть выгоднее, колл тоже допустим'}.` : ok ? 'Колл окупается.' : 'Колл невыгоден — сбрасывай.'));
    if (v.raise === B || v.raise === OK) L.push('Рука сильная — повысить за ценностью тоже хорошо.');
    return L;
  }

  function evaluateAction(spot, action) {
    if (!spot) return null;
    const sp = spot;
    let t = typeof action === 'string' ? action : action && action.type;
    if (t === 'bet' || t === 'allin') t = 'raise';
    if (t === 'call' && !sp.facing) t = 'check';
    if (t === 'check' && sp.facing) t = 'call';
    const vd = sp.verdicts[t] || M;
    const verdict = vd === B ? 'correct' : vd === OK ? 'acceptable' : 'mistake';
    const alts = Object.keys(sp.verdicts).filter((a) => a !== sp.best && sp.verdicts[a] === B);
    const right = nounOf(sp, sp.best) + (alts.length ? ` (или ${alts.map((a) => nounOf(sp, a)).join(', ')})` : '');
    const title = verdict === 'correct' ? `✅ Действие: ${nounOf(sp, t)} — верно.`
      : verdict === 'acceptable' ? `⚠️ Действие: ${nounOf(sp, t)} — допустимо, но лучше ${right}.`
      : `❌ Действие: ты ${pastOf(sp, t)}, правильно — ${right}.`;
    return fb('action', verdict, title, actionLines(sp, t));
  }

  // ---------- after the hand: real equity vs the actual cards ----------
  function realEquity(spot, hand) {
    if (!spot || !hand || !(spot.questions || []).includes('outs')) return null;
    if (!spot.opps.every((o) => hand.hole[o.seat])) return null;
    const opp = spot.opps.map((o) => hand.hole[o.seat]), hands = [spot.hole, ...opp];
    const real = Equity.calc(hands, spot.board, { toCome: spot.cardsToSee }).eq[0] * 100, rule = spot.ruleEq;
    const vs = spot.opps.map((o, i) => `${cardsTight(opp[i])} (${o.name})`).join(' и ');
    const d = real - rule;
    let why;
    const sc = (h, c = []) => HandEval.score([...h, ...spot.board, ...c]);
    if (Math.abs(d) < 3) why = `Правило 2 и 4 работает: разница всего ${U.dec(Math.abs(d), 1)} п.п.`;
    else if (d > 0 && opp.every((h) => sc(spot.hole) > sc(h))) why = 'Реально больше: ты выигрываешь и без попадания — сейчас твоя рука сильнее.';
    else if (d > 0) { // behind now: uncounted cards (dirty outs, overcards …) win as well
      const counted = new Set(spot.multiway ? spot.outs.cleanList : spot.outs.list), seen = new Set([...spot.hole, ...spot.board, ...opp.flat()]);
      const extra = spot.cardsToSee === 1 ? Cards.deck().filter((c) => !seen.has(c) && !counted.has(c) && opp.every((h) => sc(spot.hole, [c]) > sc(h, [c]))) : [];
      why = extra.length ? `Реально больше: против этих рук выигрывают и карты, которые не вошли в подсчёт: ${extra.map(Cards.str).join(', ')}.`
        : 'Реально больше: против этих рук выигрывают и карты, которые не вошли в подсчёт аутов.';
    } else {
      const parts = [];
      if (spot.cardsToSee === 1) {
        const held = new Set(opp.flat()), mine = spot.multiway ? spot.outs.cleanList : spot.outs.list;
        const blocked = mine.filter((c) => held.has(c));
        const lost = mine.filter((c) => !held.has(c) && HandEval.score([...spot.hole, ...spot.board, c]) < Math.max(...opp.map((h) => HandEval.score([...h, ...spot.board, c]))));
        if (blocked.length) parts.push(`${blocked.map(Cards.str).join(', ')} — у соперника на руках`);
        if (lost.length) parts.push(`${lost.map(Cards.str).join(', ')} не спасают: у соперника всё равно рука сильнее`);
      }
      why = parts.length ? `Реально меньше: часть аутов не работает (${parts.join('; ')}).`
        : 'Реально меньше: соперник уже впереди, и часть твоих аутов не помогает против его руки.';
    }
    return { kind: 'realEquity', verdict: 'info', ok: true, title: `ℹ️ По правилу: ${rule}%. Реально против ${vs}: ${U.pctNum(real, 1)}.`, lines: [why] };
  }

  // ---------- reading the opponent (SPEC 9.3) ----------
  const READ_OPTIONS = [{ v: 'strong', label: 'Очень сильная рука' }, { v: 'medium', label: 'Средняя рука' }, { v: 'draw', label: 'Дро' }, { v: 'bluff', label: 'Блеф' }];
  const TRUTH_RU = { strong: 'очень сильная рука', medium: 'средняя рука', draw: 'дро', bluff: 'блеф' };
  const DRAW_RU = { flush: 'флеш-дро', oesd: 'открытое стрит-дро', double: 'двойной гатшот', gutshot: 'гатшот', straight: 'стрит-дро' };

  function readQuestion(hand, seat, table) {
    if (!hand || hand.street === 'preflop' || hand.phase !== 'betting') return null;
    if (hand.currentBet - (hand.bets[seat] || 0) <= 0) return null;
    const e = lastWager(hand, seat), p = e && table.players[e.seat];
    if (!p || p.isHuman || !hand.hole[e.seat]) return null;
    const sizeFrac = e.potBefore > 0 ? e.add / e.potBefore : 1;
    if (sizeFrac < 0.66) return null;
    return { bettor: e.seat, truth: classify(hand.hole[e.seat], hand.board), sizeFrac, street: hand.street,
      board: hand.board.slice(), allIn: !!e.allIn, entry: e.i, options: READ_OPTIONS };
  }

  function holdingRu(hole, board) {
    const m = madeInfo(hole, board), r = R(hole[0]);
    let s = m.label === 'сет' ? 'сет ' + GP(r) : m.strength === 'none' && m.cat > CAT.HIGH ? `ничего, ${lowerFirst(m.name)} только на борде` : lowerFirst(m.name);
    if (board.length < 5) {
      const d = computeOuts(hole, board).draws.find((x) => DRAW_RU[x.type]);
      if (d) s += ' + ' + DRAW_RU[d.type];
    }
    return s;
  }

  function preflopRu(hand, seat) {
    let raises = 0, strong = false;
    const acts = [];
    for (const e of hand.log) {
      if (e.street !== 'preflop') break;
      if (e.seat === seat && e.type !== 'sb' && e.type !== 'bb' && e.type !== 'fold') {
        if (e.type === 'raise') strong = true;
        acts.push(e.type === 'raise' ? (raises === 0 ? 'открытие рейзом' : raises === 1 ? '3-бет' : 'ререйз')
          : e.type === 'call' ? (raises === 0 ? (hand.pos[seat] === 'SB' ? 'доплата с малого блайнда' : 'лимп') : 'колл рейза')
          : 'чек на большом блайнде');
      }
      if (e.type === 'raise' || e.type === 'bet') raises++;
    }
    if (!acts.length) return null;
    const why = strong ? 'это говорит о сильном диапазоне' : acts.length === 1 && acts[0] === 'чек на большом блайнде' ? 'рука может быть любой: флоп был бесплатным'
      : 'обычно так играют средние и спекулятивные руки';
    return `Префлоп: ${acts.join(', затем ')} — ${why}.`;
  }

  function playerTypeRu(p) {
    if (p.revealed) {
      // «Такой игрок …» keeps the description's «его ставка» grammatical for female bots too
      const B = bots(), st = B && B.STYLES && B.STYLES[p.style];
      return `${p.name} — «${styleName(p)}»${st && st.type ? ` (${st.type})` : ''}.${st && st.desc ? ' Такой игрок ' + lowerFirst(st.desc.split('. ')[0].replace(/\.$/, '')) + '.' : ''}`;
    }
    const h = p.hud || { hands: 0, vpip: 0, pfr: 0 };
    if (h.hands < 8) return `Статистики у ${gen(p.name)} пока мало (${U.nplural(h.hands, 'раздача', 'раздачи', 'раздач')}) — опирайся на остальные признаки.`;
    const vpip = h.vpip / h.hands, pfr = h.pfr / h.hands, loose = vpip >= 0.3, aggr = pfr >= vpip * 0.5;
    const desc = loose ? (aggr ? 'лузовый агрессивный игрок: часто ставит крупно с чем угодно' : 'лузовый пассивный игрок: играет много рук, но крупно ставит в основном с силой')
      : aggr ? 'тайтовый агрессивный игрок: ставит и с сильными руками, и с дро, иногда блефует' : 'тайтовый пассивный игрок: крупно ставит почти только с сильной рукой';
    return `${p.name} играет ${pctR(vpip * 100)} раздач и повышает префлоп в ${pctR(pfr * 100)} раздач — похоже, это ${desc}.`;
  }

  function readReview(read, answer, hand, table, extras = {}) {
    if (!read || !hand || !table) return null;
    const p = table.players[read.bettor], hole = hand.hole[read.bettor];
    if (!p || !hole) return null;
    const ok = answer === read.truth, lab = (READ_OPTIONS.find((o) => o.v === answer) || {}).label;
    const lines = ['Признаки:', playerTypeRu(p)];
    const pos = hand.pos[read.bettor];
    if (pos) {
      lines.push(`Позиция: ${pos}${['CO', 'BTN'].includes(pos) ? ' — из поздней позиции чаще ставят широким диапазоном, в том числе блефуют.'
        : ['UTG', 'UTG+1'].includes(pos) ? ' — из ранней позиции обычно играют сильные руки.'
        : ['MP', 'LJ', 'HJ'].includes(pos) ? ' — из средней позиции играют чуть шире, чем из ранней, но всё ещё довольно сильные руки.' : '.'}`);
    }
    const pre = preflopRu(hand, read.bettor);
    if (pre) lines.push(pre);
    lines.push(`Размер ставки: ${pctR(read.sizeFrac * 100)} банка${read.allIn ? ' (олл-ин)' : ''} — крупно: так ставят с очень сильной рукой или с блефом, средние руки обычно ставят меньше.`);
    const ms = extras.thinkMs;
    if (Number.isFinite(ms)) {
      const s = U.dec(ms / 1000, 1);
      lines.push(ms < 1200 ? `Тайминг: быстрая ставка (${s} с) — часто это заранее решённое действие: сильная рука или блеф.`
        : ms > 3000 ? `Тайминг: долгое раздумье (${s} с) — сомнение чаще бывает со средней рукой или дро, но это может быть и спектакль.`
        : `Тайминг: обычная пауза (${s} с) — ничего особенного не подсказывает.`);
    }
    if (Array.isArray(extras.tellsSeen)) {
      const seen = extras.tellsSeen.filter((r) => r && r.seat === read.bettor);
      if (!seen.length) lines.push(`Теллов у ${gen(p.name)} ты не видел.`);
      for (const r of seen) lines.push(`Телл: ${p.name} ${r.text}${r.meaning ? ` — ${r.meaning}` : ''}${r.acting ? ' (на деле это был спектакль: показанное было обратным)' : ''}.`);
    }
    lines.push(`На самом деле у ${gen(p.name)}: ${cardsTight(hole)} — ${holdingRu(hole, read.board || hand.board)} (${TRUTH_RU[read.truth]}).`);
    const title = ok ? `✅ Чтение соперника: верно — ${TRUTH_RU[read.truth]}.`
      : lab ? `❌ Чтение соперника: ты выбрал «${lab}», а на самом деле — ${TRUTH_RU[read.truth]}.` : `❌ Чтение соперника: на самом деле — ${TRUTH_RU[read.truth]}.`;
    return fb('read', ok ? 'correct' : M, title, lines);
  }

  // ---------- tells: the reaction the player missed while looking at the board ----------
  function lookHint(missed, table, street) {
    const honest = (missed || []).filter((r) => r && !r.acting && !r.random && r.truth !== 'neutral' && table.players[r.seat]);
    const r = honest.find((x) => x.shown === 'strength') || honest[0];
    if (!r) return null;
    const st = STREET_RU[street] || 'флоп';
    const meaning = String(r.meaning || '').replace(/флоп/g, st);
    return fb('tells', M, `❌ Теллы: ты смотрел на борд, когда открывался ${st}.`,
      [`Ты смотрел на борд. В этот момент ${table.players[r.seat].name} ${r.text}${meaning ? ` — ${meaning}` : ''}. Смотри на соперников, борд никуда не денется.`]);
  }

  // ---------- the player's own timing (SPEC 9.4) ----------
  const timing = (() => {
    let log = [];
    const avg = (a) => U.sum(a.map((x) => x.ms)) / a.length;
    return {
      add(ms, strong) { log.push({ ms: +ms || 0, strong: !!strong }); if (log.length > 20) log.shift(); },
      warning() {
        const s = log.filter((x) => x.strong), w = log.filter((x) => !x.strong);
        if (s.length < 3 || w.length < 3 || avg(s) - avg(w) <= 2000) return null;
        return 'Твой тайминг выдаёт силу руки. Держи одинаковую паузу перед каждым действием.';
      },
      reset() { log = []; },
    };
  })();
  function heroStrong(hole, board) {
    if (!hole) return false;
    if (!board || board.length < 3) return Equity.holeTopPct(hole) <= 0.12;
    const k = classify(hole, board);
    return k === 'strong' || k === 'medium';
  }

  return { analyze, questions, check, evaluateAction, realEquity, readQuestion, readReview, lookHint, timing, heroStrong, computeOuts, madeInfo };
})();
