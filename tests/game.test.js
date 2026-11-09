// Game controller: pure helpers (the DOM flow is covered by tools/e2e.js)
test('game: eliminations rank simultaneous busts by starting stack', () => {
  const players = [{ seat: 0, stack: 0 }, { seat: 1, stack: 0 }, { seat: 2, stack: 900 }, { seat: 3, stack: 0, busted: true, place: 4 }, { seat: 4, stack: 0 }];
  const out = Game.eliminate(players, [300, 800, 100, 0, 50]);
  // 4 alive before the hand → places 4, 3, 2 for the three busts; the smallest starting stack is out first
  assert.deepStrictEqual(out.map((p) => [p.seat, p.place]), [[4, 4], [0, 3], [1, 2]]);
  assert.ok(players[0].busted && players[1].busted && !players[2].busted);
  assert.strictEqual(players[3].place, 4, 'earlier busts keep their place');
  assert.deepStrictEqual(Game.eliminate(players, [0, 0, 0, 0, 0]), [], 'nobody new');
});

test('game: genitive names for «Стиль Игоря»', () => {
  const g = (n) => Game.gen(n);
  assert.deepStrictEqual(['Игорь', 'Олег', 'Марина', 'Дмитрий', 'Сергей', 'Наталья', 'Ольга', 'Павел', 'Юлия', 'Николай', 'Игорь 2'].map(g),
    ['Игоря', 'Олега', 'Марины', 'Дмитрия', 'Сергея', 'Натальи', 'Ольги', 'Павла', 'Юлии', 'Николая', 'Игоря 2']);
  for (const n of Bots.NAMES) assert.ok(g(n) !== n && /^[А-ЯЁ][а-яё]+$/.test(g(n)), n + ' → ' + g(n));
});
