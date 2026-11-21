/* =====================================================================
   PART 10 · FLAGSHIP CASES (a) — Google Search · YouTube · Netflix
   Each: 10-step evolution, multiple request flows, Break-It, and a
   richer interactive simulation in the Deep-dives tab.
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, esc, fmtNum, fmtBytes} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const frag = html => document.createRange().createContextualFragment(html);
const hr = () => el('hr', {style:{border:'0', borderTop:'1px solid var(--border)', margin:'18px 0'}});
const note = html => el('p', {class:'lab-hint', html});
const fmtBps = b => { for (const [v, u] of [[1e12, 'Tbps'], [1e9, 'Gbps'], [1e6, 'Mbps'], [1e3, 'kbps']]) if (b >= v){ const x = b / v; return (x >= 100 ? Math.round(x) : +x.toFixed(1)) + ' ' + u; } return Math.round(b) + ' bps'; };

/* ---------- shared maths: generalised harmonic number H(n, s) for Zipf popularity ---------- */
function harmonic(n, s){
  const m = Math.min(n, 2000); let sum = 0; for (let i = 1; i <= m; i++) sum += Math.pow(i, -s);
  if (n > m){ const a = m + .5, b = n + .5; sum += Math.abs(s - 1) < 1e-9 ? Math.log(b / a) : (Math.pow(b, 1 - s) - Math.pow(a, 1 - s)) / (1 - s); }
  return sum;
}
/* share of requests for the k most popular of n items (ideal popularity-ranked cache) */
const zipfHit = (k, n, s) => k >= n ? 1 : k < 1 ? 0 : harmonic(k, s) / harmonic(n, s);

/* ---------- Google: a tiny search engine with real PageRank + BM25 ---------- */
const WEB = [
  {id:'A', url:'cricketlive.example/ind-vs-aus', title:'Live cricket score: India vs Australia', text:'ball by ball live cricket score and commentary for india vs australia with full scorecard', links:['B', 'C', 'H']},
  {id:'B', url:'iplguide.example/schedule', title:'IPL 2026 schedule and venues', text:'full ipl cricket schedule with match dates venues and team squads', links:['A', 'D']},
  {id:'C', url:'sportsdaily.example/india-squad', title:'Cricket news: India squad for the Australia tour', text:'selectors announce the india cricket squad for the australia tour and test series', links:['A', 'B']},
  {id:'D', url:'mumbaiguide.example/wankhede', title:'Wankhede Stadium visitor guide', text:'seating plan metro access and food at wankhede stadium mumbai for ipl matches', links:['B']},
  {id:'E', url:'free-score-now.example', title:'FREE live cricket score cricket score live', text:'cricket score live cricket score free live cricket score cricket live score', links:['A']},
  {id:'F', url:'railhelp.example/tatkal', title:'How to book tatkal train tickets', text:'step by step guide to booking tatkal train tickets online and checking seat availability', links:['G']},
  {id:'G', url:'railhelp.example/pnr', title:'PNR status and live train running status', text:'check pnr status and live train running status for any indian railways train', links:['F', 'H']},
  {id:'H', url:'dailyindia.example', title:'Daily India portal: cricket, trains, weather', text:'top stories today cricket news live score train status weather and markets', links:['A', 'C', 'F', 'G', 'B']}];
const STOP = new Set(['a', 'an', 'and', 'the', 'for', 'of', 'to', 'at', 'in', 'on', 'with', 'by', 'vs', 'any', 'how']);
const tok = s => s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w && !STOP.has(w));
function pageRank(docs, d){
  const n = docs.length, idx = Object.fromEntries(docs.map((x, i) => [x.id, i])); let pr = new Array(n).fill(1 / n), it = 0, delta = 1;
  while (delta > 1e-9 && it < 200){
    const nx = new Array(n).fill((1 - d) / n); let dangling = 0;
    docs.forEach((x, i) => { const out = x.links.filter(l => idx[l] != null); if (!out.length) dangling += pr[i]; else out.forEach(l => nx[idx[l]] += d * pr[i] / out.length); });
    for (let i = 0; i < n; i++) nx[i] += d * dangling / n;
    delta = nx.reduce((a, v, i) => a + Math.abs(v - pr[i]), 0); pr = nx; it++;
  }
  return {pr:Object.fromEntries(docs.map((x, i) => [x.id, pr[i]])), it};
}
function buildIndex(docs){
  const post = {}, len = {}; let total = 0;
  docs.forEach(x => { const t = tok(x.title + ' ' + x.title + ' ' + x.text); len[x.id] = t.length; total += t.length; t.forEach(w => { (post[w] = post[w] || {})[x.id] = (post[w][x.id] || 0) + 1; }); });
  return {post, len, avg:total / docs.length, n:docs.length};
}
function search(I, pr, q, alpha){
  const terms = [...new Set(tok(q))]; const bm = {};
  terms.forEach(t => { const p = I.post[t]; if (!p) return; const df = Object.keys(p).length; const idf = Math.log(1 + (I.n - df + .5) / (df + .5));
    for (const [id, tf] of Object.entries(p)) bm[id] = (bm[id] || 0) + idf * tf * 2.2 / (tf + 1.2 * (.25 + .75 * I.len[id] / I.avg)); });
  const ids = Object.keys(bm); if (!ids.length) return {terms, rows:[]};
  const maxB = Math.max(...ids.map(i => bm[i])), maxP = Math.max(...Object.values(pr));
  const rows = ids.map(id => ({id, bm:bm[id], pr:pr[id], score:(1 - alpha) * bm[id] / maxB + alpha * pr[id] / maxP})).sort((a, b) => b.score - a.score);
  return {terms, rows};
}
SDA.miniSearch = {WEB, pageRank, buildIndex, search};
function miniGoogle(host){
  const P = {q:'live cricket score', alpha:.3, d:.85}; const I = buildIndex(WEB); let R = pageRank(WEB, P.d);
  const byId = Object.fromEntries(WEB.map(x => [x.id, x]));
  const qIn = el('input', {class:'input', type:'search', value:P.q, 'aria-label':'Search query'});
  const out = el('div'), prBox = el('div');
  function renderPR(){
    const max = Math.max(...Object.values(R.pr));
    prBox.innerHTML = '';
    prBox.append(frag(h.table(['Page', 'Links in', 'PageRank'], WEB.slice().sort((a, b) => R.pr[b.id] - R.pr[a.id]).map(x => [`<b>${x.id}</b> · ${esc(x.title)}`, String(WEB.filter(y => y.links.includes(x.id)).length), `<span class="mono">${R.pr[x.id].toFixed(3)}</span> <span style="display:inline-block;height:8px;width:${Math.round(60 * R.pr[x.id] / max)}px;background:var(--accent1);border-radius:4px"></span>`]), [1, 2])));
    prBox.append(note(`Power iteration converged in <b>${R.it}</b> rounds (damping ${P.d}). Page E links out but nobody links to it, so it keeps only the “random jump” share.`));
  }
  function run(){
    const r = search(I, R.pr, P.q, P.alpha); out.innerHTML = '';
    if (!r.terms.length){ out.append(el('div', {class:'verdict warn'}, 'Type a query, e.g. “live cricket score” or “train status”.')); return; }
    out.append(frag('<p><b>Posting lists</b> (term → pages with term frequency):</p>' + h.list(r.terms.map(t => { const p = I.post[t]; return `<code>${esc(t)}</code> → ${p ? Object.entries(p).map(([id, tf]) => `${id}<sub>×${tf}</sub>`).join(', ') : '<i>no postings: dropped</i>'}`; }))));
    if (!r.rows.length){ out.append(el('div', {class:'verdict warn'}, 'No page contains these terms.')); return; }
    out.append(frag(h.table(['#', 'Result', 'BM25 text score', 'PageRank', 'Final'], r.rows.map((x, i) => [String(i + 1), `<b>${esc(byId[x.id].title)}</b><br><span class="muted mono" style="font-size:12px">${esc(byId[x.id].url)}</span>`, x.bm.toFixed(2), x.pr.toFixed(3), `<b>${x.score.toFixed(3)}</b>`]), [0, 2, 3, 4])));
    const top = r.rows[0].id, spamRank = r.rows.findIndex(x => x.id === 'E') + 1;
    out.append(el('div', {class:'verdict ' + (top === 'E' ? 'bad' : 'ok'), html:top === 'E' ? 'The keyword-stuffed page <b>E</b> wins on text alone. Raise the link-authority weight and it drops: other sites don’t vouch for it.' : spamRank ? `The keyword-stuffed page E is ranked <b>#${spamRank}</b>: text relevance gets it into the results, but link authority keeps it below pages that others link to.` : 'Relevance and authority agree on this query.'}));
  }
  qIn.addEventListener('input', () => { P.q = qIn.value; run(); });
  host.append(note('A real (tiny) search engine: 8 pages, a link graph, an inverted index, BM25 text scoring (titles count twice) and PageRank computed by power iteration. Final score = (1 − w) × text + w × authority, both scaled to 0–1. Real engines blend hundreds of signals; this shows why links were Google’s first big one.'),
    el('div', {class:'ctl-grid'}, el('label', {class:'field'}, el('span', null, 'Query'), qIn),
      ui.slider({label:'Link-authority weight w', min:0, max:1, step:.05, value:P.alpha, fmt:v => v.toFixed(2), onInput:v => { P.alpha = v; run(); }}).el,
      ui.slider({label:'PageRank damping d', min:.5, max:.95, step:.05, value:P.d, fmt:v => v.toFixed(2), onInput:v => { P.d = v; R = pageRank(WEB, v); renderPR(); run(); }}).el),
    el('div', {class:'pill-row', style:{margin:'8px 0'}}, ...['live cricket score', 'train status', 'india australia', 'ipl stadium'].map(q => ui.button(q, () => { qIn.value = P.q = q; run(); }, 'sm ghost'))),
    out, el('h4', {style:{margin:'16px 0 6px'}}, 'PageRank of the 8 pages'), prBox);
  renderPR(); run();
}

/* ---------- YouTube: transcoding & storage calculator ---------- */
const RUNGS = [['144p', 100, .1], ['240p', 250, .2], ['360p', 500, .35], ['480p', 1000, .6], ['720p', 2500, 1], ['1080p', 4500, 2], ['1440p', 9000, 4], ['2160p', 18000, 8]];
const CODECS = {h264:{label:'H.264', size:1, cost:1}, vp9:{label:'VP9', size:.65, cost:5}, av1:{label:'AV1', size:.5, cost:12}};
function transcodeCalc(host){
  const P = {rate:500, top:'1080p', codecs:'h264+vp9', popular:false, pct:10}; const out = el('div');
  function calc(o){
    const rungs = RUNGS.slice(0, RUNGS.findIndex(r => r[0] === o.top) + 1), hours = o.rate * 60 * 24;
    const cs = o.codecs.split('+'); let bytes = 0, core = 0;
    cs.forEach(c => { const share = c === 'h264' || !o.popular ? 1 : o.pct / 100; rungs.forEach(([, kbps, cost]) => { bytes += hours * share * 3600 * kbps * 1000 / 8 * CODECS[c].size; core += hours * share * cost * CODECS[c].cost; }); });
    return {hours, rungs:rungs.length, bytes, core, cores:core / 24};
  }
  function run(){
    const r = calc(P), base = calc(Object.assign({}, P, {popular:false}));
    out.innerHTML = '';
    out.append(frag(h.table(['Quantity', 'Value'], [
      ['Video uploaded per day', fmtNum(r.hours) + ' hours'],
      ['Renditions per codec', String(r.rungs) + ' (144p → ' + P.top + ')'],
      ['New encoded video per day', fmtBytes(r.bytes)],
      ['… per year (before replication)', fmtBytes(r.bytes * 365)],
      ['Encode work per day', fmtNum(r.core) + ' core-hours'],
      ['CPU cores busy around the clock', fmtNum(r.cores)]], [1])));
    const saved = base.core ? 1 - r.core / base.core : 0;
    out.append(el('div', {class:'verdict ' + (P.popular ? 'ok' : r.cores > 1e6 ? 'bad' : 'warn'), html:P.popular ? `Popular-first encoding cuts encode work by <b>${Math.round(saved * 100)}%</b> and storage by <b>${Math.round((1 - r.bytes / base.bytes) * 100)}%</b>: every upload gets H.264 at once, and the expensive codecs are spent only on the ${P.pct}% of videos that actually get watched.` : `Encoding everything in every codec needs about <b>${fmtNum(r.cores)}</b> cores running non-stop. Turn on popular-first encoding, or imagine dedicated video chips: this is why YouTube built hardware transcoders.`}));
  }
  host.append(note('An educational model. Bitrates are typical for each resolution; VP9 and AV1 files are assumed ~35% and ~50% smaller than H.264 but ~5× and ~12× more expensive to encode in software. Encode cost is in core-hours per hour of video, relative to 720p H.264 = 1.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Upload rate (hours of video per minute)', min:10, max:1000, step:10, value:P.rate, fmt:v => v + ' h/min', onInput:v => { P.rate = v; run(); }}).el,
      ui.select({label:'Highest rendition', value:P.top, options:[['720p', 'Up to 720p'], ['1080p', 'Up to 1080p'], ['2160p', 'Up to 4K (2160p)']], onChange:v => { P.top = v; run(); }}).el,
      ui.select({label:'Codecs', value:P.codecs, options:[['h264', 'H.264 only'], ['h264+vp9', 'H.264 + VP9'], ['h264+vp9+av1', 'H.264 + VP9 + AV1']], onChange:v => { P.codecs = v; run(); }}).el,
      ui.slider({label:'Videos that become popular', min:1, max:50, value:P.pct, fmt:v => v + '%', onInput:v => { P.pct = v; run(); }}).el),
    el('div', {style:{margin:'8px 0'}}, ui.toggle({label:'Popular-first: newer codecs only for popular videos', checked:P.popular, onChange:v => { P.popular = v; run(); }}).el), out);
  run();
}
/* ---------- YouTube: long-tail edge-cache simulator ---------- */
function longTailCache(host){
  const P = {logN:9, logPct:0, s:1, tbps:100}; const out = el('div');
  function run(){
    const N = Math.pow(10, P.logN), pct = Math.pow(10, P.logPct), k = Math.round(N * pct / 100); const hit = zipfHit(k, N, P.s);
    const head = zipfHit(Math.max(1, Math.round(N * .001)), N, P.s);
    out.innerHTML = '';
    out.append(frag(h.table(['Quantity', 'Value'], [['Videos in the catalogue', fmtNum(N)], ['Videos the edge holds (most popular first)', fmtNum(k) + ' (' + (pct < .01 ? pct.toPrecision(2) : +pct.toFixed(2)) + '%)'], ['Share of views served from the edge', (hit * 100).toFixed(1) + '%'], ['Traffic still going back to origin', fmtNum(P.tbps * (1 - hit)) + ' Tbps of ' + P.tbps], ['Views that go to the top 0.1% of videos', (head * 100).toFixed(1) + '%']], [1])));
    out.append(el('div', {class:'verdict ' + (hit > .9 ? 'ok' : hit > .7 ? 'warn' : 'bad'), html:hit > .9 ? 'The edge absorbs almost everything: popularity is concentrated enough that a small slice of the catalogue covers most views.' : `Even holding the most popular videos, <b>${((1 - hit) * 100).toFixed(0)}%</b> of views miss the edge. That is the long tail: billions of rarely watched videos together make up a big share of views, so you need deep cache hierarchies (ISP edge → regional → origin), not one cache layer.`}));
  }
  host.append(note('Video popularity is modelled as Zipf: the i-th most popular video gets views ∝ 1/i<sup>s</sup>. A larger <i>s</i> means views are more concentrated on hits. An idealised cache keeps exactly the most popular videos; a real LRU cache does a little worse.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Catalogue size', min:5, max:10, step:.5, value:P.logN, fmt:v => fmtNum(Math.pow(10, v)) + ' videos', onInput:v => { P.logN = v; run(); }}).el,
      ui.slider({label:'Edge cache holds', min:-4, max:1, step:.25, value:P.logPct, fmt:v => { const p = Math.pow(10, v); return (p < .01 ? p.toPrecision(2) : +p.toFixed(2)) + '% of videos'; }, onInput:v => { P.logPct = v; run(); }}).el,
      ui.slider({label:'Zipf exponent s (popularity skew)', min:.5, max:1.2, step:.05, value:P.s, fmt:v => v.toFixed(2), onInput:v => { P.s = v; run(); }}).el), out);
  run();
}

