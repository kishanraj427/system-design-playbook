
/* =====================================================================
   PART 5 · MODULE 8 — SEARCH & SPECIAL DATA STRUCTURES
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, sv, esc, clamp, fmtNum, fmtBytes} = SDA.u; const ui = SDA.ui;
const {sortGame} = SDA.m1helpers; const {fnv, css, frag} = SDA.ph;

const DOCS = ['Spicy chicken biryani with raita', 'Veg biryani and paneer tikka', 'Paneer butter masala with naan', 'Chicken tikka masala and garlic naan', 'Masala dosa with coconut chutney', 'Butter chicken with jeera rice', 'Hyderabadi mutton biryani, extra spicy', 'Garlic naan and dal makhani'];
const STOP = new Set(['with', 'and', 'the', 'a', 'of', 'extra']);
const tok = s => s.toLowerCase().split(/[^a-z]+/).filter(w => w && !STOP.has(w));

/* ---------- widgets ---------- */
function invertedDemo(host){
  const idx = new Map(); DOCS.forEach((d, i) => tok(d).forEach(t => { if (!idx.has(t)) idx.set(t, new Set()); idx.get(t).add(i); }));
  const inp = el('input', {class:'input', value:'chicken naan', 'aria-label':'Search query'}); let mode = 'and'; const out = el('div');
  function run(){
    const qt = [...new Set(tok(inp.value))]; const lists = qt.map(t => [t, [...(idx.get(t) || [])].sort((a, b) => a - b)]);
    let res = null; lists.forEach(([, l]) => { const s = new Set(l); res = res == null ? s : mode === 'and' ? new Set([...res].filter(x => s.has(x))) : new Set([...res, ...s]); });
    res = [...(res || [])].sort((a, b) => a - b);
    out.innerHTML = '';
    out.append(el('div', {class:'grid c2'},
      el('div', {class:'card'}, el('b', null, 'Postings lists for your terms'), el('div', {class:'stack', style:{marginTop:'6px', gap:'4px'}}, ...(lists.length ? lists.map(([t, l]) => el('div', {class:'mono', style:{fontSize:'13px'}}, `${t} → [${l.map(i => 'doc' + (i + 1)).join(', ') || '∅'}]`)) : [el('span', {class:'muted'}, 'Type some words')])), el('div', {class:'lab-hint', style:{marginTop:'6px'}}, mode === 'and' ? 'AND = intersect the sorted lists (walk them in step, O(sum of lengths)).' : 'OR = union of the lists.')),
      el('div', {class:'card'}, el('b', null, `Matches (${res.length})`), el('div', {class:'stack', style:{marginTop:'6px', gap:'4px'}}, ...res.map(i => el('div', {style:{fontSize:'14px'}}, el('b', {class:'mono'}, `doc${i + 1}: `), DOCS[i]))))));
    const all = [...idx.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    out.append(el('details', {style:{marginTop:'10px'}}, el('summary', null, `Full inverted index (${all.length} terms)`), frag(h.table(['Term', 'Documents'], all.map(([t, s]) => [`<b>${t}</b>`, [...s].map(i => 'doc' + (i + 1)).join(', ')])))));
  }
  inp.addEventListener('input', run);
  host.append(el('div', {class:'ctl-grid'}, el('label', {class:'field'}, el('span', null, 'Query'), inp), ui.select({label:'Combine terms with', value:'and', options:[['and', 'AND (all words)'], ['or', 'OR (any word)']], onChange:v => { mode = v; run(); }}).el), el('ol', {class:'prose', style:{fontSize:'14px', margin:'10px 0'}, html:DOCS.map((d, i) => `<li>${esc(d)}</li>`).join('')}), out);
  run();
}
function bm25Demo(host){
  const P = {k1:1.2, b:.75}; const inp = el('input', {class:'input', value:'paneer tikka', 'aria-label':'Query'}); const out = el('div');
  const D = DOCS.map(tok); const N = D.length, avg = D.reduce((s, d) => s + d.length, 0) / N;
  const df = t => D.filter(d => d.includes(t)).length;
  function run(){
    const qt = [...new Set(tok(inp.value))];
    const rows = D.map((d, i) => { let bm = 0, tf_idf = 0; const parts = []; qt.forEach(t => { const tf = d.filter(x => x === t).length, n = df(t); if (!tf) return; const idf = Math.log(1 + (N - n + .5) / (n + .5)); const s = idf * tf * (P.k1 + 1) / (tf + P.k1 * (1 - P.b + P.b * d.length / avg)); bm += s; tf_idf += tf * Math.log(N / n); parts.push(`${t}: idf ${idf.toFixed(2)} × tf-part ${(s / idf).toFixed(2)} = ${s.toFixed(2)}`); }); return {i, bm, tf_idf, parts, len:d.length}; }).filter(r => r.bm > 0).sort((a, b) => b.bm - a.bm);
    out.innerHTML = '';
    out.append(frag(h.table(['Rank', 'Document', 'Length', 'BM25', 'Breakdown', 'TF-IDF'], rows.map((r, k) => [String(k + 1), esc(DOCS[r.i]), String(r.len), `<b>${r.bm.toFixed(3)}</b>`, `<span class="lab-hint">${r.parts.join('<br>')}</span>`, r.tf_idf.toFixed(3)]), [2, 3, 5])));
    out.append(el('p', {class:'lab-hint'}, `N = ${N} docs, average length ${avg.toFixed(1)} terms (stopwords removed). Rare terms get high IDF; repeated terms saturate with k1; b penalises long documents.`));
  }
  inp.addEventListener('input', run);
  host.append(el('div', {class:'ctl-grid'}, el('label', {class:'field'}, el('span', null, 'Query'), inp), ui.slider({label:'k1 (term-frequency saturation)', min:0, max:3, step:.1, value:1.2, fmt:v => v.toFixed(1), onInput:v => { P.k1 = v; run(); }}).el, ui.slider({label:'b (length normalisation)', min:0, max:1, step:.05, value:.75, fmt:v => v.toFixed(2), onInput:v => { P.b = v; run(); }}).el), out);
  run();
}
function sketchDemo(host){
  ui.tabs(host, [{id:'hll', label:'HyperLogLog (count distinct)', render:p => hll(p)}, {id:'cms', label:'Count-Min Sketch (frequencies)', render:p => cms(p)}]);
  function hll(p){
    const P = {p:12, n:5}; const out = el('div');
    function run(){
      const m = 1 << P.p, M = new Uint8Array(m), N = Math.round(Math.pow(10, P.n));
      for (let i = 0; i < N; i++){ const x = (Math.random() * 4294967296) >>> 0; const j = x >>> (32 - P.p); const w = (x << P.p) >>> 0; let r = 1; let bit = 1 << 31; while (r <= 32 - P.p && !(w & bit)){ r++; bit >>>= 1; } if (r > M[j]) M[j] = r; }
      const alpha = m === 16 ? .673 : m === 32 ? .697 : m === 64 ? .709 : .7213 / (1 + 1.079 / m);
      let Z = 0, V = 0; M.forEach(v => { Z += Math.pow(2, -v); if (!v) V++; });
      let E = alpha * m * m / Z; if (E <= 2.5 * m && V) E = m * Math.log(m / V); if (E > 4294967296 / 30) E = -4294967296 * Math.log(1 - E / 4294967296);
      const err = (E - N) / N * 100, se = 1.04 / Math.sqrt(m) * 100;
      out.innerHTML = '';
      out.append(frag(`<div class="metrics"><div class="metric"><div class="ml">True distinct</div><div class="mv">${fmtNum(N)}</div></div><div class="metric"><div class="ml">HLL estimate</div><div class="mv">${fmtNum(E)}</div></div><div class="metric ${Math.abs(err) > 2 * se ? 'warn' : ''}"><div class="ml">Error</div><div class="mv">${err.toFixed(2)}<small>%</small></div></div><div class="metric"><div class="ml">Std error (1.04/√m)</div><div class="mv">±${se.toFixed(2)}<small>%</small></div></div><div class="metric"><div class="ml">HLL memory (6-bit registers)</div><div class="mv" style="font-size:18px">${fmtBytes(m * 6 / 8)}</div></div><div class="metric"><div class="ml">Exact set (8 B/item)</div><div class="mv" style="font-size:18px">${fmtBytes(N * 8)}</div></div></div>`));
    }
    p.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Precision p (registers m = 2ᵖ)', min:4, max:16, step:1, value:12, fmt:v => `${v} (m = ${fmtNum(1 << v)})`, onInput:v => { P.p = v; run(); }}).el, ui.slider({label:'Distinct items in the stream', min:2, max:6.3, step:.1, value:5, fmt:v => fmtNum(Math.pow(10, v)), onInput:v => { P.n = v; run(); }}).el), el('div', {class:'controls', style:{margin:'8px 0'}}, ui.button('🎲 Re-run', run, 'sm')), out, el('p', {class:'lab-hint'}, 'Each item’s hash picks a register (first p bits); the register keeps the longest run of leading zeros seen in the rest. Long runs are rare, so they reveal how many distinct hashes you have seen. Redis uses p = 14 (12 KB, ~0.81% error).'));
    run();
  }
  function cms(p){
    const P = {w:200, d:4}; const out = el('div');
    function run(){
      const ITEMS = 10000, EV = 100000; const cdf = []; let s = 0; for (let k = 1; k <= ITEMS; k++){ s += 1 / k; cdf.push(s); }
      const C = Array.from({length:P.d}, () => new Uint32Array(P.w)); const truth = new Map();
      for (let e = 0; e < EV; e++){ const r = Math.random() * s; let lo = 0, hi = ITEMS - 1; while (lo < hi){ const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; } const key = 'item' + lo; truth.set(key, (truth.get(key) || 0) + 1); for (let i = 0; i < P.d; i++) C[i][fnv(key + '#' + i) % P.w]++; }
      const est = k => Math.min(...C.map((row, i) => row[fnv(k + '#' + i) % P.w]));
      const top = [...truth.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8); const rare = [...truth.entries()].filter(x => x[1] <= 2).slice(0, 4);
      const bound = Math.E / P.w * EV;
      out.innerHTML = '';
      out.append(frag(h.table(['Item', 'True count', 'CMS estimate', 'Over-count'], top.concat(rare).map(([k, v]) => { const e = est(k); return [k, fmtNum(v), fmtNum(e), e - v ? `<span style="color:${e - v > bound ? 'var(--bad)' : 'var(--warn)'}">+${fmtNum(e - v)}</span>` : '0']; }), [1, 2, 3])));
      out.append(el('div', {class:'verdict ok'}, `Memory: ${P.d} × ${P.w} counters = ${fmtBytes(P.d * P.w * 4)} vs ~${fmtNum(truth.size)} exact counters. Guarantee: estimate ≥ truth, and ≤ truth + (e/w)·N ≈ +${fmtNum(bound)} with probability ≥ ${(1 - Math.exp(-P.d)).toFixed(3)}. Heavy hitters are accurate; rare items are relatively inflated.`));
    }
    p.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Width w (counters per row)', min:20, max:2000, step:20, value:200, fmt:v => v, onInput:v => { P.w = v; run(); }}).el, ui.slider({label:'Depth d (hash functions)', min:1, max:8, step:1, value:4, fmt:v => v, onInput:v => { P.d = v; run(); }}).el), out, el('p', {class:'lab-hint'}, '100,000 events over 10,000 items with Zipf popularity.'));
    run();
  }
}
function tsCalc(host){
  const P = {series:5, interval:15, raw:15, m1:true, h1:true};
  const out = el('div');
  function calc(){
    const S = Math.pow(10, P.series), ppd = S * 86400 / P.interval;
    const raw = ppd * P.raw, m1 = P.m1 ? S * 1440 * 90 : 0, h1 = P.h1 ? S * 24 * 730 : 0, pts = raw + m1 + h1;
    out.innerHTML = '';
    out.append(frag(h.table(['Tier', 'Resolution', 'Retention', 'Points stored'], [['Raw', P.interval + ' s', P.raw + ' days', fmtNum(raw)], ['Rollup', '1 min (min/max/avg/count)', P.m1 ? '90 days' : '—', fmtNum(m1)], ['Rollup', '1 hour', P.h1 ? '2 years' : '—', fmtNum(h1)]], [3])));
    out.append(frag(`<div class="metrics"><div class="metric"><div class="ml">Ingest rate</div><div class="mv">${fmtNum(ppd / 86400)}<small>pts/s</small></div></div><div class="metric"><div class="ml">Naive (16 B/point)</div><div class="mv">${fmtBytes(pts * 16)}</div></div><div class="metric"><div class="ml">Gorilla-style (~1.37 B/point)</div><div class="mv">${fmtBytes(pts * 1.37)}</div></div><div class="metric"><div class="ml">Keeping raw for 2 years instead</div><div class="mv">${fmtBytes(ppd * 730 * 1.37)}</div></div></div>`));
  }
  const S = (k, o) => ui.slider(Object.assign({value:P[k], onInput:v => { P[k] = v; calc(); }}, o)).el;
  host.append(el('div', {class:'ctl-grid'}, S('series', {label:'Active time series', min:3, max:8, step:.1, fmt:v => fmtNum(Math.pow(10, v))}), S('interval', {label:'Scrape interval', min:1, max:60, step:1, fmt:v => v + ' s'}), S('raw', {label:'Raw retention', min:1, max:90, step:1, fmt:v => v + ' days'})), el('div', {class:'row', style:{gap:'16px', margin:'10px 0'}}, ui.toggle({label:'1-minute rollups for 90 days', checked:true, onChange:v => { P.m1 = v; calc(); }}).el, ui.toggle({label:'1-hour rollups for 2 years', checked:true, onChange:v => { P.h1 = v; calc(); }}).el), out);
  calc();
}
function annDemo(host, api){
  const P = {ef:4, edges:false}; let pts = [], graph = [], q = [.5, .5], vis = new Set(), res = [], exact = [];
  const cv = el('canvas', {height:760, style:{height:'380px', cursor:'crosshair'}, 'aria-label':'2-D embedding space; click to place a query'}); const box = el('div', {class:'chart-box'}, cv);
  const met = ui.metrics(null, [{id:'vis', label:'Distance computations (graph)', instant:true}, {id:'bf', label:'Brute force needs', instant:true}, {id:'rec', label:'Recall@5', unit:'%', instant:true, dir:'down', warn:80, bad:60}]);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function build(){
    pts = []; const C = Array.from({length:7}, () => [.1 + Math.random() * .8, .1 + Math.random() * .8]);
    for (let i = 0; i < 400; i++){ const c = C[i % 7]; pts.push([clamp(c[0] + (Math.random() - .5) * .22, 0, 1), clamp(c[1] + (Math.random() - .5) * .22, 0, 1)]); }
    graph = pts.map((p, i) => { const nn = pts.map((o, j) => [dist(p, o), j]).filter(x => x[1] !== i).sort((a, b) => a[0] - b[0]).slice(0, 5).map(x => x[1]); for (let r = 0; r < 2; r++) nn.push(Math.floor(Math.random() * pts.length)); return nn; });
    graph.forEach((nb, i) => nb.forEach(j => { if (!graph[j].includes(i)) graph[j].push(i); }));
    search();
  }
  function search(){
    vis = new Set(); const entry = Math.floor(Math.random() * pts.length); const cand = [[dist(q, pts[entry]), entry]]; let best = [[dist(q, pts[entry]), entry]]; vis.add(entry);
    while (cand.length){ cand.sort((a, b) => a[0] - b[0]); const [dc, c] = cand.shift(); const worst = best[best.length - 1][0]; if (dc > worst && best.length >= P.ef) break; for (const nb of graph[c]){ if (vis.has(nb)) continue; vis.add(nb); const dn = dist(q, pts[nb]); if (best.length < P.ef || dn < best[best.length - 1][0]){ cand.push([dn, nb]); best.push([dn, nb]); best.sort((a, b) => a[0] - b[0]); if (best.length > P.ef) best.pop(); } } }
    res = best.slice(0, 5).map(x => x[1]); exact = pts.map((p, i) => [dist(q, p), i]).sort((a, b) => a[0] - b[0]).slice(0, 5).map(x => x[1]);
    met.set('vis', vis.size); met.set('bf', pts.length); met.set('rec', res.filter(r => exact.includes(r)).length / 5 * 100);
    draw();
  }
  function draw(){
    const W = box.clientWidth || 640, H = 380; cv.width = W * 2; const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0);
    const X = p => 10 + p[0] * (W - 20), Y = p => 10 + p[1] * (H - 20);
    if (P.edges){ g.strokeStyle = css('--border'); g.lineWidth = .5; graph.forEach((nb, i) => nb.forEach(j => { if (j > i){ g.beginPath(); g.moveTo(X(pts[i]), Y(pts[i])); g.lineTo(X(pts[j]), Y(pts[j])); g.stroke(); } })); }
    pts.forEach((p, i) => { g.fillStyle = vis.has(i) ? css('--warn') : css('--border-strong'); g.beginPath(); g.arc(X(p), Y(p), vis.has(i) ? 3.5 : 2.5, 0, 7); g.fill(); });
    exact.forEach(i => { g.strokeStyle = css('--ok'); g.lineWidth = 2; g.beginPath(); g.arc(X(pts[i]), Y(pts[i]), 9, 0, 7); g.stroke(); });
    res.forEach(i => { g.fillStyle = css('--accent2'); g.beginPath(); g.arc(X(pts[i]), Y(pts[i]), 5, 0, 7); g.fill(); });
    g.fillStyle = css('--accent1'); g.font = '20px sans-serif'; g.fillText('★', X(q) - 8, Y(q) + 7);
  }
  cv.addEventListener('click', e => { const r = cv.getBoundingClientRect(); q = [clamp((e.clientX - r.left - 10) / (r.width - 20), 0, 1), clamp((e.clientY - r.top - 10) / (r.height - 20), 0, 1)]; search(); });
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Beam width (ef)', min:1, max:30, step:1, value:4, fmt:v => v, onInput:v => { P.ef = v; search(); }}).el), el('div', {class:'row', style:{margin:'10px 0', gap:'14px'}}, ui.toggle({label:'Show graph edges', checked:false, onChange:v => { P.edges = v; draw(); }}).el, ui.button('🎲 New dataset', build, 'sm'), ui.button('🔁 Search again (new entry point)', search, 'sm')), box, el('div', {class:'legend', style:{margin:'8px 0'}}, el('span', {style:{color:'var(--accent1)'}}, '★ query (click to move)'), el('span', {style:{color:'var(--warn)'}}, '● visited by graph search'), el('span', {style:{color:'var(--accent2)'}}, '● graph search results'), el('span', {style:{color:'var(--ok)'}}, '○ true 5 nearest')), met.el, el('p', {class:'lab-hint'}, 'Each point links to its 5 nearest neighbours plus 2 random long-range links (a navigable small-world graph — the idea HNSW stacks into layers). Greedy beam search walks toward the query. Raise ef for higher recall at the cost of more distance computations.'));
  build();
}
function recDemo(host){
  const U = ['Asha', 'Ravi', 'Meera', 'Kabir', 'Zoya', 'Dev'], I = ['Biryani', 'Dosa', 'Paneer Tikka', 'Chole Bhature', 'Momos', 'Pizza', 'Pav Bhaji', 'Idli'];
  const R = [[5, 0, 4, 0, 2, 0, 3, 0], [4, 1, 5, 4, 0, 2, 0, 1], [0, 5, 0, 1, 0, 3, 2, 5], [1, 4, 0, 0, 5, 4, 0, 4], [5, 0, 4, 5, 1, 0, 4, 0], [0, 3, 1, 0, 4, 5, 2, 0]];
  let who = 0; const grid = el('div', {style:{overflowX:'auto'}}); const out = el('div');
  const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let u = 0; u < U.length; u++){ d += R[u][a] * R[u][b]; x += R[u][a] ** 2; y += R[u][b] ** 2; } return x && y ? d / Math.sqrt(x * y) : 0; };
  function render(){
    const t = el('table', {class:'tbl', style:{minWidth:'560px'}}); const hd = el('tr', null, el('th', null, 'User'), ...I.map(i => el('th', {style:{fontSize:'11px'}}, i))); t.append(el('thead', null, hd)); const tb = el('tbody');
    U.forEach((u, ui_) => { const tr = el('tr', {style:{background:ui_ === who ? 'var(--grad-soft)' : ''}}); tr.append(el('td', null, el('button', {type:'button', class:'btn sm' + (ui_ === who ? ' active' : ''), onclick:() => { who = ui_; render(); }}, u))); I.forEach((_, ii) => { const b = el('button', {type:'button', class:'btn sm', style:{minWidth:'38px', padding:'4px'}, 'aria-label':`${u} rating for ${I[ii]}`}, R[ui_][ii] ? '★' + R[ui_][ii] : '·'); b.addEventListener('click', () => { R[ui_][ii] = (R[ui_][ii] + 1) % 6; render(); }); tr.append(el('td', null, b)); }); tb.append(tr); });
    t.append(tb); grid.innerHTML = ''; grid.append(t);
    const r = R[who]; const preds = I.map((_, i) => { if (r[i]) return null; let num = 0, den = 0, best = null; I.forEach((_, j) => { if (!r[j]) return; const s = cos(i, j); num += s * r[j]; den += Math.abs(s); if (!best || s * r[j] > best[1]) best = [j, s * r[j], s]; }); return den ? {i, score:num / den, because:best} : null; }).filter(Boolean).sort((a, b) => b.score - a.score);
    out.innerHTML = '';
    out.append(el('b', null, `Recommendations for ${U[who]}`), ...preds.slice(0, 3).map((p, k) => el('div', {class:'card', style:{margin:'6px 0'}}, el('b', null, `${k + 1}. ${I[p.i]} `), el('span', {class:'chip mono'}, `predicted ★${p.score.toFixed(2)}`), el('div', {class:'lab-hint'}, `Because you rated ${I[p.because[0]]} ★${r[p.because[0]]} and people who like ${I[p.because[0]]} also like ${I[p.i]} (item similarity ${p.because[2].toFixed(2)}).`))));
    if (!preds.length) out.append(el('p', {class:'muted'}, 'Nothing left to recommend — clear a rating.'));
  }
  host.append(el('p', {class:'lab-hint', style:{marginTop:0}}, 'Click a user to select them; click a cell to cycle a rating (· = not rated, ★1–★5).'), grid, el('div', {style:{height:'10px'}}), out);
  render();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'inverted-index', title:'The inverted index', minutes:9, tags:['inverted index','postings','tokenization','full-text search'],
  summary:'Map every word to the list of documents containing it. Search becomes looking up a few lists and intersecting them — instead of scanning every document.',
  problem:`<p>A food app has 2 million dishes. A user types “paneer tikka”. <code>SELECT … WHERE name LIKE '%paneer%tikka%'</code> scans every row, can’t rank results, and doesn’t match “Paneer-Tikka” or “tikkas”. Search needs a different index — one built around <em>words</em>.</p>`,
  intuition:`The index at the back of a cookbook: “paneer — pages 12, 45, 78; tikka — 45, 90”. To find recipes with both, look up both entries and take the pages they share (45). You never read the whole book.`,
  how:{
    steps:[`<b>Analyse</b> text: tokenise, lowercase, remove stopwords, stem/lemmatise (“tikkas” → “tikka”), handle synonyms and transliteration (“chole” ≈ “chhole”).`, `For each term keep a <b>postings list</b>: sorted document IDs (plus term frequency and positions for phrase queries).`, `Query: analyse the query the same way; fetch each term’s postings; <b>intersect</b> (AND) or <b>union</b> (OR).`, `Intersection walks sorted lists in step; skip pointers and compression (delta + variable-byte) make it fast and small.`, `Then <b>rank</b> the matches (next lesson).`],
    diagram:{title:'Answering “chicken naan”', w:760, h:240, alt:'The query is tokenised; postings for chicken and naan are fetched and intersected.',
      nodes:[{id:'q', type:'client', label:'“chicken naan”', x:90, y:120, w:140}, {id:'an', type:'service', label:'Analyzer', x:280, y:120, w:110}, {id:'p1', type:'db', label:'chicken → 1,4,6', x:480, y:60, w:150}, {id:'p2', type:'db', label:'naan → 3,4,8', x:480, y:180, w:150}, {id:'r', type:'service', label:'Intersect → doc 4', x:680, y:120, w:150}],
      edges:[{from:'q', to:'an'}, {from:'an', to:'p1'}, {from:'an', to:'p2'}, {from:'p1', to:'r'}, {from:'p2', to:'r'}],
      steps:[
        {note:'Analyse the query into terms: [chicken, naan].', flow:[['q', 'an']], hl:['an']},
        {note:'Fetch each term’s postings list from the index.', flow:[['an', 'p1'], ['an', 'p2']], parallel:true},
        {note:'Intersect sorted lists: 1,4,6 ∩ 3,4,8 = <b>4</b> — “Chicken tikka masala and garlic naan”.', flow:[['p1', 'r'], ['p2', 'r']], parallel:true, hl:['r']}
      ]},
    deep:`<p><b>Lucene</b> stores the term dictionary as a finite-state transducer (compact, prefix-friendly), postings with delta encoding and block compression, and per-document “doc values” (columnar) for sorting and aggregations. Positions enable phrase and proximity queries. Index updates are written as new immutable <b>segments</b> that are later merged (an LSM idea).</p><p><b>Analysis is where quality comes from:</b> language-specific stemmers, n-grams for partial matches, phonetic filters, synonym graphs. For Indian products, transliteration (“biryani/biriyani”), mixed scripts and code-mixed queries are major sources of misses.</p>`
  },
  tradeoffs:{use:[`Full-text search, filtering by many attributes, log search`], avoid:[`Using a search index as the system of record`, `LIKE '%term%' on large tables`], alt:[`PostgreSQL full-text search (GIN) for moderate scale`, `Vector search for semantic matching (later lesson)`]},
  real:[
    {co:'Apache Lucene', tier:'confirmed', text:'The open-source library behind Elasticsearch, OpenSearch and Solr, built on inverted indexes stored in immutable segments.', src:'Apache Lucene documentation'},
    {co:'PostgreSQL', tier:'confirmed', text:'Full-text search uses tsvector/tsquery with GIN (inverted) indexes.', src:'PostgreSQL documentation — full text search'}
  ],
  mistakes:[`Analysing documents and queries differently`, `No handling of plurals, typos or transliteration`, `Searching with LIKE on big tables`],
  interview:[`Explain postings lists and intersection, then mention ranking and analyzers`],
  tryit:{note:'Search eight dishes through a real inverted index.', mount:host => invertedDemo(host)},
  sources:[`Manning, Raghavan & Schütze, “Introduction to Information Retrieval” (2008)`, `Apache Lucene documentation`]
},
{
  id:'bm25-ranking', title:'Ranking: TF-IDF, BM25 and beyond', minutes:10, tags:['TF-IDF','BM25','relevance','ranking','learning to rank'],
  summary:'Score each match: rare words matter more (IDF), repeated words matter with diminishing returns (TF saturation), and long documents shouldn’t win just by being long (length normalisation).',
  problem:`<p>“Paneer tikka” matches 40,000 dishes. Showing them in database order is useless. Which match is <em>most relevant</em>? A dish named “Paneer Tikka” should beat a long combo description that mentions paneer once among 30 other words.</p>`,
  intuition:`Judging which letter is about “monsoon”: one that says “monsoon” five times is likelier than one that says it once — but the 50th mention adds little. A letter that mentions it once in two lines is more “about” it than one mentioning it once in twenty pages. And the word “the” tells you nothing because every letter has it.`,
  how:{
    steps:[`<b>TF</b> (term frequency): more occurrences → more relevant.`, `<b>IDF</b> (inverse document frequency): log(N / n) — terms in few documents carry more information.`, `<b>BM25</b> improves TF-IDF: TF saturates (parameter <b>k1</b>, default 1.2) and is normalised by document length relative to the average (parameter <b>b</b>, default 0.75).`, `Score = Σ over query terms of IDF × TF·(k1+1) / (TF + k1·(1 − b + b·len/avg_len)).`, `Real ranking adds signals: field boosts (title > description), freshness, popularity, personalisation, distance — often combined by a learned model (learning to rank) that re-ranks the top few hundred BM25 results.`],
    stepper:{title:'Why BM25 beats raw counts', items:[
      {title:'IDF', tag:'rarity', text:'“tikka” appears in 2 of 8 dishes, “masala” in 3 — “tikka” is more discriminating, so it weighs more.'},
      {title:'TF saturation', tag:'k1', text:'The 1st occurrence matters a lot, the 5th little. k1 controls how fast it saturates (k1 = 0 ignores TF entirely).'},
      {title:'Length normalisation', tag:'b', text:'A 3-word title containing “paneer” beats a 40-word description containing it once. b = 0 turns this off; b = 1 normalises fully.'},
      {title:'Multi-signal ranking', tag:'reality', text:'Final order blends BM25 with popularity, ratings, distance and personalisation — retrieval first, then a re-ranking model.'}
    ]},
    deep:`<p><b>Two-stage ranking</b> is standard at scale: a cheap retrieval stage (BM25 and/or vector ANN) fetches a few hundred candidates per shard; a precise, expensive model (gradient-boosted trees or neural rankers, trained on clicks/purchases with care for position bias) re-ranks them. <b>Evaluation:</b> offline with NDCG/MRR on judged queries, online with A/B tests on click-through and conversion.</p><p><b>Web search adds link analysis:</b> PageRank (Brin & Page, 1998) estimates page importance from the link graph — one of many signals; modern engines rely heavily on learned models. Lucene switched its default similarity from TF-IDF to BM25 in version 6 (Elasticsearch 5).</p>`
  },
  tradeoffs:{use:[`BM25 as the baseline lexical ranker`, `Re-ranking models on top for business-specific relevance`], avoid:[`Sorting by a single signal (only popularity or only recency)`, `Tuning by gut feel without an evaluation set`], alt:[`Hybrid lexical + vector retrieval with reciprocal rank fusion`]},
  real:[
    {co:'Elasticsearch / Lucene', tier:'confirmed', text:'Use BM25 as the default similarity, with k1 = 1.2 and b = 0.75 by default.', src:'Elasticsearch documentation — similarity module'},
    {co:'Google (PageRank)', tier:'confirmed', text:'Brin and Page’s 1998 paper introduced PageRank, ranking pages by the link graph, as part of the original Google architecture.', src:'Brin & Page, “The Anatomy of a Large-Scale Hypertextual Web Search Engine” (1998)'},
    {co:'Research', tier:'confirmed', text:'BM25 arises from the probabilistic relevance framework developed by Robertson, Spärck Jones and colleagues.', src:'Robertson & Zaragoza, “The Probabilistic Relevance Framework: BM25 and Beyond” (2009)'}
  ],
  mistakes:[`No relevance evaluation set`, `Letting long documents dominate`, `Ignoring position bias in click-trained models`],
  interview:[`Describe retrieval → ranking stages and name BM25’s two knobs`],
  tryit:{note:'Score dishes with real BM25. Move k1 and b and watch the ranking change.', mount:host => bm25Demo(host)},
  sources:[`Robertson & Zaragoza (2009)`, `Brin & Page (1998)`, `Manning et al., “Introduction to Information Retrieval”`]
},
{
  id:'elasticsearch', title:'Elasticsearch / Lucene at scale', minutes:9, tags:['Elasticsearch','OpenSearch','shards','segments','refresh','near real-time'],
  summary:'An index is split into shards (each a Lucene index of immutable segments), replicated for availability. Queries scatter to shards and gather top results. New documents become searchable after a refresh.',
  problem:`<p>Your product search index grows to 300 million documents and 5,000 queries per second during sales. A single Lucene index on one machine can’t hold or serve that. And sellers complain: “I updated my price, why does search still show the old one?”</p>`,
  intuition:`A library chain: the catalogue is split across branches (shards), each with a photocopy at another branch (replicas). A question is phoned to every branch; each sends its best 10 answers; the head office merges them into the overall top 10. New books are shelved in batches every second, so a book handed in now appears on the shelf a moment later.`,
  how:{
    steps:[`An index has N <b>primary shards</b> (fixed at creation; changing needs reindex/split) and R <b>replicas</b> each.`, `A document is routed to shard = hash(routing key, default _id) mod N.`, `Each shard is a Lucene index made of immutable <b>segments</b>; writes go to an in-memory buffer + translog, and a <b>refresh</b> (default every 1 s) makes them searchable — near real-time, not instant.`, `Background <b>merges</b> combine segments and purge deleted docs.`, `Queries: a coordinating node sends the query to one copy of every shard (<b>query</b> phase: each returns top-k IDs and scores), merges, then fetches the winning documents (<b>fetch</b> phase).`, `Search indexes are derived data: feed them from the database via CDC, and be able to rebuild them.`],
    diagram:{title:'Query then fetch across shards', w:780, h:260, alt:'A coordinating node scatters a query to three shards, gathers top results, and fetches documents.',
      nodes:[{id:'c', type:'client', label:'Search API', x:80, y:130}, {id:'co', type:'lb', label:'Coordinating node', x:270, y:130, w:150}, {id:'s0', type:'db', label:'Shard 0', sub:'replica on node B', x:520, y:50, w:150}, {id:'s1', type:'db', label:'Shard 1', sub:'primary on node C', x:520, y:130, w:150}, {id:'s2', type:'db', label:'Shard 2', sub:'replica on node A', x:520, y:210, w:150}],
      edges:[{from:'c', to:'co'}, {from:'co', to:'s0'}, {from:'co', to:'s1'}, {from:'co', to:'s2'}],
      steps:[
        {note:'The query reaches a coordinating node.', flow:[['c', 'co', 'paneer tikka']], hl:['co']},
        {note:'<b>Query phase:</b> scatter to one copy of each shard; each returns its local top 10 (IDs + scores).', flow:[['co', 's0'], ['co', 's1'], ['co', 's2']], parallel:true},
        {note:'Gather and merge into the global top 10.', flow:[['s0', 'co', 'top10'], ['s1', 'co', 'top10'], ['s2', 'co', 'top10']], parallel:true},
        {note:'<b>Fetch phase:</b> retrieve full documents only for the winners, then respond.', flow:[['co', 's1', 'fetch 3 docs'], ['s1', 'co'], ['co', 'c', 'results']], hl:['c']}
      ]},
    deep:`<p><b>Sizing:</b> keep shards in the tens of GB; too many small shards waste heap and coordination; too few limit parallelism and make recovery slow. Use time-based indices (with rollover and lifecycle policies) for logs. <b>Relevance across shards:</b> each shard computes IDF from its own statistics; for small indices this skews scores (dfs_query_then_fetch fixes it at extra cost). <b>Deep pagination</b> is expensive (every shard returns from+size hits) — use search_after cursors. <b>Consistency:</b> search is eventually consistent with the source of truth; read-your-writes requires refresh=wait_for or reading the source.</p>`
  },
  tradeoffs:{use:[`Product/catalogue search, log analytics, faceted navigation, autocomplete`], avoid:[`As the primary database for transactional data`, `Thousands of tiny shards`, `Deep offset pagination`], alt:[`Managed search (OpenSearch Service, Elastic Cloud), Typesense/Meilisearch for smaller scale`, `PostgreSQL full-text for modest needs`]},
  real:[
    {co:'Elasticsearch', tier:'confirmed', text:'Documents become visible to search after a refresh, which by default happens every second on indices that have received searches recently — “near real-time” search.', src:'Elasticsearch documentation — near real-time search, refresh'},
    {co:'Wikipedia', tier:'confirmed', text:'Wikimedia’s on-wiki search (CirrusSearch) is built on Elasticsearch.', src:'MediaWiki CirrusSearch extension documentation'}
  ],
  mistakes:[`Expecting an update to be searchable instantly`, `Changing the number of primary shards without reindexing`, `Using search as the source of truth (no rebuild path)`],
  interview:[`Mention shards, replicas, refresh interval and CDC feeding when search appears in a design`],
  tryit:{quiz:[
    {q:'A seller updates a price and search shows the old one for about a second. Why?', options:['Bug', 'Near real-time refresh: changes become searchable after the next refresh', 'Replication lag in DNS', 'Cache stampede'], answer:1, why:'Segments are made searchable on refresh (default ~1 s).'},
    {q:'How does a query run across 3 shards?', options:['Only on shard 0', 'Scatter to all shards, gather top-k from each, merge, then fetch', 'Sequentially until a match', 'Random shard'], answer:1, why:'Query-then-fetch.'},
    {q:'Why is fetching page 10,000 (from=100000) expensive?', options:['It isn’t', 'Every shard must return from+size candidates to merge', 'Disks are slow', 'TLS'], answer:1, why:'Use search_after cursors instead.'}
  ]},
  sources:[`Elasticsearch reference documentation`, `Apache Lucene documentation`, `Gormley & Tong, “Elasticsearch: The Definitive Guide”`]
},
{
  id:'tries-autocomplete', title:'Autocomplete with tries', minutes:9, tags:['trie','autocomplete','typeahead','prefix','top-k'],
  summary:'A trie stores strings by shared prefixes, so all completions of “bir” live under one node. Store the top-k completions at each node and every keystroke is a single lookup.',
  problem:`<p>As a user types “bir…”, the app must suggest “biryani near me”, “birthday cake”, “biryani” within ~50 ms per keystroke, ranked by popularity — for millions of possible queries and thousands of keystrokes a second.</p>`,
  intuition:`A dictionary’s thumb index: you jump to “B”, then the “Bi” page, then “Bir” — each letter narrows the section. If every section also had a sticky note listing its five most popular words, you’d never need to read the whole section.`,
  how:{
    steps:[`Each node represents a prefix; edges are characters; words end at marked nodes with a frequency.`, `Lookup of a prefix of length L takes O(L), regardless of how many words exist.`, `Naively, suggestions = DFS of the subtree, sorted by frequency — slow for short prefixes (“b” has a huge subtree).`, `Optimisation: <b>cache top-k at every node</b>, updated offline from query logs. A keystroke becomes O(L) + O(k).`, `Serve from memory (replicated, sharded by prefix), cache popular prefixes at the edge/CDN, and debounce requests on the client.`, `Rebuild periodically from aggregated logs; filter offensive/unsafe suggestions; personalise lightly.`],
    diagram:{title:'Typeahead serving path', w:780, h:250, alt:'The client sends prefixes to a typeahead service backed by an in-memory trie built offline from query logs.',
      nodes:[{id:'c', type:'client', label:'Search box', x:80, y:120}, {id:'cdn', type:'cdn', label:'Edge cache', sub:'hot prefixes', x:250, y:120, w:120}, {id:'t', type:'service', label:'Typeahead svc', sub:'in-memory trie', x:450, y:120, w:150}, {id:'lg', type:'queue', label:'Query logs', x:450, y:225, w:120}, {id:'b', type:'service', label:'Builder job', sub:'hourly top-k', x:650, y:225, w:130}],
      edges:[{from:'c', to:'cdn'}, {from:'cdn', to:'t'}, {from:'c', to:'lg', dashed:true, curve:.2}, {from:'lg', to:'b'}, {from:'b', to:'t', curve:.2}],
      steps:[
        {note:'Typing “b”: a very hot prefix — answered from the <b>edge cache</b>.', flow:[['c', 'cdn', 'b'], ['cdn', 'c', 'top 5']], hl:['cdn']},
        {note:'“bir”: the service walks b → i → r in its trie and returns the cached top-k at that node.', flow:[['c', 'cdn', 'bir'], ['cdn', 't'], ['t', 'c', 'biryani near me…']], hl:['t']},
        {note:'Completed searches go to the query log; a periodic job rebuilds frequencies and top-k lists and ships a new trie.', flow:[['c', 'lg', 'searched'], ['lg', 'b'], ['b', 't', 'new trie']], hl:['b']}
      ]},
    deep:`<p><b>Memory:</b> tries with one node per character are pointer-heavy; compressed tries (radix trees) merge single-child chains, and FSTs (finite-state transducers, used by Lucene’s completion suggester) share suffixes too, storing millions of entries compactly with weights. <b>Freshness vs stability:</b> trending queries (a cricket match tonight) need a fast-path blend of a real-time counter (e.g. a streaming top-k with Count-Min Sketch) on top of the offline trie. <b>Fuzzy matching</b> (typos) uses Levenshtein automata or edit-distance-bounded traversal.</p>`
  },
  tradeoffs:{use:[`Prefix suggestions with strict latency`, `Bounded vocabularies (queries, product names, places)`], avoid:[`Recomputing top-k by DFS on every keystroke`, `Building the trie synchronously from live traffic`], alt:[`Search engine completion suggesters (FST-based)`, `Edge-n-gram indexes in Elasticsearch`]},
  real:[
    {co:'Elasticsearch completion suggester', tier:'confirmed', text:'Uses in-memory FSTs built per segment for fast, weighted prefix completions.', src:'Elasticsearch documentation — completion suggester'},
    {co:'Google Autocomplete', tier:'confirmed', text:'Google documents that predictions reflect real searches and are filtered by policies against harmful or offensive suggestions; internal data structures are not public.', src:'Google Search Help — how autocomplete works'}
  ],
  mistakes:[`DFS of the whole subtree per keystroke`, `No client-side debouncing`, `No safety filtering of suggestions`],
  interview:[`Precompute top-k per node; serve from memory; rebuild offline; add a trending layer`],
  tryit:{note:'Type into a real trie with ~120 queries; see the traversal path, nodes visited and top-k suggestions.', pg:'trie'},
  sources:[`Fredkin, “Trie Memory” (CACM 1960)`, `Elasticsearch completion suggester docs`, `Alex Xu, “System Design Interview” — search autocomplete chapter`]
},
{
  id:'bloom-filters', title:'Bloom filters', minutes:9, tags:['Bloom filter','false positive','probabilistic','set membership'],
  summary:'A tiny bit array that answers “definitely not in the set” or “probably in the set”. No false negatives, tunable false positives, a few bits per item.',
  problem:`<p>A storage engine has 50 SSTable files; checking each one on disk for a key that isn’t there costs 50 disk reads. A username-signup form must check 300 million taken names on every keystroke. A CDN wants to avoid caching objects requested only once. Each needs a fast, small “is X in the set?” that can afford to be occasionally wrong in one direction.</p>`,
  intuition:`A nightclub bouncer with a stamp list of only k marks per guest instead of their full names. If any of your k marks is missing from the board, you’re definitely not on the list. If all are present you’re probably on it — though someone else’s marks might have covered yours by coincidence.`,
  how:{
    steps:[`Start with m bits, all 0, and k independent hash functions.`, `<b>Insert</b> x: set bits h₁(x)…h_k(x) to 1.`, `<b>Query</b> x: if any of those bits is 0 → <b>definitely not present</b>; if all are 1 → <b>probably present</b>.`, `False-positive rate ≈ (1 − e^(−kn/m))^k for n inserted items; best k ≈ (m/n)·ln 2.`, `About <b>9.6 bits per item</b> gives ~1% false positives; ~14.4 bits gives ~0.1%.`, `Standard Bloom filters can’t delete (counting Bloom filters or cuckoo filters can).`],
    stepper:{title:'Insert and query with k = 3', items:[
      {title:'Insert “biryani”', tag:'set bits', text:'Hashes → bits 3, 11, 20 set to 1.'},
      {title:'Insert “dosa”', tag:'set bits', text:'Hashes → bits 7, 11, 25. Bit 11 was already 1 — overlaps are normal.'},
      {title:'Query “idli”', tag:'definitely not', text:'Hashes → 3, 14, 25. Bit 14 is 0 → idli was <b>never</b> inserted. Skip the disk read.'},
      {title:'Query “pizza”', tag:'false positive', text:'Hashes → 7, 20, 25 — all 1 by coincidence → “probably present”. A real lookup is needed to confirm (and finds nothing).'}
    ]},
    deep:`<p><b>Where they appear:</b> LSM storage engines attach a Bloom filter per SSTable so point reads skip files (Bigtable, Cassandra, HBase, RocksDB); CDNs use them to cache only on the second request (“one-hit wonders” never enter the cache); databases use them in distributed joins; web crawlers use them for “already seen this URL?”.</p><p><b>Implementation:</b> derive k hashes from two with double hashing (h₁ + i·h₂); partition bits per hash for better cache locality (blocked Bloom filters). Size with the formula from expected n and target false-positive rate; an overfilled filter’s FP rate climbs fast. Variants: counting Bloom (deletes), cuckoo filters (deletes, better space at low FP), quotient filters, scalable Bloom filters (grow over time).</p>`
  },
  tradeoffs:{use:[`Avoiding expensive lookups for absent keys`, `Large “seen before?” sets where rare false positives are fine`], avoid:[`When false positives are unacceptable without a confirming lookup`, `When you must delete items (use counting/cuckoo filters)`], alt:[`Exact hash sets (if memory allows)`, `Cuckoo filters`]},
  real:[
    {co:'Google Bigtable', tier:'confirmed', text:'Lets clients enable Bloom filters per locality group to avoid disk reads for SSTables that don’t contain a row/column.', src:'Chang et al., “Bigtable”, OSDI 2006'},
    {co:'Akamai', tier:'confirmed', text:'Used Bloom filters to avoid caching objects on their first request, since a large fraction of objects are requested only once.', src:'Maggs & Sitaraman, “Algorithmic Nuggets in Content Delivery”, ACM SIGCOMM CCR 2015'},
    {co:'Burton Bloom', tier:'confirmed', text:'Introduced the structure in 1970 for space-efficient membership tests with allowable errors.', src:'Bloom, “Space/Time Trade-offs in Hash Coding with Allowable Errors”, CACM 1970'}
  ],
  mistakes:[`Undersizing (FP rate explodes when overfilled)`, `Treating “probably yes” as “yes”`, `Trying to delete from a standard Bloom filter`],
  interview:[`Quote ~10 bits/item for ~1% FP; explain no false negatives`],
  tryit:{note:'Insert words, query others, and measure the false-positive rate against the formula.', pg:'bloom'},
  sources:[`Bloom, CACM 1970`, `Broder & Mitzenmacher, “Network Applications of Bloom Filters: A Survey” (2004)`]
},
{
  id:'hll-cms', title:'HyperLogLog and Count-Min Sketch', minutes:10, tags:['HyperLogLog','Count-Min Sketch','cardinality','heavy hitters','probabilistic'],
  summary:'HyperLogLog counts distinct items in kilobytes with ~1% error. Count-Min Sketch estimates frequencies (never under-counting) in fixed memory — perfect for heavy hitters.',
  problem:`<p>“How many unique users opened the app today?” across 300 million events: an exact set of user IDs needs gigabytes per counter — and you want this per city, per hour, per feature. “Which 100 search terms are trending right now?” over a never-ending stream: you can’t keep a counter for every string ever typed.</p>`,
  intuition:`<b>HyperLogLog:</b> if you flip coins and once saw 20 heads in a row, you’ve probably flipped about a million times. Hashing users is coin-flipping; the longest run of leading zeros hints at how many distinct users you’ve seen. Averaging over many buckets makes it precise. <b>Count-Min Sketch:</b> several small tally sheets, each with its own way of assigning words to rows; collisions only add, so the smallest tally across sheets is the closest to the truth.`,
  how:{
    steps:[`<b>HLL</b>: hash each item; first p bits pick one of m = 2ᵖ registers; store the maximum leading-zero run of the remaining bits.`, `Estimate from the harmonic mean of 2^register; standard error ≈ 1.04/√m (m = 16,384 → ~0.81% in 12 KB).`, `HLLs <b>merge</b> by taking register-wise max — union counts across shards, days or regions for free.`, `<b>Count-Min Sketch</b>: d rows × w counters; each item increments one counter per row; estimate = minimum across rows.`, `Never under-counts; over-count ≤ (e/w)·N with probability 1 − e^(−d).`, `Pair CMS with a small heap to track the top-k heavy hitters in a stream.`],
    diagram:{title:'Distinct counts that merge', w:760, h:240, alt:'Three regions each keep an HLL sketch; merging them gives the global distinct count.',
      nodes:[{id:'a', type:'service', label:'Mumbai HLL', sub:'12 KB', x:100, y:50, w:130}, {id:'b', type:'service', label:'Delhi HLL', sub:'12 KB', x:100, y:125, w:130}, {id:'c', type:'service', label:'Chennai HLL', sub:'12 KB', x:100, y:200, w:130}, {id:'m', type:'service', label:'Merge (max per register)', x:400, y:125, w:190}, {id:'r', type:'db', label:'India uniques ≈ 41.2M', sub:'±0.8%', x:650, y:125, w:170}],
      edges:[{from:'a', to:'m'}, {from:'b', to:'m'}, {from:'c', to:'m'}, {from:'m', to:'r'}],
      steps:[
        {note:'Each region maintains a 12 KB HLL of user IDs seen today.', hl:['a', 'b', 'c']},
        {note:'To count unique users across India, merge the sketches by taking the maximum of each register — users seen in several cities are not double-counted.', flow:[['a', 'm'], ['b', 'm'], ['c', 'm']], parallel:true},
        {note:'One estimate from 36 KB of sketches instead of hundreds of MB of IDs (illustrative numbers).', flow:[['m', 'r']], hl:['r']}
      ]},
    deep:`<p><b>HyperLogLog</b> (Flajolet et al., 2007) refined LogLog counting; Google’s <b>HyperLogLog++</b> (Heule et al., 2013) uses 64-bit hashes, better small-cardinality bias correction and a sparse representation — it backs approximate distinct counts in BigQuery. Redis’s PFADD/PFCOUNT/PFMERGE implement HLL with 12 KB dense registers (sparse for small sets).</p><p><b>Count-Min Sketch</b> (Cormode & Muthukrishnan, 2005) underlies streaming heavy-hitter detection, network traffic monitoring and cache admission (TinyLFU uses a CMS-like frequency sketch). Conservative update (only increment the minimum counters) reduces over-counting.</p>`
  },
  tradeoffs:{use:[`<b>HLL:</b> unique visitors/users per dimension, distinct counts at warehouse scale`, `<b>CMS:</b> trending terms, heavy hitters, rate estimates per key`], avoid:[`Billing or legal counts that must be exact`, `CMS for rare items (relative error is large)`], alt:[`Exact counts with partitioned sets when affordable`, `Theta/KMV sketches for set intersections`]},
  real:[
    {co:'Redis', tier:'confirmed', text:'HyperLogLog commands (PFADD, PFCOUNT, PFMERGE) estimate cardinality with a standard error of 0.81% using at most 12 KB per key.', src:'Redis documentation — HyperLogLog'},
    {co:'Google BigQuery', tier:'confirmed', text:'APPROX_COUNT_DISTINCT and HLL_COUNT functions are based on HyperLogLog++.', src:'BigQuery documentation; Heule et al., EDBT 2013'},
    {co:'Research', tier:'confirmed', text:'Count-Min Sketch provides frequency estimates with one-sided error bounds in sublinear space.', src:'Cormode & Muthukrishnan, J. Algorithms 2005'}
  ],
  mistakes:[`Expecting exactness`, `Undersized CMS width for long-tail streams`, `Forgetting HLLs can be merged but not intersected precisely`],
  interview:[`For “count unique users per X”, propose HLL with error and memory numbers`],
  tryit:{note:'Run a real HyperLogLog over up to 2 million items and a Count-Min Sketch over 100,000 Zipf events.', mount:host => sketchDemo(host)},
  sources:[`Flajolet et al., “HyperLogLog” (2007)`, `Heule, Nunkesser & Hall, “HyperLogLog in Practice” (EDBT 2013)`, `Cormode & Muthukrishnan (2005)`]
},
{
  id:'geospatial', title:'Geospatial indexing: geohash, quadtrees, S2 and H3', minutes:11, tags:['geohash','quadtree','S2','H3','nearby search','geospatial'],
  summary:'Turn 2-D locations into keys that keep nearby points close together, so “drivers within 2 km” becomes a few index lookups instead of a scan.',
  problem:`<p>A rider opens the app in Bengaluru. Among 200,000 online drivers in the country, find the 10 nearest available ones in under 100 ms, while every driver updates their location every 4 seconds — 50,000 writes per second. A table scan computing distance to every driver is far too slow.</p>`,
  intuition:`A city map divided into labelled squares, each split into smaller labelled squares, and so on (B, B7, B7K…). Nearby places share label prefixes. To find nearby drivers, look in your square and the 8 around it — not the whole country.`,
  how:{
    steps:[`<b>Geohash</b>: recursively halve longitude and latitude, interleave the bits, encode in base32. Longer string = smaller cell (6 chars ≈ 1.2 km × 0.6 km). Prefix = containing cell.`, `Nearby search: compute your cell at a suitable precision, then query that cell <b>plus its 8 neighbours</b> (points just across a boundary can be very close but have different prefixes).`, `<b>Quadtree</b>: recursively split a region into four children until each leaf holds ≤ N points — adapts to density (dense city centres split deeper).`, `<b>S2</b> (Google): projects the sphere onto a cube and uses a Hilbert curve for cell IDs with good locality at all levels.`, `<b>H3</b> (Uber): hexagonal cells — every neighbour is equidistant, great for surge pricing and aggregation.`, `High-update workloads keep driver locations in memory (Redis GEO, sharded in-memory indexes), not in a disk B-tree.`],
    diagram:{title:'Finding nearby drivers', w:780, h:250, alt:'Driver apps send locations to a location service that indexes them by cell; a rider query checks its cell and neighbours.',
      nodes:[{id:'d', type:'client', label:'Driver apps', sub:'every 4 s', x:80, y:70, w:120}, {id:'r', type:'client', label:'Rider app', x:80, y:190, w:120}, {id:'ls', type:'service', label:'Location service', x:300, y:70, w:150}, {id:'ix', type:'cache', label:'Geo index (in-memory)', sub:'cell → drivers', x:530, y:130, w:180}, {id:'m', type:'service', label:'Matching', x:300, y:190, w:120}],
      edges:[{from:'d', to:'ls'}, {from:'ls', to:'ix'}, {from:'r', to:'m'}, {from:'m', to:'ix'}],
      steps:[
        {note:'Drivers stream locations; each update moves the driver to the cell for its geohash/H3 index.', flow:[['d', 'ls', 'lat,lng'], ['ls', 'ix', 'cell tdr1y']], hl:['ix']},
        {note:'A rider requests a ride: compute the rider’s cell…', flow:[['r', 'm', 'pickup'], ['m', 'ix', 'cell + 8 neighbours']], hl:['m']},
        {note:'…get candidate drivers from 9 cells, compute exact distances / ETAs for those few, rank and dispatch.', flow:[['ix', 'm', '37 candidates']], hl:['m']}
      ]},
    deep:`<p><b>Precision choice:</b> the search radius should be about one cell size; if too few results, widen to the next coarser level or a ring of neighbours. <b>Distances</b> on a sphere use the haversine formula; final ranking should use road ETA (routing engine), not straight-line distance.</p><p><b>Hotspots:</b> an airport or stadium cell can have thousands of drivers — shard by finer cells or by cell + bucket. <b>Redis GEO</b> stores 52-bit geohash scores in a sorted set and supports radius queries (GEOSEARCH). PostGIS uses R-tree-like GiST indexes for general geometry (polygons, delivery zones). H3’s hexagons avoid the uneven neighbour distances of square grids.</p>`
  },
  tradeoffs:{use:[`<b>Geohash</b> for simple key-value/prefix systems (Redis, DynamoDB, Cassandra)`, `<b>Quadtree</b> for highly uneven densities in memory`, `<b>S2/H3</b> for global coverage, polygons, aggregation, pricing zones`], avoid:[`Scanning all points with distance formulas`, `Querying only your own cell (boundary misses)`], alt:[`PostGIS/GiST for rich geometry queries`, `R-trees`]},
  real:[
    {co:'Uber H3', tier:'confirmed', text:'Uber open-sourced H3 in 2018, a hierarchical hexagonal grid used for analysing and optimising marketplace dynamics such as pricing and dispatch.', src:'Uber Engineering, “H3: Uber’s Hexagonal Hierarchical Spatial Index” (2018)'},
    {co:'Google S2', tier:'confirmed', text:'The S2 Geometry library maps the sphere to cube faces and orders cells along a Hilbert curve; it is used in Google products and many open-source systems.', src:'s2geometry.io'},
    {co:'Redis GEO', tier:'confirmed', text:'Stores positions as geohash-derived scores in sorted sets and supports radius/box queries via GEOSEARCH.', src:'Redis documentation — geospatial'}
  ],
  mistakes:[`Ignoring neighbour cells`, `Straight-line distance instead of road ETA for dispatch`, `Writing 50K location updates/s into a disk-based relational index`],
  interview:[`Explain geohash/quadtree, the 9-cell lookup, and in-memory sharded location storage`],
  tryit:{note:'Click a map of drivers: geohash cells and neighbours, or a quadtree that adapts to density.', pg:'geo'},
  sources:[`Gustavo Niemeyer, geohash.org (2008)`, `Samet, “The Quadtree and Related Hierarchical Data Structures” (1984)`, `s2geometry.io; h3geo.org`]
},
{
  id:'time-series', title:'Time-series data', minutes:8, tags:['time-series','downsampling','retention','Gorilla','Prometheus'],
  summary:'Append-mostly, timestamped measurements queried by time range. Win with time-partitioned storage, specialised compression, rollups and retention policies.',
  problem:`<p>Monitoring 20,000 servers × 200 metrics every 15 seconds is 4 million series and ~23 billion points a day. Storing each point as a database row with an index chokes on writes and costs a fortune — and nobody needs per-second data from two years ago.</p>`,
  intuition:`A weather station’s logbook: you write a reading every minute, almost never edit old pages, and mostly ask “what happened between 2 and 4 PM?”. After a month you summarise each day into min/max/average and archive the minute-by-minute pages.`,
  how:{
    steps:[`Data model: series identity (metric name + labels) → stream of (timestamp, value).`, `Writes are appends in time order; storage is partitioned into time blocks (e.g. 2 hours), making range scans and deletion cheap.`, `<b>Compression</b>: delta-of-delta timestamps and XOR-ed floating-point values (Gorilla) shrink points to ~1–2 bytes.`, `<b>Downsampling / rollups</b>: keep raw data briefly, then 1-minute and 1-hour aggregates (min, max, avg, count) for longer.`, `<b>Retention</b>: drop whole old blocks rather than deleting rows.`, `Watch <b>cardinality</b>: every unique label combination is a new series (never put user IDs in metric labels).`],
    diagram:{title:'Ingest, compress, roll up', w:760, h:230, alt:'Agents push points into a head block in memory, which is compressed into time blocks, rolled up, and expired.',
      nodes:[{id:'a', type:'client', label:'Agents / scrapers', x:80, y:115, w:140}, {id:'hd', type:'cache', label:'Head block (RAM)', sub:'last 2 h', x:290, y:115, w:150}, {id:'bl', type:'db', label:'Compressed blocks', sub:'raw 15 days', x:490, y:60, w:150}, {id:'ru', type:'db', label:'Rollups', sub:'1 m · 1 h', x:490, y:180, w:130}, {id:'q', type:'client', label:'Dashboards', x:690, y:115, w:120}],
      edges:[{from:'a', to:'hd'}, {from:'hd', to:'bl'}, {from:'bl', to:'ru'}, {from:'q', to:'bl'}, {from:'q', to:'ru'}],
      steps:[
        {note:'Points stream into an in-memory head block (plus a WAL).', flow:[['a', 'hd', '4M series × 1/15s']], hl:['hd']},
        {note:'Every couple of hours the head is cut into an immutable, heavily compressed block.', flow:[['hd', 'bl', 'compact']], hl:['bl']},
        {note:'Background jobs compute rollups; raw blocks older than retention are deleted whole.', flow:[['bl', 'ru', 'downsample']], hl:['ru']},
        {note:'Dashboards query raw data for recent ranges and rollups for long ranges.', flow:[['q', 'bl', 'last 6h'], ['q', 'ru', 'last year']], parallel:true}
      ]},
    deep:`<p>Facebook’s <b>Gorilla</b> paper (VLDB 2015) reported compressing time-series points to an average of about 1.37 bytes using delta-of-delta timestamps and XOR value encoding, enabling an in-memory store for recent data; Prometheus’s storage engine adopted similar chunk encodings. Columnar engines (ClickHouse, TimescaleDB compression) also excel here.</p><p><b>Query shape:</b> aggregations over time windows grouped by labels; precomputed recording rules for expensive dashboards. <b>High cardinality</b> (labels like request IDs) explodes index size — use logs or traces for per-request detail (Module 11).</p>`
  },
  tradeoffs:{use:[`Metrics, IoT sensors, prices/tickers, GPS traces, analytics counters`], avoid:[`Unbounded label cardinality`, `Keeping full-resolution data forever by default`], alt:[`Columnar OLAP stores`, `Object storage + Parquet for cold history`]},
  real:[
    {co:'Facebook Gorilla', tier:'confirmed', text:'An in-memory time-series database that compressed points to about 1.37 bytes on average using delta-of-delta and XOR encoding.', src:'Pelkonen et al., “Gorilla: A Fast, Scalable, In-Memory Time Series Database”, VLDB 2015'},
    {co:'Prometheus', tier:'confirmed', text:'Stores samples in 2-hour blocks with chunk compression inspired by Gorilla, plus a write-ahead log for the in-memory head block.', src:'Prometheus documentation — storage'}
  ],
  mistakes:[`User IDs as metric labels`, `No rollups → slow long-range dashboards`, `Deleting old data row by row`],
  interview:[`Estimate points/second and storage with compression; propose rollups and retention tiers`],
  tryit:{note:'Size a metrics store: series, scrape interval, retention and rollups.', mount:host => tsCalc(host)},
  sources:[`Pelkonen et al., VLDB 2015`, `Prometheus storage documentation`]
},
{
  id:'vector-search-rag', title:'Vector search, ANN/HNSW and RAG basics', minutes:11, tags:['embeddings','vector search','ANN','HNSW','RAG','semantic search'],
  summary:'Embed text, images or users as vectors so “similar meaning” becomes “nearby”. Approximate nearest-neighbour indexes (like HNSW) find neighbours fast; RAG feeds retrieved passages to an LLM.',
  problem:`<p>A user searches “something light and healthy for dinner”. Keyword search finds nothing — no dish contains those words — though “moong dal khichdi” is a perfect match. You need search by meaning. And a support chatbot must answer from your own policy documents, not from what an LLM half-remembers.</p>`,
  intuition:`A map where dishes are placed by taste rather than name: all comfort foods in one neighbourhood, all spicy street food in another. A query is dropped on the map, and you look around it. Approximate search is like asking for directions from neighbour to neighbour instead of measuring the distance to every house in the city.`,
  how:{
    steps:[`An <b>embedding model</b> maps items to vectors (hundreds to thousands of dimensions); similar items get high cosine similarity.`, `Exact k-nearest-neighbour search compares the query with every vector — O(N·d), too slow at millions of items.`, `<b>ANN indexes</b> trade a little recall for huge speed-ups: <b>HNSW</b> (layered proximity graphs searched greedily), <b>IVF</b> (cluster, then search a few clusters), <b>product quantisation</b> (compress vectors).`, `Tune recall vs latency with parameters like HNSW’s <code>ef_search</code>; measure recall@k against brute force offline.`, `<b>RAG</b> (retrieval-augmented generation): chunk documents → embed → index; at query time retrieve top-k chunks (often hybrid BM25 + vector, then re-rank) and put them in the LLM prompt with instructions to cite them.`, `Store vectors with metadata filters (city, veg, price) and keep them updated via CDC like any derived index.`],
    diagram:{title:'A RAG request', w:780, h:250, alt:'A question is embedded, searched in a vector index and a keyword index, re-ranked, and passed with context to an LLM.',
      nodes:[{id:'u', type:'client', label:'User question', x:80, y:125, w:130}, {id:'e', type:'service', label:'Embed query', x:250, y:60, w:120}, {id:'v', type:'db', label:'Vector index', sub:'HNSW', x:430, y:60, w:120}, {id:'k', type:'db', label:'Keyword index', sub:'BM25', x:430, y:190, w:130}, {id:'rr', type:'service', label:'Re-rank top 20', x:600, y:125, w:130}, {id:'llm', type:'ext', label:'LLM', sub:'answer + citations', x:740, y:210, w:120}],
      edges:[{from:'u', to:'e'}, {from:'e', to:'v'}, {from:'u', to:'k', curve:.2}, {from:'v', to:'rr'}, {from:'k', to:'rr'}, {from:'rr', to:'llm'}],
      steps:[
        {note:'Embed the question into a vector.', flow:[['u', 'e']], hl:['e']},
        {note:'Retrieve candidates from both a vector index (meaning) and a keyword index (exact terms, IDs, names).', flow:[['e', 'v', 'kNN'], ['u', 'k', 'BM25']], parallel:true},
        {note:'Fuse and re-rank the candidates; keep the best few chunks.', flow:[['v', 'rr'], ['k', 'rr']], parallel:true, hl:['rr']},
        {note:'Send the question + retrieved chunks to the LLM, instructing it to answer only from them and cite sources.', flow:[['rr', 'llm', 'context']], hl:['llm']}
      ]},
    deep:`<p><b>HNSW</b> (Malkov & Yashunin) builds a hierarchy of navigable small-world graphs: sparse upper layers for long jumps, dense lower layers for precision; search descends greedily, keeping a beam of ef candidates. Memory is the main cost (vectors + graph links); quantisation reduces it. <b>FAISS</b> (Meta) provides IVF, PQ and HNSW implementations; pgvector adds HNSW and IVFFlat to PostgreSQL.</p><p><b>RAG quality levers:</b> chunking (size, overlap, structure-aware), hybrid retrieval, re-ranking (cross-encoders), metadata filtering, freshness, and evaluation (retrieval recall, answer faithfulness). Guard against prompt injection in retrieved content and enforce document-level access control at retrieval time.</p>`
  },
  tradeoffs:{use:[`Semantic search, recommendations (“similar items”), deduplication, RAG over private documents`], avoid:[`Vector-only search for exact IDs, codes or rare names (combine with keyword search)`, `Unmeasured recall`, `Retrieval that ignores user permissions`], alt:[`BM25 alone for keyword-heavy domains`, `pgvector inside an existing Postgres for moderate scale`]},
  real:[
    {co:'HNSW', tier:'confirmed', text:'Hierarchical Navigable Small World graphs are among the best-performing ANN methods on public benchmarks and are implemented in FAISS, pgvector, Lucene and most vector databases.', src:'Malkov & Yashunin, IEEE TPAMI 2018 (arXiv 2016)'},
    {co:'Meta FAISS', tier:'confirmed', text:'An open-source library for efficient similarity search and clustering of dense vectors, including GPU implementations.', src:'Johnson, Douze & Jégou, “Billion-scale similarity search with GPUs” (2017); faiss GitHub'},
    {co:'RAG', tier:'confirmed', text:'Retrieval-augmented generation combines a retriever over a document index with a generator, improving factuality on knowledge-intensive tasks.', src:'Lewis et al., “Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks”, NeurIPS 2020'}
  ],
  mistakes:[`No recall evaluation`, `Mixing embeddings from different models/versions in one index`, `Leaking documents a user isn’t allowed to see into RAG context`],
  interview:[`Describe embed → ANN index → re-rank; mention hybrid retrieval and recall/latency tuning`],
  tryit:{note:'Click to place a query in a 2-D embedding space. Compare greedy graph search with brute force; tune the beam width.', mount:(host, api) => annDemo(host, api)},
  sources:[`Malkov & Yashunin (2018)`, `Johnson et al., FAISS (2017)`, `Lewis et al., NeurIPS 2020`]
},
{
  id:'recommendations', title:'Recommendation system basics', minutes:10, tags:['recommendations','collaborative filtering','content-based','two-tower','candidate generation','ranking'],
  summary:'Recommenders retrieve a few hundred candidates from millions (collaborative filtering, embeddings), then rank them with a richer model — balancing relevance, freshness and diversity.',
  problem:`<p>A food app has 300,000 dishes and 40 million users. The home screen has room for 20 suggestions, chosen in under 150 ms, different for every user and every time of day. Scoring every dish for every user with a big model is impossible — and new dishes with no history must still get a chance.</p>`,
  intuition:`A friend who knows food: “people who loved the biryani you ordered also loved this haleem” (collaborative filtering), “you like spicy and vegetarian, this is spicy and vegetarian” (content-based). A good friend also doesn’t suggest biryani ten times in a row (diversity) and sometimes suggests something new (exploration).`,
  how:{
    steps:[`<b>Collaborative filtering</b>: user-user or item-item similarity from interactions (“also bought”). Item-item is stable and cacheable.`, `<b>Matrix factorisation / embeddings</b>: learn user and item vectors whose dot product predicts affinity.`, `<b>Content-based</b>: item features (cuisine, price, tags, text) — essential for <b>cold start</b>.`, `<b>Two stages</b>: candidate generation (cheap: co-occurrence, ANN over embeddings — Module 8’s vector search) → <b>ranking</b> (a model with many features predicting click/order probability) → business rules (diversity, availability, sponsored slots).`, `Feedback loop: log impressions and outcomes; retrain; evaluate offline (recall@k, NDCG) and online (A/B tests).`, `Freshness: real-time features (what you clicked a minute ago) via streaming feature stores.`],
    diagram:{title:'Two-stage recommendation', w:780, h:260, alt:'Several candidate generators feed a ranking model and re-ranking rules before the home feed.',
      nodes:[{id:'u', type:'client', label:'Home screen', x:80, y:130}, {id:'c1', type:'service', label:'Item-item CF', x:300, y:45, w:130}, {id:'c2', type:'service', label:'Embedding ANN', x:300, y:130, w:140}, {id:'c3', type:'service', label:'Popular nearby', x:300, y:215, w:140}, {id:'rk', type:'service', label:'Ranking model', sub:'~500 → scored', x:520, y:130, w:140}, {id:'rr', type:'service', label:'Re-rank rules', sub:'diversity, stock', x:690, y:130, w:140}],
      edges:[{from:'u', to:'c1'}, {from:'u', to:'c2'}, {from:'u', to:'c3'}, {from:'c1', to:'rk'}, {from:'c2', to:'rk'}, {from:'c3', to:'rk'}, {from:'rk', to:'rr'}, {from:'rr', to:'u', curve:.35}],
      steps:[
        {note:'Several <b>candidate generators</b> each return a few hundred items from 300,000 — fast and approximate.', flow:[['u', 'c1'], ['u', 'c2'], ['u', 'c3']], parallel:true},
        {note:'A <b>ranking model</b> scores ~500 candidates with rich features (user history, time, distance, price).', flow:[['c1', 'rk'], ['c2', 'rk'], ['c3', 'rk']], parallel:true, hl:['rk']},
        {note:'<b>Re-ranking</b> applies diversity, availability and policy rules, then the top 20 are shown and logged for training.', flow:[['rk', 'rr'], ['rr', 'u', 'top 20']], hl:['rr']}
      ]},
    deep:`<p>Amazon’s item-to-item collaborative filtering (2003) precomputed similar-item tables offline, making online recommendation cheap regardless of catalogue size. YouTube’s deep-learning recommender (2016) split candidate generation (embedding retrieval over millions of videos) from ranking (a richer model over hundreds). The Netflix Prize (2006–2009) popularised matrix factorisation.</p><p><b>Pitfalls:</b> popularity bias and feedback loops (you only learn about what you show), position bias in training data, cold start, metric gaming (clickbait). Mitigate with exploration (bandits), counterfactual evaluation, and explicit diversity/novelty objectives.</p>`
  },
  tradeoffs:{use:[`Two-stage retrieval + ranking at any meaningful catalogue size`, `Item-item CF as a strong, simple baseline`, `Content features for cold start`], avoid:[`Scoring the full catalogue per request`, `Optimising only click-through (clickbait, filter bubbles)`], alt:[`Rule-based popularity and recency for small catalogues`]},
  real:[
    {co:'Amazon', tier:'confirmed', text:'Described item-to-item collaborative filtering, with similar-item tables computed offline so recommendations scale to huge catalogues.', src:'Linden, Smith & York, “Amazon.com Recommendations: Item-to-Item Collaborative Filtering”, IEEE Internet Computing 2003'},
    {co:'YouTube', tier:'confirmed', text:'Uses a two-stage design: deep candidate generation over millions of videos, then a ranking network over hundreds.', src:'Covington, Adams & Sargin, “Deep Neural Networks for YouTube Recommendations”, RecSys 2016'},
    {co:'Netflix Prize', tier:'confirmed', text:'A 2006–2009 competition to improve Netflix’s rating predictions by 10%, which advanced matrix-factorisation methods.', src:'Bennett & Lanning, “The Netflix Prize” (2007); Koren, Bell & Volinsky, IEEE Computer 2009'}
  ],
  mistakes:[`No logging of impressions (can’t learn from what wasn’t clicked)`, `Ignoring cold start for new items/users`, `Evaluating only offline`],
  interview:[`Draw candidate generation → ranking → re-ranking and name features and metrics`],
  tryit:{note:'Edit a small ratings matrix and get item-item collaborative-filtering recommendations with explanations.', mount:host => recDemo(host)},
  sources:[`Linden et al., IEEE Internet Computing 2003`, `Covington et al., RecSys 2016`, `Koren, Bell & Volinsky, IEEE Computer 2009`]
}
];

