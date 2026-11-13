
/* =====================================================================
   PART 5 · PLAYGROUNDS (b) — #14 Trie autocomplete · #15 Geohash/Quadtree · #17 Fan-out
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, sv, esc, clamp, fmtNum, fmtDur} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const {fnv, css, frag} = SDA.ph;

/* ---------------- #14 Trie autocomplete ---------------- */
try {
SDA.register({kind:'playground', id:'trie', module:'search', icon:'🌲', title:'Trie autocomplete',
  summary:'Type into a real trie built from ~100 popular searches. See the prefix path, how many nodes each strategy touches, and the top suggestions — then record searches to change the rankings.',
  explain:`<ul><li>Each keystroke walks one edge: lookup cost depends on the <b>prefix length</b>, not the number of stored queries.</li><li>With <b>DFS per keystroke</b>, a short prefix like “b” visits a large subtree. With <b>precomputed top-k</b>, every lookup is the path plus k reads.</li><li><b>Record a search</b> to bump its frequency: the top-k lists along its path update (in production this happens in a periodic rebuild plus a trending layer).</li></ul>`,
  real:[{co:'Search engines & Lucene', tier:'confirmed', text:'Production typeahead serves precomputed, weighted completions from in-memory structures (tries/FSTs) rebuilt from query logs.', src:'Elasticsearch completion suggester docs; industry practice'}],
  mount(host){
    const DATA = 'biryani near me:980,biryani:870,butter chicken:760,birthday cake:640,burger:610,bitcoin price:520,burger king:520,butter naan:430,bike taxi:300,bisleri:210,bhindi masala:150,bangalore weather:540,bus tickets:470,books:260,chicken biryani:900,chole bhature:510,chai near me:430,cricket score:990,cricket live:880,cake delivery:400,coffee near me:390,coupon code:300,dosa near me:620,dominos:840,dal makhani:450,delhi metro:380,diwali sale:520,dentist near me:210,iphone 15:700,idli:330,ipl schedule:910,ipl live score:960,ice cream:480,india vs pakistan:950,indigo flight status:410,irctc login:880,irctc tatkal booking:720,irctc pnr status:830,momos:690,masala dosa:560,mutton biryani:610,mumbai rains:350,movie tickets:520,metro card recharge:240,mobile recharge:780,mango shake:220,pizza near me:810,paneer tikka:580,pav bhaji:540,pani puri:500,petrol price today:470,pnr status:860,phonepe:640,pizza hut:500,restaurants near me:900,recharge plans:600,rasmalai:210,rain update:260,rapido:530,samosa:440,swiggy:870,shawarma near me:420,sbi login:500,south indian food:330,salary calculator:180,train running status:750,tea:200,taxi near me:350,thali near me:300,tomato price:260,upi transaction failed:420,uber:600,umbrella:150,weather today:820,whatsapp web:910,wedding venues:240,wifi plans:230,zomato:880,zomato offers:420'.split(',').map(s => { const [q, f] = s.split(':'); return [q, +f]; });
    let root, nodes;
    const mk = () => ({ch:'', kids:new Map(), end:false, freq:0, top:[]});
    function build(){ root = mk(); nodes = 1; DATA.forEach(([q, f]) => insert(q, f)); recompute(root, ''); }
    function insert(q, f){ let n = root; for (const ch of q){ if (!n.kids.has(ch)){ const c = mk(); c.ch = ch; n.kids.set(ch, c); nodes++; } n = n.kids.get(ch); } n.end = true; n.freq = f; }
    function recompute(n, pre){ let all = n.end ? [[pre, n.freq]] : []; n.kids.forEach((c, ch) => { all = all.concat(recompute(c, pre + ch)); }); all.sort((a, b) => b[1] - a[1]); n.top = all.slice(0, 5); return n.top.concat(all.slice(5, 0)); }
    function recomputeFull(n, pre){ let all = n.end ? [[pre, n.freq]] : []; n.kids.forEach((c, ch) => { all = all.concat(recomputeFull(c, pre + ch)); }); all.sort((a, b) => b[1] - a[1]); n.top = all.slice(0, 5); return all; }
    function dfs(n, pre, out, cnt){ cnt.v++; if (n.end) out.push([pre, n.freq]); n.kids.forEach((c, ch) => dfs(c, pre + ch, out, cnt)); }
    let mode = 'top'; const inp = el('input', {class:'input', value:'bi', 'aria-label':'Type a search prefix', autocomplete:'off'}); const out = el('div');
    function run(){
      const pre = inp.value.toLowerCase(); let n = root, path = [], ok = true;
      for (const ch of pre){ if (!n.kids.has(ch)){ ok = false; break; } n = n.kids.get(ch); path.push(ch); }
      out.innerHTML = '';
      out.append(el('div', {class:'row', style:{gap:'4px', margin:'8px 0', flexWrap:'wrap'}}, el('span', {class:'chip mono'}, 'root'), ...path.map(ch => el('span', {class:'chip mono', style:{borderColor:'var(--accent1)'}}, '→ ' + (ch === ' ' ? '␣' : ch))), ok ? null : el('span', {class:'chip', style:{color:'var(--bad)'}}, '✗ no such prefix')));
      if (!ok){ out.append(el('div', {class:'verdict warn'}, 'No stored query starts with this prefix. A real system might fall back to fuzzy matching or search results.')); return; }
      let sugg, visited;
      if (mode === 'top'){ sugg = n.top; visited = path.length + 1; }
      else { const all = [], cnt = {v:0}; dfs(n, pre, all, cnt); all.sort((a, b) => b[1] - a[1]); sugg = all.slice(0, 5); visited = path.length + cnt.v; }
      const kids = [...n.kids.entries()].map(([ch, c]) => { const all = []; dfs(c, '', all, {v:0}); return [ch, all.length]; }).sort((a, b) => b[1] - a[1]);
      out.append(el('div', {class:'grid c2', style:{alignItems:'start'}},
        el('div', {class:'card'}, el('b', null, 'Suggestions'), el('div', {class:'stack', style:{marginTop:'6px', gap:'6px'}}, ...sugg.map(([q, f]) => el('div', {class:'row', style:{justifyContent:'space-between'}}, el('span', {html:`<b>${esc(q.slice(0, pre.length))}</b>${esc(q.slice(pre.length))}`}), el('span', {class:'row'}, el('span', {class:'chip mono'}, fmtNum(f)), ui.button('🔍 record', () => { const node = (() => { let x = root; for (const ch of q) x = x.kids.get(ch); return x; })(); node.freq += 150; recomputeFull(root, ''); run(); }, 'sm ghost')))))),
        el('div', {class:'card'}, el('b', null, 'Next characters from this node'), el('div', {class:'pill-row', style:{marginTop:'6px'}}, ...(kids.length ? kids.map(([ch, c]) => el('button', {type:'button', class:'chip mono', style:{cursor:'pointer'}, onclick:() => { inp.value = pre + ch; run(); }}, `${ch === ' ' ? '␣' : ch} · ${c} quer${c === 1 ? 'y' : 'ies'}`)) : [el('span', {class:'muted'}, 'leaf')])))));
      out.append(frag(`<div class="metrics" style="margin-top:10px"><div class="metric"><div class="ml">Nodes visited this keystroke</div><div class="mv">${visited}</div></div><div class="metric"><div class="ml">Total trie nodes</div><div class="mv">${nodes}</div></div><div class="metric"><div class="ml">Stored queries</div><div class="mv">${DATA.length}</div></div></div>`));
    }
    inp.addEventListener('input', run);
    host.append(el('div', {class:'ctl-grid'}, el('label', {class:'field'}, el('span', null, 'Search box'), inp), ui.select({label:'Suggestion strategy', value:'top', options:[['top', 'Precomputed top-5 at each node'], ['dfs', 'DFS the subtree on every keystroke']], onChange:v => { mode = v; run(); }}).el), out);
    build(); recomputeFull(root, ''); run();
  }
});
} catch(e){ console.error('[SDA] playground trie', e); SDA.errors.push({id:'trie', error:e}); }

