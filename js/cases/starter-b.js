/* =====================================================================
   PART 9 · STARTER CASES (b) — Dynamo-style KV store · Notification service · Typeahead · Web crawler
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, esc, fmtNum, fmtDur} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const frag = html => document.createRange().createContextualFragment(html);

function otpQueueCalc(host){
  const P = {blast:20e6, workers:200, perWorker:250, otp:300};
  const out = el('div');
  function run(){
    const rate = P.workers * P.perWorker;
    const drain = P.blast / rate;
    const sharedWait = drain / 2;
    const otpWorkers = Math.max(10, Math.round(P.workers * .1)); const otpRate = otpWorkers * P.perWorker;
    const util = P.otp / otpRate; const splitWait = util >= 1 ? Infinity : (1 / otpRate) / (1 - util);
    out.innerHTML = '';
    out.append(frag(h.table(['Design', 'Campaign drains in', 'Typical OTP delivery time during the campaign'], [['One shared FIFO queue', fmtDur(drain * 1000), `<span style="color:var(--bad)">≈ ${fmtDur(sharedWait * 1000 + 1500)} (stuck behind marketing)</span>`], [`Separate OTP queue with ${otpWorkers} reserved workers`, fmtDur(drain * 1000 * P.workers / (P.workers - otpWorkers)), `<span style="color:var(--ok)">${isFinite(splitWait) ? '≈ ' + fmtDur(splitWait * 1000 + 1500) : 'overloaded: reserve more workers'}</span>`]], [])));
    out.append(el('div', {class:'verdict ' + (sharedWait > 30 ? 'bad' : 'ok')}, `${fmtNum(P.blast)} campaign messages at ${fmtNum(rate)}/s take ${fmtDur(drain * 1000)} to drain. In a shared queue an OTP sent mid-campaign waits behind them and expires. A dedicated priority queue and worker pool keeps OTPs in seconds, for the cost of slightly slower campaigns.`));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Campaign size', min:1e5, max:5e7, step:1e5, value:P.blast, fmt:v => fmtNum(v), onInput:v => { P.blast = v; run(); }}).el,
    ui.slider({label:'Workers', min:10, max:2000, step:10, value:P.workers, fmt:v => fmtNum(v), onInput:v => { P.workers = v; run(); }}).el,
    ui.slider({label:'Sends per worker per second', min:10, max:1000, step:10, value:P.perWorker, fmt:v => String(v), onInput:v => { P.perWorker = v; run(); }}).el,
    ui.slider({label:'OTPs per second', min:10, max:5000, step:10, value:P.otp, fmt:v => fmtNum(v), onInput:v => { P.otp = v; run(); }}).el), out,
    el('p', {class:'lab-hint'}, 'Delivery time = queueing wait + ~1.5 s provider/network time. Shared-queue wait ≈ half the campaign drain time (an OTP arrives mid-blast); separate queue: M/M/1-style wait with 10% of workers reserved for OTPs. Illustrative model.'));
  run();
}

/* ======================= 5. DYNAMO-STYLE KV STORE ======================= */
SDA.register({kind:'case', id:'kv-store', tier:'starter', icon:'🗝️', title:'Distributed key-value store (Dynamo-style)', tagline:'Always writable: consistent hashing, quorums, hinted handoff and Merkle repair.', tags:['Dynamo', 'consistent hashing', 'quorum', 'vector clock', 'gossip', 'Merkle tree'],
  modules:['distributed', 'databases'],
  summary:'Build a key-value store that scales horizontally and stays writable during failures, like Amazon’s Dynamo for shopping carts. Every classic distributed-systems technique appears: partitioning, replication, quorums, conflict resolution, failure detection and anti-entropy.',
  accuracy:'Follows the techniques published in the Amazon Dynamo paper (2007) and Apache Cassandra. Note that today’s managed DynamoDB service uses a different, leader-based replication design. Numbers are illustrative.',
  overview:{what:'A service offering <code>get(key)</code> and <code>put(key, value)</code> for small values (< 1 MB), used by carts, sessions and user preferences, prioritising availability over strict consistency.', in:['Partitioning across nodes', 'Replication with tunable N, R, W', 'Conflict detection/resolution', 'Failure detection and repair'], out:['Secondary indexes and range queries', 'Multi-key transactions', 'SQL']},
  challenges:['Spread data evenly and rebalance when nodes join or leave', 'Keep accepting writes during node failures and network partitions', 'Detect and resolve conflicting concurrent writes', 'Detect failures without a central master', 'Repair replicas that drifted apart'],
  fr:['put(key, value[, context]) and get(key) → value(s) + context', 'Configurable N (replicas), R and W (read/write quorums)', 'Add/remove nodes with minimal data movement'],
  nfr:['Always writable (AP in CAP terms) for carts', 'p99 < 10 ms within a region', 'Horizontally scalable to hundreds of nodes', 'Durable: acknowledged writes survive node loss'],
  scale:[
    {k:'Data', v:'100 TB logical → 300 TB raw', math:'replication N = 3', tag:'illustrative'},
    {k:'Nodes', v:'≈ 200', math:'300 TB ÷ 1.5 TB usable per node', tag:'illustrative'},
    {k:'Throughput', v:'≈ 2M ops/s', math:'≈ 10K ops/s per node × 200', tag:'illustrative'},
    {k:'Keys moved when a node joins', v:'≈ 1/N of data', math:'consistent hashing: only neighbours’ ranges move', tag:'illustrative'}],
  arch:{w:880, h:340, nodes:[
    {id:'c', type:'client', label:'Cart service', x:70, y:170, w:110},
    {id:'r', type:'lb', label:'Coordinator', sub:'routes by hash', x:225, y:170, w:130, stage:1},
    {id:'n1', type:'db', label:'Node A', sub:'hash map + WAL', x:430, y:60, w:120},
    {id:'n2', type:'db', label:'Node B', x:630, y:110, w:110, stage:1},
    {id:'n3', type:'db', label:'Node C', x:630, y:235, w:110, stage:1},
    {id:'n4', type:'db', label:'Node D', x:430, y:285, w:110, stage:1},
    {id:'hint', type:'queue', label:'Hinted handoff', sub:'held for C', x:795, y:280, w:140, stage:3},
    {id:'gos', type:'ext', label:'Gossip + φ-accrual', sub:'membership', x:800, y:120, w:130, stage:4},
    {id:'rep', type:'service', label:'Merkle anti-entropy', x:225, y:295, w:150, stage:4}],
   edges:[{from:'c', to:'n1', gone:1}, {from:'c', to:'r', stage:1}, {from:'r', to:'n1', stage:1}, {from:'r', to:'n2', stage:1}, {from:'r', to:'n3', stage:1}, {from:'r', to:'n4', stage:1}, {from:'n1', to:'n2', stage:2}, {from:'n2', to:'n3', stage:2}, {from:'n3', to:'hint', stage:3}, {from:'gos', to:'n2', stage:4}, {from:'gos', to:'n3', stage:4}, {from:'rep', to:'n1', stage:4}, {from:'rep', to:'n4', stage:4}]},
  evolution:[
    {title:'One node: hash map + WAL', scale:'1 node, 200 GB', fix:'<p>A single server keeps an in-memory hash map backed by a write-ahead log (or an LSM-tree). Fast and simple until the data or traffic outgrow one machine.</p>', after:{lat:1, err:0, load:30}},
    {title:'Data outgrows one machine', scale:'50 TB', hot:['n1'], breaks:'<p>One node can’t hold 50 TB or serve 500K ops/s. Naively sharding by <code>hash(key) % N</code> means adding a node reshuffles almost every key.</p>', fix:'<p><b>Consistent hashing</b> with virtual nodes: each node owns several ranges of a hash ring; adding a node moves only ~1/N of keys. A <b>coordinator</b> (any node can play it) routes each request to the key’s owner.</p>', before:{lat:90, err:3, load:160}, after:{lat:3, err:.02, load:45}, flow:[['c', 'r', 'put cart:42'], ['r', 'n2', 'owner']], lesson:['consistent-hashing', 'sharding']},
    {title:'A node dies and its keys vanish', scale:'200 nodes', down:['n2'], breaks:'<p>With hundreds of commodity nodes, failures are daily events. Every key owned only by the failed node is unavailable, or lost if the disk died.</p>', fix:'<p><b>Replicate</b> each key to the next N = 3 distinct nodes on the ring (its preference list). Writes succeed when <b>W = 2</b> replicas acknowledge, reads query <b>R = 2</b>; since R + W > N, reads overlap the latest acknowledged write.</p>', sub:{n1:'replica set A·B·C'}, before:{lat:5, err:25, load:60}, after:{lat:6, err:.02, load:55}, flow:[['r', 'n1', 'W'], ['n1', 'n2', 'replicate'], ['n2', 'n3', 'replicate']], lesson:['replication', 'quorums']},
    {title:'Partitions reject writes', scale:'Multi-AZ', down:['n3'], breaks:'<p>During a network partition, fewer than W of a key’s home replicas are reachable, so strict quorums reject writes and the cart page errors (“can’t add to cart”), which costs sales.</p>', fix:'<p><b>Sloppy quorum + hinted handoff</b>: write to the next healthy nodes instead, tagging data with a hint (“this belongs to C”), and deliver it when C recovers. Concurrent writes may now conflict, so version values with <b>vector clocks</b> and let the application merge siblings (e.g. union of cart items).</p>', before:{lat:6, err:8, load:55}, after:{lat:7, err:.05, load:55}, flow:[['n3', 'hint', 'hint for C']], lesson:['cap-pacelc', 'clocks']},
    {title:'Silent drift and membership chaos', scale:'Daily failures', hot:['n1', 'n4'], breaks:'<p>Hints get lost when the holder dies; replicas silently diverge. A central membership server becomes a single point of failure, and fixed timeouts mark slow nodes dead, which flaps routing.</p>', fix:'<p><b>Gossip</b>-based membership with φ-accrual failure detection (no master), and background <b>anti-entropy</b>: replicas compare <b>Merkle trees</b> of key ranges and sync only the ranges that differ. <b>Read repair</b> fixes stale replicas seen during reads.</p>', before:{lat:9, err:.6, load:65}, after:{lat:6, err:.01, load:50}, flow:[['gos', 'n2', 'gossip'], ['rep', 'n1', 'compare roots']], lesson:['failure-detection', 'crdts-merkle']}],
  flows:[
    {name:'put(cart:42) with N=3, W=2', steps:[
      {note:'The cart service sends <code>put(cart:42, [...], context)</code> to a coordinator.', flow:[['c', 'r', 'put']]},
      {note:'The coordinator hashes the key; its preference list is A, B, C. It writes locally (if it is A) and forwards to B and C in parallel.', flow:[['r', 'n1', 'write'], ['r', 'n2', 'write'], ['r', 'n3', 'write']], parallel:true},
      {note:'After <b>W = 2</b> acknowledgements the coordinator replies success; the third replica catches up asynchronously.', flow:[['n1', 'r', 'ack'], ['n2', 'r', 'ack'], ['r', 'c', 'OK + new vector clock']]}]},
    {name:'get(cart:42) with R=2 + read repair', steps:[
      {note:'The coordinator asks replicas for the key.', flow:[['c', 'r', 'get'], ['r', 'n1'], ['r', 'n2']], parallel:false},
      {note:'Two replicas answer; one has an older version (by vector clock). The coordinator returns the newest (or all concurrent siblings for the app to merge).', flow:[['n1', 'r', 'v7'], ['n2', 'r', 'v6 (stale)']]},
      {note:'<b>Read repair</b>: the coordinator writes the newest version back to the stale replica.', flow:[['r', 'n2', 'repair v7'], ['r', 'c', 'v7']]}]}],
  breakIt:[
    {label:'One replica down', kill:['n2'], verdict:'survives', text:'With N=3, R=W=2, the two remaining replicas still form quorums. Reads and writes continue; the failed node is repaired later by hints and anti-entropy.', flow:[['r', 'n1', 'W'], ['r', 'n3', 'W']]},
    {label:'Two replicas down', kill:['n2', 'n3'], verdict:'degrades', text:'A strict quorum is impossible; with a sloppy quorum, writes go to other healthy nodes with hints (still available, weaker guarantees). Reads may miss the newest version until repair.', flow:[['r', 'n4', 'sloppy write'], ['n3', 'hint']]},
    {label:'Coordinator crash', kill:['r'], verdict:'survives', text:'Any node can coordinate. Clients (or a load balancer) retry with another node; a partition-aware client library can route directly.'},
    {label:'Network partition', hot:['n1', 'n4'], kill:['n3'], verdict:'degrades', text:'Both sides keep accepting writes (availability), creating concurrent versions. Vector clocks detect them; the app merges (e.g. union of cart items, so a deleted item can reappear, a known trade-off).'}],
  dataModel:{lang:'text', title:'storage per node', code:`key           → { value bytes, vector_clock, tombstone? }
cart:42       → { [ {sku: "atta-5kg", qty: 1}, {sku: "ghee-1l", qty: 2} ], {A:7, B:3}, false }

Per node: LSM-tree storage engine
  memtable (in-memory, sorted) → flushed to SSTables (immutable, sorted)
  commit log (WAL) for durability · Bloom filter per SSTable · compaction

Ring metadata (gossiped): node → [token ranges], status, heartbeat counter`, notes:'Values are opaque blobs to the store; the application owns their meaning and merge rules. The vector clock is the context the client sends back on the next put.'},
  apis:[
    {m:'PUT', path:'/v1/kv/{key}', note:'Context is the vector clock from the last read; omit for blind writes.', req:'{ "value": "base64…", "context": {"A": 7, "B": 3}, "w": 2 }', res:'{ "ok": true, "context": {"A": 8, "B": 3} }'},
    {m:'GET', path:'/v1/kv/{key}?r=2', note:'May return several siblings if concurrent writes were detected.', res:'{ "values": ["base64…"], "context": {"A": 8, "B": 3} }'},
    {m:'ADMIN', path:'/admin/ring', res:'{ "nodes": [{ "id": "A", "tokens": 256, "status": "UP" }], "n": 3 }'}],
  algorithm:{title:'Quorums, rings and repair', html:'<p>With N replicas, R + W > N guarantees that read and write sets overlap. Try the quorum explorer, then run Merkle-tree anti-entropy in the code lab.</p>', pg:'cap-quorum', lab:['consistent-hashing', 'merkle-diff']},
  tradeoffs:[['AP (sloppy quorum, hinted handoff)', 'Carts stay writable during failures and partitions', 'Conflicting versions; application must merge; deleted items may reappear'], ['Consistent hashing + vnodes', 'Even load; minimal movement on membership change', 'More metadata; rebalancing still costs bandwidth'], ['Leaderless replication', 'No failover pause; any replica serves', 'Harder consistency reasoning; repair machinery needed'], ['Gossip membership', 'No single master', 'Membership views converge eventually, not instantly']],
  alternatives:[['Leader-based replication per partition (Multi-Paxos/Raft)', 'Stronger consistency; brief unavailability during leader election (DynamoDB’s current design takes this path)'], ['A single relational DB', 'Simpler, but limited write scaling and failover pauses'], ['Redis Cluster', 'Fast, but primarily in-memory with async replication and different durability trade-offs']],
  failures:[['Node crash', 'Quorums continue; hinted handoff; replace node and stream its ranges'], ['Disk loss', 'Rebuild from replicas via anti-entropy'], ['Partition', 'Both sides accept writes (AP); reconcile with vector clocks'], ['Hot key', 'Cache in front; split key (application-level); add replicas for reads']],
  lab:{stack:['Go or Rust (or Node for learning)', 'gRPC/HTTP between nodes', 'RocksDB/LevelDB or an in-memory map + WAL', 'Docker Compose (5 nodes)', 'tc/netem or Toxiproxy for partitions'], milestones:[
    {day:'Day 1', items:['Single-node KV with WAL and recovery', 'Consistent-hash ring with 128 vnodes per node', 'Coordinator forwards to the key owner', 'Add a node and measure keys moved']},
    {day:'Day 2', items:['Replicate to N=3 with W/R quorums', 'Vector clocks on values; return siblings', 'Hinted handoff when a replica is down', 'Kill a node mid-load and check availability']},
    {day:'Day 3', items:['Gossip membership with heartbeats', 'Merkle-tree anti-entropy per range', 'Read repair', 'Jepsen-style test: partitions + random kills, verify no acknowledged write is lost']}],
   pseudocode:{lang:'ts', code:`async function put(key: string, value: Buffer, ctx: VClock) {
  const prefs = ring.preferenceList(key, N);                  // next N distinct physical nodes
  const healthy = prefs.filter(n => membership.isUp(n));
  const targets = [...healthy, ...ring.fallbacks(key, N - healthy.length)];  // sloppy quorum
  const clock = ctx.increment(self.id);
  const acks = await quorum(targets.map(n => n.write(key, value, clock, n.isFallback ? { hintFor: prefs.find(p => !healthy.includes(p)) } : {})), W, 150 /*ms*/);
  if (acks < W) throw new Error('quorum not reached');
  return clock;
}`},
   loadTest:'<p>Run 5 nodes, write 1M keys at 20K ops/s with W=2, randomly kill and restart nodes and inject partitions. Afterwards verify every acknowledged write is readable (no data loss), count conflicting siblings, and measure how long anti-entropy takes to converge.</p>'},
  twists:[
    {q:'The business now needs “read your own writes” for carts. What changes?', a:'Route a user’s reads to the same coordinator/replica they wrote to (session stickiness), or use R + W > N with W = majority, or return the context from the write and require reads to be at least that new (wait or read from more replicas).'},
    {q:'How do you handle deletes in an AP store?', a:'Write tombstones (a versioned delete marker) instead of removing data, keep them long enough for all replicas to see them (grace period, e.g. Cassandra’s gc_grace_seconds), then purge during compaction. Otherwise an old replica could resurrect the deleted value.'},
    {q:'A single key gets 100K reads/s. Now what?', a:'Cache it (client-side or a cache tier), increase R-side replication for reads, or have the application split it (e.g. sharded counters). Consistent hashing can’t spread a single key.'}],
  real:[
    {co:'Amazon Dynamo (2007)', tier:'confirmed', text:'The Dynamo paper describes a highly available key-value store for services like the shopping cart, using consistent hashing, replication with sloppy quorums, hinted handoff, vector clocks, Merkle-tree anti-entropy and gossip-based membership.', src:'DeCandia et al., “Dynamo: Amazon’s Highly Available Key-value Store”, SOSP 2007'},
    {co:'Apache Cassandra', tier:'confirmed', text:'Cassandra (from Facebook) combined Dynamo-style partitioning and replication with a Bigtable-style data model and LSM storage, and uses φ-accrual failure detection and tunable consistency levels.', src:'Lakshman & Malik, “Cassandra: A Decentralized Structured Storage System” (2010); Cassandra documentation'},
    {co:'Amazon DynamoDB', tier:'confirmed', text:'DynamoDB’s 2022 paper explains that the managed service uses Multi-Paxos-replicated partitions with a leader, a different design from the original Dynamo, to provide predictable performance and strongly consistent reads.', src:'Elhemali et al., “Amazon DynamoDB: A Scalable, Predictably Performant, and Fully Managed NoSQL Database Service”, USENIX ATC 2022'}],
  sources:['DeCandia et al., Dynamo, SOSP 2007', 'Lakshman & Malik, Cassandra (2010)', 'Elhemali et al., DynamoDB, USENIX ATC 2022', 'Hayashibara et al., “The φ Accrual Failure Detector” (2004)', 'Kleppmann, Designing Data-Intensive Applications, ch. 5–6']
});

