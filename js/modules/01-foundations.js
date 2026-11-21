
/* =====================================================================
   MODULE 1 — FOUNDATIONS
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, sv, esc, clamp, fmtNum, fmtDur, shuffle} = SDA.u; const ui = SDA.ui;

/* ---------- small interactive helpers used by several lessons ---------- */
function orderGame(host, items, doneMsg){
  let next = 0;
  const status = el('div', {class:'verdict warn', role:'status'});
  const pool = el('div', {class:'pill-row'}); const placed = el('ol', {class:'steps', style:{marginTop:'12px'}});
  const reset = () => {
    next = 0; placed.innerHTML = ''; pool.innerHTML = ''; status.className = 'verdict warn'; status.textContent = 'Click the steps in the right order, starting with step 1.';
    shuffle(items.map((t, i) => i)).forEach(i => {
      const b = ui.button(esc(items[i]), () => {
        if (i === next){ b.remove(); placed.append(el('li', null, items[i])); next++;
          if (next === items.length){ status.className = 'verdict ok'; status.textContent = doneMsg || `✓ All ${items.length} steps in order.`; }
          else status.textContent = `✓ Correct. Now pick step ${next + 1}.`;
        } else { b.classList.add('danger'); status.className = 'verdict bad'; status.textContent = `Not yet. That comes later. Which step is number ${next + 1}?`; setTimeout(() => { b.classList.remove('danger'); status.className = 'verdict warn'; }, 900); }
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
  const W = Math.min(o.w || 640, Math.max(280, window.innerWidth - 32)), H = o.h || 260, P = {l:58, r:18, t:18, b:42};
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
  const sel = ui.select({label:'Where is your login remembered?', value:'memory', options:[['memory', 'Only inside one server'], ['redis', 'In a store both servers can read']], onChange:v => { mode = v; d.setHidden('r', v !== 'redis'); sessionOn = null; loggedIn = false; d.setSub('s1', ''); d.setSub('s2', ''); write(`Changed to ${v === 'redis' ? 'the shared store' : 'one server’s memory'}. The demo login was cleared. Log in again.`, 'sys'); }});
  const d = new api.Diagram(holder, {title:'When two servers answer', w:720, h:270, alt:'A traffic splitter sends you to server A or B. Your login lives in one server or in a shared store.',
    nodes:[{id:'c', type:'client', label:'Student', x:70, y:135}, {id:'lb', type:'lb', label:'Traffic splitter', sub:'takes turns', x:225, y:135}, {id:'s1', type:'service', label:'Server A', x:410, y:65}, {id:'s2', type:'service', label:'Server B', x:410, y:205}, {id:'r', type:'cache', label:'Shared store', sub:'logins', x:610, y:135, hidden:true}],
    edges:[{from:'c', to:'lb'}, {from:'lb', to:'s1'}, {from:'lb', to:'s2'}, {from:'s1', to:'r'}, {from:'s2', to:'r'}],
    caption:'Log in, then view your result a few times. Watch which server answers.'});
  async function send(kind){
    if (busy) return; busy = true;
    const srv = rr++ % 2 === 0 ? 's1' : 's2'; const name = srv === 's1' ? 'A' : 'B';
    await d.flow([['c', 'lb', kind === 'login' ? 'log in' : 'view result'], ['lb', srv]]);
    if (mode === 'redis') await d.flow([[srv, 'r', kind === 'login' ? 'SET' : 'GET'], ['r', srv]]);
    let ok;
    if (kind === 'login'){ loggedIn = true; sessionOn = mode === 'redis' ? 'r' : srv; ok = true; if (mode !== 'redis'){ d.setSub('s1', srv === 's1' ? '🔑 your session' : ''); d.setSub('s2', srv === 's2' ? '🔑 your session' : ''); } }
    else ok = loggedIn && (mode === 'redis' || sessionOn === srv);
    await d.flow([[srv, 'lb', ok ? '200' : '401'], ['lb', 'c']]);
    if (kind === 'login') write(`Server ${name}: logged in ✓ (${mode === 'redis' ? 'both servers can find this login' : 'only server ' + name + ' remembers'})`, 'ok');
    else if (ok) write(`Server ${name}: here is your result ✓`, 'ok');
    else write(loggedIn ? `Server ${name}: login not found here. The other server remembers it.` : `Server ${name}: please log in first.`, 'err');
    d.setCaption(ok ? `Server ${name} answered successfully.` : loggedIn ? `Server ${name} cannot see the login kept in the other server’s memory.` : `Log in first, then ask for your result.`);
    busy = false;
  }
  host.append(el('div', {class:'ctl-grid'}, sel.el), holder, el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('🔑 Log in', () => send('login'), 'sm primary'), ui.button('📄 View my result', () => send('orders'), 'sm')), log);
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
      <div class="card"><h4 style="margin:0 0 6px">⬆️ Scale up (one bigger server)</h4>${v ? `<dl class="kv"><dt>Machine</dt><dd>${v[0]}</dd><dt>Capacity</dt><dd>${fmtNum(v[2])} requests/s</dd><dt>Cost</dt><dd>₹${v[3]}/hour</dd><dt>If it stops</dt><dd style="color:var(--bad)">No app server can answer</dd><dt>Code change</dt><dd>none</dd></dl>` : `<div class="verdict bad">No single machine here can handle ${fmtNum(target)} requests/s with 30% extra capacity.</div>`}</div>
      <div class="card"><h4 style="margin:0 0 6px">↔️ Scale out (several servers)</h4><dl class="kv"><dt>Machines</dt><dd>${n} × S + traffic splitter</dd><dt>Capacity</dt><dd>${fmtNum(n * catalog[0][2])} requests/s</dd><dt>Cost</dt><dd>₹${hCost}/hour</dd><dt>If one stops</dt><dd style="color:var(--ok)">lose ${(100 / n).toFixed(n > 20 ? 1 : 0)}% capacity</dd><dt>Code change</dt><dd>share login information</dd></dl></div></div>
      <p class="lab-hint" style="margin-top:8px">These sizes, prices, and capacities are teaching examples. A bigger machine may not use every processor equally well. Both choices reserve 30% extra capacity.</p>`));
  }
  host.append(s.el, out); render();
}
function h2t(html){ const t = document.createElement('template'); t.innerHTML = html; return t.content; }
function queueCurve(host, api){
  const S = 10;
  const chart = lineChart(host, {label:'Average response time vs utilization for a single-server queue (service time 10 ms)', w:680, h:270, xMin:0, xMax:.97, yMax:400, xTicks:[0, .2, .4, .6, .8, .97], xFmt:v => Math.round(v * 100) + '%', yTicks:[0, 100, 200, 300, 400], yFmt:v => v + ' ms', xLabel:'Utilization = arrival rate ÷ capacity', yLabel:'Avg time in system', fn:r => S / (1 - r)});
  const info = el('div', {class:'verdict ok', role:'status', style:{marginTop:'10px'}});
  const sl = ui.slider({label:'Utilization (how busy the server is)', min:0, max:.97, step:.01, value:.5, fmt:v => Math.round(v * 100) + '%', onInput:v => { sweeping = false; show(v); }});
  let sweeping = false, x = 0;
  function show(r){ const w = S / (1 - r); chart.set(r, `${Math.round(r * 100)}% → ${w.toFixed(0)} ms`); info.className = 'verdict ' + (r < .7 ? 'ok' : r < .85 ? 'warn' : 'bad'); info.textContent = r < .7 ? `In this model: ${w.toFixed(0)} ms average (10 ms of work + ${(w - S).toFixed(0)} ms waiting in line).` : r < .85 ? `In this model: ${(w - S).toFixed(0)} ms waiting on average for 10 ms of work.` : `In this model: ${w.toFixed(0)} ms total on average. Small bursts can now make the waiting line much longer.`; }
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
  const lS = ui.slider({label:'Arrival rate', min:10, max:380, step:5, value:70, fmt:v => v + ' req/s', onInput:v => { lambda = v; }});
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
      <div class="metric"><div class="ml">Full outage if traffic is even</div><div class="mv">${fmtDur(budgetMin * 60000)}</div></div>
      <div class="metric ${burn >= 6 ? 'bad' : burn >= 1 ? 'warn' : ''}"><div class="ml">Burn rate</div><div class="mv">${burn.toFixed(2)}<small>×</small></div></div>
      <div class="metric ${hoursToEmpty < 24 ? 'bad' : hoursToEmpty < W * 24 * (1 - expected) ? 'warn' : ''}"><div class="ml">Budget empty in</div><div class="mv">${isFinite(hoursToEmpty) ? fmtDur(hoursToEmpty * 3600000) : 'never'}</div></div></div>
      <div class="verdict ${cls}" style="margin-top:12px">${verdict}</div>
      ${h.math(`budget       = (1 − ${S}) × ${fmtNum(N)} requests = ${fmtNum(budgetReq)} failures allowed
full outage with even traffic = (1 − ${S}) × ${W} days × 1,440 min = ${budgetMin.toFixed(1)} minutes
burn rate    = current error rate ÷ allowed error rate = ${(err.value / 100).toFixed(4)} ÷ ${b.toFixed(4)} = ${burn.toFixed(2)}×
(1× = you will use exactly 100% of the budget by the end of the window)`)}`));
  }
  host.append(el('div', {class:'ctl-grid'}, slo.el, win.el, req.el, used.el, elapsed.el, err.el), out); render();
}
function spofHunter(host, api){
  const ARCH = {
    v1:{label:'One path through each part', w:800, h:220, src:'u', sinks:['db'],
      nodes:[{id:'u', type:'client', label:'Students', x:70, y:110}, {id:'dns', type:'ext', label:'Name lookup', x:225, y:110}, {id:'lb', type:'lb', label:'Front door', x:390, y:110}, {id:'app', type:'service', label:'App server', x:560, y:110}, {id:'db', type:'db', label:'Results DB', x:720, y:110}],
      edges:[['u', 'dns'], ['dns', 'lb'], ['lb', 'app'], ['app', 'db']]},
    v2:{label:'Spare path through each part', w:820, h:330, src:'u', sinks:['dbp', 'dbs'],
      nodes:[{id:'u', type:'client', label:'Students', x:60, y:165}, {id:'d1', type:'ext', label:'Name source A', x:205, y:95, w:126}, {id:'d2', type:'ext', label:'Name source B', x:205, y:235, w:126}, {id:'l1', type:'lb', label:'Front door A', x:370, y:95}, {id:'l2', type:'lb', label:'Front door B', x:370, y:235}, {id:'a1', type:'service', label:'App 1', x:540, y:60, w:100}, {id:'a2', type:'service', label:'App 2', x:540, y:165, w:100}, {id:'a3', type:'service', label:'App 3', x:540, y:270, w:100}, {id:'dbp', type:'db', label:'Results DB', x:725, y:105}, {id:'dbs', type:'db', label:'Standby DB', sub:'ready', x:725, y:235}],
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
  function judge(){ const A = ARCH[arch], p = pathTo(A, dead); const name = id => (A.nodes.find(n => n.id === id) || {}).label || id; verdict.className = 'verdict ' + (p ? 'ok' : 'bad'); verdict.textContent = p ? `✓ Requests still succeed${dead.size ? ` with ${dead.size} part(s) down` : ''}. Path: ${p.map(name).join(' → ')}` : `✗ No working path from students to results. Stopped: ${[...dead].map(name).join(', ')}`; return p; }
  async function send(){ const p = judge(); if (!p) return; const hops = []; for (let i = 0; i < p.length - 1; i++) hops.push([p[i], p[i + 1], i === 0 ? 'req' : null]); await d.flow(hops, {dur:520}); }
  function reveal(){ const A = ARCH[arch]; const spofs = A.nodes.filter(n => n.id !== A.src && !pathTo(A, new Set([n.id]))); A.nodes.forEach(n => { if (!dead.has(n.id)) d.setStatus(n.id, spofs.some(x => x.id === n.id) ? 'hot' : 'ok'); }); verdict.className = 'verdict ' + (spofs.length ? 'warn' : 'ok'); verdict.textContent = spofs.length ? `One of these parts can stop the path: ${spofs.map(n => n.label).join(', ')}.` : 'No single part can stop this path in the model. Test the switches and shared dependencies in a real system.'; }
  const sel = ui.select({label:'Request paths', value:'v1', options:[['v1', 'One path through each part'], ['v2', 'Spare paths through each part']], onChange:v => { arch = v; build(); }});
  host.append(el('div', {class:'ctl-grid'}, sel.el), holder, verdict, el('div', {class:'controls', style:{marginTop:'10px'}}, ui.button('📨 Send request', send, 'sm primary'), ui.button('🔍 Reveal SPOFs', reveal, 'sm'), ui.button('↺ Revive all', build, 'sm ghost')));
  build();
}
function archAdvisor(host){
  const out = el('div', {style:{marginTop:'14px'}});
  const eng = ui.slider({label:'Engineers working on the product', min:2, max:400, step:1, value:25, fmt:v => v, onInput:render});
  const t1 = ui.toggle({label:'Login, results, and notices have clear owners', checked:false, onChange:render});
  const t2 = ui.toggle({label:'One area needs much more capacity than the others', checked:false, onChange:render});
  const t3 = ui.toggle({label:'The team can release and watch each service easily', checked:false, onChange:render});
  const t4 = ui.toggle({label:'Teams need different release schedules', checked:false, onChange:render});
  function render(){
    let s = 0; const why = [];
    const n = eng.value;
    if (n < 15){ s -= 3; why.push(['−', `${n} engineers can usually release one app together. Each separate service adds work.`]); }
    else if (n < 50){ s -= 1; why.push(['−', `${n} engineers may benefit from clear modules inside one app.`]); }
    else if (n < 150){ s += 1; why.push(['+', `${n} engineers may spend time coordinating one shared release.`]); }
    else { s += 2; why.push(['+', `${n} engineers may need teams to release their areas separately.`]); }
    if (t1.value){ s += 2; why.push(['+', 'Clear ownership makes it easier to separate services and their data.']); } else { s -= 2; why.push(['−', 'Unclear ownership makes a split hard to maintain.']); }
    if (t2.value){ s += 1; why.push(['+', 'One area may need its own capacity plan.']); }
    if (t3.value){ s += 1; why.push(['+', 'The team can operate separate services.']); } else { s -= 2; why.push(['−', 'Every separate service adds release and repair work.']); }
    if (t4.value){ s += 1; why.push(['+', 'Different release schedules make separation useful.']); }
    const [title, cls] = s <= -3 ? ['One app with clear code sections', 'ok'] : s <= 1 ? ['Modular monolith', 'ok'] : s <= 3 ? ['Modular monolith now, then separate one area if needed', 'warn'] : ['Separate services, moved one area at a time', 'warn'];
    out.innerHTML = '';
    out.append(el('div', {class:'verdict ' + cls}, `Suggestion (score ${s > 0 ? '+' : ''}${s}): ${title}`), el('ul', {class:'prose', style:{marginTop:'10px'}, html:why.map(([k, t]) => `<li><b style="color:${k === '+' ? 'var(--ok)' : 'var(--bad)'}">${k}</b> ${esc(t)}</li>`).join('')}), el('p', {class:'lab-hint'}, 'Use this to compare reasons. Measure release delays and operating work before changing the app.'));
  }
  host.append(eng.el, el('div', {class:'stack', style:{marginTop:'12px'}}, t1.el, t2.el, t3.el, t4.el), out); render();
}

/* ---------- the module ---------- */
const lessons = [
{
  id:'what-is-system-design', title:'What system design is', minutes:7, tags:['intro','HLD','architecture'],
  summary:'System design decides what an app must do and how its parts will do it together. It also plans for busy times and failures.',
  problem:`<h3>A small example</h3><p>A college wants students to view exam results on their phones. Its first version has:</p><ul><li>1 app server that answers requests</li><li>1 database that stores results</li><li>200 students in a test</li></ul><p>On release night, 40,000 students may open the app within 20 seconds. A request is one ask for a result. How should these parts work together so students get the right answer?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Start with what students need, then follow one result request through the app.</p>',
    steps:[
      {icon:'🎯', title:'Set the goal', text:'A student enters a roll number and sees the correct result. The page should still respond during the release rush.'},
      {icon:'📱', title:'Trace one request', text:'The phone asks the app server. The server reads the result from the database and sends it back.'},
      {icon:'📊', title:'Estimate the rush', text:'40,000 students ÷ 20 seconds = 2,000 requests each second. The test server finishes 500 each second.'},
      {icon:'⌛', title:'Find the first limit', text:'About 1,500 new requests join the waiting line each second. Some wait so long that the app returns an error.'},
      {icon:'🔧', title:'Choose and check', text:'Measure where requests wait, then improve that part. Test again because another part may become the limit.'}
    ],
    diagram:{title:'Where the results app slows down', w:760, h:290, alt:'One app server and one database answer a small test. During the results-night rush, requests pile up and some time out.',
      nodes:[{id:'c', type:'client', label:'Students', x:90, y:145}, {id:'a1', type:'service', label:'App server', x:365, y:145}, {id:'db', type:'db', label:'Results database', x:640, y:145}],
      edges:[{from:'c', to:'a1'}, {from:'a1', to:'db'}],
      steps:[
        {note:'One student asks for a result. The server reads it and answers.', flow:[['c', 'a1', 'ask'], ['a1', 'db', 'read'], ['db', 'a1'], ['a1', 'c', 'result']], hl:['a1']},
        {note:'Release night sends many requests to the same server.', status:{a1:'hot'}, flow:[['c', 'a1', 'ask'], ['c', 'a1', 'ask'], ['c', 'a1', 'ask']], parallel:true, hl:['a1']},
        {note:'New requests arrive faster than this server can finish them.', status:{a1:'hot'}, flow:[['c', 'a1', 'ask'], ['c', 'a1', 'ask']], parallel:true, hl:['a1']},
        {note:'Every result also needs the database, which may become busy.', status:{a1:'hot', db:'hot'}, flow:[['a1', 'db', 'read'], ['a1', 'db', 'read']], parallel:true, hl:['db']},
        {note:'A student gets an error. The design must address the measured limit.', status:{a1:'hot', db:'hot'}, flow:[['a1', 'c', 'error']], hl:['c']}
      ]},
    html:`<h3>Everyday comparison</h3><p>Think of a college kitchen preparing meals for students.</p><div class="simple-table">${h.table(['Kitchen choice', 'App choice'], [['Decide what meal to serve', 'Decide what students need to see.'], ['Choose cooks and a pantry', 'Choose an app server and a database.'], ['Plan for lunch rush', 'Plan for the release rush.']])}</div><div class="callout tip"><b>Important point</b><p>System design connects a user need to the parts, capacity, and decisions that make the app work.</p></div><h3>How we handle it</h3><p>For the results app, the next choice depends on what the test shows.</p><div class="simple-table">${h.table(['If this part is full', 'Possible next step'], [['App server', 'Try more app capacity. You will learn this in Lesson 8.'], ['Database', 'Reduce repeated reads. You will learn this in Module 4.'], ['Neither', 'Look for another place where requests wait.']])}</div>`,
    deep:`<h4>The numbers</h4><p>The test server finishes 500 requests each second. In the 20-second rush it can finish 500 × 20 = 10,000 of the 40,000. That leaves 40,000 − 10,000 = 30,000 still waiting. Clearing them takes 30,000 ÷ 500 = 60 more seconds.</p><h4>When it goes wrong</h4><p>Say the app gives up on a request after 5 seconds. In 5 seconds the server clears 500 × 5 = 2,500 requests. The line grows by 1,500 each second, so it passes 2,500 after about 2,500 ÷ 1,500 = 1.7 seconds. From then on, students start seeing errors. If half of them tap refresh, their retries add even more requests to the line.</p><h4>How it works inside</h4><p>To keep up with 2,000 arrivals each second, you need 2,000 ÷ 500 = 4 servers of this size. That only helps if the database can also keep up. Count the capacity of every part on the path.</p>`
  },
  tradeoffs:{use:[`One app server and one database can serve the 200-person test if they give correct results quickly.`, `Add app capacity for release night if measurements show the server fills first.`], avoid:[`Do not buy more app servers when the database is where requests wait.`, `Do not use 40,000 registered students as the request rate. Measure when they actually open the app.`], alt:[`Test a larger app server against several smaller ones before choosing. You will learn this in Lesson 8.`]},
  real:[
    {co:'IRCTC', tier:'confirmed', text:'IRCTC publishes fixed opening times for Tatkal bookings: 10 AM for AC classes and 11 AM for non-AC classes. A published opening time is a reason to estimate a peak, rather than relying on a daily average. This says nothing about IRCTC’s internal design.', src:'IRCTC, Tatkal Booking'}
  ],
  mistakes:[`Starting with a server count before asking what students need.`, `Using the small test to predict results night without measuring the rush.`],
  interview:[`Say what students need, then trace one request through the app.`, `Explain how release night changes the capacity question.`, `Name the measurements you need before choosing a change.`],
  tryit:{quiz:[
    {q:'What is the first system design question for the results app?', options:['Which programming language looks best', 'What students need the app to do', 'Which server brand to buy', 'How to draw the database'], answer:1, why:'The design begins with the result students need and the conditions under which they need it.'},
    {q:'Why test the app during a release rush?', options:['To avoid checking result accuracy', 'To choose a larger database without evidence', 'To check whether the whole request path still meets the goal', 'To count registered students only'], answer:2, why:'The app must return the right result when many requests arrive together.'}
  ]},
  sources:[`IRCTC, Tatkal Booking`]
},
{
  id:'seven-step-approach', title:'The repeatable 7-step approach', minutes:8, tags:['framework','interview','process'],
  summary:'The seven steps turn a broad app idea into decisions you can check. Start with the user’s need, then work through demand, data, parts, risks, and choices.',
  problem:`<h3>A small example</h3><p>The college asks you to design its results app. You begin choosing servers, but the college has not said what students should see.</p><ul><li>Students may search by roll number.</li><li>Results may change after a correction.</li><li>The release time may bring a rush.</li></ul><p>Which question should you answer before drawing the system?</p>`,
  intuition:`Planning a trip starts with the destination. Then you ask how many people are going, choose a route, and plan for delays. A system design discussion follows the same order.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Use these questions to design one feature: find a student’s current result by roll number.</p>',
    steps:[
      {icon:'🎯', title:'Clarify the job', text:'Ask what the student enters and what the app must show. Leave unrelated features out.'},
      {icon:'📊', title:'Estimate demand', text:'Ask how many requests arrive when results are published. A rough number is useful if you name it as an assumption.'},
      {icon:'📱', title:'Define requests and data', text:'The phone sends a roll number. The college stores the matching result and any later correction.'},
      {icon:'🧩', title:'Draw the path', text:'Follow one request from phone to app server to database and back.'},
      {icon:'🔍', title:'Study the hard part', text:'Check how a corrected result reaches the student. Then check where the release rush makes requests wait.'},
      {icon:'⚖️', title:'Compare choices', text:'Name a change that helps, its cost, and what you would test next.'}
    ],
    stepper:{title:'The 7-step loop', dwell:3200, items:[
      {title:'Clarify requirements', tag:'What?', text:'A student enters a roll number and sees the current result. Ask whether corrected results must appear immediately.'},
      {title:'Estimate scale', tag:'How many?', text:'Ask how many students may arrive during release time. Write down a rough estimate if no measured number exists.'},
      {title:'Define the request', tag:'What is asked?', text:'The phone sends a roll number. The app answers with that student’s result or a clear not-found message.'},
      {title:'Choose the data', tag:'What is stored?', text:'Store each roll number and result. Record a correction so the answer can change.'},
      {title:'Draw the path', tag:'Which parts?', text:'Follow phone, app server, database, then phone. This picture is the first design to test.'},
      {title:'Deep dive', tag:'What is hard?', text:'A correction appears after release. Find out how quickly students must see the new result.'},
      {title:'Bottlenecks and choices', tag:'What changes?', text:'Test the rush. If the app server fills first, compare a larger server with several servers.'}
    ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Trip question', 'Design question'], [['Where are we going?', 'What result does the student need?'], ['How many people?', 'How many requests arrive at release?'], ['What if the road closes?', 'What if a result changes or a server stops?']])}</div><div class="callout tip"><b>Important point</b><p>The steps are questions, not a one-way script. Revisit an earlier answer when a new fact changes it.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['New fact', 'Question to revisit'], [['Release time changes', 'How many students arrive together?'], ['A result is corrected', 'How quickly must the new answer appear?'], ['Students need a PDF instead', 'What does the app actually need to provide?']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say each of 40,000 students sends 3 requests: one lookup, one refresh and one for a friend. That is 40,000 × 3 = 120,000 requests. If all arrive in the first minute, 120,000 ÷ 60 = 2,000 each second. If the college spreads the release over 10 minutes, 120,000 ÷ 600 = 200 each second. One assumption changed the load by 10 times, so write it down.</p><h4>How it works inside</h4><p>The data itself is small. Say each result takes 1,000 bytes. Then 40,000 × 1,000 = 40,000,000 bytes, or 40 MB. That fits easily on one machine. So step 5 should study the rush, not the storage.</p><h4>When it goes wrong</h4><p>Say a result is corrected 10 minutes after a student saw the old one. That student may still hold the old answer on screen. Decide whether the app must warn them, or only show the new answer on the next visit.</p>`
  },
  tradeoffs:{use:[`Use the seven questions when the college’s request is broad and several people must agree on the results app.`, `Return to an earlier question when the college changes release time or correction rules.`], avoid:[`Do not choose server capacity before estimating the release rush.`, `Do not spend the whole discussion on the diagram while the student’s need remains unclear.`], alt:[`For a small change to an existing result page, a short discussion may be enough.`]},
  real:[
    {co:'Amazon', tier:'confirmed', text:'Amazon describes starting product work with the customer’s problem before choosing how to build.', src:'AWS Startups Blog, Working Backwards'},
    {co:'Google', tier:'confirmed', text:'Google design documents record goals and choices so reviewers can challenge assumptions early.', src:'Malte Ubl, Design Docs at Google (2020)'}
  ],
  mistakes:[`Drawing servers before asking which result students need.`, `Treating an estimated release rush as a measured fact.`],
  interview:[`Ask what the student must do before naming components.`, `Walk one result request through the seven questions.`, `Revisit an earlier answer when the interviewer changes a condition.`],
  tryit:[{quiz:[
    {q:'What should you ask first when the college says “design a results app”?', options:['Which server to buy', 'How many icons to draw', 'Which database brand is popular', 'What students need to do'], answer:3, why:'The user’s job sets the scope of the design.'},
    {q:'If the release time changes, which answer should you revisit?', options:['The traffic estimate', 'The app’s color', 'The student’s roll number', 'The lesson title'], answer:0, why:'A new release time may change how many students arrive together.'}
  ]}, {note:'Put the seven questions in order. Then decide which answer to revisit if the release time changes.', mount:host => orderGame(host, ['Clarify requirements', 'Estimate scale', 'Define the request', 'Choose the data', 'Draw the path', 'Deep dive', 'Bottlenecks and choices'], '✓ All seven in order. If the college changes the release time, which earlier answer would you revisit?')}],
  sources:[`AWS Startups Blog, Working Backwards`, `Malte Ubl, Design Docs at Google (2020)`]
},
{
  id:'functional-vs-nonfunctional', title:'Functional vs non-functional requirements', minutes:7, tags:['requirements','NFR','quality attributes'],
  summary:'Functional requirements say what people can do. Non-functional requirements say how well those actions must work under stated conditions.',
  problem:`<h3>A small example</h3><p>The college results app lets students look up results. The college also expects the page to work when results are published.</p><ul><li>Students enter a roll number.</li><li>The app shows the matching result.</li><li>Many students visit at release time.</li></ul><p>How do we describe both the feature and the quality students need?</p>`,
  intuition:`A bus timetable tells you where the bus goes. A promise that it arrives within ten minutes tells you how well the trip works. An app needs both kinds of promise.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Write two kinds of requirements for the same result request.</p>',
    steps:[
      {icon:'📱', title:'Name the action', text:'A student enters a roll number and sees the matching result. That is a functional requirement.'},
      {icon:'⏱️', title:'Name the quality', text:'The result should appear within a stated time during the release rush. That is a non-functional requirement.'},
      {icon:'📏', title:'Make it testable', text:'For example, 95 of 100 valid requests should finish within 2 seconds during the expected rush.'},
      {icon:'🔄', title:'Include changes', text:'Staff may correct a result. Decide how soon the student must see the corrected answer.'}
    ],
    stepper:{title:'Turn a wish into a check', items:[
      {title:'“Show my result”', tag:'action', text:'Enter a roll number and show the matching result. Test with a known roll number.'},
      {title:'“Show it quickly”', tag:'time', text:'Set a response target during release time, such as 95 of 100 valid requests within 2 seconds.'},
      {title:'“Handle release time”', tag:'load', text:'Test that target while the expected number of students arrive together.'},
      {title:'“Correct a mistake”', tag:'action', text:'Allow authorized staff to update an incorrect result. The student should then receive the corrected value.'},
      {title:'“Show corrections soon”', tag:'quality', text:'Set a time limit for when a corrected result becomes visible to students.'}
    ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Bus trip', 'Results app'], [['The bus goes to campus', 'The app shows a result.'], ['It arrives within ten minutes', 'The result appears within two seconds.']])}</div><div class="callout tip"><b>Important point</b><p>“Fast” is hard to test. Name the action, the busy condition, and a number.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Statement', 'Kind'], [['Students can find a result by roll number', 'Functional'], ['95 of 100 requests finish within 2 seconds at release', 'Non-functional'], ['Staff can correct a result', 'Functional'], ['Students see corrections within 10 minutes', 'Non-functional']])}</div>`,
    deep:`<h4>The numbers</h4><p>Take the target "95 of 100 valid requests finish within 2 seconds". In a rush of 40,000 requests, 95% × 40,000 = 38,000 must meet the time. That leaves 40,000 − 38,000 = 2,000 requests allowed to be slower.</p><p>The target does not say how slow those 2,000 may be. Add a second line, for example "99 of 100 within 5 seconds". You will learn the short names for these lines in Lesson 10.</p><h4>When it goes wrong</h4><p>Decide what counts. An error page that appears in 100 ms is fast, but it is not a result. Count errors as misses, or the target can pass while students see nothing.</p><p>Also state the load. A 2-second target is only fair up to some arrival rate, for example 2,000 requests each second. Above that, the target needs a new plan.</p>`
  },
  tradeoffs:{use:[`Write both kinds of requirement for the result lookup so the college can test the feature and its release-time performance.`, `Give correction visibility its own target because a correct update that arrives too late still misleads students.`], avoid:[`Do not accept “fast enough” without a number and a release-time condition.`, `Do not assume a quiet test proves the app will work during the results rush.`], alt:[`For the first 200-person test, use a rough target and replace it with measured release traffic later.`]},
  real:[
    {co:'IRCTC', tier:'confirmed', text:'IRCTC publishes fixed Tatkal booking times. A published start time makes a short traffic peak worth testing.', src:'IRCTC, Tatkal Booking'}
  ],
  mistakes:[`Listing the lookup feature without saying how it must work during release time.`, `Calling the app fast without a testable time target.`],
  interview:[`Give one action and one quality target for the same result request.`, `Say how you would test both during the release rush.`],
  tryit:[{quiz:[
    {q:'Which statement is a functional requirement?', options:['The page feels fast', 'Students can find a result by roll number', '95 of 100 requests finish within 2 seconds', 'The app works at release time'], answer:1, why:'It names an action a student can perform.'},
    {q:'What makes “results load quickly” testable?', options:['A longer lesson', 'A server brand', 'A time limit and traffic condition', 'A nicer button'], answer:2, why:'A measured target says how fast and under what load.'}
  ]}, {note:'Sort each statement by whether it names an action or a quality of that action.', mount:host => sortGame(host, [
    {t:'Students can look up a result by roll number', c:'f', why:'A student action.'},
    {t:'95 of 100 result requests finish within 2 seconds at release', c:'n', why:'A measured speed target.'},
    {t:'Staff can correct a result', c:'f', why:'A staff action.'},
    {t:'Students see corrections within 10 minutes', c:'n', why:'A measured freshness target.'},
    {t:'The app handles the expected release rush', c:'n', why:'A capacity target under a stated condition.'}
  ], [{id:'f', label:'Functional'}, {id:'n', label:'Non-functional'}])}],
  sources:[`IRCTC, Tatkal Booking`]
},
{
  id:'client-server', title:'The client–server model', minutes:7, tags:['client','server','stateless','sessions'],
  summary:'A client asks for information, and a server sends an answer. The client and server have different jobs, but they work together on each request.',
  problem:`<h3>A small example</h3><p>A student opens the college results app from Lesson 1. The result is stored by the college, so the phone needs to ask for it.</p><ul><li>1 phone with the app</li><li>1 app server</li><li>1 database holding results</li></ul><p>Which part asks, which part finds the result, and which part shows it?</p>`,
  intuition:`Think of a library. You ask a librarian for a book. The librarian checks the catalogue and brings the book to you. You started the request. The librarian answered it.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one student asking for a result.</p>',
    steps:[
      {icon:'📱', title:'The client asks', text:'The phone app is the client. It sends a request with the student’s roll number.'},
      {icon:'⚙️', title:'The server receives it', text:'The app server is a computer running the college’s app. It decides how to find the requested result.'},
      {icon:'🗄️', title:'The database supplies data', text:'The server reads the result from the database, which stores the college’s records.'},
      {icon:'📄', title:'The client shows the answer', text:'The server sends a response containing the result. The phone displays it to the student.'}
    ],
    diagram:{title:'A request for a college result', w:760, h:280, alt:'A phone and college website ask an app server for results from a database. An office system can also call the server.',
      nodes:[{id:'p', type:'client', label:'Phone app', x:80, y:60}, {id:'b', type:'client', label:'College website', x:80, y:150}, {id:'x', type:'ext', label:'Office system', x:80, y:240, w:130}, {id:'s', type:'service', label:'App server', x:380, y:150}, {id:'db', type:'db', label:'Results database', x:640, y:150}],
      edges:[{from:'p', to:'s'}, {from:'b', to:'s'}, {from:'x', to:'s'}, {from:'s', to:'db'}],
      steps:[
        {note:'The phone asks. The server reads a result and answers.', flow:[['p', 's', 'ask'], ['s', 'db', 'read'], ['db', 's'], ['s', 'p', 'result']], hl:['p', 's']},
        {note:'The college website can ask the same server for a result.', flow:[['b', 's', 'ask'], ['s', 'db', 'read'], ['db', 's'], ['s', 'b', 'result']], hl:['b', 'db']},
        {note:'An office system can be a client too.', flow:[['x', 's', 'ask'], ['s', 'x', 'answer']], hl:['x']},
        {note:'Each client asks. The server reads the college’s shared result records.', hl:['s', 'db']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Library', 'Results app'], [['Student asks for a book', 'Phone asks for a result.'], ['Librarian finds the book', 'App server finds the record.'], ['Catalogue lists books', 'Database holds results.']])}</div><div class="callout tip"><b>Important point</b><p>The client starts the request. The server handles it and sends a response.</p></div><h3>How we handle it</h3><p>Give each part one clear job.</p><div class="simple-table">${h.table(['Part', 'Job in this example'], [['Phone app', 'Ask and display the answer.'], ['App server', 'Find the requested result.'], ['Database', 'Keep the result records.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say a student logs in on server A. Each next request goes to A or B at random. The student makes 4 more requests. The chance all four reach A is 0.5 × 0.5 × 0.5 × 0.5 = 0.0625, or 6.25%. So about 94% of students would reach B at least once and be asked to log in again.</p><h4>How it works inside</h4><p>The phone does not send the whole session each time. It sends a short ID, usually in a cookie. A cookie is a small piece of data the browser stores and sends back with each request. The server uses the ID to find the session. A shared store lets either server do that lookup. Say it adds 1 ms to each request.</p><h4>When it goes wrong</h4><p>Another fix is to send each student to the same server every time. That skips the lookup. But if that server stops, its sessions are lost and those students must log in again. You will learn how traffic is split in Module 3.</p>`
  },
  tradeoffs:{use:[`For the results app, keep result records in the college database so both the phone and website read the same data.`, `Use the app server to answer individual result requests from either client.`], avoid:[`Do not assume a result shown earlier on the phone is still the college’s current record.`, `If a second app server is added, do not keep the only login record inside the first server.`], alt:[`For the 200-person test, one app server can be enough. Lesson 8 compares ways to grow later.`]},
  real:[
    {co:'GitHub API', tier:'confirmed', text:'GitHub documents requests from browsers, scripts, and other programs. Each client receives a response from a server.', src:'GitHub REST API documentation'},
    {co:'Django', tier:'confirmed', text:'Django can keep login sessions in a database so more than one app process can read them.', src:'Django session documentation'}
  ],
  mistakes:[`Calling the phone a server when it is the part asking for the result.`, `Forgetting that the server must send an answer the client can display.`],
  interview:[`Trace a result request from the phone to the database and back.`, `Explain how the website can ask the same server for a result.`],
  tryit:[{quiz:[
    {q:'Which part starts a request for a college result?', options:['The results database', 'The app server', 'The server room', 'The phone app'], answer:3, why:'The phone app is the client, so it asks first.'},
    {q:'What does the app server send back to the phone?', options:['A response with the result', 'A new phone', 'The whole database', 'Another request'], answer:0, why:'The server reads the record and responds with the requested result.'}
  ]}, {note:'Optional preview: log in, then view your result twice. Switch between one server’s memory and a shared login store. This shows a problem that can appear when more servers are added.', mount:(host, api) => statelessDemo(host, api)}],
  sources:[`GitHub REST API documentation`, `Django session documentation`]
},
{
  id:'web-request-journey', title:'The life of a web request', minutes:10, tags:['DNS','TCP','TLS','HTTP','latency'],
  summary:'A web request travels from a browser to a server and back. Finding the address, connecting, and drawing the answer also take time.',
  problem:`<h3>A small example</h3><p>A student opens the college results page. The app server finishes its work in 40 milliseconds, yet the page appears after 1.5 seconds.</p><ul><li>1 browser on the student’s phone</li><li>1 app server</li><li>1 results database</li></ul><p>Where did the rest of the time go?</p>`,
  intuition:`Use two stopwatches. One measures the server’s work. The other measures everything the student waits for, from opening the page to seeing the result.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the student’s first visit from the browser to the answer on screen.</p>',
    steps:[
      {icon:'🔎', title:'Find the site', text:'The browser turns the site name into an address it can contact.'},
      {icon:'🤝', title:'Open a connection', text:'The browser and the site set up a path for messages.'},
      {icon:'🔒', title:'Protect the connection', text:'They check the site’s identity and prepare to send private data safely.'},
      {icon:'📨', title:'Ask and read', text:'The browser asks for the page. The app server reads the needed result from the database.'},
      {icon:'📄', title:'Return the answer', text:'The server sends a response. The browser may request more files before it can show the page.'}
    ],
    diagram:{title:'One visit from site name to visible page', w:800, h:280, alt:'The browser finds an address, connects, sends a request, and receives a page. The app can read a saved copy or the database.',
      nodes:[{id:'br', type:'client', label:'Browser', x:70, y:160}, {id:'dns', type:'ext', label:'Name lookup', x:250, y:55, w:130}, {id:'lb', type:'lb', label:'Site front door', x:300, y:190}, {id:'app', type:'service', label:'App server', x:495, y:190}, {id:'ca', type:'cache', label:'Saved copy', x:690, y:110}, {id:'db', type:'db', label:'Database', x:690, y:235}, {id:'cdn', type:'cdn', label:'Nearby file copy', x:495, y:55}],
      edges:[{from:'br', to:'dns'}, {from:'br', to:'lb'}, {from:'lb', to:'app'}, {from:'app', to:'ca'}, {from:'app', to:'db'}, {from:'br', to:'cdn', curve:.12}],
      steps:[
        {note:'The browser looks up the site address. You will learn DNS in Module 2.', flow:[['br', 'dns', 'name?'], ['dns', 'br', 'address']], hl:['dns']},
        {note:'The browser and site open a connection. You will learn TCP in Module 2.', flow:[['br', 'lb', 'hello'], ['lb', 'br', 'ready'], ['br', 'lb', 'continue']], hl:['lb'], dur:700},
        {note:'They prepare a protected connection. You will learn TLS in Module 2.', flow:[['br', 'lb', 'hello'], ['lb', 'br', 'site proof']], hl:['lb']},
        {note:'The browser asks for the page, and the front door passes that request to the app server.', flow:[['br', 'lb', 'page?'], ['lb', 'app']], hl:['app']},
        {note:'The app checks a saved copy, then reads the database. You will learn app caches in Module 4.', flow:[['app', 'ca', 'check'], ['ca', 'app', 'missing'], ['app', 'db', 'read'], ['db', 'app', 'result']], hl:['ca', 'db']},
        {note:'The answer returns. The browser finds that it needs another file to draw the page.', flow:[['app', 'lb', 'answer'], ['lb', 'br', 'page']], hl:['br']},
        {note:'A nearby copy provides that file. You will learn CDNs in Module 3.', flow:[['br', 'cdn', 'file?'], ['cdn', 'br', 'file']], hl:['cdn']}
      ]},
    html:`<h3>Everyday comparison</h3><p>The server’s stopwatch is like timing only the cook. The student waits for ordering, cooking, delivery, and opening the meal.</p><div class="simple-table">${h.table(['Stopwatch', 'What it measures'], [['App server', 'Work after the request reaches the app.'], ['Student', 'The whole wait until the page is usable.']])}</div><div class="callout tip"><b>Important point</b><p>Measure the whole visit before deciding which part needs a fix.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Slow part', 'Where to look'], [['Finding or connecting', 'Browser network timing.'], ['Preparing the result', 'App server and database timing.'], ['Drawing the page', 'File downloads and browser work.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say one first visit costs 60 ms to find the address, 200 ms to connect, 100 ms for the request and answer to travel, 40 ms of app work, and 1,100 ms for later files and drawing. Total: 60 + 200 + 100 + 40 + 1,100 = 1,500 ms.</p><p>App work is 40 ÷ 1,500, about 3% of the wait. Making the server twice as fast saves only 20 ms. Halving the 1,100 ms part saves 550 ms.</p><h4>When it goes wrong</h4><p>On a repeat visit, the browser may already know the address and hold an open connection. That removes 60 + 200 = 260 ms, leaving 1,240 ms. The 1,100 ms of file and drawing work remains.</p><h4>How it works inside</h4><p>Say the page needs 10 files at 100 ms each. One at a time costs 10 × 100 = 1,000 ms. Browsers fetch several at once. Five at a time costs 2 rounds × 100 = 200 ms. You will learn DNS, TCP and TLS in Module 2.</p>`
  },
  tradeoffs:{use:[`For the results page, compare browser timing with the 40 ms server log before choosing a change.`, `If later file downloads dominate, send smaller files before adding app server capacity.`], avoid:[`Do not treat the 40 ms server log as the student’s page time.`, `Do not change the database when most of the wait is in the browser.`], alt:[`If the database read dominates instead, study that read and measure the whole page again.`]},
  real:[
    {co:'Chrome DevTools', tier:'confirmed', text:'Its Network view separates address lookup, connection setup, server wait, and download time.', src:'Chrome DevTools Network reference'},
    {co:'Browser Navigation Timing', tier:'confirmed', text:'Browsers expose timing points for the visit that an app server log cannot see.', src:'MDN Navigation and resource timings'}
  ],
  mistakes:[`Using the server’s 40 ms as the page’s total time.`, `Improving server code before checking where the student actually waits.`],
  interview:[`Walk through address lookup, connection, request, server work, response, and drawing.`, `Name which stopwatch produced each number.`],
  tryit:[{quiz:[
    {q:'The app server takes 40 ms, but the page takes 1.5 seconds. What should you measure next?', options:['The database brand', 'The browser’s whole visit', 'Only the server again', 'The number of employees'], answer:1, why:'The student waits for network and browser work as well as server work.'},
    {q:'Which step can happen after the server sends the page?', options:['The student receives a new phone', 'The database becomes the client', 'The browser downloads another file', 'The server changes its name'], answer:2, why:'The browser may need more files before it can draw the page.'}
  ]}, {note:'In the request journey, increase round-trip time and watch connection setup grow. Reuse a warm connection to see setup bars disappear. You will learn the TCP and TLS details in Module 2.', pg:'request-journey'}],
  sources:[`Chrome DevTools Network reference`, `MDN Navigation and resource timings`, `RFC 8446: TLS 1.3`]
},
{
  id:'latency-numbers', title:'Latency numbers every engineer should know', minutes:8, tags:['latency','performance','memory','network'],
  summary:'Computer operations wait for different lengths of time. Rough latency numbers help you spot which wait matters most in an app.',
  problem:`<h3>A small example</h3><p>A teacher opens a class results page. The server reads 200 student records, one after another.</p><ul><li>200 records on the page</li><li>About 1 millisecond for each read</li><li>A goal of 150 milliseconds for the page</li></ul><p>Can the page meet that goal if it waits for each read before starting the next?</p>`,
  intuition:`Imagine adding one minute to a trip 200 times. Each minute seems small, but the trip grows by more than three hours. Small computer waits add up the same way.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Compare rough waits, then add the repeated reads on the class page.</p>',
    steps:[
      {icon:'📏', title:'Start with the units', text:'One millisecond is 1,000 microseconds. One microsecond is 1,000 nanoseconds.'},
      {icon:'🧠', title:'Read nearby data', text:'A processor may reach nearby data in about 1 nanosecond and main memory in about 100 nanoseconds.'},
      {icon:'💾', title:'Read a drive', text:'A local solid-state drive might take about 100 microseconds for one small random read.'},
      {icon:'🌐', title:'Cross a network', text:'A trip to another machine and back might take 0.5 milliseconds nearby or 150 milliseconds far away.'},
      {icon:'🧮', title:'Add repeated waits', text:'The class page waits about 200 × 1 millisecond = 200 milliseconds. That exceeds its 150 millisecond goal before drawing begins.'}
    ],
    stepper:{title:'If 1 nanosecond were 1 second…', dwell:2600, items:[
      {title:'Processor’s nearby memory', tag:'~1 ns → ~1 s', text:'A tiny store inside the processor answers quickly.'},
      {title:'Main memory', tag:'~100 ns → ~1.7 min', text:'Still inside one machine, but about 100 times the first example.'},
      {title:'Local drive read', tag:'~100 µs → ~1.2 days', text:'A local solid-state drive can take much longer than main memory.'},
      {title:'Nearby machine and back', tag:'~0.5 ms → ~5.8 days', text:'The request crosses a network and returns.'},
      {title:'Distant machine and back', tag:'~150 ms → ~4.8 years', text:'Distance can make a round trip much longer.'}
    ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Wait', 'If repeated 200 times'], [['1 millisecond', '200 milliseconds'], ['10 milliseconds', '2 seconds'], ['100 milliseconds', '20 seconds']])}</div><div class="callout tip"><b>Important point</b><p>Compare the waits that actually repeat in the request path. One small wait can become the main delay.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Class page choice', 'Effect to measure'], [['Read records together', 'Fewer separate waits.'], ['Read independent records at once', 'Shorter page wait, but more work at one moment.'], ['Keep reads one by one', 'Simple flow, but at least 200 milliseconds here.']])}</div>`,
    deep:`<h4>The numbers</h4><p>A 1 gigabit-per-second link sends 1,000,000,000 bits each second. Divide by 8 to get 125,000,000 bytes, or 125 MB. Sending 1 KB is 8,000 bits, and 8,000 ÷ 1,000,000,000 = 0.000008 seconds, or 8 microseconds.</p><p>Say each record is 1 KB. Sending all 200 takes 200 × 8 = 1,600 microseconds, or 1.6 ms. One combined read costing 1 ms plus 1.6 ms of sending is about 2.6 ms, not 200 ms.</p><h4>When it goes wrong</h4><p>Reading 20 records at a time takes 200 ÷ 20 = 10 rounds × 1 ms = 10 ms. But each round now waits for its slowest read. The database also does 20 jobs at once, so measure its load.</p><h4>How it works inside</h4><p>Light in a fibre cable travels about 200,000 km each second. So 1,000 km one way costs about 5 ms, and a round trip about 10 ms. No software can remove that.</p>`
  },
  tradeoffs:{use:[`For the class results page, combine 200 separate reads if the database can return them together.`, `If records can be read independently, try several reads at once and measure both page time and database work.`], avoid:[`Do not spend time reducing a tiny processor wait while the 200 reads take at least 200 milliseconds.`, `Do not assume the example drive or network times match the college’s machines.`], alt:[`If one grouped read is unavailable, send a smaller number of requests at once and measure again.`]},
  real:[
    {co:'Google', tier:'confirmed', text:'Jeff Dean’s 2009 talk compares memory, storage, and network operation times as an aid to estimation.', src:'Jeff Dean, LADIS 2009 keynote'}
  ],
  mistakes:[`Calling a 1 millisecond read cheap without counting 200 repeats.`, `Treating a rough hardware number as a measured page time.`],
  interview:[`Show 200 × 1 millisecond = 200 milliseconds before other work.`, `Name the operation and conditions behind every latency number.`],
  tryit:[{quiz:[
    {q:'If 200 records are read one by one at 1 millisecond each, how long do the reads take?', options:['1 millisecond', '20 milliseconds', '200 milliseconds', '2 seconds'], answer:2, why:'200 × 1 millisecond = 200 milliseconds.'},
    {q:'Which is usually slower in these rough examples?', options:['A main-memory access', 'A nearby processor read', 'They always take equal time', 'A distant network round trip'], answer:3, why:'The example distant round trip is measured in milliseconds, while memory reads are measured in nanoseconds.'}
  ]}, {note:'In the latency chart, compare main memory with a local drive read. Then compare a nearby round trip with a distant one.', pg:'latency-chart'}],
  sources:[`Jeff Dean, LADIS 2009 keynote`]
},
{
  id:'back-of-envelope', title:'Back-of-envelope estimation', minutes:10, tags:['estimation','QPS','storage','bandwidth','80/20'],
  summary:'A back-of-envelope estimate uses a few stated guesses to find a rough size for a system. The result tells you what to test next.',
  problem:`<h3>A small example</h3><p>A team is planning a URL shortener. People create short links and open them later.</p><ul><li>20 million visitors each day</li><li>20 link requests per visitor each day</li><li>More activity during the busiest period</li></ul><p>How many requests should the team test before choosing server capacity?</p>`,
  intuition:`Estimate a school event before ordering food. Count people, guess meals per person, then allow for a busy lunch hour. Write down each guess so it can be changed.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Keep the units beside each number so the arithmetic stays clear.</p>',
    steps:[
      {icon:'👥', title:'Count daily actions', text:'20 million visitors × 20 requests = 400 million requests each day.'},
      {icon:'🕒', title:'Find the average rate', text:'A day has 86,400 seconds. 400 million ÷ 86,400 is about 4,600 requests each second.'},
      {icon:'📈', title:'Allow for a peak', text:'Assume the busy period is five times the average. 4,600 × 5 is about 23,000 requests each second.'},
      {icon:'✍️', title:'Separate new links', text:'Assume 1% of requests create links. 400 million × 1% = 4 million new links each day.'},
      {icon:'🧪', title:'Choose a test', text:'Test link opening near 23,000 requests each second. Measure how much work each request creates.'}
    ],
    stepper:{title:'One URL shortener estimate, line by line', dwell:3400, items:[
      {title:'Write the assumptions', tag:'working guesses', text:'Use 20 million visitors each day, 20 requests each, 1% new links, and a five-times peak.'},
      {title:'Requests per day', tag:'people × actions', text:'20 million visitors × 20 requests = <b>400 million requests/day</b>.'},
      {title:'Average rate', tag:'÷ seconds/day', text:'400 million ÷ 86,400 seconds ≈ <b>4,600 requests/second</b> on average.'},
      {title:'Peak rate', tag:'× assumed peak', text:'4,600 × 5 ≈ <b>23,000 requests/second</b> during the busy period.'},
      {title:'New links', tag:'1% of requests', text:'400 million × 1% = <b>4 million new links/day</b>. At the same five-times peak, that is about <b>230 creations/second</b>.'},
      {title:'Stored records', tag:'bytes × time', text:'At 500 bytes per new link, 4 million links use about <b>2 GB of raw data/day</b>.'},
      {title:'Make a decision', tag:'measure next', text:'Load test link opening and creation near the estimated peak.'}
    ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Event planning', 'URL shortener'], [['People expected', 'Daily visitors'], ['Meals per person', 'Requests per visitor'], ['Lunch rush', 'Peak requests each second']])}</div><div class="callout tip"><b>Important point</b><p>An estimate is useful when every assumption and unit is visible.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['If this guess changes', 'Recalculate'], [['Visitors per day', 'Daily and average requests'], ['Peak multiplier', 'Busy-period request rate'], ['Share creating links', 'New records and storage']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say each new link record takes 500 bytes. Then 4 million × 500 = 2,000,000,000 bytes, or about 2 GB each day. Five years is 365 × 5 = 1,825 days, so 2 GB × 1,825 = 3,650 GB, or about 3.65 TB. Three copies make about 11 TB, before indexes and backups.</p><p>Writes are small. 4 million new links ÷ 86,400 seconds is about 46 each second. At the same 5 times peak, that is about 230 each second.</p><h4>When it goes wrong</h4><p>Check the units. If each peak response is 500 bytes, 23,000 × 500 = 11,500,000 bytes, or 11.5 MB each second. Multiply by 8 to get 92 megabits each second, about 9% of a 1 gigabit link. Both 500-byte sizes are assumptions. Change one input at a time to see which matters most.</p>`
  },
  tradeoffs:{use:[`For the URL shortener, test the estimated 23,000-request peak before choosing app server capacity.`, `Keep new-link storage separate from request rate because only 1% of these requests create records.`], avoid:[`Do not size the app only for the 4,600-request daily average.`, `Do not treat the five-times peak as a measured fact.`], alt:[`If visitor counts are unknown, estimate link openings and creations directly, then measure them after launch.`]},
  real:[
    {co:'NPCI', tier:'confirmed', text:'NPCI publishes monthly UPI transaction counts. Dividing by seconds gives an average rate, while a peak still needs separate evidence.', src:'NPCI UPI product statistics'}
  ],
  mistakes:[`Calling 400 million requests a per-second rate.`, `Using the daily average as the busy-period rate.`],
  interview:[`Show 20 million × 20 = 400 million requests each day.`, `Divide by 86,400, then state the assumed peak multiplier.`],
  tryit:[{quiz:[
    {q:'What is the average rate for 400 million requests in one day?', options:['About 4,600 each second', '400 million each second', 'About 23,000 each second', '20 each second'], answer:0, why:'400 million ÷ 86,400 seconds is about 4,600 each second.'},
    {q:'Why test near 23,000 requests each second?', options:['It is the number of new links', 'It is the assumed five-times peak', 'It is the measured database limit', 'It is the number of daily visitors'], answer:1, why:'4,600 average × 5 assumed peak = about 23,000.'}
  ]}, {note:'Choose the URL shortener preset. Raise “Peak ÷ average” and watch the peak rate change while the average stays the same.', pg:'envelope'}],
  sources:[`NPCI UPI product statistics`]
},
{
  id:'vertical-vs-horizontal', title:'Vertical vs horizontal scaling', minutes:8, tags:['scaling','scale up','scale out','stateless'],
  summary:'Vertical scaling gives one server more capacity. Horizontal scaling adds servers that share the work. Choose after measuring which part is full.',
  problem:`<h3>A small example</h3><p>The URL shortener from Lesson 7 expects a busy hour. A test shows the app server fills first.</p><ul><li>About 23,000 requests each second at the assumed peak</li><li>1 busy app server</li><li>1 database with room for more work</li></ul><p>Should the team make that server bigger or add more servers?</p>`,
  intuition:`Think of a busy college kitchen. One cook can get a larger stove, or several cooks can share the orders. Either choice still depends on the pantry.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Compare both changes while the database still has room.</p>',
    steps:[
      {icon:'📊', title:'Measure the limit', text:'A load test shows the app server is busy while the database has spare capacity.'},
      {icon:'⬆️', title:'Make one server bigger', text:'Add processor power or memory to that server. This is vertical scaling.'},
      {icon:'↔️', title:'Add more servers', text:'Run several app servers and send each request to one of them. This is horizontal scaling.'},
      {icon:'🔀', title:'Share the work', text:'A traffic splitter sends requests to the servers. They must all reach the same results or login records.'},
      {icon:'🔍', title:'Check again', text:'The database may become the next limit. One large server also remains a single failure point.'}
    ],
    diagram:{title:'Scale up, then compare scaling out', w:760, h:290, alt:'One app server grows and reaches another limit. A traffic splitter then shares requests across several app servers.',
      nodes:[{id:'c', type:'client', label:'Users', x:70, y:145}, {id:'lb', type:'lb', label:'Traffic splitter', x:215, y:145, hidden:true}, {id:'s1', type:'service', label:'Server 1', sub:'4 vCPU', x:395, y:145}, {id:'s2', type:'service', label:'Server 2', sub:'8 vCPU', x:395, y:50, hidden:true}, {id:'s3', type:'service', label:'Server 3', sub:'8 vCPU', x:395, y:240, hidden:true}, {id:'db', type:'db', label:'Database', x:630, y:145}],
      edges:[{from:'c', to:'s1'}, {from:'c', to:'lb', hidden:true}, {from:'lb', to:'s1'}, {from:'lb', to:'s2'}, {from:'lb', to:'s3'}, {from:'s1', to:'db'}, {from:'s2', to:'db'}, {from:'s3', to:'db'}],
      steps:[
        {note:'One server answers requests. vCPU describes processor capacity.', flow:[['c', 's1', 'req'], ['s1', 'db'], ['db', 's1'], ['s1', 'c']], hl:['s1']},
        {note:'Traffic grows until this server is busy.', status:{s1:'hot'}, flow:[['c', 's1', 'req'], ['c', 's1', 'req'], ['c', 's1', 'req']], parallel:true, hl:['s1']},
        {note:'A bigger server has more processor capacity.', status:{s1:'ok'}, sub:{s1:'64 vCPU'}, hl:['s1']},
        {note:'Growing traffic can fill that bigger server too.', status:{s1:'hot'}, flow:[['c', 's1'], ['c', 's1'], ['c', 's1']], parallel:true},
        {note:'Several servers share requests through one traffic splitter.', reveal:['lb', 's2', 's3'], hideEdges:[['c', 's1']], showEdges:[['c', 'lb']], status:{s1:'ok'}, sub:{s1:'8 vCPU'}, flow:[['c', 'lb'], ['lb', 's2'], ['s2', 'db']], hl:['lb']},
        {note:'If one stops, another can answer when it has spare capacity.', status:{s2:'down'}, flow:[['c', 'lb'], ['lb', 's3'], ['s3', 'db']], hl:['s3']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Kitchen', 'App'], [['Give one cook a larger stove', 'Give one server more capacity.'], ['Add cooks and divide orders', 'Add servers and divide requests.'], ['Keep one shared pantry', 'All servers still use the database.']])}</div><div class="callout tip"><b>Important point</b><p>Scale the part that is full, then measure the whole request path again.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Choice', 'Useful when'], [['Bigger server', 'One machine can meet the tested peak.'], ['More servers', 'One machine is too small or another app path is needed.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say one small server handles 2,000 requests each second. The peak is 23,000, and 23,000 ÷ 2,000 = 11.5, so 12 servers just cover it. With 30% spare room, 23,000 × 1.3 = 29,900. Then 29,900 ÷ 2,000 = 14.95, so 15 servers. To survive losing one server, 13 is enough: 12 × 2,000 = 24,000 is still above 23,000.</p><h4>When it goes wrong</h4><p>More app servers mean more database connections. Say each server keeps 20 open. Then 15 × 20 = 300 connections. If the database allows only 200, the new servers can break it, even though it had spare processing power.</p><h4>How it works inside</h4><p>A bigger machine has a ceiling. There is a largest machine you can buy. Doubling a machine also rarely doubles its work, because threads compete for shared resources such as memory and locks. Measure before you pay.</p>`
  },
  tradeoffs:{use:[`For the URL shortener, choose a bigger server if one tested machine can cover the peak.`, `Choose several servers if the tested peak needs them or the app needs another working path.`], avoid:[`Do not add app servers if the shared database is already full.`, `Do not assume one failed server causes no interruption. Detection and spare capacity matter.`], alt:[`Remove avoidable app work, then test again before buying capacity.`]},
  real:[
    {co:'Stack Overflow', tier:'confirmed', text:'Its 2016 architecture account says one web server could carry the measured traffic in tests, while the site ran more servers.', src:'Nick Craver, Stack Overflow architecture (2016)'},
    {co:'Amazon ELB', tier:'confirmed', text:'AWS documents sending requests to healthy app servers. The servers still need enough capacity.', src:'AWS Elastic Load Balancing documentation'}
  ],
  mistakes:[`Buying more app servers before checking which part is full.`, `Forgetting that all app servers still use the same database.`],
  interview:[`Name the measured limit before choosing a scaling direction.`, `Explain how requests reach several servers and what they share.`, `Say what happens if one app server stops at peak traffic.`],
  tryit:[{quiz:[
    {q:'What does vertical scaling change?', options:['The number of users', 'The length of a request', 'The capacity of one server', 'The number of databases'], answer:2, why:'Vertical scaling gives one machine more capacity.'},
    {q:'What must several app servers still share in the URL shortener?', options:['One server’s private memory', 'One processor', 'One screen', 'The link records in the database'], answer:3, why:'Each server must find the same link records.'}
  ]}, {note:'Set peak traffic near 23,000 requests each second. Compare the cost, capacity, and failure rows for one large server and several small servers.', mount:host => scaleCalc(host)}],
  sources:[`Nick Craver, Stack Overflow architecture (2016)`, `AWS Elastic Load Balancing documentation`]
},
{
  id:'latency-vs-throughput', title:'Latency vs throughput (and why queues explode)', minutes:9, tags:['latency','throughput','queueing','Little’s law','utilization'],
  summary:'Latency is the time one request takes from arrival to answer. Throughput is how many requests finish each second. A busy worker can make latency grow through waiting.',
  problem:`<h3>A small example</h3><p>A payment worker needs about 10 milliseconds to finish one request. A campaign brings customers close to its limit.</p><ul><li>1 worker</li><li>About 100 payments each second at full capacity</li><li>95 new payments each second during the campaign</li></ul><p>Why can customers still wait when 95 is less than 100?</p>`,
  intuition:`Think of one toll booth. Cars may arrive in groups, even when the average rate is below the booth’s capacity. The booth works, but the cars behind the first one wait.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Watch the waiting line as arrivals approach the worker’s capacity.</p>',
    steps:[
      {icon:'⏱️', title:'Time one payment', text:'The worker spends about 10 milliseconds doing its work. A customer also waits for earlier requests.'},
      {icon:'📤', title:'Count completed work', text:'A continuously busy worker can finish about 100 payments each second. That completion rate is throughput.'},
      {icon:'📥', title:'Compare arrivals', text:'At 50 arrivals each second, the worker is half busy. At 95, it is 95% busy.'},
      {icon:'🚗', title:'Watch the line', text:'Requests arrive in groups. Near full capacity, the worker has little free time to clear a group.'},
      {icon:'📈', title:'See latency grow', text:'In this simple model, average total time rises from 20 milliseconds at 50 arrivals to 200 at 95.'}
    ],
    mount:(host, api) => queueCurve(host, api),
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Toll booth', 'Payment worker'], [['Time at the booth', '10 milliseconds of work'], ['Cars served each minute', 'Payments finished each second'], ['Time in line plus service', 'Customer latency']])}</div><div class="callout tip"><b>Important point</b><p>Work can stay at 10 milliseconds while waiting makes the customer’s total time much longer.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Arrival rate', 'What to check'], [['50 per second', 'The line usually clears between groups.'], ['95 per second', 'Measure waiting and keep room for bursts.'], ['Above 100 per second', 'Add capacity or limit new work before the line grows without end.']])}</div>`,
    deep:`<h4>The numbers</h4><p>A simple one-worker model says average total time = 1 ÷ (capacity − arrivals). Capacity is 100 each second. At 50 arrivals: 1 ÷ 50 = 0.02 seconds. At 95: 1 ÷ 5 = 0.2 seconds. At 99: 1 ÷ 1 = 1 second. Going from 95 to 99 arrivals is about 4% more work, but the wait is 5 times longer.</p><p>Little's Law says average requests in the system = arrivals × average time. At 50: 50 × 0.02 = 1. At 95: 95 × 0.2 = 19. At 99: 99 × 1 = 99.</p><h4>When it goes wrong</h4><p>If 105 arrive each second, the line grows by 105 − 100 = 5 each second. After 60 seconds, 5 × 60 = 300 are waiting. A new request then waits 300 × 10 ms = 3 seconds. The model assumes random arrivals. A perfectly even stream of 95 would never form a line.</p>`
  },
  tradeoffs:{use:[`For the campaign, leave enough worker capacity to clear groups of arriving payments.`, `Add another worker if tests show the first one is the limit and the database has room.`], avoid:[`Do not promise 10 millisecond customer latency from 10 milliseconds of worker time.`, `Do not let a line grow forever when arrivals stay above 100 each second.`], alt:[`If the service is full, reject some new work clearly. You will learn more controls in Module 9.`]},
  real:[
    {co:'Google Search', tier:'confirmed', text:'Google reported that added search delay reduced search activity in an experiment.', src:'Google Research, Speed Matters (2009)'}
  ],
  mistakes:[`Treating 100 payments each second of capacity as a promise of low latency at 95 arrivals.`, `Counting only worker time and ignoring the waiting line.`],
  interview:[`Define latency and throughput using the payment worker.`, `Explain why 95 arrivals can still create long waits with capacity for 100.`],
  tryit:[{quiz:[
    {q:'What is throughput in the payment example?', options:['Payments finished each second', 'Time one customer waits', 'Number of open screens', 'The size of each payment'], answer:0, why:'Throughput counts completed requests over time.'},
    {q:'Why can latency rise near 95 arrivals per second?', options:['The day becomes shorter', 'The worker has little free time to clear groups', 'Each payment needs a new database', 'The worker stops doing work'], answer:1, why:'A small burst waits behind earlier requests when the worker is nearly full.'}
  ]}, {note:'Set one server to 50 arrivals each second, then try 95. Watch the waiting line and average time. Add a second server and compare again.', mount:(host, api) => queueSim(host, api)}],
  sources:[`MIT OpenCourseWare, M/M/1 queue`, `Google Research, Speed Matters (2009)`]
},
{
  id:'percentiles-tail-latency', title:'p50, p95, p99 and tail latency', minutes:9, tags:['p99','percentiles','tail latency','fan-out','hedged requests'],
  summary:'A percentile tells you how many requests finish within a given time. p50 shows the middle request. p95 and p99 reveal slower experiences that an average can hide.',
  problem:`<h3>A small example</h3><p>A shop’s home page usually opens quickly, but some customers wait several seconds.</p><ul><li>1,000 measured page loads</li><li>980 finish in about 100 milliseconds</li><li>20 take about 4 seconds</li></ul><p>Which number tells the team about those slow customers?</p>`,
  intuition:`Think of 100 people waiting for a bus. The middle person’s wait does not show how long the last few waited. Percentiles let you describe both groups.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Sort page times from fastest to slowest, then look at the position you care about.</p>',
    steps:[
      {icon:'📋', title:'Sort the times', text:'Put every measured page load in order from fastest to slowest.'},
      {icon:'👤', title:'Find p50', text:'The middle value is p50. Half the loads finished at or below that time.'},
      {icon:'👥', title:'Find p95', text:'The p95 value covers 95 of every 100 loads. Five in 100 were slower.'},
      {icon:'🐢', title:'Find p99', text:'The p99 value covers 99 of every 100 loads. It helps reveal the slow end of the experience.'},
      {icon:'🧩', title:'Check the whole page', text:'If a page waits for five parts, one slow part can delay the answer everyone sees.'}
    ],
    diagram:{title:'One slow part delays a page', w:760, h:300, alt:'A page server asks five other parts at once. Four answer quickly, but one takes longer, so the page waits.',
      nodes:[{id:'u', type:'client', label:'Customer', x:70, y:150}, {id:'ag', type:'service', label:'Page server', x:250, y:150, w:140}, {id:'b1', type:'service', label:'Profile', x:520, y:35, w:110}, {id:'b2', type:'service', label:'Cart', x:520, y:95, w:110}, {id:'b3', type:'service', label:'Offers', x:520, y:155, w:110}, {id:'b4', type:'service', label:'Reviews', x:520, y:215, w:110}, {id:'b5', type:'service', label:'Picks', x:520, y:272, w:110}],
      edges:[{from:'u', to:'ag'}, {from:'ag', to:'b1'}, {from:'ag', to:'b2'}, {from:'ag', to:'b3'}, {from:'ag', to:'b4'}, {from:'ag', to:'b5'}],
      steps:[
        {note:'A customer asks for the home page.', flow:[['u', 'ag', 'page?']], hl:['ag']},
        {note:'The page server asks five parts at the same time.', flow:[['ag', 'b1'], ['ag', 'b2'], ['ag', 'b3'], ['ag', 'b4'], ['ag', 'b5']], parallel:true},
        {note:'Four parts answer in about 20 milliseconds.', flow:[['b1', 'ag', '20ms'], ['b2', 'ag'], ['b3', 'ag'], ['b4', 'ag']], parallel:true, dur:600},
        {note:'Picks takes 400 milliseconds. The page still waits for it.', status:{b5:'hot'}, flow:[['b5', 'ag', '400ms']], dur:2600, hl:['b5']},
        {note:'The customer receives the page after the slow part answers.', flow:[['ag', 'u', 'slow page']], hl:['u']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Bus wait', 'Page load'], [['Middle person’s wait', 'p50 shows the usual experience.'], ['95th person’s wait', 'p95 shows a slower experience.'], ['99th person’s wait', 'p99 looks near the slow end.']])}</div><div class="callout tip"><b>Important point</b><p>Show the typical time and the slow time. One average cannot describe both.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Number', 'Question it answers'], [['p50', 'What does a typical customer see?'], ['p95', 'How slow are the slowest few in twenty?'], ['p99', 'How slow are the slowest few in a hundred?']])}</div>`,
    deep:`<h4>The numbers</h4><p>The average is (980 × 100 + 20 × 4,000) ÷ 1,000 = (98,000 + 80,000) ÷ 1,000 = 178 ms. Nobody actually waited 178 ms. Both p50 and p95 are 100 ms, because the 500th and 950th sorted loads are fast. The p99 is 4 seconds, because the 990th load is in the slow group, loads 981 to 1,000.</p><h4>When it goes wrong</h4><p>Say a page has 5 parts and each is slow 1% of the time. The chance at least one is slow is 1 − 0.99⁵, about 4.9%. With 100 parts it is 1 − 0.99¹⁰⁰, about 63%. This assumes the parts fail independently.</p><h4>How it works inside</h4><p>Never average p99 values. Say server A has 900 requests at 100 ms and server B has 100 requests at 4,000 ms. The average of their p99 values is (100 + 4,000) ÷ 2 = 2,050 ms. The real p99 over all 1,000 requests is 4,000 ms. Instead, keep counts per time range, called a histogram, and add the counts first.</p>`
  },
  tradeoffs:{use:[`For the shop page, use p50 to describe most visits and p99 to show the slow few.`, `Measure the entire page when it waits for several parts.`], avoid:[`Do not call a 178 millisecond average proof that every customer has a quick page.`, `Do not average p99 numbers from separate servers.`], alt:[`Keep a chart of all response times when the shape matters more than one number.`]},
  real:[
    {co:'Google', tier:'confirmed', text:'The Tail at Scale explains how waiting for many parts makes a slow page more likely.', src:'Dean and Barroso, The Tail at Scale (2013)'}
  ],
  mistakes:[`Reporting only the average for a page with some very slow visits.`, `Measuring each page part while ignoring the time the customer waits for all of them.`],
  interview:[`Explain p50, p95, and p99 using 100 sorted page loads.`, `Show why one slow part can delay the whole page.`],
  tryit:[{quiz:[
    {q:'If p95 is 500 milliseconds, what does it say?', options:['The average is 500 milliseconds', 'Only five loads were measured', '95% of measured loads finished within 500 milliseconds', 'Every load took exactly 500 milliseconds'], answer:2, why:'p95 is a time at or below which 95% of measured loads finished.'},
    {q:'Why can five quick parts still make a slow page?', options:['Quick parts turn into databases', 'The average controls every visit', 'p50 is always four seconds', 'The page waits for one slow part too'], answer:3, why:'The page is ready only after the parts it needs have answered.'}
  ]}, {note:'Increase the number of page parts and watch the slowest page loads. The later request-hedging option is an advanced preview.', pg:'tail-latency'}],
  sources:[`Dean and Barroso, The Tail at Scale (2013)`]
},
{
  id:'availability-nines', title:'Availability and the “nines”', minutes:9, tags:['availability','nines','redundancy','MTTR'],
  summary:'Availability is how often people can use a service successfully. “Nines” are a short way to name percentages such as 99.9% and 99.99%.',
  problem:`<h3>A small example</h3><p>The college results app needs a front door, an app server, and a database. A student needs all three to answer.</p><ul><li>Front door available 99.99% of the time</li><li>App server available 99.9%</li><li>Database available 99.95%</li></ul><p>How often can the whole result request succeed?</p>`,
  intuition:`Think of three lights wired in one line. If any light goes out, the line goes dark. A request through several required parts has the same problem.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the request, then add a second app server.</p>',
    steps:[
      {icon:'✅', title:'Count successful time', text:'Availability can be measured as time the app works divided by total time.'},
      {icon:'🔗', title:'Follow required parts', text:'The front door, app server, and database must all work for this result request.'},
      {icon:'🧮', title:'Combine their chances', text:'The example values multiply to about 99.84% for the whole path.'},
      {icon:'🖥️', title:'Add a spare app server', text:'If one app server stops, the other can answer after the front door notices.'},
      {icon:'🗄️', title:'Check the next weak part', text:'Both app servers still need the database. A second app server alone cannot protect it.'}
    ],
    diagram:{title:'A result request needs every part', w:760, h:280, alt:'A front door sends a student to an app server and database. A second app server and standby database add spare paths.',
      nodes:[{id:'c', type:'client', label:'Students', x:70, y:130}, {id:'lb', type:'lb', label:'Front door', sub:'99.99%', x:220, y:130, w:110}, {id:'a1', type:'service', label:'App 1', sub:'99.9%', x:400, y:80, w:110}, {id:'a2', type:'service', label:'App 2', sub:'99.9%', x:400, y:190, w:110, hidden:true}, {id:'db', type:'db', label:'Results DB', sub:'99.95%', x:600, y:80}, {id:'db2', type:'db', label:'Standby DB', sub:'ready', x:600, y:200, hidden:true}],
      edges:[{from:'c', to:'lb'}, {from:'lb', to:'a1'}, {from:'lb', to:'a2'}, {from:'a1', to:'db'}, {from:'a2', to:'db'}, {from:'db', to:'db2', dashed:true, label:'keep copy'}],
      steps:[
        {note:'Every part in this path must work. The example gives about 99.84% for the whole path.', flow:[['c', 'lb'], ['lb', 'a1'], ['a1', 'db']], hl:['lb', 'a1', 'db']},
        {note:'A second app server gives the front door another path.', reveal:['a2'], flow:[['c', 'lb'], ['lb', 'a2'], ['a2', 'db']], hl:['a2']},
        {note:'App 1 stops. Some requests may fail before the front door switches to App 2.', status:{a1:'down'}, flow:[['c', 'lb'], ['lb', 'a2'], ['a2', 'db']]},
        {note:'The database is still required for every result.', status:{a1:'ok', db:'hot'}, hl:['db']},
        {note:'A standby database can provide another path when the first database stops.', reveal:['db2'], status:{db:'ok'}, flow:[['db', 'db2', 'copy']], hl:['db2']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Lights', 'Results app'], [['All lights in one line must work', 'Every required part must work.'], ['A spare light has its own path', 'A spare app server can answer.']])}</div><div class="callout tip"><b>Important point</b><p>Adding a spare helps only when it can work without the failed part.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Availability', 'Possible downtime in one year'], [['99%', 'About 3.65 days'], ['99.9%', 'About 8.76 hours'], ['99.99%', 'About 52.6 minutes']])}</div>`,
    deep:`<h4>The numbers</h4><p>The single path is 0.9999 × 0.999 × 0.9995 = about 0.9984. A year has 8,760 hours, so 0.16% × 8,760 is about 14 hours of possible downtime.</p><p>Now add a second app server. Say the two fail independently. Both are down 0.001 × 0.001 = 0.000001, so the pair is 99.9999% available. The path becomes 0.9999 × 0.999999 × 0.9995 = about 0.9994. That is 0.06% × 8,760, about 5.3 hours. The database now causes most of it: 0.05% × 8,760 is about 4.4 hours.</p><h4>When it goes wrong</h4><p>If both servers sit on one machine that is down 0.1% of the time, the pair is no better than one server.</p><h4>How it works inside</h4><p>Count requests too. Say 1,000,000 valid requests produce 1,500 errors. Then 998,500 ÷ 1,000,000 = 99.85%, even if every server was running.</p>`
  },
  tradeoffs:{use:[`For the results app, add a spare app server if release-time availability needs another working path.`, `Check the front door and database too because both remain required.`], avoid:[`Do not call two app servers independent if they share one source of power.`, `Do not promise a whole path is 99.9% available just because one part is 99.9%.`], alt:[`Recover a failed app server faster if a second running server is too costly for the small test.`]},
  real:[
    {co:'Google', tier:'confirmed', text:'Google’s availability guidance shows how required parts limit the service that depends on them.', src:'Treynor and others, The Calculus of Service Availability (2017)'}
  ],
  mistakes:[`Using one part’s availability number for the whole results app.`, `Adding a spare server that can fail for the same reason as the first.`],
  interview:[`Multiply the required parts’ availability numbers in a simplified model.`, `Explain what a spare app server protects and what it leaves shared.`],
  tryit:[{quiz:[
    {q:'If every result request needs three parts, what happens when any one stops?', options:['The request can fail', 'The other two become faster', 'Availability becomes 100%', 'The student gets two results'], answer:0, why:'The path needs all three parts to answer.'},
    {q:'About how much downtime can 99.9% availability mean in one year?', options:['No downtime', '8.76 hours', '52.6 minutes', '3.65 days'], answer:1, why:'0.1% of 8,760 hours is 8.76 hours.'}
  ]}, {note:'Convert availability percentages to yearly downtime. Add a spare app path and see which required part remains.', pg:'nines'}],
  sources:[`Treynor and others, The Calculus of Service Availability (2017)`]
},
{
  id:'sli-slo-sla', title:'SLI, SLO, SLA and error budgets', minutes:9, tags:['SLI','SLO','SLA','error budget','burn rate'],
  summary:'An SLI measures how the service performs. An SLO is the team’s target, and an SLA is a promise in a contract. The error budget counts how much failure the target allows.',
  problem:`<h3>A small example</h3><p>A company runs the college results app. The college wants a clear promise for result requests.</p><ul><li>100,000 valid requests in 30 days</li><li>Some requests may fail during changes or faults</li><li>The company needs a measured target</li></ul><p>How many failed requests can the team allow while meeting its goal?</p>`,
  intuition:`A delivery service measures completed deliveries, sets an internal on-time goal, and may promise a refund when its contract is missed. The result app can measure, target, and promise in the same order.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Use successful result requests as the measure for this example.</p>',
    steps:[
      {icon:'📏', title:'Measure success', text:'The SLI is successful requests divided by valid requests during a chosen period.'},
      {icon:'🎯', title:'Set a target', text:'The SLO says at least 99.9% should succeed over 30 days.'},
      {icon:'📄', title:'State a contract', text:'An SLA can promise the college 99.5%, with a stated consequence if missed.'},
      {icon:'🧮', title:'Count the budget', text:'100,000 × 0.1% = 100 failed requests allowed by the 99.9% SLO.'},
      {icon:'🚦', title:'Use the result', text:'If failures spend that budget too quickly, the team can pause risky changes and fix the app.'}
    ],
    stepper:{title:'From measurement to decisions', items:[
      {title:'SLI', tag:'measure', text:'Count successful result requests and divide by all valid result requests.'},
      {title:'SLO', tag:'target', text:'Aim for at least 99.9% successful requests over 30 days.'},
      {title:'SLA', tag:'contract', text:'Promise the college 99.5% in the contract, with a stated consequence if the company misses it.'},
      {title:'Error budget', tag:'allowed failures', text:'For 100,000 valid requests, the 99.9% goal allows 100 failures.'},
      {title:'Burn rate', tag:'speed', text:'Compare the current failure rate with the 0.1% allowed rate to see how fast the budget is used.'},
      {title:'Policy', tag:'decision', text:'Agree ahead of time when the team keeps releasing, slows down, or works on reliability.'}
    ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Delivery service', 'Results app'], [['Measure on-time deliveries', 'Measure successful result requests.'], ['Set an internal goal', 'Set a 99.9% SLO.'], ['Promise a customer', 'Put a 99.5% SLA in a contract.']])}</div><div class="callout tip"><b>Important point</b><p>Choose a measure students feel, then put a number and time period on the target.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Question', 'Answer in this example'], [['What do we count?', 'Successful and valid requests.'], ['What is the target?', '99.9% over 30 days.'], ['How much failure fits?', '100 of 100,000 valid requests.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say requests arrive evenly. Then 100,000 ÷ 30 days is about 3,333 a day, or about 2.3 a minute. In a full outage every request fails, so 100 failures take about 100 ÷ 2.3 = 43 minutes. The exact time is 30 × 24 × 60 × 0.001 = 43.2 minutes. A 1-hour outage fails about 139 requests and spends the whole budget.</p><p>The 99.5% SLA allows 100,000 × 0.5% = 500 failures. So the stricter SLO gives the team 500 − 100 = 400 requests of warning before the contract is broken.</p><h4>How it works inside</h4><p>Burn rate is the current failure rate divided by the allowed rate. If 0.2% of requests fail and the SLO allows 0.1%, the burn rate is 0.2 ÷ 0.1 = 2. The budget then lasts 30 ÷ 2 = 15 days. At a burn rate of 10, it lasts 3 days. You will learn alerts in Module 11.</p>`
  },
  tradeoffs:{use:[`For the results app, use successful requests as the SLI because it reflects whether students get answers.`, `Use the budget to decide when the team should work on reliability before another release.`], avoid:[`Do not use server CPU as the only SLI. A busy server can still answer students.`, `Do not set a 100% SLO when the team needs room to make changes.`], alt:[`For an early 200-person test, count failures and review them manually before adopting a formal contract.`]},
  real:[
    {co:'Google', tier:'confirmed', text:'Google’s SRE books describe setting service targets and using error budgets to guide release decisions.', src:'Google SRE book and Workbook'},
    {co:'AWS', tier:'confirmed', text:'AWS publishes service agreements with credits when stated availability commitments are missed.', src:'AWS service level agreements'}
  ],
  mistakes:[`Calling a server healthy while valid result requests are failing.`, `Turning a request-failure budget into downtime minutes without checking traffic.`],
  interview:[`Define the SLI from the student’s result request, then give the target and window.`, `Calculate 100,000 × 0.1% = 100 allowed failures.`],
  tryit:[{quiz:[
    {q:'Which term is the measured share of successful result requests?', options:['SLA', 'Server name', 'SLI', 'SLO'], answer:2, why:'The SLI is the measurement.'},
    {q:'At 99.9% success over 100,000 valid requests, how many failures fit the target?', options:['1', '1,000', '10,000', '100'], answer:3, why:'100,000 × 0.1% = 100.'}
  ]}, {note:'Set 99.9% and 100,000 requests in the calculator. Compare the allowed failed requests with the conditional full-outage time.', mount:host => budgetCalc(host)}],
  sources:[`Google SRE book and Workbook`, `AWS service level agreements`]
},
{
  id:'fault-tolerance-spof', title:'Fault tolerance and single points of failure', minutes:9, tags:['SPOF','fault tolerance','redundancy','failure domain','blast radius'],
  summary:'A single point of failure is one part whose loss stops the whole app. Fault tolerance means the app can keep serving through a part’s failure.',
  problem:`<h3>A small example</h3><p>The college results app adds two app servers, but both use one store to remember student logins.</p><ul><li>2 app servers</li><li>1 shared login store</li><li>1 results database</li></ul><p>What happens if the only login store stops during results night?</p>`,
  intuition:`A wedding with one generator goes dark when that generator stops. A second generator helps if it has its own fuel and can take over.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one login store failure through the app.</p>',
    steps:[
      {icon:'🔑', title:'One store remembers logins', text:'Both app servers ask the same store whether a student is logged in.'},
      {icon:'💥', title:'That store stops', text:'Neither app server can check the login. Students cannot view their results.'},
      {icon:'📥', title:'Students try again', text:'Many login attempts now reach the database at once. That can slow other work too.'},
      {icon:'🔍', title:'Find the single point', text:'The one login store is a single point of failure because its loss blocks the request path.'},
      {icon:'🛠️', title:'Provide another path', text:'Keep a standby store and test that the app can use it when the first stops.'}
    ],
    diagram:{title:'One login store can block everyone', w:780, h:290, alt:'Two app servers share one login store. When it stops, logins crowd the database. A standby store adds another path.',
      nodes:[{id:'u', type:'client', label:'Students', x:70, y:145}, {id:'lb', type:'lb', label:'Front door', x:220, y:145}, {id:'a1', type:'service', label:'App 1', x:395, y:85, w:110}, {id:'a2', type:'service', label:'App 2', x:395, y:205, w:110}, {id:'r', type:'cache', label:'Login store', x:600, y:60}, {id:'r2', type:'cache', label:'Standby store', x:600, y:145, hidden:true}, {id:'db', type:'db', label:'Results DB', x:600, y:240}],
      edges:[{from:'u', to:'lb'}, {from:'lb', to:'a1'}, {from:'lb', to:'a2'}, {from:'a1', to:'r'}, {from:'a2', to:'r'}, {from:'a1', to:'db'}, {from:'a2', to:'db'}, {from:'r', to:'r2', dashed:true}, {from:'a1', to:'r2'}, {from:'a2', to:'r2'}],
      steps:[
        {note:'Both app servers check logins in one shared store.', flow:[['u', 'lb'], ['lb', 'a1'], ['a1', 'r', 'login?'], ['r', 'a1', 'ok']], hl:['r']},
        {note:'The only login store stops answering.', status:{r:'down'}, hl:['r']},
        {note:'Many students try logging in again. The database gets more work.', flow:[['u', 'lb'], ['lb', 'a1'], ['a1', 'db', 'login'], ['lb', 'a2'], ['a2', 'db', 'login']], hl:['db']},
        {note:'The busy database can now delay result requests too.', status:{db:'hot', a1:'hot', a2:'hot'}},
        {note:'A standby login store offers a working path after a switch.', reveal:['r2'], status:{db:'ok', a1:'ok', a2:'ok'}, flow:[['u', 'lb'], ['lb', 'a2'], ['a2', 'r2', 'login?'], ['r2', 'a2', 'ok']], hl:['r2']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Wedding venue', 'Results app'], [['One generator powers everything', 'One login store serves both app servers.'], ['A second generator can take over', 'A standby store can answer after a switch.']])}</div><div class="callout tip"><b>Important point</b><p>Two app servers are not enough when both depend on one failing part.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Question', 'Check'], [['What if this box stops?', 'Does a student still get a result?'], ['Is the spare truly separate?', 'Could one fault stop both stores?'], ['Has the switch been tested?', 'Measure errors while the first store stops.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the login store is up 99.9% of the time. Then 0.1% × 8,760 hours is about 8.8 hours a year when no student can log in, however many app servers you add. A standby that fails independently changes this. Both are down 0.001 × 0.001 = 0.000001 of the time, about 32 seconds a year.</p><p>The switch itself costs time. Say the store fails twice a year. Say it takes 15 seconds to notice and 15 more to switch. That is 30 × 2 = 60 seconds of errors a year. Switch time often matters more than the formula.</p><h4>When it goes wrong</h4><p>The standby gets its copy of the data with a delay. Say it is 2 seconds behind. Students who logged in during those 2 seconds are not found, and must log in again. You will learn about copying data in Module 5.</p>`
  },
  tradeoffs:{use:[`For results night, a standby login store can keep student requests working after the first store stops.`, `Test the switch before the release rush, including the time it takes to notice failure.`], avoid:[`Do not place both login stores on one machine and call them independent.`, `Do not assume the switch causes no failed requests.`], alt:[`For the small 200-person test, accept a short login outage and plan a quick restart if that meets the college’s need.`]},
  real:[
    {co:'AWS', tier:'confirmed', text:'A 2021 AWS event affected several services in one region. Sharing a region can make failures spread.', src:'AWS Post-Event Summary, December 2021'}
  ],
  mistakes:[`Counting two app servers as protection while both need the one login store.`, `Keeping a standby on the same machine as the first store.`],
  interview:[`Follow one student request and ask what happens if each part stops.`, `Name which shared part can still block both app servers.`],
  tryit:[{quiz:[
    {q:'Why is the one login store a single point of failure?', options:['Its loss blocks both app servers from checking logins', 'It has a short name', 'It stores only one student', 'It is the fastest part'], answer:0, why:'Both app servers depend on that one store.'},
    {q:'What should a standby store have to help?', options:['No way to take over', 'A separate working path and needed login data', 'The same power feed only', 'A different color'], answer:1, why:'The app needs another path that still has the information required to answer.'}
  ]}, {note:'Start with the single-path design. Stop one box and see whether a request still reaches the data. Then try the design with spare paths.', mount:(host, api) => spofHunter(host, api)}],
  sources:[`AWS Post-Event Summary, December 2021`]
},
{
  id:'monolith-to-microservices', title:'Monolith → modular monolith → microservices', minutes:10, tags:['monolith','microservices','modular monolith','strangler fig','Conway’s law'],
  summary:'A monolith runs an app as one deployed unit. A modular monolith keeps that unit but separates its parts inside. Microservices run the parts as separate services.',
  problem:`<h3>A small example</h3><p>A company now runs the results app for many colleges. Its team works on three areas.</p><ul><li>Student login</li><li>Result lookup</li><li>Notices about changes</li></ul><p>Should these areas stay in one app or run as separate services?</p>`,
  intuition:`One shop can have clear sections while sharing one front door. Separate shops can open on different schedules, but customers must travel between them. Software has the same choice.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Compare three ways to organize the same results platform.</p>',
    steps:[
      {icon:'🏠', title:'Keep one app', text:'Login, results, and notices live in one codebase and are released together. That is a monolith.'},
      {icon:'🧱', title:'Separate inside', text:'Give each area a clear module and keep one release. That is a modular monolith.'},
      {icon:'🏘️', title:'Separate services', text:'Run each area as its own service with its own data. Each team can release its part separately.'},
      {icon:'🌐', title:'Count the new cost', text:'Separate services must communicate over a network. A slow or failed call can affect another service.'},
      {icon:'⚖️', title:'Choose for today', text:'Start with the simplest shape that lets the team meet its needs. Split a part when independent release or capacity is worth the extra work.'}
    ],
    diagram:{title:'Three shapes of the results platform', w:760, h:300, alt:'One results app becomes an app with clear internal modules, then separate login, results, and notices services.',
      nodes:[{id:'c', type:'client', label:'Students', x:60, y:150}, {id:'gw', type:'lb', label:'Front door', x:205, y:150, hidden:true}, {id:'m', type:'service', label:'One app', sub:'login · results · notices', x:400, y:150, w:200, h:60}, {id:'mdb', type:'db', label:'One shared DB', x:640, y:150, w:140}, {id:'su', type:'service', label:'Login service', x:400, y:55, hidden:true}, {id:'so', type:'service', label:'Results service', x:400, y:150, hidden:true}, {id:'sp', type:'service', label:'Notices service', x:400, y:245, hidden:true}, {id:'du', type:'db', label:'Login DB', x:640, y:55, hidden:true}, {id:'do', type:'db', label:'Results DB', x:640, y:150, hidden:true}, {id:'dp', type:'db', label:'Notices DB', x:640, y:245, hidden:true}],
      edges:[{from:'c', to:'m'}, {from:'m', to:'mdb'}, {from:'c', to:'gw', hidden:true}, {from:'gw', to:'su'}, {from:'gw', to:'so'}, {from:'so', to:'sp', curve:.25}, {from:'su', to:'du'}, {from:'so', to:'do'}, {from:'sp', to:'dp'}],
      steps:[
        {note:'One app answers a result request using one shared database.', flow:[['c', 'm', 'view result'], ['m', 'mdb', 'read'], ['mdb', 'm'], ['m', 'c']], hl:['m']},
        {note:'The app keeps one release, but login, results, and notices have clear sections.', sub:{m:'[login] [results] [notices]'}, hl:['m']},
        {note:'Each section can become a service with its own data when that separation helps.', hide:['m', 'mdb'], hideEdges:[['c', 'm']], reveal:['gw', 'su', 'so', 'sp', 'du', 'do', 'dp'], showEdges:[['c', 'gw']], flow:[['c', 'gw', 'view result'], ['gw', 'so'], ['so', 'do', 'read']], hl:['so']},
        {note:'Results calls Notices over the network. The call can be slow or fail.', flow:[['so', 'sp', 'send notice'], ['sp', 'dp'], ['dp', 'sp'], ['sp', 'so', 'ok']], hl:['sp']},
        {note:'Notices stops. The results service should still answer result requests.', status:{sp:'down'}, hl:['so']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Shops', 'Results platform'], [['One shop with one counter', 'One app with one release.'], ['Clear sections in that shop', 'One app with separate modules.'], ['Several independent shops', 'Separate services and releases.']])}</div><div class="callout tip"><b>Important point</b><p>Clear boundaries can help a growing team before the app needs separate services.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Shape', 'Useful for this team when'], [['Monolith', 'A small team can release the whole app together.'], ['Modular monolith', 'Teams need clear ownership but can share releases.'], ['Microservices', 'Teams need separate releases enough to manage network and data costs.']])}</div>`,
    deep:`<h4>The numbers</h4><p>A call inside one app takes nanoseconds. A call to another service nearby may take about 0.5 ms. If a result request now calls Login and Notices, that adds 2 × 0.5 = 1 ms.</p><p>Availability also drops. Say each of 3 services is up 99.9% and a request needs all 3. Then 0.999³ is about 0.997, or 99.7%. That is 0.3% × 8,760, about 26 hours a year. One app at 99.9% is about 8.8 hours.</p><h4>When it goes wrong</h4><p>Staff correct a result. Results saves the change, then the call to Notices fails. The result is changed, but the student is never told. No single database step covers both services. Module 6 teaches ways to handle this.</p><h4>How it works inside</h4><p>Move one area at a time. Send a small share of its requests, say 5%, to the new service. Compare its answers with the old code, then raise the share.</p>`
  },
  tradeoffs:{use:[`For the results platform, keep one app while login, results, and notices can be released together.`, `Consider a separate Notices service if its team truly needs its own release schedule.`], avoid:[`Do not split the app only because more services sound advanced.`, `Do not make three services share one database if teams need independent changes.`], alt:[`Keep a modular monolith and extract one area only after measuring the benefit.`]},
  real:[
    {co:'Shopify', tier:'confirmed', text:'Shopify described adding clear component boundaries inside its large Rails app.', src:'Shopify Engineering, Deconstructing the Monolith (2019)'},
    {co:'Segment', tier:'confirmed', text:'Segment described combining many small services when their operating cost became too high.', src:'Segment Engineering, Goodbye Microservices (2018)'}
  ],
  mistakes:[`Creating separate services before the teams need independent releases.`, `Letting one service edit another service’s private data.`],
  interview:[`Compare the three shapes using the same results platform.`, `Explain which team need would justify separating Notices.`],
  tryit:[{quiz:[
    {q:'What stays together in a modular monolith?', options:['Every computer in one room', 'All users on one phone', 'One deployed app', 'Every team’s private database'], answer:2, why:'Modules are separate inside one deployed app.'},
    {q:'What new cost appears when Notices becomes a separate service?', options:['The result app needs no data', 'All releases stop', 'Students cannot use phones', 'Network calls can slow or fail'], answer:3, why:'The two services communicate over a network.'}
  ]}, {note:'Set a small team first, then increase team size and independent release needs. Read why the advisor changes its recommendation.', mount:host => archAdvisor(host)}],
  sources:[`Shopify Engineering, Deconstructing the Monolith (2019)`, `Segment Engineering, Goodbye Microservices (2018)`]
}
];

