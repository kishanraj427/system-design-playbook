/* =====================================================================
   PART 13 · STANDARD CASES (a) — Dropbox/Drive · Google Maps · Zoom/Meet ·
   Hotstar IPL live · Spotify
   Each: 6-step evolution (Day 1 + 5), flows, Break-It, deep dives with a
   compact real simulation (pure maths on SDA.standardA for checking).
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, esc, fmtNum, fmtBytes, rng} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const frag = html => document.createRange().createContextualFragment(html);
const hr = () => el('hr', {style:{border:'0', borderTop:'1px solid var(--border)', margin:'18px 0'}});
const note = html => el('p', {class:'lab-hint', html});
const cssVar = (n, fb) => { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fb; } catch(e){ return fb; } };
const fmtBps = b => { for (const [v, u] of [[1e12, 'Tbps'], [1e9, 'Gbps'], [1e6, 'Mbps'], [1e3, 'kbps']]) if (b >= v){ const x = b / v; return (x >= 100 ? Math.round(x) : +x.toFixed(1)) + ' ' + u; } return Math.round(b) + ' bps'; };
function heap(){ const a = []; return {push(x){ a.push(x); let i = a.length - 1; while (i){ const p = (i - 1) >> 1; if (a[p].k <= a[i].k) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }, pop(){ const top = a[0], last = a.pop(); if (a.length){ a[0] = last; let i = 0; for (;;){ const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].k < a[m].k) m = l; if (r < a.length && a[r].k < a[m].k) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }, get size(){ return a.length; }}; }

/* =========================== DROPBOX: CHUNKING =========================== */
function fnv(buf, s, e){ let x = 0x811c9dc5; for (let i = s; i < e; i++){ x ^= buf[i]; x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(16) + ':' + (e - s); }
function makeFile(size, seed){ const R = rng(seed), b = new Uint8Array(size); for (let i = 0; i < size; i++) b[i] = (R() * 256) | 0; return b; }
function editFile(b, kind, n, seed){
  const R = rng(seed), p = Math.floor(b.length * (.3 + R() * .4)), ins = new Uint8Array(n); for (let i = 0; i < n; i++) ins[i] = (R() * 256) | 0;
  if (kind === 'insert'){ const o = new Uint8Array(b.length + n); o.set(b.subarray(0, p)); o.set(ins, p); o.set(b.subarray(p), p + n); return o; }
  if (kind === 'append'){ const o = new Uint8Array(b.length + n); o.set(b); o.set(ins, b.length); return o; }
  const o = b.slice(); o.set(ins.subarray(0, Math.min(n, b.length - p)), p); return o; // overwrite in place
}
const GEAR = (() => { const R = rng(2024), g = new Uint32Array(256); for (let i = 0; i < 256; i++) g[i] = (R() * 4294967296) >>> 0; return g; })();
function chunkFixed(b, size){ const out = []; for (let s = 0; s < b.length; s += size) out.push([s, Math.min(b.length, s + size)]); return out; }
function chunkCDC(b, avgBits, minS, maxS){ // gear rolling hash; boundary when the top bits are zero
  const mask = ((1 << avgBits) - 1) << (32 - avgBits) >>> 0; const out = []; let s = 0, hsh = 0;
  for (let i = 0; i < b.length; i++){ hsh = ((hsh << 1) + GEAR[b[i]]) >>> 0; const len = i - s + 1;
    if ((len >= minS && (hsh & mask) === 0) || len >= maxS){ out.push([s, i + 1]); s = i + 1; hsh = 0; } }
  if (s < b.length) out.push([s, b.length]); return out;
}
function chunkCompare(o){
  const a = makeFile(o.size, o.seed || 1), b = editFile(a, o.kind, o.n, (o.seed || 1) + 7);
  const run = chunks => { const ca = chunks(a), cb = chunks(b); const have = new Set(ca.map(([s, e]) => fnv(a, s, e))); let up = 0, upB = 0; cb.forEach(([s, e]) => { if (!have.has(fnv(b, s, e))){ up++; upB += e - s; } }); return {chunks:cb.length, newChunks:up, uploadBytes:upB, avg:b.length / cb.length}; };
  return {fixed:run(x => chunkFixed(x, o.fixed)), cdc:run(x => chunkCDC(x, o.bits, o.fixed >> 3, o.fixed * 4)), size:b.length};
}
function chunkSim(host){
  const P = {size:1 << 20, kind:'insert', n:100, fixed:16384, bits:14, seed:1}; const out = el('div');
  function run(){
    const r = chunkCompare(P); out.innerHTML = '';
    out.append(frag(h.table([`${fmtBytes(r.size)} file, ${P.kind} of ${P.n} bytes`, `Fixed ${fmtBytes(P.fixed)} blocks`, `Content-defined (avg ≈ ${fmtBytes(1 << P.bits)})`], [
      ['Chunks in the new version', fmtNum(r.fixed.chunks), fmtNum(r.cdc.chunks)],
      ['Chunks the server has never seen', fmtNum(r.fixed.newChunks), fmtNum(r.cdc.newChunks)],
      ['Bytes to upload', fmtBytes(r.fixed.uploadBytes), fmtBytes(r.cdc.uploadBytes)],
      ['Share of the file re-uploaded', (r.fixed.uploadBytes / r.size * 100).toFixed(1) + '%', (r.cdc.uploadBytes / r.size * 100).toFixed(1) + '%']], [1, 2])));
    out.append(el('div', {class:'verdict ' + (r.cdc.uploadBytes <= r.fixed.uploadBytes ? 'ok' : 'warn'), html:P.kind === 'insert' ? `Inserting ${P.n} bytes shifts every later byte, so every fixed block after the edit changes: <b>${(r.fixed.uploadBytes / r.size * 100).toFixed(0)}%</b> of the file is uploaded again. Content-defined boundaries move with the content, so only the chunk(s) around the edit change: <b>${fmtBytes(r.cdc.uploadBytes)}</b>.` : `An ${P.kind} doesn’t shift later bytes, so fixed blocks work well here too (${fmtBytes(r.fixed.uploadBytes)} vs ${fmtBytes(r.cdc.uploadBytes)}). Content-defined chunking matters for inserts and deletes in the middle of a file.`}));
  }
  host.append(note('A real chunker on a random file. <b>Fixed</b> splits every N bytes; <b>content-defined</b> chunking (CDC) slides a rolling “gear” hash over the bytes and cuts wherever its top bits are zero, with minimum and maximum chunk sizes. Each chunk is identified by its hash; the client uploads only chunks the server doesn’t already have. Sizes are scaled down from real systems (Dropbox documents 4 MB blocks).'),
    el('div', {class:'ctl-grid'},
      ui.select({label:'Edit', value:P.kind, options:[['insert', 'Insert bytes in the middle'], ['overwrite', 'Overwrite bytes in place'], ['append', 'Append at the end']], onChange:v => { P.kind = v; run(); }}).el,
      ui.slider({label:'Bytes changed', min:1, max:5000, value:P.n, onInput:v => { P.n = v; run(); }}).el,
      ui.select({label:'Fixed block size', value:String(P.fixed), options:[['4096', '4 KB'], ['16384', '16 KB'], ['65536', '64 KB']], onChange:v => { P.fixed = +v; P.bits = Math.round(Math.log2(+v)); run(); }}).el),
    el('div', {class:'pill-row', style:{margin:'8px 0'}}, ui.button('🎲 Another file', () => { P.seed++; run(); }, 'sm')), out);
  run();
}

/* =========================== GOOGLE MAPS: ROUTING =========================== */
function makeCity(o){
  const R = rng(o.seed || 3), W = o.w, H = o.h, N = W * H; const cost = new Float32Array(N * 4).fill(Infinity); // edge cost in minutes: 0 right, 1 down, 2 left, 3 up
  const river = Math.floor(W * .55); const bridges = new Set([Math.floor(H * .2), Math.floor(H * .75)]);
  const hwRow = Math.floor(H * .4), hwCol = Math.floor(W * .25);
  const setE = (x, y, d, c) => { const i = y * W + x; cost[i * 4 + d] = c; const [nx, ny, od] = d === 0 ? [x + 1, y, 2] : [x, y + 1, 3]; cost[(ny * W + nx) * 4 + od] = c; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    if (x + 1 < W){ if (x === river && !bridges.has(y)) {} else setE(x, y, 0, y === hwRow ? .25 : .6 + R() * 1.4); }
    if (y + 1 < H) setE(x, y, 1, x === hwCol ? .25 : .6 + R() * 1.4);
  }
  return {W, H, cost, river, bridges:[...bridges], hwRow, hwCol};
}
function route(c, s, t, astar){
  const {W, H, cost} = c, N = W * H, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N); const q = heap(); let settled = 0;
  const tx = t % W, ty = (t / W) | 0, hmin = .25; const hfn = astar ? i => (Math.abs(i % W - tx) + Math.abs(((i / W) | 0) - ty)) * hmin : () => 0;
  dist[s] = 0; q.push({k:hfn(s), i:s});
  while (q.size){ const {i} = q.pop(); if (done[i]) continue; done[i] = 1; settled++; if (i === t) break;
    const x = i % W, y = (i / W) | 0;
    for (let d = 0; d < 4; d++){ const c2 = cost[i * 4 + d]; if (!isFinite(c2)) continue; const j = d === 0 ? i + 1 : d === 1 ? i + W : d === 2 ? i - 1 : i - W; if (done[j]) continue; const nd = dist[i] + c2; if (nd < dist[j]){ dist[j] = nd; prev[j] = i; q.push({k:nd + hfn(j), i:j}); } } }
  const path = []; if (isFinite(dist[t])) for (let v = t; v >= 0; v = prev[v]) path.push(v);
  return {dist:dist[t], settled, path:path.reverse(), done};
}
function routeSim(host){
  const P = {w:60, h:40, seed:3, algo:'astar', sx:4, sy:34, tx:56, ty:5}; let city = makeCity(P);
  const cv = el('canvas', {role:'img', 'aria-label':'City grid with explored intersections and the fastest route'}); const g = cv.getContext('2d');
  const met = ui.metrics(null, [{id:'d', label:'Dijkstra: intersections explored', instant:true}, {id:'a', label:'A*: intersections explored', instant:true}, {id:'t', label:'Fastest route', instant:true, fmt:v => v.toFixed(1) + ' min'}, {id:'same', label:'Same answer?', instant:true}]);
  function run(){
    const s = P.sy * P.w + P.sx, t = P.ty * P.w + P.tx; const d = route(city, s, t, false), a = route(city, s, t, true); const show = P.algo === 'astar' ? a : d;
    met.set('d', fmtNum(d.settled)); met.set('a', fmtNum(a.settled)); met.set('t', d.dist); met.set('same', Math.abs(d.dist - a.dist) < 1e-9 ? '✓ identical' : '✗ differs');
    const W = Math.max(280, Math.min(640, host.clientWidth - 8 || 640)), cs = W / P.w, H = cs * P.h; cv.width = W * 2; cv.height = H * 2; cv.style.width = W + 'px'; cv.style.height = H + 'px'; g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, W, H);
    g.fillStyle = cssVar('--accent1', '#2ce'); g.globalAlpha = .22;
    for (let i = 0; i < P.w * P.h; i++) if (show.done[i]) g.fillRect((i % P.w) * cs, ((i / P.w) | 0) * cs, cs, cs);
    g.globalAlpha = 1; g.fillStyle = cssVar('--info', '#38f'); g.fillRect((city.river + .5) * cs, 0, Math.max(2, cs * .4), H);
    g.fillStyle = cssVar('--surface', '#123'); city.bridges.forEach(y => g.fillRect((city.river + .3) * cs, y * cs + cs * .25, cs * .9, cs * .5));
    g.strokeStyle = cssVar('--warn', '#e93'); g.lineWidth = 2; g.globalAlpha = .55; g.beginPath(); g.moveTo(0, (city.hwRow + .5) * cs); g.lineTo(W, (city.hwRow + .5) * cs); g.moveTo((city.hwCol + .5) * cs, 0); g.lineTo((city.hwCol + .5) * cs, H); g.stroke(); g.globalAlpha = 1;
    g.strokeStyle = cssVar('--ok', '#2c8'); g.lineWidth = 3; g.beginPath(); show.path.forEach((v, k) => { const x = (v % P.w + .5) * cs, y = (((v / P.w) | 0) + .5) * cs; k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    [[P.sx, P.sy, '--ok'], [P.tx, P.ty, '--bad']].forEach(([x, y, c]) => { g.fillStyle = cssVar(c, '#fff'); g.beginPath(); g.arc((x + .5) * cs, (y + .5) * cs, Math.max(4, cs * .6), 0, 7); g.fill(); });
  }
  host.append(note('A real router on a 60 × 40 street grid. Each street segment takes 0.6–2 minutes; the amber lines are fast roads (0.25 min); the blue river can only be crossed on two bridges. <b>Dijkstra</b> explores outward in every direction; <b>A*</b> adds an optimistic estimate of the remaining time (distance × the fastest possible speed), so it explores towards the destination and still finds the exact same fastest route. Shaded squares are intersections each algorithm had to settle. A*’s saving depends on how tight its estimate is: because fast roads exist, the estimate must assume the fastest speed everywhere, so here it saves less than on a uniform grid. Real routers add preprocessing (landmarks, contraction hierarchies) for much bigger savings.'),
    el('div', {class:'ctl-grid'}, ui.select({label:'Show', value:P.algo, options:[['astar', 'A* (goal-directed)'], ['dijkstra', 'Dijkstra']], onChange:v => { P.algo = v; run(); }}).el),
    el('div', {class:'pill-row', style:{margin:'8px 0'}}, ui.button('🎲 New city', () => { P.seed++; city = makeCity(P); run(); }, 'sm'), ui.button('🔀 New trip', () => { const R = rng(P.seed * 31 + P.sx); P.sx = (R() * P.w * .3) | 0; P.sy = (R() * P.h) | 0; P.tx = (P.w * .7 + R() * P.w * .3) | 0; P.ty = (R() * P.h) | 0; run(); }, 'sm')),
    met.el, el('div', {style:{display:'flex', justifyContent:'center', margin:'10px 0'}}, cv));
  run();
}

/* =========================== ZOOM: MESH vs SFU vs MCU =========================== */
function confCost(o){ // per-participant and server bandwidth, Mbps
  const n = o.n, b = o.hi, lo = o.lo, tiles = Math.min(o.tiles, n - 1);
  const mesh = {up:(n - 1) * b, down:(n - 1) * b, server:0, encodes:n - 1};
  const sfu = {up:b, down:(n - 1) * b, server:n * (n - 1) * b + n * b, encodes:1};
  const sim = {up:b + lo, down:n > 1 ? b + Math.max(0, tiles - 1) * lo : 0, server:0, encodes:2}; sim.server = n * sim.up + n * sim.down;
  const mcu = {up:b, down:b, server:2 * n * b, encodes:1, serverTranscodes:n};
  return {mesh, sfu, sim, mcu};
}
function confSim(host){
  const P = {n:12, hi:2.5, lo:.3, tiles:9, upLimit:5}; const out = el('div');
  function run(){
    const r = confCost(P); out.innerHTML = '';
    const row = (k, lbl) => [lbl, r[k].up.toFixed(1) + ' Mbps', r[k].down.toFixed(1) + ' Mbps', r[k].server ? fmtBps(r[k].server * 1e6) : 'n/a', String(r[k].encodes)];
    out.append(frag(h.table([`${P.n} people in a call`, 'Each person uploads', 'Each person downloads', 'Server bandwidth (in + out)', 'Encodes per sender'], [row('mesh', 'Mesh (everyone sends to everyone)'), row('sfu', 'SFU (server forwards streams)'), row('sim', `SFU + simulcast (1 speaker high, ${Math.min(P.tiles, P.n - 1) - 1} tiles low)`), row('mcu', 'MCU (server mixes one stream)')], [1, 2, 3, 4])));
    const meshOk = r.mesh.up <= P.upLimit;
    out.append(el('div', {class:'verdict ' + (meshOk ? 'warn' : 'ok'), html:`With a ${P.upLimit} Mbps uplink, mesh ${meshOk ? 'still fits' : '<b>can’t work</b>'}: each person would upload ${r.mesh.up.toFixed(1)} Mbps. An SFU needs only one upload per person, and simulcast cuts each download from ${r.sfu.down.toFixed(1)} to <b>${r.sim.down.toFixed(1)} Mbps</b> by forwarding thumbnails at low quality. An MCU minimises client bandwidth but must decode and re-encode every stream on the server (${r.mcu.serverTranscodes} decodes per call), which is expensive and adds latency.`}));
  }
  host.append(note('Exact bandwidth arithmetic for a video call where each camera sends at the “high” bitrate. With <b>simulcast</b>, each sender uploads a high and a low layer, and the server forwards the high layer only for the active speaker and the low layer for visible thumbnails.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Participants', min:2, max:50, value:P.n, onInput:v => { P.n = v; run(); }}).el,
      ui.slider({label:'High-quality bitrate', min:.5, max:4, step:.1, value:P.hi, fmt:v => v.toFixed(1) + ' Mbps', onInput:v => { P.hi = v; run(); }}).el,
      ui.slider({label:'Thumbnail bitrate', min:.1, max:1, step:.05, value:P.lo, fmt:v => v.toFixed(2) + ' Mbps', onInput:v => { P.lo = v; run(); }}).el,
      ui.slider({label:'Tiles visible on screen', min:1, max:25, value:P.tiles, onInput:v => { P.tiles = v; run(); }}).el,
      ui.slider({label:'Home uplink', min:1, max:50, value:P.upLimit, fmt:v => v + ' Mbps', onInput:v => { P.upLimit = v; run(); }}).el), out);
  run();
}

