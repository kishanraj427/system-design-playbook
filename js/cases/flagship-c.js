/* =====================================================================
   PART 12 · FLAGSHIP CASES (c) — Instagram/X feed · Amazon/Flipkart
   (+ flash sale) · UPI · IRCTC/BookMyShow
   Each: 10-step evolution, several request flows, Break-It, and real
   simulations (pure maths exposed on SDA.flagshipC for checking).
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, esc, fmtNum, fmtBytes, sv, rng} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const frag = html => document.createRange().createContextualFragment(html);
const hr = () => el('hr', {style:{border:'0', borderTop:'1px solid var(--border)', margin:'18px 0'}});
const note = html => el('p', {class:'lab-hint', html});
const pct = (a, b) => b ? a / b * 100 : 0;
const quantile = (arr, q) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const mean = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const fmtDurS = v => v < 1 ? Math.round(v * 1000) + ' ms' : v < 120 ? v.toFixed(1) + ' s' : (v / 60).toFixed(1) + ' min';
const fmtMs = v => v >= 1000 ? (v / 1000).toFixed(1) + ' s' : Math.round(v) + ' ms';
function heap(){ const a = []; return {push(x){ a.push(x); let i = a.length - 1; while (i){ const p = (i - 1) >> 1; if (a[p].t < a[i].t || (a[p].t === a[i].t && a[p].s <= a[i].s)) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }, pop(){ const top = a[0], last = a.pop(); if (a.length){ a[0] = last; let i = 0; for (;;){ const l = 2 * i + 1, r = l + 1; let m = i; const lt = (x, y) => a[x].t < a[y].t || (a[x].t === a[y].t && a[x].s < a[y].s); if (l < a.length && lt(l, m)) m = l; if (r < a.length && lt(r, m)) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }, get size(){ return a.length; }}; }
/* a small multi-series SVG line chart (log or linear x) */
function chart(host, o){
  const W = 640, H = 230, L = 60, B = 38, T = 14, R = 14; const xs = o.series[0].pts.map(p => p[0]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs), yMax = o.yMax || Math.max(...o.series.flatMap(s => s.pts.map(p => p[1]))) * 1.08 || 1;
  const fx = o.logX ? v => Math.log10(v) : v => v; const X = v => L + (fx(v) - fx(xMin)) / ((fx(xMax) - fx(xMin)) || 1) * (W - L - R);
  const ys = o.series.flatMap(s => s.pts.map(p => p[1])).filter(v => v > 0);
  const lo = o.logY ? Math.pow(10, Math.floor(Math.log10(Math.min(...ys)))) : 0, hi = o.logY ? Math.pow(10, Math.ceil(Math.log10(Math.max(...ys)))) : yMax;
  const Y = o.logY ? v => H - B - (Math.log10(Math.max(lo, Math.min(hi, v))) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo) || 1) * (H - B - T) : v => H - B - Math.min(v, yMax) / yMax * (H - B - T);
  const yTicks = o.logY ? (() => { const n = Math.round(Math.log10(hi / lo)), step = Math.ceil(n / 5); const t = []; for (let k = 0; k <= n; k += step) t.push(lo * Math.pow(10, k)); return t; })() : [0, .5, 1].map(f => yMax * f);
  const svg = sv('svg', {viewBox:`0 0 ${W} ${H}`, class:'mini-chart', role:'img'}); const tt = sv('title'); tt.textContent = o.label; svg.append(tt);
  yTicks.forEach(v => { svg.append(sv('line', {class:'gridl', x1:L, x2:W - R, y1:Y(v), y2:Y(v)})); const tx = sv('text', {x:L - 6, y:Y(v) + 4, 'text-anchor':'end'}); tx.textContent = o.yFmt ? o.yFmt(v) : fmtNum(v); svg.append(tx); });
  (o.xTicks || []).forEach(v => { const tx = sv('text', {x:X(v), y:H - B + 16, 'text-anchor':'middle'}); tx.textContent = o.xFmt ? o.xFmt(v) : fmtNum(v); svg.append(tx); });
  if (o.xLabel){ const tx = sv('text', {x:(W + L) / 2, y:H - 4, 'text-anchor':'middle'}); tx.textContent = o.xLabel; svg.append(tx); }
  o.series.forEach(s => { let d = ''; s.pts.forEach((p, i) => { d += (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }); const pth = sv('path', {d, fill:'none', 'stroke-width':s.w || '2.2'}); pth.style.stroke = `var(${s.color})`; if (s.dash) pth.setAttribute('stroke-dasharray', '5 4'); svg.append(pth); });
  if (o.marker != null){ const ln = sv('line', {x1:X(o.marker), x2:X(o.marker), y1:T, y2:H - B, 'stroke-width':'1.5', 'stroke-dasharray':'3 3'}); ln.style.stroke = 'var(--text)'; svg.append(ln); }
  const box = el('div', {class:'chart-box'}); box.append(svg); host.append(box);
  host.append(el('div', {class:'pill-row', style:{marginTop:'4px'}}, ...o.series.map(s => el('span', {class:'chip', html:`<span style="display:inline-block;width:12px;height:3px;background:var(${s.color});margin-right:6px;vertical-align:middle"></span>${s.name}`}))));
}

/* =========================== FEED: PUSH / PULL / HYBRID =========================== */
/* Follower counts follow a truncated Pareto on [L, Hc] with exponent α (pdf ∝ x^(−α−1)); L is solved so the mean is K. */
const pIntX = (a, x) => Math.abs(a - 1) < 1e-9 ? Math.log(x) : Math.pow(x, 1 - a) / (1 - a);     // ∫ x·x^(−a−1) = ∫ x^(−a)
const pInt0 = (a, x) => -Math.pow(x, -a) / a;                                                     // ∫ x^(−a−1)
function paretoMean(a, L, Hc){ return (pIntX(a, Hc) - pIntX(a, L)) / (pInt0(a, Hc) - pInt0(a, L)); }
function paretoFit(a, K, Hc){ let lo = 1e-6, hi = K; for (let i = 0; i < 200; i++){ const m = Math.sqrt(lo * hi); if (paretoMean(a, m, Hc) < K) lo = m; else hi = m; } return Math.sqrt(lo * hi); }
function feedCost(o){
  const Hc = Math.max(10, o.users * .3), L = paretoFit(o.alpha, o.K, Hc), T = Math.max(L, Math.min(Hc, o.T));
  const massAll = pIntX(o.alpha, Hc) - pIntX(o.alpha, L), countAll = pInt0(o.alpha, Hc) - pInt0(o.alpha, L);
  const pullShare = T >= Hc ? 0 : (pIntX(o.alpha, Hc) - pIntX(o.alpha, T)) / massAll;      // share of follow edges pointing at "celebrities"
  const celebFrac = T >= Hc ? 0 : (pInt0(o.alpha, Hc) - pInt0(o.alpha, T)) / countAll;
  const postsPerSec = o.users * o.posts / 86400, readsPerSec = o.users * o.reads / 86400;
  const pushWrites = postsPerSec * o.K * (1 - pullShare);                                   // timeline inserts per second
  const pullPerRead = o.K * pullShare;                                                      // celebrity accounts merged per feed open
  return {L, Hc, T, pullShare, celebs:celebFrac * o.users, pushWrites, pullPerRead, readMerges:readsPerSec * pullPerRead, postsPerSec, readsPerSec,
    worstPush:T >= Hc ? Hc : T, worstSec:(T >= Hc ? Hc : T) / o.fanRate, cost:pushWrites + readsPerSec * pullPerRead * o.mergeCost};
}
function paretoSample(o, n, seed){ // Monte Carlo check of the analytic shares
  const R = rng(seed || 1), Hc = Math.max(10, o.users * .3), L = paretoFit(o.alpha, o.K, Hc), a = o.alpha; const lo = Math.pow(L, -a), hi = Math.pow(Hc, -a);
  let sum = 0, above = 0, cnt = 0; for (let i = 0; i < n; i++){ const x = Math.pow(lo - R() * (lo - hi), -1 / a); sum += x; if (x >= o.T){ above += x; cnt++; } }
  return {mean:sum / n, pullShare:above / sum, celebFrac:cnt / n};
}
function feedSim(host){
  const P = {users:500e6, K:200, alpha:1.4, posts:.5, reads:20, logT:6, mergeCost:3, fanRate:1e6}; const out = el('div'), ch = el('div');
  function run(){
    const o = Object.assign({}, P, {T:Math.pow(10, P.logT)}); const r = feedCost(o);
    const push = feedCost(Object.assign({}, o, {T:Infinity})), pull = feedCost(Object.assign({}, o, {T:0}));
    const grid = []; for (let e = 1; e <= 9.01; e += .1) grid.push(Math.pow(10, e));
    const curve = grid.map(T => feedCost(Object.assign({}, o, {T})));
    out.innerHTML = '';
    out.append(frag(h.table(['', 'Push only (fan-out on write)', 'Pull only (fan-out on read)', `Hybrid at ${fmtNum(r.T)} followers`], [
      ['Timeline inserts per second', fmtNum(push.pushWrites), '0', fmtNum(r.pushWrites)],
      ['Accounts merged per feed open', '0', fmtNum(pull.pullPerRead), r.pullPerRead.toFixed(1)],
      ['Read-time merge work per second', '0', fmtNum(pull.readMerges), fmtNum(r.readMerges)],
      ['Biggest single fan-out (one post)', fmtNum(push.worstPush) + ' inserts', '—', fmtNum(r.worstPush) + ' inserts'],
      ['Time for that post to reach every timeline', fmtDurS(push.worstSec), 'at read time', fmtDurS(r.worstSec)],
      ['Accounts treated as “celebrities”', '0', 'everyone', fmtNum(r.celebs)],
      ['Total cost (inserts + ' + P.mergeCost + '× merges)', fmtNum(push.cost), fmtNum(pull.cost), '<b>' + fmtNum(r.cost) + '</b>']], [1, 2, 3])));
    const extra = (r.cost / push.cost - 1) * 100;
    out.append(el('div', {class:'verdict ' + (r.worstSec <= 10 && extra < 300 ? 'ok' : 'warn'), html:`Reads outnumber posts ${fmtNum(P.reads / P.posts)}:1, so <b>push-only is the cheapest on average</b> (${fmtNum(push.cost)} ops/s) and pull-only is ${fmtNum(pull.cost / push.cost)}× worse. But push-only has a fatal worst case: one post by the biggest account means <b>${fmtNum(push.worstPush)}</b> inserts, taking <b>${fmtDurS(push.worstSec)}</b> at ${fmtNum(P.fanRate)} inserts/s while every other post queues behind it. The hybrid pulls the <b>${fmtNum(r.celebs)}</b> accounts above ${fmtNum(r.T)} followers (${(r.pullShare * 100).toFixed(1)}% of follow edges) at read time: the worst fan-out drops to ${fmtDurS(r.worstSec)}, for ${extra >= 0 ? '+' : ''}${extra.toFixed(0)}% average cost.`}));
    ch.innerHTML = '';
    chart(ch, {label:'Total cost vs celebrity threshold', logX:true, logY:true, series:[{name:'Total cost', color:'--accent1', pts:curve.map(c => [c.T, c.cost])}, {name:'Timeline inserts', color:'--warn', dash:true, w:'1.6', pts:curve.map(c => [c.T, c.pushWrites])}, {name:'Read-time merges × weight', color:'--ok', dash:true, w:'1.6', pts:curve.map(c => [c.T, c.readMerges * P.mergeCost])}],
      xTicks:[10, 1e3, 1e5, 1e7, 1e9], xFmt:v => fmtNum(v), xLabel:'Threshold (log): accounts with more followers are pulled at read time', marker:r.T, yFmt:v => fmtNum(v) + '/s'});
  }
  host.append(note('An analytic model. Follower counts follow a power law (a truncated Pareto distribution, tuned so the average account follows K others), which is what real social graphs look like: most accounts have a few hundred followers, a handful have hundreds of millions. Posting pushes the post id into each follower’s timeline unless the author is above the threshold; reading merges the posts of every “celebrity” you follow, and a merge is weighted as costlier than an insert. Fan-out capacity is how many timeline inserts per second the workers can do in total.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Users', min:10e6, max:2e9, step:10e6, value:P.users, fmt:v => fmtNum(v), onInput:v => { P.users = v; run(); }}).el,
      ui.slider({label:'Average accounts followed (K)', min:50, max:800, step:10, value:P.K, onInput:v => { P.K = v; run(); }}).el,
      ui.slider({label:'Power-law exponent α (lower = more extreme celebrities)', min:1.1, max:2.5, step:.05, value:P.alpha, fmt:v => v.toFixed(2), onInput:v => { P.alpha = v; run(); }}).el,
      ui.slider({label:'Posts per user per day', min:.05, max:3, step:.05, value:P.posts, fmt:v => v.toFixed(2), onInput:v => { P.posts = v; run(); }}).el,
      ui.slider({label:'Feed opens per user per day', min:2, max:60, value:P.reads, onInput:v => { P.reads = v; run(); }}).el,
      ui.slider({label:'Celebrity threshold', min:2, max:9, step:.1, value:P.logT, fmt:v => fmtNum(Math.pow(10, v)) + ' followers', onInput:v => { P.logT = v; run(); }}).el,
      ui.slider({label:'Fan-out capacity', min:1e5, max:1e7, step:1e5, value:P.fanRate, fmt:v => fmtNum(v) + ' inserts/s', onInput:v => { P.fanRate = v; run(); }}).el,
      ui.slider({label:'Cost of a read-time merge vs an insert', min:1, max:10, step:.5, value:P.mergeCost, fmt:v => v + '×', onInput:v => { P.mergeCost = v; run(); }}).el), out, ch);
  run();
}

/* =========================== FLASH SALE: STOCK UNDER A STAMPEDE =========================== */
function flashRun(o){
  const R = rng(o.seed || 5), B = o.buyers, S = o.stock, W = o.windowMs; const arr = []; for (let i = 0; i < B; i++) arr.push(R() * W); arr.sort((a, b) => a - b);
  const lat = [], okLat = []; let sold = 0, soldOut = 0, timeouts = 0, maxQ = 0, dbPeak = 0; const dbWrites = {};
  const dbw = t => { const k = Math.floor(t / 1000); dbWrites[k] = (dbWrites[k] || 0) + 1; };
  if (o.strategy === 'naive'){ // read stock, think, write stock = read − 1 (lost updates)
    const q = heap(); let stock = S, seq = 0;
    arr.forEach(t => q.push({t:t + 2, s:seq++, kind:'read', t0:t}));
    while (q.size){ const e = q.pop();
      if (e.kind === 'read'){ if (stock <= 0){ soldOut++; lat.push(e.t + 1 - e.t0); continue; } q.push({t:e.t + 5 + R() * 20, s:seq++, kind:'write', seen:stock, t0:e.t0}); }
      else { stock = e.seen - 1; sold++; dbw(e.t); lat.push(e.t - e.t0); okLat.push(e.t - e.t0); } }
  } else if (o.strategy === 'lock'){ // UPDATE … SET stock = stock − 1 WHERE stock > 0, serialised on one row
    const HOLD = o.lockMs || 2, TO = 3000; let free = 0, stock = S;
    arr.forEach(t => { const start = Math.max(t, free), wait = start - t; maxQ = Math.max(maxQ, Math.round(wait / HOLD));
      if (wait > TO){ timeouts++; lat.push(TO); return; }
      free = start + HOLD; const done = free; dbw(done);
      if (stock > 0){ stock--; sold++; lat.push(done - t); okLat.push(done - t); } else { soldOut++; lat.push(done - t); } });
  } else { // atomic DECR in Redis (single thread), sold-out flag, async order writes at a fixed rate
    const OP = .02, RATE = o.dbRate || 2000; let free = 0, stock = S, flag = false, dbFree = 0;
    arr.forEach(t => { if (flag){ soldOut++; lat.push(1); return; }
      const start = Math.max(t, free), done = start + OP; free = done; maxQ = Math.max(maxQ, Math.round((start - t) / OP));
      stock--; if (stock >= 0){ sold++; const l = done - t + 5; lat.push(l); okLat.push(l); dbFree = Math.max(dbFree, done) + 1000 / RATE; dbw(dbFree); }
      else { flag = true; soldOut++; lat.push(done - t + 1); } });
  }
  Object.values(dbWrites).forEach(v => dbPeak = Math.max(dbPeak, v));
  return {sold, oversold:Math.max(0, sold - S), soldOut, timeouts, p50:quantile(okLat, .5), p99:quantile(okLat, .99), p99all:quantile(lat, .99), maxQ, dbPeak, unsold:Math.max(0, S - sold)};
}
const FLASH = [['naive', 'Read, then write', '--bad'], ['lock', 'Row lock: UPDATE … WHERE stock > 0', '--warn'], ['redis', 'Atomic DECR + queue', '--ok']];
function flashSim(host){
  const P = {buyers:50000, stock:1000, windowMs:2000, lockMs:2, seed:5}; const out = el('div');
  function run(){
    const res = FLASH.map(([s]) => flashRun(Object.assign({}, P, {strategy:s})));
    out.innerHTML = '';
    out.append(frag(h.table([`${fmtNum(P.buyers)} buyers in ${P.windowMs / 1000} s for ${fmtNum(P.stock)} phones`, ...FLASH.map(f => f[1])], [
      ['Orders confirmed', ...res.map(r => fmtNum(r.sold))],
      ['Oversold (sold stock you don’t have)', ...res.map(r => r.oversold ? `<b style="color:var(--bad)">${fmtNum(r.oversold)}</b>` : '0')],
      ['Phones left unsold', ...res.map(r => fmtNum(r.unsold))],
      ['Buyers told “sold out”', ...res.map(r => fmtNum(r.soldOut))],
      ['Requests timed out (3 s)', ...res.map(r => fmtNum(r.timeouts))],
      ['Winners’ p50 / p99 latency', ...res.map(r => r.sold ? fmtMs(r.p50) + ' / ' + fmtMs(r.p99) : '—')],
      ['Peak DB writes in one second', ...res.map(r => fmtNum(r.dbPeak))]], [1, 2, 3])));
    const [a, b, c] = res;
    out.append(el('div', {class:'verdict ' + (c.oversold === 0 && c.sold === Math.min(P.stock, P.buyers) ? 'ok' : 'warn'), html:`Read-then-write lets many buyers see the same stock value, so <b>${fmtNum(a.oversold)}</b> extra phones are “sold” (lost updates). The row lock is correct but serialises everyone on one row: at ${P.lockMs} ms per update it can serve only ${fmtNum(1000 / P.lockMs)} requests/s, so <b>${fmtNum(b.timeouts)}</b> buyers time out${b.unsold ? ` and <b>${fmtNum(b.unsold)}</b> phones stay unsold` : ''}. An atomic decrement in memory sells exactly <b>${fmtNum(c.sold)}</b>, answers in ${fmtMs(c.p99)} at p99, then a sold-out flag answers everyone else instantly; the database receives orders at a steady ${fmtNum(c.dbPeak)}/s from a queue.`}));
  }
  host.append(note('A discrete-event simulation of the first seconds of a flash sale. Buyers arrive uniformly within the window. <b>Read, then write</b>: the app reads the stock (2 ms), works for 5–25 ms, then writes stock = what it read − 1. <b>Row lock</b>: a conditional UPDATE that holds the row lock for the given time; requests queue on that one row and give up after 3 s. <b>Atomic DECR</b>: one in-memory decrement (≈ 20 µs) decides who wins; winners’ orders are queued and written to the database at 2,000/s.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Buyers', min:2000, max:200000, step:2000, value:P.buyers, fmt:v => fmtNum(v), onInput:v => { P.buyers = v; run(); }}).el,
      ui.slider({label:'Phones in stock', min:100, max:20000, step:100, value:P.stock, fmt:v => fmtNum(v), onInput:v => { P.stock = v; run(); }}).el,
      ui.slider({label:'Arrival window', min:200, max:10000, step:200, value:P.windowMs, fmt:v => (v / 1000) + ' s', onInput:v => { P.windowMs = v; run(); }}).el,
      ui.slider({label:'Row-lock time per update', min:.5, max:10, step:.5, value:P.lockMs, fmt:v => v + ' ms', onInput:v => { P.lockMs = v; run(); }}).el),
    el('div', {class:'pill-row', style:{margin:'8px 0'}}, ui.button('🎲 Re-run', () => { P.seed++; run(); }, 'sm')), out);
  run();
}

