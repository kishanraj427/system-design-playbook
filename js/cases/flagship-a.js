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
      ['Fill traffic (moved to a 2–10 am window)', '—', `${fmtBytes(fill)} per night ≈ ${fmtBps(fillRate)} for 8 h`]], [1, 2])));
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
  summary:'Answer a query over hundreds of billions of pages in a fraction of a second. The design is a crawl → index → serve pipeline: a sharded, replicated, memory-resident inverted index; scatter-gather serving that has to beat tail latency; caching; minutes-fresh indexing; and ranking that blends text relevance, link authority and meaning.',
  accuracy:'The overall shape comes from Google’s own publications: the 1998 “Anatomy” paper, the 2003 cluster-architecture paper, Percolator (2010), “The Tail at Scale” (2013) and Jeff Dean’s WSDM 2009 keynote. Those facts are labelled confirmed. Today’s ranking and serving internals are proprietary, so details beyond those sources are reasonable inference or a simplified educational design. Numbers are illustrative unless marked publicly disclosed.',
  overview:{what:'A user types “ipl schedule” and, in a few hundred milliseconds, gets ten ranked links with titles and snippets drawn from a crawl of a large share of the public web, including pages published minutes ago.', in:['Crawling and re-crawling the web politely', 'Building and updating the inverted index', 'Serving queries: retrieval, ranking, snippets', 'Spelling correction and query understanding', 'Freshness for news and fast-changing pages'], out:['Ads auction and billing', 'Images/video/maps verticals (same ideas, separate indexes)', 'Autocomplete (see the Typeahead case)', 'Spam-fighting ML in depth']},
  challenges:['The index is far too big for one machine, yet every query needs to consult all of it', 'A query fans out to thousands of servers, so one slow server sets the latency of everything (tail at scale)', 'Freshness: the web changes constantly, but batch index rebuilds take days', 'Relevance: matching words is not enough; ranking must resist spam and understand meaning', 'Crawling billions of pages without overloading any website'],
  fr:['<code>GET /search?q=…</code> returns the top 10 results with title, URL and snippet', 'Pagination and basic filters (language, region, time)', 'Spelling suggestions (“Did you mean…”)', 'New and updated pages become searchable (minutes for news, days for the long tail)', 'Webmasters can control crawling (robots.txt) and request removal'],
  nfr:['p99 latency of a few hundred ms end to end (illustrative target)', 'Very high availability: degrade (fewer or slightly staler results) rather than fail', 'Results consistent enough that refreshing doesn’t reshuffle them wildly', 'Cost efficiency: the index lives in RAM on many thousands of machines', 'Polite crawling: per-host rate limits'],
  scale:[
    {k:'Index size', v:'hundreds of billions of pages; > 100,000,000 GB', math:'Google, “How Search Works: Organizing information”', tag:'public'},
    {k:'Queries never seen before', v:'≈ 15% each day', math:'Google Search blog, BERT announcement (2019)', tag:'public'},
    {k:'Query rate', v:'≈ 100K/s average, 2–3× at peak', math:'≈ 8.5B queries/day (third-party estimate) ÷ 86,400 s ≈ 98K/s', tag:'illustrative'},
    {k:'Index shards for one full copy', v:'≈ 3,000', math:'400B docs × ~2 KB postings+metadata ≈ 800 TB ÷ ~256 GB RAM per server', tag:'illustrative'},
    {k:'Copies of each shard', v:'≈ 75 (spread over many data centres)', math:'300K peak QPS × 50% cache misses = 150K QPS on every shard ÷ ~2K QPS per server', tag:'illustrative'},
    {k:'Crawl bandwidth', v:'≈ 46 Gbps', math:'re-fetch 50B important pages every ~10 days = 5B/day ≈ 58K pages/s × ~100 KB', tag:'illustrative'}],
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
    {title:'One server + one index', scale:'24M pages (1998)', fix:'<p>A single query server reads an <b>inverted index</b> on local disk: for each word, the sorted list of pages containing it. A batch job crawls a few million pages and rebuilds the index now and then. A query intersects the posting lists of its words and ranks matches by text relevance plus PageRank.</p>', after:{lat:400, err:.1, load:20}},
    {title:'Crawling outgrows one machine', scale:'100M pages', hot:['web'], breaks:'<p>One machine fetches maybe 100 pages/s, so 100M pages take 12 days and the index is always weeks stale. Crawling, parsing and indexing compete with live queries for the same CPU and disk.</p>', fix:'<p>Split the work. A <b>URL frontier</b> (priority + per-host politeness queues) feeds a fleet of <b>crawlers</b>, which write raw pages to a distributed <b>page store</b>. A separate <b>indexing pipeline</b> (MapReduce-style batch jobs) turns pages into index files. Serving machines only serve.</p>', sub:{web:'serving only'}, before:{lat:1800, err:1.5, load:130}, after:{lat:450, err:.1, load:45}, flow:[['front', 'crawl', 'next URLs'], ['crawl', 'docs', 'pages'], ['docs', 'idxr'], ['idxr', 'idx', 'new index']], lesson:['inverted-index', 'batch-vs-stream']},
    {title:'The index no longer fits one machine', scale:'1B pages', hot:['idx', 'web'], breaks:'<p>The index is now terabytes. One machine reading it takes seconds per query, and it can’t even hold the files.</p>', fix:'<p><b>Shard by document</b>: split pages into N groups, each with its own small, complete index. A <b>root (mixer)</b> sends every query to all shards in parallel; each returns its local top-k, and the root merges them (<b>scatter-gather</b>). Document partitioning keeps each shard independent and makes adding pages easy.</p>', sub:{idx:'N shards by doc'}, before:{lat:6000, err:5, load:300}, after:{lat:600, err:.3, load:60}, flow:[['web', 'root', 'query'], ['root', 'idx', 'top-k from each shard']], lesson:['sharding', 'inverted-index']},
    {title:'More users; machines fail daily', scale:'1,000s of QPS', hot:['root', 'idx'], breaks:'<p>Each shard has one copy. A shard server can only answer so many queries per second, and with thousands of machines, some fail every day. Every failure hides part of the web.</p>', fix:'<p><b>Replicate every shard</b> (R copies) and put a <b>load-balancing front end</b> before the query servers. The root picks one healthy replica per shard per query. Capacity grows by adding replicas; a dead machine just drops out of the rotation.</p>', sub:{idx:'shards × R copies'}, before:{lat:2500, err:4, load:180}, after:{lat:350, err:.05, load:55}, flow:[['u', 'gfe', 'query'], ['gfe', 'web'], ['web', 'root'], ['root', 'idx', 'one replica per shard']], lesson:['replication', 'lb-algorithms']},
    {title:'Disk seeks dominate latency', scale:'10K+ QPS', hot:['idx'], breaks:'<p>Every query term costs disk seeks on every shard. A seek is ~10 ms; queries with several terms touch several posting lists. Building result snippets needs each page’s text, which is yet more I/O.</p>', fix:'<p>Serve the <b>index from RAM</b>, with compressed posting lists (delta + variable-length integers) so it fits. Jeff Dean described Google moving to an in-memory index around 2001. Add separate <b>doc servers</b> that hold page text for snippets, also sharded and replicated.</p>', sub:{idx:'RAM, compressed'}, before:{lat:900, err:.4, load:110}, after:{lat:250, err:.05, load:50}, flow:[['root', 'idx', 'RAM lookup'], ['root', 'docsrv', 'snippets for top 10']], lesson:['latency-numbers', 'storage-types']},
    {title:'The same queries, over and over', scale:'50K QPS', hot:['root', 'idx'], breaks:'<p>Popular queries (“weather”, “ipl score”, “facebook”) are recomputed on thousands of shard servers millions of times a day, so every machine burns capacity on identical work.</p>', fix:'<p>Add a <b>results cache</b> in front of the root, keyed on the normalised query + language + region, with a short TTL so fresh results still appear. A large share of traffic never reaches the shards; for cached queries, latency is a single lookup.</p>', before:{lat:600, err:.8, load:140}, after:{lat:180, err:.05, load:60}, flow:[['web', 'rcache', 'hit']], lesson:['cache-strategies', 'cache-layers']},
    {title:'Tail latency at 1,000-way fan-out', scale:'1,000-way fan-out', hot:['root'], breaks:'<p>If each shard server is slow 1% of the time, a query that waits for 1,000 of them is slow with probability 1 − 0.99<sup>1000</sup> ≈ 100%. Garbage collection, a busy neighbour or a hiccupping disk on <i>any</i> machine delays <i>every</i> query.</p>', fix:'<p>Fight the tail rather than the average. <b>Hedged requests</b>: if a replica hasn’t answered by its p95 time, send the same request to a second replica and use the first answer. <b>Deadlines with partial results</b>: drop a straggling shard rather than wait (slightly fewer results beats a slow page). Try the simulator in the Deep-dives tab.</p>', sub:{root:'hedge + deadline'}, before:{lat:1400, err:.6, load:70}, after:{lat:200, err:.05, load:72}, flow:[['root', 'idx', 'request'], ['root', 'idx', 'hedge after p95']], lesson:['percentiles-tail-latency', 'timeouts-retries']},
    {title:'Breaking news is invisible', scale:'news in minutes', hot:['idxr'], breaks:'<p>The index is rebuilt by big batch jobs, so a page published this morning appears in days. For “earthquake now” or a live match, that is a wrong answer (counted here as an error).</p>', fix:'<p><b>Incremental indexing</b>: update the index as pages are crawled instead of rebuilding it. Google described this as Caffeine (2010), built on Percolator, which applies small transactional updates to Bigtable. Add a small, fast <b>fresh tier</b> that the root queries alongside the main index; frequently changing sites are recrawled within minutes.</p>', sub:{idxr:'incremental'}, before:{lat:220, err:3, load:75}, after:{lat:210, err:.1, load:70}, flow:[['crawl', 'docs', 'new page'], ['docs', 'idxr'], ['idxr', 'fresh', 'minutes later'], ['root', 'fresh', 'query both tiers']], lesson:['cdc', 'lambda-kappa']},
    {title:'Words aren’t meaning', scale:'15% new queries', hot:['root'], breaks:'<p>Keyword matching fails on typos, synonyms and natural language (“can you get medicine for someone pharmacy”). Pure term matching also rewards keyword-stuffed pages. The share of unhelpful results (counted as errors here) climbs.</p>', fix:'<p>Add <b>query understanding</b> before retrieval: spelling correction, synonyms, language and intent detection, and ML language models (Google announced BERT for Search in 2019). Rank in <b>two phases</b>: cheap scoring on every shard keeps a few hundred candidates, then the root applies expensive ML ranking only to those.</p>', sub:{root:'2-phase rank'}, before:{lat:230, err:4, load:70}, after:{lat:240, err:.6, load:78}, flow:[['web', 'qu', 'rewrite query'], ['web', 'root'], ['root', 'idx', 'cheap top-k']], lesson:['bm25-ranking', 'vector-search-rag']},
    {title:'One data centre for the planet', scale:'billions of users', hot:['gfe'], breaks:'<p>Users far from the data centre pay 200+ ms of network round trips before the search even starts, and a power or network failure there takes Search down everywhere.</p>', fix:'<p>Run full serving stacks, each with complete index replicas, in <b>many data centres</b>. Send users to a nearby healthy one (DNS/anycast), and terminate TLS at <b>edge PoPs</b> near users so handshakes are short. If a data centre fails, traffic shifts to the others; capacity is planned with that headroom.</p>', sub:{gfe:'many DCs'}, before:{lat:650, err:.5, load:85}, after:{lat:190, err:.02, load:60}, flow:[['u', 'edge', 'nearest PoP'], ['edge', 'gfe', 'healthy DC']], lesson:['geodns-anycast', 'multi-az-region']}],
  flows:[
    {name:'Run a search (cache miss)', steps:[
      {note:'The query reaches the nearest edge PoP (TLS terminated close to the user), then a front end in a healthy data centre.', flow:[['u', 'edge', 'q=ipl schedule'], ['edge', 'gfe'], ['gfe', 'web']]},
      {note:'The query server checks the results cache (miss) and asks query understanding to fix spelling and add synonyms.', flow:[['web', 'rcache', 'miss'], ['web', 'qu', 'rewrite']], parallel:true},
      {note:'The root fans the query out to one replica of every index shard and the fresh tier, all in parallel, with a deadline.', flow:[['web', 'root'], ['root', 'idx', 'top-k'], ['root', 'fresh', 'top-k']]},
      {note:'Shards return their local top candidates; the root merges them and re-ranks the best few hundred with heavier ML.', flow:[['idx', 'root', 'candidates'], ['fresh', 'root']], parallel:true},
      {note:'The root fetches titles and query-specific snippets for the final 10 from the doc servers.', flow:[['root', 'docsrv', 'snippets']]},
      {note:'The page goes back to the user and the result is cached briefly for the next person asking the same thing.', flow:[['root', 'web'], ['web', 'rcache', 'SET'], ['web', 'gfe'], ['gfe', 'edge'], ['edge', 'u', '10 results']]}]},
    {name:'A new page gets indexed', steps:[
      {note:'Links discovered on other pages enter the frontier. It orders URLs by importance and enforces per-host politeness (robots.txt, rate limits).', flow:[['front', 'crawl', 'next URL for host']]},
      {note:'A crawler fetches the page, extracts its links (fed back to the frontier) and stores the content.', flow:[['crawl', 'front', 'new links'], ['crawl', 'docs', 'store page']]},
      {note:'The incremental pipeline parses, de-duplicates, scores and tokenises it, then updates the fresh tier within minutes and the main index later.', flow:[['docs', 'idxr'], ['idxr', 'fresh', 'add postings'], ['idxr', 'idx', 'merge later']]}]}],
  breakIt:[
    {label:'Lose a rack of index servers', kill:['idx'], verdict:'survives', text:'Every shard has many replicas spread across racks, so the root simply picks other replicas. If every replica of one shard were gone, the root would return results without that shard (a small slice of the web missing) instead of failing the query.', flow:[['root', 'idx', 'other replica']]},
    {label:'Results cache dies', kill:['rcache'], verdict:'degrades', text:'All traffic now hits the root and shards. Capacity must be planned for this (or the cache rebuilt gradually), otherwise latency climbs and queries start getting shed.', flow:[['web', 'root', 'every query']]},
    {label:'Query understanding is down', kill:['qu'], verdict:'degrades', text:'Fall back to the raw query after a short timeout: no spelling fixes or synonyms, so some results get worse, but Search keeps answering.'},
    {label:'Crawlers & indexing stop', kill:['crawl', 'idxr'], verdict:'survives', text:'Serving uses the existing index, so users notice nothing at first. Freshness slowly degrades: new pages and news stop appearing until the pipeline is back.'},
    {label:'One shard replica is slow (GC pause)', hot:['idx'], verdict:'survives', text:'Hedged requests send a duplicate to another replica after the p95 delay; the first answer wins and the slow one is cancelled. Users never see the pause.', flow:[['root', 'idx', 'hedge']]},
    {label:'A whole data centre goes dark', kill:['gfe', 'web', 'root'], verdict:'degrades', text:'This diagram shows one data centre. DNS/anycast and the edge stop sending users here within seconds to minutes and other data centres absorb the load, so only queries in flight fail.'}],
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
// URL frontier: (host, nextFetchAt, priority, url), plus robots.txt cache per host`, notes:'Document partitioning means each shard can answer a query on its own and the root just merges; term partitioning (one shard per word range) would need fewer machines per query but makes multi-word queries cross shards and skews load toward popular words.'},
  apis:[
    {m:'GET', path:'/search?q=ipl+schedule&hl=en&gl=in&start=0', note:'Public entry point (simplified). Responses are personalised by language/region, so caches key on those too.', res:'200 OK\n{ "spelling": null, "results": [ { "url": "https://iplguide.example/schedule", "title": "IPL 2026 schedule and venues", "snippet": "Full IPL cricket <b>schedule</b> with match dates…" } ], "next": "start=10" }'},
    {m:'RPC', path:'Root → Shard: Search', note:'Internal (educational). Each shard returns its local top-k; the deadline lets the root drop stragglers.', req:'{ "terms": ["ipl", "schedule"], "k": 300, "deadline_ms": 60, "lang": "en" }', res:'{ "shard": 1874, "hits": [ { "doc": 88210, "score": 12.7 }, ... ], "partial": false }'},
    {m:'RPC', path:'Indexer → Fresh tier: Upsert', note:'Internal (educational). Idempotent by (url, crawl version) so re-delivered updates are harmless.', req:'{ "url": "https://sportsdaily.example/india-squad", "version": 1731456000, "terms": {"india": [0, 7], "squad": [2]}, "static_score": 0.41 }'}],
  algorithm:{title:'Inverted index + PageRank ranking, then tail-tolerant fan-out', html:'<p>Retrieval finds pages containing the query terms by walking <b>posting lists</b>; ranking orders them. The original Google combined text relevance with <b>PageRank</b>: a page is important if important pages link to it, computed as the stationary distribution of a “random surfer” who follows links with probability <i>d</i> and jumps to a random page otherwise. Below is a working miniature: change the authority weight and watch the keyword-stuffed page fall. Then use the fan-out simulator to see why serving it across thousands of shards is a tail-latency problem.</p>', mount:miniGoogle, pg:'tail-latency'},
  tradeoffs:[['Document-partitioned shards', 'Each shard answers independently; easy to add pages and replicas; failures remove a slice, not a term', 'Every query touches every shard: huge fan-out, so tail latency must be engineered'], ['Index in RAM', 'Removes ~10 ms disk seeks from every term lookup', 'Expensive: thousands of servers’ worth of memory per index copy'], ['Hedged requests + partial results', 'p99 close to p50 even at 1,000-way fan-out', 'A few percent extra load; occasionally slightly incomplete results'], ['Incremental indexing + fresh tier', 'News searchable in minutes', 'More complex pipeline; two tiers to merge and keep consistent'], ['Two-phase ranking', 'Expensive ML only on a few hundred candidates', 'A relevant page missed by the cheap first phase can never be recovered']],
  alternatives:[['Term-partitioned index', 'Fewer machines per query, but load concentrates on popular terms and multi-term queries need cross-shard joins'], ['Elasticsearch/Lucene cluster', 'The same ideas (sharded inverted index, scatter-gather) and the right choice for site or enterprise search, but not tuned for hundreds of billions of documents'], ['Pure vector (embedding) search', 'Great for meaning, weak for exact names, numbers and rare terms; modern engines combine lexical and semantic retrieval'], ['Batch-only indexing', 'Simpler, but stale by days: unacceptable for news and live events']],
  failures:[['Index shard replica', 'Root picks another replica; hedging hides slow ones'], ['All replicas of a shard', 'Return partial results without that shard rather than failing'], ['Results cache', 'Serve from shards with planned headroom; load-shed lowest-priority traffic'], ['Indexing pipeline', 'Serve the existing index; freshness degrades gracefully'], ['Data centre', 'DNS/anycast shifts users to other data centres with full index copies']],
  lab:{stack:['Python or Go', 'A Wikipedia dump (no live crawling needed)', 'SQLite/LevelDB for the page store', 'gRPC or HTTP for shards', 'Docker Compose', 'k6 or vegeta'], milestones:[
    {day:'Day 1: index & rank', items:['Parse 100K Wikipedia articles; build an inverted index with positions', 'BM25 scoring for multi-word queries', 'PageRank over the article link graph (power iteration)', 'CLI: query → top 10 with snippets']},
    {day:'Day 2: shard & serve', items:['Split documents into 4 shards, each a separate process', 'Root service: fan out, merge top-k, attach snippets', 'Results cache with a short TTL', 'Add per-shard deadlines and partial results']},
    {day:'Day 3: tail & freshness', items:['Inject random 200 ms pauses into one shard; measure p99', 'Add hedged requests after the p95 delay; measure again', 'A small “fresh” shard fed by an add-document endpoint', 'Dashboard: QPS, p50/p99, cache hit ratio, partial-result rate']}],
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
   loadTest:'<p>Replay a Zipf-distributed query log (a few very popular queries, a long tail of rare ones) at 500 QPS against the root. Record p50/p99 with and without the results cache. Then add a 1% chance of a 200 ms pause per shard request and compare p99 with hedging off and on; also track the extra load hedging adds (it should be a few percent).</p>'},
  twists:[
    {q:'A cricket final ends and “who won” queries spike 1,000× in one minute. What happens?', a:'The results cache would serve stale answers, so freshness-sensitive queries get short TTLs or bypass it; the fresh tier must index the news within minutes; the spike itself is mostly identical queries, so cache coalescing (one backend computation for many waiting users) protects the shards. Precomputed answer boxes (live score cards) are fed by structured data feeds, not the web index.'},
    {q:'Why partition the index by document instead of by term?', a:'By-term sends a query only to the shards owning its words, but popular words create hot shards, multi-word queries must join posting lists across machines, and updating one page touches many shards. By-document keeps each shard a complete mini-index: queries are embarrassingly parallel, updates touch one shard, and failures remove a slice of pages instead of whole words. The cost is the fan-out to every shard, which is why tail-latency tricks matter.'},
    {q:'How would you add semantic (“meaning”) search?', a:'Hybrid retrieval: keep the lexical index for exact matches and add an embedding index (approximate nearest neighbour, e.g. HNSW/IVF-PQ) sharded the same way. Retrieve candidates from both, merge, then re-rank with a cross-encoder or other ML model on the top few hundred. Watch costs: embeddings for hundreds of billions of pages are huge, so you may embed only important pages or passages.'}],
  real:[
    {co:'Google (1998)', tier:'confirmed', text:'The original design: a distributed crawler, a URL server, a repository of compressed pages, an indexer producing “barrels” (shards) of the inverted index, and ranking that combined text features with PageRank.', src:'Brin & Page, “The Anatomy of a Large-Scale Hypertextual Web Search Engine” (WWW 1998)'},
    {co:'Google (2003)', tier:'confirmed', text:'Queries go to index servers holding randomly partitioned “index shards”, each served by a pool of replicas behind load balancers, then to document servers for titles and snippets. The system ran on many thousands of commodity PCs.', src:'Barroso, Dean & Hölzle, “Web Search for a Planet: The Google Cluster Architecture” (IEEE Micro 2003)'},
    {co:'Google', tier:'confirmed', text:'Serving moved to an in-memory index in the early 2000s, with successive changes to index encoding, caching and tiering over the decade.', src:'Jeff Dean, “Challenges in Building Large-Scale Information Retrieval Systems” (WSDM 2009 keynote)'},
    {co:'Google', tier:'confirmed', text:'Caffeine (2010) replaced batch index rebuilds with incremental processing; the Percolator paper describes transactional, observer-driven incremental updates on Bigtable.', src:'Google blog, “Our new search index: Caffeine” (2010); Peng & Dabek, “Large-scale Incremental Processing Using Distributed Transactions and Notifications” (OSDI 2010)'},
    {co:'Google', tier:'confirmed', text:'Hedged and tied requests, micro-partitioning and selective replication are used to tame tail latency in large fan-out services such as search.', src:'Dean & Barroso, “The Tail at Scale” (CACM 2013)'},
    {co:'Modern ranking', tier:'inference', text:'Today’s ranking uses many signals and ML models (BERT was announced for Search in 2019). The two-phase “cheap retrieval then expensive re-rank” structure here is a standard industry pattern, not a disclosed Google design.', src:'Google Search blog, “Understanding searches better than ever before” (2019); general IR literature'},
    {co:'Shard and replica counts', tier:'educational', text:'The shard count, replica count and crawl bandwidth in the Setup tab are back-of-envelope numbers chosen for teaching, not Google figures.', src:'This case study’s estimates'}],
  sources:['Brin & Page — The Anatomy of a Large-Scale Hypertextual Web Search Engine (1998)', 'Barroso, Dean & Hölzle — Web Search for a Planet: The Google Cluster Architecture (IEEE Micro 2003)', 'Jeff Dean — Challenges in Building Large-Scale Information Retrieval Systems (WSDM 2009 keynote)', 'Peng & Dabek — Large-scale Incremental Processing Using Distributed Transactions and Notifications (OSDI 2010)', 'Dean & Barroso — The Tail at Scale (CACM 2013)', 'Dean & Ghemawat — MapReduce: Simplified Data Processing on Large Clusters (OSDI 2004)', 'Manning, Raghavan & Schütze — Introduction to Information Retrieval (2008)', 'Google — How Search Works (official site)']
});

