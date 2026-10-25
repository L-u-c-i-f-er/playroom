/* =====================================================================
   BINGO — the 5×5 number game. Everyone fills a grid with 1 to 25 in any
   order. Players then take turns calling a number; every grid crosses it
   off. Each finished row, column or diagonal lights a letter of B-I-N-G-O,
   and the first to five lines shouts Bingo. Ties on the same call share it.
   ===================================================================== */
const BINGO = (() => {
  const LINES = [...[0, 1, 2, 3, 4].map(r => [0, 1, 2, 3, 4].map(c => r * 5 + c)), ...[0, 1, 2, 3, 4].map(c => [0, 1, 2, 3, 4].map(r => r * 5 + c)),
    [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]];
  const WORD = 'BINGO';

  function newGame(seats, extra = {}){
    const totals = {...(extra.totals || {})}, round = (extra.round || 0) + 1;
    const s = {...extra, cfg:{...(extra.cfg || {})}, totals, round, phase:'play', stage:'fill', gid:rid(8), ack:extra.ack || {}, log:[], ln:0,
      players:seats.map(p => ({id:p.id, name:p.name, grid:null, lines:0})), called:[], turn:0, winners:[]};
    log(s, `Round ${round}. Fill your grid with 1 to 25`, 'turn');
    return s;
  }
  const done = (grid, called) => LINES.filter(l => l.every(i => called.includes(grid[i])));
  const okGrid = g => Array.isArray(g) && g.length === 25 && [...g].sort((a, b) => a - b).every((v, i) => v === i + 1);
  function apply(s, pid, a){
    if (!a || typeof a !== 'object') return 'That move was not understood';
    const p = P(s, pid); if (!p) return 'You’re watching this game';
    if (s.phase !== 'play') return 'This round is over';
    if (a.t === 'grid'){
      if (s.stage !== 'fill') return 'The calling has started';
      if (p.grid) return 'Your grid is locked in';
      if (!okGrid(a.grid)) return 'Use every number from 1 to 25 once';
      p.grid = a.grid.map(Number);
      log(s, `${p.name} is ready`);
      if (s.players.every(q => q.grid)){
        s.stage = 'call'; s.turn = (s.round - 1) % s.players.length;
        log(s, `All grids are in. ${s.players[s.turn].name} calls first`, 'turn');
      }
      return;
    }
    if (a.t !== 'call') return 'That move was not understood';
    if (s.stage !== 'call') return 'Wait for everyone to fill their grid';
    if (s.players[s.turn] !== p) return 'It’s not your turn to call';
    const n = a.n;
    if (!Number.isInteger(n) || n < 1 || n > 25) return 'Pick a number from your grid';
    if (s.called.includes(n)) return `${n} has been called already`;
    s.called.push(n);
    log(s, `${p.name} called ${n}`, 'call');
    for (const q of s.players){
      const was = q.lines; q.lines = done(q.grid, s.called).length;
      if (q.lines > was && q.lines < 5) log(s, `${q.name} has ${WORD.slice(0, q.lines)}`);
    }
    const win = s.players.filter(q => q.lines >= 5);
    if (win.length){
      s.winners = win.map(q => q.id); s.phase = 'over';
      win.forEach(q => { s.totals[q.id] = (s.totals[q.id] || 0) + 1; });
      const names = win.map(q => q.name).join(' and ');
      log(s, `${names} ${win.length > 1 ? 'share' : 'gets'} BINGO`, 'win', {title:'BINGO!', sub:names});
      return;
    }
    s.turn = (s.turn + 1) % s.players.length;
  }
  const needs = s => s.phase !== 'play' ? [] : s.stage === 'fill' ? s.players.filter(p => !p.grid).map(p => p.id) : [s.players[s.turn].id];
  const shuffled = () => shuffle(Array.from({length:25}, (_, i) => i + 1));
  // Out of time: a shuffled grid, or a call that finishes most of your own lines.
  function timeout(s, pid){
    if (s.stage === 'fill') return {t:'grid', grid:shuffled()};
    const g = P(s, pid).grid, left = g.filter(n => !s.called.includes(n));
    const gain = n => done(g, [...s.called, n]).length;
    return {t:'call', n:left.sort((a, b) => gain(b) - gain(a))[0]};
  }

  /* ----- client ----- */
  const word = (lines, cls = '') => `<div class="bg-word ${cls}">${[...WORD].map((L, i) => `<span class="${i < lines ? 'on' : ''}">${L}</span>`).join('')}</div>`;
  function grid(g, called, o = {}){
    const lit = new Set(done(g, called).flat()), last = called.at(-1);
    return `<div class="bg-grid ${o.cls || ''}">${g.map((n, i) => {
      const hit = n != null && called.includes(n), can = o.call && n != null && !hit;
      const tag = can ? 'button' : 'div';
      return `<${tag} class="bc ${n == null ? 'empty' : ''} ${hit ? 'hit' : ''} ${lit.has(i) ? 'lit' : ''} ${n === last && hit ? 'last' : ''}" ${can ? `data-do="bcall" data-n="${n}" aria-label="Call ${n}"` : o.fill && n == null ? `data-do="bput" data-i="${i}" role="button" tabindex="0" aria-label="Put the next number here"` : ''}><span>${n ?? ''}</span></${tag}>`;
    }).join('')}</div>`;
  }
  function art(){
    const g = [7, 19, 2, 24, 11, 15, 1, 22, 9, 5, 3, 13, 25, 17, 8, 20, 10, 6, 14, 23, 12, 18, 4, 21, 16];
    return `<div class="bg-art">${word(3)}${grid(g, [7, 19, 2, 24, 11, 1, 25, 14, 21, 15, 3, 20, 12])}</div>`;
  }
  const rules = () => sheet(`<div class="eyebrow">How to play</div><h2>Bingo rules</h2><ul class="rules">
      <li><b>Your grid</b><span>Fill the 25 squares with the numbers 1 to 25, in any order you like. Tap squares in order, or shuffle. Nobody else sees it.</span></li>
      <li><b>Calling</b><span>Players take turns calling one number that hasn’t been called. Every grid crosses it off.</span></li>
      <li><b>Lines</b><span>Each complete row, column or diagonal (12 in all) lights the next letter of B-I-N-G-O.</span></li>
      <li><b>Winning</b><span>The first to five lines gets BINGO. If two players reach five on the same call, they share the round.</span></li>
      <li><b>Tip</b><span>On your turn, call a number that helps your own lines most, and watch which numbers others call.</span></li>
    </ul><div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);
  function home(){
    const saved = store.get('bingo-local');
    while (form.locals.length < 2) form.locals.push('');
    const locals = form.locals.map((n, i) => `<div class="row"><input class="grow" id="bp${i}" data-local="${i}" value="${esc(n)}" placeholder="Player ${i + 1}" maxlength="18" aria-label="Player ${i + 1} name">${form.locals.length > 2 ? `<button class="tool" data-do="lrem" data-i="${i}">Remove</button>` : ''}</div>`).join('');
    return `<div class="home">
      <button class="btn small backlink" data-do="hub">← All games</button>
      <section class="hero">
        <div>
          <div class="eyebrow">Five lines wins</div>
          <h1>B<em>I</em>NGO</h1>
          <p>The 5×5 number game from the back of every notebook. Fill your grid, take turns calling, and be first to light up B-I-N-G-O.</p>
          <div class="facts"><span class="fact"><b>2–8</b> players</span><span class="fact">Numbers <b>1–25</b></span><span class="fact"><b>5</b> lines to win</span></div>
        </div>
        <div class="fan" aria-hidden="true">${art()}</div>
      </section>
      <section class="panels">
        <div class="panel">
          <div class="eyebrow">Online</div><h2>Play with friends</h2>
          <div class="field"><label for="nm">Your name</label><input id="nm" data-f="name" value="${esc(form.name)}" maxlength="18" placeholder="e.g. Priya" autocomplete="nickname"></div>
          ${net.ready ? `<button class="btn gold" data-do="host">Host a new table</button>
          <div class="field"><label for="cd">Or join with a code</label><div class="row"><input id="cd" class="grow code-in" data-f="code" value="${esc(form.code)}" maxlength="5" placeholder="ABCDE" autocomplete="off"><button class="btn" data-do="join">Join</button></div></div>`
          : '<p class="note">Can’t reach the game server right now, so online play is off. Pass & play still works.</p>'}
        </div>
        <div class="panel">
          <div class="eyebrow">One device</div><h2>Pass &amp; play</h2>
          <p>Each grid stays hidden behind a pass screen.</p>
          <div class="names">${locals}</div>
          <div class="row">${form.locals.length < 8 ? '<button class="btn small" data-do="ladd8">Add player</button>' : ''}<button class="btn gold" data-do="blocal" style="margin-left:auto">Start game</button></div>
          ${saved?.phase === 'play' ? `<button class="btn small" data-do="bresume">Resume saved game (${saved.players.map(p => esc(p.name)).join(', ')})</button>` : ''}
        </div>
        <div class="panel">
          <div class="eyebrow">New here?</div><h2>How it works</h2>
          <p>Fill 1–25 anywhere on your grid. Call numbers in turn. Five complete lines and you’ve got BINGO.</p>
          <button class="btn" data-do="rules">Read the rules</button>
        </div>
      </section>
    </div>`;
  }
  function view(s){
    const meP = P(s, me), cur = s.players[s.turn], myCall = s.phase === 'play' && s.stage === 'call' && cur?.id === me;
    const wait = needs(s), last = s.called.at(-1);
    let big, hint = '';
    if (s.phase === 'over') big = `BINGO! ${s.winners.map(id => esc(P(s, id).name)).join(' & ')}`;
    else if (s.stage === 'fill'){ big = meP && !meP.grid ? 'Fill your grid' : 'Waiting for grids'; hint = meP && !meP.grid ? 'Tap squares in order to place 1, 2, 3… or shuffle.' : `Still filling: ${wait.map(id => esc(P(s, id).name)).join(', ')}`; }
    else if (myCall){ big = 'Your call'; hint = 'Tap a number on your grid that hasn’t been called.'; }
    else { big = `${esc(cur.name)} is calling`; hint = `${25 - s.called.length} numbers left`; }
    let mine = '';
    if (meP && s.stage === 'fill' && !meP.grid){
      const f = (ui.bfill || []).length === 25 ? ui.bfill : Array(25).fill(null), next = f.filter(v => v != null).length + 1;
      mine = `<div class="bg-me">${grid(f, [], {fill:true, cls:'filling'})}
        <div class="bg-acts"><span class="hint">${next <= 25 ? `Next: <b>${next}</b>` : 'All 25 placed'}</span>
          <button class="btn small" data-do="bundo" ${next > 1 ? '' : 'disabled'}>Undo</button><button class="btn small" data-do="bclear" ${next > 1 ? '' : 'disabled'}>Clear</button>
          <button class="btn small" data-do="bshuffle">Shuffle</button><button class="btn gold" data-do="bready" ${next > 25 ? '' : 'disabled'}>Lock it in</button></div></div>`;
    } else if (meP?.grid) mine = `<div class="bg-me ${myCall ? 'up' : ''}">${word(meP.lines, 'big')}${grid(meP.grid, s.called, {call:myCall})}</div>`;
    else if (meP) mine = '<p class="spect">Your grid is locked in. Waiting for the others.</p>';
    else mine = '<p class="spect">You’re watching this game.</p>';
    const next = mode === 'local' || mode === 'host';
    return `<div class="game bg-room"><div class="main">
      <header class="top">
        <div class="brand">B<em>I</em>NGO</div>
        <span class="sync">Round ${s.round}${s.stage === 'call' ? ` · ${s.called.length} called` : ''}</span>
        <div class="tools">${s.code ? `<span class="codechip">${esc(s.code)}</span>` : ''}<button class="tool" data-do="rules">Rules</button><button class="tool" data-do="mute">${muted ? 'Sound off' : 'Sound on'}</button><button class="tool" data-do="leave">Leave</button></div>
      </header>
      <section class="bg-players">${s.players.map(p => `<div class="bg-p ${s.stage === 'call' && p === cur && s.phase === 'play' ? 'up' : ''} ${s.winners.includes(p.id) ? 'won' : ''}" data-pid="${esc(p.id)}">${avatar(s, p)}<div><b>${esc(p.name)}${p.id === me && mode !== 'local' ? ' (you)' : ''}</b>${s.stage === 'fill' ? `<small>${p.grid ? 'Ready' : 'Filling…'}</small>` : word(p.lines, 'sm')}</div><span class="bg-sc">${s.totals[p.id] || 0}</span></div>`).join('')}</section>
      <section class="bg-stage">
        <div class="bg-call" aria-live="polite">${last ? `<div class="bg-ball" data-k="${s.called.length}">${last}</div>` : '<div class="bg-ball idle">?</div>'}<div><b>${big}</b>${hint ? `<span>${hint}</span>` : ''}</div></div>
        ${s.called.length ? `<div class="bg-trail">${s.called.slice(-12).map(n => `<span>${n}</span>`).join('')}</div>` : ''}
      </section>
      ${mine}
      ${s.phase === 'over' ? `<section class="bg-end"><div class="bg-all">${s.players.map(p => `<div><b>${esc(p.name)}</b>${p.grid ? grid(p.grid, s.called, {cls:'mini'}) : ''}</div>`).join('')}</div>
        <div class="acts">${next ? '<button class="btn gold" data-do="again">Next round</button>' : '<span class="muted">The host starts the next round.</span>'}</div></section>` : ''}
    </div></div>${ui.modal === 'rules' ? rules() : ''}${curtain(s)}`;
  }
  function curtain(s){
    if (mode !== 'local' || s.phase !== 'play' || ui.revealed === me) return '';
    const p = P(s, me);
    return `<div class="curtain"><div><div class="eyebrow">Pass the device</div><h2>${avatar(s, p)} ${esc(p.name)}</h2><p class="muted">${s.stage === 'fill' ? 'Fill your grid in secret' : 'Your call'}</p><br><button class="btn gold" data-do="reveal">I’m ${esc(p.name)}. Show my grid</button></div></div>`;
  }

  const fillOf = () => (ui.bfill || []).length === 25 ? [...ui.bfill] : Array(25).fill(null);
  Object.assign(H, {
    bput:d => { const f = fillOf(), i = +d.i; if (f[i] != null) return; f[i] = f.filter(v => v != null).length + 1; if (f[i] > 25) return; ui.bfill = f; sfx('card'); render(); },
    bundo:() => { const f = fillOf(), top = Math.max(0, ...f.filter(v => v != null)); ui.bfill = f.map(v => v === top ? null : v); render(); },
    bclear:() => { ui.bfill = null; render(); },
    bshuffle:() => { ui.bfill = shuffled(); render(); },
    bready:() => send({t:'grid', grid:fillOf()}),
    bcall:d => send({t:'call', n:+d.n}),
    blocal:() => {
      const names = form.locals.map(n => n.trim()).filter(Boolean);
      if (names.length < 2) return toast('Add at least two player names');
      mode = 'local'; ui = freshUI(); seenLog = -1;
      G = {...newGame(names.map((name, i) => ({id:'p' + i, name})), {game:'bingo'}), v:1};
      store.set('bingo-local', G); screen = 'game'; render();
    },
    bresume:() => { G = store.get('bingo-local'); if (!G) return; mode = 'local'; ui = freshUI(); seenLog = -1; screen = 'game'; render(); },
  });

  return {name:'Bingo', min:2, max:8, timeout, newGame, apply, needs, home, view, rules, art, done, LINES};
})();
ENG.bingo = BINGO;
