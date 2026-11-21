
/* =====================================================================
   PART 3 · PLAYGROUNDS (a) — #3 hash ring · #4 cache simulator · #5 replication
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, sv, esc, clamp, fmtNum} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fnv = s => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++){ x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); } x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995); x ^= x >>> 15; return x >>> 0; };
const frag = html => document.createRange().createContextualFragment(html);
const color = i => `hsl(${(i * 67 + 190) % 360} 70% 58%)`;
SDA.ph = {fnv, color, css, frag};

/* ---------------- #3 Consistent hashing ring ---------------- */
try {
SDA.register({kind:'playground', id:'hash-ring', module:'databases', icon:'💍', title:'Consistent hashing ring',
  summary:'Data servers and 300 keys sit on a ring. Add or remove servers, change virtual nodes, and compare how many keys move against simple mod-N routing.',
  explain:`<h3>How to use it</h3><ol><li>Set <b>Virtual nodes</b> to 1. Some servers own two or three times their fair share.</li><li>Raise virtual nodes to 100. The counts become even and the spread shrinks.</li><li>Add a server, then remove one. Watch the keys that move.</li></ol><h3>What to notice</h3><ul><li>Adding a server moves only about 1 in N keys. Mod-N would move about (N − 1) in N.</li><li>Type any key to see which server owns it. It is the first server clockwise from the key.</li></ul><div class="callout tip"><b>Important point</b><p>On a ring, a server change moves only a small slice of the data. Mod-N routing moves almost all of it.</p></div>`,
  real:[{co:'Amazon Dynamo · Apache Cassandra', tier:'confirmed', text:'Both place nodes on a hash ring with multiple virtual nodes per physical node and replicate each key on the next nodes clockwise.', src:'DeCandia et al., SOSP 2007; Cassandra docs (num_tokens)'}],
  mount(host, api){
    const K = 300, KEYS = Array.from({length:K}, (_, i) => 'key-' + i), KH = KEYS.map(k => fnv(k));
    let servers = ['S1', 'S2', 'S3', 'S4'], V = 1, ring = [], owners = [], lastMoved = new Set(), info = '', modInfo = '', look = null, nextId = 5;
    const R = 190, CX = 250, CY = 250, ang = hv => hv / 4294967296 * Math.PI * 2 - Math.PI / 2;
    const svg = sv('svg', {viewBox:'0 0 500 500', role:'img', style:{maxWidth:'500px', margin:'0 auto', display:'block'}}); const tt = sv('title'); tt.textContent = 'Hash ring with server positions and keys coloured by owner'; svg.append(tt);
    const side = el('div', {class:'stack'});
    function build(){ ring = []; servers.forEach((s, si) => { for (let v = 0; v < V; v++) ring.push([fnv(s + '#' + v), si]); }); ring.sort((a, b) => a[0] - b[0]); }
    const ownerOf = hv => { let lo = 0, hi = ring.length; while (lo < hi){ const m = (lo + hi) >> 1; if (ring[m][0] < hv) lo = m + 1; else hi = m; } return ring[lo % ring.length]; };
    function recompute(oldNames){
      build(); const prev = owners; owners = KH.map(hv => servers[ownerOf(hv)[1]]);
      lastMoved = new Set(); if (prev.length) owners.forEach((o, i) => { if (o !== prev[i]) lastMoved.add(i); });
      if (oldNames){ const modOld = KH.map(hv => oldNames[hv % oldNames.length]), modNew = KH.map(hv => servers[hv % servers.length]); const mv = modOld.filter((o, i) => o !== modNew[i]).length; modInfo = `mod-N hashing would have moved ${mv} keys (${Math.round(mv / K * 100)}%).`; info = `Consistent hashing moved ${lastMoved.size} keys (${Math.round(lastMoved.size / K * 100)}%).`; }
      draw();
    }
    function draw(){
      svg.querySelectorAll('g').forEach(g => g.remove()); const g = sv('g'); svg.append(g);
      g.append(sv('circle', {cx:CX, cy:CY, r:R, fill:'none', stroke:css('--border-strong'), 'stroke-width':2}));
      ring.forEach(([hv, si]) => { const a = ang(hv); const l = sv('line', {x1:CX + Math.cos(a) * (R - 10), y1:CY + Math.sin(a) * (R - 10), x2:CX + Math.cos(a) * (R + 14), y2:CY + Math.sin(a) * (R + 14), 'stroke-width':ring.length > 600 ? 1 : 2.5}); l.style.stroke = color(+servers[si].slice(1)); g.append(l); });
      KH.forEach((hv, i) => { const a = ang(hv); const moved = lastMoved.has(i); const c = sv('circle', {cx:CX + Math.cos(a) * (R - 26), cy:CY + Math.sin(a) * (R - 26), r:moved ? 5 : 3}); c.style.fill = color(+owners[i].slice(1)); if (moved){ c.style.stroke = css('--text'); c.style.strokeWidth = '1.5'; if (!api.reduced){ const an = sv('animate', {attributeName:'r', values:'3;8;5', dur:'0.8s', repeatCount:'2'}); c.append(an); } } g.append(c); });
      if (look){ const a = ang(look.hv), b = ang(look.pos); const p = sv('path', {d:`M ${CX + Math.cos(a) * (R - 40)} ${CY + Math.sin(a) * (R - 40)} A ${R - 40} ${R - 40} 0 ${((look.pos - look.hv + 4294967296) % 4294967296) > 2147483648 ? 1 : 0} 1 ${CX + Math.cos(b) * (R - 40)} ${CY + Math.sin(b) * (R - 40)}`, fill:'none', 'stroke-width':4, 'stroke-dasharray':'6 4'}); p.style.stroke = css('--accent1'); g.append(p); const kc = sv('circle', {cx:CX + Math.cos(a) * (R - 40), cy:CY + Math.sin(a) * (R - 40), r:7}); kc.style.fill = css('--accent1'); g.append(kc); }
      const t = sv('text', {x:CX, y:CY - 6, 'text-anchor':'middle', class:'lbl'}); t.style.fill = css('--text'); t.style.font = '700 16px var(--font-ui)'; t.textContent = `${servers.length} servers × ${V} vnodes`; g.append(t);
      const t2 = sv('text', {x:CX, y:CY + 16, 'text-anchor':'middle'}); t2.style.fill = css('--muted'); t2.style.font = '12px var(--font-mono)'; t2.textContent = `${K} keys`; g.append(t2);
      side.innerHTML = '';
      const ideal = K / servers.length, counts = servers.map(s => owners.filter(o => o === s).length);
      const sd = Math.sqrt(counts.reduce((a, c) => a + (c - ideal) ** 2, 0) / counts.length) / ideal * 100;
      side.append(el('b', null, `Keys per server (ideal ${ideal.toFixed(0)})`));
      servers.forEach((s, i) => side.append(el('div', {class:'wf-row', style:{gridTemplateColumns:'40px 1fr 60px'}}, el('b', {style:{color:color(+s.slice(1))}}, s), el('div', {class:'wf-track', style:{height:'16px'}}, el('div', {class:'wf-bar', style:{left:'0', width:Math.min(100, counts[i] / (ideal * 2) * 100) + '%', background:color(+s.slice(1))}})), el('span', {class:'wt'}, String(counts[i])))));
      side.append(el('div', {class:'verdict ' + (sd < 15 ? 'ok' : sd < 35 ? 'warn' : 'bad')}, `Imbalance (std dev): ${sd.toFixed(0)}% of ideal`));
      if (info) side.append(el('div', {class:'verdict ok'}, info), el('div', {class:'verdict warn'}, modInfo));
      if (look) side.append(el('div', {class:'verdict ok', html:`“${esc(look.key)}” hashes to position ${(look.hv / 4294967296 * 360).toFixed(1)}°. Walking clockwise, the first server position is ${look.owner}’s (at ${(look.pos / 4294967296 * 360).toFixed(1)}°) → <b>${look.owner}</b> owns it.`}));
    }
    const vs = ui.slider({label:'Virtual nodes per server', min:1, max:200, step:1, value:1, fmt:v => v, onInput:v => { V = v; info = ''; lastMoved = new Set(); look = null; owners = []; recompute(); }});
    const keyIn = el('input', {class:'input', placeholder:'e.g. user:42', 'aria-label':'Key to look up'});
    const lookup = () => { const k = keyIn.value.trim() || 'user:42'; const hv = fnv(k); const [pos, si] = ownerOf(hv); look = {key:k, hv, pos, owner:servers[si]}; draw(); };
    keyIn.addEventListener('keydown', e => { if (e.key === 'Enter') lookup(); });
    host.append(el('div', {class:'ctl-grid'}, vs.el, el('label', {class:'field'}, el('span', null, 'Look up a key'), el('div', {class:'row'}, keyIn, ui.button('🔎 Find owner', lookup, 'sm')))),
      el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('➕ Add server', () => { if (servers.length >= 8) return; const old = servers.slice(); servers.push('S' + nextId++); look = null; recompute(old); }, 'sm primary'), ui.button('➖ Remove a random server', () => { if (servers.length <= 2) return; const old = servers.slice(); servers.splice(Math.floor(Math.random() * servers.length), 1); look = null; recompute(old); }, 'sm'), ui.button('↺ Reset', () => { servers = ['S1', 'S2', 'S3', 'S4']; nextId = 5; owners = []; info = ''; look = null; recompute(); }, 'sm ghost')),
      el('div', {class:'grid c2', style:{alignItems:'start'}}, el('div', {class:'chart-box'}, svg), side));
    recompute();
  }
});
} catch(e){ console.error('[SDA] playground hash-ring', e); SDA.errors.push({id:'hash-ring', error:e}); }