/* ======================= 2. YOUTUBE ======================= */
SDA.register({kind:'case', id:'youtube', tier:'flagship', icon:'▶️', title:'YouTube (video upload & streaming)', tagline:'500 hours uploaded every minute; a billion hours watched a day.', tags:['video', 'transcoding', 'cdn', 'adaptive bitrate', 'vitess', 'recommendations', 'view counts'],
  modules:['realtime', 'traffic', 'databases', 'async', 'search'],
  summary:'Accept huge uploads from anyone, turn each into dozens of renditions, and stream them smoothly to every kind of device and network. The design is about a resumable upload + transcoding pipeline, edge caches that absorb a long-tailed catalogue, sharded metadata, view counting at scale, and recommendations.',
  accuracy:'Public facts (upload rate, watch time, Vitess, the 2016 recommendations paper, Argos video chips, Content ID, edge caches inside ISPs) are labelled confirmed. How YouTube wires these together internally is not fully public, so the pipeline and data-model details here are reasonable inference or a simplified educational design. Numbers are illustrative unless marked publicly disclosed.',
  overview:{what:'A creator uploads a 4K video from a phone. Minutes later anyone, anywhere, can watch it on a smart TV or a 3G phone, starting in about a second, with the quality adapting to their network, and with view counts, likes and “up next” recommendations.', in:['Resumable upload', 'Transcoding into many resolutions and codecs', 'Streaming with adaptive bitrate (ABR)', 'Video metadata, thumbnails, likes and view counts', 'Home-page and “up next” recommendations', 'Copyright matching and safety checks on uploads'], out:['Live streaming (see the Hotstar case)', 'Comments system in depth', 'Ads serving and creator payouts', 'Search over videos (see the Google Search case)']},
  challenges:['Uploads are huge (GBs) over flaky mobile networks', 'Transcoding is very compute-heavy, and the upload rate never stops', 'Egress bandwidth: video is most of the bytes, and users are everywhere', 'A long-tailed catalogue: billions of videos, most rarely watched, so caching is hard', 'Hot metadata: a viral video’s view count and like count update constantly', 'Recommendations must choose a handful of videos out of billions in milliseconds'],
  fr:['Upload a video (resumable), with title, description and thumbnail', 'Watch any video on any device with adaptive quality', 'See view count, likes and channel info', 'Home feed and “up next” recommendations', 'Creators see processing status and basic analytics'],
  nfr:['Video start time ~1 s and very few rebuffers (illustrative target)', 'Uploads are never lost once acknowledged', 'Watching is highly available, even if uploads or recommendations degrade', 'View counts can lag, but must not be easy to inflate with bots', 'Cost per hour streamed must keep falling (codecs, caching)'],
  scale:[
    {k:'Uploads', v:'500+ hours of video per minute', math:'YouTube press figure (2019)', tag:'public'},
    {k:'Watch time', v:'1B+ hours per day', math:'YouTube announcement (2017)', tag:'public'},
    {k:'Video uploaded per day', v:'720K hours', math:'500 h/min × 60 × 24', tag:'illustrative'},
    {k:'Average concurrent streams', v:'≈ 42M', math:'1B h/day × 3,600 s ÷ 86,400 s', tag:'illustrative'},
    {k:'Average egress', v:'≈ 100 Tbps', math:'42M streams × ~2.5 Mbps average bitrate', tag:'illustrative'},
    {k:'New encoded storage per day', v:'≈ 6 PB', math:'720K h × (≈ 9 Mbps of renditions per codec × 2 codecs) × 3,600 s ÷ 8', tag:'illustrative'},
    {k:'Metadata', v:'tens of TB', math:'billions of videos × ~5 KB (title, description, ids, counters)', tag:'illustrative'}],
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
    {title:'One server + one database', scale:'a few K videos', fix:'<p>One web server stores uploaded MP4 files on its own disk and their titles in MySQL. Viewers download the file progressively from the same server. Fine for a club or a class.</p>', after:{lat:600, err:.2, load:20}},
    {title:'The disk fills; one server can’t stream', scale:'100K videos', hot:['app'], breaks:'<p>Video files fill the disk, and a few hundred simultaneous viewers saturate the server’s network card. When the server dies, every video disappears with it.</p>', fix:'<p>Move video files to a replicated <b>object store</b> and run several <b>stateless web servers</b> behind a <b>load balancer</b>. Servers keep only metadata logic; any server can serve any video.</p>', sub:{app:'stateless × N'}, before:{lat:4000, err:6, load:170}, after:{lat:700, err:.2, load:55}, flow:[['u', 'lb', 'GET /watch'], ['lb', 'app'], ['app', 'blob', 'read file']], lesson:['storage-types', 'vertical-vs-horizontal']},
    {title:'Raw 4K uploads don’t play on phones', scale:'10K uploads/day', hot:['app'], breaks:'<p>Big uploads tie up web servers for minutes and restart from zero when a phone drops signal. The original 4K file is unplayable on a 3G phone and wastes bandwidth everywhere else.</p>', fix:'<p>A dedicated <b>upload service</b> accepts <b>resumable chunked uploads</b>. Once complete, it enqueues a <b>transcode job</b>; a fleet of <b>transcoders</b> produces a ladder of renditions (144p to 4K, several codecs), cut into a few seconds per segment for adaptive streaming (DASH/HLS), and writes them to storage.</p>', before:{lat:3000, err:4, load:140}, after:{lat:650, err:.2, load:50}, flow:[['u', 'up', 'chunk 37/80'], ['up', 'q', 'job'], ['q', 'tx'], ['tx', 'blob', '144p…4K segments']], lesson:['transcoding-pipeline', 'queues-pubsub-streams']},
    {title:'Bandwidth melts the origin', scale:'1B views/day', hot:['blob', 'lb'], breaks:'<p>Every view streams from the origin data centre: egress costs explode, cross-ocean links congest at evening peak, and viewers far away rebuffer.</p>', fix:'<p>Serve video from <b>edge caches</b> close to viewers, including caches placed <b>inside ISPs’ networks</b>, filled from origin on a miss. Players use <b>adaptive bitrate</b>: they fetch a manifest, start on a low rung for a fast start, then switch up or down per segment as bandwidth changes.</p>', sub:{blob:'origin only'}, before:{lat:2500, err:2.5, load:180}, after:{lat:350, err:.1, load:45}, flow:[['u', 'edge', 'segment 12 @720p'], ['edge', 'blob', 'miss → fill']], lesson:['cdn', 'live-streaming-abr']},
    {title:'Watch pages hammer MySQL', scale:'100K pages/s', hot:['meta'], breaks:'<p>Every watch page reads the title, channel, thumbnails and counts. The primary database spends its life on identical reads of popular videos, and replication lag grows.</p>', fix:'<p>Cache metadata in a <b>memcache</b> tier (cache-aside, short TTL, invalidate on edit) and add <b>read replicas</b>. Popular videos are served almost entirely from RAM.</p>', before:{lat:900, err:.8, load:130}, after:{lat:250, err:.05, load:55}, flow:[['app', 'mcache', 'hit']], lesson:['cache-strategies', 'replication']},
    {title:'One MySQL primary can’t take the writes', scale:'billions of rows', hot:['meta'], down:[], breaks:'<p>Uploads, likes, subscriptions and edits all go to one primary. Tables grow past what one machine can hold, schema changes take days, and failover is risky.</p>', fix:'<p><b>Shard MySQL</b> by video/channel id behind a routing layer. YouTube built <b>Vitess</b> for this: applications talk to a proxy that routes queries to the right shard, pools connections and manages resharding and failover.</p>', sub:{meta:'Vitess (sharded)'}, before:{lat:800, err:1.2, load:120}, after:{lat:240, err:.05, load:50}, flow:[['app', 'meta', 'routed to shard 17']], lesson:['sharding', 'connection-pooling']},
    {title:'View counts become a hot-row war', scale:'50K views/s', hot:['meta'], breaks:'<p><code>UPDATE videos SET views = views + 1</code> on a viral video locks one row tens of thousands of times a second. Bots can also inflate views.</p>', fix:'<p>Write <b>view events</b> to a stream instead. Consumers validate them (bot and spam filtering), then aggregate counts per video per minute into a <b>counter store</b>, and periodically fold totals into metadata. Counts are eventually consistent: they may lag or pause while validated.</p>', sub:{meta:'Vitess (sharded)'}, before:{lat:1200, err:2, load:150}, after:{lat:240, err:.05, load:55}, flow:[['app', 'views', 'view event'], ['views', 'an', 'aggregate']], lesson:['queues-pubsub-streams', 'hll-cms']},
    {title:'Billions of videos: what to watch?', scale:'2B+ users', hot:['app'], breaks:'<p>Showing “most popular” to everyone gives poor engagement, and scoring billions of videos per request is impossible within a page-load budget.</p>', fix:'<p>A <b>two-stage recommender</b>: <b>candidate generation</b> narrows billions of videos to hundreds using the user’s history (nearest-neighbour search over learned embeddings), then a <b>ranking</b> model scores those hundreds with rich features. Training data comes from the engagement events.</p>', before:{lat:450, err:.3, load:80}, after:{lat:260, err:.05, load:60}, flow:[['app', 'rec', 'up next?'], ['rec', 'an', 'features']], lesson:['recommendations', 'vector-search-rag']},
    {title:'Transcoding can’t keep up', scale:'500 h/min uploads', hot:['q', 'tx'], breaks:'<p>Encoding every upload into every rendition and codec in software takes enormous compute (try the calculator in Deep dives). Queues back up, and a creator’s premiere stays “processing” for hours.</p>', fix:'<p>Split each video into chunks transcoded <b>in parallel</b>, then stitch. Prioritise jobs (premieres and big channels first). Encode cheap codecs at once and expensive ones (VP9/AV1) for videos that actually get views. Google built a custom video transcoding chip (<b>Argos VCU</b>) to cut cost further.</p>', sub:{tx:'chunks + VCUs'}, before:{lat:300, err:1.5, load:190}, after:{lat:260, err:.05, load:65}, flow:[['q', 'tx', 'chunk jobs'], ['tx', 'blob', 'renditions']], lesson:['transcoding-pipeline', 'backpressure']},
    {title:'Copyright & safety at upload speed', scale:'every upload', hot:['blob'], breaks:'<p>Re-uploaded films and music, and harmful content, spread before anyone reviews them. Manual review can’t keep up with 500 hours a minute.</p>', fix:'<p>Fingerprint every upload’s audio and video and match it against reference files from rights holders (<b>Content ID</b>), plus ML safety classifiers. Matches apply the rights holder’s policy (block, track or monetise); risky videos are held for human review.</p>', before:{lat:280, err:1, load:70}, after:{lat:260, err:.05, load:65}, flow:[['tx', 'blob', 'stored'], ['blob', 'cid', 'fingerprint & match']], lesson:['event-driven', 'workflow-orchestration']}],
  flows:[
    {name:'Watch a video', steps:[
      {note:'The app requests the watch page through the edge. The API server reads metadata from cache and asks for “up next”.', flow:[['u', 'edge', 'GET /watch?v=…'], ['edge', 'lb'], ['lb', 'app'], ['app', 'mcache', 'title, channel'], ['app', 'rec', 'up next']]},
      {note:'The player fetches the manifest (the list of renditions and segment URLs) and the first segment at a low bitrate for a fast start.', flow:[['u', 'edge', 'manifest + seg 1 @240p']]},
      {note:'A segment not yet at this edge is fetched from origin storage once, then served to everyone nearby.', flow:[['edge', 'blob', 'miss → fill'], ['blob', 'edge'], ['edge', 'u']]},
      {note:'As the buffer grows, ABR switches up to 720p/1080p segment by segment; on a slow network it drops down instead of stalling.', flow:[['u', 'edge', 'seg 2 @720p'], ['u', 'edge', 'seg 3 @1080p']]},
      {note:'The player sends a view event; it is validated and counted asynchronously, never on the playback path.', flow:[['u', 'edge', 'view ping'], ['edge', 'lb'], ['lb', 'app'], ['app', 'views'], ['views', 'an', '+1 (validated)']]}]},
    {name:'Upload a video', steps:[
      {note:'The app opens a resumable upload session and sends chunks; after a dropped connection it asks “how much do you have?” and resumes.', flow:[['u', 'up', 'chunk 1…80']]},
      {note:'When complete, the upload service records the video as “processing” and enqueues a transcode job.', flow:[['up', 'q', 'transcode v=…']]},
      {note:'Transcoders split the video into chunks, encode a ladder of renditions in parallel and write segments to storage.', flow:[['q', 'tx'], ['tx', 'blob', 'renditions']]},
      {note:'Content ID and safety checks fingerprint the new video. If it passes, the video is marked public.', flow:[['blob', 'cid', 'match?']]}]}],
  breakIt:[
    {label:'An edge cache site fails', kill:['edge'], verdict:'degrades', text:'Players retry against another edge site or origin. Latency and origin load rise, and viewers in that area may drop to lower bitrates for a while, but playback continues.', flow:[['edge', 'blob', 'more misses']]},
    {label:'Transcoders down', kill:['tx'], verdict:'degrades', text:'New uploads stay “processing” and the queue grows (it is durable, so nothing is lost). Watching existing videos is completely unaffected: the pipeline is off the playback path.'},
    {label:'Recommendations down', kill:['rec'], verdict:'degrades', text:'The watch page times out the call quickly and falls back to cached or popular lists. Engagement dips; nothing breaks.'},
    {label:'Metadata cache flushed', kill:['mcache'], verdict:'degrades', text:'All reads hit Vitess at once. Request coalescing and load shedding protect the shards while the cache refills; pages slow for a few minutes.', flow:[['app', 'meta', 'cold reads']]},
    {label:'View-event pipeline stalls', kill:['views'], verdict:'survives', text:'Views keep playing; counts freeze and catch up when consumers recover (events are buffered in the stream).'},
    {label:'A metadata shard primary dies', kill:['meta'], verdict:'degrades', text:'Vitess promotes a replica. Writes to that shard (uploads, likes for those videos) fail for seconds; reads continue from replicas and cache, and video bytes come from edges anyway.', flow:[['app', 'mcache', 'cached reads']]}],
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
-- Object store keys: /v/{video_id}/{codec}/{height}/seg_{n}.m4s`, notes:'Video bytes never touch the database: rows hold only paths into the object store. Sharding by video_id spreads hot videos across shards; per-channel queries (a channel’s uploads list) use a separate index table sharded by channel_id.'},
  apis:[
    {m:'POST', path:'/upload/v1/videos?uploadType=resumable', note:'Creates a resumable session (simplified from public resumable-upload conventions). The client then PUTs chunks with Content-Range.', req:'{ "title": "Goa trip vlog", "privacy": "public" }', res:'200 OK\nLocation: /upload/v1/sessions/abc123'},
    {m:'PUT', path:'/upload/v1/sessions/abc123', note:'Send a chunk; after a disconnect, query the session to learn the next byte offset.', req:'Content-Range: bytes 41943040-50331647/314572800\n<binary chunk>', res:'308 Resume Incomplete\nRange: bytes=0-50331647'},
    {m:'GET', path:'/watch/v1/{video_id}', note:'Watch-page data; the player then fetches the manifest and segments from the edge host it returns.', res:'{ "title": "Goa trip vlog", "views": 182344, "manifest": "https://edge-17.example/v/aB3xY/manifest.mpd", "up_next": ["Qw9…", "Zz1…"] }'}],
  algorithm:{title:'The transcoding bill and the long tail', html:'<p>Two numbers dominate YouTube’s design. First, <b>compute</b>: every upload is encoded into many renditions and codecs, so encoding cost scales with upload rate × ladder size × codec cost. Second, <b>the long tail</b>: views are concentrated on popular videos, but there are so many unpopular ones that a cache holding only “the hits” still misses a lot. Use the two calculators to see both.</p>', mount:host => { transcodeCalc(host); host.append(hr()); longTailCache(host); }},
  tradeoffs:[['Pre-transcode a full ladder at upload time', 'Instant start and smooth ABR for every viewer', 'Huge compute and storage, much of it for videos nobody watches, so encode expensive codecs only for popular ones'], ['Edge caches inside ISPs', 'Short paths, low transit cost, and the ISP benefits too', 'Operating hardware in thousands of locations; cache misses on the long tail'], ['Eventually consistent view counts', 'No hot rows; room to filter bots before counting', 'Counts lag or pause; users notice'], ['Vitess (sharded MySQL) instead of a new NoSQL store', 'Keeps SQL, transactions and existing code while scaling out', 'Cross-shard queries and resharding need care'], ['Two-stage recommendations', 'Scores billions of videos within a page-load budget', 'Candidate generation can miss good videos; feedback loops can over-promote popular content']],
  alternatives:[['Transcode on the fly when requested', 'Saves storage for rarely watched videos, but the first viewer waits and popular videos are re-encoded constantly; used selectively at most'], ['A commercial CDN only', 'Good at small/medium scale; at YouTube’s egress, owning edge capacity is far cheaper'], ['Cassandra/Bigtable for all metadata', 'Scales writes easily, but loses SQL transactions and secondary indexes the product relies on'], ['Exact, synchronous view counts', 'Hot-row contention and no time to filter bots']],
  failures:[['Edge site', 'Players fail over to another edge or origin; ABR lowers bitrate if needed'], ['Transcoding fleet', 'Durable queue holds jobs; playback unaffected'], ['Metadata shard', 'Vitess promotes a replica; reads continue from replicas/cache'], ['Recommendations', 'Fall back to popular/subscription lists'], ['Region', 'DNS steers users to other regions; video served from edges regardless']],
  lab:{stack:['Node.js or Go', 'FFmpeg', 'MinIO (S3-compatible storage)', 'Redis (queue + counters)', 'PostgreSQL', 'hls.js or dash.js player', 'Nginx as an edge cache'], milestones:[
    {day:'Day 1: upload & transcode', items:['Resumable chunked upload with an offset query', 'Queue a job; a worker runs FFmpeg to produce 240p/480p/720p HLS renditions', 'Store segments + master playlist in MinIO', 'Video status: processing → public']},
    {day:'Day 2: stream', items:['A watch page with hls.js; confirm ABR switching by throttling in DevTools', 'Nginx proxy_cache in front of MinIO as the “edge”', 'Cache-aside for metadata in Redis', 'Measure start time with a cold and a warm edge']},
    {day:'Day 3: counts & scale', items:['View events to a Redis Stream; a consumer aggregates per minute', 'Basic bot filter (one view per IP per video per 30 s)', 'Split transcoding by chunks across 3 workers and stitch', '“Up next” = most co-watched videos (simple item-to-item)']}],
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
   loadTest:'<p>Use k6 to simulate 2,000 viewers fetching segments for 50 videos with Zipf popularity (s ≈ 0.8) through the Nginx edge. Track edge hit ratio, origin requests per second and segment p99 latency. Then upload 20 videos at once and watch queue depth and time-to-public; add a second worker and compare.</p>'},
  twists:[
    {q:'A creator with 100M subscribers premieres a video. What do you do differently?', a:'Transcode ahead of the premiere with top priority and all codecs; pre-warm edge caches with the first segments of every rendition; cache the metadata with a long TTL; protect the counter path (a burst of view events) with batching; give the comments/likes paths their own capacity so they can’t starve playback.'},
    {q:'How do you make a view count trustworthy?', a:'Count asynchronously from events, filter out bots and repeated views (per user/IP/device windows, watch-time thresholds, ML fraud scores), and only then aggregate. That is why counts can lag or pause on viral videos: validation is part of the pipeline. Approximate structures (HyperLogLog) estimate unique viewers cheaply.'},
    {q:'Viewers in a region complain about buffering every evening. How do you debug it?', a:'Check per-ISP and per-edge metrics: rebuffer ratio, start time, bitrate chosen and edge hit ratio by hour. If edge links saturate at peak, add capacity or place caches inside that ISP; if hit ratio is low, enlarge caches or pre-position popular content; if only some devices suffer, look at the player’s ABR logic and codec support.'}],
  real:[
    {co:'YouTube', tier:'confirmed', text:'More than 500 hours of video are uploaded to YouTube every minute (stated in 2019), and people watch over a billion hours a day (announced in 2017).', src:'YouTube press/official blog statements (2017, 2019)'},
    {co:'YouTube / Vitess', tier:'confirmed', text:'Vitess was created at YouTube to scale MySQL horizontally (sharding, connection pooling, query routing) and is now a CNCF graduated project.', src:'vitess.io project documentation; CNCF'},
    {co:'YouTube recommendations', tier:'confirmed', text:'The 2016 paper describes a two-stage system: a candidate-generation network selecting hundreds of videos from millions, followed by a ranking network.', src:'Covington, Adams & Sargin, “Deep Neural Networks for YouTube Recommendations” (RecSys 2016)'},
    {co:'Google Argos', tier:'confirmed', text:'Google designed a custom video transcoding accelerator (the Argos VCU) and deployed it for YouTube to cut the cost of encoding uploads, especially with newer codecs.', src:'Ranganathan et al., “Warehouse-scale video acceleration: co-design and deployment in the wild” (ASPLOS 2021); Google blog (2021)'},
    {co:'Google Global Cache', tier:'confirmed', text:'Google places caching servers inside ISPs’ networks (Google Global Cache) to serve popular content, including YouTube video, close to users.', src:'Google Peering / Google Global Cache documentation'},
    {co:'YouTube Content ID', tier:'confirmed', text:'Rights holders provide reference files; uploads are scanned for matches and the rights holder’s chosen policy (block, track or monetise) is applied.', src:'YouTube Help, “How Content ID works”'},
    {co:'Pipeline details', tier:'inference', text:'Chunked parallel transcoding, popular-first codec encoding and asynchronous validated view counting are reasonable inferences from public talks and industry practice; exact internal designs are not public.', src:'General video-platform engineering practice'},
    {co:'Data model', tier:'educational', text:'The tables and key layout shown are a simplified teaching design, not YouTube’s schema.', src:'This case study'}],
  sources:['Covington, Adams & Sargin — Deep Neural Networks for YouTube Recommendations (RecSys 2016)', 'Ranganathan et al. — Warehouse-scale Video Acceleration: Co-design and Deployment in the Wild (ASPLOS 2021)', 'Vitess documentation — history and architecture', 'Google Global Cache — ISP documentation', 'YouTube Help — How Content ID works', 'ISO/IEC 23009-1 (MPEG-DASH) and IETF RFC 8216 (HTTP Live Streaming)', 'Kleppmann — Designing Data-Intensive Applications, ch. 6 (partitioning) and ch. 11 (stream processing)']
});

/* ======================= 3. NETFLIX ======================= */
SDA.register({kind:'case', id:'netflix', tier:'flagship', icon:'🎬', title:'Netflix (global streaming)', tagline:'A control plane in the cloud, video from boxes inside your ISP, and chaos on purpose.', tags:['open connect', 'cdn', 'microservices', 'resilience', 'chaos engineering', 'cassandra', 'per-title encoding', 'personalization'],
  modules:['reliability', 'architecture', 'realtime', 'traffic', 'databases'],
  summary:'Stream a known, curated catalogue to hundreds of millions of members on thousands of device types. Netflix splits the problem in two: a <b>control plane</b> of cloud microservices (sign-in, browse, recommendations, “press play”) and a <b>data plane</b> of its own CDN appliances inside ISPs that serve the video bytes. Resilience is engineered in with fallbacks, multi-region failover and deliberate chaos testing.',
  accuracy:'Netflix publishes a lot: Open Connect, the AWS migration, Zuul, Eureka, Hystrix, Chaos Monkey, EVCache, Cassandra use, per-title encoding, the recommender system and active-active multi-region are labelled confirmed. Exact current service boundaries and numbers change over time, so connecting details are reasonable inference or simplified for teaching. Numbers are illustrative unless marked publicly disclosed.',
  overview:{what:'A member opens the app on a TV, sees personalised rows with personalised artwork, presses play, and video starts within seconds from a server inside their own ISP, adapting quality as the home network fluctuates.', in:['Sign-in, profiles and entitlement checks', 'Personalised home page (rows, ranking, artwork)', 'Playback: choosing servers, licences (DRM), ABR', 'Encoding pipeline for new titles', 'Content distribution to ISP-hosted caches', 'Resilience: fallbacks, failover, chaos testing'], out:['Billing and payments in depth (see the Stripe case)', 'Studio production tooling', 'Live sports specifics (see the Hotstar case)', 'Games']},
  challenges:['Video is most of the bytes: delivering it at evening peak without congesting the internet', 'Thousands of device types and network conditions, one catalogue', 'Hundreds of microservices: one slow dependency must not take down the app', 'Surviving the loss of a whole cloud region', 'Personalising everything (rows, order, artwork) for each profile in milliseconds'],
  fr:['Browse a personalised home page and search', 'Press play: start quickly, adapt quality, resume where you left off', 'Multiple profiles per account, with viewing history', 'Download for offline viewing (on supported devices)', 'New titles available worldwide at launch time'],
  nfr:['Playback start in a couple of seconds; rebuffering is rare (illustrative target)', 'Playback keeps working even if non-critical services (recommendations, ratings) fail', 'Survive a full region outage with minutes of impact at most', 'Peak-hour delivery cost and ISP congestion kept low', 'Content protection (DRM) on every stream'],
  scale:[
    {k:'Paid memberships', v:'300M+', math:'Netflix Q4 2024 shareholder letter (≈ 302M)', tag:'public'},
    {k:'Peak concurrent streams', v:'≈ 30M', math:'~300M accounts × ~10% streaming at the global peak', tag:'illustrative'},
    {k:'Peak video egress', v:'≈ 150 Tbps', math:'30M streams × ~5 Mbps', tag:'illustrative'},
    {k:'Encoded catalogue (one full copy)', v:'≈ 10 PB', math:'~50K content hours × ~120 encodes per title (bitrates × codecs × audio) × ~1.5 GB per hour per encode', tag:'illustrative'},
    {k:'Share of hours from recommendations', v:'≈ 80%', math:'Gomez-Uribe & Hunt (2015)', tag:'public'},
    {k:'Control-plane API calls', v:'billions per day', math:'300M members × a few sessions × dozens of calls per session', tag:'illustrative'}],
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
    {title:'One monolith + one database', scale:'DVD-by-mail site', fix:'<p>A single Java web application in Netflix’s own data centre, backed by one big relational database. Every feature (queue, ratings, billing) lives in the same codebase and the same schema.</p>', after:{lat:500, err:.2, load:30}},
    {title:'One database corruption = days down', scale:'2008', down:['db'], hot:['app'], breaks:'<p>A single database is a single point of failure. In August 2008 a major database corruption stopped Netflix shipping DVDs for three days. Vertical scaling in one data centre also couldn’t keep up with streaming growth.</p>', fix:'<p>Move to the <b>cloud (AWS)</b> and break the monolith into <b>stateless services</b> behind an <b>API gateway</b> (Netflix built Zuul). Services can be deployed, scaled and fail independently; data moves to replicated stores. The migration took about seven years, completing in 2016.</p>', sub:{app:'services on AWS'}, before:{lat:5000, err:30, load:100}, after:{lat:400, err:.2, load:45}, flow:[['u', 'gw', 'GET /home'], ['gw', 'app']], lesson:['monolith-to-microservices', 'fault-tolerance-spof']},
    {title:'One slow service freezes the whole app', scale:'100s of services', hot:['app', 'gw'], breaks:'<p>The “ratings” service gets slow. Every page waits on it, gateway threads pile up, and soon nothing loads, even playback (<b>cascading failure</b>). Instances also come and go constantly in the cloud, so hard-coded addresses break.</p>', fix:'<p>Wrap every remote call in a <b>timeout + circuit breaker + fallback</b> (Netflix’s Hystrix library popularised this): if ratings fail, show the page without them. Isolate dependencies in separate thread pools (<b>bulkheads</b>). Services find each other through a <b>registry</b> (Eureka) with client-side load balancing.</p>', before:{lat:8000, err:12, load:160}, after:{lat:420, err:.3, load:50}, flow:[['app', 'disc', 'where is ratings?']], lesson:['circuit-breaker', 'bulkhead-fallback', 'service-discovery']},
    {title:'The relational DB can’t go global', scale:'100M+ events/day', hot:['db'], breaks:'<p>Viewing history and “continue watching” bookmarks are write-heavy, huge and needed in every region. A single relational primary becomes the bottleneck and can’t accept writes in several regions at once.</p>', fix:'<p>Move high-volume, availability-critical data (viewing history, bookmarks) to <b>Cassandra</b>, replicated across regions with tunable consistency, and put <b>EVCache</b> (a memcached-based, cross-zone cache) in front of hot reads. Keep money-related data (billing) in a relational database with ACID transactions.</p>', sub:{db:'billing (MySQL)'}, before:{lat:1500, err:2, load:150}, after:{lat:300, err:.1, load:55}, flow:[['app', 'evc', 'hit'], ['app', 'cass', 'bookmark write']], lesson:['sql-vs-nosql', 'quorums', 'cache-layers']},
    {title:'Thousands of devices, one catalogue', scale:'1,000s of devices', hot:['app'], breaks:'<p>One encoding of each film looks blocky on a 4K TV, won’t play on an old phone and wastes bandwidth on cartoons. Devices differ in codecs, resolutions and DRM.</p>', fix:'<p>An <b>encoding pipeline</b> turns each studio master into many encodes (resolutions × bitrates × codecs × audio and subtitle tracks), packaged for ABR and DRM. Netflix introduced <b>per-title encoding</b> (2015), later shot-based: each title gets its own bitrate ladder based on how hard it is to compress.</p>', before:{lat:600, err:3, load:70}, after:{lat:450, err:.2, load:55}, flow:[['enc', 's3', 'encodes']], lesson:['transcoding-pipeline']},
    {title:'Video melts the internet at 9 pm', scale:'Tbps at peak', hot:['s3', 'gw'], breaks:'<p>Streaming every byte from cloud storage or commercial CDNs at evening peak is expensive and congests the links between networks. Viewers rebuffer exactly when most people watch.</p>', fix:'<p>Build a dedicated CDN, <b>Open Connect</b>: Netflix-designed storage appliances (OCAs) installed <b>inside ISPs</b> and at internet exchange points, free to ISPs. Because the catalogue is known in advance, OCAs are <b>filled during off-peak hours</b> with the content predicted to be popular there. Peak traffic never leaves the ISP.</p>', sub:{s3:'origin for fills'}, before:{lat:2500, err:2.5, load:170}, after:{lat:300, err:.1, load:40}, flow:[['s3', 'oca', 'nightly fill'], ['u', 'oca', 'video segments']], lesson:['cdn', 'cache-layers']},
    {title:'Which server, which bitrate?', scale:'many OCAs/ISP', hot:['oca'], breaks:'<p>Clients pick a server blindly: some OCAs are overloaded or don’t have that file, others sit idle; a single failing OCA stalls playback.</p>', fix:'<p>On “play”, a <b>playback/steering service</b> in the cloud checks entitlements, issues the DRM licence and returns a <b>ranked list of OCA URLs</b> that hold the file, chosen from OCA health, load and network proximity. The client streams from the first, switches to the next on trouble, and runs <b>adaptive bitrate</b> per segment.</p>', before:{lat:900, err:1.2, load:95}, after:{lat:280, err:.05, load:55}, flow:[['u', 'gw', 'POST /play'], ['gw', 'steer', 'rank OCAs'], ['u', 'oca', 'stream']], lesson:['live-streaming-abr', 'health-checks-sticky']},
    {title:'An entire cloud region goes down', scale:'multi-region', hot:['gw'], down:['app'], breaks:'<p>Cloud regions occasionally have large outages. With everything in one region, members can’t even sign in or press play, even though the video is sitting on OCAs.</p>', fix:'<p>Run the control plane <b>active-active in several regions</b> with data replicated between them (Cassandra, EVCache replication). If a region fails, DNS and the gateways <b>shift members to healthy regions</b> within minutes. Netflix rehearses this with <b>Chaos Kong</b> (evacuating a region) and kills instances with <b>Chaos Monkey</b> in production.</p>', sub:{gw:'multi-region'}, before:{lat:6000, err:35, load:100}, after:{lat:350, err:.1, load:65}, flow:[['u', 'gw', 'routed to healthy region']], lesson:['multi-az-region', 'chaos-engineering']},
    {title:'Everyone sees the same home page', scale:'200M+ profiles', hot:['app'], breaks:'<p>A single “top titles” list wastes the catalogue: members scroll, find nothing and leave. Personalising everything on each request would be far too slow.</p>', fix:'<p>A <b>personalization</b> system ranks titles, rows and even <b>artwork</b> per profile. Heavy models run <b>offline</b> and nearline on viewing events from an <b>event pipeline</b> (Kafka-based); results are cached so the online path only does light re-ranking.</p>', before:{lat:500, err:.3, load:70}, after:{lat:320, err:.05, load:60}, flow:[['app', 'events', 'play, scroll, click'], ['events', 'reco', 'train / refresh'], ['app', 'reco', 'rows for profile']], lesson:['recommendations', 'lambda-kappa']},
    {title:'Launch night spike', scale:'launch night', hot:['gw', 'steer'], breaks:'<p>Millions press play on the same title within minutes of release. Sign-ins and play requests spike 5–10× and autoscaling reacts too slowly; if every request is treated equally, playback fails along with everything else.</p>', fix:'<p><b>Pre-position</b> the new title on OCAs worldwide before launch. <b>Pre-scale</b> the control plane from predicted demand (Netflix has described predictive autoscaling). In the gateway, use <b>prioritised load shedding</b>: when overloaded, drop low-priority requests (prefetching, logging) first so play requests keep working.</p>', sub:{gw:'load shedding'}, before:{lat:3500, err:6, load:240}, after:{lat:400, err:.2, load:85}, flow:[['s3', 'oca', 'pre-position'], ['u', 'gw', 'play (high priority)'], ['gw', 'steer']], lesson:['load-shedding', 'autoscaling']}],
  flows:[
    {name:'Press play', steps:[
      {note:'The app sends a play request to the nearest healthy region’s gateway with the title, device capabilities and profile.', flow:[['u', 'gw', 'POST /play {title, device}']]},
      {note:'The playback service checks entitlement and issues a DRM licence, then ranks OCAs that hold the needed files by health and proximity.', flow:[['gw', 'steer', 'licence + OCA list']]},
      {note:'The gateway also fetches the resume point from the bookmark store (via EVCache).', flow:[['gw', 'app'], ['app', 'evc', 'bookmark?'], ['app', 'cass', 'miss → read']]},
      {note:'The client streams segments from the first OCA, inside its own ISP, adapting bitrate segment by segment.', flow:[['u', 'oca', 'segments (ABR)']]},
      {note:'Playback events (start, bitrate switches, progress) flow back for bookmarks, quality monitoring and recommendations.', flow:[['u', 'gw', 'heartbeat'], ['gw', 'app'], ['app', 'events', 'playback events'], ['app', 'cass', 'bookmark']]}]},
    {name:'New title goes live', steps:[
      {note:'The studio master is encoded into the title’s own bitrate ladder (per-title/shot-based), for every codec and device family.', flow:[['enc', 's3', 'encodes + DRM packaging']]},
      {note:'Days before launch, OCAs worldwide are filled during their local off-peak window.', flow:[['s3', 'oca', 'off-peak fill']]},
      {note:'At launch, play requests are steered only to OCAs that already hold the files.', flow:[['u', 'gw', 'play'], ['gw', 'steer'], ['u', 'oca', 'stream']]}]},
    {name:'Load the home page', steps:[
      {note:'The app asks for the home page; the gateway routes it to the service that assembles rows.', flow:[['u', 'gw', 'GET /home'], ['gw', 'app']]},
      {note:'Personalization returns precomputed rows and per-profile artwork choices; results are cached.', flow:[['app', 'reco', 'rows for profile'], ['app', 'evc', 'cache']]},
      {note:'If personalization is slow, a circuit breaker returns a fallback (popular titles) instead of an error.', flow:[['app', 'gw', 'page (maybe fallback)'], ['gw', 'u']]}]}],
  breakIt:[
    {label:'An OCA dies mid-stream', kill:['oca'], verdict:'survives', text:'The client already has a ranked list of OCAs; it switches to the next one (often in the same ISP), possibly at a lower bitrate for a few segments. Viewers barely notice.', flow:[['u', 'oca', 'next OCA in list']]},
    {label:'Personalization is down', kill:['reco'], verdict:'degrades', text:'Circuit breakers trip and the home page uses fallback rows (popular, unpersonalised). Browsing gets less relevant, but playback is unaffected.', flow:[['app', 'evc', 'fallback rows']]},
    {label:'EVCache cluster lost', kill:['evc'], verdict:'degrades', text:'Reads fall through to Cassandra. Latency rises; EVCache replicas in other zones and request coalescing keep Cassandra from being swamped.', flow:[['app', 'cass', 'direct reads']]},
    {label:'A Cassandra node dies', kill:['cass'], verdict:'survives', text:'With replication factor 3 and LOCAL_QUORUM, one replica down doesn’t block reads or writes; hinted handoff and repair resynchronise it later.'},
    {label:'A whole AWS region fails', kill:['gw', 'app'], verdict:'degrades', text:'Members connected to this region see errors until traffic is shifted to healthy regions (minutes). Streams already playing from OCAs keep going.', flow:[['u', 'oca', 'video keeps playing']]},
    {label:'Billing database down', kill:['db'], verdict:'degrades', text:'Sign-ups and plan changes fail, but existing members can browse and watch: playback doesn’t depend on billing synchronously.'},
    {label:'Encoding pipeline down', kill:['enc'], verdict:'survives', text:'New titles are delayed; nothing that members are watching today depends on it.'}],
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
-- invoices(invoice_id PK, account_id FK, amount_minor, currency, status)`, notes:'Partitioning by profile keeps each member’s history on a few replicas and makes “my history” a single-partition read. Writes are last-write-wins, which is fine for bookmarks; money uses a relational database with transactions.'},
  apis:[
    {m:'POST', path:'/playback/v1/play', note:'Simplified and educational: entitlement + DRM + steering in one call.', req:'{ "title_id": 81234567, "profile_id": "p_19", "device": { "codecs": ["av1","hevc","avc"], "max_height": 2160, "drm": "widevine" } }', res:'{ "licence": "<opaque>", "manifest": { "video": [ {"codec":"av1","height":1080,"kbps":3200} ] },\n  "servers": [ "https://oca-1.isp.example/…", "https://oca-2.isp.example/…" ],\n  "resume_at_s": 1312 }'},
    {m:'GET', path:'/home/v1?profile=p_19', note:'Rows are precomputed per profile; artwork ids are chosen per profile too.', res:'{ "rows": [ { "name": "Because you watched Kota Factory", "titles": [ {"id": 8100, "artwork": "a_37"} ] } ], "fallback": false }'},
    {m:'POST', path:'/events/v1/playback', note:'Fire-and-forget heartbeats; batched on the device.', req:'{ "session": "s_9f", "events": [ {"t": 1312, "type": "progress"}, {"t": 1315, "type": "bitrate_switch", "kbps": 1750} ] }'}],
  algorithm:{title:'Proactive caching + per-title encoding', html:'<p>Two ideas make Netflix delivery cheap and smooth. <b>Proactive caching</b>: unlike a general CDN that pulls content on demand, Open Connect knows the catalogue and can predict popularity, so it fills appliances inside ISPs overnight and serves peak traffic without crossing the ISP’s border. <b>Per-title encoding</b>: easy content needs fewer bits for the same visual quality, so each title gets its own bitrate ladder. Below: plan an ISP’s OCAs, compare ladders, and then play with the circuit breaker and chaos simulators that mirror Netflix’s resilience tools.</p>', mount:host => { openConnect(host); host.append(hr()); perTitle(host); }, pg:['circuit-breaker', 'chaos-monkey']},
  tradeoffs:[['Own CDN (Open Connect) inside ISPs', 'Peak traffic stays inside ISPs; much cheaper at Netflix’s volume; fine control of delivery', 'Building and operating hardware and ISP relationships worldwide'], ['Proactive overnight fill', 'Uses idle off-peak capacity; near-perfect hit ratios for a known catalogue', 'Needs good popularity prediction; surprises are served from farther away'], ['Microservices + fallbacks', 'Independent deploys and failure isolation; non-critical features degrade quietly', 'Operational complexity: tracing, discovery, hundreds of deployables'], ['Cassandra for viewing data', 'Multi-region writes, high availability, huge scale', 'Eventual consistency and query-driven data modelling'], ['Active-active multi-region', 'Survive a region loss in minutes', 'Roughly double the control-plane footprint; replication conflicts to design for']],
  alternatives:[['Commercial CDN only', 'Perfectly reasonable for most streaming services; at Netflix’s share of peak internet traffic, owning the CDN is cheaper and gives more control'], ['Single region + backups', 'Simpler and cheaper, but a region outage means hours of downtime'], ['Fixed bitrate ladder', 'Simple, but wastes bits on easy titles and under-serves hard ones'], ['Relational DB for viewing history', 'Easy queries, but hard to scale writes across regions']],
  failures:[['OCA', 'Client switches to the next ranked OCA; steering stops sending traffic there'], ['Non-critical microservice', 'Circuit breaker opens; fallback response'], ['Cache cluster', 'Fall through to Cassandra; cross-zone replicas'], ['AWS region', 'Evacuate to other regions (rehearsed with Chaos Kong)'], ['Gateway overload', 'Prioritised load shedding keeps play requests alive']],
  lab:{stack:['Node.js or Spring Boot', 'Cassandra (or ScyllaDB) in Docker', 'Redis as the cache', 'FFmpeg + Shaka Packager', 'Nginx as an “OCA”', 'k6', 'A circuit-breaker library (opossum / resilience4j)'], milestones:[
    {day:'Day 1: catalogue & play', items:['Encode one title into 3 renditions with FFmpeg; package DASH', 'Two Nginx “OCAs” serving the files', 'POST /play returns a ranked list of OCA URLs from a health table', 'Player switches OCA when one returns errors']},
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
   loadTest:'<p>Seed 100K profiles and bookmarks. In k6, ramp play requests from 100 to 2,000/s in one minute (“launch night”) while running background home-page and logging traffic. Measure play success rate and p99. Repeat with load shedding disabled and with the recommendations service killed; play success should stay near 100% in both, with shedding enabled.</p>'},
  twists:[
    {q:'Why does Netflix fill caches proactively when most CDNs fill on demand?', a:'Netflix controls a finite, known catalogue and can predict what each region will watch tomorrow (new releases, trends, history). Filling overnight uses idle network capacity, avoids peak-time misses and cuts transit costs. A general CDN serving arbitrary web content can’t predict demand, so it pulls on miss.'},
    {q:'Recommendations are down during a big launch. What do members see?', a:'The home page loads with fallback rows (popular in their country, or a cached version of their last personalised page) because calls are wrapped in circuit breakers with fallbacks. Play still works: playback depends only on entitlement, licence and steering, which are isolated in their own pools and prioritised by the gateway.'},
    {q:'How would you design “continue watching” to work across devices and regions?', a:'Devices send periodic progress heartbeats; the latest position per (profile, title) is written to Cassandra with last-write-wins (timestamped), replicated to all regions, and cached in EVCache. Conflicts are rare and harmless (the newest timestamp wins). On play, the steering response includes the resume point.'}],
  real:[
    {co:'Netflix', tier:'confirmed', text:'In August 2008 a major database corruption stopped DVD shipments for three days, prompting the move from vertically scaled, single-point-of-failure systems to horizontally scalable services in AWS; the streaming migration completed in early 2016.', src:'Netflix blog, “Completing the Netflix Cloud Migration” (2016)'},
    {co:'Netflix Open Connect', tier:'confirmed', text:'Open Connect is Netflix’s own CDN: purpose-built appliances (OCAs) deployed inside ISP networks and at internet exchange points, filled during off-peak hours, with the control plane running in AWS.', src:'Netflix Open Connect overview documentation'},
    {co:'Netflix OSS', tier:'confirmed', text:'Netflix open-sourced Zuul (gateway), Eureka (service discovery), Hystrix (latency and fault tolerance, now in maintenance mode) and EVCache (memcached-based distributed cache).', src:'Netflix Tech Blog and Netflix OSS GitHub documentation'},
    {co:'Netflix chaos engineering', tier:'confirmed', text:'Chaos Monkey randomly terminates production instances; Chaos Kong exercises evacuating an entire AWS region. Netflix runs active-active across multiple regions.', src:'Netflix Tech Blog, “The Netflix Simian Army” (2011) and “Active-Active for Multi-Regional Resiliency” (2013)'},
    {co:'Netflix encoding', tier:'confirmed', text:'Per-title encoding (2015) gives each title its own bitrate ladder based on complexity, replacing one fixed ladder (topping out at 5,800 kbps 1080p); it was later refined to shot-based encoding.', src:'Netflix Tech Blog, “Per-Title Encode Optimization” (2015) and “Dynamic optimizer” (2018)'},
    {co:'Netflix recommendations', tier:'confirmed', text:'About 80% of hours streamed were influenced by recommendations, and artwork is personalised per member.', src:'Gomez-Uribe & Hunt, “The Netflix Recommender System” (ACM TMIS 2015); Netflix Tech Blog, “Artwork Personalization at Netflix” (2017)'},
    {co:'Netflix load shedding', tier:'confirmed', text:'Netflix described prioritised load shedding at the API gateway, keeping playback working by dropping less critical requests first under overload.', src:'Netflix Tech Blog, “Keeping Netflix Reliable Using Prioritized Load Shedding” (2020)'},
    {co:'Service boundaries', tier:'inference', text:'The specific grouping of services in the diagram (e.g. one playback/steering box) is a simplification; Netflix’s real services are far more numerous and change over time.', src:'This case study, based on the public material above'},
    {co:'Scale and simulator inputs', tier:'educational', text:'Peak streams, egress, catalogue size and the OCA/encoding simulators use illustrative inputs and a simplified quality model.', src:'This case study’s estimates'}],
  sources:['Netflix Tech Blog — Completing the Netflix Cloud Migration (2016)', 'Netflix Open Connect — overview and appliance documentation', 'Netflix Tech Blog — Per-Title Encode Optimization (2015)', 'Netflix Tech Blog — Active-Active for Multi-Regional Resiliency (2013)', 'Netflix Tech Blog — The Netflix Simian Army (2011)', 'Netflix Tech Blog — Keeping Netflix Reliable Using Prioritized Load Shedding (2020)', 'Gomez-Uribe & Hunt — The Netflix Recommender System: Algorithms, Business Value, and Innovation (ACM TMIS 2015)', 'Basiri et al. — Chaos Engineering (IEEE Software 2016)']
});
})();