/* ======================= 6. NOTIFICATION SERVICE ======================= */
SDA.register({kind:'case', id:'notification-service', tier:'starter', icon:'🔔', title:'Notification service (push, SMS, email)', tagline:'OTPs in seconds, campaigns in minutes, no duplicates, no spam.', tags:['push', 'SMS', 'email', 'priority queue', 'dedupe', 'provider failover'],
  modules:['async', 'realtime', 'reliability', 'security'],
  summary:'One platform that every team uses to notify users across push, SMS, email and in-app, respecting preferences, deduplicating, prioritising OTPs over marketing, and surviving provider outages.',
  accuracy:'A simplified reference design. Platform rules (APNs/FCM, TRAI DLT, bulk-sender requirements) are cited in Sources; numbers are illustrative.',
  overview:{what:'Services publish “notify user X about Y”; the platform decides channel, template and timing, then delivers via providers (APNs/FCM, SMS gateways, email).', in:['Transactional (OTP, order updates) and marketing campaigns', 'Preferences, quiet hours, opt-outs', 'Templates and localisation', 'Retries, dedupe, provider failover, delivery tracking'], out:['Campaign design UI and segmentation engine', 'Email rendering builder']},
  challenges:['Wildly different priorities: an OTP must arrive in seconds; a 20M-user campaign can take an hour', 'Never send duplicates (especially money/OTP) despite at-least-once queues', 'External providers are slow, rate-limited and sometimes down', 'Regulation and user trust: opt-outs, quiet hours, DLT templates in India, unsubscribe headers'],
  fr:['Send a notification to a user on one or more channels', 'Respect preferences, quiet hours and opt-outs', 'Schedule and bulk-send campaigns', 'Track delivery status'],
  nfr:['OTP end-to-end p99 < 10 s', 'At-least-once processing with idempotent sends (no visible duplicates)', '99.95% availability of the send API', 'Campaigns must never delay transactional messages'],
  scale:[
    {k:'Daily notifications', v:'≈ 500M/day', math:'50M DAU × ~10 notifications', tag:'illustrative'},
    {k:'Average rate', v:'≈ 6K/s', math:'500M ÷ 86,400', tag:'illustrative'},
    {k:'Campaign peak', v:'≈ 50K/s', math:'20M users in ~7 minutes', tag:'illustrative'},
    {k:'OTP volume', v:'≈ 300/s peak', math:'logins + payments, small but critical', tag:'illustrative'},
    {k:'Delivery logs', v:'≈ 150 GB/day', math:'500M × ~300 B', tag:'illustrative'}],
  arch:{w:880, h:340, nodes:[
    {id:'svc', type:'service', label:'Order service', sub:'producer', x:80, y:170, w:130},
    {id:'sms', type:'ext', label:'SMS provider', x:300, y:55, w:120, gone:1},
    {id:'ns', type:'service', label:'Notification API', sub:'validate · route', x:300, y:170, w:150, stage:1},
    {id:'prefs', type:'db', label:'Prefs & templates', x:300, y:295, w:150, stage:2},
    {id:'dd', type:'cache', label:'Dedupe keys', sub:'Redis, 24 h', x:500, y:40, w:130, stage:2},
    {id:'q', type:'queue', label:'Priority queue', sub:'OTP first', x:500, y:135, w:150, stage:1},
    {id:'q2', type:'queue', label:'Bulk queue', sub:'campaigns', x:500, y:255, w:130, stage:3},
    {id:'w', type:'service', label:'Channel workers', x:690, y:135, w:140, stage:1},
    {id:'w2', type:'service', label:'Bulk workers', x:690, y:255, w:130, stage:3},
    {id:'pr', type:'ext', label:'Providers', sub:'APNs · FCM · SMS · email', x:785, y:60, w:170, stage:1},
    {id:'pr2', type:'ext', label:'Backup SMS', x:805, y:315, w:110, stage:4}],
   edges:[{from:'svc', to:'sms', gone:1}, {from:'svc', to:'ns', stage:1}, {from:'ns', to:'prefs', stage:2}, {from:'ns', to:'dd', stage:2}, {from:'ns', to:'q', stage:1}, {from:'ns', to:'q2', stage:3}, {from:'q', to:'w', stage:1}, {from:'q2', to:'w2', stage:3}, {from:'w', to:'pr', stage:1}, {from:'w2', to:'pr', stage:3, curve:0.25}, {from:'w', to:'pr2', stage:4, curve:-0.1}, {from:'w2', to:'pr2', stage:4}]},
  evolution:[
    {title:'Order service calls the SMS API inline', scale:'1K orders/day', fix:'<p>Checkout calls the SMS provider’s HTTP API directly before returning. It works while volumes are tiny and the provider is fast.</p>', after:{lat:350, err:.5, load:10}},
    {title:'A slow provider slows checkout', scale:'50K orders/day', hot:['svc', 'sms'], breaks:'<p>The SMS provider takes 3 s at peak; checkout requests hang with it. When it errors, the message is simply lost. Each team re-implements SMS, email and push differently.</p>', fix:'<p>A <b>notification service</b>: producers publish a request and return immediately; a <b>queue</b> buffers work; <b>channel workers</b> send with timeouts, retries with backoff, and a DLQ.</p>', before:{lat:3000, err:3, load:90}, after:{lat:40, err:.1, load:30}, flow:[['svc', 'ns', 'notify'], ['ns', 'q'], ['q', 'w'], ['w', 'pr', 'send']], lesson:['queues-pubsub-streams', 'ordering-dlq']},
    {title:'Duplicates, spam and wrong language', scale:'5M users', hot:['w'], breaks:'<p>Retries after timeouts send the same OTP twice; users get 15 promotional pushes a day, at 2 AM, in the wrong language, and start uninstalling.</p>', fix:'<p><b>Idempotency/dedupe keys</b> (e.g. <code>order-881:shipped:push</code>) checked in Redis before sending; a <b>preferences & templates</b> store (channels, quiet hours, locale, opt-outs); per-user frequency caps.</p>', before:{lat:45, err:1.5, load:35}, after:{lat:48, err:.05, load:35}, flow:[['ns', 'dd', 'seen?'], ['ns', 'prefs', 'prefs+template']], lesson:['idempotency-rate-limit-headers', 'delivery-semantics']},
    {title:'A marketing blast delays OTPs', scale:'20M-user campaign', hot:['q', 'w'], breaks:'<p>A Diwali campaign enqueues 20M messages. Login OTPs sit behind them in the same queue for minutes and expire; users can’t log in or pay.</p>', fix:'<p><b>Separate priority queues and worker pools</b>: transactional/OTP traffic has its own queue, reserved workers and provider capacity; campaigns are throttled in a bulk queue.</p>', before:{lat:180000, err:4, load:300}, after:{lat:900, err:.05, load:60}, flow:[['ns', 'q2', 'campaign'], ['q2', 'w2'], ['ns', 'q', 'OTP'], ['q', 'w']], lesson:['backpressure', 'bulkhead-fallback']},
    {title:'The SMS provider has an outage', scale:'Production reality', down:['pr'], breaks:'<p>The single SMS gateway is down for 40 minutes: no OTPs, no logins, no payments. Retries pile up and hammer it when it returns.</p>', fix:'<p><b>Multi-provider routing</b> with health scoring and <b>circuit breakers</b>: fail over OTPs to a backup provider, fall back to another channel (push/voice/WhatsApp) where allowed, and track delivery receipts per provider to pick the best route.</p>', before:{lat:900, err:35, load:60}, after:{lat:950, err:.3, load:60}, flow:[['w', 'pr2', 'failover']], lesson:['circuit-breaker', 'redundancy-failover']}],
  flows:[
    {name:'Send a login OTP', steps:[
      {note:'Auth service publishes <code>{user, type: OTP, idempotency_key}</code> to the notification API.', flow:[['svc', 'ns', 'notify OTP']]},
      {note:'The API checks the dedupe key and loads the user’s locale and the registered template.', flow:[['ns', 'dd', 'SETNX key'], ['ns', 'prefs', 'locale, template']], parallel:true},
      {note:'OTPs go to the <b>priority queue</b> with a short TTL (no point delivering after 5 minutes).', flow:[['ns', 'q', 'priority']]},
      {note:'A reserved worker sends via the healthiest SMS route and records the provider message ID; the delivery receipt updates status later.', flow:[['q', 'w'], ['w', 'pr', 'send']]}]},
    {name:'Diwali campaign to 20M users', steps:[
      {note:'Marketing schedules a campaign; the API expands the audience in batches, applying opt-outs and frequency caps.', flow:[['svc', 'ns', 'campaign'], ['ns', 'prefs', 'filter']]},
      {note:'Messages go to the <b>bulk queue</b>, throttled to respect provider limits.', flow:[['ns', 'q2', '20M jobs']]},
      {note:'Bulk workers send over ~an hour; OTP traffic keeps flowing through its own queue in parallel.', flow:[['q2', 'w2'], ['w2', 'pr', 'push'], ['q', 'w', 'OTP']], parallel:true}]}],
  breakIt:[
    {label:'Primary SMS provider down', kill:['pr'], verdict:'survives', text:'The circuit breaker opens after errors; OTPs fail over to the backup provider within seconds.', flow:[['w', 'pr2', 'failover']]},
    {label:'Bulk workers crash', kill:['w2'], verdict:'survives', text:'Campaigns pause and the bulk queue grows; OTPs and order updates are unaffected (bulkheads). Workers resume from the queue.'},
    {label:'Dedupe store down', kill:['dd'], verdict:'degrades', text:'Fall back to a DB idempotency table (slower) or fail closed for OTPs and fail open for low-risk updates. Duplicates are possible for some low-risk messages.'},
    {label:'Notification API down', kill:['ns'], verdict:'degrades', text:'Producers write requests to their own transactional outbox and retry; nothing is lost, delivery is delayed.'}],
  dataModel:{lang:'sql', title:'core tables', code:`CREATE TABLE notification_requests (
  id               BIGINT PRIMARY KEY,               -- Snowflake
  idempotency_key  TEXT UNIQUE NOT NULL,
  user_id          BIGINT NOT NULL,
  category         TEXT NOT NULL,                    -- otp | transactional | marketing
  template_id      TEXT NOT NULL,
  params           JSONB NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE deliveries (
  request_id   BIGINT REFERENCES notification_requests(id),
  channel      TEXT NOT NULL,                        -- push | sms | email | inapp
  provider     TEXT, provider_msg_id TEXT,
  status       TEXT NOT NULL,                        -- queued | sent | delivered | failed
  updated_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (request_id, channel)
);
-- preferences(user_id, channel, category, enabled, quiet_start, quiet_end, locale)
-- device_tokens(user_id, token, platform, last_seen)  -- prune on 'unregistered'`},
  apis:[
    {m:'POST', path:'/v1/notifications', req:'{ "idempotency_key": "order-881:shipped", "user_id": 42, "category": "transactional", "template": "order_shipped", "params": { "order": "881", "eta": "18:30" }, "channels": ["push", "sms"] }', res:'202 Accepted { "request_id": "1863…" }'},
    {m:'POST', path:'/v1/campaigns', req:'{ "template": "diwali_sale", "segment": "active_30d", "send_at": "2026-11-08T10:00:00+05:30", "max_rate_per_sec": 20000 }', res:'201 Created { "campaign_id": "c_77" }'},
    {m:'POST', path:'/webhooks/providers/{name}', note:'Delivery receipts from providers update the deliveries table.', req:'{ "provider_msg_id": "abc123", "status": "DELIVERED", "ts": "…" }'}],
  algorithm:{title:'Priorities and dedupe', html:'<p><b>Dedupe:</b> <code>SET dedupe:{key} 1 NX EX 86400</code> before sending; if it already exists, skip. Combined with idempotent provider calls, this makes at-least-once queues safe. <b>Priorities:</b> separate queues and reserved capacity beat a single priority queue under extreme load. See how much a campaign delays OTPs in a shared queue:</p>', mount:host => otpQueueCalc(host)},
  tradeoffs:[['Async queue between producers and providers', 'Fast producers; retries and buffering', 'Eventual delivery; need tracking and DLQ handling'], ['Separate queues per priority', 'OTPs never wait behind campaigns', 'More infrastructure; reserved capacity sits idle sometimes'], ['Dedupe in Redis', 'Cheap, fast duplicate prevention', 'A Redis outage weakens guarantees, so define a fallback'], ['Multiple providers', 'Survive outages; route by cost/quality', 'Integration effort; template registration per provider (e.g. DLT)']],
  alternatives:[['Each team calls providers directly', 'Duplicated logic, no global preferences or rate limits'], ['One priority queue', 'Simpler, but a huge backlog still hurts and starvation is possible'], ['Managed service (SNS/Pinpoint, third-party platforms)', 'Faster to start; less control over routing, cost and data residency']],
  failures:[['Provider outage', 'Circuit breaker + failover route + alternate channel'], ['Queue backlog', 'Autoscale workers on lag; shed marketing first'], ['Bad template deploy', 'Template versioning + canary send to internal users'], ['Token churn', 'Prune unregistered tokens from provider responses']],
  lab:{stack:['Node.js or Go', 'PostgreSQL', 'Redis', 'RabbitMQ or SQS-compatible (ElasticMQ)', 'Mock providers (local HTTP servers)', 'Docker Compose'], milestones:[
    {day:'Day 1', items:['POST /notifications with idempotency key', 'Queue + worker sending to a mock SMS provider', 'Retries with backoff + DLQ', 'Delivery status table']},
    {day:'Day 2', items:['Preferences + quiet hours + templates', 'Redis dedupe (SET NX EX)', 'Separate OTP and bulk queues with separate worker pools', 'Campaign fan-out in batches with a rate limit']},
    {day:'Day 3', items:['Second mock provider + circuit breaker failover', 'Webhook for delivery receipts', 'Kill provider A during a campaign and measure OTP latency', 'Dashboard: queue lag per priority, provider success rate']}],
   pseudocode:{lang:'ts', code:`async function handle(job: NotificationJob) {
  if (!(await redis.set(\`dd:\${job.idempotencyKey}:\${job.channel}\`, '1', 'NX', 'EX', 86400))) return; // duplicate
  const prefs = await prefsCache.get(job.userId);
  if (!prefs.allows(job.category, job.channel) || prefs.inQuietHours(job.category)) return defer(job);
  const msg = templates.render(job.templateId, prefs.locale, job.params);
  for (const provider of router.ranked(job.channel)) {            // healthiest / cheapest first
    if (breakers.get(provider).isOpen()) continue;
    try { const id = await provider.send(job.to, msg, { timeoutMs: 3000 }); return record(job, provider, id); }
    catch (e) { breakers.get(provider).fail(); }
  }
  throw new RetryableError('all providers failed');               // queue retries with backoff, then DLQ
}`},
   loadTest:'<p>Enqueue a 2M-message campaign at max speed and simultaneously send 50 OTPs/s; measure OTP p99 end-to-end (target < 10 s). Then kill the primary mock provider and confirm OTPs keep flowing through the backup. Re-deliver every job twice and confirm zero duplicate sends.</p>'},
  twists:[
    {q:'How do you guarantee an OTP is never sent twice but always sent at least once?', a:'Exactly-once delivery is impossible end to end; aim for exactly-once effect: at-least-once queue processing + an idempotency key checked atomically before sending + idempotent provider requests (where supported) + a short TTL so stale OTPs aren’t sent. Log the provider message ID to reconcile.'},
    {q:'India requires registered SMS templates. How does that affect the design?', a:'Under TRAI’s DLT framework, commercial SMS headers and templates must be registered; messages that don’t match a registered template are blocked. The template store must hold the DLT template ID per message type and provider, and template changes need a registration workflow before use.'},
    {q:'Traffic grows 10×. What scales first?', a:'Workers and queues scale horizontally; the limits are provider throughput (rate limits, cost) and preference lookups. Add caching for preferences, batch provider calls (FCM multicast, email batch APIs), negotiate higher limits, and shard queues by user.'}],
  real:[
    {co:'APNs and FCM', tier:'confirmed', text:'Apple and Google push services accept up to 4 KB payloads, support expiry/TTL and collapse identifiers, and report invalid tokens that should be removed.', src:'Apple APNs documentation; Firebase Cloud Messaging documentation'},
    {co:'TRAI DLT (India)', tier:'confirmed', text:'India’s Telecom Commercial Communications Customer Preference Regulations (2018) require registration of senders, headers, consent and message templates on Distributed Ledger Technology platforms run by telecom operators.', src:'TRAI, Telecom Commercial Communications Customer Preference Regulations, 2018'},
    {co:'Gmail & Yahoo bulk-sender rules', tier:'confirmed', text:'Since February 2024, bulk email senders must authenticate (SPF/DKIM/DMARC), support one-click unsubscribe, and keep spam complaint rates low (below 0.3%).', src:'Google “Email sender guidelines”; Yahoo Sender Hub (2024)'}],
  sources:['Apple APNs and Firebase Cloud Messaging documentation', 'TRAI TCCCPR 2018 (DLT)', 'Google Email sender guidelines (2024); RFC 8058 (one-click unsubscribe)', 'Xu, System Design Interview, ch. 10 “Design a Notification System”', 'Nygard, Release It! (circuit breakers)']
});

