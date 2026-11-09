// View-layer preview with hand-made contract-shaped state (no Engine/Bots/Coach needed).
// Usage: node tools/ui-preview.js [scenario=flop|showdown|look] [players=9] [sizes=1366x800,390x844]
// Writes .shots/ui-<scenario>-<n>-<WxH>.png and prints console errors.
const fs = require('fs');
const path = require('path');
const { open } = require('./browser');

const root = path.join(__dirname, '..');
const src = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const [scenario = 'flop', nArg = '9', sizesArg = '1366x800,390x844'] = process.argv.slice(2);

const STUBS = `
const Engine = { pot: (h) => h.committed.reduce((a, b) => a + b, 0), sizeTo: (h, f) => Math.round(120 + f * 450) };
const Ranges = { POS_INFO: new Proxy({}, { get: (_, k) => ({ group: /SB|BB/.test(k) ? 'Блайнд' : /CO|BTN/.test(k) ? 'Поздняя' : /UTG/.test(k) ? 'Ранняя' : 'Средняя', text: 'Чем позже позиция, тем больше рук можно разыгрывать.' }) }) };
const Bots = { STYLES: { rock: { name: 'Камень', type: 'тайтовый пассивный', desc: 'Играет мало рук.' }, station: { name: 'Коллинг-станция', type: 'лузовый пассивный' }, reg: { name: 'Регуляр', type: 'тайтовый агрессивный' }, maniac: { name: 'Маньяк', type: 'лузовый агрессивный' }, actor: { name: 'Актёр', type: 'обманные теллы' } } };
`;

