/* =====================================================================
   PART 7 · MODULE 13 — REAL-TIME & MEDIA
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, esc, clamp, fmtNum, fmtDur, fmtBytes, rng} = SDA.u; const ui = SDA.ui;
const {sortGame, orderGame} = SDA.m1helpers; const {css, frag} = SDA.ph;
const mbps = kbps => kbps >= 1000 ? (kbps / 1000).toFixed(kbps >= 10000 ? 0 : 1) + ' Mbps' : Math.round(kbps) + ' kbps';

/* ---------- widgets ---------- */
function wsCapacity(host){
  const P = {users:5e6, perServer:100000, kb:40, msgs:2, fan:8}; const out = el('div');
  function run(){
    const byConn = Math.ceil(P.users / P.perServer); const memGB = P.users * P.kb / 1e6;
    const inMsgs = P.users * P.msgs / 60; const outMsgs = inMsgs * P.fan; const eg = outMsgs * 1.2 * 8 / 1000;
    out.innerHTML = '';
    out.append(frag(h.math(`Gateway servers ≈ ⌈${fmtNum(P.users)} ÷ ${fmtNum(P.perServer)}⌉ = ${byConn}   (+ headroom for a zone failure and deploys: ≈ ${Math.ceil(byConn * 1.5)})
Connection memory ≈ ${fmtNum(P.users)} × ${P.kb} KB ≈ ${memGB.toFixed(0)} GB across the fleet (${(memGB / byConn).toFixed(1)} GB per server)
Messages in  ≈ ${fmtNum(P.users)} × ${P.msgs}/min ÷ 60 = ${fmtNum(inMsgs)}/s
Deliveries   ≈ ${fmtNum(inMsgs)} × fan-out ${P.fan} = ${fmtNum(outMsgs)}/s  (≈ ${mbps(eg * 1000)} egress at ~1.2 KB each)`)));
    out.append(el('div', {class:'verdict ' + (P.perServer > 500000 ? 'warn' : 'ok')}, P.perServer > 500000 ? 'Very high connections per server is possible with tuning (file descriptors, kernel buffers, an efficient runtime), but one crash then disconnects that many users at once, and they all reconnect together. Smaller servers shrink the blast radius.' : 'Connections are cheap to hold but expensive to move: a deploy or crash triggers a reconnect storm. Use jittered reconnects and drain servers gradually.'));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Concurrent connected users', min:1e4, max:5e7, step:1e4, value:P.users, fmt:v => fmtNum(v), onInput:v => { P.users = v; run(); }}).el,
    ui.slider({label:'Connections per gateway server', min:1e4, max:2e6, step:1e4, value:P.perServer, fmt:v => fmtNum(v), onInput:v => { P.perServer = v; run(); }}).el,
    ui.slider({label:'Memory per connection', min:4, max:200, value:P.kb, fmt:v => v + ' KB', onInput:v => { P.kb = v; run(); }}).el,
    ui.slider({label:'Messages sent per user per minute', min:.1, max:30, step:.1, value:P.msgs, fmt:v => String(v), onInput:v => { P.msgs = v; run(); }}).el,
    ui.slider({label:'Average recipients per message', min:1, max:500, value:P.fan, fmt:v => String(v), onInput:v => { P.fan = v; run(); }}).el), out);
  run();
}
function presenceDemo(host){
  const P = {hb:10, timeout:30, drop:25, grace:10, users:2e7, friends:150, changes:6}; const strip = el('div'); const out = el('div');
  function run(){
    const T = 120, dropAt = 30, back = dropAt + P.drop; let lastHb = 0; const st = [];
    for (let t = 0; t < T; t++){
      const conn = t < dropAt || t >= back;
      if (conn && t % P.hb === 0) lastHb = t;
      if (conn && t === back) lastHb = t;
      const serverOnline = t - lastHb <= P.timeout;
      st.push({t, conn, serverOnline});
    }
    let offFor = 0; st.forEach(s => { offFor = s.serverOnline ? 0 : offFor + 1; s.shown = s.serverOnline || offFor <= P.grace; });
    const flips = st.reduce((a, s, i) => a + (i && s.shown !== st[i - 1].shown ? 1 : 0), 0);
    strip.innerHTML = '';
    const row = (label, key, on, off) => el('div', {style:{display:'grid', gridTemplateColumns:'130px 1fr', gap:'8px', alignItems:'center', margin:'4px 0', fontSize:'12px'}}, el('span', {class:'lab-hint', style:{margin:0}}, label), el('div', {style:{display:'flex', height:'16px', borderRadius:'4px', overflow:'hidden', border:'1px solid var(--border)'}}, ...st.map(s => el('i', {style:{flex:'1', background:s[key] ? on : off}}))));
    strip.append(row('Phone network', 'conn', 'var(--ok)', 'var(--bad)'), row('Server sees', 'serverOnline', 'var(--ok)', 'var(--surface-3)'), row('Friends see', 'shown', 'var(--ok)', 'var(--surface-3)'), el('div', {class:'lab-hint'}, `0 s ………… 120 s · network drops at ${dropAt} s for ${P.drop} s`));
    const evs = P.users * P.changes / 3600 * P.friends * .3;
    out.innerHTML = '';
    out.append(el('div', {class:'verdict ' + (flips > 0 ? 'warn' : 'ok')}, flips > 0 ? `Friends saw ${flips / 2 | 0 || 1} offline flicker(s). Raise the timeout or grace period, or accept that a long drop really is “offline”.` : `No visible flicker: the ${P.drop} s drop was hidden by the ${P.timeout} s timeout + ${P.grace} s grace period. The cost is that a genuinely closed app also looks online for up to ${P.timeout + P.grace} s.`));
    out.append(frag(h.math(`Presence fan-out ≈ ${fmtNum(P.users)} online × ${P.changes} status changes/h ÷ 3600 × ${P.friends} friends × 30% of them online
               ≈ ${fmtNum(evs)} presence deliveries/s  (often more than chat messages!)`)));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Heartbeat interval', min:2, max:60, value:P.hb, fmt:v => v + ' s', onInput:v => { P.hb = v; run(); }}).el,
    ui.slider({label:'Server timeout (missed heartbeats)', min:5, max:90, value:P.timeout, fmt:v => v + ' s', onInput:v => { P.timeout = v; run(); }}).el,
    ui.slider({label:'Network drop length (tunnel, lift)', min:1, max:80, value:P.drop, fmt:v => v + ' s', onInput:v => { P.drop = v; run(); }}).el,
    ui.slider({label:'Grace period before showing offline', min:0, max:60, value:P.grace, fmt:v => v + ' s', onInput:v => { P.grace = v; run(); }}).el,
    ui.slider({label:'Friends per user', min:10, max:5000, step:10, value:P.friends, fmt:v => fmtNum(v), onInput:v => { P.friends = v; run(); }}).el), strip, out);
  run();
}
function rtcCalc(host){
  const P = {n:6, kbps:1500, simulcast:true}; const out = el('div');
  function run(){
    const n = P.n, b = P.kbps, others = n - 1;
    const meshUp = others * b, meshDown = others * b;
    const sfuUp = P.simulcast ? b * 1.6 : b, sfuDown = others * (P.simulcast && n > 4 ? b * .35 : b), sfuServer = n * sfuDown + n * sfuUp;
    const mcuUp = b, mcuDown = b, mcuServer = n * b * 2;
    out.innerHTML = '';
    out.append(frag(h.table(['Topology', 'Each client uploads', 'Each client downloads', 'Server bandwidth', 'Server CPU'], [
      ['<b>Mesh</b> (peer-to-peer)', mbps(meshUp), mbps(meshDown), 'none (except TURN relays)', 'none'],
      [`<b>SFU</b> (forwards streams${P.simulcast ? ', simulcast' : ''})`, mbps(sfuUp), mbps(sfuDown), mbps(sfuServer), 'low: routing packets, no decoding'],
      ['<b>MCU</b> (mixes into one stream)', mbps(mcuUp), mbps(mcuDown), mbps(mcuServer), `high: decodes ${n} and re-encodes`]], [1, 2, 3])));
    out.append(el('div', {class:'verdict ' + (meshUp > 4000 ? 'bad' : 'ok')}, meshUp > 4000 ? `Mesh needs ${mbps(meshUp)} upload per person. A typical 4G uplink can’t sustain that, so an SFU is the usual choice beyond 3–4 people.` : 'At this size, mesh works and needs no media server. Beyond a handful of people an SFU wins.'));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Participants', min:2, max:50, value:P.n, fmt:v => String(v), onInput:v => { P.n = v; run(); }}).el,
    ui.slider({label:'Video bitrate per stream', min:150, max:4000, step:50, value:P.kbps, fmt:mbps, onInput:v => { P.kbps = v; run(); }}).el,
    ui.toggle({label:'Simulcast (send several qualities; SFU forwards small ones for thumbnails)', checked:true, onChange:v => { P.simulcast = v; run(); }}).el), out,
    el('p', {class:'lab-hint'}, 'Simplified model: with simulcast, a sender uploads ~1.6× (high + medium + low layers); in large calls, receivers get small thumbnails (~35%) for most participants.'));
  run();
}
const LADDER = [{q:'240p', k:400}, {q:'360p', k:800}, {q:'480p', k:1400}, {q:'720p', k:2800}, {q:'1080p', k:5000}];
function bwTrace(kind, seed){
  const R = rng(seed); const T = 180; const out = [];
  for (let t = 0; t < T; t++){
    let v;
    if (kind === 'wifi') v = 9000 + (R() - .5) * 2000;
    else if (kind === 'stadium') v = 1100 + Math.sin(t / 7) * 500 + (R() - .5) * 900;
    else { v = 4500 + Math.sin(t / 15) * 1500 + (R() - .5) * 1200; if ((t > 50 && t < 66) || (t > 120 && t < 128)) v = 250 + R() * 150; }
    out.push(Math.max(120, v));
  }
  return out;
}
function simulateABR(algo, trace){
  const SEG = 4, MAXBUF = 30, DT = .1; let t = 0, buf = 0, playing = false, startup = null, stall = 0, stalls = 0, inStall = false, switches = 0, last = null, sum = 0, nseg = 0; const est = []; const hist = [];
  const bwAt = x => trace[Math.min(trace.length - 1, Math.floor(x))];
  while (t < trace.length - 1){
    let idx;
    if (algo === 'fixed') idx = 4;
    else if (algo === 'throughput'){ const hm = est.length ? est.slice(-3).length / est.slice(-3).reduce((a, x) => a + 1 / x, 0) : 1000; idx = 0; LADDER.forEach((l, i) => { if (l.k <= hm * .8) idx = i; }); }
    else { const lo = 5, hi = 25; idx = buf <= lo ? 0 : buf >= hi ? 4 : Math.floor((buf - lo) / (hi - lo) * 4.999); if (!playing) idx = 0; }
    if (last != null && idx !== last) switches++; last = idx;
    let need = LADDER[idx].k * SEG, t0 = t;
    while (need > 0 && t < trace.length - 1){
      need -= bwAt(t) * DT; t += DT;
      if (playing){ buf -= DT; if (buf <= 0){ buf = 0; stall += DT; if (!inStall){ stalls++; inStall = true; } } }
      hist.push({t, buf, q:idx});
    }
    if (need > 0) break;
    est.push(LADDER[idx].k * SEG / Math.max(.05, t - t0)); buf += SEG; inStall = false; sum += LADDER[idx].k; nseg++;
    if (!playing && buf >= SEG){ playing = true; startup = t; }
    while (buf > MAXBUF && t < trace.length - 1){ t += DT; buf -= DT; hist.push({t, buf, q:idx}); }
  }
  return {avg:nseg ? sum / nseg : 0, stall, stalls, switches, startup:startup || 0, hist};
}
SDA.abrSim = (algo, kind) => { const r = simulateABR(algo, bwTrace(kind, 4)); return {avg:Math.round(r.avg), stall:+r.stall.toFixed(1), stalls:r.stalls, switches:r.switches, startup:+r.startup.toFixed(1)}; };
function abrDemo(host){
  const P = {net:'commute', algo:'throughput'}; const cv = el('canvas', {height:520, style:{height:'260px'}, 'aria-label':'Network bandwidth, chosen video bitrate and buffer level over 3 minutes'}); const box = el('div', {class:'chart-box'}, cv);
  const met = ui.metrics(null, [{id:'avg', label:'Average bitrate', instant:true, fmt:mbps}, {id:'stall', label:'Rebuffering', unit:'s', instant:true, fmt:v => v.toFixed(1), warn:.5, bad:3}, {id:'stalls', label:'Stall events', instant:true, warn:1, bad:3}, {id:'sw', label:'Quality switches', instant:true, warn:15}, {id:'start', label:'Startup delay', unit:'s', instant:true, fmt:v => v.toFixed(1), warn:2, bad:5}]);
  const cmp = el('div');
  function run(){
    const trace = bwTrace(P.net, 4); const r = simulateABR(P.algo, trace);
    met.set('avg', r.avg); met.set('stall', r.stall); met.set('stalls', r.stalls); met.set('sw', r.switches); met.set('start', r.startup);
    const W = box.clientWidth || 640, H = 260; cv.width = W * 2; const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, W, H);
    const top = 14, mid = 170, X = t => 40 + t / 180 * (W - 50), Yk = k => mid - Math.min(k, 10000) / 10000 * (mid - top);
    g.strokeStyle = css('--accent1'); g.lineWidth = 1.4; g.beginPath(); trace.forEach((v, i) => i ? g.lineTo(X(i), Yk(v)) : g.moveTo(X(i), Yk(v))); g.stroke();
    g.strokeStyle = css('--ok'); g.lineWidth = 2.2; g.beginPath(); r.hist.forEach((p, i) => { const y = Yk(LADDER[p.q].k); i ? g.lineTo(X(p.t), y) : g.moveTo(X(p.t), y); }); g.stroke();
    const by = b => H - 18 - Math.min(b, 30) / 30 * (H - mid - 30); g.strokeStyle = css('--warn'); g.lineWidth = 1.6; g.beginPath(); r.hist.forEach((p, i) => i ? g.lineTo(X(p.t), by(p.buf)) : g.moveTo(X(p.t), by(p.buf))); g.stroke();
    g.fillStyle = css('--bad'); r.hist.forEach(p => { if (p.buf <= 0 && p.t > r.startup) g.fillRect(X(p.t), H - 18, 2, 4); });
    g.lineWidth = 1; g.font = '11px ' + css('--font-mono'); g.fillStyle = css('--muted');
    g.fillStyle = css('--accent1'); g.fillText('— bandwidth', 44, 12); g.fillStyle = css('--ok'); g.fillText('— chosen bitrate', 140, 12); g.fillStyle = css('--warn'); g.fillText('— buffer (lower panel, 0–30 s)', 270, 12); g.fillStyle = css('--bad'); g.fillText('▮ stall', 480, 12); g.fillStyle = css('--muted'); [0, 60, 120, 180].forEach(s => g.fillText(s + 's', X(s) - 8, H - 3)); g.fillText('10M', 4, Yk(10000) + 8); g.fillText('5M', 10, Yk(5000) + 4);
    cmp.innerHTML = '';
    const rows = ['fixed', 'throughput', 'buffer'].map(a => { const x = simulateABR(a, trace); return [{fixed:'Always 1080p', throughput:'Throughput-based', buffer:'Buffer-based (BBA-style)'}[a] + (a === P.algo ? ' ◀' : ''), mbps(x.avg), x.stall.toFixed(1) + ' s', String(x.switches)]; });
    cmp.append(frag(h.table(['Algorithm (same network)', 'Avg bitrate', 'Rebuffering', 'Switches'], rows, [1, 2, 3])));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.select({label:'Network', value:P.net, options:[['commute', '4G on a commute (tunnels drop to ~300 kbps)'], ['stadium', 'Crowded stadium (0.5–2 Mbps)'], ['wifi', 'Home Wi-Fi (~9 Mbps)']], onChange:v => { P.net = v; run(); }}).el,
    ui.select({label:'ABR algorithm', value:P.algo, options:[['fixed', 'Always 1080p (no adaptation)'], ['throughput', 'Throughput-based (last 3 segments × 0.8)'], ['buffer', 'Buffer-based (bitrate from buffer level)']], onChange:v => { P.algo = v; run(); }}).el), box, el('div', {style:{height:'10px'}}), met.el, cmp,
    el('p', {class:'lab-hint'}, 'Simulated 3-minute playback in 0.1 s steps: 4-second segments, 30-second max buffer, ladder 240p 400 kbps → 1080p 5 Mbps. Bandwidth traces are seeded and synthetic.'));
  run();
}
function transcodeCalc(host){
  const P = {min:60, rend:5, speed:1.5, chunk:10, workers:200}; const out = el('div');
  function run(){
    const secs = P.min * 60; const serial = secs * P.rend / P.speed; const chunks = Math.ceil(secs / P.chunk); const tasks = chunks * P.rend; const waves = Math.ceil(tasks / P.workers); const parallel = waves * (P.chunk / P.speed) + 20;
    out.innerHTML = '';
    out.append(frag(h.math(`One machine, all renditions in sequence: ${P.min} min × ${P.rend} renditions ÷ ${P.speed}× speed ≈ ${fmtDur(serial * 1000)}
Chunked: ${chunks} chunks × ${P.rend} renditions = ${fmtNum(tasks)} independent tasks on ${P.workers} workers
  → ${waves} wave(s) × ${(P.chunk / P.speed).toFixed(1)} s + ~20 s split/merge/package ≈ ${fmtDur(parallel * 1000)}  (${(serial / parallel).toFixed(0)}× faster)`)));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Video length', min:1, max:180, value:P.min, fmt:v => v + ' min', onInput:v => { P.min = v; run(); }}).el,
    ui.slider({label:'Renditions in the bitrate ladder', min:1, max:12, value:P.rend, fmt:v => String(v), onInput:v => { P.rend = v; run(); }}).el,
    ui.slider({label:'Encode speed per worker', min:.2, max:5, step:.1, value:P.speed, fmt:v => v + '× real time', onInput:v => { P.speed = v; run(); }}).el,
    ui.slider({label:'Chunk length', min:2, max:60, value:P.chunk, fmt:v => v + ' s', onInput:v => { P.chunk = v; run(); }}).el,
    ui.slider({label:'Workers available', min:1, max:2000, value:P.workers, fmt:v => fmtNum(v), onInput:v => { P.workers = v; run(); }}).el), out,
    el('p', {class:'lab-hint'}, 'Illustrative: encode speed depends heavily on codec (H.264 vs HEVC vs AV1), resolution, preset and hardware. Chunks must start on keyframes (closed GOPs) so they can be encoded independently and stitched.'));
  run();
}
function syncDemo(host){
  const base = {title:'Groceries', body:'milk, atta', done:false};
  const P = {strategy:'field', aTitle:'Groceries for Sunday', bBody:'milk, atta, paneer', bTitle:'', bLast:true};
  const out = el('div');
  function run(){
    const A = {at:P.bLast ? 1 : 2, changes:{title:P.aTitle}};
    const B = {at:P.bLast ? 2 : 1, changes:Object.assign({body:P.bBody}, P.bTitle ? {title:P.bTitle} : {})};
    const docA = Object.assign({}, base, A.changes), docB = Object.assign({}, base, B.changes);
    const [first, second] = A.at < B.at ? [['A', A, docA], ['B', B, docB]] : [['B', B, docB], ['A', A, docA]];
    let result, lost = [], conflicts = [];
    if (P.strategy === 'doc'){ result = second[2]; Object.keys(first[1].changes).forEach(k => { if (first[1].changes[k] !== result[k]) lost.push(`${first[0]}’s ${k} = “${first[1].changes[k]}”`); }); }
    else if (P.strategy === 'field'){ result = Object.assign({}, base); [first, second].forEach(([, d]) => Object.assign(result, d.changes)); Object.keys(first[1].changes).forEach(k => { if (k in second[1].changes && second[1].changes[k] !== first[1].changes[k]) lost.push(`${first[0]}’s ${k} = “${first[1].changes[k]}” (same field edited later by ${second[0]})`); }); }
    else { result = Object.assign({}, base); [first, second].forEach(([, d]) => Object.assign(result, d.changes)); Object.keys(A.changes).forEach(k => { if (k in B.changes && A.changes[k] !== B.changes[k]){ result[k] = `⚠ “${A.changes[k]}” | “${B.changes[k]}”`; conflicts.push(k); } }); }
    out.innerHTML = '';
    out.append(frag(h.table(['', 'title', 'body'], [['Server before (both phones synced this)', esc(base.title), esc(base.body)], ['Phone A offline edit', esc(docA.title), esc(docA.body)], ['Phone B offline edit', esc(docB.title), esc(docB.body)], [`<b>After both sync</b> (${second[0]} synced last)`, `<b>${esc(result.title)}</b>`, `<b>${esc(result.body)}</b>`]], [])));
    out.append(el('div', {class:'verdict ' + (lost.length ? 'bad' : conflicts.length ? 'warn' : 'ok')}, lost.length ? `Silently lost: ${lost.join('; ')}.` : conflicts.length ? `Both edits to “${conflicts.join(', ')}” are kept and the user is asked to choose. Nothing is lost, but the user has work to do.` : 'Both edits survived: they touched different fields, so a per-field merge combines them.'));
  }
  const ai = el('input', {class:'input', value:P.aTitle, 'aria-label':'Phone A new title'}); ai.addEventListener('input', () => { P.aTitle = ai.value; run(); });
  const bb = el('input', {class:'input', value:P.bBody, 'aria-label':'Phone B new body'}); bb.addEventListener('input', () => { P.bBody = bb.value; run(); });
  const bt = el('input', {class:'input', value:P.bTitle, placeholder:'(leave empty = not edited)', 'aria-label':'Phone B new title'}); bt.addEventListener('input', () => { P.bTitle = bt.value; run(); });
  host.append(el('div', {class:'ctl-grid'}, el('label', {class:'field'}, el('span', null, 'Phone A (offline) changes the title to'), ai), el('label', {class:'field'}, el('span', null, 'Phone B (offline) changes the body to'), bb), el('label', {class:'field'}, el('span', null, 'Phone B also changes the title to'), bt),
    ui.select({label:'Merge strategy on sync', value:P.strategy, options:[['doc', 'Last writer wins (whole document)'], ['field', 'Last writer wins per field'], ['conflict', 'Per-field merge; keep both on same-field conflict']], onChange:v => { P.strategy = v; run(); }}).el),
    el('div', {class:'controls', style:{margin:'8px 0'}}, ui.toggle({label:'Phone B syncs last', checked:true, onChange:v => { P.bLast = v; run(); }}).el), out);
  run();
}
function mobileBudget(host){
  const NET = {'2g':{l:'2G / poor (~300 ms RTT, 250 kbps)', rtt:300, kbps:250}, '3g':{l:'3G (~150 ms RTT, 1.5 Mbps)', rtt:150, kbps:1500}, '4g':{l:'4G (~60 ms RTT, 10 Mbps)', rtt:60, kbps:10000}, 'wifi':{l:'Good Wi-Fi (~20 ms RTT, 50 Mbps)', rtt:20, kbps:50000}};
  const P = {net:'3g', kb:1800, chain:4, h2:true, tls13:true, cdn:true}; const out = el('div');
  function run(){
    const n = NET[P.net]; const rtt = P.cdn ? Math.max(15, n.rtt * .6) : n.rtt;
    const setup = rtt * (1 + 1 + (P.tls13 ? 1 : 2));
    const chain = P.chain * rtt; const xfer = P.kb * 8 / n.kbps * 1000; const conns = P.h2 ? 0 : Math.min(4, P.chain) * rtt * 1.5;
    const total = setup + chain + xfer + conns;
    out.innerHTML = '';
    out.append(frag(h.table(['Part', 'Time'], [['DNS + TCP + TLS handshakes', fmtDur(setup)], [`${P.chain} sequential round trips on the critical path (HTML → CSS/JS → API → data)`, fmtDur(chain)], [`Download ${fmtNum(P.kb)} KB`, fmtDur(xfer)], ['Extra connections (HTTP/1.1)', fmtDur(conns)], ['<b>Total until usable</b>', `<b>${fmtDur(total)}</b>`]], [1])));
    out.append(el('div', {class:'verdict ' + (total > 5000 ? 'bad' : total > 3000 ? 'warn' : 'ok')}, total > 3000 ? `Over a 3-second budget. On slow networks, latency (round trips) and bytes dominate: cut the critical chain (inline critical CSS, preconnect, fewer API hops, server-render the first screen) and the payload (compress images, code-split).` : 'Within a 3-second budget on this network.'));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.select({label:'Network', value:P.net, options:Object.entries(NET).map(([k, v]) => [k, v.l]), onChange:v => { P.net = v; run(); }}).el,
    ui.slider({label:'Bytes needed for the first screen', min:50, max:5000, step:50, value:P.kb, fmt:v => fmtNum(v) + ' KB', onInput:v => { P.kb = v; run(); }}).el,
    ui.slider({label:'Sequential round trips on the critical path', min:1, max:10, value:P.chain, fmt:v => String(v), onInput:v => { P.chain = v; run(); }}).el,
    ui.toggle({label:'HTTP/2 or HTTP/3 multiplexing', checked:true, onChange:v => { P.h2 = v; run(); }}).el,
    ui.toggle({label:'TLS 1.3 (1-RTT handshake)', checked:true, onChange:v => { P.tls13 = v; run(); }}).el,
    ui.toggle({label:'CDN edge close to the user', checked:true, onChange:v => { P.cdn = v; run(); }}).el), out,
    el('p', {class:'lab-hint'}, 'A rough model with illustrative network profiles. Real mobile networks add radio wake-up delay, packet loss and variable bandwidth, so measure with real-user monitoring.'));
  run();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'websockets-at-scale', title:'WebSockets at scale', minutes:12, tags:['WebSocket','gateway','connection','pub/sub','reconnect storm','sticky'],
  summary:'Long-lived connections turn stateless web servers into stateful gateways. Scale them with a dedicated connection tier, a routing layer (pub/sub or a session directory) to reach the right gateway, and careful handling of deploys and reconnect storms.',
  problem:`<p>Your chat app has 5 million users online at once. Each holds an open WebSocket to some server. When Asha sends a message to a group of 8, how does the server holding Asha’s connection find the 8 servers holding her friends’ connections? And what happens when you deploy and every one of those 5 million connections drops at the same moment?</p>`,
  intuition:`A telephone exchange. Each phone has a line wired to one exchange (gateway). To connect a call across the city, exchanges need a directory of which exchange each number is on and trunk lines between them (pub/sub). If one exchange reboots, all its phones lose their lines and redial together.`,
  how:{
    steps:[`A <b>gateway tier</b> terminates WebSockets (TLS, auth on connect, heartbeats/pings) and holds nothing but connection state.`, `On connect, register <b>user → gateway</b> in a session directory (e.g. Redis) or subscribe the gateway to the user’s channels in a pub/sub system.`, `Business services (chat, notifications) publish messages to a <b>routing layer</b>; it delivers to the gateways holding recipients’ connections, which push them down the sockets.`, `Persist messages first (durable store) and treat the socket as a fast path. Offline users get them on reconnect (sync from last seen ID) or via push notifications.`, `Deploy with <b>connection draining</b> and clients that <b>reconnect with jittered backoff</b> and resume from the last message ID.`],
    diagram:{title:'Gateways + routing layer', w:820, h:270, alt:'Users connect to WebSocket gateways; the chat service persists messages and publishes to a routing layer that pushes to the gateways of recipients.',
      nodes:[{id:'a', type:'client', label:'Asha', x:70, y:70}, {id:'b', type:'client', label:'Ravi', x:70, y:200}, {id:'lb', type:'lb', label:'L4 load balancer', x:210, y:135, w:130}, {id:'g1', type:'service', label:'Gateway 1', sub:'Asha’s socket', x:380, y:70, w:130}, {id:'g2', type:'service', label:'Gateway 2', sub:'Ravi’s socket', x:380, y:200, w:130}, {id:'chat', type:'service', label:'Chat service', x:580, y:70, w:120}, {id:'db', type:'db', label:'Message store', x:740, y:70, w:120}, {id:'ps', type:'queue', label:'Routing / pub-sub', sub:'user → gateway', x:620, y:200, w:160}],
      edges:[{from:'a', to:'lb'}, {from:'b', to:'lb'}, {from:'lb', to:'g1'}, {from:'lb', to:'g2'}, {from:'g1', to:'chat'}, {from:'chat', to:'db'}, {from:'chat', to:'ps'}, {from:'ps', to:'g2'}],
      steps:[
        {note:'Both users hold long-lived WebSockets, landing on different gateways. Each gateway registers its users in the routing layer.', flow:[['a', 'lb'], ['lb', 'g1', 'WS'], ['b', 'lb'], ['lb', 'g2', 'WS']]},
        {note:'Asha sends “hi”. The chat service <b>persists it first</b> (so it survives any socket failure).', flow:[['a', 'g1', '“hi”'], ['g1', 'chat'], ['chat', 'db', 'store msg #812']]},
        {note:'Chat publishes to the routing layer, which knows Ravi is on Gateway 2 and pushes it down Ravi’s socket.', flow:[['chat', 'ps', 'to: Ravi'], ['ps', 'g2'], ['g2', 'b', '“hi”']]},
        {note:'Gateway 2 is redeployed: it drains, Ravi reconnects (jittered) to another gateway and asks for messages after #812, so nothing is lost.', status:{g2:'down'}, flow:[['b', 'lb', 'reconnect, since=#812']]}
      ]},
    mount:host => wsCapacity(host),
    deep:`<p><b>Load balancing long-lived connections:</b> least-connections works better than round robin; connection counts drift over time (new gateways start empty), so rebalance gently by asking clients to reconnect in small batches. L4 balancing keeps per-connection overhead low; L7 lets you route by path or auth.</p><p><b>Back-pressure:</b> slow clients (bad networks) build up send buffers on the gateway. Cap per-connection queues and drop or coalesce (e.g. only the latest typing indicator).</p><p><b>Alternatives:</b> SSE for server→client streams over plain HTTP (simpler, works with HTTP/2), long polling as a fallback, and MQTT for IoT/mobile with flaky links. Managed options (AWS API Gateway WebSockets, Ably, Pusher) trade cost for ops.</p>`
  },
  tradeoffs:{use:[`Chat, live collaboration, multiplayer games, live dashboards, trading tickers`], avoid:[`WebSockets for rare updates (use push notifications or polling)`, `Storing business state only in gateways`], alt:[`SSE`, `Long polling`, `MQTT`, `Managed real-time services`]},
  real:[
    {co:'WhatsApp', tier:'confirmed', text:'WhatsApp’s engineers wrote in 2012 that a single FreeBSD server running its Erlang stack had held over 2 million concurrent TCP connections.', src:'WhatsApp blog, “1 million is so 2011” (2012)'},
    {co:'Discord', tier:'confirmed', text:'Discord described scaling its Elixir-based real-time system to 5 million concurrent users, including how it fans out events to members of large servers (guilds).', src:'Discord Engineering, “How Discord Scaled Elixir to 5,000,000 Concurrent Users” (2017)'},
    {co:'Slack', tier:'confirmed', text:'Slack described a real-time architecture in which gateway servers hold client WebSockets and channel servers fan out messages to the gateways of subscribed users.', src:'Slack Engineering, “Real-time Messaging” (2023)'}
  ],
  mistakes:[`Relying on the socket for delivery without persisting messages`, `All clients reconnecting instantly after a deploy (thundering herd)`, `Round-robin balancing of long-lived connections`],
  interview:[`Separate the gateway tier, describe user→gateway routing, persistence-first delivery, resume-from-ID and jittered reconnects`],
  tryit:{note:'Size the gateway fleet above for 50 million users. Then:', quiz:[{q:'User B is connected to gateway 7. How does a message from user A (on gateway 2) reach B?', options:['Gateway 2 opens a socket to B', 'Via a routing layer/pub-sub that knows B is on gateway 7', 'B polls gateway 2', 'DNS'], answer:1, why:'Gateways are connected through a routing layer.'}], quizId:'rt-l1'},
  sources:[`WhatsApp blog (2012)`, `Discord Engineering (2017)`, `Slack Engineering (2023)`, `RFC 6455 (WebSocket)`]
},
{
  id:'presence', title:'Presence: online, typing and last seen', minutes:9, tags:['presence','heartbeat','last seen','typing indicator','fan-out'],
  summary:'Presence is tracked with heartbeats and timeouts, smoothed with grace periods, and is expensive mostly because of fan-out: every status change can notify many friends. Deliver it lazily and only to people who are looking.',
  problem:`<p>Showing a green dot next to online friends sounds trivial. But phones drop off networks in lifts and tunnels, apps get killed in the background, and each status change must reach hundreds of friends. With tens of millions online, presence updates can outnumber the actual chat messages.</p>`,
  intuition:`An office in/out board. Each person taps their badge every few minutes (heartbeat). If someone hasn’t tapped for a while, the board shows them as out (timeout). You don’t phone every colleague each time someone steps out; people glance at the board when they need to (fan-out on read).`,
  how:{
    steps:[`Clients send <b>heartbeats</b> over their connection (or the gateway tracks the connection itself).`, `The presence service stores <code>user → {status, lastSeen}</code> with a TTL; missing heartbeats beyond the <b>timeout</b> mean offline.`, `Add a <b>grace period</b> before announcing offline, so short drops don’t cause flicker.`, `<b>Fan-out</b> changes only to friends who are online <i>and</i> currently viewing the relevant screen (chat list, a conversation); others read status lazily when they open the app.`, `Ephemeral signals (typing…) are best-effort: never persisted, rate-limited, dropped under load.`],
    mount:host => presenceDemo(host),
    deep:`<p><b>Large groups:</b> for groups or servers with thousands of members, don’t push every status change to everyone. Show counts (“1,204 online”), send presence for the visible member list only, or batch updates every few seconds.</p><p><b>Multiple devices:</b> a user is online if any device is; “last seen” is the max across devices. Store per-device sessions and aggregate.</p><p><b>Privacy:</b> “last seen” and read receipts are privacy features too. Respect per-user visibility settings in the fan-out path, not just in the UI.</p>`
  },
  tradeoffs:{use:[`Heartbeat + TTL + grace period; lazy fan-out to active viewers`], avoid:[`Writing presence to the main database on every heartbeat`, `Pushing every change to every friend`], alt:[`Coarse presence (“active today”) for very large social graphs`, `Polling presence when a screen opens`]},
  real:[
    {co:'LinkedIn', tier:'confirmed', text:'LinkedIn described its real-time presence platform using periodic heartbeats and delayed offline detection (only marking a member offline after a heartbeat window passes) to avoid flapping on unstable mobile connections.', src:'LinkedIn Engineering, “Now You See Me, Now You Don’t: LinkedIn’s Real-Time Presence Platform” (2018)'},
    {co:'Discord', tier:'confirmed', text:'Discord’s engineering posts describe presence and member-list updates in very large servers as a major fan-out cost, handled with Elixir processes per server and selective updates.', src:'Discord Engineering blog (2017–2019)'},
    {co:'Messaging “last seen”', tier:'educational', text:'Store last-seen timestamps in a fast KV store with TTL; read them when a chat opens rather than broadcasting every change.', src:'Simplified educational design'}
  ],
  mistakes:[`Very short timeouts that make users flicker online/offline`, `Synchronous DB writes per heartbeat`, `Ignoring privacy settings in fan-out`],
  interview:[`Heartbeat + timeout + grace, store in Redis with TTL, fan out only to active viewers, estimate the fan-out cost`],
  tryit:{note:'Adjust heartbeat, timeout and grace above so a 25-second tunnel drop doesn’t show you offline.', quiz:[{q:'Why are presence updates often more expensive than chat messages?', options:['They are bigger', 'Each status change fans out to many friends, and changes are frequent', 'They need encryption', 'They are stored forever'], answer:1, why:'Fan-out × frequency.'}], quizId:'rt-l2'},
  sources:[`LinkedIn Engineering (2018)`, `Discord Engineering`]
},
{
  id:'push-notifications', title:'Push notifications (APNs and FCM)', minutes:9, tags:['push notification','APNs','FCM','device token','collapse key','TTL'],
  summary:'Mobile apps can’t keep sockets open in the background, so servers send notifications through the platform services, Apple Push Notification service and Firebase Cloud Messaging, using device tokens, with TTLs, priorities and collapse keys.',
  problem:`<p>Your delivery app needs to tell a user “Your order is out for delivery” while the app is closed. iOS and Android suspend background apps to save battery, so your WebSocket is gone. You also have 30 million installed devices, tokens that silently expire, and a marketing team that wants to send 10 notifications a day.</p>`,
  intuition:`The postal service versus a personal messenger. You can’t keep a runner waiting outside every customer’s house (an open socket). Instead you hand letters to the postal service (APNs/FCM), which already visits every house efficiently. You need the right address (device token), and junk mail gets ignored or blocked.`,
  how:{
    steps:[`On install/login the app asks permission and obtains a <b>device token</b> from APNs/FCM; it sends the token to your backend tied to user and device.`, `Your <b>notification service</b> decides what to send (preferences, quiet hours, rate limits, dedupe) and enqueues jobs.`, `Workers call APNs (HTTP/2, token-based auth) or FCM (HTTP v1 API) with the token, payload (≤ 4 KB), <b>priority</b>, <b>TTL/expiry</b> and <b>collapse key</b>.`, `The platform delivers when the device is reachable; the OS shows it (or wakes the app for silent/data messages within limits).`, `Handle responses: remove <b>invalid/unregistered tokens</b>, retry transient errors with backoff, and track delivery/open rates.`],
    diagram:{title:'Sending a push notification', w:800, h:230, alt:'Order service emits an event, notification service applies preferences and queues, workers send to APNs and FCM, which deliver to devices.',
      nodes:[{id:'ord', type:'service', label:'Order service', x:80, y:115, w:120}, {id:'ns', type:'service', label:'Notification service', sub:'prefs · dedupe · rate limit', x:270, y:115, w:170}, {id:'q', type:'queue', label:'Send queue', x:460, y:115}, {id:'apns', type:'ext', label:'APNs', x:630, y:50}, {id:'fcm', type:'ext', label:'FCM', x:630, y:180}, {id:'ph', type:'client', label:'Phones', x:760, y:115}],
      edges:[{from:'ord', to:'ns'}, {from:'ns', to:'q'}, {from:'q', to:'apns'}, {from:'q', to:'fcm'}, {from:'apns', to:'ph'}, {from:'fcm', to:'ph'}],
      steps:[
        {note:'The order service emits <code>OrderOutForDelivery</code>.', flow:[['ord', 'ns', 'event']]},
        {note:'The notification service checks preferences and quiet hours, looks up the user’s device tokens, and enqueues one job per device with collapse key <code>order-881-status</code>.', flow:[['ns', 'q', '2 jobs']], hl:['ns']},
        {note:'Workers send to APNs (iPhone) and FCM (Android) with TTL 10 min and high priority.', flow:[['q', 'apns'], ['q', 'fcm']], parallel:true},
        {note:'The platforms deliver. One token comes back <b>unregistered</b> (app uninstalled), so it is deleted from your table.', flow:[['apns', 'ph', '🔔'], ['fcm', 'ph', '🔔']], parallel:true}
      ]},
    deep:`<p><b>Collapse keys</b> replace older undelivered notifications with the same key (a phone offline for an hour gets only the latest order status, not 6). <b>TTL</b> drops notifications that would be stale (an OTP after 10 minutes, a “live score” after the over). <b>Priority</b>: use high priority only for time-sensitive user-visible messages; platforms throttle apps that abuse it.</p><p><b>Scale:</b> a broadcast to 30 million devices is a batch job: shard by token, rate-limit to stay within provider guidance, spread over minutes, and personalise in workers. Track per-campaign delivery and opt-outs.</p><p><b>Reliability:</b> push is best-effort, so never make it the only path for important data. The app must sync state from the server when opened (the notification is a hint).</p>`
  },
  tradeoffs:{use:[`Reaching users when the app is backgrounded or closed`, `Waking the app to sync (silent/data messages, within OS limits)`], avoid:[`Push as the source of truth for data`, `High-priority spam (users disable notifications; platforms throttle)`], alt:[`SMS/WhatsApp messages for critical alerts (cost)`, `In-app inbox synced on open`, `Email for non-urgent updates`]},
  real:[
    {co:'Apple APNs', tier:'confirmed', text:'APNs uses an HTTP/2 API with token- or certificate-based authentication, a 4 KB payload limit for regular notifications, and headers for priority, expiration and collapse ID.', src:'Apple Developer documentation — Sending notification requests to APNs'},
    {co:'Firebase Cloud Messaging', tier:'confirmed', text:'FCM’s HTTP v1 API supports notification and data messages up to 4 KB, collapse keys, TTL and normal/high priority, and reports unregistered tokens to remove.', src:'Firebase Cloud Messaging documentation'},
    {co:'OTP and delivery updates', tier:'educational', text:'OTPs get short TTLs and high priority; order-status updates share a collapse key so only the latest is shown after reconnecting.', src:'Simplified educational design'}
  ],
  mistakes:[`Never pruning dead tokens (wasted sends, provider penalties)`, `No TTL, so stale OTPs and offers arrive hours later`, `Sending one notification per event without dedupe or rate limits`],
  interview:[`Describe token registration, a notification service with preferences/dedupe/rate-limits, a send queue, APNs/FCM, collapse keys, TTL and token cleanup`],
  tryit:{quiz:[{q:'A phone was offline for 2 hours and 6 “order status” notifications were sent with the same collapse key. On reconnect it receives…', options:['All 6', 'Only the latest', 'None', 'The first'], answer:1, why:'Collapse keys replace pending notifications.'}, {q:'Why can’t you just use a WebSocket to notify a closed app?', options:['WebSockets are insecure', 'The OS suspends background apps and closes their connections to save battery', 'Too expensive', 'They are one-way'], answer:1, why:'Platform push services keep one efficient connection per device.'}], quizId:'rt-l3'},
  sources:[`Apple APNs documentation`, `Firebase Cloud Messaging documentation`]
},
{
  id:'webrtc', title:'WebRTC: peer-to-peer media, STUN, TURN and SFUs', minutes:11, tags:['WebRTC','STUN','TURN','ICE','SFU','MCU','simulcast'],
  summary:'WebRTC sends audio/video directly between browsers or apps with low latency. Signalling sets up the call, ICE with STUN/TURN gets through NATs, and beyond a few people an SFU forwards streams to keep each client’s bandwidth manageable.',
  problem:`<p>Two people on mobile networks behind carrier NATs want a video call with under 300 ms delay. Neither device has a public IP address. With 8 people, every phone would need to upload 7 video streams. How do you connect them, and how do you scale group calls?</p>`,
  intuition:`Two people in different apartment buildings who want to talk through their windows. First they exchange notes through the building managers (signalling). A helper on the street tells each one what their window looks like from outside (STUN). If the windows can’t face each other, a courier relays everything (TURN). For a big group, a host in the middle passes each person’s voice along (SFU).`,
  how:{
    steps:[`<b>Signalling</b> (your own server, often over WebSocket) exchanges session descriptions (SDP: codecs, media) and network candidates between peers. WebRTC doesn’t define signalling.`, `<b>ICE</b> gathers candidates: local addresses, public addresses learned via <b>STUN</b>, and relay addresses from <b>TURN</b> servers; it tests pairs and picks the best working path.`, `Media flows over SRTP (encrypted) on UDP; codecs adapt bitrate to network conditions (congestion control).`, `<b>Topologies</b>: mesh (everyone to everyone) for 2–4 people; <b>SFU</b> (server forwards packets, no decoding) for groups; <b>MCU</b> (server mixes into one stream) for very weak clients or legacy endpoints.`, `<b>Simulcast/SVC</b>: senders upload several qualities; the SFU forwards the right layer to each receiver.`],
    diagram:{title:'Connecting a WebRTC call', w:800, h:260, alt:'Two peers exchange offers via a signalling server, discover public addresses via STUN, connect directly or via TURN if blocked.',
      nodes:[{id:'a', type:'client', label:'Peer A', sub:'behind NAT', x:90, y:135}, {id:'sig', type:'service', label:'Signalling server', sub:'WebSocket', x:400, y:45, w:160}, {id:'stun', type:'ext', label:'STUN', sub:'“your public IP:port”', x:400, y:135, w:170}, {id:'turn', type:'ext', label:'TURN relay', sub:'fallback', x:400, y:225, w:130}, {id:'b', type:'client', label:'Peer B', sub:'behind NAT', x:710, y:135}],
      edges:[{from:'a', to:'sig'}, {from:'sig', to:'b'}, {from:'a', to:'stun'}, {from:'b', to:'stun'}, {from:'a', to:'turn', dashed:true}, {from:'turn', to:'b', dashed:true}, {from:'a', to:'b', dashed:true}],
      steps:[
        {note:'A sends an SDP <b>offer</b> via the signalling server; B replies with an <b>answer</b>.', flow:[['a', 'sig', 'offer'], ['sig', 'b'], ['b', 'sig', 'answer'], ['sig', 'a']]},
        {note:'Both ask STUN for their public address:port and exchange these <b>ICE candidates</b> through signalling.', flow:[['a', 'stun', '?'], ['b', 'stun', '?']], parallel:true},
        {note:'ICE tries direct paths. Most calls connect <b>peer-to-peer</b> through the NATs, so media never touches your servers.', flow:[['a', 'b', 'SRTP media']]},
        {note:'If a strict NAT or firewall blocks it, media goes via a <b>TURN relay</b>: always works, costs you bandwidth.', flow:[['a', 'turn', 'media'], ['turn', 'b']]}
      ]},
    mount:host => rtcCalc(host),
    deep:`<p><b>TURN capacity</b> is a real cost: some fraction of calls (strict corporate firewalls, symmetric NATs) relay all media through your servers, so plan bandwidth and place TURN servers near users (e.g. Mumbai and Chennai for India).</p><p><b>SFU scaling:</b> one SFU can forward many streams but is bounded by bandwidth and packet rate; large meetings cascade SFUs across regions (participants connect to the nearest SFU; SFUs relay between each other). For webinars with thousands of viewers, switch from WebRTC to HLS/LL-HLS for the audience.</p><p><b>Quality:</b> bandwidth estimation (e.g. Google congestion control), jitter buffers, forward error correction and NACK retransmissions trade latency for smoothness; the target is mouth-to-ear delay under ~150–300 ms.</p>`
  },
  tradeoffs:{use:[`Interactive calls, voice chat, live tutoring, gaming voice (sub-second latency)`], avoid:[`One-to-millions broadcast (use HLS/DASH + CDN)`, `Mesh beyond ~4 participants`], alt:[`HLS/LL-HLS or DASH for large audiences`, `Managed SFU services (LiveKit, Twilio, Agora, Daily)`]},
  real:[
    {co:'IETF / W3C', tier:'confirmed', text:'WebRTC combines W3C browser APIs with IETF protocols: ICE (RFC 8445), STUN (RFC 8489), TURN (RFC 8656) and SRTP for encrypted media.', src:'W3C WebRTC 1.0; IETF RFCs 8445, 8489, 8656'},
    {co:'Discord voice', tier:'confirmed', text:'Discord described handling millions of concurrent voice users with WebRTC clients connecting to its own selective forwarding units, with native clients using a customised WebRTC stack.', src:'Discord Engineering, “How Discord Handles Two and Half Million Concurrent Voice Users using WebRTC” (2018)'},
    {co:'Google Meet', tier:'confirmed', text:'Google Meet runs on WebRTC in the browser, without plugins.', src:'Google Meet / WebRTC project documentation'}
  ],
  mistakes:[`Forgetting TURN, so calls fail on strict networks`, `Mesh for 8-person calls on mobile`, `Using WebRTC for a million-viewer broadcast`],
  interview:[`Explain signalling vs media, STUN vs TURN, and mesh vs SFU vs MCU with bandwidth math`],
  tryit:{note:'Increase participants above and compare per-client upload for mesh vs SFU. Then classify:', mount:host => sortGame(host, [
    {t:'SDP offer and answer', c:'sig', why:'Exchanged via your signalling channel.'},
    {t:'Video frames encrypted with SRTP', c:'media', why:'Media path.'},
    {t:'ICE candidates (possible addresses)', c:'sig', why:'Exchanged via signalling.'},
    {t:'Audio relayed through TURN', c:'media', why:'Media via relay.'},
    {t:'“Peer B joined the room” message', c:'sig', why:'App/session control.'}
  ], [{id:'sig', label:'Signalling path'}, {id:'media', label:'Media path'}])},
  sources:[`W3C WebRTC 1.0`, `RFC 8445, 8489, 8656`, `Discord Engineering (2018)`, `webrtcforthecurious.com (Sean DuBois et al.)`]
},
{
  id:'live-streaming-abr', title:'Live streaming and adaptive bitrate (HLS/DASH)', minutes:12, tags:['HLS','DASH','adaptive bitrate','ABR','segment','manifest','CDN','latency'],
  summary:'Streaming video is cut into short segments at several bitrates and listed in a manifest. Players adapt quality segment by segment to the network (ABR), and CDNs cache segments so millions can watch: the trade-off is delay vs smoothness vs quality.',
  problem:`<p>Twenty million people watch the final over on phones ranging from fibre to a patchy 4G connection in a moving bus. Send everyone 1080p and the bus passengers buffer; send everyone 360p and the fibre users see mush. And the stream must survive millions of viewers arriving at once when a wicket falls.</p>`,
  intuition:`A buffet with plates of several sizes. Each guest takes a plate size that matches how fast they can eat (bandwidth) and how much is already on their table (buffer). If the kitchen is slow today, they switch to smaller plates instead of sitting with an empty table (rebuffering).`,
  how:{
    steps:[`<b>Encode</b> the source into a <b>bitrate ladder</b> (e.g. 240p 400 kbps … 1080p 5 Mbps), aligned so every rendition switches at the same keyframes.`, `<b>Package</b> into short segments (2–6 s) and a <b>manifest</b> (HLS .m3u8 playlist, DASH .mpd) listing renditions and segment URLs.`, `Serve segments over HTTP from a <b>CDN</b>, so they are cacheable and shared by everyone watching the same moment.`, `The <b>player</b> downloads segments ahead into a buffer and picks each next segment’s quality from measured throughput and/or buffer level (ABR).`, `<b>Live latency</b> ≈ encoder delay + segment duration × segments buffered + CDN; low-latency HLS/DASH use partial segments and chunked transfer to get to a few seconds.`],
    mount:host => abrDemo(host),
    deep:`<p><b>ABR algorithms:</b> throughput-based (pick the highest rendition below estimated bandwidth × safety factor) reacts quickly but oscillates on noisy networks; buffer-based (BBA, BOLA) chooses from buffer occupancy, which is stable but slow to ramp up; hybrids (MPC-style) combine both. Netflix’s research on buffer-based adaptation showed fewer rebuffers without lowering average quality.</p><p><b>Live at scale:</b> segments are identical for all viewers, so CDNs absorb load; protect origins with request collapsing and origin shields; pre-warm CDN capacity before big events; and keep manifests short-cached (they change every few seconds).</p><p><b>Per-title/per-scene encoding</b> chooses ladders by content complexity (a cartoon needs fewer bits than a cricket stadium crowd), saving bandwidth at the same quality.</p>`
  },
  tradeoffs:{use:[`HLS/DASH + CDN for one-to-many video, live or on demand`], avoid:[`HLS for two-way conversation (seconds of latency; use WebRTC)`, `A single bitrate for mobile audiences`], alt:[`Low-latency HLS/DASH (a few seconds)`, `WebRTC-based broadcast for sub-second interactivity at higher cost`]},
  real:[
    {co:'Apple HLS and MPEG-DASH', tier:'confirmed', text:'HLS is specified in RFC 8216 and is required for streaming to Apple devices; MPEG-DASH is an ISO standard (ISO/IEC 23009-1). Both use HTTP-delivered segments and manifests.', src:'IETF RFC 8216; ISO/IEC 23009-1'},
    {co:'Netflix — buffer-based ABR', tier:'confirmed', text:'Netflix researchers published a buffer-based rate adaptation approach (SIGCOMM 2014), evaluated on Netflix traffic, showing reduced rebuffering versus capacity-estimation approaches.', src:'Huang et al., “A Buffer-Based Approach to Rate Adaptation: Evidence from a Large Video Streaming Service”, SIGCOMM 2014'},
    {co:'Disney+ Hotstar', tier:'confirmed', text:'Hotstar reported about 25 million concurrent viewers during the 2019 Cricket World Cup semi-final, delivered with adaptive HTTP streaming through CDNs.', src:'Hotstar public statements and engineering talks (2019)'}
  ],
  mistakes:[`Long segments and big buffers for “live” (30+ s delay)`, `Misaligned keyframes, so players can’t switch renditions cleanly`, `Uncached manifests overwhelming the origin`],
  interview:[`Explain ladder → segments + manifest → CDN → player ABR, and the latency vs rebuffer trade-off`],
  tryit:{note:'Try each algorithm on the commute network above. Which rebuffers least, and which gets the best quality?', quiz:[{q:'Why cut video into segments listed in a manifest?', options:['Smaller files compress better', 'So players can switch quality at segment boundaries and CDNs can cache plain HTTP objects', 'DRM requires it', 'To reduce encoding time'], answer:1, why:'Adaptation + HTTP caching.'}], quizId:'rt-l5'},
  sources:[`RFC 8216`, `ISO/IEC 23009-1`, `Huang et al., SIGCOMM 2014`, `Spiteri et al., BOLA (INFOCOM 2016)`]
},
{
  id:'transcoding-pipeline', title:'Video upload and transcoding pipelines', minutes:10, tags:['transcoding','encoding','codec','chunking','pipeline','thumbnails'],
  summary:'Uploaded video is stored as a raw original, then a pipeline validates, splits it into chunks, transcodes chunks into every rendition in parallel, packages HLS/DASH, extracts thumbnails and pushes to the CDN, all as an idempotent, retryable workflow.',
  problem:`<p>Creators upload 2-hour 4K videos over shaky connections. You must produce 6 renditions in 2 codecs, thumbnails and captions, and publish within minutes. Transcoding one long video on one machine can take hours, and a crash 90% of the way through shouldn’t mean starting again.</p>`,
  intuition:`A wedding photographer with 5,000 photos. One person editing them all takes a week. Split the photos into batches, give them to 50 editors at once, then collect and assemble the album. If one editor falls sick, only their batch is redone.`,
  how:{
    steps:[`<b>Upload</b> directly to object storage with resumable, chunked uploads (pre-signed URLs), then emit an <code>UploadCompleted</code> event.`, `<b>Validate and probe</b> (format, duration, resolution, malware/content checks).`, `<b>Split</b> into chunks at keyframes (closed GOPs).`, `<b>Transcode in parallel</b>: each chunk × each rendition is an independent task on a worker pool (CPU, GPU or dedicated encoders), often on spot capacity.`, `<b>Assemble and package</b> into HLS/DASH segments and manifests; generate thumbnails/previews; optionally DRM.`, `<b>Publish</b>: write to the CDN origin, update metadata, notify the creator. Orchestrate with a workflow engine so every step is retried and idempotent.`],
    diagram:{title:'Upload → transcode → publish', w:820, h:250, alt:'An upload lands in object storage, an orchestrator splits it into chunks, transcode workers process chunks in parallel, results are packaged and pushed to a CDN.',
      nodes:[{id:'c', type:'client', label:'Creator', x:70, y:125}, {id:'s3', type:'db', label:'Raw originals', sub:'object storage', x:220, y:125, w:130}, {id:'wf', type:'service', label:'Workflow orchestrator', x:400, y:50, w:170}, {id:'q', type:'queue', label:'Chunk tasks', x:400, y:190, w:120}, {id:'w', type:'service', label:'Transcode workers', sub:'× hundreds', x:580, y:190, w:160}, {id:'pkg', type:'service', label:'Package + thumbnails', x:600, y:50, w:160}, {id:'cdn', type:'cdn', label:'CDN origin', x:770, y:120}],
      edges:[{from:'c', to:'s3'}, {from:'s3', to:'wf'}, {from:'wf', to:'q'}, {from:'q', to:'w'}, {from:'w', to:'pkg'}, {from:'pkg', to:'cdn'}],
      steps:[
        {note:'The creator uploads with resumable chunked upload straight to object storage (not through app servers).', flow:[['c', 's3', 'PUT parts']]},
        {note:'The workflow validates the file and splits it into ~10 s chunks at keyframes, creating a task per chunk × rendition.', flow:[['s3', 'wf', 'UploadCompleted'], ['wf', 'q', '360 × 6 tasks']]},
        {note:'Hundreds of workers transcode in parallel; a crashed worker’s task is simply retried.', flow:[['q', 'w', 'tasks'], ['w', 'pkg', 'encoded chunks']], hl:['w']},
        {note:'Chunks are stitched, packaged as HLS/DASH with manifests and thumbnails, and published to the CDN.', flow:[['pkg', 'cdn', 'segments + .m3u8']]}
      ]},
    mount:host => transcodeCalc(host),
    deep:`<p><b>Cost vs speed:</b> transcode cheap renditions first so the video is watchable quickly (publish 360p in minutes, add 4K later); encode expensive codecs (AV1) only for popular titles where bandwidth savings repay the compute.</p><p><b>Idempotency:</b> deterministic output paths (videoId/rendition/chunk) mean retries overwrite rather than duplicate; the workflow tracks which tasks are done so a restart resumes rather than repeats.</p><p><b>Live transcoding</b> is different: a continuous stream is encoded in real time into the ladder (ABR transcoder), often with redundant encoders in two zones and seamless failover.</p>`
  },
  tradeoffs:{use:[`Any user-uploaded video platform (courses, social, OTT)`], avoid:[`Uploading through app servers`, `Monolithic per-video jobs that restart from zero on failure`], alt:[`Managed services (AWS Elemental MediaConvert, Mux, Cloudflare Stream)`]},
  real:[
    {co:'YouTube', tier:'confirmed', text:'YouTube has said that more than 500 hours of video are uploaded every minute (2019 figure), all of which must be processed into multiple formats and resolutions.', src:'YouTube official statements (2019)'},
    {co:'Netflix', tier:'confirmed', text:'Netflix described a cloud encoding pipeline that splits titles into chunks encoded in parallel across many instances, and per-title encoding that tailors ladders to content complexity.', src:'Netflix Tech Blog, “High Quality Video Encoding at Scale” (2015); “Per-Title Encode Optimization” (2015)'},
    {co:'FFmpeg', tier:'confirmed', text:'The open-source FFmpeg project provides the encoders, decoders and muxers underneath many transcoding pipelines.', src:'FFmpeg documentation'}
  ],
  mistakes:[`Chunks not split on keyframes (visible glitches at boundaries)`, `No idempotency, so retries create duplicate renditions`, `Encoding every upload in every codec regardless of popularity`],
  interview:[`Describe resumable upload → event → split → parallel transcode → package → CDN, with idempotent retries and cheap renditions first`],
  tryit:{note:'Order the pipeline:', mount:host => orderGame(host, ['Resumable upload to object storage', 'Validate and probe the file', 'Split into chunks at keyframes', 'Transcode chunks × renditions in parallel', 'Package HLS/DASH segments and manifests', 'Publish to the CDN and notify the creator'])},
  sources:[`Netflix Tech Blog (2015)`, `FFmpeg docs`, `AWS Elemental MediaConvert docs`]
},
{
  id:'offline-first-sync', title:'Offline-first apps and sync', minutes:11, tags:['offline-first','sync','conflict resolution','LWW','CRDT','local-first'],
  summary:'Offline-first apps read and write a local database, queue changes, and sync with the server when connected. The hard part is merging concurrent edits: last-writer-wins, per-field merges, explicit conflicts, or CRDTs.',
  problem:`<p>A field sales agent in a village with no signal updates an order; their manager edits the same order from the office. A grocery list is edited on two phones on a flight. When devices come back online, whose change wins, and does anyone’s work silently disappear?</p>`,
  intuition:`Two people editing paper copies of the same shopping list. When they meet, they compare: different items added? Keep both. Both changed “2 kg rice” to different amounts? Someone has to decide, or you need a rule (“the later change wins”) that everyone agrees on in advance.`,
  how:{
    steps:[`The app writes to a <b>local store</b> (SQLite, IndexedDB) first, so the UI is instant and works offline.`, `Changes go into an <b>outbox</b> (operations with IDs and timestamps/versions) that syncs when online, idempotently (retries must not double-apply).`, `The server returns changes since the client’s last <b>sync cursor</b> (version or change-log offset).`, `<b>Conflicts</b> are resolved by policy: last-writer-wins (whole object or per field), server-authoritative rules, explicit user resolution, or data types that merge automatically (CRDTs).`, `Design data for merging: append-only lists of operations, per-field updates, and stable client-generated IDs (UUID/ULID) so offline creates never collide.`],
    mount:host => syncDemo(host),
    deep:`<p><b>Clocks:</b> last-writer-wins needs an ordering; device wall clocks are unreliable, so use hybrid logical clocks or server-assigned versions, and break ties deterministically (device ID).</p><p><b>CRDTs</b> (counters, sets, sequences for text) guarantee that replicas converge without coordination, at the cost of metadata and sometimes surprising merges (two people “fixing” the same typo differently both survive). Libraries: Automerge, Yjs. <b>Operational transformation</b> (Google Docs) transforms concurrent operations via a central server.</p><p><b>Not everything can merge:</b> money, inventory and seat booking need server validation. Offline actions become <i>requests</i> (“pending”) confirmed or rejected on sync, never silently applied.</p>`
  },
  tradeoffs:{use:[`Field apps, note-taking, collaborative docs, apps for users on unreliable networks`], avoid:[`Offline commits for scarce resources (money, inventory, seats) without server confirmation`, `Whole-document LWW for collaborative editing`], alt:[`Online-only with good caching and retry`, `Server-authoritative sync with optimistic UI`]},
  real:[
    {co:'Figma', tier:'confirmed', text:'Figma described its multiplayer system as server-authoritative, with conflicts resolved per property (last writer wins at the property level), inspired by CRDTs but simpler because a central server orders changes.', src:'Figma Engineering, “How Figma’s multiplayer technology works” (2019)'},
    {co:'Automerge / Yjs', tier:'confirmed', text:'Open-source CRDT libraries that let apps sync JSON-like documents and rich text between peers or via servers, converging automatically after offline edits.', src:'Automerge and Yjs documentation; Kleppmann et al., “Local-first software” (Onward! 2019)'},
    {co:'Rural field agents', tier:'educational', text:'Agents capture orders offline into a local outbox with client-generated IDs; on sync the server validates stock and pricing and marks each order confirmed or needing attention.', src:'Simplified educational design'}
  ],
  mistakes:[`Auto-increment IDs created offline (collisions)`, `Trusting device clocks for LWW`, `Silently dropping the losing side of a conflict`],
  interview:[`Local store + outbox + sync cursor; state the conflict strategy per data type; server validation for scarce resources`],
  tryit:{note:'Make both phones edit the title, then switch strategies above to see what each one loses. Then:', quiz:[{q:'Two offline phones edit different fields of the same note. Which strategy keeps both edits?', options:['Whole-document last-writer-wins', 'Per-field merge', 'Delete both', 'First-writer-wins (document)'], answer:1, why:'Different fields don’t conflict.'}], quizId:'rt-l7'},
  sources:[`Kleppmann et al., Local-first software (2019)`, `Figma Engineering (2019)`, `Shapiro et al., CRDTs (2011)`]
},
{
  id:'mobile-constraints', title:'Mobile networks, battery and infinite scroll', minutes:10, tags:['mobile','latency','RTT','battery','infinite scroll','pagination','payload'],
  summary:'Mobile users face high and variable latency, limited bandwidth, data costs and battery limits. Design APIs and pages for few round trips and small payloads, paginate feeds with cursors, prefetch carefully, and degrade gracefully.',
  problem:`<p>Your app feels instant on office Wi-Fi in Bengaluru. A user on a crowded 3G/4G connection in a smaller town waits 9 seconds for the home screen, which makes 14 sequential API calls and loads 3 MB of images. Infinite scroll keeps fetching full-resolution images they never look at, eating their data pack and battery.</p>`,
  intuition:`Ordering food over a crackly phone line. You keep the call short, say everything in one go, and don’t ask the restaurant to read the whole menu aloud. Each extra back-and-forth on a bad line costs far more than the words themselves.`,
  how:{
    steps:[`Count <b>round trips</b>: on mobile, RTT (often 50–300 ms) usually dominates. Combine calls (BFF/aggregated endpoints), avoid request waterfalls, use HTTP/2 or HTTP/3 and TLS 1.3.`, `Shrink <b>payloads</b>: compressed JSON or protobuf, only needed fields, responsive images (WebP/AVIF, right sizes), lazy-load below the fold.`, `<b>Paginate</b> feeds with cursors (stable under inserts), small pages, and prefetch the next page only when the user nears the end.`, `Respect <b>battery and data</b>: batch background work, avoid frequent wake-ups and polling (use push), and honour data-saver modes.`, `<b>Degrade gracefully</b>: cached content first, skeleton screens, retries with backoff, and offline states that explain what happened.`],
    mount:host => mobileBudget(host),
    deep:`<p><b>Radio states:</b> mobile radios take time (and energy) to wake from idle; scattered small requests keep the radio awake longer than one batched request. Batching analytics and prefetching in bursts saves battery.</p><p><b>Infinite scroll at scale:</b> virtualise long lists (render only visible rows), free memory for off-screen media, keep the cursor in the URL/state for back navigation, and cap how far prefetching runs ahead. The server side should precompute feed pages (fan-out) so each page is a cheap read.</p><p><b>Measure real users:</b> real-user monitoring (RUM) by network type, device class and region reveals the long tail; synthetic tests on fast networks hide it. Lightweight “lite” apps and PWAs are a common response for emerging markets.</p>`
  },
  tradeoffs:{use:[`Aggregated endpoints, cursor pagination, compressed responsive media, push instead of polling`], avoid:[`Chatty APIs with many sequential calls per screen`, `Offset pagination for fast-changing feeds`, `Prefetching aggressively on metered connections`], alt:[`Server-driven UI to cut client round trips`, `PWAs/lite apps for low-end devices`]},
  real:[
    {co:'Facebook “2G Tuesdays”', tier:'confirmed', text:'Facebook introduced “2G Tuesdays” (2015), letting employees experience the app on a simulated 2G connection to build empathy for users on slow networks.', src:'Facebook / Meta engineering announcements (2015)'},
    {co:'Flipkart Lite', tier:'confirmed', text:'Flipkart launched Flipkart Lite (2015), a Progressive Web App designed for fast, data-light browsing on mobile networks in India, and reported improved engagement and conversions in Google’s case study.', src:'Google Developers case study, “Flipkart Lite” (2016)'},
    {co:'Twitter Lite', tier:'confirmed', text:'Twitter Lite (2017) was a PWA built to be fast and data-efficient on slow networks and low-end devices.', src:'Twitter Engineering blog, “How we built Twitter Lite” (2017)'}
  ],
  mistakes:[`One API call per widget on the home screen`, `Full-size images in feeds`, `Polling every few seconds for updates`],
  interview:[`Count round trips and bytes for the first screen; propose a BFF endpoint, cursor pagination, image strategy and push`],
  tryit:{note:'Switch the network to 2G/poor above and get the first screen under 5 seconds. Then classify:', mount:host => sortGame(host, [
    {t:'Combine 6 home-screen calls into one BFF endpoint', c:'rtt', why:'Fewer round trips.'},
    {t:'Serve WebP thumbnails sized for the screen', c:'bytes', why:'Fewer bytes.'},
    {t:'TLS 1.3 + HTTP/3', c:'rtt', why:'Fewer handshake round trips.'},
    {t:'Return only the fields the screen needs', c:'bytes', why:'Smaller payload.'},
    {t:'Batch analytics events every 60 s', c:'battery', why:'Fewer radio wake-ups.'},
    {t:'Use push instead of polling for order status', c:'battery', why:'No periodic wake-ups.'}
  ], [{id:'rtt', label:'Fewer round trips'}, {id:'bytes', label:'Fewer bytes'}, {id:'battery', label:'Battery'}])},
  sources:[`Grigorik, High Performance Browser Networking (O’Reilly)`, `web.dev — PWA and performance guidance`, `Google Developers — Flipkart Lite case study`]
}
];

