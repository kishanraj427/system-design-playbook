/* =====================================================================
   PART 6 · PLAYGROUNDS (b) — #22 Autoscaling simulator · #23 Chaos monkey
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, esc, clamp, fmtNum, fmtDur, rng} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const {css, frag} = SDA.ph;

/* ---------------- #22 Autoscaling ---------------- */
try {
const PATTERNS = {
  diurnal:{label:'Daily curve (food delivery: lunch + dinner peaks)', sched:[{from:18 * 60 + 30, to:23 * 60, key:'dinner'}],
    fn:m => { const hr = m / 60; const g = (c, w, a) => a * Math.exp(-Math.pow((hr - c) / w, 2)); return 250 + g(13, 1.2, 1400) + g(20.5, 1.6, 3000) + g(9, 1.5, 300); }},
  ipl:{label:'Live match: 4× jump at 19:30 for 3.5 h', sched:[{from:19 * 60, to:23 * 60 + 15, key:'match'}],
    fn:m => { const base = 300 + 500 * Math.exp(-Math.pow((m / 60 - 13) / 2, 2)); if (m < 19 * 60 + 30 || m > 23 * 60) return base; const ramp = Math.min(1, (m - (19 * 60 + 30)) / 3); const wicket = (m >= 21 * 60 + 15 && m < 21 * 60 + 22) ? 1.3 : 1; return base + 4200 * ramp * wicket; }},
  tatkal:{label:'Booking windows open at 10:00 and 11:00 sharp', sched:[{from:9 * 60 + 40, to:10 * 60 + 40, key:'10:00 window'}, {from:10 * 60 + 40, to:11 * 60 + 40, key:'11:00 window'}],
    fn:m => { let v = 350 + 250 * Math.exp(-Math.pow((m / 60 - 18) / 3, 2)); if (m >= 600) v += 6500 * Math.exp(-(m - 600) / 9); if (m >= 660) v += 2500 * Math.exp(-(m - 660) / 7); return v; }}
};
function simulateScaling(P){
  const pat = PATTERNS[P.pattern]; const R = rng(11); const N = 1440;
  const demand = Array.from({length:N}, (_, m) => pat.fn(m) * (1 + (R() - .5) * .08));
  const perInst = P.cap * P.target / 100; const want = d => Math.ceil(d / perInst);
  let ready = P.policy === 'fixed' ? P.fixed : Math.max(P.min, want(demand[0])), booting = [], lastAct = -999, hiRun = 0, loRun = 0;
  const desiredHist = [], out = [];
  for (let m = 0; m < N; m++){
    booting = booting.filter(b => { if (b <= m){ ready++; return false; } return true; });
    const obs = m ? demand[m - 1] : demand[0]; const util = obs / Math.max(1, ready * P.cap);
    if (P.policy !== 'fixed'){
      let desired = ready + booting.length;
      if (P.policy === 'step'){
        hiRun = util > .8 ? hiRun + 1 : 0; loRun = util < .3 ? loRun + 1 : 0;
        if (m - lastAct >= 5){ if (hiRun >= 3){ desired = Math.ceil((ready + booting.length) * 1.2) + 1; lastAct = m; hiRun = 0; } else if (loRun >= 15){ desired = Math.floor((ready + booting.length) * .9); lastAct = m; loRun = 0; } }
      } else {
        desired = want(obs);
        if (P.policy === 'scheduled'){ const s = pat.sched.find(s => m >= s.from && m < s.to); if (s){ let pk = 0; for (let k = s.from; k < s.to; k++) pk = Math.max(pk, pat.fn(k)); desired = Math.max(desired, want(pk * 1.1)); } }
        if (P.policy === 'predictive'){ let pk = 0; for (let k = m; k < Math.min(N, m + P.warm + 10); k++) pk = Math.max(pk, pat.fn(k)); desired = Math.max(desired, want(pk)); }
      }
      desired = clamp(desired, P.min, P.max); desiredHist.push(desired);
      const cur = ready + booting.length;
      if (desired > cur){ for (let k = 0; k < desired - cur; k++) booting.push(m + P.warm); }
      else if (desired < cur){
        const win = desiredHist.slice(-P.stab); const stable = P.policy === 'step' ? desired : Math.max(...win);
        let cut = cur - Math.max(stable, P.min); while (cut > 0 && booting.length){ booting.pop(); cut--; } while (cut > 0 && ready > P.min){ ready--; cut--; }
      }
    }
    const capacity = ready * P.cap, d = demand[m], served = Math.min(d, capacity), rho = d / Math.max(1, capacity);
    const lat = rho >= 1 ? 2000 : Math.min(2000, 40 / (1 - Math.min(rho, .98)));
    out.push({m, d, ready, booting:booting.length, capacity, served, dropped:d - served, rho, lat, breach:lat > 200 || d > capacity});
  }
  return out;
}
SDA.scaleSim = simulateScaling;
SDA.register({kind:'playground', id:'autoscaling', module:'reliability', icon:'📈', title:'Autoscaling simulator: a day of traffic',
  summary:'Run 24 hours of traffic minute by minute against fixed capacity, target tracking, step scaling, scheduled scaling or predictive scaling. Tune target utilisation, warm-up and the scale-in window and see SLO breaches against cost.',
  explain:`<ul><li><b>Target tracking</b> uses the Kubernetes HPA formula, <code>desired = ⌈current × currentUtil ÷ targetUtil⌉</code>, on last minute’s metric. New instances take the <b>warm-up</b> time before they serve traffic.</li><li>On the <b>Live match</b> or <b>10:00 booking</b> pattern, reactive scaling is always late: demand jumps faster than instances boot, so you get breach minutes. <b>Scheduled</b> or <b>predictive</b> scaling pre-warms capacity before the known event.</li><li>A lower <b>target utilisation</b> leaves more headroom (fewer breaches, higher cost). A short <b>scale-in window</b> saves money but can flap and cut capacity just before the next bump.</li><li><b>Fixed capacity</b> sized for the peak wastes money all night; sized for the average, it melts at peak.</li></ul>`,
  real:[{co:'Kubernetes Horizontal Pod Autoscaler', tier:'confirmed', text:'The HPA computes desiredReplicas = ceil(currentReplicas × currentMetricValue ÷ desiredMetricValue). By default it uses a 300-second stabilisation window for scale-down to avoid flapping.', src:'Kubernetes documentation — Horizontal Pod Autoscaling'}, {co:'AWS EC2 Auto Scaling', tier:'confirmed', text:'Offers target tracking, step, scheduled and predictive scaling. Predictive scaling forecasts load from history to launch capacity ahead of recurring peaks.', src:'Amazon EC2 Auto Scaling documentation'}, {co:'Live-streaming and ticketing spikes in India', tier:'inference', text:'For events with a known start time (a cricket match, a 10:00 booking window), reactive autoscaling alone reacts minutes late, so platforms pre-provision for the forecast peak and treat autoscaling as a safety net.', src:'Reasonable architectural inference from public talks on large live events'}],
  mount(host, api){
    const P = {pattern:'ipl', policy:'target', target:60, warm:5, stab:10, min:2, max:120, cap:100, fixed:20};
    let S = [], cursor = 1440, playing = false;
    const cv = el('canvas', {height:560, style:{height:'280px'}, 'aria-label':'Demand versus serving capacity over 24 hours, with SLO breach minutes shaded red'}); const box = el('div', {class:'chart-box', style:{marginTop:'12px'}}, cv);
    const met = ui.metrics(null, [{id:'clock', label:'Clock'}, {id:'inst', label:'Instances (ready + booting)'}, {id:'breach', label:'SLO-breach minutes', instant:true, warn:1, bad:20}, {id:'drop', label:'Requests dropped', unit:'%', instant:true, fmt:v => v.toFixed(2), warn:.01, bad:1}, {id:'ih', label:'Instance-hours', instant:true}, {id:'cost', label:'Cost (illustrative)', instant:true}, {id:'util', label:'Avg utilisation', unit:'%', instant:true, dir:'down', warn:35}]);
    const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    function run(){ S = simulateScaling(P); paint(); }
    function paint(){
      const upto = S.slice(0, Math.max(1, Math.floor(cursor))); const last = upto[upto.length - 1];
      const br = upto.filter(x => x.breach).length, dem = upto.reduce((s, x) => s + x.d, 0), dr = upto.reduce((s, x) => s + x.dropped, 0), im = upto.reduce((s, x) => s + x.ready + x.booting, 0), us = upto.reduce((s, x) => s + Math.min(1, x.rho), 0);
      met.set('clock', hhmm(last.m)); met.set('inst', `${last.ready} + ${last.booting}`); met.set('breach', br); met.set('drop', dr * 100 / Math.max(1, dem)); met.set('ih', im / 60); met.set('cost', '₹' + fmtNum(im / 60 * 8)); met.set('util', us * 100 / upto.length);
      const W = box.clientWidth || 640, H = 280; cv.width = W * 2; const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, W, H);
      const mx = Math.max(...S.map(x => Math.max(x.d, x.capacity))) * 1.08; const X = m => 44 + m / 1440 * (W - 54), Y = v => H - 24 - v / mx * (H - 44);
      g.fillStyle = css('--bad'); g.globalAlpha = .18; upto.forEach(x => { if (x.breach) g.fillRect(X(x.m), 14, Math.max(1, (W - 54) / 1440), H - 38); }); g.globalAlpha = 1;
      PATTERNS[P.pattern].sched.forEach(s => { if (P.policy === 'scheduled'){ g.fillStyle = css('--accent2'); g.globalAlpha = .08; g.fillRect(X(s.from), 14, X(s.to) - X(s.from), H - 38); g.globalAlpha = 1; } });
      const line = (key, color, wd, step) => { g.strokeStyle = color; g.lineWidth = wd; g.beginPath(); upto.forEach((x, i) => { const px = X(x.m), py = Y(x[key]); if (!i) g.moveTo(px, py); else if (step){ g.lineTo(px, Y(upto[i - 1][key])); g.lineTo(px, py); } else g.lineTo(px, py); }); g.stroke(); g.lineWidth = 1; };
      line('capacity', css('--ok'), 2, true); line('d', css('--accent1'), 1.6, false);
      g.font = '11px ' + css('--font-mono'); g.fillStyle = css('--muted');
      for (let hr = 0; hr <= 24; hr += 3) g.fillText(String(hr).padStart(2, '0') + ':00', X(hr * 60) - 16, H - 8);
      g.fillText(fmtNum(mx) + ' rps', 2, 22); g.fillText('— demand  — capacity  ▒ SLO breach' + (P.policy === 'scheduled' ? '  ▒ schedule' : ''), 50, 12);
      if (cursor < 1440){ g.strokeStyle = css('--text'); g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(cursor), 14); g.lineTo(X(cursor), H - 24); g.stroke(); g.setLineDash([]); }
    }
    api.loop(dt => { if (!playing) return; cursor = Math.min(1440, cursor + dt * 160); paint(); if (cursor >= 1440){ playing = false; playBtn.innerHTML = '▶ Play day'; } });
    const playBtn = ui.button('▶ Play day', () => { if (playing){ playing = false; playBtn.innerHTML = '▶ Play day'; return; } if (cursor >= 1440) cursor = 1; playing = true; playBtn.innerHTML = '⏸ Pause'; }, 'sm primary');
    const policySel = ui.select({label:'Scaling policy', value:P.policy, options:[['fixed', 'Fixed capacity (no autoscaling)'], ['target', 'Target tracking (reactive, HPA-style)'], ['step', 'Step scaling (CPU > 80% for 3 min → +20%)'], ['scheduled', 'Scheduled + target tracking'], ['predictive', 'Predictive (forecast) + target tracking']], onChange:v => { P.policy = v; run(); }});
    host.append(
      el('div', {class:'ctl-grid'},
        ui.select({label:'Traffic pattern', value:P.pattern, options:Object.entries(PATTERNS).map(([k, p]) => [k, p.label]), onChange:v => { P.pattern = v; run(); }}).el, policySel.el,
        ui.slider({label:'Target utilisation', min:30, max:90, step:5, value:P.target, fmt:v => v + '%', onInput:v => { P.target = v; run(); }}).el,
        ui.slider({label:'Instance warm-up (boot + ready)', min:1, max:15, step:1, value:P.warm, fmt:v => v + ' min', onInput:v => { P.warm = v; run(); }}).el,
        ui.slider({label:'Scale-in stabilisation window', min:1, max:60, step:1, value:P.stab, fmt:v => v + ' min', onInput:v => { P.stab = v; run(); }}).el,
        ui.slider({label:'Fixed fleet size (fixed policy)', min:2, max:120, step:1, value:P.fixed, fmt:v => v + ' instances', onInput:v => { P.fixed = v; run(); }}).el,
        ui.slider({label:'Capacity per instance', min:50, max:300, step:10, value:P.cap, fmt:v => v + ' rps', onInput:v => { P.cap = v; run(); }}).el),
      el('div', {class:'controls', style:{margin:'10px 0'}}, playBtn, ui.button('⏭ +1 hour', () => { playing = false; playBtn.innerHTML = '▶ Play day'; if (cursor >= 1440) cursor = 0; cursor = Math.min(1440, cursor + 60); paint(); }, 'sm'), ui.button('⏮ Reset to 00:00', () => { playing = false; playBtn.innerHTML = '▶ Play day'; cursor = 1; paint(); }, 'sm ghost'), ui.button('Show full day', () => { playing = false; playBtn.innerHTML = '▶ Play day'; cursor = 1440; paint(); }, 'sm')),
      box, el('div', {style:{height:'10px'}}), met.el,
      el('p', {class:'lab-hint'}, 'One-minute steps. A minute is an SLO breach when demand exceeds capacity (requests dropped) or the modelled latency (40 ms ÷ (1 − utilisation)) goes above 200 ms. Cost assumes an illustrative ₹8 per instance-hour. The predictive policy assumes today looks like the forecast. Real forecasts are imperfect, which is why target tracking stays on underneath.'));
    run();
  }
});
} catch(e){ console.error('[SDA] playground autoscaling', e); SDA.errors.push({id:'autoscaling', error:e}); }