/* =========================== HOTSTAR: LIVE AT SCALE =========================== */
function liveLoad(o){
  const egress = o.viewers * o.mbps * 1e6, segReq = o.viewers / o.seg, renditions = o.renditions;
  const originNoShield = o.pops * renditions / o.seg, originShield = o.shields * renditions / o.seg;
  const loginStorm = o.viewers * o.rejoin / o.stormSec;
  return {egress, segReq, originNoShield, originShield, loginStorm, perPop:egress / o.pops};
}
function liveSim(host){
  const P = {viewers:25e6, mbps:1.5, seg:4, renditions:6, pops:200, shields:6, rejoin:.4, stormSec:120}; const out = el('div');
  function run(){
    const r = liveLoad(P); out.innerHTML = '';
    out.append(frag(h.table(['Quantity', 'Value'], [
      ['Video egress at peak', fmtBps(r.egress)], ['… per edge location', fmtBps(r.perPop)],
      ['Segment requests to the CDN', fmtNum(r.segReq) + '/s'],
      ['Requests reaching origin, every edge fetching on its own', fmtNum(r.originNoShield) + '/s'],
      ['… with an origin shield tier (request coalescing)', fmtNum(r.originShield) + '/s'],
      [`Logins / app opens after the innings break (${Math.round(P.rejoin * 100)}% within ${P.stormSec} s)`, fmtNum(r.loginStorm) + '/s']], [1])));
    out.append(el('div', {class:'verdict ok', html:`Video is a CDN problem (${fmtBps(r.egress)} spread over ${P.pops} edge locations), and origin load is tiny once edges are shielded: <b>${fmtNum(r.originShield)}</b> requests/s instead of ${fmtNum(r.originNoShield)}. The dangerous spikes are in the <b>API tier</b>: when an innings ends and play resumes, millions reopen the app at once (<b>${fmtNum(r.loginStorm)}/s</b>), which is why live platforms pre-scale for concurrency and switch off non-essential features under load.`}));
  }
  host.append(note('Exact arithmetic for live streaming. Every viewer fetches one segment per segment duration; each edge location fetches each new segment once per rendition; with a shield tier, only a few shield locations fetch from origin. Inputs are illustrative (25M is the public concurrency record from 2019).'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Concurrent viewers', min:1e6, max:60e6, step:1e6, value:P.viewers, fmt:v => fmtNum(v), onInput:v => { P.viewers = v; run(); }}).el,
      ui.slider({label:'Average bitrate', min:.3, max:6, step:.1, value:P.mbps, fmt:v => v.toFixed(1) + ' Mbps', onInput:v => { P.mbps = v; run(); }}).el,
      ui.slider({label:'Segment duration', min:2, max:10, value:P.seg, fmt:v => v + ' s', onInput:v => { P.seg = v; run(); }}).el,
      ui.slider({label:'Edge locations', min:20, max:600, step:10, value:P.pops, onInput:v => { P.pops = v; run(); }}).el,
      ui.slider({label:'Viewers who reopen the app after a break', min:0, max:1, step:.05, value:P.rejoin, fmt:v => Math.round(v * 100) + '%', onInput:v => { P.rejoin = v; run(); }}).el), out);
  run();
}

