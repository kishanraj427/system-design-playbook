
/* =====================================================================
   PART 2 · PLAYGROUNDS — #2 load balancer · #10 rate limiter · #16 CDN edge map
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, sv, esc, clamp, fmtNum} = SDA.u; const ui = SDA.ui;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fnv = s => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++){ x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); } return x >>> 0; };
const expo = rate => -Math.log(1 - Math.random()) / rate;
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

/* ---------------- #2 Load balancer ---------------- */
try {
SDA.register({kind:'playground', id:'load-balancer', module:'traffic', icon:'⚖️', title:'Load balancer simulator',
  summary:'Live traffic through a real load-balancing simulation: pick an algorithm, add or kill servers, make one slow, toggle health checks — and watch distribution, latency and errors.',
  explain:`<ul><li>Make one server <b>slow</b> under round robin: its queue and the p95 latency climb. Switch to <b>least connections</b> or <b>P2C</b> and watch it recover.</li><li><b>Kill</b> a server (click it). With health checks on, errors stop after the next check; turn health checks off and errors never stop.</li><li>Try <b>IP hash</b>: a few heavy clients (think office NAT gateways) make the distribution lumpy. Kill or add a server and read “clients remapped”: ~most clients move. Switch to <b>consistent hash</b> and only ~1/N move.</li><li>Pause and use <b>Step</b> to send one request at a time and read why the balancer picked that server.</li></ul><p class="lab-hint">Model: Poisson arrivals; each server is a single FIFO queue with exponential service at its capacity (slow 8, normal 25, fast 40 req/s); health checks run every 2 s; 30 clients, 3 of them 8× heavier.</p>`,
  real:[{co:'Envoy / Nginx / AWS ALB', tier:'confirmed', text:'Real balancers offer the same menu: round robin, weighted, least-request (Envoy uses power-of-two-choices), IP/ring/Maglev hashing, active health checks and outlier detection.', src:'Envoy, Nginx and AWS ELB documentation'}],
  mount(host, api){
    const CAP = {slow:8, normal:25, fast:40};
    const CLIENTS = Array.from({length:30}, (_, i) => ({ip:`49.36.${(i * 37) % 250}.${(i * 91) % 250}`, w:i < 3 ? 8 : 1}));
    const CW = CLIENTS.reduce((s, c) => s + c.w, 0);
    const S = [];
    const st = {alg:'lc', rate:55, hc:true, t:0, nextA:0, rr:0, paused:false, lastHC:0, lastAnim:0, lastUI:0, ringKey:'', ring:[], remap:null, prevMap:null};
    const log = {served:[], errors:[], assigned:[], lat:[]};
    const mkServer = i => ({i, name:'S' + (i + 1), weight:1, speed:'normal', alive:true, healthy:true, q:[], free:0, cw:0});
    for (let i = 0; i < 4; i++) S.push(mkServer(i));
    const holder = el('div'); const caption = el('div');
    const d = new api.Diagram(holder, {title:'Live traffic', w:780, h:330, nodeH:42, clickable:true, alt:'Users send requests to a load balancer which forwards them to up to six servers.',
      nodes:[{id:'u', type:'client', label:'Users', sub:'30 clients', x:80, y:165}, {id:'lb', type:'lb', label:'Load balancer', x:290, y:165, w:140}].concat(Array.from({length:6}, (_, i) => ({id:'s' + i, type:'service', label:'S' + (i + 1), sub:'', x:590, y:30 + i * 54, w:150, hidden:i >= 4}))),
      edges:[{from:'u', to:'lb'}].concat(Array.from({length:6}, (_, i) => ({from:'lb', to:'s' + i}))), caption:'Click a server to kill or revive it.'});
    d.on('node', id => { if (!id.startsWith('s')) return; const s = S[+id.slice(1)]; if (s) toggleKill(s); });
    const healthy = () => S.filter(s => s.healthy);
    function buildRing(H){ const key = H.map(s => s.i).join(','); if (key === st.ringKey) return; st.ringKey = key; st.ring = []; H.forEach(s => { for (let v = 0; v < 100; v++) st.ring.push([fnv(s.name + '#' + v), s]); }); st.ring.sort((a, b) => a[0] - b[0]); }
    function ringPick(hv){ const R = st.ring; let lo = 0, hi = R.length; while (lo < hi){ const m = (lo + hi) >> 1; if (R[m][0] < hv) lo = m + 1; else hi = m; } return R[lo % R.length][1]; }
    function pick(c, explain){
      const H = healthy(); if (!H.length) return [null, 'No healthy servers!'];
      const ql = s => s.q.length;
      switch (st.alg){
        case 'rr': { const s = H[st.rr++ % H.length]; return [s, `Round robin: next in rotation is ${s.name}.`]; }
        case 'wrr': { const tot = H.reduce((a, s) => a + s.weight, 0); H.forEach(s => s.cw += s.weight); const s = H.reduce((b, x) => x.cw > b.cw ? x : b, H[0]); s.cw -= tot; return [s, `Smooth weighted RR: ${s.name} (weight ${s.weight}) has the highest running score.`]; }
        case 'lc': { const m = Math.min(...H.map(ql)); const c2 = H.filter(s => ql(s) === m); const s = c2[Math.floor(Math.random() * c2.length)]; return [s, `Least connections: ${s.name} has ${m} in flight (others: ${H.filter(x => x !== s).map(x => x.name + '=' + ql(x)).join(', ')}).`]; }
        case 'p2c': { const a = H[Math.floor(Math.random() * H.length)]; let b = H[Math.floor(Math.random() * H.length)]; if (H.length > 1) while (b === a) b = H[Math.floor(Math.random() * H.length)]; const s = ql(a) <= ql(b) ? a : b; return [s, `Power of two choices: sampled ${a.name} (${ql(a)}) and ${b.name} (${ql(b)}) → ${s.name}.`]; }
        case 'random': { const s = H[Math.floor(Math.random() * H.length)]; return [s, `Random: ${s.name}.`]; }
        case 'iphash': { const s = H[fnv(c.ip) % H.length]; return [s, `IP hash: hash(${c.ip}) mod ${H.length} → ${s.name}.`]; }
        case 'chash': { buildRing(H); const s = ringPick(fnv(c.ip)); return [s, `Consistent hash: ${c.ip} lands on ${s.name}’s arc of the ring (100 virtual nodes each).`]; }
      }
      return [H[0], ''];
    }
    function mapAll(){ const H = healthy(); if (!H.length || !['iphash', 'chash'].includes(st.alg)) return null; if (st.alg === 'chash') buildRing(H); return CLIENTS.map(c => st.alg === 'iphash' ? H[fnv(c.ip) % H.length].i : ringPick(fnv(c.ip)).i); }
    function membershipChanged(){ const now = mapAll(); if (now && st.prevMap && now.length === st.prevMap.length){ const moved = now.filter((x, i) => x !== st.prevMap[i]).length; st.remap = moved / now.length * 100; } st.prevMap = now; }
    function chooseClient(){ let r = Math.random() * CW; for (const c of CLIENTS){ r -= c.w; if (r <= 0) return c; } return CLIENTS[0]; }
    function arrive(t, explain){
      const c = chooseClient(); const [s, why] = pick(c);
      if (!s){ log.errors.push(t); if (explain) caption.innerHTML = '<b style="color:var(--bad)">503</b> — ' + why; return; }
      log.assigned.push([t, s.i]);
      const failed = !s.alive || s.q.length > 400;
      if (failed) log.errors.push(t); else s.q.push({t});
      if (explain || (st.t - st.lastAnim > .11 && !api.reduced)){ st.lastAnim = st.t; d.flow([['u', 'lb'], ['lb', 's' + s.i, failed ? '✗' : null, failed ? 'var(--bad)' : null]], {dur:420}); }
      if (explain) caption.innerHTML = `${esc(why)} ${failed ? '<b style="color:var(--bad)">But it is dead — the request fails until a health check removes it.</b>' : ''}`;
    }
    function serve(now){ S.forEach(s => { if (!s.alive) return; while (s.q.length){ const j = s.q[0]; const start = Math.max(s.free, j.t); if (j.end == null) j.end = start + expo(CAP[s.speed]); if (j.end <= now){ s.q.shift(); s.free = j.end; log.served.push([now, s.i]); log.lat.push([now, (j.end - j.t) * 1000]); } else break; } }); }
    function healthCheck(){ let changed = false; S.forEach(s => { const want = st.hc ? s.alive : true; if (s.healthy !== want){ s.healthy = want; changed = true; } }); if (changed) membershipChanged(); }
    function toggleKill(s){ s.alive = !s.alive; if (!s.alive){ s.q.forEach(() => log.errors.push(st.t)); s.q = []; } else { s.free = st.t; } d.setStatus('s' + s.i, s.alive ? 'ok' : 'down'); renderRows(); }
    const met = ui.metrics(null, [{id:'tp', label:'Throughput', unit:'req/s', instant:true}, {id:'err', label:'Error rate', unit:'%', warn:1, bad:5, instant:true}, {id:'p95', label:'p95 latency', unit:'ms', warn:250, bad:800, instant:true}, {id:'imb', label:'Busiest ÷ quietest', unit:'×', warn:2, bad:4, instant:true, fmt:v => v.toFixed(1)}, {id:'remap', label:'Clients remapped (last change)', unit:'%', instant:true}]);
    const bars = el('div', {class:'stack', style:{gap:'6px'}});
    const rows = el('div', {class:'stack', style:{gap:'6px'}});
    function renderRows(){
      rows.innerHTML = '';
      S.forEach(s => {
        const w = el('select', {class:'input', style:{width:'auto'}, 'aria-label':s.name + ' weight'}); [1, 2, 3, 4, 5].forEach(v => w.append(el('option', {value:v}, 'weight ' + v))); w.value = s.weight; w.addEventListener('change', () => { s.weight = +w.value; });
        const sp = el('select', {class:'input', style:{width:'auto'}, 'aria-label':s.name + ' speed'}); [['slow', 'slow (8/s)'], ['normal', 'normal (25/s)'], ['fast', 'fast (40/s)']].forEach(([v, t]) => sp.append(el('option', {value:v}, t))); sp.value = s.speed; sp.addEventListener('change', () => { s.speed = sp.value; });
        rows.append(el('div', {class:'sort-item' + (s.alive ? '' : ' wrong')}, el('b', {style:{minWidth:'34px'}}, s.name), el('div', {class:'row'}, w, sp, ui.button(s.alive ? '💥 Kill' : '♻️ Revive', () => toggleKill(s), 'sm ' + (s.alive ? 'danger' : 'ok')))));
      });
    }
    function addServer(){ if (S.length >= 6) return; const s = mkServer(S.length); s.free = st.t; S.push(s); d.setHidden('s' + s.i, false); d.setStatus('s' + s.i, 'ok'); membershipChanged(); renderRows(); }
    function removeServer(){ if (S.length <= 1) return; const s = S.pop(); s.q.forEach(() => log.errors.push(st.t)); d.setHidden('s' + s.i, true); membershipChanged(); renderRows(); }
    function ui_(){
      const now = st.t, W = 3; const cut = a => a.filter(x => (Array.isArray(x) ? x[0] : x) > now - W);
      log.served = cut(log.served); log.errors = cut(log.errors); log.assigned = cut(log.assigned); log.lat = cut(log.lat);
      const served = log.served.length, errs = log.errors.length;
      met.set('tp', served / W); met.set('err', served + errs ? errs / (served + errs) * 100 : 0); met.set('p95', pct(log.lat.map(x => x[1]), .95));
      const per = S.map(s => log.assigned.filter(a => a[1] === s.i).length); const live = S.filter(s => s.healthy).map(s => per[s.i]);
      met.set('imb', live.length > 1 ? Math.max(...live) / Math.max(1, Math.min(...live)) : 1); met.set('remap', st.remap == null ? 0 : st.remap);
      const tot = per.reduce((a, b) => a + b, 0) || 1;
      bars.innerHTML = '';
      S.forEach(s => { bars.append(el('div', {class:'wf-row', style:{gridTemplateColumns:'60px 1fr 140px'}}, el('b', {class:'wl'}, s.name), el('div', {class:'wf-track', style:{height:'18px'}}, el('div', {class:'wf-bar', style:{left:'0', width:(per[s.i] / tot * 100) + '%', background:s.alive ? (s.q.length > 15 ? 'var(--warn)' : 'var(--c-service)') : 'var(--bad)'}})), el('span', {class:'wt'}, `${Math.round(per[s.i] / tot * 100)}% · q ${s.q.length}${s.healthy ? '' : ' · out'}`))); d.setSub('s' + s.i, `${s.speed} · w${s.weight} · q ${s.q.length}${s.alive && !s.healthy ? '' : (!s.alive && s.healthy ? ' · still routed!' : '')}`); if (s.alive) d.setStatus('s' + s.i, s.q.length > 15 ? 'hot' : 'ok'); });
    }
    const lp = api.loop(dt => {
      if (!st.paused){
        st.t += dt;
        while (st.nextA <= st.t){ arrive(st.nextA, false); st.nextA += expo(st.rate); }
        serve(st.t);
        if (st.t - st.lastHC > 2){ st.lastHC = st.t; healthCheck(); }
      }
      if (st.t - st.lastUI > .25 || st.paused){ st.lastUI = st.t; ui_(); }
    });
    const alg = ui.select({label:'Algorithm', value:'lc', options:[['rr', 'Round robin'], ['wrr', 'Weighted round robin'], ['lc', 'Least connections'], ['p2c', 'Power of two choices'], ['random', 'Random'], ['iphash', 'IP hash (mod N)'], ['chash', 'Consistent hash ring']], onChange:v => { st.alg = v; st.prevMap = mapAll(); st.remap = null; caption.textContent = 'Algorithm changed.'; }});
    const rate = ui.slider({label:'Incoming traffic', min:5, max:200, step:5, value:55, fmt:v => v + ' req/s', onInput:v => st.rate = v});
    const hc = ui.toggle({label:'Active health checks (every 2 s)', checked:true, onChange:v => { st.hc = v; healthCheck(); }});
    const pauseB = ui.button('⏸ Pause', () => { st.paused = !st.paused; pauseB.innerHTML = st.paused ? '▶ Resume' : '⏸ Pause'; if (!st.paused) st.nextA = st.t; }, 'sm');
    host.append(el('div', {class:'ctl-grid'}, alg.el, rate.el), el('div', {class:'row', style:{margin:'10px 0', justifyContent:'space-between'}}, hc.el, el('div', {class:'controls'}, pauseB, ui.button('⏭ Step one request', () => { if (!st.paused){ st.paused = true; pauseB.innerHTML = '▶ Resume'; } arrive(st.t, true); st.t += .01; serve(st.t); ui_(); }, 'sm'), ui.button('➕ Server', addServer, 'sm'), ui.button('➖ Server', removeServer, 'sm ghost'), ui.button('↺ Reset', () => { S.splice(0); for (let i = 0; i < 4; i++){ S.push(mkServer(i)); d.setHidden('s' + i, false); d.setStatus('s' + i, 'ok'); } for (let i = 4; i < 6; i++) d.setHidden('s' + i, true); st.t = 0; st.nextA = 0; st.lastHC = 0; st.remap = null; st.prevMap = mapAll(); Object.keys(log).forEach(k => log[k] = []); renderRows(); }, 'sm ghost'))),
      holder, el('div', {class:'verdict warn', style:{margin:'8px 0', fontWeight:'500'}, 'aria-live':'polite'}, caption), met.el, el('h4', {style:{margin:'14px 0 6px'}}, 'Share of requests (last 3 s)'), bars, el('h4', {style:{margin:'14px 0 6px'}}, 'Servers'), rows);
    caption.textContent = 'Running with least connections. Make S1 “slow”, then switch to round robin.';
    renderRows(); st.prevMap = mapAll(); lp.resume();
  }
});
} catch(e){ console.error('[SDA] playground load-balancer', e); SDA.errors.push({id:'load-balancer', error:e}); }