/* =========================== UPI: TIMEOUTS, RETRIES, REVERSALS =========================== */
function upiRun(o){
  const R = rng(o.seed || 9); let success = 0, cleanFail = 0, double = 0, stuck = 0, pendingShown = 0, reversals = 0, wrongFail = 0;
  const attempt = () => { // a debit at the payer's bank, then a credit at the payee's bank
    if (R() < o.pDebitFail) return {debited:false, credited:false, outcome:'fail'};
    const x = R(); if (x < o.pTimeout) return {debited:true, credited:R() < o.pCreditedOnTimeout, outcome:'timeout'};
    if (x < o.pTimeout + o.pCreditFail) return {debited:true, credited:false, outcome:'fail'}; // explicit decline → reversed at once
    return {debited:true, credited:true, outcome:'ok'}; };
  for (let i = 0; i < o.n; i++){
    const a = attempt();
    if (a.outcome === 'ok'){ success++; continue; }
    if (a.outcome === 'fail'){ cleanFail++; if (a.debited) reversals++; continue; }
    if (o.strategy === 'naive'){ // the app shows "failed"; the payer may pay again with a NEW transaction
      if (a.credited) wrongFail++; else stuck++;            // nobody checks status: stuck until a complaint
      let credits = a.credited ? 1 : 0;
      if (R() < o.pRetry){ const b = attempt(); if (b.credited) credits++; if (b.outcome === 'timeout' && !b.credited) stuck++; if (b.outcome === 'fail' && b.debited) reversals++; }
      if (credits >= 2) double++; if (credits >= 1) success++; else cleanFail++;
    } else { // keep the SAME id: show pending, ask the switch for the final status, auto-reverse within T+1
      pendingShown++; if (a.credited) success++; else { reversals++; cleanFail++; }
    }
  }
  return {n:o.n, success, cleanFail, double, stuck, pendingShown, reversals, wrongFail};
}
function upiTheory(o){ const pt = (1 - o.pDebitFail) * o.pTimeout; return {double:o.n * pt * o.pCreditedOnTimeout * o.pRetry * (1 - o.pDebitFail) * (1 - o.pTimeout - o.pCreditFail + o.pTimeout * o.pCreditedOnTimeout), timeouts:o.n * pt}; }
function upiSim(host){
  const P = {n:100000, pDebitFail:.01, pTimeout:.01, pCreditedOnTimeout:.5, pCreditFail:.005, pRetry:.6, manualDays:5, seed:9}; const out = el('div');
  function run(){
    const a = upiRun(Object.assign({}, P, {strategy:'naive'})), b = upiRun(Object.assign({}, P, {strategy:'proper'})), th = upiTheory(P);
    out.innerHTML = '';
    out.append(frag(h.table([`${fmtNum(P.n)} payments`, 'Treat a timeout as failed (user pays again)', 'Same txn id: pending → check status → auto-reverse'], [
      ['Payee paid twice (double payment)', `<b style="color:${a.double ? 'var(--bad)' : 'inherit'}">${fmtNum(a.double)}</b>`, fmtNum(b.double)],
      ['Shown “failed” although the money arrived', fmtNum(a.wrongFail), '0'],
      ['Debited, not credited, waiting for a manual complaint', fmtNum(a.stuck) + ` (≈ ${P.manualDays} days each)`, '0 (auto-reversed within T+1)'],
      ['Users shown “pending” while status is checked', '0', fmtNum(b.pendingShown)],
      ['Automatic reversals', fmtNum(a.reversals), fmtNum(b.reversals)]], [1, 2])));
    out.append(el('div', {class:'verdict ok', html:`A timeout is not a failure: in ${(P.pCreditedOnTimeout * 100).toFixed(0)}% of timeouts here the money actually reached the payee. Treating it as failed made <b>${fmtNum(a.double)}</b> people pay twice (theory ≈ ${fmtNum(th.double, 0)}) and left <b>${fmtNum(a.stuck)}</b> debits stuck until a complaint. Keeping the same transaction id, showing “pending”, asking the switch for the final status and reversing automatically turns every one of the ${fmtNum(b.pendingShown)} timeouts into a definite answer within T+1, with zero double payments.`}));
  }
  host.append(note('A Monte Carlo model of the hardest part of UPI: a request times out somewhere between the payer’s bank (debit) and the payee’s bank (credit), so the payer’s app doesn’t know whether the money moved. Probabilities are illustrative.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Timeouts after the debit', min:0, max:.05, step:.0025, value:P.pTimeout, fmt:v => (v * 100).toFixed(2) + '%', onInput:v => { P.pTimeout = v; run(); }}).el,
      ui.slider({label:'Of those, money actually credited', min:0, max:1, step:.05, value:P.pCreditedOnTimeout, fmt:v => Math.round(v * 100) + '%', onInput:v => { P.pCreditedOnTimeout = v; run(); }}).el,
      ui.slider({label:'Users who pay again after “failed”', min:0, max:1, step:.05, value:P.pRetry, fmt:v => Math.round(v * 100) + '%', onInput:v => { P.pRetry = v; run(); }}).el), out);
  run();
}
function upiScale(host){
  const P = {monthly:16.7, peak:3, lite:30}; const out = el('div');
  function run(){
    const avg = P.monthly * 1e9 / (30 * 86400), peak = avg * P.peak;
    out.innerHTML = '';
    out.append(frag(h.table(['Quantity', 'Value'], [['Average transactions per second', fmtNum(avg)], ['Peak transactions per second', fmtNum(peak)], ['Bank core (CBS) debits at peak without UPI Lite', fmtNum(peak)], ['… with ' + P.lite + '% of payments from UPI Lite balances', fmtNum(peak * (1 - P.lite / 100))], ['Messages through the switch per transaction (request + response legs)', '≈ 8–10']], [1])));
  }
  host.append(note('From the monthly volume NPCI publishes to the load on the switch and on banks’ core systems. Peak factor and UPI Lite share are illustrative.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Transactions per month', min:1, max:40, step:.1, value:P.monthly, fmt:v => v.toFixed(1) + 'B', onInput:v => { P.monthly = v; run(); }}).el,
      ui.slider({label:'Peak ÷ average', min:1.5, max:6, step:.5, value:P.peak, fmt:v => v + '×', onInput:v => { P.peak = v; run(); }}).el,
      ui.slider({label:'Small payments served by UPI Lite', min:0, max:60, step:5, value:P.lite, fmt:v => v + '%', onInput:v => { P.lite = v; run(); }}).el), out);
  run();
}