/* =========================== SPOTIFY: COLLABORATIVE FILTERING =========================== */
const TRACKS = ['Kesariya', 'Tum Hi Ho', 'Apna Bana Le', 'Naatu Naatu', 'Jai Ho', 'Shape of You', 'Blinding Lights', 'Levitating', 'Kun Faya Kun', 'Channa Mereya'];
const LISTENERS = ['Aditi', 'Rohan', 'Sara', 'Vikram', 'Meera', 'Kabir', 'Zoya'];
const PLAYS0 = [[1, 1, 0, 0, 0, 0, 0, 0, 1, 1], [1, 1, 0, 0, 0, 0, 0, 0, 1, 1], [0, 0, 0, 1, 1, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 1, 1, 1, 0, 0], [1, 0, 1, 0, 0, 0, 0, 0, 0, 1], [0, 0, 0, 1, 1, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 1, 1, 0, 0, 0]];
function cosineItems(M){ const n = M[0].length, S = []; for (let i = 0; i < n; i++){ S.push([]); for (let j = 0; j < n; j++){ let dot = 0, a = 0, b = 0; for (const r of M){ dot += r[i] * r[j]; a += r[i] * r[i]; b += r[j] * r[j]; } S[i].push(a && b ? dot / Math.sqrt(a * b) : 0); } } return S; }
function recommend(M, u, k){ const S = cosineItems(M); const sc = M[u].map((have, i) => have ? -1 : M[u].reduce((s, r, j) => s + (r && j !== i ? S[i][j] : 0), 0)); return sc.map((s, i) => [i, s]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, k); }
function cfSim(host){
  const M = PLAYS0.map(r => r.slice()); let u = 0; const grid = el('div', {style:{overflowX:'auto'}}), out = el('div');
  function run(){
    grid.innerHTML = ''; const t = el('table', {class:'tbl', style:{minWidth:'0', fontSize:'13px'}}); const head = el('tr', null, el('th', null, ''), ...TRACKS.map(x => el('th', {style:{writingMode:'vertical-rl', transform:'rotate(180deg)', fontWeight:'600', padding:'4px 2px'}}, x))); t.append(head);
    M.forEach((r, i) => { const th = el('th', {style:{color:i === u ? 'var(--accent1)' : 'inherit', cursor:'pointer'}, role:'button', tabindex:'0'}, LISTENERS[i]); th.addEventListener('click', () => { u = i; run(); }); th.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); u = i; run(); } }); const tr = el('tr', null, th); r.forEach((v, j) => { const td = el('td', {style:{textAlign:'center', cursor:'pointer', background:v ? 'color-mix(in srgb, var(--accent1) 35%, transparent)' : 'transparent'}, title:'Toggle', role:'button', tabindex:'0'}, v ? '♫' : '·'); const tog = () => { M[i][j] = M[i][j] ? 0 : 1; run(); }; td.addEventListener('click', tog); td.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); tog(); } }); tr.append(td); }); t.append(tr); });
    grid.append(t);
    const rec = recommend(M, u, 3), S = cosineItems(M); out.innerHTML = '';
    if (!rec.length){ out.append(el('div', {class:'verdict warn'}, M[u].some(Boolean) ? `Nothing new for ${LISTENERS[u]}: nobody who shares their tracks plays anything they haven’t heard. Real systems widen the net with audio features, text about the music and popularity.` : `No plays yet for ${LISTENERS[u]}: that’s the cold-start problem. Real systems start from onboarding choices, popularity and editorial playlists.`)); return; }
    out.append(frag(h.table([`Top picks for ${LISTENERS[u]}`, 'Score = Σ similarity to tracks they play', 'Most similar track they already play'], rec.map(([i, s]) => { const best = M[u].map((v, j) => [j, v ? S[i][j] : -1]).sort((a, b) => b[1] - a[1])[0]; return [`<b>${TRACKS[i]}</b>`, s.toFixed(2), `${TRACKS[best[0]]} (cosine ${best[1].toFixed(2)})`]; }), [1])));
    out.append(el('div', {class:'verdict ok', html:`Two tracks are “similar” when the same people play both (cosine similarity of their listener columns). ${LISTENERS[u]} gets tracks that people with overlapping taste play, with no knowledge of genre or language. Click names to switch listener, and cells to add or remove plays.`}));
  }
  host.append(note('Item-item collaborative filtering on a tiny play matrix (rows = listeners, columns = tracks). Discover Weekly-style systems do this over billions of plays (plus audio and text models), offline in batch jobs, and serve the precomputed results.'), grid, out);
  run();
}
SDA.standardA = {chunkCompare, chunkCDC, chunkFixed, makeCity, route, confCost, liveLoad, cosineItems, recommend, PLAYS0};
/* ======================= DROPBOX / GOOGLE DRIVE ======================= */
SDA.register({kind:'case', id:'dropbox', tier:'standard', icon:'📁', title:'Dropbox / Google Drive (file sync)', tagline:'Change one byte, upload one block: chunking, dedupe, metadata and conflict handling.', tags:['file sync', 'chunking', 'deduplication', 'metadata', 'notifications', 'conflicts', 'object storage'],
  modules:['databases', 'distributed', 'realtime', 'caching'],
  summary:'File sync keeps a folder the same on a laptop, a phone and the web. A block store holds the file contents, and a metadata service records which blocks make up each version.',
  accuracy:'Dropbox has published its block design (4 MB blocks named by SHA-256 hashes), its move from Amazon S3 to its own storage (Magic Pocket), its Edgestore metadata store and its sync engine (Nucleus). These facts are marked confirmed. Google Drive’s internals are not described here. Other details are inference or simplified, and the numbers are illustrative.',
  overview:{what:'<b>A small example.</b> Priya edits a 300 MB video project on her laptop and saves it. A few seconds later her phone shows the new version. Only the changed blocks crossed the network, not the whole 300 MB file.', in:['Chunking, hashing and block upload', 'Block storage and deduplication', 'File metadata, versions and the change journal', 'Change notifications to other devices', 'Conflict handling'], out:['Document collaboration inside files (see the Google Docs case)', 'Sharing permissions in depth', 'Full-text search of file contents', 'Client file-system integration details']},
  challenges:['Large files that change only a little each time', 'Exabytes of data, so storage cost dominates', 'Many devices for each user, often offline, editing the same files', 'Metadata must be strongly consistent, but blocks can be copied eventually', 'Telling every device about a change without asking all the time (polling)'],
  fr:['Upload, update, delete and rename files and folders', 'Every device converges to the same state', 'Version history and restore', 'Share folders with others', 'Work offline and sync later'],
  nfr:['Never lose a committed file version (very high durability)', 'A small change syncs in seconds', 'Upload only the changed data, and store identical data once', 'A conflict never silently overwrites someone’s work', 'The cost for each stored byte is as low as possible'],
  scale:[{k:'Block size (Dropbox)', v:'4 MB', math:'Published by Dropbox: files are cut into blocks of up to 4 MB and hashed with SHA-256', tag:'public'}, {k:'Stored data', v:'≈ 1 EB', math:'500M users × 2 GB = 1,000M GB = 1 exabyte, before making copies', tag:'illustrative'}, {k:'Block upload rate', v:'≈ 200K a second', math:'50M active users × about 350 changed blocks a day = 17.5B. 17.5B ÷ 86,400 s ≈ 200,000', tag:'illustrative'}, {k:'Metadata rows', v:'≈ 500B', math:'500M users × about 1,000 files × about 1 version each = 500B', tag:'illustrative'}, {k:'Dedupe savings', v:'often 20% to 50%', math:'Identical files and blocks across users (installers, shared media) are stored once. Say 35% of 1 EB saved is about 350 PB', tag:'illustrative'}],
  arch:{w:860, h:390, minW:640, nodes:[
    {id:'dev', type:'client', label:'Laptop client', x:70, y:120, w:116},
    {id:'phone', type:'client', label:'Phone', x:70, y:290, w:110},
    {id:'notif', type:'service', label:'Notifications', sub:'long poll / push', x:240, y:55, w:140, stage:3},
    {id:'lb', type:'lb', label:'API gateway', x:240, y:195, w:130, stage:2},
    {id:'blocks', type:'service', label:'Block service', sub:'hash → bytes', x:430, y:55, w:140, stage:1},
    {id:'meta', type:'service', label:'Sync server', sub:'whole files on disk', x:430, y:195, w:150},
    {id:'db', type:'db', label:'Metadata DB', sub:'files, versions', x:430, y:335, w:150},
    {id:'store', type:'db', label:'Block storage', sub:'object store (S3)', x:640, y:55, w:150, stage:1}],
   edges:[{from:'dev', to:'meta', gone:2}, {from:'phone', to:'meta', gone:2}, {from:'meta', to:'db'},
     {from:'dev', to:'blocks', stage:1, gone:2}, {from:'blocks', to:'store', stage:1}, {from:'meta', to:'blocks', stage:1},
     {from:'dev', to:'lb', stage:2}, {from:'phone', to:'lb', stage:2}, {from:'lb', to:'meta', stage:2}, {from:'lb', to:'blocks', stage:2},
     {from:'dev', to:'notif', stage:3}, {from:'phone', to:'notif', stage:3}, {from:'meta', to:'notif', stage:3}]},
  evolution:[
    {title:'One server + one database', scale:'1K users', fix:'<p>A sync server keeps whole files on its disk and one database row for each file. When a file changes, the client uploads the whole file. Other devices ask every minute and download the whole file.</p>', after:{lat:300, err:.2, load:20}},
    {title:'A 1-byte edit re-uploads 2 GB', scale:'100K users', hot:['meta'], breaks:'<p>Every save uploads the entire file. Large files (videos, design files, VM images) fill users’ upload links and the server. Identical files uploaded by many users are stored many times.</p>', fix:'<p>Cut files into <b>blocks</b> and name each block by its hash (Dropbox uses 4 MB blocks and SHA-256). The client asks “which of these hashes are you missing?” and uploads only those, to a separate <b>block service</b> backed by object storage.</p><p>Identical blocks are stored once (<b>deduplication</b>). Cutting by content, not by fixed size, also copes with an insert in the middle of a file. Try it in Deep dives.</p>', sub:{meta:'metadata only'}, before:{lat:30000, err:4, load:200}, after:{lat:400, err:.2, load:45}, flow:[['dev', 'meta', 'commit: [h1, h2, h3′]'], ['meta', 'blocks', 'missing? → h3′'], ['dev', 'blocks', 'upload h3′'], ['blocks', 'store']], lesson:['storage-types', 'consistent-hashing']},
    {title:'One sync server for millions of devices', scale:'10M users', hot:['meta', 'db'], breaks:'<p>One server handles every metadata commit and every block transfer. The metadata database becomes the bottleneck and a single point of failure.</p>', fix:'<p>Put stateless metadata servers and block servers behind an <b>API gateway</b>. <b>Split the metadata</b> by user or namespace (Dropbox later built Edgestore for this), so each user’s file tree lives on one shard with strong consistency. Scale the block servers on their own.</p>', sub:{db:'sharded by namespace'}, before:{lat:3000, err:3, load:180}, after:{lat:300, err:.1, load:55}, flow:[['dev', 'lb', 'commit'], ['lb', 'meta'], ['meta', 'db', 'append version']], lesson:['sharding', 'replication']},
    {title:'Polling every minute: slow sync, wasted requests', scale:'100M devices', hot:['lb', 'meta'], breaks:'<p>100M devices asking every minute is about 1.7M requests a second, and most answers are “nothing changed”. A real change can still take up to a minute to appear on another device.</p>', fix:'<p>A <b>notification service</b> keeps a long-poll (or push) connection open for each device. When a namespace changes, it tells that namespace’s devices “something changed since cursor X”. They then fetch the changes from the metadata service.</p>', before:{lat:60000, err:.5, load:160}, after:{lat:2000, err:.1, load:50}, flow:[['meta', 'notif', 'namespace 77 changed'], ['notif', 'phone', 'changed'], ['phone', 'lb', 'list_folder/continue?cursor'], ['lb', 'meta']], lesson:['realtime-transports', 'push-notifications']},
    {title:'Exabytes on cloud storage cost a fortune', scale:'exabytes', hot:['store'], breaks:'<p>Storage is the biggest bill. At exabyte scale, paying a cloud provider for every GB each month costs far more than running storage built for the job.</p>', fix:'<p>Build (or buy) dense, erasure-coded storage made for blocks that never change. Dropbox moved most user data from S3 to its own system, <b>Magic Pocket</b>, around 2016.</p><p>Blocks are written once and copied across zones. They move to cheaper tiers as they go cold.</p>', sub:{store:'own, erasure-coded'}, before:{lat:400, err:.2, load:95}, after:{lat:400, err:.1, load:60}, flow:[['blocks', 'store', 'put block (erasure-coded)']], lesson:['storage-types', 'finops']},
    {title:'Edited on two devices while offline', scale:'every day', hot:['meta'], breaks:'<p>Priya edits a file on a plane. Her colleague edits the same file at the office. Whoever syncs last silently overwrites the other.</p>', fix:'<p>Every commit names the version it was based on. The metadata service accepts it only if that is still the latest (<b>compare-and-set</b>). Otherwise it keeps both and makes a <b>“conflicted copy”</b> for the user to sort out, so nothing is lost.</p><p>A journal for each namespace, with cursors, lets every device replay the changes in order.</p>', sub:{meta:'versioned journal (CAS)'}, before:{lat:400, err:1.5, load:55}, after:{lat:400, err:.05, load:55}, flow:[['dev', 'lb', 'commit v8 (parent v7)'], ['lb', 'meta'], ['meta', 'db', 'CAS parent = v7?']], lesson:['crdts-merkle', 'offline-first-sync']}],
  flows:[
    {name:'Edit a file and sync', steps:[
      {note:'The laptop re-chunks the changed file and sends the new block list for version 8.', flow:[['dev', 'lb', 'commit v8 = [h1, h2, h3′]'], ['lb', 'meta']]},
      {note:'The metadata service asks which blocks are missing. Only h3′ is new.', flow:[['meta', 'blocks', 'have h1, h2, h3′?']]},
      {note:'The client uploads only the missing block.', flow:[['dev', 'lb', 'PUT block h3′'], ['lb', 'blocks'], ['blocks', 'store']]},
      {note:'The commit succeeds only if v7 is still the latest. It is added to the namespace journal.', flow:[['lb', 'meta', 'retry commit'], ['meta', 'db', 'CAS v7 → v8']]},
      {note:'Other devices are told, and they fetch only what changed.', flow:[['meta', 'notif', 'ns changed'], ['notif', 'phone'], ['phone', 'lb', 'delta since cursor'], ['lb', 'blocks', 'GET h3′']]}]},
    {name:'Restore an old version', steps:[
      {note:'The user picks version 5. Its block list is still in the journal.', flow:[['dev', 'lb', 'restore v5'], ['lb', 'meta'], ['meta', 'db', 'blocks of v5']]},
      {note:'No bytes need to be uploaded. v9 simply points at v5’s blocks.', flow:[['meta', 'blocks', 'all present ✓'], ['meta', 'notif', 'ns changed']]}]}],
  breakIt:[
    {label:'Notification service down', kill:['notif'], verdict:'degrades', text:'Devices fall back to asking every few minutes. Sync gets slower, but nothing is lost.'},
    {label:'Block storage zone lost', kill:['store'], verdict:'survives', text:'Blocks are erasure-coded or copied across zones, and a read rebuilds the block from the pieces that remain.'},
    {label:'Metadata shard primary fails', kill:['db'], verdict:'degrades', text:'Users on that shard cannot commit for the few seconds it takes to promote a replica. Clients retry the same commit, which is safe because it is tied to a version.'},
    {label:'Block service overloaded', hot:['blocks'], verdict:'degrades', text:'Uploads slow down and clients back off. Metadata commits wait until the blocks are there, so no file ever points at a missing block.'}],
  dataModel:{lang:'sql', title:'namespaces, journal and blocks', code:`-- Metadata (sharded by namespace_id; strongly consistent within a namespace)
CREATE TABLE journal (
  namespace_id BIGINT, seq BIGINT,              -- seq = cursor; devices replay from their last seq
  path TEXT, version INT, parent_version INT,
  block_list BYTEA[],                           -- ordered SHA-256 hashes
  size BIGINT, deleted BOOLEAN, committed_at TIMESTAMP,
  PRIMARY KEY (namespace_id, seq)
);
CREATE TABLE latest (namespace_id BIGINT, path TEXT, version INT, seq BIGINT, PRIMARY KEY (namespace_id, path));

-- Block store: content-addressed, immutable
--   put(hash, bytes) only if sha256(bytes) == hash ;  get(hash) ;  refcount for garbage collection`, notes:'Blocks never change and are named by their hash, so they can be cached and copied freely. All the coordination lives in the small metadata journal.'},
  apis:[
    {m:'POST', path:'/v1/commit', note:'Fails with 409 if parent_version is not the latest (conflict).', req:'{ "namespace": 77, "path": "/project/cut.mp4", "parent_version": 7, "blocks": ["9f2c…", "1ab0…", "77de…"] }', res:'{ "version": 8, "missing_blocks": ["77de…"] }'},
    {m:'PUT', path:'/v1/blocks/{sha256}', note:'The server verifies the hash of the uploaded bytes.', res:'{ "stored": true }'},
    {m:'GET', path:'/v1/delta?cursor=…', note:'Called after a notification. Returns the journal entries after the cursor.', res:'{ "entries": [ {"path": "/project/cut.mp4", "version": 8, "blocks": ["…"]} ], "cursor": "c_1029" }'}],
  algorithm:{title:'Chunking: fixed blocks vs content-defined', html:'<p>Cutting files into hashed chunks makes sync and dedupe cheap, but where you cut matters.</p><p><b>Fixed-size</b> blocks are simple and good for edits in place and for appends. An <b>insert</b> shifts every later byte, so every later block changes.</p><p><b>Content-defined chunking</b> cuts where a rolling hash of the content hits a pattern, so the cut points move with the data. The Merkle-diff lab shows how two copies find which chunks differ.</p>', mount:chunkSim, lab:'merkle-diff'},
  tradeoffs:[['Content-addressed blocks', 'Dedupe, caching and integrity come for free', 'Garbage collection needs reference counting'], ['Separate metadata and block stores', 'Small, strongly consistent metadata, and huge, simple block storage', 'Two systems to keep in step, so commit only when the blocks exist'], ['Notifications instead of polling', 'Fast sync and far fewer requests', 'Millions of open connections'], ['Conflicted copies', 'Nobody’s edit is lost', 'Users must sort out conflicts by hand']],
  alternatives:[['Whole-file sync', 'Simple, but wasteful for large files'], ['rsync-style deltas only', 'Great for one pair of machines, but no cross-user dedupe or cacheable blocks'], ['Operational transforms inside files', 'Needed for live co-editing of documents, overkill for arbitrary binary files']],
  failures:[['Notifications', 'Fall back to polling'], ['Block storage', 'Erasure coding / replicas'], ['Metadata shard', 'Promote a replica. Commits are safe to retry'], ['Client offline', 'Journal cursor replays changes later']],
  lab:{stack:['Go or Node.js', 'Postgres (journal)', 'MinIO (blocks)', 'WebSockets or long polling', 'k6'], milestones:[
    {day:'Day 1: blocks', items:['Chunk files (fixed, then content-defined) and hash with SHA-256', '“Which blocks are missing?” endpoint and block upload', 'Prove a 1-byte change uploads one block']},
    {day:'Day 2: metadata & sync', items:['A namespace journal with cursors, and compare-and-set commits', 'Long-poll notifications, so a second client syncs automatically', 'Conflicted-copy creation on concurrent edits']},
    {day:'Day 3: scale', items:['Dedupe stats across users', 'Shard the journal by namespace', 'k6: 1,000 clients committing small changes, and measure the sync delay']}],
   pseudocode:{lang:'ts', code:`async function syncFile(path: string, parentVersion: number) {
  const chunks = cdcChunks(await readFile(path));               // content-defined boundaries
  const hashes = chunks.map(c => sha256(c));
  const { missing } = await api.post('/v1/blocks/missing', { hashes });
  await Promise.all(missing.map(h => api.put(\`/v1/blocks/\${h}\`, chunks[hashes.indexOf(h)])));
  const r = await api.post('/v1/commit', { path, parent_version: parentVersion, blocks: hashes });
  if (r.status === 409) return saveConflictedCopy(path);          // someone else committed first
  return r.version;
}`},
   loadTest:'<p>Create 1,000 simulated devices across 300 users sharing some folders. Apply random small edits (inserts, overwrites, appends) to 100 MB files. Measure bytes uploaded vs file sizes, time from commit to the other devices being in sync, and conflicts created when two devices edit offline.</p>'},
  twists:[{q:'Two users upload the same 1 GB video. How much is stored?', a:'Once. Both commits point at the same block hashes. The block store already has them, so the second upload sends nothing. A privacy note: dedupe across users can reveal that a file exists. So some systems dedupe only inside one user, or use convergent encryption with care.'}, {q:'A device was offline for a month. How does it catch up?', a:'It replays the namespace journal from its last cursor and downloads only the blocks it lacks. If the journal was trimmed past its cursor, it lists everything and compares hashes. That is slower, but it still downloads only the missing blocks.'}, {q:'How do you delete blocks safely when files are deleted?', a:'Count the references to each block (or sweep from the live versions). Keep deleted versions for the retention time. Then delete a block with zero references only after a grace period, so a commit happening at that moment cannot lose data.'}, {q:'Two people are editing a shared folder and one renames a folder the other is writing into. What happens?', a:'Folders are tracked by id, not by name. The write goes into the folder, wherever it is now called. A real clash, such as both renaming the same folder differently, is resolved by compare-and-set on the version, and the loser gets a conflicted copy.'}],
  real:[
    {co:'Dropbox blocks', tier:'confirmed', text:'Dropbox splits files into blocks of up to 4 MB, named by SHA-256 hashes. Clients upload only the blocks the server does not have.', src:'Dropbox Tech Blog, “Streaming File Synchronization” (2014), and related posts'},
    {co:'Dropbox Magic Pocket', tier:'confirmed', text:'Dropbox moved the vast majority of user data from Amazon S3 into its own exabyte-scale storage system, Magic Pocket, around 2016.', src:'Dropbox Tech Blog, “Scaling to exabytes and beyond” / “Inside the Magic Pocket” (2016)'},
    {co:'Dropbox metadata and sync engine', tier:'confirmed', text:'Dropbox built Edgestore, a sharded metadata store on MySQL, and rewrote its sync engine (Nucleus) in Rust.', src:'Dropbox Tech Blog, “(Re)Introducing Edgestore” (2016), and “Rewriting the heart of our sync engine” (2020)'},
    {co:'Content-defined chunking', tier:'confirmed', text:'The Low-Bandwidth File System introduced content-defined chunking with Rabin fingerprints so that inserts change only nearby chunks.', src:'Muthitacharoen, Chen & Mazières, “A Low-bandwidth Network File System” (SOSP 2001)'},
    {co:'Google Drive and the exact pipeline', tier:'inference', text:'Google Drive’s internals are not described here. The notification, journal and conflict design is a reasonable reference design.', src:'This case study'},
    {co:'Chunking simulator', tier:'educational', text:'The simulator uses scaled-down chunk sizes and a non-cryptographic hash for speed.', src:'This case study’s model'}],
  sources:['Dropbox Tech Blog: Streaming File Synchronization (2014)', 'Dropbox Tech Blog: Inside the Magic Pocket (2016)', 'Dropbox Tech Blog: (Re)Introducing Edgestore (2016)', 'Dropbox Tech Blog: Rewriting the heart of our sync engine (2020)', 'Muthitacharoen, Chen & Mazières: A Low-bandwidth Network File System (SOSP 2001)']
});