/* ---------------- #4 Cache simulator ---------------- */
try {
SDA.register({kind:'playground', id:'cache-sim', module:'caching', icon:'⚡', title:'Cache simulator: eviction policies & write strategies',
  summary:'Two labs share one live request stream. Four eviction rules race, then five write strategies compare speed, database load and safety.',
  explain:`<h3>How to use it</h3><ol><li>In <b>Eviction policies</b>, lower the popularity skew and watch the policies pull apart. Then turn on the batch job that scans one-off keys.</li><li>Raise <b>TTL</b>. A very short TTL cuts the hit ratio even with a big cache.</li><li>In <b>Write strategies</b>, press <b>Crash the cache</b> while write-back is running.</li></ol><h3>What to notice</h3><ul><li>The batch scan hurts LRU and FIFO, but LFU holds up.</li><li>Write-back is fastest, but it can lose writes in a crash. Write-around can serve stale reads.</li></ul><div class="callout tip"><b>Important point</b><p>Every cache choice trades something: speed, freshness or safety. Pick the one your data can afford to lose.</p></div><p class="lab-hint">The model has 1,000 items. A cache read takes 1 ms and a database read takes 10 ms.</p>`,
  real:[{co:'Redis · Caffeine · Memcached', tier:'confirmed', text:'Production caches use approximated LRU/LFU (Redis), W-TinyLFU (Caffeine) or segmented LRU (Memcached) rather than textbook policies.', src:'Redis, Caffeine and Memcached documentation'}],
  mount(host, api){
    const N = 1000; let cdf = [], csum = 0;
    const zipf = s => { cdf = []; csum = 0; for (let k = 1; k <= N; k++){ csum += 1 / Math.pow(k, s); cdf.push(csum); } };
    const pick = () => { const r = Math.random() * csum; let lo = 0, hi = N - 1; while (lo < hi){ const m = (lo + hi) >> 1; if (cdf[m] < r) lo = m + 1; else hi = m; } return lo; };
    ui.tabs(host, [
      {id:'evict', label:'🗑️ Eviction policies', render:p => evictionLab(p)},
      {id:'strat', label:'✍️ Write strategies', render:p => strategyLab(p)}
    ]);
    function evictionLab(p){
      const P = {s:1, cap:100, ttl:0, scan:false, speed:1};
      zipf(P.s);
      const mk = () => {
        const lru = new Map(), fifo = new Map(), lfu = new Map(), rnd = {arr:[], idx:new Map()}; const exp = {};
        const ok = (pol, k, t) => { const e = exp[pol + k]; return !(P.ttl && e != null && e < t); };
        return {
          LRU:{hits:0, n:0, win:[], get(k, t){ if (lru.has(k) && ok('L', k, t)){ lru.delete(k); lru.set(k, 1); return true; } lru.delete(k); if (lru.size >= P.cap) lru.delete(lru.keys().next().value); lru.set(k, 1); exp['L' + k] = t + P.ttl; return false; }},
          LFU:{hits:0, n:0, win:[], get(k, t){ if (lfu.has(k) && ok('F', k, t)){ const f = lfu.get(k) + 1; lfu.delete(k); lfu.set(k, f); return true; } lfu.delete(k); if (lfu.size >= P.cap){ let mk_ = null, mf = Infinity; for (const [kk, f] of lfu) if (f < mf){ mf = f; mk_ = kk; } lfu.delete(mk_); } lfu.set(k, 1); exp['F' + k] = t + P.ttl; return false; }},
          FIFO:{hits:0, n:0, win:[], get(k, t){ if (fifo.has(k) && ok('I', k, t)) return true; fifo.delete(k); if (fifo.size >= P.cap) fifo.delete(fifo.keys().next().value); fifo.set(k, 1); exp['I' + k] = t + P.ttl; return false; }},
          Random:{hits:0, n:0, win:[], get(k, t){ if (rnd.idx.has(k) && ok('R', k, t)) return true; if (!rnd.idx.has(k)){ if (rnd.arr.length >= P.cap){ const j = Math.floor(Math.random() * rnd.arr.length), v = rnd.arr[j], last = rnd.arr.pop(); if (j < rnd.arr.length){ rnd.arr[j] = last; rnd.idx.set(last, j); } rnd.idx.delete(v); } rnd.idx.set(k, rnd.arr.length); rnd.arr.push(k); } exp['R' + k] = t + P.ttl; return false; }}
        };
      };
      let pol = mk(), t = 0, nextScan = 5, hist = [], lastH = 0; const COL = {LRU:'--c-client', LFU:'--accent2', FIFO:'--c-lb', Random:'--c-db'};
      const cv = el('canvas', {height:440, style:{height:'220px'}, 'aria-label':'Hit ratio over time for each eviction policy'}); const box = el('div', {class:'chart-box', style:{marginTop:'12px'}}, cv);
      const met = ui.metrics(null, Object.keys(pol).map(k => ({id:k, label:k + ' hit ratio', unit:'%', instant:true, max:100})).concat([{id:'db', label:'DB queries/s (best policy)', instant:true}, {id:'nocache', label:'DB queries/s without cache', instant:true}]));
      function step(dt){
        const RATE = 500 * P.speed; let n = Math.round(RATE * dt);
        for (let i = 0; i < n; i++){ t += 1 / RATE; const k = pick(); for (const name in pol){ const c = pol[name]; const hit = c.get(k, t); c.win.push(hit ? 1 : 0); if (c.win.length > 2000) c.win.shift(); } }
        if (P.scan && t >= nextScan){ nextScan = t + 5; for (let j = 0; j < 300; j++){ const k = N + Math.floor(Math.random() * 1e6); for (const name in pol){ pol[name].get(k, t); pol[name].win.push(0); if (pol[name].win.length > 2000) pol[name].win.shift(); } } }
      }
      function draw(){
        const W = box.clientWidth || 640, H = 220; cv.width = W * 2; const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0);
        g.strokeStyle = css('--border'); g.font = '11px ' + css('--font-mono'); [0, 25, 50, 75, 100].forEach(v => { const y = H - 20 - v / 100 * (H - 40); g.beginPath(); g.moveTo(40, y); g.lineTo(W - 10, y); g.stroke(); g.fillStyle = css('--muted'); g.fillText(v + '%', 4, y + 4); });
        Object.keys(COL).forEach(name => { g.strokeStyle = css(COL[name]); g.lineWidth = 2; g.beginPath(); hist.forEach((hh, i) => { const x = 40 + i * (W - 50) / 119, y = H - 20 - hh[name] / 100 * (H - 40); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); });
        let lx = 50; Object.keys(COL).forEach(name => { g.fillStyle = css(COL[name]); g.fillRect(lx, 6, 10, 10); g.fillStyle = css('--text'); g.fillText(name, lx + 14, 15); lx += 70; });
      }
      const lp = api.loop(dt => { step(Math.min(dt, .05)); if (t - lastH > .25){ lastH = t; const snap = {}; let best = 0; for (const name in pol){ const w = pol[name].win; snap[name] = w.length ? w.reduce((a, b) => a + b, 0) / w.length * 100 : 0; met.set(name, snap[name]); best = Math.max(best, snap[name]); } met.set('db', 500 * P.speed * (1 - best / 100)); met.set('nocache', 500 * P.speed); hist.push(snap); if (hist.length > 120) hist.shift(); draw(); } });
      const reset = () => { pol = mk(); hist = []; t = 0; nextScan = 5; };
      p.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Popularity skew (Zipf s)', min:.3, max:1.5, step:.05, value:1, fmt:v => v.toFixed(2), onInput:v => { P.s = v; zipf(v); }}).el, ui.slider({label:'Cache capacity', min:10, max:600, step:10, value:100, fmt:v => v + ' of 1,000 objects', onInput:v => { P.cap = v; reset(); }}).el, ui.select({label:'TTL', value:'0', options:[['0', 'No TTL'], ['2', '2 s'], ['10', '10 s']], onChange:v => { P.ttl = +v; reset(); }}).el, ui.select({label:'Speed', value:'1', options:[['1', '500 req/s'], ['4', '2,000 req/s']], onChange:v => P.speed = +v}).el), el('div', {class:'row', style:{margin:'10px 0', justifyContent:'space-between'}}, ui.toggle({label:'Batch job scans 300 one-off keys every 5 s', checked:false, onChange:v => { P.scan = v; nextScan = t + 1; }}).el, ui.button('↺ Reset caches', reset, 'sm ghost')), box, el('div', {style:{height:'10px'}}), met.el);
    }
    function strategyLab(p){
      const P = {wr:20, speed:1}; zipf(1);
      const NAMES = ['Cache-aside', 'Read-through', 'Write-through', 'Write-back', 'Write-around (TTL only)'];
      const mk = () => NAMES.map(n => ({n, cache:new Map(), dirty:new Set(), r:0, rl:0, w:0, wl:0, hits:0, dbw:0, dbr:0, stale:0, lost:0, lastFlush:0}));
      let S = mk(), dbVer = new Int32Array(N), t = 0, lastUI = 0;
      const CAP = 300;
      const put = (s, k, v) => { s.cache.delete(k); if (s.cache.size >= CAP){ const ev = s.cache.keys().next().value; if (s.dirty.has(ev)){ s.dbw++; s.dirty.delete(ev); } s.cache.delete(ev); } s.cache.set(k, v); };
      function op(){
        const k = pick(), isW = Math.random() * 100 < P.wr;
        if (isW){ dbVer[k]++; }
        S.forEach(s => {
          if (isW){
            s.w++;
            if (s.n === 'Write-back'){ put(s, k, {v:dbVer[k], exp:Infinity}); s.dirty.add(k); s.wl += 1; }
            else if (s.n === 'Write-through'){ put(s, k, {v:dbVer[k], exp:Infinity}); s.dbw++; s.wl += 16; }
            else if (s.n === 'Write-around (TTL only)'){ s.dbw++; s.wl += 15; }
            else { s.dbw++; s.cache.delete(k); s.wl += 16; }
          } else {
            s.r++; const e = s.cache.get(k);
            if (e && e.exp > t){ s.hits++; s.rl += 1; if (e.v < dbVer[k] && !(s.n === 'Write-back' && s.dirty.has(k))) s.stale++; s.cache.delete(k); s.cache.set(k, e); }
            else { s.dbr++; s.rl += 11; put(s, k, {v:dbVer[k], exp:s.n === 'Write-around (TTL only)' ? t + 30 : Infinity}); }
          }
        });
      }
      function flush(){ S.forEach(s => { if (s.n === 'Write-back' && t - s.lastFlush >= 1){ s.dbw += s.dirty.size; s.dirty.clear(); s.lastFlush = t; } }); }
      const out = el('div');
      function render(){
        const rows = S.map(s => [`<b>${s.n}</b>`, (s.rl / Math.max(1, s.r)).toFixed(1) + ' ms', (s.wl / Math.max(1, s.w)).toFixed(1) + ' ms', Math.round(s.hits / Math.max(1, s.r) * 100) + '%', fmtNum(s.dbw / Math.max(.1, t)), fmtNum(s.dbr / Math.max(.1, t)), s.stale ? `<span style="color:var(--bad)">${fmtNum(s.stale)}</span>` : '0', s.lost ? `<span style="color:var(--bad)">${fmtNum(s.lost)}</span>` : (s.n === 'Write-back' ? `${s.dirty.size} at risk` : '0')]);
        out.innerHTML = ''; out.append(frag(h.table(['Strategy', 'Avg read', 'Avg write', 'Hit ratio', 'DB writes/s', 'DB reads/s', 'Stale reads', 'Lost on crash'], rows, [1, 2, 3, 4, 5, 6])));
      }
      const lp = api.loop(dt => { const n = Math.round(400 * P.speed * Math.min(dt, .05)); for (let i = 0; i < n; i++){ t += 1 / (400 * P.speed); op(); } flush(); if (t - lastUI > .3){ lastUI = t; render(); } });
      const crash = () => { S.forEach(s => { if (s.n === 'Write-back') s.lost += s.dirty.size; s.dirty.clear(); s.cache.clear(); }); SDA.toast('💥 Cache crashed: every strategy is cold; write-back lost its unflushed writes'); render(); };
      p.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Writes as % of operations', min:1, max:80, step:1, value:20, fmt:v => v + '%', onInput:v => P.wr = v}).el, ui.select({label:'Speed', value:'1', options:[['1', '400 ops/s'], ['3', '1,200 ops/s']], onChange:v => P.speed = +v}).el), el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('💥 Crash the cache', crash, 'sm danger'), ui.button('↺ Reset', () => { S = mk(); dbVer = new Int32Array(N); t = 0; render(); }, 'sm ghost')), out);
      render();
    }
  }
});
} catch(e){ console.error('[SDA] playground cache-sim', e); SDA.errors.push({id:'cache-sim', error:e}); }

