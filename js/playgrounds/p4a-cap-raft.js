
/* =====================================================================
   PART 4 · PLAYGROUNDS (a) — #7 CAP/PACELC quorum explorer · #8 Raft
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, sv, esc, clamp, fmtNum, shuffle} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const {css, frag} = SDA.ph;

/* ---------------- #7 CAP / PACELC explorer ---------------- */
try {
SDA.register({kind:'playground', id:'cap-quorum', module:'distributed', icon:'⚖️', title:'CAP & PACELC explorer (quorums + partitions)',
  summary:'Run N replicas with two clients in two regions. Change R and W, choose CP or AP, cut the network, then heal it and see what survived.',
  explain:`<h3>How to use it</h3><ol><li>With no partition, set R + W ≤ N. Reads sometimes return old data. Then set R + W &gt; N and the old reads stop.</li><li>Cut the network in CP mode. The side without enough replicas returns errors.</li><li>Repeat in AP mode and press heal. One acknowledged write is silently thrown away.</li></ol><h3>What to notice</h3><ul><li>CP never returns old or conflicting data, but it can refuse requests.</li><li>Waiting for more replicas (a higher W) costs time even without a partition.</li></ul><div class="callout tip"><b>Important point</b><p>During a partition you must choose. Refuse requests (CP), or accept them and fix conflicts later (AP).</p></div><p class="lab-hint">Writes go to W random reachable replicas. The others catch up through anti-entropy (the button or heal).</p>`,
  real:[{co:'Cassandra · DynamoDB · Spanner', tier:'confirmed', text:'Cassandra and DynamoDB let you tune consistency per request (latency vs freshness); Spanner always pays for consistency with consensus latency.', src:'Vendor documentation'}],
  mount(host, api){
    const P = {n:5, w:3, r:3, mode:'cp', part:false};
    let nodes, lat, ts, latest, lastSide, conflicts, stats, d, sideWrites;
    const holder = el('div'); const cap = el('div', {class:'verdict warn', style:{fontWeight:'500'}, 'aria-live':'polite'});
    const met = ui.metrics(null, [{id:'ok', label:'Successful ops', instant:true}, {id:'err', label:'Unavailable (errors)', instant:true, warn:1, bad:5}, {id:'stale', label:'Stale reads', instant:true, warn:1, bad:3}, {id:'lost', label:'Acked writes lost on heal', instant:true, bad:1}]);
    const latBox = el('div');
    const sideOf = i => i < Math.ceil(P.n / 2) ? 'A' : 'B';
    function reset(){
      nodes = Array.from({length:P.n}, () => ({val:0, ts:0})); lat = Array.from({length:P.n}, () => 5 + Math.round(Math.random() * 80)); ts = 0; latest = {val:0, ts:0}; conflicts = 0; stats = {ok:0, err:0, stale:0, lost:0}; sideWrites = {A:[], B:[]};
      holder.innerHTML = ''; d = null;
      SDA.withScope(() => {
        d = new api.Diagram(holder, {title:`${P.n} replicas · W=${P.w} · R=${P.r} · ${P.mode.toUpperCase()}`, w:780, h:Math.max(260, 70 + Math.ceil(P.n / 2) * 62), alt:'Two clients reach replicas on their side; cross-region links can be partitioned.',
          nodes:[{id:'ca', type:'client', label:'Client Mumbai', x:85, y:120, w:130}, {id:'cb', type:'client', label:'Client Singapore', x:695, y:120, w:140}].concat(nodes.map((_, i) => ({id:'n' + i, type:'db', label:`Replica ${i + 1}`, sub:'x=0 (v0)', x:sideOf(i) === 'A' ? 300 : 480, y:50 + (sideOf(i) === 'A' ? i : i - Math.ceil(P.n / 2)) * 62, w:130}))),
          edges:nodes.flatMap((_, i) => [{from:'ca', to:'n' + i, dashed:sideOf(i) === 'B'}, {from:'cb', to:'n' + i, dashed:sideOf(i) === 'A'}])});
      });
      paint(); drawLat(); cap.textContent = 'Write from either client, then read. Toggle the partition to see the CAP trade-off.';
    }
    const reach = c => nodes.map((_, i) => i).filter(i => !P.part || sideOf(i) === (c === 'ca' ? 'A' : 'B'));
    function paint(){
      nodes.forEach((n, i) => { d.setSub('n' + i, `x=${n.val} (v${n.ts})`); d.setStatus('n' + i, n.ts < latest.ts ? 'hot' : 'ok'); });
      nodes.forEach((_, i) => { d.setEdgeHidden('ca', 'n' + i, P.part && sideOf(i) === 'B'); d.setEdgeHidden('cb', 'n' + i, P.part && sideOf(i) === 'A'); });
      met.set('ok', stats.ok); met.set('err', stats.err); met.set('stale', stats.stale); met.set('lost', stats.lost);
    }
    function write(c){
      const R = reach(c), side = c === 'ca' ? 'A' : 'B', name = c === 'ca' ? 'Mumbai' : 'Singapore';
      if (R.length < P.w && P.mode === 'cp'){ stats.err++; cap.innerHTML = `<b style="color:var(--bad)">${name} write failed (unavailable):</b> only ${R.length} replica(s) reachable, need W = ${P.w}. CP refuses rather than risk inconsistency.`; d.flow([[c, 'n' + R[0] || 'n0', '✗']], {dur:400}).catch(() => {}); paint(); return; }
      const targets = shuffle(R.slice()).slice(0, P.mode === 'ap' && P.part ? R.length : Math.min(P.w, R.length)); const v = Math.floor(Math.random() * 900) + 100; ts++;
      targets.forEach(i => nodes[i] = {val:v, ts}); latest = {val:v, ts}; stats.ok++; if (P.part) sideWrites[side].push({val:v, ts});
      d.flow(targets.map(i => [c, 'n' + i, 'x=' + v]), {parallel:true, dur:500});
      cap.innerHTML = `${name} wrote x=${v} (v${ts}) to replica(s) ${targets.map(i => i + 1).join(', ')}${P.mode === 'ap' && P.part && R.length < P.w ? `, <b>sloppy</b>: only ${R.length} reachable but AP accepts anyway` : ''}. Acknowledged ✓`;
      paint();
    }
    function read(c){
      const R = reach(c), name = c === 'ca' ? 'Mumbai' : 'Singapore';
      if (R.length < P.r && P.mode === 'cp'){ stats.err++; cap.innerHTML = `<b style="color:var(--bad)">${name} read failed (unavailable):</b> ${R.length} reachable, need R = ${P.r}.`; paint(); return; }
      const picked = shuffle(R.slice()).slice(0, Math.min(P.r, R.length)); const best = picked.reduce((b, i) => nodes[i].ts > b.ts ? nodes[i] : b, {val:0, ts:-1});
      d.flow(picked.map(i => ['n' + i, c, 'v' + nodes[i].ts]), {parallel:true, dur:500});
      const stale = best.ts < latest.ts; if (stale) stats.stale++; else stats.ok++;
      cap.innerHTML = stale ? `<b style="color:var(--bad)">${name} read STALE x=${best.val} (v${best.ts})</b> from replica(s) ${picked.map(i => i + 1).join(', ')}. The latest acknowledged write is x=${latest.val} (v${latest.ts}).` : `${name} read x=${best.val} (v${best.ts}) from replica(s) ${picked.map(i => i + 1).join(', ')}. It is up to date ✓`;
      paint();
    }
    function antiEntropy(){ const groups = P.part ? ['A', 'B'] : ['all']; groups.forEach(g => { const ids = nodes.map((_, i) => i).filter(i => g === 'all' || sideOf(i) === g); const best = ids.reduce((b, i) => nodes[i].ts > b.ts ? nodes[i] : b, {val:0, ts:-1}); ids.forEach(i => nodes[i] = {...best}); }); cap.textContent = 'Anti-entropy: replicas exchanged versions and converged on the newest they could reach.'; paint(); }
    function setPart(v){
      P.part = v;
      if (!v){ const wa = sideWrites.A, wb = sideWrites.B; let msg = 'Partition healed.'; if (wa.length && wb.length){ const all = wa.concat(wb).sort((a, b) => a.ts - b.ts); const winner = all[all.length - 1]; const losers = all.filter(x => x !== winner); stats.lost += losers.length; msg = `Partition healed. Both sides accepted writes, so last-write-wins kept x=${winner.val} and <b style="color:var(--bad)">discarded ${losers.length} acknowledged write(s)</b> (${losers.map(x => 'x=' + x.val).join(', ')}).`; } sideWrites = {A:[], B:[]}; antiEntropy(); cap.innerHTML = msg; }
      else cap.innerHTML = `Partition! Mumbai reaches replicas ${nodes.map((_, i) => i).filter(i => sideOf(i) === 'A').map(i => i + 1).join(', ')}; Singapore reaches ${nodes.map((_, i) => i).filter(i => sideOf(i) === 'B').map(i => i + 1).join(', ')}.`;
      paint();
    }
    function drawLat(){ const s = lat.slice().sort((a, b) => a - b); latBox.innerHTML = ''; latBox.append(el('b', null, 'PACELC, the “Else” part: write latency = waiting for the W-th fastest replica')); s.forEach((v, k) => latBox.append(el('div', {class:'wf-row', style:{gridTemplateColumns:'70px 1fr 70px'}}, el('span', {class:'wl', style:{fontWeight:k + 1 === P.w ? '700' : '400'}}, `W = ${k + 1}`), el('div', {class:'wf-track'}, el('div', {class:'wf-bar', style:{left:'0', width:(v / s[s.length - 1] * 100) + '%', background:k + 1 === P.w ? 'var(--accent2)' : 'var(--c-db)'}})), el('span', {class:'wt'}, v + ' ms')))); }
    const SL = {};
    const sl = (k, label) => (SL[k] = ui.slider({label, min:k === 'n' ? 3 : 1, max:7, step:1, value:P[k], fmt:v => v, onInput:v => { P[k] = v; P.w = Math.min(P.w, P.n); P.r = Math.min(P.r, P.n); SL.w && SL.w.set(P.w); SL.r && SL.r.set(P.r); P.part = false; partT.set(false); reset(); }}));
    const partT = ui.toggle({label:'✂️ Network partition between regions', checked:false, onChange:setPart});
    host.append(el('div', {class:'ctl-grid'}, sl('n', 'Replicas N').el, sl('w', 'Write quorum W').el, sl('r', 'Read quorum R').el, ui.select({label:'Behaviour under partition', value:'cp', options:[['cp', 'CP: require quorum (refuse otherwise)'], ['ap', 'AP: accept with whatever is reachable']], onChange:v => { P.mode = v; }}).el),
      el('div', {class:'row', style:{margin:'10px 0', gap:'14px'}}, partT.el),
      el('div', {class:'controls', style:{marginBottom:'10px'}}, ui.button('✍️ Mumbai writes', () => write('ca'), 'sm primary'), ui.button('📖 Mumbai reads', () => read('ca'), 'sm'), ui.button('✍️ Singapore writes', () => write('cb'), 'sm primary'), ui.button('📖 Singapore reads', () => read('cb'), 'sm'), ui.button('🔄 Anti-entropy', antiEntropy, 'sm'), ui.button('↺ Reset', () => { partT.set(false); P.part = false; reset(); }, 'sm ghost')),
      holder, cap, el('div', {style:{height:'10px'}}), met.el, el('div', {class:'card', style:{marginTop:'12px'}}, latBox));
    reset();
  }
});
} catch(e){ console.error('[SDA] playground cap-quorum', e); SDA.errors.push({id:'cap-quorum', error:e}); }