/* =========================== IRCTC / BOOKMYSHOW: HOLDS & SEGMENTS =========================== */
function holdRun(o){
  const R = rng(o.seed || 21), q = heap(); let seq = 0; const S = o.seats;
  const seat = new Array(S).fill(0); // 0 free · 1 held · 2 sold
  let sold = 0, refunds = 0, turnedAway = 0, abandoned = 0, retries = 0; const waits = [];
  for (let i = 0; i < o.users; i++){ const t = R() * o.burst; q.push({t, s:seq++, kind:'arrive', u:{t0:t, tries:0, pay:o.payMin + R() * (o.payMax - o.payMin), abandons:R() < o.abandon}}); }
  const freeSeat = () => seat.indexOf(0);
  while (q.size){ const e = q.pop(), u = e.u;
    if (e.kind === 'arrive'){
      if (o.strategy === 'nohold'){ if (S - sold > 0){ if (u.abandons){ abandoned++; continue; } q.push({t:e.t + u.pay, s:seq++, kind:'paid', u}); } else turnedAway++; continue; }
      const k = freeSeat();
      if (k < 0){ if (u.tries < o.retries){ u.tries++; retries++; q.push({t:e.t + 60, s:seq++, kind:'arrive', u}); } else turnedAway++; continue; }
      seat[k] = 1; u.seat = k; u.holdUntil = e.t + o.ttl;
      if (u.abandons){ abandoned++; q.push({t:u.holdUntil, s:seq++, kind:'expire', u}); }
      else { q.push({t:e.t + u.pay, s:seq++, kind:'paid', u}); if (u.pay > o.ttl) q.push({t:u.holdUntil, s:seq++, kind:'expire', u}); }
    } else if (e.kind === 'expire'){ if (seat[u.seat] === 1 && !u.done){ seat[u.seat] = 0; u.expired = true; } }
    else if (e.kind === 'paid'){
      if (o.strategy === 'hold' && !u.expired){ seat[u.seat] = 2; sold++; u.done = true; waits.push(e.t - u.t0); continue; }
      const k = freeSeat(); if (k >= 0){ seat[k] = 2; sold++; u.done = true; waits.push(e.t - u.t0); } else refunds++;
    }
  }
  return {sold, refunds, turnedAway, abandoned, retries, unsold:seat.filter(x => x !== 2).length, avgWait:mean(waits)};
}
/* berth-segment allocation: requests (from, to) on one coach; first-fit vs best-fit (tightest free run) */
function segAlloc(o){
  const R = rng(o.seed || 4), N = o.berths, M = o.stations; const reqs = [];
  for (let i = 0; i < o.requests; i++){ let a = Math.floor(R() * (M - 1)), b = a + 1 + Math.floor(R() * Math.min(o.maxLen, M - 1 - a)); reqs.push([a, b]); }
  const run = policy => {
    const occ = Array.from({length:N}, () => new Array(M - 1).fill(false)); let ok = 0, segUsed = 0, overlap = 0; const RR = rng((o.seed || 4) * 7 + 1);
    for (const [a, b] of reqs){
      let best = -1, bestScore = Infinity; const cands = [];
      for (let k = 0; k < N; k++){
        let free = true; for (let s = a; s < b; s++) if (occ[k][s]){ free = false; break; } if (!free) continue;
        if (policy === 'first'){ best = k; break; }
        if (policy === 'random'){ cands.push(k); continue; }
        let l = a; while (l > 0 && !occ[k][l - 1]) l--; let r = b; while (r < M - 1 && !occ[k][r]) r++;
        const score = (a - l) + (r - b); if (score < bestScore){ bestScore = score; best = k; }
      }
      if (policy === 'random' && cands.length) best = cands[Math.floor(RR() * cands.length)];
      if (best < 0) continue;
      for (let s = a; s < b; s++){ if (occ[best][s]) overlap++; occ[best][s] = true; } ok++; segUsed += b - a;
    }
    return {accepted:ok, util:segUsed / (N * (M - 1)), overlap};
  };
  const optimum = () => { // offline: all requests known; sort by end, give each to the berth whose last journey ends latest but not after its start (optimal for the count)
    const last = new Array(N).fill(0); let ok = 0, segUsed = 0;
    reqs.slice().sort((x, y) => x[1] - y[1] || y[0] - x[0]).forEach(([a, b]) => { let best = -1; for (let k = 0; k < N; k++) if (last[k] <= a && (best < 0 || last[k] > last[best])) best = k; if (best >= 0){ last[best] = b; ok++; segUsed += b - a; } });
    return {accepted:ok, util:segUsed / (N * (M - 1)), overlap:0};
  };
  return {random:run('random'), first:run('first'), best:run('best'), opt:optimum(), reqs, total:reqs.length, demand:reqs.reduce((s, [a, b]) => s + b - a, 0) / (N * (M - 1))};
}
function holdSim(host){
  const P = {seats:300, users:3000, burst:120, abandon:.25, ttl:300, payMin:40, payMax:240, retries:5, seed:21}; const out = el('div');
  function run(){
    const a = holdRun(Object.assign({}, P, {strategy:'nohold'})), b = holdRun(Object.assign({}, P, {strategy:'hold'}));
    out.innerHTML = '';
    out.append(frag(h.table([`${fmtNum(P.users)} users in ${P.burst} s for ${P.seats} seats`, 'Pay first, then grab a seat', `Hold the seat for ${P.ttl / 60} min while paying`], [
      ['Tickets confirmed', fmtNum(a.sold), fmtNum(b.sold)],
      ['Paid but no seat → refund', `<b style="color:${a.refunds ? 'var(--bad)' : 'inherit'}">${fmtNum(a.refunds)}</b>`, fmtNum(b.refunds)],
      ['Seats left unsold', fmtNum(a.unsold), fmtNum(b.unsold)],
      ['Users told “not available” (finally)', fmtNum(a.turnedAway), fmtNum(b.turnedAway)],
      ['Retries after “not available” (held seats may come back)', '—', fmtNum(b.retries)],
      ['Average arrival → ticket', (a.avgWait / 60).toFixed(1) + ' min', (b.avgWait / 60).toFixed(1) + ' min']], [1, 2])));
    out.append(el('div', {class:'verdict ' + (b.refunds <= a.refunds ? 'ok' : 'warn'), html:`Without holds, everyone who saw “available” pays, and <b>${fmtNum(a.refunds)}</b> people are charged for seats that were gone by the time their payment finished. With a ${P.ttl / 60}-minute hold, a seat is reserved before payment, so refunds drop to <b>${fmtNum(b.refunds)}</b>${b.refunds ? ' (only payments slower than the hold)' : ''}. The cost: abandoned holds (${Math.round(P.abandon * 100)}% of users walk away) block seats until they expire, so ${b.unsold ? `<b>${fmtNum(b.unsold)}</b> seats were still free at the end and ` : ''}${fmtNum(b.retries)} retries were needed to pick up released seats. Shorter holds release seats faster but fail slow payers.`}));
  }
  host.append(note('A discrete-event simulation of a Tatkal-style rush (or a concert sale): users arrive in a short burst, pick a seat and take 40–240 s to pay; some abandon. Users told “not available” retry every minute, up to 5 times. Inputs are illustrative.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Seats', min:50, max:1000, step:50, value:P.seats, onInput:v => { P.seats = v; run(); }}).el,
      ui.slider({label:'Users in the burst', min:200, max:10000, step:100, value:P.users, fmt:v => fmtNum(v), onInput:v => { P.users = v; run(); }}).el,
      ui.slider({label:'Users who abandon checkout', min:0, max:.6, step:.05, value:P.abandon, fmt:v => Math.round(v * 100) + '%', onInput:v => { P.abandon = v; run(); }}).el,
      ui.slider({label:'Hold time (TTL)', min:60, max:900, step:60, value:P.ttl, fmt:v => (v / 60) + ' min', onInput:v => { P.ttl = v; run(); }}).el), out);
  run();
}
function segSim(host){
  const P = {berths:72, stations:10, requests:400, maxLen:9, seed:4}; const out = el('div');
  function run(){
    const r = segAlloc(P); out.innerHTML = ''; const cols = [['random', 'Random free berth'], ['first', 'First fit'], ['best', 'Best fit (tightest gap)'], ['opt', 'Offline optimum*']];
    out.append(frag(h.table([`${P.requests} journeys, one ${P.berths}-berth coach, ${P.stations} stations`, ...cols.map(c => c[1])], [
      ['Journeys given a berth', ...cols.map(c => fmtNum(r[c[0]].accepted))],
      ['Berth-segments sold', ...cols.map(c => (r[c[0]].util * 100).toFixed(1) + '%')],
      ['Overlapping sales (must be 0)', ...cols.map(c => String(r[c[0]].overlap))]], [1, 2, 3, 4])));
    const online = Math.max(r.random.accepted, r.first.accepted, r.best.accepted), gap = r.opt.accepted - online;
    out.append(el('div', {class:'verdict ' + (gap > 0 ? 'warn' : 'ok'), html:`A berth can be sold several times on one run, for journeys that don’t overlap. Deciding at booking time, in arrival order, the best of the three rules seats <b>${online}</b> journeys (random ${r.random.accepted}, first fit ${r.first.accepted}, best fit ${r.best.accepted}). If every request were known in advance, the maximum is <b>${r.opt.accepted}</b>. ${gap > 0 ? `The gap of ${gap} journeys is the price of deciding online: a long journey booked early can block several shorter ones later, and no simple berth rule fixes that when demand exceeds capacity. Real systems add quotas, RAC and waitlists, and note that maximising journeys isn’t the same as maximising revenue.` : 'Here online allocation reached the optimum: with demand below capacity, almost any rule works.'}<br><span class="muted">* Sort journeys by arrival station and give each to the berth that became free latest but in time; this greedy maximises the number of journeys (checked against brute force).</span>`}));
  }
  host.append(note('Indian Railways sells berths per journey segment, not per train. This educational allocator processes booking requests in order and compares two berth-choice rules; real allocation also handles quotas, berth preferences, RAC and waitlists.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Booking requests', min:50, max:1000, step:25, value:P.requests, onInput:v => { P.requests = v; run(); }}).el,
      ui.slider({label:'Longest journey (segments)', min:1, max:9, value:P.maxLen, onInput:v => { P.maxLen = v; run(); }}).el),
    el('div', {class:'pill-row', style:{margin:'8px 0'}}, ui.button('🎲 New requests', () => { P.seed++; run(); }, 'sm')), out);
  run();
}
SDA.flagshipC = {paretoFit, paretoMean, feedCost, paretoSample, flashRun, upiRun, upiTheory, holdRun, segAlloc};
/* ======================= 1. INSTAGRAM / X FEED ======================= */
SDA.register({kind:'case', id:'feed', tier:'flagship', icon:'📸', title:'Instagram / X (news feed)', tagline:'Precompute a timeline for a billion people, except for the few who have a hundred million followers.', tags:['news feed', 'fan-out', 'timeline', 'celebrity problem', 'ranking', 'sharding', 'snowflake ids', 'hot keys', 'counters'],
  modules:['async', 'caching', 'databases', 'search', 'distributed'],
  summary:'Show each user a fresh, relevant feed of posts from accounts they follow, in a few hundred milliseconds, while hundreds of millions post photos and likes. The core design question is <b>when to do the work</b>: at write time (<b>fan-out on write</b>: push each post into every follower’s precomputed timeline) or at read time (<b>fan-out on read</b>: gather posts when the feed is opened). Real systems use a <b>hybrid</b>, because follower counts follow a power law: most accounts have a few hundred followers, a few have hundreds of millions.',
  accuracy:'X/Twitter described its timeline architecture publicly (QCon 2012 “Timelines at Scale”, Snowflake ids, and its 2023 open-sourced recommendation algorithm); Instagram described its sharding and id scheme, Cassandra use, the 2016 move to a ranked feed and its Explore system. Those are labelled confirmed. Today’s exact service boundaries are not public, so the connecting design is inference or simplified for teaching. Numbers are illustrative unless marked publicly disclosed.',
  overview:{what:'Priya opens the app: in under a second she sees posts from friends and creators she follows, ranked by what she is likely to care about, with photos loading instantly and like counts updating.', in:['Posting photos/videos and text', 'Follow graph', 'Home feed generation (fan-out) and pagination', 'Ranking the feed', 'Likes and counters', 'Media storage and delivery'], out:['Stories and Reels specifics', 'Direct messages (see the WhatsApp case)', 'Search and Explore in depth', 'Ads ranking and auctions']},
  challenges:['Reads outnumber posts by 10–100×, so the feed must be cheap to read', 'Follower counts follow a power law: one post can mean 100M timeline updates', 'Posts, follows and likes outgrow any single database', 'Viral posts create hot keys and hot counters', 'Chronological feeds bury the best posts; ranking must run in milliseconds'],
  fr:['Post a photo or text with a caption', 'Follow and unfollow accounts', 'Open the home feed: recent posts from followed accounts, ranked, paginated', 'Like and comment; see counts', 'New posts appear in followers’ feeds within seconds'],
  nfr:['Feed p99 under ~300 ms (illustrative target)', 'A post reaches followers’ feeds within a few seconds (eventual consistency is fine)', 'Never lose a post or a follow (durable, replicated)', 'Highly available reads; degrade ranking before failing the feed', 'Cost-efficient memory: timelines only where they will be read'],
  scale:[
    {k:'Timeline reads (X, 2012)', v:'≈ 300K/s', math:'Krikorian, “Timelines at Scale” (QCon 2012)', tag:'public'},
    {k:'Tweets written (X, 2012)', v:'≈ 5K/s avg', math:'same talk; peaks were several times higher', tag:'public'},
    {k:'Instagram monthly users', v:'2B+', math:'Meta, 2022', tag:'public'},
    {k:'Posts per second (500M daily users)', v:'≈ 2,900', math:'500M × 0.5 posts/day ÷ 86,400', tag:'illustrative'},
    {k:'Feed opens per second', v:'≈ 116K', math:'500M × 20 opens/day ÷ 86,400', tag:'illustrative'},
    {k:'Timeline memory', v:'≈ 3.2 TB', math:'500M active users × 800 post ids × 8 B (ids only; replicated ×3 → ~10 TB)', tag:'illustrative'}],
  arch:{w:960, h:390, minW:700, nodes:[
    {id:'user', type:'client', label:'User app', x:70, y:195, w:110},
    {id:'lb', type:'lb', label:'Load balancer', x:240, y:195, w:134, stage:1},
    {id:'cdn', type:'cdn', label:'Media CDN', sub:'photos, video', x:240, y:335, w:124, stage:2},
    {id:'pcache', type:'cache', label:'Post cache', sub:'hot posts', x:430, y:55, w:130, stage:4},
    {id:'app', type:'service', label:'App servers', sub:'monolith', x:430, y:195, w:140},
    {id:'blob', type:'db', label:'Object storage', sub:'originals + sizes', x:430, y:335, w:150, stage:2},
    {id:'cnt', type:'cache', label:'Counters', sub:'likes, views', x:630, y:55, w:130, stage:6},
    {id:'queue', type:'queue', label:'Kafka', sub:'post events', x:630, y:195, w:136, stage:3},
    {id:'db', type:'db', label:'Postgres', sub:'users, posts, follows', x:630, y:335, w:160},
    {id:'rank', type:'service', label:'Ranking', sub:'ML scoring', x:830, y:55, w:130, stage:7},
    {id:'fan', type:'service', label:'Fan-out workers', sub:'push to timelines', x:830, y:195, w:150, stage:3},
    {id:'tl', type:'cache', label:'Timelines', sub:'Redis lists', x:830, y:335, w:140, stage:3}],
   edges:[{from:'user', to:'app', gone:1}, {from:'app', to:'db'},
     {from:'user', to:'lb', stage:1}, {from:'lb', to:'app', stage:1},
     {from:'user', to:'cdn', stage:2}, {from:'cdn', to:'blob', stage:2}, {from:'app', to:'blob', stage:2},
     {from:'app', to:'queue', stage:3}, {from:'queue', to:'fan', stage:3}, {from:'fan', to:'db', stage:3}, {from:'fan', to:'tl', stage:3}, {from:'app', to:'tl', stage:3},
     {from:'app', to:'pcache', stage:4},
     {from:'app', to:'cnt', stage:6}, {from:'queue', to:'cnt', stage:6},
     {from:'app', to:'rank', stage:7}, {from:'rank', to:'queue', stage:7}]},
  evolution:[
    {title:'One server + one database', scale:'10K users', fix:'<p>One app server and one Postgres database with <code>users</code>, <code>posts</code> and <code>follows</code>. The feed is a query: <code>SELECT * FROM posts WHERE author_id IN (SELECT followee FROM follows WHERE follower = ?) ORDER BY created_at DESC LIMIT 50</code>. Photos are files on the server’s disk.</p>', after:{lat:200, err:.1, load:20}},
    {title:'Feeds time out at 9 pm', scale:'1M users', hot:['app', 'db'], breaks:'<p>Evening traffic triples. One app server saturates its CPU, and the feed query plus photo serving pin the database. Feeds take seconds; some time out.</p>', fix:'<p>Put stateless app servers behind a <b>load balancer</b> and add <b>read replicas</b> for feed queries. Sessions move to a shared store so any server can serve any user.</p>', sub:{db:'primary + read replicas'}, before:{lat:2500, err:3, load:170}, after:{lat:300, err:.2, load:55}, flow:[['user', 'lb', 'GET /feed'], ['lb', 'app'], ['app', 'db', 'feed query (replica)']], lesson:['vertical-vs-horizontal', 'replication']},
    {title:'Photos clog the app servers', scale:'10M users', hot:['app'], breaks:'<p>Serving multi-megabyte photos ties up app servers and fills their disks; users far away wait seconds for images.</p>', fix:'<p>Store originals in <b>object storage</b>, generate a few resized versions at upload, and serve them through a <b>CDN</b>. App servers handle only metadata.</p>', before:{lat:1800, err:1, load:140}, after:{lat:250, err:.1, load:45}, flow:[['app', 'blob', 'store original + sizes'], ['user', 'cdn', 'image'], ['cdn', 'blob', 'miss → origin']], lesson:['cdn', 'storage-types']},
    {title:'Every feed open is a giant query', scale:'50M users', hot:['db'], breaks:'<p>A user following 500 accounts makes the feed query scan and merge posts from 500 authors on every open. Reads outnumber posts by ~40:1, so the database spends its life recomputing the same feeds.</p>', fix:'<p><b>Fan-out on write</b>: when someone posts, publish an event; <b>fan-out workers</b> read the author’s followers and push the post id onto each follower’s <b>timeline</b> (a capped Redis list of the latest ~800 ids). Opening the feed becomes one list read plus hydrating posts by id. X/Twitter described exactly this design in 2012.</p>', before:{lat:3000, err:2, load:180}, after:{lat:150, err:.05, load:50}, flow:[['app', 'queue', 'post.created'], ['queue', 'fan'], ['fan', 'db', 'followers of @priya'], ['fan', 'tl', 'LPUSH id × followers'], ['app', 'tl', 'read my timeline']], lesson:['fan-out', 'kafka', 'cache-strategies']},
    {title:'A celebrity posts: 100M timeline writes', scale:'accounts with 100M followers', hot:['fan', 'tl'], breaks:'<p>One post by an account with 100M followers means 100M inserts. At a million inserts per second that takes 100 s, during which every other post waits in the same queue. Most of those followers won’t open the app today anyway.</p>', fix:'<p><b>Hybrid fan-out</b>: push posts from ordinary accounts, but skip fan-out for accounts above a follower threshold. At read time, <b>merge</b> the recent posts of the few celebrities you follow (served from a <b>post cache</b>) into your precomputed timeline. Try the threshold in the simulator in Deep dives.</p>', sub:{fan:'skips celebrities'}, before:{lat:900, err:1.5, load:300}, after:{lat:180, err:.05, load:55}, flow:[['app', 'tl', 'my timeline'], ['app', 'pcache', 'recent posts of 12 celebrities I follow']], lesson:['fan-out', 'tradeoff-thinking']},
    {title:'Posts and follows outgrow one database', scale:'500M users', hot:['db'], breaks:'<p>Billions of posts and tens of billions of follow edges no longer fit one primary, and its write rate is maxed out. Auto-increment ids also need a single counter.</p>', fix:'<p><b>Shard by user id</b>: a user’s posts and follow lists live on one logical shard, with thousands of logical shards mapped onto fewer physical servers. Ids are generated without coordination and encode time + shard: Instagram’s 64-bit ids use 41 bits of milliseconds, 13 bits of shard id and 10 bits of sequence; X built <b>Snowflake</b>. Ids sort by time, so “newer than” is a range scan.</p>', sub:{db:'sharded by user id'}, before:{lat:1500, err:2, load:170}, after:{lat:200, err:.05, load:50}, flow:[['app', 'db', 'INSERT post (id carries shard bits)']], lesson:['sharding', 'unique-ids']},
    {title:'A viral post’s like counter is a hot row', scale:'1M likes/minute on one post', hot:['db'], breaks:'<p>Every like does <code>UPDATE posts SET likes = likes + 1</code> on the same row. Row-lock contention serialises them; the shard holding that post slows down for everyone on it.</p>', fix:'<p>Treat likes as <b>events</b>: write the like (for “did I like this?”) and send an event; a <b>counter service</b> aggregates in memory (sharded counters per post) and flushes totals periodically. Displayed counts are approximate for a few seconds, which nobody minds.</p>', before:{lat:1200, err:2.5, load:150}, after:{lat:200, err:.05, load:55}, flow:[['app', 'queue', 'like event'], ['queue', 'cnt', 'aggregate'], ['app', 'cnt', 'read count']], lesson:['event-driven', 'locking']},
    {title:'Chronological feeds bury the best posts', scale:'500M users', hot:['app'], breaks:'<p>Users follow hundreds of accounts and see only the top of a time-ordered list; they miss most of the posts they’d care about, and engagement drops. (Instagram moved from a chronological to a ranked feed in 2016.)</p>', fix:'<p>A <b>ranking</b> step: gather candidates (timeline ids, celebrity posts, and some recommended posts), compute features, and score them with ML models trained on engagement events from the stream. A cheap first-pass ranker narrows thousands of candidates before a heavier model; X’s open-sourced 2023 pipeline works this way.</p>', before:{lat:350, err:.8, load:70}, after:{lat:260, err:.1, load:65}, flow:[['app', 'rank', 'score 500 candidates'], ['rank', 'queue', 'engagement events (training)']], lesson:['recommendations', 'lambda-kappa']},
    {title:'One viral post melts a cache shard', scale:'hot keys', hot:['pcache'], breaks:'<p>A post going viral is read millions of times a minute, always from the one cache shard that owns its key. That shard’s network saturates while others idle.</p>', fix:'<p>Detect <b>hot keys</b> and replicate them to many shards (read from any copy), add a small <b>in-process cache</b> on app servers for the hottest posts, and coalesce concurrent misses into one fetch.</p>', sub:{pcache:'hot keys replicated'}, before:{lat:800, err:1.2, load:160}, after:{lat:200, err:.05, load:55}, flow:[['app', 'pcache', 'read any replica']], lesson:['cache-failure-modes']},
    {title:'Timelines for a billion users don’t fit in RAM', scale:'1B+ accounts', hot:['tl'], breaks:'<p>Keeping 800 ids in RAM for every account, including the hundreds of millions who rarely open the app, costs terabytes, and fan-out still writes to all of them.</p>', fix:'<p>Keep timelines only for <b>active users</b> (X said it kept them for users active in the last 30 days). Fan-out skips inactive followers; when someone returns, rebuild their timeline once from the posts store (fan-out on read, one time), then resume pushing.</p>', sub:{tl:'active users only'}, before:{lat:400, err:.6, load:120}, after:{lat:220, err:.05, load:60}, flow:[['app', 'db', 'rebuild for returning user'], ['app', 'tl', 'write rebuilt list']], lesson:['cache-eviction', 'capacity-planning']}],
  flows:[
    {name:'Post a photo', steps:[
      {note:'The app uploads the photo; the server stores the original and resized versions in object storage.', flow:[['user', 'lb', 'POST /posts'], ['lb', 'app'], ['app', 'blob', 'photo + sizes']]},
      {note:'The post row (with a time-ordered id that encodes its shard) is written to the author’s shard.', flow:[['app', 'db', 'INSERT post']]},
      {note:'A post.created event is published; the request returns at once.', flow:[['app', 'queue', 'post.created']]},
      {note:'Fan-out workers fetch the author’s active followers and push the post id onto their timelines (unless the author is above the celebrity threshold).', flow:[['queue', 'fan'], ['fan', 'db', 'active followers'], ['fan', 'tl', 'LPUSH + trim to 800']]}]},
    {name:'Open the feed', steps:[
      {note:'The app requests the first page of the feed.', flow:[['user', 'lb', 'GET /feed'], ['lb', 'app']]},
      {note:'The server reads the user’s timeline ids and the recent posts of followed celebrities.', flow:[['app', 'tl', 'timeline ids'], ['app', 'pcache', 'celebrity posts + hydrate']]},
      {note:'Ranking scores the candidates; counts come from the counter service.', flow:[['app', 'rank', 'score candidates'], ['app', 'cnt', 'like counts']]},
      {note:'The page returns; images load from the CDN.', flow:[['app', 'lb', 'ranked page + cursor'], ['lb', 'user'], ['user', 'cdn', 'images']]}]},
    {name:'Like a post', steps:[
      {note:'The like is recorded (so “liked by you” is exact) and an event is sent.', flow:[['user', 'lb', 'POST /posts/{id}/like'], ['lb', 'app'], ['app', 'db', 'likes row'], ['app', 'queue', 'like event']]},
      {note:'The counter service aggregates likes in memory and flushes totals; ranking learns from the engagement.', flow:[['queue', 'cnt', '+1'], ['queue', 'rank', 'training signal']]}]}],
  breakIt:[
    {label:'Timeline cache cluster lost', kill:['tl'], verdict:'degrades', text:'Feeds fall back to fan-out on read from the posts store for active users: slower and much more expensive, so cap page size and shed ranking. Timelines are rebuilt in the background.', flow:[['app', 'db', 'fan-out on read (fallback)']]},
    {label:'Fan-out workers stopped', kill:['fan'], verdict:'degrades', text:'New posts don’t reach timelines; events pile up in Kafka (nothing is lost). Feeds look stale until workers catch up, which can take a while after a long outage.'},
    {label:'Ranking service down', kill:['rank'], verdict:'degrades', text:'Fall back to reverse-chronological order of the same candidates. The feed is less relevant but always loads.'},
    {label:'Media CDN outage', kill:['cdn'], verdict:'degrades', text:'Fail over to a second CDN or straight to origin at reduced quality; text and metadata keep working.'},
    {label:'Hot post on one cache shard', hot:['pcache'], verdict:'survives', text:'Hot-key replication and in-process caches spread the reads; concurrent misses are coalesced into one fetch.'},
    {label:'One database shard fails', kill:['db'], verdict:'degrades', text:'A replica is promoted within seconds; meanwhile posts and follows for users on that shard can’t be written, but feeds (served from timelines and caches) keep working.'},
    {label:'Kafka lag spike', hot:['queue'], verdict:'degrades', text:'Posts reach followers late and counts lag. Scale consumers, prioritise post events over likes, and accept seconds-to-minutes of staleness.'}],
  dataModel:{lang:'sql', title:'sharded posts + follow graph + timelines', code:`-- On the author's shard (shard = user_id → logical shard → physical server)
CREATE TABLE posts (
  post_id     BIGINT PRIMARY KEY,   -- 41 bits ms since epoch | 13 bits shard | 10 bits sequence
  author_id   BIGINT NOT NULL,
  caption     TEXT,
  media_keys  TEXT[],               -- object-storage keys of each size
  created_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX ON posts (author_id, post_id DESC);   -- "latest posts by X" = range scan

-- Follow graph stored twice, each copy on the owner's shard
CREATE TABLE following (user_id BIGINT, followee_id BIGINT, PRIMARY KEY (user_id, followee_id));
CREATE TABLE followers (user_id BIGINT, follower_id BIGINT, PRIMARY KEY (user_id, follower_id));

-- Redis: tl:{user_id} → list of post ids (LPUSH + LTRIM 0 799), only for active users
-- Counters: likes:{post_id} sharded in memory, flushed to the posts store`, notes:'Because ids sort by time and encode the shard, the server can find a post’s shard from its id alone, and “posts newer than X” is an index range. The follow graph is denormalised in both directions so fan-out (“who follows me?”) and feed building (“whom do I follow?”) are single-shard reads.'},
  apis:[
    {m:'POST', path:'/v1/posts', note:'Upload media first (pre-signed URL), then create the post referencing it.', req:'{ "caption": "Monsoon in Munnar 🌧️", "media": ["up_7f2a"], "idempotency_key": "c_91" }', res:'{ "post_id": 3104569123456789, "created_at": "2026-11-13T19:02:11Z" }'},
    {m:'GET', path:'/v1/feed?cursor=…&limit=20', note:'Cursor = the last post id seen; ranked pages are cached briefly so scrolling is stable.', res:'{ "items": [ {"post_id": 3104569…, "author": "chef_arun", "likes": 18234, "media": {"w640": "https://cdn…"}} ], "next_cursor": "…" }'},
    {m:'POST', path:'/v1/posts/{id}/like', note:'Idempotent per (user, post): a second like is a no-op.', res:'{ "liked": true }'}],
  algorithm:{title:'Fan-out on write vs on read: where to put the celebrity threshold', html:'<p>Push-only makes reads cheap but turns a celebrity post into a burst of tens of millions of writes. Pull-only makes posting cheap but every feed open merges posts from hundreds of accounts. Because follower counts follow a <b>power law</b>, a threshold that pulls only the top few thousand accounts at read time removes the giant bursts while keeping almost all of push’s read efficiency. The model below computes both costs on a realistic follower distribution; the fan-out playground below it animates the two approaches.</p>', mount:feedSim, pg:'fanout'},
  tradeoffs:[['Fan-out on write for most accounts', 'Feed reads are one list read: cheap and fast', 'Write amplification and memory; celebrity bursts'], ['Pull celebrities at read time', 'No 100M-insert bursts; posts appear immediately', 'Every read merges a few extra sources; more read-time work'], ['Timelines only for active users', 'Saves most of the memory and fan-out writes', 'Returning users wait for a one-time rebuild'], ['Approximate, eventually consistent counters', 'No hot rows; scales to viral posts', 'Counts lag by seconds'], ['Ranked instead of chronological feed', 'Users see what matters to them', 'Model complexity, feedback loops, transparency concerns']],
  alternatives:[['Pure fan-out on read', 'Simple writes, but every feed open is an expensive multi-source merge; fine for small networks'], ['Pure fan-out on write', 'Fastest reads, but celebrity posts cause huge bursts and delays'], ['Graph database for the follow graph', 'Elegant queries, but the access patterns here are simple key lookups that sharded KV/SQL handle well'], ['Single global ranked index', 'Simpler, but personalisation needs per-user candidates']],
  failures:[['Timeline cache', 'Fall back to fan-out on read; rebuild timelines'], ['Fan-out workers', 'Events wait in Kafka; catch up later'], ['Ranking', 'Chronological fallback'], ['Hot key', 'Replicate hot keys; local caches; coalesce misses'], ['DB shard', 'Promote replica; feeds still served from caches']],
  lab:{stack:['Node.js or Go', 'Postgres (2–4 shards via a shard map)', 'Redis (timelines, counters)', 'Kafka or Redpanda', 'MinIO + a CDN or Nginx cache', 'k6'], milestones:[
    {day:'Day 1: naive to push', items:['Seed 100K users with a power-law follower distribution', 'Feed via SQL first; measure p99 at 200 reads/s', 'Fan-out on write into Redis lists (LPUSH + LTRIM 800)', 'Compare p99 and DB load']},
    {day:'Day 2: celebrities & sharding', items:['Make 5 accounts with 50K+ followers; measure fan-out time per post', 'Hybrid: skip fan-out above a threshold, merge at read time', 'Snowflake-style ids with shard bits; route by id', 'Shard posts and follows across 2+ Postgres instances']},
    {day:'Day 3: counters, ranking, hot keys', items:['Likes as events → in-memory sharded counters, flush every 5 s', 'Simple ranking: recency × affinity × engagement', 'Hot-key test: 5K reads/s on one post; add local cache + coalescing', 'k6: 1,000 feed reads/s + 50 posts/s for 10 minutes']}],
   pseudocode:{lang:'ts', code:`const CELEB = 1_000_000;                         // follower threshold for pull-at-read

async function onPostCreated(post: Post) {         // fan-out worker
  const author = await users.get(post.authorId);
  if (author.followers >= CELEB) return postCache.addRecent(author.id, post.id);
  for await (const batch of followers.activeOf(author.id, { batch: 5000 })) {
    const pipe = redis.pipeline();
    for (const f of batch) pipe.lpush(\`tl:\${f}\`, post.id).ltrim(\`tl:\${f}\`, 0, 799);
    await pipe.exec();
  }
}

async function getFeed(userId: number, cursor?: bigint) {
  const ids = await redis.lrange(\`tl:\${userId}\`, 0, 499) ?? await rebuildTimeline(userId);
  const celebs = await following.celebritiesOf(userId);           // usually a handful
  const celebIds = (await Promise.all(celebs.map(c => postCache.recent(c)))).flat();
  const candidates = await posts.hydrate(mergeNewestFirst(ids, celebIds, cursor));
  return ranker.score(userId, candidates).slice(0, 20);          // fall back to time order on error
}`},
   loadTest:'<p>Generate a power-law follower graph (a few accounts with 50K–100K followers). Run 1,000 feed reads/s and 50 posts/s, with one “celebrity” posting every minute. Measure feed p99, the time for a post to appear in all followers’ feeds, and Redis memory. Repeat with push-only, pull-only and hybrid, and plot the trade-off.</p>'},
  twists:[
    {q:'You follow a celebrity and a friend; both post at the same moment. How do you merge them in the right order without scanning everything?', a:'Both ids are time-ordered (Snowflake-style), so the merge is a k-way merge of a few sorted lists: your timeline list plus one recent-posts list per followed celebrity, cut at the page size. With a handful of celebrities per user it costs microseconds.'},
    {q:'A user unfollows someone. Do you remove that account’s posts from their timeline?', a:'Usually lazily: filter at read time against the current follow set (a fast set lookup), and let old ids age out of the capped list. Eager removal (scanning and deleting ids) is expensive and rarely worth it.'},
    {q:'How do you keep “likes” correct when a user double-taps quickly on a flaky network?', a:'Make the like idempotent: a unique (user_id, post_id) row or set membership, so a retry is a no-op. The counter increments only when the row is newly inserted; aggregation can later reconcile counters against the source of truth.'}],
  real:[
    {co:'X/Twitter timelines', tier:'confirmed', text:'Home timelines were precomputed by fanning tweet ids out into Redis-backed lists (about 800 entries each), kept for active users; accounts with huge follower counts were merged at read time instead. The talk cited about 300K timeline reads/s and about 5K tweets/s on average.', src:'Raffi Krikorian, “Timelines at Scale” (QCon San Francisco 2012)'},
    {co:'X/Twitter Snowflake', tier:'confirmed', text:'Snowflake generates roughly time-ordered 64-bit ids without coordination (timestamp, worker id, sequence).', src:'Twitter Engineering, “Announcing Snowflake” (2010)'},
    {co:'Instagram ids and sharding', tier:'confirmed', text:'Instagram shards Postgres into thousands of logical shards on fewer physical servers, with 64-bit ids of 41 bits time, 13 bits logical shard and 10 bits sequence, generated inside Postgres.', src:'Instagram Engineering, “Sharding & IDs at Instagram” (2012)'},
    {co:'Instagram ranked feed', tier:'confirmed', text:'Instagram announced in 2016 that the feed would be ordered by what users are most likely to care about rather than strictly by time.', src:'Instagram announcement, “See the Moments You Care About First” (2016)'},
    {co:'X recommendation algorithm', tier:'confirmed', text:'X’s open-sourced pipeline gathers about 1,500 candidates (in-network and out-of-network), ranks them with a neural network, then applies filters and heuristics.', src:'Twitter Engineering, “Twitter’s Recommendation Algorithm” (2023)'},
    {co:'Instagram Cassandra', tier:'confirmed', text:'Instagram runs Apache Cassandra at large scale and built a RocksDB-based storage engine for it to cut tail latency.', src:'Instagram Engineering, “Open-sourcing a 10x reduction in Apache Cassandra tail latency” (2018)'},
    {co:'Celebrity threshold and counters', tier:'inference', text:'The exact thresholds, counter designs and current service layout used today are not public; the values and boxes here are reasonable inferences.', src:'This case study'},
    {co:'Feed cost model', tier:'educational', text:'The fan-out simulator uses a truncated power-law follower distribution and illustrative rates.', src:'This case study’s model'}],
  sources:['Raffi Krikorian — Timelines at Scale (QCon San Francisco 2012)', 'Twitter Engineering — Announcing Snowflake (2010)', 'Instagram Engineering — Sharding & IDs at Instagram (2012)', 'Twitter Engineering — Twitter’s Recommendation Algorithm (2023)', 'Instagram Engineering — Open-sourcing a 10x reduction in Apache Cassandra tail latency (2018)', 'Instagram — See the Moments You Care About First (2016)', 'Silberstein et al. — Feeding Frenzy: Selectively Materializing Users’ Event Feeds (SIGMOD 2010)']
});

