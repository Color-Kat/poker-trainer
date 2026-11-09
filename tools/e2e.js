// End-to-end autoplay test (Playwright via ./browser): builds index.html, then for each run starts a mode with
// Game.autoplay = true and plays until the hand target or the tournament results screen.
// Asserts: no console/page errors, no stuck hand (time budget per hand), chips conserved in tournaments,
// tournaments reach the results screen, Pause freezes the game, leaving to the menu cancels the loop.
// Usage: node tools/e2e.js [quick]   → exit code 1 on failure; screenshots in .shots/game-e2e-*.png
const path = require('path');
const { execFileSync } = require('child_process');
const { open } = require('./browser');

const quick = process.argv[2] === 'quick';
const RUNS = [
  { mode: 'learn', players: 9, hands: quick ? 12 : 45, w: 1366, h: 800 },
  { mode: 'practice', players: 6, hands: quick ? 12 : 45, w: 390, h: 844, mobile: true },
  { mode: 'learn', players: 2, hands: quick ? 12 : 40, w: 390, h: 844, mobile: true },
  { mode: 'practice', players: 9, hands: quick ? 8 : 25, w: 1024, h: 768 },
  { mode: 'tournament', players: 9, results: true, w: 1366, h: 800 },
  { mode: 'tournament', players: 6, results: true, w: 390, h: 844, mobile: true, review: 'end' },
  { mode: 'tournament', players: 2, results: true, w: 1366, h: 800 },
];
const HAND_BUDGET_MS = 25000, RUN_BUDGET_MS = 240000;
const root = path.join(__dirname, '..');

const probe = () => {
  const s = Game.state();
  const h = s && s.hand;
  const chips = s ? s.table.players.reduce((a, p) => a + p.stack, 0) + (h && h.phase !== 'done' ? Engine.pot(h) : 0) : 0;
  return { no: h ? h.no : 0, phase: h ? h.phase : null, over: !!(s && s.over), chips, results: !!document.querySelector('.sc-results'),
    game: !!document.querySelector('.game'), menu: !!document.querySelector('.sc-menu'), modal: !!document.querySelector('.modal-back') };
};

async function runOne(r) {
  const { page, errors, close } = await open({ width: r.w, height: r.h, mobile: !!r.mobile });
  const fails = [];
  const tag = `${r.mode}-${r.players}p-${r.w}x${r.h}`;
  try {
    await page.waitForSelector('.sc-menu', { timeout: 10000 });
    await page.evaluate(({ players, review }) => {
      Settings.set({ players, speed: 'fast', tournamentReview: review || 'hand' });
      Game.autoplay = true;
      window.__n = { questions: 0, looks: 0, reviews: 0 };
      const count = (fn, k) => { const f = UI[fn]; UI[fn] = (...a) => { window.__n[k]++; return f(...a); }; };
      count('askQuestion', 'questions'); count('askLook', 'looks'); count('review', 'reviews');
    }, r);
    await page.evaluate((mode) => Game.start(mode), r.mode);
    const t0 = Date.now();
    let last = await page.evaluate(probe), lastChange = Date.now(), maxHand = 0, total0 = null, shot = false;
    for (;;) {
      await page.waitForTimeout(100);
      const p = await page.evaluate(probe);
      if (r.mode === 'tournament' && p.no > 0 && !p.results) {
        if (total0 === null) total0 = p.chips;
        else if (p.chips !== total0) { fails.push(`chips not conserved at hand ${p.no}: ${p.chips} ≠ ${total0}`); break; }
      }
      if (p.no !== last.no) { maxHand = Math.max(maxHand, Date.now() - lastChange); lastChange = Date.now(); }
      if (!shot && p.no >= 3 && p.phase === 'betting') { await page.screenshot({ path: path.join(root, `.shots/game-e2e-${tag}.png`) }); shot = true; }
      last = p;
      if (r.results ? p.results : p.no >= r.hands) break;
      if (Date.now() - lastChange > HAND_BUDGET_MS) { fails.push(`hand ${p.no} stuck (phase ${p.phase}, modal ${p.modal})`); break; }
      if (Date.now() - t0 > RUN_BUDGET_MS) { fails.push(`run budget exceeded at hand ${p.no}`); break; }
      if (errors.length) break;
    }
    if (r.results && last.results) await page.screenshot({ path: path.join(root, `.shots/game-e2e-${tag}-results.png`) });
    if (!r.results && !fails.length) {
      // Pause and an open cheat sheet freeze the loop; the menu button (after confirming) cancels it.
      const frozen = async (what) => {
        await page.waitForTimeout(200);
        const a = await page.evaluate(probe);
        await page.waitForTimeout(1200);
        const b = await page.evaluate(probe);
        if (a.no !== b.no || a.phase !== b.phase) fails.push(`${what} did not freeze the game (${a.no}/${a.phase} → ${b.no}/${b.phase})`);
      };
      await page.click('[data-cmd="pause"]');
      await frozen('pause');
      await page.click('[data-cmd="pause"]');
      await page.click('[data-cmd="cheat"]');
      await frozen('cheat sheet');
      await page.keyboard.press('Escape');
      if (await page.evaluate(() => Game.state().paused)) fails.push('closing the cheat sheet did not resume the game');
      await page.click('[data-cmd="menu"]');
      await page.click('.modal-foot .btn-danger');
      await page.waitForTimeout(600);
      const c = await page.evaluate(probe);
      if (!c.menu || c.game) fails.push('leaving to the menu did not show the menu');
    }
    const hands = last.no, n = await page.evaluate(() => window.__n).catch(() => null);
    if (errors.length) fails.push(...errors.slice(0, 5));
    console.log(`${fails.length ? 'FAIL' : 'ok  '} ${tag}: ${hands} hands${r.results ? (last.results ? ', results screen' : ', NO results screen') : ''}, slowest hand ${maxHand} ms, ${((Date.now() - t0) / 1000).toFixed(1)} s` +
      (n ? `; questions ${n.questions}, look choices ${n.looks}, reviews ${n.reviews}` : ''));
    if (r.results && !last.results && !fails.length) fails.push('tournament did not reach the results screen');
    fails.forEach((f) => console.log('       ' + f));
    return { hands, fails };
  } finally {
    await close();
  }
}

(async () => {
  execFileSync('node', [path.join(root, 'build.js')], { stdio: 'inherit' });
  let hands = 0, failed = 0;
  for (const r of RUNS) {
    const res = await runOne(r).catch((e) => ({ hands: 0, fails: [String(e && e.stack || e)] }));
    if (res.fails.length) failed++;
    hands += res.hands;
  }
  console.log(`\ne2e: ${RUNS.length - failed}/${RUNS.length} runs passed, ${hands} hands played`);
  process.exit(failed ? 1 : 0);
})();
