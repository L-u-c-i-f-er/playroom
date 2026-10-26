/* =====================================================================
   SCRIBBLE — draw and guess, online. Each turn one player (the artist)
   picks one of three words and draws it; everyone else types guesses.
   Guess sooner, score more; the artist scores for every right guess.
   Letters are revealed as the clock runs down. Everyone draws once a round.
   The drawing travels live in the artist's presence (the latest strokes,
   numbered in order, with a little overlap), and the artist's own device
   saves the whole picture to the server every couple of seconds. Anyone who
   misses a step (a dropped connection, joining late, a reload) fetches that
   copy and carries on from it.
   ===================================================================== */
const SC = (() => {
  // Three piles of drawable words. The artist is offered one of each; harder words score more.
  const list = t => t.trim().split(/\s*,\s*/);
  const EASY = list(`apple, banana, grapes, cherry, lemon, orange, pear, mango, pineapple, watermelon, strawberry, carrot, corn, potato, onion,
    tomato, mushroom, egg, bread, cheese, cake, cookie, donut, pizza, burger, sandwich, ice cream, popcorn, candy, lollipop, milk, juice,
    coffee, cup, plate, spoon, fork, knife, bowl, bottle, cat, dog, cow, pig, horse, sheep, goat, duck, chicken, rabbit, mouse, fish, bird,
    owl, frog, snake, turtle, snail, bee, ant, spider, butterfly, lion, tiger, elephant, monkey, giraffe, zebra, bear, panda, penguin,
    whale, shark, crab, octopus, sun, moon, star, cloud, rain, rainbow, tree, flower, leaf, grass, mountain, river, island, beach, fire,
    house, door, window, bed, chair, table, sofa, lamp, clock, phone, book, pencil, scissors, box, bag, key, lock, bell, candle, kite,
    ball, balloon, gift, crown, ring, hat, shoe, sock, shirt, dress, glasses, umbrella, toothbrush, comb, mirror, ladder, bucket, hammer,
    flag, map, drum, guitar, piano, car, bus, bicycle, train, airplane, boat, ship, truck, rocket, eye, nose, ear, mouth, hand, foot,
    tooth, heart, smile, hair, robot, ghost, snowman, king, queen, clown, alien, football, trophy, dice, samosa, ladoo, diya, tea,
    nest, bone, feather, magnet, pumpkin, cactus, igloo, tent, bridge, sword`);
  const MEDIUM = list(`lighthouse, windmill, volcano, waterfall, skyscraper, castle, tower, temple, pyramid, hospital, school, factory, barn,
    playground, swimming pool, stadium, helicopter, submarine, motorcycle, scooter, skateboard, tractor, ambulance, fire truck, police car,
    rickshaw, hot air balloon, parachute, sailboat, canoe, spaceship, telescope, microscope, binoculars, compass, anchor, treasure chest,
    magnifying glass, hourglass, calculator, laptop, headphones, microphone, camera, television, remote control, battery, light bulb,
    plug, fan, fridge, kettle, toaster, microwave, washing machine, vacuum cleaner, pressure cooker, tiffin box, ceiling fan, broom, iron,
    sewing machine, pirate, mermaid, dragon, unicorn, dinosaur, skeleton, vampire, zombie, wizard, witch, astronaut, ninja, superhero,
    scarecrow, cowboy, knight, princess, chef, doctor, firefighter, farmer, campfire, hammock, swing, seesaw, slide, trampoline,
    roller coaster, ferris wheel, carousel, sandcastle, picnic, fishing rod, traffic light, mailbox, fire hydrant, street lamp, bench,
    fountain, statue, wheelbarrow, lawn mower, watering can, flowerpot, beehive, spider web, palm tree, sunflower, rose, bamboo,
    coconut tree, kangaroo, crocodile, camel, deer, fox, wolf, squirrel, hedgehog, bat, peacock, parrot, flamingo, swan, eagle, dolphin,
    jellyfish, starfish, seahorse, lobster, caterpillar, ladybug, dragonfly, mosquito, scorpion, basketball, badminton, tennis, bowling,
    archery, boxing, skiing, surfing, golf, chess, kabaddi, karate, yoga, juggling, noodles, spaghetti, sushi, taco, hot dog,
    french fries, cupcake, pancake, waffle, popsicle, coconut, jalebi, biryani, dosa, rangoli, saree, turban, firecracker, snowflake,
    lightning, tornado, comet, planet, globe, chimney, staircase, bunk bed, aquarium, birdcage, fireplace, rocking chair, suitcase,
    backpack, wallet, necklace, wristwatch, paintbrush, envelope, stamp, newspaper, calendar, ice skates`);
  const HARD = list(`black hole, solar eclipse, shooting star, northern lights, constellation, space station, flying saucer, avalanche,
    earthquake, tsunami, quicksand, iceberg, oasis, haunted house, treehouse, drawbridge, catapult, time machine, conveyor belt,
    vending machine, escalator, revolving door, elevator, wind turbine, solar panel, oil rig, dam, crane, bulldozer, forklift,
    cement mixer, steamroller, stethoscope, periscope, metronome, sundial, abacus, typewriter, gramophone, jukebox, cassette, joystick,
    barcode, fingerprint, x ray, thermometer, wheelchair, crutches, jigsaw puzzle, rubiks cube, domino, snakes and ladders, carrom board,
    pinata, jack in the box, puppet, snow globe, music box, piggy bank, wishing well, message in a bottle, treasure map, crystal ball,
    magic lamp, flying carpet, genie, tug of war, hide and seek, musical chairs, traffic jam, power cut, sleepwalking, sunburn,
    snow angel, selfie, high five, thumbs up, piggyback, cartwheel, handstand, somersault, belly flop, eiffel tower, statue of liberty,
    leaning tower of pisa, great wall, taj mahal, india gate, sphinx, stonehenge, totem pole, big ben, food chain, recycling, gravity,
    evolution, dandiya, dahi handi, kite flying, tea stall, street food, chandelier, grandfather clock, cuckoo clock, scuba diver,
    lifeguard, tightrope, unicycle, pogo stick, jet ski, zip line, bungee jump, paragliding, rock climbing, birthday party, wedding,
    graduation, fireworks, sandstorm, hibernation, migration, shadow, reflection, echo, magician, ventriloquist, mime, referee,
    goalkeeper, lumberjack, beekeeper, astronomer, photographer, cheerleader, sumo wrestler, knight in armor, dragon egg,
    mirror maze, hall of mirrors, lost and found, double decker bus, cable car, bullet train`);
  const WORDS = [...EASY, ...MEDIUM, ...HARD], LEVEL = {};
  [EASY, MEDIUM, HARD].forEach((l, k) => l.forEach(w => { LEVEL[w] = k; }));
  const LEVELS = ['Easy', 'Medium', 'Hard'], MULT = [1, 1.15, 1.3];
  const PAL = ['#ffffff', '#1b1b1f', '#7d7d86', '#c9c9cf', '#e53935', '#fb8c00', '#fdd835', '#7cb342', '#2e7d32', '#00acc1', '#1e88e5', '#283593', '#8e24aa', '#ec407a', '#8d6e63', '#ffcc80'];
  const SIZES = [4, 9, 18, 34], CAP = 10000, PICK = 15000, SHOW = 6000, FILLS = 60;
  const okColour = c => Number.isInteger(c) ? !!PAL[c] : typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  const hex = c => Number.isInteger(c) ? PAL[c] : c;
  const cfg = {rounds:3, secs:80};
  // The host's clock: guests add the skew measured when the table last arrived (see take() in app.js).
  const clock = () => Date.now() + (typeof skew === 'number' ? skew : 0);
  const norm = t => String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  // One letter added, dropped or changed: “so close”.
  function near(a, b){
    if (a === b || Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, e = 0;
    while (i < a.length && j < b.length){
      if (a[i] === b[j]){ i++; j++; continue; }
      if (++e > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return e + (a.length - i) + (b.length - j) <= 1;
  }
  const trim = s => { if (s.log.length > 80) s.log = s.log.slice(-80); };

  function newGame(seats, extra = {}){
    const totals = {...(extra.totals || {})}, round = (extra.round || 0) + 1;
    const s = {...extra, cfg:{...cfg, ...(extra.cfg || {})}, totals, round, phase:'play', stage:'pick', gid:rid(8), ack:extra.ack || {}, log:[], ln:0,
      players:seats.map(p => ({id:p.id, name:p.name})), lap:1, di:-1, turnNo:0, used:[], champion:null, guessed:{}, gain:{}, hint:[]};
    s.players.forEach(p => { s.totals[p.id] ??= 0; });
    log(s, `Game ${round}: ${s.cfg.rounds} round${s.cfg.rounds > 1 ? 's' : ''}, ${s.cfg.secs} seconds to draw`, 'sys');
    nextTurn(s);
    return s;
  }
  const artistOf = s => s.players[s.di];
  const guessers = s => s.players.filter(p => p !== artistOf(s) && !s.gone?.[p.id]);
  function nextTurn(s){
    for (const l of s.late || []) if (!P(s, l.id) && s.players.length < 12){ s.players.push({id:l.id, name:l.name}); s.totals[l.id] = l.score; log(s, `${l.name} joins the game`, 'sys'); }
    s.late = [];
    let di = s.di, k = 0;
    do { di++; if (di >= s.players.length){ di = 0; s.lap++; } } while (s.gone?.[s.players[di].id] && ++k <= s.players.length);
    if (s.lap > s.cfg.rounds || s.players.filter(p => !s.gone?.[p.id]).length < 2) return finish(s);
    const one = l => { const pool = l.filter(w => !s.used.includes(w)); return shuffle([...(pool.length ? pool : l)])[0]; };
    Object.assign(s, {di, turnNo:s.turnNo + 1, stage:'pick', until:clock() + PICK, choices:[one(EASY), one(MEDIUM), one(HARD)], word:null, level:1,
      guessed:{}, gain:{}, hint:[]});
    log(s, `${artistOf(s).name} is choosing a word`, 'turn');
    tell(s, [artistOf(s).id], 'Your turn to draw! Pick a word');
  }
  function startDraw(s, w){
    Object.assign(s, {stage:'draw', word:w, level:LEVEL[w] ?? 1, choices:null, start:clock()});
    s.until = s.start + s.cfg.secs * 1000;
    s.used.push(w);
    log(s, `${artistOf(s).name} is drawing`, 'sys');
  }
  function endTurn(s){
    const n = Object.keys(s.guessed).length, m = guessers(s).length, a = artistOf(s);
    if (n && m && !s.gone?.[a.id]){
      const pts = 5 * Math.round((150 * Math.min(1, n / m) + (n >= m ? 25 : 0)) * MULT[s.level] / 5);
      s.gain[a.id] = pts; s.totals[a.id] = (s.totals[a.id] || 0) + pts;
    }
    s.stage = 'reveal'; s.until = clock() + SHOW;
    log(s, `The word was “${s.word}” (${n ? `${n} of ${m} guessed it` : 'nobody guessed it'})`, 'sys');   // the paper shows the reveal
  }
  function finish(s){
    s.phase = 'over'; s.stage = 'done';
    const best = [...s.players].sort((a, b) => (s.totals[b.id] || 0) - (s.totals[a.id] || 0))[0];
    s.champion = best?.id ?? null;
    if (best) log(s, `${best.name} wins with ${s.totals[best.id] || 0} points`, 'win', {title:`${best.name} wins!`, sub:`${s.totals[best.id] || 0} points`});
  }
  // The drawing as numbered steps: start or extend the newest stroke, undo the last one, or wipe the page.
  // `m` is anything holding {ink, inkv, inkq}: a viewer's live copy, or the artist's saved one.
  function inkApply(m, ops){
    if (!Array.isArray(ops) || ops.length > 80) return 'Bad drawing data';
    let used = m.ink.reduce((a, k) => a + (k.f ? 50 : k.p.length / 2), 0), fills = m.ink.filter(k => k.f).length;
    for (const o of ops){
      if (!o || !Number.isInteger(o.q)) return 'Bad drawing data';
      if (o.q <= m.inkq) continue;
      if (o.q !== m.inkq + 1) return 'gap';
      if (o.a === 'undo'){ const k = m.ink.pop(); if (k) used -= k.f ? 50 : k.p.length / 2; if (k?.f) fills--; m.inkv++; }
      else if (o.a === 'clear'){ m.ink = []; used = 0; fills = 0; m.inkv++; }
      else if (o.a === 'fill'){
        if (!Number.isInteger(o.x) || !Number.isInteger(o.y) || o.x < 0 || o.x > 999 || o.y < 0 || o.y > 749 || !okColour(o.c)) return 'Bad drawing data';
        if (used + 50 > CAP || fills >= FILLS) return 'The page is full';
        m.ink.push({f:1, x:o.x, y:o.y, c:o.c}); used += 50; fills++;
      }
      else if (o.a === 'pt'){
        const p = o.p;
        if (!Array.isArray(p) || !p.length || p.length % 2 || p.length > 400 || !p.every((v, i) => Number.isInteger(v) && v >= 0 && v <= (i % 2 ? 750 : 1000))) return 'Bad drawing data';
        if (used + p.length / 2 > CAP) return 'The page is full';
        if (o.n === m.ink.length){
          if (!okColour(o.c) || !SIZES.includes(o.w)) return 'Bad drawing data';
          m.ink.push({c:o.c, w:o.w, p:[...p]});
        } else if (o.n === m.ink.length - 1 && m.ink[o.n].p) m.ink[o.n].p.push(...p);
        else return 'Bad drawing data';
        used += p.length / 2;
      } else return 'Bad drawing data';
      m.inkq = o.q;
    }
  }
  function apply(s, pid, a){
    if (!a || typeof a !== 'object') return 'That move was not understood';
    const p = P(s, pid); if (!p) return 'You’re watching this game';
    if (s.phase !== 'play') return 'This game is over';
    const artist = artistOf(s);
    if (a.t === 'pick'){
      if (p !== artist) return 'It’s not your turn to draw';
      if (s.stage !== 'pick') return 'The word is already chosen';
      const w = s.choices?.[a.i]; if (w == null) return 'Pick one of the words';
      startDraw(s, w); trim(s); return;
    }
    if (a.t !== 'guess') return 'That move was not understood';
    if (s.stage !== 'draw') return s.stage === 'pick' ? 'Wait for the word to be chosen' : 'This turn is over';
    if (p === artist) return 'You’re drawing! Talk in the table chat';
    if (s.guessed[pid] != null) return 'You already got it';
    const raw = String(a.text || '').replace(/\s+/g, ' ').trim().slice(0, 40), g = norm(raw), w = norm(s.word);
    if (!g) return 'Type a guess';
    if (` ${g} `.includes(` ${w} `)){   // “an apple” counts for “apple”
      // Half for the time left, half for the order: the first to guess gets it all, the last a share.
      const left = Math.max(0, s.until - clock()) / (s.cfg.secs * 1000), before = Object.keys(s.guessed).length, n = Math.max(1, guessers(s).length);
      const pts = 5 * Math.round(Math.max(50, 250 * left + 250 * (1 - before / n)) * MULT[s.level] / 5);
      s.guessed[pid] = pts; s.gain[pid] = pts; s.totals[pid] = (s.totals[pid] || 0) + pts;
      log(s, `${p.name} guessed the word!`, 'right', {pid, pts});
      if (guessers(s).every(q => s.guessed[q.id] != null)) endTurn(s);
      trim(s); return;
    }
    log(s, `${p.name}: ${raw}`, 'g', {pid, g:raw});
    if (w.length >= 4 && near(g, w)) tell(s, [pid], `“${raw}” is close!`);
    trim(s);
  }
  const needs = s => s.phase === 'play' && s.stage !== 'reveal' ? [artistOf(s).id] : [];
  // The host runs this every half second: auto-pick, letter hints, time up, the next turn.
  function tick(s){
    if (s.phase !== 'play') return false;
    const t = clock(), artist = artistOf(s), gone = !!s.gone?.[artist.id];
    if (s.stage === 'pick' && gone){ log(s, `${artist.name}’s turn is skipped`, 'sys'); nextTurn(s); return true; }
    if (s.stage === 'pick' && t >= s.until){ startDraw(s, s.choices[0]); return true; }
    if (s.stage === 'draw'){
      if (t >= s.until || gone || !guessers(s).length){ endTurn(s); return true; }
      const idx = [...s.word].map((ch, i) => ch === ' ' ? -1 : i).filter(i => i >= 0 && !s.hint.includes(i));
      const frac = (t - s.start) / (s.cfg.secs * 1000), letters = s.word.replace(/ /g, '').length;
      const want = letters < 4 ? 0 : Math.min(letters - 2, frac >= .75 ? 2 : frac >= .5 ? 1 : 0);
      if (s.hint.length < want && idx.length){ s.hint.push(idx[Math.random() * idx.length | 0]); return true; }
      return false;
    }
    if (s.stage === 'reveal' && t >= s.until){ nextTurn(s); trim(s); return true; }
    return false;
  }
  const late = {unit:'points', why:'the lowest score at the table', score:s => Math.min(...s.players.map(p => s.totals[p.id] || 0))};

  /* ----- client: the drawing board ----- */
  const turnKey = s => s.gid + ':' + s.turnNo;
  const drawingNow = s => mode !== 'local' && s.phase === 'play' && s.stage === 'draw' && artistOf(s)?.id === me;
  let mine = null;                                          // the artist's own copy of this turn's drawing: {key, e, ink, inkv}
  let seen = {key:'', e:'', ink:[], inkv:0, inkq:0};        // everyone else's copy; e changes if the artist reloads mid-turn
  let batch = [], recent = [], nextq = 0, sealQ = 0, stroke = null, drawing = false, full = false;
  const inkDoc = pid => net.db?.doc(`tables/${G.code}-ink-${pid}`);
  // tool: brush, fill or eraser; c: a palette index or a colour from the wheel (h, s, l)
  const pen = {c:1, w:1, tool:'pen', h:200, s:80, l:50, hex:'#1a8fff', wheel:false};
  let kickArm = null, kickT = 0, palOpen = false, menu = false;   // phone: the colour pop-up and the ☰ menu   // the host's first tap on ✕ asks “Kick?”, the second calls the vote
  let draft = '', board = null, ring = null, ctx = null, painted = {key:'', v:-1, n:0, k:0}, wheelDrag = false;
  const model = () => mine && G && mine.key === turnKey(G) ? mine : seen;
  const used = m => m.ink.reduce((a, k) => a + (k.f ? 50 : k.p.length / 2), 0);
  const hsl = (h, s, l) => { s /= 100; l /= 100; const a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); };
  // Fill: everything joined to the tapped spot in (nearly) the same colour, grown by a pixel to cover soft edges.
  function flood(x, y, c){
    const W = 1000, H = 750, img = ctx.getImageData(0, 0, W, H), d = img.data;
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16), s0 = (y * W + x) * 4;
    const tr = d[s0], tg = d[s0 + 1], tb = d[s0 + 2];
    if (Math.abs(tr - r) + Math.abs(tg - g) + Math.abs(tb - b) < 6) return;
    const like = q => { const i = q * 4; return Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) <= 90; };
    const mark = new Uint8Array(W * H), stack = [y * W + x];
    mark[y * W + x] = 1;
    while (stack.length){
      const q = stack.pop(), qx = q % W;
      if (qx > 0 && !mark[q - 1] && like(q - 1)){ mark[q - 1] = 1; stack.push(q - 1); }
      if (qx < W - 1 && !mark[q + 1] && like(q + 1)){ mark[q + 1] = 1; stack.push(q + 1); }
      if (q >= W && !mark[q - W] && like(q - W)){ mark[q - W] = 1; stack.push(q - W); }
      if (q < W * (H - 1) && !mark[q + W] && like(q + W)){ mark[q + W] = 1; stack.push(q + W); }
    }
    const set = q => { const i = q * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; };
    for (let q = 0; q < W * H; q++){
      if (mark[q] !== 1) continue;
      set(q);
      for (const n of [q % W ? q - 1 : -1, (q + 1) % W ? q + 1 : -1, q - W, q + W]) if (n >= 0 && n < W * H && !mark[n]){ mark[n] = 2; set(n); }
    }
    ctx.putImageData(img, 0, 0);
  }
  // A new turn starts blank. The artist picks up their saved copy after a reload; anyone arriving mid-drawing fetches it.
  let checked = '';
  function sync(s){
    const key = turnKey(s);
    if (drawingNow(s)){
      if (mine?.key !== key){
        mine = {key, e:rid(6), ink:[], inkv:0}; nextq = sealQ = 0; batch = []; recent = [];
        inkDoc(me)?.get().then(sn => { const d = sn.exists && sn.data();
          if (d?.k === key && mine?.key === key && !nextq && Array.isArray(d.ink)){ mine.ink = d.ink; nextq = sealQ = d.q; mine.inkv++; saveInk(); paint(); } }).catch(() => {});
      }
    } else if (seen.key !== key){ seen = {key, e:'', ink:[], inkv:seen.inkv + 1, inkq:0}; if (s.stage !== 'pick') heal(); }
    if (mine?.key === key && s.stage !== 'draw' && inkDue) saveInk();   // time's up: save the finished picture now
    if (s.stage === 'reveal' && checked !== key){ checked = key; onPeers(); }   // missed the last strokes? the check fetches them
  }
  // Paint only what's new since last time; a different turn or an undo repaints the page.
  function paint(){
    if (!board || !G) return;
    const m = model(), key = (m === mine ? 'm' : 'v') + m.key;
    if (painted.key !== key || painted.v !== m.inkv || painted.n > m.ink.length){
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1000, 750); painted = {key, v:m.inkv, n:0, k:0};
    }
    ctx.lineCap = ctx.lineJoin = 'round';
    for (let n = painted.n; n < m.ink.length; n++){
      const st = m.ink[n];
      if (st.f){ flood(st.x, st.y, hex(st.c)); continue; }
      const p = st.p, from = n === painted.n ? painted.k : 0;
      ctx.strokeStyle = ctx.fillStyle = hex(st.c); ctx.lineWidth = st.w;
      if (p.length === 2){ if (!from){ ctx.beginPath(); ctx.arc(p[0], p[1], st.w / 2, 0, Math.PI * 2); ctx.fill(); } continue; }
      const i0 = Math.max(0, from - 2);
      ctx.beginPath(); ctx.moveTo(p[i0], p[i0 + 1]);
      for (let i = i0 + 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      ctx.stroke();
    }
    const last = m.ink.at(-1);
    if (last && !last.f){ painted.n = m.ink.length - 1; painted.k = last.p.length; } else { painted.n = m.ink.length; painted.k = 0; }
  }
  const at = e => { const r = board.getBoundingClientRect();
    return [Math.round(Math.min(1000, Math.max(0, (e.clientX - r.left) / r.width * 1000))), Math.round(Math.min(750, Math.max(0, (e.clientY - r.top) / r.height * 750)))]; };
  const brush = () => SIZES[pen.w];
  function makeBoard(){
    board = Object.assign(document.createElement('canvas'), {className:'sc-canvas', width:1000, height:750});
    ctx = board.getContext('2d', {willReadFrequently:true});
    ring = Object.assign(document.createElement('div'), {className:'sc-ring'});
    board.addEventListener('pointerdown', e => {
      if (!G || GID !== 'scribble' || !drawingNow(G) || clock() >= G.until || !mine) return;
      e.preventDefault();
      if (used(mine) >= CAP){ if (!full) toast('The page is full. Undo or clear to keep drawing'); full = true; return; }
      if (pen.tool === 'fill'){
        const [x, y] = at(e), fx = Math.min(999, x), fy = Math.min(749, y);
        if (mine.ink.filter(k => k.f).length >= FILLS) return toast('That’s the most fills for one drawing');
        mine.ink.push({f:1, x:fx, y:fy, c:pen.c}); batch.push({q:++nextq, a:'fill', x:fx, y:fy, c:pen.c});
        paint(); flush(); return;
      }
      board.setPointerCapture(e.pointerId); drawing = true;
      const [x, y] = at(e), c = pen.tool === 'erase' ? 0 : pen.c, w = brush();
      stroke = {c, w, p:[x, y]}; mine.ink.push(stroke);
      batch.push({q:++nextq, a:'pt', n:mine.ink.length - 1, c, w, p:[x, y]});
      paint();
    });
    board.addEventListener('pointermove', e => {
      if (ring && G && drawingNow(G) && e.pointerType === 'mouse' && pen.tool !== 'fill'){
        const r = board.getBoundingClientRect(), d = brush() * r.width / 1000;
        ring.style.cssText = `display:block;width:${d}px;height:${d}px;left:${e.clientX - r.left}px;top:${e.clientY - r.top}px;--rc:${pen.tool === 'erase' ? '#999' : hex(pen.c)}`;
      }
      if (!drawing || !stroke) return;
      for (const ev of e.getCoalescedEvents?.() || [e]){
        const [x, y] = at(ev), p = stroke.p;
        if (Math.hypot(x - p.at(-2), y - p.at(-1)) < 3) continue;
        if (used(mine) >= CAP) break;
        p.push(x, y);
        const last = batch.at(-1);
        if (last?.a === 'pt' && last.q > sealQ && last.n === mine.ink.length - 1 && last.p.length < 120) last.p.push(x, y);
        else batch.push({q:++nextq, a:'pt', n:mine.ink.length - 1, c:stroke.c, w:stroke.w, p:[x, y]});
      }
      paint();
    });
    const up = () => { if (!drawing) return; drawing = false; stroke = null; flush(); render(); };
    board.addEventListener('pointerup', up); board.addEventListener('pointercancel', up);
    board.addEventListener('pointerleave', () => { if (ring) ring.style.display = 'none'; });
  }
  // The artist sends the newest strokes in their presence, repeating the last ~1.5 KB so one missed update is
  // covered by the next, and saves the whole picture to their own copy on the server every 1.5 seconds.
  let inkDue = false, inkAt = 0;
  function flush(){
    if (!batch.length || !G || GID !== 'scribble' || !mine) return;
    recent.push(...batch); batch = []; inkDue = true;
    let keep = 0, size = 0;
    for (let i = recent.length - 1; i >= 0; i--){ size += JSON.stringify(recent[i]).length; if (size > 1200 && keep) break; keep++; }
    recent = recent.slice(-keep);
    net.room?.presence({ink:{k:mine.key, e:mine.e, ops:recent}}).catch(() => {});
  }
  function saveInk(){
    if (!mine || !G?.code) return;
    inkDue = false; inkAt = Date.now(); sealQ = nextq;   // later points start a new step, so the saved copy never changes under it
    inkDoc(me)?.set({k:mine.key, e:mine.e, q:nextq, ink:mine.ink}).catch(e => { inkDue = true; noteErr(`saving the drawing: ${e?.code || e}`); });
  }
  setInterval(() => { flush(); if (inkDue && Date.now() - inkAt > 1500) saveInk(); }, 100);
  // Everyone else: take the artist's newest strokes; on a gap, fetch the saved copy and carry on from it.
  const artistInk = () => { const a = G && artistOf(G); return a && net.room?.peers().find(p => p.presence?.pid === a.id)?.presence?.ink; };
  let liveAt = 0;
  function onPeers(){
    const s = G; if (!s || GID !== 'scribble' || s.phase !== 'play' || !net.room) return;
    const a = artistOf(s); if (!a || a.id === me) return;
    const ink = artistInk();
    if (!ink || ink.k !== turnKey(s) || !Array.isArray(ink.ops)) return;
    if (seen.key !== ink.k) sync(s);
    if (seen.e !== ink.e){ if (seen.e) seen = {key:ink.k, e:ink.e, ink:[], inkv:seen.inkv + 1, inkq:0}; else seen.e = ink.e; }
    seen.gap = inkApply(seen, ink.ops) === 'gap';
    liveAt = Date.now();
    if (seen.gap) heal();
    paint();
  }
  // Safety net: drawing in progress but no live strokes for 5 seconds (a bad connection, an update too big to send):
  // fetch the saved copy every few seconds instead.
  setInterval(() => {
    const s = G; if (!s || GID !== 'scribble' || s.phase !== 'play' || s.stage !== 'draw' || screen !== 'game') return;
    if (artistOf(s)?.id !== me && Date.now() - Math.max(liveAt, s.start - (typeof skew === 'number' ? skew : 0)) > 5000) heal();
  }, 2500);
  // For bug reports: where this screen's copy of the drawing stands.
  const debug = () => ({turn:G && turnKey(G), stage:G?.stage, seen:{key:seen.key, e:seen.e, q:seen.inkq, items:seen.ink.length, gap:!!seen.gap},
    mine:mine && {key:mine.key, e:mine.e, q:nextq, items:mine.ink.length}, live:artistInk() && {k:artistInk().k, e:artistInk().e, ops:artistInk().ops?.length}, liveAgo:liveAt && Date.now() - liveAt});
  // Fetch the artist's saved copy: one request at a time, at most once a second, retrying a few times if it's a moment behind.
  let healing = false, healT = 0, healTimer = 0, tries = {key:'', n:0};
  function heal(){
    const s = G, a = s && artistOf(s);
    if (!a || a.id === me || !net.db || GID !== 'scribble') return;
    if (healing || Date.now() - healT < 1000){ healTimer ||= setTimeout(() => { healTimer = 0; heal(); }, 1000); return; }
    healing = true; healT = Date.now();
    const key = turnKey(s);
    if (tries.key !== key) tries = {key, n:0};
    inkDoc(a.id).get().then(sn => {
      const d = sn.exists && sn.data();
      if (seen.key !== key) return;
      if (d && d.k === key && Array.isArray(d.ink) && (!seen.e || d.e === seen.e) && (!seen.e || d.q > seen.inkq)){
        seen = {key, e:d.e, ink:d.ink, inkv:seen.inkv + 1, inkq:d.q};
        const ink = artistInk();
        seen.gap = ink?.k === key && ink.e === d.e && inkApply(seen, ink.ops) === 'gap';
        paint();
        if (!seen.gap){ tries.n = 0; return; }
      }
      if (seen.gap && ++tries.n < 6) setTimeout(heal, 1500);   // the saved copy is a moment behind the strokes we've seen: try again
    }).catch(() => {}).finally(() => { healing = false; });
  }
  // After each render: put the board back in place, size it to the page, and catch it up.
  function motion(s){
    sync(s);
    const slot = app.querySelector('.sc-slot');
    if (slot){
      if (!board) makeBoard();
      if (board.parentElement !== slot) slot.append(board, ring);
      board.classList.toggle('can', drawingNow(s)); board.classList.toggle('fill', pen.tool === 'fill');
      paint();
    }
    const feed = app.querySelector('.sc-feed'); if (feed) feed.scrollTop = feed.scrollHeight;
  }
  // The clock ring counts down between renders.
  setInterval(() => {
    if (GID !== 'scribble' || screen !== 'game' || !G?.until || G.phase !== 'play') return;
    const el = app.querySelector('.sc-time'); if (!el) return;
    const total = G.stage === 'draw' ? G.cfg.secs * 1000 : G.stage === 'pick' ? PICK : SHOW, left = Math.max(0, G.until - clock()), sec = Math.ceil(left / 1000);
    el.style.setProperty('--t', (left / total).toFixed(3));
    if (el.dataset.s !== String(sec)){ el.dataset.s = sec; el.querySelector('b').textContent = sec; el.classList.toggle('low', G.stage === 'draw' && sec <= 10); }
  }, 200);

  /* ----- client: screens ----- */
  const doodle = `<svg viewBox="0 0 200 150" class="sc-doodle" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="160" cy="34" r="16" stroke="#fdd835" stroke-width="6"/><path d="M160 8v-6M160 66v-6M134 34h-6M192 34h-6M142 16l-4-4M182 56l-4-4M178 16l4-4M138 52l4-4" stroke="#fdd835" stroke-width="4"/>
    <path d="M40 120V78l34-28 34 28v42z" stroke="#e53935" stroke-width="6"/><path d="M62 120V96h22v24" stroke="#1e88e5" stroke-width="5"/>
    <path d="M128 120c0-30 4-46 6-56M134 64c-14-4-22 6-20 14 10 2 18-4 20-14zm0 0c10-10 24-6 24 4-10 6-20 4-24-4z" stroke="#2e7d32" stroke-width="5"/>
    <path d="M10 124c40-6 140-6 184 0" stroke="#8d6e63" stroke-width="5"/></svg>`;
  const art = () => `<div class="sc-art"><div class="sc-artpaper">${doodle}<div class="sc-artword">${'<span></span>'.repeat(5)}</div></div><div class="sc-artpencil"></div></div>`;
  const rules = () => sheet(`<div class="eyebrow">How to play</div><h2>Scribble rules</h2><ul class="rules">
      <li><b>Turns</b><span>Each turn one player is the artist. They pick one of three words and draw it. No letters or numbers in the drawing!</span></li>
      <li><b>Guessing</b><span>Everyone else types guesses. Wrong guesses show up in the feed; type something one letter off and you’ll hear it’s close.</span></li>
      <li><b>Scoring</b><span>A right guess earns up to 500: half for the time left, half for how many got it before you, so the first to guess scores the most. The artist scores for the share of players who guess (up to 150), plus 25 when everyone gets it, and nothing if nobody does.</span></li>
      <li><b>Hard words</b><span>The artist picks an Easy, Medium or Hard word. Medium words are worth 15% more for everyone, Hard words 30% more.</span></li>
      <li><b>Tools</b><span>Brush, fill bucket and eraser, four brush sizes, sixteen colours and a colour wheel for any other colour, plus undo and clear.</span></li>
      <li><b>Hints</b><span>As the clock runs down, letters of the word are revealed.</span></li>
      <li><b>Rounds</b><span>Everyone draws once a round. The host picks how many rounds and how long each drawing lasts. Most points at the end wins.</span></li>
    </ul><div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);
  function home(){
    return `<div class="home">
      <button class="btn small backlink" data-do="hub">← All games</button>
      <section class="hero">
        <div>
          <div class="eyebrow">Draw it, guess it</div>
          <h1>Scrib<em>ble</em></h1>
          <p>One player draws a secret word live on everyone’s screen, the rest race to guess it. Quick guesses score big, and the artist scores for every right guess.</p>
          <div class="facts"><span class="fact"><b>2–12</b> players</span><span class="fact"><b>${WORDS.length}</b> words, easy to hard</span><span class="fact">Everyone on their <b>own phone</b></span></div>
        </div>
        <div class="fan" aria-hidden="true">${art()}</div>
      </section>
      <section class="panels">
        <div class="panel">
          <div class="eyebrow">Online</div><h2>Play with friends</h2>
          <div class="field"><label for="nm">Your name</label><input id="nm" data-f="name" value="${esc(form.name)}" maxlength="18" placeholder="e.g. Priya" autocomplete="nickname"></div>
          ${net.ready ? `<button class="btn gold" data-do="host">Host a new table</button>
          <div class="field"><label for="cd">Or join with a code</label><div class="row"><input id="cd" class="grow code-in" data-f="code" value="${esc(form.code)}" maxlength="5" placeholder="ABCDE" autocomplete="off"><button class="btn" data-do="join">Join</button></div></div>`
          : '<p class="note">Can’t reach the game server right now, so Scribble can’t start. It needs everyone online.</p>'}
        </div>
        <div class="panel">
          <div class="eyebrow">New here?</div><h2>How it works</h2>
          <p>Everyone joins with the table code on their own phone or computer. The artist draws with a finger or mouse; everyone else types guesses.</p>
          <button class="btn" data-do="rules">Read the rules</button>
        </div>
      </section>
    </div>`;
  }
  const PENCIL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21l3.5-1 11-11-2.5-2.5-11 11zM14 5.5l2.5-2.5 4.5 4.5-2.5 2.5" fill="currentColor"/></svg>';
  const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = {pen:PENCIL, fill:svg('<path d="M5 11l7-7 7 7-7 7z"/><path d="M5 11h14"/><path d="M20 15s2 2.5 2 4a2 2 0 0 1-4 0c0-1.5 2-4 2-4z" fill="currentColor"/>'),
    erase:svg('<path d="M7 20h13M4 15l9-9 6 6-7 7H8z"/><path d="M9 10l6 6"/>'), undo:svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
    clear:svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>')};
  function view(s){
    const a = artistOf(s), meP = P(s, me), mineTurn = a?.id === me && mode !== 'local', over = s.phase === 'over';
    const got = s.guessed?.[me] != null, show = mineTurn || got || s.stage === 'reveal' || over;
    const letters = s.word ? s.word.replace(/ /g, '').length : 0;
    let ci = 0;   // each letter’s place in the whole word, for hints
    const word = s.word ? s.word.split(' ').map(wd => { const html = [...wd].map(ch => { const i = ci++; return show || s.hint.includes(i) ? `<span class="on">${esc(ch)}</span>` : '<span></span>'; }).join(''); ci++;
      return `<span class="sc-w">${html}<sup>${wd.length}</sup></span>`; }).join('') : '';
    const top = over ? '<b class="sc-say">Game over</b>' : s.stage === 'pick' ? `<b class="sc-say">${mineTurn ? 'Pick a word to draw' : `${esc(a.name)} is choosing a word…`}</b>`
      : `<div class="sc-word ${show ? 'open' : ''}" aria-label="${show ? esc(s.word) : `${letters} letters`}">${word}</div><small><i class="sc-lvl l${s.level}">${LEVELS[s.level]}</i> ${mineTurn ? 'Draw this!' : got ? 'You got it!' : `${letters} letters${s.word.includes(' ') ? ` in ${s.word.split(' ').length} words` : ''}`}</small>`;
    const ranked = [...s.players].sort((x, y) => (s.totals[y.id] || 0) - (s.totals[x.id] || 0));
    const players = ranked.map((p, i) => `<div class="sc-p ${p === a && !over ? 'draws' : ''} ${s.guessed?.[p.id] != null ? 'got' : ''} ${s.gone?.[p.id] ? 'gone' : ''}" data-pid="${esc(p.id)}">
        <span class="sc-rank">#${i + 1}</span>${avatar(s, p)}<div><b>${esc(p.name)}${p.id === me ? ' (you)' : ''}</b><small>${s.totals[p.id] || 0} pts</small></div>
        ${p === a && !over ? `<span class="sc-tag pen">${PENCIL}</span>` : s.guessed?.[p.id] != null ? '<span class="sc-tag ok">✓</span>' : ''}
        ${mode === 'host' && p.id !== me && !over && !s.gone?.[p.id] && !s.vote ? `<button class="sc-kick ${kickArm === p.id ? 'armed' : ''}" data-do="sckick" data-id="${esc(p.id)}" aria-label="Vote to kick ${esc(p.name)}">${kickArm === p.id ? 'Kick?' : '✕'}</button>` : ''}
        ${s.gone?.[p.id] ? '<span class="sc-tag out">Out</span>' : ''}</div>`).join('');
    // What sits on top of the paper: the word choice, the wait, the reveal, or the final podium
    let over$ = '';
    if (over){
      const pod = ranked.slice(0, 3), order = [pod[1], pod[0], pod[2]].filter(Boolean);
      over$ = `<div class="sc-over"><div class="sc-podium">${order.map(p => { const r = pod.indexOf(p); return `<div class="pl r${r + 1}">${avatar(s, p)}<b>${esc(p.name)}</b><small>${s.totals[p.id] || 0} pts</small><div class="step">${['🥇', '🥈', '🥉'][r]}</div></div>`; }).join('')}</div>
        ${mode === 'host' ? '<button class="btn gold" data-do="scnew">New game</button>' : '<p class="muted">The host can start a new game.</p>'}</div>`;
    } else if (s.stage === 'pick') over$ = mineTurn ? `<div class="sc-cover"><div class="sc-pick">${s.choices.map((w, i) => { const l = LEVEL[w] ?? 1; return `<button class="sc-wc l${l}" style="--i:${i}" data-do="scpick" data-i="${i}">${esc(w)}<small>${LEVELS[l]}${l ? ` · +${Math.round((MULT[l] - 1) * 100)}% points` : ''}</small></button>`; }).join('')}</div><small>Pick one. The others won’t see it. Harder words score more.</small></div>`
      : `<div class="sc-cover wait"><div class="sc-wiggle">${PENCIL}</div><b>${esc(a.name)} is picking a word</b></div>`;
    else if (s.stage === 'reveal'){
      const gains = s.players.filter(p => s.gain[p.id]).sort((x, y) => s.gain[y.id] - s.gain[x.id]);
      over$ = `<div class="sc-cover reveal"><small>The word was</small><div class="sc-big">${[...s.word].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('')}</div>
        <div class="sc-gains">${gains.length ? gains.map(p => `<span>${esc(p.name)} <b>+${s.gain[p.id]}</b></span>`).join('') : '<span>Nobody guessed it</span>'}</div></div>`;
    }
    const tool = (t, label, icon) => `<button class="${pen.tool === t ? 'on' : ''}" data-do="sctool" data-t="${t}" aria-pressed="${pen.tool === t}">${icon}<span>${label}</span></button>`;
    const curHex = pen.tool === 'erase' ? '#ffffff' : hex(pen.c);
    const tools = s.stage === 'draw' && mineTurn && !over ? `<div class="sc-tools">
        <button class="sc-cur" data-do="scpal" style="--c:${curHex}" aria-label="Colours" aria-expanded="${palOpen}"></button>
        <div class="sc-pal ${palOpen ? 'open' : ''}">${PAL.map((c, i) => `<button class="sw ${pen.tool !== 'erase' && pen.c === i ? 'on' : ''}" style="--c:${c}" data-do="sccolor" data-c="${i}" aria-label="Colour ${i + 1}"></button>`).join('')}
          <button class="sw any ${pen.tool !== 'erase' && pen.c === pen.hex ? 'on' : ''}" style="--c:${pen.hex}" data-do="scwheel" aria-label="Any colour" aria-expanded="${pen.wheel}"></button></div>
        <div class="sc-sizes">${SIZES.map((w, i) => `<button class="${pen.w === i ? 'on' : ''}" data-do="scsize" data-w="${i}" aria-label="Brush size ${i + 1}"><i style="--d:${Math.max(4, w * .7)}px"></i></button>`).join('')}</div>
        <button class="sc-size1" data-do="scsizenext" aria-label="Brush size ${pen.w + 1} of ${SIZES.length}"><i style="--d:${Math.max(5, SIZES[pen.w] * .7)}px;--c:${curHex}"></i></button>
        <div class="sc-acts">${tool('pen', 'Brush', ICON.pen)}${tool('fill', 'Fill', ICON.fill)}${tool('erase', 'Eraser', ICON.erase)}
          <button data-do="scundo">${ICON.undo}<span>Undo</span></button><button data-do="scclear">${ICON.clear}<span>Clear</span></button></div>
        ${pen.wheel ? `<div class="sc-wheelbox"><div class="sc-wheel" style="--l:${pen.l}"><i style="--x:${50 + 50 * pen.s / 100 * Math.sin(pen.h * Math.PI / 180)}%;--y:${50 - 50 * pen.s / 100 * Math.cos(pen.h * Math.PI / 180)}%"></i></div>
          <div class="sc-wside"><span class="sc-wprev" style="--c:${pen.hex}"></span><label>Light<input type="range" id="sc-light" min="8" max="92" value="${pen.l}" aria-label="Lightness"></label><button class="btn small gold" data-do="scwheel">Done</button></div></div>` : ''}</div>` : '';
    const feed = s.log.filter(e => ['g', 'right', 'turn', 'big', 'win', 'sys'].includes(e.kind)).slice(-40).map(e =>
      e.kind === 'g' ? `<li><b style="color:${seatColor(s, e.pid)}">${esc(P(s, e.pid)?.name || '')}</b> ${esc(e.g)}</li>`
      : e.kind === 'right' ? `<li class="ok"><b>${esc(P(s, e.pid)?.name || '')}</b> guessed it! <span>+${e.pts}</span></li>`
      : `<li class="sys">${esc(e.text)}</li>`).join('');
    const box = !meP ? '<p class="sc-note">You’re watching this game.</p>' : over ? '' : s.gone?.[me] ? '<p class="sc-note">You were voted out of this game.</p>' : mineTurn ? '<p class="sc-note">You’re the artist. Talk in the table chat 💬</p>'
      : got ? `<p class="sc-note ok">You got it! +${s.guessed[me]}</p>` : s.stage !== 'draw' ? '<p class="sc-note">Guess when the drawing starts</p>'
      : `<div class="sc-guess"><label class="sc-inwrap"><input id="sc-in" maxlength="40" placeholder="Type your guess…" autocomplete="off" autocapitalize="off" value="${esc(draft)}" aria-label="Your guess"><span class="sc-count ${count(draft) === letters ? 'match' : ''}" data-n="${letters}" aria-live="polite">${count(draft)}/${letters}</span></label><button class="btn gold" data-do="scguess">Guess</button></div>`;
    return `<div class="game sc-room"><div class="main">
      <header class="top">
        <div class="brand">Scrib<em>ble</em></div>
        <span class="sync">Round ${Math.min(s.lap, s.cfg.rounds)} of ${s.cfg.rounds}</span>
        <div class="tools">${s.code ? `<span class="codechip">${esc(s.code)}</span>` : ''}<button class="tool sc-menu" data-do="scmenu" aria-label="Menu">☰</button><button class="tool" data-do="rules">Rules</button><button class="tool" data-do="mute">${muted ? 'Sound off' : 'Sound on'}</button><button class="tool" data-do="leave">Leave</button></div>
      </header>
      <div class="sc-grid">
        <aside class="sc-players">${players}</aside>
        <section class="sc-stage">
          <div class="sc-head">${over ? '' : `<div class="sc-time" aria-hidden="true"><b>${Math.max(0, Math.ceil((s.until - clock()) / 1000))}</b></div>`}<div class="sc-mid">${top}</div></div>
          <div class="sc-paper ${s.stage === 'draw' && mineTurn ? 'live' : ''}"><div class="sc-slot"></div>${over$}</div>
          ${tools}
        </section>
        <aside class="sc-chat"><ol class="sc-feed">${feed}</ol>${box}</aside>
      </div>
    </div></div>${ui.modal === 'rules' ? rules() : ''}${menu ? sheet(`<div class="eyebrow">Scribble</div><h2>Menu</h2><div class="sc-mlist">
        <button class="btn" data-do="scm" data-a="rules">How to play</button>
        <button class="btn" data-do="scm" data-a="mute">${muted ? 'Turn sound on' : 'Turn sound off'}</button>
        ${mode === 'host' && s.phase === 'play' ? '<button class="btn" data-do="scm" data-a="players">Kick a player (vote)</button>' : ''}
        <button class="btn" data-do="scm" data-a="bugopen">🐞 Report a bug</button>
        <button class="btn danger" data-do="scm" data-a="leave">Leave the game</button></div>
        <div class="acts"><button class="btn gold" data-do="scm">Close</button></div>`) : ''}`;
  }
  // A right guess: “+120” rises from that player’s row.
  function onEvents(fresh){
    for (const e of fresh) if (e.kind === 'right'){
      sfx('coin');
      const row = app.querySelector(`.sc-p[data-pid="${CSS.escape(e.pid)}"]`); if (!row) continue;
      const r = row.getBoundingClientRect(), f = Object.assign(document.createElement('div'), {className:'sc-float', textContent:`+${e.pts}`});
      f.style.cssText = `left:${r.right - 30}px;top:${r.top + r.height / 2}px`; document.body.append(f); setTimeout(() => f.remove(), 1300);
    }
  }

  const count = t => t.replace(/[^\p{L}\p{N}]/gu, '').length;   // letters typed, spaces and marks aside
  app.addEventListener('input', e => {
    if (e.target.id === 'sc-in'){
      draft = e.target.value;
      const c = app.querySelector('.sc-count'); if (c){ const n = count(draft); c.textContent = `${n}/${c.dataset.n}`; c.classList.toggle('match', n === +c.dataset.n); }
    }
    if (e.target.id === 'sc-light'){ pen.l = +e.target.value; pickColour(); }
  });
  // The colour wheel: the angle is the hue, the distance from the middle is how strong it is; the slider sets light or dark.
  function pickColour(){
    pen.hex = hsl(pen.h, pen.s, pen.l); pen.c = pen.hex; if (pen.tool === 'erase') pen.tool = 'pen';
    const w = app.querySelector('.sc-wheel'), dot = w?.querySelector('i');
    w?.style.setProperty('--l', pen.l);
    dot?.style.setProperty('--x', `${50 + 50 * pen.s / 100 * Math.sin(pen.h * Math.PI / 180)}%`); dot?.style.setProperty('--y', `${50 - 50 * pen.s / 100 * Math.cos(pen.h * Math.PI / 180)}%`);
    app.querySelector('.sc-wprev')?.style.setProperty('--c', pen.hex);
    const any = app.querySelector('.sw.any'); any?.style.setProperty('--c', pen.hex);
    app.querySelectorAll('.sc-pal .sw').forEach(b => b.classList.toggle('on', b === any));
  }
  const wheelAt = (w, e) => { const r = w.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    pen.h = Math.round((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360); pen.s = Math.round(Math.min(1, Math.hypot(dx, dy) / (r.width / 2)) * 100); pickColour(); };
  app.addEventListener('pointerdown', e => { const w = e.target.closest?.('.sc-wheel'); if (!w) return; e.preventDefault(); w.setPointerCapture(e.pointerId); wheelDrag = true; wheelAt(w, e); });
  app.addEventListener('pointermove', e => { if (wheelDrag){ const w = app.querySelector('.sc-wheel'); if (w) wheelAt(w, e); } });
  app.addEventListener('pointerup', () => { if (wheelDrag){ wheelDrag = false; render(); } });
  app.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'sc-in'){ e.preventDefault(); H.scguess(); } });
  const edit = op => { if (!mine || !G || !drawingNow(G)) return; op(); mine.inkv++; full = false; flush(); paint(); };
  Object.assign(H, {
    scpick:d => send({t:'pick', i:+d.i}, true),
    scguess:() => { const t = draft.trim(); if (!t) return; draft = ''; send({t:'guess', text:t}, true); },
    sccolor:d => { pen.c = +d.c; palOpen = false; if (pen.tool === 'erase') pen.tool = 'pen'; render(); },
    scpal:() => { palOpen = !palOpen; pen.wheel = false; render(); },
    scsizenext:() => { pen.w = (pen.w + 1) % SIZES.length; render(); },
    scmenu:() => { menu = true; render(); },
    scm:d => { menu = false; if (d.a) H[d.a](d); else render(); },
    sctool:d => { pen.tool = d.t; render(); },
    scwheel:() => { pen.wheel = !pen.wheel; palOpen = false; if (pen.wheel) pickColour(); render(); },
    scsize:d => { pen.w = +d.w; render(); },
    scundo:() => edit(() => { if (mine.ink.length){ mine.ink.pop(); batch.push({q:++nextq, a:'undo'}); } }),
    scclear:() => edit(() => { mine.ink = []; batch.push({q:++nextq, a:'clear'}); }),
    scnew:() => { G = {...G, totals:{}, round:0}; rematch(); },
    sckick:d => {
      if (kickArm !== d.id){ kickArm = d.id; clearTimeout(kickT); kickT = setTimeout(() => { kickArm = null; render(); }, 3000); return render(); }
      kickArm = null; H.votecall({id:d.id});
    },
  });

  return {name:'Scribble', min:2, max:12, cfg, late, newGame, apply, needs, tick, home, view, rules, art, motion, onPeers, onEvents,
    busy:() => drawing || wheelDrag, debug, inkApply, near, norm, WORDS, EASY, MEDIUM, HARD, LEVEL, MULT, CAP, PICK, SHOW, FILLS,
    lobby:(s, host) => host
      ? `<div class="row"><label class="muted" for="scr">Rounds</label>${capInput('scr', 'rounds', s.cfg?.rounds ?? cfg.rounds, [2, 3, 4, 5], 1, 10)}<label class="muted" for="scs">Seconds to draw</label>${capInput('scs', 'secs', s.cfg?.secs ?? cfg.secs, [60, 80, 100, 120], 30, 240)}</div>`
      : `<p class="muted">${s.cfg?.rounds ?? cfg.rounds} rounds · ${s.cfg?.secs ?? cfg.secs} seconds to draw</p>`};
})();
ENG.scribble = SC;
