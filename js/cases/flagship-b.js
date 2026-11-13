/* =====================================================================
   PART 11 · FLAGSHIP CASES (b) — Uber/Ola · Zomato/Swiggy · WhatsApp
   Each: 10-step evolution, several request flows, Break-It, and real
   simulations in the Deep-dives tab (pure maths exposed on
   SDA.flagshipB so it can be checked against theory).
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, esc, fmtNum, fmtBytes, sv, rng} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const frag = html => document.createRange().createContextualFragment(html);
const hr = () => el('hr', {style:{border:'0', borderTop:'1px solid var(--border)', margin:'18px 0'}});
const note = html => el('p', {class:'lab-hint', html});
const cssVar = (n, fb) => { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb; } catch(e){ return fb; } };
const pct = (a, b) => b ? a / b * 100 : 0;
const quantile = (arr, q) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

/* =========================== UBER: DISPATCH =========================== */
/* Hungarian algorithm (min-cost assignment), rows ≤ cols. Returns col index per row. */
function hungarian(a){
  const n = a.length, m = a[0].length, INF = 1e18;
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0), p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++){
    p[0] = i; let j0 = 0; const minv = new Array(m + 1).fill(INF), used = new Array(m + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = INF, j1 = 0;
      for (let j = 1; j <= m; j++) if (!used[j]){ const cur = a[i0 - 1][j - 1] - u[i0] - v[j]; if (cur < minv[j]){ minv[j] = cur; way[j] = j0; } if (minv[j] < delta){ delta = minv[j]; j1 = j; } }
      for (let j = 0; j <= m; j++){ if (used[j]){ u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ans = new Array(n); for (let j = 1; j <= m; j++) if (p[j]) ans[p[j] - 1] = j - 1; return ans;
}
const CITY = 10, ROAD = 1.3, MIN_PER_KM = 3; // 10×10 km city, roads ≈ 1.3× straight line, 20 km/h in traffic
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/* grid ("geohash-like") index: nearest FREE driver, counting how many drivers were examined */
function gridIndex(pts, cell){
  const g = new Map(), key = (i, j) => i * 10007 + j;
  pts.forEach((p, k) => { const kk = key(Math.floor(p.x / cell), Math.floor(p.y / cell)); if (!g.has(kk)) g.set(kk, []); g.get(kk).push(k); });
  return {nearest(q, free){
    const ci = Math.floor(q.x / cell), cj = Math.floor(q.y / cell), maxR = Math.ceil(CITY / cell) + 1; let best = -1, bd = Infinity, examined = 0;
    for (let r = 0; r <= maxR; r++){
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++){
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        const list = g.get(key(i, j)); if (!list) continue;
        for (const k of list){ if (!free[k]) continue; examined++; const d = dist(q, pts[k]); if (d < bd){ bd = d; best = k; } }
      }
      if (best >= 0 && bd <= r * cell) break; // nothing in ring r+1 can be closer than r·cell
    }
    return {best, d:bd, examined};
  }};
}
function dispatchRound(o){
  const R = rng(o.seed || 1), D = o.drivers, N = Math.min(o.requests, D);
  const gauss = () => Math.sqrt(-2 * Math.log(R() || 1e-9)) * Math.cos(2 * Math.PI * R());
  const clampC = v => Math.max(.05, Math.min(CITY - .05, v));
  const HOT = [{x:3, y:3.2}, {x:7.2, y:6.6}];
  const drv = []; for (let i = 0; i < D; i++) drv.push({x:R() * CITY, y:R() * CITY});
  const req = []; for (let i = 0; i < N; i++){ if (R() < o.hotspot){ const c = HOT[i % 2]; req.push({x:clampC(c.x + gauss() * .9), y:clampC(c.y + gauss() * .9)}); } else req.push({x:R() * CITY, y:R() * CITY}); }
  // greedy, arrival order, using the grid index
  const idx = gridIndex(drv, o.cell || 1), free = new Array(D).fill(true); const gA = [], gD = []; let examined = 0;
  req.forEach(q => { const r = idx.nearest(q, free); examined += r.examined; free[r.best] = false; gA.push(r.best); gD.push(r.d * ROAD); });
  // batched: optimal assignment over the whole window
  const cost = req.map(q => drv.map(d => dist(q, d) * ROAD)); const bA = hungarian(cost); const bD = bA.map((j, i) => cost[i][j]);
  const sum = a => a.reduce((x, y) => x + y, 0);
  return {drv, req, greedy:{assign:gA, km:gD, total:sum(gD), max:Math.max(...gD)}, batch:{assign:bA, km:bD, total:sum(bD), max:Math.max(...bD)}, examinedPerReq:examined / N, brutePerReq:D, n:N};
}
function locationLoad(o){ // drivers online, ping interval (s), bytes per ping
  const writes = o.drivers / o.interval; return {writes, bps:writes * o.bytes * 8, rowsPerDay:writes * 86400, memory:o.drivers * 64};
}
function dispatchSim(host){
  const P = {drivers:150, requests:40, hotspot:.6, cell:1, seed:7, view:'batch'}; let res = null;
  const W0 = 520; const cv = el('canvas', {role:'img', 'aria-label':'City map: drivers, ride requests and the chosen matches'}); const g = cv.getContext('2d');
  const met = ui.metrics(null, [{id:'g', label:'Greedy: avg pickup', instant:true, fmt:v => v.toFixed(1) + ' min'}, {id:'b', label:'Batched: avg pickup', instant:true, fmt:v => v.toFixed(1) + ' min'}, {id:'save', label:'Batching saves', unit:'%', instant:true, fmt:v => v.toFixed(1)}, {id:'scan', label:'Drivers checked per request', instant:true, fmt:v => v.toFixed(1)}]);
  const out = el('div');
  function draw(){
    const w = Math.max(260, Math.min(W0, host.clientWidth - 8 || W0)), H = w; cv.width = w * 2; cv.height = H * 2; cv.style.width = w + 'px'; cv.style.height = H + 'px'; g.setTransform(2, 0, 0, 2, 0, 0);
    const S = v => v / CITY * (w - 20) + 10; g.clearRect(0, 0, w, H);
    g.strokeStyle = cssVar('--border', '#334'); g.lineWidth = 1;
    for (let k = 0; k <= CITY; k += P.cell){ g.beginPath(); g.moveTo(S(k), S(0)); g.lineTo(S(k), S(CITY)); g.moveTo(S(0), S(k)); g.lineTo(S(CITY), S(k)); g.stroke(); }
    const A = P.view === 'batch' ? res.batch.assign : res.greedy.assign; const used = new Set(A);
    g.strokeStyle = P.view === 'batch' ? cssVar('--ok', '#2c8') : cssVar('--warn', '#e93'); g.lineWidth = 1.6;
    res.req.forEach((q, i) => { const d = res.drv[A[i]]; g.beginPath(); g.moveTo(S(q.x), S(q.y)); g.lineTo(S(d.x), S(d.y)); g.stroke(); });
    res.drv.forEach((d, k) => { g.fillStyle = used.has(k) ? cssVar('--accent2', '#a6f') : cssVar('--accent1', '#2ce'); g.beginPath(); g.arc(S(d.x), S(d.y), used.has(k) ? 3.2 : 2.2, 0, 7); g.fill(); });
    g.fillStyle = cssVar('--bad', '#f55'); res.req.forEach(q => { g.fillRect(S(q.x) - 3.5, S(q.y) - 3.5, 7, 7); });
  }
  function run(){
    res = dispatchRound(P);
    const ga = res.greedy.total / res.n * MIN_PER_KM, ba = res.batch.total / res.n * MIN_PER_KM;
    met.set('g', ga); met.set('b', ba); met.set('save', pct(res.greedy.total - res.batch.total, res.greedy.total)); met.set('scan', res.examinedPerReq);
    out.innerHTML = '';
    out.append(frag(h.table(['', 'Greedy (first come, nearest driver)', 'Batched (optimal for the window)'], [
      ['Total pickup distance', res.greedy.total.toFixed(1) + ' km', res.batch.total.toFixed(1) + ' km'],
      ['Average pickup time', ga.toFixed(1) + ' min', ba.toFixed(1) + ' min'],
      ['Worst pickup time', (res.greedy.max * MIN_PER_KM).toFixed(1) + ' min', (res.batch.max * MIN_PER_KM).toFixed(1) + ' min']], [1, 2])));
    out.append(el('div', {class:'verdict ok', html:`Grid index: each nearest-driver lookup checked <b>${res.examinedPerReq.toFixed(1)}</b> drivers instead of all <b>${res.brutePerReq}</b> (${(res.brutePerReq / Math.max(1, res.examinedPerReq)).toFixed(0)}× less work) and always found the true nearest. Batching the ${res.n} requests cut total pickup distance by <b>${pct(res.greedy.total - res.batch.total, res.greedy.total).toFixed(1)}%</b>: greedy gives an early rider the driver a later rider needed more.`}));
    draw();
  }
  const viewSel = ui.select({label:'Lines show', value:P.view, options:[['batch', 'Batched matches (green)'], ['greedy', 'Greedy matches (amber)']], onChange:v => { P.view = v; draw(); }});
  host.append(note('A real matcher. Drivers (dots) and ride requests (red squares) in a 10 × 10 km city. <b>Greedy</b> serves requests in arrival order, each taking the nearest free driver found through a grid index (like geohash, S2 or H3 cells). <b>Batched</b> collects the same requests for a short window and solves the assignment problem exactly (Hungarian algorithm) to minimise total pickup distance. Roads are modelled as 1.3× the straight line at 20 km/h.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Free drivers', min:60, max:400, step:10, value:P.drivers, onInput:v => { P.drivers = v; run(); }}).el,
      ui.slider({label:'Requests in the window', min:5, max:60, value:P.requests, onInput:v => { P.requests = v; run(); }}).el,
      ui.slider({label:'Requests from 2 hotspots', min:0, max:1, step:.1, value:P.hotspot, fmt:v => Math.round(v * 100) + '%', onInput:v => { P.hotspot = v; run(); }}).el,
      ui.slider({label:'Grid cell size', min:.5, max:5, step:.5, value:P.cell, fmt:v => v + ' km', onInput:v => { P.cell = v; run(); }}).el,
      viewSel.el),
    el('div', {class:'pill-row', style:{margin:'8px 0'}}, ui.button('🎲 New round', () => { P.seed++; run(); }, 'sm')),
    met.el, el('div', {style:{display:'flex', justifyContent:'center', margin:'10px 0'}}, cv), out);
  run();
}
function locationCalc(host){
  const P = {drivers:500000, interval:4, bytes:120}; const out = el('div');
  function run(){
    const r = locationLoad(P); out.innerHTML = '';
    out.append(frag(h.table(['Quantity', 'Value'], [['GPS updates per second', fmtNum(r.writes)], ['Ingest bandwidth', fmtNum(r.bps / 1e6) + ' Mbps'], ['Rows per day if every ping were a DB row', fmtNum(r.rowsPerDay)], ['Memory for “latest position per driver”', fmtNum(r.memory / 1e6) + ' MB']], [1])));
    out.append(el('div', {class:'verdict ' + (r.writes > 20000 ? 'warn' : 'ok'), html:`Only the <b>latest</b> position matters for matching, and it fits in about <b>${fmtNum(r.memory / 1e6)} MB</b> of RAM. Storing ${fmtNum(r.rowsPerDay)} rows a day in the trip database would be pure waste: keep live positions in memory, sharded by city cell, and append raw pings to a log for analytics.`}));
  }
  host.append(note('Why live locations don’t belong in the trip database. Inputs are illustrative.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Drivers online', min:10000, max:2000000, step:10000, value:P.drivers, fmt:v => fmtNum(v), onInput:v => { P.drivers = v; run(); }}).el,
      ui.slider({label:'Ping interval', min:1, max:15, value:P.interval, fmt:v => v + ' s', onInput:v => { P.interval = v; run(); }}).el,
      ui.slider({label:'Bytes per ping', min:40, max:400, step:20, value:P.bytes, fmt:v => v + ' B', onInput:v => { P.bytes = v; run(); }}).el), out);
  run();
}

