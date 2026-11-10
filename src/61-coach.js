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
    const name = HandEval.describe(sc);
    // How to say it to a beginner: a pair that lives only on the board is shared, not the hero's.
    let ru = lowerFirst(name);
    const bp = Math.max(0, ...br.filter((r) => on(r) >= 2 && !hr.includes(r)));
    if (strength === 'none' && cat > CAT.HIGH && label !== 'играет борд') ru = `только старшая карта — ${Cards.rankRu(Math.max(...hr))} (${ru} на борде общая)`;
    else if (cat === CAT.TWO_PAIR && bp && ['оверпара', 'топ-пара', 'слабая пара'].includes(label)) {
      const mine = hr[0] === hr[1] ? hr[0] : hr.find((r) => on(r));
      ru = `пара ${GP(mine)} (${label}) + пара ${GP(bp)} на борде — общая`;
    }
    return { cat, name, strength, label, ru };
  }

  // ---------- outs (structural, hero-specific, next card only) ----------
  const DIRTY_RU = {
    pair: ['спаривает борд, у соперника может быть фулл-хаус', 'спаривают борд, у соперника может быть фулл-хаус'],
    flush: ['даёт стрит, но на борде будет минимум 3 карты одной масти: у соперника может быть флеш', 'дают стрит, но на борде будет минимум 3 карты одной масти: у соперника может быть флеш'],
    nonnut: ['даёт не натсовый флеш: у соперника может быть флеш старше', 'дают не натсовый флеш: у соперника может быть флеш старше'],
    flush2: ['улучшает руку, но на борде будет минимум 3 карты одной масти: у соперника может быть флеш', 'улучшают руку, но на борде будет минимум 3 карты одной масти: у соперника может быть флеш'],
    straight2: ['улучшает руку, но на борде будет 4 карты к стриту: у соперника может быть стрит', 'улучшают руку, но на борде будет 4 карты к стриту: у соперника может быть стрит'],
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
        // on a paired board the "trips" card makes a full house and the "two pair" card only a higher two pair
        add('trips', ofRank(r), (n, cs) => (HandEval.cat(HandEval.score([...all, cs[0]])) >= CAT.FULL_HOUSE
          ? `Пара ${GP(r)} при паре на борде: фулл-хаус дают оставшиеся ${NP(r)} (${outsW(n)}).` : `Пара ${GP(r)}: тройку дают оставшиеся ${NP(r)} (${outsW(n)}).`));
        if (!on(other)) add('twopair', ofRank(other), (n) => `${curCat >= CAT.TWO_PAIR ? 'Две пары старше' : 'Две пары'} дают оставшиеся ${NP(other)} (${outsW(n)}).`);
      }
    }
    const list = [...new Set(draws.flatMap((d) => d.cards))], inList = new Set(list);
    const dirtyCode = (x) => {
      const cat = HandEval.cat(HandEval.score([...all, x])), nb = [...board, x];
      if ((cat === CAT.STRAIGHT || cat === CAT.FLUSH) && br.includes(R(x))) return 'pair';
      const flushy = [0, 1, 2, 3].some((s) => nb.filter((c) => S(c) === s).length >= 3);
      if (cat === CAT.STRAIGHT && flushy) return 'flush';
      const mine = hole.filter((c) => S(c) === S(x)), topMine = Math.max(0, ...mine.map(R));
      // counted before the out falls (x included), so every card of the same draw gets the same answer
      const higher = unseen.filter((c) => (mine.length === 2 || c !== x) && S(c) === S(x) && R(c) > topMine).length;
      // one suited hole card: any single higher card beats us; two: only a really low flush (7+ higher cards unseen,
      // e.g. 5♥4♥ on A♥T♥) — a 9-high flush is beaten by few two-card combos. ponytail: fixed threshold, not a combo count
      if (cat === CAT.FLUSH && (mine.length === 1 ? higher > 0 : higher >= 7)) return 'nonnut';
      if (cat < CAT.STRAIGHT) { // set / trips / two pair: the same board danger as for straights
        if (flushy) return 'flush2';
        const nm = nb.reduce((m, c) => m | (1 << R(c)), 0);
        if ([...Array(13)].some((_, i) => HandEval.straightTop(nm | (1 << (i + 2))))) return 'straight2';
      }
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
  // Every two-card combo off the board with its class and preflop rank (cached per board).
  const comboCache = new Map();
  function comboTable(board) {
    const key = board.join(',');
    let t = comboCache.get(key);
    if (t) return t;
    const dead = new Set(board), deck = Cards.deck().filter((c) => !dead.has(c));
    t = { combos: [], cls: [], top: [] };
    for (let i = 0; i < deck.length; i++) for (let j = i + 1; j < deck.length; j++) {
      const h = [deck[i], deck[j]];
      t.combos.push(h); t.cls.push(classify(h, board)); t.top.push(Equity.holeTopPct(h));
    }
    if (comboCache.size > 6) comboCache.clear();
    comboCache.set(key, t);
    return t;
  }
  // The style's preflop range (holeTopPct ≤ LOOSE) weighted by class: mix = {strong, medium, draw, bluff} shares,
  // or null = every combo of the range equally.
  function sampler(t, dead, base, mix) {
    const loose = LOOSE[base] || 0.3, cnt = {};
    const ok = (k) => t.top[k] <= loose && !dead.has(t.combos[k][0]) && !dead.has(t.combos[k][1]);
    if (mix) t.combos.forEach((h, k) => { if (ok(k)) cnt[t.cls[k]] = (cnt[t.cls[k]] || 0) + 1; });
    let acc = 0;
    const cum = t.combos.map((h, k) => (acc += ok(k) ? (mix ? (mix[t.cls[k]] || 0) / cnt[t.cls[k]] : 1) : 0));
    return { cum, total: acc };
  }
  function pickFrom(t, { cum, total }, dead) {
    if (!total) { // empty range: any live combo
      let h;
      do h = t.combos[Math.floor(U.rng() * t.combos.length)]; while (dead.has(h[0]) || dead.has(h[1]));
      return h;
    }
    const x = U.rng() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] > x) hi = m; else lo = m + 1; }
    return t.combos[lo];
  }
  // Opponent holdings are drawn directly from the weighted combo list (rejection sampling with a few
  // tries cannot reach tight ranges like a rock's); each sample is run out once via Equity.calc.
  function estimateEq(hole, board, opps, iters = 1500) {
    const t = comboTable(board), dead = new Set(hole);
    const samplers = opps.map(({ base, frac }) => sampler(t, dead, base, betMix(base, frac)));
    const pick = (sm) => pickFrom(t, sm, dead);
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

  // ---------- fold equity: the real bot logic against sampled holdings ----------
  const CHECKED = { strong: 0.08, medium: 0.4, draw: 0.22, bluff: 0.3 }; // what a check / call on this street looks like
  const FE_PROB = { high: 0.6, medium: 0.4, low: 0.2, none: 0.05 };     // without Bots
  const potOf = (hand) => { const E = eng(); return E && E.pot ? E.pot(hand) : U.sum(hand.committed) - U.sum(hand.returned || []); };
  // The opponent's line on this street → how to weight its range.
  function lineMix(hand, s, base) {
    let e = null;
    for (const x of hand.log) if (x.street === hand.street && x.seat === s) e = x;
    if (!e) return null;
    if (e.type === 'bet' || e.type === 'raise') return betMix(base, e.potBefore > 0 ? e.add / e.potBefore : 0.66);
    return CHECKED;
  }
  // A copy of everything Engine.legal / Bots.decide read, as if `seat` had just bet or raised to betTo.
  function applyBet(h, hand, seat, betTo) {
    h.players = hand.players.map((p) => ({ ...p }));
    for (const k of ['bets', 'committed', 'returned', 'folded', 'allIn', 'acted']) h[k] = (hand[k] || hand.seats.map(() => 0)).slice();
    h.log = hand.log.slice();
    const add = Math.max(0, betTo - hand.bets[seat]), potBefore = potOf(hand), raise = betTo - hand.currentBet;
    h.players[seat].stack -= add; h.bets[seat] += add; h.committed[seat] += add; h.allIn[seat] = h.players[seat].stack <= 0;
    if (raise >= hand.minRaise) { h.minRaise = raise; h.acted.fill(false); } else h.minRaise = hand.minRaise;
    h.acted[seat] = true; h.currentBet = Math.max(hand.currentBet, betTo); h.lastRaiser = seat; h.raises = (hand.raises || 0) + 1;
    h.log.push({ i: hand.log.length, street: hand.street, seat, type: hand.currentBet ? 'raise' : 'bet', add, to: h.bets[seat], allIn: h.allIn[seat],
      incomplete: raise < hand.minRaise, facing: hand.currentBet - hand.bets[seat], potBefore, potAfter: potBefore + add });
    h.phase = 'betting';
  }
  // Probability that ALL opponents fold to a bet/raise to each of betTos: per opponent ~48/n holdings sampled from its
  // range (style + line), Bots.decide asked 6 times each; the product over opponents. ponytail: opponents answer
  // independently (as if each acted first) — no "one calls, the next overcalls" chains.
  const fpCache = new WeakMap();
  const SIM_COMBOS = 48, SIM_REPS = 6;
  function foldProbs(hand, seat, table, betTos) {
    const opps = hand.seats.filter((s) => s !== seat && !hand.folded[s]);
    if (!opps.length) return betTos.map(() => 1);
    if (opps.some((s) => hand.allIn[s])) return betTos.map(() => 0); // an all-in player cannot fold
    let cache = fpCache.get(hand);
    if (!cache) fpCache.set(hand, (cache = new Map()));
    const tag = `${seat}|${hand.street}|${hand.log.length}|`, todo = [...new Set(betTos.filter((b) => !cache.has(tag + b)))];
    if (todo.length) {
      const B = bots(), E = eng(), res = todo.map(() => 1);
      if (!(B && B.decide && E && E.legal)) {
        for (const o of opps) todo.forEach((_, j) => { res[j] *= FE_PROB[foldEqOf(table.players[o])] || 0.4; });
      } else {
        const t = comboTable(hand.board), dead = new Set(hand.hole[seat]), k = Math.max(8, Math.round(SIM_COMBOS / opps.length));
        for (const o of opps) {
          if (res.every((x) => x < 0.005)) break; // the product can only shrink
          const base = baseOf(table.players[o]), sm = sampler(t, dead, base, lineMix(hand, o, base)), counts = new Map();
          for (let i = 0; i < k; i++) { const c = pickFrom(t, sm, dead); counts.set(c, (counts.get(c) || 0) + 1); }
          const folds = todo.map(() => 0);
          let n = 0;
          for (const [combo, c] of counts) {
            const h = { ...hand, hole: hand.hole.slice() }; // one object per holding: Bots memoizes its equity per hand object
            h.hole[o] = combo;
            todo.forEach((betTo, j) => {
              applyBet(h, hand, seat, betTo);
              h.toAct = o;
              const L = E.legal(h);
              for (let r = 0; r < SIM_REPS * c; r++) {
                try { if (B.decide({ table, hand: h, seat: o, legal: L }).action.type === 'fold') folds[j]++; } catch (e) { /* counts as a call */ }
              }
            });
            n += SIM_REPS * c;
          }
          todo.forEach((_, j) => { res[j] *= folds[j] / n; });
        }
      }
      todo.forEach((b, j) => cache.set(tag + b, res[j]));
    }
    return betTos.map((b) => cache.get(tag + b));
  }
  const foldProb = (hand, seat, table, betTo) => foldProbs(hand, seat, table, [betTo])[0];
  // A frozen copy of the decision point: later Engine.act calls must not change what the spot measures.
  const snapshot = (hand) => ({ ...hand, players: hand.players.map((p) => ({ ...p })), hole: hand.hole.slice(), board: hand.board.slice(), log: hand.log.slice(),
    ...Object.fromEntries(['bets', 'committed', 'returned', 'folded', 'allIn', 'acted'].map((k) => [k, (hand[k] || []).slice()])) });
  const nice = (x, bb) => { const st = Math.max(1, (bb || 20) / 2); return Math.max(st, Math.round(x / st) * st); };

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
    const oppSeats = hand.seats.filter((s) => s !== seat && !hand.folded[s]);
    if (!oppSeats.length) return null;
    const made = madeInfo(hole, board), outs = river ? NO_OUTS : computeOuts(hole, board);
    const kind = made.strength === 'strong' || made.strength === 'medium' ? 'made' : !river && (outs.total || outs.over) ? 'draw' : 'nodraw';

    const nOpp = oppSeats.length, multiway = nOpp >= 2;
    const wager = facing ? lastWager(hand, seat) : null;
    const bettor = wager ? wager.seat : facing ? hand.lastRaiser : null;
    const sizeFrac = wager && wager.potBefore > 0 ? wager.add / wager.potBefore : 0;
    const callers = wager ? hand.log.filter((e) => e.i > wager.i && e.street === street && e.type === 'call').length : 0;
    const myBet = hand.bets[seat] || 0, full = Math.max(0, hand.currentBet - myBet);
    let pot = potOf(hand);
    const short = facing && toCall < full; // hero can only call all-in for less: the excess is not his to win
    if (short) { const lim = paidOf(hand, seat) + toCall; pot = hand.seats.reduce((a, s) => a + Math.min(paidOf(hand, s), lim), 0); }
    const allInSpot = facing && (toCall >= lg.stack || oppSeats.every((s) => hand.allIn[s]));
    const cardsToSee = street === 'flop' && allInSpot ? 2 : 1;
    // Overcards (no pair, hole card above the board): 3 outs each heads-up vs no bet / a bet < 2/3 pot;
    // vs a big bet or 3+ players a pair of them may not be enough — half (rounded). Accepted: without, half, full.
    const outsBase = multiway ? outs.clean : outs.total, overHalf = multiway || (facing && sizeFrac >= 0.66);
    const half = Math.round(outs.over / 2), correctOuts = outsBase + (overHalf ? half : outs.over);
    const rule = (o) => (cardsToSee === 1 ? o * 2 : o * 4 - Math.max(0, o - 8));
    const needed = facing ? (toCall / (pot + toCall)) * 100 : 0;

    const P = (s) => table.players[s];
    const vSeat = bettor !== null && bettor !== undefined ? bettor
      : oppSeats.reduce((a, s) => (LEVELS.indexOf(foldEqOf(P(s))) < LEVELS.indexOf(foldEqOf(P(a))) ? s : a));
    const vp = P(vSeat), villainFE = foldEqOf(vp), base = baseOf(vp);
    const sp = {
      street, kind, facing, hole: hole.slice(), board, pot, toCall, betTo: hand.currentBet, bettor: facing ? bettor : null, sizeFrac, allInSpot, callers,
      nOpp, multiway, outs, correctOuts, acceptedOuts: [...new Set([correctOuts, outsBase + half, outsBase, outsBase + outs.over])],
      cardsToSee, ruleEq: rule(correctOuts), needed, estEq: null, made, foldEq: multiway ? lower(villainFE) : villainFE,
      seat, myBet, short, canRaise: !!lg.canRaise, outsBase, overHalf, villainFE, stack: lg.stack, bb: hand.bb || 20,
      minTo: lg.minTo || hand.currentBet * 2 || hand.bb || 20,
      potStart: hand.potAtStreetStart != null ? hand.potAtStreetStart : pot - U.sum(hand.bets),
      opps: oppSeats.map((s) => ({ seat: s, name: P(s).name })),
      villain: { seat: vSeat, name: vp.name, styleName: styleName(vp), base, revealed: !!vp.revealed },
      bigLate: !!(wager && wager.type === 'raise' && sizeFrac >= 0.66 && (street === 'turn' || street === 'river') && (base === 'rock' || base === 'station')),
    };
    // fold probability of any bet/raise size, measured on a frozen copy of this decision point
    const snap = snapshot(hand);
    Object.defineProperty(sp, 'fpAt', { value: (to) => foldProb(snap, seat, table, to) });
    if (facing && (kind === 'made' || river || made.strength === 'weak')) { // a weak pair also has showdown value
      sp.estEq = estimateEq(hole, board, oppSeats.map((s) => ({ base: baseOf(P(s)), frac: s === bettor ? sizeFrac : 0.33 })));
    }
    if (kind === 'draw' && facing && !allInSpot) sp.implied = impliedOdds(sp, oppSeats.map(P));
    Object.assign(sp, !facing && kind !== 'draw' ? freeVerdicts(sp) : kind === 'draw' || (kind === 'nodraw' && !river) ? drawVerdicts(sp) : madeVerdicts(sp));
    if (kind === 'nodraw' && sp.canRaise) bluffVerdicts(sp, snap, table);
    // a made hand with a real draw on top (top pair + flush draw …) still asks the outs questions (SPEC 7)
    const realDraw = !river && outs.draws.some((d) => REAL_DRAWS.includes(d.type));
    sp.drawToo = kind === 'made' && realDraw && facing;
    const drawQ = !river && (kind === 'draw' || (kind === 'made' && realDraw));
    const worthBet = !facing && sp.canRaise && (kind === 'made' || (kind === 'draw' && sp.verdicts.raise && sp.verdicts.raise !== M));
    sp.questions = [drawQ && 'outs', drawQ && facing && 'cards', drawQ && 'equity', facing && 'potodds', worthBet && 'sizing'].filter(Boolean);
    return sp;
  }

  const B = 'best', OK = 'ok', M = 'mistake';
  const REAL_DRAWS = ['flush', 'oesd', 'double', 'straight'];
  // Overcards counted by half, but the accepted full count (3 each) pays for the call.
  const overAll = (sp) => sp.outsBase + sp.outs.over;
  const overCall = (sp) => sp.facing && sp.overHalf && sp.outs.over > 0 && ruleOf(sp)(overAll(sp)) >= sp.needed && sp.ruleEq < sp.needed && !implOk(sp);
  // Implied odds: what a made draw wins later. future = min(chips behind, pot after the call × payoff); the payoff
  // depends on how the opponents pay off and shrinks for obvious/dirty draws and with one street left.
  const PAYOFF = { station: 1, maniac: 0.8, reg: 0.5, rock: 0.3 };
  const PAY_RU = { station: 'платит почти всегда', maniac: 'платит часто', reg: 'платит иногда', rock: 'платит редко' };
  function impliedOdds(sp, opps) {
    const pays = opps.map((p) => PAYOFF[baseOf(p)] || 0.5).sort((a, b) => b - a);
    let pay = pays.length > 1 ? Math.min(1, 0.8 * (pays[0] + 0.25 * U.sum(pays.slice(1)))) : pays[0];
    const why = [], br = sp.board.map(R), mask = [...sp.hole, ...sp.board].reduce((m, c) => m | (1 << R(c)), 0);
    if (new Set(br).size < br.length) { pay *= 0.6; why.push('борд спарен'); }
    const fl = sp.outs.draws.find((d) => d.type === 'flush'), st = sp.outs.draws.find((d) => ['gutshot', 'oesd', 'double', 'straight'].includes(d.type));
    if (fl && sp.hole.filter((c) => S(c) === S(fl.cards[0])).length === 1) { pay *= 0.5; why.push('флеш соберётся 4 картами борда — его видно'); }
    else if (fl && sp.outs.dirtyList.some((d) => d.code === 'nonnut')) { pay *= 0.7; why.push('флеш не натсовый'); }
    else if (!fl && st && st.cards.every((c) => HandEval.straightTop(mask | (1 << R(c))) - 1 > Math.max(...sp.hole.map(R)))) { pay *= 0.6; why.push('стрит с нижнего конца'); }
    if (sp.street === 'turn') { pay *= 0.75; why.push('впереди только ривер'); }
    const behind = Math.min(sp.stack - sp.toCall, Math.max(0, ...opps.map((p) => p.stack)));
    const future = Math.round(Math.max(0, Math.min(behind, (sp.pot + sp.toCall) * pay)));
    return { future, neededImplied: (100 * sp.toCall) / (sp.pot + sp.toCall + future), pay, why };
  }
  // Semi-bluff raise to ~3×, judged by the real fold probability: EV = fp × pot + (1 − fp) × (equity × final pot − raise).
  // Called, the draw usually sees two cards on the flop (rule of 4), one on the turn.
  function semiVd(sp) {
    const o = sp.correctOuts, fe = sp.foldEq;
    if (o < 4 || !sp.canRaise) return M;
    if (!sp.fpAt) return o >= 8 && (fe === 'high' || fe === 'medium') ? B : o >= 8 && fe === 'low' ? OK : M;
    const to = Math.min(Math.max(nice(3 * sp.betTo, sp.bb), sp.minTo), sp.myBet + sp.stack), add = to - sp.myBet, fp = sp.fpAt(to);
    const eq = (sp.street === 'flop' ? o * 4 - Math.max(0, o - 8) : o * 2) / 100;
    const ev = fp * sp.pot + (1 - fp) * (eq * (sp.pot + add + (to - sp.betTo)) - add);
    sp.semi = { to, fp, eq, ev };
    // ponytail: fp is a 48-combo Monte Carlo (±~7% vs a tight bettor) — 'best' and a weak draw's 'ok' need a clear
    // margin, or the verdict flips between runs (A♥K♥ = 12 outs vs a rock's pot bet sits at ~0.05–0.1 pot)
    return o < 8 ? (ev >= 0.1 * sp.pot ? OK : M) : ev >= 0.15 * sp.pot ? B : ev >= 0 ? OK : M;
  }
  function drawVerdicts(sp) {
    const o = sp.correctOuts, fe = sp.foldEq, folds = fe === 'high' || fe === 'medium';
    const callOk = sp.facing && sp.ruleEq >= sp.needed, impl = sp.facing && !callOk && !!sp.implied && sp.ruleEq >= sp.implied.neededImplied;
    let best, v;
    // no bet: a semi-bluff needs fold equity — against a calling station only a huge draw may bet
    if (!sp.facing) { best = 'check'; v = { check: B, raise: o >= 8 && folds ? B : fe === 'none' && o < 12 ? M : OK, fold: M }; }
    // 12+ outs: the raise is preferred (unless the real bot logic says the bettor won't fold); when the call loses
    // even with implied odds, folding is the fallback
    else if (o >= 12 && fe !== 'none' && sp.canRaise && semiVd(sp) === B) { best = 'raise'; v = callOk || impl ? { raise: B, call: OK, fold: M } : { raise: B, fold: OK, call: M }; }
    else if (callOk) { best = 'call'; v = { call: B, raise: o >= 8 && folds ? OK : M, fold: M }; }
    else if (impl) { best = 'call'; v = { call: B, fold: OK, raise: semiVd(sp) === M ? M : OK }; } // implied odds pay for the call
    else { // a draw just short of the implied price (within the same 5 pp as isClose): the call is no blunder
      const near = !!sp.implied && o >= 8 && sp.ruleEq >= sp.implied.neededImplied - Math.min(5, sp.needed / 4);
      best = 'fold'; v = { fold: B, call: near ? OK : M, raise: semiVd(sp) };
    }
    if (showdownCall(sp) && v.call === M) { // a weak pair that is often ahead of this bettor: calling is right too
      v = { ...v, call: B, fold: v.fold === M ? M : OK };
      if (best === 'fold') best = 'call';
    }
    if (overCall(sp) && v.call === M) v = { ...v, call: OK }; // the answers just accepted must not make the call a mistake
    if (!sp.canRaise) delete v.raise;
    return { best, verdicts: v };
  }
  const showdownCall = (sp) => sp.facing && sp.estEq != null && sp.ruleEq < sp.needed && sp.estEq * 100 >= sp.needed;
  // The estimate is a rough range model: within 3 pp of the price (less for tiny prices) call and fold are both acceptable.
  // A Monte Carlo range model is rough: within 5 pp of the price (less for tiny prices) both options are acceptable.
  const isClose = (sp) => Math.abs(sp.estEq * 100 - sp.needed) < Math.min(5, sp.needed / 4);
  // Value-raise thresholds scale with the number of opponents: the fair share is 1 / (players in the pot).
  const raiseBar = (sp) => { const fair = 1 / (sp.nOpp + 1); return { best: Math.min(0.75, 1.6 * fair), ok: Math.min(0.65, 1.3 * fair) }; };
  function madeVerdicts(sp) {
    const eq = sp.estEq, m = sp.made, nutsRaise = sp.bigLate && m.strength !== 'strong', close = isClose(sp), bar = raiseBar(sp);
    let res;
    if (m.strength === 'none') {
      // no pair of your own (the board pair is shared): folding is never a mistake; calling is at most acceptable,
      // and only when the price is small or the bettor is known to bluff a lot
      const call = eq * 100 >= sp.needed && (sp.villain.revealed || sp.sizeFrac < 0.5) ? OK : M;
      res = { best: 'fold', verdicts: { fold: B, call, raise: M } };
    } else if (nutsRaise || eq * 100 < sp.needed) res = { best: 'fold', verdicts: { fold: B, call: close && !nutsRaise ? OK : M, raise: M } };
    else {
      const raise = eq >= bar.best ? B : eq >= bar.ok || m.strength === 'strong' ? OK : M;
      // a weak pair vs a hidden style: the player cannot know the bettor bluffs a lot, so folding is no blunder
      const fold = close || (m.strength === 'weak' && !sp.villain.revealed) ? OK : M;
      res = { best: raise === B && m.strength === 'strong' && sp.canRaise ? 'raise' : 'call', verdicts: { call: B, raise, fold } };
    }
    if (!sp.canRaise) delete res.verdicts.raise;
    return res;
  }

  // Nobody bet and the hero has a made hand or air (draws: drawVerdicts). Never fold when the check is free.
  function freeVerdicts(sp) {
    const m = sp.made.strength;
    let res = m === 'strong' || (m === 'medium' && sp.nOpp <= 2 && sp.street !== 'river')
      ? { best: 'raise', verdicts: { raise: B, check: OK, fold: M } }    // value: worse hands pay
      : { best: 'check', verdicts: { check: B, raise: m === 'medium' ? OK : M, fold: M } }; // air: bluffVerdicts decides
    if (!sp.canRaise) res = { best: 'check', verdicts: { check: B, fold: M } };
    return res;
  }
  // Bluff sizes (½, ⅔, pot; facing a bet — a raise to 3×) against the fold probability of the real bot logic.
  // margin = fold probability − break-even (bet ÷ (pot + bet)): ≥ 10 pp — the bluff is best, ≥ 0 — acceptable.
  const BLUFF_SIZES = [0.5, 0.66, 1];
  const bluffVd = (margin) => (margin >= 0.1 ? B : margin >= 0 ? OK : M);
  function bluffAt(sp, to, fp) {
    to = Math.min(Math.max(to, sp.facing ? sp.minTo : 0), sp.myBet + sp.stack);
    const bet = to - sp.myBet, be = bet / (sp.pot + bet);
    if (fp === undefined) fp = sp.fpAt(to);
    return { to, bet, fp, be, margin: fp - be, frac: bet / sp.pot };
  }
  function bluffVerdicts(sp, snap, table) {
    const tos = sp.facing ? [nice(3 * sp.betTo, sp.bb)] : BLUFF_SIZES.map((f) => sp.myBet + nice(f * sp.pot, sp.bb));
    const opts = [...new Set(tos.map((to) => Math.min(Math.max(to, sp.facing ? sp.minTo : 0), sp.myBet + sp.stack)))];
    const fps = foldProbs(snap, sp.seat, table, opts);
    const all = opts.map((to, i) => bluffAt(sp, to, fps[i]));
    // the most chips won per bluff: fp × pot − (1 − fp) × bet
    sp.bluff = all.reduce((a, b) => (b.fp * sp.pot - (1 - b.fp) * b.bet > a.fp * sp.pot - (1 - a.fp) * a.bet ? b : a));
    const vd = bluffVd(sp.bluff.margin), v = sp.verdicts;
    if (sp.facing) v.raise = vd;                   // fold stays best; a profitable bluff-raise is best too
    else if (vd === B) { sp.best = 'raise'; v.raise = B; v.check = OK; } else v.raise = vd;
  }

  // ---------- questions ----------
  const OUTS_HINT = 'Посчитай карты, которые сделают руку сильной: флеш-дро — 9 аутов, открытое стрит-дро — 8, гатшот — 4, ' +
    'карманная пара до сета — 2, пара до трипса — 2, вторая пара к своей карте — 3. Каждую карту считай один раз. ' +
    'Без пары: карта старше борда (оверкарта) — 3 аута, против крупной ставки (2/3 банка+) или 3+ игроков — по половине.';
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
        hint: 'Нужный % = твой колл ÷ (банк вместе со ставкой соперника + твой колл) × 100. Можно округлять.' },
      sizing: { id: 'sizing', type: 'number', prompt: 'Сколько фишек — ставка 2/3 банка?', unit: 'фишек', info: { pot: spot.pot },
        hint: '2/3 банка: раздели банк на 3 и умножь на 2. Можно округлять.' },
    };
    return (spot.questions || []).filter((id) => on[QKEY[id] || id] !== false).map((id) => Q[id]);
  }
  const QKEY = { cards: 'outs', sizing: 'potodds', bluff: 'potodds' }; // settings toggle of each question
  const sizingAnswer = (sp) => Math.round((sp.pot * 2) / 3);
  // After the hero bet/raised with a weak hand (air, weak pair, draw): how often must the opponent fold?
  function afterActionQuestions(spot, action, settings) {
    const on = (settings && settings.questions) || {};
    const t = typeof action === 'string' ? action : action && action.type;
    if (!spot || !spot.fpAt || on.potodds === false || !spot.canRaise || !['bet', 'raise', 'allin'].includes(t)) return [];
    if (!['none', 'weak'].includes(spot.made.strength)) return [];
    const to = t === 'allin' ? spot.myBet + spot.stack : action && +action.to > 0 && Number.isFinite(+action.to) ? +action.to
      : spot.bluff ? spot.bluff.to : spot.myBet + nice((spot.pot * 2) / 3, spot.bb);
    spot.bluffQ = bluffAt(spot, to);
    return [{ id: 'bluff', type: 'number', prompt: 'Как часто соперник должен сбросить, чтобы блеф окупился?', unit: '%',
      info: { pot: spot.pot, bet: spot.bluffQ.bet }, hint: 'Нужно сбросов = ставка ÷ (банк + ставка) × 100. Можно округлять.' }];
  }

  // ---------- answer checks ----------
  // Feedback: title + at most 2 short lines; the rest goes under «Подробнее» (more).
  const MAXLEN = 100;
  function pack(all) {
    const lines = [], more = [];
    for (const l of all.filter(Boolean)) (lines.length < 2 && l.length <= MAXLEN ? lines : more).push(l);
    return more.length ? { lines, more } : { lines };
  }
  const fb = (kind, verdict, title, all, extra) => ({ kind, verdict, title, ...pack(all), ok: verdict !== 'mistake', ...extra });
  // Mental math: part ÷ (rest + part) in percent is accepted ±3 pp, anywhere between the exact value and the ones
  // with rounded numbers (±1), or as the percent of a nearby simple fraction (±2).
  const FRACS = [[1, 2], [1, 3], [1, 4], [1, 5], [2, 5]];
  function nearFrac(pct) {
    let best = null;
    for (const [a, b] of FRACS) { const v = (100 * a) / b, d = Math.abs(pct - v); if (d <= 2.5 && (!best || d < best.d)) best = { label: `${a}/${b}`, pct: v, d }; }
    return best;
  }
  const sig2 = (x) => (x < 100 ? x : Math.round(x / 10 ** (Math.floor(Math.log10(x)) - 1)) * 10 ** (Math.floor(Math.log10(x)) - 1));
  const half1 = (x) => (x < 10 ? x : Math.round(x / (10 ** Math.floor(Math.log10(x)) / 2)) * (10 ** Math.floor(Math.log10(x)) / 2));
  function approxOk(x, part, rest) {
    if (!Number.isFinite(x)) return false;
    const exact = (100 * part) / (rest + part);
    if (Math.abs(x - exact) <= 3) return true;
    const vals = [exact, ...[sig2, half1].map((r) => (100 * r(part)) / Math.max(1, r(rest) + r(part)))];
    if (x >= Math.min(...vals) - 1 && x <= Math.max(...vals) + 1) return true;
    const f = nearFrac(exact);
    return !!f && Math.abs(x - f.pct) <= 2;
  }
  // «160 ÷ 480 ≈ 1/3 → 33%»
  function quickWay(part, total) {
    const exact = (100 * part) / total, f = nearFrac(exact), n = Math.round(exact);
    return `${U.fmt(part)} ÷ ${U.fmt(total)} ≈ ` + (f ? `${f.label} → ${Math.round(f.pct)}%${Math.round(f.pct) !== n ? ` (точно ${n}%)` : ''}` : `${n}%`);
  }
  // strict: '9,5' and '30%' are numbers, '12abc' and '0x10' are not
  const num = (v) => (typeof v === 'number' ? v : /^\s*-?\d+([.,]\d+)?\s*%?\s*$/.test(String(v)) ? parseFloat(String(v).replace(',', '.')) : NaN);
  const numRu = (x) => (Math.abs(x) >= 1e6 ? 'больше миллиона' : String(+x.toFixed(2)).replace('.', ',')); // '9,5', never '1e+21'
  const ruleOf = (sp) => (o) => (sp.cardsToSee === 1 ? o * 2 : o * 4 - Math.max(0, o - 8));
  const formula = (sp, o) => (sp.cardsToSee === 1 ? `${o} × 2 = ${o * 2}%` : o > 8 ? `${o} × 4 − (${o} − 8) = ${ruleOf(sp)(o)}%` : `${o} × 4 = ${o * 4}%`);
  const cardsNote = (sp) => (sp.cardsToSee === 2 ? '(две карты: олл-ин на флопе)' : sp.street === 'turn' ? '(одна карта: впереди только ривер)' : '(одна карта, ставка не олл-ин)');

  // Accepted outs other than the main answer: without overcards, overcards by half, overcards in full.
  const altRu = (sp, a) => (a === sp.outsBase ? 'без оверкарт' : a === sp.outsBase + sp.outs.over ? 'оверкарты полностью' : 'оверкарты по половине');
  // heads-up vs a small bet the overcards count in full: leaving them out is only acceptable
  const baseOnly = (sp, a) => !sp.overHalf && a === sp.outsBase && a !== sp.correctOuts;
  // «9 на флеш + 6 на пару (тузы, короли) = 15 аутов.» + why the overcards count fully or by half; details for `more`.
  function overLines(sp) {
    const o = sp.outs, ranks = [...new Set(o.overList.map(R))].sort((a, b) => b - a), names = ranks.map(NP).join(', ');
    // on a board with trips the "pair" is a full house
    const boat = HandEval.cat(HandEval.score([...sp.hole, ...sp.board, o.overList[0]])) >= CAT.FULL_HOUSE;
    const what = boat ? 'фулл-хауса' : `пары ${Cards.rankRu(ranks[0], Cards.GEN)}`, n = sp.correctOuts - sp.outsBase;
    const kinds = [...new Set(o.draws.map((d) => DRAW_NA[d.type]))];
    const base = o.total ? `${sp.outsBase}${sp.multiway && o.dirty ? ' чистых' : ''} на ${joinRu(kinds)}` : null;
    const sum = cap(`${[base, `${n} на ${boat ? 'фулл-хаус' : 'пару'} (${names}${sp.overHalf ? ', по половине' : ''})`].filter(Boolean).join(' + ')} = ${outsW(sp.correctOuts)}.`);
    const why = !sp.overHalf ? `${sp.facing ? 'Ставка небольшая' : 'Соперник не ставил'} — ${what} часто хватает: оверкарты считаем полностью.`
      : sp.multiway ? `Соперников несколько — ${what} может не хватить: оверкарты считаем по половине.`
      : `Против крупной ставки ${what} может не хватить — считаем по половине.`;
    const detail = `Оверкарты (старше всех карт борда): ${names} — по 3 аута на каждую${o.over % 3 ? ' (часть уже в дро)' : ''}, всего ${o.over}` +
      `${sp.overHalf ? `, по половине ${n}` : ''}. Ответы ${sp.acceptedOuts.filter((a) => a !== sp.correctOuts).sort((a, b) => a - b).join(' и ')} тоже засчитываются.`;
    return [sum, why, detail];
  }
  const DRAW_SHORT = { flush: 'флеш-дро', oesd: 'стрит-дро', double: 'двойной гатшот', gutshot: 'гатшот', straight: 'стрит-дро',
    set: 'до сета', boat: 'до фулл-хауса', trips: 'до тройки', twopair: 'до двух пар' };
  const DRAW_NA = { flush: 'флеш', oesd: 'стрит', double: 'стрит', gutshot: 'стрит', straight: 'стрит', set: 'сет', boat: 'фулл-хаус', trips: 'тройку', twopair: 'две пары' };
  // Short summary lines (`first` → lines) and the full explanation (`rest` → always under «Подробнее»).
  function outsLines(sp) {
    const o = sp.outs, first = [], rest = [];
    if (o.over) {
      const [sum, why] = overLines(sp);
      first.push(sum, why);
      rest.push(...o.draws.map((d) => d.text));
    } else if (!o.draws.length) first.push('Ни одна карта не сделает твою руку сильной: дро нет — 0 аутов.');
    else if (o.draws.length === 1) first.push(o.draws[0].text);
    if (o.draws.length > 1) {
      const sum = U.sum(o.draws.map((d) => d.n)), dup = sum - o.total;
      if (!o.over) {
        first.push(cap(`${o.draws.map((d) => `${DRAW_SHORT[d.type]} ${d.n}`).join(' + ')}${dup ? ` − ${dup} повтор` : ''} = ${outsW(o.total)}.`));
        rest.push(...o.draws.map((d) => d.text));
      }
      const twice = o.list.filter((c) => o.draws.filter((d) => d.cards.includes(c)).length > 1).map(Cards.str);
      const dupTxt = dup ? ` − ${dup} (${twice.join(', ')}: ${dup > 1 ? 'эти карты посчитаны' : 'эта карта посчитана'} дважды)` : '';
      rest.push(`Всего: ${o.draws.map((d) => d.n).join(' + ')}${dupTxt} = ${outsW(o.total)}.`);
    }
    if (o.over) rest.push(overLines(sp)[2]);
    if (sp.multiway && o.dirty && !o.over) first.push(`3+ игроков — только чистые ауты: ${o.total} − ${o.dirty} = ${o.clean}.`);
    // pairing a hole card below the board's top card is never an out
    const hr = sp.hole.map(R), br = sp.board.map(R), top = Math.max(...br);
    const under = hr[0] === hr[1] || hr.some((r) => br.includes(r)) || HandEval.cat(HandEval.score([...sp.hole, ...sp.board])) >= CAT.STRAIGHT ? []
      : [...new Set(hr.filter((r) => r < top))].sort((a, b) => b - a);
    if (under.length) rest.push(`${cap(joinRu(under.map(NP)))} не считаем: пара младше ${Cards.rankRu(top, Cards.GEN)} на борде почти никогда не выигрывает.`);
    if (o.dirty) {
      rest.push('Грязные ауты: ' + Object.keys(DIRTY_RU).map((k) => {
        const cs = o.dirtyList.filter((d) => d.code === k).map((d) => Cards.str(d.c));
        return cs.length ? `${cs.join(', ')} — ${DIRTY_RU[k][cs.length > 1 ? 1 : 0]}` : null;
      }).filter(Boolean).join('; ') + '.');
    }
    if (sp.multiway && o.total) {
      rest.push(o.dirty ? `В банке 3+ игроков — считаем только чистые ауты: против нескольких соперников грязные слишком часто проигрывают. ${o.total} − ${o.dirty} = ${o.clean}.`
        : 'В банке 3+ игроков — считаем только чистые ауты; здесь все ауты чистые.');
    }
    return { first, rest };
  }
  function potLines(sp) {
    const { pot, toCall, potStart, myBet } = sp, f = U.fmt;
    const bets = pot - potStart, n = Math.round(sp.needed);
    const head = sp.pre ? `Банк ${f(pot)} (блайнды и ставки).`
      : sp.short ? `Банк, который ты можешь выиграть, — ${f(pot)} (лишнее сверх твоего стека тебе не достанется).`
      : bets === sp.betTo && !myBet ? `Банк ${f(potStart)} + ставка ${f(bets)} = ${f(pot)}.`
      : `Банк ${f(potStart)} + ставки на этой улице ${f(bets)} = ${f(pot)}.`;
    const mine = myBet ? ` Ты уже вложил ${f(myBet)} на этой улице — доплатить нужно ${f(toCall)}.` : '';
    const full = `${head}${mine} Твой колл ${f(toCall)}. ${f(toCall)} ÷ (${f(pot)} + ${f(toCall)}) = ${n}%.`;
    const quick = `Быстро: ${quickWay(toCall, pot + toCall)}.`;
    return full.length <= MAXLEN ? [full, quick] : [`Банк ${f(pot)}, твой колл ${f(toCall)}.`, quick, full];
  }
  const sizingLines = (sp) => [`Банк ${U.fmt(sp.pot)}: ÷ 3 = ${U.fmt(Math.round(sp.pot / 3))}, × 2 = ${U.fmt(sizingAnswer(sp))} фишек.`,
    'Размеры ставок: 1/2 банка — половина, 2/3 — две трети, банк — весь банк.'];
  // «Игорь сбросит» — the style is named only when revealed
  const foldSubj = (sp) => (sp.multiway ? 'все сбросят' : `${sp.villain.name}${sp.villain.revealed ? ` («${sp.villain.styleName}»)` : ''} сбросит`);
  const bluffNumbers = (sp, b) => `${cap(foldSubj(sp))} ~${pctR(b.fp * 100)}, нужно ${pctR(b.be * 100)}`;

  function check(spot, qid, value, answers = {}) {
    const sp = spot, x = num(value), rule = ruleOf(sp);
    const said = (s) => (Number.isFinite(x) ? `ты указал ${s}` : 'ты ничего не указал');
    const xs = Number.isFinite(x) ? numRu(x) : '';
    if (qid === 'outs') {
      const hit = sp.acceptedOuts.find((a) => Math.abs(x - a) <= 1);
      const { first, rest } = outsLines(sp);
      const out = (v, t) => { const f = fb('outs', v, t, first), more = [...(f.more || []), ...rest]; return more.length ? { ...f, more } : f; };
      if (hit === undefined) return out(M, `❌ Ауты: ${said(xs)}, правильно ${sp.correctOuts}.`);
      const near = x !== hit ? ` (ты указал ${xs}, допуск ±1)` : '';
      if (hit === sp.correctOuts) return out('correct', `✅ Ауты: ${sp.correctOuts} — верно${near}.`);
      return baseOnly(sp, hit) ? out('acceptable', `⚠️ Ауты: ${hit} — засчитано без оверкарт, но правильно ${sp.correctOuts}${near}.`)
        : out('correct', `✅ Ауты: ${hit} — засчитано (${altRu(sp, hit)}; основной ответ ${sp.correctOuts})${near}.`);
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
      if (hit === sp.correctOuts) return fb('equity', 'correct', `✅ Эквити: ${formula(sp, hit)} ${note}.`, []);
      if (hit !== undefined) {
        const acc = baseOnly(sp, hit);
        return fb('equity', acc ? 'acceptable' : 'correct', `${acc ? '⚠️' : '✅'} Эквити: ${formula(sp, hit)} ${note} — засчитано (${altRu(sp, hit)}).`,
          [`Основной ответ: ${formula(sp, sp.correctOuts)}.`]);
      }
      const own = num(answers.outs), ownOk = Number.isFinite(own) && sp.acceptedOuts.some((a) => Math.abs(own - a) <= 1);
      if (Number.isFinite(own) && Math.abs(x - rule(own)) <= 1) { // the formula was applied right to the player's own count
        return fb('equity', 'acceptable', ownOk ? `⚠️ Эквити: по твоим ${outsW(own)} формула верна (${formula(sp, own)}), но точно аутов ${sp.correctOuts}.`
          : `⚠️ Эквити: метод верный (${formula(sp, own)}), но ауты посчитаны неверно.`, [`Правильно: ${formula(sp, sp.correctOuts)} ${note}.`]);
      }
      if (Number.isFinite(own) && sp.cardsToSee === 2 && own > 8 && Math.abs(x - own * 4) <= 1) { // ×4 without the 9+ correction
        return fb('equity', M, `❌ Эквити: ${said(xs + '%')} — это ${numRu(own)} × 4 без поправки.`,
          [`При 9+ аутах вычти (ауты − 8): ${formula(sp, own)}. Правильно: ${formula(sp, sp.correctOuts)} ${note}.`]);
      }
      return fb('equity', M, `❌ Эквити: ${said(xs + '%')}, правильно ${sp.ruleEq}%.`,
        [`${formula(sp, sp.correctOuts)} ${note}.`, 'Правило 2 и 4: одна карта — ауты × 2, две карты (олл-ин на флопе) — ауты × 4, а при 9+ аутах вычти (ауты − 8).']);
    }
    if (qid === 'potodds') {
      const n = Math.round(sp.needed);
      if (!approxOk(x, sp.toCall, sp.pot)) return fb('potodds', M, `❌ Шансы банка: ${said(xs + '%')}, правильно ${n}%.`, potLines(sp));
      return fb('potodds', 'correct', Math.abs(x - n) <= 2 ? `✅ Шансы банка: ${n}% — верно.` : `✅ Шансы банка: ${xs}% — засчитано (точно ${n}%).`, potLines(sp));
    }
    if (qid === 'sizing') {
      const a = sizingAnswer(sp);
      return Math.abs(x - a) <= 0.15 * a ? fb('sizing', 'correct', `✅ Ставка 2/3 банка: ${U.fmt(a)} — верно.`, sizingLines(sp))
        : fb('sizing', M, `❌ Ставка 2/3 банка: ${said(xs)}, правильно ${U.fmt(a)}.`, sizingLines(sp));
    }
    if (qid === 'bluff') {
      const b = sp.bluffQ;
      if (!b) return null;
      const n = Math.round(b.be * 100), ok = approxOk(x, b.bet, sp.pot);
      const lines = [`Быстро: ставка ÷ (банк + ставка) = ${quickWay(b.bet, sp.pot + b.bet)}.`,
        `${bluffNumbers(sp, b)} — ${b.fp >= b.be ? 'блеф окупается' : sp.kind === 'draw' && sp.ruleEq ? `как чистый блеф не окупается, выручает дро (~${sp.ruleEq}%)` : 'блеф не окупается'}.`];
      return ok ? fb('bluff', 'correct', `✅ Блеф: нужно ${n}% сбросов — верно.`, lines)
        : fb('bluff', M, `❌ Блеф: ${said(xs + '%')}, нужно ${n}% сбросов.`, lines);
    }
    return null;
  }

  // ---------- action ----------
  const FE_RU = {
    high: ['сбрасывает часто', 'часто сбрасывает на агрессию'], medium: ['сбрасывает иногда', 'иногда сбрасывает на агрессию'],
    low: ['сбрасывает редко', 'редко сбрасывает на агрессию'], none: ['почти никогда не сбрасывает', 'почти никогда не сбрасывает'],
  };
  const fem = (name) => /[ая]$/.test(String(name).split(' ')[0]);
  const him = (sp) => (sp.multiway && !sp.facing && fem(sp.villain.name) ? 'неё' : 'него'); // who() names the player only there
  const who = (sp) => {
    const v = sp.villain, fe = FE_RU[sp.villainFE];
    if (sp.multiway && !sp.facing) return `Самый цепкий из соперников, ${v.name}${v.revealed ? ` («${v.styleName}»), ${fe[0]}` : `, ${fe[1]}`}`; // no bettor to point at
    return v.revealed ? `Соперник «${v.styleName}» (${fe[0]})` : `Этот соперник ${fe[1]}`;
  };
  const isDrawSpot = (sp) => sp.kind === 'draw' || (sp.kind === 'nodraw' && sp.street !== 'river');
  const nounOf = (sp, a) => (a === 'raise' ? (sp.kind === 'draw' ? (sp.facing ? 'рейз-полублеф' : 'ставка-полублеф')
    : sp.kind === 'nodraw' && sp.bluff ? (sp.facing ? 'блеф-рейз' : 'блеф-ставка') : sp.facing ? 'рейз' : 'ставка')
    : { fold: 'сброс', check: 'чек', call: 'колл' }[a]);
  const pastOf = (sp, a) => (a === 'raise' ? (sp.facing ? 'сделал рейз' : 'поставил') : { fold: 'сбросил', check: 'чекнул', call: 'заколлировал' }[a]);
  // '33%' or '33,3%' when rounding would hide which side of the comparison we are on
  const showNeed = (sp) => (Math.round(sp.needed) === sp.ruleEq && sp.ruleEq !== sp.needed ? U.pctNum(sp.needed, 1) : pctR(sp.needed));

  const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  const rangeOf = (sp) => (sp.multiway ? 'соперники так играют' : 'этот соперник так ставит');
  const FRAC_RU = (f) => (f < 0.58 ? '1/2' : f < 0.83 ? '2/3' : 'весь');
  function bluffLine(sp, b) {
    const what = sp.facing ? `Блеф-рейз до ${U.fmt(b.to)}` : `Блеф ${U.fmt(b.bet)}`;
    return `${what} ${b.margin >= 0.1 ? 'выгоден' : b.margin >= 0 ? 'на грани' : 'не окупится'}: ${foldSubj(sp)} ~${pctR(b.fp * 100)}, нужно ${pctR(b.be * 100)}.`;
  }
  const BLUFF_RULE = 'Блеф окупается, когда соперник сбрасывает чаще, чем ставка ÷ (банк + ставка).';
  // Nobody bet: value bet or check with a made hand, bluff or check with air.
  function freeLines(sp, t, b) {
    const L = [], m = sp.made, v = sp.verdicts;
    if (t === 'fold') L.push('Никогда не сбрасывай, когда можно бесплатно чекнуть.');
    if (sp.kind === 'made') {
      const what = cap(m.label);
      if (v.raise === B) L.push(`${what}${m.strength === 'strong' ? ' — сильная рука' : sp.multiway ? ' против двоих' : ' хедз-ап'}: ставь за ценностью — заплатят руки хуже.`);
      else L.push(`${what}: ${sp.street === 'river' ? 'это ривер' : 'соперников много'} — на ставку заплатят в основном руки сильнее, чек.`);
      if (v.check === OK) L.push('Чек тоже допустим: соперник может поставить сам.');
      else if (v.raise === OK) L.push('Ставка тоже допустима, но заплатят чаще руки лучше.');
      L.push(`Твоя рука: ${m.ru}.`);
      return L;
    }
    if (b) L.push(bluffLine(sp, b));
    if (v.raise === B) L.push(`Лучший размер блефа — ${U.fmt(sp.bluff.bet)} (${FRAC_RU(sp.bluff.frac)} банка). Чек тоже допустим.`);
    else L.push(sp.street === 'river' ? 'Чек: со слабой рукой без ставки ты больше ничего не теряешь.' : 'Чек бесплатный: следующую карту увидишь даром.');
    L.push(`Твоя рука: ${m.ru}.`, BLUFF_RULE);
    return L;
  }
  const implOk = (sp) => !!sp.implied && sp.ruleEq < sp.needed && sp.ruleEq >= sp.implied.neededImplied;
  function impliedLine(sp) {
    const I = sp.implied, v = sp.villain, n = Math.round(I.neededImplied);
    const payer = sp.multiway ? 'соперники платят' : v.revealed ? `«${v.styleName}» ${PAY_RU[v.base]}` : `этот соперник ${PAY_RU[v.base]}`;
    return `Неявные шансы: попадёшь — доплатят ещё ~${U.fmt(I.future)} (${payer}${I.why.length ? '; меньше: ' + I.why.join(', ') : ''}). ` +
      (implOk(sp) ? `С ними хватает ~${n}%.` : `Даже с ними нужно ~${n}% — мало.`);
  }
  function actionLines(sp, t, b) {
    const L = [], o = sp.correctOuts, E = sp.ruleEq, N = sp.needed, v = sp.verdicts;
    if (!sp.facing && sp.kind !== 'draw') return freeLines(sp, t, b);
    if (sp.facing && b && t === 'raise') L.push(bluffLine(sp, b));
    if (isDrawSpot(sp)) {
      if (!sp.facing) {
        L.push('Чек бесплатный: следующую карту ты увидишь, ничего не доплачивая.');
        if (v.raise === B) L.push(`${who(sp)}, а у тебя ${outsW(o)} — ставка-полублеф тоже хороша: можешь забрать банк сразу, а если заплатят, у тебя остаётся дро.`);
        else if (v.raise === OK) {
          L.push(o < 8 ? `У тебя всего ${outsW(o)} — ставка-полублеф допустима, но проще взять бесплатную карту.`
            : sp.foldEq === 'none' ? `${who(sp)}, так что блефовать бессмысленно. Но у тебя ${outsW(o)}: ставка допустима — такое дро часто выигрывает и само. Бесплатная карта тоже хороша.`
            : `${who(sp)} — ставка-полублеф допустима, но бесплатная карта надёжнее.`);
        } else if (v.raise === M) {
          L.push(`${who(sp)} — полублеф против ${him(sp)} не сработает. У тебя ${outsW(o)} — около ${E}% попасть на следующей карте: ` +
            (o < 8 ? 'слишком мало, чтобы ставить без шанса, что соперник сбросит.' : 'без сбросов соперника ставка только раздувает банк, а промахиваешься ты чаще.') + ' Бери бесплатную карту.');
        }
        if (t === 'fold') L.push('Никогда не сбрасывай, когда можно бесплатно чекнуть.');
        return L;
      }
      if (showdownCall(sp)) {
        L.push(`По аутам ${E}% < ${showNeed(sp)} — как дро колл невыгоден.`);
        L.push(`Но с готовой рукой (${sp.made.label}) эквити ~${pctR(sp.estEq * 100)} — колл окупается.`);
        L.push(`Но у тебя уже есть готовая рука (${sp.made.ru}): против рук, с которыми ${rangeOf(sp)}, у тебя примерно ${pctR(sp.estEq * 100)} эквити — колл окупается.`);
      } else if (implOk(sp)) L.push(`Нужно ${showNeed(sp)}, у тебя ${E}%; с неявными шансами хватает ~${pctR(sp.implied.neededImplied)} — колл окупается.`);
      else L.push(`${E}% ${E >= N ? '≥' : '<'} ${showNeed(sp)} — колл ${E >= N ? 'окупается в долгую' : 'в долгую невыгоден'}.`);
      if (overCall(sp)) {
        const all = overAll(sp);
        L.push(`С оверкартами полностью (${outsW(all)}) — ${ruleOf(sp)(all)}% ≥ ${showNeed(sp)}: колл тоже допустим, но пары может не хватить, а по половине у тебя ${E}%.`);
      }
      if (!o && sp.kind === 'nodraw') L.push('У тебя нет ни готовой руки, ни дро — платить не за что.');
      if (o >= 12 && v.raise === B) {
        const eqTo = sp.street === 'flop' ? `около ${o * 4 - (o - 8)}% до ривера` : `около ${o * 2}% на ривере`;
        L.unshift(`${outsW(o)} — очень сильное дро (${eqTo}): рейз-полублеф лучше колла.`); // the verdict's reason goes first
        L.push('Рейз выигрывает сразу, если соперник сбросит, а если заплатит — у тебя всё равно много шансов.');
      } else if (o >= 4 && sp.canRaise && (o >= 8 || v.raise !== M)) {
        const folds = sp.foldEq === 'high' || sp.foldEq === 'medium';
        if (v.raise === B) L.push(`${who(sp)}, поэтому рейз как полублеф тоже был бы разумным вариантом.`);
        else if (v.raise === OK) L.push(`${who(sp)} — рейз-полублеф допустим${sp.best === 'fold' ? ', но сбросить надёжнее' : ''}.`);
        else L.push(folds ? `${who(sp)}, но рейз-полублеф здесь не окупится.` : `${who(sp)} — полублеф против ${him(sp)} не сработает.`);
        if (sp.semi) L.push(`Рейз до ${U.fmt(sp.semi.to)}: ${foldSubj(sp)} ~${pctR(sp.semi.fp * 100)}, а если заплатят — у тебя ~${pctR(sp.semi.eq * 100)} на дро.`);
        if (sp.multiway) L.push('Соперников несколько — шанс, что сбросят все, ниже.');
      } else if (t === 'raise' && o < 8 && !b) {
        L.push(`Рейз как полублеф имеет смысл только с сильным дро (8+ аутов) против соперника, который умеет сбрасывать${o ? `, а у тебя ${outsW(o)}` : ''}.`);
      }
      if (b && t !== 'raise' && v.raise !== M) L.push(bluffLine(sp, b));
      if (sp.implied && o > 0 && E < N) L.push(impliedLine(sp));
      return L;
    }
    const m = sp.made, tag = !/общая/.test(m.ru) && ['сет', 'трипс', 'оверпара', 'топ-пара', 'слабая пара', 'играет борд'].includes(m.label) ? ` (${m.label})` : '';
    if (sp.bigLate && m.strength !== 'strong') L.push(`Крупный рейз на поздней улице от такого соперника — почти всегда натс: сброс.`);
    else if (sp.estEq != null && m.strength === 'none') L.push(`Без своей пары колл — ловля блефа (эквити ~${pctR(sp.estEq * 100)}, нужно ${pctR(N)}): сброс надёжнее.`);
    else if (sp.estEq != null) {
      const e = sp.estEq * 100, cl = isClose(sp), q = (x) => (cl ? U.pctNum(x, 1) : pctR(x));
      L.push(sp.best === 'raise' ? `Эквити ~${q(e)} при нужных ${q(N)} — ты далеко впереди: рейз за ценностью.`
        : `Эквити ~${q(e)} против нужных ${q(N)} — ${cl ? 'на грани' : e >= N ? 'колл окупается' : 'колл невыгоден'}.`);
    }
    L.push(`Твоя рука: ${m.ru}${tag}.`);
    if (sp.bigLate && m.strength !== 'strong') {
      const end = m.strength === 'none' ? 'Твои карты не дали даже пары — сброс.' : 'С одной парой — сброс.';
      L.push(sp.villain.revealed ? `Соперник «${sp.villain.styleName}»: крупный рейз на поздней улице от такого соперника — почти всегда натс. ${end}`
        : `Этот соперник редко ставит крупно: крупный рейз на поздней улице от такого соперника — почти всегда натс. ${end}`);
      return L;
    }
    const eq = sp.estEq * 100, ok = eq >= N, close = isClose(sp);
    const p = (x) => (close ? U.pctNum(x, 1) : pctR(x));
    if (m.strength === 'none') {
      L.push(`Против рук, с которыми ${rangeOf(sp)}, у тебя примерно ${pctR(eq)} эквити — нужно ${pctR(N)}.`);
      L.push(v.call === OK ? `Без своей пары колл — это ловля блефа: ${sp.villain.revealed ? `соперник «${sp.villain.styleName}» часто блефует` : 'ставка небольшая'}, поэтому колл допустим, но сброс надёжнее.`
        : 'Без своей пары колл — это ловля блефа: против крупной ставки сброс надёжнее, ошибкой он не будет никогда.');
    } else {
      L.push(`Против рук, с которыми ${rangeOf(sp)}, у тебя примерно ${p(eq)} эквити — нужно ${p(N)}. ` +
        (close ? `Это почти на грани: ${ok ? 'колл чуть выгоднее, сброс тоже допустим' : 'сброс чуть выгоднее, колл тоже допустим'}.` : ok ? 'Колл окупается.' : 'Колл невыгоден — сбрасывай.'));
      if (ok && !close && v.fold === OK) L.push('Сброс тоже допустим: со слабой парой против крупной ставки соперника, о котором ты мало знаешь, легко оказаться позади.');
    }
    if (sp.drawToo) L.push(`По правилу 2 и 4 одни улучшения (${outsW(o)}) дают ${E}%, но ты и так часто впереди: оценка вместе с готовой рукой — ${pctR(eq)}. Решение принимаем по ней.`);
    if (sp.best === 'raise') L.push('Колл тоже хорош, но рейз заберёт больше: заплатят руки хуже твоей.');
    else if (v.raise === B || v.raise === OK) L.push('Рука сильная — повысить за ценностью тоже хорошо.');
    else if (t === 'raise' && ok) {
      const bar = raiseBar(sp), fair = 100 / (sp.nOpp + 1);
      L.push(`Рейз за ценностью нужен, когда ты заметно впереди: ${sp.multiway ? `против ${U.nplural(sp.nOpp, 'соперника', 'соперников', 'соперников')} честная доля — ${pctR(fair)}, ` : ''}` +
        `рейз окупается примерно от ${pctR(bar.ok * 100)}, а у тебя ${pctR(eq)}. На рейз заплатят в основном руки сильнее твоей, а слабые сбросят — колл выгоднее.`);
    } else if (t === 'raise' && !b) L.push('Рейз с рукой, которой не хватает даже на колл, только теряет фишки.');
    if (b && t !== 'raise' && v.raise !== M) L.push(bluffLine(sp, b));
    return L;
  }

  // ---------- bet / raise size ----------
  // Value 1/2–3/4 pot (bigger vs a sticky opponent or with a strong hand, thin value smaller, multiway ≥ 1/2),
  // semi-bluff bets 0.4–0.8, raises ~3× the bet (+1× per extra opponent); all-in is fine when the stack is ≤ the pot.
  // Bluffs: the size is already graded by the fold probability — the line only points to the cheapest good size.
  function raisePlan(sp) {
    const maxTo = sp.myBet + sp.stack, fr = fracRu(sp);
    let lo, hi, ideal, what;
    if (sp.facing) {
      const k = sp.callers || 0;
      [lo, hi, ideal] = [(2.3 + k) * sp.betTo, (4 + k) * sp.betTo, nice((3 + k) * sp.betTo, sp.bb)];
      what = (x) => (x >= maxTo ? 'олл-ин' : `${U.dec(x / sp.betTo, 1)}× ставки`);
    } else {
      const st = sp.made.strength, sticky = ['station', 'maniac'].includes(sp.villain.base);
      let [l, h] = sp.kind === 'draw' ? [0.4, 0.8] : st === 'strong' ? [0.5, sticky ? 1.5 : 1.2] : [0.33, sticky ? 1 : 0.8];
      if (sp.multiway) l = Math.max(l, 0.5);
      [lo, hi, ideal] = [sp.myBet + l * sp.pot, sp.myBet + h * sp.pot, sp.myBet + nice((2 * sp.pot) / 3, sp.bb)];
      what = (x) => (x >= maxTo ? 'олл-ин' : fr(x - sp.myBet));
    }
    if (sp.stack <= sp.pot || ideal >= maxTo) hi = ideal = maxTo; // tiny SPR: all-in is the size
    lo = Math.min(Math.max(lo, sp.facing ? sp.minTo : 0), maxTo);
    return { lo, hi, ideal: Math.max(ideal, Math.min(sp.facing ? sp.minTo : 0, maxTo)), maxTo, what };
  }
  const fracRu = (sp) => (x) => { const f = x / sp.pot; return f > 1.2 ? `${U.dec(f, 1)} банка` : f >= 0.83 ? 'весь банк' : `${f < 0.29 ? '1/4' : f < 0.42 ? '1/3' : f < 0.58 ? '1/2' : f < 0.71 ? '2/3' : '3/4'} банка`; };
  function sizeNote(sp, raw, b) {
    const maxTo = sp.myBet + sp.stack, to = Math.min(Math.max(raw, sp.facing ? sp.minTo : 1), maxTo), add = to - sp.myBet;
    const fr = fracRu(sp);
    if (sp.kind === 'nodraw' && sp.bluff && b) {
      return b.margin >= sp.bluff.margin - 0.05 || b.to === sp.bluff.to ? { far: false, line: `Размер ✅: ${U.fmt(add)} (${fr(add)}).` }
        : { far: false, line: `Размер: ${U.fmt(add)} — лучше ${U.fmt(sp.bluff.bet)} (${fr(sp.bluff.bet)}): выгоднее при тех же сбросах.` };
    }
    const { lo, hi, ideal, what } = raisePlan(sp);
    if (to >= lo - 0.5 && to <= hi + 0.5) return { far: false, line: `Размер ✅: ${sp.facing ? 'до ' + U.fmt(to) : U.fmt(add)} (${what(to)}).` };
    const big = to > hi, ia = ideal - sp.myBet;
    return { far: add > 2 * ia || add < ia / 2,
      line: `Размер: ${sp.facing ? 'рейз до ' + U.fmt(to) : 'ставка ' + U.fmt(add)} — ${big ? 'много, хватит' : 'мало, лучше'} ${sp.facing ? U.fmt(ideal) : U.fmt(ia)} (${what(ideal)}).` };
  }

  function evaluateAction(spot, action) {
    if (!spot) return null;
    const sp = spot;
    let t = typeof action === 'string' ? action : action && action.type;
    if (t === 'bet' || t === 'allin') t = 'raise';
    if (t === 'call' && !sp.facing) t = 'check';
    if (t === 'check' && sp.facing) t = 'call';
    let vd = sp.verdicts[t] || M, b = sp.bluff;
    // a bluff is judged at the size actually chosen
    const raw = action && typeof action === 'object' ? (action.type === 'allin' ? Infinity : +action.to) : NaN;
    if (t === 'raise' && b && vd !== M && raw > 0) {
      const to = Math.min(Math.max(raw, sp.facing ? sp.minTo : 0), sp.myBet + sp.stack);
      if (to !== b.to) { b = bluffAt(sp, to); vd = bluffVd(b.margin); }
    } else if (t === 'raise' && b && raw > 0) {
      const to = Math.min(Math.max(raw, sp.facing ? sp.minTo : 0), sp.myBet + sp.stack);
      if (to !== b.to) b = bluffAt(sp, to);
    }
    const size = t === 'raise' && vd !== M && raw > 0 ? sizeNote(sp, raw, b) : null;
    const verdict = vd === B && !(size && size.far) ? 'correct' : vd !== M ? 'acceptable' : 'mistake';
    const alts = Object.keys(sp.verdicts).filter((a) => a !== sp.best && sp.verdicts[a] === B);
    const name = (a) => nounOf(sp, a) + (a === 'raise' && sp.bluff && sp.kind === 'nodraw' ? ` ${sp.facing ? 'до ' : ''}${U.fmt(sp.facing ? sp.bluff.to : sp.bluff.bet)}` : '');
    const right = name(sp.best) + (alts.length ? ` (или ${alts.map(name).join(', ')})` : '');
    const title = verdict === 'correct' ? `✅ Действие: ${nounOf(sp, t)} — верно.`
      : verdict === 'acceptable' ? (vd === B ? `⚠️ Действие: ${nounOf(sp, t)} — верно, но размер неудачный.` : `⚠️ Действие: ${nounOf(sp, t)} — допустимо, но лучше ${t === sp.best ? name(t) : right}.`)
      : `❌ Действие: ты ${pastOf(sp, t)}, правильно — ${right}.`;
    const lines = actionLines(sp, t, sp.kind === 'nodraw' ? b : null);
    if (size) lines.splice(1, 0, size.line);
    return fb('action', verdict, title, lines);
  }

  // ---------- after the hand: real equity vs the actual cards ----------
  function realEquity(spot, hand) {
    if (!spot || !hand || !(spot.questions || []).includes('outs')) return null;
    if (!spot.opps.every((o) => hand.hole[o.seat])) return null;
    const opp = spot.opps.map((o) => hand.hole[o.seat]), hands = [spot.hole, ...opp];
    const real = Equity.calc(hands, spot.board, { toCome: spot.cardsToSee }).eq[0] * 100, rule = spot.ruleEq;
    const vs = joinRu(spot.opps.map((o, i) => `${cardsTight(opp[i])} (${o.name})`)), many = opp.length > 1;
    const d = real - rule;
    let why, detail = null;
    const sc = (h, c = []) => HandEval.score([...h, ...spot.board, ...c]);
    if (Math.abs(d) < 3) why = `Правило 2 и 4 работает: разница всего ${U.dec(Math.abs(d), 1)} п.п.`;
    else if (d > 0 && opp.every((h) => sc(spot.hole) > sc(h))) why = 'Реально больше: ты выигрываешь и без попадания — сейчас твоя рука сильнее.';
    else if (d > 0) { // behind now: uncounted cards (dirty outs, overcards …) win as well
      const counted = new Set([...(spot.multiway ? spot.outs.cleanList : spot.outs.list), ...spot.outs.overList]), seen = new Set([...spot.hole, ...spot.board, ...opp.flat()]);
      const extra = spot.cardsToSee === 1 ? Cards.deck().filter((c) => !seen.has(c) && !counted.has(c) && opp.every((h) => sc(spot.hole, [c]) > sc(h, [c]))) : [];
      why = 'Реально больше: против этих рук выигрывают и карты, которые не вошли в подсчёт.';
      if (extra.length) detail = `Эти карты: ${extra.map(Cards.str).join(', ')}.`;
    } else {
      const parts = [], rival = many ? 'соперников' : 'соперника', strs = (cs) => cs.map(Cards.str).join(', ');
      if (spot.cardsToSee === 1) {
        const held = new Set(opp.flat()), mine = [...(spot.multiway ? spot.outs.cleanList : spot.outs.list), ...spot.outs.overList];
        const nowBest = Math.max(...opp.map((h) => sc(h))), bestWith = (c) => Math.max(...opp.map((h) => sc(h, [c])));
        const blocked = [], ahead = [], split = [], lost = [];
        for (const c of mine) {
          if (held.has(c)) { blocked.push(c); continue; }
          const me = sc(spot.hole, [c]), them = bestWith(c);
          if (me > them) continue;
          (me === them ? split : nowBest >= me ? ahead : lost).push(c);
        }
        if (blocked.length) parts.push(`${strs(blocked)} — у ${rival} на руках`);
        if (ahead.length || split.length) {
          const made = lowerFirst(HandEval.describe(nowBest));
          parts.push(`у ${many ? 'одного из соперников' : 'соперника'} уже ${made}` +
            (ahead.length ? ` — с ${strs(ahead)} ты всё равно проигрываешь` : '') + (split.length ? `${ahead.length ? ', а' : ' —'} с ${strs(split)} только делишь банк` : ''));
        }
        if (lost.length) parts.push(`${strs(lost)} не ${lost.length > 1 ? 'спасают' : 'спасает'}: с ${lost.length > 1 ? 'ними' : 'ней'} у ${many ? 'кого-то из соперников' : 'соперника'} рука становится сильнее твоей`);
      }
      if (parts.length) detail = cap(`${parts.join('; ')}.`);
      why = parts.length ? 'Реально меньше: часть аутов не работает.'
        : many ? 'Реально меньше: кто-то из соперников уже впереди, и часть твоих аутов не помогает против их рук.'
        : 'Реально меньше: соперник уже впереди, и часть твоих аутов не помогает против его руки.';
    }
    return { kind: 'realEquity', verdict: 'info', ok: true, title: `ℹ️ ${cap(STREET_RU[spot.street] || 'флоп')}: по правилу ${rule}%. Реально против ${vs}: ${U.pctNum(real, 1)}.`,
      ...pack([why, detail]) };
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
    const { truth, alt } = readTruth(hand.hole[e.seat], hand.board);
    return { bettor: e.seat, truth, alt, sizeFrac, street: hand.street,
      board: hand.board.slice(), allIn: !!e.allIn, entry: e.i, options: READ_OPTIONS };
  }
  // The read is graded in the coach's own vocabulary (madeInfo / computeOuts), not by the bots' betting classes:
  // set, two pair with hole cards, straight+ = strong; top pair / overpair = medium; any draw = draw; else bluff.
  // `alt` is the neighbouring answer that is accepted as ⚠️.
  function readTruth(hole, board) {
    const m = madeInfo(hole, board);
    const draw = board.length < 5 && computeOuts(hole, board).draws.some((d) => DRAW_RU[d.type]);
    if (m.strength === 'strong' || m.strength === 'medium') return { truth: m.strength, alt: m.strength === 'medium' && draw ? 'draw' : null };
    if (draw) return { truth: 'draw', alt: null };
    return { truth: 'bluff', alt: m.strength === 'weak' ? 'medium' : null };
  }
  const ALT_RU = {
    bluff: 'Слабая пара против крупной ставки — по сути блеф. «Средняя» — близко.',
    draw: 'Здесь и пара, и дро — главное пара, но «дро» — близко.',
  };

  function holdingRu(hole, board) {
    const m = madeInfo(hole, board), r = R(hole[0]);
    let s = m.label === 'сет' ? 'сет ' + GP(r) : m.strength === 'none' && m.cat > CAT.HIGH ? `ничего, ${lowerFirst(m.name)} только на борде` : m.ru;
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
    if (h.hands < 12) return `Статистики у ${gen(p.name)} пока мало (${U.nplural(h.hands, 'раздача', 'раздачи', 'раздач')}) — опирайся на остальные признаки.`;
    // absolute PFR bars from the SPEC style table (rock 8, reg 15–18, station 5, maniac 30): a ratio cannot tell a rock from a reg
    const vpip = h.vpip / h.hands, pfr = h.pfr / h.hands, loose = vpip >= 0.3, aggr = pfr >= (loose ? 0.18 : 0.12);
    const desc = loose ? (aggr ? 'лузовый агрессивный игрок: часто ставит крупно с чем угодно' : 'лузовый пассивный игрок: играет много рук, но крупно ставит в основном с силой')
      : aggr ? 'тайтовый агрессивный игрок: ставит и с сильными руками, и с дро, иногда блефует' : 'тайтовый пассивный игрок: крупно ставит почти только с сильной рукой';
    return `${p.name} играет ${pctR(vpip * 100)} раздач и повышает префлоп в ${pctR(pfr * 100)} раздач — по первым ${h.hands} раздачам похоже, это ${desc}.`;
  }

  function readReview(read, answer, hand, table, extras = {}) {
    if (!read || !hand || !table) return null;
    const p = table.players[read.bettor], hole = hand.hole[read.bettor];
    if (!p || !hole) return null;
    const ok = answer === read.truth, near = !ok && !!read.alt && answer === read.alt, lab = (READ_OPTIONS.find((o) => o.v === answer) || {}).label;
    const lines = ['Признаки:', playerTypeRu(p)];
    const pos = hand.pos[read.bettor];
    if (pos) {
      lines.push(`Позиция: ${pos}${['CO', 'BTN'].includes(pos) ? ' — из поздней позиции чаще ставят широким диапазоном, в том числе блефуют.'
        : ['UTG', 'UTG+1'].includes(pos) ? ' — из ранней позиции обычно играют сильные руки.'
        : ['MP', 'LJ', 'HJ'].includes(pos) ? ' — из средней позиции играют чуть шире, чем из ранней, но всё ещё довольно сильные руки.'
        : ['SB', 'BB'].includes(pos) ? ' — с блайнда в игру входят очень разными руками, позиция здесь мало что подсказывает.' : '.'}`);
    }
    const pre = preflopRu(hand, read.bettor);
    if (pre) lines.push(pre);
    const k = read.sizeFrac < 10 ? Math.round(read.sizeFrac * 10) / 10 : Math.round(read.sizeFrac);
    const size = read.sizeFrac >= 2 ? `в ${U.dec(k, 1)} ${k % 1 ? 'раза' : U.plural(k, 'раз', 'раза', 'раз')} больше банка` : `${pctR(read.sizeFrac * 100)} банка`;
    lines.push(`Размер ставки: ${size}${read.allIn ? ' (олл-ин)' : ''} — крупно: так ставят с очень сильной рукой или с блефом, средние руки обычно ставят меньше.`);
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
      for (const r of seen) {
        lines.push(`Телл: ${p.name} ${r.text}${r.meaning ? ` — ${r.meaning}` : ''}${r.acting ? ' (на деле это был спектакль: показанное было обратным)'
          : r.random ? ' (на деле эта реакция была случайной — теллы надёжны не на 100%)' : ''}.`);
      }
      if (seen.length && seen.every((r) => r.random)) lines.push(`Реакции ${gen(p.name)} не совпадали с картами — на теллы этого игрока лучше не опираться.`);
    }
    const truth = `На самом деле у ${gen(p.name)}: ${cardsTight(hole)} — ${holdingRu(hole, read.board || hand.board)} (${TRUTH_RU[read.truth]}).`;
    const top = [truth, near ? ALT_RU[read.truth] : null].filter(Boolean), out = (v, title) => ({ ...fb('read', v, title, top), more: [...(pack(top).more || []), ...lines] });
    if (near) return out('acceptable', `⚠️ Чтение соперника: «${lab}» — близко, точнее — ${TRUTH_RU[read.truth]}.`);
    return out(ok ? 'correct' : M, ok ? `✅ Чтение соперника: верно — ${TRUTH_RU[read.truth]}.`
      : lab ? `❌ Чтение соперника: ты выбрал «${lab}», а на самом деле — ${TRUTH_RU[read.truth]}.` : `❌ Чтение соперника: на самом деле — ${TRUTH_RU[read.truth]}.`);
  }

  // ---------- tells: the reaction the player missed while looking at the board ----------
  function lookHint(missed, table, street) {
    const honest = (missed || []).filter((r) => r && !r.acting && !r.random && r.truth !== 'neutral' && table.players[r.seat]);
    const r = honest.find((x) => x.shown === 'strength') || honest[0];
    if (!r) return null;
    const st = STREET_RU[street] || 'флоп';
    const meaning = String(r.meaning || '').replace(/флоп/g, st);
    return fb('tells', M, `❌ Теллы: ты смотрел на борд, когда открывался ${st}.`,
      [`Ты пропустил: ${table.players[r.seat].name} ${r.text}.`, `${meaning ? cap(meaning) + '. ' : ''}Смотри на соперников — борд никуда не денется.`]);
  }

  // ---------- tells quiz: what does this reaction mean? ----------
  const HONEST = 'Надёжно у Камня (едва заметно) и Коллинг-станции (явно); у Маньяка — шум.';
  const ACTED = 'Так играет Актёр (иногда Регуляр): читай наоборот.';
  const TELLS_GUIDE = [
    { anim: 'glance', sign: 'Быстрый взгляд на свои фишки', meaning: 'Сила: карта попала, думает о ставке', reliability: HONEST },
    { anim: 'freeze', sign: 'Замирает, задерживает дыхание', meaning: 'Сила: боится спугнуть', reliability: HONEST },
    { anim: 'quiet', sign: 'Резко замолкает', meaning: 'Сила: сосредоточился на сильной руке', reliability: HONEST },
    { anim: 'tremble', sign: 'Руки дрожат при ставке', meaning: 'Очень сильная рука: так волнуются, а не блефуют', reliability: HONEST },
    { anim: 'lookaway', sign: 'Безразлично смотрит в сторону', meaning: 'Слабость: карта не помогла', reliability: HONEST },
    { anim: 'chatter', sign: 'Начинает болтать', meaning: 'Слабость: рука не интересна', reliability: HONEST },
    { anim: 'shrug', sign: 'Пожимает плечами', meaning: 'Слабость: промах', reliability: HONEST },
    { anim: 'sigh', sign: 'Демонстративно вздыхает: «ну и флоп…»', meaning: 'Актёрство: показная слабость — обычно сила', reliability: ACTED },
    { anim: 'smile', sign: 'Показно улыбается, уверенно смотрит', meaning: 'Актёрство: показная сила — часто блеф', reliability: ACTED },
    { anim: 'toss', sign: 'С вызовом бросает фишки', meaning: 'Актёрство: показная уверенность — часто блеф', reliability: ACTED },
  ];
  const TELL_OPTIONS = [{ v: 'strength', label: 'Сила (рука попала)' }, { v: 'weakness', label: 'Слабость (не попал)' },
    { v: 'acting', label: 'Актёрство (показуха — наоборот)' }, { v: 'nothing', label: 'Ничего не значит' }];
  const TELL_RU = { strength: 'сила', weakness: 'слабость', acting: 'актёрство', nothing: 'ничего не значит' };
  const STYLE_TELLS = { rock: 'теллы честные, но едва заметные', station: 'теллы честные и явные', reg: 'теллов почти нет, иногда актёрство',
    maniac: 'реакции хаотичные — не опирайся на них', actor: 'реакции обратные: слабость = сила' };
  function tellQuestion(reaction, table) {
    const p = reaction && table && table.players[reaction.seat];
    if (!p || !reaction.text) return null;
    return { id: 'tell', type: 'choice', prompt: `Что значит: ${p.name} ${reaction.text}?`, options: TELL_OPTIONS, reaction,
      hint: 'Сила: взгляд на фишки, замер, молчание. Слабость: взгляд в сторону, болтовня, пожимание плечами. Показуха (вздох, улыбка, бросок фишек) — наоборот.' };
  }
  // honest → its face value; acting → «актёрство»; random noise → «ничего» or the face value.
  function tellReview(reaction, answer, hand, table) {
    const r = reaction, p = r && table && table.players[r.seat];
    if (!p) return null;
    const face = r.shown === 'strength' ? 'strength' : 'weakness', want = r.acting ? 'acting' : r.random ? 'nothing' : face;
    const ok = answer === want || (r.random && answer === face);
    const hole = hand && hand.hole && hand.hole[r.seat];
    const had = r.truth === 'strong' ? 'сильная рука — карта помогла' : r.truth === 'weak' ? 'слабая рука — карта не помогла' : 'карта ничего не изменила';
    const nature = r.acting ? `Это актёрство: ${r.shown === 'strength' ? 'показная сила прикрывала слабость' : 'показная слабость прикрывала силу'}.`
      : r.random ? 'Реакция случайная — шум: теллы надёжны не на 100%.' : `Реакция честная: ${face === 'strength' ? 'сила' : 'слабость'} настоящая.`;
    const guide = TELLS_GUIDE.find((g) => g.anim === r.anim), base = baseOf(p);
    const style = p.revealed ? `${p.name} («${styleName(p)}»): ${STYLE_TELLS[p.style] || STYLE_TELLS[base] || ''}.`
      : `Стиль ${gen(p.name)} пока скрыт — проверяй, совпадают ли его реакции с картами.`;
    const title = ok ? `✅ Телл: верно — ${TELL_RU[answer]}.` : `❌ Телл: ${answer ? `«${TELL_RU[answer] || answer}»` : 'нет ответа'} → на деле ${TELL_RU[want]}.`;
    return { ...fb('tells', ok ? 'correct' : M, title, [nature, `У ${gen(p.name)}${hole ? ` ${cardsTight(hole)}` : ''}: ${had}.`]),
      more: [guide ? `${guide.sign} — ${lowerFirst(guide.meaning)}. ${guide.reliability}` : null, style].filter(Boolean) };
  }

  // ---------- teacher: the best action before the hero acts ----------
  const BEATS = { 'топ-пара': 'две пары, сеты и топ-пара с кикером старше', 'оверпара': 'сеты и две пары', 'слабая пара': 'любая пара старше', 'ничего': 'любая пара' };
  const beatsOf = (m) => (m.strength === 'strong' ? 'только более сильные комбинации — это редкость' : BEATS[m.label] || 'любая пара');
  function advise(spot) {
    if (!spot) return null;
    const sp = spot, best = sp.best, act = best === 'raise' ? (sp.facing ? 'raise' : 'bet') : best;
    let size;
    if (best === 'raise') {
      size = sp.bluff && sp.kind === 'nodraw' ? sp.bluff.to
        : raisePlan(sp).ideal;
    }
    const ev = evaluateAction(sp, { type: act, to: size });
    const all = [...ev.lines, ...(ev.more || [])];
    const risk = size ? size - sp.myBet : act === 'call' ? sp.toCall : 0, share = `${pctR((100 * risk) / Math.max(1, sp.stack + sp.myBet))} стека`;
    const bluff = sp.kind === 'nodraw' && sp.bluff;
    const sd = act === 'call' && isDrawSpot(sp) && showdownCall(sp); // the call is for the made hand, not the draw
    const riskLine = act === 'fold' ? 'Сброс: больше ничего не теряешь.' : act === 'check' ? 'Чек бесплатный — ничем не рискуешь.'
      : act === 'call' && sp.kind === 'draw' && !sd ? `Риск: ${U.fmt(risk)} (${share}); попадёшь в ~${sp.ruleEq}%${sp.implied ? `, тогда доплатят ~${U.fmt(sp.implied.future)}` : ''}.`
      : act === 'call' ? `Риск: ${U.fmt(risk)} (${share}). Бьют тебя: ${beatsOf(sp.made)}.`
      : bluff ? `Риск: ${U.fmt(risk)} (${share}) — заплатят в ~${pctR((1 - sp.bluff.fp) * 100)} случаев.`
      : sp.kind === 'draw' ? `Риск: ${U.fmt(risk)} (${share}); заплатят — у тебя ещё ~${sp.ruleEq}% на дро.`
      : `Риск: ${U.fmt(risk)} (${share}). Бьют тебя: ${beatsOf(sp.made)}.`;
    const NOUN = { fold: 'сброс', check: 'чек', call: 'колл', bet: 'ставка', raise: 'рейз' };
    const alt = Object.keys(sp.verdicts).filter((a) => a !== best && sp.verdicts[a] !== M);
    const altLine = alt.length ? `${cap(alt.map((a) => nounOf(sp, a)).join(' или '))} тоже нормально.` : null;
    return { best: act, size, title: `👨‍🏫 Лучше: ${NOUN[act]}${size ? (act === 'raise' ? ' до ' : ' ') + U.fmt(size) : ''}`,
      lines: [sd ? `Готовая рука (${sp.made.label}): эквити ~${pctR(sp.estEq * 100)} ≥ ${showNeed(sp)} — колл окупается.` : all.find((l) => l.length <= MAXLEN && !/^Никогда не сбрасывай/.test(l)) || all[0], riskLine, altLine].filter(Boolean), more: all.slice(1) };
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

  return { analyze, questions, afterActionQuestions, check, evaluateAction, advise, foldProb, realEquity, readQuestion, readReview, lookHint,
    tellQuestion, tellReview, TELLS_GUIDE, timing, heroStrong, computeOuts, madeInfo };
})();
