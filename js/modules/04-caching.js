
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
  const d = new api.Diagram(holder, {title:'Two requests race on a subscription price', w:760, h:260, alt:'A reader and editor overlap while the news subscription price changes from ₹499 to ₹449.', nodes:[{id:'r', type:'service', label:'Reader A', x:90, y:65, w:140}, {id:'w', type:'service', label:'Editor B', x:90, y:200, w:140}, {id:'c', type:'cache', label:'Price copy', sub:'empty', x:430, y:65}, {id:'db', type:'db', label:'News database', sub:'price: ₹499', x:430, y:200}], edges:[{from:'r', to:'c'}, {from:'r', to:'db'}, {from:'w', to:'db'}, {from:'w', to:'c'}], caption:'A reads ₹499, B changes it to ₹449, and A later tries to save its old value.'});
  const wait = ms => new Promise(r => setTimeout(r, SDA.reduced ? 50 : ms));
  async function run(){
    if (busy) return; busy = true; let cache = null, db = 499, cacheVer = 0;
    d.setSub('c', 'empty'); d.setSub('db', 'price: ₹499'); d.setStatus('c', 'ok');
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
    d.setSub('c', cache == null ? 'empty' : `price: ₹${cache}`);
    const stale = cache != null && cache !== db; d.setStatus('c', stale ? 'hot' : 'ok');
    res.className = 'verdict ' + (stale ? 'bad' : 'ok');
    res.textContent = stale ? `✗ The copy says ₹${cache}, but the database says ₹${db}. Readers may see the old price until the TTL expires.` : `✓ The copy is ${cache == null ? 'empty' : '₹' + cache}. The next read can get ₹${db} from the database.`;
    d.setCaption(stale ? '<b>Stale forever (until TTL).</b> Deleting before the slow reader finished didn’t help.' : 'Consistent again.');
    busy = false;
  }
  host.append(el('div', {class:'ctl-grid'}, ui.select({label:'Invalidation strategy', value:'naive', options:[['naive', 'Update DB, then delete cache (naive)'], ['double', 'Delayed double delete'], ['version', 'Versioned / lease-guarded SET']], onChange:v => mode = v}).el), holder, el('div', {class:'controls', style:{margin:'8px 0'}}, ui.button('▶ Run the race', run, 'sm primary')), res);
}
function failureSim(host, api){
  const P = {scn:'stampede', fix:'none'};
  const FIX = {stampede:[['none', 'No protection'], ['lock', 'One request rebuilds while others wait'], ['swr', 'Serve an old copy while one request refreshes'], ['early', 'Refresh a little before expiry']], avalanche:[['none', 'Same TTL for every key'], ['jitter', 'Vary TTLs a little']], penetration:[['none', 'No protection'], ['null', 'Save “not found” for 60 s'], ['bloom', 'Quick valid-ID check (Module 8 preview)']]};
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
      story.textContent = 'The news home feed gets 2,000 reads each second. Its copy expires, and rebuilding it takes 200 milliseconds.';
    } else if (P.scn === 'avalanche'){
      const K = 10000, exp = new Float64Array(K).fill(-1);
      for (let k = 0; k < K; k++) exp[k] = P.fix === 'jitter' ? 4 + Math.random() * 4 : 6;
      for (let t = 0; t < T; t += 1 / RATE){ n++; const k = Math.floor(Math.random() * K); if (t < exp[k]){ lat += 1; continue; } db(t); lat += 10; exp[k] = t + (P.fix === 'jitter' ? 4 + Math.random() * 4 : 6); }
      story.textContent = 'The news app saved 10,000 article copies at once. Watch what happens when their time limits end together.';
    } else {
      const valid = 100000; const nullC = new Map();
      for (let t = 0; t < T; t += 1 / RATE){
        n++; const bogus = Math.random() < .3; const id = bogus ? valid + Math.floor(Math.random() * 1e9) : Math.floor(Math.random() * valid);
        if (!bogus){ lat += 1; continue; }
        if (P.fix === 'bloom'){ if (Math.random() < .01){ db(t); lat += 10; } else lat += 1; continue; }
        if (P.fix === 'null' && nullC.has(id) && nullC.get(id) > t){ lat += 1; continue; }
        db(t); lat += 10; if (P.fix === 'null') nullC.set(id, t + 60);
      }
      story.textContent = 'Many requests ask for article IDs that do not exist. They make up 30% of 2,000 requests each second.';
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
  summary:'A cache keeps a copy of data so repeated requests can avoid slower work. Copies may live in the browser, near readers, inside an app server, or in a shared store.',
  problem:`<h3>A small example</h3><p>A news app publishes a popular election update. Thousands of readers open the same public article.</p><ul><li>1 article in the database</li><li>Many repeated article reads</li><li>Several places that could keep a copy</li></ul><p>Where should the app check before asking the database again?</p>`,
  intuition:`Think of a library article. You might have a copy on your desk, your neighborhood branch may have one, or you may ask the main archive. Closer copies save a trip.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one article request through possible copies.</p>',
    steps:[
      {icon:'📱', title:'Check the browser', text:'A reader’s device may already hold the article file. If it is fresh, no network trip is needed.'},
      {icon:'🌍', title:'Check a nearby edge', text:'A CDN copy can serve many readers near the same city. You saw this in Module 3.'},
      {icon:'⚙️', title:'Check the app server', text:'One app server may keep a small local copy for very frequent reads.'},
      {icon:'🧰', title:'Check a shared store', text:'Several app servers can ask the same shared cache for the article.'},
      {icon:'🗄️', title:'Read the database', text:'If the closer copies miss, the app reads the original article from the database.'}
    ],
    diagram:{title:'An article read through several layers', w:800, h:250, alt:'The reader checks the browser and CDN before the app checks local and shared copies, then the database.',
      nodes:[{id:'b', type:'client', label:'Browser copy', x:75, y:125, w:120}, {id:'cdn', type:'cdn', label:'CDN copy', x:230, y:125, w:110}, {id:'app', type:'service', label:'App + local copy', x:400, y:125, w:150}, {id:'r', type:'cache', label:'Shared cache', x:580, y:60, w:100}, {id:'db', type:'db', label:'Articles DB', sub:'original', x:720, y:160, w:120}],
      edges:[{from:'b', to:'cdn'}, {from:'cdn', to:'app'}, {from:'app', to:'r'}, {from:'app', to:'db'}],
      steps:[
        {note:'A fresh browser copy answers without another network request.', hl:['b']},
        {note:'A nearby CDN can answer many readers with one public copy.', flow:[['b', 'cdn', 'article?'], ['cdn', 'b', 'copy']], hl:['cdn']},
        {note:'If needed, the request reaches the app server and its local copy.', flow:[['b', 'cdn', 'article?'], ['cdn', 'app']], hl:['app']},
        {note:'The app checks a copy shared by its servers.', flow:[['app', 'r', 'article?'], ['r', 'app', 'copy']], hl:['r']},
        {note:'If every copy misses, the database supplies the article.', flow:[['app', 'r', 'article?'], ['r', 'app', 'missing'], ['app', 'db', 'read'], ['db', 'app'], ['app', 'r', 'save copy']], hl:['db']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Library copy', 'News app layer'], [['On your desk', 'Browser copy.'], ['At a neighborhood branch', 'CDN copy.'], ['At the main office', 'Shared app cache.'], ['In the archive', 'Database original.']])}</div><div class="callout tip"><b>Important point</b><p>A copy helps only when readers ask for the same data and its age is acceptable.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Question', 'Answer for the article'], [['Who can share it?', 'The public can use a CDN copy.'], ['How long can it stay?', 'Set a time limit for old article text.'], ['What if it changes?', 'Replace or remove old copies.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say a cache hit takes 1 ms and a database read takes 50 ms. At a 90% hit ratio, the average is 0.9 × 1 + 0.1 × 50 = 5.9 ms. At 99% it is 0.99 × 1 + 0.01 × 50 = 1.49 ms. Raising the hit ratio matters more than making the cache faster.</p><h4>When it goes wrong</h4><p>Say each app server keeps its own copy for 60 seconds. After an editor fixes a typo, server 1 may show the new text while server 2 still shows the old text. A reader who refreshes can see new, then old, then new again. A shared cache or a shorter time limit reduces this.</p><h4>How it works inside</h4><p>Even a database read may not touch the disk. The database keeps recently used pages, small blocks of data often 8 KB each, in memory. This area is called the buffer pool. You will learn more about databases in Module 5.</p>`
  },
  tradeoffs:{use:[`The public news article is a good candidate because many readers ask for the same text.`, `A nearby copy helps when readers are far from the original server.`], avoid:[`Do not share a reader’s private account page as one public copy.`, `Do not keep an old breaking-news correction for hours without a plan.`], alt:[`If the article changes on every request, read the original until there is a clear copy policy.`]},
  real:[
    {co:'Meta', tier:'confirmed', text:'Meta described using shared memory stores to reduce repeated reads across many app servers.', src:'Nishtala and others, Scaling Memcache at Facebook (2013)'}
  ],
  mistakes:[`Keeping a public article copy without deciding when it becomes old.`, `Assuming two app servers always have the same local copy.`],
  interview:[`Trace one article request through browser, CDN, app, shared store, and database.`, `Say who can share the copy and how old it may be.`],
  tryit:[{quiz:[
    {q:'Which layer can serve the article without a network request?', options:['A payment service', 'The browser copy', 'The original database', 'A distant app server'], answer:1, why:'The browser already holds the article.'},
    {q:'Why can a public article use a CDN copy?', options:['CDNs change the article', 'The database is deleted', 'Many readers need the same text', 'Every reader has private text'], answer:2, why:'A shared public copy can answer repeated requests.'}
  ]}, {note:'Sort news app content by where a useful copy can live.', mount:host => sortGame(host, [
    {t:'A public article image', c:'edge', why:'Many readers can share a nearby copy.'},
    {t:'Tiny site settings read on every app request', c:'local', why:'Each app server can keep a short local copy.'},
    {t:'A popular article summary read by several app servers', c:'dist', why:'A shared cache lets all app servers use one copy.'},
    {t:'A reader’s private account balance', c:'none', why:'Use the original record for this sensitive value.'}
  ], [{id:'edge', label:'Browser/CDN'}, {id:'local', label:'In-process'}, {id:'dist', label:'Shared cache'}, {id:'none', label:'Don’t cache'}])}],
  sources:[`Nishtala and others, Scaling Memcache at Facebook (2013)`, `RFC 9111`]
},
{
  id:'cache-strategies', title:'Caching strategies: aside, through, back, around', minutes:10, tags:['cache-aside','read-through','write-through','write-back','write-around'],
  summary:'A caching strategy decides who fills a missing copy and when writes reach the database. The choice changes read speed, write speed, and what can be lost.',
  problem:`<h3>A small example</h3><p>Readers open one popular news article while editors sometimes correct it.</p><ul><li>Many reads of the same text</li><li>A few important article edits</li><li>View counts that can update later</li></ul><p>Which work should reach the database immediately, and when should the cache change?</p>`,
  intuition:`A newsroom keeps a public notice board and a master record. A missing notice can be copied from the master. An editor’s correction must reach the master. A view tally can wait a little longer.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Compare five ways the article copy and master record can interact.</p>',
    steps:[
      {icon:'📖', title:'Cache-aside', text:'The app checks the copy, reads the database on a miss, and saves a copy. An edit updates the database, then removes the old copy.'},
      {icon:'🧰', title:'Read-through', text:'The cache service itself fetches missing article text from the database.'},
      {icon:'✍️', title:'Write-through', text:'An article edit waits for both the database and cache write before it finishes.'},
      {icon:'⏳', title:'Write-back', text:'A view count is saved in memory first and sent to the database later. A failure can lose unsaved counts.'},
      {icon:'➡️', title:'Write-around', text:'An editor’s draft goes straight to the database. A copy is made only if someone reads it.'}
    ],
    diagram:{title:'Read and correct a news article', w:740, h:240, alt:'The news app reads a copy, uses the database on a miss, and removes an old copy after an editor changes the article.',
      nodes:[{id:'a', type:'service', label:'News app', x:110, y:120}, {id:'c', type:'cache', label:'Article copy', x:400, y:50}, {id:'db', type:'db', label:'Articles DB', x:400, y:190}, {id:'cb', type:'ext', label:'Fallback path', x:640, y:120, w:140}],
      edges:[{from:'a', to:'c'}, {from:'a', to:'db'}, {from:'a', to:'cb', dashed:true}],
      steps:[
        {note:'A reader gets the article from a ready copy.', flow:[['a', 'c', 'article?'], ['c', 'a', 'copy']], hl:['c']},
        {note:'On a miss, the app reads the database and saves a copy.', flow:[['a', 'c', 'article?'], ['c', 'a', 'missing'], ['a', 'db', 'read'], ['db', 'a'], ['a', 'c', 'save']], hl:['db']},
        {note:'An editor corrects the database article, then removes its old copy.', flow:[['a', 'db', 'correct'], ['db', 'a'], ['a', 'c', 'remove']], hl:['db', 'c']},
        {note:'If the copy store stops, the app can read the database while protecting its capacity.', status:{c:'down'}, flow:[['a', 'cb', 'fallback'], ['a', 'db', 'read']], hl:['cb']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Newsroom action', 'Cache action'], [['Read the notice board first', 'Cache-aside read.'], ['Ask a helper to refill the board', 'Read-through.'], ['Update board and master before announcing', 'Write-through.'], ['Update board now, master later', 'Write-back.']])}</div><div class="callout tip"><b>Important point</b><p>Choose a write path by what the news app can afford to delay or lose.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['News data', 'Useful choice'], [['Popular article text', 'Cache-aside keeps repeated reads quick.'], ['Important correction', 'Commit to the database before removing the old copy.'], ['View count', 'Write-back may be acceptable if some recent counts can be lost.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say one article gets 500 view-count increments each second. With write-back, the cache adds them up and sends one database write every 5 seconds. That is 500 × 5 = 2,500 increments in 1 write. The cost is the risk window. A crash just before the flush loses up to 2,500 views.</p><p>For write-through, say the cache write takes 2 ms and the database write takes 20 ms. Done one after the other, an edit waits 22 ms. Done together, it waits about 20 ms.</p><h4>When it goes wrong</h4><p>Order matters in cache-aside. If the app removes the copy first and then updates the database, a reader can slip in between. It reloads the old text and saves it again. So update the database first, then remove the copy. If the removal fails, the old copy stays until its time limit, so retry the removal.</p>`
  },
  tradeoffs:{use:[`For the popular article, cache-aside avoids repeated database reads.`, `For view counts, write-back can combine many updates when small losses are acceptable.`], avoid:[`Do not leave a corrected article only in a cache that could stop before saving it.`, `Do not fill the cache with drafts nobody reads.`], alt:[`Use write-through if readers usually open a newly edited article immediately.`]},
  real:[
    {co:'AWS', tier:'confirmed', text:'AWS documents lazy loading and write-through as two common ways to fill a cache.', src:'Amazon ElastiCache caching strategies documentation'}
  ],
  mistakes:[`Using write-back for the only record of a corrected article.`, `Leaving an old article copy in place after an edit.`],
  interview:[`Explain cache-aside with one article read and one correction.`, `Say why view counts can use a different write path from article text.`],
  tryit:[{quiz:[
    {q:'What does cache-aside do after the article copy is missing?', options:['Delete the article', 'Ignore the reader', 'Change the URL', 'Read the database and save a copy'], answer:3, why:'The app fills the missing copy from the original.'},
    {q:'What can write-back lose if memory fails before the database update?', options:['Recent unsaved view counts', 'The reader’s phone', 'Every old article', 'The site name'], answer:0, why:'Write-back can acknowledge a memory update before the database has it.'}
  ]}, {note:'Compare the five strategies on the same news article reads and view-count writes.', pg:'cache-sim'}],
  sources:[`Amazon ElastiCache caching strategies documentation`]
},
{
  id:'cache-eviction', title:'Eviction policies: LRU, LFU, FIFO and TTL', minutes:8, tags:['LRU','LFU','FIFO','TTL','TinyLFU'],
  summary:'Eviction removes an item when a cache is full. LRU removes the least recent item, LFU the least used, and FIFO the oldest arrival. TTL expires items by time.',
  problem:`<h3>A small example</h3><p>The news app can hold three article summaries in a fast local copy.</p><ul><li>It holds articles A, B, and C.</li><li>A reader opens A again.</li><li>A new article D arrives.</li></ul><p>Which summary should leave to make room for D?</p>`,
  intuition:`A shelf has room for three magazines. You can remove the one untouched longest, the one read least often, or the one placed there first. An expiry date is a separate rule.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Compare what each rule remembers about articles A, B, and C.</p>',
    steps:[
      {icon:'🕒', title:'LRU remembers recent use', text:'A was just opened, so least recently used removes B when D arrives.'},
      {icon:'📊', title:'LFU counts use', text:'Least frequently used removes an article with the fewest reads. It needs a rule for ties.'},
      {icon:'📥', title:'FIFO remembers arrival', text:'First in, first out removes A because it entered first, even though someone just read it.'},
      {icon:'🏷️', title:'TTL checks age', text:'A time to live expires an article copy after a set period. It helps freshness, even when there is room.'}
    ],
    stepper:{title:'LRU with capacity 3: A B C A D', items:[
      {title:'Read A', tag:'missing', text:'Save A. The copy holds [A].'},
      {title:'Read B', tag:'missing', text:'Save B. The copy holds [A B].'},
      {title:'Read C', tag:'missing', text:'Save C. The copy holds [A B C] and is full.'},
      {title:'Read A again', tag:'found', text:'A becomes the most recently used. The order is [B C A].'},
      {title:'Read D', tag:'make room', text:'LRU removes B, the least recent article. The copy becomes [C A D].'}
    ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Magazine shelf rule', 'Article rule'], [['Remove the one untouched longest', 'LRU.'], ['Remove the one opened least often', 'LFU.'], ['Remove the one placed first', 'FIFO.'], ['Return it on its due date', 'TTL.']])}</div><div class="callout tip"><b>Important point</b><p>Eviction makes room. TTL limits how long a copy can stay old. The news app may need both.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Reading pattern', 'Useful rule'], [['Readers return to recent articles', 'LRU.'], ['A few stories stay popular for days', 'LFU.'], ['Copies only need a simple arrival order', 'FIFO.']])}</div>`,
    deep:`<h4>How it works inside</h4><p>A fast LRU uses two parts. A hash map finds an article in one step. A linked list keeps articles in order of use. A read moves the article to the front. When the cache is full, the article at the back leaves. Both steps take constant time.</p><p>Real stores often skip exact tracking. Redis, for example, picks a small random sample of keys, 5 by default, and removes the least recently used one in that sample.</p><h4>When it goes wrong</h4><p>Say a cache holds 100 summaries and a nightly job reads 1,000 one-off stories. LRU treats each new read as recent. After the first 100 job reads, every popular summary is gone. LFU keeps them, because their read counts are high. To stop old counts from ruling forever, LFU lowers every count over time, for example by halving it each hour.</p><h4>The numbers</h4><p>With a 60-second time limit and 500 reads each second, one article is fetched once and then served 500 × 60 = 30,000 times. That is one miss for about 30,000 hits.</p>`
  },
  tradeoffs:{use:[`For the news app’s recent stories, LRU keeps articles readers just opened.`, `LFU can help when a few stories stay popular through many news cycles.`], avoid:[`Do not use FIFO if recently read article A should stay.`, `Do not use LFU without letting old popularity fade.`], alt:[`Keep short-lived breaking-news copies in a separate small pool from archive scans.`]},
  real:[
    {co:'Redis', tier:'confirmed', text:'Redis documents memory policies that approximate LRU and LFU when choosing keys to remove.', src:'Redis key eviction documentation'}
  ],
  mistakes:[`Assuming TTL chooses the best item when the copy is full.`, `Keeping an old popular article forever because its LFU count never fades.`],
  interview:[`Trace A B C A D under LRU with room for three.`, `Explain how FIFO can remove a recently used article.`],
  tryit:[{quiz:[
    {q:'With room for A B C, then another read of A, what does LRU remove when D arrives?', options:['All three', 'B', 'A', 'D'], answer:1, why:'B was used least recently.'},
    {q:'What does TTL decide?', options:['Which server is fastest', 'How many readers are online', 'When a copy expires by age', 'Which article has the most reads'], answer:2, why:'TTL limits the lifetime of a copy.'}
  ]}, {note:'Enter article letters in the eviction trace and compare LRU, LFU, and FIFO.', mount:host => evictTrace(host)}],
  sources:[`Redis key eviction documentation`]
},
{
  id:'cache-invalidation', title:'Cache invalidation (the hard part)', minutes:9, tags:['invalidation','consistency','race condition','leases','CDC'],
  summary:'Invalidation removes an old cache copy after the original changes. A slow reader can still write the old value back later, so the order of events matters.',
  problem:`<h3>A small example</h3><p>The news app lowers its monthly subscription price from ₹499 to ₹449.</p><ul><li>The database now says ₹449.</li><li>The cache key was removed after the change.</li><li>Some readers still see ₹499.</li></ul><p>How can an old price return after the cache was cleared?</p>`,
  intuition:`A clerk copies an old price from a master book and walks away. Another clerk updates the book and wipes the notice board. The first clerk returns late and writes the old price on the clean board.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow two news app requests that overlap.</p>',
    steps:[
      {icon:'📖', title:'A reads the old price', text:'A misses the cache and reads ₹499 from the database. Then A pauses before saving a copy.'},
      {icon:'✍️', title:'B changes the price', text:'B saves ₹449 in the database and removes the old cache key.'},
      {icon:'⏰', title:'A resumes too late', text:'A writes its earlier ₹499 value into the empty cache. New readers now see the wrong price.'},
      {icon:'🔢', title:'Reject old versions', text:'A version check can refuse A’s older value after B’s newer change.'},
      {icon:'🏷️', title:'Keep an expiry limit', text:'A TTL eventually removes a stale copy if an update step was missed.'}
    ],
    diagram:{title:'An old subscription price returns', w:760, h:260, alt:'Reader A pauses with ₹499. Writer B saves ₹449 and removes the copy. A later writes ₹499 back.',
      nodes:[{id:'a', type:'service', label:'Reader A', x:90, y:65}, {id:'b', type:'service', label:'Editor B', x:90, y:200}, {id:'c', type:'cache', label:'Price copy', x:430, y:65}, {id:'db', type:'db', label:'News database', x:430, y:200}],
      edges:[{from:'a', to:'c'}, {from:'a', to:'db'}, {from:'b', to:'db'}, {from:'b', to:'c'}],
      steps:[
        {note:'A reads ₹499 and pauses before saving a copy.', flow:[['a', 'c', 'check'], ['c', 'a', 'missing'], ['a', 'db', 'read'], ['db', 'a', '₹499']], hl:['a']},
        {note:'B saves ₹449 and removes the old copy.', flow:[['b', 'db', 'save ₹449'], ['b', 'c', 'remove']], hl:['b']},
        {note:'A resumes and writes ₹499 into the empty cache.', flow:[['a', 'c', 'save ₹499']], status:{c:'hot'}, hl:['c']},
        {note:'A version check can reject the older value. A TTL also limits a missed correction.', status:{c:'ok'}, hl:['c']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Notice board', 'Price cache'], [['Master book changes', 'Database saves ₹449.'], ['Board is wiped', 'Old cache key is removed.'], ['Slow clerk posts an old note', 'A writes ₹499 too late.']])}</div><div class="callout tip"><b>Important point</b><p>Removing the copy after a write helps, but a reader already holding old data can race back.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Protection', 'Effect'], [['Version check', 'Reject an older price after a newer edit.'], ['Delayed second removal', 'Clear a late old copy again.'], ['TTL', 'Limit how long a wrong copy remains.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say reader A starts its database read at 0 ms and saves its copy at 40 ms. The editor commits ₹449 and removes the key at 15 ms. Any reader whose read started before 15 ms and whose save lands after it can put ₹499 back. A longer gap between read and save makes this likelier. If the time limit is 5 minutes, the wrong price can stay for up to 300 seconds. With a 30-second limit, it stays at most 30 seconds.</p><h4>How it works inside</h4><p>A version check needs somewhere to keep the newest version. So instead of deleting the key, the editor writes a short-lived marker that says version 8. When A tries to save version 7, the cache sees 7 is lower than 8 and refuses it.</p><h4>When it goes wrong</h4><p>A lease works another way. A reader that finds the key missing gets a token. If an editor removes the key, the token stops working. A slow reader cannot save its copy without a valid token. A delayed second removal is simpler, but a reader that pauses longer than the delay can still write after it.</p>`
  },
  tradeoffs:{use:[`For the news subscription price, remove the old copy after saving the new database value.`, `Use a version check if overlapping reads and edits can leave an old price visible.`], avoid:[`Do not assume delete-after-write has no race.`, `Do not leave a price copy without an expiry limit.`], alt:[`If price accuracy must be immediate, read the database until the cache update path is proven safe.`]},
  real:[
    {co:'Meta', tier:'confirmed', text:'Meta described lease tokens that stop a slow reader from saving an old value after a later delete.', src:'Nishtala and others, Scaling Memcache at Facebook (2013)'}
  ],
  mistakes:[`Assuming the ₹499 reader finishes before the ₹449 edit.`, `Clearing the copy before the database price is committed.`],
  interview:[`Trace A and B in order to show how ₹499 returns.`, `Explain how a version check blocks A’s late save.`],
  tryit:[{quiz:[
    {q:'Why can ₹499 return after the cache key was removed?', options:['The new price was never saved', 'The browser changes the price', 'The TTL grows by itself', 'A slow reader saves an old value later'], answer:3, why:'A read can pause between loading old data and writing a copy.'},
    {q:'What can reject an older value after a newer edit?', options:['A version check', 'A longer old TTL', 'More readers', 'A different article title'], answer:0, why:'The older version is not allowed to replace newer data.'}
  ]}, {note:'Replay the two-request price race with deletion, delayed removal, and version checking.', mount:(host, api) => raceDemo(host, api)}],
  sources:[`Nishtala and others, Scaling Memcache at Facebook (2013)`]
},
{
  id:'cache-failure-modes', title:'Cache failure modes: stampede, avalanche, penetration, hot keys', minutes:10, tags:['thundering herd','stampede','avalanche','penetration','hot key'],
  summary:'A cache can overload the database when popular copies expire or many copies vanish together. Missing IDs and one extremely popular key cause different pressure.',
  problem:`<h3>A small example</h3><p>At 8 PM, the news app’s popular home feed copy expires.</p><ul><li>2,000 feed requests arrive each second.</li><li>Rebuilding the feed takes 200 milliseconds.</li><li>Every missing request could ask the database.</li></ul><p>What happens if all those readers rebuild the same feed at once?</p>`,
  intuition:`If a notice board is wiped, everyone asks the clerk for the same answer. If all boards are wiped, the whole office gets crowded. Questions about items that do not exist also waste the clerk’s time.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>One feed expiry shows the first failure mode.</p>',
    steps:[
      {icon:'🏃', title:'Stampede', text:'The feed copy expires. Many readers miss together and repeat the same database work.'},
      {icon:'🌨️', title:'Avalanche', text:'Many different article copies expire at once. The database receives many kinds of reads together.'},
      {icon:'🔎', title:'Penetration', text:'Requests for article IDs that do not exist keep missing and reaching the database.'},
      {icon:'🔥', title:'Hot key', text:'One feed key is read so often that the shared cache itself may struggle.'},
      {icon:'🛠️', title:'Match each fix', text:'Let one request rebuild a feed, spread expiry times, reject bad IDs early, and keep a short local copy of a hot feed.'}
    ],
    diagram:{title:'Many readers miss one feed at once', w:740, h:250, alt:'A popular news feed copy expires, and many app requests reach the database together. One rebuild reduces that burst.',
      nodes:[{id:'u', type:'client', label:'2,000 readers/s', x:80, y:125, w:130}, {id:'a', type:'service', label:'News app', x:280, y:125}, {id:'c', type:'cache', label:'Feed copy', sub:'home feed', x:500, y:50}, {id:'db', type:'db', label:'Articles DB', x:500, y:200}],
      edges:[{from:'u', to:'a'}, {from:'a', to:'c'}, {from:'a', to:'db'}],
      steps:[
        {note:'The ready feed copy answers repeated reads.', flow:[['a', 'c', 'read'], ['c', 'a', 'copy'], ['a', 'c', 'read'], ['c', 'a', 'copy']], parallel:true, hl:['c']},
        {note:'The feed copy expires. New requests miss.', status:{c:'down'}, flow:[['a', 'c', 'read'], ['c', 'a', 'missing']]},
        {note:'About 2,000 × 0.2 = 400 requests may ask the database while one rebuild takes 200 milliseconds.', status:{db:'hot'}, flow:[['a', 'db', 'read'], ['a', 'db', 'read'], ['a', 'db', 'read'], ['a', 'db', 'read']], parallel:true, hl:['db']},
        {note:'Let one request rebuild the copy while others wait or use a slightly old answer.', status:{c:'ok', db:'ok'}, flow:[['a', 'db', 'one rebuild'], ['db', 'a'], ['a', 'c', 'save']], hl:['c']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Notice board trouble', 'Cache trouble'], [['Everyone asks after one board is wiped', 'Stampede.'], ['All boards are wiped together', 'Avalanche.'], ['People ask for missing notices', 'Penetration.'], ['One board has too many readers', 'Hot key.']])}</div><div class="callout tip"><b>Important point</b><p>These failures look similar in the database chart but need different fixes.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Problem', 'First response'], [['One expired feed', 'Only one request rebuilds it.'], ['Many copies expire together', 'Vary their TTLs.'], ['Missing article IDs', 'Check input and save short “not found” answers.'], ['One overused feed key', 'Keep a very short copy near each app server.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Rebuilding the feed takes 200 ms and 2,000 requests arrive each second. So 2,000 × 0.2 = 400 requests arrive before the first rebuild finishes. Without protection, all 400 hit the database. With single-flight, 1 request rebuilds and the other 399 wait about 200 ms.</p><p>Now say 10,000 article copies were saved at the same moment, all with a 600-second limit. With a random ±10% jitter, expiry times spread over 120 seconds, from 540 to 660. That is about 83 expiries each second instead of 10,000 at once.</p><h4>When it goes wrong</h4><p>Saving “not found” for 60 seconds helps when the same missing ID repeats. If every request uses a new random ID, each one is a first request and still reaches the database. A quick check for valid IDs is needed. You will learn one such check, the Bloom filter, in Module 8.</p><p>For a hot key, say 20 app servers each keep the feed for 1 second. The shared cache then sees at most 20 reads each second for that key, not 2,000.</p>`
  },
  tradeoffs:{use:[`For the news home feed, allow one rebuild after expiry instead of hundreds.`, `Vary expiry times when many article copies are filled together.`], avoid:[`Do not leave a rebuild lock without an expiry.`, `Do not save a missing-article answer so long that a newly published article stays invisible.`], alt:[`Keep the old feed briefly while one request refreshes it if a short delay is acceptable.`]},
  real:[
    {co:'Meta', tier:'confirmed', text:'Meta described leases that limit how many callers rebuild one popular missing value.', src:'Nishtala and others, Scaling Memcache at Facebook (2013)'}
  ],
  mistakes:[`Giving every article copy the same expiry time after a news app restart.`, `Letting every reader rebuild the same expired feed.`],
  interview:[`Name stampede, avalanche, penetration, and hot key using the news app.`, `Choose one first fix for each failure mode.`],
  tryit:[{quiz:[
    {q:'What is a stampede on the news home feed?', options:['The browser saves a logo', 'Many readers rebuild one expired feed together', 'One reader opens one article', 'One editor corrects a title'], answer:1, why:'The same missing value creates many database requests at once.'},
    {q:'What helps when many article copies expire at the same moment?', options:['More random missing IDs', 'A longer article title', 'Small differences in TTL', 'The same TTL for every copy'], answer:2, why:'Different expiry times spread the database work.'}
  ]}, {note:'Run the feed stampede, mass expiry, missing-ID, and hot-key cases. Compare database load after each protection.', mount:(host, api) => failureSim(host, api)}],
  sources:[`Nishtala and others, Scaling Memcache at Facebook (2013)`]
},
{
  id:'redis-vs-memcached', title:'Redis vs Memcached', minutes:7, tags:['Redis','Memcached','data structures','persistence'],
  summary:'Memcached is a simple store for values kept in memory. Redis also stores values, but offers counters, sets, and ranked lists. Choose by the work the app needs.',
  problem:`<h3>A small example</h3><p>The news app wants fast access to several kinds of data.</p><ul><li>Public article summaries</li><li>View counts</li><li>A list of trending articles ranked by views</li></ul><p>Would a simple value store be enough, or does the app need richer operations?</p>`,
  intuition:`Memcached is a board of named boxes. Put a value in a box and read it later. Redis has named boxes too, plus counters and ordered lists the news desk can update.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Compare what each store can do for the news app.</p>',
    steps:[
      {icon:'📦', title:'Store article summaries', text:'Both products can keep a summary under an article key for quick reads.'},
      {icon:'🧮', title:'Count article views', text:'Redis can increase a counter with one operation. Memcached also supports simple numeric increments.'},
      {icon:'🏆', title:'Rank trending stories', text:'Redis has a sorted set that keeps articles ordered by score. Memcached needs the app to build that ranking elsewhere.'},
      {icon:'💾', title:'Plan for lost memory', text:'Memcached keeps values in memory only. Redis has optional ways to save data, but the news database remains the article source.'}
    ],
    stepper:{title:'Redis data structures in one minute', items:[
      {title:'String', tag:'one value', text:'Keep one article summary or a numeric view count under a key.'},
      {title:'Hash', tag:'fields', text:'Keep a few fields for one story, such as title and section.'},
      {title:'Sorted set', tag:'ranked', text:'Keep article IDs ordered by a score for the trending list.'},
      {title:'Set', tag:'unique items', text:'Keep distinct tags attached to a story.'},
      {title:'Stream', tag:'ordered events', text:'Record a sequence of events. You will learn event processing in Module 7.'},
      {title:'Approximate count', tag:'estimate', text:'Estimate the number of unique readers when an exact list would use too much memory.'}
    ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['News desk need', 'Useful store'], [['Find a named box of text', 'Memcached or Redis.'], ['Keep a counter', 'Either can increment simple numbers.'], ['Keep a ranked list', 'Redis sorted set.']])}</div><div class="callout tip"><b>Important point</b><p>Choose the store for the operations you need, then plan what happens when its memory is empty.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['News app job', 'Choice'], [['Public article copies only', 'Memcached can be enough.'], ['Trending list and other data structures', 'Redis fits more directly.'], ['Original article text', 'Keep it in the database.']])}</div>`,
    deep:`<h4>How it works inside</h4><p>Redis runs commands one at a time on one main thread. A slow command, such as reading a huge list in full, makes every other request wait. Memcached uses several threads, so it can spread simple reads across processor cores.</p><p>A Redis sorted set keeps articles ordered by score. Adding a score costs time that grows with the logarithm of the list size. Reading the top 10 is just as cheap, so a trending list stays fast even with a million articles.</p><h4>When it goes wrong</h4><p>By default, Redis does not remove old keys when its memory limit is reached. It returns an error on new writes. You must choose an eviction rule. Memcached removes the least recently used items on its own.</p><h4>The numbers</h4><p>If Redis saves a log of changes and writes it to disk once each second, a crash loses up to about 1 second of view counts. If it saves a snapshot every 5 minutes instead, a crash can lose up to 300 seconds of them.</p>`
  },
  tradeoffs:{use:[`For public article copies, Memcached is a simple fit if the database can rebuild them.`, `For a ranked trending list, Redis gives the news app a suitable data structure.`], avoid:[`Do not keep the only copy of corrected article text in either memory store.`, `Do not ignore the database load after a store restart.`], alt:[`Start with the database and a small local copy if the news app does not yet need a shared store.`]},
  real:[
    {co:'Meta', tier:'confirmed', text:'Meta documented using Memcached for large amounts of repeated web data.', src:'Nishtala and others, Scaling Memcache at Facebook (2013)'},
    {co:'Redis', tier:'confirmed', text:'Redis documents sorted sets for keeping values ordered by score.', src:'Redis sorted sets documentation'}
  ],
  mistakes:[`Choosing Redis only because it has more features when simple article copies are enough.`, `Treating temporary memory as the only record of a corrected article.`],
  interview:[`Choose for article copies and explain why either store can work.`, `Explain why a ranked trending list points toward Redis.`],
  tryit:{quiz:[
    {q:'Which store offers a sorted set for a trending-articles list?', options:['Memcached', 'Neither store', 'The browser only', 'Redis'], answer:3, why:'A Redis sorted set orders article IDs by score.'},
    {q:'What must the news app plan after a Memcached restart?', options:['Rebuilding missing copies from the database', 'Deleting every original article', 'Changing the site name', 'Turning off reader requests forever'], answer:0, why:'Memcached keeps temporary values in memory.'}
  ]},
  sources:[`Redis sorted sets documentation`, `Memcached documentation`, `Nishtala and others, Scaling Memcache at Facebook (2013)`]
}
];