/* =========================== ZOMATO: DINNER RUSH (discrete-event) =========================== */
const ZONE = 4, PREP = [10, 25], HAND = 2;
const travel = (a, b) => dist(a, b) * ROAD * MIN_PER_KM;
function rushRun(o){
  const R = rng(o.seed || 11), DT = .5, T_END = 180, riders = o.riders, policy = o.policy;
  const gauss = () => Math.sqrt(-2 * Math.log(R() || 1e-9)) * Math.cos(2 * Math.PI * R());
  const rests = []; for (let i = 0; i < 30; i++) rests.push({x:.3 + R() * (ZONE - .6), y:.3 + R() * (ZONE - .6)});
  const lam = t => o.base + o.peak * Math.exp(-Math.pow((t - 90) / 35, 2));
  // pre-generate orders (same arrivals for every policy with the same seed)
  const orders = []; let t = 0;
  while (true){ const lm = o.base + o.peak; t += -Math.log(R() || 1e-9) / lm; if (t > T_END) break; if (R() > lam(t) / lm) continue;
    const r = Math.floor(R() * rests.length), a = R() * 2 * Math.PI, rad = Math.sqrt(R()) * 2.5, prep = PREP[0] + R() * (PREP[1] - PREP[0]);
    const c = {x:Math.max(0, Math.min(ZONE, rests[r].x + Math.cos(a) * rad)), y:Math.max(0, Math.min(ZONE, rests[r].y + Math.sin(a) * rad))};
    orders.push({id:orders.length, t, rest:r, cust:c, ready:t + prep, est:t + prep + gauss() * 3, rider:-1, picked:-1, done:-1}); }
  const rid = []; for (let i = 0; i < riders; i++) rid.push({x:R() * ZONE, y:R() * ZONE, busy:false, plan:null, waited:0});
  let next = 0; const open = []; const series = [];
  const assign = (rd, list) => { list.forEach(od => { od.rider = rd.i; const k = open.indexOf(od); if (k >= 0) open.splice(k, 1); }); rd.busy = true; rd.since = t; rd.plan = {orders:list, stage:'toRest', eta:t + travel(rd, rests[list[0].rest]), at:rests[list[0].rest]}; };
  for (t = 0; t < 900; t += DT){
    while (next < orders.length && orders[next].t <= t) open.push(orders[next++]);
    // advance riders
    for (const rd of rid){ if (!rd.busy) continue; const p = rd.plan;
      if (p.stage === 'toRest' && t >= p.eta){ rd.x = p.at.x; rd.y = p.at.y; p.stage = 'wait'; }
      if (p.stage === 'wait'){ const ready = Math.max(...p.orders.map(x => x.ready)); if (t >= ready){ p.orders.forEach(x => x.picked = t); p.stage = 'drop'; p.k = 0; p.orders.sort((a, b) => dist(rd, a.cust) - dist(rd, b.cust)); p.eta = t + HAND + travel(rd, p.orders[0].cust); } else rd.waited += DT; }
      if (p.stage === 'drop' && t >= p.eta){ const od = p.orders[p.k]; rd.x = od.cust.x; rd.y = od.cust.y; od.done = t + HAND; p.k++;
        if (p.k < p.orders.length) p.eta = t + HAND + travel(rd, p.orders[p.k].cust); else { rd.busy = false; rd.plan = null; rd.freeAt = t + HAND; rd.busyMin = (rd.busyMin || 0) + t + HAND - rd.since; } } }
    // dispatch
    rid.forEach((r, i) => r.i = i);
    for (const od of open.slice()){
      if (od.rider >= 0) continue; // already taken as the second order of a batch
      const idle = rid.filter(r => !r.busy && (r.freeAt == null || r.freeAt <= t)); if (!idle.length) break;
      let best = null, bt = Infinity; for (const r of idle){ const tt = travel(r, rests[od.rest]); if (tt < bt){ bt = tt; best = r; } }
      if (policy !== 'now' && t + bt < od.est - 2) continue; // just in time: leave the rider free until the trip time ≈ remaining prep
      const list = [od];
      if (policy === 'batch'){ const mate = open.find(x => x !== od && x.rest === od.rest && x.est <= od.est + 5 && dist(x.cust, od.cust) <= 2); if (mate) list.push(mate); }
      assign(best, list);
    }
    if (t <= 240 && Math.abs(t - Math.round(t)) < 1e-9) series.push(open.length);
    if (t > T_END && next >= orders.length && !open.length && rid.every(r => !r.busy)) break;
  }
  const done = orders.filter(x => x.done >= 0), dt = done.map(x => x.done - x.t);
  return {orders:orders.length, delivered:done.length, avg:mean(dt), p90:quantile(dt, .9), late:pct(dt.filter(x => x > 45).length, done.length),
    riderWait:rid.reduce((a, r) => a + r.waited, 0) / Math.max(1, done.length), foodWait:mean(done.map(x => x.picked - x.ready)),
    riderMin:rid.reduce((a, r) => a + (r.busyMin || 0), 0) / Math.max(1, done.length), undelivered:orders.length - done.length, maxBacklog:Math.max(...series), series, batched:pct(done.filter(x => orders.some(y => y !== x && y.rider === x.rider && y.picked === x.picked)).length, done.length)};
}
const POLICIES = [['now', 'Assign at once', '--warn'], ['jit', 'Just in time', '--accent1'], ['batch', 'Just in time + batching', '--ok']];
function rushSim(host){
  const P = {riders:40, base:1, peak:2.5, seed:11}; const out = el('div'), chart = el('div');
  function drawChart(res){
    chart.innerHTML = ''; const W = 640, H = 220, L = 46, B = 30, T = 12, Rr = 12; const maxY = Math.max(5, ...res.map(r => r.series.length ? Math.max(...r.series) : 0)); const maxX = 240;
    const svg = sv('svg', {viewBox:`0 0 ${W} ${H}`, class:'mini-chart', role:'img'}); const tt = sv('title'); tt.textContent = 'Orders waiting for a rider over the evening, per policy'; svg.append(tt);
    const X = x => L + x / maxX * (W - L - Rr), Y = y => H - B - y / maxY * (H - B - T);
    [0, .5, 1].forEach(f => { const v = Math.round(maxY * f); svg.append(sv('line', {class:'gridl', x1:L, x2:W - Rr, y1:Y(v), y2:Y(v)})); const tx = sv('text', {x:L - 6, y:Y(v) + 4, 'text-anchor':'end'}); tx.textContent = v; svg.append(tx); });
    [0, 60, 120, 180, 240].forEach(m => { const tx = sv('text', {x:X(m), y:H - 10, 'text-anchor':'middle'}); tx.textContent = `${19 + m / 60}:00`; svg.append(tx); });
    res.forEach((r, k) => { let d = ''; r.series.forEach((v, i) => { d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); }); const pth = sv('path', {d, fill:'none', 'stroke-width':'2.2'}); pth.style.stroke = `var(${POLICIES[k][2]})`; svg.append(pth); });
    const box = el('div', {class:'chart-box'}); box.append(svg); chart.append(box);
    chart.append(el('div', {class:'pill-row', style:{marginTop:'4px'}}, ...POLICIES.map(p => el('span', {class:'chip', html:`<span style="display:inline-block;width:12px;height:3px;background:var(${p[2]});margin-right:6px;vertical-align:middle"></span>${p[1]}`}))));
  }
  function run(){
    const res = POLICIES.map(([id]) => rushRun(Object.assign({}, P, {policy:id})));
    out.innerHTML = '';
    out.append(frag(h.table(['7 pm – 10 pm, ' + res[0].orders + ' orders', ...POLICIES.map(p => p[1])], [
      ['Average order → door', ...res.map(r => r.avg.toFixed(1) + ' min')],
      ['90th percentile', ...res.map(r => r.p90.toFixed(1) + ' min')],
      ['Orders later than 45 min', ...res.map(r => r.late.toFixed(1) + '%')],
      ['Rider minutes waiting at restaurants, per order', ...res.map(r => r.riderWait.toFixed(1))],
      ['Food waiting for a rider (avg)', ...res.map(r => r.foodWait.toFixed(1) + ' min')],
      ['Rider minutes spent per delivered order', ...res.map(r => r.riderMin.toFixed(1))],
      ['Most orders without a rider yet (incl. deliberately held)', ...res.map(r => String(r.maxBacklog))],
      ['Orders delivered in a batch of two', ...res.map(r => r.batched.toFixed(0) + '%')]], [1, 2, 3])));
    drawChart(res);
    const [a, b, c] = res; const f = v => v.toFixed(1);
    const jitDel = Math.abs(b.avg - a.avg) < .5 ? 'about the same delivery time' : b.avg < a.avg ? `faster delivery (${f(a.avg)} → ${f(b.avg)} min)` : `slightly slower delivery (${f(a.avg)} → ${f(b.avg)} min), because food sometimes waits for a rider who was held back`;
    out.append(el('div', {class:'verdict ' + (c.riderMin < a.riderMin ? 'ok' : 'warn'), html:`Assigning at once ties up a rider for <b>${f(a.riderMin)} min</b> per order, <b>${f(a.riderWait)}</b> of them waiting at the restaurant. Just in time keeps riders free until their trip time matches the remaining prep time: <b>${f(b.riderMin)} min</b> per order (${f(b.riderWait)} waiting), with ${jitDel}. Batching two orders from the same kitchen shares one trip: <b>${f(c.riderMin)} min</b> per order and an average delivery of <b>${f(c.avg)} min</b>. Fewer rider-minutes per order is what lets the same fleet survive the peak; when riders are scarce, every policy drowns (try 25 riders).`}));
  }
  host.append(note('A discrete-event simulation of one city zone (4 × 4 km, 30 restaurants, customers within 2.5 km) from 7 to 10 pm. Orders arrive as a Poisson process with a dinner peak at 8:30; prep takes 10–25 min, and the platform’s prep-time estimate is off by ±3 min. Riders travel at 20 km/h on roads 1.3× the straight line, plus 2 min per hand-over. All three policies see exactly the same orders. Inputs are illustrative.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Riders on shift', min:20, max:80, value:P.riders, onInput:v => { P.riders = v; run(); }}).el,
      ui.slider({label:'Extra orders/min at the 8:30 peak', min:0, max:6, step:.5, value:P.peak, onInput:v => { P.peak = v; run(); }}).el,
      ui.slider({label:'Base orders/min', min:.5, max:3, step:.5, value:P.base, onInput:v => { P.base = v; run(); }}).el),
    el('div', {class:'pill-row', style:{margin:'8px 0'}}, ui.button('🎲 Another evening', () => { P.seed++; run(); }, 'sm')), out, chart);
  run();
}

