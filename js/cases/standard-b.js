/* =====================================================================
   PART 13 · STANDARD CASES (b) — Airbnb · Stripe · Slack/Discord ·
   Google Docs (OT vs CRDT) · ChatGPT-style LLM serving
   Each: 6-step evolution, flows, Break-It, compact real simulation
   (pure maths on SDA.standardB for checking).
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, esc, fmtNum, fmtBytes, rng} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const frag = html => document.createRange().createContextualFragment(html);
const hr = () => el('hr', {style:{border:'0', borderTop:'1px solid var(--border)', margin:'18px 0'}});
const note = html => el('p', {class:'lab-hint', html});
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const quantile = (arr, q) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const fmtMs = v => v >= 1000 ? (v / 1000).toFixed(1) + ' s' : Math.round(v) + ' ms';

/* =========================== AIRBNB: AVAILABILITY =========================== */
function makeCalendars(o){
  const R = rng(o.seed || 8), L = [];
  for (let i = 0; i < o.listings; i++){
    const bookings = [], bits = new Uint32Array(12); let d = Math.floor(R() * 10);
    while (d < 365){ const gap = Math.floor(-Math.log(R() || 1e-9) * o.gap), len = 1 + Math.floor(R() * o.maxStay); const s = d + gap, e = Math.min(365, s + len); if (s >= 365) break; bookings.push([s, e]); for (let k = s; k < e; k++) bits[k >> 5] |= 1 << (k & 31); d = e; }
    L.push({bookings, bits});
  }
  return L;
}
function availScan(L, a, b){ let cmp = 0, n = 0; const ok = []; L.forEach((x, i) => { let free = true; for (const [s, e] of x.bookings){ cmp++; if (s < b && a < e){ free = false; break; } } if (free){ n++; ok.push(i); } }); return {n, cmp, ok}; }
function availBits(L, a, b){ let ops = 0, n = 0; const ok = []; const masks = []; for (let w = a >> 5; w <= (b - 1) >> 5; w++){ let m = 0; for (let k = Math.max(a, w * 32); k < Math.min(b, w * 32 + 32); k++) m |= 1 << (k & 31); masks.push([w, m >>> 0]); }
  L.forEach((x, i) => { let free = true; for (const [w, m] of masks){ ops++; if ((x.bits[w] & m) >>> 0){ free = false; break; } } if (free){ n++; ok.push(i); } }); return {n, ops, ok}; }
function availSim(host){
  const P = {listings:5000, gap:6, maxStay:7, seed:8, from:120, nights:4}; let L = makeCalendars(P); const out = el('div');
  function run(){
    const a = P.from, b = Math.min(365, P.from + P.nights), s = availScan(L, a, b), bt = availBits(L, a, b); const same = s.n === bt.n && s.ok.every((v, i) => v === bt.ok[i]);
    const avgBookings = mean(L.map(x => x.bookings.length)); out.innerHTML = '';
    out.append(frag(h.table([`${fmtNum(P.listings)} listings · nights ${a}–${b - 1} of the year`, 'Scan each listing’s bookings', 'Availability bitmap (365 bits)'], [
      ['Listings available', fmtNum(s.n), fmtNum(bt.n)],
      ['Operations', fmtNum(s.cmp) + ' interval comparisons', fmtNum(bt.ops) + ' 32-bit AND checks'],
      ['Storage per listing', `${avgBookings.toFixed(1)} booking rows`, '46 bytes'],
      ['Same answer?', same ? '✓' : '✗', same ? '✓' : '✗']], [1, 2])));
    out.append(el('div', {class:'verdict ok', html:`Search must filter millions of listings by date availability in milliseconds. A 365-bit calendar per listing turns “free for these ${P.nights} nights?” into ${Math.ceil((b - a) / 32) || 1}–2 bitwise ANDs, ${(s.cmp / Math.max(1, bt.ops)).toFixed(1)}× fewer operations than checking booking intervals, and it fits in a search index or cache. Bookings stay the source of truth; the bitmap is a derived index updated when a booking commits.`}));
  }
  host.append(note('Real calendars: each listing gets random bookings (stays of 1–7 nights with random gaps). Both methods answer the same query; the bitmap stores one bit per night.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Check-in day of year', min:0, max:350, value:P.from, onInput:v => { P.from = v; run(); }}).el,
      ui.slider({label:'Nights', min:1, max:14, value:P.nights, onInput:v => { P.nights = v; run(); }}).el,
      ui.slider({label:'Average gap between bookings (days)', min:1, max:30, value:P.gap, onInput:v => { P.gap = v; L = makeCalendars(P); run(); }}).el), out);
  run();
}

/* =========================== STRIPE: IDEMPOTENCY RACE =========================== */
function idemRun(o){
  const R = rng(o.seed || 12), T = o.timeout, BACK = 500, MAXT = 4; const charges = new Array(o.n).fill(0), confirmed = new Array(o.n).fill(false); let attempts = 0, conflicts = 0;
  const procTime = () => R() < o.slow ? 1000 + R() * 5000 : 150 + R() * 650;
  // event loop: events {t, kind, i}
  const ev = []; const push = e => { let lo = 0, hi = ev.length; while (lo < hi){ const m = (lo + hi) >> 1; if (ev[m].t <= e.t) lo = m + 1; else hi = m; } ev.splice(lo, 0, e); };
  const store = new Map(); // key → {state:'progress'|'done', until}
  for (let i = 0; i < o.n; i++) push({t:R() * o.window, kind:'attempt', i, k:1});
  while (ev.length){ const e = ev.shift();
    if (e.kind === 'attempt'){ attempts++; const i = e.i, key = 'k' + i; const st = store.get(key);
      let respAt = null, resp = null;
      if (o.mode === 'none' || !st){
        if (o.mode === 'atomic') store.set(key, {state:'progress'});
        const d = procTime(); charges[i]++; push({t:e.t + d, kind:'done', i, key}); respAt = e.t + d; resp = 'ok';
      } else if (st.state === 'done'){ respAt = e.t + 5; resp = 'ok'; }
      else { conflicts++; respAt = e.t + 5; resp = 'conflict'; }      // atomic: 409 while the first is in progress
      const lost = resp === 'ok' && R() < o.loss;
      if (resp === 'ok' && !lost && respAt - e.t <= T) confirmed[i] = true;
      else if (e.k < MAXT) push({t:(resp === 'conflict' ? respAt : e.t + T) + BACK * e.k, kind:'attempt', i, k:e.k + 1});
    } else if (e.kind === 'done'){ if (o.mode !== 'none') store.set(e.key, {state:'done'}); }
  }
  const dup = charges.filter(c => c > 1).length, extra = charges.reduce((s, c) => s + Math.max(0, c - 1), 0);
  return {n:o.n, attempts, dupIntents:dup, extraCharges:extra, conflicts, unconfirmed:confirmed.filter(x => !x).length, chargedUnconfirmed:charges.filter((c, i) => c > 0 && !confirmed[i]).length};
}
const IDEM = [['none', 'No idempotency key'], ['check', 'Key: look up, then process'], ['atomic', 'Key: atomic insert (in-progress lock)']];
function idemSim(host){
  const P = {n:20000, window:60000, timeout:2000, slow:.1, loss:.03, seed:12}; const out = el('div');
  function run(){
    const res = IDEM.map(([m]) => idemRun(Object.assign({}, P, {mode:m}))); out.innerHTML = '';
    out.append(frag(h.table([`${fmtNum(P.n)} payments, client timeout ${P.timeout / 1000} s`, ...IDEM.map(x => x[1])], [
      ['Customers charged more than once', ...res.map(r => r.dupIntents ? `<b style="color:var(--bad)">${fmtNum(r.dupIntents)}</b>` : '0')],
      ['Extra charges in total', ...res.map(r => fmtNum(r.extraCharges))],
      ['Requests answered “still processing” (409)', ...res.map(r => fmtNum(r.conflicts))],
      ['API calls made (incl. retries)', ...res.map(r => fmtNum(r.attempts))],
      ['Payments the client never got a confirmation for', ...res.map(r => fmtNum(r.unconfirmed))]], [1, 2, 3])));
    const [a, b, c] = res;
    out.append(el('div', {class:'verdict ' + (c.dupIntents === 0 ? 'ok' : 'warn'), html:`Clients retry when a response is slow or lost. Without a key, every retry is a new charge: <b>${fmtNum(a.dupIntents)}</b> customers paid twice. A key that is only <i>looked up</i> still fails when the retry arrives while the first attempt is still running (the slow ${Math.round(P.slow * 100)}% here): <b>${fmtNum(b.dupIntents)}</b> double charges. Claiming the key atomically before doing any work (a unique insert marking it “in progress”) makes concurrent retries wait with a 409, and gives <b>${fmtNum(c.dupIntents)}</b> duplicates. ${c.unconfirmed ? `The ${fmtNum(c.unconfirmed)} clients that gave up while a slow charge was still running aren’t lost: they fetch the final result later with the same key, and a webhook tells the merchant.` : ''}`}));
  }
  host.append(note('An event-driven simulation of clients calling a charge API. Most charges take 150–800 ms, a slow share takes 1–6 s (card networks), and a few responses are lost. Clients give up waiting after the timeout and retry with backoff (up to 4 attempts) using the same idempotency key.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Slow charges (1–6 s)', min:0, max:.4, step:.02, value:P.slow, fmt:v => Math.round(v * 100) + '%', onInput:v => { P.slow = v; run(); }}).el,
      ui.slider({label:'Lost responses', min:0, max:.2, step:.01, value:P.loss, fmt:v => Math.round(v * 100) + '%', onInput:v => { P.loss = v; run(); }}).el,
      ui.slider({label:'Client timeout', min:500, max:8000, step:250, value:P.timeout, fmt:v => (v / 1000) + ' s', onInput:v => { P.timeout = v; run(); }}).el), out);
  run();
}

/* =========================== DISCORD: REQUEST COALESCING =========================== */
function coalesceRun(o){ // Poisson arrivals λ per second for one hot key, DB latency d ms
  const R = rng(o.seed || 6); let t = 0, n = 0, queries = 0, inflightUntil = -1; const lat = []; const lam = o.lambda / 1000;
  while (true){ t += -Math.log(R() || 1e-9) / lam; if (t > o.duration) break; n++;
    if (!o.coalesce){ queries++; lat.push(o.d); continue; }
    if (t < inflightUntil){ lat.push(inflightUntil - t); } else { queries++; inflightUntil = t + o.d; lat.push(o.d); } }
  return {requests:n, queries, qps:queries / (o.duration / 1000), rps:n / (o.duration / 1000), avgLat:mean(lat)};
}
const coalesceTheory = (lam, d) => ({qps:lam / (1 + lam * d / 1000), avgLat:(d + lam * d / 1000 * d / 2) / (1 + lam * d / 1000)});
function coalesceSim(host){
  const P = {lambda:5000, d:20, duration:20000, seed:6}; const out = el('div');
  function run(){
    const a = coalesceRun(Object.assign({}, P, {coalesce:false})), b = coalesceRun(Object.assign({}, P, {coalesce:true})), th = coalesceTheory(P.lambda, P.d); out.innerHTML = '';
    out.append(frag(h.table([`One hot channel: ${fmtNum(P.lambda)} reads/s, ${P.d} ms per database read`, 'Every request queries the DB', 'Coalesce identical in-flight requests', 'Theory (coalesced)'], [
      ['Database queries per second', fmtNum(a.qps), fmtNum(b.qps), fmtNum(th.qps)],
      ['Average response time', fmtMs(a.avgLat), fmtMs(b.avgLat), fmtMs(th.avgLat)]], [1, 2, 3])));
    out.append(el('div', {class:'verdict ok', html:`When a message is posted in a huge server, thousands of clients ask for the same thing at once. A data service that <b>coalesces</b> identical requests sends one database query and fans the answer out to everyone waiting: <b>${fmtNum(b.qps)}</b> queries/s instead of ${fmtNum(a.qps)} (theory λ/(1 + λd) = ${fmtNum(th.qps)}), and requests that join an in-flight query even finish sooner on average.`}));
  }
  host.append(note('A Monte Carlo simulation of request coalescing for one hot key (requests arrive as a Poisson process). A request that arrives while an identical query is in flight waits for that query instead of starting a new one.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Reads per second for the hot channel', min:10, max:50000, step:10, value:P.lambda, fmt:v => fmtNum(v), onInput:v => { P.lambda = v; run(); }}).el,
      ui.slider({label:'Database read latency', min:1, max:200, value:P.d, fmt:v => v + ' ms', onInput:v => { P.d = v; run(); }}).el), out);
  run();
}