/* ---------------- #10 Rate limiter, five algorithms side by side ---------------- */
try {
SDA.register({kind:'playground', id:'rate-limiter', module:'traffic', icon:'🚦', title:'Rate limiters side by side',
  summary:'Token bucket, leaky bucket, fixed window, sliding log and sliding counter receive the exact same requests. See what each allows, rejects or delays.',
  explain:`<ul><li><b>Window-edge burst</b> pattern: the <b>fixed window</b> lets ~2× the limit through within one real second (check “max in any 1 s”); sliding windows don’t.</li><li><b>Burst ×20</b>: token bucket allows up to its capacity instantly; leaky bucket <b>delays</b> (amber → green later) instead of rejecting until its queue fills.</li><li>A token bucket may legitimately pass slightly more than the limit in one second — up to its capacity plus what refills meanwhile (amber). The red ⚠ marks the fixed window’s boundary problem: ~2× the limit.</li><li>The <b>sliding counter</b> is almost identical to the exact <b>sliding log</b>, but stores two numbers instead of every timestamp.</li></ul><p class="lab-hint">Green dot = allowed (for leaky bucket, drawn when actually processed), amber = queued, red = rejected (429). Dashed lines are fixed-window boundaries.</p>`,
  real:[{co:'Stripe · Cloudflare · Nginx', tier:'confirmed', text:'Stripe described Redis-backed token buckets; Cloudflare a sliding-window counter; Nginx’s limit_req is a leaky bucket.', src:'Stripe Engineering (2017); Cloudflare blog (2017); Nginx docs'}],
  mount(host, api){
    const P = {limit:10, burst:10, rate:8, pattern:'edge', speed:1};
    let t = 0, paused = false, nextA = 0, lastBurst = -10, edgeNext = 1.95, lastUI = 0;
    const W = 1;
    const mk = () => ({
      tb:{name:'Token bucket', tokens:P.burst, last:0, ev:[], allowT:[], state(){ return `tokens ${this.tokens.toFixed(1)}/${P.burst}`; }, offer(t){ this.tokens = Math.min(P.burst, this.tokens + (t - this.last) * P.limit / W); this.last = t; if (this.tokens >= 1){ this.tokens -= 1; return 'allow'; } return 'reject'; }},
      lb:{name:'Leaky bucket', q:[], free:0, ev:[], allowT:[], state(){ return `queue ${this.q.length}/${P.burst}`; }, offer(t){ if (this.q.length < P.burst){ this.q.push(t); return 'queue'; } return 'reject'; }, tick(t){ while (this.q.length){ const a = this.q[0], start = Math.max(this.free, a); if (start > t) break; this.q.shift(); this.free = start + W / P.limit; this.ev.push([start, 'allow', start - a]); this.allowT.push(start); } }},
      fw:{name:'Fixed window', win:-1, c:0, ev:[], allowT:[], state(){ return `count ${this.c}/${P.limit} (window ${this.win})`; }, offer(t){ const w = Math.floor(t / W); if (w !== this.win){ this.win = w; this.c = 0; } if (this.c < P.limit){ this.c++; return 'allow'; } return 'reject'; }},
      sl:{name:'Sliding log', log:[], ev:[], allowT:[], state(){ return `log size ${this.log.length}`; }, offer(t){ this.log = this.log.filter(x => x > t - W); if (this.log.length < P.limit){ this.log.push(t); return 'allow'; } return 'reject'; }},
      sc:{name:'Sliding counter', start:0, cur:0, prev:0, est:0, ev:[], allowT:[], state(){ return `cur ${this.cur} prev ${this.prev} est ${this.est.toFixed(1)}`; }, offer(t){ if (t >= this.start + W){ this.prev = t >= this.start + 2 * W ? 0 : this.cur; this.cur = 0; this.start = Math.floor(t / W) * W; } this.est = this.cur + this.prev * (1 - (t - this.start) / W); if (this.est < P.limit){ this.cur++; return 'allow'; } return 'reject'; }}
    });
    let L = mk();
    function offerAll(time){ Object.values(L).forEach(l => { const r = l.offer(time); l.ev.push([time, r]); if (r === 'allow') l.allowT.push(time); }); }
    function maxIn1s(a){ let best = 0, i = 0; for (let j = 0; j < a.length; j++){ while (a[j] - a[i] >= W - 1e-6) i++; best = Math.max(best, j - i + 1); } return best; }
    const cv = el('canvas', {height:640, style:{height:'320px'}, 'aria-label':'Five rate limiter timelines over the last 6 seconds'}); const box = el('div', {class:'chart-box'}, cv);
    const tbl = el('div');
    function draw(){
      const Wd = box.clientWidth || 700, H = 320; if (cv.width !== Wd * 2) cv.width = Wd * 2; const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, Wd, H);
      const left = 150, span = 6, X = s => left + (s - (t - span)) / span * (Wd - left - 10);
      g.font = '11px ' + css('--font-mono');
      g.strokeStyle = css('--border-strong'); g.setLineDash([3, 4]); for (let k = Math.ceil(t - span); k <= t; k++){ g.beginPath(); g.moveTo(X(k), 4); g.lineTo(X(k), H - 14); g.stroke(); g.fillStyle = css('--faint'); g.fillText(k + 's', X(k) + 2, H - 3); } g.setLineDash([]);
      const C = {allow:css('--ok'), reject:css('--bad'), queue:css('--warn')};
      Object.values(L).forEach((l, i) => {
        const y = 30 + i * 60; g.fillStyle = css('--text'); g.fillText(l.name, 8, y); g.fillStyle = css('--muted'); g.fillText(l.state(), 8, y + 16);
        g.strokeStyle = css('--border'); g.beginPath(); g.moveTo(left, y + 4); g.lineTo(Wd - 10, y + 4); g.stroke();
        l.ev.forEach(([tt, r]) => { if (tt < t - span) return; g.fillStyle = C[r]; g.beginPath(); g.arc(X(tt), y + 4 + (r === 'reject' ? 12 : r === 'queue' ? -12 : 0), 3.6, 0, 7); g.fill(); });
      });
    }
    function table(){
      tbl.innerHTML = '';
      const rows = Object.values(L).map(l => { const a = l.ev.filter(e => e[1] === 'allow').length, r = l.ev.filter(e => e[1] === 'reject').length; const m = maxIn1s(l.allowT); const big = m >= P.limit * 1.5; return [`<b>${l.name}</b>`, a, r, `<span style="color:${big ? 'var(--bad)' : m > P.limit ? 'var(--warn)' : 'var(--ok)'}">${m}${big ? ' ⚠ 2× burst' : ''}</span>`]; });
      tbl.append(document.createRange().createContextualFragment(SDA.h.table(['Algorithm', 'Allowed', 'Rejected', `Max allowed in any 1 s (limit ${P.limit})`], rows, [1, 2, 3])));
    }
    function gen(dt){
      const end = t + dt;
      if (P.pattern === 'steady' || P.pattern === 'bursty'){ const rr = P.pattern === 'steady' ? P.rate : 3; while (nextA <= end){ offerAll(nextA); nextA += expo(rr); } if (P.pattern === 'bursty' && end - lastBurst > 3){ lastBurst = end; for (let k = 0; k < 15; k++) offerAll(end + k * .005); } }
      if (P.pattern === 'edge'){ while (edgeNext <= end){ for (let k = 0; k < P.limit; k++) offerAll(edgeNext + k * .004); edgeNext += (Math.round(edgeNext * 100) % 100 > 50) ? .1 : 1.9; } }
      if (nextA < t) nextA = end;
    }
    const lp = api.loop(dt => {
      if (!paused){ const d2 = dt * P.speed; gen(d2); t += d2; L.lb.tick(t); Object.values(L).forEach(l => { l.ev = l.ev.filter(e => e[0] > t - 12); l.allowT = l.allowT.filter(x => x > t - 12); }); }
      draw(); if (t - lastUI > .3){ lastUI = t; table(); }
    });
    const reset = () => { L = mk(); t = 0; nextA = 0; lastBurst = -10; edgeNext = 1.95; table(); };
    const pauseB = ui.button('⏸ Pause', () => { paused = !paused; pauseB.innerHTML = paused ? '▶ Resume' : '⏸ Pause'; }, 'sm');
    host.append(el('div', {class:'ctl-grid'},
      ui.select({label:'Traffic pattern', value:'edge', options:[['edge', 'Window-edge bursts'], ['steady', 'Steady (random arrivals)'], ['bursty', 'Bursty (spikes every 3 s)'], ['manual', 'Manual only (buttons)']], onChange:v => { P.pattern = v; edgeNext = Math.ceil(t) + .95; nextA = t; }}).el,
      ui.slider({label:'Limit (per second)', min:2, max:30, step:1, value:10, fmt:v => v + '/s', onInput:v => { P.limit = v; }}).el,
      ui.slider({label:'Bucket capacity / queue size', min:1, max:40, step:1, value:10, fmt:v => v, onInput:v => { P.burst = v; }}).el,
      ui.slider({label:'Steady rate', min:1, max:40, step:1, value:8, fmt:v => v + ' req/s', onInput:v => { P.rate = v; }}).el,
      ui.select({label:'Speed', value:'1', options:[['0.25', '0.25×'], ['0.5', '0.5×'], ['1', '1×']], onChange:v => P.speed = +v}).el),
      el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('➊ Fire 1', () => offerAll(t), 'sm'), ui.button('💥 Burst ×20', () => { for (let k = 0; k < 20; k++) offerAll(t + k * .003); }, 'sm primary'), pauseB, ui.button('↺ Reset', reset, 'sm ghost')),
      box, el('div', {style:{height:'10px'}}), tbl);
    table();
  }
});
} catch(e){ console.error('[SDA] playground rate-limiter', e); SDA.errors.push({id:'rate-limiter', error:e}); }

