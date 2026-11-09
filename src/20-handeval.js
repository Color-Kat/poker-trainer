// ===== HandEval: best-5 evaluator for 1..7 cards =====
// score = cat << 20 | k1 << 16 | k2 << 12 | k3 << 8 | k4 << 4 | k5   (higher = better, k = rank 2..14)
// Fewer than 5 cards → only pair-type categories (no straight/flush), missing kickers = 0.
const HandEval = (() => {
  const CAT = { HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8 };
  const CAT_RU = ['Старшая карта', 'Пара', 'Две пары', 'Тройка', 'Стрит', 'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш'];

  // Highest straight top rank in a rank bitmask (bit r = rank r), ace also plays low. 0 if none.
  function straightTop(mask) {
    if (mask & (1 << 14)) mask |= 1 << 1;
    for (let top = 14; top >= 5; top--) {
      const need = 31 << (top - 4);
      if ((mask & need) === need) return top;
    }
    return 0;
  }

  const pack = (cat, k1 = 0, k2 = 0, k3 = 0, k4 = 0, k5 = 0) => (cat << 20) | (k1 << 16) | (k2 << 12) | (k3 << 8) | (k4 << 4) | k5;
  const cat = (score) => score >> 20;

  const counts = new Int8Array(15);
  const suitCount = new Int8Array(4);
  const suitMask = new Int32Array(4);

  function score(cards) {
    counts.fill(0); suitCount.fill(0); suitMask.fill(0);
    let rankMask = 0;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i], r = (c >> 2) + 2, s = c & 3;
      counts[r]++; suitCount[s]++; suitMask[s] |= 1 << r; rankMask |= 1 << r;
    }
    let flush = -1;
    for (let s = 0; s < 4; s++) if (suitCount[s] >= 5) flush = s;
    if (flush >= 0) {
      const sf = straightTop(suitMask[flush]);
      if (sf) return pack(8, sf);
    }
    let quad = 0, t1 = 0, t2 = 0, p1 = 0, p2 = 0, p3 = 0;
    for (let r = 14; r >= 2; r--) {
      const k = counts[r];
      if (k === 4) { if (!quad) quad = r; }
      else if (k === 3) { if (!t1) t1 = r; else if (!t2) t2 = r; }
      else if (k === 2) { if (!p1) p1 = r; else if (!p2) p2 = r; else if (!p3) p3 = r; }
    }
    // kickers: highest present ranks excluding up to two ranks
    const kick = (n, ex1, ex2) => {
      const out = [0, 0, 0, 0, 0];
      let j = 0;
      for (let r = 14; r >= 2 && j < n; r--) if (counts[r] && r !== ex1 && r !== ex2) out[j++] = r;
      return out;
    };
    if (quad) return pack(7, quad, kick(1, quad)[0]);
    if (t1 && (t2 || p1)) return pack(6, t1, Math.max(t2, p1));
    if (flush >= 0) {
      const k = [];
      for (let r = 14; r >= 2 && k.length < 5; r--) if (suitMask[flush] & (1 << r)) k.push(r);
      return pack(5, k[0], k[1], k[2], k[3], k[4]);
    }
    const st = straightTop(rankMask);
    if (st) return pack(4, st);
    if (t1) { const k = kick(2, t1); return pack(3, t1, k[0], k[1]); }
    if (p1 && p2) return pack(2, p1, p2, kick(1, p1, p2)[0]);
    if (p1) { const k = kick(3, p1); return pack(1, p1, k[0], k[1], k[2]); }
    const k = kick(5);
    return pack(0, k[0], k[1], k[2], k[3], k[4]);
  }

  const kickers = (s) => [(s >> 16) & 15, (s >> 12) & 15, (s >> 8) & 15, (s >> 4) & 15, s & 15];

  // Russian name from a score: 'Две пары: тузы и семёрки', 'Стрит до пятёрки', 'Роял-флеш'
  function describe(s) {
    const c = cat(s), k = kickers(s), R = Cards.rankRu;
    switch (c) {
      case 8: return k[0] === 14 ? 'Роял-флеш' : 'Стрит-флеш до ' + R(k[0], 1);
      case 7: return 'Каре ' + R(k[0], 3);
      case 6: return 'Фулл-хаус: тройка ' + R(k[0], 3) + ' и пара ' + R(k[1], 3);
      case 5: return 'Флеш до ' + R(k[0], 1);
      case 4: return 'Стрит до ' + R(k[0], 1);
      case 3: return 'Тройка ' + R(k[0], 3);
      case 2: return 'Две пары: ' + R(k[0], 2) + ' и ' + R(k[1], 2);
      case 1: return 'Пара ' + R(k[0], 3);
      default: return 'Старшая карта: ' + R(k[0], 0);
    }
  }

  // Full info incl. the best five cards (for highlighting). Brute force over 5-card subsets.
  function evaluate(cards) {
    const s = score(cards);
    let best = cards.slice(0, 5);
    if (cards.length > 5) {
      const n = cards.length;
      outer:
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
          const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
          if (score(five) === s) { best = five; break outer; }
        }
    }
    return { score: s, cat: cat(s), best, name: describe(s), catName: CAT_RU[cat(s)] };
  }

  const compare = (a, b) => Math.sign(score(a) - score(b));

  return { CAT, CAT_RU, score, cat, kickers, describe, evaluate, compare, straightTop };
})();
