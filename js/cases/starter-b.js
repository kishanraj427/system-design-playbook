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
  summary:'A key-value store spreads data over many servers and stays writable when some fail, like Amazon’s Dynamo for shopping carts. It brings together partitioning, replication, quorums, conflict handling and failure detection.',
  accuracy:'This design follows the techniques in the Amazon Dynamo paper (2007) and Apache Cassandra. Today’s managed DynamoDB uses a different design, with a leader for each partition. The scale numbers are illustrative guesses.',
  overview:{what:'<b>A small example.</b> Meera adds a phone to her cart on her laptop, and a case on her phone, at almost the same time. The shopping site stores the cart under the key <code>cart:42</code>. Even if two of the servers holding it are down, both adds are kept, and the cart shows the phone and the case.', in:['Partitioning across nodes', 'Replication with tunable N, R, W', 'Conflict detection/resolution', 'Failure detection and repair'], out:['Secondary indexes and range queries', 'Multi-key transactions', 'SQL']},
  challenges:['Spread data evenly, and move as little as possible when servers join or leave', 'Keep accepting writes during server failures and network splits', 'Notice and fix conflicting writes made at the same time', 'Detect failures without one central master', 'Repair copies that have drifted apart'],
  fr:['put(key, value) with an optional context, and get(key) that returns the value (or values) and a context', 'Settings for N (copies), R (copies read) and W (copies written)', 'Add and remove servers while moving as little data as possible'],
  nfr:['Always writable (AP in CAP terms) for carts', 'Under 10 ms for 99 of 100 requests inside a region', 'Scales out to hundreds of servers', 'No loss of an acknowledged write when a server is lost'],
  scale:[{k:'Data', v:'100 TB of data → 300 TB stored', math:'3 copies of every key (N = 3): 100 TB × 3 = 300 TB', tag:'illustrative'}, {k:'Servers', v:'≈ 200', math:'300 TB ÷ 1.5 TB usable on each server = 200', tag:'illustrative'}, {k:'Throughput', v:'≈ 2M operations a second', math:'About 10,000 operations a second on each server × 200 servers = 2M', tag:'illustrative'}, {k:'Keys moved when a server joins', v:'≈ 1 in N of the data', math:'With consistent hashing, only the neighbours’ ranges move. With 200 servers that is about 1 ÷ 200 = 0.5%', tag:'illustrative'}],
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
    {title:'One node: hash map + WAL', scale:'1 node, 200 GB', fix:'<p>One server keeps a hash map in memory, backed by a write-ahead log (or an LSM-tree). It is fast and simple until the data or the traffic outgrows one machine.</p>', after:{lat:1, err:0, load:30}},
    {title:'Data outgrows one machine', scale:'50 TB', hot:['n1'], breaks:'<p>One server cannot hold 50 TB or serve 500K operations a second. Splitting by <code>hash(key) % N</code> is simple, but adding one server reshuffles almost every key.</p>', fix:'<p>Use <b>consistent hashing</b> with virtual nodes. Each server owns several ranges on a hash ring, and adding a server moves only about 1 in N keys. A <b>coordinator</b> (any server can be one) sends each request to the owner of the key.</p>', before:{lat:90, err:3, load:160}, after:{lat:3, err:.02, load:45}, flow:[['c', 'r', 'put cart:42'], ['r', 'n2', 'owner']], lesson:['consistent-hashing', 'sharding']},
    {title:'A node dies and its keys vanish', scale:'200 nodes', down:['n2'], breaks:'<p>With hundreds of cheap servers, failures happen every day. A key stored on only one failed server is unavailable, or lost if its disk died.</p>', fix:'<p><b>Replicate</b> each key on the next N = 3 different servers on the ring (its preference list). A write succeeds when <b>W = 2</b> copies confirm, and a read asks <b>R = 2</b> copies. Because R + W is more than N, every read overlaps the latest confirmed write.</p>', sub:{n1:'replica set A·B·C'}, before:{lat:5, err:25, load:60}, after:{lat:6, err:.02, load:55}, flow:[['r', 'n1', 'W'], ['n1', 'n2', 'replicate'], ['n2', 'n3', 'replicate']], lesson:['replication', 'quorums']},
    {title:'Partitions reject writes', scale:'Multi-AZ', down:['n3'], breaks:'<p>During a network split, fewer than W of a key’s home copies can be reached. A strict quorum then refuses the write, and the cart page shows “cannot add to cart”. That costs sales.</p>', fix:'<p>Use a <b>sloppy quorum with hinted handoff</b>. Write to the next healthy servers instead, with a note: “this belongs to C”. They hand the data over when C is back. Writes made at the same time can now conflict, so each value gets a <b>vector clock</b> (a version label that shows what came before what). The application merges the clashing versions, for example by taking the union of the cart items.</p>', before:{lat:6, err:8, load:55}, after:{lat:7, err:.05, load:55}, flow:[['n3', 'hint', 'hint for C']], lesson:['cap-pacelc', 'clocks']},
    {title:'Silent drift and membership chaos', scale:'Daily failures', hot:['n1', 'n4'], breaks:'<p>A hint is lost if the server holding it dies, so copies drift apart without anyone noticing. A central membership server is a single point of failure. Fixed timeouts mark slow servers as dead, and routing keeps flapping.</p>', fix:'<p>Use <b>gossip</b> (servers tell each other who is alive) with φ-accrual failure detection, so there is no master. In the background, <b>anti-entropy</b> compares <b>Merkle trees</b> (hash trees) of key ranges and syncs only the ranges that differ. <b>Read repair</b> fixes stale copies found during reads.</p>', before:{lat:9, err:.6, load:65}, after:{lat:6, err:.01, load:50}, flow:[['gos', 'n2', 'gossip'], ['rep', 'n1', 'compare roots']], lesson:['failure-detection', 'crdts-merkle']}],
  flows:[
    {name:'put(cart:42) with N=3, W=2', steps:[
      {note:'The cart service sends <code>put(cart:42, [...], context)</code> to a coordinator.', flow:[['c', 'r', 'put']]},
      {note:'The coordinator hashes the key. Its preference list is A, B and C. It writes on its own server (if it is A) and sends the write to B and C at the same time.', flow:[['r', 'n1', 'write'], ['r', 'n2', 'write'], ['r', 'n3', 'write']], parallel:true},
      {note:'After <b>W = 2</b> confirmations the coordinator replies with success. The third copy catches up in the background.', flow:[['n1', 'r', 'ack'], ['n2', 'r', 'ack'], ['r', 'c', 'OK + new vector clock']]}]},
    {name:'get(cart:42) with R=2 + read repair', steps:[
      {note:'The coordinator asks replicas for the key.', flow:[['c', 'r', 'get'], ['r', 'n1'], ['r', 'n2']], parallel:false},
      {note:'Two copies answer, and one is older (the vector clock shows it). The coordinator returns the newest version, or all the versions that were written at the same time, for the app to merge.', flow:[['n1', 'r', 'v7'], ['n2', 'r', 'v6 (stale)']]},
      {note:'<b>Read repair</b>: the coordinator writes the newest version back to the stale replica.', flow:[['r', 'n2', 'repair v7'], ['r', 'c', 'v7']]}]}],
  breakIt:[
    {label:'One replica down', kill:['n2'], verdict:'survives', text:'With N = 3 and R = W = 2, the two remaining copies still form a quorum. Reads and writes carry on, and hints and anti-entropy repair the failed server later.', flow:[['r', 'n1', 'W'], ['r', 'n3', 'W']]},
    {label:'Two replicas down', kill:['n2', 'n3'], verdict:'degrades', text:'A strict quorum is impossible. With a sloppy quorum, writes go to other healthy servers with hints, so the store stays available with weaker guarantees. Reads may miss the newest version until repair.', flow:[['r', 'n4', 'sloppy write'], ['n3', 'hint']]},
    {label:'Coordinator crash', kill:['r'], verdict:'survives', text:'Any server can be coordinator. Clients (or a load balancer) retry on another server, and a client library that knows the ring can go straight to the owner.'},
    {label:'Network partition', hot:['n1', 'n4'], kill:['n3'], verdict:'degrades', text:'Both sides keep accepting writes, so versions are written at the same time. Vector clocks detect that, and the app merges, for example with the union of cart items. A deleted item can come back, which is a known trade-off.'}],
  dataModel:{lang:'text', title:'storage per node', code:`key           → { value bytes, vector_clock, tombstone? }
cart:42       → { [ {sku: "atta-5kg", qty: 1}, {sku: "ghee-1l", qty: 2} ], {A:7, B:3}, false }

Per node: LSM-tree storage engine
  memtable (in-memory, sorted) → flushed to SSTables (immutable, sorted)
  commit log (WAL) for durability · Bloom filter per SSTable · compaction

Ring metadata (gossiped): node → [token ranges], status, heartbeat counter`, notes:'The store treats values as opaque blobs. The application decides what they mean and how to merge them. The vector clock is the context the client sends back on its next put.'},
  apis:[
    {m:'PUT', path:'/v1/kv/{key}', note:'The context is the vector clock from the last read. Leave it out for a blind write.', req:'{ "value": "base64…", "context": {"A": 7, "B": 3}, "w": 2 }', res:'{ "ok": true, "context": {"A": 8, "B": 3} }'},
    {m:'GET', path:'/v1/kv/{key}?r=2', note:'It may return several versions if writes were made at the same time.', res:'{ "values": ["base64…"], "context": {"A": 8, "B": 3} }'},
    {m:'ADMIN', path:'/admin/ring', res:'{ "nodes": [{ "id": "A", "tokens": 256, "status": "UP" }], "n": 3 }'}],
  algorithm:{title:'Quorums, rings and repair', html:'<p>With N replicas, R + W > N guarantees that read and write sets overlap. Try the quorum explorer, then run Merkle-tree anti-entropy in the code lab.</p>', pg:'cap-quorum', lab:['consistent-hashing', 'merkle-diff']},
  tradeoffs:[['AP: sloppy quorum and hinted handoff', 'Carts stay writable during failures and splits', 'Versions can conflict, the app must merge them, and deleted items may come back'], ['Consistent hashing with virtual nodes', 'Even load, and little data moves when servers change', 'More metadata, and rebalancing still costs bandwidth'], ['Replication with no leader', 'No pause for failover, and any copy can answer', 'Harder to reason about consistency, and you need repair machinery'], ['Gossip for membership', 'No single master', 'Views of the cluster agree eventually, not instantly']],
  alternatives:[['A leader for each partition (Multi-Paxos or Raft)', 'Stronger consistency, with a short pause while a new leader is chosen. DynamoDB now takes this path'], ['One relational database', 'Simpler, but writes scale poorly and failover causes pauses'], ['Redis Cluster', 'Fast, but mainly in memory with background copying, so durability is different']],
  failures:[['A server crashes', 'Quorums carry on, hinted handoff holds the writes, and you replace the server and stream its ranges to it'], ['A disk is lost', 'Rebuild it from the other copies with anti-entropy'], ['A network split', 'Both sides accept writes (AP), and vector clocks reconcile them later'], ['A hot key', 'Put a cache in front, split the key in the application, or add copies for reads']],
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
  twists:[{q:'The business now needs “read your own writes” for carts. What changes?', a:'Send a user’s reads to the same coordinator or copy they wrote to (sticky sessions). Or use R + W above N, with W as a majority. Or return the context from the write and make reads at least that new, by waiting or reading from more copies.'}, {q:'How do you handle deletes in an AP store?', a:'Write a tombstone, a delete marker with a version, instead of removing the data. Keep it long enough for every copy to see it (a grace period, such as Cassandra’s gc_grace_seconds), then purge it during compaction. Otherwise an old copy could bring the deleted value back.'}, {q:'A single key gets 100K reads a second. Now what?', a:'Cache it, in the client or in a cache tier. Add more copies for reads. Or let the application split it, for example into sharded counters. Consistent hashing cannot spread one key.'}, {q:'You add 10 servers to a cluster of 200. What happens to the data?', a:'Each new server takes over several ranges from its neighbours on the ring, so only about 10 ÷ 210 = 5% of the data moves. Stream the ranges in the background and throttle it, so live traffic is not hurt. Switch ownership of a range only after it has fully arrived.'}],
  real:[{co:'Amazon Dynamo (2007)', tier:'confirmed', text:'The Dynamo paper describes a highly available key-value store for services such as the shopping cart. It uses consistent hashing and sloppy quorums, hinted handoff, vector clocks, Merkle-tree anti-entropy and gossip.', src:'DeCandia et al., “Dynamo: Amazon’s Highly Available Key-value Store”, SOSP 2007'}, {co:'Apache Cassandra', tier:'confirmed', text:'Cassandra (from Facebook) joined Dynamo-style partitioning and replication to a Bigtable-style data model and LSM storage. It uses φ-accrual failure detection and consistency levels you can tune.', src:'Lakshman & Malik, “Cassandra: A Decentralized Structured Storage System” (2010), Cassandra documentation'}, {co:'Amazon DynamoDB', tier:'confirmed', text:'The DynamoDB paper (2022) explains that the managed service uses Multi-Paxos partitions with a leader. This is a different design from the original Dynamo, and it gives steady speed and strongly consistent reads.', src:'Elhemali et al., “Amazon DynamoDB: A Scalable, Predictably Performant, and Fully Managed NoSQL Database Service”, USENIX ATC 2022'}],
  sources:['DeCandia et al., Dynamo, SOSP 2007', 'Lakshman & Malik, Cassandra (2010)', 'Elhemali et al., DynamoDB, USENIX ATC 2022', 'Hayashibara et al., “The φ Accrual Failure Detector” (2004)', 'Kleppmann, Designing Data-Intensive Applications, ch. 5–6']
});

