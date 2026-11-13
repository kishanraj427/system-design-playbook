/* =====================================================================
   PART 6 · MODULE 10 — ARCHITECTURE & PLATFORM
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, esc, clamp, fmtNum, fmtDur, rng} = SDA.u; const ui = SDA.ui;
const {sortGame, orderGame} = SDA.m1helpers; const {fnv, css, frag} = SDA.ph;

/* ---------- widgets ---------- */
function discoveryCalc(host){
  const P = {mode:'client', hb:10, miss:3, refresh:30, hc:5, unhealthy:2, retry:false, rate:30};
  const out = el('div');
  function run(){
    let detect, label;
    if (P.mode === 'client'){ const evict = P.hb * P.miss; const seen = evict + P.refresh; detect = seen; label = `registry evicts after ${P.miss} missed heartbeats (${evict} s), then clients notice on their next cache refresh (up to ${P.refresh} s later)`; }
    else if (P.mode === 'server'){ detect = P.hc * P.unhealthy; label = `the load balancer’s own health checks fail ${P.unhealthy}× at ${P.hc} s intervals`; }
    else { const evict = P.hb * P.miss; detect = evict + P.refresh; label = `DNS record removed after ${evict} s, but resolvers and clients cache it for its TTL (${P.refresh} s)`; }
    const share = 1 / 3; const failing = P.retry ? 0 : P.rate * share * detect;
    const extraLatency = P.retry ? P.rate * share * detect : 0;
    out.innerHTML = '';
    out.append(frag(h.table(['', 'Value'], [['Worst-case time until callers stop using the dead instance', fmtDur(detect * 1000)], ['Why', label], [P.retry ? 'Requests that hit the dead instance and were retried elsewhere' : 'Requests that fail', fmtNum(P.retry ? extraLatency : failing)]], [])));
    out.append(el('div', {class:'verdict ' + (failing > 100 ? 'bad' : failing > 0 ? 'warn' : 'ok')}, P.retry ? 'With one retry to a different instance, users see slower responses instead of errors during the detection window. That is safe only for idempotent calls.' : `At ${P.rate} req/s with 3 instances, a third of traffic hits the dead instance until it is removed. Shorter heartbeats and TTLs shrink the window but add load on the registry and DNS.`));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.select({label:'Discovery style', value:'client', options:[['client', 'Client-side: registry + cached instance list (Eureka-style)'], ['server', 'Server-side: load balancer with health checks'], ['dns', 'DNS-based discovery']], onChange:v => { P.mode = v; run(); }}).el,
    ui.slider({label:'Heartbeat interval', min:1, max:30, value:P.hb, fmt:v => v + ' s', onInput:v => { P.hb = v; run(); }}).el,
    ui.slider({label:'Missed heartbeats before eviction', min:1, max:5, value:P.miss, fmt:v => String(v), onInput:v => { P.miss = v; run(); }}).el,
    ui.slider({label:'Client cache refresh / DNS TTL', min:1, max:120, value:P.refresh, fmt:v => v + ' s', onInput:v => { P.refresh = v; run(); }}).el,
    ui.slider({label:'LB health-check interval', min:1, max:30, value:P.hc, fmt:v => v + ' s', onInput:v => { P.hc = v; run(); }}).el,
    ui.toggle({label:'Retry once on another instance', checked:false, onChange:v => { P.retry = v; run(); }}).el), out);
  run();
}
function compositionSim(host){
  const P = {n:5, med:40, p99:200, fail:.5, mode:'parallel', partial:true, timeout:500};
  const out = el('div');
  function sample(R){ const sigma = Math.log(P.p99 / P.med) / 2.326; const u1 = Math.max(1e-9, R()), u2 = R(); const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); return P.med * Math.exp(sigma * z); }
  function run(){
    const R = rng(3); const N = 20000; const lats = []; let full = 0, part = 0, fail = 0;
    for (let i = 0; i < N; i++){
      let t = 0, okc = 0, firstCriticalOk = true;
      const calls = Array.from({length:P.n}, (_, k) => { let l = sample(R); const err = R() * 100 < P.fail; const to = l > P.timeout; if (to) l = P.timeout; return {l, ok:!err && !to, critical:k === 0}; });
      t = P.mode === 'parallel' ? Math.max(...calls.map(c => c.l)) : calls.reduce((a, c) => a + c.l, 0);
      calls.forEach(c => { if (c.ok) okc++; else if (c.critical) firstCriticalOk = false; });
      lats.push(t);
      if (okc === P.n) full++; else if (P.partial && firstCriticalOk) part++; else fail++;
    }
    lats.sort((a, b) => a - b); const q = p => lats[Math.floor(p * (N - 1))];
    out.innerHTML = '';
    out.append(frag(h.table(['Metric', 'Value'], [['p50 page latency', fmtDur(q(.5))], ['p99 page latency', fmtDur(q(.99))], ['Complete responses', (full * 100 / N).toFixed(1) + '%'], ['Partial responses (optional sections missing)', (part * 100 / N).toFixed(1) + '%'], ['Errors', (fail * 100 / N).toFixed(1) + '%']], [1])));
    const pAll = Math.pow(1 - P.fail / 100, P.n);
    out.append(el('div', {class:'verdict ' + (fail * 100 / N > 1 ? 'bad' : 'ok')}, `With ${P.n} calls each succeeding ${(100 - P.fail).toFixed(1)}% of the time, all of them succeed only ${(pAll * 100).toFixed(1)}% of the time. In parallel the page is as slow as the slowest call: the p99 of the page is worse than any single service’s p99. ${P.partial ? 'Returning partial responses (only call 1 is critical) turns most of those failures into degraded but useful pages.' : 'Without partial responses, any single failure fails the whole page.'}`));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Downstream calls per page', min:1, max:12, value:P.n, fmt:v => String(v), onInput:v => { P.n = v; run(); }}).el,
    ui.select({label:'Composition', value:'parallel', options:[['parallel', 'Parallel fan-out'], ['sequential', 'Sequential (each call waits for the previous)']], onChange:v => { P.mode = v; run(); }}).el,
    ui.slider({label:'Each call: median latency', min:5, max:200, step:5, value:P.med, fmt:v => v + ' ms', onInput:v => { P.med = v; P.p99 = Math.max(P.p99, v + 5); run(); }}).el,
    ui.slider({label:'Each call: p99 latency', min:10, max:1000, step:10, value:P.p99, fmt:v => v + ' ms', onInput:v => { P.p99 = Math.max(v, P.med + 5); run(); }}).el,
    ui.slider({label:'Each call: failure rate', min:0, max:10, step:.1, value:P.fail, fmt:v => v.toFixed(1) + '%', onInput:v => { P.fail = v; run(); }}).el,
    ui.slider({label:'Per-call timeout', min:50, max:2000, step:50, value:P.timeout, fmt:v => v + ' ms', onInput:v => { P.timeout = v; run(); }}).el,
    ui.toggle({label:'Allow partial responses (only call 1 is critical)', checked:true, onChange:v => { P.partial = v; run(); }}).el), out,
    el('p', {class:'lab-hint'}, 'Monte Carlo over 20,000 page requests. Each call’s latency is log-normal, fitted to your median and p99; a call that exceeds the timeout counts as failed.'));
  run();
}
function stranglerDemo(host){
  const ROUTES = [{p:'/search', team:'Discovery'}, {p:'/menu/:id', team:'Catalog'}, {p:'/cart', team:'Ordering'}, {p:'/checkout', team:'Payments'}, {p:'/orders/:id/track', team:'Delivery'}, {p:'/admin/*', team:'Ops'}];
  const st = ROUTES.map(() => ({pct:0})); st[0].pct = 100; st[1].pct = 25;
  const out = el('div'); const R = rng(9);
  function run(){
    out.innerHTML = ''; const tb = el('table', {class:'tbl'}); tb.append(el('thead', null, el('tr', null, el('th', null, 'Route'), el('th', null, 'Owner'), el('th', null, '% to the new service'), el('th', null, 'Status'))));
    const body = el('tbody');
    ROUTES.forEach((r, i) => {
      const s = ui.slider({label:'Traffic to new service for ' + r.p, min:0, max:100, step:5, value:st[i].pct, fmt:v => v + '%', onInput:v => { st[i].pct = v; paintSummary(); }});
      body.append(el('tr', null, el('td', {class:'mono'}, r.p), el('td', null, r.team), el('td', {style:{minWidth:'200px'}}, s.el), el('td', null, st[i].pct === 100 ? '✅ migrated' : st[i].pct > 0 ? '🟡 canary' : '🏚 monolith')));
    });
    tb.append(body); out.append(el('div', {class:'tbl-wrap'}, tb), summary); paintSummary();
  }
  const summary = el('div');
  function paintSummary(){
    const W = [30, 25, 15, 10, 15, 5]; const moved = st.reduce((a, s, i) => a + s.pct * W[i], 0) / 100;
    let mono = 0, neu = 0; for (let k = 0; k < 1000; k++){ const r = R() * 100; let acc = 0, idx = 0; for (; idx < W.length; idx++){ acc += W[idx]; if (r < acc) break; } if (R() * 100 < st[Math.min(idx, 5)].pct) neu++; else mono++; }
    summary.innerHTML = '';
    summary.append(el('div', {class:'verdict ' + (moved >= 99 ? 'ok' : 'warn')}, moved >= 99 ? 'Every route now goes to new services. The monolith gets no traffic and can be switched off: the fig has fully replaced the tree.' : `≈${moved.toFixed(0)}% of traffic (weighted by route volume) is served by new services. In a 1,000-request sample, the proxy sent ${neu} to new services and ${mono} to the monolith. Each route can be rolled back by moving its slider to 0.`));
  }
  host.append(out); run();
}
function lambdaCost(host){
  const P = {reqM:30, ms:120, mem:512, inst:0.05, perInst:150};
  const out = el('div'); const chart = el('div');
  const lam = (reqM) => reqM * 1e6 * .2 / 1e6 + reqM * 1e6 * (P.ms / 1000) * (P.mem / 1024) * .0000166667;
  const con = reqM => { const avgRps = reqM * 1e6 / (30 * 24 * 3600); const peak = avgRps * 3; const n = Math.max(2, Math.ceil(peak / P.perInst)); return n * P.inst * 24 * 30; };
  function run(){
    const a = lam(P.reqM), b = con(P.reqM);
    let cross = null; for (let r = 1; r <= 2000; r += 1){ if (lam(r) > con(r)){ cross = r; break; } }
    out.innerHTML = '';
    out.append(frag(h.table(['Per month', 'Serverless functions', 'Always-on containers'], [['Requests', fmtNum(P.reqM * 1e6), fmtNum(P.reqM * 1e6)], ['Compute billed', fmtNum(P.reqM * 1e6 * P.ms / 1000 * P.mem / 1024) + ' GB-s', `${Math.max(2, Math.ceil(P.reqM * 1e6 / (30 * 24 * 3600) * 3 / P.perInst))} instances × 720 h`], ['Cost (USD)', '$' + a.toFixed(2), '$' + b.toFixed(2)]], [1, 2])));
    out.append(el('div', {class:'verdict ' + (a < b ? 'ok' : 'warn')}, cross ? `${a < b ? 'Serverless is cheaper at this volume.' : 'Containers are cheaper at this volume.'} The lines cross around ${fmtNum(cross * 1e6)} requests/month: below that you pay only for what you use; above it, steady always-on capacity wins.` : 'Serverless stays cheaper across this whole range at these settings.'));
    const W = 640, Ht = 220, L = 60, Rr = 14, T = 14, B = 36; const maxR = Math.max(200, (cross || 200) * 1.6); const pts = 60; const ya = [], yb = [];
    for (let i = 0; i <= pts; i++){ const r = maxR * i / pts; ya.push([r, lam(r)]); yb.push([r, con(r)]); }
    const my = Math.max(...ya.map(p => p[1]), ...yb.map(p => p[1])) * 1.05; const X = r => L + r / maxR * (W - L - Rr), Y = v => Ht - B - v / my * (Ht - T - B); const path = arr => arr.map(([x, y], i) => (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1)).join('');
    chart.innerHTML = `<div class="chart-box"><svg viewBox="0 0 ${W} ${Ht}" class="mini-chart" role="img"><title>Monthly cost versus monthly requests: serverless and containers</title>${[0, .5, 1].map(f => `<line class="gridl" x1="${L}" x2="${W - Rr}" y1="${Y(my * f)}" y2="${Y(my * f)}"/><text x="${L - 6}" y="${Y(my * f) + 4}" text-anchor="end">$${fmtNum(my * f)}</text>`).join('')}${[0, .5, 1].map(f => `<text x="${X(maxR * f)}" y="${Ht - B + 16}" text-anchor="middle">${fmtNum(maxR * f)}M</text>`).join('')}<line class="axis" x1="${L}" x2="${W - Rr}" y1="${Ht - B}" y2="${Ht - B}"/><line class="axis" x1="${L}" x2="${L}" y1="${T}" y2="${Ht - B}"/><text x="${(W + L) / 2}" y="${Ht - 4}" text-anchor="middle">requests per month</text><path d="${path(ya)}" fill="none" stroke-width="2.4" style="stroke:var(--accent2)"/><path d="${path(yb)}" fill="none" stroke-width="2.4" style="stroke:var(--accent1)"/><line x1="${X(P.reqM)}" x2="${X(P.reqM)}" y1="${T}" y2="${Ht - B}" class="gridl" style="stroke:var(--text)"/><text x="${L + 8}" y="${T + 12}" style="fill:var(--accent2)">serverless</text><text x="${L + 8}" y="${T + 28}" style="fill:var(--accent1)">containers (step = +1 instance)</text></svg></div>`;
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Requests per month', min:1, max:2000, step:1, value:P.reqM, fmt:v => fmtNum(v * 1e6), onInput:v => { P.reqM = v; run(); }}).el,
    ui.slider({label:'Avg function duration', min:10, max:2000, step:10, value:P.ms, fmt:v => v + ' ms', onInput:v => { P.ms = v; run(); }}).el,
    ui.select({label:'Function memory', value:'512', options:[['128', '128 MB'], ['256', '256 MB'], ['512', '512 MB'], ['1024', '1 GB'], ['2048', '2 GB']], onChange:v => { P.mem = +v; run(); }}).el,
    ui.slider({label:'Container cost per instance-hour', min:.01, max:.5, step:.01, value:P.inst, fmt:v => '$' + v.toFixed(2), onInput:v => { P.inst = v; run(); }}).el,
    ui.slider({label:'Requests/s one container handles', min:20, max:2000, step:10, value:P.perInst, fmt:v => v + ' rps', onInput:v => { P.perInst = v; run(); }}).el), out, chart,
    el('p', {class:'lab-hint'}, 'Serverless uses AWS Lambda’s published x86 list prices at the time of writing ($0.20 per million requests + $0.0000166667 per GB-second), ignoring the free tier. Check current pricing for your region. Container cost is an illustrative input; the fleet is sized for 3× average traffic with a minimum of 2 instances. Ops effort, cold starts and lock-in are not in this chart but matter just as much.'));
  run();
}
function reconcileDemo(host, api){
  const P = {desired:4}; let pods = [], seq = 0, t = 0, nodesDown = {}, lastLoop = 0, running = !api.reduced;
  const NODES = ['node-1', 'node-2', 'node-3'];
  const view = el('div', {class:'grid c3'}); const logBox = el('div', {class:'lab-out', style:{maxHeight:'150px', borderRadius:'10px', border:'1px solid var(--border)'}, 'aria-live':'polite'});
  const log = (txt, cls) => { logBox.prepend(el('div', {class:'ln ' + (cls || '')}, `[${t.toFixed(1)} s] ${txt}`)); while (logBox.childNodes.length > 40) logBox.lastChild.remove(); };
  const newPod = () => { const free = NODES.filter(n => !nodesDown[n]); const load = n => pods.filter(p => p.node === n && p.state !== 'gone').length; const node = free.sort((a, b) => load(a) - load(b))[0]; if (!node) return null; const p = {id:'web-' + (++seq).toString(36) + Math.floor(Math.random() * 1e3), node, state:'pending', since:t}; pods.push(p); return p; };
  function reconcile(){
    const live = pods.filter(p => p.state !== 'gone' && p.state !== 'terminating');
    if (live.length < P.desired){ for (let k = live.length; k < P.desired; k++){ const p = newPod(); if (p) log(`ReplicaSet: ${live.length} running < desired ${P.desired} → create ${p.id} on ${p.node}`); else { log('No schedulable node: pod stays Pending.', 'err'); break; } } }
    else if (live.length > P.desired){ live.slice(P.desired).forEach(p => { p.state = 'terminating'; p.since = t; log(`ReplicaSet: ${live.length} > desired ${P.desired} → terminate ${p.id}`); }); }
  }
  function step(dt){
    t += dt;
    pods.forEach(p => { if (p.state === 'pending' && t - p.since > .8){ p.state = 'starting'; p.since = t; } else if (p.state === 'starting' && t - p.since > 1.5){ p.state = 'ready'; log(`${p.id} passed its readiness probe → added to Service endpoints`, 'ok'); } else if (p.state === 'terminating' && t - p.since > 1){ p.state = 'gone'; } });
    pods = pods.filter(p => p.state !== 'gone');
    if (t - lastLoop >= 1){ lastLoop = t; reconcile(); }
  }
  function render(){
    view.innerHTML = '';
    NODES.forEach(n => { const card = el('div', {class:'card', style:{padding:'10px', opacity:nodesDown[n] ? '.5' : '1'}}, el('b', null, (nodesDown[n] ? '💀 ' : '🖥 ') + n)); const list = el('div', {class:'pill-row', style:{marginTop:'6px'}}); pods.filter(p => p.node === n).forEach(p => { const c = p.state === 'ready' ? 'var(--ok)' : p.state === 'terminating' ? 'var(--bad)' : 'var(--warn)'; list.append(el('span', {class:'chip mono', style:{borderColor:c, color:c}}, `${p.id} · ${p.state}`)); }); card.append(list); view.append(card); });
    const ready = pods.filter(p => p.state === 'ready').length; stat.textContent = `desired ${P.desired} · ready ${ready} · total ${pods.length}`;
  }
  const stat = el('span', {class:'chip mono'});
  api.loop(dt => { if (!running) return; step(dt); render(); });
  const runBtn = ui.button(running ? '⏸ Pause' : '▶ Play', () => { running = !running; runBtn.innerHTML = running ? '⏸ Pause' : '▶ Play'; }, 'sm');
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'spec.replicas (desired state)', min:0, max:9, value:P.desired, fmt:v => String(v), onInput:v => { P.desired = v; log(`kubectl scale --replicas=${v}`); }}).el),
    el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('💥 Delete a random pod', () => { const live = pods.filter(p => p.state === 'ready'); if (!live.length) return; const p = live[Math.floor(Math.random() * live.length)]; p.state = 'gone'; pods = pods.filter(x => x !== p); log(`kubectl delete pod ${p.id}`, 'err'); render(); }, 'sm'),
      ui.button('🔌 Fail node-2', () => { if (nodesDown['node-2']) return; nodesDown['node-2'] = true; const lost = pods.filter(p => p.node === 'node-2'); pods = pods.filter(p => p.node !== 'node-2'); log(`node-2 NotReady → ${lost.length} pod(s) lost; they will be recreated on healthy nodes`, 'err'); render(); }, 'sm'),
      ui.button('🔧 Repair node-2', () => { if (!nodesDown['node-2']) return; delete nodesDown['node-2']; log('node-2 Ready again (existing pods are not moved back automatically)'); }, 'sm'),
      runBtn, ui.button('⏭ Step 1 s', () => { running = false; runBtn.innerHTML = '▶ Play'; for (let i = 0; i < 10; i++) step(.1); render(); }, 'sm'), stat),
    view, el('div', {style:{height:'10px'}}), logBox,
    el('p', {class:'lab-hint'}, 'The controller runs a reconcile loop every second: observe the actual pods, compare with spec.replicas, act on the difference. It never tracks “what I did last time”, so any change from any cause is corrected the same way.' + (api.reduced ? ' Reduced motion is on, so press Play or Step.' : '')));
  for (let i = 0; i < 40; i++) step(.1); render();
}
function tenancyCompare(host){
  const P = {tenants:200, big:5}; const out = el('div');
  function run(){
    const silo = P.tenants * 1.0, pool = 4 + P.tenants * .05, bridge = 4 + (P.tenants - P.big) * .05 + P.big * 1.0;
    out.innerHTML = '';
    out.append(frag(h.table(['Model', 'What tenants share', 'Infra cost (illustrative units)', 'Isolation & noisy neighbours', 'Ops effort', 'Typical fit'], [
      ['<b>Silo</b>', 'Nothing: a stack (or DB) per tenant', fmtNum(silo), 'Strongest; one tenant can’t slow another', 'High: N deployments, N migrations', 'Few large, regulated customers'],
      ['<b>Pool</b>', 'Everything; rows tagged with tenant_id', fmtNum(pool), 'Weakest: needs per-tenant quotas and row-level security', 'Low: one deployment', 'Many small tenants (SMB SaaS)'],
      ['<b>Bridge / tiered</b>', `Pool for most; silo for the top ${P.big}`, fmtNum(bridge), 'Strong for premium tenants, pooled for the rest', 'Medium', 'Mixed customer base']], [2])));
    out.append(el('div', {class:'verdict ok'}, `With ${P.tenants} tenants, silo costs about ${(silo / pool).toFixed(0)}× a fully pooled design. That is why most SaaS products pool small tenants and offer dedicated (silo) deployments as a premium tier.`));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Number of tenants', min:5, max:5000, step:5, value:P.tenants, fmt:v => fmtNum(v), onInput:v => { P.tenants = v; P.big = Math.min(P.big, v); run(); }}).el, ui.slider({label:'Enterprise tenants needing dedicated stacks', min:0, max:50, value:P.big, fmt:v => String(v), onInput:v => { P.big = Math.min(v, P.tenants); run(); }}).el), out,
    el('p', {class:'lab-hint'}, 'Illustrative cost model: a dedicated stack ≈ 1 unit per tenant; a pooled stack ≈ 4 units base + 0.05 per tenant.'));
  run();
}
function flagDemo(host){
  const users = ['asha', 'rahul', 'meera', 'arjun', 'zoya', 'kabir', 'neha', 'vikram', 'ishaan', 'priya', 'sana', 'dev', 'tara', 'omar', 'anya', 'rohan', 'kavya', 'nikhil', 'divya', 'farhan'];
  const city = u => ['Pune', 'Delhi', 'Chennai', 'Kolkata'][fnv(u + ':city') % 4];
  const P = {pct:20, kill:false, pune:false, flag:'new-checkout'}; const grid = el('div', {class:'pill-row'}); const out = el('div');
  const bucket = u => fnv(P.flag + ':' + u) % 100;
  function on(u){ if (P.kill) return false; if (P.pune && city(u) === 'Pune') return true; return bucket(u) < P.pct; }
  function run(){
    grid.innerHTML = ''; let n = 0;
    users.forEach(u => { const yes = on(u); if (yes) n++; grid.append(el('span', {class:'chip mono', title:`bucket ${bucket(u)} · ${city(u)}`, style:{borderColor:yes ? 'var(--ok)' : 'var(--border)', color:yes ? 'var(--ok)' : 'var(--muted)', background:yes ? 'var(--ok-bg)' : 'transparent'}}, `${yes ? '✔' : '·'} ${u} <${bucket(u)}>`)); });
    out.innerHTML = ''; out.append(el('div', {class:'verdict ' + (P.kill ? 'bad' : 'ok')}, P.kill ? 'Kill switch ON: the feature is off for everyone instantly, with no deploy. That is your fastest rollback.' : `${n}/20 users see “${P.flag}”. Each user’s bucket = hash(flag + user) mod 100, so raising the percentage only <b>adds</b> users: nobody flips back and forth, and each flag gets an independent sample.`.replace(/<b>|<\/b>/g, '')));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Rollout percentage', min:0, max:100, step:5, value:P.pct, fmt:v => v + '%', onInput:v => { P.pct = v; run(); }}).el, ui.select({label:'Flag', value:P.flag, options:[['new-checkout', 'new-checkout'], ['upi-autopay', 'upi-autopay']], onChange:v => { P.flag = v; run(); }}).el),
    el('div', {class:'controls', style:{margin:'8px 0'}}, ui.toggle({label:'Target rule: everyone in Pune', checked:false, onChange:v => { P.pune = v; run(); }}).el, ui.toggle({label:'🚨 Kill switch', checked:false, onChange:v => { P.kill = v; run(); }}).el), grid, out);
  run();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'ddd-bounded-contexts', title:'Domain-driven design and bounded contexts', minutes:12, tags:['DDD','bounded context','ubiquitous language','aggregate','context map'],
  summary:'DDD models software around the business domain. A bounded context is a boundary where each term has one precise meaning. Contexts are the best guide for where to draw service and team boundaries.',
  problem:`<p>In a food-delivery company, “order” means different things to different teams. To <b>Ordering</b> it’s a cart that became a purchase. To <b>Restaurant</b> it’s a ticket to cook. To <b>Delivery</b> it’s a pickup and a drop. To <b>Payments</b> it’s money to capture and refund. One giant shared <code>Order</code> table with 140 columns serves everyone badly, and every change needs five teams to agree.</p>`,
  intuition:`The word “bat” means one thing in a cricket commentary box and another in a zoo. Neither is wrong; each is right <i>inside its own context</i>. Bounded contexts give each part of the business its own dictionary and model, and agree only on how they talk to each other.`,
  how:{
    steps:[`Talk to domain experts and build a <b>ubiquitous language</b>: the exact words the business uses, also used in code.`, `Find <b>subdomains</b>: <i>core</i> (your competitive edge, e.g. delivery dispatch), <i>supporting</i>, and <i>generic</i> (auth, email; buy these).`, `Draw <b>bounded contexts</b> where language and rules change. Each owns its model and data.`, `Inside a context, group invariants into <b>aggregates</b> (e.g. Order with its line items), changed in one transaction through the aggregate root.`, `Connect contexts with a <b>context map</b>: published events (“OrderPlaced”), APIs, and <b>anti-corruption layers</b> that translate foreign models.`, `Align teams and services with contexts (Conway’s law), not with technical layers.`],
    diagram:{title:'Bounded contexts in food delivery', w:800, h:270, alt:'Ordering publishes OrderPlaced; Restaurant, Delivery and Payments each consume it into their own model.',
      nodes:[{id:'ord', type:'service', label:'Ordering', sub:'Order, Cart', x:120, y:135, w:130}, {id:'bus', type:'queue', label:'Event bus', sub:'OrderPlaced', x:320, y:135, w:130}, {id:'rest', type:'service', label:'Restaurant', sub:'KitchenTicket', x:540, y:45, w:140}, {id:'del', type:'service', label:'Delivery', sub:'Trip, Rider', x:540, y:135, w:140}, {id:'pay', type:'service', label:'Payments', sub:'Charge, Refund', x:540, y:225, w:140}, {id:'acl', type:'ext', label:'Anti-corruption layer', sub:'bank API → Charge', x:730, y:225, w:150}],
      edges:[{from:'ord', to:'bus'}, {from:'bus', to:'rest'}, {from:'bus', to:'del'}, {from:'bus', to:'pay'}, {from:'pay', to:'acl'}],
      steps:[
        {note:'Ordering owns the <b>Order</b> aggregate. When checkout completes it publishes <code>OrderPlaced</code> with only the facts others need.', flow:[['ord', 'bus', 'OrderPlaced']], hl:['ord']},
        {note:'Each context builds <b>its own model</b> from the event: a KitchenTicket, a delivery Trip, a Charge. No shared table.', flow:[['bus', 'rest', 'ticket'], ['bus', 'del', 'trip'], ['bus', 'pay', 'charge']], parallel:true},
        {note:'Payments talks to an external bank API through an <b>anti-corruption layer</b>, so the bank’s odd field names never leak into the domain model.', flow:[['pay', 'acl', 'Charge → bank format']], hl:['acl']}
      ]},
    deep:`<p><b>Aggregates and consistency:</b> an aggregate is the unit of transactional consistency. Rules that must always hold (an order’s total equals its line items) live inside one aggregate; rules across aggregates or contexts (a rider is assigned within 2 minutes) are eventually consistent, via events and sagas. Keep aggregates small: a giant aggregate means lock contention.</p><p><b>Context-map relationships:</b> partnership, shared kernel (a small shared model, used carefully), customer–supplier, conformist (you accept the upstream model), anti-corruption layer (you translate it), open-host service with a published language (a stable public API/events). Naming these makes integration costs explicit.</p><p><b>Boundaries ≠ microservices:</b> a bounded context can be a module in a modular monolith first. Start with clear contexts in one deployable and extract services when team scale or operational needs justify it.</p>`
  },
  tradeoffs:{use:[`Complex business domains with many teams and evolving rules`, `Deciding microservice or module boundaries`], avoid:[`Heavy DDD ceremony for simple CRUD apps`, `One context per entity (“nano-services”), which leads to chatty, coupled services`], alt:[`Modular monolith with context modules`, `Data-oriented design for analytics-heavy systems`]},
  real:[
    {co:'Uber — DOMA', tier:'confirmed', text:'Uber described reorganising around 2,200 microservices into about 70 domains with gateways and layers (Domain-Oriented Microservice Architecture), to reduce the complexity of service-to-service dependencies.', src:'Uber Engineering, “Introducing Domain-Oriented Microservice Architecture” (2020)'},
    {co:'Eric Evans', tier:'confirmed', text:'Domain-Driven Design (2003) introduced ubiquitous language, bounded contexts, aggregates and context maps.', src:'Evans, Domain-Driven Design: Tackling Complexity in the Heart of Software (2003)'},
    {co:'Food-delivery contexts', tier:'educational', text:'Ordering, Restaurant, Delivery, Payments and Support as separate contexts that integrate through events such as OrderPlaced and OrderDelivered.', src:'Simplified educational design'}
  ],
  mistakes:[`A shared “common” database model used by every service`, `Splitting by technical layer (UI team, DB team) instead of by domain`, `Huge aggregates that lock half the system on every write`],
  interview:[`Before drawing boxes, name the bounded contexts and what each owns`, `Use events between contexts and explain which invariants are strong vs eventual`],
  tryit:{note:'Which bounded context should own each concept?', mount:host => sortGame(host, [
    {t:'Delivery partner’s live location', c:'del', why:'Dispatch and tracking are delivery concerns.'},
    {t:'Refund to the customer’s UPI', c:'pay', why:'Money movement belongs to payments.'},
    {t:'Items and quantities in the cart', c:'ord', why:'Ordering owns the cart and order aggregate.'},
    {t:'Promised drop-off ETA', c:'del', why:'Computed by delivery from rider and route.'},
    {t:'Order total incl. coupon', c:'ord', why:'Pricing the order is part of ordering.'},
    {t:'Bank settlement reconciliation', c:'pay', why:'Ledger and settlement are payments.'}
  ], [{id:'ord', label:'Ordering'}, {id:'del', label:'Delivery'}, {id:'pay', label:'Payments'}])},
  sources:[`Evans, Domain-Driven Design (2003)`, `Vernon, Implementing Domain-Driven Design (2013)`, `Uber Engineering — DOMA (2020)`, `Conway, “How Do Committees Invent?” (1968)`]
},
{
  id:'service-discovery', title:'Service discovery', minutes:9, tags:['service discovery','registry','Eureka','Consul','DNS','Kubernetes Service'],
  summary:'In a dynamic fleet, instances come and go every minute. Service discovery keeps an up-to-date list of healthy instances (client-side, server-side or DNS-based) so callers always find a live one.',
  problem:`<p>Your order service used to call <code>10.0.3.17:8080</code>. Then you added autoscaling, rolling deploys and spot instances. Addresses change all day, and hard-coded IPs mean outages after every deploy. Callers need to ask “where are the healthy payment instances <i>right now</i>?”</p>`,
  intuition:`A hospital switchboard. You don’t memorise which doctor is on duty in which room; you call the switchboard (registry), which knows who has checked in for the shift (registered) and who has gone home (missed heartbeats).`,
  how:{
    steps:[`Instances <b>register</b> on start (name, address, port, metadata) and send <b>heartbeats</b>, or a platform registers them for you (Kubernetes).`, `The registry <b>evicts</b> instances that miss heartbeats or fail health checks.`, `<b>Client-side discovery</b>: the caller fetches and caches the instance list and load-balances itself (Netflix Eureka + Ribbon, gRPC xDS).`, `<b>Server-side discovery</b>: the caller hits a stable load balancer or virtual IP that knows the instances (AWS ALB target groups, Kubernetes Service + kube-proxy).`, `<b>DNS-based</b>: names resolve to current instance IPs (Consul DNS, Kubernetes CoreDNS); simple, but caches and TTLs delay updates.`],
    diagram:{title:'Registration, heartbeats and lookup', w:780, h:250, alt:'Payment instances register with a registry; the order service looks them up and calls one directly.',
      nodes:[{id:'o', type:'service', label:'Order service', x:110, y:125, w:130}, {id:'reg', type:'db', label:'Service registry', sub:'payments → [a, b, c]', x:360, y:125, w:170}, {id:'a', type:'service', label:'payments-a', x:640, y:45, w:120}, {id:'b', type:'service', label:'payments-b', x:640, y:125, w:120}, {id:'c', type:'service', label:'payments-c', x:640, y:205, w:120}],
      edges:[{from:'a', to:'reg'}, {from:'b', to:'reg'}, {from:'c', to:'reg'}, {from:'o', to:'reg'}, {from:'o', to:'b', dashed:true}],
      steps:[
        {note:'Each instance <b>registers</b> and then sends a heartbeat every few seconds.', flow:[['a', 'reg', 'register'], ['b', 'reg', 'register'], ['c', 'reg', 'register']], parallel:true},
        {note:'The order service asks for <code>payments</code>, caches the list, and calls one instance directly.', flow:[['o', 'reg', 'lookup'], ['reg', 'o', '[a,b,c]'], ['o', 'b', 'charge']]},
        {note:'payments-c dies and stops heartbeating. After N missed beats the registry <b>evicts</b> it; callers drop it on their next refresh.', status:{c:'down'}, sub:{reg:'payments → [a, b]'}, hl:['reg']}
      ]},
    mount:host => discoveryCalc(host),
    deep:`<p><b>Consistency vs availability of the registry:</b> Eureka chose availability. During a network partition it keeps (possibly stale) registrations rather than evicting everything, through a “self-preservation” mode. Consul and etcd/ZooKeeper-based registries use consensus (strongly consistent writes), so a partitioned minority can’t accept updates. For discovery, slightly stale data plus client retries usually beats no data.</p><p><b>Kubernetes:</b> a Service gets a stable virtual IP and DNS name; the EndpointSlice controller tracks ready pod IPs (readiness probes decide); kube-proxy or an eBPF dataplane (e.g. Cilium) routes the virtual IP to pods. Headless Services return pod IPs directly for client-side balancing (used by gRPC and databases).</p><p><b>Graceful shutdown:</b> deregister first, wait for propagation (callers’ caches, LB deregistration delay), then stop accepting requests. Otherwise every deploy causes errors.</p>`
  },
  tradeoffs:{use:[`Any fleet where instances change: autoscaling, containers, rolling deploys`], avoid:[`Long DNS TTLs for fast-changing fleets`, `Client libraries in many languages for client-side discovery (consider a mesh/proxy)`], alt:[`Server-side load balancers with health checks`, `Service mesh (xDS) for discovery + traffic policy`, `Static config for tiny, stable systems`]},
  real:[
    {co:'Netflix Eureka', tier:'confirmed', text:'Netflix open-sourced Eureka, a REST-based registry used for client-side discovery and mid-tier load balancing in AWS, which favours availability with self-preservation mode during partitions.', src:'Netflix Eureka wiki and Netflix Tech Blog'},
    {co:'Kubernetes', tier:'confirmed', text:'Services provide stable DNS names and virtual IPs; EndpointSlices list ready pod addresses, updated from readiness probes.', src:'Kubernetes documentation — Service, EndpointSlices'},
    {co:'HashiCorp Consul', tier:'confirmed', text:'Consul provides a registry with health checks, DNS and HTTP interfaces, and uses Raft for consistent server state.', src:'Consul documentation'}
  ],
  mistakes:[`Killing instances before deregistering (errors on every deploy)`, `Health checks that only test “process is up”, not “can serve”`, `Caching discovery results forever`],
  interview:[`Pick client-side vs server-side discovery and explain detection time vs registry load`, `Mention readiness probes and graceful deregistration`],
  tryit:{note:'Use the calculator above, then check yourself:', quiz:[{q:'An instance dies. Heartbeats every 10 s, eviction after 3 misses, client cache refresh every 30 s. Worst case until callers stop using it?', options:['10 s', '30 s', '60 s', '3 min'], answer:2, why:'30 s to evict + up to 30 s until the cache refreshes.'}], quizId:'arch-l2'},
  sources:[`Netflix Eureka`, `Kubernetes Service docs`, `Consul docs`, `Richardson, Microservices Patterns (2018), ch. 3`]
},
{
  id:'service-mesh-sidecar', title:'Service mesh and the sidecar pattern', minutes:10, tags:['service mesh','sidecar','Envoy','Istio','Linkerd','mTLS'],
  summary:'A service mesh moves networking concerns (mTLS, retries, timeouts, load balancing, traffic splitting and telemetry) out of application code into proxies (sidecars) managed by a central control plane.',
  problem:`<p>You have 300 services in Java, Go, Node and Python. Security wants mutual TLS everywhere, SRE wants consistent retries, timeouts and metrics, and the release team wants 1% canaries. Implementing all of that in four languages, in every service, and keeping it consistent is impossible.</p>`,
  intuition:`Every office building has a security desk and a mail room. Employees don’t personally check IDs or sort post; the building staff do it the same way for everyone, following rules set by facilities management (control plane). The sidecar is that desk, sitting right next to each service.`,
  how:{
    steps:[`Each service instance gets a <b>sidecar proxy</b> (usually Envoy) in the same pod; traffic in and out is transparently routed through it.`, `The <b>data plane</b> (all proxies) does mTLS, load balancing, retries, timeouts, circuit breaking and emits metrics/traces.`, `The <b>control plane</b> (Istio’s istiod, Linkerd’s control plane) pushes config, certificates and service discovery to proxies (Envoy uses the xDS APIs).`, `Operators declare policy (“5% of traffic to v2”, “only orders may call payments”) and it applies everywhere without code changes.`, `Newer <b>sidecar-less</b> modes (Istio ambient, eBPF meshes) move the proxy to a per-node component to cut overhead.`],
    diagram:{title:'Sidecars and the control plane', w:800, h:260, alt:'Orders calls payments through two sidecar proxies using mTLS; a control plane configures both.',
      nodes:[{id:'o', type:'service', label:'Orders app', x:90, y:150, w:120}, {id:'so', type:'lb', label:'Envoy sidecar', x:260, y:150, w:130}, {id:'sp', type:'lb', label:'Envoy sidecar', x:520, y:150, w:130}, {id:'p', type:'service', label:'Payments app', x:700, y:150, w:130}, {id:'cp', type:'ext', label:'Control plane', sub:'config · certs · discovery', x:390, y:45, w:200}],
      edges:[{from:'o', to:'so'}, {from:'so', to:'sp'}, {from:'sp', to:'p'}, {from:'cp', to:'so', dashed:true}, {from:'cp', to:'sp', dashed:true}],
      steps:[
        {note:'The control plane pushes routes, retry/timeout policy and short-lived <b>certificates</b> to every sidecar.', flow:[['cp', 'so', 'xDS config'], ['cp', 'sp', 'xDS config']], parallel:true},
        {note:'Orders calls <code>payments</code> over plain HTTP to <i>localhost</i>; its sidecar takes over.', flow:[['o', 'so', 'POST /charge']]},
        {note:'Sidecar to sidecar: <b>mTLS</b> (both sides verify identity), retries with timeouts, and metrics and traces recorded, all with no app code.', flow:[['so', 'sp', 'mTLS'], ['sp', 'p', 'POST /charge']], hl:['so', 'sp']}
      ]},
    deep:`<p><b>Costs:</b> two extra proxy hops per call (usually around a millisecond, depending on load and config), CPU and memory per pod (thousands of pods × an Envoy each adds up), a control plane to operate and upgrade, and a big new surface for misconfiguration. Debugging gains a layer: “is it my app or the mesh?”</p><p><b>When it pays off:</b> many services, many languages, strict security (zero trust, mTLS everywhere), and frequent progressive delivery. For 10 services in one language, a good RPC library may be simpler.</p><p><b>Sidecar pattern beyond meshes:</b> log shippers, secret fetchers, config reloaders, and protocol adapters attached next to an app in the same pod, sharing network and volumes.</p>`
  },
  tradeoffs:{use:[`Large polyglot fleets needing uniform mTLS, policy and telemetry`, `Progressive delivery (canaries, traffic shifting) across many services`], avoid:[`Small systems where the mesh is more complex than the services`, `Teams without capacity to operate the control plane`], alt:[`Shared RPC libraries (e.g. gRPC with interceptors)`, `API gateway for north–south traffic only`, `Sidecar-less (ambient/eBPF) meshes`]},
  real:[
    {co:'Lyft → Envoy', tier:'confirmed', text:'Lyft built Envoy to handle service-to-service networking for its polyglot microservices and open-sourced it in 2016; it became the data plane for Istio and many API gateways.', src:'Lyft Engineering, “Announcing Envoy” (2016); Envoy documentation'},
    {co:'Istio', tier:'confirmed', text:'Istio uses Envoy sidecars configured by istiod for mTLS, traffic management and telemetry, and offers an ambient mode without per-pod sidecars.', src:'Istio documentation'},
    {co:'Linkerd', tier:'confirmed', text:'A CNCF-graduated service mesh with its own lightweight Rust micro-proxy, focusing on simplicity and automatic mTLS.', src:'Linkerd documentation'}
  ],
  mistakes:[`Adopting a mesh to fix problems that are really missing timeouts and ownership`, `Retries configured both in the app and the mesh (multiplied retries)`, `Ignoring the resource cost of thousands of sidecars`],
  interview:[`Explain data plane vs control plane and what the mesh does (mTLS, retries, traffic split, telemetry)`, `Give the costs and when a library is enough`],
  tryit:{note:'Where should this concern live?', mount:host => sortGame(host, [
    {t:'Mutual TLS between all services', c:'mesh', why:'Uniform, policy-driven, transparent to code.'},
    {t:'Validating that a coupon is still valid', c:'app', why:'Business logic stays in the app.'},
    {t:'Send 5% of traffic to v2', c:'mesh', why:'Traffic splitting is a routing policy.'},
    {t:'Calculating delivery fee by distance', c:'app', why:'Domain rule.'},
    {t:'Per-request latency metrics and traces', c:'mesh', why:'Proxies can emit consistent telemetry.'},
    {t:'Deciding a refund is allowed after 7 days', c:'app', why:'Business policy.'}
  ], [{id:'mesh', label:'Service mesh'}, {id:'app', label:'Application code'}])},
  sources:[`Envoy and Istio documentation`, `Lyft Engineering — Envoy (2016)`, `Linkerd documentation`, `Burns & Oppenheimer, “Design patterns for container-based distributed systems”, HotCloud 2016`]
},
{
  id:'api-composition', title:'API composition and aggregation', minutes:9, tags:['API composition','aggregation','fan-out','GraphQL federation','partial response'],
  summary:'A screen often needs data from many services. An API composer (gateway, BFF or GraphQL layer) calls them, usually in parallel, and merges the results, which raises tail latency and partial-failure problems.',
  problem:`<p>A restaurant page needs the menu (Catalog), ratings (Reviews), offers (Promotions), ETA (Delivery) and favourites (Profile). The mobile app making five calls over 4G is slow and battery-hungry. So the server composes them, and now one slow Reviews call can make the whole page slow or fail it entirely.</p>`,
  intuition:`A wedding planner. Instead of you calling the caterer, decorator, DJ and photographer, the planner calls all of them at the same time and gives you one plan. The plan is ready only when the slowest vendor replies, unless the planner says “we’ll confirm the DJ later”.`,
  how:{
    steps:[`The composer receives one client request and determines which downstream calls are needed.`, `Make independent calls <b>in parallel</b>; chain only true dependencies (you need the restaurant ID before its menu).`, `Give each call a <b>timeout</b> inside the overall deadline; mark which calls are <b>critical</b>.`, `<b>Merge</b> results into the client’s shape; on optional failures return a <b>partial response</b> with flags (“reviews unavailable”).`, `Cache stable parts (menu) and avoid N+1 patterns by batching (DataLoader-style).`],
    mount:host => compositionSim(host),
    deep:`<p><b>Tail amplification:</b> in a parallel fan-out the page latency is the <i>maximum</i> of N call latencies. If each call is slow 1% of the time, a page with 10 calls is slow about 10% of the time (1 − 0.99¹⁰ ≈ 9.6%). Mitigations: fewer calls (precomputed read models/CQRS), tighter timeouts with partial results, hedged requests for idempotent reads, and caching.</p><p><b>GraphQL federation:</b> each domain team owns a subgraph schema; a gateway/router composes a supergraph and plans queries across subgraphs. This gives clients flexible queries while teams keep ownership, but it needs query-cost limits and careful N+1 batching.</p><p><b>Consistency:</b> composed data comes from different services at slightly different moments, so the page may show a price from one second and stock from the next. If an invariant spans services, it needs a single owner, not composition.</p>`
  },
  tradeoffs:{use:[`Screens needing data from several services`, `Mobile clients on slow networks (one round trip)`], avoid:[`Deep sequential chains of calls in the request path`, `Composition for data that must be transactionally consistent`], alt:[`Precomputed read models via events (CQRS)`, `BFF per client type`, `GraphQL federation`]},
  real:[
    {co:'Netflix', tier:'confirmed', text:'Netflix moved its API layer toward GraphQL federation, letting domain teams own subgraphs while a gateway composes the unified graph for clients.', src:'Netflix Tech Blog, “How Netflix Scales its API with GraphQL Federation” (2020)'},
    {co:'Google — The Tail at Scale', tier:'confirmed', text:'Dean and Barroso showed that fan-out amplifies tail latency and described hedged and tied requests to mitigate it.', src:'Dean & Barroso, “The Tail at Scale”, CACM (2013)'},
    {co:'Restaurant page composition', tier:'educational', text:'A BFF fetches catalog, reviews, offers and ETA in parallel with per-call timeouts and returns the menu even if offers time out.', src:'Simplified educational design'}
  ],
  mistakes:[`Sequential awaits for independent calls`, `No per-call timeout: the slowest dependency sets page latency`, `Failing the whole page for an optional section`],
  interview:[`Mark critical vs optional data, parallelise, set timeouts, and return partial responses`, `Mention tail amplification and read models for hot screens`],
  tryit:{note:'Increase the number of calls and the failure rate above. Then switch to sequential and compare the p99.', quiz:[{q:'10 parallel calls each have p99 = 200 ms. The page’s p99 is…', options:['20 ms', '200 ms', 'Higher than 200 ms', '2,000 ms always'], answer:2, why:'Max of 10 samples is slow far more often than any single call.'}], quizId:'arch-l4'},
  sources:[`Netflix Tech Blog (2020)`, `Dean & Barroso, CACM 2013`, `Richardson, Microservices Patterns, ch. 7`]
},
{
  id:'strangler-fig', title:'Migrating with the strangler fig pattern', minutes:10, tags:['strangler fig','migration','legacy','routing','incremental'],
  summary:'Replace a legacy system incrementally: put a routing facade in front, move one capability at a time to new code, shift traffic gradually with rollback, and retire the old system when nothing calls it.',
  problem:`<p>A 12-year-old ticketing monolith is slow to change and hard to scale. The “big-bang rewrite” plan takes 2 years, freezes features, and on cut-over day the new system misses 300 undocumented behaviours. Most such rewrites fail or run far over time. You need a way to modernise while the business keeps running.</p>`,
  intuition:`A strangler fig grows around an old tree: it starts small, wraps around it branch by branch, and eventually stands on its own once the old tree is gone. Renovating a house room by room while the family keeps living in it works the same way.`,
  how:{
    steps:[`Put a <b>facade</b> (reverse proxy, API gateway) in front of the monolith. At first it routes 100% to the old system.`, `Pick a <b>thin, valuable slice</b> (one route or capability) with clear boundaries.`, `Build it in the new service; sync data with <b>CDC</b>, events or dual reads (avoid dual writes).`, `Shift traffic gradually (shadow → 1% → 25% → 100%), comparing results and keeping instant rollback.`, `Delete the old code path once nothing uses it. Repeat until the monolith is empty or small enough to keep.`],
    mount:host => stranglerDemo(host),
    deep:`<p><b>Data is the hard part:</b> code moves easily; ownership of tables does not. Options: the new service reads the old DB at first (then takes ownership); CDC from the monolith’s DB into the new store; event interception (publish domain events from the monolith); and, last, carefully reconciled dual writes. Decide the <i>system of record</i> for each entity at each stage.</p><p><b>Verification:</b> shadow traffic (send a copy to the new service and compare responses without serving them), golden datasets, and per-route metrics. Feature flags or proxy rules give per-route rollback.</p><p><b>Branch by abstraction</b> is the in-code cousin: introduce an interface inside the monolith, implement the new version behind it, switch with a flag, then delete the old implementation.</p>`
  },
  tradeoffs:{use:[`Modernising business-critical legacy systems that must keep running`, `Moving from monolith to services (or to a new platform) incrementally`], avoid:[`Starting with the most entangled core (pick a well-bounded edge first)`, `Running both versions forever (finish and delete)`], alt:[`Modular monolith refactoring in place`, `Big-bang rewrite (rarely wise)`, `Replatforming without re-architecture (lift-and-shift)`]},
  real:[
    {co:'Martin Fowler', tier:'confirmed', text:'Fowler named the Strangler Fig Application pattern (2004) after figs that gradually envelop host trees, recommending incremental replacement over big-bang rewrites.', src:'Martin Fowler, “StranglerFigApplication” (2004, updated 2019)'},
    {co:'SoundCloud', tier:'confirmed', text:'SoundCloud described gradually moving features out of its Rails monolith (“the mothership”) into new services and introducing BFF-style APIs, rather than a single rewrite.', src:'Phil Calçado, “How we ended up with microservices” (2015)'},
    {co:'Ticket-booking migration', tier:'educational', text:'Route /search and /availability to a new read-optimised service first (fed by CDC), keep booking and payment in the monolith until the new path is proven.', src:'Simplified educational design'}
  ],
  mistakes:[`Moving code but leaving both systems writing the same tables`, `No per-route rollback switch`, `Migrating the riskiest, most coupled module first`],
  interview:[`Facade → slice → data sync → gradual traffic shift → delete, with shadow testing and rollback`, `Say who the system of record is during each phase`],
  tryit:{note:'Order the migration of one route:', mount:host => orderGame(host, ['Put a routing facade in front of the monolith', 'Choose a well-bounded route to extract', 'Build the new service and sync its data via CDC', 'Shadow traffic and compare responses', 'Canary 5% of real traffic with a rollback switch', 'Ramp to 100% and delete the old code path'])},
  sources:[`Fowler, StranglerFigApplication`, `Newman, Monolith to Microservices (2019)`, `Calçado, SoundCloud (2015)`]
},
{
  id:'serverless', title:'Serverless and functions as a service', minutes:10, tags:['serverless','FaaS','Lambda','cold start','pay per use'],
  summary:'With FaaS you deploy functions; the platform runs, scales (including to zero) and bills them per request and execution time. It is excellent for spiky, event-driven work; watch cold starts, limits, cost at steady high volume, and lock-in.',
  problem:`<p>Your app needs to resize images on upload. Uploads are 20 a minute at night and 5,000 a minute after a festival sale email. Running servers for peak wastes money most of the day; running too few makes uploads lag. You want something that appears per upload and disappears afterwards.</p>`,
  intuition:`Calling an auto-rickshaw instead of owning a car. You pay per ride, there’s no parking or maintenance, and a hundred auto-rickshaws can appear when a hundred people need them. But if you drive the same route all day every day, owning a car is cheaper, and sometimes you wait for an auto to arrive (cold start).`,
  how:{
    steps:[`Write a <b>handler</b> function; configure memory/CPU, timeout and a <b>trigger</b> (HTTP, queue message, file upload, schedule, DB change).`, `On an event, the platform finds a warm execution environment or creates one (a <b>cold start</b>, which adds cold-start latency: download code, start runtime, run init).`, `It scales out by running more environments in parallel, up to <b>concurrency limits</b>; idle environments are reclaimed (scale to zero).`, `You pay per request plus GB-seconds of execution; no idle cost.`, `State lives elsewhere (databases, object storage, queues); functions are stateless and short-lived.`],
    mount:host => lambdaCost(host),
    deep:`<p><b>Cold starts:</b> new environments add latency, ranging from tens of milliseconds to seconds depending on runtime, package size, VPC networking and init code. Mitigations: smaller packages, lazy init, provisioned concurrency (pre-warmed, billed), snapshot-based starts (Lambda SnapStart for some runtimes).</p><p><b>Limits that shape design:</b> AWS Lambda’s maximum timeout is 15 minutes and memory up to 10,240 MB; accounts have regional concurrency quotas (1,000 concurrent executions by default, raisable). Long jobs need step functions/workflows or containers. A burst of functions can overwhelm a database’s connection limit, so use connection proxies or queues in between.</p><p><b>When serverless loses:</b> high, steady throughput (always-on compute is cheaper per request), very low-latency paths sensitive to cold starts, heavy chatty orchestration between many small functions (data transfer and per-transition costs), and workloads that need specialised hardware or long-running connections.</p>`
  },
  tradeoffs:{use:[`Spiky or low-volume event-driven work: file processing, webhooks, cron jobs, glue between managed services`, `Prototypes and small APIs where ops time is the main cost`], avoid:[`Steady high-throughput services (cost)`, `Strict p99 latency paths sensitive to cold starts`, `Long-running or stateful workloads`], alt:[`Containers on a managed platform (ECS/Fargate, Cloud Run, Kubernetes)`, `Queue + autoscaled workers`, `Edge functions for tiny latency-sensitive logic`]},
  real:[
    {co:'Amazon Prime Video', tier:'confirmed', text:'The Prime Video team wrote in 2023 that it moved an audio/video quality-monitoring service from a distributed design using AWS Step Functions and Lambda to a single process on ECS, reducing infrastructure cost by over 90% for that workload. Serverless was the wrong fit for that high-volume, chatty pipeline.', src:'Prime Video Tech Blog, “Scaling up the Prime Video audio/video monitoring service and reducing costs by 90%” (2023)'},
    {co:'AWS Lambda', tier:'confirmed', text:'Lambda bills per request and per GB-second, supports up to 15-minute invocations and 10,240 MB of memory, and offers provisioned concurrency to avoid cold starts.', src:'AWS Lambda documentation and pricing page'},
    {co:'Image thumbnails on upload', tier:'educational', text:'An object-storage upload event triggers a function that creates thumbnails and writes them back. Cost tracks uploads exactly, and festival spikes scale automatically.', src:'Simplified educational design'}
  ],
  mistakes:[`Opening a new DB connection per invocation at high concurrency`, `Splitting one workflow into dozens of tiny functions that pass large payloads around`, `No concurrency cap, so a bug causes a runaway bill`],
  interview:[`Use serverless for event-driven, spiky work; justify with cost/ops; name cold starts and limits`, `Show the cost crossover versus containers at steady load`],
  tryit:{note:'Find the volume where always-on containers become cheaper in the calculator above.', quiz:[{q:'Which workload is the weakest fit for FaaS?', options:['Resizing images on upload', 'A nightly report job', 'A 24×7 API at a steady 20,000 req/s with a strict 30 ms p99', 'A webhook receiver for payments'], answer:2, why:'Steady high volume and strict latency favour always-on compute.'}], quizId:'arch-l6'},
  sources:[`AWS Lambda documentation and pricing`, `Prime Video Tech Blog (2023)`, `Jonas et al., “Cloud Programming Simplified: A Berkeley View on Serverless Computing” (2019)`]
},
{
  id:'docker-containers', title:'Containers and Docker', minutes:9, tags:['container','Docker','image','namespaces','cgroups','OCI'],
  summary:'A container packages an app with its dependencies into an image and runs it as an isolated process. Isolation comes from Linux namespaces (what it can see) and cgroups (what it can use), so it starts in milliseconds and runs the same everywhere.',
  problem:`<p>“It works on my machine.” The app needs a particular Python version, an image library and an OpenSSL version. Production has different ones. VMs solve it but take minutes to boot and gigabytes each. You want something that ships the exact environment, starts instantly and packs densely onto servers.</p>`,
  intuition:`A tiffin box versus a whole kitchen. A VM ships the entire kitchen (OS) with the meal. A container is a sealed tiffin with exactly your meal and its spices, heated in a shared kitchen (the host kernel). It is light, quick, and tastes the same anywhere.`,
  how:{
    stepper:{title:'From Dockerfile to running container', items:[
      {title:'Dockerfile', tag:'build recipe', text:'Declares a base image and steps: <code>FROM node:20-slim</code>, copy files, install dependencies, set the start command.'},
      {title:'Layers', tag:'cached', text:'Each step makes a read-only layer identified by a content hash. Unchanged layers are cached and shared between images, so put rarely changing steps (dependencies) before often changing ones (code).'},
      {title:'Image + registry', tag:'immutable', text:'The image (layers + metadata, OCI format) is pushed to a registry and pulled by tag or, better, by digest.'},
      {title:'Namespaces', tag:'isolation', text:'At run time the kernel gives the process its own view of PIDs, network, mounts, hostname and users. It thinks it is alone.'},
      {title:'cgroups', tag:'limits', text:'Control groups cap CPU, memory and I/O, so one container can’t starve its neighbours. Exceeding the memory limit gets the process killed (OOMKilled).'},
      {title:'Writable layer', tag:'ephemeral', text:'A thin copy-on-write layer on top holds runtime changes. It disappears with the container, so persistent data goes in volumes or external stores.'}]},
    html:h.code('dockerfile', `# Multi-stage build: compile in a full image, ship a small one
FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci                      # cached unless dependencies change
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER node                       # don't run as root
EXPOSE 8080
CMD ["node", "dist/server.js"]`, 'Dockerfile'),
    deep:`<p><b>Containers vs VMs:</b> containers share the host kernel, so they are cheaper and faster but isolation is weaker. A kernel exploit can cross containers. For untrusted multi-tenant code, use sandboxed runtimes (gVisor) or micro-VMs (Firecracker, which powers Lambda and Fargate).</p><p><b>Image hygiene:</b> small base images (slim/distroless) reduce attack surface and pull time; pin by digest; scan for vulnerabilities; never bake secrets into layers (they stay in history); run as non-root; one main process per container.</p><p><b>Standards:</b> the Open Container Initiative (OCI) defines image and runtime specs, so images built with Docker run on containerd, CRI-O and Podman.</p>`
  },
  tradeoffs:{use:[`Packaging services consistently across dev, CI and production`, `Dense, fast-starting workloads orchestrated by Kubernetes/ECS`], avoid:[`Treating containers as pets (SSH in and patch)`, `Storing state in the container filesystem`], alt:[`VMs for strong isolation or legacy OS needs`, `Serverless when you don’t want to manage runtime images`, `Micro-VMs for untrusted code`]},
  real:[
    {co:'Docker', tier:'confirmed', text:'Docker (2013) popularised Linux containers with a simple image format and tooling; its image and runtime work became the basis of the Open Container Initiative specifications.', src:'Docker and OCI documentation'},
    {co:'AWS Firecracker', tier:'confirmed', text:'AWS built Firecracker micro-VMs to run Lambda functions and Fargate tasks with VM-level isolation and container-like startup speed.', src:'Agache et al., “Firecracker: Lightweight Virtualization for Serverless Applications”, NSDI 2020'},
    {co:'Typical CI pipeline', tier:'educational', text:'CI builds one image per commit, tags it with the git SHA, scans it, and promotes the same image digest through staging to production.', src:'Simplified educational design'}
  ],
  mistakes:[`Secrets in Dockerfiles or image layers`, `“latest” tags in production (non-reproducible deploys)`, `Huge images that slow every deploy and autoscale event`],
  interview:[`Explain namespaces vs cgroups and image layers`, `Containers ≠ VMs: shared kernel, faster, weaker isolation`],
  tryit:{note:'VM or container?', mount:host => sortGame(host, [
    {t:'Shares the host’s kernel', c:'ct', why:'Containers are isolated processes.'},
    {t:'Boots its own guest operating system', c:'vm', why:'A VM virtualises hardware.'},
    {t:'Starts in milliseconds to a second', c:'ct', why:'No OS boot.'},
    {t:'Stronger isolation for untrusted multi-tenant code', c:'vm', why:'A hypervisor boundary is stronger than namespaces.'},
    {t:'Image built from layers, cached by content hash', c:'ct', why:'OCI image layers.'}
  ], [{id:'ct', label:'Container'}, {id:'vm', label:'Virtual machine'}])},
  sources:[`Docker documentation`, `Open Container Initiative specs`, `Agache et al., NSDI 2020`, `Linux man pages: namespaces(7), cgroups(7)`]
},
{
  id:'kubernetes-basics', title:'Kubernetes basics', minutes:12, tags:['Kubernetes','pod','deployment','service','reconciliation','control plane'],
  summary:'Kubernetes runs containers across a cluster. You declare desired state (Deployments, Services, config), and controllers continuously reconcile actual state toward it: scheduling, restarting, scaling and rolling out.',
  problem:`<p>You have 40 services, 600 containers and 50 machines. Which container runs where? Who restarts a crashed one at 3 AM, moves containers off a dying machine, rolls out a new version without downtime, and gives each service a stable address? Doing that with scripts doesn’t scale.</p>`,
  intuition:`A thermostat. You set 24 °C (desired state). It constantly measures the room (actual state) and turns heating or cooling on until they match, whatever caused the change (open window, sunny afternoon). Kubernetes is a building full of thermostats, one for each kind of thing.`,
  how:{
    steps:[`You submit <b>declarative objects</b> (YAML) to the <b>API server</b>; they are stored in <b>etcd</b>.`, `<b>Controllers</b> watch objects and reconcile: a Deployment manages ReplicaSets, which keep N <b>pods</b> running.`, `The <b>scheduler</b> assigns pending pods to nodes with enough CPU and memory (requests), respecting constraints (affinity, taints, topology spread).`, `On each node the <b>kubelet</b> starts containers via the runtime, runs <b>liveness/readiness probes</b> and reports status.`, `A <b>Service</b> gives pods a stable name and IP; <b>Ingress/Gateway</b> exposes HTTP routes; ConfigMaps and Secrets inject config.`, `Rolling updates replace pods gradually; the HPA scales replicas; the cluster autoscaler scales nodes.`],
    mount:(host, api) => reconcileDemo(host, api),
    html:h.code('yaml', `apiVersion: apps/v1
kind: Deployment
metadata: { name: web }
spec:
  replicas: 4                       # desired state
  selector: { matchLabels: { app: web } }
  strategy: { rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } }
  template:
    metadata: { labels: { app: web } }
    spec:
      containers:
      - name: web
        image: registry.example/web@sha256:…   # pin by digest
        resources:
          requests: { cpu: "250m", memory: "256Mi" }   # for scheduling
          limits:   { memory: "512Mi" }                # OOMKill above this
        readinessProbe: { httpGet: { path: /ready, port: 8080 } }
        livenessProbe:  { httpGet: { path: /live,  port: 8080 } }
---
apiVersion: v1
kind: Service
metadata: { name: web }
spec: { selector: { app: web }, ports: [{ port: 80, targetPort: 8080 }] }`, 'deployment.yaml'),
    deep:`<p><b>Level-triggered reconciliation:</b> controllers compare desired and observed state on every loop instead of reacting to individual events. Missed events don’t matter, and the same code handles crashes, manual edits and node failures. This idea comes from Google’s Borg and Omega experience.</p><p><b>Probes:</b> <i>readiness</i> controls whether a pod receives traffic (fail it during warm-up or overload); <i>liveness</i> restarts a stuck process (be conservative, because an aggressive liveness probe causes restart storms during slowdowns); <i>startup</i> probes protect slow starters.</p><p><b>Requests vs limits:</b> the scheduler places pods by <i>requests</i>; <i>limits</i> cap usage. CPU over its limit is throttled; memory over its limit is OOMKilled. Setting requests too low leads to noisy, overpacked nodes; too high wastes money.</p><p><b>When not to:</b> Kubernetes has real operational cost (upgrades, networking, security, cost control). Small teams often do better on managed platforms (Cloud Run, ECS/Fargate, App Engine-style PaaS).</p>`
  },
  tradeoffs:{use:[`Many services and teams needing a common deployment platform`, `Portable, declarative infrastructure with strong ecosystem tooling`], avoid:[`A handful of services run by a small team (use a managed PaaS)`, `Running stateful databases on it without operators and expertise`], alt:[`Managed container platforms (ECS/Fargate, Cloud Run)`, `PaaS (Heroku-style)`, `Serverless functions`]},
  real:[
    {co:'Google Borg → Kubernetes', tier:'confirmed', text:'Kubernetes (open-sourced by Google in 2014) drew on a decade of running Borg, Google’s internal cluster manager, which the EuroSys 2015 paper describes running hundreds of thousands of jobs across many clusters.', src:'Verma et al., “Large-scale cluster management at Google with Borg”, EuroSys 2015; Burns et al., “Borg, Omega, and Kubernetes”, ACM Queue 2016'},
    {co:'CNCF', tier:'confirmed', text:'Kubernetes was the first project to graduate from the Cloud Native Computing Foundation (2018) and is offered as a managed service by all major clouds (GKE, EKS, AKS).', src:'CNCF announcements'},
    {co:'Typical company platform', tier:'educational', text:'A platform team runs shared clusters; product teams ship Deployments via GitOps (Argo CD/Flux) with standard templates for probes, resources and autoscaling.', src:'Simplified educational design'}
  ],
  mistakes:[`No readiness probe, so traffic hits pods still warming up`, `Liveness probes that fail under load, causing restart storms`, `No resource requests, so nodes are overpacked and pods get evicted`],
  interview:[`Explain desired state + reconciliation, pod/Deployment/Service, and probes`, `Know when Kubernetes is overkill`],
  tryit:{note:'Delete pods, fail a node and change replicas in the demo above, and watch the reconcile loop. Then:', quiz:[{q:'Which probe decides whether a pod receives traffic?', options:['Liveness', 'Readiness', 'Startup', 'HPA'], answer:1, why:'Readiness removes the pod from Service endpoints.'}, {q:'You delete a pod managed by a Deployment with replicas: 4. What happens?', options:['It stays deleted', 'The ReplicaSet controller creates a replacement to get back to 4', 'The whole Deployment restarts', 'The node reboots'], answer:1, why:'Reconciliation restores desired state.'}], quizId:'arch-l8'},
  sources:[`Kubernetes documentation`, `Verma et al., EuroSys 2015`, `Burns et al., ACM Queue 2016`]
},
{
  id:'twelve-factor', title:'The twelve-factor app', minutes:9, tags:['12-factor','config','stateless','disposability','dev/prod parity'],
  summary:'Twelve-factor is a checklist for building services that deploy cleanly to cloud platforms: config in the environment, stateless disposable processes, backing services as attached resources, logs as streams, and one codebase built once per release.',
  problem:`<p>Each deploy is an adventure: config is edited by hand on servers, sessions live in local memory so autoscaling logs users out, logs are written to files that vanish with the instance, and staging uses SQLite while production uses Postgres. The twelve factors exist to remove these problems.</p>`,
  intuition:`A well-run cloud kitchen franchise. Every outlet uses the same recipe book (one codebase), gets local details like the supplier’s phone number on a card (config in env), throws away nothing important when a cook leaves (stateless), and any cook can start or stop at short notice (disposability).`,
  how:{
    stepper:{title:'Factor V in motion: build once, release, run', items:[
      {title:'Commit', tag:'I Codebase', text:'One repository. A merge to main triggers CI. Dependencies are declared in a lockfile (II).'},
      {title:'Build', tag:'V Build', text:'CI builds one immutable artifact (a container image tagged with the commit SHA). It contains no environment-specific config.'},
      {title:'Release', tag:'V Release', text:'Release = that exact build + the config for one environment (III), from env vars or a config/secrets service. Every release gets an ID, so rollback = run the previous release.'},
      {title:'Run', tag:'VI · VII · VIII', text:'The platform starts stateless processes that bind a port (VII). Scale out by running more of them (VIII); state lives in backing services (IV).'},
      {title:'Dispose', tag:'IX Disposability', text:'On SIGTERM the process stops accepting new work, finishes in-flight requests and exits within the grace period, so deploys and scale-in are safe.'},
      {title:'Observe & admin', tag:'XI · XII', text:'Logs go to stdout and the platform ships them (XI). One-off tasks like DB migrations run as the same release (XII), in an environment kept close to production (X).'}]},
    html:h.table(['#', 'Factor', 'In practice'], [
      ['I', 'Codebase', 'One repo per app, many deploys'], ['II', 'Dependencies', 'Declare and isolate (lockfiles, containers)'], ['III', 'Config', 'In environment variables / injected config, never in code'], ['IV', 'Backing services', 'DBs, queues and caches are attached resources swapped by config'],
      ['V', 'Build, release, run', 'Build once → release = build + config → run; immutable releases'], ['VI', 'Processes', 'Stateless, share-nothing; state in backing services'], ['VII', 'Port binding', 'App exports HTTP by binding a port'], ['VIII', 'Concurrency', 'Scale out by running more processes'],
      ['IX', 'Disposability', 'Fast start, graceful shutdown on SIGTERM'], ['X', 'Dev/prod parity', 'Same backing services and versions everywhere'], ['XI', 'Logs', 'Write to stdout as an event stream; the platform routes them'], ['XII', 'Admin processes', 'One-off tasks (migrations) run as the same release']], []),
    deep:`<p><b>What has aged:</b> “config in env vars” is often replaced by mounted config files or a config service, and secrets belong in a secrets manager, not plain env vars visible to every process and crash dump. Modern additions people propose: API-first design, telemetry (metrics/traces, not just logs), and security as a first-class factor.</p><p><b>What remains essential:</b> statelessness and disposability are what make autoscaling, rolling deploys and spot instances work; build-once-promote-everywhere is what makes rollbacks safe; dev/prod parity prevents “passed in staging” surprises.</p>`
  },
  tradeoffs:{use:[`Any service deployed to containers, PaaS or Kubernetes`], avoid:[`Applying it rigidly where a stateful system legitimately needs local disk (databases, caches)`], alt:[`Platform-specific conventions that achieve the same goals`]},
  real:[
    {co:'Heroku', tier:'confirmed', text:'The twelve-factor methodology was written by Heroku co-founder Adam Wiggins (2011), distilled from running many apps on the Heroku platform.', src:'Adam Wiggins, “The Twelve-Factor App” (12factor.net, 2011)'},
    {co:'Kubernetes conventions', tier:'confirmed', text:'Kubernetes follows several factors directly: config via ConfigMaps/Secrets, logs from stdout/stderr collected by the node, SIGTERM + grace period for shutdown.', src:'Kubernetes documentation'},
    {co:'Session loss on autoscale', tier:'educational', text:'Moving sessions from local memory to Redis (factor VI) is what lets the shop scale out at sale time without logging users out.', src:'Simplified educational design'}
  ],
  mistakes:[`Building a different artifact per environment`, `Long-running in-memory state that breaks on restarts`, `Ignoring SIGTERM so deploys drop in-flight requests`],
  interview:[`Mention stateless processes, config outside code, build-once releases and graceful shutdown when describing service design`],
  tryit:{note:'Which factor does each smell violate?', mount:host => sortGame(host, [
    {t:'DB password hard-coded in settings.py', c:'cfg', why:'III Config: inject via environment/secret store.'},
    {t:'User sessions stored in the web server’s memory', c:'proc', why:'VI Processes: keep state in a backing service.'},
    {t:'Production built from a different branch than staging', c:'build', why:'V Build/release/run: build once, promote.'},
    {t:'App writes logs to /var/log/app.log inside the container', c:'logs', why:'XI Logs: write to stdout.'},
    {t:'API key for the SMS provider committed to git', c:'cfg', why:'III Config (and a security incident).'},
    {t:'Uploaded images saved to local disk of one instance', c:'proc', why:'VI: use object storage.'}
  ], [{id:'cfg', label:'III Config'}, {id:'proc', label:'VI Processes'}, {id:'build', label:'V Build/release/run'}, {id:'logs', label:'XI Logs'}])},
  sources:[`Wiggins, The Twelve-Factor App (2011)`, `Kubernetes documentation`]
},
{
  id:'multi-tenancy', title:'Multi-tenancy', minutes:10, tags:['multi-tenancy','tenant isolation','silo','pool','noisy neighbour','row-level security'],
  summary:'A multi-tenant SaaS serves many customers from shared infrastructure. Choose silo, pool or bridge models per layer, and enforce tenant isolation for data, performance and failure.',
  problem:`<p>You sell billing software to 3,000 small businesses and 5 large banks. A dedicated stack per customer would be unaffordable. One shared database risks a missing <code>WHERE tenant_id = ?</code> leaking one customer’s invoices to another, and one tenant’s month-end batch slowing everyone. The banks also demand data in India and their own encryption keys.</p>`,
  intuition:`Housing. A villa per family is private but expensive (silo). An apartment block shares the building, lifts and water tank (pool): cheap, but a noisy neighbour or a leaking pipe affects others. A gated society with apartments plus a few villas (bridge) gives each customer what they pay for.`,
  how:{
    steps:[`Decide the model <b>per layer</b>: compute, database, cache, storage, encryption keys can each be pooled or siloed.`, `<b>Tenant context</b>: authenticate, resolve the tenant once at the edge, propagate it (token claim/header), and never accept it from user input.`, `<b>Data isolation</b> in pooled DBs: tenant_id on every row, enforced by the data layer and database row-level security, not just by developers remembering it.`, `<b>Performance isolation</b>: per-tenant rate limits, quotas, fair queues and tiered pools so one tenant can’t starve others.`, `<b>Operations</b>: per-tenant metrics, cost attribution, onboarding automation, and a path to move a big tenant from pool to silo.`],
    mount:host => tenancyCompare(host),
    html:h.code('sql', `-- PostgreSQL row-level security: the DB enforces tenant isolation
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- The app sets the tenant for each request/transaction:
SET LOCAL app.tenant_id = '6f1c…';    -- from the verified auth token
SELECT * FROM invoices WHERE status = 'due';  -- only this tenant's rows`, 'row-level security'),
    deep:`<p><b>Sharding by tenant:</b> pooled designs often shard by tenant_id. Small tenants share shards, while a big tenant can be moved to a dedicated shard (bridge). Watch for “whale” tenants creating hot shards; keep a tenant → shard directory so you can rebalance.</p><p><b>Noisy neighbours:</b> isolate expensive operations (exports, reports, batch jobs) onto separate queues/workers with per-tenant concurrency caps; use shuffle sharding so a bad tenant affects few others.</p><p><b>Compliance:</b> enterprise tenants may require data residency (e.g. India-only under DPDP or sector rules), customer-managed keys (separate KMS keys per tenant), and audit logs. These often force silo storage even in a pooled compute layer.</p>`
  },
  tradeoffs:{use:[`SaaS with many customers: pool by default, silo where required`], avoid:[`Tenant checks implemented only in application code by convention`, `Pooling tenants with very different compliance or load profiles without tiers`], alt:[`Single-tenant deployments for a few large customers`, `Bridge/tiered models`, `Cell-based architecture with many tenants per cell`]},
  real:[
    {co:'Salesforce', tier:'confirmed', text:'Salesforce’s published multitenant architecture stores all customers’ data in shared databases with an organisation ID on every row, and uses metadata to give each tenant its own customisations.', src:'Salesforce, “The Force.com Multitenant Architecture” whitepaper'},
    {co:'AWS SaaS guidance', tier:'confirmed', text:'AWS describes silo, pool and bridge isolation models and tenant-context propagation in its SaaS Lens and tenant-isolation whitepaper.', src:'AWS Well-Architected SaaS Lens; “SaaS Tenant Isolation Strategies” whitepaper'},
    {co:'Indian B2B SaaS with bank customers', tier:'educational', text:'Pool SMB tenants in a shared, sharded database; offer banks a siloed database in an Indian region with customer-managed keys as a premium tier.', src:'Simplified educational design'}
  ],
  mistakes:[`Trusting a tenant_id sent by the client`, `One tenant’s export job running on the shared request-serving pool`, `No per-tenant metrics, so you can’t see who causes load or cost`],
  interview:[`State the isolation model per layer and how tenant context is enforced (RLS, scoped tokens)`, `Address noisy neighbours with quotas and separate pools`],
  tryit:{note:'Compare the models above as tenant count grows. Then:', quiz:[{q:'What is the safest place to enforce “tenant A never sees tenant B’s rows” in a pooled database?', options:['In each developer’s queries', 'In the UI', 'In the data layer and database (row-level security), with tenant from the verified token', 'In a code review checklist'], answer:2, why:'Enforce isolation centrally and in the DB.'}], quizId:'arch-l10'},
  sources:[`AWS SaaS Lens; SaaS Tenant Isolation Strategies`, `Salesforce multitenant architecture whitepaper`, `PostgreSQL docs — Row Security Policies`]
},
{
  id:'hexagonal', title:'Hexagonal architecture (ports and adapters)', minutes:9, tags:['hexagonal','ports and adapters','clean architecture','dependency inversion','testability'],
  summary:'Keep business logic in the centre with no knowledge of databases, frameworks or vendors. It talks through ports (interfaces) implemented by adapters at the edges, so you can swap infrastructure and test the core in isolation.',
  problem:`<p>Your order logic is tangled with Express request objects, raw SQL and a specific SMS vendor’s SDK. Testing a discount rule requires a database. Switching SMS providers means editing business code in 30 places, and moving from REST to a Kafka consumer means a rewrite.</p>`,
  intuition:`A laptop with USB-C ports. The laptop (core) doesn’t care whether you plug in a monitor, a charger or a phone; anything that fits the port works. Swap the monitor (adapter) without opening the laptop.`,
  how:{
    steps:[`Put <b>domain logic</b> (entities, rules, use cases) in the core with no framework or I/O imports.`, `Define <b>ports</b>: interfaces the core needs (<code>OrderRepository</code>, <code>PaymentGateway</code>, <code>Notifier</code>) and interfaces it offers (use cases).`, `Write <b>adapters</b>: driving adapters (HTTP controller, Kafka consumer, CLI) call the core; driven adapters (Postgres repo, Razorpay client, SMS sender) implement its ports.`, `Wire them at startup (dependency injection). Tests plug in in-memory adapters.`, `Dependencies point <b>inward</b>: adapters depend on the core, never the reverse.`],
    diagram:{title:'Ports and adapters around an order core', w:800, h:260, alt:'HTTP and Kafka adapters drive the order core; it uses repository, payment and notifier ports implemented by Postgres, payment-gateway and SMS adapters.',
      nodes:[{id:'http', type:'client', label:'HTTP adapter', x:90, y:80, w:130}, {id:'kafka', type:'queue', label:'Kafka consumer', x:90, y:190, w:130}, {id:'core', type:'service', label:'Order core', sub:'PlaceOrder use case', x:400, y:135, w:170}, {id:'pg', type:'db', label:'Postgres adapter', sub:'OrderRepository', x:690, y:50, w:160}, {id:'pay', type:'ext', label:'Payment adapter', sub:'PaymentGateway', x:690, y:135, w:160}, {id:'sms', type:'ext', label:'SMS adapter', sub:'Notifier', x:690, y:220, w:160}],
      edges:[{from:'http', to:'core'}, {from:'kafka', to:'core'}, {from:'core', to:'pg'}, {from:'core', to:'pay'}, {from:'core', to:'sms'}],
      steps:[
        {note:'A <b>driving adapter</b> (HTTP) turns a request into a call on the PlaceOrder use case.', flow:[['http', 'core', 'placeOrder(cmd)']]},
        {note:'The core applies the rules and calls its <b>ports</b>; it doesn’t know they are Postgres, a payment gateway and an SMS vendor.', flow:[['core', 'pg', 'save'], ['core', 'pay', 'charge'], ['core', 'sms', 'notify']], parallel:true},
        {note:'Same core, new entry point: a Kafka consumer drives the same use case. No business code changes.', flow:[['kafka', 'core', 'placeOrder(cmd)']], hl:['kafka']}
      ]},
    html:h.code('ts', `// Port (owned by the core)
export interface PaymentGateway { charge(orderId: string, paise: number, key: string): Promise<'ok' | 'declined'>; }

// Core use case — no framework or vendor imports
export class PlaceOrder {
  constructor(private repo: OrderRepository, private pay: PaymentGateway) {}
  async run(cmd: { orderId: string; items: Item[] }) {
    const order = Order.create(cmd.orderId, cmd.items);          // domain rules
    const res = await this.pay.charge(order.id, order.totalPaise, order.id);
    order.markPaid(res === 'ok');
    await this.repo.save(order);
    return order;
  }
}

// Adapters (edges): swap freely
class RazorpayGateway implements PaymentGateway { /* vendor SDK calls */ }
class FakeGateway implements PaymentGateway { async charge() { return 'ok' as const; } } // tests`, 'ports-and-adapters.ts'),
    deep:`<p><b>Relatives:</b> Onion Architecture and Clean Architecture express the same dependency rule (inward only) with more named rings. The common core: domain logic independent of delivery mechanism and persistence.</p><p><b>Costs:</b> more interfaces and mapping code (domain objects ↔ DB rows ↔ DTOs). For simple CRUD services that mostly move data between HTTP and a table, it can be ceremony without benefit. Use it where business rules are rich or infrastructure is likely to change.</p><p><b>System-design link:</b> hexagonal services make strangler migrations, vendor swaps (payment or SMS providers), and adding async entry points (queues, schedulers) cheap, because only adapters change.</p>`
  },
  tradeoffs:{use:[`Services with real business rules and several integrations`, `Code that must outlive frameworks or vendors`], avoid:[`Thin CRUD services (over-engineering)`, `Leaking ORM entities into the core (defeats the purpose)`], alt:[`Simple layered architecture`, `Transaction scripts for trivial logic`]},
  real:[
    {co:'Alistair Cockburn', tier:'confirmed', text:'Cockburn described the Hexagonal Architecture (Ports and Adapters) pattern in 2005 to let applications be driven equally by users, programs, tests and batch scripts.', src:'Alistair Cockburn, “Hexagonal Architecture” (2005)'},
    {co:'Netflix', tier:'confirmed', text:'A Netflix studio-engineering team wrote about using hexagonal architecture so it could swap data sources (moving from a monolith API to new services) without changing business logic.', src:'Netflix Tech Blog, “Ready for changes with Hexagonal Architecture” (2020)'},
    {co:'Payment provider switch', tier:'educational', text:'Moving from one payment gateway to another is a new adapter implementing PaymentGateway plus a config change, with no edits to order rules.', src:'Simplified educational design'}
  ],
  mistakes:[`Ports shaped like the vendor’s API instead of the domain’s needs`, `Core code importing framework types “just once”`, `Interfaces for everything, even where there will only ever be one implementation and no test need`],
  interview:[`When asked about extensibility or vendor lock-in, explain ports/adapters and the inward dependency rule`],
  tryit:{quiz:[{q:'In hexagonal architecture, which way do dependencies point?', options:['Core → database', 'Adapters → core (inward)', 'Core → framework', 'Both ways'], answer:1, why:'The core defines ports; adapters implement or call them.'}, {q:'You switch SMS vendors. What changes?', options:['The order rules', 'Only the SMS adapter (and wiring)', 'All controllers', 'The database schema'], answer:1, why:'That is the point of ports.'}], quizId:'arch-l11'},
  sources:[`Cockburn, Hexagonal Architecture (2005)`, `Netflix Tech Blog (2020)`, `Martin, Clean Architecture (2017)`]
},
{
  id:'config-feature-flags', title:'Configuration management and feature flags', minutes:11, tags:['configuration','feature flags','kill switch','progressive delivery','dark launch'],
  summary:'Treat configuration as code: versioned, reviewed, validated and rolled out gradually. Feature flags separate deploy from release (percentage rollouts, targeting, kill switches), but stale flags and unsafe config pushes cause outages.',
  problem:`<p>A new checkout flow is ready. Deploying it to everyone at once is risky, and rolling back means another deploy. Meanwhile, a one-line config change pushed to every server at once can take the site down faster than any code bug. You need to release features gradually, switch them off instantly, and change config safely.</p>`,
  intuition:`Light switches and dimmers installed during construction (deploy) but turned on room by room when ready (release). The building’s electrician can flip any switch off instantly from the main panel (kill switch), and nobody rewires the house to dim a light.`,
  how:{
    steps:[`<b>Config as code</b>: store config in version control, review it, validate it with schemas and tests, and roll it out progressively like code.`, `Separate <b>static config</b> (needs restart) from <b>dynamic config</b> (pushed to running processes via a config service), with safe defaults if the service is unreachable.`, `<b>Feature flags</b>: wrap new code paths in flag checks evaluated per request with context (user, tenant, city, app version).`, `<b>Roll out</b>: internal users → 1% → 10% → 50% → 100%, with deterministic bucketing (hash of flag + user) and metrics per cohort.`, `Keep <b>kill switches</b> for risky features and dependencies; <b>remove</b> flags once fully rolled out (track flag age and owners).`],
    mount:host => flagDemo(host),
    deep:`<p><b>Flag types</b> (Pete Hodgson’s taxonomy): release toggles (short-lived), ops toggles/kill switches (long-lived, for degradation), experiment toggles (A/B tests with stats), permission toggles (premium features). They have different lifetimes and owners.</p><p><b>Safe config rollout:</b> Google’s SRE book notes that roughly 70% of outages are due to changes in a live system, which includes config. Apply canaries, staged regions, automated validation and fast rollback to config changes. Facebook’s Configerator, for example, runs config through code review, tests and canarying before pushing it fleet-wide.</p><p><b>Flag debt:</b> every flag doubles the possible code paths. Old flags with unclear owners become landmines. Set expiry dates, alert on stale flags, and delete code paths after rollout.</p>`
  },
  tradeoffs:{use:[`Progressive delivery and quick rollback for risky features`, `Kill switches for optional features and heavy dependencies`, `Trunk-based development with incomplete features hidden`], avoid:[`Long-lived release flags nobody removes`, `Pushing a config change to the whole fleet at once`, `Flag evaluation that calls a remote service on every request without caching/defaults`], alt:[`Blue-green or canary deploys (release by deployment)`, `Branches (slower feedback, merge pain)`]},
  real:[
    {co:'Facebook — Configerator & Gatekeeper', tier:'confirmed', text:'Facebook’s SOSP 2015 paper describes managing configuration as code with review, automated tests and canary releases (Configerator), and Gatekeeper for gradual, targeted feature rollout.', src:'Tang et al., “Holistic Configuration Management at Facebook”, SOSP 2015'},
    {co:'Cloudflare, July 2019', tier:'confirmed', text:'A new WAF rule containing a badly behaving regular expression was deployed globally at once and drove CPU to 100% across Cloudflare’s network for about 30 minutes. Cloudflare then changed how such rules are rolled out.', src:'Cloudflare blog, “Details of the Cloudflare outage on July 2, 2019”'},
    {co:'Knight Capital, 2012', tier:'confirmed', text:'A deployment that missed one server plus a repurposed feature flag reactivated dead trading code; the firm lost hundreds of millions of dollars in about 45 minutes. It is a classic lesson on flag hygiene and deployment verification.', src:'U.S. SEC, Order Instituting Proceedings against Knight Capital Americas LLC (2013)'}
  ],
  mistakes:[`Reusing an old flag name for a new meaning`, `Global, instant config pushes with no canary or validation`, `Random (non-sticky) bucketing, so users flip between old and new experiences`],
  interview:[`Separate deploy from release with flags; describe a staged rollout with metrics and a kill switch`, `Treat config changes with the same safety as code changes`],
  tryit:{note:'Raise the percentage above and note that users only ever get added. Then:', quiz:[{q:'Why bucket users with hash(flag + userId) instead of hash(userId)?', options:['It is faster', 'So each flag gets an independent sample, and the same early users aren’t in every experiment', 'To encrypt the user ID', 'No reason'], answer:1, why:'Salting by flag decorrelates rollouts.'}], quizId:'arch-l12'},
  sources:[`Tang et al., SOSP 2015`, `Pete Hodgson, “Feature Toggles (aka Feature Flags)”, martinfowler.com (2017)`, `Cloudflare outage report (2019)`, `SEC Knight Capital order (2013)`, `Google SRE book`]
}
];

