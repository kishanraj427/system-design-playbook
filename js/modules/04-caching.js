
/* =====================================================================
   PART 3 · MODULE 4 — CACHING
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, esc, clamp, fmtNum} = SDA.u; const ui = SDA.ui;
const {sortGame} = SDA.m1helpers;
const frag = html => document.createRange().createContextualFragment(html);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* ---------- widgets ---------- */
function evictTrace(host){
  let seq = 'A B C A D A B E A C D A', cap = 3;
  const out = el('div');
  function run(){
    const keys = seq.trim().split(/[\s,]+/).filter(Boolean).slice(0, 40);
    const P = {LRU:{c:[], hits:0}, LFU:{c:[], f:{}, hits:0}, FIFO:{c:[], hits:0}};
    const rows = keys.map((k, i) => {
      const cells = [];
      { const s = P.LRU, j = s.c.indexOf(k); let note; if (j >= 0){ s.hits++; s.c.splice(j, 1); s.c.push(k); note = 'hit'; } else { let ev = ''; if (s.c.length >= cap) ev = s.c.shift(); s.c.push(k); note = ev ? 'miss, evict ' + ev : 'miss'; } cells.push([s.c.slice(), note]); }
      { const s = P.LFU; let note; s.f[k] = (s.f[k] || 0) + 1; const j = s.c.indexOf(k); if (j >= 0){ s.hits++; s.c.splice(j, 1); s.c.push(k); note = 'hit'; } else { let ev = ''; if (s.c.length >= cap){ let vi = 0; s.c.forEach((x, xi) => { if (s.f[x] < s.f[s.c[vi]]) vi = xi; }); ev = s.c.splice(vi, 1)[0]; } s.c.push(k); note = ev ? `miss, evict ${ev} (freq ${s.f[ev]})` : 'miss'; } cells.push([s.c.map(x => x + '·' + s.f[x]), note]); }
      { const s = P.FIFO; let note; if (s.c.includes(k)){ s.hits++; note = 'hit'; } else { let ev = ''; if (s.c.length >= cap) ev = s.c.shift(); s.c.push(k); note = ev ? 'miss, evict ' + ev : 'miss'; } cells.push([s.c.slice(), note]); }
      return [`<b>${i + 1}. ${esc(k)}</b>`].concat(cells.map(([c, n]) => `<span class="mono">[${c.map(esc).join(' ')}]</span><br><span style="font-size:12px;color:${n === 'hit' ? 'var(--ok)' : 'var(--bad)'}">${esc(n)}</span>`));
    });
    out.innerHTML = '';
    out.append(frag(h.table(['Request', 'LRU (oldest → newest)', 'LFU (key·frequency)', 'FIFO (insertion order)'], rows)));
    out.append(frag(`<div class="metrics">${['LRU', 'LFU', 'FIFO'].map(p => `<div class="metric"><div class="ml">${p} hit ratio</div><div class="mv">${Math.round(P[p].hits / Math.max(1, keys.length) * 100)}<small>%</small></div></div>`).join('')}</div>`));
  }
  const inp = el('input', {class:'input mono', value:seq, 'aria-label':'Sequence of requested keys'}); inp.addEventListener('input', () => { seq = inp.value; run(); });
  host.append(el('label', {class:'field'}, el('span', null, 'Requested keys (space-separated)'), inp), el('div', {class:'pill-row', style:{margin:'8px 0'}}, ...[['Recency-friendly', 'A B C A B D A B E A B'], ['Scan pollutes LRU', 'A B A B A B C D E F G A B'], ['Frequency matters', 'A A A B C D B E F A G H A'], ['FIFO anomaly-ish', 'A B C D A B E A B C D E']].map(([n, s]) => ui.button(n, () => { inp.value = seq = s; run(); }, 'sm ghost'))), ui.slider({label:'Cache capacity', min:2, max:6, step:1, value:3, fmt:v => v + ' items', onInput:v => { cap = v; run(); }}).el, out);
  run();
}
function raceDemo(host, api){
  let mode = 'naive', busy = false;
  const holder = el('div'); const res = el('div', {class:'verdict warn', role:'status'}, 'Pick a strategy and press Run.');
  const d = new api.Diagram(holder, {title:'Two requests race on one key', w:760, h:260, alt:'A reader and a writer service race on the cache and database for the same key.', nodes:[{id:'r', type:'service', label:'Reader (req A)', x:90, y:65, w:140}, {id:'w', type:'service', label:'Writer (req B)', x:90, y:200, w:140}, {id:'c', type:'cache', label:'Cache', sub:'price: —', x:430, y:65}, {id:'db', type:'db', label:'Database', sub:'price: ₹499', x:430, y:200}], edges:[{from:'r', to:'c'}, {from:'r', to:'db'}, {from:'w', to:'db'}, {from:'w', to:'c'}], caption:'Classic cache-aside race: A reads an old value from the DB, B updates and deletes the cache, then A writes its old value into the cache.'});
  const wait = ms => new Promise(r => setTimeout(r, SDA.reduced ? 50 : ms));
  async function run(){
    if (busy) return; busy = true; let cache = null, db = 499, cacheVer = 0;
    d.setSub('c', 'price: —'); d.setSub('db', 'price: ₹499'); d.setStatus('c', 'ok');
    d.setCaption('A: cache <b>miss</b> → reads the DB and gets ₹499…'); await d.flow([['r', 'c', 'GET'], ['c', 'r', 'miss'], ['r', 'db', 'SELECT'], ['db', 'r', '₹499 (v1)']]);
    d.setCaption('…A is slow (GC pause). Meanwhile B updates the price to ₹449 and deletes the cache key.'); await d.flow([['w', 'db', 'UPDATE ₹449 (v2)']]); db = 449; d.setSub('db', 'price: ₹449 (v2)'); await d.flow([['w', 'c', 'DEL']]);
    if (mode === 'naive'){
      d.setCaption('A wakes up and writes what it read into the cache: ₹499.'); await d.flow([['r', 'c', 'SET ₹499']]); cache = 499;
    } else if (mode === 'double'){
      await d.flow([['r', 'c', 'SET ₹499']]); cache = 499; d.setSub('c', 'price: ₹499 (stale)'); d.setStatus('c', 'hot');
      d.setCaption('B scheduled a <b>second delete</b> ~500 ms later, after any in-flight reader has finished…'); await wait(700); await d.flow([['w', 'c', 'DEL (delayed)']]); cache = null;
    } else {
      d.setCaption('A tries <code>SET price ₹499 IF version &gt; current</code>. B had written version 2 as a tombstone, so v1 is rejected.'); cacheVer = 2; await d.flow([['r', 'c', 'SET v1?'], ['c', 'r', 'rejected']]); cache = null;
    }
    d.setSub('c', cache == null ? 'price: — (empty)' : `price: ₹${cache}`);
    const stale = cache != null && cache !== db; d.setStatus('c', stale ? 'hot' : 'ok');
    res.className = 'verdict ' + (stale ? 'bad' : 'ok');
    res.textContent = stale ? `✗ Cache says ₹${cache} but the DB says ₹${db}. Every reader sees the wrong price until the TTL expires — maybe hours.` : `✓ Cache is ${cache == null ? 'empty' : '₹' + cache}; the next read fetches ₹${db} from the DB. No lasting staleness.`;
    d.setCaption(stale ? '<b>Stale forever (until TTL).</b> Deleting before the slow reader finished didn’t help.' : 'Consistent again.');
    busy = false;
  }
  host.append(el('div', {class:'ctl-grid'}, ui.select({label:'Invalidation strategy', value:'naive', options:[['naive', 'Update DB, then delete cache (naive)'], ['double', 'Delayed double delete'], ['version', 'Versioned / lease-guarded SET']], onChange:v => mode = v}).el), holder, el('div', {class:'controls', style:{margin:'8px 0'}}, ui.button('▶ Run the race', run, 'sm primary')), res);
}
function failureSim(host, api){
  const P = {scn:'stampede', fix:'none'};
  const FIX = {stampede:[['none', 'No protection'], ['lock', 'Single-flight lock (one rebuilds, others wait)'], ['swr', 'Serve stale while one request refreshes'], ['early', 'Probabilistic early refresh (XFetch)']], avalanche:[['none', 'Same TTL for every key'], ['jitter', 'TTL ± random jitter']], penetration:[['none', 'No protection'], ['null', 'Cache “not found” for 60 s'], ['bloom', 'Bloom filter of valid IDs in front']]};
  const cv = el('canvas', {height:440, style:{height:'220px'}, 'aria-label':'Database queries per 100 ms over 10 seconds'}); const box = el('div', {class:'chart-box', style:{marginTop:'12px'}}, cv);
  const met = ui.metrics(null, [{id:'peak', label:'Peak DB load', unit:'q/s', warn:500, bad:2000}, {id:'total', label:'DB queries (10 s)'}, {id:'lat', label:'Avg request latency', unit:'ms', warn:20, bad:100}, {id:'stale', label:'Served stale/empty', unit:'%'}]);
  const fixSel = el('select', {class:'input', 'aria-label':'Protection'});
  const story = el('p', {class:'lab-hint'});
  function fillFix(){ fixSel.innerHTML = ''; FIX[P.scn].forEach(([v, t]) => fixSel.append(el('option', {value:v}, t))); P.fix = FIX[P.scn][0][0]; fixSel.value = P.fix; }
  fixSel.addEventListener('change', () => { P.fix = fixSel.value; run(); });
  let bars = [], shown = 0, raf = 0;
  function run(){
    const RATE = 2000, DT = .001, T = 10, DBMS = 200, B = 100; bars = new Array(B).fill(0); let lat = 0, n = 0, staleN = 0;
    const db = t => { bars[Math.min(B - 1, Math.floor(t / T * B))]++; };
    if (P.scn === 'stampede'){
      let exp = 2, refreshing = -1, earlyDone = false;
      for (let t = 0; t < T; t += 1 / RATE){
        n++;
        if (refreshing >= 0 && t >= refreshing){ exp = t + 3; refreshing = -1; earlyDone = false; }
        if (P.fix === 'early' && !earlyDone && refreshing < 0 && t < exp){ const left = exp - t; if (Math.random() < Math.exp(-left / .05) * .02 * 50){ earlyDone = true; refreshing = t + DBMS / 1000; db(t); } }
        if (t < exp){ lat += 1; continue; }
        if (P.fix === 'none'){ db(t); lat += DBMS; if (refreshing < 0) refreshing = t + DBMS / 1000; continue; }
        if (refreshing < 0){ refreshing = t + DBMS / 1000; db(t); lat += DBMS; continue; }
        if (P.fix === 'lock'){ lat += (refreshing - t) * 1000 + 1; } else { lat += 1; staleN++; }
      }
      story.textContent = 'A hot key (2,000 req/s) expires every 3 s; rebuilding it takes a 200 ms DB query.';
    } else if (P.scn === 'avalanche'){
      const K = 10000, exp = new Float64Array(K).fill(-1);
      for (let k = 0; k < K; k++) exp[k] = P.fix === 'jitter' ? 4 + Math.random() * 4 : 6;
      for (let t = 0; t < T; t += 1 / RATE){ n++; const k = Math.floor(Math.random() * K); if (t < exp[k]){ lat += 1; continue; } db(t); lat += 10; exp[k] = t + (P.fix === 'jitter' ? 4 + Math.random() * 4 : 6); }
      story.textContent = '10,000 keys were all cached at t = 0 (e.g. after a deploy warmed the cache). Watch what happens when their TTLs expire.';
    } else {
      const valid = 100000; const nullC = new Map();
      for (let t = 0; t < T; t += 1 / RATE){
        n++; const bogus = Math.random() < .3; const id = bogus ? valid + Math.floor(Math.random() * 1e9) : Math.floor(Math.random() * valid);
        if (!bogus){ lat += 1; continue; }
        if (P.fix === 'bloom'){ if (Math.random() < .01){ db(t); lat += 10; } else lat += 1; continue; }
        if (P.fix === 'null' && nullC.has(id) && nullC.get(id) > t){ lat += 1; continue; }
        db(t); lat += 10; if (P.fix === 'null') nullC.set(id, t + 60);
      }
      story.textContent = 'An attacker requests random IDs that don’t exist (30% of 2,000 req/s). Valid IDs are always cached.';
    }
    const peak = Math.max(...bars) * (B / T);
    met.set('peak', peak); met.set('total', bars.reduce((a, b) => a + b, 0)); met.set('lat', lat / n); met.set('stale', staleN / n * 100);
    shown = 0; cancelAnimationFrame(raf); const t0 = performance.now(); const f = now => { shown = api.reduced ? 1 : clamp((now - t0) / 900, 0, 1); draw(); if (shown < 1) raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f);
  }
  api.onDispose(() => cancelAnimationFrame(raf));
  function draw(){
    const W = box.clientWidth || 640, H = 220; cv.width = W * 2; const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0);
    const mx = Math.max(10, ...bars), bw = (W - 20) / bars.length, upto = Math.floor(bars.length * shown);
    g.font = '11px ' + css('--font-mono'); g.fillStyle = css('--muted'); g.fillText(`DB queries per 100 ms (max ${mx})`, 10, 14);
    for (let i = 0; i < upto; i++){ const v = bars[i], hh = v / mx * (H - 40); g.fillStyle = v > mx * .5 ? css('--bad') : css('--c-db'); g.fillRect(10 + i * bw + 1, H - 20 - hh, bw - 2, hh); }
    g.fillStyle = css('--muted'); g.fillText('0 s', 10, H - 5); g.fillText('10 s', W - 40, H - 5);
  }
  host.append(el('div', {class:'ctl-grid'}, ui.select({label:'Failure mode', value:'stampede', options:[['stampede', 'Stampede / thundering herd'], ['avalanche', 'Avalanche (mass expiry)'], ['penetration', 'Penetration (missing keys)']], onChange:v => { P.scn = v; fillFix(); run(); }}).el, el('label', {class:'field'}, el('span', null, 'Protection'), fixSel)), story, box, el('div', {style:{height:'10px'}}), met.el, el('div', {class:'controls', style:{marginTop:'8px'}}, ui.button('🎲 Run again', run, 'sm')));
  fillFix(); run();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'cache-layers', title:'Where caches live: the caching layers', minutes:8, tags:['cache','browser cache','CDN','local cache','distributed cache','buffer pool'],
  summary:'Browser → CDN → application (in-process) → distributed cache → database buffer pool. Each layer is closer to the user and smaller than the next.',
  problem:`<p>An e-commerce product page gets <strong>50,000 requests a minute</strong> during a sale. Each one costs three database queries. The database melts at 1,500 queries a second — yet 95% of those requests ask for the same 200 products. You are paying a database to answer the same question again and again.</p>`,
  intuition:`Think of how you answer “what’s your phone number?”: you know it by heart (CPU/in-process cache), it’s on a sticky note on your desk (local cache), in the family address book (shared cache), or in the phone company’s records (database). You only walk to the phone company if every closer place fails.`,
  how:{
    steps:[`<b>Browser cache</b>: HTTP headers (<code>Cache-Control</code>, <code>ETag</code>) let the user’s own device skip the request entirely.`, `<b>CDN / edge cache</b>: shared by all users in a region (Module 3).`, `<b>In-process (local) cache</b>: a map inside each app server — nanoseconds, but each server has its own copy and they can disagree.`, `<b>Distributed cache</b> (Redis, Memcached): one shared cache for all app servers — sub-millisecond over the network, consistent view, survives app restarts.`, `<b>Database caches</b>: the buffer pool keeps hot pages in RAM; query/result caches in some systems.`, `Each layer must answer: <b>what</b> is cached, for <b>how long</b>, and <b>how it is invalidated</b>.`],
    diagram:{title:'A read falling through the layers', w:800, h:250, alt:'A request checks browser, CDN, local cache, Redis and finally the database.',
      nodes:[{id:'b', type:'client', label:'Browser cache', x:75, y:125, w:120}, {id:'cdn', type:'cdn', label:'CDN edge', x:230, y:125, w:110}, {id:'app', type:'service', label:'App + local cache', x:400, y:125, w:150}, {id:'r', type:'cache', label:'Redis', x:580, y:60, w:100}, {id:'db', type:'db', label:'Database', sub:'buffer pool', x:720, y:160, w:120}],
      edges:[{from:'b', to:'cdn'}, {from:'cdn', to:'app'}, {from:'app', to:'r'}, {from:'app', to:'db'}],
      steps:[
        {note:'Static assets and some API responses never leave the device: <b>browser cache hit</b> — 0 ms network.', hl:['b']},
        {note:'Shared public content hits the <b>CDN</b> close to the user.', flow:[['b', 'cdn', 'GET /p/42.jpg'], ['cdn', 'b', 'hit']], hl:['cdn']},
        {note:'Dynamic data reaches the app. A tiny <b>in-process</b> cache answers ultra-hot keys (feature flags, config) in nanoseconds.', flow:[['b', 'cdn', 'GET /api/p/42'], ['cdn', 'app']], hl:['app']},
        {note:'Otherwise check <b>Redis</b>, shared by every app server.', flow:[['app', 'r', 'GET product:42'], ['r', 'app', 'hit']], hl:['r']},
        {note:'Only misses reach the <b>database</b> — whose own buffer pool probably has the page in RAM anyway.', flow:[['app', 'r', 'GET product:99'], ['r', 'app', 'miss'], ['app', 'db', 'SELECT'], ['db', 'app'], ['app', 'r', 'SET ttl=300']], hl:['db']}
      ]},
    deep:`<p><b>Hit ratio math:</b> effective latency = hit% × cache latency + miss% × (cache + origin latency). At 1 ms cache and 20 ms DB, going from 90% → 99% hits cuts average latency from 3 ms to 1.2 ms and cuts DB load <b>10×</b> — the last few percent matter most for the origin.</p><p><b>Two-level caching</b> (local + distributed) is common for extremely hot keys: a short local TTL (seconds) absorbs hot-key traffic that would otherwise hammer a single Redis shard. The cost is cross-server inconsistency for up to that TTL. <b>Negative caching</b> stores “not found” to protect the DB (see failure modes).</p>`
  },
  tradeoffs:{use:[`Read-heavy data with a high read:write ratio`, `Expensive-to-compute results (aggregations, rendered fragments)`, `Data where brief staleness is acceptable`], avoid:[`Data that must always be perfectly fresh (balances, seat inventory) unless carefully designed`, `Caching everything “just in case” — memory and invalidation cost`], alt:[`Read replicas (Module 5) for fresh-ish reads`, `Precomputed/materialised views`, `Better indexes or queries`]},
  real:[
    {co:'Facebook / Meta', tier:'confirmed', text:'Runs one of the largest memcached deployments, serving billions of requests per second; the NSDI 2013 paper describes regional pools, leases and invalidation via the database commit log.', src:'Nishtala et al., “Scaling Memcache at Facebook”, NSDI 2013'},
    {co:'Netflix', tier:'confirmed', text:'Built EVCache, a memcached-based distributed cache replicated across availability zones, used for many latency-sensitive services; it is open source.', src:'Netflix Tech Blog — EVCache; github.com/Netflix/EVCache'},
    {co:'E-commerce sale', tier:'educational', text:'200 hot products, 50,000 req/min: a cache-aside Redis layer with a 60–300 s TTL turns ~150,000 DB queries/min into a few hundred.', src:'Illustrative estimate'}
  ],
  mistakes:[`Caching without an invalidation plan`, `In-process caches with long TTLs on multi-server fleets (servers disagree for minutes)`, `Measuring request hit ratio but ignoring which misses are expensive`],
  interview:[`Name the layer you’re caching at and what key you use`, `State TTL and invalidation in the same sentence as “add a cache”`],
  tryit:{note:'Which layer would you cache each thing in?', mount:host => sortGame(host, [
    {t:'The site logo and JavaScript bundle', c:'edge', why:'Public, versioned, identical for everyone → browser + CDN with long TTLs.'},
    {t:'Feature-flag configuration read on every request', c:'local', why:'Tiny, ultra-hot, tolerates a few seconds of staleness → in-process cache.'},
    {t:'A product’s details shown to all users', c:'dist', why:'Shared across app servers and frequently read → Redis/Memcached.'},
    {t:'User session data', c:'dist', why:'Must be visible to whichever server handles the next request.'},
    {t:'The logged-in user’s wallet balance', c:'none', why:'Money must be exact — read from the database (or a carefully invalidated cache).'},
    {t:'Rendered public product page HTML', c:'edge', why:'Identical for everyone → CDN with short TTL + stale-while-revalidate.'}
  ], [{id:'edge', label:'Browser/CDN'}, {id:'local', label:'In-process'}, {id:'dist', label:'Distributed'}, {id:'none', label:'Don’t cache'}])},
  sources:[`Nishtala et al., NSDI 2013`, `RFC 9111 (HTTP caching)`, `Netflix EVCache`]
},
{
  id:'cache-strategies', title:'Caching strategies: aside, through, back, around', minutes:10, tags:['cache-aside','read-through','write-through','write-back','write-around'],
  summary:'Who loads the cache, and when are writes applied to it? Five patterns with very different consistency, latency and failure behaviour.',
  problem:`<p>An e-commerce app gets 50,000 requests/min for one hot product. Redis holds that product in RAM so most reads never touch the database. On a miss → read the DB → write back to the cache. On an update → invalidate. If Redis dies → a circuit breaker falls back to the DB. <strong>Is that the right design for this data?</strong> It depends on the read:write ratio and how much staleness you can tolerate — and choosing among the strategies below is how you decide.</p>`,
  intuition:`A restaurant’s ready-gravy station. <b>Cache-aside:</b> the cook checks the station first and makes a batch from scratch only if it’s empty. <b>Read-through:</b> a helper refills the station automatically. <b>Write-through:</b> every new recipe change updates both the station and the master recipe book immediately. <b>Write-back:</b> changes go to the station now, the recipe book later (fast, but a fire loses them). <b>Write-around:</b> changes go only to the book; the station picks them up when next refilled.`,
  how:{
    steps:[`<b>Cache-aside (lazy loading):</b> app reads cache → on miss reads DB → populates cache. On write: update DB, then <b>delete</b> the cache key. Most common; the app owns the logic.`, `<b>Read-through:</b> the cache library/service loads from the DB itself on a miss. Same behaviour as cache-aside, cleaner code.`, `<b>Write-through:</b> writes go to the cache and synchronously to the DB. Cache is always warm and fresh; writes are slower; cache fills with data that may never be read.`, `<b>Write-back (write-behind):</b> writes go to the cache and are flushed to the DB asynchronously in batches. Fastest writes, absorbs bursts — but unflushed writes are lost if the cache dies.`, `<b>Write-around:</b> writes go straight to the DB; the cache is filled only on reads. Avoids polluting the cache with write-once data.`],
    diagram:{title:'Cache-aside read and write', w:740, h:240, alt:'The application reads from cache, falls back to the database on a miss, and deletes the cache key on update.',
      nodes:[{id:'a', type:'service', label:'App server', x:110, y:120}, {id:'c', type:'cache', label:'Redis', x:400, y:50}, {id:'db', type:'db', label:'Database', x:400, y:190}, {id:'cb', type:'ext', label:'Circuit breaker', x:640, y:120, w:140}],
      edges:[{from:'a', to:'c'}, {from:'a', to:'db'}, {from:'a', to:'cb', dashed:true}],
      steps:[
        {note:'<b>Read, hit:</b> the hot product comes straight from RAM (~1 ms).', flow:[['a', 'c', 'GET product:42'], ['c', 'a', 'hit']], hl:['c']},
        {note:'<b>Read, miss:</b> go to the database, then write the result back with a TTL.', flow:[['a', 'c', 'GET product:7'], ['c', 'a', 'miss'], ['a', 'db', 'SELECT'], ['db', 'a'], ['a', 'c', 'SET ttl=300']], hl:['db']},
        {note:'<b>Update:</b> write the database first, then <b>delete</b> (not update) the cache key so the next read reloads fresh data.', flow:[['a', 'db', 'UPDATE price'], ['db', 'a'], ['a', 'c', 'DEL product:42']], hl:['db', 'c']},
        {note:'<b>Redis dies:</b> the circuit breaker trips and reads fall back to the DB (with a rate limit so the DB isn’t flattened by the sudden load).', status:{c:'down'}, flow:[['a', 'cb', 'open'], ['a', 'db', 'SELECT (limited)']], hl:['cb']}
      ]},
    html:h.code('ts', `// Cache-aside with a TTL and a fallback when the cache is unavailable.
async function getProduct(id: string): Promise<Product> {
  const key = \`product:\${id}\`;
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    metrics.inc('cache.error');            // Redis down → fall through to the DB (behind a circuit breaker)
  }
  const row = await db.one('SELECT * FROM products WHERE id = $1', [id]);
  redis.set(key, JSON.stringify(row), 'EX', 300 + Math.floor(Math.random() * 60)).catch(() => {}); // TTL + jitter
  return row;
}

async function updatePrice(id: string, pricePaise: number) {
  await db.none('UPDATE products SET price_paise = $1 WHERE id = $2', [pricePaise, id]);
  await redis.del(\`product:\${id}\`);       // invalidate after the DB commit
}`, 'cache-aside.ts'),
    deep:`<p><b>Why delete instead of update on write?</b> Two concurrent writers updating the cache can apply in the opposite order to the DB, leaving the cache permanently wrong. Deleting converges: the next reader loads the committed value. It still has a race with slow readers — see the invalidation lesson.</p><p><b>Write-back durability:</b> production write-behind systems use a replicated cache or a durable log so a single node failure doesn’t lose writes, and they coalesce many writes to the same key (counters, view counts) into one DB write — that’s their big win. <b>Write-through</b> pairs well with read-heavy data that is read soon after being written (user profiles). Choose by read:write ratio, staleness tolerance and what happens if the cache vanishes.</p>`
  },
  tradeoffs:{use:[`<b>Cache-aside:</b> general read-heavy data (the default)`, `<b>Write-through:</b> data read right after it’s written; you want the cache always warm`, `<b>Write-back:</b> write-heavy counters/metrics where losing a few seconds is acceptable`, `<b>Write-around:</b> large write-once data (logs, uploads) rarely re-read`], avoid:[`Write-back for money or orders`, `Write-through for write-heavy data nobody reads`, `Any strategy without TTLs as a safety net`], alt:[`Read replicas`, `CDC-driven cache updates (Module 7)`, `Materialised views`]},
  real:[
    {co:'Facebook / Meta', tier:'confirmed', text:'Uses look-aside (cache-aside) memcache: web servers read memcache, fall back to MySQL on a miss, and invalidate keys after writes.', src:'Nishtala et al., “Scaling Memcache at Facebook”, NSDI 2013'},
    {co:'AWS', tier:'confirmed', text:'Documents lazy loading (cache-aside) and write-through as the two core ElastiCache strategies, recommending TTLs in both cases.', src:'Amazon ElastiCache — caching strategies documentation'},
    {co:'Linux page cache', tier:'confirmed', text:'File writes are buffered in memory and written back to disk later (write-back), which is why <code>fsync</code> exists for data that must be durable now.', src:'Linux kernel documentation'}
  ],
  mistakes:[`Updating the cache instead of deleting it on writes`, `No TTL (stale data lives forever after a missed invalidation)`, `Write-back without durability for critical data`, `Treating cache failure as fatal instead of degrading to the DB`],
  interview:[`Name the strategy, then justify with read:write ratio and staleness tolerance`, `Explain what happens when the cache node dies`],
  tryit:{note:'The cache simulator’s “Strategies” tab compares all five on the same workload — including what a cache crash loses.', pg:'cache-sim'},
  sources:[`Nishtala et al., NSDI 2013`, `Amazon ElastiCache documentation — caching strategies`]
},
{
  id:'cache-eviction', title:'Eviction policies: LRU, LFU, FIFO and TTL', minutes:8, tags:['LRU','LFU','FIFO','TTL','TinyLFU'],
  summary:'When the cache is full, something has to go. Which item you evict decides your hit ratio.',
  problem:`<p>Your 10 GB Redis holds 1% of the catalogue. A nightly analytics job scans every product once — and by morning the cache is full of products nobody wants, the hit ratio has collapsed, and the database is overloaded at 9 AM. The eviction policy let one scan wipe out the genuinely popular items.</p>`,
  intuition:`A small bookshelf by your bed. <b>LRU</b>: when it’s full, remove the book you haven’t touched for the longest time. <b>LFU</b>: remove the book you’ve opened the fewest times. <b>FIFO</b>: remove the book that’s been there longest regardless of use. <b>TTL</b>: every book gets an expiry sticker — library books go back on their due date.`,
  how:{
    steps:[`<b>LRU</b> (least recently used): great for recency-heavy workloads; cheap with a hash map + doubly linked list (O(1)). Weak against one-off scans.`, `<b>LFU</b> (least frequently used): keeps long-term favourites; needs frequency counters and ageing, or yesterday’s hits stay forever.`, `<b>FIFO</b>: simplest; ignores usage entirely.`, `<b>Random</b>: surprisingly decent and needs no metadata.`, `<b>TTL</b>: not a capacity policy but a freshness bound — combine it with one of the above.`, `Modern caches use hybrids: Redis approximates LRU/LFU by sampling; Caffeine uses W-TinyLFU (a small LRU window + frequency-based admission).`],
    stepper:{title:'LRU with capacity 3: A B C A D', items:[
      {title:'GET A', tag:'miss', text:'Cache: [A]. A is most recent.'},
      {title:'GET B', tag:'miss', text:'Cache: [A B].'},
      {title:'GET C', tag:'miss', text:'Cache: [A B C] — full.'},
      {title:'GET A', tag:'hit', text:'A moves to most-recent: [B C A].'},
      {title:'GET D', tag:'miss → evict B', text:'Full: evict the least recently used, B. Cache: [C A D]. LFU would also evict B or C (both used once); FIFO would evict A — the one you just used!'}
    ]},
    html:h.code('ts', `// O(1) LRU: Map keeps insertion order, so re-inserting a key moves it to the end.
class LRU<K, V> {
  private m = new Map<K, V>();
  constructor(private capacity: number) {}
  get(k: K): V | undefined {
    if (!this.m.has(k)) return undefined;
    const v = this.m.get(k)!; this.m.delete(k); this.m.set(k, v); // mark most-recent
    return v;
  }
  set(k: K, v: V) {
    if (this.m.has(k)) this.m.delete(k);
    else if (this.m.size >= this.capacity) this.m.delete(this.m.keys().next().value!); // evict LRU
    this.m.set(k, v);
  }
}`, 'lru.ts'),
    deep:`<p><b>Redis</b> exposes <code>maxmemory-policy</code> (<code>allkeys-lru</code>, <code>allkeys-lfu</code>, <code>volatile-ttl</code>, <code>noeviction</code>…). Its LRU and LFU are <i>approximated</i> by sampling a few keys and evicting the best candidate among them, avoiding a global linked list; LFU uses a logarithmic counter with decay.</p><p><b>Scan resistance:</b> segmented LRU (probation + protected segments), 2Q, ARC, and TinyLFU’s admission filter (a new item enters only if it is estimated to be more frequent than the victim — estimated with a Count-Min sketch, Module 8) keep one-off scans from flushing the hot set.</p><p><b>Memory overhead</b> matters at scale: per-entry metadata (pointers, counters) can rival small values; slab allocators (Memcached) trade fragmentation for speed.</p>`
  },
  tradeoffs:{use:[`<b>LRU:</b> general purpose, recency-driven (sessions, recent products)`, `<b>LFU / TinyLFU:</b> stable popularity (top products, reference data), scan-heavy environments`, `<b>TTL:</b> always, as a freshness backstop`], avoid:[`Plain LRU where batch scans share the cache`, `LFU without ageing`, `noeviction on a cache that can fill up (writes start failing)`], alt:[`Separate caches/pools for batch vs online traffic`, `Admission policies (don’t cache one-hit wonders)`]},
  real:[
    {co:'Redis', tier:'confirmed', text:'Implements approximated LRU and LFU via random sampling, selectable through <code>maxmemory-policy</code>.', src:'Redis documentation — key eviction'},
    {co:'Caffeine (Java)', tier:'confirmed', text:'Uses the W-TinyLFU policy for near-optimal hit rates with scan resistance; widely used in JVM services.', src:'Einziger, Friedman & Manes, “TinyLFU” (ACM TOS 2017); Caffeine documentation'},
    {co:'Memcached', tier:'confirmed', text:'Uses a slab allocator with per-slab-class LRU (later a segmented LRU with hot/warm/cold queues).', src:'Memcached documentation and release notes'}
  ],
  mistakes:[`Letting batch jobs share the online cache`, `No maxmemory limit (the OS kills Redis instead)`, `Assuming a bigger cache always fixes a low hit ratio (check the access pattern first)`],
  interview:[`Explain O(1) LRU (hash map + doubly linked list)`, `Mention LFU/TinyLFU for scan resistance`],
  tryit:{note:'Type any access sequence. Compare LRU, LFU and FIFO step by step.', mount:host => evictTrace(host)},
  sources:[`Redis docs — key eviction`, `Einziger et al., “TinyLFU”, ACM TOS 2017`, `Megiddo & Modha, “ARC”, FAST 2003`]
},
{
  id:'cache-invalidation', title:'Cache invalidation (the hard part)', minutes:9, tags:['invalidation','consistency','race condition','leases','CDC'],
  summary:'TTL, explicit delete, write-through, versioned keys, CDC-driven invalidation — and the race condition that leaves caches stale for hours.',
  problem:`<p>A product’s price changes from ₹499 to ₹449. The code updates the database and deletes the cache key. Yet the app keeps showing ₹499 for the next 3 hours. Nothing failed; two requests simply interleaved in an unlucky order. “There are only two hard things in computer science: cache invalidation and naming things.”</p>`,
  intuition:`A shop’s price board copied from the head office ledger. If the ledger changes, someone must wipe the board — but a slow assistant who copied the old price five minutes ago might walk back and write it up again after you wiped it.`,
  how:{
    steps:[`<b>TTL only:</b> simplest; staleness bounded by the TTL.`, `<b>Delete on write</b> (cache-aside): update DB, then delete the key.`, `<b>Write-through:</b> update cache and DB together.`, `<b>Versioned keys:</b> include a version or content hash in the key (<code>product:42:v7</code>); old versions simply stop being read.`, `<b>Event-driven:</b> consume the DB’s change stream (CDC) and delete/refresh keys — decoupled from application code paths.`, `Guard against races: <b>leases</b>, version checks on SET, or a delayed second delete; always keep a TTL as a backstop.`],
    diagram:{title:'The stale-set race', w:760, h:260, alt:'Reader A loads an old value, writer B updates and deletes, then A writes the old value back into the cache.',
      nodes:[{id:'a', type:'service', label:'Reader A', x:90, y:65}, {id:'b', type:'service', label:'Writer B', x:90, y:200}, {id:'c', type:'cache', label:'Cache', x:430, y:65}, {id:'db', type:'db', label:'Database', x:430, y:200}],
      edges:[{from:'a', to:'c'}, {from:'a', to:'db'}, {from:'b', to:'db'}, {from:'b', to:'c'}],
      steps:[
        {note:'A misses the cache and reads the DB: <b>₹499</b>. Then A pauses (GC, slow network).', flow:[['a', 'c', 'GET'], ['c', 'a', 'miss'], ['a', 'db', 'SELECT'], ['db', 'a', '₹499']], hl:['a']},
        {note:'B updates the DB to <b>₹449</b> and deletes the cache key — correctly, by the book.', flow:[['b', 'db', 'UPDATE ₹449'], ['b', 'c', 'DEL']], hl:['b']},
        {note:'A resumes and SETs what it read: <b>₹499</b>. The cache is now stale until the TTL expires.', flow:[['a', 'c', 'SET ₹499']], status:{c:'hot'}, hl:['c']},
        {note:'<b>Fixes:</b> leases (the SET is rejected if the key was deleted after A’s lease was issued), version-checked SETs, or a delayed second delete — plus a modest TTL.', status:{c:'ok'}, hl:['c']}
      ]},
    deep:`<p>Facebook’s memcache paper describes <b>leases</b>: on a miss, memcache hands the client a 64-bit token; a later delete invalidates the token, so the slow reader’s SET is rejected. Leases also throttle the thundering herd (only one lease per key every few seconds). Their invalidation daemons (<i>mcsqueal</i>) tail the MySQL commit log and broadcast deletes — event-driven invalidation that survives application bugs.</p><p><b>Multi-region:</b> invalidations must reach every region’s cache; a replica region may still be behind the primary database, so deleting too early lets a reader repopulate from a stale replica. Solutions include “remote markers” (Facebook) or routing reads of recently-written keys to the primary.</p>`
  },
  tradeoffs:{use:[`<b>TTL-only:</b> data where minutes of staleness are fine`, `<b>Delete-on-write + TTL:</b> the default for app-owned data`, `<b>CDC-driven:</b> many writers or services touching the same tables`, `<b>Versioned keys:</b> immutable or snapshot-style data`], avoid:[`Updating cache values on write from many writers`, `No TTL “because we invalidate correctly”`], alt:[`Don’t cache it: read from a replica or the primary`, `Short TTL + stale-while-revalidate`]},
  real:[
    {co:'Facebook / Meta', tier:'confirmed', text:'Introduced leases to prevent stale sets and thundering herds, and invalidates memcache by tailing the MySQL commit log.', src:'Nishtala et al., “Scaling Memcache at Facebook”, NSDI 2013'},
    {co:'Phil Karlton (attributed)', tier:'confirmed', text:'The famous quip “There are only two hard things in Computer Science: cache invalidation and naming things” is widely attributed to him.', src:'Commonly cited attribution (e.g. Martin Fowler’s bliki, “TwoHardThings”)'}
  ],
  mistakes:[`Believing “update DB then delete cache” is race-free`, `Invalidating before the DB transaction commits`, `Forgetting caches in other regions`],
  interview:[`When you add a cache, say how it’s invalidated and the staleness bound`, `Mention the stale-set race and leases/versioning for senior roles`],
  tryit:{note:'Replay the race with three strategies.', mount:(host, api) => raceDemo(host, api)},
  sources:[`Nishtala et al., NSDI 2013`, `Martin Fowler, “TwoHardThings”`]
},
{
  id:'cache-failure-modes', title:'Cache failure modes: stampede, avalanche, penetration, hot keys', minutes:10, tags:['thundering herd','stampede','avalanche','penetration','hot key'],
  summary:'Caches fail in specific, predictable ways. Each has a name — and a standard fix.',
  problem:`<p>At 8:00 PM the cached homepage of a cricket app expires. In the 200 ms it takes to rebuild, 2,000 users hit the database for the same query. The database stalls, the rebuild takes longer, more users pile up — and the site goes down because one popular key expired.</p>`,
  intuition:`A ration shop board saying “Rice: available”. If the board is wiped (expired), every customer queues at the storeroom door at once (stampede). If every board in town is wiped at the same minute (avalanche), all storerooms are mobbed. If people keep asking for items that don’t exist, the clerk walks to the storeroom every time (penetration). If one board is in front of the busiest gate, that one clerk is overwhelmed (hot key).`,
  how:{
    steps:[`<b>Stampede / thundering herd:</b> a hot key expires; many requests miss simultaneously and all rebuild it. Fix: single-flight locks, serve stale while one request refreshes, probabilistic early refresh, leases.`, `<b>Avalanche:</b> many keys expire at the same moment (same TTL set at the same time), or the cache cluster restarts empty. Fix: TTL jitter, pre-warming, gradual traffic ramp, a replicated cache.`, `<b>Penetration:</b> requests for keys that don’t exist always miss and hit the DB — often malicious. Fix: cache “not found” briefly, a Bloom filter of valid IDs, input validation, rate limits.`, `<b>Hot keys:</b> one key gets so much traffic that its single cache shard saturates. Fix: local in-process caching for that key, key replication (<code>key#1..N</code>), request coalescing.`],
    diagram:{title:'A stampede on one hot key', w:740, h:250, alt:'Many app servers miss on the same expired key and all query the database at once.',
      nodes:[{id:'u', type:'client', label:'2,000 users/s', x:80, y:125, w:130}, {id:'a', type:'service', label:'App fleet', x:280, y:125}, {id:'c', type:'cache', label:'Cache', sub:'home:feed', x:500, y:50}, {id:'db', type:'db', label:'Database', x:500, y:200}],
      edges:[{from:'u', to:'a'}, {from:'a', to:'c'}, {from:'a', to:'db'}],
      steps:[
        {note:'The key is cached: all 2,000 req/s are served from memory.', flow:[['a', 'c', 'GET'], ['c', 'a', 'hit'], ['a', 'c', 'GET'], ['c', 'a', 'hit']], parallel:true, hl:['c']},
        {note:'The TTL expires. Every request in the next 200 ms misses…', status:{c:'down'}, flow:[['a', 'c', 'GET'], ['c', 'a', 'miss']]},
        {note:'…and ~400 identical expensive queries hit the database at once.', status:{db:'hot'}, flow:[['a', 'db', 'Q'], ['a', 'db', 'Q'], ['a', 'db', 'Q'], ['a', 'db', 'Q']], parallel:true, hl:['db']},
        {note:'<b>With single-flight:</b> one request takes a lock and rebuilds; the others wait briefly or get the slightly stale value.', status:{c:'ok', db:'ok'}, flow:[['a', 'db', 'one rebuild'], ['db', 'a'], ['a', 'c', 'SET']], hl:['c']}
      ]},
    deep:`<p><b>Probabilistic early expiration</b> (“XFetch”, Vattani et al., VLDB 2015): each reader recomputes early with probability rising as expiry approaches, weighted by how long recomputation takes — so exactly one reader usually refreshes before expiry, with no locks.</p><p><b>Locks in a distributed cache:</b> <code>SET key:lock 1 NX PX 5000</code>; the holder rebuilds; others poll or serve stale. Always set a lock expiry so a crashed rebuilder doesn’t block forever.</p><p><b>Hot-key detection:</b> sample keys at the proxy or client, or use Redis’s <code>--hotkeys</code> option with LFU; then replicate the key or cache locally. In Redis Cluster a hot key lives on one shard regardless of cluster size — sharding doesn’t fix hot keys.</p>`
  },
  tradeoffs:{use:[`TTL jitter on every key`, `Single-flight or stale-while-revalidate for expensive hot keys`, `Bloom filters for ID-addressed lookups exposed publicly`], avoid:[`Locks without expiry`, `Caching “not found” for too long (new items appear missing)`], alt:[`Never expire hot keys; refresh them in the background`, `Pre-warm caches before traffic shifts`]},
  real:[
    {co:'Facebook / Meta', tier:'confirmed', text:'Memcache leases limit how often a key can be rebuilt, mitigating thundering herds on popular keys.', src:'Nishtala et al., NSDI 2013'},
    {co:'Research', tier:'confirmed', text:'XFetch provides an optimal probabilistic algorithm for preventing cache stampedes without coordination.', src:'Vattani, Chierichetti & Lowenstein, “Optimal Probabilistic Cache Stampede Prevention”, VLDB 2015'},
    {co:'Twitter / X', tier:'inference', text:'Celebrity accounts create classic hot keys; large social platforms are known to treat such keys specially (replication, local caching).', src:'General public discussion of hot-key handling; specifics vary'}
  ],
  mistakes:[`Same TTL for everything warmed at deploy time`, `Retrying DB queries during a stampede (multiplies load)`, `Scaling the cache cluster to fix a single hot key`],
  interview:[`Name all four failure modes and one fix each`, `For celebrity/hot items, discuss local caching and key replication`],
  tryit:{note:'Run each failure mode with and without protection. Watch the database load chart.', mount:(host, api) => failureSim(host, api)},
  sources:[`Vattani et al., VLDB 2015`, `Nishtala et al., NSDI 2013`, `Redis documentation`]
},
{
  id:'redis-vs-memcached', title:'Redis vs Memcached', minutes:7, tags:['Redis','Memcached','data structures','persistence'],
  summary:'Memcached: a simple, multi-threaded key-value cache. Redis: an in-memory data-structure server with persistence, replication and clustering.',
  problem:`<p>You need a cache for product pages — and also a leaderboard, rate-limit counters, a session store and a lightweight queue. Do you run Memcached, Redis, or both?</p>`,
  intuition:`Memcached is a big, fast, multi-armed sticky-note board: write a note under a name, read it back, notes fall off when space runs out. Redis is a smart whiteboard that also keeps sorted lists, counters, sets and maps, can photograph itself (persistence) and keep a copy in another room (replication).`,
  how:{
    html:h.table(['', 'Memcached', 'Redis'], [['Data model', 'Strings/blobs (key → bytes)', 'Strings, hashes, lists, sets, sorted sets, streams, bitmaps, HyperLogLog, geo'], ['Threading', 'Multi-threaded', 'Single-threaded command execution (I/O threads optional) — simple atomicity'], ['Persistence', 'None (pure cache)', 'RDB snapshots and/or AOF log'], ['Replication / HA', 'Client-side (consistent hashing); no built-in replication', 'Replicas, Sentinel failover, Redis Cluster (16,384 hash slots)'], ['Atomic ops', 'incr/decr, CAS', 'Rich: INCR, Lua scripts, MULTI/EXEC transactions'], ['Eviction', 'LRU per slab class (segmented)', 'Configurable LRU/LFU/TTL policies (approximated)'], ['Typical use', 'Large, simple object caches', 'Caching + counters, leaderboards, sessions, rate limits, pub/sub, queues']]),
    steps:[`Choose <b>Memcached</b> for a simple, huge, multi-threaded blob cache where losing it all is fine.`, `Choose <b>Redis</b> when you need data structures, atomic operations, persistence or built-in replication.`, `Both are in-memory: size the working set to fit RAM, and plan for failure (a cold cache after restart).`],
    stepper:{title:'Redis data structures in one minute', items:[
      {title:'String', tag:'GET/SET/INCR', text:'Cached JSON, counters, rate-limit buckets.'},
      {title:'Hash', tag:'HSET/HGET', text:'An object’s fields: <code>user:42 → {name, city}</code>.'},
      {title:'Sorted set', tag:'ZADD/ZRANGE', text:'Leaderboards and “top N” by score; time-ordered feeds.'},
      {title:'Set', tag:'SADD/SISMEMBER', text:'Unique visitors, tags, “who liked this”.'},
      {title:'Stream', tag:'XADD/XREADGROUP', text:'An append-only log with consumer groups — a lightweight queue.'},
      {title:'HyperLogLog', tag:'PFADD/PFCOUNT', text:'Approximate unique counts in ~12 KB per key (Module 8).'}
    ]},
    deep:`<p><b>Redis Cluster</b> splits the keyspace into 16,384 hash slots spread over primaries, each with replicas; clients route by slot and follow MOVED redirects. Multi-key operations must stay within one slot (use hash tags <code>{user42}</code>). Replication is asynchronous, so a failover can lose recently acknowledged writes — fine for caches, risky if you treat Redis as the system of record.</p><p><b>Persistence trade-offs:</b> RDB snapshots fork the process (copy-on-write memory spikes); AOF with <code>everysec</code> fsync risks about a second of writes. <b>Licensing note:</b> Redis changed its licence in 2024, and the Linux Foundation’s Valkey fork continued under the BSD licence — relevant when choosing managed offerings.</p>`
  },
  tradeoffs:{use:[`<b>Memcached:</b> simple large caches, multi-core boxes, no persistence needed`, `<b>Redis:</b> structures, atomic counters, sessions, leaderboards, rate limiting`], avoid:[`Redis as the only copy of critical data without durable persistence and backups`, `Huge values or O(N) commands (KEYS *) on a busy Redis — they block the single command thread`], alt:[`Managed caches (ElastiCache, Memorystore)`, `Valkey, KeyDB, Dragonfly (Redis-compatible)`, `In-process caches for ultra-hot small data`]},
  real:[
    {co:'Facebook / Meta', tier:'confirmed', text:'Built its caching tier on Memcached at enormous scale, modifying it for performance (NSDI 2013).', src:'Nishtala et al., NSDI 2013'},
    {co:'Twitter / X', tier:'confirmed', text:'Open-sourced Twemcache (a Memcached fork) and Twemproxy, a proxy that shards traffic across Memcached and Redis servers.', src:'github.com/twitter/twemcache, github.com/twitter/twemproxy'},
    {co:'Redis Cluster', tier:'confirmed', text:'Partitions keys across 16,384 hash slots with primary/replica failover.', src:'Redis Cluster specification'}
  ],
  mistakes:[`Running <code>KEYS *</code> in production`, `Treating async-replicated Redis as a durable database`, `Cross-slot multi-key commands in Redis Cluster`],
  interview:[`Pick Redis vs Memcached by needed data structures and persistence`, `Mention Redis’ single-threaded command model and its implications`],
  tryit:{quiz:[
    {q:'You need a real-time leaderboard of the top 100 players by score. Best fit?', options:['Memcached strings', 'Redis sorted set', 'A Bloom filter', 'Redis list'], answer:1, why:'ZADD/ZREVRANGE gives O(log N) updates and ordered range reads.'},
    {q:'Why can a single slow command (e.g. KEYS * on 50M keys) hurt every Redis client?', options:['Redis is multi-threaded', 'Commands execute on one thread, so others wait behind it', 'It deletes keys', 'It forces persistence'], answer:1, why:'Redis executes commands sequentially; long O(N) commands block everyone.'},
    {q:'A Redis primary fails over to a replica. What might be lost?', options:['Nothing ever', 'Writes acknowledged but not yet replicated (async replication)', 'All keys', 'Only TTLs'], answer:1, why:'Replication is asynchronous by default.'}
  ]},
  sources:[`Redis documentation and Cluster spec`, `Memcached documentation`, `Nishtala et al., NSDI 2013`]
}
];

