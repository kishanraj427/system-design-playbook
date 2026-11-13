
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
    out.append(h2(h.code('sql', `CREATE INDEX idx ON products (${cols.join(', ')});

SELECT ${P.sel === 'cover' ? 'city, category, price' : '*'} FROM products
WHERE ${[P.city ? "city = 'Pune'" : null, P.cat ? "category = 'shoes'" : null, P.price === 'eq' ? 'price = 1999' : P.price === 'range' ? 'price BETWEEN 1000 AND 3000' : null].filter(Boolean).join(' AND ') || 'TRUE'}${P.order !== 'none' ? `\nORDER BY ${P.order}` : ''}
LIMIT 50;`, 'query.sql')));
    lines.forEach(([c, t]) => out.append(el('div', {class:'verdict ' + (c || 'warn'), style:{marginTop:'6px', fontWeight:'500', ...(c ? {} : {background:'var(--surface)', color:'var(--text-2)', border:'1px solid var(--border)'})}, html:t})));
    out.append(el('p', {class:'lab-hint'}, 'Table: 10M products. Assumed selectivity: city 1%, category 2%, price range 10%, exact price 0.1% (illustrative).'));
  }
  const h2 = s => frag(s);
  host.append(el('div', {class:'ctl-grid'},
    ui.select({label:'Index definition', value:P.idx, options:['city', 'city,category', 'city,category,price', 'category,city', 'price', 'city,price,category'].map(v => [v, `(${v.split(',').join(', ')})`]), onChange:v => { P.idx = v; analyze(); }}).el,
    ui.select({label:'Price condition', value:'range', options:[['none', 'none'], ['eq', 'price = 1999'], ['range', 'price BETWEEN …']], onChange:v => { P.price = v; analyze(); }}).el,
    ui.select({label:'ORDER BY', value:'price', options:[['none', 'none'], ['price', 'price'], ['created_at', 'created_at (not indexed)']], onChange:v => { P.order = v; analyze(); }}).el,
    ui.select({label:'SELECT', value:'cover', options:[['cover', 'city, category, price'], ['star', '*']], onChange:v => { P.sel = v; analyze(); }}).el),
    el('div', {class:'row', style:{gap:'18px', marginTop:'10px'}}, ui.toggle({label:"WHERE city = 'Pune'", checked:true, onChange:v => { P.city = v; analyze(); }}).el, ui.toggle({label:"AND category = 'shoes'", checked:true, onChange:v => { P.cat = v; analyze(); }}).el), out);
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
    [['Row store (OLTP layout)', row, 'var(--c-db)', 'Reads every column of every row (no useful index for an aggregate over months).'], ['Column store (OLAP layout)', col, 'var(--accent2)', `Reads only <code>amount</code> and <code>order_date</code>, compressed ${P.comp}×, and skips blocks outside the ${P.months}-month range using min/max metadata.`]].forEach(([n, b, c, why]) => {
      out.append(el('div', {class:'wf-row', style:{gridTemplateColumns:'190px 1fr 150px'}}, el('b', {class:'wl'}, n), el('div', {class:'wf-track', style:{height:'22px'}}, el('div', {class:'wf-bar', style:{left:'0', width:Math.max(.5, b / row * 100) + '%', background:c}})), el('span', {class:'wt'}, `${fmtBytes(b)} · ${fmtDur(t(b) * 1000)}`)), el('p', {class:'lab-hint', style:{margin:'0 0 10px 200px'}, html:why}));
    });
    out.append(el('div', {class:'verdict ok'}, `Column store reads ~${fmtNum(row / col)}× less data for this query.`));
    out.append(el('p', {class:'lab-hint'}, 'Query: SELECT SUM(amount) FROM orders WHERE order_date in the last N months. 8 bytes per value, scanning at 1 GB/s, illustrative.'));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Rows in the orders table', min:5, max:10, step:.1, value:8, fmt:v => fmtNum(Math.pow(10, v)), onInput:v => { P.rows = v; calc(); }}).el, ui.slider({label:'Columns in the table', min:5, max:200, step:1, value:50, fmt:v => v, onInput:v => { P.cols = v; calc(); }}).el, ui.slider({label:'Column compression', min:1, max:15, step:.5, value:5, fmt:v => v + '×', onInput:v => { P.comp = v; calc(); }}).el, ui.slider({label:'Months queried (of 12)', min:1, max:12, step:1, value:1, fmt:v => v, onInput:v => { P.months = v; calc(); }}).el), out);
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
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Total data', min:1, max:5000, step:1, value:500, fmt:v => v + ' TB', onInput:v => { P.tb = v; calc(); }}).el, ui.slider({label:'Accessed in the last 30 days', min:1, max:100, step:1, value:10, fmt:v => v + '%', onInput:v => { P.hot = v; P.warm = Math.min(P.warm, 100 - v); calc(); }}).el, ui.slider({label:'Accessed in 30–90 days', min:0, max:99, step:1, value:20, fmt:v => v + '%', onInput:v => { P.warm = Math.min(v, 100 - P.hot); calc(); }}).el), out);
  calc();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'sql-vs-nosql', title:'SQL vs NoSQL: the database families and how to choose', minutes:11, tags:['SQL','NoSQL','key-value','document','wide-column','graph','time-series','vector'],
  summary:'Relational, key-value, document, wide-column, graph, time-series, search and vector stores each optimise for a different access pattern. Choose by how you read and write, not by fashion.',
  problem:`<p>A food-delivery startup stores orders, restaurant menus, rider GPS pings every 4 seconds, user search queries and “restaurants similar to this one”. One team wants MongoDB for everything, another Postgres for everything, a third wants seven databases. The right answer depends on <strong>access patterns</strong>, not on which database is trending.</p>`,
  intuition:`Storage furniture. A filing cabinet with cross-referenced folders (relational). A wall of numbered lockers (key-value). A box per customer holding all their papers (document). A ledger where each page is one rider’s location log in time order (wide-column / time-series). A corkboard with strings between photos (graph). A library card catalogue by word (search). A map where similar things sit close together (vector).`,
  how:{
    steps:[`<b>Relational (SQL):</b> tables, joins, constraints, ACID transactions, ad-hoc queries. Default choice for core business data.`, `<b>Key-value:</b> get/put by key, extreme scale and predictable latency; queries limited to the key.`, `<b>Document:</b> JSON-like objects read and written whole; flexible schema; weak at cross-document joins.`, `<b>Wide-column:</b> partition key → sorted rows; built for massive writes and known query patterns (design a table per query).`, `<b>Graph:</b> nodes and edges; fast multi-hop traversals.`, `<b>Time-series:</b> timestamped points, retention policies, downsampling, range aggregations.`, `<b>Search:</b> inverted indexes for full-text relevance (usually a secondary copy).`, `<b>Vector:</b> approximate nearest-neighbour search over embeddings.`, `Ask: What are the queries? Read:write ratio? Consistency needs? Scale? Then pick — and remember many systems use several stores, each fed from one source of truth.`],
    diagram:{title:'Polyglot persistence in a delivery app', w:800, h:300, alt:'Services write to Postgres as the source of truth; change streams feed Elasticsearch, a vector index and an analytics store; GPS pings go to a wide-column store.',
      nodes:[{id:'api', type:'service', label:'Order & menu svc', x:110, y:90, w:150}, {id:'gps', type:'service', label:'Rider location svc', x:110, y:230, w:150}, {id:'pg', type:'db', label:'PostgreSQL', sub:'orders, menus', x:360, y:90, w:130}, {id:'cas', type:'db', label:'Cassandra', sub:'GPS pings', x:360, y:230, w:130}, {id:'q', type:'queue', label:'Change stream', x:560, y:90, w:130}, {id:'es', type:'db', label:'Elasticsearch', sub:'search', x:720, y:40, w:130}, {id:'vec', type:'db', label:'Vector index', sub:'similar', x:720, y:140, w:130}, {id:'wh', type:'db', label:'Warehouse', sub:'analytics', x:720, y:240, w:130}],
      edges:[{from:'api', to:'pg'}, {from:'gps', to:'cas'}, {from:'pg', to:'q'}, {from:'q', to:'es'}, {from:'q', to:'vec'}, {from:'q', to:'wh'}],
      steps:[
        {note:'Orders and menus need transactions and joins → <b>PostgreSQL</b> is the source of truth.', flow:[['api', 'pg', 'INSERT order']], hl:['pg']},
        {note:'Rider GPS pings are a firehose of time-ordered writes per rider → a <b>wide-column</b> store partitioned by rider.', flow:[['gps', 'cas', 'ping'], ['gps', 'cas', 'ping'], ['gps', 'cas', 'ping']], hl:['cas']},
        {note:'Changes stream out of Postgres (CDC, Module 7)…', flow:[['pg', 'q', 'change']], hl:['q']},
        {note:'…into <b>search</b> (dish names), a <b>vector</b> index (“similar restaurants”) and the <b>warehouse</b> (analytics). Each is derived and rebuildable.', flow:[['q', 'es'], ['q', 'vec'], ['q', 'wh']], parallel:true}
      ]},
    deep:`<p><b>Data-model fit:</b> document stores shine when data is a self-contained tree (an order with its line items) and suffer when you need many-to-many joins; relational shines at many-to-many and ad-hoc queries. Wide-column stores (Bigtable, Cassandra) require query-first modelling — duplicate data into one table per query. Graph databases avoid repeated joins for variable-depth traversals.</p><p><b>Operations matter as much as features:</b> backups, failover, migrations, observability, hiring. Postgres extensions (JSONB, full-text search, PostGIS, pgvector, TimescaleDB) often delay the need for a second system. When you do add stores, designate <b>one system of record</b> and treat the rest as derived views fed by change data capture.</p>`
  },
  tradeoffs:{use:[`<b>Relational</b> for core transactional data (the default)`, `<b>Specialised stores</b> when an access pattern or scale clearly outgrows it`, `<b>Polyglot</b> with one system of record and derived copies`], avoid:[`Picking NoSQL to “avoid schemas” — the schema just moves into code`, `A new database per feature (operational sprawl)`, `Using a search engine as the system of record`], alt:[`Postgres extensions (JSONB, pgvector, TimescaleDB, PostGIS)`, `NewSQL / distributed SQL (Spanner, CockroachDB, YugabyteDB, TiDB) for SQL at horizontal scale`]},
  real:[
    {co:'Discord', tier:'confirmed', text:'Moved message storage from MongoDB to Cassandra (2017) and later to ScyllaDB (2023), because messages are a massive, time-ordered, per-channel write workload.', src:'Discord Engineering, “How Discord Stores Billions of Messages” (2017) and “How Discord Stores Trillions of Messages” (2023)'},
    {co:'Uber', tier:'confirmed', text:'Built Schemaless, a scalable datastore layered on top of MySQL, and later wrote about moving core workloads from PostgreSQL to MySQL.', src:'Uber Engineering, “Designing Schemaless” (2016); “Why Uber Engineering Switched from Postgres to MySQL” (2016)'},
    {co:'Amazon', tier:'confirmed', text:'The 2007 Dynamo paper describes a highly available key-value store for the shopping cart; DynamoDB (2012) is the managed service inspired by it.', src:'DeCandia et al., SOSP 2007; AWS DynamoDB documentation'},
    {co:'Google', tier:'confirmed', text:'Bigtable (OSDI 2006) is the wide-column store behind many Google products and the model for HBase and Cassandra’s data layout.', src:'Chang et al., “Bigtable”, OSDI 2006'}
  ],
  mistakes:[`Choosing by popularity instead of access pattern`, `Document DB for highly relational data (joins in application code)`, `No single source of truth across several stores`],
  interview:[`Justify the database from the queries you listed in the API step`, `Name the partition key and main query for any NoSQL table you draw`],
  tryit:{note:'Describe your workload; get ranked recommendations with reasons.', mount:host => dbChooser(host)},
  sources:[`Martin Kleppmann, “Designing Data-Intensive Applications”, ch. 2–3`, `Chang et al., Bigtable (OSDI 2006)`, `DeCandia et al., Dynamo (SOSP 2007)`, `Discord Engineering blog`]
},
{
  id:'acid-vs-base', title:'ACID vs BASE', minutes:8, tags:['ACID','BASE','atomicity','durability','eventual consistency'],
  summary:'ACID: transactions are all-or-nothing, valid, isolated and durable. BASE: basically available, soft state, eventually consistent — trading guarantees for availability and scale.',
  problem:`<p>Transferring ₹500 from Asha to Ravi is two writes: debit Asha, credit Ravi. If the server crashes between them, ₹500 vanishes. Meanwhile a “likes” counter on a viral reel is updated 50,000 times a second across regions — making every increment a strictly consistent transaction would be slow and fragile. Different data deserves different guarantees.</p>`,
  intuition:`ACID is a bank locker transaction: both signatures or nothing, the bank’s rules always hold, nobody sees the half-done state, and once the receipt is printed it survives a fire. BASE is a WhatsApp group’s “seen by” list: everyone eventually sees the same thing, but for a moment different phones show different counts — and that’s fine.`,
  how:{
    steps:[`<b>Atomicity:</b> all writes in a transaction commit, or none do (rollback on failure).`, `<b>Consistency:</b> the transaction moves the database from one valid state to another (constraints, invariants hold).`, `<b>Isolation:</b> concurrent transactions don’t see each other’s partial work (to a degree set by the isolation level).`, `<b>Durability:</b> once committed, data survives crashes (write-ahead log, fsync, replication).`, `<b>BASE:</b> Basically Available, Soft state, Eventually consistent — replicas may disagree briefly but converge.`, `Real systems mix both: ACID for money and inventory, BASE for counters, feeds and analytics.`],
    diagram:{title:'Atomicity via the write-ahead log', w:740, h:240, alt:'A transfer writes to the write-ahead log before applying both changes; a crash before commit rolls back.',
      nodes:[{id:'app', type:'service', label:'Payments svc', x:90, y:120}, {id:'wal', type:'queue', label:'Write-ahead log', x:340, y:50, w:150}, {id:'a', type:'db', label:'Asha: ₹1,000', x:600, y:60, w:150}, {id:'r', type:'db', label:'Ravi: ₹200', x:600, y:180, w:150}],
      edges:[{from:'app', to:'wal'}, {from:'wal', to:'a'}, {from:'wal', to:'r'}, {from:'app', to:'a', dashed:true}],
      steps:[
        {note:'<code>BEGIN</code>; debit Asha ₹500 and credit Ravi ₹500 are both recorded in the <b>WAL</b> first.', flow:[['app', 'wal', 'debit -500'], ['app', 'wal', 'credit +500']], hl:['wal']},
        {note:'<code>COMMIT</code>: the commit record is flushed (fsync) — now the transfer is <b>durable</b>.', flow:[['app', 'wal', 'COMMIT + fsync']], hl:['wal']},
        {note:'Changes are applied to the data pages: Asha ₹500, Ravi ₹700. Total money unchanged (<b>consistency</b>).', flow:[['wal', 'a'], ['wal', 'r']], parallel:true, sub:{a:'→ ₹500', r:'→ ₹700'}},
        {note:'If the crash had happened <i>before</i> COMMIT, recovery would replay the log and discard the uncommitted transaction: <b>atomicity</b> — no half-transfer.', status:{app:'down'}, hl:['wal']}
      ]},
    deep:`<p><b>“Consistency” is overloaded:</b> the C in ACID (application invariants) is not the C in CAP (linearizability across replicas, Module 6). Atomicity and durability come from logging (WAL/redo logs, ARIES-style recovery); isolation from locks and MVCC.</p><p><b>BASE in practice</b> means designing for convergence: idempotent operations, commutative updates (CRDT counters), read-repair and anti-entropy. The term was popularised by Dan Pritchett (eBay) in ACM Queue (2008) as an alternative to distributed ACID transactions, which are slow and fragile across services (2PC, Module 6). Many modern distributed databases (Spanner, CockroachDB) offer ACID across nodes using consensus — at a latency cost.</p>`
  },
  tradeoffs:{use:[`<b>ACID:</b> money, orders, inventory, bookings, anything with invariants`, `<b>BASE:</b> counters, likes, feeds, presence, analytics, caches`], avoid:[`BASE for balances or seat allocation`, `Distributed ACID transactions across many services as a default (latency, availability)`], alt:[`Sagas with compensation (Module 6)`, `Single-partition transactions in NoSQL stores (e.g. DynamoDB transactions)`, `Distributed SQL databases`]},
  real:[
    {co:'eBay', tier:'confirmed', text:'Dan Pritchett described the BASE approach — partitioning functionality and accepting eventual consistency instead of distributed transactions — from eBay’s experience.', src:'Dan Pritchett, “BASE: An Acid Alternative”, ACM Queue (2008)'},
    {co:'Google Spanner', tier:'confirmed', text:'Provides externally consistent (strictly serialisable) ACID transactions across data centres using TrueTime and Paxos.', src:'Corbett et al., “Spanner”, OSDI 2012'},
    {co:'Amazon DynamoDB', tier:'confirmed', text:'Defaults to eventually consistent reads (strongly consistent reads are optional) and offers ACID transactions across up to a bounded number of items.', src:'Amazon DynamoDB documentation'}
  ],
  mistakes:[`Confusing ACID consistency with CAP consistency`, `Assuming NoSQL means no transactions at all`, `Turning off fsync for speed on a database holding money`],
  interview:[`Say which data needs ACID and which can be eventually consistent`, `Mention the WAL when explaining durability and crash recovery`],
  tryit:{note:'ACID or BASE?', mount:host => sortGame(host, [
    {t:'Wallet balance transfer between two users', c:'a', why:'Money must never be created or destroyed — atomic and isolated.'},
    {t:'View count on a viral video', c:'b', why:'Approximate and eventually consistent is fine; scale matters more.'},
    {t:'Allocating the last seat on a train', c:'a', why:'Double allocation is unacceptable.'},
    {t:'“Online now” presence dots', c:'b', why:'Briefly wrong is harmless.'},
    {t:'Order placement with inventory decrement', c:'a', why:'Order and stock must change together.'},
    {t:'Recommendation scores recomputed nightly', c:'b', why:'Derived, rebuildable, staleness tolerated.'}
  ], [{id:'a', label:'ACID'}, {id:'b', label:'BASE'}])},
  sources:[`Jim Gray & Andreas Reuter, “Transaction Processing” (1992)`, `Dan Pritchett, ACM Queue 2008`, `Corbett et al., Spanner, OSDI 2012`]
},
{
  id:'indexes', title:'Indexes: B-tree, hash, composite, covering, inverted', minutes:11, tags:['index','B-tree','hash index','composite index','covering index','inverted index'],
  summary:'An index trades write cost and storage for fast reads. Know the leftmost-prefix rule, when indexes cover a query, and which structure suits which query.',
  problem:`<p><code>SELECT * FROM orders WHERE user_id = 42 ORDER BY created_at DESC LIMIT 20</code> takes 4 seconds on 200 million rows because the database reads every row. An index makes it a few milliseconds. But add ten indexes “just in case” and every insert gets slower and the table doubles in size.</p>`,
  intuition:`The index at the back of a textbook: instead of reading every page to find “photosynthesis”, you look it up alphabetically and jump to pages 42 and 97. A phone book sorted by (last name, first name) helps you find “Sharma, Priya” — but is useless for finding everyone named Priya.`,
  how:{
    steps:[`<b>B-tree</b> (the default almost everywhere): sorted, balanced tree; supports equality, ranges, ORDER BY and prefix matches in O(log n).`, `<b>Hash index</b>: equality only, O(1); no ranges or ordering.`, `<b>Composite index</b> (a, b, c): sorted by a, then b, then c. Usable for a; a+b; a+b+c — the <b>leftmost-prefix rule</b>. A range on a column stops further columns from narrowing the seek.`, `<b>Covering index</b>: contains every column the query needs, so the table itself is never read (index-only scan).`, `<b>Inverted index</b>: word → list of documents containing it; powers full-text search (Module 8).`, `Every index slows writes and uses storage. Index for your <b>actual</b> queries; verify with <code>EXPLAIN</code>.`],
    diagram:{title:'A B-tree lookup touches only a few pages', w:760, h:260, alt:'A query traverses root, internal and leaf pages of a B-tree to find user 42.',
      nodes:[{id:'q', type:'client', label:'WHERE user_id=42', x:90, y:130, w:150}, {id:'root', type:'db', label:'Root page', sub:'< 500 | ≥ 500', x:320, y:130, w:130}, {id:'i1', type:'db', label:'Internal', sub:'< 50 | ≥ 50', x:500, y:70, w:120}, {id:'i2', type:'db', label:'Internal', sub:'500…', x:500, y:200, w:120}, {id:'leaf', type:'db', label:'Leaf: 40–49', sub:'42 → row ptrs', x:680, y:70, w:130}],
      edges:[{from:'q', to:'root'}, {from:'root', to:'i1'}, {from:'root', to:'i2'}, {from:'i1', to:'leaf'}],
      steps:[
        {note:'Start at the root page: 42 &lt; 500 → go left.', flow:[['q', 'root', 'seek 42']], hl:['root']},
        {note:'Internal page: 42 &lt; 50 → follow that pointer.', flow:[['root', 'i1']], hl:['i1']},
        {note:'Leaf page lists keys 40–49 and pointers to the matching rows. Three page reads instead of millions.', flow:[['i1', 'leaf']], hl:['leaf']},
        {note:'With fan-out ~100s per page, even a billion rows needs only ~4–5 levels — and the top levels are always cached in RAM.', hl:['root', 'i1', 'leaf']}
      ]},
    html:h.code('sql', `-- Composite index serving filter + sort + limit without a sort step:
CREATE INDEX orders_user_created ON orders (user_id, created_at DESC);

EXPLAIN ANALYZE
SELECT id, total_paise, created_at FROM orders
WHERE user_id = 42 ORDER BY created_at DESC LIMIT 20;
-- Index Scan using orders_user_created ... rows=20  (no Sort node)

-- Covering (PostgreSQL INCLUDE): index-only scan, the table heap is not read
CREATE INDEX orders_user_created_cov ON orders (user_id, created_at DESC) INCLUDE (total_paise);`, 'indexes.sql'),
    deep:`<p><b>Clustered vs secondary:</b> InnoDB stores rows inside the primary-key B-tree (clustered), so secondary indexes point to the primary key — random UUIDv4 primary keys scatter inserts across pages (page splits, poor locality); time-ordered keys (ULID, UUIDv7, Snowflake IDs) insert at the right edge. PostgreSQL stores rows in a heap and indexes point to row locations.</p><p><b>Selectivity and the planner:</b> an index on a low-cardinality column (status with 3 values) rarely helps; the planner chooses a sequential scan when it expects to read a large fraction of the table. Partial indexes (<code>WHERE status = 'pending'</code>) index only what you query. Expression indexes support <code>lower(email)</code>.</p><p><b>Other structures:</b> GIN (inverted; JSONB, arrays, full text), GiST/SP-GiST (geometric, ranges), BRIN (tiny block-range summaries for naturally ordered huge tables), and LSM trees (next lesson).</p>`
  },
  tradeoffs:{use:[`Columns in frequent WHERE, JOIN and ORDER BY clauses`, `Composite indexes ordered: equality columns first, then range/sort column`, `Covering indexes for hot, narrow queries`], avoid:[`Indexing every column`, `Low-selectivity columns alone`, `Many indexes on write-heavy tables`], alt:[`Partial or expression indexes`, `Materialised views / summary tables`, `A search engine for full-text`]},
  real:[
    {co:'MySQL InnoDB', tier:'confirmed', text:'Organises table data as a clustered B+tree on the primary key; secondary indexes store the primary key as their row pointer.', src:'MySQL Reference Manual — clustered and secondary indexes'},
    {co:'PostgreSQL', tier:'confirmed', text:'Provides B-tree (default), hash, GiST, SP-GiST, GIN and BRIN index types, plus partial, expression and covering (INCLUDE) indexes.', src:'PostgreSQL documentation — index types'},
    {co:'Elasticsearch / Lucene', tier:'confirmed', text:'Built on inverted indexes that map terms to the documents containing them.', src:'Apache Lucene documentation'}
  ],
  mistakes:[`Wrong column order in composite indexes`, `Functions on indexed columns in WHERE (<code>WHERE date(created_at) = …</code>) defeating the index`, `Never running EXPLAIN`, `Random UUID primary keys on InnoDB at high insert rates`],
  interview:[`For each hot query, name the index (and its column order)`, `Mention write amplification and storage cost of indexes`],
  tryit:{note:'Pick an index and a query. See whether the index is used, how many rows are examined, and if a sort or table lookups are needed.', mount:host => indexChecker(host)},
  sources:[`Bayer & McCreight, “Organization and Maintenance of Large Ordered Indexes” (1972)`, `PostgreSQL and MySQL documentation`, `Markus Winand, “Use The Index, Luke!”`]
},
{
  id:'btree-vs-lsm', title:'Storage engines: B-trees vs LSM-trees', minutes:10, tags:['B-tree','LSM','SSTable','memtable','compaction','write amplification'],
  summary:'B-trees update pages in place — great for reads. LSM-trees append and merge later — great for writes. Each pays in a different amplification.',
  problem:`<p>A rider-tracking system writes 200,000 GPS points per second. A B-tree-based database updates random pages on disk for every insert and falls behind. A log-structured store absorbs the writes easily — but its reads may check several files, and background compaction eats disk bandwidth. Which engine for which workload?</p>`,
  intuition:`A B-tree is a perfectly organised filing cabinet: every new paper is filed in its exact place immediately (slow to file, fast to find). An LSM-tree is an inbox tray: new papers go on top instantly; once a day you sort the tray into the cabinet and merge duplicates (fast to file, finding something may mean checking the tray and a few piles).`,
  how:{
    steps:[`<b>B-tree:</b> fixed-size pages; an insert finds the right leaf and updates it in place (with a WAL for crash safety); full pages split.`, `<b>LSM-tree:</b> writes go to an in-memory <b>memtable</b> (plus a WAL). When full it is flushed as an immutable sorted file — an <b>SSTable</b>.`, `Reads check the memtable, then SSTables newest → oldest. <b>Bloom filters</b> skip files that can’t contain the key.`, `Background <b>compaction</b> merges SSTables, discarding overwritten and deleted (tombstoned) entries.`, `Trade-offs: <b>write amplification</b> (bytes written to disk per byte of data), <b>read amplification</b> (files/pages read per lookup), <b>space amplification</b> (stale data awaiting compaction).`],
    diagram:{title:'The LSM write path', w:760, h:260, alt:'Writes go to a WAL and a memtable; full memtables flush to SSTables at level 0, which compact into level 1.',
      nodes:[{id:'w', type:'client', label:'Writes', x:80, y:130}, {id:'wal', type:'queue', label:'WAL (append)', x:270, y:50, w:130}, {id:'mt', type:'cache', label:'Memtable', sub:'sorted, in RAM', x:270, y:190, w:130}, {id:'l0', type:'db', label:'L0 SSTables', x:490, y:190, w:130}, {id:'l1', type:'db', label:'L1 (compacted)', x:680, y:190, w:130}],
      edges:[{from:'w', to:'wal'}, {from:'w', to:'mt'}, {from:'mt', to:'l0'}, {from:'l0', to:'l1'}],
      steps:[
        {note:'Each write is appended to the <b>WAL</b> (sequential, durable) and inserted into the in-memory <b>memtable</b>. Acknowledged — no random disk I/O.', flow:[['w', 'wal', 'append'], ['w', 'mt', 'put k=v']], parallel:true, hl:['mt']},
        {note:'When the memtable fills, it is written out as a new immutable, sorted <b>SSTable</b> in one sequential write.', flow:[['mt', 'l0', 'flush']], hl:['l0']},
        {note:'Background <b>compaction</b> merges overlapping SSTables into the next level, dropping overwritten values and tombstones.', flow:[['l0', 'l1', 'merge']], hl:['l1']},
        {note:'A read checks memtable → L0 → L1, using each file’s Bloom filter to skip files that don’t have the key.', flow:[['w', 'mt', 'get k'], ['mt', 'l0', 'bloom?'], ['l0', 'l1', 'bloom ✓']], hl:['l1']}
      ]},
    deep:`<p><b>Compaction strategies:</b> <i>leveled</i> (RocksDB default, LevelDB): each level is one sorted run ~10× bigger than the previous — low read and space amplification, higher write amplification. <i>Size-tiered</i> (Cassandra’s classic default): merge similar-sized runs — lower write amplification, more space and read amplification. Compaction competes with foreground I/O; throttle it, or tail latency suffers.</p><p><b>B-tree costs:</b> random writes, page splits and fragmentation; each small update rewrites a whole page (plus the WAL) — write amplification too. SSDs narrow the random-vs-sequential gap but erase-block wear still favours sequential writes. The RUM conjecture frames the trade-off: you can optimise two of Read, Update and Memory overheads, not all three.</p>`
  },
  tradeoffs:{use:[`<b>B-tree:</b> read-heavy OLTP, range scans, predictable reads (PostgreSQL, MySQL/InnoDB)`, `<b>LSM:</b> write-heavy ingestion, time-series, KV at scale (RocksDB, Cassandra, ScyllaDB, Bigtable)`], avoid:[`LSM for heavy random point reads without Bloom filters and caching`, `B-trees for firehose ingestion on slow disks`], alt:[`Hash-indexed logs (Bitcask) for small keyspaces in RAM`, `Columnar formats for analytics`]},
  real:[
    {co:'Google Bigtable / LevelDB', tier:'confirmed', text:'Bigtable introduced the memtable + SSTable design at scale; LevelDB, released by Google engineers, popularised leveled compaction.', src:'Chang et al., Bigtable, OSDI 2006; LevelDB documentation'},
    {co:'Meta RocksDB', tier:'confirmed', text:'A LevelDB fork optimised for fast storage; MyRocks uses it as a MySQL storage engine to cut storage and write amplification versus InnoDB for some Meta workloads.', src:'rocksdb.org; Matsunobu et al., “MyRocks”, VLDB 2020'},
    {co:'Apache Cassandra', tier:'confirmed', text:'Uses an LSM storage engine (commit log, memtables, SSTables) with configurable compaction strategies.', src:'Apache Cassandra documentation'}
  ],
  mistakes:[`Ignoring compaction debt until disks fill`, `No Bloom filters on LSM reads`, `Assuming LSM is always faster (reads and space can be worse)`],
  interview:[`Match engine to workload: write-heavy → LSM, read/range-heavy OLTP → B-tree`, `Name the three amplifications`],
  tryit:{note:'Insert keys into a real B-tree and a real LSM side by side. Watch splits, flushes, compaction and the read path.', pg:'btree-lsm'},
  sources:[`O’Neil et al., “The Log-Structured Merge-Tree” (1996)`, `Chang et al., Bigtable (2006)`, `Athanassoulis et al., “The RUM Conjecture” (EDBT 2016)`]
},
{
  id:'normalization', title:'Normalization vs denormalization', minutes:8, tags:['normalization','denormalization','3NF','joins','duplication'],
  summary:'Normalize to keep one source of truth per fact. Denormalize deliberately to make hot reads cheap — and own the cost of keeping copies in sync.',
  problem:`<p>Each order row stores the restaurant’s name and address. A restaurant renames itself, and now 2 million old orders show the old name — or worse, half are updated and half aren’t. On the other hand, the order-history screen joins six tables and takes 800 ms at peak.</p>`,
  intuition:`Normalization is keeping one master contact card per person and referring to it everywhere (“see card #42”). Denormalization is writing their phone number directly on every invitation — handy to read, painful when they change numbers.`,
  how:{
    steps:[`<b>Normalization</b> (1NF→3NF, BCNF): each fact stored once; tables linked by keys; avoids update, insert and delete anomalies.`, `<b>Denormalization:</b> duplicate data (or precompute aggregates) so hot reads avoid joins.`, `Keep historical facts <b>as they were</b>: an order should store the price paid (a snapshot), not point at today’s price.`, `If you denormalize, decide who updates the copies: same transaction, triggers, or async events (CDC) — and accept the staleness window.`, `NoSQL stores often force denormalization: model per query, duplicate across tables.`],
    stepper:{title:'Same data, two shapes', items:[
      {title:'Normalized', tag:'3 tables', text:'<code>orders(id, user_id, restaurant_id, total)</code>, <code>restaurants(id, name, address)</code>, <code>users(id, name)</code>. Rename a restaurant = 1 row update.'},
      {title:'Read cost', tag:'joins', text:'Order history needs <code>orders JOIN restaurants JOIN users</code> — fine with indexes, but costly at very high QPS.'},
      {title:'Denormalized', tag:'1 wide row', text:'<code>orders(id, user_name, restaurant_name, restaurant_address, total, …)</code>. One read, no joins.'},
      {title:'Update cost', tag:'anomalies', text:'Rename = update every copy. Miss one → inconsistent data.'},
      {title:'Snapshot fields', tag:'correct duplication', text:'<code>item_price_paise</code> on the order line is <i>supposed</i> to be a copy: it records what was paid then.'},
      {title:'Hybrid', tag:'common answer', text:'Normalized source of truth + denormalized read models (materialised views, caches, search docs) refreshed by events.'}
    ]},
    deep:`<p><b>Anomalies normalization prevents:</b> <i>update</i> (same fact in many places diverges), <i>insert</i> (can’t record a restaurant without an order), <i>delete</i> (deleting the last order loses the restaurant). 3NF: every non-key attribute depends on the key, the whole key and nothing but the key.</p><p><b>Denormalization patterns:</b> materialised views (refreshed periodically or incrementally), counter columns (<code>comment_count</code>) updated in the same transaction, read models in CQRS (Module 7), embedding in documents. The engineering question is always: what is the staleness and repair story for each copy?</p>`
  },
  tradeoffs:{use:[`<b>Normalize</b> the system of record (OLTP)`, `<b>Denormalize</b> read models, analytics tables, caches, search documents`, `Snapshot fields for historical truth (prices paid, addresses delivered to)`], avoid:[`Denormalizing before measuring a real read bottleneck`, `Copies with no defined update path`], alt:[`Better indexes or covering indexes`, `Materialised views`, `Caching`]},
  real:[
    {co:'E. F. Codd', tier:'confirmed', text:'The relational model and normalization originate in Codd’s 1970 paper and follow-up work defining normal forms.', src:'Codd, “A Relational Model of Data for Large Shared Data Banks”, CACM 1970'},
    {co:'Amazon DynamoDB guidance', tier:'confirmed', text:'AWS recommends modelling around access patterns, often with denormalized items and single-table designs, rather than normalized relational schemas.', src:'Amazon DynamoDB developer guide — best practices for NoSQL design'}
  ],
  mistakes:[`Storing current price on order lines by reference (history changes!)`, `Denormalized copies updated by ad-hoc scripts`, `Premature denormalization`],
  interview:[`Normalize the core; justify each denormalized copy with a read pattern and an update path`],
  tryit:{note:'Normalize (store once, reference) or keep a copy?', mount:host => sortGame(host, [
    {t:'Restaurant name shown on order history', c:'n', why:'Reference the restaurant (or snapshot only if you must show the name at order time).'},
    {t:'Price paid for each item on an order', c:'d', why:'A historical snapshot — copying is correct.'},
    {t:'Delivery address used for an order', c:'d', why:'The user may change their address later; the order must keep where it was delivered.'},
    {t:'User’s email used for login', c:'n', why:'One source of truth; duplicates cause account bugs.'},
    {t:'Comment count shown on every post card', c:'d', why:'A precomputed counter avoids COUNT(*) on every read; update it transactionally.'},
    {t:'Product category name', c:'n', why:'Reference data — store once.'}
  ], [{id:'n', label:'Normalize'}, {id:'d', label:'Copy/denormalize'}])},
  sources:[`Codd, CACM 1970`, `Kleppmann, DDIA ch. 2`, `DynamoDB best practices`]
},
{
  id:'transactions-isolation', title:'Transactions and isolation levels (MVCC)', minutes:12, tags:['isolation','dirty read','non-repeatable read','phantom','MVCC','serializable','write skew'],
  summary:'Isolation levels decide which anomalies concurrent transactions can see. MVCC lets readers and writers not block each other.',
  problem:`<p>Two doctors are on call. Each checks “is at least one other doctor on call?”, sees yes, and goes off call — at the same time. Now nobody is on call. Every query was correct; the combination was not. This is <strong>write skew</strong>, and whether your database prevents it depends on the isolation level you chose (often without knowing).</p>`,
  intuition:`Isolation levels are how private your workspace is. Read Uncommitted: you can see a colleague’s scribbles before they finish. Read Committed: you only see finished pages, but they may change between your glances. Repeatable Read / snapshot: you work from a photocopy taken when you started. Serializable: the result is as if everyone worked one at a time.`,
  how:{
    steps:[`<b>Dirty read:</b> seeing another transaction’s uncommitted write. Prevented from Read Committed up.`, `<b>Non-repeatable read:</b> reading the same row twice and getting different values. Prevented by Repeatable Read / snapshot isolation.`, `<b>Phantom:</b> re-running a range query returns new rows inserted meanwhile. Prevented by serializable (and by snapshot reads in many engines).`, `<b>Lost update:</b> two read-modify-write cycles overwrite each other. Prevented by atomic updates, locks or first-updater-wins.`, `<b>Write skew:</b> two transactions read overlapping data and write different rows, breaking an invariant. Only <b>Serializable</b> prevents it.`, `<b>MVCC:</b> the database keeps multiple versions of rows; each transaction reads from a consistent snapshot, so readers don’t block writers.`],
    html:h.table(['Level', 'Dirty read', 'Non-repeatable', 'Phantom', 'Write skew'], [['Read Uncommitted', 'possible', 'possible', 'possible', 'possible'], ['Read Committed (Postgres default)', '—', 'possible', 'possible', 'possible'], ['Repeatable Read / Snapshot (MySQL default)', '—', '—', 'engine-dependent', 'possible'], ['Serializable', '—', '—', '—', '—']]),
    diagram:{title:'Write skew under snapshot isolation', w:760, h:240, alt:'Two transactions both read that two doctors are on call, then each takes a different doctor off call, leaving none.',
      nodes:[{id:'t1', type:'service', label:'T1 (Dr. Asha)', x:110, y:60, w:140}, {id:'t2', type:'service', label:'T2 (Dr. Ravi)', x:110, y:190, w:140}, {id:'db', type:'db', label:'on_call table', sub:'Asha ✓  Ravi ✓', x:480, y:125, w:160}],
      edges:[{from:'t1', to:'db'}, {from:'t2', to:'db'}],
      steps:[
        {note:'Both transactions start and take snapshots. Each counts doctors on call: <b>2</b>.', flow:[['t1', 'db', 'COUNT = 2'], ['t2', 'db', 'COUNT = 2']], parallel:true},
        {note:'T1: “2 ≥ 2, so I can leave” → sets Asha off call. T2 independently sets Ravi off call. Different rows — no write conflict.', flow:[['t1', 'db', 'UPDATE Asha'], ['t2', 'db', 'UPDATE Ravi']], parallel:true},
        {note:'Both commit. Snapshot isolation sees no conflicting writes… and now <b>zero</b> doctors are on call.', sub:{db:'Asha ✗  Ravi ✗'}, status:{db:'hot'}},
        {note:'Under <b>Serializable</b>, the database detects the read–write dependency cycle and aborts one transaction, which retries and sees count = 1.', status:{db:'ok'}, sub:{db:'Asha ✗  Ravi ✓'}, hl:['db']}
      ]},
    deep:`<p><b>MVCC in PostgreSQL:</b> each row version carries creating/deleting transaction IDs; a snapshot decides visibility; old versions are reclaimed by VACUUM (long-running transactions block cleanup and cause bloat). <b>Serializable</b> in PostgreSQL uses Serializable Snapshot Isolation (SSI, since 9.1), which tracks read–write dependencies and aborts transactions that could form a cycle — applications must retry on serialization failures.</p><p><b>Names lie:</b> the ANSI levels were defined by anomalies and are ambiguous (Berenson et al., 1995). Oracle’s “SERIALIZABLE” is actually snapshot isolation; MySQL InnoDB’s default Repeatable Read uses consistent snapshots for plain reads but locking reads see the latest data. Always check the engine’s actual guarantees (Jepsen analyses are a good reference). Practical defences: use <code>SELECT … FOR UPDATE</code> on the rows your decision depends on, materialise conflicts (a row to lock), add constraints, or run the critical transactions at Serializable with retries.</p>`
  },
  tradeoffs:{use:[`<b>Read Committed</b> for most OLTP, with atomic updates (<code>SET x = x - 1</code>) and explicit locks where needed`, `<b>Serializable</b> for invariant-heavy logic (bookings, scheduling, double-entry rules)`], avoid:[`Read-modify-write in application code without locking or version checks`, `Long transactions under MVCC (bloat, locks)`, `Assuming the default level prevents write skew`], alt:[`Database constraints (UNIQUE, CHECK, exclusion constraints)`, `Optimistic version columns`, `Single-writer designs (one actor owns the entity)`]},
  real:[
    {co:'PostgreSQL', tier:'confirmed', text:'Defaults to Read Committed and implements Serializable using Serializable Snapshot Isolation, which may abort transactions with serialization failures that clients must retry.', src:'PostgreSQL documentation — transaction isolation'},
    {co:'MySQL InnoDB', tier:'confirmed', text:'Defaults to Repeatable Read, using MVCC consistent reads plus next-key locking for locking reads.', src:'MySQL Reference Manual — InnoDB transaction isolation levels'},
    {co:'Research', tier:'confirmed', text:'“A Critique of ANSI SQL Isolation Levels” showed the standard’s definitions are ambiguous and introduced snapshot isolation and write skew into the formal discussion.', src:'Berenson et al., SIGMOD 1995'}
  ],
  mistakes:[`Not knowing your database’s default isolation level`, `Check-then-act in application code (“if seats > 0 then book”)`, `Serializable without retry logic`],
  interview:[`For a booking system, say exactly how double-booking is prevented (lock, constraint or serializable)`, `Name write skew and the doctors-on-call example`],
  tryit:{note:'Run each anomaly at each isolation level on a small MVCC engine and see what each transaction observes.', pg:'isolation'},
  sources:[`Berenson et al., “A Critique of ANSI SQL Isolation Levels”, SIGMOD 1995`, `Ports & Grittner, “Serializable Snapshot Isolation in PostgreSQL”, VLDB 2012`, `Kleppmann, DDIA ch. 7`]
},
{
  id:'locking', title:'Optimistic vs pessimistic concurrency control', minutes:8, tags:['optimistic locking','pessimistic locking','SELECT FOR UPDATE','version column','deadlock'],
  summary:'Pessimistic: lock first, then work. Optimistic: work, then check nobody changed it, and retry if they did. Contention decides.',
  problem:`<p>Two users edit the same product description at once; the second save silently overwrites the first. Meanwhile, your ticketing system locks the “seats” row for every booking and at 10:00 AM thousands of requests queue behind one lock. Both are concurrency-control choices — one too loose, one too tight.</p>`,
  intuition:`Pessimistic: putting a “do not disturb” sign on the meeting room before using it — safe, but others wait. Optimistic: just using the room, and if someone else used it meanwhile (the whiteboard changed), you redo your work — no waiting, but wasted effort when it’s busy.`,
  how:{
    steps:[`<b>Pessimistic:</b> <code>SELECT … FOR UPDATE</code> locks rows until commit; others wait. Risks: lock waits, deadlocks, long transactions holding locks.`, `<b>Optimistic:</b> read the row with a <code>version</code>; update with <code>WHERE id = ? AND version = ?</code>; if 0 rows changed, someone else won — reload and retry (or tell the user).`, `Low contention → optimistic wins (no waiting). High contention on the same rows → optimistic wastes work; pessimistic or redesign.`, `Prefer <b>atomic statements</b> where possible: <code>UPDATE stock SET qty = qty - 1 WHERE id = ? AND qty &gt; 0</code> needs no explicit lock at all.`, `Deadlocks: lock rows in a consistent order; keep transactions short; set lock timeouts.`],
    html:h.code('sql', `-- Optimistic: version column
SELECT id, body, version FROM docs WHERE id = 7;           -- version = 12
UPDATE docs SET body = $1, version = version + 1
WHERE id = 7 AND version = 12;                               -- 0 rows → conflict, retry

-- Pessimistic: lock the row for the rest of the transaction
BEGIN;
SELECT qty FROM inventory WHERE sku = 'TSHIRT-M' FOR UPDATE;
UPDATE inventory SET qty = qty - 1 WHERE sku = 'TSHIRT-M';
COMMIT;

-- Often best: a single atomic, conditional statement
UPDATE inventory SET qty = qty - 1 WHERE sku = 'TSHIRT-M' AND qty > 0;  -- 1 row = sold, 0 = sold out`, 'concurrency.sql'),
    diagram:{title:'Optimistic conflict detection', w:740, h:220, alt:'Two editors read version 12; the first update succeeds and bumps to 13; the second update finds no matching version and must retry.',
      nodes:[{id:'a', type:'client', label:'Editor A', x:90, y:60}, {id:'b', type:'client', label:'Editor B', x:90, y:170}, {id:'db', type:'db', label:'docs #7', sub:'version 12', x:470, y:115, w:150}],
      edges:[{from:'a', to:'db'}, {from:'b', to:'db'}],
      steps:[
        {note:'Both editors load the document at <b>version 12</b>.', flow:[['a', 'db', 'SELECT'], ['b', 'db', 'SELECT']], parallel:true},
        {note:'A saves first: <code>… WHERE version = 12</code> matches → version becomes 13.', flow:[['a', 'db', 'UPDATE v12→13'], ['db', 'a', '1 row']], sub:{db:'version 13'}, hl:['a']},
        {note:'B saves: <code>… WHERE version = 12</code> matches <b>0 rows</b>. Conflict detected — no silent overwrite.', flow:[['b', 'db', 'UPDATE v12→13'], ['db', 'b', '0 rows']], hl:['b']},
        {note:'B reloads version 13, merges or shows a conflict to the user, and retries.', flow:[['b', 'db', 'reload v13']], hl:['b']}
      ]},
    deep:`<p><b>Deadlocks:</b> T1 locks row A then wants B; T2 locks B then wants A. Databases detect cycles and abort one victim — your code must retry. Prevent with consistent lock ordering (e.g. always lock the lower account ID first in a transfer). <code>SKIP LOCKED</code> lets job-queue workers grab different rows without waiting; <code>NOWAIT</code> fails fast instead of waiting.</p><p><b>HTTP-level optimistic concurrency:</b> <code>ETag</code> + <code>If-Match</code> on PUT gives the same check across an API (412 Precondition Failed on conflict). <b>Hot rows</b> (one global counter) defeat both approaches; split them (N counter shards summed on read) or batch updates.</p>`
  },
  tradeoffs:{use:[`<b>Optimistic:</b> user edits, low-contention updates, long think time (users editing forms)`, `<b>Pessimistic:</b> short, high-contention critical sections (inventory decrement, ledger rows)`, `<b>Atomic conditional updates</b> whenever the logic fits in one statement`], avoid:[`Holding row locks across network calls or user think time`, `Optimistic retries on a single hot row`], alt:[`Queue the work through a single writer per key`, `Counter sharding`, `Serializable isolation with retries`]},
  real:[
    {co:'PostgreSQL / MySQL', tier:'confirmed', text:'Support <code>SELECT … FOR UPDATE</code>, <code>NOWAIT</code> and <code>SKIP LOCKED</code>; SKIP LOCKED is widely used to build job queues on a relational table.', src:'PostgreSQL and MySQL documentation'},
    {co:'JPA / Hibernate', tier:'confirmed', text:'The <code>@Version</code> annotation implements optimistic locking with a version column, throwing an exception on conflicting updates.', src:'Jakarta Persistence specification'},
    {co:'HTTP', tier:'confirmed', text:'Conditional requests with <code>If-Match</code> and ETags, returning 412 on mismatch, provide optimistic concurrency for APIs.', src:'RFC 9110 — conditional requests'}
  ],
  mistakes:[`Read-modify-write with no version check (lost updates)`, `Locking in inconsistent order (deadlocks)`, `Locks held while calling a payment gateway`],
  interview:[`For each contended write, say: atomic statement, optimistic version or pessimistic lock — and why`],
  tryit:{note:'Simulate many clients updating a few rows. Compare throughput, wasted retries and lock waiting.', mount:host => lockSim(host)},
  sources:[`Kung & Robinson, “On Optimistic Methods for Concurrency Control”, ACM TODS 1981`, `PostgreSQL docs — explicit locking`, `RFC 9110`]
},
{
  id:'replication', title:'Replication: leader-follower, multi-leader, leaderless', minutes:12, tags:['replication','leader','follower','replica lag','failover','quorum','multi-leader'],
  summary:'Copies of data on several machines for availability, read scaling and locality. The hard parts are lag, failover and conflicting writes.',
  problem:`<p>A user updates their profile photo, refreshes, and sees the old photo — the read went to a replica that hasn’t caught up. Later, the primary database dies; the replica that gets promoted is missing the last two seconds of payments. Replication adds copies; it also adds new ways to be wrong.</p>`,
  intuition:`A head chef (leader) writes the recipe changes; assistant chefs (followers) copy them into their notebooks a moment later. Ask an assistant immediately after a change and you may get the old recipe. If the head chef faints, an assistant takes over — with whatever their notebook says.`,
  how:{
    steps:[`<b>Leader-follower</b> (primary-replica): all writes go to the leader; it streams its log to followers; reads can go to followers.`, `<b>Synchronous</b> replication: the leader waits for followers to confirm → no data loss on failover, but slower and blocked if a follower is down. <b>Asynchronous</b>: fast, but recent writes can be lost. <b>Semi-sync</b>: wait for at least one.`, `<b>Replication lag</b> causes anomalies: read-your-writes violations, monotonic-read violations (time going backwards).`, `<b>Failover</b>: detect leader failure, choose the most up-to-date follower, reconfigure clients — and fence the old leader (split brain).`, `<b>Multi-leader</b>: several regions accept writes; needs conflict resolution (last-write-wins, merge, CRDTs).`, `<b>Leaderless</b> (Dynamo-style): write to N replicas, succeed with W acks; read R replicas; R + W &gt; N gives overlapping quorums (Module 6).`],
    diagram:{title:'Async replication, lag and failover', w:760, h:270, alt:'A leader replicates to two followers; a read from a lagging follower is stale; the leader dies and a follower is promoted.',
      nodes:[{id:'c', type:'client', label:'App', x:80, y:135}, {id:'l', type:'db', label:'Leader', sub:'log pos 1042', x:340, y:135}, {id:'f1', type:'db', label:'Follower 1', sub:'pos 1042', x:600, y:60}, {id:'f2', type:'db', label:'Follower 2', sub:'pos 1039 (lag)', x:600, y:210}],
      edges:[{from:'c', to:'l'}, {from:'l', to:'f1'}, {from:'l', to:'f2'}, {from:'c', to:'f2', curve:.2, dashed:true}],
      steps:[
        {note:'The app writes a new profile photo to the <b>leader</b>, which acknowledges immediately (async).', flow:[['c', 'l', 'UPDATE photo'], ['l', 'c', 'OK']], sub:{l:'log pos 1043'}, hl:['l']},
        {note:'The change streams to followers; Follower 2 is a few hundred milliseconds behind.', flow:[['l', 'f1', 'WAL 1043'], ['l', 'f2', 'WAL 1040…']], sub:{f1:'pos 1043'}, parallel:true},
        {note:'The app reads from Follower 2 and gets the <b>old photo</b> — a read-your-writes violation.', flow:[['c', 'f2', 'SELECT'], ['f2', 'c', 'old photo']], status:{f2:'hot'}, hl:['f2']},
        {note:'The leader crashes. Follower 1 (most up to date) is <b>promoted</b>; any writes the leader acked but never shipped are lost.', status:{l:'down', f2:'ok'}, sub:{f1:'NEW LEADER'}, hl:['f1']},
        {note:'Follower 2 now replicates from the new leader, and the old leader must be <b>fenced</b> so it can’t accept writes if it comes back (split brain).', flow:[['f1', 'f2', 'WAL']], hl:['f1', 'f2']}
      ]},
    deep:`<p><b>Read-your-writes techniques:</b> read from the leader for a few seconds after a user writes; track the log position of the user’s last write and only read from replicas that have reached it; or pin the user’s session to the leader. <b>Monotonic reads:</b> always route a user to the same replica.</p><p><b>Replication methods:</b> statement-based (fragile with non-determinism), physical WAL shipping (PostgreSQL streaming replication — byte-level, same major version), and logical/row-based (MySQL binlog ROW format, PostgreSQL logical replication — enables CDC and cross-version upgrades).</p><p><b>Failover is the dangerous part:</b> false positives during network blips promote a new leader while the old one is alive; without fencing (STONITH, leases, epoch numbers) both accept writes. Automated tools (Orchestrator, Patroni, cloud-managed failover) encode this — and still need rehearsal.</p>`
  },
  tradeoffs:{use:[`<b>Leader-follower async</b> for read scaling and HA in most apps`, `<b>Synchronous/semi-sync</b> where losing an acknowledged write is unacceptable`, `<b>Multi-leader</b> for multi-region writes or offline-capable clients — only with a conflict strategy`, `<b>Leaderless</b> for always-writeable, partition-tolerant KV workloads`], avoid:[`Reading from replicas right after writes without a strategy`, `Automatic failover without fencing`, `Multi-leader with last-write-wins for money`], alt:[`Consensus-replicated databases (Raft/Paxos: etcd, Spanner, CockroachDB)`, `Caching for read scaling`]},
  real:[
    {co:'GitHub', tier:'confirmed', text:'In October 2018 a 43-second network partition triggered automated MySQL failover to another region; writes landed on both sides, and reconciling them led to about 24 hours of degraded service.', src:'GitHub Engineering, “October 21 post-incident analysis” (2018)'},
    {co:'Uber', tier:'confirmed', text:'Cited PostgreSQL’s physical (WAL) replication characteristics — write amplification and replication bandwidth — among the reasons for moving core workloads to MySQL.', src:'Uber Engineering, “Why Uber Engineering Switched from Postgres to MySQL” (2016)'},
    {co:'Amazon (Dynamo)', tier:'confirmed', text:'Dynamo uses leaderless replication with sloppy quorums and hinted handoff so the shopping cart stays writeable during failures.', src:'DeCandia et al., SOSP 2007'}
  ],
  mistakes:[`Ignoring replica lag in user-facing reads`, `Failing over without fencing the old leader`, `Assuming async replication never loses data`],
  interview:[`State sync vs async and what is lost on failover (RPO)`, `Explain read-your-writes and how you’d guarantee it`],
  tryit:{note:'Run a leader with two followers. Change the replication mode, add lag, read from followers, and kill the leader.', pg:'replication'},
  sources:[`Kleppmann, DDIA ch. 5`, `GitHub post-incident analysis (2018)`, `DeCandia et al., Dynamo (2007)`]
},
{
  id:'sharding', title:'Sharding (partitioning)', minutes:12, tags:['sharding','partitioning','hash','range','directory','geo','hot shard','resharding'],
  summary:'Split data across machines by key so each holds a slice. Pick the shard key carefully: it decides balance, hot spots and which queries stay cheap.',
  problem:`<p>Your single PostgreSQL primary is at 90% CPU and 6 TB, growing 200 GB a month. Bigger hardware buys a year. To keep growing, the data must be split across many databases — but split by <em>what</em>? By user ID? Date? City? Each choice makes some queries trivial and others very expensive.</p>`,
  intuition:`A library too big for one building is split across branches. By surname (A–F, G–M…) is a range split: easy to find a surname, but the “S” branch is mobbed. By a hash of the member ID spreads everyone evenly, but “all books borrowed in Pune” means visiting every branch. A directory desk that says which branch holds which member is flexible — and becomes the thing everyone must ask first.`,
  how:{
    steps:[`<b>Range</b> sharding: contiguous key ranges per shard. Efficient range scans; risk of hot ranges (e.g. newest IDs or today’s date).`, `<b>Hash</b> sharding: shard = hash(key) mod N (or consistent hashing). Even spread; range queries hit every shard.`, `<b>Directory</b> sharding: a lookup table maps keys (or tenants) to shards. Flexible moves; the directory must be fast and highly available.`, `<b>Geo</b> sharding: by region/country — locality and data-residency compliance.`, `Choose a <b>shard key</b> that keeps related data together (all of a user’s orders) and spreads load. Cross-shard queries and transactions become expensive.`, `<b>Resharding</b>: adding shards moves data. Plan with many logical shards mapped to fewer physical nodes, or consistent hashing.`, `<b>Hot shards</b>: one celebrity/tenant overwhelms its shard → split that key, add a salt, or give the tenant its own shard.`],
    diagram:{title:'Hash-sharded users and their orders', w:780, h:280, alt:'A router hashes user IDs to one of three shards; a per-user query hits one shard, a global query fans out to all.',
      nodes:[{id:'app', type:'service', label:'App + shard router', x:110, y:140, w:160}, {id:'s1', type:'db', label:'Shard 1', sub:'hash % 3 = 0', x:470, y:50}, {id:'s2', type:'db', label:'Shard 2', sub:'hash % 3 = 1', x:470, y:140}, {id:'s3', type:'db', label:'Shard 3', sub:'hash % 3 = 2', x:470, y:230}, {id:'an', type:'db', label:'Analytics copy', x:690, y:140, w:130}],
      edges:[{from:'app', to:'s1'}, {from:'app', to:'s2'}, {from:'app', to:'s3'}, {from:'s1', to:'an', dashed:true}, {from:'s2', to:'an', dashed:true}, {from:'s3', to:'an', dashed:true}],
      steps:[
        {note:'“Orders of user 42”: hash(42) mod 3 = 1 → only <b>Shard 2</b>. Fast, because all of a user’s data shares the shard key.', flow:[['app', 's2', 'user 42'], ['s2', 'app']], hl:['s2']},
        {note:'“Total orders in Pune today” has no shard key → <b>scatter-gather</b> across every shard, then merge.', flow:[['app', 's1', 'Q'], ['app', 's2', 'Q'], ['app', 's3', 'Q']], parallel:true},
        {note:'A celebrity seller’s orders all land on Shard 3 → a <b>hot shard</b>.', status:{s3:'hot'}, flow:[['app', 's3'], ['app', 's3'], ['app', 's3']], parallel:true, hl:['s3']},
        {note:'Global analytics shouldn’t scatter-gather the OLTP shards at all: stream changes into an <b>analytics store</b> instead.', status:{s3:'ok'}, flow:[['s1', 'an'], ['s2', 'an'], ['s3', 'an']], parallel:true, hl:['an']}
      ]},
    deep:`<p><b>Logical shards:</b> create many more shards than machines (e.g. 4,096 logical shards on 16 hosts). Rebalancing moves whole logical shards between hosts, never re-hashing keys. Instagram embedded the logical shard ID in every generated ID; Notion split into 480 logical shards across 32 physical databases.</p><p><b>Cross-shard concerns:</b> unique constraints and foreign keys no longer span shards; transactions across shards need 2PC or sagas; secondary indexes are either local (query every shard) or global (a separately partitioned index, updated asynchronously). <b>Middleware</b> like Vitess (MySQL) or Citus (PostgreSQL) handles routing, resharding and scatter-gather; NewSQL databases shard automatically.</p><p><b>Migration playbook:</b> dual-write or CDC into the new layout, backfill, verify with shadow reads, then cut over reads and finally writes — per tenant or key range, reversibly.</p>`
  },
  tradeoffs:{use:[`<b>Hash</b> for even load on point lookups (user ID, order ID)`, `<b>Range</b> for time-ordered scans — with pre-splitting or composite keys to avoid hot ends`, `<b>Directory/tenant</b> for multi-tenant SaaS with uneven tenants`, `<b>Geo</b> for latency and data residency`], avoid:[`Sharding before exhausting vertical scaling, replicas, caching and query tuning`, `A shard key that most queries don’t include`, `Monotonic keys on range shards`], alt:[`Read replicas + caching`, `Functional partitioning (different tables/services on different databases)`, `Distributed SQL (Spanner, CockroachDB, YugabyteDB, TiDB)`]},
  real:[
    {co:'Instagram', tier:'confirmed', text:'Sharded PostgreSQL into thousands of logical shards mapped to fewer physical servers, generating IDs that embed the logical shard ID.', src:'Instagram Engineering, “Sharding & IDs at Instagram” (2012)'},
    {co:'Notion', tier:'confirmed', text:'Sharded its PostgreSQL monolith by workspace ID into 480 logical shards across 32 physical databases, migrating with double-writes and verification.', src:'Notion, “Herding elephants: lessons learned from sharding Postgres at Notion” (2021)'},
    {co:'YouTube → Vitess', tier:'confirmed', text:'Vitess was built at YouTube to shard MySQL; it is now a CNCF project used by companies including Slack.', src:'vitess.io; Slack Engineering, “Scaling Datastores at Slack with Vitess” (2020)'}
  ],
  mistakes:[`Choosing a shard key that splits a user’s data across shards`, `mod-N hashing with no plan for adding shards`, `Cross-shard joins on the hot path`, `Ignoring hot tenants/keys`],
  interview:[`Name the shard key, why it fits the main queries, and how you’d reshard`, `Discuss hot shards and cross-shard queries proactively`],
  tryit:{note:'Shard a workload by hash, range, consistent hashing or a directory. Add shards and watch data movement and hot spots.', pg:'sharding'},
  sources:[`Instagram Engineering (2012)`, `Notion engineering blog (2021)`, `Vitess documentation`, `Kleppmann, DDIA ch. 6`]
},
{
  id:'consistent-hashing', title:'Consistent hashing and virtual nodes', minutes:9, tags:['consistent hashing','virtual nodes','hash ring','rebalancing'],
  summary:'Put servers and keys on the same hash ring; each key belongs to the next server clockwise. Adding a server moves only ~1/N of keys. Virtual nodes smooth the spread.',
  problem:`<p>Your cache cluster uses <code>server = hash(key) mod N</code>. You add a 5th server to 4 — and ~80% of keys suddenly map to a different server. The hit ratio collapses to near zero and the database is flooded. Adding capacity caused an outage.</p>`,
  intuition:`Seats around a round dining table, with guests (keys) and waiters (servers) placed at fixed spots. Each guest is served by the next waiter clockwise. A new waiter joining only takes over the guests between themself and the previous waiter — nobody else changes waiter.`,
  how:{
    steps:[`Hash each server to a position on a ring (0 … 2³²−1).`, `Hash each key; walk clockwise to the first server — that server owns the key.`, `Add a server: it takes over only the keys between itself and its predecessor (≈ 1/N of all keys).`, `Remove a server: its keys move to its successor only.`, `With few servers, positions are uneven → some own huge arcs. <b>Virtual nodes</b>: each physical server appears at 100–256 positions, evening out load and spreading a failed server’s keys across many successors.`, `Weighted capacity: give bigger servers more virtual nodes.`],
    diagram:{title:'Adding a server moves only one arc', w:700, h:280, alt:'Keys on a ring are owned by the next server clockwise; adding server D takes over only keys from C’s range.',
      nodes:[{id:'A', type:'cache', label:'Server A', x:350, y:40}, {id:'B', type:'cache', label:'Server B', x:600, y:180}, {id:'C', type:'cache', label:'Server C', x:100, y:180}, {id:'D', type:'cache', label:'Server D', sub:'new', x:200, y:60, hidden:true}, {id:'k1', type:'client', label:'key “cart:9”', x:470, y:250, w:130}, {id:'k2', type:'client', label:'key “user:7”', x:110, y:90, w:130}],
      edges:[{from:'A', to:'B', curve:.2}, {from:'B', to:'C', curve:.25}, {from:'C', to:'A', curve:.2}, {from:'k1', to:'B', dashed:true}, {from:'k2', to:'A', dashed:true}, {from:'C', to:'D', curve:.1}, {from:'D', to:'A', curve:.1}],
      steps:[
        {note:'Three servers on the ring. “cart:9” falls between A and B, so its owner is <b>B</b> (next clockwise).', flow:[['k1', 'B', 'owner']], hl:['B']},
        {note:'“user:7” falls between C and A → owned by <b>A</b>.', flow:[['k2', 'A', 'owner']], hl:['A']},
        {note:'Add <b>Server D</b> between C and A. Only keys on the arc C→D move (from A to D). “cart:9” doesn’t move.', reveal:['D'], hideEdges:[['C', 'A']], hl:['D']},
        {note:'“user:7” now lies on C→D → moves to D. Everything else stays put: ~1/N movement instead of ~all.', flow:[['k2', 'D', 'new owner']], hl:['D']}
      ]},
    deep:`<p><b>Origins:</b> Karger et al. (1997) introduced consistent hashing for distributed web caching; Akamai was founded on related work. Amazon’s Dynamo and Apache Cassandra use rings with virtual nodes (Cassandra’s <code>num_tokens</code>).</p><p><b>Alternatives:</b> <i>rendezvous (highest-random-weight) hashing</i> — score every server per key and pick the max; no ring, minimal movement, O(N) per lookup. <i>Jump consistent hash</i> (Google, 2014) — tiny and fast, but servers must be numbered sequentially (great for sharded storage, not for arbitrary node removal). <i>Maglev hashing</i> builds a lookup table with near-perfect balance for load balancers. Consistent hashing with <b>bounded loads</b> caps any server at (1+ε)× average.</p>`
  },
  tradeoffs:{use:[`Distributed caches and KV stores where nodes join/leave`, `Load balancers needing per-key stickiness with minimal remapping`, `Leaderless databases (Dynamo, Cassandra)`], avoid:[`Few physical nodes without virtual nodes (lumpy load)`, `Using it where a directory with explicit placement is simpler (few, large tenants)`], alt:[`Rendezvous hashing`, `Jump consistent hash`, `Logical shards + directory`]},
  real:[
    {co:'Amazon Dynamo', tier:'confirmed', text:'Partitions data with consistent hashing and virtual nodes, replicating each key to the next N nodes on the ring.', src:'DeCandia et al., SOSP 2007'},
    {co:'Apache Cassandra', tier:'confirmed', text:'Assigns each node multiple tokens (vnodes) on the ring via <code>num_tokens</code> to balance data and speed up rebuilds.', src:'Apache Cassandra documentation'},
    {co:'Research', tier:'confirmed', text:'Consistent hashing was introduced for relieving hot spots in distributed web caches.', src:'Karger et al., STOC 1997'}
  ],
  mistakes:[`mod-N hashing for caches that scale up and down`, `No virtual nodes`, `Forgetting replication: keys also live on the next R−1 nodes`],
  interview:[`Explain the ring, clockwise ownership, ~1/N movement and why vnodes matter`],
  tryit:{note:'Add and remove servers on a live ring; compare key movement with mod-N hashing.', pg:'hash-ring'},
  sources:[`Karger et al., STOC 1997`, `DeCandia et al., SOSP 2007`, `Lamping & Veach, “A Fast, Minimal Memory, Consistent Hash Algorithm” (2014)`]
},
{
  id:'connection-pooling', title:'Connection pooling', minutes:7, tags:['connection pool','PgBouncer','HikariCP','max_connections'],
  summary:'Opening database connections is expensive and databases cap them. Pools reuse a small number of connections; external poolers multiplex thousands of clients onto a few.',
  problem:`<p>You autoscale from 20 to 120 app instances for a sale. Each has a pool of 20 connections — 2,400 connections against a PostgreSQL server configured for 100. New instances crash on startup, and the database spends its CPU juggling connections instead of running queries.</p>`,
  intuition:`A taxi stand with 10 taxis. Passengers queue briefly and taxis are reused. Giving every passenger their own taxi (one connection per request) jams the roads — and the city (database) only has so much road.`,
  how:{
    steps:[`Creating a connection costs TCP + TLS + authentication + server-side setup (PostgreSQL forks a process per connection).`, `An <b>application pool</b> (HikariCP, pgx, SQLAlchemy) keeps N connections open and lends them per query or transaction.`, `Size by <b>Little’s Law</b>: busy connections = QPS × query time. 4,000 QPS × 5 ms = 20.`, `A database runs only ~a few concurrent queries per CPU core efficiently; more connections add contention, not throughput.`, `With many app instances, put an <b>external pooler</b> (PgBouncer, RDS Proxy) in front: thousands of client connections share a few dozen server connections.`],
    diagram:{title:'Many apps, few database connections', w:760, h:260, alt:'Many app instances connect to a pooler, which multiplexes them onto a small number of database connections.',
      nodes:[{id:'a1', type:'service', label:'App ×40', sub:'pool 10 each', x:100, y:70, w:130}, {id:'a2', type:'service', label:'App ×80', sub:'autoscaled', x:100, y:190, w:130}, {id:'pb', type:'lb', label:'PgBouncer', sub:'transaction mode', x:370, y:130, w:150}, {id:'db', type:'db', label:'PostgreSQL', sub:'30 server conns', x:640, y:130, w:150}],
      edges:[{from:'a1', to:'pb'}, {from:'a2', to:'pb'}, {from:'pb', to:'db'}],
      steps:[
        {note:'1,200 client connections from 120 instances arrive at the pooler — cheap for PgBouncer to hold.', flow:[['a1', 'pb', 'conn'], ['a2', 'pb', 'conn'], ['a2', 'pb', 'conn']], parallel:true, hl:['pb']},
        {note:'For each transaction, the pooler lends one of only <b>30</b> real server connections, returning it at COMMIT.', flow:[['pb', 'db', 'BEGIN…COMMIT']], hl:['db']},
        {note:'The database runs ~30 queries concurrently on its cores — near peak efficiency — instead of thrashing between 1,200 processes.', flow:[['pb', 'db', 'tx'], ['pb', 'db', 'tx']], parallel:true}
      ]},
    deep:`<p><b>Pooling modes (PgBouncer):</b> <i>session</i> (a client keeps a server connection for its whole session — safe, little gain), <i>transaction</i> (server connection only for the duration of a transaction — big gain, but session state such as temporary tables, session-level <code>SET</code> and some prepared-statement usage needs care), <i>statement</i> (only single statements; no multi-statement transactions).</p><p><b>Sizing wisdom:</b> the HikariCP project’s guideline starts from <code>connections = core_count × 2 + effective_spindle_count</code> on the database side — often surprisingly small. Queueing in the pool is fine; queueing inside the database is worse. Set pool <i>acquire timeouts</i> so overload fails fast, and alert on wait time.</p>`
  },
  tradeoffs:{use:[`An app-level pool always`, `An external pooler when instance count × pool size approaches max_connections, or with serverless functions`], avoid:[`Opening a connection per request`, `Huge pools “for safety”`, `Transaction pooling with code that relies on session state`], alt:[`Read replicas to spread read connections`, `Data APIs/proxies (e.g. managed database proxies)`]},
  real:[
    {co:'PgBouncer', tier:'confirmed', text:'A lightweight PostgreSQL connection pooler supporting session, transaction and statement pooling modes.', src:'PgBouncer documentation'},
    {co:'PostgreSQL', tier:'confirmed', text:'Uses a process-per-connection architecture, with <code>max_connections</code> defaulting to 100.', src:'PostgreSQL documentation'},
    {co:'HikariCP', tier:'confirmed', text:'Its “About Pool Sizing” guide argues for small pools and gives the cores × 2 + spindles starting formula.', src:'HikariCP wiki — About Pool Sizing'}
  ],
  mistakes:[`Pool size × instances > max_connections`, `No acquire timeout (requests hang forever)`, `Serverless functions each opening their own connections`],
  interview:[`Size the pool with Little’s Law and mention an external pooler at scale`],
  tryit:{note:'Size pools for your fleet and see whether you exceed the database’s limits.', mount:host => poolCalc(host)},
  sources:[`PgBouncer docs`, `HikariCP wiki — About Pool Sizing`, `PostgreSQL docs — connections`]
},
{
  id:'oltp-olap', title:'OLTP vs OLAP: warehouses, lakes, lakehouses, ETL vs ELT', minutes:10, tags:['OLTP','OLAP','column store','data warehouse','data lake','lakehouse','ETL','ELT'],
  summary:'OLTP serves many small, fast transactions on current data. OLAP scans huge histories for aggregates — with columnar storage in warehouses, lakes and lakehouses.',
  problem:`<p>The finance team runs “revenue by city by month for 3 years” on the production orders database at 11 AM. It scans 2 billion rows, saturates disk I/O, and checkout latency triples. Analytics and transactions have opposite needs and should not share a database.</p>`,
  intuition:`OLTP is the shop counter: many quick sales, one at a time, always current. OLAP is the accountant at the year-end: reads every receipt to compute totals, slowly and thoroughly. You don’t let the accountant block the counter — you give them photocopies in a back office.`,
  how:{
    steps:[`<b>OLTP</b>: point reads/writes, short transactions, normalized row stores (PostgreSQL, MySQL).`, `<b>OLAP</b>: large scans and aggregates over history; <b>column stores</b> read only needed columns, compress well and vectorise (BigQuery, Snowflake, Redshift, ClickHouse).`, `<b>Data warehouse</b>: curated, structured, schema-on-write tables for BI.`, `<b>Data lake</b>: cheap object storage holding raw files in open formats (Parquet, JSON); schema-on-read.`, `<b>Lakehouse</b>: table formats (Delta Lake, Apache Iceberg, Apache Hudi) add ACID tables, schema evolution and time travel on top of the lake.`, `<b>ETL</b>: transform before loading. <b>ELT</b>: load raw into the warehouse, transform with SQL there (dbt) — popular now that warehouses are elastic.`],
    diagram:{title:'Keeping analytics off the OLTP path', w:800, h:260, alt:'OLTP databases stream changes into a data lake and warehouse where BI tools query without touching production.',
      nodes:[{id:'app', type:'service', label:'Checkout svc', x:90, y:80}, {id:'oltp', type:'db', label:'OLTP Postgres', x:280, y:80, w:140}, {id:'cdc', type:'queue', label:'CDC / batch extract', x:300, y:200, w:160}, {id:'lake', type:'db', label:'Data lake', sub:'Parquet / Iceberg', x:520, y:200, w:140}, {id:'wh', type:'db', label:'Warehouse', sub:'columnar', x:700, y:120, w:130}, {id:'bi', type:'client', label:'BI dashboards', x:700, y:230, w:130}],
      edges:[{from:'app', to:'oltp'}, {from:'oltp', to:'cdc'}, {from:'cdc', to:'lake'}, {from:'lake', to:'wh'}, {from:'wh', to:'bi'}],
      steps:[
        {note:'Checkout writes small transactions to the <b>OLTP</b> database. Nothing else is allowed to scan it.', flow:[['app', 'oltp', 'INSERT order']], hl:['oltp']},
        {note:'Changes are extracted continuously (CDC) or nightly into the <b>lake</b> as columnar files.', flow:[['oltp', 'cdc', 'changes'], ['cdc', 'lake', 'Parquet']], hl:['lake']},
        {note:'ELT: raw data loads into the <b>warehouse</b>; SQL models build clean fact and dimension tables there.', flow:[['lake', 'wh', 'load + transform']], hl:['wh']},
        {note:'Analysts query the warehouse — scanning billions of rows without touching checkout.', flow:[['bi', 'wh', 'SUM by city'], ['wh', 'bi']], hl:['bi']}
      ]},
    deep:`<p><b>Why columnar wins for analytics:</b> a query touching 3 of 100 columns reads ~3% of the bytes; similar values in a column compress extremely well (run-length, dictionary encoding); min/max statistics per block let engines skip data; operations run on vectors of values. Google’s Dremel (2010) showed interactive SQL over trillions of rows with nested columnar storage — the basis of BigQuery.</p><p><b>Modelling:</b> star schemas (fact tables of events with foreign keys to dimension tables) remain the standard for BI. <b>HTAP</b> systems try to serve both workloads, typically by keeping a columnar replica of the row store. <b>Freshness</b> is a design choice: nightly batch, micro-batch, or streaming (Module 7).</p>`
  },
  tradeoffs:{use:[`<b>Warehouse</b> for governed BI on structured data`, `<b>Lake</b> for cheap storage of raw/semi-structured data and ML`, `<b>Lakehouse</b> when you want both on open formats`, `<b>ELT</b> with an elastic warehouse; <b>ETL</b> when you must clean/redact before loading`], avoid:[`Analytics queries on the production OLTP primary`, `A “data swamp”: a lake with no catalogue or ownership`], alt:[`A read replica for light internal reporting`, `ClickHouse/Druid/Pinot for real-time user-facing analytics`]},
  real:[
    {co:'Google BigQuery (Dremel)', tier:'confirmed', text:'Dremel introduced columnar storage of nested data and tree-based query execution for interactive analysis at massive scale; it underpins BigQuery.', src:'Melnik et al., “Dremel”, VLDB 2010'},
    {co:'Snowflake', tier:'confirmed', text:'Separates storage (in cloud object stores) from elastic compute warehouses, so analytics scale independently.', src:'Dageville et al., “The Snowflake Elastic Data Warehouse”, SIGMOD 2016'},
    {co:'Databricks', tier:'confirmed', text:'Proposed the lakehouse architecture: ACID table formats and warehouse-style performance directly on open data-lake files.', src:'Armbrust et al., “Lakehouse”, CIDR 2021'}
  ],
  mistakes:[`Reporting queries on the OLTP primary`, `No defined freshness SLA for analytics data`, `Copying PII into the lake without governance`],
  interview:[`When analytics appear in requirements, add a pipeline to a separate store`, `Explain why columnar storage is faster for aggregates`],
  tryit:{note:'Compare bytes scanned by a row store and a column store for a monthly revenue query.', mount:host => rowColDemo(host)},
  sources:[`Melnik et al., Dremel, VLDB 2010`, `Dageville et al., SIGMOD 2016`, `Armbrust et al., CIDR 2021`, `Kimball & Ross, “The Data Warehouse Toolkit”`]
},
{
  id:'storage-types', title:'Object, block and file storage; GFS/HDFS; backups and tiering', minutes:10, tags:['object storage','block storage','file storage','GFS','HDFS','backups','tiered storage'],
  summary:'Block for databases, file for shared POSIX access, object for everything big and cheap. Durability needs replication and backups; cost needs tiering.',
  problem:`<p>Your app stores user uploads on the app server’s local disk. Add a second server and half the images 404. Then the disk fails and three months of uploads vanish — the “backup” was a nightly copy to the same disk array. Where data lives, and how it is protected, are design decisions.</p>`,
  intuition:`Block storage is a raw hard drive you format yourself (a plot of land). File storage is a shared office filing cabinet with folders (a shared building). Object storage is a warehouse with numbered boxes: you hand over a box and get a claim ticket (a key/URL) — enormous, cheap, durable, but you can’t edit the middle of a box, only replace it.`,
  how:{
    steps:[`<b>Block</b> (EBS, Persistent Disk, SAN): fixed-size blocks, attached to one machine; low latency; for databases and boot volumes.`, `<b>File</b> (NFS, EFS, SMB): a shared POSIX filesystem many machines mount; convenient, harder to scale.`, `<b>Object</b> (S3, GCS, Azure Blob): flat key → object + metadata over HTTP; virtually unlimited, highly durable, immutable objects; ideal for media, backups, data lakes.`, `<b>Distributed file systems</b> (GFS → HDFS): big files split into large chunks/blocks replicated across commodity machines, coordinated by a metadata master.`, `<b>Backups</b>: the 3-2-1 rule — 3 copies, 2 media types, 1 off-site; test restores; replication is <i>not</i> a backup (it copies deletions and corruption too).`, `<b>Tiering</b>: move data to colder, cheaper classes as it ages (lifecycle policies).`],
    diagram:{title:'Uploads done right', w:760, h:260, alt:'Clients upload directly to object storage with a pre-signed URL; a CDN serves reads; lifecycle rules tier old objects; backups go cross-region.',
      nodes:[{id:'c', type:'client', label:'Mobile app', x:80, y:130}, {id:'api', type:'service', label:'Upload API', x:260, y:50}, {id:'obj', type:'db', label:'Object storage', sub:'bucket', x:480, y:130, w:150}, {id:'cdn', type:'cdn', label:'CDN', x:260, y:220}, {id:'cold', type:'db', label:'Archive tier', x:690, y:60, w:130}, {id:'bk', type:'db', label:'Other-region copy', x:690, y:210, w:150}],
      edges:[{from:'c', to:'api'}, {from:'c', to:'obj'}, {from:'cdn', to:'obj'}, {from:'c', to:'cdn'}, {from:'obj', to:'cold', dashed:true}, {from:'obj', to:'bk', dashed:true}],
      steps:[
        {note:'The app asks the API for a <b>pre-signed upload URL</b> (auth + size/type limits) — the API never streams the bytes itself.', flow:[['c', 'api', 'POST /uploads'], ['api', 'c', 'signed URL']], hl:['api']},
        {note:'The phone uploads directly to <b>object storage</b>.', flow:[['c', 'obj', 'PUT photo.jpg']], hl:['obj']},
        {note:'Reads come through the <b>CDN</b>, which fetches from the bucket on a miss.', flow:[['c', 'cdn', 'GET'], ['cdn', 'obj', 'miss'], ['obj', 'cdn'], ['cdn', 'c']], hl:['cdn']},
        {note:'Lifecycle rules move objects untouched for 90 days to an <b>archive tier</b>; replication/backups keep a copy in <b>another region</b>.', flow:[['obj', 'cold', 'lifecycle'], ['obj', 'bk', 'replicate']], parallel:true}
      ]},
    deep:`<p><b>GFS (2003):</b> files split into 64 MB chunks, each replicated (3× by default) on chunkservers; a single master holds metadata in memory; designed for large sequential reads and appends on failure-prone commodity hardware. HDFS followed the same model (default block size 128 MB). Single-master metadata later became a scaling limit (GFS’s successor Colossus distributes it).</p><p><b>Durability engineering:</b> object stores reach very high durability with replication across zones and erasure coding (e.g. Reed-Solomon: k data + m parity fragments survive m losses at far less overhead than 3× replication), plus continuous integrity checking. <b>RPO/RTO</b> (Module 9) drive backup frequency and restore design; point-in-time recovery combines base backups with WAL archives. Immutable/object-lock backups defend against ransomware and accidental deletion.</p>`
  },
  tradeoffs:{use:[`<b>Object</b> for media, documents, backups, logs, data lakes`, `<b>Block</b> for databases and low-latency random I/O`, `<b>File</b> for legacy apps needing shared POSIX semantics`], avoid:[`User uploads on local app-server disks`, `Treating replicas as backups`, `Backups never test-restored`], alt:[`Managed databases with point-in-time recovery`, `Erasure-coded storage for cost-efficient durability`]},
  real:[
    {co:'Google File System', tier:'confirmed', text:'Described a distributed file system with 64 MB chunks replicated across commodity servers and a single metadata master.', src:'Ghemawat, Gobioff & Leung, “The Google File System”, SOSP 2003'},
    {co:'Amazon S3', tier:'confirmed', text:'Designed for 99.999999999% (11 nines) durability by storing data redundantly across multiple devices and facilities, with lifecycle rules to transition objects between storage classes.', src:'Amazon S3 documentation'},
    {co:'GitLab', tier:'confirmed', text:'In January 2017 an accidental deletion of a production database directory was compounded by backup procedures that were not working, losing about six hours of data — a widely cited lesson in testing restores.', src:'GitLab, “Postmortem of database outage of January 31” (2017)'}
  ],
  mistakes:[`Backups that have never been restored`, `Replication mistaken for backup`, `Public buckets by accident`, `No lifecycle policy (paying hot prices for cold data)`],
  interview:[`Uploads → pre-signed URLs to object storage + CDN`, `State RPO/RTO and how backups meet them`],
  tryit:{note:'Estimate how much lifecycle tiering saves on a large object store.', mount:host => tierCalc(host)},
  sources:[`Ghemawat et al., GFS, SOSP 2003`, `Shvachko et al., “The Hadoop Distributed File System” (2010)`, `GitLab postmortem (2017)`, `Amazon S3 documentation`]
}
];