/* =========================== WHATSAPP: DELIVERY GUARANTEES =========================== */
function heap(){ const a = []; return {push(x){ a.push(x); let i = a.length - 1; while (i){ const p = (i - 1) >> 1; if (a[p].t <= a[i].t) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }, pop(){ const top = a[0], last = a.pop(); if (a.length){ a[0] = last; let i = 0; for (;;){ const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].t < a[m].t) m = l; if (r < a.length && a[r].t < a[m].t) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }, get size(){ return a.length; }}; }
/* mode 1 = fire and forget · 2 = retry until acked, no ids · 3 = ids + acks + dedupe + per-chat sequence */
function deliveryRun(o){
  const R = rng(o.seed || 3), N = o.n, p = o.loss, BASE = 80, J = o.jitter, RTO = 1500, GAP = 50, MAXTRY = o.mode === 3 ? 40 : 8;
  const q = heap(); let tx = 0; const delay = () => BASE - Math.log(R() || 1e-9) * J; const lost = () => R() < p;
  const send = (t, ev) => { if (ev.kind === 'msg') tx++; if (!lost()) q.push(Object.assign({}, ev, {t:t + delay()})); };
  const acked = {a:new Set(), s:new Set()}; const tries = {}; const srvSeen = new Set(), bobSeen = new Set();
  const shown = []; const pend = new Map(); let nextSeq = 0; const sentAt = [];
  const show = (id, t) => shown.push({id, t});
  for (let i = 0; i < N; i++){ sentAt[i] = i * GAP; q.push({t:i * GAP, kind:'start', id:i}); }
  let copyId = 0;
  while (q.size){
    const e = q.pop(), t = e.t;
    if (e.kind === 'start'){ send(t, {kind:'msg', hop:'a', id:e.id, copy:e.id}); if (o.mode > 1){ tries['a' + e.id] = 1; q.push({t:t + RTO, kind:'rto', hop:'a', id:e.id, copy:e.id}); } }
    else if (e.kind === 'rto'){ const key = e.hop + e.copy; if (acked[e.hop].has(key) || tries[key] >= MAXTRY) continue; tries[key]++; send(t, {kind:'msg', hop:e.hop, id:e.id, copy:e.copy}); q.push({t:t + RTO, kind:'rto', hop:e.hop, id:e.id, copy:e.copy}); }
    else if (e.kind === 'ack'){ acked[e.hop].add(e.hop + e.copy); }
    else if (e.kind === 'msg' && e.hop === 'a'){ // server receives from Alice
      if (o.mode > 1) send(t, {kind:'ack', hop:'a', copy:e.copy});
      if (o.mode === 3 && srvSeen.has(e.id)) continue; srvSeen.add(e.id);
      const c = o.mode === 2 ? 'c' + (copyId++) : 's' + e.id; // without ids every copy is a new message
      send(t, {kind:'msg', hop:'s', id:e.id, copy:c}); if (o.mode > 1){ tries['s' + c] = 1; q.push({t:t + RTO, kind:'rto', hop:'s', id:e.id, copy:c}); } }
    else if (e.kind === 'msg' && e.hop === 's'){ // Bob receives
      if (o.mode > 1) send(t, {kind:'ack', hop:'s', copy:e.copy});
      if (o.mode < 3){ show(e.id, t); continue; }
      if (bobSeen.has(e.id)) continue; bobSeen.add(e.id); pend.set(e.id, t);
      while (pend.has(nextSeq)){ pend.delete(nextSeq); show(nextSeq, t); nextSeq++; } }
  }
  const uniq = new Set(shown.map(x => x.id)); let maxId = -1, ooo = 0; const seen = new Set(); let dup = 0; const lat = [];
  for (const s of shown){ if (seen.has(s.id)){ dup++; continue; } seen.add(s.id); if (s.id < maxId) ooo++; maxId = Math.max(maxId, s.id); lat.push(s.t - sentAt[s.id]); }
  return {n:N, delivered:uniq.size, lost:N - uniq.size, dup, ooo, avgLat:mean(lat), p99:quantile(lat, .99), txPerMsg:tx / N, first:shown.slice(0, 48)};
}
function fanout(o){ // group size g (incl. sender), devices per member d
  const others = (o.g - 1) * o.d + (o.d - 1);
  return {deliveries:others, pairwise:{encrypt:others, upload:others * o.size}, senderKey:{encrypt:1, upload:o.size, setup:others}};
}
const MODES = [[1, 'Fire and forget'], [2, 'Retry until acked (no ids)'], [3, 'Ids + acks + dedupe + sequence']];
function deliverySim(host){
  const P = {loss:.1, jitter:120, n:500, seed:3}; const out = el('div'), strip = el('div');
  function run(){
    const res = MODES.map(([m]) => deliveryRun(Object.assign({}, P, {mode:m})));
    out.innerHTML = '';
    out.append(frag(h.table([P.n + ' messages, ' + Math.round(P.loss * 100) + '% packet loss', ...MODES.map(m => m[1])], [
      ['Never arrived', ...res.map(r => `${r.lost} (${pct(r.lost, r.n).toFixed(1)}%)`)],
      ['Shown twice (duplicates)', ...res.map(r => String(r.dup))],
      ['Shown out of order', ...res.map(r => String(r.ooo))],
      ['Average time to Bob’s screen', ...res.map(r => Math.round(r.avgLat) + ' ms')],
      ['p99 time to screen', ...res.map(r => Math.round(r.p99) + ' ms')],
      ['Message transmissions per message (both hops)', ...res.map(r => r.txPerMsg.toFixed(2))]], [1, 2, 3])));
    const theory = 1 - Math.pow(1 - P.loss, 2);
    out.append(el('div', {class:'verdict ok', html:`Fire-and-forget loses <b>${pct(res[0].lost, P.n).toFixed(1)}%</b> (theory: 1 − (1 − p)² = ${(theory * 100).toFixed(1)}%, because a message crosses two lossy hops). Retrying fixes loss but creates <b>${res[1].dup}</b> duplicates when acks are lost. With message ids, acks, de-duplication and per-chat sequence numbers, Bob sees every message exactly once, in order. The cost is retransmissions (${res[2].txPerMsg.toFixed(2)} per message vs a theoretical 2/(1 − p)² = ${(2 / Math.pow(1 - P.loss, 2)).toFixed(2)}) and the time spent holding a message until the gap before it is filled (higher p99).`}));
    strip.innerHTML = ''; strip.append(el('p', {class:'lab-hint', style:{margin:'10px 0 4px'}}, 'Bob’s screen, first 48 messages shown in each mode (number = message sent order; amber = duplicate, red = out of order):'));
    res.forEach((r, k) => { const row = el('div', {class:'pill-row', style:{gap:'3px', margin:'4px 0'}}, el('b', {style:{fontSize:'12px', minWidth:'120px'}}, MODES[k][1])); const seen = new Set(); let mx = -1;
      r.first.forEach(s => { const dup = seen.has(s.id), ooo = !dup && s.id < mx; seen.add(s.id); if (!dup) mx = Math.max(mx, s.id); row.append(el('span', {class:'mono', style:{fontSize:'11px', padding:'1px 4px', borderRadius:'4px', border:'1px solid ' + (dup ? 'var(--warn)' : ooo ? 'var(--bad)' : 'var(--border)'), color:dup ? 'var(--warn)' : ooo ? 'var(--bad)' : 'var(--text)'}}, String(s.id))); });
      strip.append(row); });
  }
  host.append(note('An event-driven simulation of Alice → server → Bob over a lossy mobile network. Alice sends a message every 50 ms; each hop takes 80 ms plus a random delay (so messages can overtake each other), and every packet, including acks, is dropped with probability p. Retries fire after 1.5 s without an ack.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Packet loss p', min:0, max:.4, step:.02, value:P.loss, fmt:v => Math.round(v * 100) + '%', onInput:v => { P.loss = v; run(); }}).el,
      ui.slider({label:'Random delay (mean)', min:0, max:400, step:20, value:P.jitter, fmt:v => v + ' ms', onInput:v => { P.jitter = v; run(); }}).el,
      ui.slider({label:'Messages', min:100, max:2000, step:100, value:P.n, onInput:v => { P.n = v; run(); }}).el),
    el('div', {class:'pill-row', style:{margin:'8px 0'}}, ui.button('🎲 Re-run with new randomness', () => { P.seed++; run(); }, 'sm')), out, strip);
  run();
}
function fanoutCalc(host){
  const P = {g:256, d:2, size:300}; const out = el('div');
  function run(){
    const r = fanout(P); out.innerHTML = '';
    out.append(frag(h.table(['Per message sent to the group', 'Pairwise encryption (encrypt for every device)', 'Sender keys (WhatsApp groups)'], [
      ['Encryptions on the sender’s phone', fmtNum(r.pairwise.encrypt), '1'],
      ['Bytes the sender uploads', fmtBytes(r.pairwise.upload), fmtBytes(r.senderKey.upload)],
      ['Copies the server delivers', fmtNum(r.deliveries), fmtNum(r.deliveries)],
      ['One-time setup', '—', `${fmtNum(r.senderKey.setup)} pairwise messages to share the sender key (again when someone leaves)`]], [1, 2])));
    out.append(el('div', {class:'verdict ok', html:`The server fans out <b>${fmtNum(r.deliveries)}</b> deliveries either way. Sender keys move the work off the phone: <b>1</b> encryption and <b>${fmtBytes(r.senderKey.upload)}</b> uploaded instead of ${fmtNum(r.pairwise.encrypt)} and ${fmtBytes(r.pairwise.upload)}. The trade-off: when a member leaves, every remaining member must create and share a fresh sender key.`}));
  }
  host.append(note('Group messages with end-to-end encryption. The server can’t read messages, so it can only copy ciphertext; the question is how many ciphertexts the sender has to make. Each member may have several devices (phone + linked devices), and each device has its own keys.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Group size (incl. sender)', min:2, max:1024, value:P.g, onInput:v => { P.g = v; run(); }}).el,
      ui.slider({label:'Devices per member', min:1, max:5, value:P.d, onInput:v => { P.d = v; run(); }}).el,
      ui.slider({label:'Message size', min:50, max:2000, step:50, value:P.size, fmt:v => v + ' B', onInput:v => { P.size = v; run(); }}).el), out);
  run();
}
SDA.flagshipB = {hungarian, gridIndex, dispatchRound, locationLoad, rushRun, deliveryRun, fanout};
/* ======================= 1. UBER / OLA ======================= */
SDA.register({kind:'case', id:'uber', tier:'flagship', icon:'🚕', title:'Uber / Ola (ride hailing)', tagline:'Millions of moving dots, matched in seconds: geospatial indexes, dispatch and surge.', tags:['geospatial', 'h3', 's2', 'dispatch', 'matching', 'websockets', 'surge pricing', 'kafka', 'eta'],
  modules:['search', 'realtime', 'distributed', 'async', 'databases'],
  summary:'A rider taps “Book”; within seconds the system must find nearby free drivers, estimate who can arrive fastest on real roads, offer the trip to one of them, and keep both phones updated as the car moves. The hard parts are a <b>firehose of GPS updates</b>, <b>nearest-neighbour search over moving objects</b>, <b>matching that is globally good, not just locally greedy</b>, and a <b>trip state machine</b> that must never double-charge or lose a ride.',
  accuracy:'Uber has published a lot: the dispatch system using Google S2 cells and Ringpop (2015 talk), H3, Schemaless, the move from Postgres to MySQL, its push platform, DeepETA and its domain-oriented microservices; these are labelled confirmed. The exact dispatch and pricing algorithms are not public, so the matching and surge models here are educational. Ola documents far less publicly; nothing here describes Ola’s internals. Numbers are illustrative unless marked publicly disclosed.',
  overview:{what:'Riders request trips; drivers stream their location; the platform matches them, prices the trip, tracks it live and settles payment at the end. In India the same design also covers autos and bikes, cash payments and very dense pickup areas.', in:['Driver location ingest and live geo index', 'Ride request → match → offer → accept', 'ETA and routing on the road graph', 'Live trip tracking for the rider', 'Trip state machine and payments', 'Dynamic (surge) pricing from supply and demand'], out:['Maps tile rendering and map data collection (see the Google Maps case)', 'Driver onboarding, KYC and documents', 'Fraud and safety models in depth', 'Food delivery (see the Zomato case)']},
  challenges:['Hundreds of thousands of drivers sending a GPS update every few seconds', 'Nearest-neighbour search over objects that move constantly', 'Greedy “nearest driver” matching is locally good but globally poor', 'Two phones, flaky mobile networks, and a trip that must never be lost or double-charged', 'Demand spikes in minutes (rain, office closing, concerts) while supply can’t move that fast'],
  fr:['Rider sees nearby cars and an upfront price and ETA', 'Request a ride; get matched with a driver within seconds', 'Driver receives an offer and accepts or declines', 'Both see live location and ETA until pickup and drop-off', 'Trip ends; fare is charged and both can rate each other'],
  nfr:['Match within a few seconds at p99 (illustrative target)', 'Location reads can be a few seconds stale; trip state and payments must be strongly consistent', 'No ride lost if a service or node dies mid-trip', 'Works on 2G/3G and in lifts and basements: retries, reconnects, idempotency', 'Scale per city independently; one city’s spike must not hurt others'],
  scale:[
    {k:'Trips per year', v:'≈ 11B', math:'Uber 2024 annual results (≈ 11.3B trips) → ≈ 31M trips per day', tag:'public'},
    {k:'Drivers online at peak (one large country)', v:'≈ 500K', math:'illustrative assumption for the calculations below', tag:'illustrative'},
    {k:'Location updates', v:'≈ 125K/s', math:'500K drivers ÷ 1 update every 4 s', tag:'illustrative'},
    {k:'Live position memory', v:'≈ 32 MB', math:'500K × ~64 B (id, lat, lng, heading, status, timestamp)', tag:'illustrative'},
    {k:'Completed trips at the global peak', v:'≈ 1,000/s', math:'31M trips/day ÷ 86,400 s ≈ 360/s average × ~3 peak factor', tag:'illustrative'},
    {k:'Trip events to Kafka', v:'≈ 20K/s', math:'1K trips/s × ~20 state changes and pings worth persisting', tag:'illustrative'}],
  arch:{w:960, h:390, minW:700, nodes:[
    {id:'rider', type:'client', label:'Rider app', x:70, y:150, w:110},
    {id:'driver', type:'client', label:'Driver app', x:70, y:270, w:110},
    {id:'push', type:'service', label:'Realtime gateway', sub:'WebSocket / push', x:235, y:55, w:140, stage:3},
    {id:'gw', type:'lb', label:'API gateway', sub:'auth · routing', x:235, y:190, w:124, stage:4},
    {id:'loc', type:'service', label:'Location ingest', sub:'GPS every ~4 s', x:235, y:330, w:140, stage:1},
    {id:'db', type:'db', label:'Trip store', sub:'Postgres: everything', x:430, y:55, w:150},
    {id:'app', type:'service', label:'Backend', sub:'monolith', x:430, y:190, w:140},
    {id:'geo', type:'cache', label:'Live geo index', sub:'in-memory', x:430, y:330, w:140, stage:1},
    {id:'eta', type:'service', label:'Routing & ETA', sub:'road graph + ML', x:640, y:55, w:140, stage:8},
    {id:'disp', type:'service', label:'Dispatch', sub:'riders ↔ drivers', x:640, y:190, w:150, stage:2},
    {id:'kafka', type:'queue', label:'Kafka', sub:'trip events', x:640, y:330, w:130, stage:5},
    {id:'surge', type:'service', label:'Pricing', sub:'per-cell surge', x:840, y:55, w:130, stage:9},
    {id:'pay', type:'service', label:'Payments', sub:'idempotent', x:840, y:330, w:130, stage:5}],
   edges:[{from:'rider', to:'app', gone:4}, {from:'driver', to:'app', gone:4}, {from:'app', to:'db'},
     {from:'driver', to:'loc', stage:1}, {from:'loc', to:'geo', stage:1}, {from:'app', to:'geo', stage:1, gone:2},
     {from:'app', to:'disp', stage:2}, {from:'disp', to:'geo', stage:2},
     {from:'rider', to:'push', stage:3}, {from:'driver', to:'push', stage:3}, {from:'disp', to:'push', stage:3},
     {from:'rider', to:'gw', stage:4}, {from:'driver', to:'gw', stage:4}, {from:'gw', to:'app', stage:4},
     {from:'app', to:'kafka', stage:5}, {from:'kafka', to:'pay', stage:5},
     {from:'disp', to:'eta', stage:8},
     {from:'app', to:'surge', stage:9}, {from:'kafka', to:'surge', stage:9}, {from:'geo', to:'kafka', stage:9}]},
  evolution:[
    {title:'One server + one database', scale:'1 city, 500 drivers', fix:'<p>A single backend and one Postgres database. Driver apps POST their location every few seconds into a <code>driver_locations</code> table; a ride request runs <code>SELECT … ORDER BY distance LIMIT 1</code> over online drivers; both apps poll for trip status. Simple, and fine for one small city.</p>', after:{lat:250, err:.2, load:20}},
    {title:'GPS pings drown the database', scale:'10K drivers', hot:['db', 'app'], breaks:'<p>10K drivers × one ping every 4 s = <b>2,500 writes/s</b> of tiny rows that are overwritten moments later. Index churn, table bloat and vacuum compete with trip queries; request latency climbs and trips time out.</p>', fix:'<p>Live positions are <b>ephemeral</b>: only the latest one per driver matters for matching. A separate <b>location-ingest service</b> keeps the latest position per driver in an <b>in-memory store</b> (Redis-style), and appends raw pings to a log for analytics. The trip database stores only trips, users and payments.</p>', sub:{db:'trips, users'}, before:{lat:2500, err:3, load:180}, after:{lat:300, err:.2, load:50}, flow:[['driver', 'loc', 'GPS ping'], ['loc', 'geo', 'upsert latest position']], lesson:['back-of-envelope', 'cache-layers']},
    {title:'Finding nearby drivers scans the whole city', scale:'100K drivers', hot:['app', 'geo'], breaks:'<p>“Nearest driver” still computes the distance to <b>every</b> online driver in the city for every request and every “cars near you” refresh: O(N) per call, at thousands of calls per second.</p>', fix:'<p>A dedicated <b>dispatch service</b> uses a <b>spatial index</b>: the map is cut into cells (geohash, Google <b>S2</b>, or Uber’s hexagonal <b>H3</b>). A lookup reads the rider’s cell and expanding rings of neighbours, so it checks a few dozen drivers instead of 100K. Uber’s 2015 dispatch system indexed supply and demand by S2 cells.</p>', sub:{geo:'S2 / H3 cells'}, before:{lat:1800, err:1, load:140}, after:{lat:220, err:.1, load:45}, flow:[['rider', 'app', 'request ride'], ['app', 'disp'], ['disp', 'geo', 'free drivers near cell']], lesson:'geospatial'},
    {title:'Polling every second melts servers and batteries', scale:'1M rides/day', hot:['app'], breaks:'<p>Riders poll “where is my driver?” every second and drivers poll for offers. Most polls return nothing new, yet they are most of the traffic, and they drain phone batteries. Offers that arrive late expire before the driver sees them.</p>', fix:'<p>Keep a <b>persistent connection</b> (WebSocket, or a push channel with mobile push as fallback) from each app to a <b>realtime gateway</b>. Dispatch <b>pushes</b> offers to drivers and position updates to riders. Uber has described a dedicated real-time push platform for this.</p>', before:{lat:900, err:.8, load:160}, after:{lat:200, err:.1, load:50}, flow:[['disp', 'push', 'offer trip'], ['push', 'driver', 'offer (15 s to accept)']], lesson:['websockets-at-scale', 'push-notifications']},
    {title:'One codebase, hundreds of engineers', scale:'1,000s of engineers', hot:['app'], breaks:'<p>Every team deploys the same monolith. A bug in promotions takes down ride requests; deploys queue for hours; one slow query affects every feature.</p>', fix:'<p>Split by business domain into services (trips, riders, drivers, pricing, payments) behind an <b>API gateway</b> that handles auth, routing and rate limits. Uber later grouped its many services into domains with clear interfaces (“domain-oriented microservice architecture”).</p>', sub:{app:'trip service'}, before:{lat:700, err:2, load:90}, after:{lat:240, err:.1, load:50}, flow:[['rider', 'gw', 'POST /trips'], ['gw', 'app']], lesson:['monolith-to-microservices', 'proxies-gateway-bff', 'ddd-bounded-contexts']},
    {title:'Crashes mid-trip double-charge riders', scale:'10M trips/day', hot:['app'], breaks:'<p>A server dies after charging the card but before saving “trip completed”; the retry charges again. Another crash loses the fact that the trip was accepted, so a second driver arrives.</p>', fix:'<p>Model the trip as an explicit <b>state machine</b> (REQUESTED → ACCEPTED → ARRIVED → ON_TRIP → COMPLETED / CANCELLED), persisted on every transition with a version check. Transitions emit events to <b>Kafka</b> through an outbox; <b>payments</b> consume them using the trip id as an <b>idempotency key</b>, so retries never double-charge.</p>', before:{lat:400, err:1.5, load:70}, after:{lat:250, err:.05, load:55}, flow:[['app', 'kafka', 'trip.completed'], ['kafka', 'pay', 'charge (idempotency key = trip id)']], lesson:['saga-outbox', 'idempotency-rate-limit-headers', 'kafka']},
    {title:'One trip database can’t keep up', scale:'10M+ trips/day', hot:['db'], breaks:'<p>Trip writes and reads outgrow a single primary. Schema migrations on a huge table lock it; adding read replicas doesn’t help writes.</p>', fix:'<p>Shard trips by <b>trip id</b> across many MySQL instances. Uber built <b>Schemaless</b>: an append-only store of immutable JSON “cells” on sharded MySQL, so schema changes need no migrations; it later evolved into Docstore. Uber also wrote publicly about why it moved from Postgres to MySQL.</p>', sub:{db:'Schemaless (sharded)'}, before:{lat:1500, err:2, load:170}, after:{lat:220, err:.05, load:50}, flow:[['app', 'db', 'append cell (shard by trip id)']], lesson:['sharding', 'replication']},
    {title:'One dispatch box holds the whole city', scale:'large cities', hot:['disp'], breaks:'<p>A single dispatch process keeps all supply and demand of a city in memory. It runs out of CPU on New Year’s Eve, and if it crashes, matching stops for the entire city.</p>', fix:'<p>Shard dispatch <b>by geo cell</b> across many nodes using a <b>consistent-hash ring</b> with gossip-based membership (Uber’s open-source <b>Ringpop</b>). Each node owns some cells; if one dies, its cells move to neighbours on the ring and drivers’ next pings (seconds later) rebuild the state.</p>', sub:{disp:'sharded by cell', geo:'partitioned by cell'}, before:{lat:3000, err:10, load:130}, after:{lat:230, err:.1, load:55}, flow:[['disp', 'geo', 'owner of cell 8961…']], lesson:['consistent-hashing', 'failure-detection']},
    {title:'Nearest isn’t fastest, and greedy isn’t best', scale:'dense cities', hot:['disp'], breaks:'<p>The straight-line nearest driver is across a river or on a one-way flyover. And matching each request the instant it arrives gives an early rider the driver a later rider needed more, so total pickup time is worse than it has to be.</p>', fix:'<p>A <b>routing & ETA service</b> computes road travel times on the road graph, corrected by ML (Uber has described <b>DeepETA</b>). Dispatch can then <b>batch</b> requests for a moment and solve an <b>assignment problem</b> over the ETA matrix to minimise total pickup time. Try it in the matching simulator in Deep dives.</p>', before:{lat:400, err:.6, load:80}, after:{lat:260, err:.1, load:65}, flow:[['disp', 'eta', 'ETA matrix: drivers × riders']], lesson:['geospatial', 'tradeoff-thinking']},
    {title:'Rain at 6 pm: demand 5× supply', scale:'city-wide spike', hot:['disp', 'app'], breaks:'<p>Rain plus office closing time: requests jump 5× in ten minutes, while drivers can’t appear that fast. Every request searches, fails and retries, so the matching load explodes and almost nobody gets a car.</p>', fix:'<p><b>Dynamic pricing per cell</b>: a stream job reads supply (free drivers per cell) and demand (requests per cell) from Kafka and sets a multiplier. Higher prices damp marginal demand and draw drivers towards the hotspot. Combine it with <b>load shedding</b> (“no cars available, try in 2 min”) instead of endless retries. The formula in this case is educational.</p>', before:{lat:2000, err:8, load:220}, after:{lat:300, err:.3, load:85}, flow:[['geo', 'kafka', 'supply per cell'], ['kafka', 'surge', 'demand vs supply'], ['app', 'surge', 'quote with multiplier']], lesson:['batch-vs-stream', 'load-shedding']}],
  flows:[
    {name:'Request a ride', steps:[
      {note:'The rider requests a trip with pickup and drop; the gateway authenticates and routes to the trip service.', flow:[['rider', 'gw', 'POST /trips {pickup, drop}'], ['gw', 'app']]},
      {note:'The trip service gets an upfront price for the pickup cell and saves the trip as REQUESTED.', flow:[['app', 'surge', 'quote'], ['app', 'db', 'trip: REQUESTED']]},
      {note:'Dispatch reads free drivers in the pickup cell and its neighbouring rings from the live geo index.', flow:[['app', 'disp', 'match'], ['disp', 'geo', 'free drivers near cell']]},
      {note:'It asks routing for road ETAs from each candidate and picks the best (possibly as part of a batch).', flow:[['disp', 'eta', 'ETAs for candidates']]},
      {note:'The offer is pushed to the chosen driver over the realtime gateway; the driver has a few seconds to accept.', flow:[['disp', 'push', 'offer'], ['push', 'driver', 'accept?']]},
      {note:'The driver accepts; the trip becomes ACCEPTED (versioned write), an event is published, and the rider sees the car and its ETA.', flow:[['driver', 'gw', 'accept'], ['gw', 'app'], ['app', 'db', 'ACCEPTED v2'], ['app', 'kafka', 'trip.accepted'], ['push', 'rider', 'driver assigned']]}]},
    {name:'Live location', steps:[
      {note:'Every few seconds the driver app sends a batched GPS update (with timestamps, so late packets can be discarded).', flow:[['driver', 'loc', 'GPS batch']]},
      {note:'Ingest updates the latest position and the driver’s cell in the live index.', flow:[['loc', 'geo', 'move to cell 8961…']]},
      {note:'Supply counts per cell are streamed to pricing.', flow:[['geo', 'kafka', 'supply per cell'], ['kafka', 'surge']]},
      {note:'During a trip, dispatch pushes the position to the rider, throttled to every few seconds.', flow:[['disp', 'push', 'driver position'], ['push', 'rider', 'car moves on map']]}]},
    {name:'End trip and pay', steps:[
      {note:'The driver ends the trip; the state moves to COMPLETED only if the version matches (no double completion).', flow:[['driver', 'gw', 'end trip'], ['gw', 'app'], ['app', 'db', 'COMPLETED v5']]},
      {note:'The completion event is published through the outbox, in the same transaction as the state change.', flow:[['app', 'kafka', 'trip.completed']]},
      {note:'Payments charge using the trip id as the idempotency key, so a redelivered event can’t charge twice.', flow:[['kafka', 'pay', 'charge once']]},
      {note:'The rider gets the receipt over the realtime channel.', flow:[['push', 'rider', 'receipt']]}]}],
  breakIt:[
    {label:'A dispatch node dies', kill:['disp'], verdict:'degrades', text:'Its cells move to the next nodes on the ring within seconds; drivers’ next location pings rebuild the supply state there. Requests in those cells take a few extra seconds; open offers are retried.', flow:[['driver', 'loc', 're-report position'], ['loc', 'geo']]},
    {label:'Location ingest overloaded', hot:['loc'], verdict:'degrades', text:'Shed stale pings first (only the newest one per driver matters) and lower the update rate for idle drivers. Positions are a few seconds older; matching still works.'},
    {label:'Payments service down', kill:['pay'], verdict:'survives', text:'Trips keep running. Completion events wait in Kafka and are charged when payments recovers; the idempotency key makes the catch-up safe.', flow:[['app', 'kafka', 'trip.completed queued']]},
    {label:'Pricing service down', kill:['surge'], verdict:'degrades', text:'Quotes fall back to the last known multiplier per cell, or base fare with a cap. Pricing is less accurate for a while; rides are not blocked.'},
    {label:'Routing/ETA service down', kill:['eta'], verdict:'degrades', text:'Dispatch falls back to straight-line distance × a city speed factor. Matches and ETAs get worse, but riders are still matched.'},
    {label:'Realtime gateway down', kill:['push'], verdict:'degrades', text:'Apps fall back to polling the API and to mobile push for offers. More load and slower offers until the gateway recovers.', flow:[['rider', 'gw', 'poll trip status'], ['gw', 'app']]},
    {label:'A trip-store shard primary dies', kill:['db'], verdict:'degrades', text:'Writes for trips on that shard fail until a replica is promoted (seconds). Apps retry with the same idempotency keys; other shards are unaffected.'}],
  dataModel:{lang:'sql', title:'trips (sharded by trip_id) + live positions (in memory)', code:`-- Trip: one row per trip, every transition is a versioned update
CREATE TABLE trips (
  trip_id      CHAR(26) PRIMARY KEY,   -- ULID: unique + time-ordered; shard key
  rider_id     BIGINT NOT NULL,
  driver_id    BIGINT,
  city_id      INT NOT NULL,
  state        VARCHAR(12) NOT NULL,   -- REQUESTED | ACCEPTED | ARRIVED | ON_TRIP | COMPLETED | CANCELLED
  version      INT NOT NULL,           -- optimistic concurrency
  pickup_lat   DOUBLE, pickup_lng DOUBLE, drop_lat DOUBLE, drop_lng DOUBLE,
  fare_minor   BIGINT, currency CHAR(3), surge_x DECIMAL(3,2),
  created_at   TIMESTAMP, updated_at TIMESTAMP
);
-- UPDATE trips SET state='ACCEPTED', driver_id=?, version=version+1
--   WHERE trip_id=? AND state='REQUESTED' AND version=?;   -- 0 rows → someone else won

-- Live supply (in memory, partitioned by cell):
--   cell:{h3_res9}  → set of driver ids        driver:{id} → {lat, lng, heading, status, ts}`, notes:'The conditional UPDATE is the core of correctness: two drivers accepting the same trip, or a duplicated “complete” call, can’t both succeed. Positions never touch the trip store.'},
  apis:[
    {m:'POST', path:'/v1/trips', note:'Idempotency-Key header so a retried request never books twice.', req:'{ "pickup": {"lat": 12.9716, "lng": 77.5946}, "drop": {"lat": 13.0358, "lng": 77.5970}, "product": "auto", "quote_id": "q_81f" }', res:'{ "trip_id": "01JC9…", "state": "REQUESTED", "fare": {"amount": 18400, "currency": "INR"}, "surge_x": 1.2 }'},
    {m:'POST', path:'/v1/driver/locations', note:'Batched, timestamped pings; the server keeps only the newest per driver.', req:'{ "driver_id": 5521, "points": [ {"lat": 12.97, "lng": 77.59, "ts": 1731500000, "heading": 84}, {"lat": 12.9702, "lng": 77.5911, "ts": 1731500004, "heading": 86} ] }', res:'{ "ok": true }'},
    {m:'WS', path:'offer → driver', note:'Pushed over the realtime gateway; the accept is a normal API call with the offer id.', res:'{ "type": "offer", "offer_id": "of_77", "trip_id": "01JC9…", "pickup_eta_s": 240, "expires_in_s": 15 }'}],
  algorithm:{title:'Geo index + batched matching', html:'<p>Two algorithms carry the design. First, a <b>spatial index</b>: cut the map into cells and look up the rider’s cell plus expanding rings of neighbours, stopping as soon as no unexplored cell could hold a closer driver. Second, <b>matching</b>: serving requests one by one (greedy) is simple, but gathering requests for a short window and solving the <b>assignment problem</b> minimises total pickup time across everyone. Below, a real matcher (grid index + Hungarian algorithm) and a calculator for the location firehose; the geohash/quadtree playground shows the index itself.</p>', mount:host => { dispatchSim(host); host.append(hr()); locationCalc(host); }, pg:'geo'},
  tradeoffs:[['In-memory live positions', 'Hundreds of thousands of updates per second at RAM speed; only the latest value matters', 'Lost on crash, so rebuilt from the next pings (seconds of staleness)'], ['Hexagonal cells (H3) vs squares', 'Hexagons have uniform neighbour distances, which helps smoothing and pricing per area', 'More complex maths; libraries needed'], ['Batched matching', 'Lower total pickup time and better global outcomes', 'Adds a short wait before matching; more computation'], ['Persistent connections for push', 'Instant offers and live tracking without polling', 'Millions of open sockets to run, plus reconnect storms after network blips'], ['Sharded MySQL (Schemaless) for trips', 'Linear write scaling and no schema migrations', 'Cross-shard queries and transactions are hard; analytics goes elsewhere']],
  alternatives:[['PostGIS nearest-neighbour queries', 'Excellent for moderate scale, but write-heavy moving points at 100K+/s overwhelm one database'], ['Driver polling for offers', 'Simple, but slow offers and battery drain'], ['Global optimal matching across the whole city every second', 'Too expensive and adds latency; small windows per area capture most of the gain'], ['Fixed prices only', 'Predictable, but no lever when demand exceeds supply: everyone waits, nobody gets a car']],
  failures:[['Dispatch node', 'Ring reassigns its cells; state rebuilt from the next pings'], ['Location ingest', 'Shed stale pings; reduce update rate for idle drivers'], ['Realtime gateway', 'Fall back to polling and mobile push'], ['Payments', 'Events wait in Kafka; idempotent catch-up'], ['Trip-store shard', 'Promote a replica; retried writes with the same keys']],
  lab:{stack:['Node.js or Go', 'Redis (GEO commands or H3 keys)', 'Postgres for trips', 'WebSocket server (ws / socket.io)', 'Kafka or Redpanda', 'k6 + a driver-simulator script'], milestones:[
    {day:'Day 1: positions & search', items:['Driver simulator: 5,000 fake drivers moving on random routes, pinging every 4 s', 'Ingest service stores the latest position per driver in Redis GEO (or H3 cell sets)', '“Cars near me” API: nearest 10 within 2 km', 'Measure lookup latency vs a naive SQL scan']},
    {day:'Day 2: matching & push', items:['Trip state machine with versioned conditional updates', 'WebSocket gateway pushing offers; 15 s accept timeout, then next driver', 'Greedy matcher first, then a 2-second batch with the Hungarian algorithm', 'Compare total pickup distance on the same requests']},
    {day:'Day 3: events, payments, surge', items:['Outbox → Kafka for trip events', 'Payment consumer with idempotency keys; replay events and prove no double charge', 'Surge job: free drivers and requests per cell each 30 s → multiplier', 'k6: 500 requests/s for 5 min while killing the matcher process']}],
   pseudocode:{lang:'ts', code:`// Accept an offer: conditional update makes double-acceptance impossible
async function acceptOffer(tripId: string, driverId: number, offerVersion: number) {
  const r = await db.query(
    \`UPDATE trips SET state='ACCEPTED', driver_id=$1, version=version+1, updated_at=now()
     WHERE trip_id=$2 AND state='REQUESTED' AND version=$3\`, [driverId, tripId, offerVersion]);
  if (r.rowCount === 0) return { ok: false, reason: 'already taken or cancelled' };
  await outbox.add('trip.accepted', { tripId, driverId });      // same transaction in real code
  push.toRider(tripId, { type: 'driver_assigned', driverId });
  return { ok: true };
}

// Nearest free drivers by expanding rings of H3 cells
function candidates(pickup: LatLng, want = 10): number[] {
  const origin = h3.latLngToCell(pickup.lat, pickup.lng, 9);
  const found: number[] = [];
  for (let k = 0; k <= 6 && found.length < want; k++)
    for (const cell of h3.gridRingUnsafe(origin, k)) found.push(...liveIndex.freeDriversIn(cell));
  return found;   // then rank by road ETA, not straight-line distance
}`},
   loadTest:'<p>Run the driver simulator with 5K drivers and a rider simulator ramping from 10 to 500 requests/s over 5 minutes, concentrated in two hotspots. Measure match time p50/p99, total pickup distance (greedy vs batched), and lost or duplicated trips. Kill the matcher mid-test: no trip may end up with two drivers or none.</p>'},
  twists:[
    {q:'Two drivers tap “Accept” on the same trip at the same moment. What happens?', a:'Only one conditional update succeeds: <code>UPDATE … WHERE trip_id=? AND state=\'REQUESTED\' AND version=?</code>. The second sees 0 rows changed and gets “trip already taken”. No distributed lock is needed because the trip row (in its shard) is the single source of truth.'},
    {q:'How do you show “cars near you” to 1M app users without querying dispatch 1M times a second?', a:'Make it approximate and cacheable: precompute free-driver positions per cell every few seconds, serve them from a cache keyed by cell, and jitter or thin the dots. It’s decorative; the actual match uses the authoritative index.'},
    {q:'Why might Uber use hexagons (H3) for pricing but plain cells for lookup?', a:'Hexagons have six equidistant neighbours, so smoothing supply and demand across neighbours and drawing pricing zones is uniform; squares have diagonal neighbours at different distances. For lookup, any hierarchical cell scheme (S2, geohash, H3) works; what matters is cheap neighbour expansion.'}],
  real:[
    {co:'Uber dispatch (2015)', tier:'confirmed', text:'Uber’s dispatch system was described as indexing supply and demand by Google S2 cells and sharding work across nodes with Ringpop, a consistent-hash ring with SWIM gossip membership.', src:'Matt Ranney, “Scaling Uber’s Real-time Market Platform” (talk, 2015); Uber Engineering, Ringpop open-source documentation'},
    {co:'Uber H3', tier:'confirmed', text:'Uber built and open-sourced H3, a hexagonal hierarchical spatial index, used for analysing and optimising marketplace dynamics such as pricing across a city.', src:'Uber Engineering, “H3: Uber’s Hexagonal Hierarchical Spatial Index” (2018)'},
    {co:'Uber Schemaless', tier:'confirmed', text:'Schemaless is an append-only, sharded datastore built on MySQL, storing immutable JSON cells keyed by UUID; Uber also explained its move from Postgres to MySQL.', src:'Uber Engineering, “Designing Schemaless, Uber Engineering’s Scalable Datastore Using MySQL” (2016); “Why Uber Engineering Switched from Postgres to MySQL” (2016)'},
    {co:'Uber push platform', tier:'confirmed', text:'Uber described a dedicated real-time push messaging platform that keeps persistent connections to apps instead of polling.', src:'Uber Engineering, “Uber’s Real-Time Push Platform” (2020)'},
    {co:'Uber DeepETA', tier:'confirmed', text:'Uber predicts arrival times by combining a routing engine with a deep-learning model that corrects its ETAs.', src:'Uber Engineering, “DeepETA: How Uber Predicts Arrival Times Using Deep Learning” (2022)'},
    {co:'Uber microservices', tier:'confirmed', text:'Uber grew to thousands of microservices and reorganised them into domains with gateways and clear interfaces.', src:'Uber Engineering, “Introducing Domain-Oriented Microservice Architecture” (2020)'},
    {co:'Batched matching', tier:'inference', text:'Collecting requests for a short window and solving an assignment problem is a standard marketplace technique; ride-hailing companies discuss dispatch optimisation publicly, but their exact algorithms and windows are not public.', src:'This case study; operations-research literature on assignment problems'},
    {co:'Ola', tier:'inference', text:'Ola faces the same problems with extra Indian specifics (autos and bikes, cash, dense pickup points). Its internal architecture is not publicly documented in detail, so nothing here describes Ola’s systems.', src:'This case study'},
    {co:'Simulators and surge formula', tier:'educational', text:'The matching simulator, location calculator and per-cell surge description are simplified teaching models with illustrative inputs.', src:'This case study’s models'}],
  sources:['Matt Ranney — Scaling Uber’s Real-time Market Platform (2015 talk)', 'Uber Engineering — H3: Uber’s Hexagonal Hierarchical Spatial Index (2018)', 'Uber Engineering — Designing Schemaless, Uber Engineering’s Scalable Datastore Using MySQL (2016)', 'Uber Engineering — Why Uber Engineering Switched from Postgres to MySQL (2016)', 'Uber Engineering — Uber’s Real-Time Push Platform (2020)', 'Uber Engineering — DeepETA: How Uber Predicts Arrival Times Using Deep Learning (2022)', 'Uber Engineering — Introducing Domain-Oriented Microservice Architecture (2020)', 'Kuhn — The Hungarian Method for the Assignment Problem (1955)', 'Google — S2 Geometry library documentation']
});

