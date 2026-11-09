// Screens preview: builds index.html, renders every screen/modal with sample data in headless Chromium
// at 390×844 and 1366×800, reports console errors and horizontal overflow, saves .shots/screens-*.png.
// Usage: node tools/screens-preview.js [nameFilter]   (env SIZES='[[380,800,"xs"]]' for other viewports)
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { open } = require('./browser');

const root = path.join(__dirname, '..');
execFileSync('node', ['build.js'], { cwd: root, stdio: 'inherit' });
fs.mkdirSync(path.join(root, '.shots'), { recursive: true });

// Runs in the page: sample history (9 sessions, improving) + the ТЗ 7.3 mistakes.
function sample() {
  U.seed(3);
  Stats.reset();
  for (let s = 0; s < 9; s++) {
    Stats.beginSession(['learn', 'practice', 'tournament'][s % 3]);
    for (let i = 0; i < 24; i++) {
      Stats.record(U.pick(['preflop', 'preflop', 'outs', 'equity', 'potodds', 'action', 'read']), U.chance(0.42 + s * 0.05), { pos: U.pick(Stats.POSITIONS) });
      if (i % 3 === 0) Stats.recordLook(U.chance(0.35));
    }
  }
  const P = Cards.parseList;
  const ms = [
    { cat: 'preflop', title: '❌ Префлоп: K-J разномастные не входят в диапазон UTG', lines: ['Ты на позиции UTG за столом на 9. После тебя ещё 8 игроков.', 'K-J разномастные не входят в диапазон этой позиции (77+, AJs+, AQo+, KQs).', 'Правильно: сбросить.'], handNo: 4, mode: 'learn', pos: 'UTG', hole: P('Kd Js'), board: [] },
    { cat: 'outs', title: '❌ Ауты: ты указал 12, правильно 9', lines: ['У тебя 4 червы (A♥ K♥ + 9♥ 5♥ на борде). Черв в колоде 13, видно 4 → осталось 9 аутов.', 'Тузы и короли не считаем: соперник ставил крупно, и пары туза может не хватить.'], handNo: 9, mode: 'practice', pos: 'CO', hole: P('Ah Kh'), board: P('9h 5h 2c') },
    { cat: 'potodds', title: '❌ Шансы банка: ты указал 25%, правильно 33%', lines: ['Банк 100 + ставка 100 = 200. Твой колл 100.', '100 ÷ (200 + 100) = 33%.'], handNo: 9, mode: 'practice', pos: 'CO', hole: P('Ah Kh'), board: P('9h 5h 2c 7s') },
    { cat: 'action', title: '❌ Действие: ты заколлировал, правильно — сброс (или рейз-полублеф)', lines: ['18% < 33% — колл в долгую невыгоден.', 'Этот соперник часто сбрасывает, поэтому рейз как полублеф тоже был бы разумным вариантом.'], handNo: 9, mode: 'practice', pos: 'CO', hole: P('Ah Kh'), board: P('9h 5h 2c 7s') },
  ];
  ms.forEach((m) => Stats.addMistake(m));
  U.seed(null);
  return ms;
}

const closeModals = () => document.querySelectorAll('.modal-back').forEach((m) => m.remove());
// Runs in the page: a tournament summary.
function summary(ms, won) {
  return {
    place: won ? 1 : 3, total: 9, hands: 57, won, mistakes: ms.slice(0, 3),
    byCat: { preflop: { ok: 18, n: 24 }, action: { ok: 5, n: 9 }, tells: { ok: 7, n: 30 } },
    eliminated: [{ name: 'Игорь', place: 9, hand: 12 }, { name: 'Анна', place: 8, hand: 19 }, { name: 'Олег', place: 7, hand: 26 }, { name: 'Вика', place: 6, hand: 31 }, { name: 'Степан', place: 5, hand: 40 }, { name: 'Марина', place: 4, hand: 49 }]
      .concat(won ? [{ name: 'Тимур', place: 3, hand: 52 }, { name: 'Лена', place: 2, hand: 57 }] : []),
  };
}

// [name, fn run in page (gets sample mistakes), modal?]
const SCENES = [
  ['menu-empty', () => { Stats.reset(); Screens.menu({ onStart() {} }); }],
  ['menu', () => Screens.menu({ onStart() {} })],
  ['settings', () => { Settings.set(Settings.DEFAULTS); Screens.settings({ onBack() {} }); }],
  ['settings-manual', () => { Settings.set({ botsMode: 'manual', players: 6 }); Screens.settings({ onBack() {} }); Settings.set(Settings.DEFAULTS); }],
  ['stats-empty', () => { Stats.reset(); Screens.stats({ onBack() {} }); }],
  ['stats', () => Screens.stats({ onBack() {} })],
  ['stats-modal', () => Screens.statsModal(), true],
  ...['outs', 'rule', 'odds', 'pos', 'types'].map((t) => ['cheat-' + t, `() => Screens.cheatSheet('${t}')`, true]),
  ['range-utg', () => Screens.rangeModal('UTG', 'Диапазон открытия: UTG'), true],
  ['range-vsraise', () => Screens.rangeModal('vsRaise', 'Против рейза'), true],
  ['mistake', (ms) => Screens.mistake(ms[1]), true],
  ['results', (ms) => Screens.results(__summary(ms, false), { onMenu() {}, onAgain() {} })],
  ['results-won', (ms) => Screens.results(__summary(ms, true), { onMenu() {}, onAgain() {} })],
];