/* ======================= GOOGLE MAPS ======================= */
SDA.register({kind:'case', id:'google-maps', tier:'standard', icon:'🗺️', title:'Google Maps (maps, routing, ETA)', tagline:'Tiles from a CDN, routes from a graph in memory, ETAs from live traffic.', tags:['maps', 'tiles', 'routing', 'dijkstra', 'a*', 'geospatial', 'traffic', 'eta'],
  modules:['search', 'caching', 'traffic', 'async'],
  summary:'One map app solves three problems. It draws the map from pre-built tiles on a CDN, it finds places with a search near you, and it plans routes with live travel times on a huge road graph.',
  accuracy:'Google has said that Maps ETAs use graph neural networks trained with DeepMind, and Google open-sourced the S2 geometry library. Most other internals (the tile pipeline and the routing engine) are not public. They are shown here as a design that uses well-known published techniques: vector tiles, A* and contraction hierarchies. The numbers are illustrative.',
  overview:{what:'<b>A small example.</b> Arjun opens the map in Bengaluru and searches “filter coffee near me”. He taps directions, and the app gives a route that avoids a jam on Outer Ring Road, with a 23-minute travel time.', in:['Map tiles and the tile CDN', 'Places search near a location', 'Route computation on the road graph', 'Live traffic from aggregated phone speeds', 'ETA prediction'], out:['Collecting map data (Street View, imagery)', 'Turn-by-turn navigation UI', 'Reviews and photos in depth', 'Offline maps']},
  challenges:['Billions of map views, so drawing the map on demand is impossible', 'A road graph with hundreds of millions of nodes', 'Routes must follow traffic that changes every minute', 'A good ETA needs a prediction for the next 30 minutes, not only the present', 'Privacy: combine speeds from many phones without tracking any one person'],
  fr:['Pan and zoom the map smoothly', 'Search places by name or category near a location', 'Get the fastest route by car, bike, walking or transit', 'See live traffic and an accurate ETA', 'Reroute when conditions change'],
  nfr:['Map tiles load in tens of milliseconds from nearby caches', 'Route queries return in well under a second', 'ETAs accurate to within a few minutes on most trips (illustrative)', 'Traffic data fresh within minutes', 'Graceful degradation: routes without traffic if the traffic pipeline fails'],
  scale:[{k:'Tiles at one zoom level (z15)', v:'≈ 1.07B', math:'4¹⁵ = 1,073,741,824 tiles for the world. Most are ocean and empty', tag:'illustrative'}, {k:'Road graph', v:'≈ 500M nodes', math:'An illustrative size for the global road network: 500M junctions and ends of roads', tag:'illustrative'}, {k:'Route requests at peak', v:'≈ 100K a second', math:'1B users × 3 routes a day = 3B a day ≈ 35K a second. Peak is about 3 times that, so ≈ 100K', tag:'illustrative'}, {k:'Speed reports', v:'≈ 1M a second', math:'30M phones navigating × 1 report every 30 s = 1,000,000 a second', tag:'illustrative'}],
  arch:{w:920, h:390, minW:640, nodes:[
    {id:'user', type:'client', label:'Maps app', x:70, y:195, w:110},
    {id:'cdn', type:'cdn', label:'Tile CDN', sub:'vector tiles', x:240, y:55, w:124, stage:1},
    {id:'lb', type:'lb', label:'API gateway', x:240, y:195, w:130, stage:2},
    {id:'tiles', type:'service', label:'Tile builder', sub:'pre-rendered', x:430, y:55, w:140, stage:1},
    {id:'app', type:'service', label:'Maps server', sub:'renders on demand', x:430, y:195, w:150},
    {id:'db', type:'db', label:'Map data', sub:'PostGIS', x:430, y:335, w:140},
    {id:'search', type:'service', label:'Places search', sub:'geo index', x:640, y:55, w:140, stage:4},
    {id:'route', type:'service', label:'Routing', sub:'graph in RAM', x:640, y:195, w:140, stage:3},
    {id:'stream', type:'queue', label:'Speed reports', sub:'stream', x:640, y:335, w:150, stage:5},
    {id:'eta', type:'service', label:'Traffic & ETA', sub:'live speeds + ML', x:830, y:280, w:130, stage:5}],
   edges:[{from:'user', to:'app', gone:2}, {from:'app', to:'db'},
     {from:'user', to:'cdn', stage:1}, {from:'cdn', to:'tiles', stage:1}, {from:'db', to:'tiles', stage:1, curve:.6},
     {from:'user', to:'lb', stage:2}, {from:'lb', to:'app', stage:2},
     {from:'app', to:'route', stage:3}, {from:'db', to:'route', stage:3, dashed:true},
     {from:'app', to:'search', stage:4},
     {from:'app', to:'stream', stage:5}, {from:'stream', to:'eta', stage:5}, {from:'eta', to:'route', stage:5}]},
  evolution:[
    {title:'One server + one database', scale:'one city', fix:'<p>A server draws a map image for each request from a spatial database (roads and places in PostGIS), and finds routes with SQL graph queries. This is fine for one city and a few users.</p>', after:{lat:800, err:.3, load:25}},
    {title:'Rendering every map view melts the server', scale:'1M users', hot:['app', 'db'], breaks:'<p>Every pan or zoom draws new images from the raw shapes. That takes seconds of CPU for each screen, and the database is overloaded by spatial queries.</p>', fix:'<p>Build <b>tiles</b> ahead of time. The world is cut into a quadtree of square tiles for each zoom level (4<sup>z</sup> tiles at zoom z). They are built offline from the map data as small <b>vector tiles</b>, which the app styles and draws.</p><p>A tile never changes for a map version, so a <b>CDN</b> can cache it close to users.</p>', sub:{app:'API only'}, before:{lat:4000, err:2, load:220}, after:{lat:250, err:.1, load:45}, flow:[['user', 'cdn', 'tile z15/23410/15142'], ['cdn', 'tiles', 'miss'], ['db', 'tiles', 'nightly build']], lesson:['cdn', 'geospatial']},
    {title:'One API server for a whole country', scale:'50M users', hot:['app'], breaks:'<p>Search, routing and place details all run on one server. It is overloaded in the evening commute.</p>', fix:'<p>Put stateless API servers behind a <b>gateway</b>, with read replicas of the map data. Each capability then scales on its own, as the next steps show.</p>', sub:{db:'read replicas'}, before:{lat:2500, err:3, load:180}, after:{lat:250, err:.1, load:55}, flow:[['user', 'lb', 'GET /directions'], ['lb', 'app']], lesson:['lb-algorithms', 'replication']},
    {title:'Routing with SQL takes seconds', scale:'national graph', hot:['app', 'db'], breaks:'<p>Running Dijkstra’s algorithm over millions of road segments through database queries takes seconds. For a long trip it explores half the country.</p>', fix:'<p>A <b>routing service</b> keeps the road graph <b>in memory</b>. A* searches towards the goal. A preparation step called <b>contraction hierarchies</b> adds shortcut edges, so a long trip looks at thousands of nodes instead of millions.</p><p>Try Dijkstra against A* in Deep dives.</p>', before:{lat:5000, err:2, load:160}, after:{lat:120, err:.05, load:50}, flow:[['app', 'route', 'from → to'], ['db', 'route', 'graph build']], lesson:['geospatial', 'tradeoff-thinking']},
    {title:'Where’s “filter coffee near me”?', scale:'200M places', hot:['db'], breaks:'<p>Text search with a distance filter in SQL is slow and ranks badly. The best café 800 m away loses to a mediocre one 200 m away.</p>', fix:'<p>A <b>places search</b> service uses an inverted index plus a <b>geo index</b> (cells such as S2). It ranks by relevance, distance, rating and whether the place is open now. Results are cached for each cell and query.</p>', before:{lat:2000, err:1, load:140}, after:{lat:150, err:.05, load:45}, flow:[['app', 'search', '“filter coffee” · cell 3a4f… · open now']], lesson:['inverted-index', 'geospatial']},
    {title:'Routes ignore traffic', scale:'live traffic', hot:['route'], breaks:'<p>Routes use typical speeds, so the “fastest” route drives straight into a jam, and the ETA is 20 minutes too hopeful.</p>', fix:'<p>Phones that are navigating send anonymous speed reports into a <b>stream</b>. A <b>traffic service</b> adds up the speeds for each road segment every minute. An ML model <b>predicts</b> the speeds for the next hour (Google described graph neural networks for this).</p><p>Routing uses the predicted travel times as edge weights.</p>', before:{lat:150, err:3, load:60}, after:{lat:180, err:.4, load:65}, flow:[['app', 'stream', 'speed reports'], ['stream', 'eta', 'aggregate per segment'], ['eta', 'route', 'live edge weights']], lesson:['batch-vs-stream', 'time-series']}],
  flows:[
    {name:'Open the map', steps:[
      {note:'The app asks for the tiles that cover the screen, and nearby CDN edges serve almost all of them.', flow:[['user', 'cdn', 'tiles z15']]},
      {note:'A rare miss fetches the tile from the tile store built from map data.', flow:[['cdn', 'tiles', 'miss → tile']]}]},
    {name:'Get directions', steps:[
      {note:'The app asks for a route.', flow:[['user', 'lb', 'GET /directions?from&to'], ['lb', 'app']]},
      {note:'Routing searches the in-memory graph using live and predicted travel times.', flow:[['app', 'route'], ['eta', 'route', 'current weights']]},
      {note:'The route and ETA return. The tiles along it are already cached.', flow:[['app', 'lb', 'route + ETA 23 min'], ['lb', 'user']]},
      {note:'During the trip, the phone reports its speed, feeding traffic for everyone.', flow:[['user', 'lb', 'speed report'], ['lb', 'app'], ['app', 'stream']]}]}],
  breakIt:[
    {label:'Traffic pipeline down', kill:['eta'], verdict:'degrades', text:'Routing falls back to the usual speeds for that time and day. Routes still work, but ETAs are less accurate.'},
    {label:'Routing cluster overloaded', hot:['route'], verdict:'degrades', text:'Serve cached routes for popular origin-destination pairs and shed alternative-route computation first.'},
    {label:'Tile CDN region outage', kill:['cdn'], verdict:'degrades', text:'Clients fall back to another edge, and the app’s own tile cache keeps recently seen areas on screen.'},
    {label:'Places search down', kill:['search'], verdict:'degrades', text:'The map and directions keep working, and search shows recent and saved places.'}],
  dataModel:{lang:'sql', title:'road graph and places', code:`-- Road graph (built offline, loaded into RAM by routing servers)
-- node(id, lat, lng) ; edge(from_node, to_node, length_m, road_class, base_speed_kmh, turn_restrictions)
-- live weights: segment_speed(edge_id, minute_bucket, speed_kmh)   -- from the traffic stream

CREATE TABLE places (
  place_id BIGINT PRIMARY KEY, name TEXT, category TEXT,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  s2_cell_l13 BIGINT,                -- geo index key (~1 km² cells)
  rating REAL, open_hours JSONB
);
CREATE INDEX ON places (s2_cell_l13, category);`, notes:'Tiles and the graph are built from the source map data again each release. Only the live speeds change minute by minute.'},
  apis:[
    {m:'GET', path:'/tiles/{z}/{x}/{y}.pbf', note:'A tile never changes for a map version, so the CDN can keep it for a long time.', res:'<binary vector tile>'},
    {m:'GET', path:'/v1/directions?from=12.97,77.59&to=12.93,77.62&mode=drive', res:'{ "eta_s": 1380, "distance_m": 9800, "polyline": "…", "traffic": "heavy on ORR" }'},
    {m:'GET', path:'/v1/places?q=filter+coffee&near=12.97,77.59', res:'{ "results": [ {"name": "Brahmin’s Coffee Bar", "distance_m": 650, "rating": 4.6} ] }'}],
  algorithm:{title:'Shortest paths: Dijkstra vs A*', html:'<p>Dijkstra’s algorithm settles intersections in order of travel time from the start, in every direction. <b>A*</b> adds an admissible estimate of the remaining time, so it explores towards the destination and returns the identical route. Production routers go further with preprocessing (contraction hierarchies, multi-level partitions) so continent-scale queries settle only a few thousand nodes.</p>', mount:routeSim, pg:'geo'},
  tradeoffs:[['Pre-built vector tiles', 'The CDN can cache them, and the client can style and rotate them', 'A rebuild pipeline, and clients must draw them'], ['The graph in memory, with preparation', 'Routes in milliseconds', 'The preparation must be redone (or adjusted) when weights change'], ['Predicted speeds, not current speeds', 'Accurate ETAs for trips of 30 minutes or more', 'A complex model and training pipelines'], ['A geo-cell search index', 'Fast “near me” queries and caching', 'The cell size needs tuning, and results near cell edges need care']],
  alternatives:[['Server-rendered raster tiles', 'Simple clients, but larger downloads and no smooth rotation or restyling'], ['Plain Dijkstra on every request', 'Correct, but far too slow at national scale'], ['Current speeds only', 'Simpler, but wrong for longer trips as conditions change']],
  failures:[['Traffic pipeline', 'Historical speeds'], ['Routing', 'Cached popular routes'], ['CDN', 'Other edges, and the client cache'], ['Search', 'Recent and saved places']],
  lab:{stack:['Python or Go', 'OpenStreetMap extract of one city', 'PostGIS', 'A routing library (or your own A*)', 'Tippecanoe + a tile server', 'Redis'], milestones:[
    {day:'Day 1: tiles', items:['Import an OSM extract into PostGIS', 'Build vector tiles and serve them, with Nginx caching in front', 'Measure tile latency cold vs cached']},
    {day:'Day 2: routing', items:['Load the road graph into memory', 'Dijkstra and A*, and count the settled nodes', 'Add turn restrictions and one-way streets']},
    {day:'Day 3: traffic', items:['Simulate speed reports into a stream', 'Aggregate per segment per minute', 'Route with live weights, and compare ETAs']}],
   pseudocode:{lang:'ts', code:`function aStar(graph: Graph, s: Node, t: Node, weight: (e: Edge) => number) {
  const g = new Map([[s, 0]]), open = new MinHeap<[number, Node]>([[h(s, t), s]]);
  while (open.size) {
    const [, u] = open.pop();
    if (u === t) return g.get(t);
    for (const e of graph.out(u)) {
      const nd = g.get(u)! + weight(e);                         // live or predicted travel time
      if (nd < (g.get(e.to) ?? Infinity)) { g.set(e.to, nd); open.push([nd + h(e.to, t), e.to]); }
    }
  }
}
const h = (a: Node, b: Node) => haversineKm(a, b) / MAX_SPEED_KMH * 60;   // never overestimates`},
   loadTest:'<p>Load a city graph, issue 1,000 random route requests per second, and measure p99 latency and settled nodes for Dijkstra, A* and (if you implement it) contraction hierarchies. Then update 5% of edge weights every minute and measure how stale results get.</p>'},
  twists:[{q:'Why does A* still return the exact shortest route?', a:'Its estimate never over-guesses the remaining time (it uses the straight-line distance at the top speed). With such an estimate, the first time the destination is reached, its distance is the best possible.'}, {q:'How would you serve tiles for a map that changes (new roads)?', a:'Give tiles a version for each map release and put it in the URL, so caches never mix versions. Rebuild only the tiles whose area changed. Publish the new version once it is complete.'}, {q:'How do you avoid tracking individuals while using phone speeds?', a:'Combine the data. Report a speed only for segments with enough phones, remove identifiers, drop the start and end of each trip, and add a little noise. Keep only statistics for each segment, never the paths.'}, {q:'A road closes suddenly. How fast should routes change?', a:'Send the closure as a live event that sets the edge weight to “blocked” in the routing service within seconds. Do not wait for the tile rebuild, because the tiles only draw the road. Reroute active trips that use that segment, and send them a new route.'}],
  real:[
    {co:'Google Maps ETAs', tier:'confirmed', text:'Google Maps and DeepMind improved ETA accuracy using graph neural networks over road segments (“supersegments”).', src:'DeepMind Blog, “Traffic prediction with advanced Graph Neural Networks” (2020)'},
    {co:'Google S2', tier:'confirmed', text:'Google open-sourced the S2 geometry library, which maps the sphere onto a hierarchy of cells used for spatial indexing.', src:'S2 Geometry library documentation'},
    {co:'Contraction hierarchies', tier:'confirmed', text:'Contraction hierarchies preprocess a road graph with shortcuts so that shortest-path queries on continental networks take milliseconds.', src:'Geisberger, Sanders, Schultes & Delling, “Contraction Hierarchies” (WEA 2008)'},
    {co:'Google’s tile and routing internals', tier:'inference', text:'Google’s production tile pipeline and routing engine are not public. Vector tiles, in-memory graphs and preprocessing are the standard published techniques shown here.', src:'This case study'},
    {co:'Routing simulator', tier:'educational', text:'The grid city, speeds and river are synthetic.', src:'This case study’s model'}],
  sources:['DeepMind Blog: Traffic prediction with advanced Graph Neural Networks (2020)', 'Google: S2 Geometry library documentation', 'Geisberger et al.: Contraction Hierarchies: Faster and Simpler Hierarchical Routing in Road Networks (2008)', 'Hart, Nilsson & Raphael: A Formal Basis for the Heuristic Determination of Minimum Cost Paths (1968)', 'Mapbox: Vector Tile Specification']
});

