
/* =====================================================================
   PART 3 · MODULE 5 — DATABASES & STORAGE
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, esc, clamp, fmtNum, fmtBytes, fmtDur} = SDA.u; const ui = SDA.ui;
const {sortGame} = SDA.m1helpers;
const frag = html => document.createRange().createContextualFragment(html);

/* ---------- widgets ---------- */
function dbChooser(host){
  const P = {pat:'rel', tx:true, huge:false, pg:true}; const out = el('div', {style:{marginTop:'12px'}});
  const FAM = {
    rel:['Relational (PostgreSQL, MySQL)', 'Rows, joins, constraints and multi-row ACID transactions; flexible ad-hoc queries.'],
    kv:['Key-value (DynamoDB, Redis, etcd)', 'Lookup by key with predictable low latency at almost any scale; little query flexibility.'],
    doc:['Document (MongoDB, Firestore, Postgres JSONB)', 'Self-contained JSON entities read and written as a unit; flexible schema per document.'],
    wide:['Wide-column (Cassandra, ScyllaDB, Bigtable, HBase)', 'Huge write throughput, data partitioned by key and sorted within a partition; design tables per query.'],
    graph:['Graph (Neo4j, Amazon Neptune)', 'Multi-hop relationship traversal: friends-of-friends, fraud rings, recommendations.'],
    ts:['Time-series (TimescaleDB, InfluxDB, Prometheus)', 'Append-mostly timestamped points with retention, downsampling and range aggregations.'],
    search:['Search engine (Elasticsearch, OpenSearch)', 'Full-text relevance ranking, fuzzy matching, facets — usually a secondary index, not the source of truth.'],
    vec:['Vector (pgvector, Milvus, Weaviate, Pinecone)', 'Nearest-neighbour search over embeddings for semantic search and RAG (Module 8).']
  };
  function render(){
    const recs = [];
    const add = (k, why, score) => recs.push({k, why, score});
    add(P.pat, 'Matches your primary access pattern.', 3);
    if (P.tx && P.pat !== 'rel') add('rel', 'You need multi-entity transactions — a relational database gives them natively.', P.huge ? 1 : 2.5);
    if (P.huge && ['rel', 'doc'].includes(P.pat)) add('wide', 'Very high write volume with known query patterns suits a partitioned wide-column/KV store (or a sharded relational setup).', 1.5);
    if (P.pg && !['rel', 'vec', 'ts'].includes(P.pat)) add('rel', 'Your team already runs Postgres: extensions (JSONB, pgvector, TimescaleDB, full-text) may cover this without a new system.', 1.2);
    if (P.pg && ['vec', 'ts', 'doc'].includes(P.pat)) recs[0].why += ' Postgres extensions (pgvector / TimescaleDB / JSONB) are a strong first option for your team.';
    const seen = new Set(); const list = recs.sort((a, b) => b.score - a.score).filter(r => !seen.has(r.k) && seen.add(r.k));
    out.innerHTML = '';
    list.forEach((r, i) => out.append(el('div', {class:'card', style:{marginBottom:'8px'}}, el('b', null, `${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} ${FAM[r.k][0]}`), el('p', {class:'muted', style:{margin:'4px 0 0', fontSize:'14px'}}, FAM[r.k][1] + ' ' + r.why))));
    out.append(el('p', {class:'lab-hint'}, 'Rule of thumb many teams follow: start with a relational database unless a specific access pattern or scale requirement clearly rules it out — and add specialised stores (search, cache, analytics) as secondary copies fed from it.'));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.select({label:'Primary access pattern', value:'rel', options:[['rel', 'Entities with relationships, ad-hoc queries'], ['kv', 'Get/put by key at huge scale'], ['doc', 'Whole JSON objects per entity'], ['wide', 'Massive time-ordered writes per key'], ['graph', 'Multi-hop relationship traversal'], ['ts', 'Metrics/events over time'], ['search', 'Full-text search & relevance'], ['vec', 'Similarity search on embeddings']], onChange:v => { P.pat = v; render(); }}).el), el('div', {class:'stack', style:{marginTop:'10px'}}, ui.toggle({label:'Need multi-row / multi-entity ACID transactions', checked:true, onChange:v => { P.tx = v; render(); }}).el, ui.toggle({label:'Writes above ~50,000/s sustained', checked:false, onChange:v => { P.huge = v; render(); }}).el, ui.toggle({label:'Team already operates PostgreSQL', checked:true, onChange:v => { P.pg = v; render(); }}).el), out);
  render();
}
function indexChecker(host){
  const P = {idx:'city,category,price', city:true, cat:true, price:'range', order:'price', sel:'cover'};
  const SELECT = {city:.01, category:.02, price:{eq:.001, range:.1}};
  const out = el('div', {style:{marginTop:'12px'}});
  function analyze(){
    const cols = P.idx.split(','); const filt = {city:P.city ? 'eq' : null, category:P.cat ? 'eq' : null, price:P.price === 'none' ? null : P.price};
    const used = []; let stop = '';
    for (const c of cols){ const f = filt[c]; if (!f){ stop = `stops at <b>${c}</b> (no filter on it)`; break; } used.push([c, f]); if (f === 'range'){ stop = `stops after <b>${c}</b> — a range condition ends the usable prefix`; break; } }
    const N = 1e7; const sel = ([c, f]) => c === 'price' ? SELECT.price[f] : SELECT[c];
    const scanned = used.length ? N * used.reduce((p, u) => p * sel(u), 1) : N;
    const matching = N * Object.entries(filt).filter(([, f]) => f).reduce((p, [c, f]) => p * sel([c, f]), 1);
    let orderOk = P.order === 'none';
    if (!orderOk){ const p = cols.indexOf(P.order); orderOk = p >= 0 && cols.slice(0, p).every(c => filt[c] === 'eq') && (p === 0 || used.length >= p); }
    const need = P.sel === 'cover' ? ['city', 'category', 'price'] : ['*'];
    const covering = need[0] !== '*' && need.every(c => cols.includes(c));
    const lines = [];
    lines.push(used.length ? ['ok', `Index seek on (${used.map(([c, f]) => c + (f === 'range' ? ' range' : ' =')).join(', ')}) — ${stop || 'uses the whole index'}.`] : ['bad', `Can’t seek: the first index column (<b>${cols[0]}</b>) isn’t filtered (leftmost-prefix rule). Full table scan of ${fmtNum(N)} rows.`]);
    lines.push(['', `Rows examined ≈ <b>${fmtNum(scanned)}</b>; rows matching all filters ≈ ${fmtNum(matching)}.`]);
    lines.push(orderOk ? ['ok', P.order === 'none' ? 'No ORDER BY.' : `ORDER BY ${P.order} comes free from the index order — no sort step.`] : ['warn', `ORDER BY ${P.order} needs an extra sort (“filesort”) — the index can’t provide that order after this prefix.`]);
    lines.push(covering ? ['ok', 'Covering index: every selected column is in the index — no trips back to the table (“index-only scan”).'] : ['warn', P.sel === 'cover' ? 'Not covering: some selected columns aren’t in the index, so each match needs a table lookup.' : 'SELECT * → one table lookup per matching row (random I/O).']);
    out.innerHTML = '';
    out.append(h2(h.code('sql', `CREATE INDEX idx ON rooms (${cols.join(', ')});

SELECT ${P.sel === 'cover' ? 'city, category, price' : '*'} FROM rooms
WHERE ${[P.city ? "city = 'Pune'" : null, P.cat ? "category = 'family'" : null, P.price === 'eq' ? 'price = 1999' : P.price === 'range' ? 'price BETWEEN 1000 AND 3000' : null].filter(Boolean).join(' AND ') || 'TRUE'}${P.order !== 'none' ? `\nORDER BY ${P.order}` : ''}
LIMIT 50;`, 'query.sql')));
    lines.forEach(([c, t]) => out.append(el('div', {class:'verdict ' + (c || 'warn'), style:{marginTop:'6px', fontWeight:'500', ...(c ? {} : {background:'var(--surface)', color:'var(--text-2)', border:'1px solid var(--border)'})}, html:t})));
    out.append(el('p', {class:'lab-hint'}, 'Table: 10 million hotel rooms. Category means room type. The percentages are invented for this exercise.'));
  }
  const h2 = s => frag(s);
  host.append(el('div', {class:'ctl-grid'},
    ui.select({label:'Index definition', value:P.idx, options:['city', 'city,category', 'city,category,price', 'category,city', 'price', 'city,price,category'].map(v => [v, `(${v.split(',').join(', ')})`]), onChange:v => { P.idx = v; analyze(); }}).el,
    ui.select({label:'Price condition', value:'range', options:[['none', 'none'], ['eq', 'price = 1999'], ['range', 'price BETWEEN …']], onChange:v => { P.price = v; analyze(); }}).el,
    ui.select({label:'ORDER BY', value:'price', options:[['none', 'none'], ['price', 'price'], ['created_at', 'created_at (not indexed)']], onChange:v => { P.order = v; analyze(); }}).el,
    ui.select({label:'SELECT', value:'cover', options:[['cover', 'city, category, price'], ['star', '*']], onChange:v => { P.sel = v; analyze(); }}).el),
    el('div', {class:'row', style:{gap:'18px', marginTop:'10px'}}, ui.toggle({label:"WHERE city = 'Pune'", checked:true, onChange:v => { P.city = v; analyze(); }}).el, ui.toggle({label:"AND category = 'family room'", checked:true, onChange:v => { P.cat = v; analyze(); }}).el), out);
  analyze();
}
function lockSim(host){
  const P = {k:10, rows:1, think:20}; const out = el('div', {style:{marginTop:'12px'}});
  const expo = m => -Math.log(1 - Math.random()) * m;
  function run(){
    const T = 5000;
    // optimistic
    const ver = new Array(P.rows).fill(0); let oc = 0, oRetry = 0, oLat = 0;
    const cl = Array.from({length:P.k}, () => { const r = Math.floor(Math.random() * P.rows); return {r, rv:ver[r], end:expo(P.think), start:0}; });
    for (let t = 0; t < T; t++) cl.forEach(c => { if (t < c.end) return; if (ver[c.r] === c.rv){ ver[c.r]++; oc++; oLat += t - c.start; c.start = t; c.r = Math.floor(Math.random() * P.rows); c.rv = ver[c.r]; c.end = t + expo(P.think); } else { oRetry++; c.rv = ver[c.r]; c.end = t + expo(P.think); } });
    // pessimistic
    const holder = new Array(P.rows).fill(-1), q = Array.from({length:P.rows}, () => []); let pc = 0, pLat = 0, pWait = 0;
    const pl = Array.from({length:P.k}, (_, i) => ({i, r:Math.floor(Math.random() * P.rows), start:0, req:0, end:-1}));
    const acquire = (c, t) => { if (holder[c.r] === -1){ holder[c.r] = c.i; pWait += t - c.req; c.end = t + expo(P.think); } else q[c.r].push(c); };
    pl.forEach(c => acquire(c, 0));
    for (let t = 0; t < T; t++) pl.forEach(c => { if (c.end < 0 || t < c.end) return; pc++; pLat += t - c.start; holder[c.r] = -1; const nx = q[c.r].shift(); if (nx){ holder[c.r] = nx.i; pWait += t - nx.req; nx.end = t + expo(P.think); } c.end = -1; c.start = c.req = t; c.r = Math.floor(Math.random() * P.rows); acquire(c, t); });
    out.innerHTML = '';
    out.append(frag(h.table(['', 'Optimistic (version check)', 'Pessimistic (SELECT … FOR UPDATE)'], [['Committed transactions / s', fmtNum(oc / 5), fmtNum(pc / 5)], ['Avg latency per success', fmtNum(oc ? oLat / oc : 0) + ' ms', fmtNum(pc ? pLat / pc : 0) + ' ms'], ['Wasted attempts (retries)', `${fmtNum(oRetry)} (${Math.round(oRetry / Math.max(1, oRetry + oc) * 100)}% of work)`, '0'], ['Time spent waiting for locks', '0', fmtNum(pc ? pWait / pc : 0) + ' ms / txn']], [1, 2])));
    const hi = P.k / P.rows > 2;
    out.append(el('div', {class:'verdict ' + (hi ? 'warn' : 'ok')}, hi ? 'High contention: optimistic transactions keep colliding and redoing work; locks serialise access but at least nothing is wasted. Consider pessimistic locking (or redesigning to avoid one hot row, e.g. split counters).' : 'Low contention: optimistic locking commits almost everything with no waiting — the usual best choice.'));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Concurrent clients', min:1, max:50, step:1, value:10, fmt:v => v, onInput:v => { P.k = v; run(); }}).el, ui.slider({label:'Distinct rows they update', min:1, max:200, step:1, value:1, fmt:v => v, onInput:v => { P.rows = v; run(); }}).el, ui.slider({label:'Work time inside the transaction', min:2, max:100, step:1, value:20, fmt:v => v + ' ms', onInput:v => { P.think = v; run(); }}).el), out, el('div', {class:'controls'}, ui.button('🎲 Re-run (5 simulated seconds)', run, 'sm')));
  run();
}
function poolCalc(host){
  const P = {inst:20, pool:20, qps:4000, qms:5, maxc:100, cores:8};
  const out = el('div', {style:{marginTop:'12px'}});
  function calc(){
    const need = P.qps * P.qms / 1000, opened = P.inst * P.pool, hikari = P.cores * 2 + 1;
    out.innerHTML = '';
    out.append(frag(`<div class="metrics"><div class="metric"><div class="ml">Connections actually busy</div><div class="mv">${need.toFixed(1)}</div></div><div class="metric ${opened > P.maxc ? 'bad' : opened > P.maxc * .8 ? 'warn' : ''}"><div class="ml">Connections opened</div><div class="mv">${opened}<small>/ ${P.maxc} max</small></div></div><div class="metric"><div class="ml">Sensible DB-side pool</div><div class="mv">~${hikari}</div></div></div>`));
    out.append(frag(h.math(`busy connections = QPS × query time = ${P.qps} × ${P.qms} ms = ${need.toFixed(1)}   (Little’s Law)
opened           = ${P.inst} app instances × pool ${P.pool} = ${opened}
DB guideline     ≈ cores × 2 + effective spindles = ${P.cores} × 2 + 1 = ${hikari} active connections (HikariCP rule of thumb)`)));
    out.append(el('div', {class:'verdict ' + (opened > P.maxc ? 'bad' : need > hikari * 2 ? 'warn' : 'ok')}, opened > P.maxc ? `${opened} connections exceed max_connections (${P.maxc}): new instances fail to connect during a deploy or autoscale. Put a pooler (PgBouncer in transaction mode) in front, shrink per-instance pools, or both.` : need > hikari * 2 ? 'Queries need more concurrency than the database can execute efficiently — speed up queries or add read replicas; a bigger pool will only add contention.' : `Fine: only ~${Math.ceil(need)} connections are busy at once. Small pools per instance plus a central pooler keep the database happy.`));
  }
  const S = (k, o) => ui.slider(Object.assign({value:P[k], onInput:v => { P[k] = v; calc(); }}, o)).el;
  host.append(el('div', {class:'ctl-grid'}, S('inst', {label:'App instances', min:1, max:200, step:1, fmt:v => v}), S('pool', {label:'Pool size per instance', min:1, max:100, step:1, fmt:v => v}), S('qps', {label:'Peak queries/s', min:100, max:50000, step:100, fmt:v => fmtNum(v)}), S('qms', {label:'Avg query time', min:1, max:200, step:1, fmt:v => v + ' ms'}), S('maxc', {label:'Database max_connections', min:50, max:1000, step:10, fmt:v => v}), S('cores', {label:'Database CPU cores', min:2, max:96, step:2, fmt:v => v})), out);
  calc();
}
function rowColDemo(host){
  const P = {rows:8, cols:50, comp:5, months:1};
  const out = el('div', {style:{marginTop:'12px'}});
  function calc(){
    const N = Math.pow(10, P.rows), B = 8;
    const row = N * P.cols * B, col = N * 2 * B / P.comp * (P.months / 12);
    const t = b => b / 1e9;
    out.innerHTML = '';
    [['Row store (OLTP layout)', row, 'var(--c-db)', 'Reads every column of every booking row in this simplified model.'], ['Column store (OLAP layout)', col, 'var(--accent2)', `Reads only booking amount and date, compressed ${P.comp} times. It skips months outside the selected range.`]].forEach(([n, b, c, why]) => {
      out.append(el('div', {class:'wf-row', style:{gridTemplateColumns:'190px 1fr 150px'}}, el('b', {class:'wl'}, n), el('div', {class:'wf-track', style:{height:'22px'}}, el('div', {class:'wf-bar', style:{left:'0', width:Math.max(.5, b / row * 100) + '%', background:c}})), el('span', {class:'wt'}, `${fmtBytes(b)} · ${fmtDur(t(b) * 1000)}`)), el('p', {class:'lab-hint', style:{margin:'0 0 10px 200px'}, html:why}));
    });
    out.append(el('div', {class:'verdict ok'}, `Column store reads ~${fmtNum(row / col)}× less data for this query.`));
    out.append(el('p', {class:'lab-hint'}, 'Hotel report: sum booking amounts over the selected months. The byte sizes and scan speed are teaching estimates.'));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Rows in the bookings table', min:5, max:10, step:.1, value:8, fmt:v => fmtNum(Math.pow(10, v)), onInput:v => { P.rows = v; calc(); }}).el, ui.slider({label:'Columns in the table', min:5, max:200, step:1, value:50, fmt:v => v, onInput:v => { P.cols = v; calc(); }}).el, ui.slider({label:'Column compression', min:1, max:15, step:.5, value:5, fmt:v => v + '×', onInput:v => { P.comp = v; calc(); }}).el, ui.slider({label:'Months queried (of 12)', min:1, max:12, step:1, value:1, fmt:v => v, onInput:v => { P.months = v; calc(); }}).el), out);
  calc();
}
function tierCalc(host){
  const P = {tb:500, hot:10, warm:20};
  const PRICE = [['Hot (standard object storage)', .023], ['Warm (infrequent access)', .0125], ['Cold (instant-retrieval archive)', .004], ['Deep archive (hours to restore)', .00099]];
  const out = el('div', {style:{marginTop:'12px'}});
  function calc(){
    const gb = P.tb * 1000, hot = P.hot / 100, warm = P.warm / 100, cold = Math.max(0, 1 - hot - warm) * .3, deep = Math.max(0, 1 - hot - warm) * .7;
    const flat = gb * PRICE[0][1], tiered = gb * (hot * PRICE[0][1] + warm * PRICE[1][1] + cold * PRICE[2][1] + deep * PRICE[3][1]);
    out.innerHTML = '';
    out.append(frag(h.table(['Tier', 'Share', '$/GB-month', 'Monthly'], [[PRICE[0][0], Math.round(hot * 100) + '%', '$' + PRICE[0][1], '$' + fmtNum(gb * hot * PRICE[0][1])], [PRICE[1][0], Math.round(warm * 100) + '%', '$' + PRICE[1][1], '$' + fmtNum(gb * warm * PRICE[1][1])], [PRICE[2][0], Math.round(cold * 100) + '%', '$' + PRICE[2][1], '$' + fmtNum(gb * cold * PRICE[2][1])], [PRICE[3][0], Math.round(deep * 100) + '%', '$' + PRICE[3][1], '$' + fmtNum(gb * deep * PRICE[3][1])]], [1, 2, 3])));
    out.append(el('div', {class:'verdict ok'}, `Everything in the hot tier: $${fmtNum(flat)}/month. With lifecycle tiering: $${fmtNum(tiered)}/month — ${Math.round((1 - tiered / flat) * 100)}% less.`));
    out.append(el('p', {class:'lab-hint'}, 'Prices are illustrative, roughly in line with published list prices for major cloud object-storage classes in one US region; they vary by region and change over time. Colder tiers add retrieval fees, minimum storage durations and restore delays.'));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Total hotel photo data', min:1, max:5000, step:1, value:500, fmt:v => v + ' TB', onInput:v => { P.tb = v; calc(); }}).el, ui.slider({label:'Accessed in the last 30 days', min:1, max:100, step:1, value:10, fmt:v => v + '%', onInput:v => { P.hot = v; P.warm = Math.min(P.warm, 100 - v); calc(); }}).el, ui.slider({label:'Accessed in 30–90 days', min:0, max:99, step:1, value:20, fmt:v => v + '%', onInput:v => { P.warm = Math.min(v, 100 - P.hot); calc(); }}).el), out);
  calc();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'sql-vs-nosql', title:'SQL vs NoSQL: the database families and how to choose', minutes:11, tags:['SQL','NoSQL','key-value','document','wide-column','graph','time-series','vector'],
  summary:'SQL databases keep related records in tables and support questions across them. NoSQL is a group of other data shapes. Choose from the reads and writes the app needs.',
  problem:`<h3>A small example</h3><p>A hotel booking app stores rooms and reservations.</p><ul><li>A guest searches for a room.</li><li>A booking connects one guest, hotel, room, and date.</li><li>The app also stores hotel photos and recent searches.</li></ul><p>Which facts belong together, and which questions must the database answer?</p>`,
  intuition:`A table is like a reservation book with separate pages for guests, rooms, and bookings. A key-value store is a row of lockers opened by a number. A document keeps one hotel's details together.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Start with the booking question before choosing a database family.</p>',
    steps:[
      {icon:'🏨', title:'List related facts', text:'A booking joins a guest, room, hotel, and dates. SQL tables are a clear fit for those relationships.'},
      {icon:'🔑', title:'Look up by one key', text:'A key-value store returns one item quickly when the app already knows its ID.'},
      {icon:'📄', title:'Read one whole document', text:'A document store can keep one hotel’s description and amenities together.'},
      {icon:'🕒', title:'Store repeated history', text:'A wide-column or time-based store may suit many price changes written in order.'},
      {icon:'⚖️', title:'Choose by actual work', text:'Keep bookings in one reliable source first. Add another store only when a measured need calls for it.'}
    ],
    diagram:{title:'Different reads in a hotel app', w:800, h:300, alt:'Bookings use a relational source. Other stores can hold price history and derived views for searching, similar hotels, and reports.',
      nodes:[{id:'api', type:'service', label:'Booking app', x:110, y:90, w:150}, {id:'gps', type:'service', label:'Price history', x:110, y:230, w:150}, {id:'pg', type:'db', label:'SQL database', sub:'rooms, bookings', x:360, y:90, w:130}, {id:'cas', type:'db', label:'History store', sub:'price changes', x:360, y:230, w:130}, {id:'q', type:'queue', label:'Change path', x:560, y:90, w:130}, {id:'es', type:'db', label:'Search copy', sub:'hotel names', x:720, y:40, w:130}, {id:'vec', type:'db', label:'Related hotels', sub:'similar', x:720, y:140, w:130}, {id:'wh', type:'db', label:'Reports store', sub:'analysis', x:720, y:240, w:130}],
      edges:[{from:'api', to:'pg'}, {from:'gps', to:'cas'}, {from:'pg', to:'q'}, {from:'q', to:'es'}, {from:'q', to:'vec'}, {from:'q', to:'wh'}],
      steps:[
        {note:'The booking app saves rooms and reservations in SQL tables.', flow:[['api', 'pg', 'save booking']], hl:['pg']},
        {note:'The app may store repeated price changes in a separate history layout.', flow:[['gps', 'cas', 'price'], ['gps', 'cas', 'price'], ['gps', 'cas', 'price']], hl:['cas']},
        {note:'A later change can feed read-only copies. You will learn that path in Module 7.', flow:[['pg', 'q', 'change']], hl:['q']},
        {note:'Search, related-hotel views, and reports can be rebuilt from original records. You will learn search in Module 8.', flow:[['q', 'es'], ['q', 'vec'], ['q', 'wh']], parallel:true}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Storage shape', 'Hotel fact'], [['Related pages in a reservation book', 'Guests, rooms, and bookings in SQL tables.'], ['Locker opened by a number', 'Hotel details found by hotel ID.'], ['Folder for one hotel', 'One document with its amenities.']])}</div><div class="callout tip"><b>Important point</b><p>Start with the questions the hotel app must answer. Store names alone do not choose a database.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Possible fit'], [['Correct room bookings across related records', 'Relational SQL database.'], ['Read one whole hotel description by ID', 'Document or key-value store.'], ['Huge ordered price history', 'Time-based or wide-column store.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the hotel app has 5 million bookings of about 200 bytes each. 5,000,000 × 200 B = 1,000,000,000 B, which is 1 GB. That fits on one ordinary server, even with indexes. Size alone is rarely a reason to leave SQL.</p><p>Now say the app adds 3 more stores. Each one needs its own backup, its own alerts and its own way to get data in. That is 3 extra sets of chores to run every week.</p><h4>When it goes wrong</h4><p>Many SQL databases can keep a JSON document inside one column. PostgreSQL does this with its jsonb type. The hotel description and amenities can sit next to the booking tables. The app gets document-style reads without a second database.</p><h4>How it works inside</h4><p>A key-value store finds an item by running the key through a hash, a repeatable number made from the key. It does not need to scan. But it cannot answer "all rooms under ₹2,000" unless you built another lookup for it.</p>`
  },
  tradeoffs:{use:[`For hotel bookings, SQL keeps guest, room, and date relationships clear.`, `Use another store only for a hotel read or write pattern the first store cannot serve well.`], avoid:[`Do not add a new database for each hotel screen before measuring a need.`, `Do not keep conflicting original booking records in several stores.`], alt:[`A relational product may also store hotel documents or time-based records at the app’s first scale.`]},
  real:[
    {co:'Google', tier:'confirmed', text:'The Bigtable paper describes a store built for very large, ordered data keyed by row.', src:'Chang and others, Bigtable (2006)'}
  ],
  mistakes:[`Choosing a database only because its name is popular.`, `Giving two stores separate copies of a booking without naming which one is original.`],
  interview:[`Name the hotel app’s main reads and writes before choosing a database.`, `Explain why a room booking needs related records.`],
  tryit:[{quiz:[
    {q:'Which data fits related SQL tables in the hotel app?', options:['A color palette', 'Guests, rooms, and bookings', 'Only a photo file', 'Only one random key'], answer:1, why:'The booking connects several related facts.'},
    {q:'What should guide a database choice?', options:['The number of logos', 'One example from another company', 'The app’s actual reads and writes', 'The newest product name'], answer:2, why:'Different database families serve different access patterns.'}
  ]}, {note:'Select hotel booking relationships first. Then try one-key hotel lookups and ordered price history.', mount:host => dbChooser(host)}],
  sources:[`Chang and others, Bigtable (2006)`, `Martin Kleppmann, Designing Data-Intensive Applications`]
},
{
  id:'acid-vs-base', title:'ACID vs BASE', minutes:8, tags:['ACID','BASE','atomicity','durability','eventual consistency'],
  summary:'ACID groups important database changes so they succeed together and survive a crash. BASE allows some copies to disagree briefly before they settle. Different hotel facts need different promises.',
  problem:`<h3>A small example</h3><p>A guest pays ₹500 toward a hotel booking.</p><ul><li>₹500 leaves the guest wallet.</li><li>₹500 reaches the hotel wallet.</li><li>The hotel page also counts views.</li></ul><p>Which changes must be exact now, and which count can catch up later?</p>`,
  intuition:`A transfer receipt must show both sides of a payment or neither. A hotel view counter can be a little behind while phones catch up.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the ₹500 transfer first, then compare the hotel view count.</p>',
    steps:[
      {icon:'🔁', title:'Atomicity keeps both sides', text:'The guest debit and hotel credit both complete, or neither does.'},
      {icon:'✅', title:'Consistency keeps rules true', text:'The transfer must not create or lose ₹500 between the two wallets.'},
      {icon:'🚪', title:'Isolation hides half-work', text:'Another request should not see a half-finished transfer.'},
      {icon:'💾', title:'Durability keeps a commit', text:'After the database confirms the transfer, a crash should not erase it.'},
      {icon:'👀', title:'BASE can suit a count', text:'Hotel view counts may be briefly different across copies, then move toward the same value.'}
    ],
    diagram:{title:'A hotel payment keeps both sides together', w:740, h:240, alt:'A guest payment records both wallet changes before committing. A crash before commit leaves neither change.',
      nodes:[{id:'app', type:'service', label:'Booking payment', x:90, y:120}, {id:'wal', type:'queue', label:'Change log', x:340, y:50, w:150}, {id:'a', type:'db', label:'Guest: ₹1,000', x:600, y:60, w:150}, {id:'r', type:'db', label:'Hotel: ₹200', x:600, y:180, w:150}],
      edges:[{from:'app', to:'wal'}, {from:'wal', to:'a'}, {from:'wal', to:'r'}, {from:'app', to:'a', dashed:true}],
      steps:[
        {note:'Record the guest debit and hotel credit as one planned transfer.', flow:[['app', 'wal', 'guest -500'], ['app', 'wal', 'hotel +500']], hl:['wal']},
        {note:'Commit confirms both changes together.', flow:[['app', 'wal', 'commit']], hl:['wal']},
        {note:'Guest has ₹500 and hotel has ₹700. Total money stays the same.', flow:[['wal', 'a'], ['wal', 'r']], parallel:true, sub:{a:'₹500', r:'₹700'}},
        {note:'If the app crashes before commit, neither wallet change should remain.', status:{app:'down'}, hl:['wal']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Hotel record', 'Promise'], [['Guest pays and hotel receives', 'Both changes complete together.'], ['Another guest checks while payment runs', 'No half-transfer appears.'], ['Guest views hotel page', 'The count may update later.']])}</div><div class="callout tip"><b>Important point</b><p>Choose the guarantee for the fact. Money and room allocation need stronger rules than a view count.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Data', 'Useful approach'], [['Booking payment', 'ACID transaction.'], ['Last available room', 'ACID transaction.'], ['Approximate hotel view count', 'An eventually updated value can be enough.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the guest wallet holds ₹2,000 and the hotel wallet holds ₹10,000. The total is ₹12,000. After the ₹500 transfer they hold ₹1,500 and ₹10,500. The total is still ₹12,000. That unchanged total is the rule consistency protects.</p><p>Now the view count. Say two copies each count 1,000 new views before they sync. If they add their counts, the total is 2,000. If one copy simply overwrites the other, 1,000 views are lost. BASE still needs a merge rule.</p><h4>How it works inside</h4><p>For the transfer, the write-ahead log gets three records: debit ₹500, credit ₹500, then commit. After a crash, the database replays work that has a commit record. It ignores work that does not.</p><h4>When it goes wrong</h4><p>Some settings confirm a commit before the log reaches the disk. That is faster, but a crash can then lose work the guest was told was saved.</p>`
  },
  tradeoffs:{use:[`For the hotel payment, use a transaction so both wallet changes commit together.`, `A briefly delayed hotel view count can use a looser update rule.`], avoid:[`Do not allow two guests to receive the last room.`, `Do not treat a temporarily wrong money balance as acceptable.`], alt:[`If the app only needs one local database, keep the transfer in that database instead of spreading it across services.`]},
  real:[
    {co:'eBay', tier:'confirmed', text:'Dan Pritchett described BASE as a way to reason about looser consistency in large systems.', src:'Dan Pritchett, BASE: An Acid Alternative (2008)'}
  ],
  mistakes:[`Saving only the guest debit before saying the payment succeeded.`, `Treating the last available room like an approximate view count.`],
  interview:[`Explain what each ACID letter protects in the hotel payment.`, `Say why the hotel view count can be delayed.`],
  tryit:[{quiz:[
    {q:'What should happen if the app crashes before a hotel payment commits?', options:['Only the guest debit remains', 'Only the hotel credit remains', 'Both wallets double', 'Neither wallet change remains'], answer:3, why:'Atomicity keeps the transfer together.'},
    {q:'Which hotel fact may safely be briefly behind?', options:['Approximate page view count', 'Guest money balance', 'Last room allocation', 'Confirmed payment'], answer:0, why:'A view count can be updated later if the product allows it.'}
  ]}, {note:'Sort hotel facts by whether they need a transaction or may update later.', mount:host => sortGame(host, [
    {t:'Move ₹500 from guest to hotel wallet', c:'a', why:'Both money changes must complete together.'},
    {t:'Count hotel page views', c:'b', why:'A short delay may be acceptable.'},
    {t:'Give the last room to one guest', c:'a', why:'Two confirmations would be wrong.'},
    {t:'Update an approximate trending score', c:'b', why:'The display can catch up later.'}
  ], [{id:'a', label:'ACID'}, {id:'b', label:'BASE'}])}],
  sources:[`Dan Pritchett, BASE: An Acid Alternative (2008)`]
},
{
  id:'indexes', title:'Indexes: B-tree, hash, composite, covering, inverted', minutes:11, tags:['index','B-tree','hash index','composite index','covering index','inverted index'],
  summary:'An index helps a database find matching rows without reading every row. Its order matters for searches and sorting. Each extra index also uses space and slows writes.',
  problem:`<h3>A small example</h3><p>The hotel app has millions of room records. A guest searches rooms in Pune by type and price.</p><ul><li>City is Pune.</li><li>Room type is family.</li><li>Price must be between ₹1,000 and ₹3,000.</li></ul><p>How can the database find matching rooms without checking every room?</p>`,
  intuition:`A book index lists topics in sorted order, so you jump to the right pages. A phone book sorted by city, then name helps with a city search. It cannot start from name alone.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow a sorted index to hotel 42, then consider a multi-column room search.</p>',
    steps:[
      {icon:'📚', title:'Keep keys in order', text:'A B-tree index keeps values sorted, so the database can jump toward hotel 42 or scan a price range.'},
      {icon:'🔢', title:'Use a hash for one key', text:'A hash index helps with exact matches, such as hotel ID 42, but not sorted price ranges.'},
      {icon:'🧩', title:'Order several columns', text:'An index on city, room type, and price starts with city. Skipping city loses its useful starting point.'},
      {icon:'📄', title:'Cover a narrow answer', text:'If the index contains every field a query needs, the database may avoid reading the full room row.'},
      {icon:'🔎', title:'Match words to records', text:'An inverted index maps a word to records containing it. You will learn search structures in Module 8.'}
    ],
    diagram:{title:'Find hotel 42 through a B-tree', w:760, h:260, alt:'A sorted index guides a hotel-ID lookup through a few pages rather than scanning all rows.',
      nodes:[{id:'q', type:'client', label:'hotel_id=42', x:90, y:130, w:150}, {id:'root', type:'db', label:'Root page', sub:'< 500 | ≥ 500', x:320, y:130, w:130}, {id:'i1', type:'db', label:'Internal', sub:'< 50 | ≥ 50', x:500, y:70, w:120}, {id:'i2', type:'db', label:'Internal', sub:'500…', x:500, y:200, w:120}, {id:'leaf', type:'db', label:'Leaf: 40–49', sub:'42 row', x:680, y:70, w:130}],
      edges:[{from:'q', to:'root'}, {from:'root', to:'i1'}, {from:'root', to:'i2'}, {from:'i1', to:'leaf'}],
      steps:[
        {note:'Hotel ID 42 is below 500, so the search follows the left branch.', flow:[['q', 'root', 'find 42']], hl:['root']},
        {note:'ID 42 is also below 50 at the next page.', flow:[['root', 'i1']], hl:['i1']},
        {note:'The leaf points to hotel 42 without checking every hotel row.', flow:[['i1', 'leaf']], hl:['leaf']},
        {note:'Upper index pages can stay in memory because many lookups reuse them.', hl:['root', 'i1', 'leaf']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Book index', 'Hotel query'], [['Jump to one entry', 'Find hotel ID 42.'], ['Read a run of nearby entries', 'Find rooms in a price range.'], ['Use the first sort column', 'Start with city in a city, type, price index.']])}</div><div class="callout tip"><b>Important point</b><p>Build an index for a query the hotel app actually makes. Every extra index costs space and write work.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Query', 'Useful index'], [['One hotel ID', 'Hash or B-tree.'], ['City, type, then price range', 'Composite B-tree in that order.'], ['Words in a review', 'Inverted index, taught in Module 8.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the hotel app has 5,000,000 room rows. A B-tree page holds about 200 keys. One level reaches 200 pages, two levels reach 200 × 200 = 40,000, and three levels reach 200 × 200 × 200 = 8,000,000. So 3 page reads find one room, not 5 million row checks.</p><p>Writes cost more. Say a table has 4 indexes. One new room means 1 table write plus 4 index writes, which is 5.</p><h4>When it goes wrong</h4><p>An index on room type is weak. Say there are 4 types, so family rooms are 25% of 5,000,000 = 1,250,000 rows. Jumping to a million rows one by one can be slower than one straight scan.</p><p>Column order matters too. The index (city, room type, price) works well. The index (city, price, room type) must scan the whole Pune price range, then filter by type.</p>`
  },
  tradeoffs:{use:[`For the hotel search, index city, room type, and price if those are common filters.`, `For hotel ID lookup, use the existing primary-key index.`], avoid:[`Do not add an index for every room column without a matching query.`, `Do not place price first when most searches begin with city.`], alt:[`If review text search becomes important, add a suitable text index later in Module 8.`]},
  real:[
    {co:'PostgreSQL', tier:'confirmed', text:'PostgreSQL documents B-tree, hash, and other index types for different queries.', src:'PostgreSQL index documentation'}
  ],
  mistakes:[`Choosing the wrong column order for the hotel search.`, `Adding many indexes without checking the cost of room updates.`],
  interview:[`Name an index for city, room type, and price.`, `Explain why an index helps reads but adds write and storage work.`],
  tryit:[{quiz:[
    {q:'Which index order fits searches by city, room type, and price range?', options:['No index can help', 'City, type, price', 'Price, type, city always', 'Only room photo'], answer:1, why:'The index starts with the equal city and type filters before the price range.'},
    {q:'What cost does an extra index add?', options:['A new hotel', 'A different browser', 'Storage and work on writes', 'No cost at all'], answer:2, why:'The database must update the index when relevant rows change.'}
  ]}, {note:'Use the index explorer with city, room type, and price filters. Compare column orders and selected fields.', mount:host => indexChecker(host)}],
  sources:[`PostgreSQL index documentation`]
},
{
  id:'btree-vs-lsm', title:'Storage engines: B-trees vs LSM-trees', minutes:10, tags:['B-tree','LSM','SSTable','memtable','compaction','write amplification'],
  summary:'A B-tree keeps sorted pages ready for reads. An LSM-tree collects writes quickly and sorts files later. The hotel app should choose from its measured read and write pattern.',
  problem:`<h3>A small example</h3><p>The hotel app reads current room prices and records every price change.</p><ul><li>Guests search current prices often.</li><li>Hotels may send many price changes.</li><li>History can grow large.</li></ul><p>Should the store organize each write immediately or merge writes later?</p>`,
  intuition:`A B-tree is a sorted filing cabinet. A clerk files each price in its place now. An LSM-tree is a sorted inbox that accepts changes quickly and merges them into larger files later.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one hotel price change through an LSM store, then compare a B-tree.</p>',
    steps:[
      {icon:'📇', title:'B-tree files now', text:'A B-tree finds the right sorted page and updates it. This helps later lookups and price ranges.'},
      {icon:'✍️', title:'LSM accepts a write', text:'An LSM store records the change in a recovery log and a sorted memory area called a memtable.'},
      {icon:'💾', title:'Memory becomes a file', text:'When the memtable fills, it becomes a sorted disk file called an SSTable.'},
      {icon:'🧹', title:'Files merge later', text:'Compaction combines sorted files and removes older versions of changed prices.'},
      {icon:'🔎', title:'Reads may check more places', text:'An LSM read can check memory and several files. Measure that cost against its faster write path.'}
    ],
    diagram:{title:'Saving hotel price changes with an LSM store', w:760, h:260, alt:'A price change reaches a recovery log and memtable, then sorted files that merge later.',
      nodes:[{id:'w', type:'client', label:'Price change', x:80, y:130}, {id:'wal', type:'queue', label:'Recovery log', x:270, y:50, w:130}, {id:'mt', type:'cache', label:'Memtable', sub:'sorted memory', x:270, y:190, w:130}, {id:'l0', type:'db', label:'New sorted files', x:490, y:190, w:130}, {id:'l1', type:'db', label:'Merged files', x:680, y:190, w:130}],
      edges:[{from:'w', to:'wal'}, {from:'w', to:'mt'}, {from:'mt', to:'l0'}, {from:'l0', to:'l1'}],
      steps:[
        {note:'A hotel price change reaches the recovery log and memtable.', flow:[['w', 'wal', 'record'], ['w', 'mt', 'save']], parallel:true, hl:['mt']},
        {note:'The memtable fills and is written as a sorted file.', flow:[['mt', 'l0', 'write file']], hl:['l0']},
        {note:'Background work merges files and removes older price versions.', flow:[['l0', 'l1', 'merge']], hl:['l1']},
        {note:'A read may check memory, then newer and older sorted files.', flow:[['w', 'mt', 'read'], ['mt', 'l0', 'check'], ['l0', 'l1', 'check']], hl:['l1']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Price filing', 'Storage engine'], [['File each change in its sorted place', 'B-tree.'], ['Accept changes in an inbox and merge later', 'LSM-tree.']])}</div><div class="callout tip"><b>Important point</b><p>Faster writes often move sorting work to later. Read speed and background work still matter.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Hotel workload', 'Possible fit'], [['Many current-room lookups and ranges', 'B-tree.'], ['Very heavy ordered price-history writes', 'LSM-tree after measurement.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say one price change is 100 bytes and a B-tree page is 8 KB, about 8,000 bytes. Changing one price rewrites a whole page. 8,000 ÷ 100 = 80 times more disk writing than the change itself.</p><p>Say an LSM memtable holds 64 MB. 64,000,000 B ÷ 100 B = 640,000 changes in one new file. That is one big sequential write, which disks handle well.</p><p>Say a price is rewritten once at each of 5 merge stages. Then 1 change causes 5 disk writes. That is the cost of cleaning up later.</p><h4>How it works inside</h4><p>An LSM cannot erase a price from an old file. A delete is written as a small marker called a tombstone. Space is freed only when compaction merges the file holding the marker with the files holding the old value.</p>`
  },
  tradeoffs:{use:[`For hotel room searches, a B-tree can support current price lookups and ranges.`, `For a measured flood of price-history writes, compare an LSM engine.`], avoid:[`Do not choose an LSM solely because writes sound fast.`, `Do not ignore compaction work when the hotel app is busy.`], alt:[`Keep current bookings in one SQL database and place huge price history elsewhere only after a measured need.`]},
  real:[
    {co:'Apache Cassandra', tier:'confirmed', text:'Cassandra documents a write path with a commit log, memtable, sorted files, and compaction.', src:'Apache Cassandra documentation'}
  ],
  mistakes:[`Choosing an LSM without checking the cost of reading price history.`, `Ignoring background file merges until they slow hotel searches.`],
  interview:[`Trace one hotel price change through the LSM write path.`, `Explain why a B-tree can help current-room range reads.`],
  tryit:[{quiz:[
    {q:'Where does an LSM store first hold a new hotel price in sorted memory?', options:['A poster file', 'A browser tab', 'A CDN edge', 'Memtable'], answer:3, why:'The memtable accepts recent writes before they become sorted disk files.'},
    {q:'What later work combines LSM sorted files?', options:['Compaction', 'DNS lookup', 'Ticket draining', 'HTML parsing'], answer:0, why:'Compaction merges files and removes old versions.'}
  ]}, {note:'Insert hotel price changes into the B-tree and LSM explorer. Compare the read path and file merges.', pg:'btree-lsm'}],
  sources:[`Apache Cassandra documentation`, `O’Neil and others, The Log-Structured Merge-Tree (1996)`]
},
{
  id:'normalization', title:'Normalization vs denormalization', minutes:8, tags:['normalization','denormalization','3NF','joins','duplication'],
  summary:'Normalization stores one current copy of a fact and links to it. Denormalization makes extra copies for faster reads. Historical booking facts may need a deliberate snapshot.',
  problem:`<h3>A small example</h3><p>A hotel changes its name after many guests have booked rooms.</p><ul><li>Current hotel name appears on search pages.</li><li>Bookings link to that hotel.</li><li>Old receipts must show what the guest paid.</li></ul><p>Which facts should live once, and which should be kept as a booking-time copy?</p>`,
  intuition:`Keep one current contact card and refer to it from many notes. Copy a price onto a receipt because the receipt records the past, even after the price changes.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Separate current hotel facts from the guest’s historical booking.</p>',
    steps:[
      {icon:'🏨', title:'Store current facts once', text:'Keep the hotel’s current name in its hotel record. Bookings refer to that record by ID.'},
      {icon:'🔗', title:'Join when reading', text:'The booking page can join the booking with the hotel record to show the current name.'},
      {icon:'📋', title:'Copy when it helps', text:'A busy search page may keep a prepared copy of hotel facts for fast reading.'},
      {icon:'🧾', title:'Keep history honestly', text:'The booking receipt stores the price paid then. It must not change when today’s room price changes.'},
      {icon:'🔄', title:'Plan copy updates', text:'Every extra current-name copy needs a way to change when the hotel renames itself.'}
    ],
    stepper:{title:'Same data, two shapes', items:[
      {title:'Store current hotel', tag:'one record', text:'The hotel table holds one current name and address.'},
      {title:'Link a booking', tag:'ID', text:'A booking stores hotel ID, guest ID, room ID, dates, and paid price.'},
      {title:'Read together', tag:'join', text:'A join combines the linked rows when the guest opens a booking.'},
      {title:'Make a fast copy', tag:'extra read shape', text:'A search screen may keep current hotel name near room facts for faster reads.'},
      {title:'Rename the hotel', tag:'update', text:'Update the current hotel record and any prepared current-name copies.'},
      {title:'Keep the receipt', tag:'history', text:'The paid price stays on the booking receipt even if today’s price changes.'}
    ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Office record', 'Hotel data'], [['One current contact card', 'One current hotel record.'], ['Notes refer to that card', 'Bookings refer to hotel ID.'], ['Receipt keeps an old paid amount', 'Booking keeps its price snapshot.']])}</div><div class="callout tip"><b>Important point</b><p>Copy a fact only when the app needs a faster read or an honest record of the past.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Fact', 'Shape'], [['Current hotel name', 'One normalized source.'], ['Search result name', 'A maintained read copy if needed.'], ['Price paid for a booking', 'Historical snapshot.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say one hotel has 50,000 bookings. If every booking copies the hotel name, a rename means 50,000 row updates. With a hotel table, it is 1 row. If the update misses 3 rows, 3 bookings show the old name and 49,997 show the new one.</p><p>Now the receipt. A room costs ₹2,000 a night and a guest stays 3 nights. The paid amount is ₹6,000. If the app joins to today's price of ₹2,500, the old receipt shows 3 × 2,500 = ₹7,500. That is wrong, so the booking stores its own price.</p><h4>When it goes wrong</h4><p>Say a prepared search copy refreshes every 5 minutes. A rename can then show up to 5 × 60 = 300 seconds late. Decide whether that delay is acceptable before you build the copy.</p>`
  },
  tradeoffs:{use:[`For the hotel app, keep the current name once and link bookings by ID.`, `Keep the paid price on each booking receipt as a snapshot.`], avoid:[`Do not copy the current hotel name to every booking without an update plan.`, `Do not replace a paid price with today’s price.`], alt:[`Try a suitable index before adding a prepared copy to speed up the booking page.`]},
  real:[
    {co:'E. F. Codd', tier:'confirmed', text:'Codd’s relational model led to ways of organizing facts so repeated copies do not drift apart.', src:'Codd, A Relational Model of Data (1970)'}
  ],
  mistakes:[`Using today’s room price to rewrite an old receipt.`, `Keeping copied current names with no update path.`],
  interview:[`Explain why hotel name and paid price have different storage rules.`, `Name the update path for any fast read copy.`],
  tryit:[{quiz:[
    {q:'Where should the current hotel name live first?', options:['Only in the browser', 'One hotel record', 'Every booking only', 'Only in a photo'], answer:1, why:'One current record avoids conflicting names.'},
    {q:'Why should a booking keep the price paid?', options:['It removes the hotel', 'It changes the room type', 'It records a historical fact', 'It makes all future prices equal'], answer:2, why:'A receipt must show what the guest agreed to then.'}
  ]}, {note:'Sort hotel facts by whether they should be linked to one current record or copied as history.', mount:host => sortGame(host, [
    {t:'Current hotel name', c:'n', why:'Keep one current source.'},
    {t:'Price paid on a booking receipt', c:'d', why:'The old amount must remain on the receipt.'},
    {t:'Guest email for login', c:'n', why:'Keep one current account value.'},
    {t:'Room price shown on a measured hot search page', c:'d', why:'A maintained read copy can help when measured reads need it.'}
  ], [{id:'n', label:'Normalize'}, {id:'d', label:'Copy/denormalize'}])}],
  sources:[`Codd, A Relational Model of Data (1970)`]
},
{
  id:'transactions-isolation', title:'Transactions and isolation levels (MVCC)', minutes:12, tags:['isolation','dirty read','non-repeatable read','phantom','MVCC','serializable','write skew'],
  summary:'A transaction groups related database work. Isolation decides what overlapping transactions can see. MVCC keeps older row versions so readers can use a stable view.',
  problem:`<h3>A small example</h3><p>The hotel app must keep at least one night manager on duty.</p><ul><li>Asha is on duty.</li><li>Ravi is on duty.</li><li>Both ask at once whether the other can cover.</li></ul><p>Can both leave after each sees two managers on duty?</p>`,
  intuition:`Two people edit separate copies of a duty chart. Each sees the old chart with two names and erases their own name. When the edits meet, nobody remains.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Watch two duty changes overlap.</p>',
    steps:[
      {icon:'📋', title:'Each reads a view', text:'Asha and Ravi each read a database view with two managers on duty.'},
      {icon:'✍️', title:'Each changes a different row', text:'Asha and Ravi each mark themselves off. Their writes do not touch the same row.'},
      {icon:'⚠️', title:'The rule breaks', text:'Both changes may commit under snapshot isolation, leaving no night manager.'},
      {icon:'🛑', title:'Serializable catches it', text:'Serializable isolation makes the result behave like one transaction ran first. One change must retry or fail.'},
      {icon:'📸', title:'MVCC keeps views', text:'Multi-version concurrency control stores older row versions so readers can see a consistent snapshot.'}
    ],
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Duty chart', 'Database idea'], [['Read only finished edits', 'Read Committed.'], ['Read one stable photocopy', 'Snapshot view through MVCC.'], ['Act as if changes took turns', 'Serializable.']])}</div><div class="callout tip"><b>Important point</b><p>A stable snapshot does not always protect a rule that depends on several rows.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Hotel work', 'Needed care'], [['Read a hotel description', 'A normal committed view may be enough.'], ['Keep one manager on duty', 'Use a rule or isolation that blocks both leaving.'], ['Book the last room', 'Use a safe concurrent update.']])}</div>`,
    diagram:{title:'Both managers leave in one snapshot', w:760, h:240, alt:'Asha and Ravi each see two managers on duty. They update different rows, leaving no manager unless one transaction is stopped.',
      nodes:[{id:'t1', type:'service', label:'Asha change', x:110, y:60, w:140}, {id:'t2', type:'service', label:'Ravi change', x:110, y:190, w:140}, {id:'db', type:'db', label:'Duty table', sub:'Asha ✓  Ravi ✓', x:480, y:125, w:160}],
      edges:[{from:'t1', to:'db'}, {from:'t2', to:'db'}],
      steps:[
        {note:'Both changes read that Asha and Ravi are on duty.', flow:[['t1', 'db', 'count 2'], ['t2', 'db', 'count 2']], parallel:true},
        {note:'Each manager marks only their own row off duty.', flow:[['t1', 'db', 'Asha off'], ['t2', 'db', 'Ravi off']], parallel:true},
        {note:'Both changes commit under this snapshot model. No manager remains.', sub:{db:'Asha ✗  Ravi ✗'}, status:{db:'hot'}},
        {note:'Serializable can stop one change. The remaining manager stays on duty.', status:{db:'ok'}, sub:{db:'Asha ✗  Ravi ✓'}, hl:['db']}
      ]},
    deep:`<h4>The numbers</h4><p>Follow the clock. At 0 ms, Asha reads a count of 2 on duty. At 1 ms, Ravi reads 2. At 5 ms, Asha marks herself off and commits. At 6 ms, Ravi does the same. The count is now 0.</p><p>Under Serializable, the database spots at 6 ms that Ravi's decision rested on a count Asha just changed. It aborts Ravi. He retries, reads 1, and the app refuses his request.</p><h4>When it goes wrong</h4><p>You can fix this without Serializable. Lock both duty rows with SELECT ... FOR UPDATE before deciding. Or keep one counter row that both transactions must update, so they collide.</p><h4>How it works inside</h4><p>Each update in an MVCC database writes a new row version. Cleanup removes versions that no open snapshot may still need. One snapshot left open for hours can make old versions pile up.</p>`
  },
  tradeoffs:{use:[`For the night-manager rule, Serializable or a suitable database constraint can stop both leaving.`, `For a hotel description read, weaker isolation may be enough.`], avoid:[`Do not assume a stable snapshot prevents every multi-row rule from breaking.`, `Do not retry an aborted transaction without checking its result.`], alt:[`Lock the row that represents the duty rule before either manager changes it.`]},
  real:[
    {co:'PostgreSQL', tier:'confirmed', text:'PostgreSQL documents that Serializable transactions may be aborted when their overlap would produce an unsafe result.', src:'PostgreSQL transaction isolation documentation'}
  ],
  mistakes:[`Assuming the hotel database default level protects the duty rule.`, `Ignoring a Serializable retry after one manager change is stopped.`],
  interview:[`Trace the manager write skew and explain why different rows can still break one rule.`, `Name how the hotel app handles a stopped transaction.`],
  tryit:[{quiz:[
    {q:'Why can both managers leave under the snapshot example?', options:['They use one phone', 'There are three managers', 'The hotel has no database', 'They write different rows after reading the same old view'], answer:3, why:'Neither write directly conflicts, but together they break the rule.'},
    {q:'What may Serializable do to protect the duty rule?', options:['Stop one overlapping transaction', 'Delete both managers', 'Skip the database', 'Change the hotel name'], answer:0, why:'One transaction must retry or fail so the result is safe.'}
  ]}, {note:'Run the isolation playground and compare what overlapping hotel transactions can observe.', pg:'isolation'}],
  sources:[`PostgreSQL transaction isolation documentation`, `Berenson and others, A Critique of ANSI SQL Isolation Levels (1995)`]
},
{
  id:'locking', title:'Optimistic vs pessimistic concurrency control', minutes:8, tags:['optimistic locking','pessimistic locking','SELECT FOR UPDATE','version column','deadlock'],
  summary:'Optimistic control checks whether data changed before saving. Pessimistic control locks data before working. Both help stop one hotel change from silently overwriting another.',
  problem:`<h3>A small example</h3><p>Two hotel staff edit one room description. Meanwhile, two guests try to book its last available night.</p><ul><li>Staff edits may take minutes.</li><li>A room booking should finish quickly.</li><li>Conflicting changes must be noticed.</li></ul><p>When should the app check for a conflict, and when should it lock first?</p>`,
  intuition:`Optimistic editing is writing on separate copies and checking before filing yours. Pessimistic editing is reserving the one folder first, so others wait their turn.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the two room-description editors first.</p>',
    steps:[
      {icon:'📖', title:'Both read version 12', text:'Each staff member opens the same room description and its version number.'},
      {icon:'✍️', title:'A saves first', text:'A changes the description. The database saves version 13.'},
      {icon:'⚠️', title:'B detects a conflict', text:'B tries to save against version 12. The database finds no matching version and asks B to review again.'},
      {icon:'🔒', title:'Lock short critical work', text:'For the last room, the app may lock the room row while it confirms one booking.'},
      {icon:'🧮', title:'Use one safe update when possible', text:'A single update can reduce room count only if it remains above zero.'}
    ],
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Shared folder', 'Hotel database'], [['Check whether the page changed before filing', 'Optimistic version check.'], ['Reserve the folder before editing', 'Pessimistic lock.']])}</div><div class="callout tip"><b>Important point</b><p>Keep locks short. A person editing a form should not block every other editor for minutes.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Hotel action', 'Useful choice'], [['Edit a room description', 'Version check and show a conflict.'], ['Book the last room', 'Short lock or conditional update.'], ['Reduce available count by one', 'One conditional database statement.']])}</div>`,
    diagram:{title:'Two staff edit one room description', w:740, h:220, alt:'Two editors read version 12. A saves version 13. B sees a conflict instead of silently replacing A.',
      nodes:[{id:'a', type:'client', label:'Editor A', x:90, y:60}, {id:'b', type:'client', label:'Editor B', x:90, y:170}, {id:'db', type:'db', label:'Room #7', sub:'version 12', x:470, y:115, w:150}],
      edges:[{from:'a', to:'db'}, {from:'b', to:'db'}],
      steps:[
        {note:'Both staff read version 12 of room #7.', flow:[['a', 'db', 'read'], ['b', 'db', 'read']], parallel:true},
        {note:'A saves first. The room description becomes version 13.', flow:[['a', 'db', 'save v13'], ['db', 'a', 'saved']], sub:{db:'version 13'}, hl:['a']},
        {note:'B tries to save against version 12. The check finds a conflict.', flow:[['b', 'db', 'save v12?'], ['db', 'b', 'conflict']], hl:['b']},
        {note:'B reloads version 13 and decides whether to apply their change.', flow:[['b', 'db', 'reload v13']], hl:['b']}
      ]},
    deep:`<h4>The numbers</h4><p>Say 3 rooms are left and 5 guests book at once. Each runs a single update: reduce the count by 1 only where the count is above 0. The first 3 changes 1 row each. The last 2 change 0 rows, so the app tells them the rooms are gone.</p><p>Now say the booking lock is held for 20 ms. One room can handle 1,000 ÷ 20 = 50 bookings a second. A staff form locked for 5 minutes holds the row for 300,000 ms. That is 300,000 ÷ 20 = 15,000 times longer.</p><h4>When it goes wrong</h4><p>When two transactions deadlock, the database must break the tie by aborting one. PostgreSQL waits 1 second by default before it looks for a deadlock. The app should retry the aborted transaction, and a short transaction makes a deadlock less likely.</p>`
  },
  tradeoffs:{use:[`For slow room-description edits, use a version check so staff do not hold locks while typing.`, `For last-room booking, use a short lock or one conditional update.`], avoid:[`Do not silently overwrite A’s room edit with B’s old version.`, `Do not hold a room lock while a guest fills a form.`], alt:[`If one conditional update expresses the room rule, use it before adding a longer lock.`]},
  real:[
    {co:'PostgreSQL', tier:'confirmed', text:'PostgreSQL documents row locks and conditional updates for concurrent changes.', src:'PostgreSQL explicit locking documentation'}
  ],
  mistakes:[`Saving B’s old room version without a conflict check.`, `Holding a last-room lock while a guest thinks about payment.`],
  interview:[`Compare version checks and short locks for two hotel actions.`, `Explain a conditional update for the last room.`],
  tryit:[{quiz:[
    {q:'What happens when B saves against version 12 after A created version 13?', options:['Both edits are always merged', 'B gets a conflict', 'A is silently erased', 'The database disappears'], answer:1, why:'The version check rejects an outdated edit.'},
    {q:'Why keep a last-room lock short?', options:['It hides the hotel', 'It speeds up typing', 'Other guests wait while it is held', 'It changes the room name'], answer:2, why:'Long locks make other booking requests wait.'}
  ]}, {note:'Compare version retries and lock waiting as more guests update the same room row.', mount:host => lockSim(host)}],
  sources:[`PostgreSQL explicit locking documentation`]
},
{
  id:'replication', title:'Replication: leader-follower, multi-leader, leaderless', minutes:12, tags:['replication','leader','follower','replica lag','failover','quorum','multi-leader'],
  summary:'Replication keeps database copies on several machines. A leader may accept writes while followers copy them. Copies help reads and failures, but replication lag can show old hotel data.',
  problem:`<h3>A small example</h3><p>A guest changes a hotel booking, then refreshes the page.</p><ul><li>The main database accepted the change.</li><li>A second database copy is still catching up.</li><li>The refreshed page shows the old dates.</li></ul><p>How can the app use copies without misleading the guest?</p>`,
  intuition:`A hotel front desk updates the master reservation book. Other desks copy it soon after. Ask one of them too early and it may still show the old stay.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one changed booking through three database copies.</p>',
    steps:[
      {icon:'✍️', title:'Write to the leader', text:'The hotel app saves the new booking dates on one database that accepts writes.'},
      {icon:'📋', title:'Followers copy the change', text:'Other databases copy that write. A follower can be briefly behind the leader.'},
      {icon:'👀', title:'Avoid an old refresh', text:'After a guest edits, read from the leader or wait until a follower has that change.'},
      {icon:'🛟', title:'Handle leader failure', text:'A caught-up follower can take over when the leader stops. The old leader must not keep accepting writes.'},
      {icon:'🌍', title:'Compare other shapes', text:'Multi-leader allows several writers but needs conflict rules. Leaderless writes to several copies and reads from them.'}
    ],
    diagram:{title:'A changed booking reaches followers', w:760, h:270, alt:'The hotel booking leader accepts a date change. One follower lags, and another can take over after a failure.',
      nodes:[{id:'c', type:'client', label:'App', x:80, y:135}, {id:'l', type:'db', label:'Leader', sub:'log pos 1042', x:340, y:135}, {id:'f1', type:'db', label:'Follower 1', sub:'pos 1042', x:600, y:60}, {id:'f2', type:'db', label:'Follower 2', sub:'pos 1039 (lag)', x:600, y:210}],
      edges:[{from:'c', to:'l'}, {from:'l', to:'f1'}, {from:'l', to:'f2'}, {from:'c', to:'f2', curve:.2, dashed:true}],
      steps:[
        {note:'The guest changes booking dates on the leader.', flow:[['c', 'l', 'new dates'], ['l', 'c', 'saved']], sub:{l:'log pos 1043'}, hl:['l']},
        {note:'Followers copy the change. Follower 2 is still behind.', flow:[['l', 'f1', 'change 1043'], ['l', 'f2', 'older']], sub:{f1:'pos 1043'}, parallel:true},
        {note:'Reading Follower 2 now shows the guest old dates.', flow:[['c', 'f2', 'read'], ['f2', 'c', 'old dates']], status:{f2:'hot'}, hl:['f2']},
        {note:'The leader stops. The most current follower may take over.', status:{l:'down', f2:'ok'}, sub:{f1:'NEW LEADER'}, hl:['f1']},
        {note:'The old leader must not accept writes when it returns.', flow:[['f1', 'f2', 'new changes']], hl:['f1', 'f2']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Reservation desks', 'Database copies'], [['Master book accepts the edit', 'Leader takes the write.'], ['Other desks copy the edit', 'Followers catch up later.'], ['Master desk closes', 'A current follower can take over.']])}</div><div class="callout tip"><b>Important point</b><p>A copy that is available may still be old. The app must know when current booking data matters.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Hotel read', 'Safer choice'], [['Guest refreshes after an edit', 'Read the leader or a caught-up follower.'], ['Public hotel description', 'A slightly delayed follower may be enough.'], ['Confirmed payment', 'Choose a write rule that meets the loss requirement.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the leader saves the new dates at 0 ms and the follower applies them at 200 ms. A refresh that reads the follower at 100 ms sees the old dates. One fix is to read from the leader for, say, 5 seconds after a guest edits.</p><p>Say waiting for all 3 followers is required and each is up 99.9% of the time. All three are up 0.999 × 0.999 × 0.999 ≈ 0.997. Writes would stall about 0.3% of the time, roughly 26 hours a year. Many setups wait for just 1 follower to avoid this.</p><h4>When it goes wrong</h4><p>Say the leader handles 150 writes a second and a follower is 2 seconds behind when the leader dies. 150 × 2 = 300 acknowledged writes are missing on the new leader. When the old leader returns, those writes must be thrown away or merged by hand.</p>`
  },
  tradeoffs:{use:[`For public hotel details, follower reads can share read work when brief delay is acceptable.`, `For a guest’s changed booking, route the next read to current data.`], avoid:[`Do not promise a booking survived failover if it was acknowledged before another copy received it.`, `Do not let two leaders accept conflicting room bookings.`], alt:[`For a small hotel app, one database and tested backups may be simpler before read copies are needed.`]},
  real:[
    {co:'GitHub', tier:'confirmed', text:'GitHub’s 2018 incident report describes the difficulty of reconciling writes after a database failover.', src:'GitHub Engineering, October 21 post-incident analysis (2018)'}
  ],
  mistakes:[`Sending a guest’s immediate refresh to a lagging follower.`, `Assuming an acknowledged async write has reached every follower.`],
  interview:[`Explain why a follower may show old hotel dates.`, `State how the app chooses a follower after leader failure.`],
  tryit:[{quiz:[
    {q:'Why can a guest see old booking dates after changing them?', options:['The room has no number', 'The browser changed the hotel', 'Every leader is read-only', 'A follower has not copied the write yet'], answer:3, why:'A follower may lag behind the leader.'},
    {q:'What can asynchronous copying risk after the leader fails?', options:['Losing a recent acknowledged write', 'Changing every room photo', 'A new city name', 'A faster booking always'], answer:0, why:'The leader may answer before another copy has the write.'}
  ]}, {note:'Change follower lag and copying mode, then read after a booking edit and stop the leader.', pg:'replication'}],
  sources:[`GitHub Engineering, October 21 post-incident analysis (2018)`]
},
{
  id:'sharding', title:'Sharding (partitioning)', minutes:12, tags:['sharding','partitioning','hash','range','directory','geo','hot shard','resharding'],
  summary:'Sharding splits records across database machines. A shard key chooses where each record lives. The key affects which hotel queries stay local and which need several machines.',
  problem:`<h3>A small example</h3><p>The hotel app’s booking database grows beyond one machine’s tested capacity.</p><ul><li>Guests book rooms at many hotels.</li><li>Availability checks focus on one hotel.</li><li>Reports ask about all hotels in a city.</li></ul><p>Should the app split records by guest, hotel, city, or another key?</p>`,
  intuition:`A large library uses branches. Put all books for one author in one branch and that author is easy to find. A citywide count may need every branch.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Try hotel ID as the key for room bookings.</p>',
    steps:[
      {icon:'🏨', title:'Keep one hotel together', text:'A shard key is the value used to choose a database machine. Hotel ID can keep its rooms and bookings together.'},
      {icon:'🔀', title:'Spread with a hash', text:'A hash turns hotel ID into a number that chooses one of several shards.'},
      {icon:'📏', title:'Compare a range split', text:'A range gives each shard a group of IDs. A busy range can overload one shard.'},
      {icon:'📒', title:'Consider a directory', text:'A directory can list which shard holds each hotel, making moves flexible but adding a lookup.'},
      {icon:'🌍', title:'Count cross-shard work', text:'A citywide report or one guest’s bookings at several hotels may need answers from several shards.'}
    ],
    diagram:{title:'Hotel bookings split by hotel ID', w:780, h:280, alt:'A router sends one hotel booking to one shard. A citywide question reaches all three shards.',
      nodes:[{id:'app', type:'service', label:'App + shard router', x:110, y:140, w:160}, {id:'s1', type:'db', label:'Shard 1', sub:'hash % 3 = 0', x:470, y:50}, {id:'s2', type:'db', label:'Shard 2', sub:'hash % 3 = 1', x:470, y:140}, {id:'s3', type:'db', label:'Shard 3', sub:'hash % 3 = 2', x:470, y:230}, {id:'an', type:'db', label:'Analytics copy', x:690, y:140, w:130}],
      edges:[{from:'app', to:'s1'}, {from:'app', to:'s2'}, {from:'app', to:'s3'}, {from:'s1', to:'an', dashed:true}, {from:'s2', to:'an', dashed:true}, {from:'s3', to:'an', dashed:true}],
      steps:[
        {note:'Hotel 42 routes to Shard 2. Its room bookings can be checked there.', flow:[['app', 's2', 'hotel 42'], ['s2', 'app']], hl:['s2']},
        {note:'A citywide question reaches all three shards and combines their answers.', flow:[['app', 's1', 'city?'], ['app', 's2', 'city?'], ['app', 's3', 'city?']], parallel:true},
        {note:'A very popular hotel can make one shard unusually busy.', status:{s3:'hot'}, flow:[['app', 's3'], ['app', 's3'], ['app', 's3']], parallel:true, hl:['s3']},
        {note:'A separate report copy can answer broad questions without repeating them on every booking shard.', status:{s3:'ok'}, flow:[['s1', 'an'], ['s2', 'an'], ['s3', 'an']], parallel:true, hl:['an']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Library branches', 'Hotel data'], [['Keep one author together', 'Keep one hotel’s rooms together.'], ['Ask every branch for a citywide count', 'Ask every shard for a broad report.'], ['Move books when one branch fills', 'Move hotels when one shard fills.']])}</div><div class="callout tip"><b>Important point</b><p>The shard key should support the hotel app’s most important read and write path.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Hotel need', 'Key choice'], [['Correct availability for one hotel', 'Hotel ID keeps related rooms together.'], ['Many bookings at one very popular hotel', 'Plan for a hot hotel shard.'], ['Reports across all hotels', 'Use a separate report path.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Take 20 hash values, 0 to 19. With 4 shards, a key goes to the remainder of its value divided by 4. With 5 shards, it is the remainder when divided by 5. A key keeps its owner only for values 0, 1, 2 and 3. That is 4 of 20, so 80% of keys move when we add a fifth shard.</p><p>Now say we create 1,024 small logical shards first and spread them over 4 machines, 256 each. A fifth machine takes about 1,024 ÷ 5 ≈ 205 logical shards. No key is rehashed.</p><h4>When it goes wrong</h4><p>A citywide report asks 4 shards and waits for the slowest. Say each shard is slow 1% of the time. The report is slow 1 − 0.99⁴ ≈ 3.9% of the time, four times worse than one shard. Also, one very popular hotel can exceed its shard's fair share. Say it gets 30% of bookings while an even split is 25%.</p>`
  },
  tradeoffs:{use:[`For hotel availability, hotel ID can keep one hotel’s booking decision local.`, `Hash routing can spread many hotels across machines.`], avoid:[`Do not choose guest ID if every room check must inspect all guests for a hotel.`, `Do not shard before measuring whether one well-indexed machine can still serve the app.`], alt:[`Move broad reports off the booking path before splitting the original booking records.`]},
  real:[
    {co:'Notion', tier:'confirmed', text:'Notion described splitting workspace data across logical and physical PostgreSQL shards.', src:'Notion Engineering, Herding elephants (2021)'}
  ],
  mistakes:[`Choosing guest ID without checking the hotel availability query.`, `Adding shards without planning how hotels move later.`],
  interview:[`Name hotel ID as a possible key and explain the local room query.`, `Describe the cost of a citywide query.`],
  tryit:[{quiz:[
    {q:'Which key can keep one hotel’s rooms and bookings together?', options:['Guest phone model', 'Hotel ID', 'Random browser color', 'Current second'], answer:1, why:'A room availability check can stay on one hotel shard.'},
    {q:'Why does a citywide report need more work with hotel-ID shards?', options:['It removes the hotel', 'It has no rooms', 'It asks several shards', 'It changes the guest password'], answer:2, why:'Hotels in one city can live on different shards.'}
  ]}, {note:'Try hotel-ID hash routing and range routing. Add a shard and watch movement and hot spots.', pg:'sharding'}],
  sources:[`Notion Engineering, Herding elephants (2021)`]
},
{
  id:'consistent-hashing', title:'Consistent hashing and virtual nodes', minutes:9, tags:['consistent hashing','virtual nodes','hash ring','rebalancing'],
  summary:'Consistent hashing places hotel keys and servers on one circle. Each key belongs to the next server clockwise. Virtual nodes give each server several positions for smoother balance.',
  problem:`<h3>A small example</h3><p>The hotel app adds a fifth data server to four existing servers.</p><ul><li>Hotel IDs decide where records live.</li><li>The old rule divides a hash by the server count.</li><li>Changing the count moves many hotel IDs.</li></ul><p>Can the app add capacity while moving fewer hotels?</p>`,
  intuition:`Place hotel cards and server desks around a round table. Each card goes to the next desk clockwise. A new desk only takes cards in the short arc before it.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Watch hotel IDs move when server D joins a ring.</p>',
    steps:[
      {icon:'⭕', title:'Place servers on a ring', text:'A hash, a repeatable number from a key, gives each server a position on a circle.'},
      {icon:'🏨', title:'Place each hotel', text:'Hash hotel ID and walk clockwise to the next server. That server holds the hotel records.'},
      {icon:'➕', title:'Add a server', text:'D takes keys in the arc before it. Keys in other arcs keep their owners.'},
      {icon:'➖', title:'Remove a server', text:'Its keys move to the next server clockwise.'},
      {icon:'🔢', title:'Use virtual nodes', text:'Give each physical server several ring positions so one uneven arc matters less.'}
    ],
    diagram:{title:'Adding D moves one hotel-key arc', w:700, h:280, alt:'Hotel keys belong to the next server clockwise. Adding D moves only keys in its new arc.',
      nodes:[{id:'A', type:'cache', label:'Server A', x:350, y:40}, {id:'B', type:'cache', label:'Server B', x:600, y:180}, {id:'C', type:'cache', label:'Server C', x:100, y:180}, {id:'D', type:'cache', label:'Server D', sub:'new', x:200, y:60, hidden:true}, {id:'k1', type:'client', label:'hotel:9', x:470, y:250, w:130}, {id:'k2', type:'client', label:'hotel:7', x:110, y:90, w:130}],
      edges:[{from:'A', to:'B', curve:.2}, {from:'B', to:'C', curve:.25}, {from:'C', to:'A', curve:.2}, {from:'k1', to:'B', dashed:true}, {from:'k2', to:'A', dashed:true}, {from:'C', to:'D', curve:.1}, {from:'D', to:'A', curve:.1}],
      steps:[
        {note:'Hotel 9 belongs to B, the next server clockwise.', flow:[['k1', 'B', 'owner']], hl:['B']},
        {note:'Hotel 7 belongs to A before D joins.', flow:[['k2', 'A', 'owner']], hl:['A']},
        {note:'D joins between C and A. Hotel 9 stays with B.', reveal:['D'], hideEdges:[['C', 'A']], hl:['D']},
        {note:'Hotel 7 moves to D because D is now its next server.', flow:[['k2', 'D', 'new owner']], hl:['D']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Round table', 'Hotel data'], [['Card goes to next desk clockwise', 'Hotel key goes to next server.'], ['New desk takes nearby cards', 'New server takes nearby keys.'], ['One desk has several seats', 'Virtual nodes spread its positions.']])}</div><div class="callout tip"><b>Important point</b><p>A ring reduces key movement when servers change, but several positions per server help balance the load.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Change', 'Keys that move'], [['Add D', 'Keys in D’s new arc.'], ['Remove A', 'A’s keys move clockwise.'], ['Give A more virtual positions', 'A can hold a larger share.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the app holds 1,000,000 hotel keys. Going from 4 to 5 servers with mod 4 and mod 5 moves about 800,000 keys. A ring moves about 1,000,000 ÷ 5 = 200,000.</p><p>Now a server fails. Without virtual nodes, the next server clockwise inherits all of its 20% share, so a server holding 20% jumps to 40%. With 100 virtual nodes each, the 20% spreads over 4 survivors. Each gains about 5% and goes from 20% to 25%.</p><h4>How it works inside</h4><p>The ring is a sorted list of positions. Say 5 servers × 100 virtual nodes = 500 positions. A lookup does a binary search, which needs about 9 steps, because 2⁹ = 512.</p><h4>When it goes wrong</h4><p>If the app keeps 3 copies, it walks clockwise and skips positions owned by a machine it already chose. Otherwise all 3 copies could land on one machine.</p>`
  },
  tradeoffs:{use:[`For hotel-ID routing, use a ring when servers join or leave and movement should stay limited.`, `Use virtual nodes when server positions would otherwise leave uneven hotel counts.`], avoid:[`Do not treat the ring as a fix for one hotel that receives far more bookings than others.`, `Do not move live bookings without checking the old and new owners during migration.`], alt:[`A directory can explicitly map a small set of very large hotels to servers.`]},
  real:[
    {co:'Apache Cassandra', tier:'confirmed', text:'Cassandra documents multiple ring positions per node to spread data more evenly.', src:'Apache Cassandra documentation'}
  ],
  mistakes:[`Assuming one ring position per server always balances hotels evenly.`, `Assuming the ring solves one unusually popular hotel.`],
  interview:[`Draw hotel 7 and hotel 9 on a ring before and after D joins.`, `Explain why virtual nodes smooth the spread.`],
  tryit:[{quiz:[
    {q:'When D joins the ring, which hotel keys change owner?', options:['Every hotel key', 'Only deleted hotels', 'No keys ever', 'Keys in D’s new arc'], answer:3, why:'Other arcs keep their owners.'},
    {q:'What do virtual nodes add?', options:['Several positions per physical server', 'A new hotel room', 'A different booking price', 'One fixed URL'], answer:0, why:'Several positions smooth uneven arcs.'}
  ]}, {note:'Add and remove hotel data servers on the ring. Compare movement with simple modulo routing.', pg:'hash-ring'}],
  sources:[`Apache Cassandra documentation`, `Karger and others, Consistent Hashing (1997)`]
},
{
  id:'connection-pooling', title:'Connection pooling', minutes:7, tags:['connection pool','PgBouncer','HikariCP','max_connections'],
  summary:'A connection pool keeps database connections open and lends them to requests. This avoids opening a new connection each time and keeps the database from handling too many at once.',
  problem:`<h3>A small example</h3><p>The hotel app adds servers for a holiday booking rush.</p><ul><li>120 app servers</li><li>10 database connections allowed from each</li><li>A database limit of 100 connections</li></ul><p>What happens if all 120 servers try to open their full pools?</p>`,
  intuition:`A taxi stand lends the same taxis to many passengers across a day. It does not buy a separate taxi for every passenger. The database also needs a manageable number of reusable connections.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Count possible connections, then reuse a smaller set.</p>',
    steps:[
      {icon:'🔌', title:'Count opened connections', text:'120 app servers × 10 connections each = 1,200 possible connections. The database allows only 100.'},
      {icon:'🔁', title:'Reuse app connections', text:'An app pool lends an open connection to a request, then takes it back when the database work finishes.'},
      {icon:'🚪', title:'Add a shared pooler', text:'A pooler between apps and database can serve many app connections using fewer database connections.'},
      {icon:'⏳', title:'Let excess work wait briefly', text:'Requests wait for a free connection instead of opening thousands on the database.'}
    ],
    diagram:{title:'Many hotel apps, fewer database connections', w:760, h:260, alt:'Hotel app instances send requests through a shared pooler that limits open database connections.',
      nodes:[{id:'a1', type:'service', label:'App ×40', sub:'pool 10 each', x:100, y:70, w:130}, {id:'a2', type:'service', label:'App ×80', sub:'more apps', x:100, y:190, w:130}, {id:'pb', type:'lb', label:'PgBouncer', sub:'transaction mode', x:370, y:130, w:150}, {id:'db', type:'db', label:'PostgreSQL', sub:'30 server conns', x:640, y:130, w:150}],
      edges:[{from:'a1', to:'pb'}, {from:'a2', to:'pb'}, {from:'pb', to:'db'}],
      steps:[
        {note:'App servers can hold 1,200 connections to the shared pooler.', flow:[['a1', 'pb', 'connection'], ['a2', 'pb', 'connection'], ['a2', 'pb', 'connection']], parallel:true, hl:['pb']},
        {note:'The pooler lends one of 30 database connections during a booking transaction.', flow:[['pb', 'db', 'booking']], hl:['db']},
        {note:'After work ends, that database connection can serve another request.', flow:[['pb', 'db', 'next'], ['pb', 'db', 'next']], parallel:true}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Taxi stand', 'Hotel database'], [['Passenger borrows a taxi', 'Request borrows a connection.'], ['Taxi returns for the next person', 'Connection returns to the pool.'], ['Only so many taxis are on the road', 'Database accepts a limited number of connections.']])}</div><div class="callout tip"><b>Important point</b><p>A larger pool is not free capacity. The database still has a limit on work it can run.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['If app servers grow', 'Check'], [['120 servers with 10 each', 'Could open 1,200 connections.'], ['Shared pooler uses 30 database connections', 'Requests reuse a smaller set.'], ['Wait becomes long', 'Measure queries and database capacity.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Opening a new connection means a network handshake, encryption setup and a login. Say that takes 30 ms and a query takes 5 ms. Without a pool, each request costs 35 ms instead of 5 ms, which is 7 times slower.</p><p>Many databases also pay memory for each connection. PostgreSQL runs one process per connection. Say each takes 10 MB. 1,200 connections × 10 MB = 12 GB spent before any query runs.</p><h4>When it goes wrong</h4><p>Say a booking holds its connection while it calls a payment service for 2 seconds. A pool of 30 then serves only 30 ÷ 2 = 15 bookings a second. Release the connection before the slow call.</p><p>A leaked connection, one never returned, shrinks the pool for good. After 30 leaks from a pool of 30, every request waits forever. That is why a wait limit matters.</p>`
  },
  tradeoffs:{use:[`For the hotel rush, reuse app connections and limit the database-side count with a pooler.`, `Measure waiting at the pool before increasing its size.`], avoid:[`Do not let 120 app servers each open ten direct database connections against a limit of 100.`, `Do not hold a connection while a guest thinks about a booking.`], alt:[`Reduce per-app pool size first if a shared pooler is unnecessary at the tested load.`]},
  real:[
    {co:'PgBouncer', tier:'confirmed', text:'PgBouncer documents reusing a smaller set of PostgreSQL connections for many clients.', src:'PgBouncer documentation'}
  ],
  mistakes:[`Multiplying app instances by pool size only after the database refuses connections.`, `Increasing pool size when slow queries are the real limit.`],
  interview:[`Calculate 120 × 10 before choosing a pool setting.`, `Compare open connections with actually busy queries.`],
  tryit:[{quiz:[
    {q:'How many connections can 120 app servers open with pools of 10?', options:['100', '1,200', '120', '10'], answer:1, why:'120 × 10 = 1,200 possible connections.'},
    {q:'What does a shared pooler reuse?', options:['Guest passwords', 'Room prices', 'Database connections', 'Hotel photos'], answer:2, why:'It lends a smaller set of database connections to many app requests.'}
  ]}, {note:'Set app instances to 120 and pool size to 10. Compare open and busy connections.', mount:host => poolCalc(host)}],
  sources:[`PgBouncer documentation`]
},
{
  id:'oltp-olap', title:'OLTP vs OLAP: warehouses, lakes, lakehouses, ETL vs ELT', minutes:10, tags:['OLTP','OLAP','column store','data warehouse','data lake','lakehouse','ETL','ELT'],
  summary:'OLTP handles short current-data changes such as one hotel booking. OLAP scans many past bookings for reports. Separate stores let large reports avoid slowing guest checkout.',
  problem:`<h3>A small example</h3><p>A hotel finance team asks for monthly revenue by city during a busy booking hour.</p><ul><li>Guests are making new bookings.</li><li>The report scans years of old bookings.</li><li>Both jobs use the same database today.</li></ul><p>How can the team get the report without delaying a guest’s booking?</p>`,
  intuition:`The front desk serves one guest at a time. An accountant studies years of receipts in a back office. Give the accountant copies so the desk keeps working.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Separate one guest booking from a report over many bookings.</p>',
    steps:[
      {icon:'🛎️', title:'OLTP serves one booking', text:'Online transaction processing reads and changes a few current rows quickly.'},
      {icon:'📋', title:'Copy data for reports', text:'A separate path moves booking facts to a reporting store. You will learn change pipelines in Module 7.'},
      {icon:'📊', title:'OLAP scans history', text:'Online analytical processing groups many old bookings by city and month.'},
      {icon:'🏬', title:'Choose a report home', text:'A data warehouse holds prepared tables, while a lake holds raw files. A lakehouse adds managed tables on those files.'},
      {icon:'🔄', title:'Choose the work order', text:'ETL cleans before loading. ELT loads first and cleans in the reporting store.'}
    ],
    diagram:{title:'Hotel reports away from booking checkout', w:800, h:260, alt:'The booking database serves guests. Copies move to a lake and warehouse where finance reads monthly totals.',
      nodes:[{id:'app', type:'service', label:'Booking app', x:90, y:80}, {id:'oltp', type:'db', label:'Booking DB', x:280, y:80, w:140}, {id:'copy', type:'queue', label:'Copy step', x:300, y:200, w:160}, {id:'lake', type:'db', label:'Data lake', sub:'raw bookings', x:520, y:200, w:140}, {id:'wh', type:'db', label:'Warehouse', sub:'report tables', x:700, y:120, w:130}, {id:'bi', type:'client', label:'Finance report', x:700, y:230, w:130}],
      edges:[{from:'app', to:'oltp'}, {from:'oltp', to:'copy'}, {from:'copy', to:'lake'}, {from:'lake', to:'wh'}, {from:'wh', to:'bi'}],
      steps:[
        {note:'A guest booking writes a few current rows.', flow:[['app', 'oltp', 'save booking']], hl:['oltp']},
        {note:'A separate step copies booking facts to raw files.', flow:[['oltp', 'copy', 'copy'], ['copy', 'lake', 'files']], hl:['lake']},
        {note:'Prepared report tables are built from those files.', flow:[['lake', 'wh', 'prepare']], hl:['wh']},
        {note:'Finance reads monthly city totals without scanning the booking database.', flow:[['bi', 'wh', 'city totals'], ['wh', 'bi']], hl:['bi']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Hotel work', 'Data work'], [['Front desk confirms one stay', 'OLTP changes a few rows.'], ['Accountant totals a year', 'OLAP scans many rows.'], ['Back office holds receipts', 'Separate reporting store.']])}</div><div class="callout tip"><b>Important point</b><p>Do not let a large history scan delay current bookings.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Store'], [['Confirm a room now', 'Booking database.'], ['Monthly revenue by city', 'Warehouse or lakehouse report tables.'], ['Keep raw booking files', 'Data lake.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say a booking row has 20 fields of 8 bytes each. That is 20 × 8 = 160 bytes. For 100,000,000 bookings, a row store reads 100,000,000 × 160 B = 16 GB to sum amounts by month. A column store reads just amount and date, 16 bytes per booking, which is 1.6 GB. That is 10 times less.</p><p>Compression helps more. A city column has only 100 different names. It can be stored as a 1-byte code, because 1 byte holds 256 values, instead of a 20-byte name.</p><h4>When it goes wrong</h4><p>Say the nightly copy runs at 2 AM. A finance report opened at 5 PM shows data 15 hours old.</p><p>ELT keeps the raw rows in the warehouse. If a cleaning rule turns out wrong, the team re-runs the cleaning without pulling data from the booking database again.</p>`
  },
  tradeoffs:{use:[`For hotel finance, send history scans to a separate reporting store.`, `Use the booking database for small current booking changes.`], avoid:[`Do not run a years-long booking scan on the database serving guests at peak time.`, `Do not promise fresh-to-the-second reports from a nightly copy.`], alt:[`For a small report, run it outside peak hours while measuring its effect on bookings.`]},
  real:[
    {co:'Google', tier:'confirmed', text:'Google’s Dremel paper describes reading selected columns for large analytical questions.', src:'Melnik and others, Dremel (2010)'}
  ],
  mistakes:[`Running the monthly report on the booking database during peak reservations.`, `Using an old finance report without saying when it was copied.`],
  interview:[`Separate the guest booking path from the city revenue report.`, `Explain why amount and date columns can answer the report.`],
  tryit:[{quiz:[
    {q:'Which job belongs on the OLTP booking database?', options:['Scan years of revenue', 'Build every city chart', 'Read all old photos', 'Confirm one room booking'], answer:3, why:'OLTP handles small current transactions.'},
    {q:'Why can a column store help a monthly revenue report?', options:['It reads only needed fields such as date and amount', 'It deletes bookings', 'It makes every write free', 'It needs no data'], answer:0, why:'The report can avoid reading unrelated booking fields.'}
  ]}, {note:'Compare bytes read for a hotel revenue report in a row store and a column store.', mount:host => rowColDemo(host)}],
  sources:[`Melnik and others, Dremel (2010)`]
},
{
  id:'storage-types', title:'Object, block and file storage; GFS/HDFS; backups and tiering', minutes:10, tags:['object storage','block storage','file storage','GFS','HDFS','backups','tiered storage'],
  summary:'Block storage gives a machine disk space for a database. File storage shares folders. Object storage keeps named files such as hotel photos. Backups protect against loss, and older files can move to cheaper tiers.',
  problem:`<h3>A small example</h3><p>Hotels upload room photos to the booking app. The first app server saves them on its own disk.</p><ul><li>A second app server cannot see those photos.</li><li>One disk failure could remove originals.</li><li>Old photos are rarely opened.</li></ul><p>Where should the photos live, and how should the app protect them?</p>`,
  intuition:`A private drawer belongs to one worker. A shared cabinet serves an office. A warehouse stores named boxes for many branches. You still need a separate backup if someone throws away a box.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one room photo from upload to an old archive.</p>',
    steps:[
      {icon:'💾', title:'Keep database disks', text:'Block storage acts like a disk for the hotel database machine and its small random reads.'},
      {icon:'📁', title:'Share folders when needed', text:'File storage lets several machines use familiar folders and file paths.'},
      {icon:'🖼️', title:'Store photos as objects', text:'Object storage keeps each room photo under a key that any app server can request.'},
      {icon:'🛡️', title:'Back up separately', text:'A copy in another place helps recover after deletion or corruption, but the app must test a restore.'},
      {icon:'❄️', title:'Move old photos', text:'Older photos can move to a cheaper storage tier when slower access is acceptable.'}
    ],
    diagram:{title:'Hotel photos shared and protected', w:760, h:260, alt:'A hotel app gets an upload address. A photo goes to object storage, can be served through a CDN, and older copies move to archive.',
      nodes:[{id:'c', type:'client', label:'Hotel app', x:80, y:130}, {id:'api', type:'service', label:'Upload API', x:260, y:50}, {id:'obj', type:'db', label:'Photo objects', sub:'shared', x:480, y:130, w:150}, {id:'cdn', type:'cdn', label:'CDN', x:260, y:220}, {id:'cold', type:'db', label:'Older tier', x:690, y:60, w:130}, {id:'bk', type:'db', label:'Separate backup', x:690, y:210, w:150}],
      edges:[{from:'c', to:'api'}, {from:'c', to:'obj'}, {from:'cdn', to:'obj'}, {from:'c', to:'cdn'}, {from:'obj', to:'cold', dashed:true}, {from:'obj', to:'bk', dashed:true}],
      steps:[
        {note:'The app gets a short-lived upload address for one hotel photo.', flow:[['c', 'api', 'upload?'], ['api', 'c', 'address']], hl:['api']},
        {note:'The hotel uploads the photo to shared object storage.', flow:[['c', 'obj', 'room photo']], hl:['obj']},
        {note:'A guest can receive a public photo through the CDN.', flow:[['c', 'cdn', 'photo?'], ['cdn', 'obj', 'fetch'], ['obj', 'cdn'], ['cdn', 'c']], hl:['cdn']},
        {note:'Older photos can move to a cheaper tier, while a separate backup supports recovery.', flow:[['obj', 'cold', 'move old'], ['obj', 'bk', 'backup']], parallel:true}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Office storage', 'Hotel app storage'], [['Private disk drawer', 'Block storage for one database machine.'], ['Shared file cabinet', 'File storage for shared paths.'], ['Warehouse of numbered boxes', 'Object storage for room photos.']])}</div><div class="callout tip"><b>Important point</b><p>A second live copy is not enough for recovery if a mistaken deletion reaches both copies.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Hotel data', 'Useful home'], [['Booking database', 'Block storage under the database.'], ['Room photos', 'Object storage with a separate backup.'], ['Old photo files', 'A cheaper tier after access slows.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the app holds 1,000,000 room photos of 2 MB each. That is 2,000,000 MB, or 2 TB. Say a hot tier costs ₹2 per GB each month and a cold tier costs ₹0.5. All hot is 2,000 × 2 = ₹4,000. If 1,800 GB is cold, it is 1,800 × 0.5 + 200 × 2 = ₹1,300. That saves ₹2,700 a month.</p><p>Restoring takes time. At 100 MB/s, 2,000,000 MB ÷ 100 = 20,000 seconds, about 5.6 hours.</p><h4>How it works inside</h4><p>HDFS splits files into blocks, 128 MB each by default. A 1 GB file becomes 8 blocks. With 3 copies of each, that is 24 stored blocks and 3 GB of disk.</p><h4>When it goes wrong</h4><p>Say backups run nightly at 2 AM and the disk dies at 1 AM. You lose 23 hours of changes.</p>`
  },
  tradeoffs:{use:[`For hotel room photos, object storage lets several app servers reach the same files.`, `Keep an independently recoverable copy and test restoring a deleted photo.`], avoid:[`Do not keep room photos only on one app server disk.`, `Do not call a live synchronized copy a complete backup.`], alt:[`Use shared file storage if an older hotel tool truly needs ordinary folders and paths.`]},
  real:[
    {co:'Google File System', tier:'confirmed', text:'The GFS paper describes splitting large files into chunks across storage machines.', src:'Ghemawat and others, The Google File System (2003)'},
    {co:'GitLab', tier:'confirmed', text:'GitLab’s 2017 incident report showed how an accidental deletion became worse when backups could not restore all data.', src:'GitLab database outage postmortem (2017)'}
  ],
  mistakes:[`Keeping every room photo only on an app server disk.`, `Never trying a restore from the hotel photo backup.`],
  interview:[`Choose block, file, or object storage for each hotel item.`, `Explain why a second live copy does not replace a tested backup.`],
  tryit:[{quiz:[
    {q:'Where should hotel room photos live so several app servers can reach them?', options:['A database connection pool', 'Shared object storage', 'Only one app server disk', 'A browser tab only'], answer:1, why:'Object storage gives the app a shared file home.'},
    {q:'What proves a hotel photo backup can help after deletion?', options:['A longer file name', 'A faster CDN', 'A successful restore test', 'A second live copy only'], answer:2, why:'A backup is useful when the app can recover the lost photo.'}
  ]}, {note:'Move older hotel photo data between storage tiers and compare the estimated cost and restore delay.', mount:host => tierCalc(host)}],
  sources:[`Ghemawat and others, The Google File System (2003)`, `GitLab database outage postmortem (2017)`]
}
];