/* ---------------- #23 Chaos monkey ---------------- */
try {
SDA.register({kind:'playground', id:'chaos-monkey', module:'reliability', icon:'🐒', title:'Chaos monkey: kill things, watch recovery',
  summary:'A small e-commerce system: gateway, catalog, recommendations, cart and payments across three availability zones. Kill instances, take out a whole zone or inject latency, then switch resilience features on and off to see what actually saves you.',
  explain:`<ul><li>Start with every resilience feature <b>off</b> and press <b>Kill random instance</b>. Without health checks the load balancer keeps sending a third of the traffic to the dead box, and without self-healing nobody replaces it.</li><li>Turn on <b>Health checks + self-healing</b>. The dead instance is detected after 3 failed checks (≈3 s) and pulled from rotation, and a replacement is healthy about 8 s later. Watch the MTTR metric.</li><li><b>Kill zone B.</b> With <b>3 instances spread over 3 AZs</b> the system loses a third of its capacity but stays up. With one instance per service, an unlucky zone takes the whole site down.</li><li><b>Slow down recommendations.</b> Without <b>timeouts + circuit breakers + fallbacks</b>, a non-critical feature hangs the home page. With them, users get “popular items” instead and the page still loads.</li><li><b>Unleash the monkey</b> to kill a random instance every 6 s, like Netflix’s Chaos Monkey does during business hours.</li></ul>`,
  real:[{co:'Netflix Chaos Monkey & Simian Army', tier:'confirmed', text:'Netflix built Chaos Monkey (2011) to randomly terminate production instances during business hours, so engineers would build services that tolerate instance loss. Chaos Gorilla and Chaos Kong later simulated losing an availability zone and a whole region.', src:'Netflix Tech Blog, “The Netflix Simian Army” (2011); Basiri et al., “Chaos Engineering”, IEEE Software (2016)'}, {co:'Google DiRT', tier:'confirmed', text:'Google runs annual Disaster Recovery Testing (DiRT) exercises that deliberately break systems and processes to find weaknesses before real disasters do.', src:'Kripa Krishnan, “Weathering the Unexpected”, ACM Queue (2012)'}],
  mount(host, api){
    const SV = [{id:'gw', name:'API gateway', crit:true}, {id:'cat', name:'Catalog', crit:true}, {id:'rec', name:'Recommendations', crit:false}, {id:'cart', name:'Cart', crit:true}, {id:'pay', name:'Payments', crit:true}];
    const AZ = ['A', 'B', 'C']; const R = rng(5);
    const P = {redundant:true, heal:false, breaker:false, monkey:false, speed:1, rate:60};
    let S, running = !api.reduced;
    function reset(){
      S = {t:0, inst:[], seq:0, out:[], kills:[], mttr:[], recSlowUntil:-1, azDownUntil:{}, nextMonkey:6000, acc:0, recBreaker:{open:false, until:0, fails:0}, rr:{}};
      SV.forEach((s, si) => { const n = P.redundant ? 3 : 1; for (let i = 0; i < n; i++) S.inst.push({id:s.id + '-' + (++S.seq), svc:s.id, az:AZ[P.redundant ? i % 3 : si % 3], state:'up', diedAt:0, seenDead:false}); });
      logBox.innerHTML = ''; log(`System started: ${P.redundant ? '3 instances per service spread over zones A, B and C' : '1 instance per service, scattered across zones'}.`);
    }
    const logBox = el('div', {class:'lab-out', style:{maxHeight:'160px', borderRadius:'10px', border:'1px solid var(--border)'}, 'aria-live':'polite'});
    const log = (txt, cls) => { logBox.prepend(el('div', {class:'ln ' + (cls || '')}, `[${((S ? S.t : 0) / 1000).toFixed(1)} s] ${txt}`)); while (logBox.childNodes.length > 50) logBox.lastChild.remove(); };
    const svcName = id => SV.find(s => s.id === id).name;
    function kill(x, why){ if (x.state !== 'up' && x.state !== 'booting') return; x.state = 'dead'; x.diedAt = S.t; x.seenDead = false; S.kills.push(S.t); log(`💥 ${why}: ${svcName(x.svc)} instance ${x.id} in zone ${x.az} terminated.`, 'err'); }
    function killRandom(why){ const live = S.inst.filter(x => x.state === 'up'); if (!live.length) return; kill(live[Math.floor(R() * live.length)], why || 'Chaos monkey'); }
    function killZone(z){ S.azDownUntil[z] = S.t + 30000; log(`🌩 Zone ${z} lost for 30 s (power/network failure).`, 'err'); S.inst.filter(x => x.az === z).forEach(x => kill(x, 'Zone ' + z + ' failure')); }
    function step(ms){
      const DT = 100; S.carry = (S.carry || 0) + ms;
      while (S.carry >= DT){
        S.carry -= DT; S.t += DT;
        if (P.monkey && S.t >= S.nextMonkey){ S.nextMonkey = S.t + 6000; killRandom('Chaos monkey'); }
        S.inst.forEach(x => {
          if (x.state === 'dead' && P.heal && !x.seenDead && S.t - x.diedAt >= 3000){ x.seenDead = true; x.state = 'gone'; const zs = AZ.filter(z => !(S.azDownUntil[z] > S.t)); const az = zs.includes(x.az) ? x.az : (zs.length ? zs[Math.floor(R() * zs.length)] : x.az); const n = {id:x.svc + '-' + (++S.seq), svc:x.svc, az, state:'booting', readyAt:S.t + 8000, diedAt:x.diedAt}; S.inst.push(n); log(`🩺 Health checks failed 3× → ${x.id} removed from the load balancer; replacement ${n.id} launching in zone ${az}.`); }
          if (x.state === 'booting' && S.t >= x.readyAt){ if (S.azDownUntil[x.az] > S.t){ x.state = 'dead'; x.diedAt = S.t; x.seenDead = false; return; } x.state = 'up'; S.mttr.push(S.t - x.diedAt); log(`✅ ${x.id} healthy and in rotation (recovered ${((S.t - x.diedAt) / 1000).toFixed(1)} s after the failure).`, 'ok'); }
        });
        S.inst = S.inst.filter(x => x.state !== 'gone');
        S.acc += P.rate * DT / 1000; while (S.acc >= 1){ S.acc--; request(); }
      }
      while (S.out.length && S.out[0].t < S.t - 5000) S.out.shift();
    }
    function pick(svc){
      const pool = S.inst.filter(x => x.svc === svc && (x.state === 'up' || x.state === 'dead'));
      if (!pool.length) return null; S.rr[svc] = ((S.rr[svc] || 0) + 1) % pool.length; return pool[S.rr[svc]];
    }
    const hop = svc => { const x = pick(svc); return !!x && x.state === 'up'; };
    function recCall(){
      const slow = S.t < S.recSlowUntil; const ok = hop('rec');
      if (!P.breaker) return slow ? {ok:false, lat:30000, hang:true} : {ok, lat:ok ? 60 : 5};
      const br = S.recBreaker; if (br.open && S.t < br.until) return {ok:false, fallback:true, lat:2};
      if (br.open){ br.open = false; br.fails = 0; }
      const res = slow ? {ok:false, lat:300} : {ok, lat:ok ? 60 : 5};
      if (!res.ok){ if (++br.fails >= 5){ br.open = true; br.until = S.t + 5000; log('🔌 Recommendations breaker OPEN: serving “popular items” fallback for 5 s.'); } } else br.fails = 0;
      return res.ok ? res : {ok:false, fallback:true, lat:res.lat};
    }
    function request(){
      const checkout = R() < .3;
      if (!hop('gw')){ S.out.push({t:S.t, kind:checkout ? 'checkout' : 'home', ok:false}); return; }
      if (checkout){ const ok = hop('cart') && hop('pay'); S.out.push({t:S.t, kind:'checkout', ok}); return; }
      if (!hop('cat')){ S.out.push({t:S.t, kind:'home', ok:false}); return; }
      const r = recCall(); S.out.push({t:S.t, kind:'home', ok:r.ok || !!r.fallback, degraded:!!r.fallback, hang:!!r.hang});
    }
    /* ---------- view ---------- */
    const grid = el('div', {class:'tbl-wrap'});
    const met = ui.metrics(null, [{id:'home', label:'Home page success', unit:'%', instant:true, dir:'down', warn:99, bad:90}, {id:'chk', label:'Checkout success', unit:'%', instant:true, dir:'down', warn:99, bad:90}, {id:'deg', label:'Degraded (fallback) pages', unit:'%', instant:true, warn:1}, {id:'healthy', label:'Healthy instances'}, {id:'kills', label:'Failures injected', instant:true}, {id:'mttr', label:'Mean time to recover', instant:true}]);
    function render(){
      const tb = el('table', {class:'tbl', style:{minWidth:'0', fontSize:'13px'}}); const hd = el('tr', null, el('th', null, 'Service')); AZ.forEach(z => hd.append(el('th', null, `AZ ${z}${S.azDownUntil[z] > S.t ? ' 🌩' : ''}`))); tb.append(el('thead', null, hd)); const body = el('tbody');
      SV.forEach(s => { const tr = el('tr', null, el('td', {style:{minWidth:'90px', padding:'8px 10px'}}, el('b', null, s.name), (!s.crit || (s.id === 'rec' && S.t < S.recSlowUntil)) ? el('div', {class:'lab-hint', style:{margin:'2px 0 0'}}, (s.crit ? '' : 'non-critical') + (s.id === 'rec' && S.t < S.recSlowUntil ? ' · 🐢 +3 s' : '')) : null));
        AZ.forEach(z => { const td = el('td', {style:{padding:'8px 6px'}}); S.inst.filter(x => x.svc === s.id && x.az === z).forEach(x => { const c = x.state === 'up' ? 'var(--ok)' : x.state === 'booting' ? 'var(--warn)' : 'var(--bad)'; td.append(el('span', {class:'chip mono', title:x.id + ' · ' + x.state, 'aria-label':x.id + ' ' + x.state, style:{borderColor:c, color:c, margin:'2px', padding:'2px 7px'}}, (x.state === 'up' ? '●' : x.state === 'booting' ? '◐' : '✖') + x.id.split('-')[1])); }); tr.append(td); });
        body.append(tr); });
      tb.append(body); grid.innerHTML = ''; grid.append(tb);
      const home = S.out.filter(o => o.kind === 'home'), chk = S.out.filter(o => o.kind === 'checkout');
      met.set('home', home.length ? home.filter(o => o.ok).length * 100 / home.length : 100); met.set('chk', chk.length ? chk.filter(o => o.ok).length * 100 / chk.length : 100);
      met.set('deg', home.length ? home.filter(o => o.degraded).length * 100 / home.length : 0);
      const up = S.inst.filter(x => x.state === 'up').length, total = SV.length * (P.redundant ? 3 : 1); met.set('healthy', `${up} / ${total}`, up < total ? (up < total * .67 ? 'bad' : 'warn') : '');
      met.set('kills', S.kills.length); met.set('mttr', S.mttr.length ? fmtDur(S.mttr.reduce((a, b) => a + b, 0) / S.mttr.length) : (S.kills.length ? (P.heal ? 'recovering…' : 'never (no self-healing)') : '—'), S.kills.length && !S.mttr.length && !P.heal ? 'bad' : '');
    }
    let lastUI = 0;
    api.loop(dt => { if (!running) return; step(dt * 1000 * P.speed); if (S.t - lastUI >= 300){ lastUI = S.t; render(); } });
    const runBtn = ui.button(running ? '⏸ Pause' : '▶ Play', () => { running = !running; runBtn.innerHTML = running ? '⏸ Pause' : '▶ Play'; }, 'sm primary');
    host.append(
      el('div', {class:'controls'},
        ui.toggle({label:'3 instances across 3 zones', checked:true, onChange:v => { P.redundant = v; reset(); render(); }}).el,
        ui.toggle({label:'Health checks + self-healing', checked:false, onChange:v => { P.heal = v; log(v ? 'Health checks every 1 s; 3 failures → remove + replace.' : 'Health checks off.'); }}).el,
        ui.toggle({label:'Timeouts + circuit breaker + fallback', checked:false, onChange:v => { P.breaker = v; S.recBreaker = {open:false, until:0, fails:0}; log(v ? 'Recommendations calls: 300 ms timeout, breaker opens after 5 failures, fallback = popular items.' : 'No timeouts or fallbacks: callers wait for recommendations.'); }}).el,
        ui.toggle({label:'🐒 Unleash the monkey (every 6 s)', checked:false, onChange:v => { P.monkey = v; S.nextMonkey = S.t + 1000; log(v ? 'Chaos monkey active.' : 'Chaos monkey stopped.'); }}).el),
      el('div', {class:'controls', style:{margin:'10px 0'}},
        ui.button('💥 Kill random instance', () => { killRandom('Manual kill'); render(); }, 'sm'),
        ui.button('🌩 Kill zone B', () => { killZone('B'); render(); }, 'sm'),
        ui.button('🐢 Slow recommendations (20 s)', () => { S.recSlowUntil = S.t + 20000; log('🐢 Recommendations now respond in 3 s (GC pauses, a slow DB query) for 20 s.', 'err'); render(); }, 'sm'),
        runBtn, ui.button('⏭ Step 1 s', () => { running = false; runBtn.innerHTML = '▶ Play'; step(1000); render(); }, 'sm'),
        el('label', {class:'field', style:{minWidth:'120px'}}, el('span', null, 'Speed'), ui.speedSelect(v => P.speed = v)),
        ui.button('⏮ Reset', () => { reset(); render(); }, 'sm ghost')),
      grid, el('div', {style:{height:'10px'}}), met.el, el('div', {style:{height:'10px'}}), el('b', null, 'Event log'), logBox,
      el('p', {class:'lab-hint'}, `60 requests/s: 70% home page (gateway → catalog + recommendations), 30% checkout (gateway → cart → payments). Metrics cover the last 5 s. The load balancer round-robins over every registered instance; a dead one keeps receiving traffic until health checks remove it (3 failed checks ≈ 3 s), or forever without health checks. Without timeouts a slow dependency means the page hangs, which counts as a failure.${api.reduced ? ' Reduced motion is on, so the simulation starts paused: press Play or Step.' : ''}`));
    reset(); render();
  }
});
} catch(e){ console.error('[SDA] playground chaos-monkey', e); SDA.errors.push({id:'chaos-monkey', error:e}); }
})();