/* ======================= ZOOM / GOOGLE MEET ======================= */
SDA.register({kind:'case', id:'zoom', tier:'standard', icon:'🎥', title:'Zoom / Google Meet (video calls)', tagline:'Real-time media at 150 ms: SFUs, simulcast, cascading and firewall traversal.', tags:['video', 'webrtc', 'sfu', 'simulcast', 'udp', 'turn', 'latency', 'recording'],
  modules:['realtime', 'networking', 'reliability', 'traffic'],
  summary:'A video call must carry audio and video between cities in about 150 ms, on networks that lose packets and change speed all the time. The key idea is the media server layout: an SFU forwards streams so large meetings scale.',
  accuracy:'Zoom has published its figure of 300M daily meeting participants (2020), its end-to-end encryption design, and the fact that meetings run through its own multimedia routers in its data centers. These facts are marked confirmed. Google Meet is built on WebRTC, which Google created. The exact internal layouts are inference. The bandwidth maths is exact, with illustrative bitrates.',
  overview:{what:'<b>A small example.</b> Twelve people from Pune, Bengaluru and New York join a 9 am stand-up. Everyone sees the speaker in HD and the others as small thumbnails. The audio stays in sync, even for the person on a train.', in:['Signalling (join, leave, mute)', 'Media routing: mesh, SFU, MCU', 'Simulcast and active-speaker selection', 'Global media server placement and cascading', 'Firewall traversal (STUN/TURN)', 'Recording'], out:['Chat and whiteboards', 'Webinars with 10,000+ view-only attendees (streaming)', 'Codec internals', 'Calendar integration']},
  challenges:['The delay budget is about 150 ms one way, so a retransmitted packet often arrives too late', 'Bandwidth: n people sending to n−1 others grows as n²', 'Receivers differ: a fibre laptop and a 4G phone are in the same call', 'Company firewalls that block UDP', 'People in one meeting can be on different continents'],
  fr:['Create and join meetings with a link', 'Two-way audio and video with mute and camera controls', 'Gallery and speaker views', 'Screen sharing', 'Record meetings'],
  nfr:['A delay from mouth to ear under about 150 to 200 ms where possible', 'Quality drops slowly instead of freezing', 'Media is encrypted in transit (end-to-end is optional)', 'A meeting survives a media server failure with a brief glitch', 'Cost: forwarding is cheap, but re-encoding is expensive'],
  scale:[{k:'Daily meeting participants (Zoom, April 2020)', v:'300M', math:'From the Zoom blog: these are participants, not unique users. 300M ÷ 86,400 s ≈ 3,500 joining every second on average', tag:'public'}, {k:'Bandwidth for one HD stream', v:'≈ 1.5 to 3 Mbps', math:'A typical 720p video stream. Say 2.5 Mbps', tag:'illustrative'}, {k:'SFU traffic out for one 12-person call', v:'≈ 330 Mbps', math:'12 senders × 11 receivers × 2.5 Mbps = 330 Mbps, without simulcast', tag:'illustrative'}, {k:'Concurrent meetings at peak', v:'≈ 5M', math:'Say 5M meetings × 6 people each = 30M people in calls at once', tag:'illustrative'}],
  arch:{w:860, h:390, minW:640, nodes:[
    {id:'a', type:'client', label:'Alice (Pune)', x:70, y:110, w:120},
    {id:'b', type:'client', label:'Bob (New York)', x:70, y:280, w:124},
    {id:'sfu', type:'service', label:'SFU (Mumbai)', sub:'forwards streams', x:430, y:55, w:150, stage:1},
    {id:'turn', type:'service', label:'TURN relay', sub:'TCP/TLS 443', x:240, y:195, w:120, stage:4},
    {id:'app', type:'service', label:'Meeting server', sub:'web + media relay', x:430, y:195, w:140},
    {id:'db', type:'db', label:'Meetings DB', sub:'rooms, users', x:430, y:335, w:150},
    {id:'sfu2', type:'service', label:'SFU (Virginia)', sub:'cascade', x:240, y:335, w:150, stage:3},
    {id:'rec', type:'service', label:'Recorder', sub:'joins as a bot', x:660, y:195, w:140, stage:5},
    {id:'store', type:'db', label:'Recordings', sub:'object storage', x:660, y:335, w:150, stage:5}],
   edges:[{from:'a', to:'app'}, {from:'b', to:'app'}, {from:'app', to:'db'},
     {from:'a', to:'sfu', stage:1}, {from:'b', to:'sfu', stage:1, gone:3}, {from:'app', to:'sfu', stage:1},
     {from:'b', to:'sfu2', stage:3}, {from:'sfu', to:'sfu2', stage:3},
     {from:'b', to:'turn', stage:4}, {from:'turn', to:'sfu', stage:4},
     {from:'app', to:'rec', stage:5}, {from:'sfu', to:'rec', stage:5}, {from:'rec', to:'store', stage:5}]},
  evolution:[
    {title:'One server + one database', scale:'a few calls', fix:'<p>One web server handles sign-in and meeting rooms (kept in a database). It also relays everyone’s media: each person sends one stream up and receives the others down through the same box.</p>', after:{lat:180, err:.3, load:30}},
    {title:'Media through the web server melts it', scale:'10K calls', hot:['app'], breaks:'<p>Video is hundreds of Mbps for one busy call. Mixing it with web traffic on TCP servers adds delay and head-of-line blocking, and one big meeting slows sign-in for everyone.</p>', fix:'<p>Split <b>signalling</b> from <b>media</b>. Signalling means join, mute and who is speaking: small messages over a WebSocket. Media goes over UDP (RTP and SRTP) to dedicated <b>SFU</b> servers.</p><p>An SFU forwards each sender’s packets to every receiver without decoding them, so one server handles many calls.</p>', sub:{app:'signalling only'}, before:{lat:900, err:3, load:200}, after:{lat:160, err:.3, load:55}, flow:[['a', 'app', 'join (WebSocket)'], ['app', 'sfu', 'allocate room'], ['a', 'sfu', 'media (UDP)'], ['b', 'sfu', 'media (UDP)']], lesson:['tcp-vs-udp', 'webrtc']},
    {title:'Twelve HD videos per person', scale:'large meetings', hot:['sfu'], breaks:'<p>In a 12-person call, each receiver downloads 11 HD streams (about 27 Mbps), which a 4G phone cannot take. The slowest receiver forces everyone down to its quality.</p>', fix:'<p>Use <b>simulcast</b>: each sender encodes a high and a low layer. For each receiver, the SFU forwards the high layer only for the active speaker (or a pinned video) and low layers for thumbnails. It decides from each receiver’s measured bandwidth.</p><p>When bandwidth drops, audio is protected before video.</p>', sub:{sfu:'simulcast · speaker'}, before:{lat:600, err:4, load:150}, after:{lat:170, err:.4, load:60}, flow:[['a', 'sfu', 'high + low layers'], ['sfu', 'b', 'speaker HD, others low']], lesson:['live-streaming-abr', 'webrtc']},
    {title:'Pune to New York via Mumbai: lag', scale:'global teams', hot:['sfu'], breaks:'<p>Bob in New York sends his media to a Mumbai SFU and back. That is a round trip of 250 ms or more, and the talk feels choppy.</p>', fix:'<p>Run SFUs in many regions. Each person connects to the nearest one, and the SFUs <b>cascade</b> streams between regions over good backbone links, so each stream crosses the ocean only once.</p>', before:{lat:450, err:1, load:70}, after:{lat:190, err:.3, load:60}, flow:[['b', 'sfu2', 'nearest SFU'], ['sfu', 'sfu2', 'cascade once']], lesson:['geodns-anycast', 'multi-az-region']},
    {title:'Corporate firewalls block UDP', scale:'enterprise users', hot:['b'], breaks:'<p>Many office networks allow only HTTPS on port 443. UDP media is blocked and the call never connects.</p>', fix:'<p>Use ICE: try direct UDP first, then addresses found with STUN, and finally a <b>TURN relay</b> that carries the media over TCP and TLS on port 443.</p><p>The relay adds delay and costs bandwidth, so it is the last resort.</p>', before:{lat:900, err:8, load:40}, after:{lat:220, err:.3, load:45}, flow:[['b', 'turn', 'TLS 443'], ['turn', 'sfu']], lesson:['https-tls', 'proxies-gateway-bff']},
    {title:'People want recordings and transcripts', scale:'millions of meetings/day', hot:['sfu'], breaks:'<p>Recording on the host’s laptop fails if the laptop disconnects. Mixing on the SFU would force it to decode everything.</p>', fix:'<p>A <b>recorder</b> joins as a hidden participant. It receives the streams from the SFU, builds the layout, encodes once and writes to <b>object storage</b>. Transcription runs afterwards, in the background.</p>', before:{lat:200, err:2, load:90}, after:{lat:180, err:.2, load:60}, flow:[['app', 'rec', 'start recording'], ['sfu', 'rec', 'streams'], ['rec', 'store', 'mp4']], lesson:['transcoding-pipeline', 'storage-types']}],
  flows:[
    {name:'Join a meeting', steps:[
      {note:'Alice joins through the meeting server (signalling) and is given the nearest SFU.', flow:[['a', 'app', 'join room 842'], ['app', 'db', 'room, permissions'], ['app', 'sfu', 'allocate']]},
      {note:'Media flows over UDP to the SFU. Bob uses the New York SFU, and the two SFUs cascade.', flow:[['a', 'sfu', 'audio + simulcast video'], ['b', 'sfu2'], ['sfu', 'sfu2', 'cascade']]}]},
    {name:'Behind a strict firewall', steps:[
      {note:'Direct UDP fails, so ICE falls back to a TURN relay over TLS on port 443.', flow:[['b', 'turn', 'TLS 443'], ['turn', 'sfu', 'media']]}]},
    {name:'Record the meeting', steps:[
      {note:'The host starts recording. A recorder bot joins the SFU like a participant.', flow:[['app', 'rec', 'start'], ['sfu', 'rec', 'streams']]},
      {note:'It composes and encodes once, then uploads the file.', flow:[['rec', 'store', 'upload mp4']]}]}],
  breakIt:[
    {label:'An SFU crashes', kill:['sfu'], verdict:'degrades', text:'Clients notice the lost media within a second or two and reconnect, because signalling gives them another SFU. There is a brief freeze, then the call continues.'},
    {label:'Cascade link congested', hot:['sfu2'], verdict:'degrades', text:'Cross-region participants get lower layers, and audio is protected first.'},
    {label:'Meeting server (signalling) down', kill:['app'], verdict:'degrades', text:'Ongoing calls keep their media flowing. New joins, mute and chat stop until it recovers.'},
    {label:'Recorder fails mid-meeting', kill:['rec'], verdict:'degrades', text:'The meeting is not affected. A new recorder rejoins, so the recording has a gap. For important meetings a second recorder runs in parallel.'}],
  dataModel:{lang:'sql', title:'meetings (signalling state only, media is never stored here)', code:`CREATE TABLE meetings (meeting_id BIGINT PRIMARY KEY, host_id BIGINT, passcode_hash TEXT, settings JSONB, created_at TIMESTAMP);
CREATE TABLE participants (meeting_id BIGINT, user_id BIGINT, sfu_id TEXT, joined_at TIMESTAMP, left_at TIMESTAMP, PRIMARY KEY (meeting_id, user_id, joined_at));
-- In memory on the SFU: room → senders → layers, receivers → chosen layer per sender, bandwidth estimates`, notes:'Media state (which layer each receiver gets) changes many times a second and lives only in the SFU’s memory.'},
  apis:[
    {m:'WS', path:'signalling: join', req:'{ "type": "join", "meeting": 842, "sdp_offer": "…" }', res:'{ "type": "joined", "sfu": "mum-17", "sdp_answer": "…", "participants": 11 }'},
    {m:'WS', path:'signalling: layer request', note:'Receiver tells the SFU which quality it wants per sender.', req:'{ "type": "subscribe", "sender": "alice", "layer": "high" }'},
    {m:'POST', path:'/v1/meetings/{id}/recordings', res:'{ "recording_id": "r_31", "status": "starting" }'}],
  algorithm:{title:'Mesh vs SFU vs MCU bandwidth', html:'<p>With n participants, a <b>mesh</b> makes each person upload n−1 copies. An <b>SFU</b> takes one upload from each person and forwards the copies, so the server’s outgoing traffic grows as n².</p><p><b>Simulcast</b> shrinks downloads by sending low-quality layers for thumbnails. An <b>MCU</b> mixes everything into one stream for each receiver, but it must decode and re-encode, which costs a lot and adds delay.</p>', mount:confSim},
  tradeoffs:[['An SFU instead of an MCU', 'Cheap forwarding, low delay and quality for each receiver', 'The server’s outgoing traffic grows with n², and clients decode several streams'], ['UDP for media', 'No head-of-line blocking, and late packets are skipped', 'You must handle loss (FEC and concealment) and firewalls'], ['Simulcast', 'Each receiver gets what it can handle', 'Senders encode two or three layers, which uses CPU'], ['Regional SFUs that cascade', 'Low delay for global meetings', 'Routing and failure handling are more complex']],
  alternatives:[['Peer-to-peer mesh', 'Ideal for 1:1 calls (lowest delay and no server media cost), but it breaks down beyond 3 or 4 people'], ['MCU mixing', 'Good for very weak clients or phone bridges, but it is costly and slower'], ['Live streaming (HLS) for webinars', 'Scales to huge view-only audiences, but adds seconds of delay']],
  failures:[['SFU', 'Client reconnects to another SFU'], ['Cascade link', 'Lower layers, and audio first'], ['Signalling', 'Media continues, and controls pause'], ['Recorder', 'Rejoin or redundant recorder']],
  lab:{stack:['A WebRTC SFU (mediasoup, LiveKit or Janus)', 'Node.js signalling over WebSocket', 'coturn (TURN)', 'Postgres', 'Chrome with network throttling'], milestones:[
    {day:'Day 1: 1:1', items:['Peer-to-peer WebRTC call with a signalling server', 'Add STUN, then force TURN over TCP 443', 'Measure latency and bitrate in chrome://webrtc-internals']},
    {day:'Day 2: SFU', items:['Route a 6-person call through an SFU', 'Enable simulcast, and pin a speaker', 'Throttle one receiver to 1 Mbps and watch layer switching']},
    {day:'Day 3: scale & record', items:['Two SFUs in different regions with piping between them', 'A headless recorder that joins and writes WebM', 'Kill an SFU mid-call and measure reconnection time']}],
   pseudocode:{lang:'ts', code:`// SFU: forward packets, choosing a layer per receiver (no decoding)
onRtpPacket(sender, pkt) {
  for (const rx of room.receiversOf(sender)) {
    const want = rx.isPinnedOrSpeaker(sender) ? 'high' : 'low';
    const layer = rx.bandwidthEstimate < LAYER_BPS[want] ? downgrade(want) : want;
    if (pkt.layer === layer) rx.send(rewriteSeq(pkt, rx));   // keep sequence numbers continuous
  }
}`},
   loadTest:'<p>Run 50 headless clients in 5 rooms through one SFU. Measure SFU CPU and egress, end-to-end latency (timestamp overlay) and freeze counts while throttling some clients. Then add simulcast and compare egress.</p>'},
  twists:[{q:'Why not use TCP for media to avoid packet loss?', a:'With TCP, one lost packet blocks all later data until it is resent, so a 200 ms resend becomes a 200 ms freeze. For live media it is better to skip late packets and hide the loss with FEC, loss concealment and keyframe requests.'}, {q:'How does the SFU find the active speaker without decoding audio?', a:'Senders add an audio-level header to each RTP packet (RFC 6464). The SFU tracks those levels and gives the high layer to whoever is loudest over a short window. It adds a delay before switching, so the choice does not flap.'}, {q:'How can a call be end-to-end encrypted if it goes through an SFU?', a:'Encrypt each media frame end to end with keys the server does not have (insertable streams or SFrame). The SFU can still read the unencrypted RTP headers it needs to route and pick layers. Zoom described adding E2EE this way in 2020.'}, {q:'A meeting grows from 12 to 1,000 people. What changes?', a:'Most of them only watch, so do not make everyone a sender. Let a few speakers send media, and give the rest low layers or a live stream (HLS) with a few seconds of delay. Cascade SFUs so each region holds a share of the viewers.'}],
  real:[
    {co:'Zoom scale', tier:'confirmed', text:'Zoom reported 300 million daily meeting participants in April 2020 (and clarified that this counts participants, not unique users).', src:'Zoom blog, “90-Day Security Plan Progress Report: April 22” (2020)'},
    {co:'Zoom architecture', tier:'confirmed', text:'Zoom meetings route through Zoom’s multimedia routers in its data centres, and Zoom launched optional end-to-end encrypted meetings in October 2020.', src:'Zoom security white paper, Zoom blog on end-to-end encryption (2020)'},
    {co:'WebRTC', tier:'confirmed', text:'WebRTC is an open standard (originating at Google) for real-time media in browsers. It uses ICE, STUN and TURN for connectivity and SRTP for media. Google Meet runs on it in the browser.', src:'W3C and IETF WebRTC specifications, RFC 8445 (ICE)'},
    {co:'Simulcast and audio levels', tier:'confirmed', text:'Simulcast and the RTP audio-level header extension are standardised and used by SFUs to choose layers and active speakers.', src:'RFC 8853 (simulcast), RFC 6464 (audio levels)'},
    {co:'Exact topologies', tier:'inference', text:'How Zoom and Meet place and cascade servers internally is not fully public. The regional SFU design is a reasonable inference.', src:'This case study'},
    {co:'Bandwidth model', tier:'educational', text:'Exact arithmetic with illustrative bitrates.', src:'This case study’s model'}],
  sources:['Zoom: Security white paper, end-to-end encryption announcement (2020)', 'Zoom blog: 90-Day Security Plan Progress Report (April 2020)', 'IETF: RFC 8445 (ICE), RFC 8656 (TURN), RFC 8853 (simulcast), RFC 6464 (audio levels)', 'W3C: WebRTC 1.0: Real-Time Communication Between Browsers']
});