/* ======================= 2. ZOMATO / SWIGGY ======================= */
SDA.register({kind:'case', id:'zomato', tier:'flagship', icon:'🍛', title:'Zomato / Swiggy (food delivery)', tagline:'A three-sided marketplace racing the clock: kitchens, riders and hungry customers at 8:30 pm.', tags:['marketplace', 'dispatch', 'batching', 'eta prediction', 'search', 'payments', 'order state machine', 'peak traffic'],
  modules:['async', 'search', 'reliability', 'realtime', 'databases'],
  summary:'Food delivery connects three parties with different apps and incentives: <b>customers</b> browsing menus, <b>restaurants</b> accepting and cooking orders, and <b>delivery partners</b> (riders) moving around the city. Traffic is brutally peaky (lunch and dinner), every order is a long-running <b>state machine</b> touching payments, kitchens and riders, and the core optimisation is <b>when and to whom to assign each order</b> so riders don’t idle at restaurants while food goes cold elsewhere.',
  accuracy:'Zomato (now part of Eternal Ltd) and Swiggy publish some engineering material, but their internal architectures are not documented in enough detail to describe them. This case is a <b>reference design</b>: components are labelled inference or educational. Confirmed facts come from public sources on comparable systems (Uber’s Michelangelo for delivery-time prediction, DoorDash’s dispatch system). All numbers are illustrative.',
  overview:{what:'A customer in Bengaluru searches “biryani”, sees restaurants that can deliver in 30 minutes, pays with UPI, and watches the restaurant accept and a rider pick up and approach on a live map.', in:['Restaurant discovery and search (geo-filtered)', 'Menus, carts, pricing and offers', 'Order placement and payment', 'Restaurant order acceptance', 'Rider assignment, batching and live tracking', 'Delivery-time (ETA) prediction'], out:['Restaurant onboarding and payouts in depth', 'Grocery / quick commerce warehouses', 'Reviews and ratings moderation', 'Ads and promotions ranking in depth']},
  challenges:['Lunch and dinner peaks: several times the average load for 2 hours', 'Three apps (customer, restaurant, rider), each on flaky mobile networks', 'Orders are long-running workflows (30–60 min) across payments, kitchens and riders', 'Assigning riders: too early wastes rider time, too late leaves food waiting', 'Promising an honest ETA before the order is placed'],
  fr:['Search restaurants and dishes deliverable to my location, with an ETA', 'Browse menus; add to cart; apply offers; pay', 'Restaurant receives, accepts and marks the order ready', 'A rider is assigned, picks up and delivers; customer tracks live', 'Cancellations and refunds; order history'],
  nfr:['Search p99 under ~300 ms at the dinner peak (illustrative target)', 'An order is never lost or double-charged once payment succeeds', 'ETA promises are honest: late deliveries are a key quality metric', 'Graceful degradation: if search or recommendations fail, people can still reorder', 'Peak readiness without paying for peak capacity all day'],
  scale:[
    {k:'Orders per day (large platform)', v:'≈ 2M', math:'illustrative assumption', tag:'illustrative'},
    {k:'Orders at the dinner peak', v:'≈ 80/s', math:'~15% of the day’s orders in the busiest hour: 2M × 0.15 ÷ 3,600', tag:'illustrative'},
    {k:'Menu and search reads at peak', v:'≈ 20K/s', math:'~25 browse calls per order × 80 orders/s × ~10 sessions per order placed', tag:'illustrative'},
    {k:'Riders online at peak', v:'≈ 200K', math:'80 orders/s × ~40 min per delivery cycle ≈ 190K riders busy', tag:'illustrative'},
    {k:'Rider location updates', v:'≈ 50K/s', math:'200K riders ÷ 1 ping every 4 s', tag:'illustrative'},
    {k:'Order state changes', v:'≈ 800/s', math:'80 orders/s × ~10 states (placed → … → delivered)', tag:'illustrative'}],
  arch:{w:920, h:390, minW:700, nodes:[
    {id:'cust', type:'client', label:'Customer app', x:70, y:75, w:116},
    {id:'rest', type:'client', label:'Restaurant app', x:70, y:195, w:116},
    {id:'rider', type:'client', label:'Rider app', x:70, y:315, w:110, stage:4},
    {id:'cdn', type:'cdn', label:'Image CDN', sub:'dish photos', x:250, y:55, w:120, stage:1},
    {id:'gw', type:'lb', label:'API gateway', sub:'auth · limits', x:250, y:195, w:124, stage:3},
    {id:'rt', type:'service', label:'Realtime gateway', sub:'WebSocket + push', x:250, y:330, w:140, stage:6},
    {id:'cache', type:'cache', label:'Menu cache', sub:'Redis', x:430, y:55, w:130, stage:1},
    {id:'app', type:'service', label:'Backend', sub:'monolith', x:430, y:195, w:150},
    {id:'db', type:'db', label:'MySQL', sub:'menus, orders, users', x:430, y:330, w:150},
    {id:'search', type:'service', label:'Search', sub:'Elasticsearch + geo', x:630, y:55, w:140, stage:2},
    {id:'kafka', type:'queue', label:'Kafka', sub:'order events', x:630, y:195, w:136, stage:5},
    {id:'pay', type:'service', label:'Payments', sub:'UPI · cards', x:630, y:330, w:140, stage:5},
    {id:'eta', type:'service', label:'ETA models', sub:'prep + travel time', x:830, y:55, w:140, stage:7},
    {id:'assign', type:'service', label:'Assignment', sub:'nearest free rider', x:830, y:195, w:140, stage:4},
    {id:'rloc', type:'cache', label:'Rider locations', sub:'geo index', x:830, y:330, w:140, stage:4}],
   edges:[{from:'cust', to:'app', gone:3}, {from:'rest', to:'app', gone:3}, {from:'app', to:'db'},
     {from:'cust', to:'cdn', stage:1}, {from:'app', to:'cache', stage:1},
     {from:'app', to:'search', stage:2}, {from:'db', to:'search', stage:2, dashed:true},
     {from:'cust', to:'gw', stage:3}, {from:'rest', to:'gw', stage:3}, {from:'gw', to:'app', stage:3},
     {from:'rider', to:'gw', stage:4}, {from:'app', to:'assign', stage:4, gone:5}, {from:'assign', to:'rloc', stage:4}, {from:'app', to:'rloc', stage:4, gone:8},
     {from:'app', to:'pay', stage:5}, {from:'app', to:'kafka', stage:5}, {from:'pay', to:'kafka', stage:5}, {from:'kafka', to:'assign', stage:5},
     {from:'cust', to:'rt', stage:6}, {from:'rest', to:'rt', stage:6}, {from:'rider', to:'rt', stage:6}, {from:'kafka', to:'rt', stage:6},
     {from:'app', to:'eta', stage:7}, {from:'assign', to:'eta', stage:7},
     {from:'kafka', to:'rloc', stage:8}]},
  evolution:[
    {title:'One server + one database', scale:'1 city, 200 restaurants', fix:'<p>One backend and one MySQL database hold restaurants, menus, users and orders. The customer website places an order; the restaurant’s browser tab polls for new orders; restaurants use their own delivery staff. It works for one neighbourhood.</p>', after:{lat:250, err:.3, load:20}},
    {title:'Menus and photos swamp the database', scale:'10 cities', hot:['db', 'app'], breaks:'<p>People browse far more than they order: every menu view reads dozens of rows and every page pulls large photos through the app server. Reads crowd out order writes at lunchtime.</p>', fix:'<p>Put <b>photos on a CDN</b>. Cache menus and restaurant pages in <b>Redis</b> (cache-aside, invalidated when a restaurant edits its menu), and add <b>read replicas</b> for the remaining reads. Orders still go to the primary.</p>', sub:{db:'primary + replicas'}, before:{lat:2200, err:2, load:160}, after:{lat:220, err:.1, load:45}, flow:[['cust', 'cdn', 'dish photos'], ['app', 'cache', 'menu: hit']], lesson:['cache-strategies', 'cdn', 'replication']},
    {title:'“Biryani near me” times out', scale:'100K restaurants', hot:['db'], breaks:'<p>Search runs <code>LIKE \'%biryani%\'</code> across menus, filters by distance, opening hours and delivery radius, and sorts by rating, all in SQL. At dinner it takes seconds and locks up replicas.</p>', fix:'<p>A <b>search service</b> on an inverted index (Elasticsearch-style) with <b>geo filters</b> (each restaurant’s delivery polygon), text matching on dishes and cuisines, and ranking by relevance, rating, ETA and availability. The index is kept fresh by <b>change data capture</b> from the database.</p>', before:{lat:3000, err:1.5, load:140}, after:{lat:180, err:.05, load:45}, flow:[['db', 'search', 'CDC: menu changed'], ['app', 'search', 'biryani · deliverable here · open now']], lesson:['elasticsearch', 'cdc', 'geospatial']},
    {title:'Lunch and dinner: 8× traffic for two hours', scale:'1M orders/day', hot:['app'], breaks:'<p>Traffic is flat all afternoon, then jumps 8× from 7:30 to 9:30 pm. Servers sized for the average fall over; sized for the peak, they idle 20 hours a day. A slow “offers” feature drags down checkout.</p>', fix:'<p>Make services <b>stateless</b> behind an <b>API gateway</b>, then <b>autoscale on a schedule</b> (scale up before the known peaks) plus target tracking for surprises. Separate browsing from ordering (<b>bulkheads</b>), so a slow offers or recommendations call can’t block checkout.</p>', sub:{app:'orders · stateless'}, before:{lat:2500, err:4, load:250}, after:{lat:260, err:.2, load:65}, flow:[['cust', 'gw', 'POST /orders'], ['gw', 'app']], lesson:['autoscaling', 'bulkhead-fallback', 'proxies-gateway-bff']},
    {title:'Restaurants can’t deliver: build a rider fleet', scale:'10K riders', hot:['app', 'rest'], breaks:'<p>Most restaurants have no delivery staff, and those that do can’t handle the peak. Orders sit “ready” for 30 minutes; customers cancel.</p>', fix:'<p>Add a <b>rider app</b> that reports location and status. Keep the latest rider positions in a <b>geo index</b>, and add an <b>assignment service</b> that picks the nearest free rider for each order (first version: assign immediately when the order is placed).</p>', before:{lat:900, err:6, load:90}, after:{lat:280, err:.3, load:60}, flow:[['rider', 'gw', 'location + status'], ['gw', 'app'], ['app', 'rloc', 'update position'], ['app', 'assign', 'find rider'], ['assign', 'rloc', 'free riders near restaurant']], lesson:'geospatial'},
    {title:'Charged, but no order (or charged twice)', scale:'5M payments/day', hot:['app'], breaks:'<p>The UPI payment succeeds, but the app times out before the order is saved, so the customer pays and gets nothing. Retries create duplicate orders and double charges.</p>', fix:'<p>A <b>payments service</b> with <b>idempotency keys</b> per checkout, an explicit <b>order state machine</b> (CREATED → PAYMENT_PENDING → PLACED → ACCEPTED → READY → PICKED_UP → DELIVERED), payment-gateway <b>webhooks</b> plus a reconciliation job for stuck payments, and an <b>outbox</b> that publishes order events to <b>Kafka</b>. Assignment now reacts to events instead of synchronous calls.</p>', before:{lat:600, err:1.2, load:70}, after:{lat:280, err:.05, load:60}, flow:[['app', 'pay', 'charge (Idempotency-Key)'], ['pay', 'kafka', 'payment.succeeded'], ['kafka', 'assign', 'order.placed']], lesson:['saga-outbox', 'idempotency-rate-limit-headers', 'kafka']},
    {title:'The restaurant never saw the order', scale:'100K restaurants', hot:['rest', 'gw'], breaks:'<p>Restaurant tablets poll every 30 s, lose Wi-Fi, or sit muted in a noisy kitchen. Orders wait unseen for minutes; customers cancel.</p>', fix:'<p>A <b>realtime gateway</b> keeps persistent connections to restaurant and rider apps (with mobile push as fallback). New orders ring on the tablet; an <b>acceptance timer</b> escalates to an automated phone call, then auto-cancels with a refund. The same gateway pushes status updates to customers.</p>', before:{lat:400, err:3, load:60}, after:{lat:250, err:.2, load:55}, flow:[['kafka', 'rt', 'order.placed'], ['rt', 'rest', 'new order (ring)'], ['rest', 'rt', 'accept: 18 min prep']], lesson:['websockets-at-scale', 'push-notifications']},
    {title:'Riders wait at restaurants while orders pile up', scale:'dinner rush', hot:['assign'], breaks:'<p>Assigning a rider the moment an order is placed sends them to wait 10–15 minutes while the food is cooked. During the rush, those idle-but-assigned riders are exactly what new orders lack.</p>', fix:'<p><b>ETA models</b> predict prep time per restaurant and dish, and road travel time. Assignment becomes <b>just in time</b>: a rider is chosen when their travel time matches the remaining prep time. Orders from the same kitchen going the same way are <b>batched</b> onto one rider. Try all three policies in the dinner-rush simulator in Deep dives.</p>', before:{lat:500, err:2, load:120}, after:{lat:300, err:.4, load:80}, flow:[['assign', 'eta', 'prep + travel ETAs'], ['assign', 'rloc', 'riders who arrive as food is ready']], lesson:['tradeoff-thinking', 'batch-vs-stream']},
    {title:'Live tracking floods the backend', scale:'1M orders in flight', hot:['gw', 'app'], breaks:'<p>Every customer watching the map polls the order API every few seconds, and every rider ping goes through the order service. Tracking traffic dwarfs ordering traffic.</p>', fix:'<p>Rider pings go over the rider’s socket to the realtime gateway, into a <b>location stream</b> that updates the rider index. Each customer <b>subscribes to their order’s channel</b> and receives position updates every few seconds: pub/sub per order, no polling, and the order service is out of the loop.</p>', sub:{rt:'pub/sub per order'}, before:{lat:1500, err:1.5, load:190}, after:{lat:250, err:.1, load:60}, flow:[['rider', 'rt', 'GPS'], ['rt', 'kafka', 'location stream'], ['kafka', 'rloc', 'latest position'], ['rt', 'cust', 'rider is 600 m away']], lesson:['websockets-at-scale', 'fan-out']},
    {title:'New Year’s Eve + rain: orders outrun riders', scale:'3× a normal peak', hot:['assign', 'app'], breaks:'<p>Orders triple while riders thin out. Every order is accepted, nobody can deliver them, ETAs balloon to 90 minutes, and cancellations and refunds explode.</p>', fix:'<p><b>Zone-level capacity control</b>: when pending orders per free rider cross a threshold, the zone raises the delivery fee, <b>shrinks the serviceable radius</b>, shows honest (longer) ETAs, and in the worst case pauses new orders (<b>admission control</b>, a form of load shedding). Incentives bring more riders online. It is better to refuse 10% of orders than to fail 50%.</p>', sub:{assign:'capacity control', search:'radius shrinks'}, before:{lat:3000, err:9, load:260}, after:{lat:350, err:.6, load:95}, flow:[['assign', 'kafka', 'zone stressed'], ['kafka', 'rt', 'ETA +15 min'], ['rt', 'cust', 'honest ETA banner']], lesson:['load-shedding', 'capacity-planning']}],
  flows:[
    {name:'Place an order', steps:[
      {note:'The customer searches; the gateway routes to search, which returns open restaurants that deliver to this location, ranked.', flow:[['cust', 'gw', 'GET /search?q=biryani&lat&lng'], ['gw', 'app'], ['app', 'search', 'deliverable, open, ranked']]},
      {note:'Opening a restaurant reads the menu from cache; photos come from the CDN.', flow:[['app', 'cache', 'menu'], ['cust', 'cdn', 'photos']]},
      {note:'Checkout creates the order with an idempotency key, so a double-tap or retry can’t create two orders.', flow:[['cust', 'gw', 'POST /orders (Idempotency-Key)'], ['gw', 'app'], ['app', 'db', 'order CREATED']]},
      {note:'Payment is collected (UPI, card or wallet); success is published as an event.', flow:[['app', 'pay', 'collect ₹420'], ['pay', 'kafka', 'payment.succeeded']]},
      {note:'The order event rings the restaurant’s tablet over the realtime gateway.', flow:[['kafka', 'rt', 'order.placed'], ['rt', 'rest', 'new order!']]},
      {note:'The restaurant accepts with a prep estimate; the customer sees “Preparing”.', flow:[['rest', 'rt', 'accept · 18 min'], ['rt', 'kafka', 'order.accepted'], ['rt', 'cust', 'Preparing your food']]}]},
    {name:'Assign and deliver', steps:[
      {note:'Assignment consumes the accepted order with its predicted ready time.', flow:[['kafka', 'assign', 'order.accepted · ready ≈ 20:42']]},
      {note:'It asks for prep and travel ETAs and looks up riders near the restaurant.', flow:[['assign', 'eta', 'prep + travel times'], ['assign', 'rloc', 'free riders nearby']]},
      {note:'Just in time, it offers the order (maybe batched with another from the same kitchen) to a rider.', flow:[['assign', 'kafka', 'offer → rider R17'], ['kafka', 'rt'], ['rt', 'rider', 'new delivery']]},
      {note:'The rider accepts, picks up and streams location; the rider index stays fresh.', flow:[['rider', 'rt', 'picked up · GPS'], ['rt', 'kafka', 'location stream'], ['kafka', 'rloc']]},
      {note:'The customer’s order channel receives live position and ETA updates until delivery.', flow:[['rt', 'cust', 'live map · 4 min away']]}]},
    {name:'Item goes out of stock', steps:[
      {note:'The restaurant marks a dish unavailable.', flow:[['rest', 'gw', 'PATCH /menu/items/81 {available:false}'], ['gw', 'app'], ['app', 'db', 'update']]},
      {note:'The menu cache entry is invalidated, so the next read refetches.', flow:[['app', 'cache', 'invalidate menu:4411']]},
      {note:'Change data capture updates the search index within seconds.', flow:[['db', 'search', 'CDC → reindex']]}]}],
  breakIt:[
    {label:'Search cluster down', kill:['search'], verdict:'degrades', text:'Search falls back to cached “popular near you” lists and the customer’s past orders. Discovery is worse, but reordering and checkout keep working.', flow:[['app', 'cache', 'cached listings']]},
    {label:'Payment gateway outage', kill:['pay'], verdict:'degrades', text:'Route payments to a backup gateway or another UPI provider; offer cash on delivery where allowed. Payments stuck in PENDING are reconciled later and never double-charged.'},
    {label:'Kafka broker fails', hot:['kafka'], verdict:'survives', text:'Partitions are replicated (e.g. replication factor 3); a new leader is elected and producers retry. A few seconds of extra latency, no lost events.'},
    {label:'Restaurant tablet offline', kill:['rest'], verdict:'degrades', text:'The acceptance timer fires and an automated call reaches the restaurant; if there is no answer, the order is auto-cancelled and refunded before the customer waits long.'},
    {label:'Assignment service crashes', kill:['assign'], verdict:'degrades', text:'Accepted orders wait in Kafka; nothing is lost. When consumers restart from their committed offsets they catch up, so ETAs slip by a few minutes during the outage.'},
    {label:'Rider-location index lost', kill:['rloc'], verdict:'degrades', text:'Riders ping every few seconds, so the index rebuilds itself within about 30 s. Assignment pauses or uses last-known zones meanwhile.'},
    {label:'Realtime gateway node dies', kill:['rt'], verdict:'degrades', text:'Clients reconnect to another node with backoff and jitter and resync order state from the API. The map freezes for a few seconds; tablets fall back to push notifications.', flow:[['cust', 'gw', 'GET /orders/{id} (resync)'], ['gw', 'app']]}],
  dataModel:{lang:'sql', title:'orders as a state machine + events', code:`CREATE TABLE orders (
  order_id      CHAR(26) PRIMARY KEY,      -- ULID; shard key
  customer_id   BIGINT NOT NULL,
  restaurant_id BIGINT NOT NULL,
  rider_id      BIGINT,
  state         VARCHAR(16) NOT NULL,      -- CREATED | PAYMENT_PENDING | PLACED | ACCEPTED | READY | PICKED_UP | DELIVERED | CANCELLED
  version       INT NOT NULL,
  idem_key      VARCHAR(64) NOT NULL UNIQUE,  -- same checkout → same order
  total_minor   BIGINT NOT NULL, currency CHAR(3) NOT NULL,
  promised_eta  TIMESTAMP, prep_eta TIMESTAMP,
  created_at    TIMESTAMP NOT NULL
);
CREATE TABLE order_events (                -- also the outbox
  order_id CHAR(26), seq INT, type VARCHAR(32), payload JSON, created_at TIMESTAMP,
  published BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (order_id, seq)
);
-- menus: restaurants(id, name, geo_point, delivery_polygon, open_hours, rating)
--        items(id, restaurant_id, name, price_minor, veg, available)
-- live: riders:{zone} geo set → rider_id ; rider:{id} → {lat, lng, status, ts}`, notes:'Transitions are conditional updates on (state, version), written together with an order_events row in one transaction; a relay publishes unpublished events to Kafka. Menus are read-heavy and cached; rider positions never touch MySQL.'},
  apis:[
    {m:'POST', path:'/v1/orders', note:'Idempotency-Key per checkout: a retry returns the same order instead of creating a new one.', req:'{ "restaurant_id": 4411, "items": [ {"id": 81, "qty": 2}, {"id": 93, "qty": 1} ], "address_id": "a_12", "payment": "upi", "quoted_eta_min": 32 }', res:'{ "order_id": "01JCA…", "state": "PAYMENT_PENDING", "upi_intent": "upi://pay?…", "total": {"amount": 42000, "currency": "INR"} }'},
    {m:'POST', path:'/v1/restaurant/orders/{id}/accept', note:'Restaurant app; includes its own prep estimate, which feeds the prep-time model.', req:'{ "prep_minutes": 18 }', res:'{ "state": "ACCEPTED", "ready_eta": "2026-11-13T20:42:00+05:30" }'},
    {m:'WS', path:'subscribe order:{id}', note:'The customer’s live channel: state changes and throttled rider positions.', res:'{ "type": "rider_location", "lat": 12.9352, "lng": 77.6245, "eta_min": 4 }'}],
  algorithm:{title:'When to assign: just in time and batching', html:'<p>The most important decision in food delivery is <b>when</b> to assign a rider, not just <b>who</b>. Assign at once and the rider waits while the food is cooked; assign too late and the food waits for the rider. Platforms predict <b>prep time</b> and <b>travel time</b> and assign so that the rider arrives as the food is ready, and they <b>batch</b> orders from the same kitchen. The simulator below runs a real discrete-event model of a dinner rush under three policies on exactly the same orders.</p>', mount:rushSim, pg:'geo'},
  tradeoffs:[['Just-in-time assignment', 'Riders aren’t parked at restaurants; fewer rider-minutes per order', 'Relies on prep-time predictions; when they are wrong, food waits'], ['Batching two orders', 'One trip serves two customers; big productivity gain at the peak', 'The second customer waits a few minutes longer'], ['Event-driven order workflow (Kafka + outbox)', 'Services decoupled; nothing lost on crashes; easy to add consumers', 'Eventual consistency; debugging needs tracing across services'], ['Admission control in stressed zones', 'Protects the experience of accepted orders', 'Lost sales and unhappy customers who are refused'], ['Separate search index', 'Fast geo and text search with ranking', 'Index lag (seconds) and another system to run']],
  alternatives:[['Assign at order time (simple)', 'Fine when riders are plentiful; wastes rider time when they are not'], ['Restaurants deliver themselves', 'No fleet to run, but most restaurants can’t cover peaks'], ['Synchronous order pipeline (REST chain)', 'Simple at first; one slow dependency stalls checkout and failures lose orders'], ['Polling for tracking', 'Easy, but traffic grows with every watching customer']],
  failures:[['Search', 'Cached popular lists; reorder from history'], ['Payment gateway', 'Fail over to another gateway; reconcile PENDING payments'], ['Assignment', 'Events wait in Kafka; resume from offsets'], ['Restaurant offline', 'Timer → automated call → auto-cancel and refund'], ['Realtime gateway', 'Reconnect with jitter; resync via API; push fallback']],
  lab:{stack:['Node.js / NestJS', 'MySQL or Postgres', 'Redis (cache + GEO)', 'Kafka or Redpanda', 'OpenSearch / Elasticsearch', 'WebSocket server', 'k6'], milestones:[
    {day:'Day 1: browse & order', items:['Seed 1,000 restaurants with menus and delivery radii', 'Search API with geo filter + text match (OpenSearch)', 'Menu cache-aside in Redis with invalidation on edit', 'POST /orders with idempotency keys; prove double-submit creates one order']},
    {day:'Day 2: workflow & realtime', items:['Order state machine with conditional updates + outbox → Kafka', 'Fake payment provider with random timeouts, webhooks and a reconciliation job', 'Restaurant tablet over WebSocket; acceptance timer with auto-cancel', 'Customer order channel with status pushes']},
    {day:'Day 3: riders & the rush', items:['Rider simulator (300 riders) pinging every 4 s into Redis GEO', 'Assignment consumer: at-once first, then just-in-time with a prep-time estimate', 'Batch two orders from the same restaurant when ready times are close', 'k6 dinner rush: ramp 5× in 10 minutes; record delivery time and rider idle time']}],
   pseudocode:{lang:'ts', code:`// Just-in-time assignment with batching (runs every few seconds per zone)
for (const order of pendingOrders(zone)) {                 // accepted, no rider yet
  const ready = order.predictedReadyAt;                    // prep-time model
  const rider = nearestFreeRider(order.restaurant);
  if (!rider) break;                                       // zone saturated → capacity control
  const arrival = now() + travelMinutes(rider, order.restaurant);
  if (arrival < ready - SLACK_MIN) continue;               // too early: keep the rider free
  const mate = pendingOrders(zone).find(o => o !== order && o.restaurant === order.restaurant
             && o.predictedReadyAt <= ready + 5 && distanceKm(o.drop, order.drop) <= 2);
  await offer(rider, mate ? [order, mate] : [order]);      // rider accepts → ASSIGNED events
}`},
   loadTest:'<p>Replay a synthetic evening: 1 order/min per zone at 7 pm, rising to 3.5/min at 8:30, falling back by 10. Run the three assignment policies on identical orders and compare average and p90 delivery time, late-order rate and rider-minutes per order. Then kill the assignment consumer for 2 minutes at the peak: no order may be lost, and the catch-up must not double-assign.</p>'},
  twists:[
    {q:'The payment succeeded at the bank but your service crashed before saving it. How does the order recover?', a:'The order sits in PAYMENT_PENDING with its idempotency key. The payment gateway’s webhook (retried until acknowledged) or a reconciliation job that queries the gateway for stuck payments moves it to PLACED. If the order can’t be fulfilled, it is refunded automatically. The customer never pays twice, because retries reuse the same key.'},
    {q:'How would you predict prep time, and what happens when it’s wrong?', a:'Train a model on history per restaurant, dish mix, order size, time of day and current kitchen load (orders in progress), and update it as the restaurant marks orders ready. If it’s too optimistic, riders wait (costing rider time); if it’s pessimistic, food waits (cold food, late delivery). Use a small slack, and reassign or add a nearby rider when a restaurant is running late.'},
    {q:'Rain hits one area and orders there triple. What do you do in the first 10 minutes?', a:'Detect it per zone (pending orders per free rider), then apply levers in order: raise the delivery fee and rider incentives there, shrink the serviceable radius, show honest longer ETAs, batch more aggressively, and finally pause new orders in the worst zone. Protect orders already accepted rather than accepting more than you can deliver.'}],
  real:[
    {co:'Uber Eats (delivery-time prediction)', tier:'confirmed', text:'Uber’s Michelangelo ML platform was introduced with the example of predicting Uber Eats estimated delivery times from features such as prep time and travel time.', src:'Uber Engineering, “Meet Michelangelo: Uber’s Machine Learning Platform” (2017)'},
    {co:'DoorDash (dispatch)', tier:'confirmed', text:'DoorDash has described its dispatch system, which uses ML predictions (such as food-ready time) together with optimisation to decide which Dasher gets which orders, including batching.', src:'DoorDash Engineering blog posts on its dispatch system (DeepRed)'},
    {co:'Zomato and Swiggy', tier:'inference', text:'Both Indian platforms operate the three-sided model described here and have discussed delivery-time prediction and order assignment in public engineering talks and posts, but their production architectures are not documented in enough detail to describe; this case is a reference design.', src:'This case study; Zomato and Swiggy public engineering material'},
    {co:'Peak-hour patterns', tier:'inference', text:'Lunch and dinner peaks several times the daily average are characteristic of food delivery; the multipliers used here are assumptions.', src:'This case study'},
    {co:'Simulator and numbers', tier:'educational', text:'The dinner-rush simulator, its policies and all scale numbers are simplified teaching models with illustrative inputs.', src:'This case study’s models'}],
  sources:['Uber Engineering — Meet Michelangelo: Uber’s Machine Learning Platform (2017)', 'DoorDash Engineering — posts on the DeepRed dispatch system', 'Chris Richardson — Microservices Patterns (sagas, transactional outbox)', 'Kleppmann — Designing Data-Intensive Applications (change data capture, event logs)', 'Elasticsearch documentation — geo queries (geo_shape, geo_distance)', 'AWS Architecture Center — scheduled and predictive scaling']
});

