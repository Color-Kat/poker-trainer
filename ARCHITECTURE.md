# Архитектура / контракт модулей

Source of truth for every module's API. If you must deviate, update this file in the same change.
UI language: Russian. Code/comments: English is fine.

## Build & layout

- `src/*.js` are concatenated **in filename order** into one inline `<script>` (prefixed with `'use strict'`),
  `src/*.css` into one `<style>`, inside `src/template.html` → **`index.html`** (`node build.js`).
  The single file must work offline from `file://`: no CDN, no external fonts/images, no `fetch`.
- Every JS file defines exactly ONE top-level namespace: `const Name = (() => { …; return {…}; })();`
  No other top-level declarations (they would collide in the shared script scope).
- No module touches `document` / `window` / `localStorage` at load time (Node tests load every file).
  `99-main.js` boots only `if (typeof document !== 'undefined')`.
- All `localStorage` access goes through `U.storage` (already try/catch-wrapped).
- Randomness only via `U.rng()` / `U.shuffle()` / `U.chance()` / `U.pick()` (seedable for tests: `U.seed(n)`, reset with `U.seed(null)`).
- Tests: `node tests/run.js [filter]` loads all `src/*.js` into one VM context, then `tests/*.test.js`
  (`test(name, fn)` + Node `assert` are globals; async fns OK). A broken module is reported as LOAD ERROR, others still run.
- Browser checks: `node build.js && node tools/browser.js 390 844 .shots/m.png` (headless Chromium, prints console errors).
  As a module: `const { open } = require('./tools/browser'); const { page, errors, close } = await open({ width, height, mobile })`.
- Dev loader for scripts: `const P = require('./tools/load')(); P.Engine…`.

| file | namespace | owner |
|---|---|---|
| 00-util.js | `U` | done |
| 10-cards.js | `Cards` | done |
| 20-handeval.js | `HandEval` | done |
| 30-equity.js | `Equity` | done |
| 40-engine.js | `Engine` | engine |
| 50-bots.js | `Bots` | bots |
| 60-ranges.js | `Ranges` | coach |
| 61-coach.js | `Coach` | coach |
| 70-view.js | `View` | done (shared DOM helpers) |
| 72-settings.js | `Settings` | screens |
| 75-stats.js | `Stats` | screens |
| 80-ui.js | `UI` | game-ui |
| 85-screens.js | `Screens` | screens |
| 90-game.js | `Game` | game-ui |
| 99-main.js | `Main` (just boots) | game-ui |
| 00-base.css | tokens + shared components | done |
| 10-table.css | table / game screen | game-ui |
| 20-screens.css | menu, settings, stats, cheat sheet, results | screens |

## Foundation (done — read the source)

- **Card** = int 0..51, `c = (rank-2)*4 + suit`, rank 2..14 (14 = A), suit 0..3 = ♠ ♥ ♦ ♣.
  `Cards.rank/suit/make/str('A♠')/strList/parse('As')/parseList('As Kd')/handCode(c1,c2)→'AKs'|'AKo'|'77'`,
  `Cards.HAND_CODES` (169, 13×13 grid order A..2), `gridCode(i,j)`, `codeCombos`, `codeInfo`, `codeToCombos`,
  `parseRange('77+, AJs+, AQo+, KQs, JJ-22, AK')→Set<code>`, `rankRu(r, form)` (forms `Cards.NOM/GEN/NOM_PL/GEN_PL`: туз/туза/тузы/тузов), `suitRu(s, n)` (черва/червы/черв).
- `HandEval.score(cards)` 1..7 cards → int, higher wins; `HandEval.cat(score)` 0..8 (`HandEval.CAT.*`);
  `evaluate(cards)→{score,cat,best,name,catName}`; `describe(score)` → 'Две пары: тузы и семёрки'.
  < 5 cards → pair-type categories only.
