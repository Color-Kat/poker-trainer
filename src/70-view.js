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

  // Feedback block: fb = {verdict:'correct'|'acceptable'|'mistake'|'info', title, lines:[...]}
  function feedbackHTML(fb) {
    const lines = (fb.lines || []).map((l) => `<div class="fb-line">${suitText(l)}</div>`).join('');
    return `<div class="fb ${fb.verdict || 'info'}"><div class="fb-title v-${fb.verdict || 'info'}">${suitText(fb.title || '')}</div>${lines}</div>`;
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

  return { cardHTML, cardsHTML, suitText, feedbackHTML, el, modal, toast, clearToasts };
})();