/* ---------------- #8 Raft leader election + log replication ---------------- */
try {
SDA.register({kind:'playground', id:'raft', module:'distributed', icon:'🗳️', title:'Raft: leader election & log replication',
  summary:'Run a live five-node Raft cluster with terms, election timeouts, votes, heartbeats and log copying. Kill nodes, cut the network and send writes.',
  explain:`<h3>How to use it</h3><ol><li>Watch the timeout rings. The first follower to reach zero becomes a candidate and asks for votes. With 3 of 5 votes it becomes leader.</li><li>Kill the leader. A new leader wins within a couple of seconds, with a higher term.</li><li>Press the partition button while S1 or S2 is leader, then send writes. They never commit. Heal the network and watch them get overwritten.</li></ol><h3>What to notice</h3><ul><li>A write commits only when a majority holds it.</li><li>With 3 nodes down there is no leader. Raft picks safety over availability.</li></ul><div class="callout tip"><b>Important point</b><p>Only a majority can elect a leader or commit a write. So at most one side of a split can make progress.</p></div><p class="lab-hint">Times are slowed so you can see them. Filled log boxes are committed.</p>`,
  real:[{co:'etcd · Consul · CockroachDB · Kafka KRaft', tier:'confirmed', text:'These systems implement Raft for leader election and replicated logs.', src:'Project documentation; raft.github.io'}],
  mount(host, api){
    const N = 5, MAJ = 3; let nodes, msgs, t, events, cmdN, part, paused = false, speed = 1, lastDraw = 0;
    const randTO = () => 1500 + Math.random() * 2000;
    const mk = i => ({i, alive:true, role:'follower', term:0, votedFor:null, log:[], commit:-1, deadline:0, toLen:0, votes:new Set(), next:[], match:[], hbAt:0});
    const group = i => part ? (i < 2 ? 0 : 1) : 0;
    const ev = s => { events.unshift(`[${(t / 1000).toFixed(1)}s] ${s}`); if (events.length > 9) events.pop(); };
    function reset(){ t = 0; msgs = []; events = []; cmdN = 0; part = false; if (partT) partT.set(false); nodes = Array.from({length:N}, (_, i) => mk(i)); nodes.forEach(n => { n.toLen = randTO(); n.deadline = n.toLen; }); ev('Cluster started: all followers, term 0, no leader.'); draw(); }
    const send = (from, to, type, args) => { if (!nodes[from].alive) return; msgs.push({from, to, type, args, sent:t, at:t + 110 + Math.random() * 110}); };
    const lastTerm = n => n.log.length ? n.log[n.log.length - 1].term : 0;
    function startElection(n){ n.role = 'candidate'; n.term++; n.votedFor = n.i; n.votes = new Set([n.i]); n.toLen = randTO(); n.deadline = t + n.toLen; ev(`S${n.i + 1} timed out → candidate for term ${n.term}`); nodes.forEach(o => { if (o.i !== n.i) send(n.i, o.i, 'RV', {term:n.term, lastIdx:n.log.length - 1, lastTerm:lastTerm(n)}); }); }
    function becomeLeader(n){ n.role = 'leader'; n.next = new Array(N).fill(n.log.length); n.match = new Array(N).fill(-1); n.match[n.i] = n.log.length - 1; ev(`S${n.i + 1} won ${n.votes.size} votes → LEADER of term ${n.term}`); broadcast(n); }
    function broadcast(n){ n.hbAt = t + 500; nodes.forEach(o => { if (o.i === n.i) return; const pi = n.next[o.i] - 1; send(n.i, o.i, 'AE', {term:n.term, prevIdx:pi, prevTerm:pi >= 0 ? n.log[pi].term : 0, entries:n.log.slice(n.next[o.i]).map(e => ({...e})), leaderCommit:n.commit}); }); }
    function advance(n){ n.match[n.i] = n.log.length - 1; for (let k = n.log.length - 1; k > n.commit; k--){ if (n.log[k].term !== n.term) break; if (n.match.filter(m => m >= k).length >= MAJ){ ev(`S${n.i + 1} committed entries up to #${k + 1} (stored on a majority)`); n.commit = k; break; } } }
    function handle(m){
      const n = nodes[m.to], a = m.args;
      if (a.term > n.term){ if (n.role === 'leader') ev(`S${n.i + 1} saw term ${a.term} > ${n.term} → steps down`); n.term = a.term; n.role = 'follower'; n.votedFor = null; }
      if (m.type === 'RV'){ const ok = a.term === n.term && (n.votedFor == null || n.votedFor === m.from) && (a.lastTerm > lastTerm(n) || (a.lastTerm === lastTerm(n) && a.lastIdx >= n.log.length - 1)); if (ok){ n.votedFor = m.from; n.toLen = randTO(); n.deadline = t + n.toLen; } send(n.i, m.from, 'RVR', {term:n.term, granted:ok}); }
      else if (m.type === 'RVR'){ if (n.role === 'candidate' && a.term === n.term && a.granted){ n.votes.add(m.from); if (n.votes.size >= MAJ) becomeLeader(n); } }
      else if (m.type === 'AE'){
        if (a.term < n.term){ send(n.i, m.from, 'AER', {term:n.term, success:false}); return; }
        if (n.role !== 'follower') n.role = 'follower';
        n.toLen = randTO(); n.deadline = t + n.toLen;
        if (a.prevIdx >= 0 && (n.log.length <= a.prevIdx || n.log[a.prevIdx].term !== a.prevTerm)){ send(n.i, m.from, 'AER', {term:n.term, success:false}); return; }
        a.entries.forEach((e, j) => { const idx = a.prevIdx + 1 + j; if (n.log[idx] && n.log[idx].term !== e.term){ ev(`S${n.i + 1} discarded conflicting uncommitted entries from #${idx + 1}`); n.log.length = idx; } if (!n.log[idx]) n.log.push(e); });
        if (a.leaderCommit > n.commit) n.commit = Math.min(a.leaderCommit, n.log.length - 1);
        send(n.i, m.from, 'AER', {term:n.term, success:true, match:a.prevIdx + a.entries.length});
      }
      else if (m.type === 'AER'){ if (n.role !== 'leader' || a.term !== n.term) return; if (a.success){ n.match[m.from] = Math.max(n.match[m.from], a.match); n.next[m.from] = n.match[m.from] + 1; advance(n); } else n.next[m.from] = Math.max(0, n.next[m.from] - 1); }
    }
    function tick(dt){
      t += dt;
      nodes.forEach(n => { if (!n.alive) return; if (n.role !== 'leader' && t >= n.deadline) startElection(n); if (n.role === 'leader' && t >= n.hbAt) broadcast(n); });
      const due = msgs.filter(m => m.at <= t); msgs = msgs.filter(m => m.at > t);
      due.forEach(m => { if (nodes[m.to].alive && nodes[m.from] && group(m.from) === group(m.to)) handle(m); });
    }
    const leaders = () => nodes.filter(n => n.alive && n.role === 'leader').sort((a, b) => b.term - a.term);
    function clientWrite(minority){
      const L = leaders().filter(l => minority ? group(l.i) === 0 && part : !part || group(l.i) === 1 || !leaders().some(x => group(x.i) === 1));
      const ld = minority ? L.find(l => group(l.i) === 0) : L[0];
      if (!ld){ ev(minority ? 'No leader on the minority side.' : 'Client write failed: no leader reachable. Retry after an election.'); draw(); return; }
      ld.log.push({term:ld.term, cmd:'x=' + (++cmdN)}); ld.match[ld.i] = ld.log.length - 1; ev(`Client → S${ld.i + 1}: append x=${cmdN} at #${ld.log.length} (term ${ld.term})`); broadcast(ld); draw();
    }
    /* drawing */
    const POS = Array.from({length:N}, (_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [260 + Math.cos(a) * 125, 175 + Math.sin(a) * 125]; });
    const svg = sv('svg', {viewBox:'0 0 520 350', role:'img'}); const tt = sv('title'); tt.textContent = 'Five Raft nodes with roles, terms, timeouts and messages'; svg.append(tt);
    const logBox = el('div', {class:'stack', style:{gap:'6px'}}); const evBox = el('div', {class:'lab-out', style:{maxHeight:'210px', borderRadius:'10px', border:'1px solid var(--border)'}, 'aria-live':'polite'});
    const roleCol = r => r === 'leader' ? css('--ok') : r === 'candidate' ? css('--warn') : css('--c-service');
    function draw(){
      while (svg.childNodes.length > 1) svg.lastChild.remove();
      if (part){ const l = sv('line', {x1:150, y1:10, x2:400, y2:340, 'stroke-dasharray':'8 6', 'stroke-width':2}); l.style.stroke = css('--bad'); svg.append(l); const tx = sv('text', {x:360, y:30}); tx.style.fill = css('--bad'); tx.style.font = '700 12px var(--font-ui)'; tx.textContent = 'partition'; svg.append(tx); }
      msgs.forEach(m => { const p = clamp((t - m.sent) / (m.at - m.sent), 0, 1), A = POS[m.from], B = POS[m.to]; const blocked = group(m.from) !== group(m.to) || !nodes[m.to].alive; const c = sv('circle', {cx:A[0] + (B[0] - A[0]) * p, cy:A[1] + (B[1] - A[1]) * p, r:m.type === 'AE' && m.args.entries.length ? 6 : 4}); c.style.fill = m.type[0] === 'R' ? css('--warn') : m.type === 'AE' ? css('--accent1') : css('--muted'); c.style.opacity = blocked ? '.25' : '1'; svg.append(c); });
      nodes.forEach(n => {
        const [x, y] = POS[n.i], g = sv('g', {transform:`translate(${x} ${y})`}); g.style.opacity = n.alive ? '1' : '.35'; g.style.cursor = 'pointer';
        const c = sv('circle', {r:34}); c.style.fill = css('--node-bg'); c.style.stroke = roleCol(n.role); c.style.strokeWidth = n.role === 'leader' ? '4' : '2'; g.append(c);
        if (n.alive && n.role !== 'leader'){ const f = clamp((n.deadline - t) / n.toLen, 0, 1), ang = f * 2 * Math.PI, r = 41; const path = sv('path', {d:`M 0 ${-r} A ${r} ${r} 0 ${ang > Math.PI ? 1 : 0} 1 ${Math.sin(ang) * r} ${-Math.cos(ang) * r}`, fill:'none', 'stroke-width':3}); path.style.stroke = roleCol(n.role); path.style.opacity = '.7'; g.append(path); }
        const t1 = sv('text', {y:-4, 'text-anchor':'middle'}); t1.style.font = '700 15px var(--font-ui)'; t1.style.fill = css('--text'); t1.textContent = 'S' + (n.i + 1); g.append(t1);
        const t2 = sv('text', {y:13, 'text-anchor':'middle'}); t2.style.font = '11px var(--font-mono)'; t2.style.fill = css('--muted'); t2.textContent = n.alive ? `T${n.term} ${n.role[0].toUpperCase()}` : 'dead'; g.append(t2);
        g.addEventListener('click', () => toggle(n)); svg.append(g);
      });
      logBox.innerHTML = '';
      nodes.forEach(n => logBox.append(el('div', {class:'row', style:{gap:'4px', flexWrap:'nowrap', overflowX:'auto'}}, el('b', {class:'mono', style:{width:'34px', color:n.alive ? roleCol(n.role) : 'var(--bad)'}}, 'S' + (n.i + 1)), ...(n.log.length ? n.log.map((e, k) => el('span', {title:`#${k + 1} ${e.cmd} (term ${e.term})${k <= n.commit ? ' committed' : ''}`, style:{minWidth:'26px', height:'24px', display:'inline-grid', placeItems:'center', borderRadius:'5px', font:'600 11px var(--font-mono)', border:'1.5px solid var(--accent2)', background:k <= n.commit ? 'var(--accent2)' : 'transparent', color:k <= n.commit ? '#fff' : 'var(--text)'}}, String(e.term))) : [el('span', {class:'lab-hint'}, 'empty log')]))));
      evBox.innerHTML = ''; events.forEach(e => evBox.append(el('div', {class:'ln'}, e)));
    }
    function toggle(n){ n.alive = !n.alive; if (n.alive){ n.role = 'follower'; n.toLen = randTO(); n.deadline = t + n.toLen; ev(`S${n.i + 1} restarted (keeps its term ${n.term} and log)`); } else ev(`S${n.i + 1} crashed${n.role === 'leader' ? ' (it was the leader!)' : ''}`); draw(); }
    const lp = api.loop(dt => { if (!paused){ const step = Math.min(dt, .05) * 1000 * speed; tick(step); } if (t - lastDraw > 30 || paused){ lastDraw = t; draw(); } });
    const partT = ui.toggle({label:'✂️ Partition {S1, S2} | {S3, S4, S5}', checked:false, onChange:v => { part = v; ev(v ? 'Network partition: S1–S2 cut off from S3–S5' : 'Partition healed'); draw(); }});
    const pauseB = ui.button('⏸ Pause', () => { paused = !paused; pauseB.innerHTML = paused ? '▶ Resume' : '⏸ Pause'; }, 'sm');
    host.append(el('div', {class:'controls'}, ui.button('✍️ Client write', () => clientWrite(false), 'sm primary'), ui.button('✍️ Write to minority-side leader', () => clientWrite(true), 'sm'), ui.button('💥 Kill leader', () => { const l = leaders()[0]; if (l) toggle(l); else ev('No leader to kill.'); }, 'sm danger'), ui.button('♻️ Revive all', () => { nodes.forEach(n => { if (!n.alive) toggle(n); }); }, 'sm ok'), pauseB, ui.button('⏭ +100 ms', () => { paused = true; pauseB.innerHTML = '▶ Resume'; tick(100); draw(); }, 'sm'), SDA.ui.speedSelect(v => speed = v), ui.button('↺ Reset', reset, 'sm ghost')),
      el('div', {style:{margin:'10px 0'}}, partT.el),
      el('div', {class:'grid c2', style:{alignItems:'start'}}, el('div', {class:'chart-box'}, svg), el('div', null, el('b', null, 'Event log'), evBox)),
      el('div', {class:'legend', style:{margin:'8px 0'}}, el('span', {style:{color:css('--c-service')}}, '● follower'), el('span', {style:{color:'var(--warn)'}}, '● candidate / vote msgs'), el('span', {style:{color:'var(--ok)'}}, '● leader'), el('span', {style:{color:'var(--accent1)'}}, '● AppendEntries (big = carries entries)'), el('span', null, 'Click a node to kill/revive it')),
      el('h4', {style:{margin:'10px 0 6px'}}, 'Replicated logs (number = term; filled = committed)'), logBox);
    reset(); lp.resume();
  }
});
} catch(e){ console.error('[SDA] playground raft', e); SDA.errors.push({id:'raft', error:e}); }
})();
