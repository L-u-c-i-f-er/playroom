/* =====================================================================
   TAMBOLA / HOUSIE — the host's page (or the local caller) draws numbers;
   players strike their own tickets and claim prizes, checked against
   the numbers actually called.
   ===================================================================== */
const TAM = (() => {
  const PRIZES = [['early', 'Early Five', 'Any five numbers on a ticket'], ['top', 'Top Line', 'Every number in row 1'], ['middle', 'Middle Line', 'Every number in row 2'],
    ['bottom', 'Bottom Line', 'Every number in row 3'], ['corners', 'Four Corners', 'First and last numbers of rows 1 and 3'], ['full', 'Full House', 'All 15 numbers']];
  const PN = Object.fromEntries(PRIZES.map(([k, n]) => [k, n]));
  const CALLS = {1:'Kelly’s eye', 2:'One little duck', 3:'Cup of tea', 4:'Knock at the door', 5:'Man alive', 6:'Half a dozen', 7:'Lucky seven', 8:'Garden gate',
    9:'Doctor’s orders', 11:'Legs eleven', 12:'One dozen', 13:'Unlucky for some', 16:'Sweet sixteen', 21:'Key of the door', 22:'Two little ducks', 30:'Dirty Gertie',
    45:'Halfway there', 50:'Half a century', 55:'Snakes alive', 66:'Clickety click', 77:'Sunset strip', 88:'Two fat ladies', 90:'Top of the shop'};
  const spoken = n => (CALLS[n] ? CALLS[n] + '. ' : '') + (n < 10 ? `Single number ${n}` : `${Math.floor(n / 10)} and ${n % 10}, ${n}`);

  // A real ticket: 3 rows x 9 columns, 5 numbers per row, every column used, column c holds c0..c9 (1-9 and 80-90 at the ends), sorted down each column.
  function ticket(){
    for (;;){
      const cnt = Array(9).fill(1); let extra = 6;
      while (extra){ const c = Math.random() * 9 | 0; if (cnt[c] < 3){ cnt[c]++; extra--; } }
      const rows = [0, 0, 0], grid = [0, 1, 2].map(() => Array(9).fill(0));
      const order = [...Array(9).keys()].sort((a, b) => cnt[b] - cnt[a] || Math.random() - .5);
      let ok = true;
      for (const c of order){
        const pick = [0, 1, 2].filter(r => rows[r] < 5).sort((a, b) => rows[a] - rows[b] || Math.random() - .5).slice(0, cnt[c]);
        if (pick.length < cnt[c]){ ok = false; break; }
        pick.forEach(r => { rows[r]++; grid[r][c] = -1; });
      }
      if (!ok || rows.some(n => n !== 5)) continue;
      for (let c = 0; c < 9; c++){
        const pool = []; for (let n = c ? c * 10 : 1; n <= (c === 8 ? 90 : c * 10 + 9); n++) pool.push(n);
        const nums = shuffle(pool).slice(0, cnt[c]).sort((a, b) => a - b);
        let i = 0; for (let r = 0; r < 3; r++) if (grid[r][c]) grid[r][c] = nums[i++];
      }
      return grid;
    }
  }
  function won(T, k, called){
    const has = n => called.includes(n), rows = T.map(r => r.filter(Boolean));
    if (k === 'early') return rows.flat().filter(has).length >= 5;
    if (k === 'top' || k === 'middle' || k === 'bottom') return rows[['top', 'middle', 'bottom'].indexOf(k)].every(has);
    if (k === 'corners') return [rows[0][0], rows[0][4], rows[2][0], rows[2][4]].every(has);
    return rows.flat().every(has);
  }
  const cfg = {tickets:1, every:6};
  function newGame(seats, extra = {}){
    const c = {...cfg, ...(extra.cfg || {})};
    const s = {...extra, cfg:c, phase:'play', gid:rid(8), players:seats.map(p => ({id:p.id, name:p.name, tickets:Array.from({length:c.tickets}, ticket), bogey:[]})),
      called:[], prizes:{}, auto:seats.length > 0, every:c.every, log:[], ln:0, ack:extra.ack || {}};
    log(s, 'New game. Numbers 1 to 90 are in the bag', 'turn');
    return s;
  }
  function end(s){
    s.phase = 'over'; s.auto = false;
    const got = PRIZES.filter(([k]) => s.prizes[k]).map(([k]) => `${PN[k]}: ${s.prizes[k].name}`);
    log(s, `Game over. ${got.join(' · ') || 'No prizes claimed'}`, 'win', {title:s.prizes.full ? `${s.prizes.full.name} — Full House!` : 'Game over', sub:'Thanks for playing'});
  }
  function apply(s, pid, a){
    if (!a || typeof a !== 'object') return 'That move was not understood';
    if (s.phase !== 'play') return 'This game is over';
    const caller = pid === s.host;
    if (['call', 'auto', 'every', 'end', 'award'].includes(a.t) && !caller) return 'Only the caller can do that';
    if (a.t === 'call'){
      const left = []; for (let n = 1; n <= 90; n++) if (!s.called.includes(n)) left.push(n);
      if (!left.length) return 'All 90 numbers have been called';
      const n = left[Math.random() * left.length | 0]; s.called.push(n);
      log(s, `${n}${CALLS[n] ? ` · ${CALLS[n]}` : ''}`, 'call');
      if (left.length === 1){ s.auto = false; log(s, 'All 90 numbers are out. Last chance to claim'); }
      return;
    }
    if (a.t === 'auto'){ s.auto = !!a.on; return; }
    if (a.t === 'every'){ const v = Math.round(a.sec); if (!(v >= 3 && v <= 15)) return 'Pick between 3 and 15 seconds'; s.every = v; return; }
    if (a.t === 'end') return end(s);
    if (a.t === 'award'){
      if (!PN[a.prize]) return 'Unknown prize';
      if (s.prizes[a.prize]) delete s.prizes[a.prize];
      else { s.prizes[a.prize] = {name:'Claimed', at:s.called.length}; log(s, `${PN[a.prize]} claimed`, 'big', {title:PN[a.prize], sub:'Claimed in the room'}); }
      if (s.prizes.full) end(s);
      return;
    }
    if (a.t === 'claim'){
      const p = P(s, pid); if (!p) return 'You’re watching this game';
      const k = a.prize, T = p.tickets[a.ticket];
      if (!PN[k]) return 'Unknown prize';
      if (!T) return 'Pick one of your tickets';
      if (p.bogey.includes(a.ticket)) return 'That ticket was cancelled after a wrong claim';
      if (s.prizes[k]) return `${PN[k]} already went to ${s.prizes[k].name}`;
      if (!won(T, k, s.called)){
        p.bogey.push(a.ticket);
        log(s, `${p.name}’s ${PN[k]} claim was wrong. Ticket ${a.ticket + 1} is out`, 'big', {title:'Bogey!', sub:`${p.name} · ${PN[k]}`});
        return;
      }
      s.prizes[k] = {pid, name:p.name, ticket:a.ticket, at:s.called.length};
      log(s, `${p.name} won ${PN[k]} on number ${s.called.length}`, 'big', {title:PN[k], sub:`${p.name} wins`});
      if (k === 'full' || PRIZES.every(([q]) => s.prizes[q])) end(s);
      return;
    }
    return 'That move was not understood';
  }

  /* ----- client state: strikes, voice, offline tickets ----- */
  let marks = store.get('tm-marks', {}), auto = store.get('tm-auto', false), voice = store.get('tm-voice', true), shownBall = null, sub = null, newArm = false;
  let pocket = store.get('tm-pocket', null);
  const mk = (gid, ti) => `${gid}:${ti}`;
  const markSet = (gid, ti) => new Set(marks[mk(gid, ti)] || []);
  function toggleMark(gid, ti, n){
    const k = mk(gid, ti), set = markSet(gid, ti);
    set.has(n) ? set.delete(n) : set.add(n);
    for (const key of Object.keys(marks)) if (!key.startsWith(gid + ':')) delete marks[key];
    marks[k] = [...set]; store.set('tm-marks', marks);
  }
  function speak(text){
    if (!voice) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.rate = .95;
      const v = speechSynthesis.getVoices().find(v => /en[-_]IN/i.test(v.lang)) || speechSynthesis.getVoices().find(v => /^en/i.test(v.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch {}
  }
  const demo = ticket();
  const tktEl = (T, o = {}) => {
    const set = o.marks || new Set(), called = o.called;
    return `<div class="tkt ${o.bogey ? 'bogey' : ''}"><div class="tkt-h"><span>${o.title || 'Ticket'}</span><span>${o.count ?? ''}</span></div><div class="tgrid">${T.flat().map(n => n
      ? o.act ? `<button class="tc ${set.has(n) ? 'on' : ''} ${o.hint && called?.includes(n) && !set.has(n) ? 'hint' : ''}" data-do="${o.act}" data-n="${n}" data-ti="${o.ti}" aria-label="${n}${set.has(n) ? ', struck' : ''}">${n}</button>`
        : `<span class="tc ${set.has(n) ? 'on' : ''}">${n}</span>`
      : '<span class="tc blank"></span>').join('')}</div></div>`;
  };

  function art(){
    return `<div class="tam-art">${tktEl(demo, {title:'Ticket', marks:new Set(demo.flat().filter(Boolean).slice(0, 6))})}
      <div class="ball" style="left:12%;top:12%">27</div><div class="ball" style="right:10%;top:8%;transform:scale(.8)">90</div><div class="ball" style="right:16%;bottom:6%;transform:scale(.7)">5</div></div>`;
  }
  const rulesList = [
    ['Tickets', 'Each ticket has 15 numbers in 3 rows of 5. Column 1 holds 1–9, column 2 holds 10–19, and so on up to 80–90.'],
    ['Calling', 'The caller draws numbers 1 to 90 at random and reads each one out. Strike it if it’s on your ticket.'],
    ['Prizes', 'Early Five: any five numbers. Top, Middle and Bottom Line: a whole row. Four Corners: first and last numbers of rows 1 and 3. Full House: all 15.'],
    ['Claiming', 'Tap Claim as soon as you have it. The claim is checked against the numbers actually called. First valid claim wins each prize.'],
    ['Bogey', 'A wrong claim cancels that ticket for the rest of the game.'],
    ['Game end', 'The game ends when Full House is won, or when the caller ends it.'],
  ];
  const rules = () => sheet(`<div class="eyebrow">How to play</div><h2>Tambola rules</h2><ul class="rules">${rulesList.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}</ul>
    <div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);

  function home(){
    if (sub === 'tickets') return vPocket();
    return `<div class="home">
      <button class="btn small backlink" data-do="hub">← All games</button>
      <section class="hero">
        <div>
          <div class="eyebrow">Housie</div>
          <h1>Tam<em>bola</em></h1>
          <p>Ninety numbers, one caller and a race to strike your ticket. Claim Early Five, the three lines, Four Corners and Full House.</p>
          <div class="facts"><span class="fact"><b>1–20</b> players</span><span class="fact"><b>90</b> numbers</span><span class="fact"><b>6</b> prizes</span><span class="fact"><b>Voice</b> caller</span></div>
        </div>
        <div class="fan" aria-hidden="true">${art()}</div>
      </section>
      <section class="panels">
        <div class="panel">
          <div class="eyebrow">Online</div><h2>Host a game</h2>
          <div class="field"><label for="nm">Your name</label><input id="nm" data-f="name" value="${esc(form.name)}" maxlength="18" placeholder="e.g. Priya" autocomplete="nickname"></div>
          ${net.ready ? `<button class="btn gold" data-do="host">Host and call numbers</button>
          <div class="field"><label for="cd">Or join with a code</label><div class="row"><input id="cd" class="grow code-in" data-f="code" value="${esc(form.code)}" maxlength="5" placeholder="ABCDE" autocomplete="off"><button class="btn" data-do="join">Join</button></div></div>
          <p class="note">You call the numbers and get tickets too. Everyone’s claims are checked automatically.</p>`
          : '<p class="note">Can’t reach the game server right now, so online play is off. Offline modes still work.</p>'}
        </div>
        <div class="panel">
          <div class="eyebrow">Same room</div><h2>Play together offline</h2>
          <p>One device calls the numbers out loud. Everyone else opens this page on their phone for tickets.</p>
          <button class="btn gold" data-do="tcaller">Be the caller on this device</button>
          <div class="sep"></div>
          <div class="field"><label>Tickets on this phone</label><div class="row">${[1, 2, 3, 4, 6].map(n => `<button class="btn small" data-do="tpocket" data-n="${n}">${n}</button>`).join('')}</div></div>
          ${pocket ? '<button class="btn small" data-do="tpocketopen">Open my current tickets</button>' : ''}
        </div>
        <div class="panel">
          <div class="eyebrow">New here?</div><h2>How it works</h2>
          <p>Strike numbers as they’re called. Claim a prize the moment your pattern is complete, but a wrong claim cancels your ticket.</p>
          <button class="btn" data-do="rules">Read the rules</button>
        </div>
      </section>
    </div>`;
  }
  function vPocket(){
    return `<div class="home">
      <button class="btn small backlink" data-do="tsubback">← Tambola</button>
      <div><div class="eyebrow">Offline tickets</div><h2 style="font-size:clamp(32px,6vw,48px)">Your tickets</h2><p class="muted">Tap a number to strike it when the caller reads it out. Tap again to undo.</p></div>
      <div class="tix-bar"><button class="btn small ${newArm ? 'danger' : ''}" data-do="tpocketnew">${newArm ? 'Tap again to replace these tickets' : 'New tickets'}</button><span class="muted">${pocket.tickets.length} ticket${pocket.tickets.length > 1 ? 's' : ''}</span></div>
      <div class="tkts">${pocket.tickets.map((T, i) => { const set = markSet(pocket.gid, i); return tktEl(T, {title:`Ticket ${i + 1}`, count:`${set.size}/15`, marks:set, act:'tpmark', ti:i}); }).join('')}</div>
    </div>`;
  }
  const isCaller = s => s.host === me;
  function view(s){
    const meP = P(s, me), last = s.called.at(-1), pop = last !== shownBall;
    shownBall = last;
    const autoMarks = (ti, T) => auto ? new Set(T.flat().filter(n => n && s.called.includes(n))) : markSet(s.gid, ti);
    const solo = !meP;
    const caller = isCaller(s);
    return `<div class="game"><div class="main">
      <header class="top">
        <div class="brand">Tam<em>bola</em></div>
        <div class="turn"><span class="num" style="padding-left:10px">${s.called.length}</span><span>of 90 called${s.auto ? ` · every ${s.every}s` : ''}</span></div>
        <div class="tools">
          ${s.code ? `<span class="codechip">${esc(s.code)}</span>` : ''}
          <button class="tool" data-do="rules">Rules</button>
          <button class="tool" data-do="tvoice">${voice ? 'Voice on' : 'Voice off'}</button>
          <button class="tool" data-do="leave">Leave</button>
        </div>
      </header>
      <div class="tam-grid ${solo ? 'solo' : ''}">
        <section class="panel caller">
          <div class="eyebrow">${last ? `Number ${s.called.length}` : 'Ready'}</div>
          <div class="ball ${pop && last ? 'pop' : ''} ${last ? '' : 'idle'}">${last ?? '?'}</div>
          <div class="callname">${last ? esc(CALLS[last] || (last < 10 ? `Single number ${last}` : `${Math.floor(last / 10)} and ${last % 10}`)) : (caller ? 'Call the first number' : 'Waiting for the caller')}</div>
          <div class="recent">${s.called.slice(-7, -1).reverse().map(n => `<span class="mball">${n}</span>`).join('')}</div>
          ${caller && s.phase === 'play' ? `<div class="ctrls">
            <button class="btn gold" data-do="tcall" ${s.called.length >= 90 ? 'disabled' : ''}>Call next number</button>
            <div class="row"><button class="btn small ${s.auto ? 'danger' : ''}" data-do="tauto">${s.auto ? 'Pause auto-call' : 'Start auto-call'}</button>
              <label class="muted">Every <select id="tsp" data-tsp aria-label="Seconds between numbers">${[3, 4, 5, 6, 8, 10, 12, 15].map(v => `<option ${v === s.every ? 'selected' : ''}>${v}</option>`).join('')}</select> s</label></div>
            <button class="btn small" data-do="tend">End game</button>
          </div>` : ''}
        </section>
        ${meP ? `<section class="tix">
          <div class="tix-bar"><h3 style="font-size:20px;margin-right:auto">Your tickets</h3>
            <button class="chipc ${auto ? 'on' : ''}" data-do="tautomark" style="--c:var(--brass)"><i></i>${auto ? 'Auto-strike on' : 'Auto-strike off'}</button></div>
          <div class="tkts">${meP.tickets.map((T, i) => { const set = autoMarks(i, T); return tktEl(T, {title:`Ticket ${i + 1}`, count:`${T.flat().filter(n => n && s.called.includes(n)).length}/15 called`, marks:set, act:auto ? '' : 'tmark', ti:i, called:s.called, hint:!auto, bogey:meP.bogey.includes(i)}); }).join('')}</div>
        </section>` : ''}
        <section class="panel prizes">
          <div class="eyebrow">Prizes</div>
          <ul class="plist">${PRIZES.map(([k, n, d]) => { const w = s.prizes[k]; return `<li class="${w ? 'won' : ''}"><div><b>${n}</b><small>${d}</small></div>${
            w ? `<span class="winner">${esc(w.name)}${w.at ? `<br><small>on number ${w.at}</small>` : ''}</span>`
            : s.phase !== 'play' ? '<span class="muted">Not won</span>'
            : meP ? `<button class="btn small gold" data-do="tclaim" data-k="${k}">Claim</button>`
            : caller ? `<button class="btn small" data-do="taward" data-k="${k}">Mark won</button>` : ''}</li>`; }).join('')}</ul>
        </section>
        <section class="panel board">
          <div class="eyebrow">Board</div>
          <div class="board90">${Array.from({length:90}, (_, i) => i + 1).map(n => `<span class="b9 ${s.called.includes(n) ? 'on' : ''} ${n === last ? 'last' : ''}">${n}</span>`).join('')}</div>
        </section>
      </div>
    </div></div>${modal(s, meP)}`;
  }
  function modal(s, meP){
    if (ui.modal === 'rules') return rules();
    if (s.phase === 'over'){
      const restart = mode === 'local' || mode === 'host';
      return sheet(`<div class="eyebrow">Game over</div><h2>${s.prizes.full ? `${esc(s.prizes.full.name)} got Full House` : 'That’s the game'}</h2>
        <ul class="plist">${PRIZES.map(([k, n]) => `<li class="${s.prizes[k] ? 'won' : ''}"><div><b>${n}</b></div><span class="winner">${s.prizes[k] ? esc(s.prizes[k].name) : '<span class="muted">Not won</span>'}</span></li>`).join('')}</ul>
        <div class="acts"><button class="btn" data-do="leave">Back to menu</button>${restart ? '<button class="btn gold" data-do="again">New game</button>' : '<span class="muted">The caller can start a new game.</span>'}</div>`);
    }
    if (ui.tclaim && meP){
      const k = ui.tclaim, ok = meP.tickets.map((_, i) => !meP.bogey.includes(i));
      return sheet(`<div class="eyebrow">Claim</div><h2>${PN[k]}</h2><p class="lede">${PRIZES.find(p => p[0] === k)[2]}. It’s checked against the numbers called so far.</p>
        <p class="warn">A wrong claim cancels that ticket.</p>
        <div class="acts" style="justify-content:flex-start">${meP.tickets.map((_, i) => `<button class="btn ${ok[i] ? 'gold' : ''}" data-do="tclaimgo" data-ti="${i}" ${ok[i] ? '' : 'disabled'}>Claim with ticket ${i + 1}</button>`).join('')}</div>
        <div class="acts"><button class="btn" data-do="tclaimx">Cancel</button></div>`);
    }
    return '';
  }

  Object.assign(H, {
    tcall:() => send({t:'call'}, true),
    tauto:() => { lastCall = Date.now(); send({t:'auto', on:!G.auto}, true); },
    tend:() => send({t:'end'}),
    taward:d => send({t:'award', prize:d.k}, true),
    tclaim:d => { ui.tclaim = d.k; render(); },
    tclaimx:() => { ui.tclaim = null; render(); },
    tclaimgo:d => send({t:'claim', prize:ui.tclaim, ticket:+d.ti}),
    tmark:d => {
      const s = viewState(), n = +d.n;
      if (!s.called.includes(n)) return toast(`${n} hasn’t been called yet`);
      toggleMark(s.gid, +d.ti, n); render();
    },
    tautomark:() => { auto = !auto; store.set('tm-auto', auto); render(); },
    tvoice:() => { voice = !voice; store.set('tm-voice', voice); if (!voice) try { speechSynthesis.cancel(); } catch {} render(); },
    tcaller:() => { mode = 'local'; me = myPid(); ui = freshUI(); seenLog = -1; G = {...newGame([], {game:'tambola', host:me, cfg:{every:6}}), v:1}; G.auto = false; screen = 'game'; render(); },
    tpocket:d => { pocket = {gid:rid(8), tickets:Array.from({length:+d.n}, ticket)}; store.set('tm-pocket', pocket); sub = 'tickets'; newArm = false; render(); scrollTo(0, 0); },
    tpocketopen:() => { sub = 'tickets'; render(); },
    tpocketnew:() => { if (!newArm){ newArm = true; return render(); } H.tpocket({n:pocket.tickets.length}); },
    tpmark:d => { toggleMark(pocket.gid, +d.ti, +d.n); render(); },
    tsubback:() => { sub = null; newArm = false; render(); },
  });
  app.addEventListener('change', e => {
    if (GID !== 'tambola') return;
    if (e.target.dataset.tsp != null) send({t:'every', sec:+e.target.value}, true);
    const k = e.target.dataset.tcfg;
    if (k && mode === 'host' && G?.phase === 'lobby'){ G.cfg = {...G.cfg, [k]:+e.target.value}; G.v++; persist(); render(); }
  });
  // The caller's clock: auto-call on the host (or local caller) page, with a short pause after each prize.
  let lastCall = 0, bigSeen = 0;
  setInterval(() => {
    if (GID !== 'tambola' || screen !== 'game' || !G || G.phase !== 'play' || !G.auto || !(mode === 'host' || mode === 'local')) return;
    const big = G.log.filter(e => e.kind === 'big').at(-1)?.n || 0;
    if (big !== bigSeen){ bigSeen = big; lastCall = Date.now() + 3000; return; }
    if (G.called.length >= 90 || Date.now() - lastCall < G.every * 1000) return;
    lastCall = Date.now(); send({t:'call'}, true);
  }, 300);

  return {
    name:'Tambola', min:1, max:20, cfg, newGame, apply, home, view, rules, art, ticket, won, PRIZES,
    onEvents:(fresh, s) => { const c = fresh.filter(e => e.kind === 'call'); if (c.length) speak(spoken(s.called.at(-1))); },
    lobby:(s, host) => host
      ? `<div class="row"><label class="muted">Tickets each <select data-tcfg="tickets">${[1, 2, 3].map(v => `<option ${v === s.cfg?.tickets ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
         <label class="muted">Seconds between numbers <select data-tcfg="every">${[3, 4, 5, 6, 8, 10, 12, 15].map(v => `<option ${v === s.cfg?.every ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>`
      : `<p class="muted">${s.cfg?.tickets || 1} ticket${(s.cfg?.tickets || 1) > 1 ? 's' : ''} each · a new number every ${s.cfg?.every || 6}s</p>`,
  };
})();
ENG.tambola = TAM;
