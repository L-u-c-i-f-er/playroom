/* =====================================================================
   MAFIA — social deduction, with playing cards as role cards: Ace = Mafia,
   King = Police, Queen = Doctor, number cards = Villagers. The page is the
   moderator. Night: the Mafia pick a victim, the Doctor protects one player,
   the Police learn whether one player is Mafia, and everyone else makes a
   dummy pick so nobody can tell who has a power. Day: talk, then vote someone
   out. Town wins when the Mafia are gone; Mafia win once they match the town.
   ===================================================================== */
const MAF = (() => {
  const ROLE = {
    mafia:{name:'Mafia', as:'Mafia', card:[0, 39, 13, 26], verb:'Eliminate',
      text:'Each night, choose someone to eliminate with the rest of the Mafia. By day, act innocent. You win once the Mafia match the town in number.'},
    police:{name:'Police', as:'the Police', card:[25], verb:'Investigate',
      text:'Each night, investigate one player and learn whether they are Mafia. Use what you know by day without giving yourself away.'},
    doctor:{name:'Doctor', as:'the Doctor', card:[37], verb:'Protect',
      text:'Each night, protect one player, yourself included. If the Mafia go after them, they survive.'},
    villager:{name:'Villager', as:'a Villager', card:[40, 41, 42, 43, 44, 45, 46, 47, 48, 1, 2, 3, 4, 5, 6, 7, 8, 9], verb:'Suspect',
      text:'No night power. Listen, ask questions and vote the Mafia out by day. At night you make a dummy pick, so nobody can tell who has a power.'},
  };
  const cfg = {mafia:0, doctor:1, police:1};
  const autoMafia = n => n <= 5 ? 1 : n <= 8 ? 2 : n <= 11 ? 3 : 4;
  const alive = s => s.players.filter(p => p.alive);

  function newGame(seats, extra = {}){
    const c = {...cfg, ...(extra.cfg || {})}, n = seats.length;
    const m = Math.min(c.mafia || autoMafia(n), Math.floor((n - 1) / 2));
    const roles = [...Array(m).fill('mafia'), ...(c.police ? ['police'] : []), ...(c.doctor ? ['doctor'] : [])];
    while (roles.length < n) roles.push('villager');
    shuffle(roles);
    const k = {};
    const s = {...extra, cfg:c, phase:'play', stage:'roles', night:1, gid:rid(8), ack:extra.ack || {}, log:[], ln:0, winner:null,
      players:seats.map((p, i) => {
        const r = roles[i], j = k[r] = (k[r] ?? -1) + 1;
        return {id:p.id, name:p.name, role:r, card:ROLE[r].card[j % ROLE[r].card.length], alive:true, ready:false, act:null, done:false, vote:null, checks:[]};
      })};
    const v = roles.filter(r => r === 'villager').length;
    log(s, `${n} players: ${m} Mafia${c.police ? ', the Police' : ''}${c.doctor ? ', the Doctor' : ''} and ${v} Villager${v === 1 ? '' : 's'}. Everyone, look at your card`, 'turn');
    return s;
  }
  function startNight(s){
    s.stage = 'night';
    s.players.forEach(p => { p.act = null; p.done = false; p.vote = null; });
    log(s, `Night ${s.night}. Everyone makes a secret pick`, 'turn');
  }
  function winCheck(s){
    const live = alive(s), m = live.filter(p => p.role === 'mafia').length;
    if (m && m < live.length - m) return false;
    s.phase = 'over'; s.winner = m ? 'mafia' : 'town';
    log(s, m ? 'The Mafia now match the town. The Mafia win' : 'Every Mafia member is out. The town wins', 'win',
      {title:m ? 'The Mafia win' : 'The town wins', sub:m ? 'They match the town in number' : 'Every Mafia member was found'});
    return true;
  }
  // Night ends once every living player has picked (and, on one device, handed it on).
  function dawnIfReady(s){
    const live = alive(s);
    if (!live.every(p => p.act != null && (!s.cfg.local || p.done))) return;
    const votes = {};
    live.filter(p => p.role === 'mafia').forEach(p => { votes[p.act] = (votes[p.act] || 0) + 1; });
    const top = Math.max(...Object.values(votes)), pool = Object.keys(votes).filter(id => votes[id] === top);
    const v = P(s, pool[Math.random() * pool.length | 0]);   // a split Mafia vote is settled at random
    const saved = live.some(p => p.role === 'doctor' && p.act === v.id);
    live.forEach(p => { p.act = null; p.done = false; p.vote = null; });
    s.stage = 'day';
    if (saved) log(s, `Day ${s.night}. Nobody died in the night`, 'big', {title:'Nobody died', sub:`Day ${s.night}: talk it over, then vote`});
    else {
      v.alive = false;
      log(s, `Day ${s.night}. ${v.name} was killed in the night. They were ${ROLE[v.role].as}`, 'big', {title:`${v.name} was killed`, sub:`They were ${ROLE[v.role].as}`});
    }
    winCheck(s);
  }
  function lynch(s, id, why = ''){
    const v = id && P(s, id);
    if (!v) log(s, `The town voted nobody out${why}`, 'big', {title:'Nobody voted out', sub:'Night falls'});
    else {
      v.alive = false;
      log(s, `The town voted out ${v.name}${why}. They were ${ROLE[v.role].as}`, 'big', {title:`${v.name} is out`, sub:`They were ${ROLE[v.role].as}`});
    }
    if (!winCheck(s)){ s.night++; startNight(s); }
  }
  const okTarget = (s, me, t) => t.alive && (s.stage === 'night'
    ? (me.role === 'mafia' ? t.role !== 'mafia' : me.role === 'doctor' || t !== me) : t !== me);

  function apply(s, pid, a){
    if (!a || typeof a !== 'object') return 'That move was not understood';
    const p = P(s, pid); if (!p) return 'You’re watching this game';
    if (s.phase !== 'play') return 'This game is over';
    if (s.stage === 'roles'){
      if (a.t !== 'ready') return 'Look at your card first';
      p.ready = true;
      if (s.players.every(q => q.ready)) startNight(s);
      return;
    }
    // On one device the group votes out loud and whoever holds it records the result.
    if (s.stage === 'day' && s.cfg.local){
      if (a.t !== 'lynch') return 'Pick who the town voted out';
      if (a.target != null && !P(s, a.target)?.alive) return 'Pick a living player';
      return lynch(s, a.target);
    }
    if (!p.alive) return 'You’re out. Watch the rest of the game';
    if (s.stage === 'night'){
      if (a.t === 'done'){ if (p.act == null) return 'Make your pick first'; p.done = true; return dawnIfReady(s); }
      if (a.t !== 'night') return 'It’s night: make your pick';
      if (p.act != null) return 'You already chose tonight';
      const t = P(s, a.target);
      if (!t?.alive) return 'Pick a living player';
      if (!okTarget(s, p, t)) return p.role === 'mafia' ? 'Pick someone outside the Mafia' : 'Pick someone else';
      p.act = t.id;
      if (p.role === 'police') p.checks.push({id:t.id, mafia:t.role === 'mafia', night:s.night});
      return dawnIfReady(s);
    }
    if (a.t !== 'vote') return 'Vote for a player, or to skip';
    const t = a.target == null ? null : P(s, a.target);
    if (a.target != null && !(t && okTarget(s, p, t))) return t === p ? 'You can’t vote for yourself' : 'Vote for a living player';
    p.vote = t ? t.id : 'skip';
    log(s, `${p.name} votes ${t ? `to vote out ${t.name}` : 'to skip'}`);
    const live = alive(s);
    if (live.some(q => q.vote == null)) return;
    // Votes are in: the player with the most votes goes, unless it's a tie or skipping got as many.
    const n = {}; live.forEach(q => { n[q.vote] = (n[q.vote] || 0) + 1; });
    const ranked = Object.entries(n).filter(([k]) => k !== 'skip').sort((x, y) => y[1] - x[1]);
    const top = ranked[0], out = top && top[1] > (n.skip || 0) && ranked[1]?.[1] !== top[1] ? top[0] : null;
    return lynch(s, out, out ? ` with ${top[1]} vote${top[1] > 1 ? 's' : ''}` : ranked.length ? ' (no majority)' : '');
  }
  function needs(s){
    if (s.phase !== 'play') return [];
    const who = s.stage === 'roles' ? s.players.filter(p => !p.ready)
      : s.stage === 'night' ? alive(s).filter(p => p.act == null || (s.cfg.local && !p.done))
      : s.cfg.local ? [] : alive(s).filter(p => p.vote == null);
    return who.map(p => p.id);
  }

  /* ----- client ----- */
  const pc = (id, o) => RUM.pc(null, id, o);
  function art(){
    const cards = [[0, -16, -110, 16], [25, -6, -50, 2], [37, 4, 10, -4], [44, 14, 70, 4], [39, 24, 128, 20]];
    return `<div class="rummy-art" style="position:absolute;inset:0">${cards.map(([id, r, x, y]) => `<div class="fi" style="transform:translate(-50%,-50%) rotate(${r}deg) translate(${x * .55}px,${y * .9}px);--r2:${r * 1.25}deg;--x2:${x * .75}px;--yy:${y - 10}px">${pc(id)}</div>`).join('')}</div>`;
  }
  const rulesList = [
    ['Role cards', 'Everyone gets a secret card. Ace: Mafia. King: Police. Queen: Doctor. Number card: Villager. The Mafia know each other.'],
    ['How many Mafia', 'Automatically 1 for up to 5 players, 2 for 6–8, 3 for 9–11 and 4 for 12 or more. The host can change it.'],
    ['Night', 'Everyone makes a secret pick. The Mafia choose someone to eliminate (if they disagree, one of their picks is chosen at random). The Doctor protects one player. The Police learn whether one player is Mafia. Villagers pick too, but it does nothing.'],
    ['Morning', 'You find out who was killed and what their card was, or that nobody died because the Doctor protected the target.'],
    ['Day', 'Talk it over, accuse, defend. Then vote. Whoever has the most votes is out and their card is shown. A tie, or as many votes to skip, means nobody goes.'],
    ['One device', 'Pass the device around for role cards and night picks. By day, vote out loud and tap whoever the town chose.'],
    ['Winning', 'The town wins when every Mafia member is out. The Mafia win once there are as many of them as everyone else.'],
    ['Out', 'Once you’re out, stay quiet. Online, you can see everyone’s card.'],
  ];
  const rules = () => sheet(`<div class="eyebrow">How to play</div><h2>Mafia rules</h2><ul class="rules">${rulesList.map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}</ul>
    <div class="acts"><button class="btn gold" data-do="closemodal">Got it</button></div>`);

  function home(){
    const saved = store.get('mafia-local');
    const locals = form.locals.map((n, i) => `<div class="row"><input class="grow" id="lp${i}" data-local="${i}" value="${esc(n)}" placeholder="Player ${i + 1}" maxlength="18" aria-label="Player ${i + 1} name" style="min-width:0;background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:12px;padding:11px 14px;color:var(--text);font:500 16px var(--body)">${form.locals.length > 2 ? `<button class="tool" data-do="lrem" data-i="${i}">Remove</button>` : ''}</div>`).join('');
    return `<div class="home">
      <button class="btn small backlink" data-do="hub">← All games</button>
      <section class="hero">
        <div>
          <div class="eyebrow">Trust nobody</div>
          <h1><em>Mafia</em></h1>
          <p>The Mafia hide among the town. Each night they strike; each day the town votes someone out. Draw an Ace and you’re one of them.</p>
          <div class="facts"><span class="fact"><b>4–15</b> players</span><span class="fact">Ace <b>Mafia</b></span><span class="fact">King <b>Police</b></span><span class="fact">Queen <b>Doctor</b></span></div>
        </div>
        <div class="fan" aria-hidden="true">${art()}</div>
      </section>
      <section class="panels">
        <div class="panel">
          <div class="eyebrow">Online</div><h2>Everyone on their phone</h2>
          <div class="field"><label for="nm">Your name</label><input id="nm" data-f="name" value="${esc(form.name)}" maxlength="18" placeholder="e.g. Priya" autocomplete="nickname"></div>
          ${net.ready ? `<button class="btn gold" data-do="host">Host a new table</button>
          <div class="field"><label for="cd">Or join with a code</label><div class="row"><input id="cd" class="grow code-in" data-f="code" value="${esc(form.code)}" maxlength="5" placeholder="ABCDE" autocomplete="off"><button class="btn" data-do="join">Join</button></div></div>`
          : '<p class="note">Can’t reach the game server right now, so online play is off. Offline modes still work.</p>'}
        </div>
        <div class="panel">
          <div class="eyebrow">One device</div><h2>Pass &amp; play</h2>
          <p>Pass the device for role cards and night picks; vote out loud by day.</p>
          <div class="names">${locals}</div>
          <div class="row">${form.locals.length < 15 ? '<button class="btn small" data-do="ladd15">Add player</button>' : ''}<button class="btn gold" data-do="mflocal" style="margin-left:auto">Start game</button></div>
          ${saved?.phase === 'play' ? `<button class="btn small" data-do="mfresume">Resume saved game (${saved.players.map(p => esc(p.name)).join(', ')})</button>` : ''}
        </div>
        <div class="panel">
          <div class="eyebrow">New here?</div><h2>How it works</h2>
          <p>Nights are secret picks; days are arguments and a vote. The page keeps the roles, runs the night and counts the votes, so nobody has to sit out as moderator.</p>
          <button class="btn" data-do="rules">Read the rules</button>
        </div>
      </section>
    </div>`;
  }

  // A fixed city skyline over the table; windows light up at night.
  const CITY = (() => {
    let seed = 7, x = 0, b = '', w = '';
    const r = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    while (x < 1200){
      const bw = 38 + r() * 72 | 0, bh = 46 + r() * 124 | 0;
      b += `<rect x="${x}" y="${200 - bh}" width="${bw}" height="${bh}"/>`;
      if (r() < .25) b += `<rect x="${x + bw / 2 - 2 | 0}" y="${200 - bh - 18}" width="4" height="18"/>`;
      for (let wy = 210 - bh; wy < 188; wy += 15) for (let wx = x + 7; wx < x + bw - 9; wx += 13) if (r() < .32) w += `<rect x="${wx}" y="${wy}" width="6" height="8"/>`;
      x += bw + (r() * 5 | 0);
    }
    return `<svg class="mf-city" viewBox="0 0 1200 200" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><g class="b">${b}</g><g class="w">${w}</g></svg>`;
  })();
  const MARK = {mafia:'✕', doctor:'✚', police:'?', villager:'•'};
  let cardKey = '', cardT = 0;   // the role card plays its flip once, when it turns over
  function view(s){
    const meP = P(s, me), over = s.phase === 'over', local = !!s.cfg.local;
    const priv = !!meP && !over && (!local || (s.stage !== 'day' && ui.revealed === me));
    const seeAll = over || (!local && meP && !meP.alive);
    const open = priv && !ui.mhide, mafiaMe = open && meP.role === 'mafia';
    const shown = p => seeAll || !p.alive || (open && p.id === me) || (mafiaMe && p.role === 'mafia');
    const localDay = local && s.stage === 'day' && !over;
    const picking = open && meP.alive && ((s.stage === 'night' && meP.act == null) || (s.stage === 'day' && !local));
    const canTap = p => p.alive && (localDay || (picking && okTarget(s, meP, p)));
    const tally = {}; let skips = 0;
    if (s.stage === 'day') alive(s).forEach(q => { if (q.vote === 'skip') skips++; else if (q.vote) tally[q.vote] = (tally[q.vote] || 0) + 1; });
    const sky = over ? (s.winner === 'town' ? 'day' : 'night') : s.stage === 'day' ? 'day' : 'night';
    const stage = over ? 'Game over' : s.stage === 'roles' ? 'Before the first night' : s.stage === 'night' ? `Night ${s.night}` : `Day ${s.night}`;
    const head = over ? (s.winner === 'town' ? 'The town wins' : 'The Mafia win') : s.stage === 'roles' ? 'Look at your card' : s.stage === 'night' ? 'The city sleeps' : 'The town wakes';
    const events = s.log.filter(e => e.kind === 'big' || e.kind === 'win').slice(-1).concat(s.log.slice(-1)).filter((e, i, a) => a.indexOf(e) === i);
    const on = local ? null : (() => { const l = live(); l.add(me); return l; })();
    const n = s.players.length, k0 = Math.max(0, s.players.findIndex(p => p.id === me));
    const left = needs(s).length;
    const center = over ? `${s.players.filter(p => p.role === 'mafia').map(p => esc(p.name)).join(', ')} ${s.players.filter(p => p.role === 'mafia').length > 1 ? 'were' : 'was'} the Mafia`
      : s.stage === 'roles' ? `${n - left} of ${n} have seen their card`
      : s.stage === 'night' ? (local ? 'Pass the device around the table' : `${alive(s).length - left} of ${alive(s).length} have chosen`)
      : local ? 'Argue it out, then vote out loud' : `${alive(s).length - left} of ${alive(s).length} have voted${skips ? ` · ${skips} to skip` : ''}`;
    return `<div class="game mf-room ${sky}"><div class="main">
      <header class="mf-bar">
        <div class="mf-logo">Mafia</div>
        <span class="mf-stage">${stage}</span>
        <span class="mf-alive">${alive(s).length} of ${n} still in</span>
        <div class="tools">${s.code ? `<span class="codechip">${esc(s.code)}</span>` : ''}<button class="tool" data-do="rules">Rules</button><button class="tool" data-do="mute">${muted ? 'Sound off' : 'Sound on'}</button><button class="tool" data-do="leave">Leave</button></div>
      </header>
      <section class="mf-scene">
        <div class="mf-orb"></div>${CITY}
        <div class="mf-narr"><h1>${head}</h1>${events.map(e => `<p>${esc(e.text)}</p>`).join('')}</div>
      </section>
      <section class="mf-table">
        <div class="mf-felt"><span>${center}</span></div>
        ${s.players.map((p, i) => {
          const a = Math.PI / 2 + 2 * Math.PI * ((i - k0 + n) % n) / n, x = 50 + 44 * Math.cos(a), y = 50 + 40 * Math.sin(a);
          const tap = canTap(p), sel = ui.mpick === p.id;
          const st = !p.alive ? ROLE[p.role].name : shown(p) ? ROLE[p.role].name : s.stage === 'roles' ? (p.ready ? 'Ready' : 'Looking…') : s.stage === 'day' && !local && p.vote != null ? 'Voted' : '';
          return `<button class="mf-seat ${p.alive ? '' : 'dead'} ${sel ? 'sel' : ''} ${tap ? 'tap' : ''} ${p.id === me && !local ? 'me' : ''}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%" ${tap ? `data-do="mfpick" data-id="${esc(p.id)}" aria-pressed="${sel}"` : 'disabled'} data-pid="${esc(p.id)}">
            <span class="mf-tok">${shown(p) ? `<span class="mf-peek">${pc(p.card, {cls:'xs'})}</span>` : ''}${avatar(s, p)}${sel && open ? `<i class="mf-mark">${MARK[meP.role]}</i>` : ''}${localDay && sel ? '<i class="mf-mark">✕</i>' : ''}</span>
            <b>${on && !on.has(p.id) ? '<span class="dot"></span> ' : ''}${esc(p.name)}</b>${st ? `<small>${st}</small>` : ''}
            ${tally[p.id] ? `<span class="mf-votes">${'<i></i>'.repeat(tally[p.id])}</span>` : ''}
          </button>`; }).join('')}
      </section>
      ${priv ? mine(s, meP, open) : localDay ? townPanel(s) : meP || local ? '' : '<div class="spect">You’re watching this game.</div>'}
    </div></div>${modal(s)}${curtain(s)}`;
  }
  function mine(s, meP, open){
    const R = ROLE[meP.role], local = !!s.cfg.local, pick = ui.mpick && P(s, ui.mpick), nm = id => esc(P(s, id).name);
    const team = s.players.filter(p => p.role === 'mafia' && p !== meP);
    const key = `${s.gid}:${me}:${open}`;
    if (key !== cardKey){ if (cardKey.startsWith(`${s.gid}:${me}:`)) cardT = Date.now(); cardKey = key; }
    const fl = Date.now() - cardT < 700 ? `style="animation-delay:-${Date.now() - cardT}ms"` : '';
    const info = [];
    if (open && meP.role === 'mafia' && team.length) info.push(`<p class="mf-note">Your family: ${team.map(p => `${esc(p.name)}${p.alive ? '' : ' (out)'}${s.stage === 'night' && p.alive && p.act ? ` → picked ${nm(p.act)}` : ''}`).join(', ')}</p>`);
    if (open && meP.checks.length) info.push(`<ul class="mf-checks">${meP.checks.map(c => `<li>Night ${c.night}: ${nm(c.id)} is <b class="${c.mafia ? 'bad' : 'good'}">${c.mafia ? 'Mafia' : 'not Mafia'}</b></li>`).join('')}</ul>`);
    let act = '';
    if (!meP.alive) act = `<span class="hint">You’re out.${local ? '' : ' You can see everyone’s card now.'} Stay quiet and watch.</span>`;
    else if (!open) act = '<span class="hint">Your card is face down. Tap it to look.</span>';
    else if (s.stage === 'roles') act = meP.ready ? `<span class="hint">Waiting for ${needs(s).length} more to look at their card.</span>`
      : `<span class="hint">Remember it. Tell no one.</span><button class="mf-btn" data-do="mfready">${local ? 'Got it. Pass the device' : 'Got it'}</button>`;
    else if (s.stage === 'night'){
      if (meP.act == null) act = `<span class="hint">${meP.role === 'villager' ? 'Tap who you suspect. It does nothing, but keeps everyone tapping alike.' : `Tap a player at the table to ${R.verb.toLowerCase()}.`}</span>
        <button class="mf-btn" data-do="mfnight" ${pick ? '' : 'disabled'}>${pick ? `${R.verb} ${esc(pick.name)}` : R.verb}</button>`;
      else {
        const last = meP.role === 'police' && meP.checks.at(-1);
        act = `<span class="hint">You chose to ${R.verb.toLowerCase()} ${nm(meP.act)}.${last ? ` ${nm(last.id)} is ${last.mafia ? '<b class="bad">Mafia</b>' : '<b class="good">not Mafia</b>'}.` : ''}${local ? '' : ` Waiting for ${needs(s).length} more…`}</span>
          ${local && !meP.done ? '<button class="mf-btn" data-do="mfdone">Done. Pass the device</button>' : ''}`;
      }
    } else {
      const v = meP.vote;
      act = `<span class="hint">${v == null ? 'Tap a player at the table to vote them out, or skip.' : `You voted ${v === 'skip' ? 'to skip' : `for ${nm(v)}`}. You can change it until everyone has voted.`}</span>
        <button class="mf-btn ghost" data-do="mfvote">Skip</button><button class="mf-btn red" data-do="mfvote" data-id="${pick ? esc(pick.id) : ''}" ${pick ? '' : 'disabled'}>${pick ? `Vote out ${esc(pick.name)}` : 'Vote out'}</button>`;
    }
    return `<section class="mf-dossier ${meP.alive ? '' : 'dead'} ${meP.role}">
      <div class="mf-flip ${open ? 'open' : ''}" ${local ? '' : `data-do="mfhide" role="button" tabindex="0" aria-label="${open ? 'Turn your card face down' : 'Look at your card'}"`}>
        <div class="mf-in" ${fl}><div class="mf-face"><div class="pc lg down"></div></div><div class="mf-face front">${pc(meP.card, {cls:'lg'})}</div></div>
      </div>
      <div class="mf-info"><span class="mf-who">${esc(meP.name)}${local ? '' : open ? ' · tap the card to hide it' : ''}</span><h2>${open ? R.name : 'Face down'}</h2>
        ${open ? `<p>${R.text}</p>` : ''}${info.join('')}
        <div class="mf-acts">${act}</div></div>
    </section>`;
  }
  function townPanel(s){
    const pick = ui.mpick && P(s, ui.mpick);
    return `<section class="mf-dossier town"><div class="mf-info"><span class="mf-who">The whole table</span><h2>Town vote</h2>
      <p>Talk it over and vote out loud. Then tap the player the town voted out, or choose nobody.</p>
      <div class="mf-acts"><button class="mf-btn ghost" data-do="mflynch">Nobody</button><button class="mf-btn red" data-do="mflynch" data-id="${pick ? esc(pick.id) : ''}" ${pick ? '' : 'disabled'}>${pick ? `Vote out ${esc(pick.name)}` : 'Vote out'}</button></div></div></section>`;
  }
  function modal(s){
    if (ui.modal === 'rules') return rules();
    if (s.phase !== 'over') return '';
    const next = mode === 'local' || mode === 'host';
    const rows = [...s.players].sort((a, b) => (b.role === 'mafia') - (a.role === 'mafia'));
    return sheet(`<div class="eyebrow">Game over</div><h2>${s.winner === 'town' ? 'The town wins!' : 'The Mafia win!'}</h2>
      <div class="rres">${rows.map(p => `<div class="rr ${(p.role === 'mafia') === (s.winner === 'mafia') ? 'win' : ''}"><div style="min-width:0;display:flex;gap:10px;align-items:center">${pc(p.card, {cls:'xs'})}<b>${esc(p.name)}</b></div>
        <span class="num">${ROLE[p.role].name}</span><span class="num muted">${p.alive ? 'Survived' : 'Out'}</span></div>`).join('')}</div>
      <div class="acts"><button class="btn" data-do="leave">Back to menu</button>${next ? '<button class="btn gold" data-do="again">Deal again</button>' : '<span class="muted">The host deals the next game.</span>'}</div>`);
  }
  function curtain(s){
    if (mode !== 'local' || ui.revealed === me || !needs(s).includes(me)) return '';
    const p = P(s, me);
    return `<div class="curtain"><div><div class="eyebrow">Pass the device</div><h2>${avatar(s, p)} ${esc(p.name)}</h2><p class="muted">${s.stage === 'roles' ? 'Look at your role card. Keep it to yourself.' : `Night ${s.night}: make your secret pick`}</p><br><button class="btn gold" data-do="reveal">I’m ${esc(p.name)}. Show me</button></div></div>`;
  }

  Object.assign(H, {
    mfpick:d => { ui.mpick = ui.mpick === d.id ? null : d.id; render(); },
    mfhide:() => { if (!G?.cfg?.local){ ui.mhide = !ui.mhide; render(); } },
    mfready:() => send({t:'ready'}),
    mfnight:() => send({t:'night', target:ui.mpick}),
    mfdone:() => send({t:'done'}),
    mfvote:d => send({t:'vote', target:d.id || null}),
    mflynch:d => send({t:'lynch', target:d.id || null}),
    ladd15:() => { if (form.locals.length < 15) form.locals.push(''); render(); },
    mflocal:() => {
      const names = form.locals.map(n => n.trim()).filter(Boolean);
      if (names.length < 4) return toast('Mafia needs at least four players');
      mode = 'local'; ui = freshUI(); seenLog = -1;
      G = {...newGame(names.map((name, i) => ({id:'p' + i, name})), {game:'mafia', cfg:{...cfg, local:1}}), v:1};
      store.set('mafia-local', G); screen = 'game'; render();
    },
    mfresume:() => { G = store.get('mafia-local'); if (!G) return; mode = 'local'; ui = freshUI(); seenLog = -1; screen = 'game'; render(); },
  });

  // Out of time: ready up, make the first allowed night pick, or vote to skip.
  const timeout = (s, pid) => {
    const p = P(s, pid);
    if (s.stage === 'roles') return {t:'ready'};
    if (s.stage === 'night') return p.act != null ? {t:'done'} : {t:'night', target:s.players.find(q => okTarget(s, p, q))?.id};
    return {t:'vote'};
  };
  return {name:'Mafia', min:4, max:15, cfg, timeout, newGame, apply, needs, home, view, rules, art, ROLE,
    lobby:(s, host) => {
      const c = s.cfg || cfg, n = s.players.length, auto = autoMafia(Math.max(n, 4));
      if (!host) return `<p class="muted">${c.mafia || `Auto (${auto})`} Mafia · Doctor ${c.doctor ? 'on' : 'off'} · Police ${c.police ? 'on' : 'off'}</p>`;
      const sel = (k, opts) => `<select data-mfcfg="${k}">${opts.map(([v, t]) => `<option value="${v}" ${v === c[k] ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
      return `<div class="row" style="flex-wrap:wrap;gap:12px"><label class="muted">Mafia ${sel('mafia', [[0, `Auto (${auto})`], [1, '1'], [2, '2'], [3, '3'], [4, '4']])}</label>
        <label class="muted">Doctor ${sel('doctor', [[1, 'On'], [0, 'Off']])}</label><label class="muted">Police ${sel('police', [[1, 'On'], [0, 'Off']])}</label></div>`;
    }};
})();
ENG.mafia = MAF;
app.addEventListener('change', e => {
  const k = e.target.dataset.mfcfg;
  if (GID === 'mafia' && k && mode === 'host' && G?.phase === 'lobby'){ G.cfg = {...G.cfg, [k]:+e.target.value}; G.v++; persist(); render(); }
});
