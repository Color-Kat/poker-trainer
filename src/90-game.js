// ===== Game: controller — session setup, the async hand loop, coach flow, tournament bookkeeping =====
// One session object S drives everything; UI renders from it. Every pause point goes through wait()/guard(),
// so leaving to the menu (token.kill) unwinds the loop, and Pause freezes the timers.
const Game = (() => {
  const LEVELS = [[10, 20], [15, 30], [20, 40], [30, 60], [40, 80], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400],
    [300, 600], [400, 800], [500, 1000], [700, 1400], [1000, 2000], [1500, 3000], [2000, 4000], [3000, 6000], [5000, 10000]];
  const LOOK_MS = { slow: 3000, normal: 2000, fast: 1600 };
  const QCAT = { outs: 'outs', cards: 'outs', equity: 'equity', potodds: 'potodds', sizing: 'potodds', bluff: 'potodds' };
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
  // Fast-forward (S.skip): every wait returns at once — no think delays, no reading holds.
  async function wait(ms) {
    const s = S, tok = s.token;
    if (s.skip) { await U.sleep(0); if (tok.cancelled) throw CANCEL; return; }
    const held = () => s.paused || (!auto() && UI.held);
    let left = ms * speed(), h;
    do {
      h = held();
      if (UI.holding) UI.holding(h && !s.paused);
      const step = h ? 100 : Math.min(left, 50);
      await U.sleep(step);
      if (tok.cancelled) throw CANCEL;
      if (s.skip) break;
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
  const state = () => (S ? { table: S.table, hand: S.hand, mode: S.mode, over: S.over, paused: S.paused, canSkip: canSkip(),
    teacher: !!S.teacher, heroPos: S.mode === 'tournament' ? 'any' : S.st.heroPos } : null);

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
      if (h) { UI.coachFb({ kind: 'hint', verdict: 'info', ...h, title: h.title || '💡 Подсказка', lines: h.lines || [] }); UI.openSheet('coach'); }
    },
    range: () => openRanges(),
    skip: () => skipHand(),
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
    const anim = auto() ? 0 : Settings.speedFactor(); // S.anim drops to 0 while a hand is fast-forwarded (S.anim0 keeps it)
    document.documentElement.style.setProperty('--speed', String(Math.max(anim, 0.01)));
    S = {
      mode, st, table, hand: null, token: newToken(), paused: false, pausedMs: 0, pausedAt: 0, anim, anim0: anim, startStack: stack,
      level: 0, levelInfo: null, notes: [], thinkHist: [], decisions: 0, lastTimingAt: -99,
      places: [], tMistakes: [], over: null, ctx: null,
      boardShown: 0, reveal: new Set(), winners: null, payouts: null, hl: null, acts: {}, turn: null, caption: '', paid: false,
      hint: null, asking: false, skip: false, lastPre: null, advise: null, adviceShown: false,
      teacher: mode === 'learn' && st.teacher,
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
    const { table, mode } = S;
    Object.assign(S, { boardShown: 0, reveal: new Set(), winners: null, payouts: null, hl: null, acts: {}, turn: null,
      caption: '', paid: false, hint: null, asking: false, skip: false, anim: S.anim0, advise: null });
    UI.coachClear();
    UI.logReset();
    const lock = mode !== 'tournament' && S.st.heroPos !== 'any' ? S.st.heroPos : null;
    const locked = lock && lockButton(table, lock);
    const hand = Engine.startHand(table);
    if (locked && hand.pos[0] !== lock) console.warn(`position lock: wanted ${lock}, got ${hand.pos[0]}`);
    const rig = mode === 'tournament' ? 'off' : S.st.dealAssist;
    rigHole(hand, rig); // before anything is shown
    S.hand = hand;
    S.ctx = { spots: [], reads: [], missed: [], seen: [], tells: [], think: {}, shownThink: {}, vpip: new Set(), pfr: new Set(), review: [], humanLast: null };
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
        if (Engine.inHand(hand, 0) && !hand.allIn[0] && hand.seats.some((s) => s !== 0 && !hand.folded[s] && !hand.allIn[s])) rigBoard(hand, rig);
        const ev = Engine.advance(hand);
        if (ev.returned) UI.logLine(`${P(ev.returned.seat).name}: несыгранная ставка ${fmt(ev.returned.amount)} возвращена`, 'note');
        if (ev.type === 'street') await onStreet(ev); else await onResult(ev);
      }
    }
    S.anim = S.anim0;
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
    if (Bots.betReaction && Engine.inHand(hand, 0) && !S.skip) {
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
    const street = hand.street, pre = street === 'preflop', tour = mode === 'tournament';
    const legal = Engine.legal(hand);
    const quiz = !tour && (mode === 'learn' || U.chance(st.practiceFreq / 100)); // practice: some decisions get questions
    let spot = null;
    S.turn = 0;
    if (pre) {
      S.lastPre = hand; // the range modal shows this decision (Ranges.mySituation), also after the hand
      S.hint = mode === 'learn' ? () => Ranges.hint(hand, 0, table) : null;
      if (mode === 'learn' && st.questions.preflop) UI.coachAdd(situationHTML(hand), 'c-prompt', `Твой ход: ${hand.pos[0]}, ${Cards.strList(hand.hole[0])}`);
      UI.render();
      if (quiz && typeof Ranges.questions === 'function') await askQs(Ranges.questions(hand, 0, table, st) || [], null);
      S.advise = tour || typeof Ranges.advise !== 'function' ? null : () => Ranges.advise(hand, 0, table);
    } else {
      UI.render();
      spot = hasCoach() ? Coach.analyze(hand, 0, table) : null;
      if (spot) ctx.spots.push(spot);
      if (!tour) {
        await askRead();
        if (spot && quiz) await askSpot(spot);
      }
      S.advise = tour || !spot || typeof Coach.advise !== 'function' ? null : () => Coach.advise(spot);
    }
    S.adviceShown = false;
    const adv = S.teacher ? showAdvice() : null; // after the quizzes: the teacher must not give the answers away
    const t0 = U.now(), p0 = pausedTotal(S);
    const pending = UI.askAction(legal, auto() ? autoAction(legal) : null);
    suggestSize(adv);
    const action = await guard(pending);
    const ms = auto() ? U.randInt(800, 3000) : U.now() - t0 - (pausedTotal(S) - p0); // paused time is not thinking time
    S.hint = null; S.advise = null;
    // evaluate against the pre-action state
    const pfb = pre && st.questions.preflop ? Ranges.evaluate(hand, 0, action, table) : null;
    const afb = spot ? Coach.evaluateAction(spot, action) : null;
    const strong = hasCoach() && Coach.heroStrong ? Coach.heroStrong(hand.hole[0], hand.board) : false;
    const entry = Engine.act(hand, action);
    S.turn = null;
    afterAction(0, entry);
    // a bet/raise (e.g. a bluff) gets its own quiz right away, before the bots answer; then the verdict
    if (spot && quiz && (entry.type === 'bet' || entry.type === 'raise') && typeof Coach.afterActionQuestions === 'function') {
      await askQs(Coach.afterActionQuestions(spot, action, st) || [], spot);
    }
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
        if (tour) ctx.review.push(fb); else UI.coachFb(fb);
      }
    }
    if (entry.type === 'fold' && st.autoSkipFolded) skipHand();
  }

  // ---------- teacher: the best action and why, shown before the hero acts ----------
  function showAdvice() {
    const a = S.advise && S.advise();
    if (!a) return null;
    S.adviceShown = true;
    if (typeof UI.showAdvice === 'function') UI.showAdvice(a);
    else UI.coachFb({ kind: 'teacher', verdict: 'info', title: a.title, lines: a.lines || [], more: a.more, grid: a.grid });
    return a;
  }
  // The suggested bet goes into the raise box (only while the action panel is open).
  function suggestSize(a) {
    if (a && a.size && (a.best === 'bet' || a.best === 'raise') && UI.acting) UI.setAmount(a.size);
  }
  function setTeacher(on) {
    if (!S || S.mode === 'tournament') return;
    S.teacher = !!on;
    if (S.mode === 'learn') { Settings.set({ teacher: S.teacher }); S.st.teacher = S.teacher; }
    if (S.teacher && UI.acting && !S.adviceShown) suggestSize(showAdvice());
    UI.render();
  }

  // Feedback per mode: learn — always (a correct verdict as one short line); practice — unless correct;
  // tournament — mistakes queued for the review.
  function judge(fb, cat, opts) {
    const ok = fb.verdict !== 'mistake';
    fb.boardN = S.boardShown; // the board the player saw when deciding (tournament review)
    Stats.record(cat, ok, opts);
    if (!ok) addMistake(fb, cat);
    if (S.mode === 'learn') UI.coachFb(fb.verdict === 'correct' ? { kind: fb.kind, verdict: fb.verdict, title: fb.title, lines: [] } : fb);
    else if (S.mode === 'practice' && fb.verdict !== 'correct') UI.coachFb(fb);
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
    const answer = await guard(UI.askQuestion(q, { sub, hole: hand.hole[0], board: hand.board }, auto() ? autoAnswer(q, null) : null));
    S.asking = false;
    S.ctx.reads.push({ read: rq, answer, thinkMs: S.ctx.think[rq.bettor], shownMs: S.ctx.shownThink[rq.bettor], boardN: S.boardShown, tellsSeen: S.ctx.seen.filter((r) => r.seat === rq.bettor) });
  }

  async function askSpot(spot) {
    const qs = Coach.questions(spot, S.st) || [];
    spot.asked = qs.some((q) => q.id === 'outs' || q.id === 'equity'); // the post-hand real equity checks this estimate
    await askQs(qs, spot);
  }

  // Asks the questions one after another. A wrong answer shows its short correction and the next question
  // follows right away — the sequence never stops. spot = null: preflop questions.
  async function askQs(qs, spot) {
    if (!qs.length) return;
    const { hand, mode } = S;
    const answers = {};
    S.asking = true;
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      S.hint = mode === 'learn' && q.hint ? () => (typeof q.hint === 'string' ? { title: '💡 Подсказка', lines: [q.hint] } : q.hint) : null;
      UI.render();
      const v = await guard(UI.askQuestion(q, { n: i + 1, of: qs.length, hole: hand.hole[0], board: hand.board, short: !!(spot && spot.short) }, auto() ? autoAnswer(q, spot || q.spot) : null));
      S.hint = null;
      const fb = checkQ(q, v, { ...answers }, spot);
      answers[q.id] = v;
      if (!fb) continue;
      const cat = QCAT[q.id] || 'outs';
      Stats.record(cat, !!fb.ok);
      if (!fb.ok) addMistake(fb, cat);
      if (mode === 'learn' || !fb.ok) UI.coachFb(fb);
    }
    S.asking = false;
    UI.render();
  }
  // Preflop questions carry their own pot spot (q.spot), graded like the postflop ones.
  function checkQ(q, v, answers, spot) {
    const sp = spot || q.spot;
    return sp && hasCoach() ? Coach.check(sp, q.id, v, answers) : null;
  }

  // Tells quiz: after the hero looked at the players, what did one shown reaction mean? Graded after the hand.
  async function askTell(r) {
    const { hand, table, mode, st } = S;
    if (mode === 'tournament' || !st.questions.tells || !hasCoach() || typeof Coach.tellQuestion !== 'function') return;
    if (mode !== 'learn' && !U.chance(st.practiceFreq / 100)) return;
    const q = Coach.tellQuestion(r, table);
    if (!q) return;
    S.asking = true; UI.render();
    const answer = await guard(UI.askQuestion(q, { hole: hand.hole[0], board: hand.board.slice(0, S.boardShown) }, auto() ? autoAnswer(q, null) : null));
    S.asking = false;
    S.ctx.tells.push({ reaction: r, answer, boardN: S.boardShown });
    UI.closeSheet(); // nothing to read until the review: phones get the table back (an open sheet holds the game)
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
    let tell = null;
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
        if (reactions.length) tell = U.pick(reactions);
      } else if (reactions.length) S.ctx.missed.push({ street: ev.street, reactions });
    }
    S.boardShown = hand.board.length;
    S.caption = '';
    UI.logStreet(ev.street, hand.board.slice());
    UI.render();
    if (tell) await askTell(tell);
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
      for (const t of ctx.tells) {
        const fb = typeof Coach.tellReview === 'function' && Coach.tellReview(t.reaction, t.answer, hand, table);
        if (!fb) continue;
        fb.boardN = t.boardN;
        const ok = fb.ok !== undefined ? !!fb.ok : fb.verdict !== 'mistake';
        Stats.record('tells', ok);
        if (!ok) addMistake(fb, 'tells');
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

  // ---------- fast-forward: the hero has nothing left to decide ----------
  function canSkip() {
    const h = S && S.hand;
    if (!h || h.phase === 'done' || S.skip || S.over || !h.dealt[0]) return false;
    const others = h.seats.some((s) => s !== 0 && !h.folded[s] && !h.allIn[s]);
    return !!(h.folded[0] || h.allIn[0] || (!others && h.toAct !== 0));
  }
  // The rest of the hand plays out with no waits, bubbles or animations; HUD and review are computed as usual.
  function skipHand() {
    if (!canSkip()) return false;
    S.skip = true;
    S.anim = 0;
    UI.render();
    return true;
  }

  // ---------- range modal with the hero's latest preflop decision (this hand or the last one) ----------
  function openRanges() {
    if (!S) return null;
    const h = S.hand;
    // tournament: no help with the decision being made right now
    const now = h && h.phase === 'betting' && h.street === 'preflop' && h.toAct === 0;
    const last = S.mode === 'tournament' && now ? null : S.lastPre;
    const situation = last ? Ranges.mySituation(last, 0) : null;
    const ref = last || h;
    return withPause(Screens.rangeModal({ situation, pos: ref ? ref.pos[0] : null, n: ref ? ref.order.length : S.table.players.length,
      hl: situation ? situation.hl : null }));
  }

  // ---------- position lock ----------
  function lockPos(label) {
    if (!S) return;
    const ok = label && Engine.positionNames(S.table.players.length).includes(label);
    S.st.heroPos = ok ? label : 'any';
    Settings.set({ heroPos: S.st.heroPos });
    UI.render();
  }
  const eligible = (p) => !p.busted && p.stack > 0;
  // The button seat that gives the hero (seat 0) `label` — the same seat/label mapping as Engine.startHand.
  function buttonFor(table, label) {
    const P = table.players, N = P.length;
    if (!eligible(P[0])) return null;
    for (let btn = 0; btn < N; btn++) {
      if (!eligible(P[btn])) continue;
      const seats = [];
      for (let k = 1; k <= N; k++) if (eligible(P[(btn + k) % N])) seats.push((btn + k) % N);
      const order = seats.length === 2 ? [btn, seats[0]] : [...seats.slice(2), ...seats.slice(0, 2)];
      if (Engine.positionNames(seats.length)[order.indexOf(0)] === label) return btn;
    }
    return null;
  }
  // Points table.button so that startHand's own move (next eligible seat when handNo > 0) lands on the wanted
  // button; heads-up startHand gives the button to last hand's BB, so lastBB points there too.
  function lockButton(table, label) {
    const btn = buttonFor(table, label);
    if (btn === null) return false;
    const N = table.players.length;
    table.button = table.handNo > 0 ? (btn - 1 + N) % N : btn;
    table.lastBB = btn;
    return true;
  }

  // ---------- training deal (dealAssist): cards are swapped inside hand.deck, the engine never knows ----------
  const RIG = { normal: { pre: 0.6, post: 0.4 }, strong: { pre: 0.85, post: 0.6 } };
  // Preflop teaching mix for a position: [weight, codes] — in range, border, looks playable but folds here, speculative.
  function rigCodes(pos) {
    const inR = Ranges.open(pos), bord = Ranges.border(pos), all = Cards.HAND_CODES;
    const looks = (c) => { const { hi, lo, type } = Cards.codeInfo(c); return type === 'p' || hi === 14 || lo >= 10 || (type === 's' && hi >= 12); };
    const spec = (c) => { const { hi, lo, type } = Cards.codeInfo(c); return type === 's' && (hi === 14 || (hi - lo <= 2 && lo >= 4)); };
    return [[0.45, [...inR]], [0.25, [...bord]], [0.2, all.filter((c) => !inR.has(c) && !bord.has(c) && looks(c))], [0.1, all.filter(spec)]];
  }
  function pickWeighted(list) {
    const ok = list.filter(([, xs]) => xs.length);
    let r = U.rng() * U.sum(ok.map(([w]) => w));
    for (const [w, xs] of ok) if ((r -= w) < 0) return xs;
    return ok[ok.length - 1][1];
  }
  // Maybe replaces the hero's hole cards with a teachable hand; returns its code or null. Only cards from the deck
  // (or the hero's own) are used, the old hole cards take their slots: the deck stays a permutation, bots keep theirs.
  function rigHole(hand, level) {
    const p = RIG[level], old = hand.hole[0];
    if (!p || !old || !U.chance(p.pre)) return null;
    const free = new Set([...hand.deck, ...old]);
    for (const code of U.shuffle(pickWeighted(rigCodes(hand.pos[0])).slice())) {
      const combo = U.shuffle(Cards.codeToCombos(code)).find(([a, b]) => free.has(a) && free.has(b));
      if (!combo) continue;
      const spare = old.filter((c) => !combo.includes(c));
      for (const c of combo) { const i = hand.deck.indexOf(c); if (i >= 0) hand.deck[i] = spare.shift(); }
      hand.hole[0] = combo.slice();
      return code;
    }
    return null;
  }
  // What the hero has after `board`: teaching tags (draws, overcards, top/second pair).
  function spotTags(hole, board) {
    const cards = hole.concat(board), cat = HandEval.cat(HandEval.score(cards)), C = HandEval.CAT;
    const mask = (cs) => cs.reduce((m, c) => m | (1 << Cards.rank(c)), 0), m = mask(cards), bm = mask(board);
    const suitN = [0, 0, 0, 0];
    cards.forEach((c) => suitN[Cards.suit(c)]++);
    const fd = cat < C.FLUSH && hole.some((c) => suitN[Cards.suit(c)] === 4);
    let st = 0; // ranks that complete a straight using a hole card
    if (cat < C.STRAIGHT) for (let r = 2; r <= 14; r++) if (!(m & (1 << r)) && HandEval.straightTop(m | (1 << r)) && !HandEval.straightTop(bm | (1 << r))) st++;
    const tags = [];
    if (fd && st) tags.push('combo');
    else if (fd) tags.push('flushdraw');
    else if (st >= 2) tags.push('oesd');
    else if (st === 1) tags.push('gutshot');
    const br = [...new Set(board.map(Cards.rank))].sort((a, b) => b - a), hr = hole.map(Cards.rank);
    if (br.length === board.length) { // unpaired board
      if (cat === C.PAIR && hr.includes(br[0]) && hr[0] !== hr[1]) tags.push('toppair');
      else if (cat === C.PAIR && hr.includes(br[1]) && hr[0] !== hr[1]) tags.push('secondpair');
      else if (cat === C.HIGH && Math.min(...hr) > br[0]) tags.push('overcards');
    }
    return tags;
  }
  // Maybe reorders hand.deck before Engine.advance so the next flop/turn gives the hero a teachable spot:
  // a target type uniformly among the reachable ones, then a uniform card set of that type. Returns the tag.
  function rigBoard(hand, level) {
    const p = RIG[level], n = hand.street === 'preflop' ? 3 : hand.street === 'flop' ? 1 : 0, d = hand.deck;
    if (!p || !n || !U.chance(p.post)) return null;
    const hole = hand.hole[0], byTag = {};
    const tries = n === 1 ? d.map((c) => [c]) : Array.from({ length: 250 }, () => U.shuffle(d.slice()).slice(0, 3));
    for (const cs of tries) for (const t of spotTags(hole, hand.board.concat(cs))) (byTag[t] = byTag[t] || []).push(cs);
    const tags = Object.keys(byTag);
    if (!tags.length) return null;
    const tag = U.pick(tags), cs = U.pick(byTag[tag]);
    cs.forEach((c, k) => { const i = d.indexOf(c), j = d.length - 1 - k; [d[i], d[j]] = [d[j], d[i]]; }); // deck.pop() deals from the end
    return tag;
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
  // Game.autoWrong = true → every autoplay answer is wrong (tests: the question sequence must go on).
  function autoAnswer(q, spot) {
    const right = q.answer !== undefined ? q.answer
      : spot ? { outs: spot.correctOuts, cards: spot.cardsToSee, equity: spot.ruleEq, potodds: spot.needed }[q.id] : undefined;
    if (q.type === 'choice') {
      const vals = (q.options || []).map((o) => (o && typeof o === 'object' ? o.v : o));
      const wrong = vals.filter((v) => String(v) !== String(right));
      if (api.autoWrong) return U.pick(wrong.length ? wrong : vals);
      return U.chance(0.7) && vals.some((v) => String(v) === String(right)) ? right : U.pick(vals);
    }
    if (api.autoWrong) return 977;
    return U.chance(0.6) && Number.isFinite(+right) ? Math.round(+right) : U.randInt(0, 40);
  }

  return Object.assign(api, { boot, start, state, toMenu, skipHand, openRanges, lockPos, setTeacher,
    eliminate, gen, reviewSpots, kickerNote, shownSeconds, buttonFor, lockButton, rigHole, rigBoard, spotTags });
})();
