// ===== Cards: card ints, parsing/formatting, 169 hand codes, range notation =====
// card = (rank - 2) * 4 + suit; rank 2..14 (14 = A); suit 0..3 = s h d c (♠ ♥ ♦ ♣)
const Cards = (() => {
  const RANKS = '23456789TJQKA';
  const SUITS = 'shdc';
  const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];
  const RED = [false, true, true, false];

  const rank = (c) => (c >> 2) + 2;
  const suit = (c) => c & 3;
  const make = (r, s) => ((r - 2) << 2) | s;
  const rankChar = (r) => RANKS[r - 2];
  const rankLabel = (r) => (r === 10 ? '10' : RANKS[r - 2]); // for card faces / text
  const rankOf = (ch) => (ch === '10' ? 10 : RANKS.indexOf(String(ch).toUpperCase()) + 2);
  const isRed = (c) => RED[suit(c)];

  const TOKEN = /(10|[2-9TJQKA])([shdc♠♥♦♣])/gi;
  function parse(str) {
    const m = /^\s*(10|[2-9TJQKA])([shdc♠♥♦♣])\s*$/i.exec(str);
    if (!m) throw new Error('Bad card: ' + str);
    let s = SUITS.indexOf(m[2].toLowerCase());
    if (s < 0) s = SUIT_SYMBOLS.indexOf(m[2]);
    return make(rankOf(m[1]), s);
  }
  // 'As Kd 7h' or 'AsKd7h' → [c, c, c]
  const parseList = (str) => (String(str).match(TOKEN) || []).map(parse);

  const str = (c) => rankLabel(rank(c)) + SUIT_SYMBOLS[suit(c)];
  const strList = (cards) => cards.map(str).join(' ');
  const deck = () => Array.from({ length: 52 }, (_, i) => i);

  // [c1, c2] → 'AKs' | 'AKo' | '77' (higher rank first)
  function handCode(c1, c2) {
    let r1 = rank(c1), r2 = rank(c2);
    if (r1 < r2) { const t = r1; r1 = r2; r2 = t; }
    if (r1 === r2) return rankChar(r1) + rankChar(r2);
    return rankChar(r1) + rankChar(r2) + (suit(c1) === suit(c2) ? 's' : 'o');
  }

  // 13×13 grid, index 0 = A … 12 = 2. Diagonal: pairs; above diagonal (i<j): suited; below: offsuit.
  function gridCode(i, j) {
    const ri = 14 - i, rj = 14 - j;
    if (i === j) return rankChar(ri) + rankChar(rj);
    if (i < j) return rankChar(ri) + rankChar(rj) + 's';
    return rankChar(rj) + rankChar(ri) + 'o';
  }
  const HAND_CODES = [];
  for (let i = 0; i < 13; i++) for (let j = 0; j < 13; j++) HAND_CODES.push(gridCode(i, j));

  const codeCombos = (code) => (code.length === 2 ? 6 : code[2] === 's' ? 4 : 12);
  // 'AKs' → {hi:14, lo:13, type:'s'}; '77' → {hi:7, lo:7, type:'p'}
  function codeInfo(code) {
    const hi = rankOf(code[0]), lo = rankOf(code[1]);
    return { hi, lo, type: code.length === 2 ? 'p' : code[2] };
  }
  // All concrete [c1, c2] combos of a code.
  function codeToCombos(code) {
    const { hi, lo, type } = codeInfo(code);
    const out = [];
    for (let s1 = 0; s1 < 4; s1++) for (let s2 = 0; s2 < 4; s2++) {
      if (type === 'p' && s2 <= s1) continue;
      if (type === 's' && s1 !== s2) continue;
      if (type === 'o' && s1 === s2) continue;
      out.push([make(hi, s1), make(lo, s2)]);
    }
    return out;
  }

  // Range notation: '77+', 'JJ-22', 'AJs+', 'KQs', 'A5s-A2s', 'AK' (= AKs + AKo), 'K9o+'.
  // 'XYs+' raises the lower card up to one below the higher card (T8s+ = T8s, T9s).
  function parseRange(text) {
    const set = new Set();
    const R = '([2-9TJQKA])';
    for (const raw of String(text).split(',')) {
      const t = raw.trim().toUpperCase().replace(/S\b/g, 's').replace(/O\b/g, 'o');
      if (!t) continue;
      let m;
      if ((m = new RegExp('^' + R + '\\1(\\+)?$').exec(t))) {
        const r = rankOf(m[1]);
        for (let x = r; x <= (m[2] ? 14 : r); x++) set.add(rankChar(x) + rankChar(x));
      } else if ((m = new RegExp('^' + R + '\\1-' + R + '\\2$').exec(t))) {
        const a = rankOf(m[1]), b = rankOf(m[2]);
        for (let x = Math.min(a, b); x <= Math.max(a, b); x++) set.add(rankChar(x) + rankChar(x));
      } else if ((m = new RegExp('^' + R + R + '([so])?(\\+)?$').exec(t))) {
        const hi = rankOf(m[1]), lo = rankOf(m[2]);
        if (hi <= lo) throw new Error('Bad range token: ' + raw);
        const types = m[3] ? [m[3]] : ['s', 'o'];
        for (let x = lo; x <= (m[4] ? hi - 1 : lo); x++) for (const ty of types) set.add(rankChar(hi) + rankChar(x) + ty);
      } else if ((m = new RegExp('^' + R + R + '([so])-' + R + R + '\\3$').exec(t))) {
        const hi = rankOf(m[1]);
        if (rankOf(m[4]) !== hi) throw new Error('Bad range token: ' + raw);
        const a = rankOf(m[2]), b = rankOf(m[5]);
        for (let x = Math.min(a, b); x <= Math.max(a, b); x++) set.add(rankChar(hi) + rankChar(x) + m[3]);
      } else {
        throw new Error('Bad range token: ' + raw);
      }
    }
    return set;
  }

  // Russian rank names: [nom sg, gen sg, nom pl, gen pl] — 'туз', 'туза', 'тузы', 'тузов'
  const RANK_RU = {
    14: ['туз', 'туза', 'тузы', 'тузов'],
    13: ['король', 'короля', 'короли', 'королей'],
    12: ['дама', 'дамы', 'дамы', 'дам'],
    11: ['валет', 'валета', 'валеты', 'валетов'],
    10: ['десятка', 'десятки', 'десятки', 'десяток'],
    9: ['девятка', 'девятки', 'девятки', 'девяток'],
    8: ['восьмёрка', 'восьмёрки', 'восьмёрки', 'восьмёрок'],
    7: ['семёрка', 'семёрки', 'семёрки', 'семёрок'],
    6: ['шестёрка', 'шестёрки', 'шестёрки', 'шестёрок'],
    5: ['пятёрка', 'пятёрки', 'пятёрки', 'пятёрок'],
    4: ['четвёрка', 'четвёрки', 'четвёрки', 'четвёрок'],
    3: ['тройка', 'тройки', 'тройки', 'троек'],
    2: ['двойка', 'двойки', 'двойки', 'двоек'],
  };
  const NOM = 0, GEN = 1, NOM_PL = 2, GEN_PL = 3;
  const rankRu = (r, form = NOM) => RANK_RU[r][form];
  // Suit words for counting: [1 card, 2–4 cards, 5+ cards] — 'черва', 'червы', 'черв'
  const SUIT_RU = [['пика', 'пики', 'пик'], ['черва', 'червы', 'черв'], ['бубна', 'бубны', 'бубен'], ['трефа', 'трефы', 'треф']];
  const suitRu = (s, n) => {
    const f = SUIT_RU[s];
    const a = Math.abs(n) % 100, b = a % 10;
    return a > 10 && a < 20 ? f[2] : b === 1 ? f[0] : b >= 2 && b <= 4 ? f[1] : f[2];
  };

  return {
    RANKS, SUITS, SUIT_SYMBOLS, rank, suit, make, rankChar, rankLabel, rankOf, isRed,
    parse, parseList, str, strList, deck, handCode, gridCode, HAND_CODES, codeCombos, codeInfo, codeToCombos,
    parseRange, RANK_RU, rankRu, NOM, GEN, NOM_PL, GEN_PL, suitRu,
  };
})();
