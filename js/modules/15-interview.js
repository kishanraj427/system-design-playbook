/* =====================================================================
   PART 8 · MODULE 15 — INTERVIEW & META
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, esc, clamp, fmtNum, fmtDur, fmtBytes, shuffle} = SDA.u; const ui = SDA.ui;
const {sortGame, orderGame} = SDA.m1helpers; const {frag} = SDA.ph;

/* ---------- widgets ---------- */
const PHASES = [
  {t:'Clarify requirements', min:5, ask:['Who are the users and what are the core use cases (pick 2–3)?', 'What is explicitly out of scope?', 'Non-functional: scale, latency, availability, consistency, region?']},
  {t:'Estimate', min:4, ask:['DAU → requests/s (average and peak)', 'Read:write ratio', 'Storage per year and bandwidth']},
  {t:'API design', min:5, ask:['3–5 key endpoints with request/response', 'Idempotency, pagination, auth']},
  {t:'Data model', min:5, ask:['Entities and relationships', 'Access patterns → keys and indexes', 'SQL vs NoSQL and why']},
  {t:'High-level design', min:10, ask:['Draw clients → LB → services → data stores → async', 'Walk one request end to end']},
  {t:'Deep dive', min:10, ask:['The 1–2 hardest components (the interviewer may choose)', 'Algorithms, consistency, caching, sharding']},
  {t:'Bottlenecks & trade-offs', min:6, ask:['Single points of failure and hot spots', 'What breaks at 10×? Failure scenarios', 'Summarise trade-offs and what you’d do next']}];
function interviewTimer(host, api){
  let idx = 0, left = PHASES[0].min * 60, running = false, timer = null; const total = PHASES.reduce((a, p) => a + p.min, 0);
  const track = el('div', {style:{display:'flex', gap:'4px', margin:'10px 0'}}); const now = el('div', {class:'card'}); const clock = el('span', {class:'chip mono', style:{fontSize:'15px'}});
  function render(){
    track.innerHTML = ''; PHASES.forEach((p, i) => track.append(el('div', {title:`${p.t}: ${p.min} min`, style:{flex:String(p.min), height:'10px', borderRadius:'4px', background:i < idx ? 'var(--ok)' : i === idx ? 'var(--accent1)' : 'var(--surface-3)'}})));
    const p = PHASES[idx]; now.innerHTML = '';
    now.append(el('div', {class:'row', style:{justifyContent:'space-between'}}, el('b', null, `${idx + 1}. ${p.t}`), el('span', {class:'lab-hint', style:{margin:0}}, `${p.min} of ${total} min`)), frag(h.list(p.ask)));
    clock.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')} left in this phase`;
    clock.style.color = left < 30 ? 'var(--warn)' : '';
  }
  const tick = () => { if (!running) return; left--; if (left <= 0){ if (idx < PHASES.length - 1){ idx++; left = PHASES[idx].min * 60; } else { running = false; left = 0; startB.innerHTML = '▶ Start'; } } render(); };
  const startB = ui.button('▶ Start', () => { running = !running; startB.innerHTML = running ? '⏸ Pause' : '▶ Start'; if (running && !timer) timer = setInterval(tick, 1000); }, 'sm primary');
  api.onDispose(() => clearInterval(timer));
  host.append(el('div', {class:'controls'}, startB, ui.button('⏭ Next phase', () => { idx = Math.min(PHASES.length - 1, idx + 1); left = PHASES[idx].min * 60; render(); }, 'sm'), ui.button('⏮ Reset', () => { idx = 0; left = PHASES[0].min * 60; running = false; startB.innerHTML = '▶ Start'; render(); }, 'sm ghost'), clock), track, now,
    el('p', {class:'lab-hint'}, 'A 45-minute practice clock. Real interviews vary: follow the interviewer’s lead, but keep this rhythm so you never run out of time before the deep dive.'));
  render();
}
const DRILLS = [
  {q:'A URL shortener creates 100 million new short links per month. Each record is ~500 bytes. How much storage after 5 years (ignore replication)?', unit:'bytes', ans:3e12, work:'100M × 12 × 5 = 6 billion records; 6e9 × 500 B = 3e12 B ≈ <b>3 TB</b>. Small enough for one well-sized database (plus replicas), which is a useful insight.', tier:'Illustrative assumptions'},
  {q:'WhatsApp has said it handles about 100 billion messages per day. What is the average number of messages per second?', unit:'/s', ans:1.157e6, work:'100e9 ÷ 86,400 s ≈ <b>1.16 million/s</b> on average; peaks (New Year’s Eve) are several times higher.', tier:'Daily volume publicly stated by WhatsApp/Meta (2020)'},
  {q:'UPI processed roughly 20 billion transactions in a month in 2025. What is the average transactions per second?', unit:'/s', ans:7.7e3, work:'20e9 ÷ (30 × 86,400 s) ≈ <b>7,700 TPS</b> average. Design for peaks (salary days, festivals, evenings) at several times that.', tier:'Monthly volume from NPCI published statistics (2025); peak factor illustrative'},
  {q:'YouTube has said 500 hours of video are uploaded every minute. If each hour of video needs ~3 GB once stored in all renditions, how much new storage per day?', unit:'bytes', ans:2.16e15, work:'500 h/min × 1,440 min = 720,000 h/day; × 3 GB = 2.16e15 B ≈ <b>2 PB per day</b> (before replication).', tier:'Upload rate publicly stated (2019); GB/hour illustrative'},
  {q:'A ride-hailing app has 1 million drivers online, each sending a GPS update every 4 seconds. Location writes per second?', unit:'/s', ans:2.5e5, work:'1,000,000 ÷ 4 = <b>250,000 writes/s</b>, so keep the latest location in memory (Redis/geo index) and stream history asynchronously.', tier:'Illustrative assumptions'},
  {q:'A photo app receives 100 million uploads per day at ~2 MB average (all sizes). Storage per year?', unit:'bytes', ans:7.3e16, work:'100M × 2 MB = 200 TB/day; × 365 ≈ 73 PB/year ≈ <b>73 PB</b>, which pushes you to object storage with tiering.', tier:'Illustrative assumptions'},
  {q:'A live cricket stream has 25 million concurrent viewers at an average 2 Mbps. Total delivery bandwidth?', unit:'bps', ans:5e13, work:'25e6 × 2e6 bps = 5e13 bps = <b>50 Tbps</b>. Only a large multi-CDN footprint can serve this; the origin must be shielded.', tier:'Concurrency of ~25M publicly reported (Hotstar 2019); bitrate illustrative'},
  {q:'A train-booking window opens at 10:00 and 1 million booking attempts arrive in the first 2 minutes. Average requests per second during those 2 minutes?', unit:'/s', ans:8.3e3, work:'1,000,000 ÷ 120 s ≈ <b>8,300/s</b>, with the first seconds far higher. That calls for queues/waiting rooms and seat-locking with short TTLs.', tier:'Illustrative assumptions'}];
