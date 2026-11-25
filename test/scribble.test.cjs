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
  assert.deepStrictEqual(s.choices.map(w => SC.LEVEL[w]), [0, 1, 2], 'one easy, one medium, one hard word');
  assert(SC.apply(s, 'p1', {t:'pick', i:0}).includes('not your turn'));
  assert(SC.apply(s, 'p1', {t:'guess', text:'x'}).includes('Wait'));
  ok(s, 'p0', {t:'pick', i:1});
  const word = s.choices === null && s.word;
  assert(word && s.stage === 'draw');
  // drawing: numbered steps on a copy of the picture (each viewer keeps one); strokes start and grow, undo, clear
  const d = {ink:[], inkv:0, inkq:0}, ink = ops => SC.inkApply(d, ops), good = ops => assert.strictEqual(ink(ops), undefined, JSON.stringify(ops));
  good([pt(1, 0, [10, 10, 20, 20]), pt(2, 0, [30, 30])]);
  assert.deepStrictEqual(d.ink, [{c:1, w:9, p:[10, 10, 20, 20, 30, 30]}]);
  good([pt(1, 0, [10, 10]), pt(3, 1, [500, 400], 4, 18)]);   // a repeat is skipped
  assert.strictEqual(d.ink.length, 2); assert.strictEqual(d.inkq, 3);
  assert.strictEqual(ink([pt(9, 1, [1, 1])]), 'gap');
  assert(ink([pt(4, 1, [1001, 1])]).includes('Bad'), 'off the page');
  assert(ink([pt(4, 2, [1, 1], 99)]).includes('Bad'), 'no such colour');
  good([{q:4, a:'undo'}]); assert.strictEqual(d.ink.length, 1); assert.strictEqual(d.inkv, 1);
  good([{q:5, a:'clear'}]); assert.strictEqual(d.ink.length, 0);
  // any colour from the wheel, and fills
  good([pt(6, 0, [5, 5], '#12ab9F'), {q:7, a:'fill', x:500, y:300, c:'#ff0000'}, {q:8, a:'fill', x:2, y:2, c:3}]);
  assert.deepStrictEqual(d.ink[1], {f:1, x:500, y:300, c:'#ff0000'});
  assert(ink([pt(9, 3, [1, 1], 'red')]).includes('Bad'), 'colours are #rrggbb');
  assert(ink([{q:9, a:'fill', x:1000, y:3, c:1}]).includes('Bad'), 'fill off the page');
  assert(ink([pt(9, 2, [1, 1])]).includes('Bad'), 'a fill can’t be drawn onto');
  good([{q:9, a:'undo'}]); assert.strictEqual(d.ink.length, 2, 'undo takes back a fill too');
  good([{q:10, a:'clear'}]);
  // guesses: wrong ones go in the feed, near misses are told privately, right ones score by speed
  ok(s, 'p1', {t:'guess', text:'banana bread'});
  assert.strictEqual(s.log.at(-1).kind, 'g'); assert.strictEqual(s.log.at(-1).g, 'banana bread');
  const typo = word.length >= 4 ? word.slice(0, -1) : null;
  if (typo){ ok(s, 'p1', {t:'guess', text:typo}); assert.deepStrictEqual(s.log.at(-1).to, ['p1'], 'only the guesser hears it’s close'); }
  assert(SC.apply(s, 'p0', {t:'guess', text:word}).includes('drawing'));
  ok(s, 'p1', {t:'guess', text:'  ' + word.toUpperCase() + '!! '});
  const fast = s.guessed.p1, m = SC.MULT[s.level];
  assert(s.level === 1 && fast >= 5 * Math.round(490 * m / 5) && fast <= 5 * Math.round(500 * m / 5), `first, quick guess on a medium word scores about 575 (${fast})`);
  assert(SC.apply(s, 'p1', {t:'guess', text:word}).includes('already'));
  assert.strictEqual(s.totals.p0, 0, 'the artist is paid when the turn ends');
  later(60000);
  ok(s, 'p2', {t:'guess', text:`is it a ${word}`});
  const second = s.guessed.p2;
  assert.strictEqual(second, 5 * Math.round((250 * 20 / 80 + 250 * (1 - 1 / 2)) * m / 5), 'second, later: half the order points and a quarter of the time points');
  assert.strictEqual(s.stage, 'reveal', 'everyone guessed: the turn ends');
  assert.strictEqual(s.totals.p0, 5 * Math.round(175 * m / 5), 'everyone got it: the artist gets the full 150 and the 25 bonus');
  assert(s.totals.p0 < fast, 'the artist scores less than a quick guesser');
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
// --- A full page stays well inside the server's limit for a saved copy
{
  const d = {ink:[], inkv:0, inkq:0};
  let q = 0, n = 0, err;
  while (!err){ const p = Array.from({length:200}, (_, i) => i % 2 ? 749 : 999); err = SC.inkApply(d, [pt(++q, n++, p, '#abcdef')]); }
  assert.strictEqual(err, 'The page is full');
  assert(JSON.stringify({k:'x', e:'abcdef', q, ink:d.ink}).length < 200000, `the artist's saved copy fits on the server (${JSON.stringify(d.ink).length})`);
}
assert(SC.near('aple', 'apple') && SC.near('applo', 'apple') && SC.near('applee', 'apple') && !SC.near('apl', 'apple') && !SC.near('apple', 'apple'));
assert.strictEqual(SC.norm('Ice-Cream!'), 'icecream');
assert.strictEqual(new Set(SC.WORDS).size, SC.WORDS.length, 'no repeated words, even across levels');
assert(SC.EASY.length >= 150 && SC.MEDIUM.length >= 150 && SC.HARD.length >= 120, `plenty of words (${SC.EASY.length}/${SC.MEDIUM.length}/${SC.HARD.length})`);
assert(SC.WORDS.every(w => /^[a-z]+( [a-z]+)*$/.test(w)), 'words are plain lowercase letters and single spaces');
// The artist's points: a share of the guessers, nothing when nobody gets it
{
  const s = SC.newGame(seats(5), {cfg:{rounds:1, secs:80}}); ok(s, 'p0', {t:'pick', i:2});
  ok(s, 'p1', {t:'guess', text:s.word}); later(81000); SC.tick(s);
  assert.strictEqual(s.gain.p0, 5 * Math.round(150 / 4 * SC.MULT[2] / 5), 'one of four guessed: a quarter of 150, hard word bonus');
  const t = SC.newGame(seats(3), {cfg:{rounds:1, secs:80}}); ok(t, 'p0', {t:'pick', i:0}); later(81000); SC.tick(t);
  assert.strictEqual(t.totals.p0, 0, 'nobody guessed: the artist scores nothing');
}

