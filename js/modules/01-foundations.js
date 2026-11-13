
/* =====================================================================
   MODULE 1 — FOUNDATIONS
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, sv, esc, clamp, fmtNum, fmtDur, shuffle} = SDA.u; const ui = SDA.ui;

/* ---------- small interactive helpers used by several lessons ---------- */
function orderGame(host, items){
  let next = 0;
  const status = el('div', {class:'verdict warn', role:'status'});
  const pool = el('div', {class:'pill-row'}); const placed = el('ol', {class:'steps', style:{marginTop:'12px'}});
  const reset = () => {
    next = 0; placed.innerHTML = ''; pool.innerHTML = ''; status.className = 'verdict warn'; status.textContent = 'Click the steps in the right order, starting with step 1.';
    shuffle(items.map((t, i) => i)).forEach(i => {
      const b = ui.button(esc(items[i]), () => {
        if (i === next){ b.remove(); placed.append(el('li', null, items[i])); next++;
          if (next === items.length){ status.className = 'verdict ok'; status.textContent = '✓ Perfect order — this is the loop you will run in every design.'; }
          else status.textContent = `✓ Correct. Now pick step ${next + 1}.`;
        } else { b.classList.add('danger'); status.className = 'verdict bad'; status.textContent = `Not yet — that comes later. Which step is #${next + 1}?`; setTimeout(() => { b.classList.remove('danger'); status.className = 'verdict warn'; }, 900); }
      }, 'sm');
      pool.append(b);
    });
  };
  host.append(status, el('div', {style:{height:'10px'}}), pool, placed, el('div', {class:'row', style:{marginTop:'6px'}}, ui.button('↺ Shuffle again', reset, 'sm ghost')));
  reset();
}
function sortGame(host, items, cats){
  let score = 0, done = 0;
  const head = el('div', {class:'verdict warn', role:'status'}, `Classify each statement. 0/${items.length} answered.`);
  const grid = el('div', {class:'sortgame'});
  shuffle(items.slice()).forEach(it => {
    const row = el('div', {class:'sort-item'}, el('span', {style:{flex:'1', minWidth:'160px'}}, it.t));
    const btns = cats.map(c => ui.button(c.label, () => {
      const ok = c.id === it.c; done++; if (ok) score++;
      row.classList.add(ok ? 'right' : 'wrong'); btns.forEach(b => b.disabled = true);
      row.append(el('div', {class:'lab-hint', style:{width:'100%', color:'var(--text-2)'}}, (ok ? '✓ ' : '✗ ') + it.why));
      head.className = 'verdict ' + (done === items.length && score === items.length ? 'ok' : 'warn');
      head.textContent = done === items.length ? `Done: ${score}/${items.length} correct.` : `${score}/${done} correct so far · ${items.length - done} left.`;
    }, 'sm'));
    row.append(el('div', {class:'row'}, ...btns)); grid.append(row);
  });
  host.append(head, el('div', {style:{height:'12px'}}), grid);
}
function lineChart(host, o){
  const W = o.w || 640, H = o.h || 260, P = {l:58, r:18, t:18, b:42};
  const svg = sv('svg', {viewBox:`0 0 ${W} ${H}`, class:'mini-chart', role:'img'});
  const t = sv('title'); t.textContent = o.label || 'Chart'; svg.append(t);
  const X = x => P.l + (x - o.xMin) / (o.xMax - o.xMin) * (W - P.l - P.r);
  const Y = y => H - P.b - clamp(y, 0, o.yMax) / o.yMax * (H - P.t - P.b);
  (o.yTicks || []).forEach(v => { svg.append(sv('line', {class:'gridl', x1:P.l, x2:W - P.r, y1:Y(v), y2:Y(v)})); const tx = sv('text', {x:P.l - 8, y:Y(v) + 4, 'text-anchor':'end'}); tx.textContent = o.yFmt ? o.yFmt(v) : v; svg.append(tx); });
  (o.xTicks || []).forEach(v => { const tx = sv('text', {x:X(v), y:H - P.b + 18, 'text-anchor':'middle'}); tx.textContent = o.xFmt ? o.xFmt(v) : v; svg.append(tx); });
  svg.append(sv('line', {class:'axis', x1:P.l, x2:W - P.r, y1:H - P.b, y2:H - P.b}), sv('line', {class:'axis', x1:P.l, x2:P.l, y1:P.t, y2:H - P.b}));
  if (o.xLabel){ const tx = sv('text', {x:(W + P.l) / 2, y:H - 6, 'text-anchor':'middle'}); tx.textContent = o.xLabel; svg.append(tx); }
  if (o.yLabel){ const tx = sv('text', {x:14, y:(H - P.b + P.t) / 2, 'text-anchor':'middle', transform:`rotate(-90 14 ${(H - P.b + P.t) / 2})`}); tx.textContent = o.yLabel; svg.append(tx); }
  let d = ''; for (let k = 0; k <= 240; k++){ const x = o.xMin + (o.xMax - o.xMin) * k / 240; const y = o.fn(x); d += (k ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1); }
  const path = sv('path', {d, fill:'none', 'stroke-width':'2.6'}); path.style.stroke = o.color || 'var(--accent1)'; svg.append(path);
  const guide = sv('line', {class:'gridl'}); const dot = sv('circle', {r:6}); dot.style.fill = 'var(--accent2)'; dot.style.stroke = '#fff'; dot.style.strokeWidth = '2';
  const lab = sv('text', {'text-anchor':'start'}); lab.style.fill = 'var(--text)'; lab.style.fontWeight = '700';
  svg.append(guide, dot, lab);
  const box = el('div', {class:'chart-box'}); box.append(svg); host.append(box);
  return { set(x, text){ const y = o.fn(x); const cx = X(x), cy = Y(y); dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); guide.setAttribute('x1', cx); guide.setAttribute('x2', cx); guide.setAttribute('y1', H - P.b); guide.setAttribute('y2', cy); lab.textContent = text; const right = cx > W * .62; lab.setAttribute('text-anchor', right ? 'end' : 'start'); lab.setAttribute('x', right ? cx - 10 : cx + 10); lab.setAttribute('y', Math.max(P.t + 12, cy - 10)); } };
}
SDA.m1helpers = {orderGame, sortGame, lineChart};