/* ======================= 2. AMAZON / FLIPKART + FLASH SALE ======================= */
SDA.register({kind:'case', id:'amazon', tier:'flagship', icon:'🛒', title:'Amazon / Flipkart (e-commerce + flash sale)', tagline:'A catalogue of millions, a cart that never says no, and 1,000 phones for 2 million buyers at noon.', tags:['e-commerce', 'flash sale', 'inventory', 'oversell', 'dynamo', 'cart', 'saga', 'waiting room', 'search'],
  modules:['databases', 'distributed', 'reliability', 'async', 'traffic'],
  summary:'Most e-commerce traffic is <b>browsing</b>: product pages, search and recommendations, served from caches and CDNs. The money path (<b>cart → checkout → payment → order</b>) is smaller but must be correct. A <b>flash sale</b> (Big Billion Days, Prime Day, a phone launch at 12:00) breaks the usual assumptions: millions arrive in the same second to fight over a few thousand units, so <b>inventory correctness under contention</b> and <b>admission control</b> become the whole problem.',
  accuracy:'Amazon has published the Dynamo paper (shopping-cart availability), its service-oriented history, the AWS Builders’ Library (cells, shuffle sharding, load shedding, retries with jitter) and Prime Day traffic figures; these are labelled confirmed. Flipkart’s internal design is not documented here, and the flash-sale mechanics (atomic stock gate, queue, waiting room) are a widely used reference design labelled inference. Numbers are illustrative unless marked publicly disclosed.',
  overview:{what:'Rahul browses phones, adds one to his cart, and at 12:00 when the sale opens taps “Buy now”: within seconds he either has a confirmed order or a clear “sold out”, never a charge for a phone that doesn’t exist.', in:['Catalogue and product pages', 'Search', 'Cart', 'Checkout, payment and the order workflow', 'Inventory reservation', 'Flash-sale admission and protection'], out:['Warehouse, picking and shipping logistics', 'Seller onboarding and pricing tools', 'Recommendations in depth', 'Returns and refunds in depth']},
  challenges:['Browsing is 100× the traffic of buying; it must be cheap and cacheable', 'The cart must accept “add to cart” even during failures', 'Checkout spans inventory, payment and orders, which can fail independently', 'Flash sales: millions of requests in seconds for limited stock, so no overselling and no meltdown', 'Bots that buy everything in milliseconds'],
  fr:['Browse and search products; see price and availability', 'Add to cart; view cart on any device', 'Checkout: reserve stock, pay, confirm the order', 'Flash sale: fair access at a set time with a hard stock limit', 'Order history and status'],
  nfr:['Product pages p99 under ~200 ms (illustrative target)', 'Never sell stock you don’t have; never charge without an order', 'Cart highly available (accept writes even during partitions)', 'Survive a 10–100× spike at sale start without collapsing', 'Fairness: real users beat bots'],
  scale:[
    {k:'DynamoDB peak during Prime Day 2023', v:'126M requests/s', math:'AWS News Blog, “Prime Day 2023 Powered by AWS”', tag:'public'},
    {k:'Product page views per second (big sale)', v:'≈ 500K', math:'50M shoppers × 30 page views over ~50 min of peak', tag:'illustrative'},
    {k:'Flash-sale buyers at 12:00:00', v:'≈ 2M', math:'illustrative: a popular phone launch', tag:'illustrative'},
    {k:'Stock in that sale', v:'≈ 50K units', math:'illustrative', tag:'illustrative'},
    {k:'Buy requests in the first second', v:'≈ 1M/s', math:'2M buyers, half of them tapping within 1 s', tag:'illustrative'},
    {k:'Orders to persist', v:'50K in ~25 s', math:'50K winners ÷ 2,000 durable writes/s from a queue', tag:'illustrative'}],
  arch:{w:960, h:390, minW:700, nodes:[
    {id:'user', type:'client', label:'Shopper', x:70, y:195, w:110},
    {id:'cdn', type:'cdn', label:'CDN', sub:'images, static', x:240, y:55, w:124, stage:1},
    {id:'lb', type:'lb', label:'API gateway', sub:'routing', x:240, y:195, w:130, stage:2},
    {id:'wr', type:'service', label:'Waiting room', sub:'admit at a rate', x:240, y:335, w:140, stage:8},
    {id:'search', type:'service', label:'Search', sub:'index + ranking', x:430, y:55, w:130, stage:3},
    {id:'app', type:'service', label:'Backend', sub:'monolith', x:430, y:195, w:140},
    {id:'db', type:'db', label:'Orders DB', sub:'relational', x:430, y:335, w:150},
    {id:'ccache', type:'cache', label:'Catalog cache', sub:'product pages', x:630, y:55, w:140, stage:1},
    {id:'inv', type:'service', label:'Inventory', sub:'atomic stock', x:630, y:195, w:140, stage:6},
    {id:'oms', type:'service', label:'Order workers', sub:'persist orders', x:630, y:335, w:150, stage:7},
    {id:'pay', type:'service', label:'Payments', sub:'idempotent', x:830, y:55, w:130, stage:5},
    {id:'queue', type:'queue', label:'Order queue', sub:'Kafka', x:830, y:195, w:150, stage:7},
    {id:'cart', type:'db', label:'Cart store', sub:'Dynamo-style', x:830, y:335, w:140, stage:4}],
   edges:[{from:'user', to:'app', gone:2}, {from:'app', to:'db'},
     {from:'user', to:'cdn', stage:1}, {from:'app', to:'ccache', stage:1},
     {from:'user', to:'lb', stage:2}, {from:'lb', to:'app', stage:2},
     {from:'app', to:'search', stage:3}, {from:'app', to:'cart', stage:4}, {from:'app', to:'pay', stage:5}, {from:'app', to:'inv', stage:6},
     {from:'inv', to:'queue', stage:7}, {from:'queue', to:'oms', stage:7}, {from:'oms', to:'db', stage:7}, {from:'pay', to:'queue', stage:7},
     {from:'user', to:'wr', stage:8}, {from:'wr', to:'lb', stage:8}]},
  evolution:[
    {title:'One server + one database', scale:'1K products', fix:'<p>One web application and one relational database for products, carts, orders and stock. Checkout runs in one database transaction: check stock, decrement it, create the order. Correct and simple at this size.</p>', after:{lat:200, err:.1, load:20}},
    {title:'Product pages are 99% of the traffic', scale:'1M products', hot:['app', 'db'], breaks:'<p>Every product view runs several queries (details, price, images, reviews) on the same database that handles checkout. Browsing load starves orders.</p>', fix:'<p>Serve images and static assets from a <b>CDN</b> and product data from a <b>catalogue cache</b> (cache-aside, invalidated on price or content changes). Most page views never reach the database.</p>', before:{lat:2000, err:1.5, load:160}, after:{lat:180, err:.1, load:45}, flow:[['user', 'cdn', 'images, JS'], ['app', 'ccache', 'product 8812: hit']], lesson:['cdn', 'cache-strategies']},
    {title:'Sale-day traffic overwhelms one server', scale:'10M users', hot:['app'], breaks:'<p>A festive sale brings 10× the usual traffic. A single app server saturates, deploys need downtime, and one bad request pattern takes the whole site down.</p>', fix:'<p>Run stateless app servers behind an <b>API gateway / load balancer</b>, autoscale them, and add database read replicas. Split teams and code along business capabilities over time (Amazon’s well-known move to services with owned APIs).</p>', sub:{db:'primary + replicas'}, before:{lat:3000, err:5, load:220}, after:{lat:220, err:.1, load:55}, flow:[['user', 'lb', 'GET /p/8812'], ['lb', 'app']], lesson:['lb-algorithms', 'autoscaling', 'monolith-to-microservices']},
    {title:'SQL search is slow and irrelevant', scale:'100M products', hot:['db'], breaks:'<p><code>LIKE \'%iphone%\'</code> scans millions of rows, ignores typos and synonyms, and can’t rank by relevance, popularity or margin, or compute facets (brand, price range).</p>', fix:'<p>A dedicated <b>search service</b> on an inverted index with text relevance, typo tolerance, facets and business ranking, kept up to date from the catalogue by change events.</p>', before:{lat:2500, err:1, load:140}, after:{lat:150, err:.05, load:50}, flow:[['app', 'search', 'q=iphone 15 · facets']], lesson:['elasticsearch', 'inverted-index']},
    {title:'Carts vanish when a database node fails', scale:'always on', hot:['db'], breaks:'<p>A database failover makes “Add to cart” fail for a minute. Every failed add is a lost sale, and customers are much angrier about a cart that forgets items than about a slightly stale one.</p>', fix:'<p>Move the cart to a <b>highly available key-value store</b> that always accepts writes (Amazon’s Dynamo paper used exactly this example): replicated with quorums and sloppy quorum + hinted handoff, with conflicting versions merged (union of items) on read.</p>', before:{lat:900, err:4, load:80}, after:{lat:60, err:.01, load:40}, flow:[['app', 'cart', 'add item (always writable)']], lesson:['quorums', 'crdts-merkle', 'cap-pacelc']},
    {title:'Charged, but no order', scale:'1M orders/day', hot:['app'], breaks:'<p>Checkout calls the payment gateway, which succeeds, then the app crashes before writing the order. Retries charge again. Stock was decremented but never sold.</p>', fix:'<p>Model checkout as a <b>saga</b>: reserve stock → collect payment (with an <b>idempotency key</b>) → confirm order; each step has a compensating action (release stock, refund). A <b>payments service</b> owns gateway calls, webhooks and reconciliation.</p>', before:{lat:600, err:1.5, load:70}, after:{lat:280, err:.05, load:60}, flow:[['app', 'pay', 'charge (Idempotency-Key)']], lesson:['saga-outbox', 'idempotency-rate-limit-headers']},
    {title:'Flash sale: 1,000 phones, oversold to 50,000', scale:'2M buyers at 12:00', hot:['db', 'app'], breaks:'<p>The stock check reads <code>stock = 1000</code>, the app works for a few milliseconds, then writes <code>stock = 999</code>. Thousands of requests read the same value at once (<b>lost updates</b>), so far more orders are confirmed than phones exist. A row lock fixes correctness but serialises everyone on one row: requests queue for seconds and time out.</p>', fix:'<p>A dedicated <b>inventory service</b> gates the sale with an <b>atomic decrement</b> in memory (for example a Redis <code>DECR</code> or Lua script on the SKU’s stock key): one tiny, single-threaded operation decides each buyer. Below zero → sold out, and a <b>sold-out flag</b> answers everyone else instantly. The database remains the source of truth and is reconciled after. Try all three approaches in the simulator in Deep dives.</p>', before:{lat:3000, err:8, load:300}, after:{lat:250, err:.2, load:70}, flow:[['app', 'inv', 'DECR stock:sku-81 (atomic)']], lesson:['locking', 'transactions-isolation', 'redis-vs-memcached']},
    {title:'Order writes swamp the database at noon', scale:'50K winners in seconds', hot:['db'], breaks:'<p>Even with correct stock, 50,000 winners all write orders, order lines and payments in the same few seconds, and the database falls over, failing orders that already won.</p>', fix:'<p>After a successful reservation, put the order on a <b>queue</b> and return “order placed, confirming…”. <b>Order workers</b> persist orders at the rate the database can sustain; payment results arrive as events too. The spike is absorbed by the queue, not the database.</p>', before:{lat:2500, err:6, load:250}, after:{lat:300, err:.1, load:65}, flow:[['inv', 'queue', 'reservation r-77'], ['queue', 'oms'], ['oms', 'db', 'INSERT order (steady rate)']], lesson:['backpressure', 'queues-pubsub-streams']},
    {title:'10M people press refresh at 12:00:00', scale:'10M sessions', hot:['lb', 'app'], breaks:'<p>The whole site, not just the sale, melts: gateways, sessions, search and payments all see 50× traffic, and ordinary shoppers can’t check out anything.</p>', fix:'<p>A <b>virtual waiting room</b> in front of the sale: visitors get a queue position and are admitted at the rate the backend can handle (AWS publishes a reference implementation). Sale pages are static and cached; “sold out” is served from the CDN once stock hits zero. Shed non-critical work (recommendations, reviews) first.</p>', before:{lat:5000, err:15, load:400}, after:{lat:350, err:.3, load:80}, flow:[['user', 'wr', 'you are #48,211'], ['wr', 'lb', 'admitted']], lesson:['load-shedding', 'rate-limiting']},
    {title:'Bots buy everything in 200 ms', scale:'adversarial', hot:['wr', 'inv'], breaks:'<p>Scripts with thousands of accounts hit “Buy” the instant the sale opens, from many IPs, and grab most of the stock to resell. Real customers see “sold out” immediately.</p>', fix:'<p>Bot management at the edge (behavioural signals, device checks, challenges), <b>per-account purchase limits</b> enforced in the inventory gate, pre-registration or verified accounts for the sale, and rate limits per account, card and address. Randomise admission order among those who arrived before opening.</p>', sub:{lb:'per-account limits', wr:'verified users only'}, before:{lat:400, err:3, load:150}, after:{lat:300, err:.2, load:75}, flow:[['user', 'wr', 'challenge + verified account'], ['wr', 'lb']], lesson:['ddos-basics', 'rate-limiting']}],
  flows:[
    {name:'Browse and add to cart', steps:[
      {note:'Images and scripts come from the CDN; the request goes through the gateway.', flow:[['user', 'cdn', 'static'], ['user', 'lb', 'GET /search?q=phone'], ['lb', 'app']]},
      {note:'Search returns ranked results with facets; product pages come from the catalogue cache.', flow:[['app', 'search', 'query'], ['app', 'ccache', 'product details']]},
      {note:'Add to cart writes to the always-available cart store.', flow:[['user', 'lb', 'POST /cart/items'], ['lb', 'app'], ['app', 'cart', 'add (merge on conflict)']]}]},
    {name:'Flash-sale checkout', steps:[
      {note:'At 12:00 the waiting room admits shoppers at a controlled rate.', flow:[['user', 'wr', 'Buy now'], ['wr', 'lb', 'admitted'], ['lb', 'app']]},
      {note:'The inventory gate atomically decrements stock; this buyer gets reservation r-77 (expires in 10 min unless paid).', flow:[['app', 'inv', 'DECR → 412 left']]},
      {note:'Payment is collected with an idempotency key; the result is published as an event.', flow:[['app', 'pay', 'charge ₹69,999'], ['pay', 'queue', 'payment.succeeded']]},
      {note:'The reservation is queued; workers persist the order at a steady rate and confirm it.', flow:[['inv', 'queue', 'reservation r-77'], ['queue', 'oms'], ['oms', 'db', 'order CONFIRMED']]}]},
    {name:'Sold out', steps:[
      {note:'Stock reaches zero: the gate flips a sold-out flag.', flow:[['app', 'inv', 'DECR → −1 → sold out']]},
      {note:'Everyone after that is answered at once, from cache, without touching inventory or the database.', flow:[['app', 'lb', 'Sold out (cached)'], ['lb', 'user'], ['user', 'cdn', 'static sold-out page']]},
      {note:'Unpaid reservations that expire put stock back; a few late buyers may still get one.', flow:[['inv', 'queue', 'reservation expired → +1']]}]}],
  breakIt:[
    {label:'Search cluster down', kill:['search'], verdict:'degrades', text:'Category pages and cached “top sellers” lists still work; search shows a fallback. Checkout is unaffected.'},
    {label:'Inventory gate (Redis) fails', kill:['inv'], verdict:'degrades', text:'Fail closed: pause the sale (“high demand, retry shortly”) rather than overselling. A replica with the same stock counter takes over; reconcile against the database before reopening.'},
    {label:'Payment gateway outage', kill:['pay'], verdict:'degrades', text:'Reservations wait until they expire; route to a backup gateway if available. Expired reservations return stock automatically.'},
    {label:'Order workers stopped', kill:['oms'], verdict:'survives', text:'Orders accumulate safely in the queue; buyers see “confirming”. Workers catch up when restarted; nothing is lost or duplicated (idempotent inserts by reservation id).'},
    {label:'Cart store node fails', kill:['cart'], verdict:'survives', text:'Other replicas accept the write (sloppy quorum + hinted handoff); conflicting versions are merged on the next read.'},
    {label:'Orders DB primary fails', kill:['db'], verdict:'degrades', text:'Failover takes seconds; the queue buffers orders, so buyers just see “confirming” a little longer.'},
    {label:'Waiting room overwhelmed', hot:['wr'], verdict:'degrades', text:'Serve the queue page itself statically from the CDN with a token; only the admission API is dynamic, and it is cheap.'}],
  dataModel:{lang:'sql', title:'stock, reservations and orders', code:`-- Source of truth for stock (relational)
CREATE TABLE inventory (
  sku_id      BIGINT PRIMARY KEY,
  on_hand     INT NOT NULL CHECK (on_hand >= 0),
  reserved    INT NOT NULL DEFAULT 0
);
CREATE TABLE reservations (
  reservation_id CHAR(26) PRIMARY KEY,   -- also the idempotency key for the order
  sku_id BIGINT, user_id BIGINT, qty INT,
  status VARCHAR(12),                    -- HELD | PAID | EXPIRED | RELEASED
  expires_at TIMESTAMP
);
CREATE TABLE orders (
  order_id CHAR(26) PRIMARY KEY, reservation_id CHAR(26) UNIQUE, user_id BIGINT,
  total_minor BIGINT, status VARCHAR(12), created_at TIMESTAMP
);
-- Sale-time gate (Redis): stock:{sku} integer, buyers:{sku} set (per-account limit)
--   EVAL: if SISMEMBER buyers user then return -2 end;
--         local n = DECR stock; if n < 0 then INCR stock; return -1 end;
--         SADD buyers user; return n`, notes:'The in-memory counter only decides who may buy; the reservation id makes every later step (payment, order insert) idempotent. A reconciliation job compares Redis, reservations and inventory after the sale.'},
  apis:[
    {m:'POST', path:'/v1/sales/{saleId}/buy', note:'Requires an admission token from the waiting room; returns quickly either way.', req:'{ "sku": 81, "qty": 1, "admission_token": "wr_…" }', res:'{ "reservation_id": "01JD2…", "expires_in_s": 600, "status": "HELD" }   // or 409 { "status": "SOLD_OUT" }'},
    {m:'POST', path:'/v1/checkout', note:'Idempotent on reservation_id: a retry returns the same order.', req:'{ "reservation_id": "01JD2…", "payment": {"method": "upi"} }', res:'{ "order_id": "01JD3…", "status": "CONFIRMING" }'},
    {m:'POST', path:'/v1/cart/items', note:'Always accepted; merged with other versions on read.', req:'{ "sku": 1442, "qty": 2 }', res:'{ "items": 3 }'}],
  algorithm:{title:'Selling exactly N units to a stampede', html:'<p>A flash sale is a <b>contention</b> problem. Read-then-write loses updates and oversells; a database row lock is correct but turns one row into a single-lane bridge; an <b>atomic decrement in memory</b> plus a <b>sold-out flag</b> and an <b>order queue</b> keeps it both correct and fast. The simulator runs all three on the same stampede of buyers.</p>', mount:flashSim, pg:'rate-limiter'},
  tradeoffs:[['Atomic in-memory stock gate', 'Microseconds per decision; exactly N winners', 'A second source of truth that must be reconciled with the database'], ['Queue between reservation and order write', 'Database load stays flat during the spike', 'Orders are “confirming” for seconds; more moving parts'], ['Highly available cart (Dynamo-style)', '“Add to cart” always works', 'Merged conflicts can resurrect a deleted item'], ['Virtual waiting room', 'Protects the whole site; fair ordering', 'Users wait; it must be scaled and bot-proofed itself'], ['Reservation with expiry', 'Stock isn’t lost to abandoned checkouts', 'Some buyers see “sold out”, then stock reappears']],
  alternatives:[['SELECT … FOR UPDATE on the stock row', 'Correct, and fine for normal traffic; collapses under flash-sale contention'], ['Optimistic concurrency (version column)', 'Correct, but under contention almost every attempt conflicts and retries'], ['Split stock into N sub-counters (buckets)', 'Spreads contention across rows; works, but rebalancing empty buckets is fiddly'], ['Lottery after a registration window', 'Very fair and calm, but no instant gratification; used for some launches']],
  failures:[['Stock gate', 'Fail closed: pause the sale, recover the counter, reconcile'], ['Payments', 'Reservations expire and release stock; backup gateway'], ['Order workers', 'Queue buffers; idempotent catch-up'], ['Cart store', 'Sloppy quorum + hinted handoff'], ['Overload', 'Waiting room, static sold-out page, shed non-critical services']],
  lab:{stack:['Node.js / Spring Boot', 'Postgres', 'Redis (Lua scripts)', 'Kafka or Redpanda', 'Nginx or a CDN for static pages', 'k6'], milestones:[
    {day:'Day 1: shop basics', items:['Catalogue with cache-aside product pages', 'Cart stored per user in Redis or DynamoDB Local', 'Checkout in one SQL transaction', 'Measure product-page p99 with and without cache']},
    {day:'Day 2: the race', items:['Naive read-then-write stock: run k6 with 5,000 buyers for 100 units; count oversells', 'Switch to UPDATE … WHERE stock > 0; measure timeouts', 'Redis Lua gate (DECR + per-user set); prove exactly 100 winners', 'Sold-out flag cached at the edge']},
    {day:'Day 3: the spike', items:['Queue reservations; workers insert orders at a fixed rate', 'Idempotent checkout keyed by reservation id; replay events', 'Reservation expiry returns stock', 'A minimal waiting room: token issuance at N/s; k6 with 50K virtual users']}],
   pseudocode:{lang:'ts', code:`// Atomic stock gate: one Lua script = one indivisible step inside Redis
const BUY = \`
  if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then return -2 end   -- one per account
  local left = redis.call('DECR', KEYS[1])
  if left < 0 then redis.call('INCR', KEYS[1]); return -1 end           -- sold out
  redis.call('SADD', KEYS[2], ARGV[1]); return left\`;

async function buy(userId: string, sku: number) {
  if (soldOut.has(sku)) return { status: 'SOLD_OUT' };                   // local flag: no Redis call
  const left = await redis.eval(BUY, 2, \`stock:\${sku}\`, \`buyers:\${sku}\`, userId);
  if (left === -1) { soldOut.add(sku); return { status: 'SOLD_OUT' }; }
  if (left === -2) return { status: 'LIMIT_REACHED' };
  const reservationId = ulid();
  await kafka.send('reservations', { reservationId, userId, sku, expiresAt: Date.now() + 600_000 });
  return { status: 'HELD', reservationId };                              // order persisted asynchronously
}`},
   loadTest:'<p>Seed one SKU with 1,000 units. Fire 20,000 buy requests in 2 seconds with k6 (spread across 5,000 accounts, some repeating). Assert exactly 1,000 reservations, no account with two, p99 latency, and database write rate. Then kill Redis mid-sale: the API must fail closed (no oversell) and recover after reconciliation.</p>'},
  twists:[
    {q:'Redis says 1,000 sold, but only 960 orders were paid. What happens to the other 40?', a:'Their reservations expire (or payment fails); a consumer releases them with INCR on the stock key and marks them EXPIRED. Late buyers can then win them. The database inventory is reconciled from reservations, so both agree when the sale ends.'},
    {q:'Why not just scale the database to handle the flash sale?', a:'The problem isn’t total capacity but contention on one hot row (one SKU’s stock). Adding replicas or shards doesn’t help a single row; you either split the counter (buckets), or move the decision to a component built for millions of tiny atomic operations (in-memory) and write results to the database at a steady rate.'},
    {q:'How would you design “add to cart” to stay available during a network partition?', a:'Accept writes on any reachable replica (sloppy quorum), store versions with vector clocks, and merge conflicting carts on read (union of items, max quantity). The rare anomaly, a deleted item reappearing, is a far better outcome than refusing to add items. This is the Dynamo shopping-cart example.'}],
  real:[
    {co:'Amazon Dynamo', tier:'confirmed', text:'Dynamo was built so that the shopping cart is always writable: consistent hashing, replication with sloppy quorums and hinted handoff, vector clocks, and application-level reconciliation of conflicting versions.', src:'DeCandia et al., “Dynamo: Amazon’s Highly Available Key-value Store” (SOSP 2007)'},
    {co:'Prime Day on AWS', tier:'confirmed', text:'During Prime Day 2023, DynamoDB served Amazon properties at a peak of 126 million requests per second.', src:'AWS News Blog, “Prime Day 2023 Powered by AWS” (2023)'},
    {co:'Amazon builders’ practices', tier:'confirmed', text:'Amazon documents cell-based isolation, shuffle sharding, load shedding to avoid overload, and timeouts/retries with jittered backoff.', src:'AWS Builders’ Library (e.g. “Using load shedding to avoid overload”, “Timeouts, retries, and backoff with jitter”, “Workload isolation using shuffle-sharding”)'},
    {co:'Amazon consumer business databases', tier:'confirmed', text:'Amazon’s consumer business completed its migration off Oracle databases to AWS database services in 2019.', src:'AWS News Blog, “Migration Complete – Amazon’s Consumer Business Just Turned off its Final Oracle Database” (2019)'},
    {co:'Virtual waiting room', tier:'confirmed', text:'AWS publishes a reference “virtual waiting room” solution for absorbing traffic spikes by admitting users at a controlled rate.', src:'AWS Solutions Library, “Virtual Waiting Room on AWS”'},
    {co:'Flipkart', tier:'inference', text:'Flipkart’s Big Billion Days sales face the same flash-sale problems; its internal design isn’t described here, and the gate + queue + waiting-room design is a common reference pattern.', src:'This case study'},
    {co:'Flash-sale simulator', tier:'educational', text:'The stampede simulator uses illustrative latencies (2 ms row lock, 20 µs in-memory decrement, 2,000 order writes/s).', src:'This case study’s model'}],
  sources:['DeCandia et al. — Dynamo: Amazon’s Highly Available Key-value Store (SOSP 2007)', 'AWS News Blog — Prime Day 2023 Powered by AWS', 'AWS Builders’ Library — Using load shedding to avoid overload; Timeouts, retries, and backoff with jitter; Workload isolation using shuffle-sharding', 'AWS Solutions Library — Virtual Waiting Room on AWS', 'AWS News Blog — Migration Complete: Amazon’s Consumer Business Just Turned off its Final Oracle Database (2019)', 'Garcia-Molina & Salem — Sagas (SIGMOD 1987)', 'Redis documentation — EVAL / Lua scripting and atomicity']
});

