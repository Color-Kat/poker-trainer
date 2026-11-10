// ===== UI: the game screen — header, table, seats, board, action dock, coach panel, hand log =====
// DOM only. Game owns the state: mount(S, handlers) keeps a reference to the session object S and
// render() redraws from it. ask*() functions return Promises resolved by the player's input.
const UI = (() => {
  let S = null, H = {}, root = null, tableEl = null, feed = null, logBody = null, side = null, dock = null;
  let seatEls = [], betEls = [], prevBets = [], shownBoard = 0, boardBase = 0;
  let act = null, nextRes = null, keysBound = false, popSeat = null, tipFor = null, tipSticky = false, adv = null;
  const MODE_RU = { learn: 'Обучение', practice: 'Тренировка', tournament: 'Турнир' };
  const STREET_RU = { preflop: 'Префлоп', flop: 'Флоп', turn: 'Тёрн', river: 'Ривер' };
  const QUICK = ['⅓', '½', '⅔', 'Банк', 'Олл-ин'];
  const $ = (sel, el = root) => el.querySelector(sel);
  const $$ = (sel, el = root) => [...el.querySelectorAll(sel)];
  const put = (el, html) => { if (el && el._h !== html) { el._h = html; el.innerHTML = html; } };
  const tog = (el, c, on) => el && el.classList.toggle(c, !!on);
  const fmt = U.fmt, esc = U.esc;
  const mq = (q) => typeof matchMedia === 'function' && matchMedia(q).matches;
  const wide = () => mq('(min-width: 1100px)');
  const anim = () => (S && S.anim !== undefined ? S.anim : 1);

  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const IC = {
    book: svg('M4 5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5'),
    chart: svg('M4 20h16M7 16v-5M12 16V6M17 16v-8'),
    pause: svg('M9 5v14M15 5v14'),
    play: svg('M8 5l11 7-11 7z'),
    exit: svg('M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5'),
    bulb: svg('M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z'),
    grid: svg('M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16'),
    eye: svg('M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'),
    cards: svg('M5 6h9a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM15 5l1-2 5 1.4-3.4 13.3'),
  };
  const navBtn = (cmd, icon, label) => `<button class="btn btn-ghost btn-sm" data-cmd="${cmd}" title="${label}" aria-label="${label}">${icon}<span class="lbl">${label}</span></button>`;

  const skeleton = () => `
<div class="game m-${S.mode}">
  <header class="g-head">
    <div class="titlebox">
      <div class="brand"><span class="logo">♠</span>Тренажёр покера</div>
      <div class="g-meta"><span class="mode-badge">${MODE_RU[S.mode]}</span><button class="pin-chip hidden" data-cmd="unpin" title="Открепить позицию"></button><span class="hinfo"></span></div>
    </div>
    <nav class="g-nav">${navBtn('teacher', '<span class="emo" aria-hidden="true">👨‍🏫</span>', 'Учитель')}${navBtn('cheat', IC.book, 'Шпаргалка')}${navBtn('stats', IC.chart, 'Статистика')}${navBtn('pause', IC.pause, 'Пауза')}${navBtn('menu', IC.exit, 'Меню')}</nav>
  </header>
  <div class="g-body">
    <main class="g-main">
      <div class="tzone"><div class="ptable">
        <div class="rail"><div class="felt"><div class="felt-print">♠ Тренажёр покера ♠</div></div></div>
        <div class="center"><div class="pots"></div><div class="board">${'<div class="slot"></div>'.repeat(5)}</div><div class="caption"></div></div>
        <div class="bets"></div>
        <div class="dealer" title="Дилер (баттон)">D</div>
        <div class="seats"></div>
        <div class="look hidden" role="dialog" aria-label="Куда смотреть">
          <div class="look-t"></div>
          <div class="look-b">
            <button class="btn" data-look="board">${IC.cards}Смотреть на борд</button>
            <button class="btn" data-look="players">${IC.eye}Смотреть на соперников</button>
          </div>
          <div class="look-bar"><i></i></div>
        </div>
        <div class="pop hidden"></div>
        <div class="veil hidden"><span>Пауза</span></div>
      </div></div>
      <div class="dock idle"><div class="dock-in">
        <div class="d-aux">
          <button class="btn btn-sm d-hint" data-cmd="hint" title="Подсказка">${IC.bulb}<span class="lbl">Подсказка</span></button>
          <button class="btn btn-sm d-range" data-cmd="range" title="Посмотреть диапазон">${IC.grid}<span class="lbl">Посмотреть диапазон</span></button>
          <div class="d-msg"></div>
        </div>
        <div class="quick">${QUICK.map((l, k) => `<button class="btn btn-sm" data-q="${k}" aria-pressed="false">${l}</button>`).join('')}</div>
        <div class="slide"><input type="range" class="amt-r" aria-label="Размер ставки"><input type="number" class="amt-n" inputmode="numeric" aria-label="Сумма ставки"></div>
        <div class="d-main">
          <button class="btn act act-fold" data-act="fold"><span>Сброс</span><kbd>F</kbd></button>
          <button class="btn act act-call" data-act="call"><span>Чек</span><kbd>C</kbd></button>
          <button class="btn btn-primary act act-raise" data-act="raise"><span>Рейз</span><kbd>R</kbd></button>
        </div>
        <div class="d-next"><button class="btn btn-primary act" data-cmd="next">Следующая раздача</button></div>
        <div class="d-skip hidden"><button class="btn btn-primary act" data-cmd="skip">⏩ К следующей раздаче</button></div>
      </div></div>
    </main>
    <aside class="side" data-tab="coach">
      <div class="side-tabs">
        <button class="tab" data-tab="coach">Тренер<i class="dot"></i></button>
        <button class="tab" data-tab="log">Журнал</button>
        <span class="peek" data-tab="coach"></span>
        <button class="tab-x" data-cmd="sheet" aria-label="Развернуть или свернуть">▴</button>
      </div>
      <section class="coach">
        <div class="sec-h"><h3>Тренер</h3><span class="sec-sub"></span></div>
        <div class="coach-feed" data-empty=""></div>
        <div class="coach-foot"></div>
      </section>
      <section class="log">
        <button class="sec-h log-h" data-cmd="logtoggle"><h3>Журнал раздачи</h3><span class="chev">▾</span></button>
        <div class="log-body"></div>
      </section>
    </aside>
  </div>
  <div class="tip hidden"></div>
</div>`;

  // ---------- mount ----------
  function mount(session, handlers) {
    S = session; H = handlers || {};
    act = null; nextRes = null; popSeat = null; shownBoard = 0; boardBase = 0;
    const app = document.getElementById('app');
    app.innerHTML = skeleton();
    root = app.querySelector('.game');
    tableEl = $('.ptable'); feed = $('.coach-feed'); logBody = $('.log-body'); side = $('.side'); dock = $('.dock');
    $('.coach-feed').dataset.empty = {
      learn: 'Тренер спросит и подскажет на каждом решении.',
      practice: 'Вопросы — выборочно, объяснения — при ошибке.',
      tournament: 'Подсказок нет. Ошибки — после раздачи.',
    }[S.mode];
    if (S.mode === 'tournament' && S.st && S.st.tournamentReview === 'end') $('.coach-feed').dataset.empty = 'Подсказок нет. Ошибки — в конце турнира.';
    $('.sec-sub').textContent = MODE_RU[S.mode];
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    root.addEventListener('mouseover', (e) => { const t = e.target.closest('[data-tip]'); if (t && !tipSticky && !mq('(pointer: coarse)')) showTip(t); });
    root.addEventListener('mouseout', (e) => { if (e.target.closest('[data-tip]') && !tipSticky) hideTip(); });
    $('.coach-feed').addEventListener('scroll', hideTip, { passive: true });
    if (!keysBound) {
      keysBound = true;
      document.addEventListener('keydown', onKey);
      window.addEventListener('resize', () => {
        hidePop(); hideTip();
        if (root && root.isConnected) renderDealer();
        const f = document.activeElement;
        if (f && f.closest && f.closest('.c-q')) f.scrollIntoView({ block: 'nearest' });
      });
    }
    setupSeats();
    render();
  }

  function setupSeats() {
    const n = S.table.players.length;
    tableEl.className = 'ptable n' + n;
    put($('.seats'), ''); put($('.bets'), '');
    seatEls = []; betEls = []; prevBets = [];
    S.table.players.forEach((p, i) => {
      const a = (90 + (i * 360) / n) * Math.PI / 180, x = Math.cos(a), y = Math.sin(a);
      const av = p.avatar || { initials: p.name.slice(0, 2), color: '#4b5d55' };
      const side = x < -0.55 ? ' left' : x > 0.55 ? ' right' : '';
      const seat = View.el(`<div class="seat${i === 0 ? ' me' : ''}${y < -0.35 ? ' top' : ''}${side}" data-seat="${i}" style="--x:${x.toFixed(4)};--y:${y.toFixed(4)}">
        <div class="s-cards"></div>
        <div class="plate"><div class="av" style="--avc:${esc(av.color)}">${esc(av.initials)}</div><div class="s-info"></div><span class="posb"></span></div>
        <div class="s-status"></div><div class="bubble"></div></div>`);
      const bet = View.el(`<div class="bet hidden${i === 0 ? ' me' : ''}${side}" style="--x:${x.toFixed(4)};--y:${y.toFixed(4)}"></div>`);
      $('.seats').appendChild(seat); $('.bets').appendChild(bet);
      seatEls.push(seat); betEls.push(bet); prevBets.push(0);
    });
  }

  // ---------- render ----------
  function render() {
    if (!root || !root.isConnected) return;
    renderHead();
    S.table.players.forEach(renderSeat);
    renderCenter();
    renderBets();
    renderDealer();
    renderDock();
    if (popSeat !== null) showPop(popSeat);
  }

  function renderHead() {
    const t = S.table, h = S.hand;
    const no = h ? `<span class="hno"><i class="k">Раздача </i><b>№${h.no}</b></span>` : '';
    let html = `<span><i class="k">Блайнды </i><b>${fmt(t.sb)}/${fmt(t.bb)}</b></span>`;
    const L = S.mode === 'tournament' && S.levelInfo;
    // Tournament: level and the countdown come before the hand number, so a narrow header cuts the number first.
    if (L) html += `<span><i class="k">Уровень </i><i class="ks">Ур. </i><b>${L.level}</b></span>` +
      (L.left ? `<span title="Блайнды вырастут через ${U.nplural(L.left, 'раздачу', 'раздачи', 'раздач')}">↑ через <b>${L.left}</b><i class="k"> ${U.plural(L.left, 'раздачу', 'раздачи', 'раздач')}</i></span>` : '');
    put($('.hinfo'), L ? html + no : no + html);
    tog(root, 'paused', S.paused);
    const pb = $('[data-cmd="pause"]');
    put(pb, (S.paused ? IC.play : IC.pause) + `<span class="lbl">${S.paused ? 'Продолжить' : 'Пауза'}</span>`);
    pb.title = S.paused ? 'Продолжить' : 'Пауза';
    tog(pb, 'on', S.paused);
    tog($('.veil'), 'hidden', !S.paused);
    const pin = S.mode !== 'tournament' && S.st && S.st.heroPos && S.st.heroPos !== 'any' ? S.st.heroPos : '';
    tog($('.pin-chip'), 'hidden', !pin);
    put($('.pin-chip'), pin ? `📌 ${esc(pin)} <i>✕</i>` : '');
    const tb = $('[data-cmd="teacher"]');
    tog(tb, 'on', !!S.teacher);
    tb.title = S.teacher ? 'Учитель включён — нажми, чтобы выключить' : 'Учитель выключен — нажми, чтобы включить';
    tb.setAttribute('aria-pressed', String(!!S.teacher));
  }

  const SHORT = { rock: 'Камень', station: 'Станция', reg: 'Регуляр', maniac: 'Маньяк', actor: 'Актёр' };
  const styleName = (p) => {
    const st = typeof Bots !== 'undefined' && Bots.STYLES && Bots.STYLES[p.style];
    return st ? st.name : p.style;
  };
  const posTip = (pos) => {
    const info = typeof Ranges !== 'undefined' && Ranges.POS_INFO && Ranges.POS_INFO[pos];
    if (!info) return pos;
    return `${pos} — ${info.group === 'Блайнд' ? 'блайнд' : info.group.toLowerCase() + ' позиция'}\n${info.text}`;
  };

  function seatStatus(p, i) {
    const h = S.hand;
    if (p.busted) return ['out', p.place ? `Выбыл · ${p.place} место` : 'Выбыл'];
    if (!h || !h.dealt[i]) return ['', ''];
    const won = S.payouts && S.payouts[i];
    if (won) return ['won', '+' + fmt(won)];
    if (h.folded[i]) return ['fold', 'Сброс'];
    if (S.turn === i) return i === 0 ? ['myturn', 'Твой ход'] : ['think', 'думает'];
    if (h.allIn[i]) return ['allin', 'Олл-ин'];
    if (S.acts && S.acts[i]) return ['did', S.acts[i]];
    return ['', ''];
  }

  function renderSeat(p, i) {
    const el = seatEls[i], h = S.hand;
    if (!el) return;
    const dealt = !!(h && h.dealt[i]);
    const folded = dealt && h.folded[i];
    tog(el, 'turn', S.turn === i);
    tog(el, 'folded', folded);
    tog(el, 'out', p.busted);
    tog(el, 'away', !p.busted && h && !dealt);
    tog(el, 'win', !!(S.winners && S.winners.includes(i)));
    // cards
    const cardsEl = $('.s-cards', el);
    let cards = '';
    const hole = dealt && h.hole[i];
    if (hole) {
      if (i === 0) cards = hole.map((c) => View.cardHTML(c, { hl: S.hl && S.hl.has(c), dim: folded })).join('');
      else if (!folded && S.reveal && S.reveal.has(i)) cards = hole.map((c) => View.cardHTML(c, { hl: S.hl && S.hl.has(c) })).join('');
      else if (!folded) cards = View.cardHTML(null) + View.cardHTML(null);
    }
    tog(cardsEl, 'show', i !== 0 && !folded && S.reveal && S.reveal.has(i));
    put(cardsEl, cards);
    // name, style badge, stack
    let badge = '';
    if (i !== 0) badge = p.revealed ? `<i class="sty ${esc(p.style)}" title="${esc(styleName(p))}">${SHORT[p.style] || esc(styleName(p))}</i>` : '<i class="sty unk" title="Стиль пока неизвестен">?</i>';
    put($('.s-info', el), `<div class="s-name"><span class="nm">${esc(p.name)}</span>${badge}</div><div class="s-stack">${fmt(p.stack)}</div>${p.revealed && i ? `<div class="s-sty">${badge}</div>` : ''}`);
    // position badge with tooltip
    const pos = dealt ? h.pos[i] : '';
    const pb = $('.posb', el);
    put(pb, pos || '');
    if (pos) pb.dataset.tip = posTip(pos); else delete pb.dataset.tip;
    // status
    const [cls, text] = seatStatus(p, i);
    const st = $('.s-status', el);
    st.className = 's-status ' + cls;
    put(st, esc(text));
  }

  function sidePots(h) {
    // Display-only split of committed chips into main/side pots by all-in levels.
    const seats = h.seats || h.committed.map((_, i) => i);
    const raw = (s) => h.committed[s] - (h.returned ? h.returned[s] : 0);
    // Chips above the second-largest contribution are uncalled (Engine returns them): never a «Побочный».
    const cap = h.committed.map((_, s) => raw(s)).sort((a, b) => b - a)[1] || 0;
    const paid = (s) => Math.min(raw(s), cap);
    const levels = [...new Set(seats.filter((s) => h.allIn[s] && !h.folded[s]).map(paid))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    for (const L of levels) {
      const amt = U.sum(seats.map((s) => Math.max(0, Math.min(paid(s), L) - prev)));
      if (amt > 0) pots.push(amt);
      prev = L;
    }
    const rest = U.sum(seats.map((s) => Math.max(0, paid(s) - prev)));
    if (rest > 0) pots.push(rest);
    return pots;
  }

  function renderCenter() {
    const h = S.hand;
    let potHTML = '';
    if (h && !S.paid) {
      const total = typeof Engine !== 'undefined' && Engine.pot ? Engine.pot(h) : U.sum(h.committed || []);
      if (total) {
        potHTML = `<span class="pot"><i class="chip gold"></i>Банк <b>${fmt(total)}</b></span>`;
        const pots = h.result ? h.result.pots.map((p) => p.amount) : sidePots(h);
        if (pots.length > 1) potHTML += pots.map((a, k) => `<span class="pot sp">${k ? 'Побочный' + (pots.length > 2 ? ' ' + k : '') : 'Основной'} <b>${fmt(a)}</b></span>`).join('');
      }
    }
    put($('.pots'), potHTML);
    // board: revealed cards face up (the newest flip in), dealt-but-hidden as backs, the rest empty slots.
    // Slots persist and the highlight is toggled in place, so a flip animation is never replayed or cut short.
    const shown = h ? Math.min(S.boardShown || 0, h.board.length) : 0;
    if (shown !== shownBoard) { boardBase = shown > shownBoard ? shownBoard : shown; shownBoard = shown; }
    $$('.board .slot').forEach((slot, k) => {
      const face = k < shown;
      let html = View.cardHTML(face ? h.board[k] : h && k < h.board.length ? null : -1);
      if (face && k >= boardBase) html = html.replace('class="pcard', `style="--i:${k - boardBase}" class="pcard flip`);
      put(slot, html);
      if (face) tog(slot.firstElementChild, 'hl', S.hl && S.hl.has(h.board[k]));
    });
    const cap = $('.caption');
    put(cap, S.caption ? View.suitText(S.caption) : '');
    tog(cap, 'win', !!S.winners);
  }

  function renderBets() {
    const h = S.hand;
    betEls.forEach((el, i) => {
      const b = h && h.dealt[i] && !S.collecting ? h.bets[i] || 0 : 0;
      tog(el, 'hidden', !b);
      put(el, b ? `<i class="chip"></i><span>${fmt(b)}</span>` : '');
      if (b > prevBets[i]) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      prevBets[i] = b;
    });
  }

  function renderDealer() {
    const d = $('.dealer'), h = S.hand, n = S.table.players.length;
    const btn = h ? h.button : S.table.button;
    if (btn === undefined || btn === null) return d.classList.add('hidden');
    d.classList.remove('hidden');
    const a = (90 + (btn * 360) / n) * Math.PI / 180;
    d.style.setProperty('--x', Math.cos(a).toFixed(4));
    d.style.setProperty('--y', Math.sin(a).toFixed(4));
    // The hero's seat is pinned to the bottom edge, off the oval: put the disc just left of the hero's plate.
    const plate = btn === 0 && seatEls[0] && $('.plate', seatEls[0]);
    if (plate && plate.offsetWidth) {
      const pr = plate.getBoundingClientRect(), tr = tableEl.getBoundingClientRect();
      d.style.left = (pr.left - tr.left - d.offsetWidth / 2 - 6).toFixed(1) + 'px';
      d.style.top = (pr.top - tr.top + pr.height / 2).toFixed(1) + 'px';
    } else { d.style.left = ''; d.style.top = ''; }
  }

  // ---------- action dock ----------
  const raiseLabel = (L, to) => (to >= L.maxTo ? `Олл-ин ${fmt(L.maxTo)}` : `${L.isBet ? 'Ставка' : 'Рейз до'} ${fmt(to)}`);

  function renderDock() {
    if (!dock) return;
    const L = act && act.legal, off = !L || S.paused; // paused: the dock is inert
    tog(dock, 'idle', !L);
    tog(dock, 'next', !!nextRes);
    const [fold, call, raise] = $$('.d-main .btn', dock);
    fold.disabled = off; call.disabled = off;
    raise.disabled = off || !L.canRaise;
    $$('.quick .btn, .slide input', dock).forEach((b) => { b.disabled = off || !L.canRaise; });
    $('.d-next .btn', dock).disabled = !!S.paused;
    put($('span', fold), act && act.foldArmed ? 'Точно сбросить?' : 'Сброс');
    put($('span', call), !L ? 'Колл' : L.canCheck ? 'Чек' : L.toCall >= L.stack ? `Олл-ин ${fmt(L.toCall)}` : `Колл ${fmt(L.toCall)}`);
    put($('span', raise), !L ? 'Рейз' : L.canRaise ? raiseLabel(L, amount()) : 'Рейз');
    $('.d-hint', dock).disabled = !(S.hint && S.mode === 'learn');
    $('.d-range', dock).disabled = false; // ranges are reference material: always available
    const skip = !L && !nextRes && typeof Game !== 'undefined' && Game.state && !!(Game.state() || {}).canSkip;
    const g = !!(L && S.teacher && adv);
    tog(fold, 'adv', g && adv === 'fold');
    tog(call, 'adv', g && (adv === 'check' || adv === 'call'));
    tog(raise, 'adv', g && (adv === 'bet' || adv === 'raise'));
    tog($('.d-next', dock), 'hidden', !nextRes);
    tog($('.d-skip', dock), 'hidden', !skip);
    tog($('.d-main', dock), 'hidden', !!nextRes || skip);
    put($('.d-msg', dock), dockMsg());
  }

  function dockMsg() {
    if (S.paused) return 'Пауза — нажми «Продолжить».';
    if (act && act.foldArmed) return 'Чек бесплатный. Нажми «Сброс» ещё раз, если всё же хочешь сбросить.';
    if (nextRes) return 'Раздача окончена.';
    if (act) return 'Твой ход.';
    if (S.asking) return 'Ответь на вопрос тренера.';
    if (S.turn !== null && S.turn !== undefined && S.turn !== 0) return `Ходит <b>${esc(S.table.players[S.turn].name)}</b>…`;
    return '';
  }

  function amount() {
    const L = act && act.legal;
    if (!L) return 0;
    const v = Math.round(parseFloat(String($('.amt-n', dock).value).replace(',', '.')));
    return U.clamp(isFinite(v) ? v : L.minTo, L.minTo, L.maxTo);
  }
  function setAmount(v) {
    const L = act && act.legal;
    if (!L) return;
    v = U.clamp(Math.round(v), L.minTo, L.maxTo);
    const r = $('.amt-r', dock), n = $('.amt-n', dock);
    r.min = n.min = L.minTo; r.max = n.max = L.maxTo; r.step = 1; // the slider snaps through nice() in onInput
    r.value = n.value = v;
    put($('.act-raise span', dock), raiseLabel(L, v));
    const on = act.sizes ? act.sizes.map((s) => s[1]).lastIndexOf(v) : -1; // sizes that collapse to one amount light one button
    $$('.quick .btn', dock).forEach((b, k) => b.setAttribute('aria-pressed', String(k === on)));
  }

  // ---------- bet sizing: chip-friendly amounts, beginner-standard preflop sizes ----------
  // Snap to ½ BB below 10 BB, 1 BB below 50 BB, 2½ BB above; within [minTo, maxTo]; near all-in → exact all-in.
  function nice(v, L, bb) {
    const st = v < 10 * bb ? bb / 2 : v < 50 * bb ? bb : 2.5 * bb;
    let r = Math.round(v / st) * st;
    if (L.maxTo - r < st) r = L.maxTo;
    return U.clamp(r, L.minTo, L.maxTo);
  }
  // Players who just called the big blind preflop (the hero excluded).
  const limpers = (h) => h.seats.filter((s) => s !== 0 && s !== h.bbSeat && !h.folded[s] && h.bets[s] >= h.bb).length;
  // [[label, raise-to] × 5]: preflop in big blinds (+1 BB per limper) or multiples of the raise; postflop pot fractions.
  function quickSizes(h, L) {
    const bb = h.bb, potTo = (f) => nice(Engine.sizeTo(h, f), L, bb), tail = [['Банк', potTo(1)], ['Олл-ин', L.maxTo]];
    if (h.street !== 'preflop') return [['⅓', potTo(1 / 3)], ['½', potTo(0.5)], ['⅔', potTo(2 / 3)], ...tail];
    const lim = limpers(h);
    if (!h.raises) return [2.5, 3, 4].map((k) => [`${U.dec(k)} BB`, nice((k + lim) * bb, L, bb)]).concat(tail);
    // 3-bet ×3 in position / ×4 out of it (×2,5 small); 4-bet+ ×2,2–2,5 (×3 big)
    return (h.raises > 1 ? [2.2, 2.5, 3] : [2.5, 3, 4]).map((k) => [`×${U.dec(k)}`, nice(k * L.currentBet, L, bb)]).concat(tail);
  }
  // Default raise-to: open 3 BB + 1 BB per limper; ×3 against a raise or a postflop bet (×2,5 as a 4-bet); ⅔ pot as a postflop bet.
  function defaultRaise(h, L) {
    if (h.street === 'preflop') return h.raises ? nice((h.raises > 1 ? 2.5 : 3) * L.currentBet, L, h.bb) : nice((3 + limpers(h)) * h.bb, L, h.bb);
    return L.currentBet ? nice(3 * L.currentBet, L, h.bb) : nice(Engine.sizeTo(h, 2 / 3), L, h.bb);
  }

  // Runs fn once the game is not paused (autoplay must not act through the Pause veil either).
  const whenRunning = (fn) => (S && S.paused ? setTimeout(() => whenRunning(fn), 100) : fn());

  function askAction(legal, auto) {
    return new Promise((resolve) => {
      // phones: the player decides looking at the table, not at the coach sheet; the dot says the last verdict waits there
      if (!wide() && side.classList.contains('open')) { closeSheet(); $('.tab[data-tab="coach"]').classList.add('new'); }
      act = { legal, resolve, sizes: legal.canRaise ? quickSizes(S.hand, legal) : null };
      if (act.sizes) {
        $$('.quick .btn', dock).forEach((b, k) => put(b, esc(act.sizes[k][0])));
        setAmount(defaultRaise(S.hand, legal));
      } else $$('.quick .btn', dock).forEach((b) => b.setAttribute('aria-pressed', 'false'));
      renderDock();
      if (auto) setTimeout(() => whenRunning(() => {
        if (!act || act.resolve !== resolve) return;
        if (auto.type === 'raise') setAmount(auto.to);
        doAct(auto.type === 'check' ? 'call' : auto.type);
      }), 0);
    });
  }

  function doAct(type) {
    if (!act || S.paused) return;
    const L = act.legal;
    let a;
    // A free check is never folded by a single slip (learn and practice): the first press asks to confirm.
    if (type === 'fold' && L.canCheck && S.mode !== 'tournament' && !act.foldArmed) {
      const cur = act;
      cur.foldArmed = true;
      setTimeout(() => { if (act === cur) { cur.foldArmed = false; renderDock(); } }, 2500);
      return renderDock();
    }
    if (type === 'fold') a = { type: 'fold' };
    else if (type === 'call') a = { type: L.canCheck ? 'check' : 'call' };
    else if (type === 'raise' && L.canRaise) a = { type: 'raise', to: amount() };
    else return;
    const r = act.resolve;
    act = null; adv = null;
    renderDock();
    r(a);
  }

  function quick(k) {
    if (!act || !act.sizes || S.paused) return;
    setAmount(act.sizes[+k][1]);
  }

  // One «next» control: the dock button (the coach column no longer repeats it).
  function waitNext(auto, label = 'Следующая раздача') {
    return new Promise((resolve) => {
      nextRes = resolve;
      put($('.d-next .btn', dock), esc(label));
      renderDock();
      if (auto) setTimeout(() => whenRunning(() => { if (nextRes === resolve) resolveNext(); }), 0);
    });
  }
  function resolveNext() {
    if (!nextRes || S.paused) return;
    const r = nextRes;
    nextRes = null;
    renderDock();
    r();
  }

  // ---------- events ----------
  function onClick(e) {
    const t = e.target;
    const tipEl = t.closest('[data-tip]');
    if (tipEl && tipEl.closest('.seat.me')) { stickyTip(tipEl); e.stopPropagation(); return; }
    if (tipEl) { if (tipFor === tipEl) hideTip(); else showTip(tipEl); e.stopPropagation(); return; }
    hideTip();
    const a = t.closest('[data-act]');
    if (a) return doAct(a.dataset.act);
    const qk = t.closest('[data-q]');
    if (qk) return quick(qk.dataset.q);
    const cmd = t.closest('[data-cmd]');
    if (cmd) return command(cmd.dataset.cmd, cmd);
    const tab = t.closest('.side-tabs [data-tab]');
    if (tab) return tabClick(tab.dataset.tab);
    const seat = t.closest('.seat');
    if (seat && seat.dataset.seat === '0' && t.closest('.plate')) { const pb = $('.posb', seat); if (pb.dataset.tip) stickyTip(pb); return; }
    if (seat && seat.dataset.seat !== '0') return popSeat === +seat.dataset.seat ? hidePop() : showPop(+seat.dataset.seat);
    if (!t.closest('.pop')) hidePop();
  }

  function command(cmd, el) {
    if (cmd === 'next') return resolveNext();
    if (cmd === 'sheet') return side.classList.contains('open') ? closeSheet() : openSheet(side.dataset.tab);
    if (cmd === 'logtoggle') return $('.log').classList.toggle('closed');
    if (cmd === 'reveal') { const s = +el.dataset.seat; if (H.reveal) H.reveal(s); return render(); }
    const G = typeof Game !== 'undefined' ? Game : {};
    if (cmd === 'teacher') return G.setTeacher && G.setTeacher(!S.teacher);
    if (cmd === 'unpin') return G.lockPos && G.lockPos(null);
    if (cmd === 'lockpos') return G.lockPos && G.lockPos(el.dataset.pos);
    if (cmd === 'skip' && !H.skip) return G.skipHand && G.skipHand();
    if (cmd === 'range' && !H.range) return G.openRanges && G.openRanges();
    if (H[cmd]) H[cmd]();
  }

  function onInput(e) {
    const t = e.target;
    if (t.classList.contains('amt-r')) { if (act) setAmount(nice(+t.value, act.legal, S.hand.bb)); }
    else if (t.classList.contains('amt-n') && e.type === 'change') setAmount(amount());
    else if (t.classList.contains('amt-n')) {
      const L = act && act.legal, v = Math.round(+t.value);
      if (L && isFinite(v)) { $('.amt-r', dock).value = v; put($('.act-raise span', dock), raiseLabel(L, U.clamp(v, L.minTo, L.maxTo))); }
    }
  }

  function onKey(e) {
    if (!root || !root.isConnected || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.modal-back')) return;
    if (e.key === 'Escape') { hidePop(); hideTip(); return; }
    const tag = e.target && e.target.tagName;
    const inField = (tag === 'INPUT' && e.target.type !== 'range') || tag === 'TEXTAREA' || tag === 'SELECT'; // the bet slider keeps F/C/R
    if (e.key === 'Enter') {
      if (e.target.classList && e.target.classList.contains('amt-n')) { e.preventDefault(); setAmount(amount()); doAct('raise'); return; }
      if (e.target.classList && e.target.classList.contains('amt-r')) { e.preventDefault(); doAct('raise'); return; }
      if (inField || (tag === 'BUTTON' && !e.target.disabled)) return; // a focused button handles Enter itself
      if (nextRes) { e.preventDefault(); resolveNext(); }
      return;
    }
    if (inField || !act) return;
    const map = { KeyF: 'fold', KeyC: 'call', KeyR: 'raise' };
    if (map[e.code]) { e.preventDefault(); doAct(map[e.code]); }
  }

  // ---------- coach sheet (mobile) / column (desktop) ----------
  function openSheet(tab) {
    side.dataset.tab = tab || 'coach';
    side.classList.add('open');
    if (side.dataset.tab === 'coach') $('.tab[data-tab="coach"]').classList.remove('new');
    put($('.tab-x'), '▴');
  }
  // Phones: a pending question keeps the sheet open (the answer box must stay in view).
  function closeSheet() { if (!wide() && feed.querySelector('.c-q')) return; side.classList.remove('open'); }
  function tabClick(tab) {
    if (side.classList.contains('open') && side.dataset.tab === tab) closeSheet();
    else openSheet(tab);
  }
  function flagNew(peek) {
    const open = wide() || (side.classList.contains('open') && side.dataset.tab === 'coach');
    if (!open) $('.tab[data-tab="coach"]').classList.add('new');
    if (peek) put($('.peek'), peek);
  }

  function coachClear() {
    feed.innerHTML = '';
    adv = null;
    if (!wide()) closeSheet();
    put($('.coach-foot'), '');
    put($('.peek'), '');
    $('.tab[data-tab="coach"]').classList.remove('new');
  }
  function coachAdd(html, cls = '', peek = '') {
    const el = View.el(`<div class="c-item c-new ${cls}">${html}</div>`);
    feed.appendChild(el);
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      const top = el.offsetTop - feed.offsetTop - 8, prev = el.previousElementSibling;
      let y = top;
      // a question right after a correction: keep the correction in view above it when both fit
      if (el.classList.contains('c-q') && prev && prev.classList.contains('c-fb')) {
        y = Math.min(top, Math.max(prev.offsetTop - feed.offsetTop - 8, top + el.offsetHeight + 16 - feed.clientHeight));
      }
      feed.scrollTop = Math.max(0, y);
    });
    flagNew(peek);
    return el;
  }
  // Narrow screens: a learn-mode mistake opens the sheet (the game waits while it is open — see held), so it is read, not missed.
  function coachFb(fb) {
    const el = coachAdd(View.feedbackHTML(fb), 'c-fb', `<span class="v-${fb.verdict || 'info'}">${View.suitText(fb.title || '')}</span>`);
    if (S.mode === 'learn' && fb.verdict === 'mistake' && !wide()) openSheet('coach');
    return el;
  }
  // Teacher card (advice = { best, size?, title, lines, more? }): brass card + the best action glows in the dock.
  function showAdvice(a) {
    if (!a) return null;
    adv = a.best;
    const el = coachAdd(View.feedbackHTML({ ...a, verdict: 'teach' }), 'c-fb c-adv', `<span class="v-teach">${View.suitText(a.title || '')}</span>`);
    renderDock();
    return el;
  }
  function review(items) {
    coachAdd('<div class="c-sep">Разбор раздачи</div>' + items.map(View.feedbackHTML).join(''), 'c-review', 'Разбор раздачи готов');
    if (!wide()) openSheet('coach');
  }
  // The coach sheet covers the table on narrow screens: while it is open the game holds (Game.wait), like Pause.
  const held = () => !!side && side.classList.contains('open') && !wide();
  function holding(on) { tog(side, 'hold', on); }

  // q = { id, type: 'number'|'choice', prompt, unit, options, info, hint }; ctx = { n, of, hole, board, sub }
  function askQuestion(q, ctx, auto) {
    return new Promise((resolve) => {
      const opts = (q.options || []).map((o) => (o && typeof o === 'object' ? o : { v: o, label: String(o) }));
      const short = (ctx && ctx.short) || (q.info && q.info.short); // short all-in call: only part of the pot can be won
      const info = q.info ? [[short ? 'Банк, который ты можешь выиграть' : 'Банк со ставкой', q.info.pot], ['Ставка соперника', q.info.bet], ['Тебе доплатить', q.info.toCall]]
        .filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `<span>${k}: <b>${fmt(v)}</b></span>`).join('') : '';
      const hand = ctx && ctx.hole ? `<div class="c-q-hand"><span>Твои карты ${View.cardsHTML(ctx.hole)}</span>${ctx.board && ctx.board.length ? `<span>Борд ${View.cardsHTML(ctx.board)}</span>` : ''}</div>` : '';
      const body = q.type === 'choice'
        ? `<div class="opts">${opts.map((o, k) => `<button class="btn btn-sm" type="button" data-o="${k}">${View.suitText(o.label)}</button>`).join('')}</div>`
        : `<form autocomplete="off"><input type="text" inputmode="decimal" aria-label="${esc(q.prompt)}"><span class="unit">${esc(q.unit || '')}</span><button class="btn btn-primary btn-sm">Ответить</button></form>`;
      const num = ctx && ctx.of > 1 ? `<div class="c-q-n">Вопрос ${ctx.n} из ${ctx.of}</div>` : ctx && ctx.sub ? `<div class="c-q-n">${esc(ctx.sub)}</div>` : '';
      const el = coachAdd(`${num}<div class="c-q-p">${View.suitText(q.prompt)}</div>${hand}${info ? `<div class="c-q-info">${info}</div>` : ''}${body}` +
        (S.mode === 'learn' && q.hint ? `<button class="btn btn-ghost btn-sm qhint" type="button" data-cmd="hint">${IC.bulb}Подсказка</button>` : ''), 'c-q', View.suitText(q.prompt));
      openSheet('coach');
      const input = $('input', el);
      const done = (value, label) => {
        if (S.paused) return; // Pause means paused: answers wait too
        el.className = 'c-item c-ans';
        el.innerHTML = `${View.suitText(q.prompt)} — <b>${View.suitText(label)}</b>`;
        resolve(value);
      };
      const form = $('form', el);
      if (form) form.addEventListener('submit', (e) => {
        e.preventDefault();
        const raw = input.value.trim().replace(',', '.').replace('%', '');
        const v = parseFloat(raw);
        if (S.paused) return;
        if (!raw || !isFinite(v)) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); input.focus(); return; }
        const shown = input.value.trim().replace(/\s*%$/, '');
        done(v, shown + (q.unit === '%' ? '%' : q.unit ? ' ' + q.unit : ''));
      });
      $$('[data-o]', el).forEach((b) => b.addEventListener('click', () => { const o = opts[+b.dataset.o]; done(o.v, o.label); }));
      if (input && !mq('(pointer: coarse)')) setTimeout(() => input.focus({ preventScroll: true }), 30);
      // the on-screen keyboard shrinks the sheet: keep the field in view
      if (input) input.addEventListener('focus', () => setTimeout(() => { if (input.isConnected) input.scrollIntoView({ block: 'nearest' }); }, 300));
      if (auto !== undefined && auto !== null) setTimeout(() => whenRunning(() => {
        if (!el.isConnected || !el.classList.contains('c-q')) return;
        if (form) { input.value = String(auto); form.requestSubmit(); }
        else { const k = opts.findIndex((o) => String(o.v) === String(auto)); ($(`[data-o="${Math.max(0, k)}"]`, el) || {}).click(); }
      }), 0);
    });
  }

  // ---------- log ----------
  function logReset() { logBody.innerHTML = ''; }
  function logStreet(street, cards) {
    logBody.insertAdjacentHTML('beforeend', `<div class="lg-st">${STREET_RU[street] || street}${cards && cards.length ? ' ' + View.suitText('[' + Cards.strList(cards) + ']') : ''}</div>`);
    logBody.scrollTop = logBody.scrollHeight;
  }
  function logLine(text, cls = '') {
    logBody.insertAdjacentHTML('beforeend', `<div class="lg-ln ${cls}">${View.suitText(text)}</div>`);
    logBody.scrollTop = logBody.scrollHeight;
  }

  // ---------- reactions, look overlay ----------
  function bubble(seat, r, ms) {
    const el = seatEls[seat];
    if (!el || !r) return;
    const b = $('.bubble', el);
    clearTimeout(el._bt);
    if (el._anim) el.classList.remove(el._anim);
    b.textContent = r.bubble || r.text || ''; // no styling from r.acting: noise copies must look the same
    b.classList.add('show');
    if (r.anim) { el._anim = 'a-' + r.anim; void el.offsetWidth; el.classList.add(el._anim); }
    el._bt = setTimeout(() => { b.classList.remove('show'); if (el._anim) el.classList.remove(el._anim); el._anim = null; }, Math.max(300, ms));
  }

  function askLook(street, ms, auto) {
    return new Promise((resolve) => {
      if (!wide()) closeSheet(); // the sheet would cover the overlay on small screens
      const el = $('.look'), bar = $('.look-bar i', el);
      put($('.look-t', el), `${STREET_RU[street] || ''}: куда смотришь?`);
      el.classList.remove('hidden');
      let left = ms, done = false, last = U.now();
      const finish = (v) => {
        if (done) return;
        done = true; clearInterval(timer); el.classList.add('hidden'); el.onclick = null;
        resolve(v);
      };
      el.onclick = (e) => { const b = e.target.closest('[data-look]'); if (b && !S.paused) finish(b.dataset.look); };
      const timer = setInterval(() => {
        const t = U.now();
        if (!S.paused) left -= t - last;
        last = t;
        bar.style.transform = `scaleX(${U.clamp(left / ms, 0, 1)})`;
        if (left <= 0 || !el.isConnected) finish('board');
      }, 40);
      bar.style.transform = 'scaleX(1)';
      if (!mq('(pointer: coarse)')) $('[data-look="players"]', el).focus({ preventScroll: true });
      if (auto) setTimeout(() => whenRunning(() => { if (!done) $(`[data-look="${auto}"]`, el).click(); }), 0);
    });
  }

  // ---------- popover (bot info) and tooltip ----------
  function showPop(seat) {
    const p = S.table.players[seat], el = seatEls[seat], pop = $('.pop');
    if (!p || !el) return hidePop();
    popSeat = seat;
    const hud = p.hud || { hands: 0, vpip: 0, pfr: 0 };
    const pc = (x) => (hud.hands ? Math.round((x / hud.hands) * 100) + '%' : '—');
    const st = typeof Bots !== 'undefined' && Bots.STYLES ? Bots.STYLES[p.style] : null;
    const base = p.style === 'actor' && p.baseStyle && Bots.STYLES[p.baseStyle] ? ` Играет как ${Bots.STYLES[p.baseStyle].name.toLowerCase()}, но теллы обманные.` : '';
    let styleHTML;
    if (p.revealed && st) styleHTML = `<p>Стиль: <b class="sty ${esc(p.style)}">${esc(st.name)}</b> — ${esc(st.type || '')}.${esc(base)}</p>${st.desc ? `<p>${esc(st.desc)}</p>` : ''}`;
    else styleHTML = `<p>Стиль пока неизвестен — он откроется после 20 раздач${S.mode === 'learn' ? ' или по кнопке ниже' : ''}. Присматривайся к цифрам.</p>`;
    pop.innerHTML = `<div class="pop-h"><div class="av" style="--avc:${esc(p.avatar ? p.avatar.color : '#4b5d55')}">${esc(p.avatar ? p.avatar.initials : '')}</div><b>${esc(p.name)}</b></div>
      <div class="pop-hud"><div><b>${hud.hands}</b><span>${U.plural(hud.hands, 'раздача', 'раздачи', 'раздач')}</span></div><div><b>${pc(hud.vpip)}</b><span>VPIP</span></div><div><b>${pc(hud.pfr)}</b><span>PFR</span></div></div>
      ${styleHTML}
      <p class="faint">VPIP — как часто добровольно вкладывает фишки до флопа. PFR — как часто рейзит до флопа.</p>
      ${S.mode === 'learn' && !p.revealed ? `<button class="btn btn-sm" data-cmd="reveal" data-seat="${seat}">Подсказать стиль</button>` : ''}`;
    pop.classList.remove('hidden');
    const tr = tableEl.getBoundingClientRect(), r = $('.plate', el).getBoundingClientRect();
    const w = pop.offsetWidth, ph = pop.offsetHeight;
    let x = r.left + r.width / 2 - tr.left - w / 2;
    x = U.clamp(x, 6, tr.width - w - 6);
    let y = r.bottom - tr.top + 8;
    if (y + ph > tr.height - 6) y = r.top - tr.top - ph - 8;
    pop.style.left = x + 'px';
    pop.style.top = Math.max(6, y) + 'px';
  }
  function hidePop() { popSeat = null; if (root) $('.pop').classList.add('hidden'); }

  // sticky: the hero's position badge was clicked — the tip stays and offers to lock that position
  function showTip(el, sticky = false) {
    const tip = $('.tip');
    if (!tip || !el.dataset.tip) return;
    tipFor = el; tipSticky = sticky;
    const [title, ...rest] = el.dataset.tip.split('\n');
    const pos = el.textContent.trim(), locked = S.st && S.st.heroPos === pos;
    const lock = sticky && S.mode !== 'tournament' && pos
      ? (locked ? '<button class="btn btn-sm" data-cmd="unpin">Открепить позицию</button>' : `<button class="btn btn-sm" data-cmd="lockpos" data-pos="${esc(pos)}">📌 Закрепить эту позицию</button>`) : '';
    tip.innerHTML = `<b>${esc(title)}</b>${rest.length ? '<br>' + esc(rest.join(' ')) : ''}${lock}`;
    tog(tip, 'sticky', sticky);
    tip.classList.remove('hidden');
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = U.clamp(r.left + r.width / 2 - w / 2, 8, innerWidth - w - 8) + 'px';
    tip.style.top = (r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8) + 'px';
  }
  function hideTip() { tipFor = null; tipSticky = false; if (root) { const t = $('.tip'); if (t) t.classList.add('hidden'); } }
  function stickyTip(el) { if (tipSticky && tipFor === el) hideTip(); else showTip(el, true); }

  // ---------- animations ----------
  const reduced = () => mq('(prefers-reduced-motion: reduce)');
  function centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  function fly(fromEl, toEl, html, ms, delay = 0) {
    if (!fromEl || !toEl || reduced() || anim() < 0.1 || !tableEl.isConnected) return;
    const base = tableEl.getBoundingClientRect(), a = centerOf(fromEl), b = centerOf(toEl);
    const el = View.el(`<div class="fly">${html}</div>`);
    el.style.left = a.x - base.left + 'px';
    el.style.top = a.y - base.top + 'px';
    tableEl.appendChild(el);
    const k = el.animate([{ transform: 'translate(-50%, -50%)', opacity: 1 }, { transform: `translate(calc(-50% + ${b.x - a.x}px), calc(-50% + ${b.y - a.y}px))`, opacity: 0.9 }],
      { duration: ms, delay, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'both' });
    k.onfinish = () => el.remove();
    setTimeout(() => el.remove(), ms + delay + 200);
  }

  // bets slide into the pot
  function collect(ms) {
    const pot = $('.pots .pot') || $('.board');
    betEls.forEach((b) => { if (!b.classList.contains('hidden')) fly($('.chip', b), pot, '<i class="chip"></i>', ms); });
    S.collecting = true;
    renderBets();
    S.collecting = false;
  }
  // pot slides to the winners
  function payout(winners, ms) {
    const from = $('.pots .pot') || $('.board');
    winners.forEach((s, k) => { for (let j = 0; j < 3; j++) fly(from, $('.av', seatEls[s]), '<i class="chip gold"></i>', ms, k * 120 + j * 70); });
  }
  // cards fly from the centre to the seats, clockwise from the small blind
  function deal(order, ms) {
    if (reduced() || anim() < 0.1) return;
    const c = centerOf($('.board'));
    order.forEach((seat, k) => {
      $$('.s-cards .pcard', seatEls[seat]).forEach((card, j) => {
        const p = centerOf(card);
        card.animate([{ transform: `translate(${c.x - p.x}px, ${c.y - p.y}px) scale(.5)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
          { duration: ms, delay: (j * order.length + k) * ms * 0.22, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' });
      });
    });
  }

  return {
    mount, render, askAction, waitNext, askQuestion, askLook, coachClear, coachAdd, coachFb, showAdvice, review,
    logReset, logStreet, logLine, bubble, collect, payout, deal, openSheet, closeSheet, setAmount, holding,
    sidePots, nice, quickSizes, defaultRaise,
    get acting() { return !!act; }, get waitingNext() { return !!nextRes; }, get held() { return held(); },
  };
})();