- `Equity.calc(hands, board, {toCome, dead, iters, exactLimit})→{eq[],win[],tie[],samples,exact}` (exact enumeration when ≤ 30000 runouts, else MC).
  `toCome: 1` = "only the next card" (compare with the rule of 2 for one card).
  `Equity.vsRandom(hole, board, nOpp, {iters, dead, oppFilter(hole, board)→bool|weight})` MC to the river.
  `Equity.PREFLOP_ORDER` (169 codes strongest→weakest), `preflopRank(code)`, `preflopTopPct(code)` (share of 1326 combos at least as strong: AA≈0.0045, 32o=1), `holeTopPct(hole)`.
- `U`: `rng seed randInt chance pick shuffle clamp sum fmt(chips) pct(frac,d)→'19,6%' pctNum(percent,d) dec plural nplural sleep now storage esc uid`.
- `View`: `cardHTML(c,{size:'sm'|'xs',hl,dim})` (`null` = card back, `-1` = empty slot), `cardsHTML`, `suitText(text)` (escapes + colours ♥♦),
  `feedbackHTML(fb)`, `el(html)`, `modal(title, html, {buttons:[{label,value,cls}], wide, onOpen})→Promise`, `toast(text, ms)`.
- CSS (`00-base.css`): tokens (`--felt --rail --brass --ok --warn --bad --info --cw` …), `.btn .btn-primary .btn-ghost .btn-ok .btn-danger .btn-sm`,
  `.panel`, `.fb.correct|acceptable|mistake|info` (+`.fb-title .fb-line`), `.pcard` (+`.red .back .empty .hl .dim .sm .xs`), `.modal*`, `.toast`, `.tbl`.

## Shared vocabulary

- **Seats**: `table.players[seat]`, seat 0 = human (always drawn bottom-centre). Seat numbers increase **clockwise**
  (screen: seat 0 at bottom, seat 1 lower-left, … around the oval). The button moves clockwise each hand.
- **Positions** (preflop action order, first → last): the last N labels of
  `['UTG','UTG+1','MP','LJ','HJ','CO','BTN','SB','BB']` (early positions removed first; 6 players → LJ HJ CO BTN SB BB).
  Heads-up: `['BTN','BB']` — the button posts the small blind, acts first preflop and last postflop.
  Groups: ранняя = UTG, UTG+1; средняя = MP, LJ, HJ; поздняя = CO, BTN; блайнды = SB, BB.
- **Styles**: `'rock'` Камень, `'station'` Коллинг-станция, `'reg'` Регуляр, `'maniac'` Маньяк, `'actor'` Актёр
  (actor plays like its `baseStyle` ∈ the other four, but its tells are reversed).
- **Feedback object** (coach output, rendered by `View.feedbackHTML`):
  `{ kind, verdict: 'correct'|'acceptable'|'mistake'|'info', title, lines: [plain text…] }`
  kind ∈ `'preflop'|'outs'|'cards'|'equity'|'potodds'|'action'|'read'|'tells'|'timing'|'realEquity'`.
  Text uses card strings like `A♥ K♥` (no HTML). Titles start with ✅ / ⚠️ (acceptable) / ❌ / ℹ️.
  Never name a bot's hidden style unless `player.revealed` is true — describe the tendency instead ("этот соперник часто сбрасывает").
- **Chips**: integers. Learning/practice blinds fixed 10/20. Starting stack = `startBB × 20` (default 100 BB = 2000).
  Tournament blind levels (raise every `levelHands` hands, default 10):
  `10/20 15/30 20/40 30/60 40/80 50/100 75/150 100/200 150/300 200/400 300/600 400/800 500/1000 700/1400 1000/2000 1500/3000 2000/4000 3000/6000 5000/10000`.

## Engine (`40-engine.js`)

Pure, synchronous, no DOM. Mutates plain objects. Throws `Error` on illegal input.

