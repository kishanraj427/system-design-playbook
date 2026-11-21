/* =====================================================================
   PART 6 · PLAYGROUNDS (a) — #11 Circuit breaker · #12 Retry + backoff + jitter
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, sv, esc, clamp, fmtNum, fmtDur, rng, shuffle} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const {css} = SDA.ph;

/* ---------------- #11 Circuit breaker ---------------- */
try {
SDA.register({kind:'playground', id:'circuit-breaker', module:'reliability', icon:'🔌', title:'Circuit breaker: closed → open → half-open',
  summary:'A client calls a dependency through a circuit breaker. Make the dependency fail or slow down and watch the breaker open, use a fallback, test with a few calls and close again.',
  explain:`<h3>How to use it</h3><ol><li>Set the dependency to <b>Failing</b> and keep the breaker <b>off</b>. Every call waits for an error.</li><li>Turn the breaker <b>on</b>. After enough failures it opens, and calls go straight to the fallback.</li><li>Set the dependency to <b>Slow</b>. Waiting calls pile up and fill the thread pool, so even unrelated requests fail.</li><li>Press <b>Run outage scenario</b> and watch the whole cycle.</li></ol><h3>What to notice</h3><ul><li>Waiting calls are about the request rate × the timeout.</li><li>In half-open, a few probe calls decide. If all succeed the breaker closes. If one fails it opens again.</li></ul><div class="callout tip"><b>Important point</b><p>A breaker protects both sides. Users get a quick fallback, and the failing service gets room to recover.</p></div>`,
  real:[{co:'Netflix Hystrix → Resilience4j', tier:'confirmed', text:'Netflix open-sourced Hystrix (2012) with circuit breakers, bulkhead thread pools and fallbacks. It entered maintenance mode in 2018, and Netflix pointed users to Resilience4j, which uses the same closed/open/half-open model with a sliding window.', src:'Netflix Tech Blog, Hystrix README, Resilience4j documentation'}, {co:'Michael Nygard, “Release It!”', tier:'confirmed', text:'The book that popularised the circuit-breaker pattern for software (2007).', src:'Nygard, Release It! (Pragmatic Bookshelf)'}],
  mount(host, api){
    const MODES = {healthy:{label:'Healthy', pf:.01, lo:30, hi:90}, flaky:{label:'Flaky (35% errors)', pf:.35, lo:30, hi:90}, failing:{label:'Failing (fast errors)', pf:1, lo:5, hi:15}, slow:{label:'Slow (2.5–4 s)', pf:0, lo:2500, hi:4000}};
    const P = {rate:40, mode:'healthy', on:true, fallback:true, timeout:1000, thr:50, minCalls:10, win:20, openMs:5000, probes:3, pool:30, speed:1};
    const R = rng(7);
    let S, running = !api.reduced;
    function reset(){ S = {t:0, acc:0, carry:0, state:'closed', openedAt:0, win:[], inflight:[], trialSent:0, trialOk:0, out:[], dep:[], log:[], sched:[], band:[]}; logBox.innerHTML = ''; addLog('Breaker CLOSED. Calls flow to the dependency.'); }
    const addLog = txt => { const ts = S ? (S.t / 1000).toFixed(1) + ' s' : '0.0 s'; logBox.prepend(el('div', {class:'ln'}, `[${ts}] ${txt}`)); while (logBox.childNodes.length > 40) logBox.lastChild.remove(); };
    function setState(st, why){ S.state = st; if (st === 'open'){ S.openedAt = S.t; } if (st === 'half'){ S.trialSent = 0; S.trialOk = 0; } if (st === 'closed') S.win = []; addLog(`→ ${st === 'half' ? 'HALF-OPEN' : st.toUpperCase()}: ${why}`); paintFSM(); }
    function record(kind, lat){ S.out.push({t:S.t, kind, lat}); }
    function arrive(){
      if (P.on && S.state === 'open' && S.t - S.openedAt >= P.openMs) setState('half', `open for ${P.openMs / 1000} s; letting ${P.probes} probe call(s) through`);
      let trial = false;
      if (P.on && S.state === 'open'){ record(P.fallback ? 'fallback' : 'error', 1); return; }
      if (P.on && S.state === 'half'){ if (S.trialSent >= P.probes){ record(P.fallback ? 'fallback' : 'error', 1); return; } trial = true; S.trialSent++; }
      if (S.inflight.length >= P.pool){ record(P.fallback ? 'fallback' : 'error', 0); S.rejected = (S.rejected || 0) + 1; return; }
      const m = MODES[P.mode]; const lat = m.lo + R() * (m.hi - m.lo); const ok = R() >= m.pf;
      S.dep.push(S.t);
      if (lat > P.timeout) S.inflight.push({end:S.t + P.timeout, ok:false, lat:P.timeout, trial, timeout:true});
      else S.inflight.push({end:S.t + lat, ok, lat, trial});
    }
    function complete(c){
      record(c.ok ? 'ok' : (P.fallback ? 'fallback' : 'error'), c.lat);
      if (!P.on) return;
      if (c.trial){
        if (S.state !== 'half') return;
        if (!c.ok) setState('open', `probe call ${c.timeout ? 'timed out' : 'failed'}; back to open for another ${P.openMs / 1000} s`);
        else if (++S.trialOk >= P.probes) setState('closed', `${P.probes}/${P.probes} probe calls succeeded; dependency looks healthy`);
        return;
      }
      if (S.state !== 'closed') return;
      S.win.push(c.ok); if (S.win.length > P.win) S.win.shift();
      const fails = S.win.filter(x => !x).length;
      if (S.win.length >= P.minCalls && fails * 100 / S.win.length >= P.thr) setState('open', `${fails}/${S.win.length} recent calls failed (${Math.round(fails * 100 / S.win.length)}% ≥ ${P.thr}%); failing fast for ${P.openMs / 1000} s`);
    }
    function tick(ms){
      const STEP = 10;
      S.carry += ms;
      while (S.carry >= STEP){
        S.carry -= STEP; S.t += STEP;
        while (S.sched.length && S.sched[0].at <= S.t){ const s = S.sched.shift(); setMode(s.mode, true); }
        if (P.on && S.state === 'open' && S.t - S.openedAt >= P.openMs) setState('half', `open for ${P.openMs / 1000} s; letting ${P.probes} probe call(s) through`);
        S.inflight.sort((a, b) => a.end - b.end);
        while (S.inflight.length && S.inflight[0].end <= S.t) complete(S.inflight.shift());
        S.acc += P.rate * STEP / 1000; while (S.acc >= 1){ S.acc--; arrive(); }
        if (S.t % 250 === 0){ S.band.push({t:S.t, state:P.on ? S.state : 'none', mode:P.mode}); }
      }
      const cut = S.t - 20000; while (S.out.length && S.out[0].t < cut) S.out.shift(); while (S.dep.length && S.dep[0] < S.t - 3000) S.dep.shift(); while (S.band.length && S.band[0].t < cut) S.band.shift();
    }
    /* ---------- UI ---------- */
    const logBox = el('div', {class:'lab-out', style:{maxHeight:'150px', borderRadius:'10px', border:'1px solid var(--border)'}, 'aria-live':'polite'});
    const fsm = sv('svg', {viewBox:'0 0 560 170', class:'mini-chart', role:'img'}); const ft = sv('title'); ft.textContent = 'Circuit breaker state machine: closed, open, half-open'; fsm.append(ft);
    const defs = sv('defs'); const mk = sv('marker', {id:'cbArrow', viewBox:'0 0 10 10', refX:'9', refY:'5', markerWidth:'7', markerHeight:'7', orient:'auto'}); const mp = sv('path', {d:'M0 0 L10 5 L0 10 z'}); mp.style.fill = 'var(--muted)'; mk.append(mp); defs.append(mk); fsm.append(defs);
    const ST = {closed:{x:90, y:85, c:'--ok', label:'CLOSED', sub:'calls pass'}, open:{x:470, y:85, c:'--bad', label:'OPEN', sub:'fail fast'}, half:{x:280, y:85, c:'--warn', label:'HALF-OPEN', sub:'probing'}};
    const arrow = (d, txt, tx, ty) => { const p = sv('path', {d, fill:'none', 'marker-end':'url(#cbArrow)', 'stroke-width':'1.6'}); p.style.stroke = 'var(--muted)'; fsm.append(p); const t = sv('text', {x:tx, y:ty, 'text-anchor':'middle', 'font-size':'11'}); t.style.fill = 'var(--muted)'; t.textContent = txt; fsm.append(t); };
    arrow('M150 60 Q280 0 410 60', 'failure rate ≥ threshold', 280, 22);
    arrow('M425 110 Q380 150 335 110', 'open duration elapsed', 380, 160);
    arrow('M225 110 Q180 150 145 110', 'all probes succeed', 180, 160);
    arrow('M330 72 Q400 55 412 72', 'a probe fails', 372, 52);
    const stG = {};
    Object.entries(ST).forEach(([k, s]) => { const g = sv('g'); const c = sv('circle', {cx:s.x, cy:s.y, r:48, 'stroke-width':'3'}); c.style.fill = 'var(--surface-2)'; c.style.stroke = `var(${s.c})`; const t1 = sv('text', {x:s.x, y:s.y - 2, 'text-anchor':'middle', 'font-weight':'800', 'font-size':'13'}); t1.style.fill = 'var(--text)'; t1.textContent = s.label; const t2 = sv('text', {x:s.x, y:s.y + 16, 'text-anchor':'middle', 'font-size':'11'}); t2.style.fill = 'var(--muted)'; t2.textContent = s.sub; g.append(c, t1, t2); fsm.append(g); stG[k] = {g, c}; });
    function paintFSM(){ Object.entries(stG).forEach(([k, o]) => { const on = P.on && S && S.state === k; o.c.style.fill = on ? `color-mix(in srgb, var(${ST[k].c}) 28%, var(--surface-2))` : 'var(--surface-2)'; o.g.style.opacity = P.on ? (on ? '1' : '.45') : '.25'; }); }
    const cv = el('canvas', {height:360, style:{height:'180px'}, 'aria-label':'Outcomes over the last 20 seconds: successes, fallbacks and errors per quarter second, with the breaker state band below'}); const box = el('div', {class:'chart-box', style:{marginTop:'10px'}}, cv);
    function draw(){
      const W = box.clientWidth || 640, H = 180; cv.width = W * 2; const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, W, H);
      const t1 = S.t, t0 = t1 - 20000, BW = 250, n = 80, bw = (W - 20) / n; const B = Array.from({length:n}, () => ({ok:0, fallback:0, error:0}));
      S.out.forEach(o => { const i = Math.floor((o.t - t0) / BW); if (i >= 0 && i < n) B[i][o.kind]++; });
      const mx = Math.max(4, P.rate * BW / 1000 * 1.4); const base = H - 34;
      const col = {ok:css('--ok'), fallback:css('--warn'), error:css('--bad')};
      B.forEach((b, i) => { let y = base; ['ok', 'fallback', 'error'].forEach(k => { const hgt = b[k] / mx * (base - 16); g.fillStyle = col[k]; g.fillRect(10 + i * bw, y - hgt, Math.max(1, bw - 1), hgt); y -= hgt; }); });
      S.band.forEach(b => { const x = 10 + (b.t - t0) / 20000 * (W - 20); g.fillStyle = b.state === 'open' ? col.error : b.state === 'half' ? col.fallback : b.state === 'closed' ? col.ok : css('--border'); g.fillRect(x, base + 6, Math.max(1, bw), 8); g.fillStyle = b.mode === 'healthy' ? css('--accent1') : css('--accent2'); g.globalAlpha = b.mode === 'healthy' ? .35 : .9; g.fillRect(x, base + 18, Math.max(1, bw), 6); g.globalAlpha = 1; });
      g.font = '11px ' + css('--font-mono'); g.fillStyle = css('--muted'); g.fillText('per ¼ s: ■ success  ■ fallback  ■ error', 10, 12); g.fillText('breaker', W - 60, base + 14); g.fillText('dependency', W - 80, base + 30 > H ? H - 2 : base + 30);
    }
    const met = ui.metrics(null, [{id:'state', label:'Breaker state'}, {id:'ok', label:'Real successes', unit:'%', instant:true, dir:'down', warn:90, bad:60}, {id:'served', label:'Users served (incl. fallback)', unit:'%', instant:true, dir:'down', warn:95, bad:70}, {id:'p99', label:'p99 user latency', instant:true, fmt:v => fmtDur(v), warn:500, bad:1000}, {id:'dep', label:'Calls hitting dependency', unit:'/s', instant:true}, {id:'inf', label:'In-flight / pool', instant:true}]);
    function render(){
      const rec = S.out.filter(o => o.t > S.t - 3000); const n = rec.length || 1;
      met.set('state', P.on ? ({closed:'🟢 Closed', open:'🔴 Open', half:'🟡 Half-open'})[S.state] : '⚪ No breaker');
      if (rec.length){ met.set('ok', rec.filter(o => o.kind === 'ok').length * 100 / n); met.set('served', rec.filter(o => o.kind !== 'error').length * 100 / n); } else { met.set('ok', 'n/a', ''); met.set('served', 'n/a', ''); }
      const lats = rec.map(o => o.lat).sort((a, b) => a - b); met.set('p99', lats.length ? lats[Math.min(lats.length - 1, Math.floor(lats.length * .99))] : 0);
      met.set('dep', S.dep.length / 3); met.set('inf', `${S.inflight.length} / ${P.pool}`, S.inflight.length >= P.pool ? 'bad' : S.inflight.length > P.pool * .7 ? 'warn' : '');
      draw(); paintFSM();
    }
    let lastUI = 0;
    api.loop(dt => { if (!running) return; tick(dt * 1000 * P.speed); if (S.t - lastUI >= 200){ lastUI = S.t; render(); } });
    const modeSel = ui.select({label:'Dependency behaviour', value:'healthy', options:Object.entries(MODES).map(([k, m]) => [k, m.label]), onChange:v => setMode(v)});
    function setMode(v, scripted){ if (P.mode === v) return; P.mode = v; modeSel.set(v); addLog(`${scripted ? 'Scenario: ' : ''}dependency is now ${MODES[v].label.toLowerCase()}`); }
    const runBtn = ui.button(running ? '⏸ Pause' : '▶ Play', () => { running = !running; runBtn.innerHTML = running ? '⏸ Pause' : '▶ Play'; }, 'sm primary');
    host.append(
      el('div', {class:'ctl-grid'},
        modeSel.el,
        ui.slider({label:'Request rate', min:5, max:120, step:5, value:P.rate, fmt:v => v + ' req/s', onInput:v => P.rate = v}).el,
        ui.slider({label:'Failure-rate threshold', min:10, max:90, step:5, value:P.thr, fmt:v => v + '%', onInput:v => P.thr = v}).el,
        ui.slider({label:'Minimum calls before tripping', min:5, max:40, step:1, value:P.minCalls, fmt:v => v + ' calls', onInput:v => { P.minCalls = v; P.win = Math.max(P.win, v); }}).el,
        ui.slider({label:'Open duration', min:1000, max:15000, step:500, value:P.openMs, fmt:v => v / 1000 + ' s', onInput:v => P.openMs = v}).el,
        ui.slider({label:'Half-open probe calls', min:1, max:10, step:1, value:P.probes, fmt:v => String(v), onInput:v => P.probes = v}).el,
        ui.slider({label:'Call timeout', min:200, max:3000, step:100, value:P.timeout, fmt:v => fmtDur(v), onInput:v => P.timeout = v}).el,
        ui.slider({label:'Thread pool (bulkhead) size', min:5, max:100, step:5, value:P.pool, fmt:v => v + ' threads', onInput:v => P.pool = v}).el,
        el('label', {class:'field'}, el('span', null, 'Simulation speed'), ui.speedSelect(v => P.speed = v))),
      el('div', {class:'controls', style:{margin:'10px 0'}},
        ui.toggle({label:'Circuit breaker on', checked:true, onChange:v => { P.on = v; if (v){ S.state = 'closed'; S.win = []; } addLog(v ? 'Breaker enabled (closed).' : 'Breaker disabled: every call goes to the dependency.'); paintFSM(); }}).el,
        ui.toggle({label:'Fallback (cached / default response)', checked:true, onChange:v => P.fallback = v}).el,
        runBtn,
        ui.button('⏭ Step ½ s', () => { running = false; runBtn.innerHTML = '▶ Play'; tick(500); render(); }, 'sm'),
        ui.button('🎬 Run outage scenario', () => { reset(); setMode('healthy'); S.sched = [{at:3000, mode:'failing'}, {at:13000, mode:'healthy'}]; addLog('Scenario: healthy for 3 s → failing for 10 s → healthy.'); if (!running){ running = true; runBtn.innerHTML = '⏸ Pause'; } render(); }, 'sm'),
        ui.button('⏮ Reset', () => { reset(); render(); }, 'sm ghost')),
      el('div', {class:'chart-box'}, fsm), box, el('div', {style:{height:'10px'}}), met.el, el('div', {style:{height:'10px'}}), el('b', null, 'Event log'), logBox,
      el('p', {class:'lab-hint'}, 'Simulated in 10 ms steps. A count-based sliding window holds the last 20 completed calls. Short-circuited calls take about 1 ms. A fallback counts as “served” but not as a real success, because the user gets degraded data. Rejections because the thread pool is full count as failures for the user, not for the breaker.' + (api.reduced ? ' Reduced motion is on, so the simulation starts paused: press Play or Step.' : '')));
    reset(); render();
  }
});
} catch(e){ console.error('[SDA] playground circuit-breaker', e); SDA.errors.push({id:'circuit-breaker', error:e}); }

