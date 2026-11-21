
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
  function show(x){ const f = frac(x); chart.set(x, `${x.toFixed(1)}h → ${f.toFixed(1)}%`); info.className = 'verdict ' + (f < 1 ? 'ok' : f < 20 ? 'warn' : 'bad'); info.textContent = f < 1 ? `After ${x.toFixed(1)} hours, fewer than 1% still reach the old server. Check its traffic before shutting it down.` : `After ${x.toFixed(1)} hours, ${f.toFixed(1)}% still reach the old server. Shutting it down now would give them errors.`; }
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
    el('div', {class:'lab-hint'}, 'TCP: green pieces reached the app. Amber pieces arrived but wait for an earlier missing piece.'), tcpRow,
    el('div', {class:'lab-hint', style:{marginTop:'10px'}}, 'UDP: green pieces arrived. A red mark means this model lost the piece.'), udpRow,
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
    valid:[-1, '🔒 Every check passed. The browser and site can protect their traffic.'],
    expired:[2, 'The certificate expired. The food site must renew it before customers can trust this connection.'],
    host:[3, 'The certificate names another site. A certificate for orders.example.com cannot prove the identity of food.example.com.'],
    self:[0, 'The browser does not trust the certificate issuer. This may work for a local test, but not for customer checkout.'],
    inter:[0, 'The certificate chain is incomplete. The server did not provide the issuer information some clients need.'],
    revoked:[4, 'The certificate was revoked by its issuer and can no longer be trusted.'],
    mitm:[5, 'The presenter copied a public certificate but cannot prove it has the matching private key.']
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
      ['REST with separate URLs', 2 + n, 2, 2 * full + 2 * n * full, 'not shown', 'Several phone calls return more fields than this screen needs.'],
      ['REST with one screen endpoint', 1, 1, (1 + 2 * n) * slim, 'not shown', 'One phone call returns fields chosen for this screen.'],
      ['GraphQL', 1, 1, (1 + 2 * n) * slim, P.loader ? '3 grouped' : String(2 + n), P.loader ? 'The server groups restaurant lookups into one request.' : 'The phone asks for selected fields, but the server still makes many restaurant lookups.'],
      ['gRPC between services', 1, 1, Math.round((1 + 2 * n) * slim * .4), 'not shown', 'Compact messages can help services exchange these fields internally.']
    ];
    out.innerHTML = '';
    out.append(frag(h.table(['Approach', 'Client requests', 'Round trips', 'Bytes to client', 'Backend calls', 'Notes'], rows.map(r => [`<b>${r[0]}</b>`, r[1], r[2], fmtBytes(r[3]), r[4], r[5]]), [1, 2, 3])));
    out.append(el('p', {class:'lab-hint'}, `This model sends separate REST requests in two waves, so their network wait is about ${2 * P.rtt} ms at ${P.rtt} ms per trip. The one-call choices wait for about one trip. The byte sizes are teaching estimates.`));
  }
  const a = ui.slider({label:'Orders on the screen', min:1, max:20, step:1, value:5, fmt:v => v, onInput:v => { P.n = v; calc(); }});
  const b = ui.slider({label:'Mobile round-trip time', min:20, max:400, step:10, value:80, fmt:v => v + ' ms', onInput:v => { P.rtt = v; calc(); }});
  const c = ui.toggle({label:'GraphQL server uses DataLoader batching', checked:false, onChange:v => { P.loader = v; calc(); }});
  host.append(el('p', {class:'muted', style:{marginTop:0}}, 'The food app needs your name, recent orders, and each restaurant name.'), el('div', {class:'ctl-grid'}, a.el, b.el), el('div', {style:{margin:'10px 0'}}, c.el), out); calc();
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
  const reset = () => { feed = []; for (let i = 30; i >= 1; i--) feed.push({id:i}); next = 31; offA = 0; seenA = []; curB = null; seenB = []; render(); msg.className = 'verdict warn'; msg.textContent = 'Load page 1 of restaurant orders. Then add or remove an order before loading page 2.'; };
  const pageA = () => { const p = feed.slice(offA, offA + 5); offA += 5; p.forEach(x => seenA.push({id:x.id, dup:seenA.some(s => s.id === x.id)})); };
  const pageB = () => { const p = feed.filter(x => curB == null || x.id < curB).slice(0, 5); if (p.length) curB = p[p.length - 1].id; p.forEach(x => seenB.push({id:x.id, dup:false})); };
  const skipped = seen => { const ids = seen.map(s => s.id); if (!ids.length) return []; const lo = Math.min(...ids), hi = Math.max(...ids); return feed.filter(f => f.id > lo && f.id < hi && !ids.includes(f.id) && f.id < 31).map(f => f.id); };
  function col(target, seen, title){ target.innerHTML = ''; target.append(el('b', null, title)); const sk = skipped(seen); target.append(el('div', {class:'pill-row'}, ...seen.map(s => el('span', {class:'chip mono', style:s.dup ? {borderColor:'var(--bad)', color:'var(--bad)'} : null}, `#${s.id}${s.dup ? ' repeat' : ''}`)))); if (sk.length) target.append(el('div', {class:'lab-hint', style:{color:'var(--bad)'}}, `Orders never shown: ${sk.map(x => '#' + x).join(', ')}`)); }
  function render(){ col(colA, seenA, 'Numbered offset pages'); col(colB, seenB, 'Cursor pages'); }
  const load = () => { pageA(); pageB(); render(); const d = seenA.filter(s => s.dup).length; const sk = skipped(seenA).length; msg.className = 'verdict ' + (d || sk ? 'bad' : 'ok'); msg.textContent = d || sk ? `Offset pages repeated ${d} order(s) and skipped ${sk}. Cursor pages continue after the last order seen.` : 'Both look correct so far. Add or remove an order before the next page.'; };
  host.append(el('div', {class:'controls'}, ui.button('📄 Load next page', load, 'sm primary'), ui.button('🆕 Add 2 new orders at the top', () => { feed.unshift({id:next++}, {id:next++}); feed.sort((a, b) => b.id - a.id); msg.textContent = 'Two new orders are at the top. Now load the next page.'; }, 'sm'), ui.button('🗑 Remove an order you saw', () => { const s = seenA[seenA.length - 1]; if (!s){ msg.textContent = 'Load a page first.'; return; } feed = feed.filter(f => f.id !== s.id); msg.textContent = `Order #${s.id} removed. Load the next page.`; }, 'sm'), ui.button('↺ Reset', reset, 'sm ghost')), el('div', {style:{height:'10px'}}), msg, el('div', {class:'grid c2', style:{marginTop:'12px'}}, el('div', {class:'card'}, colA), el('div', {class:'card'}, colB)));
  reset();
}
function idemDemo(host, api){
  let lost = true, useKey = false, busy = false, n = 0; const ledger = el('div', {class:'stack'}); const store = new Map();
  const holder = el('div');
  const d = new api.Diagram(holder, {title:'Pay ₹499 through a weak connection', w:720, h:200, alt:'The food app asks the payment server to record a charge. The response may be lost before the app can read it.', nodes:[{id:'app', type:'client', label:'Food app', x:80, y:100}, {id:'api', type:'service', label:'Payment server', x:340, y:100}, {id:'db', type:'db', label:'Charges + keys', x:600, y:100}], edges:[{from:'app', to:'api'}, {from:'api', to:'db'}], caption:'Press <b>Pay</b>. The first answer may get lost, so the app tries again.'});
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
  summary:'An IP address names a destination on a network. A port identifies a program there. DNS turns a readable site name into an address.',
  problem:`<h3>A small example</h3><p>A customer opens a food delivery site to browse restaurants. The browser knows the site name, but it needs an address.</p><ul><li>Site name: food.example.com</li><li>One server address</li><li>A web program listening on port 443</li></ul><p>How does the browser find the right server and program?</p>`,
  intuition:`An IP address is like a building address. A port is the room number. DNS works like a contact list that finds the address behind a name.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the browser as it finds food.example.com.</p>',
    steps:[
      {icon:'🏠', title:'Start with a name', text:'The customer enters food.example.com. The browser needs a numeric IP address to reach it.'},
      {icon:'📇', title:'Ask DNS', text:'DNS, the domain name system, looks up the address behind that site name.'},
      {icon:'🔎', title:'Follow the lookup', text:'A resolver, a server that finds DNS answers, asks which server knows the food site’s address.'},
      {icon:'📍', title:'Use the answer', text:'The browser receives an IP address and contacts it. Port 443 selects the web program on that server.'},
      {icon:'⏳', title:'Keep the answer briefly', text:'DNS answers have a time to live, or TTL. Until it expires, a saved address may still point to an old server.'}
    ],
    diagram:{title:'Finding food.example.com', w:780, h:280, alt:'The browser asks a resolver for the food site address. The resolver asks the root, .com, and the site owner in order.',
      nodes:[{id:'b', type:'client', label:'Browser', x:80, y:140}, {id:'r', type:'ext', label:'DNS resolver', x:290, y:140, w:150}, {id:'root', type:'ext', label:'Root', x:560, y:45}, {id:'tld', type:'ext', label:'.com guide', x:600, y:140}, {id:'auth', type:'ext', label:'Site owner DNS', x:560, y:235, w:140}],
      edges:[{from:'b', to:'r'}, {from:'r', to:'root'}, {from:'r', to:'tld'}, {from:'r', to:'auth'}],
      steps:[
        {note:'The browser asks a resolver for food.example.com.', flow:[['b', 'r', 'food.example.com?']], hl:['r']},
        {note:'The root points the resolver toward names ending in .com.', flow:[['r', 'root', '.com?'], ['root', 'r', 'ask .com']], hl:['root']},
        {note:'The .com guide points toward the owner of example.com.', flow:[['r', 'tld', 'example.com?'], ['tld', 'r', 'ask owner']], hl:['tld']},
        {note:'The site owner gives an address and a 300-second TTL.', flow:[['r', 'auth', 'food?'], ['auth', 'r', '203.0.113.7 TTL 300']], hl:['auth']},
        {note:'The resolver saves that answer for its TTL and replies to the browser.', flow:[['r', 'b', '203.0.113.7']], hl:['b', 'r']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Address book', 'Food site'], [['Contact name', 'food.example.com'], ['Street address', 'Server IP address'], ['Room number', 'Port 443']])}</div><div class="callout tip"><b>Important point</b><p>A site name can stay the same even when its server address changes. Saved DNS answers take time to expire.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Before moving servers', 'Reason'], [['Lower the TTL early', 'Saved old answers expire sooner.'], ['Keep the old server running', 'Some browsers may still use its address.'], ['Watch traffic to the old address', 'Shut it down after requests stop.']])}</div>`,
    deep:`<h4>The numbers</h4><p>An IPv4 address has 32 bits, so there are 2 to the power of 32, which is 4,294,967,296 addresses, about 4.3 billion. A port has 16 bits, so there are 65,536 ports, numbered 0 to 65,535.</p><p>Say the food site has a TTL of 3,600 seconds. A resolver that saved the answer one second ago keeps it for 3,599 more seconds. To move safely, lower the TTL to 60 seconds first. Then wait 3,600 seconds so every old answer expires. After the move, a stale answer lasts at most 60 seconds.</p><h4>When it goes wrong</h4><p>Say a visitor looks up food.example.com before you create its record. The resolver may save the answer "no such name" for a few minutes. If you add the record right after, that visitor still sees an error until the saved answer expires. Create new names before you share them.</p><h4>How it works inside</h4><p>A full lookup has three steps. A root server points to the .com servers. A .com server points to the food site's own name servers. Those give the IP address. Resolvers save each step, so most lookups skip straight to the last one.</p>`
  },
  tradeoffs:{use:[`For the food site move, lower the TTL before changing the address.`, `Keep the old food server running until requests to it stop.`], avoid:[`Do not put a fixed IP address in the food app if the server may move.`, `Do not assume every saved DNS answer changes the moment the record changes.`], alt:[`If the site address stays stable, change the server behind that address instead of asking browsers to learn a new one.`]},
  real:[
    {co:'Root server system', tier:'confirmed', text:'Root servers help resolvers find who handles names ending in .com and other endings.', src:'root-servers.org'},
    {co:'Cloudflare', tier:'confirmed', text:'Cloudflare offers a public DNS resolver that can look up site addresses for clients.', src:'Cloudflare 1.1.1.1 documentation'}
  ],
  mistakes:[`Turning off the old food server immediately after changing DNS.`, `Treating a port and an IP address as the same thing.`],
  interview:[`Trace the site name to an address, then explain what port 443 selects.`, `Explain why a saved DNS answer can send customers to the old server.`],
  tryit:[{quiz:[
    {q:'What does DNS give the browser for food.example.com?', options:['A new password', 'A server address', 'A restaurant menu', 'A payment receipt'], answer:1, why:'DNS turns the readable name into an address.'},
    {q:'Why keep the old food server running after a DNS change?', options:['The name has been deleted', 'All browsers change together', 'Some saved answers still point to it', 'Port 443 stops working forever'], answer:2, why:'Saved answers can last until their TTL expires or longer.'}
  ]}, {note:'Change the DNS TTL and watch how many customers still reach the old address after the move.', mount:(host, api) => ttlSim(host, api)}],
  sources:[`RFC 1034 and RFC 1035`, `root-servers.org`, `Cloudflare 1.1.1.1 documentation`]
},
{
  id:'tcp-vs-udp', title:'TCP vs UDP', minutes:8, tags:['TCP','UDP','head-of-line blocking','congestion control'],
  summary:'TCP delivers data in order and resends missing pieces. UDP sends separate pieces without promising delivery or order. The app chooses based on what matters.',
  problem:`<h3>A small example</h3><p>A food delivery app handles both a payment and a voice call with the rider.</p><ul><li>The payment must arrive correctly once.</li><li>The call needs the latest sound quickly.</li><li>A network packet may get lost.</li></ul><p>Should both kinds of data wait for a missing piece?</p>`,
  intuition:`TCP is tracked mail that resends a missing page before the reader continues. UDP is a live radio message. If a moment is lost, the next moment can still play.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Send three pieces of data and let the second one get lost.</p>',
    steps:[
      {icon:'📦', title:'Split data into pieces', text:'Networks carry small packets. A payment message or voice call may need several.'},
      {icon:'🤝', title:'TCP checks delivery', text:'TCP numbers the data and asks the receiver to confirm it arrived.'},
      {icon:'🔁', title:'TCP fills the gap', text:'If piece 2 is lost, TCP resends it. The app waits before receiving later pieces in order.'},
      {icon:'📡', title:'UDP sends each piece', text:'UDP sends pieces without built-in resending or ordering. The voice app can play the next sound even after one is lost.'},
      {icon:'⚖️', title:'Choose by the need', text:'Use reliable ordered delivery for payment data. Use a voice transport that favors fresh sound during a call.'}
    ],
    diagram:{title:'One lost segment under TCP', w:740, h:220, alt:'A sender sends segments 1 to 3; segment 2 is lost and retransmitted, and segment 3 waits for it.',
      nodes:[{id:'s', type:'client', label:'Customer app', x:80, y:110}, {id:'n', type:'ext', label:'Network', x:370, y:110}, {id:'r', type:'service', label:'Food server', x:650, y:110}],
      edges:[{from:'s', to:'n'}, {from:'n', to:'r'}],
      steps:[
        {note:'The first part of the payment message arrives.', flow:[['s', 'n', 'part 1'], ['n', 'r', 'part 1']], hl:['r']},
        {note:'The second part is lost on the network.', flow:[['s', 'n', 'part 2 ✗']], status:{n:'hot'}},
        {note:'The third part arrives, but TCP holds it until part 2 arrives.', flow:[['s', 'n', 'part 3'], ['n', 'r', 'part 3 held']], status:{n:'ok'}, hl:['r']},
        {note:'The receiver says it still needs part 2.', flow:[['r', 'n', 'need 2'], ['n', 's', 'need 2']]},
        {note:'TCP resends part 2, then delivers parts 2 and 3 in order.', flow:[['s', 'n', 'part 2 again'], ['n', 'r', '2 then 3']], hl:['r']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Message', 'What happens if one piece is lost'], [['Tracked letter', 'Wait for the missing page before reading on.'], ['Live radio', 'Hear the next moment even if one word was lost.']])}</div><div class="callout tip"><b>Important point</b><p>TCP and UDP make different delivery promises. The app still decides how to handle a missing response.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Food app feature', 'Useful choice'], [['Place an order or payment', 'TCP for complete, ordered data.'], ['Live voice with the rider', 'UDP-based voice so fresh sound can continue.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the phone and server are 80 ms apart for a round trip. TCP needs one round trip to set up before the app can send. So the payment waits 80 ms before its first byte leaves. UDP has no setup, so a voice packet can leave at once.</p><p>Voice apps often send a packet every 20 ms. That is 1,000 ÷ 20 = 50 packets each second. If TCP must resend one lost packet, it takes at least one round trip, 80 ms. That holds back 80 ÷ 20 = 4 packets of sound. A UDP voice app just skips the lost 20 ms.</p><h4>How it works inside</h4><p>A UDP header is 8 bytes. A TCP header is at least 20 bytes, because it carries numbers for order and confirmation. Both sit on top of IP, so the extra bytes are the cost of TCP's promises.</p><h4>When it goes wrong</h4><p>Some office networks block UDP. A voice app should then fall back to TCP. The call gets worse but still works.</p>`
  },
  tradeoffs:{use:[`For the food app payment request, TCP keeps message data complete and ordered.`, `For a rider voice call, a UDP-based transport can keep fresh sound moving.`], avoid:[`Do not assume UDP will resend lost payment data for you.`, `Do not force every late voice piece to block newer sound.`], alt:[`The app can build reliability on UDP when it needs both. You will learn QUIC in Lesson 3.`]},
  real:[
    {co:'DNS', tier:'confirmed', text:'Small DNS queries commonly use UDP. Larger answers and some other DNS work can use TCP.', src:'RFC 1035 and RFC 7766'}
  ],
  mistakes:[`Assuming UDP pieces arrive in order.`, `Assuming TCP alone prevents a payment from being charged twice.`],
  interview:[`Explain what TCP does after part 2 is lost.`, `Explain why live voice may prefer the next sound over an old missing piece.`],
  tryit:[{quiz:[
    {q:'Which transport resends missing data and delivers it in order?', options:['UDP', 'Neither', 'Both always do', 'TCP'], answer:3, why:'TCP tracks delivery and fills gaps before handing later data to the app.'},
    {q:'Why may voice use a UDP-based transport?', options:['The next sound can still play after a missing piece', 'UDP guarantees every piece arrives', 'Voice has no data', 'It prevents all network loss'], answer:0, why:'Fresh sound can matter more than replaying an old moment.'}
  ]}, {note:'Send 20 pieces with some loss. Watch how TCP waits and which UDP pieces arrive.', mount:(host, api) => lossSim(host, api)}],
  sources:[`RFC 9293 (TCP)`, `RFC 768 (UDP)`, `RFC 1035 and RFC 7766`]
},
{
  id:'http-versions', title:'HTTP/1.1 vs HTTP/2 vs HTTP/3', minutes:9, tags:['HTTP/2','HTTP/3','QUIC','multiplexing','HPACK'],
  summary:'HTTP defines how a browser asks for a page and receives an answer. Its three versions move many requests differently, especially when a network packet is lost.',
  problem:`<h3>A small example</h3><p>A customer opens the food app’s restaurant page. The browser needs several small files before it can draw the menu.</p><ul><li>40 page files</li><li>One mobile connection</li><li>Occasional lost network packets</li></ul><p>How can the HTTP version change the waiting time for the same page?</p>`,
  intuition:`Imagine a kitchen receiving many small orders. One counter handles them one by one. Another accepts several at once. Separate delivery lanes keep one delayed dish from holding every other dish.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow requests for the food page’s files.</p>',
    steps:[
      {icon:'📄', title:'Ask for files', text:'The browser requests the page, styles, and scripts. HTTP gives these requests and responses a common format.'},
      {icon:'1️⃣', title:'HTTP/1.1 uses turns', text:'Each connection handles one active request at a time. Browsers open several connections to fetch more files.'},
      {icon:'2️⃣', title:'HTTP/2 shares a connection', text:'Many file requests use separate streams within one TCP connection. A lost TCP packet can delay all its streams, which is called head-of-line blocking.'},
      {icon:'3️⃣', title:'HTTP/3 separates streams', text:'HTTP/3 uses QUIC, which adds reliable streams over UDP. A loss in one stream need not block the others.'},
      {icon:'🧪', title:'Compare the page', text:'Measure the whole restaurant page on the customer’s network. The same HTTP version can behave differently under loss.'}
    ],
    diagram:{title:'Fetching files for the restaurant page', w:740, h:260, alt:'A browser requests several food page files over HTTP/1.1, HTTP/2, and HTTP/3.',
      nodes:[{id:'b', type:'client', label:'Browser', x:90, y:130}, {id:'n', type:'ext', label:'Network', x:360, y:130}, {id:'s', type:'cdn', label:'Food site', x:640, y:130}],
      edges:[{from:'b', to:'n'}, {from:'n', to:'s'}],
      steps:[
        {note:'HTTP/1.1 sends one file request on this connection, then another.', flow:[['b', 'n', 'menu.css?'], ['n', 's'], ['s', 'n'], ['n', 'b', 'menu.css'], ['b', 'n', 'app.js?'], ['n', 's']], hl:['b'], dur:600},
        {note:'HTTP/2 sends several file requests on one connection.', flow:[['b', 'n', 'file 1'], ['b', 'n', 'file 2'], ['b', 'n', 'file 3'], ['b', 'n', 'file 4']], parallel:true, hl:['n']},
        {note:'One lost TCP packet makes all those streams wait for its missing bytes.', flow:[['n', 's', 'lost packet']], status:{n:'hot'}},
        {note:'HTTP/3 lets other streams continue while the lost stream recovers.', status:{n:'ok'}, flow:[['s', 'n', 'file 1'], ['s', 'n', 'file 3'], ['s', 'n', 'file 4']], parallel:true, hl:['s']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Kitchen setup', 'Page files'], [['One order at a time per counter', 'HTTP/1.1 uses turns on each connection.'], ['Several orders share one lane', 'HTTP/2 carries several streams together.'], ['Separate lanes for separate orders', 'HTTP/3 keeps streams independent under loss.']])}</div><div class="callout tip"><b>Important point</b><p>The versions keep the same kind of request and answer. They change how those messages travel.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Version', 'What to expect'], [['HTTP/1.1', 'Works, but many files may wait for a connection.'], ['HTTP/2', 'Usually fetches many files efficiently on one connection.'], ['HTTP/3', 'Can help when a mobile network loses packets.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the page needs 40 small files and each request takes one 100 ms round trip. Browsers often open about 6 connections to one site. With HTTP/1.1 that is 40 ÷ 6 = 6.7, so 7 rounds. 7 × 100 = 700 ms. HTTP/2 sends all 40 requests together on one connection. That is about 1 round trip, or 100 ms, plus setup.</p><h4>How it works inside</h4><p>HTTP/2 also compresses headers. Say each request carries an 800-byte cookie header. HTTP/1.1 sends it 40 times, which is 800 × 40 = 32,000 bytes. HTTP/2 sends it in full once, then refers to it with a few bytes each time.</p><p>A new TCP and TLS 1.3 connection needs 2 round trips before data. HTTP/3 needs 1, because QUIC sets up the connection and the protection together. At 100 ms, that saves 100 ms.</p><h4>When it goes wrong</h4><p>Say one packet in HTTP/2 is lost. All 40 streams stop until the resend arrives, at least 100 ms. In HTTP/3 only the stream that owned that packet waits. The other 39 keep loading.</p>`
  },
  tradeoffs:{use:[`For the food page, test HTTP/2 when many files are requested over one connection.`, `Try HTTP/3 for customers on mobile networks with packet loss.`], avoid:[`Do not assume HTTP/3 will improve every food page without measuring it.`, `Do not depend on a UDP-only route when some customer networks block it.`], alt:[`Send fewer or smaller page files if download work is the main delay.`]},
  real:[
    {co:'Google', tier:'confirmed', text:'Google developed QUIC before it became an internet standard. HTTP/3 uses the standardized version.', src:'RFC 9000 and RFC 9114'}
  ],
  mistakes:[`Assuming HTTP/2 and HTTP/3 handle a lost packet the same way.`, `Blaming the HTTP version when the restaurant page itself sends too many large files.`],
  interview:[`Explain one request per HTTP/1.1 connection versus many streams on HTTP/2 and HTTP/3.`, `Explain why QUIC lets other streams continue after one loss.`],
  tryit:[{quiz:[
    {q:'Which version puts many streams on one TCP connection?', options:['None of them', 'HTTP/2', 'HTTP/1.1', 'HTTP/3'], answer:1, why:'HTTP/2 shares one TCP connection across streams.'},
    {q:'What can HTTP/3 do when one stream loses data?', options:['Stop every browser tab', 'Remove the server', 'Continue other streams', 'Guarantee no packet is ever lost'], answer:2, why:'QUIC recovers loss within the affected stream while others can continue.'}
  ]}, {note:'In the page-load model, increase file count and round-trip time. Add one lost packet and compare the three versions.', mount:host => h2Model(host)}],
  sources:[`RFC 9000`, `RFC 9110 to RFC 9114`]
},
{
  id:'https-tls', title:'HTTPS and the TLS handshake', minutes:9, tags:['TLS','HTTPS','certificates','mTLS','PKI'],
  summary:'HTTPS is HTTP carried inside a protected TLS connection. TLS checks the site’s identity, agrees on a secret key, and protects data while it travels.',
  problem:`<h3>A small example</h3><p>A customer places a food order using café Wi-Fi. The browser sends private details to the food site.</p><ul><li>Delivery address</li><li>Order details</li><li>A connection over a shared network</li></ul><p>How can the browser check the site and keep these details private in transit?</p>`,
  intuition:`Imagine checking a courier’s ID before handing over a sealed box. The ID helps you trust the destination. The seal protects the contents during delivery.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the browser before it sends the order.</p>',
    stepper:{title:'TLS 1.3 handshake and verification', items:[
      {title:'Browser says hello', tag:'start', text:'The browser names food.example.com and offers ways to protect the connection.'},
      {title:'Server answers', tag:'choose', text:'The food site chooses a method and sends information used to agree on a secret key.'},
      {title:'Server sends proof', tag:'certificate', text:'The site sends a certificate that names food.example.com and links to an issuer the browser trusts.'},
      {title:'Server proves key ownership', tag:'signature', text:'The site proves it holds the private key linked to that certificate.'},
      {title:'Browser checks', tag:'trust', text:'The browser checks the name, dates, issuer, and proof before trusting the site.'},
      {title:'Order travels protected', tag:'HTTPS', text:'The browser sends the HTTP order request inside the protected TLS connection.'}
    ]},
    steps:[
      {icon:'🤝', title:'Start a handshake', text:'The browser and food site exchange messages before sending order data. This setup is the TLS handshake.'},
      {icon:'🪪', title:'Check the certificate', text:'A certificate names the site and carries its public key. The browser checks its name, dates, and trusted issuer.'},
      {icon:'🔑', title:'Agree on a secret', text:'The browser and site use key exchange to derive the same secret without sending that secret openly.'},
      {icon:'🔒', title:'Protect the order', text:'They use the secret to encrypt and check later messages. The browser can now send its HTTP order request as HTTPS.'}
    ],
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Courier delivery', 'Food order'], [['Check the courier’s ID', 'Check the site certificate.'], ['Agree on a lock only you share', 'Derive a secret key.'], ['Send a sealed box', 'Send protected order data.']])}</div><div class="callout tip"><b>Important point</b><p>The browser must verify the site before trusting the protected connection.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['If this check fails', 'What the customer sees'], [['Wrong site name', 'The browser warns about the certificate.'], ['Expired certificate', 'The browser warns that trust cannot be confirmed.'], ['Valid certificate', 'The order can travel through HTTPS.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the phone is 80 ms from the server. TCP needs 1 round trip. TLS 1.3 needs 1 more. So the order waits 2 × 80 = 160 ms before it can be sent. The older TLS 1.2 needs 2 round trips of its own, so 3 × 80 = 240 ms.</p><p>Say a certificate lasts 90 days. If the company renews it at day 60, it has 90 − 60 = 30 days to fix a failed renewal before customers see a warning.</p><h4>How it works inside</h4><p>The handshake uses public-key math, which is slow. It runs once. The order data is then protected with the shared secret key, which is much faster. That is why one handshake can protect thousands of messages.</p><h4>When it goes wrong</h4><p>TLS 1.3 lets a returning visitor send data in the very first message. This is called 0-RTT. An attacker who copies that message can send it again. So only allow it for requests that are safe to repeat, such as viewing a menu. You will learn why in Lesson 8.</p>`
  },
  tradeoffs:{use:[`Use HTTPS for the food app’s browsing and checkout pages so the browser can verify the site and protect traffic.`, `Renew the food site certificate before it expires.`], avoid:[`Do not ask customers to ignore a certificate warning during checkout.`, `Do not leave certificate renewal to a last-minute manual task.`], alt:[`For calls between the company’s own services, both sides can present certificates. This is called mutual TLS.`]},
  real:[
    {co:'Let’s Encrypt', tier:'confirmed', text:'Let’s Encrypt provides certificates through an automated process so sites can renew them regularly.', src:'Let’s Encrypt documentation'},
    {co:'Google Chrome', tier:'confirmed', text:'Chrome warns users when they visit a plain HTTP page instead of a protected HTTPS page.', src:'Chromium blog (2018)'}
  ],
  mistakes:[`Asking a customer to continue after the browser reports a wrong site name.`, `Forgetting to renew the food site certificate.`],
  interview:[`Explain how the browser checks that it reached the food site.`, `Describe when the order starts traveling through the protected connection.`],
  tryit:[{quiz:[
    {q:'What does the browser check before trusting the food site?', options:['The restaurant menu color', 'The number of riders', 'The price of delivery', 'The certificate name and trusted issuer'], answer:3, why:'The certificate helps the browser verify the site it reached.'},
    {q:'What does HTTPS protect for the order?', options:['Data while it travels through the TLS connection', 'Every stored copy forever', 'The rider’s phone battery', 'The restaurant’s opening hours'], answer:0, why:'TLS protects traffic in transit between the browser and the point where TLS ends.'}
  ]}, {note:'Try a valid, expired, and wrong-name certificate. Watch the browser checks stop at different steps.', mount:host => certChecker(host)}],
  sources:[`RFC 8446 (TLS 1.3)`, `Let’s Encrypt documentation`, `Chromium blog (2018)`]
},
{
  id:'rest-graphql-grpc', title:'REST vs GraphQL vs gRPC', minutes:10, tags:['REST','GraphQL','gRPC','protobuf','API style'],
  summary:'REST offers named resources through HTTP. GraphQL lets a client ask for selected fields. gRPC gives services a shared, typed format for calling each other.',
  problem:`<h3>A small example</h3><p>The food app opens a “My orders” screen on a mobile connection.</p><ul><li>Customer name</li><li>Five recent orders</li><li>Restaurant names for those orders</li></ul><p>How should the phone ask for these facts without too many trips or unnecessary data?</p>`,
  intuition:`A restaurant can offer a fixed menu, let you name the items you want, or use a short staff order form in the kitchen. These are different ways to ask for the same meal.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Compare ways to fetch the same order screen.</p>',
    steps:[
      {icon:'📨', title:'Name the request', text:'An API is the set of requests an app offers and the answers it returns.'},
      {icon:'📚', title:'Use REST resources', text:'The phone can request customer, order, and restaurant records from separate URLs. A tailored REST endpoint could combine them.'},
      {icon:'🧾', title:'Ask with GraphQL', text:'The phone sends one query naming only the fields this screen needs. The server gathers those fields.'},
      {icon:'🔧', title:'Call with gRPC inside', text:'The order service can call another service using a shared message format. The phone does not need to use gRPC.'},
      {icon:'⚖️', title:'Measure the choice', text:'Compare trips from the phone, bytes returned, and work done by the services.'}
    ],
    diagram:{title:'Three ways to fetch an order screen', w:780, h:280, alt:'The food app makes separate REST calls or one GraphQL call. Internal services may communicate using gRPC.',
      nodes:[{id:'app', type:'client', label:'Food app', x:80, y:140}, {id:'gw', type:'lb', label:'API server', x:290, y:140}, {id:'u', type:'service', label:'Customer', x:540, y:50}, {id:'r', type:'service', label:'Restaurants', x:560, y:140, w:150}, {id:'o', type:'service', label:'Orders', x:540, y:230}],
      edges:[{from:'app', to:'gw'}, {from:'gw', to:'u'}, {from:'gw', to:'r'}, {from:'gw', to:'o'}],
      steps:[
        {note:'With separate REST URLs, the app asks for the customer.', flow:[['app', 'gw', 'GET /me'], ['gw', 'u'], ['u', 'gw'], ['gw', 'app']], hl:['u']},
        {note:'It asks for restaurants linked to the orders.', flow:[['app', 'gw', 'GET /restaurants'], ['gw', 'r'], ['r', 'gw'], ['gw', 'app', 'many fields']], hl:['r']},
        {note:'It asks for recent orders. Each phone call adds network waiting.', flow:[['app', 'gw', 'GET /orders'], ['gw', 'o'], ['o', 'gw'], ['gw', 'app']], hl:['o']},
        {note:'GraphQL asks for selected fields in one phone call. Services may use gRPC inside.', flow:[['app', 'gw', 'POST /graphql'], ['gw', 'u', 'gRPC'], ['gw', 'r', 'gRPC'], ['gw', 'o', 'gRPC']], parallel:true, hl:['gw']},
        {note:'The API server returns one answer shaped for this screen.', flow:[['gw', 'app', 'needed fields']], hl:['app']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Ordering style', 'API style'], [['Ask for each menu item separately', 'Separate REST resource requests.'], ['Name only the items you need', 'One GraphQL query.'], ['Use a fixed staff order form', 'A typed gRPC call between services.']])}</div><div class="callout tip"><b>Important point</b><p>The API style alone does not make the screen fast. Count phone trips and server work.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Choice', 'Useful when'], [['REST', 'The phone needs a few clear resources.'], ['GraphQL', 'Different screens need different fields.'], ['gRPC', 'Internal services need a shared, strict message format.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say each phone round trip takes 100 ms. A plain REST screen asks for 1 customer, 1 order list, then 5 restaurants. If the phone sends these one at a time, that is 7 × 100 = 700 ms. If it sends the customer and orders together, then the 5 restaurants together, that is 2 × 100 = 200 ms. One GraphQL query or one tailored endpoint is 1 × 100 = 100 ms.</p><p>Inside the data center, say each database lookup takes 2 ms. Looking up each restaurant alone is 1 + 5 = 6 lookups, or 12 ms. Batching them is 2 lookups, or 4 ms.</p><h4>When it goes wrong</h4><p>GraphQL lets the client choose the shape. A query that nests orders inside restaurants inside orders can grow huge. Servers usually limit the query depth and cost.</p><p>REST reads use many URLs, and a cache can keep a copy of each. GraphQL often sends every query to one URL with POST, so a cache helps less. You will learn caches in Module 4.</p><h4>How it works inside</h4><p>In Protocol Buffers each field has a number. Say price is field 3. Adding a new field 4 is safe for old readers. Reusing 3 for something else is not.</p>`
  },
  tradeoffs:{use:[`For the food app, REST works when the order screen needs a few clear requests.`, `GraphQL can help when mobile and web screens ask for different fields.`, `gRPC can give the company’s internal services a shared call format.`], avoid:[`Do not assume GraphQL makes the server perform fewer internal reads.`, `Do not make the phone call many small REST URLs when one tailored answer would serve the screen.`], alt:[`Add one REST endpoint shaped for the order screen before adopting another API style.`]},
  real:[
    {co:'GitHub', tier:'confirmed', text:'GitHub offers both REST and GraphQL APIs for clients with different data needs.', src:'GitHub API documentation'},
    {co:'Google', tier:'confirmed', text:'Google open-sourced gRPC for service calls with a defined message format.', src:'gRPC documentation'}
  ],
  mistakes:[`Choosing GraphQL while ignoring the work its field lookups create.`, `Treating three phone trips as unavoidable with REST.`],
  interview:[`Compare phone trips and returned fields for the order screen.`, `Explain why an internal service might use gRPC while the phone uses REST or GraphQL.`],
  tryit:[{quiz:[
    {q:'Which style lets the phone name exactly the fields it wants?', options:['DNS', 'GraphQL', 'REST only', 'TCP'], answer:1, why:'A GraphQL query lists the requested fields.'},
    {q:'Can REST return the whole order screen in one response?', options:['Only if UDP is used', 'Only with five databases', 'Yes, with a tailored endpoint', 'No, REST forbids it'], answer:2, why:'A REST endpoint can gather data for one screen when that is useful.'}
  ]}, {note:'Compare separate REST calls, one tailored REST response, GraphQL, and gRPC in the order-screen calculator.', mount:host => fetchCalc(host)}],
  sources:[`Roy Fielding, dissertation (2000)`, `GraphQL specification`, `gRPC documentation`, `GitHub API documentation`]
},
{
  id:'realtime-transports', title:'WebSockets, SSE, long polling and webhooks', minutes:10, tags:['WebSocket','SSE','long polling','webhooks','push'],
  summary:'Live updates can arrive through repeated requests or a connection kept open. SSE sends from server to app. WebSocket works both ways. Webhooks notify another server.',
  problem:`<h3>A small example</h3><p>A customer watches a food order move from preparing to picked up to arriving.</p><ul><li>The phone needs new status soon.</li><li>Most seconds have no new status.</li><li>A restaurant partner also needs a delivery notice.</li></ul><p>How can the app and partner hear about changes without asking constantly?</p>`,
  intuition:`A child can keep asking “Any news?” or wait for a parent to speak. A radio sends one-way updates. A phone call lets both sides talk.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Compare who starts each message and how long the connection stays open.</p>',
    steps:[
      {icon:'🔁', title:'Ask on a timer', text:'With short polling, the phone asks for status every few seconds. Many answers say nothing changed.'},
      {icon:'⌛', title:'Wait for an answer', text:'With long polling, the server holds one request until status changes, then the phone asks again.'},
      {icon:'📻', title:'Let the server speak', text:'SSE keeps one HTTP response open so the server can send order updates to the phone.'},
      {icon:'📞', title:'Let both sides speak', text:'A WebSocket keeps a connection where the phone and server can both send messages.'},
      {icon:'🏪', title:'Tell another server', text:'A webhook sends a new HTTP request to the restaurant partner’s server when an event happens.'}
    ],
    diagram:{title:'Order status through different transports', w:780, h:280, alt:'The food app asks for updates or holds a connection. The order server can also notify a partner server.',
      nodes:[{id:'c', type:'client', label:'Food app', x:90, y:110}, {id:'s', type:'service', label:'Order server', x:420, y:110, w:140}, {id:'p', type:'ext', label:'Restaurant server', x:680, y:220, w:140}],
      edges:[{from:'c', to:'s'}, {from:'s', to:'p'}],
      steps:[
        {note:'Short polling asks again and again, even when nothing changed.', flow:[['c', 's', 'update?'], ['s', 'c', 'no'], ['c', 's', 'update?'], ['s', 'c', 'no']], dur:650},
        {note:'Long polling leaves the request open while the order is unchanged.', flow:[['c', 's', 'tell me when']], dwell:1600},
        {note:'When the rider picks up the order, the server answers. The app can ask again.', flow:[['s', 'c', 'picked up'], ['c', 's', 'tell me when']], hl:['s']},
        {note:'SSE sends updates to the app. A WebSocket also lets the app send a message back.', flow:[['s', 'c', 'arriving'], ['s', 'c', 'delivered'], ['c', 's', 'thanks']], hl:['c']},
        {note:'A webhook sends a new request to the restaurant server.', flow:[['s', 'p', 'delivered'], ['p', 's', 'received']], hl:['p']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Conversation', 'Order updates'], [['Ask “Any news?” repeatedly', 'Short polling.'], ['Wait for one answer', 'Long polling.'], ['Listen to a radio', 'SSE sends from server to app.'], ['Talk on a phone', 'WebSocket works both ways.'], ['Call another business', 'Webhook reaches a partner server.']])}</div><div class="callout tip"><b>Important point</b><p>Choose by who needs to speak and how often updates happen.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Useful choice'], [['Rare order updates', 'Long polling or a modest timer.'], ['Frequent one-way status', 'SSE.'], ['Customer chat with rider', 'WebSocket.'], ['Notify a restaurant system', 'Webhook.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say an order lasts 40 minutes, which is 2,400 seconds. With short polling every 5 seconds, the phone asks 2,400 ÷ 5 = 480 times. If the status changes 4 times, 476 answers say nothing new. An update waits 2.5 seconds on average and up to 5 seconds. SSE uses 1 connection and sends 4 messages.</p><p>The price of a held connection is memory. Say each costs 10 KB. For 100,000 waiting customers, that is 100,000 × 10 KB = 1,000,000 KB, about 1 GB.</p><h4>When it goes wrong</h4><p>A phone in a tunnel drops its SSE connection. SSE lets the browser send the ID of the last message it got. The server can then resend the ones it missed.</p><p>Say the restaurant partner is down, and the company retries a webhook after 1, 5 and 30 minutes. The partner may get the same event up to 4 times. Each event needs an ID so the partner can skip repeats.</p>`
  },
  tradeoffs:{use:[`For food order status, use SSE when the server only sends updates to the open app.`, `Use WebSocket when the customer and rider also need to exchange live messages.`, `Use a webhook when the restaurant’s server needs an event.`], avoid:[`Do not ask millions of open apps every two seconds when updates are rare.`, `Do not assume a webhook will be delivered only once.`], alt:[`For a simple first version with few customers, a slower polling interval may be enough.`]},
  real:[
    {co:'Slack', tier:'confirmed', text:'Slack documents WebSocket connections for apps that receive live events.', src:'Slack API documentation'},
    {co:'Stripe', tier:'confirmed', text:'Stripe sends signed webhooks to a business server when payment events happen.', src:'Stripe webhooks documentation'}
  ],
  mistakes:[`Choosing a two-way channel when the open food app only receives status.`, `Ignoring duplicate webhook deliveries to the restaurant.`],
  interview:[`Choose one transport for order status and one for customer chat.`, `Show how polling every two seconds makes 2.5 million requests each second at five million open apps.`],
  tryit:[{quiz:[
    {q:'Which choice sends one-way updates over a held HTTP response?', options:['Webhook', 'DNS', 'TCP alone', 'SSE'], answer:3, why:'SSE lets the server stream updates to the app.'},
    {q:'Which choice notifies a restaurant’s server about an event?', options:['Webhook', 'Short polling on every phone', 'A browser tab title', 'A DNS lookup'], answer:0, why:'A webhook is a request from one server to another.'}
  ]}, {note:'Change the order-status event rate and polling interval. Compare request count and delivery delay.', mount:host => transportSim(host)}],
  sources:[`RFC 6455 (WebSocket)`, `HTML Living Standard, Server-sent events`, `Slack API documentation`, `Stripe webhooks documentation`]
},
{
  id:'api-design', title:'API design: versioning, pagination, errors, OpenAPI', minutes:10, tags:['API design','versioning','pagination','cursor','problem+json','OpenAPI'],
  summary:'An API is a promise about requests and answers. Versions protect old clients, pagination divides long lists, errors explain failures, and OpenAPI records the promise.',
  problem:`<h3>A small example</h3><p>A restaurant partner reads new food orders through the app’s API. The company needs to improve that API.</p><ul><li>The old response has a price in rupees.</li><li>New orders arrive while the partner reads pages.</li><li>Invalid requests need clear errors.</li></ul><p>How can the API change without surprising the partner’s software?</p>`,
  intuition:`An API is like a published menu. Customers know the names, prices, and rules. Adding an option is easy to accept. Changing a familiar item without warning breaks their plans.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Keep the old restaurant partner working while the order API improves.</p>',
    steps:[
      {icon:'📨', title:'Name the contract', text:'A request such as GET /orders asks for a list. The response names fields and their meanings.'},
      {icon:'➕', title:'Add before replacing', text:'Add price_paise beside the old price field. Test that old partner software still reads the answer.'},
      {icon:'📄', title:'Page the list', text:'Return a few orders at a time. A cursor marks the last order seen so new orders do not shift the next page.'},
      {icon:'⚠️', title:'Make errors clear', text:'Use a suitable HTTP status and a steady error shape when the partner sends a bad request.'},
      {icon:'📘', title:'Publish the contract', text:'OpenAPI is a machine-readable description of the requests, fields, and responses partners can use.'}
    ],
    stepper:{title:'Evolving an API without breaking anyone', items:[
      {title:'Add', tag:'new field', text:'Return price_paise as an integer beside the existing price field.'},
      {title:'Announce', tag:'give notice', text:'Tell partners the old price field will stop being supported later.'},
      {title:'Measure', tag:'check use', text:'Find which partners still depend on the old field or API version.'},
      {title:'Version', tag:'breaking change', text:'If the old meaning must change, offer a new version while the old one still works.'},
      {title:'Help partners move', tag:'migration', text:'Share an example response and time to update their code.'},
      {title:'Remove', tag:'after notice', text:'Remove the old behavior only after the promised change period.'}
    ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Published menu', 'Order API'], [['Add an optional dish', 'Add a field old clients can ignore.'], ['Rename a familiar dish', 'Give partners a new version.'], ['Print a new menu', 'Update the OpenAPI description.']])}</div><div class="callout tip"><b>Important point</b><p>An API change is safe only when existing clients can still understand the answer they receive.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Need', 'Choice'], [['Many changing orders', 'Use a cursor for the next page.'], ['Bad request', 'Send one clear error shape and status.'], ['Change field meaning', 'Offer a new version and migration time.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say each page holds 20 orders and the partner has read page 1, which was orders 1 to 20. Then 3 new orders arrive at the top. Old orders 18, 19 and 20 move to places 21, 22 and 23. Page 2 with offset 20 starts at place 21. So the partner sees orders 18, 19 and 20 a second time. A cursor that says "after order 20" avoids this.</p><p>Offsets also cost more as they grow. For "skip 100,000", the database may step past 100,000 rows first. A cursor can jump straight to its spot using an index. You will learn indexes in Module 5.</p><h4>When it goes wrong</h4><p>Floating-point numbers cannot store every decimal exactly. In many languages 0.1 + 0.2 gives 0.30000000000000004. So send ₹499 as 49,900 paise, a whole number.</p><p>When you add price_paise, keep the old price field for a stated time, say 6 months, and tell partners the end date.</p>`
  },
  tradeoffs:{use:[`For the restaurant’s changing order list, a cursor helps the partner continue after the last order it saw.`, `Add price_paise while keeping the old price field for partners still using it.`], avoid:[`Do not change the meaning of price in place and surprise old partner code.`, `Do not return unrelated error shapes for the same kind of bad request.`], alt:[`For a short, stable restaurant list, numbered pages may be simpler than cursors.`]},
  real:[
    {co:'Stripe', tier:'confirmed', text:'Stripe documents dated API versions so existing integrations can keep the behavior they expect.', src:'Stripe API versioning documentation'},
    {co:'Slack', tier:'confirmed', text:'Slack documents cursor pagination for clients reading long lists.', src:'Slack API pagination documentation'}
  ],
  mistakes:[`Removing price before partners have moved to price_paise.`, `Using numbered offsets for a changing order list without checking for repeats.`],
  interview:[`Show one safe field addition and one change that needs a version.`, `Explain how a cursor continues an order list after new orders arrive.`],
  tryit:[{quiz:[
    {q:'What is a safer first step before replacing price with price_paise?', options:['Stop all partner requests', 'Add price_paise beside price', 'Remove price without notice', 'Change price into a string'], answer:1, why:'Old partners can keep using price while they move to the new field.'},
    {q:'What does a cursor mark in the changing order list?', options:['The customer password', 'The HTTP version', 'The last order already seen', 'The total restaurant count'], answer:2, why:'The next page can continue after that order.'}
  ]}, {note:'Read order pages, add new orders at the top, and compare numbered offsets with a cursor.', mount:host => paginationDemo(host)}],
  sources:[`OpenAPI Specification`, `Slack API pagination documentation`, `Stripe API versioning documentation`]
},
{
  id:'idempotency-rate-limit-headers', title:'Idempotency keys, safe retries and rate-limit headers', minutes:9, tags:['idempotency','retries','429','Retry-After','rate limit headers'],
  summary:'A retry may repeat an action when its first answer is lost. An idempotency key lets the server recognize that repeat. Response headers can tell a busy client when to try again.',
  problem:`<h3>A small example</h3><p>A customer pays ₹499 for a food order. The charge succeeds, but the phone loses the answer in a tunnel.</p><ul><li>The payment request reached the server.</li><li>The success response did not reach the phone.</li><li>The phone may send the request again.</li></ul><p>How can the app retry without charging twice, and know when to slow down?</p>`,
  intuition:`A shop gives you one token for an order. Returning with the same token gets the same receipt, not a second order. A “come back in 12 seconds” sign tells you when to try again.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one payment that succeeds before its answer is lost.</p>',
    steps:[
      {icon:'🎫', title:'Give the payment a key', text:'The phone creates one unique idempotency key for this ₹499 payment. It keeps that key for any retry.'},
      {icon:'💳', title:'Record the charge', text:'The server records the payment and key together, then sends a success response.'},
      {icon:'📵', title:'Lose the response', text:'The phone never sees the answer. It cannot know whether the charge happened.'},
      {icon:'🔁', title:'Retry the same action', text:'The phone sends the same request and key. The server finds the key and returns the earlier result.'},
      {icon:'⏳', title:'Wait when asked', text:'If an API answers 429 with Retry-After, the caller waits the stated time before sending another request.'}
    ],
    diagram:{title:'One charge despite a lost answer', w:740, h:210, alt:'The food app sends a payment with one key. Its first answer is lost, so it retries with the same key and gets the stored result.',
      nodes:[{id:'a', type:'client', label:'Food app', x:80, y:105}, {id:'s', type:'service', label:'Payment server', x:360, y:105}, {id:'d', type:'db', label:'Charges + keys', x:640, y:105}],
      edges:[{from:'a', to:'s'}, {from:'s', to:'d'}],
      steps:[
        {note:'The app sends the payment and one key. The server stores both with the charge.', flow:[['a', 's', 'pay + key'], ['s', 'd', 'charge + key']], hl:['d']},
        {note:'The success response is lost on the way to the phone.', flow:[['d', 's'], ['s', 'a', 'lost']], status:{a:'hot'}},
        {note:'The app retries the same payment with the same key.', status:{a:'ok'}, flow:[['a', 's', 'same key']], hl:['s']},
        {note:'The server returns the stored result. It does not charge again.', flow:[['s', 'd', 'key?'], ['d', 's', 'seen'], ['s', 'a', 'same result']], hl:['a']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['At the shop', 'Payment API'], [['Bring back the same token', 'Retry with the same key.'], ['Show the earlier receipt', 'Return the stored payment result.'], ['Come back after 12 seconds', 'Honor Retry-After: 12.']])}</div><div class="callout tip"><b>Important point</b><p>One key belongs to one payment attempt, including every retry of that attempt.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['What the caller sees', 'What it should do'], [['No answer after paying', 'Retry with the same key.'], ['Earlier result for that key', 'Show the saved outcome.'], ['429 with Retry-After', 'Wait, then send again.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Without a key, the lost answer means 2 charges. 2 × ₹499 = ₹998 instead of ₹499. With a key, the second request returns the saved result and the total stays ₹499.</p><p>Storing keys costs space. Say 100,000 payments each day, and each saved key and result takes 1 KB. That is 100,000 × 1 KB = 100,000 KB, about 100 MB each day.</p><h4>When it goes wrong</h4><p>Say the phone retries while the first request is still running. Two requests with one key arrive together. Only one may charge. The database can refuse a second record with the same key, so one request wins and the other waits or gets an error. You will learn databases in Module 5.</p><p>If a request reuses a key with a different amount, return an error. Do not return the old result.</p><h4>How it works inside</h4><p>HTTP says GET, PUT and DELETE are safe to repeat. POST is not. A payment is usually a POST, so it needs a key.</p><p>If 1,000 clients are all told Retry-After: 12, they all return at second 12. A random extra wait of 0 to 3 seconds spreads them out.</p>`
  },
  tradeoffs:{use:[`For the food payment, reuse one key when the phone retries after losing the answer.`, `For a partner making too many requests, return 429 and a wait time it can follow.`], avoid:[`Do not generate a new payment key for each retry.`, `Do not save the key separately after the charge has already committed.`], alt:[`A unique order number can also help identify a repeated business action when the server enforces it.`]},
  real:[
    {co:'Stripe', tier:'confirmed', text:'Stripe documents an Idempotency-Key header so clients can retry a request without repeating its effect.', src:'Stripe API documentation, Idempotent requests'},
    {co:'GitHub', tier:'confirmed', text:'GitHub returns headers that tell API clients about their remaining request allowance.', src:'GitHub REST API rate limit documentation'}
  ],
  mistakes:[`Using a new key after the first payment answer is lost.`, `Ignoring Retry-After and sending another request immediately.`],
  interview:[`Explain where the food payment key is saved and why the save must accompany the charge.`, `Explain what a client does after a 429 response with Retry-After.`],
  tryit:[{quiz:[
    {q:'Which key should the phone use when it retries the same food payment?', options:['A new key for every retry', 'No key after a timeout', 'The restaurant name', 'The same key'], answer:3, why:'The server recognizes the same logical payment by its key.'},
    {q:'What should a client do after 429 with Retry-After: 12?', options:['Wait about 12 seconds before another request', 'Retry twelve times at once', 'Change the payment amount', 'Delete the order'], answer:0, why:'Retry-After tells the client how long to wait.'}
  ]}, {note:'Pay with a lost response, first without a key and then with one. Send requests until the API says 429 and read its wait time.', mount:(host, api) => idemDemo(host, api)}],
  sources:[`Stripe API documentation, Idempotent requests`, `RFC 6585`, `GitHub REST API rate limit documentation`]
},
{
  id:'proxies-gateway-bff', title:'Forward proxy, reverse proxy, API gateway and BFF', minutes:8, tags:['proxy','reverse proxy','API gateway','BFF','Envoy'],
  summary:'A proxy passes a request between two sides. A reverse proxy receives requests for servers. An API gateway adds shared API rules, while a BFF shapes answers for one kind of app.',
  problem:`<h3>A small example</h3><p>The food company has a phone app and a website. Both need orders, restaurants, and customer details.</p><ul><li>The phone needs a short home-screen answer.</li><li>The website needs more detail.</li><li>Internal services should not be exposed directly.</li></ul><p>Which middle parts can receive requests and give each client a useful answer?</p>`,
  intuition:`A hotel reception sends guests to the right room. A concierge prepares a different plan for a family and a business traveler. A company office may also use a desk to make calls outward.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow requests into and out of the food company.</p>',
    steps:[
      {icon:'🚪', title:'Receive outside requests', text:'A reverse proxy stands in front of the company’s servers and passes each request inward.'},
      {icon:'🛂', title:'Apply shared API rules', text:'An API gateway can check a caller and route its request to the right internal part.'},
      {icon:'📱', title:'Shape the phone answer', text:'A mobile BFF, or backend for frontend, gathers the small set of facts the phone screen needs.'},
      {icon:'💻', title:'Shape the website answer', text:'A web BFF can gather a different set of facts for the larger website screen.'},
      {icon:'📤', title:'Control calls outward', text:'A forward proxy can carry an internal service’s request to an outside SMS provider.'}
    ],
    diagram:{title:'Middle parts in the food app', w:800, h:300, alt:'Phone and web requests enter an API gateway and reach their own BFFs. An internal service calls outward through a forward proxy.',
      nodes:[{id:'m', type:'client', label:'Food phone app', x:70, y:70}, {id:'w', type:'client', label:'Food website', x:70, y:200}, {id:'gw', type:'lb', label:'API gateway', x:240, y:135}, {id:'bm', type:'service', label:'Phone BFF', x:420, y:70}, {id:'bw', type:'service', label:'Web BFF', x:420, y:200}, {id:'s1', type:'service', label:'Orders', x:640, y:60, w:110}, {id:'s2', type:'service', label:'Restaurants', x:640, y:140, w:110}, {id:'s3', type:'service', label:'Customers', x:640, y:220, w:110}, {id:'fp', type:'ext', label:'Forward proxy', x:420, y:275, w:130, h:40}],
      edges:[{from:'m', to:'gw'}, {from:'w', to:'gw'}, {from:'gw', to:'bm'}, {from:'gw', to:'bw'}, {from:'bm', to:'s1'}, {from:'bm', to:'s2'}, {from:'bw', to:'s2'}, {from:'bw', to:'s3'}, {from:'s3', to:'fp', dashed:true, label:'egress'}],
      steps:[
        {note:'The phone and website both enter through the API gateway.', flow:[['m', 'gw', 'home?'], ['w', 'gw', 'home?']], parallel:true, hl:['gw']},
        {note:'The gateway sends each request to the right BFF.', flow:[['gw', 'bm'], ['gw', 'bw']], parallel:true, hl:['bm', 'bw']},
        {note:'Each BFF asks the internal services for the facts its screen needs.', flow:[['bm', 's1'], ['bm', 's2'], ['bw', 's3']], parallel:true},
        {note:'The customer service calls an outside SMS provider through a forward proxy.', flow:[['s3', 'fp', 'send SMS']], hl:['fp']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Hotel desk', 'Food app middle part'], [['Reception sends guests inward', 'Reverse proxy receives client requests.'], ['Reception checks common rules', 'API gateway applies shared API rules.'], ['Concierge plans for one guest type', 'BFF shapes one client’s answer.'], ['Office desk makes an outside call', 'Forward proxy carries calls outward.']])}</div><div class="callout tip"><b>Important point</b><p>Each middle part has a job. Keep order and payment decisions in the services that own them.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Middle part'], [['One public entry to servers', 'Reverse proxy.'], ['Shared API checks and routing', 'API gateway.'], ['Different phone and web screens', 'A BFF for each client type.'], ['Control requests leaving the company', 'Forward proxy.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the phone is 100 ms from the company. Without a BFF, the home screen calls 4 services: orders, restaurants, customer and offers. If sent together that is 100 ms, but the phone must know four addresses and handle four answers. With a mobile BFF, the phone makes 1 call. The BFF calls the 4 services together inside the data center, say 5 ms each, so the total is about 100 + 5 = 105 ms.</p><p>Say the gateway and a service each work 99.9% of the time. A request needs both. 0.999 × 0.999 = 0.998. A 30-day month has 43,200 minutes. The gateway alone can be down 0.001 × 43,200 = 43 minutes. Both in a row can be down about 0.002 × 43,200 = 86 minutes.</p><h4>When it goes wrong</h4><p>Behind a reverse proxy, every request seems to come from the proxy's address. The proxy adds the real client address in a header, often X-Forwarded-For. A client can fake that header. So trust it only when it comes from your own proxy.</p>`
  },
  tradeoffs:{use:[`For the food app, use a gateway when phone and web requests need the same entry rules.`, `Use separate BFFs when the phone and website need different home-screen answers.`], avoid:[`Do not put food-order pricing decisions in the gateway.`, `Do not make the gateway the only working path for every customer.`], alt:[`If both screens need nearly the same answer, one simple API endpoint may be enough without separate BFFs.`]},
  real:[
    {co:'Netflix', tier:'confirmed', text:'Netflix built Zuul to route API traffic through an edge gateway.', src:'Netflix Tech Blog, Zuul'},
    {co:'SoundCloud', tier:'confirmed', text:'SoundCloud’s use of client-specific backends helped shape the BFF pattern.', src:'Sam Newman, Backends for Frontends (2015)'}
  ],
  mistakes:[`Putting order pricing rules in the gateway.`, `Using one BFF for very different screens until it becomes hard to change.`],
  interview:[`Explain what the gateway checks before the phone request enters.`, `Distinguish the phone BFF from the forward proxy used for an outside SMS call.`],
  tryit:[{quiz:[
    {q:'Which middle part shapes an answer for the food phone screen?', options:['The restaurant database alone', 'The phone BFF', 'The DNS resolver', 'The forward proxy'], answer:1, why:'A BFF gathers the fields its client type needs.'},
    {q:'Which proxy can control an internal service’s call to an outside SMS provider?', options:['A browser tab', 'The menu page', 'Forward proxy', 'Reverse proxy only'], answer:2, why:'A forward proxy acts for a caller sending a request outward.'}
  ]}, {note:'Sort each food app responsibility by the middle part that handles it.', mount:host => sortGame(host, [
    {t:'Control which outside SMS provider the food service may call', c:'f', why:'A forward proxy controls the outbound request.'},
    {t:'Receive phone requests before they reach internal services', c:'r', why:'A reverse proxy stands in front of servers.'},
    {t:'Check a partner API key and choose an internal route', c:'g', why:'An API gateway applies shared rules.'},
    {t:'Build one short response for the phone home screen', c:'b', why:'A phone BFF shapes this client’s answer.'},
    {t:'Build a detailed answer for the food website', c:'b', why:'A web BFF can shape a different answer.'}
  ], [{id:'f', label:'Forward proxy'}, {id:'r', label:'Reverse proxy'}, {id:'g', label:'API gateway'}, {id:'b', label:'BFF'}])}],
  sources:[`Sam Newman, Backends for Frontends (2015)`, `Netflix Tech Blog, Zuul`]
}
];