SDA.register({
  kind:'module', id:'architecture', order:10, level:'realworld', icon:'🏛️', title:'Architecture & Platform',
  summary:'DDD and bounded contexts; service discovery, service mesh and sidecars; API composition; strangler-fig migration; serverless, containers and Kubernetes; twelve-factor apps; multi-tenancy; hexagonal architecture; configuration and feature flags.',
  outcomes:['Draw service and team boundaries from bounded contexts', 'Choose discovery, mesh and composition approaches and explain their costs', 'Plan an incremental strangler-fig migration with safe traffic shifting', 'Pick between serverless, containers and Kubernetes for a workload', 'Design tenant isolation, ports-and-adapters cores and safe config/flag rollouts'],
  lessons,
  quiz:[
    {q:'In DDD, a bounded context is…', options:['A database table', 'A boundary within which a model and its terms have one precise meaning', 'A microservice by definition', 'A UI page'], answer:1, why:'Language and model are consistent inside it.'},
    {q:'Client-side service discovery means…', options:['The client looks up instances in a registry and load-balances itself', 'DNS only', 'A hardware load balancer', 'Hard-coded IPs'], answer:0, why:'Eureka + Ribbon style.'},
    {q:'What is the main job of a service mesh’s control plane?', options:['Run business logic', 'Configure proxies: routes, policies, certificates, discovery', 'Store user data', 'Compile code'], answer:1, why:'Proxies form the data plane.'},
    {q:'A page fans out to 8 services in parallel. Its latency is roughly…', options:['The average of the 8', 'The fastest call', 'The slowest call', 'The sum'], answer:2, why:'Parallel composition waits for the max.'},
    {q:'The first step of a strangler-fig migration is…', options:['Rewrite everything', 'Put a routing facade in front of the legacy system', 'Delete the monolith', 'Freeze features for a year'], answer:1, why:'The facade lets you shift traffic per route.'},
    {q:'Which workload fits serverless FaaS best?', options:['Steady 24×7 high-throughput API', 'Spiky, event-driven file processing', 'A 6-hour batch job in one invocation', 'A stateful game server'], answer:1, why:'Pay per use and scale with events.'},
    {q:'Containers isolate processes using…', options:['A hypervisor', 'Linux namespaces and cgroups', 'Separate kernels', 'Firewalls only'], answer:1, why:'Namespaces for visibility, cgroups for resources.'},
    {q:'Kubernetes controllers work by…', options:['Running scripts once', 'Continuously reconciling actual state toward declared desired state', 'Polling users', 'Manual approval'], answer:1, why:'Level-triggered reconciliation.'},
    {q:'Twelve-factor says user sessions should live…', options:['In the web process’s memory', 'In a backing service (e.g. Redis)', 'In log files', 'In the container image'], answer:1, why:'Processes are stateless and disposable.'},
    {q:'Strongest isolation, highest cost per tenant:', options:['Pool', 'Silo', 'Bridge', 'Shared schema'], answer:1, why:'Dedicated resources per tenant.'},
    {q:'In hexagonal architecture, switching payment vendors should change…', options:['The domain rules', 'One adapter and wiring', 'Every controller', 'The tests of the core'], answer:1, why:'Ports isolate the core from vendors.'},
    {q:'A feature flag lets you…', options:['Deploy code without releasing it, and turn it off instantly', 'Skip testing', 'Avoid code review', 'Encrypt data'], answer:0, why:'Separate deploy from release.'},
    {type:'scenario', q:'A 10-year-old food-delivery monolith (one Postgres DB) must become independently deployable services without stopping feature work. Plan it.', answer:'<ol><li><b>Map bounded contexts</b> (Ordering, Catalog, Delivery, Payments, Support) and team ownership; first refactor into a <b>modular monolith</b> with enforced module boundaries.</li><li><b>Facade</b>: API gateway in front of the monolith routing by path.</li><li><b>First slice</b>: a well-bounded, read-heavy capability (restaurant search/catalog read), fed by <b>CDC</b> from the monolith DB into its own store; shadow, then canary traffic.</li><li>Move ownership of tables per context; publish domain events (outbox) instead of shared tables; use sagas for cross-context workflows.</li><li>Platform: containers + Kubernetes or a managed platform, service discovery, standard observability and feature flags; 12-factor services.</li><li>Iterate route by route; delete monolith code after each 100% cut-over; measure lead time and incident rates.</li></ol>'},
    {type:'scenario', q:'Design tenant isolation for a B2B invoicing SaaS with 5,000 SMB tenants and 10 bank tenants that require data in India and their own keys.', answer:'<ul><li><b>Bridge model</b>: SMBs pooled (shared services, DB sharded by tenant_id with a tenant → shard directory); banks siloed at the data layer (dedicated DB per bank in an Indian region, customer-managed KMS keys), possibly shared compute with per-tenant pools.</li><li><b>Tenant context</b> from verified JWT claims at the gateway, propagated; <b>row-level security</b> in pooled DBs; scoped credentials per silo.</li><li><b>Noisy neighbours</b>: per-tenant rate limits and quotas; exports/reports on separate queues with per-tenant concurrency caps; shuffle-sharded workers.</li><li><b>Ops</b>: per-tenant metrics and cost attribution; automated onboarding; tooling to promote a growing tenant from pool to silo.</li></ul>'}
  ],
  cheatsheet:[
    {h:'🧭 DDD', items:['Ubiquitous language per context', 'Bounded context = model boundary = good service/team boundary', 'Aggregate = consistency unit, keep small', 'Events between contexts; anti-corruption layers', 'Modular monolith first, extract later']},
    {h:'🔎 Discovery & mesh', items:['Register + heartbeat + evict', 'Client-side (Eureka) vs server-side (LB/K8s Service) vs DNS', 'Deregister before shutdown', 'Mesh: sidecar data plane + control plane', 'mTLS, retries, traffic split, telemetry without code']},
    {h:'🧩 Composition & migration', items:['Parallelise independent calls; timeouts per call', 'Partial responses for optional data', 'Fan-out amplifies tail latency', 'Strangler: facade → slice → CDC → canary → delete', 'Decide the system of record per phase']},
    {h:'☁️ Compute choices', items:['FaaS: spiky/event-driven, pay per use, cold starts, 15-min limit (Lambda)', 'Containers: image layers, namespaces + cgroups', 'Kubernetes: desired state + reconciliation', 'Readiness ≠ liveness; requests vs limits', 'Managed PaaS for small teams']},
    {h:'🏢 SaaS & structure', items:['12-factor: config outside code, stateless processes, logs to stdout, build once', 'Tenancy: silo / pool / bridge per layer', 'Tenant from verified token; RLS; per-tenant quotas', 'Hexagonal: core + ports; adapters at edges; deps point inward']},
    {h:'🚩 Config & flags', items:['Config is code: review, validate, canary', '~70% of outages come from changes (Google SRE)', 'Flags: release, ops/kill switch, experiment, permission', 'Bucket = hash(flag + user) mod 100', 'Delete flags after rollout']}
  ],
  glossary:[
    {term:'Domain-driven design', aka:['DDD'], def:'An approach that models software around the business domain, its language and its boundaries.'},
    {term:'Bounded context', aka:['bounded contexts'], def:'A boundary within which a domain model and its terms have one consistent meaning.'},
    {term:'Ubiquitous language', def:'The shared vocabulary of domain experts and developers, used directly in code within a bounded context.'},
    {term:'Aggregate (DDD)', aka:['aggregate root', 'aggregates (DDD)'], def:'A cluster of domain objects changed together as one consistency unit through a root entity.'},
    {term:'Context map', def:'A diagram of bounded contexts and the integration relationships between them.'},
    {term:'Anti-corruption layer', aka:['ACL'], def:'A translation layer that keeps a foreign model from leaking into your domain model.'},
    {term:'Service discovery', def:'Finding the current network locations of healthy service instances.'},
    {term:'Service registry', def:'A database of available service instances, kept current via registration and health checks.'},
    {term:'Eureka', def:'Netflix’s open-source service registry for client-side discovery.'},
    {term:'Consul', def:'HashiCorp’s service discovery, health checking and configuration tool.'},
    {term:'Service mesh', def:'An infrastructure layer of proxies that handles service-to-service communication, security and telemetry.'},
    {term:'Sidecar', aka:['sidecar proxy', 'sidecars'], def:'A helper container deployed alongside an application container, sharing its network and lifecycle.'},
    {term:'Data plane', def:'The components that handle actual traffic, e.g. the proxies in a service mesh.'},
    {term:'Control plane', def:'The components that configure and manage the data plane.'},
    {term:'Envoy', def:'A high-performance open-source L4/L7 proxy, originally built at Lyft, used in many service meshes and gateways.'},
    {term:'Istio', def:'A service mesh that configures Envoy proxies for mTLS, traffic management and telemetry.'},
    {term:'API composition', aka:['API aggregation'], def:'Building one response by calling several services and merging their results.'},
    {term:'GraphQL federation', def:'Composing one GraphQL schema from subgraphs owned by different teams.'},
    {term:'Partial response', def:'A response that returns available data and flags sections that failed instead of failing entirely.'},
    {term:'Branch by abstraction', def:'Replacing a component inside a codebase by introducing an abstraction, building the new implementation behind it, then switching.'},
    {term:'Shadow traffic', aka:['traffic shadowing', 'mirroring'], def:'Sending a copy of production requests to a new system without using its responses, to compare behaviour.'},
    {term:'Serverless', def:'A cloud model where the provider manages servers and scaling and bills per use.'},
    {term:'Function as a Service', aka:['FaaS'], def:'Running individual functions triggered by events, billed per invocation and duration.'},
    {term:'AWS Lambda', aka:['Lambda function'], def:'Amazon’s FaaS platform.'},
    {term:'Serverless cold start', aka:['cold starts', 'cold-start latency'], def:'Extra latency when a serverless platform must create a new execution environment for a function.'},
    {term:'Provisioned concurrency', def:'Pre-initialised serverless environments kept warm to avoid cold starts.'},
    {term:'Container', aka:['containers'], def:'An isolated process with its own filesystem view and resource limits, sharing the host kernel.'},
    {term:'Docker', def:'A platform and tooling for building and running containers from images.'},
    {term:'Container image', aka:['OCI image', 'Docker image'], def:'An immutable, layered package of an application and its dependencies.'},
    {term:'Linux namespaces', aka:['namespaces'], def:'Kernel feature giving processes isolated views of PIDs, network, mounts, users and more.'},
    {term:'cgroups', aka:['control groups'], def:'Kernel feature limiting and accounting CPU, memory and I/O for groups of processes.'},
    {term:'Kubernetes', aka:['K8s'], def:'An open-source system for deploying, scaling and managing containerised applications.'},
    {term:'Pod', aka:['pods'], def:'The smallest deployable unit in Kubernetes: one or more containers sharing network and storage.'},
    {term:'Kubernetes Deployment', def:'A Kubernetes object that manages replicated pods and rolling updates.'},
    {term:'Kubernetes Service', def:'A stable network endpoint (virtual IP + DNS name) for a set of pods.'},
    {term:'Reconciliation loop', aka:['reconcile loop', 'control loop'], def:'A controller loop that repeatedly drives actual state toward desired state.'},
    {term:'etcd', def:'A strongly consistent key-value store (Raft-based) holding Kubernetes cluster state.'},
    {term:'Twelve-factor app', aka:['12-factor', 'twelve-factor'], def:'A methodology for building portable, scalable, cloud-deployable services.'},
    {term:'Multi-tenancy', aka:['multi-tenant'], def:'Serving multiple customers (tenants) from shared software and infrastructure.'},
    {term:'Tenant isolation', def:'Ensuring tenants cannot access each other’s data or degrade each other’s performance.'},
    {term:'Noisy neighbour', aka:['noisy neighbor'], def:'A tenant or workload that consumes shared resources and degrades others.'},
    {term:'Row-level security', aka:['RLS'], def:'Database policies that restrict which rows a session can read or modify.'},
    {term:'Hexagonal architecture', aka:['ports and adapters'], def:'Structuring an app with a core domain surrounded by ports (interfaces) and adapters (implementations).'},
    {term:'Clean architecture', def:'A layered architecture where dependencies point inward toward business rules.'},
    {term:'Feature flag', aka:['feature flags', 'feature toggle'], def:'A runtime switch that enables or disables functionality without deploying code.'},
    {term:'Kill switch', def:'A flag that instantly disables a feature or dependency in an emergency.'},
    {term:'Progressive delivery', def:'Releasing changes gradually to growing audiences with monitoring and automated rollback.'},
    {term:'Configuration as code', aka:['config as code'], def:'Managing configuration in version control with review, testing and staged rollout.'}
  ],
  sources:['Evans, Domain-Driven Design (2003); Vernon, Implementing DDD (2013)', 'Uber Engineering — DOMA (2020); Netflix Tech Blog — Eureka, GraphQL federation (2020), Hexagonal Architecture (2020)', 'Envoy, Istio, Linkerd, Consul and Kubernetes documentation', 'Fowler — StranglerFigApplication; Newman, Monolith to Microservices (2019)', 'AWS Lambda documentation; Prime Video Tech Blog (2023); Jonas et al., Berkeley View on Serverless (2019)', 'Verma et al., Borg, EuroSys 2015; Burns et al., “Borg, Omega, and Kubernetes”, ACM Queue (2016)', 'Wiggins, The Twelve-Factor App (2011); AWS SaaS Lens; Salesforce multitenant whitepaper', 'Cockburn, Hexagonal Architecture (2005); Tang et al., Holistic Configuration Management at Facebook, SOSP 2015; Hodgson, Feature Toggles (2017)']
});
} catch(e){ console.error('[SDA] module architecture', e); SDA.errors.push({id:'architecture', error:e}); }
})();
