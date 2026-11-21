/* =====================================================================
   PART 7 · MODULE 11 — OBSERVABILITY & OPS
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, esc, clamp, fmtNum, fmtDur, rng} = SDA.u; const ui = SDA.ui;
const {sortGame, orderGame} = SDA.m1helpers; const {css, frag} = SDA.ph;

/* ---------- widgets ---------- */
function traceDemo(host){
  const P = {slowDb:false, nplus1:false, parallel:true, cacheHit:true};
  const out = el('div'); const logs = el('div', {class:'lab-out', style:{maxHeight:'170px', borderRadius:'10px', border:'1px solid var(--border)'}});
  function build(){
    const S = []; let id = 0; const tid = '4bf92f3577b34da6';
    const span = (name, svc, start, dur, parent, extra) => { const s = {id:(++id).toString(16).padStart(4, '0'), name, svc, start, dur, end:start + dur, parent, kids:[], extra:extra || ''}; S.push(s); if (parent) parent.kids.push(s); return s; };
    const root = span('GET /checkin/AB123', 'gateway', 0, 0, null);
    const auth = span('auth.verifyToken', 'auth', 2, 6, root);
    let t = auth.end + 1;
    const branch = (fn) => { const s0 = t; const e = fn(s0); if (!P.parallel) t = e + 1; return e; };
    const ends = [];
    ends.push(branch(s0 => { const c = span('booking.getBooking', 'booking', s0, 0, root); let ct = s0 + 2; const n = P.nplus1 ? 12 : 1; for (let i = 0; i < n; i++){ const q = span(P.nplus1 ? `SELECT * FROM segments WHERE id=$1  (#${i + 1})` : 'SELECT * FROM bookings WHERE pnr=$1', 'postgres', ct, P.nplus1 ? 9 : 14, c); ct = q.end + 1; } c.dur = ct + 3 - s0; c.end = s0 + c.dur; return c.end; }));
    ends.push(branch(s0 => { const r = span('seats.availability', 'seats', s0, 0, root); let rt = s0 + 1; const ch = span('redis GET seats:AB123', 'redis', rt, 1.2, r, P.cacheHit ? 'hit' : 'miss'); rt = ch.end + .5; if (!P.cacheHit){ const q = span('SELECT count(*)… FROM seats', 'postgres', rt, P.slowDb ? 820 : 35, r, P.slowDb ? 'Seq Scan (missing index)' : 'Index Scan'); rt = q.end + 1; } r.dur = rt + 1 - s0; r.end = s0 + r.dur; return r.end; }));
    ends.push(branch(s0 => { const o = span('baggage.allowance', 'baggage', s0, 22, root); return o.end; }));
    ends.push(branch(s0 => { const e = span('gate.info', 'gate', s0, 48, root); return e.end; }));
    root.dur = Math.max(...ends) + 3; root.end = root.dur;
    const crit = new Set(); const mark = s => { crit.add(s); if (!s.kids.length) return; const last = s.kids.reduce((a, b) => b.end > a.end ? b : a); mark(last); }; mark(root); crit.add(auth); if (!P.parallel) root.kids.forEach(mark);
    return {S, root, crit, tid};
  }
  function run(){
    const {S, root, crit, tid} = build(); out.innerHTML = ''; logs.innerHTML = '';
    const W = 100 / root.dur; const box = el('div', {class:'card', style:{padding:'10px 12px'}});
    box.append(el('div', {class:'row', style:{justifyContent:'space-between', marginBottom:'8px'}}, el('b', null, `Trace ${tid}`), el('span', {class:'chip mono'}, `total ${fmtDur(root.dur)}`)));
    const depth = s => { let d = 0, p = s.parent; while (p){ d++; p = p.parent; } return d; };
    S.forEach(s => {
      const c = crit.has(s); const color = s.svc === 'postgres' ? 'var(--c-db)' : s.svc === 'redis' ? 'var(--c-cache)' : s.svc === 'gateway' ? 'var(--c-lb)' : 'var(--c-service)';
      box.append(el('div', {style:{display:'grid', gridTemplateColumns:'minmax(120px, 38%) 1fr', gap:'8px', alignItems:'center', fontSize:'12px', margin:'2px 0'}},
        el('div', {class:'mono', style:{paddingLeft:depth(s) * 10 + 'px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:c ? 'var(--text)' : 'var(--muted)'}, title:s.name}, `${s.svc} · ${s.name}`),
        el('div', {style:{position:'relative', height:'16px', background:'var(--surface-2)', borderRadius:'4px'}},
          el('div', {style:{position:'absolute', left:s.start * W + '%', width:Math.max(.6, s.dur * W) + '%', top:'2px', bottom:'2px', borderRadius:'3px', background:color, opacity:c ? '1' : '.45', outline:c ? '1px solid var(--text)' : 'none'}, title:`${s.name}: ${fmtDur(s.dur)}`}),
          el('span', {class:'mono', style:{position:'absolute', left:Math.min(80, (s.start + s.dur) * W + 1) + '%', top:'0', fontSize:'10px', color:'var(--muted)'}}, fmtDur(s.dur) + (s.extra ? ' ' + s.extra : '')))));
    });
    out.append(box);
    const slowest = S.filter(s => !s.kids.length && crit.has(s)).sort((a, b) => b.dur - a.dur)[0];
    out.append(el('div', {class:'verdict ' + (root.dur > 300 ? 'bad' : root.dur > 120 ? 'warn' : 'ok')}, `Critical path (outlined): ${[...new Set([...crit].sort((a, b) => a.start - b.start).map(s => s.svc))].join(' → ')}. ${root.dur > 120 ? `Fix “${slowest.name}” first; speeding up anything off the critical path won’t change the total.` : 'Healthy: the parallel branches overlap, so the total is roughly the slowest branch.'}`));
    S.slice(0, 9).forEach(s => logs.append(el('div', {class:'ln'}, `{"ts":"…${(s.start / 1000).toFixed(3)}","level":"${s.dur > 300 ? 'WARN' : 'INFO'}","service":"${s.svc}","trace_id":"${tid}","span_id":"${s.id}","msg":"${s.name.replace(/"/g, '')}","duration_ms":${s.dur.toFixed(1)}}`)));
  }
  host.append(el('div', {class:'controls'},
    ui.toggle({label:'Seat map cache hit', checked:true, onChange:v => { P.cacheHit = v; run(); }}).el,
    ui.toggle({label:'Missing DB index (slow query)', checked:false, onChange:v => { P.slowDb = v; run(); }}).el,
    ui.toggle({label:'N+1 queries in booking lookup', checked:false, onChange:v => { P.nplus1 = v; run(); }}).el,
    ui.toggle({label:'Call branches in parallel', checked:true, onChange:v => { P.parallel = v; run(); }}).el), out,
    el('b', {style:{display:'block', marginTop:'10px'}}, 'Structured logs for the same request (joined by trace_id)'), logs);
  run();
}
function burnRateSim(host){
  const SLO = .999, BUDGET = 1 - SLO, MIN = 3 * 1440;
  const SCEN = {
    outage:{label:'Major outage: 10% errors for 20 min', gen:(m, R) => (m >= 2000 && m < 2020) ? .10 : .0002 + R() * .0002},
    slow:{label:'Slow burn: 0.4% errors for 24 h', gen:(m, R) => (m >= 1200 && m < 2640) ? .004 : .0002 + R() * .0002},
    blips:{label:'Noise: six 3-minute blips at 3%', gen:(m, R) => [600, 1100, 1800, 2500, 3300, 3900].some(b => m >= b && m < b + 3) ? .03 : .0002 + R() * .0002}};
  const POL = [
    {id:'s1', label:'Static: error rate > 1% for 1 min → page'},
    {id:'s10', label:'Static: error rate > 1% for 10 min → page'},
    {id:'burn', label:'SLO burn rate, multi-window (SRE workbook)'}];
  const out = el('div');
  function evalScen(key){
    const R = rng(21); const e = Array.from({length:MIN}, (_, m) => SCEN[key].gen(m, R));
    const pre = [0]; e.forEach(x => pre.push(pre[pre.length - 1] + x));
    const avg = (m, w) => { const a = Math.max(0, m - w + 1); return (pre[m + 1] - pre[a]) / (m + 1 - a); };
    const burn = (m, w) => avg(m, w) / BUDGET;
    const res = {};
    POL.forEach(p => {
      let pages = 0, first = null, tickets = 0, firstT = null, firing = false, tFiring = false;
      for (let m = 0; m < MIN; m++){
        let fire = false, tk = false;
        if (p.id === 's1') fire = e[m] > .01;
        else if (p.id === 's10') fire = avg(m, 10) > .01 && e.slice(Math.max(0, m - 9), m + 1).every(x => x > .01);
        else { fire = (burn(m, 60) > 14.4 && burn(m, 5) > 14.4) || (burn(m, 360) > 6 && burn(m, 30) > 6); tk = !fire && burn(m, 4320) > 1 && burn(m, 360) > 1; }
        if (fire && !firing){ pages++; if (first == null) first = m; } firing = fire;
        if (tk && !tFiring){ tickets++; if (firstT == null) firstT = m; } tFiring = tk;
      }
      res[p.id] = {pages, first, tickets, firstT};
    });
    const consumed = e.reduce((a, b) => a + b, 0) / (30 * 1440 * BUDGET);
    const start = {outage:2000, slow:1200, blips:600}[key];
    return {res, consumed, start};
  }
  function run(){
    out.innerHTML = '';
    const rows = [];
    Object.entries(SCEN).forEach(([k, s]) => { const r = evalScen(k); POL.forEach((p, i) => { const x = r.res[p.id]; const should = k !== 'blips'; let verdict;
      if (k === 'blips') verdict = x.pages ? `<span style="color:var(--bad)">✖ ${x.pages} false page(s) at night</span>` : '<span style="color:var(--ok)">✔ stays quiet</span>';
      else if (k === 'slow') verdict = x.pages ? `<span style="color:var(--warn)">pages after ${fmtDur((x.first - r.start) * 60000)}</span>` : x.tickets ? `<span style="color:var(--ok)">✔ ticket after ${fmtDur((x.firstT - r.start) * 60000)} (no 3 AM page)</span>` : '<span style="color:var(--bad)">✖ never notices</span>';
      else verdict = x.pages ? `<span style="color:var(--ok)">✔ pages after ${fmtDur((x.first - r.start + 1) * 60000)}</span>` : '<span style="color:var(--bad)">✖ never pages</span>';
      rows.push([i === 0 ? `<b>${s.label}</b><br><span class="lab-hint">uses ${(r.consumed * 100).toFixed(1)}% of the 30-day error budget</span>` : '', p.label, verdict]); }); });
    out.append(frag(h.table(['Scenario (3 days, per-minute error rate)', 'Alert policy', 'Result'], rows, [])));
    out.append(el('div', {class:'verdict ok'}, 'Burn-rate alerts page fast for outages that threaten the SLO, stay quiet for brief blips, and open a ticket (not a page) for slow burns. Static thresholds trade one failure for another: too sensitive means false pages, too slow means missed slow burns.'));
  }
  host.append(out, el('p', {class:'lab-hint'}, 'SLO 99.9% availability over 30 days (error budget 0.1% of requests). Burn rate = error rate ÷ 0.1%. Page if burn > 14.4 over both 1 h and 5 min, or > 6 over 6 h and 30 min; ticket if > 1 over 3 days and 6 h. These thresholds follow the multi-window, multi-burn-rate recipe in Google’s SRE Workbook. Background error rate is 0.02–0.04%.'));
  run();
}
function deploySim(host){
  const P = {strat:'canary', bad:true, auto:true}; const out = el('div'); const chartHost = el('div');
  function simulate(){
    const N = 10, RPS = 1000, BAD = .20, BASE = .001, T = 45; let f = 0, detectedAt = null, rolledBackAt = null, doneAt = null; const tl = [];
    const humanDelay = 15, alertWindow = 2; let over = 0;
    for (let m = 0; m < T; m++){
      if (detectedAt == null){
        if (P.strat === 'rolling') f = Math.min(1, (m + 1) / N);
        else if (P.strat === 'bluegreen') f = m >= 1 ? 1 : 0;
        else f = m < 1 ? 0 : m < 11 ? .05 : m < 16 ? .25 : m < 21 ? .5 : 1;
      } else if (rolledBackAt == null){
        if (P.strat === 'rolling') f = Math.max(0, f - .1); else f = 0; if (f === 0) rolledBackAt = m;
      }
      const errBad = P.bad ? BAD : BASE; const errRate = f * errBad + (1 - f) * BASE;
      const failed = RPS * 60 * f * (errBad - BASE);
      const signal = P.strat === 'canary' ? (f > 0 ? errBad : BASE) : errRate;
      if (detectedAt == null && P.bad){ if (signal > .01) over++; else over = 0; const need = P.auto ? alertWindow : humanDelay; if (over >= need) detectedAt = m; }
      if (!P.bad && doneAt == null && f >= 1) doneAt = m;
      tl.push({m, f, failed, err:errRate});
    }
    const failed = tl.reduce((a, x) => a + x.failed, 0); const peakF = Math.max(...tl.map(x => x.f));
    const extra = P.strat === 'bluegreen' ? '100% (a full second environment)' : P.strat === 'rolling' ? '+10% (one surge instance)' : '+1 instance for the canary';
    return {tl, failed, peakF, detectedAt, rolledBackAt, doneAt, extra};
  }
  function run(){
    const r = simulate(); out.innerHTML = '';
    out.append(frag(h.table(['Metric', 'Value'], P.bad ? [['Requests that failed because of the bad release', fmtNum(r.failed)], ['Max share of users on the bad version', Math.round(r.peakF * 100) + '%'], ['Detected at', r.detectedAt == null ? 'never' : `minute ${r.detectedAt}${P.auto ? ' (automated analysis)' : ' (a human noticed)'}`], ['Fully rolled back at', r.rolledBackAt == null ? '—' : `minute ${r.rolledBackAt}`], ['Extra capacity during the deploy', r.extra]] : [['Fully rolled out at', r.doneAt == null ? 'not within 45 min' : `minute ${r.doneAt}`], ['Extra capacity during the deploy', r.extra]], [])));
    chartHost.innerHTML = ''; const W = 640, H = 170, L = 40, Rr = 10, T = 12, B = 26; const X = m => L + m / 44 * (W - L - Rr), Y = v => H - B - v * (H - T - B);
    const pathF = r.tl.map((x, i) => (i ? 'L' : 'M') + X(x.m) + ' ' + Y(x.f)).join(''); const maxE = Math.max(.01, ...r.tl.map(x => x.err)); const pathE = r.tl.map((x, i) => (i ? 'L' : 'M') + X(x.m) + ' ' + Y(x.err / maxE)).join('');
    chartHost.innerHTML = `<div class="chart-box"><svg viewBox="0 0 ${W} ${H}" class="mini-chart" role="img"><title>Share of traffic on the new version and error rate per minute</title><line class="axis" x1="${L}" x2="${W - Rr}" y1="${H - B}" y2="${H - B}"/><line class="axis" x1="${L}" x2="${L}" y1="${T}" y2="${H - B}"/>${[0, 10, 20, 30, 40].map(m => `<text x="${X(m)}" y="${H - 8}" text-anchor="middle">${m} min</text>`).join('')}<text x="${L - 6}" y="${Y(1) + 4}" text-anchor="end">100%</text><text x="${L - 6}" y="${Y(0) + 4}" text-anchor="end">0</text><path d="${pathF}" fill="none" stroke-width="2.4" style="stroke:var(--accent1)"/>${P.bad ? `<path d="${pathE}" fill="none" stroke-width="2" style="stroke:var(--bad)"/>` : ''}${r.detectedAt != null ? `<line x1="${X(r.detectedAt)}" x2="${X(r.detectedAt)}" y1="${T}" y2="${H - B}" style="stroke:var(--warn)" stroke-dasharray="4 3"/><text x="${X(r.detectedAt) + 4}" y="${T + 10}" style="fill:var(--warn)">detected</text>` : ''}<text x="${W - Rr - 4}" y="${T + 10}" text-anchor="end" style="fill:var(--accent1)">% traffic on new version</text>${P.bad ? `<text x="${W - Rr - 4}" y="${T + 24}" text-anchor="end" style="fill:var(--bad)">error rate (peak ${(maxE * 100).toFixed(1)}%)</text>` : ''}</svg></div>`;
  }
  host.append(el('div', {class:'ctl-grid'}, ui.select({label:'Deployment strategy', value:P.strat, options:[['rolling', 'Rolling update (one instance per minute)'], ['bluegreen', 'Blue-green (switch all traffic at once)'], ['canary', 'Canary (5% → 25% → 50% → 100%)']], onChange:v => { P.strat = v; run(); }}).el),
    el('div', {class:'controls', style:{margin:'8px 0'}}, ui.toggle({label:'New version has a bug (20% errors)', checked:true, onChange:v => { P.bad = v; run(); }}).el, ui.toggle({label:'Automated analysis + auto-rollback', checked:true, onChange:v => { P.auto = v; run(); }}).el), chartHost, out,
    el('p', {class:'lab-hint'}, '10 instances, 1,000 req/s. Baseline error rate 0.1%. Automated analysis rolls back after 2 bad minutes; for a canary it compares the canary cohort with the baseline, so even 5% of traffic is enough signal. Without automation, assume a human notices after 15 minutes.'));
  run();
}
function iacDemo(host){
  const desired = {web_count:3, web_type:'m6i.large', bucket_versioning:true, db_size:'db.r6g.large'};
  let actual = {web_count:3, web_type:'m6i.large', bucket_versioning:true, db_size:'db.r6g.large'};
  const out = el('div'); const code = el('div');
  function plan(){
    const lines = []; let add = 0, chg = 0, del = 0;
    if (desired.web_count > actual.web_count){ for (let i = actual.web_count; i < desired.web_count; i++){ lines.push(`<span style="color:var(--ok)">  + aws_instance.web[${i}]  (type = "${desired.web_type}")</span>`); add++; } }
    if (desired.web_count < actual.web_count){ for (let i = desired.web_count; i < actual.web_count; i++){ lines.push(`<span style="color:var(--bad)">  - aws_instance.web[${i}]  will be destroyed</span>`); del++; } }
    if (desired.web_type !== actual.web_type){ for (let i = 0; i < Math.min(desired.web_count, actual.web_count); i++){ lines.push(`<span style="color:var(--warn)">  ~ aws_instance.web[${i}]  instance_type: "${actual.web_type}" → "${desired.web_type}"</span>`); chg++; } }
    if (desired.bucket_versioning !== actual.bucket_versioning){ lines.push(`<span style="color:var(--warn)">  ~ aws_s3_bucket_versioning.assets  status: "${actual.bucket_versioning ? 'Enabled' : 'Suspended'}" → "${desired.bucket_versioning ? 'Enabled' : 'Suspended'}"</span>`); chg++; }
    if (desired.db_size !== actual.db_size){ lines.push(`<span style="color:var(--warn)">  ~ aws_db_instance.main  instance_class: "${actual.db_size}" → "${desired.db_size}"  (causes a restart in place)</span>`); chg++; }
    return {lines, add, chg, del};
  }
  function render(msg){
    const p = plan(); code.innerHTML = '';
    code.append(frag(`<div class="code"><div class="code-h"><span class="t">terraform plan</span></div><pre style="padding:12px 14px;margin:0;font-size:12.5px;white-space:pre-wrap">${p.lines.length ? p.lines.join('\n') + `\n\nPlan: ${p.add} to add, ${p.chg} to change, ${p.del} to destroy.` : 'No changes. Your infrastructure matches the configuration.'}</pre></div>`));
    out.innerHTML = ''; if (msg) out.append(el('div', {class:'verdict ' + (msg[0] === '⚠' ? 'warn' : 'ok')}, msg));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'web instance count (in code)', min:0, max:8, value:desired.web_count, fmt:v => String(v), onInput:v => { desired.web_count = v; render(); }}).el,
    ui.select({label:'web instance type (in code)', value:desired.web_type, options:['m6i.large', 'm6i.xlarge', 'c6i.large'], onChange:v => { desired.web_type = v; render(); }}).el,
    ui.select({label:'database class (in code)', value:desired.db_size, options:['db.r6g.large', 'db.r6g.xlarge'], onChange:v => { desired.db_size = v; render(); }}).el,
    ui.toggle({label:'bucket versioning (in code)', checked:true, onChange:v => { desired.bucket_versioning = v; render(); }}).el),
    el('div', {class:'controls', style:{margin:'8px 0'}}, ui.button('✅ terraform apply', () => { actual = Object.assign({}, desired); render('Applied. The real infrastructure now matches the code, and the state file records it.'); }, 'sm primary'), ui.button('🖱 Someone edits it in the console', () => { actual.web_count = Math.max(0, actual.web_count - 1); actual.bucket_versioning = false; render('⚠ Drift: someone deleted an instance and suspended versioning by hand. The next plan shows that applying the code will put them back, and it shows exactly what changed.'); }, 'sm')), code, out);
  render();
}
function finopsCalc(host){
  const P = {base:200, peak:600, peakHours:6, egress:40, util:35};
  const OD = .048, SP = .45, SPOT = .70, EG = 90;
  const out = el('div');
  function run(){
    const H = 730, ph = P.peakHours * 30.4;
    const naive = P.peak * OD * H;
    const auto = (P.base * H + (P.peak - P.base) * ph) * OD;
    const commit = P.base * OD * (1 - SP) * H + (P.peak - P.base) * ph * OD;
    const spot = P.base * OD * (1 - SP) * H + (P.peak - P.base) * ph * OD * (1 - SPOT);
    const rightsized = spot * Math.max(.4, P.util / 60);
    const egress = P.egress * 1000 * EG / 1000;
    const rows = [
      ['Peak capacity on-demand, 24×7', naive],
      ['Autoscaled on-demand', auto],
      ['Commit baseline (savings plan) + on-demand peaks', commit],
      ['Commit baseline + spot for stateless peaks', spot],
      [`…and right-size (avg CPU ${P.util}% → target 60%)`, Math.min(spot, rightsized)]];
    out.innerHTML = '';
    out.append(frag(h.table(['Compute strategy (vCPU-hours, illustrative prices)', 'Monthly compute', 'vs naive'], rows.map(([k, v]) => [k, '$' + fmtNum(v), Math.round((1 - v / naive) * 100) + '% less']), [1, 2])));
    out.append(el('div', {class:'verdict warn'}, `Data transfer: ${P.egress} TB/month to the internet ≈ $${fmtNum(egress)} at an illustrative $0.09/GB. Egress, cross-AZ traffic, idle disks, forgotten snapshots and over-retained logs often surprise teams more than compute.`));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Always-on baseline', min:20, max:2000, step:10, value:P.base, fmt:v => v + ' vCPU', onInput:v => { P.base = v; P.peak = Math.max(P.peak, v); run(); }}).el,
    ui.slider({label:'Daily peak', min:20, max:5000, step:10, value:P.peak, fmt:v => v + ' vCPU', onInput:v => { P.peak = Math.max(v, P.base); run(); }}).el,
    ui.slider({label:'Hours per day at peak', min:1, max:24, value:P.peakHours, fmt:v => v + ' h', onInput:v => { P.peakHours = v; run(); }}).el,
    ui.slider({label:'Average CPU utilisation today', min:5, max:80, value:P.util, fmt:v => v + '%', onInput:v => { P.util = v; run(); }}).el,
    ui.slider({label:'Internet egress', min:0, max:500, value:P.egress, fmt:v => v + ' TB/mo', onInput:v => { P.egress = v; run(); }}).el), out,
    el('p', {class:'lab-hint'}, 'Illustrative unit prices, not a quote: $0.048 per vCPU-hour on-demand; commitments ~45% cheaper; spot ~70% cheaper but can be reclaimed at short notice (AWS advertises up to 72% off for Savings Plans and up to 90% for Spot). Use your provider’s current pricing.'));
  run();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'logs-metrics-traces', title:'Logs, metrics and traces (OpenTelemetry)', minutes:12, tags:['logs','metrics','traces','OpenTelemetry','span','correlation'],
  summary:'Metrics show that something is wrong, traces show where, and logs show why. A shared trace ID ties them together, and OpenTelemetry collects all three the same way.',
  problem:`<h3>A small example</h3><p>Passengers say check-in is “sometimes slow”. The dashboard shows that p99 latency, the time that the slowest 1% of requests take, doubled at 5 AM.</p><ul><li>One check-in touches the gateway, login, booking, seats and baggage services.</li><li>Searching logs on 40 servers for “slow” finds nothing useful.</li><li>You need to follow one slow request through every step.</li></ul><p>Which step is slow, and why?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one slow check-in request from the gateway to the database.</p>',
    steps:[
      {icon:'📈', title:'Notice with metrics', text:'A metric is a number tracked over time, such as errors per minute. It tells you that something is wrong.'},
      {icon:'🪪', title:'Tag the request', text:'The gateway gives the request a trace ID. Every service passes that ID along in its calls.'},
      {icon:'🧭', title:'Find the step with a trace', text:'A trace is a tree of spans. A span is one timed step, such as the seat lookup.'},
      {icon:'📝', title:'Read the logs', text:'Logs are notes that each service writes. Searching them by trace ID shows why the seat query was slow.'},
      {icon:'🔌', title:'Collect it the same way', text:'OpenTelemetry is a standard toolkit. It collects metrics, traces and logs from every programming language in the same way.'}
    ],
    mount:host => traceDemo(host),
    html:`<h3>Everyday comparison</h3><p>Think of a courier parcel.</p><div class="simple-table">${h.table(['Parcel', 'Observability'], [['The daily dashboard: 2% of parcels are late', 'Metrics.'], ['One parcel’s tracking history', 'A trace.'], ['The notes written at each stop', 'Logs.']])}</div><div class="callout tip"><b>Important point</b><p>Metrics say that something is wrong, traces say where, and logs say why. The trace ID connects them.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Question', 'Use'], [['Is something wrong right now?', 'Metrics'], ['Which step is slow?', 'Traces'], ['Why did that step fail?', 'Logs']])}</div>`,
    deep:`<h4>The numbers</h4><p>Each unique mix of label values is one time series. Say 5 services, 4 status codes and 20 endpoints give 5 × 4 × 20 = 400 series. Add a passenger ID label with 1,000,000 passengers and it becomes 400 × 1,000,000 = 400,000,000 series. Keep such values in logs or trace attributes.</p><p>Now sampling. Say 1 request in 1,000 is slow. In 100,000 requests, 100 are slow. Keeping 1% of traces at random keeps 1% of those, which is 1 slow trace. Tail sampling decides after the trace ends, so it can keep all 100.</p><h4>How it works inside</h4><p>The trace ID travels in an HTTP header called <code>traceparent</code>. It holds a version, a trace ID of 32 hex characters, a span ID of 16 hex characters and a flags byte. Each service copies the trace ID and makes a new span ID.</p><p>Write logs as JSON with fields such as service and trace ID. Then one search by trace ID finds every line from one check-in.</p>`
  },
  tradeoffs:{use:[`Use all three signals for check-in and join them by trace ID.`, `Use OpenTelemetry so instrumentation does not lock the team to one vendor.`], avoid:[`Do not write unstructured logs that nobody can query.`, `Do not label metrics with passenger IDs.`, `Do not keep 100% of traces at high traffic without a budget.`], alt:[`Use profiling to find slow code lines inside one service.`, `Use real-user monitoring to see what passengers’ phones experience.`]},
  real:[
    {co:'Google Dapper', tier:'confirmed', text:'Google’s 2010 Dapper paper described low-cost sampled tracing, with trace and span IDs passed through calls. It inspired Zipkin, Jaeger and OpenTelemetry.', src:'Sigelman et al., Dapper (2010)'},
    {co:'OpenTelemetry', tier:'confirmed', text:'OpenTelemetry started in 2019 by merging OpenTracing and OpenCensus. It offers APIs, SDKs and a Collector for traces, metrics and logs.', src:'OpenTelemetry documentation'}
  ],
  mistakes:[`Writing logs without a trace ID, so steps cannot be connected.`, `Averaging latency instead of reading percentiles from histograms.`, `Putting passenger IDs in metric labels.`],
  interview:[`Say what you would measure, how you would trace a slow request and how logs link by trace ID.`, `Mention sampling and label count as cost controls.`],
  tryit:[
    {quiz:[{q:'Which signal shows where the time went inside one slow request?', options:['A CPU metric', 'A trace', 'The daily error count', 'A dashboard average'], answer:1, why:'Spans show how long each step took.'}, {q:'Why should passenger ID not be a metric label?', options:['It is private', 'Metrics cannot hold text', 'It creates one time series per passenger', 'It slows logging'], answer:2, why:'The number of series explodes. Put it in logs or trace attributes.'}]},
    {note:'Toggle the cache miss, missing index and N+1 queries above and watch the critical path change. Then sort these.', mount:host => sortGame(host, [
      {t:'p99 latency of check-in over the last hour', c:'m', why:'A number tracked over time.'},
      {t:'“Seat 14C already taken” with a booking ID', c:'l', why:'A single event with context.'},
      {t:'Time spent in each service for one slow request', c:'t', why:'A trace with spans.'},
      {t:'Number of server errors per minute', c:'m', why:'A counter over time.'},
      {t:'Stack trace of an exception', c:'l', why:'Detail about one event.'},
      {t:'Which downstream call was on the critical path', c:'t', why:'Span timing and structure.'}
    ], [{id:'m', label:'Metric'}, {id:'l', label:'Log'}, {id:'t', label:'Trace'}])}
  ],
  sources:[`Sigelman et al., Dapper (2010)`, `OpenTelemetry and W3C Trace Context specifications`, `Majors, Fong-Jones and Miranda, Observability Engineering (2022)`]
},
{
  id:'golden-signals-red-use', title:'Golden signals, RED and USE', minutes:9, tags:['golden signals','RED','USE','saturation','dashboards'],
  summary:'Three short checklists tell you what to measure. The four golden signals fit any user-facing system, RED fits services, and USE fits resources.',
  problem:`<h3>A small example</h3><p>The check-in team has 400 dashboards. During an outage at 5 AM, people scroll through graphs hunting for something red.</p><ul><li>Nobody knows which graphs matter.</li><li>Every service shows different metrics.</li><li>The on-call engineer loses minutes at each look.</li></ul><p>Which few numbers show that check-in is healthy?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Pick the vital signs of the check-in service one by one.</p>',
    steps:[
      {icon:'⏱️', title:'Latency', text:'How long requests take. Track the slowest 1% (p99) as well as the typical case, and keep failed requests apart.'},
      {icon:'🚦', title:'Traffic', text:'How many check-ins arrive each second.'},
      {icon:'❌', title:'Errors', text:'How many requests fail. Include requests that return 200 with a wrong answer.'},
      {icon:'🪣', title:'Saturation', text:'How full the service is, such as busy threads or waiting requests. It often warns before latency rises.'},
      {icon:'🧰', title:'Reuse the checklists', text:'The RED method means rate, errors and duration for each service. The USE method means utilisation, saturation and errors for each resource.'}
    ],
    stepper:{title:'Where each checklist applies', items:[
      {title:'Golden signals', tag:'any user-facing system', text:'Latency, traffic, errors and saturation. Put them in your SLOs and on-call dashboards.'},
      {title:'RED', tag:'for services', text:'Rate, errors and duration for every request-driven service, such as Booking. The same three graphs for every service keep dashboards alike. Tom Wilkie proposed it.'},
      {title:'USE', tag:'for resources', text:'Utilisation, saturation and errors for every resource, such as CPU, disk or a connection pool. It is a steady way to find the bottleneck. Brendan Gregg proposed it.'}]},
    html:`<h3>Everyday comparison</h3><p>Think of a doctor’s quick check.</p><div class="simple-table">${h.table(['Doctor’s check', 'Service check'], [['Pulse', 'Traffic'], ['Temperature', 'Latency'], ['Blood pressure', 'Saturation'], ['Oxygen level', 'Errors']])}</div><div class="callout tip"><b>Important point</b><p>A few numbers can show that a service needs attention before any detailed test.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Thing to check', 'Checklist'], [['A service such as Booking', 'RED'], ['A resource such as the database connection pool', 'USE'], ['Check-in as a whole for passengers', 'Golden signals']])}</div>`,
    deep:`<h4>The numbers</h4><p>Averages hide slow requests. Say 100 check-ins: 98 take 100 ms and 2 take 5,000 ms. The average is (98 × 100 + 2 × 5,000) ÷ 100 = 198 ms. That looks fine. But the p99 is 5,000 ms, so some passengers wait 5 seconds.</p><p>Saturation shows up before latency. In a simple one-server waiting model, the extra wait is service time × use ÷ (1 − use). Say a query takes 20 ms. At 50% use the wait is 20 ms. At 90% it is 180 ms. At 99% it is 1,980 ms.</p><h4>When it goes wrong</h4><p>Errors can hide behind a 200 status. A seat list that returns 200 with zero seats because its index is empty is an error for passengers. Add business signals, such as boarding passes issued per minute, and alert when they drop.</p>`
  },
  tradeoffs:{use:[`Use RED for each check-in service and USE for each resource such as the database pool.`, `Put golden signals in the on-call dashboard.`], avoid:[`Do not build dashboards of every number you can collect.`, `Do not watch only servers and ignore what passengers feel.`], alt:[`Show the SLO and the remaining error budget on the dashboard.`, `Use business numbers such as check-ins per minute as health signals.`]},
  real:[
    {co:'Google SRE', tier:'confirmed', text:'The SRE book names latency, traffic, errors and saturation as the four golden signals for any user-facing system.', src:'Site Reliability Engineering (2016), chapter 6'},
    {co:'RED and USE', tier:'confirmed', text:'Tom Wilkie proposed RED for services. Brendan Gregg proposed USE for resources.', src:'Wilkie, The RED Method. Gregg, The USE Method'}
  ],
  mistakes:[`Mixing failed and successful requests in one latency number.`, `Having no saturation numbers until the pool is already full.`, `Using a different dashboard layout for every service.`],
  interview:[`Say which golden signals you would alert on and which business number shows passenger impact.`],
  tryit:[
    {quiz:[{q:'A database connection pool is 95% in use. Which golden signal is this?', options:['Latency', 'Traffic', 'Errors', 'Saturation'], answer:3, why:'It shows how full a resource is.'}, {q:'Check-in returns 200 but the boarding pass is empty. What is this?', options:['A traffic spike', 'An implicit error', 'Normal latency', 'A saturation warning'], answer:1, why:'The status code looks fine, but passengers still get a wrong answer.'}]},
    {note:'Which golden signal is each number?', mount:host => sortGame(host, [
      {t:'p99 of the check-in response time', c:'lat', why:'Latency.'},
      {t:'Check-ins per minute', c:'tra', why:'Traffic, as a business number.'},
      {t:'Database connection pool 95% in use', c:'sat', why:'Saturation.'},
      {t:'Server errors per second', c:'err', why:'Errors.'},
      {t:'Requests waiting in a queue', c:'sat', why:'Waiting work is saturation.'},
      {t:'Check-ins returning 200 with an empty boarding pass', c:'err', why:'An implicit error.'}
    ], [{id:'lat', label:'Latency'}, {id:'tra', label:'Traffic'}, {id:'err', label:'Errors'}, {id:'sat', label:'Saturation'}])}
  ],
  sources:[`Google SRE book, chapter 6`, `Wilkie, The RED Method`, `Gregg, The USE Method`]
},
{
  id:'alerting-oncall', title:'Alerting, dashboards and on-call', minutes:11, tags:['alerting','on-call','burn rate','SLO','paging','alert fatigue'],
  summary:'Page a person only for urgent problems that passengers can feel. Alert on symptoms and on how fast the error budget burns, and send everything else to tickets.',
  problem:`<h3>A small example</h3><p>The on-call engineer got 140 pages last week.</p><ul><li>CPU at 80%, a disk at 85% and one restarting server</li><li>A 2-minute error blip at 3 AM</li><li>The real outage page arrived among 12 others and was seen 25 minutes late</li></ul><p>Which alerts deserve to wake a person?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow check-in errors from a quiet night to a real outage.</p>',
    steps:[
      {icon:'🎯', title:'Page only for urgent problems', text:'A page must be urgent, need action now and affect passengers. Everything else becomes a ticket or a dashboard.'},
      {icon:'👀', title:'Alert on symptoms', text:'Alert when passengers see errors or slowness. High CPU goes on a dashboard to help find the cause.'},
      {icon:'🔥', title:'Measure burn rate', text:'Burn rate is how fast the error budget is being used. A fast burn pages and a slow burn opens a ticket.'},
      {icon:'🪟', title:'Use two time windows', text:'A long window shows the problem is real. A short window shows it is still happening.'},
      {icon:'📘', title:'Link a runbook', text:'Each alert links to a runbook, which is a set of written steps for handling it. Review noisy alerts every week.'}
    ],
    mount:host => burnRateSim(host),
    html:`<h3>Everyday comparison</h3><p>Think of a smoke alarm.</p><div class="simple-table">${h.table(['Smoke alarm', 'Alerts'], [['Rings for a fire', 'Pages for an outage that passengers feel.'], ['Stays quiet for toast', 'Stays quiet for a short blip.'], ['Rings every morning, so people remove the battery', 'Too many alerts get ignored.']])}</div><div class="callout tip"><b>Important point</b><p>Too many alerts is as dangerous as too few.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Situation', 'Action'], [['The error budget burns fast', 'Page the on-call engineer.'], ['The error budget burns slowly', 'Open a ticket.'], ['CPU or disk is getting high', 'Show it on a dashboard.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Take a 99.9% SLO. The error budget is 0.1% of requests over 30 days. Burn rate 1 spends the whole budget in exactly 30 days, which is 720 hours. An error rate of 1.44% is 1.44 ÷ 0.1 = 14.4 times faster. The budget then lasts 720 ÷ 14.4 = 50 hours, so each hour uses 1 ÷ 50 = 2% of it.</p><p>Burn rate 6 lasts 720 ÷ 6 = 120 hours, so 6 hours use 5%.</p><h4>When it goes wrong</h4><p>Small traffic makes burn rates jumpy. Say only 10 check-ins arrive in a night hour. One failure is 1 ÷ 10 = 10% errors, which is burn rate 100. That pages a person for one unlucky request. Send fake check-ins on a schedule, called synthetic probes, or merge small services into one alert.</p><h4>How it works inside</h4><p>A common starting point pages at burn 14.4 over 1 hour with a 5-minute short window. It pages at 6 over 6 hours with a 30-minute short window. It opens a ticket at 1 over 3 days.</p>`
  },
  tradeoffs:{use:[`Page on burn rate for check-in, because passengers feel the errors.`, `Use cause alerts, such as a disk full in 4 hours, only when they predict passenger impact.`], avoid:[`Do not page for CPU, memory or one failed server that redundancy already handles.`, `Do not create alerts without a runbook or an owner.`], alt:[`Open tickets for slow burns and capacity trends.`, `Use synthetic probes for paths with little traffic.`]},
  real:[
    {co:'Google SRE Workbook', tier:'confirmed', text:'The chapter on alerting on SLOs compares threshold and burn-rate approaches. It recommends multiple windows and burn rates, with 14.4 and 6 for pages and 1 for tickets, as a starting point.', src:'Beyer et al., The Site Reliability Workbook (2018), chapter 5'},
    {co:'Google SRE book', tier:'confirmed', text:'The SRE book discusses keeping on-call load fair, limiting operations work to under 50% of an engineer’s time and keeping pages actionable.', src:'Site Reliability Engineering (2016), chapter 11'}
  ],
  mistakes:[`Alerting on every cause metric.`, `Using fixed thresholds that wake someone at 3 AM for a 2-minute blip.`, `Sending pages with no runbook, owner or dashboard link.`],
  interview:[`Explain SLO alerting with burn rates and say what pages and what only opens a ticket.`, `Mention runbooks and alert reviews as part of the design.`],
  tryit:{note:'Compare the three policies in the table above. Then check yourself.', quiz:[{q:'With a 99.9% SLO, the check-in error rate is 1.44%. What is the burn rate?', options:['144', '1.44', '0.144', '14.4'], answer:3, why:'1.44% ÷ 0.1% = 14.4.'}, {q:'A disk is at 85% and grows 1% a day. What is the best action?', options:['Page now', 'Reboot the server', 'Open a ticket or capacity alert', 'Ignore it'], answer:2, why:'It is not urgent. Plan the fix.'}], quizId:'obs-l3'},
  sources:[`Google SRE Workbook, chapter 5`, `Google SRE book, chapters 6 and 11`, `Rob Ewaschuk, My Philosophy on Alerting`]
},
{
  id:'incident-postmortems', title:'Incident response and blameless postmortems', minutes:10, tags:['incident','incident commander','mitigation','postmortem','blameless'],
  summary:'In an incident, organise the team, restore service first and keep people informed. Afterwards, write a postmortem that looks at the system, not at who to blame.',
  problem:`<h3>A small example</h3><p>Check-in fails at 5 AM, one hour before the first flights.</p><ul><li>Twelve engineers jump into the chat.</li><li>Three try different fixes at the same time.</li><li>Nobody tells the airport staff what is happening.</li></ul><p>How can the team fix it quickly and learn from it afterwards?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the 5 AM check-in incident from alert to postmortem.</p>',
    steps:[
      {icon:'🚨', title:'Detect and declare', text:'An alert or a passenger report starts the incident. Someone declares it and sets a severity level.'},
      {icon:'🧑‍✈️', title:'Assign roles', text:'An incident commander coordinates. One person makes changes, one talks to others and one keeps the timeline.'},
      {icon:'🩹', title:'Mitigate first', text:'Roll back the last release, switch a feature off or fail over. Restore check-in before hunting for the root cause.'},
      {icon:'📢', title:'Update regularly', text:'Tell airport staff and leaders the impact and the time of the next update. Repeat every 30 minutes.'},
      {icon:'📝', title:'Learn without blame', text:'Afterwards, write a postmortem with the timeline, causes and tracked actions. Ask what let it happen, not who to blame.'}
    ],
    stepper:{title:'Lifecycle of an incident', items:[
      {title:'Detect', tag:'alert', text:'An SLO alert, a passenger report or a synthetic check fires. Acknowledge it quickly.'},
      {title:'Declare and assign roles', tag:'IC', text:'Declare an incident with a severity. The incident commander coordinates. The ops lead makes changes. The comms lead updates others. The scribe keeps the timeline.'},
      {title:'Mitigate first', tag:'stop the bleeding', text:'Roll back the last release, flip a kill switch, fail over, shed load or add capacity. Restore service before finding the root cause.'},
      {title:'Communicate', tag:'cadence', text:'Send regular updates, for example every 30 minutes, to the status page, support and leaders. Give the impact, the actions and the next update time.'},
      {title:'Resolve and verify', tag:'monitor', text:'Confirm that the key signals are back to normal. Then close the incident and keep watching for a repeat.'},
      {title:'Blameless postmortem', tag:'learn', text:'Write the timeline, the impact, the contributing factors, what went well and where the team got lucky. Add action items with owners and dates.'},
      {title:'Follow through', tag:'actions', text:'Track the actions to the end and share what you learned. A postmortem with no finished actions is only a story.'}]},
    html:`<h3>Everyday comparison</h3><p>Think of a hospital emergency room.</p><div class="simple-table">${h.table(['Emergency room', 'Incident'], [['One doctor leads', 'One incident commander leads.'], ['Stabilise the patient first', 'Mitigate before finding the root cause.'], ['A case review asks what let it happen', 'A postmortem looks at the system, not the person.']])}</div><div class="callout tip"><b>Important point</b><p>Restore service first. Find the root cause after.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Moment', 'Action'], [['An alert fires', 'Acknowledge it and declare an incident.'], ['The cause is not known yet', 'Roll back or switch off the suspect change.'], ['Service is back', 'Verify it, then write the postmortem.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say check-in fails at 05:00 and the alert fires at 05:10. Detection took 10 minutes. A rollback finishes at 05:40, so mitigation took 30 more. Passengers were hurt for 40 minutes, and flights start at 06:00. Hunting the root cause first for 90 minutes would have run until 06:40.</p><p>Crowds slow people down. With 12 engineers in one chat, there are 12 × 11 ÷ 2 = 66 possible pairs talking. With a commander in the middle, there are only 11 lines.</p><h4>When it goes wrong</h4><p>Three people changing things at once is dangerous. If check-in recovers, nobody knows which change worked. If it gets worse, nobody knows which one hurt. Make one change at a time and write each one in the timeline with its time.</p><h4>How it works inside</h4><p>Build the timeline from timestamps in chat and graphs, not from memory. A good action item has an owner and a date, for example: add a guard so one command cannot delete production data.</p>`
  },
  tradeoffs:{use:[`Use a short, practised incident process for check-in and every other production system.`], avoid:[`Do not let twelve people debug at once without coordination.`, `Do not hunt for the root cause before restoring service.`, `Do not run reviews that look for someone to blame.`], alt:[`Practise with tabletop exercises and game days before a real incident.`]},
  real:[
    {co:'Google SRE', tier:'confirmed', text:'The SRE book describes an incident command structure and a blameless postmortem culture with tracked action items.', src:'Site Reliability Engineering (2016), chapters 14 and 15'},
    {co:'Etsy', tier:'confirmed', text:'John Allspaw argued that blame makes people hide information, and that blameless reviews help teams learn.', src:'Allspaw, Blameless PostMortems and a Just Culture (2012)'}
  ],
  mistakes:[`Several people making changes with no coordination.`, `Keeping no timeline, so the postmortem is rebuilt from memory.`, `Writing action items with no owner or due date.`],
  interview:[`When asked about failures, describe detection, mitigation, communication and the postmortem.`],
  tryit:[
    {quiz:[{q:'What should happen first in an incident?', options:['Find the root cause', 'Write the postmortem', 'Reduce the impact on passengers', 'Decide who is to blame'], answer:2, why:'Restore service first. Diagnose after.'}, {q:'What makes a postmortem blameless?', options:['It names nobody', 'It asks what in the system let the mistake happen', 'It skips action items', 'Only managers read it'], answer:1, why:'The goal is to fix the system, so people keep sharing the truth.'}]},
    {note:'Put the incident steps in order:', mount:host => orderGame(host, ['Alert fires and on-call acknowledges', 'Declare an incident and assign an incident commander', 'Mitigate: roll back the suspicious release', 'Post a status update with the impact and the next update time', 'Check that check-in is healthy again and resolve', 'Write a blameless postmortem with owned actions'], '✓ All six steps in order. Restore service first, then learn from it.')}
  ],
  sources:[`Google SRE book, chapters 14 and 15`, `Allspaw, Blameless PostMortems (2012)`, `PagerDuty Incident Response documentation`]
},
{
  id:'ci-cd', title:'CI/CD pipelines', minutes:10, tags:['CI','CD','pipeline','DORA','trunk-based','artifact'],
  summary:'Continuous integration tests small changes all the time. Continuous delivery keeps every build ready to release and moves it through stages automatically. Small, frequent changes are safer than big, rare ones.',
  problem:`<h3>A small example</h3><p>The check-in team ships once a month.</p><ul><li>300 changes merge in the last week.</li><li>A manual test cycle takes two days.</li><li>The release runs from a wiki page on Friday night.</li></ul><p>When something breaks, which of the 300 changes caused it?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one small boarding pass fix from commit to passengers.</p>',
    steps:[
      {icon:'🔀', title:'Merge small changes', text:'Each change goes through a pull request. A build, tests and scans run in minutes.'},
      {icon:'📦', title:'Build once', text:'The build makes one image per commit and stores it in a registry. The same image moves through every stage.'},
      {icon:'🧪', title:'Test in staging', text:'The image deploys to a copy of the system called staging. End-to-end tests try a whole check-in.'},
      {icon:'🌊', title:'Release in waves', text:'Production gets the image in waves, such as one server, then one zone, then everywhere. A wait between waves, called bake time, lets the metrics show a problem.'},
      {icon:'↩️', title:'Roll back automatically', text:'If errors rise, the pipeline stops and goes back. A small change makes the cause easy to find.'}
    ],
    diagram:{title:'A delivery pipeline', w:820, h:230, alt:'A commit triggers a build and tests. The image goes to a registry, then to staging, then in waves to production with automatic checks.',
      nodes:[{id:'dev', type:'client', label:'Commit or PR', x:70, y:115}, {id:'ci', type:'service', label:'CI', sub:'build, test, scan', x:220, y:115, w:130}, {id:'reg', type:'db', label:'Image registry', sub:'checkin@sha256:abc', x:390, y:115, w:140}, {id:'stg', type:'service', label:'Staging', sub:'end-to-end tests', x:560, y:50, w:130}, {id:'prod', type:'lb', label:'Production', sub:'server, zone, region', x:720, y:115, w:150}, {id:'mon', type:'ext', label:'Metrics and SLOs', x:560, y:190, w:150}],
      edges:[{from:'dev', to:'ci'}, {from:'ci', to:'reg'}, {from:'reg', to:'stg'}, {from:'stg', to:'prod'}, {from:'prod', to:'mon'}, {from:'mon', to:'prod', dashed:true}],
      steps:[
        {note:'A developer pushes a small change. The build runs tests and scans in minutes.', flow:[['dev', 'ci', 'push']]},
        {note:'One image, tagged with the commit ID, goes to the registry.', flow:[['ci', 'reg', 'image']]},
        {note:'The same image deploys to staging, and the end-to-end tests pass.', flow:[['reg', 'stg', 'deploy']]},
        {note:'Production gets the image in waves with a wait after each. Metrics are checked at every step, and a problem triggers an automatic rollback.', flow:[['stg', 'prod', 'wave 1'], ['prod', 'mon', 'SLIs'], ['mon', 'prod', 'OK, next wave']]}
      ]},
    html:`<h3>Everyday comparison</h3><p>Think of washing dishes.</p><div class="simple-table">${h.table(['Washing dishes', 'Releasing code'], [['After every meal', 'After every small change'], ['A month’s pile is a miserable job', 'A month of changes is a risky release'], ['A small pile shows which dish smells', 'A small change shows which change broke it']])}</div><div class="callout tip"><b>Important point</b><p>Small, frequent changes are safer than big, rare ones.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Practice', 'What happens'], [['Continuous integration (CI)', 'Merge often, and build and test every change.'], ['Continuous delivery (CD)', 'Every build can be released and moves through stages.'], ['Continuous deployment', 'The last step to production is automatic too.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say 300 changes ship together and the release breaks. A halving search tests half the changes, then half of the bad half, and so on. It finds the bad one in about 9 steps, because 2 to the power 9 is 512, the first power of 2 above 300. Each step needs a full test run. With 10 changes, 4 steps are enough.</p><p>Say tests take 60 minutes in one line. Split evenly across 6 machines, they take 60 ÷ 6 = 10 minutes.</p><h4>When it goes wrong</h4><p>Flaky tests add up. Say each of 100 tests fails by chance 1% of the time. All 100 pass with probability 0.99 to the power 100, which is about 37%. So about 63% of runs fail with no real bug. People start pressing rerun, and real failures get ignored.</p><h4>How it works inside</h4><p>Build once and promote the same image. Its digest, a hash of its contents, names exactly what runs in each stage. A tag such as latest can point to different images over time, so deploy by digest.</p>`
  },
  tradeoffs:{use:[`Use small changes, automated tests and staged releases for the check-in app.`, `Use GitOps, where git holds the wanted state and an agent applies it, if the team runs Kubernetes.`], avoid:[`Do not deploy from a wiki page by hand.`, `Do not rebuild the image for each environment.`, `Do not batch hundreds of changes into one release.`], alt:[`Mobile apps in app stores release on a schedule, but still use CI and staged rollouts.`]},
  real:[
    {co:'DORA', tier:'confirmed', text:'Forsgren, Humble and Kim named four delivery metrics and showed that high performers are both faster and more stable.', src:'Forsgren, Humble and Kim, Accelerate (2018)'},
    {co:'Amazon', tier:'confirmed', text:'Amazon describes pipelines that deploy in waves, with wait times, automatic monitors and automatic rollback.', src:'Clare Liguori, Automating safe, hands-off deployments, Amazon Builders’ Library'}
  ],
  mistakes:[`Running slow, flaky tests that people learn to ignore.`, `Bundling database changes into app releases that cannot be undone.`, `Clicking through manual production steps.`],
  interview:[`Describe build once, staged automatic rollout and automatic rollback.`, `Mention the four DORA metrics.`],
  tryit:[
    {quiz:[{q:'Why promote the same image through every stage?', options:['It is smaller', 'What you tested is exactly what you ship', 'It avoids testing', 'It needs no registry'], answer:1, why:'A rebuilt image could differ from the one you tested.'}, {q:'What does a wait between waves do?', options:['Speeds up the release', 'Deletes old images', 'Runs unit tests', 'Gives metrics time to show a problem before the next wave'], answer:3, why:'Some problems appear only after a few minutes of real traffic.'}]},
    {note:'CI or CD?', mount:host => sortGame(host, [
      {t:'Run unit tests on every pull request', c:'ci', why:'It checks each change as it merges.'},
      {t:'Deploy to one server, wait 30 minutes, then one zone', c:'cd', why:'It is a staged release.'},
      {t:'Scan code and libraries for known flaws', c:'ci', why:'It is a check during integration.'},
      {t:'Roll back automatically when errors rise after a release', c:'cd', why:'It is a delivery safeguard.'},
      {t:'Build an image tagged with the commit ID', c:'ci', why:'It produces the image.'},
      {t:'Promote the same image from staging to production', c:'cd', why:'It delivers the tested image.'}
    ], [{id:'ci', label:'Continuous integration'}, {id:'cd', label:'Continuous delivery'}])}
  ],
  sources:[`Forsgren, Humble and Kim, Accelerate (2018)`, `Humble and Farley, Continuous Delivery (2010)`, `Amazon Builders’ Library, safe deployments`]
},
{
  id:'deploy-strategies', title:'Rolling, blue-green and canary deployments', minutes:11, tags:['rolling','blue-green','canary','rollback','progressive delivery'],
  summary:'Rolling updates replace servers a few at a time. Blue-green switches all traffic between two full copies. A canary sends a small share to the new version first. They differ in damage, rollback speed and extra cost.',
  problem:`<h3>A small example</h3><p>A new seat map release has a bug. It fails 20% of seat choices, and the tests did not catch it.</p><ul><li>1,000 requests arrive every second.</li><li>The bug is only found after the release.</li><li>The damage depends on how the release was rolled out.</li></ul><p>How many passengers are hurt before anyone notices, and how fast can you undo it?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the buggy seat map release through three ways of rolling out.</p>',
    steps:[
      {icon:'🔄', title:'Rolling', text:'Replace servers a few at a time. It needs little extra capacity, but old and new versions run together for a while.'},
      {icon:'🔁', title:'Blue-green', text:'Build a full second copy and test it. Then switch all traffic at once, and switch back to roll back.'},
      {icon:'🐤', title:'Canary', text:'Send a small share, such as 5%, to the new version. Compare its metrics with a matching baseline.'},
      {icon:'📊', title:'Let automation judge', text:'Automated analysis compares errors and speed. It promotes the release or rolls it back.'},
      {icon:'🧮', title:'Count the damage', text:'Damage is the traffic share times the error rate times the minutes before detection. A small first share keeps it small.'}
    ],
    mount:host => deploySim(host),
    html:`<h3>Everyday comparison</h3><p>Think of an airport trying a new boarding procedure.</p><div class="simple-table">${h.table(['Airport', 'Release'], [['Try it at one gate at a time', 'Rolling update.'], ['Open a second, identical terminal and move everyone over', 'Blue-green.'], ['Try it on a few flights and watch', 'Canary.']])}</div><div class="callout tip"><b>Important point</b><p>How you release decides how many passengers a bug can hurt.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Situation', 'Choice'], [['High traffic and high risk', 'Canary with automatic analysis'], ['You need an instant whole-environment rollback', 'Blue-green'], ['A simple, stateless service', 'Rolling update']])}</div>`,
    deep:`<h4>The numbers</h4><p>The bug fails 20% of seat choices and 1,000 requests arrive each second. Say it takes 2 minutes, or 120 seconds, to notice.</p><ul><li>Canary at 5%: 1,000 × 0.05 × 0.2 = 10 failures each second. Then 10 × 120 = 1,200 failures.</li><li>Blue-green at 100%: 1,000 × 1 × 0.2 = 200 failures each second. Then 200 × 120 = 24,000 failures.</li></ul><p>If a person notices after 15 minutes (900 seconds), the canary fails 9,000 requests and blue-green fails 180,000.</p><h4>When it goes wrong</h4><p>A canary needs enough traffic to judge. At 5% it sees 50 requests each second, or 3,000 a minute. Say normal errors are 0.1%, about 3 a minute. A bug that fails 0.2% adds up to 6. Telling 6 from 3 is hard, so wait longer or raise the share.</p><h4>How it works inside</h4><p>Compare the canary with a baseline, a few old-version servers started at the same time. The main fleet has warm caches and a different age, so it is an unfair comparison.</p>`
  },
  tradeoffs:{use:[`Use a canary for the seat map, because traffic is high and a bug is costly.`, `Use blue-green when you need an instant rollback and can afford double capacity for a short time.`, `Use a rolling update as the simple default for a stateless service.`], avoid:[`Do not use blue-green without testing the new copy first. A bug then hits 100% of passengers.`, `Do not use a canary on tiny traffic where the numbers prove nothing.`], alt:[`Use feature flags to release without deploying.`, `Send shadow traffic to the new version first.`]},
  real:[
    {co:'Netflix and Google', tier:'confirmed', text:'They released Kayenta in 2018 for automated canary analysis in Spinnaker. It scores canary metrics against a baseline before promotion.', src:'Netflix Tech Blog, Automated Canary Analysis at Netflix with Kayenta (2018)'},
    {co:'Kubernetes', tier:'confirmed', text:'A Kubernetes Deployment uses rolling updates by default. Tools such as Argo Rollouts and Flagger add canary and blue-green releases.', src:'Kubernetes, Argo Rollouts and Flagger documentation'}
  ],
  mistakes:[`Comparing canary metrics with the whole old fleet instead of a matching baseline.`, `Making database changes that break the old version during the rollout.`, `Promoting by hand because it “looks fine”.`],
  interview:[`Pick a strategy and justify it by damage, rollback time and capacity.`, `Mention automated analysis and backward-compatible changes.`],
  tryit:{note:'Switch strategies above with the bug on. Then turn off automated analysis and compare the failed-request counts.', quiz:[{q:'A bad release fails 20% of requests, and detection takes 2 minutes. Which strategy limits the damage most?', options:['Blue-green', 'Rolling', 'Redeploy everything at once', 'Canary at 5%'], answer:3, why:'Only 5% of traffic is exposed while the bug is detected.'}, {q:'Why compare a canary with a matching baseline and not with the whole old fleet?', options:['The baseline started at the same time, so warm caches and age do not skew the result', 'It is cheaper', 'The old fleet is switched off', 'It avoids using metrics'], answer:0, why:'A fair comparison needs two groups in the same conditions.'}], quizId:'obs-l6'},
  sources:[`Kayenta and Spinnaker documentation`, `Kubernetes Deployment documentation`, `Fowler, BlueGreenDeployment (2010)`, `Sato, CanaryRelease (2014)`]
},
{
  id:'infrastructure-as-code', title:'Infrastructure as code', minutes:9, tags:['IaC','Terraform','CloudFormation','drift','GitOps','state'],
  summary:'Infrastructure as code describes servers, networks and databases in files that are versioned and reviewed. A tool compares the files with reality and applies the difference.',
  problem:`<h3>A small example</h3><p>The check-in servers were built by hand in the cloud console over three years.</p><ul><li>Nobody knows which firewall rules exist or why.</li><li>A second region for emergencies would take weeks of guesswork.</li><li>Last month, someone changed a setting by hand and check-in broke.</li></ul><p>How can the team rebuild and review the setup safely?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one change to the check-in servers, from a file edit to the cloud.</p>',
    steps:[
      {icon:'📄', title:'Describe it in code', text:'Write files that say what should exist, such as 3 servers and a database. This is called infrastructure as code, or IaC.'},
      {icon:'🔍', title:'Run a plan', text:'The tool compares the files with what really exists. It lists what it will add, change and destroy.'},
      {icon:'👀', title:'Review the plan', text:'A teammate reviews the plan in a pull request. Automatic checks block unsafe settings, such as a public storage bucket.'},
      {icon:'✅', title:'Apply from the pipeline', text:'The pipeline applies the plan using a locked, shared record of state. Nobody applies from a laptop.'},
      {icon:'🧭', title:'Catch drift', text:'Drift means the real setup no longer matches the code. Check often and fix it by changing the code.'}
    ],
    mount:host => iacDemo(host),
    html:`<h3>Everyday comparison</h3><p>Think of an architect’s blueprint.</p><div class="simple-table">${h.table(['Blueprint', 'Infrastructure as code'], [['Build the same house in another city', 'Create a second region from the same code.'], ['Review changes before the walls go up', 'Review the plan before applying.'], ['Notice a wall someone knocked out', 'Detect drift.']])}</div><div class="callout tip"><b>Important point</b><p>The code is the source of truth. Console clicks create drift.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Situation', 'Action'], [['You need a new region', 'Apply the same code with new settings.'], ['Someone changed a setting in the console', 'Run a plan, then fix the code or undo the change.'], ['A plan says destroy', 'Stop and review before applying.']])}</div>`,
    deep:`<h4>How it works inside</h4><p>A plan prints a short count, for example <code>Plan: 3 to add, 0 to change, 0 to destroy.</code> A reviewer reads this first. A line such as <code>1 to destroy</code> next to a database deserves a full stop and a question.</p><p>The state file maps each resource name in the code to a real cloud ID. Rename a resource in the code and the tool may see the old name as gone and the new name as missing. The plan then shows 1 to destroy and 1 to add. A moved block in Terraform keeps the real resource.</p><h4>The numbers</h4><p>Say the plan runs every hour. A hand change made at 14:10 shows as drift at the 15:00 run, 50 minutes later. A daily plan could leave it for up to 24 hours.</p><h4>When it goes wrong</h4><p>Two applies at once can corrupt the state, so a remote lock makes the second one wait. State can hold secrets such as database passwords, so encrypt it and limit who can read it. Keep stacks small, such as network, data and services, so one bad plan cannot touch everything.</p><h4>In code</h4><p>This sample creates 3 check-in servers and turns on versioning for a storage bucket.</p>` + h.code('hcl', `resource "aws_instance" "web" {
  count         = 3
  ami           = data.aws_ami.app.id
  instance_type = "m6i.large"
  subnet_id     = element(module.vpc.private_subnets, count.index)  # spread across zones
  tags = { service = "checkin", owner = "team-checkin", env = "prod" }
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration { status = "Enabled" }
}`, 'main.tf') + `<p>Ask for extra approval on destroy steps, and use <code>prevent_destroy</code> on databases. GitOps applies the same idea all the time. An agent inside the cluster keeps the real system equal to the files in git.</p>`
  },
  tradeoffs:{use:[`Use IaC for all production check-in infrastructure, especially anything you may need to rebuild.`, `Use it to create the emergency region from the same code.`], avoid:[`Do not change production by hand in the console.`, `Do not keep everything in one giant state file.`], alt:[`Use a managed platform that owns most of the infrastructure.`, `Imperative scripts are harder to compare and review.`]},
  real:[
    {co:'Terraform and OpenTofu', tier:'confirmed', text:'HashiCorp’s Terraform made plan, apply and state popular. OpenTofu is a Linux Foundation fork created after Terraform’s 2023 licence change.', src:'Terraform and OpenTofu documentation'},
    {co:'AWS CloudFormation', tier:'confirmed', text:'CloudFormation creates AWS resources from templates. It has change sets to preview changes and drift detection to find manual edits.', src:'AWS CloudFormation documentation'}
  ],
  mistakes:[`Applying from laptops with local state.`, `Writing secrets directly into IaC files.`, `Ignoring plan output that says destroy.`],
  interview:[`Mention IaC for repeatable setups and emergency regions.`, `Say that plans are reviewed in pull requests, applied from a pipeline and checked for drift.`],
  tryit:{note:'Change the code above and run apply. Then simulate a console edit and read the drift plan. Then check yourself.', quiz:[{q:'What does drift mean in IaC?', options:['Clock skew', 'A slow apply', 'A version upgrade', 'The real setup no longer matches the code'], answer:3, why:'It is usually caused by manual changes.'}, {q:'Why apply from a pipeline and not from a laptop?', options:['It is faster', 'It uses locked shared state and leaves a record', 'Laptops cannot run the tool', 'It skips review'], answer:1, why:'Shared state stops two people from colliding, and the pipeline records who applied what.'}], quizId:'obs-l7'},
  sources:[`Terraform and OpenTofu documentation`, `AWS CloudFormation documentation`, `Morris, Infrastructure as Code (2nd ed., 2020)`]
},
{
  id:'zero-downtime-migrations', title:'Zero-downtime database migrations', minutes:11, tags:['schema migration','expand-contract','backfill','dual write','online DDL'],
  summary:'Change a database without downtime with the expand-contract pattern. Add the new column, write to both, copy old rows in batches, switch reads, and only then remove the old column.',
  problem:`<h3>A small example</h3><p>The passengers table has 200 million rows. The team wants to rename the column <code>phone</code> to <code>mobile</code>.</p><ul><li>Check-in must stay up during the change.</li><li>Old and new app copies run side by side during a release.</li><li>A blocking change on a huge table can lock writes for hours.</li></ul><p>How can the rename happen with no downtime?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the rename of <code>phone</code> to <code>mobile</code> through five safe steps.</p>',
    steps:[
      {icon:'➕', title:'Expand', text:'Add the new mobile column. Old code ignores it, so nothing breaks.'},
      {icon:'✍️', title:'Write both', text:'Deploy code that writes phone and mobile. Old and new copies can run together.'},
      {icon:'📦', title:'Backfill', text:'Copy old rows into the new column in small batches. The job can pause and resume.'},
      {icon:'🔀', title:'Switch reads', text:'After you check that the values match, deploy code that reads mobile.'},
      {icon:'🧹', title:'Contract', text:'Stop writing phone, wait a safe period, then drop it in a later release.'}
    ],
    stepper:{title:'Expand, migrate, contract: the same plan in detail', items:[
      {title:'1. Expand the schema', tag:'additive', text:'Add <code>mobile</code> as a nullable column. Old code ignores it. Adding a nullable column in Postgres only changes metadata. For huge MySQL tables, use an online tool such as gh-ost.'},
      {title:'2. Dual write', tag:'app v2', text:'Deploy code that writes <code>phone</code> and <code>mobile</code>, and still reads <code>phone</code>. Old and new copies are both safe.'},
      {title:'3. Backfill', tag:'batches', text:'Copy existing rows in small batches, such as 5,000 rows, and slow down when replicas fall behind. Make the job safe to repeat.'},
      {title:'4. Verify', tag:'compare', text:'Check that counts and sample values match. You can also read both and compare in the background.'},
      {title:'5. Switch reads', tag:'app v3', text:'Deploy code that reads <code>mobile</code>, behind a flag for a quick return. It still writes both.'},
      {title:'6. Stop old writes', tag:'app v4', text:'Stop writing <code>phone</code> once v3 is stable and no old version runs.'},
      {title:'7. Contract', tag:'cleanup', text:'Drop <code>phone</code> in a later release, after a safe period and a fresh backup.'}]},
    html:`<h3>Everyday comparison</h3><p>Think of replacing a bridge while traffic keeps flowing.</p><div class="simple-table">${h.table(['Replacing a bridge', 'Migration'], [['Build the new bridge next to the old one', 'Add the new column next to the old one.'], ['Open it while the old one still works', 'Write to both while both are valid.'], ['Move traffic over gradually', 'Move reads over after checking.'], ['Remove the old bridge when nobody uses it', 'Drop the old column last.']])}</div><div class="callout tip"><b>Important point</b><p>Never rename or drop a column in the same release as the code that needs the change.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Step', 'Safety check'], [['Backfill', 'Use small batches and slow down if replicas lag.'], ['Switch reads', 'Use a flag so you can switch back fast.'], ['Drop the old column', 'Wait a safe period and take a backup first.']])}</div>`,
    deep:`<h4>The numbers</h4><p>200,000,000 rows ÷ 5,000 rows per batch = 40,000 batches. At one batch each second, that is 40,000 seconds, about 11 hours. Say the job pauses when replica lag passes 5 seconds, so replicas stay up to date.</p><p>The new column costs space too. Say each phone number takes 12 bytes. Then 200,000,000 × 12 = 2.4 GB of extra data.</p><h4>When it goes wrong</h4><p>Some changes take a strong lock that blocks writes, such as changing a column type or building an index the normal way. Build indexes with <code>CREATE INDEX CONCURRENTLY</code>. Add a rule as <code>NOT VALID</code> first and check it later with <code>VALIDATE CONSTRAINT</code>. Set <code>lock_timeout</code>, say 2 seconds. In Postgres, a waiting lock request makes later writes queue behind it, so giving up fast is safer.</p><h4>How it works inside</h4><p>New code writes both columns during the backfill. So the backfill must only fill rows where mobile is still empty. Otherwise it could overwrite a newer value.</p>`
  },
  tradeoffs:{use:[`Use these steps for any change to the passengers table on a live system.`, `Use them when data moves between tables, databases or services.`], avoid:[`Do not rename or drop a column in the same release as the code change.`, `Do not run one huge backfill in a single transaction.`], alt:[`Use a maintenance window, which is simpler but causes downtime.`, `Use a new table with a view for a complex reshape.`]},
  real:[
    {co:'GitHub', tier:'confirmed', text:'GitHub built gh-ost, a tool that changes big MySQL tables by copying them in the background. It can be throttled and paused without locking production.', src:'GitHub Engineering, gh-ost (2016)'},
    {co:'Stripe', tier:'confirmed', text:'Stripe described four steps for online data moves: dual write, change reads, change writes, and remove the old data.', src:'Stripe Engineering, Online migrations at scale (2017)'}
  ],
  mistakes:[`Renaming or dropping a column while old code still runs.`, `Running a backfill so fast that it overloads the primary database.`, `Setting no lock timeout, so a migration waits behind a long query and blocks every write.`],
  interview:[`When a design needs a schema change, describe expand, dual write, backfill and contract.`],
  tryit:[
    {quiz:[{q:'Why backfill in small batches?', options:['A huge single job can overload the database and make replicas lag', 'SQL requires batches', 'It makes old code stop working', 'It skips verification'], answer:0, why:'Small, throttled batches keep check-in fast during the copy.'}, {q:'Why deploy code that writes both columns first?', options:['It removes the old column', 'Old and new app copies both stay correct while they run together', 'It makes queries faster', 'It avoids a backup'], answer:1, why:'During a rolling release, both versions are live at the same time.'}]},
    {note:'Order the steps for safely renaming a column:', mount:host => orderGame(host, ['Add the new nullable column', 'Deploy code that writes both columns', 'Backfill old rows in small batches', 'Check that old and new values match', 'Deploy code that reads the new column', 'Stop writing the old column', 'Drop the old column in a later release'], '✓ All seven steps in order. Old and new code worked at every stage.')}
  ],
  sources:[`GitHub gh-ost (2016)`, `Stripe, Online migrations at scale (2017)`, `PostgreSQL documentation`, `Sadalage and Ambler, Refactoring Databases (2006)`]
},
{
  id:'finops', title:'FinOps and cloud cost', minutes:10, tags:['FinOps','cost','reserved','spot','egress','unit economics'],
  summary:'Cloud cost is an engineering number. Measure the cost per check-in and commit to the steady baseline. Use cheap spare capacity for work that can be interrupted, and watch data transfer and logs.',
  problem:`<h3>A small example</h3><p>The cloud bill for the check-in app doubled in six months. Traffic grew only 30%.</p><ul><li>Test servers run all weekend.</li><li>Databases are bigger than they need to be.</li><li>Debug logs are kept for years.</li></ul><p>Who owns the bill, and where can the app save money without hurting passengers?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the check-in bill from a surprise to a plan.</p>',
    steps:[
      {icon:'🏷️', title:'Tag everything', text:'Label each resource with its team and service. Then each team can see its own bill.'},
      {icon:'🧮', title:'Measure cost per unit', text:'Track the cost per check-in, not only the total. Growth is fine if the cost per check-in falls.'},
      {icon:'💳', title:'Pay less per unit', text:'Commit to the steady baseline for a discount, called a savings plan. Use spot capacity, which is spare servers sold cheaply, for work that can be interrupted.'},
      {icon:'📉', title:'Use less', text:'Right-size oversized servers and turn test systems off at night. Delete forgotten disks and old snapshots.'},
      {icon:'🏗️', title:'Change the design', text:'Cut data transfer and log volume. A CDN and a shorter log retention can save more than server tweaks.'}
    ],
    mount:host => finopsCalc(host),
    html:`<h3>Everyday comparison</h3><p>Think of the electricity bill of a big family.</p><div class="simple-table">${h.table(['Family electricity bill', 'Cloud bill'], [['A meter in each room', 'Tags show each team’s cost.'], ['A cheaper monthly plan for steady use', 'Commit to the steady baseline.'], ['Cheap off-peak power for the washing machine', 'Spot capacity for work that can be interrupted.']])}</div><div class="callout tip"><b>Important point</b><p>You cannot save on a bill that nobody can see. Start with tags and cost per unit.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Saving', 'Type'], [['Commit to the baseline', 'Pay less per unit.'], ['Turn test servers off at night', 'Use less.'], ['Serve images through a CDN', 'Change the design.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Use the calculator's example prices: $0.048 per vCPU-hour and 730 hours a month. Check-in needs 200 vCPUs all day and 600 for 6 hours at the peak.</p><ul><li>Baseline: 200 × 730 = 146,000 vCPU-hours. Peak extra: 400 × 6 × about 30.4 days = 73,000.</li><li>On demand: (146,000 + 73,000) × 0.048 = about $10,500.</li><li>Baseline with a 45% discount: 146,000 × 0.048 × 0.55 = $3,854. Peak on demand is $3,504. Total about $7,400.</li><li>Peak on spot at 70% off: 3,504 × 0.3 = $1,051. Total about $4,900.</li></ul><h4>When it goes wrong</h4><p>Data transfer can rival compute. Say check-in sends 50 TB a month to the internet at $0.09 per GB. That is 50,000 × 0.09 = $4,500, nearly as much as the $4,900 above. A CDN from Module 3 can cut it.</p><p>A commitment is a promise. If use drops below 200 vCPUs, you still pay for all 200. Commit only to the steady floor.</p>`
  },
  tradeoffs:{use:[`Commit to the steady 200 vCPU baseline of check-in.`, `Use spot capacity for stateless workers that can be retried.`, `Track the cost per check-in as an engineering number.`], avoid:[`Do not commit to capacity you may not need next year.`, `Do not put the only copy of data on spot servers.`, `Do not save pennies on servers while data transfer and logs cost far more.`], alt:[`Use serverless for spiky, low-volume work.`, `Use your own hardware for very steady, large workloads, but count the work to run it.`]},
  real:[
    {co:'FinOps Foundation', tier:'confirmed', text:'This Linux Foundation project describes FinOps practices and the phases Inform, Optimise and Operate.', src:'FinOps Foundation, FinOps Framework'},
    {co:'AWS', tier:'confirmed', text:'AWS advertises Savings Plans up to 72% below on-demand and Spot capacity up to 90% below, with Spot servers reclaimable at two minutes’ notice.', src:'AWS Savings Plans and EC2 Spot pricing pages'}
  ],
  mistakes:[`Leaving resources untagged, so nobody owns them.`, `Keeping debug logs at full retention in production.`, `Running test environments 24 hours a day.`],
  interview:[`Mention cost per unit, commitments plus spot, and data transfer and caching when asked to cut cost.`],
  tryit:[
    {quiz:[{q:'Which workload fits spot servers best?', options:['The only copy of passenger data', 'A single primary database', 'A login server with no backup', 'Stateless workers that can be retried'], answer:3, why:'Spot servers can be reclaimed, so only work that can be repeated belongs there.'}, {q:'Why track the cost per check-in?', options:['It shows that total cost can rise while cost per check-in falls, which is healthy growth', 'It lowers the bill by itself', 'It replaces tags', 'Finance requires it'], answer:0, why:'The total alone cannot tell growth from waste.'}]},
    {note:'Try the calculator above with a big daily peak. Then classify each saving:', mount:host => sortGame(host, [
      {t:'Buy a 1-year savings plan for the always-on baseline', c:'rate', why:'The same use at a lower price.'},
      {t:'Shut down test systems at night and on weekends', c:'use', why:'It uses less.'},
      {t:'Serve boarding pass images through a CDN to cut origin transfer', c:'arch', why:'It changes the design.'},
      {t:'Run boarding pass PDF workers on spot servers', c:'rate', why:'It is cheaper capacity for interruptible work.'},
      {t:'Downsize a database running at 8% CPU', c:'use', why:'It is right-sizing.'},
      {t:'Keep chatty services in the same zone as their database', c:'arch', why:'It avoids data transfer between zones.'}
    ], [{id:'rate', label:'Rate (pay less per unit)'}, {id:'use', label:'Usage (use less)'}, {id:'arch', label:'Design change'}])}
  ],
  sources:[`FinOps Foundation Framework`, `AWS Well-Architected Cost Optimization Pillar`, `AWS Savings Plans and Spot pricing pages`]
}
];

