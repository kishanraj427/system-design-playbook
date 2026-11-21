
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
  const d = new api.Diagram(holder, {title:'Save an upgrade and its outgoing notice', w:800, h:260, alt:'The workspace saves an upgrade and must send a notice. An outbox keeps both facts together after a crash.', nodes:[{id:'svc', type:'service', label:'Workspace', x:90, y:130}, {id:'db', type:'db', label:'Upgrade DB', sub:'upgrade + outbox', x:320, y:60, w:150}, {id:'rel', type:'service', label:'Outbox sender', sub:'checks rows', x:320, y:210, w:150}, {id:'bk', type:'queue', label:'Waiting notices', x:560, y:130, w:120}, {id:'con', type:'service', label:'Membership', x:720, y:130, w:140}], edges:[{from:'svc', to:'db'}, {from:'svc', to:'bk', curve:.2}, {from:'db', to:'rel'}, {from:'rel', to:'bk'}, {from:'bk', to:'con'}]});
  async function run(){
    if (busy) return; busy = true; d.setStatus('svc', 'ok'); d.setStatus('con', 'ok');
    if (mode === 'dual'){
      d.setCaption('Save the upgrade row first.'); await d.flow([['svc', 'db', 'save upgrade']]);
      if (crash){ d.setStatus('svc', 'down'); d.setCaption('The workspace stops before sending its notice.'); await wait(700); res.className = 'verdict bad'; res.textContent = '✗ The upgrade exists, but membership never received its notice. The two parts disagree.'; }
      else { await d.flow([['svc', 'bk', 'UpgradeChanged'], ['bk', 'con']]); res.className = 'verdict warn'; res.textContent = 'It worked this time. A crash between the two separate writes could still lose the notice.'; }
    } else {
      d.setCaption('Save the upgrade and notice row in one database transaction.'); await d.flow([['svc', 'db', 'upgrade + notice']]);
      if (crash){ d.setStatus('svc', 'down'); d.setCaption('The workspace stops after saving. The notice still waits in the outbox.'); await wait(700); }
      d.setCaption('The sender finds the saved outbox row and delivers the notice.'); await d.flow([['db', 'rel', 'notice row'], ['rel', 'bk', 'UpgradeChanged #81'], ['bk', 'con']]);
      res.className = 'verdict ok'; res.textContent = '✓ Membership received the notice after the workspace stopped. If the sender repeats it, membership should recognize notice ID 81.';
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
  summary:'The fallacies are unsafe guesses about network calls, such as assuming they always work or cost no time. Remote calls can fail partly, leaving a caller unsure what happened.',
  problem:`<h3>A small example</h3><p>A team upgrades its collaborative workspace to a paid plan. The workspace server asks a billing service to charge ₹499.</p><ul><li>The request may be lost.</li><li>The charge may succeed while its answer is lost.</li><li>The billing service may answer late.</li></ul><p>What can the workspace server conclude when it hears nothing?</p>`,
  intuition:`A letter may never reach its reader, or the reply may be lost on its way back. Silence does not tell you which happened. A network call has the same uncertainty.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one billing call across the network.</p>',
    steps:[
      {icon:'📨', title:'Send the request', text:'The workspace asks billing to charge the plan. A network message may never arrive.'},
      {icon:'💳', title:'Billing may act', text:'Billing may complete the charge even if its reply gets lost.'},
      {icon:'⌛', title:'The caller times out', text:'A timeout says the answer did not arrive in time. It does not prove the charge failed.'},
      {icon:'🔁', title:'Retry safely', text:'Use the same payment idempotency key from Module 2 when checking or retrying this one upgrade.'},
      {icon:'📏', title:'Plan the other costs', text:'Remote calls also take time, carry limited data, and depend on systems that may move or change.'}
    ],
    diagram:{title:'One timeout, three possible outcomes', w:740, h:230, alt:'A workspace billing request may be lost, succeed with a lost answer, or finish after the caller stops waiting.',
      nodes:[{id:'a', type:'service', label:'Workspace', x:100, y:115}, {id:'n', type:'ext', label:'Network', x:370, y:115}, {id:'b', type:'service', label:'Billing', x:640, y:115}],
      edges:[{from:'a', to:'n'}, {from:'n', to:'b'}],
      steps:[
        {note:'The request is lost. Billing never charges.', flow:[['a', 'n', 'charge ₹499'], ['n', 'b', 'lost']], status:{n:'hot'}},
        {note:'Billing charges, but the success reply is lost.', status:{n:'ok'}, flow:[['a', 'n', 'charge'], ['n', 'b'], ['b', 'n', 'done'], ['n', 'a', 'lost']]},
        {note:'Billing is slow and answers after the workspace stops waiting.', flow:[['a', 'n', 'charge'], ['n', 'b']], dwell:1800, hl:['b']},
        {note:'All three look like a timeout to the workspace. It must check before charging again.', hl:['a']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Lost letter', 'Remote call'], [['Request never arrives', 'Billing does nothing.'], ['Reply gets lost', 'Billing charged but workspace does not know.'], ['Reply arrives late', 'Workspace has already timed out.']])}</div><div class="callout tip"><b>Important point</b><p>A remote timeout gives an unknown outcome. Check the payment by its key before treating it as failed.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Unsafe guess', 'Better check'], [['Network always works', 'Plan for lost calls and replies.'], ['Remote calls are free', 'Measure time and bytes.'], ['Server address never changes', 'Use a name or discovery path.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say 100,000 upgrade calls a day, and 0.1% of replies get lost. That is 100,000 × 0.001 = 100 calls with an unknown result each day. If the app retries them with no key, some of those 100 charges are repeated. At ₹499 each, 100 repeats cost 100 × 499 = ₹49,900 a day. With a stable key, the repeat costs ₹0.</p><p>Calls also add up. Say each call to another service takes 5 ms. A page that makes 20 calls one after another waits 20 × 5 = 100 ms, even before any call is slow.</p><h4>When it goes wrong</h4><p>The status check can time out too. Then the answer is still unknown, so check again later. Also keep each key longer than the longest retry. If keys are kept for 1 hour and a retry arrives after 2 hours, billing sees a new key and charges again.</p>`
  },
  tradeoffs:{use:[`For the workspace upgrade, treat billing as a remote call with an unknown outcome after timeout.`, `Use the fallacies as a review list before splitting another workspace feature into a service.`], avoid:[`Do not retry the charge with a fresh key just because the first reply was lost.`], alt:[`Keep a simple feature inside the workspace app when a network boundary adds no useful independence.`]},
  real:[
    {co:'Amazon', tier:'confirmed', text:'Amazon’s Builders’ Library describes how timeouts and lost answers make retries difficult to reason about.', src:'Amazon Builders’ Library, Timeouts retries and backoff'}
  ],
  mistakes:[`Treating the billing timeout as proof that no charge happened.`, `Leaving the billing call without a time limit.`],
  interview:[`Explain all three causes of one billing timeout.`, `Describe how the workspace checks the paid-upgrade result safely.`],
  tryit:{quiz:[
    {q:'The workspace billing call times out. What is certain?', options:['That billing has stopped forever', 'Only that its answer did not arrive in time', 'That no charge happened', 'That two charges happened'], answer:1, why:'The request, reply, or processing may have been delayed or lost.'},
    {q:'Why use the same payment key on a retry?', options:['To shorten the site name', 'To remove TLS', 'To identify the same upgrade attempt', 'To choose a new plan'], answer:2, why:'Billing can recognize the earlier operation instead of charging again.'}
  ]},
  sources:[`Amazon Builders’ Library, Timeouts retries and backoff`, `L. Peter Deutsch, Fallacies of Distributed Computing`]
},
{
  id:'cap-pacelc', title:'CAP and PACELC', minutes:10, tags:['CAP','PACELC','partition','availability','consistency'],
  summary:'CAP describes a choice during a broken link between database copies: keep one current answer or keep answering everywhere. PACELC adds the normal-day choice between waiting for consistency and responding sooner.',
  problem:`<h3>A small example</h3><p>A workspace has one paid editor seat left. Teams in Mumbai and Singapore both see it.</p><ul><li>Each city has a data copy.</li><li>The link between cities stops.</li><li>Both teams try to claim the last seat.</li></ul><p>Should one city wait, or can both claim it and resolve the conflict later?</p>`,
  intuition:`Two offices share a seat ledger by phone. When the line breaks, an office can stop new claims or keep accepting them from its own copy. Those choices protect different needs.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the last editor seat across a broken link.</p>',
    steps:[
      {icon:'🔗', title:'The link breaks', text:'The Mumbai and Singapore copies cannot exchange changes. This is a network partition.'},
      {icon:'🔒', title:'Protect one answer', text:'A consistency-first choice refuses a seat claim on the side that cannot confirm it is still free.'},
      {icon:'✅', title:'Keep answering', text:'An availability-first choice accepts local claims, but both cities may grant the same seat.'},
      {icon:'⏱️', title:'Count normal-day waiting', text:'Even when the link works, checking another city adds time before a response. PACELC names that latency choice.'},
      {icon:'⚖️', title:'Choose per action', text:'The last seat needs one owner. A workspace view count can tolerate a briefly old number.'}
    ],
    diagram:{title:'A broken link and one editor seat', w:780, h:270, alt:'Mumbai and Singapore copies cannot communicate. One policy refuses a seat claim, while another may accept conflicting claims.',
      nodes:[{id:'u1', type:'client', label:'Team, Mumbai', x:80, y:70, w:130}, {id:'u2', type:'client', label:'Team, Singapore', x:80, y:200, w:140}, {id:'m', type:'db', label:'Copy Mumbai', sub:'2 of 3 nodes', x:400, y:70, w:150}, {id:'s', type:'db', label:'Copy Singapore', sub:'1 of 3 nodes', x:400, y:200, w:150}, {id:'x', type:'ext', label:'Link', x:620, y:135, w:90}],
      edges:[{from:'u1', to:'m'}, {from:'u2', to:'s'}, {from:'m', to:'x'}, {from:'x', to:'s'}],
      steps:[
        {note:'Normally, the copies share seat changes.', flow:[['u1', 'm', 'claim'], ['m', 'x', 'share'], ['x', 's']]},
        {note:'The inter-region link <b>breaks</b>: a partition.', status:{x:'down'}, hl:['x']},
        {note:'A consistency-first policy refuses the Singapore claim until a current answer is possible.', flow:[['u2', 's', 'claim'], ['s', 'u2', 'wait']], hl:['s']},
        {note:'An availability-first policy accepts both local claims. One seat now has two owners to resolve.', flow:[['u2', 's', 'claim'], ['s', 'u2', 'OK'], ['u1', 'm', 'claim'], ['m', 'u1', 'OK']], status:{s:'hot', m:'hot'}}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Broken office phone line', 'Workspace choice'], [['Stop seat claims until offices agree', 'Keep one current answer.'], ['Let both offices accept claims', 'Keep answering but risk a conflict.']])}</div><div class="callout tip"><b>Important point</b><p>CAP applies to the broken-link case. PACELC also asks what the app trades on a normal day.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Workspace fact', 'Useful choice'], [['Last paid editor seat', 'Refuse an uncertain second claim.'], ['Approximate view count', 'Answer locally and let copies catch up.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the round trip between Mumbai and Singapore is about 60 ms, and a local write takes 2 ms. A seat claim that waits for the other city takes 2 + 60 = 62 ms. A local-only answer takes 2 ms. That is 62 ÷ 2 = 31 times slower, on every claim, even when nothing is broken. This is the normal-day cost that PACELC points at.</p><h4>When it goes wrong</h4><p>Say the workspace keeps 3 copies, 2 in Mumbai and 1 in Singapore, and the link breaks. The Mumbai side still holds a majority, so it can keep confirming seat claims. Singapore holds only 1 of 3 copies, so it must refuse. A consistency-first system does not stop everywhere. It stops only where it cannot confirm.</p><p>If both cities instead accept the last seat, 2 seats are sold when 1 exists. One team must be refunded ₹499 later.</p>`
  },
  tradeoffs:{use:[`For the last editor seat, refuse a claim when a second owner cannot be ruled out.`, `For a workspace view count, a local answer can be useful while copies catch up.`], avoid:[`Do not give both cities the same final paid seat without a conflict plan.`, `Do not apply one global choice to every workspace value.`], alt:[`Let a seat request stay pending until the two cities can communicate again.`]},
  real:[
    {co:'Research', tier:'confirmed', text:'Gilbert and Lynch formalized the CAP choice for systems facing a network partition.', src:'Gilbert and Lynch, Brewer’s Conjecture and the Feasibility of Consistent Available Partition-Tolerant Web Services (2002)'}
  ],
  mistakes:[`Using a local seat count as proof that the last seat is still free.`, `Explaining CAP as a choice made only when every link is healthy.`],
  interview:[`State the last-seat choice during the Mumbai to Singapore partition.`, `Explain the normal-day latency cost of checking another city.`],
  tryit:[{quiz:[
    {q:'Why might Singapore refuse the last-seat claim during a partition?', options:['Its screen is too small', 'The seat has no ID', 'The clock says noon', 'It cannot confirm that Mumbai did not claim it'], answer:3, why:'Refusing avoids promising the same seat twice.'},
    {q:'What does PACELC add to the partition question?', options:['A normal-day latency choice', 'A new hotel room', 'A second browser', 'A photo format'], answer:0, why:'Checking distant copies can cost time even when links work.'}
  ]}, {note:'Break the link in the CAP playground and compare a last-seat claim with a view count.', pg:'cap-quorum'}],
  sources:[`Gilbert and Lynch (2002)`, `Daniel Abadi, Consistency Tradeoffs (2012)`]
},
{
  id:'consistency-models', title:'Consistency models', minutes:10, tags:['linearizability','sequential consistency','causal consistency','eventual consistency','read-your-writes','monotonic reads'],
  summary:'A consistency model says which version a read may return when copies update at different times. The workspace can promise current reads, your own edits, reply order, or eventual agreement.',
  problem:`<h3>A small example</h3><p>Two teammates edit a workspace note from different cities.</p><ul><li>Asha posts a note and refreshes.</li><li>Ravi replies to that note.</li><li>A view count may lag.</li></ul><p>Which ordering and visibility promises does each part need?</p>`,
  intuition:`A shared notebook can show your own new line immediately, keep a reply below its question, or wait until every copy matches. These are different promises.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Choose a promise for each workspace read.</p>',
    steps:[
      {icon:'👤', title:'See your own edit', text:'Read-your-writes means Asha sees her saved note after refreshing.'},
      {icon:'⬆️', title:'Do not go backward', text:'Monotonic reads mean Asha does not see an older note version after seeing a newer one.'},
      {icon:'💬', title:'Keep cause before reply', text:'Causal consistency puts Ravi’s reply after the note it answers.'},
      {icon:'✅', title:'Demand one current order', text:'Linearizable reads act as if there is one current copy and completed changes have taken effect.'},
      {icon:'🕒', title:'Allow a count to catch up', text:'Eventual consistency lets view counts differ briefly if they move toward agreement after changes stop.'}
    ],
    stepper:{title:'The ladder, strongest to weakest', items:[
      {title:'Linearizable', tag:'current', text:'A read after a completed note change sees it across the workspace.'},
      {title:'Sequential', tag:'one order', text:'Everyone sees one order of note edits, but it may not match exact wall-clock timing.'},
      {title:'Causal', tag:'reply order', text:'Ravi’s reply appears after Asha’s note, because the reply depends on it.'},
      {title:'Read-your-writes', tag:'your edit', text:'Asha sees the note she just saved.'},
      {title:'Monotonic reads', tag:'no backward step', text:'Asha never sees an older version after seeing a newer one.'},
      {title:'Eventual', tag:'catch up', text:'Copies of a view count agree after new changes stop.'}
    ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Shared notebook need', 'Read promise'], [['See my new line', 'Read-your-writes.'], ['Keep a reply below its note', 'Causal order.'], ['Use one current seat count', 'Linearizable read.'], ['Allow view tally to catch up', 'Eventual agreement.']])}</div><div class="callout tip"><b>Important point</b><p>Choose the read promise per feature. A delayed view tally and a paid seat claim have different costs when wrong.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Workspace data', 'Useful promise'], [['Paid editor seats', 'One current answer.'], ['Your saved note', 'Read-your-writes.'], ['Replies', 'Cause before effect.'], ['Approximate views', 'Eventual agreement.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say a new note takes up to 200 ms to reach the other copies. Asha saves on copy 1 and refreshes 100 ms later. Her refresh lands on copy 2, which does not have the note yet. This is why a refresh can look like the save was lost.</p><p>For view counts, say 1,000 views have happened and one copy shows 998. The error is 2 ÷ 1,000 = 0.2%, and it closes within a moment. That is fine for a tally.</p><h4>How it works inside</h4><p>For read-your-writes, the save returns a version number, say 12. Asha's next read says "give me version 12 or newer". A copy still at version 11 waits or passes the read on. For monotonic reads, keep Asha on one copy during her session.</p><p>For causal order, a copy that holds Ravi's reply but not the note it answers keeps the reply hidden until the note arrives.</p><h4>When it goes wrong</h4><p>A linearizable read costs a majority check. With 3 copies, that means hearing from 2 of them.</p>`
  },
  tradeoffs:{use:[`For paid seats, use a current answer that prevents duplicate claims.`, `For Asha’s saved note, provide read-your-writes on her next page.`, `For approximate views, let copies catch up.`], avoid:[`Do not show Asha an old note immediately after telling her it saved.`, `Do not require the strongest read rule for a view count without a user need.`], alt:[`A time bound on old data can be useful when fully current reads cost too much.`]},
  real:[
    {co:'Azure Cosmos DB', tier:'confirmed', text:'Azure Cosmos DB documents several selectable read consistency levels.', src:'Azure Cosmos DB consistency documentation'}
  ],
  mistakes:[`Using “strong” without saying what a workspace reader must see.`, `Letting Asha’s next read use a copy older than her saved note.`],
  interview:[`Name the read promise for seats, notes, replies, and views.`, `Explain how a guest can read from a copy that has their latest edit.`],
  tryit:[{quiz:[
    {q:'Which promise lets Asha see the note she just saved?', options:['A longer TTL', 'Read-your-writes', 'Only eventual agreement', 'No ordering rule'], answer:1, why:'Her next read must include her own completed change.'},
    {q:'Which promise keeps Ravi’s reply after Asha’s note?', options:['Only the wall clock', 'No shared data', 'Causal order', 'Random order'], answer:2, why:'The reply depends on the note.'}
  ]}, {note:'Sort workspace stories by the read promise each one needs.', mount:host => sortGame(host, [
    {t:'Asha saves a note and sees an old version on refresh', c:'ryw', why:'She did not see her own write.'},
    {t:'A count shows 10, then 8, then 10', c:'mono', why:'The read moved backward.'},
    {t:'Ravi sees a reply before the note it answers', c:'causal', why:'The effect appeared before its cause.'},
    {t:'A seat read reflects every completed claim', c:'ok', why:'This is a current read.'}
  ], [{id:'ryw', label:'Read-your-writes'}, {id:'mono', label:'Monotonic reads'}, {id:'causal', label:'Causal'}, {id:'ok', label:'No violation'}])}],
  sources:[`Azure Cosmos DB consistency documentation`, `Herlihy and Wing, Linearizability (1990)`]
},
{
  id:'quorums', title:'Quorums: R + W > N', minutes:8, tags:['quorum','R+W>N','sloppy quorum','hinted handoff','read repair'],
  summary:'A quorum is the number of copies that must answer a read or confirm a write. With three copies, writing two and reading two makes the groups overlap.',
  problem:`<h3>A small example</h3><p>The workspace keeps three copies of a note. Asha saves a new version while one copy is slow.</p><ul><li>Three note copies exist.</li><li>Two confirm the new version.</li><li>A later read asks two copies.</li></ul><p>Must that read meet at least one copy with Asha’s new version?</p>`,
  intuition:`Three teammates hold a note. Tell any two about an edit, then ask any two for the note. Those groups must share at least one teammate.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Use N for copies, W for write confirmations, and R for read replies.</p>',
    steps:[
      {icon:'📋', title:'Keep three copies', text:'N = 3 means the workspace holds the note on three machines.'},
      {icon:'✍️', title:'Confirm two writes', text:'W = 2 means Asha’s save succeeds after two copies confirm it.'},
      {icon:'📖', title:'Read two copies', text:'R = 2 means the next read asks two copies and chooses the newer returned version.'},
      {icon:'🧮', title:'Check the overlap', text:'R + W = 2 + 2 = 4, which is greater than N = 3. The two groups must share a copy.'},
      {icon:'🔧', title:'Repair an old copy', text:'If one read finds an older note, the workspace can send the newer version back to it.'}
    ],
    diagram:{title:'Two write copies meet two read copies', w:740, h:240, alt:'With three note copies, two confirm a write and a later read of two touches at least one of them.',
      nodes:[{id:'c', type:'client', label:'Coordinator', x:90, y:120, w:130}, {id:'r1', type:'db', label:'Replica 1', x:420, y:45}, {id:'r2', type:'db', label:'Replica 2', x:420, y:120}, {id:'r3', type:'db', label:'Replica 3', x:420, y:195}],
      edges:[{from:'c', to:'r1'}, {from:'c', to:'r2'}, {from:'c', to:'r3'}],
      steps:[
        {note:'Two copies confirm version 2. The third still holds version 1.', flow:[['c', 'r1', 'v2'], ['c', 'r2', 'v2']], parallel:true, sub:{r1:'v2', r2:'v2', r3:'v1'}},
        {note:'The read asks copies 2 and 3, receiving versions 2 and 1.', flow:[['r2', 'c', 'v2'], ['r3', 'c', 'v1']], parallel:true, hl:['r2', 'r3']},
        {note:'The workspace can copy version 2 to the old third copy.', flow:[['c', 'r3', 'repair v2']], sub:{r3:'v2'}, hl:['r3']},
        {note:'Any group of two out of three overlaps another group of two.', hl:['r1', 'r2', 'r3']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Three teammates', 'Three note copies'], [['Tell any two about an edit', 'W = 2.'], ['Ask any two for the latest note', 'R = 2.'], ['At least one person is in both groups', 'R + W is greater than N.']])}</div><div class="callout tip"><b>Important point</b><p>Group overlap helps a read find the last completed write, but concurrent writes still need an ordering rule.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Choice', 'Effect'], [['W = 2, R = 2, N = 3', 'One slow copy need not stop a write or read.'], ['W = 3, R = 1, N = 3', 'Reads ask one copy, but every write waits for all three.']])}</div>`,
    deep:`<h4>The numbers</h4><p>The smallest overlap between a read group and a write group is R + W − N. For N = 3, W = 2, R = 2, that is 2 + 2 − 3 = 1 copy. For N = 5, W = 3, R = 3, it is 3 + 3 − 5 = 1 copy, and the group survives 2 slow copies. For N = 3, W = 1, R = 1, it is 1 + 1 − 3 = −1, so a read can miss the write.</p><p>Say the three copies answer in 5 ms, 8 ms and 200 ms. With W = 2, the save waits for the second answer, so 8 ms. With W = 3, it waits 200 ms.</p><h4>When it goes wrong</h4><p>Some stores use a sloppy quorum. If two of the usual copies are down, the write goes to stand-in machines. The write succeeds, but the overlap promise is gone, because a read may ask only the usual copies.</p><p>A write that reached 1 copy and returned an error can still leave the new version there. A later read may return it.</p>`
  },
  tradeoffs:{use:[`For workspace notes, W = 2 and R = 2 can tolerate one slow copy in a three-copy group.`, `Repair an old note copy when a read finds it.`], avoid:[`Do not assume R + W above N resolves two editors writing concurrently.`, `Do not use substitute copies and still assume the original groups must overlap.`], alt:[`A leader can order note changes instead of letting any copy accept writes.`]},
  real:[
    {co:'Apache Cassandra', tier:'confirmed', text:'Cassandra lets callers choose how many copies must answer or confirm an operation.', src:'Apache Cassandra consistency documentation'}
  ],
  mistakes:[`Choosing W = 1 and R = 1 while expecting every read to meet the last write.`, `Calling overlap a guarantee for conflicting concurrent edits.`],
  interview:[`Show why two groups of two must overlap among three note copies.`, `Name the read and write latency cost of larger R and W.`],
  tryit:[{quiz:[
    {q:'With N = 3, W = 2, and R = 2, why must read and write groups overlap?', options:['Every clock agrees', 'Only one copy exists', 'No network is used', 'Two groups of two cannot be disjoint among three'], answer:3, why:'Their total size is four, larger than the three available copies.'},
    {q:'What can a read do after finding an old note copy?', options:['Repair it with the newer version', 'Delete every note', 'Stop all writers forever', 'Change the site name'], answer:0, why:'The newer value can be sent to the stale copy.'}
  ]}, {note:'Set N to 3, W to 2, and R to 2. Then try a setting where the groups can miss each other.', mount:host => quorumViz(host)}],
  sources:[`Apache Cassandra consistency documentation`]
},
{
  id:'clocks', title:'Clocks: physical, Lamport, vector, hybrid', minutes:11, tags:['clock skew','NTP','Lamport clock','vector clock','HLC','TrueTime'],
  summary:'Machine wall clocks can disagree, so their timestamps may put workspace edits in the wrong order. Logical clocks track which events could have influenced others. Hybrid clocks add approximate wall time.',
  problem:`<h3>A small example</h3><p>Asha edits a workspace note. Ravi reads it, then replies from another server.</p><ul><li>Server A records the edit at 10:00:00.120.</li><li>Server B records the reply at 10:00:00.118.</li><li>B’s wall clock is behind.</li></ul><p>Did Ravi reply before the note existed, or did the clocks disagree?</p>`,
  intuition:`Two teammates use watches set a few seconds apart. Their written times can look backward. A numbered handoff proves which message was seen before a reply.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Compare four ways to label workspace events.</p>',
    steps:[
      {icon:'🕒', title:'Wall clocks show time', text:'Physical clocks give familiar dates and times, but two servers may disagree by milliseconds.'},
      {icon:'🔢', title:'Lamport counts events', text:'A server increases a counter on each event and carries it in messages. A reply gets a larger number than the note it saw.'},
      {icon:'📊', title:'Vector clocks show overlap', text:'Each server keeps a small list of counters. The lists can show whether two edits happened without seeing each other.'},
      {icon:'🧭', title:'Hybrid clocks add time', text:'A hybrid logical clock combines wall time with a counter so later dependent events stay in order.'},
      {icon:'⏱️', title:'Measure duration separately', text:'Use a monotonic clock for elapsed time, because a wall clock can be adjusted while a request runs.'}
    ],
    diagram:{title:'Workspace messages get logical numbers', w:760, h:240, alt:'Three app servers exchange messages. Lamport counters increase when a server sends or receives a message.',
      nodes:[{id:'a', type:'service', label:'A', sub:'L=0', x:110, y:120}, {id:'b', type:'service', label:'B', sub:'L=0', x:380, y:50}, {id:'c', type:'service', label:'C', sub:'L=0', x:650, y:170}],
      edges:[{from:'a', to:'b'}, {from:'b', to:'c'}, {from:'a', to:'c'}],
      steps:[
        {note:'A numbers a note event and sends number 2 to B.', sub:{a:'L=2'}, flow:[['a', 'b', 'note @2']], hl:['a']},
        {note:'B receives it and sets its number to max(0, 2) + 1 = 3.', sub:{b:'L=3'}, hl:['b']},
        {note:'B sends a reply at 4. C receives it and moves to 5.', sub:{b:'L=4', c:'L=5'}, flow:[['b', 'c', 'reply @4']], hl:['c']},
        {note:'The note send at 2 came before B received it at 3, then C received the reply at 5.', hl:['a', 'c']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Teammate record', 'Clock idea'], [['Time on each watch', 'Physical clock.'], ['Number each handoff', 'Lamport clock.'], ['Track what each person has seen', 'Vector clock.']])}</div><div class="callout tip"><b>Important point</b><p>A later wall-clock timestamp is not proof that its event happened later on another machine.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Question', 'Useful clock'], [['How long did a call take?', 'Monotonic clock.'], ['Did this reply follow that note?', 'Lamport or vector clock.'], ['Were two edits independent?', 'Vector clock.']])}</div>`,
    deep:`<h4>The numbers</h4><p>In the example, 10:00:00.120 − 10:00:00.118 = 2 ms. A 2 ms clock gap was enough to flip the order.</p><p>Lamport rule: on receiving a message, set the counter to max(own, received) + 1. Say Asha's server is at 5 and sends the note. Ravi's server is at 2. Its new value is max(2, 5) + 1 = 6, so the reply is numbered 6, above 5.</p><p>For vector clocks, say the pair is [server A, server B]. The note is [1, 0]. Ravi's reply is [1, 1]. Every slot in the reply is at least as big, so it came after. An edit on B alone is [0, 1]. Compared with [1, 0], neither is bigger in every slot, so the edits are concurrent.</p><h4>When it goes wrong</h4><p>A vector clock grows with the number of writers. With 1,000 phones editing one note, it can hold 1,000 counters.</p><p>A hybrid clock breaks ties inside one millisecond with its counter.</p>`
  },
  tradeoffs:{use:[`For workspace replies, carry a logical number that shows the note came first.`, `Use vector clocks when the app must tell independent offline edits from dependent ones.`], avoid:[`Do not use two server wall times alone to decide which workspace edit caused a reply.`, `Do not measure a timeout with a wall clock that can jump.`], alt:[`A single leader can order some edits when the workspace needs one agreed sequence.`]},
  real:[
    {co:'Leslie Lamport', tier:'confirmed', text:'Lamport described logical event numbers for reasoning about order across machines.', src:'Lamport, Time Clocks and the Ordering of Events (1978)'}
  ],
  mistakes:[`Sorting note and reply by two machine wall clocks without checking the message order.`, `Using wall time to measure elapsed request time.`],
  interview:[`Explain why Ravi’s reply can have an earlier wall time than Asha’s note.`, `Compare what Lamport and vector clocks reveal.`],
  tryit:[{quiz:[
    {q:'Why can two workspace servers timestamp a note and reply in the wrong order?', options:['Counters cannot increase', 'Their wall clocks can disagree', 'The note has no title', 'Every message is lost'], answer:1, why:'Separate machine clocks may drift or be adjusted.'},
    {q:'What can a vector clock show about two edits?', options:['A guaranteed wall time', 'The size of a photo', 'Whether neither edit had seen the other', 'The price of a server'], answer:2, why:'Its per-server counters reveal independent concurrent edits.'}
  ]}, {note:'Create workspace note and reply events in the clock playground. Compare logical numbers and vector clocks.', pg:'vector-clock'}],
  sources:[`Lamport, Time Clocks and the Ordering of Events (1978)`]
},
{
  id:'consensus-raft', title:'Consensus: Paxos, Raft and leader election', minutes:12, tags:['consensus','Raft','Paxos','leader election','term','log replication','majority'],
  summary:'Consensus lets several machines agree on one ordered record despite failures. Raft uses a voted leader and majority copies. Paxos is another family of protocols for agreement.',
  problem:`<h3>A small example</h3><p>Five workspace servers keep the order of shared-document changes. Their leader stops.</p><ul><li>One server was leading.</li><li>Four servers remain.</li><li>Editors still send changes.</li></ul><p>How can the servers choose one new leader and agree which changes are official?</p>`,
  intuition:`A committee of five elects a chair. A proposal becomes official when at least three members record it. If the chair leaves, another needs three votes.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Watch a five-server Raft group replace its leader.</p>',
    steps:[
      {icon:'💓', title:'Leader sends heartbeats', text:'The current leader sends short messages so followers know it is still present.'},
      {icon:'⌛', title:'A follower waits', text:'When messages stop, a follower waits a random time and becomes a candidate.'},
      {icon:'🗳️', title:'A majority votes', text:'Each server gives at most one vote in a numbered term. Three votes out of five choose a leader.'},
      {icon:'📝', title:'Leader records a change', text:'The leader proposes a document change and sends it to followers.'},
      {icon:'✅', title:'Copies make it official', text:'Once three servers hold that log entry, the change can be committed.'}
    ],
    diagram:{title:'One workspace leader after a failure', w:760, h:280, alt:'Five workspace servers replace a failed leader and copy one document change to a majority.',
      nodes:[{id:'s1', type:'service', label:'S1', sub:'leader · term 1', x:380, y:40, w:130}, {id:'s2', type:'service', label:'S2', sub:'follower', x:620, y:110, w:120}, {id:'s3', type:'service', label:'S3', sub:'follower', x:560, y:235, w:120}, {id:'s4', type:'service', label:'S4', sub:'follower', x:200, y:235, w:120}, {id:'s5', type:'service', label:'S5', sub:'follower', x:140, y:110, w:120}],
      edges:[{from:'s1', to:'s2'}, {from:'s1', to:'s3'}, {from:'s1', to:'s4'}, {from:'s1', to:'s5'}, {from:'s5', to:'s2', curve:.15}, {from:'s5', to:'s3', curve:.1}, {from:'s5', to:'s4'}],
      steps:[
        {note:'S1 leads term 1 and sends heartbeats.', flow:[['s1', 's2', '♥'], ['s1', 's3', '♥'], ['s1', 's4', '♥'], ['s1', 's5', '♥']], parallel:true, hl:['s1']},
        {note:'S1 stops. The other servers no longer hear it.', status:{s1:'down'}},
        {note:'S5 waits the shortest time, starts term 2, and asks for votes.', sub:{s5:'candidate · term 2'}, flow:[['s5', 's2', 'vote?'], ['s5', 's3', 'vote?'], ['s5', 's4', 'vote?']], parallel:true, hl:['s5']},
        {note:'S5 gets enough votes and becomes the one leader for term 2.', flow:[['s2', 's5', 'yes'], ['s3', 's5', 'yes'], ['s4', 's5', 'yes']], parallel:true, sub:{s5:'leader · term 2'}, hl:['s5']},
        {note:'Three of five servers store a proposed document change, so it is committed.', flow:[['s5', 's2', 'change 7'], ['s5', 's4', 'change 7']], parallel:true, sub:{s2:'change 7', s4:'change 7', s5:'committed 7'}}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Committee', 'Raft group'], [['Chair sends a check-in', 'Leader heartbeat.'], ['Members choose a new chair', 'Majority election.'], ['Three of five sign the minutes', 'Log entry is committed.']])}</div><div class="callout tip"><b>Important point</b><p>A failed leader does not let every surviving server decide alone. A majority must agree.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Event', 'Group action'], [['Leader stops', 'Wait, then hold an election.'], ['New leader wins', 'Continue copying changes.'], ['Only two of five remain', 'Wait because there is no majority.']])}</div>`,
    deep:`<h4>The numbers</h4><p>A majority is half the servers, rounded down, plus 1. For 3 servers it is 2, for 5 it is 3, for 7 it is 4. A group of 4 also needs 3, so it survives only 1 failure, the same as a group of 3. Even sizes add cost without adding safety.</p><p>Say heartbeats go out every 50 ms and election waits are random between 150 and 300 ms. A leader crash is noticed after about 150 to 300 ms. Say the 4 followers answer in 2, 3, 40 and 40 ms. The leader needs 2 follower copies plus its own, so a commit takes about 3 ms.</p><h4>When it goes wrong</h4><p>Two followers may time out together and each collect 2 votes out of 5. Nobody has 3, so there is no winner. Both wait a new random time, and one usually wins the next try.</p><p>A leader cut off from the rest keeps thinking it leads. It cannot commit without a majority. When it reconnects and sees a higher term, it steps down.</p>`
  },
  tradeoffs:{use:[`For workspace document order, a Raft group can choose one leader and commit changes on a majority.`, `Use an existing agreement service for this job when one is available.`], avoid:[`Do not let a two-server minority claim it committed a new document change.`, `Do not assume five servers tolerate three failures.`], alt:[`Keep simple workspace state on one managed database until a separate consensus group is needed.`]},
  real:[
    {co:'Raft', tier:'confirmed', text:'Ongaro and Ousterhout introduced Raft as an agreement algorithm with explicit leader election and a copied log.', src:'Ongaro and Ousterhout, In Search of an Understandable Consensus Algorithm (2014)'}
  ],
  mistakes:[`Calling a new workspace change committed before a majority stores it.`, `Assuming the old leader may keep accepting writes after a newer term starts.`],
  interview:[`Explain terms, votes, and majority commit using five workspace servers.`, `Say why two failed servers are tolerable but three are not.`],
  tryit:[{quiz:[
    {q:'How many votes form a majority in a five-server Raft group?', options:['Two', 'One', 'Five only', 'Three'], answer:3, why:'Three is more than half of five.'},
    {q:'When can a new workspace log entry be committed in this group?', options:['After a majority stores it', 'When one browser asks', 'Before the leader sends it', 'Only after every server stops'], answer:0, why:'A majority keeps the decision across a small failure.'}
  ]}, {note:'Stop the workspace leader in the Raft playground. Watch votes, terms, and the next committed change.', pg:'raft'}],
  sources:[`Ongaro and Ousterhout, In Search of an Understandable Consensus Algorithm (2014)`]
},
{
  id:'distributed-locks', title:'Distributed locks, leases and fencing tokens', minutes:9, tags:['distributed lock','lease','fencing token','Redlock','ZooKeeper'],
  summary:'A distributed lock gives one worker a temporary turn. That turn is a lease that can expire. A fencing token lets storage reject an old worker that resumes too late.',
  problem:`<h3>A small example</h3><p>Only one worker should build the workspace’s nightly export.</p><ul><li>Worker 1 gets a 10-second lease.</li><li>It pauses for 40 seconds.</li><li>Worker 2 gets the expired lease and starts.</li></ul><p>What stops Worker 1 from overwriting Worker 2’s newer export when it wakes?</p>`,
  intuition:`A visitor keeps an expired room key card in a pocket. The door must check the card’s generation, because merely holding a card no longer proves permission.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Give each export worker a numbered lease.</p>',
    steps:[
      {icon:'🔒', title:'Grant a short lease', text:'Worker 1 gets a lock that ends after a set time, so a crashed worker cannot block exports forever.'},
      {icon:'⏸️', title:'Worker 1 pauses', text:'Its lease ends while it is frozen. The worker does not notice yet.'},
      {icon:'🔢', title:'Worker 2 gets a newer number', text:'The lock service gives Worker 2 token 34 after Worker 1 had token 33.'},
      {icon:'💾', title:'Storage checks each write', text:'The export store remembers 34 and rejects Worker 1’s later write carrying 33.'},
      {icon:'✅', title:'Keep the result safe', text:'The token check protects the export even when two workers briefly believe they own it.'}
    ],
    stepper:{title:'Why the lease alone isn’t enough', items:[
      {title:'First worker starts', tag:'token 33', text:'Worker 1 gets a temporary lease and number 33.'},
      {title:'First worker pauses', tag:'40 seconds', text:'Worker 1 cannot observe the lease ending while paused.'},
      {title:'Lease expires', tag:'time passes', text:'The lock service is free to grant another lease.'},
      {title:'Second worker starts', tag:'token 34', text:'Worker 2 writes the export with newer number 34.'},
      {title:'Old worker returns', tag:'token 33', text:'The export store rejects 33 because it already accepted 34.'}
    ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Door key card', 'Export worker'], [['Card expires', 'Lease ends.'], ['New card has a larger number', 'Worker 2 receives token 34.'], ['Door refuses an old card', 'Storage refuses token 33.']])}</div><div class="callout tip"><b>Important point</b><p>A lease controls who should work now. The protected storage must also reject a late former owner.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['If this happens', 'Protection'], [['Worker stops forever', 'Lease expiry frees the job.'], ['Worker resumes late', 'Storage checks the fencing number.'], ['External system cannot check numbers', 'Make the operation idempotent where possible.']])}</div>`,
    deep:`<h4>The numbers</h4><p>The lease was 10 seconds and Worker 1 froze for 40. So its lease had been dead for 40 − 10 = 30 seconds when it woke. Long pauses can come from garbage collection, a busy host or a frozen virtual machine.</p><p>A common habit is to renew the lease at one third of its life. For a 10-second lease, that is every 3.3 seconds or so. A single missed renewal then does not lose the lease.</p><h4>When it goes wrong</h4><p>Say the lock lives on one Redis server with a replica. The primary grants the lock to Worker 1 and crashes before copying it. The replica takes over and grants the same lock to Worker 2. Two workers now hold it. Fencing tokens catch this, which is why a lock alone is not enough.</p><h4>How it works inside</h4><p>The store keeps the highest token it has seen, for example 34. A write with token 34 is accepted, because it is the current owner. A write with token 33 is rejected, because 33 is below 34.</p>`
  },
  tradeoffs:{use:[`For the workspace export, use a lease and fencing number if a late writer could replace the final file.`, `Use an idempotent export ID if rebuilding the same file is acceptable.`], avoid:[`Do not rely on a lease alone to stop Worker 1 after a long pause.`, `Do not leave a lock without expiry if a worker can crash.`], alt:[`A single database row lock can coordinate the export if the whole job stays within one database transaction.`]},
  real:[
    {co:'Google Chubby', tier:'confirmed', text:'The Chubby paper describes lock generation numbers that a server can check against old holders.', src:'Burrows, The Chubby lock service (2006)'}
  ],
  mistakes:[`Assuming Worker 1 notices when its lease expires.`, `Checking a token before the write but not with the write.`],
  interview:[`Trace tokens 33 and 34 through the paused export worker.`, `Explain why the export store must reject 33.`],
  tryit:[{quiz:[
    {q:'Why can Worker 1 still be dangerous after its lease expires?', options:['Worker 2 cannot start', 'It may wake and write late', 'It loses its name', 'The file becomes smaller'], answer:1, why:'A paused worker may not notice that another worker took over.'},
    {q:'Which token should storage reject after accepting 34?', options:['Every later number', 'No token', '33', '35'], answer:2, why:'33 belongs to the older lease.'}
  ]}, {note:'Run the paused-worker demo with and without the storage token check.', mount:(host, api) => fencingDemo(host, api)}],
  sources:[`Burrows, The Chubby lock service (2006)`]
},
{
  id:'failure-detection', title:'Heartbeats, failure detection, gossip and split brain', minutes:10, tags:['heartbeat','failure detector','phi accrual','gossip','SWIM','split brain'],
  summary:'Servers use heartbeats to notice missing peers and gossip to share membership news. A missed message may mean a failed server or a broken path. False suspicion can create two leaders.',
  problem:`<h3>A small example</h3><p>Workspace server A stops hearing from server D. D may still be running.</p><ul><li>A’s direct path to D is unreliable.</li><li>B can still reach D.</li><li>The workspace needs one leader.</li></ul><p>Should A declare D dead after one missing reply?</p>`,
  intuition:`A teammate does not answer a walkie-talkie call. Another teammate may reach them from a different place. Ask before calling the person missing.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one missing heartbeat through the workspace servers.</p>',
    steps:[
      {icon:'💓', title:'Expect a heartbeat', text:'D sends small “I am here” messages at intervals. A notices when one is late.'},
      {icon:'❓', title:'Suspect before deciding', text:'A late reply could mean a failed server or a slow link.'},
      {icon:'📞', title:'Ask another path', text:'A asks B and C to check D. If B reaches D, A avoids a false death report.'},
      {icon:'🗣️', title:'Spread membership news', text:'Gossip lets servers share what they have learned with a few peers at a time.'},
      {icon:'🔒', title:'Protect one leader', text:'Only a majority may elect a new leader. Fencing stops an old leader from writing later.'}
    ],
    diagram:{title:'Check D through another workspace server', w:760, h:250, alt:'A direct check from A to D fails. B reaches D and reports back, so D is not falsely declared dead.',
      nodes:[{id:'a', type:'service', label:'Node A', x:100, y:125}, {id:'b', type:'service', label:'Node B', x:380, y:50}, {id:'c', type:'service', label:'Node C', x:380, y:200}, {id:'d', type:'service', label:'Node D', x:650, y:125}],
      edges:[{from:'a', to:'b'}, {from:'a', to:'c'}, {from:'a', to:'d'}, {from:'b', to:'d'}, {from:'c', to:'d'}],
      steps:[
        {note:'A does not get D’s direct reply.', flow:[['a', 'd', 'check lost']], hl:['a']},
        {note:'A asks B and C to check D through other paths.', flow:[['a', 'b', 'check D'], ['a', 'c', 'check D']], parallel:true},
        {note:'B reaches D and tells A it is alive.', flow:[['b', 'd', 'check'], ['d', 'b', 'here'], ['b', 'a', 'D alive']], hl:['d']},
        {note:'Servers share membership news with a few peers at a time.', flow:[['a', 'c', 'news'], ['c', 'd', 'news']], hl:['c']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Walkie-talkie check', 'Workspace server check'], [['No answer from D', 'Suspect D, but do not know yet.'], ['B reaches D', 'Direct A to D path was the problem.'], ['Tell other teammates', 'Gossip shares membership news.']])}</div><div class="callout tip"><b>Important point</b><p>Failure detection is a suspicion based on missing messages. It must not give two servers the right to lead.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Choice', 'Cost'], [['Very short timeout', 'Faster detection and more false alarms.'], ['Longer timeout', 'Fewer false alarms and slower recovery.'], ['Indirect check', 'Another chance to find a living server.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say heartbeats go out every second, and each is lost 1% of the time, independently. If a single missed beat means "dead", the false alarm chance is 0.01 each second. With 100 servers watched, that is about 100 × 0.01 = 1 false alarm every second.</p><p>If 3 beats in a row must be missing, the chance is 0.01 × 0.01 × 0.01 = 0.000001. For 100 servers, that is 0.0001 a second, about once every 10,000 seconds, or 3 hours. The price is a slower detection, 3 seconds instead of 1.</p><p>Gossip spreads like a rumor. If each server tells 1 random peer each second, the news doubles roughly every round. For 1,000 servers, that is about 10 rounds, since 2¹⁰ = 1,024.</p><h4>When it goes wrong</h4><p>Split a group of 4 servers into 2 and 2. Neither side has the 3 needed, so nobody leads and writes stop. A server may also answer heartbeats but fail real requests. This is a gray failure, and a heartbeat alone cannot see it.</p>`
  },
  tradeoffs:{use:[`For workspace servers, use indirect checks before treating one lost path as a dead peer.`, `Use majority decisions before replacing a leader.`], avoid:[`Do not elect a new leader after one missed heartbeat.`, `Do not let a returning old leader keep writing without a fencing check.`], alt:[`Use a longer timeout when the workspace network often has short delays.`]},
  real:[
    {co:'Apache Cassandra', tier:'confirmed', text:'Cassandra documents using gossip and a failure detector to track members.', src:'Apache Cassandra architecture documentation'}
  ],
  mistakes:[`Calling D dead after one missed direct reply.`, `Allowing an old leader to keep writing after replacement.`],
  interview:[`Explain why A asks B to check D.`, `Connect false suspicion to the risk of two leaders.`],
  tryit:[{quiz:[
    {q:'Why should A ask B to check D?', options:['D must always be dead', 'B knows the billing price', 'The note title changed', 'B may reach D through a working path'], answer:3, why:'A missing direct reply does not prove D failed.'},
    {q:'What stops two separated groups from both committing leader decisions?', options:['A strict majority rule', 'The page color', 'A wall clock alone', 'One lost packet'], answer:0, why:'Two majorities in one group must overlap.'}
  ]}, {note:'Spread workspace membership news through gossip and compare how many rounds different group sizes need.', mount:(host, api) => gossipSim(host, api)}],
  sources:[`Apache Cassandra architecture documentation`, `Das and others, SWIM (2002)`]
},
{
  id:'delivery-semantics', title:'Delivery semantics: at-most, at-least, exactly-once', minutes:9, tags:['at-least-once','at-most-once','exactly-once','idempotency','deduplication'],
  summary:'At-most-once delivery can lose a message. At-least-once delivery may repeat it. To make one effect, the receiver can recognize a repeated message ID.',
  problem:`<h3>A small example</h3><p>The workspace sends Asha one email when Ravi invites her to a project.</p><ul><li>The email job is sent.</li><li>The worker sends the email.</li><li>The worker’s success reply gets lost.</li></ul><p>Should the job be sent again, and how can the workspace avoid two emails?</p>`,
  intuition:`A letter sent once can be lost. Sending it until you receive a receipt may deliver it twice. A numbered letter lets the receiver recognize a repeat.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow invitation job 81 through one lost acknowledgement.</p>',
    steps:[
      {icon:'1️⃣', title:'Send once', text:'At-most-once sends one invitation job and does not retry. A lost job means no email.'},
      {icon:'🔁', title:'Retry until confirmed', text:'At-least-once retries when no acknowledgement arrives. The worker may see job 81 twice.'},
      {icon:'📨', title:'Process the invitation', text:'The worker sends an email and records that job 81 was handled.'},
      {icon:'🔎', title:'Recognize a repeat', text:'On another delivery of 81, the worker sees the saved ID and skips the second effect.'},
      {icon:'✅', title:'Name the whole promise', text:'One email effect needs both safe retries and a receiver that handles repeats.'}
    ],
    diagram:{title:'Invitation job 81 arrives twice', w:740, h:230, alt:'The worker sends an email but its acknowledgement is lost. The repeated job is skipped by its ID.',
      nodes:[{id:'p', type:'service', label:'Workspace', x:90, y:115}, {id:'q', type:'queue', label:'Waiting jobs', x:330, y:115}, {id:'c', type:'service', label:'Email worker', x:560, y:115}, {id:'db', type:'db', label:'Handled IDs', x:700, y:200, w:130}],
      edges:[{from:'p', to:'q'}, {from:'q', to:'c'}, {from:'c', to:'db'}],
      steps:[
        {note:'The workspace sends job 81 and the worker sends an invitation.', flow:[['p', 'q', '#81'], ['q', 'c', '#81']], hl:['c']},
        {note:'The worker’s acknowledgement does not arrive.', status:{c:'down'}, flow:[['c', 'q', 'lost']]},
        {note:'Job 81 reaches the worker again.', status:{c:'ok'}, flow:[['q', 'c', '#81 again']], hl:['q']},
        {note:'The worker checks handled IDs and skips another email.', flow:[['c', 'db', 'seen 81?'], ['db', 'c', 'skip']], hl:['db']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Numbered letter', 'Workspace job'], [['Mail once and hope', 'At-most-once can lose the job.'], ['Mail until a receipt arrives', 'At-least-once can repeat the job.'], ['Keep a record of letter 81', 'Skip a repeated email effect.']])}</div><div class="callout tip"><b>Important point</b><p>“Exactly once” needs a stated boundary. Repeated delivery can still produce one stored effect if the receiver checks IDs safely.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Need', 'Choice'], [['Missing email is acceptable', 'Send once.'], ['Invite should eventually arrive', 'Retry until acknowledged.'], ['Duplicate invite is harmful', 'Record and check the job ID.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say 1,000,000 invitations a day, and 1% of acknowledgements get lost. With at-least-once delivery, that is 1,000,000 × 0.01 = 10,000 repeat deliveries a day. Without an ID check, that is 10,000 extra emails.</p><p>The saved IDs cannot be kept forever. Keep each ID longer than the longest retry window. Say retries last up to 7 days. Then 7 × 1,000,000 = 7,000,000 IDs are stored. At 16 bytes each, that is 7,000,000 × 16 = 112 MB, before index overhead.</p><h4>When it goes wrong</h4><p>The worker can crash between two steps. If it records job 81 first and crashes before sending, the email is lost. If it sends first and crashes before recording, the email repeats. For an invite, a repeat is the lesser harm, so send first, then record.</p><p>Better still, pass job 81 to the email provider as its own key, if the provider supports one.</p>`
  },
  tradeoffs:{use:[`For a workspace invitation, retry when loss is worse than a repeat.`, `Keep a handled job ID when a second email would confuse Asha.`], avoid:[`Do not claim network delivery itself can never repeat.`, `Do not record the ID after a separate irreversible effect without a recovery plan.`], alt:[`A periodic check can find invitations still pending after uncertain delivery.`]},
  real:[
    {co:'Stripe', tier:'confirmed', text:'Stripe advises webhook receivers to recognize repeated event IDs because an event may be delivered more than once.', src:'Stripe webhooks documentation'}
  ],
  mistakes:[`Sending invitation 81 again without checking its ID.`, `Calling the external email exactly once without a stated provider guarantee.`],
  interview:[`Explain why a lost acknowledgement can repeat job 81.`, `Name the boundary where duplicate effects are prevented.`],
  tryit:[{quiz:[
    {q:'What can at-most-once delivery do to a lost invitation job?', options:['Change the project name', 'Lose the email', 'Send it twice by retry', 'Always confirm it'], answer:1, why:'No retry follows the lost attempt.'},
    {q:'Why can at-least-once delivery send job 81 again?', options:['There is one server only', 'The guest signed in', 'Its acknowledgement was lost', 'The note changed color'], answer:2, why:'The sender cannot know the first processing succeeded.'}
  ]}, {note:'Compare lost and repeated workspace invitation jobs under the three delivery choices.', mount:host => deliverySim(host)}],
  sources:[`Stripe webhooks documentation`]
},
{
  id:'two-phase-commit', title:'Two-phase commit (2PC)', minutes:9, tags:['2PC','atomic commit','coordinator','XA','blocking'],
  summary:'Two-phase commit asks every database to prepare, then tells all to commit or abort. It can keep a change atomic across databases, but prepared participants can wait if the coordinator stops.',
  problem:`<h3>A small example</h3><p>A workspace paid upgrade changes two databases in one platform.</p><ul><li>Billing records a ₹499 charge.</li><li>Membership grants an editor seat.</li><li>Both changes must agree.</li></ul><p>How can the databases commit together when one coordinator directs them?</p>`,
  intuition:`A committee chair asks two members to prepare a decision. Once both promise they are ready, the chair gives one final instruction. If the chair disappears before that instruction, the members must wait.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the paid upgrade through billing and membership data.</p>',
    steps:[
      {icon:'📨', title:'Ask both to prepare', text:'The coordinator asks billing and membership to save work they could commit later.'},
      {icon:'🗳️', title:'Collect both votes', text:'Each database answers yes only if it can keep its promised change ready.'},
      {icon:'✅', title:'Send one decision', text:'If both say yes, the coordinator records commit and tells both to finish. Any no means abort.'},
      {icon:'⏳', title:'Handle coordinator loss', text:'If it stops after yes votes but before the decision, prepared databases may hold locks while waiting.'},
      {icon:'🔍', title:'Recover the decision', text:'The coordinator’s saved record tells the databases what to do after it returns.'}
    ],
    diagram:{title:'Two database parts vote on an upgrade', w:760, h:260, alt:'A coordinator asks billing and membership databases to prepare, then sends one commit decision.',
      nodes:[{id:'co', type:'service', label:'Coordinator', sub:'decision log', x:130, y:130, w:140}, {id:'f', type:'db', label:'Billing DB', x:520, y:60}, {id:'ho', type:'db', label:'Membership DB', x:520, y:200}],
      edges:[{from:'co', to:'f'}, {from:'co', to:'ho'}],
      steps:[
        {note:'Billing and membership prepare their changes and hold needed locks.', flow:[['co', 'f', 'prepare'], ['co', 'ho', 'prepare']], parallel:true, sub:{f:'ready', ho:'ready'}},
        {note:'Both databases vote yes.', flow:[['f', 'co', 'yes'], ['ho', 'co', 'yes']], parallel:true},
        {note:'The coordinator records commit and tells both databases.', sub:{co:'commit saved'}, flow:[['co', 'f', 'commit'], ['co', 'ho', 'commit']], parallel:true},
        {note:'Both finish and release locks. A lost coordinator before this decision would leave them waiting.', sub:{f:'committed', ho:'committed'}, hl:['f', 'ho']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Committee step', 'Workspace upgrade'], [['Both members prepare', 'Both databases hold ready changes.'], ['Chair records one decision', 'Coordinator records commit or abort.'], ['Chair disappears early', 'Prepared databases must wait.']])}</div><div class="callout tip"><b>Important point</b><p>A yes vote means a database cannot decide to abandon the work on its own.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Situation', 'Choice'], [['One managed database platform controls both parts', '2PC can provide one commit.'], ['Independent services need a long business workflow', 'Consider a saga in the next lesson.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Count the messages for 2 participants. Prepare is 2, votes are 2, decisions are 2 and acknowledgements are 2. That is 8, or 4 per participant. With 20 participants, it is 80.</p><p>There are 2 network round trips. Say each takes 20 ms. That is 40 ms of waiting, plus forced writes to disk at each step. A single local commit has none of this.</p><p>The seat row stays locked from prepare until the decision. If the coordinator is down for 30 seconds, every other request for that seat waits 30 seconds.</p><h4>When it goes wrong</h4><p>A database that voted yes and then restarted is "in doubt". It cannot abort on its own, because the others may have committed. It must ask the coordinator.</p><p>It can also ask the other participants. If any one of them never voted yes, abort is safe. If all voted yes, they all still wait for the coordinator.</p>`
  },
  tradeoffs:{use:[`For the paid upgrade inside one controlled database platform, 2PC can keep the two records together.`], avoid:[`Do not hold prepared seat locks while waiting minutes for an outside billing service.`, `Do not use 2PC without a recovery path for an in-doubt participant.`], alt:[`Keep the upgrade in one local transaction if both facts can live in one database.`]},
  real:[
    {co:'Google Spanner', tier:'confirmed', text:'Spanner describes two-phase commit across groups that also keep copied logs.', src:'Corbett and others, Spanner (2012)'}
  ],
  mistakes:[`Assuming yes voters can release their locks without a final decision.`, `Using a long outside call while the paid seat remains prepared and locked.`],
  interview:[`Explain prepare, yes votes, and the final commit decision.`, `Say why a coordinator crash can leave participants in doubt.`],
  tryit:[{quiz:[
    {q:'What happens after both databases vote yes but the coordinator disappears before a decision?', options:['They both choose independently', 'The upgrade is always free', 'The guest chooses a database', 'They may wait with locks held'], answer:3, why:'A yes voter must wait for the recorded decision.'},
    {q:'What does 2PC ask participants to do first?', options:['Prepare and vote', 'Delete all records', 'Send a screenshot', 'Start a new service'], answer:0, why:'The first phase asks whether each participant can commit later.'}
  ]}, {note:'Run the 2PC side of the playground and stop the coordinator after yes votes.', pg:'saga-2pc'}],
  sources:[`Corbett and others, Spanner (2012)`]
},
{
  id:'saga-outbox', title:'Sagas and the transactional outbox', minutes:11, tags:['saga','compensating transaction','orchestration','choreography','outbox','CDC'],
  summary:'A saga coordinates several local steps and uses compensating actions when a later step fails. An outbox records a business change and its outgoing notice together before sending the notice.',
  problem:`<h3>A small example</h3><p>A team upgrades its workspace to add a paid editor seat.</p><ul><li>Create an upgrade marked pending.</li><li>Charge ₹499.</li><li>Assign the seat.</li></ul><p>If seat assignment fails after payment, how can the app repair the outcome and reliably announce each change?</p>`,
  intuition:`Book a trip in separate steps. If the hotel cannot confirm, cancel the earlier flight booking. A saga keeps both the plan and the repair actions.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow a paid upgrade that cannot assign its seat.</p>',
    steps:[
      {icon:'📝', title:'Create pending upgrade', text:'The upgrade record says pending while the work is still in progress.'},
      {icon:'💳', title:'Charge the team', text:'Billing completes a local ₹499 charge and reports the result.'},
      {icon:'🪑', title:'Try to assign the seat', text:'The seat service cannot grant one, so the upgrade must not look complete.'},
      {icon:'↩️', title:'Compensate earlier work', text:'Refund the charge, then cancel the pending upgrade. These are new business actions, not time travel.'},
      {icon:'📮', title:'Record outgoing news safely', text:'An outbox row is saved with a local business change. A separate sender delivers that news later.'}
    ],
    diagram:{title:'A paid workspace upgrade is repaired', w:800, h:270, alt:'An orchestrator creates an upgrade and charges billing. Seat assignment fails, so it refunds and cancels.',
      nodes:[{id:'or', type:'service', label:'Coordinator', x:120, y:135, w:130}, {id:'o', type:'service', label:'Upgrade', x:420, y:40}, {id:'p', type:'service', label:'Billing', x:420, y:135}, {id:'r', type:'service', label:'Seats', x:420, y:230}, {id:'d', type:'service', label:'Notices', x:680, y:135}],
      edges:[{from:'or', to:'o'}, {from:'or', to:'p'}, {from:'or', to:'r'}, {from:'or', to:'d', curve:.25}],
      steps:[
        {note:'Create a pending paid upgrade.', flow:[['or', 'o', 'create'], ['o', 'or', 'ok']], sub:{o:'PENDING'}},
        {note:'Billing charges ₹499.', flow:[['or', 'p', 'charge'], ['p', 'or', 'ok']], sub:{p:'charged ₹499'}},
        {note:'Seat assignment fails.', flow:[['or', 'r', 'assign?'], ['r', 'or', 'NO']], status:{r:'hot'}},
        {note:'The coordinator asks billing for a refund.', flow:[['or', 'p', 'refund']], sub:{p:'refunded'}, hl:['p']},
        {note:'It cancels the pending upgrade so the team sees the final state.', flow:[['or', 'o', 'cancel']], sub:{o:'CANCELLED'}, status:{r:'ok'}, hl:['o']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Separate trip booking', 'Workspace upgrade'], [['Reserve a flight', 'Create pending upgrade.'], ['Pay for a hotel', 'Charge ₹499.'], ['Hotel cannot confirm', 'Seat cannot be assigned.'], ['Cancel earlier plans', 'Refund and cancel upgrade.']])}</div><div class="callout tip"><b>Important point</b><p>A compensation is a new action that repairs a completed step. It may need its own retry.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Need', 'Choice'], [['See each upgrade step', 'One coordinator directs the saga.'], ['Tell another service after saving', 'Save an outbox row with the business row.'], ['Sender crashes after sending', 'Receiver recognizes a repeated notice ID.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say 100,000 upgrades a day, and 2% fail at seat assignment. That is 100,000 × 0.02 = 2,000 refunds a day. At ₹499 each, 2,000 × 499 = ₹998,000 returns to customers daily. The refund path is a real business flow that needs tests and alerts.</p><p>Between the charge and the refund, the customer can see a ₹499 charge. A saga gives no isolation, so other readers see the half-done state.</p><h4>When it goes wrong</h4><p>A compensation can fail too. Make the refund safe to retry, for example by keying it with the upgrade ID. Retry until it works, then alert a person if it keeps failing.</p><p>Put the step that cannot be undone last. Here, sending the "welcome" email comes after the seat is assigned.</p><h4>How it works inside</h4><p>An outbox row holds an ID, a topic, the data and a sent time that starts empty. The relay reads unsent rows each second, sends them, then fills in the time. A crash between sending and marking repeats the notice.</p>`
  },
  tradeoffs:{use:[`For the paid upgrade, use a saga when billing and seats are independently owned services.`, `Use an outbox when a saved upgrade must reliably produce a notice.`], avoid:[`Do not show a pending upgrade as final before seat assignment.`, `Do not assume a refund always succeeds on its first attempt.`], alt:[`Keep the upgrade inside one local transaction if the facts can live in one service.`]},
  real:[
    {co:'Research', tier:'confirmed', text:'Garcia-Molina and Salem described sagas as local transactions with compensating steps.', src:'Garcia-Molina and Salem, Sagas (1987)'}
  ],
  mistakes:[`Forgetting that a refund may fail and need another attempt.`, `Saving an upgrade then sending its notice with no crash recovery path.`],
  interview:[`Name the refund and cancellation steps after seat assignment fails.`, `Explain why the outbox row and upgrade row share one transaction.`],
  tryit:[{quiz:[
    {q:'What repairs the ₹499 charge after seat assignment fails?', options:['A new CDN', 'A refund action', 'A changed clock', 'A second seat claim'], answer:1, why:'A saga compensates with a new business action.'},
    {q:'What does the outbox save beside the upgrade row?', options:['A random server name', 'A DNS answer', 'An outgoing notice row', 'A photo'], answer:2, why:'Both are committed together before the notice is sent.'}
  ]}, {note:'Crash the workspace service after saving an upgrade to see why an outbox helps.', mount:(host, api) => outboxDemo(host, api)}, {note:'The playground uses another workflow to compare a saga with 2PC under failure.', pg:'saga-2pc'}],
  sources:[`Garcia-Molina and Salem, Sagas (1987)`]
},
{
  id:'crdts-merkle', title:'CRDTs and Merkle trees', minutes:10, tags:['CRDT','G-Counter','PN-Counter','convergence','Merkle tree','anti-entropy'],
  summary:'A CRDT lets disconnected copies accept some changes and merge to the same result. A Merkle tree helps copies find which pieces differ without comparing every item.',
  problem:`<h3>A small example</h3><p>Three teammates mark tasks complete while their workspace phones are offline.</p><ul><li>A completes two tasks.</li><li>B completes one.</li><li>C completes three.</li></ul><p>How can their counts merge to six, and how can two large workspace copies find the few records that still differ?</p>`,
  intuition:`Each teammate keeps a separate tally sheet. Later, combine the highest count from each sheet. To compare two huge notebooks, compare chapter fingerprints first and open only chapters that differ.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Merge completed-task counts, then compare the larger workspace copies.</p>',
    steps:[
      {icon:'📱', title:'Count separately', text:'Each phone increases only its own slot in a grow-only counter, or G-Counter.'},
      {icon:'🔀', title:'Merge slots safely', text:'When phones reconnect, each slot takes the larger known count. Repeating a merge does not count a task twice.'},
      {icon:'➕', title:'Show the total', text:'The merged slots are [2, 1, 3]. Their sum is six completed tasks.'},
      {icon:'🌳', title:'Compare fingerprints', text:'A Merkle tree stores small hashes of records, then hashes of groups above them.'},
      {icon:'🔎', title:'Find differences', text:'If two top hashes differ, compare their child groups until only changed records remain.'}
    ],
    diagram:{title:'Completed tasks merge across three phones', w:760, h:240, alt:'Three offline phones count their own completed tasks. Merging the highest value in each slot gives six everywhere.',
      nodes:[{id:'a', type:'service', label:'Phone A', sub:'[0,0,0] = 0', x:110, y:120, w:140}, {id:'b', type:'service', label:'Phone B', sub:'[0,0,0] = 0', x:380, y:50, w:140}, {id:'c', type:'service', label:'Phone C', sub:'[0,0,0] = 0', x:650, y:120, w:140}],
      edges:[{from:'a', to:'b'}, {from:'b', to:'c'}, {from:'a', to:'c'}],
      steps:[
        {note:'Offline, A completes two tasks, B one, and C three.', sub:{a:'[2,0,0] = 2', b:'[0,1,0] = 1', c:'[0,0,3] = 3'}},
        {note:'A and B combine their highest count in each slot.', flow:[['a', 'b', '[2,0,0]'], ['b', 'a', '[0,1,0]']], parallel:true, sub:{a:'[2,1,0] = 3', b:'[2,1,0] = 3'}},
        {note:'B and C combine their slots. The total becomes six.', flow:[['b', 'c', '[2,1,0]'], ['c', 'b', '[0,0,3]']], parallel:true, sub:{b:'[2,1,3] = 6', c:'[2,1,3] = 6'}},
        {note:'A receives the same merged slots. Every phone now shows six.', flow:[['c', 'a', '[2,1,3]']], sub:{a:'[2,1,3] = 6'}}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Notebook action', 'Workspace technique'], [['Keep one tally per teammate', 'G-Counter slots.'], ['Combine highest known tallies', 'CRDT merge.'], ['Compare chapter fingerprints', 'Merkle tree search.']])}</div><div class="callout tip"><b>Important point</b><p>A merge rule can keep independent counts, while a hash tree finds where large copies disagree.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Need', 'Tool'], [['Count independent offline completions', 'G-Counter.'], ['Find changed records across copies', 'Merkle tree.'], ['Give one paid seat to one user', 'Use a strict booking rule, not a counter merge.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say phone A holds [2, 1, 0], having seen B's 1 task. Phone B holds [0, 1, 3]. Their totals are 3 and 4. Adding the totals gives 7, which is wrong. Taking the larger value per slot gives [2, 1, 3], and 2 + 1 + 3 = 6. Merging again changes nothing.</p><p>For Merkle trees, say a copy has 1,000,000 records. A binary tree over them is about 20 levels deep, because 2²⁰ = 1,048,576. With one changed record, the copies compare 2 hashes per level. That is about 20 × 2 = 40 hashes. At 32 bytes each, it is 1,280 bytes, not a million records.</p><h4>When it goes wrong</h4><p>To allow decreases, keep two G-Counters, one for additions and one for removals. The value is additions minus removals. Even so, a counter cannot enforce a limit. Two phones can both remove the last seat while offline.</p><p>Build the tree over fixed key ranges, not item positions. Then an insert changes one branch, not every branch.</p>`
  },
  tradeoffs:{use:[`For offline completed-task counts, a G-Counter can merge each phone’s additions.`, `For large workspace copies, a Merkle tree can narrow the records needing sync.`], avoid:[`Do not use an independent counter merge to allocate one paid editor seat.`, `Do not assume a Merkle tree resolves which conflicting edit is correct.`], alt:[`For small copies, compare all records directly when a tree would add more work than it saves.`]},
  real:[
    {co:'Apache Cassandra', tier:'confirmed', text:'Cassandra documents using Merkle trees to find differences between stored copies during repair.', src:'Apache Cassandra repair documentation'}
  ],
  mistakes:[`Summing two already merged phone totals and counting tasks twice.`, `Using a CRDT count as a guarantee that only one paid seat was granted.`],
  interview:[`Show [2,0,0], [0,1,0], and [0,0,3] merging to six.`, `Explain how a Merkle tree narrows changed records.`],
  tryit:[{quiz:[
    {q:'How does a G-Counter merge one phone slot?', options:['Add every repeated message', 'Keep the oldest clock time', 'Delete the slot', 'Keep the larger known count'], answer:3, why:'A maximum keeps an already seen increment from being counted twice.'},
    {q:'What does a Merkle tree help two copies find?', options:['Which groups contain differences', 'Who owns a paid seat', 'The hotel price', 'A browser font'], answer:0, why:'Matching hashes let the app skip unchanged groups.'}
  ]}, {note:'Change one workspace record on copy B and find it with the Merkle tree.', mount:host => merkleDemo(host)}, {note:'Try offline counters in the vector-clock playground.', pg:'vector-clock'}],
  sources:[`Apache Cassandra repair documentation`, `Shapiro and others, Conflict-free Replicated Data Types (2011)`]
},
{
  id:'unique-ids', title:'Unique IDs: UUID, Snowflake, ULID, ticket servers', minutes:9, tags:['UUID','Snowflake','ULID','UUIDv7','ticket server','ID generation'],
  summary:'A distributed ID must identify one workspace item even when several servers create items at once. Random UUIDs, time-based IDs, and one ticket server solve this in different ways.',
  problem:`<h3>A small example</h3><p>Sixteen workspace servers create new tasks at the same time.</p><ul><li>Each server starts a local counter at 1.</li><li>Two servers may both create task 1001.</li><li>Tasks need IDs that stay unique across servers.</li></ul><p>How can the app assign IDs without making every new task wait on one machine?</p>`,
  intuition:`If every branch office numbers forms from one, two forms can share a number. Add a branch code and time, use a very large random number, or ask one central ticket desk.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Compare ways to name one new task from any workspace server.</p>',
    steps:[
      {icon:'🔢', title:'Local counters can collide', text:'Two servers both using 1001 produce the same task ID.'},
      {icon:'🎲', title:'Use random UUIDs', text:'UUIDv4 draws from a very large random space so each server can create IDs independently.'},
      {icon:'🕒', title:'Use time and server identity', text:'Snowflake combines a time part, unique machine number, and local sequence into one compact ID.'},
      {icon:'📅', title:'Use sortable random IDs', text:'ULID and UUIDv7 include time and randomness, so IDs are roughly ordered without assigning machine numbers.'},
      {icon:'🎫', title:'Ask one ticket server', text:'A central service can hand out unique numbers, but task creation then depends on reaching it.'}
    ],
    stepper:{title:'Anatomy of a Snowflake ID', items:[
      {title:'Positive number', tag:'1 bit', text:'The first bit is zero so the ID fits a positive signed number.'},
      {title:'Time', tag:'41 bits', text:'A millisecond count gives the larger part of the ID and about 69 years of range.'},
      {title:'Machine', tag:'10 bits', text:'A unique machine number distinguishes workspace servers.'},
      {title:'Sequence', tag:'12 bits', text:'One server can make up to 4,096 IDs within one millisecond.'},
      {title:'Clock check', tag:'safety', text:'If time moves backward, wait or refuse new IDs until uniqueness is safe.'}
    ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Branch form number', 'Workspace ID'], [['Large random number', 'UUIDv4.'], ['Time, branch code, local count', 'Snowflake.'], ['One central ticket desk', 'Ticket server.']])}</div><div class="callout tip"><b>Important point</b><p>Choose IDs that stay unique across all task creators, including after a restart or clock change.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Choice'], [['No machine-ID setup', 'UUIDv4 or time-based random ID.'], ['Compact, roughly time-ordered number', 'Snowflake with unique machine IDs.'], ['Simple central numbering', 'Ticket server with a failure plan.']])}</div>`,
    deep:`<h4>The numbers</h4><p>A UUIDv4 has 122 random bits, so 2¹²² ≈ 5.3 × 10³⁶ possible values. Say the workspace makes 1 billion tasks, or 10⁹. The chance of any repeat is about (10⁹)² ÷ (2 × 5.3 × 10³⁶). That is 10¹⁸ ÷ (10.6 × 10³⁶), or roughly 1 in 10¹⁹. Nobody needs to worry about it.</p><p>With 12 sequence bits, a Snowflake machine makes 4,096 IDs per millisecond, or 4,096 × 1,000 = 4,096,000 each second. The 16 servers in the example can make about 16 × 4,096,000 = 65.5 million a second.</p><h4>When it goes wrong</h4><p>If a machine's clock moves back 5 ms, it could repeat old IDs. The safe choice is to wait until the clock catches up. If more than 4,096 IDs are needed within 1 ms, wait for the next millisecond. Two machines given the same machine number can also collide.</p><h4>How it works inside</h4><p>A ticket server can hand out blocks, for example 1,000 numbers at a time. A task server then calls it 1,000 times less often. If the task server crashes, its unused numbers are skipped. Gaps are harmless.</p>`
  },
  tradeoffs:{use:[`For workspace tasks, UUIDv4 is simple when sorted IDs are unnecessary.`, `Use Snowflake when compact, roughly ordered task IDs justify machine-number setup.`], avoid:[`Do not let every workspace server issue the same local counter IDs.`, `Do not ignore backward clock movement in a time-based generator.`], alt:[`A ticket service can issue unique ranges when central dependency and recovery are acceptable.`]},
  real:[
    {co:'Twitter', tier:'confirmed', text:'Twitter introduced Snowflake for unique, roughly time-ordered IDs across machines.', src:'Twitter Engineering, Announcing Snowflake (2010)'}
  ],
  mistakes:[`Giving two task generators the same machine number.`, `Continuing time-based ID generation after the clock moves backward without a rule.`],
  interview:[`Draw the Snowflake parts and calculate 4,096 IDs per millisecond per server.`, `Compare random, time-based, and central task IDs.`],
  tryit:[{quiz:[
    {q:'Why do local task counters collide across workspace servers?', options:['Time always stops', 'Two servers can both issue 1001', 'Every task has the same title', 'The network has no IP'], answer:1, why:'A local counter has no server-wide uniqueness rule.'},
    {q:'How many sequence values do 12 Snowflake bits allow in one millisecond?', options:['41', '1,024', '4,096', '12'], answer:2, why:'2¹² = 4,096.'}
  ]}, {note:'Build workspace task IDs in the Snowflake playground, then move the clock backward.', pg:'snowflake'}],
  sources:[`Twitter Engineering, Announcing Snowflake (2010)`, `RFC 9562`]
}
];