function parseGuess(s){ const m = String(s).trim().replace(/,/g, '').match(/^([\d.]+)\s*([kmgbtp])?/i); if (!m) return NaN; const v = parseFloat(m[1]); const mult = {k:1e3, m:1e6, g:1e9, b:1e9, t:1e12, p:1e15}[(m[2] || '').toLowerCase()] || 1; return v * mult; }
const fmtUnit = (v, u) => u === 'bytes' ? fmtBytes(v) : u === 'bps' ? fmtNum(v) + 'bps' : fmtNum(v) + '/s';
function estimationDrills(host){
  let order = shuffle(DRILLS.map((_, i) => i)), pos = 0, score = 0, done = 0;
  const box = el('div'); const tally = el('span', {class:'chip mono'});
  function render(){
    const d = DRILLS[order[pos]]; box.innerHTML = '';
    const inp = el('input', {class:'input mono', placeholder:d.unit === 'bytes' ? 'e.g. 3TB' : d.unit === 'bps' ? 'e.g. 50T' : 'e.g. 1.2M', 'aria-label':'Your estimate', style:{maxWidth:'200px'}});
    const res = el('div');
    const go = () => { const g = parseGuess(inp.value); if (!isFinite(g) || g <= 0){ res.innerHTML = ''; res.append(el('div', {class:'verdict warn'}, 'Type a number, optionally with K, M, G/B, T or P (e.g. 250K, 3TB, 50T).')); return; }
      const ratio = Math.max(g / d.ans, d.ans / g); done++; if (ratio <= 3) score++;
      res.innerHTML = '';
      res.append(el('div', {class:'verdict ' + (ratio <= 3 ? 'ok' : ratio <= 10 ? 'warn' : 'bad')}, ratio <= 3 ? `🎯 ${fmtUnit(g, d.unit)}: within 3× of ${fmtUnit(d.ans, d.unit)}. Great estimate.` : ratio <= 10 ? `👍 ${fmtUnit(g, d.unit)}: right order of magnitude (answer ≈ ${fmtUnit(d.ans, d.unit)}).` : `✖ ${fmtUnit(g, d.unit)} is ${ratio.toFixed(0)}× off (answer ≈ ${fmtUnit(d.ans, d.unit)}). Check the units and the seconds per day (86,400).`), frag(h.callout('info', 'Worked answer', `<p>${d.work}</p><p class="lab-hint">${d.tier}.</p>`)));
      tally.textContent = `score ${score}/${done}`; };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    box.append(el('p', null, el('b', null, `Drill ${pos + 1}/${DRILLS.length}: `), d.q), el('div', {class:'controls'}, inp, ui.button('Check', go, 'sm primary'), ui.button('Next drill →', () => { pos = (pos + 1) % DRILLS.length; render(); }, 'sm')), res);
  }
  host.append(el('div', {class:'row', style:{justifyContent:'space-between'}}, el('span', {class:'lab-hint', style:{margin:0}}, 'Answer within 3× = great; within 10× = right order of magnitude. Handy: 1 day ≈ 86,400 s ≈ 10⁵ s; 1 month ≈ 2.6 million s.'), tally), box);
  tally.textContent = 'score 0/0'; render();
}
const TREES = {
  db:{label:'Which datastore?', root:{q:'Do you need multi-row ACID transactions or rich joins (money, inventory, bookings)?', opts:[
    ['Yes', {q:'Will one primary handle your writes and hot data for the next 2–3 years (roughly < 10–20K writes/s, a few TB hot)?', opts:[
      ['Yes', {r:'Managed PostgreSQL / MySQL + read replicas', why:'Transactions, constraints, joins and decades of tooling. Most products never outgrow a well-tuned primary with replicas and caching.', avoid:'Don’t shard early; partition big tables first.'}],
      ['No', {r:'Distributed SQL (Spanner, CockroachDB, YugabyteDB) or sharded Postgres/MySQL (Citus, Vitess)', why:'Keeps SQL and transactions while scaling writes horizontally.', avoid:'Higher latency for cross-shard transactions; pick shard keys carefully.'}]]}],
    ['No', {q:'What is the dominant access pattern?', opts:[
      ['Key lookups / time-ordered rows by partition at huge scale', {r:'Wide-column / key-value: Cassandra, ScyllaDB, DynamoDB', why:'Linear write scaling, predictable latency when queries follow the partition key.', avoid:'Ad-hoc queries and joins; model tables per query.'}],
      ['Flexible JSON documents per entity', {r:'Document store (MongoDB, Firestore), or Postgres JSONB', why:'Schema flexibility and nested documents; Postgres JSONB if you also want SQL.', avoid:'Cross-document transactions at scale.'}],
      ['Full-text search and relevance', {r:'Search engine (Elasticsearch / OpenSearch) next to your primary DB', why:'Inverted indexes, BM25 ranking, facets.', avoid:'Using it as the system of record; feed it via CDC.'}],
      ['Metrics / events over time', {r:'Time-series DB (Prometheus, TimescaleDB, InfluxDB)', why:'Compression, retention and downsampling for time-stamped data.', avoid:'High-cardinality labels.'}],
      ['Relationship traversal (friends-of-friends, fraud rings)', {r:'Graph DB (Neo4j, Amazon Neptune)', why:'Multi-hop traversals that would be many joins in SQL.', avoid:'Using it for simple CRUD.'}],
      ['Similarity search on embeddings', {r:'Vector index (pgvector, OpenSearch k-NN, dedicated vector DB)', why:'Approximate nearest-neighbour search (HNSW/IVF).', avoid:'Exact search over millions of vectors at query time.'}],
      ['Analytics over billions of rows', {r:'Columnar warehouse / OLAP (BigQuery, Snowflake, ClickHouse)', why:'Column storage and vectorised scans for aggregations.', avoid:'Serving per-user transactional reads from it.'}],
      ['Hot data that must be fast and can be rebuilt', {r:'Cache: Redis / Memcached', why:'Sub-millisecond reads from RAM.', avoid:'Treating it as the only copy of important data.'}]]}]]}},
  msg:{label:'Which messaging?', root:{q:'Is this a multi-step business process with timers and retries over minutes to days (onboarding, refunds, KYC)?', opts:[
    ['Yes', {r:'Workflow engine: Temporal / AWS Step Functions (Airflow for batch data DAGs)', why:'Durable state, timers, retries and visibility for long-running processes.', avoid:'Hand-rolled chains of queues and cron jobs.'}],
    ['No', {q:'Should each message be processed by exactly one worker (a job)?', opts:[
      ['Yes', {q:'Do you need delays, priorities or complex routing rules?', opts:[
        ['Yes', {r:'RabbitMQ (exchanges, routing keys, priorities, delayed messages)', why:'Flexible routing and per-message acknowledgements.', avoid:'Long retention or replay needs.'}],
        ['No', {r:'Managed queue: Amazon SQS / Google Cloud Tasks (or a DB-backed queue when small)', why:'Simple, scalable, nothing to operate; visibility timeouts and DLQs built in.', avoid:'Strict global ordering (use FIFO queues or keys).'}]]}],
      ['No', {q:'Do many independent consumers need the same events, with history/replay?', opts:[
        ['Yes', {r:'Event log: Apache Kafka / Amazon Kinesis / Pulsar', why:'Durable, partitioned, replayable streams with per-key ordering and consumer groups.', avoid:'Using it as a work queue for slow, uneven jobs.'}],
        ['No', {r:'Pub/sub fan-out: SNS → SQS, Google Pub/Sub', why:'Each subscriber gets a copy; managed and simple.', avoid:'Expecting replay of old messages.'}]]}]]}]]}},
  comm:{label:'Which client–server communication?', root:{q:'Is it live audio/video between people?', opts:[
    ['Yes', {r:'WebRTC (with an SFU for groups; STUN/TURN for NAT traversal)', why:'Sub-second peer media with congestion control.', avoid:'Broadcasting to millions; use HLS/DASH + CDN.'}],
    ['No', {q:'Is it video/audio watched by many people (one-to-many)?', opts:[
      ['Yes', {r:'HLS / DASH via CDN (LL-HLS for lower latency)', why:'HTTP segments are cacheable at the edge; ABR adapts to each viewer.', avoid:'WebRTC to every viewer.'}],
      ['No', {q:'Does the server need to push updates to the client?', opts:[
        ['Yes', {q:'Is the app possibly closed/backgrounded when the update happens?', opts:[
          ['Yes', {r:'Push notifications (APNs / FCM), plus sync on open', why:'The OS keeps one efficient channel per device.', avoid:'Relying on push as the source of truth.'}],
          ['No', {q:'Does the client also send frequent low-latency messages (chat, games, collaboration)?', opts:[
            ['Yes', {r:'WebSockets (with a gateway tier and routing layer)', why:'Full-duplex, low-overhead messages both ways.', avoid:'One-off notifications (overkill).'}],
            ['No', {r:'Server-Sent Events (long polling as a fallback)', why:'Simple server→client streaming over HTTP; works with HTTP/2 and proxies.', avoid:'Binary or bidirectional traffic.'}]]}]]}],
        ['No', {q:'Who are the API’s main consumers?', opts:[
          ['Public/partner developers', {r:'REST + OpenAPI (with idempotency keys, pagination, versioning)', why:'Universally understood, cacheable, easy to document.', avoid:'Chatty screens that need many calls (add a BFF).'}],
          ['Internal services, high throughput', {r:'gRPC (Protocol Buffers over HTTP/2)', why:'Typed contracts, streaming, efficient binary encoding.', avoid:'Direct browser clients without a proxy.'}],
          ['UI clients needing data from many resources', {r:'GraphQL (or a BFF)', why:'Clients fetch exactly the fields they need in one round trip.', avoid:'Unbounded queries; add depth/cost limits and DataLoader batching.'}]]}]]}]]}]]}}
};
function decisionTree(host){
  let tree = 'db', path = []; const box = el('div');
  const node = () => path.reduce((n, i) => n.opts[i][1], TREES[tree].root);
  function render(){
    const n = node(); box.innerHTML = '';
    const crumbs = []; let cur = TREES[tree].root; path.forEach(i => { crumbs.push(`${cur.q} → <b>${cur.opts[i][0]}</b>`); cur = cur.opts[i][1]; });
    if (crumbs.length) box.append(frag(`<ol class="steps">${crumbs.map(c => `<li>${c}</li>`).join('')}</ol>`));
    if (n.r){ box.append(el('div', {class:'verdict ok'}, '✅ ' + n.r), frag(h.callout('info', 'Why', `<p>${n.why}</p><p><b>Watch out:</b> ${n.avoid}</p>`))); }
    else { box.append(el('p', null, el('b', null, n.q))); const row = el('div', {class:'pill-row'}); n.opts.forEach(([label], i) => row.append(ui.button(label, () => { path.push(i); render(); }, 'sm'))); box.append(row); }
    box.append(el('div', {class:'controls', style:{marginTop:'10px'}}, path.length ? ui.button('← Back', () => { path.pop(); render(); }, 'sm ghost') : null, path.length ? ui.button('↺ Start over', () => { path = []; render(); }, 'sm ghost') : null));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.select({label:'Decision', value:tree, options:Object.entries(TREES).map(([k, t]) => [k, t.label]), onChange:v => { tree = v; path = []; render(); }}).el), box,
    el('p', {class:'lab-hint'}, 'A starting point for discussion, not a rulebook. Real choices also weigh team skills, existing stack, cost and compliance.'));
  render();
}
function glossaryDeck(host){
  const all = [...SDA.glossary.values()]; const pick = shuffle(all.slice()).slice(0, 15);
  const nCheat = SDA.modules.filter(m => m.cheatsheet && m.cheatsheet.length).length;
  host.append(el('div', {class:'grid c3'},
    el('a', {class:'card glow', href:'#/glossary'}, el('b', null, `📖 ${all.length} glossary terms`), el('p', {class:'lab-hint'}, 'Searchable, linked to the module that teaches each one.')),
    el('a', {class:'card glow', href:'#/page/cheatsheets'}, el('b', null, `📋 ${nCheat} cheat sheets`), el('p', {class:'lab-hint'}, 'Every module’s cheat sheet on one page, filterable, copy as Markdown.')),
    el('a', {class:'card glow', href:'#/labs'}, el('b', null, `⌨️ ${SDA.labs.size} code labs`), el('p', {class:'lab-hint'}, 'LRU, rate limiters, consistent hashing, Bloom filter and more.'))));
  host.append(el('p', null, el('b', null, 'Quick-fire flashcards: 15 random terms from the whole course')));
  ui.flashcards(host, pick.map(t => ({front:t.term, back:esc(t.def)})));
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'interview-framework', title:'The system design interview framework', minutes:12, tags:['interview','framework','time-boxing','requirements','estimation'],
  summary:'A repeatable 45-minute structure: clarify, estimate, API, data model, high-level design, deep dive, then bottlenecks and trade-offs. Time-box each step so you always reach the deep dive.',
  problem:`<p>“Design WhatsApp.” Forty-five minutes. Many candidates start drawing boxes immediately, spend 25 minutes on a login service, never discuss message delivery guarantees, and run out of time. They knew the technology; they lacked a process. Interviewers mostly assess <i>how</i> you think: structure, clarity, trade-offs.</p>`,
  intuition:`A doctor’s consultation. They don’t prescribe in the first minute. They ask about symptoms (requirements), check vitals (estimates), form a picture (high-level design), examine the worrying area closely (deep dive), and explain options and side-effects (trade-offs), all within a fixed appointment slot.`,
  how:{
    steps:PHASES.map(p => `<b>${p.t}</b> (~${p.min} min): ${p.ask.join('; ')}.`),
    mount:(host, api) => interviewTimer(host, api),
    deep:`<p><b>Drive, but listen.</b> State your plan up front (“I’ll clarify, estimate, sketch the API and data model, then go deep on delivery”), check in at transitions, and follow when the interviewer steers. They often have a specific deep dive in mind.</p><p><b>Write things down</b> on the board: requirements list, numbers, API signatures, schema. It anchors the conversation and shows rigour.</p><p><b>Level expectations:</b> junior candidates are expected to reach a working high-level design; senior candidates should drive the deep dive, quantify bottlenecks and discuss failure modes; staff-level candidates also discuss evolution, cost, operability and organisational trade-offs.</p>`
  },
  tradeoffs:{use:[`Every design interview and design review`], avoid:[`Rigidly reciting the framework while ignoring the interviewer’s cues`], alt:[`Starting from the data model for data-heavy problems (e.g. a ledger)`]},
  real:[
    {co:'System Design Interview (Alex Xu)', tier:'confirmed', text:'Alex Xu’s widely used book recommends a four-step process: understand the problem and scope, propose a high-level design, deep dive, and wrap up.', src:'Alex Xu, System Design Interview – An Insider’s Guide (2020)'},
    {co:'System Design Primer', tier:'confirmed', text:'Donne Martin’s open-source primer outlines a similar approach: use cases and constraints, high-level design, core components, then scaling.', src:'Donne Martin, “The System Design Primer” (GitHub)'},
    {co:'This course', tier:'educational', text:'The 7-step approach from Module 1 (clarify → estimate → API → data → HLD → deep dive → bottlenecks) with the time boxes above.', src:'Simplified educational design'}
  ],
  mistakes:[`Jumping into components before requirements`, `Spending 20 minutes on estimates or authentication`, `Never stating trade-offs or failure handling`],
  interview:[`Say your plan in the first minute; time-box; leave 5+ minutes for bottlenecks and trade-offs`],
  tryit:{note:'Start the timer above and practise “Design a URL shortener” out loud. Then order the steps:', mount:host => orderGame(host, PHASES.map(p => p.t))},
  sources:[`Xu, System Design Interview (2020)`, `Martin, The System Design Primer`, `Kleppmann, Designing Data-Intensive Applications (2017)`]
},
{
  id:'talking-tradeoffs', title:'How to talk about trade-offs', minutes:9, tags:['trade-offs','communication','justification','alternatives'],
  summary:'Strong candidates don’t just name technologies; they explain why, what they give up, how they mitigate it, and when they’d choose differently. A simple sentence formula makes that a habit.',
  problem:`<p>Two candidates both say “I’ll use Cassandra for messages.” One stops there. The other says “…because writes dominate and reads are by conversation and time, which fits a partition key of conversation_id; we give up ad-hoc queries and multi-row transactions, so search goes to a separate index and receipts are idempotent upserts; if we needed strong consistency for edits I’d revisit.” The second one gets the offer.</p>`,
  intuition:`A good doctor explaining a prescription: “This medicine works fastest for your infection, but it can upset your stomach, so take it after food. If you have a rash, we’ll switch to the other one.” Choice, benefit, cost, mitigation, trigger to change.`,
  how:{
    stepper:{title:'The trade-off sentence', items:[
      {title:'Choice', tag:'what', text:'“For the message store I’ll use a wide-column database…”'},
      {title:'Because', tag:'requirement link', text:'“…because writes dominate (50K/s) and reads are by conversation in time order.” Tie it to a stated requirement or number.'},
      {title:'We give up', tag:'cost', text:'“We give up ad-hoc queries and multi-row transactions.” Every choice costs something; naming it shows judgement.'},
      {title:'We mitigate', tag:'how', text:'“Search goes to an Elasticsearch index fed by CDC; read receipts are idempotent upserts.”'},
      {title:'Alternative', tag:'compare', text:'“Sharded Postgres would also work and gives transactions, but needs more sharding work at this write rate.”'},
      {title:'Trigger to revisit', tag:'when', text:'“If we needed strongly consistent edits across devices, or our team lacked Cassandra skills, I’d reconsider.”'}]},
    deep:`<p><b>Vocabulary that signals depth:</b> read/write amplification, tail latency, hot partitions, blast radius, idempotency, backpressure, eventual vs strong consistency, RPO/RTO, cost per request, operational burden. Use them precisely and only when they apply.</p><p><b>Quantify when possible:</b> “The cache absorbs ~90% of reads, so the DB sees ~2K reads/s instead of 20K.” Numbers turn opinions into engineering.</p><p><b>Handle pushback well:</b> treat “why not X?” as an invitation, not an attack: “X would work; it’s better at A and worse at B; given requirement C I prefer Y, but if C changes, X wins.”</p>`
  },
  tradeoffs:{use:[`For every non-trivial component choice`], avoid:[`Listing technologies without reasons`, `Claiming a choice has no downsides`], alt:[`A quick comparison table on the whiteboard for 2–3 options`]},
  real:[
    {co:'Architecture reviews', tier:'educational', text:'Mature engineering organisations expect design docs with “Alternatives considered” and “Trade-offs” sections. The interview habit is the same skill.', src:'Simplified educational design'},
    {co:'Google design docs', tier:'confirmed', text:'Google engineers have publicly described design docs that include context, goals and non-goals, the design, and alternatives considered with their trade-offs.', src:'Malte Ubl, “Design Docs at Google” (industrialempathy.com, 2020)'},
    {co:'ADRs', tier:'confirmed', text:'Architecture Decision Records capture context, decision and consequences, the written form of a trade-off statement.', src:'Michael Nygard, “Documenting Architecture Decisions” (2011)'}
  ],
  mistakes:[`“X is the best” without context`, `Defensiveness when challenged`, `Using buzzwords incorrectly`],
  interview:[`Practise the formula: choice → because → give up → mitigate → alternative → revisit when`],
  tryit:{note:'Weak or strong statement?', mount:host => sortGame(host, [
    {t:'“We’ll use Kafka because it’s scalable.”', c:'w', why:'No requirement link, no cost.'},
    {t:'“A cache cuts DB reads ~10× for this read-heavy feed; we accept up to 30 s staleness and invalidate on edits.”', c:'s', why:'Quantified, cost named, mitigation.'},
    {t:'“Microservices are best practice.”', c:'w', why:'Dogma, no trade-off.'},
    {t:'“Synchronous replication gives RPO 0 for payments at the cost of ~2 ms extra write latency, which fits our 200 ms budget.”', c:'s', why:'Requirement, cost, number.'},
    {t:'“NoSQL scales better than SQL.”', c:'w', why:'Over-general.'}
  ], [{id:'s', label:'Strong'}, {id:'w', label:'Weak'}])},
  sources:[`Ubl, Design Docs at Google (2020)`, `Nygard (2011)`, `Richards & Ford (2020)`]
},
{
  id:'interview-mistakes', title:'Common interview mistakes (and fixes)', minutes:8, tags:['interview','mistakes','red flags','communication'],
  summary:'Most failed design interviews share a few patterns: no requirements, premature detail, single-point-of-failure designs, ignoring data, buzzword answers, and poor time management. Each has a simple fix.',
  problem:`<p>Interviewers often see technically strong engineers fail system design rounds. The feedback reads like: “didn’t clarify scope”, “went deep on an irrelevant area”, “no discussion of failure”, “couldn’t justify choices”, “ran out of time”. These are habits, so they can be fixed with practice.</p>`,
  intuition:`A cricket batter with great shots who keeps getting out the same way. Fixing technique (where the feet go) matters more than learning new shots. Interview technique works the same way.`,
  how:{
    stepper:{title:'Red flags interviewers notice', items:[
      {title:'No requirements', tag:'fix: 5 minutes of questions', text:'Designing “everything” or the wrong thing. Fix: agree on 2–3 core features, scale and non-functionals first; write them down.'},
      {title:'Premature detail', tag:'fix: breadth first', text:'Debating Redis data structures before a high-level design exists. Fix: sketch the whole system first, then pick the deep dive.'},
      {title:'Single points of failure', tag:'fix: ask “what if it dies?”', text:'One DB, one server, one region with no discussion. Fix: for each box, state redundancy and failure behaviour.'},
      {title:'Ignoring data', tag:'fix: access patterns', text:'No schema, keys or indexes; hand-waving consistency. Fix: model entities, keys and the hottest queries; state the consistency needs.'},
      {title:'Buzzword soup', tag:'fix: justify', text:'“Kafka + Kubernetes + microservices” with no reason. Fix: the trade-off sentence for each choice.'},
      {title:'Silence or monologue', tag:'fix: think aloud, check in', text:'Long silent thinking or 20 minutes without pausing. Fix: narrate reasoning and check with the interviewer at each phase.'},
      {title:'Running out of time', tag:'fix: time-box', text:'No time for bottlenecks and trade-offs, often the most senior signal. Fix: use the framework’s time boxes.'}]},
    deep:`<p><b>Recovering mid-interview:</b> if you realise you’re lost in detail, say so: “Let me step back and finish the high-level picture first.” Interviewers value self-correction.</p><p><b>Unknowns:</b> it’s fine not to know a specific product’s internals. Say what you’d expect from first principles and how you’d validate it. Never invent numbers or internals; label assumptions.</p><p><b>Practise realistically:</b> timed mock interviews, out loud, with a whiteboard or drawing tool, and a written self-review against the framework afterwards.</p>`
  },
  tradeoffs:{use:[`A checklist for self-review after every mock`], avoid:[`Memorising canned designs without understanding`], alt:[`Peer mock interviews with feedback`]},
  real:[
    {co:'Interview prep resources', tier:'educational', text:'Most prep guides converge on the same failure modes: unclear requirements, no trade-offs, missing failure handling and poor time management.', src:'Simplified summary of common guidance (e.g. Xu, System Design Interview; System Design Primer)'},
    {co:'Hiring rubrics', tier:'inference', text:'Design interviews are typically scored on problem exploration, design quality, trade-off reasoning and communication, rather than on knowing specific products.', src:'Reasonable inference from public interview guides of large tech companies'},
    {co:'This course', tier:'educational', text:'Every case study in the Case Studies section ends with “interview twists” to practise these recovery skills.', src:'Simplified educational design'}
  ],
  mistakes:[`Treating the interview as a quiz rather than a collaboration`, `Making up internal details of real companies`, `Not asking about scale`],
  interview:[`Self-check: requirements written? numbers? API? data model? failure handling? trade-offs stated? time left for wrap-up?`],
  tryit:{note:'Red flag or good practice?', mount:host => sortGame(host, [
    {t:'Asking “roughly how many daily users and what latency do we need?”', c:'g', why:'Clarifying scale and NFRs.'},
    {t:'Spending 15 minutes on the login flow in “Design YouTube”', c:'r', why:'Irrelevant deep dive.'},
    {t:'“If the cache cluster fails, reads fall back to replicas with rate limiting.”', c:'g', why:'Failure handling.'},
    {t:'Claiming “Google uses exactly 37 shards per region”', c:'r', why:'Invented internals.'},
    {t:'“Let me step back and finish the high-level design first.”', c:'g', why:'Self-correction.'}
  ], [{id:'g', label:'Good practice'}, {id:'r', label:'Red flag'}])},
  sources:[`Xu, System Design Interview (2020)`, `Martin, The System Design Primer`]
},
{
  id:'estimation-drills', title:'Estimation drills', minutes:12, tags:['estimation','back-of-envelope','QPS','storage','bandwidth'],
  summary:'Practise turning users and events into requests per second, storage and bandwidth, in seconds, with round numbers. The goal is the right order of magnitude, which tells you which design is needed.',
  problem:`<p>“How much storage do we need?” Silence, then a long multiplication on the board with a units mistake: gigabytes instead of terabytes, off by 1,000×. Estimation isn’t about precision; it decides whether you need one database or a thousand, so it must be fast and roughly right.</p>`,
  intuition:`Estimating guests for a wedding: “about 500 people, 2 plates each, so ~1,000 plates.” Nobody counts exactly, but you’d never order 10 plates or a million.`,
  how:{
    steps:[`Memorise anchors: 1 day ≈ 86,400 s ≈ 10⁵ s; 1 month ≈ 2.6 × 10⁶ s; 1 year ≈ 3 × 10⁷ s.`, `Requests/s = events per day ÷ 10⁵; peak ≈ 2–10× average (state your assumption).`, `Storage = items × size × retention (× replication factor if asked).`, `Bandwidth = requests/s × payload (or viewers × bitrate).`, `Round aggressively (2.6 → 3), keep powers of ten, and sanity-check (“is 3 TB a lot? No: one large disk”).`],
    mount:host => estimationDrills(host),
    deep:`<p><b>Powers of two vs ten:</b> 2¹⁰ ≈ 10³ (KB), 2²⁰ ≈ 10⁶ (MB), 2³⁰ ≈ 10⁹ (GB), 2⁴⁰ ≈ 10¹² (TB). Use decimal for estimates; nobody minds the 7% difference.</p><p><b>Latency numbers</b> (Jeff Dean’s list, Module 1): memory ~100 ns, SSD random read ~100 µs, same-region round trip ~0.5–1 ms, cross-continent ~100+ ms. These tell you how many sequential calls fit in a latency budget.</p><p><b>From numbers to design:</b> 40 writes/s → one DB easily; 250K writes/s → in-memory/sharded store; 50 Tbps → multi-CDN; 3 TB → one DB; 73 PB/year → object storage + tiering. Always end an estimate with “…so this means…”.</p>`
  },
  tradeoffs:{use:[`At the start of every design to choose the architecture class`], avoid:[`Precise arithmetic that eats interview time`, `Forgetting peak vs average`], alt:[`The back-of-envelope calculator playground for longer what-ifs`]},
  real:[
    {co:'Jeff Dean', tier:'confirmed', text:'Jeff Dean’s “Numbers Everyone Should Know” (from his 2009 talks) popularised latency and throughput anchors for back-of-envelope reasoning.', src:'Jeff Dean, “Designs, Lessons and Advice from Building Large Distributed Systems” (LADIS 2009)'},
    {co:'NPCI UPI statistics', tier:'confirmed', text:'NPCI publishes monthly UPI volumes; in 2025 monthly transactions reached around 20 billion, a useful public anchor for payment-scale estimates.', src:'NPCI UPI product statistics (2025)'},
    {co:'Public scale anchors', tier:'confirmed', text:'WhatsApp’s ~100 billion messages/day (2020) and YouTube’s 500 hours uploaded per minute (2019) are commonly used public anchors.', src:'Meta Q3 2020 earnings call remarks; YouTube official statements (2019)'}
  ],
  mistakes:[`Mixing bits and bytes (8×) or GB and TB (1,000×)`, `Using average when peak matters`, `Not stating assumptions`],
  interview:[`Say the assumption, round, compute in powers of ten, then state the design implication`],
  tryit:{note:'Do all eight drills above until you can answer each within 3× in under a minute.', pg:'envelope'},
  sources:[`Dean, LADIS 2009`, `NPCI UPI statistics`, `Xu, System Design Interview, ch. 2`]
},
{
  id:'tech-decision-tree', title:'“Which technology should I pick?” decision trees', minutes:11, tags:['decision tree','database choice','messaging','API style','technology selection'],
  summary:'Most technology choices follow from a few questions about access patterns, consistency, ordering, fan-out and latency. Walk the trees for datastores, messaging and client communication, then justify with trade-offs.',
  problem:`<p>“Should we use MongoDB, Postgres or DynamoDB?” “Kafka or RabbitMQ?” “WebSockets or SSE?” Teams argue about tools because they skip the questions that decide them. The same few questions resolve most of these debates in minutes.</p>`,
  intuition:`Choosing transport for a trip. How many people? How far? How fast? How much luggage? Answer those and the choice between an auto, a bus, a train or a flight mostly makes itself.`,
  how:{
    intro:'Pick a decision and answer the questions:',
    mount:host => decisionTree(host),
    deep:`<p><b>Polyglot persistence is normal:</b> a typical product uses a relational DB as the system of record, a cache, a search index, an object store and a warehouse, each fed from the source of truth (often via CDC). The question is “which store is the source of truth for this data?”</p><p><b>Team and operations matter:</b> a managed service your team understands often beats a theoretically better system nobody can operate at 3 AM. Factor in hiring, tooling, vendor lock-in and cost.</p><p><b>Revisit triggers:</b> write down the metric that would change the choice (write rate, data size, query patterns, latency SLO). Technology choices age as products grow.</p>`
  },
  tradeoffs:{use:[`Early in design to narrow options; then justify with trade-offs`], avoid:[`Choosing by popularity or résumé value`, `One database for every workload, or a new database for every feature`], alt:[`Spikes/prototypes and load tests when two options remain close`]},
  real:[
    {co:'AWS database decision guide', tier:'confirmed', text:'AWS publishes guidance on choosing among relational, key-value, document, in-memory, graph, time-series, ledger and wide-column databases based on workload characteristics.', src:'AWS, “Choosing an AWS database service” decision guide'},
    {co:'Designing Data-Intensive Applications', tier:'confirmed', text:'Kleppmann’s book frames data-system choices around data models, access patterns, replication, partitioning and consistency rather than products.', src:'Kleppmann, Designing Data-Intensive Applications (2017)'},
    {co:'Typical Indian e-commerce stack', tier:'educational', text:'Postgres/MySQL for orders and payments, Redis for sessions and hot catalog data, Elasticsearch for product search, Kafka for events, S3 for images, a warehouse for analytics.', src:'Simplified educational design'}
  ],
  mistakes:[`MongoDB for strongly relational, transactional data “because it’s flexible”`, `Kafka as a simple job queue for slow tasks`, `WebSockets for once-a-day notifications`],
  interview:[`Ask the deciding questions out loud (“do we need transactions? what’s the access pattern?”) before naming a technology`],
  tryit:{note:'Walk each of the three trees above. Then match workloads:', mount:host => sortGame(host, [
    {t:'Bank-style ledger with balances and transfers', c:'sql', why:'ACID transactions, constraints.'},
    {t:'Chat messages fetched by conversation and time, 100K writes/s', c:'wide', why:'Partitioned writes at scale.'},
    {t:'Product search with typo tolerance and facets', c:'search', why:'Inverted index + ranking.'},
    {t:'Order events consumed by 6 teams, replayable', c:'log', why:'Durable event log.'},
    {t:'Send each password-reset email exactly once', c:'queue', why:'Work queue.'}
  ], [{id:'sql', label:'Relational DB'}, {id:'wide', label:'Wide-column / KV'}, {id:'search', label:'Search engine'}, {id:'log', label:'Event log'}, {id:'queue', label:'Work queue'}])},
  sources:[`AWS database decision guide`, `Kleppmann, DDIA (2017)`, `Kafka, RabbitMQ, SQS documentation`]
},
{
  id:'glossary-cheatsheets', title:'Glossary, cheat sheets and labs: your revision kit', minutes:6, tags:['glossary','cheat sheet','revision','flashcards','labs'],
  summary:'Use the full glossary, the all-modules cheat-sheet page and the code labs for spaced revision before interviews. Short daily sessions beat one long cram.',
  problem:`<p>After 15 modules you have seen hundreds of terms and patterns. Two weeks before an interview, you need a fast way to find gaps, refresh vocabulary and rehearse the core algorithms by hand, without re-reading everything.</p>`,
  intuition:`Exam revision with formula cards. You don’t re-read the textbook; you flip through cards, notice which ones you can’t explain, and revisit only those chapters.`,
  how:{
    steps:[`<b>Daily (15 min)</b>: flashcards. Explain each term aloud in one sentence plus one example.`, `<b>Every other day</b>: one cheat sheet. Can you justify every line with a trade-off?`, `<b>Weekly</b>: rebuild one code lab from memory (LRU, token bucket, consistent hashing, Bloom filter).`, `<b>Before interviews</b>: estimation drills plus two timed mock designs using the framework.`],
    mount:host => glossaryDeck(host),
    deep:`<p><b>Spaced repetition and retrieval practice</b> (testing yourself rather than re-reading) are among the most robust findings in learning research. Use the flashcards’ “I knew it / review again” to focus on weak terms.</p><p><b>Teach it back:</b> explaining a concept to someone else, or writing a short note, reveals gaps faster than reading. The Simple/Deep toggle in every lesson is designed for this: explain the Simple version first, then the Deep one.</p>`
  },
  tradeoffs:{use:[`Short, frequent revision sessions`], avoid:[`Passive re-reading`, `Memorising answers without being able to derive them`], alt:[`Study groups and mock interviews`]},
  real:[
    {co:'Learning science', tier:'confirmed', text:'Research on retrieval practice and spacing (e.g. Roediger & Karpicke, 2006) shows testing yourself and spreading practice over time improve long-term retention compared with re-reading.', src:'Roediger & Karpicke, “Test-Enhanced Learning”, Psychological Science (2006)'},
    {co:'This course', tier:'educational', text:'Every module has flashcards, a quiz and a cheat sheet, and the glossary links each term back to the module that teaches it.', src:'Simplified educational design'},
    {co:'Code labs', tier:'educational', text:'Re-implementing core data structures (LRU, Bloom filter, hash ring) from memory is common interview practice and builds intuition for their trade-offs.', src:'Simplified educational design'}
  ],
  mistakes:[`Cramming the night before`, `Only reading, never practising out loud`],
  interview:[`Use the last week for timed mocks and weak-area flashcards, not new topics`],
  tryit:{note:'Go through the 15 flashcards above, then open a code lab and rebuild it without looking.', lab:'lru-cache'},
  sources:[`Roediger & Karpicke (2006)`, `This course’s glossary, cheat sheets and labs`]
}
];