// Real clicks: menu → settings → menu → stats (mistake, reset) → cheat sheet → range grid. Returns failures.
async function flow(page) {
  const fails = [];
  const check = async (cond, msg) => { if (!(await page.evaluate(cond))) fails.push(msg); };
  const esc = () => page.keyboard.press('Escape');
  await page.evaluate(`void (${sample})(); Settings.set(Settings.DEFAULTS); Screens.menu({ onStart: (m) => { window.__started = m; } })`);
  await page.click('text=Начать тренировку');
  await check(() => window.__started === 'practice', 'start button calls onStart("practice")');
  await page.click('.sc-nav >> text=Настройки');
  await page.click('input[name=players][value="6"]');
  await page.click('input[name=botsMode][value=manual]');
  await check(() => Settings.get().players === 6 && document.querySelectorAll('select[name=bot]').length === 5, 'players=6 → 5 bot selects');
  await page.selectOption('select[data-i="0"]', 'maniac');
  await page.click('input[name=q][value=tells]');
  await page.$eval('input[name=startBB]', (el) => { el.value = 150; ['input', 'change'].forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true }))); });
  await check(() => { const s = Settings.get(); return s.botStyles[0] === 'maniac' && !s.questions.tells && s.startBB === 150; }, 'bot select, question toggle, stack slider saved');
  await check(() => document.querySelector('[data-out=startBB]').textContent.startsWith('150 BB'), 'slider output updates');
  await page.click('text=← Назад');
  await check(() => document.querySelector('.sc-summary').textContent.includes('6 игроков, стек 150 BB'), 'menu summary reflects settings');
  await page.click('.sc-nav >> text=Статистика');
  await page.click('.sc-mrow >> nth=0');
  await check(() => document.querySelector('.modal h2').textContent === 'Разбор ошибки' && document.querySelectorAll('.modal .pcard').length > 0, 'mistake modal with cards');
  await esc();
  await page.click('text=Сбросить статистику');
  await page.click('.modal-foot >> text=Сбросить');
  await check(() => Stats.data().total.n === 0 && !!document.querySelector('.sc-overview .sc-empty'), 'stats reset after confirmation');
  await page.click('text=← Назад');
  await page.click('.sc-nav >> text=Шпаргалка');
  await page.click('.sc-tab >> text=Позиции');
  await check(() => !document.querySelector('[data-pane=pos]').hidden && document.querySelector('[data-pane=outs]').hidden, 'tab switch');
  await page.click('[data-act=range][data-arg="UTG"]');
  await check(() => document.querySelectorAll('.sc-cell').length === 169, 'range grid has 169 cells');
  await esc();
  await check(() => !document.querySelector('.modal-back'), 'Escape closes modals');
  await page.evaluate(() => Settings.set(Settings.DEFAULTS));
  return fails;
}

(async () => {
  const filter = process.argv[2];
  let problems = 0;
  // SIZES='[[380,800,"xs"]]' checks other widths
  for (const [w, h, tag] of process.env.SIZES ? JSON.parse(process.env.SIZES) : [[390, 844, 'm'], [1366, 800, 'd']]) {
    const { page, errors, close } = await open({ width: w, height: h, mobile: w < 700 });
    if (!filter || filter === 'flow') {
      const fails = await flow(page);
      problems += fails.length;
      console.log(fails.length ? `FLOW (${tag}) failed: ${fails.join('; ')}` : `flow (${tag}) ok`);
    }
    for (const [name, fn, modal] of SCENES) {
      if (filter && !name.includes(filter)) continue;
      await page.evaluate(closeModals);
      // scene functions are self-contained page code; `void` so a modal's pending promise is not awaited
      await page.evaluate(`window.__summary = ${summary}; void (${fn})((${sample})())`);
      await page.waitForTimeout(name === 'results-won' ? 1400 : 250);
      const over = await page.evaluate(() => {
        const d = document.documentElement, m = document.querySelector('.modal');
        const out = [];
        if (d.scrollWidth > innerWidth) out.push(`page scrollWidth ${d.scrollWidth} > ${innerWidth}`);
        if (m && m.scrollWidth > m.clientWidth) out.push(`modal scrollWidth ${m.scrollWidth} > ${m.clientWidth}`);
        return out;
      });
      if (over.length) { problems++; console.log(`OVERFLOW ${name} ${tag}: ${over.join(', ')}`); }
      await page.screenshot({ path: path.join(root, '.shots', `screens-${name}-${tag}.png`), fullPage: !modal });
    }
    if (errors.length) { problems++; console.log(`ERRORS (${tag}):\n` + errors.join('\n')); }
    await close();
  }
  console.log(problems ? `${problems} problem(s)` : 'no console errors, no horizontal overflow');
})().catch((e) => { console.error(e); process.exit(1); });
