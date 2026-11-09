// ===== Bots: styles, names/avatars, decisions (preflop tables + postflop policies), tells =====
const Bots = (() => {
  const STYLE_IDS = ['rock', 'station', 'reg', 'maniac', 'actor'];
  const BASE_STYLES = ['rock', 'station', 'reg', 'maniac'];
  const STYLES = {
    rock: {
      id: 'rock', name: 'Камень', type: 'тайтовый пассивный', vpip: '12–15%', pfr: '8%', postflop: 'Низкая',
      foldToBet: 'Высокий', bluff: 'Почти нет', tells: 'Честные, слабые', foldEquity: 'high',
      desc: 'Играет мало рук и почти не блефует: его ставка или рейз обычно означают сильную руку. Отбирай у него блайнды, а на его крупные ставки сбрасывай всё, кроме очень сильных рук.',
    },
    station: {
      id: 'station', name: 'Коллинг-станция', type: 'лузовый пассивный', vpip: '45–55%', pfr: '5%', postflop: 'Очень низкая',
      foldToBet: 'Очень низкий', bluff: 'Нет', tells: 'Честные, явные', foldEquity: 'none',
      desc: 'Входит в банк с чем попало и платит почти до вскрытия, но сам ставит редко. Не блефуй против него — просто ставь с хорошими руками, он заплатит; его крупный рейз на тёрне или ривере — почти всегда натс.',
    },
    reg: {
      id: 'reg', name: 'Регуляр', type: 'тайтовый агрессивный', vpip: '18–22%', pfr: '15–18%', postflop: 'Высокая',
      foldToBet: 'Средний', bluff: 'Умеренный', tells: 'Почти нет, иногда актёрство', foldEquity: 'medium',
      desc: 'Играет по таблицам: входит в игру рейзом, на флопе продолжает ставкой в 1/2–3/4 банка и иногда блефует. Не плати его крупные ставки средними руками и не пытайся перехитрить его без сильной руки.',
    },
    maniac: {
      id: 'maniac', name: 'Маньяк', type: 'лузовый агрессивный', vpip: '40–50%', pfr: '30%', postflop: 'Очень высокая',
      foldToBet: 'Низкий', bluff: 'Частый', tells: 'Хаотичные', foldEquity: 'low',
      desc: 'Ставит и рейзит почти постоянно, часто идёт олл-ин и много блефует. Не блефуй против него: дай ему ставить самому и плати с хорошими руками.',
    },
    actor: {
      id: 'actor', name: 'Актёр', type: 'любой базовый стиль + актёрство', vpip: 'как базовый', pfr: 'как базовый',
      postflop: 'как базовый', foldToBet: 'как базовый', bluff: 'как базовый', tells: 'Обратные: слабость = сила',
      foldEquity: 'как базовый стиль',
      desc: 'Играет как один из четырёх стилей, но разыгрывает спектакль: вздыхает с сильной рукой и изображает уверенность при блефе. Читай его теллы наоборот.',
    },
  };

  // ---------- names, avatars, lineups ----------
  const NAMES = ['Игорь', 'Олег', 'Марина', 'Светлана', 'Дмитрий', 'Анна', 'Сергей', 'Наталья', 'Артём', 'Ольга', 'Павел', 'Екатерина',
    'Виктор', 'Татьяна', 'Михаил', 'Ирина', 'Алексей', 'Елена', 'Николай', 'Юлия', 'Борис', 'Вера', 'Роман', 'Ксения'];
  // Distinct non-green hues; white initials (the UI's .av) keep ≥ 3.8:1 contrast on each.
  const COLORS = ['#d64545', '#c96a1c', '#a37812', '#a5714f', '#cc2f66', '#c2509d', '#9257d6', '#5765d6', '#2a7fd0', '#14869a', '#667c8e', '#a066ba'];
  const nameIdx = (name) => NAMES.indexOf(String(name).split(' ')[0]);
  const colorOf = (name) => COLORS[Math.max(0, nameIdx(name)) % COLORS.length];

  // Unused name, preferring a colour and initials nobody at the table has yet.
  function pickName(used = []) {
    const taken = new Set(used), ini = new Set(used.map((n) => String(n).slice(0, 2)));
    const cols = new Set(used.filter((n) => nameIdx(n) >= 0).map(colorOf));
    const free = NAMES.filter((n) => !taken.has(n));
    const pool = [free.filter((n) => !cols.has(colorOf(n)) && !ini.has(n.slice(0, 2))), free.filter((n) => !cols.has(colorOf(n))), free]
      .find((a) => a.length);
    if (pool) return U.pick(pool);
    const b = U.pick(NAMES);
    for (let k = 2; ; k++) if (!taken.has(`${b} ${k}`)) return `${b} ${k}`;
  }

  function createBot({ style, baseStyle, usedNames = [] } = {}) {
    if (!STYLE_IDS.includes(style)) style = U.pick(BASE_STYLES);
    const b = style !== 'actor' ? style : BASE_STYLES.includes(baseStyle) ? baseStyle : U.pick(BASE_STYLES);
    const name = pickName(usedNames);
    return { name, isHuman: false, style, baseStyle: b, avatar: { initials: name.slice(0, 2), color: colorOf(name) } };
  }

  // The first five seats get five different styles; extra seats lean to the common live-table types.
  const EXTRA = ['rock', 'station', 'reg', 'rock', 'station', 'reg', 'maniac', 'actor'];
  function randomLineup(n) {
    const out = U.shuffle(STYLE_IDS.slice()).slice(0, n);
    while (out.length < n) {
      const s = U.pick(EXTRA);
      if (s !== 'actor' || out.filter((x) => x === 'actor').length < 2) out.push(s);
    }
    return U.shuffle(out);
  }

  const base = (p) => (p && BASE_STYLES.includes(p.baseStyle) ? p.baseStyle : p && BASE_STYLES.includes(p.style) ? p.style : 'reg');
  const foldEquity = (p) => STYLES[base(p)].foldEquity;

  // ---------- hand analysis ----------
  // Number of score nibbles that define each category (the rest are kickers): pair → 1, two pair → 2, flush → 5 …
  const PRIMARY = [5, 1, 2, 1, 1, 5, 2, 1, 1];
  const key = (s) => s >> (4 * (5 - PRIMARY[s >> 20]));
  const maskOf = (cards) => cards.reduce((m, c) => m | (1 << Cards.rank(c)), 0);
  const suitMax = (cards) => Math.max(0, ...[0, 1, 2, 3].map((s) => cards.filter((c) => Cards.suit(c) === s).length));
  function runMax(cards) { // most distinct ranks inside one 5-rank window (straight potential)
    let m = maskOf(cards), best = 0;
    if (m & (1 << 14)) m |= 2;
    for (let lo = 1; lo <= 10; lo++) {
      let k = 0;
      for (let r = lo; r < lo + 5; r++) if (m & (1 << r)) k++;
      best = Math.max(best, k);
    }
    return best;
  }
  // New board cards bring an overcard (> over), a third/fourth card of a suit or a more connected board.
  const scaryBoard = (prev, board, over) => board.slice(prev.length).some((c) => Cards.rank(c) > over)
    || (suitMax(board) >= 3 && suitMax(board) > suitMax(prev)) || (runMax(board) >= 3 && runMax(board) > runMax(prev));

  // → { cls, made, cat, fd, sOuts (ranks completing a straight), outs, pair, pairRank, topPair (top pair or overpair),
  //     aceHigh, over (two overcards) }
  function analyze(hole, board) {
    const s = HandEval.score(hole.concat(board)), cat = s >> 20;
    const [h1, h2] = hole.map(Cards.rank);
    const br = [...new Set(board.map(Cards.rank))].sort((a, b) => b - a);
    let made = 'none', pairRank = 0;
    if (cat > 0 && key(s) !== key(HandEval.score(board))) { // the hole cards change the made hand, not just kickers
      const p1 = (s >> 16) & 15, p2 = (s >> 12) & 15, mine = (r) => r === h1 || r === h2;
      if (cat >= 3 || (cat === 2 && h1 !== h2 && mine(p1) && mine(p2))) made = 'strong';
      else if (h1 === h2) { // an underpair ranks like a board pair: under the second board card = weak
        pairRank = h1;
        made = h1 > br[0] ? (h1 >= 12 ? 'strong' : 'medium') : h1 > (br[1] || 0) ? 'medium' : 'weak';
      } else {
        pairRank = Math.max(...[h1, h2].filter((r) => br.includes(r)));
        const kicker = pairRank === h1 ? h2 : h1;
        made = pairRank === br[0] ? (kicker >= 13 ? 'strong' : 'medium') : pairRank === br[1] ? 'medium' : 'weak';
      }
    }
    let fd = false, sOuts = 0;
    if (board.length < 5) {
      const all = hole.concat(board);
      for (let su = 0; su < 4; su++) {
        if (all.filter((c) => Cards.suit(c) === su).length === 4 && hole.some((c) => Cards.suit(c) === su)) fd = true;
      }
      const mAll = maskOf(all), mB = maskOf(board), cur = HandEval.straightTop(mAll);
      for (let x = 2; x <= 14; x++) {
        if (mAll & (1 << x)) continue;
        const t = HandEval.straightTop(mAll | (1 << x));
        if (t > cur && t > HandEval.straightTop(mB | (1 << x))) sOuts++;
      }
    }
    const outs = (fd ? 9 : 0) + 4 * sOuts - (fd ? sOuts : 0);
    const cls = made === 'strong' || made === 'medium' ? made : board.length < 5 && (fd || sOuts >= 2) ? 'draw' : 'bluff';
    return { cls, made, cat, fd, sOuts, outs, pair: made !== 'none', pairRank, topPair: pairRank > 0 && pairRank >= br[0],
      aceHigh: made === 'none' && (h1 === 14 || h2 === 14), over: made === 'none' && Math.min(h1, h2) > br[0] };
  }

  function classifyHolding(hole, board) {
    if (board.length >= 3) return analyze(hole, board).cls;
    const t = Equity.holeTopPct(hole); // preflop fallback
    return t <= 0.025 ? 'strong' : t <= 0.1 || Cards.rank(hole[0]) === Cards.rank(hole[1]) ? 'medium' : 'bluff';
  }

  // Share of opponent holdings the current hand beats right now (exact, ties = ½).
  function handStrength(hole, board) {
    const me = HandEval.score(hole.concat(board)), used = new Set(hole.concat(board));
    const rest = Cards.deck().filter((c) => !used.has(c)), buf = [0, 0, ...board];
    let w = 0, n = 0;
    for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
      buf[0] = rest[i]; buf[1] = rest[j];
      const o = HandEval.score(buf);
      w += o < me ? 1 : o === me ? 0.5 : 0; n++;
    }
    return w / n;
  }

  // ---------- actions ----------
  const FOLD = { type: 'fold' }, CHECK = { type: 'check' }, CALL = { type: 'call' }, ALLIN = { type: 'raise', to: Infinity };
  const to = (x) => ({ type: 'raise', to: x });
  const potBet = (L, frac) => to(L.myBet + L.toCall + frac * (L.pot + L.toCall));
  const rnd = (a, b) => a + U.rng() * (b - a);

  // Intent → legal engine action: live-like round bets (multiples of 5, of 25 over 1000), never below minTo, no crumbs
  // left behind, no free folds.
  function legalize(a, L) {
    if (a.type === 'raise') {
      if (!L.canRaise) return L.toCall > 0 ? CALL : CHECK;
      const step = Math.max(a.to, L.minTo) > 1000 ? 25 : 5;
      let t = Math.round(a.to / step) * step;
      if (t < L.minTo) t = Math.ceil(L.minTo / step) * step;
      if (t >= L.maxTo || L.maxTo - t < 0.3 * (L.pot + 2 * t - L.myBet - L.currentBet)) t = L.maxTo;
      return { type: 'raise', to: t };
    }
    if (a.type === 'call') return L.toCall > 0 ? CALL : CHECK;
    return L.canCheck ? CHECK : FOLD;
  }

  // ---------- preflop ----------
  const RG = (s) => Cards.parseRange(s);
  const OPEN = { // ТЗ 6.1 (the reg plays these exactly); SB and BB use the CO range
    UTG: RG('77+, AJs+, AQo+, KQs'),
    MP: RG('55+, ATs+, AJo+, KJs+, QJs, JTs, KQo'),
    HJ: RG('22+, A9s+, ATo+, KTs+, QTs+, JTs, T9s, KJo+'),
    CO: RG('22+, A2s+, A9o+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, KTo+, QTo+, JTo'),
    BTN: RG('22+, A2s+, A7o+, K7s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, K9o+, Q9o+, J9o+, T9o'),
  };
  OPEN['UTG+1'] = OPEN.UTG; OPEN.LJ = OPEN.MP; OPEN.SB = OPEN.BB = OPEN.CO;
  // One step below each range component (66 for 77+, ATs for AJs+): ТЗ 6.3 counts these as "acceptable".
  const BORDER = {};
  for (const pos in OPEN) {
    BORDER[pos] = new Set(Cards.HAND_CODES.filter((c) => {
      if (OPEN[pos].has(c)) return false;
      const { hi, lo, type } = Cards.codeInfo(c), up = Cards.rankChar(lo + 1);
      return type === 'p' ? OPEN[pos].has(up + up) : lo + 1 < hi && OPEN[pos].has(c[0] + up + type);
    }));
  }
  const PREMIUM = RG('QQ+, AK');
  const REG_CALL = RG('JJ-22, AQs, AJs, KQs');
  const SMALL_PAIRS = RG('66-22');
  const CONNECTORS = RG('76s, 87s, 98s, T9s, JTs, QJs');
  const LIGHT_3B = RG('A5s-A2s, 65s, 76s, 87s, 98s, T9s');
  const ROCK_CALL = RG('JJ-99, AQ, AJs, ATs, KQ, KJs, QJs, JTs');
  const ROCK_4B = RG('KK+, AK');
  const PAIRS = RG('22+');
  // ponytail: per-position "top X% of hands" thresholds (Equity.holeTopPct), calibrated with tools/sim-bots.js on
  // random all-bot lineups; re-run it after changing any number here.
  // The rock opens the ТЗ 6.1 table cut to its top X% (always a subset: "Камень — уже").
  const ROCK_OPEN = { UTG: 0.08, 'UTG+1': 0.08, MP: 0.08, LJ: 0.08, HJ: 0.12, CO: 0.15, BTN: 0.2, SB: 0.14 };
  const REG_ISO = { 'UTG+1': 0.14, MP: 0.2, LJ: 0.22, HJ: 0.26, CO: 0.33, BTN: 0.4, SB: 0.3 }; // tight early, wide late
  const SPECULATIVE = RG('22+, A2s+, 54s, 65s, 76s, 87s, 98s, T9s, JTs, QJs, KQs'); // over-limp material
  const STATION_LIMP = { UTG: 0.5, 'UTG+1': 0.5, MP: 0.55, LJ: 0.55, HJ: 0.6, CO: 0.65, BTN: 0.7, SB: 0.75 };
  const MANIAC_OPEN = { UTG: 0.45, 'UTG+1': 0.45, MP: 0.45, LJ: 0.36, HJ: 0.38, CO: 0.43, BTN: 0.52, SB: 0.5, BB: 0.3 };
  const PUSH = { UTG: 0.1, 'UTG+1': 0.11, MP: 0.13, LJ: 0.15, HJ: 0.18, CO: 0.22, BTN: 0.3, SB: 0.35, BB: 0.3 };
  const WIDE_3B = RG('77+, A9+, A8s-A7s, KJ+, KTs, QJ, QTs, JTs, T9s');                // vs loose / steal raisers
  const WIDE_CALL = RG('66-22, A6s-A2s, K8s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, 54s, KTo+, QTo+, JTo');

  function preInfo(table, hand, seat, L) {
    const hole = hand.hole[seat], bb = hand.bb, pos = hand.pos[seat];
    const log = hand.log.filter((e) => e.street === 'preflop');
    const raises = log.filter((e) => e.type === 'raise' || e.type === 'bet');
    const last = raises[raises.length - 1];
    const firstI = raises.length ? log.indexOf(raises[0]) : log.length;
    const others = hand.seats.filter((s) => s !== seat && !hand.folded[s]);
    return {
      L, bb, pos, code: Cards.handCode(hole[0], hole[1]), top: Equity.holeTopPct(hole),
      nRaises: raises.length,
      limpers: log.slice(0, firstI).filter((e) => e.type === 'call').length,
      callers: last ? log.slice(log.indexOf(last) + 1).filter((e) => e.type === 'call').length : 0,
      raiseBB: hand.currentBet / bb,
      // a maniac or a steal from late position: worth 3-betting/calling lighter
      wide: !!last && (base(table.players[last.seat]) === 'maniac' || ['CO', 'BTN', 'SB'].includes(hand.pos[last.seat])),
      eff: Math.min(hand.startStacks[seat], Math.max(0, ...others.map((s) => hand.startStacks[s]))) / bb,
      shove: !!last && hand.allIn[last.seat],
      ip: last ? hand.seats.indexOf(seat) > hand.seats.indexOf(last.seat) : pos !== 'SB' && pos !== 'BB',
      late: pos === 'CO' || pos === 'BTN',
      allin: L.toCall >= 0.4 * L.stack || !L.canRaise, // calling is (nearly) a stack decision
    };
  }
  const reraise = (f, mult) => to(f.L.currentBet * (mult + f.callers));
  const odds = (L) => L.toCall / (L.pot + L.toCall);
  // Calling (nearly) all-in: the style's range `t`, a little wider when the price is good.
  const commit = (f, t) => (f.top <= t || f.top <= 2 * (0.4 - odds(f.L)) ? CALL : FOLD);
  // A short stack's shove: against such a wide range almost any hand calls at odds ≤ 0.25 and almost none
  // at ≥ 0.45 (k = how loosely the style calls).
  const cheapShove = (f, k) => f.shove && f.top <= k * 4 * (0.45 - odds(f.L));

  // Short stack (or only short opponents left): push or fold. k widens/narrows the position push ranges,
  // ck is the style's looseness when calling a cheap shove.
  function shortStack(f, k, ck) {
    const t = PUSH[f.pos] * k;
    if (f.nRaises === 0) return f.top <= t ? ALLIN : f.L.canCheck ? CHECK : FOLD;
    return f.top <= t / 3 || cheapShove(f, ck) ? ALLIN : FOLD;
  }

  const PRE = {
    reg(f) {
      const { L, code, pos, nRaises, bb, top } = f;
      if (f.eff <= 12) return shortStack(f, 1, 1);
      if (f.allin) return PREMIUM.has(code) ? CALL : commit(f, f.wide ? 0.05 : 0);
      if (nRaises === 0) {
        // ТЗ 6.1: BB raises a lone SB limp with the CO range; otherwise the position table exactly, behind limpers
        // too (raise to isolate), where speculative hands may over-limp in late position — as the coach teaches.
        if (L.canCheck) return (f.limpers <= 1 ? OPEN.BB.has(code) : top <= 0.12) ? to(bb * (3 + f.limpers)) : CHECK;
        const iso = f.limpers && top <= REG_ISO[pos]; // limpers are usually weak: isolate a bit wider than the table
        if (OPEN[pos].has(code) || (BORDER[pos].has(code) && U.chance(f.late || pos === 'SB' ? 1 : 0.5)) || iso) return to(bb * (2.5 + f.limpers));
        return f.limpers && (f.late || pos === 'SB') && SPECULATIVE.has(code) ? CALL : FOLD;
      }
      if (nRaises === 1) {
        // 3-bet: premiums; vs a loose raiser or with callers in between (squeeze) a wider value range; some light ones
        if (PREMIUM.has(code) || ((f.wide || f.callers) && WIDE_3B.has(code)) || (f.ip && LIGHT_3B.has(code) && U.chance(0.5))) return reraise(f, f.ip ? 3 : 3.5);
        if ((REG_CALL.has(code) && (!SMALL_PAIRS.has(code) || f.eff >= 20 * f.raiseBB)) || (f.late && CONNECTORS.has(code))) return CALL;
        if ((f.wide && WIDE_CALL.has(code)) || (pos === 'BB' && f.raiseBB <= 4 && top <= 0.3)) return CALL; // defend the BB
        return FOLD;
      }
      if (!PREMIUM.has(code)) return FOLD;
      if (code === 'AA' || code === 'KK') return nRaises === 2 ? reraise(f, 2.3) : ALLIN;
      return nRaises === 2 && U.chance(0.4) ? reraise(f, 2.3) : CALL;
    },
    rock(f) {
      const { L, code, pos, nRaises, top, bb } = f;
      if (f.eff <= 12) return shortStack(f, 0.6, 0.6);
      if (f.allin) return ROCK_4B.has(code) ? CALL : commit(f, 0);
      if (nRaises === 0) {
        if (L.canCheck) return top <= 0.05 ? to(bb * (3 + f.limpers)) : CHECK;
        if (OPEN[pos].has(code) && top <= ROCK_OPEN[pos]) return to(bb * (3 + f.limpers));
        // passive: over-limps hoping to hit, limps pairs for a cheap set
        if (f.limpers && top <= 0.2) return CALL;
        return PAIRS.has(code) || ((f.late || pos === 'SB') && top <= 0.22) ? CALL : FOLD;
      }
      if (nRaises === 1) {
        if (PREMIUM.has(code)) return reraise(f, 3);
        if (ROCK_CALL.has(code)) return CALL;
        if (PAIRS.has(code) && f.raiseBB <= 5 && f.eff >= 20 * f.raiseBB) return CALL; // set-mining
        if (pos === 'BB' && f.raiseBB <= 3 && top <= 0.2) return CALL; // defends the big blind passively
        return FOLD;
      }
      if (!ROCK_4B.has(code)) return FOLD;
      if (code === 'AA' || code === 'KK') return nRaises === 2 ? reraise(f, 2.3) : ALLIN;
      return CALL;
    },
    station(f) {
      const { L, code, pos, nRaises, top, bb } = f;
      // No push/fold when short: a station stays loose and passive at any depth (it just shoves its few raises).
      if (nRaises === 0) {
        if (top <= 0.08) return f.eff <= 10 ? ALLIN : to(bb * (3 + f.limpers));
        if (L.canCheck) return CHECK;
        return top <= STATION_LIMP[pos] ? CALL : FOLD;
      }
      if ((code === 'AA' || code === 'KK') && U.chance(0.6)) return f.allin ? ALLIN : reraise(f, 3);
      const t = (nRaises === 1 ? 0.5 : 0.12) * (f.raiseBB <= 5 ? 1 : f.raiseBB <= 10 ? 0.5 : f.raiseBB <= 25 ? 0.25 : 0.15);
      return top <= t || cheapShove(f, 1.6) ? CALL : FOLD;
    },
    maniac(f) {
      const { L, nRaises, top, bb, pos } = f;
      if (f.eff <= 15) return shortStack(f, 1.6, 1.3);
      if (f.allin) return commit(f, 0.12);
      const size = () => to(bb * (U.pick([3, 3.5, 4, 5]) + f.limpers));
      if (nRaises === 0) {
        if (L.canCheck) return top <= MANIAC_OPEN.BB && U.chance(0.7) ? size() : CHECK;
        if (top <= MANIAC_OPEN[pos]) return top <= 0.03 && U.chance(0.2) ? ALLIN : size();
        if (top <= MANIAC_OPEN[pos] + 0.12 || (pos === 'SB' && U.chance(0.5))) return CALL;
        return FOLD;
      }
      if (nRaises === 1) {
        if (top <= 0.18) return top <= 0.03 && U.chance(0.25) ? ALLIN : reraise(f, rnd(3, 4));
        return top <= 0.4 * (f.raiseBB <= 6 ? 1 : 0.5) ? CALL : FOLD;
      }
      if (top <= 0.05) return ALLIN;
      return top <= (nRaises === 2 ? 0.2 : 0.1) ? CALL : FOLD;
    },
  };

  // ---------- postflop ----------
  const memo = new WeakMap(); // hand → { 'seat:boardLen': { eq, hs } } (a bot may act several times per street)

  function postInfo(hand, seat, L, human) {
    const hole = hand.hole[seat], board = hand.board, a = analyze(hole, board);
    const opps = hand.seats.filter((s) => s !== seat && !hand.folded[s]);
    let m = memo.get(hand);
    if (!m) memo.set(hand, (m = {}));
    const k = seat + ':' + board.length;
    const e = m[k] || (m[k] = { eq: Equity.vsRandom(hole, board, opps.length, { iters: 300 }), hs: handStrength(hole, board) });
    const aggr = hand.log.filter((x) => x.street === hand.street && (x.type === 'bet' || x.type === 'raise'));
    const pre = hand.log.filter((x) => x.street === 'preflop' && x.type === 'raise');
    const live = hand.seats.filter((s) => !hand.folded[s] && !hand.allIn[s]);
    const prev = board.slice(0, board.length - 1);
    const bettor = aggr.length ? aggr[aggr.length - 1].seat : null;
    const la = human && human.lastAction;
    return {
      L, a, cls: a.cls, eq: e.eq, hs: e.hs, nuts: a.cls === 'strong' && e.hs >= 0.97,
      nOpp: opps.length, street: hand.street, river: board.length === 5,
      bf: L.toCall / Math.max(1, L.pot - L.toCall), odds: L.toCall / (L.pot + L.toCall),
      spr: L.stack / Math.max(1, L.pot),
      pfr: pre.length > 0 && pre[pre.length - 1].seat === seat,
      ip: live[live.length - 1] === seat,
      scary: board.length > 3 && scaryBoard(prev, board, Math.max(...prev.map(Cards.rank))),
      slow: !!(la && bettor === human.seat && la.street === hand.street && (la.type === 'bet' || la.type === 'raise')
        && la.thinkMs > (human.avgThinkMs || 0) + 2000),
    };
  }

  const POST = {
    rock(f) {
      const { L, cls, bf } = f;
      if (!L.toCall) {
        const p = { strong: 0.6, medium: f.nOpp === 1 ? 0.15 : 0.05, draw: 0.03, bluff: 0.02 }[cls];
        return U.chance(p) ? potBet(L, rnd(0.33, 0.5)) : CHECK;
      }
      if (f.nuts && L.canRaise) {
        if (f.street !== 'flop') return U.chance(0.6) ? potBet(L, rnd(0.8, 1.1)) : CALL; // big late raise = nuts
        return U.chance(0.35) ? potBet(L, 0.5) : CALL;
      }
      if (cls === 'strong') return bf > 1.2 && f.hs < 0.85 && U.chance(0.5) ? FOLD : CALL;
      if (cls === 'medium') { // a nit, not a fool: top pair / an overpair calls up to half pot; weaker pairs give up
        if (f.a.topPair && bf <= 0.5) return U.chance(f.nOpp > 1 ? 0.6 : 0.75) ? CALL : FOLD;
        return U.chance((bf <= 0.4 ? 0.6 : bf <= 0.75 ? 0.2 : 0.03) * (f.nOpp > 1 ? 0.6 : 1)) ? CALL : FOLD;
      }
      if (cls === 'draw') return bf <= 0.4 && f.eq >= f.odds ? CALL : FOLD;
      return FOLD;
    },
    station(f) {
      const { L, cls, bf, a } = f;
      if (!L.toCall) {
        const p = cls === 'strong' ? (f.nuts ? 0.45 : 0.3) : cls === 'medium' ? 0.08 : 0;
        return U.chance(p) ? potBet(L, rnd(0.3, 0.45)) : CHECK;
      }
      if (f.nuts && L.canRaise && U.chance(0.55)) return potBet(L, f.street === 'flop' ? 0.5 : rnd(1, 1.3)); // monsters: big later
      if (cls !== 'bluff' || a.pair || (a.sOuts === 1 && !f.river)) return CALL;
      if ((a.aceHigh || a.over) && bf <= 0.75) return U.chance(f.river ? 0.5 : 0.9) ? CALL : FOLD;
      // pure air: sticky on the flop, but big turn/river bets get through (none at all: a river bet of ¾ pot or more)
      if (f.street === 'flop') return U.chance(0.45) ? CALL : FOLD;
      return U.chance(f.river ? (bf < 0.75 ? 0.12 * (1 - bf) : 0) : 0.3 * Math.max(0, 1 - bf)) ? CALL : FOLD;
    },
    reg(f) {
      const { L, cls, bf, a, street } = f;
      const size = () => potBet(L, rnd(0.5, 0.75));
      if (!L.toCall) {
        if (street === 'flop' && f.pfr) { // continuation bet
          const p = { strong: 0.85, medium: 0.7, draw: 0.75, bluff: f.nOpp > 2 ? 0.3 : 0.6 }[cls];
          return U.chance(p) ? size() : CHECK;
        }
        if (cls === 'strong') return U.chance(0.8) ? (f.nuts && f.river ? potBet(L, rnd(0.75, 1)) : size()) : CHECK;
        if (cls === 'medium') return U.chance(f.river ? 0.25 : 0.35) ? potBet(L, 0.5) : CHECK;
        if (cls === 'draw') return U.chance(a.outs >= 12 ? 0.55 : 0.35) ? size() : CHECK;
        if (f.nOpp > 2) return CHECK;
        if (street === 'flop') return f.ip && f.nOpp === 1 && U.chance(0.25) ? potBet(L, 0.5) : CHECK;
        return U.chance((f.scary ? 0.3 : 0.1) * (f.ip ? 1 : 0.5)) ? size() : CHECK; // bluff on scary turns/rivers
      }
      if (f.nuts && L.canRaise) return U.chance(0.65) ? potBet(L, rnd(0.75, 1)) : CALL;
      if (cls === 'strong') {
        if (L.canRaise && U.chance(street === 'flop' ? 0.35 : 0.2)) return size();
        return bf > 1 && f.hs < 0.8 && U.chance(0.4) ? FOLD : CALL;
      }
      if (cls === 'medium') {
        let p = bf <= 0.55 ? 0.95 : bf <= 0.85 ? 0.65 : 0.3;
        if (f.nOpp > 1) p *= 0.75;
        if (f.slow) p *= 0.4; // a long think before a bet usually means strength
        return f.eq >= f.odds * 0.8 && U.chance(p) ? CALL : FOLD;
      }
      if (cls === 'draw') {
        if (L.canRaise && a.outs >= 8 && U.chance(street === 'flop' ? 0.3 : 0.15)) return potBet(L, rnd(0.6, 0.8)); // semi-bluff
        return f.eq >= f.odds - (street === 'flop' ? 0.1 : 0.04) ? CALL : FOLD; // implied odds
      }
      if (L.canRaise && street === 'flop' && f.ip && f.nOpp === 1 && bf <= 0.5 && U.chance(0.05)) return potBet(L, 0.7);
      // float small bets heads-up with overcards / ace high or a gutshot
      return !f.river && f.nOpp === 1 && bf <= 0.6 && (a.over || a.aceHigh || a.sOuts) && U.chance(0.4) ? CALL : FOLD;
    },
    maniac(f) {
      const { L, cls, bf, a } = f;
      const big = () => (f.spr < 1.5 || U.chance(cls === 'strong' ? 0.25 : 0.12) ? ALLIN : potBet(L, U.pick([0.75, 1, 1, 1.25, 1.5])));
      if (!L.toCall) return U.chance({ strong: 0.9, medium: 0.75, draw: 0.85, bluff: 0.65 }[cls]) ? big() : CHECK;
      if (cls === 'strong') return L.canRaise && U.chance(0.65) ? big() : CALL;
      if (cls === 'medium') return L.canRaise && U.chance(0.4) ? big() : bf > 1.5 && U.chance(0.3) ? FOLD : CALL;
      if (cls === 'draw') return L.canRaise && U.chance(0.5) ? big() : CALL;
      if (L.canRaise && U.chance(0.25)) return big();
      return U.chance(a.pair || a.aceHigh || a.sOuts ? 0.55 : 0.25) ? CALL : FOLD;
    },
  };

  // Timing tells: honest styles tank with monsters and snap-fold junk; the actor does the opposite. Preflop folds are
  // trivial for every style: a quick snap keeps the orbit moving.
  function think(style, action, strong, preflop) {
    const aggressive = action.type === 'raise', easy = action.type === 'fold' || action.type === 'check';
    if (preflop && action.type === 'fold') return U.randInt(400, 800);
    let ms = U.randInt(700, 1600);
    if (style === 'rock' || style === 'station') {
      if (aggressive && strong) ms += U.randInt(900, 1800);
      else if (easy) ms *= 0.6;
    } else if (style === 'reg') ms = U.randInt(1100, 1700);
    else if (style === 'maniac') ms = U.randInt(450, 3200);
    else if (style === 'actor') {
      if (strong) ms = U.randInt(450, 900);
      else if (aggressive) ms += U.randInt(1200, 2000);
    }
    return Math.round(U.clamp(ms, 400, 3500));
  }

  // Calling all-in for less than the bet: only up to our own total can be won from each player (side pot), so the
  // decision sees that capped pot, not the shover's whole stack (as Coach does for the hero).
  function capPot(hand, seat, L) {
    if (L.toCall >= L.currentBet - L.myBet) return L;
    const paid = (s) => hand.committed[s] - ((hand.returned && hand.returned[s]) || 0), lim = paid(seat) + L.toCall;
    return { ...L, pot: hand.seats.reduce((a, s) => a + Math.min(paid(s), lim), 0) };
  }

  function decide({ table, hand, seat, legal, human } = {}) {
    const L = capPot(hand, seat, legal || Engine.legal(hand)), p = table.players[seat], st = base(p);
    let intent, strong;
    if (hand.street === 'preflop') {
      const f = preInfo(table, hand, seat, L);
      intent = PRE[st](f);
      strong = f.top <= 0.05;
    } else {
      const f = postInfo(hand, seat, L, human);
      intent = POST[st](f);
      if (intent === FOLD && f.bf <= 0.2 && f.eq >= 2.5 * f.odds) intent = CALL; // a tiny bet never buys the pot
      strong = f.cls === 'strong';
    }
    const action = legalize(intent, L);
    return { action, thinkMs: think(p.style, action, strong, hand.street === 'preflop') };
  }

  // ---------- tells ----------
  const CHAT = ['«Кто-нибудь смотрел вчера футбол?»', '«Эх, сейчас бы кофе…»', '«А долго ещё до перерыва?»',
    '«Хорошая сегодня погода, правда?»', '«Кстати, где тут можно нормально поужинать?»'];
  // [text for reviews ("Игорь …"), short bubble] — subtle (rock, reg) and obvious (station, maniac) versions.
  const TELLS = {
    glance: { shown: 'strength', subtle: ['бросает быстрый взгляд на свои фишки', 'взгляд на фишки'],
      obvious: ['сразу смотрит на свои фишки и начинает их пересчитывать', 'пересчитывает фишки'] },
    freeze: { shown: 'strength', subtle: ['на секунду задерживает дыхание', 'задерживает дыхание'],
      obvious: ['замирает и заметно задерживает дыхание', 'замирает'] },
    quiet: { shown: 'strength', subtle: ['перестаёт болтать и замолкает', 'замолкает'],
      obvious: ['резко замолкает и выпрямляется на стуле', 'резко замолкает'] },
    lookaway: { shown: 'weakness', subtle: ['безразлично отводит взгляд в сторону', 'смотрит в сторону'],
      obvious: ['отворачивается от стола и безразлично смотрит в сторону', 'смотрит в сторону'] },
    chatter: { shown: 'weakness', subtle: ['начинает болтать с соседом', null], obvious: ['начинает громко болтать со всеми подряд', null] },
    shrug: { shown: 'weakness', subtle: ['едва заметно пожимает плечами', 'пожимает плечами'],
      obvious: ['разочарованно пожимает плечами и откидывается на стуле', 'пожимает плечами'] },
  };
  const KINDS = { strength: ['glance', 'freeze', 'quiet'], weakness: ['lookaway', 'chatter', 'shrug'] };
  const STREET_GEN = { flop: 'флоп', turn: 'тёрн', river: 'ривер' };
  const meaningOf = (shown, street) => (shown === 'strength'
    ? (street === 'flop' ? 'это часто сигнал, что флоп попал' : `это часто сигнал, что ${STREET_GEN[street]} усилил руку`)
    : street === 'flop' ? 'так часто ведут себя, когда флоп не попал' : 'так часто ведут себя, когда карта не помогла');

  function honest(seat, shown, truth, street, tone, extra = {}) {
    const anim = U.pick(KINDS[shown]), [text, bubble] = TELLS[anim][tone];
    return { seat, shown, truth, acting: false, random: false, text, bubble: bubble || U.pick(CHAT), anim, meaning: meaningOf(shown, street), ...extra };
  }
  // Acting: a strong hand plays weak (sigh), a weak hand plays strong (smile / chip toss).
  function acted(seat, truth, street, onBet = false) {
    if (truth === 'strong') {
      return { seat, shown: 'weakness', truth, acting: true, random: false, anim: 'sigh',
        text: onBet ? 'ставит с тяжёлым демонстративным вздохом' : 'демонстративно вздыхает',
        bubble: onBet ? '«Ну ладно, поставлю…»' : street === 'flop' ? '«Ну и флоп…»' : '«Ну и карта…»',
        meaning: 'показная слабость часто скрывает сильную руку' };
    }
    const toss = U.chance(0.5);
    return { seat, shown: 'strength', truth, acting: true, random: false, anim: toss ? 'toss' : 'smile',
      text: toss ? (onBet ? 'с вызовом бросает фишки в банк' : 'с вызовом поигрывает фишками') : 'показно улыбается и уверенно смотрит на соперников',
      bubble: toss ? (onBet ? 'бросает фишки' : 'играет фишками') : 'улыбается',
      meaning: onBet ? 'показная уверенность при ставке часто прикрывает блеф' : 'показная уверенность часто прикрывает слабую руку' };
  }
  // The style's way of showing a strong or weak change of its hand.
  function show(style, seat, truth, street) {
    const shown = truth === 'strong' ? 'strength' : 'weakness';
    switch (style) {
      case 'station': return honest(seat, shown, truth, street, 'obvious');
      case 'reg': return U.chance(0.5) ? acted(seat, truth, street) : honest(seat, shown, truth, street, 'subtle');
      case 'maniac': return honest(seat, U.chance(0.5) ? 'strength' : 'weakness', truth, street, 'obvious', { random: true });
      case 'actor': return acted(seat, truth, street);
      default: return honest(seat, shown, truth, street, 'subtle');
    }
  }
  // Noise looks exactly like the style's real tells (so it cannot be filtered out by its wording), for a made-up
  // truth drawn as often as real ones come: only ~1 in 9 street events really makes a hand strong (measured with all-bot
  // games for every style), so a 50/50 draw would swamp the rare real "strength" tells. This way about 85% of each
  // signal stays true.
  const NOISE_STRONG = 0.12;
  const noise = (style, seat, truth, street) =>
    ({ ...show(style, seat, U.chance(NOISE_STRONG) ? 'strong' : 'weak', street), truth, acting: false, random: true });

  // How the new card(s) changed the bot's holding: 'strong' | 'weak' | 'neutral'.
  function streetTruth(hole, prev, board) {
    const pair = Cards.rank(hole[0]) === Cards.rank(hole[1]);
    const before = prev.length >= 3 ? analyze(hole, prev) : { cls: pair ? 'medium' : 'bluff', cat: pair ? 1 : 0 };
    const after = analyze(hole, board);
    if (after.cls === 'strong') return before.cls !== 'strong' || after.cat > before.cat ? 'strong' : 'neutral';
    if (after.cls === 'bluff' || (before.cls === 'strong' && after.cls === 'medium')) return 'weak';
    if (after.cls === 'medium' && scaryBoard(prev, board, after.pairRank)) return 'weak';
    return 'neutral';
  }

  const SHOW = { rock: 0.45, station: 0.85, reg: 0.15, maniac: 0.6, actor: 0.8 };

  function streetReaction({ table, hand, seat, newCards = [] } = {}) {
    const p = table.players[seat], hole = hand.hole[seat];
    if (!p || p.isHuman || !hole || hand.folded[seat] || hand.board.length < 3) return null;
    const fresh = new Set(newCards), street = hand.street;
    const prev = hand.board.filter((c) => !fresh.has(c));
    const truth = streetTruth(hole, prev, hand.board);
    if (!U.chance(SHOW[p.style] ?? 0.3)) return null;
    if (truth === 'neutral') return U.chance(0.13) ? noise(p.style, seat, truth, street) : null; // mostly nothing to show
    return U.chance(0.13) ? noise(p.style, seat, truth, street) : show(p.style, seat, truth, street);
  }

  // Occasional tell right after the bot's own bet/raise; like street tells, some show a made-up holding (noise).
  function betReaction({ table, hand, seat, entry } = {}) {
    const p = table.players[seat], hole = hand.hole[seat];
    if (!p || p.isHuman || !hole || !entry || (entry.type !== 'bet' && entry.type !== 'raise') || hand.board.length < 3) return null;
    const a = analyze(hole, hand.board), truth = a.cls === 'strong' ? 'strong' : a.cls === 'medium' ? 'neutral' : 'weak';
    if (p.style === 'maniac') return U.chance(0.2) ? { ...acted(seat, U.chance(0.5) ? 'strong' : 'weak', hand.street, true), truth, acting: false, random: true } : null;
    const fake = U.chance(0.15), t = fake ? U.pick(['strong', 'weak']) : truth; // the holding the tell is about
    const monster = fake ? t === 'strong' : a.cls === 'strong' && a.cat >= 2;
    let r = null;
    if ((p.style === 'rock' || p.style === 'station') && monster && U.chance(p.style === 'rock' ? 0.25 : 0.5)) {
      const subtle = p.style === 'rock';
      r = { seat, shown: 'strength', truth, acting: false, random: false, anim: 'tremble',
        text: subtle ? 'ставит, и пальцы едва заметно дрожат' : 'ставит фишки, и руки заметно дрожат',
        bubble: 'руки дрожат', meaning: 'дрожь в руках при ставке часто выдаёт очень сильную руку — так волнуются, а не блефуют' };
    } else if (p.style === 'actor' && t !== 'neutral' && U.chance(t === 'weak' ? 0.6 : 0.3)) r = acted(seat, t, hand.street, true);
    else if (p.style === 'reg' && t !== 'neutral' && U.chance(0.04)) r = acted(seat, t, hand.street, true);
    return r && fake ? { ...r, truth, acting: false, random: true } : r;
  }

  // Composition of each style's big (add ≥ 0.66 × pot before, as in Coach.readQuestion) postflop bets/raises by
  // classifyHolding, measured with tools/sim-bots.js (25k + 25k hands, 9- and 6-max); re-measure after changing
  // the policies or classifyHolding.
  const READ_PROFILE = {
    rock: { strong: 0.98, medium: 0.02, draw: 0, bluff: 0 },
    station: { strong: 0.97, medium: 0.03, draw: 0, bluff: 0 },
    reg: { strong: 0.49, medium: 0.12, draw: 0.09, bluff: 0.3 },
    maniac: { strong: 0.13, medium: 0.23, draw: 0.09, bluff: 0.55 },
  };

  return {
    STYLE_IDS, BASE_STYLES, STYLES, NAMES, createBot, randomLineup, decide, streetReaction, betReaction,
    classifyHolding, READ_PROFILE, foldEquity, base,
  };
})();
