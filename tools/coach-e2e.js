// Coach/Ranges in the real page: autoplays learn + practice games, records every feedback object the
// Coach and Ranges return, and fails on page errors or broken text (undefined / NaN / [object …]).
// Usage: node tools/coach-e2e.js [hands=30]   → screenshots in .shots/coach-*.png
const path = require('path');
const { execFileSync } = require('child_process');
const { open } = require('./browser');

const root = path.join(__dirname, '..');
const HANDS = +process.argv[2] || 30;
const RUNS = [
  { mode: 'learn', players: 6, w: 1366, h: 800 },
  { mode: 'practice', players: 3, w: 390, h: 844, mobile: true },
];

async function run(r) {
  const { page, errors, close } = await open({ width: r.w, height: r.h, mobile: !!r.mobile });
  try {
    await page.waitForSelector('.sc-menu', { timeout: 10000 });
    await page.evaluate(({ players }) => {
      Settings.set({ players, speed: 'fast' });
      Game.autoplay = true;
      const out = (window.__coach = { fb: [], spots: [], thrown: [] });
      const wrap = (obj, name, k) => {
        const f = obj[k];
        obj[k] = (...a) => {
          try {
            const res = f(...a);
            if (k === 'analyze') { if (res) out.spots.push({ kind: res.kind, street: res.street, q: res.questions.join(','), outs: res.correctOuts }); }
            else if (res && res.title) out.fb.push({ src: name + '.' + k, title: res.title, lines: res.lines || [] });
            return res;
          } catch (e) { out.thrown.push(name + '.' + k + ': ' + e.message); throw e; }
        };
      };
      for (const k of ['analyze', 'check', 'evaluateAction', 'realEquity', 'readReview', 'lookHint']) wrap(Coach, 'Coach', k);
      for (const k of ['evaluate', 'hint']) wrap(Ranges, 'Ranges', k);
    }, r);
    await page.evaluate((mode) => Game.start(mode), r.mode);
    const t0 = Date.now();
    let shot = false;
    for (;;) {
      await page.waitForTimeout(150);
      const s = await page.evaluate(() => ({ no: Game.state().hand ? Game.state().hand.no : 0, n: window.__coach.fb.length }));
      if (!shot && s.n > 8) { await page.screenshot({ path: path.join(root, `.shots/coach-${r.mode}-${r.w}.png`) }); shot = true; }
      if (s.no >= HANDS || errors.length || Date.now() - t0 > 180000) break;
    }
    const data = await page.evaluate(() => window.__coach);
    // the collected postflop feedback, rendered the way the coach panel renders it
    await page.click('[data-cmd="pause"]').catch(() => {});
    await page.evaluate((fbs) => {
      const v = (t) => (/^✅/.test(t) ? 'correct' : /^⚠️/.test(t) ? 'acceptable' : /^ℹ️/.test(t) ? 'info' : 'mistake');
      View.modal('Разбор тренера', fbs.map((f) => View.feedbackHTML({ verdict: v(f.title), title: f.title, lines: f.lines })).join(''), { wide: true });
    }, data.fb.filter((f) => f.src.startsWith('Coach')).slice(0, 8));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(root, `.shots/coach-${r.mode}-${r.w}-feedback.png`) });
    const bad = data.fb.filter((f) => /undefined|NaN|\[object|null/.test(f.title + ' ' + f.lines.join(' ')));
    const by = {};
    for (const f of data.fb) by[f.src] = (by[f.src] || 0) + 1;
    console.log(`${r.mode} ${r.players}p: ${data.spots.length} spots, feedback ${JSON.stringify(by)}`);
    const kinds = {};
    for (const s of data.spots) kinds[s.kind + '/' + s.street] = (kinds[s.kind + '/' + s.street] || 0) + 1;
    console.log('  spots: ' + JSON.stringify(kinds));
    for (const f of data.fb.filter((x) => /❌|⚠️/.test(x.title)).slice(0, 4)) console.log('  ' + f.title + '\n    ' + f.lines.join('\n    '));
    const fails = [...errors, ...data.thrown, ...bad.map((f) => 'broken text: ' + f.title + ' | ' + f.lines.join(' | '))];
    if (!data.spots.length) fails.push('no postflop spots analysed');
    return fails;
  } finally { await close(); }
}

(async () => {
  execFileSync('node', [path.join(root, 'build.js')], { stdio: 'inherit' });
  let fails = [];
  for (const r of RUNS) fails = fails.concat(await run(r));
  console.log(fails.length ? 'FAIL\n' + fails.join('\n') : 'coach e2e: ok');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