/* ======================= HOTSTAR IPL LIVE ======================= */
SDA.register({kind:'case', id:'hotstar', tier:'standard', icon:'🏏', title:'Hotstar IPL live (massive live streaming)', tagline:'25 million fans at once, and they all reopen the app when the innings ends.', tags:['live streaming', 'cdn', 'hls', 'origin shield', 'pre-scaling', 'graceful degradation', 'concurrency'],
  modules:['realtime', 'traffic', 'reliability', 'caching'],
  summary:'Live cricket is the extreme case for video: tens of millions watch one stream at the same moment. The video is a CDN problem, and the harder part is the API tier, where logins arrive in synchronised waves.',
  accuracy:'Disney+ Hotstar’s record of 25.3M concurrent viewers (2019) and the later records reported by JioCinema are public. Hotstar engineers have said in public talks that they scale up before an event for the expected viewers and switch off non-essential features under load. These are marked confirmed as talk content. The exact internal design is inference, and the numbers are illustrative unless marked.',
  overview:{what:'<b>A small example.</b> Dhoni walks out to bat in the final over. Within a minute, millions more people open the app and sign in. The stream starts in seconds, at a quality their 4G connection can keep up with.', in:['Live encoding and packaging (HLS/DASH, ABR ladder)', 'Multi-CDN delivery with origin shielding', 'API tier: login, entitlements, playback tokens', 'Capacity planning for concurrency spikes', 'Graceful degradation (“panic mode”)'], out:['Ad insertion in depth', 'Live chat and social features', 'Video-on-demand catalogue', 'Payments and subscriptions in depth']},
  challenges:['Tens of millions of viewers on one live event', 'Jumps of millions within a minute (toss, wickets, innings breaks)', 'Autoscaling reacts in minutes, but spikes arrive in seconds', 'Every new segment is published to every edge at the same moment', 'Most viewers are on mobile, on changing 4G'],
  fr:['Watch the live match with low delay', 'Pick quality or let ABR decide', 'Sign in and verify the subscription', 'Scorecard and key moments', 'Rewind within the live window'],
  nfr:['Playback starts in a few seconds, and rebuffering is rare', 'Never let the API tier take down playback', 'Glass-to-glass delay of tens of seconds at most (illustrative)', 'Survive a CDN or origin failure mid-match', 'Cost-efficient: don’t pay for peak capacity all season'],
  scale:[{k:'Concurrent viewers record (2019)', v:'25.3M', math:'Disney+ Hotstar, India vs New Zealand World Cup semi-final (July 2019). Published by Hotstar: 25,300,000 viewers at once', tag:'public'}, {k:'Video traffic out at 25M viewers', v:'≈ 37 Tbps', math:'25M viewers × about 1.5 Mbps on average = 37.5 million Mbps ≈ 37 Tbps', tag:'illustrative'}, {k:'Segment requests', v:'≈ 6M a second', math:'25M viewers ÷ 4 s for each segment ≈ 6.25M a second', tag:'illustrative'}, {k:'App opens after an innings break', v:'≈ 80K a second', math:'40% of 25M viewers = 10M, opening within 2 minutes (120 s): 10M ÷ 120 ≈ 83,000 a second', tag:'illustrative'}],
  arch:{w:920, h:390, minW:640, nodes:[
    {id:'v', type:'client', label:'Viewers', x:70, y:195, w:110},
    {id:'cdn', type:'cdn', label:'CDN edges', sub:'multi-CDN', x:240, y:55, w:130, stage:1},
    {id:'lb', type:'lb', label:'API gateway', x:240, y:195, w:130, stage:2},
    {id:'shield', type:'cdn', label:'Origin shield', sub:'coalesces misses', x:430, y:55, w:150, stage:3},
    {id:'app', type:'service', label:'API', sub:'one server', x:430, y:195, w:140},
    {id:'db', type:'db', label:'Users DB', sub:'subscriptions', x:430, y:335, w:140},
    {id:'origin', type:'service', label:'Packager', sub:'HLS/DASH ladder', x:640, y:55, w:150, stage:1},
    {id:'cache', type:'cache', label:'Session cache', sub:'tokens, entitlements', x:640, y:195, w:160, stage:4},
    {id:'enc', type:'service', label:'Live encoder', sub:'stadium feed', x:840, y:55, w:130, stage:1}],
   edges:[{from:'v', to:'app', gone:2}, {from:'app', to:'db'},
     {from:'v', to:'cdn', stage:1}, {from:'cdn', to:'origin', stage:1, gone:3}, {from:'enc', to:'origin', stage:1},
     {from:'v', to:'lb', stage:2}, {from:'lb', to:'app', stage:2},
     {from:'cdn', to:'shield', stage:3}, {from:'shield', to:'origin', stage:3},
     {from:'app', to:'cache', stage:4}]},
  evolution:[
    {title:'One server + one database', scale:'10K viewers', fix:'<p>One server checks logins in a database and streams one video file over HTTP. This is fine for a small test stream.</p>', after:{lat:400, err:.3, load:30}},
    {title:'One server can’t push video to 100K viewers', scale:'100K viewers', hot:['app'], breaks:'<p>100K viewers × 2 Mbps = 200 Gbps from one server, which is impossible. Mobile viewers on weak 4G cannot keep up with one bitrate and keep buffering.</p>', fix:'<p>A <b>live encoder</b> makes an <b>ABR ladder</b> (several bitrates). A <b>packager</b> cuts it into HLS or DASH segments of a few seconds. <b>CDN edges</b> serve the segments, and players switch bitrate from segment to segment.</p>', sub:{app:'API only'}, before:{lat:8000, err:15, load:400}, after:{lat:400, err:.3, load:50}, flow:[['enc', 'origin', 'feed'], ['cdn', 'origin', 'segment'], ['v', 'cdn', 'segment (ABR)']], lesson:['live-streaming-abr', 'cdn']},
    {title:'The toss: 10M open the app in minutes', scale:'10M viewers', hot:['app', 'db'], breaks:'<p>Logins and “start playback” calls jump 20 times in a few minutes. Autoscaling notices only after CPU rises, then needs minutes to boot servers. By then the API has failed and every client retries.</p>', fix:'<p>Put stateless API servers behind a <b>gateway</b>, and <b>scale them up before the match</b> using the expected number of viewers (a step of capacity for every million viewers), not CPU. Clients retry with exponential backoff and jitter.</p>', before:{lat:6000, err:12, load:300}, after:{lat:350, err:.3, load:70}, flow:[['v', 'lb', 'POST /play'], ['lb', 'app']], lesson:['autoscaling', 'capacity-planning', 'timeouts-retries']},
    {title:'Every edge hammers the origin each new segment', scale:'200 edge locations', hot:['origin'], breaks:'<p>Every 4 s a new segment appears. Every edge location, and every server in it, asks for it at the same moment, for every bitrate. This is a synchronised stampede on the packager.</p>', fix:'<p>Add an <b>origin shield</b> tier between the edges and the origin. Edges fetch from a few shield locations, which <b>coalesce</b> identical requests into one fetch from the origin. The origin sees only a handful of requests for each segment and bitrate.</p>', before:{lat:2000, err:3, load:250}, after:{lat:300, err:.1, load:40}, flow:[['cdn', 'shield', 'segment 18421 (many edges)'], ['shield', 'origin', 'one fetch']], lesson:['cdn', 'cache-failure-modes']},
    {title:'Innings break: entitlement checks storm the DB', scale:'25M viewers', hot:['db'], breaks:'<p>When play resumes, millions reopen the app at once. Each open checks the session and subscription in the database, which falls over.</p>', fix:'<p>Cache sessions and subscriptions in a <b>session cache</b>. Issue short-lived <b>signed playback tokens</b> that CDN edges check themselves. Spread token refreshes with jitter so they do not line up.</p>', before:{lat:5000, err:10, load:350}, after:{lat:300, err:.2, load:70}, flow:[['app', 'cache', 'session + entitlement']], lesson:['cache-strategies', 'sessions-vs-jwt']},
    {title:'Bigger than planned: degrade, don’t die', scale:'record final', hot:['lb', 'app'], breaks:'<p>Viewers go past the forecast. Recommendations, personal rows and live comments compete with playback for the same capacity.</p>', fix:'<p>Use <b>graceful degradation</b> (“panic mode”). Switches turn off non-essential features (recommendations, comments, personal rows), serve static fallbacks from the CDN and cap the default bitrate. Login and playback stay alive.</p><p>Load shedding protects the core path.</p>', sub:{app:'panic-mode switches', cdn:'bitrate cap'}, before:{lat:4000, err:8, load:180}, after:{lat:450, err:.5, load:90}, flow:[['v', 'lb', 'GET /home (static fallback)'], ['v', 'cdn', 'segments']], lesson:['load-shedding', 'bulkhead-fallback', 'config-feature-flags']}],
  flows:[
    {name:'Start watching', steps:[
      {note:'The app asks for playback. The API checks the session in the cache and returns a signed playback token.', flow:[['v', 'lb', 'POST /play'], ['lb', 'app'], ['app', 'cache', 'entitlement ✓']]},
      {note:'The player fetches the manifest and segments from the nearest CDN edge.', flow:[['v', 'cdn', 'manifest + segment (token)']]},
      {note:'A miss at the edge goes to the shield, which combines it with the misses from other edges.', flow:[['cdn', 'shield', 'miss'], ['shield', 'origin', 'one fetch']]}]},
    {name:'A new segment is published', steps:[
      {note:'The encoder pushes the next chunk, and the packager publishes segment 18422 in every bitrate.', flow:[['enc', 'origin', 'live feed']]},
      {note:'Edges ask the shields for it, and each shield fetches it from the origin once.', flow:[['cdn', 'shield', '18422 × renditions'], ['shield', 'origin']]}]}],
  breakIt:[
    {label:'One CDN has an outage', kill:['cdn'], verdict:'degrades', text:'With several CDNs, the player or the token service steers viewers to another CDN. Those viewers see a brief rebuffer.'},
    {label:'Packager / origin fails', kill:['origin'], verdict:'degrades', text:'A spare packager in another zone takes over. Edges and shields keep serving the last segments while it switches.'},
    {label:'Session cache fails', kill:['cache'], verdict:'degrades', text:'Viewers who are already playing carry on, because the edge checks their tokens. New sessions hit the database, so shed non-essential APIs and make token lifetimes longer.'},
    {label:'API overload at innings break', hot:['app', 'lb'], verdict:'degrades', text:'Panic mode: turn off non-critical features, serve static home pages, and rate-limit with clients that retry after a random delay, so playback survives.'}],
  dataModel:{lang:'sql', title:'subscriptions and sessions (video never touches a database)', code:`CREATE TABLE subscriptions (user_id BIGINT PRIMARY KEY, plan TEXT, status TEXT, valid_until TIMESTAMP);
-- Session cache: session:{id} → {user_id, plan, device, exp}
-- Playback token (signed, ~10 min): {user, content_id, max_quality, exp, sig}
-- Packager output: /live/{event}/{rendition}/seg_{n}.m4s + manifest.m3u8 (sliding window)`, notes:'Segments are files that never change, named by number. Only the manifest changes, every few seconds.'},
  apis:[
    {m:'POST', path:'/v1/play', req:'{ "content": "ipl-2026-final", "device": "android" }', res:'{ "manifest": "https://cdn-b…/live/final/master.m3u8?token=…", "token_exp_s": 600 }'},
    {m:'GET', path:'/live/{event}/{rendition}/seg_18422.m4s?token=…', note:'Served by CDN edges, which verify the token signature locally.', res:'<4 s of video>'}],
  algorithm:{title:'Where the load really is', html:'<p>For live video, the traffic out is huge but even and cacheable. With a shield tier, the origin sees only a handful of requests for each segment.</p><p>The spikes that break systems come from many people acting at the same moment and hitting the API tier. The calculator puts numbers on each, and the autoscaling playground shows why reactive scaling is too slow for a toss or an innings break.</p>', mount:liveSim, pg:'autoscaling'},
  tradeoffs:[['Scale up before the event, using the forecast', 'Ready before the spike', 'You pay for capacity that may not be needed'], ['An origin shield with request coalescing', 'Origin load hardly depends on the audience size', 'One extra hop on a miss'], ['Signed tokens checked at the edge', 'No database call for each segment', 'A token can be revoked only when it expires'], ['Panic-mode feature switches', 'Playback survives extreme load', 'A worse experience, and it must be tested in advance']],
  alternatives:[['Reactive autoscaling only', 'Cheap, but minutes too slow for live spikes'], ['Single CDN', 'Simpler contracts, but one provider’s outage stops the match for everyone'], ['Low-latency WebRTC delivery', 'Sub-second delay, but much harder to scale to tens of millions than HTTP segments']],
  failures:[['CDN', 'Multi-CDN steering'], ['Packager', 'Redundant packager in another zone'], ['Session cache', 'Edge-checked tokens, and shed features'], ['API overload', 'Panic mode + jittered retries']],
  lab:{stack:['FFmpeg (live HLS ladder)', 'Nginx as edge + shield caches', 'Node.js API', 'Redis', 'k6'], milestones:[
    {day:'Day 1: live ladder', items:['Encode a looping video into a 3-rendition live HLS stream', 'Serve it through an Nginx cache, and play it in hls.js', 'Measure glass-to-glass delay']},
    {day:'Day 2: shield & tokens', items:['Two edge caches + one shield with proxy_cache_lock (coalescing)', 'Count origin requests per segment with and without the shield', 'Signed playback tokens checked at the edge']},
    {day:'Day 3: the spike', items:['k6: ramp app opens from 100/s to 5,000/s in 30 s', 'Compare reactive scaling vs pre-scaled capacity', 'Implement feature switches and show playback survives']}],
   pseudocode:{lang:'ts', code:`// Capacity ladder: pre-scale from forecast concurrency, not CPU
const LADDER = [ { viewers: 5e6, api: 300 }, { viewers: 10e6, api: 600 }, { viewers: 20e6, api: 1200 }, { viewers: 30e6, api: 1800 } ];
function desiredApiServers(forecastPeak: number) {
  const step = LADDER.find(s => s.viewers >= forecastPeak * 1.3) ?? LADDER[LADDER.length - 1];   // 30% headroom
  return step.api;
}
// Panic mode: shed non-critical features when the gateway sees overload
if (gateway.utilisation() > 0.85) flags.set({ recommendations: false, comments: false, homePage: 'static' });`},
   loadTest:'<p>Simulate 50K clients fetching segments through two edges and a shield, and count the origin requests per segment. Then simulate an innings break: 20% of clients call /play within 30 s. Compare error rates with reactive autoscaling vs pre-scaled capacity, with and without panic mode.</p>'},
  twists:[{q:'Why not autoscale on CPU like any other service?', a:'The spike is faster than the feedback loop. CPU rises only after requests arrive, servers take minutes to boot and warm up, and failed requests trigger retries that make it worse. For a scheduled event with a predictable shape, scale up ahead of time from the forecast of viewers, and keep reactive scaling as a backup.'}, {q:'How would you cut the delay of 20 to 30 s for live cricket?', a:'Use shorter segments, or low-latency HLS or DASH with partial segments and chunked transfer, and lower the player’s buffer target. The cost is more requests, less buffer against network hiccups, and more load on the edges.'}, {q:'A wicket falls and 3M people press back and replay the moment. What happens?', a:'The replay is inside the live window, so it is just older segments that edges already have. The API sees only the seek request. Make highlight clips for key moments ahead of time so they can be cached too.'}, {q:'The forecast said 20M viewers and 30M arrive. What do you do first?', a:'Switch on panic mode, so the core path stays alive. Cap the default bitrate to cut video traffic, shed non-essential API calls, and add API capacity in large steps. Tell clients to retry with jitter. Review the forecast model after the match.'}],
  real:[
    {co:'Disney+ Hotstar', tier:'confirmed', text:'Hotstar reported 25.3 million concurrent viewers during the India vs New Zealand World Cup semi-final in July 2019.', src:'Disney+ Hotstar announcement (2019)'},
    {co:'Hotstar scaling talks', tier:'confirmed', text:'Hotstar engineers have described in public talks why they pre-provision capacity for expected concurrency instead of relying on autoscaling, and how they switch off non-essential features under extreme load.', src:'Hotstar engineering talks on scaling for 25M concurrent viewers (2019)'},
    {co:'JioCinema', tier:'confirmed', text:'JioCinema reported over 3 crore (30M+) peak concurrent viewers during the 2023 IPL final.', src:'JioCinema / Viacom18 announcements (2023)'},
    {co:'Internal architecture', tier:'inference', text:'The specific multi-CDN, shield and token design is a common reference design for live streaming. The platforms’ exact internals are not described here.', src:'This case study'},
    {co:'Calculator', tier:'educational', text:'Exact arithmetic with illustrative inputs.', src:'This case study’s model'}],
  sources:['Disney+ Hotstar: concurrency record announcement (2019)', 'Hotstar engineering talks: scaling to 25M concurrent viewers (2019)', 'Apple: HTTP Live Streaming (RFC 8216) and Low-Latency HLS', 'AWS Architecture Blog: live streaming at scale with origin shield (CloudFront Origin Shield)']
});