```js
table = {
  players: [{ seat, name, isHuman, style, baseStyle, stack, busted: false, revealed: false,
              avatar: { initials, color }, hud: { hands: 0, vpip: 0, pfr: 0 } }],   // index === seat
  button: seat, sb: 10, bb: 20, handNo: 0,
}
Engine.createTable({ players, sb, bb, button }) → table           // fills missing fields (seat, busted…)
Engine.positionNames(n) → labels in preflop action order          // n=2 → ['BTN','BB']
Engine.startHand(table, { deck }?) → hand
  // eligible seat = !busted && stack > 0; needs ≥ 2 eligible (else throws)
  // if table.handNo > 0: table.button = next eligible seat clockwise; else if button not eligible → next eligible
  // table.handNo++; posts blinds (all-in if short); deals 2 cards each (deck.pop(); opts.deck for tests,
  // otherwise U.shuffle(Cards.deck())); sets toAct (first to act preflop) or phase 'roundEnd' if nobody can act.
Engine.legal(hand) → {
  seat, toCall,            // chips needed to call, capped at stack
  canFold: true, canCheck, canCall, canRaise,
  minTo, maxTo,            // raise-TO totals for this street (maxTo = bets[seat] + stack = all-in)
  isBet,                   // currentBet === 0 → label "Ставка", else "Рейз"
  pot, stack, currentBet, myBet }
Engine.act(hand, { type: 'fold'|'check'|'call'|'raise', to }) → logEntry
  // 'raise' covers bets too; `to` = total street bet. to ≥ maxTo → all-in; to < minTo → raised to minTo
  // (or all-in if minTo > maxTo). 'call' with toCall 0 → check. 'check' facing a bet → throws.
  // Raising is not allowed (canRaise false) when: stack ≤ toCall; every other non-folded player is all-in;
  // or the player already acted and only faces an incomplete (short all-in) raise.
Engine.advance(hand) → event       // only when phase === 'roundEnd'
  // 1) returns any uncalled bet; 2) one player left → awards pot: {type:'uncontested', result};
  // 3) street was river → showdown: {type:'showdown', result};
  // 4) else deals next street: {type:'street', street, cards}; phase → 'betting' (or stays 'roundEnd'
  //    when < 2 players can act — all-in run-out: call advance again for each street).
Engine.pot(hand)                   // all chips committed this hand (incl. current street bets)
Engine.sizeTo(hand, frac)          // raise-to for a pot-fraction bet/raise: myBet + toCall + frac × (pot + toCall), clamped [minTo, maxTo], rounded to a whole chip
Engine.inHand(hand, seat), Engine.nextSeat(table, seat, pred)
```

```js
hand = {
  no, sb, bb, button, sbSeat, bbSeat,
  dealt: bool[], seats: [...],     // dealt seats clockwise starting after the button
  order: [...],                    // dealt seats in preflop action order (aligned with positionNames(n))
  pos: [],                         // pos[seat] = 'UTG' … 'BB' | null
  hole: [],                        // hole[seat] = [c1, c2] | null
  board: [], deck: [],
  street: 'preflop'|'flop'|'turn'|'river',
  phase: 'betting'|'roundEnd'|'done',
  toAct: seat|null,
  bets: [], committed: [], startStacks: [],          // arrays indexed by seat
  folded: [], allIn: [], acted: [],
  currentBet, minRaise, lastRaiser, raises,          // raises = bets/raises this street (blinds excluded)
  potAtStreetStart,
  log: [{ i, street, seat, type: 'sb'|'bb'|'fold'|'check'|'call'|'bet'|'raise',
          add, to, allIn, incomplete, facing, potBefore, potAfter }],
  result: null | {
    uncontested, pots: [{ amount, eligible: [seat], winners: [seat], name: 'Основной банк'|'Побочный банк 1' }],
    payouts: [], returned: [], net: [],              // indexed by seat
    winners: [seat], shown: [seat],                  // shown = non-folded seats at showdown
    names: [], best: [], scores: [] }                // per seat (showdown only)
}
```
Rules: full NLHE — blinds (short blind posts all-in; callers still owe the full BB), min-raise = last full raise
(≥ BB), incomplete all-in raises do not reopen betting, side pots (folded chips stay in the pots they reached),
uncalled bets returned, split pots with odd chips to the first winner clockwise from the button.
Bust handling is the controller's job (Engine just leaves stack 0).

## Bots (`50-bots.js`)

