// ===== Settings: user preferences, validated and persisted via U.storage ('settings') =====
const Settings = (() => {
  const KEY = 'settings';
  const STYLE_IDS = ['rock', 'station', 'reg', 'maniac', 'actor'];
  const SPEED = { slow: 1.6, normal: 1, fast: 0.45 };
  const DEFAULTS = {
    players: 9, startBB: 100, levelHands: 10, speed: 'normal',
    botsMode: 'random', botStyles: ['rock', 'station', 'reg', 'maniac', 'actor', 'reg', 'rock', 'station'],
    questions: { preflop: true, outs: true, equity: true, potodds: true, read: true, tells: true },
    practiceFreq: 75, tournamentReview: 'hand',
    dealAssist: 'normal', // learn/practice: rig some deals toward teachable spots ('off'|'normal'|'strong'); never in tournament
    heroPos: 'any', // learn/practice: lock the hero to one position label
    autoSkipFolded: false, // finish the hand instantly once the hero folded
    teacher: true, // learn mode: the teacher suggests the best action on every turn
  };
  const LIMITS = { players: [2, 9], startBB: [20, 300], levelHands: [5, 30] };
  const ENUMS = { speed: Object.keys(SPEED), botsMode: ['random', 'manual'], practiceFreq: [25, 50, 75, 100], tournamentReview: ['hand', 'end'],
    dealAssist: ['off', 'normal', 'strong'], heroPos: ['any', 'UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'] };
  const BOOLS = ['autoSkipFolded', 'teacher'];

  const copy = (o) => JSON.parse(JSON.stringify(o));

  // `base` with every field of `raw` that has a valid type/range applied; garbage is ignored.
  function clean(raw, base) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const out = copy(base);
    for (const [k, [lo, hi]] of Object.entries(LIMITS)) if (Number.isInteger(r[k]) && r[k] >= lo && r[k] <= hi) out[k] = r[k];
    for (const [k, list] of Object.entries(ENUMS)) if (list.includes(r[k])) out[k] = r[k];
    for (const k of BOOLS) if (typeof r[k] === 'boolean') out[k] = r[k];
    if (Array.isArray(r.botStyles)) out.botStyles = out.botStyles.map((d, i) => (STYLE_IDS.includes(r.botStyles[i]) ? r.botStyles[i] : d));
    const q = r.questions && typeof r.questions === 'object' ? r.questions : {};
    for (const k in out.questions) if (typeof q[k] === 'boolean') out.questions[k] = q[k];
    return out;
  }

  let cur = null; // loaded once; stays in memory when storage is unavailable
  const load = () => cur || (cur = clean(U.storage.get(KEY, null), DEFAULTS));
  const get = () => copy(load());
  // Shallow merge (questions merged per key), validated, persisted. set(DEFAULTS) = reset.
  function set(patch) {
    cur = clean(patch, load());
    U.storage.set(KEY, cur);
    return get();
  }
  const speedFactor = () => SPEED[load().speed];
  const reload = () => { cur = null; return get(); }; // re-read storage (tests)

  return { DEFAULTS, LIMITS, STYLE_IDS, get, set, speedFactor, reload };
})();