SDA.register({
  kind:'module', id:'distributed', order:6, level:'distributed', icon:'🕸️', title:'Distributed Systems',
  summary:'Follow a collaborative workspace across servers and offline phones. Learn how copies agree, survive failures, coordinate paid upgrades, merge independent work, and name new tasks.',
  outcomes:['Explain an uncertain remote billing result and a broken link', 'Choose read promises and quorum counts for workspace copies', 'Explain logical clocks, Raft votes, and safe leases', 'Repair repeated invitations and failed paid upgrades', 'Merge offline task counts and choose unique task IDs'],
  lessons,
  quiz:[
    {q:'The workspace billing call times out. What is certain?', options:['No charge happened', 'The reply did not arrive in time', 'Two charges happened', 'Billing stopped forever'], answer:1, why:'A lost request, lost reply, or slow service can all look like a timeout.'},
    {q:'During a broken link, why might Singapore refuse the last paid-seat claim?', options:['The seat has no name', 'Its clock is slow', 'It cannot rule out a Mumbai claim', 'The note was deleted'], answer:2, why:'Refusing avoids giving one final seat to two teams.'},
    {q:'Which promise lets Asha see the note she just saved?', options:['Only eventual agreement', 'No ordering', 'A longer timeout', 'Read-your-writes'], answer:3, why:'Her next read must include her own completed edit.'},
    {q:'With three copies, W = 2 and R = 2, what must happen?', options:['Every copy fails', 'Wall clocks match', 'No read is needed', 'Read and write groups overlap'], answer:3, why:'Two groups of two cannot be disjoint among three copies.'},
    {q:'What can a vector clock reveal about two workspace edits?', options:['The server price', 'Whether neither edit saw the other', 'A perfect wall time', 'The photo size'], answer:1, why:'Per-server counters can show independent concurrent edits.'},
    {q:'How many votes form a majority in a five-server Raft group?', options:['Two', 'Five only', 'Three', 'One'], answer:2, why:'Three is more than half of five.'},
    {q:'After storage accepts fencing token 34, what should it do with a write carrying 33?', options:['Reject it', 'Accept it as newer', 'Change the task title', 'Restart every phone'], answer:0, why:'33 belongs to an older expired lease.'},
    {q:'Why does server A ask B to check D after one lost heartbeat?', options:['B owns the paid seat', 'D must be dead', 'Wall clocks are exact', 'B may reach D through another path'], answer:3, why:'A lost direct reply is not proof D failed.'},
    {q:'Why may workspace invitation job 81 arrive twice?', options:['The project name changed', 'The first acknowledgement was lost', 'There is one server only', 'The user changed a font'], answer:1, why:'The sender retries when it cannot confirm the first processing.'},
    {q:'What can 2PC participants do after voting yes if the coordinator disappears before a decision?', options:['Decide independently', 'Forget their locks', 'Wait for the recovered decision', 'Always commit immediately'], answer:2, why:'They cannot know whether the coordinator chose commit or abort.'},
    {q:'What repairs a ₹499 charge when a paid seat cannot be assigned?', options:['A second seat claim', 'A refund action', 'A clock reset', 'A new CDN'], answer:1, why:'A saga uses a compensating business action.'},
    {q:'How does a G-Counter merge one phone slot?', options:['Add repeated messages', 'Use wall time', 'Delete the slot', 'Keep the larger known count'], answer:3, why:'The maximum keeps an increment from being counted twice.'},
    {q:'How many IDs can a 12-bit Snowflake sequence provide per millisecond per machine?', options:['12', '4,096', '41', '1,024'], answer:1, why:'2¹² = 4,096.'},
    {type:'scenario', q:'The Mumbai and Singapore workspace copies lose contact while one paid editor seat remains. What should happen?', answer:'<p>Refuse a final claim on a side that cannot rule out another claim. Show that request as pending or unavailable. A view count may still be answered locally and catch up later.</p>'},
    {type:'scenario', q:'A workspace upgrade charges ₹499 but seat assignment fails. How does the system recover and notify others?', answer:'<ol><li>Keep the upgrade pending while work is unfinished.</li><li>Refund the completed charge and cancel the upgrade.</li><li>Save a notice in an outbox row with the local business change.</li><li>Send the notice later and let its receiver recognize repeated IDs.</li></ol>'}
  ],
  cheatsheet:[
    {h:'🌐 Remote calls and partitions', items:['A timeout does not reveal whether a remote action happened.', 'CAP asks what to do when copies cannot communicate.', 'A last paid seat needs one owner.', 'PACELC also asks about normal-day latency.']},
    {h:'📖 Read from copies', items:['Read-your-writes shows your saved note on the next read.', 'Causal order keeps a reply after its note.', 'Eventual agreement can suit a view count.', 'With fixed copies, R + W above N makes read and write groups overlap.']},
    {h:'⏰ Order events', items:['Wall clocks on different machines may disagree.', 'Lamport numbers preserve a known cause-before-effect order.', 'Vector clocks can detect independent edits.', 'Raft elects one leader through a majority vote.']},
    {h:'🔒 Keep one safe worker', items:['A lease ends so a crashed lock holder cannot block forever.', 'A fencing number makes storage reject an old worker.', 'One missed heartbeat is suspicion, not proof of failure.', 'Indirect checks and gossip spread membership news.']},
    {h:'📨 Complete work across services', items:['At-most-once delivery can lose a job.', 'At-least-once delivery may repeat a job.', '2PC asks databases to prepare, then commit or abort.', 'A saga uses refunds or cancellations to repair earlier steps.', 'An outbox saves a business row and outgoing notice together.']},
    {h:'🧬 Merge and name data', items:['A G-Counter takes the maximum in each phone slot, then sums.', 'A Merkle tree narrows which records differ.', 'UUIDv4 uses a large random space.', 'Snowflake combines time, machine number, and local sequence.']}
  ],
  glossary:[
    {term:'Partial failure', def:'One part fails while the rest keep running. Example: the payment service is down, but the product pages still load.'},
    {term:'Network partition', aka:['partition', 'network partitions'], def:'Two groups of machines cannot talk to each other for a while, although each group still works. Example: the link between the Mumbai and Delhi servers is cut, so each side can only reach itself.'},
    {term:'CAP theorem', aka:['CAP'], def:'When the network splits, you must choose between answering with the newest data (consistency) and always answering (availability). Example: during a split, should the Delhi server refuse requests, or answer with possibly old data?'},
    {term:'PACELC', def:'An extension of CAP. During a partition, choose consistency or availability. Even without one, choose between speed (latency) and consistency. Example: waiting for a second region to confirm makes writes safer but slower.'},
    {term:'Linearizability', aka:['linearizable'], def:'Every read sees the latest completed write, as if there were only one copy. Example: once you save a file, nobody can open an older version.'},
    {term:'Sequential consistency', def:'Everyone sees the same order of actions, and each person’s own actions stay in order, but the order may lag behind real time. Example: all readers see the chat messages in the same order, a little late.'},
    {term:'Causal consistency', def:'Everyone sees a cause before the thing that depends on it. Example: you never see a reply before the message it answers.'},
    {term:'Read-your-writes', def:'After you make a change, your next read shows it. Example: you edit your name, and the next page you open shows the new name.'},
    {term:'Monotonic reads', def:'Once you have seen a newer value, you never see an older one. Example: a view count never goes back from 105 to 100 as you refresh.'},
    {term:'Quorum', aka:['quorums'], def:'The minimum number of copies that must agree for a read or write to count. Example: with 3 copies, 2 must confirm a write.'},
    {term:'Read repair', def:'When a read finds an out-of-date copy, the system sends it the newer value. Example: a read notices that copy B has the old name and fixes it.'},
    {term:'Clock skew', def:'The difference between the clocks of two machines. Example: one server’s clock is 300 ms ahead, so its “later” event can look earlier.'},
    {term:'Lamport clock', def:'A simple counter that goes up with each event and each message, so you can order events without real time. Example: a message stamped 7 means any later event it causes is stamped above 7.'},
    {term:'Vector clock', def:'A list of counters, one per machine, that shows whether two edits happened one after the other or independently. Example: it can tell that two people edited the same note at the same time.'},
    {term:'Hybrid logical clock', aka:['HLC'], def:'A clock that mixes approximate real time with a counter, so timestamps stay close to real time and still keep order. Example: two events in the same millisecond still get different, ordered stamps.'},
    {term:'Consensus', def:'Several machines agreeing on one decision, or one ordered list of changes, even if some fail. Example: five servers agree on who the leader is.'},
    {term:'Raft', def:'A consensus method with an elected leader, numbered terms and majority copies. Example: when the leader stops, the others vote in a new one.'},
    {term:'Paxos', def:'An older family of consensus methods that use proposals and votes. Example: ideas from Paxos run inside several large databases.'},
    {term:'Majority', def:'More than half of a group. Example: 3 of 5 servers.'},
    {term:'Lease', aka:['leases'], def:'A temporary right that expires by itself unless it is renewed. Example: a worker holds a lock for 30 seconds, or a cache reader holds permission to refill one value for a short time.'},
    {term:'Fencing token', aka:['fencing tokens'], def:'A number that goes up each time a lock is given out, so storage can reject an old lock holder. Example: a slow worker with token 33 is refused after token 34 was issued.'},
    {term:'Heartbeat', aka:['heartbeats'], def:'A small regular message that says “I am still alive”. Example: a server sends one every 5 seconds.'},
    {term:'Failure detector', def:'A process that suspects a machine has failed when its expected messages stop. Example: no heartbeat for 15 seconds, so the node is marked as down.'},
    {term:'Gossip protocol', aka:['gossip'], def:'Servers share news with a few random peers, who pass it on, so news spreads to everyone. Example: one server learns that node 4 is down, and soon all servers know.'},
    {term:'Split brain', def:'Two separated servers both believe they are the leader and both accept writes. Example: after a network cut, two leaders save different changes to the same record.'},
    {term:'At-most-once', def:'A message is sent once and never retried, so it may be lost. Example: a log line that is dropped when the network blips.'},
    {term:'At-least-once', def:'A message is retried until it is confirmed, so it may arrive more than once. Example: a payment message that arrives twice unless the receiver checks.'},
    {term:'Exactly-once', def:'The effect happens once even if the message is delivered more than once. Example: a duplicate payment message is recognised and charged only once.'},
    {term:'Two-phase commit', aka:['2PC'], def:'A coordinator asks everyone to prepare, then tells all to commit or all to abort. Example: a bank transfer that changes two databases together.'},
    {term:'In-doubt transaction', aka:['in-doubt', 'in-doubt participant'], def:'Work that is prepared and waiting for a decision from a coordinator that has gone missing. Example: two databases hold locked rows and wait for an answer that never comes.'},
    {term:'Saga', aka:['sagas'], def:'A long task split into local steps, with an undo action for each step in case a later one fails. Example: book a flight, book a hotel, and cancel the flight if the hotel fails.'},
    {term:'Compensating transaction', aka:['compensating action', 'compensating actions'], def:'A new action that undoes the effect of an earlier completed step. Example: a refund repairs a payment that was taken earlier.'},
    {term:'Choreography', def:'Services react to each other’s notices with no central controller. Example: the payment service sees “order placed” and charges the card on its own.'},
    {term:'Transactional outbox', aka:['outbox'], def:'A notice saved in the same database transaction as the business change, and sent later by a separate process. Example: an order and its “order placed” notice are saved together, so the notice is never lost.'},
    {term:'CRDT', aka:['CRDTs'], def:'Conflict-free replicated data type: a data type whose copies can be edited separately and merged into the same result. Example: two phones add likes offline, and the merged total is correct.'},
    {term:'G-Counter', def:'A counter that only grows, with one count per machine. Merging takes the largest value of each. Example: machine A counted 5 and B counted 3, so the total is 8.'},
    {term:'Merkle tree', def:'A tree of hashes used to find which groups of records differ between two copies. Example: compare the top hash, and dig only into branches that differ.'},
    {term:'UUID', aka:['UUIDv4', 'UUIDv7'], def:'A long random ID that can be made anywhere with no central counter. Example: f47ac10b-58cc-4372-a567-0e02b2c3d479.'},
    {term:'Snowflake ID', aka:['Snowflake'], def:'An ID made from the time, a machine number and a counter, so IDs are unique and roughly in time order. Example: 100 machines create IDs with no central counter.'},
    {term:'ULID', def:'A sortable ID with a time part followed by random digits. Example: newer IDs sort after older ones.'},
    {term:'Ticket server', def:'A central service that hands out unique numbers or ranges of numbers. Example: each app server asks for 1,000 numbers at a time.'},
    {term:'Bandwidth', def:'How much data a network link can carry in a given time. Example: a 100 Mbps link carries at most 100 megabits each second.'},
    {term:'Leader election', aka:['leader elections'], def:'The way a group of machines picks one leader. Example: when the leader stops, the others vote and one of them wins.'},
    {term:'Distributed lock', aka:['distributed locks'], def:'A lock that works across several machines, so only one worker does a job at a time. Example: only one server sends the daily email.'}
  ],
  sources:['Martin Kleppmann, Designing Data-Intensive Applications', 'Gilbert and Lynch (2002)', 'Daniel Abadi, Consistency Tradeoffs (2012)', 'Lamport, Time Clocks and the Ordering of Events (1978)', 'Ongaro and Ousterhout, Raft (2014)', 'Garcia-Molina and Salem, Sagas (1987)', 'Shapiro and others, CRDTs (2011)', 'Twitter Engineering, Announcing Snowflake (2010)']
});
} catch(e){ console.error('[SDA] Module "distributed" failed to load', e); window.SDA && SDA.errors.push({id:'distributed', error:e}); }
})();