/* ======================= SPOTIFY ======================= */
SDA.register({kind:'case', id:'spotify', tier:'standard', icon:'🎧', title:'Spotify (music streaming & recommendations)', tagline:'Small files, instant playback, and a personalised playlist for 600 million people every Monday.', tags:['audio streaming', 'cdn', 'prefetch', 'event pipeline', 'recommendations', 'collaborative filtering', 'search'],
  modules:['async', 'search', 'caching', 'architecture'],
  summary:'Music streaming is different from video: tracks are small, users skip all the time, and the magic is what to play next. The design is a CDN audio store with prefetching, an event pipeline, and recommendations computed in batch.',
  accuracy:'Spotify has published its early peer-to-peer delivery (a 2010 paper), its move to Google Cloud (2016), its event pipeline, its approach to Discover Weekly, and Backstage. These facts are marked confirmed. Current internals are inference, and the numbers are illustrative unless marked.',
  overview:{what:'<b>A small example.</b> Kabir taps play on Discover Weekly on Monday morning. The first song starts instantly and the next one is already downloaded. Every play and skip he makes is sent back to feed next week’s recommendations.', in:['Audio storage and delivery', 'Instant start and prefetching', 'Play/skip event collection', 'Batch recommendations (Discover Weekly style)', 'Search'], out:['Podcasts and video podcasts', 'Royalties and payouts', 'Social features', 'Ads in depth']},
  challenges:['Playback must start in a fraction of a second, even on mobile', 'Users skip tracks all the time', 'Billions of play events a day feed analytics, royalties and models', 'Personal recommendations for hundreds of millions of users', 'Search across a huge catalog in many languages'],
  fr:['Search and play any track', 'Playlists, library and offline downloads', 'Personalised playlists and radio', 'Continue on another device', 'Accurate play counts for artists'],
  nfr:['Time to first audio under a few hundred ms (illustrative)', 'No dropped play events (they drive royalties)', 'Recommendations refreshed weekly or daily, cheaply', 'Works offline for downloaded music', 'Cost-efficient delivery of small files'],
  scale:[{k:'Monthly active users', v:'600M+', math:'From Spotify’s quarterly reports (2024)', tag:'public'}, {k:'Track size at 160 kbps', v:'≈ 4 MB', math:'3.5 min × 60 s = 210 s. 210 s × 160 kbps ÷ 8 = 4,200 KB ≈ 4 MB', tag:'illustrative'}, {k:'Play events a day', v:'≈ 10B', math:'600M users × about 15 events (plays, skips, seeks) = 9B', tag:'illustrative'}, {k:'Discover Weekly playlists a week', v:'≈ 600M', math:'One for each active user, made in batch: 600M users × 1 playlist', tag:'illustrative'}],
  arch:{w:930, h:390, minW:640, nodes:[
    {id:'user', type:'client', label:'Spotify app', x:70, y:195, w:116},
    {id:'cdn', type:'cdn', label:'Audio CDN', sub:'Ogg/AAC files', x:240, y:55, w:130, stage:1},
    {id:'lb', type:'lb', label:'Gateway', x:240, y:195, w:120, stage:2},
    {id:'blob', type:'db', label:'Audio storage', sub:'several bitrates', x:430, y:55, w:150, stage:1},
    {id:'app', type:'service', label:'Backend', sub:'one server', x:430, y:195, w:140},
    {id:'db', type:'db', label:'Catalog DB', sub:'tracks, playlists', x:430, y:335, w:150},
    {id:'recs', type:'cache', label:'Recommendations', sub:'precomputed', x:640, y:55, w:160, stage:4},
    {id:'events', type:'queue', label:'Event delivery', sub:'Pub/Sub', x:640, y:195, w:150, stage:3},
    {id:'search', type:'service', label:'Search', sub:'multilingual index', x:640, y:335, w:150, stage:5},
    {id:'batch', type:'service', label:'Batch jobs', sub:'CF + audio + NLP', x:840, y:195, w:140, stage:4}],
   edges:[{from:'user', to:'app', gone:2}, {from:'app', to:'db'},
     {from:'user', to:'cdn', stage:1}, {from:'cdn', to:'blob', stage:1},
     {from:'user', to:'lb', stage:2}, {from:'lb', to:'app', stage:2},
     {from:'app', to:'events', stage:3},
     {from:'events', to:'batch', stage:4}, {from:'batch', to:'recs', stage:4}, {from:'app', to:'recs', stage:4},
     {from:'app', to:'search', stage:5}, {from:'db', to:'search', stage:5, dashed:true}]},
  evolution:[
    {title:'One server + one database', scale:'10K users', fix:'<p>One server streams MP3 files from its disk and serves the catalog from a database. Every play starts a download from that server.</p>', after:{lat:600, err:.3, load:30}},
    {title:'Playback is slow and bandwidth is costly', scale:'1M users', hot:['app'], breaks:'<p>Audio traffic fills the server, and users far away wait seconds for the first note. Skipping makes it worse.</p>', fix:'<p>Encode each track at several bitrates (Ogg Vorbis or AAC), store them in object storage and serve them through a <b>CDN</b>. The client fetches the first seconds at a lower bitrate and <b>prefetches</b> the next track while the current one plays.</p><p>Early Spotify also used peer-to-peer delivery between clients. It was retired in 2014.</p>', sub:{app:'API only'}, before:{lat:3000, err:2, load:180}, after:{lat:250, err:.1, load:40}, flow:[['user', 'cdn', 'track chunks'], ['cdn', 'blob', 'miss']], lesson:['cdn', 'cache-layers']},
    {title:'One backend for every feature', scale:'50M users', hot:['app', 'db'], breaks:'<p>Playlists, search, social and payments share one codebase and one database. Teams block each other and the database is overloaded.</p>', fix:'<p>Put a <b>gateway</b> in front of services that independent teams own (Spotify calls them “squads”), each with its own storage. The catalog and playlists move to data stores that scale out (Spotify used Cassandra a lot).</p>', sub:{db:'per-service stores'}, before:{lat:1500, err:2, load:160}, after:{lat:250, err:.1, load:55}, flow:[['user', 'lb', 'GET /playlist'], ['lb', 'app']], lesson:['monolith-to-microservices', 'ddd-bounded-contexts']},
    {title:'Billions of play events a day', scale:'100M users', hot:['db'], breaks:'<p>Writing every play and skip into the main database overloads it. Royalties, charts and analytics all need the same events, and they must not lose any.</p>', fix:'<p>Build an <b>event delivery</b> pipeline. Clients and services publish events to a durable log (Spotify moved its event delivery to Google Cloud Pub/Sub in 2016). Consumers write them to storage for analytics, royalties and model training.</p><p>No event is lost, and the main database is not involved.</p>', before:{lat:900, err:1.5, load:180}, after:{lat:250, err:.05, load:55}, flow:[['app', 'events', 'play, skip, seek']], lesson:['event-driven', 'kafka', 'delivery-semantics']},
    {title:'What should I listen to next?', scale:'600M users', hot:['app'], breaks:'<p>Users stay with the same few songs. Generic charts do not help anyone find new music they will love.</p>', fix:'<p><b>Batch jobs</b> over the play history work out how similar tracks are, using <b>collaborative filtering</b> (people who play X also play Y). They mix this with audio and text models and make a personal playlist for each user every week (Discover Weekly, 2015).</p><p>The results are <b>precomputed</b> and served from a fast store. Try the collaborative-filtering demo in Deep dives.</p>', before:{lat:300, err:.8, load:70}, after:{lat:250, err:.1, load:60}, flow:[['events', 'batch', 'a week of plays'], ['batch', 'recs', 'playlist per user'], ['app', 'recs', 'my Discover Weekly']], lesson:['recommendations', 'batch-vs-stream']},
    {title:'Search across 100M tracks in every language', scale:'global catalogue', hot:['db'], breaks:'<p>SQL search cannot handle typos, writing in another script (“tum hi ho” and “तुम ही हो”), or ranking for each person.</p>', fix:'<p>A <b>search service</b> uses an inverted index with typo tolerance and transliteration. It ranks by popularity and by the user’s taste, and the index is updated when the catalog changes.</p>', before:{lat:2000, err:1, load:130}, after:{lat:150, err:.05, load:50}, flow:[['app', 'search', 'q=tum hi ho'], ['db', 'search', 'catalogue updates']], lesson:['inverted-index', 'elasticsearch']}],
  flows:[
    {name:'Press play', steps:[
      {note:'The app asks the backend where the track’s file is, and for a short-lived token.', flow:[['user', 'lb', 'play track 7xQ…'], ['lb', 'app']]},
      {note:'Audio comes from the nearest CDN edge, and the next track is prefetched during playback.', flow:[['user', 'cdn', 'first chunk (low bitrate)'], ['user', 'cdn', 'prefetch next track']]},
      {note:'The play event is published for royalties, charts and recommendations.', flow:[['app', 'events', 'play event']]}]},
    {name:'Monday playlist', steps:[
      {note:'A weekly batch job reads the week’s plays and computes recommendations.', flow:[['events', 'batch', 'plays → similarities']]},
      {note:'Each user’s playlist is written to a serving store, so the app reads one key.', flow:[['batch', 'recs', '600M playlists'], ['app', 'recs', 'get mine']]}]}],
  breakIt:[
    {label:'Recommendation store down', kill:['recs'], verdict:'degrades', text:'Show last week’s cached playlist or popular playlists. Playback is not affected.'},
    {label:'Event pipeline backlog', hot:['events'], verdict:'survives', text:'Events are durable and arrive late, and royalties and charts catch up. Clients also keep events while offline.'},
    {label:'CDN edge outage', kill:['cdn'], verdict:'degrades', text:'Clients switch to another CDN or edge, and downloaded and prefetched tracks keep playing.'},
    {label:'Search down', kill:['search'], verdict:'degrades', text:'Library, playlists and recommendations still work, and search shows recent searches.'}],
  dataModel:{lang:'sql', title:'catalogue, playlists, events', code:`-- tracks(track_id, title, artist_ids[], duration_ms, files {ogg_96, ogg_160, ogg_320, aac_…})
-- playlists(playlist_id, owner_id, name) ; playlist_tracks(playlist_id, position, track_id, added_at)
-- play events (log, not a table): {user_id, track_id, ms_played, reason_end: 'skip'|'trackdone', context, ts}
-- recs serving store: recs:{user_id}:discover_weekly → [track_id × 30], generated weekly`, notes:'Playback and recommendations are kept apart by precomputing: the live path only reads a list.'},
  apis:[
    {m:'GET', path:'/v1/tracks/{id}/stream', res:'{ "cdn_urls": ["https://audio-fa…/…ogg?token=…"], "bitrate": 160 }'},
    {m:'POST', path:'/v1/events', note:'Sent in batches. Clients keep events while offline.', req:'{ "events": [ {"type": "play", "track": "7xQ…", "ms_played": 213000, "reason_end": "trackdone"} ] }'},
    {m:'GET', path:'/v1/me/playlists/discover-weekly', res:'{ "tracks": ["…" ], "generated_at": "2026-11-09" }'}],
  algorithm:{title:'Collaborative filtering', html:'<p>Item-item collaborative filtering scores how alike two tracks are by how many listeners they share (the cosine similarity of their listener vectors). It then recommends the unheard tracks that are most like what a user already plays.</p><p>At Spotify’s scale it runs as distributed batch jobs (matrix factorisation and embeddings). These are mixed with audio and text models for new tracks that have no plays yet.</p>', mount:cfSim},
  tradeoffs:[['Weekly playlists made ahead of time', 'Cheap to serve and predictable', 'Not reactive within the week'], ['Prefetching the next track', 'Skips and changes are instant', 'Some bandwidth is wasted when users skip'], ['A durable event pipeline', 'Royalties and analytics are complete', 'Infrastructure cost, and data becomes consistent only eventually'], ['CDN delivery', 'Low delay worldwide', 'CDN cost for each GB']],
  alternatives:[['Peer-to-peer delivery', 'Spotify used it early to save bandwidth. CDNs became cheaper, and P2P was retired in 2014'], ['Real-time recommendations only', 'More reactive, but much more expensive at this scale'], ['Content-based only (audio features)', 'Solves cold start, but misses the social signal of who listens to what']],
  failures:[['Recs store', 'Last cached playlist'], ['Events', 'Durable, and delivered late'], ['CDN', 'Other edges, and prefetched audio'], ['Search', 'Recent searches']],
  lab:{stack:['Python + PySpark (or DuckDB)', 'A public listening dataset (e.g. Last.fm)', 'Redis', 'FastAPI', 'Nginx as a CDN cache'], milestones:[
    {day:'Day 1: streaming', items:['Serve audio files through an Nginx cache with range requests', 'Client that prefetches the next track', 'Measure time to first audio']},
    {day:'Day 2: events', items:['Batch event uploads with retry and offline buffer', 'Write events to Parquet daily', 'Charts job: top tracks per day']},
    {day:'Day 3: recommendations', items:['Item-item cosine similarity on the play matrix', 'Weekly playlist per user into Redis', 'Evaluate with a held-out week (hit rate)']}],
   pseudocode:{lang:'python', code:`# Item-item collaborative filtering (batch)
plays = load_plays(week)                       # sparse user × track matrix (1 if played ≥ 30 s)
norms = sqrt((plays ** 2).sum(axis=0))
sim = (plays.T @ plays) / outer(norms, norms)  # cosine similarity, track × track (top-k sparse in practice)
for user in users:
    heard = plays[user].nonzero()
    scores = sim[:, heard].sum(axis=1)
    scores[heard] = -inf                       # only new tracks
    redis.set(f"recs:{user}:dw", top_k(scores, 30))`},
   loadTest:'<p>Replay a day of synthetic events at 5× speed through the event API, and verify none are lost (count in against out). Then serve 10K requests/s for playlists from Redis and 1,000 track starts/s through the cache, measuring p99 time to first byte.</p>'},
  twists:[{q:'A brand-new song has no plays. How does it get recommended?', a:'This is the cold start problem. Use content features (audio analysis, genre, artist and text about the song), editor playlists and the artist’s existing audience. Once plays add up, the signals from other listeners take over.'}, {q:'Why precompute Discover Weekly instead of working it out when the user opens it?', a:'The calculation needs the whole play matrix and runs for hours, while each user’s result is a small list. Computing it once a week turns an expensive model into a key-value read. A weekly rhythm is also part of the product.'}, {q:'How do you count plays accurately for royalties if clients are offline?', a:'Clients keep events with unique ids and upload them later. The pipeline delivers at least once and removes duplicates by event id. Royalties are worked out from the cleaned log after a cut-off time.'}, {q:'A user skips 30 songs in a row. Does the system still prefetch each next track?', a:'Prefetch less when the user is skipping. Fetch only the first few seconds of the next track, not the whole file, and stop prefetching further ahead after a few skips. This keeps the next song instant without wasting data on the mobile plan.'}],
  real:[
    {co:'Spotify P2P (early design)', tier:'confirmed', text:'Spotify’s early clients combined server streaming with peer-to-peer delivery to keep latency low and bandwidth costs down. P2P was phased out in 2014.', src:'Kreitz & Niemelä, “Spotify – Large Scale, Low Latency, P2P Music-on-Demand Streaming” (IEEE P2P 2010)'},
    {co:'Spotify on Google Cloud', tier:'confirmed', text:'Spotify announced its move to Google Cloud in 2016 and moved its event delivery onto Cloud Pub/Sub.', src:'Spotify Engineering, “Announcing Spotify Infrastructure’s Googley Future” (2016), and “Spotify’s Event Delivery: The Road to the Cloud” (2016)'},
    {co:'Discover Weekly', tier:'confirmed', text:'Discover Weekly (2015) combines collaborative filtering with other models to generate a personal playlist for every user each week.', src:'Spotify talks on Discover Weekly (2015)'},
    {co:'Backstage', tier:'confirmed', text:'Spotify open-sourced Backstage, its developer portal for managing many services owned by many teams, in 2020.', src:'Spotify Engineering, “What the heck is Backstage anyway?” (2020)'},
    {co:'Current internals', tier:'inference', text:'The exact current serving and model stack isn’t described here.', src:'This case study'},
    {co:'CF demo', tier:'educational', text:'The play matrix is a tiny made-up example.', src:'This case study’s model'}],
  sources:['Kreitz & Niemelä: Spotify: Large Scale, Low Latency, P2P Music-on-Demand Streaming (2010)', 'Spotify Engineering: Spotify’s Event Delivery: The Road to the Cloud (2016)', 'Spotify Engineering: Announcing Spotify Infrastructure’s Googley Future (2016)', 'Linden, Smith & York: Amazon.com Recommendations: Item-to-Item Collaborative Filtering (IEEE Internet Computing 2003)', 'Hu, Koren & Volinsky: Collaborative Filtering for Implicit Feedback Datasets (ICDM 2008)']
});
})();