/* ---------- Netflix: Open Connect fill planner ---------- */
function openConnect(host){
  const P = {subs:5, peak:20, mbps:5, store:30, s:1.1, churn:2, cat:3}; const out = el('div');
  function run(){
    const streams = P.subs * 1e6 * P.peak / 100, demand = streams * P.mbps * 1e6; const titles = 10000; const hit = zipfHit(Math.round(titles * P.store / 100), titles, P.s);
    const catBytes = P.cat * 1e15, fill = catBytes * P.store / 100 * P.churn / 100, fillRate = fill * 8 / (8 * 3600);
    out.innerHTML = '';
    out.append(frag(h.table(['At 9 pm peak in this ISP', 'Without OCAs', 'With OCAs (filled overnight)'], [
      ['Concurrent streams', fmtNum(streams), fmtNum(streams)],
      ['Video demand', fmtBps(demand), fmtBps(demand)],
      ['Served from inside the ISP', '0', `${fmtBps(demand * hit)} (${(hit * 100).toFixed(1)}%)`],
      ['Crossing into the ISP at peak', `<b>${fmtBps(demand)}</b>`, `<b>${fmtBps(demand * (1 - hit))}</b>`],
      ['Fill traffic (moved to a 2–10 am window)', 'n/a', `${fmtBytes(fill)} per night ≈ ${fmtBps(fillRate)} for 8 h`]], [1, 2])));
    out.append(el('div', {class:'verdict ' + (hit > .9 ? 'ok' : 'warn'), html:`OCAs holding ${P.store}% of the catalogue serve <b>${(hit * 100).toFixed(1)}%</b> of peak views from inside the ISP. Peak traffic entering the ISP drops ${fmtNum(1 / Math.max(1e-6, 1 - hit), 0)}×, and the refresh happens overnight when links are idle. ${hit > .9 ? '' : 'Add storage, or note that a catalogue with flatter popularity needs more of it.'}`}));
  }
  host.append(note('An educational model of proactive caching: because the catalogue is known and popularity is predictable, appliances inside the ISP are filled during quiet hours, not on demand at peak. Popularity is Zipf over 10,000 titles; all inputs are illustrative.'),
    el('div', {class:'ctl-grid'},
      ui.slider({label:'Subscribers on this ISP', min:.5, max:20, step:.5, value:P.subs, fmt:v => v + 'M', onInput:v => { P.subs = v; run(); }}).el,
      ui.slider({label:'Watching at peak', min:5, max:40, value:P.peak, fmt:v => v + '%', onInput:v => { P.peak = v; run(); }}).el,
      ui.slider({label:'Average bitrate', min:1, max:15, step:.5, value:P.mbps, fmt:v => v + ' Mbps', onInput:v => { P.mbps = v; run(); }}).el,
      ui.slider({label:'OCA storage (share of catalogue)', min:1, max:100, value:P.store, fmt:v => v + '%', onInput:v => { P.store = v; run(); }}).el,
      ui.slider({label:'Popularity skew (Zipf s)', min:.5, max:1.2, step:.05, value:P.s, fmt:v => v.toFixed(2), onInput:v => { P.s = v; run(); }}).el,
      ui.slider({label:'Stored files replaced each night', min:.5, max:10, step:.5, value:P.churn, fmt:v => v + '%', onInput:v => { P.churn = v; run(); }}).el), out);
  run();
}
/* ---------- Netflix: per-title encoding ---------- */
const FIXED = [235, 375, 560, 750, 1050, 1750, 2350, 3000, 4300, 5800];
const CONTENT = {anim:{label:'Animation (flat colours)', c:600}, drama:{label:'Drama (talking heads)', c:1200}, sport:{label:'Sports / action (grain, motion)', c:2600}};
const quality = (kbps, c) => 100 * (1 - Math.exp(-kbps / c));
const bitrateFor = (q, c) => -c * Math.log(1 - q / 100);
function perTitle(host){
  const P = {kind:'anim'}; const out = el('div'); const TARGETS = [40, 55, 68, 78, 86, 91, 95];
  function run(){
    const c = CONTENT[P.kind].c, ladder = TARGETS.map(q => Math.min(16000, Math.round(bitrateFor(q, c) / 5) * 5));
    const fixedTop = quality(5800, c), ptTop = ladder[ladder.length - 1];
    out.innerHTML = '';
    out.append(frag(h.table(['Ladder', 'Rungs (kbps)', 'Top-rung quality', 'Top-rung bitrate'], [
      ['One fixed ladder for every title', FIXED.join(' · '), fixedTop.toFixed(1), '5,800 kbps'],
      ['Per-title ladder (this title)', ladder.join(' · '), quality(ptTop, c).toFixed(1), ptTop.toLocaleString('en-IN') + ' kbps']], [2, 3])));
    const diff = 1 - ptTop / 5800;
    out.append(el('div', {class:'verdict ' + (diff > 0 ? 'ok' : 'warn'), html:diff > 0 ? `Easy content reaches quality 95 at <b>${ptTop.toLocaleString('en-IN')} kbps</b>, so every top-quality stream of this title uses <b>${Math.round(diff * 100)}%</b> less bandwidth than the fixed 5,800 kbps rung, with no visible loss.` : `Hard content looks worse than 95 even at 5,800 kbps (${fixedTop.toFixed(1)}). Per-title encoding gives it <b>${ptTop.toLocaleString('en-IN')} kbps</b> at the top so it looks as good as everything else. Per-title is about the <i>right</i> bits, not just fewer.`}));
  }
  host.append(note('The fixed ladder is the one Netflix published when it introduced per-title encoding (2015). The quality curve q = 100·(1 − e<sup>−bitrate/c</sup>) is an educational stand-in for a perceptual metric such as VMAF; <i>c</i> is the title’s complexity.'),
    el('div', {class:'ctl-grid'}, ui.select({label:'Title type', value:P.kind, options:Object.entries(CONTENT).map(([k, v]) => [k, v.label]), onChange:v => { P.kind = v; run(); }}).el), out);
  run();
}
SDA.flagshipMath = {harmonic, zipfHit, quality, bitrateFor};