/* ======================= 6. NOTIFICATION SERVICE ======================= */
SDA.register({kind:'case', id:'notification-service', tier:'starter', icon:'🔔', title:'Notification service (push, SMS, email)', tagline:'OTPs in seconds, campaigns in minutes, no duplicates, no spam.', tags:['push', 'SMS', 'email', 'priority queue', 'dedupe', 'provider failover'],
  modules:['async', 'realtime', 'reliability', 'security'],
  summary:'A notification platform lets every team message users by push, SMS, email and in-app. It follows preferences, stops duplicates, sends login codes before marketing, and survives provider outages.',
  accuracy:'This is a simplified design for learning. The platform rules (APNs and FCM, TRAI DLT, bulk-sender rules) are listed in the Sources tab. The scale numbers are illustrative guesses.',
  overview:{what:'<b>A small example.</b> Priya asks to log in, and the app asks the platform to send her a login code. The platform picks SMS, fills in the registered template and sends it within seconds. At the same moment, the marketing team sends a sale offer to 20 million people. Priya’s code must not wait behind the offer, and she must not get it twice.', in:['Transactional (OTP, order updates) and marketing campaigns', 'Preferences, quiet hours, opt-outs', 'Templates and localisation', 'Retries, dedupe, provider failover, delivery tracking'], out:['Campaign design UI and segmentation engine', 'Email rendering builder']},
  challenges:['Priorities differ a lot: a login code (OTP) must arrive in seconds, while a campaign to 20M users can take an hour', 'Never send a duplicate (especially money messages and OTPs), even though queues deliver at least once', 'Outside providers are slow, rate-limited and sometimes down', 'Rules and trust: opt-outs, quiet hours, registered templates in India (DLT) and unsubscribe headers'],
  fr:['Send a notification to a user on one or more channels', 'Respect preferences, quiet hours and opt-outs', 'Schedule and bulk-send campaigns', 'Track delivery status'],
  nfr:['OTP end-to-end p99 < 10 s', 'At-least-once processing with idempotent sends (no visible duplicates)', '99.95% availability of the send API', 'Campaigns must never delay transactional messages'],
  scale:[{k:'Daily notifications', v:'≈ 500M a day', math:'50M daily users × about 10 notifications = 500M', tag:'illustrative'}, {k:'Average rate', v:'≈ 6,000 a second', math:'500M ÷ 86,400 s ≈ 5,800', tag:'illustrative'}, {k:'Campaign peak', v:'≈ 50,000 a second', math:'20M users in about 7 minutes: 20M ÷ 420 s ≈ 48,000', tag:'illustrative'}, {k:'OTP volume', v:'≈ 300 a second at peak', math:'Say 200 logins + 100 payments a second = 300. Few messages, but they matter most', tag:'illustrative'}, {k:'Delivery logs', v:'≈ 150 GB a day', math:'500M × about 300 bytes = 150 GB', tag:'illustrative'}],
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
    {title:'A slow provider slows checkout', scale:'50K orders/day', hot:['svc', 'sms'], breaks:'<p>The SMS provider takes 3 s at peak, and checkout requests hang with it. When it fails, the message is simply lost. Each team also builds its own SMS, email and push code in a different way.</p>', fix:'<p>Build a <b>notification service</b>. Producers send a request and return at once. A <b>queue</b> holds the work, and <b>channel workers</b> send with timeouts, retries with a growing wait, and a dead-letter queue (DLQ) for messages that keep failing.</p>', before:{lat:3000, err:3, load:90}, after:{lat:40, err:.1, load:30}, flow:[['svc', 'ns', 'notify'], ['ns', 'q'], ['q', 'w'], ['w', 'pr', 'send']], lesson:['queues-pubsub-streams', 'ordering-dlq']},
    {title:'Duplicates, spam and wrong language', scale:'5M users', hot:['w'], breaks:'<p>A retry after a timeout sends the same OTP twice. Users get 15 promotional pushes a day, at 2 AM, in the wrong language, and they start uninstalling.</p>', fix:'<p>Add <b>idempotency (dedupe) keys</b>, such as <code>order-881:shipped:push</code>, checked in Redis before sending. Add a store for <b>preferences and templates</b> (channels, quiet hours, language, opt-outs), and a limit on how many messages a user gets.</p>', before:{lat:45, err:1.5, load:35}, after:{lat:48, err:.05, load:35}, flow:[['ns', 'dd', 'seen?'], ['ns', 'prefs', 'prefs+template']], lesson:['idempotency-rate-limit-headers', 'delivery-semantics']},
    {title:'A marketing blast delays OTPs', scale:'20M-user campaign', hot:['q', 'w'], breaks:'<p>A Diwali campaign puts 20M messages on the queue. Login OTPs wait behind them in the same queue for minutes and expire. Users cannot log in or pay.</p>', fix:'<p>Use <b>separate priority queues and worker pools</b>. Login and money messages get their own queue, reserved workers and reserved provider capacity. Campaigns go into a bulk queue that is slowed down.</p>', before:{lat:180000, err:4, load:300}, after:{lat:900, err:.05, load:60}, flow:[['ns', 'q2', 'campaign'], ['q2', 'w2'], ['ns', 'q', 'OTP'], ['q', 'w']], lesson:['backpressure', 'bulkhead-fallback']},
    {title:'The SMS provider has an outage', scale:'Production reality', down:['pr'], breaks:'<p>The only SMS gateway is down for 40 minutes. There are no OTPs, so no logins and no payments. Retries pile up and hit the gateway hard when it returns.</p>', fix:'<p>Route through <b>several providers</b>, with a health score and <b>circuit breakers</b>. Send OTPs through a backup provider, or through another channel (push, voice, WhatsApp) where the rules allow it.</p><p>Track delivery receipts for each provider to pick the best route.</p>', before:{lat:900, err:35, load:60}, after:{lat:950, err:.3, load:60}, flow:[['w', 'pr2', 'failover']], lesson:['circuit-breaker', 'redundancy-failover']}],
  flows:[
    {name:'Send a login OTP', steps:[
      {note:'Auth service publishes <code>{user, type: OTP, idempotency_key}</code> to the notification API.', flow:[['svc', 'ns', 'notify OTP']]},
      {note:'The API checks the dedupe key and loads the user’s locale and the registered template.', flow:[['ns', 'dd', 'SETNX key'], ['ns', 'prefs', 'locale, template']], parallel:true},
      {note:'OTPs go to the <b>priority queue</b> with a short TTL (no point delivering after 5 minutes).', flow:[['ns', 'q', 'priority']]},
      {note:'A reserved worker sends through the healthiest SMS route and saves the provider’s message ID. The delivery receipt updates the status later.', flow:[['q', 'w'], ['w', 'pr', 'send']]}]},
    {name:'Diwali campaign to 20M users', steps:[
      {note:'Marketing schedules a campaign. The API expands the audience in batches and applies opt-outs and message limits.', flow:[['svc', 'ns', 'campaign'], ['ns', 'prefs', 'filter']]},
      {note:'Messages go to the <b>bulk queue</b>, throttled to respect provider limits.', flow:[['ns', 'q2', '20M jobs']]},
      {note:'Bulk workers send over about an hour. OTP traffic keeps flowing through its own queue at the same time.', flow:[['q2', 'w2'], ['w2', 'pr', 'push'], ['q', 'w', 'OTP']], parallel:true}]}],
  breakIt:[
    {label:'Primary SMS provider down', kill:['pr'], verdict:'survives', text:'The circuit breaker opens after a few errors, and OTPs switch to the backup provider within seconds.', flow:[['w', 'pr2', 'failover']]},
    {label:'Bulk workers crash', kill:['w2'], verdict:'survives', text:'Campaigns pause and the bulk queue grows. OTPs and order updates are not affected, because the queues are kept apart (bulkheads). The workers resume from the queue.'},
    {label:'Dedupe store down', kill:['dd'], verdict:'degrades', text:'Fall back to a DB idempotency table (slower) or fail closed for OTPs and fail open for low-risk updates. Duplicates are possible for some low-risk messages.'},
    {label:'Notification API down', kill:['ns'], verdict:'degrades', text:'Producers write requests to their own outbox table and retry. Nothing is lost, but delivery is delayed.'}],
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
  algorithm:{title:'Priorities and dedupe', html:'<p><b>Dedupe:</b> run <code>SET dedupe:{key} 1 NX EX 86400</code> before sending. If the key already exists, skip the send. With provider calls that are safe to repeat, this makes queues that deliver at least once safe.</p><p><b>Priorities:</b> separate queues with reserved capacity beat one priority queue under extreme load. See how much a campaign delays OTPs in a shared queue:</p>', mount:host => otpQueueCalc(host)},
  tradeoffs:[['A queue between producers and providers', 'Producers stay fast, with retries and buffering', 'Delivery is eventual, so you need tracking and DLQ handling'], ['A separate queue for each priority', 'OTPs never wait behind campaigns', 'More infrastructure, and reserved capacity sometimes sits idle'], ['Dedupe in Redis', 'Cheap and fast duplicate prevention', 'A Redis outage weakens the guarantee, so plan a fallback'], ['Several providers', 'Survive outages and route by cost and quality', 'More integration work, and a template to register with each provider (for example DLT)']],
  alternatives:[['Each team calls the providers directly', 'Logic is repeated, and there are no shared preferences or rate limits'], ['One priority queue', 'Simpler, but a huge backlog still hurts and low-priority messages can starve'], ['A managed service (SNS, Pinpoint or a third-party platform)', 'Faster to start, but less control over routing, cost and where data is stored']],
  failures:[['A provider is down', 'Circuit breaker, a backup route and another channel'], ['The queue backs up', 'Add workers when lag grows, and shed marketing first'], ['A bad template is deployed', 'Version templates and send a trial message to internal users first'], ['Device tokens go stale', 'Remove tokens that the provider reports as unregistered']],
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
  twists:[{q:'How do you guarantee an OTP is sent at least once but never twice?', a:'Exactly-once delivery is impossible from end to end, so aim for an exactly-once effect. Use a queue that delivers at least once. Check an idempotency key atomically before sending. Use provider calls that are safe to repeat, where supported. Add a short TTL so a stale OTP is never sent. Log the provider’s message ID so you can reconcile.'}, {q:'India requires registered SMS templates. How does that affect the design?', a:'Under TRAI’s DLT rules, commercial SMS headers and templates must be registered, and messages that do not match are blocked. The template store must keep the DLT template ID for each message type and provider. A template change needs a registration step before it can be used.'}, {q:'Traffic grows 10 times. What scales first?', a:'Workers and queues scale out easily. The limits are the providers’ throughput (rate limits and cost) and preference lookups. Cache preferences, batch provider calls (FCM multicast, email batch APIs), ask for higher limits, and split queues by user.'}, {q:'A user says “stop sending me promotions” but still wants OTPs. How do you model that?', a:'Keep preferences for each category (transactional, promotional, security) and each channel, not one on and off switch. Transactional and security messages are allowed by law and by design. Promotional ones check the opt-out before every send, and every email carries a one-click unsubscribe link.'}],
  real:[
    {co:'APNs and FCM', tier:'confirmed', text:'Apple and Google push services accept up to 4 KB payloads, support expiry/TTL and collapse identifiers, and report invalid tokens that should be removed.', src:'Apple APNs documentation, Firebase Cloud Messaging documentation'},
    {co:'TRAI DLT (India)', tier:'confirmed', text:'India’s Telecom Commercial Communications Customer Preference Regulations (2018) require registration of senders, headers, consent and message templates on Distributed Ledger Technology platforms run by telecom operators.', src:'TRAI, Telecom Commercial Communications Customer Preference Regulations, 2018'},
    {co:'Gmail & Yahoo bulk-sender rules', tier:'confirmed', text:'Since February 2024, bulk email senders must authenticate (SPF/DKIM/DMARC), support one-click unsubscribe, and keep spam complaint rates low (below 0.3%).', src:'Google “Email sender guidelines”, Yahoo Sender Hub (2024)'}],
  sources:['Apple APNs and Firebase Cloud Messaging documentation', 'TRAI TCCCPR 2018 (DLT)', 'Google Email sender guidelines (2024), RFC 8058 (one-click unsubscribe)', 'Xu, System Design Interview, ch. 10 “Design a Notification System”', 'Nygard, Release It! (circuit breakers)']
});