SDA.register({
  kind:'module', id:'databases', order:5, level:'intermediate', icon:'🗄️', title:'Databases & Storage',
  summary:'Use a hotel booking app to choose data shapes, protect concurrent bookings, and grow storage. Learn how indexes, copies, shards, reports, and backups change the design.',
  outcomes:['Choose a database family from hotel reads and writes', 'Explain an index and two storage engine paths', 'Protect the last room from conflicting bookings', 'Reason about lagging copies and hotel-ID shards', 'Separate bookings, reports, photos, and recoverable backups'],
  lessons,
  quiz:[
    {q:'Which family fits hotel bookings that link guests, rooms, and dates?', options:['Only a photo store', 'Only a text file', 'A browser tab', 'A relational SQL database'], answer:3, why:'Bookings connect related records and need clear rules.'},
    {q:'What should happen if a ₹500 transfer crashes before commit?', options:['Only guest debit remains', 'Neither wallet change remains', 'Only hotel credit remains', 'Both double'], answer:1, why:'Atomicity keeps the changes together.'},
    {q:'Which index order fits city, room type, then a price range?', options:['Price, city, type', 'Only photo URL', 'City, type, price', 'No index can help'], answer:2, why:'Equal filters lead before the price range.'},
    {q:'Where does an LSM engine first hold recent sorted writes?', options:['Only a CDN', 'A room photo', 'A browser cookie', 'A memtable'], answer:3, why:'The memtable holds recent writes before sorted disk files are created.'},
    {q:'Why keep the paid room price on an old booking receipt?', options:['It is a historical fact', 'It makes today’s price fixed', 'It removes the hotel', 'It avoids every index'], answer:0, why:'The receipt records the amount agreed at booking time.'},
    {q:'Why can both night managers leave under a snapshot example?', options:['They use one laptop', 'They update different rows after reading the same old view', 'There are three managers', 'The hotel has no room IDs'], answer:1, why:'Their combined changes break the rule without touching the same row.'},
    {q:'What tells editor B that room version 12 is old after A saved version 13?', options:['A new photo', 'A second city', 'An optimistic version check', 'A longer TTL'], answer:2, why:'The outdated update matches no current version.'},
    {q:'Why can a guest refresh a changed booking and see old dates?', options:['The guest changed hotels', 'Every database is empty', 'The browser changed time', 'A follower has not copied the write yet'], answer:3, why:'A follower can lag behind the leader.'},
    {q:'Which shard key can keep one hotel’s rooms together?', options:['Random page title', 'Hotel ID', 'Current second', 'Phone color'], answer:1, why:'Hotel ID keeps that hotel’s booking data local.'},
    {q:'When server D joins a balanced hash ring, which keys move?', options:['Every hotel key', 'Keys in D’s new arc', 'Only guest passwords', 'No keys ever'], answer:1, why:'Other arcs keep their owners.'},
    {q:'How many connections can 120 app servers open with pools of 10?', options:['10', '120', '1,200', '100'], answer:2, why:'120 × 10 = 1,200 possible connections.'},
    {q:'Where should finance scan years of hotel revenue?', options:['On the booking primary at peak', 'On a buyer phone', 'Inside every booking transaction', 'In a separate reporting store'], answer:3, why:'Large scans should not delay current bookings.'},
    {q:'What shows a hotel photo backup can recover a deleted file?', options:['A shorter photo name', 'A faster index', 'A successful restore test', 'A second live copy only'], answer:2, why:'A backup must be usable when an original is lost.'},
    {type:'scenario', q:'Two guests try for the last room at once. What must the hotel app do?', answer:'<ol><li>Keep room availability and the booking decision together in one safe database operation.</li><li>Use a short lock or a conditional update that succeeds for only one guest.</li><li>Confirm the winner and clearly reject the other request.</li><li>Do not decide from an old follower read alone.</li></ol>'},
    {type:'scenario', q:'The hotel app needs monthly city revenue and room photos. Where should each live?', answer:'<p>Keep current bookings in the transaction database. Copy booking facts to a separate reporting store for monthly totals. Put room photos in shared object storage and keep a tested backup that can restore a deleted photo.</p>'}
  ],
  cheatsheet:[
    {h:'🧭 Choose data shape', items:['List the hotel app’s reads and writes first.', 'Related bookings fit SQL tables.', 'One-key and whole-document reads may suit other shapes.', 'Name which store holds the original booking.']},
    {h:'🔒 Keep booking rules', items:['ACID groups important changes into one transaction.', 'A view count may catch up later.', 'Serializable can stop unsafe overlapping transactions.', 'A version check catches an old room edit.', 'A short lock or conditional update protects the last room.']},
    {h:'📇 Find and store rows', items:['An index helps reads but adds write and storage cost.', 'A composite index starts with its first column.', 'A B-tree keeps sorted pages ready for reads.', 'An LSM engine accepts writes in memory, then merges sorted files.']},
    {h:'🔁 Grow hotel data', items:['A follower can show old booking dates until it catches up.', 'Shards split hotels across machines by a key.', 'Hotel ID can keep one hotel’s rooms together.', 'A hash ring limits movement when servers join.', 'A pooler reuses fewer database connections.']},
    {h:'📊 Keep reports separate', items:['OLTP serves one current booking.', 'OLAP scans booking history for reports.', 'A warehouse holds prepared report tables.', 'A lake holds raw files.', 'ETL cleans before loading. ELT loads before cleaning.']},
    {h:'🖼️ Protect files', items:['Block storage acts as a disk for a database machine.', 'File storage offers shared folders.', 'Object storage holds named room photos.', 'A live synchronized copy does not replace a tested backup.', 'Move old photos to cheaper tiers when access slows.']}
  ],
  glossary:[
    {term:'SQL', aka:['SQL database'], def:'A language for asking questions of data stored in related tables. Example: SELECT * FROM bookings WHERE hotel_id = 7 lists every booking for hotel 7.'},
    {term:'NoSQL', def:'A broad name for databases that do not use the traditional table-and-join model. Example: a key-value store or a document store.'},
    {term:'Relational database', aka:['relational databases'], def:'A database that stores data in tables and links rows through keys. Example: a bookings table links to a guests table by guest ID.'},
    {term:'Key-value store', def:'A database that finds one value by a known key, like a dictionary. Example: the key room:305 gives that room’s current price.'},
    {term:'Document store', aka:['document database'], def:'A database that keeps one self-contained object, with all its fields, as a single record. Example: one document holds a hotel’s name, address and room list.'},
    {term:'Transaction', aka:['transactions'], def:'A group of database changes that succeed or fail together. Example: booking a room and charging the card are saved as one unit.'},
    {term:'ACID', def:'Four promises of a transaction: atomicity (all or nothing), consistency (the rules hold), isolation (transactions do not disturb each other) and durability (saved changes survive a crash). Example: a failed payment leaves no half-made booking.'},
    {term:'BASE', def:'An approach that lets copies differ for a short time and settle on the same answer soon after. Example: a new review may show on one server a few seconds before another.'},
    {term:'Eventual consistency', aka:['eventually consistent'], def:'If no new changes arrive, all copies end up with the same value. Example: after you edit your profile, other regions show the new name within a few seconds.'},
    {term:'Write-ahead log', aka:['WAL'], def:'A record of each change, written to disk before the data itself changes, so the database can recover after a crash. Example: after a power cut, the database replays the log to finish saved changes.'},
    {term:'Index', aka:['indexes', 'indices'], def:'An extra structure that helps the database find rows without reading every row, like the index at the back of a book. Example: an index on guest_id finds one guest’s bookings among 10 million rows quickly.'},
    {term:'B-tree', aka:['B+tree', 'B-trees'], def:'A sorted tree of pages that supports exact lookups and range reads. Example: finding all bookings between two dates.'},
    {term:'Composite index', def:'An index sorted by several columns in a chosen order. Example: an index on (city, date) finds the hotels in one city on one date quickly.'},
    {term:'Covering index', def:'An index that holds every field a query needs, so the database does not read the table row. Example: an index on (hotel_id, price) answers “prices for hotel 7” by itself.'},
    {term:'Hash index', def:'An index that is good for exact matches but not for ranges. Example: find booking 8841, but not the bookings between 8000 and 9000.'},
    {term:'LSM-tree', aka:['LSM'], def:'A storage design that collects writes in memory and merges sorted files later, which makes writes fast. Example: many bookings per second are first added to memory.'},
    {term:'Memtable', def:'The sorted area in memory that holds recent writes in an LSM tree. Example: new bookings sit here before they are written to disk.'},
    {term:'SSTable', def:'A sorted, read-only file on disk, written from the memtable. Example: every few seconds the memtable becomes a new SSTable.'},
    {term:'Compaction', def:'Background work that merges sorted files and throws away old versions. Example: three small files with old prices are merged into one file with the current prices.'},
    {term:'Normalization', def:'Keeping one current copy of each fact and linking other records to it. Example: a guest’s phone number is stored once in the guests table, not copied into every booking.'},
    {term:'Denormalization', def:'Keeping an extra copy of a fact on purpose, to make a read easier. Example: storing the hotel name inside each booking so the booking list needs no join.'},
    {term:'MVCC', aka:['multi-version concurrency control'], def:'Multi-version concurrency control: the database keeps older versions of a row so readers see a steady view while writers work. Example: a report reads yesterday’s version while a booking updates the row.'},
    {term:'Isolation level', aka:['isolation levels'], def:'A setting for what overlapping transactions can see of each other’s work. Example: a stricter level stops you from reading another transaction’s unsaved change.'},
    {term:'Snapshot isolation', def:'Each transaction reads a stable snapshot of the data from one moment. Example: a report that runs for a minute sees the same bookings from start to finish.'},
    {term:'Serializable', def:'The strictest isolation. The result is the same as if transactions ran one at a time. Example: two people cannot both book the last room.'},
    {term:'Write skew', def:'Two transactions each read the same data and then change different rows, and together they break a rule. Example: two clerks each see 2 open rooms and each hold one for staff, so the rule “keep 1 room open” is broken.'},
    {term:'Optimistic locking', aka:['optimistic control', 'optimistic concurrency'], def:'Do not lock. Check at save time whether someone else changed the data, and retry if they did. Example: a booking is at version 4, so the save only works if the row is still at version 4.'},
    {term:'Pessimistic locking', aka:['pessimistic control'], def:'Lock the data before changing it, so other writers must wait. Example: lock room 305 while one guest finishes booking it.'},
    {term:'Deadlock', aka:['deadlocks'], def:'Two transactions each wait for a lock the other holds, so neither can go on. Example: one locks room A then room B, while the other locks room B then room A.'},
    {term:'Dirty read', def:'Reading another transaction’s change that is not saved yet and may be undone. Example: you see a room as booked, then that booking is cancelled.'},
    {term:'Non-repeatable read', aka:['non-repeatable reads'], def:'Reading the same row twice in one transaction and getting different values. Example: a room’s price changes between your two reads.'},
    {term:'Phantom read', aka:['phantom', 'phantoms', 'phantom reads'], def:'Running the same range query twice and finding new rows the second time. Example: a search for open rooms returns 3 rooms, then 4.'},
    {term:'Replication', def:'Keeping copies of data on more than one machine. Example: every booking is also written to two other servers.'},
    {term:'Replica', aka:['replicas', 'read replica', 'read replicas'], def:'A copy of a database on another machine. Example: a read replica answers search queries so the main database has less to do.'},
    {term:'Leader', aka:['leaders'], def:'The database copy that accepts writes. Example: all bookings are written to the leader.'},
    {term:'Follower', aka:['followers'], def:'A copy that receives changes from the leader. Example: a follower answers read-only searches.'},
    {term:'Replication lag', aka:['replica lag'], def:'The delay before a follower receives a change from the leader. Example: a guest cancels, but the search page still shows the room as booked for 2 seconds.'},
    {term:'Multi-leader', aka:['multi-leader replication'], def:'A setup where more than one copy accepts writes, so it needs a way to settle conflicting changes. Example: two hotel offices update the same room at the same moment.'},
    {term:'Failover', def:'Switching to a working copy when the leader stops. Example: the follower with the latest data becomes the new leader within 30 seconds.'},
    {term:'Sharding', aka:['partitioning', 'sharded', 'shards'], def:'Splitting data across machines by a key, so each machine holds only part of it. Example: hotels A to M on server 1 and hotels N to Z on server 2.'},
    {term:'Shard key', aka:['shard keys'], def:'The value used to decide which shard holds a record. Example: the hotel ID decides which server holds that hotel’s bookings.'},
    {term:'Hot shard', aka:['hot shards'], def:'One shard that gets far more work than the others. Example: a famous hotel on one server gets 100 times the bookings of the rest.'},
    {term:'Consistent hashing', aka:['hash ring'], def:'A way to place keys on a ring of servers so that adding or removing a server moves only a few keys. Example: adding a fifth server moves about 1 in 5 keys, not all of them.'},
    {term:'Virtual nodes', aka:['vnodes'], def:'Several positions on the ring given to one real server, to spread load more evenly. Example: each of 5 servers owns 100 spots on the ring.'},
    {term:'Connection pool', aka:['connection pooling', 'connection pools'], def:'A set of open database connections that requests borrow and return. Example: 20 connections are shared by 500 app requests.'},
    {term:'OLTP', def:'Online transaction processing: many small reads and writes on current data. Example: booking rooms and updating availability.'},
    {term:'OLAP', def:'Online analytical processing: big questions over lots of history. Example: monthly hotel revenue by city.'},
    {term:'Data warehouse', aka:['data warehouses'], def:'A database made for reports, with prepared tables for analysis. Example: finance reads it to see revenue by month.'},
    {term:'Data lake', def:'A store of raw data files that reporting tools can read. Example: all raw booking logs saved as cheap files.'},
    {term:'Lakehouse', def:'Managed tables built on top of data lake files, so they work like a warehouse. Example: analysts run SQL on files that sit in cheap storage.'},
    {term:'ETL', def:'Extract, transform, load: clean the data first, then load it into the reporting store. Example: fix date formats, then load the bookings into the warehouse.'},
    {term:'ELT', def:'Extract, load, transform: load the raw data first, then clean it inside the reporting store. Example: load raw bookings, then run SQL to clean them.'},
    {term:'Object storage', aka:['object store'], def:'Storage where each whole file is saved and found by its key. Example: hotel photos stored under keys like hotels/7/lobby.jpg.'},
    {term:'Block storage', def:'Disk-like storage that a machine uses directly, for example for a database. Example: the database’s data files sit on a block volume.'},
    {term:'File storage', def:'Storage shared by several machines through folders and paths. Example: a shared folder of reports that many servers can open.'},
    {term:'Backup', aka:['backups'], def:'A copy of data kept safe so you can recover from a mistake or a disaster. Example: nightly copies let you restore data that was deleted by accident.'},
    {term:'Column store', aka:['column stores', 'columnar'], def:'A database that stores each column together, so reports that read a few columns are fast. Example: summing the price column without reading guest names.'},
    {term:'Wide-column store', aka:['wide-column'], def:'A database that groups data into rows with many flexible columns, spread across machines. Example: Cassandra.'},
    {term:'Write amplification', def:'Writing more data to disk than the app actually changed. Example: one 100-byte update can cause megabytes of rewriting while files are merged.'}
  ],
  sources:['Martin Kleppmann, Designing Data-Intensive Applications', 'Berenson and others, A Critique of ANSI SQL Isolation Levels (1995)', 'Chang and others, Bigtable (2006)', 'Ghemawat and others, The Google File System (2003)', 'Melnik and others, Dremel (2010)', 'PostgreSQL documentation', 'Notion Engineering, Herding elephants (2021)']
});
} catch(e){ console.error('[SDA] Module "databases" failed to load', e); window.SDA && SDA.errors.push({id:'databases', error:e}); }
})();
