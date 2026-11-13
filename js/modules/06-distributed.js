
/* =====================================================================
   PART 4 · MODULE 6 — DISTRIBUTED SYSTEMS
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, sv, esc, clamp, fmtNum} = SDA.u; const ui = SDA.ui;
const {sortGame} = SDA.m1helpers; const {fnv, css, frag} = SDA.ph;
const wait = ms => new Promise(r => setTimeout(r, SDA.reduced ? 60 : ms));

/* ---------- widgets ---------- */
function quorumViz(host){
  const P = {n:5, w:3, r:3}; let ver = 0, nodes = [];
  const row = el('div', {class:'pill-row', style:{gap:'10px', margin:'12px 0'}}); const res = el('div', {class:'verdict warn', role:'status'}); const stat = el('div');
  const reset = () => { ver = 0; nodes = Array.from({length:P.n}, () => 0); paint([], []); res.className = 'verdict warn'; res.textContent = 'Write a value, then read it back.'; };
  const pickK = k => { const a = [...Array(P.n).keys()]; SDA.u.shuffle(a); return a.slice(0, k); };
  function paint(wset, rset){ row.innerHTML = ''; nodes.forEach((v, i) => row.append(el('div', {style:{width:'64px', padding:'10px 4px', textAlign:'center', borderRadius:'12px', border:`2px solid ${rset.includes(i) ? 'var(--accent1)' : 'var(--border-strong)'}`, background:v === ver && ver ? 'color-mix(in srgb, var(--c-db) 30%, transparent)' : 'var(--surface)', boxShadow:wset.includes(i) ? '0 0 0 3px color-mix(in srgb, var(--c-db) 40%, transparent)' : 'none', transition:'all .3s'}}, el('div', {class:'mono', style:{fontSize:'11px', color:'var(--faint)'}}, 'node ' + (i + 1)), el('b', {class:'mono'}, 'v' + v)))); }
  function write(){ ver++; const s = pickK(P.w); s.forEach(i => nodes[i] = ver); paint(s, []); res.className = 'verdict ok'; res.textContent = `Wrote v${ver} to ${P.w} node(s): ${s.map(i => i + 1).join(', ')}. The other ${P.n - P.w} still hold older versions until repair.`; }
  function read(){ const s = pickK(P.r); const best = Math.max(...s.map(i => nodes[i])); paint([], s); const ok = best === ver; res.className = 'verdict ' + (ok ? 'ok' : 'bad'); res.textContent = ok ? `Read ${P.r} node(s) (${s.map(i => i + 1).join(', ')}); the highest version among them is v${best} — the latest. ✓` : `Read ${P.r} node(s) (${s.map(i => i + 1).join(', ')}) and none had v${ver}: STALE read (got v${best}). R + W = ${P.r + P.w} ≤ N = ${P.n}, so read and write sets can miss each other.`; }
  function trials(){ let stale = 0; const T = 10000; for (let t = 0; t < T; t++){ const w = new Set(pickK(P.w)); if (!pickK(P.r).some(i => w.has(i))) stale++; } const C = (n, k) => { if (k > n) return 0; let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return r; }; const theory = C(P.n - P.w, P.r) / C(P.n, P.r); stat.innerHTML = ''; stat.append(frag(h.math(`measured stale reads : ${(stale / T * 100).toFixed(2)}% of ${T} random write/read pairs
theory               : C(N−W, R) / C(N, R) = C(${P.n - P.w}, ${P.r}) / C(${P.n}, ${P.r}) = ${(theory * 100).toFixed(2)}%
tolerates            : writes survive ${P.n - P.w} node failure(s); reads survive ${P.n - P.r}`))); }
  const SL = {}; const S = (k, label) => (SL[k] = ui.slider({label, min:1, max:9, step:1, value:P[k], fmt:v => v, onInput:v => { P[k] = v; P.w = Math.min(P.w, P.n); P.r = Math.min(P.r, P.n); SL.w && SL.w.set(P.w); SL.r && SL.r.set(P.r); reset(); trials(); }}));
  host.append(el('div', {class:'ctl-grid'}, S('n', 'Replicas N').el, S('w', 'Write quorum W (≤ N)').el, S('r', 'Read quorum R (≤ N)').el), row, el('div', {class:'controls'}, ui.button('✍️ Write new version', write, 'sm primary'), ui.button('📖 Read', read, 'sm'), ui.button('🎲 Run 10,000 trials', trials, 'sm'), ui.button('↺ Reset', reset, 'sm ghost')), el('div', {style:{height:'8px'}}), res, stat);
  reset(); trials();
}
function fencingDemo(host, api){
  let fence = false, busy = false; const holder = el('div'); const res = el('div', {class:'verdict warn', role:'status'}, 'Toggle fencing tokens and press Run.');
  const d = new api.Diagram(holder, {title:'A lease, a pause, and two “owners”', w:760, h:250, alt:'Two clients take a lease from a lock service and write to storage; one pauses and writes late.', nodes:[{id:'c1', type:'service', label:'Client 1', x:90, y:60}, {id:'c2', type:'service', label:'Client 2', x:90, y:190}, {id:'lk', type:'ext', label:'Lock service', sub:'lease 10 s', x:380, y:125, w:140}, {id:'st', type:'db', label:'Storage', sub:'max token: —', x:650, y:125}], edges:[{from:'c1', to:'lk'}, {from:'c2', to:'lk'}, {from:'c1', to:'st', curve:-.1}, {from:'c2', to:'st', curve:.1}]});
  async function run(){
    if (busy) return; busy = true; let maxTok = 0; d.setSub('st', 'max token: —'); ['c1', 'c2', 'st'].forEach(n => d.setStatus(n, 'ok'));
    d.setCaption('Client 1 acquires the lease (token <b>33</b>).'); await d.flow([['c1', 'lk', 'acquire'], ['lk', 'c1', 'ok, token 33']]);
    d.setCaption('Client 1 hits a long <b>GC pause</b> (or VM freeze, or network stall)…'); d.setStatus('c1', 'hot'); await wait(900);
    d.setCaption('…the lease <b>expires</b>. Client 2 acquires it (token <b>34</b>) and writes.'); await d.flow([['c2', 'lk', 'acquire'], ['lk', 'c2', 'ok, token 34'], ['c2', 'st', 'write (34)']]); maxTok = 34; d.setSub('st', fence ? 'max token: 34' : 'data from C2');
    d.setCaption('Client 1 wakes up, still believing it holds the lock, and writes.'); d.setStatus('c1', 'ok'); await d.flow([['c1', 'st', 'write (33)']]);
    if (fence){ await d.flow([['st', 'c1', 'REJECT 33 < 34']]); res.className = 'verdict ok'; res.textContent = '✓ Storage rejected token 33 because it already saw 34. The stale lock holder cannot corrupt data.'; d.setCaption('<b>Fencing token</b> check at the storage layer saves the day.'); }
    else { d.setStatus('st', 'hot'); d.setSub('st', 'C1 overwrote C2!'); res.className = 'verdict bad'; res.textContent = '✗ Both clients wrote while each believed it held the lock. Client 1’s stale write overwrote Client 2’s — silent corruption.'; d.setCaption('A lease alone can’t stop a paused client. The <b>resource</b> must check a monotonically increasing token.'); }
    busy = false;
  }
  host.append(el('div', {class:'row', style:{gap:'16px'}}, ui.toggle({label:'Storage checks fencing tokens', checked:false, onChange:v => fence = v}).el, ui.button('▶ Run', run, 'sm primary')), holder, res);
}
function gossipSim(host, api){
  const P = {n:60, f:2}; let pts = [], inf = [], round = 0, msgs = 0, playing = false, acc = 0, hist = [];
  const cv = el('canvas', {height:560, style:{height:'280px'}, 'aria-label':'Nodes spreading a rumour by gossip'}); const box = el('div', {class:'chart-box'}, cv);
  const met = ui.metrics(null, [{id:'r', label:'Rounds so far', instant:true}, {id:'inf', label:'Nodes that know', unit:'%', max:100, instant:true}, {id:'m', label:'Messages sent', instant:true}, {id:'log', label:'≈ log₂(N) + ln(N)', instant:true, fmt:v => v.toFixed(1)}]);
  const reset = () => { pts = Array.from({length:P.n}, () => [Math.random(), Math.random()]); inf = new Array(P.n).fill(false); inf[0] = true; round = 0; msgs = 0; hist = [1]; playing = false; met.set('log', Math.log2(P.n) + Math.log(P.n)); upd(); draw([]); };
  function step(){ const sends = []; const cur = inf.slice(); inf.forEach((k, i) => { if (!k) return; for (let j = 0; j < P.f; j++){ const t = Math.floor(Math.random() * P.n); if (t === i) continue; msgs++; sends.push([i, t]); cur[t] = true; } }); inf = cur; round++; hist.push(inf.filter(Boolean).length); upd(); draw(sends); if (inf.every(Boolean)) playing = false; }
  function upd(){ met.set('r', round); met.set('inf', inf.filter(Boolean).length / P.n * 100); met.set('m', msgs); }
  function draw(sends){
    const W = box.clientWidth || 600, H = 280; cv.width = W * 2; const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0);
    const X = p => 14 + p[0] * (W * .62 - 28), Y = p => 14 + p[1] * (H - 28);
    g.strokeStyle = css('--accent1'); g.globalAlpha = .45; sends.forEach(([a, b]) => { g.beginPath(); g.moveTo(X(pts[a]), Y(pts[a])); g.lineTo(X(pts[b]), Y(pts[b])); g.stroke(); }); g.globalAlpha = 1;
    pts.forEach((p, i) => { g.fillStyle = inf[i] ? css('--c-db') : css('--border-strong'); g.beginPath(); g.arc(X(p), Y(p), 5, 0, 7); g.fill(); });
    const cx = W * .66, cw = W - cx - 10; g.strokeStyle = css('--border-strong'); g.strokeRect(cx, 14, cw, H - 40); g.fillStyle = css('--muted'); g.font = '11px ' + css('--font-mono'); g.fillText('infected per round', cx + 4, 10);
    g.strokeStyle = css('--c-db'); g.lineWidth = 2; g.beginPath(); hist.forEach((v, i) => { const x = cx + i * cw / Math.max(10, hist.length - 1), y = H - 26 - v / P.n * (H - 40); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.lineWidth = 1;
  }
  const lp = api.loop(dt => { if (!playing){ lp.pause(); return; } acc += dt; if (acc > (api.reduced ? .2 : .7)){ acc = 0; step(); } });
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Cluster size N', min:10, max:300, step:10, value:60, fmt:v => v, onInput:v => { P.n = v; reset(); }}).el, ui.slider({label:'Fan-out (peers contacted per round)', min:1, max:5, step:1, value:2, fmt:v => v, onInput:v => { P.f = v; reset(); }}).el), el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('▶ Spread a rumour', () => { if (inf.every(Boolean)) reset(); playing = true; lp.resume(); }, 'sm primary'), ui.button('⏭ One round', step, 'sm'), ui.button('↺ Reset', reset, 'sm ghost')), box, el('div', {style:{height:'10px'}}), met.el, el('p', {class:'lab-hint'}, 'Each round, every node that knows the rumour tells F random peers. Coverage grows exponentially, so rounds to reach everyone grow only logarithmically with N — the property that makes gossip scale.'));
  reset();
}
function deliverySim(host){
  const P = {loss:10, ack:10}; const out = el('div', {style:{marginTop:'12px'}});
  function run(){
    const N = 1000, MAX = 8, modes = [['At-most-once (send once, never retry)', 'amo'], ['At-least-once (retry until acked)', 'alo'], ['At-least-once + idempotent consumer (dedupe by message ID)', 'idem']];
    const rows = modes.map(([name, m]) => {
      let lost = 0, once = 0, dup = 0, sends = 0; const seen = new Set();
      for (let id = 0; id < N; id++){
        let processed = 0, acked = false, tries = 0;
        while (!acked && tries < (m === 'amo' ? 1 : MAX)){
          tries++; sends++;
          if (Math.random() < P.loss / 100) continue;
          if (m === 'idem'){ if (!seen.has(id)){ seen.add(id); processed++; } } else processed++;
          if (Math.random() >= P.ack / 100) acked = true;
        }
        if (processed === 0) lost++; else if (processed === 1) once++; else dup += processed - 1;
      }
      return [`<b>${name}</b>`, fmtNum(once), lost ? `<span style="color:var(--bad)">${lost}</span>` : '0', dup ? `<span style="color:var(--bad)">${dup}</span>` : '0', fmtNum(sends)];
    });
    out.innerHTML = ''; out.append(frag(h.table(['Semantics', 'Processed exactly once', 'Lost', 'Duplicate processing', 'Sends'], rows, [1, 2, 3, 4])));
    out.append(el('p', {class:'lab-hint'}, '1,000 messages. A lost message never reaches the consumer; a lost ack makes the sender think it failed, so it retries — and the consumer sees the message again. At most 8 attempts.'));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Message loss', min:0, max:50, step:1, value:10, fmt:v => v + '%', onInput:v => { P.loss = v; run(); }}).el, ui.slider({label:'Ack loss (or consumer crash before ack)', min:0, max:50, step:1, value:10, fmt:v => v + '%', onInput:v => { P.ack = v; run(); }}).el), out, el('div', {class:'controls'}, ui.button('🎲 Run again', run, 'sm')));
  run();
}
function outboxDemo(host, api){
  let mode = 'dual', crash = true, busy = false; const holder = el('div'); const res = el('div', {class:'verdict warn', role:'status'}, 'Pick a mode and press Run.');
  const d = new api.Diagram(holder, {title:'Publishing an event after a database write', w:800, h:260, alt:'An order service writes to its database and must publish an event to a broker that a consumer reads.', nodes:[{id:'svc', type:'service', label:'Order service', x:90, y:130}, {id:'db', type:'db', label:'Orders DB', sub:'orders + outbox', x:320, y:60, w:150}, {id:'rel', type:'service', label:'Outbox relay', sub:'CDC / poller', x:320, y:210, w:150}, {id:'bk', type:'queue', label:'Broker', x:560, y:130, w:120}, {id:'con', type:'service', label:'Email & inventory', x:720, y:130, w:140}], edges:[{from:'svc', to:'db'}, {from:'svc', to:'bk', curve:.2}, {from:'db', to:'rel'}, {from:'rel', to:'bk'}, {from:'bk', to:'con'}]});
  async function run(){
    if (busy) return; busy = true; d.setStatus('svc', 'ok'); d.setStatus('con', 'ok');
    if (mode === 'dual'){
      d.setCaption('Dual write: COMMIT the order row…'); await d.flow([['svc', 'db', 'INSERT order; COMMIT']]);
      if (crash){ d.setStatus('svc', 'down'); d.setCaption('…the service <b>crashes</b> before publishing.'); await wait(700); res.className = 'verdict bad'; res.textContent = '✗ The order exists but no event was ever published: no confirmation email, inventory never reserved. The two systems disagree permanently.'; }
      else { await d.flow([['svc', 'bk', 'OrderCreated'], ['bk', 'con']]); res.className = 'verdict warn'; res.textContent = 'Worked this time — but any crash or broker outage between the two writes loses the event (or, publishing first, sends an event for an order that rolled back).'; }
    } else {
      d.setCaption('Outbox: the order row <b>and</b> an outbox row are written in <b>one transaction</b>.'); await d.flow([['svc', 'db', 'INSERT order + outbox; COMMIT']]);
      if (crash){ d.setStatus('svc', 'down'); d.setCaption('The service crashes right after the commit — nothing is lost, the event is safely in the outbox table.'); await wait(700); }
      d.setCaption('The relay reads new outbox rows (polling or CDC on the WAL) and publishes them, marking each as sent.'); await d.flow([['db', 'rel', 'outbox row'], ['rel', 'bk', 'OrderCreated #81'], ['bk', 'con']]);
      res.className = 'verdict ok'; res.textContent = '✓ Event delivered even though the service crashed. The relay may publish twice after its own crash, so consumers dedupe by event ID (at-least-once + idempotency).';
    }
    busy = false;
  }
  host.append(el('div', {class:'row', style:{gap:'16px'}}, ui.select({label:'Mode', value:'dual', options:[['dual', 'Dual write (DB, then broker)'], ['outbox', 'Transactional outbox']], onChange:v => mode = v}).el, ui.toggle({label:'Crash right after the DB commit', checked:true, onChange:v => crash = v}).el, ui.button('▶ Run', run, 'sm primary')), holder, res);
}
function merkleDemo(host){
  const K = 16; let A = Array.from({length:K}, (_, i) => 'v' + i), B = A.slice(), last = '';
  const hash = s => (fnv(s) >>> 0).toString(16).padStart(8, '0').slice(0, 6);
  const tree = arr => { const lv = [arr.map((v, i) => hash('k' + i + '=' + v))]; while (lv[lv.length - 1].length > 1){ const p = lv[lv.length - 1], n = []; for (let i = 0; i < p.length; i += 2) n.push(hash(p[i] + p[i + 1])); lv.push(n); } return lv; };
  const svgBox = el('div', {class:'grid c2'}); const info = el('div', {class:'verdict ok', role:'status'});
  function draw(){
    const ta = tree(A), tb = tree(B); svgBox.innerHTML = '';
    [['Replica A', ta, tb], ['Replica B', tb, ta]].forEach(([name, t, o]) => {
      const W = 520, H = 210, s = sv('svg', {viewBox:`0 0 ${W} ${H}`, role:'img'}); const tt = sv('title'); tt.textContent = name + ' Merkle tree'; s.append(tt);
      const L = t.length;
      for (let d = L - 1; d >= 0; d--){ const row = t[d], y = 20 + (L - 1 - d) * 45; row.forEach((hh, i) => { const x = (i + .5) * W / row.length; if (d > 0){ [2 * i, 2 * i + 1].forEach(c => { const cx = (c + .5) * W / t[d - 1].length; const ln = sv('line', {x1:x, y1:y + 8, x2:cx, y2:y + 37}); ln.style.stroke = css('--edge'); s.append(ln); }); } const diff = hh !== o[d][i]; const r = sv('rect', {x:x - (d ? 26 : 13), y:y - 9, width:d ? 52 : 26, height:18, rx:4}); r.style.fill = diff ? 'color-mix(in srgb, var(--bad) 35%, var(--node-bg))' : css('--node-bg'); r.style.stroke = diff ? css('--bad') : css('--c-db'); s.append(r); const tx = sv('text', {x, y:y + 4, 'text-anchor':'middle'}); tx.style.font = (d ? '10px' : '8px') + ' var(--font-mono)'; tx.style.fill = css('--text'); tx.textContent = d ? hh : 'k' + i; s.append(tx); }); }
      svgBox.append(el('div', null, el('b', null, name), el('div', {class:'chart-box'}, s)));
    });
    info.textContent = last || 'Roots match: replicas are identical. Change a key on one replica.';
  }
  function compare(){ const ta = tree(A), tb = tree(B); let cmp = 0; const diffs = []; const walk = (d, i) => { cmp++; if (ta[d][i] === tb[d][i]) return; if (d === 0){ diffs.push(i); return; } walk(d - 1, 2 * i); walk(d - 1, 2 * i + 1); }; walk(ta.length - 1, 0); last = diffs.length ? `Compared ${cmp} hashes (instead of ${K} keys) to find the differing key(s): ${diffs.map(i => 'k' + i).join(', ')}. With millions of keys and few differences, this is the saving.` : `Compared 1 hash — the roots match, nothing to sync.`; info.className = 'verdict ' + (diffs.length ? 'warn' : 'ok'); draw(); return diffs; }
  host.append(el('div', {class:'controls'}, ui.button('✏️ Change a random key on B', () => { const i = Math.floor(Math.random() * K); B[i] = 'v' + i + '′' + Math.floor(Math.random() * 99); last = `Changed k${i} on replica B. The change propagates up: every ancestor hash differs (red).`; info.className = 'verdict warn'; draw(); }, 'sm primary'), ui.button('🔍 Find differences', compare, 'sm'), ui.button('🔄 Sync B → A', () => { const df = compare(); df.forEach(i => A[i] = B[i]); last = `Copied ${df.length} key(s). Roots now match.`; info.className = 'verdict ok'; draw(); }, 'sm'), ui.button('↺ Reset', () => { A = Array.from({length:K}, (_, i) => 'v' + i); B = A.slice(); last = ''; draw(); }, 'sm ghost')), el('div', {style:{height:'8px'}}), info, el('div', {style:{height:'8px'}}), svgBox);
  draw();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'fallacies', title:'The fallacies of distributed computing', minutes:7, tags:['fallacies','network','latency','partial failure'],
  summary:'Eight false assumptions that make distributed systems fail: the network is reliable, latency is zero, bandwidth is infinite, the network is secure, topology doesn’t change, there is one administrator, transport cost is zero, the network is homogeneous.',
  problem:`<p>A function call inside one program either returns or throws. A call to another service can also <strong>hang forever</strong>, arrive twice, arrive after you gave up, or succeed while telling you it failed. Code written as if remote calls were local calls fails in production in exactly these ways.</p>`,
  intuition:`Talking to someone in the same room vs sending letters across the country. In the room you know instantly whether they heard you. By post, letters get lost, arrive out of order, cross in the mail, and silence could mean “didn’t arrive”, “they’re busy” or “they replied and the reply got lost”.`,
  how:{
    steps:[`<b>The network is reliable</b> → it isn’t: retry with idempotency, use timeouts.`, `<b>Latency is zero</b> → every hop costs milliseconds: batch, cache, avoid chatty protocols.`, `<b>Bandwidth is infinite</b> → large payloads hurt: compress, paginate, stream.`, `<b>The network is secure</b> → encrypt and authenticate everything (mTLS, zero trust).`, `<b>Topology doesn’t change</b> → instances come and go: service discovery, no hard-coded IPs.`, `<b>There is one administrator</b> → many teams and providers change things independently.`, `<b>Transport cost is zero</b> → serialization CPU and cross-zone/egress fees are real money.`, `<b>The network is homogeneous</b> → mixed hardware, protocols and versions: design for compatibility.`],
    diagram:{title:'Partial failure: three outcomes look identical', w:740, h:230, alt:'A client calls a service; the request may be lost, processed but the reply lost, or slow.',
      nodes:[{id:'a', type:'service', label:'Orders', x:100, y:115}, {id:'n', type:'ext', label:'Network', x:370, y:115}, {id:'b', type:'service', label:'Payments', x:640, y:115}],
      edges:[{from:'a', to:'n'}, {from:'n', to:'b'}],
      steps:[
        {note:'Case 1: the request is <b>lost</b>. Payments never charged.', flow:[['a', 'n', 'charge ₹499'], ['n', 'b', '✗']], status:{n:'hot'}},
        {note:'Case 2: the charge <b>succeeds</b>, but the reply is lost.', status:{n:'ok'}, flow:[['a', 'n', 'charge'], ['n', 'b'], ['b', 'n', 'OK'], ['n', 'a', '✗']]},
        {note:'Case 3: Payments is just <b>slow</b> — the reply arrives after Orders timed out.', flow:[['a', 'n', 'charge'], ['n', 'b']], dwell:1800, hl:['b']},
        {note:'From Orders’ point of view all three are the same: <b>a timeout</b>. It cannot know whether the charge happened. Hence idempotency keys, retries and reconciliation.', hl:['a']}
      ]},
    deep:`<p>The first seven fallacies are attributed to L. Peter Deutsch and colleagues at Sun Microsystems (1994); James Gosling added the eighth. The deeper principle is <b>partial failure</b>: in a distributed system some parts fail while others keep running, and a node cannot distinguish a dead peer from a slow one or a broken link (the basis of the FLP impossibility result for deterministic consensus in fully asynchronous systems).</p><p>Practical consequences that recur in every later lesson: every remote call needs a <b>timeout</b>; retries need <b>idempotency</b>; you need <b>failure detectors</b> that tolerate false suspicion; and correctness must not depend on synchronized clocks.</p>`
  },
  tradeoffs:{use:[`As a checklist in every design review`, `When converting a monolith call into a network call`], avoid:[`Wrapping remote calls in APIs that hide their remoteness (“transparent RPC”)`], alt:[`Keep things local when the boundary isn’t worth it (modular monolith)`]},
  real:[
    {co:'Sun Microsystems', tier:'confirmed', text:'L. Peter Deutsch and colleagues formulated the fallacies; James Gosling added “the network is homogeneous”.', src:'Arnon Rotem-Gal-Oz, “Fallacies of Distributed Computing Explained”'},
    {co:'Amazon Builders’ Library', tier:'confirmed', text:'Amazon’s engineering articles on timeouts, retries and backoff with jitter exist precisely because remote calls fail in these ways.', src:'Marc Brooker, “Timeouts, retries, and backoff with jitter”, Amazon Builders’ Library'}
  ],
  mistakes:[`No timeout on a remote call (threads hang forever)`, `Retrying non-idempotent operations`, `Treating “timeout” as “didn’t happen”`],
  interview:[`For every arrow on your diagram, be ready to say what happens if it’s slow, lost or duplicated`],
  tryit:{quiz:[
    {q:'Your service calls Payments and times out. What do you know?', options:['The charge failed', 'The charge succeeded', 'Nothing certain — it may or may not have happened', 'Payments is down'], answer:2, why:'Lost request, lost reply and slow processing all look like a timeout. Hence idempotency keys and reconciliation.'},
    {q:'A design moves 50 MB of images between services on every request. Which fallacy?', options:['The network is secure', 'Bandwidth is infinite', 'There is one administrator', 'Topology doesn’t change'], answer:1, why:'Bandwidth (and transport cost) are finite.'},
    {q:'Config hard-codes the IP of a downstream service. Which fallacy?', options:['Topology doesn’t change', 'Latency is zero', 'The network is reliable', 'Transport cost is zero'], answer:0, why:'Instances move; use service discovery.'}
  ]},
  sources:[`Deutsch et al., “Fallacies of Distributed Computing” (1994)`, `Fischer, Lynch & Paterson, “Impossibility of Distributed Consensus with One Faulty Process” (JACM 1985)`, `Amazon Builders’ Library`]
},
{
  id:'cap-pacelc', title:'CAP and PACELC', minutes:10, tags:['CAP','PACELC','partition','availability','consistency'],
  summary:'During a network partition you must choose: refuse some requests (consistency) or answer them with possibly stale data (availability). Even without partitions, you trade latency for consistency.',
  problem:`<p>Your system runs in Mumbai and Singapore. The link between them breaks for 10 minutes. A user in Singapore tries to buy the last concert ticket, which someone in Mumbai may have bought a moment ago. Do you <strong>refuse</strong> the sale until the link heals, or <strong>allow</strong> it and risk selling the ticket twice?</p>`,
  intuition:`Two bank branches sharing one ledger by phone. The phone line goes dead. Each branch can either stop withdrawals until the line returns (consistent but unavailable) or keep serving customers from its own copy and sort out overdrafts later (available but possibly inconsistent). There is no third option while the line is down.`,
  how:{
    steps:[`<b>C</b> (in CAP) = linearizability: every read sees the latest write, as if there were one copy.`, `<b>A</b> = every request to a non-failed node gets a (non-error) response.`, `<b>P</b> = the system keeps working despite messages being lost between nodes.`, `Partitions <b>will</b> happen, so the real choice is during a partition: <b>CP</b> (reject/timeout on the minority side) or <b>AP</b> (answer, reconcile later).`, `<b>PACELC</b>: if Partition → choose A or C; Else (normal operation) → choose Latency or Consistency. Waiting for remote replicas costs latency even on a healthy day.`, `Choose per operation: ticket purchase CP, “likes” count AP.`],
    diagram:{title:'A partition forces a choice', w:780, h:270, alt:'Two regions with replicas; the link breaks; one design rejects writes on the minority side, the other accepts and reconciles later.',
      nodes:[{id:'u1', type:'client', label:'Buyer, Mumbai', x:80, y:70, w:130}, {id:'u2', type:'client', label:'Buyer, Singapore', x:80, y:200, w:140}, {id:'m', type:'db', label:'Replica Mumbai', sub:'2 of 3 nodes', x:400, y:70, w:150}, {id:'s', type:'db', label:'Replica Singapore', sub:'1 of 3 nodes', x:400, y:200, w:150}, {id:'x', type:'ext', label:'Link', x:620, y:135, w:90}],
      edges:[{from:'u1', to:'m'}, {from:'u2', to:'s'}, {from:'m', to:'x'}, {from:'x', to:'s'}],
      steps:[
        {note:'Normally, writes replicate between regions.', flow:[['u1', 'm', 'buy'], ['m', 'x', 'replicate'], ['x', 's']]},
        {note:'The inter-region link <b>breaks</b>: a partition.', status:{x:'down'}, hl:['x']},
        {note:'<b>CP choice:</b> Singapore can’t reach a majority, so it <b>refuses</b> the purchase (error/timeout). No double sale, but unavailable there.', flow:[['u2', 's', 'buy'], ['s', 'u2', '503']], hl:['s']},
        {note:'<b>AP choice:</b> Singapore <b>accepts</b> the sale locally. Mumbai also sold the ticket. When the link heals, the conflict must be resolved (refund one buyer, LWW, merge).', flow:[['u2', 's', 'buy'], ['s', 'u2', 'OK'], ['u1', 'm', 'buy'], ['m', 'u1', 'OK']], status:{s:'hot', m:'hot'}}
      ]},
    deep:`<p><b>Precision matters:</b> CAP’s proof (Gilbert & Lynch, 2002) uses linearizability and total availability; real systems have many intermediate options (bounded staleness, read-your-writes) and are rarely purely CP or AP. Brewer’s “CAP Twelve Years Later” (2012) stresses that partitions are rare, that the choice can be made per operation and per data item, and that systems should detect partitions, operate in a degraded mode, and run recovery afterwards.</p><p><b>PACELC</b> (Abadi) captures everyday behaviour: DynamoDB and Cassandra default to low latency with eventual consistency (PA/EL) but offer stronger options; Spanner and other consensus-based databases are PC/EC — they pay cross-replica latency on every write (and TrueTime commit wait) to stay strictly consistent.</p>`
  },
  tradeoffs:{use:[`<b>CP</b> for money movement, inventory, uniqueness (usernames), leader election, locks`, `<b>AP</b> for feeds, likes, carts, presence, DNS, caches`], avoid:[`Calling a system “CA” — you can’t opt out of partitions in a distributed system`, `One global choice for every operation`], alt:[`Tunable consistency per request (Cassandra, DynamoDB)`, `CRDTs for conflict-free AP data`]},
  real:[
    {co:'Eric Brewer / Gilbert & Lynch', tier:'confirmed', text:'Brewer presented the CAP conjecture at PODC 2000; Gilbert and Lynch proved it in 2002; Brewer revisited it in 2012.', src:'Gilbert & Lynch, SIGACT News 2002; Brewer, “CAP Twelve Years Later”, IEEE Computer 2012'},
    {co:'Amazon Dynamo', tier:'confirmed', text:'Chose availability for the shopping cart: during failures it accepts writes and reconciles divergent versions (vector clocks, client-side merge).', src:'DeCandia et al., SOSP 2007'},
    {co:'Google Spanner', tier:'confirmed', text:'Chooses consistency: strictly serializable transactions via Paxos and TrueTime; Google argues it is “effectively CA” because partitions are made extremely rare by its private network.', src:'Eric Brewer, “Spanner, TrueTime and the CAP Theorem” (Google, 2017)'}
  ],
  mistakes:[`Thinking CAP applies when there is no partition (that’s PACELC’s “else”)`, `Picking AP for data with hard invariants`, `Not designing the reconciliation step for AP data`],
  interview:[`Say CP or AP per operation and justify with business impact`, `Mention PACELC: even without partitions, consistency costs latency`],
  tryit:{note:'Create a partition, set N/R/W, and see which side stays available and which reads go stale.', pg:'cap-quorum'},
  sources:[`Gilbert & Lynch (2002)`, `Brewer (2012, 2017)`, `Daniel Abadi, “Consistency Tradeoffs in Modern Distributed Database System Design”, IEEE Computer 2012`]
},
{
  id:'consistency-models', title:'Consistency models', minutes:10, tags:['linearizability','sequential consistency','causal consistency','eventual consistency','read-your-writes','monotonic reads'],
  summary:'A ladder of promises about what reads can return: linearizable → sequential → causal → read-your-writes/monotonic reads → eventual. Stronger is simpler to program, weaker is faster and more available.',
  problem:`<p>You post a comment and refresh — it’s gone. Your friend sees a reply “Congrats!” before the post it replies to. The like counter shows 10, then 8, then 10. None of these are bugs in the usual sense; each is a specific consistency guarantee the system chose not to provide.</p>`,
  intuition:`A group chat. <b>Linearizable</b>: everyone sees messages in one real-time order, instantly. <b>Causal</b>: replies always appear after what they reply to, but unrelated messages can appear in different orders on different phones. <b>Eventual</b>: everyone ends up with the same history, but meanwhile phones can disagree in any way. <b>Read-your-writes</b>: at least you always see your own messages.`,
  how:{
    steps:[`<b>Linearizable</b> (strong): operations appear to take effect atomically at some instant between start and end, in real-time order. One copy illusion.`, `<b>Sequential</b>: all clients see the same order, consistent with each client’s program order — but not necessarily real time.`, `<b>Causal</b>: if A could have influenced B (B read A, or same client did A then B), everyone sees A before B. Concurrent writes may be seen in different orders.`, `<b>Session guarantees</b>: <i>read-your-writes</i> (see your own updates), <i>monotonic reads</i> (never go back in time), <i>monotonic writes</i>, <i>writes-follow-reads</i>.`, `<b>Eventual</b>: if writes stop, replicas converge. No ordering promise meanwhile.`, `Pick the weakest model your feature tolerates — and add session guarantees, which users notice most.`],
    stepper:{title:'The ladder, strongest to weakest', items:[
      {title:'Linearizable', tag:'real-time order', text:'A read after a completed write (anywhere) returns it. Needed for locks, leader election, unique usernames. Costs latency (consensus/quorums) and availability under partition.'},
      {title:'Sequential', tag:'one global order', text:'Everyone agrees on one order of all operations, consistent with each client’s own order, but it may lag real time.'},
      {title:'Causal', tag:'cause before effect', text:'Replies after posts, comments after the article they reference. Achievable while staying available during partitions.'},
      {title:'Read-your-writes', tag:'session', text:'You always see your own changes — route your reads to the leader briefly, or to a replica that has your write.'},
      {title:'Monotonic reads', tag:'session', text:'Once you’ve seen a value, you never see an older one — stick each user to one replica.'},
      {title:'Eventual', tag:'converges', text:'Replicas agree once writes stop. Fine for counters, feeds and caches.'}
    ]},
    deep:`<p><b>Formal roots:</b> linearizability (Herlihy & Wing, 1990), sequential consistency (Lamport, 1979). Linearizability is <i>composable</i> per object; serializability is about transactions over many objects — “strict serializability” combines both (Spanner provides it).</p><p><b>Implementations:</b> linearizable reads from a Raft group need the leader to confirm it is still leader (read index or a lease); causal consistency is tracked with vector clocks or dependency metadata (COPS, MongoDB causal sessions); session guarantees use client-tracked tokens (e.g. the log position of your last write). Jepsen’s consistency-model map is a great reference for how models relate.</p>`
  },
  tradeoffs:{use:[`<b>Linearizable</b> for coordination and uniqueness`, `<b>Causal + session guarantees</b> for social and collaborative features`, `<b>Eventual</b> for counters, analytics, caches`], avoid:[`Eventual consistency without read-your-writes for user-edited data`, `Linearizability everywhere “to be safe” (latency, availability cost)`], alt:[`Bounded staleness (reads at most X seconds old)`, `Tunable consistency per request`]},
  real:[
    {co:'Azure Cosmos DB', tier:'confirmed', text:'Exposes five selectable consistency levels: strong, bounded staleness, session, consistent prefix and eventual — the ladder as a product setting.', src:'Azure Cosmos DB documentation — consistency levels'},
    {co:'MongoDB', tier:'confirmed', text:'Offers causally consistent client sessions guaranteeing read-your-writes, monotonic reads and writes, and writes-follow-reads.', src:'MongoDB manual — causal consistency'},
    {co:'Jepsen', tier:'confirmed', text:'Publishes a map of consistency models and tests real databases against their claimed guarantees.', src:'jepsen.io — consistency models'}
  ],
  mistakes:[`“Strong consistency” used without saying which model`, `Ignoring session guarantees that users notice immediately`, `Assuming one replica read after a write is linearizable`],
  interview:[`Name the model each feature needs and how you’d provide it (leader reads, sticky sessions, quorums)`],
  tryit:{note:'Which guarantee is broken in each story?', mount:host => sortGame(host, [
    {t:'You post a comment, refresh, and it’s gone', c:'ryw', why:'You didn’t see your own write → read-your-writes.'},
    {t:'Likes show 10, then 8, then 10 as you refresh', c:'mono', why:'Reads went back in time — different replicas → monotonic reads.'},
    {t:'A friend sees “Congrats!” before the “I got the job” post it replies to', c:'causal', why:'Effect visible before cause → causal consistency.'},
    {t:'You rename yourself; your next page load shows the old name', c:'ryw', why:'Your own update invisible to you.'},
    {t:'An answer appears in your feed before its question', c:'causal', why:'Causally dependent items out of order.'},
    {t:'A list re-shows an older version of an item you already saw', c:'mono', why:'Going backwards in time.'},
    {t:'Every balance read reflects all completed transfers immediately', c:'ok', why:'That’s what linearizability provides.'}
  ], [{id:'ryw', label:'Read-your-writes'}, {id:'mono', label:'Monotonic reads'}, {id:'causal', label:'Causal'}, {id:'ok', label:'No violation'}])},
  sources:[`Herlihy & Wing, TOPLAS 1990`, `Lamport, IEEE Trans. Computers 1979`, `Terry et al., “Session Guarantees for Weakly Consistent Replicated Data” (1994)`, `jepsen.io/consistency`]
},
{
  id:'quorums', title:'Quorums: R + W > N', minutes:8, tags:['quorum','R+W>N','sloppy quorum','hinted handoff','read repair'],
  summary:'With N replicas, writing to W and reading from R guarantees the read sees the latest write whenever R + W > N, because the two sets must overlap.',
  problem:`<p>A Dynamo-style store keeps 3 copies of each cart. Writing to all 3 makes every write wait for the slowest replica and fail if one is down. Writing to 1 is fast — but a read from another replica may miss it. How many replicas must a write and a read touch?</p>`,
  intuition:`A three-person committee keeps the official minutes. If every decision is told to at least 2 members, and every question is asked to at least 2 members, at least one person you ask was told about the latest decision — two groups of 2 out of 3 must share someone.`,
  how:{
    steps:[`N = replicas of each item; W = acks needed for a write; R = replicas consulted per read.`, `<b>R + W &gt; N</b> → every read set intersects every write set → the read includes at least one latest copy (pick the highest version).`, `Common choice: N = 3, W = 2, R = 2 (tolerates one slow/down replica for both).`, `W = N, R = 1: fast reads, fragile writes. W = 1, R = N: fast writes, fragile reads.`, `<b>Read repair</b>: if a read sees stale replicas, write the newest value back to them. <b>Anti-entropy</b> (Merkle trees) repairs in the background.`, `<b>Sloppy quorum + hinted handoff</b>: during failures, write to substitute nodes to stay available — then R + W &gt; N no longer guarantees overlap.`],
    diagram:{title:'N = 3, W = 2, R = 2', w:740, h:240, alt:'A write reaches two of three replicas; a read of two replicas always includes at least one updated replica.',
      nodes:[{id:'c', type:'client', label:'Coordinator', x:90, y:120, w:130}, {id:'r1', type:'db', label:'Replica 1', x:420, y:45}, {id:'r2', type:'db', label:'Replica 2', x:420, y:120}, {id:'r3', type:'db', label:'Replica 3', x:420, y:195}],
      edges:[{from:'c', to:'r1'}, {from:'c', to:'r2'}, {from:'c', to:'r3'}],
      steps:[
        {note:'Write v2: sent to all three, acknowledged once <b>2</b> confirm. Replica 3 is slow and still has v1.', flow:[['c', 'r1', 'v2'], ['c', 'r2', 'v2']], parallel:true, sub:{r1:'v2', r2:'v2', r3:'v1'}},
        {note:'Read with R = 2 hits replicas 2 and 3: they return v2 and v1. The highest version, <b>v2</b>, wins.', flow:[['r2', 'c', 'v2'], ['r3', 'c', 'v1']], parallel:true, hl:['r2', 'r3']},
        {note:'<b>Read repair:</b> the coordinator writes v2 back to replica 3.', flow:[['c', 'r3', 'repair v2']], sub:{r3:'v2'}, hl:['r3']},
        {note:'Any 2 of 3 overlap with any other 2 of 3 — that’s the whole trick.', hl:['r1', 'r2', 'r3']}
      ]},
    deep:`<p><b>Quorums ≠ linearizability.</b> Even with R + W &gt; N, races between concurrent writes and reads, sloppy quorums, and last-write-wins with skewed clocks can produce non-linearizable results (Kleppmann, DDIA ch. 5). Linearizable registers over quorums need extra steps (e.g. ABD’s read-then-write-back).</p><p><b>Latency maths (PACELC’s “EL”):</b> a write waits for the W-th fastest replica, so higher W means higher tail latency. Cassandra exposes this per request (<code>ONE</code>, <code>QUORUM</code>, <code>LOCAL_QUORUM</code>, <code>ALL</code>); <code>LOCAL_QUORUM</code> avoids cross-region round trips while staying consistent within a region.</p>`
  },
  tradeoffs:{use:[`<b>W = R = majority</b> for consistent reads with fault tolerance`, `<b>W = 1, R = 1</b> for maximum speed when staleness is fine`, `<b>LOCAL_QUORUM</b> in multi-region setups`], avoid:[`Assuming quorums give transactions or linearizability`, `Sloppy quorums for data that needs strict overlap`], alt:[`Leader-based replication with consensus (Raft)`]},
  real:[
    {co:'Amazon Dynamo', tier:'confirmed', text:'Uses configurable N, R and W (a common configuration was N=3, R=2, W=2), sloppy quorums and hinted handoff.', src:'DeCandia et al., SOSP 2007'},
    {co:'Apache Cassandra', tier:'confirmed', text:'Lets each request choose a consistency level such as ONE, QUORUM, LOCAL_QUORUM or ALL, and uses read repair plus Merkle-tree anti-entropy repair.', src:'Apache Cassandra documentation'}
  ],
  mistakes:[`R + W ≤ N while expecting fresh reads`, `Forgetting that W = N makes writes fail whenever any replica is down`, `No repair process — replicas drift forever`],
  interview:[`Write the overlap argument: |R| + |W| > N ⇒ R ∩ W ≠ ∅`, `Discuss latency vs consistency per W/R choice`],
  tryit:{note:'Set N, W and R. Write and read — and run 10,000 trials to compare the measured stale-read rate with the formula.', mount:host => quorumViz(host)},
  sources:[`DeCandia et al., SOSP 2007`, `Gifford, “Weighted Voting for Replicated Data” (SOSP 1979)`, `Kleppmann, DDIA ch. 5`]
},
{
  id:'clocks', title:'Clocks: physical, Lamport, vector, hybrid', minutes:11, tags:['clock skew','NTP','Lamport clock','vector clock','HLC','TrueTime'],
  summary:'Machine clocks drift and jump, so you can’t order events across machines by wall time. Logical clocks capture causality instead; hybrid clocks combine both.',
  problem:`<p>Two servers record “withdraw ₹500” at 10:00:00.120 and “deposit ₹500” at 10:00:00.118 — but the deposit really happened first; one clock was 5 ms fast. Last-write-wins by timestamp just discarded the wrong update. Wall clocks can’t safely order events across machines.</p>`,
  intuition:`Students in an exam hall with their own watches, each a bit off. If you sort answer sheets by watch time, you’ll misorder some. Instead, number events by “I saw your paper #4, so mine is #5” (Lamport), or each keeps a tally of what they’ve seen from everyone (vector clock) — that captures who could have copied from whom, regardless of watches.`,
  how:{
    steps:[`<b>Physical clocks</b> drift; NTP keeps them within milliseconds (more on busy networks); clocks can jump backwards (NTP step, leap seconds, VM migration). Use <b>monotonic</b> clocks for measuring durations.`, `<b>Lamport clock</b>: a counter; increment on every event; send it with messages; on receive set to max(local, received) + 1. If a → b then L(a) &lt; L(b) — but not the reverse.`, `<b>Vector clock</b>: one counter per node. Compare element-wise: if every entry ≤ and one &lt;, a happened before b; otherwise they are <b>concurrent</b> (a real conflict).`, `<b>Hybrid logical clock (HLC)</b>: physical time plus a logical counter — close to wall time, but respects causality.`, `<b>TrueTime</b> (Spanner): GPS/atomic clocks give an explicit uncertainty interval; commits wait out the uncertainty to guarantee real-time ordering.`],
    diagram:{title:'Lamport timestamps across three processes', w:760, h:240, alt:'Three processes exchange messages; each event gets a Lamport timestamp that respects causality.',
      nodes:[{id:'a', type:'service', label:'A', sub:'L=0', x:110, y:120}, {id:'b', type:'service', label:'B', sub:'L=0', x:380, y:50}, {id:'c', type:'service', label:'C', sub:'L=0', x:650, y:170}],
      edges:[{from:'a', to:'b'}, {from:'b', to:'c'}, {from:'a', to:'c'}],
      steps:[
        {note:'A does a local event: L = 1. Then sends to B with timestamp 2.', sub:{a:'L=2'}, flow:[['a', 'b', 'msg @2']], hl:['a']},
        {note:'B receives: L = max(0, 2) + 1 = <b>3</b>.', sub:{b:'L=3'}, hl:['b']},
        {note:'B sends to C (L = 4). C, which had done 1 local event (L=1), sets L = max(1, 4) + 1 = <b>5</b>.', sub:{b:'L=4', c:'L=5'}, flow:[['b', 'c', 'msg @4']], hl:['c']},
        {note:'Causality is respected: A’s send (2) &lt; B’s receive (3) &lt; C’s receive (5). But C’s first local event (L=1) and A’s (L=1) are <b>concurrent</b> — Lamport numbers alone can’t tell you that; vector clocks can.', hl:['a', 'c']}
      ]},
    deep:`<p><b>Lamport (1978)</b> defined happens-before and logical clocks; <b>vector clocks</b> (Fidge, Mattern, 1988) characterise causality exactly but grow with the number of participants (Dynamo-style systems prune them; “dotted version vectors” refine them). <b>HLC</b> (Kulkarni et al., 2014) keeps timestamps within a bounded distance of physical time — CockroachDB uses HLCs plus a maximum clock-offset setting (nodes that drift too far shut themselves down).</p><p><b>Spanner’s TrueTime</b> exposes <code>TT.now()</code> as an interval [earliest, latest]; a transaction commits at timestamp s and waits until <code>TT.after(s)</code> before acknowledging (commit wait), which makes timestamp order match real-time order. <b>Real incident:</b> on 1 January 2017, a leap second made a time measurement in Cloudflare’s DNS software go negative, causing errors for some customers — a reminder to use monotonic clocks for durations.</p>`
  },
  tradeoffs:{use:[`<b>Monotonic clocks</b> for timeouts and durations`, `<b>Lamport</b> for a total order consistent with causality (with a node-ID tie-break)`, `<b>Vector clocks</b> to detect concurrent updates (conflicts)`, `<b>HLC</b> for database timestamps close to wall time`], avoid:[`Last-write-wins by wall clock for important data`, `Assuming NTP-synchronised clocks agree to the millisecond`], alt:[`A single sequencer (Raft leader) to order events`, `CRDTs that don’t need ordering at all`]},
  real:[
    {co:'Leslie Lamport', tier:'confirmed', text:'“Time, Clocks, and the Ordering of Events in a Distributed System” (1978) introduced happens-before and logical clocks.', src:'Lamport, CACM 1978'},
    {co:'Google Spanner', tier:'confirmed', text:'Uses TrueTime, backed by GPS receivers and atomic clocks, with explicit uncertainty and commit wait to provide external consistency.', src:'Corbett et al., OSDI 2012'},
    {co:'CockroachDB', tier:'confirmed', text:'Uses hybrid logical clocks for transaction timestamps and requires a configured maximum clock offset between nodes.', src:'CockroachDB documentation'},
    {co:'Cloudflare', tier:'confirmed', text:'A leap second on 1 January 2017 triggered a bug where a computed duration became negative in its DNS software, causing failures for some lookups.', src:'Cloudflare blog, “How and why the leap second affected Cloudflare DNS” (2017)'}
  ],
  mistakes:[`Using wall-clock time to measure elapsed durations`, `LWW conflict resolution across machines with skewed clocks`, `Unbounded vector clocks with many writers`],
  interview:[`Explain why wall clocks can’t order cross-machine events, then Lamport vs vector clocks`],
  tryit:{note:'Build a space-time diagram: create events and messages, then compare Lamport and vector clocks for any two events.', pg:'vector-clock'},
  sources:[`Lamport, CACM 1978`, `Fidge (1988); Mattern (1988)`, `Kulkarni et al., “Logical Physical Clocks” (OPODIS 2014)`, `Corbett et al., Spanner, OSDI 2012`]
},
{
  id:'consensus-raft', title:'Consensus: Paxos, Raft and leader election', minutes:12, tags:['consensus','Raft','Paxos','leader election','term','log replication','majority'],
  summary:'Consensus lets a group of machines agree on one ordered log of decisions even when some crash — the foundation of leader election, configuration stores and strongly consistent databases.',
  problem:`<p>Five config servers must agree on “who is the primary database right now”. If two servers each believe they are in charge, both accept writes and the data forks (split brain). Machines crash, restart and get cut off at any moment. How do they agree on <em>one</em> answer that never changes once decided?</p>`,
  intuition:`A committee of five that only acts on decisions written in the official minutes. A chair (leader) proposes each line; it becomes official once a majority (3) have copied it. If the chair disappears, members wait a random time and then volunteer; the first volunteer to get 3 votes for a new term becomes chair. Any two majorities overlap, so no two chairs can both get a majority in the same term.`,
  how:{
    steps:[`Nodes are <b>followers</b>, <b>candidates</b> or a <b>leader</b>. Time is divided into numbered <b>terms</b>.`, `Followers expect heartbeats from the leader. If none arrives within a <b>randomised election timeout</b>, a follower becomes a candidate, increments the term and requests votes.`, `Each node votes for at most one candidate per term, and only if the candidate’s log is at least as up to date as its own. A <b>majority</b> of votes wins.`, `The leader appends client commands to its log and replicates them (AppendEntries). An entry is <b>committed</b> once stored on a majority; then it is applied to the state machine.`, `If a leader is partitioned in a minority, it can’t commit anything; the majority side elects a new leader with a higher term, and the old leader steps down when it sees that term.`, `With 2f + 1 nodes, the cluster tolerates f failures (5 nodes → 2).`],
    diagram:{title:'Leader election and log replication', w:760, h:280, alt:'Five nodes: the leader fails, a follower times out, wins votes, and replicates a new entry to a majority.',
      nodes:[{id:'s1', type:'service', label:'S1', sub:'leader · term 1', x:380, y:40, w:130}, {id:'s2', type:'service', label:'S2', sub:'follower', x:620, y:110, w:120}, {id:'s3', type:'service', label:'S3', sub:'follower', x:560, y:235, w:120}, {id:'s4', type:'service', label:'S4', sub:'follower', x:200, y:235, w:120}, {id:'s5', type:'service', label:'S5', sub:'follower', x:140, y:110, w:120}],
      edges:[{from:'s1', to:'s2'}, {from:'s1', to:'s3'}, {from:'s1', to:'s4'}, {from:'s1', to:'s5'}, {from:'s5', to:'s2', curve:.15}, {from:'s5', to:'s3', curve:.1}, {from:'s5', to:'s4'}],
      steps:[
        {note:'S1 is leader in term 1 and sends heartbeats.', flow:[['s1', 's2', '♥'], ['s1', 's3', '♥'], ['s1', 's4', '♥'], ['s1', 's5', '♥']], parallel:true, hl:['s1']},
        {note:'S1 crashes. Followers stop hearing heartbeats.', status:{s1:'down'}},
        {note:'S5’s randomised timeout fires first: it becomes a <b>candidate</b> for term 2 and requests votes.', sub:{s5:'candidate · term 2'}, flow:[['s5', 's2', 'vote? t2'], ['s5', 's3', 'vote? t2'], ['s5', 's4', 'vote? t2']], parallel:true, hl:['s5']},
        {note:'S2, S3, S4 grant their votes (one per term). With its own vote S5 has <b>4 of 5</b> — a majority. S5 is leader of term 2.', flow:[['s2', 's5', 'yes'], ['s3', 's5', 'yes'], ['s4', 's5', 'yes']], parallel:true, sub:{s5:'leader · term 2'}, hl:['s5']},
        {note:'A client write is appended and replicated; once 3 of 5 nodes store it, it is <b>committed</b>.', flow:[['s5', 's2', 'append x=7'], ['s5', 's4', 'append x=7']], parallel:true, sub:{s2:'x=7 ✓', s4:'x=7 ✓', s5:'leader · x=7 committed'}}
      ]},
    deep:`<p><b>Safety arguments:</b> <i>election safety</i> (at most one leader per term, because majorities intersect), <i>log matching</i> (AppendEntries carries the previous entry’s index and term, so logs agree up to any matching entry), and <i>leader completeness</i> (a candidate can only win if its log is at least as up to date as a majority’s, so committed entries are never lost).</p><p><b>Paxos</b> (Lamport) solves the same problem with proposers, acceptors and two phases (prepare/promise, accept/accepted); Multi-Paxos with a stable leader looks much like Raft. Raft was designed for understandability. <b>Practicalities:</b> linearizable reads need the leader to confirm leadership (ReadIndex or leases); membership changes need joint consensus or single-server changes; logs are compacted with snapshots. Consensus clusters are kept small (3–5 nodes) because every commit needs a majority round trip.</p>`
  },
  tradeoffs:{use:[`Leader election, distributed locks, configuration and service discovery (etcd, ZooKeeper, Consul)`, `Strongly consistent replicated databases (Spanner, CockroachDB, TiKV)`], avoid:[`Putting consensus on every high-throughput data write without sharding into many groups`, `Even-numbered clusters (4 tolerates no more failures than 3)`], alt:[`A managed coordination service instead of building your own`, `Leaderless replication when availability beats consistency`]},
  real:[
    {co:'Raft', tier:'confirmed', text:'Introduced by Ongaro and Ousterhout (2014) as an understandable consensus algorithm; used by etcd (Kubernetes’ datastore), Consul, CockroachDB and TiKV.', src:'Ongaro & Ousterhout, USENIX ATC 2014; project documentation'},
    {co:'Google Chubby', tier:'confirmed', text:'A Paxos-based lock service used for leader election and small configuration data across Google systems such as Bigtable.', src:'Burrows, “The Chubby lock service”, OSDI 2006'},
    {co:'Apache Kafka (KRaft)', tier:'confirmed', text:'Replaced its ZooKeeper dependency with a built-in Raft-based metadata quorum (KIP-500).', src:'Apache Kafka KIP-500 and documentation'}
  ],
  mistakes:[`Building your own consensus instead of using etcd/ZooKeeper/Consul`, `Two-node clusters (no majority after one failure)`, `Reading from followers and calling it linearizable`],
  interview:[`Explain terms, randomised timeouts, majority votes and commit-on-majority in 60 seconds`, `Say how many failures 3 and 5 nodes tolerate`],
  tryit:{note:'A live 5-node Raft simulation: kill the leader, partition the cluster, send writes, and watch terms, votes and logs.', pg:'raft'},
  sources:[`Ongaro & Ousterhout, “In Search of an Understandable Consensus Algorithm”, USENIX ATC 2014`, `Lamport, “Paxos Made Simple” (2001)`, `Burrows, Chubby, OSDI 2006`, `raft.github.io`]
},
{
  id:'distributed-locks', title:'Distributed locks, leases and fencing tokens', minutes:9, tags:['distributed lock','lease','fencing token','Redlock','ZooKeeper'],
  summary:'A distributed lock is really a lease that expires. Because clients can pause, the protected resource must reject stale holders using monotonically increasing fencing tokens.',
  problem:`<p>Only one worker should process the nightly payout file. Worker 1 takes a lock in Redis with a 30-second expiry, then freezes for 40 seconds in garbage collection. The lock expires, Worker 2 takes it and starts processing. Worker 1 wakes up still believing it holds the lock. Now two workers pay out the same file.</p>`,
  intuition:`A hotel key card that stops working at checkout time. A guest who falls asleep past checkout still has the card in their pocket and may wander back. The door (the resource) must check that the card number is the newest one issued for the room — not just trust that whoever holds a card is allowed in.`,
  how:{
    steps:[`Locks across machines must <b>expire</b> (a lease), or a crashed holder blocks everyone forever.`, `Expiry creates the danger: a paused holder doesn’t know its lease ended.`, `<b>Fencing token</b>: each lease grant comes with a strictly increasing number. The holder sends it with every write; the storage rejects any token lower than the highest it has seen.`, `Use a <b>consensus-backed</b> service (ZooKeeper, etcd, Consul) for locks whose correctness matters; they provide session/lease semantics and monotonic IDs (e.g. ZooKeeper’s zxid, etcd revisions).`, `If a lock is only an efficiency optimisation (avoid duplicate work occasionally), a simpler Redis lock may be fine.`],
    stepper:{title:'Why the lease alone isn’t enough', items:[
      {title:'Acquire', tag:'token 33', text:'Worker 1 gets the lease (30 s) and fencing token 33.'},
      {title:'Pause', tag:'GC / VM / network', text:'Worker 1 stalls for 40 s — it can’t observe time passing.'},
      {title:'Expire', tag:'lease ends', text:'The lock service lets the lease expire; it has no way to reach Worker 1.'},
      {title:'Re-acquire', tag:'token 34', text:'Worker 2 gets the lease with token 34 and writes; storage records max token = 34.'},
      {title:'Stale write', tag:'token 33', text:'Worker 1 resumes and writes with token 33 — storage rejects it (33 &lt; 34).'}
    ]},
    deep:`<p>Martin Kleppmann’s analysis of Redis’s Redlock algorithm argues that a lock relying on timing assumptions (bounded pauses, bounded clock drift) cannot guarantee mutual exclusion without fencing, and that for correctness-critical locks you should use a consensus system and fencing tokens; Redis’s author published a rebuttal — a classic debate worth reading.</p><p>Google’s Chubby provides <i>sequencers</i> (lock name + generation number) that servers can check — fencing by another name. Where the resource can’t check tokens (e.g. an external payment API), make the operation itself <b>idempotent</b> (idempotency keys) so a duplicate is harmless.</p>`
  },
  tradeoffs:{use:[`Consensus-based locks + fencing for correctness (one writer to a ledger, one leader)`, `Simple Redis locks for efficiency-only cases (dedupe cron jobs)`], avoid:[`Locks without expiry`, `Assuming a lease holder always notices its lease expiring`, `Long-held distributed locks on hot paths`], alt:[`Idempotent operations instead of mutual exclusion`, `Single-writer ownership via partitioning (each key owned by one consumer)`, `Database row locks (SELECT … FOR UPDATE) when everything is in one DB`]},
  real:[
    {co:'Martin Kleppmann', tier:'confirmed', text:'“How to do distributed locking” (2016) explains the GC-pause problem and fencing tokens, critiquing Redlock for correctness-critical use.', src:'martin.kleppmann.com (2016); Salvatore Sanfilippo’s response, “Is Redlock safe?” (2016)'},
    {co:'Google Chubby', tier:'confirmed', text:'Issues sequencers with lock generation numbers so servers can reject requests from stale lock holders.', src:'Burrows, OSDI 2006'},
    {co:'Apache ZooKeeper', tier:'confirmed', text:'Lock recipes use ephemeral sequential znodes tied to client sessions; the sequence number can serve as a fencing token.', src:'Apache ZooKeeper recipes documentation'}
  ],
  mistakes:[`SETNX without expiry`, `Using a lock without fencing for money movement`, `Holding a lock while making slow remote calls`],
  interview:[`Mention lease expiry, process pauses and fencing tokens in any “distributed lock” answer`],
  tryit:{note:'Replay the GC-pause scenario with and without fencing tokens.', mount:(host, api) => fencingDemo(host, api)},
  sources:[`Kleppmann, “How to do distributed locking” (2016)`, `Burrows, Chubby, OSDI 2006`, `ZooKeeper recipes`]
},
{
  id:'failure-detection', title:'Heartbeats, failure detection, gossip and split brain', minutes:10, tags:['heartbeat','failure detector','phi accrual','gossip','SWIM','split brain'],
  summary:'Nodes learn who’s alive through heartbeats and gossip. Detectors must balance speed against false alarms — and false alarms in leader systems lead to split brain.',
  problem:`<p>A database cluster declares the primary dead after 3 seconds without a heartbeat. During a brief network hiccup, a replica is promoted — but the old primary is alive and still accepting writes from clients that can reach it. For 40 seconds you have <strong>two primaries</strong>.</p>`,
  intuition:`Roll call by walkie-talkie. If someone doesn’t answer, are they hurt, or is their radio out of range? Wait too little and you send a rescue team for someone who was fine (false positive); wait too long and someone really hurt waits for help. Gossip is how news spreads in a village: tell two neighbours, they tell two more — everyone knows within a few rounds.`,
  how:{
    steps:[`<b>Heartbeats</b>: periodic “I’m alive” messages; miss k in a row → suspect.`, `Timeouts trade <b>detection speed</b> for <b>false positives</b>; there is no perfect detector in an asynchronous network.`, `<b>Phi accrual</b> detectors output a suspicion level based on the observed distribution of heartbeat arrivals, adapting to network jitter.`, `<b>Gossip</b>: each node periodically exchanges membership state with a few random peers; information spreads in O(log N) rounds with modest per-node load.`, `<b>SWIM</b>: probe a random member; if no reply, ask k others to probe it indirectly before suspecting — far fewer false positives.`, `<b>Split brain</b> prevention: quorums (only a majority can act), leases with fencing, and STONITH (power off the old leader).`],
    diagram:{title:'Indirect probing (SWIM) avoids false alarms', w:760, h:250, alt:'Node A pings D directly and fails; it asks B and C to ping D; they succeed, so D is not declared dead.',
      nodes:[{id:'a', type:'service', label:'Node A', x:100, y:125}, {id:'b', type:'service', label:'Node B', x:380, y:50}, {id:'c', type:'service', label:'Node C', x:380, y:200}, {id:'d', type:'service', label:'Node D', x:650, y:125}],
      edges:[{from:'a', to:'b'}, {from:'a', to:'c'}, {from:'a', to:'d'}, {from:'b', to:'d'}, {from:'c', to:'d'}],
      steps:[
        {note:'A pings D directly — the packet is lost on a flaky link. No ack.', flow:[['a', 'd', 'ping ✗']], hl:['a']},
        {note:'Instead of declaring D dead, A asks B and C to <b>ping D on its behalf</b>.', flow:[['a', 'b', 'ping-req D'], ['a', 'c', 'ping-req D']], parallel:true},
        {note:'B reaches D fine and relays the ack. D is alive; only the A–D path was flaky.', flow:[['b', 'd', 'ping'], ['d', 'b', 'ack'], ['b', 'a', 'D is alive']], hl:['d']},
        {note:'Membership updates (joins, suspicions, deaths) piggyback on these messages and <b>gossip</b> through the cluster.', flow:[['a', 'c', 'gossip'], ['c', 'd', 'gossip']], hl:['c']}
      ]},
    deep:`<p><b>Phi accrual</b> (Hayashibara et al., 2004) computes φ = −log₁₀(P(no heartbeat yet | history)); applications pick a threshold (e.g. φ = 8). Cassandra and Akka use it. <b>SWIM</b> (Das, Gupta & Motivala, 2002) separates failure detection (random probing with indirect pings and a suspicion phase) from dissemination (piggybacked gossip) — the basis of HashiCorp’s memberlist used by Serf and Consul.</p><p><b>Split-brain math:</b> requiring a strict majority to act means at most one side of any partition can proceed. Two-node clusters can’t do this, so they need a witness/tiebreaker. Even with quorums, a deposed leader may still believe it leads until its lease expires — hence fencing tokens on the resources it writes.</p>`
  },
  tradeoffs:{use:[`Adaptive detectors (phi accrual) on jittery networks`, `Gossip membership for large clusters (hundreds to thousands of nodes)`, `Majority quorums for any leader/primary election`], avoid:[`Aggressive timeouts that fail over on every GC pause`, `All-to-all heartbeats in large clusters (O(N²) messages)`, `Two-node clusters without a witness`], alt:[`A consensus service as the single source of membership truth`, `Orchestrator health checks (Kubernetes) for stateless services`]},
  real:[
    {co:'Apache Cassandra', tier:'confirmed', text:'Uses a gossip protocol for cluster membership and a phi accrual failure detector to mark nodes down.', src:'Apache Cassandra architecture documentation'},
    {co:'HashiCorp Consul / Serf', tier:'confirmed', text:'Use the memberlist library, based on SWIM with extensions (Lifeguard) to reduce false positives.', src:'HashiCorp memberlist and Consul documentation'},
    {co:'GitHub (2018)', tier:'confirmed', text:'A 43-second partition led automated failover to promote primaries in another region while writes continued on the original side — the cost of fast failure detection without fencing across regions.', src:'GitHub post-incident analysis (2018)'}
  ],
  mistakes:[`Timeouts shorter than common GC or network pauses`, `Failover without fencing the old primary`, `Membership via static config files`],
  interview:[`Say how failures are detected, how long it takes, and how false positives are prevented from causing split brain`],
  tryit:{note:'Spread a rumour by gossip. Change cluster size and fan-out; watch rounds grow logarithmically.', mount:(host, api) => gossipSim(host, api)},
  sources:[`Hayashibara et al., “The φ Accrual Failure Detector” (SRDS 2004)`, `Das, Gupta & Motivala, “SWIM” (DSN 2002)`, `Demers et al., “Epidemic Algorithms for Replicated Database Maintenance” (PODC 1987)`]
},
{
  id:'delivery-semantics', title:'Delivery semantics: at-most, at-least, exactly-once', minutes:9, tags:['at-least-once','at-most-once','exactly-once','idempotency','deduplication'],
  summary:'Over an unreliable network you can lose messages or duplicate them — pick which. “Exactly-once” in practice means at-least-once delivery plus idempotent processing.',
  problem:`<p>A notification service sends “Your order is out for delivery”. If it never retries, some customers get nothing. If it retries until acknowledged, some customers get the message twice. You can’t get “exactly once over the network” for free — so which failure do you prefer, and how do you hide the other one?</p>`,
  intuition:`Posting a cheque. Post it once and hope (at-most-once): it may be lost. Keep posting until the bank confirms (at-least-once): the bank may receive two. Write the cheque number on it, and the bank refuses any cheque number it already cashed (idempotency) — now duplicates are harmless.`,
  how:{
    steps:[`<b>At-most-once</b>: send once, no retries. Possible loss, never duplicates. Fine for metrics samples, presence pings.`, `<b>At-least-once</b>: retry until acknowledged. No loss, possible duplicates. The default in most queues (SQS standard, Kafka consumers committing after processing).`, `<b>Exactly-once (effectively-once)</b>: at-least-once delivery + <b>idempotent</b> processing or deduplication by message ID, often with the dedupe record and the side effect in one transaction.`, `Ack placement decides the semantics for consumers: commit/ack <b>before</b> processing → at-most-once; <b>after</b> → at-least-once.`, `End-to-end: the guarantee only holds if every hop (producer → broker → consumer → database) preserves it.`],
    diagram:{title:'Why duplicates happen', w:740, h:230, alt:'A producer sends a message; the consumer processes it, but its ack is lost, so the message is redelivered.',
      nodes:[{id:'p', type:'service', label:'Producer', x:90, y:115}, {id:'q', type:'queue', label:'Queue', x:330, y:115}, {id:'c', type:'service', label:'Consumer', x:560, y:115}, {id:'db', type:'db', label:'Processed IDs', x:700, y:200, w:130}],
      edges:[{from:'p', to:'q'}, {from:'q', to:'c'}, {from:'c', to:'db'}],
      steps:[
        {note:'Message #81 is delivered; the consumer sends the SMS.', flow:[['p', 'q', '#81'], ['q', 'c', '#81']], hl:['c']},
        {note:'The consumer crashes before acking (or the ack is lost). The queue’s visibility timeout expires…', status:{c:'down'}, flow:[['c', 'q', 'ack ✗']]},
        {note:'…and <b>#81 is delivered again</b>. Without protection: a second SMS.', status:{c:'ok'}, flow:[['q', 'c', '#81 again']], hl:['q']},
        {note:'With an <b>idempotent consumer</b>, it checks “processed IDs” (in the same transaction as its work) and skips the duplicate.', flow:[['c', 'db', 'seen #81?'], ['db', 'c', 'yes → skip']], hl:['db']}
      ]},
    deep:`<p><b>Kafka</b> provides exactly-once semantics <i>within Kafka</i> (KIP-98, 2017): idempotent producers (sequence numbers per partition dedupe retries) and transactions that atomically write output records and consumer offsets. Side effects outside Kafka (sending an email, charging a card) still need idempotency keys. <b>Amazon SQS FIFO</b> deduplicates messages with the same deduplication ID within a 5-minute window; SQS standard queues are at-least-once.</p><p><b>Implementation patterns:</b> a <code>processed_messages(message_id PRIMARY KEY)</code> table inserted in the same transaction as the business change; naturally idempotent operations (<code>SET status = 'shipped'</code> rather than <code>count = count + 1</code>); upserts keyed by event ID.</p>`
  },
  tradeoffs:{use:[`<b>At-least-once + idempotency</b> as the default for business events`, `<b>At-most-once</b> for lossy-tolerant telemetry`, `Broker-level exactly-once for stream processing pipelines inside one platform`], avoid:[`Believing a broker’s “exactly-once” covers your external side effects`, `Acking before processing when loss matters`], alt:[`Outbox + idempotent consumers`, `Reconciliation jobs that detect and repair gaps`]},
  real:[
    {co:'Apache Kafka', tier:'confirmed', text:'Added idempotent producers and transactions (KIP-98) to provide exactly-once semantics for read-process-write pipelines within Kafka.', src:'Apache Kafka KIP-98; Confluent blog (2017)'},
    {co:'Amazon SQS', tier:'confirmed', text:'Standard queues provide at-least-once delivery; FIFO queues support exactly-once processing with a 5-minute deduplication interval.', src:'Amazon SQS developer guide'},
    {co:'Stripe', tier:'confirmed', text:'Webhook events can be delivered more than once, and Stripe advises receivers to handle duplicates by logging processed event IDs.', src:'Stripe webhooks documentation'}
  ],
  mistakes:[`Non-idempotent consumers on at-least-once queues`, `Dedupe table written in a different transaction from the side effect`, `Unbounded dedupe storage with no expiry`],
  interview:[`Say “at-least-once with idempotent consumers” and explain where the dedupe key lives`],
  tryit:{note:'Send 1,000 messages through a lossy network under each semantics.', mount:host => deliverySim(host)},
  sources:[`Apache Kafka KIP-98`, `Amazon SQS documentation`, `Kleppmann, DDIA ch. 11`]
},
{
  id:'two-phase-commit', title:'Two-phase commit (2PC)', minutes:9, tags:['2PC','atomic commit','coordinator','XA','blocking'],
  summary:'A coordinator asks every participant to prepare; if all vote yes, it tells them to commit. Atomic across databases — but blocking if the coordinator dies at the wrong moment.',
  problem:`<p>Booking a holiday writes to the flights database and the hotels database. Either both bookings happen or neither. A single database transaction can’t span both systems. How do you make the commit atomic across them?</p>`,
  intuition:`A wedding ceremony. The officiant asks each partner “Do you?” (prepare). Once both say “I do” they are committed to going through with it — they can’t walk out. Then the officiant pronounces them married (commit). If the officiant faints right after both said “I do”, the couple is stuck at the altar, unable to leave or proceed, until the officiant recovers.`,
  how:{
    steps:[`<b>Phase 1 — prepare:</b> the coordinator sends PREPARE; each participant does all the work, writes it durably (holding locks) and votes YES or NO.`, `A YES vote is a promise: the participant must be able to commit later no matter what.`, `<b>Phase 2 — commit/abort:</b> if all voted YES, the coordinator durably logs COMMIT and tells everyone to commit; any NO → ABORT.`, `<b>Blocking problem:</b> if the coordinator crashes after participants voted YES but before sending the decision, participants are <b>in doubt</b> — they must keep holding locks until the coordinator recovers.`, `Use within one trusted platform (XA, database-internal distributed transactions); across services, prefer sagas.`],
    diagram:{title:'Prepare, vote, commit', w:760, h:260, alt:'A coordinator sends prepare to flights and hotels databases, collects yes votes, logs commit and tells both to commit.',
      nodes:[{id:'co', type:'service', label:'Coordinator', sub:'txn log', x:130, y:130, w:140}, {id:'f', type:'db', label:'Flights DB', x:520, y:60}, {id:'ho', type:'db', label:'Hotels DB', x:520, y:200}],
      edges:[{from:'co', to:'f'}, {from:'co', to:'ho'}],
      steps:[
        {note:'<b>PREPARE</b>: both participants do the work and lock the seat/room, writing a prepare record.', flow:[['co', 'f', 'PREPARE'], ['co', 'ho', 'PREPARE']], parallel:true, sub:{f:'prepared · locked', ho:'prepared · locked'}},
        {note:'Both vote <b>YES</b>. They can no longer unilaterally abort.', flow:[['f', 'co', 'YES'], ['ho', 'co', 'YES']], parallel:true},
        {note:'The coordinator durably logs <b>COMMIT</b>, then sends it.', sub:{co:'log: COMMIT'}, flow:[['co', 'f', 'COMMIT'], ['co', 'ho', 'COMMIT']], parallel:true},
        {note:'Both commit and release locks. If the coordinator had crashed between the votes and the decision, both would be stuck <b>in doubt</b>, locks held.', sub:{f:'committed', ho:'committed'}, hl:['f', 'ho']}
      ]},
    deep:`<p><b>Costs:</b> two round trips plus forced log writes at each step; locks held across the whole protocol (throughput suffers under contention); availability is the product of all participants’ and the coordinator’s availability. <b>3PC</b> adds a pre-commit phase to avoid blocking under crash failures, but is unsafe under network partitions, so it’s rarely used.</p><p><b>Making the coordinator fault tolerant:</b> Spanner runs 2PC across shards where each participant (and the coordinator) is itself a Paxos-replicated group, so a coordinator “crash” is just a leader change — blocking disappears in practice, at the cost of consensus latency.</p>`
  },
  tradeoffs:{use:[`Atomic commits across shards/partitions inside one database system`, `XA between a database and a message broker in tightly controlled environments`], avoid:[`2PC across independently owned microservices or third-party APIs`, `Long-running business processes (locks held for minutes)`], alt:[`Sagas with compensations`, `Transactional outbox`, `Designing to keep a transaction inside one shard`]},
  real:[
    {co:'Google Spanner', tier:'confirmed', text:'Uses two-phase commit across Paxos groups for multi-shard transactions, avoiding the classic blocking problem because coordinators are replicated.', src:'Corbett et al., OSDI 2012'},
    {co:'X/Open XA', tier:'confirmed', text:'The XA standard defines a 2PC interface between a transaction manager and resource managers (databases, message queues).', src:'X/Open XA specification'}
  ],
  mistakes:[`2PC across services owned by different teams`, `Forgetting in-doubt transactions need a recovery process`, `Ignoring lock duration under load`],
  interview:[`Explain the blocking problem precisely: YES voters can’t decide alone after the coordinator dies`],
  tryit:{note:'Run 2PC and a saga side by side, inject failures, and crash the coordinator mid-protocol.', pg:'saga-2pc'},
  sources:[`Gray, “Notes on Data Base Operating Systems” (1978)`, `Bernstein, Hadzilacos & Goodman, “Concurrency Control and Recovery in Database Systems” (1987)`, `Corbett et al., Spanner (2012)`]
},
{
  id:'saga-outbox', title:'Sagas and the transactional outbox', minutes:11, tags:['saga','compensating transaction','orchestration','choreography','outbox','CDC'],
  summary:'A saga is a sequence of local transactions with compensations that undo earlier steps if a later one fails. The outbox pattern makes “update DB and publish event” atomic.',
  problem:`<p>Placing a food order touches four services: Order, Payment, Restaurant and Delivery — each with its own database. If the restaurant rejects the order after payment succeeded, the money must be refunded. There’s no global transaction, and 2PC across these services would be fragile. How do you keep the business consistent?</p>`,
  intuition:`Planning a trip by booking flight, hotel and taxi separately. If the hotel turns out to be full, you don’t “roll back time” — you cancel the flight (and maybe pay a fee). A saga is the plan plus the list of cancellations for each step.`,
  how:{
    steps:[`Split the business transaction into local transactions T1…Tn, each with a <b>compensating</b> action C1…Cn (refund, release, cancel).`, `If Tk fails, run Ck−1…C1 in reverse order.`, `<b>Orchestration</b>: a central orchestrator tells each service what to do next (easy to follow, one place to see state). <b>Choreography</b>: services react to each other’s events (decoupled, harder to trace).`, `Sagas give <b>ACD without I</b>: intermediate states are visible (order “pending payment”), so design semantic locks/states and countermeasures.`, `Each step must reliably publish its result: use the <b>transactional outbox</b> — write the business row and an outbox row in one local transaction; a relay publishes outbox rows to the broker.`, `Make every step and compensation <b>idempotent</b> and retryable.`],
    diagram:{title:'An orchestrated saga with a failure', w:800, h:270, alt:'An orchestrator creates an order, charges payment, asks the restaurant to accept; the restaurant rejects, so the payment is refunded and the order cancelled.',
      nodes:[{id:'or', type:'service', label:'Orchestrator', x:120, y:135, w:130}, {id:'o', type:'service', label:'Order', x:420, y:40}, {id:'p', type:'service', label:'Payment', x:420, y:135}, {id:'r', type:'service', label:'Restaurant', x:420, y:230}, {id:'d', type:'service', label:'Delivery', x:680, y:135}],
      edges:[{from:'or', to:'o'}, {from:'or', to:'p'}, {from:'or', to:'r'}, {from:'or', to:'d', curve:.25}],
      steps:[
        {note:'T1: create the order in state <b>PENDING</b>.', flow:[['or', 'o', 'create'], ['o', 'or', 'ok']], sub:{o:'PENDING'}},
        {note:'T2: charge ₹499.', flow:[['or', 'p', 'charge'], ['p', 'or', 'ok']], sub:{p:'charged ₹499'}},
        {note:'T3: ask the restaurant to accept — it is out of paneer and <b>rejects</b>.', flow:[['or', 'r', 'accept?'], ['r', 'or', 'REJECT']], status:{r:'hot'}},
        {note:'Compensate in reverse: <b>C2 refund</b> the payment…', flow:[['or', 'p', 'refund']], sub:{p:'refunded'}, hl:['p']},
        {note:'…then <b>C1 cancel</b> the order and notify the user. The system is consistent again — through business actions, not rollback.', flow:[['or', 'o', 'cancel']], sub:{o:'CANCELLED'}, status:{r:'ok'}, hl:['o']}
      ]},
    deep:`<p><b>Origins:</b> Garcia-Molina & Salem’s “Sagas” (1987) addressed long-lived transactions. In microservices, sagas are run by workflow engines (Temporal, Netflix Conductor, AWS Step Functions) that persist state, retry steps with backoff and run compensations — removing a lot of hand-written state machines.</p><p><b>Isolation countermeasures:</b> semantic locks (a PENDING flag others respect), commutative updates, pessimistic view (do risky steps last, e.g. charge only after the restaurant accepts), re-reading values before acting. Some steps are <i>pivot</i> steps (no compensation possible, like shipping); put them after everything that can fail. <b>Outbox relays</b> poll the table or tail the database log with CDC (Debezium’s outbox event router); consumers must dedupe because relays deliver at least once.</p>`
  },
  tradeoffs:{use:[`Business workflows spanning services (orders, bookings, onboarding)`, `<b>Orchestration</b> for complex flows needing visibility`, `<b>Choreography</b> for simple, few-step reactions`, `<b>Outbox</b> whenever a service must update its DB and emit an event`], avoid:[`Sagas for steps that genuinely can’t be compensated without redesign`, `Dual writes (DB then broker) without an outbox`, `Choreography webs with 10+ services (nobody can see the flow)`], alt:[`2PC inside one database platform`, `Keeping the transaction inside one service by redrawing boundaries`]},
  real:[
    {co:'Garcia-Molina & Salem', tier:'confirmed', text:'Introduced sagas in 1987 as sequences of transactions with compensating transactions for long-lived activities.', src:'“Sagas”, ACM SIGMOD 1987'},
    {co:'Uber → Temporal', tier:'confirmed', text:'Uber built Cadence, a durable workflow engine; its creators later founded Temporal, widely used to orchestrate sagas.', src:'Uber Engineering (Cadence); temporal.io'},
    {co:'Debezium', tier:'confirmed', text:'Provides an outbox event router that turns rows written to an outbox table (captured via CDC) into events on Kafka topics.', src:'Debezium documentation — outbox event router'}
  ],
  mistakes:[`Forgetting compensations can fail too (retry them, alert on exhaustion)`, `Non-idempotent steps under retries`, `Publishing events outside the DB transaction (dual write)`, `Exposing intermediate saga states to users as final`],
  interview:[`For any multi-service write, propose a saga with explicit compensations and an outbox`, `Compare orchestration vs choreography in one sentence each`],
  tryit:[{note:'First, see why the outbox exists: crash the service right after its database commit.', mount:(host, api) => outboxDemo(host, api)}, {note:'Then run full sagas (orchestrated or choreographed) against 2PC with injected failures:', pg:'saga-2pc'}],
  sources:[`Garcia-Molina & Salem, SIGMOD 1987`, `Chris Richardson, microservices.io — Saga and Transactional Outbox patterns`, `Temporal and Debezium documentation`]
},
{
  id:'crdts-merkle', title:'CRDTs and Merkle trees', minutes:10, tags:['CRDT','G-Counter','PN-Counter','convergence','Merkle tree','anti-entropy'],
  summary:'CRDTs are data types whose replicas can be updated independently and always merge to the same result. Merkle trees let replicas find exactly which data differs by comparing a few hashes.',
  problem:`<p>A collaborative to-do app works offline on three phones. Each phone edits the same list; later they sync. With last-write-wins, edits silently disappear. Separately, two database replicas holding 100 million keys must find the 37 keys that differ — without sending all 100 million over the network.</p>`,
  intuition:`<b>CRDT:</b> each person keeps their own tally sheet of laddoos they’ve eaten; the total is the sum of everyone’s sheets. Sheets can be merged in any order, any number of times, and always give the same total — nobody’s count is overwritten. <b>Merkle tree:</b> comparing two huge books by comparing chapter fingerprints first, then only the paragraphs inside chapters whose fingerprints differ.`,
  how:{
    steps:[`A <b>CRDT</b> (conflict-free replicated data type) has a merge that is commutative, associative and idempotent → replicas converge regardless of message order or duplication.`, `<b>G-Counter</b>: a vector of per-replica counts; increment your own entry; merge = element-wise max; value = sum.`, `<b>PN-Counter</b>: two G-Counters (increments and decrements); value = P − N.`, `Other CRDTs: LWW-register, OR-Set (add-wins sets), RGA/sequence CRDTs for text editing.`, `A <b>Merkle tree</b> hashes data blocks, then hashes of hashes up to a root. Equal roots → identical data. Different roots → descend only into differing children.`, `Replicas use Merkle trees for <b>anti-entropy</b>: background repair that finds and syncs differences cheaply.`],
    diagram:{title:'A G-Counter converging across three replicas', w:760, h:240, alt:'Three replicas increment their own counters offline, then exchange state; merging by element-wise max gives the same total everywhere.',
      nodes:[{id:'a', type:'service', label:'Phone A', sub:'[0,0,0] = 0', x:110, y:120, w:140}, {id:'b', type:'service', label:'Phone B', sub:'[0,0,0] = 0', x:380, y:50, w:140}, {id:'c', type:'service', label:'Phone C', sub:'[0,0,0] = 0', x:650, y:120, w:140}],
      edges:[{from:'a', to:'b'}, {from:'b', to:'c'}, {from:'a', to:'c'}],
      steps:[
        {note:'Offline: A increments twice, B once, C three times — each only touches its <b>own</b> slot.', sub:{a:'[2,0,0] = 2', b:'[0,1,0] = 1', c:'[0,0,3] = 3'}},
        {note:'A and B sync: merge = element-wise max. Both become [2,1,0] = 3.', flow:[['a', 'b', '[2,0,0]'], ['b', 'a', '[0,1,0]']], parallel:true, sub:{a:'[2,1,0] = 3', b:'[2,1,0] = 3'}},
        {note:'B and C sync: [2,1,3] = 6. A message duplicated or reordered changes nothing — max is idempotent.', flow:[['b', 'c', '[2,1,0]'], ['c', 'b', '[0,0,3]']], parallel:true, sub:{b:'[2,1,3] = 6', c:'[2,1,3] = 6'}},
        {note:'A syncs with C: everyone converges on <b>6</b>. No increment lost — unlike a “last write wins” counter.', flow:[['c', 'a', '[2,1,3]']], sub:{a:'[2,1,3] = 6'}}
      ]},
    deep:`<p><b>Theory:</b> Shapiro et al. (2011) formalised state-based (CvRDT: merge forms a join semilattice) and operation-based (CmRDT: concurrent ops commute, delivered causally once) CRDTs. Costs: metadata growth (tombstones in sets and sequences), and CRDTs guarantee convergence, not application invariants (two users can both take the last seat).</p><p><b>Merkle trees in practice:</b> Dynamo and Cassandra build Merkle trees per key range to drive repair; Git’s object graph and Bitcoin’s block transaction root use hash trees for integrity; certificate transparency logs prove inclusion with Merkle audit paths. A comparison costs O(d log N) hash checks for d differences instead of O(N).</p>`
  },
  tradeoffs:{use:[`<b>CRDTs</b> for offline-first apps, collaborative editing, multi-region counters/sets/presence`, `<b>Merkle trees</b> for replica repair, sync protocols, tamper-evident logs`], avoid:[`CRDTs for data with strict invariants (balances, inventory)`, `Unbounded tombstones without garbage collection`], alt:[`A central server ordering operations (operational transformation, Module 13)`, `Version vectors + application-level merge`]},
  real:[
    {co:'Research', tier:'confirmed', text:'Shapiro, Preguiça, Baquero and Zawirski defined CRDTs and their convergence conditions.', src:'“Conflict-free Replicated Data Types”, SSS 2011'},
    {co:'Redis Enterprise / Riak', tier:'confirmed', text:'Redis Enterprise’s Active-Active geo-replication is built on CRDTs; Riak shipped CRDT data types (counters, sets, maps).', src:'Redis and Riak documentation'},
    {co:'Apache Cassandra', tier:'confirmed', text:'Anti-entropy repair builds Merkle trees over token ranges to find and stream only the differing data between replicas.', src:'Cassandra documentation — repair'}
  ],
  mistakes:[`Using LWW where merges matter (lost edits)`, `Expecting CRDTs to enforce invariants`, `Full scans to compare replicas instead of Merkle trees`],
  interview:[`Explain G-Counter merge (element-wise max) and why it converges`, `Mention Merkle trees whenever you discuss replica repair`],
  tryit:[{note:'Diverge two replicas and find the differences with a Merkle tree:', mount:host => merkleDemo(host)}, {note:'CRDT counters (and vector clocks) are in the playground:', pg:'vector-clock'}],
  sources:[`Shapiro et al., SSS 2011`, `Merkle, “A Digital Signature Based on a Conventional Encryption Function” (CRYPTO 1987)`, `DeCandia et al., Dynamo (2007)`]
},
{
  id:'unique-ids', title:'Unique IDs: UUID, Snowflake, ULID, ticket servers', minutes:9, tags:['UUID','Snowflake','ULID','UUIDv7','ticket server','ID generation'],
  summary:'Generating unique IDs across many machines without coordination: random UUIDs, time-ordered Snowflake/ULID/UUIDv7, or centralised ticket servers.',
  problem:`<p>Your orders table used an auto-increment ID. Now it’s sharded across 16 databases, and each one happily generates order #1001. You need IDs that are unique across shards, ideally sortable by time (for feeds and index locality), compact, and generated without a round trip to a central server on every insert.</p>`,
  intuition:`Railway PNR numbers: if every station issued numbers from its own counter, two stations would issue the same PNR. Fixes: make numbers so random they never collide (UUID), or prefix every number with the time and the station code (Snowflake) — unique and roughly in time order.`,
  how:{
    steps:[`<b>Auto-increment</b> per database: simple, but not unique across shards and leaks business volume.`, `<b>UUIDv4</b>: 122 random bits; no coordination; collisions practically impossible; but random order → poor B-tree locality, 16 bytes.`, `<b>Snowflake</b> (64-bit): 41 bits of milliseconds since a custom epoch + 10 bits machine ID + 12 bits sequence → ~4,096 IDs per ms per machine, time-sortable, fits in a BIGINT.`, `<b>ULID / UUIDv7</b>: 48-bit millisecond timestamp + randomness: time-sortable and coordination-free.`, `<b>Ticket server</b>: a central DB issues ranges/increments — simple and dense, but a dependency (run two with odd/even offsets).`, `Machine IDs must be unique (assign via config, ZooKeeper/etcd, or the shard ID) and clocks must not go backwards.`],
    stepper:{title:'Anatomy of a Snowflake ID', items:[
      {title:'Sign bit', tag:'1 bit', text:'Always 0 so the ID is a positive signed 64-bit integer.'},
      {title:'Timestamp', tag:'41 bits', text:'Milliseconds since a custom epoch: 2⁴¹ ms ≈ 69.7 years of IDs. Higher bits = time → IDs sort by creation time.'},
      {title:'Machine', tag:'10 bits', text:'Up to 1,024 generators (often 5 bits datacenter + 5 bits worker).'},
      {title:'Sequence', tag:'12 bits', text:'Up to 4,096 IDs per millisecond per machine; on overflow, wait for the next millisecond.'},
      {title:'Clock safety', tag:'rule', text:'If the clock moves backwards, refuse to generate (or wait) — otherwise duplicate IDs are possible.'}
    ]},
    deep:`<p><b>Index locality:</b> random UUIDv4 primary keys scatter inserts across a B-tree, causing page splits and cache misses; time-ordered IDs append near the right edge. That’s a major motivation for UUIDv7 (standardised in RFC 9562, 2024) and ULID. <b>Instagram</b> generated 64-bit IDs inside PostgreSQL with 41 bits of time, 13 bits of logical shard ID and 10 bits of per-shard sequence — so every ID also tells you its shard.</p><p><b>Trade-offs:</b> time-ordered IDs reveal creation time and approximate volume; hot right-edge inserts can create contention on a single B-tree page in very high-insert workloads; client-generated IDs make requests idempotent (the ID doubles as an idempotency key).</p>`
  },
  tradeoffs:{use:[`<b>Snowflake-style</b> for high-volume, time-sorted, compact IDs (messages, posts, orders)`, `<b>UUIDv7/ULID</b> when you want coordination-free, sortable IDs without assigning machine IDs`, `<b>UUIDv4</b> for opaque, unguessable tokens`], avoid:[`Auto-increment across shards`, `UUIDv4 as a clustered primary key at high insert rates`, `Exposing sequential IDs where enumeration is a security risk`], alt:[`Ticket servers / range allocation (Flickr-style)`, `Database sequences per shard with shard bits`]},
  real:[
    {co:'Twitter / X', tier:'confirmed', text:'Created Snowflake in 2010 to generate unique, roughly time-ordered 64-bit IDs across many machines when moving off MySQL auto-increment.', src:'Twitter Engineering, “Announcing Snowflake” (2010)'},
    {co:'Instagram', tier:'confirmed', text:'Generated IDs in PostgreSQL with 41 bits of time, 13 bits of logical shard ID and a 10-bit sequence.', src:'Instagram Engineering, “Sharding & IDs at Instagram” (2012)'},
    {co:'Flickr', tier:'confirmed', text:'Used dedicated MySQL “ticket servers” (two of them, odd/even) to issue globally unique IDs cheaply.', src:'Code as Craft, “Ticket Servers: Distributed Unique Primary Keys on the Cheap” (2010)'},
    {co:'Discord', tier:'confirmed', text:'Uses Snowflake-format IDs for messages, users and channels, so IDs encode their creation timestamp.', src:'Discord developer documentation — snowflakes'}
  ],
  mistakes:[`Duplicate machine IDs across generators`, `Ignoring clock rollback`, `Storing UUIDs as 36-character strings in hot indexes`],
  interview:[`Draw the Snowflake bit layout and compute capacity: 4,096 IDs/ms/machine, ~69 years`],
  tryit:{note:'Generate Snowflake IDs bit by bit, overflow the sequence, roll the clock back — and compare with UUIDv4, UUIDv7 and ULID.', pg:'snowflake'},
  sources:[`Twitter Engineering (2010)`, `Instagram Engineering (2012)`, `RFC 9562 (UUIDs, including v7)`, `ULID specification`]
}
];

SDA.register({
  kind:'module', id:'distributed', order:6, level:'distributed', icon:'🕸️', title:'Distributed Systems',
  summary:'Fallacies, CAP/PACELC, consistency models, quorums, clocks, consensus (Raft/Paxos), locks and fencing, failure detection and gossip, delivery semantics, 2PC, sagas and outbox, CRDTs and Merkle trees, and unique ID generation.',
  outcomes:['Reason about partitions with CAP and everyday latency with PACELC', 'Pick a consistency model and implement it with quorums or a leader', 'Explain Lamport/vector clocks and Raft leader election', 'Design safe distributed locks with fencing tokens', 'Coordinate multi-service work with sagas, outbox and idempotent consumers'],
  lessons,
  quiz:[
    {q:'During a network partition, a CP system will…', options:['Answer every request with possibly stale data', 'Refuse or time out some requests to avoid inconsistency', 'Ignore the partition', 'Become CA'], answer:1, why:'It sacrifices availability on the side that can’t reach a quorum.'},
    {q:'N = 5 replicas. Which (W, R) guarantees overlapping read and write sets?', options:['W=2, R=2', 'W=3, R=2', 'W=3, R=3', 'W=1, R=4'], answer:2, why:'R + W must exceed N: 3 + 3 = 6 > 5.'},
    {q:'Vector clocks [2,1,0] and [1,2,0] are…', options:['The first happened before the second', 'The second happened before the first', 'Concurrent', 'Equal'], answer:2, why:'Neither is ≤ the other in every entry.'},
    {q:'A 5-node Raft cluster tolerates how many failed nodes?', options:['1', '2', '3', '4'], answer:1, why:'A majority (3) must remain: 2f + 1 = 5 → f = 2.'},
    {q:'Why does Raft use randomised election timeouts?', options:['Security', 'To make split votes unlikely, so one candidate usually wins quickly', 'To save bandwidth', 'To sync clocks'], answer:1, why:'Different timeouts mean one follower usually times out first and wins before others start.'},
    {q:'A lock holder pauses past its lease and later writes. What prevents corruption?', options:['A longer lease', 'Fencing tokens checked by the storage', 'Redis persistence', 'NTP'], answer:1, why:'The resource rejects writes carrying an older token.'},
    {q:'“Exactly-once” processing over an at-least-once queue is achieved by…', options:['Acking before processing', 'Idempotent consumers / dedupe by message ID', 'Bigger queues', 'Using UDP'], answer:1, why:'Duplicates are delivered; idempotency makes them harmless.'},
    {q:'The main weakness of 2PC is…', options:['It can’t abort', 'Participants block in doubt if the coordinator dies after they vote YES', 'It needs clocks', 'It loses data'], answer:1, why:'YES voters can’t decide alone; they hold locks until recovery.'},
    {q:'In a saga, if step 3 fails after steps 1–2 succeeded, you…', options:['Roll back the global transaction', 'Run compensations for steps 2 then 1', 'Retry step 1', 'Ignore it'], answer:1, why:'Compensating transactions undo completed steps in reverse.'},
    {q:'What problem does the transactional outbox solve?', options:['Slow queries', 'Atomically updating the database and publishing an event', 'Clock skew', 'Hot keys'], answer:1, why:'The event is written in the same local transaction and published later by a relay.'},
    {q:'G-Counter replicas merge by…', options:['Summing vectors', 'Element-wise max', 'Last-write-wins', 'Averaging'], answer:1, why:'Max is idempotent, commutative and associative — convergence regardless of duplicates or order.'},
    {q:'Snowflake IDs give how many IDs per millisecond per machine?', options:['1,024', '4,096', '65,536', 'Unlimited'], answer:1, why:'12 sequence bits → 2¹² = 4,096.'},
    {type:'scenario', q:'Design order placement across Order, Payment, Restaurant and Delivery services so the system is never left half-done.', answer:'<ul><li><b>Saga</b> orchestrated by a durable workflow engine (Temporal/Step Functions-style): T1 create order PENDING → T2 restaurant accepts (do the risky step before charging) → T3 charge payment (idempotency key = order ID) → T4 assign delivery → mark CONFIRMED.</li><li><b>Compensations:</b> C3 refund, C2 notify restaurant to cancel, C1 cancel order + notify user. Compensations retried with backoff; alert if exhausted.</li><li><b>Reliable events:</b> each service writes state + outbox row in one transaction; relay via CDC; consumers dedupe by event ID.</li><li><b>Visibility:</b> the user sees PENDING until confirmed; timeouts per step (restaurant must respond in 2 min) trigger compensation.</li><li><b>Observability:</b> trace ID through the saga; dashboard of saga states and stuck workflows.</li></ul>'},
    {type:'scenario', q:'Your team wants a Redis lock so only one worker sends daily payout files to the bank. Is that enough?', answer:'<p>Not for correctness. A worker can pause (GC, VM freeze) past the lock expiry while another worker takes over — both send files. Options:</p><ul><li>Use a consensus-backed lock (etcd/ZooKeeper) and pass a <b>fencing token</b> to the resource; if the bank API can’t check tokens, guard with your own ledger table (unique constraint on payout batch ID + token) before sending.</li><li>Make the payout itself <b>idempotent</b>: a deterministic batch ID used as the bank’s idempotency key, so a duplicate submission is rejected.</li><li>Alternatively, single-writer design: a scheduled job assigned by a leader-elected scheduler, still with idempotency.</li></ul>'}
  ],
  cheatsheet:[
    {h:'🌐 Foundations', items:['8 fallacies: network unreliable, latency > 0, …', 'Timeout ≠ failure: unknown outcome', 'CAP: during partition choose C or A', 'PACELC: else, latency vs consistency']},
    {h:'🪜 Consistency', items:['Linearizable > sequential > causal > eventual', 'Session: read-your-writes, monotonic reads', 'Quorum: R + W > N ⇒ overlap', 'Read repair + Merkle anti-entropy']},
    {h:'⏰ Time', items:['Wall clocks drift/jump; use monotonic for durations', 'Lamport: a→b ⇒ L(a) < L(b)', 'Vector clocks detect concurrency', 'HLC ≈ wall time + causality; TrueTime = bounded uncertainty']},
    {h:'🗳️ Consensus & locks', items:['Raft: terms, random timeouts, majority votes', 'Commit when stored on a majority', '2f+1 nodes tolerate f failures', 'Locks = leases; add fencing tokens', 'Use etcd/ZooKeeper/Consul, don’t build your own']},
    {h:'📬 Messaging & transactions', items:['At-most / at-least / effectively-once', 'Idempotent consumers + dedupe table', '2PC: atomic but blocking', 'Saga: local txns + compensations', 'Outbox: DB row + event in one txn']},
    {h:'🧬 Data structures & IDs', items:['CRDTs converge via commutative merges', 'G-Counter: max per slot, sum', 'Merkle tree: compare hashes top-down', 'Snowflake: 41 time | 10 machine | 12 seq', 'UUIDv7/ULID: sortable, coordination-free']}
  ],
  glossary:[
    {term:'Fallacies of distributed computing', def:'Eight false assumptions about networks (reliable, zero latency, infinite bandwidth, secure, static topology, one admin, zero cost, homogeneous).'},
    {term:'Partial failure', def:'Some components of a distributed system fail while others keep working, often indistinguishable from slowness.'},
    {term:'CAP theorem', aka:['CAP'], def:'During a network partition a distributed system must choose between linearizable consistency and availability.'},
    {term:'PACELC', def:'Extension of CAP: if Partitioned choose Availability or Consistency, Else choose Latency or Consistency.'},
    {term:'Network partition', aka:['partition'], def:'A failure that splits nodes into groups that cannot communicate with each other.'},
    {term:'Linearizability', aka:['linearizable', 'strong consistency'], def:'Every operation appears to take effect atomically at one instant between its start and end, in real-time order.'},
    {term:'Sequential consistency', def:'All processes see operations in the same order, consistent with each process’s program order.'},
    {term:'Causal consistency', def:'Operations that are causally related are seen by everyone in the same order; concurrent ones may differ.'},
    {term:'Monotonic reads', def:'A client never sees data older than data it has already seen.'},
    {term:'Quorum', aka:['quorums'], def:'The minimum number of replicas that must participate in an operation (e.g. a majority).'},
    {term:'Read repair', def:'Fixing stale replicas with the newest value discovered during a read.'},
    {term:'Anti-entropy', def:'Background process that compares replicas and repairs differences.'},
    {term:'Sloppy quorum', aka:['hinted handoff'], def:'Accepting writes on substitute nodes during failures and handing them back later.'},
    {term:'Clock skew', aka:['clock drift'], def:'Differences between machines’ clocks, which make wall-clock ordering unreliable.'},
    {term:'NTP', def:'Network Time Protocol: synchronises clocks over a network, typically to within milliseconds.'},
    {term:'Lamport clock', aka:['Lamport timestamp', 'logical clock'], def:'A counter incremented per event and merged on message receipt, respecting happens-before.'},
    {term:'Vector clock', aka:['vector clocks', 'version vector'], def:'A per-node counter vector that detects whether events are causally ordered or concurrent.'},
    {term:'Happens-before', def:'Lamport’s causal ordering relation between events in a distributed system.'},
    {term:'Hybrid logical clock', aka:['HLC'], def:'A timestamp combining physical time with a logical counter, close to wall time but causally consistent.'},
    {term:'TrueTime', def:'Google Spanner’s clock API exposing time as an interval with bounded uncertainty.'},
    {term:'Consensus', def:'Getting a group of nodes to agree on a value or log despite failures.'},
    {term:'Raft', def:'A consensus algorithm based on leader election by majority vote and replicated logs.'},
    {term:'Paxos', def:'Lamport’s family of consensus protocols using prepare/promise and accept phases.'},
    {term:'Leader election', def:'Choosing a single coordinator node, usually via consensus.'},
    {term:'Term (Raft)', aka:['term'], def:'A numbered period in Raft with at most one leader.'},
    {term:'Majority', aka:['majority quorum'], def:'More than half of the nodes; any two majorities overlap.'},
    {term:'Distributed lock', aka:['distributed locks'], def:'A lock coordinating access across machines, typically implemented as an expiring lease.'},
    {term:'Lease', def:'A time-limited grant of a right (e.g. a lock or leadership) that expires unless renewed.'},
    {term:'Fencing token', aka:['fencing tokens', 'fencing'], def:'A monotonically increasing number issued with a lock; resources reject operations with stale tokens.'},
    {term:'Heartbeat', aka:['heartbeats'], def:'A periodic message signalling that a node is alive.'},
    {term:'Failure detector', def:'A component that suspects nodes have failed, trading detection speed for false positives.'},
    {term:'Phi accrual failure detector', aka:['phi accrual'], def:'A failure detector producing a suspicion level from the statistical distribution of heartbeat arrivals.'},
    {term:'Gossip protocol', aka:['gossip'], def:'Nodes periodically exchange state with random peers, spreading information in O(log N) rounds.'},
    {term:'SWIM', def:'A scalable membership protocol using random probing, indirect pings and piggybacked gossip.'},
    {term:'At-most-once', def:'Delivery semantics where a message is delivered zero or one times (no retries).'},
    {term:'At-least-once', def:'Delivery semantics where a message is retried until acknowledged, possibly duplicating it.'},
    {term:'Exactly-once', aka:['effectively-once'], def:'Processing each message’s effect once, achieved with at-least-once delivery plus idempotency or transactions.'},
    {term:'Two-phase commit', aka:['2PC'], def:'An atomic commit protocol: prepare/vote, then commit/abort, coordinated by one node.'},
    {term:'In-doubt transaction', def:'A 2PC participant that voted YES and is waiting for the coordinator’s decision.'},
    {term:'Saga', aka:['sagas'], def:'A sequence of local transactions with compensating actions to undo completed steps on failure.'},
    {term:'Compensating transaction', aka:['compensation', 'compensations'], def:'A business action that semantically undoes an earlier step (refund, cancel).'},
    {term:'Orchestration', def:'A central coordinator directs each step of a workflow or saga.'},
    {term:'Choreography', def:'Services react to each other’s events with no central coordinator.'},
    {term:'Transactional outbox', aka:['outbox', 'outbox pattern'], def:'Writing outgoing events to a table in the same transaction as business data, then publishing them asynchronously.'},
    {term:'Dual write', def:'Writing to two systems (e.g. DB and broker) separately, risking inconsistency if one fails.'},
    {term:'CRDT', aka:['CRDTs', 'conflict-free replicated data type'], def:'A data type whose replicas can be updated independently and always merge to the same state.'},
    {term:'G-Counter', def:'A grow-only CRDT counter: per-replica counts merged by element-wise max, summed for the value.'},
    {term:'Merkle tree', aka:['Merkle trees', 'hash tree'], def:'A tree of hashes where each parent hashes its children, enabling efficient comparison and verification.'},
    {term:'UUID', aka:['UUIDv4', 'UUIDv7'], def:'A 128-bit identifier; v4 is random, v7 begins with a millisecond timestamp for sortability.'},
    {term:'Snowflake ID', aka:['Snowflake'], def:'A 64-bit ID composed of timestamp, machine ID and sequence bits (originated at Twitter).'},
    {term:'ULID', def:'A 128-bit, lexicographically sortable ID: 48-bit millisecond timestamp plus 80 random bits.'},
    {term:'Ticket server', def:'A central service (often a database) that hands out unique sequential IDs or ID ranges.'}
  ],
  sources:['Kleppmann, “Designing Data-Intensive Applications”, ch. 5, 8, 9, 11', 'Lamport (1978, 2001); Ongaro & Ousterhout (2014); Burrows (2006)', 'Gilbert & Lynch (2002); Brewer (2012); Abadi (2012)', 'DeCandia et al., Dynamo (2007); Corbett et al., Spanner (2012)', 'Shapiro et al., CRDTs (2011); Garcia-Molina & Salem, Sagas (1987)', 'Twitter Snowflake (2010); RFC 9562']
});
} catch(e){ console.error('[SDA] Module "distributed" failed to load', e); window.SDA && SDA.errors.push({id:'distributed', error:e}); }
})();