SDA.register({
  kind:'module', id:'caching', order:4, level:'intermediate', icon:'⚡', title:'Caching',
  summary:'Follow a news article through copies near readers and inside the app. Learn when to fill, remove, or rebuild copies, and how to choose a memory store.',
  outcomes:['Trace one article read through browser, CDN, app, shared cache, and database', 'Choose a read and write strategy for article text and view counts', 'Compare LRU, LFU, FIFO, and TTL on a small copy', 'Explain stale-price races and four cache failure modes', 'Choose Redis or Memcached for a stated news app need'],
  lessons,
  quiz:[
    {q:'Which layer can serve a fresh article without another network request?', options:['A shared cache', 'The browser copy', 'The database', 'A second app server'], answer:1, why:'The reader’s browser already has the article.'},
    {q:'What does cache-aside do after an article copy is missing?', options:['Delete the article', 'Ignore the reader', 'Read the database and save a copy', 'Change the site name'], answer:2, why:'The app fills a missing copy from the original record.'},
    {q:'Which news app value is a better write-back candidate?', options:['The only editor password', 'A view count that can tolerate small losses', 'The only corrected article text', 'A subscription payment'], answer:1, why:'Write-back may lose recent unsaved changes.'},
    {q:'With room for A B C, then another read of A, which item does LRU remove for D?', options:['A', 'C', 'D', 'B'], answer:3, why:'B was used least recently.'},
    {q:'What does TTL decide for an article copy?', options:['Which story is most popular', 'When the copy expires by age', 'Which app server is fastest', 'Who may edit'], answer:1, why:'TTL limits how long a copy stays available.'},
    {q:'How can ₹499 return after the database price became ₹449?', options:['The database forgot the edit', 'The browser changed the amount', 'A slow reader saved its old value later', 'The TTL became infinite'], answer:2, why:'A reader can pause after reading old data and write it after the new edit.'},
    {q:'At 2,000 requests each second, how many may arrive during a 200 millisecond feed rebuild?', options:['About 2,000,000', 'None', 'About 400', 'About 2'], answer:2, why:'2,000 × 0.2 seconds = 400 requests.'},
    {q:'What helps when many article copies expire at the same time?', options:['One identical TTL for every copy', 'A longer article title', 'More missing IDs', 'Small differences in TTL'], answer:3, why:'Different expiry times spread database work.'},
    {q:'Which store directly offers a sorted set for trending articles?', options:['Memcached', 'Redis', 'The browser only', 'Neither'], answer:1, why:'Redis keeps article IDs ordered by score in a sorted set.'},
    {q:'What should the news app plan after a Memcached restart?', options:['Delete original articles', 'Stop all readers', 'Rebuild missing copies from the database', 'Change every URL'], answer:2, why:'Memcached stores temporary values in memory.'},
    {type:'scenario', q:'An editor changes the subscription price to ₹449, but some readers see ₹499. Explain a possible race.', answer:'<ol><li>Reader A gets ₹499 from the database and pauses.</li><li>Editor B saves ₹449 and removes the old cache copy.</li><li>A resumes and saves ₹499 after that removal.</li><li>Use a version check to reject A’s older value and keep a TTL as a backstop.</li></ol>'},
    {type:'scenario', q:'The news home feed expires during a busy hour. How can the app avoid a database stampede?', answer:'<p>Let one request rebuild the feed while others wait or use a briefly old copy. Measure how many database reads happen during the rebuild. Vary expiry times if many article copies are filled together.</p>'}
  ],
  cheatsheet:[
    {h:'🧅 Where copies live', items:['A browser copy can avoid a network request.', 'A CDN copy serves public content near readers.', 'An app server can keep a short local copy.', 'A shared cache serves several app servers.', 'The database holds the original article.']},
    {h:'✍️ How copies change', items:['Cache-aside reads the database after a miss.', 'Read-through lets the cache fetch a missing value.', 'Write-through waits for both cache and database writes.', 'Write-back saves in memory first, then the database later.', 'Write-around writes to the database and waits for a read before copying.']},
    {h:'🗑️ What leaves a full cache', items:['LRU removes the least recently used item.', 'LFU removes a less frequently used item.', 'FIFO removes the oldest inserted item.', 'TTL removes an item after its time limit.']},
    {h:'♻️ Correct old data', items:['Save an important edit in the database before removing an old copy.', 'A slow reader can write an old value back after removal.', 'Version checks can reject an older value.', 'Keep a TTL to bound missed corrections.']},
    {h:'💥 Handle pressure', items:['Stampede means many callers rebuild one expired value.', 'Avalanche means many values expire together.', 'Penetration means missing IDs keep reaching the database.', 'A hot key overloads one popular copy.', 'Match the fix to the failure you measured.']},
    {h:'🧰 Choose a memory store', items:['Memcached stores simple temporary values.', 'Redis also offers counters, sets, and ranked lists.', 'Redis can optionally save data to disk.', 'Keep original articles in the database.']}
  ],
  glossary:[
    {term:'Cache', aka:['caches', 'caching'], def:'A saved copy of an answer, kept so the same request can be answered faster next time. Example: a news app keeps today’s front page in memory instead of rebuilding it for every reader.'},
    {term:'Cache hit', aka:['cache hits'], def:'A request that is answered from the cache. Example: the front page is already saved, so the reader gets it in 2 ms.'},
    {term:'Cache miss', aka:['cache misses'], def:'A request whose copy is not in the cache, so the app must ask the original source. Example: a rarely read article is not saved, so the app reads the database.'},
    {term:'Cache key', aka:['cache keys'], def:'The name used to find one saved value. Example: article:42 holds the saved copy of article number 42.'},
    {term:'Local cache', aka:['local copy', 'local copies', 'in-process cache'], def:'A cache kept inside one app server, so only that server can use it. Example: each server remembers the 100 most popular headlines.'},
    {term:'Shared cache', aka:['shared caches'], def:'A cache that many app servers can read and write. Example: 5 servers all ask one cache service for the same saved front page.'},
    {term:'Buffer pool', def:'Memory inside a database that keeps recently used data pages, so it can avoid slow disk reads. Example: the database serves a popular row from memory instead of from disk.'},
    {term:'Cache-aside', aka:['lazy loading', 'look-aside'], def:'The app checks the cache first. If the value is missing, the app reads the database and saves a copy. Example: on a miss for article 42, the app reads the database and stores the article.'},
    {term:'Read-through', aka:['read-through cache'], def:'The cache itself loads the missing value from the database, so the app only talks to the cache. Example: the app asks the cache for article 42, and the cache fetches it if needed.'},
    {term:'Write-through', def:'Every write updates the cache and the database before it is finished. Example: an article edit is saved in both places, so the cache never lags behind.'},
    {term:'Write-back', aka:['write-behind'], def:'A write goes to the cache first and reaches the database later. Example: view counts are kept in memory and saved every minute, so a crash could lose up to a minute of counts.'},
    {term:'Write-around', aka:['write around'], def:'A write goes straight to the database and skips the cache. The cache is filled later when someone reads. Example: a new article is saved to the database, and the cache gets it on the first read.'},
    {term:'Eviction', aka:['eviction policy', 'evict', 'evicted'], def:'Removing something from a full cache to make room. Example: the cache is full, so it drops the article that nobody has read for the longest time.'},
    {term:'LRU', aka:['least recently used'], def:'Least recently used: when the cache is full, remove the item that has gone the longest without being read. Example: the article last read yesterday goes before the one read a minute ago.'},
    {term:'LFU', aka:['least frequently used'], def:'Least frequently used: remove the item that has been read the fewest times. Example: an article read 3 times goes before one read 3,000 times.'},
    {term:'FIFO', def:'First in, first out: remove the item that entered the cache first. Example: the oldest saved article goes first, even if people still read it.'},
    {term:'Cache invalidation', aka:['invalidation'], def:'Removing or replacing a saved copy after the original changes. Example: after a price drops to ₹449, the cached ₹499 copy must be removed.'},
    {term:'Version check', aka:['version checks'], def:'Refusing to save an older value when a newer one is already stored. Example: price version 7 is rejected if version 8 is already saved.'},
    {term:'Cache stampede', aka:['thundering herd', 'stampede'], def:'Many requests rebuild the same missing popular value at the same moment. Example: a popular article expires, and 5,000 readers all hit the database for it.'},
    {term:'Cache avalanche', aka:['avalanche'], def:'Many cache entries expire at the same time and send a burst of work to the database. Example: 10,000 entries saved at midnight with a 1-hour limit all expire at 1 AM.'},
    {term:'Cache penetration', aka:['penetration'], def:'Requests for IDs that do not exist keep reaching the database, because there is nothing to cache. Example: someone asks for article IDs -1, -2, -3 and each one hits the database.'},
    {term:'Hot key', aka:['hot keys'], def:'One cached value that gets far more reads than the others. Example: the breaking-news article gets 100,000 reads a second while others get 5.'},
    {term:'Single-flight', def:'Letting one caller rebuild a missing value while the others wait and share the result. Example: 5,000 readers ask for the same missing article, but only one database read happens.'},
    {term:'TTL jitter', def:'Adding a small random amount to expiry times so many entries do not expire together. Example: instead of 1 hour for every entry, use anything from 55 to 65 minutes.'},
    {term:'Redis', def:'A very fast in-memory data store used for caches, counters, queues and ranked lists. Example: it keeps the front page and counts article views.'},
    {term:'Memcached', def:'A simple in-memory store for temporary values saved under keys. Example: it stores rendered page fragments.'},
    {term:'Sorted set', aka:['sorted sets'], def:'A Redis collection that keeps items ordered by a score. Example: a top-10 list of articles ordered by how many times each was read.'}
  ],
  sources:['Nishtala and others, Scaling Memcache at Facebook (2013)', 'Redis and Memcached documentation', 'Amazon ElastiCache caching strategies documentation']
});
} catch(e){ console.error('[SDA] Module "caching" failed to load', e); window.SDA && SDA.errors.push({id:'caching', error:e}); }
})();