/* ======================= 1. GOOGLE SEARCH ======================= */
SDA.register({kind:'case', id:'google-search', tier:'flagship', icon:'🔎', title:'Google Search (web-scale search)', tagline:'Crawl the web, index it in RAM, and answer in a blink: scatter-gather at planet scale.', tags:['inverted index', 'pagerank', 'crawler', 'scatter-gather', 'tail latency', 'sharding', 'freshness'],
  modules:['search', 'distributed', 'caching', 'reliability', 'foundations'],
  summary:'A search engine answers a query over hundreds of billions of pages in a fraction of a second. The design is a pipeline of crawl, index and serve, with a sharded index in memory, scatter-gather serving, caching and ranking.',
  accuracy:'The overall shape comes from Google’s own publications: the 1998 “Anatomy” paper, the 2003 cluster paper, Percolator (2010), “The Tail at Scale” (2013) and Jeff Dean’s WSDM 2009 talk. These facts are marked confirmed. Today’s ranking and serving internals are proprietary, so anything beyond those sources is inference or a simplified teaching design. The numbers are illustrative unless marked as public.',
  overview:{what:'<b>A small example.</b> A user types “ipl schedule”. In a few hundred milliseconds she gets ten ranked links, each with a title and a short snippet. They come from a crawl of a large part of the public web, including pages published a few minutes ago.', in:['Crawling and re-crawling the web politely', 'Building and updating the inverted index', 'Serving queries: retrieval, ranking, snippets', 'Spelling correction and query understanding', 'Freshness for news and fast-changing pages'], out:['Ads auction and billing', 'Images/video/maps verticals (same ideas, separate indexes)', 'Autocomplete (see the Typeahead case)', 'Spam-fighting ML in depth']},
  challenges:['The index is far too big for one machine, yet every query must look at all of it', 'A query goes out to thousands of servers, so one slow server sets the speed of everything (the tail at scale)', 'The web changes all the time, but rebuilding the index in batches takes days', 'Matching words is not enough. Ranking must resist spam and understand meaning', 'Crawling billions of pages without overloading any website'],
  fr:['<code>GET /search?q=…</code> returns the top 10 results with title, URL and snippet', 'Pages of results and simple filters (language, region, time)', 'Spelling suggestions (“Did you mean…”)', 'New and changed pages become searchable (minutes for news, days for the long tail)', 'Webmasters can control crawling (robots.txt) and ask for removal'],
  nfr:['99 of 100 queries finish in a few hundred ms end to end (an illustrative target)', 'Highly available: show fewer or slightly older results rather than fail', 'Results are stable enough that a refresh does not reshuffle them', 'Cost: the index lives in RAM on many thousands of machines', 'Polite crawling: a rate limit for each host'],
  scale:[{k:'Index size', v:'hundreds of billions of pages, over 100,000,000 GB', math:'Google says the index is well over 100,000,000 GB (100 petabytes) in “How Search Works”', tag:'public'}, {k:'Queries never seen before', v:'≈ 15% each day', math:'From the Google Search blog, BERT announcement (2019): 15 of every 100 queries are new', tag:'public'}, {k:'Query rate', v:'≈ 100K a second on average, 2 to 3 times that at peak', math:'About 8.5B queries a day (a third-party estimate) ÷ 86,400 s ≈ 98,000 a second', tag:'illustrative'}, {k:'Index shards for one full copy', v:'≈ 3,000', math:'400B pages × about 2 KB of index data = 800 TB. 800 TB ÷ about 256 GB of RAM on each server ≈ 3,100', tag:'illustrative'}, {k:'Copies of each shard', v:'≈ 75 (spread over many data centers)', math:'300K queries a second at peak × 50% cache misses = 150K a second on every shard. 150K ÷ about 2K a second for each server = 75', tag:'illustrative'}, {k:'Crawl bandwidth', v:'≈ 46 Gbps', math:'Fetch 50B important pages again every 10 days = 5B a day ≈ 58,000 pages a second. 58,000 × 100 KB ≈ 5.8 GB a second ≈ 46 Gbps', tag:'illustrative'}],
  arch:{w:940, h:370, minW:660, nodes:[
    {id:'u', type:'client', label:'User', x:66, y:175, w:100},
    {id:'edge', type:'cdn', label:'Edge PoPs', sub:'near users', x:190, y:175, w:110, stage:9},
    {id:'gfe', type:'lb', label:'Front end (GFE)', sub:'load balancing', x:322, y:175, w:136, stage:3},
    {id:'web', type:'service', label:'Query server', sub:'parse + rank', x:460, y:175, w:120},
    {id:'rcache', type:'cache', label:'Results cache', sub:'popular queries', x:460, y:60, w:130, stage:5},
    {id:'qu', type:'service', label:'Query understanding', sub:'spelling, synonyms, ML', x:640, y:60, w:178, stage:8},
    {id:'root', type:'service', label:'Root / mixer', sub:'scatter-gather', x:625, y:175, w:136, stage:2},
    {id:'idx', type:'db', label:'Index', sub:'on disk', x:815, y:175, w:150},
    {id:'docsrv', type:'db', label:'Doc servers', sub:'snippets', x:820, y:60, w:120, stage:4},
    {id:'fresh', type:'db', label:'Fresh tier', sub:'minutes-old pages', x:830, y:300, w:145, stage:7},
    {id:'front', type:'queue', label:'URL frontier', sub:'per-host queues', x:190, y:300, w:160, stage:1},
    {id:'crawl', type:'service', label:'Crawlers', sub:'fetch + parse', x:350, y:300, w:120, stage:1},
    {id:'docs', type:'db', label:'Page store', sub:'raw pages', x:500, y:300, w:120, stage:1},
    {id:'idxr', type:'service', label:'Indexing pipeline', sub:'batch rebuild', x:660, y:300, w:140, stage:1}],
   edges:[{from:'u', to:'web', gone:3}, {from:'u', to:'gfe', stage:3, gone:9}, {from:'u', to:'edge', stage:9}, {from:'edge', to:'gfe', stage:9}, {from:'gfe', to:'web', stage:3},
     {from:'web', to:'idx', gone:2}, {from:'web', to:'root', stage:2}, {from:'root', to:'idx', stage:2}, {from:'web', to:'rcache', stage:5}, {from:'web', to:'qu', stage:8},
     {from:'root', to:'docsrv', stage:4}, {from:'root', to:'fresh', stage:7},
     {from:'front', to:'crawl', stage:1}, {from:'crawl', to:'docs', stage:1}, {from:'docs', to:'idxr', stage:1}, {from:'idxr', to:'idx', stage:1}, {from:'idxr', to:'fresh', stage:7}]},
  evolution:[
    {title:'One server + one index', scale:'24M pages (1998)', fix:'<p>One query server reads an <b>inverted index</b> on its local disk: for each word, the sorted list of pages that contain it. A batch job crawls a few million pages and rebuilds the index now and then.</p><p>A query intersects the lists for its words and ranks the matches by text relevance plus PageRank.</p>', after:{lat:400, err:.1, load:20}},
    {title:'Crawling outgrows one machine', scale:'100M pages', hot:['web'], breaks:'<p>One machine fetches maybe 100 pages a second. So 100M pages take 12 days, and the index is always weeks old. Crawling, parsing and indexing also compete with live queries for the same CPU and disk.</p>', fix:'<p>Split the work. A <b>URL frontier</b> (priority queues plus a politeness queue for each host) feeds a fleet of <b>crawlers</b>. They write raw pages to a distributed <b>page store</b>.</p><p>A separate <b>indexing pipeline</b> (MapReduce-style batch jobs) turns pages into index files. Serving machines only serve.</p>', sub:{web:'serving only'}, before:{lat:1800, err:1.5, load:130}, after:{lat:450, err:.1, load:45}, flow:[['front', 'crawl', 'next URLs'], ['crawl', 'docs', 'pages'], ['docs', 'idxr'], ['idxr', 'idx', 'new index']], lesson:['inverted-index', 'batch-vs-stream']},
    {title:'The index no longer fits one machine', scale:'1B pages', hot:['idx', 'web'], breaks:'<p>The index is now terabytes. One machine takes seconds to read it for a query, and it cannot even hold the files.</p>', fix:'<p><b>Shard by document</b>: split the pages into N groups, each with its own small, complete index. A <b>root (mixer)</b> sends every query to all shards in parallel. Each shard returns its local top results, and the root merges them. This is <b>scatter-gather</b>.</p><p>Each shard is independent, and adding pages is easy.</p>', sub:{idx:'N shards by doc'}, before:{lat:6000, err:5, load:300}, after:{lat:600, err:.3, load:60}, flow:[['web', 'root', 'query'], ['root', 'idx', 'top-k from each shard']], lesson:['sharding', 'inverted-index']},
    {title:'More users, and machines fail daily', scale:'1,000s of QPS', hot:['root', 'idx'], breaks:'<p>Each shard has one copy. A shard server can answer only so many queries a second, and with thousands of machines some fail every day. Every failure hides part of the web.</p>', fix:'<p><b>Replicate every shard</b> (R copies) and put a <b>load-balancing front end</b> before the query servers. For each query, the root picks one healthy replica of each shard.</p><p>Capacity grows by adding replicas, and a dead machine just drops out of the rotation.</p>', sub:{idx:'shards × R copies'}, before:{lat:2500, err:4, load:180}, after:{lat:350, err:.05, load:55}, flow:[['u', 'gfe', 'query'], ['gfe', 'web'], ['web', 'root'], ['root', 'idx', 'one replica per shard']], lesson:['replication', 'lb-algorithms']},
    {title:'Disk seeks dominate latency', scale:'10K+ QPS', hot:['idx'], breaks:'<p>Every query term costs disk seeks on every shard. A seek takes about 10 ms, and a query with several terms touches several lists. Building snippets needs each page’s text, which is even more I/O.</p>', fix:'<p>Serve the <b>index from RAM</b>, with compressed posting lists (deltas and variable-length integers) so it fits. Jeff Dean described Google moving to an in-memory index around 2001.</p><p>Add separate <b>doc servers</b> that hold page text for snippets, also sharded and replicated.</p>', sub:{idx:'RAM, compressed'}, before:{lat:900, err:.4, load:110}, after:{lat:250, err:.05, load:50}, flow:[['root', 'idx', 'RAM lookup'], ['root', 'docsrv', 'snippets for top 10']], lesson:['latency-numbers', 'storage-types']},
    {title:'The same queries, over and over', scale:'50K QPS', hot:['root', 'idx'], breaks:'<p>Popular queries (“weather”, “ipl score”, “facebook”) are worked out again on thousands of shard servers millions of times a day. Every machine burns capacity on identical work.</p>', fix:'<p>Add a <b>results cache</b> in front of the root. Its key is the cleaned query plus language and region, with a short TTL so fresh results still appear.</p><p>A large share of traffic never reaches the shards, and a cached query costs a single lookup.</p>', before:{lat:600, err:.8, load:140}, after:{lat:180, err:.05, load:60}, flow:[['web', 'rcache', 'hit']], lesson:['cache-strategies', 'cache-layers']},
    {title:'Tail latency at 1,000-way fan-out', scale:'1,000-way fan-out', hot:['root'], breaks:'<p>If each shard server is slow 1% of the time, a query that waits for 1,000 of them is slow with probability 1 − 0.99<sup>1000</sup> ≈ 100%. A garbage collection pause, a busy neighbour or a hiccupping disk on <i>any</i> machine delays <i>every</i> query.</p>', fix:'<p>Fight the tail, not the average. With <b>hedged requests</b>, if a replica has not answered by its p95 time, send the same request to a second replica and use the first answer.</p><p>With <b>deadlines and partial results</b>, drop a slow shard instead of waiting, because slightly fewer results beat a slow page. Try the simulator in the Deep dives tab.</p>', sub:{root:'hedge + deadline'}, before:{lat:1400, err:.6, load:70}, after:{lat:200, err:.05, load:72}, flow:[['root', 'idx', 'request'], ['root', 'idx', 'hedge after p95']], lesson:['percentiles-tail-latency', 'timeouts-retries']},
    {title:'Breaking news is invisible', scale:'news in minutes', hot:['idxr'], breaks:'<p>The index is rebuilt by big batch jobs, so a page published this morning appears in days. For “earthquake now” or a live match, that is a wrong answer (counted here as an error).</p>', fix:'<p>Use <b>incremental indexing</b>: update the index as pages are crawled, instead of rebuilding it. Google described this as Caffeine (2010), built on Percolator, which applies small transactional updates to Bigtable.</p><p>Add a small, fast <b>fresh tier</b> that the root queries alongside the main index. Sites that change often are recrawled within minutes.</p>', sub:{idxr:'incremental'}, before:{lat:220, err:3, load:75}, after:{lat:210, err:.1, load:70}, flow:[['crawl', 'docs', 'new page'], ['docs', 'idxr'], ['idxr', 'fresh', 'minutes later'], ['root', 'fresh', 'query both tiers']], lesson:['cdc', 'lambda-kappa']},
    {title:'Words aren’t meaning', scale:'15% new queries', hot:['root'], breaks:'<p>Keyword matching fails on typos, synonyms and natural language (“can you get medicine for someone pharmacy”). Pure term matching also rewards pages stuffed with keywords. The share of unhelpful results (counted as errors here) climbs.</p>', fix:'<p>Add <b>query understanding</b> before retrieval: spelling correction, synonyms, language and intent detection, and ML language models (Google announced BERT for Search in 2019).</p><p>Rank in <b>two phases</b>. Cheap scoring on every shard keeps a few hundred candidates. Then the root applies the expensive ML ranking only to those.</p>', sub:{root:'2-phase rank'}, before:{lat:230, err:4, load:70}, after:{lat:240, err:.6, load:78}, flow:[['web', 'qu', 'rewrite query'], ['web', 'root'], ['root', 'idx', 'cheap top-k']], lesson:['bm25-ranking', 'vector-search-rag']},
    {title:'One data centre for the planet', scale:'billions of users', hot:['gfe'], breaks:'<p>Users far from the data center pay 200 ms or more of network round trips before the search even starts. A power or network failure there takes Search down everywhere.</p>', fix:'<p>Run full serving stacks, each with complete index replicas, in <b>many data centers</b>. Send users to a nearby healthy one (DNS or anycast), and end TLS at <b>edge PoPs</b> near users so handshakes are short.</p><p>If a data center fails, traffic shifts to the others. Capacity is planned with that spare room.</p>', sub:{gfe:'many DCs'}, before:{lat:650, err:.5, load:85}, after:{lat:190, err:.02, load:60}, flow:[['u', 'edge', 'nearest PoP'], ['edge', 'gfe', 'healthy DC']], lesson:['geodns-anycast', 'multi-az-region']}],
  flows:[
    {name:'Run a search (cache miss)', steps:[
      {note:'The query reaches the nearest edge PoP (TLS ends close to the user), then a front end in a healthy data center.', flow:[['u', 'edge', 'q=ipl schedule'], ['edge', 'gfe'], ['gfe', 'web']]},
      {note:'The query server checks the results cache (a miss) and asks query understanding to fix spelling and add synonyms.', flow:[['web', 'rcache', 'miss'], ['web', 'qu', 'rewrite']], parallel:true},
      {note:'The root sends the query to one replica of every index shard, and to the fresh tier, all in parallel and with a deadline.', flow:[['web', 'root'], ['root', 'idx', 'top-k'], ['root', 'fresh', 'top-k']]},
      {note:'Shards return their best local candidates. The root merges them and re-ranks the best few hundred with heavier ML.', flow:[['idx', 'root', 'candidates'], ['fresh', 'root']], parallel:true},
      {note:'The root fetches titles and query-specific snippets for the final 10 from the doc servers.', flow:[['root', 'docsrv', 'snippets']]},
      {note:'The page goes back to the user, and the result is cached briefly for the next person who asks the same thing.', flow:[['root', 'web'], ['web', 'rcache', 'SET'], ['web', 'gfe'], ['gfe', 'edge'], ['edge', 'u', '10 results']]}]},
    {name:'A new page gets indexed', steps:[
      {note:'Links found on other pages enter the frontier. It orders URLs by importance and enforces politeness for each host (robots.txt and rate limits).', flow:[['front', 'crawl', 'next URL for host']]},
      {note:'A crawler fetches the page, pulls out its links (which go back to the frontier) and stores the content.', flow:[['crawl', 'front', 'new links'], ['crawl', 'docs', 'store page']]},
      {note:'The incremental pipeline parses the page, removes duplicates, scores it and splits it into tokens. It updates the fresh tier within minutes and the main index later.', flow:[['docs', 'idxr'], ['idxr', 'fresh', 'add postings'], ['idxr', 'idx', 'merge later']]}]}],
  breakIt:[
    {label:'Lose a rack of index servers', kill:['idx'], verdict:'survives', text:'Every shard has many replicas spread across racks, so the root picks other replicas. If every replica of one shard were gone, the root would return results without that shard (a small slice of the web missing) instead of failing the query.', flow:[['root', 'idx', 'other replica']]},
    {label:'Results cache dies', kill:['rcache'], verdict:'degrades', text:'All traffic now hits the root and the shards. Capacity must be planned for this (or the cache rebuilt slowly). Otherwise delay climbs and queries start to be dropped.', flow:[['web', 'root', 'every query']]},
    {label:'Query understanding is down', kill:['qu'], verdict:'degrades', text:'Fall back to the raw query after a short timeout. There are no spelling fixes or synonyms, so some results get worse, but Search keeps answering.'},
    {label:'Crawlers & indexing stop', kill:['crawl', 'idxr'], verdict:'survives', text:'Serving uses the existing index, so users notice nothing at first. Freshness slowly gets worse: new pages and news stop appearing until the pipeline is back.'},
    {label:'One shard replica is slow (GC pause)', hot:['idx'], verdict:'survives', text:'Hedged requests send a duplicate to another replica after the p95 delay. The first answer wins and the slow one is cancelled. Users never see the pause.', flow:[['root', 'idx', 'hedge']]},
    {label:'A whole data centre goes dark', kill:['gfe', 'web', 'root'], verdict:'degrades', text:'This diagram shows one data center. DNS and anycast stop sending users here within seconds to minutes, and other data centers take the load. Only queries in flight fail.'}],
  dataModel:{lang:'ts', title:'index shard layout', code:`// One document-partitioned index shard (docIDs [lo, hi))
type DocId = number;                       // local to the shard
interface TermEntry { df: number; postingsOffset: number }
const lexicon: Map<string, TermEntry>;     // term → where its postings start

// Postings: sorted by docId, delta-encoded, varint-compressed
//   "cricket" → [(4, tf=2, pos=[3,9]), (+7, tf=1, pos=[0]), ...]
interface Posting { docDelta: number; tf: number; positions: number[] }

// Per-document static scores, read at query time
interface DocInfo { url: string; pageRank: number; lang: string; spamScore: number; crawledAt: number }

// Doc servers (separate tier): docId → compressed page text, for snippets
// URL frontier: (host, nextFetchAt, priority, url), plus robots.txt cache per host`, notes:'With document partitioning, each shard can answer a query on its own and the root just merges. Term partitioning (one shard for each range of words) would need fewer machines for a query. But multi-word queries would cross shards, and load would lean toward popular words.'},
  apis:[
    {m:'GET', path:'/search?q=ipl+schedule&hl=en&gl=in&start=0', note:'The public entry point (simplified). Responses depend on language and region, so caches key on those too.', res:'200 OK\n{ "spelling": null, "results": [ { "url": "https://iplguide.example/schedule", "title": "IPL 2026 schedule and venues", "snippet": "Full IPL cricket <b>schedule</b> with match dates…" } ], "next": "start=10" }'},
    {m:'RPC', path:'Root → Shard: Search', note:'Internal (educational). Each shard returns its local top results, and the deadline lets the root drop slow ones.', req:'{ "terms": ["ipl", "schedule"], "k": 300, "deadline_ms": 60, "lang": "en" }', res:'{ "shard": 1874, "hits": [ { "doc": 88210, "score": 12.7 }, ... ], "partial": false }'},
    {m:'RPC', path:'Indexer → Fresh tier: Upsert', note:'Internal (educational). It is safe to repeat for the same (url, crawl version), so re-delivered updates do no harm.', req:'{ "url": "https://sportsdaily.example/india-squad", "version": 1731456000, "terms": {"india": [0, 7], "squad": [2]}, "static_score": 0.41 }'}],
  algorithm:{title:'Inverted index + PageRank ranking, then tail-tolerant fan-out', html:'<p>Retrieval finds pages that contain the query terms by walking <b>posting lists</b>. Ranking then puts them in order.</p><p>The original Google combined text relevance with <b>PageRank</b>. A page is important if important pages link to it. It is computed as the steady state of a “random surfer” who follows links with probability <i>d</i> and otherwise jumps to a random page.</p><p>Below is a working miniature. Change the authority weight and watch the keyword-stuffed page fall. Then use the fan-out simulator to see why serving across thousands of shards is a tail-latency problem.</p>', mount:miniGoogle, pg:'tail-latency'},
  tradeoffs:[['Shards split by document', 'Each shard answers on its own, adding pages and replicas is easy, and a failure removes a slice and not a word', 'Every query touches every shard. The fan-out is huge, so tail latency must be engineered'], ['The index in RAM', 'Removes the disk seek of about 10 ms from every term lookup', 'Expensive: thousands of servers’ worth of memory for each index copy'], ['Hedged requests and partial results', 'The p99 stays close to the p50, even at a fan-out of 1,000', 'A few percent more load, and results are sometimes slightly incomplete'], ['Incremental indexing with a fresh tier', 'News is searchable in minutes', 'A more complex pipeline, and two tiers to merge and keep consistent'], ['Two-phase ranking', 'The expensive ML runs on only a few hundred candidates', 'A relevant page missed by the cheap first phase can never be recovered']],
  alternatives:[['A term-partitioned index', 'Fewer machines for each query, but load piles onto popular terms and multi-term queries need joins across shards'], ['An Elasticsearch or Lucene cluster', 'The same ideas (a sharded inverted index and scatter-gather). It is the right choice for site or company search, but it is not tuned for hundreds of billions of documents'], ['Pure vector (embedding) search', 'Great for meaning but weak for exact names, numbers and rare terms. Modern engines combine keyword and semantic retrieval'], ['Batch-only indexing', 'Simpler, but days old. That is not acceptable for news and live events']],
  failures:[['An index shard replica fails', 'The root picks another replica, and hedging hides slow ones'], ['All replicas of a shard fail', 'Return partial results without that shard instead of failing'], ['The results cache fails', 'Serve from the shards with planned spare capacity, and shed the lowest-priority traffic'], ['The indexing pipeline fails', 'Serve the existing index, and freshness gets worse gradually'], ['A data center fails', 'DNS and anycast move users to other data centers that have full index copies']],
  lab:{stack:['Python or Go', 'A Wikipedia dump (no live crawling needed)', 'SQLite/LevelDB for the page store', 'gRPC or HTTP for shards', 'Docker Compose', 'k6 or vegeta'], milestones:[
    {day:'Day 1: index & rank', items:['Parse 100K Wikipedia articles, and build an inverted index with positions', 'BM25 scoring for multi-word queries', 'PageRank over the article link graph (power iteration)', 'CLI: query → top 10 with snippets']},
    {day:'Day 2: shard & serve', items:['Split documents into 4 shards, each a separate process', 'Root service: fan out, merge top-k, attach snippets', 'Results cache with a short TTL', 'Add per-shard deadlines and partial results']},
    {day:'Day 3: tail & freshness', items:['Inject random 200 ms pauses into one shard, and measure p99', 'Add hedged requests after the p95 delay, and measure again', 'A small “fresh” shard fed by an add-document endpoint', 'Dashboard: QPS, p50/p99, cache hit ratio, partial-result rate']}],
   pseudocode:{lang:'ts', code:`// Root: scatter-gather with hedging and a deadline
async function search(query: string, k = 10) {
  const deadline = Date.now() + 80;                       // ms budget for the shard phase
  const perShard = shards.map(shard => hedged(
    replica => replica.search(query, { k: 300, deadlineMs: 60 }),
    shard.replicas, shard.p95Ms));
  const settled = await allUntil(perShard, deadline);     // stragglers are dropped
  const candidates = mergeTopK(settled.flatMap(r => r.hits), 300);
  const ranked = await mlRerank(query, candidates);       // expensive, only on 300
  return attachSnippets(ranked.slice(0, k), { partial: settled.length < shards.length });
}

async function hedged(call, replicas, hedgeAfterMs) {
  const [a, b] = pickTwo(replicas);
  const first = call(a);
  const backup = sleep(hedgeAfterMs).then(() => call(b));  // only if 'first' is slow
  return Promise.any([first, backup]);                     // cancel the loser in real code
}`},
   loadTest:'<p>Replay a Zipf-distributed query log (a few very popular queries, a long tail of rare ones) at 500 QPS against the root. Record p50 and p99 with and without the results cache. Then add a 1% chance of a 200 ms pause per shard request and compare p99 with hedging off and on. Also track the extra load that hedging adds, which should be a few percent.</p>'},
  twists:[{q:'A cricket final ends and “who won” queries jump 1,000 times in one minute. What happens?', a:'The results cache would serve old answers, so freshness-sensitive queries get short TTLs or skip it. The fresh tier must index the news within minutes. The spike is mostly identical queries, so cache coalescing (one backend job for many waiting users) protects the shards. Live answer boxes, such as score cards, come from structured data feeds and not from the web index.'}, {q:'Why partition the index by document and not by term?', a:'Splitting by term sends a query only to the shards that own its words. But popular words make hot shards, multi-word queries must join lists across machines, and updating one page touches many shards. Splitting by document makes each shard a complete mini-index. Queries run in parallel, an update touches one shard, and a failure removes a slice of pages. The cost is the fan-out to every shard, which is why tail-latency tricks matter.'}, {q:'How would you add semantic (“meaning”) search?', a:'Use hybrid retrieval. Keep the keyword index for exact matches, and add an embedding index (approximate nearest neighbour, such as HNSW or IVF-PQ) split the same way. Get candidates from both, merge them, then re-rank the top few hundred with a cross-encoder or another ML model. Watch the cost: embeddings for hundreds of billions of pages are huge, so you may embed only important pages or passages.'}, {q:'A site owner says “remove this page, it is private”. How fast can you comply?', a:'Take the URL out of the serving path first. Add it to a block list that every root checks, which works within minutes and also hides cached copies. Then drop it from the index in the next incremental update, and purge the results cache and snippet store for that URL. Recrawl it to confirm the page returns 404 or noindex.'}],
  real:[
    {co:'Google (1998)', tier:'confirmed', text:'The original design: a distributed crawler, a URL server, a repository of compressed pages, an indexer producing “barrels” (shards) of the inverted index, and ranking that combined text features with PageRank.', src:'Brin & Page, “The Anatomy of a Large-Scale Hypertextual Web Search Engine” (WWW 1998)'},
    {co:'Google (2003)', tier:'confirmed', text:'Queries go to index servers holding randomly partitioned “index shards”, each served by a pool of replicas behind load balancers, then to document servers for titles and snippets. The system ran on many thousands of commodity PCs.', src:'Barroso, Dean & Hölzle, “Web Search for a Planet: The Google Cluster Architecture” (IEEE Micro 2003)'},
    {co:'Google', tier:'confirmed', text:'Serving moved to an in-memory index in the early 2000s, with successive changes to index encoding, caching and tiering over the decade.', src:'Jeff Dean, “Challenges in Building Large-Scale Information Retrieval Systems” (WSDM 2009 keynote)'},
    {co:'Google', tier:'confirmed', text:'Caffeine (2010) replaced batch index rebuilds with incremental processing. The Percolator paper describes transactional, observer-driven incremental updates on Bigtable.', src:'Google blog, “Our new search index: Caffeine” (2010), Peng & Dabek, “Large-scale Incremental Processing Using Distributed Transactions and Notifications” (OSDI 2010)'},
    {co:'Google', tier:'confirmed', text:'Hedged and tied requests, micro-partitioning and selective replication are used to tame tail latency in large fan-out services such as search.', src:'Dean & Barroso, “The Tail at Scale” (CACM 2013)'},
    {co:'Modern ranking', tier:'inference', text:'Today’s ranking uses many signals and ML models (BERT was announced for Search in 2019). The two-phase “cheap retrieval then expensive re-rank” structure here is a standard industry pattern, not a disclosed Google design.', src:'Google Search blog, “Understanding searches better than ever before” (2019), general IR literature'},
    {co:'Shard and replica counts', tier:'educational', text:'The shard count, replica count and crawl bandwidth in the Setup tab are back-of-envelope numbers chosen for teaching, not Google figures.', src:'This case study’s estimates'}],
  sources:['Brin & Page: The Anatomy of a Large-Scale Hypertextual Web Search Engine (1998)', 'Barroso, Dean & Hölzle: Web Search for a Planet: The Google Cluster Architecture (IEEE Micro 2003)', 'Jeff Dean: Challenges in Building Large-Scale Information Retrieval Systems (WSDM 2009 keynote)', 'Peng & Dabek: Large-scale Incremental Processing Using Distributed Transactions and Notifications (OSDI 2010)', 'Dean & Barroso: The Tail at Scale (CACM 2013)', 'Dean & Ghemawat: MapReduce: Simplified Data Processing on Large Clusters (OSDI 2004)', 'Manning, Raghavan & Schütze: Introduction to Information Retrieval (2008)', 'Google: How Search Works (official site)']
});