/* =========================== GOOGLE DOCS: OT =========================== */
const applyOp = (s, op) => op.t === 'ins' ? s.slice(0, op.p) + op.ch + s.slice(op.p) : op.t === 'del' ? s.slice(0, op.p) + s.slice(op.p + 1) : s;
function transform(a, b){ // a transformed against concurrent b (both made on the same document)
  if (a.t === 'noop' || b.t === 'noop') return Object.assign({}, a);
  if (a.t === 'ins' && b.t === 'ins') return (a.p < b.p || (a.p === b.p && a.site < b.site)) ? Object.assign({}, a) : Object.assign({}, a, {p:a.p + 1});
  if (a.t === 'ins' && b.t === 'del') return a.p <= b.p ? Object.assign({}, a) : Object.assign({}, a, {p:a.p - 1});
  if (a.t === 'del' && b.t === 'ins') return a.p < b.p ? Object.assign({}, a) : Object.assign({}, a, {p:a.p + 1});
  if (a.p < b.p) return Object.assign({}, a); if (a.p > b.p) return Object.assign({}, a, {p:a.p - 1}); return {t:'noop'}; // both deleted the same character
}
function otFuzz(n, seed){
  const R = rng(seed || 5), A = 'ABCDEFGH'; let naive = 0, ot = 0;
  const rop = (len, site) => R() < .55 || len === 0 ? {t:'ins', p:Math.floor(R() * (len + 1)), ch:A[Math.floor(R() * 8)], site} : {t:'del', p:Math.floor(R() * len), site};
  for (let i = 0; i < n; i++){ const len = Math.floor(R() * 8); let s = ''; for (let k = 0; k < len; k++) s += 'abcdefgh'[Math.floor(R() * 8)];
    const a = rop(len, 1), b = rop(len, 2);
    if (applyOp(applyOp(s, a), b) !== applyOp(applyOp(s, b), a)) naive++;
    if (applyOp(applyOp(s, a), transform(b, a)) !== applyOp(applyOp(s, b), transform(a, b))) ot++; }
  return {n, naive, ot};
}
function otSim(host){
  const P = {doc:'CHAI', a:{t:'ins', p:3, ch:'X'}, b:{t:'del', p:1}}; const out = el('div');
  const opSel = (who, init) => { const box = el('div', {class:'ctl-grid'}); const kind = ui.select({label:`${who}: operation`, value:init.t, options:[['ins', 'Insert a character'], ['del', 'Delete a character']], onChange:() => sync()}); const pos = ui.slider({label:`${who}: position`, min:0, max:8, value:init.p, onInput:() => sync()}); const ch = ui.select({label:`${who}: character`, value:init.ch || 'X', options:['!', 'X', 'Y', 'S', 'M'], onChange:() => sync()}); box.append(kind.el, pos.el, ch.el); return {box, kind, pos, ch}; };
  const ea = opSel('Alice', P.a), eb = opSel('Bob', P.b);
  const show = o => o.t === 'ins' ? `insert “${o.ch}” at ${o.p}` : o.t === 'del' ? `delete at ${o.p}` : 'nothing';
  function sync(){
    const len = P.doc.length; const mk = (e, site) => { const t = e.kind.value; const p = Math.min(+e.pos.value, t === 'ins' ? len : len - 1); return t === 'ins' ? {t, p, ch:e.ch.value, site} : {t, p, site}; };
    const a = mk(ea, 1), b = mk(eb, 2); out.innerHTML = '';
    const nA = applyOp(applyOp(P.doc, a), b), nB = applyOp(applyOp(P.doc, b), a);
    const b2 = transform(b, a), a2 = transform(a, b); const oA = applyOp(applyOp(P.doc, a), b2), oB = applyOp(applyOp(P.doc, b), a2);
    out.append(frag(h.table([`Document “${P.doc}”: Alice ${show(a)}, Bob ${show(b)} at the same time`, 'Alice’s screen', 'Bob’s screen', 'Converged?'], [
      ['Apply the other’s op as received', `<code>${esc(nA)}</code>`, `<code>${esc(nB)}</code>`, nA === nB ? '✓' : '<b style="color:var(--bad)">✗ diverged</b>'],
      [`Transform first (Alice receives “${show(b2)}”, Bob receives “${show(a2)}”)`, `<code>${esc(oA)}</code>`, `<code>${esc(oB)}</code>`, oA === oB ? '✓' : '✗']], [3])));
    const f = otFuzz(5000, 5);
    out.append(el('div', {class:'verdict ' + (f.ot === 0 ? 'ok' : 'bad'), html:`Fuzz test of 5,000 random concurrent pairs: applying operations as received diverged <b>${fmtNum(f.naive)}</b> times; transforming them first diverged <b>${f.ot}</b> times. An operation’s position is only meaningful against the document it was made on, so a concurrent edit before it must shift it.`}));
  }
  host.append(note('Operational transformation (OT) for single-character inserts and deletes. Both people start from the same document and edit at the same moment; each then receives the other’s operation. Ties between inserts at the same position are broken by site id.'), ea.box, eb.box, out);
  sync();
}

/* =========================== LLM SERVING: BATCHING & KV CACHE =========================== */
function llmRun(o){
  const R = rng(o.seed || 31), B = o.batch, stepMs = b => o.base + o.perSeq * b; const reqs = []; let t = 0;
  while (true){ t += -Math.log(R() || 1e-9) / (o.lambda / 1000); if (t > o.duration) break; reqs.push({arr:t, prompt:100 + Math.floor(R() * 1400), out:Math.max(10, Math.min(1500, Math.round(-Math.log(R() || 1e-9) * o.meanOut))), done:0}); }
  let now = 0, next = 0; const wait = [], active = []; let busySlots = 0, steps = 0, tokens = 0; const ttft = [], e2e = [];
  while (next < reqs.length || wait.length || active.length){
    while (next < reqs.length && reqs[next].arr <= now) wait.push(reqs[next++]);
    if (o.mode === 'continuous' || active.length === 0){ while (active.length < B && wait.length) active.push(wait.shift()); }
    if (!active.length){ now = reqs[next].arr; continue; }
    const fresh = active.filter(r => r.done === 0); const prefill = fresh.reduce((s, r) => s + r.prompt * o.prefillMs, 0);
    const live = active.filter(r => r.done < r.out).length; const dt = stepMs(o.mode === 'static' ? active.length : live) + prefill; now += dt; steps++; busySlots += live;
    for (const r of active){ if (r.done < r.out){ r.done++; tokens++; if (r.done === 1){ r.first = now; ttft.push(now - r.arr); } if (r.done === r.out){ r.fin = now; e2e.push(now - r.arr); } } }
    if (o.mode === 'continuous'){ for (let k = active.length - 1; k >= 0; k--) if (active[k].done >= active[k].out) active.splice(k, 1); }
    else if (active.every(r => r.done >= r.out)) active.length = 0;     // static: the batch ends when its longest sequence ends
  }
  return {requests:reqs.length, tokens, throughput:tokens / (now / 1000), ttftP50:quantile(ttft, .5), ttftP95:quantile(ttft, .95), e2eP95:quantile(e2e, .95), util:busySlots / Math.max(1, steps * B), makespan:now};
}
const MODELS = {l3_8:{label:'Llama 3 8B', layers:32, kvHeads:8, headDim:128, params:8e9}, l2_13:{label:'Llama 2 13B (no GQA)', layers:40, kvHeads:40, headDim:128, params:13e9}, l2_70:{label:'Llama 2 70B', layers:80, kvHeads:8, headDim:128, params:70e9}};
function kvCalc(o){ const m = MODELS[o.model]; const perTok = 2 * m.layers * m.kvHeads * m.headDim * o.kvBytes; const weights = m.params * o.wBytes; const free = o.gpuGB * 1e9 - weights;
  return {perTok, weights, free, paged:free > 0 ? Math.floor(free / (perTok * o.avgCtx)) : 0, prealloc:free > 0 ? Math.floor(free / (perTok * o.maxCtx)) : 0}; }