SDA.register({
  kind:'module', id:'databases', order:5, level:'intermediate', icon:'🗄️', title:'Databases & Storage',
  summary:'Database families and how to choose, ACID vs BASE, indexes, B-trees vs LSM-trees, normalization, isolation levels and MVCC, locking, replication, sharding, consistent hashing, connection pooling, OLTP vs OLAP, and object/block/file storage with backups.',
  outcomes:['Pick a database family from access patterns', 'Design indexes and explain query plans', 'Reason about isolation anomalies and concurrency control', 'Design replication with clear failover and read-consistency behaviour', 'Choose a shard key, plan resharding and separate OLTP from analytics'],
  lessons,
  quiz:[
    {q:'Composite index (city, category, price). Which query can use it to seek?', options:['WHERE category = ?', 'WHERE price BETWEEN ? AND ?', 'WHERE city = ? AND price > ?', 'WHERE category = ? AND price = ?'], answer:2, why:'Leftmost prefix: city is used for the seek; price is filtered within that range (category is skipped, so price can’t narrow the seek fully).'},
    {q:'Write-heavy GPS ingestion at 200K writes/s. Which storage engine family fits best?', options:['B-tree', 'LSM-tree', 'Hash index in RAM only', 'A spreadsheet'], answer:1, why:'LSM turns random writes into sequential flushes and background merges.'},
    {q:'Two doctors each check “someone else is on call” and both go off call. This anomaly is…', options:['Dirty read', 'Phantom', 'Write skew', 'Lost update'], answer:2, why:'Overlapping reads, disjoint writes — only Serializable prevents it.'},
    {q:'PostgreSQL’s default isolation level is…', options:['Read Uncommitted', 'Read Committed', 'Repeatable Read', 'Serializable'], answer:1, why:'MySQL InnoDB defaults to Repeatable Read; PostgreSQL to Read Committed.'},
    {q:'A user updates their profile then immediately sees the old one. Most likely cause?', options:['Cache stampede', 'Reading from a lagging async replica', 'Deadlock', 'Wrong index'], answer:1, why:'A read-your-writes violation from replication lag.'},
    {q:'With mod-N hashing, scaling a cache from 4 to 5 nodes remaps about…', options:['20% of keys', '50%', '80%', '100%'], answer:2, why:'Only ~1 in 5 keys keeps the same node; consistent hashing would move ~20%.'},
    {q:'What do virtual nodes improve in consistent hashing?', options:['Encryption', 'Load balance across servers and spread of a failed node’s keys', 'Write durability', 'Query planning'], answer:1, why:'Many positions per server average out arc sizes.'},
    {q:'120 instances × pool of 20 against max_connections = 100. Best fix?', options:['Raise pool size', 'Add an external pooler (e.g. PgBouncer) and shrink per-instance pools', 'Remove indexes', 'Use UDP'], answer:1, why:'Multiplex many client connections onto a few server connections.'},
    {q:'Why are column stores faster for SUM over one column of a wide table?', options:['They have no indexes', 'They read only the needed columns, compress them well and skip blocks', 'They use B-trees', 'They are in-memory only'], answer:1, why:'Bytes read drop by orders of magnitude.'},
    {q:'Which is NOT a backup?', options:['A daily snapshot copied to another region', 'An async replica', 'An immutable archive with versioning', 'WAL archive + base backup'], answer:1, why:'Replicas faithfully copy deletions and corruption.'},
    {q:'Best way to sell the last T-shirt exactly once?', options:['Read qty in app, then UPDATE qty = qty_read − 1', '<code>UPDATE … SET qty = qty − 1 WHERE sku = ? AND qty &gt; 0</code> and check rows affected', 'Cache the quantity', 'Eventual consistency'], answer:1, why:'An atomic conditional update needs no explicit lock and can’t oversell.'},
    {type:'scenario', q:'Your PostgreSQL primary is at 85% CPU and 4 TB, growing fast. Outline a plan before and including sharding.', answer:'<ol><li><b>Measure:</b> top queries by total time (pg_stat_statements); fix missing indexes and N+1s.</li><li><b>Offload reads:</b> cache hot reads; route read-only queries to replicas with read-your-writes handling.</li><li><b>Move analytics</b> off the primary (CDC → warehouse).</li><li><b>Archive cold data</b> (partition by time; detach old partitions to cheaper storage).</li><li><b>Scale up</b> while it’s cheap and simple.</li><li><b>Then shard</b> by the key most queries include (user_id or tenant_id), using many logical shards on few hosts (or Citus/Vitess-style middleware); migrate per tenant with dual-writes/CDC, backfill, shadow reads, and gradual cutover.</li></ol>'},
    {type:'scenario', q:'Design replication for a payments ledger in one region with a strict “never lose an acknowledged write” rule.', answer:'<ul><li>Leader plus followers across availability zones with <b>synchronous (or semi-sync, ≥1) replication</b> so a commit is on two zones before acknowledging (RPO = 0 for single-zone failure).</li><li><b>Automated failover with fencing</b> (Patroni/managed service); promote only fully caught-up replicas.</li><li>Reads that must be current go to the leader; reporting goes to async replicas or the warehouse.</li><li>Idempotency keys on every write so client retries after a failover are safe.</li><li>Point-in-time recovery backups (base + WAL archive) to another region; regularly tested restores; consider a consensus-replicated database if multi-region RPO = 0 is needed.</li></ul>'}
  ],
  cheatsheet:[
    {h:'🧭 Choosing', items:['Relational by default; specialise per access pattern', 'KV · document · wide-column · graph · TS · search · vector', 'One system of record; others derived via CDC']},
    {h:'🔒 ACID & isolation', items:['A atomic · C invariants · I isolation · D durable (WAL)', 'RC: no dirty reads (Postgres default)', 'RR/SI: stable snapshot (MySQL default)', 'Serializable: stops write skew (retry aborts)', 'MVCC: readers don’t block writers']},
    {h:'📇 Indexes & engines', items:['B-tree: equality, range, order', 'Composite: leftmost prefix; range stops it', 'Covering → index-only scan', 'LSM: memtable → SSTables → compaction', 'Write/read/space amplification']},
    {h:'🔁 Replication', items:['Leader-follower: sync / semi-sync / async', 'Lag → read-your-writes, monotonic reads', 'Failover needs fencing (split brain)', 'Multi-leader → conflicts', 'Leaderless: R + W > N']},
    {h:'🧩 Sharding', items:['Hash (even) · range (scans) · directory · geo', 'Shard key = in most queries, spreads load', 'Many logical shards on few hosts', 'Consistent hashing + vnodes: ~1/N moves', 'Hot shards → split/salt/isolate']},
    {h:'🏗️ Ops & analytics', items:['Pool size = QPS × query time; use PgBouncer at scale', 'OLTP rows vs OLAP columns', 'Warehouse · lake · lakehouse; ELT with dbt', 'Object for blobs; block for DBs', '3-2-1 backups; test restores; tier cold data']}
  ],
  glossary:[
    {term:'ACID', def:'Atomicity, Consistency, Isolation, Durability — the guarantees of database transactions.'},
    {term:'BASE', def:'Basically Available, Soft state, Eventually consistent — an approach trading strict guarantees for availability and scale.'},
    {term:'Eventual consistency', aka:['eventually consistent'], def:'If no new updates occur, all replicas converge to the same value.'},
    {term:'Write-ahead log', aka:['WAL', 'redo log'], def:'An append-only log of changes written before data pages, enabling crash recovery and replication.'},
    {term:'Transaction', aka:['transactions'], def:'A group of operations executed as one all-or-nothing unit.'},
    {term:'Isolation level', aka:['isolation levels'], def:'The degree to which concurrent transactions are shielded from each other’s effects.'},
    {term:'Dirty read', def:'Reading data written by a transaction that has not yet committed.'},
    {term:'Non-repeatable read', def:'Reading the same row twice in a transaction and getting different values.'},
    {term:'Phantom read', aka:['phantom'], def:'A repeated range query returning rows inserted by another transaction meanwhile.'},
    {term:'Lost update', def:'Two read-modify-write cycles where one silently overwrites the other.'},
    {term:'Write skew', def:'Two transactions read overlapping data and write different rows, jointly violating an invariant.'},
    {term:'Snapshot isolation', def:'Each transaction reads from a consistent snapshot taken at its start; prevents most anomalies except write skew.'},
    {term:'Serializable', aka:['serializability'], def:'The strongest isolation: results equal some one-at-a-time ordering of transactions.'},
    {term:'MVCC', aka:['multi-version concurrency control'], def:'Keeping multiple row versions so readers see a snapshot without blocking writers.'},
    {term:'Optimistic locking', aka:['optimistic concurrency control'], def:'Detect conflicts at write time (e.g. version column) and retry instead of locking upfront.'},
    {term:'Pessimistic locking', def:'Locking rows before working on them so others must wait.'},
    {term:'Deadlock', def:'Two or more transactions each waiting for locks the other holds.'},
    {term:'B-tree', aka:['B+tree'], def:'A balanced, sorted tree of pages supporting fast lookups and range scans; the default database index.'},
    {term:'LSM-tree', aka:['log-structured merge-tree', 'LSM'], def:'A write-optimised structure buffering writes in memory and merging immutable sorted files in the background.'},
    {term:'SSTable', aka:['sorted string table'], def:'An immutable, sorted on-disk file of key-value pairs used by LSM engines.'},
    {term:'Memtable', def:'The in-memory sorted buffer of recent writes in an LSM engine.'},
    {term:'Compaction', def:'Merging LSM files to discard overwritten and deleted data.'},
    {term:'Write amplification', def:'Bytes physically written per byte of logical data written.'},
    {term:'Composite index', def:'An index on multiple columns, ordered by the first column, then the second, and so on.'},
    {term:'Covering index', def:'An index containing every column a query needs, so the table isn’t read.'},
    {term:'Inverted index', def:'A map from terms to the documents containing them; the basis of full-text search.'},
    {term:'Normalization', def:'Structuring data so each fact is stored once, avoiding update anomalies.'},
    {term:'Denormalization', def:'Deliberately duplicating data to speed up reads.'},
    {term:'Replication', def:'Keeping copies of data on multiple machines.'},
    {term:'Leader-follower replication', aka:['primary-replica', 'leader', 'follower', 'read replica', 'read replicas'], def:'One node accepts writes and streams changes to read-only followers.'},
    {term:'Replication lag', def:'How far a follower is behind the leader.'},
    {term:'Read-your-writes', aka:['read-your-writes consistency'], def:'A guarantee that a user always sees their own recent writes.'},
    {term:'Failover', def:'Promoting a replica to replace a failed leader.'},
    {term:'Split brain', def:'Two nodes both believing they are the leader and accepting writes.'},
    {term:'Multi-leader replication', def:'Several nodes accept writes and replicate to each other, requiring conflict resolution.'},
    {term:'Leaderless replication', def:'Clients write to and read from multiple replicas directly, using quorums.'},
    {term:'Sharding', aka:['partitioning', 'shard', 'shards'], def:'Splitting a dataset across machines by key so each holds a subset.'},
    {term:'Shard key', aka:['partition key'], def:'The attribute used to decide which shard a record lives on.'},
    {term:'Hot shard', aka:['hot partition'], def:'A shard receiving disproportionate load.'},
    {term:'Resharding', aka:['rebalancing'], def:'Moving data between shards when adding/removing capacity or fixing imbalance.'},
    {term:'Virtual nodes', aka:['vnodes'], def:'Multiple ring positions per physical server in consistent hashing, for smoother balance.'},
    {term:'Connection pool', aka:['connection pooling'], def:'A set of reusable open database connections lent to requests.'},
    {term:'PgBouncer', def:'A lightweight connection pooler for PostgreSQL.'},
    {term:'OLTP', def:'Online Transaction Processing: many small, fast transactions on current data.'},
    {term:'OLAP', def:'Online Analytical Processing: large scans and aggregations over historical data.'},
    {term:'Column store', aka:['columnar storage', 'columnar'], def:'Storage that keeps each column’s values together, ideal for analytics.'},
    {term:'Data warehouse', def:'A curated, structured store optimised for analytical queries.'},
    {term:'Data lake', def:'Cheap object storage holding raw data files in open formats.'},
    {term:'Lakehouse', def:'A data lake with ACID table formats (Delta, Iceberg, Hudi) providing warehouse-like features.'},
    {term:'ETL', def:'Extract, Transform, Load — transforming data before loading it into the target.'},
    {term:'ELT', def:'Extract, Load, Transform — loading raw data first and transforming inside the warehouse.'},
    {term:'CDC', aka:['change data capture'], def:'Capturing row-level changes from a database’s log to stream them elsewhere.'},
    {term:'Object storage', def:'Flat key → immutable object storage over HTTP (S3, GCS), highly durable and scalable.'},
    {term:'Block storage', def:'Raw fixed-size blocks attached to one machine, used for databases and filesystems.'},
    {term:'Erasure coding', def:'Splitting data into fragments plus parity so it survives losses with less overhead than full replication.'},
    {term:'3-2-1 backup rule', def:'Keep 3 copies of data on 2 kinds of media with 1 copy off-site.'}
  ],
  sources:['Martin Kleppmann, “Designing Data-Intensive Applications”', 'Berenson et al., SIGMOD 1995; Ports & Grittner, VLDB 2012', 'Chang et al., Bigtable (2006); DeCandia et al., Dynamo (2007); Ghemawat et al., GFS (2003)', 'Melnik et al., Dremel (2010); Dageville et al., Snowflake (2016); Armbrust et al., Lakehouse (2021)', 'Engineering posts from Instagram, Notion, Discord, Uber, GitHub, GitLab and Slack cited per lesson']
});
} catch(e){ console.error('[SDA] Module "databases" failed to load', e); window.SDA && SDA.errors.push({id:'databases', error:e}); }
})();