/* ---------- lesson-specific interactive widgets ---------- */
function statelessDemo(host, api){
  let mode = 'memory', rr = 0, sessionOn = null, loggedIn = false, busy = false;
  const log = el('div', {class:'lab-out', style:{maxHeight:'150px', borderRadius:'10px', border:'1px solid var(--border)'}, 'aria-live':'polite'});
  const write = (txt, cls) => { log.prepend(el('div', {class:'ln ' + (cls || '')}, txt)); };
  const holder = el('div');
  const sel = ui.select({label:'Where do sessions live?', value:'memory', options:[['memory', 'In each server’s memory (stateful)'], ['redis', 'In a shared Redis store (stateless servers)']], onChange:v => { mode = v; d.setHidden('r', v !== 'redis'); sessionOn = null; loggedIn = false; d.setSub('s1', ''); d.setSub('s2', ''); write(`— switched: sessions now ${v === 'redis' ? 'in shared Redis' : 'in server memory'}; everyone logged out —`, 'sys'); }});
  const d = new api.Diagram(holder, {title:'Stateful vs stateless servers', w:720, h:270, alt:'You connect via a load balancer to server A or B; sessions live either in server memory or in shared Redis.',
    nodes:[{id:'c', type:'client', label:'You', x:70, y:135}, {id:'lb', type:'lb', label:'Load balancer', sub:'round robin', x:225, y:135}, {id:'s1', type:'service', label:'Server A', x:410, y:65}, {id:'s2', type:'service', label:'Server B', x:410, y:205}, {id:'r', type:'cache', label:'Shared Redis', sub:'sessions', x:610, y:135, hidden:true}],
    edges:[{from:'c', to:'lb'}, {from:'lb', to:'s1'}, {from:'lb', to:'s2'}, {from:'s1', to:'r'}, {from:'s2', to:'r'}],
    caption:'Log in, then load your orders a few times. Watch which server answers.'});
  async function send(kind){
    if (busy) return; busy = true;
    const srv = rr++ % 2 === 0 ? 's1' : 's2'; const name = srv === 's1' ? 'A' : 'B';
    await d.flow([['c', 'lb', kind === 'login' ? 'POST /login' : 'GET /orders'], ['lb', srv]]);
    if (mode === 'redis') await d.flow([[srv, 'r', kind === 'login' ? 'SET' : 'GET'], ['r', srv]]);
    let ok;
    if (kind === 'login'){ loggedIn = true; sessionOn = mode === 'redis' ? 'r' : srv; ok = true; if (mode !== 'redis'){ d.setSub('s1', srv === 's1' ? '🔑 your session' : ''); d.setSub('s2', srv === 's2' ? '🔑 your session' : ''); } }
    else ok = loggedIn && (mode === 'redis' || sessionOn === srv);
    await d.flow([[srv, 'lb', ok ? '200' : '401'], ['lb', 'c']]);
    if (kind === 'login') write(`Server ${name}: logged in ✓ (session stored ${mode === 'redis' ? 'in Redis' : 'in server ' + name + '’s RAM'})`, 'ok');
    else if (ok) write(`Server ${name}: here are your orders ✓`, 'ok');
    else write(`Server ${name}: 401 — “who are you?” Your session lives on the other server.`, 'err');
    d.setCaption(ok ? `Server ${name} answered successfully.` : `<b>Broken:</b> server ${name} has never seen your session. This is why app servers should be <b>stateless</b>.`);
    busy = false;
  }
  host.append(el('div', {class:'ctl-grid'}, sel.el), holder, el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('🔑 Log in', () => send('login'), 'sm primary'), ui.button('📦 Load my orders', () => send('orders'), 'sm')), log);
}
function scaleCalc(host){
  const catalog = [['S · 2 vCPU', 2, 2000, 8], ['M · 8 vCPU', 8, 7500, 32], ['L · 32 vCPU', 32, 26000, 130], ['XL · 96 vCPU', 96, 60000, 420], ['XXL · 192 vCPU', 192, 90000, 900]];
  const out = el('div');
  const s = ui.slider({label:'Peak traffic to serve', min:2.7, max:5.4, step:.01, value:3.7, fmt:v => fmtNum(Math.pow(10, v)) + ' req/s', onInput:render});
  function render(){
    const target = Math.pow(10, s.value), head = 1.3;
    const v = catalog.find(c => c[2] >= target * head);
    const n = Math.max(2, Math.ceil(target * head / catalog[0][2]));
    const hCost = n * catalog[0][3] + 20;
    out.innerHTML = '';
    out.append(h2t(`<div class="grid c2" style="margin-top:14px">
      <div class="card"><h4 style="margin:0 0 6px">⬆️ Scale up (one bigger box)</h4>${v ? `<dl class="kv"><dt>Machine</dt><dd>${v[0]}</dd><dt>Capacity</dt><dd>${fmtNum(v[2])} req/s</dd><dt>Cost</dt><dd>₹${v[3]}/hour</dd><dt>If it dies</dt><dd style="color:var(--bad)">100% outage</dd><dt>Code change</dt><dd>none</dd></dl>` : `<div class="verdict bad">No single machine in this catalog can serve ${fmtNum(target)} req/s with headroom. You have hit the vertical ceiling.</div>`}</div>
      <div class="card"><h4 style="margin:0 0 6px">↔️ Scale out (many small boxes)</h4><dl class="kv"><dt>Machines</dt><dd>${n} × S + load balancer</dd><dt>Capacity</dt><dd>${fmtNum(n * catalog[0][2])} req/s</dd><dt>Cost</dt><dd>₹${hCost}/hour</dd><dt>If one dies</dt><dd style="color:var(--ok)">lose ${(100 / n).toFixed(n > 20 ? 1 : 0)}% capacity</dd><dt>Code change</dt><dd>stateless app, shared session store</dd></dl></div></div>
      <p class="lab-hint" style="margin-top:8px">Catalog numbers are <b>illustrative</b>. Capacity grows sub-linearly with machine size here because bigger boxes hit lock contention and memory bandwidth limits; cloud prices per vCPU are roughly linear. Both targets include 30% headroom.</p>`));
  }
  host.append(s.el, out); render();
}
function h2t(html){ const t = document.createElement('template'); t.innerHTML = html; return t.content; }
function queueCurve(host, api){
  const S = 10;
  const chart = lineChart(host, {label:'Average response time vs utilization for a single-server queue (service time 10 ms)', w:680, h:270, xMin:0, xMax:.99, yMax:400, xTicks:[0, .2, .4, .6, .8, .99], xFmt:v => Math.round(v * 100) + '%', yTicks:[0, 100, 200, 300, 400], yFmt:v => v + ' ms', xLabel:'Utilization ρ = arrival rate ÷ capacity', yLabel:'Avg time in system', fn:r => S / (1 - r)});
  const info = el('div', {class:'verdict ok', role:'status', style:{marginTop:'10px'}});
  const sl = ui.slider({label:'Utilization (how busy the server is)', min:0, max:.97, step:.01, value:.5, fmt:v => Math.round(v * 100) + '%', onInput:v => { sweeping = false; show(v); }});
  let sweeping = false, x = 0;
  function show(r){ const w = S / (1 - r); chart.set(r, `${Math.round(r * 100)}% → ${w.toFixed(0)} ms`); info.className = 'verdict ' + (r < .7 ? 'ok' : r < .85 ? 'warn' : 'bad'); info.textContent = r < .7 ? `Comfortable: ${w.toFixed(0)} ms average (10 ms of work + ${(w - S).toFixed(0)} ms waiting in line).` : r < .85 ? `Getting tight: requests now wait ${(w - S).toFixed(0)} ms in the queue for 10 ms of work.` : `Danger zone: ${w.toFixed(0)} ms average. Tiny traffic bumps now cause huge delays and timeouts.`; }
  const lp = api.loop(dt => { if (!sweeping){ lp.pause(); return; } x += dt * .18; if (x > .97) x = 0; sl.set(x); show(x); });
  lp.pause();
  host.append(sl.el, info, el('div', {class:'controls', style:{marginTop:'10px'}}, ui.button('▶ Sweep 0 → 97%', () => { sweeping = !sweeping; x = sl.value; if (sweeping) lp.resume(); }, 'sm')));
  show(.5);
}
function queueSim(host, api){
  const r = Math.random;
  const expo = rate => -Math.log(1 - r()) / rate;
  const MU = 100; let lambda = 70, servers = [], queue = [], now = 0, nextA = 0, lat = [], doneTimes = [], dropped = 0, total = 0, hist = [], acc = 0, speed = .25;
  const reset = () => { servers = Array.from({length:+cSel.value}, () => ({busy:false, end:0, arr:0})); queue = []; now = 0; nextA = expo(lambda); lat = []; doneTimes = []; dropped = 0; total = 0; hist = []; };
  const lS = ui.slider({label:'Arrival rate λ', min:10, max:380, step:5, value:70, fmt:v => v + ' req/s', onInput:v => { lambda = v; }});
  const cSel = ui.select({label:'Servers (each does 100 req/s, 10 ms avg)', value:'1', options:[['1', '1 server'], ['2', '2 servers'], ['3', '3 servers'], ['4', '4 servers']], onChange:reset});
  const spS = ui.select({label:'Simulation speed', value:'0.25', options:[['0.1', 'Slow-mo (0.1×)'], ['0.25', '0.25×'], ['1', 'Real time (1×)']], onChange:v => speed = +v});
  const cv = el('canvas', {height:440, style:{height:'220px'}, 'aria-label':'Animated queue: dots waiting in line for servers, plus latency history'});
  const box = el('div', {class:'chart-box', style:{marginTop:'12px'}}, cv);
  const met = ui.metrics(null, [{id:'rho', label:'Utilization', unit:'%', max:100, warn:70, bad:90, instant:true}, {id:'tp', label:'Throughput', unit:'req/s', instant:true}, {id:'avg', label:'Avg latency', unit:'ms', warn:30, bad:100, instant:true}, {id:'p99', label:'p99 latency', unit:'ms', warn:80, bad:300, instant:true}, {id:'q', label:'Queue length', instant:true, warn:10, bad:50}, {id:'drop', label:'Rejected (queue full)', instant:true, warn:1, bad:20}]);
  function sim(T){
    let guard = 0;
    while (guard++ < 20000){
      let nd = Infinity, si = -1; servers.forEach((s, i) => { if (s.busy && s.end < nd){ nd = s.end; si = i; } });
      const t = Math.min(nextA, nd); if (t > T) break; now = t;
      if (nd <= nextA){ const s = servers[si]; lat.push((now - s.arr) * 1000); if (lat.length > 800) lat.shift(); doneTimes.push(now); if (queue.length){ s.arr = queue.shift(); s.end = now + expo(MU); } else s.busy = false; }
      else { total++; const f = servers.find(s => !s.busy); if (f){ f.busy = true; f.arr = now; f.end = now + expo(MU); } else if (queue.length < 400) queue.push(now); else dropped++; nextA = now + expo(lambda); }
    }
    now = T;
  }
  function draw(){
    const W = box.clientWidth || 600; if (cv.width !== Math.round(W * 2)){ cv.width = Math.round(W * 2); } const g = cv.getContext('2d'); const H = 220;
    g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, W, H);
    const cs = getComputedStyle(document.documentElement); const A = cs.getPropertyValue('--accent1').trim(), B = cs.getPropertyValue('--accent2').trim(), T = cs.getPropertyValue('--muted').trim(), BAD = cs.getPropertyValue('--bad').trim(), BR = cs.getPropertyValue('--border-strong').trim();
    const qW = Math.min(W * .55, 360), sx = qW + 30;
    g.font = '11px ' + cs.getPropertyValue('--font-mono'); g.fillStyle = T; g.fillText('QUEUE (waiting)', 10, 16); g.fillText('SERVERS', sx, 16);
    const show = Math.min(queue.length, 40);
    for (let k = 0; k < show; k++){ const col = k % 10, row = Math.floor(k / 10); g.fillStyle = queue.length > 30 ? BAD : A; g.beginPath(); g.arc(qW - 14 - col * (qW - 30) / 10, 40 + row * 18, 6, 0, 7); g.fill(); }
    if (queue.length > 40){ g.fillStyle = BAD; g.fillText(`+${queue.length - 40} more`, 10, 122); }
    servers.forEach((s, i) => { const y = 28 + i * 24; g.strokeStyle = BR; g.lineWidth = 1.5; g.strokeRect(sx, y, 70, 18); if (s.busy){ g.fillStyle = B; g.fillRect(sx + 2, y + 2, 66, 14); } g.fillStyle = T; g.fillText(s.busy ? 'busy' : 'idle', sx + 78, y + 13); });
    const top = 140, ch = H - top - 8; const mx = Math.max(60, ...hist.map(x => x[1])); g.strokeStyle = BR; g.beginPath(); g.moveTo(10, top + ch); g.lineTo(W - 10, top + ch); g.stroke();
    g.fillStyle = T; g.fillText(`p99 latency history (max ${Math.round(mx)} ms)`, 10, top - 4);
    g.strokeStyle = B; g.lineWidth = 2; g.beginPath(); hist.forEach((p, k) => { const x = 10 + k * (W - 20) / 59, y = top + ch - p[1] / mx * ch; k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    g.strokeStyle = A; g.beginPath(); hist.forEach((p, k) => { const x = 10 + k * (W - 20) / 59, y = top + ch - p[0] / mx * ch; k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  }
  function pct(a, p){ if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
  const lp = api.loop(dt => {
    sim(now + dt * speed);
    while (doneTimes.length && doneTimes[0] < now - 1) doneTimes.shift();
    acc += dt;
    if (acc > .4){ acc = 0; const avg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0; const p99 = pct(lat, .99); hist.push([avg, p99]); if (hist.length > 60) hist.shift();
      met.set('rho', Math.min(100, lambda / (MU * servers.length) * 100)); met.set('tp', doneTimes.length); met.set('avg', avg); met.set('p99', p99); met.set('q', queue.length); met.set('drop', dropped); }
    draw();
  });
  reset();
  host.append(el('div', {class:'ctl-grid'}, lS.el, cSel.el, spS.el), box, el('div', {style:{height:'10px'}}), met.el, el('div', {class:'controls', style:{marginTop:'10px'}}, ui.button('↺ Reset simulation', reset, 'sm ghost'), el('span', {class:'lab-hint'}, 'Try: 1 server at 50 → 80 → 95 req/s. Then add a 2nd server at 95 req/s.')));
  if (api.reduced) host.append(el('p', {class:'lab-hint'}, 'Reduced motion is on: the queue still simulates, drawn without movement effects.'));
  lp.resume();
}
function budgetCalc(host){
  const out = el('div', {style:{marginTop:'14px'}});
  const slo = ui.select({label:'SLO (success target)', value:'99.9', options:[['99', '99%'], ['99.5', '99.5%'], ['99.9', '99.9%'], ['99.95', '99.95%'], ['99.99', '99.99%']], onChange:render});
  const win = ui.select({label:'Window', value:'30', options:[['7', '7 days'], ['28', '28 days'], ['30', '30 days']], onChange:render});
  const req = ui.slider({label:'Requests in the window', min:4, max:10, step:.1, value:8, fmt:v => fmtNum(Math.pow(10, v)), onInput:render});
  const used = ui.slider({label:'Budget already consumed', min:0, max:120, step:1, value:35, fmt:v => v + '%', onInput:render});
  const elapsed = ui.slider({label:'Days elapsed in window', min:1, max:30, step:1, value:12, fmt:v => v + ' d', onInput:render});
  const err = ui.slider({label:'Error rate right now (last hour)', min:0, max:3, step:.01, value:.2, fmt:v => v.toFixed(2) + '%', onInput:render});
  function render(){
    const S = +slo.value / 100, W = +win.value, el_ = Math.min(+elapsed.value, W), N = Math.pow(10, req.value), b = 1 - S;
    const budgetReq = N * b, budgetMin = W * 1440 * b, usedF = used.value / 100, burn = (err.value / 100) / b;
    const remainF = Math.max(0, 1 - usedF), hoursToEmpty = burn > 0 ? remainF * W * 24 / burn : Infinity, expected = el_ / W;
    let verdict, cls;
    if (usedF >= 1){ verdict = '🧊 Freeze: budget exhausted. Only reliability fixes ship until the window recovers.'; cls = 'bad'; }
    else if (burn >= 14.4){ verdict = `🚨 Page now: burn rate ${burn.toFixed(1)}× would empty 2% of a 30-day budget in ~1 hour.`; cls = 'bad'; }
    else if (burn >= 6){ verdict = `📟 Page: burn rate ${burn.toFixed(1)}× is a sustained, serious burn.`; cls = 'bad'; }
    else if (usedF > expected){ verdict = `🐢 Slow down: you have used ${Math.round(usedF * 100)}% of the budget but only ${Math.round(expected * 100)}% of the window has passed.`; cls = 'warn'; }
    else { verdict = `🚀 Ship: ${Math.round(remainF * 100)}% of the budget left and spending is on pace.`; cls = 'ok'; }
    out.innerHTML = '';
    out.append(h2t(`<div class="metrics">
      <div class="metric"><div class="ml">Error budget</div><div class="mv">${fmtNum(budgetReq)}<small>failed req</small></div></div>
      <div class="metric"><div class="ml">…or full downtime</div><div class="mv">${fmtDur(budgetMin * 60000)}</div></div>
      <div class="metric ${burn >= 6 ? 'bad' : burn >= 1 ? 'warn' : ''}"><div class="ml">Burn rate</div><div class="mv">${burn.toFixed(2)}<small>×</small></div></div>
      <div class="metric ${hoursToEmpty < 24 ? 'bad' : hoursToEmpty < W * 24 * (1 - expected) ? 'warn' : ''}"><div class="ml">Budget empty in</div><div class="mv">${isFinite(hoursToEmpty) ? fmtDur(hoursToEmpty * 3600000) : 'never'}</div></div></div>
      <div class="verdict ${cls}" style="margin-top:12px">${verdict}</div>
      ${h.math(`budget       = (1 − ${S}) × ${fmtNum(N)} requests = ${fmtNum(budgetReq)} failures allowed
as downtime  = (1 − ${S}) × ${W} days × 1,440 min = ${budgetMin.toFixed(1)} minutes
burn rate    = current error rate ÷ allowed error rate = ${(err.value / 100).toFixed(4)} ÷ ${b.toFixed(4)} = ${burn.toFixed(2)}×
(1× = you will use exactly 100% of the budget by the end of the window)`)}`));
  }
  host.append(el('div', {class:'ctl-grid'}, slo.el, win.el, req.el, used.el, elapsed.el, err.el), out); render();
}
function spofHunter(host, api){
  const ARCH = {
    v1:{label:'v1 — “it works on my laptop”', w:800, h:220, src:'u', sinks:['db'],
      nodes:[{id:'u', type:'client', label:'Users', x:70, y:110}, {id:'dns', type:'ext', label:'DNS', x:225, y:110}, {id:'lb', type:'lb', label:'Load balancer', x:390, y:110}, {id:'app', type:'service', label:'App server', x:560, y:110}, {id:'db', type:'db', label:'Database', x:720, y:110}],
      edges:[['u', 'dns'], ['dns', 'lb'], ['lb', 'app'], ['app', 'db']]},
    v2:{label:'v2 — redundant in every tier', w:820, h:330, src:'u', sinks:['dbp', 'dbs'],
      nodes:[{id:'u', type:'client', label:'Users', x:60, y:165}, {id:'d1', type:'ext', label:'DNS provider 1', x:205, y:95, w:126}, {id:'d2', type:'ext', label:'DNS provider 2', x:205, y:235, w:126}, {id:'l1', type:'lb', label:'LB zone A', x:370, y:95}, {id:'l2', type:'lb', label:'LB zone B', x:370, y:235}, {id:'a1', type:'service', label:'App 1', x:540, y:60, w:100}, {id:'a2', type:'service', label:'App 2', x:540, y:165, w:100}, {id:'a3', type:'service', label:'App 3', x:540, y:270, w:100}, {id:'dbp', type:'db', label:'DB primary', x:725, y:105}, {id:'dbs', type:'db', label:'DB standby', sub:'auto-failover', x:725, y:235}],
      edges:[['u', 'd1'], ['u', 'd2'], ['d1', 'l1'], ['d1', 'l2'], ['d2', 'l1'], ['d2', 'l2'], ['l1', 'a1'], ['l1', 'a2'], ['l1', 'a3'], ['l2', 'a1'], ['l2', 'a2'], ['l2', 'a3'], ['a1', 'dbp'], ['a2', 'dbp'], ['a3', 'dbp'], ['a1', 'dbs'], ['a2', 'dbs'], ['a3', 'dbs']]}
  };
  let arch = 'v1', d = null; const dead = new Set();
  const holder = el('div'); const verdict = el('div', {class:'verdict ok', role:'status', style:{marginTop:'10px'}});
  const pathTo = (A, deadSet) => { const adj = {}; A.edges.forEach(([a, b]) => (adj[a] = adj[a] || []).push(b)); const par = {[A.src]:null}, st = [A.src]; while (st.length){ const n = st.shift(); if (A.sinks.includes(n)){ const p = []; let x = n; while (x){ p.unshift(x); x = par[x]; } return p; } for (const m of adj[n] || []) if (!deadSet.has(m) && !(m in par)){ par[m] = n; st.push(m); } } return null; };
  function build(){
    holder.innerHTML = ''; dead.clear(); const A = ARCH[arch];
    d = new api.Diagram(holder, {title:A.label, w:A.w, h:A.h, clickable:true, alt:'Click any component to kill or revive it.', nodes:A.nodes, edges:A.edges.map(([a, b]) => ({from:a, to:b})), caption:'Click any box to <b>kill</b> it (click again to revive). Then press <b>Send request</b>.'});
    d.on('node', id => { if (id === A.src) return; if (dead.has(id)) dead.delete(id); else dead.add(id); d.setStatus(id, dead.has(id) ? 'down' : 'ok'); judge(); });
    judge();
  }
  function judge(){ const p = pathTo(ARCH[arch], dead); verdict.className = 'verdict ' + (p ? 'ok' : 'bad'); verdict.textContent = p ? `✓ Requests still succeed${dead.size ? ` with ${dead.size} component(s) down` : ''}. Path: ${p.join(' → ')}` : `✗ Outage! No working path from users to the data. Dead: ${[...dead].join(', ')}`; return p; }
  async function send(){ const p = judge(); if (!p) return; const hops = []; for (let i = 0; i < p.length - 1; i++) hops.push([p[i], p[i + 1], i === 0 ? 'req' : null]); await d.flow(hops, {dur:520}); }
  function reveal(){ const A = ARCH[arch]; const spofs = A.nodes.map(n => n.id).filter(id => id !== A.src && !pathTo(A, new Set([id]))); A.nodes.forEach(n => { if (!dead.has(n.id)) d.setStatus(n.id, spofs.includes(n.id) ? 'hot' : 'ok'); }); verdict.className = 'verdict ' + (spofs.length ? 'warn' : 'ok'); verdict.textContent = spofs.length ? `Single points of failure (pulsing): ${spofs.join(', ')}. Killing any ONE of these alone causes an outage.` : 'No single point of failure: any one component can die and requests still succeed (assuming failures are independent and failover is automatic).'; }
  const sel = ui.select({label:'Architecture', value:'v1', options:[['v1', 'v1 — single everything'], ['v2', 'v2 — redundant in every tier']], onChange:v => { arch = v; build(); }});
  host.append(el('div', {class:'ctl-grid'}, sel.el), holder, verdict, el('div', {class:'controls', style:{marginTop:'10px'}}, ui.button('📨 Send request', send, 'sm primary'), ui.button('🔍 Reveal SPOFs', reveal, 'sm'), ui.button('↺ Revive all', build, 'sm ghost')));
  build();
}
function archAdvisor(host){
  const out = el('div', {style:{marginTop:'14px'}});
  const eng = ui.slider({label:'Engineers working on the product', min:2, max:400, step:1, value:25, fmt:v => v, onInput:render});
  const t1 = ui.toggle({label:'Domain boundaries are clear and stable', checked:false, onChange:render});
  const t2 = ui.toggle({label:'Some parts need very different scaling / reliability', checked:false, onChange:render});
  const t3 = ui.toggle({label:'Mature platform: CI/CD, monitoring, tracing, on-call', checked:false, onChange:render});
  const t4 = ui.toggle({label:'Teams must release independently, many times a day', checked:false, onChange:render});
  function render(){
    let s = 0; const why = [];
    const n = eng.value;
    if (n < 15){ s -= 3; why.push(['−', `${n} engineers fit in one codebase; every extra service adds deploy, monitoring and on-call cost.`]); }
    else if (n < 50){ s -= 1; why.push(['−', `${n} engineers: a modular monolith usually captures most of the team-autonomy benefit.`]); }
    else if (n < 150){ s += 1; why.push(['+', `${n} engineers: coordination in one deploy pipeline is becoming a real tax.`]); }
    else { s += 2; why.push(['+', `${n} engineers: many teams blocking each other on one release train is expensive.`]); }
    if (t1.value){ s += 2; why.push(['+', 'Clear boundaries mean services can own their data without constant cross-service changes.']); } else { s -= 2; why.push(['−', 'Unclear boundaries → you will cut services in the wrong places and pay for it in chatty calls and distributed transactions.']); }
    if (t2.value){ s += 1; why.push(['+', 'Different scaling/reliability needs are a genuine reason to deploy parts separately.']); }
    if (t3.value){ s += 1; why.push(['+', 'A mature platform makes each new service cheap to run.']); } else { s -= 2; why.push(['−', 'Without CI/CD, metrics and tracing, every service multiplies operational pain and debugging time.']); }
    if (t4.value){ s += 1; why.push(['+', 'Independent release cadence is the core payoff of microservices.']); }
    const [title, cls] = s <= -3 ? ['A well-structured monolith', 'ok'] : s <= 1 ? ['A modular monolith (enforced module boundaries, one deployable)', 'ok'] : s <= 3 ? ['Modular monolith now — extract the 1–2 parts that truly need independence', 'warn'] : ['Microservices, migrated incrementally (strangler fig)', 'warn'];
    out.innerHTML = '';
    out.append(el('div', {class:'verdict ' + cls}, `Recommendation (score ${s > 0 ? '+' : ''}${s}): ${title}`), el('ul', {class:'prose', style:{marginTop:'10px'}, html:why.map(([k, t]) => `<li><b style="color:${k === '+' ? 'var(--ok)' : 'var(--bad)'}">${k}</b> ${esc(t)}</li>`).join('')}), el('p', {class:'lab-hint'}, 'This is a transparent rule of thumb, not an oracle. Real decisions also weigh hiring, compliance boundaries and existing tech debt.'));
  }
  host.append(eng.el, el('div', {class:'stack', style:{marginTop:'12px'}}, t1.el, t2.el, t3.el, t4.el), out); render();
}

/* ---------- the module ---------- */
const lessons = [
{
  id:'what-is-system-design', title:'What system design is', minutes:7, tags:['intro','HLD','architecture'],
  summary:'Deciding which boxes exist, what each owns, how they talk, and what happens when one dies — under real limits of time, money and physics.',
  problem:`<p>Your college-fest app worked perfectly for 200 testers. On results night, <strong>40,000 students</strong> open it at 6 PM. The single server hits 100% CPU, the database runs out of connections, pages take 30 seconds — then everything returns errors.</p><p>Nothing in the code was "wrong". It was simply designed for a different load. <strong>System design</strong> is deciding the shape of a system <em>before</em> reality decides it for you.</p>`,
  intuition:`Think of a restaurant kitchen. One cook can run a 10-table café. A 300-guest wedding needs a head chef taking orders (load balancer), several line cooks (servers), a prep station with ready-made gravies (cache), a pantry (database) and an order rail where tickets wait (queue). Nobody cooks faster — the kitchen is <em>organised</em> differently. System design is organising the kitchen.`,
  how:{
    steps:[`Understand <b>what</b> must be built (features) and <b>how well</b> it must work (speed, uptime, correctness).`, `Estimate the load: users, requests per second, data size.`, `Choose building blocks: clients, load balancers, services, caches, databases, queues, CDNs.`, `Decide how they connect and which component <b>owns</b> which data.`, `Ask "what breaks first?" at 10× and 100× load — and what happens when each box dies.`, `Choose trade-offs deliberately and write them down.`],
    diagram:{title:'Organising the kitchen as load grows', w:760, h:290, alt:'A single app server and database evolve into a load-balanced pair of servers with a cache and a queue.',
      nodes:[{id:'c', type:'client', label:'Users', x:70, y:150}, {id:'lb', type:'lb', label:'Load balancer', x:210, y:150, hidden:true}, {id:'a1', type:'service', label:'App server 1', x:375, y:95}, {id:'a2', type:'service', label:'App server 2', x:375, y:215, hidden:true}, {id:'ca', type:'cache', label:'Cache', x:590, y:55, hidden:true}, {id:'db', type:'db', label:'Database', x:590, y:155}, {id:'q', type:'queue', label:'Job queue', x:590, y:250, hidden:true}],
      edges:[{from:'c', to:'a1'}, {from:'c', to:'lb', hidden:true}, {from:'lb', to:'a1'}, {from:'lb', to:'a2'}, {from:'a1', to:'ca'}, {from:'a1', to:'db'}, {from:'a2', to:'db'}, {from:'a2', to:'q'}],
      steps:[
        {note:'<b>Day 1:</b> users talk to one app server, which talks to one database. Simple, cheap, perfect for hundreds of users.', flow:[['c', 'a1', 'GET'], ['a1', 'db', 'SQL'], ['db', 'a1'], ['a1', 'c', '200']], hl:['a1']},
        {note:'<b>Load grows.</b> One server can’t keep up, so a <b>load balancer</b> spreads requests over a second server.', reveal:['lb', 'a2'], hideEdges:[['c', 'a1']], showEdges:[['c', 'lb']], flow:[['c', 'lb'], ['lb', 'a2'], ['a2', 'db'], ['db', 'a2'], ['a2', 'lb'], ['lb', 'c', '200']], hl:['lb', 'a2']},
        {note:'Most requests read the same popular data. A <b>cache</b> answers them from memory so the database can rest.', reveal:['ca'], flow:[['c', 'lb'], ['lb', 'a1'], ['a1', 'ca', 'GET'], ['ca', 'a1', 'hit'], ['a1', 'lb'], ['lb', 'c']], hl:['ca']},
        {note:'Slow work (emails, image resizing) goes onto a <b>queue</b> so users don’t wait for it.', reveal:['q'], flow:[['c', 'lb', 'POST'], ['lb', 'a2'], ['a2', 'q', 'job'], ['a2', 'lb', '202'], ['lb', 'c']], hl:['q']},
        {note:'Now the real design questions: what if the <b>database</b> dies? What if traffic is 100× tomorrow? That question loop <em>is</em> system design.', hl:['db'], status:{db:'hot'}}
      ]},
    deep:`<p>System design spans layers: <b>requirements</b> → <b>capacity</b> → <b>data model & access patterns</b> → <b>consistency semantics</b> → <b>failure domains</b> → <b>operability</b> (deploys, observability, on-call) → <b>cost</b>. "High-level design" (HLD) picks components and data flow; "low-level design" (LLD) picks classes, schemas and algorithms inside a component.</p><p>Senior engineers are judged on three habits: finding the <b>binding constraint</b> (often the database write path or one hot key), preferring <b>reversible</b> decisions where possible (Amazon calls these "two-way doors"), and <b>quantifying</b> everything with rough numbers before arguing.</p>`
  },
  tradeoffs:{use:[`Before building anything expected to outgrow one machine`, `When failure is expensive: payments, bookings, health`, `When several teams will work on one product`], avoid:[`Over-designing a prototype — 50 users need one server and a managed database`, `Copying a FAANG architecture for a product without FAANG’s problems`], alt:[`Start on managed platforms (PaaS, serverless, BaaS) and design only the parts that hurt`, `Evolutionary architecture: design for the next 10×, not the next 1000×`]},
  real:[
    {co:'Stack Overflow', tier:'confirmed', text:'Has publicly described serving one of the web’s busiest sites from a small number of powerful servers and a largely monolithic .NET application — proof that good design is about fit, not box count.', src:'Nick Craver, “Stack Overflow: The Architecture – 2016 Edition”'},
    {co:'Netflix', tier:'confirmed', text:'A major database corruption in August 2008 stopped DVD shipping for three days. Netflix responded with a multi-year move to AWS and a distributed, failure-tolerant architecture, completing the cloud migration in 2016.', src:'Netflix, “Completing the Netflix Cloud Migration” (2016)'},
    {co:'IRCTC', tier:'confirmed', text:'Tatkal booking opens at fixed published times (10:00 AM for AC classes, 11:00 AM for non-AC), so demand arrives as a predictable, extreme spike. Designs must target that peak, not the daily average. <em>How</em> IRCTC handles it internally is not fully public.', src:'IRCTC published Tatkal booking rules'}
  ],
  mistakes:[`Jumping to boxes before asking what the product must do`, `Designing for average load instead of the peak`, `Adding microservices, Kafka or Kubernetes because big companies do`, `Ignoring failure — every box you draw will die at some point`],
  interview:[`Interviewers grade reasoning, not the final picture: narrate why`, `State assumptions out loud and get agreement before designing`, `A simple, justified design beats a complex, unjustified one`],
  tryit:{quiz:[
    {q:'A design works for 1,000 users but collapses at 50,000. Which is the most useful first question?', options:['Which programming language is fastest?', 'Which component saturates first, and what is the peak load?', 'Should we rewrite it as microservices?', 'Can we buy the biggest server available?'], answer:1, why:'Find the binding constraint and the real peak first. Language rewrites and microservices are expensive answers to a question you haven’t asked yet.'},
    {q:'Which of these is a system design decision rather than a code-level decision?', options:['Naming a variable', 'Choosing between a for-loop and map()', 'Putting a cache in front of the database for product pages', 'Adding a comment'], answer:2, why:'Adding a cache changes components, data flow and failure modes — that is architecture.'}
  ]},
  sources:[`Nick Craver, “Stack Overflow: The Architecture – 2016 Edition” (blog series)`, `Netflix, “Completing the Netflix Cloud Migration” (2016)`, `Jeff Bezos, Amazon shareholder letter (2015) — “Type 1 / Type 2” (one-way / two-way door) decisions`]
},
{
  id:'seven-step-approach', title:'The repeatable 7-step approach', minutes:8, tags:['framework','interview','process'],
  summary:'Clarify → Estimate → API → Data → High-level design → Deep dive → Bottlenecks & trade-offs. One loop for interviews and real design docs.',
  problem:`<p>Asked to "design Zomato", most people start drawing a database. Twenty minutes later they learn the interviewer only wanted <strong>restaurant search</strong>, at a tenth of the scale they assumed, with strict <strong>delivery-time accuracy</strong>. Without a process you solve the wrong problem very well.</p>`,
  intuition:`Building a house: you don’t buy bricks before knowing how many people will live there (requirements), how big the plot is (estimation), where the doors go (APIs), what each room stores (data), the floor plan (high-level design), the wiring and plumbing (deep dive), and what happens in an earthquake (bottlenecks and failures).`,
  how:{
    intro:'Use the same seven steps every time. Time boxes below are for a 45-minute interview; in a design doc each step becomes a section.',
    stepper:{title:'The 7-step loop', dwell:3200, items:[
      {title:'Clarify requirements', tag:'~5 min', text:'Who are the users? Which features are in scope (and explicitly out)? Targets for scale, latency, availability and consistency. Write <b>functional</b> and <b>non-functional</b> requirements where everyone can see them.'},
      {title:'Estimate scale', tag:'~3–5 min', text:'Daily users → average and peak requests/second, storage per year, bandwidth, cache size. 50 req/s and 500,000 req/s are different systems — the numbers pick the architecture.'},
      {title:'Define the API', tag:'~3–5 min', text:'List endpoints or events: <code>GET /restaurants?lat=..&lng=..</code>, <code>POST /orders</code>. Note authentication, pagination and idempotency keys for anything that moves money.'},
      {title:'Data model', tag:'~5 min', text:'Entities, relationships and — most importantly — <b>access patterns</b>. They decide SQL vs NoSQL, primary keys, indexes and partition keys.'},
      {title:'High-level design', tag:'~10 min', text:'Draw clients, load balancers, services, caches, databases, queues. Walk one request end-to-end so the interviewer sees the data flow.'},
      {title:'Deep dive', tag:'~10 min', text:'Go deep on the 1–2 hardest parts: ranking, seat locking, fan-out, matching, payments. Ask which part the interviewer cares about.'},
      {title:'Bottlenecks & trade-offs', tag:'~5 min', text:'What breaks at 10×? Single points of failure? What did you give up, and why is that acceptable? How would you monitor it?'}
    ]},
    html:`<p>In real companies the same loop becomes a design document. A skeleton you can copy:</p>${h.code('markdown', `# Design: <feature name>
## Context & problem          (why now? what hurts?)
## Goals / Non-goals          (non-goals prevent scope creep)
## Requirements               (functional + non-functional, with numbers)
## Estimates                  (QPS avg/peak, storage, bandwidth)
## API & data model
## Proposed design            (diagram + one request walked end to end)
## Alternatives considered    (and why not)
## Failure modes & mitigations
## Rollout, migration, observability
## Open questions`, 'design-doc-template.md')}`,
    deep:`<p>The steps are a loop, not a line: estimation often sends you back to requirements ("writes dominate — is eventual consistency acceptable for the feed?"). In docs, <b>non-goals</b> matter as much as goals because they stop scope creep. <b>Alternatives considered</b> is where reviewers check your judgement — a design with no alternatives looks like the first idea that worked.</p><p>Time-box ruthlessly: if you are 30 minutes in without a high-level diagram, you over-invested in clarification. Seniority shows mostly in step 7 — failure modes, operability and cost.</p>`
  },
  tradeoffs:{use:[`Every interview and every non-trivial design doc`, `Onboarding to an unfamiliar system: walk it through the same seven lenses`], avoid:[`Treating it as a rigid script — skip or reorder when the interviewer steers you`, `Spending equal time on every step regardless of where the difficulty is`], alt:[`Event storming for domain-heavy systems`, `“Working backwards” (Amazon’s PR/FAQ) to start from the customer experience`]},
  real:[
    {co:'Amazon', tier:'confirmed', text:'Teams write a mock press release and FAQ (“PR/FAQ”) before building, forcing clarity on customer, problem and scope — step 1 taken seriously.', src:'Colin Bryar & Bill Carr, “Working Backwards” (2021)'},
    {co:'Google', tier:'confirmed', text:'Engineers write design docs with context, goals, non-goals, the design and alternatives considered, reviewed before major implementation work begins.', src:'Malte Ubl, “Design Docs at Google” (2020)'},
    {co:'Uber', tier:'confirmed', text:'Used a company-wide RFC process for proposing and reviewing designs as engineering grew to thousands of people.', src:'Gergely Orosz (ex-Uber), The Pragmatic Engineer, writing on RFCs at Uber (2020)'}
  ],
  mistakes:[`Skipping clarification and designing the wrong product`, `Estimating, then never using the numbers to decide anything`, `Spending 20 minutes on the API and never reaching the hard part`, `No time left for bottlenecks and failures — where seniority shows`],
  interview:[`Say the framework in the first minute so the interviewer can steer you`, `Write numbers on the board and point back to them when picking components`, `Before the deep dive, ask: “Which part would you like me to go deeper on?”`],
  tryit:{note:'Put the seven steps in order. (Hint: you can’t pick a database before knowing the access patterns.)', mount:host => orderGame(host, ['Clarify requirements', 'Estimate scale', 'Define the API', 'Data model', 'High-level design', 'Deep dive', 'Bottlenecks & trade-offs'])},
  sources:[`Malte Ubl, “Design Docs at Google” (2020)`, `Colin Bryar & Bill Carr, “Working Backwards” (2021)`]
},
{
  id:'functional-vs-nonfunctional', title:'Functional vs non-functional requirements', minutes:7, tags:['requirements','NFR','quality attributes'],
  summary:'Functional = what the system does. Non-functional = how well, how fast, how safely — always with numbers.',
  problem:`<p>Two teams build a train-booking system from the same feature list: search trains, pick a berth, pay, receive a PNR. Team A’s version crashes at Tatkal time and occasionally sells the <strong>same berth twice</strong>. Team B’s survives. Same features — different <strong>non-functional requirements</strong>.</p>`,
  intuition:`Ordering a birthday cake: “chocolate, 2 kg, ‘Happy Birthday Riya’ on top” are functional — what it is. “Delivered by 7 PM, eggless, survives a 30-minute car ride” are non-functional — the qualities and constraints. Miss either one and the party fails.`,
  how:{
    steps:[`<b>Functional requirements</b> are verbs a user does: “search trains”, “book a berth”, “get an SMS with the PNR”.`, `<b>Non-functional requirements</b> are qualities: latency, availability, consistency, durability, scalability, security, compliance, cost.`, `Turn vague words into <b>measurable targets</b> (see the animation).`, `Set NFRs <b>per feature</b>: search can be cached and slightly stale; booking must never double-sell.`, `Decide which NFR <b>wins in a conflict</b> — e.g. booking prefers correctness over availability; a social feed prefers availability over perfect freshness.`],
    stepper:{title:'From vague wishes to measurable targets', items:[
      {title:'“It should be fast”', tag:'latency', text:'→ <b>p99 search latency &lt; 300 ms</b> measured at the load balancer; booking confirmation p99 &lt; 2 s.'},
      {title:'“Always up”', tag:'availability', text:'→ <b>99.95% of booking requests succeed</b> per 30-day window (≈ 22 minutes of failure budget).'},
      {title:'“Correct”', tag:'consistency', text:'→ <b>A berth is never allocated to two passengers</b>: strong consistency on seat inventory, even if some requests must be rejected under load.'},
      {title:'“Never lose data”', tag:'durability', text:'→ <b>Zero loss of confirmed bookings</b>: committed to at least two zones before the PNR is shown.'},
      {title:'“Scales”', tag:'scalability', text:'→ Handle <b>20× normal traffic for 10 minutes</b> at Tatkal opening without breaching the latency SLO (numbers illustrative).'},
      {title:'“Secure & compliant”', tag:'security', text:'→ Card data never touches our servers (tokenised by a PCI-DSS compliant gateway); personal data handled per India’s DPDP Act.'}
    ]},
    html:h.table(['Quality', 'Example target', 'Design levers'], [['Latency', 'p99 < 200 ms', 'caching, CDNs, fewer hops, async work'], ['Availability', '99.95% monthly', 'redundancy, failover, graceful degradation'], ['Consistency', 'read-your-writes; no double booking', 'transactions, leader-based writes, quorums'], ['Durability', 'no committed write lost', 'replication, backups, write-ahead logs'], ['Scalability', '10× peak for 10 min', 'stateless tiers, partitioning, queues'], ['Cost', '< ₹X per 1,000 orders', 'right-sizing, tiered storage, spot capacity']]),
    deep:`<p>Write NFRs as <b>quality-attribute scenarios</b> (from <i>Software Architecture in Practice</i>, Bass, Clements & Kazman): source, stimulus, environment, artifact, response, response measure. Example: “When 1M users press <i>Book</i> within 60 s (stimulus) at Tatkal opening (environment), the booking service (artifact) accepts or rejects every request (response) within 2 s at p99, with zero double allocations (measure).”</p><p>NFRs interact: stronger consistency usually costs latency and availability during network partitions (CAP/PACELC, Module 6). That is why the per-feature split matters — the same product can be strongly consistent where money or inventory moves and eventually consistent everywhere else.</p>`
  },
  tradeoffs:{use:[`Always — and always with numbers and a measurement point`, `Per user journey, not one number for the whole system`], avoid:[`Gold-plating: demanding 99.999% for an internal dashboard`, `Copying NFRs without checking their cost — each extra nine can multiply spend`], alt:[`Express NFRs as SLOs (later lesson) so they are continuously measured`, `Quality-attribute scenarios for architecture reviews`]},
  real:[
    {co:'Amazon (Dynamo)', tier:'confirmed', text:'The Dynamo paper describes the shopping cart as needing to be “always writeable”: availability was prioritised over strong consistency, and latency targets were set at the 99.9th percentile rather than the average.', src:'DeCandia et al., “Dynamo: Amazon’s Highly Available Key-value Store”, SOSP 2007'},
    {co:'Google (Spanner)', tier:'confirmed', text:'Spanner was built because some applications (Google’s advertising backend among them) needed strongly consistent, globally distributed transactions — a non-functional requirement that drove an entirely new database.', src:'Corbett et al., “Spanner: Google’s Globally-Distributed Database”, OSDI 2012'},
    {co:'IRCTC', tier:'inference', text:'Seat inventory must never be double-allocated, while train search can tolerate briefly stale availability. The same product needs different NFRs per feature.', src:'Inference from public booking behaviour; internal design not published'}
  ],
  mistakes:[`Listing “scalable, fast, reliable” with no numbers`, `One NFR for the whole system instead of per feature`, `Forgetting durability, privacy and compliance for payments and personal data`, `Not saying which NFR wins when two conflict`],
  interview:[`After the features, ask: “What scale? What latency? Is stale data OK? Can we ever lose a write?”`, `State a priority explicitly: “For booking I’ll choose consistency over availability.”`],
  tryit:{note:'Sort each statement into Functional or Non-functional.', mount:host => sortGame(host, [
    {t:'Users can search trains between two stations', c:'f', why:'A user-visible capability.'}, {t:'Search p99 latency stays under 300 ms', c:'n', why:'A performance quality with a number.'},
    {t:'A berth is never sold to two people', c:'n', why:'A consistency/correctness guarantee — a quality, not a feature.'}, {t:'Users receive an SMS with their PNR', c:'f', why:'A feature the user sees.'},
    {t:'System handles 20× traffic at 10:00 AM', c:'n', why:'Scalability target.'}, {t:'Users can cancel a booking and get a refund', c:'f', why:'A capability.'},
    {t:'Card numbers are never stored on our servers', c:'n', why:'Security/compliance constraint.'}, {t:'99.95% of booking requests succeed each month', c:'n', why:'Availability target.'}
  ], [{id:'f', label:'Functional'}, {id:'n', label:'Non-functional'}])},
  sources:[`DeCandia et al., “Dynamo”, SOSP 2007`, `Corbett et al., “Spanner”, OSDI 2012`, `Bass, Clements & Kazman, “Software Architecture in Practice”`]
},
{
  id:'client-server', title:'The client–server model', minutes:7, tags:['client','server','stateless','sessions'],
  summary:'Clients ask, servers answer, databases remember. Keep servers stateless so you can add more of them.',
  problem:`<p>The Swiggy app shows restaurants, menus and your live order status. Where does that data live? Not on your phone — millions of phones can’t each hold every restaurant’s menu and keep it in sync. Something central must own the truth, and every phone must ask it.</p>`,
  intuition:`A library. Readers (clients) don’t own the books; they ask the librarian (server), who fetches from the stacks (database) and hands back a copy. Many readers share one organised collection. Readers may keep photocopies (a cache), but only the library holds the authoritative copy.`,
  how:{
    steps:[`A <b>client</b> (browser, mobile app, or another service) opens a connection and sends a <b>request</b>.`, `A <b>server</b> listens on an address and port, does the work and returns a <b>response</b> (usually over HTTP).`, `Durable state lives in a <b>database</b>, not in the server’s memory.`, `<b>Stateless</b> servers keep nothing between requests: each request carries what it needs (e.g. an auth token). Any server can answer any request, so you can add servers freely.`, `Never trust the client: prices, permissions and totals are computed and checked on the server.`],
    diagram:{title:'Many clients, one source of truth', w:760, h:280, alt:'A phone, a browser and a partner service send requests to an API server backed by a database.',
      nodes:[{id:'p', type:'client', label:'Phone app', x:80, y:60}, {id:'b', type:'client', label:'Browser', x:80, y:150}, {id:'x', type:'ext', label:'Partner service', x:80, y:240, w:130}, {id:'s', type:'service', label:'API server', x:380, y:150}, {id:'db', type:'db', label:'Database', x:640, y:150}],
      edges:[{from:'p', to:'s'}, {from:'b', to:'s'}, {from:'x', to:'s'}, {from:'s', to:'db'}],
      steps:[
        {note:'The phone asks for a menu. The server reads the <b>source of truth</b> and replies.', flow:[['p', 's', 'GET /menu'], ['s', 'db', 'SELECT'], ['db', 's'], ['s', 'p', '200 JSON']], hl:['p', 's']},
        {note:'A browser places an order. The server — not the client — computes the total and writes it.', flow:[['b', 's', 'POST /orders'], ['s', 'db', 'INSERT'], ['db', 's'], ['s', 'b', '201']], hl:['b', 'db']},
        {note:'Servers are clients too: a partner system calls the same API with its own credentials.', flow:[['x', 's', 'GET /status'], ['s', 'x', '200']], hl:['x']},
        {note:'The server itself remembers nothing between requests — that is what lets us run ten copies of it later.', hl:['s']}
      ]},
    deep:`<p><b>Sessions:</b> a stateful server keeps a session map in RAM; once you run two servers behind a load balancer, half the requests land on a server that has never seen the session. Fixes: sticky sessions (fragile), a shared session store such as Redis, or self-contained signed tokens (JWT, Module 12) with short expiry.</p><p><b>Concurrency models:</b> thread-per-request (classic Java servlets) vs event loop (Node.js, Nginx) vs lightweight processes (Erlang/BEAM). <b>Connection models:</b> short request/response (HTTP), persistent bidirectional (WebSocket), or server push (SSE). <b>Alternatives:</b> peer-to-peer (BitTorrent; WebRTC media flows peer-to-peer after a server-assisted signalling step) and local-first apps that sync later.</p>`
  },
  tradeoffs:{use:[`Shared data with a central authority (orders, balances, inventory)`, `Enforcing security and business rules in one trusted place`], avoid:[`Session state in one server’s RAM once you have more than one server`, `Very chatty clients: 30 calls to render one screen on a 3G connection`], alt:[`Peer-to-peer for bulk distribution (BitTorrent) or direct media (WebRTC)`, `Backend-for-frontend endpoints that return one screen in one call`, `Local-first apps with background sync`]},
  real:[
    {co:'WhatsApp', tier:'confirmed', text:'Uses a client–server model for message delivery: messages are stored (end-to-end encrypted) on WhatsApp servers until they can be delivered, then deleted; undelivered messages are deleted after 30 days.', src:'WhatsApp Help Center / WhatsApp Security Whitepaper'},
    {co:'BitTorrent', tier:'confirmed', text:'A peer-to-peer protocol: downloaders exchange pieces with each other, so popular files get <em>more</em> available as demand grows — the opposite of a central server melting down.', src:'BitTorrent Enhancement Proposal BEP 3'},
    {co:'Swiggy / Zomato', tier:'inference', text:'The app is a thin client; order state, pricing and restaurant availability are authoritative on the backend, which is why prices are re-validated at checkout.', src:'Inference from public app behaviour'}
  ],
  mistakes:[`Trusting the client with prices, permissions or totals`, `Keeping sessions in one server’s RAM, then adding a second server`, `Treating the server as the source of truth for data that only lives in its memory`],
  interview:[`Say which component is the source of truth for each piece of data`, `Default to stateless app servers; push state to a database or cache`],
  tryit:{note:'Log in, then load your orders a few times — first with sessions in server memory, then with a shared Redis store.', mount:(host, api) => statelessDemo(host, api)},
  sources:[`WhatsApp Security Whitepaper`, `BEP 3: The BitTorrent Protocol Specification`]
},
{
  id:'web-request-journey', title:'The life of a web request', minutes:10, tags:['DNS','TCP','TLS','HTTP','latency'],
  summary:'From pressing Enter to pixels on screen: DNS → TCP → TLS → HTTP → load balancer → app → cache/DB → response → render.',
  problem:`<p>Users in Patna say your site “feels slow”, but server logs show <strong>40 ms</strong> responses. Where did the other 1.5 seconds go? Usually into steps that happen <em>before</em> your code runs: DNS lookups, TCP and TLS handshakes across a long round trip, and requests made one after another.</p>`,
  intuition:`Posting a parcel to a friend who just moved: look up their new address (DNS), phone to check they’re home (TCP handshake), agree on a lockbox code so no one else can open it (TLS), send the parcel (HTTP request). Reception routes it to the right flat (load balancer), your friend checks the cupboard (cache) or the storeroom (database), then posts a reply.`,
  how:{
    steps:[`<b>DNS:</b> browser cache → OS cache → recursive resolver (your ISP, 1.1.1.1 or 8.8.8.8) → root → TLD (.com) → authoritative server → IP address. Answers are cached for their TTL.`, `<b>TCP handshake:</b> SYN → SYN-ACK → ACK. One round trip to set up a reliable connection.`, `<b>TLS handshake:</b> agree on keys and verify the certificate. TLS 1.3 needs one round trip; TLS 1.2 needed two.`, `<b>HTTP request:</b> <code>GET /</code> with headers and cookies.`, `<b>Load balancer / reverse proxy</b> (often where TLS ends) forwards to a healthy app server.`, `<b>App server</b> runs logic, checks the cache, and on a miss queries the database.`, `<b>Response</b> travels back; the browser parses HTML, fetches CSS/JS/images (often from a CDN) and renders.`],
    diagram:{title:'One request, every hop', w:800, h:280, alt:'Browser resolves DNS, completes TCP and TLS handshakes with the load balancer, then the app checks cache and database.',
      nodes:[{id:'br', type:'client', label:'Browser', x:70, y:160}, {id:'dns', type:'ext', label:'DNS resolver', x:250, y:55, w:130}, {id:'lb', type:'lb', label:'LB + TLS', x:300, y:190}, {id:'app', type:'service', label:'App server', x:495, y:190}, {id:'ca', type:'cache', label:'Cache', x:690, y:110}, {id:'db', type:'db', label:'Database', x:690, y:235}, {id:'cdn', type:'cdn', label:'CDN edge', x:495, y:55}],
      edges:[{from:'br', to:'dns'}, {from:'br', to:'lb'}, {from:'lb', to:'app'}, {from:'app', to:'ca'}, {from:'app', to:'db'}, {from:'br', to:'cdn', curve:.12}],
      steps:[
        {note:'<b>DNS:</b> “What is the IP for zomato.com?” The resolver answers (from cache, or by asking root → .com → authoritative).', flow:[['br', 'dns', 'A?'], ['dns', 'br', 'IP']], hl:['dns']},
        {note:'<b>TCP:</b> SYN → SYN-ACK → ACK. One full round trip before any data flows.', flow:[['br', 'lb', 'SYN'], ['lb', 'br', 'SYN-ACK'], ['br', 'lb', 'ACK']], hl:['lb'], dur:700},
        {note:'<b>TLS 1.3:</b> ClientHello (with key share) → ServerHello + certificate + Finished. One more round trip; now traffic is encrypted.', flow:[['br', 'lb', 'ClientHello'], ['lb', 'br', 'ServerHello+cert']], hl:['lb']},
        {note:'<b>HTTP:</b> the request goes to the load balancer, which forwards it to a healthy app server.', flow:[['br', 'lb', 'GET /'], ['lb', 'app']], hl:['app']},
        {note:'<b>App:</b> checks the cache first. Miss → query the database → (write the result back to cache).', flow:[['app', 'ca', 'GET'], ['ca', 'app', 'miss'], ['app', 'db', 'SELECT'], ['db', 'app', 'rows']], hl:['ca', 'db']},
        {note:'<b>Response</b> flows back. The browser parses HTML and discovers it needs CSS, JS and images…', flow:[['app', 'lb', '200'], ['lb', 'br', 'HTML']], hl:['br']},
        {note:'…which come from a nearby <b>CDN edge</b>, not your origin — short round trips, cached bytes.', flow:[['br', 'cdn', 'GET app.js'], ['cdn', 'br', 'cached']], hl:['cdn']}
      ]},
    deep:`<p>Rough time to first byte on a fresh connection: <code>DNS + TCP (1 RTT) + TLS 1.3 (1 RTT) + request (1 RTT) + server time</code>. With a 100 ms round trip that is ~300 ms <em>before</em> your 40 ms of server time even counts — the Patna mystery.</p><ul><li><b>TCP slow start:</b> a new connection starts with a small congestion window (an initial window of ~10 segments, RFC 6928), so the first round trips carry limited data.</li><li><b>TLS 1.3 0-RTT</b> resumption lets a returning client send data in its first flight — but that data can be replayed, so use it only for idempotent requests.</li><li><b>HTTP/2</b> multiplexes many requests over one TCP connection, but a lost TCP packet stalls all streams (head-of-line blocking). <b>HTTP/3</b> runs over <b>QUIC</b> (UDP), merges the transport and crypto handshakes into one round trip, and isolates streams.</li><li><b>Connection reuse</b> (keep-alive, connection pools) amortises handshakes; this is why backends keep warm pools to databases and other services.</li><li><b>DNS TTLs</b> trade agility for load: low TTLs let you fail over fast but cause more lookups; high TTLs make migrations slow because old answers linger.</li></ul>`
  },
  tradeoffs:{use:[`CDNs and edge TLS termination to shorten round trips for far-away users`, `Keep-alive and connection pooling everywhere`, `HTTP/2 or HTTP/3 for pages with many resources`], avoid:[`Chains of sequential blocking requests on mobile networks`, `Very low DNS TTLs everywhere unless you need fast failover`], alt:[`Server-side rendering or streaming HTML`, `Preconnect / dns-prefetch hints`, `Edge compute for latency-critical logic`]},
  real:[
    {co:'Google → IETF (QUIC)', tier:'confirmed', text:'QUIC was developed at Google and later standardised by the IETF as RFC 9000 (2021); HTTP/3 over QUIC is RFC 9114 (2022). It folds the transport and TLS 1.3 handshakes into one round trip.', src:'RFC 9000, RFC 9114, RFC 8446 (TLS 1.3)'},
    {co:'Cloudflare', tier:'confirmed', text:'Runs the public 1.1.1.1 recursive DNS resolver (launched 2018) and terminates TLS at edge locations close to users, so handshakes travel a short distance.', src:'Cloudflare blog announcements'},
    {co:'Any Indian e-commerce site', tier:'educational', text:'A user in Patna hitting an origin in Mumbai pays the long round trip three times on a cold connection. Serving static assets and TLS from a nearby CDN edge removes most of that.', src:'Simplified educational example'}
  ],
  mistakes:[`Measuring only server time and ignoring network round trips`, `Forgetting DNS TTLs during migrations (old IPs cached for hours)`, `Opening a new TCP + TLS connection for every backend call`],
  interview:[`“What happens when you type a URL?” — go layer by layer and mention caching at each layer`, `Quantify: handshakes cost round trips, so distance (RTT) dominates for far users → CDN/edge`],
  tryit:{note:'Change the round-trip time, protocol and caching. Watch the waterfall and the animated handshakes update.', pg:'request-journey'},
  sources:[`RFC 8446 (TLS 1.3), RFC 9000 (QUIC), RFC 9114 (HTTP/3), RFC 6928 (TCP initial window)`, `Ilya Grigorik, “High Performance Browser Networking” (O’Reilly)`]
},
{
  id:'latency-numbers', title:'Latency numbers every engineer should know', minutes:8, tags:['latency','performance','memory','network'],
  summary:'Memory ~100 ns, SSD ~100 µs, same-datacenter round trip ~0.5 ms, across continents 100+ ms. Orders of magnitude, not exact values.',
  problem:`<p>A teammate proposes calling the user-profile service in a loop — 200 sequential calls per page, “but each is only 1 ms”. That is 200 ms of pure waiting before any real work. Without a feel for how long things take, you can’t spot slow designs on a whiteboard.</p>`,
  intuition:`Stretch time so that 1 nanosecond becomes 1 second. Reading the CPU’s L1 cache is 1 second — grabbing a pen from your desk. Main memory is ~1.5 minutes — walking to the next room. An SSD read is a day or so. A packet to another continent and back is about five years. Same computer, wildly different distances.`,
  how:{
    steps:[`CPU caches (L1/L2/L3) are nanoseconds; <b>main memory ≈ 100 ns</b>.`, `<b>SSD random read ≈ 10–150 µs</b> — roughly 1,000× slower than memory.`, `<b>Round trip inside a datacenter ≈ 0.5 ms</b>; between zones in a region ≈ 1–2 ms.`, `<b>Across a continent or ocean: 50–250 ms</b>. Physics sets the floor: light in fibre travels ≈ 200,000 km/s, about <b>5 µs per km</b>.`, `Sequential reads are far faster than random ones (especially on spinning disks).`, `So: keep hot data in memory, avoid round trips in loops, put data near users, and batch.`],
    stepper:{title:'If 1 nanosecond were 1 second…', dwell:2600, items:[
      {title:'L1 cache reference', tag:'~1 ns → 1 s', text:'Grabbing a pen on your desk.'},
      {title:'Main memory reference', tag:'~100 ns → ~1.7 min', text:'Walking to the kitchen and back.'},
      {title:'Compress 1 KB (Snappy)', tag:'~2 µs → ~33 min', text:'Making chai.'},
      {title:'SSD random 4 KB read', tag:'~100 µs → ~1.2 days', text:'A day trip to another city.'},
      {title:'Datacenter round trip', tag:'~500 µs → ~6 days', text:'A week-long holiday.'},
      {title:'Disk seek (HDD)', tag:'~10 ms → ~4 months', text:'A whole school term.'},
      {title:'California ↔ Netherlands round trip', tag:'~150 ms → ~4.8 years', text:'An undergraduate degree — for one network round trip.'}
    ]},
    deep:`<p>The classic list comes from Jeff Dean’s talks at Google (circa 2009–2010) and Peter Norvig’s essay “Teach Yourself Programming in Ten Years”. Hardware has improved — NVMe SSDs and faster networks have shrunk some numbers several-fold — but the <b>ratios and the physics</b> still hold, and those are what drive design.</p><p>Useful derived rules: <b>1 Gbps ≈ 125 MB/s</b>; sending 1 KB over 1 Gbps takes ~8 µs of wire time. <b>Mumbai ↔ Delhi</b> is ~1,150 km in a straight line, so even perfect fibre needs ≥ ~6 ms one way (≥ ~12 ms round trip); real routes are longer. <b>India ↔ US East</b> is ~12,500 km: a physics floor near ~125 ms round trip, with real paths typically closer to ~200 ms. No amount of code optimisation beats that — only moving data or compute closer (CDNs, regional replicas) does.</p>`
  },
  tradeoffs:{use:[`Napkin maths in design reviews: does this fit the latency budget?`, `Deciding where data should live: RAM, SSD, same zone, other region`], avoid:[`Treating exact values as precise — hardware varies 2–10×`, `Shaving nanoseconds when one network round trip dwarfs them`], alt:[`Benchmark on your real hardware (profilers, fio, iperf)`, `Use production p99 telemetry, not folklore`]},
  real:[
    {co:'Google', tier:'confirmed', text:'Jeff Dean’s “numbers everyone should know” became a standard tool for reasoning about designs before building them.', src:'Jeff Dean, “Designs, Lessons and Advice from Building Large Distributed Systems” (LADIS 2009 keynote)'},
    {co:'Netflix Open Connect', tier:'confirmed', text:'Netflix places its own cache appliances inside or next to ISP networks so video bytes travel a short distance instead of crossing the internet.', src:'Netflix Open Connect documentation'},
    {co:'Redis', tier:'confirmed', text:'Keeps the dataset in memory, which is why typical operations complete well under a millisecond — dominated by the network round trip, not the lookup.', src:'Redis documentation'}
  ],
  mistakes:[`N+1 network calls in a loop`, `Cross-region calls on the hot request path`, `Random disk I/O where an append-only/sequential design would do`],
  interview:[`Quote orders of magnitude confidently: memory ~100 ns, SSD ~100 µs, same-DC RTT ~0.5 ms, cross-continent ~100+ ms`, `Use them to justify caches, CDNs, batching and data locality`],
  tryit:{note:'Explore the numbers on a log scale, switch to “human time”, and compare any two operations.', pg:'latency-chart'},
  sources:[`Jeff Dean, LADIS 2009 keynote`, `Peter Norvig, “Teach Yourself Programming in Ten Years”`]
},
{
  id:'back-of-envelope', title:'Back-of-envelope estimation', minutes:10, tags:['estimation','QPS','storage','bandwidth','80/20'],
  summary:'Users → requests/day → QPS (avg and peak) → storage → bandwidth → cache size. Round hard, state assumptions, then decide something.',
  problem:`<p>“Should we shard the database?” depends entirely on whether you write <strong>50 rows a second or 50,000</strong>. Ten minutes of arithmetic can save months of building the wrong thing.</p>`,
  intuition:`Planning food for a wedding: 500 guests × 3 rotis × 1.2 buffer = 1,800 rotis. You don’t count grains of flour. You round, multiply, add a buffer for the hungry uncles, and sanity-check against the last wedding.`,
  how:{
    steps:[`Start from <b>daily active users</b> (DAU).`, `Actions per user per day → requests per day. Divide by <b>86,400 s ≈ 10⁵</b> → <b>average QPS</b>.`, `<b>Peak QPS</b> = average × peak factor (2–10× daily; far more for events like Tatkal or an IPL final).`, `Split by <b>read:write ratio</b>.`, `<b>Storage</b> = writes/day × size × retention × replication (+ indexes).`, `<b>Bandwidth</b> = QPS × response size.`, `<b>Cache</b> ≈ 20% of a day’s read data (the 80/20 rule: ~20% of items get ~80% of traffic).`, `Round aggressively, write assumptions down, sanity-check, and <b>use the result to decide</b>.`],
    stepper:{title:'Worked example: a UPI-scale payment switch (illustrative)', dwell:3400, items:[
      {title:'Monthly volume', tag:'assumption', text:'Assume <b>15 billion</b> transactions per month (NPCI publishes the real monthly figures; we round for the maths).'},
      {title:'Per day', tag:'÷ 30', text:'15B ÷ 30 ≈ <b>500 million transactions/day</b>.'},
      {title:'Average TPS', tag:'÷ 86,400', text:'500M ÷ 86,400 ≈ <b>~5,800 transactions/second</b> on average.'},
      {title:'Peak TPS', tag:'× 3', text:'Evenings, salary days and festivals: assume ×3 → <b>~17,000 TPS peak</b>. Design (and load test) for that, plus headroom.'},
      {title:'Fan-out per transaction', tag:'× hops', text:'Each payment touches the payer app’s provider, the central switch, the payer bank and the payee bank — so <b>each hop</b> must sustain the peak.'},
      {title:'Storage', tag:'× 1 KB', text:'~1 KB per record × 500M/day ≈ <b>500 GB/day</b>, ~180 TB/year before replication — and regulations demand long retention.'},
      {title:'Decision', tag:'so what?', text:'Tens of thousands of strongly consistent writes/s with long retention → partitioned ledgers, idempotent APIs and tiered storage. The numbers chose the architecture.'}
    ]},
    html:`<p>A second, classic example — a URL shortener:</p>${h.math(`Assumptions (illustrative): 100M new short URLs/month, 100:1 read:write, 500 B/record, keep 5 years
Writes/s   = 100M ÷ (30 × 86,400)       ≈ 40/s       (peak ×5 ≈ 200/s)
Reads/s    = 40 × 100                    ≈ 4,000/s    (peak ≈ 20,000/s)
Storage    = 100M × 12 × 5 × 500 B       ≈ 3 TB       (× 3 replicas ≈ 9 TB)
Egress     = 4,000/s × 500 B             ≈ 2 MB/s
Cache      = 20% × (4,000 × 86,400) × 500 B ≈ 35 GB  → fits in one large Redis node
Verdict    : one primary DB + replicas + cache is plenty. No sharding on day 1.`)}`,
    deep:`<p><b>Numbers to memorise:</b> 1 day ≈ 86,400 s ≈ 10⁵ s; 1 month ≈ 2.6 M s; 1 year ≈ 31.5 M s (≈ π × 10⁷). 2¹⁰ ≈ 10³ (KB), 2²⁰ ≈ 10⁶ (MB), 2³⁰ ≈ 10⁹ (GB), 2⁴⁰ ≈ 10¹² (TB). 1 Gbps ≈ 125 MB/s — watch bits vs bytes (×8).</p><p><b>Little’s Law</b> sizes concurrency: in-flight requests = throughput × latency. 20,000 req/s × 50 ms = 1,000 concurrent requests, which tells you thread-pool and connection-pool sizes.</p><p><b>Capacity per box</b> is something you must measure (load test), but rough priors help: a modern app server handles hundreds to a few thousand simple requests/s; a single well-tuned relational primary handles thousands to tens of thousands of simple queries/s depending on query shape and hardware. Storage overheads: indexes often add 30–100%; replication ×3; backups extra.</p>`
  },
  tradeoffs:{use:[`Early — to choose between one database vs sharding, one region vs many`, `Capacity planning and cloud cost estimates`], avoid:[`False precision: three significant figures on a guess`, `Estimating for the average when the business has hard spikes`], alt:[`Load testing (k6, Gatling, Locust) for real per-box capacity`, `Production telemetry and growth trends`]},
  real:[
    {co:'NPCI (UPI)', tier:'confirmed', text:'NPCI publishes monthly UPI transaction volumes and values — a great public dataset for practising estimation; volumes are in the billions per month.', src:'NPCI UPI product statistics (npci.org.in)'},
    {co:'Twitter', tier:'confirmed', text:'Reported an average of roughly 5,700 Tweets per second in 2013, with a record peak of 143,199 Tweets per second during a TV broadcast in Japan — a ~25× spike over average.', src:'Twitter Engineering, “New Tweets per second record, and how!” (2013)'},
    {co:'Disney+ Hotstar', tier:'confirmed', text:'Reported 25.3 million concurrent viewers during the 2019 Cricket World Cup India–New Zealand semi-final — the kind of event peak that sizes everything else.', src:'Hotstar public announcements (July 2019)'}
  ],
  mistakes:[`Forgetting the peak factor`, `Mixing bits and bytes (Gbps vs GB/s differ by 8×)`, `Forgetting replication and indexes in storage`, `Never using the estimate to make a decision`],
  interview:[`Say: “Let me do quick maths to see whether one machine is enough” — then decide`, `Use round numbers: 1 day ≈ 100K seconds; show your work`],
  tryit:{note:'Pick a preset or move the sliders. Every number and formula updates live.', pg:'envelope'},
  sources:[`NPCI UPI statistics`, `Twitter Engineering blog (2013)`, `Alex Xu, “System Design Interview” — back-of-the-envelope chapter`]
},
{
  id:'vertical-vs-horizontal', title:'Vertical vs horizontal scaling', minutes:8, tags:['scaling','scale up','scale out','stateless'],
  summary:'Scale up: a bigger box (simple, has a ceiling, single point of failure). Scale out: more boxes (needs stateless design, near-limitless).',
  problem:`<p>A sale like Flipkart’s Big Billion Days multiplies traffic overnight. You can buy a <strong>bigger machine</strong> (scale up) or <strong>more machines</strong> (scale out). One gets expensive and hits a ceiling; the other only works if your app was designed for it.</p>`,
  intuition:`A dhaba getting busier. Hire one superstar chef who cooks twice as fast (vertical): easy, but there’s a limit to how fast a human can cook — and if they fall sick, the dhaba shuts. Or hire five ordinary cooks (horizontal): you need a head cook to split orders and a shared recipe book, but you can keep hiring, and one sick cook doesn’t close the shop.`,
  how:{
    steps:[`<b>Vertical:</b> more CPU, RAM or faster disks on one machine. No code change, but there is a largest machine, cost climbs, and it remains a single point of failure.`, `<b>Horizontal:</b> many identical servers behind a load balancer. Near-linear growth for stateless tiers, plus redundancy.`, `Horizontal needs <b>stateless</b> servers: sessions and files move to shared stores (Redis, object storage, the database).`, `The <b>data tier</b> is the hard part: replicas for reads, then partitioning (sharding) for writes.`, `Common path: app tier scales out from day one; the database scales up as long as it reasonably can.`],
    diagram:{title:'Scale up, hit the ceiling, scale out', w:760, h:290, alt:'One server is upgraded, saturates again, then a load balancer and more servers are added; one server dies and traffic routes around it.',
      nodes:[{id:'c', type:'client', label:'Users', x:70, y:145}, {id:'lb', type:'lb', label:'Load balancer', x:215, y:145, hidden:true}, {id:'s1', type:'service', label:'Server 1', sub:'4 vCPU', x:395, y:145}, {id:'s2', type:'service', label:'Server 2', sub:'8 vCPU', x:395, y:50, hidden:true}, {id:'s3', type:'service', label:'Server 3', sub:'8 vCPU', x:395, y:240, hidden:true}, {id:'db', type:'db', label:'Database', x:630, y:145}],
      edges:[{from:'c', to:'s1'}, {from:'c', to:'lb', hidden:true}, {from:'lb', to:'s1'}, {from:'lb', to:'s2'}, {from:'lb', to:'s3'}, {from:'s1', to:'db'}, {from:'s2', to:'db'}, {from:'s3', to:'db'}],
      steps:[
        {note:'One 4-vCPU server comfortably handles today’s traffic.', flow:[['c', 's1', 'req'], ['s1', 'db'], ['db', 's1'], ['s1', 'c']], hl:['s1']},
        {note:'Traffic triples. CPU at 95%, latency climbing.', status:{s1:'hot'}, flow:[['c', 's1', 'req'], ['c', 's1', 'req'], ['c', 's1', 'req']], parallel:true, hl:['s1']},
        {note:'<b>Scale up:</b> move to a 64-vCPU machine. No code change — but it costs far more, needed a restart, and is still one box.', status:{s1:'ok'}, sub:{s1:'64 vCPU'}, hl:['s1']},
        {note:'Another 10× spike. There is no bigger machine to buy — and if this one dies, everything is down.', status:{s1:'hot'}, flow:[['c', 's1'], ['c', 's1'], ['c', 's1']], parallel:true},
        {note:'<b>Scale out:</b> a load balancer spreads traffic over many identical, stateless servers. Add more whenever you need.', reveal:['lb', 's2', 's3'], hideEdges:[['c', 's1']], showEdges:[['c', 'lb']], status:{s1:'ok'}, sub:{s1:'8 vCPU'}, flow:[['c', 'lb'], ['lb', 's2'], ['s2', 'db']], hl:['lb']},
        {note:'Server 2 crashes. Health checks notice and the load balancer routes around it; users barely notice.', status:{s2:'down'}, flow:[['c', 'lb'], ['lb', 's3'], ['s3', 'db']], hl:['s3']}
      ]},
    deep:`<p>Scaling is never perfectly linear. <b>Amdahl’s law</b> caps speed-up by the serial fraction of work, and Neil Gunther’s <b>Universal Scalability Law</b> adds a coherency term: at some point, adding nodes makes throughput go <em>down</em> because they spend time coordinating (locks, cache invalidation, consensus).</p><p>Practical pattern: keep the request tier stateless and autoscaled; scale the database vertically, add read replicas and caching, and only then partition. <b>Cell-based architecture</b> scales out whole stacks (“cells”), each serving a slice of users, which also limits blast radius. Vertical has gone a long way in the cloud — instances with hundreds of vCPUs and terabytes of RAM exist — so the right question is often “how long can we stay simple?”</p>`
  },
  tradeoffs:{use:[`<b>Vertical:</b> early stage; relational write primaries; when operational simplicity matters most`, `<b>Horizontal:</b> stateless web/API tiers; high availability; unpredictable growth`], avoid:[`Vertical as your only availability plan`, `Horizontal for a stateful tier without a data-partitioning plan`], alt:[`Cache and optimise queries before scaling either way`, `Read replicas, then sharding for the data tier`, `Serverless: automatic scale-out and scale-to-zero`]},
  real:[
    {co:'Stack Overflow', tier:'confirmed', text:'Scaled largely vertically: a small number of powerful SQL Server and web servers, carefully tuned, served enormous traffic.', src:'Nick Craver, “Stack Overflow: The Architecture – 2016 Edition”'},
    {co:'WhatsApp', tier:'confirmed', text:'In early 2012 its engineers reported holding over 2 million concurrent TCP connections on a single server, using Erlang on FreeBSD — extreme vertical efficiency before scaling out.', src:'WhatsApp blog, “1 million is so 2011” (January 2012)'},
    {co:'Disney+ Hotstar', tier:'confirmed', text:'Engineers have described scaling out horizontally for live cricket and pre-provisioning capacity ahead of big matches, because reactive autoscaling is too slow for sudden, massive spikes.', src:'Hotstar engineering talk, “Scaling hotstar.com for 25 million concurrent viewers” (2019)'}
  ],
  mistakes:[`Adding servers while sessions still live in server memory`, `Scaling the app tier when the single database is the real bottleneck`, `Forgetting that scale-out needs a load balancer, health checks and automated deploys`],
  interview:[`Default: stateless services scale out; the database is the hard part — discuss replicas, caching, sharding`, `Mention the vertical ceiling and the single point of failure explicitly`],
  tryit:{note:'Move the traffic slider. Compare cost, capacity and blast radius of one big box vs many small ones.', mount:host => scaleCalc(host)},
  sources:[`Nick Craver, Stack Overflow architecture posts (2016)`, `WhatsApp blog (2012)`, `Neil Gunther, Universal Scalability Law`]
},
{
  id:'latency-vs-throughput', title:'Latency vs throughput (and why queues explode)', minutes:9, tags:['latency','throughput','queueing','Little’s law','utilization'],
  summary:'Latency is how long one request takes; throughput is how many finish per second. Near full utilisation, waiting time explodes.',
  problem:`<p>Your payment API answers in 50 ms at 1,000 req/s. A cashback campaign pushes traffic to 1,900 req/s on servers rated for 2,000. Latency jumps to <strong>2 seconds</strong> and requests time out — even though you are technically “under capacity”. Why?</p>`,
  intuition:`A toll plaza. Latency is how long one car takes to get through; throughput is cars per minute across all booths. Adding booths raises throughput without making any single car faster. And when cars arrive almost as fast as the booths can serve them, the <em>queue</em> — not the booth — becomes the delay. That’s why toll lanes jam on festival weekends.`,
  how:{
    steps:[`<b>Latency:</b> time for one request (ms). <b>Throughput:</b> completed requests per second. <b>Bandwidth:</b> the maximum a link can carry; throughput is what you actually achieve.`, `<b>Utilisation</b> ρ = arrival rate ÷ capacity.`, `For a simple queue, average time in system = service time ÷ (1 − ρ). At 50% busy you wait 2× the work; at 90% you wait 10×; at 99%, 100×.`, `<b>Little’s Law:</b> requests in flight = throughput × latency. Use it to size thread and connection pools.`, `Keep headroom: plan for ~60–70% utilisation at peak.`, `<b>Batching</b> raises throughput but adds latency; <b>parallelism</b> raises throughput; <b>caching</b> cuts both.`],
    mount:(host, api) => queueCurve(host, api),
    deep:`<p>The curve above is the <b>M/M/1</b> queue: Poisson arrivals at rate λ, exponential service at rate μ, one server. ρ = λ/μ, mean number in system L = ρ/(1−ρ), mean time W = 1/(μ−λ). With <b>c</b> servers sharing one queue (M/M/c) waiting drops sharply — one shared line for many counters beats a separate line per counter.</p><p>Measuring this correctly is hard: closed-loop load generators wait for each response before sending the next request, hiding queueing delay — Gil Tene calls this <b>coordinated omission</b>. Use open-loop generators that send at a fixed rate.</p><p>Throughput/latency knobs in practice: Kafka producers batch with <code>batch.size</code> and <code>linger.ms</code>; databases use group commit; TCP’s Nagle algorithm batches small writes (often disabled with <code>TCP_NODELAY</code> for latency-sensitive traffic). <b>Bandwidth-delay product</b> = bandwidth × RTT = the data that must be “in flight” to fill a long, fat pipe.</p>`
  },
  tradeoffs:{use:[`<b>Optimise latency</b> on interactive paths: search, checkout, chat`, `<b>Optimise throughput</b> for batch, analytics, log ingestion, video transcoding`], avoid:[`Running servers near 100% utilisation at peak`, `Batching on the interactive path without a time cap`], alt:[`Queues to decouple user latency from background throughput`, `Load shedding and backpressure when over capacity (Module 9)`]},
  real:[
    {co:'Google', tier:'confirmed', text:'Experiments injecting 100–400 ms of extra delay into search results measurably reduced the number of searches users performed — latency costs engagement.', src:'Jake Brutlag, “Speed Matters for Google Web Search” (Google, 2009)'},
    {co:'Apache Kafka', tier:'confirmed', text:'Producers batch records per partition; <code>linger.ms</code> deliberately waits a few milliseconds to fill batches, trading a little latency for much higher throughput.', src:'Apache Kafka producer configuration docs'},
    {co:'Any payment API', tier:'educational', text:'At 95% utilisation, a service with 10 ms of work averages ~200 ms per request — the cashback-campaign mystery. Adding 30% headroom fixes it more cheaply than any code change.', src:'Queueing theory (M/M/1)'}
  ],
  mistakes:[`Assuming latency stays flat until 100% utilisation`, `Load testing with a closed loop that hides queueing (coordinated omission)`, `Reporting only average latency`],
  interview:[`Mention Little’s Law to size pools: concurrency = RPS × latency`, `Explain the hockey-stick curve and why you keep ~30% headroom at peak`],
  tryit:{note:'A real discrete-event simulation: requests arrive randomly, servers take ~10 ms each. Push the arrival rate toward capacity and watch the queue and p99 explode.', mount:(host, api) => queueSim(host, api)},
  sources:[`Leonard Kleinrock, “Queueing Systems” (M/M/1, M/M/c)`, `Gil Tene, “How NOT to Measure Latency” (talk)`, `Google, “Speed Matters” (2009)`]
},
{
  id:'percentiles-tail-latency', title:'p50, p95, p99 and tail latency', minutes:9, tags:['p99','percentiles','tail latency','fan-out','hedged requests'],
  summary:'Averages hide pain. p99 tells you how bad it gets for the unlucky 1% — and with fan-out, almost everyone is unlucky.',
  problem:`<p>Your dashboard says <strong>average latency: 80 ms</strong>. Support tickets say checkout takes 4 seconds. Averages hide the slow requests — and when one page calls dozens of backends, nearly every user eventually hits one.</p>`,
  intuition:`Metro trains: the average wait may be 3 minutes, but if 1 wait in 100 is 25 minutes, a daily commuter hits it a few times a month — and that’s what they remember. p99 is “how bad it gets for the unlucky 1%”.`,
  how:{
    steps:[`Sort all request latencies. <b>p50</b> (median): half are faster. <b>p95</b>: 95% are faster. <b>p99</b>: 99% are faster.`, `Use p50 for typical experience; p99/p99.9 for the tail that drives complaints and timeouts.`, `Never average percentiles across servers — merge histograms instead.`, `<b>Fan-out amplifies tails:</b> if a page calls 100 backends in parallel and each is slow 1% of the time, P(at least one slow) = 1 − 0.99¹⁰⁰ ≈ <b>63%</b>.`, `Fixes: fewer fan-out calls, timeouts, <b>hedged requests</b> (send a backup after the p95 delay), better load balancing, removing GC pauses and noisy neighbours.`],
    diagram:{title:'Fan-out: the page waits for the slowest backend', w:760, h:300, alt:'An aggregator calls five backends in parallel; four reply quickly, one is slow, so the whole page is slow.',
      nodes:[{id:'u', type:'client', label:'User', x:70, y:150}, {id:'ag', type:'service', label:'Page aggregator', x:250, y:150, w:140}, {id:'b1', type:'service', label:'Profile', x:520, y:35, w:110}, {id:'b2', type:'service', label:'Cart', x:520, y:95, w:110}, {id:'b3', type:'service', label:'Offers', x:520, y:155, w:110}, {id:'b4', type:'service', label:'Reviews', x:520, y:215, w:110}, {id:'b5', type:'service', label:'Recs', x:520, y:272, w:110}],
      edges:[{from:'u', to:'ag'}, {from:'ag', to:'b1'}, {from:'ag', to:'b2'}, {from:'ag', to:'b3'}, {from:'ag', to:'b4'}, {from:'ag', to:'b5'}],
      steps:[
        {note:'The page request arrives at an aggregator.', flow:[['u', 'ag', 'GET /home']], hl:['ag']},
        {note:'It calls five backends <b>in parallel</b>.', flow:[['ag', 'b1'], ['ag', 'b2'], ['ag', 'b3'], ['ag', 'b4'], ['ag', 'b5']], parallel:true},
        {note:'Four reply in ~20 ms…', flow:[['b1', 'ag', '20ms'], ['b2', 'ag'], ['b3', 'ag'], ['b4', 'ag']], parallel:true, dur:600},
        {note:'…but “Recs” hit a garbage-collection pause and takes 400 ms. The <b>whole page</b> waits for it.', status:{b5:'hot'}, flow:[['b5', 'ag', '400ms']], dur:2600, hl:['b5']},
        {note:'The user sees 400 ms, not 20. Page latency ≈ the <b>maximum</b> of its backends — that is why tails matter.', flow:[['ag', 'u', '200 (slow)']], hl:['u']}
      ]},
    deep:`<p><b>Computing percentiles at scale:</b> storing every sample is too expensive, so systems record histograms — HdrHistogram (Gil Tene), t-digest (Ted Dunning), or Prometheus histogram buckets queried with <code>histogram_quantile()</code>. Histograms can be merged across hosts; percentiles cannot be averaged.</p><p><b>Tail-tolerance techniques</b> from Google’s “The Tail at Scale”: <i>hedged requests</i> (send a second copy after a short delay, take whichever returns first), <i>tied requests</i> (enqueue on two servers and cancel the loser), micro-partitioning and selective replication of hot items. The paper reports a benchmark where hedging after a 10 ms delay cut the 99.9th-percentile latency of reading 1,000 keys spread over 100 servers from 1,800 ms to 74 ms, while sending only about 2% more requests.</p>`
  },
  tradeoffs:{use:[`p99/p99.9 for user-facing SLOs and for services that are fanned out to`, `p50 for typical experience and capacity trends`], avoid:[`Averages for latency SLOs`, `Averaging percentiles across hosts`, `Hedging non-idempotent writes`], alt:[`Full histograms or latency heatmaps`, `Apdex-style satisfaction scores`, `Per-endpoint percentiles rather than one global number`]},
  real:[
    {co:'Google', tier:'confirmed', text:'“The Tail at Scale” explains why large fan-out services must be tail-tolerant and introduces hedged and tied requests.', src:'Jeffrey Dean & Luiz André Barroso, “The Tail at Scale”, Communications of the ACM (2013)'},
    {co:'Amazon', tier:'confirmed', text:'The Dynamo paper gives an example SLA of a service responding within 300 ms for 99.9% of requests at a peak load of 500 requests per second — measuring at the 99.9th percentile, not the mean.', src:'DeCandia et al., “Dynamo”, SOSP 2007'}
  ],
  mistakes:[`Reporting the average and calling it “latency”`, `Ignoring that fan-out turns rare slowness into common slowness`, `Retrying immediately without timeouts — adding load exactly when the system is slow`],
  interview:[`When given a latency target, ask: “At which percentile?”`, `Explain fan-out amplification with 1 − 0.99ᴺ and propose hedging or reducing fan-out`],
  tryit:{note:'Simulate thousands of requests. Increase fan-out and tail heaviness, then switch on hedged requests.', pg:'tail-latency'},
  sources:[`Dean & Barroso, “The Tail at Scale”, CACM 2013`, `DeCandia et al., “Dynamo”, SOSP 2007`, `HdrHistogram project`]
},
{
  id:'availability-nines', title:'Availability and the “nines”', minutes:9, tags:['availability','nines','redundancy','MTTR'],
  summary:'Each nine is 10× less downtime. Dependencies in series multiply risk; redundant copies in parallel cancel it — if failures are independent.',
  problem:`<p>The CEO asks for “100% uptime”. Your checkout goes through a load balancer, app servers, a database and a payment gateway — each <strong>99.9%</strong> available. Chained together, the whole is <em>less</em> available than any single part. How available is it really, and what would “five nines” cost?</p>`,
  intuition:`Fairy lights wired in series: if any bulb fails, the whole string goes dark, and more bulbs mean more ways to fail. Wire bulbs in parallel and one dead bulb doesn’t matter. Systems behave the same: dependencies in series multiply risk; redundant copies in parallel cancel it.`,
  how:{
    steps:[`Availability = uptime ÷ total time (or successful requests ÷ total requests).`, `Each nine is 10× less downtime: <b>99%</b> ≈ 3.65 days/yr · <b>99.9%</b> ≈ 8.76 h · <b>99.99%</b> ≈ 52.6 min · <b>99.999%</b> ≈ 5.26 min.`, `<b>Series</b> (all must work): A = A₁ × A₂ × A₃ … Three 99.9% parts ≈ 99.7% ≈ 26 h/yr down.`, `<b>Parallel</b> (any one works): A = 1 − (1−A₁)(1−A₂)… Two 99.9% replicas ≈ 99.9999%.`, `Redundancy only helps when failures are <b>independent</b> — different machines, racks, zones, regions, configs.`, `A = MTBF ÷ (MTBF + MTTR): recovering faster is often cheaper than failing less.`],
    diagram:{title:'Series vs parallel', w:760, h:280, alt:'A request chain through load balancer, app and database; adding a second app server and a standby database raises availability.',
      nodes:[{id:'c', type:'client', label:'Users', x:70, y:130}, {id:'lb', type:'lb', label:'LB', sub:'99.99%', x:220, y:130, w:110}, {id:'a1', type:'service', label:'App 1', sub:'99.9%', x:400, y:80, w:110}, {id:'a2', type:'service', label:'App 2', sub:'99.9%', x:400, y:190, w:110, hidden:true}, {id:'db', type:'db', label:'DB primary', sub:'99.95%', x:600, y:80}, {id:'db2', type:'db', label:'DB standby', sub:'auto-failover', x:600, y:200, hidden:true}],
      edges:[{from:'c', to:'lb'}, {from:'lb', to:'a1'}, {from:'lb', to:'a2'}, {from:'a1', to:'db'}, {from:'a2', to:'db'}, {from:'db', to:'db2', dashed:true, label:'replicate'}],
      steps:[
        {note:'<b>Series chain:</b> 99.99% × 99.9% × 99.95% ≈ <b>99.84%</b> ≈ 14 hours of downtime a year.', flow:[['c', 'lb'], ['lb', 'a1'], ['a1', 'db']], hl:['lb', 'a1', 'db']},
        {note:'Add a second app server in parallel: app tier = 1 − 0.001² ≈ <b>99.9999%</b>.', reveal:['a2'], flow:[['c', 'lb'], ['lb', 'a2'], ['a2', 'db']], hl:['a2']},
        {note:'App 1 dies — traffic shifts to App 2. Users don’t notice.', status:{a1:'down'}, flow:[['c', 'lb'], ['lb', 'a2'], ['a2', 'db']]},
        {note:'But the database is still a single box: it now caps the whole system at ~99.94%.', status:{a1:'ok', db:'hot'}, hl:['db']},
        {note:'Add a standby with automatic failover. Now the weakest link is whatever you haven’t made redundant yet — keep walking the chain.', reveal:['db2'], status:{db:'ok'}, flow:[['db', 'db2', 'WAL']], hl:['db2']}
      ]},
    deep:`<p><b>Measure what users feel.</b> Google’s SRE book recommends request-based availability (successful requests ÷ valid requests) for services, because a server can be “up” while returning errors.</p><p><b>Dependencies cap you.</b> In series, you can’t be more available than your critical hard dependencies combined. Google’s “The Calculus of Service Availability” (ACM Queue, 2017) argues critical dependencies should be designed to be roughly an order of magnitude more available than the service that relies on them — or you must turn them into soft dependencies with fallbacks.</p><p><b>Durability ≠ availability:</b> Amazon S3 Standard is designed for 99.999999999% durability (data not lost) but 99.99% availability (data reachable). <b>Correlated failure</b> is the enemy of the parallel formula: two replicas behind one power feed, one config push or one region are not independent.</p>`
  },
  tradeoffs:{use:[`Per-journey targets: checkout ≠ recommendations`, `Redundancy for hard dependencies on the critical path`], avoid:[`Promising more nines than your dependencies (cloud region, payment gateway) provide`, `Chasing 99.999% when users can’t tell it from 99.95% — each nine costs much more`], alt:[`Graceful degradation (serve cached or default results)`, `Lower MTTR via automation and fast rollback`, `Multi-zone before multi-region`]},
  real:[
    {co:'Amazon S3', tier:'confirmed', text:'S3 Standard is designed for 99.99% availability and 99.999999999% (11 nines) durability, while the S3 SLA commits to 99.9% monthly uptime — design target, durability and contract are three different numbers.', src:'AWS S3 product documentation and S3 SLA'},
    {co:'Google', tier:'confirmed', text:'“The Calculus of Service Availability” shows how dependency availability bounds your own and how to reason about adding nines.', src:'Treynor, Dahlin, Rau & Beyer, ACM Queue (2017)'},
    {co:'NPCI (UPI)', tier:'confirmed', text:'NPCI publishes bank-wise UPI performance data including technical-decline percentages — a public, request-based availability metric for each bank in the chain.', src:'NPCI UPI ecosystem statistics'}
  ],
  mistakes:[`Forgetting that series availability multiplies`, `“Redundant” copies that share a power feed, zone, config or region`, `Counting server uptime instead of user-visible success`, `Ignoring MTTR — slow recovery dominates downtime`],
  interview:[`Quick maths: three 99.9% dependencies in series ≈ 99.7%`, `Explain the cost curve of each extra nine and propose per-feature targets`],
  tryit:{note:'Convert nines to downtime, build a system tier by tier, add replicas, and simulate a year.', pg:'nines'},
  sources:[`Google, “Site Reliability Engineering” (2016), chapters on availability and SLOs`, `Treynor et al., “The Calculus of Service Availability”, ACM Queue 2017`, `AWS S3 SLA`]
},
{
  id:'sli-slo-sla', title:'SLI, SLO, SLA and error budgets', minutes:9, tags:['SLI','SLO','SLA','error budget','burn rate'],
  summary:'SLI = the measurement. SLO = the target. SLA = the contract. Error budget = how much failure you can “spend” on shipping fast.',
  problem:`<p>Product wants to ship features weekly; the reliability team wants to freeze deploys after two outages last week. Who is right? Without an agreed, measured reliability target, it’s opinion against opinion.</p>`,
  intuition:`A pizza chain. SLI: minutes from order to doorstep (the measurement). SLO: 95% of pizzas within 30 minutes (the internal target). SLA: “more than 30 minutes late and it’s free” (the promise with a penalty). The kitchen keeps the SLO stricter than the SLA so it notices trouble before paying for it.`,
  how:{
    stepper:{title:'From measurement to decisions', items:[
      {title:'SLI', tag:'measure', text:'A ratio of good events to valid events, measured close to the user. Example: requests answered in &lt; 300 ms <i>and</i> not 5xx, divided by all valid requests.'},
      {title:'SLO', tag:'target', text:'A target for the SLI over a window: <b>99.9% over 30 days</b>. Internal, and chosen so users stay happy.'},
      {title:'SLA', tag:'contract', text:'An external promise with consequences (service credits, refunds). Usually <b>looser</b> than the SLO, e.g. 99.5%, so you breach the SLO first.'},
      {title:'Error budget', tag:'1 − SLO', text:'At 99.9% over 30 days you may fail 0.1% of requests — ≈ <b>43 minutes</b> of total downtime. It is a budget to <em>spend</em> on releases and experiments.'},
      {title:'Burn rate', tag:'alerting', text:'How fast you spend the budget: error rate ÷ (1 − SLO). Burn 1× = you’ll use exactly 100% by the end of the window. Alert on fast burns, not on every blip.'},
      {title:'Policy', tag:'decide', text:'Budget left → ship faster. Budget burning too fast → slow down. Budget gone → freeze features; only reliability work ships. Agreed in advance, so nobody argues during an incident.'}
    ]},
    deep:`<p>The Google SRE Workbook recommends <b>multi-window, multi-burn-rate alerts</b> for a 30-day 99.9% SLO: page when 2% of the budget burns in 1 hour (burn rate 14.4) or 5% in 6 hours (burn rate 6); open a ticket when 10% burns in 3 days (burn rate 1). Pair each long window with a short one (e.g. 5 minutes) so alerts stop quickly once the problem is fixed.</p><p>Good SLIs are measured where users are: at the load balancer, or with real-user monitoring in the client. Latency SLIs are expressed as thresholds (“&lt; 300 ms”) so they can be counted as good/bad events. Rolling windows (last 30 days) avoid the “reset on the 1st of the month” behaviour of calendar windows.</p>`
  },
  tradeoffs:{use:[`Any service other teams or customers depend on`, `To balance velocity vs reliability with data instead of opinions`], avoid:[`100% SLOs — they leave no room to change anything`, `Dozens of SLOs nobody reads`, `SLIs that don’t reflect user pain (CPU %, memory %)`], alt:[`Simple uptime checks for tiny internal tools`, `Apdex scores`, `Incident counts (lagging and coarse)`]},
  real:[
    {co:'Google', tier:'confirmed', text:'Introduced the SLO and error-budget practice publicly in the SRE book, including using the remaining budget to decide release velocity.', src:'Beyer et al., “Site Reliability Engineering” (2016) and “The Site Reliability Workbook” (2018)'},
    {co:'AWS', tier:'confirmed', text:'Publishes per-service SLAs with service credits when monthly uptime falls below the commitment (for example, S3’s 99.9% SLA).', src:'AWS service level agreements'},
    {co:'Microsoft Azure', tier:'confirmed', text:'Publishes SLAs per service and explains how composite SLAs multiply when services depend on each other.', src:'Azure SLA documentation'}
  ],
  mistakes:[`Using CPU or memory as SLIs`, `Setting SLA = SLO (no safety margin)`, `An error budget with no policy — nothing happens when it’s spent`, `Paging on every error instead of on burn rate`],
  interview:[`Define the SLI in user terms, then give the SLO number and window`, `Explain how error budgets resolve the speed-vs-stability argument`],
  tryit:{note:'Set an SLO and see the budget, the burn rate and the ship / slow down / freeze decision.', mount:host => budgetCalc(host)},
  sources:[`Google SRE book (2016) and Workbook (2018), “Alerting on SLOs”`, `AWS and Azure SLA documentation`]
},
{
  id:'fault-tolerance-spof', title:'Fault tolerance and single points of failure', minutes:9, tags:['SPOF','fault tolerance','redundancy','failure domain','blast radius'],
  summary:'A SPOF is any one thing whose failure takes everything down. Find them, remove them with independent redundancy, isolate failures, and test it.',
  problem:`<p>9 PM on a sale day. The one Redis box holding every user session runs out of memory and restarts. Everyone is logged out at once; the login service is stampeded; the database falls over next. One small box took down the whole company. It was a <strong>single point of failure</strong>.</p>`,
  intuition:`A wedding with one generator: if it fails, the whole venue goes dark — that generator is the SPOF. Fault tolerance is a second generator with an automatic switch, battery lights on the stage, and caterers who can serve a cold menu if the stoves go out.`,
  how:{
    steps:[`<b>Find SPOFs:</b> walk every box and arrow and ask “if this dies, what happens?” Include the non-obvious: DNS, a config service, an expiring certificate, one NAT gateway, one region, the one person who knows how to deploy.`, `<b>Remove</b> them with redundancy (N+1, N+2), automatic failover and health checks.`, `<b>Isolate</b> failures: timeouts, circuit breakers and bulkheads so one bad dependency can’t drown everything.`, `<b>Degrade gracefully:</b> serve stale or cached data, or a simpler feature, instead of an error page.`, `<b>Test it:</b> kill things on purpose (chaos engineering) — untested failover is a hope, not a plan.`],
    diagram:{title:'A cascading failure — and the fix', w:780, h:290, alt:'A single session store dies, logins stampede the database, then a replica with failover prevents the cascade.',
      nodes:[{id:'u', type:'client', label:'Users', x:70, y:145}, {id:'lb', type:'lb', label:'Load balancer', x:220, y:145}, {id:'a1', type:'service', label:'App 1', x:395, y:85, w:110}, {id:'a2', type:'service', label:'App 2', x:395, y:205, w:110}, {id:'r', type:'cache', label:'Session store', x:600, y:60}, {id:'r2', type:'cache', label:'Session replica', x:600, y:145, hidden:true}, {id:'db', type:'db', label:'Database', x:600, y:240}],
      edges:[{from:'u', to:'lb'}, {from:'lb', to:'a1'}, {from:'lb', to:'a2'}, {from:'a1', to:'r'}, {from:'a2', to:'r'}, {from:'a1', to:'db'}, {from:'a2', to:'db'}, {from:'r', to:'r2', dashed:true}, {from:'a1', to:'r2'}, {from:'a2', to:'r2'}],
      steps:[
        {note:'Normal day: apps check sessions in a single Redis box.', flow:[['u', 'lb'], ['lb', 'a1'], ['a1', 'r', 'session?'], ['r', 'a1', 'ok']], hl:['r']},
        {note:'Redis runs out of memory and restarts. <b>Every session is gone.</b>', status:{r:'down'}, hl:['r']},
        {note:'Millions of users are bounced to log in again at the same moment. Logins hit the database.', flow:[['u', 'lb'], ['lb', 'a1'], ['a1', 'db', 'login'], ['lb', 'a2'], ['a2', 'db', 'login']], hl:['db']},
        {note:'The database saturates; now <em>everything</em> that needs it fails. A small box caused a total outage — a <b>cascading failure</b>.', status:{db:'hot', a1:'hot', a2:'hot'}},
        {note:'<b>Fix:</b> a replicated session store with automatic failover, plus rate-limited logins and a circuit breaker in front of the database.', reveal:['r2'], status:{db:'ok', a1:'ok', a2:'ok'}, flow:[['u', 'lb'], ['lb', 'a2'], ['a2', 'r2', 'session?'], ['r2', 'a2', 'ok']], hl:['r2']}
      ]},
    deep:`<p><b>Fault vs failure:</b> a fault is a component deviating from spec; a failure is the system as a whole no longer providing service. Fault tolerance stops faults from becoming failures.</p><p><b>Failure domains</b> nest: process → host → rack → availability zone → region → cloud provider → your own deploy pipeline and config. Redundancy must cross the domain you are protecting against. <b>Blast radius</b> is how much breaks when one domain fails; <b>cell-based architecture</b> limits it by splitting customers across independent stacks. AWS describes <b>static stability</b>: systems that keep working through an AZ loss without needing to make changes (pre-provisioned capacity rather than reacting under stress).</p><p>Failover introduces new risks — e.g. two nodes both believing they are the leader (split-brain). Leases and fencing tokens (Module 6) handle that.</p>`
  },
  tradeoffs:{use:[`Anything on the critical path of revenue, safety or trust`, `Shared infrastructure many teams depend on (auth, config, DNS)`], avoid:[`Redundancy that shares a hidden dependency`, `Failover that has never been exercised`, `Active-active everything on day one — complexity is also a failure source`], alt:[`Accept and recover fast (low MTTR) for non-critical parts`, `Graceful degradation instead of redundancy`, `Managed services with built-in high availability`]},
  real:[
    {co:'Meta (Facebook)', tier:'confirmed', text:'On 4 October 2021 a command during routine backbone maintenance disconnected Meta’s data centres; its DNS servers then withdrew their BGP routes, making Facebook, Instagram and WhatsApp unreachable for about six hours. Internal tools depended on the same network, slowing recovery.', src:'Engineering at Meta, “More details about the October 4 outage” (2021)'},
    {co:'AWS (us-east-1)', tier:'confirmed', text:'On 7 December 2021 an automated scaling activity triggered unexpected behaviour on AWS’s internal network, impairing many services in one region — a reminder that a region is itself a failure domain.', src:'AWS Post-Event Summary, December 2021'},
    {co:'Netflix', tier:'confirmed', text:'Built Chaos Monkey to randomly terminate production instances so every service is forced to tolerate instance failure; it later released the tool as open source.', src:'Netflix Tech Blog (2011) and the Chaos Monkey repository'}
  ],
  mistakes:[`Two servers in the same rack or zone counted as “redundant”`, `One DNS provider, one certificate, no expiry alerts`, `Failover that needs a human at 3 AM`, `Retries without backoff that amplify the failure`],
  interview:[`Proactively walk your diagram: “If X dies…” for every component`, `Name the failure domain each redundancy protects against: host, zone or region`],
  tryit:{note:'Hunt for SPOFs: click components to kill them, send requests, then reveal which single failures cause an outage.', mount:(host, api) => spofHunter(host, api)},
  sources:[`Engineering at Meta (Oct 2021)`, `AWS Post-Event Summary (Dec 2021)`, `AWS Builders’ Library, “Static stability using Availability Zones”`, `Netflix Tech Blog, “The Netflix Simian Army” (2011)`]
},
{
  id:'monolith-to-microservices', title:'Monolith → modular monolith → microservices', minutes:10, tags:['monolith','microservices','modular monolith','strangler fig','Conway’s law'],
  summary:'Start simple. Enforce module boundaries. Split into independently deployed services only when team size, release cadence or scaling needs demand it.',
  problem:`<p>Your food-delivery startup’s single codebase now has 60 engineers. Every deploy needs 12 teams to coordinate, one bug in coupons takes checkout down, and the build takes 40 minutes. Someone says “let’s do microservices!” Should you? Splitting too early hurts as much as splitting too late.</p>`,
  intuition:`A family business in one shop (monolith): one counter, one cash box — fast at 5 people, chaos at 60. A department store (modular monolith): clear sections and staff under one roof. A street of independent shops (microservices): each opens, renovates and closes on its own schedule — but now you need roads, signboards and a way to pay across shops.`,
  how:{
    steps:[`<b>Monolith:</b> one deployable, in-process calls, one database. Simplest to build, test and run — ideal early.`, `<b>Modular monolith:</b> still one deployable, but strict module boundaries — each module owns its tables and exposes an interface; nobody reaches into another module’s internals.`, `<b>Microservices:</b> independently deployable services, each owning its data, talking over the network (HTTP/gRPC/events). You gain team autonomy and independent scaling…`, `…and pay with distributed-systems problems: partial failures, cross-service consistency (sagas), versioning, tracing and platform cost.`, `Migrate <b>incrementally</b> with the strangler-fig pattern: route one capability at a time to a new service.`],
    diagram:{title:'Three shapes of the same product', w:760, h:300, alt:'A monolith with one database becomes a modular monolith, then separate services with their own databases behind an API gateway.',
      nodes:[{id:'c', type:'client', label:'Apps', x:60, y:150}, {id:'gw', type:'lb', label:'API gateway', x:205, y:150, hidden:true}, {id:'m', type:'service', label:'Monolith', sub:'users · orders · payments', x:400, y:150, w:200, h:60}, {id:'mdb', type:'db', label:'One shared DB', x:640, y:150, w:140}, {id:'su', type:'service', label:'Users svc', x:400, y:55, hidden:true}, {id:'so', type:'service', label:'Orders svc', x:400, y:150, hidden:true}, {id:'sp', type:'service', label:'Payments svc', x:400, y:245, hidden:true}, {id:'du', type:'db', label:'Users DB', x:640, y:55, hidden:true}, {id:'do', type:'db', label:'Orders DB', x:640, y:150, hidden:true}, {id:'dp', type:'db', label:'Payments DB', x:640, y:245, hidden:true}],
      edges:[{from:'c', to:'m'}, {from:'m', to:'mdb'}, {from:'c', to:'gw', hidden:true}, {from:'gw', to:'su'}, {from:'gw', to:'so'}, {from:'so', to:'sp', curve:.25}, {from:'su', to:'du'}, {from:'so', to:'do'}, {from:'sp', to:'dp'}],
      steps:[
        {note:'<b>Monolith:</b> one codebase, one deploy, one database. Function calls are fast and transactions are easy.', flow:[['c', 'm', 'POST /order'], ['m', 'mdb', 'BEGIN…COMMIT'], ['mdb', 'm'], ['m', 'c']], hl:['m']},
        {note:'<b>Modular monolith:</b> same deployable, but enforced module boundaries and module-owned tables. Teams stop stepping on each other.', sub:{m:'[users] [orders] [payments]'}, hl:['m']},
        {note:'<b>Microservices:</b> each capability is its own service with its own database, behind an API gateway.', hide:['m', 'mdb'], hideEdges:[['c', 'm']], reveal:['gw', 'su', 'so', 'sp', 'du', 'do', 'dp'], showEdges:[['c', 'gw']], flow:[['c', 'gw', 'POST /order'], ['gw', 'so'], ['so', 'do', 'INSERT']], hl:['so']},
        {note:'Orders now calls Payments <b>over the network</b>: it can time out, be retried, or half-succeed. You need idempotency and sagas.', flow:[['so', 'sp', 'charge'], ['sp', 'dp'], ['dp', 'sp'], ['sp', 'so', 'ok']], hl:['sp']},
        {note:'Payments is down. Orders must <b>degrade gracefully</b> — e.g. accept the order as “payment pending” and retry later — instead of failing outright.', status:{sp:'down'}, hl:['so']}
      ]},
    deep:`<p><b>Conway’s Law</b> (Melvin Conway, 1968): systems mirror the communication structure of the organisation that builds them. Microservices are as much an org-design decision as a technical one — the “inverse Conway manoeuvre” shapes teams to get the architecture you want.</p><p>Martin Fowler’s <b>MicroservicePrerequisites</b> (2014): rapid provisioning, basic monitoring and rapid application deployment must exist first. Without them you get a <b>distributed monolith</b> — services that must be deployed together and share a database, combining the downsides of both.</p><p><b>Data ownership</b> is the hard line: no shared tables between services. Cross-service workflows use sagas and the outbox pattern (Module 6) instead of distributed transactions. Prefer async events for notifications and sync calls only where the caller truly needs the answer now; keep sync chains shallow because latency adds and availability multiplies down the chain.</p>`
  },
  tradeoffs:{use:[`<b>Microservices:</b> many teams needing independent deploys`, `Parts with very different scaling, reliability or security needs`, `A mature platform: CI/CD, observability, on-call`], avoid:[`Small teams or unclear domain boundaries`, `A shared database across “services” (distributed monolith)`, `Deep synchronous call chains`], alt:[`A modular monolith with enforced boundaries (often the sweet spot)`, `Extract only the 1–2 components that truly need independence`, `Serverless functions for spiky, isolated workloads`]},
  real:[
    {co:'Shopify', tier:'confirmed', text:'Chose to evolve its large Rails monolith into a <b>modular monolith</b> with enforced component boundaries (later open-sourcing the Packwerk tool) rather than a wholesale move to microservices.', src:'Shopify Engineering, “Deconstructing the Monolith” (2019)'},
    {co:'Amazon Prime Video', tier:'confirmed', text:'Moved an audio/video quality-monitoring service from distributed serverless components to a single process, reporting an infrastructure cost reduction of over 90% — architecture should follow the workload.', src:'Prime Video Tech blog (2023)'},
    {co:'Segment', tier:'confirmed', text:'Consolidated over a hundred destination microservices back into a single service after operational overhead outweighed the benefits.', src:'Alexandra Noonan, “Goodbye Microservices: From 100s of problem children to 1 superstar” (Segment, 2018)'},
    {co:'Netflix', tier:'confirmed', text:'Runs a large microservices architecture on AWS, backed by heavy investment in platform tooling for deployment, resilience and observability.', src:'Netflix Tech Blog'}
  ],
  mistakes:[`Splitting by technical layer (a “UI service”, a “DB service”) instead of business capability`, `Sharing one database between services`, `Six-deep synchronous call chains`, `Microservices before CI/CD, monitoring and tracing exist`],
  interview:[`Don’t default to microservices — justify with team size, deploy independence and scaling differences`, `Mention data ownership, sagas for cross-service workflows, and the observability cost`],
  tryit:{note:'Describe your organisation and get a transparent, rule-based recommendation.', mount:host => archAdvisor(host)},
  sources:[`Melvin Conway, “How Do Committees Invent?” (1968)`, `Martin Fowler, “MicroservicePrerequisites” (2014), “MonolithFirst” (2015), “StranglerFigApplication” (2004)`, `Shopify Engineering (2019)`, `Prime Video Tech (2023)`, `Segment (2018)`]
}
];

SDA.register({
  kind:'module', id:'foundations', order:1, level:'beginner', icon:'🧭', title:'Foundations',
  summary:'What system design is, a repeatable approach, requirements, the life of a request, latency and estimation, scaling, percentiles, availability, SLOs, fault tolerance and how architectures evolve.',
  outcomes:['Run the 7-step approach on any design question', 'Estimate QPS, storage, bandwidth and cache size in minutes', 'Explain every hop of a web request and where the time goes', 'Reason about p99, queueing, availability maths and error budgets', 'Find single points of failure and choose between monolith and microservices'],
  lessons,
  quiz:[
    {q:'An app has 10 million daily active users, each making ~20 requests a day. Roughly what is the <b>average</b> QPS?', options:['~230', '~2,300', '~23,000', '~230,000'], answer:1, why:'10M × 20 = 200M requests/day ÷ ~86,400 s ≈ 2,300 req/s. Peak would be a few times higher.'},
    {q:'Three dependencies, each 99.9% available, are called <b>in series</b>. Overall availability is about…', options:['99.9%', '99.99%', '99.7%', '97%'], answer:2, why:'Series multiplies: 0.999³ ≈ 0.997 → ~26 hours of downtime a year.'},
    {q:'Which is a <b>non-functional</b> requirement?', options:['Users can upload a profile photo', 'p99 search latency under 300 ms', 'Users can follow other users', 'Admins can ban accounts'], answer:1, why:'It describes a quality (performance) with a measurable target, not a capability.'},
    {q:'“p99 latency = 400 ms” means…', options:['The average is 400 ms', '99% of requests took 400 ms or less', '1% of requests took 400 ms or less', 'The slowest request took 400 ms'], answer:1, why:'p99 is the value below which 99% of observations fall — the experience of the unlucky 1% starts here.'},
    {q:'A page fans out to 100 backends in parallel; each is slow 1% of the time. Roughly what fraction of page loads hit at least one slow backend?', options:['1%', '10%', '37%', '63%'], answer:3, why:'1 − 0.99¹⁰⁰ ≈ 0.63. Fan-out turns rare slowness into common slowness.'},
    {q:'What is the error budget of a 99.9% SLO over 30 days, expressed as total downtime?', options:['~4 minutes', '~43 minutes', '~7 hours', '~3 days'], answer:1, why:'0.001 × 30 × 24 × 60 ≈ 43.2 minutes.'},
    {q:'Why are stateless app servers easier to scale horizontally?', options:['They use less CPU', 'Any instance can serve any request, so you can add or remove instances freely', 'They don’t need a database', 'They are more secure'], answer:1, why:'Without per-server session state, the load balancer can send any request anywhere and instances are interchangeable.'},
    {q:'How many network round trips does a full TLS 1.3 handshake add (on top of TCP)?', options:['0', '1', '2', '3'], answer:1, why:'TLS 1.3 completes in one round trip (TLS 1.2 needed two). 0-RTT exists only for resumed sessions.'},
    {q:'A page makes 50 <b>sequential</b> calls to a service in another region (~100 ms round trip each). What is the floor on page latency?', options:['~100 ms', '~500 ms', '~5 seconds', '~50 ms'], answer:2, why:'50 × 100 ms = 5 s of pure network waiting. Batch, parallelise or move the data closer.'},
    {q:'A single-server queue does 10 ms of work per request and runs at 95% utilisation. Average time in system is about…', options:['10.5 ms', '50 ms', '200 ms', '950 ms'], answer:2, why:'W = S ÷ (1 − ρ) = 10 ÷ 0.05 = 200 ms. Near saturation, waiting dominates.'},
    {q:'Which team is the best fit for a <b>modular monolith</b> rather than microservices?', options:['400 engineers, clear domains, mature platform', '25 engineers, fuzzy domain boundaries, weekly releases', 'A team needing independent scaling of video transcoding', 'A company with 30 teams deploying 50 times a day'], answer:1, why:'Small-to-medium team with unclear boundaries: enforce module boundaries first; extract services later when needed.'},
    {q:'How do SLA and SLO usually relate?', options:['SLA is stricter than the SLO', 'They are always equal', 'The SLA is looser than the SLO, so you breach the SLO first', 'SLAs are internal, SLOs are external'], answer:2, why:'The internal SLO is stricter, giving a safety margin before contractual penalties.'},
    {type:'scenario', q:'Your startup’s single app server runs at 90% CPU every evening; database CPU is 30%. You have 3 engineers. What do you do this month?', answer:'<ol><li><b>Measure first:</b> profile the hot endpoints and look at p99, not averages. Confirm the app tier is the bottleneck (DB at 30% suggests yes).</li><li><b>Cheap wins:</b> cache hot reads (Redis) and fix N+1 queries.</li><li><b>Scale out the app tier:</b> make it stateless (sessions to Redis, uploads to object storage), put 2–3 instances behind a managed load balancer with health checks.</li><li><b>Autoscale</b> on CPU or request rate, targeting ~60–70% at peak for headroom.</li><li><b>Keep the database simple:</b> one primary with automated backups; add a read replica only when reads warrant it.</li><li><b>Don’t</b> start microservices with 3 engineers — it multiplies ops work without solving the bottleneck.</li></ol>'},
    {type:'scenario', q:'Leadership wants 99.99% availability for checkout, but your payment gateway’s SLA is 99.9%. How do you respond?', answer:'<p>In series you can’t beat your hard dependencies, so checkout capped by a 99.9% gateway can’t reach 99.99%. Options:</p><ul><li><b>Parallel gateways:</b> integrate two independent gateways with automatic failover — if failures are independent, 1 − 0.001² ≈ 99.9999% for that tier.</li><li><b>Make it a soft dependency:</b> accept the order as “payment pending”, retry asynchronously, and confirm by notification; or offer alternative methods (UPI, cash on delivery).</li><li><b>Define the SLI precisely:</b> request-based success of the checkout journey, measured at the edge.</li><li><b>Agree an error budget and policy,</b> and set the SLA looser than the internal SLO.</li></ul>'}
  ],
  flashcards:[
    {front:'The 7 steps', back:'Clarify → Estimate → API → Data model → High-level design → Deep dive → Bottlenecks & trade-offs'},
    {front:'Seconds in a day (approx.)', back:'86,400 ≈ 10⁵'},
    {front:'Average QPS formula', back:'requests/day ÷ 86,400 — then × peak factor'},
    {front:'Main memory vs SSD vs datacenter RTT', back:'~100 ns · ~100 µs · ~0.5 ms'},
    {front:'Light in fibre', back:'≈ 200,000 km/s ≈ 5 µs per km'},
    {front:'99.9% availability = downtime per year?', back:'≈ 8.76 hours (99.99% ≈ 52.6 min; 99.999% ≈ 5.26 min)'},
    {front:'Series vs parallel availability', back:'Series: A₁×A₂×… · Parallel: 1 − (1−A₁)(1−A₂)…'},
    {front:'Fan-out tail formula', back:'P(at least one slow of N) = 1 − (1 − p)ᴺ; 100 calls at 1% → ~63%'},
    {front:'Little’s Law', back:'In-flight requests = throughput × latency (L = λW)'},
    {front:'M/M/1 time in system', back:'W = service time ÷ (1 − utilisation)'},
    {front:'Error budget', back:'1 − SLO. 99.9% over 30 days ≈ 43 minutes'},
    {front:'Burn rate', back:'current error rate ÷ (1 − SLO). 1× = budget exactly used by end of window'},
    {front:'SPOF', back:'Any single component whose failure stops the whole system'},
    {front:'Modular monolith', back:'One deployable with enforced module boundaries and module-owned data'}
  ],
  cheatsheet:[
    {h:'🧭 The 7-step approach', items:['Clarify FRs + NFRs (with numbers)', 'Estimate avg & peak QPS, storage, bandwidth, cache', 'API: endpoints, auth, pagination, idempotency', 'Data model from access patterns', 'High-level design; walk one request end-to-end', 'Deep dive on the 1–2 hardest parts', 'Bottlenecks, SPOFs, failure modes, trade-offs, monitoring']},
    {h:'⏱️ Numbers to remember', items:['1 day ≈ 86,400 s ≈ 10⁵ s; 1 year ≈ 31.5 M s', 'RAM ~100 ns · SSD read ~100 µs · DC RTT ~0.5 ms', 'Cross-continent RTT 100–250 ms; fibre ≈ 5 µs/km', '1 Gbps ≈ 125 MB/s (bits vs bytes ×8)', 'Humans: ~100 ms feels instant; ~1 s keeps flow']},
    {h:'🧮 Estimation formulas', items:['avg QPS = DAU × actions/day ÷ 86,400', 'peak = avg × 2–10 (events: much more)', 'storage = writes/day × size × retention × replicas', 'bandwidth = QPS × response size', 'cache ≈ 20% of daily read volume (80/20)', 'concurrency = QPS × latency (Little’s Law)']},
    {h:'📈 Availability', items:['99% 3.65 d · 99.9% 8.76 h · 99.99% 52.6 min · 99.999% 5.26 min (per year)', 'Series: multiply. Parallel: 1 − Π(1 − Aᵢ)', 'A = MTBF ÷ (MTBF + MTTR)', 'Independence matters: zones/regions/configs', 'Durability ≠ availability']},
    {h:'🎯 SLOs', items:['SLI = good events ÷ valid events', 'SLO = target over a window (99.9% / 30 d)', 'SLA = contract, looser than SLO', 'Budget = 1 − SLO; burn = error rate ÷ budget', 'Page on fast burn (14.4×/1 h, 6×/6 h)']},
    {h:'🐢 Latency & queues', items:['Report p50 / p95 / p99, never only the average', 'Fan-out: 1 − (1 − p)ᴺ', 'W = S ÷ (1 − ρ): keep ρ ≤ ~0.7 at peak', 'Hedged requests tame tails (idempotent reads)', 'Batching ↑ throughput, ↑ latency']},
    {h:'🏗️ Scaling & architecture', items:['Stateless app tier → scale out behind an LB', 'Scale the DB up, then replicas, then shards', 'Remove SPOFs across independent failure domains', 'Monolith → modular monolith → microservices only when needed', 'Microservices need CI/CD, monitoring, tracing first']}
  ],
  glossary:[
    {term:'System design', def:'Deciding the components of a system, their responsibilities, how they communicate and how they behave under load and failure.'},
    {term:'Functional requirement', aka:['functional requirements'], def:'Something the system must do for a user, e.g. “users can book a seat”.'},
    {term:'Non-functional requirement', aka:['non-functional requirements', 'NFR', 'NFRs'], def:'A quality the system must have — latency, availability, consistency, durability, security, cost — ideally with a number.'},
    {term:'Latency', def:'Time taken to complete one operation or request, usually in milliseconds.'},
    {term:'Throughput', def:'Number of operations completed per unit time, e.g. requests per second.'},
    {term:'Bandwidth', def:'Maximum data rate a network link can carry, e.g. 1 Gbps ≈ 125 MB/s.'},
    {term:'QPS', aka:['RPS', 'requests per second', 'queries per second'], def:'Queries (or requests) per second — the standard unit of load.'},
    {term:'DAU', aka:['daily active users'], def:'Daily active users — the usual starting point for load estimation.'},
    {term:'Peak factor', def:'Ratio of peak load to average load; typically 2–10× daily, far higher for events.'},
    {term:'Percentile', aka:['p50', 'p95', 'p99', 'p99.9'], def:'The value below which a given percentage of measurements fall; p99 = 99% of requests were at least this fast.'},
    {term:'Tail latency', def:'The slowest requests (p99 and beyond); dominates user experience in fan-out systems.'},
    {term:'Hedged request', aka:['hedged requests'], def:'Sending a duplicate request after a short delay and using whichever response arrives first, to cut tail latency.'},
    {term:'Availability', def:'Fraction of time (or of requests) a system serves correctly, often expressed in “nines”.'},
    {term:'Nines', def:'Shorthand for availability levels: three nines = 99.9%, four nines = 99.99%, and so on.'},
    {term:'SLI', aka:['service level indicator'], def:'Service Level Indicator: a measured ratio of good events to valid events, e.g. fast successful requests ÷ all requests.'},
    {term:'SLO', aka:['service level objective'], def:'Service Level Objective: an internal target for an SLI over a window, e.g. 99.9% over 30 days.'},
    {term:'SLA', aka:['service level agreement'], def:'Service Level Agreement: an external contract with consequences (credits, refunds) if a level is missed.'},
    {term:'Error budget', def:'1 − SLO: the amount of unreliability you are allowed to spend in a window.'},
    {term:'Burn rate', def:'How fast the error budget is being consumed: current error rate ÷ (1 − SLO).'},
    {term:'MTBF', aka:['mean time between failures'], def:'Mean Time Between Failures — average uptime between incidents.'},
    {term:'MTTR', aka:['mean time to recovery', 'mean time to repair'], def:'Mean Time To Recovery — average time to restore service after a failure.'},
    {term:'SPOF', aka:['single point of failure', 'single points of failure'], def:'Single Point Of Failure: a component whose failure alone stops the whole system.'},
    {term:'Fault tolerance', def:'The ability to keep providing service when components fail.'},
    {term:'Failure domain', aka:['failure domains'], def:'A set of components that can fail together: a host, rack, availability zone, region or provider.'},
    {term:'Blast radius', def:'How much of the system or user base is affected when one component or domain fails.'},
    {term:'Cascading failure', def:'A failure in one component that overloads others, spreading until large parts of the system fail.'},
    {term:'Vertical scaling', aka:['scale up', 'scaling up'], def:'Adding more CPU, RAM or disk to one machine.'},
    {term:'Horizontal scaling', aka:['scale out', 'scaling out'], def:'Adding more machines and spreading load across them.'},
    {term:'Stateless service', aka:['stateless'], def:'A service that keeps no per-client data between requests, so any instance can serve any request.'},
    {term:'Load balancer', aka:['load balancers'], def:'A component that spreads incoming requests across multiple servers and routes around unhealthy ones.'},
    {term:'Cache', def:'A fast, usually in-memory store of frequently used data that avoids slower lookups.'},
    {term:'DNS', aka:['Domain Name System'], def:'Domain Name System: translates names like example.com into IP addresses, with cached answers that expire after a TTL.'},
    {term:'TCP handshake', def:'SYN → SYN-ACK → ACK: the one-round-trip exchange that opens a reliable TCP connection.'},
    {term:'TLS', aka:['HTTPS'], def:'Transport Layer Security: encrypts and authenticates connections; TLS 1.3 needs one round trip to set up.'},
    {term:'RTT', aka:['round trip', 'round-trip time', 'round trips'], def:'Round-Trip Time: how long a message takes to go to a destination and back.'},
    {term:'QUIC', def:'A UDP-based transport (RFC 9000) that combines connection and TLS 1.3 handshakes and powers HTTP/3.'},
    {term:'Little’s Law', aka:["Little's Law"], def:'Items in a system = arrival rate × time in system (L = λW); used to size concurrency.'},
    {term:'Utilization', aka:['utilisation'], def:'Fraction of capacity in use: arrival rate ÷ service capacity. Waiting grows sharply as it approaches 100%.'},
    {term:'Monolith', def:'An application built and deployed as a single unit.'},
    {term:'Modular monolith', def:'A single deployable with strictly enforced internal module boundaries and module-owned data.'},
    {term:'Microservices', def:'An architecture of small, independently deployable services, each owning its data and communicating over the network.'},
    {term:'Strangler fig', def:'Migration pattern: gradually route functionality from a legacy system to new components until the old one can be retired.'},
    {term:'Conway’s Law', aka:["Conway's Law"], def:'Organisations design systems that mirror their own communication structure.'},
    {term:'Back-of-envelope estimation', aka:['back-of-the-envelope'], def:'Quick, rounded calculations of load, storage and bandwidth used to make early design decisions.'}
  ],
  sources:['Google, “Site Reliability Engineering” (2016) and “The Site Reliability Workbook” (2018)', 'Dean & Barroso, “The Tail at Scale”, CACM 2013', 'DeCandia et al., “Dynamo: Amazon’s Highly Available Key-value Store”, SOSP 2007', 'Treynor et al., “The Calculus of Service Availability”, ACM Queue 2017', 'Ilya Grigorik, “High Performance Browser Networking”', 'Martin Fowler — MonolithFirst, MicroservicePrerequisites, StranglerFigApplication', 'Engineering at Meta (Oct 2021 outage) and AWS Post-Event Summary (Dec 2021)']
});
} catch(e){ console.error('[SDA] Module "foundations" failed to load', e); window.SDA && SDA.errors.push({id:'foundations', error:e}); }
})();
