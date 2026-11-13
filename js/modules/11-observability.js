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
    const root = span('GET /restaurants/42', 'gateway', 0, 0, null);
    const auth = span('auth.verifyToken', 'auth', 2, 6, root);
    let t = auth.end + 1;
    const branch = (fn) => { const s0 = t; const e = fn(s0); if (!P.parallel) t = e + 1; return e; };
    const ends = [];
    ends.push(branch(s0 => { const c = span('catalog.getMenu', 'catalog', s0, 0, root); let ct = s0 + 2; const n = P.nplus1 ? 12 : 1; for (let i = 0; i < n; i++){ const q = span(P.nplus1 ? `SELECT * FROM dishes WHERE id=$1  (#${i + 1})` : 'SELECT * FROM dishes WHERE restaurant_id=$1', 'postgres', ct, P.nplus1 ? 9 : 14, c); ct = q.end + 1; } c.dur = ct + 3 - s0; c.end = s0 + c.dur; return c.end; }));
    ends.push(branch(s0 => { const r = span('reviews.summary', 'reviews', s0, 0, root); let rt = s0 + 1; const ch = span('redis GET reviews:42', 'redis', rt, 1.2, r, P.cacheHit ? 'hit' : 'miss'); rt = ch.end + .5; if (!P.cacheHit){ const q = span('SELECT avg(rating)… FROM reviews', 'postgres', rt, P.slowDb ? 820 : 35, r, P.slowDb ? 'Seq Scan (missing index)' : 'Index Scan'); rt = q.end + 1; } r.dur = rt + 1 - s0; r.end = s0 + r.dur; return r.end; }));
    ends.push(branch(s0 => { const o = span('offers.forUser', 'offers', s0, 22, root); return o.end; }));
    ends.push(branch(s0 => { const e = span('eta.estimate', 'eta', s0, 48, root); return e.end; }));
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
    ui.toggle({label:'Reviews cache hit', checked:true, onChange:v => { P.cacheHit = v; run(); }}).el,
    ui.toggle({label:'Missing DB index (slow query)', checked:false, onChange:v => { P.slowDb = v; run(); }}).el,
    ui.toggle({label:'N+1 queries in catalog', checked:false, onChange:v => { P.nplus1 = v; run(); }}).el,
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
  summary:'Metrics tell you that something is wrong, traces tell you where, and logs tell you why. Correlate all three with a shared trace ID, and instrument once with OpenTelemetry.',
  problem:`<p>Customers say the restaurant page is “sometimes slow”. The dashboard shows p99 latency doubled at 8 PM. But the page touches a gateway, auth, catalog, reviews, offers, ETA, Redis and Postgres. Which one? Grepping logs on 40 servers for “slow” finds nothing useful. You need to follow <i>one</i> slow request through every service.</p>`,
  intuition:`A courier parcel. <b>Metrics</b> are the daily dashboard (“2% of parcels late today”). A <b>trace</b> is one parcel’s tracking history (“picked up 10:02, hub 11:40, out for delivery 18:55”), which shows where the time went. <b>Logs</b> are the notes at each step (“address unclear, called customer”), which explain why.`,
  how:{
    steps:[`<b>Metrics</b>: cheap numeric time series (counters, gauges, histograms) aggregated over time, such as request rate, error rate and latency histograms. Use them for dashboards and alerts.`, `<b>Logs</b>: timestamped events. Make them <b>structured</b> (JSON with fields), with consistent keys (service, trace_id, user/tenant, error).`, `<b>Traces</b>: a tree of <b>spans</b>, each a timed operation (name, start, duration, attributes, parent). Context (trace_id, span_id) is propagated in headers (W3C <code>traceparent</code>) across every call.`, `<b>Correlate</b>: logs carry trace_id; metric exemplars link a latency spike to example traces; dashboards jump to traces, traces to logs.`, `<b>OpenTelemetry</b>: one vendor-neutral set of APIs/SDKs, auto-instrumentation and a Collector that receives, processes (sampling, redaction) and exports to any backend.`],
    mount:host => traceDemo(host),
    deep:`<p><b>Cost and cardinality:</b> each unique label combination is a new time series. Labels like user_id or full URL explode metric cardinality and cost, so put those in logs or trace attributes instead. Logs are the most expensive per byte: sample debug logs, keep error logs, and set retention by value.</p><p><b>Sampling traces:</b> <i>head sampling</i> decides at the start (e.g. 1%), which is cheap but misses rare slow requests. <i>Tail sampling</i> (in the Collector) decides after the trace completes, so it can keep all errors and slow traces and a sample of the rest, at the cost of buffering spans.</p><p><b>Histograms, not averages:</b> record latency as histograms (fixed or exponential buckets) so you can compute p95/p99 across instances; you cannot average percentiles from different hosts.</p>`
  },
  tradeoffs:{use:[`All three signals for any multi-service system, correlated by trace_id`, `OpenTelemetry to avoid locking instrumentation to one vendor`], avoid:[`Unstructured printf logs you can’t query`, `High-cardinality metric labels (user IDs, request IDs)`, `100% trace sampling at high traffic without a budget`], alt:[`Profiling (continuous CPU/memory profiles) for code-level hot spots`, `Real-user monitoring (RUM) for client-side performance`, `eBPF-based auto-instrumentation`]},
  real:[
    {co:'Google Dapper', tier:'confirmed', text:'Google’s Dapper paper (2010) described low-overhead, sampled distributed tracing with trace and span IDs propagated through RPCs. It inspired Zipkin, Jaeger and OpenTelemetry.', src:'Sigelman et al., “Dapper, a Large-Scale Distributed Systems Tracing Infrastructure”, Google Technical Report (2010)'},
    {co:'Uber Jaeger', tier:'confirmed', text:'Uber built and open-sourced Jaeger for distributed tracing across its microservices; it is a CNCF-graduated project.', src:'Uber Engineering, “Evolving Distributed Tracing at Uber Engineering” (2017); Jaeger documentation'},
    {co:'OpenTelemetry', tier:'confirmed', text:'OpenTelemetry formed in 2019 by merging OpenTracing and OpenCensus under the CNCF, and provides APIs, SDKs and the Collector for traces, metrics and logs.', src:'OpenTelemetry documentation'}
  ],
  mistakes:[`Logging without trace_id, so you can’t connect logs across services`, `Averaging latency instead of using percentiles from histograms`, `Putting user IDs in metric labels and exploding cardinality and cost`],
  interview:[`Name what you’d measure (RED per service), how you’d trace a slow request, and how logs link via trace_id`, `Mention sampling and cardinality as cost controls`],
  tryit:{note:'Toggle the cache miss, missing index and N+1 queries above and watch the critical path change. Then classify:', mount:host => sortGame(host, [
    {t:'p99 latency of /checkout over the last hour', c:'m', why:'Aggregated numeric time series.'},
    {t:'“Payment declined: insufficient funds” with order_id', c:'l', why:'A discrete event with context.'},
    {t:'Time spent in each service for one slow request', c:'t', why:'A trace with spans.'},
    {t:'Number of HTTP 5xx per minute', c:'m', why:'A counter.'},
    {t:'Stack trace of an exception', c:'l', why:'Event detail.'},
    {t:'Which downstream call was on the critical path', c:'t', why:'Span timing and parent/child structure.'}
  ], [{id:'m', label:'Metric'}, {id:'l', label:'Log'}, {id:'t', label:'Trace'}])},
  sources:[`Sigelman et al., Dapper (2010)`, `OpenTelemetry and W3C Trace Context specifications`, `Majors, Fong-Jones & Miranda, Observability Engineering (2022)`]
},
{
  id:'golden-signals-red-use', title:'Golden signals, RED and USE', minutes:9, tags:['golden signals','RED','USE','saturation','dashboards'],
  summary:'Three simple checklists tell you what to measure: the four golden signals (latency, traffic, errors, saturation), RED for request-driven services, and USE for resources.',
  problem:`<p>Your team has 400 dashboards and nobody knows which ones matter. During an incident people scroll through graphs of JVM threads, disk inodes and Kafka partitions looking for “something red”. You need a small, standard set of signals for every service and every resource, so anyone can tell what is wrong in a minute.</p>`,
  intuition:`A doctor’s quick check: pulse, temperature, blood pressure, oxygen. Four numbers tell you whether the patient needs attention before any detailed tests. Golden signals are a service’s vital signs.`,
  how:{
    stepper:{title:'Three checklists, one picture', items:[
      {title:'Latency', tag:'golden', text:'How long requests take, as percentiles (p50/p95/p99), separating successful and failed requests (fast errors can hide slow successes).'},
      {title:'Traffic', tag:'golden', text:'Demand on the system: requests/s, messages/s, concurrent streams, transactions/s.'},
      {title:'Errors', tag:'golden', text:'Rate of failing requests: explicit (5xx), implicit (200 with wrong content), and policy (slower than the SLO counts as failed).'},
      {title:'Saturation', tag:'golden', text:'How “full” the service is: CPU, memory, thread pools, queue depth, connection pools. Often the earliest warning.'},
      {title:'RED (services)', tag:'Tom Wilkie', text:'For every request-driven service: <b>R</b>ate, <b>E</b>rrors, <b>D</b>uration. The same three graphs for every microservice make dashboards consistent.'},
      {title:'USE (resources)', tag:'Brendan Gregg', text:'For every resource (CPU, disk, NIC, memory, connection pool): <b>U</b>tilisation, <b>S</b>aturation (queued work), <b>E</b>rrors. A systematic way to find the bottleneck.'}]},
    deep:`<p><b>Implicit errors:</b> a search API returning 200 with zero results because the index is empty is an error users feel, but HTTP codes don’t show it. Add business-level signals: orders/minute, successful payments, video start success.</p><p><b>Saturation leads, latency lags:</b> queues and pools fill before latency rises sharply (queueing theory: latency explodes near 100% utilisation). Alerting on saturation (e.g. connection pool 90% used) buys time.</p><p><b>Dashboards:</b> one overview per service (RED + key saturation + SLO status + deploy markers), then drill-down dashboards. Put deploys and config changes on graphs, since changes cause most incidents.</p>`
  },
  tradeoffs:{use:[`RED for every service, USE for every resource, golden signals in SLOs and on-call dashboards`], avoid:[`Dashboards of every metric you can collect`, `Only infrastructure metrics without user-facing signals`], alt:[`SLO-based dashboards (error budget remaining)`, `Business KPIs as health signals`]},
  real:[
    {co:'Google SRE — four golden signals', tier:'confirmed', text:'The SRE book’s monitoring chapter names latency, traffic, errors and saturation as the four golden signals to measure for any user-facing system.', src:'Site Reliability Engineering (2016), ch. 6 “Monitoring Distributed Systems”'},
    {co:'RED method', tier:'confirmed', text:'Tom Wilkie (Weaveworks, later Grafana Labs) proposed Rate, Errors, Duration as a standard set of metrics for every microservice.', src:'Tom Wilkie, “The RED Method: key metrics for microservices architecture” (2015/2018)'},
    {co:'USE method', tier:'confirmed', text:'Brendan Gregg’s USE method checks Utilisation, Saturation and Errors for every resource to find performance bottlenecks quickly.', src:'Brendan Gregg, “The USE Method”; Systems Performance (2nd ed., 2020)'}
  ],
  mistakes:[`Mixing failed and successful requests in one latency number`, `No saturation metrics until the pool is already exhausted`, `Different dashboard layouts for every service`],
  interview:[`For any design, say which golden signals you’d alert on and which business metric shows user impact`],
  tryit:{note:'Which golden signal is each metric?', mount:host => sortGame(host, [
    {t:'p99 of /search response time', c:'lat', why:'Latency.'},
    {t:'Orders placed per minute', c:'tra', why:'Traffic (business-level).'},
    {t:'DB connection pool 95% in use', c:'sat', why:'Saturation.'},
    {t:'5xx responses per second', c:'err', why:'Errors.'},
    {t:'Kafka consumer lag', c:'sat', why:'Work queued = saturation.'},
    {t:'Payments returning 200 but status=FAILED', c:'err', why:'An implicit error.'}
  ], [{id:'lat', label:'Latency'}, {id:'tra', label:'Traffic'}, {id:'err', label:'Errors'}, {id:'sat', label:'Saturation'}])},
  sources:[`Google SRE book, ch. 6`, `Wilkie, The RED Method`, `Gregg, The USE Method`]
},
{
  id:'alerting-oncall', title:'Alerting, dashboards and on-call', minutes:11, tags:['alerting','on-call','burn rate','SLO','paging','alert fatigue'],
  summary:'Page a human only for urgent, user-visible problems that need action now. Alert on symptoms and SLO burn rate rather than every cause, send everything else to tickets, and keep on-call humane.',
  problem:`<p>The on-call engineer got 140 pages last week: CPU at 80%, a disk at 85%, one pod restarting, a 2-minute error blip at 3 AM. Most needed no action. When the real outage came, the page sat among 12 others and was acknowledged 25 minutes late. Too many alerts is as dangerous as too few.</p>`,
  intuition:`A smoke alarm should ring when there is a fire, not every time you make toast. If it rings every morning, people take the battery out, and then it is silent during the real fire.`,
  how:{
    steps:[`Every page must be <b>urgent, actionable and user-visible</b>; otherwise make it a ticket or a dashboard.`, `Alert on <b>symptoms</b> (users see errors or latency) via SLOs, not on every <b>cause</b> (CPU high). Causes go on dashboards for diagnosis.`, `Use <b>error-budget burn rate</b>: how fast you are consuming the budget. Fast burn → page; slow burn → ticket.`, `Use <b>multiple windows</b> (long for significance, short for quick reset) to avoid flapping and false pages.`, `Every alert links to a <b>runbook</b> and a dashboard; review alerts after each on-call week and delete noisy ones.`, `Sustainable rotations: enough people, follow-the-sun if possible, compensation, a manageable number of pages per shift, and handover notes.`],
    mount:host => burnRateSim(host),
    deep:`<p><b>Burn-rate math:</b> with a 99.9% SLO the budget is 0.1% of requests over 30 days. A burn rate of 1 consumes exactly the budget in 30 days; 14.4 consumes 2% of the monthly budget in 1 hour; 6 consumes 5% in 6 hours. The SRE Workbook’s recommended starting point pages on 14.4× (1 h with a 5 min confirm window) and 6× (6 h with 30 min), and tickets on 1× (3 days with 6 h).</p><p><b>Low-traffic services:</b> burn-rate alerts are noisy when there are only a few requests an hour. Use synthetic probes to generate traffic, aggregate similar services, or alert on longer windows.</p><p><b>Alert quality metrics:</b> pages per shift, percentage actionable, time to acknowledge, and repeat alerts. Google’s SRE book suggests aiming for a small number of incidents per 12-hour shift so each gets proper attention.</p>`
  },
  tradeoffs:{use:[`SLO burn-rate pages for user-facing services`, `Cause-based alerts only when they predict imminent user impact (disk full in 4 h)`], avoid:[`Paging on CPU, memory or single-instance failures that redundancy already handles`, `Alerts without runbooks or owners`], alt:[`Tickets for slow burns and capacity trends`, `Synthetic monitoring for low-traffic paths`]},
  real:[
    {co:'Google SRE Workbook', tier:'confirmed', text:'The “Alerting on SLOs” chapter walks through threshold, window and burn-rate approaches and recommends multi-window, multi-burn-rate alerts (14.4×/6× paging, 1× ticketing) as a starting point.', src:'Beyer et al., The Site Reliability Workbook (2018), ch. 5'},
    {co:'Google SRE — on-call', tier:'confirmed', text:'The SRE book discusses balancing on-call load, limiting operational work to under 50% of SRE time, and keeping pages actionable.', src:'Site Reliability Engineering (2016), ch. 11 “Being On-Call”'},
    {co:'Food-delivery dinner peak', tier:'educational', text:'Page on order-placement success burning budget fast during dinner; ticket on a slow rise in rider-assignment latency; dashboard (no alert) for per-node CPU.', src:'Simplified educational design'}
  ],
  mistakes:[`Alerting on every cause metric`, `Static thresholds that page at 3 AM for 2-minute blips`, `Pages without a runbook, an owner or a link to the dashboard`],
  interview:[`Explain SLO-based alerting with burn rates and what pages vs what tickets`, `Mention runbooks and alert hygiene as part of the design`],
  tryit:{note:'Compare the three policies in the table above. Then:', quiz:[{q:'With a 99.9% SLO, the current error rate is 1.44%. The burn rate is…', options:['1.44', '14.4', '144', '0.144'], answer:1, why:'1.44% ÷ 0.1% = 14.4.'}, {q:'A disk is at 85% and grows 1%/day. Best action?', options:['Page now', 'Create a ticket / capacity alert', 'Ignore', 'Reboot'], answer:1, why:'Not urgent; plan the fix.'}], quizId:'obs-l3'},
  sources:[`Google SRE Workbook, ch. 5`, `Google SRE book, ch. 6 and 11`, `Rob Ewaschuk, “My Philosophy on Alerting” (Google)`]
},
{
  id:'incident-postmortems', title:'Incident response and blameless postmortems', minutes:10, tags:['incident','incident commander','mitigation','postmortem','blameless'],
  summary:'During an incident, organise (incident commander, roles, one channel), mitigate first and diagnose later, communicate regularly. Afterwards, write a blameless postmortem with concrete, tracked actions.',
  problem:`<p>Payments are failing during a sale. Twelve engineers jump into the chat, three try different fixes at once, one restarts the database “to see if it helps”, nobody updates customer support, and an hour later nobody knows what was changed. Then the review becomes a hunt for who to blame, so next time people hide mistakes.</p>`,
  intuition:`A hospital emergency room. One doctor leads (incident commander), others have clear jobs, the first goal is to stabilise the patient (mitigate), and the exact diagnosis comes after. Later a case review asks what in the <i>system</i> let it happen, not which nurse to punish.`,
  how:{
    stepper:{title:'Lifecycle of an incident', items:[
      {title:'Detect', tag:'alert', text:'An SLO alert, a customer report or a synthetic check fires. Acknowledge quickly.'},
      {title:'Declare & assign roles', tag:'IC', text:'Declare an incident with a severity. An <b>Incident Commander</b> coordinates; an <b>ops lead</b> makes changes; a <b>comms lead</b> updates stakeholders; a <b>scribe</b> keeps the timeline.'},
      {title:'Mitigate first', tag:'stop the bleeding', text:'Roll back the last deploy, flip a kill switch, fail over, shed load, scale up. Restore service before finding the root cause.'},
      {title:'Communicate', tag:'cadence', text:'Regular updates (e.g. every 30 min) to status page, support and leadership: impact, actions, next update time.'},
      {title:'Resolve & verify', tag:'monitor', text:'Confirm SLIs are back to normal, then close or downgrade the incident; keep watching for recurrence.'},
      {title:'Blameless postmortem', tag:'learn', text:'Timeline, impact, contributing factors (technical and organisational), what went well, where we got lucky, and action items with owners and dates.'},
      {title:'Follow through', tag:'actions', text:'Track action items to completion and share learnings widely. A postmortem with no completed actions is just a story.'}]},
    deep:`<p><b>Why blameless:</b> people closest to the failure have the most information. If honesty is punished they stop sharing it and the same failure repeats. Ask “what made this action seem reasonable at the time?”, look for missing guardrails (why could one command delete production?), and fix those.</p><p><b>Severity levels</b> (e.g. SEV1 = widespread user impact) decide who is paged, communication cadence and whether a postmortem is mandatory. Define them in advance.</p><p><b>Useful metrics:</b> time to detect, time to mitigate, time to resolve, and recurrence. MTTR alone hides a lot; look at the distribution and the causes.</p>`
  },
  tradeoffs:{use:[`A lightweight, practised incident process for every team that runs production systems`], avoid:[`Heroic, uncoordinated debugging`, `Root-causing before mitigating`, `Blame-oriented reviews`], alt:[`Tabletop exercises and game days to practise the process`]},
  real:[
    {co:'Google SRE', tier:'confirmed', text:'The SRE book describes an incident-command structure (incident commander, operations, communications, planning) and a blameless postmortem culture with tracked action items.', src:'Site Reliability Engineering (2016), ch. 14 “Managing Incidents” and ch. 15 “Postmortem Culture”'},
    {co:'Etsy', tier:'confirmed', text:'John Allspaw’s writing on blameless postmortems and a “just culture” at Etsy argued that blame leads people to hide information, while blamelessness enables learning.', src:'John Allspaw, “Blameless PostMortems and a Just Culture”, Code as Craft (2012)'},
    {co:'Public postmortems', tier:'confirmed', text:'Companies such as Cloudflare, GitHub, GitLab and AWS publish detailed post-incident reports describing timelines, contributing factors and remediation.', src:'Cloudflare, GitHub, GitLab and AWS public incident reports'}
  ],
  mistakes:[`Several people making changes at once without coordination`, `No timeline kept, so the postmortem is reconstructed from memory`, `Action items with no owner or due date`],
  interview:[`When asked about failures, describe detection, mitigation (rollback/failover/kill switch), communication and the postmortem`],
  tryit:{note:'Put the incident steps in order:', mount:host => orderGame(host, ['Alert fires and on-call acknowledges', 'Declare an incident and assign an incident commander', 'Mitigate: roll back the suspicious deploy', 'Post a status update with impact and next update time', 'Verify SLIs are back to normal and resolve', 'Write a blameless postmortem with owned action items'])},
  sources:[`Google SRE book, ch. 14–15`, `Allspaw, Blameless PostMortems (2012)`, `PagerDuty Incident Response documentation`]
},
{
  id:'ci-cd', title:'CI/CD pipelines', minutes:10, tags:['CI','CD','pipeline','DORA','trunk-based','artifact'],
  summary:'Continuous integration merges and tests small changes constantly; continuous delivery keeps every build releasable and deploys it automatically through stages with checks. Small, frequent changes are safer than big, rare ones.',
  problem:`<p>The team releases once a month: 300 changes merged in the last week, a two-day manual QA cycle, and a Friday-night deployment run from a wiki page. When something breaks, which of the 300 changes caused it? Rolling back undoes everything. Big batches make every release scary, so releases get even rarer.</p>`,
  intuition:`Washing dishes after every meal versus once a month. Small, frequent batches are easy and nothing piles up. A month’s pile is a miserable all-day job, and you can’t tell which dish made the sink smell.`,
  how:{
    steps:[`<b>CI</b>: every change goes through a pull request into a short-lived branch or trunk; automated build, unit tests, static analysis and security scans run in minutes.`, `Build <b>one immutable artifact</b> (container image) per commit and store it in a registry; promote the same artifact through environments.`, `<b>CD</b>: automatically deploy to staging, run integration/end-to-end tests, then to production in stages (one box → one AZ → one region → everywhere) with <b>bake time</b> and automated health checks.`, `<b>Automated rollback</b> when metrics regress; feature flags to decouple deploy from release.`, `Measure with <b>DORA metrics</b>: deployment frequency, lead time for changes, change failure rate, time to restore.`],
    diagram:{title:'A delivery pipeline', w:820, h:230, alt:'A commit triggers CI build and tests, an image is pushed to a registry, deployed to staging, then progressively to production with automated checks.',
      nodes:[{id:'dev', type:'client', label:'Commit / PR', x:70, y:115}, {id:'ci', type:'service', label:'CI', sub:'build · test · scan', x:220, y:115, w:130}, {id:'reg', type:'db', label:'Image registry', sub:'web@sha256:…', x:390, y:115, w:140}, {id:'stg', type:'service', label:'Staging', sub:'e2e tests', x:560, y:50, w:120}, {id:'prod', type:'lb', label:'Production', sub:'1 box → AZ → region', x:720, y:115, w:150}, {id:'mon', type:'ext', label:'Metrics / SLOs', x:560, y:190, w:140}],
      edges:[{from:'dev', to:'ci'}, {from:'ci', to:'reg'}, {from:'reg', to:'stg'}, {from:'stg', to:'prod'}, {from:'prod', to:'mon'}, {from:'mon', to:'prod', dashed:true}],
      steps:[
        {note:'A developer pushes a small change. CI builds and runs tests and scans in minutes.', flow:[['dev', 'ci', 'push']]},
        {note:'One immutable image, tagged with the commit SHA, goes to the registry.', flow:[['ci', 'reg', 'image']]},
        {note:'The same image deploys to staging; end-to-end tests pass.', flow:[['reg', 'stg', 'deploy']]},
        {note:'Production rollout in waves with bake time. Metrics are compared against baselines at each step; a regression triggers automatic rollback.', flow:[['stg', 'prod', 'wave 1'], ['prod', 'mon', 'SLIs'], ['mon', 'prod', 'OK → next wave']]}
      ]},
    deep:`<p><b>DORA research</b> (Accelerate, State of DevOps reports) found that elite performers deploy on demand with short lead times <i>and</i> have lower change-failure rates and faster recovery. Speed and stability go together when batches are small and automation is strong.</p><p><b>Pipeline hygiene:</b> keep CI fast (parallelise, cache, split slow suites), make flaky tests a top-priority bug, run DB migrations as separate backward-compatible steps, sign artifacts and keep provenance (SLSA), and protect the pipeline itself: it can deploy to production, so it is a high-value target.</p><p><b>Trunk-based development</b> (short-lived branches, feature flags for incomplete work) avoids long-lived branch merge pain and pairs naturally with CD.</p>`
  },
  tradeoffs:{use:[`Any team shipping software frequently`, `Small batches with automated tests and staged rollouts`], avoid:[`Manual deploy steps from wiki pages`, `Rebuilding artifacts per environment`, `Long release trains that batch hundreds of changes`], alt:[`Scheduled releases for app-store mobile apps (still with CI and staged rollouts)`, `GitOps (desired state in git, reconciled by an agent like Argo CD)`]},
  real:[
    {co:'DORA / Accelerate', tier:'confirmed', text:'Research by Forsgren, Humble and Kim identified four key delivery metrics (deployment frequency, lead time, change failure rate, time to restore) and showed high performers excel at both speed and stability.', src:'Forsgren, Humble & Kim, Accelerate (2018); DORA State of DevOps reports'},
    {co:'Amazon', tier:'confirmed', text:'Amazon describes pipelines that deploy to production automatically in waves, from one box to one AZ to one region, with bake times, automated monitors and automatic rollback.', src:'Clare Liguori, “Automating safe, hands-off deployments”, Amazon Builders’ Library'},
    {co:'Typical startup pipeline', tier:'educational', text:'GitHub Actions builds and tests each PR, pushes an image to a registry, Argo CD syncs staging, and a canary to production promotes automatically if error rate and latency hold.', src:'Simplified educational design'}
  ],
  mistakes:[`Slow, flaky CI that people learn to ignore`, `Migrations bundled into app deploys that can’t be rolled back`, `Manual “click-ops” production steps`],
  interview:[`Describe build once → staged automatic rollout → automated rollback; mention DORA metrics`],
  tryit:{note:'CI or CD?', mount:host => sortGame(host, [
    {t:'Run unit tests on every pull request', c:'ci', why:'Integration checks on each change.'},
    {t:'Deploy to one production box, bake 30 minutes, then one AZ', c:'cd', why:'Progressive delivery.'},
    {t:'Static analysis and dependency vulnerability scan', c:'ci', why:'Checks during integration.'},
    {t:'Automatic rollback when error rate rises after deploy', c:'cd', why:'A delivery safeguard.'},
    {t:'Build a container image tagged with the commit SHA', c:'ci', why:'Produces the artifact.'},
    {t:'Promote the same image from staging to production', c:'cd', why:'Delivery of the same artifact.'}
  ], [{id:'ci', label:'Continuous integration'}, {id:'cd', label:'Continuous delivery/deployment'}])},
  sources:[`Forsgren, Humble & Kim, Accelerate (2018)`, `Humble & Farley, Continuous Delivery (2010)`, `Amazon Builders’ Library — safe deployments`]
},
{
  id:'deploy-strategies', title:'Rolling, blue-green and canary deployments', minutes:11, tags:['rolling','blue-green','canary','rollback','progressive delivery'],
  summary:'Rolling updates replace instances gradually; blue-green switches all traffic between two full environments; canaries expose a small slice first and compare metrics. They trade blast radius, rollback speed and extra capacity.',
  problem:`<p>A new release of the UPI-payments service has a bug that fails 20% of payments, which tests didn’t catch. How many users are hurt before anyone notices, and how fast can you undo it? That depends almost entirely on <i>how</i> you deployed.</p>`,
  intuition:`Introducing a new recipe in a restaurant chain. Change kitchens one by one (rolling). Build a second kitchen, switch all orders to it and keep the old one ready (blue-green). Or serve the new dish to a few tables first and watch their faces (canary).`,
  how:{
    steps:[`<b>Rolling</b>: replace instances in batches (maxSurge/maxUnavailable). Little extra capacity, but old and new run together and rollback is another rolling update.`, `<b>Blue-green</b>: deploy to an idle identical environment, test it, switch the router; rollback is switching back. Needs 2× capacity during the switch, and switches 100% of users at once.`, `<b>Canary</b>: send a small percentage (1–5%) to the new version, compare its metrics with the baseline automatically, then increase in steps. Smallest blast radius, slower full rollout.`, `All three need <b>backward-compatible</b> data and API changes, because two versions run at the same time (even blue-green during the switch).`, `Automate the decision: health checks, SLO metrics, statistical canary analysis, automatic rollback.`],
    mount:host => deploySim(host),
    deep:`<p><b>Canary analysis:</b> compare the canary cohort with a baseline cohort of the same size started at the same time (not with the old fleet, which has warm caches and different uptime). Netflix’s Kayenta runs statistical tests on many metrics and scores the canary.</p><p><b>Shadow / dark launches:</b> send a copy of real traffic to the new version without returning its responses, which catches crashes and performance regressions with zero user impact (beware side-effects such as writes and emails).</p><p><b>Mobile clients:</b> you can’t roll back an installed app, so use staged rollouts in app stores, server-driven feature flags and API versioning.</p>`
  },
  tradeoffs:{use:[`Canary for high-traffic, high-risk services with good metrics`, `Blue-green when you need instant, whole-environment rollback and can afford 2× briefly`, `Rolling as a simple default for stateless services`], avoid:[`Blue-green for a bad release without pre-switch testing (100% blast radius)`, `Canaries on tiny traffic where metrics are statistically meaningless`], alt:[`Feature flags (release without deploying)`, `Shadow traffic`, `Cell-by-cell deployment`]},
  real:[
    {co:'Netflix — Spinnaker & Kayenta', tier:'confirmed', text:'Netflix and Google released Kayenta (2018) for automated canary analysis within Spinnaker, scoring canary metrics against a baseline before promotion.', src:'Netflix Tech Blog / Google Cloud blog, “Automated Canary Analysis at Netflix with Kayenta” (2018)'},
    {co:'Kubernetes', tier:'confirmed', text:'Deployments use rolling updates by default, controlled by maxSurge and maxUnavailable; tools such as Argo Rollouts and Flagger add canary and blue-green strategies with metric analysis.', src:'Kubernetes documentation; Argo Rollouts and Flagger documentation'},
    {co:'Payment service release', tier:'educational', text:'Canary 1% of UPI transactions per bank for 15 minutes, compare success rates per bank against baseline, then 10% → 50% → 100% with automatic rollback.', src:'Simplified educational design'}
  ],
  mistakes:[`Comparing canary metrics with the whole old fleet rather than a matched baseline`, `Incompatible DB changes that break the old version during rollout`, `Manual “looks fine to me” promotion`],
  interview:[`Pick a strategy and justify it by blast radius, rollback time and capacity; mention automated analysis and backward compatibility`],
  tryit:{note:'Switch strategies above with the bug on, then turn off automated analysis and compare the failed-request counts.', quiz:[{q:'A bad release fails 20% of requests. Which strategy limits the damage most if detection takes 2 minutes?', options:['Blue-green', 'Rolling', 'Canary at 5%', 'Big-bang redeploy'], answer:2, why:'Only 5% of traffic is exposed while it is detected.'}], quizId:'obs-l6'},
  sources:[`Kayenta / Spinnaker documentation`, `Kubernetes Deployment documentation`, `Fowler, BlueGreenDeployment (2010)`, `Sato, CanaryRelease (2014)`]
},
{
  id:'infrastructure-as-code', title:'Infrastructure as code', minutes:9, tags:['IaC','Terraform','CloudFormation','drift','GitOps','state'],
  summary:'Describe infrastructure in versioned code, review it like code, and let a tool compute and apply the difference between desired and actual state. This gives reproducible environments, fast recovery and an audit trail.',
  problem:`<p>Production was built by hand over three years through the cloud console. Nobody knows exactly which security-group rules exist or why. Creating a second region for DR would take weeks of guesswork, and last month someone changed a load-balancer setting by hand that broke health checks, with no record of who or when.</p>`,
  intuition:`An architect’s blueprint versus building by memory. With a blueprint you can build the same house again in another city, review changes before the walls go up, and notice when someone has knocked out a wall that should be there.`,
  how:{
    steps:[`Write <b>declarative</b> definitions (Terraform/OpenTofu, CloudFormation, Pulumi, Crossplane) of networks, instances, databases, IAM and DNS.`, `<b>Plan</b>: the tool compares code with recorded state and the real cloud, and shows what it will add, change and destroy.`, `<b>Review</b> the plan in a pull request; policy checks (no public buckets, required tags) run automatically.`, `<b>Apply</b> from CI with locked, remote state, not from laptops.`, `<b>Detect drift</b> regularly; fix by changing code, not by more console clicks. Use modules for repeatable patterns (a “standard service”).`],
    mount:host => iacDemo(host),
    html:h.code('hcl', `resource "aws_instance" "web" {
  count         = 3
  ami           = data.aws_ami.app.id
  instance_type = "m6i.large"
  subnet_id     = element(module.vpc.private_subnets, count.index)  # spread across AZs
  tags = { service = "web", owner = "team-checkout", env = "prod" }
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration { status = "Enabled" }
}`, 'main.tf'),
    deep:`<p><b>State</b> maps code resources to real IDs. Store it remotely with locking (e.g. object storage + a lock table) so two applies can’t race, and protect it, because it can contain sensitive values.</p><p><b>Blast radius:</b> split infrastructure into small stacks (network, data, per-service) so one plan can’t accidentally destroy everything; require extra approval for destructive changes; use <code>prevent_destroy</code> on databases.</p><p><b>GitOps</b> applies the same idea continuously: an agent (Argo CD, Flux) watches a git repo and reconciles the cluster to it, reverting drift automatically.</p>`
  },
  tradeoffs:{use:[`All production infrastructure, especially anything you may need to rebuild (DR, new regions)`], avoid:[`Manual console changes in production`, `One giant state file for everything`], alt:[`Managed PaaS where the platform owns most infrastructure`, `Imperative scripts (harder to diff and review)`]},
  real:[
    {co:'Terraform / OpenTofu', tier:'confirmed', text:'HashiCorp’s Terraform (2014) popularised declarative, multi-cloud infrastructure with plan/apply and state; OpenTofu is a Linux Foundation fork created after Terraform’s 2023 licence change.', src:'Terraform and OpenTofu documentation'},
    {co:'AWS CloudFormation', tier:'confirmed', text:'CloudFormation provisions AWS resources from templates as stacks, with change sets to preview changes and drift detection to find manual modifications.', src:'AWS CloudFormation documentation'},
    {co:'DR region from code', tier:'educational', text:'With networking, databases and services defined as modules, standing up a recovery region is applying the same code with different variables, measured in hours rather than weeks.', src:'Simplified educational design'}
  ],
  mistakes:[`Applying from laptops with local state`, `Secrets hard-coded in IaC files`, `Ignoring plan output that says “destroy”`],
  interview:[`Mention IaC for reproducibility and DR; plan in PRs, apply from CI, detect drift`],
  tryit:{note:'Change the code above, run apply, then simulate a console edit and read the drift plan. Then:', quiz:[{q:'What does “drift” mean in IaC?', options:['Clock skew', 'Real infrastructure no longer matching the code/state', 'A slow apply', 'Version upgrade'], answer:1, why:'Usually caused by manual changes.'}], quizId:'obs-l7'},
  sources:[`Terraform/OpenTofu docs`, `AWS CloudFormation docs`, `Morris, Infrastructure as Code (2nd ed., 2020)`]
},
{
  id:'zero-downtime-migrations', title:'Zero-downtime database migrations', minutes:11, tags:['schema migration','expand-contract','backfill','dual write','online DDL'],
  summary:'Change schemas without downtime with expand → migrate → contract: add new structures compatibly, deploy code that handles both, backfill in batches, switch reads, and only then remove the old structures.',
  problem:`<p>You want to split <code>users.name</code> into <code>first_name</code> and <code>last_name</code> on a 200-million-row table. Running <code>ALTER TABLE … RENAME</code> and deploying new code at the same moment means a period where old pods query a column that no longer exists. A blocking ALTER on a huge table can also lock writes for hours.</p>`,
  intuition:`Replacing a bridge while traffic keeps flowing. You build the new bridge next to the old one, open it while the old one still works, gradually move traffic, and only demolish the old bridge when nobody uses it.`,
  how:{
    stepper:{title:'Expand → migrate → contract (rename a column)', items:[
      {title:'1. Expand schema', tag:'additive', text:'Add <code>first_name</code>, <code>last_name</code> as nullable columns. Old code ignores them. Use online DDL (Postgres: adding a nullable column is metadata-only; MySQL: gh-ost / pt-online-schema-change for big tables).'},
      {title:'2. Dual write', tag:'app v2', text:'Deploy code that writes both <code>name</code> and the new columns, still reading <code>name</code>. Old and new pods can run together safely.'},
      {title:'3. Backfill', tag:'batches', text:'Copy existing rows in small batches (e.g. 5,000 rows, throttled on replica lag), idempotently, so it can be paused and resumed.'},
      {title:'4. Verify', tag:'compare', text:'Check that counts and sampled values match; optionally read both and compare in shadow mode.'},
      {title:'5. Switch reads', tag:'app v3', text:'Deploy code that reads the new columns (behind a flag for quick rollback), still writing both.'},
      {title:'6. Stop old writes', tag:'app v4', text:'Stop writing <code>name</code> once v3 is stable and no old version is running.'},
      {title:'7. Contract', tag:'cleanup', text:'Drop <code>name</code> in a later release, after a safety period, with a fresh backup.'}]},
    deep:`<p><b>Locks:</b> some DDL takes strong locks (e.g. adding a column with a volatile default on old Postgres versions, changing a column type, adding a non-concurrent index). Use <code>CREATE INDEX CONCURRENTLY</code>, add constraints as <code>NOT VALID</code> then <code>VALIDATE</code>, set <code>lock_timeout</code> so a migration fails fast instead of queueing behind a long transaction and blocking everyone.</p><p><b>Big moves between stores</b> (e.g. a table to a new service or database) follow the same pattern at a larger scale: dual write (or CDC), backfill, compare reads (dark reads), switch reads, stop old writes, retire. Stripe described doing this for subscription data across billions of records.</p><p><b>Migrations in CI/CD:</b> run them as separate, backward-compatible pipeline steps, never as an implicit side-effect of app start-up across 50 pods.</p>`
  },
  tradeoffs:{use:[`Any schema change on a live system with rolling deploys`, `Data moves between tables, databases or services`], avoid:[`Destructive changes (drop/rename) in the same release as the code change`, `Huge single-transaction backfills`], alt:[`Scheduled maintenance windows (simpler, but downtime)`, `New table + view for complex reshapes`]},
  real:[
    {co:'GitHub gh-ost', tier:'confirmed', text:'GitHub built gh-ost, a triggerless online schema migration tool for MySQL that copies the table and tails the binlog, so large migrations can be throttled and paused without locking production.', src:'GitHub Engineering, “gh-ost: GitHub’s online schema migration tool for MySQL” (2016)'},
    {co:'Stripe', tier:'confirmed', text:'Stripe described a four-step online migration pattern (dual writing, changing reads, changing writes, removing old data) to move live data without downtime.', src:'Stripe Engineering, “Online migrations at scale” (2017)'},
    {co:'Postgres', tier:'confirmed', text:'PostgreSQL supports CREATE INDEX CONCURRENTLY and NOT VALID constraints so indexes and constraints can be added without blocking writes for long periods.', src:'PostgreSQL documentation'}
  ],
  mistakes:[`Renaming or dropping columns while old code still runs`, `Backfills that saturate the primary and spike replica lag`, `No lock timeout, so a migration waits behind a long query and blocks all writes`],
  interview:[`Describe expand/contract with dual writes and backfill when a design needs a schema change`],
  tryit:{note:'Order the steps for safely renaming a column:', mount:host => orderGame(host, ['Add the new nullable column', 'Deploy code that writes both columns', 'Backfill old rows in small batches', 'Verify old and new values match', 'Deploy code that reads the new column', 'Stop writing the old column', 'Drop the old column in a later release'])},
  sources:[`GitHub gh-ost (2016)`, `Stripe, Online migrations at scale (2017)`, `PostgreSQL docs`, `Sadalage & Ambler, Refactoring Databases (2006)`]
},
{
  id:'finops', title:'FinOps and cloud cost', minutes:10, tags:['FinOps','cost','reserved','spot','egress','unit economics'],
  summary:'Cloud cost is an engineering metric. Measure cost per unit of business (per order, per stream-hour), commit to steady baselines, use spot for interruptible work, right-size, and watch data transfer, storage and log bills.',
  problem:`<p>The cloud bill doubled in six months while traffic grew 30%. Nobody owns it: there are idle staging clusters running all weekend, oversized databases “just in case”, terabytes of debug logs, and cross-AZ traffic nobody knew was billed. Finance asks engineering why. Engineering asks finance which service.</p>`,
  intuition:`An electricity bill for a big joint family. Until each room has its own meter (cost allocation), nobody turns off the AC. Once you see “AC in room 3 = ₹4,000”, behaviour changes. Then you buy a cheaper monthly plan for the base load (commitments) and use cheap off-peak power for the washing machine (spot).`,
  how:{
    steps:[`<b>Visibility</b>: tag every resource with owner/service/env; allocate shared costs; show each team its bill.`, `<b>Unit economics</b>: cost per order, per 1,000 requests, per streaming hour, per tenant. Growth is fine if unit cost falls.`, `<b>Rate optimisation</b>: commit (reserved instances, savings plans) for steady baseline; spot/preemptible for stateless, interruptible, batch work.`, `<b>Usage optimisation</b>: right-size, autoscale, schedule non-prod off at night, delete orphans (unattached disks, old snapshots), set log/metric retention, use storage tiers.`, `<b>Architecture</b>: cut data transfer (cross-AZ chatter, internet egress via CDN), cache, compress, and choose managed vs self-run deliberately.`],
    mount:host => finopsCalc(host),
    deep:`<p><b>Hidden costs:</b> cross-AZ data transfer (per GB, both directions on some clouds), NAT gateway processing, load balancer capacity units, observability ingest (often a top-5 line item), managed-service request fees, and idle provisioned throughput (IOPS, DynamoDB capacity, Kafka brokers).</p><p><b>Spot safely:</b> diversify instance types and AZs, handle the interruption notice (drain, checkpoint), keep a baseline on on-demand or committed capacity, and never put stateful single-copy data on spot.</p><p><b>FinOps practice:</b> the FinOps Foundation describes three iterative phases, Inform → Optimise → Operate, with shared responsibility between engineering, finance and product.</p>`
  },
  tradeoffs:{use:[`Commitments for predictable baselines`, `Spot for stateless, fault-tolerant and batch workloads`, `Cost per unit as a tracked engineering metric`], avoid:[`Over-committing to capacity you may not need next year`, `Spot for single-copy stateful services`, `Optimising pennies while egress and logs cost lakhs`], alt:[`Owned/colocated hardware for very steady, large workloads (with its own ops cost)`, `Serverless for spiky low-volume work`]},
  real:[
    {co:'FinOps Foundation', tier:'confirmed', text:'A Linux Foundation project defining FinOps practices and the Inform, Optimise and Operate phases for managing cloud spend collaboratively.', src:'FinOps Foundation — FinOps Framework'},
    {co:'AWS pricing models', tier:'confirmed', text:'AWS advertises Savings Plans at up to 72% off on-demand and Spot Instances at up to 90% off, with Spot capacity reclaimable at two minutes’ notice.', src:'AWS Savings Plans and EC2 Spot documentation/pricing pages'},
    {co:'37signals cloud exit', tier:'confirmed', text:'37signals (Basecamp, HEY) publicly described moving its steady workloads from public cloud to owned hardware, projecting millions of dollars in savings over five years. It is a reminder that the right answer depends on workload shape and team skills.', src:'David Heinemeier Hansson / 37signals blog posts (2022–2023)'}
  ],
  mistakes:[`Untagged resources with no owner`, `Debug-level logs at full retention in production`, `Staging environments running 24×7`],
  interview:[`Mention cost per unit, commitments + spot, and egress/caching when asked to cost-optimise a design`],
  tryit:{note:'Try the calculator above with a big daily peak. Then classify each saving:', mount:host => sortGame(host, [
    {t:'Buy a 1-year savings plan for the always-on baseline', c:'rate', why:'Same usage, lower price.'},
    {t:'Shut down staging clusters at night and weekends', c:'use', why:'Use less.'},
    {t:'Serve images through a CDN to cut origin egress', c:'arch', why:'Architecture change.'},
    {t:'Run video transcoding workers on spot instances', c:'rate', why:'Cheaper capacity for interruptible work.'},
    {t:'Downsize a database running at 8% CPU', c:'use', why:'Right-sizing.'},
    {t:'Keep chatty services in the same AZ as their database', c:'arch', why:'Avoid cross-AZ transfer.'}
  ], [{id:'rate', label:'Rate (pay less per unit)'}, {id:'use', label:'Usage (use less)'}, {id:'arch', label:'Architecture'}])},
  sources:[`FinOps Foundation Framework`, `AWS Well-Architected Cost Optimization Pillar`, `AWS Savings Plans / Spot pricing pages`]
}
];