/* ======================= 7. TYPEAHEAD ======================= */
SDA.register({kind:'case', id:'typeahead', tier:'starter', icon:'⌨️', title:'Typeahead / search autocomplete', tagline:'Suggestions on every keystroke in under 100 ms, freshened in minutes.', tags:['trie', 'top-k', 'CDN', 'debounce', 'streaming counts'],
  modules:['search', 'caching', 'async', 'traffic'],
  summary:'Suggest the top completions as the user types, for a shopping or search app with tens of millions of users: fast enough to feel instant, cheap enough to run on every keystroke, and fresh enough to catch trending queries.',
  accuracy:'A simplified reference design; product policies cited in Sources. Numbers are illustrative.',
  overview:{what:'Typing “sam” shows “samsung galaxy s25”, “samosa”, “sambar powder”, ranked by popularity (optionally personalised and localised).', in:['Top-10 prefix suggestions by popularity', 'Freshness for trending terms', 'Filtering of offensive/unsafe suggestions', 'Locale/language support'], out:['Full search results ranking', 'Spell correction model training (we mention hooks)']},
  challenges:['A request on (almost) every keystroke, so QPS is several times the search QPS', 'Latency budget < 100 ms including network on mobile', 'Precomputing top-k for millions of prefixes', 'Freshness vs stability; abuse (manipulating suggestions)'],
  fr:['Given a prefix, return up to 10 suggestions', 'Update popularity from search logs', 'Remove blocked suggestions quickly'],
  nfr:['p99 server time < 20 ms; perceived < 100 ms', 'High availability (degrade to no suggestions, never break search)', 'Freshness: trending terms within minutes'],
  scale:[
    {k:'Requests', v:'≈ 23K/s avg, ~100K/s peak', math:'50M DAU × 10 searches × 4 requests (after debounce) ÷ 86,400', tag:'illustrative'},
    {k:'Distinct queries', v:'≈ 100M', math:'long tail of search strings', tag:'illustrative'},
    {k:'Trie size', v:'≈ 20–40 GB', math:'~1B prefix nodes incl. top-10 lists (illustrative)', tag:'illustrative'},
    {k:'Log volume', v:'≈ 500M searches/day', math:'50M × 10', tag:'illustrative'}],
  arch:{w:880, h:340, nodes:[
    {id:'c', type:'client', label:'Mobile app', sub:'every keystroke', x:66, y:170, w:110},
    {id:'cdn', type:'cdn', label:'CDN', sub:'caches prefixes', x:200, y:170, w:110, stage:2},
    {id:'lb', type:'lb', label:'Load balancer', x:335, y:170, w:120, stage:1},
    {id:'sug', type:'service', label:'Suggest service', sub:'SQL LIKE prefix%', x:490, y:170, w:140},
    {id:'db', type:'db', label:'Queries table', sub:'query, count', x:700, y:280, w:130, gone:3},
    {id:'snap', type:'db', label:'Trie snapshots', sub:'object storage', x:700, y:170, w:130, stage:3},
    {id:'logs', type:'queue', label:'Search logs', sub:'Kafka', x:490, y:295, w:130, stage:3},
    {id:'bld', type:'service', label:'Trie builder', sub:'hourly batch', x:700, y:290, w:120, stage:3},
    {id:'hot', type:'cache', label:'Trending layer', sub:'Redis', x:490, y:55, w:130, stage:4},
    {id:'str', type:'service', label:'Stream counter', sub:'5-min windows', x:700, y:55, w:130, stage:4}],
   edges:[{from:'c', to:'sug', gone:1}, {from:'c', to:'lb', stage:1, gone:2}, {from:'c', to:'cdn', stage:2}, {from:'cdn', to:'lb', stage:2}, {from:'lb', to:'sug', stage:1}, {from:'sug', to:'db', gone:3}, {from:'sug', to:'snap', stage:3}, {from:'sug', to:'logs', stage:3}, {from:'logs', to:'bld', stage:3}, {from:'bld', to:'snap', stage:3}, {from:'logs', to:'str', stage:4}, {from:'str', to:'hot', stage:4}, {from:'sug', to:'hot', stage:4}]},
  evolution:[
    {title:'SQL LIKE on a queries table', scale:'10K users', fix:'<p><code>SELECT query FROM queries WHERE query LIKE \'sam%\' ORDER BY count DESC LIMIT 10</code> on an indexed table. Fine for a prototype.</p>', after:{lat:300, err:.1, load:40}},
    {title:'Too slow per keystroke', scale:'1M users', hot:['sug', 'db'], breaks:'<p>Short prefixes (“s”, “sa”) match millions of rows; sorting them per keystroke takes seconds and the DB melts at a few thousand requests/s.</p>', fix:'<p>Load an in-memory <b>trie</b> where each node stores its precomputed <b>top-10 completions</b>. A lookup walks at most the prefix length: microseconds, no DB on the hot path. Scale out behind a load balancer.</p>', sub:{sug:'trie + top-k'}, before:{lat:2500, err:3, load:160}, after:{lat:12, err:.02, load:40}, flow:[['lb', 'sug', 'prefix']], lesson:['tries-autocomplete']},
    {title:'Every keystroke hits the servers', scale:'20M users', hot:['lb', 'sug'], breaks:'<p>Fast typists send 8 requests per word; peak traffic is 5× search traffic, and most requests are for the same popular short prefixes.</p>', fix:'<p><b>Client debounce</b> (~100–150 ms) and a local cache; <b>CDN caching</b> of responses for short prefixes (they’re identical for everyone in a locale) with a TTL of minutes. Most requests never reach origin.</p>', sub:{c:'debounced'}, before:{lat:180, err:1, load:140}, after:{lat:25, err:.02, load:35}, flow:[['c', 'cdn', 'edge hit']], lesson:['cdn']},
    {title:'Trie outgrows one machine; rebuilds hurt', scale:'100M queries', hot:['sug'], breaks:'<p>The trie no longer fits comfortably in RAM, and rebuilding it in place from the DB pauses servers and slows lookups.</p>', fix:'<p>Build tries <b>offline</b> from search logs (hourly batch), write immutable <b>snapshots</b> to object storage, and have servers load and atomically swap them. <b>Shard</b> by prefix range (e.g. a–f, g–m…) with replicas per shard.</p>', sub:{sug:'8 shards × 3 replicas'}, before:{lat:400, err:1.5, load:120}, after:{lat:12, err:.02, load:40}, flow:[['sug', 'logs', 'log query'], ['logs', 'bld'], ['bld', 'snap', 'snapshot v312'], ['snap', 'sug', 'load']], lesson:['batch-vs-stream']},
    {title:'Trending terms appear a day late', scale:'Live events', breaks:'<p>A new phone launches or a cricket final starts; users search for it, but suggestions only update after the hourly/daily rebuild.</p>', fix:'<p>A <b>stream counter</b> computes popularity over short windows (e.g. 5 minutes) with decay and writes trending prefixes to a small <b>Redis trending layer</b>; the service merges trending results with the snapshot’s top-k. Blocked terms are filtered at merge time.</p>', before:{lat:12, err:.02, load:40}, after:{lat:14, err:.02, load:42}, flow:[['logs', 'str'], ['str', 'hot', 'trending'], ['sug', 'hot', 'merge']], lesson:['lambda-kappa', 'hll-cms']}],
  flows:[
    {name:'User types “sam”', steps:[
      {note:'After a 120 ms pause in typing, the app requests <code>/suggest?q=sam&loc=hi-IN</code>. The CDN has it cached (short prefixes are popular).', flow:[['c', 'cdn', 'q=sam']]},
      {note:'For a longer, rarer prefix the CDN misses and forwards to a suggest shard owning “s…”.', flow:[['cdn', 'lb'], ['lb', 'sug', 'q=samsung ga']]},
      {note:'The shard walks the trie to the prefix node and reads its precomputed top-10, then merges trending items from Redis and filters blocked terms.', flow:[['sug', 'hot', 'trending?']]},
      {note:'The response returns (≈10 ms server time); the search, when submitted, is logged for the next rebuild and the stream counter.', flow:[['sug', 'lb'], ['lb', 'cdn'], ['cdn', 'c', 'suggestions'], ['sug', 'logs', 'log']]}]}],
  breakIt:[
    {label:'One shard replica down', kill:['sug'], verdict:'survives', text:'Other replicas of the shard serve its prefixes; the load balancer removes the dead one.'},
    {label:'Trie builder fails', kill:['bld'], verdict:'degrades', text:'Servers keep the last good snapshot (suggestions get stale but work); the trending layer still adds fresh terms.'},
    {label:'CDN outage', kill:['cdn'], verdict:'degrades', text:'All keystroke traffic hits origin (several× load). Autoscale and, if needed, increase client debounce or disable suggestions for very short prefixes.'},
    {label:'Stream counter down', kill:['str'], verdict:'survives', text:'Trending updates pause; snapshot suggestions continue. Freshness drops to the batch interval.'}],
  dataModel:{lang:'text', title:'trie node and logs', code:`TrieNode {
  children: Map<char, TrieNode>
  topK:     [ { query: "samsung galaxy s25", score: 98123 }, … up to 10 ]   // precomputed
}
Snapshot file: serialized trie per shard (e.g. FST or sorted array of prefix → topK), versioned v312

search_logs (Kafka topic): { ts, query_normalized, locale, user_hash, result_clicked }
blocked_terms (DB):        term, reason, added_by, added_at`, notes:'Compact representations (finite-state transducers, sorted arrays with binary search) are much smaller than naive pointer-based tries.'},
  apis:[
    {m:'GET', path:'/v1/suggest?q=sam&loc=hi-IN&limit=10', res:'200 OK\nCache-Control: public, max-age=300\n{ "q": "sam", "suggestions": ["samsung galaxy s25", "samosa", "sambar powder"] }'},
    {m:'POST', path:'/admin/v1/blocked-terms', req:'{ "term": "…", "reason": "policy" }', res:'201 Created (propagates to all shards within a minute)'}],
  algorithm:{title:'Tries with precomputed top-k', html:'<p>Without precomputation, finding the top 10 under “s” means visiting a huge subtree. Storing the top-k at each node turns every lookup into a walk of length |prefix|. Compare both in the playground:</p>', pg:'trie'},
  tradeoffs:[['Precomputed top-k per node', 'Microsecond lookups', 'More memory; updates require recomputing ancestors (done offline)'], ['Offline builds + snapshot swap', 'Stable, fast serving; easy rollback', 'Staleness between builds'], ['Streaming trending layer', 'Fresh within minutes', 'Extra system; risk of manipulation, so add thresholds and filters'], ['CDN caching of prefixes', 'Absorbs most traffic', 'Personalisation is harder (keep personal results client-side or separate)']],
  alternatives:[['Search engine completion suggester (e.g. Elasticsearch)', 'Good for moderate scale with less custom code'], ['Database prefix index', 'OK for small datasets; too slow for short prefixes at scale'], ['Pure client-side suggestions', 'Only for small, static vocabularies']],
  failures:[['Shard loss', 'Replicas; degrade to no suggestions for that range'], ['Bad snapshot (corrupt or offensive)', 'Validate before swap; keep previous version; instant rollback'], ['Abuse (bots promoting terms)', 'Count unique users, not raw searches; rate-limit; blocklists'], ['CDN down', 'Origin autoscaling; higher debounce']],
  lab:{stack:['Node.js or Go', 'Redis', 'Kafka or Redis Streams', 'Nginx (as a cache)', 'Docker Compose'], milestones:[
    {day:'Day 1', items:['Build a trie with top-10 per node from a CSV of (query, count)', 'GET /suggest with < 1 ms lookups', 'Client with 120 ms debounce', 'Unit tests for ranking and ties']},
    {day:'Day 2', items:['Log searches to a stream', 'Hourly batch rebuild → snapshot file → hot swap', 'Shard by first letter across 2 processes', 'Nginx cache for short prefixes']},
    {day:'Day 3', items:['5-minute windowed counts → trending layer', 'Merge trending + snapshot results', 'Blocked-terms filter', 'Load test 10K req/s; measure p99 and cache hit ratio']}],
   pseudocode:{lang:'ts', code:`function suggest(prefix: string, k = 10): string[] {
  const node = trie.walk(normalize(prefix));            // O(|prefix|)
  const base = node ? node.topK : [];
  const trending = trendingLayer.get(prefix) ?? [];     // small Redis sorted set
  return mergeByScore(base, trending)
    .filter(s => !blocked.has(s.query))
    .slice(0, k)
    .map(s => s.query);
}`},
   loadTest:'<p>Replay a day of anonymised search logs as keystroke sequences with realistic typing speed (debounced). Measure origin QPS with and without the CDN cache, p99 server latency, and how long a newly trending query takes to appear.</p>'},
  twists:[
    {q:'How do you personalise suggestions without killing caching?', a:'Serve the global (cacheable) list from the edge, and blend a small personal list (recent searches, kept on the device or fetched once per session) on the client. Alternatively cache per segment (locale, city) rather than per user.'},
    {q:'How fast can you remove an offensive suggestion?', a:'Filter at serve time against a blocked-terms set that’s pushed to all shards (seconds to a minute), purge CDN entries for the affected prefixes, then remove it from the next snapshot.'},
    {q:'Support Hindi and Hinglish (“samosa” / “समोसा”)?', a:'Normalise per script (Unicode normalisation, case folding), build tries per locale, and add transliteration so Latin prefixes can match Devanagari entries; rank with locale-specific popularity.'}],
  real:[
    {co:'Google autocomplete policies', tier:'confirmed', text:'Google explains that autocomplete predictions reflect real searches and that it removes predictions that violate its policies (e.g. violent, sexually explicit or hateful predictions).', src:'Google Search Help / The Keyword, “How Google autocomplete works in Search”'},
    {co:'Elasticsearch completion suggester', tier:'confirmed', text:'Elasticsearch provides a completion suggester backed by in-memory finite-state transducers for fast prefix lookups.', src:'Elasticsearch documentation — Completion suggester'},
    {co:'Shopping-app typeahead', tier:'educational', text:'Category and brand suggestions with locale-specific popularity, edge-cached for short prefixes, are a common pattern; specific companies’ internals are not public.', src:'Simplified educational design'}],
  sources:['Xu, System Design Interview, ch. 13 “Design a Search Autocomplete System”', 'Elasticsearch completion suggester documentation', 'Google, “How Google autocomplete works in Search”', 'Kleppmann, DDIA, ch. 10–11 (batch and stream processing)']
});