// --- Rating the drawing: 👍 adds 15, 👎 takes 15, counted when the reveal ends; the artist can't vote
{
  const s = SC.newGame(seats(4), {cfg:{rounds:1, secs:30}});
  assert(SC.apply(s, 'p1', {t:'rate', v:1}).includes('Nothing to rate'), 'not while the word is being picked');
  ok(s, 'p0', {t:'pick', i:0});
  assert(SC.apply(s, 'p0', {t:'rate', v:1}).includes('own drawing'));
  assert(SC.apply(s, 'p1', {t:'rate', v:5}).includes('not understood'));
  ok(s, 'p1', {t:'rate', v:-1}); ok(s, 'p2', {t:'rate', v:-1}); ok(s, 'p3', {t:'rate', v:1});
  ok(s, 'p3', {t:'rate', v:0}); ok(s, 'p3', {t:'rate', v:-1});   // changed their mind twice
  assert.deepStrictEqual(SC.votes(s), {up:0, down:3});
  s.totals.p0 = 30;
  later(31000); SC.tick(s); assert.strictEqual(s.stage, 'reveal');
  ok(s, 'p1', {t:'rate', v:1});   // still open while the word is shown
  later(SC.SHOW + 10); SC.tick(s);
  assert.strictEqual(s.totals.p0, 15, 'one like, two dislikes: 30 − 15');
  assert(/P0’s drawing: 1 👍 2 👎/.test(s.log.map(e => e.text).join('|')));
  assert.deepStrictEqual(s.rate, {}, 'votes start over for the next drawing');
}
{
  const s = SC.newGame(seats(3), {cfg:{rounds:1, secs:30}}); ok(s, 'p0', {t:'pick', i:0});
  s.totals.p0 = 100; ok(s, 'p1', {t:'rate', v:1}); ok(s, 'p2', {t:'rate', v:1});
  later(31000); SC.tick(s); later(SC.SHOW + 10); SC.tick(s);
  assert.strictEqual(s.totals.p0, 130, 'two likes: +30');
  const t = SC.newGame(seats(3), {cfg:{rounds:1, secs:30}}); ok(t, 'p0', {t:'pick', i:0});
  t.totals.p0 = 10; ok(t, 'p1', {t:'rate', v:-1}); ok(t, 'p2', {t:'rate', v:-1});
  later(31000); SC.tick(t); later(SC.SHOW + 10); SC.tick(t);
  assert.strictEqual(t.totals.p0, 0, 'two dislikes from 10: down to 0, not below');
}
// --- Fresh words: nothing offered comes back until its pile has been seen, across games too
{
  let s = SC.newGame(seats(8), {cfg:{rounds:3, secs:30}}), seen = [], games = 0;
  while (games < 30){
    while (s.phase === 'play'){ if (s.stage === 'pick') seen.push(...s.choices); later(31000); SC.tick(s); }
    games++; s = SC.newGame(seats(8), {cfg:s.cfg, ...SC.carry(s)});
  }
  if (s.stage === 'pick') seen.push(...s.choices);
  const easy = seen.filter(w => SC.LEVEL[w] === 0);
  assert(easy.length > SC.EASY.length, `enough turns to wrap the easy pile (${easy.length})`);
  const first = easy.slice(0, SC.EASY.length);
  assert.strictEqual(new Set(first).size, first.length, 'no easy word repeats until all easy words were offered');
  for (const [lvl, pile] of [[1, SC.MEDIUM], [2, SC.HARD]]){
    const got = seen.filter(w => SC.LEVEL[w] === lvl).slice(0, pile.length);
    assert.strictEqual(new Set(got).size, got.length, `level ${lvl}: no repeats within the first ${got.length}`);
  }
}
// --- The host's own words: cleaned, offered in the middle slot, or all three with "only my words"
{
  assert.deepStrictEqual(SC.cleanWords("Ravi's Bike, goa  trip\nBIRYANI, x, biryani, café, " + 'y'.repeat(40)), ['ravis bike', 'goa trip', 'biryani', 'cafe']);
  const mine = ['office canteen', 'goa trip', 'ravis bike', 'chai break'];
  const s = SC.newGame(seats(3), {cfg:{rounds:1, secs:30, custom:mine}});
  assert(mine.includes(s.choices[1]) && SC.LEVEL[s.choices[0]] === 0 && SC.LEVEL[s.choices[2]] === 2, 'easy, one of yours, hard');
  ok(s, 'p0', {t:'pick', i:1}); ok(s, 'p1', {t:'guess', text:s.word.toUpperCase()}); assert(s.guessed.p1 > 0, 'your words can be guessed');
  const only = SC.newGame(seats(3), {cfg:{rounds:3, secs:30, custom:mine, only:1}}), offered = [];
  while (only.phase === 'play'){ if (only.stage === 'pick'){ assert.strictEqual(new Set(only.choices).size, 3); offered.push(...only.choices); } later(31000); SC.tick(only); }
  assert(offered.every(w => mine.includes(w)), 'only your words');
  const few = SC.newGame(seats(3), {cfg:{rounds:1, secs:30, custom:['one', 'two'], only:1}});
  assert(SC.LEVEL[few.choices[0]] === 0, 'fewer than 3 of your own: the normal words are used');
}
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