```js
Bots.STYLE_IDS = ['rock','station','reg','maniac','actor']; Bots.BASE_STYLES = ['rock','station','reg','maniac']
Bots.STYLES[id] = { id, name: 'Камень', type: 'тайтовый пассивный', vpip: '12–15%', pfr: '8%',
                    postflop, foldToBet, bluff, tells, foldEquity: 'high'|'medium'|'low'|'none', desc }
Bots.createBot({ style, baseStyle?, usedNames? }) → { name, isHuman: false, style, baseStyle, avatar: { initials, color } }
Bots.randomLineup(nBots) → [style…]                    // varied mix, ≤ 2 actors
Bots.decide({ table, hand, seat, legal, human }) → { action: { type, to? }, thinkMs, say? }
   // human = { seat: 0, lastAction: { street, type, thinkMs } | null, avgThinkMs } — regs fold more vs slow human bets/raises
   // thinkMs: realistic base delay (≈ 500–3500) before speed scaling; timing patterns differ by style (a tell)
Bots.streetReaction({ table, hand, seat, newCards }) → reaction | null      // on flop/turn/river reveal
Bots.betReaction({ table, hand, seat, entry }) → reaction | null            // optional, after its bet/raise
reaction = { seat, shown: 'strength'|'weakness', truth: 'strong'|'weak'|'neutral', acting, random,
             text: 'бросил быстрый взгляд на свои фишки',        // for reviews: "Игорь бросил …"
             bubble: 'смотрит на фишки' | '«Ну и флоп…»',         // short, for the speech bubble
             anim: 'glance'|'freeze'|'tremble'|'quiet'|'lookaway'|'chatter'|'shrug'|'sigh'|'smile'|'toss',
             meaning: 'это часто сигнал, что флоп попал' }
Bots.classifyHolding(hole, board) → 'strong'|'medium'|'draw'|'bluff'          // truth for the read question
Bots.READ_PROFILE[baseStyle] → { strong, medium, draw, bluff }               // typical big-bet composition, sums to 1
Bots.foldEquity(player) → 'high'|'medium'|'low'|'none'                        // actor → its base style
Bots.base(player) → base style id
```
Targets (measurable by simulation): VPIP rock 12–15%, station 45–55%, reg 18–22%, maniac 40–50%;
PFR rock ≈8%, station ≈5%, reg 15–18%, maniac ≈30%. Sizing: rock/station bet small and rarely, but a big
late-street raise from them is almost always the nuts; reg bets ½–¾ pot; maniac bets big and shoves often.
Preflop ranges = section 6 tables adjusted by style (rock tighter, station/maniac wider).
Tells: rock honest & subtle, station honest & obvious, reg almost none (sometimes acting), maniac chaotic,
actor reversed (weakness shown = strength). 10–20% of shown reactions are random noise.

## Coach (`60-ranges.js`, `61-coach.js`)