/* ---------------- #5 Replication ---------------- */
try {
SDA.register({kind:'playground', id:'replication', module:'databases', icon:'🔁', title:'Replication: lag, stale reads and failover',
  summary:'One leader and two followers. Choose async, semi-sync or sync copying, set each follower’s delay, read from any node, cut one off and kill the leader.',
  explain:`<h3>How to use it</h3><ol><li>Pick <b>Async</b>. Read from the slow follower right after a write and see an old value.</li><li>Kill the leader. Writes that were acknowledged but not yet copied are lost.</li><li>Pick <b>Sync</b>, then partition one follower. Writes stop and wait.</li></ol><h3>What to notice</h3><ul><li>Sync never loses a write, but the slowest follower sets the write time.</li><li>Semi-sync waits for the fastest follower. One slow or cut-off follower does not block it.</li></ul><div class="callout tip"><b>Important point</b><p>Copying faster is safer for data but slower for users. Choose how much loss or waiting you can accept.</p></div>`,
  real:[{co:'MySQL · PostgreSQL', tier:'confirmed', text:'MySQL offers asynchronous and semi-synchronous replication; PostgreSQL streaming replication can be asynchronous or synchronous (synchronous_standby_names, including “ANY 1” quorum style).', src:'MySQL and PostgreSQL documentation'}, {co:'GitHub (2018)', tier:'confirmed', text:'A brief partition caused cross-region failover with writes on both sides. The reconciliation took about a day.', src:'GitHub post-incident analysis (2018)'}],
  mount(host, api){
    const st = {mode:'async', delay:{f1:700, f2:1800}, part:{f1:false, f2:false}, auto:true, t:0, nextW:.5, seq:0, val:0, leader:'l', down:new Set(), log:[], pos:{l:0, f1:0, f2:0}, val_at:{l:{}, f1:{}, f2:{}}, pending:[], acked:0, ackedVals:{}, stale:0, lost:0, lastLat:0, blocked:false, lastUI:0};
    const nodes = ['l', 'f1', 'f2']; const NAME = {l:'Node A', f1:'Node B', f2:'Node C'};
    const holder = el('div'); const cap = el('div', {class:'verdict warn', style:{fontWeight:'500'}, 'aria-live':'polite'}, 'Writes are flowing (about one per second). Read from Node C right after a write. Then kill the leader right after a write.');
    const d = new api.Diagram(holder, {title:'Leader + two followers', w:760, h:280, alt:'An app writes to the leader, which replicates to two followers.', nodes:[{id:'app', type:'client', label:'App', x:80, y:140}, {id:'l', type:'db', label:'Node A (leader)', sub:'', x:330, y:140, w:150}, {id:'f1', type:'db', label:'Node B', sub:'', x:610, y:60, w:150}, {id:'f2', type:'db', label:'Node C', sub:'', x:610, y:220, w:150}], edges:[{from:'app', to:'l'}, {from:'l', to:'f1'}, {from:'l', to:'f2'}, {from:'f1', to:'f2', hidden:true}, {from:'app', to:'f1', dashed:true, curve:-.15}, {from:'app', to:'f2', dashed:true, curve:.15}]});
    const met = ui.metrics(null, [{id:'lat', label:'Last write latency', unit:'ms', instant:true, warn:200, bad:1000}, {id:'lag1', label:'Node B lag', unit:'entries', instant:true, warn:2, bad:5}, {id:'lag2', label:'Node C lag', unit:'entries', instant:true, warn:2, bad:5}, {id:'stale', label:'Stale reads', instant:true, bad:1}, {id:'lost', label:'Acked writes lost', instant:true, bad:1}]);
    const followers = () => nodes.filter(n => n !== st.leader);
    const delayOf = n => n === 'l' ? 60 : st.delay[n];
    function write(){
      if (st.down.has(st.leader)){ cap.textContent = 'No leader! Fail over first.'; return; }
      const seq = ++st.seq, v = ++st.val, t0 = st.t; st.log.push({seq, v, t:t0, leader:st.leader});
      st.pos[st.leader] = seq; st.val_at[st.leader] = v;
      const fs = followers().filter(f => !st.down.has(f));
      fs.forEach(f => { if (!st.part[f]) st.pending.push({to:f, seq, v, at:t0 + delayOf(f) / 1000}); });
      if (!api.reduced) d.flow([['app', st.leader, 'x=' + v]], {dur:350}).then(() => fs.forEach(f => { if (!st.part[f]) d.flow([[st.leader, f, '#' + seq]], {dur:clamp(delayOf(f), 250, 1600)}); }));
      const need = st.mode === 'async' ? 0 : st.mode === 'semi' ? 1 : fs.length + (followers().length - fs.length);
      st.waiting = st.waiting || []; st.waiting.push({seq, v, t0, need});
      if (need === 0) ack(seq, v, t0);
    }
    function ack(seq, v, t0){ st.acked = Math.max(st.acked, seq); st.ackedVals[seq] = v; st.lastLat = (st.t - t0) * 1000 + 2; }
    function tick(dt){
      st.t += dt;
      if (st.auto && st.t >= st.nextW){ st.nextW = st.t + .9; write(); }
      st.pending = st.pending.filter(p => { if (p.at > st.t) return true; if (!st.down.has(p.to) && !st.part[p.to] && p.seq === st.pos[p.to] + 1){ st.pos[p.to] = p.seq; st.val_at[p.to] = p.v; } else if (p.seq > st.pos[p.to] + 1 && !st.down.has(p.to)) return true; return false; });
      followers().forEach(f => { if (st.down.has(f) || st.part[f] || st.pos[f] >= st.pos[st.leader]) return; const nx = st.pos[f] + 1; if (st.pending.some(p => p.to === f && p.seq === nx)) return; const e = st.log.find(x => x.seq === nx); if (e) st.pending.push({to:f, seq:nx, v:e.v, at:st.t + delayOf(f) / 1000}); });
      st.blocked = false;
      (st.waiting || []).forEach(w => { if (w.done) return; const got = followers().filter(f => st.pos[f] >= w.seq).length; if (got >= w.need){ w.done = true; ack(w.seq, w.v, w.t0); } else if (st.t - w.t0 > 2){ st.blocked = true; } });
      st.waiting = (st.waiting || []).filter(w => !w.done && st.t - w.t0 < 30);
    }
    function read(n){
      if (st.down.has(n)){ cap.textContent = `${NAME[n]} is down.`; return; }
      const latestAcked = st.acked ? st.ackedVals[st.acked] : 0, got = st.val_at[n] || 0;
      const stale = got < latestAcked; if (stale) st.stale++;
      if (!api.reduced) d.flow([['app', n, 'read'], [n, 'app', 'x=' + got]], {dur:350});
      cap.innerHTML = stale ? `<b style="color:var(--bad)">Stale read:</b> ${NAME[n]} returned x=${got}, but x=${latestAcked} was already acknowledged to a client. Lag: ${st.pos[st.leader] - st.pos[n]} entries.` : `${NAME[n]} returned x=${got}. It is up to date with every acknowledged write.`;
    }
    function failover(){
      if (!st.down.has(st.leader)){ st.down.add(st.leader); d.setStatus(st.leader, 'down'); }
      const cands = followers().filter(f => !st.down.has(f)); if (!cands.length){ cap.textContent = 'No live follower to promote.'; return; }
      const best = cands.reduce((b, f) => st.pos[f] > st.pos[b] ? f : b, cands[0]);
      const lostSeqs = Object.keys(st.ackedVals).map(Number).filter(s => s > st.pos[best]);
      st.lost += lostSeqs.length; const old = st.leader; st.leader = best;
      st.pending = []; st.waiting = []; st.log = st.log.filter(e => e.seq <= st.pos[best]);
      st.seq = st.pos[best]; st.val = Math.max(st.val, st.val_at[best] || 0);
      st.acked = Math.min(st.acked, st.pos[best]);
      followers().forEach(f => { if (!st.down.has(f) && st.pos[f] > st.pos[best]){ st.pos[f] = st.pos[best]; st.val_at[f] = st.val_at[best]; } });
      relabel();
      cap.innerHTML = `${NAME[old]} died. Promoted <b>${NAME[best]}</b> (log position ${st.pos[best]}). ${lostSeqs.length ? `<b style="color:var(--bad)">${lostSeqs.length} acknowledged write(s) were never replicated and are lost.</b>` : 'No acknowledged writes lost.'}`;
    }
    function revive(){ const dead = nodes.filter(n => st.down.has(n)); if (!dead.length) return; dead.forEach(n => { st.down.delete(n); d.setStatus(n, 'ok'); const disc = st.pos[n] - st.pos[st.leader]; st.pos[n] = st.pos[st.leader]; st.val_at[n] = st.val_at[st.leader]; if (disc > 0) cap.innerHTML = `${NAME[n]} returned and was <b>fenced</b>: it rejoined as a follower and discarded ${disc} write(s) the new leader never saw.`; }); relabel(); }
    function relabel(){ nodes.forEach(n => { d.setSub(n, `${n === st.leader ? 'LEADER · ' : ''}pos ${st.pos[n]} · x=${st.val_at[n] || 0}`); }); }
    const lp = api.loop(dt => { tick(Math.min(dt, .1)); if (st.t - st.lastUI > .2){ st.lastUI = st.t; relabel(); const f = followers(); met.set('lat', st.blocked ? 'blocked' : st.lastLat, st.blocked ? 'bad' : null); met.set('lag1', st.pos[st.leader] - st.pos['f1'] < 0 ? 0 : (st.leader === 'f1' ? 0 : st.pos[st.leader] - st.pos.f1)); met.set('lag2', st.leader === 'f2' ? 0 : st.pos[st.leader] - st.pos.f2); met.set('stale', st.stale); met.set('lost', st.lost); if (st.blocked) cap.innerHTML = '<b style="color:var(--bad)">Writes blocked:</b> synchronous replication is waiting for a follower that can’t receive (partitioned or down).'; } });
    host.append(el('div', {class:'ctl-grid'},
      ui.select({label:'Replication mode', value:'async', options:[['async', 'Asynchronous'], ['semi', 'Semi-synchronous (wait for 1)'], ['sync', 'Synchronous (wait for all)']], onChange:v => st.mode = v}).el,
      ui.slider({label:'Node B replication delay', min:10, max:3000, step:10, value:700, fmt:v => v + ' ms', onInput:v => st.delay.f1 = v}).el,
      ui.slider({label:'Node C replication delay', min:10, max:3000, step:10, value:1800, fmt:v => v + ' ms', onInput:v => st.delay.f2 = v}).el),
      el('div', {class:'row', style:{gap:'18px', margin:'10px 0'}}, ui.toggle({label:'Auto writes (~1/s)', checked:true, onChange:v => st.auto = v}).el, ui.toggle({label:'Partition Node C', checked:false, onChange:v => { st.part.f2 = v; d.setStatus('f2', v ? 'hot' : 'ok'); }}).el),
      el('div', {class:'controls', style:{marginBottom:'10px'}}, ui.button('✍️ Write', write, 'sm primary'), ui.button('📖 Read A', () => read('l'), 'sm'), ui.button('📖 Read B', () => read('f1'), 'sm'), ui.button('📖 Read C', () => read('f2'), 'sm'), ui.button('💥 Kill leader & fail over', failover, 'sm danger'), ui.button('♻️ Revive dead node', revive, 'sm ok')),
      holder, cap, el('div', {style:{height:'10px'}}), met.el);
    relabel(); lp.resume();
  }
});
} catch(e){ console.error('[SDA] playground replication', e); SDA.errors.push({id:'replication', error:e}); }
})();
