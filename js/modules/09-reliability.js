/* =====================================================================
   PART 6 · MODULE 9 — RELIABILITY
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, esc, clamp, fmtNum, fmtDur} = SDA.u; const ui = SDA.ui;
const {sortGame, lineChart} = SDA.m1helpers; const {css, frag} = SDA.ph;
const pct = (v, d) => (v * 100).toFixed(d == null ? 2 : d) + '%';
const downtime = a => fmtDur((1 - a) * 365.25 * 24 * 3600 * 1000) + '/yr';

/* ---------- widgets ---------- */
function amplificationCalc(host){
  const P = {layers:4, retries:3, where:'every'}; const out = el('div');
  function run(){
    const total = P.where === 'every' ? Math.pow(P.retries + 1, P.layers) : (P.retries + 1);
    const rows = []; for (let i = 1; i <= P.layers; i++){ const calls = P.where === 'every' ? Math.pow(P.retries + 1, i) : (i === 1 ? P.retries + 1 : P.retries + 1); rows.push([`Layer ${i}${i === P.layers ? ' (the struggling vehicle feed)' : ''}`, fmtNum(calls)]); }
    out.innerHTML = '';
    out.append(frag(h.table(['Layer', 'Calls from one rider request in the worst case'], rows, [1])));
    out.append(el('div', {class:'verdict ' + (total > 20 ? 'bad' : total > 4 ? 'warn' : 'ok')}, P.where === 'every'
      ? `With ${P.retries} retries at each of ${P.layers} layers, one arrival check can cause up to ${fmtNum(total)} vehicle-feed calls. The feed is already struggling.`
      : `Retrying at one layer limits this arrival check to ${P.retries + 1} feed calls.`));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Service layers in the call chain', min:1, max:6, value:P.layers, fmt:v => String(v), onInput:v => { P.layers = v; run(); }}).el,
    ui.slider({label:'Retries per layer', min:0, max:5, value:P.retries, fmt:v => String(v), onInput:v => { P.retries = v; run(); }}).el,
    ui.select({label:'Who retries?', value:'every', options:[['every', 'Every layer retries'], ['edge', 'Only one layer retries; others fail fast']], onChange:v => { P.where = v; run(); }}).el), out);
  run();
}
function bulkheadCalc(host){
  const DEPS = [{id:'pay', name:'Live arrivals', rate:20, lat:.08}, {id:'rec', name:'Route tips', rate:40, lat:.06}, {id:'cat', name:'Stop details', rate:60, lat:.05}];
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
    out.append(frag(h.table(['Stop-page part', 'Threads needed (rate × time)', 'Threads available', 'Live successes', 'Riders served with fallback'], res, [1, 3, 4])));
    const vi = P.slow === 'pay' ? 2 : 0; const victim = DEPS[vi].name; const payOk = parseFloat(res[vi][3]);
    out.append(el('div', {class:'verdict ' + (payOk < 99 ? 'bad' : 'ok')}, P.mode === 'shared'
      ? (payOk < 99 ? `One slow dependency needs ${need[DEPS.findIndex(d => d.id === P.slow)].toFixed(0)} threads and eats the shared pool of ${POOL}. ${victim}, which is perfectly healthy, now succeeds only ${payOk}% of the time. That is a cascading failure.` : P.slow === 'none' ? 'Everything is healthy: all three together need only a few threads.' : 'At this short timeout the slow calls give their threads back quickly, so the shared pool still has room. Raise the timeout and watch the slow dependency swallow the pool.')
      : P.slow === 'none' ? 'All three stop-page parts have room.' : P.slow === 'pay' ? `Live arrivals are slow, so their own ${share.pay} threads fill. Stop details and route tips keep their slots.` : `The slow part can use only its own ${share[P.slow]} threads. ${victim} and the other part keep their slots.`));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.select({label:'Thread pools', value:'shared', options:[['shared', 'One shared pool (60 threads)'], ['bulkhead', 'Bulkheads: 20 / 15 / 25 per dependency']], onChange:v => { P.mode = v; run(); }}).el,
    ui.select({label:'Which stop-page part is slow?', value:'rec', options:[['rec', 'Route tips'], ['cat', 'Stop details'], ['pay', 'Live arrivals'], ['none', 'None']], onChange:v => { P.slow = v; run(); }}).el,
    ui.slider({label:'Call timeout', min:.2, max:6, step:.1, value:P.timeout, fmt:v => v.toFixed(1) + ' s', onInput:v => { P.timeout = v; run(); }}).el,
    ui.toggle({label:'Fallback for the slow dependency', checked:true, onChange:v => { P.fallback = v; run(); }}).el), out,
    el('p', {class:'lab-hint'}, 'Busy threads equal calls per second times the time each call holds a thread. Live arrivals receive 20 calls each second, route tips 40, and stop details 60. Healthy calls take about 50 to 80 milliseconds.'));
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
      <text x="${(W + L) / 2}" y="${H - 6}" text-anchor="middle">arrival requests each second, capacity 1,000</text><text x="14" y="${(H - Bt + T) / 2}" text-anchor="middle" transform="rotate(-90 14 ${(H - Bt + T) / 2})">goodput (useful req/s)</text>
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
    el('p', {class:'lab-hint'}, 'These are sample comparison values for the transit app. A second region costs more and can add delay to every route edit if writes wait for a distant copy.'));
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
function recoveryOrderGame(host, items){
  let next = 0;
  const status = el('div', {class:'verdict warn', role:'status'});
  const pool = el('div', {class:'pill-row'});
  const placed = el('ol', {class:'steps', style:{marginTop:'12px'}});
  const reset = () => {
    next = 0; placed.innerHTML = ''; pool.innerHTML = '';
    status.className = 'verdict warn';
    status.textContent = 'Choose the recovery steps in order, starting with step 1.';
    SDA.u.shuffle(items.map((_, i) => i)).forEach(i => {
      const button = ui.button(esc(items[i]), () => {
        if (i === next){
          button.remove(); placed.append(el('li', null, items[i])); next++;
          status.className = next === items.length ? 'verdict ok' : 'verdict warn';
          status.textContent = next === items.length
            ? 'All recovery steps are in order. A real drill should time the restore and check the route data.'
            : `Correct. Choose step ${next + 1}.`;
        } else {
          status.className = 'verdict bad';
          status.textContent = `That step comes later. Choose step ${next + 1} first.`;
        }
      }, 'sm');
      pool.append(button);
    });
  };
  host.append(status, el('div', {style:{height:'10px'}}), pool, placed, el('div', {class:'row', style:{marginTop:'6px'}}, ui.button('↺ Shuffle again', reset, 'sm ghost')));
  reset();
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
${P.zones > 1 ? `Survive losing 1 of ${P.zones} zones → × ${P.zones}/${P.zones - 1} = ${survive} instances (${Math.ceil(survive / P.zones)} per zone)` : 'One zone cannot survive losing its only zone. Add another zone for zone-level resilience.'}`)));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Today’s peak arrival requests', min:500, max:100000, step:500, value:P.peak, fmt:v => fmtNum(v) + ' req/s', onInput:v => { P.peak = v; run(); }}).el,
    ui.slider({label:'Growth per year', min:0, max:300, step:5, value:P.growth, fmt:v => v + '%', onInput:v => { P.growth = v; run(); }}).el,
    ui.slider({label:'Planning horizon', min:1, max:24, value:P.months, fmt:v => v + ' months', onInput:v => { P.months = v; run(); }}).el,
    ui.slider({label:'Max per instance (from load test)', min:100, max:5000, step:50, value:P.perInst, fmt:v => fmtNum(v) + ' req/s', onInput:v => { P.perInst = v; run(); }}).el,
    ui.slider({label:'Target utilisation at peak', min:30, max:90, step:5, value:P.target, fmt:v => v + '%', onInput:v => { P.target = v; run(); }}).el,
    ui.slider({label:'Availability zones', min:1, max:4, value:P.zones, fmt:v => String(v), onInput:v => { P.zones = v; run(); }}).el), out, chartHost);
  const ch = lineChart(chartHost, {label:'Queueing delay grows as utilisation approaches 100%', xMin:0, xMax:.97, yMax:20, fn:r => 1 / (1 - r), xTicks:[0, .25, .5, .7, .9], xFmt:v => Math.round(v * 100) + '%', yTicks:[1, 5, 10, 20], yFmt:v => v + '×', xLabel:'utilisation ρ', yLabel:'response time ÷ service time', color:'var(--accent2)'});
  ch.set(.6, '60% → 2.5×'); run();
}
function hpaCalc(host){
  const P = {cur:4, util:95, target:60, min:2, max:20}; const out = el('div');
  function run(){
    const raw = P.cur * P.util / P.target; const ratio = P.util / P.target; const tol = Math.abs(ratio - 1) <= .1;
    const desired = tol ? P.cur : clamp(Math.ceil(raw), P.min, P.max);
    out.innerHTML = '';
    out.append(frag(h.math(`desiredReplicas = ⌈currentReplicas × currentUtil ÷ targetUtil⌉
                = ⌈${P.cur} × ${P.util}% ÷ ${P.target}%⌉ = ⌈${raw.toFixed(2)}⌉ = ${Math.ceil(raw)}
ratio ${ratio.toFixed(2)} ${tol ? 'is within the 10% tolerance → no change' : 'is outside the 10% tolerance → act'}; clamp to [${P.min}, ${P.max}] → ${desired}`)));
    out.append(el('div', {class:'verdict ' + (desired > P.cur ? 'warn' : 'ok')}, desired > P.cur ? `Add arrival app copies: ${P.cur} to ${desired}. They need startup checks before serving riders.` : desired < P.cur ? `Reduce app copies from ${P.cur} to ${desired} after a quiet period, so small load changes do not make copies appear and disappear.` : 'Keep the current app copies.'));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Current app copies', min:1, max:30, value:P.cur, fmt:v => String(v), onInput:v => { P.cur = v; run(); }}).el,
    ui.slider({label:'Current average CPU', min:5, max:200, step:5, value:P.util, fmt:v => v + '%', onInput:v => { P.util = v; run(); }}).el,
    ui.slider({label:'Target CPU', min:20, max:90, step:5, value:P.target, fmt:v => v + '%', onInput:v => { P.target = v; run(); }}).el,
    ui.slider({label:'Maximum app copies', min:2, max:50, value:P.max, fmt:v => String(v), onInput:v => { P.max = v; run(); }}).el), out);
  run();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'timeouts-retries', title:'Timeouts, retries, exponential backoff and jitter', minutes:12, tags:['timeout','retry','backoff','jitter','retry budget','deadline'],
  summary:'A timeout limits how long the arrival app waits for vehicle data. Limited retries with growing, varied waits can recover from brief failures.',
  problem:`<h3>A small example</h3><p>A rider checks the next bus at Central Stop.</p><ul><li>The app asks a vehicle-location service for the bus position.</li><li>That service sometimes pauses for several seconds.</li><li>Many riders check the stop during the morning commute.</li></ul><p>How can the app answer promptly without flooding a slow service?</p>`,
  intuition:`If a call goes unanswered, hang up after a set time. Wait before calling again, and let different callers wait different amounts.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one arrival request through a slow location service.</p>',
    steps:[
      {icon:'📱', title:'Set the deadline', text:'The rider should get an answer within two seconds, even if the location service is slow.'},
      {icon:'⏱️', title:'Stop waiting', text:'The app times out a location call after 300 milliseconds and frees that waiting slot.'},
      {icon:'🔁', title:'Retry once', text:'A temporary timeout may clear. The app tries one more time within the rider’s deadline.'},
      {icon:'🎲', title:'Spread retries', text:'Backoff increases the wait before later attempts. Jitter adds a random part so riders do not retry together.'},
      {icon:'🛑', title:'Set a limit', text:'A retry budget caps extra calls. If data stays unavailable, the app shows the last update time.'}
    ],
    diagram:{title:'A bus location retry', w:780, h:250, alt:'The arrival app times out one slow location replica and retries through a healthy one.',
      nodes:[{id:'c', type:'client', label:'Rider', x:70, y:125}, {id:'co', type:'service', label:'Arrival app', sub:'deadline 2 s', x:230, y:125, w:130}, {id:'lb', type:'lb', label:'Load balancer', x:400, y:125}, {id:'p1', type:'service', label:'Location #1', sub:'slow', x:600, y:60, w:130}, {id:'p2', type:'service', label:'Location #2', x:600, y:190, w:130}],
      edges:[{from:'c', to:'co'}, {from:'co', to:'lb'}, {from:'lb', to:'p1'}, {from:'lb', to:'p2'}],
      steps:[
        {note:'The rider asks for the next bus. The app calls location replica #1.', flow:[['c', 'co', 'next bus'], ['co', 'lb', 'location'], ['lb', 'p1']], status:{p1:'hot'}},
        {note:'Replica #1 is slow. The app stops waiting after 300 milliseconds.', hl:['p1'], status:{p1:'down'}},
        {note:'The app waits a short random time before one retry.', hl:['co']},
        {note:'Replica #2 responds. The app returns the bus arrival estimate.', flow:[['co', 'lb', 'retry once'], ['lb', 'p2'], ['p2', 'co', 'position'], ['co', 'c', 'arrival']]}
      ]},
    mount:host => amplificationCalc(host),
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Phone call', 'Arrival request'], [['Hang up after waiting', 'Timeout'], ['Call again after a pause', 'Retry with backoff'], ['Call at a different moment', 'Jitter']])}</div><div class="callout tip"><b>Important point</b><p>A retry adds work to the service that is already slow. Keep attempts and total time limited.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Result', 'Action'], [['One short timeout', 'Retry once after a small random wait'], ['Repeated failures', 'Show a clear unavailable state with last update time'], ['Invalid request', 'Fix the request instead of retrying']])}</div>`,
    deep:`<h4>The numbers</h4><p>The rider's deadline is 2,000 ms. Say each try times out at 300 ms, and the wait before the retry is random between 0 and 100 ms. Worst case for two tries is 300 + 100 + 300 = 700 ms. That leaves 1,300 ms for the rest of the answer.</p><p>Say 1,000 riders ask each second and the feed is fully stuck. One retry for each doubles the calls to 1,000 × 2 = 2,000 per second. A retry budget of 10% allows only 100 retries per second, so calls stay near 1,000 + 100 = 1,100.</p><h4>When it goes wrong</h4><p>Retries stack across layers. Say the app, an internal gateway and the feed client each try up to 3 times. One tap can become 3 × 3 × 3 = 27 calls at the feed.</p><p>A timeout also does not cancel the first call. The service may still finish it. So retry only actions that are safe to repeat, such as reading a bus position. You met idempotency in Module 2.</p>`
  },
  tradeoffs:{use:[`Retry one temporary location timeout within the rider’s deadline.`], avoid:[`Retrying at every layer of the arrival request.`, `Retrying an invalid stop ID.`], alt:[`Show the last vehicle update time when live data remains unavailable.`]},
  real:[
    {co:'AWS SDKs and the Amazon Builders’ Library', tier:'confirmed', text:'AWS documents capped exponential backoff with jitter as the standard retry behaviour for its SDKs, and its Builders’ Library article explains timeouts, retry budgets and why retrying at only one layer prevents amplification.', src:'Marc Brooker, “Timeouts, retries, and backoff with jitter”, Amazon Builders’ Library; AWS Architecture Blog, “Exponential Backoff and Jitter” (2015)'},
    {co:'Google SRE', tier:'confirmed', text:'The SRE book recommends bounded retries, randomized backoff, and deadlines.', src:'Site Reliability Engineering, Addressing Cascading Failures'}
  ],
  mistakes:[`Leaving the location call without a timeout.`, `Retrying every layer and multiplying calls.`, `Letting all riders retry at the same instant.`],
  interview:[`Explain a two-second rider deadline and a shorter location timeout.`, `Show how retries can multiply across layers.`],
  tryit:[{quiz:[{q:'What should the app do after one temporary location timeout?', options:['Retry once within the deadline', 'Wait forever', 'Retry at every layer', 'Claim the bus is on time'], answer:0, why:'A limited retry may recover without exceeding the rider’s deadline.'}, {q:'Why add jitter?', options:['Spread retries from many riders', 'Change the bus route', 'Remove the timeout', 'Make every call simultaneous'], answer:0, why:'Random waits reduce retry waves.'}], quizId:'rel-l1'}, {note:'The playground uses many reconnecting clients to show the same retry timing problem.', pg:'retry-jitter'}],
  sources:[`Amazon Builders’ Library, Timeouts retries and backoff with jitter`, `AWS Architecture Blog, Exponential Backoff and Jitter (2015)`, `Google SRE book, chapter 22`, `gRPC Client Retries`]
},
{
  id:'circuit-breaker', title:'The circuit breaker pattern', minutes:10, tags:['circuit breaker','fail fast','half-open','Hystrix','Resilience4j'],
  summary:'A circuit breaker stops calling a dependency after many failures. It lets a few test calls through later to check recovery.',
  problem:`<h3>A small example</h3><p>Riders keep opening Central Stop during a vehicle-feed outage.</p><ul><li>The feed call keeps timing out.</li><li>Each wait holds an arrival-app worker.</li><li>The feed gets more calls while it is struggling.</li></ul><p>How can the app stop wasting time on calls likely to fail?</p>`,
  intuition:`A home circuit breaker cuts power when a circuit is faulty. After the fault clears, it can be switched back on.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the breaker as the vehicle feed fails and recovers.</p>',
    steps:[
      {icon:'🟢', title:'Closed', text:'Calls pass to the feed. The breaker counts recent successes and failures.'},
      {icon:'🔴', title:'Open', text:'After enough failures, the breaker stops new feed calls immediately.'},
      {icon:'🕒', title:'Show a fallback', text:'The app shows the last known vehicle update time instead of a pretend live arrival.'},
      {icon:'🟡', title:'Half-open', text:'After a wait, a few test calls check whether the feed responds again.'},
      {icon:'🟢', title:'Close again', text:'If the test calls succeed, normal feed calls resume.'}
    ],
    diagram:{title:'Breaker around the vehicle feed', w:780, h:240, alt:'The arrival app calls the feed through a breaker and uses last-update information while the feed is down.',
      nodes:[{id:'u', type:'client', label:'Rider', x:70, y:120}, {id:'s', type:'service', label:'Arrival app', x:240, y:120, w:150}, {id:'cb', type:'lb', label:'Circuit breaker', sub:'CLOSED', x:430, y:120, w:140}, {id:'eta', type:'service', label:'Vehicle feed', x:640, y:60, w:120}, {id:'fb', type:'cache', label:'Last update', sub:'time shown', x:640, y:190, w:150}],
      edges:[{from:'u', to:'s'}, {from:'s', to:'cb'}, {from:'cb', to:'eta'}, {from:'cb', to:'fb'}],
      steps:[
        {note:'Closed: the arrival app asks the feed for a bus position.', flow:[['u', 's', 'next bus'], ['s', 'cb'], ['cb', 'eta'], ['eta', 's', 'position']]},
        {note:'Fourteen of the last twenty calls fail. The breaker opens.', status:{eta:'down'}, sub:{cb:'OPEN'}, hl:['cb']},
        {note:'Open: the app skips the feed and shows when location was last updated.', flow:[['s', 'cb'], ['cb', 'fb', 'skip feed'], ['fb', 's', 'last seen']]},
        {note:'After a wait, three test calls succeed. The breaker closes.', status:{eta:'ok'}, sub:{cb:'HALF-OPEN → CLOSED'}, flow:[['cb', 'eta', 'test ×3'], ['eta', 'cb', 'OK']]}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Home breaker', 'Vehicle-feed breaker'], [['Power flows', 'Closed, calls pass'], ['Power cuts after a fault', 'Open, calls stop'], ['Try switching on', 'Half-open, test calls pass']])}</div><div class="callout tip"><b>Important point</b><p>A breaker needs call timeouts. A call that never finishes cannot be counted as success or failure.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Feed state', 'Rider sees'], [['Healthy', 'Live arrival estimate'], ['Breaker open', 'Last update time and a clear stale-data label'], ['Test calls succeed', 'Live estimate resumes']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the breaker looks at the last 20 calls. It opens only when at least 10 calls were seen and 50% or more failed. At a quiet stop, 2 failures out of 2 calls stay under the 10-call minimum, so the breaker stays closed.</p><p>Now say 1,000 calls arrive each second and each one waits 300 ms for a timeout. That holds 1,000 × 0.3 = 300 workers at once. With the breaker open, the fallback answers in about 1 ms. That holds 1,000 × 0.001 = 1 worker.</p><h4>When it goes wrong</h4><p>Each app server has its own breaker. Say 50 servers each send 3 test calls when their open time ends. That is 50 × 3 = 150 test calls into a feed that is still weak. A random extra wait on each breaker spreads them out.</p><p>If a test call fails, the breaker goes back to open for another full wait. Count only timeouts and server errors, not a bad stop ID.</p>`
  },
  tradeoffs:{use:[`Open a breaker when the vehicle feed repeatedly fails.`, `Show a labeled last-update fallback to riders.`], avoid:[`Opening the breaker because a rider entered a wrong stop ID.`, `Showing a stale arrival as live.`], alt:[`If one feed server is bad, route to a healthy replica.`]},
  real:[
    {co:'Netflix Hystrix', tier:'confirmed', text:'Netflix’s API used Hystrix to wrap dependency calls with circuit breakers, thread-pool bulkheads and fallbacks; the 2012 announcement describes tens of billions of thread-isolated calls a day.', src:'Netflix Tech Blog, “Introducing Hystrix for Resilience Engineering” (2012)'},
    {co:'Resilience4j', tier:'confirmed', text:'Documents sliding windows, failure thresholds, and half-open test calls.', src:'Resilience4j documentation'}
  ],
  mistakes:[`Treating a wrong stop ID as a feed failure.`, `Never testing the last-update fallback.`, `Opening one breaker for all feed servers when only one is bad.`],
  interview:[`Explain closed, open, and half-open using the vehicle feed.`, `Say what riders see while the breaker is open.`],
  tryit:[{quiz:[{q:'What happens when the vehicle-feed breaker is open?', options:['The app skips the feed call', 'Every request waits longer', 'The bus moves faster', 'The app deletes stop data'], answer:0, why:'Open means new calls fail fast without touching the feed.'}, {q:'What does half-open do?', options:['Sends a few test calls', 'Deletes all previous results', 'Stops every rider request forever', 'Disables timeouts'], answer:0, why:'Test calls check whether the feed recovered.'}]}, {note:'Make a sample dependency fail and watch the breaker open, test, and close.', pg:'circuit-breaker'}],
  sources:[`Michael Nygard, Release It! (2018)`, `Martin Fowler, CircuitBreaker (2014)`, `Netflix Tech Blog, Hystrix (2012)`, `Resilience4j documentation`]
},
{
  id:'bulkhead-fallback', title:'Bulkheads, fallbacks and graceful degradation', minutes:10, tags:['bulkhead','fallback','graceful degradation','isolation'],
  summary:'Bulkheads reserve separate capacity for different dependencies. If route tips become slow, the arrival page can still show bus times.',
  problem:`<h3>A small example</h3><p>The transit app loads three parts of a stop page.</p><ul><li>Live bus arrivals are the main answer.</li><li>Route tips are optional.</li><li>Stop details are useful but simpler.</li></ul><p>What happens if slow route tips take every available worker?</p>`,
  intuition:`A ship has separate compartments. Water entering one does not fill the others. Separate worker pools protect the same way.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Give the three stop-page calls separate limits.</p>',
    steps:[
      {icon:'🚌', title:'Protect arrivals', text:'Reserve worker slots for live arrivals, the part riders came to see.'},
      {icon:'🧭', title:'Limit route tips', text:'Give optional route tips their own smaller pool, so slow tips cannot take arrival slots.'},
      {icon:'⏱️', title:'Free slow slots', text:'Timeouts stop stuck calls from holding their pool forever.'},
      {icon:'📄', title:'Fall back clearly', text:'If route tips fail, hide them. If live data fails, show its last update time.'}
    ],
    mount:host => bulkheadCalc(host),
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Ship', 'Stop page'], [['Separate compartments', 'Separate call pools'], ['One flooded compartment', 'Slow route tips'], ['Other compartments stay usable', 'Arrivals still have worker slots']])}</div><div class="callout tip"><b>Important point</b><p>A fallback must tell the truth. A last-known bus position needs its update time.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Part', 'When it fails'], [['Route tips', 'Hide the optional section'], ['Stop details', 'Show saved basic details'], ['Live arrivals', 'Show last update time or a clear unavailable state']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the app has 60 shared worker slots. Route tips get 40 calls each second and turn 6 seconds slow. Slots needed: 40 × 6 = 240. That is 4 times the 60 available, so arrivals starve too.</p><p>Now split the slots, 50 for arrivals and 10 for route tips. Tips can finish at most 10 ÷ 6 = about 1.7 calls each second. The rest get an instant hide, so they hold no slot. Say arrivals come at 100 per second and take 0.2 s each. They need 100 × 0.2 = 20 slots, well inside 50.</p><h4>When it goes wrong</h4><p>Separate pools waste some space. If route tips are quiet, their 10 slots sit idle and arrivals cannot borrow them. Size each pool as calls per second × seconds per call, plus some spare.</p><p>Do not give a small pool a long waiting line. Requests would just wait there until their time runs out. Reject at once when the pool is full.</p>`
  },
  tradeoffs:{use:[`Reserve arrival-call capacity separately from optional route tips.`], avoid:[`Letting slow route tips use every app worker.`, `Showing an old bus location as live.`], alt:[`Disable route tips during a feed incident.`]},
  real:[
    {co:'Netflix', tier:'confirmed', text:'Netflix’s API used per-dependency thread pools (bulkheads) and fallbacks such as returning non-personalised or cached data when a personalisation service failed, so the page still rendered.', src:'Netflix Tech Blog, “Making the Netflix API More Resilient” (2011); “Fault Tolerance in a High Volume, Distributed System” (2012)'},
    {co:'AWS cell-based architecture', tier:'confirmed', text:'AWS describes independent cells as a way to limit how many customers a failure affects.', src:'AWS Well-Architected, Reducing the Scope of Impact with Cell-Based Architecture'}
  ],
  mistakes:[`Sharing one worker pool for arrivals and route tips.`, `Never testing the hidden-route-tip fallback.`, `Showing a stale arrival without its update time.`],
  interview:[`Explain which stop-page parts are essential and optional.`, `Show how separate pools contain a slow route-tip service.`],
  tryit:[{quiz:[{q:'Why reserve a separate pool for route tips?', options:['Slow tips cannot use every arrival slot', 'It changes bus positions', 'It removes timeouts', 'It stores more routes'], answer:0, why:'Bulkheads keep one slow dependency within its own limit.'}, {q:'What should a fallback for missing live arrivals show?', options:['Last update time or unavailable state', 'A precise invented arrival', 'Only route tips', 'No warning about stale data'], answer:0, why:'Riders need to know when the data is old.'}]}, {note:'Slow the route-tip service and see whether the stop page still loads.', pg:'chaos-monkey'}],
  sources:[`Netflix Tech Blog (2011, 2012)`, `Nygard, Release It!`, `AWS Well-Architected, cell-based architecture`]
},
{
  id:'load-shedding', title:'Load shedding and admission control', minutes:10, tags:['load shedding','admission control','goodput','priority','overload'],
  summary:'Load shedding rejects some work when more requests arrive than the app can finish. Early rejection protects timely answers for accepted riders.',
  problem:`<h3>A small example</h3><p>Heavy rain sends riders to the transit app at once.</p><ul><li>The app can finish 1,000 arrival requests each second.</li><li>3,000 arrive each second.</li><li>Riders give up after one second.</li></ul><p>Should the app accept every request into a growing wait line?</p>`,
  intuition:`A small ticket desk with one clerk cannot serve everyone at once. Turning some people away quickly is clearer than making all wait past closing.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Watch what happens when the request line grows past the rider’s patience.</p>',
    steps:[
      {icon:'📈', title:'Count incoming work', text:'Each second, 3,000 asks arrive but the app finishes at most 1,000.'},
      {icon:'⌛', title:'See the wait grow', text:'About 2,000 new requests join the line each second if none are rejected.'},
      {icon:'🚪', title:'Reject early', text:'Admission control limits what enters. Extra requests get a quick busy response before expensive work starts.'},
      {icon:'🚌', title:'Protect useful answers', text:'Give live arrival checks priority over optional route-tip refreshes.'},
      {icon:'📊', title:'Measure goodput', text:'Goodput counts answers riders receive before they give up, not work finished too late.'}
    ],
    mount:host => sheddingChart(host),
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Ticket desk', 'Arrival app'], [['Clerk capacity', '1,000 requests each second'], ['Growing line', 'Waiting requests'], ['Quickly say the line is full', 'Reject before expensive work']])}</div><div class="callout tip"><b>Important point</b><p>Busy servers do not guarantee useful service. A response after the rider leaves has no value to that rider.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Work', 'Priority'], [['Live arrival lookup', 'Protect first'], ['Optional route-tip refresh', 'Pause or reject first'], ['Request already past its deadline', 'Drop before processing']])}</div>`,
    deep:`<h4>The numbers</h4><p>The line grows by 3,000 − 1,000 = 2,000 requests each second. Riders leave after 1 second, so any wait over 1 second is useless. A line of 1,000 requests already means a wait of 1,000 ÷ 1,000 = 1 second. The line reaches that size in 1,000 ÷ 2,000 = 0.5 seconds.</p><p>After that, a plain first-in line serves requests whose riders have already left. Goodput can fall close to zero while the server stays 100% busy. A line capped at 500 requests keeps the wait under 500 ÷ 1,000 = 0.5 seconds. The other 2,000 requests each second get a fast busy reply, and 1,000 riders each second still get answers.</p><h4>When it goes wrong</h4><p>Rejected riders may retry at once. Then 2,000 rejections can come back as 2,000 more requests, and the overload goes on. Clients should wait first, using the backoff and jitter from the timeouts lesson. A server can also answer the newest request first, because the oldest riders have probably left.</p>`
  },
  tradeoffs:{use:[`Reject excess transit lookups before the app spends work on them.`, `Protect live arrivals ahead of route-tip refreshes.`], avoid:[`Letting the arrival queue grow beyond rider deadlines.`, `Rejecting live arrivals while optional work continues.`], alt:[`Add capacity before a known commute surge. The autoscaling lesson covers this later.`]},
  real:[
    {co:'Amazon', tier:'confirmed', text:'Amazon’s Builders’ Library explains that under overload a server should reject excess requests cheaply to keep goodput at capacity, and describes prioritising and bounding work.', src:'David Yanacek, “Using load shedding to avoid overload”, Amazon Builders’ Library'},
    {co:'Netflix', tier:'confirmed', text:'Netflix described prioritizing playback requests during overload.', src:'Netflix Tech Blog, Keeping Netflix Reliable Using Prioritized Load Shedding (2020)'}
  ],
  mistakes:[`Accepting every request into an endless line.`, `Rejecting only after a slow vehicle-feed call.`, `Telling clients to retry immediately together.`],
  interview:[`Explain why goodput can fall while the app is fully busy.`, `Choose what transit work to reject first.`],
  tryit:{quiz:[{q:'Why can goodput fall while the arrival app is busy?', options:['It finishes answers after riders give up', 'Every bus has stopped', 'The app has no route tips', 'The app has no requests'], answer:0, why:'Late answers consume capacity but no longer help riders.'}, {q:'Where should excess work be rejected?', options:['Before expensive feed or database calls', 'After every calculation', 'Only after the rider leaves', 'Never'], answer:0, why:'Early rejection leaves capacity for useful work.'}], quizId:'rel-l4', note:'Raise offered arrival requests above capacity and compare useful answers with and without shedding.'},
  sources:[`Amazon Builders’ Library, load shedding`, `Netflix Tech Blog (2020)`, `Google SRE book, chapter 21`]
},
{
  id:'redundancy-failover', title:'Redundancy and failover: active-passive vs active-active', minutes:10, tags:['redundancy','failover','active-passive','active-active','N+1'],
  summary:'Redundancy keeps another working copy ready. Active-passive promotes a standby after failure; active-active has several copies serving riders already.',
  problem:`<h3>A small example</h3><p>The transit app stores route times in one database.</p><ul><li>Riders need the published timetable.</li><li>The database server stops during a commute.</li><li>Another copy has recent route data.</li></ul><p>Who takes over, and how does the app find that copy?</p>`,
  intuition:`A substitute driver waits for a regular driver to leave. That is active-passive. Two drivers already serving separate trips show active-active.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Watch the route database switch from its primary to a standby.</p>',
    steps:[
      {icon:'🗄️', title:'Keep another copy', text:'The primary route database sends saved timetable changes to a standby.'},
      {icon:'💔', title:'Detect failure', text:'A health check notices that the primary no longer answers.'},
      {icon:'🔒', title:'Stop two writers', text:'The old primary must be blocked from writing before the standby takes over. This prevents split brain.'},
      {icon:'🔁', title:'Promote and reconnect', text:'The standby becomes primary. The arrival app reconnects through its database endpoint.'},
      {icon:'⚖️', title:'Compare active-active', text:'App servers can serve riders together. Each keeps spare capacity to cover a lost peer.'}
    ],
    diagram:{title:'Route database failover', w:780, h:250, alt:'The transit app switches from a failed route database to a standby copy.',
      nodes:[{id:'app', type:'service', label:'Arrival app', x:110, y:125, w:130}, {id:'px', type:'lb', label:'DB endpoint', sub:'routes', x:300, y:125, w:130}, {id:'p', type:'db', label:'Primary', sub:'Zone A', x:520, y:60, w:120}, {id:'s', type:'db', label:'Standby', sub:'Zone B', x:520, y:195, w:150}, {id:'mon', type:'ext', label:'Failure detector', sub:'health checks', x:710, y:125, w:130}],
      edges:[{from:'app', to:'px'}, {from:'px', to:'p'}, {from:'p', to:'s'}, {from:'mon', to:'p'}, {from:'mon', to:'s'}, {from:'px', to:'s', dashed:true}],
      steps:[
        {note:'The primary saves a timetable change and copies it to the standby.', flow:[['app', 'px', 'UPDATE route'], ['px', 'p'], ['p', 's', 'copy'], ['p', 'app', 'OK']]},
        {note:'The primary stops answering health checks.', status:{p:'down'}, flow:[['mon', 'p', 'check']]},
        {note:'The old writer is fenced off. The standby becomes the new primary.', sub:{s:'Zone B primary', px:'Zone B'}, hl:['s', 'px']},
        {note:'The app reconnects and can read route times again.', flow:[['app', 'px', 'retry'], ['px', 's'], ['s', 'app', 'routes']]}
      ]},
    mount:host => failoverCalc(host),
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Transit staff', 'App design'], [['Substitute waits', 'Active-passive standby'], ['Two staff serve riders now', 'Active-active app servers'], ['Supervisor names one lead', 'Only one database writer']])}</div><div class="callout tip"><b>Important point</b><p>Two database copies accepting different timetable edits at once can disagree. Failover must keep one writer.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Part', 'Useful setup'], [['Route database', 'Primary plus standby'], ['Stateless arrival app servers', 'Several active copies'], ['After a failure', 'Recheck capacity and route traffic away from the failed copy']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say a health check runs every 5 seconds. The primary is declared dead after 3 missed checks, so detection takes 3 × 5 = 15 seconds. Say promotion and reconnecting take 20 more. Riders see about 15 + 20 = 35 seconds of trouble.</p><p>For active-active app servers, 3 copies can each run at 2 ÷ 3 = about 67% busy. With 4 copies it is 3 ÷ 4 = 75%. More copies means less idle spare on each copy.</p><h4>When it goes wrong</h4><p>A slow primary can look dead. If it wakes up after the standby took over, two writers exist. A fencing token stops this. Each promotion gets a higher number, say 8 for the new primary and 7 for the old one. The storage refuses any write that carries 7.</p><h4>How it works inside</h4><p>Say an asynchronous standby is 2 seconds behind. Promoting it loses route edits from those last 2 seconds. A synchronous standby loses none, but every write waits for it.</p>`
  },
  tradeoffs:{use:[`Use a standby for the route database.`, `Keep spare capacity in active arrival app servers.`], avoid:[`Promoting the standby while the old database can still write.`, `Calling an untested standby reliable.`], alt:[`For less critical stored reports, a backup and planned restore may suffice.`]},
  real:[
    {co:'Amazon RDS Multi-AZ', tier:'confirmed', text:'RDS Multi-AZ keeps a standby in another Availability Zone and can fail over automatically.', src:'Amazon RDS Multi-AZ documentation'},
    {co:'Netflix active-active', tier:'confirmed', text:'Netflix described serving traffic across multiple AWS regions.', src:'Netflix Tech Blog, Active-Active for Multi-Regional Resiliency (2013)'}
  ],
  mistakes:[`Never testing the route database standby.`, `Allowing the old primary to accept new route edits after failover.`, `Running three app servers so full that two cannot carry peak traffic.`],
  interview:[`Trace a route database failover from detection to reconnection.`, `Explain how much headroom three active app servers need.`],
  tryit:[{quiz:[{q:'Which setup has one database writer and a waiting standby?', options:['Active-passive', 'Active-active', 'No redundancy', 'A browser cache'], answer:0, why:'The standby takes over only after failure.'}, {q:'Why keep spare capacity in three active app servers?', options:['Two must carry peak after one stops', 'The route timetable changes', 'The rider has three phones', 'It avoids all failures'], answer:0, why:'The remaining servers need room for the lost server’s share.'}]}, {note:'Classify active-passive and active-active transit app setups.', mount:host => sortGame(host, [
    {t:'Two arrival app servers both answer riders', c:'aa', why:'Both are active now.'},
    {t:'A route database primary with a standby ready to promote', c:'ap', why:'Only the primary serves writes now.'},
    {t:'A second region waits until the first region fails', c:'ap', why:'The recovery region is waiting.'},
    {t:'Three arrival app servers all handle requests', c:'aa', why:'All copies are serving riders.'},
    {t:'A timetable publisher has a backup that runs only after a lease expires', c:'ap', why:'Only one publisher is active.'}
  ], [{id:'ap', label:'Active-passive'}, {id:'aa', label:'Active-active'}])}],
  sources:[`Amazon RDS Multi-AZ documentation`, `Netflix Tech Blog (2013)`, `GitHub post-incident analysis (2018)`, `Kleppmann, Designing Data-Intensive Applications, ch. 5`]
},
{
  id:'multi-az-region', title:'Multi-AZ and multi-region deployments', minutes:11, tags:['availability zone','region','multi-region','blast radius','shuffle sharding'],
  summary:'An availability zone is a separate data-centre area inside one cloud region. Multiple zones handle local failures; another region handles wider outages.',
  problem:`<h3>A small example</h3><p>The transit app serves riders from one cloud area.</p><ul><li>All app servers sit in one zone.</li><li>A power fault stops that zone.</li><li>Riders still need route times and arrivals.</li></ul><p>Where should the app keep copies so one fault does not remove them all?</p>`,
  intuition:`A city service can use offices in different buildings. A whole-city problem needs an office in another city.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>See which failure each wider placement can survive.</p>',
    steps:[
      {icon:'🏢', title:'Use several zones', text:'A cloud region contains separate zones with different power and buildings. Put app copies in more than one.'},
      {icon:'🚦', title:'Route around a zone', text:'If one zone stops, a load balancer sends riders to app copies in the others.'},
      {icon:'🗄️', title:'Keep route data available', text:'Keep a route database copy in another zone so app servers can still read it.'},
      {icon:'🌍', title:'Prepare another region', text:'A copy farther away can help if the whole first region fails, but switching takes more work.'}
    ],
    diagram:{title:'Transit app across zones and regions', w:800, h:280, alt:'Rider traffic reaches app copies in three zones. Route data is also copied to a second region.',
      nodes:[{id:'u', type:'client', label:'Riders', x:70, y:140}, {id:'dns', type:'cdn', label:'Name routing', x:200, y:140}, {id:'lb', type:'lb', label:'Regional LB', sub:'Mumbai', x:350, y:80, w:120}, {id:'a', type:'service', label:'App Zone A', x:520, y:30, w:110}, {id:'b', type:'service', label:'App Zone B', x:520, y:90, w:110}, {id:'c', type:'service', label:'App Zone C', x:520, y:150, w:110}, {id:'db', type:'db', label:'Route database copies', x:700, y:90, w:170}, {id:'r2', type:'db', label:'Backup region', sub:'Hyderabad', x:700, y:230, w:150}],
      edges:[{from:'u', to:'dns'}, {from:'dns', to:'lb'}, {from:'lb', to:'a'}, {from:'lb', to:'b'}, {from:'lb', to:'c'}, {from:'a', to:'db'}, {from:'b', to:'db'}, {from:'c', to:'db'}, {from:'db', to:'r2', dashed:true}, {from:'dns', to:'r2', dashed:true}],
      steps:[
        {note:'Riders reach app copies across three zones in one region.', flow:[['u', 'dns'], ['dns', 'lb'], ['lb', 'a'], ['lb', 'b'], ['lb', 'c']], parallel:false},
        {note:'Zone B stops. The load balancer sends riders to Zones A and C.', status:{b:'down'}, flow:[['lb', 'a'], ['lb', 'c']], parallel:true},
        {note:'Route data also travels to a copy in another region.', flow:[['db', 'r2', 'copy']]},
        {note:'A whole-region failure needs traffic to move to the recovery region.', status:{lb:'down', a:'down', c:'down', db:'down'}, flow:[['u', 'dns'], ['dns', 'r2', 'recover']]}
      ]},
    mount:host => topologyPicker(host),
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Transit office', 'Cloud placement'], [['Several buildings in one city', 'Several zones in one region'], ['Office in another city', 'Copy in another region']])}</div><div class="callout tip"><b>Important point</b><p>Copies in separate zones still share a region. A region-wide failure can affect all of them.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Failure to cover', 'Placement'], [['One zone stops', 'Multiple zones'], ['Entire region stops', 'Recovery region with a tested switch']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the peak needs 12 app servers. With 2 zones, a lost zone must leave 12, so each zone runs 12. That is 24 servers in all. With 3 zones, the 2 remaining zones must hold 12, so each runs 6. That is 18 servers in all. More zones means less spare capacity.</p><p>Distance costs time. Say a copy in another zone answers in about 2 ms and a copy in a far region in about 70 ms. A write that waits for the far copy takes at least 70 ms. One that waits only for the nearby copy takes about 2 ms.</p><h4>When it goes wrong</h4><p>A hidden single-region dependency can defeat the plan. A startup config service or a license server in one region stops new servers from starting elsewhere. Also, clouds often charge for data sent between zones, so chatty calls across zones add cost.</p>`
  },
  tradeoffs:{use:[`Spread transit app copies and route data across zones.`, `Add a recovery region if whole-region outages must be covered.`], avoid:[`Putting every app and database copy in one zone.`, `Keeping a required startup service only in the failed region.`], alt:[`For lower recovery needs, use multiple zones plus tested backups.`]},
  real:[
    {co:'AWS us-east-1, December 2021', tier:'confirmed', text:'An impaired internal network in us-east-1 affected many AWS services and customers for hours; AWS’s public summary describes how internal dependencies in one region widened the impact.', src:'AWS, “Summary of the AWS Service Event in the Northern Virginia (US-EAST-1) Region” (Dec 2021)'},
    {co:'Amazon S3, February 2017', tier:'confirmed', text:'A mistaken command removed more S3 capacity than intended and disrupted dependent services.', src:'AWS, Summary of the Amazon S3 Service Disruption (2017)'}
  ],
  mistakes:[`Putting a required transit configuration service in only one region.`, `Depending on new servers to launch after a zone fails.`, `Copying data across regions without checking delay or staleness.`],
  interview:[`Explain what a second zone protects and what it does not.`, `Explain when the transit app needs another region.`],
  tryit:{quiz:[{q:'What can multiple zones cover?', options:['One zone losing power', 'Every possible code bug', 'A whole-region outage by themselves', 'A wrong bus timetable'], answer:0, why:'Other zones in the same region can keep serving.'}, {q:'What can still stop an app spread across one region’s zones?', options:['A region-wide failure', 'One app instance stopping', 'A rider changing stops', 'One healthy zone'], answer:0, why:'All its zones still share the same region.'}], quizId:'rel-l6', note:'Compare placements against a transit app’s availability, delay, and cost needs.'},
  sources:[`AWS public post-event summaries (2017, 2021)`, `Amazon Builders’ Library, shuffle sharding and static stability`, `AWS Well-Architected Reliability Pillar`]
},
{
  id:'disaster-recovery', title:'Disaster recovery: RPO, RTO and the four strategies', minutes:11, tags:['disaster recovery','RPO','RTO','backup','pilot light','warm standby'],
  summary:'RPO limits how much saved data may be lost. RTO limits how long service may stay down. Recovery strategies trade cost for these targets.',
  problem:`<h3>A small example</h3><p>A bad command removes the transit app’s route timetable.</p><ul><li>Staff changed several routes this morning.</li><li>Riders need correct stop times.</li><li>The team has backups but has not timed a restore.</li></ul><p>How much route data may be lost, and how long can riders wait?</p>`,
  intuition:`Saving a document once a day risks losing a day’s edits. A spare computer can shorten the time needed to work again.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Set targets for the route timetable before choosing a recovery setup.</p>',
    steps:[
      {icon:'🕒', title:'Set data loss limit', text:'RPO is the maximum age of route edits the team can afford to lose.'},
      {icon:'⏱️', title:'Set downtime limit', text:'RTO is the longest the arrival app may stay unavailable after the incident.'},
      {icon:'💾', title:'Choose a recovery copy', text:'A backup is cheaper but takes longer to restore. A running standby costs more and can take over faster.'},
      {icon:'🧪', title:'Practice the restore', text:'Restore route data in a drill and measure the real loss and downtime.'}
    ],
    mount:host => drPicker(host),
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Document recovery', 'Route data recovery'], [['Lost edits since last save', 'RPO'], ['Time to open a working copy', 'RTO']])}</div><div class="callout tip"><b>Important point</b><p>Replication can copy a bad deletion too. Keep restorable backups and test them.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Strategy', 'Transit use'], [['Backup and restore', 'Lower-cost recovery for less urgent reports'], ['Pilot light', 'Route data ready in another region, app starts later'], ['Warm standby', 'Small arrival app already running elsewhere'], ['Active-active', 'Full service runs in more than one region']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say a full backup runs once a day at 02:00. A failure at 01:50 loses almost 24 hours of route edits, so the worst RPO is about 24 hours. If database changes are also saved every 5 minutes, the worst RPO drops to about 5 minutes.</p><p>Now the RTO. Say detect 10 min, decide 15, restore 60, check data 20, move riders 5. Total: 10 + 15 + 60 + 20 + 5 = 110 minutes. The restore step depends on size. Say 360 GB at 100 MB per second is 360,000 ÷ 100 = 3,600 seconds, which is 60 minutes.</p><h4>When it goes wrong</h4><p>Say the bad command ran at 09:12. Restore the last snapshot, then replay the saved changes up to 09:11. Stopping just before the bad command is the point. If the backup sits in the same account as the primary, one wrong login can erase both, so keep a copy somewhere separate.</p>`
  },
  tradeoffs:{use:[`Choose tighter recovery targets for published route times than for old usage reports.`, `Test restoring the route database.`], avoid:[`Assuming a replica protects against a wrong deletion.`, `Writing an RTO target without timing a complete restore.`], alt:[`Rebuild live positions from new feed updates after route data is restored.`]},
  real:[
    {co:'AWS DR whitepaper', tier:'confirmed', text:'AWS’s “Disaster Recovery of Workloads on AWS” describes exactly four strategies, backup and restore, pilot light, warm standby and multi-site active/active, ordered by RPO/RTO and cost.', src:'AWS whitepaper, “Disaster Recovery of Workloads on AWS: Recovery in the Cloud”'},
    {co:'GitLab.com, January 2017', tier:'confirmed', text:'GitLab reported that a mistaken deletion and failed backup mechanisms caused data loss.', src:'GitLab postmortem of database outage (2017)'}
  ],
  mistakes:[`Never restoring the route backup until a real outage.`, `Treating a copied deletion as a safe backup.`, `Forgetting the time needed to validate restored route data.`],
  interview:[`Set route-data RPO and app RTO before choosing a strategy.`, `Explain why a bad delete needs an earlier recovery point.`],
  tryit:[{quiz:[{q:'What does RPO limit for route data?', options:['How many past edits may be lost', 'How long a bus trip takes', 'How many riders open the app', 'How many app icons exist'], answer:0, why:'RPO is the acceptable age of lost saved data.'}, {q:'Why is a replica alone weak against a wrong delete?', options:['It can copy the deletion', 'It cannot store routes', 'It always lives on a phone', 'It changes bus speed'], answer:0, why:'Replication copies saved changes, including mistakes.'}]}, {note:'Order the steps for restoring the transit timetable after a bad command.', mount:host => recoveryOrderGame(host, ['Detect the missing route data and declare an incident', 'Stop writes to the damaged route database', 'Prepare the recovery database from saved infrastructure settings', 'Restore a snapshot and changes up to before the bad command', 'Check route times and run a basic app test', 'Send rider traffic to the recovered app', 'Record what failed and fix the recovery gaps'])}],
  sources:[`AWS DR whitepaper`, `GitLab postmortem (2017)`, `AWS Well-Architected Reliability Pillar`]
},
{
  id:'chaos-engineering', title:'Chaos engineering', minutes:9, tags:['chaos engineering','Chaos Monkey','game day','fault injection','DiRT'],
  summary:'Chaos engineering tests a system by causing a controlled failure. The team checks whether riders still get the promised experience.',
  problem:`<h3>A small example</h3><p>The transit team believes the arrival page works when one vehicle-feed server stops.</p><ul><li>A second feed server is available.</li><li>The page has a last-update fallback.</li><li>No one has tested the full failure path.</li></ul><p>How can the team check that claim safely?</p>`,
  intuition:`A fire drill tests exits and alarms while people can still fix problems. A controlled software failure tests the same kind of preparedness.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Run one small experiment against the arrival page.</p>',
    steps:[
      {icon:'🎯', title:'Name normal service', text:'Define steady state: riders receive a timely arrival or a clearly labeled last update.'},
      {icon:'🧪', title:'Make a prediction', text:'Predict what happens when one vehicle-feed server stops.'},
      {icon:'🛑', title:'Limit the test', text:'Affect a small set of requests and prepare a quick way to stop the experiment.'},
      {icon:'📊', title:'Observe riders', text:'Check answer time, errors, and fallback labels while the server is down.'},
      {icon:'🔧', title:'Fix and repeat', text:'Repair any missing fallback or alert, then run the same test again.'}
    ],
    stepper:{title:'A chaos experiment, step by step', items:[
      {title:'Define steady state', tag:'measure', text:'Riders get a timely live arrival or a clear last-update label.'},
      {title:'Form a hypothesis', tag:'predict', text:'If one feed server stops, other feed copies answer or the page shows last-update time.'},
      {title:'Choose the fault', tag:'inject', text:'Stop one feed server for a short period.'},
      {title:'Limit the blast radius', tag:'scope', text:'Start with a small test group and have a stop switch ready.'},
      {title:'Run and observe', tag:'watch', text:'Check response times, fallback labels, and alerts during the failure.'},
      {title:'Learn and fix', tag:'repair', text:'Fix any bad answer or missing alert. Repeat the test.'},
      {title:'Make it routine', tag:'repeat', text:'Repeat useful experiments so later changes do not quietly break recovery.'}]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Fire drill', 'Transit app test'], [['Plan an exit', 'Predict fallback behavior'], ['Block one route safely', 'Stop one feed server for test riders'], ['Check people got out', 'Check riders saw a useful answer']])}</div><div class="callout tip"><b>Important point</b><p>The experiment needs a prediction and a rider-facing measurement. Breaking a server alone teaches little.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Observation', 'Next action'], [['Riders see a clear last-update time', 'Record the passing result'], ['Riders see a false live arrival', 'Fix the fallback and test again'], ['No alert fires', 'Fix the alert and test again']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say two feed servers share the load and each runs 70% busy. If one stops, the other needs 70 + 70 = 140% of its capacity. It cannot do that, so riders would see slowness. At 45% each, the survivor would need 90%, which fits. A test finds this before a real outage does.</p><p>Say 1,000 requests arrive each second. Limiting the test to 1% of them affects 1,000 × 0.01 = 10 requests each second. In one minute that is 10 × 60 = 600 requests, enough to compare answer times and fallback labels.</p><h4>When it goes wrong</h4><p>Write the abort rule before you start. For example, stop if more than 2% of test requests fail for 1 minute. Also check that the fault really happened. If the server never stopped, a pass means nothing, so confirm it in the metrics.</p>`
  },
  tradeoffs:{use:[`Test the transit app’s claim that a feed-server failure leaves a clear answer.`], avoid:[`Stopping every feed server at once for the first test.`, `Running a drill without checking what riders see.`], alt:[`Rehearse the failure on a test environment before a small live trial.`]},
  real:[
    {co:'Netflix Chaos Monkey / Simian Army', tier:'confirmed', text:'Netflix built Chaos Monkey to randomly terminate production instances during business hours and later Chaos Gorilla (AZ) and Chaos Kong (region) exercises; it open-sourced Chaos Monkey.', src:'Netflix Tech Blog, “The Netflix Simian Army” (2011); Basiri et al., IEEE Software (2016)'},
    {co:'Google DiRT', tier:'confirmed', text:'Google’s Disaster Recovery Testing program runs company-wide recovery exercises.', src:'Kripa Krishnan, Weathering the Unexpected (2012)'}
  ],
  mistakes:[`Starting with all riders instead of a small test group.`, `Watching CPU without checking arrival answers.`, `Finding a broken fallback and never fixing it.`],
  interview:[`Design one feed-server failure experiment for the transit app.`, `Name the rider-facing result that would make it pass.`],
  tryit:[{quiz:[{q:'What should the team define before stopping a feed server?', options:['The rider-facing expected result', 'A random failure time only', 'A new logo', 'A longer timeout for all calls'], answer:0, why:'A hypothesis needs a measurable normal result.'}, {q:'What if the test shows a false live arrival?', options:['Fix the fallback and repeat', 'Call the test a success', 'Ignore the label', 'Stop measuring'], answer:0, why:'The experiment exposed a real rider problem.'}]}, {note:'Stop one transit app copy or a zone, then check live-arrival success and recovery time.', pg:'chaos-monkey'}],
  sources:[`Netflix Tech Blog (2011)`, `Basiri et al., “Chaos Engineering”, IEEE Software 33(3), 2016`, `Principles of Chaos Engineering`, `Krishnan, ACM Queue (2012)`]
},
{
  id:'capacity-planning', title:'Capacity planning', minutes:11, tags:['capacity planning','load testing','headroom','Little’s law','forecast'],
  summary:'Capacity planning estimates future rider demand and measures how much one app server can handle. It leaves room for growth and failures.',
  problem:`<h3>A small example</h3><p>The transit app sees busy morning commutes.</p><ul><li>Today’s peak is 12,000 arrival requests each second.</li><li>Use may grow 60% in a year.</li><li>One tested app server handles 800 each second at its limit.</li></ul><p>How many servers should the team plan for without running them at the limit?</p>`,
  intuition:`A bus operator plans enough vehicles for the morning rush, then keeps spares for delays and breakdowns.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Turn the transit app’s peak into a server count.</p>',
    steps:[
      {icon:'📈', title:'Forecast the peak', text:'12,000 requests each second with 60% growth becomes 19,200 each second in one year.'},
      {icon:'🧪', title:'Measure a server', text:'A load test finds that one server handles 800 each second before response time gets too slow.'},
      {icon:'🪑', title:'Leave headroom', text:'At a 60% target, use 480 of those 800 slots for planned peak traffic.'},
      {icon:'🔢', title:'Count the servers', text:'19,200 divided by 480 is 40 servers. Extra copies are needed to survive a zone loss.'},
      {icon:'🔍', title:'Check the full path', text:'The route database and vehicle feed must also handle the planned demand.'}
    ],
    mount:host => capacityCalc(host),
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Bus planning', 'App planning'], [['Morning rider rush', 'Peak arrival requests'], ['Seats per bus', 'Requests one server handles'], ['Spare bus', 'Capacity for a failed zone']])}</div><div class="callout tip"><b>Important point</b><p>Size the whole request path. More app servers will not help if the vehicle feed is already full.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Question', 'Check'], [['How many riders arrive together?', 'Measure peak requests'], ['How much can one server finish?', 'Load test realistic arrival lookups'], ['What if one zone stops?', 'Add enough spare capacity in other zones']])}</div>`,
    deep:`<h4>The numbers</h4><p>For three zones, losing one must leave two zones carrying the whole peak. The 40-server base becomes 40 × 3 ÷ 2 = 60 servers, 20 per zone. After a zone loss, 40 servers remain, each at the planned 480 per second.</p><p>Check connections with Little's law. It says requests in flight = arrival rate × time per request. Say each request takes 0.15 s. One server at 480 per second holds 480 × 0.15 = 72 requests at once. If each request holds one connection, a pool of 50 would force waiting.</p><h4>When it goes wrong</h4><p>Growth compounds. If use grows 60% again the next year, 19,200 × 1.6 = 30,720 per second. That needs 30,720 ÷ 480 = 64 servers before any zone spare. Near a server's limit, a small rise in load causes a big jump in waiting time. So load test response time, not only requests finished.</p>`
  },
  tradeoffs:{use:[`Plan the transit app for commute peaks and next year’s growth.`, `Reserve capacity for one failed zone.`], avoid:[`Sizing app servers from daily average traffic.`, `Ignoring the route database and feed limits.`], alt:[`Use autoscaling for changing demand after the base capacity is planned.`]},
  real:[
    {co:'Google SRE', tier:'confirmed', text:'Describes capacity planning and load testing as part of service reliability work.', src:'Site Reliability Engineering'}
  ],
  mistakes:[`Using average rider traffic instead of the commute peak.`, `Forgetting the vehicle-feed limit while adding app servers.`, `Running every zone too close to full capacity.`],
  interview:[`Calculate the 40-server base and 60-server zone-safe plan.`, `Name the next dependency to load test.`],
  tryit:{quiz:[{q:'What is next year’s peak after 60% growth from 12,000 per second?', options:['19,200 per second', '12,060 per second', '7,200 per second', '72,000 per second'], answer:0, why:'12,000 × 1.6 = 19,200.'}, {q:'Why does the plan need more than 40 servers across three zones?', options:['Two zones must carry peak if one fails', 'Every rider needs a private server', 'The route database has three tables', 'More servers remove all failures'], answer:0, why:'The remaining zones need enough headroom after a loss.'}], quizId:'rel-l9', note:'Change the transit peak, growth, and zone count in the calculator.'},
  sources:[`Google SRE book`, `Little, “A proof for the queuing formula L = λW” (1961)`, `Gunther, Guerrilla Capacity Planning`]
},
{
  id:'autoscaling', title:'Autoscaling', minutes:11, tags:['autoscaling','HPA','target tracking','predictive scaling','warm-up','cooldown'],
  summary:'Autoscaling adds or removes app copies as demand changes. Known commute peaks need capacity prepared before riders arrive.',
  problem:`<h3>A small example</h3><p>The transit app is quiet at night and busy before work.</p><ul><li>Four app copies run now.</li><li>CPU use rises to 95% during the morning rush.</li><li>New copies take time to start.</li></ul><p>How can the app add capacity without waiting until riders are already stuck?</p>`,
  intuition:`A bus operator schedules more buses before the known morning rush. Extra buses called after a surprise crowd still need travel time.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Watch the scaling controller react to busy arrival servers.</p>',
    steps:[
      {icon:'📊', title:'Measure load', text:'A load meter sees four app copies using about 95% CPU.'},
      {icon:'🎯', title:'Follow a target', text:'The controller aims for 60% CPU and calculates that about seven copies are needed.'},
      {icon:'➕', title:'Start more copies', text:'It requests three more app copies. They begin serving only after startup checks pass.'},
      {icon:'🕒', title:'Prepare known peaks', text:'Because startup takes time, schedule extra copies before the morning commute.'},
      {icon:'🛑', title:'Keep limits', text:'Set a maximum count and check the vehicle feed and route database before adding more app traffic.'}
    ],
    diagram:{title:'Scaling the arrival app', w:780, h:250, alt:'A load meter reports busy arrival app copies. A controller requests more copies and server capacity.',
      nodes:[{id:'lb', type:'lb', label:'Arrival traffic', x:90, y:125}, {id:'pods', type:'service', label:'App copies', sub:'4 to 7', x:290, y:125, w:160}, {id:'ms', type:'ext', label:'Load meter', x:500, y:50, w:130}, {id:'hpa', type:'service', label:'Scaling control', sub:'target 60% CPU', x:500, y:200, w:150}, {id:'ca', type:'ext', label:'Server pool', sub:'adds room', x:700, y:125, w:140}],
      edges:[{from:'lb', to:'pods'}, {from:'pods', to:'ms'}, {from:'ms', to:'hpa'}, {from:'hpa', to:'pods'}, {from:'pods', to:'ca', dashed:true}],
      steps:[
        {note:'Four arrival app copies become busy at 95% CPU.', flow:[['lb', 'pods', 'riders']], status:{pods:'hot'}},
        {note:'The controller compares 95% with its 60% target and asks for seven copies.', flow:[['pods', 'ms', 'CPU'], ['ms', 'hpa', '95%']], hl:['hpa']},
        {note:'Three new copies need space in the server pool before they can start.', flow:[['hpa', 'pods', 'seven copies'], ['pods', 'ca', 'need room']], hl:['ca']},
        {note:'After startup checks, all seven copies can answer riders.', status:{pods:'ok'}, sub:{pods:'7 copies, 58% CPU'}, flow:[['lb', 'pods']]}
      ]},
    mount:host => hpaCalc(host),
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Bus fleet', 'Arrival app'], [['More riders expected tomorrow morning', 'Schedule more app copies early'], ['Unexpected crowd arrives now', 'React to measured load'], ['Bus takes time to reach route', 'New copy needs startup time']])}</div><div class="callout tip"><b>Important point</b><p>Autoscaling cannot make a slow vehicle feed faster. Check downstream limits before increasing arrival-app traffic.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Demand change', 'Response'], [['Known morning commute', 'Schedule copies ahead of time'], ['Gradual unexpected rise', 'Scale from measured load'], ['Sudden overload before copies start', 'Use admission control to protect timely answers']])}</div>`,
    deep:`<h4>The numbers</h4><p>The count comes from ceiling(4 × 95 ÷ 60) = ceiling(6.33) = 7. Now count the delay. Say metrics arrive every 60 seconds, a new copy takes 90 seconds to start and 60 more to warm its caches. That is 60 + 90 + 60 = 210 seconds, or 3.5 minutes, of running hot. This is why a known commute is scheduled early.</p><p>With 7 copies, CPU is about 4 × 95 ÷ 7 = 54%. Run the formula again: ceiling(7 × 54 ÷ 60) = ceiling(6.3) = 7. The count settles.</p><h4>When it goes wrong</h4><p>Scaling in needs more care than scaling out. Say load drops for 1 minute and the controller removes 3 copies. A new peak 2 minutes later hits 4 copies again. Waiting for, say, 5 minutes of low load before removing copies avoids this. Also set a maximum, so a bug that burns CPU does not buy 200 servers. You will learn Kubernetes autoscaling in Module 10.</p>`
  },
  tradeoffs:{use:[`Schedule extra transit app copies before commute peaks.`, `React to unexpected gradual demand changes.`], avoid:[`Waiting for 95% CPU before a known rush.`, `Scaling app copies without checking the vehicle-feed limit.`], alt:[`Keep fixed spare copies when the app is small and predictable.`]},
  real:[
    {co:'Kubernetes HPA', tier:'confirmed', text:'Documents scaling a workload from current and target metrics.', src:'Kubernetes Horizontal Pod Autoscaling documentation'},
    {co:'AWS predictive scaling', tier:'confirmed', text:'Uses historical load to prepare capacity ahead of recurring demand.', src:'Amazon EC2 Auto Scaling documentation'}
  ],
  mistakes:[`Adding arrival app copies until the vehicle feed becomes overloaded.`, `Setting no maximum number of app copies.`, `Stopping copies while they still answer riders.`],
  interview:[`Calculate seven copies from four at 95% CPU and a 60% target.`, `Explain why the morning commute needs scheduled capacity.`],
  tryit:[{quiz:[{q:'How many copies does the target formula request from four at 95% with a 60% target?', options:['Seven', 'Four', 'Five', 'Ten'], answer:0, why:'Ceiling(4 × 95 ÷ 60) = 7.'}, {q:'What helps with a commute peak known in advance?', options:['Schedule extra copies before it starts', 'Wait for every server to fill', 'Disable route data', 'Remove the maximum limit'], answer:0, why:'New copies take time to start.'}]}, {note:'Compare reactive and scheduled app capacity for the morning commute and stadium crowd.', pg:'autoscaling'}],
  sources:[`Kubernetes HPA documentation`, `Amazon EC2 Auto Scaling documentation`, `KEDA documentation`]
}
];

