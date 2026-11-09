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
  const PREMIUM = set('QQ+, AK'), PAIRS = set('JJ-22'), SMALL_PAIRS = set('66-22');
  const SUITED_CALL = set('AQs, AJs, KQs'), CONNECTORS = set('76s, 87s, 98s, T9s, JTs, QJs'), VS_BORDER = set('AQo, ATs, KJs');
  const VS_CALL = set('JJ-22, AQs, AJs, KQs, 76s, 87s, 98s, T9s, JTs, QJs');
  const isLate = (pos) => pos === 'BTN' || pos === 'CO';
  const VS_RAISE_TEXT = 'Против рейза: 3-бет — QQ+, AK; колл — JJ–22 (маленькие пары — если стек ≥ 20 рейзов), AQs, AJs, KQs, одномастные коннекторы 76s+ (только на BTN/CO); остальное — сброс.';

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
    return { kind, pos, n: hand.order.length, playersAfter, limpers, raises, raiser, raiseTo, effStack, toCall,
      stack, canRaise, pot, price: call ? call / (pot + call) : 0, allIn: raiser !== null && !!hand.allIn[raiser] };
  }

  const B = 'best', OK = 'ok', M = 'mistake';
  // No more betting after this call (short shove, or the hero's last chips) and at most 20% needed.
  const cheapAllIn = (sit) => (sit.allIn || sit.stack <= sit.toCall) && sit.price <= 0.2;
  const priceText = (sit) => `доплатить нужно всего ${U.fmt(Math.min(sit.toCall, sit.stack))} при банке ${U.fmt(sit.pot)}`;
  const V = (best, fold, call, raise, check) => ({ best, v: check ? { fold, check, raise } : { fold, call, raise } });

  // Verdicts by the SPEC tables + explanation lines (independent of the action actually taken).
  function decide(sit, code, hand, table) {
    const { kind, pos } = sit;
    const pair = code.length === 2, C = cap(codeRu(code));
    const enters = (yes) => (yes ? '' : 'не ') + (pair ? 'входит' : 'входят');
    const text = OPEN_TEXT[pos] || CO_TEXT;
    const why = [];
    let d;
    if (kind === 'open') {
      if (open(pos).has(code)) { d = V('raise', M, M, B); why.push(`${C} ${enters(true)} в диапазон этой позиции (${text}) — открывай рейзом.`); }
      else if (border(pos).has(code)) { d = V('fold', B, M, OK); why.push(`${C} — рука на границе диапазона: в таблице этой позиции (${text}) её нет, но она соседняя. Рейз допустим, надёжнее — сбросить.`); }
      else { d = V('fold', B, M, M); why.push(`${C} ${enters(false)} в диапазон этой позиции (${text}).`); }
    } else if (kind === 'limped') {
      const { hi, lo, type } = Cards.codeInfo(code);
      const speculative = pair || (type === 's' && (hi === 14 || (hi - lo === 1 && lo >= 4)));
      const limp = speculative && (isLate(pos) || pos === 'SB') ? OK : M;
      why.push(`Перед тобой ${U.nplural(sit.limpers, 'лимпер', 'лимпера', 'лимперов')}: ${sit.limpers > 1 ? 'игроки просто уравняли' : 'игрок просто уравнял'} большой блайнд.`);
      if (open(pos).has(code)) { d = V('raise', M, limp, B); why.push(`${C} ${enters(true)} в диапазон ${pos} (${text}) — рейзи: изолируй лимперов и забери инициативу.`); }
      else { d = V('fold', B, limp, border(pos).has(code) ? OK : M); why.push(`${C} ${enters(false)} в диапазон ${pos} (${text}).`); }
      if (limp === OK) why.push('Доплатить (оверлимп) допустимо: пары, одномастные коннекторы и одномастные тузы в поздней позиции и на малом блайнде дёшево смотрят флоп.');
    } else if (kind === 'bbOption') {
      const inCO = open('CO').has(code);
      d = V(inCO ? 'raise' : 'check', M, null, inCO ? B : M, B);
      why.push('Никто не повышал — ты на большом блайнде и можешь бесплатно посмотреть флоп.');
      why.push(inCO ? `${C} ${enters(true)} в диапазон CO (${CO_TEXT}) — можно повысить, чек тоже верен.`
        : `${C} ${enters(false)} в диапазон CO (${CO_TEXT}) — повышать незачем, просто чек.`);
    } else if (kind === 'vsRaise') {
      const late = isLate(pos), p = table && table.players[sit.raiser];
      why.push(`${p ? p.name : 'Соперник'} (${hand.pos[sit.raiser]}) повышает до ${U.fmt(sit.raiseTo)}.`);
      if (PREMIUM.has(code)) {
        d = V('raise', M, OK, B);
        why.push(sit.canRaise ? 'QQ+ и AK против рейза — 3-бет (ререйз): строй банк с лучшей рукой. Колл тоже допустим.'
          : 'QQ+ и AK — лучшие руки против рейза. Повысить уже нельзя, так что просто колл.');
      } else if (SMALL_PAIRS.has(code)) {
        const deep = sit.effStack >= 20 * sit.raiseTo;
        d = deep ? V('call', M, B, M) : V('fold', B, M, M);
        why.push(`Игра на сет: нужно ≥ 20 рейзов соперника в стеке, у тебя ${Math.floor(sit.effStack / sit.raiseTo)}${deep ? ' — хватает, колл.' : ' — мало, сброс.'}`);
      } else if (PAIRS.has(code)) {
        const jt = code === 'JJ' || code === 'TT';
        d = V('call', M, B, jt ? OK : M);
        why.push(`Пары JJ–22 против рейза — колл${jt ? ' (3-бет с JJ и TT тоже допустим)' : ''}.`);
      } else if (SUITED_CALL.has(code)) {
        const aq = code === 'AQs';
        d = V('call', M, B, aq ? OK : M);
        why.push(`${C} против рейза — колл${aq ? ' (3-бет тоже допустим)' : ''}.`);
      } else if (CONNECTORS.has(code) && late) {
        d = V('call', M, B, M);
        why.push('Одномастные коннекторы 76s+ на BTN/CO — колл: ты в позиции, и рука хорошо собирает стриты и флеши.');
      } else if (VS_BORDER.has(code) || (code === 'QJs' && !late) || (code === '65s' && late)) {
        d = V('fold', B, OK, M);
        why.push(`${C} — рука на границе: колл допустим, но по таблице это сброс.`);
      } else {
        d = V('fold', B, M, M);
        why.push(CONNECTORS.has(code) ? 'Одномастные коннекторы против рейза коллируют только на BTN/CO — здесь сброс.'
          : `${C} ${enters(false)} в список рук для игры против рейза — сброс.`);
      }
      why.push(VS_RAISE_TEXT);
    } else if (kind === 'vs3bet') {
      if (PREMIUM.has(code)) {
        d = V('raise', M, OK, B);
        why.push(sit.canRaise ? 'Против рейза и ререйза продолжай только с QQ+ и AK: лучше ещё один ререйз, колл допустим.'
          : 'Против рейза и ререйза продолжай только с QQ+ и AK. Повысить уже нельзя, так что просто колл.');
      } else if (code === 'JJ' || code === 'AQs') { d = V('fold', B, OK, M); why.push(`Против рейза и ререйза играют только QQ+ и AK. ${C} — на границе: колл допустим, но надёжнее сбросить.`); }
      else { d = V('fold', B, M, M); why.push('Против рейза и ререйза играют только QQ+ и AK, остальное — сброс.'); }
    } else {
      d = { best: 'check', v: { check: B } };
      why.push('Все сбросили — банк твой без борьбы.');
    }
    if (!sit.canRaise && d.v.raise) { // only call or fold is left
      const { raise, ...v } = d.v;
      d = raise === B && d.best === 'raise' ? { best: 'call', v: { ...v, call: B } } : { best: d.best, v };
    }
    // The tables assume a normal raise. Against a short shove, or when the call is the hero's last chips,
    // there is no more betting: a tiny price makes calling right with almost anything.
    if (cheapAllIn(sit) && d.best === 'fold') {
      const p = table && table.players[sit.raiser];
      d = { best: 'call', v: { ...d.v, fold: M, call: B } };
      why.push(`${sit.allIn ? `${p ? p.name : 'Соперник'} идёт олл-ин` : 'Твой колл — это олл-ин'}, и ${priceText(sit)}: ` +
        `хватит ${U.pctNum(sit.price * 100)} эквити — столько есть почти у любой руки. Колл.`);
    }
    return { ...d, why };
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
    const d = decide(sit, code, hand, table);
    let t = typeof action === 'string' ? action : action && action.type;
    if (t === 'bet' || t === 'allin') t = 'raise';
    if (t === 'raise' && !sit.canRaise && sit.toCall) t = 'call'; // Engine turns it into a call
    if (t === 'call' && !sit.toCall) t = 'check';
    if (t === 'check' && sit.toCall) t = 'call';
    const vd = d.v[t] || M;
    const verdict = vd === B ? 'correct' : vd === OK ? 'acceptable' : 'mistake';
    const alts = Object.keys(d.v).filter((a) => a !== d.best && d.v[a] === B);
    const right = inf(d.best, sit.kind) + (alts.length ? ` (или ${alts.map((a) => inf(a, sit.kind)).join(', ')})` : '');
    const lines = [posLine(sit), ...d.why];
    const inRange = open(sit.pos).has(code) || border(sit.pos).has(code);
    if (vd === M && t === 'call' && sit.kind === 'open' && inRange) lines.push('Лимп отдаёт инициативу — либо рейз, либо сброс.');
    if (vd === M && t === 'call' && sit.kind === 'limped') {
      lines.push(open(sit.pos).has(code) ? 'Не доплачивай с такой рукой — рейзи: так ты изолируешь лимперов и берёшь инициативу.'
        : 'Доплачивать с такой рукой — лишние потери: она слабая и без потенциала.');
    }
    if (t === 'fold' && sit.kind === 'bbOption') lines.push('Никогда не сбрасывай, когда можно бесплатно чекнуть.');
    if (verdict === 'mistake') lines.push(`Правильно: ${right}.`);
    if (verdict === 'acceptable') lines.push(`Лучше: ${right}.`);
    const title = verdict === 'correct' ? `✅ Префлоп: ${noun(t, sit.kind)} — верно.`
      : verdict === 'acceptable' ? '⚠️ Префлоп: допустимо.'
      : `❌ Префлоп: ты сыграл «${noun(t, sit.kind)}», правильно — ${right}.`;
    return { kind: 'preflop', verdict, ok: verdict !== 'mistake', title, lines, best: d.best, verdicts: d.v, pos: sit.pos, code, situation: sit };
  }

  // Learning-mode hint before acting: what the position means, the situation, the range — no verdict.
  function hint(hand, seat, table) {
    const s = situation(hand, seat), hole = hand.hole[seat];
    const C = codeRu(Cards.handCode(hole[0], hole[1]));
    const info = POS_INFO[s.pos] || { group: 'Блайнд', text: '' };
    const lines = [info.text];
    const ask = (where) => `Спроси себя: есть ли твоя рука (${C}) ${where}?`;
    const behind = s.playersAfter ? ` И сколько игроков после тебя (${s.playersAfter}) ещё могут проснуться с сильной рукой?` : '';
    if (s.kind === 'open') {
      lines.push(`До тебя все сбросили — ты открываешь торговлю. Диапазон открытия ${s.pos}: ${OPEN_TEXT[s.pos]}.`, ask('в этом диапазоне') + behind);
    } else if (s.kind === 'limped') {
      lines.push(`Перед тобой ${U.nplural(s.limpers, 'лимпер', 'лимпера', 'лимперов')}. С рукой из диапазона ${s.pos} (${OPEN_TEXT[s.pos]}) — рейз; пары, одномастные коннекторы и одномастные тузы в поздней позиции можно доплатить; остальное — сброс.`,
        ask('в этом диапазоне') + ' Если нет — стоит ли она того, чтобы доплачивать?');
    } else if (s.kind === 'bbOption') {
      lines.push(`Никто не повышал — чек бесплатный. Повышать стоит с руками из диапазона CO: ${CO_TEXT}.`, ask('в диапазоне CO') + ' Если нет — просто чек, сбрасывать нельзя.');
    } else if (s.kind === 'vsRaise') {
      const p = table && table.players[s.raiser], small = SMALL_PAIRS.has(Cards.handCode(hole[0], hole[1]));
      lines.push(`${p ? p.name : 'Соперник'} (${hand.pos[s.raiser]}) повышает до ${U.fmt(s.raiseTo)}. Против рейза играют гораздо уже, чем при открытии. ${VS_RAISE_TEXT}`,
        ask('в этом списке') + (small ? ` Для маленькой пары проверь стек: нужно ≥ 20 рейзов соперника (у тебя ${Math.floor(s.effStack / s.raiseTo)}).` : ''));
    } else if (s.kind === 'vs3bet') {
      lines.push('Был рейз и ререйз — дальше играют только QQ+ и AK.', ask('среди них'));
    } else {
      lines.push('Все сбросили — банк твой.');
    }
    if (cheapAllIn(s)) lines.push(`Но это олл-ин, и ${priceText(s)} — сравни цену с шансами банка, прежде чем сбрасывать.`);
    const group = info.group === 'Блайнд' ? 'блайнд' : info.group.toLowerCase() + ' позиция';
    return { title: `💡 Подсказка: ${s.pos} — ${group}`, lines };
  }

  // 13 rows × 13 cells {code, cls} in Cards.gridCode order (row i, column j).
  function grid(key) {
    const cls = (code) => {
      if (key === 'vsRaise') return PREMIUM.has(code) ? 'raise' : VS_CALL.has(code) ? 'call' : 'out';
      if (key === 'vs3bet') return PREMIUM.has(code) ? 'raise' : 'out';
      return open(key).has(code) ? 'in' : border(key).has(code) ? 'border' : 'out';
    };
    return Array.from({ length: 13 }, (_, i) => Array.from({ length: 13 }, (_, j) => {
      const code = Cards.gridCode(i, j);
      return { code, cls: cls(code) };
    }));
  }

  return { OPEN_TEXT, POS_INFO, open, border, situation, evaluate, hint, grid, codeRu };
})();