SDA.register({
  kind:'module', id:'realtime', order:13, level:'realworld', icon:'📡', title:'Real-time & Media',
  summary:'WebSockets at scale, presence, push notifications (APNs/FCM), WebRTC with STUN/TURN and SFUs, live streaming with adaptive bitrate (HLS/DASH), transcoding pipelines, offline-first sync, and mobile network constraints.',
  outcomes:['Design a WebSocket gateway tier with routing, persistence-first delivery and safe reconnects', 'Implement presence and push notifications that scale and respect users', 'Choose WebRTC topologies and explain NAT traversal', 'Explain streaming pipelines: transcoding, ladders, segments, CDNs and ABR trade-offs', 'Build offline-first sync with explicit conflict policies and mobile-friendly APIs'],
  lessons,
  quiz:[
    {q:'Why do chat systems persist a message before pushing it over WebSockets?', options:['Faster sockets', 'So it survives disconnects and can be resynced from the last seen ID', 'Encryption', 'Compliance only'], answer:1, why:'The socket is a fast path, not the source of truth.'},
    {q:'After a gateway deploy, a million clients reconnect instantly. This is…', options:['Fine', 'A reconnect storm; use jittered backoff and gradual draining', 'Impossible', 'A presence feature'], answer:1, why:'Thundering herd.'},
    {q:'A grace period in presence is used to…', options:['Save storage', 'Avoid showing users offline during brief network drops', 'Encrypt status', 'Speed up typing indicators'], answer:1, why:'Prevents flicker.'},
    {q:'Collapse keys in APNs/FCM…', options:['Compress payloads', 'Replace older undelivered notifications with the same key', 'Encrypt messages', 'Group users'], answer:1, why:'Only the latest is delivered.'},
    {q:'STUN servers…', options:['Relay all media', 'Tell a client its public IP:port as seen from outside', 'Store recordings', 'Mix audio'], answer:1, why:'TURN relays; STUN discovers.'},
    {q:'For a 10-person video call on mobile, the usual topology is…', options:['Mesh', 'SFU', 'Email', 'Single TCP connection'], answer:1, why:'Each client sends once; the SFU forwards.'},
    {q:'Adaptive bitrate players switch quality…', options:['Mid-frame', 'At segment boundaries based on throughput/buffer', 'Only at startup', 'Randomly'], answer:1, why:'Aligned segments allow switching.'},
    {q:'Why chunk a video before transcoding?', options:['Better quality', 'Parallelism across many workers and cheap retries of failed chunks', 'Smaller originals', 'DRM'], answer:1, why:'Independent tasks.'},
    {q:'Two phones edit the same field offline. Whole-document LWW will…', options:['Merge both', 'Silently drop one phone’s edits', 'Crash', 'Ask the user'], answer:1, why:'The later write replaces everything.'},
    {q:'On a slow mobile network, the biggest win for first-screen time is usually…', options:['Faster CPUs', 'Fewer sequential round trips and fewer bytes', 'More API endpoints', 'Bigger images'], answer:1, why:'RTT and bandwidth dominate.'},
    {type:'scenario', q:'Design real-time order tracking for a food-delivery app: rider location every 4 s to the customer, status changes, and notifications when the app is closed.', answer:'<ul><li><b>Ingest</b>: rider app sends location every 4 s (batched if poor network) to a location service → stream (Kafka) keyed by order; latest position in Redis with TTL.</li><li><b>Fan-out</b>: customer app holds a WebSocket/SSE to a gateway while the tracking screen is open; the routing layer pushes updates for that order only; throttle to every 2–4 s and smooth on the client.</li><li><b>Status</b>: order events persisted first; pushed over the socket and via APNs/FCM with a collapse key per order and short TTL when the app is backgrounded.</li><li><b>Resilience</b>: on reconnect, fetch the latest state; jittered reconnects; degrade to polling every 15 s if sockets fail.</li><li><b>Privacy</b>: share rider location only during active delivery; mask phone numbers.</li></ul>'},
    {type:'scenario', q:'A cricket final will have 20 million concurrent viewers on mobile. Outline the streaming architecture.', answer:'<ol><li><b>Contribution</b>: redundant feeds from the venue to two encoding sites/zones.</li><li><b>Live transcoding</b> into a ladder (e.g. 6 renditions from 240p to 1080p) with aligned keyframes; package HLS/DASH with 2–4 s segments (LL-HLS if low latency matters).</li><li><b>Distribution</b>: multi-CDN with pre-provisioned capacity; origin shield + request collapsing so the origin sees one request per segment per edge; short-TTL manifests.</li><li><b>Players</b>: ABR tuned for mobile (start low, buffer-aware), audio-only fallback for very poor networks.</li><li><b>Scale ops</b>: pre-scale origins, auth/entitlement and APIs (login spikes at toss), protect with rate limits and waiting rooms; real-time QoE dashboards (rebuffer ratio, start time, bitrate) per CDN/ISP/region with the ability to shift traffic between CDNs.</li></ol>'}
  ],
  cheatsheet:[
    {h:'🔌 WebSockets', items:['Gateway tier holds sockets; services stay stateless', 'Routing layer: user → gateway (pub/sub, directory)', 'Persist first; resume from last message ID', 'Least-connections LB; drain on deploy', 'Jittered reconnects avoid storms']},
    {h:'🟢 Presence & push', items:['Heartbeat + TTL + grace period', 'Fan out only to active viewers', 'Typing = ephemeral, best effort', 'APNs/FCM: tokens, 4 KB, TTL, priority, collapse key', 'Prune invalid tokens; push is a hint, sync on open']},
    {h:'🎥 WebRTC', items:['Signalling is yours (WebSocket)', 'ICE: host / STUN (srflx) / TURN (relay) candidates', 'Mesh ≤ 4; SFU for groups; MCU when clients are weak', 'Simulcast/SVC per-receiver quality', 'Broadcast to millions → HLS/DASH']},
    {h:'📺 Streaming', items:['Ladder → segments + manifest → CDN', 'ABR: throughput vs buffer-based', 'Live latency ≈ segment × buffered segments', 'Origin shield + request collapsing', 'Per-title encoding saves bandwidth']},
    {h:'🛠 Pipelines', items:['Resumable upload to object storage', 'Split at keyframes → parallel tasks', 'Idempotent outputs; workflow retries', 'Cheap renditions first, expensive codecs for popular titles']},
    {h:'📱 Offline & mobile', items:['Local store + outbox + sync cursor', 'Client-generated IDs (UUID/ULID)', 'Conflicts: LWW, per-field, user choice, CRDT', 'Scarce resources need server confirmation', 'Count round trips and bytes; cursor pagination']}
  ],
  glossary:[
    {term:'WebSocket gateway', aka:['connection gateway'], def:'A server tier that terminates and holds long-lived client connections.'},
    {term:'Reconnect storm', def:'A surge of simultaneous reconnections after many connections drop at once.'},
    {term:'Presence', def:'Information about whether users are online, idle, typing or last seen.'},
    {term:'Grace period', def:'A delay before acting on a state change, to avoid reacting to brief blips.'},
    {term:'Push notification', aka:['push notifications'], def:'A message delivered to a device through the platform’s push service, even when the app is closed.'},
    {term:'APNs', aka:['Apple Push Notification service'], def:'Apple’s service for delivering notifications to Apple devices.'},
    {term:'FCM', aka:['Firebase Cloud Messaging'], def:'Google’s cross-platform messaging service for notifications to Android, iOS and web.'},
    {term:'Device token', aka:['registration token', 'push token'], def:'An identifier issued by APNs/FCM for sending notifications to one app install.'},
    {term:'Collapse key', aka:['collapse ID'], def:'A key that lets newer notifications replace older undelivered ones.'},
    {term:'WebRTC', def:'Browser and native APIs plus protocols for real-time peer-to-peer audio, video and data.'},
    {term:'Signaling', aka:['signalling'], def:'Exchanging session descriptions and network candidates to set up a WebRTC call.'},
    {term:'SDP', aka:['session description protocol'], def:'A format describing media sessions: codecs, formats and transport details.'},
    {term:'ICE', aka:['interactive connectivity establishment', 'ICE candidates'], def:'A protocol for finding the best working network path between peers.'},
    {term:'STUN', def:'A protocol that lets a client discover its public address as seen from outside its NAT.'},
    {term:'TURN', aka:['TURN relay'], def:'A relay server that forwards media when direct peer-to-peer connection is impossible.'},
    {term:'SFU', aka:['selective forwarding unit'], def:'A media server that forwards streams between participants without decoding them.'},
    {term:'MCU', aka:['multipoint control unit'], def:'A media server that decodes and mixes streams into one composite stream per participant.'},
    {term:'Simulcast', aka:['SVC'], def:'Sending several quality layers of one video so a server can forward the right layer to each receiver.'},
    {term:'HLS', aka:['HTTP Live Streaming', 'LL-HLS'], def:'Apple’s HTTP-based adaptive streaming protocol using playlists and segments.'},
    {term:'MPEG-DASH', aka:['DASH'], def:'An international standard for adaptive bitrate streaming over HTTP.'},
    {term:'Adaptive bitrate', aka:['ABR', 'adaptive bitrate streaming'], def:'Switching video quality during playback based on network and buffer conditions.'},
    {term:'Bitrate ladder', aka:['encoding ladder', 'rendition'], def:'The set of resolutions and bitrates a video is encoded into.'},
    {term:'Manifest', aka:['playlist', 'm3u8', 'MPD'], def:'A file listing available renditions and segment URLs for a stream.'},
    {term:'Video segment', aka:['HLS segment', 'media segment'], def:'A short, independently fetchable piece of a stream, typically 2–6 seconds.'},
    {term:'Rebuffering', aka:['rebuffer', 'rebuffers'], def:'Playback pausing because the player’s buffer ran empty.'},
    {term:'Transcoding', aka:['transcode', 'transcoder'], def:'Converting video into different codecs, resolutions and bitrates.'},
    {term:'Codec', aka:['H.264', 'HEVC', 'AV1'], def:'An algorithm for compressing and decompressing audio or video.'},
    {term:'Keyframe', aka:['I-frame', 'GOP'], def:'A self-contained video frame where decoding (and switching or splitting) can start.'},
    {term:'Per-title encoding', def:'Choosing an encoding ladder tailored to each video’s complexity.'},
    {term:'Offline-first', aka:['local-first'], def:'Designing apps to work on local data first and sync with servers when connected.'},
    {term:'Outbox (client)', aka:['sync queue'], def:'A local queue of changes waiting to be sent to the server.'},
    {term:'Sync cursor', def:'A marker of the last change a client has received, used to fetch only newer changes.'},
    {term:'Last-writer-wins', aka:['LWW'], def:'A conflict rule where the most recent write (by some ordering) replaces others.'},
    {term:'Operational transformation', aka:['OT'], def:'A technique for collaborative editing that transforms concurrent operations so they apply consistently.'},
    {term:'Infinite scroll', def:'Loading more content automatically as the user nears the end of a list.'},
    {term:'Progressive Web App', aka:['PWA'], def:'A web app using modern APIs (service workers, manifests) to behave like an installable, offline-capable app.'},
    {term:'Real-user monitoring', aka:['RUM'], def:'Measuring performance from real users’ devices and networks.'}
  ],
  sources:['RFC 6455 (WebSocket); WhatsApp (2012), Discord (2017–2018), Slack (2023), LinkedIn presence (2018) engineering blogs', 'Apple APNs and Firebase Cloud Messaging documentation', 'W3C WebRTC 1.0; IETF RFCs 8445 (ICE), 8489 (STUN), 8656 (TURN)', 'RFC 8216 (HLS); ISO/IEC 23009-1 (DASH); Huang et al., SIGCOMM 2014; Spiteri et al., BOLA (2016)', 'Netflix Tech Blog — encoding at scale, per-title encoding (2015); FFmpeg docs', 'Kleppmann et al., Local-first software (2019); Figma multiplayer (2019); Automerge/Yjs docs', 'Grigorik, High Performance Browser Networking; Google Flipkart Lite case study; Twitter Lite (2017)']
});
} catch(e){ console.error('[SDA] module realtime', e); SDA.errors.push({id:'realtime', error:e}); }
})();