/* ======================= 7. TYPEAHEAD ======================= */
SDA.register({kind:'case', id:'typeahead', tier:'starter', icon:'⌨️', title:'Typeahead / search autocomplete', tagline:'Suggestions on every keystroke in under 100 ms, freshened in minutes.', tags:['trie', 'top-k', 'CDN', 'debounce', 'streaming counts'],
  modules:['search', 'caching', 'async', 'traffic'],
  summary:'Typeahead suggests the best completions as the user types, for an app with tens of millions of users. It must feel instant, be cheap enough to run on every keystroke, and catch trending searches.',
  accuracy:'This is a simplified design for learning. The product policies are listed in the Sources tab. The scale numbers are illustrative guesses.',
  overview:{what:'<b>A small example.</b> Tara types <code>sam</code> into a shopping app. Before she finishes, a list shows “samsung galaxy s25”, “samosa” and “sambar powder”, with the most popular first. Each extra letter updates the list in well under 100 ms. When a new phone launches, it appears in the list within minutes.', in:['Top-10 prefix suggestions by popularity', 'Freshness for trending terms', 'Filtering of offensive/unsafe suggestions', 'Locale/language support'], out:['Full search results ranking', 'Spell correction model training (we mention hooks)']},
  challenges:['There is a request on almost every keystroke, so the load is several times the search load', 'The whole answer must arrive in under 100 ms, including the mobile network', 'The top results must be worked out ahead of time for millions of prefixes', 'Results must stay fresh but not jump around, and people try to game the suggestions'],
  fr:['Given a prefix, return up to 10 suggestions', 'Update popularity from search logs', 'Remove blocked suggestions quickly'],
  nfr:['99 of 100 requests take under 20 ms on the server, and under 100 ms as the user sees it', 'Highly available. If it fails, show no suggestions and never break search', 'Trending terms show up within minutes'],
  scale:[{k:'Requests', v:'≈ 23K a second on average, ≈ 100K at peak', math:'50M daily users × 10 searches × 4 requests (after debounce) = 2B a day. 2B ÷ 86,400 s ≈ 23,000', tag:'illustrative'}, {k:'Distinct queries', v:'≈ 100M', math:'The long tail of search strings. Say 100M different queries a month', tag:'illustrative'}, {k:'Trie size', v:'≈ 20 to 40 GB', math:'About 1B prefix nodes, with their top-10 lists, × about 30 bytes = 30 GB', tag:'illustrative'}, {k:'Log volume', v:'≈ 500M searches a day', math:'50M daily users × 10 searches = 500M', tag:'illustrative'}],
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
    {title:'SQL LIKE on a queries table', scale:'10K users', fix:'<p>Run <code>SELECT query FROM queries WHERE query LIKE \'sam%\' ORDER BY count DESC LIMIT 10</code> on an indexed table. This is fine for a prototype.</p>', after:{lat:300, err:.1, load:40}},
    {title:'Too slow per keystroke', scale:'1M users', hot:['sug', 'db'], breaks:'<p>Short prefixes such as “s” and “sa” match millions of rows. Sorting them on every keystroke takes seconds, and the database melts at a few thousand requests a second.</p>', fix:'<p>Load an in-memory <b>trie</b> (a tree where each step is one letter). Each node stores its ready-made <b>top 10 completions</b>. A lookup walks at most as many steps as the prefix has letters, which takes microseconds, with no database on the hot path. Scale out behind a load balancer.</p>', sub:{sug:'trie + top-k'}, before:{lat:2500, err:3, load:160}, after:{lat:12, err:.02, load:40}, flow:[['lb', 'sug', 'prefix']], lesson:['tries-autocomplete']},
    {title:'Every keystroke hits the servers', scale:'20M users', hot:['lb', 'sug'], breaks:'<p>Fast typists send 8 requests for one word. Peak traffic is about 5 times the search traffic, and most requests ask for the same popular short prefixes.</p>', fix:'<p>Add <b>client debounce</b> (wait 100 to 150 ms after the last key) and a local cache. Add <b>CDN caching</b> for short prefixes, because they give the same answer to everyone in a locale, with a TTL of a few minutes. Most requests never reach the origin.</p>', sub:{c:'debounced'}, before:{lat:180, err:1, load:140}, after:{lat:25, err:.02, load:35}, flow:[['c', 'cdn', 'edge hit']], lesson:['cdn']},
    {title:'Trie outgrows one machine, and rebuilds hurt', scale:'100M queries', hot:['sug'], breaks:'<p>The trie no longer fits comfortably in memory. Rebuilding it in place from the database pauses servers and slows lookups.</p>', fix:'<p>Build the tries <b>offline</b> from the search logs (an hourly batch job). Write each result as a fixed <b>snapshot</b> in object storage, and let servers load it and swap it in one step.</p><p><b>Shard</b> by prefix range (for example a to f, g to m) and keep copies of each shard.</p>', sub:{sug:'8 shards × 3 replicas'}, before:{lat:400, err:1.5, load:120}, after:{lat:12, err:.02, load:40}, flow:[['sug', 'logs', 'log query'], ['logs', 'bld'], ['bld', 'snap', 'snapshot v312'], ['snap', 'sug', 'load']], lesson:['batch-vs-stream']},
    {title:'Trending terms appear a day late', scale:'Live events', breaks:'<p>A new phone launches, or a cricket final starts, and users search for it. But suggestions change only after the next hourly or daily rebuild.</p>', fix:'<p>A <b>stream counter</b> counts popularity over short windows (for example 5 minutes) with decay. It writes the trending prefixes into a small <b>Redis trending layer</b>.</p><p>The service merges trending results with the snapshot’s top 10, and removes blocked terms at merge time.</p>', before:{lat:12, err:.02, load:40}, after:{lat:14, err:.02, load:42}, flow:[['logs', 'str'], ['str', 'hot', 'trending'], ['sug', 'hot', 'merge']], lesson:['lambda-kappa', 'hll-cms']}],
  flows:[
    {name:'User types “sam”', steps:[
      {note:'After a 120 ms pause in typing, the app asks for <code>/suggest?q=sam&loc=hi-IN</code>. The CDN already has it cached, because short prefixes are popular.', flow:[['c', 'cdn', 'q=sam']]},
      {note:'For a longer, rarer prefix the CDN misses and forwards to a suggest shard owning “s…”.', flow:[['cdn', 'lb'], ['lb', 'sug', 'q=samsung ga']]},
      {note:'The shard walks the trie to the prefix node and reads its ready-made top 10. Then it merges trending items from Redis and removes blocked terms.', flow:[['sug', 'hot', 'trending?']]},
      {note:'The response returns in about 10 ms of server time. When the search is submitted, it is logged for the next rebuild and for the stream counter.', flow:[['sug', 'lb'], ['lb', 'cdn'], ['cdn', 'c', 'suggestions'], ['sug', 'logs', 'log']]}]}],
  breakIt:[
    {label:'One shard replica down', kill:['sug'], verdict:'survives', text:'The other copies of the shard serve its prefixes, and the load balancer removes the dead one.'},
    {label:'Trie builder fails', kill:['bld'], verdict:'degrades', text:'Servers keep the last good snapshot. Suggestions get stale but still work, and the trending layer still adds fresh terms.'},
    {label:'CDN outage', kill:['cdn'], verdict:'degrades', text:'All keystroke traffic hits the origin, several times the usual load. Add servers automatically and, if needed, raise the debounce or turn off suggestions for very short prefixes.'},
    {label:'Stream counter down', kill:['str'], verdict:'survives', text:'Trending updates pause and snapshot suggestions carry on. Freshness drops to the batch interval.'}],
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
  tradeoffs:[['A ready-made top 10 for each node', 'Lookups take microseconds', 'More memory, and an update means recomputing the parent nodes (done offline)'], ['Offline builds and a snapshot swap', 'Stable, fast serving and easy rollback', 'Suggestions are stale between builds'], ['A streaming trending layer', 'Fresh within minutes', 'One more system, and people can try to manipulate it, so add thresholds and filters'], ['CDN caching of prefixes', 'Absorbs most traffic', 'Personalisation is harder, so keep personal results on the device or separate']],
  alternatives:[['A search engine’s completion suggester (for example Elasticsearch)', 'Good at moderate scale, with less custom code'], ['A database prefix index', 'Fine for small data, but too slow for short prefixes at scale'], ['Suggestions only on the client', 'Only for small, fixed word lists']],
  failures:[['A shard is lost', 'Use copies, and show no suggestions for that range if all copies are gone'], ['A bad snapshot (corrupt or offensive)', 'Check it before the swap, keep the previous version, and roll back at once'], ['Abuse (bots promoting terms)', 'Count unique users, not raw searches, add rate limits and blocklists'], ['The CDN is down', 'Add origin servers automatically and raise the debounce']],
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
  twists:[{q:'How do you personalise suggestions without killing caching?', a:'Serve the global list (which can be cached) from the edge. On the client, blend in a small personal list, such as recent searches kept on the device or fetched once per session. Or cache per segment (locale or city) instead of per user.'}, {q:'How fast can you remove an offensive suggestion?', a:'Filter at serve time against a set of blocked terms that is pushed to all shards, in seconds to a minute. Purge the CDN entries for the affected prefixes. Then remove it from the next snapshot.'}, {q:'How do you support Hindi and Hinglish (“samosa” and “समोसा”)?', a:'Normalise each script (Unicode normalisation and case folding), build tries for each locale, and add transliteration so Latin prefixes can match Devanagari entries. Rank with popularity for that locale.'}, {q:'Two searches have the same popularity. How do you pick the order?', a:'Use a stable tie-break so the list does not jump around, such as recent popularity first, then the shorter string, then alphabetical. A list that reorders on every refresh feels broken, even when each order is correct.'}],
  real:[
    {co:'Google autocomplete policies', tier:'confirmed', text:'Google explains that autocomplete predictions reflect real searches and that it removes predictions that violate its policies (e.g. violent, sexually explicit or hateful predictions).', src:'Google Search Help and The Keyword, “How Google autocomplete works in Search”'},
    {co:'Elasticsearch completion suggester', tier:'confirmed', text:'Elasticsearch provides a completion suggester backed by in-memory finite-state transducers for fast prefix lookups.', src:'Elasticsearch documentation: Completion suggester'},
    {co:'Shopping-app typeahead', tier:'educational', text:'Category and brand suggestions with locale-specific popularity, edge-cached for short prefixes, are a common pattern; specific companies’ internals are not public.', src:'Simplified educational design'}],
  sources:['Xu, System Design Interview, ch. 13 “Design a Search Autocomplete System”', 'Elasticsearch completion suggester documentation', 'Google, “How Google autocomplete works in Search”', 'Kleppmann, DDIA, ch. 10–11 (batch and stream processing)']
});

