// ===== View: tiny shared DOM helpers (cards, suit-coloured text, modal, toast) =====
// Used by UI (table) and Screens. Pure string builders are DOM-free; DOM functions touch
// `document` only when called.
const View = (() => {
  // '<div class="pcard red"><span class="pc-r">A</span><span class="pc-s">♥</span></div>'
  // opts: {size:'sm'|'xs', hl:bool, dim:bool, corner:bool (adds corner index)}
  function cardHTML(c, opts = {}) {
    const cls = ['pcard'];
    if (opts.size) cls.push(opts.size);
    if (opts.hl) cls.push('hl');
    if (opts.dim) cls.push('dim');
    if (c === null || c === undefined) return `<div class="${cls.join(' ')} back" aria-label="карта рубашкой"></div>`;
    if (c === -1) return `<div class="${cls.join(' ')} empty"></div>`;
    if (Cards.isRed(c)) cls.push('red');
    const r = Cards.rankLabel(Cards.rank(c)), s = Cards.SUIT_SYMBOLS[Cards.suit(c)];
    return `<div class="${cls.join(' ')}" data-c="${c}" aria-label="${r}${s}"><span class="pc-r">${r}</span><span class="pc-s">${s}</span></div>`;
  }
  const cardsHTML = (cards, opts = {}) => `<span class="cards-row">${cards.map((c) => cardHTML(c, opts)).join('')}</span>`;

  // Escape plain text and colour suit symbols: 'A♥ K♥' → 'A<span class="s-red">♥</span> …'
  const suitText = (text) => U.esc(text).replace(/[♥♦]/g, '<span class="s-red">$&</span>');

  // 13×13 range grid from Ranges.grid(key, ctx); hl = the hero's hand code, outlined.
  const RG_LEGEND = { raise: 'Рейз', in: 'Играть', call: 'Колл', border: 'Граница', out: 'Сброс' };
  function gridCells(key, ctx) {
    const g = Ranges.grid(key, ctx).flat();
    // ponytail: Ranges.grid knows no 'limped:POS' yet — fall back to the position's open range (= raise over limpers)
    if (String(key).startsWith('limped:') && g.every((c) => c.cls === 'out')) {
      return Ranges.grid(key.slice(7), ctx).flat().map((c) => ({ code: c.code, cls: c.cls === 'in' ? 'raise' : c.cls }));
    }
    return g;
  }
  function rangeGridHTML(key, hl, ctx) {
    let cells;
    try { cells = gridCells(key, ctx); } catch (e) { return ''; }
    const used = Object.keys(RG_LEGEND).filter((k) => cells.some((c) => c.cls === k));
    return `<div class="rg"><div class="rg-g" role="img" aria-label="Сетка рук${hl ? ', твоя рука ' + U.esc(hl) : ''}">${cells.map((c) =>
      `<span class="rg-${U.esc(c.cls)}${c.code === hl ? ' rg-hl' : ''}">${U.esc(c.code)}</span>`).join('')}</div>
      <div class="rg-leg">${used.map((k) => `<span><i class="rg-${k}"></i>${RG_LEGEND[k]}</span>`).join('')}${hl ? '<span><i class="rg-hl"></i>Твоя рука</span>' : ''}</div></div>`;
  }

  // Feedback block: fb = {verdict:'correct'|'acceptable'|'mistake'|'info'|'teach', title, lines:[...], more?:[...], grid?:{key, hl}}
  // lines are always shown; the grid under them; `more` collapsed under «Подробнее».
  function feedbackHTML(fb) {
    const v = fb.verdict || 'info', row = (l) => `<div class="fb-line">${suitText(l)}</div>`;
    const grid = fb.grid && fb.grid.key ? rangeGridHTML(fb.grid.key, fb.grid.hl) : '';
    const more = fb.more && fb.more.length ? `<details class="fb-more"><summary>Подробнее</summary>${fb.more.map(row).join('')}</details>` : '';
    return `<div class="fb ${v}"><div class="fb-title v-${v}">${suitText(fb.title || '')}</div>${(fb.lines || []).map(row).join('')}${grid}${more}</div>`;
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // modal(title, bodyHTML, {buttons:[{label, value, cls}], wide:bool, onOpen(root)}) → Promise<value|null>
  function modal(title, bodyHTML, opts = {}) {
    return new Promise((resolve) => {
      const buttons = opts.buttons || [{ label: 'Закрыть', value: null, cls: 'btn-primary' }];
      const back = el(`<div class="modal-back" role="dialog" aria-modal="true" aria-label="${U.esc(title)}">
        <div class="modal"${opts.wide ? ' style="width:min(980px,100%)"' : ''}>
          <div class="modal-head"><h2>${U.esc(title)}</h2><button class="btn btn-ghost btn-sm" data-x aria-label="Закрыть">✕</button></div>
          <div class="modal-body">${bodyHTML}</div>
          <div class="modal-foot">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${U.esc(b.label)}</button>`).join('')}</div>
        </div></div>`);
      const close = (v) => { document.removeEventListener('keydown', onKey); back.remove(); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      back.addEventListener('click', (e) => {
        if (e.target === back || e.target.closest('[data-x]')) return close(null);
        const b = e.target.closest('[data-i]');
        if (b && b.parentElement.classList.contains('modal-foot')) close(buttons[+b.dataset.i].value);
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(back);
      if (opts.onOpen) opts.onOpen(back.querySelector('.modal-body'));
      const first = back.querySelector('.modal-foot .btn');
      if (first) first.focus({ preventScroll: true });
    });
  }

  function toast(text, ms = 3000) {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) { wrap = el('<div class="toast-wrap" aria-live="polite"></div>'); document.body.appendChild(wrap); }
    const t = el(`<div class="toast">${suitText(text)}</div>`);
    wrap.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  function clearToasts() {
    if (typeof document !== 'undefined') document.querySelectorAll('.toast-wrap .toast').forEach((t) => t.remove());
  }

  return { cardHTML, cardsHTML, suitText, feedbackHTML, rangeGridHTML, el, modal, toast, clearToasts };
})();
