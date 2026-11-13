/* =====================================================================
   PART 14 · PROJECTS — advanced (10)
   ===================================================================== */
(function(){
const SDA = window.SDA;
const P = def => SDA.register(Object.assign({kind:'project'}, def));

P({id:'p-video', level:'advanced', icon:'🎬', title:'Video streaming platform', tagline:'Upload, transcode, and stream adaptively to millions.', tags:['transcoding', 'abr', 'cdn', 'workflows'],
  req:'Build a video platform: creators upload videos, the system transcodes them into an adaptive bitrate ladder, and viewers stream them worldwide with fast start and little rebuffering.',
  fr:['Resumable uploads of large videos', 'Transcode to multiple resolutions and codecs', 'Adaptive streaming (HLS/DASH) with thumbnails', 'Watch history, view counts, recommendations'],
  nfr:['Playback start under 2 s; rebuffer ratio under 1%', 'Processing finished within minutes of upload', 'Durable originals; regenerable renditions', 'Egress cost dominated by CDN; keep origin load low'],
  est:[['Uploads', '100K videos/day, avg 10 min', ''], ['Transcode work', '≈ 1M CPU-hours/day', '100K × 10 min × ~1 core-hour per rendition-minute set'], ['Views', '200M/day; peak 2M concurrent', ''], ['Egress', '≈ 6 Tbps peak', '2M × 3 Mbps']],
  entities:{code:`CREATE TABLE videos (
  id UUID PRIMARY KEY, owner_id BIGINT, title TEXT, duration_s INT,
  status TEXT NOT NULL,             -- UPLOADING | PROCESSING | READY | FAILED
  original_key TEXT, manifest_key TEXT, visibility TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE renditions (video_id UUID, height INT, codec TEXT, bitrate_kbps INT, playlist_key TEXT, PRIMARY KEY (video_id, height, codec));
CREATE TABLE transcode_tasks (video_id UUID, segment INT, rendition TEXT, status TEXT, attempts INT DEFAULT 0, PRIMARY KEY (video_id, segment, rendition));
-- view counts: counters in a stream aggregator, flushed per minute`, notes:'Tasks per (segment, rendition) make transcoding parallel and retryable.'},
  apis:{list:[['POST /uploads', 'Start resumable upload'], ['POST /uploads/{id}/complete', 'Start processing workflow'], ['GET /videos/{id}/play', 'Signed manifest URL + resume point'], ['POST /events/playback', 'Heartbeats, quality switches']], code:`async function onUploadComplete(videoId: string) {
  const segments = await splitAtKeyframes(videoId, 4);                // 4 s GOP-aligned chunks
  const ladder = chooseLadder(await probe(videoId));                  // e.g. 240p…1080p, skip upscales
  await db.tx(tx => Promise.all(segments.flatMap(s => ladder.map(r =>
    tx.none('INSERT INTO transcode_tasks(video_id, segment, rendition, status) VALUES ($1,$2,$3,$4)', [videoId, s, r.name, 'QUEUED'])))));
  await queue.sendBatch(segments.flatMap(s => ladder.map(r => ({ videoId, segment: s, rendition: r.name }))));
}`},
  hld:{text:'Uploads land in object storage; a workflow splits videos into segments and fans out transcode tasks to a worker fleet; packaged HLS/DASH renditions go to storage and are served via CDN; playback events feed counters and recommendations.',
    diagram:{n:[['c', 'client', 'Creator', '', 0, 0], ['v', 'client', 'Viewer', '', 0, 2], ['up', 'service', 'Upload service', 'resumable', 1, 0], ['wf', 'service', 'Workflow', 'split · fan-out', 2, 0], ['q', 'queue', 'Transcode tasks', '', 3, 0], ['tx', 'service', 'Transcoders', 'GPU/CPU fleet', 4, 0], ['s3', 'db', 'Object storage', 'originals + HLS', 4, 1], ['cdn', 'cdn', 'CDN', '', 1, 2], ['api', 'service', 'Playback API', 'signed URLs', 2, 2]], e:'c>up up>wf wf>q q>tx tx>s3 v>cdn cdn>s3~-0.1 v>api~0.2 api>s3~0.3', f:[['An upload completes and the workflow fans out segment × rendition tasks.', 'c>up:upload|up>wf|wf>q:tasks|q>tx'], ['Renditions are packaged into storage.', 'tx>s3:HLS segments'], ['Viewers get a signed manifest and stream from the CDN.', 'v>api:play|v>cdn:segments|cdn>s3:miss']]}},
  components:[['Upload service', 'Resumable uploads to object storage'], ['Workflow engine', 'Split, fan-out, join, package, publish'], ['Transcoder fleet', 'Encode segments; autoscale on queue depth'], ['Playback API', 'Entitlements, signed URLs, resume points'], ['CDN', 'Segment delivery'], ['Analytics', 'Views, QoE metrics, recommendations input']],
  tech:[['FFmpeg (+ hardware encoders)', 'Industry-standard encoding'], ['HLS/DASH with CMAF', 'One packaging for most devices'], ['Temporal/Step Functions', 'Durable workflows'], ['Multi-CDN', 'Resilience and cost leverage']],
  tradeoffs:[['Segment-parallel encoding', 'Minutes instead of hours', 'Orchestration and stitching complexity'], ['Per-title ladders', 'Fewer bits for easy content', 'Extra analysis pass'], ['Popular-first advanced codecs', 'Save compute on rarely watched videos', 'Long-tail videos use more bandwidth']],
  v1:{text:'v1 transcodes each upload sequentially on one machine with FFmpeg to three renditions.', code:`async function transcode(videoId: string, src: string) {
  for (const r of [{ h: 360, b: 800 }, { h: 720, b: 2500 }, { h: 1080, b: 4500 }]) {
    await run('ffmpeg', ['-i', src, '-vf', \`scale=-2:\${r.h}\`, '-c:v', 'libx264', '-b:v', \`\${r.b}k\`, '-g', '96',
      '-hls_time', '4', '-hls_playlist_type', 'vod', \`/out/\${videoId}/\${r.h}p.m3u8\`]);
  }
  await writeMasterPlaylist(videoId); await db.none("UPDATE videos SET status='READY' WHERE id=$1", [videoId]);
}`},
  bottlenecks:['Sequential encoding makes long videos take hours', 'One machine is a single point of failure', 'Origin overloaded by CDN misses for new popular videos'],
  scaling:[['Encode time', 'Segment-level parallelism across a fleet'], ['Cost', 'Spot instances for transcoding; hardware encoders'], ['Origin load', 'Origin shield tier; pre-warm CDN for scheduled premieres'], ['Long tail', 'Multi-tier caches; only popular videos get every codec']],
  improvements:['Per-title and shot-based encoding', 'Low-latency live streaming', 'DRM for premium content', 'Thumbnail sprites for scrubbing'],
  failures:[['Transcoder crash', 'Task retried (idempotent output keys)'], ['CDN outage', 'Switch manifest URLs to another CDN'], ['Corrupt upload', 'Probe fails → FAILED with reason to creator']],
  observability:{metrics:['Time to READY p50/p95', 'Task failure rate', 'Playback start time, rebuffer ratio (client QoE)', 'CDN hit ratio, origin egress'], alerts:['Processing backlog > 30 min', 'Rebuffer ratio > 1% in a region', 'Origin egress spike'], dash:'Upload pipeline, QoE by region/ISP, CDN performance.'},
  review:['Parallel, retryable processing: ✓', 'Adaptive streaming via CDN: ✓', 'QoE measured from clients: ✓', 'Next: per-title encoding and multi-CDN steering'],
  refs:['case:youtube', 'case:netflix', 'l:transcoding-pipeline', 'l:live-streaming-abr']});
P({id:'p-mq', level:'advanced', icon:'📬', title:'Distributed message queue', tagline:'A partitioned, replicated log with consumer groups.', tags:['log', 'replication', 'partitions', 'consumer groups'],
  req:'Build a durable message queue for internal services: producers publish to topics, consumers in groups share partitions, messages are retained for replay, and broker failures lose nothing that was acknowledged.',
  fr:['Create topics with N partitions and replication factor', 'Produce with keys (per-key order)', 'Consumer groups with offsets and rebalancing', 'Retention by time/size; replay from an offset'],
  nfr:['No loss of acknowledged messages with one broker down', 'Throughput 1 GB/s per cluster', 'p99 produce latency under 20 ms (acks=all)', 'Automatic leader failover in seconds'],
  est:[['Messages', '1M/s × 1 KB = 1 GB/s', ''], ['Retention', '7 days ≈ 600 TB × 3 replicas', '1 GB/s × 604,800 s'], ['Partitions', '≈ 3,000', 'for parallelism and balance'], ['Brokers', '≈ 30', '~35 MB/s write per broker incl. replication']],
  entities:{code:`-- Cluster metadata (managed by a Raft quorum of controllers)
-- topics(name, partitions, replication_factor, retention_ms)
-- partitions(topic, partition, leader_broker, replicas[], isr[], leader_epoch)
-- consumer_offsets(group, topic, partition, offset, committed_at)   -- itself stored in an internal compacted topic
-- On disk per partition: segment files 00000000000000123456.log + .index (offset → file position)`, notes:'Messages live in append-only segment files; metadata is tiny and strongly consistent (Raft).'},
  apis:{list:[['Produce(topic, key, value, acks)', 'Returns partition + offset'], ['Fetch(topic, partition, offset, maxBytes)', 'Batch read'], ['JoinGroup / SyncGroup / Heartbeat', 'Group membership and assignment'], ['CommitOffset(group, tp, offset)', 'Progress tracking']], code:`// Leader append path (simplified)
async function append(tp: TopicPartition, batch: Record[], acks: 'all' | 1) {
  const base = log(tp).append(batch);                          // sequential write, page cache
  if (acks === 1) return { offset: base };
  await waitUntil(() => isr(tp).every(r => r.fetchedOffset > base + batch.length - 1), REPLICA_TIMEOUT_MS);
  highWatermark(tp).advanceTo(base + batch.length);           // visible to consumers only now
  return { offset: base };
}`},
  hld:{text:'Brokers host partition replicas; one replica leads each partition. Producers write to leaders, followers fetch to replicate; a controller quorum tracks leaders and in-sync replicas and fails over; consumers fetch by offset.',
    diagram:{n:[['p', 'client', 'Producers', '', 0, 1], ['b1', 'queue', 'Broker 1', 'P0 leader', 1, 0], ['b2', 'queue', 'Broker 2', 'P0 follower', 1, 2], ['ctl', 'service', 'Controllers', 'Raft', 2, 1], ['cg', 'service', 'Consumer group', '', 3, 0], ['off', 'db', 'Offsets topic', 'compacted', 3, 2]], e:'p>b1 b1>b2 ctl>b1 ctl>b2 cg>b1 cg>off', f:[['A producer appends to the partition leader; the follower replicates; then it is acknowledged.', 'p>b1:produce acks=all|b2>b1:fetch (replicate)'], ['Consumers fetch from the leader and commit offsets.', 'cg>b1:fetch @offset|cg>off:commit'], ['If broker 1 fails, the controller elects broker 2 (in sync) as leader.', 'ctl>b2:lead P0 (epoch 7)']]}},
  components:[['Brokers', 'Store segments, serve produce/fetch, replicate'], ['Controller quorum', 'Metadata, leader election, ISR tracking'], ['Group coordinator', 'Consumer membership and partition assignment'], ['Client libraries', 'Partitioning, batching, retries, idempotent producer ids']],
  tech:[['Append-only segments + page cache', 'Sequential I/O, zero-copy reads'], ['Raft for metadata', 'Consistent leadership decisions'], ['Leader-follower replication with ISR', 'Durability with tunable latency'], ['Tiered storage', 'Cheap long retention in object storage']],
  tradeoffs:[['Per-partition order', 'Horizontal scale', 'No global ordering'], ['acks=all', 'No acknowledged loss', 'Higher latency'], ['Pull-based consumers', 'Consumers control pace; easy replay', 'Polling latency vs push']],
  v1:{text:'v1: a single-node log with one file per partition and an in-memory offset index; consumers poll by offset.', code:`class PartitionLog {
  private fd = openSync(this.path, 'a+'); private index: number[] = [];   // offset → byte position
  constructor(private path: string) {}
  append(msg: Buffer): number {
    const pos = fstatSync(this.fd).size; const len = Buffer.alloc(4); len.writeUInt32BE(msg.length);
    writeSync(this.fd, Buffer.concat([len, msg])); this.index.push(pos); return this.index.length - 1;
  }
  read(offset: number, max = 100): Buffer[] {
    const out: Buffer[] = [];
    for (let o = offset; o < Math.min(this.index.length, offset + max); o++) {
      const len = Buffer.alloc(4); readSync(this.fd, len, 0, 4, this.index[o]);
      const b = Buffer.alloc(len.readUInt32BE()); readSync(this.fd, b, 0, b.length, this.index[o] + 4); out.push(b);
    }
    return out;
  }
}`},
  bottlenecks:['Single node: no fault tolerance', 'Per-message fsync limits throughput', 'One partition per topic caps consumer parallelism'],
  scaling:[['Fault tolerance', 'Replicate partitions; leader election via controllers'], ['Throughput', 'Batching, compression, rely on replication rather than fsync per message'], ['Parallelism', 'More partitions per topic; key hashing'], ['Retention cost', 'Tiered storage for old segments']],
  improvements:['Idempotent producers and transactions (exactly-once within the log)', 'Log compaction for keyed state topics', 'Rack-aware replica placement', 'Quotas per client'],
  failures:[['Leader broker dies', 'Controller elects an in-sync follower; clients refresh metadata'], ['Slow follower', 'Dropped from ISR; writes continue with remaining ISR (min.insync.replicas)'], ['Consumer crash', 'Group rebalances; partitions reassigned; resume from committed offsets']],
  observability:{metrics:['Produce/fetch latency', 'Under-replicated partitions', 'Consumer lag per group', 'Disk usage and segment counts'], alerts:['Under-replicated partitions > 0 for 5 min', 'Consumer lag growing for 15 min', 'Disk > 80%'], dash:'Cluster health, ISR status, lag by group.'},
  review:['Acknowledged writes survive a broker failure: ✓', 'Replay and consumer groups: ✓', 'Ordered per key: ✓', 'Next: exactly-once transactions and tiered storage'],
  refs:['l:kafka', 'l:consensus-raft', 'pg:kafka', 'l:replication']});
P({id:'p-social-feed', level:'advanced', icon:'📰', title:'Social media feed', tagline:'Hybrid fan-out, ranking and counters for hundreds of millions.', tags:['fan-out', 'ranking', 'sharding', 'hot keys'],
  req:'Build the home feed of a social network: posts from followed accounts (including celebrities), ranked by relevance, loading in under 300 ms for 500M daily users.',
  fr:['Post text/photos', 'Follow/unfollow', 'Home feed with pagination and ranking', 'Likes and comments counts'],
  nfr:['Feed p99 under 300 ms', 'Posts visible to followers within seconds', 'Survive viral posts and celebrity posts', 'Cost-efficient memory for timelines'],
  est:[['Feed reads', '≈ 116K/s', '500M × 20/day'], ['Posts', '≈ 2,900/s', '500M × 0.5/day'], ['Timeline inserts (push)', '≈ 580K/s', 'posts × 200 followers'], ['Timeline memory', '≈ 3.2 TB', '500M × 800 ids × 8 B']],
  entities:{code:`CREATE TABLE posts (post_id BIGINT PRIMARY KEY, author_id BIGINT, body TEXT, media JSONB, created_at TIMESTAMPTZ);  -- sharded by author_id
CREATE TABLE follows (follower_id BIGINT, followee_id BIGINT, created_at TIMESTAMPTZ, PRIMARY KEY (follower_id, followee_id));
CREATE TABLE followers (followee_id BIGINT, follower_id BIGINT, PRIMARY KEY (followee_id, follower_id));             -- reverse index for fan-out
-- Redis: tl:{user} = list of post ids (cap 800); celeb:{author} = recent post ids
-- Counters: likes:{post} sharded counters, flushed periodically`, notes:'Snowflake-style post ids sort by time, so merging timelines is a merge of sorted id lists.'},
  apis:{list:[['POST /posts', 'Create a post'], ['GET /feed?cursor=', 'Ranked page of 20'], ['POST /posts/{id}/like', 'Idempotent like'], ['POST /follow/{user}', 'Follow']], code:`async function onPost(post: Post) {
  const followers = await graph.followerCount(post.authorId);
  if (followers > CELEB_THRESHOLD) return redis.lpush(\`celeb:\${post.authorId}\`, post.id);   // pull at read time
  for await (const batch of graph.activeFollowers(post.authorId, 5000)) {
    const pipe = redis.pipeline(); batch.forEach(f => pipe.lpush(\`tl:\${f}\`, post.id).ltrim(\`tl:\${f}\`, 0, 799)); await pipe.exec();
  }
}`},
  hld:{text:'Hybrid fan-out: posts from normal accounts are pushed into followers’ timelines; celebrity posts are pulled and merged at read time; a ranking service orders candidates; counters are aggregated asynchronously.',
    diagram:{n:[['u', 'client', 'User', '', 0, 1], ['api', 'service', 'Feed API', '', 1, 1], ['tl', 'cache', 'Timelines', 'Redis lists', 2, 0], ['celeb', 'cache', 'Celebrity posts', '', 2, 2], ['rank', 'service', 'Ranker', 'ML', 3, 1], ['q', 'queue', 'Post events', '', 3, 0], ['fan', 'service', 'Fan-out workers', '', 4, 0], ['db', 'db', 'Posts + graph', 'sharded', 4, 2]], e:'u>api api>tl api>celeb api>rank q>fan fan>tl~-0.3 fan>db api>db~0.1 api>q~0.25', f:[['A post is published and fanned out to active followers’ timelines.', 'u>api:POST /posts|api>q|q>fan|fan>db:followers|fan>tl:push ids'], ['A feed read merges the timeline with celebrity posts and ranks them.', 'u>api:GET /feed|api>tl|api>celeb|api>rank']]}},
  components:[['Feed API', 'Assemble candidates, hydrate, rank, paginate'], ['Fan-out workers', 'Push ids to active followers'], ['Timeline cache', 'Per-user capped lists'], ['Celebrity store', 'Recent posts of high-follower accounts'], ['Ranker', 'Score candidates'], ['Counter service', 'Likes/comments aggregation']],
  tech:[['Redis Cluster', 'Timelines and counters'], ['Sharded Postgres/MySQL', 'Posts and graph by user'], ['Kafka', 'Post and engagement events'], ['Feature store + model server', 'Ranking']],
  tradeoffs:[['Hybrid fan-out', 'Cheap reads without celebrity bursts', 'Two code paths'], ['Timelines for active users only', 'Saves memory', 'Rebuild cost for returning users'], ['Approximate counters', 'No hot rows', 'Counts lag']],
  v1:{text:'v1 computes the feed by query: latest posts from followed accounts, ordered by time, with a cache per user for 30 s.', code:`app.get('/feed', auth, async (req, res) => {
  const cached = await redis.get(\`feed:\${req.user.id}\`); if (cached) return res.json(JSON.parse(cached));
  const rows = await db.query(\`SELECT p.* FROM posts p JOIN follows f ON f.followee_id = p.author_id
     WHERE f.follower_id = $1 ORDER BY p.post_id DESC LIMIT 50\`, [req.user.id]);
  await redis.set(\`feed:\${req.user.id}\`, JSON.stringify(rows.rows), 'EX', 30);
  res.json(rows.rows);
});`},
  bottlenecks:['Join over follows × posts explodes with followees and posts', 'Like counters as hot rows', 'Celebrity fan-out bursts'],
  scaling:[['Read cost', 'Fan-out on write into timelines'], ['Celebrity bursts', 'Pull celebrities at read time (threshold)'], ['Counters', 'Event-based sharded counters'], ['Memory', 'Timelines only for active users; cap length']],
  improvements:['Out-of-network recommendations in the feed', 'Real-time “new posts” pill via push', 'Integrity filtering before ranking', 'Experimentation framework for ranking'],
  failures:[['Timeline cache lost', 'Fall back to fan-out on read for active users; rebuild'], ['Ranker down', 'Chronological fallback'], ['Fan-out backlog', 'Posts appear late; prioritise fresh posts over backfill']],
  observability:{metrics:['Feed latency p99', 'Fan-out lag', 'Timeline hit rate', 'Ranking latency and fallback rate', 'Engagement per session'], alerts:['Fan-out lag > 60 s', 'Feed p99 > 500 ms', 'Fallback rate > 5%'], dash:'Feed health, fan-out pipeline, engagement.'},
  review:['Reads are one list + small merge: ✓', 'Celebrity problem handled: ✓', 'Degrades to chronological: ✓', 'Next: tune the threshold using the cost model in the Feed case'],
  refs:['case:feed', 'l:fan-out', 'pg:fanout']});
P({id:'p-payments', level:'advanced', icon:'💳', title:'Payment platform', tagline:'Charge cards and UPI, keep a ledger, pay out merchants, never lose a rupee.', tags:['idempotency', 'ledger', 'reconciliation', 'webhooks'],
  req:'Build a payment platform for merchants: accept card and UPI payments, record everything in a double-entry ledger, notify merchants via webhooks, and settle funds to their bank accounts daily.',
  fr:['Create and confirm payments (card, UPI)', 'Refunds and disputes', 'Webhooks for payment events', 'Daily settlement payouts to merchants', 'Merchant dashboard with balances'],
  nfr:['Exactly-once money movement under retries', 'Ledger always balances; fully auditable', '99.99% availability for payment creation', 'PCI-DSS scope minimised'],
  est:[['Payments', '5M/day; peak 500/s', ''], ['Ledger entries', '≈ 40M/day', '~8 per payment lifecycle'], ['Webhooks', '≈ 20M/day', ''], ['Payouts', '200K merchants daily', '']],
  entities:{code:`CREATE TABLE payments (
  id TEXT PRIMARY KEY, merchant_id BIGINT, amount_minor BIGINT, currency CHAR(3),
  method TEXT, status TEXT,        -- created | authorised | captured | failed | refunded
  idem_key TEXT, UNIQUE (merchant_id, idem_key)
);
CREATE TABLE ledger_entries (
  id BIGSERIAL PRIMARY KEY, txn_id TEXT NOT NULL, account TEXT NOT NULL,   -- merchant:42:pending, platform:fees, …
  amount_minor BIGINT NOT NULL, currency CHAR(3), created_at TIMESTAMPTZ DEFAULT now()
);  -- invariant: SUM(amount_minor) per txn_id = 0; never updated
CREATE TABLE webhook_deliveries (event_id TEXT, endpoint_id BIGINT, attempts INT, next_attempt_at TIMESTAMPTZ, status TEXT, PRIMARY KEY (event_id, endpoint_id));`, notes:'Card numbers never enter these tables: a separate vault tokenises them (PCI scope).'},
  apis:{list:[['POST /v1/payments', 'Idempotency-Key header'], ['POST /v1/payments/{id}/capture', 'Capture an authorised payment'], ['POST /v1/refunds', 'Refund (idempotent)'], ['GET /v1/balance', 'Derived from ledger']], code:`async function capture(paymentId: string) {
  await db.tx(async tx => {
    const p = await tx.one("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [paymentId]);
    if (p.status !== 'authorised') return;                         // idempotent
    const fee = Math.round(p.amount_minor * 0.02);
    await postEntries(tx, \`cap_\${p.id}\`, [
      ['customer_funds:clearing', -p.amount_minor], [\`merchant:\${p.merchant_id}:pending\`, p.amount_minor - fee], ['platform:fees', fee]]);
    await tx.none("UPDATE payments SET status='captured' WHERE id=$1", [p.id]);
    await tx.none("INSERT INTO outbox(topic, payload) VALUES ('payment.captured', $1)", [{ id: p.id }]);
  });
}`},
  hld:{text:'The API is idempotent; processors (card networks, UPI) are called through adapters with timeouts and status checks; every money movement is posted to an immutable ledger in the same transaction as the state change; events drive webhooks; reconciliation compares ledger and bank files.',
    diagram:{n:[['m', 'client', 'Merchant', '', 0, 1], ['api', 'service', 'Payments API', 'idempotent', 1, 1], ['vault', 'service', 'Card vault', 'tokenisation', 1, 0], ['proc', 'ext', 'Processors', 'cards · UPI', 2, 0], ['ledger', 'db', 'Ledger', 'double-entry', 2, 2], ['out', 'queue', 'Events', 'outbox', 3, 1], ['hooks', 'service', 'Webhooks', '', 4, 1], ['recon', 'service', 'Reconciliation', 'bank files', 3, 2]], e:'m>api api>vault api>proc api>ledger api>out out>hooks recon>ledger hooks>m~0.15', f:[['A payment is authorised through the processor and recorded in the ledger.', 'm>api:POST /payments|api>vault:token|api>proc:authorise|api>ledger:entries'], ['Events drive webhooks; reconciliation checks against bank files.', 'api>out|out>hooks|hooks>m:payment.captured|recon>ledger']]}},
  components:[['Payments API', 'Idempotency, state machine, routing to processors'], ['Card vault', 'PCI-scoped tokenisation'], ['Processor adapters', 'Timeouts, retries, status checks per network'], ['Ledger', 'Immutable double-entry records'], ['Webhook service', 'Signed, retried event delivery'], ['Settlement', 'Daily payouts and reconciliation']],
  tech:[['Postgres (serializable for ledger txns)', 'Strong invariants'], ['Kafka + outbox', 'Reliable events'], ['HSM-backed vault', 'Card data security'], ['Temporal-style workflows', 'Long-running settlements and disputes']],
  tradeoffs:[['Immutable ledger', 'Auditability', 'Corrections are new entries'], ['Synchronous authorisation', 'Merchants get an answer', 'Latency depends on networks'], ['Separate vault', 'Shrinks PCI scope', 'An extra hop']],
  v1:{text:'v1: payments table + idempotency + one processor; balances are columns updated in the same transaction.', code:`app.post('/v1/payments', merchantAuth, async (req, res) => {
  const key = req.get('Idempotency-Key');
  const existing = await db.oneOrNone('SELECT * FROM payments WHERE merchant_id=$1 AND idem_key=$2', [req.merchant.id, key]);
  if (existing) return res.json(existing);
  const p = await db.one("INSERT INTO payments(id, merchant_id, amount_minor, currency, method, status, idem_key) VALUES ($1,$2,$3,$4,$5,'created',$6) RETURNING *",
    [newId('pay'), req.merchant.id, req.body.amount, req.body.currency, req.body.method, key]);
  const r = await processor.authorise(p, { timeoutMs: 8000, idempotencyKey: p.id });
  const status = r.ok ? 'authorised' : r.unknown ? 'pending' : 'failed';
  await db.none('UPDATE payments SET status=$2 WHERE id=$1', [p.id, status]);
  res.status(201).json({ ...p, status });
});`},
  bottlenecks:['Processor timeouts leave payments in unknown states', 'Balance columns updated by many concurrent payments (hot merchant)', 'Webhook retries overwhelm slow merchant endpoints'],
  scaling:[['Unknown states', 'PENDING + status-check workers; never retry with a new id'], ['Hot merchants', 'Ledger entries append-only; balances derived/aggregated asynchronously or sharded sub-accounts'], ['Webhooks', 'Per-endpoint queues with backoff and circuit breakers'], ['Database growth', 'Partition ledger by month; archive']],
  improvements:['Smart routing across processors by success rate and cost', 'Fraud scoring', 'Multi-currency with FX entries', 'Instant payouts'],
  failures:[['Processor down', 'Route to a secondary processor for new payments; pending ones resolved later'], ['Ledger imbalance', 'Halt payouts for affected accounts; investigate'], ['Merchant endpoint down', 'Webhooks retried for days; events API for catch-up']],
  observability:{metrics:['Authorisation rate by processor/method', 'Pending payments by age', 'Ledger balance check results', 'Webhook success rate'], alerts:['Auth rate drop > 5 points', 'Pending > 1 h', 'Any ledger imbalance'], dash:'Money flow: volume, success, pending, settlements.'},
  review:['Idempotency on every mutation: ✓', 'Ledger invariant enforced and checked: ✓', 'Unknown states resolved, never guessed: ✓', 'Next: smart routing and FX'],
  refs:['case:stripe', 'case:upi', 'l:saga-outbox', 'l:idempotency-rate-limit-headers']});
P({id:'p-job-scheduler', level:'advanced', icon:'⏰', title:'Distributed job scheduler', tagline:'Millions of cron jobs and delayed tasks, run on time, once.', tags:['scheduling', 'leases', 'partitioning', 'workflows'],
  req:'Build a multi-tenant job scheduler: teams register recurring (cron) and one-off delayed jobs that call webhooks or enqueue messages, with retries, history and alerts on failures.',
  fr:['Register cron and one-off jobs with time zones', 'Execute via HTTP or queue with timeouts', 'Retries with backoff; failure alerts', 'Run history and manual re-runs'],
  nfr:['Fire within 5 s of due time', 'No lost runs if a node dies; duplicates rare and detectable', '10M jobs; 50K due in one second at midnight', 'Tenant isolation (one tenant can’t starve others)'],
  est:[['Jobs', '10M', ''], ['Runs', '50M/day ≈ 580/s, bursts 50K/s', ''], ['History', '≈ 18B rows/year', 'keep 30 days hot'], ['Scheduler nodes', '≈ 20', '']],
  entities:{code:`CREATE TABLE jobs (
  id BIGINT PRIMARY KEY, tenant_id BIGINT, partition SMALLINT NOT NULL,   -- hash(id) % 1024
  schedule TEXT,                 -- cron expression, or NULL for one-off
  tz TEXT NOT NULL, target JSONB NOT NULL,
  next_run_at TIMESTAMPTZ NOT NULL, lease_owner TEXT, lease_until TIMESTAMPTZ,
  enabled BOOLEAN DEFAULT true
);
CREATE INDEX due ON jobs (partition, next_run_at) WHERE enabled;
CREATE TABLE runs (job_id BIGINT, run_id UUID, scheduled_for TIMESTAMPTZ, status TEXT, attempts INT, finished_at TIMESTAMPTZ, PRIMARY KEY (job_id, scheduled_for));`, notes:'(job_id, scheduled_for) is unique, so the same occurrence can’t be recorded twice even if two nodes race.'},
  apis:{list:[['POST /jobs', 'Create job'], ['PATCH /jobs/{id}', 'Pause/resume/change schedule'], ['GET /jobs/{id}/runs', 'History'], ['POST /jobs/{id}/run', 'Manual run']], code:`async function pollPartition(p: number) {
  const due = await db.any(\`UPDATE jobs SET lease_owner=$2, lease_until=now() + interval '60 seconds'
      WHERE id IN (SELECT id FROM jobs WHERE partition=$1 AND enabled AND next_run_at <= now()
                    AND (lease_until IS NULL OR lease_until < now())
                    ORDER BY next_run_at LIMIT 500 FOR UPDATE SKIP LOCKED)
      RETURNING id, next_run_at, schedule, tz\`, [p, NODE_ID]);
  for (const j of due) {
    await db.none("INSERT INTO runs(job_id, run_id, scheduled_for, status, attempts) VALUES ($1, gen_random_uuid(), $2, 'queued', 0) ON CONFLICT DO NOTHING", [j.id, j.next_run_at]);
    await runQueue.send({ jobId: j.id, scheduledFor: j.next_run_at });
    await db.none('UPDATE jobs SET next_run_at=$2, lease_owner=NULL WHERE id=$1', [j.id, nextAfter(j.schedule, j.tz, j.next_run_at)]);
  }
}`},
  hld:{text:'Jobs are partitioned; each scheduler node owns some partitions (via leases), claims due jobs, records the occurrence, enqueues it and computes the next time; executor workers run targets with per-tenant concurrency limits.',
    diagram:{n:[['t', 'client', 'Tenant', '', 0, 1], ['api', 'service', 'Jobs API', '', 1, 1], ['db', 'db', 'Jobs DB', 'partitioned', 2, 1], ['sch', 'service', 'Schedulers', 'own partitions', 2, 0], ['q', 'queue', 'Run queue', 'per-tenant fairness', 3, 0], ['ex', 'service', 'Executors', 'timeouts, retries', 4, 0], ['tgt', 'ext', 'Targets', 'webhooks, queues', 4, 2]], e:'t>api api>db sch>db sch>q q>ex ex>tgt ex>db~-0.1', f:[['Schedulers claim due jobs in their partitions and enqueue occurrences.', 'sch>db:claim due|sch>q:run job 81 @00:00'], ['Executors call targets with the run id and record results.', 'q>ex|ex>tgt:POST (run id)|ex>db:SUCCEEDED']]}},
  components:[['Jobs API', 'CRUD, validation, schedule parsing'], ['Schedulers', 'Partition ownership, due-job claiming, next-time calculation'], ['Run queue', 'Buffers bursts; fair per tenant'], ['Executors', 'HTTP/queue calls, timeouts, retries, history'], ['Alerting', 'Notify owners on repeated failures']],
  tech:[['Postgres with SKIP LOCKED', 'Simple, transactional claiming'], ['Partition leases in etcd/ZooKeeper', 'Balanced ownership, failover'], ['Kafka/SQS', 'Burst buffering'], ['Time-zone aware cron library', 'DST correctness']],
  tradeoffs:[['DB polling', 'Simple and durable', 'Polling load; seconds of precision'], ['At-least-once execution', 'No lost runs', 'Targets must be idempotent (run id)'], ['Per-tenant fairness', 'No noisy neighbours', 'Some jobs wait during bursts']],
  v1:{text:'v1: one node with an in-memory timing wheel loaded from the DB at start-up and refreshed on changes.', code:`const wheel = new Map<number, number[]>();       // second → job ids
async function load() { for (const j of await db.any('SELECT id, next_run_at FROM jobs WHERE enabled')) add(j.id, +j.next_run_at); }
const add = (id: number, at: number) => { const s = Math.floor(at / 1000); (wheel.get(s) ?? wheel.set(s, []).get(s)!).push(id); };
setInterval(async () => {
  const s = Math.floor(Date.now() / 1000), ids = wheel.get(s) ?? []; wheel.delete(s);
  for (const id of ids) { const j = await jobs.get(id); runQueue.send({ jobId: id }); add(id, nextAfter(j.schedule, j.tz, Date.now())); }
}, 1000);`},
  bottlenecks:['Single node: a restart misses runs during downtime', 'Midnight burst of 50K jobs overwhelms executors', 'One tenant’s slow webhooks hold all executor slots'],
  scaling:[['Availability', 'Partitioned schedulers with leases; catch up missed runs on takeover'], ['Bursts', 'Queue + autoscaled executors; optional jitter windows'], ['Noisy tenants', 'Per-tenant concurrency limits and queues'], ['History volume', 'Partition runs table by day; drop old partitions']],
  improvements:['Workflows (job DAGs with dependencies)', 'Missed-run policies (skip, run once, run all)', 'SLA reports per job', 'Pause during incidents'],
  failures:[['Scheduler node dies', 'Lease expires; another node claims its partitions and fires overdue jobs'], ['Target down', 'Retries with backoff; alert after N failures'], ['DB failover', 'Scheduling pauses briefly; overdue jobs fire on recovery']],
  observability:{metrics:['Fire delay (actual − scheduled) p99', 'Runs by status', 'Queue depth per tenant', 'Partition ownership changes'], alerts:['Fire delay p99 > 30 s', 'Unowned partitions', 'Tenant failure rate spike'], dash:'Due vs fired, delays, failures by tenant.'},
  review:['No lost runs; unique occurrence rows: ✓', 'Partitioned, failover-safe scheduling: ✓', 'Fairness across tenants: ✓', 'Next: DAG workflows'],
  refs:['l:workflow-orchestration', 'l:distributed-locks', 'l:delivery-semantics']});
P({id:'p-saas', level:'advanced', icon:'🏢', title:'Multi-tenant SaaS platform', tagline:'One product, thousands of companies, strict isolation and fair performance.', tags:['multi-tenancy', 'isolation', 'sharding', 'noisy neighbours'],
  req:'Build the platform for a B2B SaaS app (say, a helpdesk): thousands of companies with users, data, settings and billing; strict data isolation; large tenants must not slow small ones; enterprise tenants may need dedicated infrastructure.',
  fr:['Tenant sign-up and provisioning', 'Users, roles and SSO per tenant', 'Tenant-scoped data and APIs', 'Usage-based billing and plan limits', 'Data export and deletion'],
  nfr:['No cross-tenant data leaks, ever', 'p99 latency SLO per tenant tier', 'Large tenants isolated (cells or dedicated shards)', 'Regional data residency for some tenants'],
  est:[['Tenants', '20K; top 1% hold 40% of data', ''], ['Users', '2M', ''], ['Requests', '20K/s peak', ''], ['Data', '≈ 50 TB', 'tickets, attachments in object storage']],
  entities:{code:`CREATE TABLE tenants (id BIGINT PRIMARY KEY, name TEXT, plan TEXT, region TEXT, cell TEXT, status TEXT);
CREATE TABLE users (tenant_id BIGINT, id BIGINT, email CITEXT, role TEXT, PRIMARY KEY (tenant_id, id));
CREATE TABLE tickets (
  tenant_id BIGINT NOT NULL, id BIGINT NOT NULL, subject TEXT, status TEXT, assignee BIGINT, created_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id)
);
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tickets USING (tenant_id = current_setting('app.tenant_id')::bigint);`, notes:'tenant_id leads every key and is enforced by row-level security as a second line of defence behind application checks.'},
  apis:{list:[['POST /tenants', 'Provision a tenant into a cell'], ['GET /api/tickets', 'Tenant from the token, never from the request body'], ['GET /admin/tenants/{id}/usage', 'Usage for billing'], ['POST /tenants/{id}/export', 'Async data export']], code:`app.use(async (req, res, next) => {
  const claims = verifyJwt(req.get('authorization'));             // tenant comes from the token
  req.tenant = await tenants.get(claims.tid);
  if (req.tenant.cell !== THIS_CELL) return res.redirect(307, cellUrl(req.tenant.cell, req.originalUrl));
  req.db = await pool.connect();
  await req.db.query("SELECT set_config('app.tenant_id', $1, true)", [String(req.tenant.id)]);   // RLS scope for this transaction
  res.on('finish', () => req.db.release());
  next();
});`},
  hld:{text:'A global control plane handles sign-up, routing and billing; tenants live in cells (independent stacks with their own databases); a router sends each request to the tenant’s cell; within a cell, data is keyed and protected by tenant id.',
    diagram:{n:[['u', 'client', 'Tenant user', '', 0, 1], ['router', 'lb', 'Cell router', 'tenant → cell', 1, 1], ['ctl', 'service', 'Control plane', 'sign-up, billing', 1, 0], ['dir', 'db', 'Tenant directory', '', 2, 0], ['c1', 'service', 'Cell A', 'shared, small tenants', 2, 1], ['c2', 'service', 'Cell B', 'enterprise', 2, 2], ['db1', 'db', 'Cell A DB', 'RLS', 3, 1], ['db2', 'db', 'Cell B DB', 'dedicated', 3, 2]], e:'u>router router>dir router>c1 router>c2 ctl>dir c1>db1 c2>db2', f:[['A request is routed to the tenant’s cell using the directory.', 'u>router:acme.helpdesk.app|router>dir:acme → cell A|router>c1'], ['The cell sets the tenant context and queries its database under row-level security.', 'c1>db1:SET app.tenant_id']]}},
  components:[['Control plane', 'Tenant lifecycle, plans, billing, placement'], ['Tenant directory', 'Tenant → cell/region mapping'], ['Cell router', 'Routes by subdomain/token'], ['Cells', 'Full application stacks with their own data stores'], ['Usage metering', 'Events → billing']],
  tech:[['Postgres with RLS', 'Defence in depth for shared tables'], ['Cell architecture', 'Blast-radius containment'], ['Per-tenant rate limits and quotas', 'Noisy-neighbour protection'], ['Infrastructure as code', 'Stamp out new cells consistently']],
  tradeoffs:[['Shared tables + RLS (pool)', 'Cheap, efficient', 'Noisy neighbours, careful isolation'], ['Database per tenant (silo)', 'Strong isolation, easy export/delete', 'Operational overhead at thousands of tenants'], ['Cells', 'Limited blast radius', 'Cross-cell features and migrations are harder']],
  v1:{text:'v1: one application and one database; every table has tenant_id and every query filters by it via a repository layer.', code:`class TicketRepo {
  constructor(private db: Db, private tenantId: number) {}
  list(status?: string) {
    return this.db.any('SELECT * FROM tickets WHERE tenant_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY created_at DESC LIMIT 50',
      [this.tenantId, status ?? null]);                       // tenant filter can’t be forgotten: it’s in the constructor
  }
}`},
  bottlenecks:['One huge tenant’s reports slow everyone', 'A bug forgetting the tenant filter leaks data', 'Schema migrations lock the shared database'],
  scaling:[['Noisy neighbours', 'Per-tenant quotas; move large tenants to their own shard or cell'], ['Leak risk', 'Row-level security + tests that scan queries for tenant scoping'], ['Growth', 'New cells instead of bigger databases'], ['Residency', 'Cells per region; placement by tenant setting']],
  improvements:['Tenant-level encryption keys (BYOK)', 'Self-serve tenant migration between cells', 'Per-tenant feature flags', 'Usage-based pricing analytics'],
  failures:[['A cell fails', 'Only its tenants affected; status page per cell'], ['Directory unavailable', 'Routers cache mappings; new sign-ups pause'], ['Bad migration', 'Roll out cell by cell; stop at first failure']],
  observability:{metrics:['Latency and errors per tenant and per cell', 'Top tenants by resource use', 'Quota rejections', 'RLS policy violations (should be 0)'], alerts:['Tenant SLO burn rate', 'Cell error rate', 'Any cross-tenant access attempt'], dash:'Cells overview, noisy tenants, SLOs by tier.'},
  review:['Isolation in code and in the database: ✓', 'Blast radius bounded by cells: ✓', 'Fairness via quotas: ✓', 'Next: BYOK and automated tenant moves'],
  refs:['l:multi-tenancy', 'l:zero-trust-tenancy', 'l:bulkhead-fallback', 'l:rbac-abac']});
P({id:'p-analytics', level:'advanced', icon:'📊', title:'Real-time analytics', tagline:'Events in, live dashboards out, in seconds.', tags:['streaming', 'olap', 'windows', 'exactly-once'],
  req:'Build product analytics: apps send events (page views, clicks, purchases); dashboards show live metrics (active users, funnels, revenue) within seconds, with ad-hoc queries over months of history.',
  fr:['Ingest events from web/mobile/server SDKs', 'Live dashboards (last 15 minutes, per minute)', 'Funnels and retention over history', 'Ad-hoc filtering by properties'],
  nfr:['Ingest 1M events/s', 'Dashboard freshness under 10 s', 'Ad-hoc queries over 90 days in seconds', 'No double counting from retries'],
  est:[['Events', '1M/s peak, 30B/day', ''], ['Raw size', '≈ 15 TB/day', '30B × 500 B'], ['Compressed columnar', '≈ 2 TB/day', '~8× compression'], ['Distinct users', '100M', 'HLL for uniques']],
  entities:{code:`-- Columnar OLAP table (ClickHouse-style), partitioned by day, sorted for typical filters
CREATE TABLE events (
  event_id   UUID,
  project_id UInt32,
  ts         DateTime64(3),
  user_id    String,
  name       LowCardinality(String),
  props      Map(String, String),
  country    LowCardinality(String), platform LowCardinality(String)
) ENGINE = ReplacingMergeTree
PARTITION BY toDate(ts) ORDER BY (project_id, name, ts, event_id);
-- Pre-aggregations: per-minute counts and HLL sketches per (project, name)`, notes:'ReplacingMergeTree by event_id removes duplicate events from retries during merges; queries can also deduplicate explicitly.'},
  apis:{list:[['POST /collect', 'Batched events with event_id'], ['GET /api/metrics?metric=active_users&window=15m', 'Live metric'], ['POST /api/query', 'Funnel/retention/ad-hoc query']], code:`app.post('/collect', async (req, res) => {
  const { project_key, events } = req.body;                       // batched by SDK, gzip
  const project = await projects.byKey(project_key); if (!project) return res.status(401).end();
  const valid = events.filter(isValidEvent).map(e => ({ ...e, project_id: project.id, received_at: Date.now() }));
  await kafka.send({ topic: 'events', messages: valid.map(e => ({ key: e.user_id, value: JSON.stringify(e) })) });
  res.status(202).end();                                          // SDK retries on failure, same event_ids
});`},
  hld:{text:'A thin collector writes events to Kafka; a stream processor keeps per-minute aggregates for live dashboards; a loader writes raw events into a columnar OLAP store for ad-hoc and historical queries.',
    diagram:{n:[['sdk', 'client', 'SDKs', 'batched events', 0, 1], ['col', 'service', 'Collectors', 'validate', 1, 1], ['k', 'queue', 'Kafka', 'events', 2, 1], ['sp', 'service', 'Stream processor', 'windows + HLL', 3, 0], ['live', 'cache', 'Live store', 'per-minute', 4, 0], ['load', 'service', 'Loader', 'batches', 3, 2], ['olap', 'db', 'Columnar OLAP', 'history', 4, 2], ['ui', 'client', 'Dashboards', '', 4, 1]], e:'sdk>col col>k k>sp sp>live k>load load>olap ui>live ui>olap', f:[['Events are collected and appended to Kafka.', 'sdk>col:batch of 50|col>k'], ['The stream processor updates per-minute aggregates for live dashboards.', 'k>sp|sp>live:active users 10:42'], ['The loader writes raw events into the columnar store for ad-hoc queries.', 'k>load|load>olap|ui>olap:funnel 30d']]}},
  components:[['SDKs', 'Batching, retries with event ids, offline buffers'], ['Collectors', 'Auth, validation, enrichment (geo, device)'], ['Stream processor', 'Windowed counts, uniques (HLL), alerts'], ['Columnar store', 'History and ad-hoc analytics'], ['Query API', 'Templates for funnels, retention, segmentation']],
  tech:[['Kafka', 'Buffer and replay'], ['Flink/Kafka Streams', 'Event-time windows'], ['ClickHouse/Druid/Pinot', 'Fast columnar aggregation'], ['HyperLogLog', 'Approximate distinct users']],
  tradeoffs:[['Pre-aggregates for live views', 'Instant dashboards', 'Only predefined metrics are live'], ['Columnar raw store', 'Flexible ad-hoc queries', 'Storage and compute cost'], ['Approximate uniques', 'Cheap', '~1% error']],
  v1:{text:'v1 inserts events in batches into Postgres (partitioned by day) and runs SQL for dashboards with a materialised view refreshed every minute.', code:`const buffer: Event[] = [];
export function track(e: Event) { buffer.push(e); if (buffer.length >= 1000) flush(); }
async function flush() {
  const batch = buffer.splice(0);
  await db.none(pgp.helpers.insert(batch, ['event_id', 'project_id', 'ts', 'user_id', 'name', 'props'], 'events') + ' ON CONFLICT (event_id) DO NOTHING');
}
setInterval(flush, 1000);
setInterval(() => db.none('REFRESH MATERIALIZED VIEW CONCURRENTLY minute_counts'), 60_000);`},
  bottlenecks:['Row-store aggregation over billions of rows is slow', 'Unique-user counts need large distinct sets', 'Ingest spikes overwhelm direct DB inserts'],
  scaling:[['Aggregation speed', 'Columnar OLAP with sort keys and partitions'], ['Uniques', 'HLL sketches per window; merge for longer ranges'], ['Spikes', 'Kafka buffer; loaders batch'], ['Hot projects', 'Partition by project and time; per-project quotas']],
  improvements:['Session reconstruction', 'Anomaly alerts on metrics', 'Privacy: consent, PII redaction, deletion by user id', 'Sampling for very large projects'],
  failures:[['OLAP cluster slow', 'Live dashboards still served from the stream path'], ['Stream processor restart', 'Resume from checkpoints; exactly-once sinks'], ['Collector overload', 'SDKs buffer and retry with backoff']],
  observability:{metrics:['Ingest rate and rejection reasons', 'End-to-end freshness', 'Kafka lag', 'Query latency p95'], alerts:['Freshness > 60 s', 'Lag growing', 'Ingest error spike'], dash:'Pipeline freshness, volume by project, query performance.'},
  review:['Separate live and historical paths: ✓', 'Deduplication by event id: ✓', 'Back-pressure via Kafka: ✓', 'Next: privacy tooling and anomaly detection'],
  refs:['l:batch-vs-stream', 'l:lambda-kappa', 'l:oltp-olap', 'l:hll-cms']});
P({id:'p-global-storage', level:'advanced', icon:'🌐', title:'Global file storage', tagline:'Exabyte-scale object storage across regions with 11 nines durability.', tags:['erasure coding', 'metadata', 'replication', 'consistency'],
  req:'Build an S3-like object store: buckets and keys, PUT/GET/DELETE/LIST, large multipart uploads, cross-region replication, lifecycle tiers, with extreme durability.',
  fr:['Bucket and object CRUD, LIST with prefixes', 'Multipart uploads up to 5 TB', 'Versioning', 'Cross-region replication and lifecycle tiers'],
  nfr:['Durability 99.999999999%', 'Strong read-after-write consistency for objects', 'Throughput scales with clients', 'Cost per GB minimised'],
  est:[['Objects', '1 trillion', ''], ['Data', '≈ 1 EB', ''], ['Requests', '10M/s', 'mostly GETs'], ['Disk failures', 'hundreds per day', 'at ~1M disks']],
  entities:{code:`-- Metadata (sharded, strongly consistent; e.g. Raft groups by key range)
-- objects(bucket, key, version_id, size, etag, created_at, storage_class, placement[], deleted)
--   PRIMARY KEY (bucket, key, version_id DESC)
-- placement: list of (chunk_id, stripe: 10 data + 4 parity fragments on 14 disks in different racks/zones)
-- Data plane: chunk servers store immutable fragments; a repair service re-creates lost fragments`, notes:'Separating metadata (small, strongly consistent) from data (huge, immutable, erasure-coded) is the core design.'},
  apis:{list:[['PUT /{bucket}/{key}', 'Upload object (or part)'], ['GET /{bucket}/{key}', 'Download (range supported)'], ['GET /{bucket}?prefix=&continuation=', 'LIST'], ['DELETE /{bucket}/{key}', 'Delete / delete marker']], code:`async function putObject(bucket: string, key: string, body: Readable) {
  const chunks = [];
  for await (const chunk of chunkStream(body, 64 * 2 ** 20)) {           // 64 MB chunks
    const fragments = erasureEncode(chunk, { data: 10, parity: 4 });     // survive loss of any 4
    const disks = placement.pick(14, { distinctRacks: true, zones: 3 });
    await Promise.all(fragments.map((f, i) => chunkServer(disks[i]).write(f)));
    chunks.push({ id: hash(chunk), disks });
  }
  await metadata.commit(bucket, key, { versionId: newVersion(), chunks });   // object becomes visible atomically here
}`},
  hld:{text:'Front-end servers authenticate and stream data; data is chunked, erasure-coded and spread across racks and zones; a strongly consistent metadata service maps keys to chunks; background services repair, rebalance, tier and replicate across regions.',
    diagram:{n:[['c', 'client', 'Clients', '', 0, 1], ['fe', 'lb', 'Front ends', 'auth · streaming', 1, 1], ['meta', 'db', 'Metadata', 'Raft-sharded', 2, 0], ['cs', 'db', 'Chunk servers', 'erasure-coded', 2, 2], ['rep', 'service', 'Repair', 'rebuild fragments', 3, 2], ['xr', 'service', 'Cross-region', 'replication', 3, 0], ['r2', 'db', 'Other region', '', 4, 1]], e:'c>fe fe>meta fe>cs rep>cs rep>meta xr>meta xr>r2', f:[['A PUT streams chunks to chunk servers (erasure-coded), then commits metadata.', 'c>fe:PUT|fe>cs:14 fragments per chunk|fe>meta:commit version'], ['Background repair restores fragments on failed disks; replication copies to another region.', 'rep>cs:rebuild|xr>r2:copy object']]}},
  components:[['Front ends', 'Auth, request routing, streaming, multipart assembly'], ['Metadata service', 'Keys, versions, placement; strongly consistent'], ['Chunk servers', 'Store immutable fragments, checksums'], ['Repair service', 'Detect and rebuild lost fragments'], ['Lifecycle + replication', 'Tiering, expiry, cross-region copies']],
  tech:[['Reed-Solomon erasure coding', '1.4× overhead vs 3× replication'], ['Raft-based sharded metadata', 'Strong consistency'], ['Checksums everywhere + scrubbing', 'Catch silent corruption'], ['Placement across racks/zones', 'Survive correlated failures']],
  tradeoffs:[['Erasure coding', 'Cheap durability', 'Reconstruction cost on reads after failures'], ['Strongly consistent metadata', 'Read-after-write correctness', 'Metadata becomes the scaling bottleneck to design carefully'], ['Async cross-region replication', 'Low write latency', 'Seconds-to-minutes RPO across regions']],
  v1:{text:'v1: one metadata database and 3× replicated files across three servers.', code:`async function put(bucket: string, key: string, data: Buffer) {
  const id = randomUUID(), servers = pickThree();
  await Promise.all(servers.map(s => s.write(id, data, sha256(data))));            // all three must succeed
  await db.none('INSERT INTO objects(bucket, key, blob_id, servers, size) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (bucket, key) DO UPDATE SET blob_id=$3, servers=$4, size=$5',
    [bucket, key, id, servers.map(s => s.id), data.length]);
}`},
  bottlenecks:['3× replication costs 3× storage', 'Single metadata database limits object count and request rate', 'LIST over huge buckets is slow'],
  scaling:[['Storage cost', 'Erasure coding for warm/cold data'], ['Metadata scale', 'Shard by (bucket, key range); split hot ranges'], ['LIST', 'Ordered key ranges with continuation tokens'], ['Hot objects', 'Cache layer / CDN for popular reads']],
  improvements:['Object lock / WORM for compliance', 'Event notifications on object changes', 'Intelligent tiering by access patterns', 'S3 Select-style server-side filtering'],
  failures:[['Disk dies', 'Repair rebuilds fragments from the remaining 10 of 14'], ['Rack/zone loss', 'Placement guarantees enough fragments survive'], ['Metadata shard leader dies', 'Raft elects a new leader; brief write pause for that key range']],
  observability:{metrics:['Durability risk: fragments under-replicated', 'Repair backlog and rate', 'Request latency by operation', 'Metadata shard hotness'], alerts:['Any stripe below safety margin', 'Repair backlog growing', 'Checksum mismatch rate'], dash:'Durability health, request performance, capacity.'},
  review:['Durability via erasure coding + placement + repair: ✓', 'Consistent metadata commit makes objects visible atomically: ✓', 'Scales by sharding metadata and adding chunk servers: ✓', 'Next: compliance features and smart tiering'],
  refs:['l:storage-types', 'l:replication', 'l:consensus-raft', 'case:dropbox']});
P({id:'p-search', level:'advanced', icon:'🔍', title:'Large-scale search engine', tagline:'Index billions of documents and answer in milliseconds.', tags:['inverted index', 'sharding', 'ranking', 'freshness'],
  req:'Build search for a large content platform (1B documents): keyword queries with filters, relevance ranking, typo tolerance, fresh results for new documents, at 20K queries per second.',
  fr:['Index and update documents', 'Keyword search with filters and facets', 'Relevance ranking with business signals', 'Autocomplete and spelling suggestions'],
  nfr:['p99 latency under 200 ms', 'New documents searchable within 1 minute', 'Survive node failures without dropping queries', 'Index rebuilds without downtime'],
  est:[['Documents', '1B × 5 KB text', ''], ['Index size', '≈ 2 TB compressed', '~40% of text size'], ['Queries', '20K/s', ''], ['Updates', '5K/s', '']],
  entities:{code:`-- Source of truth (any DB) → indexing pipeline → search index
-- Index mapping (conceptual):
--   doc: {id, title (text, boosted ×3), body (text), tags (keyword), lang, created_at (date), popularity (float)}
-- Inverted index per shard: term → postings [(doc_id, tf, positions)], compressed (delta + varint)
-- Doc-values (columnar) per shard for filters, sorting and facets`, notes:'Each shard is a complete small search engine over its slice of documents (document partitioning).'},
  apis:{list:[['GET /search?q=&filters=&page=', 'Ranked results with facets'], ['PUT /docs/{id}', 'Index or update (async)'], ['GET /suggest?q=', 'Autocomplete']], code:`async function search(q: string, filters: Filters, k = 20) {
  const plan = parse(q);                                         // terms, phrases, spelling-corrected variants
  const shards = cluster.shardsFor(filters);                     // all shards, or a routing subset
  const partial = await Promise.all(shards.map(s =>
    withDeadline(s.replicaPick().topK(plan, filters, k), 120).catch(() => [])));   // partial results beat timeouts
  return rerank(mergeTopK(partial.flat(), k), q);                // second-stage ranker on the top candidates
}`},
  hld:{text:'Documents flow from the source of truth through an indexing pipeline into document-partitioned, replicated shards; queries scatter to shards and gather top-k; a reranker applies heavier relevance models; a small real-time index handles fresh documents.',
    diagram:{n:[['u', 'client', 'User', '', 0, 1], ['qs', 'service', 'Query service', 'parse · merge', 1, 1], ['s1', 'db', 'Shard 1..N', '×2 replicas', 2, 0], ['rt', 'db', 'Real-time index', 'last hour', 2, 2], ['rr', 'service', 'Reranker', 'ML', 3, 1], ['src', 'db', 'Source DB', '', 4, 2], ['ix', 'service', 'Indexers', 'CDC → index', 3, 2]], e:'u>qs qs>s1 qs>rt qs>rr src>ix ix>rt ix>s1~-0.35', f:[['A query scatters to all shards and the real-time index; top results merge.', 'u>qs:q|qs>s1:top 20 each|qs>rt'], ['A reranker reorders the top candidates.', 'qs>rr:rerank 200'], ['Document changes are indexed into the real-time tier first, then merged into shards.', 'src>ix:CDC|ix>rt|ix>s1:periodic merge']]}},
  components:[['Indexing pipeline', 'CDC consumption, text analysis, document building'], ['Shards', 'Inverted index + doc-values; local top-k'], ['Query service', 'Parsing, spelling, scatter-gather, deadlines'], ['Reranker', 'Learning-to-rank on top candidates'], ['Real-time index', 'Fresh documents before merging']],
  tech:[['Elasticsearch/OpenSearch or Lucene-based custom', 'Mature inverted index'], ['BM25 + learning to rank', 'Strong relevance'], ['Kafka CDC', 'Reliable index updates'], ['Hedged requests', 'Tame tail latency']],
  tradeoffs:[['Document partitioning', 'Local intersections; easy scaling', 'Every query hits every shard'], ['Two-stage ranking', 'Expensive models only on top-k', 'Recall limited by first stage'], ['Real-time tier', 'Freshness', 'Merge complexity']],
  v1:{text:'v1 uses Postgres full-text search with a GIN index and ts_rank.', code:`async function searchV1(q: string, limit = 20) {
  return db.any(\`SELECT id, title, ts_rank(search, websearch_to_tsquery('english', $1)) AS score
                 FROM docs WHERE search @@ websearch_to_tsquery('english', $1)
                 ORDER BY score DESC, created_at DESC LIMIT $2\`, [q, limit]);
}`},
  bottlenecks:['Single database index can’t hold or serve 1B documents', 'Ranking quality limited to term statistics', 'Re-indexing everything takes days'],
  scaling:[['Size', 'Shard by document across many nodes'], ['Throughput', 'Replicas per shard'], ['Tail latency', 'Deadlines, hedging, partial results'], ['Reindexing', 'Build a new index version in parallel; switch an alias atomically']],
  improvements:['Semantic search with vector embeddings (hybrid retrieval)', 'Personalisation', 'Query understanding (synonyms, entities)', 'Click models for relevance training'],
  failures:[['Shard replica down', 'Other replica serves; rebuild from snapshot'], ['Indexing lag', 'Real-time tier covers fresh docs; alert on lag'], ['Bad ranking model', 'Canary and quick rollback to previous model']],
  observability:{metrics:['Query latency p50/p99 per shard', 'Zero-result rate', 'Click-through and abandonment', 'Index lag'], alerts:['p99 > 300 ms', 'Index lag > 5 min', 'Zero-result spike'], dash:'Latency, relevance KPIs, indexing health.'},
  review:['Scale-out by document shards + replicas: ✓', 'Freshness via real-time tier: ✓', 'Tail-latency controls: ✓', 'Next: hybrid lexical + vector retrieval'],
  refs:['case:google-search', 'l:inverted-index', 'l:bm25-ranking', 'l:elasticsearch']});
P({id:'p-recsys', level:'advanced', icon:'✨', title:'Recommendation system', tagline:'Candidate generation, ranking and feedback loops at scale.', tags:['recommendations', 'embeddings', 'feature store', 'experimentation'],
  req:'Build recommendations for a shopping or video app: “recommended for you” rows on the home page, “similar items” on product pages, updated as users interact, measured by A/B tests.',
  fr:['Personalised home recommendations', 'Similar items', 'Real-time updates from recent clicks', 'A/B testing of models'],
  nfr:['p99 under 100 ms for 50 recommendations', 'Fresh signals within minutes', 'Fallbacks when models or features are unavailable', 'Avoid feedback loops and filter bubbles'],
  est:[['Users', '100M; items 10M', ''], ['Requests', '50K/s', ''], ['Interactions', '5B/day', ''], ['Embeddings', '≈ 26 GB items + 26 GB users', '10M/100M × 64 floats (users partly)']],
  entities:{code:`-- Interactions log (append-only, for training)
-- interactions(user_id, item_id, event, ts, context)   -- view, click, add_to_cart, purchase
-- Offline outputs:
--   item_embeddings(item_id, vector float[64], model_version)
--   user_embeddings(user_id, vector float[64], model_version)
--   item_neighbors(item_id, neighbors item_id[100])     -- similar items via ANN
-- Online: feature store (user recent clicks, item popularity), ANN index over item embeddings`, notes:'Training data must be point-in-time correct; serving reads only precomputed vectors and features.'},
  apis:{list:[['GET /recs/home?user=', '50 items with reasons'], ['GET /recs/similar/{item}', 'Similar items'], ['POST /events', 'Interaction events']], code:`async function homeRecs(userId: string, n = 50) {
  const [u, recent] = await Promise.all([embeddings.user(userId), features.recentItems(userId, 20)]);
  const candidates = dedupe([
    ...(u ? await ann.search(u, 500) : []),                         // embedding retrieval
    ...(await neighbors.forItems(recent, 20)),                     // “because you viewed …”
    ...(await popular.inSegment(await features.segment(userId), 100))]);   // fallback / exploration
  const scored = await ranker.score(userId, candidates, { timeoutMs: 40 }).catch(() => candidates.map(c => ({ ...c, score: c.prior })));
  return diversify(scored.sort((a, b) => b.score - a.score), n);    // limit same-category streaks
}`},
  hld:{text:'Two stages: cheap candidate generation (ANN over embeddings, co-visitation neighbours, popularity) then a heavier ranker using features from a feature store; models train offline on logged interactions; experiments assign users to model variants.',
    diagram:{n:[['u', 'client', 'App', '', 0, 1], ['api', 'service', 'Recs API', 'retrieve → rank', 1, 1], ['ann', 'cache', 'ANN index', 'item vectors', 2, 0], ['fs', 'cache', 'Feature store', 'online', 2, 2], ['rank', 'service', 'Ranker', 'model server', 3, 1], ['log', 'queue', 'Interactions', '', 1, 2], ['train', 'service', 'Training', 'offline', 3, 2]], e:'u>api api>ann api>fs api>rank u>log log>train~0.2 train>ann~-0.3 train>rank', f:[['Candidates come from the ANN index and neighbours; features from the feature store.', 'u>api:home|api>ann:500 candidates|api>fs:features'], ['The ranker scores and the API diversifies the final list.', 'api>rank:score'], ['Interactions are logged and feed training of the next model.', 'u>log:click|log>train|train>rank:new model']]}},
  components:[['Candidate generators', 'ANN retrieval, co-visitation, popularity, editorial'], ['Feature store', 'Online and offline features'], ['Ranker', 'Gradient-boosted or neural model'], ['Training pipeline', 'Point-in-time datasets, evaluation'], ['Experimentation', 'Assignment, metrics, guardrails']],
  tech:[['Two-tower embeddings + ANN (HNSW)', 'Fast retrieval from millions'], ['Feature store', 'Train/serve consistency'], ['Model server with timeouts', 'Bounded latency'], ['A/B platform', 'Measure real impact']],
  tradeoffs:[['Two-stage pipeline', 'Fast and accurate', 'Recall limited by candidates'], ['Daily retraining + real-time features', 'Fresh enough cheaply', 'Model lags trends'], ['Exploration slots', 'Discover new items, avoid loops', 'Short-term metric cost']],
  v1:{text:'v1: item-to-item co-visitation (“people who viewed X also viewed Y”) computed nightly, plus popularity.', code:`-- nightly job (SQL): co-visitation within the same session
INSERT INTO item_neighbors (item_id, neighbor_id, score)
SELECT a.item_id, b.item_id, count(*) AS score
FROM interactions a JOIN interactions b
  ON a.session_id = b.session_id AND a.item_id <> b.item_id AND abs(extract(epoch FROM a.ts - b.ts)) < 1800
WHERE a.ts > now() - interval '30 days'
GROUP BY 1, 2 HAVING count(*) >= 5;`, lang:'sql', title:'v1.sql'},
  bottlenecks:['Co-visitation is quadratic in session length and only helps items with history', 'No personalisation beyond recent items', 'Nightly batch misses same-day trends'],
  scaling:[['Personalisation', 'User and item embeddings + ANN retrieval'], ['Cold start', 'Content-based embeddings for new items; popularity for new users'], ['Freshness', 'Streaming features (recent clicks) used by the ranker'], ['Latency', 'Precompute candidates for heavy users; strict timeouts with fallbacks']],
  improvements:['Multi-objective ranking (engagement + revenue + diversity)', 'Bandits for exploration', 'Explanations (“because you viewed…”)', 'Fairness and safety filters'],
  failures:[['Ranker timeout', 'Return candidates ordered by prior scores'], ['Feature store down', 'Use defaults; log degraded responses'], ['Bad model', 'Guardrail metrics trigger automatic rollback']],
  observability:{metrics:['CTR/conversion per surface and model', 'Latency per stage', 'Fallback rate', 'Catalogue coverage and diversity'], alerts:['Fallback rate > 5%', 'CTR drop vs control', 'p99 > 150 ms'], dash:'Model performance, experiment results, pipeline freshness.'},
  review:['Two-stage retrieval + ranking within budget: ✓', 'Train/serve consistency via feature store: ✓', 'Experiments and guardrails: ✓', 'Next: multi-objective ranking and bandits'],
  refs:['l:recommendations', 'l:vector-search-rag', 'case:spotify', 'case:netflix']});
})();