function llmSim(host){
  const P = {lambda:2, batch:32, base:18, perSeq:.6, prefillMs:.04, meanOut:250, duration:240000, seed:31}; const out = el('div');
  function run(){
    const s = llmRun(Object.assign({}, P, {mode:'static'})), c = llmRun(Object.assign({}, P, {mode:'continuous'})); out.innerHTML = '';
    out.append(frag(h.table([`${P.lambda} requests/s, batch of ${P.batch}, mean answer ${P.meanOut} tokens`, 'Static batching', 'Continuous batching'], [
      ['Tokens generated per second', fmtNum(s.throughput), fmtNum(c.throughput)],
      ['Time to first token p50 / p95', fmtMs(s.ttftP50) + ' / ' + fmtMs(s.ttftP95), fmtMs(c.ttftP50) + ' / ' + fmtMs(c.ttftP95)],
      ['Full answer p95', fmtMs(s.e2eP95), fmtMs(c.e2eP95)],
      ['Batch slots doing useful work', (s.util * 100).toFixed(0) + '%', (c.util * 100).toFixed(0) + '%'],
      ['Time to serve this traffic', fmtMs(s.makespan), fmtMs(c.makespan)]], [1, 2])));
    out.append(el('div', {class:'verdict ' + (c.ttftP95 < s.ttftP95 ? 'ok' : 'warn'), html:`Answers have very different lengths. With <b>static batching</b> a batch runs until its longest answer finishes: short answers leave idle slots (${(s.util * 100).toFixed(0)}% useful) and new requests wait for the whole batch, so time to first token reaches ${fmtMs(s.ttftP95)} at p95. <b>Continuous batching</b> (iteration-level scheduling) lets finished sequences leave and waiting ones join at every step: ${(c.util * 100).toFixed(0)}% useful slots and a p95 first token of <b>${fmtMs(c.ttftP95)}</b>.`}));
  }
  host.append(note('A step-by-step simulation of one GPU decoding answers. Each decode step costs a fixed overhead plus a little per sequence in the batch; new sequences also pay a prefill cost proportional to their prompt. Requests arrive as a Poisson process with prompt lengths of 100–1,500 tokens and long-tailed answer lengths. All timings are illustrative.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Requests per second', min:.5, max:6, step:.5, value:P.lambda, onInput:v => { P.lambda = v; run(); }}).el,
      ui.slider({label:'Max batch size', min:4, max:128, step:4, value:P.batch, onInput:v => { P.batch = v; run(); }}).el,
      ui.slider({label:'Mean answer length', min:50, max:800, step:10, value:P.meanOut, fmt:v => v + ' tokens', onInput:v => { P.meanOut = v; run(); }}).el), out);
  run();
}
function kvSim(host){
  const P = {model:'l3_8', kvBytes:2, wBytes:2, gpuGB:80, avgCtx:1200, maxCtx:8192}; const out = el('div');
  function run(){
    const r = kvCalc(P), m = MODELS[P.model]; out.innerHTML = '';
    out.append(frag(h.table(['Quantity', 'Value'], [
      ['KV cache per token', `2 × ${m.layers} layers × ${m.kvHeads} KV heads × ${m.headDim} dims × ${P.kvBytes} B = <b>${fmtBytes(r.perTok)}</b>`],
      ['Model weights', fmtBytes(r.weights)], ['Memory left for KV cache', r.free > 0 ? fmtBytes(r.free) : '<b style="color:var(--bad)">none: the model needs more GPUs</b>'],
      [`Concurrent sequences, reserving max context (${fmtNum(P.maxCtx)} tokens) each`, fmtNum(r.prealloc)],
      [`Concurrent sequences, paged (actual ~${fmtNum(P.avgCtx)} tokens each)`, fmtNum(r.paged)]], [1])));
    out.append(el('div', {class:'verdict ' + (r.free > 0 ? 'ok' : 'bad'), html:r.free > 0 ? `Batch size is limited by KV-cache memory, not compute. Reserving the maximum context for every request wastes most of it; allocating the cache in small pages as tokens are generated (PagedAttention) fits <b>${(r.paged / Math.max(1, r.prealloc)).toFixed(1)}×</b> more concurrent sequences on the same GPU.` : 'The weights alone exceed GPU memory: shard the model across GPUs (tensor parallelism) or quantise it.'}));
  }
  host.append(note('Exact arithmetic from published model shapes. Each generated token stores a key and a value vector per layer per KV head.'),
    el('div', {class:'ctl-grid'},
      ui.select({label:'Model', value:P.model, options:Object.entries(MODELS).map(([k, v]) => [k, v.label]), onChange:v => { P.model = v; run(); }}).el,
      ui.select({label:'GPU memory (total)', value:String(P.gpuGB), options:[['24', '24 GB'], ['80', '80 GB'], ['160', '2 × 80 GB'], ['640', '8 × 80 GB']], onChange:v => { P.gpuGB = +v; run(); }}).el,
      ui.select({label:'KV-cache precision', value:String(P.kvBytes), options:[['2', 'FP16 (2 bytes)'], ['1', 'FP8 (1 byte)']], onChange:v => { P.kvBytes = +v; run(); }}).el,
      ui.slider({label:'Average tokens per conversation', min:200, max:8000, step:100, value:P.avgCtx, onInput:v => { P.avgCtx = v; run(); }}).el), out);
  run();
}
SDA.standardB = {makeCalendars, availScan, availBits, idemRun, coalesceRun, coalesceTheory, applyOp, transform, otFuzz, llmRun, kvCalc, MODELS};
/* ======================= AIRBNB ======================= */
SDA.register({kind:'case', id:'airbnb', tier:'standard', icon:'🏡', title:'Airbnb (stays marketplace)', tagline:'Search by place and dates, never double-book a night, and pay hosts in 190 currencies.', tags:['marketplace', 'search', 'availability', 'double booking', 'payments', 'ranking', 'soa'],
  modules:['search', 'databases', 'distributed', 'architecture'],
  summary:'Airbnb is a two-sided marketplace where hosts list homes and guests search by place and dates, then book and pay. The hard parts are search that knows availability, never double-booking a night, and safe payments in many currencies.',
  accuracy:'Airbnb has published its move from a Ruby on Rails monolith to services, its search ranking work (embeddings and deep learning papers), its idempotency library for payments (Orpheus), and the fact that it created Apache Airflow. These facts are marked confirmed. The availability index and the booking rule shown here are inference. The numbers are illustrative unless marked.',
  overview:{what:'<b>A small example.</b> Neha searches “Goa, 20 to 24 Dec, 4 guests” and sees villas that are free on those nights, ranked for her. She books one and pays in rupees. The host in Portugal is paid in euros after check-in.', in:['Listing search with geo and date filters', 'Availability calendars', 'Booking without double-booking', 'Payments, payouts and idempotency', 'Ranking'], out:['Reviews and trust & safety in depth', 'Pricing suggestions for hosts', 'Experiences', 'Customer support tooling']},
  challenges:['Search must filter by date availability across millions of listings', 'Two guests can book the same nights at the same moment', 'Payments in many currencies, with payouts days later', 'A monolith slows down hundreds of engineers', 'Ranking must work for guests and also be fair to hosts'],
  fr:['Search listings by location, dates and guests', 'View a listing and its calendar', 'Book (instant or request-to-book) and pay', 'Hosts manage calendars and receive payouts', 'Cancellations and refunds'],
  nfr:['99 of 100 searches finish in a few hundred ms (illustrative)', 'No double bookings, ever', 'Each charge and payout happens exactly once', 'Availability in search may lag by seconds, but booking is exact', 'Global: many currencies and rules'],
  scale:[{k:'Active listings', v:'7M+', math:'From Airbnb’s public reports (2023 to 2024)', tag:'public'}, {k:'Calendar data', v:'≈ 320 MB', math:'7M listings × 365 bits (one per night) ÷ 8 = 319 MB as availability bitmaps', tag:'illustrative'}, {k:'Searches a second at peak', v:'≈ 20K', math:'Say 1.7B searches a day ÷ 86,400 s ≈ 20,000 a second', tag:'illustrative'}, {k:'Bookings a second at peak', v:'≈ 100', math:'If about 200 searches lead to 1 booking: 20,000 ÷ 200 = 100', tag:'illustrative'}],
  arch:{w:930, h:390, minW:640, nodes:[
    {id:'guest', type:'client', label:'Guest app', x:70, y:120, w:110},
    {id:'host', type:'client', label:'Host app', x:70, y:290, w:110},
    {id:'lb', type:'lb', label:'API gateway', x:240, y:195, w:130, stage:2},
    {id:'search', type:'service', label:'Search', sub:'geo + dates', x:430, y:55, w:140, stage:1},
    {id:'app', type:'service', label:'Backend', sub:'Rails monolith', x:430, y:195, w:150},
    {id:'db', type:'db', label:'MySQL', sub:'listings, bookings', x:430, y:335, w:150},
    {id:'avail', type:'cache', label:'Availability', sub:'365-bit calendars', x:640, y:55, w:160, stage:1},
    {id:'book', type:'service', label:'Booking service', sub:'no-overlap writes', x:640, y:195, w:160, stage:3},
    {id:'pay', type:'service', label:'Payments', sub:'idempotent, FX', x:640, y:335, w:150, stage:4},
    {id:'rank', type:'service', label:'Ranking ML', sub:'embeddings', x:840, y:195, w:140, stage:5}],
   edges:[{from:'guest', to:'app', gone:2}, {from:'host', to:'app', gone:2}, {from:'app', to:'db'},
     {from:'app', to:'search', stage:1}, {from:'search', to:'avail', stage:1},
     {from:'guest', to:'lb', stage:2}, {from:'host', to:'lb', stage:2}, {from:'lb', to:'app', stage:2},
     {from:'app', to:'book', stage:3}, {from:'book', to:'db', stage:3}, {from:'book', to:'avail', stage:3},
     {from:'book', to:'pay', stage:4},
     {from:'search', to:'rank', stage:5}]},
  evolution:[
    {title:'One server + one database', scale:'a few cities', fix:'<p>A Rails app and a MySQL database hold listings, calendars, bookings and payments in one schema. Search is SQL with a distance filter and a NOT EXISTS check over the bookings.</p>', after:{lat:300, err:.2, load:20}},
    {title:'“Goa, 20–24 Dec” scans every booking', scale:'1M listings', hot:['db'], breaks:'<p>Every search checks each candidate listing’s bookings for an overlap with the dates. This heavy query runs thousands of times a second.</p>', fix:'<p>A dedicated <b>search service</b> uses a geo index and an <b>availability index</b>: one bit for each night of each listing. So “free for these nights?” is a couple of bitwise ANDs.</p><p>Bookings stay the source of truth and update the bitmap when they commit.</p>', before:{lat:3000, err:1.5, load:170}, after:{lat:200, err:.1, load:50}, flow:[['app', 'search', 'Goa · 20–24 Dec'], ['search', 'avail', 'AND bitmaps']], lesson:['geospatial', 'indexes', 'elasticsearch']},
    {title:'The monolith slows every team', scale:'1,000 engineers', hot:['app'], breaks:'<p>Hundreds of engineers deploy one Rails app. Builds take an hour, a bug in one feature breaks booking, and everything shares one database.</p>', fix:'<p>Put an <b>API gateway</b> in front of services with clear owners (Airbnb moved from its monolith to services over several years). Each service has its own data.</p>', sub:{app:'presentation services'}, before:{lat:900, err:2, load:90}, after:{lat:250, err:.1, load:55}, flow:[['guest', 'lb', 'GET /search'], ['lb', 'app']], lesson:['monolith-to-microservices', 'strangler-fig']},
    {title:'Two guests book the same nights', scale:'peak season', hot:['db'], breaks:'<p>Two guests see the villa as available and both click “Reserve”. A check-then-insert lets both bookings in for overlapping nights.</p>', fix:'<p>A <b>booking service</b> makes the database enforce the rule. Write one row for each (listing, night) with a unique key, or use an exclusion constraint on date ranges, inside a transaction. The loser gets a clean “just booked” error.</p><p>A short <b>hold</b> covers checkout. The availability bitmap is updated after the commit.</p>', before:{lat:400, err:1, load:60}, after:{lat:300, err:.01, load:55}, flow:[['app', 'book', 'reserve 20–24 Dec'], ['book', 'db', 'INSERT nights (unique)'], ['book', 'avail', 'set bits']], lesson:['transactions-isolation', 'locking']},
    {title:'Paid twice, or paid out twice', scale:'190+ countries', hot:['app'], breaks:'<p>A timeout while charging leads to a retry and a double charge. A payout job crashes halfway and runs again, so some hosts are paid twice. Currency conversion makes it hard to reconcile.</p>', fix:'<p>A <b>payments service</b> gives every charge and payout an <b>idempotency key</b> (Airbnb described its Orpheus library). Each one is recorded in a ledger with the exchange rate used, and checked against the payment processors.</p>', before:{lat:600, err:1.2, load:65}, after:{lat:350, err:.05, load:60}, flow:[['book', 'pay', 'charge (idem key = booking id)']], lesson:['idempotency-rate-limit-headers', 'saga-outbox']},
    {title:'Best results first', scale:'7M listings', hot:['search'], breaks:'<p>Sorting by price or distance shows listings that guests do not book, and hosts with new listings are never seen.</p>', fix:'<p>A <b>ranking</b> step scores the candidates with ML. It uses listing embeddings learned from search sessions and deep models trained on bookings (Airbnb published both), and gives new listings a chance to be seen.</p>', before:{lat:300, err:.8, load:70}, after:{lat:280, err:.1, load:65}, flow:[['search', 'rank', 'score 500 candidates']], lesson:['recommendations', 'vector-search-rag']}],
  flows:[
    {name:'Search and book', steps:[
      {note:'The guest searches. The geo index finds candidates and the bitmaps filter them by date.', flow:[['guest', 'lb', 'search'], ['lb', 'app'], ['app', 'search'], ['search', 'avail', 'free 20–24 Dec?']]},
      {note:'Ranking orders the available listings.', flow:[['search', 'rank', 'score']]},
      {note:'Reserving writes the nights in one step. Overlapping attempts fail cleanly.', flow:[['guest', 'lb', 'reserve'], ['lb', 'app'], ['app', 'book'], ['book', 'db', 'nights (unique)']]},
      {note:'Payment is charged in a way that is safe to retry, and availability is updated.', flow:[['book', 'pay', 'charge'], ['book', 'avail', 'set bits']]}]},
    {name:'Host blocks dates', steps:[
      {note:'The host blocks some nights. The same rule stops them clashing with bookings in progress.', flow:[['host', 'lb', 'block 1–3 Jan'], ['lb', 'app'], ['app', 'book'], ['book', 'db'], ['book', 'avail']]}]}],
  breakIt:[
    {label:'Availability index stale', hot:['avail'], verdict:'survives', text:'Search may show a listing that was just booked. The database checks the booking write, so the guest sees “just booked, try another”. The index is rebuilt from the bookings.'},
    {label:'Ranking service down', kill:['rank'], verdict:'degrades', text:'Fall back to a simple score (distance, rating and price). Search still works.'},
    {label:'Payment processor outage', kill:['pay'], verdict:'degrades', text:'Holds keep the nights for a while. Retry through another processor with the same idempotency key, or release the hold.'},
    {label:'Booking DB primary fails', kill:['db'], verdict:'degrades', text:'Bookings pause for the failover, which takes seconds. Search keeps working from its own index.'}],
  dataModel:{lang:'sql', title:'one row per booked night makes double booking impossible', code:`CREATE TABLE booked_nights (
  listing_id BIGINT, night DATE, booking_id BIGINT NOT NULL,
  PRIMARY KEY (listing_id, night)         -- a second booking for the same night violates the key
);
-- Postgres alternative: EXCLUDE USING gist (listing_id WITH =, daterange(check_in, check_out) WITH &&)
CREATE TABLE bookings (booking_id BIGINT PRIMARY KEY, listing_id BIGINT, guest_id BIGINT, check_in DATE, check_out DATE,
  status TEXT, total_minor BIGINT, currency CHAR(3), idem_key TEXT UNIQUE);
-- Search index: listing_id → geo point, 365-bit availability, price, rating, embedding`, notes:'The unique key turns a race into a constraint error that one transaction loses. The bitmap in search is a copy that is derived from bookings and becomes consistent only eventually.'},
  apis:[
    {m:'GET', path:'/v2/search?place=Goa&checkin=2026-12-20&checkout=2026-12-24&guests=4', res:'{ "results": [ {"listing": 5521, "price_per_night": 9800, "currency": "INR"} ], "cursor": "…" }'},
    {m:'POST', path:'/v2/reservations', note:'Send an Idempotency-Key header. The call returns 409 if any night is taken.', req:'{ "listing": 5521, "checkin": "2026-12-20", "checkout": "2026-12-24", "guests": 4 }', res:'{ "reservation": 99812, "status": "PENDING_PAYMENT", "hold_expires_in_s": 600 }'}],
  algorithm:{title:'Availability bitmaps', html:'<p>A listing’s year is 365 bits. A date range becomes a mask, and “available?” is one or two bitwise ANDs, which is cheap enough to run for every candidate in a search.</p><p>The simulator checks the bitmap against scanning booking intervals (and against a night-by-night truth) on thousands of random calendars.</p>', mount:availSim, pg:'geo'},
  tradeoffs:[['A derived availability index', 'Fast search with dates', 'It is seconds behind, and must be rebuilt from bookings'], ['A no-overlap rule enforced by the database', 'Correct under any amount of concurrency', 'One row for each night (more rows), or an exclusion constraint'], ['Service-oriented architecture', 'Teams are independent and failures stay local', 'Transactions across services, and more operations work'], ['ML ranking', 'More bookings and fairer exposure', 'Training pipelines, and results are harder to explain']],
  alternatives:[['SQL search with NOT EXISTS over bookings', 'Correct, too slow at scale'], ['Distributed lock per listing', 'Works, but a database constraint is simpler and survives crashes'], ['Interval trees per listing', 'Good for long, sparse calendars. Bitmaps are simpler for one year of nights']],
  failures:[['Availability index', 'A database check at booking, and a rebuild'], ['Ranking', 'Simple fallback score'], ['Payments', 'Idempotent retry or release hold'], ['Booking DB', 'Failover, and search is not affected']],
  lab:{stack:['Postgres (with btree_gist)', 'Node.js or Kotlin', 'Redis or OpenSearch for the search index', 'k6'], milestones:[
    {day:'Day 1: search', items:['10K listings with random calendars', 'Geo search + availability bitmaps', 'Compare with a SQL NOT EXISTS query']},
    {day:'Day 2: booking', items:['Reproduce double booking with check-then-insert', 'Fix with unique nights or an exclusion constraint', 'Holds with expiry during checkout']},
    {day:'Day 3: payments', items:['Idempotent charge API keyed by booking id', 'Payout job that is safe to re-run', 'k6: 200 concurrent reservations for the same listing']}],
   pseudocode:{lang:'ts', code:`async function reserve(listingId: number, checkIn: Date, checkOut: Date, guestId: number, idemKey: string) {
  return db.tx(async tx => {
    const existing = await tx.oneOrNone('SELECT booking_id FROM bookings WHERE idem_key = $1', [idemKey]);
    if (existing) return existing;                                   // retry of the same request
    const id = await tx.one('INSERT INTO bookings(...) VALUES(...) RETURNING booking_id', [...]);
    for (const night of nightsBetween(checkIn, checkOut))
      await tx.none('INSERT INTO booked_nights VALUES ($1, $2, $3)', [listingId, night, id]);  // unique → 409 on clash
    return id;
  });                                                                // then update the availability index
}`},
   loadTest:'<p>Fire 200 concurrent reservation requests for overlapping dates on one listing: exactly one must succeed. Then run 2,000 searches/s with random dates and compare p99 for the bitmap index vs SQL.</p>'},
  twists:[{q:'How do you handle a listing that is also listed on another site?', a:'Calendar sync (iCal feeds or channel-manager APIs) blocks nights booked elsewhere. Sync lags, so clashes still happen sometimes. Policies cover a host cancelling, and the booking rule protects your own side.'}, {q:'Why update the search index in the background instead of inside the booking transaction?', a:'The index lives in a different system. Making it part of the transaction would tie booking to the uptime of search. Instead the booking commits, then an event updates the index within seconds. Any stale result is caught at booking time.'}, {q:'How would you pay hosts reliably in many currencies?', a:'Record each booking’s amount and the exchange rate used in a ledger. Run payouts as jobs that are safe to repeat, keyed by (booking, payout type). Check the ledger against the processor and bank statements every day.'}, {q:'A guest wants to book 3 listings for one group trip and pay once. How do you keep it safe?', a:'Treat it as a saga. Hold all 3 listings first, then charge once. If any hold fails, release the others. If the charge fails, release them all. Each step carries an idempotency key, so a retry never double-books or double-charges.'}],
  real:[
    {co:'Airbnb architecture', tier:'confirmed', text:'Airbnb migrated from a Ruby on Rails monolith (“Monorail”) to a service-oriented architecture over several years.', src:'Airbnb Engineering, “Building Services at Airbnb” series (2019–2020)'},
    {co:'Airbnb search ranking', tier:'confirmed', text:'Airbnb published listing embeddings for real-time personalisation (KDD 2018 best paper) and deep learning for search ranking (KDD 2019).', src:'Grbovic & Cheng, “Real-time Personalization using Embeddings for Search Ranking at Airbnb” (KDD 2018), and Haldar et al., “Applying Deep Learning to Airbnb Search” (KDD 2019)'},
    {co:'Airbnb payments', tier:'confirmed', text:'Airbnb built an idempotency library (Orpheus) to avoid double payments in its distributed payments system.', src:'Airbnb Engineering, “Avoiding Double Payments in a Distributed Payments System” (2019)'},
    {co:'Apache Airflow', tier:'confirmed', text:'Airflow, the workflow orchestrator, was created at Airbnb (2014) and donated to Apache.', src:'Apache Airflow project history'},
    {co:'Availability index and booking constraint', tier:'inference', text:'Airbnb’s exact availability and booking design is not described here. Bitmaps and database constraints are a common reference design.', src:'This case study'},
    {co:'Availability simulator', tier:'educational', text:'Random synthetic calendars.', src:'This case study’s model'}],
  sources:['Airbnb Engineering: Building Services at Airbnb (2019–2020)', 'Grbovic & Cheng: Real-time Personalization using Embeddings for Search Ranking at Airbnb (KDD 2018)', 'Haldar et al.: Applying Deep Learning to Airbnb Search (KDD 2019)', 'Airbnb Engineering: Avoiding Double Payments in a Distributed Payments System (2019)', 'PostgreSQL documentation: exclusion constraints and range types']
});

