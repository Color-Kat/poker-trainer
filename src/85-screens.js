// ===== Screens: menu, settings, stats, cheat sheet, range grid, mistake review, tournament results =====
// menu / settings / stats / results replace #app; cheatSheet / statsModal / rangeModal / mistake are
// View.modal dialogs, usable from anywhere (also in-game).
const Screens = (() => {
  const POSITIONS = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
  const GROUP = { UTG: 'Ранняя', 'UTG+1': 'Ранняя', MP: 'Средняя', LJ: 'Средняя', HJ: 'Средняя', CO: 'Поздняя', BTN: 'Поздняя', SB: 'Блайнд', BB: 'Блайнд' };
  // ТЗ §8 (name, type, VPIP, PFR, postflop aggression, fold to a bet, bluff, tells) + how to play against.
  // Fallback for Bots.STYLES fields (same keys as STYLE_KEYS).
  const STYLE_KEYS = ['name', 'type', 'vpip', 'pfr', 'postflop', 'foldToBet', 'bluff', 'tells', 'desc'];
  const STYLE_ROWS = {
    rock: ['Камень', 'тайтовый пассивный', '12–15%', '8%', 'Низкая', 'Высокий', 'Почти нет', 'Честные, слабые',
      'Блефуй чаще: он часто сбрасывает. Но если он ставит или рейзит крупно, верь ему и не плати без сильной руки.'],
    station: ['Коллинг-станция', 'лузовый пассивный', '45–55%', '5%', 'Очень низкая', 'Очень низкий', 'Нет', 'Честные, явные',
      'Не блефуй: он всё равно заплатит. С сильной рукой ставь крупнее, он оплатит и с худшей.'],
    reg: ['Регуляр', 'тайтовый агрессивный', '18–22%', '15–18%', 'Высокая', 'Средний', 'Умеренный', 'Почти нет, иногда acting',
      'Уважай его рейзы и не лезь в банк со слабыми руками. Против его ставок в 1/2–3/4 банка особенно аккуратно считай шансы банка.'],
    maniac: ['Маньяк', 'лузовый агрессивный', '40–50%', '30%', 'Очень высокая', 'Низкий', 'Частый', 'Хаотичные',
      'Не блефуй в него. Дождись хорошей руки и дай ему ставить за тебя: чаще коллируй, чем рейзи.'],
    actor: ['Актёр', 'любой базовый стиль + acting', 'как базовый', 'как базовый', 'как базовый', 'как базовый', 'как базовый', 'Обратные: слабость = сила',
      'Читай теллы наоборот: показная слабость означает силу, показная уверенность — блеф. Играет как его базовый стиль.'],
  };
  const DRAWS = [ // ТЗ §10: draw, outs, one card %, two cards %, example
    ['Сет из карманной пары', 2, 4, 8, '7♠ 7♦ на K♣ 9♥ 2♠'],
    ['Гатшот', 4, 9, 17, '9♠ 8♠ на J♦ 7♣ 2♥'],
    ['Две оверкарты', 6, 13, 24, 'A♣ K♦ на 9♥ 6♠ 2♣'],
    ['Открытое стрит-дро', 8, 17, 31, '9♠ 8♦ на 7♣ 6♥ 2♠'],
    ['Флеш-дро', 9, 20, 35, 'A♥ K♥ на 9♥ 5♥ 2♣'],
    ['Флеш-дро + гатшот', 12, 26, 45, 'J♥ 10♥ на 8♥ 7♣ 2♥'],
    ['Флеш-дро + стрит-дро', 15, 33, 54, '9♥ 8♥ на 7♥ 6♣ 2♥'],
  ];
  const ODDS = [['1/3 банка', 20], ['1/2 банка', 25], ['2/3 банка', 28], ['Банк', 33], ['2 банка', 40]];
  const IMPLIED = [ // who pays you off after the draw comes in
    ['Станция, Маньяк', 'Платят много: доплатят и на тёрне, и на ривере.'],
    ['Регуляр', 'Платит, если флеш или стрит не видны на борде.'],
    ['Камень', 'Платит мало: на страшной карте сбросит всё, кроме натса.'],
  ];
  const PLAY = [
    ['Колл', 'Эквити плюс неявные шансы покрывают цену. Лучше в позиции и против лузовых: они ставят и платят со слабыми руками.'],
    ['Рейз', 'Вэлью — рука сильнее того, чем тебе заплатят. Полублеф с дро против тех, кто сбрасывает. Изоляция лимпера рукой лучше его.'],
    ['Сброс', 'Цена больше эквити и неявных шансов. Рука средняя, а против тебя рейз тайтового игрока или банк на троих.'],
  ];
  const SIZES = [
    ['Открытие (до флопа)', '2–3 BB, +1 BB за каждого лимпера'],
    ['3-бет', '×3 от рейза в позиции, ×4 без позиции'],
    ['4-бет', '×2,2–2,5 от 3-бета'],
    ['После флопа, вэлью', '½–¾ банка'],
    ['После флопа, блеф', 'Минимальный, который заставит сбросить'],
  ];
  const MODES = [
    { id: 'learn', name: 'Обучение', suit: '♥', cta: 'Начать обучение', desc: 'Вопросы на каждом решении, учитель и разборы.' },
    { id: 'practice', name: 'Тренировка', suit: '♦', cta: 'Начать тренировку', desc: 'Вопросы выборочно, объяснение — только при ошибке.' },
    { id: 'tournament', name: 'Турнир', suit: '♠', cta: 'Начать турнир', desc: 'Без подсказок. Блайнды растут, без фишек — вылет.' },
  ];
  const MODE_RU = { learn: 'Обучение', practice: 'Тренировка', tournament: 'Турнир' };
  const HOW = [
    'Начни с обучения: вопрос на каждом решении и разбор с цифрами.',
    'Сначала ответь на вопросы, потом выбери действие.',
    'Когда открывается карта, смотри на соперников — они выдают силу руки.',
    'Шпаргалка и диапазоны открываются в любой момент.',
  ];
  const QUESTIONS = [
    ['preflop', 'Префлоп', 'Входить ли в раздачу с этой рукой на этой позиции'],
    ['outs', 'Ауты', 'Сколько карт улучшат твою руку'],
    ['equity', 'Эквити', 'Шанс выиграть по правилу 2 и 4'],
    ['potodds', 'Шансы банка', 'Какой процент нужен, чтобы колл окупался'],
    ['read', 'Чтение соперника', 'Что у него, когда он ставит крупно'],
    ['tells', 'Теллы', 'Смотреть на борд или на соперников, когда открывается карта'],
  ];
  const STYLE_COLS = ['VPIP', 'Рейз префлоп', 'Агрессия после флопа', 'Сброс на ставку', 'Блеф', 'Теллы'];
  const TABS = [['outs', 'Ауты'], ['rule', 'Правило 2 и 4'], ['odds', 'Шансы банка'], ['play', 'Колл/рейз'], ['pos', 'Позиции и диапазоны'], ['types', 'Соперники'], ['tells', 'Теллы']];
  const TAB_FOR = { preflop: 'pos', outs: 'outs', equity: 'rule', potodds: 'odds', action: 'play', read: 'types', tells: 'tells' };
  // How far to trust tells, by style (SPEC §8); the per-reaction rows come from Coach.TELLS_GUIDE.
  const TELL_TRUST = [['Камень', 'честные, но слабые — верь'], ['Станция', 'честные и явные — верь'], ['Регуляр', 'почти нет; иногда актёрство'],
    ['Маньяк', 'хаотичные — не верь'], ['Актёр', 'наоборот: слабость = сила']];

  // Optional cross-module data: undefined instead of a throw when a module is missing or broken.
  const opt = (f) => { try { return f(); } catch (e) { return undefined; } };
  const esc = U.esc;
  const txt = (s) => View.suitText(s);
  const pct = (c) => (c && c.n ? Math.round((100 * c.ok) / c.n) : null);
  const date = (ts) => new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const style = (id) => STYLE_KEYS.map((k, i) => { const v = opt(() => Bots.STYLES[id][k]); return typeof v === 'string' && v ? v : STYLE_ROWS[id][i]; });
  const group = (p) => opt(() => Ranges.POS_INFO[p].group) || GROUP[p];
  const rule4 = (o) => o * 4 - Math.max(0, o - 8);
  const isRed = (s) => s === '♥' || s === '♦';
  // Russian typography: one-letter words stick to the next word, a dash to the previous one.
  const typo = (html) => html.replace(/(?<=^|[\s>(«])([вксуоиаВКСУОИА]) /g, '$1\u00a0').replace(/ —/g, '\u00a0—');
  const modal = (title, body, opts) => View.modal(title, typo(body), opts);

  // ---------- plumbing ----------
  function mount(html, acts) {
    const root = View.el(typo(html));
    document.querySelectorAll('.toast-wrap .toast').forEach((t) => t.remove()); // game toasts must not cover the new screen
    document.getElementById('app').replaceChildren(root);
    window.scrollTo(0, 0);
    const h = root.querySelector('h1');
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    if (acts) onAct(root, acts);
    return root;
  }
  // Click delegation: <button data-act="name" data-arg="x"> → acts.name('x', el)
  function onAct(root, acts) {
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (el && root.contains(el) && acts[el.dataset.act]) acts[el.dataset.act](el.dataset.arg, el);
    });
  }
  const header = (title) => `<header class="sc-head"><button class="btn btn-ghost btn-sm" data-act="back">← Назад</button><h1>${title}</h1></header>`;
  // cols: header cells; rows: arrays of cell HTML; numeric columns from index `numFrom` are right-aligned.
  const table = (cols, rows, numFrom = 1, cls = '') => `<div class="sc-tw"><table class="tbl ${cls}"><thead><tr>${cols.map((c, i) => `<th${i >= numFrom ? ' class="num"' : ''}>${c}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i >= numFrom ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  // ---------- menu ----------
  function menu(opts = {}) {
    const s = Settings.get(), t = Stats.data().total;
    const fact = {
      learn: 'Блайнды 10/20. Проиграешь стек — получишь новый.',
      practice: `Вопросы примерно в ${s.practiceFreq}% решений.`,
      tournament: `Блайнды растут каждые ${U.nplural(s.levelHands, 'раздачу', 'раздачи', 'раздач')}, разбор ${s.tournamentReview === 'end' ? 'в конце турнира' : 'после каждой раздачи'}.`,
    };
    const summary = `Стол на ${U.nplural(s.players, 'игрока', 'игрока', 'игроков')}, стек ${s.startBB} BB.<br>` +
      (t.n ? `Верных ответов: ${pct(t)}% из ${t.n}.` : 'Точность появится после первых ответов.');
    const primary = (id) => (id === 'learn' || t.n ? ' btn-primary' : ''); // first-timer: one call to action
    mount(`<main class="sc sc-menu">
      <section class="sc-rail"><div class="sc-felt">
        <div class="sc-fan" aria-hidden="true">${View.cardHTML(Cards.parse('As'))}${View.cardHTML(Cards.parse('Kh'))}</div>
        <h1 class="sc-title">Тренажёр покера</h1>
        <p class="sc-sub">No-Limit Hold'em — подготовка к первому живому турниру</p>
        <p class="sc-summary">${summary}</p>
      </div></section>
      <section class="sc-modes">${MODES.map((m) => `<article class="panel sc-mode sc-mode-${m.id}">
        <header><span class="sc-chip" aria-hidden="true">${m.suit}</span><h2>${m.name}</h2></header>
        <p>${m.desc}</p><p class="sc-fact">${fact[m.id]}</p>
        <button class="btn${primary(m.id)}" data-act="start" data-arg="${m.id}">${m.cta}</button></article>`).join('')}</section>
      <nav class="sc-nav" aria-label="Разделы"><button class="btn" data-act="settings">Настройки</button><button class="btn" data-act="stats">Статистика</button><button class="btn" data-act="cheat">Шпаргалка</button></nav>
      <section class="sc-how"><h2>Как играть</h2><ul>${HOW.map((h, i) => {
        const suit = '♠♥♦♣'[i];
        return `<li><span class="sc-suit${isRed(suit) ? ' red' : ''}" aria-hidden="true">${suit}</span><span>${h}</span></li>`;
      }).join('')}</ul></section>
    </main>`, {
      start: (mode) => opts.onStart && opts.onStart(mode),
      settings: () => settings({ onBack: () => menu(opts) }),
      stats: () => stats({ onBack: () => menu(opts), onStart: opts.onStart }),
      cheat: () => cheatSheet(),
    });
  }

  // ---------- settings ----------
  const SPEEDS = [['slow', 'Медленно'], ['normal', 'Обычно'], ['fast', 'Быстро']];
  const FREQS = [25, 50, 75, 100].map((f) => [f, f + '%']);
  const REVIEWS = [['hand', 'После каждой раздачи'], ['end', 'В конце турнира']];
  const BOT_MODES = [['random', 'Случайный состав'], ['manual', 'Выбрать вручную']];
  const ASSIST = [['off', 'Выкл'], ['normal', 'Обычно'], ['strong', 'Сильно']];
  const NUMERIC = ['players', 'startBB', 'levelHands', 'practiceFreq'];
  const RANGE_OUT = {
    startBB: (v) => `${v} BB <small>${U.fmt(v * 20)} фишек</small>`,
    levelHands: (v) => `каждые ${U.nplural(v, 'раздачу', 'раздачи', 'раздач')}`,
  };
  const seg = (name, value, items, label) => `<div class="sc-seg" role="radiogroup" aria-label="${label}">${items.map(([v, l]) =>
    `<label><input type="radio" name="${name}" value="${v}"${v === value ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
  const slider = (name, value, [lo, hi], step, label) => `<input type="range" name="${name}" min="${lo}" max="${hi}" step="${step}" value="${value}" aria-label="${label}">`;
  const field = (label, control, out = '', hint = '') => `<div class="sc-field"><div class="sc-field-label"><span>${label}</span>${out}</div>${control}${hint ? `<p class="sc-hint">${hint}</p>` : ''}</div>`;
  const out = (name, v) => `<output data-out="${name}">${RANGE_OUT[name](v)}</output>`;

  function botsHTML(s) {
    if (s.botsMode !== 'manual') return '<p class="sc-hint">Стили соперников выбираются случайно в начале каждой игры.</p>';
    return `<div class="sc-bots">${s.botStyles.slice(0, s.players - 1).map((id, i) => `<label class="sc-bot"><span>Соперник ${i + 1}</span>
      <select name="bot" data-i="${i}">${Settings.STYLE_IDS.map((x) => `<option value="${x}"${x === id ? ' selected' : ''}>${esc(style(x)[0])}</option>`).join('')}</select></label>`).join('')}</div>
      <p class="sc-hint">Чем отличаются стили — <button class="sc-link" data-act="types">в шпаргалке</button>.</p>`;
  }

  const switchRow = (name, on, title, hint) => `<label class="sc-switch"><span><b>${title}</b><small>${hint}</small></span><input type="checkbox" name="${name}"${on ? ' checked' : ''}></label>`;
  const heroPosHTML = (s) => {
    const names = opt(() => Engine.positionNames(s.players)) || POSITIONS;
    return `<select name="heroPos" aria-label="Моя позиция">${['any', ...names].map((p) => `<option value="${p}"${p === s.heroPos ? ' selected' : ''}>${p === 'any' ? 'Любая (по кругу)' : p}</option>`).join('')}</select>`;
  };

  function settings(opts = {}) {
    const s = Settings.get(), L = Settings.LIMITS;
    const players = [];
    for (let n = L.players[0]; n <= L.players[1]; n++) players.push([n, n]);
    const root = mount(`<main class="sc sc-settings">${header('Настройки')}
      <p class="sc-lead">Изменения сохраняются сразу.</p>
      <div class="sc-cols">
        <div>
          <section class="panel sc-sec"><h2>Стол</h2>
            ${field('Игроков за столом', seg('players', s.players, players, 'Игроков за столом'), '', 'Считая тебя.')}
            ${field('Стартовый стек', slider('startBB', s.startBB, L.startBB, 10, 'Стартовый стек в больших блайндах'), out('startBB', s.startBB))}
            ${field('Рост блайндов', slider('levelHands', s.levelHands, L.levelHands, 1, 'Блайнды в турнире растут каждые N раздач'), out('levelHands', s.levelHands), 'Только в режиме «Турнир».')}
          </section>
          <section class="panel sc-sec"><h2>Игра</h2>
            ${field('Скорость анимаций', seg('speed', s.speed, SPEEDS, 'Скорость анимаций'))}
            ${field('Вопросы в тренировке', seg('practiceFreq', s.practiceFreq, FREQS, 'Частота вопросов в тренировке'), '', 'Доля ключевых решений, на которых появляются вопросы.')}
            ${field('Разбор ошибок в турнире', seg('tournamentReview', s.tournamentReview, REVIEWS, 'Разбор ошибок в турнире'))}
          </section>
        </div>
        <div>
          <section class="panel sc-sec"><h2>Обучение</h2>
            ${switchRow('teacher', s.teacher, 'Учитель: подсказывать лучший ход', 'Перед каждым ходом — какое действие лучше и почему.')}
            ${switchRow('autoSkipFolded', s.autoSkipFolded, 'Сразу пропускать раздачу, когда я сбросил', 'Не ждать ходов соперников.')}
            ${field('Подкрутка раздач', seg('dealAssist', s.dealAssist, ASSIST, 'Подкрутка раздач'), '', 'Чаще интересные руки вместо мусора. Только обучение и тренировка.')}
            ${field('Моя позиция', `<div data-heropos>${heroPosHTML(s)}</div>`, '', 'Закрепи позицию, чтобы отработать её. Не в турнире.')}
          </section>
          <section class="panel sc-sec"><h2>Соперники</h2>
            ${seg('botsMode', s.botsMode, BOT_MODES, 'Состав соперников')}
            <div data-bots>${botsHTML(s)}</div>
          </section>
          <section class="panel sc-sec"><h2>Вопросы</h2>
            ${QUESTIONS.map(([k, name, hint]) => `<label class="sc-switch"><span><b>${name}</b><small>${hint}</small></span>
              <input type="checkbox" name="q" value="${k}"${s.questions[k] ? ' checked' : ''}></label>`).join('')}
          </section>
        </div>
      </div>
      <div class="sc-foot"><button class="btn" data-act="reset">Сбросить настройки</button></div>
    </main>`, {
      back: () => opts.onBack && opts.onBack(),
      reset: () => { Settings.set(Settings.DEFAULTS); settings(opts); View.toast('Настройки сброшены'); },
      types: () => cheatSheet('types'),
    });
    root.addEventListener('input', (e) => {
      const o = root.querySelector(`[data-out="${e.target.name}"]`);
      if (o) o.innerHTML = RANGE_OUT[e.target.name](+e.target.value);
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'q') Settings.set({ questions: { [t.value]: t.checked } });
      else if (t.type === 'checkbox') Settings.set({ [t.name]: t.checked });
      else if (t.name === 'bot') { const b = Settings.get().botStyles; b[+t.dataset.i] = t.value; Settings.set({ botStyles: b }); }
      else if (t.name) Settings.set({ [t.name]: NUMERIC.includes(t.name) ? +t.value : t.value });
      if (t.name === 'players' || t.name === 'botsMode') root.querySelector('[data-bots]').innerHTML = typo(botsHTML(Settings.get()));
      if (t.name === 'players') {
        const cur = Settings.get(), names = opt(() => Engine.positionNames(cur.players)) || POSITIONS;
        if (!names.includes(cur.heroPos)) Settings.set({ heroPos: 'any' });
        root.querySelector('[data-heropos]').innerHTML = heroPosHTML(Settings.get());
      }
    });
  }

  // ---------- stats ----------
  function barsHTML(byCat, onlyPlayed) {
    const cats = Stats.CATS.filter((c) => !onlyPlayed || (byCat[c] && byCat[c].n));
    if (!cats.length) return '<p class="sc-empty">Оценённых решений не было.</p>';
    return `<div class="sc-bars">${cats.map((cat) => {
      const c = byCat[cat] || { ok: 0, n: 0 }, p = pct(c);
      return `<div class="sc-bar"><div class="sc-bar-top"><span>${Stats.CAT_RU[cat]}
        <small>${c.n ? `${c.ok} из ${c.n}` : 'нет ответов'}</small></span>${p === null ? '<b class="sc-dim">—</b>' : `<b>${p}%</b>`}</div>
        <div class="sc-track"><i style="width:${p || 0}%"></i></div></div>`;
    }).join('')}</div>`;
  }

  const posTable = (byPos) => table(['Позиция', 'Верно', 'Решений'], POSITIONS.map((p) => {
    const c = byPos[p] || { ok: 0, n: 0 }, v = pct(c);
    return [`<b>${p}</b> <small class="sc-inline">${esc(group(p).toLowerCase())}</small>`,
      v === null ? '<span class="sc-dim">—</span>' : `<span class="sc-meter"><i style="width:${v}%"></i></span>${v}%`, c.n];
  }), 2, 'sc-pos');

  const catName = (c) => Stats.CAT_RU[c] || c || 'Ошибка';
  // opts: byHand — «Раздача N» instead of the time; limit — rows shown before «Показать все»; empty — text for [].
  function mistakesHTML(list, { byHand = false, limit = Infinity, empty = 'Ошибок пока нет.' } = {}) {
    if (!list.length) return `<p class="sc-empty">${empty}</p>`;
    const hand = (m) => (m.handNo != null ? 'Раздача ' + esc(m.handNo) : '');
    const when = (m) => (byHand ? hand(m) || (m.ts ? date(m.ts) : '') : m.ts ? date(m.ts) : hand(m));
    const counts = {};
    for (const m of list) counts[catName(m.cat)] = (counts[catName(m.cat)] || 0) + 1;
    const more = list.length > limit;
    return `${more ? `<p class="sc-mcount">${Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${esc(c)}\u00a0— ${n}`).join(' · ')}</p>` : ''}
      <ol class="sc-mlist">${list.map((m, i) => `<li${i >= limit ? ' hidden' : ''}><button class="sc-mrow" data-act="mistake" data-arg="${i}">
      <span class="sc-mdate">${when(m)}</span><span class="sc-tag">${esc(catName(m.cat))}</span>
      <span class="sc-mtitle">${txt(m.title || 'Ошибка')}</span></button></li>`).join('')}</ol>
      ${more ? `<p><button class="btn btn-sm" data-act="more">Показать все (${list.length})</button></p>` : ''}`;
  }
  const showAll = (_, el) => { el.closest('.sc-sec').querySelectorAll('.sc-mlist li[hidden]').forEach((li) => { li.hidden = false; }); el.parentElement.remove(); };

  function statsHTML(d, opts = {}) {
    const t = d.total, played = d.sessions.filter((s) => s.n > 0).length;
    if (!t.n && !d.mistakes.length && Stats.CATS.every((c) => !d.byCat[c].n)) {
      return `<section class="panel sc-sec sc-center"><p class="sc-empty">Пока нет ответов. Сыграй несколько раздач — здесь появится твоя точность по категориям, позициям и сессиям.</p>
        ${opts.onStart ? '<p><button class="btn btn-primary" data-act="start" data-arg="learn">Начать обучение</button></p>' : ''}</section>`;
    }
    const weak = Stats.CATS.filter((c) => c !== 'tells' && d.byCat[c].n >= 5).sort((a, b) => pct(d.byCat[a]) - pct(d.byCat[b]))[0];
    return `<section class="panel sc-sec sc-overview">${t.n ? `<div class="sc-big">${pct(t)}%</div><div>
        <p class="sc-big-label">верных ответов</p><p class="sc-dim">${t.ok} из ${t.n}, ${U.nplural(played, 'сессия', 'сессии', 'сессий')}</p>
        ${weak ? `<p class="sc-weak">Слабее всего: ${Stats.CAT_RU[weak].toLowerCase()}, ${pct(d.byCat[weak])}%. <button class="sc-link" data-act="cheat" data-arg="${TAB_FOR[weak]}">Повторить в шпаргалке</button></p>` : ''}</div>`
      : '<p class="sc-empty">Пока нет ответов. Сыграй несколько раздач — здесь появится твоя точность по категориям, позициям и сессиям.</p>'}</section>
      <div class="sc-cols">
        <section class="panel sc-sec"><h2>По категориям</h2>${barsHTML(d.byCat)}</section>
        <section class="panel sc-sec"><h2>Префлоп по позициям</h2>${posTable(d.byPos)}</section>
      </div>
      <section class="panel sc-sec"><h2>Прогресс по сессиям</h2><div class="sc-chart"></div></section>
      <section class="panel sc-sec"><h2>Последние ошибки</h2>${mistakesHTML(d.mistakes)}</section>
      <div class="sc-foot"><button class="btn btn-danger" data-act="reset">Сбросить статистику</button></div>`;
  }

  // Accuracy per session (sessions with answers, last 20), drawn at the box's real width so text stays 1:1.
  function drawChart(box, list) {
    const W = Math.floor(box.clientWidth), H = 196, L = 42, R = 14, T = 24, B = 26;
    if (W < 120) return;
    const n = list.length, v = list.map((s) => Math.round((100 * s.ok) / s.n));
    const x = (i) => (n === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1));
    const y = (p) => T + ((100 - p) * (H - T - B)) / 100;
    const step = Math.max(1, Math.ceil(n / Math.floor((W - L - R) / 30)));
    const path = v.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p).toFixed(1)}`).join(' ');
    box.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="Точность по сессиям: последняя ${v[n - 1]}%${n > 1 ? `, первая ${v[0]}%` : ''}">
      <g class="g">${[0, 25, 50, 75, 100].map((p) => `<line x1="${L}" x2="${W - R}" y1="${y(p)}" y2="${y(p)}"/><text x="${L - 8}" y="${y(p) + 4}" text-anchor="end">${p}%</text>`).join('')}</g>
      ${v.map((_, i) => ((n - 1 - i) % step ? '' : `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${i + 1}</text>`)).join('')}
      ${n > 1 ? `<path class="ar" d="${path} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z"/><path class="ln" d="${path}"/>` : ''}
      <line class="x" y1="${T}" y2="${y(0)}"/>
      ${v.map((p, i) => `<circle class="dt" cx="${x(i)}" cy="${y(p)}" r="4"/>`).join('')}
      <text class="lbl" x="${x(n - 1)}" y="${y(v[n - 1]) - 10}" text-anchor="${n > 1 ? 'end' : 'middle'}">${v[n - 1]}%</text>
    </svg><p class="sc-readout" aria-live="polite"></p>`;
    const svg = box.firstElementChild, cross = svg.querySelector('.x'), read = box.lastElementChild;
    const show = (i) => {
      const s = list[i];
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
      read.textContent = `Сессия ${i + 1}${s.mode && MODE_RU[s.mode] ? ` (${MODE_RU[s.mode].toLowerCase()})` : ''}, ${date(s.ts)}: ${v[i]}%, верно ${s.ok} из ${s.n}`;
    };
    svg.addEventListener('pointermove', (e) => {
      svg.classList.add('hover');
      const px = e.clientX - svg.getBoundingClientRect().left;
      show(n === 1 ? 0 : U.clamp(Math.round(((px - L) * (n - 1)) / (W - L - R)), 0, n - 1));
    });
    svg.addEventListener('pointerleave', () => { svg.classList.remove('hover'); show(n - 1); });
    show(n - 1);
  }
  function chart(box, list) {
    if (!list.length) { box.innerHTML = '<p class="sc-empty">График появится после первой игры с ответами.</p>'; return; }
    let w = -1;
    const draw = () => { if (box.clientWidth !== w) { w = box.clientWidth; drawChart(box, list); } };
    draw();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => (box.isConnected ? draw() : ro.disconnect()));
    ro.observe(box);
  }

  function fillStats(box, opts) {
    const d = Stats.data();
    box.innerHTML = typo(statsHTML(d, opts));
    const c = box.querySelector('.sc-chart');
    if (c) chart(c, d.sessions.filter((s) => s.n > 0).slice(-20));
  }
  function wireStats(box, opts = {}) {
    onAct(box, {
      start: (mode) => opts.onStart && opts.onStart(mode),
      mistake: (i) => mistake(Stats.data().mistakes[+i]),
      cheat: (tab) => cheatSheet(tab),
      reset: async () => {
        const yes = await modal('Сбросить статистику?', '<p>Удалятся все ответы, сессии и список ошибок. Вернуть их будет нельзя.</p>',
          { buttons: [{ label: 'Отмена', value: false }, { label: 'Сбросить', value: true, cls: 'btn-danger' }] });
        if (yes) { Stats.reset(); fillStats(box, opts); }
      },
    });
    fillStats(box, opts);
  }
  // opts: onBack(), onStart(mode) — the empty state offers «Начать обучение» when onStart is given.
  function stats(opts = {}) {
    const root = mount(`<main class="sc sc-stats">${header('Статистика')}<div class="sc-stats-body"></div></main>`, { back: () => opts.onBack && opts.onBack() });
    wireStats(root.querySelector('.sc-stats-body'), opts);
  }
  const statsModal = () => modal('Статистика', '<div class="sc-stats-body"></div>', { wide: true, onOpen: (body) => wireStats(body.firstElementChild) });

  // ---------- cheat sheet ----------
  const PANES = {
    outs: () => `<p>Аут — карта, которая улучшит твою руку до, скорее всего, лучшей. Шанс поймать аут:</p>
      ${table(['Дро', 'Ауты', 'Одна карта', 'Две карты'], DRAWS.map(([name, o, p1, p2, ex]) => [`${name}<small>${txt(ex.split(' на ').map((g) => g.replace(/ /g, '\u00a0')).join(' на '))}</small>`, o, p1 + '%', p2 + '%']))}
      <p class="sc-note"><b>Как считать.</b> Флеш-дро: в масти 13 карт, 4 ты видишь, осталось 9 аутов. Открытое стрит-дро: по 4 карты с каждой стороны, итого 8.</p>
      <h3>Ауты до пары</h3>
      <ul class="sc-rules">
        <li><b>Оверкарты</b> — твои карты старше всех на борде: по 3 аута за карту. ${txt('A♠\u00a0K♦')} на ${txt('9♥\u00a05♣\u00a02♦')} — 6 аутов.</li>
        <li><b>Один соперник, ставка меньше ⅔ банка</b> — считай их полностью: флеш-дро + две оверкарты = 9 + 6 = 15.</li>
        <li><b>Крупная ставка или банк на троих+</b> — половину, по 1,5 за карту: пары туза может не хватить.</li>
        <li><b>Пара младшей картой — не аут:</b> ${txt('7♠\u00a06♦')} на ${txt('K♣\u00a09♥\u00a02♠')} — пара семёрок проигрывает любой паре старше.</li>
      </ul>
      <h3>Грязные ауты</h3>
      <p class="sc-note">Аут улучшает тебя, но может дать сопернику руку лучше. Считай так: все ауты − грязные = чистые.</p>
      <ul class="sc-rules">
        <li><b>Спаривает борд:</b> A♥ K♥ на 9♥ 5♥ 2♣ — 2♥ даёт тебе флеш, а сопернику с сетом фулл-хаус. Чистых 8 из 9.</li>
        <li><b>Три карты масти:</b> 8♠ 7♠ на 6♦ 5♦ K♣ — 4♦ и 9♦ дают стрит, но и чужой флеш. Чистых 6 из 8.</li>
        <li><b>Не натсовый флеш:</b> у тебя одна карта масти, и она мелкая — флеш соберёшь, а у соперника может быть старше.</li>
      </ul>
      <p class="sc-note"><b>Правило:</b> один на один считай все ауты; в банке 3+ игроков — только чистые.</p>`,
    rule: () => `<div class="sc-formula">
        <p><b>Одна карта</b> — ставка не олл-ин, ты увидишь только следующую карту:</p><p class="sc-eq">эквити ≈ ауты × 2</p>
        <p><b>Две карты</b> — олл-ин на флопе, ты увидишь и тёрн, и ривер:</p><p class="sc-eq">эквити ≈ ауты × 4</p>
        <p>Больше 8 аутов — × 4 завышает шанс. Поправка:</p><p class="sc-eq">эквити ≈ ауты × 4 −&nbsp;<span class="sc-nw">(ауты − 8)</span></p></div>
      ${table(['Ауты', 'Правило × 2', 'Точно, одна карта', 'Правило × 4', 'Точно, две карты'], DRAWS.map(([, o, p1, p2]) => [o, o * 2 + '%', p1 + '%', rule4(o) + '%', p2 + '%']), 1, 'sc-d')}
      ${table(['Ауты', '× 2 <small class="sc-inline">(точно)</small>', '× 4 <small class="sc-inline">(точно)</small>'], DRAWS.map(([, o, p1, p2]) => [o, `${o * 2}% <small class="sc-inline">(${p1}%)</small>`, `${rule4(o)}% <small class="sc-inline">(${p2}%)</small>`]), 1, 'sc-m')}
      <p class="sc-note"><b>Пример.</b> Флеш-дро и стрит-дро — 15 аутов, соперник на флопе пошёл олл-ин. Ты увидишь две карты: 15 × 4 = 60, поправка 15 − 8 = 7, итого 60 − 7 = 53%. Точное значение — 54%, правило почти не ошибается. Если бы ставка была не олл-ин, ты увидел бы одну карту: 15 × 2 = 30%.</p>`,
    odds: () => `<div class="sc-formula"><p>Сколько эквити нужно, чтобы колл окупался в долгую:</p>
        <p class="sc-eq">нужно % = колл ÷ (банк со ставкой соперника + колл) × 100</p></div>
      ${table(['Ставка соперника', 'Нужно эквити'], ODDS.map(([b, p]) => [b, p + '%']))}
      <p class="sc-note"><b>Пример.</b> В банке 100, соперник ставит 100. Банк со ставкой — 200, тебе доплатить 100: 100 ÷ (200 + 100) = 33%.</p>
      <p class="sc-note"><b>Как решать.</b> Эквити не меньше нужного — колл. Меньше — сброс, если не выручат неявные шансы (ниже). С сильным дро (8+ аутов) против соперника, который умеет сбрасывать, рейз-полублеф может быть лучше. С 12+ аутами рейз почти всегда лучше, кроме игры против коллинг-станции.</p>
      <p class="sc-note"><b>Вместе с правилом 2 и 4.</b> Флеш-дро на тёрне (9 аутов), соперник ставит банк: эквити 9 × 2 = 18%, нужно 33%, значит сброс.</p>
      <h3>Неявные шансы</h3>
      <div class="sc-formula"><p>Собрав дро, ты выиграешь ещё фишек на следующих улицах. Тогда:</p>
        <p class="sc-eq">нужно % = колл ÷ <span class="sc-nw">(банк + колл +</span> <span class="sc-nw">сколько ещё выиграешь)</span></p></div>
      <p class="sc-note"><b>Пример.</b> Флеш-дро на флопе, ~18% до тёрна. В банке 100, ставка 50: нужно 50 ÷ 200 = 25% — по шансам банка сброс. Но стеки по 100 BB, соперник — коллинг-станция: с флешем доберёшь ещё ~200. Нужно 50 ÷ (200 + 200) ≈ 12% — колл.</p>
      <dl class="sc-vs">${IMPLIED.map(([n, t]) => `<dt>${n}</dt><dd>${t}</dd>`).join('')}</dl>
      <h3>Когда неявных шансов нет</h3>
      <ul class="sc-rules">
        <li><b>Короткие стеки</b> — за ставкой почти ничего не осталось, добирать нечего.</li>
        <li><b>Очевидное дро</b> — пришла третья карта масти, и соперник больше не платит.</li>
        <li><b>Тёрн</b> — впереди одна карта и одна ставка, а не две.</li>
        <li><b>Не натсовое дро</b> — соберёшь, а проиграешь старшему флешу.</li>
      </ul>`,
    play: () => `<h3>Колл, рейз или сброс?</h3>
      <dl class="sc-vs">${PLAY.map(([n, t]) => `<dt>${n}</dt><dd>${t}</dd>`).join('')}</dl>
      <p class="sc-note"><b>Против нескольких соперников</b> блефуй и полублефуй реже, рейз — в основном для вэлью. Колл с дро лучше: банк больше, неявные шансы выше.</p>
      <h3>Размеры ставок</h3>
      ${table(['Ситуация', 'Размер'], SIZES, 9)}
      <p class="sc-note">Один размер и с сильной рукой, и с блефом — тогда по размеру тебя не прочитать.</p>`,
    pos: () => `<p class="sc-note">Выбери ситуацию и позицию. Твоя рука в игре подсвечивается белой рамкой.</p><div class="rb" data-rb></div>
      <p class="sc-note">Над диагональю — одномастные (s), под ней — разномастные (o), на диагонали — пары. За столом меньше 9 ранние позиции убираются.</p>`,
    types: () => `${table(['Стиль', ...STYLE_COLS],
        Object.keys(STYLE_ROWS).map((id) => { const r = style(id).map(esc); return [`<b>${r[0]}</b><small>${r[1]}</small>`, ...r.slice(2, 8)]; }), 9, 'sc-wide sc-d')}
      <div class="sc-m sc-cards">${Object.keys(STYLE_ROWS).map((id) => { const r = style(id).map(esc); return `<div class="sc-card"><b>${r[0]}</b> <small>${r[1]}</small>
        <dl>${STYLE_COLS.map((c, i) => `<div><dt>${c}</dt><dd>${r[i + 2]}</dd></div>`).join('')}</dl></div>`; }).join('')}</div>
      <p class="sc-note">VPIP — как часто игрок добровольно вкладывает фишки до флопа. Стиль соперника подписывается после 20 раздач с ним.</p>
      <h3>Как играть против</h3>
      <dl class="sc-vs">${Object.keys(STYLE_ROWS).map((id) => { const r = style(id).map(esc); return `<dt>${r[0]}</dt><dd>${r[8]}</dd>`; }).join('')}</dl>`,
    tells: () => {
      const guide = opt(() => Coach.TELLS_GUIDE) || [];
      return `<p class="sc-note">Когда открывается карта, смотри на соперников: реакция часто выдаёт, попал ли он.</p>
      ${guide.length ? table(['Реакция', 'Что значит', 'Насколько верить'], guide.map((g) => [`<b>${esc(g.sign || g.anim)}</b>`, esc(g.meaning || ''), esc(g.reliability || '')]), 9, 'sc-wide') : ''}
      <h3>Кому верить</h3>
      <dl class="sc-vs">${TELL_TRUST.map(([n, t]) => `<dt>${n}</dt><dd>${t}</dd>`).join('')}</dl>
      <p class="sc-note">Около 15% реакций — случайный шум. <b>Как проверить себя:</b> отвечай на вопрос «Что значит…» — после раздачи тренер покажет, что было у соперника.</p>`;
    },
  };

  function cheatSheet(tab) {
    const cur = PANES[tab] ? tab : 'outs';
    const body = `<div class="sc-tabs" role="tablist">${TABS.map(([id, label]) =>
      `<button class="sc-tab" role="tab" data-act="tab" data-arg="${id}" aria-selected="${id === cur}">${label}</button>`).join('')}</div>
      ${TABS.map(([id]) => `<section class="sc-pane" data-pane="${id}" role="tabpanel"${id === cur ? '' : ' hidden'}>${PANES[id]()}</section>`).join('')}`;
    // On phones the tabs are one scrolling row: keep the selected one in view.
    const reveal = (root) => { const t = root.querySelector('.sc-tab[aria-selected="true"]'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); };
    return modal('Шпаргалка', body, {
      wide: true,
      onOpen: (root) => {
        reveal(root);
        rangeBrowser(root.querySelector('[data-rb]'), { tab: 'open', pos: 'UTG', n: 9 });
        onAct(root, {
          tab: (id) => {
            root.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== id; });
            root.querySelectorAll('.sc-tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.arg === id));
            root.closest('.modal').scrollTop = 0;
            reveal(root);
          },
        });
      },
    });
  }

  // ---------- range grids: a tab per preflop situation × a chip per position ----------
  const RB_TABS = [['sit', 'Твоя ситуация'], ['open', 'Открытие'], ['limp', 'Против лимпа'], ['vsRaise', 'Против рейза'], ['vs3bet', 'Против 3-бета']];
  const RB_NOTE = {
    open: 'До тебя все сбросили — открывай рейзом.',
    limp: 'Перед тобой лимперы (или ты BB после лимпа) — рейз.',
    vsRaise: 'До тебя повысили. Мелкие пары — только при стеке ≥ 20 рейзов.',
    vs3bet: 'Был рейз и ререйз (3-бет).',
  };
  const rbKey = (st) => (st.tab === 'sit' ? st.sit.key : st.tab === 'open' ? st.pos : `${st.tab === 'limp' ? 'limped' : st.tab}:${st.pos}`);
  // st = { tab, pos, n, hl, sit: { key, caption, hl, ctx? } | null } — redrawn in place on every click.
  function rangeBrowser(box, st) {
    if (!box) return;
    const names = opt(() => Engine.positionNames(st.n)) || POSITIONS;
    if (!names.includes(st.pos)) st.pos = names[0];
    const draw = () => {
      const tabs = RB_TABS.filter(([id]) => id !== 'sit' || st.sit);
      const head = st.tab === 'sit' ? `<p class="rb-cap"><b>${txt(st.sit.caption || '')}</b></p>`
        : `<div class="rb-pos">${names.map((p) => `<button class="rb-chip" data-act="rbpos" data-arg="${p}" aria-pressed="${p === st.pos}">${p}</button>`).join('')}</div><p class="rb-cap">${RB_NOTE[st.tab]}</p>`;
      box.innerHTML = `<div class="rb-tabs" role="tablist">${tabs.map(([id, l]) => `<button class="rb-tab" role="tab" data-act="rbtab" data-arg="${id}" aria-selected="${id === st.tab}">${l}</button>`).join('')}</div>
        ${head}${View.rangeGridHTML(rbKey(st), st.hl || (st.sit && st.sit.hl), st.tab === 'sit' ? st.sit.ctx : undefined) || '<p class="sc-empty">Сетка недоступна.</p>'}`;
    };
    onAct(box, { rbtab: (id) => { st.tab = id; draw(); }, rbpos: (p) => { st.pos = p; draw(); } });
    draw();
  }
  // rangeModal({ situation, pos, n, hl }) — tabs «Твоя ситуация» (when given) + the standard ones.
  // Old form rangeModal(key, title): one grid.
  function rangeModal(a, title) {
    if (typeof a === 'string') return modal(title || 'Диапазон', View.rangeGridHTML(a) || '<p class="sc-empty">Сетка недоступна.</p>');
    const o = a || {};
    const st = { tab: o.situation ? 'sit' : 'open', pos: o.pos || 'BTN', n: o.n || 9, hl: o.hl || null, sit: o.situation || null };
    return modal('Диапазоны', '<div class="rb" data-rb></div>', { onOpen: (body) => rangeBrowser(body.firstElementChild, st) });
  }

  // ---------- one stored mistake ----------
  function mistake(m) {
    if (!m) return Promise.resolve(null);
    const meta = [['Категория', Stats.CAT_RU[m.cat] || m.cat], ['Позиция', m.pos], ['Раздача', m.handNo != null && '№' + m.handNo],
      ['Режим', MODE_RU[m.mode] || m.mode], ['Когда', m.ts && date(m.ts)]].filter(([, v]) => v);
    const cards = (label, cs) => (cs && cs.length ? `<div class="sc-mcards"><span>${label}</span>${View.cardsHTML(cs, { size: 'sm' })}</div>` : '');
    return modal('Разбор ошибки', `<dl class="sc-meta">${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <div class="sc-mhand">${cards('Твои карты', m.hole)}${cards('Борд', m.board)}</div>
      ${View.feedbackHTML({ verdict: 'mistake', title: m.title || 'Ошибка', lines: m.lines })}`);
  }

  // ---------- tournament results ----------
  function results(sum = {}, opts = {}) {
    const { place = 0, total = 0, hands = 0, won = false, mistakes = [], byCat = {}, eliminated = [] } = sum;
    const counted = Stats.CATS.filter((c) => c !== 'tells').map((c) => byCat[c] || { ok: 0, n: 0 });
    const t = { ok: U.sum(counted.map((c) => c.ok)), n: U.sum(counted.map((c) => c.n)) };
    const confetti = won ? `<div class="sc-confetti" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => {
      const suit = '♠♥♦♣'[i % 4];
      return `<i class="${isRed(suit) ? 'red' : ''}" style="left:${(i * 41 + 3) % 97}%;animation-delay:${((i * 7) % 12) * 0.12}s;animation-duration:${2.4 + (i % 5) * 0.4}s">${suit}</i>`;
    }).join('')}</div>` : '';
    const elim = eliminated.slice().sort((a, b) => b.place - a.place);
    mount(`<main class="sc sc-results">
      <section class="sc-rail"><div class="sc-felt">${confetti}
        ${won ? `<p class="sc-medal" aria-hidden="true">1</p><h1 class="sc-place">Победа! Ты выиграл турнир</h1>
          <p class="sc-sub">Все фишки стола у тебя — за ${U.nplural(hands, 'раздачу', 'раздачи', 'раздач')}.</p>`
        : `<h1 class="sc-place">Ты занял ${place}-е место из ${total}</h1>
          <p class="sc-sub">Раздач сыграно: ${hands}. ${mistakes.length ? 'Разбери ошибки ниже — так быстрее всего растёт результат.' : 'Ошибок не было — отличная игра.'}</p>`}
      </div></section>
      <div class="sc-actions"><button class="btn btn-primary" data-act="again">Сыграть ещё турнир</button><button class="btn" data-act="menu">В меню</button>
        <button class="btn" data-act="cheat">Шпаргалка</button><button class="btn" data-act="stats">Статистика</button></div>
      <div class="sc-cols">
        <section class="panel sc-sec"><h2>Точность в турнире</h2>
          ${t.n ? `<p class="sc-dim">Верных ответов: ${pct(t)}%, ${t.ok} из ${t.n}.</p>` : ''}${barsHTML(byCat, true)}</section>
        <section class="panel sc-sec"><h2>Вылеты</h2>${elim.length ? `<ol class="sc-elim">${elim.map((e) => `<li><span class="sc-elim-place">${esc(e.place)}-е</span>
          <span>${esc(e.name)}</span><span class="sc-dim">раздача ${esc(e.hand)}</span></li>`).join('')}</ol>` : '<p class="sc-empty">Никто не вылетел.</p>'}</section>
      </div>
      <section class="panel sc-sec"><h2>Ошибки турнира</h2>${mistakesHTML(mistakes, { byHand: true, limit: 5, empty: 'Ошибок не было.' })}</section>
    </main>`, {
      again: () => opts.onAgain && opts.onAgain(),
      menu: () => opts.onMenu && opts.onMenu(),
      mistake: (i) => mistake(mistakes[+i]),
      more: showAll,
      cheat: () => cheatSheet(),
      stats: () => statsModal(),
    });
  }

  return { menu, settings, stats, statsModal, cheatSheet, rangeModal, mistake, results };
})();
