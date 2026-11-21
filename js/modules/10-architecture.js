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
  const ROUTES = [{p:'/status/:id', team:'Status'}, {p:'/reports/new', team:'Reports'}, {p:'/crews', team:'Dispatch'}, {p:'/work/:id', team:'Contractors'}, {p:'/invoices', team:'Billing'}, {p:'/admin/*', team:'Operations'}];
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
  const newPod = () => { const free = NODES.filter(n => !nodesDown[n]); const load = n => pods.filter(p => p.node === n && p.state !== 'gone').length; const node = free.sort((a, b) => load(a) - load(b))[0]; if (!node) return null; const p = {id:'status-' + (++seq).toString(36) + Math.floor(Math.random() * 1e3), node, state:'pending', since:t}; pods.push(p); return p; };
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
      ['<b>Silo</b>', 'Nothing: a stack (or DB) per tenant', fmtNum(silo), 'Strongest; one tenant can’t slow another', 'High: N deployments, N migrations', 'Few large cities with strict rules'],
      ['<b>Pool</b>', 'Everything; rows tagged with tenant_id', fmtNum(pool), 'Weakest: needs per-tenant quotas and row-level security', 'Low: one deployment', 'Many small towns'],
      ['<b>Bridge / tiered</b>', `Pool for most; silo for the top ${P.big}`, fmtNum(bridge), 'Strong for premium tenants, pooled for the rest', 'Medium', 'A mix of towns and big cities']], [2])));
    out.append(el('div', {class:'verdict ok'}, `With ${P.tenants} tenants, silo costs about ${(silo / pool).toFixed(0)}× a fully pooled design. That is why most SaaS products pool small tenants and offer dedicated (silo) deployments as a premium tier.`));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Number of tenants', min:5, max:5000, step:5, value:P.tenants, fmt:v => fmtNum(v), onInput:v => { P.tenants = v; P.big = Math.min(P.big, v); run(); }}).el, ui.slider({label:'Enterprise tenants needing dedicated stacks', min:0, max:50, value:P.big, fmt:v => String(v), onInput:v => { P.big = Math.min(v, P.tenants); run(); }}).el), out,
    el('p', {class:'lab-hint'}, 'Illustrative cost model: a dedicated stack ≈ 1 unit per tenant; a pooled stack ≈ 4 units base + 0.05 per tenant.'));
  run();
}
function flagDemo(host){
  const users = ['asha', 'rahul', 'meera', 'arjun', 'zoya', 'kabir', 'neha', 'vikram', 'ishaan', 'priya', 'sana', 'dev', 'tara', 'omar', 'anya', 'rohan', 'kavya', 'nikhil', 'divya', 'farhan'];
  const city = u => ['Pune', 'Delhi', 'Chennai', 'Kolkata'][fnv(u + ':city') % 4];
  const P = {pct:20, kill:false, pune:false, flag:'new-report-form'}; const grid = el('div', {class:'pill-row'}); const out = el('div');
  const bucket = u => fnv(P.flag + ':' + u) % 100;
  function on(u){ if (P.kill) return false; if (P.pune && city(u) === 'Pune') return true; return bucket(u) < P.pct; }
  function run(){
    grid.innerHTML = ''; let n = 0;
    users.forEach(u => { const yes = on(u); if (yes) n++; grid.append(el('span', {class:'chip mono', title:`bucket ${bucket(u)} · ${city(u)}`, style:{borderColor:yes ? 'var(--ok)' : 'var(--border)', color:yes ? 'var(--ok)' : 'var(--muted)', background:yes ? 'var(--ok-bg)' : 'transparent'}}, `${yes ? '✔' : '·'} ${u} <${bucket(u)}>`)); });
    out.innerHTML = ''; out.append(el('div', {class:'verdict ' + (P.kill ? 'bad' : 'ok')}, P.kill ? 'Kill switch ON: the feature is off for everyone instantly, with no deploy. That is your fastest rollback.' : `${n}/20 users see “${P.flag}”. Each user’s bucket = hash(flag + user) mod 100, so raising the percentage only <b>adds</b> users: nobody flips back and forth, and each flag gets an independent sample.`.replace(/<b>|<\/b>/g, '')));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Rollout percentage', min:0, max:100, step:5, value:P.pct, fmt:v => v + '%', onInput:v => { P.pct = v; run(); }}).el, ui.select({label:'Flag', value:P.flag, options:[['new-report-form', 'new-report-form'], ['photo-upload', 'photo-upload']], onChange:v => { P.flag = v; run(); }}).el),
    el('div', {class:'controls', style:{margin:'8px 0'}}, ui.toggle({label:'Target rule: everyone in Pune', checked:false, onChange:v => { P.pune = v; run(); }}).el, ui.toggle({label:'🚨 Kill switch', checked:false, onChange:v => { P.kill = v; run(); }}).el), grid, out);
  run();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'ddd-bounded-contexts', title:'Domain-driven design and bounded contexts', minutes:12, tags:['DDD','bounded context','ubiquitous language','aggregate','context map'],
  summary:'Domain-driven design builds software around the real business. A bounded context is a boundary where each word has one clear meaning. These boundaries help decide where services and teams should split.',
  problem:`<h3>A small example</h3><p>The city maintenance app has one shared Request record. Four teams use the word “request” in four ways.</p><ul><li>Residents: a report with a photo and a place</li><li>Dispatch: a job for a crew</li><li>Contractors: paid work with materials</li><li>Billing: a cost to pay</li></ul><p>One change by the billing team breaks the report form. How can each team keep its own clear meaning?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one pothole report as each part of the app uses the word in its own way.</p>',
    steps:[
      {icon:'🗣️', title:'Learn the words', text:'Talk with the people who do the work. Use their exact words in the code too.'},
      {icon:'🧩', title:'Draw the boundaries', text:'Group the words by who owns them. Reports, Dispatch and Contractors each get a boundary called a bounded context.'},
      {icon:'📮', title:'Share only facts', text:'Reports sends a small notice called ReportFiled with the place and the problem type. It does not share its whole record.'},
      {icon:'🛠️', title:'Build your own model', text:'Dispatch turns the notice into its own Job. Contractors makes its own WorkOrder.'},
      {icon:'🛡️', title:'Translate outside data', text:'A translation layer converts a contractor system’s odd field names. Those names never enter the city’s model.'}
    ],
    diagram:{title:'Bounded contexts in the city app', w:800, h:270, alt:'Reports sends a ReportFiled notice. Dispatch, Status and Contractors each build their own model from it.',
      nodes:[{id:'ord', type:'service', label:'Reports', sub:'Report, Photo', x:120, y:135, w:130}, {id:'bus', type:'queue', label:'Notice board', sub:'ReportFiled', x:320, y:135, w:130}, {id:'rest', type:'service', label:'Dispatch', sub:'Job, Crew', x:540, y:45, w:140}, {id:'del', type:'service', label:'Status', sub:'StatusCard', x:540, y:135, w:140}, {id:'pay', type:'service', label:'Contractors', sub:'WorkOrder', x:540, y:225, w:140}, {id:'acl', type:'ext', label:'Translation layer', sub:'contractor format', x:730, y:225, w:150}],
      edges:[{from:'ord', to:'bus'}, {from:'bus', to:'rest'}, {from:'bus', to:'del'}, {from:'bus', to:'pay'}, {from:'pay', to:'acl'}],
      steps:[
        {note:'Reports owns the <b>Report</b>. When a resident files it, Reports sends a small <code>ReportFiled</code> notice with only the facts others need.', flow:[['ord', 'bus', 'ReportFiled']], hl:['ord']},
        {note:'Each context builds <b>its own model</b> from the notice: a Job, a StatusCard and a WorkOrder. They share no table.', flow:[['bus', 'rest', 'job'], ['bus', 'del', 'card'], ['bus', 'pay', 'order']], parallel:true},
        {note:'Contractors talks to an outside system through a <b>translation layer</b>, so its odd field names stay outside the city’s model.', flow:[['pay', 'acl', 'WorkOrder to contractor format']], hl:['acl']}
      ]},
    html:`<h3>Everyday comparison</h3><p>Think of departments in city hall. Each has its own forms and its own words.</p><div class="simple-table">${h.table(['City hall', 'The app'], [['The front desk takes a complaint', 'Reports holds a report.'], ['The roads office plans a repair', 'Dispatch holds a job.'], ['The finance office pays the bill', 'Billing holds a cost.']])}</div><div class="callout tip"><b>Important point</b><p>A bounded context is not a table or a small service. It is a boundary where one word has one meaning.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['If this happens', 'Do this'], [['Two teams use one word differently', 'Give each team its own context.'], ['One team needs another team’s facts', 'Send a small notice with only those facts.'], ['An outside system uses odd names', 'Translate them at the edge.']])}</div>`,
    deep:`<h4>The numbers</h4><p>If four teams share one Request record, a change needs a talk between each pair of teams. That is 4 × 3 ÷ 2 = 6 pairs. With 10 teams it is 10 × 9 ÷ 2 = 45 pairs. Separate contexts cut this down. Each team talks only with the few contexts it really needs.</p><h4>When it goes wrong</h4><p>A notice is a promise to its readers. Adding a new field is safe, because old readers ignore what they do not know. Renaming or removing a field breaks them. So publish the new version next to the old one, and remove the old one when no reader uses it.</p><h4>How it works inside</h4><p>If two services must change together in almost every release, the boundary is probably in the wrong place. Give each context one owning team, so a question about the word “job” has one place to go. A context that is too small costs more in meetings and calls than it saves.</p>`
  },
  tradeoffs:{use:[`Use contexts when Reports, Dispatch and Contractors keep changing at different speeds.`, `Use them to decide which team owns the Job record and which owns the Report.`], avoid:[`Do not share one big Request table between all four teams.`, `Do not make one context for every record type. The parts will talk to each other all day.`], alt:[`For a small city team, keep one program with clear modules for each context.`]},
  real:[
    {co:'Eric Evans', tier:'confirmed', text:'Evans introduced ubiquitous language, bounded contexts and aggregates in his 2003 book.', src:'Evans, Domain-Driven Design (2003)'},
    {co:'Uber', tier:'confirmed', text:'Uber described grouping its many microservices into domains with clear entry points, to reduce tangled dependencies.', src:'Uber Engineering, DOMA (2020)'}
  ],
  mistakes:[`One shared Request record used by every team.`, `Splitting by technical layer, such as a screens team and a database team, instead of by the meaning of words.`, `Making a tiny service for every record type.`],
  interview:[`Name the contexts and what each owns before drawing boxes.`, `Say which facts travel in notices and which facts stay private.`],
  tryit:[
    {quiz:[{q:'Why does the city app give Dispatch its own Job record?', options:['Dispatch needs a different meaning than Reports', 'Reports cannot store photos', 'Jobs must be larger than reports', 'Two tables are always faster'], answer:0, why:'Each context keeps the meaning and fields that its team needs.'}, {q:'What does a ReportFiled notice carry?', options:['Only the facts other contexts need', 'The whole Reports database', 'Every field a resident typed', 'The private notes of every team'], answer:0, why:'Small notices keep contexts from depending on each other’s inner records.'}]},
    {note:'Which context should own each fact?', mount:host => sortGame(host, [
      {t:'Photo and address of a pothole', c:'rep', why:'Reports owns what the resident filed.'},
      {t:'Which crew goes out on Tuesday', c:'disp', why:'Dispatch decides crews and times.'},
      {t:'Amount owed to a contractor', c:'bill', why:'Billing owns money owed.'},
      {t:'Resident’s contact choice for updates', c:'rep', why:'It was given with the report.'},
      {t:'The crew’s route for the day', c:'disp', why:'Routes are a dispatch concern.'},
      {t:'Paid or unpaid state of an invoice', c:'bill', why:'Billing tracks payment state.'}
    ], [{id:'rep', label:'Reports'}, {id:'disp', label:'Dispatch'}, {id:'bill', label:'Billing'}])}
  ],
  sources:[`Evans, Domain-Driven Design (2003)`, `Vernon, Implementing Domain-Driven Design (2013)`, `Uber Engineering, DOMA (2020)`, `Conway, How Do Committees Invent (1968)`]
},
{
  id:'service-discovery', title:'Service discovery', minutes:9, tags:['service discovery','registry','Eureka','Consul','DNS','Kubernetes Service'],
  summary:'Service discovery keeps a current list of the healthy copies of each service. Callers ask the list instead of using fixed addresses.',
  problem:`<h3>A small example</h3><p>The Dispatch service must call the Crew Location service. That service runs as three copies.</p><ul><li>Copies start and stop during the day.</li><li>Each copy has a different address.</li><li>One copy stops at 3 PM.</li></ul><p>How does Dispatch always find a copy that is alive?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one Crew Location copy as it joins, works and then stops.</p>',
    steps:[
      {icon:'📝', title:'Register', text:'A new copy tells a list, called the registry, its name and address. Now the registry knows it exists.'},
      {icon:'💓', title:'Send heartbeats', text:'The copy sends a small “I am alive” signal every few seconds.'},
      {icon:'🔎', title:'Look up a copy', text:'Dispatch asks the registry for Crew Location copies and saves the list. Then it calls one copy.'},
      {icon:'🗑️', title:'Remove the dead', text:'After a few missed signals, the registry removes the copy. Dispatch drops it when its saved list refreshes.'},
      {icon:'⏱️', title:'Know the delay', text:'Until then, some calls reach the dead copy. Shorter signal and refresh times shrink that window.'}
    ],
    diagram:{title:'Registration, heartbeats and lookup', w:780, h:250, alt:'Crew Location copies register with a registry. The Dispatch service looks them up and calls one directly.',
      nodes:[{id:'o', type:'service', label:'Dispatch', x:110, y:125, w:130}, {id:'reg', type:'db', label:'Service registry', sub:'crew-location: a, b, c', x:360, y:125, w:170}, {id:'a', type:'service', label:'crew-location-a', x:640, y:45, w:140}, {id:'b', type:'service', label:'crew-location-b', x:640, y:125, w:140}, {id:'c', type:'service', label:'crew-location-c', x:640, y:205, w:140}],
      edges:[{from:'a', to:'reg'}, {from:'b', to:'reg'}, {from:'c', to:'reg'}, {from:'o', to:'reg'}, {from:'o', to:'b', dashed:true}],
      steps:[
        {note:'Each copy <b>registers</b> and then sends a heartbeat every few seconds.', flow:[['a', 'reg', 'register'], ['b', 'reg', 'register'], ['c', 'reg', 'register']], parallel:true},
        {note:'Dispatch asks for <code>crew-location</code>, saves the list and calls one copy directly.', flow:[['o', 'reg', 'lookup'], ['reg', 'o', 'a, b, c'], ['o', 'b', 'where is crew 7?']]},
        {note:'Copy c stops and stops sending heartbeats. After a few missed beats the registry <b>removes</b> it. Callers drop it on their next refresh.', status:{c:'down'}, sub:{reg:'crew-location: a, b'}, hl:['reg']}
      ]},
    mount:host => discoveryCalc(host),
    html:`<h3>Everyday comparison</h3><p>Picture a duty board at the city depot.</p><div class="simple-table">${h.table(['Depot duty board', 'Service registry'], [['A crew signs in at the start of the shift', 'A copy registers.'], ['The crew checks in every hour', 'The copy sends heartbeats.'], ['A crew that stops checking in is crossed out', 'Missed heartbeats remove the copy.']])}</div><div class="callout tip"><b>Important point</b><p>The list is only as fresh as its last update. Callers can still reach a dead copy for a short time.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Style', 'Who picks the copy'], [['Client-side', 'Dispatch asks the registry and picks a copy itself.'], ['Server-side', 'Dispatch calls a load balancer that knows the copies.'], ['DNS-based', 'Dispatch uses one name, and DNS returns addresses.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say heartbeats come every 10 seconds and the registry removes a copy after 3 misses. That is 10 × 3 = 30 seconds. If Dispatch refreshes its saved list every 30 seconds, a dead copy can stay in use for up to 30 + 30 = 60 seconds. At 30 calls per second over 3 copies, 10 calls per second go to the dead copy. That is 10 × 60 = 600 failed calls.</p><p>Now say Dispatch also skips a copy for 30 seconds after 3 failed calls in a row. Then only about 3 calls fail. Retry only calls that are safe to repeat.</p><h4>When it goes wrong</h4><p>A heartbeat only proves the process is running. A copy with a broken database link can still send heartbeats and fail every call. So make the health check test what the copy needs. Keep it cheap, or the checks add load of their own.</p><h4>How it works inside</h4><p>If a network split hides 100 copies at once, the registry may be the one that is cut off. Eureka then keeps its last list instead of deleting everything. A stale list is often better than an empty one.</p>`
  },
  tradeoffs:{use:[`Use a registry or platform list when Crew Location copies start and stop during the day.`, `Use health checks that test real work, such as answering a crew lookup.`], avoid:[`Do not give Dispatch a fixed address for a copy that can disappear.`, `Do not keep the saved list for a long time.`], alt:[`Put a load balancer with health checks in front of Crew Location.`, `Let a service mesh keep the list and the routing rules. You will learn this in the next lesson.`]},
  real:[
    {co:'Netflix Eureka', tier:'confirmed', text:'Netflix open-sourced Eureka, a registry for client-side discovery that prefers a stale list over no list during network problems.', src:'Netflix Eureka wiki'},
    {co:'Kubernetes', tier:'confirmed', text:'A Kubernetes Service gives a set of copies one stable name, and it lists only copies that are ready.', src:'Kubernetes documentation, Service'}
  ],
  mistakes:[`Stopping a copy before removing it from the list.`, `A health check that only proves the process is running, not that it can answer.`, `Saving the list forever.`],
  interview:[`Pick client-side or server-side discovery and say how fast a dead copy is noticed.`, `Mention removing a copy from the list before a deploy stops it.`],
  tryit:{note:'Change the times in the calculator above. Then check yourself.', quiz:[{q:'A copy dies. Heartbeats come every 10 s, removal needs 3 misses, and callers refresh every 30 s. What is the worst case until callers stop using it?', options:['10 s', '30 s', '60 s', '3 min'], answer:2, why:'30 s to remove it, plus up to 30 s until the saved list refreshes.'}, {q:'Why remove a copy from the registry before stopping it?', options:['To save disk space', 'So callers stop sending it new calls', 'To speed up heartbeats', 'To change its address'], answer:1, why:'Callers then stop choosing it, so a deploy causes no burst of errors.'}], quizId:'arch-l2'},
  sources:[`Netflix Eureka`, `Kubernetes Service documentation`, `Consul documentation`, `Richardson, Microservices Patterns (2018)`]
},
{
  id:'service-mesh-sidecar', title:'Service mesh and the sidecar pattern', minutes:10, tags:['service mesh','sidecar','Envoy','Istio','Linkerd','mTLS'],
  summary:'A service mesh moves shared networking rules out of app code and into small helper proxies called sidecars. A control plane manages those rules from one place.',
  problem:`<h3>A small example</h3><p>The city app now has 30 services in four programming languages. Every call between them must be secure, limited in time and counted.</p><ul><li>Security wants both sides of a call to prove who they are.</li><li>Operations wants the same retry and timeout rules everywhere.</li><li>The release team wants 5% of Dispatch calls to go to a new version.</li></ul><p>Can every team add these rules in four languages and keep them identical?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one call from the Dispatch app to the Contractors app.</p>',
    steps:[
      {icon:'📦', title:'Add a helper', text:'Each service copy gets a small helper program next to it, called a sidecar. All calls in and out pass through it.'},
      {icon:'📞', title:'Keep the app simple', text:'The Dispatch app makes a plain call to Contractors. Its own sidecar picks up the call.'},
      {icon:'🔐', title:'Prove who is calling', text:'The two sidecars check each other’s identity before they talk. This is called mutual TLS, or mTLS.'},
      {icon:'⏱️', title:'Apply shared rules', text:'The sidecar applies the same timeout, retry limit and traffic split every time. It also records how long each call took.'},
      {icon:'🎛️', title:'Change rules in one place', text:'A control plane sends new rules and certificates to every sidecar. No app code changes.'}
    ],
    diagram:{title:'Sidecars and the control plane', w:800, h:260, alt:'Dispatch calls Contractors through two sidecar proxies using mTLS. A control plane configures both.',
      nodes:[{id:'o', type:'service', label:'Dispatch app', x:90, y:150, w:130}, {id:'so', type:'lb', label:'Envoy sidecar', x:260, y:150, w:130}, {id:'sp', type:'lb', label:'Envoy sidecar', x:520, y:150, w:130}, {id:'p', type:'service', label:'Contractors app', x:700, y:150, w:140}, {id:'cp', type:'ext', label:'Control plane', sub:'rules, certificates, list of copies', x:390, y:45, w:230}],
      edges:[{from:'o', to:'so'}, {from:'so', to:'sp'}, {from:'sp', to:'p'}, {from:'cp', to:'so', dashed:true}, {from:'cp', to:'sp', dashed:true}],
      steps:[
        {note:'The control plane sends routes, retry and timeout rules, and short-lived <b>certificates</b> to every sidecar.', flow:[['cp', 'so', 'rules'], ['cp', 'sp', 'rules']], parallel:true},
        {note:'Dispatch makes a plain call to <code>contractors</code> on its own machine. Its sidecar takes over.', flow:[['o', 'so', 'assign job 41']]},
        {note:'Sidecar to sidecar: <b>mTLS</b> proves both identities, then the call goes through with the shared timeout and retry rules.', flow:[['so', 'sp', 'mTLS'], ['sp', 'p', 'assign job 41']], hl:['so', 'sp']}
      ]},
    html:`<h3>Everyday comparison</h3><p>Think of the security desk and mail room in a city office building.</p><div class="simple-table">${h.table(['Office building', 'Service mesh'], [['The guard checks every visitor’s badge', 'Sidecars check identity with mTLS.'], ['Facilities sets the building rules', 'The control plane sends the rules.'], ['The mail room logs every parcel', 'Sidecars record each call.']])}</div><div class="callout tip"><b>Important point</b><p>The mesh handles how services talk. It does not decide city rules, such as which crew gets a job first.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Concern', 'Where it lives'], [['Prove who is calling', 'The mesh'], ['Retry and timeout limits', 'The mesh, set once'], ['Which crew gets a job', 'App code']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say each service has 4 copies, so 30 services need 30 × 4 = 120 sidecars. If each uses 50 MB of memory, that is 120 × 50 = 6,000 MB, about 6 GB, before any app memory.</p><p>Say each proxy adds 1 ms. A call passes two proxies, so it adds about 2 ms. A request that crosses 4 services in a chain adds about 4 × 2 = 8 ms.</p><h4>When it goes wrong</h4><p>Retries multiply when they are set at two levels. Say the app tries 3 times and the mesh also tries 3 times for each one. One failing call becomes 3 × 3 = 9 attempts. Down a chain of services this grows fast. Pick one place for retries and cap them.</p><h4>How it works inside</h4><p>For mTLS, the control plane gives each sidecar a short-lived certificate for its service identity. It renews the certificate before it expires, without restarting the app. Then a rule can allow Dispatch to call Contractors while Photos is refused.</p>`
  },
  tradeoffs:{use:[`Use a mesh when 30 services in four languages need the same mTLS and retry rules.`, `Use it to send 5% of Dispatch calls to a new version.`], avoid:[`Do not add a mesh when the city has only a few services.`, `Do not add it if no team has time to run the control plane.`], alt:[`Share one code library for timeouts and retries if the services use one language.`, `Use an API gateway only for traffic coming in from outside.`]},
  real:[
    {co:'Lyft and Envoy', tier:'confirmed', text:'Lyft built Envoy for its many services and open-sourced it in 2016. Other tools later used it.', src:'Lyft Engineering, Announcing Envoy (2016)'},
    {co:'Istio', tier:'confirmed', text:'Istio manages Envoy sidecars for mTLS and traffic rules. It also offers a mode without a sidecar per copy.', src:'Istio documentation'}
  ],
  mistakes:[`Adding a mesh to fix a problem that is really missing timeouts.`, `Setting retries in both the app and the mesh.`, `Ignoring the memory used by many sidecars.`],
  interview:[`Explain the data plane and the control plane in one sentence each.`, `Name the costs and say when a shared library is enough.`],
  tryit:[
    {quiz:[{q:'What does the control plane do?', options:['Runs city business rules', 'Sends settings and certificates to the sidecars', 'Stores resident reports', 'Compiles the app'], answer:1, why:'The sidecars carry traffic. The control plane only configures them.'}, {q:'The app retries 3 times and the mesh retries 3 times. How many attempts can one failing call cause?', options:['3', '6', '9', '12'], answer:2, why:'3 × 3 = 9 attempts.'}]},
    {note:'Where should this concern live?', mount:host => sortGame(host, [
      {t:'Mutual TLS between all services', c:'mesh', why:'It is a shared rule that every call needs.'},
      {t:'Checking that a report is inside city limits', c:'app', why:'It is a business rule.'},
      {t:'Send 5% of calls to a new version', c:'mesh', why:'Traffic splitting is a routing rule.'},
      {t:'Choosing the nearest crew', c:'app', why:'It is a city rule.'},
      {t:'Timing every call between services', c:'mesh', why:'Sidecars can time every call the same way.'},
      {t:'Deciding a repair needs a permit', c:'app', why:'It is a business decision.'}
    ], [{id:'mesh', label:'Service mesh'}, {id:'app', label:'App code'}])}
  ],
  sources:[`Envoy documentation`, `Istio documentation`, `Linkerd documentation`, `Lyft Engineering, Announcing Envoy (2016)`, `Burns and Oppenheimer, Design patterns for container-based distributed systems (2016)`]
},
{
  id:'api-composition', title:'API composition and aggregation', minutes:9, tags:['API composition','aggregation','fan-out','GraphQL federation','partial response'],
  summary:'API composition builds one response by calling several services and merging their answers. Calls that do not depend on each other can run at the same time. One slow service can slow the whole page.',
  problem:`<h3>A small example</h3><p>A resident opens the status page for a pothole report. The page needs data from five services.</p><ul><li>Reports: the report details</li><li>Dispatch: the crew and visit time</li><li>Contractors: work updates</li><li>Photos: before and after pictures</li><li>Map: the street name</li></ul><p>Five calls from a slow phone would be slow. If one service is slow, what happens to the page?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one status page request through the composer, the service that gathers the data for the page.</p>',
    steps:[
      {icon:'📲', title:'One request in', text:'The phone asks the composer for the status page once. The composer decides which services it needs.'},
      {icon:'🚀', title:'Call in parallel', text:'The five calls do not depend on each other, so they go out together. Chain a call only when it needs an earlier answer.'},
      {icon:'⏱️', title:'Set time limits', text:'Each call gets its own timeout, inside one overall deadline. The report details are required and the rest are optional.'},
      {icon:'🧩', title:'Merge the answers', text:'The composer merges the answers into one page. If photos time out, it still returns the page with a note.'},
      {icon:'🐢', title:'Expect the slowest', text:'A parallel page is as slow as its slowest call. Fewer calls and saved results help.'}
    ],
    mount:host => compositionSim(host),
    html:`<h3>Everyday comparison</h3><p>Think of a clerk at city hall who gathers one file from five offices.</p><div class="simple-table">${h.table(['The clerk', 'The composer'], [['Asks all five offices at once', 'Calls services in parallel.'], ['Waits for the slowest office', 'The page waits for the slowest call.'], ['Hands over the file with a note, “photos missing”', 'Returns a partial response.']])}</div><div class="callout tip"><b>Important point</b><p>Required data must succeed. Optional data may be missing, and the page can say so.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Data', 'Choice'], [['Report details (required)', 'Fail the page if they are missing.'], ['Photos or map (optional)', 'Show a note and keep going.'], ['One call needs another call’s answer', 'Chain only those two calls.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the calls take Reports 80 ms, Dispatch 120 ms, Contractors 60 ms, Photos 200 ms and Map 50 ms. One after another that is 80 + 120 + 60 + 200 + 50 = 510 ms. In parallel the page waits for the slowest, so about 200 ms.</p><p>Slow calls also pile up. If each call is slow 1 time in 100, a 5-call page is slow 1 − 0.99⁵ ≈ 4.9% of the time. With 10 calls it is about 9.6%.</p><h4>When it goes wrong</h4><p>Give optional calls a tight limit. If Photos has a 300 ms limit and takes 3 seconds, the page still ships at about 300 ms with a note. If a call needs another call’s answer, chain only those two. Say Dispatch needs a crew ID from Reports. Those two take 80 + 120 = 200 ms in a row, while the others run alongside.</p><h4>How it works inside</h4><p>A composer should only call, merge and trim. Keep business rules inside the services. Otherwise the composer slowly becomes a second, hidden monolith.</p>`
  },
  tradeoffs:{use:[`Use a composer when the status page needs data from five services.`, `Use one call from the phone when the resident is on a slow network.`], avoid:[`Do not chain five calls one after another when they do not depend on each other.`, `Do not use composition for data that must change together in one step.`], alt:[`Keep a ready-made status record that is updated when reports change.`, `Use a separate composer for the phone app and the website.`]},
  real:[
    {co:'Google', tier:'confirmed', text:'Dean and Barroso showed that fan-out makes slow answers more likely, and they described backup requests to reduce the effect.', src:'Dean and Barroso, The Tail at Scale (2013)'},
    {co:'Netflix', tier:'confirmed', text:'Netflix moved its API layer toward GraphQL federation so domain teams could own their parts of one graph.', src:'Netflix Tech Blog, GraphQL Federation (2020)'}
  ],
  mistakes:[`Calling independent services one after another.`, `No timeout on each call, so the slowest one sets the page time.`, `Failing the whole page because an optional section failed.`],
  interview:[`Mark required and optional data, call in parallel, set timeouts and return partial responses.`, `Say that more calls on one page make slow answers more likely.`],
  tryit:{note:'Raise the number of calls and the failure rate above. Then switch to sequential and compare the p99.', quiz:[{q:'Ten parallel calls each have a p99 of 200 ms. What is the page’s p99?', options:['20 ms', 'Higher than 200 ms', '200 ms', '2,000 ms always'], answer:1, why:'The page waits for the slowest of ten calls, which is slow more often than any one call.'}, {q:'The photo service times out. What should the status page do?', options:['Show the page with a note that photos are missing', 'Fail the whole page', 'Wait until photos arrive', 'Hide the report details too'], answer:0, why:'Photos are optional. Required data decides whether the page works.'}], quizId:'arch-l4'},
  sources:[`Netflix Tech Blog, GraphQL Federation (2020)`, `Dean and Barroso, The Tail at Scale (2013)`, `Richardson, Microservices Patterns (2018)`]
},
{
  id:'strangler-fig', title:'Migrating with the strangler fig pattern', minutes:10, tags:['strangler fig','migration','legacy','routing','incremental'],
  summary:'The strangler fig pattern replaces an old system a little at a time. A routing layer in front sends one route after another to new code. The old system is deleted when nothing uses it.',
  problem:`<h3>A small example</h3><p>The city’s 12-year-old portal is one large program. It is slow to change.</p><ul><li>A full rewrite would take 2 years.</li><li>New features would freeze during that time.</li><li>On switch-over day, hidden old behaviours could be missed.</li></ul><p>How can the city modernise the portal while residents keep using it?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one route, the status page, as it moves from the old portal to new code.</p>',
    steps:[
      {icon:'🚪', title:'Add a front door', text:'Put a routing layer in front of the old portal. At first it sends every request to the old code.'},
      {icon:'🍰', title:'Pick a small slice', text:'Choose one route with clear edges, such as the status page.'},
      {icon:'🔧', title:'Build the new version', text:'Build that route as a new service. Keep its data in step with the old system.'},
      {icon:'🎚️', title:'Shift traffic slowly', text:'Send 1%, then 25%, then 100% of that route to the new code. Compare answers and keep a switch to go back.'},
      {icon:'🧹', title:'Delete and repeat', text:'When nothing uses the old route, delete it. Then pick the next route.'}
    ],
    mount:host => stranglerDemo(host),
    html:`<h3>Everyday comparison</h3><p>Think of renovating a house room by room while the family still lives in it.</p><div class="simple-table">${h.table(['Renovation', 'Migration'], [['A door leads into every room', 'A routing layer sits in front.'], ['Fix one room at a time', 'Move one route at a time.'], ['Remove an old room when the new one is ready', 'Delete old code when no traffic uses it.']])}</div><div class="callout tip"><b>Important point</b><p>Move traffic route by route and always keep a way back. Do not wait for one big switch-over day.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Step', 'Safety check'], [['Copy traffic to the new route', 'Compare answers without showing them to residents.'], ['Send 1% to the new route', 'Watch for errors, then raise slowly.'], ['Something goes wrong', 'Flip that route back to the old code.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the status page gets 30% of all traffic. Sending 1% of that route to new code puts 0.30 × 0.01 = 0.3% of all traffic on it. At 25% it is 0.30 × 0.25 = 7.5%. At 100% it is 30%. Each step is a small risk you can watch before the next.</p><p>Say you copy 10,000 live requests to the new route and 12 answers differ. That is 12 ÷ 10,000 = 0.12%. Study those 12 before you send any real traffic.</p><h4>When it goes wrong</h4><p>Pick residents by a hash of their ID, not at random for each request. Otherwise one resident can see old data, then new data, then old data again. Also do not copy write requests to the new route. A copied “create report” would make a second real report.</p><h4>How it works inside</h4><p>Avoid having both systems write the same data. Give each table one owner at each stage. Moving data between the two is easier with change streams, which you will learn in Module 7.</p>`
  },
  tradeoffs:{use:[`Use it when the portal must stay online while it changes.`, `Start with a route that has clear edges, such as the status page.`], avoid:[`Do not start with the most tangled part, such as billing.`, `Do not run old and new versions of one route forever.`], alt:[`Clean up the old program in place by splitting it into clear modules.`, `A full rewrite is rarely wise, because hidden behaviours get missed.`]},
  real:[
    {co:'Martin Fowler', tier:'confirmed', text:'Fowler named the pattern in 2004 after fig vines that slowly grow around a tree. He recommends gradual replacement over a big rewrite.', src:'Fowler, StranglerFigApplication'},
    {co:'SoundCloud', tier:'confirmed', text:'SoundCloud described moving features out of its large Rails program into new services step by step.', src:'Calçado, How we ended up with microservices (2015)'}
  ],
  mistakes:[`Moving code but leaving both systems writing the same tables.`, `No switch to go back for each route.`, `Moving the riskiest, most tangled part first.`],
  interview:[`Say the steps in order: front door, one slice, data in step, slow traffic shift, delete.`, `Say who owns the data in each phase.`],
  tryit:[
    {quiz:[{q:'What is the first step of a strangler fig migration?', options:['Rewrite everything', 'Delete the old portal', 'Put a routing layer in front of it', 'Freeze all features'], answer:2, why:'The routing layer lets you move one route at a time.'}, {q:'Why keep a switch back to the old route?', options:['Residents prefer the old look', 'The old code is always faster', 'It replaces testing', 'A problem on the new route can be undone quickly'], answer:3, why:'A fast way back makes each step safe to try.'}]},
    {note:'Order the migration of one route:', mount:host => orderGame(host, ['Put a routing layer in front of the old portal', 'Choose one route with clear edges', 'Build the new service and keep its data in step', 'Copy traffic and compare answers', 'Send 5% of real traffic with a way back', 'Raise to 100% and delete the old route'], '✓ All six steps in order. Once no traffic uses the old route, the city can delete it.')}
  ],
  sources:[`Fowler, StranglerFigApplication`, `Newman, Monolith to Microservices (2019)`, `Calçado, How we ended up with microservices (2015)`]
},
{
  id:'serverless', title:'Serverless and functions as a service', minutes:10, tags:['serverless','FaaS','Lambda','cold start','pay per use'],
  summary:'With serverless functions, you give the platform small pieces of code and it runs them when an event happens. It scales for you and bills by use. Watch for slow first starts and cost at steady high load.',
  problem:`<h3>A small example</h3><p>Residents upload photos of damage. Each photo must be shrunk to a small copy for the status page.</p><ul><li>At night: 20 uploads a minute</li><li>After a storm: 5,000 uploads a minute</li><li>Servers sized for the storm sit idle most days</li></ul><p>Can the app run the shrinking code only when a photo arrives?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one uploaded photo through a serverless function.</p>',
    steps:[
      {icon:'📤', title:'A photo arrives', text:'A resident uploads a photo. The file storage service announces that a new file arrived.'},
      {icon:'⚡', title:'The function starts', text:'That announcement starts the resize function. The platform finds a ready environment or starts a new one.'},
      {icon:'🥶', title:'Meet a cold start', text:'A new environment needs a moment to load the code. This first-start delay is called a cold start.'},
      {icon:'📈', title:'Scale with demand', text:'At 5,000 photos a minute, the platform runs many copies of the function at once. When uploads stop, the copies disappear.'},
      {icon:'💰', title:'Pay per use', text:'You pay for each run and the time it uses. Idle time costs nothing.'}
    ],
    mount:host => lambdaCost(host),
    html:`<h3>Everyday comparison</h3><p>Think of hiring a taxi compared with owning a city van.</p><div class="simple-table">${h.table(['Taxi or van', 'Serverless or servers'], [['Pay for each ride', 'Pay for each run.'], ['A taxi appears when called', 'A function starts when an event arrives.'], ['A van costs less if used all day', 'Always-on servers can cost less at steady high load.']])}</div><div class="callout tip"><b>Important point</b><p>Serverless still uses servers. The platform runs them, so you do not manage them.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Work', 'Better fit'], [['Photo resizing after uploads', 'Serverless function'], ['A nightly report', 'Serverless function'], ['A steady, busy service with strict speed needs', 'Always-on servers']])}</div>`,
    deep:`<h4>The numbers</h4><p>A storm sends 5,000 photos a minute. That is 5,000 ÷ 60 ≈ 83 each second. If one resize takes 0.2 seconds, about 83 × 0.2 ≈ 17 runs overlap. So the platform needs about 17 environments. Each is reused, so only 17 of the 5,000 runs, or 0.34%, pay a cold start.</p><p>At night, 20 uploads a minute is 20 × 0.2 = 4 busy seconds in every 60. One always-on server would be only about 4 ÷ 60 ≈ 7% busy.</p><h4>When it goes wrong</h4><p>Events can arrive twice, so a photo might be resized twice. Make the function safe to repeat. Save the small copy under a name made from the photo ID, so a second run just overwrites the first. You learned this idea as idempotency in Module 2.</p><h4>How it works inside</h4><p>Setup code outside the main function runs once for each environment. Open connections there, so later runs reuse them instead of paying for setup each time.</p>`
  },
  tradeoffs:{use:[`Use a function for photo resizing, because uploads are rare at night and heavy after a storm.`, `Use one for small jobs such as a nightly report or a payment webhook.`], avoid:[`Do not use functions for a steady, busy service with strict speed needs.`, `Do not split one job into dozens of tiny functions that pass big files around.`], alt:[`Run photo workers on always-on servers that scale with a waiting line of photos.`, `Use an edge function for tiny logic that must run close to residents.`]},
  real:[
    {co:'Amazon Prime Video', tier:'confirmed', text:'Prime Video wrote in 2023 that moving one monitoring service from serverless pieces to one program cut its infrastructure cost by over 90%. The workload was steady and busy.', src:'Prime Video Tech Blog (2023)'},
    {co:'AWS Lambda', tier:'confirmed', text:'Lambda bills per request and per GB-second. It supports runs of up to 15 minutes and offers provisioned concurrency to avoid cold starts.', src:'AWS Lambda documentation and pricing'}
  ],
  mistakes:[`Opening a new database connection in every function run.`, `Splitting one workflow into many tiny functions that pass large payloads.`, `No cap on runs, so one bug creates a runaway bill.`],
  interview:[`Use serverless for event-driven, spiky work and justify it with cost and less operations work.`, `Name cold starts and run limits, and explain where always-on servers cost less.`],
  tryit:{note:'Find the volume where always-on servers become cheaper in the calculator above.', quiz:[{q:'Which workload is the weakest fit for serverless functions?', options:['Resizing photos after upload', 'A steady API at 20,000 requests per second with a strict 30 ms p99', 'A nightly report job', 'A payment webhook receiver'], answer:1, why:'Steady high volume and strict speed favour always-on servers.'}, {q:'What is a cold start?', options:['A crash during upload', 'A limit on photo size', 'A function that costs nothing', 'A delay while the platform prepares a new environment'], answer:3, why:'The platform must load the code before the first run.'}], quizId:'arch-l6'},
  sources:[`AWS Lambda documentation and pricing`, `Prime Video Tech Blog (2023)`, `Jonas et al., Cloud Programming Simplified: A Berkeley View on Serverless Computing (2019)`]
},
{
  id:'docker-containers', title:'Containers and Docker', minutes:9, tags:['container','Docker','image','namespaces','cgroups','OCI'],
  summary:'A container packs an app and everything it needs into one image and runs it as an isolated process. It starts fast and runs the same on every machine.',
  problem:`<h3>A small example</h3><p>The Reports app works on a developer’s laptop. On the city server it crashes.</p><ul><li>The app needs one Python version and one image library.</li><li>The server has different versions.</li><li>A full virtual machine would fix it but takes minutes to start.</li></ul><p>How can the city ship the exact setup and start it in seconds?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the Reports app from a recipe file to a running container.</p>',
    steps:[
      {icon:'📝', title:'Write the recipe', text:'A file called a Dockerfile lists the base setup, the files to copy and the start command.'},
      {icon:'📦', title:'Build an image', text:'Docker turns the recipe into an image, a sealed package of the app and everything it needs.'},
      {icon:'🚚', title:'Share the image', text:'The image goes to a registry, a shared store. Any server can pull the same image.'},
      {icon:'▶️', title:'Run a container', text:'Starting the image makes a container, a running copy that sees only its own files and processes.'},
      {icon:'🗄️', title:'Keep data outside', text:'Changes inside a container disappear when it stops. Reports and photos belong in a database or file storage.'}
    ],
    stepper:{title:'Inside an image and a container', items:[
      {title:'Layers', tag:'saves time', text:'Each recipe step becomes a layer. Unchanged layers are reused, so put slow steps such as installing libraries before steps that change often, such as copying code.'},
      {title:'Namespaces', tag:'own view', text:'The system gives the container its own view of processes, network and files. It acts as if it runs alone.'},
      {title:'Control groups', tag:'limits', text:'These cap the CPU and memory a container may use. A container that uses too much memory is stopped.'},
      {title:'Writable layer', tag:'temporary', text:'A thin layer on top holds changes made while the container runs. It disappears when the container is removed.'}]},
    html:`<h3>Everyday comparison</h3><p>Think of lunch boxes compared with whole kitchens.</p><div class="simple-table">${h.table(['Meals', 'Computers'], [['A whole kitchen for each meal', 'A virtual machine is a full simulated computer with its own operating system.'], ['A sealed lunch box in a shared kitchen', 'A container holds the app and its files and shares the server’s core system.'], ['The lunch box tastes the same anywhere', 'An image runs the same on any server.']])}</div><div class="callout tip"><b>Important point</b><p>A container is not a small computer. It is an isolated process, so it starts fast.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Choice'], [['Run the Reports app the same way everywhere', 'A container image'], ['Run code from strangers', 'A virtual machine or a stronger sandbox'], ['Keep resident data safe', 'Store it outside the container']])}</div>`,
    deep:`<h4>How it works inside</h4><p>An image is a stack of read-only layers. Each Dockerfile step makes one layer. A running container adds a thin writable layer on top. That layer is lost when the container is removed.</p><h4>The numbers</h4><p>Say the base layer is 80 MB, the libraries layer is 150 MB and the app code layer is 5 MB. The image is 80 + 150 + 5 = 235 MB. If only the code changes, a server that already has the first two layers pulls just 5 MB. For 20 servers that is 20 × 5 = 100 MB, not 20 × 235 = 4,700 MB.</p><h4>When it goes wrong</h4><p>Deleting a secret in a later step does not remove it. The earlier layer still holds the file, and anyone with the image can read it. Pass secrets at run time instead. Also run the app as a normal user, not root, and set a memory limit. A container that goes over its limit is killed.</p><h4>In code</h4><p>This recipe builds in a full image and ships a small one. It installs the libraries before it copies the code, so a code change reuses the slow install step.</p>` + h.code('dockerfile', `# Build in a full image, ship a small one
FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]`, 'Dockerfile')
  },
  tradeoffs:{use:[`Use a container image so the Reports app runs the same on a laptop and on every city server.`, `Use containers to run many small apps on one server.`], avoid:[`Do not log into a running container to patch it.`, `Do not store resident reports inside a container.`], alt:[`Use a virtual machine when you need strong isolation.`, `Use serverless functions if you do not want to manage images.`]},
  real:[
    {co:'Docker', tier:'confirmed', text:'Docker popularised Linux containers in 2013 with a simple image format. That work became the base of the Open Container Initiative standards.', src:'Docker and OCI documentation'},
    {co:'AWS Firecracker', tier:'confirmed', text:'AWS built Firecracker micro virtual machines to run Lambda and Fargate with strong isolation and fast starts.', src:'Agache et al., Firecracker (NSDI 2020)'}
  ],
  mistakes:[`Putting secrets in a Dockerfile or image layer.`, `Using the “latest” tag in production, so deploys differ.`, `Building huge images that slow every deploy.`],
  interview:[`Explain image layers, namespaces and control groups in one sentence each.`, `Say that containers share a kernel, so they are lighter but less isolated than virtual machines.`],
  tryit:[
    {quiz:[{q:'Why install libraries before copying code in a Dockerfile?', options:['Libraries must come first alphabetically', 'Unchanged layers are reused, so rebuilds are faster', 'Code cannot run before libraries exist', 'Docker rejects the other order'], answer:1, why:'The slow install layer stays cached when only the code changes.'}, {q:'A container is removed. What happens to files written inside it?', options:['They disappear with it', 'They move to the registry', 'They stay for the next container', 'They are copied to the image'], answer:0, why:'The writable layer is temporary, so keep data in a database or file storage.'}]},
    {note:'Virtual machine or container?', mount:host => sortGame(host, [
      {t:'Shares the server’s kernel', c:'ct', why:'Containers are isolated processes.'},
      {t:'Boots its own guest operating system', c:'vm', why:'A virtual machine simulates a whole computer.'},
      {t:'Starts in about a second', c:'ct', why:'There is no operating system to boot.'},
      {t:'Stronger walls for code from strangers', c:'vm', why:'A hypervisor boundary is stronger than a container boundary.'},
      {t:'Built from layers that are reused', c:'ct', why:'Image layers are cached by content.'}
    ], [{id:'ct', label:'Container'}, {id:'vm', label:'Virtual machine'}])}
  ],
  sources:[`Docker documentation`, `Open Container Initiative specifications`, `Agache et al., Firecracker (NSDI 2020)`, `Linux manual pages for namespaces and cgroups`]
},
{
  id:'kubernetes-basics', title:'Kubernetes basics', minutes:12, tags:['Kubernetes','pod','deployment','service','reconciliation','control plane'],
  summary:'Kubernetes runs containers across many machines. You declare what you want, such as four copies, and it keeps working until reality matches.',
  problem:`<h3>A small example</h3><p>The city app has 40 services and 600 containers on 50 machines.</p><ul><li>One machine fails at 3 AM.</li><li>The status app must always have 4 copies.</li><li>A new version must roll out without downtime.</li></ul><p>Who restarts, moves and updates all of these containers?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the status app as Kubernetes keeps four copies running.</p>',
    steps:[
      {icon:'📋', title:'Declare the goal', text:'You send a file that says: run 4 copies of the status app. Kubernetes stores this as the desired state.'},
      {icon:'🔁', title:'Compare again and again', text:'A controller keeps counting the copies that really run. Each copy is called a pod, a small wrapper around one or more containers.'},
      {icon:'📍', title:'Place the pods', text:'The scheduler picks machines with enough free CPU and memory for each new pod.'},
      {icon:'🩺', title:'Check health', text:'A helper on each machine starts the containers and runs checks. A readiness check decides whether a pod gets traffic.'},
      {icon:'🔄', title:'Roll out safely', text:'For a new version, Kubernetes starts one new pod and waits until it is ready. Then it stops one old pod and repeats.'}
    ],
    mount:(host, api) => reconcileDemo(host, api),
    html:`<h3>Everyday comparison</h3><p>Think of a thermostat.</p><div class="simple-table">${h.table(['Thermostat', 'Kubernetes'], [['You set 24 °C', 'You declare 4 copies.'], ['It measures the room', 'It counts the running pods.'], ['It heats or cools until they match', 'It starts or stops pods until they match.']])}</div><div class="callout tip"><b>Important point</b><p>You describe the goal, not the steps. Kubernetes keeps correcting reality toward the goal, whatever caused the difference.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['What happens', 'What Kubernetes does'], [['A pod is deleted', 'It starts a replacement.'], ['A machine fails', 'It starts new pods on healthy machines.'], ['You change 4 copies to 6', 'It starts 2 more pods.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say each status pod asks for 250m of CPU, which is a quarter of a core, and a machine has 4 cores. By CPU alone, 4,000 ÷ 250 = 16 pods fit. In practice fewer fit, because the system keeps some room. If no machine has room, the new pod waits in the Pending state.</p><p>For a rolling update with maxUnavailable 0, say a new pod needs 20 seconds to become ready. Swapping 4 copies one at a time takes 4 × 20 = 80 seconds. You never have fewer than 4 ready pods.</p><h4>When it goes wrong</h4><p>When a machine dies, Kubernetes by default waits about 5 minutes before it removes the pods and starts new ones. It does this in case the machine returns. Spread the copies over different machines, so the others keep serving during that wait.</p><h4>How it works inside</h4><p>The two limits act differently. A container that goes over its memory limit is killed. One that wants more CPU than its limit is only slowed down.</p><h4>In code</h4><p>This Deployment and Service match the numbers above: 4 copies, resource requests and limits, a rolling update and both checks.</p>` + h.code('yaml', `apiVersion: apps/v1
kind: Deployment
metadata: { name: status-app }
spec:
  replicas: 4                       # desired state
  selector: { matchLabels: { app: status-app } }
  strategy: { rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } }
  template:
    metadata: { labels: { app: status-app } }
    spec:
      containers:
      - name: status-app
        image: registry.example/status-app@sha256:abc123   # pin by digest
        resources:
          requests: { cpu: "250m", memory: "256Mi" }   # used for placing
          limits:   { memory: "512Mi" }                # stopped above this
        readinessProbe: { httpGet: { path: /ready, port: 8080 } }
        livenessProbe:  { httpGet: { path: /live,  port: 8080 } }
---
apiVersion: v1
kind: Service
metadata: { name: status-app }
spec: { selector: { app: status-app }, ports: [{ port: 80, targetPort: 8080 }] }`, 'deployment.yaml')
  },
  tradeoffs:{use:[`Use Kubernetes when many teams run many services, like the 40 services of the city app.`, `Use it to keep 4 copies of the status app running without manual work.`], avoid:[`Do not use it for a handful of services run by a small team. A managed platform is simpler.`, `Do not run a database on it without the right tools and skills.`], alt:[`Use a managed container platform from your cloud provider.`, `Use serverless functions for small event-driven jobs.`]},
  real:[
    {co:'Google', tier:'confirmed', text:'Kubernetes grew from Borg, Google’s internal cluster manager. Google open-sourced Kubernetes in 2014.', src:'Verma et al., Borg (EuroSys 2015)'},
    {co:'CNCF', tier:'confirmed', text:'Kubernetes was the first project to graduate from the Cloud Native Computing Foundation, in 2018. Every major cloud offers it as a managed service.', src:'CNCF announcements'}
  ],
  mistakes:[`No readiness check, so traffic reaches pods that are still warming up.`, `A liveness check that fails under load and restarts healthy pods.`, `No resource requests, so machines are overpacked and pods get evicted.`],
  interview:[`Explain desired state and the reconcile loop in plain words.`, `Say when Kubernetes is too much for the job.`],
  tryit:{note:'Delete pods, fail a node and change the replica count in the demo above. Then check yourself.', quiz:[{q:'Which check decides whether a pod receives traffic?', options:['Liveness', 'Startup', 'Readiness', 'Scaling'], answer:2, why:'A failed readiness check removes the pod from the Service.'}, {q:'You delete one pod of a Deployment that wants 4 copies. What happens?', options:['It stays deleted', 'A replacement is created to get back to 4', 'The Deployment is deleted', 'All pods restart'], answer:1, why:'The controller sees 3 pods against a goal of 4 and starts one more.'}], quizId:'arch-l8'},
  sources:[`Kubernetes documentation`, `Verma et al., Borg (EuroSys 2015)`, `Burns et al., Borg, Omega and Kubernetes (ACM Queue 2016)`]
},
{
  id:'twelve-factor', title:'The twelve-factor app', minutes:9, tags:['12-factor','config','stateless','disposability','dev/prod parity'],
  summary:'The twelve-factor app is a checklist for services that deploy cleanly to cloud platforms. Keep settings outside the code, run stateless copies, treat databases as attachments and build once per release.',
  problem:`<h3>A small example</h3><p>Every deploy of the status app is an adventure.</p><ul><li>Settings are edited by hand on each server.</li><li>Logged-in sessions live in one server’s memory.</li><li>Logs sit in files that vanish with the server.</li><li>Staging uses a different database than production.</li></ul><p>Which habits would make deploys boring and safe?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one change from a developer’s commit to a running app.</p>',
    steps:[
      {icon:'📂', title:'One codebase', text:'One repository holds the app. A merge starts the build.'},
      {icon:'📦', title:'Build once', text:'The build makes one image tagged with the commit. It holds no settings for any environment.'},
      {icon:'⚙️', title:'Add settings at release', text:'A release is that exact image plus the settings for one environment. Each release has an ID, so a rollback means running the previous one.'},
      {icon:'🏃', title:'Run stateless copies', text:'The platform starts copies that keep nothing important inside. Sessions and photos live in a database or file storage.'},
      {icon:'🛑', title:'Stop gently', text:'On a stop signal, a copy finishes its current requests and exits. Logs go to standard output, where the platform collects them.'}
    ],
    stepper:{title:'Where all twelve factors show up', items:[
      {title:'Commit and build', tag:'I, II, V', text:'One repository and one lockfile of libraries feed the build. The build makes one image tagged with the commit ID.'},
      {title:'Release', tag:'III, V', text:'A release is the same image plus the settings for one environment. Settings come from the environment, never from code.'},
      {title:'Run', tag:'IV, VI, VII, VIII', text:'Stateless copies listen on a port. The database and file storage are attached services that you swap through settings. To serve more residents, run more copies.'},
      {title:'Stop gently', tag:'IX', text:'On a stop signal a copy finishes current requests and exits. Quick starts and stops make deploys and scaling safe.'},
      {title:'Keep environments alike', tag:'X', text:'Staging and production use the same kind of database and the same versions.'},
      {title:'Watch and maintain', tag:'XI, XII', text:'Logs flow to standard output as a stream. One-off jobs, such as a database change, run from the same release.'}]},
    html:`<h3>Everyday comparison</h3><p>Think of a franchise kitchen with many outlets.</p><div class="simple-table">${h.table(['Franchise kitchen', 'Twelve-factor app'], [['The same recipe book in every outlet', 'One codebase, many deploys.'], ['The supplier’s phone number on a card at each outlet', 'Settings kept outside the code.'], ['Any cook can start or leave at short notice', 'Disposable copies with no important state.']])}</div><div class="callout tip"><b>Important point</b><p>If a copy can stop at any moment without losing anything important, the app is ready for the cloud.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Bad habit', 'Fix'], [['Database password written in code', 'Move it to a setting or secret store.'], ['Sessions kept in one server’s memory', 'Keep them in a shared store.'], ['Logs written to a file', 'Write them to standard output.'], ['A different build for each environment', 'Build once and promote it.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say 8,000 residents are logged in and 4 copies keep sessions in memory. That is 8,000 ÷ 4 = 2,000 per copy. A deploy that restarts each copy once logs out all 8,000. With a shared session store, it logs out 0.</p><p>Say a copy serves 5 requests per second and each takes 2 seconds. When the stop signal comes, 5 × 2 = 10 requests are in progress. A gentle stop lets those 10 finish. A hard kill drops them.</p><h4>When it goes wrong</h4><p>The platform does not wait forever. Kubernetes, for example, waits 30 seconds by default after the stop signal and then kills the copy. Finish requests quickly, and give long jobs their own workers.</p><h4>How it works inside</h4><p>A rollback means running the previous release again. It works only if the old image is unchanged and its settings are saved too. Keep staging on the same kind of database as production. Otherwise some bugs show up only in production.</p>`
  },
  tradeoffs:{use:[`Use these habits for any service that runs in containers or on a cloud platform, such as the status app.`], avoid:[`Do not force every rule on a system that must keep data on a local disk, such as a database.`], alt:[`Use platform-specific habits that reach the same goals.`]},
  real:[
    {co:'Heroku', tier:'confirmed', text:'Adam Wiggins wrote the twelve-factor method in 2011 from experience running many apps on Heroku.', src:'Wiggins, The Twelve-Factor App (2011)'},
    {co:'Kubernetes', tier:'confirmed', text:'Kubernetes follows several factors directly. It injects settings, collects logs from standard output and sends a stop signal before it removes a copy.', src:'Kubernetes documentation'}
  ],
  mistakes:[`Building a different image for each environment.`, `Keeping important data in a copy’s memory.`, `Ignoring the stop signal, so deploys drop requests in progress.`],
  interview:[`Mention stateless copies, settings outside code, build once and gentle shutdown when you describe a service.`],
  tryit:[
    {quiz:[{q:'Where should logged-in sessions live?', options:['In one server’s memory', 'In a shared store outside the copies', 'In log files', 'In the image'], answer:1, why:'Any copy can then serve any resident, and a stop loses no sessions.'}, {q:'What should a copy do when it gets a stop signal?', options:['Ignore it', 'Delete its database', 'Finish current requests and exit', 'Restart at once'], answer:2, why:'Finishing requests keeps deploys from dropping work.'}]},
    {note:'Which factor does each bad habit break?', mount:host => sortGame(host, [
      {t:'Database password written in settings.py', c:'cfg', why:'III Config: inject it from the environment or a secret store.'},
      {t:'Sessions kept in one server’s memory', c:'proc', why:'VI Processes: keep state in a backing service.'},
      {t:'Production built from a different branch than staging', c:'build', why:'V Build, release, run: build once and promote it.'},
      {t:'App writes logs to a file inside the container', c:'logs', why:'XI Logs: write to standard output.'},
      {t:'SMS provider key committed to the repository', c:'cfg', why:'III Config, and also a security problem.'},
      {t:'Uploaded photos saved on one server’s disk', c:'proc', why:'VI Processes: use file storage outside the copy.'}
    ], [{id:'cfg', label:'III Config'}, {id:'proc', label:'VI Processes'}, {id:'build', label:'V Build, release, run'}, {id:'logs', label:'XI Logs'}])}
  ],
  sources:[`Wiggins, The Twelve-Factor App (2011)`, `Kubernetes documentation`]
},
{
  id:'multi-tenancy', title:'Multi-tenancy', minutes:10, tags:['multi-tenancy','tenant isolation','silo','pool','noisy neighbour','row-level security'],
  summary:'A multi-tenant app serves many customers from shared infrastructure. Each layer can be shared, separate or mixed, and the app must keep tenants apart in data, speed and failures.',
  problem:`<h3>A small example</h3><p>The maintenance app is sold to 3,000 small towns and 5 large cities. Each one is a tenant, a customer with its own data.</p><ul><li>A separate stack for every tenant costs too much.</li><li>One missing tenant filter could show one town’s reports to another.</li><li>A big city’s month-end export could slow everyone.</li></ul><p>How can tenants share the app and still stay apart?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one request from a resident of Town A.</p>',
    steps:[
      {icon:'🏘️', title:'Choose a model per layer', text:'Compute, database and storage can each be shared, separate or mixed. Shared is cheaper and separate is safer.'},
      {icon:'🪪', title:'Find the tenant once', text:'At the entry point, the app checks the login and finds the tenant. It passes the tenant ID along and never trusts one typed by a user.'},
      {icon:'🔒', title:'Filter data by tenant', text:'Every row carries a tenant ID. The data layer and the database both enforce it, so one forgotten filter cannot leak data.'},
      {icon:'⚖️', title:'Limit each tenant', text:'Each tenant gets limits for requests and for big jobs. A heavy export cannot starve the others.'},
      {icon:'📊', title:'Watch each tenant', text:'Track use and cost per tenant. If a city outgrows the shared setup, move it to its own.'}
    ],
    mount:host => tenancyCompare(host),
    html:`<h3>Everyday comparison</h3><p>Think of housing.</p><div class="simple-table">${h.table(['Housing', 'Tenancy model'], [['A villa for each family', 'Silo: each tenant has its own stack.'], ['An apartment block with shared lifts and water', 'Pool: tenants share everything.'], ['An apartment block with a few villas', 'Bridge: most tenants share and a few get their own.']])}</div><div class="callout tip"><b>Important point</b><p>Every request must carry a tenant ID that the system has verified. Never trust a tenant ID typed by the user.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Tenant', 'Model'], [['Many small towns', 'Pool, with row protection and limits'], ['A few big cities with strict rules', 'Silo for their data'], ['A mix of both', 'Bridge']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the shared app handles 1,000 requests per second. Cap each small town at 5 per second and each big city at 100. If all 5 cities hit their cap, they use 5 × 100 = 500. That leaves 1,000 − 500 = 500 for the 3,000 towns. No tenant can take the whole system.</p><h4>When it goes wrong</h4><p>Side doors skip the filter. A cache key such as report:7 is shared by every tenant, so put the tenant in it, like tenant42:report:7. A background job that holds only a record ID runs with no tenant context, so queue the tenant ID with it. The same goes for search indexes and exports.</p><h4>How it works inside</h4><p>With PostgreSQL row-level security, set the tenant inside a transaction using SET LOCAL. Then it cannot leak to the next request that reuses the same connection. Table owners skip these rules unless you force them.</p><h4>In code</h4><p>This policy makes the database itself hide other tenants’ rows.</p>` + h.code('sql', `ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reports
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- The app sets the tenant from the verified login:
SET LOCAL app.tenant_id = '6f1c0000-0000-0000-0000-000000000001';
SELECT * FROM reports WHERE status = 'open';  -- only this tenant's rows`, 'row-level security')
  },
  tradeoffs:{use:[`Pool the 3,000 small towns by default and give each big city its own data silo.`, `Verify the tenant ID at the entry point and pass it along.`], avoid:[`Do not rely on developers remembering a tenant filter in every query.`, `Do not pool tenants with very different rules or load without tiers.`], alt:[`Give each of the 5 big cities a fully separate deployment.`, `Group tenants into cells, so a failure hits only one cell.`]},
  real:[
    {co:'Salesforce', tier:'confirmed', text:'Salesforce stores many customers’ data in shared databases with an organisation ID on every row. It uses metadata to give each customer its own customisations.', src:'Salesforce, The Force.com Multitenant Architecture whitepaper'},
    {co:'AWS', tier:'confirmed', text:'AWS describes silo, pool and bridge isolation models in its SaaS guidance.', src:'AWS Well-Architected SaaS Lens'}
  ],
  mistakes:[`Trusting a tenant ID sent by the client.`, `Running one tenant’s export on the shared pool that serves everyone.`, `Having no per-tenant numbers, so nobody can see who causes load or cost.`],
  interview:[`State the model for each layer and how the tenant ID is enforced.`, `Handle noisy neighbours with limits and separate workers.`],
  tryit:{note:'Compare the models above as the tenant count grows. Then check yourself.', quiz:[{q:'Where is the safest place to enforce “Town A never sees Town B’s rows” in a pooled database?', options:['In each developer’s queries', 'In the app screen', 'In a code review checklist', 'In the data layer and the database, using a tenant ID from the verified login'], answer:3, why:'Central enforcement does not depend on every developer remembering.'}, {q:'Which model suits a big city that needs its own region and keys?', options:['A silo for its data', 'A pool with shared rows', 'A pool with no limits', 'A shared password'], answer:0, why:'A silo gives separate storage, keys and location for that tenant.'}], quizId:'arch-l10'},
  sources:[`AWS Well-Architected SaaS Lens`, `AWS, SaaS Tenant Isolation Strategies`, `Salesforce multitenant architecture whitepaper`, `PostgreSQL documentation, Row Security Policies`]
},
{
  id:'hexagonal', title:'Hexagonal architecture (ports and adapters)', minutes:9, tags:['hexagonal','ports and adapters','clean architecture','dependency inversion','testability'],
  summary:'Hexagonal architecture keeps business rules in the centre with no knowledge of databases or vendors. The core talks through ports, and adapters at the edges connect those ports to real tools.',
  problem:`<h3>A small example</h3><p>The code that assigns a crew is tangled with web code, raw database queries and one SMS vendor’s tools.</p><ul><li>Testing one assignment rule needs a real database.</li><li>Changing SMS vendors means editing business code in 30 places.</li><li>Reading reports from a waiting line instead of the web means a rewrite.</li></ul><p>How can the rules stay clean while the tools around them change?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one “assign crew” action through the core and its edges.</p>',
    steps:[
      {icon:'❤️', title:'Keep rules in the core', text:'The core holds the crew rules, such as picking the nearest free crew. It imports no web, database or vendor code.'},
      {icon:'🔌', title:'Define ports', text:'A port is a plain interface the core needs, such as CrewRepository or Notifier. The core says what it needs, not how it is done.'},
      {icon:'🧩', title:'Write adapters', text:'An adapter plugs into a port. A database adapter saves crews, and an SMS adapter sends texts.'},
      {icon:'🚪', title:'Add entry points', text:'A web handler or a queue reader calls the core. Both reach the same rules.'},
      {icon:'🧪', title:'Swap and test', text:'Tests plug in fake adapters that work in memory. To change SMS vendor, write one new adapter.'}
    ],
    diagram:{title:'Ports and adapters around the dispatch core', w:800, h:260, alt:'A web adapter and a queue reader drive the dispatch core. It uses crew, route and notice ports implemented by database, map and SMS adapters.',
      nodes:[{id:'http', type:'client', label:'Web adapter', x:90, y:80, w:130}, {id:'q', type:'queue', label:'Queue reader', x:90, y:190, w:130}, {id:'core', type:'service', label:'Dispatch core', sub:'AssignCrew use case', x:400, y:135, w:170}, {id:'pg', type:'db', label:'Database adapter', sub:'CrewRepository', x:690, y:50, w:160}, {id:'map', type:'ext', label:'Map adapter', sub:'RouteFinder', x:690, y:135, w:160}, {id:'sms', type:'ext', label:'SMS adapter', sub:'Notifier', x:690, y:220, w:160}],
      edges:[{from:'http', to:'core'}, {from:'q', to:'core'}, {from:'core', to:'pg'}, {from:'core', to:'map'}, {from:'core', to:'sms'}],
      steps:[
        {note:'A <b>driving adapter</b> (the web) turns a request into a call on the AssignCrew use case.', flow:[['http', 'core', 'assignCrew(cmd)']]},
        {note:'The core applies the rules and calls its <b>ports</b>. It does not know they are a database, a map service and an SMS vendor.', flow:[['core', 'pg', 'save'], ['core', 'map', 'route'], ['core', 'sms', 'notify']], parallel:true},
        {note:'Same core, new entry point: a queue reader calls the same use case. No rules change.', flow:[['q', 'core', 'assignCrew(cmd)']], hl:['q']}
      ]},
    html:`<h3>Everyday comparison</h3><p>Think of a laptop with USB-C ports.</p><div class="simple-table">${h.table(['Laptop', 'Hexagonal app'], [['USB-C ports', 'Ports are the interfaces the core offers and needs.'], ['A monitor or charger plugs in', 'An adapter plugs in.'], ['Swap the monitor, not the laptop', 'Swap an adapter, not the rules.']])}</div><div class="callout tip"><b>Important point</b><p>Dependencies point inward. Adapters know about the core, but the core never knows about adapters.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Change', 'What changes'], [['A new SMS vendor', 'One SMS adapter'], ['A new entry point from a queue', 'One new driving adapter'], ['A new crew rule', 'Only the core']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say you have 1,000 tests for crew rules. With in-memory fakes, each takes about 1 ms, so the suite takes about 1 second. If each test needs a real database at, say, 50 ms, it takes 1,000 × 50 = 50,000 ms, about 50 seconds. Fast tests get run often.</p><h4>When it goes wrong</h4><p>The core cannot make a database save and an SMS send succeed together. If the job is saved and the text fails, the resident hears nothing. Save first, then send, and retry the text later. For steps across services, you will learn sagas in Module 6.</p><h4>How it works inside</h4><p>There are two kinds of adapters. A driving adapter calls the core, such as a web handler or a queue reader. A driven adapter is called by the core, such as the database or SMS adapter. Shape each port around what the core needs, not around a vendor’s tools. A port named sendViaVendorX leaks that vendor into the core.</p><h4>In code</h4><p>This is the core use case with its two ports, and the adapters kept at the edge.</p>` + h.code('ts', `// Ports, owned by the core
export interface CrewRepository { freeCrews(area: string): Promise<Crew[]>; save(job: Job): Promise<void>; }
export interface Notifier { send(resident: string, text: string): Promise<void>; }

// Core use case
export class AssignCrew {
  constructor(private crews: CrewRepository, private notify: Notifier) {}
  async run(cmd: { jobId: string; area: string; resident: string }) {
    const crew = pickNearest(await this.crews.freeCrews(cmd.area));   // city rule
    const job = Job.assign(cmd.jobId, crew);
    await this.crews.save(job);
    await this.notify.send(cmd.resident, 'Crew ' + crew.name + ' will visit.');
    return job;
  }
}

// Adapters at the edges, swapped freely
class SmsVendorNotifier implements Notifier { /* vendor tool calls */ }
class FakeNotifier implements Notifier { async send() {} }   // used in tests`, 'ports-and-adapters.ts')
  },
  tradeoffs:{use:[`Use ports and adapters for crew assignment, where the rules are rich and the SMS vendor may change.`, `Use them when code must outlive today’s web framework.`], avoid:[`Do not use them for a thin screen that only copies data between a form and a table.`, `Do not let database entities leak into the core.`], alt:[`Use a simple layered design for small services.`, `Use plain scripts for trivial logic.`]},
  real:[
    {co:'Alistair Cockburn', tier:'confirmed', text:'Cockburn described the pattern in 2005 so an app could be driven equally by users, programs, tests and batch scripts.', src:'Cockburn, Hexagonal Architecture (2005)'},
    {co:'Netflix', tier:'confirmed', text:'A Netflix studio engineering team wrote that hexagonal architecture let it swap data sources without changing business logic.', src:'Netflix Tech Blog, Ready for changes with Hexagonal Architecture (2020)'}
  ],
  mistakes:[`Shaping a port like the vendor’s tools instead of the city’s needs.`, `Letting core code import a framework type “just once”.`, `Adding an interface for everything, even where only one version will exist and no test needs a fake.`],
  interview:[`When asked about vendor lock-in or change, explain ports, adapters and the inward rule.`],
  tryit:{quiz:[{q:'In hexagonal architecture, which way do dependencies point?', options:['Core to database', 'Core to framework', 'Adapters to core', 'Both ways'], answer:2, why:'The core defines the ports. Adapters implement or call them.'}, {q:'The city switches SMS vendors. What changes?', options:['The crew rules', 'All web handlers', 'The database design', 'Only the SMS adapter and its wiring'], answer:3, why:'That is the point of ports.'}], quizId:'arch-l11'},
  sources:[`Cockburn, Hexagonal Architecture (2005)`, `Netflix Tech Blog (2020)`, `Martin, Clean Architecture (2017)`]
},
{
  id:'config-feature-flags', title:'Configuration management and feature flags', minutes:11, tags:['configuration','feature flags','kill switch','progressive delivery','dark launch'],
  summary:'Treat settings like code. Store them in version control, review them and roll them out in steps. Feature flags separate deploying code from releasing it, and a kill switch turns a feature off at once.',
  problem:`<h3>A small example</h3><p>The new report form is ready. Releasing it to every resident at once is risky.</p><ul><li>A bug would affect everyone.</li><li>Rolling back would need another deploy.</li><li>A one-line settings change pushed to every server at once can break the site too.</li></ul><p>How can the city release the form slowly and switch it off instantly?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the new report form as it reaches residents step by step.</p>',
    steps:[
      {icon:'📝', title:'Treat settings as code', text:'Keep settings in version control. Review them, check them with tests and roll them out in steps.'},
      {icon:'🚩', title:'Wrap the feature in a flag', text:'The new form sits behind an on or off switch. The app checks the switch on each request.'},
      {icon:'🎚️', title:'Release in steps', text:'Turn the flag on for staff first, then for 1%, 10%, 50% and 100% of residents. Watch errors after each step.'},
      {icon:'🧮', title:'Keep residents steady', text:'A resident’s bucket comes from a hash of the flag name and the resident. Raising the percentage only adds residents, so nobody flips back and forth.'},
      {icon:'🛑', title:'Keep a kill switch', text:'If the form misbehaves, switch the flag off for everyone at once with no deploy. Delete the flag when the rollout is done.'}
    ],
    mount:host => flagDemo(host),
    html:`<h3>Everyday comparison</h3><p>Think of light switches wired in during construction.</p><div class="simple-table">${h.table(['The building', 'The app'], [['Switches are wired in while building', 'Code is deployed with the flag off.'], ['Turn lights on room by room', 'Release to a few residents first.'], ['The main panel can cut a switch at once', 'A kill switch turns the feature off.']])}</div><div class="callout tip"><b>Important point</b><p>Deploying code and releasing a feature are different steps. A flag lets you do them separately.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Situation', 'Action'], [['The new form is ready', 'Deploy it with the flag off.'], ['Errors rise at 10%', 'Turn the flag off.'], ['The rollout stays healthy at 100%', 'Delete the flag and the old code path.'], ['A settings change is ready', 'Roll it out to a few servers first.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say 10,000 residents use the app. At 1%, 100 see the new form. At 10% it is 1,000, and at 50% it is 5,000. A small first step still needs enough people. Suppose a bug hits 2% of users. The chance that at least one of 100 residents hits it is 1 − 0.98¹⁰⁰ ≈ 87%. With 1,000 residents it is almost 100%.</p><h4>When it goes wrong</h4><p>Servers usually keep flag values in memory and refresh them, say every 30 seconds. So a kill switch may take up to 30 seconds to reach every server. If the flag service is down, the app must fall back to safe default values.</p><h4>How it works inside</h4><p>Each flag doubles the paths to test. With 3 flags there are 2 × 2 × 2 = 8 combinations. With 10 flags there are 1,024. Give each flag an owner and an end date. Release flags should die within weeks. Only kill switches should live for years.</p>`
  },
  tradeoffs:{use:[`Use a flag to release the new report form to 5% of residents first.`, `Use a kill switch for optional features and heavy dependencies.`], avoid:[`Do not leave release flags in the code for years.`, `Do not push a settings change to every server at once.`], alt:[`Release by deployment, with a canary copy that gets a small share of traffic.`, `Keep the feature on a branch, which gives slower feedback and harder merges.`]},
  real:[
    {co:'Cloudflare', tier:'confirmed', text:'In July 2019, a new firewall rule was deployed everywhere at once and pushed CPU use to 100% across its network for about 30 minutes. Cloudflare then changed how it rolls out such rules.', src:'Cloudflare blog, Details of the Cloudflare outage on July 2, 2019'},
    {co:'Knight Capital', tier:'confirmed', text:'A deployment missed one server, and an old flag was reused for a new meaning. Old trading code woke up and the firm lost hundreds of millions of dollars in about 45 minutes.', src:'U.S. SEC order against Knight Capital Americas (2013)'}
  ],
  mistakes:[`Reusing an old flag name for a new meaning.`, `Pushing a settings change everywhere at once with no test run on a few servers.`, `Random bucketing, so residents flip between the old and new form.`],
  interview:[`Separate deploy from release with flags, and describe a staged rollout with a kill switch.`, `Treat settings changes with the same care as code changes.`],
  tryit:{note:'Raise the percentage above and see that residents are only ever added. Then check yourself.', quiz:[{q:'Why bucket with hash(flag + residentId) instead of hash(residentId)?', options:['It is faster', 'Each flag picks a different sample of residents', 'It hides the resident ID', 'There is no reason'], answer:1, why:'Adding the flag name gives each flag its own sample, so the same early residents are not in every test.'}, {q:'What does a kill switch do?', options:['Deploys a new version', 'Deletes the feature code', 'Turns a feature off for everyone at once', 'Slows the rollout'], answer:2, why:'It is the fastest rollback because it needs no deploy.'}], quizId:'arch-l12'},
  sources:[`Tang et al., Holistic Configuration Management at Facebook (SOSP 2015)`, `Pete Hodgson, Feature Toggles (2017)`, `Cloudflare outage report (2019)`, `SEC Knight Capital order (2013)`, `Google SRE book`]
}
];

SDA.register({
  kind:'module', id:'architecture', order:10, level:'realworld', icon:'🏛️', title:'Architecture & Platform',
  summary:'DDD and bounded contexts; service discovery, service mesh and sidecars; API composition; strangler-fig migration; serverless, containers and Kubernetes; twelve-factor apps; multi-tenancy; hexagonal architecture; configuration and feature flags.',
  outcomes:['Draw service and team boundaries from bounded contexts', 'Choose discovery, mesh and composition approaches and explain their costs', 'Plan an incremental strangler-fig migration with safe traffic shifting', 'Pick between serverless, containers and Kubernetes for a workload', 'Design tenant isolation, ports-and-adapters cores and safe config/flag rollouts'],
  lessons,
  quiz:[
    {q:'In DDD, a bounded context is…', options:['A database table', 'A microservice by definition', 'A boundary where a model and its words have one clear meaning', 'A page in the app'], answer:2, why:'Inside the boundary, each word means one thing.'},
    {q:'Client-side service discovery means…', options:['DNS only', 'The caller looks up copies in a registry and picks one itself', 'A hardware load balancer', 'Fixed addresses'], answer:1, why:'The caller keeps the list and chooses a copy.'},
    {q:'What does a service mesh control plane do?', options:['Runs city business rules', 'Stores resident data', 'Compiles code', 'Sends rules, certificates and the list of copies to the sidecars'], answer:3, why:'The sidecars form the data plane and carry the traffic.'},
    {q:'A status page calls 8 services in parallel. Its time is about…', options:['The slowest call', 'The average of the 8', 'The fastest call', 'The sum of all 8'], answer:0, why:'A parallel page waits for its slowest call.'},
    {q:'What is the first step of a strangler fig migration?', options:['Rewrite everything', 'Put a routing layer in front of the old system', 'Delete the old portal', 'Freeze features for a year'], answer:1, why:'The routing layer lets you move one route at a time.'},
    {q:'Which work fits serverless functions best?', options:['A steady, busy API all day', 'A 6-hour job in one run', 'A stateful game server', 'Photo resizing after uploads'], answer:3, why:'Uploads are bursty, and you pay only when a function runs.'},
    {q:'Containers keep processes apart using…', options:['A hypervisor', 'Separate kernels', 'Namespaces and control groups', 'Firewalls only'], answer:2, why:'Namespaces control what a container sees. Control groups limit what it uses.'},
    {q:'Kubernetes controllers work by…', options:['Running a script once', 'Comparing real state with declared state again and again', 'Asking residents for approval', 'Waiting for a manual command'], answer:1, why:'They keep correcting reality toward the goal.'},
    {q:'Where does twelve-factor say sessions should live?', options:['In log files', 'In the image', 'In one copy’s memory', 'In a shared store outside the copies'], answer:3, why:'Copies must be disposable, so they keep nothing important inside.'},
    {q:'Which tenancy model gives the strongest isolation and the highest cost per tenant?', options:['Pool', 'Bridge', 'Silo', 'Shared tables'], answer:2, why:'Each tenant gets its own resources.'},
    {q:'In a hexagonal app, switching SMS vendors changes…', options:['The crew rules', 'One adapter and its wiring', 'Every web handler', 'The core tests'], answer:1, why:'Ports keep vendor details outside the core.'},
    {q:'A feature flag lets you…', options:['Skip testing', 'Avoid code review', 'Encrypt data', 'Deploy code without releasing it, and switch it off at once'], answer:3, why:'It separates deploy from release.'},
    {type:'scenario', q:'The city’s 10-year-old maintenance portal is one big program with one database. It must become independent services without stopping feature work. Plan it.', answer:'<ol><li><b>Map the bounded contexts</b> (Reports, Dispatch, Contractors, Billing, Status) and who owns each. Split the program into clear modules first.</li><li><b>Add a routing layer</b> in front of the portal. At first it sends everything to the old code.</li><li><b>Pick a first slice</b> with clear edges and mostly reads, such as the status page. Keep its data in step with the old database.</li><li><b>Copy traffic and compare answers.</b> Then send 1%, 25% and 100% to the new route, with a switch back for each route.</li><li><b>Name one owner for each record</b> at each stage. Avoid having both systems write the same data.</li><li><b>Delete the old route</b> once nothing uses it, then repeat with the next route.</li><li>Run the new services as containers. Add service discovery, timeouts and partial responses in the composer as the number of services grows.</li></ol>'},
    {type:'scenario', q:'Design tenant isolation for a maintenance app with 5,000 small towns and 10 big cities. The big cities need their data kept in their own country and encrypted with their own keys.', answer:'<ul><li><b>Use the bridge model.</b> Pool the small towns on shared services and a shared database. Give each big city its own database in its own country, with its own encryption keys.</li><li><b>Find the tenant once</b> at the entry point from the verified login token. Pass the tenant ID along and never accept one typed by a user.</li><li><b>Filter in two places.</b> The data layer adds the tenant filter, and database row-level security enforces it too.</li><li><b>Limit each tenant.</b> Give each one request limits and a cap on big jobs. Run exports on separate workers so one city cannot slow the rest.</li><li><b>Track use and cost per tenant.</b> Move a town to its own stack if it grows past the shared setup.</li></ul>'}
  ],
  cheatsheet:[
    {h:'🧭 DDD', items:['One shared language inside each context', 'A bounded context is a model boundary and a good team boundary', 'An aggregate is a unit that changes together, keep it small', 'Contexts share small notices and translate outside data at the edge', 'Start with a modular program, split later']},
    {h:'🔎 Discovery and mesh', items:['Register, send heartbeats, remove the dead', 'Client-side, server-side or DNS-based lookup', 'Remove a copy from the list before stopping it', 'Mesh: sidecars carry traffic, the control plane sends rules', 'mTLS, retries and traffic splits without app code']},
    {h:'🧩 Composition and migration', items:['Call independent services in parallel with a timeout each', 'Return partial responses for optional data', 'More calls on a page make slow answers more likely', 'Strangler fig: front door, slice, data in step, slow shift, delete', 'Name one owner for each record at each phase']},
    {h:'☁️ Compute choices', items:['Serverless: bursty work, pay per run, cold starts, run limits', 'Container: image layers, namespaces and control groups', 'Kubernetes: declare the goal and let controllers match it', 'Readiness decides traffic and liveness decides restarts', 'A managed platform fits small teams']},
    {h:'🏢 Apps for many customers', items:['Twelve-factor: settings outside code, stateless copies, logs to standard output, build once', 'Tenancy: silo, pool or bridge for each layer', 'Take the tenant from the verified login and enforce it in the database', 'Hexagonal: rules in the core, adapters at the edges, dependencies point inward']},
    {h:'🚩 Settings and flags', items:['Settings are code: review, test and roll out in steps', 'Roughly 70% of outages come from changes (Google SRE)', 'Flag kinds: release, ops or kill switch, experiment, permission', 'Bucket = hash of flag and resident, mod 100', 'Delete flags after the rollout']}
  ],
  glossary:[
    {term:'Domain-driven design', aka:['DDD'], def:'Designing software around the real business, using the business’s own words and boundaries. Example: the city app has parts for Reports, Dispatch and Billing, just like the city departments.'},
    {term:'Bounded context', aka:['bounded contexts'], def:'A boundary inside which each word has one clear meaning. Example: “request” means a report to the Reports team and a paid job to Billing.'},
    {term:'Ubiquitous language', def:'The shared words that business experts and developers both use, including in the code. Example: everyone says “work order” for the same thing, and nobody switches to “ticket” or “job”.'},
    {term:'Aggregate (DDD)', aka:['an aggregate', 'aggregate root'], def:'A group of records that change together in one step, with one main record in charge. Example: a Report and its photo list are saved as one unit.'},
    {term:'Context map', def:'A drawing that shows the bounded contexts and how they talk to each other. Example: Reports sends notices to Dispatch and Status.'},
    {term:'Anti-corruption layer', aka:['ACL', 'translation layer'], def:'A translation layer that stops an outside system’s odd names from leaking into your own model. Example: a contractor system’s field “wo_stat” is translated to “status”.'},
    {term:'Service discovery', def:'Finding the current address of a healthy copy of a service. Example: Dispatch asks where a live Crew Location copy is.'},
    {term:'Service registry', aka:['registry'], def:'A list of the service copies that are running, kept up to date by sign-ins and health checks, like a duty board at a depot. Example: Crew Location copies register here when they start.'},
    {term:'Eureka', def:'Netflix’s open-source service registry. Example: services register with it and look each other up.'},
    {term:'Consul', def:'HashiCorp’s tool for service discovery, health checks and settings. Example: it keeps the list of live copies and answers lookups.'},
    {term:'Service mesh', def:'A layer of helper proxies that handles how services talk to each other: security, retries and call timing. Example: every call between the 30 services is secured and timed the same way.'},
    {term:'Sidecar', aka:['sidecar proxy', 'sidecars'], def:'A helper program that runs next to an app copy and shares its network. Example: a proxy that handles the security of every call the app makes.'},
    {term:'Data plane', def:'The part that carries the real traffic, such as the sidecar proxies. Example: every call passes through two proxies.'},
    {term:'Control plane', def:'The part that sends settings to the data plane. Example: it tells every sidecar which certificates and retry rules to use.'},
    {term:'Envoy', def:'A fast open-source proxy built at Lyft, used in many meshes and gateways. Example: the sidecar next to each service copy.'},
    {term:'Istio', def:'A service mesh that manages Envoy proxies for security, traffic rules and call timing. Example: send 5% of calls to a new version.'},
    {term:'API composition', aka:['API aggregation'], def:'Building one response by calling several services and merging their answers. Example: the status page combines report, crew, work, photo and map data.'},
    {term:'GraphQL federation', def:'Building one GraphQL schema from parts that different teams own. Example: the Reports team and the Dispatch team each own their part of one shared graph.'},
    {term:'Partial response', def:'An answer that returns what is available and says which parts failed, instead of failing completely. Example: the status page shows everything except a note “photos unavailable”.'},
    {term:'Shadow traffic', aka:['traffic shadowing', 'mirroring'], def:'Sending a copy of real requests to a new system and ignoring its answers, to compare behaviour. Example: the new status service gets copies of live requests, but residents only see the old service’s answers.'},
    {term:'Serverless', def:'A way to run code where the provider manages the servers and scaling, and you pay per use. Example: photos are resized only when one is uploaded.'},
    {term:'Function as a Service', aka:['FaaS', 'functions as a service', 'serverless functions'], def:'Running small functions that are triggered by events and billed per run and run time. Example: a resize function starts when a photo arrives.'},
    {term:'AWS Lambda', aka:['Lambda function'], def:'Amazon’s function-as-a-service product. Example: the resize function runs on Lambda.'},
    {term:'Cold start', aka:['cold starts', 'cold-start latency', 'serverless cold start'], def:'A slow first moment because nothing is ready yet. For a serverless function, it is the delay while a new environment starts. For a recommender, it is having no history for a new user or item. Example: the first photo after a quiet night waits a moment longer.'},
    {term:'Provisioned concurrency', def:'A paid option that keeps some function environments ready, so they avoid cold starts. Example: keep 10 resize environments warm before a storm.'},
    {term:'Container', aka:['containers'], def:'An isolated process with its own view of files and its own limits, sharing the server’s core system. Example: the Reports app runs in its own container.'},
    {term:'Docker', def:'A tool for building and running containers from images. Example: one command starts the Reports app in a container.'},
    {term:'Container image', aka:['OCI image', 'Docker image'], def:'A sealed, layered package of an app and everything it needs. Example: the Reports image runs the same on a laptop and on a server.'},
    {term:'Linux namespaces', aka:['namespaces'], def:'A Linux feature that gives a process its own view of processes, network and files. Example: a container acts as if it is the only thing running.'},
    {term:'cgroups', aka:['control groups'], def:'A Linux feature that limits how much CPU and memory a group of processes may use. Example: a container is capped at 512 MB of memory.'},
    {term:'Kubernetes', aka:['K8s'], def:'A system that runs containers across many machines and keeps them in the state you declare. Example: keep 4 copies of the status app running.'},
    {term:'Pod', aka:['pods'], def:'The smallest unit Kubernetes runs: one or more containers that share a network. Example: one pod runs one copy of the status app.'},
    {term:'Kubernetes Deployment', def:'A Kubernetes object that keeps a set of identical pods running and handles rolling updates. Example: “run 4 pods of the status app”.'},
    {term:'Kubernetes Service', def:'A stable name and address for a group of pods. Example: other apps call “status-app” and Kubernetes picks a ready pod.'},
    {term:'Reconciliation loop', aka:['reconcile loop', 'control loop'], def:'A loop that keeps comparing the real state with the wanted state and fixes the difference. Example: a pod is deleted, and the loop starts a replacement.'},
    {term:'etcd', def:'A small, very reliable database that stores Kubernetes’ cluster state. Example: it remembers that 4 copies of the status app should run.'},
    {term:'Twelve-factor app', aka:['12-factor', 'twelve-factor'], def:'A checklist of 12 habits for building apps that deploy cleanly to the cloud. Example: keep settings outside the code and keep nothing important inside a copy.'},
    {term:'Multi-tenancy', aka:['multi-tenant'], def:'Serving many customers from the same software and infrastructure. Example: 3,000 towns use one maintenance app.'},
    {term:'Tenant', aka:['tenants'], def:'One customer of a shared app, with its own data. Example: a town or a city using the maintenance app.'},
    {term:'Tenant isolation', def:'Making sure one tenant cannot see another’s data or slow it down. Example: Town A never sees Town B’s reports.'},
    {term:'Silo, pool and bridge', aka:['silo', 'pool model', 'bridge model'], def:'Three tenancy models. Silo gives each tenant separate resources. Pool shares resources among all tenants. Bridge mixes both. Example: small towns share a pool, and big cities get silos.'},
    {term:'Noisy neighbour', aka:['noisy neighbor', 'noisy neighbours', 'noisy neighbors'], def:'A tenant or job that uses so much shared capacity that others slow down. Example: one city’s huge month-end export slows everyone.'},
    {term:'Row-level security', aka:['RLS'], def:'A database rule that limits which rows each session can read or change. Example: a query from Town A can only see Town A’s rows.'},
    {term:'Hexagonal architecture', aka:['ports and adapters'], def:'Putting the business rules in the centre, with plain interfaces (ports) and plug-in parts (adapters) at the edges. Example: change the SMS vendor by writing one new adapter.'},
    {term:'Clean architecture', def:'A design where dependencies point inward, toward the business rules. Example: the database code depends on the rules, never the other way round.'},
    {term:'Feature flag', aka:['feature flags', 'feature toggle', 'flag', 'flags'], def:'A switch that turns a feature on or off without deploying new code. Example: show the new report form to 5% of residents.'},
    {term:'Kill switch', def:'A flag that turns a feature off for everyone at once. Example: switch the new form off instantly if it misbehaves.'},
    {term:'Progressive delivery', aka:['staged rollout', 'staged rollouts', 'staged release', 'staged releases'], def:'Releasing a change to more and more users in steps, watching the results and rolling back if needed. Example: 1%, then 10%, then 50%, then everyone.'},
    {term:'Configuration as code', aka:['config as code', 'settings as code', 'settings like code'], def:'Keeping settings in version control, with review, tests and step-by-step rollout. Example: a settings change is reviewed like code and sent to a few servers first.'},
    {term:'Composer', aka:['API composer'], def:'A service that calls several others and merges their answers into one response. Example: the status page composer gathers data from five services.'},
    {term:'Dockerfile', def:'A recipe file that lists the steps to build a container image. Example: start from a base image, copy the code, install libraries, set the start command.'},
    {term:'Desired state', def:'What you declare you want, such as four copies running. Controllers work to make reality match it. Example: “4 copies of the status app”.'}
  ],
  sources:['Evans, Domain-Driven Design (2003); Vernon, Implementing DDD (2013)', 'Uber Engineering, DOMA (2020); Netflix Tech Blog, Eureka, GraphQL federation (2020), Hexagonal Architecture (2020)', 'Envoy, Istio, Linkerd, Consul and Kubernetes documentation', 'Fowler, StranglerFigApplication; Newman, Monolith to Microservices (2019)', 'AWS Lambda documentation; Prime Video Tech Blog (2023); Jonas et al., Berkeley View on Serverless (2019)', 'Verma et al., Borg, EuroSys 2015; Burns et al., “Borg, Omega, and Kubernetes”, ACM Queue (2016)', 'Wiggins, The Twelve-Factor App (2011); AWS SaaS Lens; Salesforce multitenant whitepaper', 'Cockburn, Hexagonal Architecture (2005); Tang et al., Holistic Configuration Management at Facebook, SOSP 2015; Hodgson, Feature Toggles (2017)']
});
} catch(e){ console.error('[SDA] module architecture', e); SDA.errors.push({id:'architecture', error:e}); }
})();