/* ======================= STRIPE ======================= */
SDA.register({kind:'case', id:'stripe', tier:'standard', icon:'💳', title:'Stripe (payments API)', tagline:'An API that moves money must be safe to retry, impossible to double-charge, and auditable to the paisa.', tags:['payments', 'api design', 'idempotency', 'webhooks', 'ledger', 'double-entry', 'versioning', 'migrations'],
  modules:['networking', 'distributed', 'security', 'databases'],
  summary:'Stripe’s product is an API that merchants call over unreliable networks. So every call must be safe to retry, results must reach merchants by webhook, and every movement of money must be recorded in a ledger that always balances.',
  accuracy:'Stripe has written in public about idempotency keys, API versioning, its document database platform with zero-downtime migrations, and its ledger. These facts are marked confirmed. The internal service layout is inference. The numbers are illustrative unless marked.',
  overview:{what:'<b>A small example.</b> A startup’s server calls <code>POST /v1/payment_intents</code> to charge a customer 500 rupees. The network drops the answer, so the server retries with the same idempotency key and gets the same result back. The customer is charged once. Later the startup’s webhook endpoint receives <code>payment_intent.succeeded</code>.', in:['Payments API and idempotency', 'Card network calls with timeouts', 'Webhooks (events to merchants)', 'Double-entry ledger and reconciliation', 'API versioning and database migrations'], out:['Fraud models (Radar) in depth', 'Billing, invoicing, Connect payouts in depth', 'Card issuing', 'Dashboard UI']},
  challenges:['Retries over unreliable networks must never charge twice', 'Card networks are slow and sometimes time out', 'Merchants need the result even if their servers were down', 'Money must always balance and be easy to audit', 'The API and the database must change without breaking anyone'],
  fr:['Create and confirm payments', 'Refunds and disputes', 'Notify merchants of events', 'Report balances and payouts', 'Stable API behaviour per merchant version'],
  nfr:['Exactly-once effects for every mutating call', 'Very high availability (Stripe has cited 99.999% for its databases)', 'Every money movement recorded immutably', 'Events delivered at least once', 'Backward compatibility for years'],
  scale:[{k:'Total payment volume (2024)', v:'≈ $1.4T', math:'From Stripe’s annual letter (2024). $1.4T ÷ 365 ≈ $3.8B a day', tag:'public'}, {k:'API requests at peak', v:'≈ 50K a second', math:'Say $50 for each payment: $3.8B ÷ $50 = 77M payments a day. About 6 API calls each = 460M a day ≈ 5,300 a second on average. Peak is about 10 times that', tag:'illustrative'}, {k:'Ledger entries for each payment', v:'≈ 6 to 10', math:'Authorise, capture, fees, balance transfers and payout: about 8', tag:'illustrative'}, {k:'Webhook deliveries a day', v:'≈ 1B', math:'77M payments × about 13 events (payment, charge, balance and payout updates) ≈ 1B', tag:'illustrative'}],
  arch:{w:860, h:390, minW:640, nodes:[
    {id:'merchant', type:'client', label:'Merchant server', x:70, y:195, w:124},
    {id:'lb', type:'lb', label:'API edge', sub:'auth · limits', x:240, y:195, w:124, stage:2},
    {id:'hooks', type:'service', label:'Webhook sender', sub:'retries, signed', x:240, y:335, w:150, stage:3},
    {id:'idem', type:'cache', label:'Idempotency store', sub:'key → result', x:430, y:55, w:160, stage:1},
    {id:'app', type:'service', label:'API service', sub:'one server', x:430, y:195, w:140},
    {id:'db', type:'db', label:'Payments DB', sub:'document store', x:430, y:335, w:150},
    {id:'net', type:'ext', label:'Card networks', sub:'Visa, RuPay…', x:640, y:55, w:140, stage:1},
    {id:'queue', type:'queue', label:'Events', sub:'event log', x:640, y:195, w:130, stage:3},
    {id:'ledger', type:'db', label:'Ledger', sub:'double-entry', x:640, y:335, w:140, stage:4}],
   edges:[{from:'merchant', to:'app', gone:2}, {from:'app', to:'db'},
     {from:'app', to:'idem', stage:1}, {from:'app', to:'net', stage:1},
     {from:'merchant', to:'lb', stage:2}, {from:'lb', to:'app', stage:2},
     {from:'app', to:'queue', stage:3}, {from:'queue', to:'hooks', stage:3}, {from:'hooks', to:'merchant', stage:3},
     {from:'app', to:'ledger', stage:4}]},
  evolution:[
    {title:'One server + one database', scale:'first merchants', fix:'<p>An API server stores charges in a database and calls a card processor. A merchant’s request either succeeds or fails, and the merchant reads the answer.</p>', after:{lat:600, err:.3, load:20}},
    {title:'Timeouts and retries charge customers twice', scale:'10K merchants', hot:['app'], breaks:'<p>Card networks sometimes take seconds. The merchant’s HTTP client times out and retries, or the answer is lost. Each retry becomes a new charge.</p>', fix:'<p>Use <b>idempotency keys</b>. The merchant sends a unique key for each operation. The server claims the key in one atomic step (“in progress”), does the work once, saves the response, and returns the saved response for any retry.</p><p>A retry that arrives while the first call is still running gets a 409, not a second charge.</p>', before:{lat:2500, err:2, load:60}, after:{lat:700, err:.05, load:55}, flow:[['app', 'idem', 'claim key k_81'], ['app', 'net', 'authorise'], ['app', 'idem', 'store result']], lesson:['idempotency-rate-limit-headers', 'timeouts-retries']},
    {title:'Millions of merchants, one front door', scale:'1M merchants', hot:['app'], breaks:'<p>A few merchants’ bugs (retry loops, bulk scripts) flood the API and slow everyone down. Old integrations break when the answers change.</p>', fix:'<p>An <b>API edge</b> checks keys, applies <b>rate limits for each merchant</b>, and pins each merchant to its <b>API version</b>. Stripe keeps old versions working by changing the response through version “gates”, not by forking the code.</p>', before:{lat:1800, err:3, load:150}, after:{lat:650, err:.1, load:60}, flow:[['merchant', 'lb', 'POST /v1/payment_intents (version 2024-06-20)'], ['lb', 'app']], lesson:['api-design', 'rate-limiting']},
    {title:'Merchants poll for payment status', scale:'async payments', hot:['app'], breaks:'<p>Bank transfers, UPI and 3-D Secure finish minutes later. Merchants ask again and again, or miss the result if their server was down.</p>', fix:'<p>Every state change is an <b>event</b>. A <b>webhook sender</b> delivers events to the merchants’ endpoints. Each one is <b>signed</b> so the merchant can check it, and retried with a growing wait for days until it is acknowledged.</p><p>Delivery happens at least once, so merchants remove duplicates by event id.</p>', before:{lat:900, err:1.5, load:120}, after:{lat:650, err:.1, load:60}, flow:[['app', 'queue', 'payment_intent.succeeded'], ['queue', 'hooks'], ['hooks', 'merchant', 'POST /webhooks (signed)']], lesson:['event-driven', 'delivery-semantics', 'backpressure']},
    {title:'Where exactly did the money go?', scale:'billions of dollars', hot:['db'], breaks:'<p>Balances worked out from rows that can be edited drift apart. A bug or a partial failure leaves a fee charged but not recorded, and nobody can prove what happened.</p>', fix:'<p>Use a <b>double-entry ledger</b>. Every movement is an immutable pair of entries (take from one account, give to another) that must add up to zero. Balances come from the entries and are never edited.</p><p>Continuous <b>reconciliation</b> checks the ledger against card-network and bank reports and flags anything it cannot explain.</p>', before:{lat:700, err:.9, load:70}, after:{lat:700, err:.05, load:60}, flow:[['app', 'ledger', 'entries: −1000 customer, +970 merchant, +30 fees']], lesson:['acid-vs-base', 'compliance']},
    {title:'Migrating the database without downtime', scale:'99.999% target', hot:['db'], breaks:'<p>Shards fill up and must be split. Schema changes and moves cannot take payments offline, not even for minutes.</p>', fix:'<p>A document-database platform with a <b>data movement</b> service copies a shard’s data to a new one, replays changes from the log until it catches up, then switches traffic in a short, coordinated cutover. Stripe has described doing this for its own platform while keeping 99.999% availability.</p>', sub:{db:'sharded, live moves'}, before:{lat:1200, err:2, load:90}, after:{lat:650, err:.05, load:60}, flow:[['app', 'db', 'reads/writes during migration']], lesson:['zero-downtime-migrations', 'sharding', 'cdc']}],
  flows:[
    {name:'Create a payment (with a retry)', steps:[
      {note:'The merchant calls the API with an idempotency key.', flow:[['merchant', 'lb', 'POST /payment_intents · Idempotency-Key: k_81'], ['lb', 'app']]},
      {note:'The key is claimed in one atomic step, and the card network authorises the payment.', flow:[['app', 'idem', 'claim k_81'], ['app', 'net', 'authorise ₹999']]},
      {note:'The ledger entries and the payment are recorded, and the response is saved under the key.', flow:[['app', 'ledger', 'entries'], ['app', 'db', 'payment'], ['app', 'idem', 'store response']]},
      {note:'The response is lost. The merchant retries and gets the saved response, with no second charge.', flow:[['merchant', 'lb', 'retry k_81'], ['lb', 'app'], ['app', 'idem', 'hit → same response']]}]},
    {name:'Webhook delivery', steps:[
      {note:'The event is appended to the event log.', flow:[['app', 'queue', 'payment_intent.succeeded']]},
      {note:'The webhook sender signs the event and delivers it, retrying with a growing wait until the merchant returns 2xx.', flow:[['queue', 'hooks'], ['hooks', 'merchant', 'signed POST']]}]}],
  breakIt:[
    {label:'Card network slow', hot:['net'], verdict:'degrades', text:'Requests take longer. Idempotency makes merchant retries safe, and payments still pending are resolved later through events.'},
    {label:'Idempotency store fails', kill:['idem'], verdict:'degrades', text:'Fail closed for requests that change data: return 503 and ask clients to retry, instead of risking duplicates. Reads continue.'},
    {label:'Merchant endpoint down for a day', kill:['merchant'], verdict:'survives', text:'Webhooks are retried with a growing wait for days. When the merchant recovers, it can also list the events since a cursor.'},
    {label:'Ledger imbalance detected', hot:['ledger'], verdict:'degrades', text:'Reconciliation flags the entries, and payouts for the affected accounts pause until it is explained. Nothing is corrected silently.'}],
  dataModel:{lang:'sql', title:'idempotency keys and a double-entry ledger', code:`CREATE TABLE idempotency_keys (
  merchant_id BIGINT, key TEXT,
  state TEXT NOT NULL,            -- 'in_progress' | 'done'
  request_hash TEXT,              -- reject reuse of a key with different parameters
  response JSONB, locked_at TIMESTAMP,
  PRIMARY KEY (merchant_id, key)  -- the atomic claim is this INSERT
);
CREATE TABLE ledger_entries (
  entry_id BIGINT PRIMARY KEY, txn_id BIGINT NOT NULL,
  account TEXT NOT NULL,          -- 'customer:…', 'merchant:…:pending', 'stripe:fees', …
  amount_minor BIGINT NOT NULL,   -- positive = credit, negative = debit
  currency CHAR(3), created_at TIMESTAMP
);
-- invariant: for every txn_id, SUM(amount_minor) = 0 ; entries are never updated or deleted`, notes:'A balance is a sum over entries, so the history can always be replayed and audited. A correction is a new entry.'},
  apis:[
    {m:'POST', path:'/v1/payment_intents', note:'Send an Idempotency-Key header. A repeated key returns the original response.', req:'{ "amount": 99900, "currency": "inr", "payment_method_types": ["card", "upi"] }', res:'{ "id": "pi_3P…", "status": "requires_confirmation" }'},
    {m:'POST', path:'(merchant) /webhooks', note:'The Stripe-Signature header holds an HMAC of the timestamp and payload, made with the endpoint secret.', req:'{ "id": "evt_1Q…", "type": "payment_intent.succeeded", "data": {"object": {"id": "pi_3P…"}} }'},
    {m:'GET', path:'/v1/events?created[gt]=…', note:'Catch-up listing for merchants that missed webhooks.', res:'{ "data": [ {"id": "evt_1Q…", "type": "payment_intent.succeeded"} ], "has_more": false }'}],
  algorithm:{title:'Idempotency keys: look up vs atomic claim', html:'<p>An idempotency key only helps if two attempts cannot both decide to do the work. Looking up the key and processing if it is absent fails when a retry arrives while the first attempt is still running. That happens exactly when card networks are slow.</p><p>So the key must be <b>claimed atomically</b> (a unique insert marking it in progress) before any side effect. The simulator runs all three approaches on the same traffic. The retry playground shows why retries need backoff and jitter.</p>', mount:idemSim, pg:'retry-jitter'},
  tradeoffs:[['Atomic idempotency claims', 'Each effect happens exactly once, whatever the retry pattern', 'One extra write for each request, and keys need storage and expiry'], ['Webhooks (push) with retries', 'Merchants learn results without polling', 'Delivery is at least once, so merchants must remove duplicates'], ['An immutable double-entry ledger', 'Easy to audit, and errors are visible, not silent', 'More data, and balances are derived'], ['Version gates', 'Old integrations keep working for years', 'Compatibility code builds up']],
  alternatives:[['Client-side uniqueness only', 'Clients can’t prevent server-side duplicates on lost responses'], ['Polling instead of webhooks', 'Simple for merchants, but slow and wasteful'], ['Mutable balance column', 'Fast to read, impossible to audit after a bug']],
  failures:[['Card network', 'Pending states, and safe retries'], ['Idempotency store', 'Fail closed for writes'], ['Merchant endpoint', 'Webhook retries for days, and an events API'], ['Ledger mismatch', 'A reconciliation alert, and pause payouts']],
  lab:{stack:['Node.js or Go', 'Postgres', 'Redis (rate limits)', 'A fake card network with random latency', 'k6'], milestones:[
    {day:'Day 1: idempotency', items:['Charge API with idempotency keys stored in Postgres', 'Reproduce the in-flight race with a slow fake network', 'Fix with an atomic INSERT … ON CONFLICT claim']},
    {day:'Day 2: events', items:['Event log table + webhook sender with exponential backoff', 'HMAC-signed payloads, and a receiver that verifies and removes duplicates', 'Events listing endpoint for catch-up']},
    {day:'Day 3: ledger', items:['Double-entry entries for charges, fees and refunds', 'Invariant check: every txn sums to zero', 'Reconciliation against a fake settlement file']}],
   pseudocode:{lang:'ts', code:`async function handle(merchantId: number, key: string, req: ChargeRequest) {
  const claimed = await db.query(
    \`INSERT INTO idempotency_keys (merchant_id, key, state, request_hash, locked_at)
     VALUES ($1, $2, 'in_progress', $3, now()) ON CONFLICT DO NOTHING RETURNING key\`, [merchantId, key, hash(req)]);
  if (!claimed.rowCount) {
    const row = await db.one('SELECT state, response, request_hash FROM idempotency_keys WHERE merchant_id=$1 AND key=$2', [merchantId, key]);
    if (row.request_hash !== hash(req)) return http(422, 'key reused with different parameters');
    return row.state === 'done' ? row.response : http(409, 'request in progress, retry later');
  }
  const result = await chargeWithLedger(req);                 // the only place side effects happen
  await db.query("UPDATE idempotency_keys SET state='done', response=$3 WHERE merchant_id=$1 AND key=$2", [merchantId, key, result]);
  return result;
}`},
   loadTest:'<p>Point 1,000 clients at the charge API with a fake network where 10% of calls take 1 to 6 s and 3% of responses are dropped. Clients retry with the same key after 2 s. Count customers charged twice for: no key, lookup-then-process, and atomic claim.</p>'},
  twists:[{q:'A merchant reuses an idempotency key with a different amount. What should happen?', a:'Reject it with a 422. Store a hash of the request with the key and compare it. Otherwise a bug on the merchant’s side could return a cached response for a different payment.'}, {q:'How long should idempotency keys be kept?', a:'Long enough to cover realistic retry windows (Stripe keeps them at least 24 hours), then expire them. The ledger and payment records stay as the permanent truth.'}, {q:'How do you guarantee a webhook is sent if the event is created inside a database transaction?', a:'Use a transactional outbox. Write the event to an events table in the same transaction as the payment change. A relay reads the committed events and delivers them. The event cannot exist without the change, and the change cannot exist without the event.'}, {q:'A merchant’s endpoint returns 500 for three days. What should the platform do?', a:'Keep retrying with a growing wait and add jitter, but stop flooding them: slow down after repeated failures. Mark the endpoint as failing and email the merchant. After the retry window ends, keep the events in the events API so the merchant can catch up when the endpoint is fixed.'}],
  real:[
    {co:'Stripe idempotency', tier:'confirmed', text:'Stripe’s API accepts idempotency keys so clients can safely retry requests that change data. Stripe has written about designing APIs to be robust and predictable this way.', src:'Stripe Engineering Blog, “Designing robust and predictable APIs with idempotency” (2017), and the Stripe API reference'},
    {co:'Stripe API versioning', tier:'confirmed', text:'Stripe pins each account to an API version and uses version change modules to keep older integrations working.', src:'Stripe Engineering Blog, “APIs as infrastructure: future-proofing Stripe with versioning” (2017)'},
    {co:'Stripe databases', tier:'confirmed', text:'Stripe described its document database platform (DocDB), built on MongoDB, with a data movement platform for zero-downtime migrations and 99.999% uptime.', src:'Stripe Engineering Blog, “How Stripe’s document databases supported 99.999% uptime with zero-downtime data migrations” (2024)'},
    {co:'Stripe ledger', tier:'confirmed', text:'Stripe built Ledger, a double-entry system for tracking and validating money movement at scale.', src:'Stripe Engineering Blog, “Ledger: Stripe’s system for tracking and validating money movement”'},
    {co:'Stripe scale', tier:'confirmed', text:'Stripe reported about $1.4 trillion in total payment volume in 2024.', src:'Stripe annual letter (2024)'},
    {co:'Service layout', tier:'inference', text:'The boxes shown are a simplification. Stripe’s actual services are more numerous.', src:'This case study'},
    {co:'Idempotency simulator', tier:'educational', text:'Synthetic latencies and loss rates.', src:'This case study’s model'}],
  sources:['Stripe Engineering: Designing robust and predictable APIs with idempotency (2017)', 'Stripe Engineering: APIs as infrastructure: future-proofing Stripe with versioning (2017)', 'Stripe Engineering: How Stripe’s document databases supported 99.999% uptime with zero-downtime data migrations (2024)', 'Stripe Engineering: Ledger: Stripe’s system for tracking and validating money movement', 'Chris Richardson: Microservices Patterns (transactional outbox)']
});

