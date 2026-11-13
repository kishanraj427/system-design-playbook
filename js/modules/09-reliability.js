/* =====================================================================
   PART 6 · MODULE 9 — RELIABILITY
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, esc, clamp, fmtNum, fmtDur} = SDA.u; const ui = SDA.ui;
const {sortGame, orderGame, lineChart} = SDA.m1helpers; const {css, frag} = SDA.ph;
const pct = (v, d) => (v * 100).toFixed(d == null ? 2 : d) + '%';
const downtime = a => fmtDur((1 - a) * 365.25 * 24 * 3600 * 1000) + '/yr';

/* ---------- widgets ---------- */
function amplificationCalc(host){
  const P = {layers:4, retries:3, where:'every'}; const out = el('div');
  function run(){
    const total = P.where === 'every' ? Math.pow(P.retries + 1, P.layers) : (P.retries + 1);
    const rows = []; for (let i = 1; i <= P.layers; i++){ const calls = P.where === 'every' ? Math.pow(P.retries + 1, i) : (i === 1 ? P.retries + 1 : P.retries + 1); rows.push([`Layer ${i}${i === P.layers ? ' (the struggling DB)' : ''}`, fmtNum(calls)]); }
    out.innerHTML = '';
    out.append(frag(h.table(['Layer', 'Calls caused by ONE user request (worst case)'], rows, [1])));
    out.append(el('div', {class:'verdict ' + (total > 20 ? 'bad' : total > 4 ? 'warn' : 'ok')}, P.where === 'every'
      ? `Retrying ${P.retries}× at each of ${P.layers} layers: one user click becomes up to ${fmtNum(total)} calls on the bottom layer, exactly when it is already failing. That is how retries turn a small slowdown into an outage.`
      : `Retrying only at one layer (usually the edge or the caller closest to the user) caps it at ${P.retries + 1} calls per click, no matter how deep the stack is.`));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Service layers in the call chain', min:1, max:6, value:P.layers, fmt:v => String(v), onInput:v => { P.layers = v; run(); }}).el,
    ui.slider({label:'Retries per layer', min:0, max:5, value:P.retries, fmt:v => String(v), onInput:v => { P.retries = v; run(); }}).el,
    ui.select({label:'Who retries?', value:'every', options:[['every', 'Every layer retries'], ['edge', 'Only one layer retries; others fail fast']], onChange:v => { P.where = v; run(); }}).el), out);
  run();
}
function bulkheadCalc(host){
  const DEPS = [{id:'pay', name:'Payments', rate:20, lat:.08}, {id:'rec', name:'Recommendations', rate:40, lat:.06}, {id:'cat', name:'Catalog', rate:60, lat:.05}];
  const P = {mode:'shared', slow:'rec', timeout:5, fallback:true}; const out = el('div'); const POOL = 60;
  function run(){
    const lat = d => d.id === P.slow ? Math.min(6, P.timeout) : d.lat;
    const need = DEPS.map(d => d.rate * lat(d)); const tot = need.reduce((a, b) => a + b, 0);
    const share = {pay:20, rec:15, cat:25};
    const res = DEPS.map((d, i) => {
      const cap = P.mode === 'shared' ? POOL * need[i] / Math.max(tot, POOL) : Math.min(share[d.id], need[i]);
      const admitted = Math.min(1, cap / need[i]);
      const healthy = d.id !== P.slow; const ok = healthy ? admitted : 0;
      const served = healthy ? admitted : (P.fallback ? 1 : 0);
      return [d.name + (d.id === P.slow ? ' 🐢' : ''), (need[i]).toFixed(1), (P.mode === 'shared' ? 'shared ' + POOL : String(share[d.id])), pct(ok, 0), pct(served, 0)];
    });
    out.innerHTML = '';
    out.append(frag(h.table(['Dependency', 'Threads needed (rate × latency)', 'Threads available', 'Real successes', 'Users served (incl. fallback)'], res, [1, 3, 4])));
    const vi = P.slow === 'pay' ? 2 : 0; const victim = DEPS[vi].name; const payOk = parseFloat(res[vi][3]);
    out.append(el('div', {class:'verdict ' + (payOk < 99 ? 'bad' : 'ok')}, P.mode === 'shared'
      ? (payOk < 99 ? `One slow dependency needs ${need[DEPS.findIndex(d => d.id === P.slow)].toFixed(0)} threads and eats the shared pool of ${POOL}. ${victim}, which is perfectly healthy, now succeeds only ${payOk}% of the time. That is a cascading failure.` : P.slow === 'none' ? 'Everything is healthy: all three together need only a few threads.' : 'At this short timeout the slow calls give their threads back quickly, so the shared pool still has room. Raise the timeout and watch the slow dependency swallow the pool.')
      : P.slow === 'none' ? 'Everything is healthy; each compartment has plenty of room.' : P.slow === 'pay' ? `Payments itself is slow, so its own compartment (${share.pay} threads) fills, but Catalog and Recommendations keep their threads and stay at 100%.` : `With bulkheads the slow dependency can only exhaust its own ${share[P.slow]} threads. ${victim} and the others keep their compartments and stay at 100%.`));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.select({label:'Thread pools', value:'shared', options:[['shared', 'One shared pool (60 threads)'], ['bulkhead', 'Bulkheads: 20 / 15 / 25 per dependency']], onChange:v => { P.mode = v; run(); }}).el,
    ui.select({label:'Which dependency is slow (6 s)?', value:'rec', options:[['rec', 'Recommendations'], ['cat', 'Catalog'], ['pay', 'Payments'], ['none', 'None']], onChange:v => { P.slow = v; run(); }}).el,
    ui.slider({label:'Call timeout', min:.2, max:6, step:.1, value:P.timeout, fmt:v => v.toFixed(1) + ' s', onInput:v => { P.timeout = v; run(); }}).el,
    ui.toggle({label:'Fallback for the slow dependency', checked:true, onChange:v => { P.fallback = v; run(); }}).el), out,
    el('p', {class:'lab-hint'}, 'Steady-state model using Little’s law: busy threads = arrival rate × time each call holds a thread. Payments 20/s, Recommendations 40/s, Catalog 60/s, all normally 50–80 ms.'));
  run();
}
function sheddingChart(host){
  const C = 1000; const P = {timeout:1, offered:1.5}; const box = el('div'); const out = el('div');
  function goodput(lambda, shed, T){
    let q = []; let good = 0, wasted = 0, rejected = 0; const dt = .1, steps = 600;
    for (let s = 0; s < steps; s++){
      const now = s * dt; let inN = lambda * dt;
      if (shed){ const qlen = q.reduce((a, c) => a + c.n, 0); const room = Math.max(0, C * T - qlen); if (inN > room){ rejected += inN - room; inN = room; } }
      if (inN > 0) q.push({t:now, n:inN});
      let cap = C * dt;
      while (cap > 1e-9 && q.length){ const c = q[0]; const take = Math.min(cap, c.n); const wait = now - c.t; if (wait <= T) good += take; else wasted += take; c.n -= take; cap -= take; if (c.n <= 1e-9) q.shift(); }
    }
    return {good:good / 60, wasted:wasted / 60, rejected:rejected / 60};
  }
  function run(){
    box.innerHTML = ''; const pts = 31;
    const A = [], B = []; for (let i = 0; i < pts; i++){ const l = i / (pts - 1) * 3 * C; A.push([l, goodput(l, false, P.timeout).good]); B.push([l, goodput(l, true, P.timeout).good]); }
    const W = 640, H = 250, L = 58, Rr = 18, T = 16, Bt = 40; const X = v => L + v / (3 * C) * (W - L - Rr), Y = v => H - Bt - v / (1.2 * C) * (H - T - Bt);
    const path = arr => arr.map(([x, y], i) => (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1)).join('');
    box.innerHTML = `<div class="chart-box"><svg viewBox="0 0 ${W} ${H}" class="mini-chart" role="img"><title>Goodput versus offered load, with and without load shedding</title>
      ${[0, 500, 1000].map(v => `<line class="gridl" x1="${L}" x2="${W - Rr}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${fmtNum(v)}</text>`).join('')}
      ${[0, 1000, 2000, 3000].map(v => `<text x="${X(v)}" y="${H - Bt + 18}" text-anchor="middle">${fmtNum(v)}</text>`).join('')}
      <line class="axis" x1="${L}" x2="${W - Rr}" y1="${H - Bt}" y2="${H - Bt}"/><line class="axis" x1="${L}" x2="${L}" y1="${T}" y2="${H - Bt}"/>
      <text x="${(W + L) / 2}" y="${H - 6}" text-anchor="middle">offered load (req/s) — capacity is 1,000</text><text x="14" y="${(H - Bt + T) / 2}" text-anchor="middle" transform="rotate(-90 14 ${(H - Bt + T) / 2})">goodput (useful req/s)</text>
      <path d="${path(B)}" fill="none" stroke-width="2.6" style="stroke:var(--ok)"/><path d="${path(A)}" fill="none" stroke-width="2.6" style="stroke:var(--bad)"/>
      <line x1="${X(P.offered * C)}" x2="${X(P.offered * C)}" y1="${T}" y2="${H - Bt}" class="gridl" style="stroke:var(--text)"/>
      <text x="${W - Rr - 4}" y="${Y(1000) - 8}" text-anchor="end" style="fill:var(--ok)">with load shedding</text><text x="${W - Rr - 4}" y="${Y(120) - 8}" text-anchor="end" style="fill:var(--bad)">unbounded queue</text></svg></div>`;
    const a = goodput(P.offered * C, false, P.timeout), b = goodput(P.offered * C, true, P.timeout);
    out.innerHTML = '';
    out.append(frag(h.table(['At ' + fmtNum(P.offered * C) + ' req/s offered', 'Useful responses/s', 'Wasted work/s (client already gave up)', 'Rejected fast/s'], [['Unbounded FIFO queue', fmtNum(a.good), fmtNum(a.wasted), '0'], ['Load shedding (bounded queue)', fmtNum(b.good), fmtNum(b.wasted), fmtNum(b.rejected)]], [1, 2, 3])));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Offered load', min:.2, max:3, step:.1, value:P.offered, fmt:v => fmtNum(v * C) + ' req/s', onInput:v => { P.offered = v; run(); }}).el, ui.slider({label:'Client timeout', min:.2, max:5, step:.1, value:P.timeout, fmt:v => v.toFixed(1) + ' s', onInput:v => { P.timeout = v; run(); }}).el), box, out,
    el('p', {class:'lab-hint'}, 'A server that can finish 1,000 req/s, simulated for 60 s in 100 ms steps. Without shedding, the queue grows without limit; after a few seconds every request it finishes has already been abandoned by the client, so goodput collapses even though the server is 100% busy. With shedding, it rejects what it cannot serve in time, and keeps finishing 1,000 useful requests per second.'));
  run();
}
function failoverCalc(host){
  const P = {a:.999, n:2, fo:60, fails:4}; const out = el('div');
  function run(){
    const yearS = 365.25 * 24 * 3600; const single = P.a;
    const bothDown = Math.pow(1 - P.a, P.n);
    const apFail = P.fails * P.fo / yearS;
    const ap = Math.max(0, 1 - bothDown - apFail);
    const aa = 1 - bothDown;
    const over = P.n / (P.n - 1);
    out.innerHTML = '';
    out.append(frag(h.table(['Setup', 'Availability (illustrative)', 'Downtime', 'Capacity you must buy'], [
      ['Single node', pct(single, 3), downtime(single), '1× load'],
      [`Active-passive (${P.n} nodes, ${P.fo} s failover × ${P.fails} failures/yr)`, pct(ap, 4), downtime(ap), `${P.n}× load (standbys idle)`],
      [`Active-active (${P.n} nodes, instant re-routing)`, pct(aa, 5), downtime(aa), `${over.toFixed(2)}× load (each must absorb a lost peer)`]], [1, 2])));
    out.append(el('div', {class:'verdict ok'}, `Redundancy multiplies away independent failures: P(all ${P.n} down) = (1 − ${P.a})^${P.n} = ${bothDown.toExponential(1)}. But active-passive pays for every failover with ${P.fo} s of downtime, and both assume failures are independent. Shared power, shared config pushes or a shared bug break that assumption.`));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.select({label:'One node’s availability', value:'0.999', options:[['0.99', '99% (two nines)'], ['0.999', '99.9% (three nines)'], ['0.9999', '99.99% (four nines)']], onChange:v => { P.a = +v; run(); }}).el,
    ui.slider({label:'Redundant nodes', min:2, max:5, value:P.n, fmt:v => String(v), onInput:v => { P.n = v; run(); }}).el,
    ui.slider({label:'Failover time (active-passive)', min:5, max:600, step:5, value:P.fo, fmt:v => fmtDur(v * 1000), onInput:v => { P.fo = v; run(); }}).el,
    ui.slider({label:'Failovers per year', min:1, max:24, value:P.fails, fmt:v => String(v), onInput:v => { P.fails = v; run(); }}).el), out);
  run();
}
function topologyPicker(host){
  const OPTS = [
    {name:'Single AZ', avail:.999, write:1, cost:1, rto:'hours (rebuild elsewhere)', survives:'instance failures only'},
    {name:'Multi-AZ (one region)', avail:.9995, write:2, cost:1.6, rto:'≈1–2 min (automatic)', survives:'instance + one data-centre (AZ) failure'},
    {name:'Multi-region active-passive', avail:.9999, write:2, cost:2.2, rto:'minutes (promote standby region)', survives:'a whole region (with async-replication data loss)'},
    {name:'Multi-region active-active', avail:.99995, write:80, cost:3, rto:'seconds (shift traffic)', survives:'a whole region, if data is replicated synchronously or conflict-tolerant'}];
  const P = {target:.9995, lat:20, budget:2.5}; const out = el('div');
  function run(){
    out.innerHTML = '';
    out.append(frag(h.table(['Topology', 'Availability (illustrative)', 'Extra write latency', 'Relative cost', 'Recovery', 'Survives', 'Fits?'], OPTS.map(o => {
      const ok = o.avail >= P.target && o.write <= P.lat && o.cost <= P.budget;
      const why = o.avail < P.target ? 'too few nines' : o.write > P.lat ? 'writes too slow' : o.cost > P.budget ? 'over budget' : '';
      return [`<b>${o.name}</b>`, pct(o.avail, 3), o.write >= 50 ? `~${o.write} ms (cross-region sync)` : `~${o.write} ms`, o.cost + '×', o.rto, o.survives, ok ? '<span style="color:var(--ok)">✔ fits</span>' : `<span style="color:var(--bad)">✖ ${why}</span>`];
    }), [1, 3])));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.select({label:'Availability target', value:'0.9995', options:[['0.999', '99.9%'], ['0.9995', '99.95%'], ['0.9999', '99.99%'], ['0.99995', '99.995%']], onChange:v => { P.target = +v; run(); }}).el,
    ui.slider({label:'Max extra write latency you accept', min:1, max:150, value:P.lat, fmt:v => v + ' ms', onInput:v => { P.lat = v; run(); }}).el,
    ui.slider({label:'Budget (× single-AZ cost)', min:1, max:4, step:.1, value:P.budget, fmt:v => v.toFixed(1) + '×', onInput:v => { P.budget = v; run(); }}).el), out,
    el('p', {class:'lab-hint'}, 'All numbers are illustrative orders of magnitude, not vendor SLAs. Cross-AZ round trips are typically about a millisecond or two; synchronous cross-region writes pay a long-distance round trip (Mumbai ↔ Singapore is tens of milliseconds).'));
  run();
}
function drPicker(host){
  const ST = [
    {id:'br', name:'Backup & restore', rpo:24 * 60, rto:12 * 60, cost:1, how:'Periodic backups/snapshots copied to another region. Infra is rebuilt from code after a disaster.'},
    {id:'pl', name:'Pilot light', rpo:15, rto:60, cost:2, how:'Data is replicated continuously; core infra (DB replica) is running but app servers are off or tiny and scaled up on failover.'},
    {id:'ws', name:'Warm standby', rpo:1, rto:15, cost:4, how:'A smaller but fully working copy runs in the other region, ready to scale up and take traffic.'},
    {id:'ms', name:'Multi-site active/active', rpo:0, rto:1, cost:8, how:'Full capacity in two or more regions serving traffic all the time; failover is a routing change.'}];
  const P = {rpo:60, rto:120}; const out = el('div');
  const fm = m => m === 0 ? '≈0' : m < 60 ? m + ' min' : (m / 60) + ' h';
  function run(){
    out.innerHTML = '';
    const fits = ST.filter(s => s.rpo <= P.rpo && s.rto <= P.rto); const best = fits.sort((a, b) => a.cost - b.cost)[0];
    out.append(frag(h.table(['Strategy', 'Typical RPO (data lost)', 'Typical RTO (downtime)', 'Relative cost', 'How it works', 'Meets your targets?'], ST.map(s => [`<b>${s.name}</b>`, fm(s.rpo), fm(s.rto), '₹'.repeat(Math.min(4, Math.ceil(Math.log2(s.cost) + 1))), s.how, s.rpo <= P.rpo && s.rto <= P.rto ? `<span style="color:var(--ok)">✔${best && best.id === s.id ? ' cheapest that fits' : ''}</span>` : '<span style="color:var(--bad)">✖</span>']), [])));
    if (best){
      const tl = el('div', {class:'card', style:{marginTop:'10px'}});
      const tot = Math.max(P.rpo, best.rpo) + Math.max(P.rto, best.rto) + 1; const wv = v => Math.max(2, v / tot * 100) + '%';
      tl.append(el('b', null, `Disaster timeline with ${best.name}`), el('div', {style:{display:'flex', height:'26px', borderRadius:'8px', overflow:'hidden', margin:'8px 0', border:'1px solid var(--border)'}},
        el('div', {style:{width:wv(best.rpo), background:'var(--warn-bg)', borderRight:'2px solid var(--warn)'}, title:'Data written in this window is lost'}),
        el('div', {style:{width:'3px', background:'var(--bad)'}}),
        el('div', {style:{width:wv(best.rto), background:'var(--bad-bg)'}, title:'Service is down in this window'}),
        el('div', {style:{flex:'1', background:'var(--ok-bg)'}})),
        el('div', {class:'lab-hint'}, `◀ last good copy (lose up to ${fm(best.rpo)} of writes) · 💥 disaster · down for up to ${fm(best.rto)} · ✔ back in service`));
      out.append(tl);
    } else out.append(el('div', {class:'verdict bad'}, 'No standard strategy meets these targets. Relax RPO/RTO, or design for active-active with synchronous replication and accept the latency and cost.'));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'RPO target: max data you can lose', min:0, max:24 * 60, step:5, value:P.rpo, fmt:fm, onInput:v => { P.rpo = v; run(); }}).el,
    ui.slider({label:'RTO target: max time to be back up', min:1, max:24 * 60, step:1, value:P.rto, fmt:fm, onInput:v => { P.rto = v; run(); }}).el), out,
    el('p', {class:'lab-hint'}, 'RPO/RTO ranges follow the four strategies in AWS’s “Disaster Recovery of Workloads on AWS” whitepaper. Exact numbers depend on your data size, replication and automation, so they are illustrative.'));
  run();
}
function capacityCalc(host){
  const P = {peak:12000, growth:60, months:12, perInst:800, target:60, zones:3}; const out = el('div'); const chartHost = el('div');
  function run(){
    const future = P.peak * Math.pow(1 + P.growth / 100, P.months / 12);
    const base = Math.ceil(future / (P.perInst * P.target / 100));
    const survive = P.zones > 1 ? Math.ceil(base * P.zones / (P.zones - 1)) : base;
    out.innerHTML = '';
    out.append(frag(h.math(`Peak in ${P.months} months = ${fmtNum(P.peak)} × (1 + ${P.growth}%)^(${P.months}/12) ≈ ${fmtNum(future)} req/s
Usable per instance  = ${P.perInst} req/s (load-tested max) × ${P.target}% target = ${fmtNum(P.perInst * P.target / 100)} req/s
Instances for peak   = ⌈${fmtNum(future)} ÷ ${fmtNum(P.perInst * P.target / 100)}⌉ = ${base}
Survive losing 1 of ${P.zones} zones → × ${P.zones}/${P.zones - 1} = ${survive} instances${P.zones > 1 ? ` (${Math.ceil(survive / P.zones)} per zone)` : ''}`)));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Today’s peak', min:500, max:100000, step:500, value:P.peak, fmt:v => fmtNum(v) + ' req/s', onInput:v => { P.peak = v; run(); }}).el,
    ui.slider({label:'Growth per year', min:0, max:300, step:5, value:P.growth, fmt:v => v + '%', onInput:v => { P.growth = v; run(); }}).el,
    ui.slider({label:'Planning horizon', min:1, max:24, value:P.months, fmt:v => v + ' months', onInput:v => { P.months = v; run(); }}).el,
    ui.slider({label:'Max per instance (from load test)', min:100, max:5000, step:50, value:P.perInst, fmt:v => fmtNum(v) + ' req/s', onInput:v => { P.perInst = v; run(); }}).el,
    ui.slider({label:'Target utilisation at peak', min:30, max:90, step:5, value:P.target, fmt:v => v + '%', onInput:v => { P.target = v; run(); }}).el,
    ui.slider({label:'Availability zones', min:1, max:4, value:P.zones, fmt:v => String(v), onInput:v => { P.zones = v; run(); }}).el), out, chartHost);
  const ch = lineChart(chartHost, {label:'Queueing delay grows as utilisation approaches 100%', xMin:0, xMax:.97, yMax:20, fn:r => 1 / (1 - r), xTicks:[0, .25, .5, .7, .9], xFmt:v => Math.round(v * 100) + '%', yTicks:[1, 5, 10, 20], yFmt:v => v + '×', xLabel:'utilisation ρ', yLabel:'response time ÷ service time', color:'var(--accent2)'});
  ch.set(.6, '60% → 2.5×'); run();
}
function hpaCalc(host){
  const P = {cur:6, util:90, target:60, min:2, max:20}; const out = el('div');
  function run(){
    const raw = P.cur * P.util / P.target; const ratio = P.util / P.target; const tol = Math.abs(ratio - 1) <= .1;
    const desired = tol ? P.cur : clamp(Math.ceil(raw), P.min, P.max);
    out.innerHTML = '';
    out.append(frag(h.math(`desiredReplicas = ⌈currentReplicas × currentUtil ÷ targetUtil⌉
                = ⌈${P.cur} × ${P.util}% ÷ ${P.target}%⌉ = ⌈${raw.toFixed(2)}⌉ = ${Math.ceil(raw)}
ratio ${ratio.toFixed(2)} ${tol ? 'is within the 10% tolerance → no change' : 'is outside the 10% tolerance → act'}; clamp to [${P.min}, ${P.max}] → ${desired}`)));
    out.append(el('div', {class:'verdict ' + (desired > P.cur ? 'warn' : 'ok')}, desired > P.cur ? `Scale out ${P.cur} → ${desired}. New pods are not ready until they boot and pass readiness checks, so utilisation stays high for that warm-up.` : desired < P.cur ? `Scale in ${P.cur} → ${desired}, but only after the scale-down stabilisation window (default 5 min) agrees, to avoid flapping.` : 'Hold steady.'));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Current replicas', min:1, max:30, value:P.cur, fmt:v => String(v), onInput:v => { P.cur = v; run(); }}).el,
    ui.slider({label:'Current average CPU', min:5, max:200, step:5, value:P.util, fmt:v => v + '% of request', onInput:v => { P.util = v; run(); }}).el,
    ui.slider({label:'Target CPU', min:20, max:90, step:5, value:P.target, fmt:v => v + '%', onInput:v => { P.target = v; run(); }}).el,
    ui.slider({label:'maxReplicas', min:2, max:50, value:P.max, fmt:v => String(v), onInput:v => { P.max = v; run(); }}).el), out);
  run();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'timeouts-retries', title:'Timeouts, retries, exponential backoff and jitter', minutes:12, tags:['timeout','retry','backoff','jitter','retry budget','deadline'],
  summary:'Every network call needs a timeout. Retries fix transient failures but multiply load, so retry only idempotent work, with capped exponential backoff, jitter and a retry budget, at one layer.',
  problem:`<p>Your checkout calls a payment service. One payment pod has a 4-second GC pause. With no timeout, checkout threads wait forever and the whole site freezes. So you add retries. Then the payment database slows down a little, every layer retries three times, and the database gets 64× its normal traffic. The small slowdown has become a full outage.</p>`,
  intuition:`Calling a busy customer-care line. You don’t hold forever: you hang up after a while (timeout). You don’t redial instantly 50 times either (that jams the lines for everyone). You wait a bit, then longer, then longer (exponential backoff). And if a whole city calls back at exactly 10:00:05 after an outage, the lines jam again, so each caller adds a random wait (jitter).`,
  how:{
    steps:[`<b>Set a timeout on every remote call</b> (connect + request). Base it on the dependency’s p99.9 latency, not its average, and keep it inside the caller’s own deadline.`, `<b>Propagate a deadline</b>: if the user request has 2 s left, downstream calls get “whatever is left”, not a fresh 2 s each (gRPC deadlines do this).`, `<b>Retry only transient, retryable failures</b>: connection resets, 503, 429 (respect <code>Retry-After</code>), timeouts. Never retry 400s, and only retry non-idempotent writes with an <b>idempotency key</b>.`, `<b>Back off exponentially with a cap</b>: <code>base × 2ᵏ</code>, capped (e.g. 100 ms, 200 ms, 400 ms … max 5 s), with a small max-attempts limit (2–3).`, `<b>Add jitter</b>: full jitter <code>sleep = random(0, min(cap, base·2ᵏ))</code> de-synchronises clients that failed together.`, `<b>Bound total retries</b> with a <b>retry budget</b> (e.g. retries ≤ 10% of requests) and retry at <b>one layer</b> only, so failures don’t multiply down the stack.`],
    diagram:{title:'A retry with backoff to a healthy replica', w:780, h:250, alt:'Checkout calls payments through a load balancer; one replica stalls, the call times out, and a backed-off retry reaches a healthy replica.',
      nodes:[{id:'c', type:'client', label:'Shopper', x:70, y:125}, {id:'co', type:'service', label:'Checkout', sub:'deadline 2 s', x:230, y:125, w:130}, {id:'lb', type:'lb', label:'Load balancer', x:400, y:125}, {id:'p1', type:'service', label:'Payments #1', sub:'GC pause', x:600, y:60, w:130}, {id:'p2', type:'service', label:'Payments #2', x:600, y:190, w:130}],
      edges:[{from:'c', to:'co'}, {from:'co', to:'lb'}, {from:'lb', to:'p1'}, {from:'lb', to:'p2'}],
      steps:[
        {note:'Checkout calls Payments with a <b>300 ms timeout</b> (its p99.9 is 180 ms), well inside the 2 s user deadline.', flow:[['c', 'co', 'Pay'], ['co', 'lb', 'charge, key=ord-77'], ['lb', 'p1']], status:{p1:'hot'}},
        {note:'Payments #1 is stuck in a GC pause. After 300 ms the <b>timeout fires</b>: the thread is freed instead of waiting seconds.', hl:['p1'], status:{p1:'down'}},
        {note:'The error is retryable and the request carries an <b>idempotency key</b>, so a retry can’t double-charge. Wait <b>random(0, 100 ms)</b> (full jitter), then retry once.', hl:['co']},
        {note:'The retry lands on healthy <b>Payments #2</b>. Total ≈ 450 ms: slower than usual, but the user never noticed a failure.', flow:[['co', 'lb', 'retry #1'], ['lb', 'p2'], ['p2', 'co', '200 OK'], ['co', 'c', 'Paid ✔']]}
      ]},
    mount:host => amplificationCalc(host),
    deep:`<p><b>Choosing timeouts:</b> measure the dependency’s latency distribution and pick a timeout around its p99.9 (plus headroom). Too low causes false timeouts and needless retries; too high holds threads and memory. Connect timeouts can be much shorter (tens of ms inside a data centre) than request timeouts. Keep timeouts <i>decreasing</i> down the stack, or use deadline propagation, so an inner call never outlives the outer request.</p><p><b>Why jitter matters:</b> clients that fail at the same moment (a blip, a deploy, a leader election) retry at the same moment with plain exponential backoff, producing synchronised waves. AWS’s analysis showed <i>full jitter</i> and <i>decorrelated jitter</i> (<code>sleep = min(cap, random(base, prev × 3))</code>) cut both total calls and completion time.</p><p><b>Retry budgets:</b> Google’s SRE book recommends limiting retries per request (e.g. 3) and per client (e.g. retries ≤ 10% of requests), plus marking “overloaded; don’t retry” responses so upper layers don’t retry what lower layers already gave up on. gRPC’s retry throttling implements a token bucket for this. <b>Hedged requests</b> (send a second copy after the p95 latency) cut tail latency but add load. Use them only for idempotent reads, with a cap.</p>`
  },
  tradeoffs:{use:[`Transient network failures, throttling (429/503 with Retry-After), failovers in progress`, `Idempotent reads, or writes protected by idempotency keys`], avoid:[`Retrying non-idempotent writes without a key (double charges, double bookings)`, `Retrying at every layer of a deep call chain`, `Retrying errors that will never succeed (400, 401, 404, validation)`], alt:[`Fail fast + circuit breaker when a dependency is clearly down`, `Queue the work and process asynchronously with its own retry/DLQ policy`, `Hedged requests for tail latency on idempotent reads`]},
  real:[
    {co:'AWS SDKs and the Amazon Builders’ Library', tier:'confirmed', text:'AWS documents capped exponential backoff with jitter as the standard retry behaviour for its SDKs, and its Builders’ Library article explains timeouts, retry budgets and why retrying at only one layer prevents amplification.', src:'Marc Brooker, “Timeouts, retries, and backoff with jitter”, Amazon Builders’ Library; AWS Architecture Blog, “Exponential Backoff and Jitter” (2015)'},
    {co:'Google SRE', tier:'confirmed', text:'The SRE book’s chapter on cascading failures recommends randomised exponential backoff, per-request retry limits, a server-wide retry budget, and deadline propagation.', src:'Beyer et al., Site Reliability Engineering (O’Reilly, 2016), ch. 22 “Addressing Cascading Failures”'},
    {co:'UPI-style payment apps', tier:'educational', text:'A “pay” tap whose response is lost must not be blindly re-sent. The app retries the status query (idempotent) or re-submits with the same transaction reference, so the bank side can deduplicate.', src:'Simplified educational design'}
  ],
  mistakes:[`No timeout at all (the library default is often “infinite”)`, `Same timeout at every layer, so the outer call times out while inner retries keep running`, `Retrying 3× at 4 layers, giving 81–256× load on the bottom service`, `Exponential backoff without jitter, so retries arrive in synchronised waves`],
  interview:[`Say “timeout + capped exponential backoff with jitter + retry budget, only on idempotent operations”`, `Mention deadline propagation and retrying at a single layer when the call chain is deep`],
  tryit:[{note:'Compare retry policies against 2,000 clients reconnecting at once:', pg:'retry-jitter'}, {quiz:[{q:'Which error should you NOT retry?', options:['503 Service Unavailable', 'Connection reset', '400 Bad Request', '429 Too Many Requests (after Retry-After)'], answer:2, why:'The request itself is wrong; retrying will fail identically.'}, {q:'Full jitter means…', options:['sleep = base × 2ᵏ', 'sleep = random(0, min(cap, base × 2ᵏ))', 'sleep = 0', 'sleep = cap'], answer:1, why:'A random delay up to the exponential bound.'}], quizId:'rel-l1'}],
  sources:[`Amazon Builders’ Library — Timeouts, retries, and backoff with jitter`, `AWS Architecture Blog — Exponential Backoff and Jitter (2015)`, `Google SRE book, ch. 22`, `gRPC proposal A6 — Client Retries`]
},
{
  id:'circuit-breaker', title:'The circuit breaker pattern', minutes:10, tags:['circuit breaker','fail fast','half-open','Hystrix','Resilience4j'],
  summary:'A circuit breaker watches calls to a dependency. When too many fail it opens and fails fast for a while, protecting both caller and dependency, then probes in half-open and closes when the dependency recovers.',
  problem:`<p>Swiggy-style restaurant search calls a “delivery ETA” service. ETA’s database is overloaded and every call now times out after 2 seconds. Search keeps calling it 3,000 times a second, so its threads fill with waiting calls, search itself stops responding, and ETA never gets a quiet moment to recover. Both services are down because one kept hammering the other.</p>`,
  intuition:`The electrical circuit breaker in your home. When a faulty appliance draws too much current, the breaker trips and cuts power instantly instead of letting the wiring burn. After a while you try switching it on again. If the fault is still there, it trips again; if it’s fixed, power stays on.`,
  how:{
    steps:[`<b>Closed</b> (normal): calls pass through. The breaker records outcomes in a sliding window (e.g. the last 20 calls or the last 10 s).`, `If at least <b>minimum calls</b> have been made and the <b>failure rate</b> (errors + timeouts, optionally slow calls) is above a <b>threshold</b> (e.g. 50%), the breaker <b>opens</b>.`, `<b>Open</b>: calls fail immediately (≈1 ms) without touching the dependency. The caller returns a <b>fallback</b>: cached data, a default, a degraded response, or a clear error.`, `After the <b>open duration</b> (e.g. 5–30 s) the breaker goes <b>half-open</b> and lets a few <b>probe</b> calls through.`, `If the probes succeed the breaker <b>closes</b>; if any fails it re-opens for another open duration.`],
    diagram:{title:'Breaker protecting search from a failing ETA service', w:780, h:240, alt:'Search calls ETA through a circuit breaker; when ETA fails the breaker opens and serves a fallback.',
      nodes:[{id:'u', type:'client', label:'App', x:70, y:120}, {id:'s', type:'service', label:'Restaurant search', x:240, y:120, w:150}, {id:'cb', type:'lb', label:'Circuit breaker', sub:'CLOSED', x:430, y:120, w:140}, {id:'eta', type:'service', label:'ETA service', x:640, y:60, w:120}, {id:'fb', type:'cache', label:'Fallback', sub:'“~35 min” default', x:640, y:190, w:150}],
      edges:[{from:'u', to:'s'}, {from:'s', to:'cb'}, {from:'cb', to:'eta'}, {from:'cb', to:'fb'}],
      steps:[
        {note:'<b>Closed:</b> calls flow to ETA and the breaker counts outcomes.', flow:[['u', 's', 'search'], ['s', 'cb'], ['cb', 'eta'], ['eta', 's', '32 min']]},
        {note:'ETA’s DB is overloaded and calls start timing out. 14 of the last 20 failed (70% ≥ 50%), so the breaker <b>opens</b>.', status:{eta:'down'}, sub:{cb:'OPEN'}, hl:['cb']},
        {note:'<b>Open:</b> calls fail fast to the fallback in ~1 ms. Search stays fast, and ETA gets no traffic, so it can recover.', flow:[['s', 'cb'], ['cb', 'fb', 'short-circuit'], ['fb', 's', '~35 min']]},
        {note:'After 10 s: <b>half-open</b>. Three probe calls go through and all succeed, so the breaker <b>closes</b>.', status:{eta:'ok'}, sub:{cb:'HALF-OPEN → CLOSED'}, flow:[['cb', 'eta', 'probe ×3'], ['eta', 'cb', 'OK']]}
      ]},
    deep:`<p><b>What counts as failure:</b> timeouts, connection errors and 5xx, but usually <i>not</i> 4xx (the caller’s fault). Resilience4j can also treat <i>slow calls</i> (above a duration threshold) as failures, so the breaker opens on latency degradation before outright errors appear.</p><p><b>Windows:</b> count-based (last N calls) reacts consistently at any traffic level; time-based (last N seconds) is better for very bursty traffic. Always set a <b>minimum number of calls</b> so 2 failures out of 3 at 3 AM don’t trip the breaker.</p><p><b>Granularity:</b> one breaker per dependency (or per dependency + endpoint/host). One breaker per whole downstream cluster can be tripped by a single bad host; per-host breakers combine well with load-balancer outlier ejection (Envoy calls this <i>outlier detection</i>).</p><p><b>Combine with:</b> timeouts (a breaker can’t open on calls that never end), bulkheads (cap concurrency per dependency), and fallbacks. Retries belong <i>inside</i> the breaker’s view, so retried failures count. Netflix’s Hystrix popularised this combination. It is in maintenance mode now; Resilience4j and service-mesh features (Envoy/Istio) are the common modern choices.</p>`
  },
  tradeoffs:{use:[`Calls to remote dependencies that can fail or slow down independently`, `Non-critical features with a sensible fallback (recommendations, ETA estimates, reviews)`], avoid:[`Tripping on client errors (4xx); they say nothing about dependency health`, `Breakers without timeouts: hung calls never complete, so nothing is counted`, `Critical writes with no safe fallback: surface a clear error instead of fake success`], alt:[`Load-balancer outlier ejection (per-host)`, `Bulkheads + timeouts alone for simpler services`, `Asynchronous queueing so callers don’t depend on the dependency being up`]},
  real:[
    {co:'Netflix Hystrix', tier:'confirmed', text:'Netflix’s API used Hystrix to wrap dependency calls with circuit breakers, thread-pool bulkheads and fallbacks; the 2012 announcement describes tens of billions of thread-isolated calls a day.', src:'Netflix Tech Blog, “Introducing Hystrix for Resilience Engineering” (2012)'},
    {co:'Resilience4j', tier:'confirmed', text:'A lightweight Java library with count- and time-based sliding windows, failure-rate and slow-call-rate thresholds, and a half-open state with a configurable number of permitted calls.', src:'Resilience4j documentation'},
    {co:'Envoy proxy', tier:'confirmed', text:'Envoy implements circuit breaking as limits on connections, pending requests and retries, plus outlier detection that ejects misbehaving hosts.', src:'Envoy documentation — Circuit breaking, Outlier detection'}
  ],
  mistakes:[`A single global breaker for a cluster where only one host is bad`, `Fallbacks that call another fragile remote service (the fallback fails too)`, `Never testing the open state, so the fallback path is broken when you finally need it`],
  interview:[`Draw the three states and the transitions; name the knobs (window, min calls, threshold, open duration, probes)`, `Pair it with timeouts, bulkheads and a concrete fallback for each dependency`],
  tryit:{note:'Make the dependency fail or go slow and watch the breaker trip and recover:', pg:'circuit-breaker'},
  sources:[`Michael Nygard, Release It! (2007, 2nd ed. 2018)`, `Martin Fowler, “CircuitBreaker” (2014)`, `Netflix Tech Blog — Hystrix (2012)`, `Resilience4j and Envoy documentation`]
},
{
  id:'bulkhead-fallback', title:'Bulkheads, fallbacks and graceful degradation', minutes:10, tags:['bulkhead','fallback','graceful degradation','isolation'],
  summary:'Bulkheads give each dependency its own capped resources so one slow dependency can’t drain them all. Fallbacks and graceful degradation keep the core experience working when parts fail.',
  problem:`<p>A shopping app’s home page calls Catalog, Recommendations and Offers from one 60-thread pool. Recommendations starts taking 6 seconds. At 40 calls/s it needs 240 threads, so it grabs all 60, and now even Catalog calls (perfectly healthy) wait for a free thread. Your <i>least</i> important feature has taken down your <i>most</i> important one.</p>`,
  intuition:`Ships are divided into watertight compartments (bulkheads). A hole floods one compartment, not the whole ship. A thali restaurant works the same way: if the dessert station runs out of gulab jamun, you still get the full meal, just without dessert (graceful degradation).`,
  how:{
    steps:[`Find the <b>critical path</b> (what must work: browse, pay) versus <b>optional</b> features (recommendations, reviews, “people also bought”).`, `Give each dependency its own <b>bounded resources</b>: a thread pool, a semaphore/concurrency limit, a connection pool, even separate instances or clusters for critical traffic.`, `Pair every bulkhead with a <b>timeout</b> so a stuck call releases its slot.`, `Define a <b>fallback</b> per dependency: cached/stale data, a static default, a simpler algorithm, an empty section, or a queued “we’ll do it later”.`, `Degrade <b>deliberately</b>: hide the widget, show “popular items” instead of personalised ones, switch video to lower quality, disable non-essential features with a kill switch.`],
    mount:host => bulkheadCalc(host),
    deep:`<p><b>Thread-pool vs semaphore bulkheads:</b> thread pools isolate completely (the caller’s thread is never blocked on the dependency) at the cost of context switches and a queue; semaphores just cap concurrent calls on the caller’s thread and are cheaper, but rely on timeouts to free slots. Hystrix defaulted to thread pools for network calls.</p><p><b>Bulkheads at bigger scale:</b> separate connection pools per downstream; separate worker pools per tenant tier; separate clusters for internal batch traffic vs user traffic; <i>cell-based architecture</i> (many independent copies of the full stack, each serving a subset of customers), which is a bulkhead for the whole system.</p><p><b>Fallback hygiene:</b> fallbacks must be cheap and local (in-memory cache, static default). A fallback that calls another remote service just moves the failure. Mark degraded responses (header/flag) so clients and dashboards know, and track the fallback rate as a metric with alerts.</p>`
  },
  tradeoffs:{use:[`Any service calling several dependencies of different importance`, `Multi-tenant systems where one tenant must not starve others`], avoid:[`Pools so small they throttle normal peaks; size them from rate × p99 latency`, `Silent fallbacks for money or correctness (showing a wrong balance as if it were real)`], alt:[`Async/queue-based integration`, `Cell-based architecture for whole-system isolation`, `Rate limiting per caller`]},
  real:[
    {co:'Netflix', tier:'confirmed', text:'Netflix’s API used per-dependency thread pools (bulkheads) and fallbacks such as returning non-personalised or cached data when a personalisation service failed, so the page still rendered.', src:'Netflix Tech Blog, “Making the Netflix API More Resilient” (2011); “Fault Tolerance in a High Volume, Distributed System” (2012)'},
    {co:'AWS cell-based architecture', tier:'confirmed', text:'AWS describes cells, independent full-stack copies each serving a slice of customers, as a way to contain the blast radius of failures and bad deployments.', src:'AWS Well-Architected — “Reducing the Scope of Impact with Cell-Based Architecture”'},
    {co:'Food-delivery app at peak', tier:'educational', text:'If the “personalised offers” service fails at dinner peak, the menu, cart and payment still work and the offers carousel shows generic offers or hides itself.', src:'Simplified educational design'}
  ],
  mistakes:[`One shared HTTP client pool for every downstream`, `Fallbacks that were never tested and throw in production`, `Degrading critical paths silently (stale prices, fake stock levels)`],
  interview:[`Separate critical and non-critical dependencies explicitly and give each a fallback`, `Mention bulkheads by thread pool/connection pool and by cell, plus timeouts`],
  tryit:{note:'Kill zones and slow down Recommendations, with and without timeouts, breakers and fallbacks:', pg:'chaos-monkey'},
  sources:[`Netflix Tech Blog (2011, 2012)`, `Nygard, Release It!`, `AWS Well-Architected — cell-based architecture`]
},
{
  id:'load-shedding', title:'Load shedding and admission control', minutes:10, tags:['load shedding','admission control','goodput','priority','overload'],
  summary:'When demand exceeds capacity, serving everyone slowly serves no one. Shedding excess load early, by priority, keeps goodput at capacity instead of collapsing.',
  problem:`<p>At 10:00 the train-ticket window opens and demand jumps to 3× capacity. The servers queue everything. Within seconds each request waits longer than the app’s timeout, so users give up and retry, and the server burns 100% CPU finishing requests nobody is waiting for. Throughput looks high on the dashboard while <b>useful</b> throughput drops to almost zero.</p>`,
  intuition:`A popular restaurant on a festival night. A smart host at the door says “sorry, 45-minute wait, try the takeaway counter” to new arrivals once the kitchen is full. A bad host seats everyone. The kitchen drowns, every table waits two hours, half the diners walk out after ordering, and food is cooked for empty chairs.`,
  how:{
    steps:[`Measure what saturates first (CPU, concurrency, queue wait time) and set a limit below the cliff.`, `<b>Reject early and cheaply</b> at the edge (load balancer, gateway, first middleware) with 429/503 + <code>Retry-After</code>, before doing expensive work.`, `<b>Bound queues</b> and drop requests whose deadline already passed (or that waited longer than the client timeout).`, `<b>Prioritise</b>: shed batch, prefetch and analytics before interactive requests; protect checkout and payments last.`, `Use <b>adaptive concurrency limits</b> (adjust the limit from observed latency) rather than static numbers that are wrong after every deploy.`],
    mount:host => sheddingChart(host),
    deep:`<p><b>Why goodput collapses:</b> with an unbounded FIFO queue at overload, the queue grows by (λ − μ) per second, so queueing delay grows without limit. Once delay exceeds the client timeout, all completed work is wasted, while retries add even more load. That is a <i>metastable failure</i>: the system stays broken even after the original trigger goes away, until load is cut.</p><p><b>Techniques:</b> token-bucket admission at the edge; concurrency limits per instance; CoDel-style queue management (drop when queue <i>wait</i> stays above a target); LIFO under overload (serve the newest request, whose client is still waiting); client-side throttling (Google SRE’s adaptive throttling rejects locally when its own accepted/requested ratio drops); criticality labels propagated with requests (Google uses CRITICAL_PLUS, CRITICAL, SHEDDABLE_PLUS, SHEDDABLE).</p><p><b>Cost of rejection:</b> a rejection must cost far less than serving. Do it before auth lookups, DB calls or deserialising large bodies.</p>`
  },
  tradeoffs:{use:[`Any service that can receive more than its capacity: flash sales, ticket windows, live events, retries after outages`], avoid:[`Shedding critical requests while serving optional ones (shed by priority)`, `Static limits never re-measured after changes`], alt:[`Autoscaling (too slow for sudden spikes, so combine both)`, `Virtual waiting rooms / queues for fairness`, `Backpressure in async pipelines`]},
  real:[
    {co:'Amazon', tier:'confirmed', text:'Amazon’s Builders’ Library explains that under overload a server should reject excess requests cheaply to keep goodput at capacity, and describes prioritising and bounding work.', src:'David Yanacek, “Using load shedding to avoid overload”, Amazon Builders’ Library'},
    {co:'Netflix', tier:'confirmed', text:'Netflix added prioritised load shedding to its Zuul API gateway so that, under stress, playback-critical requests are kept while lower-priority ones (like pre-fetch) are shed first.', src:'Netflix Tech Blog, “Keeping Netflix Reliable Using Prioritized Load Shedding” (2020)'},
    {co:'Google', tier:'confirmed', text:'Google’s SRE book describes per-request criticality, client-side adaptive throttling and per-customer limits for handling overload.', src:'Site Reliability Engineering, ch. 21 “Handling Overload”'}
  ],
  mistakes:[`Unbounded queues “so nothing is lost”`, `Rejecting after doing the expensive part of the work`, `Clients that retry rejections immediately (use Retry-After + jitter)`],
  interview:[`Explain goodput vs throughput and why queues must be bounded`, `Describe priority-based shedding at the gateway for a flash sale or Tatkal booking`],
  tryit:{note:'Drag the offered load past capacity and compare the two curves above. Then try it with queues in the async module’s backpressure demo.', quiz:[{q:'Throughput is 1,000 req/s at 100% CPU but users all see timeouts. What is happening?', options:['The DB is down', 'Goodput has collapsed: the server is finishing requests whose clients already gave up', 'DNS failure', 'Too much caching'], answer:1, why:'Queueing delay exceeds client timeouts; the completed work is wasted.'}], quizId:'rel-l4'},
  sources:[`Amazon Builders’ Library — load shedding`, `Netflix Tech Blog (2020)`, `Google SRE book, ch. 21`]
},
{
  id:'redundancy-failover', title:'Redundancy and failover: active-passive vs active-active', minutes:10, tags:['redundancy','failover','active-passive','active-active','N+1'],
  summary:'Redundancy removes single points of failure. Active-passive keeps an idle standby that takes over on failure; active-active runs every copy at once and just routes around failures, at the cost of capacity headroom and harder data consistency.',
  problem:`<p>Your payment-reconciliation database runs on one server. The disk controller dies on a Saturday night and nothing works until someone restores a backup on a new machine: four hours of downtime. A second copy would have taken over in about a minute. But which kind of copy, and who decides it should take over?</p>`,
  intuition:`A cricket team with a substitute fielder on the bench (active-passive): if someone is hurt, the sub runs on, after a short delay. Or two opening batters (active-active): both are already playing; if one gets out the other keeps scoring, but the team needed both to be good enough to carry the innings alone.`,
  how:{
    steps:[`<b>N+1 / N+2</b>: run at least one more instance than the load needs, so losing one (or one during a deploy) is invisible.`, `<b>Active-passive</b>: one primary serves traffic and a standby receives replicated state. A failure detector (health checks, heartbeats, a lease) notices the failure and <b>promotes</b> the standby; traffic is moved with a floating IP, DNS or a proxy.`, `<b>Active-active</b>: all nodes serve traffic behind a load balancer; on failure the LB simply stops routing to the dead node. Each node needs headroom to absorb its share of a lost peer’s load.`, `<b>Avoid split brain</b>: only one primary may accept writes. Use fencing tokens, leases or a consensus service (etcd, ZooKeeper) to decide who is primary.`, `<b>Test failover regularly</b>; an untested failover is a hope, not a plan.`],
    diagram:{title:'Active-passive database failover', w:780, h:250, alt:'An app writes to a primary database that replicates to a standby; when the primary dies the standby is promoted and the app reconnects.',
      nodes:[{id:'app', type:'service', label:'App servers', x:110, y:125, w:130}, {id:'px', type:'lb', label:'DB endpoint', sub:'DNS / VIP', x:300, y:125, w:130}, {id:'p', type:'db', label:'Primary', sub:'AZ-a', x:520, y:60, w:120}, {id:'s', type:'db', label:'Standby', sub:'AZ-b · sync replica', x:520, y:195, w:150}, {id:'mon', type:'ext', label:'Failure detector', sub:'heartbeats', x:710, y:125, w:130}],
      edges:[{from:'app', to:'px'}, {from:'px', to:'p'}, {from:'p', to:'s'}, {from:'mon', to:'p'}, {from:'mon', to:'s'}, {from:'px', to:'s', dashed:true}],
      steps:[
        {note:'Writes go to the primary, which <b>synchronously replicates</b> to a standby in another AZ before acknowledging.', flow:[['app', 'px', 'UPDATE'], ['px', 'p'], ['p', 's', 'replicate'], ['p', 'app', 'OK']]},
        {note:'The primary’s host dies. The detector misses 3 heartbeats (a few seconds).', status:{p:'down'}, flow:[['mon', 'p', '♥?']]},
        {note:'The detector <b>fences</b> the old primary (it can never accept writes again) and <b>promotes</b> the standby. The DB endpoint now points to it.', sub:{s:'AZ-b · PRIMARY', px:'→ AZ-b'}, hl:['s', 'px']},
        {note:'Apps reconnect (retry with backoff) and continue. Downtime is roughly detection + promotion + reconnection, typically about a minute for managed databases.', flow:[['app', 'px', 'retry'], ['px', 's'], ['s', 'app', 'OK']]}
      ]},
    mount:host => failoverCalc(host),
    deep:`<p><b>Detection is the hard part:</b> a node that is slow, partitioned or paused (GC, VM migration) looks dead. Promoting a new primary while the old one is still alive causes <i>split brain</i> (two writers, diverging data). Remedies: leases with expiry (the old primary steps down when its lease lapses), fencing tokens checked by storage, STONITH (power off the old node), and quorum-based election.</p><p><b>Sync vs async replication on failover:</b> with synchronous replication the standby has every acknowledged write (RPO = 0) but each write pays a cross-AZ round trip; with asynchronous replication failover can lose the last few seconds of writes. Many managed databases (e.g. Amazon RDS Multi-AZ) use a synchronous standby across AZs.</p><p><b>Active-active capacity math:</b> with N active nodes each must run at ≤ (N−1)/N of its capacity to survive one loss: 50% for 2 nodes, 67% for 3. With writes in multiple places you also need conflict handling (single-writer per key, CRDTs, or consensus).</p>`
  },
  tradeoffs:{use:[`Active-passive for stateful single-writer systems (relational DBs, schedulers) where simplicity matters`, `Active-active for stateless services and for globally read-heavy systems`], avoid:[`Active-active writes without a conflict strategy`, `Failover that has never been tested in production-like conditions`], alt:[`Consensus-replicated stores (Raft/Paxos) that elect leaders automatically`, `Cell-based architecture`, `Accepting downtime + good backups for non-critical systems`]},
  real:[
    {co:'Amazon RDS Multi-AZ', tier:'confirmed', text:'RDS Multi-AZ keeps a synchronous standby in another Availability Zone and fails over automatically by updating the DB endpoint’s DNS; AWS documents typical failover as completing within one to two minutes.', src:'Amazon RDS documentation — Multi-AZ deployments'},
    {co:'Netflix active-active', tier:'confirmed', text:'Netflix moved to an active-active architecture across multiple AWS regions so traffic can be shifted away from a failing region.', src:'Netflix Tech Blog, “Active-Active for Multi-Regional Resiliency” (2013)'},
    {co:'GitHub, October 2018', tier:'confirmed', text:'A 43-second network partition triggered a MySQL primary failover across data centres, leaving writes split between sites; reconciling them led to about 24 hours of degraded service. It is a public example of how hard failover and split brain are.', src:'GitHub Blog, “October 21 post-incident analysis” (2018)'}
  ],
  mistakes:[`Calling a hot standby that nobody has ever failed over to “redundancy”`, `No fencing, so the old primary keeps accepting writes after recovery`, `Active-active nodes running at 80% each (one failure overloads the rest)`],
  interview:[`Say how failure is detected, who decides, how split brain is prevented, and what RPO the replication mode gives`, `Do the headroom math for active-active`],
  tryit:{note:'Spot the setup:', mount:host => sortGame(host, [
    {t:'Two web servers behind a load balancer, both serving traffic', c:'aa', why:'Both active; LB routes around failures.'},
    {t:'Postgres primary with a streaming replica promoted by Patroni on failure', c:'ap', why:'Standby takes over only on failure.'},
    {t:'A DNS record switched to a DR region when the main region fails', c:'ap', why:'Traffic moves to an idle site.'},
    {t:'Three Cassandra nodes in different AZs all accepting reads and writes', c:'aa', why:'Leaderless; all serve.'},
    {t:'A cron scheduler with a lease: the backup node runs jobs only if the lease expires', c:'ap', why:'Single active holder, standby waits.'}
  ], [{id:'ap', label:'Active-passive'}, {id:'aa', label:'Active-active'}])},
  sources:[`Amazon RDS Multi-AZ documentation`, `Netflix Tech Blog (2013)`, `GitHub post-incident analysis (2018)`, `Kleppmann, Designing Data-Intensive Applications, ch. 5`]
},
{
  id:'multi-az-region', title:'Multi-AZ and multi-region deployments', minutes:11, tags:['availability zone','region','multi-region','blast radius','shuffle sharding'],
  summary:'Availability zones are separate data centres in one region with fast links; regions are far apart. Multi-AZ protects against data-centre failures cheaply; multi-region protects against regional disasters at a large cost in latency, consistency and complexity.',
  problem:`<p>Your app runs in one cloud region, all in one zone. A cooling failure takes that zone down for 3 hours. Next year you are multi-AZ and survive that easily, but then a region-wide control-plane outage stops you from launching new instances anywhere in the region. Each level of protection guards against a different, rarer failure, and costs more.</p>`,
  intuition:`A bank keeps its cash in three branch vaults across Bengaluru (zones): a fire in one branch doesn’t matter. But a city-wide flood (region) would hit all three, so it also keeps a reserve in Hyderabad. Moving money between Bengaluru branches is quick; moving it to Hyderabad takes much longer.`,
  how:{
    steps:[`<b>Zones (AZs)</b>: physically separate data centres (power, cooling, networking) within a region, connected by low-latency links of around a millisecond.`, `<b>Multi-AZ</b>: spread instances across ≥ 2–3 AZs behind a regional load balancer; replicate databases synchronously across AZs. This is the default for production.`, `<b>Regions</b>: geographically distant (e.g. Mumbai and Hyderabad), with round trips of tens to hundreds of milliseconds and independent control planes.`, `<b>Multi-region</b> options: backup/DR copy in another region; active-passive (standby region); active-active (users routed to nearest region; data partitioned by user/home region or replicated with conflict handling).`, `<b>Route traffic</b> with GeoDNS/anycast and health checks so you can evacuate a region quickly.`],
    diagram:{title:'Multi-AZ inside a region, plus a second region', w:800, h:280, alt:'Users reach a regional load balancer spanning three AZs; databases replicate across AZs and asynchronously to a second region.',
      nodes:[{id:'u', type:'client', label:'Users', x:70, y:140}, {id:'dns', type:'cdn', label:'GeoDNS', x:200, y:140}, {id:'lb', type:'lb', label:'Regional LB', sub:'Mumbai', x:350, y:80, w:120}, {id:'a', type:'service', label:'App AZ-a', x:520, y:30, w:110}, {id:'b', type:'service', label:'App AZ-b', x:520, y:90, w:110}, {id:'c', type:'service', label:'App AZ-c', x:520, y:150, w:110}, {id:'db', type:'db', label:'DB primary + sync standby', x:700, y:90, w:170}, {id:'r2', type:'db', label:'DR region', sub:'Hyderabad · async', x:700, y:230, w:150}],
      edges:[{from:'u', to:'dns'}, {from:'dns', to:'lb'}, {from:'lb', to:'a'}, {from:'lb', to:'b'}, {from:'lb', to:'c'}, {from:'a', to:'db'}, {from:'b', to:'db'}, {from:'c', to:'db'}, {from:'db', to:'r2', dashed:true}, {from:'dns', to:'r2', dashed:true}],
      steps:[
        {note:'Users resolve to the Mumbai region, and the load balancer spreads requests over three AZs.', flow:[['u', 'dns'], ['dns', 'lb'], ['lb', 'a'], ['lb', 'b'], ['lb', 'c']], parallel:false},
        {note:'<b>AZ-b fails.</b> Health checks remove it, and AZ-a and AZ-c absorb the load (they were sized for it).', status:{b:'down'}, flow:[['lb', 'a'], ['lb', 'c']], parallel:true},
        {note:'Data is also shipped <b>asynchronously</b> to Hyderabad: writes don’t wait for the long round trip, but a regional disaster may lose the last seconds.', flow:[['db', 'r2', 'async replication']]},
        {note:'If the whole region fails, GeoDNS sends users to Hyderabad after promotion: minutes of RTO and seconds of RPO.', status:{lb:'down', a:'down', c:'down', db:'down'}, flow:[['u', 'dns'], ['dns', 'r2', 'failover']]}
      ]},
    mount:host => topologyPicker(host),
    deep:`<p><b>Blast radius tools:</b> <i>cells</i> (independent stacks per customer slice), <i>shuffle sharding</i> (each customer gets a random small subset of workers, so a poison customer hurts few others; AWS Route 53 uses it), <i>static stability</i> (keep enough pre-provisioned capacity in each AZ so you don’t need the control plane to launch instances during an incident), and region-independent control planes.</p><p><b>Data across regions:</b> synchronous cross-region replication adds the inter-region RTT to every write. Options: home-region per user (writes go to the user’s home region; reads anywhere); conflict-free types (CRDTs); globally consistent databases (Spanner, CockroachDB) that pay latency for consistency; or async with a defined RPO.</p><p><b>Regulation:</b> data-residency rules (for example RBI’s directive that payment data be stored in India) constrain which regions you can use. A DR region may need to be in the same country.</p>`
  },
  tradeoffs:{use:[`Multi-AZ: essentially always for production`, `Multi-region: strict availability targets, regional disaster requirements, or global latency needs`], avoid:[`Multi-region active-active for a system that can’t tolerate write conflicts and hasn’t solved data replication`, `Hidden single-region dependencies (auth, DNS, config, CI) in a “multi-region” design`], alt:[`Multi-AZ plus solid backups for most workloads`, `Cell-based design inside one region`, `CDN/edge caching for global read latency`]},
  real:[
    {co:'AWS us-east-1, December 2021', tier:'confirmed', text:'An impaired internal network in us-east-1 affected many AWS services and customers for hours; AWS’s public summary describes how internal dependencies in one region widened the impact.', src:'AWS, “Summary of the AWS Service Event in the Northern Virginia (US-EAST-1) Region” (Dec 2021)'},
    {co:'Amazon S3, February 2017', tier:'confirmed', text:'A mistyped command during debugging removed more S3 capacity than intended in us-east-1, causing hours of disruption for many dependent services; AWS added safeguards to the tooling afterwards.', src:'AWS, “Summary of the Amazon S3 Service Disruption in the Northern Virginia (US-EAST-1) Region” (2017)'},
    {co:'AWS Route 53', tier:'confirmed', text:'Route 53 uses shuffle sharding to assign each customer’s domains to a small random combination of name servers, limiting how many customers any one overload affects.', src:'Colm MacCárthaigh, “Workload isolation using shuffle-sharding”, Amazon Builders’ Library'}
  ],
  mistakes:[`“Multi-region” that still depends on one region for auth, DNS or deployment`, `Not reserving capacity: during an AZ loss everybody tries to launch instances in the remaining AZs at once`, `Synchronous cross-region writes on the hot path without measuring the latency`],
  interview:[`Default to multi-AZ; justify multi-region with a requirement (RTO/RPO, regulation, latency)`, `Explain the data strategy for multi-region writes`],
  tryit:{note:'Set your requirements in the table above. Then classify:', quiz:[{q:'What does multi-AZ protect you from that a single AZ does not?', options:['A region-wide outage', 'A single data-centre power or cooling failure', 'A bad deploy rolled out everywhere', 'A bug in your code'], answer:1, why:'AZs are independent data centres within one region.'}, {q:'Your “multi-region” app still fails when region A is down because login is only in region A. This is…', options:['A hidden single point of failure', 'Shuffle sharding', 'Static stability', 'RPO'], answer:0, why:'A cross-region dependency re-creates a SPOF.'}], quizId:'rel-l6'},
  sources:[`AWS public post-event summaries (2017, 2021)`, `Amazon Builders’ Library — shuffle sharding; static stability`, `AWS Well-Architected Reliability Pillar`]
},
{
  id:'disaster-recovery', title:'Disaster recovery: RPO, RTO and the four strategies', minutes:11, tags:['disaster recovery','RPO','RTO','backup','pilot light','warm standby'],
  summary:'RPO is how much data you can lose; RTO is how long you can be down. Backup-and-restore, pilot light, warm standby and multi-site trade cost against those two numbers, and a backup is only real once a restore has been tested.',
  problem:`<p>An engineer runs a clean-up command against what they think is the replica, but it is the production database. Backups exist… in theory. The scheduled dumps have been silently failing for weeks, the snapshots are 24 hours old, and nobody has ever timed a restore. How much data is gone, and how long until customers are back? Those two questions are <b>RPO</b> and <b>RTO</b>, and you have to answer them <i>before</i> the disaster.</p>`,
  intuition:`Writing an important thesis. If you save to a pen drive once a day, a laptop crash loses up to a day’s work (RPO = 1 day), and buying a new laptop and setting it up takes a day (RTO). If you write in a synced cloud doc and keep a spare laptop ready, you lose seconds and are back in minutes, but you pay for the spare laptop.`,
  how:{
    steps:[`Agree <b>RPO</b> (max acceptable data loss, measured in time) and <b>RTO</b> (max acceptable downtime) per system with the business. A ledger needs RPO ≈ 0; a recommendations cache can be rebuilt.`, `<b>Backup & restore</b>: regular backups/snapshots + logs copied off-site/off-region; rebuild infra from code. Cheapest, with RTO in hours.`, `<b>Pilot light</b>: data continuously replicated to the DR region and core services on standby; app tier off or minimal, scaled up on failover. RTO tens of minutes.`, `<b>Warm standby</b>: a scaled-down but fully functional copy always running; scale up and switch traffic. RTO minutes.`, `<b>Multi-site active/active</b>: full capacity in several regions all the time. RTO ≈ seconds, highest cost.`, `<b>Test restores and run DR drills</b>: measure real RPO/RTO, keep runbooks, protect backups from deletion (immutable, separate accounts).`],
    mount:host => drPicker(host),
    deep:`<p><b>Point-in-time recovery:</b> combine a base snapshot with the write-ahead log (WAL/binlog) to restore to any second before the incident, which matters when the “disaster” is a bad command rather than a lost data centre. Replication alone does <i>not</i> protect against logical errors: a <code>DROP TABLE</code> replicates instantly. Keep delayed replicas or PITR backups.</p><p><b>3-2-1 rule:</b> 3 copies, on 2 kinds of media, 1 off-site; modern variants add 1 immutable/air-gapped copy (ransomware) and 0 unverified backups (every backup restore-tested).</p><p><b>RTO components:</b> detection + decision (often the slowest: who is allowed to declare a disaster?) + infrastructure + data restore (proportional to size: 10 TB at 500 MB/s ≈ 5.5 h) + validation + DNS/traffic switch. Measure each in drills.</p>`
  },
  tradeoffs:{use:[`Match the strategy to each system’s RPO/RTO; most companies mix them`, `Backup & restore for internal tools; warm standby or multi-site for payments and core APIs`], avoid:[`One strategy for everything (overpaying for analytics, under-protecting the ledger)`, `Backups in the same account/region with the same deletion permissions as production`], alt:[`Multi-AZ for data-centre failures (cheaper than multi-region DR)`, `Rebuildable/derived data that needs no backup at all`]},
  real:[
    {co:'AWS DR whitepaper', tier:'confirmed', text:'AWS’s “Disaster Recovery of Workloads on AWS” describes exactly four strategies, backup and restore, pilot light, warm standby and multi-site active/active, ordered by RPO/RTO and cost.', src:'AWS whitepaper, “Disaster Recovery of Workloads on AWS: Recovery in the Cloud”'},
    {co:'GitLab.com, January 2017', tier:'confirmed', text:'An engineer accidentally deleted data on the primary database; GitLab reported that several of its backup and replication mechanisms were not working as expected and around six hours of database data was lost. They live-streamed the recovery and published a detailed postmortem.', src:'GitLab blog, “Postmortem of database outage of January 31” (2017)'},
    {co:'Indian banks and payment systems', tier:'inference', text:'Regulated financial institutions are expected to maintain DR sites and run periodic DR drills; with data-residency rules, the DR site typically sits in another Indian region.', src:'Reasonable inference from RBI guidance on business continuity and data localisation'}
  ],
  mistakes:[`Never restoring a backup until the real disaster`, `Treating replication as backup (deletes replicate too)`, `RTO plans that assume key people are awake and reachable`],
  interview:[`State RPO/RTO targets first, then choose the strategy and explain replication mode and restore path`, `Mention PITR and immutable backups for logical errors and ransomware`],
  tryit:{note:'Put the recovery steps in order:', mount:host => orderGame(host, ['Detect the incident and declare a disaster', 'Stop writes to the damaged system (fence it)', 'Provision infrastructure in the recovery site from code', 'Restore the snapshot and replay logs to just before the incident', 'Validate data integrity and run smoke tests', 'Switch DNS/traffic to the recovered system', 'Write the postmortem and fix the gaps found'])},
  sources:[`AWS DR whitepaper`, `GitLab postmortem (2017)`, `AWS Well-Architected Reliability Pillar`]
},
{
  id:'chaos-engineering', title:'Chaos engineering', minutes:9, tags:['chaos engineering','Chaos Monkey','game day','fault injection','DiRT'],
  summary:'Chaos engineering is running controlled experiments that inject real failures, to prove the system tolerates them before an actual outage does it for you.',
  problem:`<p>Your design doc says “survives the loss of any instance or zone”. Nobody has ever tested it. The first real zone failure reveals that the failover script needs a credential stored in that zone, and the cache warm-up stampedes the database. Resilience you haven’t exercised is only a theory.</p>`,
  intuition:`Fire drills. A building with alarms, exits and extinguishers still runs drills, because only a drill shows that a door is locked, the alarm is too quiet, or nobody knows the assembly point. Chaos experiments are fire drills for software, run carefully and on purpose.`,
  how:{
    stepper:{title:'A chaos experiment, step by step', items:[
      {title:'Define steady state', tag:'metric', text:'Pick a business-level signal that means “working”: orders per minute, successful video starts, payment success rate. Not CPU.'},
      {title:'Form a hypothesis', tag:'hypothesis', text:'“If one payments instance is terminated, payment success rate stays above 99.9% and p99 latency below 800 ms.”'},
      {title:'Choose the fault', tag:'inject', text:'Real-world events: kill instances, kill an AZ, add latency, drop packets, fill disks, expire certificates, throttle a dependency, skew clocks.'},
      {title:'Limit the blast radius', tag:'safety', text:'Start in staging or with 1% of production traffic, during working hours, with a clear abort switch and on-call engineers watching.'},
      {title:'Run and observe', tag:'observe', text:'Compare the experiment group with a control group. Did steady state hold? Did alerts fire? Did dashboards show the cause?'},
      {title:'Learn and fix', tag:'fix', text:'Any deviation is a finding: a missing timeout, a broken fallback, an alert that didn’t fire. Fix it, then re-run.'},
      {title:'Automate', tag:'continuous', text:'Run experiments continuously (as Chaos Monkey does) so new code can’t quietly reintroduce the weakness.'}]},
    deep:`<p><b>Principles</b> (from Netflix’s “Principles of Chaos Engineering”): build a hypothesis around steady-state behaviour, vary real-world events, run experiments in production, automate them to run continuously, and minimise blast radius.</p><p><b>Escalation ladder:</b> unit-level fault injection in tests → staging game days → production experiments on a small cohort → zone evacuation drills → region evacuation (Netflix’s Chaos Kong). Each step needs the previous one to be routine.</p><p><b>Tools:</b> Chaos Monkey (instance termination), AWS Fault Injection Service, Gremlin, Chaos Mesh / LitmusChaos for Kubernetes, Toxiproxy for network faults in tests. <b>Game days</b> add people and process to the test: paging, runbooks, communication.</p>`
  },
  tradeoffs:{use:[`Systems that claim tolerance to instance, zone or dependency failures`, `Before major events (big sale, cricket final) to validate failover and capacity`], avoid:[`Production chaos without observability, abort switches or on-call coverage`, `Chaos as a stunt: experiments with no hypothesis and no follow-up fixes`], alt:[`Fault injection in integration tests`, `Tabletop exercises (walk through an incident on paper)`, `Load testing for capacity limits`]},
  real:[
    {co:'Netflix Chaos Monkey / Simian Army', tier:'confirmed', text:'Netflix built Chaos Monkey to randomly terminate production instances during business hours and later Chaos Gorilla (AZ) and Chaos Kong (region) exercises; it open-sourced Chaos Monkey.', src:'Netflix Tech Blog, “The Netflix Simian Army” (2011); Basiri et al., IEEE Software (2016)'},
    {co:'Google DiRT', tier:'confirmed', text:'Google’s Disaster Recovery Testing program runs company-wide exercises that deliberately disable systems, and sometimes people and offices, to test recovery.', src:'Kripa Krishnan, “Weathering the Unexpected”, ACM Queue (2012)'},
    {co:'AWS Fault Injection Service', tier:'confirmed', text:'A managed service for running fault-injection experiments (instance stops, latency, API errors, AZ power interruption scenarios) with stop conditions tied to CloudWatch alarms.', src:'AWS Fault Injection Service documentation'}
  ],
  mistakes:[`Starting with production-wide experiments`, `Measuring CPU instead of user-facing steady state`, `Finding weaknesses but never scheduling the fixes`],
  interview:[`Describe hypothesis → steady state → fault → blast radius → observe → fix`, `Mention game days before big events and continuous automated experiments`],
  tryit:{note:'Run your own chaos experiments on a small e-commerce system:', pg:'chaos-monkey'},
  sources:[`Netflix Tech Blog (2011)`, `Basiri et al., “Chaos Engineering”, IEEE Software 33(3), 2016`, `Principles of Chaos Engineering`, `Krishnan, ACM Queue (2012)`]
},
{
  id:'capacity-planning', title:'Capacity planning', minutes:11, tags:['capacity planning','load testing','headroom','Little’s law','forecast'],
  summary:'Capacity planning turns demand forecasts and measured per-instance limits into how many machines, databases and links you need, with headroom for zone loss, deploys, spikes and growth.',
  problem:`<p>Your food-delivery app handles 12,000 req/s at dinner on a normal day. Marketing plans a cricket-final promo that could triple it, and the business is growing 60% a year. How many servers do you need, and when? And which component fails first: app servers, the database, the cache, or the payment gateway’s rate limit?</p>`,
  intuition:`Planning a wedding feast. You estimate guests (forecast), know how many plates one cook can make per hour (load test), don’t schedule cooks at 100% (they’d fall behind with any extra guest), add a backup cook in case one falls sick (N+1), and check the gas cylinders and water, not just the cooks (every bottleneck).`,
  how:{
    steps:[`<b>Forecast demand</b>: today’s peak (not average) × organic growth × known events (sales, launches, festivals).`, `<b>Measure capacity</b> per instance with a <b>load test</b> to the knee of the latency curve, using realistic traffic mixes.`, `<b>Pick a target utilisation</b> (often 50–70% at peak): queueing delay grows as 1/(1 − ρ), so near 100% latency explodes.`, `<b>Add redundancy headroom</b>: survive losing one AZ (× N/(N−1)), plus capacity for deploys and failures.`, `<b>Check every resource</b>: DB connections and IOPS, cache memory, network bandwidth, third-party quotas, cloud account limits.`, `<b>Revisit</b> regularly and compare forecast with actual.`],
    mount:host => capacityCalc(host),
    deep:`<p><b>Little’s law</b> (L = λW) links concurrency, throughput and latency: at 2,000 req/s and 150 ms average latency, about 300 requests are in flight, which sizes thread pools and connection pools. <b>Queueing (M/M/1)</b>: mean response time = service time ÷ (1 − ρ). At ρ = 0.5 it’s 2×, at 0.9 it’s 10×, which is why target utilisation sits well below 100%.</p><p><b>Load-test well:</b> use production-like data volumes (caches warm and cold), real request mixes, and ramp until latency SLOs break, not just until errors appear. Re-run after major changes; capacity per instance changes with every release.</p><p><b>Lead time:</b> some capacity takes weeks or months (reserved instances, hardware, DB re-sharding, raising third-party limits), so forecasts must look ahead by at least that lead time.</p>`
  },
  tradeoffs:{use:[`Before launches, sales and live events; quarterly for steady growth`, `For slow-to-provision resources (databases, quotas, hardware)`], avoid:[`Sizing on average traffic`, `Assuming autoscaling removes the need to plan (it is bounded by quotas, warm-up and DB limits)`], alt:[`Autoscaling for elastic stateless tiers`, `Load shedding and waiting rooms when demand is unpredictable`, `Serverless for spiky, low-baseline workloads`]},
  real:[
    {co:'Disney+ Hotstar', tier:'confirmed', text:'Hotstar publicly reported a then-record of about 25 million concurrent viewers during the 2019 Cricket World Cup India–New Zealand semi-final, a scale that requires capacity to be planned well ahead of the match.', src:'Hotstar public announcements and engineering talks (2019)'},
    {co:'Google SRE', tier:'confirmed', text:'Google’s SRE practice treats demand forecasting and capacity planning, including N+2 provisioning and load-testing, as SRE responsibilities.', src:'Site Reliability Engineering (2016), ch. 1 and related chapters'},
    {co:'Ticketing at a 10:00 window', tier:'educational', text:'For a booking window, plan for the first minutes’ peak, which can be many times the daily average, not the hourly average, and combine capacity with queueing/waiting rooms.', src:'Simplified educational design'}
  ],
  mistakes:[`Planning only app servers while the DB or a third-party quota is the real limit`, `Targeting 90% utilisation “to save money” (no room for spikes or zone loss)`, `Load tests with tiny datasets and fully warm caches`],
  interview:[`Show the math: peak × growth ÷ (per-instance max × target) × N/(N−1)`, `Name the first bottleneck and how you’d find it (load test)`],
  tryit:{note:'Use the calculator above, then check yourself:', quiz:[{q:'An instance handles 1,000 req/s at its knee. You target 60% and run in 3 AZs that must survive one AZ loss. Peak is 30,000 req/s. How many instances?', options:['30', '50', '75', '90'], answer:2, why:'30,000 ÷ 600 = 50; × 3/2 = 75.'}, {q:'Why not run servers at 95% CPU at peak?', options:['Billing rules', 'Queueing delay explodes near 100% utilisation, and there is no headroom for failures or spikes', 'CPUs overheat', 'It is fine'], answer:1, why:'Response time ∝ 1/(1 − ρ).'}], quizId:'rel-l9'},
  sources:[`Google SRE book`, `Little, “A proof for the queuing formula L = λW” (1961)`, `Gunther, Guerrilla Capacity Planning`]
},
{
  id:'autoscaling', title:'Autoscaling', minutes:11, tags:['autoscaling','HPA','target tracking','predictive scaling','warm-up','cooldown'],
  summary:'Autoscaling adds and removes capacity automatically from a metric. Target tracking is the default, but reactive scaling lags behind sudden spikes, so combine it with scheduled or predictive scaling, warm pools and load shedding.',
  problem:`<p>Your servers sit 80% idle at 4 AM and melt at 9 PM. Paying for peak capacity all day wastes money; paying only for the average loses the dinner rush. Autoscaling seems like the answer, until the flash sale at 12:00 sharp: the CPU alarm fires at 12:01, new instances are ready at 12:06, and the sale is over by then.</p>`,
  intuition:`A metro running extra trains. On weekdays more trains run at rush hour because everyone knows it is coming (scheduled). If a stadium event ends suddenly, the controller sees crowds on the platform and sends more trains, but each needs a few minutes to arrive (reactive warm-up). For an IPL final you plan extra trains in advance.`,
  how:{
    steps:[`Choose a metric that tracks load: CPU, requests per target, queue depth or lag, concurrency, or a custom business metric.`, `<b>Target tracking</b>: keep the metric near a target (e.g. 60% CPU). Kubernetes HPA computes <code>desired = ⌈current × metric ÷ target⌉</code>.`, `<b>Step scaling</b>: add or remove fixed amounts when alarms cross thresholds.`, `<b>Scheduled scaling</b> for known events; <b>predictive scaling</b> forecasts recurring patterns from history.`, `Handle <b>warm-up</b> (boot, JIT, cache fill, readiness checks) and <b>stabilisation/cooldown</b> windows so you don’t flap.`, `Set <b>min/max</b> limits, check quotas and downstream limits (the DB doesn’t autoscale with your pods), and keep load shedding as a backstop.`],
    diagram:{title:'Kubernetes autoscaling loop', w:780, h:250, alt:'Metrics server reports pod CPU to the HPA, which updates the Deployment; the cluster autoscaler adds nodes when pods are pending.',
      nodes:[{id:'lb', type:'lb', label:'Service', x:90, y:125}, {id:'pods', type:'service', label:'Pods (Deployment)', sub:'4 → 7 replicas', x:290, y:125, w:160}, {id:'ms', type:'ext', label:'Metrics server', x:500, y:50, w:130}, {id:'hpa', type:'service', label:'HPA controller', sub:'target 60% CPU', x:500, y:200, w:150}, {id:'ca', type:'ext', label:'Cluster autoscaler', sub:'adds nodes', x:700, y:125, w:140}],
      edges:[{from:'lb', to:'pods'}, {from:'pods', to:'ms'}, {from:'ms', to:'hpa'}, {from:'hpa', to:'pods'}, {from:'pods', to:'ca', dashed:true}],
      steps:[
        {note:'Traffic rises and the 4 pods average <b>95% CPU</b>.', flow:[['lb', 'pods', 'traffic ↑']], status:{pods:'hot'}},
        {note:'Every 15 s the HPA reads metrics: ⌈4 × 95 ÷ 60⌉ = <b>7 replicas</b>.', flow:[['pods', 'ms', 'cpu'], ['ms', 'hpa', '95%']], hl:['hpa']},
        {note:'The HPA updates the Deployment. Three new pods are <b>Pending</b> because there is no room on the nodes, so the cluster autoscaler adds a node (minutes).', flow:[['hpa', 'pods', 'replicas=7'], ['pods', 'ca', 'pending pods']], hl:['ca']},
        {note:'Pods boot and pass readiness checks, then the Service routes to them and CPU settles near 60%. Scale-down waits for a 5-minute stabilisation window.', status:{pods:'ok'}, sub:{pods:'7 replicas · 58% CPU'}, flow:[['lb', 'pods']]}
      ]},
    mount:host => hpaCalc(host),
    deep:`<p><b>The lag budget:</b> metric collection interval + evaluation period + decision + instance launch + boot + app warm-up + readiness + LB registration. For VMs this is often minutes; for containers on existing nodes, seconds; if new nodes are needed, minutes again. Spikes faster than this budget need pre-scaling, warm pools (pre-initialised stopped instances) or over-provisioning (placeholder low-priority pods).</p><p><b>Picking metrics:</b> CPU is easy but poor for I/O-bound services; requests-per-target or concurrency track load more directly; for consumers, scale on <i>queue lag</i> (KEDA does this for Kafka, SQS and others). Avoid scaling on latency alone: latency also rises when a <i>dependency</i> is slow, and adding pods then just adds load to it.</p><p><b>Scale-in safety:</b> drain connections (deregistration delay), finish in-flight jobs, and use stabilisation windows. The HPA’s default scale-down stabilisation is 300 s.</p>`
  },
  tradeoffs:{use:[`Stateless tiers with daily/weekly variation`, `Queue consumers scaled on lag`], avoid:[`Relying on reactive scaling for known sharp spikes (sales, 10:00 windows, match start)`, `Autoscaling a stateful DB tier the same way as stateless pods`], alt:[`Scheduled/predictive scaling`, `Serverless (scales per request, with cold starts and limits)`, `Fixed over-provisioning for small or critical systems`]},
  real:[
    {co:'Kubernetes HPA', tier:'confirmed', text:'The HPA scales replicas with desired = ceil(current × currentMetric ÷ targetMetric), with a default tolerance of 10% and a configurable stabilisation window (300 s by default for scale-down).', src:'Kubernetes documentation — Horizontal Pod Autoscaling'},
    {co:'AWS predictive scaling', tier:'confirmed', text:'EC2 Auto Scaling’s predictive scaling uses historical load to forecast daily and weekly patterns and launches capacity ahead of time.', src:'Amazon EC2 Auto Scaling documentation'},
    {co:'Live cricket streaming', tier:'inference', text:'Concurrency can jump by millions within minutes (toss, a star batter walking in), faster than reactive scaling can respond, so streaming platforms plan and pre-provision for forecast peaks and keep reactive scaling as a safety net.', src:'Reasonable inference from public talks on live-event streaming at scale'}
  ],
  mistakes:[`Scaling the app tier until the database falls over`, `No max limit (a bug or attack becomes a giant bill)`, `Scale-in killing instances mid-request (no draining)`],
  interview:[`State the metric, target, min/max, warm-up and cooldown, and what you do for predictable spikes`, `Mention that the DB and third-party limits don’t scale with your pods`],
  tryit:{note:'Run a day of traffic and compare policies (try the 10:00 booking window):', pg:'autoscaling'},
  sources:[`Kubernetes HPA documentation`, `Amazon EC2 Auto Scaling documentation`, `KEDA documentation`]
}
];

SDA.register({
  kind:'module', id:'reliability', order:9, level:'advanced', icon:'🛡️', title:'Reliability',
  summary:'Timeouts, retries with backoff and jitter, circuit breakers, bulkheads, fallbacks and load shedding; redundancy and failover; multi-AZ and multi-region; disaster recovery (RPO/RTO); chaos engineering; capacity planning; autoscaling.',
  outcomes:['Configure timeouts, retries, backoff and jitter without causing retry storms', 'Contain failures with circuit breakers, bulkheads, fallbacks and load shedding', 'Choose active-passive vs active-active and multi-AZ vs multi-region with the cost and consistency trade-offs', 'Set RPO/RTO and pick a DR strategy, then prove it with drills and chaos experiments', 'Plan capacity with headroom and design autoscaling that handles real spikes'],
  lessons,
  quiz:[
    {q:'Four service layers each retry 3 times. Worst case, how many calls can one user request cause at the bottom layer?', options:['4', '12', '64', '256'], answer:3, why:'(3 + 1)^4 = 256. Retry at one layer only.'},
    {q:'Why add jitter to exponential backoff?', options:['To make retries faster', 'To de-synchronise clients that failed at the same time', 'To encrypt retries', 'To skip the timeout'], answer:1, why:'Without jitter they retry in synchronised waves.'},
    {q:'A circuit breaker is OPEN. What happens to a new call?', options:['It waits for the dependency', 'It fails fast (or gets a fallback) without calling the dependency', 'It is queued', 'It is retried 3 times'], answer:1, why:'That is the point of the open state.'},
    {q:'What moves a breaker from HALF-OPEN to CLOSED?', options:['A timer', 'The configured number of probe calls succeeding', 'Any single error', 'A deploy'], answer:1, why:'Probes test recovery.'},
    {q:'One slow optional dependency exhausts a shared thread pool and breaks checkout. The pattern that prevents this is…', options:['Sharding', 'Bulkheads (separate pools per dependency)', 'CDN', 'Bigger timeouts'], answer:1, why:'Isolate resources per dependency.'},
    {q:'Under 3× overload with an unbounded FIFO queue, goodput…', options:['Triples', 'Stays at capacity', 'Collapses toward zero as queueing delay exceeds client timeouts', 'Is unaffected'], answer:2, why:'The server finishes work nobody is waiting for.'},
    {q:'Your ledger must lose at most 0 seconds of data and recover in 1 minute. Which DR strategy?', options:['Backup & restore', 'Pilot light', 'Warm standby with async replication', 'Multi-site active/active with synchronous (or consensus) replication'], answer:3, why:'RPO≈0 and RTO≈1 min need full, synchronously replicated capacity.'},
    {q:'Replication to a standby protects against which of these?', options:['An accidental DELETE (it replicates too)', 'Losing the primary’s hardware', 'Ransomware encryption of data', 'A bad migration'], answer:1, why:'Logical errors replicate; use PITR/backups for those.'},
    {q:'Three active nodes must survive losing one. Max safe utilisation per node at peak?', options:['33%', '~67%', '90%', '100%'], answer:1, why:'(N−1)/N = 2/3.'},
    {q:'Reactive autoscaling alone is a poor fit for…', options:['Slow daily growth', 'A booking window that opens at exactly 10:00', 'Gradual afternoon traffic', 'Batch jobs at night'], answer:1, why:'Warm-up lag; use scheduled/predictive pre-scaling.'},
    {q:'The first step of a chaos experiment is…', options:['Kill production', 'Define a steady-state metric and a hypothesis', 'Buy a tool', 'Disable alerts'], answer:1, why:'Experiments need a hypothesis about user-visible behaviour.'},
    {type:'scenario', q:'A payment service depends on a bank gateway that occasionally slows to 20 s. Design the client-side resilience.', answer:'<ul><li><b>Timeout</b> ~2–3 s (from the gateway’s p99.9), within the user deadline; propagate deadlines.</li><li><b>Idempotency key</b> per payment attempt; retry only retryable errors, once, with jittered backoff; then query status instead of re-charging.</li><li><b>Circuit breaker</b> per gateway (failure + slow-call rate); when open, route to a secondary gateway or show “bank is slow, try UPI/another bank”.</li><li><b>Bulkhead</b>: separate connection pool per gateway so one slow bank can’t starve others.</li><li><b>Async reconciliation</b>: pending payments resolved by a background job polling status; never show success until confirmed.</li><li>Metrics: success rate per bank, breaker state, timeout rate; alert on SLO burn.</li></ul>'},
    {type:'scenario', q:'Your e-commerce site must stay up during a mega sale at 12:00 with 10× normal traffic. Plan reliability and capacity.', answer:'<ol><li><b>Forecast</b> the peak from past sales and marketing; load-test the full path to find the first bottleneck (DB, inventory, payment quotas).</li><li><b>Pre-scale</b> (scheduled) app tiers and caches before 11:30; raise cloud quotas and payment-provider limits in advance; warm caches.</li><li><b>Protect the core</b>: bulkheads and breakers around optional features (recommendations, reviews), with kill switches to disable them.</li><li><b>Admission control</b>: a waiting room / token bucket at the edge; priority shedding (checkout > browse > analytics).</li><li><b>Inventory correctness</b>: atomic decrements or reservations with TTL; idempotent order creation.</li><li><b>Game day</b> a week before: kill an AZ, slow the payment gateway, check alerts and runbooks; war-room on the day.</li></ol>'}
  ],
  cheatsheet:[
    {h:'⏱ Timeouts & retries', items:['Timeout every remote call (≈ p99.9 + headroom)', 'Propagate deadlines down the stack', 'Retry only transient errors and idempotent operations', 'Capped exponential backoff + full jitter', 'Max 2–3 attempts, retry budget ≤ 10%, retry at ONE layer']},
    {h:'🔌 Circuit breaker', items:['Closed → (failure rate ≥ threshold, ≥ min calls) → Open', 'Open: fail fast + fallback', 'After open duration → Half-open probes', 'Probes OK → Closed; probe fails → Open', 'Count timeouts and slow calls; ignore 4xx']},
    {h:'🧱 Isolation', items:['Bulkheads: pool per dependency/tenant', 'Fallbacks: cache, default, hide feature', 'Degrade optional features first', 'Cells and shuffle sharding limit blast radius']},
    {h:'🚦 Overload', items:['Goodput ≠ throughput', 'Bounded queues; drop expired requests', 'Shed early, cheaply, by priority', 'Adaptive concurrency limits; 429 + Retry-After']},
    {h:'🌍 Redundancy & DR', items:['N+1/N+2; active-active headroom (N−1)/N', 'Failover = detect + fence + promote + reroute', 'Multi-AZ by default; multi-region for a reason', 'RPO = data loss, RTO = downtime', 'Backup/restore → pilot light → warm standby → multi-site', 'Replication ≠ backup; test restores']},
    {h:'📈 Capacity & scaling', items:['Size for peak × growth, target 50–70% util', 'Survive AZ loss: × N/(N−1)', 'Little’s law L = λW sizes pools', 'HPA: ⌈current × metric ÷ target⌉', 'Pre-scale known spikes; reactive is late', 'Chaos: hypothesis, small blast radius, automate']}
  ],
  glossary:[
    {term:'Timeout', aka:['timeouts'], def:'The maximum time a caller waits for a response before giving up.'},
    {term:'Deadline propagation', aka:['deadline'], def:'Passing a request’s remaining time budget to downstream calls so none outlive the original request.'},
    {term:'Retry', aka:['retries'], def:'Re-sending a failed request, appropriate only for transient failures and idempotent operations.'},
    {term:'Exponential backoff', aka:['backoff'], def:'Increasing the wait between retries exponentially (base × 2ᵏ), usually capped.'},
    {term:'Jitter', aka:['full jitter', 'decorrelated jitter'], def:'Randomising retry delays so clients that failed together do not retry together.'},
    {term:'Retry budget', def:'A limit on retries relative to normal traffic (e.g. ≤ 10%) to prevent retry amplification.'},
    {term:'Retry storm', aka:['retry amplification'], def:'A surge of load caused by many clients retrying at once, often making an outage worse.'},
    {term:'Circuit breaker', def:'A component that stops calling a failing dependency (open), fails fast, and probes for recovery (half-open).'},
    {term:'Half-open', def:'The circuit-breaker state that allows a few probe calls to test whether a dependency has recovered.'},
    {term:'Fail fast', def:'Returning an error immediately rather than waiting on a call that is likely to fail.'},
    {term:'Bulkhead', aka:['bulkheads'], def:'Isolating resources (threads, connections, instances) per dependency or tenant so one failure cannot exhaust them all.'},
    {term:'Fallback', aka:['fallbacks'], def:'An alternative response (cached, default or simplified) used when a dependency fails.'},
    {term:'Graceful degradation', def:'Continuing to serve core functionality with reduced features when parts of the system fail.'},
    {term:'Goodput', def:'The rate of useful, successfully delivered work, as opposed to raw throughput.'},
    {term:'Admission control', def:'Deciding at the entry point which requests to accept so the system stays within capacity.'},
    {term:'Metastable failure', def:'A failure state that sustains itself (e.g. through retries) even after the original trigger disappears.'},
    {term:'Active-passive', aka:['hot standby', 'standby'], def:'Redundancy where a standby takes over only when the active node fails.'},
    {term:'Active-active', def:'Redundancy where all copies serve traffic simultaneously.'},
    {term:'N+1 redundancy', aka:['N+1', 'N+2'], def:'Provisioning one (or two) more units than the load needs, so a failure is absorbed.'},
    {term:'Fencing', def:'Preventing a deposed node from making further changes, e.g. with fencing tokens or by powering it off.'},
    {term:'Availability zone', aka:['AZ', 'AZs', 'availability zones'], def:'An isolated data centre (or group) within a cloud region with independent power and networking.'},
    {term:'Region', aka:['regions', 'cloud region'], def:'A geographic area containing multiple availability zones.'},
    {term:'Multi-region', def:'Running a system across more than one cloud region for resilience or latency.'},
    {term:'Cell-based architecture', aka:['cell-based'], def:'Splitting a system into independent full-stack copies, each serving a subset of users, to limit blast radius.'},
    {term:'Shuffle sharding', def:'Giving each customer a random small subset of resources so failures caused by one customer affect few others.'},
    {term:'Static stability', def:'Designing so that a system keeps working through a failure without needing to make changes (like launching instances).'},
    {term:'Disaster recovery', aka:['DR'], def:'Plans and systems for restoring service after a major failure or disaster.'},
    {term:'RPO', aka:['recovery point objective'], def:'The maximum acceptable amount of data loss, measured as time before the incident.'},
    {term:'RTO', aka:['recovery time objective'], def:'The maximum acceptable time to restore service after an incident.'},
    {term:'Pilot light', def:'A DR strategy with data replicated and core infrastructure idle in a recovery region, scaled up on failover.'},
    {term:'Warm standby', def:'A DR strategy keeping a scaled-down, fully working copy running in another region.'},
    {term:'Point-in-time recovery', aka:['PITR'], def:'Restoring a database to any moment by replaying logs on top of a base backup.'},
    {term:'Chaos engineering', def:'Running controlled experiments that inject failures to build confidence in a system’s resilience.'},
    {term:'Chaos Monkey', def:'Netflix’s tool that randomly terminates production instances to ensure services tolerate instance loss.'},
    {term:'Game day', aka:['game days'], def:'A planned exercise where teams simulate failures and practise incident response.'},
    {term:'Steady state', def:'A measurable signal of normal system behaviour used as the baseline in chaos experiments.'},
    {term:'Capacity planning', def:'Forecasting demand and provisioning enough resources, with headroom, to meet it.'},
    {term:'Load testing', aka:['load test'], def:'Driving controlled traffic at a system to measure its capacity and behaviour under load.'},
    {term:'Headroom', def:'Spare capacity kept above expected peak to absorb spikes, failures and deploys.'},
    {term:'Autoscaling', aka:['auto scaling', 'autoscaler'], def:'Automatically adjusting capacity based on a metric or schedule.'},
    {term:'Target tracking', def:'An autoscaling policy that adjusts capacity to keep a metric near a target value.'},
    {term:'Predictive scaling', def:'Scaling ahead of time using forecasts from historical load patterns.'},
    {term:'Horizontal Pod Autoscaler', aka:['HPA'], def:'The Kubernetes controller that scales a workload’s replicas based on metrics.'},
    {term:'Warm-up', aka:['warm up'], def:'The time a new instance needs before it can serve traffic at full capacity.'},
    {term:'Cooldown', aka:['stabilization window', 'stabilisation window'], def:'A waiting period after a scaling action (or before scale-in) to avoid flapping.'}
  ],
  sources:['Nygard, Release It! (2nd ed., 2018)', 'Beyer et al., Site Reliability Engineering (2016), ch. 21–22', 'Amazon Builders’ Library: timeouts/retries/jitter; load shedding; shuffle sharding; static stability', 'AWS whitepaper — Disaster Recovery of Workloads on AWS; AWS Well-Architected Reliability Pillar', 'Netflix Tech Blog: Hystrix (2012), Simian Army (2011), Active-Active (2013), Prioritized Load Shedding (2020)', 'Basiri et al., “Chaos Engineering”, IEEE Software (2016); Krishnan, “Weathering the Unexpected”, ACM Queue (2012)', 'Public postmortems: AWS S3 (2017), AWS us-east-1 (2021), GitLab (2017), GitHub (2018)', 'Kubernetes HPA and AWS EC2 Auto Scaling documentation']
});
} catch(e){ console.error('[SDA] module reliability', e); SDA.errors.push({id:'reliability', error:e}); }
})();
