// Settings + Stats: validation, merging, sessions, mistakes — without storage and with a fake localStorage.
// Block scope: test files share one VM context, so helpers must not become globals.
{
  const fakeStorage = (mem) => ({
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  });
  // Runs fn with globalThis.localStorage = store (the VM context is the global), then restores a clean state.
  function withStorage(store, fn) {
    globalThis.localStorage = store;
    try { fn(); } finally {
      delete globalThis.localStorage;
      Settings.reload();
      Stats.reload();
    }
  }

  test('settings: defaults, validation, merge (no storage)', () => {
    assert.deepStrictEqual(Settings.reload(), Settings.DEFAULTS);
    let s = Settings.set({ players: 6, questions: { outs: false } });
    assert.strictEqual(s.players, 6);
    assert.strictEqual(s.questions.outs, false);
    assert.strictEqual(s.questions.preflop, true, 'questions are merged per key');
    // garbage keeps the previous valid values
    s = Settings.set({ players: 12, startBB: 'lots', levelHands: 7.5, speed: 'warp', practiceFreq: 33, botsMode: 'manual', botStyles: ['maniac', 'alien'], questions: 'x' });
    assert.strictEqual(s.players, 6);
    assert.strictEqual(s.startBB, 100);
    assert.strictEqual(s.levelHands, 10);
    assert.strictEqual(s.speed, 'normal');
    assert.strictEqual(s.practiceFreq, Settings.DEFAULTS.practiceFreq);
    assert.strictEqual(s.botsMode, 'manual');
    assert.deepStrictEqual(s.botStyles.slice(0, 3), ['maniac', 'station', 'reg']);
    assert.strictEqual(s.botStyles.length, 8);
    assert.strictEqual(Settings.set({ startBB: 300, levelHands: 5 }).startBB, 300);
    assert.strictEqual(Settings.speedFactor(), 1);
    Settings.set({ speed: 'slow' }); assert.strictEqual(Settings.speedFactor(), 1.6);
    Settings.set({ speed: 'fast' }); assert.strictEqual(Settings.speedFactor(), 0.45);
    // get() is a copy
    const g = Settings.get(); g.players = 2; g.questions.read = false;
    assert.strictEqual(Settings.get().players, 6);
    assert.strictEqual(Settings.get().questions.read, true);
    // in memory only: nothing persisted without storage
    assert.deepStrictEqual(Settings.reload(), Settings.DEFAULTS);
    assert.deepStrictEqual(Settings.set(Settings.DEFAULTS), Settings.DEFAULTS);
  });

  test('stats: sessions, categories, positions, looks (no storage)', () => {
    Stats.reset();
    let d = Stats.data();
    assert.deepStrictEqual(d.total, { ok: 0, n: 0 });
    assert.deepStrictEqual(Object.keys(d.byCat), Stats.CATS);
    assert.strictEqual(Stats.CATS.length, 7);
    assert.ok(Stats.CATS.every((c) => Stats.CAT_RU[c]));

    Stats.beginSession('learn');
    Stats.record('preflop', true, { pos: 'UTG' });
    Stats.record('preflop', false, { pos: 'UTG' });
    Stats.record('preflop', true, { pos: 'nowhere' });
    Stats.record('outs', true);
    Stats.record('equity', false);
    Stats.record('cards', true);             // unknown categories are ignored
    Stats.record('action', 'acceptable');    // verdict strings: only 'mistake' is wrong
    Stats.record('action', 'mistake');
    Stats.recordLook(true);
    Stats.recordLook(false);
    d = Stats.data();
    assert.deepStrictEqual(d.total, { ok: 4, n: 7 }, 'tells stay out of the total');
    assert.deepStrictEqual(d.byCat.preflop, { ok: 2, n: 3 });
    assert.deepStrictEqual(d.byCat.equity, { ok: 0, n: 1 });
    assert.deepStrictEqual(d.byCat.action, { ok: 1, n: 2 });
    assert.deepStrictEqual(d.byCat.tells, { ok: 1, n: 2 });
    assert.deepStrictEqual(d.looks, { players: 1, total: 2 });
    assert.deepStrictEqual(d.byPos.UTG, { ok: 1, n: 2 });
    assert.deepStrictEqual(d.byPos.BB, { ok: 0, n: 0 });
    assert.strictEqual(d.sessions.length, 1);
    const s = d.sessions[0];
    assert.strictEqual(s.mode, 'learn');
    assert.deepStrictEqual([s.ok, s.n], [4, 7]);
    assert.deepStrictEqual(s.byCat.tells, { ok: 1, n: 2 });
    assert.ok(s.id && s.ts > 0);

    // empty sessions are dropped when the next one begins
    Stats.beginSession('practice');
    Stats.beginSession('tournament');
    Stats.record('read', true);
    assert.deepStrictEqual(Stats.data().sessions.map((x) => x.mode), ['learn', 'tournament']);

    // data() is a copy
    Stats.data().total.n = 999;
    assert.strictEqual(Stats.data().total.n, 8);

    // last 30 sessions
    for (let i = 0; i < 35; i++) { Stats.beginSession('practice'); Stats.record('outs', i % 2 === 0); }
    assert.strictEqual(Stats.data().sessions.length, 30);

    // reset keeps the running mode: the next record opens a fresh session
    Stats.reset();
    assert.deepStrictEqual(Stats.data().total, { ok: 0, n: 0 });
    assert.strictEqual(Stats.data().sessions.length, 0);
    Stats.record('potodds', true);
    d = Stats.data();
    assert.strictEqual(d.sessions.length, 1);
    assert.strictEqual(d.sessions[0].mode, 'practice');
    Stats.reset();
  });

  test('stats: last 20 mistakes, newest first, sanitized (no storage)', () => {
    Stats.reset();
    for (let i = 0; i < 25; i++) {
      Stats.addMistake({ cat: 'preflop', title: '❌ m' + i, lines: ['line', 5], handNo: i, mode: 'learn', pos: 'CO', hole: [48, 49, 77, 'x'], board: [] });
    }
    Stats.addMistake(null);
    const m = Stats.data().mistakes;
    assert.strictEqual(m.length, 20);
    assert.strictEqual(m[0].title, '❌ m24');
    assert.strictEqual(m[19].title, '❌ m5');
    assert.deepStrictEqual(m[0].hole, [48, 49]);
    assert.deepStrictEqual(m[0].lines, ['line', '5']);
    assert.ok(m[0].ts > 0);
    Stats.reset();
    assert.strictEqual(Stats.data().mistakes.length, 0);
  });

  test('settings + stats: persist through a fake localStorage, ignore garbage', () => {
    const mem = new Map();
    withStorage(fakeStorage(mem), () => {
      assert.deepStrictEqual(Settings.reload(), Settings.DEFAULTS);
      Settings.set({ players: 4, speed: 'fast', questions: { tells: false } });
      assert.ok(mem.has('pokerTrainer.settings'));
      let s = Settings.reload();
      assert.deepStrictEqual([s.players, s.speed, s.questions.tells, s.questions.outs], [4, 'fast', false, true]);

      mem.set('pokerTrainer.settings', JSON.stringify({
        players: '5', startBB: 999, levelHands: 15, speed: 'fast', practiceFreq: 75, tournamentReview: 'end',
        questions: { outs: 0, read: false }, botStyles: ['actor', 7, null], extra: 1,
      }));
      s = Settings.reload();
      assert.strictEqual(s.players, 9);
      assert.strictEqual(s.startBB, 100);
      assert.strictEqual(s.levelHands, 15);
      assert.strictEqual(s.practiceFreq, 75);
      assert.strictEqual(s.tournamentReview, 'end');
      assert.strictEqual(s.questions.outs, true);
      assert.strictEqual(s.questions.read, false);
      assert.deepStrictEqual(s.botStyles.slice(0, 3), ['actor', 'station', 'reg']);
      assert.strictEqual(s.extra, undefined);
      mem.set('pokerTrainer.settings', '{broken json');
      assert.deepStrictEqual(Settings.reload(), Settings.DEFAULTS);

      Stats.reset();
      Stats.beginSession('learn');
      Stats.record('potodds', true);
      Stats.recordLook(true);
      Stats.addMistake({ cat: 'potodds', title: '❌ Шансы банка', lines: ['100 ÷ (200 + 100) = 33%'], hole: [50, 51], board: [0, 1, 2] });
      let d = Stats.reload();
      assert.deepStrictEqual(d.total, { ok: 1, n: 1 });
      assert.deepStrictEqual(d.looks, { players: 1, total: 1 });
      assert.strictEqual(d.sessions.length, 1);
      assert.strictEqual(d.mistakes[0].title, '❌ Шансы банка');
      assert.deepStrictEqual(d.mistakes[0].board, [0, 1, 2]);

      mem.set('pokerTrainer.stats', JSON.stringify({
        total: { ok: 5, n: 3 }, byCat: { outs: { ok: -1, n: 'x' }, preflop: { ok: 2, n: 4 } }, byPos: { BTN: { ok: 1, n: 1 }, XX: { ok: 1, n: 1 } },
        sessions: 'nope', mistakes: [null, 7, { title: 'x', hole: [1, 99, 'a'] }], looks: { players: 3, total: 2 },
      }));
      d = Stats.reload();
      assert.deepStrictEqual(d.total, { ok: 3, n: 3 });
      assert.deepStrictEqual(d.byCat.outs, { ok: 0, n: 0 });
      assert.deepStrictEqual(d.byCat.preflop, { ok: 2, n: 4 });
      assert.deepStrictEqual(d.byPos.BTN, { ok: 1, n: 1 });
      assert.strictEqual(d.byPos.XX, undefined);
      assert.deepStrictEqual(d.sessions, []);
      assert.strictEqual(d.mistakes.length, 1);
      assert.deepStrictEqual(d.mistakes[0].hole, [1]);
      assert.deepStrictEqual(d.looks, { players: 2, total: 2 });
      Stats.reset();
      assert.ok(!mem.has('pokerTrainer.stats'));
    });

    // storage that throws on every access: everything still works in memory
    const deny = () => { throw new Error('denied'); };
    withStorage({ getItem: deny, setItem: deny, removeItem: deny }, () => {
      assert.deepStrictEqual(Settings.reload(), Settings.DEFAULTS);
      assert.strictEqual(Settings.set({ players: 3 }).players, 3);
      Stats.reload();
      Stats.record('outs', true);
      assert.deepStrictEqual(Stats.data().total, { ok: 1, n: 1 });
    });
    assert.deepStrictEqual(Settings.get(), Settings.DEFAULTS, 'state restored after the test');
    assert.deepStrictEqual(Stats.data().total, { ok: 0, n: 0 });
  });
}