/* ======================= 8. WEB CRAWLER ======================= */
SDA.register({kind:'case', id:'web-crawler', tier:'starter', icon:'🕷️', title:'Web crawler', tagline:'Fetch a billion pages a month, politely, without duplicates or traps.', tags:['frontier', 'politeness', 'robots.txt', 'Bloom filter', 'SimHash', 'recrawl'],
  modules:['async', 'search', 'distributed', 'reliability'],
  summary:'Continuously discover and download web pages for a search index: a distributed URL frontier, polite per-host fetching, deduplication of URLs and content, defence against crawler traps, and prioritised recrawling.',
  accuracy:'Based on published crawler designs (Mercator, the original Google paper) and standards (robots.txt RFC 9309). Numbers are illustrative.',
  overview:{what:'Start from seed URLs, fetch pages, extract links, add new URLs to the frontier, store content for indexing, and keep important pages fresh.', in:['URL frontier with priorities', 'Politeness (robots.txt, per-host rate limits)', 'URL and content deduplication', 'Recrawl scheduling'], out:['Indexing and ranking (separate system)', 'JavaScript rendering at scale (mentioned as an extension)']},
  challenges:['Billions of URLs: the frontier itself is a big-data problem', 'Politeness: never overload a website, and respect robots.txt', 'Duplicates (same content at many URLs) and traps (infinite calendars, session IDs)', 'DNS and network latency dominate fetch time', 'Deciding what to recrawl and when'],
  fr:['Crawl from seeds following links', 'Respect robots.txt and crawl delays', 'Store fetched content and metadata', 'Recrawl pages based on importance and change rate'],
  nfr:['Throughput ≈ 1B pages/month', 'Polite: ≤ 1 request/s per host by default', 'Robust to malformed pages and hostile servers', 'Horizontally scalable; failures lose no URLs'],
  scale:[
    {k:'Fetch rate', v:'≈ 400 pages/s avg', math:'1B ÷ (30 × 86,400) ≈ 386/s; plan ~2× peak', tag:'illustrative'},
    {k:'Raw content', v:'≈ 100 TB/month', math:'1B × ~100 KB (compress ~5×)', tag:'illustrative'},
    {k:'Frontier', v:'≈ 1 TB', math:'10B known URLs × ~100 B', tag:'illustrative'},
    {k:'Concurrent connections', v:'≈ 1,000+', math:'400 pages/s × ~2–3 s per fetch (Little’s law)', tag:'illustrative'},
    {k:'URL-seen Bloom filter', v:'≈ 12 GB', math:'10B URLs × 9.6 bits for 1% false positives', tag:'illustrative'}],
  arch:{w:880, h:340, nodes:[
    {id:'seed', type:'ext', label:'Seeds / sitemaps', x:75, y:170, w:120},
    {id:'fr', type:'queue', label:'URL frontier', sub:'in-memory BFS', x:250, y:170, w:130},
    {id:'f', type:'service', label:'Fetchers', sub:'1 process', x:450, y:170, w:120},
    {id:'web', type:'ext', label:'The web', x:650, y:60, w:110},
    {id:'store', type:'db', label:'Page store', sub:'object storage', x:650, y:170, w:130},
    {id:'dns', type:'cache', label:'DNS + robots cache', sub:'per host', x:450, y:55, w:160, stage:2},
    {id:'parse', type:'service', label:'Parser / link extractor', x:650, y:290, w:170, stage:1},
    {id:'dd', type:'cache', label:'URL-seen Bloom + SimHash', x:450, y:295, w:180, stage:3},
    {id:'prio', type:'service', label:'Prioritiser / recrawl', x:250, y:295, w:160, stage:4}],
   edges:[{from:'seed', to:'fr'}, {from:'fr', to:'f'}, {from:'f', to:'web'}, {from:'f', to:'store'}, {from:'f', to:'dns', stage:2}, {from:'store', to:'parse', stage:1}, {from:'parse', to:'fr', stage:1, gone:3}, {from:'parse', to:'dd', stage:3}, {from:'dd', to:'fr', stage:3, gone:4}, {from:'dd', to:'prio', stage:4}, {from:'prio', to:'fr', stage:4}]},
  evolution:[
    {title:'One script, in-memory BFS', scale:'10K pages/day', fix:'<p>A single process pops URLs from an in-memory queue, fetches them, saves the HTML, extracts links and appends new ones. It works as a demo.</p>', after:{lat:900, err:2, load:30}},
    {title:'One machine is far too slow', scale:'Target 1B pages/month', hot:['f', 'fr'], breaks:'<p>At ~10 pages/s, a billion pages takes three years; a crash loses the in-memory queue.</p>', fix:'<p>A <b>persistent, partitioned frontier</b> (e.g. Kafka/Redis queues or a DB) shared by <b>many fetcher</b> processes using async I/O (hundreds of connections each). Parsing runs separately, reading stored pages, so slow parsing never stalls fetching.</p>', sub:{f:'×100 async workers', fr:'persistent'}, before:{lat:900, err:2, load:400}, after:{lat:800, err:2, load:55}, flow:[['fr', 'f'], ['f', 'store'], ['store', 'parse'], ['parse', 'fr', 'new URLs']], lesson:['queues-pubsub-streams', 'backpressure']},
    {title:'Websites block us', scale:'1,000 fetches/s', hot:['f'], down:['web'], breaks:'<p>Hundreds of concurrent requests hit the same small site, which slows down, returns 429/503 and blocks our IPs. DNS lookups also take 50–200 ms each.</p>', fix:'<p><b>Politeness</b>: route URLs to per-host queues, allow one connection per host with a delay (honour robots.txt <code>Crawl-delay</code> and back off on 429/503), cache <b>robots.txt</b> per host, and cache <b>DNS</b> results locally.</p>', before:{lat:2500, err:18, load:60}, after:{lat:600, err:1.5, load:55}, flow:[['f', 'dns', 'robots/DNS'], ['f', 'web', 'polite GET']], lesson:['rate-limiting']},
    {title:'Duplicates and crawler traps', scale:'10B known URLs', hot:['fr'], breaks:'<p>The same page appears under many URLs (tracking parameters, mirrors); infinite calendars and session-ID links generate endless new URLs. Half the fetches are wasted.</p>', fix:'<p><b>URL normalisation</b> (lowercase host, sort/strip parameters), a <b>Bloom filter</b> URL-seen test before enqueueing, <b>SimHash</b> fingerprints to detect near-duplicate content, and trap guards (max depth per site, URL length limits, per-host page budgets).</p>', before:{lat:600, err:1.5, load:160}, after:{lat:600, err:1.2, load:55}, flow:[['parse', 'dd', 'seen?'], ['dd', 'fr', 'new only']], lesson:['bloom-filters']},
    {title:'Important pages are stale', scale:'Freshness matters', breaks:'<p>The frontier is FIFO, so a major news homepage is recrawled as rarely as an abandoned blog; the index misses breaking news for days.</p>', fix:'<p>A <b>prioritised frontier</b>: score URLs by importance (link-based authority, traffic), observed change rate and freshness needs; a <b>recrawl scheduler</b> revisits frequently changing important pages often (minutes) and static pages rarely (weeks). Use sitemaps and HTTP conditional requests (ETag/If-Modified-Since) to save bandwidth.</p>', before:{lat:600, err:1.2, load:55}, after:{lat:550, err:1.1, load:50}, flow:[['dd', 'prio'], ['prio', 'fr', 'priority']], lesson:['bm25-ranking']}],
  flows:[
    {name:'Crawl one URL', steps:[
      {note:'A fetcher leases the next URL from its host-partitioned frontier queue, once the host’s politeness delay has passed.', flow:[['fr', 'f', 'lease url']]},
      {note:'It checks the cached robots.txt for the host and resolves DNS from the local cache.', flow:[['f', 'dns', 'allowed? ip?']]},
      {note:'It fetches with a timeout, a conditional request (If-Modified-Since) and a size limit, then stores the raw page.', flow:[['f', 'web', 'GET'], ['web', 'f', '200'], ['f', 'store', 'save']]},
      {note:'The parser extracts links, normalises them, drops already-seen URLs and near-duplicate content, and the prioritiser enqueues the rest with scores.', flow:[['store', 'parse'], ['parse', 'dd', 'filter'], ['dd', 'prio'], ['prio', 'fr', 'enqueue']]}]}],
  breakIt:[
    {label:'A fetcher crashes', kill:['f'], verdict:'survives', text:'Its leased URLs time out and return to the frontier; other fetchers continue. At-least-once fetching is fine because storage is idempotent by URL+fetch time.'},
    {label:'A target site goes slow', hot:['web'], verdict:'survives', text:'Per-host queues isolate it: timeouts and exponential backoff apply only to that host while thousands of others keep flowing.'},
    {label:'Frontier partition lost', kill:['fr'], verdict:'degrades', text:'Hosts in that partition pause until it’s restored from replicas; with a replicated queue/DB nothing is lost, otherwise rediscover from stored pages and sitemaps.'},
    {label:'DNS resolver down', kill:['dns'], verdict:'degrades', text:'Cached answers keep most hosts crawling; new hosts wait. Run local caching resolvers with multiple upstreams.'}],
  dataModel:{lang:'sql', title:'URL and fetch metadata', code:`CREATE TABLE urls (
  url_hash      BYTEA PRIMARY KEY,           -- hash of normalised URL
  url           TEXT NOT NULL,
  host          TEXT NOT NULL,
  priority      REAL NOT NULL,
  next_fetch_at TIMESTAMPTZ NOT NULL,
  last_status   SMALLINT, etag TEXT, last_modified TIMESTAMPTZ,
  content_simhash BIGINT, change_rate REAL
);
CREATE INDEX urls_due ON urls (host, next_fetch_at);

-- hosts(host, robots_txt, robots_fetched_at, crawl_delay_ms, ip, ip_ttl, next_allowed_at)
-- page store: object key = sha256(url) / fetch_ts → compressed HTML + headers (WARC format)`},
  apis:[
    {m:'INT', path:'frontier.lease(partition, n) → [url…]', note:'Leases expire if not acknowledged, so a crashed fetcher’s URLs return automatically.'},
    {m:'INT', path:'frontier.enqueue([{url, priority, notBefore}])', note:'Deduplicates by normalised URL hash.'},
    {m:'HTTP', path:'GET page (outbound)', res:'GET /news HTTP/1.1\nHost: example.in\nUser-Agent: ExampleBot/1.0 (+https://example.com/bot)\nIf-Modified-Since: Thu, 13 Nov 2026 08:00:00 GMT'}],
  algorithm:{title:'Politeness + dedup', html:'<p>The Mercator design splits the frontier into <b>front queues</b> (by priority) and <b>back queues</b> (one per host, with a heap of “next allowed time”), so priority and politeness are enforced together. URL dedup uses a Bloom filter (no false negatives; a small false-positive rate means a few new URLs are skipped). Build one:</p>', lab:'bloom-filter'},
  tradeoffs:[['Per-host back queues', 'Strict politeness, isolates slow sites', 'Complex scheduling; many small queues'], ['Bloom filter URL-seen test', 'Tiny memory for billions of URLs', 'False positives skip a few new URLs'], ['SimHash near-duplicate detection', 'Saves storage and index pollution', 'Tuning thresholds; false matches on templated pages'], ['Separate fetch and parse stages', 'Each scales independently; parsing bugs don’t stop fetching', 'Extra storage hop']],
  alternatives:[['Use Common Crawl data', 'Great for research or bootstrapping; not fresh or targeted enough for a live index'], ['Headless browsers for every page', 'Needed for JS-heavy sites but 10–100× more expensive; use selectively'], ['A single priority queue', 'Simpler but can’t enforce per-host politeness']],
  failures:[['Fetcher crash', 'Lease timeout re-queues URLs'], ['Hostile server (tar pits, huge pages)', 'Timeouts, size limits, per-host budgets'], ['Storage outage', 'Pause fetching for affected partitions (backpressure)'], ['Robots.txt fetch error', 'Follow RFC 9309 guidance: treat as disallowed or allowed depending on the error class, then retry later']],
  lab:{stack:['Python (aiohttp) or Go', 'Redis (queues + Bloom via RedisBloom) or Postgres', 'MinIO for page storage', 'Docker Compose'], milestones:[
    {day:'Day 1', items:['Async fetcher with timeouts and size limits', 'robots.txt parsing and caching', 'Per-host delay (1 req/s)', 'Store pages in MinIO']},
    {day:'Day 2', items:['Persistent frontier with leases', 'Separate parser workers extracting links', 'URL normalisation + Bloom filter dedup', '5 fetchers in parallel']},
    {day:'Day 3', items:['SimHash near-duplicate detection', 'Priority scores + recrawl scheduling', 'Trap guards (depth, URL length, per-host budget)', 'Dashboard: pages/s, per-host errors, frontier size']}],
   pseudocode:{lang:'py', code:`async def fetch_loop(partition):
    while True:
        host, url = await frontier.next_ready(partition)          # respects next_allowed_at per host
        if not await robots.allowed(host, url, agent="ExampleBot"):
            continue
        try:
            resp = await http.get(url, timeout=10, max_bytes=5_000_000,
                                  headers=conditional_headers(url))
            await page_store.put(url, resp)                       # idempotent key: url hash + date
            await parse_queue.put(url)
            frontier.ack(url)
        except (Timeout, ServerBusy):
            frontier.backoff(host)                                # exponential per-host backoff
        finally:
            frontier.set_next_allowed(host, now() + crawl_delay(host))`},
   loadTest:'<p>Point the crawler at a local test web (thousands of generated pages with duplicates, a trap calendar and a slow host). Verify it never exceeds 1 req/s per host, skips duplicates, stays out of the trap, and that killing fetchers loses no URLs.</p>'},
  twists:[
    {q:'How do you crawl JavaScript-heavy sites?', a:'Fetch HTML first; for pages whose content needs JS (detected heuristically), queue them for a separate, much smaller pool of headless browsers with strict time and resource budgets, and cache rendered results.'},
    {q:'What if 10% of the frontier is on one huge host (e.g. a marketplace)?', a:'Politeness caps you at its allowed rate regardless; use its sitemaps, prioritise within the host, use conditional requests, and negotiate higher limits or feeds if you have a relationship.'},
    {q:'Scale from 1B to 10B pages/month: what breaks first?', a:'The frontier and dedup structures (memory/IO), DNS, and storage costs. Shard the frontier by host hash, scale Bloom filters per shard, add regional fetch clusters close to hosts, and recrawl less-important pages less often.'}],
  real:[
    {co:'Original Google crawler', tier:'confirmed', text:'Brin and Page’s 1998 paper describes a distributed crawler with a URL server feeding several crawlers, each keeping hundreds of connections open, with DNS caching as an important optimisation.', src:'Brin & Page, “The Anatomy of a Large-Scale Hypertextual Web Search Engine” (1998)'},
    {co:'Mercator', tier:'confirmed', text:'The Mercator crawler introduced a frontier design separating priority (front queues) from per-host politeness (back queues), plus URL-seen and content-seen tests.', src:'Heydon & Najork, “Mercator: A Scalable, Extensible Web Crawler”, World Wide Web journal (1999)'},
    {co:'robots.txt standard', tier:'confirmed', text:'The Robots Exclusion Protocol was standardised as RFC 9309 in 2022, including caching guidance and how crawlers should handle unreachable robots.txt files.', src:'IETF RFC 9309'},
    {co:'Near-duplicate detection at Google', tier:'confirmed', text:'Google researchers described using SimHash fingerprints to detect near-duplicate web pages at the scale of billions of documents.', src:'Manku, Jain & Das Sarma, “Detecting Near-Duplicates for Web Crawling”, WWW 2007'}],
  sources:['Brin & Page (1998)', 'Heydon & Najork, Mercator (1999)', 'IETF RFC 9309 — Robots Exclusion Protocol', 'Manku et al., WWW 2007 (SimHash)', 'Common Crawl documentation', 'Manning, Raghavan & Schütze, Introduction to Information Retrieval, ch. 20 (crawling)']
});
})();