/* ---------------- #16 CDN edge map ---------------- */
try {
SDA.register({kind:'playground', id:'cdn-edge', module:'traffic', icon:'🗺️', title:'CDN edge map: pull vs push, TTL, purge, shield',
  summary:'Users across six cities request a Zipf-popular catalogue. Watch per-edge hit ratios, origin load and latency as you change cache size, TTL, mode, shield and versioning.',
  explain:`<ul><li><b>Pull</b> warms up on its own: hit ratio climbs as popular objects get cached. Small caches or short TTLs push more misses to the origin.</li><li>Turn on the <b>origin shield</b>: origin requests/s drop sharply because many edges’ misses collapse at the shield.</li><li><b>Push</b> pre-loads the top objects to every edge: instant high hit ratio for the head, but the long tail always goes back to the origin.</li><li><b>Deploy a new version</b> of the hottest object. Without versioned URLs, edges keep serving the <b>stale</b> copy until TTL expiry or a purge. With versioned URLs there is nothing to purge.</li></ul><p class="lab-hint">Schematic map; RTTs are illustrative. Popularity follows Zipf (object k has weight 1/k) over 300 objects.</p>`,
  real:[{co:'Netflix Open Connect', tier:'confirmed', text:'Pushes predicted-popular titles to ISP-embedded appliances during off-peak fill windows — push for a predictable, huge catalogue.', src:'Netflix Open Connect documentation'}, {co:'Fastly / CDNs generally', tier:'confirmed', text:'Fast global purge and origin shielding are standard CDN features for controlling freshness and origin load.', src:'Fastly documentation'}],
  mount(host, api){
    const EDGES = [{id:'vir', name:'Virginia', x:90, y:170, rtt:200, w:13}, {id:'fra', name:'Frankfurt', x:230, y:100, w:12, rtt:120}, {id:'del', name:'Delhi', x:470, y:120, w:30, rtt:30}, {id:'che', name:'Chennai', x:500, y:300, w:20, rtt:25}, {id:'sin', name:'Singapore', x:680, y:290, w:15, rtt:60}, {id:'syd', name:'Sydney', x:820, y:390, w:10, rtt:150}];
    const ORIGIN = {x:400, y:230}, SHIELD = {x:330, y:330};
    const N = 300, Z = []; let zs = 0; for (let k = 1; k <= N; k++){ zs += 1 / k; Z.push(zs); }
    const pickObj = () => { const r = Math.random() * zs; let lo = 0, hi = N - 1; while (lo < hi){ const m = (lo + hi) >> 1; if (Z[m] < r) lo = m + 1; else hi = m; } return lo; };
    const EW = EDGES.reduce((s, e) => s + e.w, 0);
    const P = {mode:'pull', cap:60, ttl:60, rate:60, shield:false, versioned:true, paused:false};
    let t = 0, nextA = 0, lastUI = 0, lastAnim = 0; const ver = new Array(N).fill(1);
    let caches, shieldC, stats;
    const resetCaches = () => { caches = Object.fromEntries(EDGES.map(e => [e.id, new Map()])); shieldC = new Map(); stats = {req:[], origin:[], lat:[], stale:0, per:Object.fromEntries(EDGES.map(e => [e.id, {h:0, n:0}]))}; if (P.mode === 'push') publish(); };
    const keyOf = k => P.versioned ? `${k}@v${ver[k]}` : String(k);
    function lruGet(m, key){ const v = m.get(key); if (!v) return null; if (v.exp < t){ m.delete(key); return null; } m.delete(key); m.set(key, v); return v; }
    function lruSet(m, key, val, cap){ m.set(key, val); while (m.size > cap) m.delete(m.keys().next().value); }
    function publish(){ EDGES.forEach(e => { const m = caches[e.id]; m.clear(); for (let k = 0; k < Math.min(P.cap, N); k++) m.set(keyOf(k), {exp:Infinity, ver:ver[k]}); }); }
    const svg = sv('svg', {viewBox:'0 0 900 440', role:'img'}); const ttl = sv('title'); ttl.textContent = 'Schematic map of CDN edges, an origin in Mumbai and an optional origin shield'; svg.append(ttl);
    const gL = sv('g'), gN = sv('g'), gA = sv('g'); svg.append(gL, gN, gA);
    const line = (a, b, cls) => { const l = sv('line', {x1:a.x, y1:a.y, x2:b.x, y2:b.y, class:'dg-edge' + (cls ? ' ' + cls : '')}); gL.append(l); return l; };
    const shieldLines = EDGES.map(e => line(e, SHIELD, 'dashed')); const shieldOrigin = line(SHIELD, ORIGIN);
    const originLines = EDGES.map(e => line(e, ORIGIN));
    const node = (p, label, type, r) => { const g = sv('g', {class:'dg-node t-' + type, transform:`translate(${p.x} ${p.y})`}); const c = sv('circle', {r, class:'shape'}); const pctT = sv('text', {class:'sub', y:4, 'text-anchor':'middle'}); const lab = sv('text', {class:'lbl', y:-r - 6, 'text-anchor':'middle'}); lab.textContent = label; g.append(c, pctT, lab); gN.append(g); return {g, c, pctT}; };
    const originN = node(ORIGIN, 'Origin (Mumbai)', 'service', 24); originN.pctT.textContent = 'origin';
    const shieldN = node(SHIELD, 'Origin shield', 'cache', 20); shieldN.pctT.textContent = 'shield';
    const edgeN = Object.fromEntries(EDGES.map(e => [e.id, node(e, 'Edge ' + e.name, 'cdn', 22)]));
    const anims = [];
    function anim(a, b, color){ if (api.reduced || anims.length > 40) return; const c = sv('circle', {r:4}); c.style.fill = color; gA.append(c); anims.push({a, b, t:0, c}); }
    function setShieldVis(){ shieldLines.concat([shieldOrigin]).forEach(l => l.style.opacity = P.shield ? '1' : '0'); shieldN.g.style.opacity = P.shield ? '1' : '.2'; originLines.forEach(l => l.style.opacity = P.shield ? '.15' : '1'); }
    function request(narrate){
      let r = Math.random() * EW, e = EDGES[0]; for (const x of EDGES){ r -= x.w; if (r <= 0){ e = x; break; } }
      const k = pickObj(), key = keyOf(k), m = caches[e.id]; const ps = stats.per[e.id]; ps.n++;
      const hit = lruGet(m, key); let lat = 8, story;
      if (hit){ ps.h++; if (hit.ver !== ver[k]) stats.stale++; story = `${e.name}: object #${k + 1} — <b style="color:var(--ok)">edge hit</b>${hit.ver !== ver[k] ? ' <b style="color:var(--bad)">(STALE version!)</b>' : ''}, ~${lat} ms.`; if (!narrate && Math.random() < .25) anim({x:e.x, y:e.y + 40}, e, css('--ok')); }
      else {
        let fromShield = false;
        if (P.shield){ const sh = lruGet(shieldC, key); lat += e.rtt; if (sh) fromShield = true; else { lat += 2; stats.origin.push(t); lruSet(shieldC, key, {exp:t + P.ttl, ver:ver[k]}, P.cap * 3); } anim(e, SHIELD, css('--warn')); }
        else { lat += e.rtt; stats.origin.push(t); anim(e, ORIGIN, css('--warn')); }
        if (P.mode === 'pull') lruSet(m, key, {exp:t + P.ttl, ver:ver[k]}, P.cap);
        story = `${e.name}: object #${k + 1} — <b style="color:var(--warn)">edge miss</b> → ${P.shield ? (fromShield ? 'shield hit' : 'shield miss → origin') : 'origin'} (+${e.rtt} ms RTT)${P.mode === 'push' ? '; push mode does not cache it at the edge' : '; now cached at the edge'}. ~${lat} ms.`;
      }
      stats.req.push([t, !!hit]); stats.lat.push([t, lat]);
      if (narrate) cap.innerHTML = story;
    }
    const cap = el('div', {class:'verdict warn', style:{fontWeight:'500'}, 'aria-live':'polite'}, 'Requests flowing. Pause and press Step to narrate one request.');
    const met = ui.metrics(null, [{id:'hit', label:'Hit ratio (last 5 s)', unit:'%', dir:'down', warn:80, bad:50, max:100, instant:true}, {id:'org', label:'Origin requests', unit:'/s', warn:15, bad:30, instant:true}, {id:'lat', label:'Avg user latency', unit:'ms', warn:40, bad:90, instant:true}, {id:'stale', label:'Stale responses served', bad:1, instant:true}]);
    function updateUI(){
      const W = 5; stats.req = stats.req.filter(x => x[0] > t - W); stats.origin = stats.origin.filter(x => x > t - W); stats.lat = stats.lat.filter(x => x[0] > t - W);
      const hits = stats.req.filter(x => x[1]).length;
      met.set('hit', stats.req.length ? hits / stats.req.length * 100 : 0); met.set('org', stats.origin.length / W); met.set('lat', stats.lat.length ? stats.lat.reduce((s, x) => s + x[1], 0) / stats.lat.length : 0); met.set('stale', stats.stale);
      EDGES.forEach(e => { const p = stats.per[e.id], n = edgeN[e.id]; const hr = p.n ? p.h / p.n : 0; n.pctT.textContent = Math.round(hr * 100) + '%'; n.c.style.fill = `color-mix(in srgb, var(--ok) ${Math.round(hr * 70)}%, var(--node-bg))`; p.h *= .9; p.n *= .9; });
    }
    const lp = api.loop(dt => {
      if (!P.paused){ t += dt; while (nextA <= t){ request(false); nextA += expo(P.rate); } }
      for (let i = anims.length - 1; i >= 0; i--){ const a = anims[i]; a.t += dt * 1.8; const q = Math.min(1, a.t); a.c.setAttribute('cx', a.a.x + (a.b.x - a.a.x) * q); a.c.setAttribute('cy', a.a.y + (a.b.y - a.a.y) * q); if (a.t >= 1){ a.c.remove(); anims.splice(i, 1); } }
      if (t - lastUI > .4){ lastUI = t; updateUI(); }
    });
    const pauseB = ui.button('⏸ Pause', () => { P.paused = !P.paused; pauseB.innerHTML = P.paused ? '▶ Resume' : '⏸ Pause'; if (!P.paused) nextA = t; }, 'sm');
    host.append(el('div', {class:'ctl-grid'},
      ui.select({label:'Mode', value:'pull', options:[['pull', 'Pull (cache on miss)'], ['push', 'Push (pre-load top objects)']], onChange:v => { P.mode = v; resetCaches(); }}).el,
      ui.slider({label:'Edge cache size', min:10, max:300, step:10, value:60, fmt:v => v + ' objects', onInput:v => { P.cap = v; if (P.mode === 'push') publish(); }}).el,
      ui.slider({label:'TTL', min:5, max:300, step:5, value:60, fmt:v => v + ' s', onInput:v => { P.ttl = v; }}).el,
      ui.slider({label:'Request rate', min:10, max:200, step:10, value:60, fmt:v => v + ' req/s', onInput:v => { P.rate = v; }}).el),
      el('div', {class:'row', style:{gap:'18px', margin:'10px 0'}}, ui.toggle({label:'Origin shield', checked:false, onChange:v => { P.shield = v; setShieldVis(); }}).el, ui.toggle({label:'Versioned URLs (app.3f9a.js)', checked:true, onChange:v => { P.versioned = v; }}).el),
      el('div', {class:'controls', style:{marginBottom:'10px'}}, pauseB, ui.button('⏭ Step one request', () => { if (!P.paused){ P.paused = true; pauseB.innerHTML = '▶ Resume'; } request(true); updateUI(); }, 'sm'),
        ui.button('🚀 Deploy new version of #1', () => { ver[0]++; cap.innerHTML = P.versioned ? 'New version deployed under a <b>new URL</b>: edges simply miss and fetch it. Nothing stale.' : 'New version deployed under the <b>same URL</b>: edges keep serving the old copy until TTL expiry — watch “stale responses”. Try Purge.'; }, 'sm'),
        ui.button('🧹 Purge #1 everywhere', () => { Object.values(caches).forEach(m => { [...m.keys()].filter(k => k === '0' || k.startsWith('0@')).forEach(k => m.delete(k)); }); [...shieldC.keys()].filter(k => k === '0' || k.startsWith('0@')).forEach(k => shieldC.delete(k)); cap.innerHTML = 'Purged object #1 from every edge and the shield. The next requests miss once, then fetch the fresh version.'; }, 'sm'),
        ui.button('↺ Reset caches', () => { resetCaches(); cap.textContent = 'Caches emptied — watch the hit ratio warm up again.'; }, 'sm ghost')),
      el('div', {class:'chart-box'}, svg), el('div', {class:'legend', style:{margin:'8px 0'}}, ...['client', 'cdn', 'cache', 'service'].map(tp => el('span', {class:'lg t-' + tp}, el('span', {class:'sw ' + tp}), SDA.TYPES[tp].label)), el('span', {style:{color:'var(--ok)'}}, '● edge hit'), el('span', {style:{color:'var(--warn)'}}, '● miss travelling to shield/origin')),
      cap, el('div', {style:{height:'10px'}}), met.el);
    resetCaches(); setShieldVis();
  }
});
} catch(e){ console.error('[SDA] playground cdn-edge', e); SDA.errors.push({id:'cdn-edge', error:e}); }
})();
