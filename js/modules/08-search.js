
/* =====================================================================
   PART 5 · MODULE 8 — SEARCH & SPECIAL DATA STRUCTURES
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, sv, esc, clamp, fmtNum, fmtBytes} = SDA.u; const ui = SDA.ui;
const {sortGame} = SDA.m1helpers; const {fnv, css, frag} = SDA.ph;

const DOCS = ['Hidden Maps of Ancient Cities', 'A Garden for Every Season', 'The Secret Garden of Stars', 'Garden Stars: A Night Sky Guide', 'Forest Walks and Wildflowers', 'Cooking with Garden Herbs', 'Stars over the City', 'The Art of Small Gardens'];
const STOP = new Set(['with', 'and', 'the', 'a', 'of', 'extra']);
const tok = s => s.toLowerCase().split(/[^a-z]+/).filter(w => w && !STOP.has(w));

/* ---------- widgets ---------- */
function invertedDemo(host){
  const idx = new Map(); DOCS.forEach((d, i) => tok(d).forEach(t => { if (!idx.has(t)) idx.set(t, new Set()); idx.get(t).add(i); }));
  const inp = el('input', {class:'input', value:'garden stars', 'aria-label':'Book search query'}); let mode = 'and'; const out = el('div');
  function run(){
    const qt = [...new Set(tok(inp.value))]; const lists = qt.map(t => [t, [...(idx.get(t) || [])].sort((a, b) => a - b)]);
    let res = null; lists.forEach(([, l]) => { const s = new Set(l); res = res == null ? s : mode === 'and' ? new Set([...res].filter(x => s.has(x))) : new Set([...res, ...s]); });
    res = [...(res || [])].sort((a, b) => a - b);
    out.innerHTML = '';
    out.append(el('div', {class:'grid c2'},
      el('div', {class:'card'}, el('b', null, 'Book IDs for your words'), el('div', {class:'stack', style:{marginTop:'6px', gap:'4px'}}, ...(lists.length ? lists.map(([t, l]) => el('div', {class:'mono', style:{fontSize:'13px'}}, `${t} → [${l.map(i => 'book' + (i + 1)).join(', ') || 'none'}]`)) : [el('span', {class:'muted'}, 'Type book words')])), el('div', {class:'lab-hint', style:{marginTop:'6px'}}, mode === 'and' ? 'AND keeps book IDs found in every word list.' : 'OR keeps book IDs found in any word list.')),
      el('div', {class:'card'}, el('b', null, `Matching books (${res.length})`), el('div', {class:'stack', style:{marginTop:'6px', gap:'4px'}}, ...res.map(i => el('div', {style:{fontSize:'14px'}}, el('b', {class:'mono'}, `book${i + 1}: `), DOCS[i]))))));
    const all = [...idx.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    out.append(el('details', {style:{marginTop:'10px'}}, el('summary', null, `Full inverted index (${all.length} words)`), frag(h.table(['Word', 'Books'], all.map(([t, s]) => [`<b>${t}</b>`, [...s].map(i => 'book' + (i + 1)).join(', ')])))));
  }
  inp.addEventListener('input', run);
  host.append(el('div', {class:'ctl-grid'}, el('label', {class:'field'}, el('span', null, 'Query'), inp), ui.select({label:'Combine terms with', value:'and', options:[['and', 'AND (all words)'], ['or', 'OR (any word)']], onChange:v => { mode = v; run(); }}).el), el('ol', {class:'prose', style:{fontSize:'14px', margin:'10px 0'}, html:DOCS.map((d, i) => `<li>${esc(d)}</li>`).join('')}), out);
  run();
}
function bm25Demo(host){
  const P = {k1:1.2, b:.75}; const inp = el('input', {class:'input', value:'garden stars', 'aria-label':'Book search query'}); const out = el('div');
  const D = DOCS.map(tok); const N = D.length, avg = D.reduce((s, d) => s + d.length, 0) / N;
  const df = t => D.filter(d => d.includes(t)).length;
  function run(){
    const qt = [...new Set(tok(inp.value))];
    const rows = D.map((d, i) => { let bm = 0, tf_idf = 0; const parts = []; qt.forEach(t => { const tf = d.filter(x => x === t).length, n = df(t); if (!tf) return; const idf = Math.log(1 + (N - n + .5) / (n + .5)); const s = idf * tf * (P.k1 + 1) / (tf + P.k1 * (1 - P.b + P.b * d.length / avg)); bm += s; tf_idf += tf * Math.log(N / n); parts.push(`${t}: idf ${idf.toFixed(2)} × tf-part ${(s / idf).toFixed(2)} = ${s.toFixed(2)}`); }); return {i, bm, tf_idf, parts, len:d.length}; }).filter(r => r.bm > 0).sort((a, b) => b.bm - a.bm);
    out.innerHTML = '';
    out.append(frag(h.table(['Rank', 'Book title', 'Words', 'BM25', 'Breakdown', 'TF-IDF'], rows.map((r, k) => [String(k + 1), esc(DOCS[r.i]), String(r.len), `<b>${r.bm.toFixed(3)}</b>`, `<span class="lab-hint">${r.parts.join('<br>')}</span>`, r.tf_idf.toFixed(3)]), [2, 3, 5])));
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
      out.append(frag(`<div class="metrics"><div class="metric"><div class="ml">Distinct readers</div><div class="mv">${fmtNum(N)}</div></div><div class="metric"><div class="ml">HLL estimate</div><div class="mv">${fmtNum(E)}</div></div><div class="metric ${Math.abs(err) > 2 * se ? 'warn' : ''}"><div class="ml">Error</div><div class="mv">${err.toFixed(2)}<small>%</small></div></div><div class="metric"><div class="ml">Std error (1.04/√m)</div><div class="mv">±${se.toFixed(2)}<small>%</small></div></div><div class="metric"><div class="ml">HLL memory (6-bit registers)</div><div class="mv" style="font-size:18px">${fmtBytes(m * 6 / 8)}</div></div><div class="metric"><div class="ml">Exact reader IDs (8 B each)</div><div class="mv" style="font-size:18px">${fmtBytes(N * 8)}</div></div></div>`));
    }
    p.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Precision p (registers m = 2ᵖ)', min:4, max:16, step:1, value:12, fmt:v => `${v} (m = ${fmtNum(1 << v)})`, onInput:v => { P.p = v; run(); }}).el, ui.slider({label:'Distinct reader IDs', min:2, max:6.3, step:.1, value:5, fmt:v => fmtNum(Math.pow(10, v)), onInput:v => { P.n = v; run(); }}).el), el('div', {class:'controls', style:{margin:'8px 0'}}, ui.button('🎲 Re-run', run, 'sm')), out, el('p', {class:'lab-hint'}, 'Each reader ID is hashed into a small register. Rare patterns in the hashes help estimate how many different readers were seen. More registers use more memory and usually improve accuracy.'));
    run();
  }
  function cms(p){
    const P = {w:200, d:4}; const out = el('div');
    function run(){
      const ITEMS = 10000, EV = 100000; const cdf = []; let s = 0; for (let k = 1; k <= ITEMS; k++){ s += 1 / k; cdf.push(s); }
      const C = Array.from({length:P.d}, () => new Uint32Array(P.w)); const truth = new Map();
      for (let e = 0; e < EV; e++){ const r = Math.random() * s; let lo = 0, hi = ITEMS - 1; while (lo < hi){ const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; } const key = 'term' + lo; truth.set(key, (truth.get(key) || 0) + 1); for (let i = 0; i < P.d; i++) C[i][fnv(key + '#' + i) % P.w]++; }
      const est = k => Math.min(...C.map((row, i) => row[fnv(k + '#' + i) % P.w]));
      const top = [...truth.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8); const rare = [...truth.entries()].filter(x => x[1] <= 2).slice(0, 4);
      const bound = Math.E / P.w * EV;
      out.innerHTML = '';
      out.append(frag(h.table(['Search term', 'True count', 'CMS estimate', 'Over-count'], top.concat(rare).map(([k, v]) => { const e = est(k); return [k, fmtNum(v), fmtNum(e), e - v ? `<span style="color:${e - v > bound ? 'var(--bad)' : 'var(--warn)'}">+${fmtNum(e - v)}</span>` : '0']; }), [1, 2, 3])));
      out.append(el('div', {class:'verdict ok'}, `Memory: ${P.d} × ${P.w} counters = ${fmtBytes(P.d * P.w * 4)} vs ~${fmtNum(truth.size)} exact counters. Guarantee: estimate ≥ truth, and ≤ truth + (e/w)·N ≈ +${fmtNum(bound)} with probability ≥ ${(1 - Math.exp(-P.d)).toFixed(3)}. Heavy hitters are accurate; rare items are relatively inflated.`));
    }
    p.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Width w (counters per row)', min:20, max:2000, step:20, value:200, fmt:v => v, onInput:v => { P.w = v; run(); }}).el, ui.slider({label:'Depth d (hash functions)', min:1, max:8, step:1, value:4, fmt:v => v, onInput:v => { P.d = v; run(); }}).el), out, el('p', {class:'lab-hint'}, 'The sample uses 100,000 searches across 10,000 possible terms. Some terms are much more popular than others.'));
    run();
  }
}
function tsCalc(host){
  const P = {series:3.7, interval:15, raw:15, m1:true, h1:true};
  const out = el('div');
  function calc(){
    const S = Math.pow(10, P.series), ppd = S * 86400 / P.interval;
    const raw = ppd * P.raw, m1 = P.m1 ? S * 1440 * 90 : 0, h1 = P.h1 ? S * 24 * 730 : 0, pts = raw + m1 + h1;
    out.innerHTML = '';
    out.append(frag(h.table(['Tier', 'Resolution', 'Retention', 'Points stored'], [['Raw', P.interval + ' s', P.raw + ' days', fmtNum(raw)], ['Rollup', '1 min (min/max/avg/count)', P.m1 ? '90 days' : '—', fmtNum(m1)], ['Rollup', '1 hour', P.h1 ? '2 years' : '—', fmtNum(h1)]], [3])));
    out.append(frag(`<div class="metrics"><div class="metric"><div class="ml">Ingest rate</div><div class="mv">${fmtNum(ppd / 86400)}<small>pts/s</small></div></div><div class="metric"><div class="ml">Naive (16 B/point)</div><div class="mv">${fmtBytes(pts * 16)}</div></div><div class="metric"><div class="ml">Gorilla-style (~1.37 B/point)</div><div class="mv">${fmtBytes(pts * 1.37)}</div></div><div class="metric"><div class="ml">Keeping raw for 2 years instead</div><div class="mv">${fmtBytes(ppd * 730 * 1.37)}</div></div></div>`));
  }
  const S = (k, o) => ui.slider(Object.assign({value:P[k], onInput:v => { P[k] = v; calc(); }}, o)).el;
  host.append(el('div', {class:'ctl-grid'}, S('series', {label:'Branch measurement series', min:3, max:8, step:.1, fmt:v => fmtNum(Math.pow(10, v))}), S('interval', {label:'Seconds between readings', min:1, max:60, step:1, fmt:v => v + ' s'}), S('raw', {label:'Days to keep raw points', min:1, max:90, step:1, fmt:v => v + ' days'})), el('div', {class:'row', style:{gap:'16px', margin:'10px 0'}}, ui.toggle({label:'1-minute summaries for 90 days', checked:true, onChange:v => { P.m1 = v; calc(); }}).el, ui.toggle({label:'1-hour summaries for 2 years', checked:true, onChange:v => { P.h1 = v; calc(); }}).el), out);
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
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Beam width (ef)', min:1, max:30, step:1, value:4, fmt:v => v, onInput:v => { P.ef = v; search(); }}).el), el('div', {class:'row', style:{margin:'10px 0', gap:'14px'}}, ui.toggle({label:'Show graph edges', checked:false, onChange:v => { P.edges = v; draw(); }}).el, ui.button('🎲 New dataset', build, 'sm'), ui.button('🔁 Search again (new entry point)', search, 'sm')), box, el('div', {class:'legend', style:{margin:'8px 0'}}, el('span', {style:{color:'var(--accent1)'}}, '★ query (click to move)'), el('span', {style:{color:'var(--warn)'}}, '● visited by graph search'), el('span', {style:{color:'var(--accent2)'}}, '● graph search results'), el('span', {style:{color:'var(--ok)'}}, '○ true 5 nearest')), met.el, el('p', {class:'lab-hint'}, 'Each point links to five nearby points and two farther points. Graph search follows promising links toward the query. A larger beam checks more points and may find more true neighbours.'));
  build();
}
function recDemo(host){
  const U = ['Asha', 'Ravi', 'Meera', 'Kabir', 'Zoya', 'Dev'], I = ['Hidden Maps', 'Garden Seasons', 'Secret Stars', 'Night Sky', 'Forest Walks', 'Garden Herbs', 'City Stars', 'Small Gardens'];
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
    if (!preds.length) out.append(el('p', {class:'muted'}, 'Nothing left to recommend. Clear a rating to try again.'));
  }
  host.append(el('p', {class:'lab-hint', style:{marginTop:0}}, 'Click a user to select them; click a cell to cycle a rating (· = not rated, ★1–★5).'), grid, el('div', {style:{height:'10px'}}), out);
  render();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'inverted-index', title:'The inverted index', minutes:9, tags:['inverted index','postings','tokenization','full-text search'],
  summary:'An inverted index maps each word to the books that contain it. Search checks those lists instead of reading every book record.',
  problem:`<h3>A small example</h3><p>A public library has a large book catalogue.</p><ul><li>A reader searches for garden stars.</li><li>Many books contain garden.</li><li>Fewer contain both words.</li></ul><p>How can the catalogue find those books without checking every title?</p>`,
  intuition:`Think of the index at the back of a book. Each word points to pages where it appears. Here, words point to book IDs.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the words garden and stars through the catalogue.</p>',
    steps:[
      {icon:'📚', title:'Split the titles', text:'The catalogue turns each title into lowercase words. This is called tokenization.'},
      {icon:'🗂️', title:'Store word lists', text:'For garden, it stores the book IDs containing garden. This list is called a postings list.'},
      {icon:'🔎', title:'Look up both words', text:'The search fetches the lists for garden and stars.'},
      {icon:'🤝', title:'Find shared books', text:'For an AND search, it returns IDs found in both lists. The next lesson decides their order.'}
    ],
    diagram:{title:'Answering “garden stars”', w:760, h:240, alt:'The library searches the garden and stars lists, then keeps book IDs present in both.',
      nodes:[{id:'q', type:'client', label:'“garden stars”', x:90, y:120, w:140}, {id:'an', type:'service', label:'Word splitter', x:280, y:120, w:110}, {id:'p1', type:'db', label:'garden → 2,3,4,6,8', x:480, y:60, w:165}, {id:'p2', type:'db', label:'stars → 3,4,7', x:480, y:180, w:150}, {id:'r', type:'service', label:'Shared → 3,4', x:680, y:120, w:150}],
      edges:[{from:'q', to:'an'}, {from:'an', to:'p1'}, {from:'an', to:'p2'}, {from:'p1', to:'r'}, {from:'p2', to:'r'}],
      steps:[
        {note:'Split garden stars into two search words.', flow:[['q', 'an']], hl:['an']},
        {note:'Fetch the saved book ID list for each word.', flow:[['an', 'p1'], ['an', 'p2']], parallel:true},
        {note:'Book IDs 3 and 4 appear in both lists, so both match.', flow:[['p1', 'r'], ['p2', 'r']], parallel:true, hl:['r']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Printed book index', 'Library search'], [['Word in the index', 'Search word'], ['Page numbers', 'Book IDs'], ['Pages shared by two words', 'Books matching both words']])}</div><div class="callout tip"><b>Important point</b><p>The index finds possible matches. It does not decide which matching book should appear first.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Reader asks for', 'List operation'], [['Both words', 'Keep IDs in both lists'], ['Either word', 'Keep IDs from either list']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the catalogue has 1,000,000 books. Garden is in 20,000 of them and stars is in 3,000. Checking every title means 1,000,000 checks. With sorted lists, the search walks both lists once. That is at most 20,000 + 3,000 = 23,000 steps, or about 2.3% of the work.</p><h4>How it works inside</h4><p>Sorted IDs can be stored as gaps. The IDs 1000, 1005 and 1012 become 1000, 5 and 7. Small gaps need fewer bytes, so lists shrink a lot.</p><p>To match the exact phrase garden stars, each list also keeps word positions. A book matches if stars sits one place after garden.</p><h4>When it goes wrong</h4><p>Say the catalogue saves gardens as garden, but the query is not changed the same way. A reader who types gardens finds nothing. Titles and queries must pass through the same steps.</p>`
  },
  tradeoffs:{use:[`Use an inverted index for words in book titles and descriptions.`], avoid:[`Scanning every book title for each reader query.`, `Using the search copy as the only saved catalogue.`], alt:[`A smaller library can start with PostgreSQL full-text search.`]},
  real:[
    {co:'Apache Lucene', tier:'confirmed', text:'The open-source library behind Elasticsearch, OpenSearch and Solr, built on inverted indexes stored in immutable segments.', src:'Apache Lucene documentation'},
    {co:'PostgreSQL', tier:'confirmed', text:'Full-text search uses tsvector and tsquery with GIN indexes.', src:'PostgreSQL full text search documentation'}
  ],
  mistakes:[`Splitting book titles and reader queries with different rules.`, `Assuming a match list is already ranked.`, `Scanning every title as the catalogue grows.`],
  interview:[`Explain how garden and stars return book IDs 3 and 4.`, `Say what the index stores for each word.`],
  tryit:[{quiz:[{q:'What does the index store under garden?', options:['IDs of books containing garden', 'Every reader account', 'Only the newest book', 'A branch address'], answer:0, why:'Each word points to its matching book IDs.'}, {q:'How does an AND search use two lists?', options:['Keeps IDs in both', 'Deletes both lists', 'Keeps only the longer list', 'Reads every book again'], answer:0, why:'Both search words must appear in each returned book.'}]}, {note:'Search eight book titles and compare AND with OR.', mount:host => invertedDemo(host)}],
  sources:[`Manning, Raghavan & Schütze, “Introduction to Information Retrieval” (2008)`, `Apache Lucene documentation`]
},
{
  id:'bm25-ranking', title:'Ranking: TF-IDF, BM25 and beyond', minutes:10, tags:['TF-IDF','BM25','relevance','ranking','learning to rank'],
  summary:'TF-IDF and BM25 score matching books by how useful their words are. BM25 also limits repeated-word gains and accounts for text length.',
  problem:`<h3>A small example</h3><p>The reader searches for garden stars.</p><ul><li>Book 3 has both words in a short title.</li><li>Book 4 also has both words in a slightly longer title.</li><li>Many other books contain garden alone.</li></ul><p>Which matching book should appear first?</p>`,
  intuition:`A short book title about stars is a stronger clue than a long description that mentions stars once in passing.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>The index found matching books. Now give each match a score.</p>',
    steps:[
      {icon:'🔢', title:'Count each word', text:'Term frequency, or TF, counts how often a search word appears in a book record.'},
      {icon:'💎', title:'Value rare words', text:'Inverse document frequency, or IDF, gives more weight to words found in fewer books.'},
      {icon:'📏', title:'Check length', text:'BM25 stops long descriptions from winning merely because they contain more words.'},
      {icon:'🏁', title:'Order the matches', text:'Add each word’s contribution and show higher scores first. Library rules can then account for availability.'}
    ],
    stepper:{title:'Why BM25 beats raw counts', items:[
      {title:'Rare words', tag:'IDF', text:'Stars appears in fewer book titles than garden, so it can tell us more about a match.'},
      {title:'Repeated words', tag:'k1', text:'Seeing stars twice helps, but the gain gets smaller with each repeat. k1 controls that effect.'},
      {title:'Record length', tag:'b', text:'A match in a short title can count more than one buried in a long description. b controls that adjustment.'},
      {title:'Library needs', tag:'final order', text:'After text scoring, the catalogue may show an available copy ahead of an unavailable one.'}
    ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Clue in a book title', 'Ranking idea'], [['Rare word', 'Usually more informative'], ['Word repeated many times', 'Helpful, with a limit'], ['One word in a long record', 'Weaker clue than a focused short record']])}</div><div class="callout tip"><b>Important point</b><p>BM25 orders text matches. It does not know whether a library copy is available.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Need', 'Choice'], [['Find possible books', 'Inverted index'], ['Order text matches', 'BM25'], ['Prefer available copies', 'Apply a library rule after text scoring']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the catalogue has 1,000,000 books. Garden is in 20,000 and stars in 3,000. Lucene's IDF is ln(1 + (N − n + 0.5) ÷ (n + 0.5)). That gives about 3.9 for garden and about 5.8 for stars. The rarer word counts for more.</p><p>Now the repeat limit. With k1 = 1.2 and an average-length record, one match of a word scores 1.0 times its IDF. Two matches score 1.375 times. Ten matches score only 1.96 times. The most it can reach is 2.2 times.</p><h4>When it goes wrong</h4><p>The common defaults are k1 = 1.2 and b = 0.75. Setting b to 0 ignores length. Setting b to 1 adjusts fully. Short titles may deserve a lower b, since a long title is not always a worse match.</p><p>Scores from two different queries should not be compared. A 12 for one query does not mean a better match than a 7 for another.</p>`
  },
  tradeoffs:{use:[`Use BM25 to order the library’s matching titles.`, `Add availability as a separate library rule.`], avoid:[`Showing garden stars matches in database row order.`, `Tuning scores without checking example reader queries.`], alt:[`A small catalogue can start with a simple word-match score.`]},
  real:[
    {co:'Elasticsearch / Lucene', tier:'confirmed', text:'Use BM25 as the default similarity, with k1 = 1.2 and b = 0.75 by default.', src:'Elasticsearch similarity documentation'},
    {co:'Research', tier:'confirmed', text:'BM25 arises from the probabilistic relevance framework developed by Robertson, Spärck Jones and colleagues.', src:'Robertson & Zaragoza, “The Probabilistic Relevance Framework: BM25 and Beyond” (2009)'}
  ],
  mistakes:[`Treating garden and stars as equally informative in every catalogue.`, `Letting a long description win from one weak mention.`, `Assuming a high text score means the book is available.`],
  interview:[`Explain why rare search words can matter more.`, `Explain what k1 and b change in BM25.`],
  tryit:[{quiz:[{q:'Why can stars matter more than garden in this catalogue?', options:['It appears in fewer titles', 'It is always the first word', 'It is a longer word', 'Readers must type it twice'], answer:0, why:'A rarer word can narrow the result set more.'}, {q:'What does BM25 do with many repeats of one word?', options:['Gives smaller gains for later repeats', 'Always doubles the score', 'Deletes the book', 'Ignores the first mention'], answer:0, why:'BM25 limits the value of repeated mentions.'}]}, {note:'Score the library’s eight book titles. Change k1 and b to see how the order changes.', mount:host => bm25Demo(host)}],
  sources:[`Robertson & Zaragoza (2009)`, `Brin & Page (1998)`, `Manning et al., “Introduction to Information Retrieval”`]
},
{
  id:'elasticsearch', title:'Elasticsearch / Lucene at scale', minutes:9, tags:['Elasticsearch','OpenSearch','shards','segments','refresh','near real-time'],
  summary:'Elasticsearch splits a large search index into shards that can answer together. Lucene stores each shard, and a refresh makes recent changes searchable.',
  problem:`<h3>A small example</h3><p>The public library catalogue grows across many branches.</p><ul><li>Millions of book records are searchable.</li><li>Readers search from different cities.</li><li>A new title may take a short time to appear.</li></ul><p>How does the search service handle both the size and the delay?</p>`,
  intuition:`Imagine several catalogue desks. Each searches part of the collection and returns its best books. One desk combines those answers.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one garden stars search through three shards.</p>',
    steps:[
      {icon:'🧩', title:'Split the index', text:'Each shard holds some book records. Lucene manages the search index inside each shard.'},
      {icon:'📣', title:'Ask every shard', text:'A coordinating node sends garden stars to one copy of each shard.'},
      {icon:'🏆', title:'Combine results', text:'Each shard returns its best matches. The coordinator chooses the overall top books.'},
      {icon:'📖', title:'Fetch the books', text:'The coordinator fetches details for the winners and answers the reader.'},
      {icon:'⏱️', title:'Show recent edits', text:'A refresh opens new index data for search, which gives near real-time search. A saved title can appear after a short delay.'}
    ],
    diagram:{title:'A library query across shards', w:780, h:260, alt:'The coordinator asks three book index shards, combines their best matches, and fetches the winners.',
      nodes:[{id:'c', type:'client', label:'Search API', x:80, y:130}, {id:'co', type:'lb', label:'Coordinating node', x:270, y:130, w:150}, {id:'s0', type:'db', label:'Shard 0', sub:'replica on node B', x:520, y:50, w:150}, {id:'s1', type:'db', label:'Shard 1', sub:'primary on node C', x:520, y:130, w:150}, {id:'s2', type:'db', label:'Shard 2', sub:'replica on node A', x:520, y:210, w:150}],
      edges:[{from:'c', to:'co'}, {from:'co', to:'s0'}, {from:'co', to:'s1'}, {from:'co', to:'s2'}],
      steps:[
        {note:'The reader searches for garden stars.', flow:[['c', 'co', 'garden stars']], hl:['co']},
        {note:'The coordinator asks one copy of each shard for its best book matches.', flow:[['co', 's0'], ['co', 's1'], ['co', 's2']], parallel:true},
        {note:'It combines each shard’s answer into one ranked list.', flow:[['s0', 'co', 'top books'], ['s1', 'co', 'top books'], ['s2', 'co', 'top books']], parallel:true},
        {note:'It fetches the winning book details and answers the reader.', flow:[['co', 's1', 'fetch books'], ['s1', 'co'], ['co', 'c', 'results']], hl:['c']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Catalogue desks', 'Search service'], [['Part of the collection', 'Shard'], ['Spare copy of a desk’s records', 'Replica'], ['Desk combining answers', 'Coordinating node']])}</div><div class="callout tip"><b>Important point</b><p>The main library database remains the saved record. Search can be rebuilt from it.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Need', 'Choice'], [['More book records', 'Divide the index into suitable shards'], ['A shard machine stops', 'Ask a replica'], ['Recently edited title', 'Wait for refresh or read the main database']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the index has 10 shards and a reader wants page 1 with 10 books. Each shard returns its best 10. The coordinator merges 10 × 10 = 100 candidates and keeps 10.</p><p>Now say the reader jumps to page 1,000. The app asks to skip 9,990 books and show 10. Each shard must return 10,000 candidates. The coordinator sorts 10 × 10,000 = 100,000. By default, Elasticsearch refuses requests that reach past 10,000 results.</p><h4>How it works inside</h4><p>The default refresh is once every second. That is why a new title appears about a second later, not at once. Between refreshes, a transaction log protects new writes if the machine crashes.</p><h4>When it goes wrong</h4><p>The number of main shards is fixed when the index is created. Say a 300 GB index is split into 10 shards of 30 GB. A common rule of thumb is 10 to 50 GB per shard. One replica doubles the disk use to 600 GB.</p>`
  },
  tradeoffs:{use:[`Use shards when the book index outgrows one machine.`, `Use replicas so a shard remains searchable after a machine stops.`], avoid:[`Creating thousands of tiny book shards.`, `Treating search as the only saved catalogue.`], alt:[`A modest library can keep full-text search in PostgreSQL.`]},
  real:[
    {co:'Elasticsearch', tier:'confirmed', text:'A refresh makes newly indexed documents visible to search after a short delay.', src:'Elasticsearch refresh documentation'},
    {co:'Wikipedia', tier:'confirmed', text:'Wikimedia’s on-wiki search (CirrusSearch) is built on Elasticsearch.', src:'MediaWiki CirrusSearch extension documentation'}
  ],
  mistakes:[`Expecting a new book title to be searchable at once.`, `Choosing too many tiny shards for the catalogue.`, `Keeping no path to rebuild the index.`],
  interview:[`Trace garden stars across three shards.`, `Explain why a saved title may appear later in search.`],
  tryit:{quiz:[
    {q:'A librarian changes a title but search briefly shows the old one. Why?', options:['The next refresh has not opened the change yet', 'The book was never saved', 'DNS changed the title', 'The reader typed too slowly'], answer:0, why:'Searchable segments are opened on refresh.'},
    {q:'How does a query run across 3 shards?', options:['Only on shard 0', 'Scatter to all shards, gather top-k from each, merge, then fetch', 'Sequentially until a match', 'Random shard'], answer:1, why:'Query-then-fetch.'},
    {q:'Why can a very deep search page be costly?', options:['It is always free', 'Each shard may send many earlier candidates to merge', 'The book has too many pages', 'The reader has many loans'], answer:1, why:'Cursor-based paging avoids large offsets.'}
  ]},
  sources:[`Elasticsearch reference documentation`, `Apache Lucene documentation`, `Gormley & Tong, “Elasticsearch: The Definitive Guide”`]
},
{
  id:'tries-autocomplete', title:'Autocomplete with tries', minutes:9, tags:['trie','autocomplete','typeahead','prefix','top-k'],
  summary:'A trie groups words by the letters they share at the start. Autocomplete can follow typed letters and return saved suggestions for that prefix.',
  problem:`<h3>A small example</h3><p>A reader types gar into the library search box.</p><ul><li>Garden Seasons is a possible book.</li><li>Garden Herbs is another.</li><li>The catalogue has many other titles.</li></ul><p>How can suggestions appear after each keystroke without scanning every title?</p>`,
  intuition:`A dictionary lets you jump to G, then GA, then GAR. A note at GAR could list the most useful matching titles.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Watch the prefix grow as the reader types.</p>',
    steps:[
      {icon:'⌨️', title:'Type a prefix', text:'The reader types g, then ga, then gar.'},
      {icon:'🌳', title:'Follow trie edges', text:'A trie is a tree of letter paths. The search follows the path for gar.'},
      {icon:'📌', title:'Read saved suggestions', text:'The gar node stores a few popular book titles starting with gar.'},
      {icon:'🔄', title:'Refresh the list', text:'A background job updates popular suggestions from completed library searches.'}
    ],
    diagram:{title:'Typeahead serving path', w:780, h:250, alt:'The client sends prefixes to a typeahead service backed by an in-memory trie built offline from query logs.',
      nodes:[{id:'c', type:'client', label:'Search box', x:80, y:120}, {id:'cdn', type:'cdn', label:'Edge cache', sub:'hot prefixes', x:250, y:120, w:120}, {id:'t', type:'service', label:'Typeahead svc', sub:'in-memory trie', x:450, y:120, w:150}, {id:'lg', type:'queue', label:'Query logs', x:450, y:225, w:120}, {id:'b', type:'service', label:'Builder job', sub:'hourly top-k', x:650, y:225, w:130}],
      edges:[{from:'c', to:'cdn'}, {from:'cdn', to:'t'}, {from:'c', to:'lg', dashed:true, curve:.2}, {from:'lg', to:'b'}, {from:'b', to:'t', curve:.2}],
      steps:[
        {note:'The reader types g. A saved answer for this common prefix may be at the edge cache.', flow:[['c', 'cdn', 'g'], ['cdn', 'c', 'top books']], hl:['cdn']},
        {note:'For gar, the service follows g, a, and r in the trie and returns matching titles.', flow:[['c', 'cdn', 'gar'], ['cdn', 't'], ['t', 'c', 'Garden Seasons']], hl:['t']},
        {note:'Completed searches help a background job refresh the saved suggestions.', flow:[['c', 'lg', 'searched'], ['lg', 'b'], ['b', 't', 'new trie']], hl:['b']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Dictionary', 'Library trie'], [['Letter tabs', 'Paths for typed letters'], ['Sticky note on GAR', 'Top book suggestions for gar']])}</div><div class="callout tip"><b>Important point</b><p>Finding the gar node is fast. Finding the best titles below it also needs a prepared list.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Situation', 'Action'], [['Reader types gar', 'Follow three letter edges'], ['Many titles begin with g', 'Use saved top suggestions'], ['Popular searches change', 'Rebuild the lists in the background']])}</div>`,
    deep:`<h4>The numbers</h4><p>Finding the gar node takes 3 steps, whether the catalogue has 1,000 titles or 1,000,000. Now the saved suggestions. Say a trie has 500,000 nodes and each keeps 5 book IDs of 4 bytes each. That is 500,000 × 5 × 4 = 10,000,000 bytes, or 10 MB.</p><p>Updating costs more. When Garden Seasons becomes popular, the job must touch every prefix node of its title. That title has 14 characters, so it touches 14 nodes.</p><h4>How it works inside</h4><p>A compressed trie joins nodes that have only one way forward. If no other title shares the letters, the 6 nodes for g, a, r, d, e and n become one edge labelled garden.</p><h4>When it goes wrong</h4><p>Prefix lookup cannot fix typos. A reader who types gardan has no gar path to the right word, and prefix lookup will not help. Edit distance counts the letter changes between two words. Garden and gardan differ by 1 change, so a typo check can still suggest garden.</p>`
  },
  tradeoffs:{use:[`Use a trie for book title suggestions as readers type.`], avoid:[`Scanning every book title after each letter.`, `Walking a huge g subtree to rank every suggestion.`], alt:[`Use the search engine’s built-in completion suggester.`]},
  real:[
    {co:'Elasticsearch completion suggester', tier:'confirmed', text:'Uses compact in-memory structures for weighted prefix completions.', src:'Elasticsearch completion suggester documentation'},
    {co:'Google Autocomplete', tier:'confirmed', text:'Google says its predictions reflect real searches and apply content policies.', src:'Google Search Help, how autocomplete works'}
  ],
  mistakes:[`Walking every title below g after each keystroke.`, `Showing old suggestions without rebuilding their popularity.`, `Sending a request for every letter while someone types quickly.`],
  interview:[`Explain the path for gar.`, `Explain why each prefix stores a short suggestion list.`],
  tryit:[{quiz:[{q:'What does the gar trie node represent?', options:['Titles starting with gar', 'Every book in the library', 'Only books with gar at the end', 'A branch address'], answer:0, why:'The path from the root spells the prefix.'}, {q:'Why save top titles at each node?', options:['To avoid scanning all titles below a short prefix', 'To delete unpopular books', 'To change book IDs', 'To count branch visits'], answer:0, why:'A short prefix can have many possible completions.'}]}, {note:'Type a library search such as gar and compare saved suggestions with checking every matching title.', pg:'trie'}],
  sources:[`Fredkin, Trie Memory (1960)`, `Elasticsearch completion suggester documentation`, `Alex Xu, System Design Interview, search autocomplete chapter`]
},
{
  id:'bloom-filters', title:'Bloom filters', minutes:9, tags:['Bloom filter','false positive','probabilistic','set membership'],
  summary:'A Bloom filter quickly says a book ID is definitely absent or might be present. A possible match still needs a real lookup.',
  problem:`<h3>A small example</h3><p>A branch keeps book records in several files on disk.</p><ul><li>A reader asks for a book ID.</li><li>Most files do not contain it.</li><li>Opening every file is slow.</li></ul><p>Can the branch skip files that definitely lack this book?</p>`,
  intuition:`Imagine a small checklist of marks. One missing mark proves the book was never added. All marks present only suggest that it might be there.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Use a Bloom filter before opening one branch file.</p>',
    steps:[
      {icon:'⬜', title:'Start with empty bits', text:'The filter has a small row of zeros.'},
      {icon:'📚', title:'Add a book ID', text:'Several hash functions choose bit positions for that ID and set them to one.'},
      {icon:'❌', title:'Check for absence', text:'If even one chosen bit is zero, that book ID was never added to this filter.'},
      {icon:'🔍', title:'Confirm a possible match', text:'If all chosen bits are one, open the file. Other book IDs may have set those bits by chance.'}
    ],
    stepper:{title:'Insert and query with k = 3', items:[
      {title:'Add book A', tag:'set bits', text:'Its hashes set bits 3, 11, and 20.'},
      {title:'Add book B', tag:'set bits', text:'Its hashes set bits 7, 11, and 25. Sharing bit 11 is normal.'},
      {title:'Check book C', tag:'absent', text:'Its hashes check bits 3, 14, and 25. Bit 14 is zero, so skip this file.'},
      {title:'Check book D', tag:'maybe', text:'Its bits are all one by chance. Open the file to confirm whether book D is there.'}
    ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Checklist result', 'Branch action'], [['A mark is missing', 'Skip this book file'], ['All marks are present', 'Open the file and check']])}</div><div class="callout tip"><b>Important point</b><p>A Bloom filter can give a false yes, called a false positive. It cannot give a false no for IDs already added.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Choice'], [['Skip many absent book IDs', 'Bloom filter before disk lookup'], ['Know for sure a book is present', 'Read the real branch file'], ['Remove book IDs often', 'Rebuild or use another filter type']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say a branch has 1,000,000 book IDs. At 9.6 bits for each ID, the filter needs 9,600,000 bits. That is 9,600,000 ÷ 8 = 1,200,000 bytes, or 1.2 MB. With 7 hash functions, the false-positive rate is about 1%.</p><p>Say a book could be in any of 10 files, and it is in exactly 1. Without a filter, the branch opens up to 10 files. With one filter for each file, it opens the real one plus about 9 × 0.01 = 0.09 extra. That is about 1.09 files.</p><h4>When it goes wrong</h4><p>Say the filter was built for 1,000,000 IDs but now holds 2,000,000. That leaves 4.8 bits for each ID. With the same 7 hashes, the false-positive rate rises to about 16%. Roughly 1 in 6 absent books now causes a wasted file read. Build a bigger filter when the file grows.</p>`
  },
  tradeoffs:{use:[`Use a Bloom filter to avoid opening branch files that lack a book ID.`], avoid:[`Treating a possible match as proof the book is present.`, `Keeping a stale filter after adding books to its file.`], alt:[`Use an exact in-memory set if the branch inventory is small.`]},
  real:[
    {co:'Google Bigtable', tier:'confirmed', text:'Lets clients enable Bloom filters per locality group to avoid disk reads for SSTables that don’t contain a row/column.', src:'Chang et al., “Bigtable”, OSDI 2006'},
    {co:'Burton Bloom', tier:'confirmed', text:'Introduced the structure in 1970 for space-efficient membership tests with allowable errors.', src:'Bloom, “Space/Time Trade-offs in Hash Coding with Allowable Errors”, CACM 1970'}
  ],
  mistakes:[`Treating a possible match as confirmed inventory.`, `Adding books to a file without updating its filter.`, `Clearing shared bits when one book is removed.`],
  interview:[`Explain why one zero bit lets the branch skip a file.`, `Explain why all one bits still need a real lookup.`],
  tryit:[{quiz:[{q:'One checked bit is zero. What can the branch conclude?', options:['The book ID is absent from this filter', 'The book is definitely present', 'Every file has the book', 'The filter must be deleted'], answer:0, why:'An inserted ID would have set every one of its chosen bits.'}, {q:'All checked bits are one. What next?', options:['Open the file to confirm', 'Promise the book is there', 'Clear the bits', 'Skip every file'], answer:0, why:'Other IDs can create a false positive.'}]}, {note:'Check a saved book ID, then add many IDs and watch possible matches become more common.', pg:'bloom'}],
  sources:[`Bloom, CACM 1970`, `Broder & Mitzenmacher, “Network Applications of Bloom Filters: A Survey” (2004)`]
},
{
  id:'hll-cms', title:'HyperLogLog and Count-Min Sketch', minutes:10, tags:['HyperLogLog','Count-Min Sketch','cardinality','heavy hitters','probabilistic'],
  summary:'HyperLogLog estimates how many different readers visited. Count-Min Sketch estimates how often each search term appeared.',
  problem:`<h3>A small example</h3><p>The library has busy branches and a large search history.</p><ul><li>It wants one count of distinct readers across branches.</li><li>One reader may visit several branches.</li><li>It also wants to spot popular search terms.</li></ul><p>How can it keep useful counts without storing every ID and term in memory?</p>`,
  intuition:`A compact headcount can estimate different visitors. A small set of tally sheets can estimate how often each search term appeared.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Use one compact method for distinct readers and another for frequent searches.</p>',
    steps:[
      {icon:'👤', title:'Count unique readers', text:'Each branch adds reader IDs to a HyperLogLog, or HLL, which estimates distinct IDs.'},
      {icon:'🤝', title:'Merge branch counts', text:'The library merges the branch HLLs. A reader visiting twice still counts about once.'},
      {icon:'🔎', title:'Track search terms', text:'Each search term updates several small counter rows in a Count-Min Sketch, or CMS.'},
      {icon:'📊', title:'Estimate popularity', text:'The CMS reads the smallest matching counter. Collisions can make its answer too high, never too low.'}
    ],
    diagram:{title:'Distinct library readers across branches', w:760, h:240, alt:'Three branches merge their HLL estimates for a combined distinct-reader estimate.',
      nodes:[{id:'a', type:'service', label:'Central HLL', sub:'12 KB', x:100, y:50, w:130}, {id:'b', type:'service', label:'North HLL', sub:'12 KB', x:100, y:125, w:130}, {id:'c', type:'service', label:'South HLL', sub:'12 KB', x:100, y:200, w:130}, {id:'m', type:'service', label:'Merge HLLs', x:400, y:125, w:190}, {id:'r', type:'db', label:'Readers ≈ 41,200', sub:'about 0.8% error', x:650, y:125, w:170}],
      edges:[{from:'a', to:'m'}, {from:'b', to:'m'}, {from:'c', to:'m'}, {from:'m', to:'r'}],
      steps:[
        {note:'Each branch adds today’s reader IDs to its HLL.', hl:['a', 'b', 'c']},
        {note:'Merge the HLLs so a reader who visited two branches is counted about once.', flow:[['a', 'm'], ['b', 'm'], ['c', 'm']], parallel:true},
        {note:'The library gets one estimate from three small sketches.', flow:[['m', 'r']], hl:['r']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Library question', 'Compact method'], [['How many different readers?', 'HyperLogLog'], ['How often was garden searched?', 'Count-Min Sketch']])}</div><div class="callout tip"><b>Important point</b><p>Both give estimates. Use exact records when the count must be exact, such as fines or payments.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Choice'], [['Merge unique readers across branches', 'HLL'], ['Estimate searches for each term', 'CMS'], ['Exact book loan count', 'Main database']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say one branch has 10 million different reader IDs at 8 bytes each. Storing them takes 80 MB. A dense HLL with 16,384 registers takes about 12 KB. Its error is 1.04 ÷ √16,384 = 1.04 ÷ 128 = 0.81%. For a true count of 1,000,000, that is about 8,100 either way, in about two out of three cases.</p><p>For CMS, say you want an error of at most 0.1% of all searches, with 99% confidence. You need about 2,719 counters in each row and 5 rows. That is 2,719 × 5 = 13,595 counters. At 4 bytes each, it is about 54 KB.</p><h4>When it goes wrong</h4><p>With 10 million searches in total, a 0.1% error is up to 10,000. That is fine for garden, searched a million times. It swamps a term searched 50 times. CMS is for heavy hitters, not rare terms.</p><p>HLL can merge counts, but cannot say whether reader 7 visited.</p>`
  },
  tradeoffs:{use:[`Use HLL for approximate distinct library readers.`, `Use CMS for frequent library search terms.`], avoid:[`Using estimates to charge library fines.`, `Treating a CMS estimate for a rare term as exact.`], alt:[`Keep an exact set when the number of readers is small enough.`]},
  real:[
    {co:'Redis', tier:'confirmed', text:'HyperLogLog commands estimate distinct counts with about 0.81% standard error using at most 12 KB per dense key.', src:'Redis HyperLogLog documentation'},
    {co:'Research', tier:'confirmed', text:'Count-Min Sketch provides frequency estimates with one-sided error bounds in sublinear space.', src:'Cormode & Muthukrishnan, J. Algorithms 2005'}
  ],
  mistakes:[`Showing an estimate as an exact reader total.`, `Using CMS alone to discover which terms are most popular.`, `Choosing too little CMS width for many search terms.`],
  interview:[`Choose HLL for distinct readers and CMS for term frequency.`, `Explain why a CMS count can be too high.`],
  tryit:[{quiz:[{q:'Which method estimates different readers across branches?', options:['HyperLogLog', 'Count-Min Sketch', 'Bloom filter alone', 'A trie'], answer:0, why:'HLL estimates distinct IDs and can merge branch sketches.'}, {q:'Why can a CMS term count be too high?', options:['Different terms share counters', 'The library has two branches', 'The term is too short', 'The reader has a card'], answer:0, why:'Hash collisions add to the same counters.'}]}, {note:'Compare HLL reader estimates and CMS search-term estimates as you change their memory sizes.', mount:host => sketchDemo(host)}],
  sources:[`Flajolet et al., “HyperLogLog” (2007)`, `Heule, Nunkesser & Hall, “HyperLogLog in Practice” (EDBT 2013)`, `Cormode & Muthukrishnan (2005)`]
},
{
  id:'geospatial', title:'Geospatial indexing: geohash, quadtrees, S2 and H3', minutes:11, tags:['geohash','quadtree','S2','H3','nearby search','geospatial'],
  summary:'A geospatial index groups places by map area. The library can find nearby branches without checking every branch location.',
  problem:`<h3>A small example</h3><p>A reader wants to borrow Garden Seasons today.</p><ul><li>Several branches have copies.</li><li>The reader shares their location.</li><li>A nearby branch may sit just across a map-cell border.</li></ul><p>How can the app find nearby branches without missing that one?</p>`,
  intuition:`Divide a city map into labelled squares. Search the reader’s square and nearby squares before measuring exact distances.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Find branch candidates first, then check the exact distance and copy status.</p>',
    steps:[
      {icon:'🗺️', title:'Place branches in cells', text:'A geohash gives each branch a map-cell code. Nearby branches often share a code prefix.'},
      {icon:'📍', title:'Locate the reader', text:'The app finds the cell containing the reader.'},
      {icon:'🔎', title:'Search nearby cells', text:'It checks that cell and its eight neighbours so a border does not hide a close branch.'},
      {icon:'📏', title:'Measure candidates', text:'It measures distance to the few branches found and checks which has the book.'},
      {icon:'🏁', title:'Show useful choices', text:'The app returns nearby branches with available copies.'}
    ],
    diagram:{title:'Finding a nearby library branch', w:780, h:250, alt:'Branch locations enter a cell index. A reader query checks nearby cells and book availability.',
      nodes:[{id:'d', type:'client', label:'Branches', sub:'locations', x:80, y:70, w:120}, {id:'r', type:'client', label:'Reader app', x:80, y:190, w:120}, {id:'ls', type:'service', label:'Location service', x:300, y:70, w:150}, {id:'ix', type:'cache', label:'Branch cell index', sub:'cell to branches', x:530, y:130, w:180}, {id:'m', type:'service', label:'Branch finder', x:300, y:190, w:120}],
      edges:[{from:'d', to:'ls'}, {from:'ls', to:'ix'}, {from:'r', to:'m'}, {from:'m', to:'ix'}],
      steps:[
        {note:'The app adds each branch location to its map cell.', flow:[['d', 'ls', 'location'], ['ls', 'ix', 'cell code']], hl:['ix']},
        {note:'The reader asks for Garden Seasons. Check the reader’s cell and eight neighbours.', flow:[['r', 'm', 'find book'], ['m', 'ix', 'nearby cells']], hl:['m']},
        {note:'Measure the candidate branch distances and show branches with copies.', flow:[['ix', 'm', 'candidate branches']], hl:['m']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Paper map', 'Library search'], [['Map square label', 'Geohash cell'], ['Adjacent squares', 'Neighbour cells'], ['Ruler measurement', 'Distance to candidate branches']])}</div><div class="callout tip"><b>Important point</b><p>A close branch can have a different cell code. Check neighbouring cells before choosing candidates.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Map need', 'Structure'], [['Simple labelled cells', 'Geohash'], ['More detail in dense areas', 'Quadtree'], ['Earth-wide cell systems', 'S2 or H3']])}</div>`,
    deep:`<h4>The numbers</h4><p>Each geohash character adds 5 bits of location detail. A 4-character cell is about 39 km by 19.5 km. A 5-character cell is about 4.9 km by 4.9 km. A 6-character cell is about 1.2 km by 0.6 km. Longer codes mean smaller cells.</p><p>Say a reader wants branches within 3 km. A 5-character cell is 4.9 km wide, which is wider than 3 km. So the cell plus its 8 neighbours cover every point within 3 km of the reader. A 6-character cell is too small for this, and would need more cells.</p><h4>When it goes wrong</h4><p>Two points a few metres apart can have very different codes. This happens across the 0 degree longitude line and the 180 degree line. Neighbour lookup must handle those wraps.</p><p>Cell width also changes with latitude. A cell near the equator is wider than one near the poles. H3 hexagons make all 6 neighbours the same distance away.</p>`
  },
  tradeoffs:{use:[`Use geohash cells to narrow the library’s branch search.`, `Measure real distance after finding candidates.`], avoid:[`Searching only the reader’s cell.`, `Showing a close branch without checking book availability.`], alt:[`A small library network can calculate distance to every branch directly.`]},
  real:[
    {co:'Uber H3', tier:'confirmed', text:'Uber open-sourced H3 in 2018, a hierarchical hexagonal grid used for analysing and optimising marketplace dynamics such as pricing and dispatch.', src:'Uber Engineering, “H3: Uber’s Hexagonal Hierarchical Spatial Index” (2018)'},
    {co:'Google S2', tier:'confirmed', text:'The S2 Geometry library maps the sphere to cube faces and orders cells along a Hilbert curve.', src:'S2 Geometry documentation'}
  ],
  mistakes:[`Ignoring branches across a cell border.`, `Assuming cell proximity is the same as travel time.`, `Forgetting to check whether a branch has the book.`],
  interview:[`Explain why the reader’s cell alone can miss a close branch.`, `Compare geohash and quadtree for library branches.`],
  tryit:[{quiz:[{q:'Why search eight neighbouring cells too?', options:['A close branch may cross a cell border', 'Every branch has nine addresses', 'A book has nine copies', 'It changes the reader’s location'], answer:0, why:'Cell borders can separate nearby points.'}, {q:'What should happen after cell lookup?', options:['Measure candidate distances and check copies', 'Return every branch in the country', 'Ignore book availability', 'Delete old cells'], answer:0, why:'Cells only narrow the candidate set.'}]}, {note:'Place a reader on the branch map and see what changes when neighbouring cells are included.', pg:'geo'}],
  sources:[`Gustavo Niemeyer, geohash.org (2008)`, `Samet, “The Quadtree and Related Hierarchical Data Structures” (1984)`, `s2geometry.io; h3geo.org`]
},
{
  id:'time-series', title:'Time-series data', minutes:8, tags:['time-series','downsampling','retention','Gorilla','Prometheus'],
  summary:'Time-series data is a sequence of measurements with times. Store recent detail and older summaries so long-range charts remain useful.',
  problem:`<h3>A small example</h3><p>The library measures search performance at its branches.</p><ul><li>500 branches each send 10 measurements.</li><li>Each measurement arrives every 15 seconds.</li><li>Staff need recent detail and year-long trends.</li></ul><p>How can the library keep the charts without storing every raw point forever?</p>`,
  intuition:`Think of a daily logbook. Keep every reading for recent days, then keep weekly summaries for older periods.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one branch’s search response time measurements.</p>',
    steps:[
      {icon:'⏱️', title:'Record timed points', text:'Each branch sends a time and a value, such as average search response time.'},
      {icon:'📦', title:'Group by time', text:'The store collects nearby points into time blocks, so a chart can read the needed period.'},
      {icon:'🗜️', title:'Compress recent detail', text:'Close values and regular times often need fewer bytes than full independent records.'},
      {icon:'📊', title:'Keep older summaries', text:'A rollup stores one-minute or one-hour summaries after detailed points age out.'},
      {icon:'🧹', title:'Remove old blocks', text:'A retention rule drops expired raw blocks while keeping the longer summaries.'}
    ],
    diagram:{title:'Branch measurements over time', w:760, h:230, alt:'Branch measurements enter recent storage, then compressed blocks and older summaries for charts.',
      nodes:[{id:'a', type:'client', label:'Branch monitors', x:80, y:115, w:140}, {id:'hd', type:'cache', label:'Recent points', sub:'last 2 h', x:290, y:115, w:150}, {id:'bl', type:'db', label:'Compressed blocks', sub:'raw 15 days', x:490, y:60, w:150}, {id:'ru', type:'db', label:'Summaries', sub:'1 min, 1 h', x:490, y:180, w:130}, {id:'q', type:'client', label:'Staff charts', x:690, y:115, w:120}],
      edges:[{from:'a', to:'hd'}, {from:'hd', to:'bl'}, {from:'bl', to:'ru'}, {from:'q', to:'bl'}, {from:'q', to:'ru'}],
      steps:[
        {note:'Branch monitors send timed measurements into recent storage.', flow:[['a', 'hd', '5,000 series']], hl:['hd']},
        {note:'Recent points become compressed time blocks.', flow:[['hd', 'bl', 'compress']], hl:['bl']},
        {note:'A background job makes older summaries from raw blocks.', flow:[['bl', 'ru', 'summarize']], hl:['ru']},
        {note:'Staff charts use raw points for today and summaries for last year.', flow:[['q', 'bl', 'today'], ['q', 'ru', 'last year']], parallel:true}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Logbook', 'Library metrics'], [['Each reading', 'One timed measurement'], ['Detailed recent pages', 'Raw recent points'], ['Monthly summary', 'Older rollup']])}</div><div class="callout tip"><b>Important point</b><p>A summary cannot answer every question about the original points. Keep raw data as long as detailed questions need it.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Chart', 'Read from'], [['Today’s search delays', 'Recent raw points'], ['Year-long branch trend', 'Hourly summaries']])}</div>`,
    deep:`<h4>The numbers</h4><p>There are 28.8 million points a day. Say each raw point stores an 8-byte time and an 8-byte value. That is 28,800,000 × 16 = 460.8 MB a day, or about 168 GB a year. Say compression brings it to 2 bytes a point. That is 28,800,000 × 2 = 57.6 MB a day.</p><p>Hourly rollups keep 24 points a day for each series, not 5,760. That is 5,760 ÷ 24 = 240 times fewer. For 5,000 series, it is 120,000 rollup rows a day.</p><h4>When it goes wrong</h4><p>Be careful when you roll up. An average of hourly averages is wrong when hours have different counts. Keep the sum and the count instead. A p99 from Module 1 cannot be rebuilt by averaging hourly p99 values either.</p><p>Say you add reader ID as a label. With 1 million readers, 10 names and 500 branches make 5 billion series.</p>`
  },
  tradeoffs:{use:[`Keep detailed branch search timing for recent troubleshooting.`, `Use hourly summaries for year-long charts.`], avoid:[`Keeping every 15-second point forever without a need.`, `Adding reader IDs as measurement labels.`], alt:[`A small library can keep a simpler time-partitioned table.`]},
  real:[
    {co:'Facebook Gorilla', tier:'confirmed', text:'An in-memory time-series database that compressed points to about 1.37 bytes on average using delta-of-delta and XOR encoding.', src:'Pelkonen et al., “Gorilla: A Fast, Scalable, In-Memory Time Series Database”, VLDB 2015'},
    {co:'Prometheus', tier:'confirmed', text:'Stores samples in time blocks with compression and a write-ahead log for recent data.', src:'Prometheus storage documentation'}
  ],
  mistakes:[`Adding reader IDs as branch metric labels.`, `Removing raw points before staff finish detailed checks.`, `Keeping year-long charts at full 15-second resolution.`],
  interview:[`Calculate the library’s 28.8 million daily points.`, `Explain how recent detail and older rollups serve different charts.`],
  tryit:[{quiz:[{q:'How many series are 500 branches times 10 measurements?', options:['5,000', '500', '50,000', '10'], answer:0, why:'500 times 10 equals 5,000.'}, {q:'Which data fits a year-long chart?', options:['Hourly summaries', 'Only today’s raw points', 'Reader passwords', 'One book record'], answer:0, why:'Summaries reduce old data while keeping trends visible.'}]}, {note:'Change the number of branch measurements, interval, and retention to size the time-series store.', mount:host => tsCalc(host)}],
  sources:[`Pelkonen et al., VLDB 2015`, `Prometheus storage documentation`]
},
{
  id:'vector-search-rag', title:'Vector search, ANN/HNSW and RAG basics', minutes:11, tags:['embeddings','vector search','ANN','HNSW','RAG','semantic search'],
  summary:'Vector search finds books with similar meaning, even when words differ. RAG retrieves library text before a language model answers a question.',
  problem:`<h3>A small example</h3><p>A reader searches for books about growing plants in a tiny home.</p><ul><li>The title Small Gardens may be useful.</li><li>The query shares few exact words with that title.</li><li>The library also has written borrowing rules.</li></ul><p>How can search find the book and answer a borrowing question from those rules?</p>`,
  intuition:`Imagine placing books on a map by topic. Similar books sit nearby, even if their titles use different words.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Use meaning to find candidates, then ground an answer in library text.</p>',
    steps:[
      {icon:'🧭', title:'Place text on a map', text:'An embedding model turns each book or policy passage into numbers called a vector. Similar meanings get nearby vectors.'},
      {icon:'🔎', title:'Find nearby candidates', text:'An approximate nearest-neighbour index, or ANN, checks promising vectors instead of every book.'},
      {icon:'📝', title:'Keep exact words too', text:'Keyword search still helps with exact titles and book IDs. Combine both candidate lists.'},
      {icon:'📖', title:'Retrieve the rule', text:'For a borrowing question, fetch the relevant policy passage before answering.'},
      {icon:'💬', title:'Answer from evidence', text:'RAG gives that passage to a language model and asks it to cite the source.'}
    ],
    diagram:{title:'Answering a library policy question', w:780, h:250, alt:'A library question reaches vector and keyword search. Retrieved policy passages ground the answer.',
      nodes:[{id:'u', type:'client', label:'User question', x:80, y:125, w:130}, {id:'e', type:'service', label:'Embed query', x:250, y:60, w:120}, {id:'v', type:'db', label:'Vector index', sub:'HNSW', x:430, y:60, w:120}, {id:'k', type:'db', label:'Keyword index', sub:'BM25', x:430, y:190, w:130}, {id:'rr', type:'service', label:'Re-rank top 20', x:600, y:125, w:130}, {id:'llm', type:'ext', label:'LLM', sub:'answer + citations', x:740, y:210, w:120}],
      edges:[{from:'u', to:'e'}, {from:'e', to:'v'}, {from:'u', to:'k', curve:.2}, {from:'v', to:'rr'}, {from:'k', to:'rr'}, {from:'rr', to:'llm'}],
      steps:[
        {note:'The reader asks whether a borrowed book can be renewed. Turn the question into a vector.', flow:[['u', 'e']], hl:['e']},
        {note:'Find policy passages by meaning and by exact words.', flow:[['e', 'v', 'nearby'], ['u', 'k', 'renew']], parallel:true},
        {note:'Choose the most relevant policy passages.', flow:[['v', 'rr'], ['k', 'rr']], parallel:true, hl:['rr']},
        {note:'Give those passages to the language model for an answer with a source.', flow:[['rr', 'llm', 'policy text']], hl:['llm']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Library desk', 'Search system'], [['Books shelved by topic', 'Nearby vectors'], ['Catalogue title lookup', 'Keyword index'], ['Librarian checks a rulebook', 'RAG retrieves policy text']])}</div><div class="callout tip"><b>Important point</b><p>A nearby vector is a candidate, not proof. RAG answers should use retrieved policy text and show its source.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Reader asks', 'Useful method'], [['Exact book title or ID', 'Keyword search'], ['Books with a similar idea', 'Vector search'], ['What the borrowing rules say', 'RAG over policy text']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the library has 1,000,000 passages and each vector has 768 numbers of 4 bytes. Storing them takes 1,000,000 × 768 × 4 = 3.07 GB. An exact search multiplies the query with every vector. That is 1,000,000 × 768 = 768 million operations.</p><p>Say HNSW checks about 2,000 vectors on its walk. That is 2,000 × 768 = 1.5 million operations, about 500 times less. If it finds 9 of the true top 10, its recall is 9 ÷ 10 = 90%.</p><h4>When it goes wrong</h4><p>Vectors from two different embedding models cannot be compared. If the library changes its model, it must create every vector again. Store the model name with each vector.</p><p>Long policy text should be cut into passages, say 200 to 500 words each. One passage should answer one question. A passage that mixes many rules gets a vague vector and may not be found.</p>`
  },
  tradeoffs:{use:[`Use vectors for library searches with different wording.`, `Use RAG to answer from borrowing policies.`], avoid:[`Using vector similarity alone for exact book IDs.`, `Sending private staff policies to a public answer.`], alt:[`Use BM25 alone when readers usually know exact titles.`]},
  real:[
    {co:'HNSW', tier:'confirmed', text:'Hierarchical Navigable Small World graphs are among the best-performing ANN methods on public benchmarks and are implemented in FAISS, pgvector, Lucene and most vector databases.', src:'Malkov & Yashunin, IEEE TPAMI 2018 (arXiv 2016)'},
    {co:'RAG', tier:'confirmed', text:'Retrieval-augmented generation combines a retriever over a document index with a generator, improving factuality on knowledge-intensive tasks.', src:'Lewis et al., “Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks”, NeurIPS 2020'}
  ],
  mistakes:[`Assuming similar vectors guarantee the right book.`, `Answering a borrowing rule without retrieving its current text.`, `Retrieving staff-only passages for a public reader.`],
  interview:[`Explain why both keyword and vector search help the library.`, `Trace one policy question through retrieval and answer.`],
  tryit:[{quiz:[{q:'Which search fits an exact book ID?', options:['Keyword lookup', 'Only vector similarity', 'A random nearby branch', 'A reader count'], answer:0, why:'Exact IDs should use exact matching.'}, {q:'What should RAG retrieve before answering a renewal question?', options:['The relevant borrowing policy passage', 'A random book cover', 'Only a reader name', 'An old answer with no source'], answer:0, why:'The answer needs the current policy text.'}]}, {note:'Move a query point through a sample vector space and compare approximate with exact neighbours.', mount:(host, api) => annDemo(host, api)}],
  sources:[`Malkov & Yashunin (2018)`, `Johnson et al., FAISS (2017)`, `Lewis et al., NeurIPS 2020`]
},
{
  id:'recommendations', title:'Recommendation system basics', minutes:10, tags:['recommendations','collaborative filtering','content-based','two-tower','candidate generation','ranking'],
  summary:'A recommender finds a manageable set of books, then orders them for a reader. It can use reading patterns and book topics.',
  problem:`<h3>A small example</h3><p>A reader enjoyed two garden books and wants something new.</p><ul><li>The library has many books.</li><li>Other readers liked some of the same books.</li><li>A newly added garden book has no borrowing history.</li></ul><p>How can the home page suggest useful books without scoring the whole catalogue in detail?</p>`,
  intuition:`A librarian might suggest what similar readers enjoyed, then check the book’s topic and whether a copy is available.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Build a short candidate list before choosing books for the reader.</p>',
    steps:[
      {icon:'👥', title:'Find shared tastes', text:'Collaborative filtering uses patterns from readers who liked some of the same books.'},
      {icon:'📖', title:'Use book details', text:'Topic and description can suggest a new garden book that has no ratings yet.'},
      {icon:'🧺', title:'Gather candidates', text:'These quick methods return a few hundred possible books, not the whole catalogue.'},
      {icon:'🏆', title:'Rank the shortlist', text:'A richer score orders the candidates for this reader.'},
      {icon:'✅', title:'Check the final list', text:'The home page removes unavailable books and avoids showing many near-identical titles.'}
    ],
    diagram:{title:'Choosing books for one reader', w:780, h:260, alt:'Reading patterns, similar topics, and new arrivals produce candidates. Ranking and library rules choose the final list.',
      nodes:[{id:'u', type:'client', label:'Reader home', x:80, y:130}, {id:'c1', type:'service', label:'Similar readers', x:300, y:45, w:130}, {id:'c2', type:'service', label:'Similar topics', x:300, y:130, w:140}, {id:'c3', type:'service', label:'New arrivals', x:300, y:215, w:140}, {id:'rk', type:'service', label:'Book ranking', sub:'shortlist scored', x:520, y:130, w:140}, {id:'rr', type:'service', label:'Library rules', sub:'variety, copies', x:690, y:130, w:140}],
      edges:[{from:'u', to:'c1'}, {from:'u', to:'c2'}, {from:'u', to:'c3'}, {from:'c1', to:'rk'}, {from:'c2', to:'rk'}, {from:'c3', to:'rk'}, {from:'rk', to:'rr'}, {from:'rr', to:'u', curve:.35}],
      steps:[
        {note:'Find books from similar readers, similar topics, and new arrivals.', flow:[['u', 'c1'], ['u', 'c2'], ['u', 'c3']], parallel:true},
        {note:'Rank the shortlisted books for this reader.', flow:[['c1', 'rk'], ['c2', 'rk'], ['c3', 'rk']], parallel:true, hl:['rk']},
        {note:'Apply variety and copy-availability rules, then show the best books.', flow:[['rk', 'rr'], ['rr', 'u', 'suggestions']], hl:['rr']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Librarian action', 'Recommendation step'], [['Suggest books liked by similar readers', 'Collaborative filtering'], ['Check topic and description', 'Content-based candidates'], ['Choose a varied available list', 'Final ranking rules']])}</div><div class="callout tip"><b>Important point</b><p>A new book has no reader history. Its topic still lets the library consider it.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Problem', 'Response'], [['Too many books to score deeply', 'Build a short candidate list first'], ['New garden book has no ratings', 'Use its topic and description'], ['Several copies of similar titles', 'Apply variety rules']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say a rich scoring model takes 0.05 ms for each book. Scoring all 1,000,000 books takes 1,000,000 × 0.05 = 50,000 ms, or 50 seconds, for one reader. Scoring a shortlist of 500 takes 500 × 0.05 = 25 ms. That is why candidates come first.</p><p>For item-to-item filtering, say 400 readers borrowed book A and 100 of them also borrowed book B. Then 100 ÷ 400 = 25% of A's readers also took B. A very popular book B looks good next to everything, so scores are adjusted for how popular it is.</p><h4>When it goes wrong</h4><p>A new book can get no views if it is never shown. Say it is shown 1,000 times and borrowed 50 times. Its rate is 50 ÷ 1,000 = 5%. A book never shown has no rate. Reserve a few slots, say 5%, to try new books.</p><p>Top slots also get more clicks just for being first, so compare results by position.</p>`
  },
  tradeoffs:{use:[`Use reader patterns for books with history.`, `Use book topics for new library titles.`], avoid:[`Scoring every book with a costly model on each home-page visit.`, `Showing unavailable books as ready to borrow.`], alt:[`A small library can start with popular and recently added books.`]},
  real:[
    {co:'Amazon', tier:'confirmed', text:'Described item-to-item collaborative filtering, with similar-item tables computed offline so recommendations scale to huge catalogues.', src:'Linden, Smith & York, “Amazon.com Recommendations: Item-to-Item Collaborative Filtering”, IEEE Internet Computing 2003'},
    {co:'YouTube', tier:'confirmed', text:'Described a two-stage design with candidate generation over many videos, then ranking a smaller set.', src:'Covington, Adams and Sargin, Deep Neural Networks for YouTube Recommendations (2016)'}
  ],
  mistakes:[`Never showing new books because they have no ratings.`, `Learning only from borrowed books without recording what was shown.`, `Recommending an unavailable book as ready now.`],
  interview:[`Explain the candidate list and final ranking for a garden reader.`, `Explain how a new garden book can enter recommendations.`],
  tryit:[{quiz:[{q:'How can a new garden book be suggested with no ratings?', options:['Use its topic and description', 'Wait forever for ratings', 'Copy another book’s ID', 'Ignore the reader'], answer:0, why:'Content can produce candidates before interaction history exists.'}, {q:'Why rank a shortlist instead of every book?', options:['A richer score is affordable on fewer books', 'The catalogue has no titles', 'Readers cannot borrow books', 'Ranking changes book text'], answer:0, why:'Candidate generation narrows the work first.'}]}, {note:'Change reader ratings for library books and see which unread titles the recommender suggests.', mount:host => recDemo(host)}],
  sources:[`Linden et al., IEEE Internet Computing 2003`, `Covington et al., RecSys 2016`, `Koren, Bell & Volinsky, IEEE Computer 2009`]
}
];