SDA.register({
  kind:'module', id:'networking', order:2, level:'beginner', icon:'🔌', title:'Networking & APIs',
  summary:'Follow a food app from its site name to a protected order request. Compare ways to move data, deliver updates, and keep APIs safe to change.',
  outcomes:['Explain how a site name, IP address, and port connect a browser to a server', 'Choose TCP, UDP, and an HTTP version for a stated need', 'Explain how a browser checks a food site before sending an order', 'Compare API styles and live update methods using one app', 'Design a partner API that handles changes and retries safely'],
  lessons,
  quiz:[
    {q:'What does DNS give the browser for food.example.com?', options:['A restaurant menu', 'A server IP address', 'An order receipt', 'A payment key'], answer:1, why:'DNS turns the site name into an address the browser can contact.'},
    {q:'What should the company do before moving food.example.com to a new address?', options:['Turn off the old server first', 'Raise the old TTL', 'Lower the TTL early and keep the old server running', 'Ask every customer to change a setting'], answer:2, why:'Saved answers may still point to the old server until they expire.'},
    {q:'Which need is a better fit for TCP’s ordered delivery?', options:['The newest moment of a voice call', 'A disappearing animation', 'A missed radio word', 'A complete food order request'], answer:3, why:'The order request needs complete data in the correct order.'},
    {q:'What changes from HTTP/2 to HTTP/3 when one stream loses data?', options:['HTTP/3 cannot lose packets', 'HTTP/2 stops using HTTP', 'The site name changes', 'HTTP/3 can continue other streams'], answer:3, why:'QUIC lets unaffected streams continue while one recovers.'},
    {q:'What does the browser check before trusting the food site over HTTPS?', options:['Only the restaurant rating', 'The certificate name and trusted issuer', 'The delivery distance', 'The number of page files'], answer:1, why:'The certificate helps verify the site before order data is sent.'},
    {q:'Which API style lets the phone name the fields it wants for an order screen?', options:['DNS', 'TCP', 'GraphQL', 'A forward proxy'], answer:2, why:'A GraphQL query names the requested fields.'},
    {q:'Which method sends one-way order updates over a held HTTP response?', options:['SSE', 'Webhook to another server', 'A DNS lookup', 'A new payment'], answer:0, why:'SSE streams updates from the order server to the open app.'},
    {q:'What does a cursor mark when a restaurant reads order pages?', options:['The HTTP version', 'The customer password', 'The total price', 'The last order already seen'], answer:3, why:'The next page continues after the last seen order.'},
    {q:'The payment answer was lost. Which key should the phone use on retry?', options:['A new key', 'The same idempotency key', 'The restaurant name', 'No key'], answer:1, why:'The same key lets the server return the earlier result without charging again.'},
    {q:'What should a client do after 429 with Retry-After: 12?', options:['Retry twelve times at once', 'Delete the order', 'Wait about 12 seconds', 'Change DNS'], answer:2, why:'Retry-After tells the client when to send another request.'},
    {q:'Which middle part shapes a short answer for the food phone screen?', options:['The browser certificate', 'The phone BFF', 'The forward proxy', 'The DNS root'], answer:1, why:'A BFF gathers an answer for one client type.'},
    {type:'scenario', q:'The food app must show order status to an open phone and notify a restaurant partner. Choose both methods.', answer:'<p>Use SSE for one-way updates to the open phone. Use a webhook to send a new request to the restaurant partner’s server. If the phone also needs live two-way chat, compare WebSocket. Let the partner recognize a repeated webhook event.</p>'},
    {type:'scenario', q:'A restaurant partner uses the old price field, but the food API needs price_paise. How should the company change it?', answer:'<ol><li>Add price_paise beside the old field.</li><li>Document both fields in OpenAPI and tell partners when the old field may end.</li><li>Give partners a new API version if the old meaning must change.</li><li>Watch old-version use and allow time for migration.</li></ol>'}
  ],
  flashcards:[
    {front:'IP address', back:'A numeric destination for a device or server on a network.'},
    {front:'Port', back:'A number that selects a program at a network address.'},
    {front:'DNS TTL', back:'How long a saved name-to-address answer may be used.'},
    {front:'TCP', back:'Tracks delivery, resends missing data, and delivers data in order.'},
    {front:'UDP', back:'Sends independent packets without a delivery or ordering promise.'},
    {front:'HTTP/2 and HTTP/3', back:'Both use streams. HTTP/3 can continue unaffected streams after a loss.'},
    {front:'HTTPS', back:'HTTP sent through a protected TLS connection.'},
    {front:'Certificate', back:'A document that helps the browser check a site name and public key.'},
    {front:'REST and GraphQL', back:'REST offers named resources. GraphQL lets a client name selected fields.'},
    {front:'gRPC', back:'A typed call format often used between internal services.'},
    {front:'SSE, WebSocket, webhook', back:'One-way stream to an app, two-way connection, and event request to another server.'},
    {front:'Cursor', back:'A marker for the last item seen when reading a long list.'},
    {front:'Idempotency key', back:'A key reused on retries of one action so the server can return its earlier result.'},
    {front:'API gateway and BFF', back:'The gateway applies shared entry rules. A BFF shapes an answer for one client type.'}
  ],
  cheatsheet:[
    {h:'🌍 Find the food site', items:['DNS turns a site name into an IP address.', 'A port selects the program at that address.', 'A resolver may save an address until its TTL expires.', 'Lower the TTL early and keep the old server during an address move.']},
    {h:'📦 Move data', items:['TCP resends missing data and delivers it in order.', 'UDP sends independent packets without that promise.', 'HTTP/1.1 uses turns on each connection.', 'HTTP/2 shares a TCP connection across streams.', 'HTTP/3 uses QUIC so one lost stream need not stop the others.']},
    {h:'🔒 Protect the order', items:['HTTPS is HTTP inside TLS.', 'The browser checks the certificate name, dates, and issuer.', 'The browser and site agree on a secret key before sending the order.', 'Renew certificates before they expire.']},
    {h:'🧩 Choose an API style', items:['REST offers named resources through HTTP.', 'GraphQL lets the phone name needed fields.', 'A tailored REST endpoint can also return one screen-shaped answer.', 'gRPC uses a shared typed format between services.']},
    {h:'📡 Send live news', items:['Long polling waits for one answer, then asks again.', 'SSE streams updates from server to an open app.', 'WebSocket carries messages both ways.', 'A webhook sends an event request to another server.']},
    {h:'📐 Keep the API safe to use', items:['Add a new field before removing an old one.', 'Use a cursor for a changing order list.', 'Return clear status codes and a steady error shape.', 'Describe the API in OpenAPI.', 'Reuse one idempotency key for retries of one payment.', 'After 429, honor Retry-After.']},
    {h:'🚪 Middle parts', items:['A reverse proxy receives requests for servers.', 'An API gateway applies shared entry rules.', 'A BFF shapes one client type’s answer.', 'A forward proxy carries requests outward.']}
  ],
  glossary:[
    {term:'IP address', aka:['IP addresses'], def:'A number that identifies a computer on a network, like a street address. Example: 203.0.113.7 is the address of one server.'},
    {term:'IPv4', aka:['IPv4 address'], def:'The older IP address format. It uses 32 bits, which gives about 4 billion addresses. Example: 192.168.1.10.'},
    {term:'IPv6', aka:['IPv6 address'], def:'The newer IP address format. It uses 128 bits, so there are far more addresses. Example: 2001:db8::1.'},
    {term:'Port', aka:['ports'], def:'A number that picks which program on a computer receives the data. Example: web servers listen on port 443 for secure web traffic.'},
    {term:'DNS', aka:['Domain Name System'], def:'The system that turns a site name into an IP address, like a phone book. Example: it turns food.example.com into 203.0.113.7.'},
    {term:'Resolver', aka:['DNS resolver', 'resolvers'], def:'A server that looks up DNS answers for you and remembers them for a while. Example: your internet provider’s DNS server.'},
    {term:'TTL', aka:['time to live', 'TTLs'], def:'Time to live: how long a saved answer may be used before it must be checked again. Example: a DNS answer with a TTL of 300 seconds can be reused for 5 minutes. Caches use TTLs too.'},
    {term:'DNS A record', aka:['DNS A records'], def:'A DNS answer that gives the IPv4 address for a name. Example: food.example.com points to 203.0.113.7.'},
    {term:'AAAA record', aka:['AAAA records'], def:'A DNS answer that gives the IPv6 address for a name. Example: food.example.com points to 2001:db8::1.'},
    {term:'CNAME', aka:['CNAME record'], def:'A DNS answer that says one name is a nickname for another name. Example: www.food.example.com is an alias for food.example.com.'},
    {term:'Packet', aka:['packets'], def:'A small chunk of data sent across a network. Example: a web page is split into many packets that are put back together at the other end.'},
    {term:'TCP', def:'A way of sending data that checks delivery, resends what is lost and keeps the order. Example: loading a web page needs every byte, so it uses TCP.'},
    {term:'UDP', def:'A fast way of sending data that does not promise delivery or order. Example: a live video call can skip a lost packet instead of waiting for it.'},
    {term:'Head-of-line blocking', aka:['HOL blocking'], def:'When one missing piece holds up everything behind it, even pieces that have already arrived. Example: if packet 3 is lost, packets 4 to 10 wait until packet 3 is sent again.'},
    {term:'Congestion control', def:'The way a sender slows down when the network looks crowded. Example: TCP sends fewer packets after it notices losses.'},
    {term:'HTTP', def:'The rules a browser and a server use to ask for pages and send them back. Example: GET /menu asks the server for the menu page.'},
    {term:'HTTP/1.1', def:'An older HTTP version. Each connection handles one request at a time. Example: loading 30 files over one connection makes them queue, so browsers open several connections.'},
    {term:'HTTP/2', def:'An HTTP version that sends many requests at the same time over one connection. Example: a browser fetches 30 files together over one TCP connection.'},
    {term:'HTTP/3', def:'The newest HTTP version. It runs on QUIC, so a lost packet only slows its own stream. Example: one stuck image does not delay the page’s text.'},
    {term:'Stream', def:'A continuous flow of data or messages. In HTTP/2, each file request is its own stream on a shared connection. In Kafka, a stream is an ordered log of events.'},
    {term:'QUIC', def:'A modern transport built on UDP that adds reliable streams. HTTP/3 uses it. Example: many big sites use QUIC for faster page loads.'},
    {term:'HTTPS', def:'HTTP sent through an encrypted TLS connection, so others cannot read or change it. Example: the padlock in your browser’s address bar.'},
    {term:'TLS', def:'The protocol that proves a site is who it claims to be and scrambles the data in transit. Example: when you log in, TLS stops people on the same Wi-Fi from reading your password.'},
    {term:'Certificate', aka:['certificates', 'TLS certificate'], def:'A digital ID card for a website. It ties the site name to a public key and is signed by a trusted issuer. Example: the browser checks that the certificate says food.example.com.'},
    {term:'Certificate authority', aka:['CA', 'certificate authorities'], def:'A trusted organisation that signs certificates after checking who owns the site. Example: Let’s Encrypt is a certificate authority.'},
    {term:'Forward secrecy', def:'A protection so that stealing a server’s key later does not let anyone read old recorded traffic. Example: even if the key leaks next year, last month’s traffic stays private.'},
    {term:'mTLS', aka:['mutual TLS'], def:'Mutual TLS: both sides show certificates, so each proves who it is. Example: two internal services check each other’s identity before they talk.'},
    {term:'API', aka:['APIs'], def:'The set of requests a program accepts and the answers it gives, so other programs can use it. Example: a food app asks a restaurant API for a menu.'},
    {term:'REST', def:'An API style where things have URLs and you use standard HTTP actions on them. Example: GET /orders/17 reads order 17 and DELETE /orders/17 cancels it.'},
    {term:'GraphQL', def:'An API style where the client asks for exactly the fields it needs in one query. Example: ask for an order’s status and the driver’s name, and nothing else.'},
    {term:'gRPC', def:'A fast way for services to call each other using strict, shared message definitions. Example: the order service calls the payment service almost like a normal function.'},
    {term:'Protocol Buffers', aka:['protobuf'], def:'A compact message format where the fields are described in a shared file. Example: messages are smaller than JSON, so they are faster to send between services.'},
    {term:'Server-Sent Events', aka:['SSE'], def:'A way for a server to keep a connection open and push updates to the browser, in one direction only. Example: a live order status that updates on the page.'},
    {term:'WebSocket', aka:['WebSockets'], def:'A connection that stays open so the client and the server can both send messages at any time. Example: a chat app.'},
    {term:'Long polling', def:'The client asks, the server waits until it has news, then answers, and the client asks again. Example: the app asks “any updates?” and the server holds the question for up to 30 seconds.'},
    {term:'Webhook', aka:['webhooks'], def:'A call that one server makes to another server’s URL when something happens. Example: a payment company calls your server when a payment succeeds.'},
    {term:'API version', aka:['API versions', 'API versioning'], def:'A named set of API behaviour that clients can rely on. Example: /v1/orders keeps working for old apps while /v2/orders adds new features.'},
    {term:'Pagination', aka:['paginated'], def:'Splitting a long list into smaller pages. Example: show 20 orders at a time instead of all 5,000.'},
    {term:'Cursor pagination', aka:['keyset pagination'], def:'Splitting a long list into pages by remembering the last item you saw. Example: “give me 20 orders after order 8451”.'},
    {term:'OpenAPI', def:'A file format that describes an API in a way both people and tools can read. Example: a tool reads the file and builds the API documentation automatically.'},
    {term:'Idempotency', aka:['idempotent'], def:'Doing an action twice has the same result as doing it once. Example: setting a seat to “booked” twice leaves it booked, but adding ₹100 twice charges ₹200.'},
    {term:'Idempotency key', aka:['Idempotency-Key'], def:'A unique ID sent with a request so the server can recognise a retry and not repeat the action. Example: a retried payment carries the same key and is charged only once.'},
    {term:'Retry-After', def:'A response header that tells the client how long to wait before trying again. Example: Retry-After: 30 means wait 30 seconds.'},
    {term:'429 Too Many Requests', aka:['HTTP 429', '429'], def:'An HTTP status code that means you are sending too many requests, so slow down. Example: a client that calls an API 1,000 times a minute may start getting 429 answers.'},
    {term:'Reverse proxy', def:'A server in front of your servers that receives outside requests and passes them on. Example: one public address that forwards to 5 app servers.'},
    {term:'Forward proxy', def:'A server that sends requests out on behalf of users. Example: a company proxy that all employee browsers use to reach the internet.'},
    {term:'API gateway', def:'A reverse proxy for APIs that does shared jobs such as login checks and routing. Example: it sends /orders to the order service and /menu to the menu service.'},
    {term:'BFF', aka:['backend for frontend'], def:'Backend for frontend: a small backend built for one kind of client that gathers just what that client needs. Example: a mobile BFF returns short lists, and a web BFF returns more fields.'}
  ],
  sources:['RFC 1034 and RFC 1035', 'RFC 9293 and RFC 768', 'RFC 8446', 'RFC 9000 and RFC 9110 to RFC 9114', 'GraphQL specification', 'gRPC documentation', 'Stripe and GitHub API documentation']
});
} catch(e){ console.error('[SDA] Module "networking" failed to load', e); window.SDA && SDA.errors.push({id:'networking', error:e}); }
})();