```js
Ranges.OPEN_TEXT[pos]                 // ТЗ 6.1 strings; SB = CO; BB (vs SB limp / limpers) uses CO
Ranges.open(pos) → Set, Ranges.border(pos) → Set   // border = one step below each range component (66 for 77+, ATs for AJs+ …)
Ranges.situation(hand, seat) → { kind: 'open'|'limped'|'bbOption'|'vsRaise'|'vs3bet'|'walk', pos, n, playersAfter,
                                 limpers, raises, raiser, raiseTo, effStack }
Ranges.evaluate(hand, seat, action, table) → feedback (kind 'preflop') + { best: 'fold'|'call'|'raise'|'check', pos, code, situation }
Ranges.hint(hand, seat, table) → { title, lines }          // learning-mode hint before acting
Ranges.grid(key) → 13×13 [{ code, cls: 'in'|'border'|'out'|'raise'|'call' }]   // key = pos | 'vsRaise' | 'vs3bet'
Ranges.POS_INFO[pos] → { group: 'Ранняя'|'Средняя'|'Поздняя'|'Блайнд', text }   // tooltip text

Coach.analyze(hand, seat, table) → spot | null     // postflop teaching spot for the human, null if none
spot = { street, kind: 'draw'|'made'|'nodraw', facing, hole, board, pot, toCall, betTo, bettor, sizeFrac, allInSpot,
         nOpp, multiway, outs: { total, clean, dirty, over, list, cleanList, dirtyList: [{ c, reason }], overList, draws: [{ type, n, cards, text }] },
         correctOuts, acceptedOuts, cardsToSee, ruleEq /*%*/, needed /*%*/, estEq /*0..1, made spots*/,
         made: { cat, name, strength: 'strong'|'medium'|'weak'|'none' }, foldEq,
         verdicts: { fold?, check?, call?, raise? : 'best'|'ok'|'mistake' }, best, questions: ['outs','cards','equity','potodds'] }
Coach.questions(spot, settings) → [{ id: 'outs'|'cards'|'equity'|'potodds', type: 'number'|'choice', prompt, unit, options?, info?, hint }]
   // filtered by settings.questions toggles; info for potodds = { pot, bet, toCall }
Coach.check(spot, qid, value, answers) → feedback + { ok }          // answers = earlier answers {outs, cards, …}
Coach.evaluateAction(spot, action) → feedback (kind 'action')
Coach.realEquity(spot, hand) → feedback (kind 'realEquity', 'ℹ️ По правилу: 18%. Реально против K♠Q♦ (Игорь): 19,6%') | null
Coach.readQuestion(hand, seat, table) → { bettor, truth, sizeFrac, street, options: [{ v: 'strong'|'medium'|'draw'|'bluff', label }] } | null  // only bets ≥ 2/3 pot
Coach.readReview(read, answer, hand, table, extras) → feedback (kind 'read')   // extras: { thinkMs, tellsSeen: [reaction] }
Coach.lookHint(missed: [reaction], table, street) → feedback (kind 'tells') | null
Coach.timing = { add(ms, strong: bool), warning() → string | null, reset() }    // last 20 decisions, > 2 s gap
Coach.heroStrong(hole, board) → bool
```
Teaching rules (ТЗ §6–7): outs ±1, rule-of-2/4 equity ±3 pp (×4 − (outs − 8) above 8 outs), pot odds ±2 pp
(`call ÷ (pot incl. bet + call)`), cards-to-see = 2 only for a flop all-in. Multiway (3+ players) → only clean outs.
Overcards (no pair, hole card above the board) may be counted as 3 outs each (accepted alternative).

## Settings / Stats / Screens (`72-settings.js`, `75-stats.js`, `85-screens.js`)

```js
Settings.DEFAULTS = { players: 9, startBB: 100, levelHands: 10, speed: 'normal' /*'slow'|'normal'|'fast'*/,
  botsMode: 'random' /*|'manual'*/, botStyles: ['rock','station','reg','maniac','actor','reg','rock','station'],
  questions: { preflop: true, outs: true, equity: true, potodds: true, read: true, tells: true },
  practiceFreq: 50 /*% of key decisions with questions*/, tournamentReview: 'hand' /*|'end'*/ }
Settings.get() → current (loaded once from storage), Settings.set(patch) (persists), Settings.speedFactor() → 1.6 | 1 | 0.45
Stats.CATS = ['preflop','outs','equity','potodds','action','read','tells']; Stats.CAT_RU[cat]
Stats.beginSession(mode); Stats.record(cat, ok, { pos }?); Stats.recordLook(lookedAtPlayers)
Stats.addMistake({ cat, title, lines, handNo, mode, pos, hole, board }); Stats.data(); Stats.reset()
Screens.menu({ onStart(mode) }), Screens.settings({ onBack }), Screens.stats({ onBack }),
Screens.cheatSheet() (modal, callable from anywhere), Screens.rangeModal(key, title), Screens.mistake(m),
Screens.results(summary, { onMenu, onAgain })      // tournament final screen
```

## Game UI & controller (`80-ui.js`, `90-game.js`, `99-main.js`)

Mode behaviour:

| | Обучение (learn) | Тренировка (practice) | Турнир (tournament) |
|---|---|---|---|
| preflop evaluation | always, feedback always | always, feedback unless correct | silent → review |
| hint / range buttons | «Подсказка», «Посмотреть диапазон» | «Посмотреть диапазон» | — |
| postflop questions | every spot | `practiceFreq`% of spots | none |
| answer feedback | after each answer | wrong answers only | — |
| action evaluation | always shown | shown unless correct | silent → review |
| read question (bet ≥ ⅔ pot) | 50% of such bets | 50% × freq | none |
| look-at-board/opponents | yes | yes | yes (hints only in review) |
| blinds | 10/20 fixed | fixed | levels every `levelHands` |
| bust | rebuy (human asked, bots auto) | rebuy | elimination → results screen |
| style label | after 20 hands with the bot or «Подсказать стиль» | after 20 hands | after 20 hands |

Flow per hand: `Engine.startHand` → loop: human turn (preflop: hint/range; postflop: `Coach.analyze` → questions
→ action panel → evaluate) / bot turn (`Bots.decide`, wait `thinkMs × speed`) → on `roundEnd` `Engine.advance`;
on each new street, if the human is in the hand and the `tells` toggle is on: 2-second choice
«Смотреть на борд» / «Смотреть на соперников» (default board) — opponents → reactions shown 2 s, board revealed
after; board → reactions hidden, missed ones produce a post-hand `Coach.lookHint`. After the hand: real equity
for outs spots, read review, look hints, timing warning, stats, tournament bookkeeping.
Human decision time = from action panel enabled to click (excluding question time); feed `Coach.timing`
and pass `human.lastAction.thinkMs` to bots.

## Round 3 additions (user feedback)

- **Feedback** may carry `more: [...]` (collapsed under «Подробнее») and `grid: { key, hl }` (13×13 range grid).
  Texts: title + ≤ 2 short lines. No range text lists anywhere — grids instead.
- **Range grid keys** (`Ranges.grid`): position label, `'BB'`, `'limped:POS'`, `'vsRaise:POS:deep|short'`, `'vs3bet:POS'`
  (plain `'vsRaise'`/`'vs3bet'` still work). `View.rangeGridHTML(key, hl)` renders one.
  `Ranges.mySituation(hand, seat)` → `{ key, caption, hl }` for the personalized tab.
  `Screens.rangeModal(opts)` with `opts = { situation, pos, n, hl }` → tabs «Твоя ситуация», «Открытие», «Против лимпа», «Против рейза», «Против 3-бета» (old `(key, title)` form still works).
- **Every action graded**: `Coach.analyze` returns a spot for every human postflop decision (any street, bet or no bet).
  `Coach.foldProb(hand, seat, table, betTo)` simulates the real `Bots.decide` to estimate fold equity; bluffs and checks
  are graded against break-even `bet / (pot + bet)`.
- **More quizzes**: `Ranges.questions` (preflop pot odds vs a raise), postflop `potodds` on every bet faced, `outs/cards/equity`
  with any draw, `sizing` (chips for ⅔ pot), `Coach.afterActionQuestions` → `bluff` (break-even fold %). Approximate
  answers accepted (±3 pp, rounded-number variant, simple fractions). Stats: sizing/bluff → `potodds`.
- **Teacher**: `Ranges.advise(hand, seat, table)`, `Coach.advise(spot)` → `{ best, size, title, lines, more, grid }`; `UI.showAdvice`.
- **Tells quiz**: `Coach.tellQuestion(reaction, table)`, `Coach.tellReview(...)`, `Coach.TELLS_GUIDE` (cheat-sheet tab «Теллы»).
- **Settings keys**: `teacher`, `dealAssist` ('off'|'normal'|'strong', learn/practice only), `heroPos` ('any'|label),
  `autoSkipFolded`; `practiceFreq` default 75.
- **Game API**: `Game.skipHand()`, `Game.openRanges()`, `Game.lockPos(label|null)`, `Game.setTeacher(bool)`,
  `Game.state().canSkip`. Card rigging and position lock live in the controller (engine untouched).
- Engine extras (from audits): `table.lastBB` (heads-up button rule), `hand.returned[]`, `Engine.legal` → null outside betting,
  round ends when the only player who can act already covers every live bet.