/* ======================= SLACK / DISCORD ======================= */
SDA.register({kind:'case', id:'discord', tier:'standard', icon:'💬', title:'Slack / Discord (group chat at scale)', tagline:'A million members in one server: gateways, per-guild processes, bucketed partitions and request coalescing.', tags:['chat', 'websockets', 'elixir', 'fan-out', 'cassandra', 'scylladb', 'hot partitions', 'request coalescing', 'search'],
  modules:['realtime', 'databases', 'distributed', 'search'],
  summary:'Group chat looks like WhatsApp, but with huge shared rooms: one message may reach a million online members, and the history is kept and searchable. The key ideas are gateways, one process for each server, and storage split by channel and time.',
  accuracy:'Discord’s engineering blog describes its Elixir gateways and guild processes, message storage on Cassandra and then ScyllaDB with (channel, bucket) partitions, Rust data services that coalesce requests, its work on million-user servers, and Elasticsearch-based search. Slack has written about its real-time messaging design and its move to Vitess. These facts are marked confirmed. The combined design is simplified, and the numbers are illustrative unless marked.',
  overview:{what:'<b>A small example.</b> A moderator posts an announcement in a community of 1M members. Within a second, every member who is online sees it. Years later, anyone can search for it.', in:['Persistent gateway connections', 'Per-guild fan-out', 'Message storage and history', 'Hot partitions and request coalescing', 'Search'], out:['Voice and video channels', 'Bots and integrations in depth', 'Moderation tooling', 'Billing (Nitro)']},
  challenges:['Millions of WebSocket connections open at the same time', 'Sending one message to up to a million members of one server', 'Trillions of messages, kept forever', 'A busy channel puts all its load on one partition', 'Search across years of history, with permission checks'],
  fr:['Send and receive messages in channels instantly', 'Scroll back through history', 'Presence and typing indicators', 'Mentions and notifications', 'Search messages'],
  nfr:['Message delivery to online members within about a second', 'History reads fast and predictable (p99)', 'No message loss once acknowledged', 'Graceful handling of very large servers', 'Cost-efficient storage for data kept forever'],
  scale:[{k:'Concurrent users on Elixir gateways (2017)', v:'5M', math:'From the Discord blog “How Discord Scaled Elixir to 5,000,000 Concurrent Users”. That is 5,000,000 open connections', tag:'public'}, {k:'Messages stored (2023)', v:'trillions', math:'From the Discord blog “How Discord Stores Trillions of Messages”. 1 trillion = 1,000,000,000,000', tag:'public'}, {k:'Members online in one server', v:'1M+', math:'From the Discord blog on the Midjourney server (“Maxjourney”, 2023): over 1,000,000 online at once', tag:'public'}, {k:'Sends for one message there', v:'≈ 1M', math:'One message × 1,000,000 online members = 1,000,000 sends', tag:'illustrative'}, {k:'Database queries with coalescing', v:'≈ 50 a second instead of 5,000', math:'λ ÷ (1 + λd) with λ = 5,000 reads a second and d = 0.02 s: 5,000 ÷ 101 ≈ 50', tag:'illustrative'}],
  arch:{w:860, h:390, minW:640, nodes:[
    {id:'user', type:'client', label:'Discord app', x:70, y:195, w:116},
    {id:'gw', type:'service', label:'Gateways', sub:'WebSockets (Elixir)', x:240, y:195, w:150, stage:1},
    {id:'guild', type:'service', label:'Guild processes', sub:'one per server', x:430, y:55, w:150, stage:2},
    {id:'app', type:'service', label:'API', sub:'one server', x:430, y:195, w:130},
    {id:'db', type:'db', label:'Messages DB', sub:'MongoDB', x:430, y:335, w:150},
    {id:'search', type:'service', label:'Search', sub:'Elasticsearch', x:640, y:195, w:140, stage:5},
    {id:'ds', type:'service', label:'Data services', sub:'coalescing (Rust)', x:640, y:335, w:160, stage:4}],
   edges:[{from:'user', to:'app', curve:.25}, {from:'app', to:'db', gone:4},
     {from:'user', to:'gw', stage:1}, {from:'gw', to:'app', stage:1},
     {from:'gw', to:'guild', stage:2}, {from:'app', to:'guild', stage:2},
     {from:'app', to:'ds', stage:4}, {from:'ds', to:'db', stage:4},
     {from:'app', to:'search', stage:5}]},
  evolution:[
    {title:'One server + one database', scale:'a few communities', fix:'<p>An API server stores messages in MongoDB. Clients ask for new messages in the channel they are looking at.</p>', after:{lat:300, err:.2, load:20}},
    {title:'Polling for new messages doesn’t scale', scale:'1M users', hot:['app'], breaks:'<p>Every client asks every few seconds in every channel. Most answers are empty, and messages still arrive late.</p>', fix:'<p>Persistent <b>WebSocket gateways</b> push events (messages, presence and typing) to clients. Discord built them in Elixir on the Erlang VM, where each connection is a cheap lightweight process.</p>', before:{lat:3000, err:2, load:200}, after:{lat:150, err:.1, load:45}, flow:[['user', 'gw', 'WebSocket'], ['gw', 'app']], lesson:['websockets-at-scale', 'realtime-transports']},
    {title:'One message, a million recipients', scale:'huge servers', hot:['gw'], breaks:'<p>Sending a message means finding every online member of the server and pushing to each one. Looping over all members on every send is slow and blocks the sender.</p>', fix:'<p>Each server (called a guild) has a <b>guild process</b> that knows which sessions are online. It sends each message on to the gateway sessions.</p><p>For the biggest servers, Discord added relays and made inactive members “passive”, so the fan-out work stays bounded.</p>', before:{lat:5000, err:3, load:250}, after:{lat:300, err:.1, load:60}, flow:[['app', 'guild', 'message in #announcements'], ['guild', 'gw', 'fan out to sessions'], ['gw', 'user']], lesson:['fan-out', 'presence']},
    {title:'Billions of messages outgrow MongoDB', scale:'billions of messages', hot:['db'], breaks:'<p>The data no longer fits in memory, and reads of old history become unpredictable. One big table on one cluster cannot scale writes.</p>', fix:'<p>Move the messages to a wide-column store (Discord used Cassandra, later <b>ScyllaDB</b>). Split it by <b>(channel_id, time bucket)</b> and sort by message id. A channel’s recent history is then one partition read, and no partition grows forever.</p>', sub:{db:'channel + bucket keys'}, before:{lat:2000, err:1.5, load:170}, after:{lat:60, err:.05, load:55}, flow:[['app', 'db', 'SELECT … WHERE channel=… AND bucket=…']], lesson:['sharding', 'btree-vs-lsm']},
    {title:'Hot partitions: one channel melts a node', scale:'trillions of messages', hot:['db'], breaks:'<p>When a huge server posts, everyone fetches the same few messages at once. All the reads hit the replicas of one partition, delay spikes, and the slowdown spreads to everything on those nodes.</p>', fix:'<p><b>Data services</b> (Discord wrote them in Rust) sit between the API and the database. Requests for a channel go to the same service instance, which <b>coalesces</b> identical reads in flight into one database query and shares the result.</p><p>Try it in the coalescing simulator.</p>', before:{lat:2500, err:2, load:220}, after:{lat:40, err:.05, load:50}, flow:[['app', 'ds', '10K reads of the same message'], ['ds', 'db', '1 query']], lesson:['consistent-hashing', 'cache-failure-modes']},
    {title:'“Where was that link from 2019?”', scale:'years of history', hot:['db'], breaks:'<p>The message store is built to read by channel and time. It is not built for full-text search across a server’s history with permission checks.</p>', fix:'<p>Index messages into <b>Elasticsearch</b> clusters (Discord split the indexes by server and indexed messages in batches from a queue). Search results are filtered by the user’s channel permissions.</p>', before:{lat:4000, err:1, load:120}, after:{lat:250, err:.05, load:55}, flow:[['app', 'search', 'from:priya link 2019']], lesson:['elasticsearch', 'inverted-index']}],
  flows:[
    {name:'Send a message', steps:[
      {note:'The client sends through the API (or the gateway), and the message is written durably.', flow:[['user', 'app', 'POST /channels/…/messages'], ['app', 'ds'], ['ds', 'db', 'write']]},
      {note:'The guild process fans the event out to every online member’s gateway session.', flow:[['app', 'guild', 'MESSAGE_CREATE'], ['guild', 'gw', 'to sessions'], ['gw', 'user', 'push']]}]},
    {name:'Everyone loads the same message', steps:[
      {note:'Thousands of clients fetch the announcement at once, and the data service coalesces them into one query.', flow:[['user', 'app', 'GET messages'], ['app', 'ds', '× 10,000'], ['ds', 'db', '× 1']]}]}],
  breakIt:[
    {label:'A gateway node dies', kill:['gw'], verdict:'degrades', text:'Its clients reconnect to other gateways (waiting a random time) and resume their sessions, replaying missed events by sequence number.'},
    {label:'A guild process crashes', kill:['guild'], verdict:'degrades', text:'The supervisor restarts it and the sessions subscribe again. Members of that server see a short pause in live events.'},
    {label:'Hot channel', hot:['ds', 'db'], verdict:'survives', text:'Coalescing merges the duplicate reads, so the database sees one query for each message instead of thousands.'},
    {label:'Search cluster down', kill:['search'], verdict:'degrades', text:'Chat works normally. Search returns an error, and indexing catches up from the queue later.'}],
  dataModel:{lang:'sql', title:'messages partitioned by channel and time bucket (CQL)', code:`CREATE TABLE messages (
  channel_id bigint,
  bucket     int,          -- e.g. a fixed window of time derived from the message's snowflake id
  message_id bigint,       -- snowflake: time-ordered
  author_id  bigint,
  content    text,
  PRIMARY KEY ((channel_id, bucket), message_id)
) WITH CLUSTERING ORDER BY (message_id DESC);
-- Recent history: read the newest bucket, then older buckets until the page is full`, notes:'Buckets keep partitions bounded however old or busy a channel is. Snowflake ids give time order without a central counter.'},
  apis:[
    {m:'POST', path:'/api/v10/channels/{id}/messages', req:'{ "content": "Season 3 starts Friday 🎉", "nonce": "c_77" }', res:'{ "id": "1219…", "timestamp": "2026-11-13T18:00:00Z" }'},
    {m:'WS', path:'gateway event MESSAGE_CREATE', res:'{ "op": 0, "t": "MESSAGE_CREATE", "s": 4211, "d": {"id": "1219…", "channel_id": "…"} }'},
    {m:'GET', path:'/api/v10/channels/{id}/messages?before=…&limit=50', res:'[ {"id": "1218…", "content": "…"} ]'}],
  algorithm:{title:'Request coalescing', html:'<p>If a request for key K arrives while an identical query for K is already running, wait for that query instead of starting another.</p><p>With random arrivals at rate λ and a query time d, the database sees λ ÷ (1 + λd) queries instead of λ. The simulator checks that formula. The hash-ring playground shows how requests for one channel reach the same data-service instance.</p>', mount:coalesceSim, pg:'hash-ring'},
  tradeoffs:[['A process for each guild', 'The fan-out state is in one place, and ordering is simple', 'Huge guilds need special handling (relays and passive members)'], ['(channel, bucket) partitions', 'Bounded partitions and fast reads of recent messages', 'Older history needs several partition reads'], ['Data services that coalesce', 'A hot key cannot overload the database', 'One more tier, and requests are routed by key'], ['A separate search cluster', 'Full-text search with permissions', 'The index lags, and it is one more system to run']],
  alternatives:[['Fan-out on write to per-user inboxes', 'Works for 1:1 chat, but it is impossible for million-member servers'], ['Relational DB for messages', 'Fine early, but the write volume and size outgrow it (Slack sharded MySQL with Vitess)'], ['Plain caching instead of coalescing', 'A cache still stampedes on the first miss of a hot new message']],
  failures:[['Gateway', 'Reconnect and resume by sequence'], ['Guild process', 'Supervisor restart'], ['Hot channel', 'Coalescing'], ['Search', 'Catch up from queue']],
  lab:{stack:['Elixir/Phoenix or Node.js (ws)', 'ScyllaDB or Cassandra', 'Redis', 'OpenSearch', 'k6'], milestones:[
    {day:'Day 1: realtime', items:['WebSocket gateway with sessions and sequence numbers', 'Per-room process (or actor) that fans out messages', 'Resume after reconnect by replaying from the last sequence']},
    {day:'Day 2: storage', items:['Messages table partitioned by (channel, bucket)', 'Paginated history across buckets', 'Snowflake-style ids']},
    {day:'Day 3: hot keys', items:['Data service with request coalescing (singleflight)', 'Load test 10K reads a second of one message, and count the database queries', 'Index messages into OpenSearch via a queue']}],
   pseudocode:{lang:'ts', code:`const inflight = new Map<string, Promise<Message[]>>();   // request coalescing ("singleflight")
function getMessages(channelId: string, before: string) {
  const key = channelId + ':' + before;
  let p = inflight.get(key);
  if (!p) {
    p = db.fetchMessages(channelId, before).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;                                               // every caller shares one query
}`},
   loadTest:'<p>Open 50K WebSockets in 10 rooms (one with 40K members). Post a message every second there and measure the fan-out time to the last member. Then hammer the history endpoint for that message at 10K reads/s and compare database queries with and without coalescing.</p>'},
  twists:[{q:'Why bucket messages by time if the partition key already includes the channel?', a:'A busy channel would otherwise grow one partition forever. That means slow compaction, uneven nodes and huge reads. Buckets cap the size of a partition. The cost is reading a few buckets when you scroll far back.'}, {q:'How do you handle the “@everyone” ping in a million-member server?', a:'Do not make a million notifications at once. Send the message to the online sessions, work out mentions only when needed (unread mention counts are computed on read), and allow @everyone only for roles that have permission.'}, {q:'How does a reconnecting client avoid missing messages?', a:'Gateway events carry a sequence number for each session. On reconnect, the client sends its last number and the gateway replays the events it kept. If that buffer is gone, the client fetches recent history again through the API.'}, {q:'A user is removed from a private channel. How fast must they stop seeing new messages?', a:'At once for live events, because the guild process checks permissions when it fans out. Remove the session from the channel’s audience as soon as the permission change is saved. History and search results are checked against permissions on every read, so old messages disappear for that user too.'}],
  real:[
    {co:'Discord gateways', tier:'confirmed', text:'Discord’s real-time gateways and per-guild processes run on Elixir and Erlang. Discord described scaling them to 5 million concurrent users.', src:'Discord Engineering, “How Discord Scaled Elixir to 5,000,000 Concurrent Users” (2017)'},
    {co:'Discord message storage', tier:'confirmed', text:'Discord moved messages from MongoDB to Cassandra with (channel_id, bucket) partitions, and later to ScyllaDB with Rust data services that coalesce requests.', src:'Discord Engineering, “How Discord Stores Billions of Messages” (2017), and “How Discord Stores Trillions of Messages” (2023)'},
    {co:'Discord large servers', tier:'confirmed', text:'Discord described changes to support a single server with over a million online users (relays, passive sessions).', src:'Discord Engineering, “Maxjourney: Pushing Discord’s Limits with a Million+ Online Users in a Single Server” (2023)'},
    {co:'Discord search', tier:'confirmed', text:'Discord indexes messages in Elasticsearch, sharded by server and indexed in batches from a queue.', src:'Discord Engineering, “How Discord Indexes Billions of Messages” (2017)'},
    {co:'Slack', tier:'confirmed', text:'Slack described its real-time messaging architecture (channel and gateway servers) and its migration of MySQL to Vitess for horizontal scaling.', src:'Slack Engineering, “Real-time Messaging” (2023), “Scaling Datastores at Slack with Vitess” (2020)'},
    {co:'Combined design', tier:'inference', text:'The diagram merges published pieces into one simplified design.', src:'This case study'},
    {co:'Coalescing simulator', tier:'educational', text:'Poisson arrivals and a fixed query time.', src:'This case study’s model'}],
  sources:['Discord Engineering: How Discord Scaled Elixir to 5,000,000 Concurrent Users (2017)', 'Discord Engineering: How Discord Stores Billions of Messages (2017)', 'Discord Engineering: How Discord Stores Trillions of Messages (2023)', 'Discord Engineering: Maxjourney (2023)', 'Discord Engineering: How Discord Indexes Billions of Messages (2017)', 'Slack Engineering: Real-time Messaging (2023), Scaling Datastores at Slack with Vitess (2020)']
});

