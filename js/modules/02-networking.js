
/* =====================================================================
   PART 2 · MODULE 2 — NETWORKING & APIs
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, esc, clamp, fmtNum, fmtBytes, fmtDur, shuffle} = SDA.u; const ui = SDA.ui;
const {sortGame, lineChart} = SDA.m1helpers;
const frag = html => { const t = document.createElement('template'); t.innerHTML = html; return t.content; };

/* ---------- widgets ---------- */
function ttlSim(host, api){
  const P = {ttl:Math.log10(3600), ig:3, lowered:false}; let t = 0, playing = false, chart = null;
  const box = el('div'); const info = el('div', {class:'verdict warn', role:'status', style:{marginTop:'10px'}});
  const frac = x => { const eff = P.lowered ? 60 : Math.pow(10, P.ttl); const comp = Math.max(0, 1 - x * 3600 / eff); const ign = Math.max(0, 1 - x / 48); return ((1 - P.ig / 100) * comp + (P.ig / 100) * ign) * 100; };
  function build(){ box.innerHTML = ''; chart = lineChart(box, {label:'Share of traffic still reaching the OLD server after a DNS change', w:680, h:250, xMin:0, xMax:48, yMax:100, xTicks:[0, 6, 12, 24, 36, 48], xFmt:v => v + 'h', yTicks:[0, 25, 50, 75, 100], yFmt:v => v + '%', xLabel:'Hours since you changed the DNS record', yLabel:'Traffic to old IP', fn:frac, color:'var(--c-ext)'}); show(t); }
  function show(x){ const f = frac(x); chart.set(x, `${x.toFixed(1)}h → ${f.toFixed(1)}%`); info.className = 'verdict ' + (f < 1 ? 'ok' : f < 20 ? 'warn' : 'bad'); info.textContent = f < 1 ? `After ${x.toFixed(1)} h almost nobody reaches the old server — safe to shut it down.` : `After ${x.toFixed(1)} h, ${f.toFixed(1)}% of users still hit the OLD server. Shut it down now and they get errors.`; }
  const s1 = ui.slider({label:'Record TTL before the change', min:1.78, max:4.94, step:.01, value:P.ttl, fmt:v => fmtDur(Math.pow(10, v) * 1000), onInput:v => { P.ttl = v; build(); }});
  const s2 = ui.slider({label:'Resolvers that ignore TTL (cache ~2 days)', min:0, max:10, step:.5, value:3, fmt:v => v + '%', onInput:v => { P.ig = v; build(); }});
  const tg = ui.toggle({label:'Best practice: lowered TTL to 60 s a day before the change', checked:false, onChange:v => { P.lowered = v; build(); }});
  const lp = api.loop(dt => { if (!playing){ lp.pause(); return; } t += dt * 4; if (t > 48){ t = 48; playing = false; } show(t); });
  lp.pause();
  host.append(el('div', {class:'ctl-grid'}, s1.el, s2.el), el('div', {style:{margin:'10px 0'}}, tg.el), box, info, el('div', {class:'controls', style:{marginTop:'10px'}}, ui.button('▶ Play the 48 hours', () => { if (t >= 48) t = 0; playing = true; lp.resume(); }, 'sm primary'), ui.button('↺ Reset', () => { playing = false; t = 0; show(0); }, 'sm ghost')));
  build();
}
function lossSim(host, api){
  const N = 20, RTT = 100, GAP = 20, RTO = 300; let pkts = [], t = 0, playing = false, loss = 15;
  const tcpRow = el('div', {style:{display:'grid', gridTemplateColumns:`repeat(${N},1fr)`, gap:'4px'}}), udpRow = el('div', {style:{display:'grid', gridTemplateColumns:`repeat(${N},1fr)`, gap:'4px'}});
  const clock = el('span', {class:'chip mono'});
  const met = ui.metrics(null, [{id:'tcpDone', label:'TCP: all delivered at', unit:'ms'}, {id:'stall', label:'TCP: worst in-order stall', unit:'ms', warn:150, bad:400}, {id:'udpPct', label:'UDP: delivered', unit:'%', dir:'down', warn:95, bad:85}, {id:'udpLast', label:'UDP: last arrival', unit:'ms'}]);
  function draw(){
    const cell = (txt, bg, title) => el('div', {title, style:{height:'34px', borderRadius:'6px', display:'grid', placeItems:'center', font:'600 11px var(--font-mono)', background:bg, color:'var(--text)', border:'1px solid var(--border)', transition:'background .25s'}}, txt);
    tcpRow.innerHTML = ''; udpRow.innerHTML = '';
    pkts.forEach((p, i) => {
      const tcpBg = t >= p.app ? 'color-mix(in srgb, var(--ok) 45%, transparent)' : t >= p.arrive ? 'color-mix(in srgb, var(--warn) 45%, transparent)' : 'var(--surface)';
      tcpRow.append(cell(String(i + 1), tcpBg, t >= p.arrive && t < p.app ? 'arrived, waiting for an earlier lost packet (head-of-line blocking)' : ''));
      const udpBg = p.lost ? (t >= p.send + RTT / 2 ? 'color-mix(in srgb, var(--bad) 40%, transparent)' : 'var(--surface)') : (t >= p.send + RTT / 2 ? 'color-mix(in srgb, var(--ok) 45%, transparent)' : 'var(--surface)');
      udpRow.append(cell(p.lost && t >= p.send + RTT / 2 ? '✗' : String(i + 1), udpBg));
    });
    clock.textContent = `t = ${Math.round(t)} ms`;
  }
  function roll(){
    pkts = []; let maxApp = 0, stall = 0;
    for (let i = 0; i < N; i++){ const send = i * GAP; let arrive = send + RTT / 2, k = 0; while (Math.random() < loss / 100 && k < 4){ arrive += RTO; k++; } const lost = k > 0; pkts.push({send, arrive, lost}); }
    pkts.forEach(p => { maxApp = Math.max(maxApp, p.arrive); p.app = maxApp; stall = Math.max(stall, p.app - (p.send + RTT / 2)); });
    const ok = pkts.filter(p => !p.lost);
    met.set('tcpDone', maxApp); met.set('stall', stall); met.set('udpPct', ok.length / N * 100); met.set('udpLast', ok.length ? Math.max(...ok.map(p => p.send + RTT / 2)) : 0);
    t = 0; playing = true; lp.resume(); draw();
  }
  const lp = api.loop(dt => { if (!playing){ lp.pause(); return; } t += dt * 1000 * .35; const end = Math.max(...pkts.map(p => p.app)) + 50; if (t >= end){ t = end; playing = false; } draw(); });
  lp.pause();
  const s = ui.slider({label:'Packet loss', min:0, max:40, step:1, value:loss, fmt:v => v + '%', onInput:v => { loss = v; }});
  host.append(el('div', {class:'ctl-grid'}, s.el), el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('📤 Send 20 packets', roll, 'sm primary'), clock),
    el('div', {class:'lab-hint'}, 'TCP — green = handed to the app, amber = arrived but stuck behind a lost earlier packet'), tcpRow,
    el('div', {class:'lab-hint', style:{marginTop:'10px'}}, 'UDP — green = delivered immediately, red ✗ = lost forever (the app decides what to do)'), udpRow,
    el('div', {style:{height:'12px'}}), met.el, el('p', {class:'lab-hint'}, `Model: one packet every ${GAP} ms, one-way delay ${RTT / 2} ms, retransmission timeout ${RTO} ms (a lost retransmission waits another RTO). Shown at 0.35× speed.`));
  roll();
}
function h2Model(host){
  const P = {n:40, rtt:80, loss:true}; const out = el('div', {style:{marginTop:'12px'}});
  function calc(){
    const R = P.rtt, X = 16, RTO = 200 + 2 * R;
    const h1 = 2 * R + Math.ceil(P.n / 6) * (R + X) + (P.loss ? RTO : 0);
    const h2base = 2 * R + R + P.n * X, h2 = h2base + (P.loss ? RTO : 0);
    const h3base = R + R + P.n * X, h3 = Math.max(h3base, P.loss ? R + R + (P.n / 2) * X + RTO : 0);
    const rows = [['HTTP/1.1', h1, '6 connections; each fetches one resource per round trip. A loss only stalls one connection.'], ['HTTP/2', h2, 'One connection, all requests multiplexed. A single TCP loss stalls <b>every</b> stream (transport head-of-line blocking).'], ['HTTP/3 (QUIC)', h3, 'One handshake round trip fewer; a loss stalls only the affected stream.']];
    const mx = Math.max(...rows.map(r => r[1]));
    out.innerHTML = '';
    rows.forEach(([n, v, why]) => out.append(el('div', {class:'wf-row', style:{gridTemplateColumns:'120px 1fr 80px'}}, el('b', {class:'wl'}, n), el('div', {class:'wf-track', style:{height:'22px'}}, el('div', {class:'wf-bar', style:{left:'0', width:(v / mx * 100) + '%', background:n === 'HTTP/1.1' ? 'var(--c-lb)' : n === 'HTTP/2' ? 'var(--c-client)' : 'var(--accent2)'}})), el('span', {class:'wt'}, Math.round(v) + ' ms')), el('div', {class:'lab-hint', style:{margin:'0 0 8px', paddingLeft:'130px'}, html:why})));
    out.append(el('p', {class:'lab-hint'}, `Simplified model: ${P.n} resources × 20 KB at 10 Mbps (16 ms each), TCP+TLS 1.3 = 2 RTT, QUIC = 1 RTT, one lost packet with RTO = ${200 + 2 * R} ms. Slow start, priorities and server think-time are ignored.`));
  }
  const a = ui.slider({label:'Resources on the page', min:5, max:100, step:1, value:P.n, fmt:v => v, onInput:v => { P.n = v; calc(); }});
  const b = ui.slider({label:'Round-trip time', min:10, max:300, step:5, value:P.rtt, fmt:v => v + ' ms', onInput:v => { P.rtt = v; calc(); }});
  const c = ui.toggle({label:'One packet is lost during the load', checked:true, onChange:v => { P.loss = v; calc(); }});
  host.append(el('div', {class:'ctl-grid'}, a.el, b.el), el('div', {style:{marginTop:'10px'}}, c.el), out); calc();
}
function certChecker(host){
  const STEPS = ['Build a chain from the server certificate up to a trusted root CA', 'Verify every signature in the chain', 'Check validity dates (not before / not after)', 'Check the hostname matches the certificate’s Subject Alternative Names', 'Check revocation status (OCSP stapling / CRL)', 'Server proves it holds the private key (signs the handshake)'];
  const SC = {
    valid:[-1, '🔒 Connection secure. Every check passed; keys are derived and traffic is encrypted.'],
    expired:[2, 'NET::ERR_CERT_DATE_INVALID — the certificate expired. Automate renewal (ACME) and alert well before expiry.'],
    host:[3, 'NET::ERR_CERT_COMMON_NAME_INVALID — the certificate is for a different name (e.g. www.example.com but you visited api.example.com).'],
    self:[0, 'NET::ERR_CERT_AUTHORITY_INVALID — self-signed: no trusted CA vouches for it. Fine for local dev, never for users.'],
    inter:[0, 'Chain incomplete — the server forgot to send the intermediate certificate. Some browsers can fetch it, but many clients (curl, older Android, other services) fail with “unable to get local issuer certificate”.'],
    revoked:[4, 'NET::ERR_CERT_REVOKED — the CA revoked this certificate (e.g. the private key leaked).'],
    mitm:[5, 'Handshake fails — an attacker presented a copy of the real certificate but cannot sign with its private key.']
  };
  const list = el('ol', {class:'steps', style:{marginTop:'12px'}}); const res = el('div', {class:'verdict ok', role:'status'}); let timers = [];
  SDA.onDispose(() => timers.forEach(clearTimeout));
  function run(k){
    timers.forEach(clearTimeout); timers = []; list.innerHTML = ''; res.className = 'verdict warn'; res.textContent = 'Checking…';
    const [failAt, msg] = SC[k]; const items = STEPS.map(s => { const li = el('li', {style:{opacity:'.4'}}, s); list.append(li); return li; });
    const last = failAt < 0 ? STEPS.length - 1 : failAt;
    items.forEach((li, i) => timers.push(setTimeout(() => { if (i > last) return; li.style.opacity = '1'; const bad = i === failAt; li.style.borderColor = bad ? 'var(--bad)' : 'var(--ok)'; li.style.background = bad ? 'var(--bad-bg)' : 'var(--ok-bg)'; li.insertAdjacentHTML('beforeend', bad ? ' <b style="color:var(--bad)">✗ fails</b>' : ' <b style="color:var(--ok)">✓</b>'); if (i === last){ res.className = 'verdict ' + (failAt < 0 ? 'ok' : 'bad'); res.textContent = msg; } }, (SDA.reduced ? 0 : 450) * (i + 1))));
  }
  const s = ui.select({label:'Scenario', value:'valid', options:[['valid', 'Valid certificate'], ['expired', 'Expired certificate'], ['host', 'Wrong hostname'], ['self', 'Self-signed'], ['inter', 'Missing intermediate'], ['revoked', 'Revoked'], ['mitm', 'Attacker replays a stolen certificate (no key)']], onChange:run});
  host.append(el('div', {class:'ctl-grid'}, s.el), list, res); run('valid');
}
function fetchCalc(host){
  const P = {n:5, rtt:80, loader:false}; const out = el('div');
  function calc(){
    const n = P.n, full = 2000, slim = 150;
    const rows = [
      ['REST (generic endpoints)', 2 + n, 2, 2 * full + 2 * n * full, '—', 'Over-fetches: every object returns ~60 fields; restaurants fetched one by one (N+1).'],
      ['REST + composite / BFF endpoint', 1, 1, (1 + 2 * n) * slim, '—', 'One call shaped for this screen — but you build and maintain one endpoint per screen.'],
      ['GraphQL', 1, 1, (1 + 2 * n) * slim, P.loader ? '3 batched' : String(2 + n), P.loader ? 'DataLoader batches the N restaurant lookups into one.' : 'Client asks for exact fields; but naive resolvers still make N+1 backend calls — enable DataLoader.'],
      ['gRPC (service-to-service)', 1, 1, Math.round((1 + 2 * n) * slim * .4), '—', 'Binary protobuf over HTTP/2: smaller and faster to parse — ideal between internal services, not usually from browsers.']
    ];
    out.innerHTML = '';
    out.append(frag(h.table(['Approach', 'Client requests', 'Round trips', 'Bytes to client', 'Backend calls', 'Notes'], rows.map(r => [`<b>${r[0]}</b>`, r[1], r[2], fmtBytes(r[3]), r[4], r[5]]), [1, 2, 3])));
    out.append(el('p', {class:'lab-hint'}, `At ${P.rtt} ms RTT, network waiting alone: REST ≈ ${2 * P.rtt} ms, single-call approaches ≈ ${P.rtt} ms. Byte sizes are illustrative (full object ≈ 2 KB, needed fields ≈ 150 B, protobuf ≈ 40% of JSON).`));
  }
  const a = ui.slider({label:'Orders on the screen', min:1, max:20, step:1, value:5, fmt:v => v, onInput:v => { P.n = v; calc(); }});
  const b = ui.slider({label:'Mobile round-trip time', min:20, max:400, step:10, value:80, fmt:v => v + ' ms', onInput:v => { P.rtt = v; calc(); }});
  const c = ui.toggle({label:'GraphQL server uses DataLoader batching', checked:false, onChange:v => { P.loader = v; calc(); }});
  host.append(el('p', {class:'muted', style:{marginTop:0}}, 'Screen: “My orders” — your name, your last N orders, and each order’s restaurant name.'), el('div', {class:'ctl-grid'}, a.el, b.el), el('div', {style:{margin:'10px 0'}}, c.el), out); calc();
}
function transportSim(host){
  const P = {rate:6, poll:5}; const out = el('div'); const cv = el('canvas', {height:400, style:{height:'200px'}, 'aria-label':'Timeline of events and requests for each technique over 60 seconds'}); const box = el('div', {class:'chart-box', style:{marginTop:'12px'}}, cv);
  function sim(){
    const T = 600, RTT = .1, TO = 30, ev = []; let x = 0; while (true){ x += -Math.log(1 - Math.random()) / (P.rate / 60); if (x > T) break; ev.push(x); }
    const sp = {req:[], d:[]}; for (let k = P.poll; k <= T + P.poll; k += P.poll) sp.req.push(k); ev.forEach(e => { const nx = Math.ceil(e / P.poll) * P.poll; sp.d.push(nx - e + RTT / 2); });
    const lp = {req:[], d:[]}; let open = 0; ev.forEach(e => { while (open + TO < e){ lp.req.push(open); open += TO + RTT / 2; } if (e < open) { lp.d.push(open - e + RTT / 2); lp.req.push(open); open = open + RTT; } else { lp.req.push(open); lp.d.push(RTT / 2); open = e + RTT; } });
    const ss = {req:[0], d:ev.map(() => RTT / 2)};
    const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    const rows = [['Short polling', sp.req.length, avg(sp.d), 'every poll is a full request, mostly answered “nothing new”'], ['Long polling', lp.req.length, avg(lp.d), 'one request per event (+ one per 30 s timeout)'], ['SSE (server → client)', 1, avg(ss.d), 'one long-lived HTTP response; auto-reconnects'], ['WebSocket (both ways)', 1, avg(ss.d), 'one upgraded connection; client can also send']];
    out.innerHTML = ''; out.append(frag(h.table(['Technique', 'Requests in 10 min', 'Avg delivery delay', 'Why'], rows.map(r => [`<b>${r[0]}</b>`, fmtNum(r[1]), fmtDur(r[2] * 1000), r[3]]), [1, 2])));
    out.append(el('p', {class:'lab-hint'}, `Per client. Multiply by 5 million open apps: short polling at ${P.poll}s = ${fmtNum(5e6 / P.poll)} requests/s of mostly-empty answers. RTT 100 ms, long-poll timeout 30 s.`));
    draw(ev, sp.req, lp.req);
  }
  function draw(ev, spReq, lpReq){
    const W = box.clientWidth || 640, H = 200; cv.width = W * 2; const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, W, H);
    const cs = getComputedStyle(document.documentElement); const col = k => cs.getPropertyValue(k).trim(); const X = s => 120 + s / 60 * (W - 130);
    g.font = '11px ' + col('--font-mono'); const lanes = [['events', ev, col('--warn')], ['short poll', spReq, col('--c-lb')], ['long poll', lpReq, col('--c-client')], ['SSE / WS', [0], col('--accent2')]];
    lanes.forEach(([n, arr, c], i) => { const y = 30 + i * 42; g.fillStyle = col('--muted'); g.fillText(n, 8, y + 4); g.strokeStyle = col('--border-strong'); g.beginPath(); g.moveTo(120, y); g.lineTo(W - 10, y); g.stroke(); g.fillStyle = c; arr.filter(s => s <= 60).forEach(s => { if (i === 0){ g.beginPath(); g.arc(X(s), y, 5, 0, 7); g.fill(); } else { g.fillRect(X(s) - 1.5, y - 9, 3, 18); } }); if (i === 3){ g.fillRect(X(0), y - 3, W - 130, 6); } });
    g.fillStyle = col('--muted'); g.fillText('0 s', 120, H - 6); g.fillText('60 s', W - 40, H - 6);
  }
  const a = ui.slider({label:'Order-status events per minute', min:1, max:60, step:1, value:6, fmt:v => v, onInput:v => { P.rate = v; sim(); }});
  const b = ui.slider({label:'Short-poll interval', min:1, max:60, step:1, value:5, fmt:v => v + ' s', onInput:v => { P.poll = v; sim(); }});
  host.append(el('div', {class:'ctl-grid'}, a.el, b.el), box, out, el('div', {class:'controls'}, ui.button('🎲 New random events', sim, 'sm')));
  sim();
}
function paginationDemo(host){
  let feed, next, offA, seenA, curB, seenB;
  const colA = el('div', {class:'stack'}), colB = el('div', {class:'stack'}); const msg = el('div', {class:'verdict warn', role:'status'});
  const reset = () => { feed = []; for (let i = 30; i >= 1; i--) feed.push({id:i}); next = 31; offA = 0; seenA = []; curB = null; seenB = []; render(); msg.className = 'verdict warn'; msg.textContent = 'Load page 1, then make new posts arrive (or delete one), then load the next page.'; };
  const pageA = () => { const p = feed.slice(offA, offA + 5); offA += 5; p.forEach(x => seenA.push({id:x.id, dup:seenA.some(s => s.id === x.id)})); };
  const pageB = () => { const p = feed.filter(x => curB == null || x.id < curB).slice(0, 5); if (p.length) curB = p[p.length - 1].id; p.forEach(x => seenB.push({id:x.id, dup:false})); };
  const skipped = seen => { const ids = seen.map(s => s.id); if (!ids.length) return []; const lo = Math.min(...ids), hi = Math.max(...ids); return feed.filter(f => f.id > lo && f.id < hi && !ids.includes(f.id) && f.id < 31).map(f => f.id); };
  function col(target, seen, title){ target.innerHTML = ''; target.append(el('b', null, title)); const sk = skipped(seen); target.append(el('div', {class:'pill-row'}, ...seen.map(s => el('span', {class:'chip mono', style:s.dup ? {borderColor:'var(--bad)', color:'var(--bad)'} : null}, `#${s.id}${s.dup ? ' dup' : ''}`)))); if (sk.length) target.append(el('div', {class:'lab-hint', style:{color:'var(--bad)'}}, `Never shown (skipped): ${sk.map(x => '#' + x).join(', ')}`)); }
  function render(){ col(colA, seenA, 'Offset pagination  (LIMIT 5 OFFSET n)'); col(colB, seenB, 'Cursor pagination  (WHERE id < last_id LIMIT 5)'); }
  const load = () => { pageA(); pageB(); render(); const d = seenA.filter(s => s.dup).length; const sk = skipped(seenA).length; msg.className = 'verdict ' + (d || sk ? 'bad' : 'ok'); msg.textContent = d || sk ? `Offset showed ${d} duplicate(s) and skipped ${sk} post(s). Cursor pagination stayed correct because it remembers WHERE it was, not HOW FAR.` : 'Both look correct so far — now change the data between pages.'; };
  host.append(el('div', {class:'controls'}, ui.button('📄 Load next page', load, 'sm primary'), ui.button('🆕 2 new posts arrive at the top', () => { feed.unshift({id:next++}, {id:next++}); feed.sort((a, b) => b.id - a.id); msg.textContent = 'Two new posts inserted at the top. Now load the next page.'; }, 'sm'), ui.button('🗑 Delete a post you already saw', () => { const s = seenA[seenA.length - 1]; if (!s){ msg.textContent = 'Load a page first.'; return; } feed = feed.filter(f => f.id !== s.id); msg.textContent = `Post #${s.id} deleted. Load the next page.`; }, 'sm'), ui.button('↺ Reset', reset, 'sm ghost')), el('div', {style:{height:'10px'}}), msg, el('div', {class:'grid c2', style:{marginTop:'12px'}}, el('div', {class:'card'}, colA), el('div', {class:'card'}, colB)));
  reset();
}
function idemDemo(host, api){
  let lost = true, useKey = false, busy = false, n = 0; const ledger = el('div', {class:'stack'}); const store = new Map();
  const holder = el('div');
  const d = new api.Diagram(holder, {title:'Pay ₹499 — with a flaky network', w:720, h:200, alt:'App calls payments API which writes to a ledger; the response may be lost and the app retries.', nodes:[{id:'app', type:'client', label:'Mobile app', x:80, y:100}, {id:'api', type:'service', label:'Payments API', x:340, y:100}, {id:'db', type:'db', label:'Ledger + keys', x:600, y:100}], edges:[{from:'app', to:'api'}, {from:'api', to:'db'}], caption:'Press <b>Pay</b>. The first response may get lost in a tunnel, so the app retries.'});
  const charge = (k) => { n++; ledger.prepend(el('div', {class:'sort-item ' + (ledger.children.length ? 'wrong' : 'right')}, `Charge #${n}: ₹499 ${k ? '(key ' + k.slice(0, 8) + '…)' : '(no key)'}`, ledger.children.length ? el('b', {style:{color:'var(--bad)'}}, 'DUPLICATE') : el('span', null, '✓'))); };
  async function pay(){
    if (busy) return; busy = true; ledger.innerHTML = ''; store.clear(); n = 0;
    const key = useKey ? (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)) : null;
    d.setCaption('Attempt 1: POST /payments' + (key ? ' with Idempotency-Key' : ''));
    await d.flow([['app', 'api', 'POST /pay'], ['api', 'db', 'INSERT']]); charge(key); if (key) store.set(key, '201 {id:"pay_1"}');
    await d.flow([['db', 'api']]);
    if (lost){ d.setStatus('app', 'hot'); await d.flow([['api', 'app', '✗ lost']]); d.setCaption('The charge succeeded but the response was lost. The app times out and <b>retries</b>…'); await new Promise(r => setTimeout(r, SDA.reduced ? 200 : 900)); d.setStatus('app', 'ok');
      await d.flow([['app', 'api', 'retry POST']]);
      if (key && store.has(key)){ await d.flow([['api', 'db', 'key?'], ['db', 'api', 'seen']]); await d.flow([['api', 'app', 'same 201']]); d.setCaption('✓ Same key seen before → the API returns the <b>stored response</b>. Charged exactly once.'); }
      else { await d.flow([['api', 'db', 'INSERT'], ['db', 'api'], ['api', 'app', '201']]); charge(null); d.setCaption('✗ No key → the server can’t tell a retry from a new payment. <b>Customer charged twice.</b>'); }
    } else { await d.flow([['api', 'app', '201']]); d.setCaption('Response arrived; no retry needed. (Turn on “response lost” to see the danger.)'); }
    busy = false;
  }
  let win = [], LIM = 5;
  const hdr = el('pre', {class:'math', style:{whiteSpace:'pre'}});
  const fire = () => { const now = Date.now(); win = win.filter(t => now - t < 10000); let status; if (win.length < LIM){ win.push(now); status = 'HTTP/1.1 200 OK'; } else status = 'HTTP/1.1 429 Too Many Requests\nRetry-After: ' + Math.ceil((10000 - (now - win[0])) / 1000); const reset = win.length ? Math.ceil((10000 - (now - win[0])) / 1000) : 10; hdr.textContent = `${status}\nX-RateLimit-Limit: ${LIM}\nX-RateLimit-Remaining: ${Math.max(0, LIM - win.length)}\nX-RateLimit-Reset: ${reset}   (seconds until the window frees a slot)`; hdr.style.borderColor = status.includes('429') ? 'var(--bad)' : 'var(--border)'; };
  host.append(el('div', {class:'row', style:{gap:'18px'}}, ui.toggle({label:'Response lost on first attempt', checked:true, onChange:v => lost = v}).el, ui.toggle({label:'Send an Idempotency-Key', checked:false, onChange:v => useKey = v}).el), holder, el('div', {class:'controls'}, ui.button('💳 Pay ₹499', pay, 'sm primary')), el('h4', {style:{margin:'12px 0 6px'}}, 'Ledger'), ledger,
    el('h4', {style:{margin:'22px 0 6px'}}, 'Rate-limit headers (5 requests per 10 s)'), el('div', {class:'controls'}, ui.button('📨 Send request', fire, 'sm')), hdr);
  fire(); win = []; hdr.textContent = 'Press “Send request” quickly several times.';
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'ip-and-dns', title:'IP addresses, ports and DNS', minutes:9, tags:['IP','IPv6','NAT','DNS','TTL'],
  summary:'Every machine has an IP address, every service a port, and DNS turns names into IPs with cached answers that expire after a TTL.',
  problem:`<p>You migrate checkout to new servers on Friday night and update DNS. On Saturday morning 30% of users are still hitting the old servers — which you already switched off. DNS answers are <strong>cached all over the internet</strong> for their TTL, and some resolvers hold them even longer.</p>`,
  intuition:`An IP address is a building’s street address; a port is the flat number inside it. DNS is your phone’s contact list: you tap “Mom”, not her number. Each phone keeps its own copy — if Mom changes numbers, people with an old copy keep calling the old one until they refresh.`,
  how:{
    steps:[`<b>IPv4</b> addresses are 32 bits (~4.3 billion — long since exhausted); <b>IPv6</b> is 128 bits. Private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) are reused inside networks behind <b>NAT</b>.`, `A <b>port</b> picks the program on a host: 443 HTTPS, 53 DNS, 5432 Postgres, 6379 Redis.`, `<b>DNS</b> is a hierarchy: root → TLD (.com, .in) → the domain’s authoritative nameservers.`, `Records: <b>A</b> (IPv4), <b>AAAA</b> (IPv6), <b>CNAME</b> (alias), <b>MX</b> (mail), <b>TXT</b> (verification), <b>NS</b> (delegation).`, `Every answer has a <b>TTL</b>; browsers, operating systems and resolvers cache it until it expires.`],
    diagram:{title:'Resolving api.example.com (cold cache)', w:780, h:280, alt:'Browser asks a recursive resolver, which asks the root, .com TLD and authoritative servers in turn.',
      nodes:[{id:'b', type:'client', label:'Browser + OS', x:80, y:140}, {id:'r', type:'ext', label:'Recursive resolver', x:290, y:140, w:150}, {id:'root', type:'ext', label:'Root server', x:560, y:45}, {id:'tld', type:'ext', label:'.com TLD', x:600, y:140}, {id:'auth', type:'ext', label:'Authoritative NS', x:560, y:235, w:140}],
      edges:[{from:'b', to:'r'}, {from:'r', to:'root'}, {from:'r', to:'tld'}, {from:'r', to:'auth'}],
      steps:[
        {note:'The browser and OS caches miss, so the stub resolver asks a <b>recursive resolver</b> (your ISP, 1.1.1.1 or 8.8.8.8).', flow:[['b', 'r', 'api.example.com?']], hl:['r']},
        {note:'The resolver asks a <b>root server</b>: “Who handles .com?” It gets a referral, not the answer.', flow:[['r', 'root', '.com?'], ['root', 'r', 'ask TLD']], hl:['root']},
        {note:'It asks the <b>.com TLD</b> servers: “Who handles example.com?” Another referral.', flow:[['r', 'tld', 'example.com?'], ['tld', 'r', 'ask NS']], hl:['tld']},
        {note:'The <b>authoritative</b> nameserver returns the A record with a TTL (say 300 s).', flow:[['r', 'auth', 'api?'], ['auth', 'r', 'A 203.0.113.7 TTL 300']], hl:['auth']},
        {note:'The resolver <b>caches</b> it and answers. For the next 300 s, everyone using this resolver gets the cached answer instantly.', flow:[['r', 'b', '203.0.113.7']], hl:['b', 'r']}
      ]},
    deep:`<p><b>Recursive vs iterative:</b> your stub asks the resolver to do the full job (recursive); the resolver walks the hierarchy with iterative queries. Resolvers also cache negative answers (NXDOMAIN) using the SOA record’s negative-caching TTL.</p><p><b>Transport:</b> DNS uses UDP port 53 for small answers and TCP for large ones and zone transfers; EDNS(0) allows bigger UDP payloads; DNS-over-HTTPS/TLS encrypt queries. <b>CNAME</b> can’t live at the zone apex (example.com itself), so providers offer ALIAS/ANAME-style records.</p><p><b>Migrations:</b> lower the TTL to ~60 s at least one old-TTL period <i>before</i> the change, switch, keep the old servers running until traffic drains, then raise the TTL again. <b>CIDR</b>: a /24 has 256 addresses, a /16 has 65,536. Mobile networks use carrier-grade NAT, so many users can share one public IPv4 — a reason IP-based rate limiting is crude.</p>`
  },
  tradeoffs:{use:[`<b>Short TTLs (30–300 s)</b> before migrations or when DNS drives failover`, `<b>Long TTLs (hours)</b> for stable records — fewer lookups, faster pages`], avoid:[`Hard-coding IP addresses in clients or config`, `Assuming a DNS change is instant`], alt:[`A stable load-balancer or anycast IP in front, so backends change without DNS changes`, `Service discovery (Consul, Kubernetes DNS) for internal services`]},
  real:[
    {co:'Root server system', tier:'confirmed', text:'There are 13 named root server identities (a through m), operated by 12 organisations, but each is served from many sites worldwide via anycast — well over a thousand instances in total.', src:'root-servers.org'},
    {co:'India & IPv6', tier:'confirmed', text:'India shows one of the highest IPv6 adoption rates in Google’s public per-country IPv6 statistics, driven largely by mobile networks such as Reliance Jio.', src:'Google IPv6 adoption statistics'},
    {co:'AWS Route 53', tier:'confirmed', text:'Offers health-checked failover, weighted, latency-based and geolocation routing — DNS used as the first layer of load balancing.', src:'Amazon Route 53 documentation'}
  ],
  mistakes:[`Forgetting TTLs during a migration and switching the old servers off too early`, `Hard-coding IPs instead of names`, `Treating client IP as a user identity behind carrier-grade NAT`],
  interview:[`Mention DNS caching at browser, OS and resolver layers when explaining a request`, `Note DNS as the first, coarse load-balancing layer (GeoDNS, weighted records)`],
  tryit:{note:'You change a DNS record. How long until the old server stops receiving traffic? Move the TTL and see.', mount:(host, api) => ttlSim(host, api)},
  sources:[`RFC 1034/1035 (DNS)`, `root-servers.org`, `Amazon Route 53 documentation`]
},
{
  id:'tcp-vs-udp', title:'TCP vs UDP', minutes:8, tags:['TCP','UDP','head-of-line blocking','congestion control'],
  summary:'TCP gives reliable, ordered byte streams at the cost of waiting. UDP gives fast, independent datagrams and lets the app decide what to do about loss.',
  problem:`<p>Your video-call app runs over TCP and freezes for a moment whenever a packet is lost — every later packet waits for the lost one to be resent. Your live cricket-score feed over UDP occasionally misses an update. Both are behaving exactly as their protocols promise.</p>`,
  intuition:`TCP is registered post with tracking: numbered parcels, signatures on delivery, resends if something goes missing, and you open them strictly in order. UDP is dropping flyers through letterboxes: fast and cheap, no confirmation, and some never arrive.`,
  how:{
    steps:[`<b>TCP</b> opens a connection (3-way handshake), numbers every byte, waits for acknowledgements and retransmits losses.`, `TCP delivers data <b>in order</b>: if packet 2 is lost, packets 3, 4, 5 wait in the receiver’s buffer — <b>head-of-line blocking</b>.`, `<b>Flow control</b> (receive window) stops a fast sender overwhelming a slow receiver; <b>congestion control</b> (slow start, then careful growth) avoids overwhelming the network.`, `<b>UDP</b> just sends datagrams: no connection, no ordering, no retransmission. Each one stands alone.`, `Use TCP when every byte must arrive in order (web pages, APIs, databases). Use UDP when fresh beats complete (voice, video, games) or when you build your own reliability (QUIC, DNS retries).`],
    diagram:{title:'One lost segment under TCP', w:740, h:220, alt:'A sender sends segments 1 to 3; segment 2 is lost and retransmitted, and segment 3 waits for it.',
      nodes:[{id:'s', type:'client', label:'Sender', x:80, y:110}, {id:'n', type:'ext', label:'Network', x:370, y:110}, {id:'r', type:'service', label:'Receiver app', x:650, y:110}],
      edges:[{from:'s', to:'n'}, {from:'n', to:'r'}],
      steps:[
        {note:'Segment 1 arrives and is handed to the app.', flow:[['s', 'n', 'seg 1'], ['n', 'r', 'seg 1']], hl:['r']},
        {note:'Segment 2 is <b>dropped</b> by a congested router.', flow:[['s', 'n', 'seg 2 ✗']], status:{n:'hot'}},
        {note:'Segment 3 arrives — but TCP must deliver in order, so it <b>waits in the buffer</b>. The app sees nothing.', flow:[['s', 'n', 'seg 3'], ['n', 'r', 'seg 3 (held)']], status:{n:'ok'}, hl:['r']},
        {note:'The receiver keeps acknowledging only up to 1 (duplicate ACKs). The sender detects the loss.', flow:[['r', 'n', 'ACK 1'], ['n', 's', 'dup ACK']]},
        {note:'Segment 2 is <b>retransmitted</b>; now 2 and 3 are released to the app together. Correct, but late — under UDP, 3 would have been usable immediately.', flow:[['s', 'n', 'seg 2 (again)'], ['n', 'r', '2 + 3']], hl:['r']}
      ]},
    deep:`<p><b>Congestion control</b> algorithms: Reno and CUBIC (Linux’s long-time default) treat loss as the congestion signal; Google’s <b>BBR</b> (2016) models bottleneck bandwidth and round-trip time instead. New connections start with a small window (slow start), which is why short-lived connections never reach full speed — another reason to reuse connections.</p><p><b>Operational gotchas:</b> each closed TCP connection lingers in TIME_WAIT; high churn of outbound connections can exhaust ephemeral ports — pool connections. SYN floods target the half-open connection backlog (defended by SYN cookies). Ethernet’s 1,500-byte MTU bounds packet size; oversized UDP datagrams fragment and are more likely to be lost.</p><p><b>UDP needs app-level design:</b> sequence numbers to detect loss and reordering, jitter buffers for media, forward error correction, and congestion control so you don’t harm the network. QUIC implements all of this in user space on top of UDP.</p>`
  },
  tradeoffs:{use:[`<b>TCP:</b> web, APIs, databases, file transfer — anything needing every byte in order`, `<b>UDP:</b> real-time voice/video, games, DNS lookups, telemetry where the latest value matters most`], avoid:[`UDP if you would end up re-implementing TCP badly`, `TCP for real-time media where late data is useless`], alt:[`QUIC: reliable, multiplexed streams over UDP without cross-stream head-of-line blocking`, `WebRTC data channels with configurable reliability and ordering`]},
  real:[
    {co:'DNS', tier:'confirmed', text:'Queries normally use UDP port 53 for speed and fall back to TCP for large responses and zone transfers.', src:'RFC 1035, RFC 7766'},
    {co:'Discord', tier:'confirmed', text:'Voice chat uses WebRTC, whose media travels over UDP, to keep latency low for millions of concurrent voice users.', src:'Discord Engineering, “How Discord Handles Two and Half Million Concurrent Voice Users using WebRTC” (2018)'},
    {co:'Google', tier:'confirmed', text:'Developed the BBR congestion-control algorithm and deployed it for Google services including YouTube.', src:'Cardwell et al., “BBR: Congestion-Based Congestion Control”, ACM Queue (2016)'}
  ],
  mistakes:[`Opening a new TCP connection per request instead of pooling`, `Sending large UDP datagrams that fragment`, `Assuming UDP packets arrive in order or at all`],
  interview:[`Explain head-of-line blocking and why it motivated QUIC/HTTP/3`, `Justify UDP for media: a late frame is a useless frame`],
  tryit:{note:'Send 20 packets over a lossy link. Compare when TCP and UDP hand data to the application.', mount:(host, api) => lossSim(host, api)},
  sources:[`RFC 9293 (TCP), RFC 768 (UDP)`, `Cardwell et al., “BBR”, ACM Queue 2016`, `Discord Engineering blog (2018)`]
},
{
  id:'http-versions', title:'HTTP/1.1 vs HTTP/2 vs HTTP/3', minutes:9, tags:['HTTP/2','HTTP/3','QUIC','multiplexing','HPACK'],
  summary:'HTTP/1.1: one request at a time per connection. HTTP/2: many streams over one TCP connection. HTTP/3: many streams over QUIC, so one loss doesn’t stall them all.',
  problem:`<p>A product page loads 80 small files. Over HTTP/1.1 on a 3G connection it takes ~6 seconds; enabling HTTP/2 at the CDN cuts that sharply; on lossy mobile networks HTTP/3 helps further. Same files, same server — why such different times?</p>`,
  intuition:`HTTP/1.1 is a sweet shop with six counters where each counter serves one order at a time. HTTP/2 is one counter where you hand over every order at once and dishes come back in any order — but if the single conveyor belt jams, every dish waits. HTTP/3 gives each dish its own belt behind the same counter: a jam delays only that dish.`,
  how:{
    steps:[`<b>HTTP/1.1</b>: text protocol; one outstanding request per connection in practice. Browsers open ~6 connections per host. Era of hacks: domain sharding, sprites, bundling.`, `<b>HTTP/2</b>: binary framing; many concurrent <b>streams</b> over one TCP connection; header compression (HPACK). But a lost TCP packet stalls every stream.`, `<b>HTTP/3</b>: HTTP over <b>QUIC</b> on UDP. Streams are independent at the transport layer, the handshake is one round trip (zero on resumption), headers use QPACK, and connections can survive a network change (Wi-Fi → 4G).`, `The semantics (methods, status codes, headers) are identical across versions; only the wire format and transport change.`],
    diagram:{title:'Many requests, three generations', w:740, h:260, alt:'A browser fetching several resources over HTTP/1.1, HTTP/2 and HTTP/3.',
      nodes:[{id:'b', type:'client', label:'Browser', x:90, y:130}, {id:'n', type:'ext', label:'Network', x:360, y:130}, {id:'s', type:'cdn', label:'Server / CDN', x:640, y:130}],
      edges:[{from:'b', to:'n'}, {from:'n', to:'s'}],
      steps:[
        {note:'<b>HTTP/1.1:</b> each connection carries one request at a time; extra requests queue behind it.', flow:[['b', 'n', 'GET a.css'], ['n', 's'], ['s', 'n'], ['n', 'b', 'a.css'], ['b', 'n', 'GET b.js'], ['n', 's']], hl:['b'], dur:600},
        {note:'<b>HTTP/2:</b> all requests go out at once as interleaved streams on one connection.', flow:[['b', 'n', 'stream 1'], ['b', 'n', 'stream 3'], ['b', 'n', 'stream 5'], ['b', 'n', 'stream 7']], parallel:true, hl:['n']},
        {note:'…but one lost TCP packet <b>stalls every stream</b> until it is retransmitted.', flow:[['n', 's', 'loss!']], status:{n:'hot'}},
        {note:'<b>HTTP/3 (QUIC):</b> streams are independent; a loss delays only its own stream while the others keep flowing.', status:{n:'ok'}, flow:[['s', 'n', 's1'], ['s', 'n', 's3'], ['s', 'n', 's5']], parallel:true, hl:['s']}
      ]},
    deep:`<p><b>Negotiation:</b> HTTP/2 is chosen during the TLS handshake via ALPN; HTTP/3 is discovered through the <code>Alt-Svc</code> header (or DNS HTTPS records) and then tried over UDP, falling back to TCP where networks block UDP.</p><p><b>Server push</b> in HTTP/2 promised to send resources before the browser asked, but proved hard to use well; Chrome removed support in 2022 — preload hints and 103 Early Hints are the replacements.</p><p><b>Costs:</b> QUIC runs in user space and encrypts more of its headers, which eases evolution and privacy but costs more CPU per byte than kernel TCP with offloads. HTTP/1.1-era tricks such as domain sharding now <i>hurt</i>, because they split one efficient multiplexed connection into several.</p>`
  },
  tradeoffs:{use:[`<b>HTTP/2</b> everywhere by default (CDNs and modern load balancers support it)`, `<b>HTTP/3</b> for mobile, lossy or long-distance users`], avoid:[`HTTP/1.1 hacks (sharding, sprites) on HTTP/2/3`, `Relying on UDP-only paths without TCP fallback`], alt:[`Fewer, smaller resources and good caching beat any protocol upgrade`, `Server-side rendering / streaming to reduce request chains`]},
  real:[
    {co:'Google', tier:'confirmed', text:'Built QUIC and deployed it for its own services (including YouTube) before the IETF standardised it as RFC 9000; HTTP/3 is RFC 9114.', src:'RFC 9000, RFC 9114; Langley et al., “The QUIC Transport Protocol”, SIGCOMM 2017'},
    {co:'Chrome', tier:'confirmed', text:'Removed HTTP/2 server push support in 2022, recommending preload and 103 Early Hints instead.', src:'Chrome Developers blog, “Removing HTTP/2 Server Push from Chrome” (2022)'},
    {co:'All major browsers', tier:'confirmed', text:'Limit concurrent HTTP/1.1 connections per host (about six), the reason pages with many assets were slow before HTTP/2.', src:'Browser networking documentation'}
  ],
  mistakes:[`Domain sharding on HTTP/2`, `Expecting HTTP/2 to fix lossy-network stalls (it doesn’t — that’s HTTP/3’s job)`, `Forgetting long-lived HTTP/2 connections defeat connection-level (L4) load balancing`],
  interview:[`Explain HOL blocking at the application layer (1.1) vs the transport layer (2) and how QUIC removes it`, `Note HTTP/2 connections are long-lived — load balance per request at L7`],
  tryit:{note:'A simplified page-load model. Change the number of resources and the round-trip time, and add a packet loss.', mount:host => h2Model(host)},
  sources:[`RFC 9110–9114`, `Langley et al., SIGCOMM 2017`, `Ilya Grigorik, “High Performance Browser Networking”`]
},
{
  id:'https-tls', title:'HTTPS and the TLS handshake', minutes:9, tags:['TLS','HTTPS','certificates','mTLS','PKI'],
  summary:'TLS gives three guarantees: privacy (encryption), integrity (no tampering) and authenticity (you are really talking to the site named in the certificate).',
  problem:`<p>On café Wi-Fi anyone on the network can read or change plain HTTP traffic — inject ads, steal session cookies, or impersonate the site. HTTPS must answer three questions: can anyone read this, can anyone change it, and am I <em>really</em> talking to zomato.com?</p>`,
  intuition:`Sending valuables by courier: first check the courier’s government ID, issued by an authority you trust (the certificate and CA). Then agree a secret lock combination over a public phone line in a way eavesdroppers can’t reconstruct (Diffie-Hellman key exchange). Then everything travels in a locked box only the two of you can open (symmetric encryption).`,
  how:{
    stepper:{title:'TLS 1.3 handshake and verification', items:[
      {title:'ClientHello', tag:'client → server', text:'Supported cipher suites, a random value, the server name (SNI), and a <b>key share</b> (an ephemeral Diffie-Hellman public key).'},
      {title:'ServerHello + key share', tag:'server → client', text:'Server picks the cipher, sends its own key share. Both sides can now derive the same secret; everything after this is encrypted.'},
      {title:'Certificate', tag:'server → client', text:'The server’s certificate chain: leaf (for zomato.com) → intermediate CA → (root, already in the client’s trust store).'},
      {title:'CertificateVerify', tag:'proof of key', text:'The server signs the handshake transcript with the certificate’s <b>private key</b>, proving it isn’t just replaying a public certificate.'},
      {title:'Client verifies', tag:'trust checks', text:'Chain to a trusted root, signatures, dates, hostname vs Subject Alternative Names, revocation.'},
      {title:'Finished → app data', tag:'1 round trip', text:'Both send Finished; HTTP requests flow encrypted with fast symmetric ciphers (AES-GCM or ChaCha20-Poly1305).'}
    ]},
    steps:[`Asymmetric crypto (certificates, key exchange) is used only to <b>agree</b> keys; bulk data uses fast symmetric encryption.`, `Ephemeral key exchange gives <b>forward secrecy</b>: stealing the server’s private key later doesn’t decrypt recorded past traffic.`, `TLS is usually <b>terminated</b> at the load balancer or CDN; traffic to backends can be re-encrypted.`, `<b>mTLS</b> (mutual TLS): the client also presents a certificate — common for service-to-service authentication.`],
    deep:`<p><b>PKI:</b> browsers and OSes ship a root store; CAs sign intermediates, which sign leaf certificates. <b>Certificate Transparency</b> requires publicly trusted certificates to be logged in append-only logs, so mis-issuance can be detected. Revocation is imperfect (CRLs are big, OCSP leaks privacy and adds latency); OCSP stapling and short-lived certificates help.</p><p><b>TLS 1.3</b> removed legacy options (RSA key exchange, static DH, CBC suites), leaving a handful of AEAD cipher suites. Resumption uses pre-shared keys; 0-RTT data can be replayed, so only idempotent requests should use it.</p><p><b>Operations:</b> automate issuance and renewal with ACME (RFC 8555), alert on expiry well ahead, keep private keys in a KMS/HSM where possible, and enable HSTS so browsers refuse plaintext downgrades. Termination choices: terminate at the edge (enables L7 routing, WAF, caching), passthrough (end-to-end confidentiality, L4 only), or terminate and re-encrypt (zero-trust networks).</p>`
  },
  tradeoffs:{use:[`<b>Terminate at the LB/CDN</b> for L7 routing, WAF, caching and central certificate management`, `<b>Re-encrypt or mTLS</b> inside the network for zero-trust and compliance`], avoid:[`Manual certificate renewal`, `Long-lived certificates with no expiry monitoring`, `Disabling verification “temporarily” in service clients`], alt:[`TLS passthrough when the backend must hold the keys`, `A service mesh to automate mTLS between services`]},
  real:[
    {co:'Let’s Encrypt', tier:'confirmed', text:'A free, automated certificate authority built around the ACME protocol, issuing short-lived (90-day) certificates to encourage automated renewal.', src:'letsencrypt.org; RFC 8555 (ACME)'},
    {co:'Microsoft Teams', tier:'confirmed', text:'Suffered an outage in February 2020 after an authentication certificate was allowed to expire — a classic, preventable failure mode.', src:'Microsoft statements, February 2020'},
    {co:'Google Chrome', tier:'confirmed', text:'Began labelling all plain-HTTP pages “Not secure” in 2018 (Chrome 68), accelerating HTTPS adoption.', src:'Chromium blog (2018)'}
  ],
  mistakes:[`Letting certificates expire (no automation, no alerts)`, `Serving an incomplete chain (missing intermediate)`, `Turning off certificate verification in internal clients`, `Using 0-RTT for non-idempotent requests`],
  interview:[`Explain where TLS terminates in your design and why`, `Mention mTLS or a service mesh for service-to-service authentication`],
  tryit:{note:'Pick a scenario and watch the client’s verification steps pass or fail.', mount:host => certChecker(host)},
  sources:[`RFC 8446 (TLS 1.3)`, `RFC 8555 (ACME)`, `RFC 6962 (Certificate Transparency)`]
},
{
  id:'rest-graphql-grpc', title:'REST vs GraphQL vs gRPC', minutes:10, tags:['REST','GraphQL','gRPC','protobuf','API style'],
  summary:'REST: resources over HTTP, simple and cacheable. GraphQL: clients ask for exactly the fields they need. gRPC: fast, typed, binary RPC between services.',
  problem:`<p>The Swiggy-style home screen needs your profile, ten restaurants with ratings and offers, and your active order. With naive REST that’s a dozen calls on a 4G phone, and the restaurant endpoint returns 60 fields when the screen needs 5. Meanwhile internal services exchange millions of small messages per second, where parsing JSON costs real CPU.</p>`,
  intuition:`REST is ordering from a fixed menu — each dish has its own number. GraphQL is a buffet: one plate, filled with exactly what you want. gRPC is a factory’s pneumatic tubes between departments: very fast, strict canister sizes, and only between machines that agreed on the format.`,
  how:{
    steps:[`<b>REST:</b> resources as URLs (<code>/users/42/orders</code>), HTTP verbs, status codes. Simple, cache-friendly (GET), universally supported. Risk: over-/under-fetching and many round trips.`, `<b>GraphQL:</b> one endpoint and a typed schema; the client sends a query naming exactly the fields it needs. Great for many different clients; caching and query cost control are harder.`, `<b>gRPC:</b> services defined in Protocol Buffers; generated clients; binary messages over HTTP/2; built-in deadlines and streaming. Ideal service-to-service; browsers need gRPC-Web.`, `Many companies combine them: GraphQL or REST at the edge, gRPC inside.`],
    diagram:{title:'Same screen, two client strategies', w:780, h:280, alt:'A mobile app calls an API layer; with REST it makes several calls, with GraphQL one call that fans out internally via gRPC.',
      nodes:[{id:'app', type:'client', label:'Mobile app', x:80, y:140}, {id:'gw', type:'lb', label:'API layer', x:290, y:140}, {id:'u', type:'service', label:'Users svc', x:540, y:50}, {id:'r', type:'service', label:'Restaurants svc', x:560, y:140, w:150}, {id:'o', type:'service', label:'Orders svc', x:540, y:230}],
      edges:[{from:'app', to:'gw'}, {from:'gw', to:'u'}, {from:'gw', to:'r'}, {from:'gw', to:'o'}],
      steps:[
        {note:'<b>REST:</b> the app makes one call per resource — profile…', flow:[['app', 'gw', 'GET /me'], ['gw', 'u'], ['u', 'gw'], ['gw', 'app']], hl:['u']},
        {note:'…restaurants (60 fields each, needs 5)…', flow:[['app', 'gw', 'GET /restaurants'], ['gw', 'r'], ['r', 'gw'], ['gw', 'app', '120 KB']], hl:['r']},
        {note:'…and the active order. Three round trips on a mobile network.', flow:[['app', 'gw', 'GET /orders/active'], ['gw', 'o'], ['o', 'gw'], ['gw', 'app']], hl:['o']},
        {note:'<b>GraphQL:</b> one query naming exact fields. The server fans out internally (often via <b>gRPC</b>, fast inside the datacentre) and returns one small response.', flow:[['app', 'gw', 'POST /graphql'], ['gw', 'u', 'gRPC'], ['gw', 'r', 'gRPC'], ['gw', 'o', 'gRPC']], parallel:true, hl:['gw']},
        {note:'One round trip from the phone, ~4 KB instead of ~130 KB.', flow:[['gw', 'app', '4 KB JSON']], hl:['app']}
      ]},
    html:`${h.code('http', `GET /v1/restaurants/88?fields=name,rating HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJ...`, 'REST')}${h.code('graphql', `query HomeScreen {
  me { name }
  restaurants(near: {lat: 12.97, lng: 77.59}, first: 10) {
    name rating offers { title }
  }
  activeOrder { status eta }
}`, 'GraphQL')}${h.code('proto', `syntax = "proto3";
service Restaurants {
  rpc Get (GetRequest) returns (Restaurant);
  rpc Nearby (NearbyRequest) returns (stream Restaurant); // server streaming
}
message Restaurant { int64 id = 1; string name = 2; float rating = 3; }`, 'gRPC (restaurants.proto)')}`,
    deep:`<p><b>REST details:</b> GET, PUT and DELETE are idempotent; POST is not. Conditional requests (<code>ETag</code> + <code>If-None-Match</code>) make GETs cheap to revalidate. HATEOAS is rarely used in practice.</p><p><b>GraphQL details:</b> resolvers per field cause N+1 backend calls unless batched (DataLoader). Protect servers with depth/complexity limits and persisted queries; HTTP caching is harder because everything is a POST to one URL. Federation lets many teams contribute to one graph.</p><p><b>gRPC details:</b> protobuf evolves safely if you never reuse field numbers and only add optional fields. Deadlines propagate across calls so downstream work stops when the caller gives up. Because gRPC rides long-lived HTTP/2 connections, L4 load balancing pins all calls to one backend — use L7 (per-request) balancing or client-side balancing.</p>`
  },
  tradeoffs:{use:[`<b>REST:</b> public APIs, simple CRUD, cache-heavy reads`, `<b>GraphQL:</b> many client types with different data needs; aggregation for mobile`, `<b>gRPC:</b> internal service-to-service, low latency, streaming`], avoid:[`GraphQL for simple, cache-heavy public endpoints`, `gRPC directly from browsers without a proxy`, `Chatty REST from mobile with no aggregation`], alt:[`Backend-for-frontend endpoints`, `JSON-RPC for simple internal calls`, `Async events instead of synchronous calls where the caller doesn’t need an answer`]},
  real:[
    {co:'Facebook / Meta', tier:'confirmed', text:'Built GraphQL in 2012 for its mobile News Feed and open-sourced the specification in 2015.', src:'graphql.org history; Facebook Engineering (2015)'},
    {co:'GitHub', tier:'confirmed', text:'Offers both a REST API and a GraphQL API (public since 2016), letting integrators fetch nested data in a single request.', src:'GitHub Docs'},
    {co:'Google', tier:'confirmed', text:'Open-sourced gRPC in 2015 as the successor to its internal RPC system, Stubby.', src:'grpc.io; Google Developers blog (2015)'},
    {co:'Netflix', tier:'confirmed', text:'Moved its API to a federated GraphQL architecture so domain teams own their parts of one unified graph.', src:'Netflix Tech Blog, “How Netflix Scales its API with GraphQL Federation” (2020)'}
  ],
  mistakes:[`GraphQL without query cost limits (one query can scan the world)`, `N+1 resolvers without batching`, `Breaking protobuf compatibility by reusing field numbers`, `L4-balancing gRPC and wondering why one backend is hot`],
  interview:[`Justify the API style per boundary: public edge vs internal`, `Mention pagination, auth and idempotency regardless of style`],
  tryit:{note:'How many requests and bytes does one mobile screen cost with each approach?', mount:host => fetchCalc(host)},
  sources:[`Roy Fielding, dissertation (2000), chapter 5 (REST)`, `GraphQL specification`, `grpc.io documentation`, `Netflix Tech Blog (2020)`]
},
{
  id:'realtime-transports', title:'WebSockets, SSE, long polling and webhooks', minutes:10, tags:['WebSocket','SSE','long polling','webhooks','push'],
  summary:'Four ways for a server to tell someone that something happened — and what each costs at a million open apps.',
  problem:`<p>Food-delivery tracking: “Preparing → Picked up → Arriving”. If every app asks “any update?” every 2 seconds, 5 million open apps generate 2.5 million requests a second — almost all answered “no”. Ask every 60 seconds and updates feel late. How should the server push news?</p>`,
  intuition:`<b>Short polling</b>: a kid asking “are we there yet?” every minute. <b>Long polling</b>: asking once, and the parent answers only when you arrive (then you ask again). <b>SSE</b>: a radio station — the server talks, you listen. <b>WebSocket</b>: a phone call — either side talks any time. <b>Webhook</b>: “call this number when it’s ready” — for servers, not phones.`,
  how:{
    steps:[`<b>Short polling:</b> repeated requests on a timer. Trivial, but wasteful and delayed by up to one interval.`, `<b>Long polling:</b> the server holds the request open until there is news (or a timeout), then the client immediately re-asks. Near real-time over plain HTTP.`, `<b>SSE (Server-Sent Events):</b> one long-lived HTTP response streaming <code>text/event-stream</code>, server → client only, with automatic reconnect.`, `<b>WebSocket:</b> an HTTP connection upgraded to a full-duplex message channel. Both sides send whenever they want.`, `<b>Webhook:</b> server-to-server: your system POSTs to a URL the partner registered when an event occurs.`],
    diagram:{title:'Who speaks first?', w:780, h:280, alt:'Client and server exchanging messages via polling, long polling, SSE and WebSocket; a server sends a webhook to a partner.',
      nodes:[{id:'c', type:'client', label:'App', x:90, y:110}, {id:'s', type:'service', label:'Order service', x:420, y:110, w:140}, {id:'p', type:'ext', label:'Partner server', x:680, y:220, w:140}],
      edges:[{from:'c', to:'s'}, {from:'s', to:'p'}],
      steps:[
        {note:'<b>Short polling:</b> “Any news?” “No.” “Any news?” “No.” …', flow:[['c', 's', 'any news?'], ['s', 'c', 'no'], ['c', 's', 'any news?'], ['s', 'c', 'no']], dur:650},
        {note:'<b>Long polling:</b> the request waits on the server until something happens.', flow:[['c', 's', 'tell me when…']], dwell:1600},
        {note:'Order picked up! The held request is answered at once; the app re-asks immediately.', flow:[['s', 'c', 'picked_up'], ['c', 's', 'tell me when…']], hl:['s']},
        {note:'<b>SSE / WebSocket:</b> one long-lived connection; the server pushes events as they happen (and with WebSocket the app can send too).', flow:[['s', 'c', 'event: arriving'], ['s', 'c', 'event: delivered'], ['c', 's', 'ws: rate 5★']], hl:['c']},
        {note:'<b>Webhook:</b> the server notifies a partner’s server with a signed HTTP POST; the partner replies 2xx or the call is retried.', flow:[['s', 'p', 'POST /hooks'], ['p', 's', '200']], hl:['p']}
      ]},
    html:h.table(['Technique', 'Direction', 'Connection', 'Typical use'], [['Short polling', 'client asks', 'new request each time', 'rare updates, simple dashboards'], ['Long polling', 'client asks, server delays', 'one held request per update', 'fallback when others are blocked'], ['SSE', 'server → client', 'one long HTTP response', 'feeds, notifications, LLM token streaming'], ['WebSocket', 'both ways', 'one upgraded TCP connection', 'chat, multiplayer, collaborative editing'], ['Webhook', 'server → server', 'one POST per event', 'payments, CI, integrations']]),
    deep:`<p><b>WebSocket</b> starts as HTTP/1.1 with <code>Upgrade: websocket</code> and a <code>101 Switching Protocols</code> response (RFC 6455); RFC 8441 bootstraps WebSockets over HTTP/2. <b>SSE</b> reconnects automatically and sends <code>Last-Event-ID</code> so the server can resume; over HTTP/1.1 it is subject to the ~6 connections-per-host limit, which HTTP/2 removes.</p><p><b>Scaling persistent connections:</b> memory and file descriptors per connection, load-balancer idle timeouts (send heartbeats), sticky routing or a connection registry, and a pub/sub backbone (Redis, Kafka, NATS) so any server can deliver to the connection holder. Deploys must drain connections gradually to avoid reconnect storms.</p><p><b>Webhooks</b> need HMAC signatures (verify before trusting), timestamps against replay, retries with backoff, idempotent receivers (the same event may arrive twice) and no ordering assumptions.</p>`
  },
  tradeoffs:{use:[`<b>SSE</b> for one-way streams (notifications, live scores, LLM output)`, `<b>WebSocket</b> for interactive two-way (chat, games, co-editing)`, `<b>Webhooks</b> for cross-company server notifications`], avoid:[`Short polling at high frequency for millions of clients`, `WebSockets when one-way SSE would do (more complex infra)`, `Trusting unsigned webhooks`], alt:[`Mobile push notifications (APNs/FCM) when the app is in the background`, `MQTT for constrained IoT devices`]},
  real:[
    {co:'Slack', tier:'confirmed', text:'Delivers real-time events to clients and apps over WebSockets (e.g. the RTM API and Socket Mode).', src:'Slack API documentation'},
    {co:'OpenAI & Anthropic APIs', tier:'confirmed', text:'Stream generated tokens to clients using server-sent events when streaming is enabled.', src:'OpenAI and Anthropic API documentation'},
    {co:'Stripe', tier:'confirmed', text:'Sends webhooks signed with a <code>Stripe-Signature</code> header and, in live mode, retries failed deliveries with exponential backoff for up to three days.', src:'Stripe webhooks documentation'}
  ],
  mistakes:[`No heartbeats → load balancers silently drop idle connections`, `All clients reconnecting at once after a deploy (add jitter)`, `Webhook receivers that aren’t idempotent`, `Assuming webhook events arrive in order`],
  interview:[`Pick the transport by direction and frequency; justify with connection counts`, `Explain how a message reaches a user connected to a different server (pub/sub)`],
  tryit:{note:'Random order-status events arrive. Compare requests made and delivery delay for each technique.', mount:host => transportSim(host)},
  sources:[`RFC 6455 (WebSocket)`, `HTML Living Standard — Server-sent events`, `Slack, Stripe, OpenAI and Anthropic API documentation`]
},
{
  id:'api-design', title:'API design: versioning, pagination, errors, OpenAPI', minutes:10, tags:['API design','versioning','pagination','cursor','problem+json','OpenAPI'],
  summary:'An API is a contract. Add freely, break rarely, paginate with cursors, return consistent errors, and describe it all in an OpenAPI spec.',
  problem:`<p>Your public v1 API returns <code>price</code> as a floating-point rupee value. A large partner has integrated. Now you need integer paise, stable pagination for a feed that changes every second, and consistent errors. Change it carelessly and 300 partner apps break overnight.</p>`,
  intuition:`An API is like a railway timetable: people plan their lives around it. You can add new trains (additive changes) any time. Cancelling or moving one (a breaking change) needs notice, a new timetable version, and a long overlap while both run.`,
  how:{
    steps:[`<b>Resources</b> as plural nouns (<code>/orders/{id}/items</code>), verbs from HTTP, precise status codes (201 created, 400 bad input, 401/403, 404, 409 conflict, 422, 429, 5xx).`, `<b>Additive changes</b> (new optional fields, new endpoints) are safe. <b>Breaking changes</b> (rename, remove, change type or meaning) need a new version.`, `<b>Versioning</b>: in the path (<code>/v2/</code>), a header, or date-based versions pinned per client.`, `<b>Pagination</b>: offset/limit is simple but slow at depth and wrong when data changes; <b>cursor</b> (keyset) pagination is stable and fast.`, `<b>Errors</b>: one consistent shape with a machine-readable code (RFC 9457 <code>application/problem+json</code>).`, `<b>Money</b> as integers in minor units (paise), <b>times</b> as ISO-8601 UTC.`, `Describe everything in <b>OpenAPI</b> — the source for docs, client SDKs, mocks and contract tests.`],
    stepper:{title:'Evolving an API without breaking anyone', items:[
      {title:'Add', tag:'non-breaking', text:'Add <code>price_paise</code> (integer) alongside the old <code>price</code>. Old clients ignore unknown fields.'},
      {title:'Announce', tag:'deprecate', text:'Document the old field as deprecated; send <code>Deprecation</code> and <code>Sunset</code> headers (RFC 8594) with a date.'},
      {title:'Measure', tag:'telemetry', text:'Track which API keys still read the old field or call the old version. Contact them directly.'},
      {title:'Version', tag:'if breaking', text:'For true breaking changes, ship v2 (or a new date version) and run both side by side.'},
      {title:'Migrate', tag:'help', text:'SDK updates, changelogs, migration guides, sandbox testing.'},
      {title:'Remove', tag:'after sunset', text:'Only after usage is near zero and the sunset date has passed.'}
    ]},
    html:`${h.code('sql', `-- Offset: the database still reads and discards 100,000 rows
SELECT * FROM posts ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET 100000;

-- Cursor (keyset): jumps straight to the right place using the index
SELECT * FROM posts
WHERE (created_at, id) < ($cursor_created_at, $cursor_id)
ORDER BY created_at DESC, id DESC
LIMIT 20;`, 'pagination.sql')}${h.code('json', `HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json

{
  "type": "https://api.example.com/problems/insufficient-balance",
  "title": "Insufficient wallet balance",
  "status": 422,
  "detail": "Wallet has 12000 paise; order needs 49900.",
  "instance": "/orders/ord_81f2",
  "code": "INSUFFICIENT_BALANCE"
}`, 'RFC 9457 error body')}${h.code('yaml', `openapi: 3.1.0
info: { title: Orders API, version: "2024-06-01" }
paths:
  /orders:
    get:
      parameters:
        - { name: cursor, in: query, schema: { type: string } }
        - { name: limit,  in: query, schema: { type: integer, maximum: 100 } }
      responses:
        "200":
          description: A page of orders
          content:
            application/json:
              schema: { $ref: "#/components/schemas/OrderPage" }`, 'openapi.yaml')}`,
    deep:`<p><b>Cursors</b> should be opaque (e.g. base64 of the last sort key) so you can change their internals, and must include a unique tie-breaker (<code>id</code>) when the sort column isn’t unique. Total counts on huge tables are expensive — return <code>has_more</code> instead.</p><p><b>Compatibility discipline:</b> clients must be <i>tolerant readers</i> (ignore unknown fields, don’t depend on field order). Use consumer-driven contract tests (e.g. Pact) and spec linting (e.g. Spectral) in CI to catch breaking changes before release. Date-based versioning lets each client stay pinned to the behaviour it integrated against while the provider ships continuously, translating responses between versions internally.</p>`
  },
  tradeoffs:{use:[`<b>Cursor pagination</b> for feeds, large or fast-changing collections`, `<b>Offset</b> for small, stable lists where “jump to page 7” matters (admin tables)`, `<b>URI versions</b> for simplicity; <b>date versions</b> for continuously evolving public APIs`], avoid:[`Breaking changes without a version and a sunset period`, `Float money`, `Different error shapes per endpoint`], alt:[`GraphQL schema evolution with field deprecation`, `gRPC/protobuf field-number based evolution`]},
  real:[
    {co:'Stripe', tier:'confirmed', text:'Uses date-based API versions; each account is pinned to the version it integrated with, and requests can override it with the <code>Stripe-Version</code> header.', src:'Stripe API documentation — versioning'},
    {co:'Slack', tier:'confirmed', text:'Moved its Web API from offset/page-based to cursor-based pagination to keep results consistent and performant on large, changing collections.', src:'Slack Engineering, “Evolving API Pagination at Slack” (2017)'},
    {co:'GitHub', tier:'confirmed', text:'Versions its REST API by date via the <code>X-GitHub-Api-Version</code> header (first version 2022-11-28).', src:'GitHub Docs — API versions'}
  ],
  mistakes:[`Offset pagination on a live feed (duplicates and skips)`, `Removing fields without deprecation telemetry`, `200 OK with an error inside the body`, `Exposing internal database IDs or structure as the contract`],
  interview:[`Mention cursor pagination, idempotency keys and versioning when you write the API section`, `Use precise status codes and a consistent error body`],
  tryit:{note:'Read a feed page by page while new posts arrive. Watch offset pagination duplicate and skip items.', mount:host => paginationDemo(host)},
  sources:[`RFC 9457 (Problem Details)`, `RFC 8594 (Sunset header)`, `OpenAPI Specification 3.1`, `Slack Engineering (2017)`, `Stripe API docs`]
},
{
  id:'idempotency-rate-limit-headers', title:'Idempotency keys, safe retries and rate-limit headers', minutes:9, tags:['idempotency','retries','429','Retry-After','rate limit headers'],
  summary:'Networks lose responses, so clients retry. Idempotency keys make retries safe; rate-limit headers tell clients how fast they may go.',
  problem:`<p>A user taps <strong>Pay ₹499</strong>. The request reaches your server and the charge succeeds — but the response is lost in a tunnel. The app retries. Without protection, the customer pays twice. Separately, a partner’s script hammers your API: how do you tell it, politely and precisely, to slow down?</p>`,
  intuition:`An idempotency key is the token number at a sweet shop: come back with the same token and they hand you the same packed box instead of packing a new one. Rate-limit headers are the parking meter’s display: how many minutes you have left and when it resets.`,
  how:{
    steps:[`GET, PUT and DELETE are <b>idempotent</b> by definition — repeating them has the same effect. POST is not.`, `For POSTs that change money or state, the client generates a unique <b>Idempotency-Key</b> (e.g. a UUID) per logical operation and reuses it on every retry.`, `The server stores key → (request fingerprint, status, response) <b>atomically with the side effect</b>. A retry with the same key returns the stored response without re-executing.`, `Same key with a different body → reject (409/422). A concurrent duplicate while the first is still running → 409 or wait.`, `Keys expire after a window (e.g. 24 hours).`, `For rate limits, return <b>429 Too Many Requests</b> with <code>Retry-After</code> and headers for limit, remaining and reset. Well-behaved clients back off with jitter.`],
    diagram:{title:'Retry with an idempotency key', w:740, h:210, alt:'App posts a payment; the response is lost; the retry with the same key returns the stored result.',
      nodes:[{id:'a', type:'client', label:'App', x:80, y:105}, {id:'s', type:'service', label:'Payments API', x:360, y:105}, {id:'d', type:'db', label:'Ledger + keys', x:640, y:105}],
      edges:[{from:'a', to:'s'}, {from:'s', to:'d'}],
      steps:[
        {note:'POST /payments with <code>Idempotency-Key: 7f3a…</code>. The API inserts the charge <b>and</b> the key in one transaction.', flow:[['a', 's', 'POST + key'], ['s', 'd', 'BEGIN; charge; key; COMMIT']], hl:['d']},
        {note:'The response is <b>lost</b> on the way back.', flow:[['d', 's'], ['s', 'a', '✗ lost']], status:{a:'hot'}},
        {note:'The app times out and retries with the <b>same key</b>.', status:{a:'ok'}, flow:[['a', 's', 'POST + same key']], hl:['s']},
        {note:'The key exists → return the stored <b>201</b> response. No second charge.', flow:[['s', 'd', 'key?'], ['d', 's', 'seen'], ['s', 'a', '201 (stored)']], hl:['a']}
      ]},
    html:`${h.code('ts', `// Express-style handler (simplified). Assumes a UNIQUE index on idempotency_keys(account_id, key).
app.post('/payments', async (req, res) => {
  const key = req.header('Idempotency-Key');
  if (!key) return res.status(400).json({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
  const fingerprint = sha256(JSON.stringify(req.body));

  const result = await db.tx(async (tx) => {
    const prior = await tx.oneOrNone(
      'SELECT fingerprint, status, body FROM idempotency_keys WHERE account_id=$1 AND key=$2 FOR UPDATE',
      [req.accountId, key]);
    if (prior) {
      if (prior.fingerprint !== fingerprint) return { status: 422, body: { code: 'KEY_REUSED_WITH_DIFFERENT_BODY' } };
      return { status: prior.status, body: prior.body };          // replay: same answer, no new charge
    }
    const payment = await chargeAndRecord(tx, req.accountId, req.body); // side effect inside the same tx
    const body = { id: payment.id, status: 'succeeded' };
    await tx.none('INSERT INTO idempotency_keys(account_id, key, fingerprint, status, body, expires_at) VALUES ($1,$2,$3,201,$4, now() + interval \\'24 hours\\')',
      [req.accountId, key, fingerprint, body]);
    return { status: 201, body };
  });
  res.status(result.status).json(result.body);
});`, 'idempotent-payments.ts')}${h.code('http', `HTTP/1.1 429 Too Many Requests
Retry-After: 12
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1718000000`, 'rate-limited response')}`,
    deep:`<p><b>Atomicity is everything:</b> if the key is saved separately from the side effect, a crash between the two re-opens the double-charge window. Store both in one transaction, or record the key first in an <i>in-progress</i> state, then complete it. When the side effect is an external call (a bank), pass your own idempotency key downstream too.</p><p><b>At-least-once delivery + idempotent processing = effectively-once</b> — the same idea powers queue consumers (Module 7). Scope keys per account so one client can’t probe another’s keys.</p><p><b>Rate-limit headers:</b> <code>X-RateLimit-*</code> is a widespread convention; the IETF HTTPAPI working group has drafted standard <code>RateLimit</code> and <code>RateLimit-Policy</code> fields, and an <code>Idempotency-Key</code> header field. <code>Retry-After</code> (seconds or an HTTP date) is standard.</p>`
  },
  tradeoffs:{use:[`Idempotency keys on every POST that moves money, sends messages or creates orders`, `Rate-limit headers on any public or partner API`], avoid:[`Generating a new key per retry (defeats the purpose)`, `Storing keys outside the side-effect transaction`, `Retrying non-idempotent calls blindly`], alt:[`Natural idempotency: client-generated resource IDs with PUT`, `Deduplicating by a business key (order number) with a unique constraint`]},
  real:[
    {co:'Stripe', tier:'confirmed', text:'Accepts an <code>Idempotency-Key</code> header on POST requests and returns the saved result for retries with the same key; keys may be removed after they are at least 24 hours old.', src:'Stripe API documentation — idempotent requests'},
    {co:'GitHub', tier:'confirmed', text:'Returns <code>x-ratelimit-limit</code>, <code>-remaining</code>, <code>-used</code> and <code>-reset</code> headers; authenticated REST requests are typically limited to 5,000 per hour.', src:'GitHub Docs — rate limits for the REST API'},
    {co:'IETF', tier:'confirmed', text:'The HTTPAPI working group has Internet-Drafts standardising an <code>Idempotency-Key</code> header field and <code>RateLimit</code> header fields.', src:'IETF HTTPAPI working group drafts'}
  ],
  mistakes:[`New key per retry`, `Key stored after the response is sent`, `Retry storms: clients ignoring Retry-After and retrying instantly`, `Treating 429 as an error to alert on instead of a signal to slow down`],
  interview:[`Any payments or ordering design: say “idempotency key” early and explain where it is stored`, `Pair retries with exponential backoff, jitter and rate-limit awareness`],
  tryit:{note:'Pay with a flaky network, with and without an idempotency key. Then trip a rate limit and read the headers.', mount:(host, api) => idemDemo(host, api)},
  sources:[`Stripe API docs — idempotent requests`, `RFC 6585 (429 status)`, `IETF HTTPAPI drafts: Idempotency-Key, RateLimit header fields`]
},
{
  id:'proxies-gateway-bff', title:'Forward proxy, reverse proxy, API gateway and BFF', minutes:8, tags:['proxy','reverse proxy','API gateway','BFF','Envoy'],
  summary:'Proxies sit in the middle. Forward proxies act for clients; reverse proxies act for servers; API gateways add policy; BFFs tailor APIs per client type.',
  problem:`<p>Your mobile app, web app and partner API all call 25 microservices directly. Every service re-implements TLS, auth, rate limiting and logging; the mobile app makes 14 calls per screen; partners can see internal service names. You need a front door — and maybe more than one.</p>`,
  intuition:`A forward proxy is your office’s front desk making outside calls on your behalf (outsiders see the desk, not you). A reverse proxy is a hotel reception receiving every visitor and sending them to the right room (visitors never see the corridors). An API gateway is reception plus security check, visitor log and “maximum ten visitors an hour”. A BFF is a personal concierge per guest type who assembles exactly what that guest needs.`,
  how:{
    steps:[`<b>Forward proxy:</b> sits in front of clients; controls and logs outbound traffic, caches, hides client identity (corporate proxies, egress filtering).`, `<b>Reverse proxy:</b> sits in front of servers; TLS termination, load balancing, compression, caching, hiding internal topology (Nginx, HAProxy, Envoy).`, `<b>API gateway:</b> a reverse proxy specialised for APIs: authentication, rate limits, routing by path/version, request/response transformation, quotas, analytics.`, `<b>BFF (Backend for Frontend):</b> one thin backend per client type (mobile, web, TV) that aggregates services into screen-shaped responses; owned by the frontend team.`, `Keep business logic <b>out</b> of the gateway; it should stay a thin, highly available policy layer.`],
    diagram:{title:'North-south traffic through the front door', w:800, h:300, alt:'Mobile and web clients call their own BFFs through an API gateway into services; an office network reaches the internet via a forward proxy.',
      nodes:[{id:'m', type:'client', label:'Mobile app', x:70, y:70}, {id:'w', type:'client', label:'Web app', x:70, y:200}, {id:'gw', type:'lb', label:'API gateway', x:240, y:135}, {id:'bm', type:'service', label:'Mobile BFF', x:420, y:70}, {id:'bw', type:'service', label:'Web BFF', x:420, y:200}, {id:'s1', type:'service', label:'Orders', x:640, y:60, w:110}, {id:'s2', type:'service', label:'Catalog', x:640, y:140, w:110}, {id:'s3', type:'service', label:'Users', x:640, y:220, w:110}, {id:'fp', type:'ext', label:'Forward proxy', x:420, y:275, w:130, h:40}],
      edges:[{from:'m', to:'gw'}, {from:'w', to:'gw'}, {from:'gw', to:'bm'}, {from:'gw', to:'bw'}, {from:'bm', to:'s1'}, {from:'bm', to:'s2'}, {from:'bw', to:'s2'}, {from:'bw', to:'s3'}, {from:'s3', to:'fp', dashed:true, label:'egress'}],
      steps:[
        {note:'Every client enters through the <b>API gateway</b>: TLS, auth, rate limits, routing.', flow:[['m', 'gw', 'GET /home'], ['w', 'gw', 'GET /home']], parallel:true, hl:['gw']},
        {note:'The gateway routes to the right <b>BFF</b> for that client type.', flow:[['gw', 'bm'], ['gw', 'bw']], parallel:true, hl:['bm', 'bw']},
        {note:'Each BFF fans out to the services it needs and builds one screen-shaped response.', flow:[['bm', 's1'], ['bm', 's2'], ['bw', 's3']], parallel:true},
        {note:'Outbound calls from inside (e.g. to an SMS provider) leave through a <b>forward proxy</b> that enforces an allow-list.', flow:[['s3', 'fp', 'POST sms']], hl:['fp']}
      ]},
    deep:`<p><b>Gateway vs service mesh:</b> the gateway handles <i>north-south</i> traffic (outside → inside); a service mesh with sidecar proxies (often Envoy) handles <i>east-west</i> traffic between services: mTLS, retries, timeouts, telemetry (Module 10).</p><p><b>Availability:</b> the gateway is on every request’s path — run many stateless instances across zones, keep it free of slow synchronous dependencies (cache auth decisions/JWKS keys), and give it strict timeouts so one slow backend can’t exhaust it.</p><p><b>Forward proxies</b> are also a security control: an egress proxy with an allow-list stops a compromised service, or a server-side request forgery bug, from reaching arbitrary internal or external addresses.</p>`
  },
  tradeoffs:{use:[`<b>Gateway</b> once you have several services or external consumers`, `<b>BFF</b> when clients need very different data shapes or release cadences`], avoid:[`Business logic in the gateway`, `One shared “BFF” for all clients (it becomes a monolith of special cases)`, `A gateway with no redundancy`], alt:[`GraphQL as a single flexible BFF layer`, `Client-side aggregation for internal tools`, `Service mesh for east-west concerns`]},
  real:[
    {co:'Netflix', tier:'confirmed', text:'Built and open-sourced Zuul, its edge gateway handling routing, resilience and dynamic filters for API traffic.', src:'Netflix Tech Blog — Zuul / Zuul 2'},
    {co:'SoundCloud', tier:'confirmed', text:'The Backend-for-Frontend pattern emerged there (described by Phil Calçado) and was popularised by Sam Newman’s 2015 article.', src:'Sam Newman, “Backends For Frontends” (2015)'},
    {co:'Lyft', tier:'confirmed', text:'Created the Envoy proxy and open-sourced it in 2016; it is now a CNCF project used as an edge proxy and as the sidecar in many service meshes.', src:'Lyft Engineering; envoyproxy.io'}
  ],
  mistakes:[`Gateway as a dumping ground for business rules`, `Auth checks that call a slow service synchronously on every request`, `No egress control — any service can call anything on the internet`],
  interview:[`Draw the gateway early and list its responsibilities in one breath`, `Distinguish north-south (gateway) from east-west (mesh)`],
  tryit:{note:'Classify each responsibility.', mount:host => sortGame(host, [
    {t:'Restrict which external domains internal servers may call', c:'f', why:'Outbound control on behalf of clients is a forward proxy job.'},
    {t:'Terminate TLS and spread requests across web servers', c:'r', why:'Classic reverse proxy / load balancer duty.'},
    {t:'Verify API keys and enforce 1,000 requests/minute per partner', c:'g', why:'Auth + quotas per consumer = API gateway.'},
    {t:'Combine profile, cart and offers into one mobile home-screen response', c:'b', why:'Screen-shaped aggregation for one client type = BFF.'},
    {t:'Cache static responses and compress them for clients', c:'r', why:'A reverse proxy capability (Nginx, Varnish, CDNs).'},
    {t:'Route /v2/orders to the new orders service', c:'g', why:'Version- and path-based API routing is gateway work.'},
    {t:'Return smaller images and fewer fields for the TV app', c:'b', why:'Per-client tailoring belongs in that client’s BFF.'}
  ], [{id:'f', label:'Forward proxy'}, {id:'r', label:'Reverse proxy'}, {id:'g', label:'API gateway'}, {id:'b', label:'BFF'}])},
  sources:[`Sam Newman, “Backends For Frontends” (2015)`, `Netflix Tech Blog — Zuul`, `envoyproxy.io documentation`]
}
];

SDA.register({
  kind:'module', id:'networking', order:2, level:'beginner', icon:'🔌', title:'Networking & APIs',
  summary:'IP and DNS, TCP vs UDP, HTTP/1.1→2→3, TLS, REST/GraphQL/gRPC, real-time transports, API design, idempotency and rate-limit headers, proxies, gateways and BFFs.',
  outcomes:['Explain DNS resolution, TTLs and safe migrations', 'Choose TCP vs UDP and HTTP/2 vs HTTP/3 with reasons', 'Describe the TLS handshake and where TLS should terminate', 'Pick REST, GraphQL or gRPC per boundary, and SSE vs WebSocket vs webhooks', 'Design APIs with versioning, cursor pagination, idempotency keys and consistent errors'],
  lessons,
  quiz:[
    {q:'You will change a DNS record whose TTL is 24 hours. What should you do first?', options:['Change it and immediately shut down the old server', 'Lower the TTL (e.g. to 60 s) at least 24 hours before the change', 'Raise the TTL so the change sticks', 'Nothing — DNS changes are instant'], answer:1, why:'Resolvers may hold the old answer for up to the old TTL. Lower it well ahead, switch, then keep the old server until traffic drains.'},
    {q:'Why does a single lost packet hurt HTTP/2 more than HTTP/3?', options:['HTTP/2 has no encryption', 'HTTP/2 streams share one TCP connection, so TCP’s in-order delivery stalls all of them', 'HTTP/3 never loses packets', 'HTTP/2 uses UDP'], answer:1, why:'Transport-level head-of-line blocking. QUIC recovers loss per stream.'},
    {q:'Which use case suits UDP best?', options:['Bank transfer API', 'Database replication', 'Live voice call audio', 'Downloading a software update'], answer:2, why:'A late audio frame is useless; low latency beats completeness.'},
    {q:'What does the server’s CertificateVerify message prove?', options:['The certificate has not expired', 'The server holds the private key matching the certificate', 'The client is authenticated', 'The cipher suite is secure'], answer:1, why:'Anyone can copy a public certificate; only the key holder can sign the handshake transcript.'},
    {q:'Your feed changes every second and users scroll deep. Which pagination?', options:['Offset/limit', 'Page numbers', 'Cursor (keyset) pagination', 'Return everything at once'], answer:2, why:'Cursor pagination is stable under inserts/deletes and uses the index instead of skipping rows.'},
    {q:'A client retries POST /payments after a timeout. What prevents a double charge?', options:['Using HTTPS', 'An Idempotency-Key stored atomically with the charge', 'Returning 500 on the retry', 'Using GET instead'], answer:1, why:'The server recognises the repeated key and returns the stored result instead of executing again.'},
    {q:'Which transport fits streaming LLM tokens from server to browser?', options:['Webhooks', 'Server-Sent Events', 'Short polling every 5 s', 'SMTP'], answer:1, why:'One-way server → client stream over plain HTTP with auto-reconnect.'},
    {q:'You L4-load-balance gRPC traffic and one backend is overloaded. Most likely cause?', options:['Protobuf is slow', 'Long-lived HTTP/2 connections pin all calls on a connection to one backend', 'gRPC doesn’t support load balancing', 'TLS is misconfigured'], answer:1, why:'L4 balances connections, not requests. Use L7 or client-side per-request balancing.'},
    {q:'Which HTTP status tells a client to slow down?', options:['400', '403', '429 with Retry-After', '503 with no headers'], answer:2, why:'RFC 6585 defines 429 Too Many Requests; Retry-After says when to retry.'},
    {q:'Where should business logic live in a gateway + BFF design?', options:['In the API gateway', 'In the services (and screen-specific aggregation in BFFs)', 'In the forward proxy', 'In DNS'], answer:1, why:'Keep the gateway thin and policy-focused; services own domain logic.'},
    {type:'scenario', q:'Design real-time order tracking for 5 million concurrently open food-delivery apps.', answer:'<ul><li><b>Transport:</b> SSE (one-way updates) or WebSocket if the app also sends (chat with rider). Fall back to long polling; use push notifications (APNs/FCM) when the app is backgrounded.</li><li><b>Edge:</b> a fleet of connection servers behind an L4/L7 LB with long idle timeouts and heartbeats every ~30 s; ~50–100K connections per node → roughly 50–100 nodes.</li><li><b>Routing:</b> order-status events go to a pub/sub backbone (Kafka → per-node subscribers, or Redis pub/sub keyed by order ID); a registry maps user → connection server.</li><li><b>Resilience:</b> on reconnect the client sends its last event ID and the server replays missed events from a short-lived store; drain connections gradually during deploys with jittered reconnects.</li><li><b>Cost check:</b> short polling at 5 s would be 1M req/s of mostly “no news”.</li></ul>'},
    {type:'scenario', q:'You must rename a widely used field in a public API with 300 partners. Plan the change.', answer:'<ol><li>Add the new field alongside the old one (additive, non-breaking).</li><li>Mark the old field deprecated in the OpenAPI spec and docs; send <code>Deprecation</code>/<code>Sunset</code> headers.</li><li>Instrument usage per API key; contact heavy users; update SDKs.</li><li>If behaviour must change incompatibly, ship a new version (path or date-based) and run both.</li><li>Add contract tests and spec linting in CI so this can’t happen accidentally.</li><li>Remove the old field only after the sunset date and near-zero usage.</li></ol>'}
  ],
  flashcards:[
    {front:'DNS TTL', back:'How long resolvers may cache an answer. Lower it before migrations.'},
    {front:'A vs CNAME record', back:'A maps a name to an IPv4 address; CNAME aliases one name to another (not allowed at the zone apex).'},
    {front:'TCP head-of-line blocking', back:'A lost packet stalls all later data on that connection until retransmitted, because TCP delivers in order.'},
    {front:'HTTP/2 vs HTTP/3', back:'HTTP/2 multiplexes streams over one TCP connection; HTTP/3 does it over QUIC (UDP) with per-stream loss recovery and a 1-RTT handshake.'},
    {front:'TLS 1.3 handshake cost', back:'1 round trip (0 with resumption, replay-unsafe).'},
    {front:'Forward secrecy', back:'Ephemeral key exchange: a stolen long-term key can’t decrypt past recorded sessions.'},
    {front:'mTLS', back:'Both client and server present certificates — service-to-service authentication.'},
    {front:'GraphQL N+1 problem', back:'Per-field resolvers trigger one backend call per item; fix with DataLoader-style batching.'},
    {front:'SSE vs WebSocket', back:'SSE: one-way server→client over HTTP with auto-reconnect. WebSocket: full-duplex after an HTTP upgrade.'},
    {front:'Cursor pagination', back:'WHERE (sort_key, id) < cursor ORDER BY … LIMIT n — stable and index-friendly.'},
    {front:'Idempotency key', back:'Client-generated unique key per operation; server stores it atomically with the side effect and replays the stored response.'},
    {front:'429 + Retry-After', back:'Too Many Requests; tells the client when it may retry.'},
    {front:'API gateway vs BFF', back:'Gateway: shared policy layer (auth, quotas, routing). BFF: per-client aggregation backend.'}
  ],
  cheatsheet:[
    {h:'🌍 IP & DNS', items:['IPv4 32-bit, IPv6 128-bit; NAT for private ranges', 'Records: A, AAAA, CNAME, MX, TXT, NS', 'Resolution: stub → resolver → root → TLD → authoritative', 'Lower TTL ≥ 1 old-TTL before a change', 'DNS = first, coarse load balancer']},
    {h:'🚚 Transport', items:['TCP: ordered, reliable, congestion-controlled', 'UDP: datagrams, no order, no retransmit', 'HOL blocking: loss stalls later data (TCP)', 'Pool connections; beware TIME_WAIT & port exhaustion', 'QUIC = reliable streams over UDP']},
    {h:'🌐 HTTP versions', items:['1.1: ~6 conns/host, one request at a time each', '2: binary, multiplexed, HPACK, one TCP conn', '3: QUIC, per-stream recovery, 1-RTT, conn migration', 'ALPN / Alt-Svc negotiate versions', 'Long-lived conns → balance per request (L7)']},
    {h:'🔒 TLS', items:['Privacy + integrity + authenticity', 'Chain to trusted root; hostname in SAN; dates; revocation', 'ECDHE → forward secrecy; AEAD ciphers', 'Terminate at edge; re-encrypt/mTLS inside', 'Automate certs (ACME) + expiry alerts']},
    {h:'🧩 API styles & push', items:['REST: resources, verbs, cacheable GETs', 'GraphQL: exact fields; watch N+1 & query cost', 'gRPC: protobuf over HTTP/2, deadlines, streaming', 'SSE one-way · WebSocket two-way · webhook server→server', 'Sign + retry + dedupe webhooks']},
    {h:'📐 API design', items:['Additive changes free; breaking → new version', 'Cursor pagination for feeds', 'Errors: RFC 9457 problem+json + machine code', 'Money in minor units; times ISO-8601 UTC', 'Idempotency-Key on state-changing POSTs', '429 + Retry-After + rate-limit headers', 'OpenAPI as the single source of truth']}
  ],
  glossary:[
    {term:'IP address', def:'A numeric network address for a host: 32-bit in IPv4, 128-bit in IPv6.'},
    {term:'IPv6', def:'The 128-bit successor to IPv4, with a vastly larger address space.'},
    {term:'NAT', aka:['network address translation', 'carrier-grade NAT', 'CGNAT'], def:'Network Address Translation: many private addresses share one public IP; carrier-grade NAT does this at ISP scale.'},
    {term:'Port', def:'A 16-bit number identifying a service on a host, e.g. 443 for HTTPS.'},
    {term:'TTL', aka:['time to live'], def:'Time To Live: how long a cached answer (DNS record, cache entry) remains valid.'},
    {term:'CNAME', def:'A DNS record that aliases one name to another name.'},
    {term:'Recursive resolver', aka:['DNS resolver'], def:'The DNS server that walks the hierarchy on a client’s behalf and caches answers.'},
    {term:'TCP', def:'Transmission Control Protocol: reliable, ordered, congestion-controlled byte streams.'},
    {term:'UDP', def:'User Datagram Protocol: connectionless datagrams with no delivery or ordering guarantees.'},
    {term:'Head-of-line blocking', aka:['HOL blocking'], def:'When one delayed or lost item holds up everything queued behind it.'},
    {term:'Congestion control', def:'TCP/QUIC algorithms (Reno, CUBIC, BBR) that adapt sending rate to avoid overloading the network.'},
    {term:'HTTP/2', def:'Binary, multiplexed HTTP over a single TCP connection with HPACK header compression.'},
    {term:'HTTP/3', def:'HTTP over QUIC (UDP), with independent streams and faster handshakes.'},
    {term:'Multiplexing', def:'Sending many independent streams over one connection at the same time.'},
    {term:'Certificate authority', aka:['CA'], def:'A trusted organisation that signs certificates binding domain names to public keys.'},
    {term:'Forward secrecy', def:'Property where compromising a long-term key does not expose past session traffic.'},
    {term:'mTLS', aka:['mutual TLS'], def:'TLS in which both client and server authenticate with certificates.'},
    {term:'REST', def:'An architectural style exposing resources at URLs and manipulating them with standard HTTP methods.'},
    {term:'GraphQL', def:'A query language and runtime where clients request exactly the fields they need from a typed schema.'},
    {term:'gRPC', def:'An RPC framework using Protocol Buffers over HTTP/2, with code generation, deadlines and streaming.'},
    {term:'Protocol Buffers', aka:['protobuf'], def:'Google’s compact binary serialisation format with schema-based evolution via field numbers.'},
    {term:'WebSocket', aka:['WebSockets'], def:'A full-duplex message channel created by upgrading an HTTP connection (RFC 6455).'},
    {term:'Server-Sent Events', aka:['SSE'], def:'A one-way server-to-client event stream over a long-lived HTTP response.'},
    {term:'Long polling', def:'Holding a client request open until data is available, then responding and letting the client re-ask.'},
    {term:'Webhook', aka:['webhooks'], def:'An HTTP callback: a server POSTs to a registered URL when an event happens.'},
    {term:'Cursor pagination', aka:['keyset pagination'], def:'Paging by “items after this sort key” rather than by numeric offset; stable and index-friendly.'},
    {term:'Idempotency', aka:['idempotent'], def:'An operation that has the same effect whether applied once or many times.'},
    {term:'Idempotency key', aka:['Idempotency-Key'], def:'A client-supplied unique key that lets a server recognise and safely replay retried requests.'},
    {term:'OpenAPI', aka:['Swagger'], def:'A standard, machine-readable description format for HTTP APIs (formerly Swagger).'},
    {term:'Reverse proxy', def:'A server in front of backends that receives client requests and forwards them (TLS, balancing, caching).'},
    {term:'Forward proxy', def:'A proxy acting on behalf of clients for outbound requests (filtering, caching, egress control).'},
    {term:'API gateway', def:'A reverse proxy specialised for APIs: authentication, rate limiting, routing, quotas and analytics.'},
    {term:'BFF', aka:['backend for frontend'], def:'Backend For Frontend: a client-specific backend that aggregates services into the shapes one client needs.'}
  ],
  sources:['RFC 1034/1035, 9293, 768, 8446, 9000, 9110–9114, 6455, 9457, 6585, 8594', 'Ilya Grigorik, “High Performance Browser Networking”', 'Stripe, GitHub, Slack and Netflix engineering documentation and blogs cited per lesson']
});
} catch(e){ console.error('[SDA] Module "networking" failed to load', e); window.SDA && SDA.errors.push({id:'networking', error:e}); }
})();
