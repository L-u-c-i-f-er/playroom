// Mafia: role deal, night kills and saves, Police checks, day votes, win conditions, one-device flow, random games.
const fs = require('fs'), path = require('path'), assert = require('assert');
const js = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const stub = `const store={get:(k,d)=>d,set(){}};const rid=n=>Math.random().toString(36).slice(2,2+n);const H={};const app={addEventListener(){}};const ENG={};const RUM={pc:()=>''};
let ui={},GID='',G=null,mode=null,me='',form={locals:[]},net={},muted=false;const esc=s=>s,sheet=x=>x,avatar=()=>'',send=()=>{},render=()=>{},toast=()=>{},viewState=()=>G,freshUI=()=>({}),live=()=>new Set(),rematch=()=>{},persist=()=>{};let seenLog=0;`;
const {MAF, P} = new Function(js('dealmaker-rules.js') + stub + js('mafia.js') + '\nreturn {MAF, P};')();
const seats = n => Array.from({length:n}, (_, i) => ({id:'p' + i, name:'P' + i}));
const ok = (s, pid, a) => assert.strictEqual(MAF.apply(s, pid, a), undefined, JSON.stringify(a));
const by = (s, role) => s.players.filter(p => p.role === role);
// A game with roles in seat order, already past the role cards.
function rig(roles, cfg = {}){
  const s = MAF.newGame(seats(roles.length), {cfg});
  s.players.forEach((p, i) => { p.role = roles[i]; p.ready = true; });
  s.stage = 'night';
  return s;
}
// Everyone not listed makes a harmless pick.
function night(s, picks){
  for (const p of s.players.filter(q => q.alive)){
    const t = picks[p.id] ?? s.players.find(q => q.alive && q !== p && (p.role !== 'mafia' || q.role !== 'mafia')).id;
    ok(s, p.id, {t:'night', target:t});
    if (s.cfg.local && s.stage === 'night') ok(s, p.id, {t:'done'});
  }
}

// --- Dealing
for (let n = 4; n <= 15; n++){
  const s = MAF.newGame(seats(n));
  const m = by(s, 'mafia').length;
  assert.strictEqual(m, n <= 5 ? 1 : n <= 8 ? 2 : n <= 11 ? 3 : 4);
  assert.strictEqual(by(s, 'police').length, 1); assert.strictEqual(by(s, 'doctor').length, 1);
  assert(by(s, 'mafia').every(p => [0, 13, 26, 39].includes(p.card)), 'Mafia hold Aces');
  assert.strictEqual(new Set(s.players.map(p => p.card)).size, n, 'every card is different');
}
assert.strictEqual(by(MAF.newGame(seats(5), {cfg:{mafia:4}}), 'mafia').length, 2, 'Mafia always start outnumbered');
assert.strictEqual(by(MAF.newGame(seats(6), {cfg:{doctor:0, police:0}}), 'villager').length, 4);
{
  const s = MAF.newGame(seats(4));
  assert(MAF.apply(s, 'p0', {t:'night', target:'p1'}).includes('card'));
  ['p0', 'p1', 'p2'].forEach(id => ok(s, id, {t:'ready'}));
  assert.strictEqual(s.stage, 'roles'); ok(s, 'p3', {t:'ready'}); assert.strictEqual(s.stage, 'night');
}

// --- Night: kill, save, checks, illegal picks
{
  let s = rig(['mafia', 'doctor', 'police', 'villager', 'villager', 'villager']);
  assert(MAF.apply(s, 'p0', {t:'night', target:'p0'}).includes('outside'));
  assert(MAF.apply(s, 'p2', {t:'night', target:'p2'}).includes('someone else'));
  night(s, {p0:'p3', p1:'p3', p2:'p0'});
  assert.strictEqual(s.stage, 'day'); assert(P(s, 'p3').alive, 'Doctor saved the target');
  assert.deepStrictEqual(P(s, 'p2').checks.map(c => [c.id, c.mafia]), [['p0', true]]);
  s = rig(['mafia', 'doctor', 'police', 'villager', 'villager', 'villager']);
  night(s, {p0:'p3', p1:'p1', p2:'p4'});
  assert(!P(s, 'p3').alive); assert.strictEqual(P(s, 'p2').checks[0].mafia, false);
  assert(MAF.apply(s, 'p3', {t:'vote', target:'p0'}).includes('out'), 'the dead don’t vote');
}

