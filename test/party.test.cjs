// Tic Tac Toe and Bingo: win and draw detection, turn order, grid checks, and random games where every move (and every out-of-time move) is legal.
const fs = require('fs'), path = require('path'), assert = require('assert');
const js = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const stub = `const store={get:(k,d)=>d,set(){}};const rid=n=>Math.random().toString(36).slice(2,2+n);const H={};const ENG={};
let ui={},GID='',G=null,mode=null,me='',form={locals:[]},net={},muted=false,screen='';const esc=s=>s,sheet=x=>x,avatar=()=>'',send=()=>{},render=()=>{},toast=()=>{},freshUI=()=>({}),sfx=()=>{};let seenLog=0;`;
const {TTT, BINGO, P} = new Function(js('dealmaker-rules.js') + stub + js('tictactoe.js') + js('bingo.js') + '\nreturn {TTT, BINGO, P};')();
const seats = n => Array.from({length:n}, (_, i) => ({id:'p' + i, name:'P' + i}));
const ok = (E, s, pid, a) => assert.strictEqual(E.apply(s, pid, a), undefined, JSON.stringify(a));

// --- Tic Tac Toe
{
  const s = TTT.newGame(seats(2));
  assert.deepStrictEqual(TTT.needs(s), ['p0'], 'round 1: player 1 is X and starts');
  assert(TTT.apply(s, 'p1', {t:'move', i:0}).includes('not your turn'));
  ok(TTT, s, 'p0', {t:'move', i:0}); ok(TTT, s, 'p1', {t:'move', i:3});
  assert(TTT.apply(s, 'p0', {t:'move', i:3}).includes('taken'));
  ok(TTT, s, 'p0', {t:'move', i:1}); ok(TTT, s, 'p1', {t:'move', i:4});
  ok(TTT, s, 'p0', {t:'move', i:2});
  assert.strictEqual(s.phase, 'over'); assert.strictEqual(s.winner, 'p0'); assert.deepStrictEqual(s.line, [0, 1, 2]); assert.strictEqual(s.totals.p0, 1);
  const r2 = TTT.newGame(seats(2), {totals:s.totals, round:s.round});
  assert.deepStrictEqual(TTT.needs(r2), ['p1'], 'round 2: X switches');
  // a draw: X O X / X O O / O X X
  const d = TTT.newGame(seats(2));
  for (const [pid, i] of [['p0', 0], ['p1', 1], ['p0', 2], ['p1', 4], ['p0', 3], ['p1', 5], ['p0', 7], ['p1', 6], ['p0', 8]]) ok(TTT, d, pid, {t:'move', i});
  assert.strictEqual(d.phase, 'over'); assert.strictEqual(d.winner, null); assert.strictEqual(d.totals.$tie, 1);
  // out of time: take a win, else block
  const w = TTT.newGame(seats(2)); w.board = [0, 0, null, 1, 1, null, null, null, null]; w.turn = 0;
  assert.deepStrictEqual(TTT.timeout(w), {t:'move', i:2});
  w.board = [0, null, null, 1, 1, null, 0, null, null]; w.turn = 0;
  assert.deepStrictEqual(TTT.timeout(w), {t:'move', i:5});
}
let tWins = 0, tDraws = 0;
for (let g = 0; g < 3000; g++){
  const s = TTT.newGame(seats(2), {round:g});
  while (s.phase === 'play'){
    const pid = TTT.needs(s)[0], empty = s.board.map((v, i) => v == null ? i : -1).filter(i => i >= 0);
    ok(TTT, s, pid, Math.random() < .3 ? TTT.timeout(s) : {t:'move', i:empty[Math.random() * empty.length | 0]});
  }
  if (s.winner){ tWins++; assert(TTT.winLine(s.board)); } else { tDraws++; assert(s.board.every(v => v != null) && !TTT.winLine(s.board)); }
}

// --- Bingo
{
  const s = BINGO.newGame(seats(3));
  assert.deepStrictEqual(BINGO.needs(s), ['p0', 'p1', 'p2'], 'everyone fills a grid');
  assert(BINGO.apply(s, 'p0', {t:'grid', grid:[1, 1, ...Array.from({length:23}, (_, i) => i + 3)]}).includes('once'));
  assert(BINGO.apply(s, 'p0', {t:'call', n:5}).includes('fill'));
  const g = Array.from({length:25}, (_, i) => i + 1);
  ok(BINGO, s, 'p0', {t:'grid', grid:g}); assert(BINGO.apply(s, 'p0', {t:'grid', grid:g}).includes('locked'));
  ok(BINGO, s, 'p1', {t:'grid', grid:[...g].reverse()}); ok(BINGO, s, 'p2', BINGO.timeout(s, 'p2'));
  assert.strictEqual(s.stage, 'call'); assert.deepStrictEqual(BINGO.needs(s), ['p0']);
  assert(BINGO.apply(s, 'p1', {t:'call', n:1}).includes('not your turn'));
  ok(BINGO, s, 'p0', {t:'call', n:1}); assert(BINGO.apply(s, 'p1', {t:'call', n:1}).includes('already'));
  // p0's grid is 1..25 in rows: calling 1–5 completes the top row
  for (const n of [2, 3, 4, 5]) ok(BINGO, s, BINGO.needs(s)[0], {t:'call', n});
  assert.strictEqual(P(s, 'p0').lines, 1);
  assert.strictEqual(BINGO.done(g, [1, 6, 11, 16, 21]).length, 1, 'a column');
  assert.strictEqual(BINGO.done(g, [1, 7, 13, 19, 25]).length, 1, 'a diagonal');
  assert.strictEqual(BINGO.LINES.length, 12);
}
let bRounds = 0, shared = 0, calls = 0;
for (let r = 0; r < 1500; r++){
  const n = 2 + r % 7, s = BINGO.newGame(seats(n), {round:r});
  for (const p of s.players) ok(BINGO, s, p.id, BINGO.timeout(s, p.id));
  while (s.phase === 'play'){
    const pid = BINGO.needs(s)[0], left = Array.from({length:25}, (_, i) => i + 1).filter(k => !s.called.includes(k));
    ok(BINGO, s, pid, Math.random() < .3 ? BINGO.timeout(s, pid) : {t:'call', n:left[Math.random() * left.length | 0]});
    calls++;
    assert(s.called.length <= 25);
  }
  bRounds++; if (s.winners.length > 1) shared++;
  for (const p of s.players) assert.strictEqual(p.lines, BINGO.done(p.grid, s.called).length);
  assert(s.winners.every(id => P(s, id).lines >= 5) && s.players.every(p => s.winners.includes(p.id) || p.lines < 5));
}
console.log(`ok: tic tac toe — rules verified; 3000 random games (${tWins} won, ${tDraws} drawn)`);
console.log(`ok: bingo — rules verified; ${bRounds} random rounds, ${calls} calls (${shared} shared wins)`);