/* ======================= 2. YOUTUBE ======================= */
SDA.register({kind:'case', id:'youtube', tier:'flagship', icon:'▶️', title:'YouTube (video upload & streaming)', tagline:'500 hours uploaded every minute, and a billion hours watched a day.', tags:['video', 'transcoding', 'cdn', 'adaptive bitrate', 'vitess', 'recommendations', 'view counts'],
  modules:['realtime', 'traffic', 'databases', 'async', 'search'],
  summary:'A video platform accepts huge uploads, turns each into many sizes, and streams them to every kind of device. The design is about resumable uploads, a transcoding pipeline, edge caches, sharded metadata, view counting and recommendations.',
  accuracy:'Public facts (upload rate, watch time, Vitess, the 2016 recommendations paper, Argos video chips, Content ID and caches inside ISPs) are marked confirmed. How YouTube wires these together inside is not fully public, so the pipeline and data model here are inference or a simplified teaching design. The numbers are illustrative unless marked as public.',
  overview:{what:'<b>A small example.</b> A creator uploads a 4K video from a phone. A few minutes later, anyone can watch it on a smart TV or a 3G phone. It starts in about a second, and the quality adapts to the viewer’s network. The page shows view counts, likes and “up next” videos.', in:['Resumable upload', 'Transcoding into many resolutions and codecs', 'Streaming with adaptive bitrate (ABR)', 'Video metadata, thumbnails, likes and view counts', 'Home-page and “up next” recommendations', 'Copyright matching and safety checks on uploads'], out:['Live streaming (see the Hotstar case)', 'Comments system in depth', 'Ads serving and creator payouts', 'Search over videos (see the Google Search case)']},
  challenges:['Uploads are huge (several GB) over unreliable mobile networks', 'Transcoding needs a lot of compute, and uploads never stop', 'Video is most of the bytes, and viewers are everywhere', 'A long-tailed catalog: billions of videos, most rarely watched, so caching is hard', 'Hot metadata: a viral video’s view and like counts change all the time', 'Recommendations must pick a handful of videos out of billions in milliseconds'],
  fr:['Upload a video (resumable), with title, description and thumbnail', 'Watch any video on any device with adaptive quality', 'See view count, likes and channel info', 'Home feed and “up next” recommendations', 'Creators see processing status and basic analytics'],
  nfr:['Video starts in about 1 s and rebuffers rarely (an illustrative target)', 'An upload is never lost once acknowledged', 'Watching stays highly available, even if uploads or recommendations get worse', 'View counts can lag, but must not be easy to inflate with bots', 'The cost for each hour streamed must keep falling (codecs and caching)'],
  scale:[{k:'Uploads', v:'500+ hours of video a minute', math:'From a YouTube press figure (2019): 500 hours every 60 seconds', tag:'public'}, {k:'Watch time', v:'1B+ hours a day', math:'From a YouTube announcement (2017)', tag:'public'}, {k:'Video uploaded a day', v:'720K hours', math:'500 hours a minute × 60 minutes × 24 hours = 720,000', tag:'illustrative'}, {k:'Average concurrent streams', v:'≈ 42M', math:'1B hours a day × 3,600 s ÷ 86,400 s ≈ 41.7M', tag:'illustrative'}, {k:'Average traffic out', v:'≈ 100 Tbps', math:'42M streams × about 2.5 Mbps on average = 105 million Mbps ≈ 100 Tbps', tag:'illustrative'}, {k:'New encoded storage a day', v:'≈ 6 PB', math:'720K hours × 3,600 s = 2.6B s of video. About 9 Mbps of renditions for each codec × 2 codecs = 18 Mbps. 2.6B s × 18 Mbps ÷ 8 ≈ 5.8 PB', tag:'illustrative'}, {k:'Metadata', v:'tens of TB', math:'Billions of videos × about 5 KB (title, description, ids and counters). Say 5B × 5 KB = 25 TB', tag:'illustrative'}],
  arch:{w:960, h:370, minW:680, nodes:[
    {id:'u', type:'client', label:'Users', sub:'watch, upload', x:70, y:175, w:110},
    {id:'edge', type:'cdn', label:'Edge caches', sub:'inside ISPs too', x:210, y:175, w:130, stage:3},
    {id:'lb', type:'lb', label:'Load balancer', sub:'API', x:350, y:175, w:120, stage:1},
    {id:'app', type:'service', label:'Web/API server', sub:'1 server', x:500, y:175, w:130},
    {id:'meta', type:'db', label:'Metadata DB', sub:'MySQL', x:700, y:175, w:140},
    {id:'up', type:'service', label:'Upload service', sub:'resumable chunks', x:210, y:60, w:130, stage:2},
    {id:'q', type:'queue', label:'Transcode jobs', x:360, y:60, w:142, stage:2},
    {id:'tx', type:'service', label:'Transcoders', sub:'ladder × codecs', x:500, y:60, w:120, stage:2},
    {id:'blob', type:'db', label:'Video storage', sub:'object store', x:650, y:60, w:120, stage:1},
    {id:'cid', type:'service', label:'Content ID & safety', sub:'fingerprints', x:822, y:60, w:168, stage:9},
    {id:'mcache', type:'cache', label:'Metadata cache', sub:'memcache', x:350, y:325, w:130, stage:4},
    {id:'views', type:'queue', label:'View events', sub:'stream', x:520, y:325, w:132, stage:6},
    {id:'an', type:'db', label:'Counters', sub:'views, analytics', x:700, y:325, w:140, stage:6},
    {id:'rec', type:'service', label:'Recommendations', sub:'candidates → rank', x:870, y:325, w:152, stage:7}],
   edges:[{from:'u', to:'app', gone:1}, {from:'u', to:'lb', stage:1, gone:3}, {from:'u', to:'edge', stage:3}, {from:'edge', to:'lb', stage:3}, {from:'lb', to:'app', stage:1}, {from:'app', to:'meta'},
     {from:'app', to:'blob', stage:1}, {from:'u', to:'up', stage:2}, {from:'up', to:'q', stage:2}, {from:'q', to:'tx', stage:2}, {from:'tx', to:'blob', stage:2}, {from:'edge', to:'blob', stage:3, curve:.7},
     {from:'app', to:'mcache', stage:4}, {from:'app', to:'views', stage:6}, {from:'views', to:'an', stage:6}, {from:'app', to:'rec', stage:7}, {from:'rec', to:'an', stage:7}, {from:'blob', to:'cid', stage:9}]},
  evolution:[
    {title:'One server + one database', scale:'a few K videos', fix:'<p>One web server keeps uploaded MP4 files on its own disk and their titles in MySQL. Viewers download the file from the same server as it plays. This is fine for a club or a class.</p>', after:{lat:600, err:.2, load:20}},
    {title:'The disk fills, and one server cannot stream', scale:'100K videos', hot:['app'], breaks:'<p>The video files fill the disk, and a few hundred viewers at once saturate the server’s network card. When the server dies, every video disappears with it.</p>', fix:'<p>Move the video files to a replicated <b>object store</b>. Run several <b>stateless web servers</b> behind a <b>load balancer</b>. The servers keep only the metadata logic, and any server can serve any video.</p>', sub:{app:'stateless × N'}, before:{lat:4000, err:6, load:170}, after:{lat:700, err:.2, load:55}, flow:[['u', 'lb', 'GET /watch'], ['lb', 'app'], ['app', 'blob', 'read file']], lesson:['storage-types', 'vertical-vs-horizontal']},
    {title:'Raw 4K uploads don’t play on phones', scale:'10K uploads/day', hot:['app'], breaks:'<p>Big uploads tie up web servers for minutes, and they restart from zero when a phone loses signal. The original 4K file cannot play on a 3G phone and wastes bandwidth everywhere else.</p>', fix:'<p>A dedicated <b>upload service</b> accepts <b>resumable uploads in chunks</b>. When an upload completes, it puts a <b>transcode job</b> on a queue.</p><p>A fleet of <b>transcoders</b> makes a ladder of renditions (144p to 4K, in several codecs), cut into segments of a few seconds for adaptive streaming (DASH or HLS), and writes them to storage.</p>', before:{lat:3000, err:4, load:140}, after:{lat:650, err:.2, load:50}, flow:[['u', 'up', 'chunk 37/80'], ['up', 'q', 'job'], ['q', 'tx'], ['tx', 'blob', '144p…4K segments']], lesson:['transcoding-pipeline', 'queues-pubsub-streams']},
    {title:'Bandwidth melts the origin', scale:'1B views/day', hot:['blob', 'lb'], breaks:'<p>Every view streams from the origin data center. The bill for traffic out explodes, links across oceans jam at the evening peak, and faraway viewers keep buffering.</p>', fix:'<p>Serve video from <b>edge caches</b> close to viewers, including caches placed <b>inside ISPs’ networks</b>, filled from the origin on a miss.</p><p>Players use <b>adaptive bitrate</b>. They fetch a manifest, start on a low rung for a fast start, then switch up or down for each segment as bandwidth changes.</p>', sub:{blob:'origin only'}, before:{lat:2500, err:2.5, load:180}, after:{lat:350, err:.1, load:45}, flow:[['u', 'edge', 'segment 12 @720p'], ['edge', 'blob', 'miss → fill']], lesson:['cdn', 'live-streaming-abr']},
    {title:'Watch pages hammer MySQL', scale:'100K pages/s', hot:['meta'], breaks:'<p>Every watch page reads the title, channel, thumbnails and counts. The main database spends its life on identical reads of popular videos, and replication lag grows.</p>', fix:'<p>Cache metadata in a <b>memcache</b> tier (cache-aside, a short TTL, and a delete when a video is edited), and add <b>read replicas</b>. Popular videos are served almost entirely from RAM.</p>', before:{lat:900, err:.8, load:130}, after:{lat:250, err:.05, load:55}, flow:[['app', 'mcache', 'hit']], lesson:['cache-strategies', 'replication']},
    {title:'One MySQL primary can’t take the writes', scale:'billions of rows', hot:['meta'], down:[], breaks:'<p>Uploads, likes, subscriptions and edits all go to one primary. Tables grow bigger than one machine can hold, schema changes take days, and failover is risky.</p>', fix:'<p><b>Shard MySQL</b> by video or channel id, behind a routing layer. YouTube built <b>Vitess</b> for this. Applications talk to a proxy that routes each query to the right shard, pools connections, and manages resharding and failover.</p>', sub:{meta:'Vitess (sharded)'}, before:{lat:800, err:1.2, load:120}, after:{lat:240, err:.05, load:50}, flow:[['app', 'meta', 'routed to shard 17']], lesson:['sharding', 'connection-pooling']},
    {title:'View counts become a hot-row war', scale:'50K views/s', hot:['meta'], breaks:'<p><code>UPDATE videos SET views = views + 1</code> on a viral video locks one row tens of thousands of times a second. Bots can also inflate the views.</p>', fix:'<p>Write <b>view events</b> to a stream instead. Consumers check them (bot and spam filtering), then add up the counts for each video for each minute in a <b>counter store</b>, and fold the totals into the metadata now and then.</p><p>Counts are eventually consistent. They may lag or pause while they are checked.</p>', sub:{meta:'Vitess (sharded)'}, before:{lat:1200, err:2, load:150}, after:{lat:240, err:.05, load:55}, flow:[['app', 'views', 'view event'], ['views', 'an', 'aggregate']], lesson:['queues-pubsub-streams', 'hll-cms']},
    {title:'Billions of videos: what to watch?', scale:'2B+ users', hot:['app'], breaks:'<p>Showing “most popular” to everyone gives poor engagement. Scoring billions of videos for every request is impossible within a page-load budget.</p>', fix:'<p>Use a <b>two-stage recommender</b>. <b>Candidate generation</b> narrows billions of videos to hundreds using the user’s history (a nearest-neighbour search over learned embeddings). Then a <b>ranking</b> model scores those hundreds with rich features.</p><p>The training data comes from the engagement events.</p>', before:{lat:450, err:.3, load:80}, after:{lat:260, err:.05, load:60}, flow:[['app', 'rec', 'up next?'], ['rec', 'an', 'features']], lesson:['recommendations', 'vector-search-rag']},
    {title:'Transcoding can’t keep up', scale:'500 h/min uploads', hot:['q', 'tx'], breaks:'<p>Encoding every upload into every size and codec in software needs huge compute (try the calculator in Deep dives). Queues back up, and a creator’s premiere stays “processing” for hours.</p>', fix:'<p>Split each video into chunks, transcode them <b>in parallel</b>, then stitch them together. Give jobs a priority (premieres and big channels first). Encode cheap codecs at once, and expensive ones (VP9 and AV1) only for videos that get views.</p><p>Google built a custom video transcoding chip (the <b>Argos VCU</b>) to cut the cost further.</p>', sub:{tx:'chunks + VCUs'}, before:{lat:300, err:1.5, load:190}, after:{lat:260, err:.05, load:65}, flow:[['q', 'tx', 'chunk jobs'], ['tx', 'blob', 'renditions']], lesson:['transcoding-pipeline', 'backpressure']},
    {title:'Copyright & safety at upload speed', scale:'every upload', hot:['blob'], breaks:'<p>Re-uploaded films and music, and harmful content, spread before anyone reviews them. People cannot review 500 hours of video a minute.</p>', fix:'<p>Fingerprint the audio and video of every upload and match it against reference files from rights holders (<b>Content ID</b>), and add ML safety classifiers.</p><p>A match applies the rights holder’s policy (block, track or earn money). Risky videos wait for a human review.</p>', before:{lat:280, err:1, load:70}, after:{lat:260, err:.05, load:65}, flow:[['tx', 'blob', 'stored'], ['blob', 'cid', 'fingerprint & match']], lesson:['event-driven', 'workflow-orchestration']}],
  flows:[
    {name:'Watch a video', steps:[
      {note:'The app asks for the watch page through the edge. The API server reads the metadata from the cache and asks for “up next”.', flow:[['u', 'edge', 'GET /watch?v=…'], ['edge', 'lb'], ['lb', 'app'], ['app', 'mcache', 'title, channel'], ['app', 'rec', 'up next']]},
      {note:'The player fetches the manifest (the list of renditions and segment URLs) and the first segment at a low bitrate for a fast start.', flow:[['u', 'edge', 'manifest + seg 1 @240p']]},
      {note:'A segment that is not yet at this edge is fetched once from the origin storage, then served to everyone nearby.', flow:[['edge', 'blob', 'miss → fill'], ['blob', 'edge'], ['edge', 'u']]},
      {note:'As the buffer grows, ABR switches up to 720p or 1080p, one segment at a time. On a slow network it drops down instead of stalling.', flow:[['u', 'edge', 'seg 2 @720p'], ['u', 'edge', 'seg 3 @1080p']]},
      {note:'The player sends a view event. It is checked and counted in the background, never on the playback path.', flow:[['u', 'edge', 'view ping'], ['edge', 'lb'], ['lb', 'app'], ['app', 'views'], ['views', 'an', '+1 (validated)']]}]},
    {name:'Upload a video', steps:[
      {note:'The app opens a resumable upload session and sends chunks. After a dropped connection it asks “how much do you have?” and resumes.', flow:[['u', 'up', 'chunk 1…80']]},
      {note:'When the upload is complete, the upload service records the video as “processing” and puts a transcode job on the queue.', flow:[['up', 'q', 'transcode v=…']]},
      {note:'Transcoders split the video into chunks, encode a ladder of renditions in parallel and write the segments to storage.', flow:[['q', 'tx'], ['tx', 'blob', 'renditions']]},
      {note:'Content ID and safety checks fingerprint the new video. If it passes, the video is marked public.', flow:[['blob', 'cid', 'match?']]}]}],
  breakIt:[
    {label:'An edge cache site fails', kill:['edge'], verdict:'degrades', text:'Players retry on another edge site or the origin. Delay and origin load rise, and viewers in that area may drop to lower bitrates for a while, but playback continues.', flow:[['edge', 'blob', 'more misses']]},
    {label:'Transcoders down', kill:['tx'], verdict:'degrades', text:'New uploads stay “processing” and the queue grows. The queue is durable, so nothing is lost. Watching existing videos is not affected at all, because the pipeline is off the playback path.'},
    {label:'Recommendations down', kill:['rec'], verdict:'degrades', text:'The watch page gives up on the call quickly and falls back to cached or popular lists. Engagement dips, and nothing breaks.'},
    {label:'Metadata cache flushed', kill:['mcache'], verdict:'degrades', text:'All reads hit Vitess at once. Request coalescing and load shedding protect the shards while the cache refills. Pages are slow for a few minutes.', flow:[['app', 'meta', 'cold reads']]},
    {label:'View-event pipeline stalls', kill:['views'], verdict:'survives', text:'Videos keep playing. Counts freeze and catch up when the consumers recover, because the events are buffered in the stream.'},
    {label:'A metadata shard primary dies', kill:['meta'], verdict:'degrades', text:'Vitess promotes a replica. Writes to that shard (uploads, likes for those videos) fail for a few seconds. Reads continue from replicas and cache, and the video bytes come from the edges anyway.', flow:[['app', 'mcache', 'cached reads']]}],
  dataModel:{lang:'sql', title:'metadata (sharded by video_id)', code:`CREATE TABLE videos (
  video_id     CHAR(11) PRIMARY KEY,           -- random base64url id, also the shard key
  channel_id   CHAR(24) NOT NULL,
  title        VARCHAR(100) NOT NULL,
  status       ENUM('processing','public','unlisted','private','blocked') NOT NULL,
  duration_s   INT,
  view_count   BIGINT NOT NULL DEFAULT 0,      -- folded in periodically from the counter store
  like_count   BIGINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL
);
CREATE TABLE renditions (                        -- one row per rendition
  video_id CHAR(11), codec VARCHAR(8), height SMALLINT, kbps INT,
  manifest_path VARCHAR(200), PRIMARY KEY (video_id, codec, height)
);
-- Counter store: (video_id, minute) → validated views, aggregated by stream consumers
-- Object store keys: /v/{video_id}/{codec}/{height}/seg_{n}.m4s`, notes:'Video bytes never touch the database. The rows hold only paths into the object store. Sharding by video_id spreads hot videos across shards. Queries for a channel (its list of uploads) use a separate index table split by channel_id.'},
  apis:[
    {m:'POST', path:'/upload/v1/videos?uploadType=resumable', note:'Creates a resumable session (simplified from public resumable-upload conventions). The client then sends chunks with PUT and Content-Range.', req:'{ "title": "Goa trip vlog", "privacy": "public" }', res:'200 OK\nLocation: /upload/v1/sessions/abc123'},
    {m:'PUT', path:'/upload/v1/sessions/abc123', note:'Send a chunk. After a disconnect, ask the session for the next byte offset.', req:'Content-Range: bytes 41943040-50331647/314572800\n<binary chunk>', res:'308 Resume Incomplete\nRange: bytes=0-50331647'},
    {m:'GET', path:'/watch/v1/{video_id}', note:'Watch-page data. The player then fetches the manifest and segments from the edge host it returns.', res:'{ "title": "Goa trip vlog", "views": 182344, "manifest": "https://edge-17.example/v/aB3xY/manifest.mpd", "up_next": ["Qw9…", "Zz1…"] }'}],
  algorithm:{title:'The transcoding bill and the long tail', html:'<p>Two numbers dominate the design. The first is <b>compute</b>. Every upload is encoded into many sizes and codecs, so the encoding cost grows with the upload rate × the ladder size × the codec cost.</p><p>The second is <b>the long tail</b>. Views are concentrated on popular videos, but there are so many unpopular ones that a cache holding only “the hits” still misses a lot. Use the two calculators to see both.</p>', mount:host => { transcodeCalc(host); host.append(hr()); longTailCache(host); }},
  tradeoffs:[['Transcode a full ladder at upload time', 'Instant start and smooth ABR for every viewer', 'Huge compute and storage, much of it for videos nobody watches, so encode expensive codecs only for popular ones'], ['Edge caches inside ISPs', 'Short paths, low transit cost, and the ISP benefits too', 'Running hardware in thousands of places, and cache misses on the long tail'], ['View counts that are eventually consistent', 'No hot rows, and room to filter bots before counting', 'Counts lag or pause, and users notice'], ['Vitess (sharded MySQL) instead of a new NoSQL store', 'Keeps SQL, transactions and existing code while scaling out', 'Queries across shards and resharding need care'], ['Two-stage recommendations', 'Scores billions of videos within a page-load budget', 'Candidate generation can miss good videos, and feedback loops can over-promote popular content']],
  alternatives:[['Transcode on the fly when requested', 'Saves storage for rarely watched videos, but the first viewer waits and popular videos are encoded again and again. At most it is used selectively'], ['A commercial CDN only', 'Good at small and medium scale. At this volume of traffic, owning edge capacity is far cheaper'], ['Cassandra or Bigtable for all metadata', 'Scales writes easily, but loses the SQL transactions and secondary indexes the product relies on'], ['Exact, synchronous view counts', 'Hot-row contention, and no time to filter bots']],
  failures:[['An edge site fails', 'Players fail over to another edge or the origin, and ABR lowers the bitrate if needed'], ['The transcoding fleet fails', 'The durable queue holds the jobs, and playback is not affected'], ['A metadata shard fails', 'Vitess promotes a replica, and reads continue from replicas and cache'], ['Recommendations fail', 'Fall back to popular or subscription lists'], ['A region fails', 'DNS steers users to other regions, and video is served from edges anyway']],
  lab:{stack:['Node.js or Go', 'FFmpeg', 'MinIO (S3-compatible storage)', 'Redis (queue + counters)', 'PostgreSQL', 'hls.js or dash.js player', 'Nginx as an edge cache'], milestones:[
    {day:'Day 1: upload & transcode', items:['Resumable chunked upload with an offset query', 'Queue a job, and a worker runs FFmpeg to produce 240p, 480p and 720p HLS renditions', 'Store segments + master playlist in MinIO', 'Video status: processing → public']},
    {day:'Day 2: stream', items:['A watch page with hls.js, and confirm ABR switching by throttling in DevTools', 'Nginx proxy_cache in front of MinIO as the “edge”', 'Cache-aside for metadata in Redis', 'Measure start time with a cold and a warm edge']},
    {day:'Day 3: counts & scale', items:['View events to a Redis Stream, and a consumer adds them up for each minute', 'Basic bot filter (one view per IP per video per 30 s)', 'Split transcoding by chunks across 3 workers and stitch', '“Up next” = most co-watched videos (simple item-to-item)']}],
   pseudocode:{lang:'ts', code:`// Transcode worker: split → encode chunks in parallel → package for ABR
async function handle(job: { videoId: string; source: string }) {
  const chunks = await splitAtKeyframes(job.source, 10 /* seconds */);
  const ladder = [{ h: 240, kbps: 400 }, { h: 480, kbps: 1000 }, { h: 720, kbps: 2500 }];
  await pMap(chunks.flatMap(c => ladder.map(r => ({ c, r }))),
             ({ c, r }) => ffmpeg(c, { height: r.h, bitrate: r.kbps, codec: 'h264' }),
             { concurrency: os.cpus().length });
  for (const r of ladder) await packageHls(job.videoId, r);   // segments + playlist per rung
  await writeMasterPlaylist(job.videoId, ladder);
  await db.query("UPDATE videos SET status='public' WHERE video_id=$1", [job.videoId]);
  queue.publish('fingerprint', { videoId: job.videoId });     // Content-ID-style check
}`},
   loadTest:'<p>Use k6 to simulate 2,000 viewers fetching segments for 50 videos with Zipf popularity (s ≈ 0.8) through the Nginx edge. Track the edge hit ratio, origin requests a second and segment p99 delay. Then upload 20 videos at once and watch the queue depth and the time to public. Add a second worker and compare.</p>'},
  twists:[{q:'A creator with 100M subscribers premieres a video. What do you do differently?', a:'Transcode ahead of the premiere with top priority and all codecs. Warm the edge caches with the first segments of every rendition. Cache the metadata with a long TTL. Protect the counter path from a burst of view events by batching. Give comments and likes their own capacity so they cannot starve playback.'}, {q:'How do you make a view count trustworthy?', a:'Count in the background from events. Filter out bots and repeated views (windows for each user, IP and device, watch-time limits and ML fraud scores), and only then add up. That is why counts can lag or pause on viral videos: the check is part of the pipeline. Approximate structures such as HyperLogLog estimate unique viewers cheaply.'}, {q:'Viewers in one region complain about buffering every evening. How do you debug it?', a:'Check the metrics for each ISP and edge: rebuffer ratio, start time, bitrate chosen and edge hit ratio by hour. If edge links fill up at peak, add capacity or place caches inside that ISP. If the hit ratio is low, make the caches bigger or load popular content ahead of time. If only some devices suffer, look at the player’s ABR logic and codec support.'}, {q:'A creator uploads a video and sees “processing 0%” for an hour. How do you find out why?', a:'Follow the video id through the pipeline. Check whether the upload completed, whether a transcode job was queued and how old it is, and whether chunks are failing. If the queue is simply long, raise the priority for that channel or add workers. If one chunk keeps failing, retry it on a different machine and flag a bad input file to the creator.'}],
  real:[
    {co:'YouTube', tier:'confirmed', text:'More than 500 hours of video are uploaded to YouTube every minute (stated in 2019), and people watch over a billion hours a day (announced in 2017).', src:'YouTube press/official blog statements (2017, 2019)'},
    {co:'YouTube / Vitess', tier:'confirmed', text:'Vitess was created at YouTube to scale MySQL horizontally (sharding, connection pooling, query routing) and is now a CNCF graduated project.', src:'vitess.io project documentation, CNCF'},
    {co:'YouTube recommendations', tier:'confirmed', text:'The 2016 paper describes a two-stage system: a candidate-generation network selecting hundreds of videos from millions, followed by a ranking network.', src:'Covington, Adams & Sargin, “Deep Neural Networks for YouTube Recommendations” (RecSys 2016)'},
    {co:'Google Argos', tier:'confirmed', text:'Google designed a custom video transcoding accelerator (the Argos VCU) and deployed it for YouTube to cut the cost of encoding uploads, especially with newer codecs.', src:'Ranganathan et al., “Warehouse-scale video acceleration: co-design and deployment in the wild” (ASPLOS 2021), Google blog (2021)'},
    {co:'Google Global Cache', tier:'confirmed', text:'Google places caching servers inside ISPs’ networks (Google Global Cache) to serve popular content, including YouTube video, close to users.', src:'Google Peering and Google Global Cache documentation'},
    {co:'YouTube Content ID', tier:'confirmed', text:'Rights holders provide reference files. Uploads are scanned for matches, and the rights holder’s chosen policy (block, track or earn money) is applied.', src:'YouTube Help, “How Content ID works”'},
    {co:'Pipeline details', tier:'inference', text:'Chunked parallel transcoding, popular-first codec encoding and background, checked view counting are reasonable inferences from public talks and industry practice. The exact internal designs are not public.', src:'General video-platform engineering practice'},
    {co:'Data model', tier:'educational', text:'The tables and key layout shown are a simplified teaching design, not YouTube’s schema.', src:'This case study'}],
  sources:['Covington, Adams & Sargin: Deep Neural Networks for YouTube Recommendations (RecSys 2016)', 'Ranganathan et al.: Warehouse-scale Video Acceleration: Co-design and Deployment in the Wild (ASPLOS 2021)', 'Vitess documentation: history and architecture', 'Google Global Cache: ISP documentation', 'YouTube Help: How Content ID works', 'ISO/IEC 23009-1 (MPEG-DASH) and IETF RFC 8216 (HTTP Live Streaming)', 'Kleppmann: Designing Data-Intensive Applications, ch. 6 (partitioning) and ch. 11 (stream processing)']
});