/* ======================= GOOGLE DOCS (OT vs CRDT) ======================= */
SDA.register({kind:'case', id:'google-docs', tier:'standard', icon:'📝', title:'Google Docs (real-time collaboration: OT vs CRDT)', tagline:'Fifty people typing in one document, and everyone ends up with the same text.', tags:['collaboration', 'operational transformation', 'crdt', 'websockets', 'operation log', 'snapshots', 'presence'],
  modules:['distributed', 'realtime', 'databases'],
  summary:'Collaborative editing shows each person’s typing at once, then makes every copy converge to the same document. Google Docs uses operational transformation (OT) with a central server, and CRDTs are the alternative that merges without one.',
  accuracy:'Google has described Docs collaboration as operational transformation with a server (2010), building on the Jupiter system and the OT work in Google Wave. Docs supports up to 100 editors at the same time. Figma has described its multiplayer design. These facts are marked confirmed. The storage and session details are inference. The numbers are illustrative unless marked.',
  overview:{what:'<b>A small example.</b> Thirty students edit the same class notes. Each one sees their own typing at once, and sees the others’ cursors move. Nobody’s sentence is mangled by someone else’s edit.', in:['Operations instead of whole-document saves', 'OT with a central server (Jupiter model)', 'Operation log, revisions and snapshots', 'Cursors and presence', 'Per-document session routing'], out:['Rich formatting and tables in depth', 'Comments and suggestions mode', 'Permissions and sharing in depth', 'Spreadsheets and slides specifics']},
  challenges:['Edits made at nearby positions at the same time', 'Showing the local change at once while edits are still in flight', 'Making every copy converge to the same text', 'A history that grows with every keystroke', 'Hot documents with many editors'],
  fr:['Type and see the change instantly', 'See others’ edits and cursors in near real time', 'Never lose an edit', 'Version history', 'Keep working briefly offline'],
  nfr:['Local typing feels instant (about 0 ms, because the edit is applied before the server confirms)', 'Remote edits are visible within a few hundred ms', 'All copies converge to the same document', 'An edit is safe once the server has acknowledged it', 'Up to 100 editors at the same time in one document'],
  scale:[{k:'Editors at the same time in one document', v:'100', math:'From Google Docs Help: the limit for editing at once is 100 people', tag:'public'}, {k:'Operations for one active document', v:'≈ 5 a second for each typist', math:'A typist makes about 5 keystrokes a second. With 30 editors typing that is up to 150 a second', tag:'illustrative'}, {k:'Active documents at peak', v:'≈ 10M', math:'An assumption: 10,000,000 documents are being edited at the busiest time', tag:'illustrative'}, {k:'Operations a second overall', v:'≈ 50M', math:'10M documents × about 5 operations a second = 50M', tag:'illustrative'}],
  arch:{w:920, h:390, minW:640, nodes:[
    {id:'a', type:'client', label:'Alice', x:70, y:110, w:110},
    {id:'b', type:'client', label:'Bob', x:70, y:280, w:110},
    {id:'gw', type:'lb', label:'Collab gateway', sub:'WebSockets', x:240, y:195, w:140, stage:2},
    {id:'app', type:'service', label:'Docs server', sub:'saves whole doc', x:430, y:195, w:150},
    {id:'db', type:'db', label:'Documents DB', sub:'latest version', x:430, y:335, w:150},
    {id:'sess', type:'service', label:'Doc session', sub:'OT, orders ops', x:640, y:55, w:150, stage:2},
    {id:'log', type:'db', label:'Op log', sub:'revisions', x:640, y:195, w:130, stage:1},
    {id:'snap', type:'service', label:'Snapshotter', sub:'compacts history', x:840, y:195, w:140, stage:4}],
   edges:[{from:'a', to:'app', gone:2}, {from:'b', to:'app', gone:2}, {from:'app', to:'db'},
     {from:'app', to:'log', stage:1},
     {from:'a', to:'gw', stage:2}, {from:'b', to:'gw', stage:2}, {from:'gw', to:'sess', stage:2}, {from:'sess', to:'log', stage:2},
     {from:'log', to:'snap', stage:4}, {from:'snap', to:'db', stage:4}]},
  evolution:[
    {title:'One server + one database', scale:'single editors', fix:'<p>The editor saves the whole document every few seconds, and the server keeps the latest version. The last save wins.</p>', after:{lat:300, err:.2, load:15}},
    {title:'Last save wins: Bob’s paragraph vanishes', scale:'shared docs', hot:['app'], breaks:'<p>Alice and Bob edit at the same time, and whoever saves second overwrites the other’s work. Saving the whole document is also wasteful for a one-character change.</p>', fix:'<p>Send <b>operations</b> (insert “x” at 41, delete 12), not whole documents. The server adds them to an <b>operation log</b> with a revision number. The document is the log replayed.</p>', sub:{app:'appends operations', db:'snapshots'}, before:{lat:300, err:5, load:40}, after:{lat:250, err:1.5, load:35}, flow:[['a', 'app', 'insert "x" at 41 (rev 87)'], ['app', 'log', 'append rev 88']], lesson:['event-driven', 'delivery-semantics']},
    {title:'Concurrent edits land in the wrong place', scale:'live co-editing', hot:['app'], breaks:'<p>Alice inserts at position 5 while Bob deletes position 2. If the edits are applied as they arrive, Alice’s insert lands one character off on Bob’s screen, and the two copies drift apart.</p>', fix:'<p>Use <b>operational transformation</b> with a central server (the Jupiter model). Each document has a <b>session</b> on one server that orders all operations. A new operation is <b>transformed</b> against the operations committed since the client’s base revision, then sent to everyone. Clients transform remote operations against their own pending ones.</p><p>Edits travel over persistent connections through a gateway.</p>', sub:{app:'API + storage'}, before:{lat:400, err:4, load:50}, after:{lat:150, err:.01, load:45}, flow:[['a', 'gw', 'op based on rev 87'], ['gw', 'sess', 'transform vs 88, 89'], ['sess', 'log', 'commit rev 90'], ['sess', 'gw', 'broadcast'], ['gw', 'b']], lesson:['crdts-merkle', 'websockets-at-scale']},
    {title:'Who is where? Cursors and presence', scale:'30 editors', hot:['sess'], breaks:'<p>Without seeing each other’s cursors, people type over each other. Saving every cursor move as an operation makes the log huge.</p>', fix:'<p>Send <b>presence</b> (the cursor and selection, transformed like operations so they stay in the right place) on the same connection, but <b>never save it</b>. Send updates only a few times a second.</p>', sub:{sess:'OT + presence'}, before:{lat:300, err:1, load:80}, after:{lat:150, err:.05, load:50}, flow:[['b', 'gw', 'cursor at 120 (ephemeral)'], ['gw', 'sess'], ['sess', 'gw', 'presence to others']], lesson:['presence']},
    {title:'Opening a doc replays a million operations', scale:'years-old docs', hot:['log'], breaks:'<p>A document that has lived for years has millions of operations. Opening it means replaying all of them, and the log grows forever.</p>', fix:'<p>A <b>snapshotter</b> writes the document’s state at a revision from time to time. Opening a document loads the latest snapshot and replays only the newer operations. Old operations are merged into a coarser version history.</p>', before:{lat:8000, err:.5, load:90}, after:{lat:300, err:.05, load:50}, flow:[['log', 'snap', 'ops since last snapshot'], ['snap', 'db', 'snapshot @ rev 1,204,331']], lesson:['btree-vs-lsm', 'storage-types']},
    {title:'A hot document with 100 editors', scale:'class notes, live events', hot:['sess'], breaks:'<p>One document session gets hundreds of operations a second and must send each to 100 editors. That is 10,000 or more messages a second from one place.</p>', fix:'<p>Send each document to exactly one session server using <b>consistent hashing</b> on the document id, because all its operations must be ordered in one place. Batch the broadcasts every few tens of milliseconds, limit the editors at the same time (Docs allows 100) and let extra people view read-only.</p>', sub:{sess:'one owner per doc'}, before:{lat:1200, err:1, load:180}, after:{lat:200, err:.05, load:70}, flow:[['a', 'gw', 'op'], ['gw', 'sess', 'owner of doc 9f…'], ['sess', 'gw', 'batched broadcast']], lesson:['consistent-hashing', 'fan-out']}],
  flows:[
    {name:'Two people type at once', steps:[
      {note:'Alice and Bob both edit revision 87. Each applies their own edit locally at once.', flow:[['a', 'gw', 'op A @87'], ['b', 'gw', 'op B @87']]},
      {note:'The document session orders them. A becomes revision 88, and B is transformed against A and becomes revision 89.', flow:[['gw', 'sess'], ['sess', 'log', 'rev 88, 89']]},
      {note:'Each client receives the other’s transformed operation and converges to the same text.', flow:[['sess', 'gw', 'A to Bob, B′ to Alice'], ['gw', 'a'], ['gw', 'b']]}]},
    {name:'Open a document', steps:[
      {note:'Load the latest snapshot and the operations after it.', flow:[['a', 'gw', 'open doc'], ['gw', 'sess'], ['sess', 'log', 'ops since snapshot']]}]}],
  breakIt:[
    {label:'Document session server dies', kill:['sess'], verdict:'degrades', text:'Another server takes ownership (the hash ring decides), loads the snapshot and the log, and clients resend the operations that were not acknowledged, based on their last acknowledged revision.'},
    {label:'Client offline for 10 minutes', kill:['b'], verdict:'survives', text:'Bob keeps typing locally. On reconnect, his pending operations are sent with their base revision and transformed against everything that happened meanwhile.'},
    {label:'Snapshotter behind', hot:['snap'], verdict:'survives', text:'Documents open more slowly because of a longer replay, until it catches up. Editing is not affected.'},
    {label:'Gateway node fails', kill:['gw'], verdict:'degrades', text:'Clients reconnect to another gateway and resume from their last acknowledged revision.'}],
  dataModel:{lang:'sql', title:'operation log + snapshots', code:`CREATE TABLE doc_ops (
  doc_id   BIGINT, rev BIGINT,             -- rev assigned by the document's session (total order)
  author   BIGINT, client_seq INT,         -- dedupe resent ops after reconnects
  op       JSONB,                          -- e.g. {"t":"ins","p":41,"text":"x"} or {"t":"del","p":12,"n":1}
  at       TIMESTAMP,
  PRIMARY KEY (doc_id, rev)
);
CREATE TABLE doc_snapshots (doc_id BIGINT, rev BIGINT, content BYTEA, PRIMARY KEY (doc_id, rev));
-- open = latest snapshot ≤ now + replay ops with rev > snapshot.rev`, notes:'The central session gives one total order of revisions, which is what makes OT manageable. CRDTs avoid the central order by giving every character a unique, ordered identity.'},
  apis:[
    {m:'WS', path:'client → server: op', req:'{ "doc": "9f…", "base_rev": 87, "client_seq": 412, "op": {"t": "ins", "p": 41, "text": "x"} }', res:'{ "ack": 412, "rev": 90 }'},
    {m:'WS', path:'server → client: remote op', res:'{ "rev": 91, "author": "bob", "op": {"t": "del", "p": 12, "n": 1} }'},
    {m:'GET', path:'/v1/docs/{id}?rev=latest', res:'{ "snapshot_rev": 1204331, "content": "…", "ops": [ … ] }'}],
  algorithm:{title:'Operational transformation, tested', html:'<p>Two operations made on the same document cannot both be applied as received, because each one’s position assumes the other has not happened. OT <b>transforms</b> one against the other (for example, shift an insert to the right if a concurrent insert came before it), so both orders give the same text.</p><p>Pick operations below, then look at the fuzz test of thousands of random concurrent pairs. The vector-clock and CRDT playground shows the alternative that merges without a server.</p>', mount:otSim, pg:'vector-clock'},
  tradeoffs:[['OT with a central server', 'Small operations, well understood for text, and easy access control', 'Needs one ordering point for each document'], ['CRDTs', 'Merge without a server, which is great for offline and peer-to-peer', 'Extra data for each character, tombstones that grow, and the intent is trickier for rich text'], ['Presence that is not saved', 'Live cursors without a bigger history', 'Lost on reconnect, by design'], ['Snapshots plus a log', 'Fast opens and a full history', 'Compaction jobs and storage']],
  alternatives:[['Locking paragraphs', 'Simple, but blocks people and feels slow'], ['Last-writer-wins on whole document', 'Loses work'], ['Differential sync', 'Works for some apps, but conflicts are resolved fuzzily']],
  failures:[['Session server', 'The hash ring reassigns, and clients resend from the last ack'], ['Client offline', 'Transform pending ops on reconnect'], ['Snapshotter', 'Slower opens only'], ['Gateway', 'Reconnect and resume']],
  lab:{stack:['TypeScript', 'Node.js WebSocket server', 'Postgres', 'Yjs or Automerge (for the CRDT comparison)', 'k6'], milestones:[
    {day:'Day 1: OT core', items:['Insert/delete ops with transform functions', 'Fuzz test: random concurrent pairs must converge', 'Server that assigns revisions and transforms incoming ops']},
    {day:'Day 2: clients', items:['Optimistic local apply + pending/inflight queues', 'Remote ops transformed against pending ones', 'Presence (cursors) over the same socket, never stored']},
    {day:'Day 3: CRDT comparison', items:['Same editor on Yjs, and compare the document size after 10K edits', 'Offline edits on both, then merge on reconnect', 'Snapshots and compaction for the OT log']}],
   pseudocode:{lang:'ts', code:`// Server: Jupiter-style OT with one ordered log per document
async function onClientOp(doc: Doc, baseRev: number, op: Op) {
  let t = op;
  for (const committed of doc.opsSince(baseRev)) t = transform(t, committed);  // catch up with what the client missed
  const rev = doc.append(t);                                                   // total order
  doc.broadcastExcept(op.author, { rev, op: t });
  return { ack: op.clientSeq, rev };
}
// transform(insert, insert): shift right if the other insert is before (ties broken by site id)
// transform(insert, delete): shift left if the deleted character is before
// transform(delete, delete) on the same character: becomes a no-op`},
   loadTest:'<p>Simulate 50 editors on one document, each typing 5 ops a second with 100 to 300 ms of random delay. Check that every client’s final text is identical. Measure the end-to-end delay for remote ops and the server’s broadcast rate.</p>'},
  twists:[{q:'Why does Google Docs need a central server for OT while CRDTs do not?', a:'Classic OT is easiest to get right when one server sets a single order of operations and clients transform against it (Jupiter). OT with no central server needs extra properties that are famously hard to guarantee. CRDTs give each character a unique, ordered identity, so any copy can merge any set of operations in any order and converge.'}, {q:'How do you handle an editor who was offline for an hour?', a:'Keep their operations on the device with the base revision. On reconnect, send them, and the server transforms them against everything since that revision. If the gap is huge, fall back to a three-way merge or show a “your changes” diff.'}, {q:'Why not store cursor positions in the operation log?', a:'They change constantly and have no value later. Storing them would multiply the size of the log and the replay time. Send them as presence, throttled, and let them disappear when the person leaves.'}, {q:'Two people select the same sentence and both press delete. What happens?', a:'Both send a delete for the same text. The server transforms the second delete against the first, finds the text already gone, and turns it into a no-op. Both copies end with the sentence removed once, and nobody sees an error.'}],
  real:[
    {co:'Google Docs', tier:'confirmed', text:'Google described that Docs’ real-time collaboration uses operational transformation with the server and clients transforming operations against each other.', src:'Google Drive Blog, “What’s different about the new Google Docs: Making collaboration fast” (2010)'},
    {co:'Jupiter', tier:'confirmed', text:'The Jupiter collaboration system introduced client-server OT where a central server orders operations and each client keeps a two-way transformation state.', src:'Nichols, Curtis, Dixon & Lamping, “High-latency, low-bandwidth windowing in the Jupiter collaboration system” (UIST 1995)'},
    {co:'Editor limit', tier:'confirmed', text:'Google Docs allows up to 100 people to edit or comment at the same time. Beyond that, only owners and editors can edit.', src:'Google Docs Editors Help'},
    {co:'Figma', tier:'confirmed', text:'Figma’s multiplayer uses a server-authoritative design inspired by CRDTs rather than OT.', src:'Figma Blog, “How Figma’s multiplayer technology works” (2019)'},
    {co:'CRDTs', tier:'confirmed', text:'Conflict-free replicated data types guarantee convergence without coordination. Libraries such as Yjs and Automerge apply them to collaborative text.', src:'Shapiro, Preguiça, Baquero & Zawirski, “Conflict-free Replicated Data Types” (SSS 2011)'},
    {co:'Storage and sessions', tier:'inference', text:'The op-log, snapshot and session-routing design is a reasonable inference.', src:'This case study'},
    {co:'OT simulator', tier:'educational', text:'Single-character insert/delete OT only.', src:'This case study’s model'}],
  sources:['Google Drive Blog: Making collaboration fast (2010)', 'Nichols et al.: High-latency, low-bandwidth windowing in the Jupiter collaboration system (UIST 1995)', 'Google Wave: Operational Transformation white paper (2010)', 'Shapiro et al.: Conflict-free Replicated Data Types (2011)', 'Figma Blog: How Figma’s multiplayer technology works (2019)']
});