/* ---------------- #12 Retry + backoff + jitter ---------------- */
try {
const POLICIES = [['none', 'No retries'], ['fixed', 'Immediate retry (fixed base delay)'], ['expo', 'Exponential backoff, no jitter'], ['full', 'Exponential + full jitter'], ['equal', 'Exponential + equal jitter'], ['decor', 'Decorrelated jitter']];
function simulateRetries(o, policy, seed){
  const R = rng(seed); const B = 50, T = o.T, nb = Math.ceil(T / B), capB = o.cap * B / 1000;
  const buckets = Array.from({length:nb}, () => ({att:0, ok:0, fail:0, retry:0}));
  const sched = Array.from({length:nb}, () => []);
  let id = 0, acc = 0, tokens = 100, calls = 0, ok = 0, gaveUp = 0, throttled = 0, unfinished = 0, herdOk = 0, herdN = 0; const lat = [];
  const herdAt = 2000, outFrom = 2000, outTo = 2000 + o.outage * 1000;
  for (let b = 0; b < nb; b++){
    const t = b * B; const list = sched[b];
    acc += o.lambda * B / 1000; while (acc >= 1){ acc--; list.push({id:id++, k:0, start:t, prev:o.base}); }
    if (o.scenario === 'herd' && t === herdAt) for (let i = 0; i < o.herd; i++){ herdN++; list.push({id:id++, k:0, start:t, prev:o.base, herd:true}); }
    shuffle(list, R);
    const up = o.scenario !== 'outage' || t < outFrom || t >= outTo; let served = 0; const bk = buckets[b];
    for (const q of list){
      calls++; bk.att++; if (q.k) bk.retry++;
      if (up && served < capB){ served++; bk.ok++; ok++; if (q.herd) herdOk++; lat.push(t - q.start); tokens = Math.min(100, tokens + .1); continue; }
      bk.fail++; tokens = Math.max(0, tokens - 1);
      if (policy === 'none' || q.k + 1 >= o.max){ gaveUp++; continue; }
      if (o.budget && tokens <= 50){ gaveUp++; throttled++; continue; }
      const k = q.k, expo = Math.min(o.capMs, o.base * Math.pow(2, k)); let d;
      if (policy === 'fixed') d = o.base;
      else if (policy === 'expo') d = expo;
      else if (policy === 'full') d = R() * expo;
      else if (policy === 'equal') d = expo / 2 + R() * expo / 2;
      else { q.prev = Math.min(o.capMs, o.base + R() * (q.prev * 3 - o.base)); d = q.prev; }
      const nbx = b + Math.max(1, Math.ceil(d / B));
      if (nbx < nb) sched[nbx].push({id:q.id, k:k + 1, start:q.start, prev:q.prev, herd:q.herd}); else unfinished++;
    }
  }
  lat.sort((a, b) => a - b);
  const evStart = o.scenario === 'outage' ? outTo : herdAt; let rec = null, clean = 0;
  for (let b = Math.floor(evStart / B); b < nb; b++){ if (buckets[b].fail === 0) { clean++; if (clean >= 1000 / B){ rec = (b + 1) * B - 1000 - evStart; break; } } else clean = 0; }
  const peak = Math.max(...buckets.map(x => x.retry)) * 1000 / B;
  return {buckets, B, T, calls, ok, gaveUp, throttled, unfinished, reqs:id, amp:calls / Math.max(1, id), peak, rec, herdServed:herdN ? herdOk * 100 / herdN : null, p99:lat.length ? lat[Math.floor(lat.length * .99)] : 0, succ:ok * 100 / Math.max(1, ok + gaveUp)};
}
SDA.retrySim = simulateRetries;
SDA.register({kind:'playground', id:'retry-jitter', module:'reliability', icon:'🔁', title:'Retry storms: backoff and jitter',
  summary:'Thousands of clients retry against a server with fixed capacity. Compare no retries, instant retries, exponential backoff and jitter, with an optional retry budget.',
  explain:`<h3>How to use it</h3><ol><li>Run the <b>thundering herd</b>. 2,000 clients reconnect at once, and the server can serve only 300 requests a second.</li><li>Compare exponential backoff without jitter and with full jitter. Without jitter, clients that failed together retry together, in tall spikes.</li><li>Run the <b>outage</b> scenario and turn on the <b>retry budget</b>. Retries stop when too many recent calls have failed.</li></ol><h3>What to notice</h3><ul><li>Full jitter waits a random time, so retries spread out and fewer calls are wasted.</li><li>Jitter fixes timing. The attempt count and the cap decide how long you keep trying.</li></ul><div class="callout tip"><b>Important point</b><p>Retrying all at once makes an overloaded server worse. Random waits spread the load.</p></div>`,
  real:[{co:'AWS: “Exponential Backoff and Jitter”', tier:'confirmed', text:'AWS’s architecture blog (Marc Brooker, 2015) simulated contending clients and showed that full or decorrelated jitter greatly reduces total calls and completion time compared with un-jittered backoff. AWS SDKs use backoff with jitter.', src:'AWS Architecture Blog (2015); Amazon Builders’ Library, “Timeouts, retries, and backoff with jitter”'}, {co:'gRPC retry throttling', tier:'confirmed', text:'gRPC’s retry design throttles retries with a token bucket: failures subtract a token, successes add a fraction, and retries stop when tokens fall below half.', src:'gRPC proposal A6 “Client Retries”'}],
  mount(host, api){
    const P = {scenario:'herd', policy:'expo', cmp:'full', base:100, capMs:5000, max:6, budget:false, lambda:150, cap:300, herd:2000, outage:3, T:15000};
    const cv = el('canvas', {height:520, style:{height:'260px'}, 'aria-label':'Calls per 50 ms over time: successful and failed attempts, server capacity line, and a comparison policy'}); const box = el('div', {class:'chart-box', style:{marginTop:'12px'}}, cv);
    const metA = ui.metrics(null, [{id:'succ', label:'Requests succeeded', unit:'%', instant:true, dir:'down', warn:95, bad:70}, {id:'calls', label:'Total calls', instant:true}, {id:'amp', label:'Calls per request', unit:'×', instant:true, fmt:v => v.toFixed(2), warn:1.5, bad:3}, {id:'peak', label:'Peak retry load', unit:'/s', instant:true}, {id:'rec', label:'Herd served / time to stabilise', instant:true}, {id:'p99', label:'p99 time-to-success', instant:true, fmt:v => fmtDur(v)}]);
    const cmpBox = el('div'); let A, Bres, cursor = 1;
    const label = id => POLICIES.find(p => p[0] === id)[1];
    function run(){
      A = simulateRetries(P, P.policy, 42); Bres = P.cmp !== 'off' ? simulateRetries(P, P.cmp, 42) : null; cursor = api.reduced ? 1 : 0; anim = true;
      metA.set('succ', A.succ); metA.set('calls', A.calls); metA.set('amp', A.amp); metA.set('peak', A.peak, A.peak > P.cap * 2 ? 'bad' : A.peak > P.cap ? 'warn' : ''); if (P.scenario === 'herd') metA.set('rec', A.herdServed.toFixed(1) + '% of herd', A.herdServed < 50 ? 'bad' : A.herdServed < 90 ? 'warn' : ''); else metA.set('rec', A.rec == null ? 'not within window' : fmtDur(A.rec) + ' after outage', A.rec == null ? 'bad' : ''); metA.set('p99', A.p99);
      cmpBox.innerHTML = '';
      if (Bres){
        const row = (k, f) => [k, f(A), f(Bres)];
        cmpBox.append(SDA.ph.frag(h.table(['', `<b>${esc(label(P.policy))}</b>`, `<span style="color:var(--accent2)">${esc(label(P.cmp))}</span>`], [
          row('Requests succeeded', r => r.succ.toFixed(1) + '%'), row('Gave up', r => fmtNum(r.gaveUp) + (r.throttled ? ` (${fmtNum(r.throttled)} throttled by budget)` : '')), row('Total calls', r => fmtNum(r.calls)), row('Calls per request', r => r.amp.toFixed(2) + '×'), row('Peak retry load', r => fmtNum(r.peak) + ' /s'), P.scenario === 'herd' ? row('Herd clients served', r => r.herdServed.toFixed(1) + '%') : row('Time to stabilise after outage', r => r.rec == null ? 'not within window' : fmtDur(r.rec))], [1, 2])));
      }
      draw();
    }
    let anim = false;
    function draw(){
      const W = box.clientWidth || 640, H = 260; cv.width = W * 2; const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, W, H);
      const n = A.buckets.length, bw = (W - 50) / n, show = Math.floor(n * cursor), capB = P.cap * A.B / 1000;
      const mx = Math.max(capB * 2.5, ...A.buckets.map(b => b.att), ...(Bres ? Bres.buckets.map(b => b.att) : [0])); const Y = v => H - 26 - Math.sqrt(Math.min(v, mx) / mx) * (H - 46);
      if (P.scenario === 'outage'){ g.fillStyle = css('--bad'); g.globalAlpha = .1; g.fillRect(40 + 2000 / A.B * bw, 14, P.outage * 1000 / A.B * bw, H - 40); g.globalAlpha = 1; }
      for (let i = 0; i < show; i++){ const b = A.buckets[i]; g.fillStyle = css('--ok'); g.fillRect(40 + i * bw, Y(b.ok), Math.max(1, bw - .3), H - 26 - Y(b.ok)); g.fillStyle = css('--bad'); g.fillRect(40 + i * bw, Y(b.att), Math.max(1, bw - .3), Y(b.ok) - Y(b.att)); }
      if (Bres){ g.strokeStyle = css('--accent2'); g.lineWidth = 1.6; g.beginPath(); for (let i = 0; i < show; i++){ const x = 40 + (i + .5) * bw, y = Y(Bres.buckets[i].att); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.lineWidth = 1; }
      g.strokeStyle = css('--warn'); g.setLineDash([5, 4]); g.beginPath(); g.moveTo(40, Y(capB)); g.lineTo(W - 10, Y(capB)); g.stroke(); g.setLineDash([]);
      g.font = '11px ' + css('--font-mono'); g.fillStyle = css('--muted'); g.fillText(`capacity ${P.cap}/s = ${fmtNum(capB)} per 50 ms`, W - 210, Y(capB) - 4);
      g.fillText('calls per 50 ms (√ scale):  ■ ok  ■ failed  - comparison', 40, 12); for (let s = 0; s <= A.T / 1000; s += 3){ g.fillText(s + 's', 40 + s * 1000 / A.B * bw - 6, H - 8); }
      [capB, capB * 10, capB * 50, mx].filter((v, i, arr) => v <= mx && (i === arr.length - 1 || v < mx * .7)).forEach(v => { g.fillStyle = css('--muted'); g.fillText(fmtNum(v), 4, Y(v) + 4); g.strokeStyle = css('--border'); g.beginPath(); g.moveTo(36, Y(v)); g.lineTo(40, Y(v)); g.stroke(); }); g.fillText('0', 24, H - 26);
    }
    api.loop(dt => { if (!anim) return; cursor = Math.min(1, cursor + dt / 3); draw(); if (cursor >= 1) anim = false; });
    const scen = ui.select({label:'Scenario', value:'herd', options:[['herd', 'Thundering herd: 2,000 clients reconnect at once'], ['outage', 'Server outage with steady traffic']], onChange:v => { P.scenario = v; run(); }});
    host.append(
      el('div', {class:'ctl-grid'}, scen.el,
        ui.select({label:'Retry policy (bars)', value:P.policy, options:POLICIES, onChange:v => { P.policy = v; run(); }}).el,
        ui.select({label:'Compare with (line)', value:P.cmp, options:[['off', 'None']].concat(POLICIES), onChange:v => { P.cmp = v; run(); }}).el,
        ui.slider({label:'Base delay', min:20, max:500, step:10, value:P.base, fmt:v => v + ' ms', onInput:v => { P.base = v; run(); }}).el,
        ui.slider({label:'Max attempts (incl. first)', min:1, max:10, step:1, value:P.max, fmt:v => String(v), onInput:v => { P.max = v; run(); }}).el,
        ui.slider({label:'Backoff cap', min:500, max:10000, step:500, value:P.capMs, fmt:v => fmtDur(v), onInput:v => { P.capMs = v; run(); }}).el,
        ui.slider({label:'Server capacity', min:100, max:1000, step:50, value:P.cap, fmt:v => v + ' req/s', onInput:v => { P.cap = v; run(); }}).el,
        ui.slider({label:'Outage length (outage scenario)', min:1, max:8, step:1, value:P.outage, fmt:v => v + ' s', onInput:v => { P.outage = v; run(); }}).el),
      el('div', {class:'controls', style:{margin:'10px 0'}}, ui.toggle({label:'Retry budget (gRPC-style token throttling)', checked:false, onChange:v => { P.budget = v; run(); }}).el, ui.button('▶ Replay', () => { cursor = 0; anim = true; }, 'sm primary'), ui.button('⏮ Reset', () => { cursor = 0; anim = false; draw(); }, 'sm ghost'), ui.button('⏭ Show all', () => { cursor = 1; anim = false; draw(); }, 'sm')),
      box, el('div', {style:{height:'10px'}}), metA.el, el('div', {style:{height:'10px'}}), cmpBox,
      el('p', {class:'lab-hint'}, 'Deterministic simulation (seeded random numbers) in 50 ms buckets over 15 s, with 150 new requests/s of background traffic. The server serves up to its capacity per bucket and rejects the rest instantly. “Peak retry load” is the highest rate of retry attempts (first attempts excluded). In the outage scenario, “time to stabilise” is how long after the outage the system first goes a full second with no failed call.'));
    run();
  }
});
} catch(e){ console.error('[SDA] playground retry-jitter', e); SDA.errors.push({id:'retry-jitter', error:e}); }
})();
