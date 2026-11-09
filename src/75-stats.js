// ===== Stats: answer accuracy (total / category / preflop position / session), last mistakes =====
// Persisted via U.storage ('stats'); works in memory when storage is unavailable.
const Stats = (() => {
  const KEY = 'stats';
  const CATS = ['preflop', 'outs', 'equity', 'potodds', 'action', 'read', 'tells'];
  const CAT_RU = { preflop: 'Префлоп', outs: 'Ауты', equity: 'Эквити', potodds: 'Шансы банка', action: 'Действие', read: 'Чтение соперника', tells: 'Теллы' };
  const POSITIONS = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  const MAX_SESSIONS = 30, MAX_MISTAKES = 20;

  const copy = (o) => JSON.parse(JSON.stringify(o));
  const arr = (a) => (Array.isArray(a) ? a : []);
  const cnt = (c) => {
    const n = c && Number.isInteger(c.n) && c.n > 0 ? c.n : 0;
    return { ok: c && Number.isInteger(c.ok) && c.ok > 0 ? Math.min(c.ok, n) : 0, n };
  };
  const cnts = (m, keys) => Object.fromEntries(keys.map((k) => [k, cnt(m && m[k])]));
  const cards = (a) => arr(a).filter((c) => Number.isInteger(c) && c >= 0 && c < 52);
  const mistake = (m) => ({
    ts: Number.isFinite(m.ts) ? m.ts : Date.now(), cat: String(m.cat || ''), title: String(m.title || ''),
    lines: arr(m.lines).map(String), handNo: Number.isInteger(m.handNo) ? m.handNo : null,
    mode: m.mode ? String(m.mode) : null, pos: m.pos ? String(m.pos) : null, hole: cards(m.hole), board: cards(m.board),
  });
  const session = (s) => ({ id: String(s.id || U.uid('s')), ts: Number.isFinite(s.ts) ? s.ts : 0, mode: s.mode || null, ...cnt(s), byCat: cnts(s.byCat, CATS) });

  // Validated copy of stored data (garbage → empty).
  function clean(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const look = cnt(r.looks && { ok: r.looks.players, n: r.looks.total });
    return {
      total: cnt(r.total), byCat: cnts(r.byCat, CATS), byPos: cnts(r.byPos, POSITIONS),
      sessions: arr(r.sessions).filter((s) => s && typeof s === 'object').slice(-MAX_SESSIONS).map(session),
      mistakes: arr(r.mistakes).filter((m) => m && typeof m === 'object').slice(0, MAX_MISTAKES).map(mistake),
      looks: { players: look.ok, total: look.n },
    };
  }

  let st = null, cur = null, curMode = null;
  const load = () => st || (st = clean(U.storage.get(KEY, null)));
  const save = () => U.storage.set(KEY, st);
  const bump = (c, ok) => { c.n++; if (ok) c.ok++; };

  function beginSession(mode = null) {
    const s = load();
    curMode = mode;
    cur = session({ id: U.uid('s'), ts: Date.now(), mode });
    s.sessions = s.sessions.filter((x) => x.n > 0).concat(cur).slice(-MAX_SESSIONS); // drop empty sessions
    save();
  }

  // ok: boolean (a feedback verdict string also works: only 'mistake' is wrong).
  // 'tells' is a habit, not an answer: it has its own category but stays out of total and session accuracy.
  function record(cat, ok, opts) {
    if (!CATS.includes(cat)) return;
    ok = typeof ok === 'string' ? ok !== 'mistake' : !!ok;
    const s = load();
    if (!cur) beginSession(curMode);
    bump(s.byCat[cat], ok);
    bump(cur.byCat[cat], ok);
    if (cat !== 'tells') { bump(s.total, ok); bump(cur, ok); }
    const pos = opts && opts.pos;
    if (cat === 'preflop' && POSITIONS.includes(pos)) bump(s.byPos[pos], ok);
    save();
  }

  function recordLook(looked) {
    const s = load();
    s.looks.total++;
    if (looked) s.looks.players++;
    record('tells', !!looked);
  }

  function addMistake(m) {
    if (!m || typeof m !== 'object') return;
    const s = load();
    s.mistakes = [mistake(m)].concat(s.mistakes).slice(0, MAX_MISTAKES);
    save();
  }

  // { total, byCat, byPos, sessions (oldest → newest, current last), mistakes (newest first), looks }
  const data = () => copy(load());
  function reset() { st = clean(null); cur = null; U.storage.remove(KEY); }
  const reload = () => { st = null; cur = null; return data(); }; // re-read storage (tests)

  return { CATS, CAT_RU, POSITIONS, beginSession, record, recordLook, addMistake, data, reset, reload };
})();