/* ======================= LLM SERVING (ChatGPT-style) ======================= */
SDA.register({kind:'case', id:'llm-serving', tier:'standard', icon:'🤖', title:'ChatGPT-style LLM serving', tagline:'GPUs are the scarce resource: batch continuously, stream tokens, and manage the KV cache like memory.', tags:['llm', 'gpu', 'continuous batching', 'kv cache', 'pagedattention', 'streaming', 'rate limiting', 'prefix caching'],
  modules:['architecture', 'reliability', 'traffic', 'networking'],
  summary:'Serving a language model is unlike serving web pages: each request runs for seconds, makes one token at a time, and holds GPU memory throughout. Batching gives throughput, streaming gives low latency, and GPU memory sets the capacity.',
  accuracy:'Published research and open-source systems are marked confirmed: continuous batching (Orca), PagedAttention (vLLM), FlashAttention, speculative decoding, and model shapes from the Llama papers. OpenAI has published ChatGPT usage figures and has said it runs large Kubernetes clusters, but its production serving stack is not public. So this case is a reference design (inference and educational). The timings are illustrative.',
  overview:{what:'<b>A small example.</b> Someone asks a question. Within half a second the first words appear, and the answer streams in word by word. The same GPUs are serving hundreds of other conversations at that moment.', in:['API gateway, auth and rate limits', 'Request scheduling and continuous batching', 'KV-cache memory management', 'Token streaming', 'Prefix caching', 'Overload handling'], out:['Training and fine-tuning', 'Retrieval (see the vector-search lesson)', 'Safety models in depth', 'Billing']},
  challenges:['GPUs are expensive and scarce, so keeping them busy is everything', 'Requests vary from 10 to thousands of output tokens', 'KV cache memory, not compute, limits how many requests fit', 'Users judge speed by the time to the first token', 'Demand grows faster than GPUs can be added'],
  fr:['Chat completions with streaming', 'Long conversations (large context)', 'Multiple models and tiers', 'Usage limits per user and organisation'],
  nfr:['Time to first token under ~1 s for interactive use (illustrative)', 'High GPU utilisation', 'Fair sharing between users, with paid tiers first', 'Graceful degradation under overload', 'Conversations stored durably'],
  scale:[{k:'Weekly active users (ChatGPT, Nov 2023)', v:'100M', math:'From OpenAI DevDay (November 2023): 100,000,000 people a week', tag:'public'}, {k:'KV cache for one token (Llama 2 70B, FP16)', v:'320 KiB', math:'2 (key and value) × 80 layers × 8 KV heads × 128 dimensions × 2 bytes = 327,680 bytes = 320 KiB', tag:'public'}, {k:'One decode step for a batch of 32', v:'≈ 37 ms', math:'Say 18 ms fixed + 0.6 ms for each sequence: 18 + 32 × 0.6 = 37.2 ms', tag:'illustrative'}, {k:'Tokens a second for each GPU (continuous batching)', v:'≈ 800 to 900', math:'32 sequences each make 1 token per step: 32 ÷ 0.037 s ≈ 860', tag:'illustrative'}],
  arch:{w:930, h:390, minW:640, nodes:[
    {id:'user', type:'client', label:'Chat app', x:70, y:195, w:110},
    {id:'lb', type:'lb', label:'API gateway', sub:'SSE · rate limits', x:240, y:195, w:140, stage:3},
    {id:'app', type:'service', label:'API server', sub:'model on 1 GPU', x:430, y:195, w:150},
    {id:'db', type:'db', label:'Conversations', sub:'history', x:430, y:335, w:150},
    {id:'pcache', type:'cache', label:'Prefix cache', sub:'shared prompts’ KV', x:640, y:55, w:160, stage:4},
    {id:'sched', type:'service', label:'Scheduler', sub:'continuous batching', x:640, y:195, w:160, stage:1},
    {id:'gpu', type:'service', label:'GPU workers', sub:'inference engines', x:840, y:195, w:140, stage:1}],
   edges:[{from:'user', to:'app', gone:3}, {from:'app', to:'db'},
     {from:'app', to:'sched', stage:1}, {from:'sched', to:'gpu', stage:1},
     {from:'user', to:'lb', stage:3}, {from:'lb', to:'app', stage:3},
     {from:'sched', to:'pcache', stage:4}, {from:'gpu', to:'pcache', stage:4}]},
  evolution:[
    {title:'One server + one database', scale:'a demo', fix:'<p>An API server loads the model onto its GPU and answers one request at a time, returning the whole answer at the end. Conversations are stored in a database.</p>', after:{lat:8000, err:.5, load:30}},
    {title:'One request at a time: the GPU idles, the queue grows', scale:'1K users', hot:['app'], breaks:'<p>Decoding one sequence uses only a sliver of the GPU’s compute (it is limited by memory speed), so throughput is tiny and requests queue for minutes. Static batches help a little, but a batch runs until its longest answer ends.</p>', fix:'<p>A <b>scheduler</b> feeds a pool of <b>GPU workers</b> using <b>continuous batching</b> (scheduling at every step, from the Orca paper). At every decode step, finished sequences leave and waiting ones join, so the GPU always works on a full batch.</p><p>Compare static and continuous batching in Deep dives.</p>', sub:{app:'API only'}, before:{lat:60000, err:5, load:300}, after:{lat:1500, err:.3, load:70}, flow:[['app', 'sched', 'enqueue'], ['sched', 'gpu', 'join running batch']], lesson:['backpressure', 'latency-vs-throughput']},
    {title:'Out of GPU memory at 20 conversations', scale:'long chats', hot:['gpu'], breaks:'<p>Each token of each conversation keeps a key and a value vector for every layer in GPU memory. Reserving the maximum context for every request uses up memory after a few dozen requests, even though most of the reservation is never used.</p>', fix:'<p>Manage the <b>KV cache in small pages</b> that are given out as tokens are made (PagedAttention, vLLM). Use models with grouped-query attention (fewer KV heads) and store the KV cache at lower precision.</p><p>Several times more sequences then fit on the same GPU.</p>', sub:{gpu:'paged KV cache'}, before:{lat:5000, err:8, load:180}, after:{lat:1200, err:.3, load:75}, flow:[['sched', 'gpu', 'admit while pages free']], lesson:['capacity-planning', 'cache-eviction']},
    {title:'Answers take 30 s to appear', scale:'10K users', hot:['app'], breaks:'<p>Users stare at a spinner until the whole answer is ready. Long answers feel broken even when throughput is fine, and connections time out.</p>', fix:'<p><b>Stream the tokens</b> as they are made (server-sent events) through an <b>API gateway</b>. The gateway checks who the user is, applies <b>rate limits for each user and organisation</b> (requests and tokens a minute) and keeps long streams healthy.</p><p>Time to first token becomes the key delay to watch.</p>', before:{lat:30000, err:2, load:90}, after:{lat:600, err:.2, load:70}, flow:[['user', 'lb', 'POST /chat (stream)'], ['lb', 'app'], ['app', 'sched']], lesson:['realtime-transports', 'rate-limiting']},
    {title:'Everyone sends the same 2,000-token system prompt', scale:'1M users', hot:['gpu'], breaks:'<p>Every request starts with the same long system prompt, and often the same documents. The prefill step works out the same KV cache again each time, which wastes GPU time and delays the first token.</p>', fix:'<p>Use <b>prefix caching</b>. Keep the KV cache for common prefixes and reuse it for new requests that start the same way. Send requests with the same prefix to the same workers. Prefill then covers only the new part of the prompt.</p>', before:{lat:2000, err:.5, load:120}, after:{lat:500, err:.2, load:70}, flow:[['sched', 'pcache', 'prefix hit'], ['gpu', 'pcache', 'reuse KV pages']], lesson:['cache-layers', 'consistent-hashing']},
    {title:'Launch day: 10× demand, no spare GPUs', scale:'viral launch', hot:['lb', 'sched'], breaks:'<p>Demand jumps 10 times overnight, and GPUs take weeks to buy. Queues grow without limit, every request times out, and paying customers suffer along with everyone else.</p>', fix:'<p>Use <b>admission control</b>: tiered rate limits and <b>priority queues</b> (paid and interactive first, batch jobs later). Cap the answer length under load, send overflow to smaller or quantised models, and return a clear “at capacity” message instead of a timeout.</p><p>Speculative decoding and better kernels get more tokens out of each GPU.</p>', sub:{lb:'tiers · priorities', sched:'priority queues'}, before:{lat:60000, err:30, load:1000}, after:{lat:900, err:3, load:95}, flow:[['user', 'lb', 'free tier: at capacity, retry later'], ['lb', 'app', 'paid tier admitted']], lesson:['load-shedding', 'rate-limiting']}],
  flows:[
    {name:'Ask a question', steps:[
      {note:'The request is authenticated and checked against the rate limits, and a stream is opened.', flow:[['user', 'lb', 'POST /v1/chat/completions (stream)'], ['lb', 'app']]},
      {note:'The conversation history is loaded and the request is queued with its priority.', flow:[['app', 'db', 'history'], ['app', 'sched', 'enqueue (tier: paid)']]},
      {note:'The scheduler admits it into a running batch, and the KV cache for the shared prefix is reused.', flow:[['sched', 'pcache', 'prefix hit'], ['sched', 'gpu', 'join batch']]},
      {note:'Tokens stream back as each decode step finishes.', flow:[['gpu', 'sched', 'tokens'], ['sched', 'app'], ['app', 'lb', 'SSE: data: …'], ['lb', 'user']]}]},
    {name:'Overload', steps:[
      {note:'Free-tier requests over the limit are rejected quickly with advice on when to retry. Paid ones wait in a queue with priority.', flow:[['user', 'lb', 'request'], ['lb', 'user', '429 · retry-after']]}]}],
  breakIt:[
    {label:'A GPU worker fails', kill:['gpu'], verdict:'degrades', text:'Its running requests are retried on other workers (the stream restarts, or resumes from the last token delivered). Capacity drops until the worker is replaced.'},
    {label:'Prefix cache evicted', kill:['pcache'], verdict:'degrades', text:'Requests still work. Prefill gets longer and the time to first token rises until the cache warms up.'},
    {label:'Scheduler overloaded', hot:['sched'], verdict:'degrades', text:'Admission control drops the lowest tier first and caps the output length. Paid interactive traffic keeps flowing.'},
    {label:'Conversation DB slow', hot:['db'], verdict:'degrades', text:'New chats work, but loading long histories is slower. Cache recent conversations close to the API servers.'}],
  dataModel:{lang:'sql', title:'conversations, usage and the in-GPU state', code:`CREATE TABLE conversations (conv_id UUID PRIMARY KEY, user_id BIGINT, model TEXT, created_at TIMESTAMP);
CREATE TABLE messages (conv_id UUID, seq INT, role TEXT, content TEXT, tokens INT, PRIMARY KEY (conv_id, seq));
CREATE TABLE usage (org_id BIGINT, minute TIMESTAMP, requests INT, tokens INT, PRIMARY KEY (org_id, minute));  -- rate limits, billing
-- In GPU memory only: per running sequence → list of KV pages (block table), position, sampling state`, notes:'The costly state (the KV cache) lives in GPU memory. It can be rebuilt from the text if a request moves to another worker.'},
  apis:[
    {m:'POST', path:'/v1/chat/completions', note:'With stream=true, the server sends events, one for each chunk of tokens.', req:'{ "model": "chat-large", "stream": true, "messages": [ {"role": "system", "content": "…"}, {"role": "user", "content": "Explain CAP theorem simply"} ] }', res:'data: {"delta": "CAP"}\\n\\ndata: {"delta": " says"}\\n\\n… data: [DONE]'},
    {m:'HTTP', path:'429 Too Many Requests', note:'Headers tell clients when to retry and how much quota is left.', res:'retry-after: 20 · x-ratelimit-remaining-tokens: 0'}],
  algorithm:{title:'Continuous batching and the KV-cache budget', html:'<p>Throughput depends on keeping a full batch on the GPU. Latency depends on not making new requests wait for old ones. <b>Continuous batching</b> lets sequences join and leave at every step.</p><p>How many sequences fit is set by <b>KV cache memory</b>, which grows with every token made. Giving it out in pages, instead of reserving the maximum context, multiplies how many requests run at once.</p>', mount:host => { llmSim(host); host.append(hr()); kvSim(host); }},
  tradeoffs:[['Continuous batching', 'High GPU use and a low time to first token', 'A more complex scheduler and memory handling'], ['A paged KV cache', 'Many more sequences at once', 'Custom attention kernels'], ['Streaming responses', 'The wait you feel drops to the first token', 'Long-lived connections through every proxy'], ['Prefix caching', 'Cheaper prefill for shared prompts', 'Memory spent on cached prefixes, and requests must be routed to the right worker']],
  alternatives:[['Static batching', 'Simple and fine for offline batch jobs, but poor for interactive latency'], ['One GPU per request', 'Isolation, but terribly wasteful'], ['CPU inference', 'Viable for tiny models only']],
  failures:[['GPU worker', 'Retry on another worker'], ['Prefix cache', 'Slower prefill only'], ['Overload', 'Tiered admission control, and smaller models'], ['Conversation store', 'Cache recent history']],
  lab:{stack:['vLLM or TGI with a small open model (e.g. 1–8B)', 'A GPU (or a CPU build of a tiny model)', 'FastAPI gateway with SSE', 'Redis (rate limits)', 'k6 or a Python load generator'], milestones:[
    {day:'Day 1: serve', items:['Run an inference server, and stream tokens over SSE', 'Measure time to first token and tokens/s for one user', 'Add per-user token-per-minute limits']},
    {day:'Day 2: batch', items:['Load test with 1, 8, 32, 64 concurrent users', 'Compare throughput and p95 time to first token', 'Watch KV-cache usage vs batch size']},
    {day:'Day 3: overload', items:['Shared system prompt: enable prefix caching and compare first-token time', 'Two priority tiers, and shed the lower one under load', 'Fallback to a smaller model when the queue is long']}],
   pseudocode:{lang:'python', code:`# Continuous batching scheduler (simplified)
while True:
    running = [s for s in running if not s.finished]          # retire finished sequences every step
    while waiting and len(running) < MAX_BATCH and kv.free_pages() >= pages_for(waiting[0]):
        seq = waiting.pop_highest_priority()
        seq.kv = kv.allocate(prefill_pages(seq), reuse_prefix=True)   # paged KV, prefix cache
        running.append(seq)
    if not running:
        wait_for_request(); continue
    tokens = model.decode_step(running)                         # one token for every running sequence
    for seq, tok in zip(running, tokens):
        seq.stream(tok); kv.grow_if_needed(seq)`},
   loadTest:'<p>Generate requests with realistic prompt and answer lengths (a long tail) at rising rates. Record tokens a second, p50 and p95 time to first token, and end-to-end latency for static against continuous batching. Also record the most concurrent sequences before KV memory runs out.</p>'},
  twists:[{q:'Why is LLM decoding limited by memory, not by compute?', a:'Each decode step makes one token for each sequence, but it must read all the model weights (and that sequence’s KV cache) from GPU memory. With a small batch, the arithmetic for each byte read is tiny. Batching more sequences reuses each weight read, so batching raises throughput almost for free until memory runs out.'}, {q:'How would you make the time to first token fast for a long prompt?', a:'Prefill is heavy on compute. Cache shared prefixes, split prefill into chunks that are mixed in with decode steps so it does not stall other users, and send long-context requests to workers with free memory. Streaming hides the rest.'}, {q:'A user sends 50 requests in parallel. How do you keep it fair?', a:'Limit tokens a minute and concurrent requests for each user and organisation at the gateway. Use a queue for each tenant, so one heavy user cannot fill the queue. Serve the queues in turn within each priority tier.'}, {q:'A conversation is 100,000 tokens long. What goes wrong first?', a:'KV cache memory, because it grows with every token: 100,000 tokens × 320 KiB ≈ 32 GB for one sequence on a 70B model. Use a smaller KV footprint (grouped-query attention, lower precision), offload old pages to CPU memory, or summarise old turns, and charge more for long contexts.'}],
  real:[
    {co:'Continuous batching (Orca)', tier:'confirmed', text:'Iteration-level scheduling lets new requests join and finished ones leave a batch at every decoding iteration, improving throughput and latency.', src:'Yu et al., “Orca: A Distributed Serving System for Transformer-Based Generative Models” (OSDI 2022)'},
    {co:'PagedAttention (vLLM)', tier:'confirmed', text:'vLLM stores the KV cache in fixed-size pages, nearly eliminating fragmentation and allowing much larger batches.', src:'Kwon et al., “Efficient Memory Management for Large Language Model Serving with PagedAttention” (SOSP 2023)'},
    {co:'Model shapes', tier:'confirmed', text:'Llama 2 70B uses 80 layers and grouped-query attention with 8 key/value heads of dimension 128.', src:'Touvron et al., “Llama 2: Open Foundation and Fine-Tuned Chat Models” (2023)'},
    {co:'Faster decoding', tier:'confirmed', text:'FlashAttention makes attention IO-aware. Speculative decoding uses a small draft model to propose tokens that the large model checks in parallel.', src:'Dao et al., “FlashAttention” (NeurIPS 2022), Leviathan, Kalman & Matias, “Fast Inference from Transformers via Speculative Decoding” (ICML 2023)'},
    {co:'ChatGPT usage', tier:'confirmed', text:'OpenAI said ChatGPT had about 100 million weekly active users in November 2023, and has described running Kubernetes clusters of 7,500 nodes.', src:'OpenAI DevDay (2023), OpenAI blog, “Scaling Kubernetes to 7,500 nodes” (2021)'},
    {co:'Production serving stack', tier:'inference', text:'OpenAI’s and other providers’ internal serving systems are not public. This is a reference design built from published techniques.', src:'This case study'},
    {co:'Batching simulator', tier:'educational', text:'Synthetic step times and request lengths.', src:'This case study’s model'}],
  sources:['Yu et al.: Orca: A Distributed Serving System for Transformer-Based Generative Models (OSDI 2022)', 'Kwon et al.: Efficient Memory Management for LLM Serving with PagedAttention (SOSP 2023)', 'Dao et al.: FlashAttention (NeurIPS 2022)', 'Leviathan, Kalman & Matias: Fast Inference from Transformers via Speculative Decoding (ICML 2023)', 'Touvron et al.: Llama 2 (2023)', 'OpenAI: Scaling Kubernetes to 7,500 nodes (2021)']
});
})();