SDA.register({
  kind:'module', id:'caching', order:4, level:'intermediate', icon:'⚡', title:'Caching',
  summary:'Caching layers, strategies (aside, through, back, around), eviction policies, invalidation and its races, failure modes (stampede, avalanche, penetration, hot keys) and Redis vs Memcached.',
  outcomes:['Place caches at the right layer with a clear key, TTL and invalidation plan', 'Choose among cache-aside, read/write-through, write-back and write-around', 'Implement LRU and compare eviction policies', 'Recognise and fix stampedes, avalanches, penetration and hot keys', 'Choose Redis or Memcached with reasons'],
  lessons,
  quiz:[
    {q:'Going from 90% to 99% cache hit ratio reduces database load by about…', options:['9%', '2×', '10×', 'Nothing'], answer:2, why:'Misses fall from 10% to 1% of traffic: 10× fewer DB queries.'},
    {q:'In cache-aside, what should a write do to the cache?', options:['Update the cached value', 'Delete the key after the DB commit', 'Nothing', 'Flush the whole cache'], answer:1, why:'Deleting converges on the committed value; updating can race between writers.'},
    {q:'Which strategy risks losing acknowledged writes if the cache node dies?', options:['Cache-aside', 'Write-through', 'Write-back', 'Write-around'], answer:2, why:'Write-back acknowledges before the DB has the data.'},
    {q:'A nightly batch scan wipes out your hot set. Which policy resists this best?', options:['Plain LRU', 'FIFO', 'TinyLFU / LFU-based admission', 'Random'], answer:2, why:'Frequency-based admission won’t let one-time keys displace frequently used ones.'},
    {q:'Thousands of keys all expire at the same second after a deploy warmed them. This is…', options:['Penetration', 'Avalanche', 'Hot key', 'Write skew'], answer:1, why:'Mass simultaneous expiry; fix with TTL jitter and gradual warm-up.'},
    {q:'Attackers request random non-existent product IDs. Which fix works even with random IDs?', options:['Caching “not found” per ID', 'A Bloom filter of valid IDs', 'Longer TTLs', 'More cache memory'], answer:1, why:'Random IDs never repeat, so negative caching doesn’t help; a Bloom filter rejects them up front.'},
    {q:'One celebrity profile key saturates a single Redis shard. Adding shards…', options:['fixes it', 'doesn’t help — the key still lives on one shard', 'makes it worse', 'deletes the key'], answer:1, why:'Use local caching or replicate the key across N keys.'},
    {q:'What is a memcache “lease” used for?', options:['Billing', 'Rejecting stale SETs and limiting rebuild herds', 'Encrypting values', 'Choosing a shard'], answer:1, why:'A delete invalidates the reader’s lease token, so its later SET is rejected.'},
    {q:'Which needs Redis rather than Memcached?', options:['Simple HTML fragment caching', 'Atomic sorted leaderboard', 'Caching blobs', 'Multi-threaded string cache'], answer:1, why:'Sorted sets are a Redis data structure.'},
    {q:'Effective latency with 95% hits at 1 ms and misses costing 1 + 20 ms?', options:['~1 ms', '~2 ms', '~10 ms', '~21 ms'], answer:1, why:'0.95 × 1 + 0.05 × 21 = 2.0 ms.'},
    {type:'scenario', q:'Design caching for a product-detail API serving 50,000 req/min, with price changes a few times a day and a flash sale coming.', answer:'<ul><li><b>Cache-aside</b> in Redis keyed by <code>product:{id}</code>, value = rendered JSON; TTL 300 s ± jitter.</li><li><b>Invalidate</b> on price/stock change via delete after commit — ideally driven by CDC so every writer path is covered; leases or version-checked SETs for the race.</li><li><b>Hot keys</b> during the sale: a 1–5 s in-process cache for the top products; request coalescing on misses.</li><li><b>Stock</b> is not served from this cache for checkout decisions — the checkout path reads the authoritative inventory.</li><li><b>Failure:</b> circuit breaker on Redis errors, fall back to DB with a concurrency limit; replicated Redis across zones; pre-warm before the sale.</li><li><b>Edge:</b> public product pages also on the CDN with short TTL + stale-while-revalidate.</li></ul>'},
    {type:'scenario', q:'Your cache cluster restarts and the database immediately falls over. Why, and how do you prevent it next time?', answer:'<p>A cold cache sends ~100% of reads to a database sized for ~5% (an avalanche). Prevent it with: replicated cache nodes so one restart isn’t total loss; rolling restarts; <b>pre-warming</b> the hot set from a snapshot or by replaying recent keys; <b>admission control</b> on DB reads (concurrency limits, queueing, shedding low-priority traffic); single-flight on rebuilds; and ramping traffic back gradually.</p>'}
  ],
  cheatsheet:[
    {h:'🧅 Layers', items:['Browser → CDN → in-process → distributed → DB buffer pool', 'Every cache: key, TTL, invalidation plan', 'Hit 90%→99% = 10× less DB load']},
    {h:'✍️ Strategies', items:['Cache-aside: read miss → DB → SET; write → DB then DEL', 'Read-through: cache loads itself', 'Write-through: cache + DB synchronously', 'Write-back: cache now, DB later (risk)', 'Write-around: DB only; cache on read']},
    {h:'🗑️ Eviction', items:['LRU: recency; O(1) map + list', 'LFU: frequency (needs ageing)', 'FIFO / random: simple', 'TTL: freshness bound', 'TinyLFU/2Q/ARC: scan resistant']},
    {h:'♻️ Invalidation', items:['Delete, don’t update, on write', 'Stale-set race → leases / version SET / delayed 2nd delete', 'CDC-driven invalidation', 'Versioned keys', 'Always keep a TTL']},
    {h:'💥 Failure modes', items:['Stampede → single-flight, SWR, XFetch, leases', 'Avalanche → TTL jitter, warm-up, replicas', 'Penetration → null cache, Bloom filter', 'Hot key → local cache, key replication']},
    {h:'🧰 Redis vs Memcached', items:['Memcached: simple, multi-threaded blobs', 'Redis: structures, Lua, persistence, cluster', 'Redis Cluster: 16,384 slots, async replication', 'Avoid KEYS * / big O(N) commands']}
  ],
  glossary:[
    {term:'Cache-aside', aka:['lazy loading', 'look-aside'], def:'The application checks the cache, loads from the database on a miss, and populates the cache itself.'},
    {term:'Read-through', def:'A cache that loads missing entries from the backing store itself.'},
    {term:'Write-through', def:'Writes update the cache and the database synchronously.'},
    {term:'Write-back', aka:['write-behind'], def:'Writes go to the cache and are flushed to the database asynchronously later.'},
    {term:'Write-around', def:'Writes go directly to the database, bypassing the cache.'},
    {term:'LRU', aka:['least recently used'], def:'Evict the item not accessed for the longest time.'},
    {term:'LFU', aka:['least frequently used'], def:'Evict the item accessed the fewest times.'},
    {term:'FIFO', def:'First In, First Out: evict the oldest inserted item.'},
    {term:'TinyLFU', aka:['W-TinyLFU'], def:'A frequency-based admission policy using a compact sketch; used by Caffeine.'},
    {term:'Eviction', aka:['eviction policy'], def:'Removing entries from a full cache according to a policy.'},
    {term:'Cache stampede', aka:['thundering herd', 'stampede', 'dogpile'], def:'Many simultaneous misses on the same key all trying to rebuild it at once.'},
    {term:'Cache avalanche', aka:['avalanche'], def:'Many keys expiring (or a cache being emptied) at once, flooding the database.'},
    {term:'Cache penetration', aka:['penetration'], def:'Requests for keys that don’t exist, always missing and hitting the database.'},
    {term:'Hot key', aka:['hot keys'], def:'A single key receiving disproportionate traffic, saturating its shard.'},
    {term:'Single-flight', aka:['request coalescing lock'], def:'Ensuring only one caller rebuilds a missing value while others wait or reuse its result.'},
    {term:'Stale-while-revalidate', def:'Serving a slightly stale value while refreshing it in the background.'},
    {term:'Negative caching', def:'Caching “not found” results to avoid repeated lookups.'},
    {term:'Lease (cache)', aka:['leases'], def:'A token issued on a cache miss that a later invalidation revokes, preventing stale writes.'},
    {term:'Buffer pool', def:'A database’s in-memory cache of disk pages.'},
    {term:'Redis', def:'An in-memory data-structure server with persistence, replication and clustering.'},
    {term:'Memcached', def:'A simple, multi-threaded, in-memory key-value cache.'},
    {term:'Redis Cluster', def:'Redis’s sharded mode with 16,384 hash slots spread across primaries and replicas.'},
    {term:'TTL jitter', aka:['jitter'], def:'Adding randomness to expiry times (or retries) so events don’t synchronise.'}
  ],
  sources:['Nishtala et al., “Scaling Memcache at Facebook”, NSDI 2013', 'Vattani et al., VLDB 2015 (XFetch)', 'Einziger et al., “TinyLFU”, ACM TOS 2017', 'Redis and Memcached documentation', 'Amazon ElastiCache caching strategies']
});
} catch(e){ console.error('[SDA] Module "caching" failed to load', e); window.SDA && SDA.errors.push({id:'caching', error:e}); }
})();
