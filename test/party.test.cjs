// Tic Tac Toe and Bingo: win and draw detection, turn order, the winner-stays-on queue, grid sizes, and random games where every move (and every out-of-time move) is legal.
const fs = require('fs'), path = require('path'), assert = require('assert');
const js = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const stub = `const store={get:(k,d)=>d,set(){}};const rid=n=>Math.random().toString(36).slice(2,2+n);const H={};const ENG={};
let ui={},GID='',G=null,mode=null,me='',form={locals:[]},net={},muted=false,screen='';const esc=s=>s,sheet=x=>x,avatar=()=>'',send=()=>{},render=()=>{},toast=()=>{},freshUI=()=>({}),sfx=()=>{};let seenLog=0;`;
const {TTT, BINGO, P} = new Function(js('dealmaker-rules.js') + stub + js('tictactoe.js') + js('bingo.js') + '\nreturn {TTT, BINGO, P};')();
const seats = n => Array.from({length:n}, (_, i) => ({id:'p' + i, name:'P' + i}));
const ok = (E, s, pid, a) => assert.strictEqual(E.apply(s, pid, a), undefined, JSON.stringify(a));
// The next round, the way the app's rematch() builds it: same seats plus anyone joining, scores and the game's carry-over.
const next = (E, s, join = []) => E.newGame([...s.players, ...join], {totals:s.totals, round:s.round, cfg:s.cfg, ...(E.carry?.(s) || {})});
const play = (s, moves) => { for (const i of moves) ok(TTT, s, TTT.needs(s)[0], {t:'move', i}); };

// --- Tic Tac Toe
{
  const s = TTT.newGame(seats(2));
  assert.deepStrictEqual(TTT.needs(s), ['p0'], 'first round: the first player is X and starts');
  assert(TTT.apply(s, 'p1', {t:'move', i:0}).includes('not your turn'));
  play(s, [0, 3, 1, 4]);
  assert(TTT.apply(s, 'p0', {t:'move', i:3}).includes('taken'));
  play(s, [2]);
  assert.strictEqual(s.phase, 'over'); assert.strictEqual(s.winner, 'p0'); assert.deepStrictEqual(s.line, [0, 1, 2]); assert.strictEqual(s.totals.p0, 1);
  const r2 = next(TTT, s);
  assert.deepStrictEqual(r2.duo, ['p0', 'p1']); assert.strictEqual(r2.x, 'p1', 'same two again: X swaps');
  // a draw: X O X / X O O / O X X
  const d = TTT.newGame(seats(2));
  play(d, [0, 1, 2, 4, 3, 5, 7, 6, 8]);
  assert.strictEqual(d.phase, 'over'); assert.strictEqual(d.winner, null); assert.strictEqual(d.totals.$tie, 1);
  // out of time: take a win, else block
  const w = TTT.newGame(seats(2)); w.board = ['p0', 'p0', null, 'p1', 'p1', null, null, null, null];
  assert.deepStrictEqual(TTT.timeout(w), {t:'move', i:2});
  w.board = ['p0', null, null, 'p1', 'p1', null, 'p0', null, null];
  assert.deepStrictEqual(TTT.timeout(w), {t:'move', i:5});
}
// Winner stays on: three at the table, then a fourth joins between rounds
{
  const s = TTT.newGame(seats(3));
  assert.deepStrictEqual(s.duo, ['p0', 'p1']);
  assert(TTT.apply(s, 'p2', {t:'move', i:0}).includes('queue'), 'the player waiting can’t move');
  play(s, [0, 3, 1, 4, 2]);   // p0 wins
  assert.deepStrictEqual(s.order, ['p0', 'p2', 'p1']);
  const r2 = next(TTT, s, [{id:'p3', name:'P3'}]);
  assert.deepStrictEqual(r2.players.map(p => p.id), ['p0', 'p2', 'p3', 'p1'], 'a newcomer queues ahead of the loser');
  assert.deepStrictEqual(r2.duo, ['p0', 'p2']); assert.strictEqual(r2.x, 'p2', 'the challenger is X');
  play(r2, [0, 4, 1, 2, 6, 3, 5, 8, 7]);   // a draw: both step down
  assert.strictEqual(r2.winner, null);
  const r3 = next(TTT, r2);
  assert.deepStrictEqual(r3.duo, ['p3', 'p1']); assert.deepStrictEqual(r3.players.map(p => p.id), ['p3', 'p1', 'p0', 'p2']);
}
let tWins = 0, tDraws = 0, rounds3 = 0;
for (let g = 0; g < 400; g++){
  let s = TTT.newGame(seats(2 + g % 5));
  for (let r = 0; r < 8; r++){
    while (s.phase === 'play'){
      const pid = TTT.needs(s)[0], empty = s.board.map((v, i) => v == null ? i : -1).filter(i => i >= 0);
      assert(s.duo.includes(pid));
      ok(TTT, s, pid, Math.random() < .3 ? TTT.timeout(s) : {t:'move', i:empty[Math.random() * empty.length | 0]});
    }
    if (s.winner){ tWins++; assert(TTT.winLine(s.board)); assert.strictEqual(s.order[0], s.winner); } else { tDraws++; assert(s.board.every(v => v != null) && !TTT.winLine(s.board)); }
    assert.deepStrictEqual([...s.order].sort(), s.players.map(p => p.id).sort(), 'everyone stays in the queue');
    if (s.players.length > 2) rounds3++;
    s = next(TTT, s);
  }
}