SDA.register({
  kind:'module', id:'observability', order:11, level:'advanced', icon:'🔭', title:'Observability & Ops',
  summary:'Logs, metrics and traces with OpenTelemetry; golden signals, RED and USE; SLO burn-rate alerting and on-call; incident response and blameless postmortems; CI/CD; rolling, blue-green and canary deploys; infrastructure as code; zero-downtime migrations; FinOps.',
  outcomes:['Instrument a service with correlated logs, metrics and traces', 'Pick the right signals (golden/RED/USE) and alert on SLO burn rate without alert fatigue', 'Run an incident and write a blameless postmortem', 'Design a CI/CD pipeline with safe progressive delivery and automated rollback', 'Change schemas and infrastructure safely and reason about cloud cost per unit'],
  lessons,
  quiz:[
    {q:'Which signal best shows WHERE time went in one slow request across services?', options:['A CPU metric', 'A distributed trace', 'An access log on the gateway', 'A dashboard average'], answer:1, why:'Spans show per-service timing.'},
    {q:'Why shouldn’t user_id be a metric label?', options:['It is private', 'It creates huge cardinality: one time series per user', 'Metrics can’t hold strings', 'It slows logging'], answer:1, why:'Put it in logs or trace attributes.'},
    {q:'The four golden signals are…', options:['CPU, memory, disk, network', 'Latency, traffic, errors, saturation', 'Rate, errors, duration, uptime', 'p50, p90, p99, max'], answer:1, why:'From Google’s SRE book.'},
    {q:'USE stands for…', options:['Users, Sessions, Errors', 'Utilisation, Saturation, Errors', 'Uptime, Speed, Efficiency', 'Usage, Spend, Effort'], answer:1, why:'Brendan Gregg’s method for resources.'},
    {q:'A 99.9% SLO and a 10% error rate means a burn rate of…', options:['10', '100', '1,000', '0.1'], answer:1, why:'10% ÷ 0.1%.'},
    {q:'What should happen first in an incident?', options:['Find the root cause', 'Mitigate user impact (rollback, failover, kill switch)', 'Write the postmortem', 'Assign blame'], answer:1, why:'Stop the bleeding first.'},
    {q:'Which deployment exposes the fewest users to a bad release before detection?', options:['Blue-green', 'Rolling', 'Canary', 'All at once'], answer:2, why:'Small cohort first.'},
    {q:'DORA’s four key metrics include…', options:['Lines of code', 'Deployment frequency and change failure rate', 'Number of meetings', 'Test count'], answer:1, why:'Plus lead time and time to restore.'},
    {q:'To rename a column with zero downtime you should…', options:['Rename and deploy simultaneously', 'Expand (add new), dual-write, backfill, switch reads, then contract', 'Take the site down', 'Drop and recreate the table'], answer:1, why:'Old and new code must both work during rollout.'},
    {q:'Infrastructure drift is…', options:['Real infra diverging from code/state', 'A Terraform bug', 'Clock skew', 'A cost spike'], answer:0, why:'Usually manual changes.'},
    {q:'Best fit for spot instances:', options:['A single-node primary database', 'Stateless video transcoding workers', 'The only Kafka broker', 'A payment ledger'], answer:1, why:'Interruptible, retryable work.'},
    {type:'scenario', q:'Checkout p99 latency doubled after 8 PM yesterday and nobody knows why. Walk through how you’d investigate with observability tools.', answer:'<ol><li>Check the <b>RED dashboard</b> and SLO burn for checkout: is it all requests or a subset (endpoint, region, app version, tenant)? Look for deploy/config markers around 8 PM.</li><li>Use <b>exemplars / tail-sampled traces</b> of slow requests; find the span on the critical path (e.g. a payment-gateway call or a DB query).</li><li>Drill into that dependency’s <b>USE</b> metrics (pool saturation, DB CPU/locks, replica lag) and its own RED metrics.</li><li>Read <b>logs filtered by trace_id</b> for the slow spans (errors, retries, query plans).</li><li>Mitigate (rollback, flag off, scale pool), then fix the cause (missing index, N+1, retry storm) and add an alert or test so it can’t recur silently.</li></ol>'},
    {type:'scenario', q:'Design the release process for a payments service that deploys 10 times a day.', answer:'<ul><li><b>CI</b>: fast tests, contract tests with dependents, security scans; one signed image per commit.</li><li><b>CD</b>: staging with e2e tests → production canary (1% of traffic, matched baseline) per region, automated canary analysis on payment success rate per bank/PSP, latency and errors → 10% → 50% → 100% with bake times; automatic rollback.</li><li><b>Data</b>: expand/contract migrations as separate steps; idempotent APIs so retries during rollout are safe.</li><li><b>Flags</b> for risky features with kill switches; deploy freezes during peak events (salary day, sales).</li><li>Track DORA metrics and SLO burn per release.</li></ul>'}
  ],
  cheatsheet:[
    {h:'🔭 Signals', items:['Metrics: cheap, aggregated, for alerts and dashboards', 'Logs: structured JSON with trace_id', 'Traces: spans, critical path, W3C traceparent', 'OpenTelemetry SDK + Collector', 'Histograms for percentiles; watch cardinality', 'Head vs tail sampling']},
    {h:'🩺 What to measure', items:['Golden: latency, traffic, errors, saturation', 'RED per service: rate, errors, duration', 'USE per resource: utilisation, saturation, errors', 'Business signals: orders/min, payment success']},
    {h:'🚨 Alerting & incidents', items:['Page only urgent + actionable + user-visible', 'Burn rate = error rate ÷ (1 − SLO)', 'Page 14.4× (1h & 5m), 6× (6h & 30m); ticket 1× (3d)', 'IC + ops + comms + scribe; mitigate first', 'Blameless postmortem with owned actions']},
    {h:'🚀 Delivery', items:['Build once, promote the same artifact', 'Waves: one box → AZ → region, bake time', 'Rolling / blue-green / canary trade-offs', 'Automated canary analysis + rollback', 'DORA: frequency, lead time, CFR, time to restore']},
    {h:'🧱 Infra & data changes', items:['IaC: plan in PR, apply from CI, remote locked state', 'Detect and fix drift in code', 'Expand → dual write → backfill → switch reads → contract', 'Online DDL, CONCURRENTLY, lock_timeout']},
    {h:'💸 FinOps', items:['Tag everything; cost per unit', 'Commit baseline; spot for interruptible', 'Right-size; schedule non-prod off', 'Watch egress, cross-AZ, logs, NAT', 'Inform → Optimise → Operate']}
  ],
  glossary:[
    {term:'Observability', def:'The ability to understand a system’s internal state from its external outputs (metrics, logs, traces).'},
    {term:'Metric', aka:['metrics', 'time series'], def:'A numeric measurement recorded over time, such as request rate or latency.'},
    {term:'Structured logging', aka:['structured logs'], def:'Writing logs as machine-parseable records (e.g. JSON) with consistent fields.'},
    {term:'Distributed tracing', aka:['trace', 'traces', 'tracing'], def:'Recording a request’s path through services as a tree of timed spans.'},
    {term:'Span (tracing)', aka:['trace span'], def:'One timed operation within a trace, with a parent, attributes and duration.'},
    {term:'Trace ID', aka:['trace_id', 'traceparent'], def:'An identifier shared by all spans and logs of one request, propagated across services.'},
    {term:'OpenTelemetry', aka:['OTel'], def:'A vendor-neutral CNCF standard and toolkit for generating and exporting traces, metrics and logs.'},
    {term:'Critical path', def:'The chain of operations that determines a request’s total duration.'},
    {term:'Tail sampling', aka:['head sampling'], def:'Deciding which traces to keep after they complete (tail) rather than at the start (head).'},
    {term:'Exemplar', aka:['exemplars'], def:'A sample trace ID attached to a metric data point, linking a spike to example requests.'},
    {term:'Histogram', aka:['histograms'], def:'A metric that counts observations into buckets, allowing percentiles to be computed.'},
    {term:'Golden signals', aka:['four golden signals'], def:'Latency, traffic, errors and saturation: the core signals for user-facing systems.'},
    {term:'RED method', def:'Rate, Errors and Duration metrics for every request-driven service.'},
    {term:'USE method', def:'Utilisation, Saturation and Errors checks for every resource.'},
    {term:'Saturation', def:'How full a resource is, often measured as queued work or pool usage.'},
    {term:'Alert fatigue', def:'Desensitisation from too many, often non-actionable, alerts.'},
    {term:'Runbook', aka:['runbooks', 'playbook'], def:'Documented steps for diagnosing and handling a specific alert or task.'},
    {term:'On-call', def:'A rotation where engineers are responsible for responding to production alerts.'},
    {term:'Incident commander', aka:['IC'], def:'The person coordinating an incident response, delegating work and decisions.'},
    {term:'Postmortem', aka:['postmortems', 'post-incident review'], def:'A written analysis of an incident: timeline, impact, contributing factors and actions.'},
    {term:'Blameless postmortem', aka:['blameless'], def:'A postmortem focused on systemic causes rather than individual fault.'},
    {term:'Continuous integration', aka:['CI'], def:'Merging small changes frequently with automated builds and tests on each change.'},
    {term:'Continuous delivery', aka:['CD', 'continuous deployment'], def:'Keeping every build releasable and deploying it through automated stages.'},
    {term:'DORA metrics', def:'Deployment frequency, lead time for changes, change failure rate and time to restore service.'},
    {term:'Trunk-based development', def:'Developers integrate small changes into the main branch frequently, using flags for incomplete work.'},
    {term:'Bake time', def:'A waiting period after deploying to a stage, while metrics are watched before proceeding.'},
    {term:'Rolling update', aka:['rolling deployment'], def:'Replacing instances of an application gradually in batches.'},
    {term:'Blue-green deployment', aka:['blue-green'], def:'Switching traffic between two identical environments, one running the new version.'},
    {term:'Canary release', aka:['canary', 'canary deployment'], def:'Releasing to a small subset of traffic first and comparing its metrics before rolling out further.'},
    {term:'Automated canary analysis', aka:['Kayenta'], def:'Statistically comparing canary and baseline metrics to decide whether to promote.'},
    {term:'Dark launch', aka:['shadow launch'], def:'Running new code on real traffic without exposing its results to users.'},
    {term:'GitOps', def:'Managing deployments by declaring desired state in git and reconciling systems to it automatically.'},
    {term:'Infrastructure as code', aka:['IaC'], def:'Defining infrastructure in versioned, reviewable code applied by tools.'},
    {term:'Terraform', aka:['OpenTofu'], def:'A declarative infrastructure-as-code tool that plans and applies changes using a state file.'},
    {term:'Configuration drift', aka:['drift'], def:'Divergence between the real infrastructure and its code definition.'},
    {term:'Expand-contract migration', aka:['expand and contract', 'parallel change'], def:'A schema change done in compatible steps: add new, migrate, then remove old.'},
    {term:'Backfill', def:'Populating new columns or stores with existing data, usually in batches.'},
    {term:'Online schema change', aka:['online DDL', 'gh-ost'], def:'Altering a table’s schema without blocking reads and writes for long periods.'},
    {term:'FinOps', def:'The practice of managing cloud costs collaboratively across engineering, finance and product.'},
    {term:'Unit economics', aka:['cost per unit'], def:'Cost measured per business unit, such as per order or per stream-hour.'},
    {term:'Spot instances', aka:['spot instance', 'spot capacity', 'preemptible VMs'], def:'Discounted spare cloud capacity that the provider can reclaim at short notice.'},
    {term:'Savings plan', aka:['reserved instances', 'committed use discount'], def:'A discount in exchange for committing to a level of usage for one or three years.'},
    {term:'Egress', aka:['data transfer out'], def:'Data sent out of a cloud region or provider, typically billed per GB.'},
    {term:'Right-sizing', def:'Matching resource sizes to actual usage to avoid paying for idle capacity.'}
  ],
  sources:['Beyer et al., Site Reliability Engineering (2016) and The Site Reliability Workbook (2018)', 'Sigelman et al., Dapper (2010); OpenTelemetry and W3C Trace Context specs', 'Wilkie, The RED Method; Gregg, The USE Method', 'Allspaw, Blameless PostMortems (2012)', 'Forsgren, Humble & Kim, Accelerate (2018); Amazon Builders’ Library — safe deployments', 'Netflix/Google — Kayenta (2018); GitHub gh-ost (2016); Stripe, Online migrations at scale (2017)', 'Terraform/OpenTofu and CloudFormation docs; FinOps Foundation Framework; AWS pricing pages']
});
} catch(e){ console.error('[SDA] module observability', e); SDA.errors.push({id:'observability', error:e}); }
})();