/* ======================= 3. WHATSAPP ======================= */
SDA.register({kind:'case', id:'whatsapp', tier:'flagship', icon:'💬', title:'WhatsApp (messaging at planet scale)', tagline:'Two ticks, billions of phones: persistent connections, store-and-forward and end-to-end encryption.', tags:['messaging', 'erlang', 'persistent connections', 'store and forward', 'delivery receipts', 'end-to-end encryption', 'signal protocol', 'group fan-out', 'multi-device'],
  modules:['realtime', 'distributed', 'security', 'async', 'reliability'],
  summary:'Deliver a message from one phone to another, or to a group of up to 1,024, <b>instantly if they’re online, reliably if they’re not</b>, in order, exactly once on screen, over flaky mobile networks, while the servers <b>cannot read</b> any of it. WhatsApp became famous for doing this for hundreds of millions of users with a tiny team, using Erlang servers that each held millions of persistent connections.',
  accuracy:'WhatsApp has published its encryption design (the WhatsApp Encryption Overview whitepaper), its multi-device architecture, delivery-tick meanings and storage policy, and early engineering talks on Erlang/FreeBSD scaling; these are labelled confirmed. Its current infrastructure inside Meta is not documented in detail, so the registry, multi-data-centre and queue details here are inference or simplified for teaching. Numbers are illustrative unless marked publicly disclosed.',
  overview:{what:'Alice sends “On my way 🚕” to Bob. It shows one grey tick when the server has it, two grey ticks when Bob’s phone has it, and two blue ticks when Bob reads it. If Bob’s phone is off, the message waits (encrypted) on the server and arrives when he’s back.', in:['1:1 and group text messaging', 'Online delivery over persistent connections', 'Offline store-and-forward + push notifications', 'Sent / delivered / read receipts, ordering and de-duplication', 'Media (photos, video, voice notes)', 'End-to-end encryption, multi-device'], out:['Voice and video calls (see the WebRTC lesson and Zoom case)', 'Status / stories, Channels', 'Payments (see the UPI case)', 'Spam and abuse detection in depth']},
  challenges:['Hundreds of millions of concurrent persistent connections', 'Mobile networks drop, duplicate and reorder packets; phones go offline constantly', 'Exactly-once display and per-chat ordering on top of at-least-once delivery', 'Group fan-out: one send becomes up to 1,023 deliveries, many to offline devices', 'The server must route messages it cannot read (end-to-end encryption)'],
  fr:['Send text and media to a person or a group', 'Messages arrive in order, once, with sent/delivered/read ticks', 'Offline recipients get messages when they reconnect (plus a notification)', 'Last seen / online presence and typing indicators', 'Use the same account on a phone and linked devices'],
  nfr:['Online delivery in a few hundred ms (illustrative target)', 'No message lost once the sender sees one tick', 'Servers store messages only until delivered (WhatsApp keeps undelivered messages up to 30 days)', 'Battery and data frugal: one connection, small binary frames', 'Very high availability; a server crash must not lose messages'],
  scale:[
    {k:'Users', v:'2B+', math:'WhatsApp announcement, “Two Billion Users” (2020)', tag:'public'},
    {k:'Messages per day', v:'≈ 100B', math:'WhatsApp / Facebook, Q3 2020 (about 100 billion per day)', tag:'public'},
    {k:'Average message rate', v:'≈ 1.2M/s', math:'100B ÷ 86,400 s; the peak is perhaps 2–3× higher', tag:'illustrative'},
    {k:'Connections per server', v:'2M+', math:'WhatsApp engineering blog (2012): over 2M TCP connections on one FreeBSD/Erlang server', tag:'public'},
    {k:'Chat servers for 1B online', v:'≈ 1,000', math:'1B connections ÷ ~1M per server (keeping 50% headroom on 2M)', tag:'illustrative'},
    {k:'Offline queue in flight', v:'≈ 400 GB', math:'1.2M msg/s × 10% wait offline × 1 h average × ~1 KB', tag:'illustrative'}],
  arch:{w:940, h:400, minW:700, nodes:[
    {id:'alice', type:'client', label:'Alice (phone)', x:70, y:120, w:110},
    {id:'bob', type:'client', label:'Bob (phone)', x:70, y:270, w:110},
    {id:'bob2', type:'client', label:'Bob’s laptop', x:70, y:350, w:110, stage:8},
    {id:'apns', type:'ext', label:'APNs / FCM', sub:'mobile push', x:250, y:45, w:120, stage:2},
    {id:'lb', type:'lb', label:'Load balancers', sub:'TCP', x:250, y:195, w:130, stage:3},
    {id:'cdn', type:'cdn', label:'Media CDN', sub:'encrypted blobs', x:250, y:350, w:124, stage:5},
    {id:'reg', type:'cache', label:'Session registry', sub:'user → chat server', x:440, y:55, w:156, stage:3},
    {id:'chat', type:'service', label:'Chat server', sub:'HTTP + polling', x:440, y:195, w:156},
    {id:'media', type:'service', label:'Media service', sub:'upload · store', x:440, y:335, w:140, stage:5},
    {id:'keys', type:'db', label:'Key server', sub:'public prekeys', x:640, y:55, w:130, stage:7},
    {id:'grp', type:'service', label:'Group service', sub:'membership', x:640, y:195, w:140, stage:6},
    {id:'db', type:'db', label:'MySQL', sub:'messages table', x:640, y:335, w:150},
    {id:'dc2', type:'service', label:'Second data centre', sub:'replicated state', x:840, y:335, w:150, stage:9}],
   edges:[{from:'alice', to:'chat', gone:3}, {from:'bob', to:'chat', gone:3}, {from:'chat', to:'db'},
     {from:'chat', to:'apns', stage:2}, {from:'apns', to:'bob', stage:2},
     {from:'alice', to:'lb', stage:3}, {from:'bob', to:'lb', stage:3}, {from:'lb', to:'chat', stage:3}, {from:'chat', to:'reg', stage:3},
     {from:'lb', to:'media', stage:5}, {from:'media', to:'cdn', stage:5}, {from:'cdn', to:'bob', stage:5},
     {from:'chat', to:'grp', stage:6}, {from:'grp', to:'db', stage:6},
     {from:'chat', to:'keys', stage:7},
     {from:'bob2', to:'lb', stage:8},
     {from:'db', to:'dc2', stage:9, dashed:true}]},
  evolution:[
    {title:'Two phones, one server, one database', scale:'1K users', fix:'<p>A web server and a MySQL <code>messages</code> table. Alice’s app POSTs a message; Bob’s app polls <code>GET /messages?since=…</code> every few seconds and deletes what it has fetched. Simple, and good enough for a few friends.</p>', after:{lat:250, err:.2, load:15}},
    {title:'Polling every 5 s melts the server and the battery', scale:'100K users', hot:['chat', 'db'], breaks:'<p>100K phones × one poll every 5 s = 20K requests/s, almost all returning “nothing new”, each opening a connection and hitting the database. Messages still take up to 5 s, and phones never sleep.</p>', fix:'<p>Hold one <b>persistent connection</b> per phone (WhatsApp began from ejabberd, an Erlang XMPP server, and evolved it heavily). The server <b>pushes</b> a message the instant it arrives; small heartbeats keep NAT mappings alive. Erlang’s lightweight processes make one process per connection cheap.</p>', sub:{chat:'Erlang · persistent TCP'}, before:{lat:2500, err:2, load:200}, after:{lat:120, err:.1, load:35}, flow:[['alice', 'chat', 'msg'], ['chat', 'bob', 'push on open socket']], lesson:['realtime-transports', 'websockets-at-scale']},
    {title:'Bob’s phone is off', scale:'1M users', hot:['chat'], breaks:'<p>The server has nowhere to push the message. Keeping it in the sender’s connection loses it if the server restarts; keeping it forever fills the disks.</p>', fix:'<p><b>Store and forward</b>: append the message to Bob’s <b>offline queue</b>, wake his app with a <b>push notification</b> (APNs on iOS, FCM on Android), and drain the queue when he reconnects. Once Bob’s device acknowledges delivery, the server <b>deletes</b> the message; WhatsApp keeps undelivered messages for up to 30 days.</p>', sub:{db:'offline queues'}, before:{lat:400, err:5, load:60}, after:{lat:130, err:.1, load:40}, flow:[['alice', 'chat', 'msg for Bob'], ['chat', 'db', 'queue for Bob'], ['chat', 'apns', 'wake Bob'], ['apns', 'bob', 'notification']], lesson:['push-notifications', 'delivery-semantics']},
    {title:'One server can’t hold 100M sockets', scale:'100M users', hot:['chat'], breaks:'<p>Even a heavily tuned server holds a few million connections. When Alice’s connection lands on server 3 and Bob’s on server 17, server 3 doesn’t know where Bob is.</p>', fix:'<p>Run many chat servers behind <b>TCP load balancers</b>; WhatsApp reported over <b>2 million connections</b> on a single FreeBSD/Erlang server in 2012. A <b>session registry</b> maps each user to the server holding their connection; the sender’s server looks Bob up and forwards to that server (servers talk over a cluster mesh).</p>', sub:{chat:'~2M conns/server'}, before:{lat:3000, err:8, load:400}, after:{lat:150, err:.1, load:50}, flow:[['alice', 'lb', 'connect'], ['lb', 'chat'], ['chat', 'reg', 'Bob → chat-17']], lesson:['lb-l4-vs-l7', 'websockets-at-scale']},
    {title:'Lost, doubled and shuffled messages', scale:'flaky 3G', hot:['chat'], breaks:'<p>Packets are lost on the train, so messages vanish. Naive retries show “On my way” twice. Two messages sent 50 ms apart take different paths and arrive swapped.</p>', fix:'<p>Every message carries a <b>client-generated id</b>. The server stores it durably and acks (<b>✓</b>); Bob’s device acks delivery (<b>✓✓</b>) and reading (<b>blue ✓✓</b>). Senders <b>retry until acked</b>, servers and receivers <b>de-duplicate by id</b>, and a <b>per-chat sequence</b> orders the conversation. At-least-once delivery + idempotent receive = exactly-once display. Try it in the delivery simulator in Deep dives.</p>', sub:{chat:'acks · dedupe · seq'}, before:{lat:300, err:4, load:60}, after:{lat:160, err:.01, load:55}, flow:[['alice', 'lb', 'msg id=7f3, seq 42'], ['lb', 'chat'], ['chat', 'lb', '✓ stored'], ['lb', 'alice']], lesson:['delivery-semantics', 'idempotency-rate-limit-headers', 'ordering-dlq']},
    {title:'A 20 MB video blocks the chat pipe', scale:'billions of media/day', hot:['chat'], breaks:'<p>Sending videos through the chat connection blocks small messages behind them (head-of-line blocking) and makes chat servers handle bulk bytes. Groups multiply it: the same video is sent once per member.</p>', fix:'<p>Upload media <b>separately</b>: the sender encrypts the file with a random key and uploads the ciphertext once to a <b>media service</b> backed by blob storage and a CDN. The chat message carries only the pointer, the key and a hash. Recipients download, verify the hash and decrypt. This is the design described in WhatsApp’s encryption whitepaper.</p>', before:{lat:2000, err:1.5, load:130}, after:{lat:160, err:.05, load:55}, flow:[['alice', 'lb', 'upload encrypted blob'], ['lb', 'media'], ['media', 'cdn', 'store'], ['cdn', 'bob', 'download + verify']], lesson:['cdn', 'storage-types']},
    {title:'Groups: one send, 1,024 recipients', scale:'1,024-member groups', hot:['chat'], breaks:'<p>A message to a 1,000-member group means 999 deliveries, most to members on other servers and many offline. Doing it inside the sender’s request makes the send slow and fragile.</p>', fix:'<p>A <b>group service</b> stores membership. The server accepts the message once, acks the sender, then <b>fans out</b> asynchronously: online members get it on their chat servers (via the registry); offline members get it queued plus a push. With <b>sender keys</b>, the sender uploads one ciphertext and the server copies it. WhatsApp raised the group limit to 1,024 in 2022.</p>', before:{lat:1800, err:2, load:180}, after:{lat:200, err:.1, load:60}, flow:[['chat', 'grp', 'members of group G'], ['grp', 'db', 'queue for offline members'], ['chat', 'reg', 'servers of online members']], lesson:['fan-out', 'queues-pubsub-streams']},
    {title:'The server can read every message', scale:'privacy', hot:['chat', 'db'], breaks:'<p>Messages travel TLS-encrypted, but the servers see plaintext. A breach, an insider, or a legal demand exposes everyone’s conversations stored in queues.</p>', fix:'<p><b>End-to-end encryption</b> with the Signal Protocol (default on WhatsApp since 2016). Each device publishes public identity and one-time prekeys to a <b>key server</b>; Alice fetches Bob’s bundle, derives a session key, and the Double Ratchet gives every message a fresh key. Servers only ever route and store <b>ciphertext</b>. Groups use <b>sender keys</b>.</p>', before:{lat:200, err:.8, load:60}, after:{lat:180, err:.05, load:58}, flow:[['chat', 'keys', 'Bob’s prekey bundle'], ['alice', 'lb', 'ciphertext only']], lesson:['encryption', 'https-tls']},
    {title:'Phone off = WhatsApp Web dead', scale:'multi-device', hot:['bob'], breaks:'<p>Linked computers mirror the phone: the laptop works only while the phone is online, because only the phone holds the keys.</p>', fix:'<p>Make each device a <b>first-class client</b> with its own identity keys (WhatsApp’s 2021 multi-device architecture). The registry maps user → devices → servers; senders encrypt <b>once per device</b> (client fan-out), and history is transferred encrypted when a device is linked. The server still can’t read anything.</p>', sub:{reg:'user → devices', keys:'per-device keys'}, before:{lat:350, err:3, load:60}, after:{lat:180, err:.05, load:60}, flow:[['bob2', 'lb', 'connect with own keys'], ['lb', 'chat'], ['chat', 'reg', 'Bob: phone + laptop']], lesson:['offline-first-sync', 'encryption']},
    {title:'A data centre goes dark', scale:'global', down:['chat'], hot:['lb'], breaks:'<p>A power or network failure takes out a data centre. Millions of connections drop at once; if they all reconnect immediately, the surviving sites drown in a <b>reconnect storm</b>. Queued messages there are unreachable.</p>', fix:'<p>Run in several data centres with registry state and offline queues <b>replicated</b>. Clients reconnect to a healthy site with <b>exponential backoff and jitter</b>; unacked messages are simply resent by id, so nothing is lost or doubled. Capacity is planned so the remaining sites can absorb a lost one.</p>', before:{lat:5000, err:30, load:100}, after:{lat:250, err:.2, load:70}, flow:[['db', 'dc2', 'replicate queues'], ['alice', 'lb', 'reconnect (backoff + jitter)']], lesson:['multi-az-region', 'timeouts-retries']}],
  flows:[
    {name:'Send a message (Bob online)', steps:[
      {note:'Alice’s app encrypts for Bob’s devices and sends the ciphertext with a message id over its persistent connection.', flow:[['alice', 'lb', 'ciphertext · id 7f3'], ['lb', 'chat']]},
      {note:'The server stores it durably and acks Alice: one grey tick.', flow:[['chat', 'lb', '✓'], ['lb', 'alice']]},
      {note:'It looks up which chat server holds Bob’s connection.', flow:[['chat', 'reg', 'Bob → chat-17']]},
      {note:'The message is pushed down Bob’s open connection.', flow:[['chat', 'lb', 'deliver'], ['lb', 'bob']]},
      {note:'Bob’s phone acks delivery (two grey ticks) and, when he opens the chat, a read receipt (blue ticks). The server deletes its copy.', flow:[['bob', 'lb', '✓✓ delivered · read'], ['lb', 'chat'], ['chat', 'db', 'delete copy'], ['chat', 'lb', 'receipt'], ['lb', 'alice', '✓✓']]}]},
    {name:'Bob is offline', steps:[
      {note:'Alice sends as usual and gets one tick.', flow:[['alice', 'lb', 'msg'], ['lb', 'chat'], ['chat', 'lb', '✓'], ['lb', 'alice']]},
      {note:'The registry has no live session for Bob, so the ciphertext goes into his offline queue.', flow:[['chat', 'reg', 'Bob? not connected'], ['chat', 'db', 'append to Bob’s queue']]},
      {note:'A push notification (no message content) wakes Bob’s app.', flow:[['chat', 'apns', 'wake Bob'], ['apns', 'bob', 'notification']]},
      {note:'Bob reconnects; the server drains his queue in order.', flow:[['bob', 'lb', 'connect'], ['lb', 'chat'], ['chat', 'db', 'read queue'], ['chat', 'lb', 'queued messages'], ['lb', 'bob']]},
      {note:'After Bob’s ✓✓ acks, the queued copies are deleted and Alice sees two ticks.', flow:[['chat', 'db', 'delete delivered'], ['chat', 'lb', '✓✓'], ['lb', 'alice']]}]},
    {name:'Photo to a group', steps:[
      {note:'Alice encrypts the photo with a random key and uploads the ciphertext once.', flow:[['alice', 'lb', 'encrypted photo'], ['lb', 'media'], ['media', 'cdn', 'store blob']]},
      {note:'She sends one group message (pointer + key + hash) encrypted with her sender key.', flow:[['alice', 'lb', 'group msg (sender key)'], ['lb', 'chat']]},
      {note:'The server reads the membership and queues copies for offline members.', flow:[['chat', 'grp', 'members'], ['grp', 'db', 'queue for offline']]},
      {note:'Online members (all their devices) get the same ciphertext pushed.', flow:[['chat', 'lb', 'fan out'], ['lb', 'bob'], ['lb', 'bob2']]},
      {note:'Each recipient downloads the blob from the CDN, checks the hash and decrypts it.', flow:[['cdn', 'bob', 'download · verify · decrypt']]}]}],
  breakIt:[
    {label:'A chat server crashes', kill:['chat'], verdict:'degrades', text:'Its users’ connections drop; apps reconnect (with backoff and jitter) to other servers and re-register. Unacked messages are resent by id and de-duplicated, so nothing is lost or doubled; delivery pauses for a few seconds.'},
    {label:'Session registry unavailable', kill:['reg'], verdict:'degrades', text:'Servers can’t find online recipients, so messages fall back to offline queues plus a push notification. Delivery is slower (seconds instead of milliseconds) but nothing is lost.', flow:[['chat', 'db', 'queue instead']]},
    {label:'APNs / FCM delayed', kill:['apns'], verdict:'degrades', text:'Offline phones aren’t woken, so messages wait in their queues until the app is opened or the push service recovers. Online users are unaffected.'},
    {label:'Media CDN outage', kill:['cdn'], verdict:'degrades', text:'Text keeps flowing. Photos and videos show “tap to retry”; the blobs are still stored and download when the CDN recovers.'},
    {label:'Key server down', kill:['keys'], verdict:'degrades', text:'Existing conversations keep working: sessions and ratchets live on the devices. Only new sessions (a new contact, a newly linked device) can’t fetch prekeys until it’s back.'},
    {label:'Offline-queue node lost', kill:['db'], verdict:'survives', text:'Queues are replicated (including to the other data centre); a replica takes over. Senders whose messages weren’t yet acked resend them by id.', flow:[['db', 'dc2', 'replica serves']]},
    {label:'A whole data centre lost', kill:['lb', 'chat'], verdict:'degrades', text:'Clients reconnect to the surviving site with jittered backoff; replicated registry and queues let delivery continue. Expect a minute of reconnects and retries, not lost messages.', flow:[['db', 'dc2', 'take over queues']]}],
  dataModel:{lang:'sql', title:'offline queues, receipts and groups (server never sees plaintext)', code:`-- Offline queue: one row per (recipient device, message); deleted on delivery ack
CREATE TABLE offline_queue (
  device_id     BIGINT,          -- every device is a separate recipient
  chat_seq      BIGINT,          -- per-chat order assigned when the server accepts the message
  msg_id        BINARY(16),      -- client-generated; dedupe key
  sender_device BIGINT,
  ciphertext    BLOB,            -- end-to-end encrypted; opaque to the server
  enqueued_at   TIMESTAMP,       -- purge after 30 days if never delivered
  PRIMARY KEY (device_id, chat_seq)
);
CREATE TABLE group_members (group_id BIGINT, user_id BIGINT, role TINYINT, PRIMARY KEY (group_id, user_id));
-- Session registry (in memory, replicated):  device:{id} → {chat_server, connected_since}
-- Key server: identity_key, signed_prekey, one_time_prekeys[] per device (public keys only)`, notes:'The server stores only what it needs to route: who it’s for, an id for de-duplication, an order, and an opaque blob. It deletes the blob once the recipient device acks.'},
  apis:[
    {m:'FRAME', path:'send (client → server)', note:'Binary frames over the persistent connection, shown here as JSON.', req:'{ "type": "msg", "id": "7f3a…", "to": "bob", "devices": [ {"id": 1, "ct": "<ciphertext for phone>"}, {"id": 2, "ct": "<ciphertext for laptop>"} ] }', res:'{ "type": "ack", "id": "7f3a…", "seq": 42, "ts": 1731500000 }'},
    {m:'FRAME', path:'receipt (recipient → server → sender)', note:'Delivered and read receipts travel the same path in reverse; the sender’s app turns them into ✓✓ and blue ✓✓.', req:'{ "type": "receipt", "ids": ["7f3a…"], "kind": "read" }'},
    {m:'GET', path:'/v1/keys/{user}/bundle', note:'Fetch public identity key, signed prekey and one one-time prekey per device to start an encrypted session.', res:'{ "devices": [ {"id": 1, "identity": "<pub>", "signed_prekey": "<pub+sig>", "one_time_prekey": "<pub>"} ] }'}],
  algorithm:{title:'Exactly-once, in-order delivery on a lossy network', html:'<p>A network can give you at-most-once (send and hope) or at-least-once (retry until acked) delivery, never exactly-once. Messaging apps get <b>exactly-once display</b> by combining at-least-once delivery with <b>idempotent receive</b> (de-duplicate by message id) and <b>sequence numbers</b> for order. The simulator below runs all three approaches on the same lossy network and compares the result with theory. The calculator shows why WhatsApp groups use <b>sender keys</b>.</p>', mount:host => { deliverySim(host); host.append(hr()); fanoutCalc(host); }, pg:'retry-jitter'},
  tradeoffs:[['Persistent connections', 'Instant delivery, tiny frames, no polling', 'Millions of open sockets per server; reconnect storms to manage'], ['Store and forward, delete on delivery', 'Little server storage and less data to protect', 'No server-side history: backups and new devices need separate, encrypted mechanisms'], ['End-to-end encryption', 'The server can’t read messages, even if breached', 'No server-side search, moderation or spam filtering on content; key management on devices'], ['Sender keys for groups', 'One encryption and upload per message', 'Re-key on every membership change; weaker forward secrecy within a sender chain'], ['Erlang/BEAM for chat servers', 'Cheap processes per connection, fault isolation, hot code loading', 'A niche ecosystem and hiring pool']],
  alternatives:[['HTTP long polling', 'Works through every proxy, but heavier per message and on batteries than one persistent socket'], ['Server-stored history (like Slack or Telegram cloud chats)', 'Great for search and multi-device, but the server holds readable content'], ['Pairwise encryption for groups', 'Simpler key handling, but the sender encrypts and uploads once per member device'], ['Kafka per user as the queue', 'Durable, but billions of tiny per-user queues don’t fit topic/partition models well']],
  failures:[['Chat server', 'Clients reconnect elsewhere; resend unacked messages by id'], ['Registry', 'Fall back to offline queue + push'], ['Push provider', 'Messages wait in queue until the app opens'], ['Media CDN', 'Text works; media retried later'], ['Data centre', 'Reconnect with jitter to a surviving site; replicated queues']],
  lab:{stack:['Elixir/Phoenix or Node.js (ws)', 'Redis (session registry)', 'Postgres or Cassandra (offline queues)', 'S3-compatible store (MinIO) for media', 'libsignal (optional)', 'k6 with WebSockets'], milestones:[
    {day:'Day 1: online chat', items:['WebSocket server; 1:1 messages pushed to online users', 'Client-generated message ids; server acks (✓)', 'Two server instances + Redis registry (user → instance); forward between instances via Redis pub/sub', 'Kill an instance: clients reconnect and re-register']},
    {day:'Day 2: offline & reliability', items:['Offline queue per device, drained on connect, deleted on delivery ack (✓✓)', 'Client retry until ack; receiver de-duplicates by id', 'Per-chat sequence numbers; client reorders and holds gaps', 'Inject 10% packet loss (tc netem or a proxy) and prove: no loss, no duplicates, in order']},
    {day:'Day 3: groups, media, E2E', items:['Group membership + async fan-out to online and offline members', 'Media upload to MinIO with a random AES key; message carries pointer + key + hash', 'Optional: libsignal sessions for 1:1; the server stores only ciphertext', 'k6: 20K concurrent sockets, 2K msg/s; measure p99 delivery and reconnect behaviour']}],
   pseudocode:{lang:'ts', code:`// Server: accept a message (idempotent), ack, then route
async function onSend(conn: Conn, f: { id: string; to: string; devices: { id: number; ct: Uint8Array }[] }) {
  if (await seen.has(f.id)) return conn.send({ type: 'ack', id: f.id });      // retry of a known message
  const seq = await nextSeq(chatOf(conn.user, f.to));
  await Promise.all(f.devices.map(d => queue.append(d.id, { seq, id: f.id, ct: d.ct })));  // durable first
  await seen.add(f.id, { ttlDays: 30 });
  conn.send({ type: 'ack', id: f.id, seq });                                 // one grey tick
  for (const d of f.devices) {
    const server = await registry.get(d.id);
    if (server) cluster.forward(server, d.id); else push.wake(d.id);         // online → push now; else notify
  }
}
// Recipient device: de-duplicate by id, display in sequence order, ack
function onDeliver(m: { id: string; seq: number; ct: Uint8Array }) {
  if (!seenIds.add(m.id)) return ack(m.id);           // duplicate: ack again, don't show
  buffer.set(m.seq, decrypt(m.ct));
  while (buffer.has(nextSeq)) show(buffer.take(nextSeq++));   // hold gaps until filled
  ack(m.id);                                          // two grey ticks on the sender's side
}`},
   loadTest:'<p>Open 20K WebSocket connections with k6 and send 2K messages/s between random pairs, 10% to offline users. Inject 5% packet loss and random delays with a proxy. Check: zero lost messages, zero duplicates displayed, per-chat order preserved, p99 online delivery. Then kill one server: all its clients must reconnect within 30 s without a thundering herd (look at the reconnect rate over time).</p>'},
  twists:[
    {q:'If the server can’t read messages, how do group messages and spam control work?', a:'Groups: members share sender keys pairwise (encrypted), then each group message is encrypted once and the server fans out the same ciphertext. Spam: the server uses metadata and behaviour (account age, send rate, how many recipients block or report), not content; a user’s report forwards the reported messages from their device. That’s the trade-off of end-to-end encryption.'},
    {q:'Bob has a phone and two linked laptops; one laptop has been offline for a week. What happens to messages?', a:'Each device is a separate recipient with its own keys and its own offline queue. Alice’s app encrypts once per device; the server delivers to the online devices now and queues for the sleeping laptop. When it reconnects it drains its own queue. If it stays offline past the retention window, those copies expire and it relies on encrypted history sync from another of Bob’s devices.'},
    {q:'How do you show “online” and “typing…” for a billion users without melting the system?', a:'Treat presence as ephemeral: keep it in memory on the chat server holding the connection, never in a database. Only send presence to people currently viewing that chat (subscribe on open, unsubscribe on close), throttle and coalesce updates, and let “last seen” be a coarse timestamp written rarely. Typing indicators are fire-and-forget and may be dropped.'}],
  real:[
    {co:'WhatsApp (2012)', tier:'confirmed', text:'WhatsApp reported over 2 million simultaneous TCP connections on a single server running FreeBSD and Erlang.', src:'WhatsApp blog, “1 million is so 2011” (2012)'},
    {co:'WhatsApp server stack', tier:'confirmed', text:'WhatsApp’s servers were built in Erlang, starting from a heavily modified ejabberd, with Mnesia used for some storage, on FreeBSD.', src:'Rick Reed, “Scaling to Millions of Simultaneous Connections” (Erlang Factory 2012) and “That’s ‘Billion’ with a ‘B’: Scaling to the Next Level at WhatsApp” (Erlang Factory 2014)'},
    {co:'WhatsApp encryption', tier:'confirmed', text:'End-to-end encryption uses the Signal Protocol (identity keys, signed and one-time prekeys, Double Ratchet). Groups use sender keys. Media is encrypted with a random key and uploaded as an encrypted blob; the message carries the key and a hash.', src:'WhatsApp Encryption Overview (technical whitepaper); WhatsApp announcement of end-to-end encryption (April 2016)'},
    {co:'WhatsApp multi-device', tier:'confirmed', text:'Each linked device has its own identity key; the sender encrypts a message separately for each of the recipient’s devices (client-fanout), so the phone no longer needs to be online.', src:'Meta Engineering, “How WhatsApp enables multi-device capability” (2021)'},
    {co:'WhatsApp ticks and retention', tier:'confirmed', text:'One grey tick means sent, two grey ticks delivered, two blue ticks read. Messages are deleted from servers once delivered; undelivered messages are kept encrypted for up to 30 days.', src:'WhatsApp Help Center: “How to check read receipts”; WhatsApp privacy FAQ on message storage'},
    {co:'WhatsApp scale', tier:'confirmed', text:'WhatsApp passed 2 billion users in 2020 and carried about 100 billion messages a day; groups were later raised to 1,024 members.', src:'WhatsApp blog, “Two Billion Users” (2020); Facebook Q3 2020 earnings call; WhatsApp Communities announcement (2022)'},
    {co:'Registry, queues, multi-DC', tier:'inference', text:'How today’s WhatsApp, inside Meta’s infrastructure, implements session routing, offline queues and multi-site replication isn’t documented in detail; the components shown are a reasonable inference.', src:'This case study'},
    {co:'Simulators', tier:'educational', text:'The delivery-guarantee simulator and the encryption fan-out calculator are simplified teaching models.', src:'This case study’s models'}],
  sources:['WhatsApp blog — 1 million is so 2011 (2012)', 'Rick Reed — Scaling to Millions of Simultaneous Connections (Erlang Factory 2012)', 'Rick Reed — That’s ‘Billion’ with a ‘B’: Scaling to the Next Level at WhatsApp (Erlang Factory 2014)', 'WhatsApp — WhatsApp Encryption Overview (technical whitepaper)', 'Meta Engineering — How WhatsApp enables multi-device capability (2021)', 'Marlinspike & Perrin — The X3DH Key Agreement Protocol and The Double Ratchet Algorithm (Signal specifications, 2016)', 'WhatsApp Help Center — read receipts and message storage', 'Kleppmann — Designing Data-Intensive Applications (delivery guarantees, idempotence)']
});
})();