SDA.register({
  kind:'module', id:'search', order:8, level:'advanced', icon:'🔎', title:'Search & Special Structures',
  summary:'Inverted indexes, BM25 ranking, Elasticsearch at scale, tries for autocomplete, Bloom filters, HyperLogLog and Count-Min Sketch, geospatial indexes, time-series storage, vector search and RAG, and recommendation systems.',
  outcomes:['Build and query an inverted index; explain BM25 and two-stage ranking', 'Design autocomplete with precomputed top-k tries', 'Use Bloom filters, HyperLogLog and Count-Min Sketch with error/memory numbers', 'Index locations with geohash, quadtrees, S2 or H3', 'Design vector search, RAG and two-stage recommenders'],
  lessons,
  quiz:[
    {q:'What does an inverted index map?', options:['Documents → words', 'Words → documents containing them', 'Users → sessions', 'IDs → shards'], answer:1, why:'Postings lists per term.'},
    {q:'In BM25, what does the b parameter control?', options:['Term saturation', 'Document length normalisation', 'Number of shards', 'Boolean logic'], answer:1, why:'b = 0 disables length normalisation; b = 1 applies it fully.'},
    {q:'An updated document doesn’t appear in Elasticsearch results for ~1 second. Why?', options:['Replication bug', 'Refresh interval: near real-time search', 'Bloom filter false positive', 'DNS'], answer:1, why:'New segments become searchable at refresh.'},
    {q:'Why store top-k completions at each trie node?', options:['To save memory', 'So each keystroke is O(prefix length + k) instead of a subtree DFS', 'For security', 'To support deletes'], answer:1, why:'Short prefixes have huge subtrees.'},
    {q:'A Bloom filter says “probably present”. What do you know?', options:['It’s definitely present', 'It might be a false positive; confirm with a real lookup', 'It’s absent', 'The filter is broken'], answer:1, why:'No false negatives, but false positives happen.'},
    {q:'Roughly how many bits per item for a ~1% false-positive Bloom filter?', options:['1', '~10', '~100', '~1,000'], answer:1, why:'About 9.6 bits per item with optimal k.'},
    {q:'Count unique daily users per city with ~1% error in kilobytes. Use…', options:['A sorted list', 'HyperLogLog per city (mergeable)', 'Count-Min Sketch', 'A Bloom filter'], answer:1, why:'HLL estimates cardinality and merges across cities/days.'},
    {q:'Searching only your own geohash cell for nearby drivers fails because…', options:['Geohash is inaccurate', 'Very close drivers may sit just across a cell boundary with a different prefix', 'Cells are too big', 'It’s too slow'], answer:1, why:'Always include the 8 neighbouring cells.'},
    {q:'What does raising HNSW’s ef_search do?', options:['Lower recall, faster', 'Higher recall, slower', 'Adds vectors', 'Deletes the graph'], answer:1, why:'A wider beam explores more of the graph.'},
    {q:'Why do recommenders use candidate generation before ranking?', options:['Fashion', 'Scoring the whole catalogue with a rich model per request is too slow', 'To avoid ML', 'For SEO'], answer:1, why:'Cheap retrieval narrows millions to hundreds.'},
    {type:'scenario', q:'Design search for a food-delivery app: dishes and restaurants, typo-tolerant, ranked, filtered by location and veg/non-veg.', answer:'<ul><li><b>Source of truth</b> in Postgres; <b>CDC</b> into an Elasticsearch/OpenSearch index sharded by city (routing key), refresh 1 s.</li><li><b>Analysis:</b> lowercase, stemming, synonym/transliteration lists (biryani/biriyani), edge-n-grams or completion suggester for typeahead, fuzzy matching for typos.</li><li><b>Filtering:</b> geo_distance from the user, open-now, veg flag, deliverable polygon (precomputed serviceability).</li><li><b>Ranking:</b> BM25 on dish/restaurant fields with boosts → re-rank top 200 with a model (rating, ETA, price, conversion, personalisation); optional hybrid vector retrieval for vague queries.</li><li><b>Performance:</b> cache popular queries per area; autocomplete from a precomputed top-k trie per city with a trending layer.</li><li><b>Evaluate</b> with a judged query set (NDCG) and A/B tests on orders per search.</li></ul>'},
    {type:'scenario', q:'Show “X people viewed this today” on 10M product pages with minimal memory.', answer:'<p>Keep one <b>HyperLogLog per product per day</b> of viewer IDs (Redis PFADD; ~12 KB dense, much less sparse for small counts). Read with PFCOUNT (~0.8% error), merge days with PFMERGE for weekly numbers, expire old keys. For “top trending products”, maintain a <b>Count-Min Sketch + heap</b> of view counts in the streaming pipeline. Display rounded numbers (“1.2K viewed today”) — honest about approximation.</p>'}
  ],
  cheatsheet:[
    {h:'🔎 Text search', items:['Analyzer: tokenize, lowercase, stem, synonyms', 'Inverted index: term → sorted postings', 'AND = intersect, OR = union', 'BM25: IDF × saturated TF, length-normalised (k1=1.2, b=0.75)', 'Retrieve → re-rank with ML']},
    {h:'🧱 Elasticsearch', items:['Primary shards fixed; replicas for HA', 'Segments immutable; refresh ~1 s (NRT)', 'Query then fetch (scatter/gather)', 'search_after, not deep from/size', 'Feed via CDC; rebuildable']},
    {h:'⌨️ Autocomplete', items:['Trie/FST; O(prefix) lookup', 'Precompute top-k per node', 'Build offline from logs + trending layer', 'Edge cache hot prefixes; debounce client']},
    {h:'🎲 Probabilistic', items:['Bloom: no false negatives; ~10 bits/item → 1% FP', 'k ≈ (m/n)·ln2', 'HLL: 1.04/√m error; 12 KB ≈ 0.81%; mergeable', 'CMS: min over rows; over-count ≤ (e/w)·N']},
    {h:'🗺️ Geo & time', items:['Geohash prefix = cell; query cell + 8 neighbours', 'Quadtree adapts to density; S2 Hilbert; H3 hexagons', 'Locations in memory; rank by ETA', 'Time-series: blocks, Gorilla ~1.37 B/pt, rollups, retention']},
    {h:'🧠 Vectors & recs', items:['Embeddings: similar = near', 'ANN: HNSW (ef), IVF, PQ; measure recall', 'RAG: chunk → embed → retrieve (hybrid) → re-rank → LLM with citations', 'Recs: candidates → ranking → re-rank; cold start via content']}
  ],
  glossary:[
    {term:'Inverted index', def:'A map from each term to the list of documents that contain it.'},
    {term:'Postings list', aka:['postings'], def:'The sorted list of document IDs (and positions) for one term in an inverted index.'},
    {term:'Tokenization', aka:['analyzer', 'stemming'], def:'Splitting and normalising text (lowercasing, stemming, stopword removal) for indexing and queries.'},
    {term:'TF-IDF', def:'Term frequency × inverse document frequency: a classic relevance weighting.'},
    {term:'BM25', def:'A ranking function using IDF, saturating term frequency (k1) and document-length normalisation (b).'},
    {term:'Elasticsearch', aka:['OpenSearch'], def:'A distributed search and analytics engine built on Apache Lucene.'},
    {term:'Lucene', aka:['Apache Lucene'], def:'An open-source search library providing inverted indexes, scoring and segment-based storage.'},
    {term:'Segment (Lucene)', aka:['segments'], def:'An immutable piece of a Lucene index; new data creates new segments that are later merged.'},
    {term:'Near real-time search', aka:['refresh'], def:'Documents become searchable shortly after indexing, when a refresh opens a new segment.'},
    {term:'Learning to rank', def:'Using machine learning to order search results based on many features.'},
    {term:'PageRank', def:'An algorithm scoring web pages by the structure of links pointing to them.'},
    {term:'Trie', aka:['prefix tree'], def:'A tree where each node represents a string prefix, enabling fast prefix lookups.'},
    {term:'Autocomplete', aka:['typeahead'], def:'Suggesting completions for a partially typed query.'},
    {term:'Bloom filter', def:'A bit-array structure answering set membership with no false negatives and tunable false positives.'},
    {term:'False positive', def:'A wrong “yes” answer, e.g. a Bloom filter reporting an absent item as present.'},
    {term:'HyperLogLog', aka:['HLL'], def:'A probabilistic algorithm estimating the number of distinct items in small, mergeable memory.'},
    {term:'Count-Min Sketch', aka:['CMS'], def:'A sketch of counters across several hash rows that estimates item frequencies without under-counting.'},
    {term:'Heavy hitters', def:'The most frequent items in a data stream.'},
    {term:'Geohash', def:'Encoding latitude/longitude into a base32 string whose prefixes represent containing cells.'},
    {term:'Quadtree', def:'A tree recursively dividing 2-D space into four quadrants, adapting to point density.'},
    {term:'S2', def:'Google’s spherical geometry library indexing Earth cells along a Hilbert curve.'},
    {term:'H3', def:'Uber’s hierarchical hexagonal geospatial index.'},
    {term:'Haversine formula', aka:['haversine'], def:'Formula for great-circle distance between two points on a sphere.'},
    {term:'Time-series database', aka:['time-series', 'TSDB'], def:'A database optimised for timestamped measurements appended over time.'},
    {term:'Downsampling', aka:['rollup', 'rollups'], def:'Aggregating high-resolution data into coarser time buckets for long-term storage.'},
    {term:'Cardinality', def:'The number of distinct values — e.g. distinct users, or distinct time series in a metrics system.'},
    {term:'Embedding', aka:['embeddings', 'vector embedding'], def:'A numeric vector representation where similar items are close together.'},
    {term:'Vector search', aka:['semantic search', 'similarity search'], def:'Finding items whose embeddings are nearest to a query embedding.'},
    {term:'ANN', aka:['approximate nearest neighbour', 'approximate nearest neighbor'], def:'Approximate nearest-neighbour search: trading a little recall for large speed-ups.'},
    {term:'HNSW', def:'Hierarchical Navigable Small World graphs: a layered proximity-graph ANN index.'},
    {term:'Recall@k', aka:['recall'], def:'The fraction of true top-k results that a retrieval method returns.'},
    {term:'RAG', aka:['retrieval-augmented generation'], def:'Retrieving relevant documents and supplying them to a language model as context for its answer.'},
    {term:'Collaborative filtering', def:'Recommending items based on patterns of behaviour across many users.'},
    {term:'Cold start', def:'The difficulty of recommending for new users or items with no interaction history.'},
    {term:'Candidate generation', def:'The first, cheap stage of a recommender or search system that narrows millions of items to hundreds.'}
  ],
  sources:['Manning, Raghavan & Schütze, “Introduction to Information Retrieval”', 'Robertson & Zaragoza (2009); Brin & Page (1998)', 'Bloom (1970); Flajolet et al. (2007); Heule et al. (2013); Cormode & Muthukrishnan (2005)', 'Uber H3 (2018); s2geometry.io; Pelkonen et al., Gorilla (2015)', 'Malkov & Yashunin, HNSW (2018); Lewis et al., RAG (2020)', 'Linden et al. (2003); Covington et al. (2016)']
});
} catch(e){ console.error('[SDA] Module "search" failed to load', e); window.SDA && SDA.errors.push({id:'search', error:e}); }
})();