SDA.register({
  kind:'module', id:'interview', order:15, level:'principal', icon:'🎯', title:'Interview & Meta',
  summary:'A time-boxed interview framework, how to talk about trade-offs, common mistakes and fixes, estimation drills with public anchors, technology decision trees, and a revision kit (glossary, cheat sheets, labs, flashcards).',
  outcomes:['Run a 45-minute design interview with a clear structure and time boxes', 'Justify every choice with the trade-off sentence', 'Estimate QPS, storage and bandwidth within an order of magnitude in under a minute', 'Choose datastores, messaging and communication styles from deciding questions', 'Revise efficiently with flashcards, cheat sheets and labs'],
  lessons,
  quiz:[
    {q:'What should you do in the first ~5 minutes of a design interview?', options:['Draw the architecture', 'Clarify requirements, scope and scale', 'Write code', 'Pick a database'], answer:1, why:'Requirements drive everything.'},
    {q:'100 million events per day is roughly how many per second on average?', options:['~100', '~1,000', '~1,200', '~100,000'], answer:2, why:'1e8 ÷ 86,400 ≈ 1,157.'},
    {q:'25 million viewers at 2 Mbps need about…', options:['50 Gbps', '50 Tbps', '5 Tbps', '500 Mbps'], answer:1, why:'2.5e7 × 2e6 = 5e13 bps.'},
    {q:'Which is the strongest trade-off statement?', options:['“Kafka scales.”', '“We use a cache because it’s fast.”', '“A cache cuts DB reads 10× for this read-heavy page; we accept 30 s staleness and invalidate on writes.”', '“NoSQL is modern.”'], answer:2, why:'Benefit, cost, mitigation, numbers.'},
    {q:'You need transactions for money transfers and your writes fit one primary. Best default?', options:['Cassandra', 'Managed Postgres/MySQL with replicas', 'Elasticsearch', 'Redis only'], answer:1, why:'ACID and simplicity.'},
    {q:'Six teams need the same order events and new consumers must replay history. Use…', options:['SQS', 'Kafka (event log)', 'Cron', 'WebSockets'], answer:1, why:'Durable, replayable log with consumer groups.'},
    {q:'Server pushes occasional updates to an open web page; client rarely sends. Simplest fit?', options:['WebRTC', 'Server-Sent Events', 'gRPC streaming from the browser', 'Email'], answer:1, why:'One-way server push over HTTP.'},
    {q:'You realise you’ve spent 15 minutes on authentication in “Design YouTube”. Best move?', options:['Keep going', 'Say so, step back, finish the high-level design and move to the video pipeline', 'Start over', 'Ask for more time'], answer:1, why:'Self-correct and refocus.'},
    {q:'Which is a red flag?', options:['Stating assumptions', 'Inventing internal details of a real company', 'Asking about scale', 'Discussing failure modes'], answer:1, why:'Label assumptions; never fabricate.'},
    {q:'The most effective last-week revision is…', options:['Re-reading all notes', 'Timed mocks, flashcards on weak areas and rebuilding core labs from memory', 'Learning new frameworks', 'Nothing'], answer:1, why:'Retrieval practice beats re-reading.'},
    {type:'scenario', q:'Run the first 10 minutes of “Design a notification service” out loud: what do you ask and estimate?', answer:'<ul><li><b>Scope</b>: channels (push, SMS, email, in-app)? Transactional (OTP, order updates) vs marketing? User preferences and quiet hours? Templates/localisation? Out of scope: content creation UI.</li><li><b>NFRs</b>: OTP latency < 5 s p99; at-least-once with dedupe; no duplicates for OTP; rate limits per user; availability 99.95%.</li><li><b>Scale</b>: 50M DAU, ~10 notifications/user/day → 500M/day ≈ 6K/s average, peaks 10× during campaigns (60K/s); marketing blasts of 30M in 10 minutes ≈ 50K/s.</li><li><b>Implications</b>: queue per channel and priority (OTP separate from marketing), provider failover for SMS, idempotency keys, token cleanup for push.</li></ul>'},
    {type:'scenario', q:'An interviewer asks “Why not just use MongoDB for everything?” in your e-commerce design. Answer with a trade-off.', answer:'“MongoDB would work well for the product catalogue, because documents with varying attributes fit naturally. For orders and payments I chose Postgres because they need multi-row ACID transactions and constraints (inventory decrement + order + payment record), and the write volume fits a primary with replicas. Using one store everywhere simplifies operations but would either weaken transactional guarantees or complicate the catalogue. If our transaction needs were simple and per-document, a single document store could be reasonable.”'}
  ],
  cheatsheet:[
    {h:'⏱ 45-minute plan', items:['Clarify 5 · Estimate 4 · API 5 · Data 5', 'High-level 10 · Deep dive 10 · Bottlenecks 6', 'Say the plan first; check in at transitions', 'Write requirements, numbers, APIs, schema on the board']},
    {h:'🗣 Trade-off sentence', items:['Choice → because (requirement) → give up', '→ mitigate → alternative → revisit when', 'Quantify where you can', 'Treat “why not X?” as an invitation']},
    {h:'🧮 Estimation anchors', items:['1 day ≈ 86,400 ≈ 10⁵ s', '1 month ≈ 2.6M s; 1 year ≈ 3 × 10⁷ s', 'QPS = per-day ÷ 10⁵; peak 2–10×', 'Storage = items × size × retention', 'Bandwidth = rps × payload or viewers × bitrate', 'bits ≠ bytes (8×)']},
    {h:'🌳 Deciding questions', items:['Transactions/joins? → relational', 'Partitioned key access at scale? → wide-column/KV', 'Search relevance? → search engine', 'One worker per job? → queue; many replaying consumers? → log', 'Live A/V → WebRTC; one-to-many video → HLS/DASH', 'Push to closed app → APNs/FCM; two-way low latency → WebSockets; one-way → SSE']},
    {h:'🚩 Avoid', items:['No requirements', 'Premature deep detail', 'Single points of failure', 'Buzzwords without reasons', 'Invented internals', 'No time left for trade-offs']}
  ],
  glossary:[
    {term:'Time-boxing', def:'Allocating a fixed amount of time to each step of a task.'},
    {term:'Deep dive', def:'A detailed design discussion of one critical component.'},
    {term:'Order of magnitude', def:'A factor of ten; estimates aim to be within the right power of ten.'},
    {term:'Polyglot persistence', def:'Using different data stores for different needs within one system.'},
    {term:'System of record', aka:['source of truth'], def:'The authoritative data store for a given piece of data.'},
    {term:'Retrieval practice', aka:['spaced repetition'], def:'Learning by actively recalling information, spaced over time.'},
    {term:'Mock interview', def:'A timed practice interview with feedback.'}
  ],
  sources:['Xu, System Design Interview (2020); Martin, The System Design Primer', 'Kleppmann, Designing Data-Intensive Applications (2017)', 'Dean, LADIS 2009 (“Numbers everyone should know”)', 'NPCI UPI statistics; Meta and YouTube public statements', 'Ubl, Design Docs at Google (2020); Nygard, ADRs (2011)', 'Roediger & Karpicke (2006)']
});
} catch(e){ console.error('[SDA] module interview', e); SDA.errors.push({id:'interview', error:e}); }
})();
