// ===== Game: controller — session setup, the async hand loop, coach flow, tournament bookkeeping =====
// One session object S drives everything; UI renders from it. Every pause point goes through wait()/guard(),
// so leaving to the menu (token.kill) unwinds the loop, and Pause freezes the timers.
const Game = (() => {
  const LEVELS = [[10, 20], [15, 30], [20, 40], [30, 60], [40, 80], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400],
    [300, 600], [400, 800], [500, 1000], [700, 1400], [1000, 2000], [1500, 3000], [2000, 4000], [3000, 6000], [5000, 10000]];
  const LOOK_MS = { slow: 3000, normal: 2000, fast: 1600 };
  const QCAT = { outs: 'outs', cards: 'outs', equity: 'equity', potodds: 'potodds' };
  const CANCEL = { cancelled: true };
  const fmt = U.fmt;
  let S = null;
  const api = { autoplay: false }; // Game.autoplay = true → the human acts automatically (tests)

  const auto = () => api.autoplay;
  const speed = () => (auto() ? 0 : Settings.speedFactor());
  const hasCoach = () => typeof Coach !== 'undefined';
  const P = (seat) => S.table.players[seat];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const fem = (name) => /[ая]$/.test(String(name).split(' ')[0]);
  // Genitive of a first name for «Стиль Игоря»: Игорь → Игоря, Ольга → Ольги, Павел → Павла.
  function gen(name) {
    const [w, ...rest] = String(name).split(' ');
    const g = w === 'Павел' ? 'Павла' : /[ьй]$/.test(w) ? w.slice(0, -1) + 'я' : /[гкхжшщч]а$/.test(w) ? w.slice(0, -1) + 'и'
      : /а$/.test(w) ? w.slice(0, -1) + 'ы' : /я$/.test(w) ? w.slice(0, -1) + 'и' : w + 'а';
    return [g, ...rest].join(' ');
  }

  // ---------- cancellable, pausable waiting ----------
  function newToken() {
    const t = { cancelled: false };
    t.dead = new Promise((_, rej) => { t.kill = () => { t.cancelled = true; rej(CANCEL); }; });
    t.dead.catch(() => {});
    return t;
  }
  // Holds while paused, and on narrow screens while the coach sheet covers the table (the player is reading).
  async function wait(ms) {
    const s = S, tok = s.token;
    const held = () => s.paused || (!auto() && UI.held);
    let left = ms * speed(), h;
    do {
      h = held();
      if (UI.holding) UI.holding(h && !s.paused);
      const step = h ? 100 : Math.min(left, 50);
      await U.sleep(step);
      if (tok.cancelled) throw CANCEL;
      if (!h) left -= step;
    } while (left > 0 || h);
    if (UI.holding) UI.holding(false);
  }
  // Pause bookkeeping: S.pausedMs is the total paused time, so decision timers can leave it out.
  function setPaused(s, on) {
    if (s.paused === on) return;
    if (on) s.pausedAt = U.now(); else s.pausedMs += U.now() - s.pausedAt;
    s.paused = on;
  }
  const pausedTotal = (s) => s.pausedMs + (s.paused ? U.now() - s.pausedAt : 0);
  async function guard(p) {
    const tok = S.token;
    const v = await Promise.race([p, tok.dead]);
    if (tok.cancelled) throw CANCEL;
    return v;
  }
  async function withPause(p) {
    const s = S;
    if (!s) return p;
    const was = s.paused;
    setPaused(s, true); UI.render();
    try { return await p; } finally { if (S === s) { setPaused(s, was); UI.render(); } }
  }

  // ---------- session ----------
  function boot() {
    if (typeof location !== 'undefined' && /autoplay/.test(location.hash)) api.autoplay = true;
    toMenu();
  }
  function stop() { if (S) { S.token.kill(); S = null; } if (View.clearToasts) View.clearToasts(); } // toasts belong to the game left
  function toMenu() { stop(); Screens.menu({ onStart: start }); }
  const state = () => (S ? { table: S.table, hand: S.hand, mode: S.mode, over: S.over, paused: S.paused } : null);

  const handlers = {
    cheat: () => withPause(Screens.cheatSheet()),
    stats: () => withPause(Screens.statsModal ? Screens.statsModal() : Promise.resolve()),
    pause: () => { setPaused(S, !S.paused); UI.render(); },
    menu: async () => {
      const ok = await withPause(View.modal('Выйти в меню?', '<p>Текущая игра закончится. Статистика ответов уже сохранена.</p>',
        { buttons: [{ label: 'Остаться', value: false, cls: 'btn-primary' }, { label: 'Выйти в меню', value: true, cls: 'btn-danger' }] }));
      if (ok) toMenu();
    },
    hint: () => {
      const h = S.hint && S.hint();
      S.hint = null;
      UI.render();
      if (h) { UI.coachFb({ kind: 'hint', verdict: 'info', title: h.title || '💡 Подсказка', lines: h.lines || [] }); UI.openSheet('coach'); }
    },
    range: () => {
      const k = S.rangeKey;
      if (k) withPause(Screens.rangeModal(k, k === 'vsRaise' ? 'Против рейза' : k === 'vs3bet' ? 'Против рейза и ререйза' : `Диапазон открытия: ${k}`));
    },
    reveal: (seat) => { if (S.mode === 'learn' && P(seat)) P(seat).revealed = true; },
  };

  function start(mode) {
    stop();
    if (!['learn', 'practice', 'tournament'].includes(mode)) mode = 'learn';
    const st = Settings.get();
    const n = U.clamp(st.players | 0, 2, 9), stack = st.startBB * 20;
    const styles = st.botsMode === 'manual' ? st.botStyles.slice(0, n - 1) : Bots.randomLineup(n - 1);
    const players = [{ name: 'Ты', isHuman: true, stack, avatar: { initials: 'Ты', color: '#b8862e' } }];
    const used = ['Ты'];
    for (const style of styles) {
      const b = Bots.createBot({ style, usedNames: used });
      used.push(b.name);
      players.push({ ...b, stack });
    }
    const table = Engine.createTable({ players, sb: LEVELS[0][0], bb: LEVELS[0][1], button: U.randInt(0, n - 1) });
    const anim = auto() ? 0 : Settings.speedFactor();
    document.documentElement.style.setProperty('--speed', String(Math.max(anim, 0.01)));
    S = {
      mode, st, table, hand: null, token: newToken(), paused: false, pausedMs: 0, pausedAt: 0, anim, startStack: stack,
      level: 0, levelInfo: null, notes: [], thinkHist: [], decisions: 0, lastTimingAt: -99,
      places: [], tMistakes: [], over: null, ctx: null,
      boardShown: 0, reveal: new Set(), winners: null, payouts: null, hl: null, acts: {}, turn: null, caption: '', paid: false,
      hint: null, rangeKey: null, asking: false,
    };
    Stats.beginSession(mode);
    if (hasCoach() && Coach.timing) Coach.timing.reset();
    UI.mount(S, handlers);
    run(S);
  }

  async function run(s) {
    let fails = 0;
    while (S === s && !s.over) {
      try {
        if (await beforeHand()) return;
        await playHand();
        if (await afterHand()) return;
        fails = 0;
      } catch (e) {
        if (e === CANCEL || s.token.cancelled) return;
        console.error(e);
        View.toast(`Сбой в раздаче: ${e && e.message ? e.message : e}. Раздача отменена, фишки возвращены.`, 6000);
        voidHand(s);
        if (++fails >= 3) { toMenu(); return; }
        try { await wait(1200); } catch (_) { return; }
      }
    }
  }

  // An aborted hand is voided: everyone gets their stack from before the blinds back.
  function voidHand(s) {
    const h = s.hand;
    if (!h || h.phase === 'done') return;
    s.table.players.forEach((p, i) => { if (h.startStacks[i] !== undefined) p.stack = h.startStacks[i]; });
    h.phase = 'done';
  }

  // ---------- between hands ----------
  async function beforeHand() {
    const { table, mode, st } = S;
    S.notes = [];
    if (mode === 'tournament') {
      const lvl = Math.min(LEVELS.length - 1, Math.floor(table.handNo / st.levelHands));
      if (lvl !== S.level) {
        S.level = lvl;
        [table.sb, table.bb] = LEVELS[lvl];
        View.toast(`Блайнды выросли: ${fmt(table.sb)}/${fmt(table.bb)}`);
        S.notes.push(`Блайнды выросли: ${fmt(table.sb)}/${fmt(table.bb)}`);
      }
      S.levelInfo = { level: lvl + 1, left: lvl < LEVELS.length - 1 ? (lvl + 1) * st.levelHands - table.handNo : 0 };
      return false;
    }
    for (const p of table.players) {
      if (!p.isHuman && p.stack <= 0) { p.stack = S.startStack; S.notes.push(`${p.name} ${fem(p.name) ? 'докупилась' : 'докупился'} до ${fmt(S.startStack)}`); }
    }
    if (table.players[0].stack <= 0) {
      const v = auto() ? 'rebuy' : await guard(View.modal('Фишки закончились',
        `<p>Твой стек пуст. Докупись до ${fmt(S.startStack)} и продолжай тренировку или выйди в меню.</p>`,
        { buttons: [{ label: 'Докупиться', value: 'rebuy', cls: 'btn-primary' }, { label: 'В меню', value: 'menu' }] }));
      if (v === 'menu') { toMenu(); return true; }
      table.players[0].stack = S.startStack;
      S.notes.push(`Докупка: твой стек снова ${fmt(S.startStack)}`);
    }
    return false;
  }

  // ---------- one hand ----------
  async function playHand() {
    const { table } = S;
    Object.assign(S, { boardShown: 0, reveal: new Set(), winners: null, payouts: null, hl: null, acts: {}, turn: null,
      caption: '', paid: false, hint: null, rangeKey: null, asking: false });
    UI.coachClear();
    UI.logReset();
    const hand = Engine.startHand(table);
    S.hand = hand;
    S.ctx = { spots: [], reads: [], missed: [], seen: [], think: {}, shownThink: {}, vpip: new Set(), pfr: new Set(), review: [], humanLast: null };
    for (const s of hand.seats) if (s !== 0) table.players[s].hud.hands++;
    for (const t of S.notes) UI.logLine(t, 'note');
    UI.logStreet('preflop');
    hand.log.forEach(logEntry);
    UI.render();
    UI.deal(hand.seats, 260 * S.anim);
    await wait(380 + 70 * hand.seats.length);
    while (hand.phase !== 'done') {
      if (hand.phase === 'betting') {
        if (hand.toAct === 0) await humanTurn(); else await botTurn(hand.toAct);
      } else {
        if (hand.bets.some((b) => b > 0)) { UI.collect(280 * S.anim); await wait(320); }
        const ev = Engine.advance(hand);
        if (ev.returned) UI.logLine(`${P(ev.returned.seat).name}: несыгранная ставка ${fmt(ev.returned.amount)} возвращена`, 'note');
        if (ev.type === 'street') await onStreet(ev); else await onResult(ev);
      }
    }
  }

  const ACT = { fold: () => 'сброс', check: () => 'чек', call: (e) => `колл ${fmt(e.add)}`, bet: (e) => `ставка ${fmt(e.to)}`,
    raise: (e) => `рейз до ${fmt(e.to)}`, sb: (e) => `малый блайнд ${fmt(e.add)}`, bb: (e) => `большой блайнд ${fmt(e.add)}` };
  const actText = (e) => (ACT[e.type] ? ACT[e.type](e) : e.type) + (e.allIn ? ' (олл-ин)' : '');
  function logEntry(e) { UI.logLine(`${P(e.seat).name} (${S.hand.pos[e.seat]}) — ${actText(e)}`, e.seat === 0 ? 'me' : ''); }

  function afterAction(seat, e) {
    S.acts[seat] = e.allIn && e.type !== 'fold' ? 'Олл-ин' : cap(actText(e));
    S.caption = `${P(seat).name}: ${actText(e)}`;
    logEntry(e);
    UI.render();
  }

  function humanInfo() {
    const h = S.thinkHist.slice(-20);
    return { seat: 0, lastAction: S.ctx.humanLast, avgThinkMs: h.length ? U.sum(h) / h.length : 0 };
  }

  async function botTurn(seat) {
    const { hand, table } = S;
    const legal = Engine.legal(hand);
    S.turn = seat;
    UI.render();
    const d = Bots.decide({ table, hand, seat, legal, human: humanInfo() });
    const pre = hand.street === 'preflop';
    // the hero folded: play the rest out faster; preflop folds carry no tell, so they don't make the hero wait long
    const k = (Engine.inHand(hand, 0) ? 1 : 0.35) * (pre && d.action.type === 'fold' ? 0.4 : 1);
    await wait(d.thinkMs * k);
    const entry = Engine.act(hand, d.action);
    S.ctx.think[seat] = d.thinkMs;
    S.ctx.shownThink[seat] = d.thinkMs * k * Settings.speedFactor(); // the pause the player actually saw
    const hud = P(seat).hud;
    if (pre && (entry.type === 'call' || entry.type === 'bet' || entry.type === 'raise')) {
      if (!S.ctx.vpip.has(seat)) { S.ctx.vpip.add(seat); hud.vpip++; }
      if (entry.type !== 'call' && !S.ctx.pfr.has(seat)) { S.ctx.pfr.add(seat); hud.pfr++; }
    }
    S.turn = null;
    afterAction(seat, entry);
    if (Bots.betReaction && Engine.inHand(hand, 0)) {
      const r = Bots.betReaction({ table, hand, seat, entry });
      if (r) { UI.bubble(seat, r, 2200 * speed()); S.ctx.seen.push(r); }
    }
    await wait(160);
  }

  // ---------- the human's decision ----------
  function situationHTML(hand) {
    const sit = Ranges.situation(hand, 0), pos = hand.pos[0];
    const info = Ranges.POS_INFO[pos] || { group: '' };
    const k = sit.kind;
    const parts = [`Твоя позиция: <b>${pos}</b> (${info.group === 'Блайнд' ? 'блайнд' : info.group.toLowerCase()}).`];
    if (k === 'open') parts.push('До тебя все сбросили.');
    else if (k === 'limped') parts.push(`До тебя без повышения вошли: ${U.nplural(sit.limpers, 'игрок', 'игрока', 'игроков')}.`);
    else if (k === 'bbOption') parts.push('Никто не повышал — можно бесплатно посмотреть флоп.');
    else if (k === 'vsRaise') parts.push(`${U.esc(P(sit.raiser).name)} (${hand.pos[sit.raiser]}) повышает до ${fmt(sit.raiseTo)}.`);
    else if (k === 'vs3bet') parts.push(`Был рейз и ререйз — до ${fmt(sit.raiseTo)}.`);
    parts.push(`Рука: <b>${View.suitText(Cards.strList(hand.hole[0]).replace(' ', ''))}</b>.`);
    parts.push(k === 'vsRaise' || k === 'vs3bet' ? 'Стоит ли продолжать с этой рукой?' : k === 'bbOption' ? 'Стоит ли повышать с этой рукой?' : 'Входит ли она в диапазон?');
    return parts.join(' ') + '<div class="row"><button class="btn btn-sm" data-cmd="hint">💡 Подсказка</button><button class="btn btn-sm" data-cmd="range">Посмотреть диапазон</button></div>';
  }

  async function humanTurn() {
    const { hand, table, mode, st } = S, ctx = S.ctx;
    const street = hand.street, pre = street === 'preflop';
    const legal = Engine.legal(hand);
    let spot = null;
    S.turn = 0;
    if (pre) {
      const sit = Ranges.situation(hand, 0);
      S.rangeKey = mode === 'tournament' ? null : sit.kind === 'vsRaise' || sit.kind === 'vs3bet' ? sit.kind : sit.pos;
      S.hint = mode === 'learn' ? () => Ranges.hint(hand, 0, table) : null;
      if (mode === 'learn' && st.questions.preflop) UI.coachAdd(situationHTML(hand), 'c-prompt', `Твой ход: ${hand.pos[0]}, ${Cards.strList(hand.hole[0])}`);
      UI.render();
    } else {
      UI.render();
      spot = hasCoach() ? Coach.analyze(hand, 0, table) : null;
      if (spot) ctx.spots.push(spot);
      if (mode !== 'tournament') {
        await askRead();
        if (spot && (mode === 'learn' || U.chance(st.practiceFreq / 100))) await askSpot(spot);
      }
    }
    const t0 = U.now(), p0 = pausedTotal(S);
    const action = await guard(UI.askAction(legal, auto() ? autoAction(legal) : null));
    const ms = auto() ? U.randInt(800, 3000) : U.now() - t0 - (pausedTotal(S) - p0); // paused time is not thinking time
    S.hint = null; S.rangeKey = null;
    // evaluate against the pre-action state
    const pfb = pre && st.questions.preflop ? Ranges.evaluate(hand, 0, action, table) : null;
    const afb = spot ? Coach.evaluateAction(spot, action) : null;
    const strong = hasCoach() && Coach.heroStrong ? Coach.heroStrong(hand.hole[0], hand.board) : false;
    const entry = Engine.act(hand, action);
    S.turn = null;
    afterAction(0, entry);
    if (pfb) judge(pfb, 'preflop', { pos: hand.pos[0] });
    if (afb) judge(afb, 'action');
    ctx.humanLast = { street, type: entry.type, thinkMs: ms };
    S.thinkHist.push(ms);
    if (S.thinkHist.length > 40) S.thinkHist.shift();
    if (hasCoach() && Coach.timing) {
      Coach.timing.add(ms, strong);
      S.decisions++;
      const w = Coach.timing.warning();
      if (w && S.decisions - S.lastTimingAt >= 10) {
        S.lastTimingAt = S.decisions;
        const fb = { kind: 'timing', verdict: 'acceptable', title: '⚠️ Тайминг выдаёт силу руки', lines: [w], boardN: S.boardShown };
        if (mode === 'tournament') ctx.review.push(fb); else UI.coachFb(fb);
      }
    }
  }

  // Feedback per mode: learn — always; practice — unless correct; tournament — mistakes queued for the review.
  function judge(fb, cat, opts) {
    const ok = fb.verdict !== 'mistake';
    fb.boardN = S.boardShown; // the board the player saw when deciding (tournament review)
    Stats.record(cat, ok, opts);
    if (!ok) addMistake(fb, cat);
    if (S.mode === 'learn' || (S.mode === 'practice' && fb.verdict !== 'correct')) UI.coachFb(fb);
    else if (S.mode === 'tournament' && !ok) S.ctx.review.push(fb);
  }
  function addMistake(fb, cat) {
    const h = S.hand;
    Stats.addMistake({ cat, title: fb.title, lines: fb.lines, handNo: h.no, mode: S.mode, pos: h.pos[0], hole: h.hole[0], board: h.board.slice(0, S.boardShown) });
  }

  async function askRead() {
    const { hand, table, mode, st } = S;
    if (!st.questions.read || !hasCoach()) return;
    const rq = Coach.readQuestion(hand, 0, table);
    if (!rq || !U.chance(mode === 'learn' ? 0.5 : (0.5 * st.practiceFreq) / 100)) return;
    const b = P(rq.bettor);
    const sub = `${b.name}: ставка ${fmt(hand.bets[rq.bettor])}` + (rq.sizeFrac ? ` — ${U.pct(rq.sizeFrac)} банка` : '');
    S.asking = true; UI.render();
    const q = { id: 'read', type: 'choice', prompt: 'Что, скорее всего, у соперника?', options: rq.options };
    const answer = await guard(UI.askQuestion(q, { sub, hole: hand.hole[0], board: hand.board }, auto() ? U.pick(rq.options).v : null));
    S.asking = false;
    S.ctx.reads.push({ read: rq, answer, thinkMs: S.ctx.think[rq.bettor], shownMs: S.ctx.shownThink[rq.bettor], boardN: S.boardShown, tellsSeen: S.ctx.seen.filter((r) => r.seat === rq.bettor) });
  }

  async function askSpot(spot) {
    const { hand, mode, st } = S;
    const qs = Coach.questions(spot, st) || [];
    const answers = {};
    spot.asked = qs.some((q) => q.id === 'outs' || q.id === 'equity'); // the post-hand real equity checks this estimate
    S.asking = true;
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      S.hint = mode === 'learn' && q.hint ? () => (typeof q.hint === 'string' ? { title: '💡 Подсказка', lines: [q.hint] } : q.hint) : null;
      UI.render();
      const v = await guard(UI.askQuestion(q, { n: i + 1, of: qs.length, hole: hand.hole[0], board: hand.board, short: !!spot.short }, auto() ? autoAnswer(q, spot) : null));
      S.hint = null;
      const fb = Coach.check(spot, q.id, v, { ...answers });
      answers[q.id] = v;
      const cat = QCAT[q.id] || 'outs';
      Stats.record(cat, !!fb.ok);
      if (!fb.ok) addMistake(fb, cat);
      if (mode === 'learn' || !fb.ok) UI.coachFb(fb);
    }
    S.asking = false;
    UI.render();
  }

  // ---------- streets, look overlay, showdown ----------
  async function onStreet(ev) {
    const { hand, table, st } = S;
    S.acts = {};
    const runout = hand.phase !== 'betting';
    if (runout && !S.reveal.size) {
      hand.seats.filter((s) => !hand.folded[s]).forEach((s) => S.reveal.add(s)); // all-in: hands are tabled
      S.caption = 'Олл-ин — карты открываются';
      UI.render();
      await wait(1000);
    }
    const bots = hand.seats.filter((s) => s !== 0 && !hand.folded[s]);
    if (!runout && Engine.inHand(hand, 0) && !hand.allIn[0] && bots.length && st.questions.tells) {
      const reactions = bots.map((seat) => Bots.streetReaction({ table, hand, seat, newCards: ev.cards })).filter(Boolean);
      S.caption = '';
      UI.render();
      const choice = await guard(UI.askLook(ev.street, auto() ? 30 : LOOK_MS[st.speed] || 2000, auto() ? U.pick(['board', 'players']) : null));
      Stats.recordLook(choice === 'players');
      if (choice === 'players') {
        reactions.forEach((r) => UI.bubble(r.seat, r, 2000 * speed()));
        S.ctx.seen.push(...reactions);
        S.caption = reactions.length ? '' : 'Никто ничем себя не выдал';
        UI.render();
        await wait(2000);
      } else if (reactions.length) S.ctx.missed.push({ street: ev.street, reactions });
    }
    S.boardShown = hand.board.length;
    S.caption = '';
    UI.logStreet(ev.street, hand.board.slice());
    UI.render();
    await wait(runout ? 1100 : 450);
  }

  async function onResult(ev) {
    const { hand } = S, res = ev.result;
    UI.closeSheet(); // narrow screens: the showdown is played on a visible table
    S.boardShown = hand.board.length;
    S.acts = {};
    if (ev.type === 'showdown') {
      res.shown.forEach((s) => S.reveal.add(s));
      S.hl = new Set(res.winners.flatMap((w) => res.best[w] || []));
      UI.logStreet('Вскрытие');
      for (const s of res.shown) UI.logLine(`${P(s).name} — ${Cards.strList(hand.hole[s])}: ${res.names[s].toLowerCase()}`, s === 0 ? 'me' : '');
    }
    const lines = res.pots.map((pot) => {
      const who = pot.winners.map((s, i) => (i && s === 0 ? 'ты' : P(s).name)).join(' и ');
      const me = pot.winners.includes(0);
      const verb = pot.winners.length > 1 ? (me ? 'делите' : 'делят') : me ? 'забираешь' : 'забирает';
      const why = res.uncontested ? 'все сбросили' : res.names[pot.winners[0]].toLowerCase() + kickerNote(res, pot.winners[0], pot.eligible || res.shown);
      return `${res.pots.length > 1 ? pot.name + ': ' : ''}${who} ${verb} ${fmt(pot.amount)} — ${why}`;
    });
    lines.forEach((l) => UI.logLine(l, 'res'));
    S.winners = res.winners;
    S.caption = lines[0];
    UI.render();
    await wait(ev.type === 'showdown' ? 900 : 350);
    UI.payout(res.winners, 450 * S.anim);
    S.paid = true;
    S.payouts = res.payouts;
    UI.render();
    await wait(600);
  }

  // ---------- after the hand: review, style reveals, tournament ----------
  async function afterHand() {
    const { hand, table, mode, st } = S, ctx = S.ctx;
    const shown = table.players.filter((p) => !p.isHuman && !p.revealed && p.hud.hands >= 20);
    const styleOf = (p) => (Bots.STYLES[p.style] ? Bots.STYLES[p.style].name : p.style);
    shown.forEach((p) => { p.revealed = true; });
    if (shown.length === 1) View.toast(`Стиль ${gen(shown[0].name)}: ${styleOf(shown[0])}`);
    else if (shown.length) View.toast(`Стили соперников раскрыты: ${shown.map((p) => `${p.name} — ${styleOf(p)}`).join(', ')}`, 6000);
    const items = mode === 'tournament' ? ctx.review.slice() : [];
    if (hasCoach()) {
      if (mode !== 'tournament') {
        for (const spot of reviewSpots(ctx.spots)) { const fb = Coach.realEquity(spot, hand); if (fb) items.push(fb); }
      }
      for (const r of ctx.reads) {
        const fb = Coach.readReview(r.read, r.answer, hand, table, { thinkMs: r.thinkMs, shownMs: r.shownMs, tellsSeen: r.tellsSeen });
        if (!fb) continue;
        fb.boardN = r.boardN;
        shownSeconds(fb, r.thinkMs, r.shownMs);
        Stats.record('read', fb.verdict !== 'mistake');
        if (fb.verdict === 'mistake') addMistake(fb, 'read');
        items.push(fb);
      }
      for (const m of ctx.missed) { const fb = Coach.lookHint(m.reactions, table, m.street); if (fb) { fb.boardN = BOARD_N[m.street]; items.push(fb); } }
    }
    let over = null;
    if (mode === 'tournament') {
      const CAT = { preflop: 'preflop', action: 'action', tells: 'tells', timing: 'tells', read: 'read' };
      for (const fb of items) {
        S.tMistakes.push({ ts: Date.now(), cat: CAT[fb.kind] || 'action', title: fb.title, lines: fb.lines, handNo: hand.no, mode,
          pos: hand.pos[0], hole: hand.hole[0] || [], board: hand.board.slice(0, fb.boardN === undefined ? hand.board.length : fb.boardN) });
      }
      over = tournamentBook(); // after queueing: the summary must include this hand's review
    }
    UI.render();
    const showReview = items.length && (mode !== 'tournament' || st.tournamentReview === 'hand');
    if (showReview) UI.review(items);
    if (over) {
      if (showReview) await guard(UI.waitNext(auto(), 'К итогам турнира'));
      else await wait(1500);
      finish(over);
      return true;
    }
    if (mode !== 'tournament' || showReview) await guard(UI.waitNext(auto()));
    else await wait(1400);
    return false;
  }

  const BOARD_N = { preflop: 0, flop: 3, turn: 4, river: 5 };
  // Spots for the post-hand «по правилу / реально» notes: only where the outs/equity questions were asked,
  // one per street (the last decision there) — two decisions on one street gave identical notes.
  function reviewSpots(spots) {
    const last = new Map();
    for (const sp of spots) if (sp.asked && sp.outs && sp.outs.total > 0) last.set(sp.street || sp.board.length, sp);
    return [...last.values()];
  }
  // The read review quotes the bot's think time; at «Быстро»/«Медленно» the player saw it scaled. The fast/slow
  // verdict stays on the base value (it is relative to how the bot usually thinks), the seconds are the seen ones.
  function shownSeconds(fb, raw, shown) {
    if (!Number.isFinite(raw) || !Number.isFinite(shown)) return;
    const a = `(${U.dec(raw / 1000, 1)} с)`, b = `(${U.dec(shown / 1000, 1)} с)`;
    fb.lines = (fb.lines || []).map((l) => (/^Тайминг:/.test(l) ? l.replace(a, b) : l));
  }
  // Same hand name at showdown: «, кикер король против дамы» — why the winner's hand is better.
  function kickerNote(res, w, eligible) {
    if (res.uncontested || !res.scores || res.scores[w] === null || res.scores[w] === undefined) return '';
    const rivals = eligible.filter((s) => s !== w && res.names[s] === res.names[w] && res.scores[s] < res.scores[w]);
    if (!rivals.length) return '';
    const best = rivals.reduce((a, s) => (res.scores[s] > res.scores[a] ? s : a));
    const kw = HandEval.kickers(res.scores[w]), kl = HandEval.kickers(res.scores[best]);
    const i = kw.findIndex((r, k) => r !== kl[k]);
    if (i < 0 || !kl[i]) return '';
    return `, кикер ${Cards.rankRu(kw[i], Cards.NOM)} против ${Cards.rankRu(kl[i], Cards.GEN)}`;
  }

  // Marks players who just lost their stack as busted and assigns places (worst first).
  // Simultaneous busts: the bigger stack at the start of the hand places higher.
  function eliminate(players, startStacks) {
    const alive = players.filter((p) => !p.busted);
    const out = alive.filter((p) => p.stack <= 0).sort((a, b) => startStacks[a.seat] - startStacks[b.seat]);
    let place = alive.length;
    for (const p of out) { p.busted = true; p.place = place--; }
    return out;
  }

  // Tournament bookkeeping after a hand; returns the results summary when the tournament is over.
  function tournamentBook() {
    const { table, hand } = S;
    for (const p of eliminate(table.players, hand.startStacks)) {
      S.places.push({ place: p.place, name: p.name, hand: hand.no });
      const text = p.isHuman ? `Ты выбываешь — ${p.place}-е место` : `${p.name} выбывает — ${p.place}-е место`;
      UI.logLine(text, 'res');
      if (!p.isHuman) View.toast(text);
    }
    const me = table.players[0], left = table.players.filter((p) => !p.busted);
    if (!me.busted && left.length > 1) return null;
    const session = Stats.data().sessions.slice(-1)[0];
    const placeMe = me.busted ? me.place : 1;
    return { place: placeMe, total: table.players.length, hands: table.handNo, won: placeMe === 1, mistakes: S.tMistakes.slice(),
      byCat: session ? session.byCat : {}, eliminated: S.places.slice() };
  }

  function finish(summary) {
    S.over = summary;
    Screens.results(summary, { onMenu: toMenu, onAgain: () => start('tournament') });
  }

  // ---------- autoplay (test hook) ----------
  function autoAction(L) {
    const h = S.hand, r = U.rng();
    const strong = h.street === 'preflop' ? Equity.holeTopPct(h.hole[0]) < (S.mode === 'tournament' ? 0.15 : 0.25) : U.chance(0.45);
    const size = () => (U.chance(0.06) ? L.maxTo : Engine.sizeTo(h, U.pick([1 / 3, 0.5, 2 / 3, 1])));
    if (L.canCheck) return L.canRaise && r < (strong ? 0.5 : 0.12) ? { type: 'raise', to: size() } : { type: 'check' };
    if (!strong && r < (h.street === 'preflop' ? (S.mode === 'tournament' ? 0.9 : 0.7) : 0.45)) return { type: 'fold' };
    if (L.canRaise && r > 0.8) return { type: 'raise', to: size() };
    return { type: 'call' };
  }
  function autoAnswer(q, spot) {
    const right = { outs: spot.correctOuts, cards: spot.cardsToSee, equity: spot.ruleEq, potodds: spot.needed }[q.id];
    if (q.type === 'choice') {
      const vals = (q.options || []).map((o) => (o && typeof o === 'object' ? o.v : o));
      return U.chance(0.7) && vals.some((v) => String(v) === String(right)) ? right : U.pick(vals);
    }
    return U.chance(0.6) && Number.isFinite(+right) ? Math.round(+right) : U.randInt(0, 40);
  }

  return Object.assign(api, { boot, start, state, toMenu, eliminate, gen, reviewSpots, kickerNote, shownSeconds });
})();