/* ---------------- #15 Geohash / Quadtree ---------------- */
try {
SDA.register({kind:'playground', id:'geo', module:'search', icon:'🗺️', title:'Geohash & quadtree: find nearby drivers',
  summary:'A schematic Bengaluru with 400 drivers. Click to place a rider. Geohash mode shows the rider’s cell and its 8 neighbours at any precision; quadtree mode adapts cells to density and runs a nearest-neighbour search.',
  explain:`<ul><li><b>Geohash precision</b> 5 cells are ~4.9 × 4.9 km; 6 is ~1.2 × 0.6 km. The rider’s cell (blue) plus 8 neighbours (light) are the only cells searched.</li><li>Click near a cell edge with neighbours <b>off</b>: the nearest driver can be missed. Neighbours on: correct.</li><li><b>Quadtree</b> splits only where drivers are dense — central areas get small cells, outskirts stay large. The kNN search visits just a handful of nodes.</li></ul><p class="lab-hint">Map is schematic (no real geography); geohashes are computed with the real algorithm for the coordinates shown.</p>`,
  real:[{co:'Redis GEO · Uber H3 · Google S2', tier:'confirmed', text:'Redis stores geohash-based scores for radius search; Uber’s H3 and Google’s S2 provide hierarchical cell systems for dispatch and analytics.', src:'Redis docs; Uber Engineering (2018); s2geometry.io'}],
  mount(host, api){
    const BB = {lat0:12.84, lat1:13.10, lng0:77.45, lng1:77.78};
    const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    const encode = (lat, lng, prec) => { let la = [-90, 90], lo = [-180, 180], bit = 0, ch = 0, even = true, s = ''; while (s.length < prec){ if (even){ const m = (lo[0] + lo[1]) / 2; if (lng >= m){ ch = (ch << 1) | 1; lo[0] = m; } else { ch <<= 1; lo[1] = m; } } else { const m = (la[0] + la[1]) / 2; if (lat >= m){ ch = (ch << 1) | 1; la[0] = m; } else { ch <<= 1; la[1] = m; } } even = !even; if (++bit === 5){ s += B32[ch]; bit = 0; ch = 0; } } return s; };
    const cellSize = prec => { const bits = prec * 5, lngBits = Math.ceil(bits / 2), latBits = Math.floor(bits / 2); return [180 / Math.pow(2, latBits), 360 / Math.pow(2, lngBits)]; };
    const hav = (a, b) => { const R = 6371, dLa = (b[0] - a[0]) * Math.PI / 180, dLo = (b[1] - a[1]) * Math.PI / 180; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
    const HUBS = [[12.975, 77.605, 90], [12.935, 77.625, 70], [12.97, 77.72, 50], [12.86, 77.665, 35], [13.035, 77.597, 45], [12.925, 77.583, 40], [13.0, 77.55, 30]];
    let drivers = [], rider = [12.97, 77.6], P = {mode:'geohash', prec:5, nb:true, cap:6}, qtVisited = [], qt = null;
    const gen = () => { drivers = []; HUBS.forEach(([la, lo, n]) => { for (let i = 0; i < n; i++){ const r = Math.random() * .04 + Math.random() * .03, a = Math.random() * 6.283; drivers.push([clamp(la + Math.sin(a) * r * .8, BB.lat0, BB.lat1), clamp(lo + Math.cos(a) * r, BB.lng0, BB.lng1)]); } }); while (drivers.length < 400) drivers.push([BB.lat0 + Math.random() * (BB.lat1 - BB.lat0), BB.lng0 + Math.random() * (BB.lng1 - BB.lng0)]); buildQT(); };
    function buildQT(){ const node = (b, pts, d) => { const n = {b, pts:null, kids:null, d}; if (pts.length <= P.cap || d > 9){ n.pts = pts; return n; } const ml = (b[0] + b[2]) / 2, mg = (b[1] + b[3]) / 2; const qs = [[b[0], b[1], ml, mg], [b[0], mg, ml, b[3]], [ml, b[1], b[2], mg], [ml, mg, b[2], b[3]]]; n.kids = qs.map(q => node(q, pts.filter(p => p[0] >= q[0] && p[0] < q[2] && p[1] >= q[1] && p[1] < q[3]), d + 1)); return n; }; qt = node([BB.lat0, BB.lng0, BB.lat1 + 1e-9, BB.lng1 + 1e-9], drivers, 0); }
    const cv = el('canvas', {height:880, style:{height:'440px', cursor:'crosshair'}, 'aria-label':'Map of drivers; click to place a rider'}); const box = el('div', {class:'chart-box'}, cv); const info = el('div');
    let W = 600; const H = 440;
    const X = lng => 10 + (lng - BB.lng0) / (BB.lng1 - BB.lng0) * (W - 20), Y = lat => H - 10 - (lat - BB.lat0) / (BB.lat1 - BB.lat0) * (H - 20);
    function draw(){
      W = box.clientWidth || 600; cv.width = W * 2; const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, W, H);
      let cands = [], examinedCells = 0;
      if (P.mode === 'geohash'){
        const [dLat, dLng] = cellSize(P.prec); const gh = encode(rider[0], rider[1], P.prec);
        g.strokeStyle = css('--border'); g.lineWidth = 1;
        const lng0 = Math.floor(BB.lng0 / dLng) * dLng, lat0 = Math.floor(BB.lat0 / dLat) * dLat;
        if ((BB.lng1 - BB.lng0) / dLng < 200) for (let x = lng0; x <= BB.lng1; x += dLng){ g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke(); }
        if ((BB.lat1 - BB.lat0) / dLat < 200) for (let y = lat0; y <= BB.lat1; y += dLat){ g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(W, Y(y)); g.stroke(); }
        const cLat = Math.floor(rider[0] / dLat) * dLat, cLng = Math.floor(rider[1] / dLng) * dLng;
        const cells = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++){ if (!P.nb && (i || j)) continue; cells.push([cLat + i * dLat, cLng + j * dLng, !i && !j]); }
        cells.forEach(([la, lo, me]) => { g.fillStyle = me ? 'rgba(56,189,248,.28)' : 'rgba(56,189,248,.1)'; g.fillRect(X(lo), Y(la + dLat), X(lo + dLng) - X(lo), Y(la) - Y(la + dLat)); const code = encode(la + dLat / 2, lo + dLng / 2, P.prec); g.fillStyle = css('--muted'); g.font = '10px ' + css('--font-mono'); g.fillText(code, X(lo) + 3, Y(la + dLat) + 12); });
        const set = new Set(cells.map(([la, lo]) => encode(la + dLat / 2, lo + dLng / 2, P.prec)));
        cands = drivers.filter(d => set.has(encode(d[0], d[1], P.prec))); examinedCells = cells.length;
        info.dataset.gh = gh; info.dataset.size = `${(dLat * 111).toFixed(2)} km × ${(dLng * 111 * Math.cos(rider[0] * Math.PI / 180)).toFixed(2)} km`;
      } else {
        qtVisited = []; const walk = n => { g.strokeStyle = css('--border-strong'); g.lineWidth = .7; g.strokeRect(X(n.b[1]), Y(n.b[2]), X(n.b[3]) - X(n.b[1]), Y(n.b[0]) - Y(n.b[2])); if (n.kids) n.kids.forEach(walk); }; walk(qt);
        const heap = [[0, qt]], best = []; const dbox = b => { const la = clamp(rider[0], b[0], b[2]), lo = clamp(rider[1], b[1], b[3]); return hav(rider, [la, lo]); };
        while (heap.length){ heap.sort((a, b) => a[0] - b[0]); const [dd, n] = heap.shift(); if (best.length >= 5 && dd > best[4][0]) break; qtVisited.push(n); if (n.pts){ n.pts.forEach(p => { best.push([hav(rider, p), p]); best.sort((a, b) => a[0] - b[0]); if (best.length > 5) best.pop(); }); } else n.kids.forEach(k => heap.push([dbox(k.b), k])); }
        qtVisited.forEach(n => { g.fillStyle = 'rgba(139,92,246,.14)'; g.fillRect(X(n.b[1]), Y(n.b[2]), X(n.b[3]) - X(n.b[1]), Y(n.b[0]) - Y(n.b[2])); });
        cands = qtVisited.filter(n => n.pts).flatMap(n => n.pts); examinedCells = qtVisited.length;
      }
      drivers.forEach(d => { g.fillStyle = cands.includes(d) ? css('--c-client') : css('--faint'); g.beginPath(); g.arc(X(d[1]), Y(d[0]), cands.includes(d) ? 3.2 : 2.2, 0, 7); g.fill(); });
      const near = cands.map(d => [hav(rider, d), d]).sort((a, b) => a[0] - b[0]).slice(0, 5);
      const truth = drivers.map(d => [hav(rider, d), d]).sort((a, b) => a[0] - b[0]).slice(0, 5);
      near.forEach(([, d]) => { g.strokeStyle = css('--ok'); g.lineWidth = 2; g.beginPath(); g.arc(X(d[1]), Y(d[0]), 7, 0, 7); g.stroke(); });
      g.fillStyle = css('--accent3'); g.beginPath(); g.arc(X(rider[1]), Y(rider[0]), 7, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 9px sans-serif'; g.fillText('R', X(rider[1]) - 3, Y(rider[0]) + 3);
      const missed = truth.filter(([, d]) => !near.some(([, n]) => n === d)).length;
      info.innerHTML = '';
      info.append(frag(`<div class="metrics"><div class="metric"><div class="ml">${P.mode === 'geohash' ? 'Rider geohash' : 'Quadtree nodes visited'}</div><div class="mv" style="font-size:18px">${P.mode === 'geohash' ? info.dataset.gh : examinedCells}</div></div><div class="metric"><div class="ml">${P.mode === 'geohash' ? 'Cell size' : 'Leaf capacity'}</div><div class="mv" style="font-size:15px">${P.mode === 'geohash' ? info.dataset.size : P.cap + ' drivers'}</div></div><div class="metric"><div class="ml">Drivers examined</div><div class="mv">${cands.length}<small>/ ${drivers.length}</small></div></div><div class="metric ${missed ? 'bad' : ''}"><div class="ml">True 5 nearest found</div><div class="mv">${5 - missed}/5</div></div><div class="metric"><div class="ml">Nearest driver</div><div class="mv" style="font-size:18px">${near[0] ? near[0][0].toFixed(2) + ' km' : '—'}</div></div></div>`));
      if (missed) info.append(el('div', {class:'verdict bad', style:{marginTop:'8px'}}, P.mode === 'geohash' && !P.nb ? `Missed ${missed} of the true nearest drivers: they sit just across the cell boundary. Turn neighbours on.` : `Missed ${missed}: the searched area is smaller than the distance to the 5th-nearest driver. Use a coarser precision or search more rings.`));
    }
    cv.addEventListener('click', e => { const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left), y = (e.clientY - r.top); rider = [BB.lat0 + (H - 10 - y) / (H - 20) * (BB.lat1 - BB.lat0), BB.lng0 + (x - 10) / (r.width - 20) * (BB.lng1 - BB.lng0)]; draw(); });
    const precS = ui.slider({label:'Geohash precision', min:4, max:7, step:1, value:5, fmt:v => v + ' chars', onInput:v => { P.prec = v; draw(); }});
    const capS = ui.slider({label:'Quadtree leaf capacity', min:1, max:30, step:1, value:6, fmt:v => v, onInput:v => { P.cap = v; buildQT(); draw(); }});
    host.append(el('div', {class:'ctl-grid'}, ui.select({label:'Index', value:'geohash', options:[['geohash', 'Geohash grid'], ['quadtree', 'Quadtree (adaptive)']], onChange:v => { P.mode = v; draw(); }}).el, precS.el, capS.el), el('div', {class:'row', style:{margin:'10px 0', gap:'14px'}}, ui.toggle({label:'Search the 8 neighbouring cells', checked:true, onChange:v => { P.nb = v; draw(); }}).el, ui.button('🎲 New drivers', () => { gen(); draw(); }, 'sm')), box, el('div', {class:'legend', style:{margin:'8px 0'}}, el('span', {style:{color:'var(--accent3)'}}, '● rider (click map)'), el('span', {style:{color:'var(--c-client)'}}, '● drivers examined'), el('span', {style:{color:'var(--ok)'}}, '○ 5 nearest among examined')), info);
    gen(); draw();
    if ('ResizeObserver' in window){ const ro = new ResizeObserver(SDA.u.debounce(draw, 120)); ro.observe(box); api.onDispose(() => ro.disconnect()); }
  }
});
} catch(e){ console.error('[SDA] playground geo', e); SDA.errors.push({id:'geo', error:e}); }

