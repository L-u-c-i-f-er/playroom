// Scribble: word choice, live drawing steps, guesses and scoring, hints and the clock, turns and rounds, joining, and random games.
const fs = require('fs'), path = require('path'), assert = require('assert');
const js = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const stub = `let skew=0;const store={get:(k,d)=>d,set(){}};const rid=n=>Math.random().toString(36).slice(2,2+n);const H={};const ENG={};const app={addEventListener(){}};const setInterval=()=>0;
let ui={},GID='',G=null,mode=null,me='',form={locals:[]},net={},muted=false,screen='';const esc=s=>s,sheet=x=>x,avatar=()=>'',send=()=>{},render=()=>{},toast=()=>{},freshUI=()=>({}),sfx=()=>{},capInput=()=>'',rematch=()=>{},persist=()=>{},seatColor=()=>'';let seenLog=0;`;
const {SC, P, later} = new Function(js('dealmaker-rules.js') + stub + js('scribble.js') + '\nreturn {SC, P, later:ms => { skew += ms; }};')();
const seats = n => Array.from({length:n}, (_, i) => ({id:'p' + i, name:'P' + i}));
const ok = (s, pid, a) => assert.strictEqual(SC.apply(s, pid, a), undefined, JSON.stringify(a));
const artist = s => s.players[s.di].id;
const pt = (q, n, p, c = 1, w = 9) => ({q, a:'pt', n, c, w, p});

