/* =====================================================================
   PART 8 · MODULE 15 — INTERVIEW & META
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, esc, clamp, fmtNum, fmtDur, fmtBytes, shuffle} = SDA.u; const ui = SDA.ui;
const {sortGame, orderGame} = SDA.m1helpers; const {frag} = SDA.ph;

/* ---------- widgets ---------- */
const PHASES = [
  {t:'Clarify requirements', min:5, ask:['Who are the users (drivers, lot owners) and what are 2 or 3 core use cases (find, book, pay)?', 'What is out of scope (for example, lot-owner reports)?', 'Non-functional needs: scale, speed, availability, consistency, region?']},
  {t:'Estimate', min:4, ask:['Bookings per day → requests per second (average and peak)', 'Read to write ratio (many map views, few bookings)', 'Storage per year and bandwidth']},
  {t:'API design', min:5, ask:['3 to 5 key calls, such as search spots and book a spot', 'Safe retries, paging and who is allowed']},
  {t:'Data model', min:5, ask:['Tables and links: lots, spots and bookings', 'Busiest queries → keys and indexes', 'SQL or NoSQL, and why']},
  {t:'High-level design', min:10, ask:['Draw app → load balancer → services → data stores → background jobs', 'Walk one booking end to end']},
  {t:'Deep dive', min:10, ask:['The 1 or 2 hardest parts, such as stopping double booking (the interviewer may choose)', 'Locks, consistency, caching, sharding']},
  {t:'Bottlenecks & trade-offs', min:6, ask:['Single points of failure and hot spots', 'What breaks at 10 times the load? What if a part fails?', 'Summarise trade-offs and what you would do next']}];
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
    el('p', {class:'lab-hint'}, 'A 45-minute practice clock. Real interviews vary. Follow the interviewer’s lead, but keep this rhythm so you do not run out of time before the deep dive.'));
  render();
}
const DRILLS = [
  {q:'The parking app has 2 million bookings a day. What is the average number of bookings per second?', unit:'/s', ans:2.3e1, work:'2,000,000 ÷ 86,400 s ≈ <b>23 per second</b>. That is small, so one database handles the writes. Peaks may be 5 to 10 times higher.', tier:'Illustrative assumptions'},
  {q:'Each parking booking record is about 1 KB, and the app keeps 5 years of data at 2 million bookings a day. How much storage (ignore replicas)?', unit:'bytes', ans:3.65e12, work:'2,000,000 × 365 × 5 = 3.65 billion records; × 1 KB ≈ <b>3.65 TB</b>. One database with replicas can hold this.', tier:'Illustrative assumptions'},
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
  summary:'Split the 45 minutes into steps: clarify, estimate, design the API and data, sketch the system, go deep, then discuss bottlenecks. Time-box each step so you always reach the deep dive.',
  problem:`<h3>A small example</h3><p>The interviewer says: “Design a parking-spot booking app.” You have 45 minutes.</p><ul><li>Candidate A draws boxes at once.</li><li>They spend 25 minutes on the login screen.</li><li>They never explain how two drivers are kept from booking the same spot.</li></ul><p>A has the knowledge but no plan. What order would have saved the interview?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow a candidate through the 45 minutes. The timer below uses the same plan.</p>',
    steps:[
      {icon:'❓', title:'Clarify (5 min)', text:'Ask who uses the app and what it must do, such as find, book and pay. Then ask about scale and what is out of scope.'},
      {icon:'🧮', title:'Estimate (4 min)', text:'Turn users into numbers. 2 million bookings a day ÷ 86,400 seconds ≈ 23 a second.'},
      {icon:'📐', title:'API and data model (10 min)', text:'List 3 to 5 calls, such as “search spots” and “book a spot”. Then name the tables: lots, spots and bookings.'},
      {icon:'🗺️', title:'High-level design (10 min)', text:'Draw the driver app, a load balancer, a booking service and a database. Walk one booking through it.'},
      {icon:'🔍', title:'Deep dive (10 min)', text:'Pick the hardest part. Here it is stopping two drivers from booking the same spot.'},
      {icon:'⚖️', title:'Bottlenecks and trade-offs (6 min)', text:'Ask what breaks at 10 times the load. Say what you gave up and what you would do next.'}
    ],
    mount:(host, api) => interviewTimer(host, api),
    html:`<h3>Everyday comparison</h3><p>Think of a doctor’s visit.</p><div class="simple-table">${h.table(['Doctor', 'Interview'], [['Asks about your symptoms', 'Clarify the requirements.'], ['Checks your vital signs', 'Estimate the numbers.'], ['Looks closely at the worrying area', 'Deep dive.'], ['Explains the options and side effects', 'Trade-offs.']])}</div><div class="callout tip"><b>Important point</b><p>Say your plan in the first minute, then watch the clock. Reaching the deep dive and the trade-offs matters more than a perfect drawing.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Situation', 'What to do'], [['The interviewer steers to another topic', 'Follow them, then return to your plan.'], ['You are behind on time', 'Say so, and skip small details.'], ['You are unsure of a number', 'State an assumption and round it.']])}</div>`,
    deep:`<h4>The numbers</h4><p>The six steps add up: 5 + 4 + 10 + 10 + 10 + 6 = 45 minutes. Candidate A spent 25 minutes on login. That leaves 45 − 25 = 20 minutes for everything else, and the steps need 40.</p><p>Say you spend 13 minutes clarifying instead of 5. The other steps need 4 + 10 + 10 + 10 + 6 = 40 minutes, and only 32 are left. Cut 8. Shrink the API and data step from 10 to 6, and the high-level design from 10 to 6. Keep the deep dive.</p><h4>When it goes wrong</h4><p>Sometimes the interviewer says, "Just design the booking part." Do not argue. Say the new scope in one sentence, write it on the board, and drop the steps it makes small, such as payments.</p>`
  },
  tradeoffs:{use:[`Every design interview and design review, such as “Design a parking-spot booking app”.`], avoid:[`Reciting the steps while ignoring the interviewer’s hints.`], alt:[`Start from the data model when the problem is mostly data, such as a ledger.`]},
  real:[
    {co:'System Design Interview (Alex Xu)', tier:'confirmed', text:'Alex Xu’s widely used book recommends four steps: understand the problem and scope, propose a high-level design, deep dive, and wrap up.', src:'Alex Xu, System Design Interview, An Insider’s Guide (2020)'},
    {co:'System Design Primer', tier:'confirmed', text:'Donne Martin’s open-source primer outlines a similar approach: use cases and constraints, high-level design, core components, then scaling.', src:'Donne Martin, “The System Design Primer” (GitHub)'}
  ],
  mistakes:[`Jumping into components before the requirements.`, `Spending 20 minutes on estimates or login.`, `Never stating trade-offs or how failures are handled.`],
  interview:[`Say your plan in the first minute, time-box each step, and keep at least 5 minutes for bottlenecks and trade-offs.`],
  tryit:[
    {note:'Start the timer above and practise “Design a parking-spot booking app” out loud. Then put the steps in order.', mount:host => orderGame(host, PHASES.map(p => p.t))},
    {quiz:[
      {q:'What should you do in the first 5 minutes of a design interview?', options:['Draw the architecture', 'Write code', 'Pick a database', 'Clarify the requirements, scope and scale'], answer:3, why:'Requirements drive every later choice.'},
      {q:'You are halfway through and have not started the deep dive. What should you do?', options:['Keep adding detail to the current step', 'Say you are behind, skip small details and move on', 'Ask to start again', 'Stay silent and think'], answer:1, why:'Reaching the deep dive and trade-offs matters more.'}
    ], quizId:'iv-l1'}
  ],
  sources:[`Xu, System Design Interview (2020)`, `Martin, The System Design Primer`, `Kleppmann, Designing Data-Intensive Applications (2017)`]
},
{
  id:'talking-tradeoffs', title:'How to talk about trade-offs', minutes:9, tags:['trade-offs','communication','justification','alternatives'],
  summary:'Strong candidates explain why they chose something, what they give up, how they soften it, and when they would choose differently. A simple sentence pattern turns this into a habit.',
  problem:`<h3>A small example</h3><p>Two candidates are asked how the parking app stops double booking.</p><ul><li>Candidate A says: “I’ll use Postgres.”</li><li>Candidate B says: “I’ll use Postgres and lock the spot row, because two drivers must never get the same spot. We give up a little speed. If one venue created thousands of bookings a second, I’d revisit.”</li></ul><p>Both chose Postgres. Why does B get the offer?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>B builds the answer in five short moves.</p>',
    steps:[
      {icon:'📌', title:'Say the choice', text:'Name what you pick, in plain words.'},
      {icon:'🔗', title:'Link it to a need', text:'Say “because” and point to a requirement or a number you already stated.'},
      {icon:'💸', title:'Name what you give up', text:'Every choice costs something. Saying so shows judgement.'},
      {icon:'🩹', title:'Say how you soften it', text:'Add one step that reduces the cost.'},
      {icon:'🔀', title:'Offer an alternative and a trigger', text:'Name one other option, and say what would make you switch.'}
    ],
    stepper:{title:'The trade-off sentence', items:[
      {title:'Choice', tag:'what', text:'“To stop double booking I’ll lock the spot row in Postgres…”'},
      {title:'Because', tag:'requirement link', text:'“…because two drivers must never get the same spot, and writes are only about 23 a second.”'},
      {title:'We give up', tag:'cost', text:'“We give up a little speed when two drivers pick the same spot at once.”'},
      {title:'We mitigate', tag:'how', text:'“Locks last only milliseconds, and the spot map reads from a cache, so browsing stays fast.”'},
      {title:'Alternative', tag:'compare', text:'“A version number on each spot avoids locks, but the losing driver must retry.”'},
      {title:'Trigger to revisit', tag:'when', text:'“If one big event creates thousands of bookings a second on the same spots, I’d reconsider.”'}]},
    html:`<h3>Everyday comparison</h3><p>Think of a doctor explaining a medicine.</p><div class="simple-table">${h.table(['Doctor says', 'Candidate says'], [['This works fastest for your infection', 'The choice, and why.'], ['It can upset your stomach', 'What you give up.'], ['Take it after food', 'How you soften it.'], ['If you get a rash, we switch', 'The trigger to revisit.']])}</div><div class="callout tip"><b>Important point</b><p>A choice with no cost named sounds like a guess. Name the cost and it sounds like engineering.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Situation', 'What to do'], [['“Why not X?”', 'Say what X does well, then why you still chose Y.'], ['You lack a number', 'State an assumption and round it.'], ['Two options are close', 'Draw a small comparison on the board.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say a row lock is held for 10 ms. One spot can then take 1,000 ÷ 10 = 100 booking attempts a second. Locks on different spots do not wait for each other. So the cost shows up only when many drivers fight for one popular spot. That is a trigger you can name.</p><p>Say you soften the cost with a map cache that is at most 5 seconds old. A driver may see a spot as free for up to 5 seconds after it was taken. The booking still checks the database, so nobody gets a double booking.</p><h4>When it goes wrong</h4><p>A fake trade-off lists only good points, such as "it is fast and simple". A real one has a cost you could be held to. If you cannot name the cost, you probably have not understood the choice yet.</p>`
  },
  tradeoffs:{use:[`For every non-trivial choice, such as how the parking app stops double booking.`], avoid:[`Listing technologies without reasons.`, `Claiming a choice has no downside.`], alt:[`A quick comparison table on the whiteboard for 2 or 3 options.`]},
  real:[
    {co:'Google design docs', tier:'confirmed', text:'Google engineers have publicly described design docs that include context, goals and non-goals, the design, and alternatives considered with their trade-offs.', src:'Malte Ubl, “Design Docs at Google” (industrialempathy.com, 2020)'},
    {co:'Architecture Decision Records', tier:'confirmed', text:'Architecture Decision Records capture context, decision and consequences. They are the written form of a trade-off statement.', src:'Michael Nygard, “Documenting Architecture Decisions” (2011)'}
  ],
  mistakes:[`Saying “X is the best” without context.`, `Getting defensive when challenged.`, `Using buzzwords incorrectly.`],
  interview:[`Practise the pattern: choice, because, give up, soften, alternative, revisit when.`],
  tryit:[
    {note:'Weak or strong statement?', mount:host => sortGame(host, [
      {t:'“We’ll use Kafka because it’s scalable.”', c:'w', why:'No link to a need and no cost.'},
      {t:'“A cache cuts database reads about 10 times for the spot map. We accept 5 seconds of staleness and refresh on every booking.”', c:'s', why:'Quantified, cost named, mitigation given.'},
      {t:'“Microservices are best practice.”', c:'w', why:'Dogma with no trade-off.'},
      {t:'“A row lock per spot stops double booking. It adds a few milliseconds per booking, which fits our 300 ms budget.”', c:'s', why:'Need, cost and number.'},
      {t:'“NoSQL scales better than SQL.”', c:'w', why:'Too general to be useful.'}
    ], [{id:'s', label:'Strong'}, {id:'w', label:'Weak'}])},
    {quiz:[
      {q:'Which part of the trade-off sentence shows judgement most?', options:['Naming a famous tool', 'Naming what you give up', 'Speaking fast', 'Drawing a big diagram'], answer:1, why:'Every choice has a cost, and naming it shows you see it.'},
      {q:'An interviewer asks “Why not DynamoDB?” What is the best reply?', options:['It is worse', 'Because I know Postgres', 'Say what DynamoDB does well, then why this need favours Postgres', 'Change the subject'], answer:2, why:'Treat it as an invitation to compare.'}
    ], quizId:'iv-l2'}
  ],
  sources:[`Ubl, Design Docs at Google (2020)`, `Nygard (2011)`, `Richards & Ford (2020)`]
},
{
  id:'interview-mistakes', title:'Common interview mistakes (and fixes)', minutes:8, tags:['interview','mistakes','red flags','communication'],
  summary:'Most failed design interviews share a few habits: no requirements, too much detail too early, single points of failure, ignoring data, buzzwords and poor timing. Each has a simple fix.',
  problem:`<h3>A small example</h3><p>A strong engineer fails the round “Design a parking-spot booking app”. The feedback reads:</p><ul><li>“Did not ask how many cities or bookings.”</li><li>“Spent 15 minutes on the login screen.”</li><li>“Never said what happens if the database dies.”</li><li>“Ran out of time.”</li></ul><p>None of these is about knowledge. Can habits like these be fixed?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Each habit has a small, practisable fix.</p>',
    steps:[
      {icon:'🙈', title:'No requirements', text:'Fix: spend 5 minutes asking questions and write down 2 or 3 core features and the scale.'},
      {icon:'🔬', title:'Too much detail too early', text:'Fix: sketch the whole system first. Then pick one part to go deep on.'},
      {icon:'💥', title:'A box that cannot fail', text:'Fix: for each box, say what happens if it dies. One database alone is a single point of failure.'},
      {icon:'🗃️', title:'Ignoring the data', text:'Fix: name the tables, the keys and the busiest query. Say how strict consistency must be.'},
      {icon:'🏷️', title:'Buzzwords with no reason', text:'Fix: give the trade-off sentence for every choice.'},
      {icon:'⏰', title:'Running out of time', text:'Fix: follow the time boxes and keep 5 minutes for trade-offs.'}
    ],
    stepper:{title:'Red flags interviewers notice', items:[
      {title:'No requirements', tag:'fix: 5 minutes of questions', text:'Designing “everything” or the wrong thing. Fix: agree on find, book and pay, then the scale and speed needs, and write them down.'},
      {title:'Premature detail', tag:'fix: breadth first', text:'Debating Redis data structures before any high-level design exists. Fix: sketch the whole system first, then choose the deep dive.'},
      {title:'Single points of failure', tag:'fix: ask “what if it dies?”', text:'One database, one server, one region, with no talk of failure. Fix: for each box, state the backup and what users see.'},
      {title:'Ignoring data', tag:'fix: access patterns', text:'No tables, keys or indexes, and vague words about consistency. Fix: model spots and bookings, and say what must never overlap.'},
      {title:'Buzzword soup', tag:'fix: justify', text:'“Kafka, Kubernetes and microservices” with no reason. Fix: the trade-off sentence for each choice.'},
      {title:'Silence or monologue', tag:'fix: think aloud, check in', text:'Long silent thinking, or 20 minutes without pausing. Fix: say your reasoning and check in at each step.'},
      {title:'Running out of time', tag:'fix: time-box', text:'No time left for bottlenecks and trade-offs, which are often the strongest senior signal. Fix: use the time boxes.'}]},
    html:`<h3>Everyday comparison</h3><p>Think of a cricket batter who keeps getting out the same way.</p><div class="simple-table">${h.table(['Batter', 'Interview'], [['Gets out the same way each time', 'Repeats the same habit.'], ['Coach fixes the foot position', 'Fix the habit, not the topic.'], ['Practises in the nets', 'Practise mock interviews out loud.']])}</div><div class="callout tip"><b>Important point</b><p>Mistakes are habits. Practise the fix out loud until it feels normal.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Situation', 'What to do'], [['You are lost in detail', 'Say “let me step back” and finish the big picture.'], ['You do not know a product’s insides', 'Say what you expect from first principles, and label it an assumption.'], ['You have been quiet for a minute', 'Think aloud and check in.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the one database is up 99.9% of the time. It is down 0.001 × 8,760 hours = 8.76 hours a year. Add a standby that fails independently. Both are down together only 0.001 × 0.001 = 0.000001 of the time. That is about 32 seconds a year, since 0.000001 × 31,536,000 ≈ 32. This assumes the two never fail for the same reason.</p><p>Fifteen minutes on login out of 45 is 15 ÷ 45 = one third of the interview.</p><h4>When it goes wrong</h4><p>Check every number for size. 2,000,000 bookings × 1 KB should be 2 GB. If your answer says 2 TB, you are 1,000 times off. Say it out loud: "That looks too big, let me recheck the units." Catching your own slip scores better than hiding it.</p>`
  },
  tradeoffs:{use:[`A checklist for self-review after every mock interview.`], avoid:[`Memorising a canned parking-app design without understanding it.`], alt:[`Peer mock interviews with feedback.`]},
  real:[
    {co:'Interview prep resources', tier:'educational', text:'Most prep guides agree on the same failure modes: unclear requirements, no trade-offs, missing failure handling and poor time management.', src:'Simplified summary of common guidance (e.g. Xu, System Design Interview; System Design Primer)'},
    {co:'This course', tier:'educational', text:'Every case study in the Case Studies section ends with “interview twists” to practise these recovery skills.', src:'Simplified educational design'}
  ],
  mistakes:[`Treating the interview as a quiz instead of a conversation.`, `Making up internal details of real companies.`, `Not asking about scale.`],
  interview:[`Self-check: requirements written? numbers? API? data model? failure handling? trade-offs? time left to wrap up?`],
  tryit:[
    {note:'Red flag or good practice?', mount:host => sortGame(host, [
      {t:'Asking “roughly how many cities and daily bookings, and how fast must search be?”', c:'g', why:'It clarifies scale and speed needs.'},
      {t:'Spending 15 minutes on the login flow in “Design a parking-spot booking app”', c:'r', why:'An irrelevant deep dive.'},
      {t:'“If the cache fails, reads fall back to the database with a rate limit.”', c:'g', why:'It handles failure.'},
      {t:'Claiming “Google uses exactly 37 shards per region”', c:'r', why:'Invented internals.'},
      {t:'“Let me step back and finish the high-level design first.”', c:'g', why:'Self-correction.'}
    ], [{id:'g', label:'Good practice'}, {id:'r', label:'Red flag'}])},
    {quiz:[
      {q:'You realise you have spent 15 minutes on login in a parking-app interview. Best move?', options:['Keep going', 'Say so, step back, finish the high-level design and move on to double booking', 'Start over', 'Ask for more time'], answer:1, why:'Self-correct and refocus on the hard part.'},
      {q:'Which is a red flag?', options:['Stating assumptions', 'Asking about scale', 'Discussing failure modes', 'Inventing internal details of a real company'], answer:3, why:'Label assumptions and never invent facts.'}
    ], quizId:'iv-l3'}
  ],
  sources:[`Xu, System Design Interview (2020)`, `Martin, The System Design Primer`]
},
{
  id:'estimation-drills', title:'Estimation drills', minutes:12, tags:['estimation','back-of-envelope','QPS','storage','bandwidth'],
  summary:'Practise turning users and events into requests per second, storage and bandwidth, using round numbers. The goal is the right order of magnitude, because it tells you what kind of design you need.',
  problem:`<h3>A small example</h3><p>The interviewer asks how much storage the parking app needs. The candidate multiplies on the board, mixes up GB and TB, and is off by 1,000 times.</p><ul><li>2 million bookings a day.</li><li>About 1 KB for each booking record.</li><li>Keep the data for 5 years.</li></ul><p>How can we get a roughly right answer quickly?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Use the same five moves for every estimate.</p>',
    steps:[
      {icon:'⏱️', title:'Learn the anchors', text:'1 day ≈ 86,400 seconds, or about 100,000 for quick sums. 1 month ≈ 2.6 million seconds.'},
      {icon:'➗', title:'Events per second', text:'2,000,000 bookings ÷ 86,400 ≈ 23 a second. Peak is often 2 to 10 times the average.'},
      {icon:'💾', title:'Storage', text:'2,000,000 × 1 KB = 2 GB a day. 2 GB × 365 × 5 ≈ 3.7 TB over 5 years.'},
      {icon:'📶', title:'Bandwidth', text:'The map gets 20,000 reads a second at 5 KB each. 20,000 × 5 KB = 100 MB a second, which is about 800 Mbps.'},
      {icon:'✅', title:'Round and say what it means', text:'“23 writes a second fits one database. 3.7 TB fits one large disk, plus replicas.”'}
    ],
    mount:host => estimationDrills(host),
    html:`<h3>Everyday comparison</h3><p>Think of guessing wedding plates.</p><div class="simple-table">${h.table(['Wedding', 'Estimate'], [['About 500 guests, 2 plates each', 'Events × size.'], ['Order about 1,000 plates', 'Round to a useful number.'], ['Never 10 plates or a million', 'Right power of ten.']])}</div><div class="callout tip"><b>Important point</b><p>Aim for the right power of ten, not the exact number. Always end with “so this means…”.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Number', 'What it tells you'], [['23 writes a second', 'One database is enough.'], ['20,000 reads a second', 'Add a cache.'], ['3.7 TB in 5 years', 'One database with replicas.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say peak is 10 times the average. 23 × 10 = 230 writes a second. One database still copes.</p><p>For storage, say you keep 3 copies. 3.7 TB × 3 ≈ 11 TB. Say indexes add 30%. 3.7 × 1.3 ≈ 4.8 TB for one copy.</p><p>A faster shortcut rounds a day to 100,000 seconds. 2,000,000 ÷ 100,000 = 20 a second. The exact answer is 23, so the shortcut is about 13% low. That is fine for a power of ten.</p><h4>When it goes wrong</h4><p>The map needs 800 Mbps, from 100 MB/s × 8. A single 1 Gbps network link is 80% full. If traffic doubles, 1.6 Gbps no longer fits. The estimate tells you to add a cache, a CDN or more servers.</p>`
  },
  tradeoffs:{use:[`At the start of every design, to pick the kind of architecture, such as one database for 23 bookings a second.`], avoid:[`Exact arithmetic that eats interview time.`, `Forgetting peak versus average.`], alt:[`The back-of-envelope calculator playground for longer what-if questions.`]},
  real:[
    {co:'Jeff Dean', tier:'confirmed', text:'Jeff Dean’s “Numbers Everyone Should Know”, from his 2009 talks, made latency and throughput anchors popular for back-of-envelope reasoning.', src:'Jeff Dean, “Designs, Lessons and Advice from Building Large Distributed Systems” (LADIS 2009)'},
    {co:'NPCI UPI statistics', tier:'confirmed', text:'NPCI publishes monthly UPI volumes. In 2025 monthly transactions reached around 20 billion, a useful public anchor for payment-scale estimates.', src:'NPCI UPI product statistics (2025)'}
  ],
  mistakes:[`Mixing bits and bytes (8 times) or GB and TB (1,000 times).`, `Using the average when the peak matters.`, `Not stating assumptions.`],
  interview:[`Say the assumption, round, compute in powers of ten, then state what it means for the design.`],
  tryit:[
    {note:'Do all ten drills above until you can answer each within 3 times in under a minute.', pg:'envelope'},
    {quiz:[
      {q:'The parking app has 2 million bookings a day. About how many a second on average?', options:['About 2,300', 'About 230', 'About 23', 'About 2'], answer:2, why:'2,000,000 ÷ 86,400 ≈ 23.'},
      {q:'20,000 requests a second at 5 KB each need about…', options:['1 MB a second', '10 MB a second', '1 GB a second', '100 MB a second'], answer:3, why:'20,000 × 5 KB = 100,000 KB ≈ 100 MB a second.'},
      {q:'Which unit slip makes an estimate wrong by 8 times?', options:['Bits and bytes', 'GB and TB', 'Days and months', 'KB and MB'], answer:0, why:'A byte is 8 bits. GB and TB differ by 1,000 times.'}
    ], quizId:'iv-l4'}
  ],
  sources:[`Dean, LADIS 2009`, `NPCI UPI statistics`, `Xu, System Design Interview, ch. 2`]
},
{
  id:'tech-decision-tree', title:'“Which technology should I pick?” decision trees', minutes:11, tags:['decision tree','database choice','messaging','API style','technology selection'],
  summary:'Most technology choices follow from a few questions about access patterns, consistency, ordering and speed. Walk the trees for datastores, messaging and client communication, then justify the result with trade-offs.',
  problem:`<h3>A small example</h3><p>The parking-app team argues about tools: Postgres or MongoDB, Kafka or SQS, WebSockets or push.</p><ul><li>Bookings must never overlap.</li><li>Live spot status changes every few seconds.</li><li>A receipt goes out after each booking.</li></ul><p>The team skips the questions that decide the answer. Which questions are they?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Walk the decision trees below, once for each need.</p>',
    steps:[
      {icon:'🧾', title:'Bookings: data tree', text:'Bookings need multi-row transactions, and one primary handles 23 writes a second. Choose Postgres with replicas.'},
      {icon:'🅿️', title:'Live spot status: data tree', text:'No transactions needed, and the data can be rebuilt. Choose a cache such as Redis.'},
      {icon:'📧', title:'Receipts: messaging tree', text:'One worker per receipt, with no delays or priorities. Choose a managed queue such as SQS.'},
      {icon:'📲', title:'“Your spot is ready”: communication tree', text:'The server pushes the update, and the app may be closed. Choose push notifications.'},
      {icon:'🗣️', title:'Justify each pick', text:'Say the trade-off sentence for each pick. Trees narrow the options, and reasons make the choice.'}
    ],
    mount:host => decisionTree(host),
    html:`<h3>Everyday comparison</h3><p>Think of choosing transport for a trip.</p><div class="simple-table">${h.table(['Trip question', 'Technology question'], [['How many people travel?', 'How much load?'], ['How far and how fast?', 'How fast must reads be?'], ['How much luggage?', 'Must the data stay exactly right?']])}</div><div class="callout tip"><b>Important point</b><p>Ask the deciding questions before you name a tool. Most debates end after two or three questions.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Signal that changes the answer', 'Move to'], [['Writes pass about 20,000 a second', 'A store that scales writes, beyond one primary.'], ['Many teams need the same booking events, with replay', 'An event log such as Kafka.'], ['A web page needs one-way live updates', 'Server-Sent Events.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say peak bookings are 23 × 10 = 230 writes a second. The tree's trigger is about 20,000. 20,000 ÷ 230 ≈ 87, so there is about 87 times headroom.</p><p>Live status is different. Say 50,000 spots each report every 5 seconds. 50,000 ÷ 5 = 10,000 writes a second. That is more than 400 times the booking rate, and the data can be rebuilt. This is why a cache fits it better than the main database.</p><h4>When it goes wrong</h4><p>Writing to Postgres and then to Redis from the app is risky. If the second write fails, the two disagree. Make Postgres the source of truth and feed the cache from it.</p><p>A queue such as SQS may deliver a receipt message twice. Give each receipt an idempotency key, from Module 2, so a repeat sends nothing new.</p>`
  },
  tradeoffs:{use:[`Early in a design, to narrow the options. Then justify the pick with trade-offs.`], avoid:[`Choosing by popularity or résumé value.`, `One database for every job, or a new database for every feature.`], alt:[`A small prototype or load test when two options stay close.`]},
  real:[
    {co:'AWS database decision guide', tier:'confirmed', text:'AWS publishes guidance on choosing between relational, key-value, document, in-memory, graph, time-series, ledger and wide-column databases based on workload.', src:'AWS, “Choosing an AWS database service” decision guide'},
    {co:'Designing Data-Intensive Applications', tier:'confirmed', text:'Kleppmann’s book frames data-system choices around data models, access patterns, replication, partitioning and consistency rather than products.', src:'Kleppmann, Designing Data-Intensive Applications (2017)'}
  ],
  mistakes:[`Using MongoDB for strongly related, transactional data “because it’s flexible”.`, `Using Kafka as a simple job queue for slow tasks.`, `Using WebSockets for a notification sent once a day.`],
  interview:[`Ask the deciding questions out loud (“do we need transactions? what is the access pattern?”) before naming a technology.`],
  tryit:[
    {note:'Walk each of the three trees above. Then match each parking-app need to a store:', mount:host => sortGame(host, [
      {t:'Bookings and payments where a spot must never be sold twice', c:'sql', why:'ACID transactions and constraints.'},
      {t:'Sensor readings from 50,000 bays, 100K writes a second, fetched by lot and time', c:'wide', why:'Partitioned writes at scale.'},
      {t:'Search lots by name, with typo tolerance', c:'search', why:'Inverted index and ranking.'},
      {t:'Booking events used by 6 teams, with replay', c:'log', why:'A durable event log.'},
      {t:'Send each booking receipt email once', c:'queue', why:'A work queue.'}
    ], [{id:'sql', label:'Relational DB'}, {id:'wide', label:'Wide-column / KV'}, {id:'search', label:'Search engine'}, {id:'log', label:'Event log'}, {id:'queue', label:'Work queue'}])},
    {quiz:[
      {q:'You need multi-row transactions, and one primary can handle the writes. Best default?', options:['Cassandra', 'Elasticsearch', 'Managed Postgres or MySQL with replicas', 'Redis only'], answer:2, why:'You get transactions and simplicity.'},
      {q:'Six teams need the same booking events and new consumers must replay history. Use…', options:['SQS', 'Cron jobs', 'WebSockets', 'Kafka, an event log'], answer:3, why:'It is a durable, replayable log with consumer groups.'}
    ], quizId:'iv-l5'}
  ],
  sources:[`AWS database decision guide`, `Kleppmann, DDIA (2017)`, `Kafka, RabbitMQ, SQS documentation`]
},
{
  id:'glossary-cheatsheets', title:'Glossary, cheat sheets and labs: your revision kit', minutes:6, tags:['glossary','cheat sheet','revision','flashcards','labs'],
  summary:'Use the glossary flashcards, the cheat sheets and the code labs to revise before an interview. Short daily sessions beat one long cram.',
  problem:`<h3>A small example</h3><p>The parking-app interview is in two weeks. You have seen hundreds of terms and patterns.</p><ul><li>You can explain the design but forget words like “idempotency”.</li><li>You cannot rebuild an LRU cache from memory.</li><li>You do not want to re-read every lesson.</li></ul><p>How do you find your gaps fast?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Use four kinds of practice, each at its own pace.</p>',
    steps:[
      {icon:'🃏', title:'Daily, 15 minutes: flashcards', text:'Explain each term aloud in one sentence plus one example.'},
      {icon:'📋', title:'Every other day: one cheat sheet', text:'Check that you can justify each line with a trade-off.'},
      {icon:'⌨️', title:'Weekly: rebuild one lab', text:'Write an LRU cache, a token bucket, a hash ring or a Bloom filter from memory.'},
      {icon:'⏱️', title:'Before the interview: mocks', text:'Do the estimation drills and two timed mock designs, such as the parking app.'}
    ],
    mount:host => glossaryDeck(host),
    html:`<h3>Everyday comparison</h3><p>Think of revising with formula cards.</p><div class="simple-table">${h.table(['Exam revision', 'Interview revision'], [['Flip through the cards', 'Glossary flashcards.'], ['Notice the ones you cannot explain', 'Your weak terms.'], ['Revisit only those chapters', 'Re-read only those lessons.']])}</div><div class="callout tip"><b>Important point</b><p>Test yourself instead of re-reading. Recalling an answer is what builds memory.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Days', 'What to do'], [['1 to 3', 'Flashcards and one cheat sheet a day.'], ['4 to 5', 'Rebuild two labs and run the drills.'], ['6 to 7', 'Two timed mock interviews, then review.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say a flashcard takes 30 seconds. 15 minutes is 900 seconds, so 900 ÷ 30 = 30 cards a day. If the app has 300 terms, 300 ÷ 30 = 10 days to see each once. Drop the cards you marked "I knew it" and the pile shrinks. Say you know 70%. Only 300 × 0.3 = 90 cards remain, which is 3 days of work.</p><h4>How it works inside</h4><p>An LRU cache lab needs two parts. A hash map finds an entry by key. A doubly linked list keeps entries in order of use. A hit moves the entry to the front. Eviction removes the entry at the back. Both steps take constant time, which means the cost does not grow with the cache size.</p><h4>When it goes wrong</h4><p>Reading an answer feels like knowing it. Cover the answer first and say it aloud. If you stumble, mark the card for review.</p>`
  },
  tradeoffs:{use:[`Short, frequent sessions in the two weeks before the parking-app interview.`], avoid:[`Passive re-reading.`, `Memorising answers you cannot derive.`], alt:[`Study groups and mock interviews.`]},
  real:[
    {co:'Learning science', tier:'confirmed', text:'Research on retrieval practice and spacing (for example Roediger and Karpicke, 2006) shows that testing yourself and spreading practice over time improve memory more than re-reading.', src:'Roediger & Karpicke, “Test-Enhanced Learning”, Psychological Science (2006)'},
    {co:'Code labs', tier:'educational', text:'Re-implementing core data structures such as LRU, a Bloom filter or a hash ring from memory is common interview practice. It builds intuition for their trade-offs.', src:'Simplified educational design'}
  ],
  mistakes:[`Cramming the night before.`, `Only reading and never practising out loud.`],
  interview:[`Use the last week for timed mocks and flashcards on weak areas, not for new topics.`],
  tryit:[
    {note:'Go through the 15 flashcards above, then open this code lab and rebuild it without looking.', lab:'lru-cache'},
    {quiz:[
      {q:'What is the best use of the last week before an interview?', options:['Re-read all your notes', 'Learn new frameworks', 'Timed mocks, flashcards on weak areas, and rebuilding labs from memory', 'Rest completely'], answer:2, why:'Retrieval practice beats re-reading.'},
      {q:'Why are short daily sessions better than one long cram?', options:['They feel easier', 'Spreading practice over days improves memory', 'They need no effort', 'They skip hard topics'], answer:1, why:'Spacing helps long-term memory.'}
    ], quizId:'iv-l6'}
  ],
  sources:[`Roediger & Karpicke (2006)`, `This course’s glossary, cheat sheets and labs`]
}
];

SDA.register({
  kind:'module', id:'interview', order:15, level:'principal', icon:'🎯', title:'Interview & Meta',
  summary:'A time-boxed interview framework, how to talk about trade-offs, common mistakes and fixes, estimation drills with public anchors, technology decision trees, and a revision kit (glossary, cheat sheets, labs, flashcards).',
  outcomes:['Run a 45-minute design interview with a clear structure and time boxes', 'Justify every choice with the trade-off sentence', 'Estimate QPS, storage and bandwidth within an order of magnitude in under a minute', 'Choose datastores, messaging and communication styles from deciding questions', 'Revise efficiently with flashcards, cheat sheets and labs'],
  lessons,
  quiz:[
    {q:'What should you do in the first 5 minutes of a design interview?', options:['Draw the architecture', 'Write code', 'Pick a database', 'Clarify the requirements, scope and scale'], answer:3, why:'Requirements drive everything after.'},
    {q:'The parking app has 2 million bookings a day. About how many per second on average?', options:['About 2,300', 'About 230', 'About 23', 'About 2'], answer:2, why:'2,000,000 ÷ 86,400 ≈ 23.'},
    {q:'25 million viewers at 2 Mbps each need about…', options:['50 Gbps', '5 Tbps', '50 Tbps', '500 Mbps'], answer:2, why:'25,000,000 × 2,000,000 = 5 × 10¹³ bits a second.'},
    {q:'Which is the strongest trade-off statement?', options:['“Kafka scales.”', '“A cache cuts database reads 10 times for the spot map. We accept 5 seconds of staleness and refresh on every booking.”', '“We use a cache because it’s fast.”', '“NoSQL is modern.”'], answer:1, why:'It gives the benefit, the cost, the fix and a number.'},
    {q:'Bookings need multi-row transactions, and one primary can handle the writes. Best default?', options:['Cassandra', 'Elasticsearch', 'Redis only', 'Managed Postgres or MySQL with replicas'], answer:3, why:'You get ACID guarantees and simplicity.'},
    {q:'Six teams need the same booking events, and new consumers must replay history. Use…', options:['Kafka, an event log', 'SQS', 'Cron jobs', 'WebSockets'], answer:0, why:'It is a durable, replayable log with consumer groups.'},
    {q:'A web page needs occasional live updates from the server, and the client rarely sends anything. Simplest fit?', options:['WebRTC', 'Email', 'Server-Sent Events', 'gRPC streaming from the browser'], answer:2, why:'It is one-way server push over HTTP.'},
    {q:'You notice you have spent 15 minutes on login in a parking-app interview. Best move?', options:['Keep going', 'Start over', 'Ask for more time', 'Say so, step back, finish the high-level design and move to double booking'], answer:3, why:'Self-correct and refocus on the hard part.'},
    {q:'Which is a red flag?', options:['Stating assumptions', 'Inventing internal details of a real company', 'Asking about scale', 'Discussing failure modes'], answer:1, why:'Label assumptions and never invent facts.'},
    {q:'What is the most effective revision in the last week?', options:['Re-reading all your notes', 'Learning new frameworks', 'Timed mocks, flashcards on weak areas and rebuilding labs from memory', 'Doing nothing'], answer:2, why:'Retrieval practice beats re-reading.'},
    {type:'scenario', q:'Run the first 10 minutes of “Design a parking-spot booking app” out loud. What do you ask and estimate?', answer:'<ul><li><b>Scope</b>: Who uses it, drivers only or lot owners too? Core use cases: find a spot, book a time slot, pay. Can a booking be cancelled? Out of scope: lot-owner reports.</li><li><b>Needs</b>: no double booking, search under 300 ms, 99.9% availability, payments that are never charged twice.</li><li><b>Scale</b>: 2 million bookings a day ÷ 86,400 ≈ 23 a second on average, and 5 to 10 times that at the evening peak, so about 120 to 230 a second. If drivers view the map 20,000 times a second, reads outnumber writes by about 1,000 to 1.</li><li><b>Implications</b>: one relational database holds bookings with a lock per spot, a cache serves the map, a queue sends receipts, and one primary with replicas is enough to start.</li></ul>'},
    {type:'scenario', q:'An interviewer asks, “Why not just use MongoDB for everything?” in your parking-app design. Answer with a trade-off.', answer:'“MongoDB would work well for lot descriptions, because each lot has different details and documents fit naturally. For bookings and payments I chose Postgres. They need multi-row transactions and constraints, such as checking the spot is free, writing the booking and recording the payment together. The write volume of about 23 a second fits one primary with replicas. Using one store everywhere is simpler to run, but it would either weaken the booking guarantees or make the lot data awkward. If our transaction needs were simple and per-document, one document store could be reasonable.”'}
  ],
  cheatsheet:[
    {h:'⏱ 45-minute plan', items:['Clarify 5 · Estimate 4 · API 5 · Data 5', 'High-level 10 · Deep dive 10 · Bottlenecks 6', 'Say the plan first and check in at each change of step', 'Write requirements, numbers, API calls and tables on the board']},
    {h:'🗣 Trade-off sentence', items:['Choice → because (a need) → give up', '→ soften → alternative → revisit when', 'Put a number on it where you can', 'Treat “why not X?” as an invitation']},
    {h:'🧮 Estimation anchors', items:['1 day ≈ 86,400 ≈ 10⁵ s', '1 month ≈ 2.6M s · 1 year ≈ 3 × 10⁷ s', 'Per second = per day ÷ 10⁵ · peak 2 to 10 times', 'Storage = items × size × years', 'Bandwidth = requests per second × size, or viewers × bitrate', 'Bits are not bytes (8 times)']},
    {h:'🌳 Deciding questions', items:['Transactions or joins? → relational', 'Partitioned key access at scale? → wide-column or key-value', 'Search relevance? → search engine', 'One worker per job → queue · many replaying consumers → log', 'Live audio or video → WebRTC · one-to-many video → HLS or DASH', 'Push to a closed app → APNs or FCM · two-way fast → WebSockets · one-way → SSE']},
    {h:'🚩 Avoid', items:['No requirements', 'Deep detail too early', 'Single points of failure', 'Buzzwords with no reasons', 'Invented internals', 'No time left for trade-offs']}
  ],
  glossary:[
    {term:'Time-boxing', aka:['time-box', 'time boxes', 'time-boxed'], def:'Giving each step a fixed amount of time and moving on when it ends. Example: 5 minutes to clarify, then 4 to estimate.'},
    {term:'Deep dive', def:'A detailed talk about the one or two hardest parts of a design. Example: how the parking app stops two drivers booking the same spot.'},
    {term:'Order of magnitude', aka:['power of ten', 'powers of ten'], def:'How many zeros a number has, ignoring the exact digits. Example: 23 and 40 bookings a second are the same order, and 23,000 is three orders higher.'},
    {term:'Trade-off sentence', def:'A short pattern for explaining a choice: choice, because, give up, soften, alternative, revisit when. Example: “Lock the spot row, because bookings must never overlap. We give up a little speed.”'},
    {term:'Decision tree', aka:['decision trees'], def:'A chain of yes or no questions that narrows a choice. Example: “Need multi-row transactions?” leads to a relational database.'},
    {term:'Polyglot persistence', def:'Using different data stores for different jobs in one system. Example: Postgres for bookings, Redis for live spot status, a search engine for lot names.'},
    {term:'System of record', aka:['source of truth'], def:'The place that holds the official version of some data. Example: Postgres holds the official bookings, and the cache is only a copy.'},
    {term:'Retrieval practice', aka:['spaced repetition'], def:'Learning by recalling answers yourself, spread over several days. Example: explaining ten flashcard terms aloud each morning.'},
    {term:'Mock interview', aka:['mock interviews'], def:'A timed practice interview with feedback. Example: 45 minutes on “Design a parking-spot booking app” with a friend.'}
  ],
  sources:['Xu, System Design Interview (2020); Martin, The System Design Primer', 'Kleppmann, Designing Data-Intensive Applications (2017)', 'Dean, LADIS 2009 (“Numbers everyone should know”)', 'NPCI UPI statistics; Meta and YouTube public statements', 'Ubl, Design Docs at Google (2020); Nygard, ADRs (2011)', 'Roediger & Karpicke (2006)']
});
} catch(e){ console.error('[SDA] module interview', e); SDA.errors.push({id:'interview', error:e}); }
})();