/* ======================= 3. UPI / PHONEPE / PAYTM ======================= */
SDA.register({kind:'case', id:'upi', tier:'flagship', icon:'💸', title:'UPI / PhonePe / Paytm (real-time payments)', tagline:'Bank to bank in seconds, billions of times a month, when every hop can time out.', tags:['payments', 'upi', 'npci', 'idempotency', 'reconciliation', 'timeouts', 'fraud', 'india', 'upi lite'],
  modules:['distributed', 'security', 'reliability', 'async', 'databases'],
  summary:'UPI lets anyone pay anyone (person or shop) instantly from their bank account using an id like <code>priya@okbank</code>. A payment app such as PhonePe, Google Pay or Paytm sits on top of a <b>four-party network</b>: the app’s sponsor PSP bank, the <b>NPCI switch</b>, the payer’s bank (debit) and the payee’s bank (credit). The engineering is about <b>correctness across organisations you don’t control</b>: unique transaction ids, explicit pending states, status checks, automatic reversals, reconciliation, plus fraud scoring in milliseconds and festival-day peaks.',
  accuracy:'The UPI roles (NPCI switch, PSP and sponsor banks, third-party apps, remitter and beneficiary banks), device binding, the NPCI common library for PIN entry, UPI Lite, the RBI T+1 auto-reversal rule and NPCI’s monthly volumes are public and labelled confirmed. How PhonePe, Google Pay or Paytm build their own backends is not documented here; those components are inference or simplified for teaching. The four-party flow is shown in simplified form (the payee’s PSP and some messages are merged).',
  overview:{what:'Ankit scans a QR code at a chai stall and pays ₹20. His bank debits him, the stall’s bank credits the owner, and a speaker on the counter announces “₹20 received”, usually within a couple of seconds.', in:['Wallet → UPI app evolution', 'Payer app backend (a third-party app on a sponsor PSP bank)', 'Pay flow through the NPCI switch: debit and credit legs', 'Device binding and PIN security', 'Timeouts, pending states, status checks, reversals and reconciliation', 'Fraud and risk scoring; UPI Lite for small payments'], out:['Merchant onboarding and KYC in depth', 'Settlement between banks (net settlement cycles)', 'Credit lines on UPI, RuPay credit cards on UPI', 'UPI AutoPay mandates in depth']},
  challenges:['Four or more organisations per payment, each with its own timeouts and failures', 'A timeout doesn’t mean failure: the money may have moved', 'Must never double-debit, and must resolve stuck money fast (RBI T+1 rule)', 'Fraud and social-engineering scams in real time', 'Peaks on salary days, festivals and month-starts; bank core systems are the bottleneck'],
  fr:['Link a bank account to the app via device binding', 'Pay to a UPI id, phone number or QR code; enter the UPI PIN', 'See a definite outcome: success, failure, or pending with automatic resolution', 'Transaction history and receipts', 'Receive payments with instant notification (merchants)'],
  nfr:['Payment completes in a few seconds end to end (illustrative)', 'Exactly-once money movement: no double debit, no lost credit', 'Failed debits reversed automatically within T+1', 'PIN never visible to the app; device-bound credentials', 'Very high availability on the app side; graceful handling of bank downtime'],
  scale:[
    {k:'UPI transactions (Dec 2024)', v:'≈ 16.7B/month', math:'NPCI monthly UPI statistics (≈ 16.73B, ≈ ₹23.25 lakh crore)', tag:'public'},
    {k:'Average rate', v:'≈ 6,400 TPS', math:'16.7B ÷ (30 × 86,400 s)', tag:'illustrative'},
    {k:'Peak rate', v:'≈ 20K TPS', math:'average × ~3 for salary days and evening peaks', tag:'illustrative'},
    {k:'Switch messages', v:'≈ 150K/s at peak', math:'~8 request/response legs per payment × 20K TPS', tag:'illustrative'},
    {k:'Pending payments per day', v:'≈ 1M+', math:'500M payments/day × ~0.2% ending in a timeout somewhere', tag:'illustrative'},
    {k:'Ledger rows per year (one big app)', v:'≈ 100B', math:'~50% market share × 200B UPI payments × ~1 row per state change', tag:'illustrative'}],
  arch:{w:940, h:400, minW:700, nodes:[
    {id:'payer', type:'client', label:'Payer app', x:70, y:120, w:110},
    {id:'payee', type:'client', label:'Payee / shop', x:70, y:300, w:116},
    {id:'notify', type:'service', label:'Notifications', sub:'push · soundbox', x:240, y:55, w:140, stage:9},
    {id:'lb', type:'lb', label:'API gateway', sub:'device-bound', x:240, y:210, w:130, stage:4},
    {id:'queue', type:'queue', label:'Kafka', sub:'txn events', x:430, y:55, w:130, stage:4},
    {id:'app', type:'service', label:'Backend', sub:'closed wallet', x:430, y:210, w:150},
    {id:'db', type:'db', label:'Ledger DB', sub:'wallet balances', x:430, y:345, w:150},
    {id:'recon', type:'service', label:'Reconciliation', sub:'status · T+1', x:630, y:55, w:150, stage:3},
    {id:'pspb', type:'ext', label:'PSP bank', sub:'sponsor bank', x:630, y:210, w:130, stage:1},
    {id:'risk', type:'service', label:'Risk engine', sub:'score < 100 ms', x:630, y:345, w:140, stage:7},
    {id:'rbank', type:'ext', label:'Payer’s bank', sub:'debit', x:830, y:55, w:140, stage:1},
    {id:'npci', type:'ext', label:'NPCI switch', sub:'UPI', x:830, y:210, w:140, stage:1},
    {id:'bbank', type:'ext', label:'Payee’s bank', sub:'credit', x:830, y:345, w:140, stage:1}],
   edges:[{from:'payer', to:'app', gone:4}, {from:'payee', to:'app', gone:4}, {from:'app', to:'db'},
     {from:'app', to:'pspb', stage:1}, {from:'pspb', to:'npci', stage:1}, {from:'npci', to:'rbank', stage:1}, {from:'npci', to:'bbank', stage:1},
     {from:'recon', to:'pspb', stage:3}, {from:'recon', to:'app', stage:3},
     {from:'payer', to:'lb', stage:4}, {from:'payee', to:'lb', stage:4}, {from:'lb', to:'app', stage:4}, {from:'app', to:'queue', stage:4}, {from:'queue', to:'recon', stage:4},
     {from:'app', to:'risk', stage:7},
     {from:'queue', to:'notify', stage:9}, {from:'notify', to:'payee', stage:9}, {from:'notify', to:'payer', stage:9}]},
  evolution:[
    {title:'A closed wallet: one server, one ledger', scale:'100K users', fix:'<p>A prepaid wallet: users load money by card, then pay each other inside the app. A payment is one database transaction moving balance from one row to another. Fast and correct, but the money is stuck inside the wallet and every shop needs your wallet.</p>', after:{lat:150, err:.1, load:20}},
    {title:'Money stuck in silos: pay any bank account', scale:'1M users', hot:['app'], breaks:'<p>Users want to pay anyone, not just other wallet users, straight from their bank account, and merchants won’t accept ten different wallets.</p>', fix:'<p>Join <b>UPI</b> as a third-party app: the backend talks to a <b>sponsor PSP bank</b>, which connects to the <b>NPCI switch</b>. For each payment NPCI sends a <b>debit</b> request to the payer’s bank and a <b>credit</b> request to the payee’s bank, and relays the responses. The app now moves bank money; its own database becomes a transaction history, not the ledger of record. Each payment now crosses four organisations, so it takes longer (around a second instead of 150 ms), but it works with any bank.</p>', sub:{app:'UPI app backend', db:'transaction store'}, before:{lat:400, err:2, load:90}, after:{lat:900, err:.5, load:40}, flow:[['payer', 'app', 'pay ₹250 to priya@okbank'], ['app', 'pspb'], ['pspb', 'npci'], ['npci', 'rbank', 'debit'], ['npci', 'bbank', 'credit']], lesson:['api-design', 'two-phase-commit']},
    {title:'Anyone with my phone number could pay as me', scale:'security', hot:['app'], breaks:'<p>A password or OTP alone is phishable, and an app that sees the PIN could leak it. Fraudsters register victims’ accounts on their own phones.</p>', fix:'<p><b>Device binding</b>: registration sends an SMS from the SIM holding the bank-registered number, tying the account to that device. The <b>UPI PIN</b> is entered in NPCI’s <b>common library</b> on the phone and encrypted for verification by the payer’s bank, so the app never sees it. Every request is signed with device credentials.</p>', sub:{app:'device-bound sessions'}, before:{lat:900, err:1.5, load:45}, after:{lat:900, err:.4, load:45}, flow:[['payer', 'app', 'encrypted PIN block'], ['app', 'pspb'], ['pspb', 'npci'], ['npci', 'rbank', 'verify PIN + debit']], lesson:['authn-vs-authz', 'encryption', 'api-keys-mtls']},
    {title:'Debited, but the shop never got it', scale:'10M payments/day', hot:['app', 'pspb'], breaks:'<p>The payer’s bank debits, but the credit leg or a response times out. The app shows “failed”; the user pays again, and the shop gets paid twice, or not at all while the money sits in limbo for days.</p>', fix:'<p>Treat a timeout as <b>unknown</b>, not failed. Every payment has one <b>transaction id</b> end to end; the app shows <b>pending</b> and a <b>reconciliation</b> service asks the switch for the final status (check-status calls with backoff). If the credit didn’t happen, the debit is <b>reversed automatically</b> (RBI’s rule for failed UPI payments: by T+1, or the bank pays compensation). Daily settlement files are matched against the app’s records.</p>', before:{lat:1500, err:1.2, load:60}, after:{lat:950, err:.3, load:50}, flow:[['npci', 'bbank', 'credit (timeout)'], ['recon', 'pspb', 'check status'], ['pspb', 'npci'], ['recon', 'app', 'final: SUCCESS']], lesson:['timeouts-retries', 'delivery-semantics', 'saga-outbox']},
    {title:'Salary day: 10× peak', scale:'100M payments/day', hot:['app', 'db'], breaks:'<p>On the 1st of the month and during festivals, payments spike 10× within an hour. One backend and one database saturate; slow responses make users retry, which adds even more load.</p>', fix:'<p>Stateless backends behind an <b>API gateway</b> that checks device signatures and rate limits; the transaction store is <b>sharded by user</b>; every state change is published to <b>Kafka</b> for history, notifications, reconciliation and analytics, off the payment path.</p>', sub:{db:'sharded by user'}, before:{lat:4000, err:5, load:250}, after:{lat:900, err:.3, load:60}, flow:[['payer', 'lb', 'pay'], ['lb', 'app'], ['app', 'queue', 'txn.created']], lesson:['sharding', 'event-driven', 'rate-limiting']},
    {title:'Double tap = double payment?', scale:'flaky networks', hot:['app'], breaks:'<p>On a weak signal the user taps Pay twice, or the app retries after a timeout. Without care that becomes two debits.</p>', fix:'<p>The app generates the <b>transaction id</b> once per payment intent and reuses it for every retry; the backend, the PSP and the switch all treat a repeated id as the same payment (<b>idempotency</b>) and return its current status instead of creating a new one.</p>', sub:{app:'idempotent txn ids'}, before:{lat:950, err:1, load:70}, after:{lat:900, err:.05, load:60}, flow:[['payer', 'lb', 'retry: same txn id'], ['lb', 'app'], ['app', 'db', 'exists → return status']], lesson:['idempotency-rate-limit-headers']},
    {title:'One slow bank drags everyone down', scale:'hundreds of banks', hot:['pspb', 'app'], breaks:'<p>One large bank’s core system slows down. Requests to it hold threads and connections for 30 s each, and soon payments to every bank time out.</p>', fix:'<p>Track <b>per-bank health</b> (success rate and latency) and isolate calls per bank (<b>bulkheads</b>) with tight timeouts. Warn users up front (“SBI is facing delays”) and suggest another linked account. You can’t route around the payer’s bank, but you can stop it from sinking the rest.</p>', sub:{app:'per-bank bulkheads'}, before:{lat:6000, err:8, load:120}, after:{lat:950, err:.8, load:60}, flow:[['app', 'pspb', 'route with timeout budget']], lesson:['bulkhead-fallback', 'circuit-breaker']},
    {title:'Scams and mule accounts', scale:'adversarial', hot:['app'], breaks:'<p>Fraudsters trick users into approving “collect” requests or paying fake sellers, then route the money through mule accounts. By the time it’s reported, it’s gone.</p>', fix:'<p>A <b>risk engine</b> scores every payment within a tight budget (~100 ms) using device signals, velocity, payee reputation, new-payee and unusual-amount checks, and network patterns across mule accounts. It can block, add friction (warnings, a cooling-off delay) or allow, and it keeps learning from reported fraud.</p>', before:{lat:900, err:.9, load:65}, after:{lat:980, err:.2, load:65}, flow:[['app', 'risk', 'score txn'], ['app', 'pspb', 'allowed']], lesson:['zero-trust-tenancy', 'time-series']},
    {title:'Tiny payments flood bank core systems', scale:'₹20 chai payments', hot:['pspb'], breaks:'<p>Half of all UPI payments are small. Each one needs a round trip to the payer bank’s core banking system, the slowest and most expensive hop, and bank downtime blocks even a ₹10 payment.</p>', fix:'<p><b>UPI Lite</b>: the user loads a small balance into an on-device account; small payments debit that balance without hitting the bank core each time (and without a PIN). Banks see only top-ups and periodic sync. NPCI introduced it in 2022 to cut load and failures on core systems.</p>', sub:{payer:'UPI Lite balance'}, before:{lat:1200, err:1.5, load:110}, after:{lat:500, err:.2, load:70}, flow:[['payer', 'lb', 'UPI Lite payment (no PIN)'], ['lb', 'app']], lesson:['offline-first-sync', 'capacity-planning']},
    {title:'Shops need instant, trustworthy confirmation', scale:'50M merchants', hot:['app'], breaks:'<p>A stall owner can’t watch a phone screen during a rush, and fake “payment successful” screenshots are a common scam.</p>', fix:'<p>When the credit is confirmed, a <b>notification service</b> pushes it from the event stream to the payee: an app notification and a <b>soundbox</b> on the counter that speaks the amount. It only announces what the payee’s side has confirmed, so screenshots can’t fool it.</p>', before:{lat:900, err:.6, load:60}, after:{lat:900, err:.1, load:60}, flow:[['app', 'queue', 'txn.success'], ['queue', 'notify'], ['notify', 'payee', '“₹20 received”']], lesson:['push-notifications', 'event-driven']}],
  flows:[
    {name:'Pay ₹250 (happy path)', steps:[
      {note:'The app creates a payment intent with one transaction id; the PIN is entered in NPCI’s common library and encrypted.', flow:[['payer', 'lb', 'pay · txn id · encrypted PIN'], ['lb', 'app']]},
      {note:'The risk engine scores the payment; the transaction is recorded as INITIATED.', flow:[['app', 'risk', 'score: allow'], ['app', 'db', 'INITIATED']]},
      {note:'The request goes through the sponsor PSP bank to the NPCI switch, which asks the payer’s bank to verify the PIN and debit.', flow:[['app', 'pspb', 'pay request'], ['pspb', 'npci'], ['npci', 'rbank', 'debit ₹250']]},
      {note:'NPCI then asks the payee’s bank to credit the account.', flow:[['npci', 'bbank', 'credit ₹250']]},
      {note:'The success response travels back; the app records SUCCESS and publishes the event.', flow:[['npci', 'pspb', 'SUCCESS'], ['pspb', 'app'], ['app', 'db', 'SUCCESS'], ['app', 'queue', 'txn.success']]},
      {note:'Both sides are notified.', flow:[['queue', 'notify'], ['notify', 'payer', 'Paid ✓'], ['notify', 'payee', '₹250 received']]}]},
    {name:'Timeout → pending → resolved', steps:[
      {note:'The debit succeeds, but the credit leg times out; the app shows “pending”, never “failed”.', flow:[['npci', 'rbank', 'debit OK'], ['npci', 'bbank', 'credit… timeout'], ['app', 'db', 'PENDING']]},
      {note:'Reconciliation asks the switch for the final status, with backoff.', flow:[['recon', 'pspb', 'check status (txn id)'], ['pspb', 'npci']]},
      {note:'If the credit failed, NPCI triggers a reversal and the debit is refunded; otherwise the payment is marked SUCCESS.', flow:[['npci', 'rbank', 'reverse debit'], ['recon', 'app', 'final: FAILED · reversed']]},
      {note:'The user is told the definite outcome.', flow:[['app', 'queue', 'txn.final'], ['queue', 'notify'], ['notify', 'payer', 'Refunded ✓']]}]},
    {name:'Double tap', steps:[
      {note:'The user taps twice; both requests carry the same transaction id.', flow:[['payer', 'lb', 'pay (txn A)'], ['payer', 'lb', 'pay (txn A again)'], ['lb', 'app']]},
      {note:'The second is recognised and answered with the first one’s status; only one payment reaches the switch.', flow:[['app', 'db', 'txn A exists → PENDING'], ['app', 'pspb', 'one request only']]}]}],
  breakIt:[
    {label:'Payee’s bank times out', hot:['bbank'], verdict:'degrades', text:'Payments to that bank go pending; reconciliation resolves each one with status checks, and failed credits are reversed automatically within T+1. No double payments, because retries reuse the id.', flow:[['recon', 'pspb', 'check status']]},
    {label:'Payer’s bank core down', kill:['rbank'], verdict:'fails', text:'Payments from that bank can’t be debited; the switch returns a clear failure. The app shows the bank as down and suggests another linked account or UPI Lite. Nothing can route around the payer’s own bank.'},
    {label:'Sponsor PSP bank outage', kill:['pspb'], verdict:'fails', text:'Every payment from the app fails until it recovers, which is why large apps work with several sponsor PSP banks and split users across them (different UPI handles).'},
    {label:'Risk engine slow or down', kill:['risk'], verdict:'degrades', text:'Fail with rules: allow low-risk payments (known payee, small amount) using cached scores and simple rules, add friction to the rest. Never let the risk call block payments indefinitely.'},
    {label:'Kafka lag', hot:['queue'], verdict:'survives', text:'Payments still complete (the event stream is off the payment path); notifications and history update late. Soundbox announcements may lag, but the payee’s bank has the money.'},
    {label:'Transaction-store shard fails', kill:['db'], verdict:'degrades', text:'Users on that shard can’t start new payments until a replica is promoted (seconds). In-flight payments are resolved later by reconciliation from NPCI’s records.'},
    {label:'Notification service down', kill:['notify'], verdict:'survives', text:'Money still moves; confirmations are delivered when the service recovers. Merchants can check the app’s history.'}],
  dataModel:{lang:'sql', title:'transactions as an explicit state machine', code:`CREATE TABLE upi_txn (
  txn_id        CHAR(35) PRIMARY KEY,     -- generated once per payment intent; reused on every retry
  payer_vpa     VARCHAR(64) NOT NULL,
  payee_vpa     VARCHAR(64) NOT NULL,
  amount_paise  BIGINT NOT NULL CHECK (amount_paise > 0),
  state         VARCHAR(12) NOT NULL,     -- INITIATED | PENDING | SUCCESS | FAILED | REVERSED
  rrn           CHAR(12),                 -- reference number returned by the network
  error_code    VARCHAR(8),
  version       INT NOT NULL,
  created_at    TIMESTAMP NOT NULL,
  updated_at    TIMESTAMP NOT NULL
);
-- Only forward transitions are allowed, guarded by version:
-- UPDATE upi_txn SET state='SUCCESS', rrn=?, version=version+1
--  WHERE txn_id=? AND state IN ('INITIATED','PENDING') AND version=?;
CREATE TABLE txn_events (txn_id CHAR(35), seq INT, state VARCHAR(12), at TIMESTAMP, PRIMARY KEY (txn_id, seq));  -- outbox + audit`, notes:'The payment app isn’t the ledger of record (the banks are), so its job is to know the state of every payment and resolve every unknown one. Reconciliation matches this table against status checks and the daily settlement files.'},
  apis:[
    {m:'POST', path:'/v1/payments', note:'Simplified. The PIN block comes from NPCI’s common library, never in plaintext.', req:'{ "txn_id": "PHP20261113…", "payee": "chaiwala@okbank", "amount": 2000, "currency": "INR", "pin_block": "<encrypted>", "device_sig": "…" }', res:'{ "txn_id": "PHP20261113…", "state": "SUCCESS", "rrn": "431812345678" }   // or { "state": "PENDING" }'},
    {m:'GET', path:'/v1/payments/{txn_id}', note:'Polled by the app while pending; answered from the state machine, which reconciliation updates.', res:'{ "state": "FAILED", "reversal": "COMPLETED", "updated_at": "2026-11-13T10:42:05+05:30" }'},
    {m:'NPCI', path:'ReqChkTxn (check status)', note:'Conceptually: the PSP asks the switch for the final status of a transaction id. Real UPI APIs are XML messages defined in NPCI’s specifications.'}],
  algorithm:{title:'A timeout is not a failure', html:'<p>In a multi-party payment the caller sometimes can’t know whether the money moved. Treating a timeout as “failed” and letting the user pay again creates <b>double payments</b>; treating it as “success” loses money. The safe design is an explicit <b>PENDING</b> state, <b>one transaction id</b> per intent, active <b>status checks</b> and <b>automatic reversal</b>. The Monte Carlo model below counts the damage of the naive approach; the calculator turns NPCI’s monthly volume into load.</p>', mount:host => { upiSim(host); host.append(hr()); upiScale(host); }, pg:'saga-2pc'},
  tradeoffs:[['Explicit PENDING state', 'Honest to users; no double payments', 'Users wait (sometimes until T+1) for a definite answer'], ['Idempotent transaction ids', 'Retries are always safe', 'Ids must be generated and stored before the first attempt'], ['Event stream off the payment path', 'Notifications and history can’t slow payments', 'They are eventually consistent'], ['Risk scoring on every payment', 'Stops many scams in real time', 'Latency budget, false positives that annoy real users'], ['UPI Lite for small payments', 'Fewer bank-core calls; works when banks are slow', 'Money sits in a small device balance; limits on amounts']],
  alternatives:[['Wallet-only (closed loop)', 'Fast and simple, but money is siloed and needs top-ups'], ['Card networks', 'Global and mature, but merchant fees and card-reader hardware; UPI’s QR + zero-MDR model spread faster in India'], ['Synchronous two-phase commit across banks', 'Banks don’t share a transaction coordinator; UPI uses request/response legs with reversals instead'], ['Retry automatically on timeout with a new id', 'Exactly how double payments happen']],
  failures:[['Payee bank timeout', 'PENDING → status checks → success or auto-reversal'], ['Payer bank down', 'Clear failure; suggest another account or UPI Lite'], ['Sponsor PSP bank', 'Multiple PSP banks and handles'], ['Risk engine', 'Rule-based fallback with friction'], ['Event pipeline', 'Off the payment path; catch up later']],
  lab:{stack:['Node.js or Java (Spring Boot)', 'Postgres', 'Kafka or Redpanda', 'A mock “switch” and two mock “banks” with injectable timeouts', 'Redis (idempotency cache)', 'k6'], milestones:[
    {day:'Day 1: four parties', items:['Mock switch, payer bank (debit) and payee bank (credit) services with random latency', 'Payment API with a client-generated txn id and the state machine above', 'Happy path end to end with a receipt']},
    {day:'Day 2: the unknowns', items:['Inject 2% timeouts on the credit leg, half of them after the credit happened', 'PENDING state + check-status worker with exponential backoff', 'Automatic reversal for failed credits; prove zero double payments over 100K runs', 'Double-tap test: concurrent requests with the same txn id']},
    {day:'Day 3: scale and safety', items:['Per-bank bulkheads and timeouts; slow one bank and watch the others stay healthy', 'A rules-based risk check with a 100 ms budget and a fallback', 'Kafka events → notifications service', 'k6: 2,000 TPS for 10 min with one bank degraded']}],
   pseudocode:{lang:'ts', code:`async function pay(req: PayRequest) {
  const existing = await txns.get(req.txnId);
  if (existing) return existing;                                 // idempotent: same id → same payment
  await txns.insert({ ...req, state: 'INITIATED', version: 0 });
  const verdict = await withTimeout(risk.score(req), 100).catch(() => rules.fallback(req));
  if (verdict === 'BLOCK') return txns.transition(req.txnId, 'FAILED', 'RISK');
  try {
    const r = await withTimeout(psp.send(req), bankBudget(req.payerBank));   // per-bank bulkhead
    return txns.transition(req.txnId, r.ok ? 'SUCCESS' : 'FAILED', r.code, r.rrn);
  } catch (e) {
    if (isTimeout(e)) { await txns.transition(req.txnId, 'PENDING'); statusChecks.schedule(req.txnId); return { state: 'PENDING' }; }
    throw e;
  }
}
// Reconciliation: resolve every PENDING by asking the network, never by guessing
statusChecks.handle(async txnId => {
  const s = await psp.checkStatus(txnId);                         // backoff: 30 s, 2 min, 10 min, …
  if (s.final) await txns.transition(txnId, s.state, s.code, s.rrn);
  else statusChecks.retryLater(txnId);
});`},
   loadTest:'<p>Run 100K payments through the mock network with 1% of credit legs timing out (half of them after the credit succeeded). Compare a naive client (timeout = failed, user pays again with a new id) with the PENDING design: count double payments and stuck debits, and measure time to final status. Then degrade one mock bank to 10 s latency and verify the others keep their p99.</p>'},
  twists:[
    {q:'Your app shows “failed”, but the shop owner says the money arrived. What went wrong, and how do you fix the design?', a:'The app treated a timeout (or a late failure response from an intermediate hop) as final. The fix: only the switch’s final status decides; timeouts become PENDING and are resolved by status checks, and the UI says “pending, we’ll confirm shortly” rather than “failed”. Also reconcile against settlement files daily.'},
    {q:'How would you support 3× peak on Diwali without over-provisioning all year?', a:'Autoscale the stateless app tier ahead of known dates (scheduled scaling), pre-split database shards, keep the event pipeline and notifications off the payment path, push small payments to UPI Lite, and coordinate with PSP banks on capacity. Rate-limit retries from clients (with jitter) so slowness doesn’t turn into a retry storm.'},
    {q:'Where should the PIN be verified, and why not on your servers?', a:'At the payer’s bank. The PIN is captured by NPCI’s common library on the device and encrypted for the issuer, so neither the app nor its servers can read it. That limits the damage if the app or its backend is compromised: an attacker can’t harvest PINs.'}],
  real:[
    {co:'NPCI UPI', tier:'confirmed', text:'UPI, launched by NPCI in 2016, is an interoperable real-time payment system in which payer and payee PSPs exchange requests through the NPCI switch, which sends debit and credit requests to the remitter and beneficiary banks; third-party apps operate through sponsor PSP banks.', src:'NPCI, UPI product overview and procedural guidelines; NPCI guidelines for third-party application providers (TPAPs)'},
    {co:'UPI volume', tier:'confirmed', text:'UPI processed about 16.73 billion transactions worth about ₹23.25 lakh crore in December 2024.', src:'NPCI, UPI product statistics (monthly)'},
    {co:'RBI turnaround time', tier:'confirmed', text:'For failed UPI transactions where the account was debited, auto-reversal is due by T+1, after which the bank must pay compensation (₹100 per day of delay).', src:'RBI circular, “Harmonisation of Turn Around Time (TAT) and customer compensation for failed transactions using authorised Payment Systems” (September 2019)'},
    {co:'UPI security', tier:'confirmed', text:'Registration binds the app to the device and SIM through an SMS from the registered mobile number, and the UPI PIN is captured through NPCI’s common library and verified by the issuing bank.', src:'NPCI UPI procedural guidelines and technical specifications'},
    {co:'UPI Lite', tier:'confirmed', text:'UPI Lite (2022) lets users make small-value payments from an on-device balance without a PIN, reducing load on banks’ core systems.', src:'NPCI circulars on UPI Lite (2022 onwards); RBI statements on UPI Lite'},
    {co:'PhonePe, Google Pay, Paytm', tier:'inference', text:'These apps operate as third-party apps over multiple sponsor PSP banks; their internal backends (sharding, eventing, risk) aren’t described in detail here, so the components shown are inference.', src:'This case study'},
    {co:'Simulators', tier:'educational', text:'The timeout simulator and scale calculator use illustrative probabilities and peak factors.', src:'This case study’s models'}],
  sources:['NPCI — Unified Payments Interface: product overview, procedural guidelines and technical specifications', 'NPCI — UPI product statistics (monthly)', 'RBI — Harmonisation of TAT and customer compensation for failed transactions (2019)', 'NPCI — UPI Lite circulars (2022 onwards)', 'Garcia-Molina & Salem — Sagas (SIGMOD 1987)', 'Stripe Engineering — Designing robust and predictable APIs with idempotency (2017)']
});