/* ======================= 3. NETFLIX ======================= */
SDA.register({kind:'case', id:'netflix', tier:'flagship', icon:'🎬', title:'Netflix (global streaming)', tagline:'A control plane in the cloud, video from boxes inside your ISP, and chaos on purpose.', tags:['open connect', 'cdn', 'microservices', 'resilience', 'chaos engineering', 'cassandra', 'per-title encoding', 'personalization'],
  modules:['reliability', 'architecture', 'realtime', 'traffic', 'databases'],
  summary:'Netflix streams a known catalog to hundreds of millions of members on thousands of device types. It splits the job in two: cloud services for sign-in and browsing, and its own CDN boxes inside ISPs that serve the video.',
  accuracy:'Netflix publishes a lot. These facts are marked confirmed: Open Connect, the AWS migration, Zuul, Eureka, Hystrix, Chaos Monkey, EVCache, Cassandra, per-title encoding, the recommender system and active-active multi-region. Service boundaries and numbers change over time, so the connecting details are inference or simplified. The numbers are illustrative unless marked as public.',
  overview:{what:'<b>A small example.</b> A member opens the app on a TV and sees rows of titles chosen for her, with artwork chosen for her too. She presses play, and the video starts within seconds from a box inside her own ISP. The quality adapts as her home network changes.', in:['Sign-in, profiles and entitlement checks', 'Personalised home page (rows, ranking, artwork)', 'Playback: choosing servers, licences (DRM), ABR', 'Encoding pipeline for new titles', 'Content distribution to ISP-hosted caches', 'Resilience: fallbacks, failover, chaos testing'], out:['Billing and payments in depth (see the Stripe case)', 'Studio production tooling', 'Live sports specifics (see the Hotstar case)', 'Games']},
  challenges:['Video is most of the bytes, and it must reach viewers at the evening peak without jamming the internet', 'Thousands of device types and network conditions, with one catalog', 'Hundreds of microservices, where one slow dependency must not take down the app', 'Surviving the loss of a whole cloud region', 'Personalising everything (rows, order, artwork) for each profile in milliseconds'],
  fr:['Browse a personalised home page and search', 'Press play: start quickly, adapt quality, resume where you left off', 'Multiple profiles per account, with viewing history', 'Download for offline viewing (on supported devices)', 'New titles available worldwide at launch time'],
  nfr:['Playback starts in a couple of seconds, and rebuffering is rare (an illustrative target)', 'Playback keeps working even if non-critical services (recommendations, ratings) fail', 'Survive a full region outage with at most a few minutes of impact', 'Keep peak-hour delivery cost and ISP congestion low', 'Content protection (DRM) on every stream'],
  scale:[{k:'Paid memberships', v:'300M+', math:'From the Netflix Q4 2024 shareholder letter (about 302M)', tag:'public'}, {k:'Peak concurrent streams', v:'≈ 30M', math:'About 300M accounts × about 10% streaming at the global peak = 30M', tag:'illustrative'}, {k:'Peak video traffic out', v:'≈ 150 Tbps', math:'30M streams × about 5 Mbps = 150 million Mbps = 150 Tbps', tag:'illustrative'}, {k:'Encoded catalog (one full copy)', v:'≈ 10 PB', math:'About 50K content hours × about 120 encodes for each title (bitrates × codecs × audio) × about 1.5 GB per hour for each encode ≈ 9 PB', tag:'illustrative'}, {k:'Share of hours from recommendations', v:'≈ 80%', math:'From Gomez-Uribe & Hunt (2015): about 80 of every 100 hours watched', tag:'public'}, {k:'Control-plane API calls', v:'billions a day', math:'300M members × a few sessions × dozens of calls in a session. Say 300M × 3 × 30 = 27B a day', tag:'illustrative'}],
  arch:{w:980, h:370, minW:700, nodes:[
    {id:'u', type:'client', label:'TV / phone', sub:'member app', x:70, y:180, w:110},
    {id:'gw', type:'lb', label:'API gateway', sub:'Zuul', x:228, y:180, w:132, stage:1},
    {id:'app', type:'service', label:'App services', sub:'monolith, own DC', x:400, y:180, w:152},
    {id:'cass', type:'db', label:'Cassandra', sub:'history, bookmarks', x:585, y:180, w:148, stage:3},
    {id:'steer', type:'service', label:'Playback & steering', sub:'which OCA, licence', x:235, y:60, w:172, stage:6},
    {id:'disc', type:'service', label:'Service registry', sub:'Eureka', x:400, y:60, w:130, stage:2},
    {id:'evc', type:'cache', label:'EVCache', sub:'memcached-based', x:560, y:60, w:130, stage:3},
    {id:'reco', type:'service', label:'Personalization', sub:'rows + artwork', x:730, y:60, w:140, stage:8},
    {id:'events', type:'queue', label:'Event pipeline', sub:'Kafka-based', x:897, y:60, w:150, stage:8},
    {id:'oca', type:'cdn', label:'Open Connect', sub:'OCAs inside ISPs', x:225, y:300, w:140, stage:5},
    {id:'s3', type:'db', label:'Encoded video', sub:'cloud storage', x:400, y:300, w:130, stage:4},
    {id:'enc', type:'service', label:'Encoding pipeline', sub:'per-title', x:580, y:300, w:140, stage:4},
    {id:'db', type:'db', label:'Main DB', sub:'Oracle, one DC', x:780, y:300, w:140}],
   edges:[{from:'u', to:'app', gone:1}, {from:'u', to:'gw', stage:1}, {from:'gw', to:'app', stage:1}, {from:'app', to:'db'}, {from:'app', to:'disc', stage:2},
     {from:'app', to:'evc', stage:3}, {from:'app', to:'cass', stage:3}, {from:'enc', to:'s3', stage:4}, {from:'s3', to:'oca', stage:5}, {from:'u', to:'oca', stage:5},
     {from:'gw', to:'steer', stage:6}, {from:'app', to:'reco', stage:8}, {from:'app', to:'events', stage:8, curve:0.35}, {from:'reco', to:'events', stage:8}]},
  evolution:[
    {title:'One monolith + one database', scale:'DVD-by-mail site', fix:'<p>A single Java web application in Netflix’s own data center, backed by one big relational database. Every feature (queue, ratings, billing) lives in the same codebase and the same schema.</p>', after:{lat:500, err:.2, load:30}},
    {title:'One database corruption = days down', scale:'2008', down:['db'], hot:['app'], breaks:'<p>One database is a single point of failure. In August 2008 a major database corruption stopped Netflix shipping DVDs for three days. Growing one machine in one data center also could not keep up with streaming growth.</p>', fix:'<p>Move to the <b>cloud (AWS)</b> and break the monolith into <b>stateless services</b> behind an <b>API gateway</b> (Netflix built Zuul). Services can be deployed, scaled and fail on their own, and the data moves to replicated stores.</p><p>The migration took about seven years and finished in 2016.</p>', sub:{app:'services on AWS'}, before:{lat:5000, err:30, load:100}, after:{lat:400, err:.2, load:45}, flow:[['u', 'gw', 'GET /home'], ['gw', 'app']], lesson:['monolith-to-microservices', 'fault-tolerance-spof']},
    {title:'One slow service freezes the whole app', scale:'100s of services', hot:['app', 'gw'], breaks:'<p>The “ratings” service gets slow. Every page waits on it, gateway threads pile up, and soon nothing loads, not even playback. This is a <b>cascading failure</b>. Servers also come and go all the time in the cloud, so fixed addresses break.</p>', fix:'<p>Wrap every remote call in a <b>timeout, a circuit breaker and a fallback</b> (Netflix’s Hystrix library made this popular). If ratings fail, show the page without them. Keep dependencies in separate thread pools (<b>bulkheads</b>).</p><p>Services find each other through a <b>registry</b> (Eureka) with load balancing in the client.</p>', before:{lat:8000, err:12, load:160}, after:{lat:420, err:.3, load:50}, flow:[['app', 'disc', 'where is ratings?']], lesson:['circuit-breaker', 'bulkhead-fallback', 'service-discovery']},
    {title:'The relational DB can’t go global', scale:'100M+ events/day', hot:['db'], breaks:'<p>Viewing history and “continue watching” bookmarks are write-heavy, huge and needed in every region. One relational primary becomes the bottleneck and cannot accept writes in several regions at once.</p>', fix:'<p>Move the high-volume, always-needed data (viewing history and bookmarks) to <b>Cassandra</b>, copied across regions, with consistency you can tune. Put <b>EVCache</b> (a memcached-based cache across zones) in front of hot reads.</p><p>Keep money data (billing) in a relational database with ACID transactions.</p>', sub:{db:'billing (MySQL)'}, before:{lat:1500, err:2, load:150}, after:{lat:300, err:.1, load:55}, flow:[['app', 'evc', 'hit'], ['app', 'cass', 'bookmark write']], lesson:['sql-vs-nosql', 'quorums', 'cache-layers']},
    {title:'Thousands of devices, one catalogue', scale:'1,000s of devices', hot:['app'], breaks:'<p>One encoding of each film looks blocky on a 4K TV, will not play on an old phone, and wastes bandwidth on cartoons. Devices differ in codecs, resolutions and DRM.</p>', fix:'<p>An <b>encoding pipeline</b> turns each studio master into many encodes (resolutions × bitrates × codecs × audio and subtitle tracks), packaged for ABR and DRM.</p><p>Netflix introduced <b>per-title encoding</b> in 2015, later shot-based: each title gets its own bitrate ladder, based on how hard it is to compress.</p>', before:{lat:600, err:3, load:70}, after:{lat:450, err:.2, load:55}, flow:[['enc', 's3', 'encodes']], lesson:['transcoding-pipeline']},
    {title:'Video melts the internet at 9 pm', scale:'Tbps at peak', hot:['s3', 'gw'], breaks:'<p>Streaming every byte from cloud storage or commercial CDNs at the evening peak is expensive and congests the links between networks. Viewers rebuffer exactly when most people are watching.</p>', fix:'<p>Build a dedicated CDN, <b>Open Connect</b>: storage boxes (OCAs) designed by Netflix and installed <b>inside ISPs</b> and at internet exchange points, free for ISPs.</p><p>The catalog is known in advance, so the OCAs are <b>filled during off-peak hours</b> with the content likely to be popular there. Peak traffic never leaves the ISP.</p>', sub:{s3:'origin for fills'}, before:{lat:2500, err:2.5, load:170}, after:{lat:300, err:.1, load:40}, flow:[['s3', 'oca', 'nightly fill'], ['u', 'oca', 'video segments']], lesson:['cdn', 'cache-layers']},
    {title:'Which server, which bitrate?', scale:'many OCAs/ISP', hot:['oca'], breaks:'<p>Clients pick a server blindly. Some OCAs are overloaded or do not have the file, others sit idle, and one failing OCA stalls playback.</p>', fix:'<p>On “play”, a <b>playback and steering service</b> in the cloud checks the member’s rights, issues the DRM licence and returns a <b>ranked list of OCA URLs</b> that hold the file. It ranks them by OCA health, load and network closeness.</p><p>The client streams from the first one, switches to the next on trouble, and runs <b>adaptive bitrate</b> for each segment.</p>', before:{lat:900, err:1.2, load:95}, after:{lat:280, err:.05, load:55}, flow:[['u', 'gw', 'POST /play'], ['gw', 'steer', 'rank OCAs'], ['u', 'oca', 'stream']], lesson:['live-streaming-abr', 'health-checks-sticky']},
    {title:'An entire cloud region goes down', scale:'multi-region', hot:['gw'], down:['app'], breaks:'<p>Cloud regions sometimes have large outages. With everything in one region, members cannot even sign in or press play, although the video sits on OCAs.</p>', fix:'<p>Run the control plane <b>active-active in several regions</b>, with data copied between them (Cassandra and EVCache replication). If a region fails, DNS and the gateways <b>move members to healthy regions</b> within minutes.</p><p>Netflix practises this with <b>Chaos Kong</b> (emptying a region) and kills instances with <b>Chaos Monkey</b> in production.</p>', sub:{gw:'multi-region'}, before:{lat:6000, err:35, load:100}, after:{lat:350, err:.1, load:65}, flow:[['u', 'gw', 'routed to healthy region']], lesson:['multi-az-region', 'chaos-engineering']},
    {title:'Everyone sees the same home page', scale:'200M+ profiles', hot:['app'], breaks:'<p>One “top titles” list wastes the catalog. Members scroll, find nothing and leave. Personalising everything on every request would be far too slow.</p>', fix:'<p>A <b>personalization</b> system ranks titles, rows and even <b>artwork</b> for each profile. The heavy models run <b>offline</b> and nearline on viewing events from an <b>event pipeline</b> (based on Kafka). The results are cached, so the live path only does a light re-ranking.</p>', before:{lat:500, err:.3, load:70}, after:{lat:320, err:.05, load:60}, flow:[['app', 'events', 'play, scroll, click'], ['events', 'reco', 'train / refresh'], ['app', 'reco', 'rows for profile']], lesson:['recommendations', 'lambda-kappa']},
    {title:'Launch night spike', scale:'launch night', hot:['gw', 'steer'], breaks:'<p>Millions press play on the same title within minutes of its release. Sign-ins and play requests jump 5 to 10 times, and autoscaling reacts too slowly. If every request is treated the same, playback fails along with everything else.</p>', fix:'<p><b>Pre-position</b> the new title on OCAs worldwide before launch. <b>Scale up ahead</b> of demand, using a forecast (Netflix has described predictive autoscaling).</p><p>In the gateway, use <b>prioritised load shedding</b>: when overloaded, drop low-priority requests (prefetching and logging) first, so play requests keep working.</p>', sub:{gw:'load shedding'}, before:{lat:3500, err:6, load:240}, after:{lat:400, err:.2, load:85}, flow:[['s3', 'oca', 'pre-position'], ['u', 'gw', 'play (high priority)'], ['gw', 'steer']], lesson:['load-shedding', 'autoscaling']}],
  flows:[
    {name:'Press play', steps:[
      {note:'The app sends a play request to the nearest healthy region’s gateway, with the title, the device’s abilities and the profile.', flow:[['u', 'gw', 'POST /play {title, device}']]},
      {note:'The playback service checks the member’s rights and issues a DRM licence. Then it ranks the OCAs that hold the needed files by health and closeness.', flow:[['gw', 'steer', 'licence + OCA list']]},
      {note:'The gateway also fetches the resume point from the bookmark store (through EVCache).', flow:[['gw', 'app'], ['app', 'evc', 'bookmark?'], ['app', 'cass', 'miss → read']]},
      {note:'The client streams segments from the first OCA, inside its own ISP, and adapts the bitrate for each segment.', flow:[['u', 'oca', 'segments (ABR)']]},
      {note:'Playback events (start, bitrate switches and progress) flow back for bookmarks, quality monitoring and recommendations.', flow:[['u', 'gw', 'heartbeat'], ['gw', 'app'], ['app', 'events', 'playback events'], ['app', 'cass', 'bookmark']]}]},
    {name:'New title goes live', steps:[
      {note:'The studio master is encoded into the title’s own bitrate ladder (per title or per shot), for every codec and device family.', flow:[['enc', 's3', 'encodes + DRM packaging']]},
      {note:'Days before launch, OCAs worldwide are filled during their local off-peak time.', flow:[['s3', 'oca', 'off-peak fill']]},
      {note:'At launch, play requests are steered only to OCAs that already hold the files.', flow:[['u', 'gw', 'play'], ['gw', 'steer'], ['u', 'oca', 'stream']]}]},
    {name:'Load the home page', steps:[
      {note:'The app asks for the home page, and the gateway routes it to the service that builds the rows.', flow:[['u', 'gw', 'GET /home'], ['gw', 'app']]},
      {note:'Personalization returns rows that were worked out ahead of time, and the artwork chosen for each profile. The results are cached.', flow:[['app', 'reco', 'rows for profile'], ['app', 'evc', 'cache']]},
      {note:'If personalization is slow, a circuit breaker returns a fallback (popular titles) instead of an error.', flow:[['app', 'gw', 'page (maybe fallback)'], ['gw', 'u']]}]}],
  breakIt:[
    {label:'An OCA dies mid-stream', kill:['oca'], verdict:'survives', text:'The client already has a ranked list of OCAs, so it switches to the next one (often in the same ISP), maybe at a lower bitrate for a few segments. Viewers hardly notice.', flow:[['u', 'oca', 'next OCA in list']]},
    {label:'Personalization is down', kill:['reco'], verdict:'degrades', text:'Circuit breakers trip, and the home page uses fallback rows (popular, not personal). Browsing is less relevant, but playback is not affected.', flow:[['app', 'evc', 'fallback rows']]},
    {label:'EVCache cluster lost', kill:['evc'], verdict:'degrades', text:'Reads fall through to Cassandra and delay rises. EVCache copies in other zones and request coalescing keep Cassandra from being swamped.', flow:[['app', 'cass', 'direct reads']]},
    {label:'A Cassandra node dies', kill:['cass'], verdict:'survives', text:'With a replication factor of 3 and LOCAL_QUORUM, one replica down does not block reads or writes. Hinted handoff and repair bring it back in step later.'},
    {label:'A whole AWS region fails', kill:['gw', 'app'], verdict:'degrades', text:'Members connected to this region see errors until traffic moves to healthy regions, which takes minutes. Streams already playing from OCAs keep going.', flow:[['u', 'oca', 'video keeps playing']]},
    {label:'Billing database down', kill:['db'], verdict:'degrades', text:'Sign-ups and plan changes fail, but existing members can still browse and watch. Playback does not wait for billing.'},
    {label:'Encoding pipeline down', kill:['enc'], verdict:'survives', text:'New titles are delayed. Nothing that members are watching today depends on it.'}],
  dataModel:{lang:'sql', title:'viewing data (Cassandra CQL) + billing (SQL)', code:`-- Cassandra: partition by profile, newest first
CREATE TABLE viewing_history (
  profile_id  uuid,
  watched_at  timestamp,
  title_id    bigint,
  position_s  int,
  device      text,
  PRIMARY KEY ((profile_id), watched_at, title_id)
) WITH CLUSTERING ORDER BY (watched_at DESC);

CREATE TABLE bookmarks (            -- "continue watching"
  profile_id uuid, title_id bigint, position_s int, updated_at timestamp,
  PRIMARY KEY ((profile_id), title_id)
);

-- Relational (ACID) for money
-- subscriptions(account_id PK, plan, status, renews_at)
-- invoices(invoice_id PK, account_id FK, amount_minor, currency, status)`, notes:'Splitting by profile keeps each member’s history on a few replicas, so “my history” is a read from one partition. Writes are last-write-wins, which is fine for bookmarks. Money uses a relational database with transactions.'},
  apis:[
    {m:'POST', path:'/playback/v1/play', note:'Simplified and educational: rights, DRM and steering in one call.', req:'{ "title_id": 81234567, "profile_id": "p_19", "device": { "codecs": ["av1","hevc","avc"], "max_height": 2160, "drm": "widevine" } }', res:'{ "licence": "<opaque>", "manifest": { "video": [ {"codec":"av1","height":1080,"kbps":3200} ] },\n  "servers": [ "https://oca-1.isp.example/…", "https://oca-2.isp.example/…" ],\n  "resume_at_s": 1312 }'},
    {m:'GET', path:'/home/v1?profile=p_19', note:'Rows are worked out ahead of time for each profile, and the artwork ids are chosen for each profile too.', res:'{ "rows": [ { "name": "Because you watched Kota Factory", "titles": [ {"id": 8100, "artwork": "a_37"} ] } ], "fallback": false }'},
    {m:'POST', path:'/events/v1/playback', note:'Heartbeats that need no reply, sent in batches from the device.', req:'{ "session": "s_9f", "events": [ {"t": 1312, "type": "progress"}, {"t": 1315, "type": "bitrate_switch", "kbps": 1750} ] }'}],
  algorithm:{title:'Proactive caching + per-title encoding', html:'<p>Two ideas make Netflix delivery cheap and smooth.</p><p><b>Proactive caching:</b> a general CDN pulls content on demand. Open Connect knows the catalog and can predict what will be popular, so it fills the boxes inside ISPs overnight and serves peak traffic without crossing the ISP’s border.</p><p><b>Per-title encoding:</b> easy content needs fewer bits for the same picture quality, so each title gets its own bitrate ladder.</p><p>Below, plan an ISP’s OCAs, compare ladders, then try the circuit breaker and chaos simulators that mirror Netflix’s resilience tools.</p>', mount:host => { openConnect(host); host.append(hr()); perTitle(host); }, pg:['circuit-breaker', 'chaos-monkey']},
  tradeoffs:[['Its own CDN (Open Connect) inside ISPs', 'Peak traffic stays inside ISPs, it is much cheaper at Netflix’s volume, and delivery is finely controlled', 'Building and running hardware, and ISP relationships, worldwide'], ['Filling caches overnight', 'Uses idle off-peak capacity, with near-perfect hit ratios for a known catalog', 'Needs good popularity prediction, and surprises are served from farther away'], ['Microservices with fallbacks', 'Independent deploys and isolated failures, and non-critical features get worse quietly', 'Operational complexity: tracing, discovery and hundreds of deployables'], ['Cassandra for viewing data', 'Writes in many regions, high availability and huge scale', 'Eventual consistency, and data modelling that follows the queries'], ['Active-active multi-region', 'Survives the loss of a region in minutes', 'Roughly double the control-plane footprint, and replication conflicts to design for']],
  alternatives:[['A commercial CDN only', 'A reasonable choice for most streaming services. At Netflix’s share of peak internet traffic, owning the CDN is cheaper and gives more control'], ['One region plus backups', 'Simpler and cheaper, but a region outage means hours of downtime'], ['A fixed bitrate ladder', 'Simple, but it wastes bits on easy titles and under-serves hard ones'], ['A relational database for viewing history', 'Easy queries, but writes are hard to scale across regions']],
  failures:[['An OCA fails', 'The client switches to the next ranked OCA, and steering stops sending traffic there'], ['A non-critical microservice fails', 'The circuit breaker opens and a fallback response is used'], ['The cache cluster fails', 'Fall through to Cassandra, with copies in other zones'], ['An AWS region fails', 'Move to other regions (practised with Chaos Kong)'], ['The gateway is overloaded', 'Prioritised load shedding keeps play requests alive']],
  lab:{stack:['Node.js or Spring Boot', 'Cassandra (or ScyllaDB) in Docker', 'Redis as the cache', 'FFmpeg + Shaka Packager', 'Nginx as an “OCA”', 'k6', 'A circuit-breaker library (opossum / resilience4j)'], milestones:[
    {day:'Day 1: catalogue & play', items:['Encode one title into 3 renditions with FFmpeg, and package it as DASH', 'Two Nginx “OCAs” serving the files', 'POST /play returns a ranked list of OCA URLs from a health table', 'Player switches OCA when one returns errors']},
    {day:'Day 2: data & resilience', items:['Bookmarks in Cassandra (partitioned by profile) with Redis cache-aside', 'A “recommendations” service with a circuit breaker + fallback rows', 'Kill recommendations: the home page must still load', 'Service discovery via a simple registry or Consul']},
    {day:'Day 3: chaos & scale', items:['A chaos script that randomly kills one container every 2 minutes', 'Prioritised load shedding in the gateway (play > home > logging)', 'k6 “launch night” test: 10× play requests in 60 s', 'Dashboard: play success rate, start time, fallback rate']}],
   pseudocode:{lang:'ts', code:`// Gateway: prioritised load shedding + circuit-broken calls with fallbacks
const PRIORITY = { play: 0, licence: 0, home: 1, search: 1, prefetch: 2, logging: 3 };
app.use((req, res, next) => {
  const p = PRIORITY[req.routeName] ?? 2;
  const load = inflight / capacity;                  // or CPU / queue-time based
  if (load > 0.9 && p >= 2) return res.status(503).set('Retry-After', '5').end();
  if (load > 1.1 && p >= 1) return res.status(503).end();
  next();                                              // play requests shed last
});

const recs = new CircuitBreaker(fetchRecommendations, { timeout: 250, errorThresholdPercentage: 50, resetTimeout: 10_000 });
recs.fallback(profileId => cache.get('popular:' + regionOf(profileId)));  // degrade, don't fail
app.get('/home', async (req, res) => res.json({ rows: await recs.fire(req.profileId) }));`},
   loadTest:'<p>Seed 100K profiles and bookmarks. In k6, ramp play requests from 100 to 2,000 a second in one minute (“launch night”) while running background home-page and logging traffic. Measure the play success rate and p99. Repeat with load shedding turned off, and with the recommendations service killed. Play success should stay near 100% in both, with shedding turned on.</p>'},
  twists:[{q:'Why does Netflix fill caches ahead of time when most CDNs fill on demand?', a:'Netflix has a limited, known catalog and can predict what each region will watch tomorrow (new releases, trends and history). Filling overnight uses idle network capacity, avoids misses at the peak and cuts transit costs. A general CDN serving any web content cannot predict demand, so it pulls on a miss.'}, {q:'Recommendations are down during a big launch. What do members see?', a:'The home page loads with fallback rows (popular in their country, or a cached copy of their last personal page), because the calls are wrapped in circuit breakers with fallbacks. Play still works. Playback depends only on rights, the licence and steering, which are kept in their own pools and put first by the gateway.'}, {q:'How would you design “continue watching” to work across devices and regions?', a:'Devices send progress heartbeats now and then. The latest position for each (profile, title) is written to Cassandra as last-write-wins (with a timestamp), copied to all regions and cached in EVCache. Conflicts are rare and harmless, because the newest timestamp wins. On play, the steering response includes the resume point.'}, {q:'A new episode of a huge show drops at midnight in 190 countries at once. How do you plan the first hour?', a:'Fill every OCA in advance, in each region’s off-peak hours, so the first play is served locally. Scale the control plane up before midnight from the forecast. In the gateway, shed low-priority calls first. Stagger the “new episode” push notifications over several minutes, so the app opens do not all arrive in the same second.'}],
  real:[
    {co:'Netflix', tier:'confirmed', text:'In August 2008 a major database corruption stopped DVD shipments for three days. This prompted the move from single machines that were single points of failure to services that scale out in AWS. The streaming migration finished in early 2016.', src:'Netflix blog, “Completing the Netflix Cloud Migration” (2016)'},
    {co:'Netflix Open Connect', tier:'confirmed', text:'Open Connect is Netflix’s own CDN: purpose-built appliances (OCAs) deployed inside ISP networks and at internet exchange points, filled during off-peak hours, with the control plane running in AWS.', src:'Netflix Open Connect overview documentation'},
    {co:'Netflix OSS', tier:'confirmed', text:'Netflix open-sourced Zuul (gateway), Eureka (service discovery), Hystrix (latency and fault tolerance, now in maintenance mode) and EVCache (memcached-based distributed cache).', src:'Netflix Tech Blog and the Netflix OSS GitHub documentation'},
    {co:'Netflix chaos engineering', tier:'confirmed', text:'Chaos Monkey randomly terminates production instances. Chaos Kong practises emptying an entire AWS region. Netflix runs active-active across several regions.', src:'Netflix Tech Blog, “The Netflix Simian Army” (2011) and “Active-Active for Multi-Regional Resiliency” (2013)'},
    {co:'Netflix encoding', tier:'confirmed', text:'Per-title encoding (2015) gives each title its own bitrate ladder based on how complex it is. It replaced one fixed ladder (topping out at 5,800 kbps for 1080p). It was later refined to shot-based encoding.', src:'Netflix Tech Blog, “Per-Title Encode Optimization” (2015) and “Dynamic optimizer” (2018)'},
    {co:'Netflix recommendations', tier:'confirmed', text:'About 80% of hours streamed were influenced by recommendations, and artwork is personalised per member.', src:'Gomez-Uribe & Hunt, “The Netflix Recommender System” (ACM TMIS 2015), Netflix Tech Blog, “Artwork Personalization at Netflix” (2017)'},
    {co:'Netflix load shedding', tier:'confirmed', text:'Netflix described prioritised load shedding at the API gateway, keeping playback working by dropping less critical requests first under overload.', src:'Netflix Tech Blog, “Keeping Netflix Reliable Using Prioritized Load Shedding” (2020)'},
    {co:'Service boundaries', tier:'inference', text:'The grouping of services in the diagram (for example one playback and steering box) is a simplification. Netflix’s real services are far more numerous and change over time.', src:'This case study, based on the public material above'},
    {co:'Scale and simulator inputs', tier:'educational', text:'Peak streams, egress, catalogue size and the OCA/encoding simulators use illustrative inputs and a simplified quality model.', src:'This case study’s estimates'}],
  sources:['Netflix Tech Blog: Completing the Netflix Cloud Migration (2016)', 'Netflix Open Connect: overview and appliance documentation', 'Netflix Tech Blog: Per-Title Encode Optimization (2015)', 'Netflix Tech Blog: Active-Active for Multi-Regional Resiliency (2013)', 'Netflix Tech Blog: The Netflix Simian Army (2011)', 'Netflix Tech Blog: Keeping Netflix Reliable Using Prioritized Load Shedding (2020)', 'Gomez-Uribe & Hunt: The Netflix Recommender System: Algorithms, Business Value, and Innovation (ACM TMIS 2015)', 'Basiri et al.: Chaos Engineering (IEEE Software 2016)']
});
})();
