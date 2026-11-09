// ===== U: shared helpers (RNG, formatting, storage) =====
// No module may touch DOM / window / localStorage at load time (tests load all files in Node).
const U = (() => {
  // Seedable RNG: U.seed(n) → deterministic mulberry32 (tests), U.seed(null) → Math.random.
  let state = null;
  function mulberry32() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rng = () => (state === null ? Math.random() : mulberry32());
  const seed = (n) => { state = n === null || n === undefined ? null : n >>> 0; };
  const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const chance = (p) => rng() < p;
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  // Fisher–Yates, in place.
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const sum = (arr) => arr.reduce((s, x) => s + x, 0);

  // 12500 → '12 500' (narrow no-break space).
  const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  // fraction → '19,6%'; pctNum takes a value already in percent.
  const pctNum = (p, digits = 0) => Number(p).toFixed(digits).replace('.', ',') + '%';
  const pct = (x, digits = 0) => pctNum(x * 100, digits);
  // 2.5 → '2,5'
  const dec = (x, digits = 1) => Number(x).toFixed(digits).replace('.', ',').replace(/,0+$/, '');

  // Russian plural: plural(5, 'аут', 'аута', 'аутов') → 'аутов'
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b === 1) return one;
    if (b >= 2 && b <= 4) return few;
    return many;
  }
  const nplural = (n, one, few, many) => n + ' ' + plural(n, one, few, many);

  const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // localStorage wrapper: every access in try/catch; game works without storage.
  const PREFIX = 'pokerTrainer.';
  const storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(PREFIX + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove(key) {
      try { localStorage.removeItem(PREFIX + key); } catch (e) { /* storage unavailable */ }
    },
  };

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

  let uidN = 0;
  const uid = (p = 'id') => p + (++uidN) + '_' + Math.floor(Math.random() * 1e6).toString(36);

  return { rng, seed, randInt, chance, pick, shuffle, clamp, sum, fmt, pct, pctNum, dec, plural, nplural, sleep, now, storage, esc, uid };
})();
