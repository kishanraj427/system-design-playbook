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
    ui.slider({label:'Concurrent connected students', min:1e4, max:5e7, step:1e4, value:P.users, fmt:v => fmtNum(v), onInput:v => { P.users = v; run(); }}).el,
    ui.slider({label:'Connections per gateway server', min:1e4, max:2e6, step:1e4, value:P.perServer, fmt:v => fmtNum(v), onInput:v => { P.perServer = v; run(); }}).el,
    ui.slider({label:'Memory per connection', min:4, max:200, value:P.kb, fmt:v => v + ' KB', onInput:v => { P.kb = v; run(); }}).el,
    ui.slider({label:'Messages sent per student per minute', min:.1, max:30, step:.1, value:P.msgs, fmt:v => String(v), onInput:v => { P.msgs = v; run(); }}).el,
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
    strip.append(row('Phone network', 'conn', 'var(--ok)', 'var(--bad)'), row('Server sees', 'serverOnline', 'var(--ok)', 'var(--surface-3)'), row('Classmates see', 'shown', 'var(--ok)', 'var(--surface-3)'), el('div', {class:'lab-hint'}, `0 s ………… 120 s · network drops at ${dropAt} s for ${P.drop} s`));
    const evs = P.users * P.changes / 3600 * P.friends * .3;
    out.innerHTML = '';
    out.append(el('div', {class:'verdict ' + (flips > 0 ? 'warn' : 'ok')}, flips > 0 ? `Classmates saw ${flips / 2 | 0 || 1} offline flicker(s). Raise the timeout or grace period, or accept that a long drop really is “offline”.` : `No visible flicker: the ${P.drop} s drop was hidden by the ${P.timeout} s timeout + ${P.grace} s grace period. The cost is that a genuinely closed app also looks online for up to ${P.timeout + P.grace} s.`));
    out.append(frag(h.math(`Presence fan-out ≈ ${fmtNum(P.users)} online × ${P.changes} status changes/h ÷ 3600 × ${P.friends} classmates × 30% of them online
               ≈ ${fmtNum(evs)} presence deliveries/s  (often more than chat messages!)`)));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Heartbeat interval', min:2, max:60, value:P.hb, fmt:v => v + ' s', onInput:v => { P.hb = v; run(); }}).el,
    ui.slider({label:'Server timeout (missed heartbeats)', min:5, max:90, value:P.timeout, fmt:v => v + ' s', onInput:v => { P.timeout = v; run(); }}).el,
    ui.slider({label:'Network drop length (tunnel, lift)', min:1, max:80, value:P.drop, fmt:v => v + ' s', onInput:v => { P.drop = v; run(); }}).el,
    ui.slider({label:'Grace period before showing offline', min:0, max:60, value:P.grace, fmt:v => v + ' s', onInput:v => { P.grace = v; run(); }}).el,
    ui.slider({label:'Classmates per student', min:10, max:5000, step:10, value:P.friends, fmt:v => fmtNum(v), onInput:v => { P.friends = v; run(); }}).el), strip, out);
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
    ui.select({label:'Network', value:P.net, options:[['commute', '4G on a commute (tunnels drop to ~300 kbps)'], ['stadium', 'Crowded lecture hall (0.5–2 Mbps)'], ['wifi', 'Home Wi-Fi (~9 Mbps)']], onChange:v => { P.net = v; run(); }}).el,
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
  const base = {title:'Physics notes', body:'Newton’s laws', done:false};
  const P = {strategy:'field', aTitle:'Physics notes: motion', bBody:'Newton’s laws, friction', bTitle:'', bLast:true};
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
  summary:'A WebSocket stays open, so servers must remember each connection. Scale it with a gateway tier, a routing layer that finds the right gateway, and careful handling of deploys and reconnect storms.',
  problem:`<h3>A small example</h3><p>The classroom app has 5 million students in live classes at once. Each holds an open WebSocket to some server.</p><ul><li>Asha sends a question to a study group of 8 people.</li><li>The server holding Asha’s connection must find the servers holding her classmates’ connections.</li><li>A deploy drops all 5 million connections at the same moment.</li></ul><p>How does the message find everyone, and what happens after the drop?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one chat message from Asha to Ravi.</p>',
    steps:[
      {icon:'🚪', title:'Hold connections at a gateway', text:'A gateway server keeps each student’s open WebSocket. It checks the login when the student connects and holds nothing else.'},
      {icon:'📒', title:'Remember who is where', text:'When Asha connects, her gateway records “Asha is on gateway 1” in a shared directory.'},
      {icon:'💾', title:'Save the message first', text:'The chat service saves Asha’s message in the database before it sends it anywhere. The socket is only the fast path.'},
      {icon:'📬', title:'Route to the right gateway', text:'A routing layer sees that Ravi is on gateway 2 and pushes the message down his socket.'},
      {icon:'🔁', title:'Recover after a drop', text:'If a gateway restarts, students reconnect after a random short wait. Each asks for the messages after the last one it saw.'}
    ],
    diagram:{title:'Gateways and a routing layer', w:820, h:270, alt:'Students connect to WebSocket gateways. The chat service saves messages and publishes to a routing layer, which pushes them to the gateways of the recipients.',
      nodes:[{id:'a', type:'client', label:'Asha', x:70, y:70}, {id:'b', type:'client', label:'Ravi', x:70, y:200}, {id:'lb', type:'lb', label:'L4 load balancer', x:210, y:135, w:130}, {id:'g1', type:'service', label:'Gateway 1', sub:'Asha’s socket', x:380, y:70, w:130}, {id:'g2', type:'service', label:'Gateway 2', sub:'Ravi’s socket', x:380, y:200, w:130}, {id:'chat', type:'service', label:'Chat service', x:580, y:70, w:120}, {id:'db', type:'db', label:'Message store', x:740, y:70, w:120}, {id:'ps', type:'queue', label:'Routing layer', sub:'user to gateway', x:620, y:200, w:160}],
      edges:[{from:'a', to:'lb'}, {from:'b', to:'lb'}, {from:'lb', to:'g1'}, {from:'lb', to:'g2'}, {from:'g1', to:'chat'}, {from:'chat', to:'db'}, {from:'chat', to:'ps'}, {from:'ps', to:'g2'}],
      steps:[
        {note:'Both students hold long-lived WebSockets on different gateways. Each gateway registers its students in the routing layer.', flow:[['a', 'lb'], ['lb', 'g1', 'WS'], ['b', 'lb'], ['lb', 'g2', 'WS']]},
        {note:'Asha sends “hi”. The chat service <b>saves it first</b>, so it survives any socket failure.', flow:[['a', 'g1', '“hi”'], ['g1', 'chat'], ['chat', 'db', 'store msg #812']]},
        {note:'Chat publishes to the routing layer, which knows Ravi is on Gateway 2 and pushes the message down Ravi’s socket.', flow:[['chat', 'ps', 'to: Ravi'], ['ps', 'g2'], ['g2', 'b', '“hi”']]},
        {note:'Gateway 2 is redeployed. It drains, and Ravi reconnects after a random wait to another gateway and asks for messages after #812. Nothing is lost.', status:{g2:'down'}, flow:[['b', 'lb', 'reconnect, since=#812']]}
      ]},
    mount:host => wsCapacity(host),
    html:`<h3>Everyday comparison</h3><p>Think of a telephone exchange.</p><div class="simple-table">${h.table(['Telephone exchange', 'WebSocket gateways'], [['Each phone is wired to one exchange', 'Each student’s socket sits on one gateway.'], ['A directory says which exchange holds each number', 'The routing layer knows which gateway holds each student.'], ['When an exchange reboots, all its phones redial together', 'When a gateway restarts, its students reconnect together.']])}</div><div class="callout tip"><b>Important point</b><p>Connections are cheap to hold but costly to move. Save the message first, and treat the socket as the fast path.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Problem', 'Answer'], [['Reaching a classmate on another gateway', 'A routing layer that knows who is where.'], ['A gateway restarts', 'Reconnect with a random wait and ask for missed messages.'], ['A slow phone falls behind', 'Cap its queue and keep only the latest typing signal.']])}</div>`,
    deep:`<h4>The numbers</h4><p>After a deploy, 5,000,000 students reconnect. Say each gateway accepts 2,000 new connections a second, and there are 75 gateways. Together they accept 75 × 2,000 = 150,000 a second. If everyone returns at once, the queue takes 5,000,000 ÷ 150,000 ≈ 33 seconds to clear, and many give up and retry.</p><p>Now add a random wait of 0 to 60 seconds. The arrival rate is 5,000,000 ÷ 60 ≈ 83,000 a second, which fits. The login service also sees about 83,000 checks a second, so size it for that.</p><h4>When it goes wrong</h4><p>Deploy in slices. Restarting 5% of gateways at a time drops 5,000,000 × 0.05 = 250,000 connections per slice. Tell those clients to leave first, so they reconnect on purpose.</p><p>Idle connections can be closed by a load balancer or home router after about a minute of silence. Send a small ping every 30 seconds.</p><h4>How it works inside</h4><p>Each connection uses one file descriptor, a numbered handle the system gives each open socket. The default limit is often 1,024 per process, so raise it. A directory entry saying "Asha is on gateway 1" needs an expiry, because a crashed gateway cannot remove it.</p>`
  },
  tradeoffs:{use:[`Use WebSockets for the live class chat, live polls and shared whiteboards.`], avoid:[`Do not use a WebSocket for rare updates. A push notification or polling is cheaper.`, `Do not keep class state only inside gateways.`], alt:[`Server-Sent Events for one-way updates.`, `Long polling as a fallback.`, `A managed real-time service.`]},
  real:[
    {co:'WhatsApp', tier:'confirmed', text:'WhatsApp’s engineers wrote in 2012 that a single FreeBSD server running its Erlang stack had held over 2 million connections at once.', src:'WhatsApp blog, 1 million is so 2011 (2012)'},
    {co:'Slack', tier:'confirmed', text:'Slack described gateway servers that hold client WebSockets, and channel servers that fan messages out to the gateways of subscribed users.', src:'Slack Engineering, Real-time Messaging (2023)'}
  ],
  mistakes:[`Relying on the socket for delivery without saving messages.`, `Letting every client reconnect at once after a deploy.`, `Balancing long-lived connections with round robin.`],
  interview:[`Describe a gateway tier, a routing layer from user to gateway, save-first delivery, resume from the last message ID and reconnects with a random wait.`],
  tryit:{note:'Size the gateway fleet above for 50 million students. Then check yourself.', quiz:[{q:'Student B is connected to gateway 7. How does a message from student A, on gateway 2, reach B?', options:['Gateway 2 opens a socket to B', 'Through a routing layer that knows B is on gateway 7', 'B asks gateway 2 for it', 'DNS delivers it'], answer:1, why:'Gateways are linked through a routing layer.'}, {q:'Why save a message before sending it down the socket?', options:['Sockets are encrypted', 'A socket can drop at any time, and the saved copy can be fetched later', 'It makes the socket faster', 'Messages must be sorted first'], answer:1, why:'The socket is only the fast path. The database is the source of truth.'}], quizId:'rt-l1'},
  sources:[`WhatsApp blog (2012)`, `Slack Engineering (2023)`, `RFC 6455 (WebSocket)`]
},
{
  id:'presence', title:'Presence: online, typing and last seen', minutes:9, tags:['presence','heartbeat','last seen','typing indicator','fan-out'],
  summary:'Presence is tracked with heartbeats and timeouts, and smoothed with a grace period so short drops do not flicker. It is costly mostly because one status change can reach many classmates, so send it only to those who are looking.',
  problem:`<h3>A small example</h3><p>The classroom app shows a green dot next to students who are in class. It also shows “teacher is typing” and “last seen”.</p><ul><li>Phones lose signal in lifts and tunnels.</li><li>Apps get closed in the background.</li><li>Each status change must reach many classmates.</li></ul><p>With 20 million students online, presence updates can outnumber chat messages. How can the app show it without flicker or waste?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow Asha’s green dot through a short signal drop.</p>',
    steps:[
      {icon:'💓', title:'Send heartbeats', text:'Each phone sends a small “I am here” signal every few seconds over its connection.'},
      {icon:'⏱️', title:'Use a timeout', text:'The presence service saves the last signal with an expiry time. If signals stop for longer than the timeout, the student counts as offline.'},
      {icon:'🛟', title:'Add a grace period', text:'Wait a few more seconds before telling others. A 25-second lift ride then causes no flicker.'},
      {icon:'🎯', title:'Notify only viewers', text:'Send a change only to classmates who are online and looking at that class. Others read the status when they open the screen.'},
      {icon:'⌨️', title:'Treat typing differently', text:'Typing signals are short and never saved. Send them only to the people in that chat.'}
    ],
    mount:host => presenceDemo(host),
    html:`<h3>Everyday comparison</h3><p>Think of an office in and out board.</p><div class="simple-table">${h.table(['Office board', 'Presence'], [['Tap your badge every few minutes', 'A heartbeat.'], ['No tap for a while means “out”', 'A timeout.'], ['Glance at the board when you need to', 'Look up status when a screen opens.']])}</div><div class="callout tip"><b>Important point</b><p>Presence is cheap to store and costly to send. The cost is in telling many people.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Situation', 'Choice'], [['A short network drop', 'A grace period hides it.'], ['A very large class', 'Show a count, not every dot.'], ['A classmate who is not looking', 'Skip the push and let them read it later.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say 20 million students send a heartbeat every 5 seconds. That is 20,000,000 ÷ 5 = 4,000,000 heartbeats a second. Slow it to every 30 seconds and it is 20,000,000 ÷ 30 ≈ 667,000 a second, six times fewer. Each beat only refreshes an expiry time, so it is cheap if it stays inside the presence store and sends nothing to classmates.</p><p>Say the timeout is 3 missed beats, so 90 seconds. Add a 10 second grace. A student who really leaves shows offline after about 100 seconds. That delay is the price of fewer false flickers.</p><h4>When it goes wrong</h4><p>A gateway can crash with no warning, and its sockets close with no goodbye. Only the timeout can find those students. If a gateway held 100,000 students, they all expire together. The grace period and their quick reconnects stop 100,000 offline notices.</p><p>Typing is different. Send a typing signal every 3 seconds while keys are pressed. The other screen hides it after 5 seconds of silence.</p>`
  },
  tradeoffs:{use:[`Use a heartbeat, a timeout and a grace period, and send presence only to people who are looking.`], avoid:[`Do not write presence to the main database on every heartbeat.`, `Do not push every change to every classmate.`], alt:[`Show coarse presence such as “active today” for very large classes.`, `Look up presence only when a screen opens.`]},
  real:[
    {co:'LinkedIn', tier:'confirmed', text:'LinkedIn described a presence system that uses heartbeats and waits before marking a member offline, to avoid flapping on unstable mobile connections.', src:'LinkedIn Engineering, Now You See Me, Now You Don’t (2018)'},
    {co:'Discord', tier:'confirmed', text:'Discord’s engineers describe presence updates in very large servers as a major fan-out cost, handled with selective updates.', src:'Discord Engineering blog (2017 to 2019)'}
  ],
  mistakes:[`Setting timeouts so short that students flicker online and offline.`, `Writing to the database on every heartbeat.`, `Ignoring privacy settings when sending presence.`],
  interview:[`Say: heartbeat, timeout and grace period, store with an expiry in a fast store, send only to active viewers, and estimate the fan-out cost.`],
  tryit:{note:'Adjust the heartbeat, timeout and grace period above so a 25-second tunnel drop does not show Asha offline. Then check yourself.', quiz:[{q:'Why are presence updates often more expensive than chat messages?', options:['They are bigger', 'They need encryption', 'They are stored forever', 'Each change goes to many classmates, and changes are frequent'], answer:3, why:'Fan-out multiplied by how often status changes.'}, {q:'What does a grace period do?', options:['It hides short drops, so a student does not flicker offline', 'It speeds up heartbeats', 'It stores last seen forever', 'It encrypts the dot'], answer:0, why:'The app waits a few seconds before it tells others a student is offline.'}], quizId:'rt-l2'},
  sources:[`LinkedIn Engineering (2018)`, `Discord Engineering`]
},
{
  id:'push-notifications', title:'Push notifications (APNs and FCM)', minutes:9, tags:['push notification','APNs','FCM','device token','collapse key','TTL'],
  summary:'Phones suspend apps in the background, so servers send notifications through Apple’s APNs and Google’s FCM. They use device tokens, expiry times, priorities and collapse keys.',
  problem:`<h3>A small example</h3><p>The app must tell a student “Your class starts in 10 minutes” while the app is closed.</p><ul><li>Phones suspend background apps, so the WebSocket is gone.</li><li>30 million devices are installed, and some tokens silently expire.</li><li>The marketing team wants to send 10 notifications a day.</li></ul><p>How can the app reach a closed phone without annoying students?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one “class starts soon” notice to a phone.</p>',
    steps:[
      {icon:'📲', title:'Get a device token', text:'When a student installs the app, the phone asks Apple or Google for a device token. The app sends the token to your server.'},
      {icon:'🧠', title:'Decide what to send', text:'A notification service checks preferences, quiet hours and rate limits. It skips duplicates.'},
      {icon:'📤', title:'Send through the platform', text:'A worker sends the notice to APNs for iPhones or FCM for Android. It adds a priority, an expiry time and a collapse key.'},
      {icon:'🔔', title:'The phone shows it', text:'The platform delivers when the phone is reachable. The phone shows the notice even if the app is closed.'},
      {icon:'🧹', title:'Remove dead tokens', text:'If the platform says a token is no longer valid, delete it. That avoids wasted sends.'}
    ],
    diagram:{title:'Sending a push notification', w:800, h:230, alt:'The class service emits an event, the notification service applies preferences and queues it, workers send to APNs and FCM, which deliver to phones.',
      nodes:[{id:'ord', type:'service', label:'Class service', x:80, y:115, w:120}, {id:'ns', type:'service', label:'Notification service', sub:'prefs · dedupe · rate limit', x:270, y:115, w:170}, {id:'q', type:'queue', label:'Send queue', x:460, y:115}, {id:'apns', type:'ext', label:'APNs', x:630, y:50}, {id:'fcm', type:'ext', label:'FCM', x:630, y:180}, {id:'ph', type:'client', label:'Phones', x:760, y:115}],
      edges:[{from:'ord', to:'ns'}, {from:'ns', to:'q'}, {from:'q', to:'apns'}, {from:'q', to:'fcm'}, {from:'apns', to:'ph'}, {from:'fcm', to:'ph'}],
      steps:[
        {note:'The class service emits <code>ClassStartingSoon</code>.', flow:[['ord', 'ns', 'event']]},
        {note:'The notification service checks preferences and quiet hours, looks up the student’s device tokens, and queues one job per device with collapse key <code>class-88-status</code>.', flow:[['ns', 'q', '2 jobs']], hl:['ns']},
        {note:'Workers send to APNs (iPhone) and FCM (Android) with an expiry of 10 minutes and high priority.', flow:[['q', 'apns'], ['q', 'fcm']], parallel:true},
        {note:'The platforms deliver. One token comes back <b>unregistered</b> because the app was uninstalled, so it is deleted from your table.', flow:[['apns', 'ph', '🔔'], ['fcm', 'ph', '🔔']], parallel:true}
      ]},
    html:`<h3>Everyday comparison</h3><p>Think of the postal service compared with a personal messenger.</p><div class="simple-table">${h.table(['Everyday item', 'Push'], [['Letters handed to the postal service', 'Notices handed to APNs or FCM.'], ['The house address', 'The device token.'], ['Junk mail gets ignored or blocked', 'Too many notices get turned off.']])}</div><div class="callout tip"><b>Important point</b><p>A push tells the phone that something happened. Fetch the real data when the app opens.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Situation', 'Setting'], [['A code that is useless after 10 minutes', 'A short expiry time (TTL).'], ['Six status updates while the phone was offline', 'The same collapse key, so only the latest shows.'], ['A class reminder compared with marketing', 'High priority for the reminder, normal for marketing.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say 30 million devices get 10 marketing notices a day. That is 300,000,000 sends a day. Across 86,400 seconds, it averages about 3,470 a second.</p><p>Say 3% of saved tokens are dead. A broadcast then wastes 30,000,000 × 0.03 = 900,000 sends on devices that cannot receive it. Cleaning tokens is real savings.</p><p>Now the reply spike. Say a "class starts" push goes out at 9:00, and 20% of students open the app within a minute. That is 30,000,000 × 0.2 = 6,000,000 opens. Over 60 seconds, it is 100,000 requests a second to your servers.</p><h4>When it goes wrong</h4><p>Push is best effort. If a notice has a 10-minute TTL and the phone is off for an hour, the notice is dropped. The app must fetch what it missed when it opens.</p><p>To soften the spike, spread sends over a few minutes and serve the class list from a cache. Both APNs and FCM limit a payload to about 4 KB.</p>`
  },
  tradeoffs:{use:[`Use push to reach students when the app is in the background or closed.`, `Use quiet silent messages to wake the app to sync, within OS limits.`], avoid:[`Do not treat push as the source of truth for data.`, `Do not send high-priority marketing. Students will turn notifications off.`], alt:[`SMS or WhatsApp messages for critical alerts, at a cost.`, `An in-app inbox that syncs when the app opens.`, `Email for non-urgent updates.`]},
  real:[
    {co:'Apple APNs', tier:'confirmed', text:'APNs uses an HTTP/2 API with token-based or certificate-based login, a 4 KB payload limit for regular notifications, and headers for priority, expiry and collapse ID.', src:'Apple Developer documentation, Sending notification requests to APNs'},
    {co:'Firebase Cloud Messaging', tier:'confirmed', text:'FCM supports notification and data messages up to 4 KB, collapse keys, TTL and normal or high priority. It reports unregistered tokens so you can remove them.', src:'Firebase Cloud Messaging documentation'}
  ],
  mistakes:[`Never removing dead tokens, which wastes sends.`, `Setting no TTL, so stale reminders arrive hours late.`, `Sending one notification per event without dedupe or rate limits.`],
  interview:[`Describe token registration, a notification service with preferences, dedupe and rate limits, a send queue, APNs and FCM, collapse keys, TTL and token cleanup.`],
  tryit:{quiz:[{q:'A phone was offline for 2 hours, and 6 “class status” notices were sent with the same collapse key. What does it receive when it reconnects?', options:['All 6', 'Only the latest', 'None', 'The first'], answer:1, why:'A collapse key replaces pending notices that have the same key.'}, {q:'Why can’t the app just use a WebSocket to notify a closed app?', options:['WebSockets are insecure', 'The phone suspends background apps and closes their connections to save battery', 'It is too expensive', 'WebSockets only send one way'], answer:1, why:'Platform push services keep one efficient connection for the whole phone.'}], quizId:'rt-l3'},
  sources:[`Apple APNs documentation`, `Firebase Cloud Messaging documentation`]
},
{
  id:'webrtc', title:'WebRTC: peer-to-peer media, STUN, TURN and SFUs', minutes:11, tags:['WebRTC','STUN','TURN','ICE','SFU','MCU','simulcast'],
  summary:'WebRTC sends audio and video directly between phones with very low delay. Signalling sets up the call, STUN and TURN get past NATs, and for groups an SFU forwards streams so each phone uploads only one.',
  problem:`<h3>A small example</h3><p>A tutor and a student, both on mobile networks, want a video call with under 300 ms of delay.</p><ul><li>Neither phone has a public IP address.</li><li>A study group of 8 would need every phone to upload 7 video streams.</li><li>The call must work on strict networks too.</li></ul><p>How do the phones connect, and how does the app handle groups?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the tutor’s call as it connects to the student.</p>',
    steps:[
      {icon:'📝', title:'Exchange notes', text:'The two phones swap call details, called SDP, through a signalling server, often over a WebSocket. WebRTC does not define signalling, so your app must provide it.'},
      {icon:'🔎', title:'Find public addresses', text:'Each phone asks a STUN server how its address looks from outside. A NAT hides many phones behind one public address, so this step is needed.'},
      {icon:'🧭', title:'Try paths', text:'The phones try several routes and pick the best one that works. This method is called ICE.'},
      {icon:'🎥', title:'Send media directly', text:'Most calls connect directly. Audio and video flow encrypted over UDP, and the codec adapts to the network.'},
      {icon:'🔁', title:'Use a relay if blocked', text:'If a strict firewall blocks a direct path, a TURN server relays the media. It always works but costs bandwidth.'}
    ],
    diagram:{title:'Connecting a WebRTC call', w:800, h:260, alt:'Two phones exchange offers through a signalling server, discover public addresses through STUN, and connect directly or through TURN if blocked.',
      nodes:[{id:'a', type:'client', label:'Tutor', sub:'behind NAT', x:90, y:135}, {id:'sig', type:'service', label:'Signalling server', sub:'WebSocket', x:400, y:45, w:160}, {id:'stun', type:'ext', label:'STUN', sub:'“your public IP:port”', x:400, y:135, w:170}, {id:'turn', type:'ext', label:'TURN relay', sub:'fallback', x:400, y:225, w:130}, {id:'b', type:'client', label:'Student', sub:'behind NAT', x:710, y:135}],
      edges:[{from:'a', to:'sig'}, {from:'sig', to:'b'}, {from:'a', to:'stun'}, {from:'b', to:'stun'}, {from:'a', to:'turn', dashed:true}, {from:'turn', to:'b', dashed:true}, {from:'a', to:'b', dashed:true}],
      steps:[
        {note:'The tutor sends an SDP <b>offer</b> through the signalling server, and the student replies with an <b>answer</b>.', flow:[['a', 'sig', 'offer'], ['sig', 'b'], ['b', 'sig', 'answer'], ['sig', 'a']]},
        {note:'Both ask STUN for their public address and port, and swap these <b>ICE candidates</b> through signalling.', flow:[['a', 'stun', '?'], ['b', 'stun', '?']], parallel:true},
        {note:'ICE tries direct paths. Most calls connect <b>peer to peer</b> through the NATs, so media never touches your servers.', flow:[['a', 'b', 'SRTP media']]},
        {note:'If a strict NAT or firewall blocks the path, media goes through a <b>TURN relay</b>. It always works and costs you bandwidth.', flow:[['a', 'turn', 'media'], ['turn', 'b']]}
      ]},
    mount:host => rtcCalc(host),
    html:`<h3>Everyday comparison</h3><p>Think of two people in different buildings who want to talk through their windows.</p><div class="simple-table">${h.table(['Windows in two buildings', 'WebRTC'], [['Pass notes through the building managers', 'A signalling server.'], ['A helper on the street tells each person how their window looks', 'STUN.'], ['A courier carries everything when the windows cannot face each other', 'A TURN relay.'], ['A host in the middle passes each person’s voice along', 'An SFU.']])}</div><div class="callout tip"><b>Important point</b><p>Signalling sets the call up. The audio and video flow on a different path.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Class size', 'Choice'], [['2 to 4 people', 'A mesh call, with no media server'], ['5 to 50 people', 'An SFU that forwards streams'], ['Thousands of viewers', 'Streaming with HLS, which you will learn in the next lesson']])}</div>`,
    deep:`<h4>The numbers</h4><p>Take the study group of 8, with 1.5 Mbps video. With an SFU, each phone uploads 1 stream. The server receives 8 × 1.5 = 12 Mbps. It then sends each stream to the other 7 people, which is 8 × 7 = 56 streams, or 56 × 1.5 = 84 Mbps going out. Server cost is dominated by outgoing bandwidth.</p><p>Now TURN. A relayed call carries 1.5 Mbps each way, so 3 Mbps through your server. That is 3 ÷ 8 = 0.375 MB a second, or 0.375 × 3,600 = 1,350 MB an hour. If 1,000 calls are relayed for an hour, that is about 1.35 TB.</p><h4>When it goes wrong</h4><p>Some NATs give a different public address for each destination. STUN then reports an address that only works for the STUN server, so a direct path fails. TURN is the answer here.</p><p>When a phone moves from Wi-Fi to 4G, its address changes. WebRTC can restart ICE, find a new path, and keep the call going.</p>`
  },
  tradeoffs:{use:[`Use WebRTC for one-to-one tutoring, small study groups and voice chat, where the delay must be under a second.`], avoid:[`Do not use WebRTC to broadcast a lecture to 100,000 students. Use HLS and a CDN.`, `Do not use a mesh beyond about 4 people.`], alt:[`HLS or low-latency HLS for large audiences.`, `A managed SFU service such as LiveKit, Twilio, Agora or Daily.`]},
  real:[
    {co:'IETF and W3C', tier:'confirmed', text:'WebRTC combines W3C browser APIs with IETF protocols: ICE (RFC 8445), STUN (RFC 8489), TURN (RFC 8656) and SRTP for encrypted media.', src:'W3C WebRTC 1.0 and IETF RFCs 8445, 8489 and 8656'},
    {co:'Discord', tier:'confirmed', text:'Discord described handling millions of voice users with WebRTC clients that connect to its own selective forwarding units.', src:'Discord Engineering, How Discord Handles Two and Half Million Concurrent Voice Users using WebRTC (2018)'}
  ],
  mistakes:[`Forgetting TURN, so calls fail on strict networks.`, `Using a mesh for an 8-person call on phones.`, `Using WebRTC for a broadcast to a hundred thousand viewers.`],
  interview:[`Explain signalling versus media, STUN versus TURN, and mesh versus SFU versus MCU with bandwidth numbers.`],
  tryit:[
    {quiz:[{q:'Why does a call sometimes need a TURN server?', options:['It makes video sharper', 'A strict firewall can block a direct path, so media must be relayed', 'It replaces signalling', 'It encrypts the call'], answer:1, why:'TURN always works, but it sends all media through your servers.'}, {q:'Which is the usual choice for a study group of 8 on phones?', options:['A TURN server only', 'Mesh', 'Email', 'An SFU'], answer:3, why:'Each phone uploads one stream, and the SFU forwards it.'}]},
    {note:'Increase the participants above and compare the upload per phone for mesh and SFU. Then classify:', mount:host => sortGame(host, [
      {t:'SDP offer and answer', c:'sig', why:'They are swapped through your signalling channel.'},
      {t:'Video frames encrypted with SRTP', c:'media', why:'It is the media path.'},
      {t:'ICE candidates (possible addresses)', c:'sig', why:'They are swapped through signalling.'},
      {t:'Audio relayed through TURN', c:'media', why:'It is media sent through a relay.'},
      {t:'A “teacher joined the room” message', c:'sig', why:'It is session control from the app.'}
    ], [{id:'sig', label:'Signalling path'}, {id:'media', label:'Media path'}])}
  ],
  sources:[`W3C WebRTC 1.0`, `RFC 8445, RFC 8489 and RFC 8656`, `Discord Engineering (2018)`, `webrtcforthecurious.com`]
},
{
  id:'live-streaming-abr', title:'Live streaming and adaptive bitrate (HLS/DASH)', minutes:12, tags:['HLS','DASH','adaptive bitrate','ABR','segment','manifest','CDN','latency'],
  summary:'Live video is cut into short segments at several qualities and listed in a manifest. Players pick each segment’s quality to match the network, and CDNs cache the segments for millions of viewers.',
  problem:`<h3>A small example</h3><p>A teacher streams a live lecture to 100,000 students, from fibre homes to a patchy 4G connection on a moving bus.</p><ul><li>Send everyone 1080p and the bus students buffer.</li><li>Send everyone 360p and the fibre students see a blurry picture.</li><li>When the lecture starts, 100,000 students join in the same minute.</li></ul><p>How can every student get the best picture their network allows?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one lecture from the teacher’s camera to a student on a bus.</p>',
    steps:[
      {icon:'🎞️', title:'Encode several qualities', text:'The stream is encoded into a ladder of qualities, from 240p at 400 kbps to 1080p at 5 Mbps. Every quality switches at the same keyframes.'},
      {icon:'✂️', title:'Cut into segments', text:'Each quality is cut into short video segments of 2 to 6 seconds. A manifest file lists every quality and every segment.'},
      {icon:'🌐', title:'Serve from a CDN', text:'The pieces are plain files, so a CDN can cache them. Thousands of students in one city share the same cached piece.'},
      {icon:'📶', title:'Let the player choose', text:'The player downloads pieces ahead into a buffer. Before each piece, it picks a quality that fits the network and the buffer.'},
      {icon:'⚖️', title:'Balance the trade-off', text:'Short pieces and small buffers give less delay but more risk of stalls. Longer ones are smoother but later.'}
    ],
    mount:host => abrDemo(host),
    html:`<h3>Everyday comparison</h3><p>Think of a buffet with plates of several sizes.</p><div class="simple-table">${h.table(['Buffet', 'Streaming'], [['Plates of several sizes', 'Several qualities.'], ['A guest takes the size that matches how fast they eat', 'The player picks the quality that matches the network.'], ['Switch to a smaller plate when the kitchen is slow', 'Switch down instead of stalling.']])}</div><div class="callout tip"><b>Important point</b><p>Streaming adapts every piece to the viewer’s network. Nobody is stuck at one quality.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Choice'], [['One teacher, thousands of viewers', 'HLS or DASH with a CDN'], ['A two-way conversation', 'WebRTC'], ['Live with only a few seconds of delay', 'Low-latency HLS']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the ladder is 0.4, 0.8, 1.5, 3 and 5 Mbps. The encoder produces 0.4 + 0.8 + 1.5 + 3 + 5 = 10.7 Mbps in total.</p><p>Say the 100,000 students average 2 Mbps each. That is 100,000 × 2 = 200,000 Mbps, or 200 Gbps, leaving the CDN. If 50 CDN locations each fetch every piece once, the origin sends 50 × 10.7 = 535 Mbps. That is about 370 times less than 200,000.</p><p>Players also reload the live manifest. With 4-second pieces, each player asks about every 4 seconds. That is 100,000 ÷ 4 = 25,000 manifest requests a second, which only a CDN can absorb.</p><h4>When it goes wrong</h4><p>Every piece must start with a keyframe, a full picture the decoder can start from. At 30 frames a second, a 4-second piece has 4 × 30 = 120 frames, and the first must be a keyframe. If the qualities have keyframes at different times, a switch will glitch.</p>`
  },
  tradeoffs:{use:[`Use HLS or DASH with a CDN for one-to-many lectures, live or recorded.`], avoid:[`Do not use HLS for a two-way conversation. Its delay is seconds. Use WebRTC.`, `Do not use a single quality for a mobile audience.`], alt:[`Low-latency HLS or DASH for a few seconds of delay.`, `WebRTC-based broadcast for under a second of delay, at higher cost.`]},
  real:[
    {co:'Apple HLS and MPEG-DASH', tier:'confirmed', text:'HLS is specified in RFC 8216. MPEG-DASH is an ISO standard (ISO/IEC 23009-1). Both deliver short segments and a manifest over HTTP.', src:'IETF RFC 8216 and ISO/IEC 23009-1'},
    {co:'Netflix', tier:'confirmed', text:'Netflix researchers published a buffer-based way to choose quality in 2014. It cut stalls compared with approaches that estimate capacity.', src:'Huang et al., A Buffer-Based Approach to Rate Adaptation (SIGCOMM 2014)'}
  ],
  mistakes:[`Using long pieces and big buffers for “live”, which gives 30 seconds or more of delay.`, `Misaligned keyframes, so the player cannot switch quality cleanly.`, `Leaving the manifest uncached, so it overloads the origin.`],
  interview:[`Explain ladder, then segments and manifest, then CDN, then player ABR, and the delay versus stall trade-off.`],
  tryit:{note:'Try each algorithm on the commute network above. Which stalls least, and which gives the best quality? Then check yourself.', quiz:[{q:'Why cut video into segments listed in a manifest?', options:['Smaller files compress better', 'The player can switch quality between pieces, and a CDN can cache plain HTTP files', 'DRM requires it', 'Encoding is faster'], answer:1, why:'It enables both adaptation and caching.'}, {q:'A student rides through a tunnel and the bandwidth drops. What does an adaptive player do?', options:['Stops the lecture', 'Keeps asking for 1080p', 'Asks the teacher to slow down', 'Switches to a lower quality for the next pieces'], answer:3, why:'A lower quality keeps the buffer from running dry.'}], quizId:'rt-l5'},
  sources:[`RFC 8216`, `ISO/IEC 23009-1`, `Huang et al., SIGCOMM 2014`, `Spiteri et al., BOLA (INFOCOM 2016)`]
},
{
  id:'transcoding-pipeline', title:'Video upload and transcoding pipelines', minutes:10, tags:['transcoding','encoding','codec','chunking','pipeline','thumbnails'],
  summary:'A recorded lesson is stored as a raw original, checked, cut into chunks, converted into every quality in parallel, and published through a CDN. Each step can be retried safely.',
  problem:`<h3>A small example</h3><p>A teacher uploads a 2-hour recorded lesson in 4K over a shaky connection.</p><ul><li>The app needs 5 qualities, thumbnails and captions within minutes.</li><li>Converting one long video on one machine can take hours.</li><li>A crash at 90% should not mean starting again.</li></ul><p>How can the app prepare the lesson quickly and safely?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one recorded lesson from upload to the student’s screen.</p>',
    steps:[
      {icon:'⬆️', title:'Upload in parts', text:'The teacher’s app uploads straight to object storage in resumable parts. An “upload complete” notice then starts the pipeline.'},
      {icon:'🔍', title:'Check the file', text:'The pipeline checks the format, length and size, and scans the file for problems.'},
      {icon:'✂️', title:'Cut into chunks', text:'It splits the video into chunks of about 10 seconds, cut at keyframes.'},
      {icon:'⚙️', title:'Convert in parallel', text:'Each chunk in each quality is a separate task. Hundreds of workers run them at the same time.'},
      {icon:'📦', title:'Package and publish', text:'The chunks are joined, packaged with a manifest and pushed to the CDN. Thumbnails are made, and the teacher is told.'}
    ],
    diagram:{title:'Upload, transcode, publish', w:820, h:250, alt:'An upload lands in object storage, an orchestrator splits it into chunks, workers convert the chunks in parallel, and the results are packaged and pushed to a CDN.',
      nodes:[{id:'c', type:'client', label:'Teacher', x:70, y:125}, {id:'s3', type:'db', label:'Raw originals', sub:'object storage', x:220, y:125, w:130}, {id:'wf', type:'service', label:'Workflow orchestrator', x:400, y:50, w:170}, {id:'q', type:'queue', label:'Chunk tasks', x:400, y:190, w:120}, {id:'w', type:'service', label:'Transcode workers', sub:'× hundreds', x:580, y:190, w:160}, {id:'pkg', type:'service', label:'Package + thumbnails', x:600, y:50, w:160}, {id:'cdn', type:'cdn', label:'CDN origin', x:770, y:120}],
      edges:[{from:'c', to:'s3'}, {from:'s3', to:'wf'}, {from:'wf', to:'q'}, {from:'q', to:'w'}, {from:'w', to:'pkg'}, {from:'pkg', to:'cdn'}],
      steps:[
        {note:'The teacher uploads in resumable parts straight to object storage, not through the app servers.', flow:[['c', 's3', 'PUT parts']]},
        {note:'The workflow checks the file and splits it into chunks of about 10 seconds. It creates one task for each chunk and quality.', flow:[['s3', 'wf', 'UploadCompleted'], ['wf', 'q', '720 × 5 tasks']]},
        {note:'Hundreds of workers convert in parallel. If a worker crashes, its task is simply retried.', flow:[['q', 'w', 'tasks'], ['w', 'pkg', 'encoded chunks']], hl:['w']},
        {note:'The chunks are joined, packaged as HLS or DASH with manifests and thumbnails, and published to the CDN.', flow:[['pkg', 'cdn', 'segments + .m3u8']]}
      ]},
    mount:host => transcodeCalc(host),
    html:`<h3>Everyday comparison</h3><p>Think of a wedding photographer with 5,000 photos.</p><div class="simple-table">${h.table(['Wedding photos', 'Transcoding'], [['One editor takes a week for all 5,000', 'One machine takes hours for one long video.'], ['Split the photos into batches for 50 editors', 'Split the video into chunks for hundreds of workers.'], ['If one editor is ill, only that batch is redone', 'If one worker crashes, only its task is retried.']])}</div><div class="callout tip"><b>Important point</b><p>Many small independent tasks finish far sooner than one long job, and each can be retried safely.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Problem', 'Answer'], [['Conversion is slow', 'Convert chunks in parallel.'], ['A worker crashes', 'Retry only that task.'], ['The teacher wants to publish soon', 'Make the small qualities first, then add the big ones.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the 4K original is 50 Mbps. For 7,200 seconds, that is 50 × 7,200 = 360,000 megabits, or 45,000 MB, so about 45 GB. On a 5 Mbps uplink, the upload alone takes 360,000 ÷ 5 = 72,000 seconds, 20 hours.</p><p>With 8 MB parts, there are about 45,000 ÷ 8 ≈ 5,600 parts. A dropped connection costs at most one part, not 20 hours.</p><h4>When it goes wrong</h4><p>Chunks are not equally hard. Say the average takes 6.7 seconds, but one busy chunk takes 30 seconds. The lesson is done only after that last chunk. A common fix is to start a second copy of a task that runs far longer than its siblings. The first result wins. This is safe because the output name is the same.</p><p>The "upload complete" notice may arrive twice. Start the pipeline with the upload ID as a key, so a repeat does not start a second pipeline.</p>`
  },
  tradeoffs:{use:[`Use this pipeline for any app where teachers upload recorded lessons.`], avoid:[`Do not upload through the app servers.`, `Do not run one big job per video that restarts from zero after a failure.`], alt:[`Managed services such as AWS Elemental MediaConvert, Mux or Cloudflare Stream.`]},
  real:[
    {co:'YouTube', tier:'confirmed', text:'YouTube said that more than 500 hours of video are uploaded every minute (a 2019 figure). All of it must be processed into several formats and sizes.', src:'YouTube official statements (2019)'},
    {co:'Netflix', tier:'confirmed', text:'Netflix described a cloud encoding pipeline that splits titles into chunks encoded in parallel on many machines.', src:'Netflix Tech Blog, High Quality Video Encoding at Scale (2015)'}
  ],
  mistakes:[`Cutting chunks away from keyframes, which causes visible glitches.`, `Having no safe retries, so a retry creates duplicate copies.`, `Encoding every upload in every codec whether it is popular or not.`],
  interview:[`Describe resumable upload, then an event, split, parallel convert, package and CDN, with safe retries and cheap qualities first.`],
  tryit:[
    {quiz:[{q:'Why split the video into chunks before converting it?', options:['Chunks can be converted in parallel, and a failed one can be retried alone', 'Chunks are smaller files for the CDN', 'It removes the need for keyframes', 'It makes the video sharper'], answer:0, why:'Parallel work is faster, and a retry redoes only a small piece.'}, {q:'What makes a retry safe?', options:['Running every task twice', 'Deleting the original', 'Output names that never change, so a retry overwrites instead of duplicating', 'Using one machine'], answer:2, why:'The same task always writes to the same place.'}]},
    {note:'Order the pipeline:', mount:host => orderGame(host, ['Resumable upload to object storage', 'Validate and probe the file', 'Split into chunks at keyframes', 'Transcode chunks × renditions in parallel', 'Package HLS/DASH segments and manifests', 'Publish to the CDN and notify the teacher'], '✓ All six steps in order. The teacher’s lesson is now ready for students.')}
  ],
  sources:[`Netflix Tech Blog (2015)`, `FFmpeg documentation`, `AWS Elemental MediaConvert documentation`]
},
{
  id:'offline-first-sync', title:'Offline-first apps and sync', minutes:11, tags:['offline-first','sync','conflict resolution','LWW','CRDT','local-first'],
  summary:'Offline-first apps read and write a local database, queue changes, and sync when the network returns. The hard part is merging edits made at the same time: last writer wins, per-field merge, explicit conflicts or CRDTs.',
  problem:`<h3>A small example</h3><p>A student in a village with no signal takes notes in the classroom app. Later she opens the same note on her laptop.</p><ul><li>Her phone edits the note title offline.</li><li>Her laptop edits the note body at the same time.</li><li>Both reconnect at different moments.</li></ul><p>Whose change wins, and does any work silently disappear?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one note as two devices edit it offline and then sync.</p>',
    steps:[
      {icon:'📱', title:'Write locally first', text:'The app saves each edit in a local database on the phone. The screen updates at once and works offline.'},
      {icon:'📤', title:'Queue the changes', text:'Each edit goes into a sync queue with an ID. The queue sends changes when the phone is online, and a retry never applies an edit twice.'},
      {icon:'🔄', title:'Ask for what you missed', text:'The server returns the changes since the phone’s last sync cursor, a marker of how far it has caught up.'},
      {icon:'⚔️', title:'Settle conflicts by a rule', text:'If two devices changed the same thing, a rule decides. It can be last writer wins, a per-field merge, or asking the student.'},
      {icon:'✅', title:'Let the server confirm scarce things', text:'For things that must not clash, such as the last seat in a live class, the server confirms before it counts.'}
    ],
    mount:host => syncDemo(host),
    html:`<h3>Everyday comparison</h3><p>Think of two people editing paper copies of the same notes.</p><div class="simple-table">${h.table(['Paper copies', 'Sync'], [['Different lines were added, so keep both', 'Different fields changed, so keep both.'], ['Both changed the same line, so someone decides', 'The same field changed, so apply a rule or ask.'], ['Agree a rule in advance, such as “latest wins”', 'Pick a conflict rule for each kind of data.']])}</div><div class="callout tip"><b>Important point</b><p>Offline edits will clash sometimes. Choose a rule for every kind of data before it happens.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Situation', 'Rule'], [['Different fields were edited', 'A per-field merge keeps both.'], ['The same field was edited on both devices', 'Keep both and ask, or use latest wins.'], ['A scarce thing such as a seat', 'Let the server decide.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the clock on the laptop is 3 minutes slow. The phone edits the title at 10:00, real time, and its clock says 10:00. The laptop edits the same title at 10:01 and its clock says 10:01 − 0:03 = 9:58. With plain last writer wins by clock, the newer laptop edit loses to the older phone edit.</p><p>Say she typed in the note 400 times offline. Sending 400 edits one by one means 400 requests. Merge edits to the same field before sending, and it becomes 1 request.</p><h4>How it works inside</h4><p>The server keeps a change log with ever-increasing numbers. The sync cursor is just the last number a device has seen, say 1,204. The phone asks for "after 1,204" and gets only the 3 newer changes.</p><h4>When it goes wrong</h4><p>A deleted note must stay as a small marker, called a tombstone. Otherwise another device cannot learn it was deleted, and may bring it back. Keep markers for a set time, say 30 days. A device offline longer must reload everything.</p>`
  },
  tradeoffs:{use:[`Use offline-first for class notes and homework drafts, where students are often offline.`], avoid:[`Do not accept offline bookings of scarce seats without the server confirming.`, `Do not use whole-note last writer wins for shared editing.`], alt:[`An online-only app with good caching and retries.`, `Server-decided sync with an instant on-screen update.`]},
  real:[
    {co:'Figma', tier:'confirmed', text:'Figma described its multiplayer system as server-decided, with conflicts settled for each property. The latest writer wins at the property level.', src:'Figma Engineering, How Figma’s multiplayer technology works (2019)'},
    {co:'Automerge and Yjs', tier:'confirmed', text:'These open-source CRDT libraries let apps sync documents and text between devices, and they converge after offline edits.', src:'Automerge and Yjs documentation, and Kleppmann et al., Local-first software (2019)'}
  ],
  mistakes:[`Creating auto-increment IDs on the device, which can collide.`, `Trusting device clocks for last writer wins.`, `Silently dropping the losing side of a conflict.`],
  interview:[`Describe a local store, a sync queue and a sync cursor. State the conflict rule for each kind of data and let the server confirm scarce things.`],
  tryit:{note:'Make both phones edit the title above, then switch strategies to see what each one loses. Then check yourself.', quiz:[{q:'Two offline devices edit different fields of the same note. Which strategy keeps both edits?', options:['Whole-note last writer wins', 'Delete both', 'Per-field merge', 'First writer wins for the whole note'], answer:2, why:'Different fields do not conflict.'}, {q:'Why not use auto-increment IDs for notes created offline?', options:['Two offline devices can create the same ID', 'They are too long', 'They are slow', 'They are encrypted'], answer:0, why:'Each device would hand out the same next number.'}], quizId:'rt-l7'},
  sources:[`Kleppmann et al., Local-first software (2019)`, `Figma Engineering (2019)`, `Shapiro et al., CRDTs (2011)`]
},
{
  id:'mobile-constraints', title:'Mobile networks, battery and infinite scroll', minutes:10, tags:['mobile','latency','RTT','battery','infinite scroll','pagination','payload'],
  summary:'Phones have slow, changing networks, limited data and limited battery. Design for few round trips and small payloads, page long lists with cursors, fetch ahead carefully, and fall back gracefully.',
  problem:`<h3>A small example</h3><p>The classroom app feels instant on school Wi-Fi. A student on a crowded 3G connection in a small town waits about 10 seconds for the home screen.</p><ul><li>The first screen needs 1.8 MB of data.</li><li>It makes 4 requests in a row, each waiting for the last.</li><li>Infinite scroll keeps fetching full-size thumbnails that nobody looks at.</li></ul><p>How can the app be usable on a weak connection?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the home screen as it loads on a 3G phone.</p>',
    steps:[
      {icon:'🔁', title:'Count round trips', text:'On mobile, each back-and-forth costs 50 to 300 ms. Combine calls into one endpoint and avoid waiting for one call before starting the next.'},
      {icon:'🗜️', title:'Shrink the bytes', text:'Send compressed data with only the fields the screen needs. Use right-sized images, and load the ones below the fold later.'},
      {icon:'📄', title:'Page with cursors', text:'Load the lesson list in small pages. A cursor marks the last lesson seen, so new lessons do not shuffle the list.'},
      {icon:'🔋', title:'Respect battery and data', text:'Batch background calls and fetch the next page only when the student nears the end. Use push instead of polling.'},
      {icon:'🧯', title:'Fall back gracefully', text:'Show the lesson titles first and the images later. Keep working on a slow or lost connection.'}
    ],
    mount:host => mobileBudget(host),
    html:`<h3>Everyday comparison</h3><p>Think of a crackly phone call to the school office.</p><div class="simple-table">${h.table(['Crackly phone call', 'Mobile app'], [['Keep the call short and say it all at once', 'Fewer round trips.'], ['Do not read the whole timetable aloud', 'Send only what the screen needs.'], ['Each extra back-and-forth costs more than the words', 'Each extra request costs more than its bytes.']])}</div><div class="callout tip"><b>Important point</b><p>On a slow phone, round trips and bytes matter more than server speed.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Problem', 'Fix'], [['Too many requests in a row', 'One combined endpoint.'], ['Heavy images', 'Right-sized WebP or AVIF images.'], ['Polling for new class notices', 'Use push.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the lesson list has 20 rows per page. Three new lessons arrive while a student reads page 1. With offset paging, page 2 starts at row 21, which is now the old row 18. So 3 rows repeat. A cursor says "after the last lesson I saw", so nothing repeats or is skipped. It is also cheaper, because the database jumps through an index and does not count past rows.</p><p>Now images. Say 20 thumbnails of 300 KB each is 6,000 KB. At 1.5 Mbps, that is 6,000 × 8 ÷ 1,500 = 32 seconds. With 15 KB thumbnails, it is 300 KB, and 300 × 8 ÷ 1,500 = 1.6 seconds.</p><h4>When it goes wrong</h4><p>Tunnels cut connections mid-request. A request may succeed, while the reply is lost. Retrying a request that creates something can then do it twice. Send an idempotency key, which you met in Module 2, so the server treats the retry as the same request.</p><p>Retry with growing waits, for example 1, 2, then 4 seconds, so a weak network is not flooded.</p>`
  },
  tradeoffs:{use:[`Use combined endpoints, cursor pagination, small compressed images and push instead of polling.`], avoid:[`Do not make many requests in a row for each screen.`, `Do not use offset pagination for a fast-changing lesson list.`, `Do not prefetch aggressively on a metered connection.`], alt:[`Server-driven screens that cut client round trips.`, `A progressive web app (PWA) for low-end phones.`]},
  real:[
    {co:'Facebook', tier:'confirmed', text:'Facebook introduced “2G Tuesdays” in 2015, so employees could try the app on a simulated 2G connection and understand slow networks.', src:'Facebook and Meta engineering announcements (2015)'},
    {co:'Twitter Lite', tier:'confirmed', text:'Twitter Lite (2017) was a web app built to be fast and data-light on slow networks and low-end devices.', src:'Twitter Engineering, How we built Twitter Lite (2017)'}
  ],
  mistakes:[`Making one API call for each widget on the home screen.`, `Using full-size images in lists.`, `Polling every few seconds for updates.`],
  interview:[`Count the round trips and bytes for the first screen. Propose one combined endpoint, cursor pagination, an image strategy and push.`],
  tryit:[
    {quiz:[{q:'On a slow network, what usually dominates the load time?', options:['CPU speed', 'Font choice', 'Round trips and the number of bytes', 'Database size'], answer:2, why:'Every round trip and every byte has to cross a slow link.'}, {q:'Why use cursor pagination for a fast-changing lesson list?', options:['A cursor marks the last item seen, so new items do not shift the pages', 'Cursors are smaller than IDs', 'It avoids HTTPS', 'It removes the need for a server'], answer:0, why:'Offset pages shift when new lessons arrive. A cursor does not.'}]},
    {note:'Switch the network to 2G above and get the first screen under 5 seconds. Then classify:', mount:host => sortGame(host, [
      {t:'Combine 6 home-screen calls into one endpoint', c:'rtt', why:'It means fewer round trips.'},
      {t:'Serve WebP thumbnails sized for the screen', c:'bytes', why:'It means fewer bytes.'},
      {t:'TLS 1.3 and HTTP/3', c:'rtt', why:'They need fewer handshake round trips.'},
      {t:'Return only the fields the screen needs', c:'bytes', why:'It makes the payload smaller.'},
      {t:'Batch analytics events every 60 seconds', c:'battery', why:'It means fewer radio wake-ups.'},
      {t:'Use push instead of polling for class notices', c:'battery', why:'It avoids periodic wake-ups.'}
    ], [{id:'rtt', label:'Fewer round trips'}, {id:'bytes', label:'Fewer bytes'}, {id:'battery', label:'Battery'}])}
  ],
  sources:[`Grigorik, High Performance Browser Networking (O’Reilly)`, `web.dev, PWA and performance guidance`, `Twitter Engineering (2017)`]
}
];

SDA.register({
  kind:'module', id:'realtime', order:13, level:'realworld', icon:'📡', title:'Real-time & Media',
  summary:'WebSockets at scale, presence, push notifications (APNs/FCM), WebRTC with STUN/TURN and SFUs, live streaming with adaptive bitrate (HLS/DASH), transcoding pipelines, offline-first sync, and mobile network constraints.',
  outcomes:['Design a WebSocket gateway tier with routing, persistence-first delivery and safe reconnects', 'Implement presence and push notifications that scale and respect users', 'Choose WebRTC topologies and explain NAT traversal', 'Explain streaming pipelines: transcoding, ladders, segments, CDNs and ABR trade-offs', 'Build offline-first sync with explicit conflict policies and mobile-friendly APIs'],
  lessons,
  quiz:[
    {q:'Why do chat systems save a message before pushing it over WebSockets?', options:['Sockets are faster', 'So it survives disconnects and can be resent from the last seen ID', 'Encryption', 'Compliance only'], answer:1, why:'The socket is a fast path, not the source of truth.'},
    {q:'After a gateway deploy, a million clients reconnect at once. This is…', options:['Fine', 'Impossible', 'A presence feature', 'A reconnect storm, so use random waits and gradual draining'], answer:3, why:'It is a thundering herd.'},
    {q:'A grace period in presence is used to…', options:['Avoid showing a student offline during a brief network drop', 'Save storage', 'Encrypt status', 'Speed up typing signals'], answer:0, why:'It prevents flicker.'},
    {q:'Collapse keys in APNs and FCM…', options:['Compress payloads', 'Encrypt messages', 'Group users', 'Replace older undelivered notifications that have the same key'], answer:3, why:'Only the latest one is delivered.'},
    {q:'STUN servers…', options:['Relay all media', 'Tell a device its public address as seen from outside', 'Store recordings', 'Mix audio'], answer:1, why:'TURN relays media. STUN only helps find addresses.'},
    {q:'For a 10-person video call on phones, the usual topology is…', options:['An SFU', 'Mesh', 'Email', 'A single TCP connection'], answer:0, why:'Each phone sends once, and the SFU forwards.'},
    {q:'Adaptive bitrate players switch quality…', options:['Mid-frame', 'At segment boundaries, based on throughput and buffer', 'Only at startup', 'At random'], answer:1, why:'Aligned segments allow clean switching.'},
    {q:'Why chunk a video before transcoding it?', options:['Better quality', 'Smaller originals', 'Parallel work across many workers, and cheap retries of failed chunks', 'DRM'], answer:2, why:'The chunks are independent tasks.'},
    {q:'Two devices edit the same field offline. Whole-note last writer wins will…', options:['Merge both', 'Silently drop one device’s edit', 'Crash', 'Ask the user'], answer:1, why:'The later write replaces everything.'},
    {q:'On a slow mobile network, the biggest win for first-screen time is usually…', options:['Faster CPUs', 'Fewer round trips in a row and fewer bytes', 'More API endpoints', 'Bigger images'], answer:1, why:'Round trips and bandwidth dominate.'},
    {type:'scenario', q:'Design the real-time parts of a live classroom app: chat for each class, presence, “class starts soon” notices when the app is closed, and a video lecture for 100,000 students.', answer:'<ul><li><b>Chat:</b> WebSocket gateways behind a load balancer, and a routing layer that knows which gateway holds each student. Save each message first and resume from the last message ID after a drop. Reconnect with random waits.</li><li><b>Presence:</b> heartbeats, a timeout and a grace period. Send changes only to people looking at that class, and show a count for big classes.</li><li><b>Reminders:</b> a notification service for preferences and rate limits, a send queue, APNs and FCM, a TTL and a collapse key, and removal of dead tokens.</li><li><b>Lecture:</b> encode a ladder of qualities with aligned keyframes, package HLS with 2 to 4 second segments, and serve from a CDN with an origin shield. Use WebRTC only for the teacher and a small question group.</li><li><b>Phones:</b> one combined endpoint for the home screen, cursor pagination and right-sized images.</li></ul>'},
    {type:'scenario', q:'A teacher goes live to 100,000 students on phones. Outline the streaming architecture and how it copes with the join spike.', answer:'<ol><li><b>Contribution:</b> the teacher’s app sends the stream to two ingest sites, so one failure does not stop the lecture.</li><li><b>Live transcoding</b> into a ladder of about 6 qualities from 240p to 1080p, with aligned keyframes. Package HLS or DASH with 2 to 4 second segments, or low-latency HLS if the delay matters.</li><li><b>Distribution:</b> one or more CDNs with an origin shield, one request per missing segment, and a short manifest cache time.</li><li><b>Player:</b> a hybrid adaptation rule that starts at a low quality and climbs as the buffer fills.</li><li><b>Join spike:</b> warm up CDN and origin capacity before the start, use a waiting page to spread arrivals, and rate-limit manifest requests.</li><li><b>Watch it:</b> track stall rate, startup time and quality by network. Lower the top of the ladder if the origin struggles.</li><li><b>Interaction:</b> chat on WebSockets and a small WebRTC group for live questions.</li></ol>'}
  ],
  cheatsheet:[
    {h:'🔌 WebSockets', items:['A gateway tier holds sockets, and services stay stateless', 'A routing layer maps user to gateway', 'Save first, then resume from the last message ID', 'Fewest-connections balancing, and drain on deploy', 'Reconnect with random waits to avoid storms']},
    {h:'🟢 Presence and push', items:['Heartbeat, timeout and grace period', 'Send changes only to active viewers', 'Typing signals are short-lived and best effort', 'APNs and FCM: tokens, 4 KB, TTL, priority, collapse key', 'Remove dead tokens, and sync when the app opens']},
    {h:'🎥 WebRTC', items:['Signalling is yours, often over a WebSocket', 'ICE tries host, STUN and TURN candidates', 'Mesh up to 4, an SFU for groups, an MCU when phones are weak', 'Simulcast gives each receiver the right quality', 'Broadcast to thousands with HLS or DASH']},
    {h:'📺 Streaming', items:['Ladder, then segments and manifest, then CDN', 'ABR: throughput-based or buffer-based', 'Live delay is about segment length × buffered segments', 'Origin shield and request collapsing', 'Per-title encoding saves bandwidth']},
    {h:'🛠 Pipelines', items:['Resumable upload to object storage', 'Split at keyframes, then run parallel tasks', 'Fixed output names and workflow retries', 'Cheap qualities first, costly codecs only for popular lessons']},
    {h:'📱 Offline and mobile', items:['Local store, sync queue and sync cursor', 'IDs made on the device (UUID or ULID)', 'Conflicts: last writer wins, per-field merge, ask the user, or CRDT', 'Scarce things need server confirmation', 'Count round trips and bytes, and page with cursors']}
  ],
  glossary:[
    {term:'WebSocket gateway', aka:['connection gateway', 'gateway tier', 'gateway server', 'gateway servers'], def:'A server layer that holds open connections from students’ apps. Example: gateway 1 holds Asha’s open connection.'},
    {term:'Reconnect storm', aka:['reconnect storms'], def:'A surge of reconnections when many connections drop at once. Example: a deploy drops 5 million connections, and they all come back in the same second.'},
    {term:'Presence', def:'Information about whether someone is online, away, typing or last seen. Example: a green dot next to a classmate.'},
    {term:'Grace period', def:'A short wait before acting on a change, so brief blips are ignored. Example: wait 10 more seconds before showing a student as offline.'},
    {term:'Fan-out', def:'Sending one change or message to many recipients. Example: one status change reaches 150 classmates.'},
    {term:'Push notification', aka:['push notifications'], def:'A message delivered to a phone through Apple’s or Google’s service, even when the app is closed. Example: “Your class starts in 10 minutes”.'},
    {term:'APNs', aka:['Apple Push Notification service'], def:'Apple Push Notification service: Apple’s service for delivering notifications to iPhones. Example: your server hands a notice to APNs, and APNs delivers it.'},
    {term:'FCM', aka:['Firebase Cloud Messaging'], def:'Firebase Cloud Messaging: Google’s service for delivering notifications to Android, iOS and the web. Example: the same class reminder sent to an Android phone.'},
    {term:'Device token', aka:['registration token', 'push token', 'device tokens'], def:'An ID that APNs or FCM gives to one app install, used to address a notification. Example: like a house address for one student’s phone.'},
    {term:'Collapse key', aka:['collapse ID'], def:'A key that lets a newer notification replace an older one that was not delivered yet. Example: six status updates collapse into the latest one.'},
    {term:'WebRTC', def:'Browser and phone features for live audio and video between devices. Example: a one-to-one tutoring call.'},
    {term:'Signaling', aka:['signalling'], def:'Swapping call details so two devices can set up a WebRTC connection. Example: the tutor’s phone sends an offer through a server, and the student replies.'},
    {term:'SDP', aka:['session description protocol'], def:'Session description protocol: a text format that describes a call, such as codecs and addresses. Example: the offer and the answer are written in SDP.'},
    {term:'ICE', aka:['interactive connectivity establishment', 'ICE candidates'], def:'Interactive connectivity establishment: a method for trying possible network paths and picking the best one that works. Example: try a direct path first, then a relay.'},
    {term:'STUN', def:'A server that tells a device its public address as seen from outside its NAT. Example: the student’s phone learns it appears as 203.0.113.9 on port 5000.'},
    {term:'TURN relay', aka:['TURN server', 'TURN servers', 'TURN relays'], def:'A relay server that passes media between two devices when a direct path is blocked. Example: a strict school firewall forces the call through TURN.'},
    {term:'NAT', aka:['NATs'], def:'Network address translation: a router that lets many devices share one public address. Example: many phones on one carrier share a few public addresses.'},
    {term:'SFU', aka:['selective forwarding unit'], def:'Selective forwarding unit: a media server that forwards each person’s stream to the others without decoding it. Example: 8 students each send one stream, and the SFU passes them on.'},
    {term:'MCU', aka:['multipoint control unit'], def:'Multipoint control unit: a media server that decodes everyone’s video and mixes it into one stream. Example: each student receives one combined picture.'},
    {term:'Mesh call', aka:['full mesh'], def:'A call layout where every participant connects directly to every other. Example: with 4 people, each phone sends 3 streams.'},
    {term:'Simulcast', aka:['SVC'], def:'Sending several qualities of one video at once, so a server can forward the right one to each receiver. Example: a phone sends high, medium and low quality together.'},
    {term:'HLS', aka:['HTTP Live Streaming', 'LL-HLS'], def:'HTTP Live Streaming: Apple’s way of streaming video as short pieces listed in a playlist. Example: a lecture is served as 4-second pieces.'},
    {term:'MPEG-DASH', aka:['DASH'], def:'An international standard for streaming video as short pieces over HTTP. Example: many Android players and smart TVs use it.'},
    {term:'Adaptive bitrate', aka:['ABR', 'adaptive bitrate streaming'], def:'Changing video quality during playback to fit the network and the buffer. Example: the player drops to 360p in a tunnel.'},
    {term:'Bitrate ladder', aka:['encoding ladder', 'rendition', 'renditions'], def:'The set of qualities a video is encoded into. Example: 240p at 400 kbps up to 1080p at 5 Mbps.'},
    {term:'Manifest', aka:['playlist', 'm3u8', 'MPD'], def:'A file that lists the available qualities and the addresses of the pieces of a stream. Example: an .m3u8 playlist.'},
    {term:'Video segment', aka:['video segments', 'HLS segment', 'media segment'], def:'A short piece of a video that the player fetches on its own, usually 2 to 6 seconds long. Example: a 4-second piece of the lecture.'},
    {term:'Rebuffering', aka:['rebuffer', 'rebuffers', 'stalls'], def:'Playback pausing because the buffer ran empty. Example: the lecture freezes while the bus is in a tunnel.'},
    {term:'Transcoding', aka:['transcode', 'transcoder'], def:'Converting video into other codecs, sizes and bitrates. Example: one 4K upload becomes five qualities.'},
    {term:'Codec', aka:['H.264', 'HEVC', 'AV1'], def:'A method for compressing and decompressing audio or video. Example: H.264 is common, and AV1 compresses better but takes longer.'},
    {term:'Keyframe', aka:['I-frame', 'GOP'], def:'A video frame that stands alone, where decoding, switching or cutting can start. Example: chunks are cut at keyframes so they join cleanly.'},
    {term:'Per-title encoding', def:'Choosing the set of qualities to suit each video’s complexity. Example: a slide-based lecture needs lower bitrates than a sports match.'},
    {term:'Resumable upload', aka:['resumable uploads'], def:'An upload sent in parts that can continue after a break. Example: a teacher’s upload stops at 60% and resumes from 60%.'},
    {term:'Offline-first', aka:['local-first'], def:'Designing an app to work on local data first and sync with the server later. Example: a student takes notes with no signal.'},
    {term:'Sync queue', aka:['client outbox'], def:'A local queue of changes waiting to be sent to the server. Example: three edits wait in the sync queue until the phone is online.'},
    {term:'Sync cursor', def:'A marker of the last change a device has received, used to fetch only newer changes. Example: “give me everything after change 812”.'},
    {term:'Last-writer-wins', aka:['LWW', 'last writer wins'], def:'A conflict rule where the most recent write replaces the others. Example: the phone’s title edit is lost because the laptop’s edit came later.'},
    {term:'Operational transformation', aka:['OT'], def:'A technique for shared editing that rewrites concurrent edits so they fit together. Example: two people type in the same sentence, and both edits survive.'},
    {term:'Round trip', aka:['round trips', 'RTT', 'round-trip time'], def:'One request going out and its answer coming back. Example: a screen that needs 4 requests in a row costs 4 round trips.'},
    {term:'Infinite scroll', def:'Loading more content automatically as the user nears the end of a list. Example: more lessons appear as you scroll down.'},
    {term:'Progressive Web App', aka:['PWA'], def:'A web app that can be installed and can work offline, using modern browser features. Example: a light version of the classroom app for cheap phones.'},
    {term:'Real-user monitoring', aka:['RUM'], def:'Measuring speed on real users’ devices and networks. Example: finding that students in one town wait 9 seconds for the home screen.'}
  ],
  sources:['RFC 6455 (WebSocket); WhatsApp (2012), Discord (2017–2018), Slack (2023), LinkedIn presence (2018) engineering blogs', 'Apple APNs and Firebase Cloud Messaging documentation', 'W3C WebRTC 1.0; IETF RFCs 8445 (ICE), 8489 (STUN), 8656 (TURN)', 'RFC 8216 (HLS); ISO/IEC 23009-1 (DASH); Huang et al., SIGCOMM 2014; Spiteri et al., BOLA (2016)', 'Netflix Tech Blog — encoding at scale, per-title encoding (2015); FFmpeg docs', 'Kleppmann et al., Local-first software (2019); Figma multiplayer (2019); Automerge/Yjs docs', 'Grigorik, High Performance Browser Networking; Google Flipkart Lite case study; Twitter Lite (2017)']
});
} catch(e){ console.error('[SDA] module realtime', e); SDA.errors.push({id:'realtime', error:e}); }
})();