/* ======================= 4. IRCTC / BOOKMYSHOW ======================= */
SDA.register({kind:'case', id:'irctc', tier:'flagship', icon:'🚆', title:'IRCTC / BookMyShow (ticketing & seat locking)', tagline:'Tatkal at 10:00:00: a whole country clicks “Book” for a few thousand berths.', tags:['ticketing', 'seat locking', 'holds', 'ttl', 'tatkal', 'waiting room', 'segments', 'concurrency', 'saga'],
  modules:['databases', 'distributed', 'reliability', 'traffic', 'async'],
  summary:'Ticketing combines <b>scarce, uniquely identifiable inventory</b> (seat 23 on coach B2, or row F seat 12) with <b>extreme spikes</b>: Tatkal bookings open at a fixed minute, concert sales at a fixed second. The design must never sell a seat twice, never charge for a seat it can’t give, and stay up while demand is 100× supply. Railways add a twist cinemas don’t have: one berth is sold <b>per journey segment</b>, so it can carry different passengers between different stations.',
  accuracy:'Public facts: Tatkal opening times and agent restrictions, Aadhaar authentication for online Tatkal bookings (2025), CRIS building the reservation systems, BookMyShow’s timed seat holds at checkout and its virtual queue for the 2024 Coldplay India sale; these are labelled confirmed. The internal architectures of IRCTC and BookMyShow are not documented here; the seat-hold, queue and allocator designs are inference or educational. Numbers are illustrative.',
  overview:{what:'At 9:59:50 Meera logs in. At 10:00:00 AC Tatkal opens; she is placed in a queue, admitted, picks a berth from Pune to Nagpur, pays by UPI within the hold time, and gets a confirmed e-ticket, or a clear waitlist number.', in:['Availability search and caching', 'Seat/berth selection with timed holds', 'Payment and booking confirmation (saga)', 'Segment-based berth allocation and quotas', 'Peak protection: waiting room, bot defences', 'Waitlist, cancellation and notifications'], out:['Fare calculation rules in depth', 'Chart preparation and onboard ticket checking', 'Catering, hotels and other IRCTC services', 'Dynamic pricing (surge fares) in depth']},
  challenges:['Unique inventory: each seat can be sold exactly once (per segment)', 'Spikes of 100× at a known minute (Tatkal, concert drops)', 'Payments take minutes and can fail after the user has committed', 'Bots and agents competing with real users', 'Railway berths are sold per journey segment, with quotas and waitlists'],
  fr:['Search trains or shows; see availability', 'Select seats and hold them while paying', 'Pay and receive a confirmed ticket (or a waitlist number)', 'Cancel and get refunds; waitlisted passengers move up', 'SMS and e-ticket notifications'],
  nfr:['Never double-book a seat; never charge without a ticket or automatic refund', 'Stay available during the Tatkal minute; fair access', 'Availability shown can be slightly stale, booking must be exact', 'Hold times long enough to pay, short enough not to waste seats', 'Auditability of every booking and refund'],
  scale:[
    {k:'Tatkal seats on one popular train', v:'≈ 300', math:'illustrative: a few Tatkal-quota coaches', tag:'illustrative'},
    {k:'Users trying at 10:00', v:'≈ 3,000 per such train', math:'illustrative: 10× oversubscription', tag:'illustrative'},
    {k:'Login + booking requests in the first minute', v:'≈ 500K/s nationally', math:'illustrative: a few million users × several requests each within ~60 s', tag:'illustrative'},
    {k:'Availability queries vs bookings', v:'≈ 100 : 1', math:'users check many trains and dates before booking one', tag:'illustrative'},
    {k:'Held seats at any moment (peak)', v:'≈ 50K', math:'≈ 10K bookings/min × ~5 min hold', tag:'illustrative'}],
  arch:{w:960, h:390, minW:700, nodes:[
    {id:'user', type:'client', label:'Traveller', x:70, y:195, w:110},
    {id:'cdn', type:'cdn', label:'CDN', sub:'static pages', x:240, y:55, w:120, stage:4},
    {id:'lb', type:'lb', label:'Load balancer', x:240, y:195, w:134, stage:4},
    {id:'wr', type:'service', label:'Waiting room', sub:'fair queue', x:240, y:335, w:140, stage:6},
    {id:'avail', type:'cache', label:'Availability', sub:'cached counts', x:430, y:55, w:140, stage:2},
    {id:'app', type:'service', label:'Booking service', sub:'one server', x:430, y:195, w:150},
    {id:'db', type:'db', label:'Inventory DB', sub:'trains, seats, PNRs', x:430, y:335, w:160},
    {id:'hold', type:'cache', label:'Seat holds', sub:'Redis, TTL', x:630, y:55, w:130, stage:3},
    {id:'queue', type:'queue', label:'Booking queue', sub:'per train', x:630, y:195, w:150, stage:8},
    {id:'pay', type:'ext', label:'Payment gateway', sub:'UPI · cards', x:630, y:335, w:150, stage:3},
    {id:'notif', type:'service', label:'SMS / e-ticket', x:830, y:55, w:140, stage:9},
    {id:'alloc', type:'service', label:'Seat allocator', sub:'segments · quotas', x:830, y:195, w:150, stage:5}],
   edges:[{from:'user', to:'app', gone:4}, {from:'app', to:'db'},
     {from:'app', to:'avail', stage:2}, {from:'app', to:'hold', stage:3}, {from:'app', to:'pay', stage:3},
     {from:'user', to:'cdn', stage:4}, {from:'user', to:'lb', stage:4}, {from:'lb', to:'app', stage:4},
     {from:'app', to:'alloc', stage:5, gone:8}, {from:'alloc', to:'db', stage:5}, {from:'alloc', to:'avail', stage:5},
     {from:'user', to:'wr', stage:6}, {from:'wr', to:'lb', stage:6},
     {from:'app', to:'queue', stage:8}, {from:'queue', to:'alloc', stage:8}, {from:'pay', to:'queue', stage:8},
     {from:'alloc', to:'notif', stage:9}]},
  evolution:[
    {title:'One server + one database', scale:'a few trains', fix:'<p>A booking application and one relational database of trains, coaches, seats and bookings. Booking: <code>SELECT</code> a free seat, then <code>INSERT</code> a booking for it. Payment is offline at the counter.</p>', after:{lat:200, err:.1, load:15}},
    {title:'Two people get seat 23', scale:'online booking', hot:['app', 'db'], breaks:'<p>Two requests both read seat 23 as free and both insert a booking: <b>check-then-act</b> race. Two passengers turn up for one berth.</p>', fix:'<p>Make the database enforce it: a <b>unique constraint</b> on (train, date, coach, seat, segment), and book inside a transaction that locks the seat row (<code>SELECT … FOR UPDATE SKIP LOCKED</code> to pick a different free seat instead of waiting). The loser gets a constraint error and tries another seat.</p>', sub:{app:'transactional booking', db:'unique per seat + segment'}, before:{lat:300, err:2, load:40}, after:{lat:250, err:.05, load:40}, flow:[['app', 'db', 'SELECT … FOR UPDATE SKIP LOCKED']], lesson:['transactions-isolation', 'locking']},
    {title:'“Is there a seat?” swamps the database', scale:'1M users/day', hot:['db'], breaks:'<p>People check availability for many trains and dates before booking once: 100 reads per booking, each counting seats across coaches and quotas. The counts compete with bookings for locks.</p>', fix:'<p>Serve availability from a <b>cache of counts</b> (per train, date, class and quota), updated whenever a booking or cancellation commits. It may be a few seconds stale (“AVAILABLE 23”), which is fine: the booking itself is checked against the database.</p>', before:{lat:2000, err:1, load:150}, after:{lat:200, err:.05, load:50}, flow:[['app', 'avail', 'B2 · 3A · AVAILABLE 23']], lesson:['cache-strategies', 'consistency-models']},
    {title:'Seat sold while I was paying', scale:'online payments', hot:['app'], breaks:'<p>Payment takes a minute or two. Without reserving the seat first, it can be sold to someone faster, and the slow payer is charged for a seat that no longer exists, then refunded days later.</p>', fix:'<p><b>Hold</b> the chosen seat before payment: <code>SET hold:{train}:{seat} user NX EX 300</code> in Redis (or a HELD row with an expiry). The seat disappears from availability while held; it becomes a booking when payment succeeds, or the hold <b>expires</b> and the seat returns. BookMyShow’s checkout timer is exactly this.</p>', before:{lat:600, err:3, load:60}, after:{lat:300, err:.2, load:55}, flow:[['app', 'hold', 'SET NX EX 300'], ['app', 'pay', 'collect ₹1,845']], lesson:['distributed-locks', 'cache-eviction']},
    {title:'Static pages and logins choke the servers', scale:'10M users/day', hot:['app'], breaks:'<p>The same servers render static pages, handle logins and process bookings; at 10:00 the static traffic alone saturates them.</p>', fix:'<p>Serve static assets and pages from a <b>CDN</b>; put many stateless booking servers behind a <b>load balancer</b>; keep sessions in a shared store so any server can serve any user.</p>', sub:{app:'stateless, many servers'}, before:{lat:3000, err:5, load:200}, after:{lat:300, err:.2, load:60}, flow:[['user', 'cdn', 'static'], ['user', 'lb', 'POST /book'], ['lb', 'app']], lesson:['cdn', 'lb-l4-vs-l7']},
    {title:'One berth, many journeys', scale:'Indian Railways', hot:['db'], breaks:'<p>A train from Mumbai to Howrah stops at 30 stations. Selling a berth for the whole run to someone going Mumbai → Nashik wastes it for the remaining 1,900 km. Quotas (Tatkal, ladies, senior citizen, VIP) and RAC complicate it further.</p>', fix:'<p>A <b>seat allocator</b> that books berths per <b>journey segment</b>: a berth is a row of segment slots, and a booking claims the slots from boarding to destination. Allocation picks a berth whose free stretch fits the journey, honours quotas and preferences, and updates availability counts. The simulator in Deep dives compares allocation rules with the offline optimum.</p>', before:{lat:500, err:1, load:80}, after:{lat:300, err:.2, load:60}, flow:[['app', 'alloc', 'Pune → Nagpur, 3A, lower'], ['alloc', 'db', 'claim segments 4–9 on B2-23'], ['alloc', 'avail', 'update counts']], lesson:['indexes', 'tradeoff-thinking']},
    {title:'10:00:00 Tatkal: 100× in one minute', scale:'Tatkal minute', hot:['lb', 'app'], breaks:'<p>Millions log in at 9:59 and click Book at 10:00:00. Login, search and booking all spike together; servers queue requests until they time out, and retries double the load.</p>', fix:'<p>A <b>virtual waiting room</b>: users who arrive get a queue position (served as a static page with a token) and are admitted at the rate the booking tier can complete. Booking capacity is spent on admitted users only; everyone else waits fairly instead of hammering refresh.</p>', before:{lat:8000, err:20, load:500}, after:{lat:400, err:.5, load:85}, flow:[['user', 'wr', 'position #18,422'], ['wr', 'lb', 'admitted (token)'], ['lb', 'app']], lesson:['load-shedding', 'rate-limiting', 'backpressure']},
    {title:'Bots and agents grab Tatkal in seconds', scale:'adversarial', hot:['wr', 'app'], breaks:'<p>Scripts fill passenger details and pay in under a second; agents book in bulk the moment the window opens. Ordinary travellers see “waitlisted” instantly.</p>', fix:'<p>Rules and checks: <b>agents are barred</b> from the first 30 minutes of the Tatkal window, online Tatkal requires <b>Aadhaar-authenticated</b> accounts (with OTP), plus CAPTCHA, per-account and per-IP limits, and anomaly detection on booking speed. The waiting room admits only verified sessions.</p>', sub:{wr:'verified users only', lb:'per-account limits'}, before:{lat:500, err:4, load:150}, after:{lat:400, err:.4, load:85}, flow:[['user', 'wr', 'OTP-verified session'], ['wr', 'lb']], lesson:['authn-vs-authz', 'ddos-basics']},
    {title:'Paid, but the booking failed', scale:'1M payments/day', hot:['app', 'db'], breaks:'<p>The payment succeeds but the booking server crashes, or the hold expired a second earlier. Money is taken with no ticket, and support queues explode after every Tatkal window.</p>', fix:'<p>A booking <b>saga</b>: hold → pay → confirm, each step idempotent on a booking id. Payment results arrive as events on a <b>per-train booking queue</b> processed in order by the allocator, which confirms the held seat (or any equivalent seat); if none is left, it issues an <b>automatic refund</b> or a waitlist ticket. Nothing depends on the user’s browser surviving.</p>', before:{lat:900, err:2, load:80}, after:{lat:350, err:.1, load:70}, flow:[['pay', 'queue', 'payment.success (booking id)'], ['app', 'queue', 'confirm request'], ['queue', 'alloc', 'in order, per train']], lesson:['saga-outbox', 'ordering-dlq', 'idempotency-rate-limit-headers']},
    {title:'Cancellations and the waitlist', scale:'every train', hot:['alloc'], breaks:'<p>When someone cancels, the freed berth should go to the first RAC or waitlisted passenger for overlapping segments, and they must be told. Doing it manually, or only at chart time, leaves seats empty.</p>', fix:'<p>On cancellation, the allocator frees the segment slots and immediately <b>promotes</b> RAC and waitlisted bookings in order where the freed segments cover their journey, then publishes events to an <b>SMS / e-ticket</b> service. The final chart is prepared a few hours before departure.</p>', before:{lat:400, err:1, load:70}, after:{lat:300, err:.1, load:60}, flow:[['alloc', 'db', 'free B2-23 seg 4–9 · promote WL 1'], ['alloc', 'notif', 'PNR 845… confirmed: B2-23']], lesson:['event-driven', 'push-notifications']}],
  flows:[
    {name:'Book a Tatkal ticket', steps:[
      {note:'At 10:00 the traveller is queued and admitted with a token; static pages come from the CDN.', flow:[['user', 'cdn', 'static'], ['user', 'wr', 'join queue'], ['wr', 'lb', 'admitted'], ['lb', 'app']]},
      {note:'Availability comes from the cached counts.', flow:[['app', 'avail', '3A Tatkal: 41 left']]},
      {note:'The chosen berth is held for 5 minutes; it vanishes from availability.', flow:[['app', 'hold', 'SET NX EX 300 B2-23']]},
      {note:'The traveller pays; the result arrives as an event.', flow:[['app', 'pay', 'collect'], ['pay', 'queue', 'payment.success']]},
      {note:'The allocator confirms the held berth for the journey segments, in order per train, and updates counts.', flow:[['queue', 'alloc'], ['alloc', 'db', 'PNR · segments 4–9'], ['alloc', 'avail', 'counts −1']]},
      {note:'The e-ticket and SMS go out.', flow:[['alloc', 'notif', 'PNR 845… CNF B2-23']]}]},
    {name:'Hold expires', steps:[
      {note:'A traveller holds a berth but abandons payment.', flow:[['app', 'hold', 'SET NX EX 300']]},
      {note:'After 5 minutes the hold key expires; the berth is free again.', flow:[['app', 'avail', 'counts +1']]},
      {note:'The next admitted traveller can book it.', flow:[['user', 'lb', 'book'], ['lb', 'app'], ['app', 'hold', 'SET NX → OK']]}]},
    {name:'Cancellation → waitlist promoted', steps:[
      {note:'A confirmed passenger cancels.', flow:[['user', 'lb', 'cancel PNR'], ['lb', 'app'], ['app', 'queue', 'cancel request']]},
      {note:'The allocator frees the segments and promotes the first waitlisted booking that fits.', flow:[['queue', 'alloc'], ['alloc', 'db', 'free + promote WL 1']]},
      {note:'Both passengers are notified; refunds are issued per the rules.', flow:[['alloc', 'notif', 'refund + confirmation SMS'], ['alloc', 'avail', 'counts']]}]}],
  breakIt:[
    {label:'Hold store (Redis) fails', kill:['hold'], verdict:'degrades', text:'Fail closed for new holds (“please retry”) rather than selling without them; a replica takes over. Existing bookings are safe in the database; held-but-unpaid seats return when holds are rebuilt or expire.'},
    {label:'Payment gateway slow', hot:['pay'], verdict:'degrades', text:'Holds may expire before payment completes; the saga then books any equivalent free seat or refunds automatically. Extend holds while a payment is known to be in progress.'},
    {label:'Allocator crashes', kill:['alloc'], verdict:'survives', text:'Payment events wait in the per-train queue; nothing is lost. On restart it processes them in order from the last committed offset; idempotency on booking id prevents double bookings.'},
    {label:'Availability cache wrong', hot:['avail'], verdict:'survives', text:'Users may see “23 available” when 20 are; booking checks the database, so the worst case is a clear “seat just taken, pick another”. Counts are rebuilt from the database.'},
    {label:'Waiting room overwhelmed', hot:['wr'], verdict:'degrades', text:'The queue page is static on the CDN and admission is a cheap token check, so it holds; at worst admission slows down. The booking tier stays protected.'},
    {label:'Inventory DB primary fails', kill:['db'], verdict:'fails', text:'Bookings stop until a replica is promoted (seconds to minutes). Holds and queued payment events survive, so confirmations resume afterwards; this is why the database runs with synchronous standby replicas.'}],
  dataModel:{lang:'sql', title:'berths × segments, holds and bookings', code:`-- One row per (train run, berth, segment): a booking claims a contiguous range of segments
CREATE TABLE berth_segments (
  run_id     BIGINT,          -- train number + journey date
  berth      VARCHAR(8),      -- 'B2-23'
  seg        SMALLINT,        -- 0 = station 1 → 2, 1 = station 2 → 3, …
  quota      VARCHAR(4),      -- GN | TQ (Tatkal) | LD | SS …
  booking_id CHAR(26),        -- NULL = free
  PRIMARY KEY (run_id, berth, seg)
);
-- Book Pune(4) → Nagpur(10): claim 4..9 only if all are free, in one transaction
-- UPDATE berth_segments SET booking_id = :b
--  WHERE run_id = :r AND berth = :berth AND seg BETWEEN 4 AND 9 AND booking_id IS NULL;
--  → must update exactly 6 rows, else ROLLBACK and try another berth

CREATE TABLE bookings (
  booking_id CHAR(26) PRIMARY KEY, pnr CHAR(10) UNIQUE, run_id BIGINT, user_id BIGINT,
  from_stn SMALLINT, to_stn SMALLINT, status VARCHAR(8),   -- HELD | CNF | RAC | WL | CAN
  wl_pos INT, payment_ref VARCHAR(40), created_at TIMESTAMP
);
-- Redis holds:  hold:{run}:{berth} → booking_id  (SET NX EX 300)`, notes:'Modelling segments as rows makes “sell this berth for stations 4 to 10” a single conditional update whose row count proves no overlap. Cinemas are the special case with one segment.'},
  apis:[
    {m:'POST', path:'/v1/holds', note:'Requires an admission token during Tatkal; returns the hold expiry.', req:'{ "run": "12129-2026-11-20", "class": "3A", "from": "PUNE", "to": "NGP", "berth_pref": "LB", "passengers": 1 }', res:'{ "booking_id": "01JD7…", "berth": "B2-23", "expires_in_s": 300 }'},
    {m:'POST', path:'/v1/bookings/{id}/confirm', note:'Called by the payment-success event (not the browser); idempotent.', req:'{ "payment_ref": "UPI/431812…" }', res:'{ "pnr": "8451203367", "status": "CNF", "berth": "B2-23" }'},
    {m:'GET', path:'/v1/availability?run=…&class=3A&quota=TQ', note:'Served from cached counts; may be seconds stale.', res:'{ "status": "AVAILABLE-0041", "updated_ms_ago": 1800 }'}],
  algorithm:{title:'Holds with expiry, and berths per segment', html:'<p>Two algorithms carry ticketing. <b>Timed holds</b> (a lease on a seat) prevent “paid but no seat” without locking seats forever: the hold time trades refunds against seats wasted by people who walk away. <b>Segment allocation</b> lets one berth carry several passengers on one run, which is an interval-scheduling problem: online rules can’t always match what is possible with hindsight. Both are simulated below.</p>', mount:host => { holdSim(host); host.append(hr()); segSim(host); }},
  tradeoffs:[['Seat holds with a TTL', 'No charging for seats that are gone', 'Abandoned holds block seats until they expire'], ['Cached availability counts', 'Cheap reads for the 100:1 read load', 'Seconds of staleness; a few “just taken” surprises'], ['Waiting room at the Tatkal minute', 'Booking tier stays healthy; fair ordering', 'Everyone waits; it must itself be cheap and bot-proof'], ['Per-train ordered booking queue', 'Serialises confirmations where conflicts live', 'One very hot train is limited by one partition’s throughput'], ['Segment-level inventory', 'Far better berth utilisation', 'More rows and more complex allocation and quotas']],
  alternatives:[['Pessimistic DB locks during payment', 'Correct, but holds database locks for minutes: throughput collapses'], ['Optimistic: pay first, assign at the end', 'Simple, but at Tatkal scale thousands pay for nothing and need refunds'], ['Lottery for oversubscribed trains', 'Fair and calm, but not instant; possible for festival specials'], ['Whole-run berth booking', 'Simple, but wastes capacity on multi-stop trains']],
  failures:[['Hold store', 'Fail closed; rebuild or let holds expire'], ['Payment gateway', 'Saga: equivalent seat or automatic refund'], ['Allocator', 'Queue buffers; ordered, idempotent replay'], ['Availability cache', 'Rebuild from DB; booking checks are authoritative'], ['DB primary', 'Synchronous standby; queued events replay']],
  lab:{stack:['Node.js / Spring Boot', 'Postgres', 'Redis (holds with TTL)', 'Kafka or Redpanda (partition per train)', 'A mock payment gateway', 'k6'], milestones:[
    {day:'Day 1: correctness', items:['Seats table with a unique constraint; reproduce the double-booking race without it', 'FOR UPDATE SKIP LOCKED seat picking', 'Redis holds with SET NX EX; seats disappear from availability while held', 'Cached availability counts updated on commit']},
    {day:'Day 2: payment saga', items:['Hold → pay → confirm with booking ids as idempotency keys', 'Payment webhooks to a per-train queue; confirm in order', 'Expired hold + late payment → equivalent seat or automatic refund', 'Prove: 0 double bookings, 0 paid-without-ticket after a crash test']},
    {day:'Day 3: the Tatkal minute', items:['Waiting room: token issuance at N per second, static queue page', 'Segment-level berths for a 10-station train; implement first-fit and best-fit', 'k6: 20K users at 10:00:00 for 300 seats; measure refunds, unsold seats, p99', 'Tune the hold TTL and plot refunds vs unsold seats']}],
   pseudocode:{lang:'ts', code:`// Hold a berth for a journey (segments a..b-1), then confirm on payment
async function hold(run: string, from: number, to: number, user: string) {
  for (const berth of await alloc.candidates(run, from, to)) {          // best-fit order
    const ok = await redis.set(\`hold:\${run}:\${berth}:\${from}-\${to}\`, user, 'NX', 'EX', 300);
    if (!ok) continue;                                                 // someone else is holding it
    if (await segmentsFree(run, berth, from, to)) return { berth, expiresIn: 300 };
    await redis.del(\`hold:\${run}:\${berth}:\${from}-\${to}\`);
  }
  return { waitlist: await waitlist.position(run, from, to) };
}

async function onPaymentSuccess(e: { bookingId: string; run: string }) { // per-train partition, in order
  if (await bookings.isConfirmed(e.bookingId)) return;                // idempotent replay
  const b = await bookings.get(e.bookingId);
  const claimed = await db.claimSegments(b.run, b.berth, b.from, b.to, b.id);  // exact row count or rollback
  if (claimed) return bookings.confirm(b.id);
  const alt = await alloc.anyFree(b.run, b.from, b.to);               // hold expired: try an equivalent berth
  return alt ? bookings.confirm(b.id, alt) : refunds.issue(b.id);      // never paid-without-ticket
}`},
   loadTest:'<p>Simulate 20,000 users arriving within 60 s for 300 berths: 25% abandon, payments take 40–240 s. Compare pay-first vs holds with TTLs of 2, 5 and 10 minutes: count refunds, unsold berths at the end and time to ticket. Then crash the allocator during the run and verify no double bookings and no paid-without-ticket.</p>'},
  twists:[
    {q:'How long should a hold last?', a:'Long enough for almost all real payments to finish (look at the p95–p99 of payment times, including UPI approvals on another app), but short enough that abandoned holds return quickly. Extend a hold while a payment is verifiably in progress, and show a visible countdown. The hold simulator shows the trade-off: shorter holds mean more “paid after expiry” cases; longer ones mean more seats blocked by people who left.'},
    {q:'Two users click the same seat on a BookMyShow seat map at the same time. What does each see?', a:'Both send a hold request; SET NX succeeds for exactly one. The other gets “seat just taken” and the seat map refreshes (seat maps are pushed or polled every few seconds, so they’re slightly stale by design). Correctness comes from the atomic hold, not from the seat map.'},
    {q:'Why might Tatkal booking slow down even with plenty of servers?', a:'Contention, not capacity: everyone wants the same few trains, so writes concentrate on a handful of rows and partitions. Adding servers doesn’t help a hot partition. Waiting rooms (to cap concurrency), holds in a fast store, per-train ordered processing and pre-computed availability are the levers.'}],
  real:[
    {co:'Tatkal rules', tier:'confirmed', text:'Tatkal bookings open one day before the journey, at 10:00 for AC classes and 11:00 for non-AC classes; authorised agents are barred from booking in the first 30 minutes of each window.', src:'IRCTC / Indian Railways Tatkal booking rules'},
    {co:'Aadhaar for Tatkal', tier:'confirmed', text:'From July 2025, online Tatkal bookings on the IRCTC website and app are limited to Aadhaar-authenticated users, with OTP-based authentication added shortly after.', src:'Ministry of Railways announcements (June–July 2025)'},
    {co:'CRIS', tier:'confirmed', text:'The Centre for Railway Information Systems (CRIS) develops and runs Indian Railways’ passenger reservation systems, which IRCTC’s e-ticketing uses.', src:'CRIS and Indian Railways public information'},
    {co:'BookMyShow', tier:'confirmed', text:'BookMyShow holds selected seats with a countdown during checkout, and used a virtual queue for the 2024 Coldplay India ticket sale, which drew demand far beyond supply.', src:'BookMyShow product behaviour; news coverage of the Coldplay India sale (September 2024)'},
    {co:'Internal architectures', tier:'inference', text:'IRCTC’s and BookMyShow’s internal designs aren’t described here; holds in a fast store, per-train queues and a waiting room are reasonable inferences for these requirements.', src:'This case study'},
    {co:'Simulators', tier:'educational', text:'The hold simulator and segment allocator are teaching models with illustrative inputs; real allocation includes quotas, preferences, RAC and charting.', src:'This case study’s models'}],
  sources:['IRCTC / Indian Railways — Tatkal booking rules', 'Ministry of Railways — Aadhaar authentication for Tatkal bookings (2025)', 'Gray & Cheriton — Leases: An Efficient Fault-Tolerant Mechanism for Distributed File Cache Consistency (SOSP 1989)', 'Carlisle & Lloyd — On the k-coloring of intervals (Discrete Applied Mathematics, 1995)', 'PostgreSQL documentation — SELECT … FOR UPDATE SKIP LOCKED', 'Redis documentation — SET with NX and EX options', 'AWS Solutions Library — Virtual Waiting Room on AWS']
});
})();