// --- Day votes
{
  const roles = ['mafia', 'mafia', 'doctor', 'police', 'villager', 'villager', 'villager', 'villager', 'villager'];
  let s = rig(roles); night(s, {p0:'p8', p1:'p8', p2:'p2'});   // p8 dies; 8 left
  assert(MAF.apply(s, 'p4', {t:'vote', target:'p4'}).includes('yourself'));
  ['p2', 'p3', 'p4'].forEach(id => ok(s, id, {t:'vote', target:'p0'}));
  ['p0', 'p1'].forEach(id => ok(s, id, {t:'vote', target:'p3'}));
  ok(s, 'p5', {t:'vote', target:'p1'}); ok(s, 'p6', {t:'vote'}); ok(s, 'p7', {t:'vote', target:'p0'});
  assert(!P(s, 'p0').alive, 'most votes goes'); assert.strictEqual(s.stage, 'night'); assert.strictEqual(s.night, 2);
  s = rig(roles); night(s, {p0:'p8', p1:'p8', p2:'p2'});
  ['p0', 'p1', 'p2'].forEach(id => ok(s, id, {t:'vote', target:'p4'}));
  ['p3', 'p4', 'p6'].forEach(id => ok(s, id, {t:'vote', target:'p5'}));
  ['p5', 'p7'].forEach(id => ok(s, id, {t:'vote'}));
  assert(s.players.slice(0, 8).every(p => p.alive), 'a tie votes nobody out');
  s = rig(roles); night(s, {p0:'p8', p1:'p8', p2:'p2'});
  ok(s, 'p0', {t:'vote', target:'p4'}); ok(s, 'p0', {t:'vote'});   // votes can change
  ['p1', 'p2', 'p3'].forEach(id => ok(s, id, {t:'vote'}));
  ['p4', 'p5', 'p6', 'p7'].forEach((id, j) => ok(s, id, {t:'vote', target:j < 3 ? 'p1' : 'p0'}));
  assert(P(s, 'p1').alive, 'as many skips as the top vote means nobody goes');
}

// --- Winning
{
  let s = rig(['mafia', 'doctor', 'police', 'villager']);
  night(s, {p0:'p3', p1:'p1'});
  assert.strictEqual(s.phase, 'play', '1 Mafia vs 2 town carries on');
  ['p1', 'p2'].forEach(id => ok(s, id, {t:'vote', target:'p0'})); ok(s, 'p0', {t:'vote', target:'p1'});
  assert.strictEqual(s.phase, 'over'); assert.strictEqual(s.winner, 'town');
  s = rig(['mafia', 'doctor', 'police', 'villager']);
  night(s, {p0:'p3', p1:'p1'});
  ['p0', 'p1'].forEach(id => ok(s, id, {t:'vote', target:'p2'})); ok(s, 'p2', {t:'vote', target:'p0'});
  assert.strictEqual(s.winner, 'mafia', '1 Mafia vs 1 town');
}

// --- One device: pass in seat order, Done hands it on, the group records the vote
{
  const s = MAF.newGame(seats(5), {cfg:{local:1}});
  assert.deepStrictEqual(MAF.needs(s), ['p0', 'p1', 'p2', 'p3', 'p4']);
  s.players.forEach(p => ok(s, p.id, {t:'ready'}));
  const first = s.players[0], t = s.players.find(q => q !== first && (first.role !== 'mafia' || q.role !== 'mafia'));
  ok(s, first.id, {t:'night', target:t.id});
  assert.strictEqual(MAF.needs(s)[0], first.id, 'still their turn until Done');
  ok(s, first.id, {t:'done'}); assert.strictEqual(MAF.needs(s)[0], 'p1');
  const s2 = rig(['mafia', 'doctor', 'police', 'villager', 'villager'], {local:1});
  night(s2, {p0:'p4', p1:'p1'});
  assert.deepStrictEqual(MAF.needs(s2), []);
  assert(MAF.apply(s2, 'p1', {t:'vote', target:'p0'}).includes('voted out'));
  ok(s2, 'p3', {t:'lynch', target:'p0'}); assert.strictEqual(s2.winner, 'town');
}

// --- Random games
let games = 0, town = 0, nights = 0;
for (let g = 0; g < 600; g++){
  const n = 4 + g % 12, local = g % 3 === 0;
  const s = MAF.newGame(seats(n), {cfg:{local:local ? 1 : 0}});
  for (let step = 0; step < 5000 && s.phase === 'play'; step++){
    const pid = MAF.needs(s)[0], live = s.players.filter(p => p.alive);
    if (s.stage === 'roles'){ ok(s, pid, {t:'ready'}); continue; }
    if (s.stage === 'night'){
      const p = P(s, pid);
      if (p.act != null){ ok(s, pid, {t:'done'}); continue; }
      const opts = live.filter(q => p.role === 'mafia' ? q.role !== 'mafia' : p.role === 'doctor' || q !== p);
      ok(s, pid, {t:'night', target:opts[Math.random() * opts.length | 0].id}); if (s.stage === 'day') nights++;
      continue;
    }
    if (local){ ok(s, 'p0', {t:'lynch', target:Math.random() < .2 ? null : live[Math.random() * live.length | 0].id}); continue; }
    const opts = live.filter(q => q.id !== pid);
    ok(s, pid, {t:'vote', target:Math.random() < .15 ? null : opts[Math.random() * opts.length | 0].id});
  }
  assert.strictEqual(s.phase, 'over');
  const live = s.players.filter(p => p.alive), m = live.filter(p => p.role === 'mafia').length;
  assert(s.winner === 'town' ? m === 0 : m >= live.length - m);
  games++; town += s.winner === 'town';
}
console.log(`ok: mafia — rules verified; ${games} random games over ${nights} nights (town won ${town})`);