const SCENE = `
(() => {
  const n = ${+nArg}, scenario = '${scenario}';
  const names = ['Ты', 'Игорь', 'Ольга', 'Марат', 'Денис', 'Светлана', 'Пётр', 'Аня', 'Глеб'];
  const colors = ['#b8862e', '#7b3f8c', '#2f6f9e', '#9e4a2f', '#3d7d4f', '#8c2f4f', '#5a5f9e', '#2f8c84', '#7d6a2f'];
  const styles = [null, 'rock', 'station', 'reg', 'maniac', 'actor', 'reg', 'rock', 'station'];
  const POS = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  const players = names.slice(0, n).map((name, i) => ({ seat: i, name, isHuman: !i, style: styles[i], stack: [1880, 2140, 960, 3315, 2000, 1450, 12500, 2000, 780][i], busted: false,
    revealed: i % 3 === 1, avatar: { initials: i ? name.slice(0, 2).toUpperCase() : 'Ты', color: colors[i] }, hud: { hands: 23, vpip: 6, pfr: 3 } }));
  const button = Math.min(3, n - 1);
  const table = { players, button, sb: 10, bb: 20, handNo: 12 };
  const seats = players.map((p) => p.seat);
  const order = []; for (let k = 3; k < n + 3; k++) order.push((button + k) % n);
  const labels = n === 2 ? ['BTN', 'BB'] : POS.slice(9 - n);
  const pos = []; (n === 2 ? [button, (button + 1) % 2] : order).forEach((s, k) => { pos[s] = labels[k]; });
  const C = (s) => Cards.parseList(s);
  const holes = ['Ah Kh', 'Qs Qd', '9c 8c', '7d 7s', 'Jh Tc', '5s 4s', 'Kd Qc', '2h 2c', 'Ac 5d'].map(C);
  const bets = players.map((_, i) => [120, 120, 0, 0, 120, 0, 0, 0, 0][i]);
  const folded = players.map((_, i) => [false, false, true, false, false, true, false, true, false][i] && i < n);
  const hand = { no: 12, sb: 10, bb: 20, button, seats, order, dealt: players.map(() => true), pos, hole: holes.slice(0, n),
    board: C('9h 5h 2c' + (scenario === 'showdown' ? ' Kc 3h' : scenario === 'look' ? ' Kc' : '')), street: 'flop', phase: 'betting', toAct: 0,
    bets: bets.slice(0, n), committed: players.map((_, i) => 60 + bets[i]), startStacks: players.map((p) => p.stack + 180),
    folded: folded.slice(0, n), allIn: players.map((_, i) => i === 3), acted: [], currentBet: 120, minRaise: 120, result: null };
  const S = { mode: 'learn', st: { tournamentReview: 'hand' }, table, hand, boardShown: 3, reveal: new Set(), anim: 1,
    acts: { 1: 'Колл 120', 4: 'Ставка 120', 3: 'Олл-ин' }, turn: 0, caption: 'Денис — ставка 120', hint: () => ({}), rangeKey: null };
  window.__S = S;
  UI.mount(S, {});
  UI.logReset();
  UI.logStreet('preflop'); UI.logLine('Игорь (UTG) — рейз до 60'); UI.logLine('Ты (LJ) — колл 60', 'me'); UI.logLine('Марат (BTN) — колл 60');
  UI.logStreet('flop', hand.board.slice(0, 3)); UI.logLine('Денис (SB) — ставка 120'); UI.logLine('Игорь (UTG) — колл 120');
  if (scenario === 'table') {
    UI.askAction({ seat: 0, toCall: 120, canFold: true, canCheck: false, canCall: true, canRaise: true, minTo: 240, maxTo: 1880, isBet: false, pot: 450, stack: 1880, currentBet: 120, myBet: 0 });
    UI.bubble(2 % n, { bubble: 'смотрит на фишки', anim: 'glance' }, 60000);
    UI.bubble(5 % n, { bubble: '«Ну и флоп…»', anim: 'sigh', acting: true }, 60000);
    UI.coachFb({ verdict: 'correct', title: '✅ Эквити: 9 × 2 = 18%', lines: ['Одна карта, ставка не олл-ин.'] });
  } else if (scenario === 'flop') {
    UI.askAction({ seat: 0, toCall: 120, canFold: true, canCheck: false, canCall: true, canRaise: true, minTo: 240, maxTo: 1880, isBet: false, pot: 450, stack: 1880, currentBet: 120, myBet: 0 });
    UI.bubble(2 % n, { bubble: 'смотрит на фишки', anim: 'glance' }, 60000);
    UI.bubble(4 % n, { bubble: '«Ну и флоп…»', anim: 'sigh', acting: true }, 60000);
    UI.coachAdd('Твоя позиция: <b>LJ</b> (средняя). До тебя все сбросили. Рука: A♠ 9♦. Входит ли она в диапазон?', 'c-prompt');
    UI.coachFb({ verdict: 'mistake', title: '❌ Ауты: ты указал 12, правильно 9.', lines: ['У тебя 4 червы (A♥ K♥ + 9♥ 5♥ на борде). Черв в колоде 13, видно 4 → осталось 9 аутов.'] });
    UI.coachFb({ verdict: 'correct', title: '✅ Эквити: 9 × 2 = 18%', lines: ['Одна карта, ставка не олл-ин.'] });
    UI.askQuestion({ id: 'potodds', type: 'number', prompt: 'Какой процент нужен по шансам банка?', unit: '%', info: { pot: 330, bet: 120, toCall: 120 }, hint: 'колл ÷ (банк + колл)' }, { n: 3, of: 4, hole: hand.hole[0], board: hand.board });
  } else if (scenario === 'showdown') {
    hand.street = 'river'; S.boardShown = 5; S.turn = null; hand.bets = hand.bets.map(() => 0);
    S.reveal = new Set([0, 1, 3]); S.winners = [1]; S.payouts = { 1: 1240 }; S.hl = new Set([...C('Qs Qd 9h 5h Kc')].filter(Boolean));
    S.caption = 'Игорь забирает 1 240 — пара дам'; S.acts = {};
    UI.render();
    UI.review([{ verdict: 'info', title: 'ℹ️ По правилу: 18%. Реально против Q♠Q♦ (Игорь): 19,6%', lines: ['Правило 2 и 4 даёт хорошую оценку.'] }, { verdict: 'mistake', title: '❌ Ты смотрел на борд', lines: ['В этот момент Игорь бросил взгляд на свои фишки — это часто сигнал, что флоп попал.'] }]);
    UI.waitNext();
  } else if (scenario === 'look') {
    S.boardShown = 3; S.turn = null; UI.render();
    UI.askLook('turn', 600000);
  }
})();`;

(async () => {
  const outDir = path.join(root, '.shots');
  fs.mkdirSync(outDir, { recursive: true });
  const js = "'use strict';\n" + ['00-util.js', '10-cards.js', '20-handeval.js', '30-equity.js', '70-view.js', '80-ui.js'].map(src).join('\n') + STUBS;
  const css = fs.readdirSync(path.join(root, 'src')).filter((f) => f.endsWith('.css')).sort().map(src).join('\n');
  const html = src('template.html').replace('/*__STYLES__*/', () => css).replace('/*__SCRIPT__*/', () => js + '\n' + SCENE);
  const file = path.join(outDir, '_ui-preview.html');
  fs.writeFileSync(file, html);
  for (const size of sizesArg.split(',')) {
    const [w, h] = size.split('x').map(Number);
    const { page, errors, close } = await open({ width: w, height: h, file, mobile: w < 700 });
    await page.waitForTimeout(700);
    const out = path.join(outDir, `ui-${scenario}-${nArg}-${w}x${h}.png`);
    await page.screenshot({ path: out });
    console.log(`${out}: ${errors.length ? errors.join('\n') : 'no console errors'}`);
    await close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