SDA.register({
  kind:'module', id:'observability', order:11, level:'advanced', icon:'🔭', title:'Observability & Ops',
  summary:'Logs, metrics and traces with OpenTelemetry; golden signals, RED and USE; SLO burn-rate alerting and on-call; incident response and blameless postmortems; CI/CD; rolling, blue-green and canary deploys; infrastructure as code; zero-downtime migrations; FinOps.',
  outcomes:['Instrument a service with correlated logs, metrics and traces', 'Pick the right signals (golden/RED/USE) and alert on SLO burn rate without alert fatigue', 'Run an incident and write a blameless postmortem', 'Design a CI/CD pipeline with safe progressive delivery and automated rollback', 'Change schemas and infrastructure safely and reason about cloud cost per unit'],
  lessons,
  quiz:[
    {q:'Which signal best shows where the time went in one slow request across services?', options:['A CPU metric', 'A distributed trace', 'An access log on the gateway', 'A dashboard average'], answer:1, why:'Spans show how long each step took.'},
    {q:'Why should passenger ID not be a metric label?', options:['It is private', 'Metrics cannot hold text', 'It slows logging', 'It creates one time series per passenger'], answer:3, why:'The number of series explodes. Put it in logs or trace attributes.'},
    {q:'The four golden signals are…', options:['CPU, memory, disk, network', 'Rate, errors, duration, uptime', 'Latency, traffic, errors, saturation', 'p50, p90, p99, max'], answer:2, why:'They come from Google’s SRE book.'},
    {q:'USE stands for…', options:['Users, sessions, errors', 'Utilisation, saturation, errors', 'Uptime, speed, efficiency', 'Usage, spend, effort'], answer:1, why:'Brendan Gregg’s method for resources.'},
    {q:'A 99.9% SLO and a 10% error rate mean a burn rate of…', options:['10', '1,000', '0.1', '100'], answer:3, why:'10% ÷ 0.1% = 100.'},
    {q:'What should happen first in an incident?', options:['Find the root cause', 'Reduce passenger impact by rolling back or failing over', 'Write the postmortem', 'Assign blame'], answer:1, why:'Restore service first.'},
    {q:'Which rollout exposes the fewest passengers to a bad release before it is noticed?', options:['Blue-green', 'Rolling', 'All at once', 'Canary'], answer:3, why:'A canary starts with a small share.'},
    {q:'DORA’s four key metrics include…', options:['Lines of code', 'Number of meetings', 'Deployment frequency and change failure rate', 'Test count'], answer:2, why:'The others are lead time and time to restore.'},
    {q:'To rename a column with no downtime, you should…', options:['Rename it and deploy at the same moment', 'Take the site down', 'Drop and recreate the table', 'Expand, write both, backfill, switch reads, then contract'], answer:3, why:'Old and new code must both work during the rollout.'},
    {q:'Infrastructure drift is…', options:['The real setup diverging from the code', 'A Terraform bug', 'Clock skew', 'A cost spike'], answer:0, why:'It is usually caused by manual changes.'},
    {q:'Which is the best fit for spot servers?', options:['A single primary database', 'Stateless workers that can be retried', 'The only copy of passenger data', 'A login server with no backup'], answer:1, why:'Spot servers can be reclaimed, so only repeatable work belongs there.'},
    {type:'scenario', q:'Check-in p99 latency doubled after 5 AM yesterday and nobody knows why. Walk through how you would investigate with observability tools.', answer:'<ol><li>Check the <b>RED dashboard</b> and the SLO burn for check-in. Is it all requests or only some, for example one endpoint, region or app version? Look for release or setting markers around 5 AM.</li><li>Open <b>slow traces</b>, kept by tail sampling, and find the span on the critical path, such as a seat query or a baggage call.</li><li>Check that dependency’s <b>USE</b> numbers: pool saturation, database CPU, locks and replica lag.</li><li>Read the <b>logs for that trace ID</b> to see why the slow span was slow.</li><li><b>Mitigate first</b> if passengers are hurt. Roll back the release or switch a flag off, then fix the cause.</li><li>Add an alert or a dashboard so the next case is found faster.</li></ol>'},
    {type:'scenario', q:'Design the release process for a check-in service that deploys 10 times a day.', answer:'<ul><li><b>CI:</b> fast tests, contract tests with services that depend on it, security scans and one signed image per commit.</li><li><b>CD:</b> staging with end-to-end tests, then a production canary of 1% of traffic in each region. Compare it with a matching baseline using automatic analysis of check-in success rate, latency and errors. Then 10%, 50% and 100%, with waits and automatic rollback.</li><li><b>Data:</b> run database changes as separate expand and contract steps, and make requests safe to repeat so retries during a rollout do no harm.</li><li><b>Flags:</b> use flags with kill switches for risky features, and freeze releases during peak travel days.</li><li><b>People:</b> mark releases on dashboards and keep a runbook for rollback.</li></ul>'}
  ],
  cheatsheet:[
    {h:'🔭 Signals', items:['Metrics: cheap numbers over time, for alerts and dashboards', 'Logs: structured JSON with a trace ID', 'Traces: spans and the critical path, W3C traceparent', 'OpenTelemetry SDK and Collector', 'Histograms give percentiles, so watch label count', 'Head and tail sampling']},
    {h:'🩺 What to measure', items:['Golden: latency, traffic, errors, saturation', 'RED for each service: rate, errors, duration', 'USE for each resource: utilisation, saturation, errors', 'Business signals: check-ins per minute, boarding passes issued']},
    {h:'🚨 Alerting and incidents', items:['Page only urgent, actionable, passenger-visible problems', 'Burn rate = error rate ÷ (1 − SLO)', 'Page at 14.4 (1 h and 5 min) and 6 (6 h and 30 min), ticket at 1 (3 days)', 'Incident commander, ops, comms and scribe, and mitigate first', 'Blameless postmortem with owned actions']},
    {h:'🚀 Delivery', items:['Build once and promote the same image', 'Waves: one server, one zone, one region, with waits', 'Rolling, blue-green and canary trade-offs', 'Automatic canary analysis and rollback', 'DORA: frequency, lead time, failure rate, time to restore']},
    {h:'🧱 Infrastructure and data changes', items:['IaC: plan in a pull request, apply from a pipeline, locked remote state', 'Find drift and fix it in code', 'Expand, write both, backfill, switch reads, contract', 'Online changes, CONCURRENTLY and lock_timeout']},
    {h:'💸 FinOps', items:['Tag everything and track cost per unit', 'Commit to the baseline and use spot for interruptible work', 'Right-size and turn test systems off when idle', 'Watch data transfer, zone traffic, logs and NAT', 'Inform, Optimise, Operate']}
  ],
  glossary:[
    {term:'Observability', def:'How well you can understand what is happening inside a system by looking at what it outputs. Example: from metrics, logs and traces you can tell why check-in is slow.'},
    {term:'Metric', aka:['metrics', 'time series'], def:'A number tracked over time. Example: check-ins per minute, or p99 latency every minute.'},
    {term:'Structured logging', aka:['structured logs', 'structured records'], def:'Writing logs as records with named fields, such as JSON, so they can be searched. Example: service = booking, trace_id = abc, error = seat taken.'},
    {term:'Distributed tracing', aka:['trace', 'traces', 'tracing'], def:'Recording the path of one request through many services as a tree of timed steps. Example: one check-in shows the time spent in login, booking, seats and baggage.'},
    {term:'Span (tracing)', aka:['trace span', 'span', 'spans'], def:'One timed step inside a trace. Example: the seat lookup took 120 ms.'},
    {term:'Trace ID', aka:['trace_id', 'traceparent'], def:'An ID shared by every span and log line of one request, passed from service to service. Example: search the logs for one trace ID to see the whole request.'},
    {term:'OpenTelemetry', aka:['OTel'], def:'A free, vendor-neutral toolkit for collecting traces, metrics and logs. Example: instrument the check-in service once and send the data to any tool.'},
    {term:'Critical path', def:'The chain of steps that decides how long the whole request takes. Example: if seats take 120 ms and baggage takes 20 ms in parallel, the seats call is on the critical path.'},
    {term:'Tail sampling', aka:['head sampling'], def:'Choosing which traces to keep after they finish, so slow and failed ones are kept. Head sampling decides at the start instead. Example: keep every trace slower than 2 seconds.'},
    {term:'Exemplar', aka:['exemplars'], def:'A sample trace ID attached to a metric point, so you can jump from a spike to a real request. Example: click the latency spike at 5:02 AM and open one slow request.'},
    {term:'Histogram', aka:['histograms'], def:'A metric that counts values into ranges, called buckets, so percentiles can be calculated. Example: how many requests took 0 to 100 ms, 100 to 200 ms and so on.'},
    {term:'Golden signals', aka:['four golden signals'], def:'Four numbers that describe the health of a user-facing system: latency, traffic, errors and saturation. Example: a check-in dashboard shows all four.'},
    {term:'RED method', def:'A checklist for services: Rate, Errors and Duration. Example: for the Booking service, graph requests per second, failed requests and request time.'},
    {term:'USE method', def:'A checklist for resources: Utilisation, Saturation and Errors. Example: for a database connection pool, check how many are in use, how many requests wait and how many fail.'},
    {term:'Saturation', def:'How full a resource is, often shown as waiting work or pool usage. Example: 95 of 100 database connections are in use.'},
    {term:'Alert fatigue', aka:['too many alerts'], def:'Becoming numb to alerts because there are too many and many need no action. Example: after 140 pages a week, an engineer starts ignoring them.'},
    {term:'Runbook', aka:['runbooks', 'playbook'], def:'Written steps for handling a specific alert or task. Example: “If check-in errors rise: check the last release, then roll back if needed.”'},
    {term:'On-call', def:'A rota where engineers take turns being ready to respond to production alerts. Example: one engineer carries the pager this week.'},
    {term:'Incident commander', aka:['IC'], def:'The person who coordinates an incident response and decides who does what. Example: they tell one person to roll back and another to update the airport staff.'},
    {term:'Postmortem', aka:['postmortems', 'post-incident review'], def:'A written review after an incident: what happened, the impact, the causes and the actions to take. Example: a one-page review of the 5 AM check-in outage.'},
    {term:'Blameless postmortem', aka:['blameless'], def:'A postmortem that looks for what in the system allowed the mistake, not who made it. Example: ask why one command could delete production, not who typed it.'},
    {term:'Continuous integration', aka:['CI'], def:'Merging small changes often, with an automatic build and tests on every change. Example: each pull request runs unit tests within minutes.'},
    {term:'Continuous delivery', aka:['CD', 'continuous deployment'], def:'Keeping every build ready to release and moving it through stages automatically. Example: a passing change goes to staging, then to production in waves.'},
    {term:'DORA metrics', def:'Four numbers about delivery: how often you deploy, how long a change takes to reach users, how often changes fail and how fast you recover. Example: deploy 10 times a day, with 2% of changes failing.'},
    {term:'Trunk-based development', def:'Everyone merges small changes into the main branch often, and uses flags to hide unfinished work. Example: the check-in app has no long-lived branches.'},
    {term:'Bake time', def:'A wait after releasing to one stage, while you watch the metrics, before moving on. Example: wait 30 minutes after the first server.'},
    {term:'Rolling update', aka:['rolling deployment'], def:'Replacing servers a few at a time. Example: replace 2 of 10 servers, wait, then replace 2 more.'},
    {term:'Blue-green deployment', aka:['blue-green'], def:'Running two identical environments and switching all traffic from the old one (blue) to the new one (green). Example: switch back to blue if green has a bug.'},
    {term:'Canary release', aka:['canary', 'canary deployment'], def:'Sending a small share of traffic to the new version first and comparing it with the old one. Example: 5% of check-ins use the new seat map.'},
    {term:'Automated canary analysis', aka:['Kayenta'], def:'A tool that compares the canary’s metrics with a baseline and decides whether to continue or roll back. Example: errors on the canary rise, so the release is rolled back.'},
    {term:'Dark launch', aka:['shadow launch'], def:'Running new code on real traffic without showing its results to users. Example: the new seat map code runs on copies of requests, and nobody sees its answers.'},
    {term:'GitOps', def:'Keeping the wanted state in git and letting an agent make the real system match it. Example: merge a change to a file, and the cluster updates itself.'},
    {term:'Infrastructure as code', aka:['IaC'], def:'Describing servers, networks and databases in files that are versioned and reviewed. Example: a file says “3 servers and a database”, and a tool creates them.'},
    {term:'Terraform', aka:['OpenTofu'], def:'A popular infrastructure-as-code tool. It compares your files with reality, shows a plan, then applies it. Example: terraform plan lists what it will add or destroy.'},
    {term:'Configuration drift', aka:['drift'], def:'When the real setup no longer matches the code. Example: someone deletes a server in the console, so the code says 3 but only 2 exist.'},
    {term:'Expand-contract migration', aka:['expand and contract', 'parallel change', 'expand-contract'], def:'A safe way to change a database: add the new thing, move data and code over, then remove the old thing. Example: add a mobile column, copy phone into it, switch reads, then drop phone.'},
    {term:'Backfill', def:'Copying old data into a new column or store, usually in small batches. Example: fill the new mobile column for 200 million existing rows.'},
    {term:'Online schema change', aka:['online DDL', 'gh-ost'], def:'Changing a table’s structure without blocking reads and writes for long. Example: gh-ost copies a huge table in the background and then swaps it in.'},
    {term:'FinOps', def:'Managing cloud cost as a team effort between engineering, finance and product. Example: each team sees and owns its own bill.'},
    {term:'Unit economics', aka:['cost per unit'], def:'Cost measured per business unit. Example: the cost per check-in falls from ₹0.40 to ₹0.30 as the app grows.'},
    {term:'Spot instances', aka:['spot instance', 'spot capacity', 'preemptible VMs', 'spot servers'], def:'Cheap spare cloud servers that the provider can take back at short notice. Example: use them for boarding pass PDF workers that can be retried.'},
    {term:'Savings plan', aka:['reserved instances', 'committed use discount', 'savings plans'], def:'A discount for promising to use a certain amount for one or three years. Example: commit to 200 vCPUs for a year and pay about 45% less.'},
    {term:'Egress', aka:['data transfer out'], def:'Data sent out of a cloud region or provider, usually billed per GB. Example: boarding pass images sent to passengers’ phones.'},
    {term:'Right-sizing', aka:['right-size', 'right-sized'], def:'Matching server sizes to what is really used. Example: shrink a database that runs at 8% CPU.'},
    {term:'Dual write', aka:['dual writes'], def:'Writing the same data to both the old and the new place during a migration. Example: write phone and mobile together.'},
    {term:'Staging environment', aka:['staging'], def:'A copy of production where a release is tested before real users get it. Example: run end-to-end tests of a full check-in there.'}
  ],
  sources:['Beyer et al., Site Reliability Engineering (2016) and The Site Reliability Workbook (2018)', 'Sigelman et al., Dapper (2010); OpenTelemetry and W3C Trace Context specs', 'Wilkie, The RED Method; Gregg, The USE Method', 'Allspaw, Blameless PostMortems (2012)', 'Forsgren, Humble & Kim, Accelerate (2018); Amazon Builders’ Library, safe deployments', 'Netflix and Google, Kayenta (2018); GitHub gh-ost (2016); Stripe, Online migrations at scale (2017)', 'Terraform/OpenTofu and CloudFormation docs; FinOps Foundation Framework; AWS pricing pages']
});
} catch(e){ console.error('[SDA] module observability', e); SDA.errors.push({id:'observability', error:e}); }
})();
