// ===== Ranges: preflop tables (SPEC §6), situation detection, verdicts, hints, range grids =====
const Ranges = (() => {
  const EARLY = '77+, AJs+, AQo+, KQs';
  const MIDDLE = '55+, ATs+, AJo+, KJs+, QJs, JTs, KQo';
  const CO_TEXT = '22+, A2s+, A9o+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, KTo+, QTo+, JTo';
  // Smaller tables use the last N labels (Engine.positionNames), so lookup by label implements the SPEC "shift".
  const OPEN_TEXT = {
    UTG: EARLY, 'UTG+1': EARLY, MP: MIDDLE, LJ: MIDDLE,
    HJ: '22+, A9s+, ATo+, KTs+, QTs+, JTs, T9s, KJo+',
    CO: CO_TEXT,
    BTN: '22+, A2s+, A7o+, K7s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, K9o+, Q9o+, J9o+, T9o',
    SB: CO_TEXT, // SB opens like CO
    BB: CO_TEXT, // BB raises limpers with the CO range
  };

  // One step below each component: 77+ → 66, AJs+ → ATs, KQo → KJo (codes already in the range excluded).
  function borderOf(text, inRange) {
    const out = new Set();
    for (const t of text.split(',').map((s) => s.trim())) {
      const lo = Cards.rankOf(t[1]) - 1;
      if (lo < 2) continue;
      out.add(t[0] === t[1] ? Cards.rankChar(lo).repeat(2) : t[0] + Cards.rankChar(lo) + t[2]);
    }
    for (const c of inRange) out.delete(c);
    return out;
  }
  const OPEN = {}, BORDER = {};
  for (const p of Object.keys(OPEN_TEXT)) {
    OPEN[p] = Cards.parseRange(OPEN_TEXT[p]);
    BORDER[p] = borderOf(OPEN_TEXT[p], OPEN[p]);
  }
  const open = (pos) => OPEN[pos] || new Set();
  const border = (pos) => BORDER[pos] || new Set();

  const set = (t) => Cards.parseRange(t);
  const PREMIUM = set('QQ+, AK'), SMALL_PAIRS = set('66-22');
  const isLate = (pos) => pos === 'BTN' || pos === 'CO';
  const VS_RAISE_TEXT = 'Против рейза решают позиция, цена, стек и соперник: 3-бет с сильнейшими, колл — с парами (на сет), ' +
    'одномастными и крепкими руками в позиции, на BB — по шансам банка; короткий стек — олл-ин или сброс.';
  // Feedback shape (shared with Coach): at most 2 short lines, everything else under «Подробнее».
  const MAXLEN = 100;
  function pack(all) {
    const lines = [], more = [];
    for (const l of all.filter(Boolean)) (lines.length < 2 && l.length <= MAXLEN ? lines : more).push(l);
    return more.length ? { lines, more } : { lines };
  }

  // ---------- the realistic model: who raised, position, price, stacks, number of players ----------
  const share = (s) => U.sum([...s].map(Cards.codeCombos)) / 1326;
  const OPEN_W = {};
  for (const p of Object.keys(OPEN)) OPEN_W[p] = share(OPEN[p]);
  const POST = ['SB', 'BB', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN']; // postflop action order
  const styleOf = (p) => { try { return Bots.base(p); } catch (e) { return 'reg'; } };
  const styleRu = (st) => { try { return Bots.STYLES[st].name; } catch (e) { return st; } };
  const TEND = { rock: 'повышает только с сильными руками', station: 'повышает только с монстрами', maniac: 'повышает почти половину рук' };
  // Share of all hands the last raiser plays like this: the SPEC open table of his seat, by tendency (Bots.PRE).
  function widthOf(sit) {
    const st = sit.rStyle;
    if (sit.kind === 'vs3bet') return sit.raises >= 3 ? 0.02 : { rock: 0.026, station: 0.02, maniac: 0.18 }[st] || (['CO', 'BTN', 'SB'].includes(sit.pos) ? 0.1 : 0.05);
    const w = OPEN_W[sit.rPos] || OPEN_W.CO;
    return st === 'rock' ? 0.6 * w : st === 'station' ? 0.08 : st === 'maniac' ? Math.max(w, 0.45) : w;
  }
  // Hand features: p = share of hands at least as strong (Equity.PREFLOP_ORDER), spec = plays well deep (sets, straights, flushes).
  function feat(code) {
    const { hi, lo, type } = Cards.codeInfo(code), s = type === 's';
    return { hi, lo, p: Equity.preflopTopPct(code), pair: type === 'p', suited: s, off: type === 'o',
      spec: s && (hi === 14 || (hi - lo <= 2 && lo >= 4) || lo >= 10), wheel: s && hi === 14 && lo <= 5 };
  }
  const him = (sit) => (/[ая]$/.test(String(sit.rName).split(' ')[0]) ? 'неё' : 'него'); // Марина → «против неё»
  const after = (sit) => { const names = Engine.positionNames(sit.n); return Math.max(0, names.length - 1 - names.indexOf(sit.pos)); };
  const pctTxt = (x) => Math.round(x * 100) + '%';

  // Preflop context of the hero's current decision. Works both before Engine.act (hero to act)
  // and right after it (then the decision is the hero's last voluntary preflop entry).
  function situation(hand, seat) {
    const pre = hand.log.filter((e) => e.street === 'preflop');
    const voluntary = (e) => e.type !== 'sb' && e.type !== 'bb';
    const isRaise = (e) => e.type === 'raise' || e.type === 'bet';
    let cut = pre.length;
    if (!(hand.street === 'preflop' && hand.toAct === seat)) {
      for (let i = pre.length - 1; i >= 0; i--) if (pre[i].seat === seat && voluntary(pre[i])) { cut = i; break; }
    }
    const prior = pre.slice(0, cut);
    const raiseList = prior.filter(isRaise), first = prior.findIndex(isRaise);
    const raises = raiseList.length;
    const limpers = prior.filter((e, i) => e.type === 'call' && (first < 0 || i < first)).length;
    const heroRaised = raiseList.some((e) => e.seat === seat);
    const raiser = raises ? raiseList[raises - 1].seat : null;
    const callers = raises ? prior.slice(prior.indexOf(raiseList[raises - 1]) + 1).filter((e) => e.type === 'call').length : 0;
    const raiseTo = Math.max(hand.bb, ...prior.map((e) => e.to || 0));
    const heroIn = Math.max(0, ...prior.filter((e) => e.seat === seat).map((e) => e.to || 0));
    const pos = hand.pos[seat], idx = hand.order.indexOf(seat);
    const playersAfter = hand.order.slice(idx + 1).filter((s) => !hand.folded[s] && !hand.allIn[s]).length;
    const st = hand.startStacks;
    const effStack = raiser === null ? st[seat] : Math.min(st[seat], st[raiser]);
    const kind = raises >= 2 || (raises && heroRaised) ? 'vs3bet' : raises ? 'vsRaise'
      : pos === 'BB' ? (limpers ? 'bbOption' : 'walk') : limpers ? 'limped' : 'open';
    // Engine.legal's raise rule: chips beyond the call, someone left to raise against, and an incomplete
    // all-in raise does not reopen the betting for a player who already acted since the last full raise.
    let cur = hand.bb, minRaise = hand.bb, fullAt = -1;
    prior.forEach((e, i) => { if (isRaise(e)) { if (!e.incomplete) { minRaise = e.to - cur; fullAt = i; } cur = Math.max(cur, e.to); } });
    const toCall = Math.max(0, raiseTo - heroIn), stack = st[seat] - heroIn;
    const acted = prior.some((e, i) => i >= fullAt && e.seat === seat && voluntary(e));
    const canRaise = stack > toCall && hand.seats.some((s) => s !== seat && !hand.folded[s] && !hand.allIn[s]) && (!acted || toCall >= minRaise);
    const pot = U.sum(prior.map((e) => e.add || 0)), call = Math.min(toCall, stack);
    const rp = raiser !== null && hand.players ? hand.players[raiser] : null, rPos = raiser !== null ? hand.pos[raiser] : null;
    const allIn = raiser !== null && !!hand.allIn[raiser], price = call ? call / (pot + call) : 0;
    return { kind, pos, n: hand.order.length, playersAfter, limpers, raises, raiser, raiseTo, effStack, toCall,
      stack, canRaise, pot, price, allIn, callers, rPos, bb: hand.bb, heroIn, minTo: Math.min(cur + minRaise, heroIn + stack),
      rStyle: rp ? styleOf(rp) : 'reg', rRevealed: !!(rp && rp.revealed), rName: rp ? rp.name : 'Соперник',
      ip: rPos ? POST.indexOf(pos) > POST.indexOf(rPos) : pos !== 'SB' && pos !== 'BB',
      // the model's inputs, rounded as in the grid key (so the grid of a key = the verdicts of the spot)
      x: Math.round((10 * raiseTo) / hand.bb) / 10, d: Math.round(effStack / hand.bb), pc: Math.round(price * 100) / 100,
      commit: raiser !== null && (allIn || call >= 0.4 * stack) };
  }

  const B = 'best', OK = 'ok', M = 'mistake';
  // No more betting after this call (short shove, or the hero's last chips) and at most 20% needed.
  const cheapAllIn = (sit) => (sit.allIn || sit.stack <= sit.toCall) && sit.price <= 0.2;
  const priceText = (sit) => `доплатить нужно всего ${U.fmt(Math.min(sit.toCall, sit.stack))} при банке ${U.fmt(sit.pot)}`;
  const V = (best, fold, call, raise, check) => ({ best, v: check ? { fold, check, raise } : { fold, call, raise } });

  // One raise before the hero. why[0] = the main reason (short), more = the inputs of the model.
  function vsRaise(sit, code, C, why, more) {
    const f = feat(code), W = widthOf(sit), { pos, d, x, pc } = sit, multi = sit.callers > 0, bbD = pos === 'BB';
    const ratio = d / x, v3 = U.clamp(0.2 * W, 0.014, W >= 0.4 ? 0.09 : 0.06), value = PREMIUM.has(code) || f.p <= v3;
    const offM = multi && f.off ? 0.5 : 1; // offsuit hands are dominated more often in a multiway pot
    const cTop = W * (pos === 'SB' ? 0 : sit.ip ? 0.7 : 0.4) * offM;
    const bbTop = bbD ? Math.min(0.6, W * U.clamp(1 + (0.3 - pc) * 8, 0.5, 2) * (sit.ip ? 1.3 : 1)) * offM : 0; // vs the SB the BB is IP
    const light = f.wheel && W >= 0.2 && !multi && (sit.ip || pos === 'SB' || bbD); // A5s-type 3-bet bluff vs a wide opener
    const late = sit.ip && (isLate(pos) || after(sit) <= 3);
    const specOk = pos !== 'SB' && ((d >= 40 && (multi || (bbD && pc <= 0.33) || late)) || (bbD && d >= 25 && pc <= 0.3 && W >= 0.2));
    const tend = TEND[sit.rStyle];
    if (tend) more.push(`${sit.rRevealed ? `${sit.rName} («${styleRu(sit.rStyle)}»)` : `${sit.rName}, судя по игре,`} ${tend} — ` +
      `${sit.rStyle === 'maniac' ? `играй против ${him(sit)} шире` : `против ${him(sit)} играй уже`}.`);
    more.push(`Рейз с ${sit.rPos}: в таком диапазоне ~${pctTxt(W)} рук. ${C} — в верхних ${pctTxt(f.p)} всех рук.`);
    if (multi) more.push(`Перед тобой уже ${U.nplural(sit.callers, 'колл', 'колла', 'коллов')}: банк будет мультивей — спекулятивные руки дороже, разномастные картинки дешевле.`);
    if (sit.commit) {
      const top = U.clamp((0.35 * W * 0.45) / Math.max(pc, 0.2), 0.02, 0.3);
      why.push(`Олл-ин: неявных шансов нет, нужна сильная рука. ${C} — ${PREMIUM.has(code) || f.p <= top ? 'колл' : 'сброс'}.`);
      return PREMIUM.has(code) || f.p <= top ? V('call', M, B, OK) : f.p <= 1.4 * top ? V('fold', B, OK, M) : V('fold', B, M, M);
    }
    if (d < 25) {
      const top = U.clamp(0.5 * W, 0.03, 0.2), shove = value || f.p <= top;
      why.push(!shove && bbD && f.p <= 0.6 * bbTop ? `Стек ${d} BB — коротко, но на BB доплата всего ${Math.round(pc * 100)}% банка: ${C} — колл.`
        : `Стек ${d} BB — коротко: олл-ин или сброс. ${C} — ${shove ? 'олл-ин' : 'сброс'}.`);
      if (shove) return V('raise', M, bbD && f.p <= bbTop ? OK : M, B);
      if (bbD && f.p <= 0.6 * bbTop) return V('call', OK, B, OK);
      return V('fold', B, bbD && f.p <= bbTop ? OK : M, f.p <= 1.4 * top ? OK : M);
    }
    if (value) {
      why.push(multi ? `Рейз и колл перед тобой — банк уже большой. ${C}: сквиз (3-бет).`
        : `${C} сильнее большинства рук, с которыми ${sit.rPos} повышает: 3-бет за ценностью.`);
      return V('raise', M, OK, B);
    }
    if (pos === 'SB') {
      const sb3 = U.clamp(0.35 * W, 0.014, 0.12), r = f.p <= sb3;
      why.push(`С малого блайнда ты без позиции: 3-бет или сброс. ${C} — ${r ? '3-бет' : 'сброс'}.`);
      return r ? V('raise', M, OK, B) : V('fold', B, (f.pair && ratio >= 20) || (f.spec && f.p <= W) ? OK : M, light ? OK : M);
    }
    if (f.p <= cTop || f.p <= bbTop) {
      why.push(f.p <= cTop ? `${C} против рейза ${sit.rPos} — колл${sit.ip ? ': ты в позиции, рука играет' : ', хоть ты и без позиции'}.`
        : `${C} на BB: доплата — всего ${pctTxt(pc)} итогового банка, колл.`);
      if (bbD) more.push(`На BB блайнд уже в банке и ты закрываешь торговлю: защищайся по цене — чем меньше рейз, тем шире.` +
        (sit.ip ? ' Против SB ты ещё и в позиции после флопа.' : ''));
      return V('call', M, B, f.p <= 1.6 * v3 || light ? OK : M);
    }
    if (f.pair) {
      const ok = ratio >= 20;
      why.push(`Игра на сет: нужно ≥ 20 рейзов соперника в стеке, у тебя ${Math.floor(ratio)}${ok ? ' — хватает, колл.' : ' — мало, сброс.'}`);
      if (ok && multi) more.push('Несколько соперников — сет оплатят ещё вероятнее.');
      return ok ? V('call', OK, B, M) : V('fold', B, M, M);
    }
    if (f.spec && specOk) {
      why.push(`${C} — спекулятивная рука: колл недорогой, а попадание оплатят (стек ${d} BB).`);
      more.push(multi ? 'Несколько игроков в банке — больше неявных шансов: сильная рука соберёт большой банк.'
        : bbD ? 'На BB цена хорошая, а одномастная связка часто собирает стрит или флеш.' : 'Ты в позиции и после тебя мало игроков — колл безопасен.');
      return V('call', OK, B, light ? OK : M);
    }
    if (light) {
      why.push(`${C} — сброс или изредка 3-бет-блеф: туз мешает соперникам собрать сильную руку.`);
      return V('fold', B, M, OK);
    }
    const near = f.p <= 1.35 * Math.max(cTop, bbTop) || (f.spec && (sit.ip || multi) && d >= 40);
    why.push(near ? `${C} — на границе против рейза ${sit.rPos}: колл допустим, надёжнее сброс.`
      : multi && f.off ? `Рейз и колл перед тобой: ${C} часто ${f.pair ? 'доминирована' : 'доминированы'} — сброс.`
      : `${C} слишком ${f.pair ? 'слаба' : 'слабы'} против рейза ${sit.rPos}${f.spec && !specOk ? ' здесь (нет позиции или глубины)' : ''} — сброс.`);
    if (!late && f.spec && sit.ip) more.push(`После тебя ещё ${after(sit)} — могут сделать 3-бет, спекулятивный колл дорожает.`);
    return V('fold', B, near ? OK : M, M);
  }

  // Facing a 3-bet (or more): the 3-bettor's range is narrow — 4-bet the top, call the next layer, fold the rest.
  function vs3bet(sit, code, C, why, more) {
    const f = feat(code), W = widthOf(sit), { d, x } = sit, ratio = d / x;
    const v4 = ['AA', 'KK'].includes(code) || (PREMIUM.has(code) && W >= 0.04) || f.p <= 0.35 * W;
    const cTop = Math.max(0.015, W * (sit.ip ? 0.8 : 0.5));
    const tend = TEND[sit.rStyle];
    if (tend) more.push(`${sit.rRevealed ? `${sit.rName} («${styleRu(sit.rStyle)}»)` : `${sit.rName}, судя по игре,`} ${sit.rStyle === 'maniac' ? 'ререйзит часто и широко' : 'ререйзит только очень сильные руки'}.`);
    more.push(`Против 3-бета продолжают ~${pctTxt(Math.min(W, 0.2))} рук: 3-бет — это узкий диапазон.`);
    if (sit.commit || d < 25) {
      const top = Math.max(0.03, 0.6 * W), go = PREMIUM.has(code) || f.p <= top;
      why.push(`${sit.commit ? 'Олл-ин: неявных шансов нет' : `Стек ${d} BB — олл-ин или сброс`}. ${C} — ${go ? (sit.commit ? 'колл' : 'олл-ин') : 'сброс'}.`);
      if (sit.commit) return go ? V('call', M, B, OK) : V('fold', B, f.p <= 1.4 * top ? OK : M, M);
      return go ? V('raise', M, OK, B) : V('fold', B, M, f.p <= 1.4 * top ? OK : M);
    }
    if (v4) { why.push(`${C} — 4-бет: против 3-бета ставь с сильнейшими руками.`); return V('raise', M, OK, B); }
    if (PREMIUM.has(code) && W < 0.025) {
      why.push(`${sit.raises >= 3 ? 'Это уже 4-бет' : `${sit.rRevealed ? sit.rName : `${sit.rName}, судя по игре,`} ререйзит только AA и KK`}. ${C} — сброс, колл допустим.`);
      return V('fold', B, OK, M);
    }
    if (f.p <= cTop || PREMIUM.has(code)) {
      why.push(PREMIUM.has(code) ? `${C} — колл${sit.ip ? ' в позиции' : ''}: этот соперник ререйзит только сильнейшие руки, 4-бет лишний.`
        : `${C} против 3-бета — колл${sit.ip ? ' в позиции' : ''}: рука достаточно сильная.`);
      return V('call', OK, B, M);
    }
    if (f.pair && ratio >= 20) { why.push(`Игра на сет против 3-бета: в стеке ${Math.floor(ratio)} его ставок — колл.`); return V('call', OK, B, M); }
    const near = f.p <= 1.4 * cTop || (f.spec && sit.ip && ratio >= 20);
    why.push(near ? `${C} против 3-бета — на границе: колл допустим, надёжнее сброс.` : `${C} против 3-бета — сброс: рука недостаточно сильная.`);
    return V('fold', B, near ? OK : M, M);
  }

  // Verdicts + explanation (independent of the action actually taken).
  // why = short lines (no range lists: the grid shows the range), more = details.
  function decide(sit, code) {
    const { kind, pos } = sit;
    const pair = code.length === 2, C = cap(codeRu(code));
    const enters = (yes) => (yes ? '' : 'не ') + (pair ? 'входит' : 'входят');
    const why = [], more = [];
    let d;
    if (kind === 'open') {
      if (open(pos).has(code)) { d = V('raise', M, M, B); why.push(`${C} ${enters(true)} в диапазон ${pos} — открывай рейзом.`); }
      else if (border(pos).has(code)) { d = V('fold', B, M, OK); why.push(`${C} — на границе диапазона ${pos}: рейз допустим, надёжнее сброс.`); }
      else { d = V('fold', B, M, M); why.push(`${C} ${enters(false)} в диапазон ${pos} — сброс.`); }
    } else if (kind === 'limped') {
      const f = feat(code);
      // over-limp material: small/medium pairs, suited aces, suited connectors/gappers — cheap flop, big pot when it hits
      const specL = (f.pair && f.p > 0.05) || (f.suited && ((f.hi === 14 && f.lo <= 9) || (f.hi - f.lo <= 2 && f.lo >= 4 && f.hi <= 11)));
      const canLimp = isLate(pos) || pos === 'SB' || sit.limpers >= 2, inR = open(pos).has(code);
      more.push(`Перед тобой ${U.nplural(sit.limpers, 'лимпер', 'лимпера', 'лимперов')}: ${sit.limpers > 1 ? 'игроки просто уравняли' : 'игрок просто уравнял'} большой блайнд.`);
      if (inR && !(specL && canLimp)) { d = V('raise', M, specL ? OK : M, B); why.push(`${C} ${enters(true)} в диапазон ${pos} — рейзи: изолируй лимперов.`); }
      else if (specL && canLimp) {
        d = V('call', OK, B, inR ? OK : M);
        why.push(`${C} — спекулятивная рука: доплати (оверлимп) и посмотри флоп дёшево.`);
        more.push(`${sit.limpers >= 2 ? 'Лимперов несколько — банк будет мультивей' : 'Ты в поздней позиции или на SB'}: пары, одномастные тузы и связки ` +
          'выигрывают крупно, когда попадают, а рейзом их не изолируешь.');
      } else { d = V('fold', B, M, border(pos).has(code) ? OK : M); why.push(`${C} ${enters(false)} в диапазон ${pos}${specL ? ' — а для оверлимпа рано: после тебя много игроков' : ''}.`); }
    } else if (kind === 'bbOption') {
      const r = sit.limpers <= 1 ? open('CO').has(code) : feat(code).p <= 0.1;
      d = V(r ? 'raise' : 'check', M, null, r ? B : M, B);
      why.push(r ? `${C} — сильная рука: можно повысить за ценностью, чек тоже верен.` : `${C} — просто чек: флоп бесплатно.`);
      more.push('Никто не повышал — ты на большом блайнде и можешь бесплатно посмотреть флоп.');
      if (sit.limpers > 1) more.push('Лимперов несколько: без позиции повышай только с сильными руками.');
    } else if (kind === 'vsRaise') {
      more.push(`${sit.rName} (${sit.rPos}) повышает до ${U.fmt(sit.raiseTo)}.`);
      d = vsRaise(sit, code, C, why, more);
      more.push(VS_RAISE_TEXT);
    } else if (kind === 'vs3bet') {
      d = vs3bet(sit, code, C, why, more);
    } else {
      d = { best: 'check', v: { check: B } };
      why.push('Все сбросили — банк твой без борьбы.');
    }
    if (!sit.canRaise && d.v.raise) { // only call or fold is left
      const { raise, ...v } = d.v;
      d = raise === B && d.best === 'raise' ? { best: 'call', v: { ...v, call: B } } : { best: d.best, v };
    }
    // Against a short shove, or when the call is the hero's last chips, there is no more betting:
    // a tiny price makes calling right with almost anything.
    if (cheapAllIn(sit) && d.best === 'fold') {
      d = { best: 'call', v: { ...d.v, fold: M, call: B } };
      why.unshift(`Олл-ин: доплатить ${U.fmt(Math.min(sit.toCall, sit.stack))} при банке ${U.fmt(sit.pot)} — хватит ${U.pctNum(sit.price * 100)} эквити. Колл.`);
      more.push(`${sit.allIn ? `${sit.rName} идёт олл-ин` : 'Твой колл — это олл-ин'}, и ${priceText(sit)}: ` +
        `хватит ${U.pctNum(sit.price * 100)} эквити — столько есть почти у любой руки. Колл.`);
    }
    return { ...d, why, more };
  }

  // ---------- raise size: open 2–4 BB (+1 per limper), 3-bet ~3× IP / ~4× OOP (+1 per caller), 4-bet ~2.3×, shove when short ----------
  const nice = (x, bb) => { const st = Math.max(1, bb / 2); return Math.round(x / st) * st; };
  function sizePlan(sit) {
    const bb = sit.bb, maxTo = sit.heroIn + sit.stack, k = sit.kind, R = sit.raiseTo;
    let lo, hi, ideal, unit;
    if (k === 'vsRaise' || k === 'vs3bet') {
      const m = k === 'vs3bet' ? 2.3 : (sit.ip ? 3 : 4) + sit.callers;
      [ideal, lo, hi] = k === 'vs3bet' ? [2.3 * R, 2.1 * R, 2.8 * R] : [m * R, (m - 0.6) * R, (m + 0.8) * R];
      unit = (v) => `${U.dec(v / R, 1)}× рейза`;
    } else {
      const L = sit.limpers || 0;
      [ideal, lo, hi] = [(3 + L) * bb, (2 + L) * bb, (4 + L) * bb];
      unit = (v) => `${U.dec(v / bb, 1)} BB`;
    }
    ideal = nice(ideal, bb);
    const shoveOrFold = k !== 'open' && k !== 'limped' && k !== 'bbOption' && sit.d < 25;
    if (ideal > 0.4 * maxTo || shoveOrFold) ideal = hi = maxTo; // tiny SPR: all-in
    if (shoveOrFold) lo = maxTo;                                // short: a raise that is not all-in only invites a shove
    else if (sit.d <= 15) hi = maxTo;                           // ≤ 15 BB first in: the open-shove is a standard size too
    lo = Math.min(Math.max(lo, sit.minTo), maxTo);
    return { lo, hi: Math.max(hi, lo), ideal: Math.min(ideal, maxTo), maxTo, what: (v) => (v >= maxTo ? 'олл-ин' : unit(v)) };
  }
  // «Размер ✅…» or «Размер: рейз до 200 — много, хватит 60 (3 BB)»; far = off by more than 2×.
  function sizeNote(sit, rawTo) {
    const z = sizePlan(sit), to = Math.min(Math.max(rawTo, sit.minTo), z.maxTo);
    if (to >= z.lo && to <= z.hi) return { far: false, line: `Размер ✅: до ${U.fmt(to)} (${z.what(to)}).` };
    const big = to > z.hi;
    return { far: to > 2 * z.ideal || to < z.ideal / 2,
      line: `Размер: рейз до ${U.fmt(to)} — ${big ? 'много, хватит' : 'мало, лучше'} ${U.fmt(z.ideal)} (${z.what(z.ideal)}).` };
  }

  // The grid key carries every input of the model, so grid(key) shows the verdicts of exactly this spot.
  function gridKey(sit) {
    const k = sit.kind;
    if (k === 'vsRaise' || k === 'vs3bet') {
      return `${k}:${sit.pos}:from=${sit.rPos}:style=${sit.rStyle}:n=${sit.n}:c=${sit.callers}:r=${sit.raises}:x=${sit.x}:d=${sit.d}:p=${Math.round(sit.pc * 100)}${sit.commit ? ':ai=1' : ''}`;
    }
    if (k === 'limped') return `limped:${sit.pos}:lim=${sit.limpers}`;
    return k === 'bbOption' ? (sit.limpers > 1 ? `BB:lim=${sit.limpers}` : 'BB') : sit.pos;
  }
  // A situation from a grid key: 'vsRaise:BB:from=BTN:style=maniac:x=2.5:d=100…'; plain 'vsRaise', 'vsRaise:POS',
  // 'vsRaise:POS:deep|short' (old keys) get typical values: a 3 BB raise from UTG (CO vs late seats), 100 BB.
  function sitFromKey(key, ctx = {}) {
    const [kind, kpos, ...rest] = String(key).split(':'), o = {};
    for (const r of rest) { const [k, v] = r.split('='); if (v === undefined) o.depth = r; else o[k] = v; }
    const pos = ctx.pos || (kpos && !kpos.includes('=') ? kpos : kind === 'BB' ? 'BB' : 'MP');
    if (kpos && kpos.includes('=')) { const [k, v] = kpos.split('='); o[k] = v; }
    const deep = ctx.deep !== undefined ? ctx.deep : o.depth === 'short' ? false : true;
    const rPos = o.from || (['BTN', 'SB', 'BB'].includes(pos) ? 'CO' : 'UTG');
    const x = +(o.x || (kind === 'vs3bet' ? 9 : 3)), raises = +(o.r || (kind === 'vs3bet' ? 2 : 1)), callers = +(o.c || 0);
    const potBB = 1.5 + x * (1 + callers), callBB = pos === 'BB' ? x - 1 : pos === 'SB' ? x - 0.5 : x;
    return { kind, pos, n: +(o.n || 9), rPos, rStyle: o.style || 'reg', rRevealed: false, rName: 'Соперник', callers, raises, x,
      d: deep ? +(o.d || 100) : Math.min(+(o.d || 40), 40), pc: o.p !== undefined ? +o.p / 100 : Math.round((100 * callBB) / (potBB + callBB)) / 100,
      ip: o.from ? POST.indexOf(pos) > POST.indexOf(rPos) : !['SB', 'BB'].includes(pos), commit: o.ai === '1', limpers: +(o.lim || 1),
      canRaise: true, allIn: false, toCall: 1, stack: 100, price: 0.5, raiseTo: x, bb: 1, effStack: 100 };
  }

  const CAPTION = { open: 'открытие', limped: 'против лимпа', bbOption: 'BB без повышения', vsRaise: 'против рейза', vs3bet: 'против 3-бета', walk: 'все сбросили' };
  // For the range browser: the hero's own preflop situation (works on later streets too).
  function mySituation(hand, seat) {
    if (!hand || !hand.hole || !hand.hole[seat]) return null;
    const sit = situation(hand, seat), hl = Cards.handCode(hand.hole[seat][0], hand.hole[seat][1]);
    const vs = sit.raiser !== null ? ` с ${sit.rPos}${sit.callers ? ` + ${U.nplural(sit.callers, 'колл', 'колла', 'коллов')}` : ''}, ${sit.x} BB, стек ${sit.d} BB` : '';
    return { key: gridKey(sit), caption: `${sit.pos}: ${CAPTION[sit.kind] || ''}${vs}`, hl };
  }

  const POS_INFO = {
    UTG: { group: 'Ранняя', text: 'Ранняя позиция: ты ходишь одним из первых, а после тебя почти весь стол. Играй только сильные руки — у кого-то сзади легко окажется рука лучше, а после флопа ты будешь без позиции.' },
    'UTG+1': { group: 'Ранняя', text: 'Ранняя позиция: после тебя ещё почти весь стол. Играй только сильные руки — диапазон такой же узкий, как у UTG.' },
    MP: { group: 'Средняя', text: 'Средняя позиция: часть игроков уже сбросила, но после тебя ещё много соперников. Диапазон чуть шире, чем в ранней позиции.' },
    LJ: { group: 'Средняя', text: 'Лоуджек — средняя позиция: после тебя ещё HJ, CO, баттон и блайнды. Диапазон как у MP: пары от 55, сильные тузы и картинки.' },
    HJ: { group: 'Средняя', text: 'Хайджек — последняя средняя позиция: после тебя только CO, баттон и блайнды. Можно добавить все пары и больше одномастных рук.' },
    CO: { group: 'Поздняя', text: 'Катофф — поздняя позиция: после тебя только баттон и блайнды, а после флопа ты часто ходишь последним. Открывай широко.' },
    BTN: { group: 'Поздняя', text: 'Баттон (дилер) — лучшая позиция: после флопа ты всегда ходишь последним и видишь действия соперников. Самый широкий диапазон.' },
    SB: { group: 'Блайнд', text: 'Малый блайнд: половина ставки уже внесена, но после флопа ты ходишь первым, без позиции. Открывай диапазоном CO.' },
    BB: { group: 'Блайнд', text: 'Большой блайнд: ставка уже внесена, и на префлопе ты ходишь последним. Если никто не повышал — смотри флоп бесплатно (чек), а с рукой из диапазона CO можно повысить.' },
  };

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // 'K-J разномастные', 'A-Q одномастные', 'пара семёрок'
  function codeRu(code) {
    const { hi, lo, type } = Cards.codeInfo(code);
    if (type === 'p') return 'пара ' + Cards.rankRu(hi, Cards.GEN_PL);
    return `${Cards.rankLabel(hi)}-${Cards.rankLabel(lo)} ${type === 's' ? 'одномастные' : 'разномастные'}`;
  }

  const NOUN = { fold: 'сброс', check: 'чек', call: 'колл', raise: 'рейз' };
  const INF = { fold: 'сбросить', check: 'чекнуть', call: 'заколлировать', raise: 'сделать рейз' };
  const noun = (a, kind) => (a === 'raise' && kind === 'vsRaise' ? '3-бет' : a === 'raise' && kind === 'vs3bet' ? '4-бет' : NOUN[a]);
  const inf = (a, kind) => (a === 'raise' && kind === 'vsRaise' ? 'сделать 3-бет (ререйз)' : a === 'raise' && kind === 'vs3bet' ? 'сделать 4-бет (ререйз)' : INF[a]);
  const posLine = (s) => `Ты на позиции ${s.pos} за столом на ${s.n}. ` +
    (s.playersAfter ? `После тебя ещё ${U.nplural(s.playersAfter, 'игрок', 'игрока', 'игроков')}.` : 'После тебя никого нет — ты ходишь последним.');

  // action: { type: 'fold'|'check'|'call'|'raise', to } or a type string.
  function evaluate(hand, seat, action, table) {
    const hole = hand.hole[seat];
    if (!hole) return null;
    const sit = situation(hand, seat), code = Cards.handCode(hole[0], hole[1]);
    const d = decide(sit, code);
    let t = typeof action === 'string' ? action : action && action.type;
    const raw = action && typeof action === 'object' ? (action.type === 'allin' ? Infinity : +action.to) : NaN;
    if (t === 'bet' || t === 'allin') t = 'raise';
    if (t === 'raise' && !sit.canRaise && sit.toCall) t = 'call'; // Engine turns it into a call
    if (t === 'call' && !sit.toCall) t = 'check';
    if (t === 'check' && sit.toCall) t = 'call';
    const vd = d.v[t] || M;
    // the size is graded too: a right raise of a poor size stays right, more than 2× off makes it only acceptable
    const size = t === 'raise' && vd !== M && raw > 0 ? sizeNote(sit, raw) : null;
    const verdict = vd === B && !(size && size.far) ? 'correct' : vd !== M ? 'acceptable' : 'mistake';
    const alts = Object.keys(d.v).filter((a) => a !== d.best && d.v[a] === B);
    const right = inf(d.best, sit.kind) + (alts.length ? ` (или ${alts.map((a) => inf(a, sit.kind)).join(', ')})` : '');
    const special = [];
    const inRange = open(sit.pos).has(code) || border(sit.pos).has(code);
    if (vd === M && t === 'call' && sit.kind === 'open' && inRange) special.push('Лимп отдаёт инициативу — либо рейз, либо сброс.');
    if (vd === M && t === 'call' && sit.kind === 'limped') {
      special.push(open(sit.pos).has(code) ? 'Не доплачивай с такой рукой — рейзи: изолируй лимперов и бери инициативу.'
        : 'Доплачивать с такой рукой — лишние потери: она слабая и без потенциала.');
    }
    if (t === 'fold' && sit.kind === 'bbOption') special.push('Никогда не сбрасывай, когда можно бесплатно чекнуть.');
    if (verdict === 'acceptable' && vd !== B) special.push(`Лучше: ${right}.`);
    const title = verdict === 'correct' ? `✅ Префлоп: ${noun(t, sit.kind)} — верно.`
      : verdict === 'acceptable' ? `⚠️ Префлоп: ${noun(t, sit.kind)} — ${vd === B ? 'верно, но размер неудачный' : 'допустимо'}.`
      : `❌ Префлоп: ты сыграл «${noun(t, sit.kind)}», правильно — ${right}.`;
    const p = pack([d.why[0], size && size.line, ...special, ...d.why.slice(1)]);
    return { kind: 'preflop', verdict, ok: verdict !== 'mistake', title, lines: p.lines, more: [posLine(sit), ...(p.more || []), ...d.more],
      grid: { key: gridKey(sit), hl: code }, best: d.best, verdicts: d.v, pos: sit.pos, code, situation: sit };
  }

  // Learning-mode hint before acting: what the position means, the situation, the grid — no verdict.
  function hint(hand, seat, table) {
    const s = situation(hand, seat), hole = hand.hole[seat], code = Cards.handCode(hole[0], hole[1]);
    const C = codeRu(code);
    const info = POS_INFO[s.pos] || { group: 'Блайнд', text: '' };
    const lines = [];
    const ask = (where) => `Найди свою руку (${C}) на сетке ${where}.`;
    if (s.kind === 'open') lines.push('До тебя все сбросили — ты открываешь торговлю.', ask(`диапазона ${s.pos}`));
    else if (s.kind === 'limped') lines.push(`Перед тобой ${U.nplural(s.limpers, 'лимпер', 'лимпера', 'лимперов')}: с рукой из диапазона — рейз.`, ask(`диапазона ${s.pos}`));
    else if (s.kind === 'bbOption') lines.push('Никто не повышал — чек бесплатный, сбрасывать нельзя.', ask('диапазона CO: если она там — можно рейз'));
    else if (s.kind === 'vsRaise') {
      const p = table && table.players[s.raiser], small = SMALL_PAIRS.has(code);
      lines.push(`${p ? p.name : 'Соперник'} (${hand.pos[s.raiser]}) повышает до ${U.fmt(s.raiseTo)} — играют гораздо уже.`,
        small ? `Маленькая пара: нужно ≥ 20 рейзов соперника в стеке (у тебя ${Math.floor(s.effStack / s.raiseTo)}).` : ask('против рейза'));
    } else if (s.kind === 'vs3bet') lines.push('Был рейз и ререйз — дальше играют только сильнейшие руки.', ask('против 3-бета'));
    else lines.push('Все сбросили — банк твой.');
    const more = [info.text];
    if (cheapAllIn(s)) lines.unshift(`Олл-ин: ${priceText(s)} — сравни цену с шансами банка.`);
    const group = info.group === 'Блайнд' ? 'блайнд' : info.group.toLowerCase() + ' позиция';
    return { title: `💡 Подсказка: ${s.pos} — ${group}`, ...pack(lines), more, grid: { key: gridKey(s), hl: code } };
  }

  // ---------- preflop pot-odds question (facing a raise / all-in) ----------
  function potSpot(hand, seat) {
    const s = situation(hand, seat), call = Math.min(s.toCall, s.stack);
    return { pre: true, pot: s.pot, toCall: call, betTo: s.raiseTo, needed: s.price * 100, potStart: s.pot, myBet: 0, short: false };
  }
  function questions(hand, seat, table, settings) {
    const on = (settings && settings.questions) || {};
    if (!hand || hand.street !== 'preflop' || on.potodds === false || !hand.hole[seat]) return [];
    const s = situation(hand, seat);
    if (!s.toCall || !(s.raises || s.allIn)) return [];
    const spot = potSpot(hand, seat);
    return [{ id: 'potodds', type: 'number', prompt: 'Какой процент нужен по шансам банка?', unit: '%', spot,
      info: { pot: spot.pot, bet: s.raiseTo, toCall: spot.toCall },
      hint: 'Нужный % = твой колл ÷ (банк вместе со ставками + твой колл) × 100. Можно округлять.' }];
  }
  // Answer check for questions(): the same grading as postflop (Coach.check), on the preflop pot.
  const check = (hand, seat, qid, value) => (typeof Coach !== 'undefined' ? Coach.check(potSpot(hand, seat), qid, value) : null);

  // ---------- teacher: the best action before the hero acts ----------
  function advise(hand, seat, table) {
    const hole = hand.hole[seat];
    if (!hole || hand.street !== 'preflop') return null;
    const sit = situation(hand, seat), code = Cards.handCode(hole[0], hole[1]);
    const d = decide(sit, code), heroIn = sit.heroIn;
    const size = d.best === 'raise' ? sizePlan(sit).ideal : undefined;
    const stackPct = (x) => U.pctNum((100 * x) / Math.max(1, hand.startStacks[seat]));
    const call = Math.min(sit.toCall, sit.stack);
    const risk = d.best === 'raise' ? `Риск: ${U.fmt(size - heroIn)} — ${stackPct(size - heroIn)} стека${sit.playersAfter ? `; после тебя ${sit.playersAfter} — могут ответить силой` : ''}.`
      : d.best === 'call' ? `Риск: ${U.fmt(call)} — ${stackPct(call)} стека; нужно ${U.pctNum(sit.price * 100)} эквити.`
      : d.best === 'check' ? 'Чек бесплатный — флоп даром.' : heroIn ? `Сброс: теряешь только уже вложенные ${U.fmt(heroIn)}.` : 'Сброс ничего не стоит.';
    const alt = Object.keys(d.v).filter((a) => a !== d.best && (d.v[a] === B || d.v[a] === OK));
    const altLine = alt.length ? `${cap(alt.map((a) => noun(a, sit.kind)).join(' или '))} тоже нормально.` : null;
    const what = noun(d.best, sit.kind) + (size ? ` до ${U.fmt(size)}${size >= sit.heroIn + sit.stack ? ' (олл-ин)' : ''}` : '');
    return { best: d.best, size, title: `👨‍🏫 Лучше: ${what}`, lines: [d.why[0], risk, altLine].filter(Boolean),
      more: [...d.why.slice(1), ...d.more], grid: { key: gridKey(sit), hl: code } };
  }

  // 13 rows × 13 cells {code, cls} in Cards.gridCode order (row i, column j).
  // key: a position (open table, 'in'/'border'/'out'); 'BB' (BB option); 'limped:POS…', 'vsRaise:POS…', 'vs3bet:POS…'
  // (see gridKey / sitFromKey) → 'raise' | 'call' | 'border' (fold best, another option ok) | 'out', from decide().
  // ctx = { pos, deep } (optional, overrides the key).
  function grid(key, ctx = {}) {
    const kind = String(key).split(':')[0];
    const model = ['vsRaise', 'vs3bet', 'limped'].includes(kind) || (kind === 'BB' && String(key).includes('lim='));
    const sit = model ? sitFromKey(key, ctx) : null;
    if (sit && (kind === 'BB' || sit.pos === 'BB') && kind !== 'vsRaise' && kind !== 'vs3bet') sit.kind = 'bbOption'; // 'limped:BB' too
    const cls = (code) => {
      if (!sit) return open(key).has(code) ? 'in' : border(key).has(code) ? 'border' : 'out';
      const d = decide(sit, code);
      return d.best === 'raise' ? (kind === 'BB' ? 'in' : 'raise') : d.best === 'call' ? 'call' : Object.values(d.v).includes(OK) ? 'border' : 'out';
    };
    return Array.from({ length: 13 }, (_, i) => Array.from({ length: 13 }, (_, j) => {
      const code = Cards.gridCode(i, j);
      return { code, cls: cls(code) };
    }));
  }

  return { OPEN_TEXT, POS_INFO, VS_RAISE_TEXT, open, border, situation, evaluate, hint, grid, gridKey, mySituation, codeRu,
    questions, check, potSpot, advise, pack, sizePlan };
})();