/* ---------------- #17 Fan-out on write vs read ---------------- */
try {
SDA.register({kind:'playground', id:'fanout', module:'async', icon:'📣', title:'Fan-out on write vs read (and the celebrity problem)',
  summary:'A social network with power-law followers. Compare push, pull and hybrid timelines: write load, read load, feed latency and how long a celebrity’s post takes to reach followers.',
  explain:`<ul><li><b>Push</b>: reads are cheap and fast, writes cost one operation per follower. Press <b>Celebrity posts</b>: tens of millions of timeline writes queue up, and followers wait minutes to see the post.</li><li><b>Pull</b>: posting is free, but every feed read fetches from ~150 followed accounts — read load and latency jump.</li><li><b>Hybrid</b>: push for accounts below the threshold, pull for celebrities at read time — both loads stay modest. Move the threshold to see the trade-off.</li></ul><p class="lab-hint">Model (illustrative): 200 posts/s from normal users (followers log-normal, median ~200), 2,000 feed reads/s, each reader follows 150 accounts including 3 celebrities; fan-out workers do 300,000 timeline writes/s.</p>`,
  real:[{co:'Twitter / X', tier:'confirmed', text:'Publicly described pushing tweet IDs into Redis home timelines on write, with high-follower accounts handled specially.', src:'Raffi Krikorian, “Timelines at Scale”, QCon 2013'}],
  mount(host, api){
    const P = {mode:'push', thr:100000, speed:1}; const CAP = 300000, READS = 2000, POSTS = 200;
    let t = 0, backlog = 0, hist = [], celebQ = [], last = 0, delays = [], acc = 0;
    const followers = () => Math.round(Math.exp(5.3 + 1.1 * (Math.random() + Math.random() + Math.random() - 1.5)));
    const cv = el('canvas', {height:440, style:{height:'220px'}, 'aria-label':'Write and read operations per second over time'}); const box = el('div', {class:'chart-box'}, cv);
    const met = ui.metrics(null, [{id:'w', label:'Timeline writes/s', instant:true}, {id:'r', label:'Read fetches/s', instant:true}, {id:'lat', label:'Feed read latency', unit:'ms', instant:true, warn:50, bad:150}, {id:'bl', label:'Fan-out backlog', instant:true, warn:1e6, bad:1e7}, {id:'cd', label:'Celebrity post reaches followers in', instant:true}]);
    function tick(){
      let w = 0; for (let i = 0; i < POSTS; i++){ const f = followers(); if (P.mode === 'push' || (P.mode === 'hybrid' && f < P.thr)) w += f; else w += 1; }
      celebQ.forEach(c => { if (!c.queued){ c.queued = true; if (P.mode === 'push' || (P.mode === 'hybrid' && c.f < P.thr)){ w += c.f; c.pushed = true; c.ahead = backlog + w; /* FIFO: its last write sits behind everything queued so far */ } else c.reach = 0; } });
      backlog += w; const done = Math.min(backlog, CAP); backlog -= done;
      celebQ.forEach(c => { if (c.pushed && c.reach == null){ c.ahead -= done; if (c.ahead <= 0) c.reach = t - c.at + 1; } });
      const celebsFollowed = 3, followees = 150;
      const readFetch = P.mode === 'push' ? READS : P.mode === 'pull' ? READS * followees : READS * (1 + celebsFollowed);
      const lat = P.mode === 'push' ? 5 : P.mode === 'pull' ? 5 + followees * .4 : 5 + celebsFollowed * 2;
      hist.push([done, readFetch]); if (hist.length > 60) hist.shift();
      met.set('w', done); met.set('r', readFetch); met.set('lat', lat); met.set('bl', backlog);
      const lastC = celebQ[celebQ.length - 1]; met.set('cd', !lastC ? '—' : lastC.reach == null ? `waiting… ${fmtDur((t - lastC.at) * 1000)}` : lastC.reach === 0 ? 'instantly (read-time merge)' : fmtDur(lastC.reach * 1000));
      t++; draw();
    }
    function draw(){
      const W = box.clientWidth || 640, H = 220; cv.width = W * 2; const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0);
      const mx = Math.max(CAP * 1.2, ...hist.map(x => Math.max(x[0], x[1])));
      [[0, '--c-cache', 'timeline writes/s'], [1, '--c-client', 'read fetches/s']].forEach(([k, c, n], j) => { g.strokeStyle = css(c); g.lineWidth = 2; g.beginPath(); hist.forEach((v, i) => { const x = 10 + i * (W - 20) / 59, y = H - 20 - v[k] / mx * (H - 40); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.fillStyle = css(c); g.font = '11px ' + css('--font-mono'); g.fillText('— ' + n, 10 + j * 160, 14); });
      g.strokeStyle = css('--bad'); g.setLineDash([4, 4]); const y = H - 20 - CAP / mx * (H - 40); g.beginPath(); g.moveTo(10, y); g.lineTo(W - 10, y); g.stroke(); g.setLineDash([]); g.fillStyle = css('--bad'); g.fillText('fan-out capacity', W - 120, y - 4);
    }
    const lp = api.loop(dt => { acc += dt * P.speed; while (acc >= 1){ acc -= 1; tick(); } });
    const celeb = () => { celebQ.push({f:50000000, at:t}); };
    host.append(el('div', {class:'ctl-grid'}, ui.select({label:'Strategy', value:'push', options:[['push', 'Fan-out on write (push)'], ['pull', 'Fan-out on read (pull)'], ['hybrid', 'Hybrid (push below threshold)']], onChange:v => { P.mode = v; backlog = 0; celebQ = []; }}).el, ui.slider({label:'Hybrid threshold (followers)', min:4, max:7, step:.1, value:5, fmt:v => fmtNum(Math.pow(10, v)), onInput:v => { P.thr = Math.pow(10, v); }}).el, ui.select({label:'Simulation speed', value:'1', options:[['1', '1 s per s'], ['10', '10 s per s'], ['60', '60 s per s']], onChange:v => P.speed = +v}).el), el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('⭐ Celebrity (50M followers) posts', celeb, 'sm primary'), ui.button('↺ Reset', () => { backlog = 0; hist = []; celebQ = []; t = 0; }, 'sm ghost')), box, el('div', {style:{height:'10px'}}), met.el);
    lp.resume();
  }
});
} catch(e){ console.error('[SDA] playground fanout', e); SDA.errors.push({id:'fanout', error:e}); }
})();