SDA.register({
  kind:'module', id:'reliability', order:9, level:'advanced', icon:'🛡️', title:'Reliability',
  summary:'Keep a transit arrival app useful when its vehicle feed slows, a server stops, or riders arrive together. Learn how to limit failures and plan recovery.',
  outcomes:['Use timeouts and limited retries for vehicle-feed calls', 'Keep slow optional work from blocking arrivals', 'Explain database failover and zone or region protection', 'Choose recovery targets and test them with controlled faults', 'Plan commute capacity and scale app copies safely'],
  lessons,
  quiz:[
    {q:'What limits how long the arrival app waits for the vehicle feed?', options:['A timeout', 'A book index', 'A route colour', 'A second phone'], answer:0, why:'A timeout ends a slow call within the rider’s deadline.'},
    {q:'Why add jitter before a retry?', options:['To change the bus route', 'To spread retries from many riders', 'To remove all errors', 'To increase the deadline'], answer:1, why:'Random waits prevent callers from retrying together.'},
    {q:'What happens when the vehicle-feed breaker is open?', options:['Calls wait longer', 'The feed is called twice', 'New feed calls are skipped', 'Timetables are deleted'], answer:2, why:'The breaker fails fast and can use a clear fallback.'},
    {q:'How can slow route tips avoid blocking live arrivals?', options:['Use separate bounded worker pools', 'Use one unlimited queue', 'Make every timeout longer', 'Hide all bus stops'], answer:0, why:'Bulkheads reserve capacity for important calls.'},
    {q:'Why reject excess arrival requests before expensive work?', options:['To change location data', 'To keep accepted answers timely', 'To avoid using any server', 'To make the queue endless'], answer:1, why:'Early admission control protects useful completed requests.'},
    {q:'What must happen before a route database standby accepts writes?', options:['Riders refresh their phones', 'The old primary is fenced off', 'The map is redrawn', 'Every app copy is removed'], answer:1, why:'Only one primary should accept route edits.'},
    {q:'What does spreading app copies across zones in one region cover?', options:['Any region-wide failure', 'All bad deployments', 'One zone stopping', 'Wrong timetable data'], answer:2, why:'Other zones can serve when one zone fails.'},
    {q:'What does RPO limit after route data is lost?', options:['The age of saved edits that may be lost', 'The number of app icons', 'Bus travel time', 'The number of backup regions'], answer:0, why:'RPO is the acceptable data-loss window.'},
    {q:'What starts a useful vehicle-feed failure drill?', options:['A random server kill', 'A rider-facing prediction and measurement', 'Disabling all alerts', 'Skipping recovery checks'], answer:1, why:'The team needs a result it can observe and test.'},
    {q:'What is next year’s peak after 60% growth from 12,000 requests each second?', options:['12,060', '7,200', '19,200', '72,000'], answer:2, why:'12,000 × 1.6 = 19,200.'},
    {q:'Why add app copies before a known morning rush?', options:['New copies need startup time', 'Buses need more stops', 'The app has no metrics', 'Extra copies slow every request'], answer:0, why:'Reactive scaling starts after the rise and may arrive too late.'},
    {type:'scenario', q:'The vehicle feed slows while riders check Central Stop. Keep the arrival page useful.', answer:'<ol><li>Set a short feed-call timeout inside the rider request deadline.</li><li>Retry a temporary failure once after a varied wait.</li><li>Open a breaker when many feed calls fail and stop sending more calls briefly.</li><li>Show the last vehicle update time instead of a pretend live arrival.</li><li>Keep route tips in a separate small pool so they cannot take arrival capacity.</li><li>Test the failure with a small group and check what riders see.</li></ol>'},
    {type:'scenario', q:'The morning commute peak is growing and one zone may stop. Plan capacity and recovery.', answer:'<ol><li>Forecast peak arrival requests and load test one app server.</li><li>At 19,200 requests each second and 480 planned requests per server, start with 40 servers.</li><li>Across three zones, use 60 total so two zones can carry peak after one stops.</li><li>Schedule capacity before the known commute rush.</li><li>Keep route data in another zone and practice failover.</li><li>Set and test route-data RPO and app RTO for wider incidents.</li></ol>'}
  ],
  cheatsheet:[
    {h:'⏱ Feed calls', items:['Give the rider request a deadline', 'Timeout slow vehicle-feed calls', 'Retry temporary failures a limited number of times', 'Use backoff and jitter to spread retries']},
    {h:'🔌 Breaker and fallback', items:['Closed lets feed calls through', 'Open skips failing feed calls', 'Half-open tests recovery', 'Show the last update time instead of a false live arrival']},
    {h:'🧱 Keep the page useful', items:['Reserve separate pools for arrivals and route tips', 'Hide optional tips if they fail', 'Reject overload before expensive work', 'Goodput counts answers riders still want']},
    {h:'🌍 Copies and recovery', items:['One route database writer with a standby', 'Fence the old primary before promotion', 'Several zones cover a zone failure', 'Another region can cover a wider failure', 'RPO limits data loss and RTO limits downtime', 'Test a real restore']},
    {h:'🧪 Controlled drills', items:['Predict a rider-facing result', 'Cause one limited failure', 'Watch response time, errors, and fallback labels', 'Fix what fails and repeat the drill']},
    {h:'📈 Capacity and scaling', items:['Plan from commute peak rather than average', 'Leave capacity for growth and a lost zone', 'Check database and feed limits too', 'Schedule copies before known peaks', 'Use measured load for unexpected gradual growth']}
  ],
  glossary:[
    {term:'Timeout', aka:['timeouts'], def:'The longest time a caller waits for an answer before giving up. Example: the bus app waits at most 2 seconds for the vehicle feed.'},
    {term:'Deadline propagation', aka:['deadline'], def:'Passing a request’s remaining time to every call it makes, so none keeps working after the rider has given up. Example: if 1.5 seconds are left, the next call gets at most 1.5 seconds.'},
    {term:'Retry', aka:['retries'], def:'Sending a failed request again. It is safe only for short-lived failures and for requests that are safe to repeat. Example: one retry after a brief network blip.'},
    {term:'Exponential backoff', aka:['backoff'], def:'Waiting longer between each retry, usually doubling the wait up to a limit. Example: wait 1 second, then 2, then 4, then 8.'},
    {term:'Jitter', aka:['full jitter', 'decorrelated jitter'], def:'Adding a random amount to retry waits so clients that failed together do not retry together. Example: instead of everyone retrying at exactly 4 seconds, each waits between 2 and 4 seconds.'},
    {term:'Retry budget', def:'A limit on how many extra calls retries may add. Example: retries may add at most 10% more traffic, so they cannot overwhelm a struggling service.'},
    {term:'Retry storm', aka:['retry amplification'], def:'A surge of load because many clients retry at once, which often makes an outage worse. Example: 10,000 riders’ apps all retry every second, so the feed never recovers.'},
    {term:'Circuit breaker', def:'A guard that stops calls to a failing service, then lets a few test calls check whether it has recovered. Example: after 20 straight failures, the app stops calling the feed for 30 seconds.'},
    {term:'Half-open', def:'The circuit breaker state that allows a few test calls to see whether the service has recovered. Example: after 30 seconds, 3 calls are let through.'},
    {term:'Fail fast', def:'Returning an error immediately instead of waiting on a call that will probably fail. Example: an open circuit breaker answers in 1 ms instead of waiting 2 seconds.'},
    {term:'Bulkhead', aka:['bulkheads'], def:'A separate limit on resources for one job, so a slow one cannot use up everything, like the watertight walls of a ship. Example: route tips may use only 10 of the 100 workers.'},
    {term:'Fallback', aka:['fallbacks'], def:'A simpler answer used when the normal one fails. Example: show the last known bus position, clearly marked as old.'},
    {term:'Graceful degradation', def:'Keeping the main features working with fewer extras when parts fail. Example: the stop page still shows arrivals even though route tips are down.'},
    {term:'Goodput', def:'The rate of answers that arrive while the rider is still waiting. Example: 1,000 answers per second, but 300 arrive too late to be useful, so goodput is 700.'},
    {term:'Admission control', def:'Deciding at the entrance which requests to accept so the system stays within its capacity. Example: reject extra requests early, before they use the feed or the database.'},
    {term:'Redundancy', def:'Keeping extra working copies so a failure does not stop the service. Example: two app servers where one would be enough.'},
    {term:'Active-passive', aka:['hot standby', 'standby'], def:'Redundancy where a spare takes over only when the main one fails. Example: a standby database waits and is promoted after a crash.'},
    {term:'Active-active', def:'Redundancy where all copies serve traffic at the same time. Example: three app servers all answer riders.'},
    {term:'N+1 redundancy', aka:['N+2 redundancy'], def:'Having one (or two) more units than the load needs, so a failure is absorbed. Example: if 2 servers carry the peak, run 3.'},
    {term:'Fencing', def:'Stopping a removed node from making further changes. Example: shutting down the old leader or giving it a token that storage refuses.'},
    {term:'Availability zone', aka:['AZ', 'AZs', 'availability zones'], def:'A separate data centre (or group of them) inside a cloud region, with its own power and network. Example: if zone A loses power, zones B and C keep running.'},
    {term:'Region', aka:['regions', 'cloud region'], def:'A geographic area that contains several availability zones. Example: Mumbai is a region.'},
    {term:'Multi-region', aka:['multi-region deployment'], def:'Running a system in more than one cloud region for resilience or speed. Example: the app runs in Mumbai and in Singapore.'},
    {term:'Cell-based architecture', aka:['cell-based'], def:'Splitting a system into independent, complete copies called cells, each serving some of the users, to limit damage. Example: a bug in cell 3 affects only the riders in cell 3.'},
    {term:'Shuffle sharding', def:'Giving each customer a random small group of resources, so a customer that causes trouble hurts only a few others. Example: each tenant uses 2 of 8 workers, and a bad tenant shares both workers with very few others.'},
    {term:'Disaster recovery', aka:['DR'], def:'Plans and systems for getting the service back after a major failure. Example: restore the app in another region after a data centre is lost.'},
    {term:'RPO', aka:['recovery point objective'], def:'Recovery point objective: the most data you can afford to lose, measured in time. Example: an RPO of 5 minutes means you can lose at most the last 5 minutes of edits.'},
    {term:'RTO', aka:['recovery time objective'], def:'Recovery time objective: the longest time the service may stay down. Example: an RTO of 1 hour means you must be back within an hour.'},
    {term:'Pilot light', def:'A recovery plan where data is copied to another region and only the core is kept running, then grown after a failure. Example: a small database copy waits, and servers start only on failover.'},
    {term:'Warm standby', def:'A recovery plan with a smaller but working copy always running in another region. Example: it serves a trickle of traffic and scales up on failover.'},
    {term:'Point-in-time recovery', aka:['PITR'], def:'Restoring a database to any chosen moment by replaying its logs on top of a backup. Example: restore to 10:14, just before the bad delete at 10:15.'},
    {term:'Chaos engineering', aka:['chaos experiment', 'chaos experiments'], def:'Breaking things on purpose, in a controlled way, to learn whether the system copes. Example: switch off the route-tips service and check that the stop page still loads.'},
    {term:'Chaos Monkey', def:'Netflix’s tool that randomly shuts down servers in production, so teams build services that survive losing one. Example: a random server is killed on a weekday morning.'},
    {term:'Game day', aka:['game days'], def:'A planned practice where the team simulates a failure and responds as in a real incident. Example: pretend the feed provider is down and see who does what.'},
    {term:'Steady state', def:'A measurable sign of normal behaviour, used as the baseline in a chaos experiment. Example: riders get an arrival time or a clear “unavailable” note within 3 seconds.'},
    {term:'Capacity planning', def:'Estimating future peaks and keeping enough capacity, with spare room for failures. Example: the morning commute needs 20 servers, so plan 25.'},
    {term:'Load testing', aka:['load test'], def:'Sending controlled, heavy traffic to a system to see how much it can take. Example: send 5,000 requests a second and watch where it slows down.'},
    {term:'Headroom', def:'Spare capacity above the expected peak, to absorb spikes, failures and deploys. Example: peak is 70 servers’ worth of work, so run 100.'},
    {term:'Autoscaling', aka:['auto scaling', 'autoscaler'], def:'Adding or removing copies of an app automatically, from measured demand or a schedule. Example: add servers when CPU passes 60%.'},
    {term:'Target tracking', def:'An autoscaling rule that adjusts capacity to keep a metric near a target. Example: keep CPU near 60% by adding or removing copies.'},
    {term:'Predictive scaling', def:'Adding capacity ahead of time using a forecast from past load. Example: start extra servers at 7 AM because every weekday rush starts at 8.'},
    {term:'Horizontal Pod Autoscaler', aka:['HPA'], def:'The Kubernetes part that changes the number of copies of a workload based on metrics. Example: it scales from 4 copies to 7 when CPU rises.'},
    {term:'Warm-up', aka:['warm up'], def:'The time a new copy needs before it can serve at full speed. Example: a new server takes 3 minutes to load data and start answering.'},
    {term:'Cooldown', aka:['stabilization window', 'stabilisation window'], def:'A waiting period after scaling, so copies do not appear and disappear again and again. Example: wait 5 minutes before removing servers.'}
  ],
  sources:['Nygard, Release It! (2018)', 'Beyer et al., Site Reliability Engineering (2016)', 'Amazon Builders’ Library', 'AWS, Disaster Recovery of Workloads on AWS', 'Netflix Tech Blog reliability articles', 'Basiri et al., Chaos Engineering (2016)', 'AWS, GitLab and GitHub incident reports', 'Kubernetes and Amazon EC2 Auto Scaling documentation']
});
} catch(e){ console.error('[SDA] module reliability', e); SDA.errors.push({id:'reliability', error:e}); }
})();