// --- A turn: pick, draw, guess
{
  const s = SC.newGame(seats(3));
  assert.strictEqual(s.stage, 'pick'); assert.strictEqual(artist(s), 'p0'); assert.deepStrictEqual(SC.needs(s), ['p0']);
  assert.strictEqual(new Set(s.choices).size, 3);
  assert(SC.apply(s, 'p1', {t:'pick', i:0}).includes('not your turn'));
  assert(SC.apply(s, 'p1', {t:'guess', text:'x'}).includes('Wait'));
  ok(s, 'p0', {t:'pick', i:1});
  const word = s.choices === null && s.word;
  assert(word && s.stage === 'draw');
  // drawing: numbered steps, strokes start and grow, undo and clear
  assert(SC.apply(s, 'p1', {t:'ink', ops:[pt(1, 0, [1, 1])]}).includes('artist'));
  ok(s, 'p0', {t:'ink', ops:[pt(1, 0, [10, 10, 20, 20]), pt(2, 0, [30, 30])]});
  assert.deepStrictEqual(s.ink, [{c:1, w:9, p:[10, 10, 20, 20, 30, 30]}]);
  ok(s, 'p0', {t:'ink', ops:[pt(1, 0, [10, 10]), pt(3, 1, [500, 400], 4, 18)]});   // a repeat is skipped
  assert.strictEqual(s.ink.length, 2); assert.strictEqual(s.inkq, 3);
  assert.strictEqual(SC.apply(s, 'p0', {t:'ink', ops:[pt(9, 1, [1, 1])]}), 'gap');
  assert(SC.apply(s, 'p0', {t:'ink', ops:[pt(4, 1, [1001, 1])]}).includes('Bad'), 'off the page');
  assert(SC.apply(s, 'p0', {t:'ink', ops:[pt(4, 2, [1, 1], 99)]}).includes('Bad'), 'no such colour');
  ok(s, 'p0', {t:'ink', ops:[{q:4, a:'undo'}]}); assert.strictEqual(s.ink.length, 1); assert.strictEqual(s.inkv, 1);
  ok(s, 'p0', {t:'ink', ops:[{q:5, a:'clear'}]}); assert.strictEqual(s.ink.length, 0);
  // guesses: wrong ones go in the feed, near misses are told privately, right ones score by speed
  ok(s, 'p1', {t:'guess', text:'banana bread'});
  assert.strictEqual(s.log.at(-1).kind, 'g'); assert.strictEqual(s.log.at(-1).g, 'banana bread');
  const typo = word.length >= 4 ? word.slice(0, -1) : null;
  if (typo){ ok(s, 'p1', {t:'guess', text:typo}); assert.deepStrictEqual(s.log.at(-1).to, ['p1'], 'only the guesser hears it’s close'); }
  assert(SC.apply(s, 'p0', {t:'guess', text:word}).includes('drawing'));
  ok(s, 'p1', {t:'guess', text:'  ' + word.toUpperCase() + '!! '});
  const fast = s.guessed.p1;
  assert(fast >= 280 && fast <= 300, `quick guess scores near 300 (${fast})`);
  assert(SC.apply(s, 'p1', {t:'guess', text:word}).includes('already'));
  assert.strictEqual(s.totals.p0, 5 * Math.round(fast * .4 / 5), 'the artist scores too');
  later(60000);
  ok(s, 'p2', {t:'guess', text:`is it a ${word}`});
  assert(s.guessed.p2 < fast, 'a later guess scores less');
  assert.strictEqual(s.stage, 'reveal', 'everyone guessed: the turn ends');
  assert(/The word was/.test(s.log.at(-1).text));
}
// --- The clock: auto-pick, hints, time up, next artist
{
  const s = SC.newGame(seats(3), {cfg:{rounds:1, secs:80}});
  later(SC.PICK + 10);
  assert(SC.tick(s)); assert.strictEqual(s.stage, 'draw', 'no pick in time: the first word is chosen');
  s.word = 'watermelon'; s.start -= 0;
  assert(!SC.tick(s), 'nothing to do yet');
  later(41000); while (SC.tick(s)); assert.strictEqual(s.hint.length, 1, 'half time: one letter');
  later(20000); while (SC.tick(s)); assert.strictEqual(s.hint.length, 2, 'three quarters: two letters');
  later(20000); SC.tick(s); assert.strictEqual(s.stage, 'reveal');
  later(SC.SHOW + 10); SC.tick(s); assert.strictEqual(s.stage, 'pick'); assert.strictEqual(artist(s), 'p1');
  // a full game: everyone draws once per round, then the best total wins
  const g = SC.newGame(seats(3), {cfg:{rounds:2, secs:30}});
  const artists = [];
  while (g.phase === 'play'){ if (g.stage === 'pick') artists.push(artist(g)); later(31000); SC.tick(g); }
  assert.deepStrictEqual(artists, ['p0', 'p1', 'p2', 'p0', 'p1', 'p2']);
  assert.strictEqual(g.stage, 'done'); assert(g.champion);
}
// --- Joining mid-game, and an artist who was voted out
{
  const s = SC.newGame(seats(2), {cfg:{rounds:2, secs:30}});
  s.late = [{id:'p9', name:'New', score:40}];
  later(SC.PICK + 10); SC.tick(s); later(31000); SC.tick(s); later(SC.SHOW + 10); SC.tick(s);
  assert(P(s, 'p9'), 'seated at the next turn'); assert.strictEqual(s.totals.p9, 40); assert.deepStrictEqual(s.late, []);
  s.gone = {[artist(s)]:true};
  const skipped = artist(s); SC.tick(s);
  assert.notStrictEqual(artist(s), skipped, 'the next player draws instead');
}
// --- A full page stays well inside a saved table
{
  const s = SC.newGame(seats(2)); ok(s, 'p0', {t:'pick', i:0});
  let q = 0, n = 0, err;
  while (!err){ const p = Array.from({length:200}, (_, i) => i % 2 ? 749 : 999); err = SC.apply(s, 'p0', {t:'ink', ops:[pt(++q, n++, p)]}); }
  assert.strictEqual(err, 'The page is full');
  assert(JSON.stringify(s).length < 200000, `saved size ${JSON.stringify(s).length}`);
}
assert(SC.near('aple', 'apple') && SC.near('applo', 'apple') && SC.near('applee', 'apple') && !SC.near('apl', 'apple') && !SC.near('apple', 'apple'));
assert.strictEqual(SC.norm('Ice-Cream!'), 'icecream');
assert.strictEqual(new Set(SC.WORDS).size, SC.WORDS.length, 'no repeated words');

// --- Random games: legal moves, sensible scores, every game ends
let games = 0, turns = 0, rights = 0;
for (let g = 0; g < 300; g++){
  const s = SC.newGame(seats(2 + g % 7), {cfg:{rounds:1 + g % 3, secs:[30, 60, 80][g % 3]}});
  for (let step = 0; step < 5000 && s.phase === 'play'; step++){
    const a = artist(s), r = Math.random();
    if (s.stage === 'pick' && r < .5){ ok(s, a, {t:'pick', i:Math.random() * 3 | 0}); turns++; continue; }
    if (s.stage === 'draw' && r < .4){
      const pid = s.players[Math.random() * s.players.length | 0].id;
      if (pid === a || s.guessed[pid] != null) continue;
      if (r < .1){ ok(s, pid, {t:'guess', text:s.word}); rights++; } else ok(s, pid, {t:'guess', text:'something else'});
      continue;
    }
    later(Math.random() * 9000); SC.tick(s);
    for (const p of s.players) assert(s.totals[p.id] >= 0);
    assert(!(s.stage === 'draw' && s.guessed[artist(s)] != null), 'the artist never guesses');
  }
  assert.strictEqual(s.phase, 'over'); games++;
}
console.log(`ok: scribble — rules verified; ${games} random games, ${turns} turns picked, ${rights} right guesses`);