/* ======================= 8. WEB CRAWLER ======================= */
SDA.register({kind:'case', id:'web-crawler', tier:'starter', icon:'🕷️', title:'Web crawler', tagline:'Fetch a billion pages a month, politely, without duplicates or traps.', tags:['frontier', 'politeness', 'robots.txt', 'Bloom filter', 'SimHash', 'recrawl'],
  modules:['async', 'search', 'distributed', 'reliability'],
  summary:'A web crawler keeps finding and downloading web pages for a search index. The design is about a huge URL queue, being polite to each site, skipping duplicates and traps, and revisiting important pages sooner.',
  accuracy:'This is a simplified design based on published crawler designs (Mercator and the original Google paper) and standards (robots.txt, RFC 9309). The scale numbers are illustrative guesses.',
  overview:{what:'<b>A small example.</b> The crawler starts with 100 well-known web addresses. It downloads each page, pulls out the links, and adds the new ones to a to-do list. It never asks the same small site for more than one page a second. A news site’s home page is visited every few minutes, and a dead blog only every few weeks.', in:['URL frontier with priorities', 'Politeness (robots.txt, per-host rate limits)', 'URL and content deduplication', 'Recrawl scheduling'], out:['Indexing and ranking (separate system)', 'JavaScript rendering at scale (mentioned as an extension)']},
  challenges:['Billions of URLs: the frontier itself is a big-data problem', 'Politeness: never overload a website, and respect robots.txt', 'Duplicates (same content at many URLs) and traps (infinite calendars, session IDs)', 'DNS and network latency dominate fetch time', 'Deciding what to recrawl and when'],
  fr:['Crawl from seeds following links', 'Respect robots.txt and crawl delays', 'Store fetched content and metadata', 'Recrawl pages based on importance and change rate'],
  nfr:['About 1B pages a month', 'Polite: at most 1 request a second to each site, by default', 'Copes with broken pages and hostile servers', 'Scales out, and a failure never loses URLs'],
  scale:[{k:'Fetch rate', v:'≈ 400 pages a second on average', math:'1B ÷ (30 days × 86,400 s) ≈ 386 a second. Plan for about 2 times that at peak', tag:'illustrative'}, {k:'Raw content', v:'≈ 100 TB a month', math:'1B pages × about 100 KB = 100 TB (compression makes it about 5 times smaller)', tag:'illustrative'}, {k:'Frontier', v:'≈ 1 TB', math:'10B known URLs × about 100 bytes = 1 TB', tag:'illustrative'}, {k:'Open connections', v:'≈ 1,000 or more', math:'400 pages a second × about 2.5 s for each fetch = 1,000 (Little’s law)', tag:'illustrative'}, {k:'URL-seen Bloom filter', v:'≈ 12 GB', math:'10B URLs × 9.6 bits each (for a 1% false-positive rate) = 96 Gbit = 12 GB', tag:'illustrative'}],
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
    {title:'One script, in-memory BFS', scale:'10K pages/day', fix:'<p>One process takes a URL from a queue in memory, fetches the page, saves the HTML, pulls out the links and adds the new ones to the queue. It works as a demo.</p>', after:{lat:900, err:2, load:30}},
    {title:'One machine is far too slow', scale:'Target 1B pages/month', hot:['f', 'fr'], breaks:'<p>At about 10 pages a second, a billion pages would take three years. A crash also loses the queue, because it only lives in memory.</p>', fix:'<p>Use a <b>saved, split frontier</b> (the to-do list of URLs, for example in Kafka, Redis queues or a database), shared by <b>many fetcher</b> processes. Each fetcher uses async I/O with hundreds of connections.</p><p>Parsing runs as a separate step on stored pages, so slow parsing never stalls fetching.</p>', sub:{f:'×100 async workers', fr:'persistent'}, before:{lat:900, err:2, load:400}, after:{lat:800, err:2, load:55}, flow:[['fr', 'f'], ['f', 'store'], ['store', 'parse'], ['parse', 'fr', 'new URLs']], lesson:['queues-pubsub-streams', 'backpressure']},
    {title:'Websites block us', scale:'1,000 fetches/s', hot:['f'], down:['web'], breaks:'<p>Hundreds of requests hit the same small site at once. It slows down, returns 429 or 503 and blocks our IP addresses. Each DNS lookup also takes 50 to 200 ms.</p>', fix:'<p>Add <b>politeness</b>. Send URLs to a queue for each host, allow one connection to a host with a delay between requests, honour the robots.txt <code>Crawl-delay</code>, and back off on 429 or 503.</p><p>Cache each host’s <b>robots.txt</b> and cache <b>DNS</b> answers locally.</p>', before:{lat:2500, err:18, load:60}, after:{lat:600, err:1.5, load:55}, flow:[['f', 'dns', 'robots/DNS'], ['f', 'web', 'polite GET']], lesson:['rate-limiting']},
    {title:'Duplicates and crawler traps', scale:'10B known URLs', hot:['fr'], breaks:'<p>The same page appears under many URLs (tracking parameters, mirrors). Infinite calendars and session-ID links make endless new URLs. Half of the fetches are wasted.</p>', fix:'<p>Clean each URL first (<b>normalisation</b>): lowercase the host and sort or remove parameters. Test it against a <b>Bloom filter</b> before adding it to the queue. Use <b>SimHash</b> fingerprints to spot near-duplicate content.</p><p>Add trap guards: a maximum depth for each site, a URL length limit and a page budget for each host.</p>', before:{lat:600, err:1.5, load:160}, after:{lat:600, err:1.2, load:55}, flow:[['parse', 'dd', 'seen?'], ['dd', 'fr', 'new only']], lesson:['bloom-filters']},
    {title:'Important pages are stale', scale:'Freshness matters', breaks:'<p>The frontier is first-in, first-out, so a big news home page is revisited as rarely as an abandoned blog. The index misses breaking news for days.</p>', fix:'<p>Use a <b>prioritised frontier</b>. Score each URL by importance (link authority and traffic), how often it changes, and how fresh it needs to be. A <b>recrawl scheduler</b> revisits important pages that change often every few minutes, and static pages every few weeks.</p><p>Use sitemaps and conditional requests (ETag and If-Modified-Since) to save bandwidth.</p>', before:{lat:600, err:1.2, load:55}, after:{lat:550, err:1.1, load:50}, flow:[['dd', 'prio'], ['prio', 'fr', 'priority']], lesson:['bm25-ranking']}],
  flows:[
    {name:'Crawl one URL', steps:[
      {note:'A fetcher takes the next URL from its host’s queue, once that host’s politeness delay has passed.', flow:[['fr', 'f', 'lease url']]},
      {note:'It checks the cached robots.txt for the host and resolves DNS from the local cache.', flow:[['f', 'dns', 'allowed? ip?']]},
      {note:'It fetches with a timeout, a conditional request (If-Modified-Since) and a size limit, then stores the raw page.', flow:[['f', 'web', 'GET'], ['web', 'f', '200'], ['f', 'store', 'save']]},
      {note:'The parser pulls out the links and cleans them. It drops URLs it has seen and near-duplicate content, and the prioritiser adds the rest to the queue with a score.', flow:[['store', 'parse'], ['parse', 'dd', 'filter'], ['dd', 'prio'], ['prio', 'fr', 'enqueue']]}]}],
  breakIt:[
    {label:'A fetcher crashes', kill:['f'], verdict:'survives', text:'Its leased URLs time out and go back to the frontier, and the other fetchers carry on. Fetching at least once is fine, because storing a page twice is harmless.'},
    {label:'A target site goes slow', hot:['web'], verdict:'survives', text:'Per-host queues isolate it: timeouts and exponential backoff apply only to that host while thousands of others keep flowing.'},
    {label:'Frontier partition lost', kill:['fr'], verdict:'degrades', text:'Hosts in that partition pause until it is restored from copies. With a replicated queue or database, nothing is lost. Otherwise, rediscover the URLs from stored pages and sitemaps.'},
    {label:'DNS resolver down', kill:['dns'], verdict:'degrades', text:'Cached answers keep most hosts crawling, and only new hosts wait. Run local caching resolvers with several upstream servers.'}],
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
  algorithm:{title:'Politeness + dedup', html:'<p>The Mercator design splits the frontier into <b>front queues</b> (by priority) and <b>back queues</b> (one for each host, with a heap of “next allowed time”). So priority and politeness are enforced together.</p><p>The URL-seen test uses a Bloom filter. It never misses a URL it has seen, and its small false-positive rate means a few new URLs are skipped. Build one:</p>', lab:'bloom-filter'},
  tradeoffs:[['A back queue for each host', 'Strict politeness, and a slow site cannot hold up the others', 'Scheduling is complex, with many small queues'], ['A Bloom filter for the URL-seen test', 'Tiny memory for billions of URLs', 'False positives skip a few new URLs'], ['SimHash near-duplicate detection', 'Saves storage and keeps the index clean', 'Thresholds need tuning, and pages from the same template can match by mistake'], ['Separate fetch and parse steps', 'Each scales alone, and parsing bugs do not stop fetching', 'One extra trip to storage']],
  alternatives:[['Use Common Crawl data', 'Great for research or a first index, but it is not fresh or targeted enough for a live index'], ['A headless browser for every page', 'Needed for sites that depend on JavaScript, but 10 to 100 times more costly, so use it selectively'], ['One single priority queue', 'Simpler, but it cannot enforce politeness for each host']],
  failures:[['A fetcher crashes', 'Lease timeout re-queues URLs'], ['Hostile server (tar pits, huge pages)', 'Timeouts, size limits, per-host budgets'], ['Storage outage', 'Pause fetching for affected partitions (backpressure)'], ['Robots.txt fetch error', 'Follow RFC 9309 guidance: treat as disallowed or allowed depending on the error class, then retry later']],
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
  twists:[{q:'How do you crawl JavaScript-heavy sites?', a:'Fetch the HTML first. For pages that need JavaScript to show their content (found by a simple check), put them in a queue for a much smaller pool of headless browsers with strict time and resource limits. Cache the rendered result.'}, {q:'What if 10% of the frontier is on one huge site, such as a marketplace?', a:'Politeness limits you to its allowed rate anyway. Use its sitemaps, rank pages inside the host, use conditional requests, and ask for higher limits or a data feed if you have a relationship.'}, {q:'You scale from 1B to 10B pages a month. What breaks first?', a:'The frontier and the duplicate checks (memory and I/O), DNS, and storage cost. Split the frontier by a hash of the host, give each shard its own Bloom filter, add fetch clusters in other regions close to the sites, and recrawl less important pages less often.'}, {q:'A site returns a different page for every request, such as a random-article page. How do you avoid a trap?', a:'Give each host a page budget and a maximum depth. Spot pages whose content hash is always new but whose text is almost the same (near-duplicates). When a host passes its budget, slow it down or stop and flag it for a person to check.'}],
  real:[
    {co:'Original Google crawler', tier:'confirmed', text:'Brin and Page’s 1998 paper describes a distributed crawler with a URL server feeding several crawlers, each keeping hundreds of connections open, with DNS caching as an important optimisation.', src:'Brin & Page, “The Anatomy of a Large-Scale Hypertextual Web Search Engine” (1998)'},
    {co:'Mercator', tier:'confirmed', text:'The Mercator crawler introduced a frontier design separating priority (front queues) from per-host politeness (back queues), plus URL-seen and content-seen tests.', src:'Heydon & Najork, “Mercator: A Scalable, Extensible Web Crawler”, World Wide Web journal (1999)'},
    {co:'robots.txt standard', tier:'confirmed', text:'The Robots Exclusion Protocol was standardised as RFC 9309 in 2022, including caching guidance and how crawlers should handle unreachable robots.txt files.', src:'IETF RFC 9309'},
    {co:'Near-duplicate detection at Google', tier:'confirmed', text:'Google researchers described using SimHash fingerprints to detect near-duplicate web pages at the scale of billions of documents.', src:'Manku, Jain & Das Sarma, “Detecting Near-Duplicates for Web Crawling”, WWW 2007'}],
  sources:['Brin & Page (1998)', 'Heydon & Najork, Mercator (1999)', 'IETF RFC 9309: Robots Exclusion Protocol', 'Manku et al., WWW 2007 (SimHash)', 'Common Crawl documentation', 'Manning, Raghavan & Schütze, Introduction to Information Retrieval, ch. 20 (crawling)']
});
})();