SDA.register({
  kind:'module', id:'search', order:8, level:'advanced', icon:'🔎', title:'Search & Special Structures',
  summary:'Search a public library catalogue, suggest titles, find nearby branches, and recommend books. Learn the indexes and compact data structures behind each step.',
  outcomes:['Find matching books with an inverted index and rank them with BM25', 'Explain shards, refreshes, and trie suggestions', 'Choose Bloom filters, HyperLogLog, or Count-Min Sketch for library questions', 'Find nearby branches and store timed measurements', 'Explain vector search, RAG, and book recommendations'],
  lessons,
  quiz:[
    {q:'What does the library’s inverted index store under garden?', options:['Every reader account', 'Book IDs containing garden', 'Only one book cover', 'Branch opening hours'], answer:1, why:'Each word points to the books containing it.'},
    {q:'What does BM25 use when ordering matching books?', options:['Only row order', 'Only branch distance', 'Word rarity, repeats, and record length', 'Only book age'], answer:2, why:'These text signals help order matches.'},
    {q:'Why may an edited title appear in the database before search?', options:['Search waits for a refresh', 'The book is deleted', 'The reader changed cities', 'The title is too short'], answer:0, why:'Refresh opens recent index changes to search.'},
    {q:'Why save top suggestions at the gar trie node?', options:['To remove the book index', 'To avoid scanning every title below gar', 'To change the reader’s query', 'To count borrowings'], answer:1, why:'A prefix may have many possible completions.'},
    {q:'A Bloom filter says a book ID might be in a file. What next?', options:['Promise the book is there', 'Skip the file', 'Open the file to confirm', 'Clear all bits'], answer:2, why:'A possible match may be a false positive.'},
    {q:'Which method estimates distinct readers across branches?', options:['HyperLogLog', 'Count-Min Sketch', 'A trie', 'BM25'], answer:0, why:'HLL sketches can be merged for an approximate distinct count.'},
    {q:'Which method estimates how often garden was searched?', options:['Bloom filter', 'Count-Min Sketch', 'Geohash', 'A shard replica'], answer:1, why:'CMS estimates frequency using small counter rows.'},
    {q:'Why check cells next to the reader’s geohash cell?', options:['To change branch addresses', 'To refresh search shards', 'To count readers twice', 'A close branch may sit across a cell border'], answer:3, why:'Cell borders can separate nearby points.'},
    {q:'Which data best serves a year-long branch timing chart?', options:['Every raw 15-second point', 'Book title tokens', 'Hourly rollups', 'Only today’s points'], answer:2, why:'Older summaries keep trends with fewer points.'},
    {q:'What helps find books with similar meaning but different words?', options:['Only exact ID matching', 'A larger book cover', 'Vector search', 'A daily rollup'], answer:2, why:'Nearby vectors can represent similar meanings.'},
    {q:'What should a library RAG answer use for a renewal question?', options:['Current policy passages with a source', 'A guessed rule', 'Only a book rating', 'An old unsourced answer'], answer:0, why:'The answer should be grounded in retrieved library policy text.'},
    {q:'Why gather book candidates before detailed recommendation ranking?', options:['A richer score is cheaper on a shortlist', 'Readers cannot open the catalogue', 'It removes all new books', 'It guarantees exact predictions'], answer:0, why:'Candidate generation narrows the work.'},
    {type:'scenario', q:'A reader searches for garden stars and wants an available nearby copy. Trace the answer.', answer:'<ol><li>Split the query into words and find matching book IDs with the inverted index.</li><li>Use BM25 to order text matches.</li><li>Ask all search shards and merge their best results.</li><li>Use nearby map cells to find branch candidates, then check exact distance and copy availability.</li><li>Show the best available books and branches.</li></ol>'},
    {type:'scenario', q:'The library wants distinct daily readers and trending search terms. What should it use?', answer:'<p>Use HyperLogLog per branch for approximate distinct readers, then merge branch sketches. Use Count-Min Sketch to estimate term frequency, alongside a small list of candidate popular terms. Keep exact database records for fines and loans, where an estimate is not enough.</p>'}
  ],
  cheatsheet:[
    {h:'🔎 Book search', items:['An inverted index maps words to book IDs', 'AND search keeps IDs shared by both lists', 'BM25 orders text matches using rarity, repeats, and length']},
    {h:'🧱 Distributed index', items:['A shard holds part of the book index', 'A replica is another copy of a shard', 'The coordinator merges shard results', 'A refresh makes recent title edits searchable']},
    {h:'⌨️ Suggestions', items:['A trie follows typed letters such as g, ga, gar', 'Store a short suggestion list at each popular prefix', 'Rebuild suggestions from completed searches']},
    {h:'🎲 Compact answers', items:['Bloom filter: definitely absent or possibly present', 'Confirm a Bloom possible match in the real file', 'HLL estimates distinct readers and can merge branches', 'CMS estimates how often each search term appears']},
    {h:'🗺️ Place and time', items:['Check the reader’s map cell and neighbouring cells', 'Measure exact distance after finding branch candidates', 'Keep recent timed measurements', 'Use rollups for older charts']},
    {h:'🧠 Meaning and choices', items:['Vectors place similar book meanings near each other', 'ANN finds nearby candidates quickly', 'RAG retrieves policy text before answering', 'Recommendations gather candidates, then rank a shortlist']}
  ],
  glossary:[
    {term:'Inverted index', def:'A map from each word to the list of documents that contain it, like the index at the back of a book. Example: the word “garden” points to every book title that has it.'},
    {term:'Postings list', aka:['postings'], def:'The sorted list of document IDs (and sometimes positions) for one word in an inverted index. Example: “garden” points to books 4, 9 and 31.'},
    {term:'Tokenization', aka:['analyzer', 'stemming', 'tokenizing'], def:'Splitting text into words using fixed rules, the same for titles and queries. Example: “Small Gardens” becomes small and garden, so a search for “garden” matches.'},
    {term:'TF-IDF', def:'A classic score for how useful a word is. It rises when a word is common in one document and falls when the word is common everywhere. Example: “gardening” says more about a book than “the”.'},
    {term:'BM25', def:'A popular ranking method. It favours rare words, stops a repeated word from helping forever, and adjusts for document length. Example: a short title with “orchid” ranks above a long one that says it once.'},
    {term:'Elasticsearch', aka:['OpenSearch'], def:'A search and analytics engine built on Lucene that spreads an index across many machines. Example: a library searches millions of titles in milliseconds.'},
    {term:'Lucene', aka:['Apache Lucene'], def:'An open-source search library that provides inverted indexes and scoring. Example: Elasticsearch uses it inside every node.'},
    {term:'Segment (Lucene)', aka:['segments'], def:'A fixed piece of a Lucene index. New data creates new segments, which are merged later. Example: each refresh adds a small segment.'},
    {term:'Near real-time search', aka:['near real-time'], def:'New documents become searchable a moment after they are saved, when a refresh opens a new segment. Example: a new book appears in search about one second after it is added.'},
    {term:'Learning to rank', def:'Using machine learning to order search results from many signals. Example: it learns that readers often borrow recent, highly rated books and ranks them higher.'},
    {term:'Trie', aka:['prefix tree'], def:'A tree where each step adds one letter, so all words with the same start share a path. Example: typing “gar” follows three steps and reaches garden, gardening and garlic.'},
    {term:'Autocomplete', aka:['typeahead'], def:'Suggesting ways to finish what a user has started typing. Example: typing “gar” suggests “garden seasons”.'},
    {term:'Bloom filter', def:'A tiny structure that says an item is definitely absent or possibly present. Example: it tells a library that book ID 77 was never added, so no database lookup is needed.'},
    {term:'False positive', aka:['false positives'], def:'A wrong “yes” answer. Example: a Bloom filter says an ID might be present, but the ID was never added.'},
    {term:'HyperLogLog', aka:['HLL'], def:'A small structure that estimates how many different items you have seen. Example: it counts roughly how many different readers visited, using only a few kilobytes.'},
    {term:'Count-Min Sketch', aka:['CMS'], def:'A small set of counters that estimates how often something appeared. It can overcount, but never undercounts. Example: how many times each search term was typed.'},
    {term:'Heavy hitters', def:'The items that appear most often in a stream of data. Example: the 10 most searched titles today.'},
    {term:'Geohash', def:'A short text code for a map area. Places that share the same start of the code are close together. Example: a code starting with “ttn” covers a small square of the map.'},
    {term:'Quadtree', def:'A tree that splits a map into four parts again and again, more finely where there are many points. Example: a crowded city centre gets small cells, and empty land gets big ones.'},
    {term:'S2', def:'Google’s library for dividing the Earth’s surface into cells. Example: it turns a place into a cell ID that can be searched quickly.'},
    {term:'H3', def:'Uber’s system that divides the Earth into hexagon cells at many sizes. Example: count rides in each hexagon.'},
    {term:'Haversine formula', aka:['haversine'], def:'A formula for the distance between two points on the Earth’s curved surface. Example: it gives the distance between a reader and a branch.'},
    {term:'Edit distance', def:'The number of letter changes needed to turn one word into another. Example: “garden” and “garten” differ by 1 change.'},
    {term:'Time-series database', aka:['time-series', 'TSDB'], def:'A database made for measurements that each have a time. Example: the response time of each branch’s search, stored every minute.'},
    {term:'Downsampling', aka:['rollup', 'rollups'], def:'Combining detailed data into coarser time buckets to save space. Example: turn per-second numbers into per-hour averages after a week.'},
    {term:'Cardinality', def:'The number of different values. Example: 50,000 different readers visited, even though there were 2 million visits.'},
    {term:'Embedding', aka:['embeddings', 'vector embedding'], def:'A list of numbers that represents the meaning of a text or image, so similar things get close numbers. Example: “tiny garden” and “small balcony plants” end up near each other.'},
    {term:'Vector search', aka:['semantic search', 'similarity search'], def:'Finding items whose embeddings are closest to the query’s embedding. Example: a search for “growing plants in a tiny home” finds “Small Gardens”.'},
    {term:'ANN', aka:['approximate nearest neighbour', 'approximate nearest neighbor'], def:'Approximate nearest-neighbour search: it finds very close matches quickly and accepts that it may miss a few. Example: it checks promising items only, not every book.'},
    {term:'HNSW', def:'A fast ANN method that links similar items in layers of a graph, so a search hops from far to near. Example: a query starts at a rough match and moves to closer neighbours.'},
    {term:'Recall@k', aka:['recall'], def:'The share of the true best k results that a search method actually returns. Example: if the true top 10 has 9 of the results returned, recall@10 is 90%.'},
    {term:'RAG', aka:['retrieval-augmented generation'], def:'Retrieval-augmented generation: first fetch relevant text, then give it to a language model so its answer is based on that text. Example: it fetches the borrowing policy, then answers “how long can I keep a book?”.'},
    {term:'Collaborative filtering', def:'Recommending items using the behaviour of many users. Example: readers who borrowed book A also borrowed book B, so B is suggested.'},
    {term:'Candidate generation', def:'The first, cheap step that narrows millions of items to a few hundred worth ranking. Example: pick 300 possible books before ranking them.'},
    {term:'Full-text search', aka:['full-text'], def:'Searching the words inside documents, not only exact values. Example: finding every title that has the word “garden” in it.'},
    {term:'Geospatial index', def:'An index that groups places by map area, so “find nearby” is fast. Example: find the branches within 2 km without checking every branch.'}
  ],
  sources:['Manning, Raghavan & Schütze, “Introduction to Information Retrieval”', 'Robertson & Zaragoza (2009); Brin & Page (1998)', 'Bloom (1970); Flajolet et al. (2007); Heule et al. (2013); Cormode & Muthukrishnan (2005)', 'Uber H3 (2018); s2geometry.io; Pelkonen et al., Gorilla (2015)', 'Malkov & Yashunin, HNSW (2018); Lewis et al., RAG (2020)', 'Linden et al. (2003); Covington et al. (2016)']
});
} catch(e){ console.error('[SDA] Module "search" failed to load', e); window.SDA && SDA.errors.push({id:'search', error:e}); }
})();