// --- Bingo
{
  const s = BINGO.newGame(seats(3));
  assert.deepStrictEqual(BINGO.needs(s), ['p0', 'p1', 'p2'], 'everyone fills a grid');
  assert.strictEqual(s.cfg.size, 5, 'classic 5×5 by default');
  assert(BINGO.apply(s, 'p0', {t:'grid', grid:[1, 1, ...Array.from({length:23}, (_, i) => i + 3)]}).includes('once'));
  assert(BINGO.apply(s, 'p0', {t:'grid', grid:Array.from({length:36}, (_, i) => i + 1)}).includes('1 to 25'), 'a grid of the wrong size');
  assert(BINGO.apply(s, 'p0', {t:'call', n:5}).includes('fill'));
  const g = Array.from({length:25}, (_, i) => i + 1);
  ok(BINGO, s, 'p0', {t:'grid', grid:g}); assert(BINGO.apply(s, 'p0', {t:'grid', grid:g}).includes('locked'));
  ok(BINGO, s, 'p1', {t:'grid', grid:[...g].reverse()}); ok(BINGO, s, 'p2', BINGO.timeout(s, 'p2'));
  assert.strictEqual(s.stage, 'call'); assert.deepStrictEqual(BINGO.needs(s), ['p0']);
  assert(BINGO.apply(s, 'p1', {t:'call', n:1}).includes('not your turn'));
  ok(BINGO, s, 'p0', {t:'call', n:1}); assert(BINGO.apply(s, 'p1', {t:'call', n:1}).includes('already'));
  assert(BINGO.apply(s, 'p1', {t:'call', n:26}).includes('Pick'), 'only numbers on the grid');
  // p0's grid is 1..25 in rows: calling 1–5 completes the top row
  for (const n of [2, 3, 4, 5]) ok(BINGO, s, BINGO.needs(s)[0], {t:'call', n});
  assert.strictEqual(P(s, 'p0').lines, 1);
  assert.strictEqual(BINGO.done(g, [1, 6, 11, 16, 21]).length, 1, 'a column');
  assert.strictEqual(BINGO.done(g, [1, 7, 13, 19, 25]).length, 1, 'a diagonal');
  for (const n of [5, 6, 7, 8]) assert.strictEqual(BINGO.linesOf(n).length, 2 * n + 2);
  // 8×8: numbers up to 64, the anti-diagonal runs 7, 14 … 56
  const b = BINGO.newGame(seats(2), {cfg:{size:8}}), g8 = Array.from({length:64}, (_, i) => i + 1);
  ok(BINGO, b, 'p0', {t:'grid', grid:g8}); ok(BINGO, b, 'p1', BINGO.timeout(b, 'p1'));
  assert.strictEqual(P(b, 'p1').grid.length, 64);
  assert.strictEqual(BINGO.done(g8, [8, 15, 22, 29, 36, 43, 50, 57]).length, 1);
  assert.strictEqual(BINGO.newGame(seats(2), {cfg:{size:11}}).cfg.size, 11, 'odd sizes are kept in settings but…');
  assert(BINGO.apply(BINGO.newGame(seats(2), {cfg:{size:11}}), 'p0', {t:'grid', grid:g}) === undefined, '…play falls back to 5×5');
  // someone joins between rounds with the score the host gives them
  const r2 = BINGO.newGame([...s.players, {id:'p9', name:'New'}], {totals:{...s.totals, p9:2}, round:s.round, cfg:{size:6}});
  assert.strictEqual(r2.players.length, 4); assert.strictEqual(r2.totals.p9, 2); assert.strictEqual(r2.cfg.size, 6);
}
let bRounds = 0, shared = 0, calls = 0;
for (let r = 0; r < 1200; r++){
  const n = 2 + r % 7, size = [5, 6, 7, 8][r % 4], s = BINGO.newGame(seats(n), {round:r, cfg:{size}});
  for (const p of s.players) ok(BINGO, s, p.id, BINGO.timeout(s, p.id));
  while (s.phase === 'play'){
    const pid = BINGO.needs(s)[0], left = Array.from({length:size * size}, (_, i) => i + 1).filter(k => !s.called.includes(k));
    ok(BINGO, s, pid, Math.random() < .3 ? BINGO.timeout(s, pid) : {t:'call', n:left[Math.random() * left.length | 0]});
    calls++;
    assert(s.called.length <= size * size);
  }
  bRounds++; if (s.winners.length > 1) shared++;
  for (const p of s.players) assert.strictEqual(p.lines, BINGO.done(p.grid, s.called).length);
  assert(s.winners.every(id => P(s, id).lines >= 5) && s.players.every(p => s.winners.includes(p.id) || p.lines < 5));
}
console.log(`ok: tic tac toe — rules and winner-stays-on queue verified; ${tWins + tDraws} random rounds (${tWins} won, ${tDraws} drawn, ${rounds3} with a queue)`);
console.log(`ok: bingo — rules verified; ${bRounds} random rounds on 5×5 to 8×8, ${calls} calls (${shared} shared wins)`);