SDA.register({
  kind:'module', id:'foundations', order:1, level:'beginner', icon:'🧭', title:'Foundations',
  summary:'Start with what people need. Follow a request, estimate demand, compare ways to grow, and plan for slow or failed parts.',
  outcomes:['Explain what system design decides for one app', 'Follow a request from client to server and back', 'Estimate average and busy-period traffic with clear assumptions', 'Explain why waiting and slow requests matter', 'Find a single point of failure and compare three app shapes'],
  lessons,
  quiz:[
    {q:'What does system design decide for the college results app?', options:['How its parts meet student needs', 'Only the color of its buttons', 'The brand of every computer', 'How to avoid all measurements'], answer:0, why:'It connects the student’s need with the app parts and their behavior.'},
    {q:'What comes first in the seven-step approach?', options:['Draw every screen', 'Clarify what students need', 'Buy more servers', 'Choose three databases'], answer:1, why:'The user’s job sets the scope of the design.'},
    {q:'Which is a functional requirement?', options:['The app is usually available', 'The page feels quick', 'Students can find a result by roll number', '95 of 100 requests finish within 2 seconds'], answer:2, why:'It names an action the student can perform.'},
    {q:'Which part starts a result request?', options:['The database', 'The app server', 'The server room', 'The phone app'], answer:3, why:'The phone app is the client that asks first.'},
    {q:'Why can a page take 1.5 seconds when the app server takes 40 milliseconds?', options:['The browser and network also take time', 'A server log measures the whole visit', 'The phone becomes the database', 'Every page must take 1.5 seconds'], answer:0, why:'The server measures only one part of the student’s wait.'},
    {q:'How long do 200 reads take if each waits 1 millisecond and they run one by one?', options:['2 milliseconds', '200 milliseconds', '1 millisecond', '20 milliseconds'], answer:1, why:'200 × 1 millisecond = 200 milliseconds before other work.'},
    {q:'What is the average rate for 400 million requests in one day?', options:['About 23,000 each second', '20 each second', 'About 4,600 each second', '400 million each second'], answer:2, why:'400 million ÷ 86,400 seconds is about 4,600 each second.'},
    {q:'What does horizontal scaling add?', options:['More memory to one server', 'More seconds to a day', 'More roll numbers', 'More app servers'], answer:3, why:'Horizontal scaling spreads work across several servers.'},
    {q:'What is throughput in the payment worker example?', options:['Payments finished each second', 'Time one customer waits', 'Size of a payment', 'Number of screens'], answer:0, why:'Throughput counts completed work over time.'},
    {q:'What does p99 describe?', options:['The number of servers', 'A time at or below which 99% of measured requests finished', 'The average request time', 'The time of every request'], answer:1, why:'p99 shows a value near the slow end of sorted request times.'},
    {q:'Why is the availability of a required chain lower than each perfect-looking part?', options:['A phone cannot ask a server', 'Percentages always add to 100', 'Any required part can stop the request', 'The app has too many colors'], answer:2, why:'The request succeeds only when every required part works.'},
    {q:'At a 99.9% success SLO over 100,000 valid requests, how many failures fit the budget?', options:['1,000', '10,000', '0', '100'], answer:3, why:'100,000 × 0.1% = 100 allowed failures.'},
    {type:'scenario', q:'Both results app servers use one login store. It stops during release night. What should the team check?', answer:'<ol><li>Trace a student request and confirm that both app servers need the login store.</li><li>Measure how many requests fail while the store is down.</li><li>Test a separate standby store with the login data needed after a switch.</li><li>Check how long the switch takes and whether the results database becomes busy.</li></ol>'},
    {type:'scenario', q:'A results platform has teams for login, results, and notices. Must it split into three services?', answer:'<p>No. Keep one app with clear internal modules while teams can release together. Separate a service when independent releases or capacity needs justify the network calls and separate data ownership.</p>'}
  ],
  flashcards:[
    {front:'What does system design decide?', back:'What an app must do and how its parts work together under expected demand and failure.'},
    {front:'First design question', back:'What does the user need to do?'},
    {front:'Functional requirement', back:'An action a user can perform, such as finding a result by roll number.'},
    {front:'Non-functional requirement', back:'A measurable quality of an action, such as its time during a rush.'},
    {front:'Client and server', back:'The client asks. The server handles the request and responds.'},
    {front:'Server time versus page time', back:'The page also includes network and browser work.'},
    {front:'Seconds in a day', back:'86,400'},
    {front:'Average request rate', back:'Requests each day divided by 86,400 seconds.'},
    {front:'Vertical and horizontal scaling', back:'More capacity on one server versus more servers sharing work.'},
    {front:'Latency and throughput', back:'Time per request versus requests completed each second.'},
    {front:'p99', back:'A time at or below which 99% of measured requests finished.'},
    {front:'99.9% availability in one year', back:'About 8.76 hours of possible downtime.'},
    {front:'SLI, SLO, SLA', back:'Measurement, internal target, and contract promise.'},
    {front:'Error budget', back:'For a 99.9% request-success target, up to 0.1% of valid requests may fail.'},
    {front:'Single point of failure', back:'One part whose loss stops the whole request path.'},
    {front:'Modular monolith', back:'One deployed app with clear internal sections.'}
  ],
  cheatsheet:[
    {h:'🧭 Start with the need', items:['Ask what a person must do before choosing parts.', 'Write the action and its measurable quality.', 'Follow one request from client to server, data, and back.', 'Revisit an earlier answer when a requirement changes.']},
    {h:'🧮 Estimate demand', items:['Requests per day = visitors × requests per visitor.', 'Average requests each second = requests per day ÷ 86,400.', 'Peak requests each second = average × stated peak guess.', 'Use the estimate to choose a load test.']},
    {h:'⏱️ Read the wait', items:['Latency is total time for one request.', 'Throughput is requests completed each second.', 'Sequential waits add. 200 × 1 ms = 200 ms.', 'Near full capacity, a waiting line can grow quickly.', 'p50 shows the middle request. p99 shows a slower edge.']},
    {h:'📈 Plan availability', items:['Availability measures how often valid requests succeed.', '99.9% over one year allows about 8.76 hours of downtime.', 'A path needs every required part to work.', 'A spare helps when it can survive the same fault.']},
    {h:'🎯 Set service targets', items:['SLI is the measurement. SLO is the internal target. SLA is a contract promise.', 'At a 99.9% request-success SLO, 0.1% of valid requests may fail.', 'A request-failure budget is not automatically downtime minutes.', 'Burn rate compares current failures with the allowed failure rate.']},
    {h:'🏗️ Choose app shape', items:['Vertical scaling gives one server more capacity.', 'Horizontal scaling adds servers that share work.', 'A monolith is one deployed app.', 'A modular monolith keeps one app with clear sections.', 'Microservices run sections separately when that benefit pays for network and data costs.']}
  ],
  glossary:[
    {term:'System design', def:'Planning what an app must do and how its parts will work together. Example: for a results app, you decide the screens, the server, the database and how to handle a rush.'},
    {term:'Functional requirement', aka:['functional requirements'], def:'Something the app must let a user do. Example: a student enters a roll number and sees a result.'},
    {term:'Non-functional requirement', aka:['non-functional requirements', 'NFR', 'NFRs'], def:'How well the app must do its job, such as how fast or how reliable it is. Example: the result must appear within 2 seconds, even when 40,000 students log in.'},
    {term:'Client', def:'The program that asks for something, such as a phone app or a browser. Example: a student’s phone asks for an exam result.'},
    {term:'Server', def:'A computer that runs the app and answers requests. Example: the results server receives a roll number and sends back a result.'},
    {term:'Request', def:'One ask sent from a client to a server. Example: “show the result for roll number 105”.'},
    {term:'Response', def:'The answer a server sends back to the client. Example: the result page, or an error message.'},
    {term:'Database', def:'A place where an app keeps its data so it can read and update it later. Example: the table that stores every student’s marks.'},
    {term:'Latency', aka:['latencies'], def:'How long one request takes, from the moment it is sent until the answer arrives. Example: a page that loads in 200 milliseconds has a latency of 200 ms.'},
    {term:'Throughput', def:'How many requests the system finishes in a set time. Example: a server that answers 500 requests each second has a throughput of 500 per second.'},
    {term:'QPS', aka:['RPS', 'requests per second', 'queries per second', 'requests each second'], def:'Queries or requests per second. It counts how many asks arrive or finish each second. Example: 2,000 students opening the app in one second is 2,000 QPS.'},
    {term:'DAU', aka:['daily active users'], def:'Daily active users: the number of different people who use the app on one day. Example: 1 million DAU means about one million people open the app each day.'},
    {term:'Peak factor', aka:['busy period'], def:'How many times busier the busiest moment is than the average. Example: 100 requests per second on average and 500 at the peak is a peak factor of 5.'},
    {term:'Back-of-envelope estimation', aka:['back-of-the-envelope', 'back-of-envelope', 'back-of-envelope estimate'], def:'A quick, rough calculation from simple guesses, used to check that a design is the right size. Example: 1 million visitors × 20 requests ÷ 86,400 seconds is about 230 requests per second.'},
    {term:'Bottleneck', aka:['bottlenecks'], def:'The part that limits the whole system because it fills up first. Example: if the app server handles 500 requests a second but the database handles only 200, the database is the bottleneck.'},
    {term:'Utilization', aka:['utilisation', 'utilizations'], def:'How much of something’s capacity is being used. Example: a server that can do 100 jobs a second and is doing 80 is at 80% utilization.'},
    {term:'Little’s Law', aka:['Little\'s Law'], def:'A rule linking three numbers: requests in the system at once = arrival rate × average time each one stays. Example: 100 requests per second × 0.2 seconds = 20 requests in the system at once.'},
    {term:'Vertical scaling', aka:['scale up', 'scaling up'], def:'Making one server stronger by giving it more CPU or memory. Example: replacing a 4-core server with a 16-core server.'},
    {term:'Horizontal scaling', aka:['scale out', 'scaling out'], def:'Handling more load by adding more servers and sharing requests among them. Example: running 4 identical app servers instead of 1.'},
    {term:'Session', aka:['sessions'], def:'A saved record that tells the app a user is already logged in. Example: after you log in, the app remembers you for the next 30 minutes.'},
    {term:'Stateless service', aka:['stateless'], def:'A server that keeps no private memory of earlier requests, so any copy can answer the next one. Example: if sessions live in a shared database, any of 4 servers can serve any student.'},
    {term:'Percentile', aka:['percentiles', 'p95'], def:'A way to describe response times by their place in a sorted list. p95 means 95 out of 100 requests finished at least this fast. Example: if p95 is 800 ms, only 5 requests in 100 took longer.'},
    {term:'p50', aka:['median'], def:'The middle response time. Half of the requests were faster and half were slower. Example: p50 = 120 ms means half of the requests finished within 120 ms.'},
    {term:'p99', aka:['99th percentile'], def:'p99 means 99 out of 100 requests finished at least this fast. Only the slowest 1 in 100 took longer. Example: if p99 is 2 seconds, 99 of every 100 requests took 2 seconds or less.'},
    {term:'p99.9', aka:['99.9th percentile'], def:'p99.9 means 999 out of 1,000 requests finished at least this fast. It shows the very slowest cases. Example: p99.9 = 5 seconds means only 1 request in 1,000 took longer than 5 seconds.'},
    {term:'Tail latency', aka:['tail latencies', 'slowest 1%'], def:'The response times of the slowest few requests. Example: if most requests take 100 ms but a few take 3 seconds, those few are the tail.'},
    {term:'Availability', def:'The share of time, or of requests, in which the service works. Example: 99.9% availability allows about 43 minutes of downtime in a 30-day month.'},
    {term:'Nines', aka:['three nines', 'four nines', 'five nines'], def:'A short way to name availability levels by counting 9s. Example: three nines is 99.9% and four nines is 99.99%.'},
    {term:'SLI', aka:['service level indicator'], def:'Service level indicator: a number that measures how well the service is doing. Example: the share of result requests that finish within 2 seconds.'},
    {term:'SLO', aka:['service level objective'], def:'Service level objective: the target you set for an SLI. Example: 99.9% of result requests finish within 2 seconds, measured over 30 days.'},
    {term:'SLA', aka:['service level agreement'], def:'Service level agreement: a promise to customers, written in a contract, with a penalty if it is broken. Example: if uptime falls below 99.9%, the customer gets a refund.'},
    {term:'Error budget', def:'How much failure the SLO still allows. Example: with a 99.9% target, 0.1% of requests may fail. Out of 1,000,000 requests, that is 1,000 failures.'},
    {term:'Burn rate', def:'How fast failures are using up the error budget, compared with a steady pace. Example: a burn rate of 1 uses the whole budget exactly by the end of the month. A burn rate of 10 uses it in 3 days.'},
    {term:'SPOF', aka:['single point of failure', 'single points of failure'], def:'Single point of failure: one part that stops the whole system if it breaks. Example: one database with no copy is a SPOF.'},
    {term:'Fault tolerance', def:'The ability to keep working when one part fails. Example: with 3 app servers, students are still served when 1 server crashes.'},
    {term:'Failure domain', aka:['failure domains'], def:'A group of parts that can fail together. Example: all servers in one building share power, so one power cut can take them all down.'},
    {term:'Blast radius', def:'How much damage one failure or one mistake can cause. Example: a bad update sent to 1 server of 100 affects 1% of users, but the same update sent to every server affects 100%.'},
    {term:'Monolith', aka:['monolithic'], def:'An app built and released as one single piece. Example: one program holds the login, results and payments code, and everything is deployed together.'},
    {term:'Modular monolith', def:'One app that is split into clear sections inside. Example: one program with separate results, login and payments modules that talk through clear rules.'},
    {term:'Microservices', aka:['microservice'], def:'An app split into small separate services, each released on its own and talking over a network. Example: the results service and the login service are deployed by different teams.'},
    {term:'Conway’s Law', aka:['Conway\'s Law'], def:'The idea that a system ends up shaped like the teams that build it. Example: three teams that rarely talk often produce a product with three separate parts and rough joins.'},
    {term:'Registered users', def:'People who have an account, even if they rarely use the app. Example: 1 million registered students, of whom only 40,000 may check on release night.'},
    {term:'Active users', def:'People who actually use the app in a chosen period, such as a day. Example: 200,000 daily active users out of 1 million registered users.'},
    {term:'Concurrent requests', aka:['concurrent request'], def:'Requests that are being handled or waiting at the same moment. Example: if 2,000 requests arrive each second and each takes 0.5 seconds, about 1,000 are in progress at once.'}
  ],
  sources:['Google SRE book and Workbook', 'Dean and Barroso, The Tail at Scale (2013)', 'Treynor and others, The Calculus of Service Availability (2017)', 'Shopify Engineering, Deconstructing the Monolith (2019)', 'AWS Post-Event Summary, December 2021']
});
} catch(e){ console.error('[SDA] Module "foundations" failed to load', e); window.SDA && SDA.errors.push({id:'foundations', error:e}); }
})();
