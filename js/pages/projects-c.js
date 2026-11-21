/* =====================================================================
   PART 14 · PROJECTS — advanced (10)
   ===================================================================== */
(function(){
const SDA = window.SDA;
const P = def => SDA.register(Object.assign({kind:'project'}, def));

P({id:'p-video', level:'advanced', icon:'🎬', title:'Video streaming platform', tagline:'Upload, transcode, and stream adaptively to millions.', tags:['transcoding', 'abr', 'cdn', 'workflows'],
  req:'<b>A small example.</b> Arun uploads a 10-minute video from his laptop. The platform cuts it into small pieces and turns each piece into several sizes, from phone quality to full HD. Within minutes it is ready. A viewer in another country presses play, and the video starts in under 2 seconds. If her network slows down, the player switches to a smaller size without stopping. Build this video platform.',
  fr:['Upload large videos, and carry on after a break', 'Convert each video to several sizes and formats', 'Adaptive streaming (HLS or DASH) with thumbnails', 'Watch history, view counts and recommendations'],
  nfr:['Playback starts in under 2 s, and the video pauses to load less than 1% of the time', 'Processing finishes within minutes of the upload', 'Originals are never lost, and the other sizes can be made again', 'Most of the cost is CDN traffic, so keep the load on the origin low'],
  est:[['Uploads', '100K videos a day, 10 minutes each', 'This is an assumption'], ['Transcode work', '≈ 1M CPU-hours a day', '100K × 10 min = 1M video-minutes. At about 1 CPU-hour for each video-minute (all sizes) = 1M CPU-hours'], ['Views', '200M a day, up to 2M watching at once', 'The peak is an assumption'], ['Data sent out', '≈ 6 Tbps at peak', '2M viewers × 3 Mbps = 6,000,000 Mbps = 6 Tbps']],
  entities:{code:`CREATE TABLE videos (
  id UUID PRIMARY KEY, owner_id BIGINT, title TEXT, duration_s INT,
  status TEXT NOT NULL,             -- UPLOADING | PROCESSING | READY | FAILED
  original_key TEXT, manifest_key TEXT, visibility TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE renditions (video_id UUID, height INT, codec TEXT, bitrate_kbps INT, playlist_key TEXT, PRIMARY KEY (video_id, height, codec));
CREATE TABLE transcode_tasks (video_id UUID, segment INT, rendition TEXT, status TEXT, attempts INT DEFAULT 0, PRIMARY KEY (video_id, segment, rendition));
-- view counts: counters in a stream aggregator, flushed per minute`, notes:'One task for each piece and each size lets the work run in parallel and be retried alone.'},
  apis:{list:[['POST /uploads', 'Start an upload that can resume'], ['POST /uploads/{id}/complete', 'Start the processing workflow'], ['GET /videos/{id}/play', 'A signed link to the playlist, and where to resume'], ['POST /events/playback', 'Heartbeats and quality changes']], code:`async function onUploadComplete(videoId: string) {
  const segments = await splitAtKeyframes(videoId, 4);                // 4 s GOP-aligned chunks
  const ladder = chooseLadder(await probe(videoId));                  // e.g. 240p…1080p, skip upscales
  await db.tx(tx => Promise.all(segments.flatMap(s => ladder.map(r =>
    tx.none('INSERT INTO transcode_tasks(video_id, segment, rendition, status) VALUES ($1,$2,$3,$4)', [videoId, s, r.name, 'QUEUED'])))));
  await queue.sendBatch(segments.flatMap(s => ladder.map(r => ({ videoId, segment: s, rendition: r.name }))));
}`},
  hld:{text:'Uploads go to object storage. A workflow cuts each video into pieces and sends the encoding jobs to a fleet of workers. The finished pieces go back to storage and are served through a CDN. Playback events feed the counters and the recommendations.',
    diagram:{n:[['c', 'client', 'Creator', '', 0, 0], ['v', 'client', 'Viewer', '', 0, 2], ['up', 'service', 'Upload service', 'resumable', 1, 0], ['wf', 'service', 'Workflow', 'split · fan-out', 2, 0], ['q', 'queue', 'Transcode tasks', '', 3, 0], ['tx', 'service', 'Transcoders', 'GPU/CPU fleet', 4, 0], ['s3', 'db', 'Object storage', 'originals + HLS', 4, 1], ['cdn', 'cdn', 'CDN', '', 1, 2], ['api', 'service', 'Playback API', 'signed URLs', 2, 2]], e:'c>up up>wf wf>q q>tx tx>s3 v>cdn cdn>s3~-0.1 v>api~0.2 api>s3~0.3', f:[['An upload completes and the workflow fans out segment × rendition tasks.', 'c>up:upload|up>wf|wf>q:tasks|q>tx'], ['Renditions are packaged into storage.', 'tx>s3:HLS segments'], ['Viewers get a signed manifest and stream from the CDN.', 'v>api:play|v>cdn:segments|cdn>s3:miss']]}},
  components:[['Upload service', 'Uploads that can resume, straight to object storage'], ['Workflow engine', 'Cuts, sends out jobs, joins, packages and publishes'], ['Transcoder fleet', 'Encodes the pieces and adds workers when the queue grows'], ['Playback API', 'Checks rights, makes signed links and remembers where to resume'], ['CDN', 'Delivers the video pieces'], ['Analytics', 'Views, quality numbers and input for recommendations']],
  tech:[['FFmpeg (and hardware encoders)', 'The standard tool for encoding video'], ['HLS and DASH with CMAF', 'One way of packaging that works on most devices'], ['Temporal or Step Functions', 'Workflows that keep going after a crash'], ['More than one CDN', 'Stays up if one fails, and gives a better price']],
  tradeoffs:[['Encode the pieces in parallel', 'Minutes instead of hours', 'You must manage the jobs and join the results'], ['A size ladder chosen for each video', 'Fewer bits for easy videos', 'One extra step to analyse each video'], ['Newer codecs for popular videos first', 'Saves compute on videos that few people watch', 'Rarely watched videos use more bandwidth']],
  v1:{text:'Version 1 encodes each upload one piece after another on one machine with FFmpeg, into three sizes.', code:`async function transcode(videoId: string, src: string) {
  for (const r of [{ h: 360, b: 800 }, { h: 720, b: 2500 }, { h: 1080, b: 4500 }]) {
    await run('ffmpeg', ['-i', src, '-vf', \`scale=-2:\${r.h}\`, '-c:v', 'libx264', '-b:v', \`\${r.b}k\`, '-g', '96',
      '-hls_time', '4', '-hls_playlist_type', 'vod', \`/out/\${videoId}/\${r.h}p.m3u8\`]);
  }
  await writeMasterPlaylist(videoId); await db.none("UPDATE videos SET status='READY' WHERE id=$1", [videoId]);
}`},
  bottlenecks:['Encoding one piece after another makes long videos take hours', 'One machine is a single point of failure', 'The origin is overloaded when many viewers miss the CDN on a new popular video'],
  scaling:[['Encoding time', 'Encode pieces in parallel across a fleet'], ['Cost', 'Use cheap spot machines and hardware encoders'], ['Origin load', 'Add an origin shield layer, and warm the CDN before a planned premiere'], ['The long tail', 'Use several cache layers, and give only popular videos every codec']],
  improvements:['A size ladder and encoding settings chosen for each video or shot', 'Live streaming with low delay', 'DRM (copy protection) for premium content', 'Thumbnail strips for scrubbing'],
  failures:[['A transcoder crashes', 'The task is retried, and its output name makes the retry safe'], ['A CDN is down', 'Change the playlist links to another CDN'], ['An upload is corrupt', 'The check fails, the video is marked FAILED and the creator is told why']],
  observability:{metrics:['Time until a video is READY, p50 and p95', 'Task failure rate', 'Time to start playback and how often it pauses (measured in the player)', 'CDN hit ratio and traffic from the origin'], alerts:['Processing backlog over 30 minutes', 'More than 1% pausing in a region', 'A spike in traffic from the origin'], dash:'The upload pipeline, viewer quality by region and ISP, and CDN performance.'},
  review:['Processing is parallel and can be retried: ✓', 'Adaptive streaming goes through a CDN: ✓', 'Viewer quality is measured from the player: ✓', 'Next: encoding chosen per title and steering between CDNs'],
  refs:['case:youtube', 'case:netflix', 'l:transcoding-pipeline', 'l:live-streaming-abr']});
P({id:'p-mq', level:'advanced', icon:'📬', title:'Distributed message queue', tagline:'A partitioned, replicated log with consumer groups.', tags:['log', 'replication', 'partitions', 'consumer groups'],
  req:'<b>A small example.</b> An orders service publishes the message “order 42 paid” to a topic called <code>payments</code>. The topic has 6 partitions, and each partition is copied to 3 servers. A billing service and an email service each read the topic in their own group. If one server dies right after the message is confirmed, the message is not lost. A new service can replay last week’s messages from the start. Build this message queue.',
  fr:['Create topics with N partitions and a number of copies', 'Publish with a key, so messages with the same key stay in order', 'Consumer groups with offsets (their reading position) and rebalancing', 'Keep messages by time or size, and replay from an offset'],
  nfr:['No confirmed message is lost when one broker is down', 'Handle 1 GB a second for the cluster', 'A publish takes under 20 ms for 99 of 100 requests, even with acks=all (every copy confirms)', 'A failed leader is replaced automatically within seconds'],
  est:[['Messages', '1M a second × 1 KB = 1 GB a second', 'This is an assumption'], ['Retention', '7 days ≈ 600 TB, or ≈ 1.8 PB with 3 copies', '1 GB a second × 604,800 s ≈ 600 TB. Multiply by 3 copies'], ['Partitions', '≈ 3,000', 'Enough for parallel readers and an even spread. This is an assumption'], ['Brokers', '≈ 30', '3 GB a second of writes (1 GB × 3 copies) ÷ 30 brokers ≈ 100 MB a second each']],
  entities:{code:`-- Cluster metadata (managed by a Raft quorum of controllers)
-- topics(name, partitions, replication_factor, retention_ms)
-- partitions(topic, partition, leader_broker, replicas[], isr[], leader_epoch)
-- consumer_offsets(group, topic, partition, offset, committed_at)   -- itself stored in an internal compacted topic
-- On disk per partition: segment files 00000000000000123456.log + .index (offset → file position)`, notes:'Messages are stored in files that are only added to. The metadata is tiny and must be strongly consistent, so it uses Raft.'},
  apis:{list:[['Produce(topic, key, value, acks)', 'Returns the partition and offset'], ['Fetch(topic, partition, offset, maxBytes)', 'Read a batch of messages'], ['JoinGroup / SyncGroup / Heartbeat', 'Group membership and the split of partitions'], ['CommitOffset(group, tp, offset)', 'Save how far a group has read']], code:`// Leader append path (simplified)
async function append(tp: TopicPartition, batch: Record[], acks: 'all' | 1) {
  const base = log(tp).append(batch);                          // sequential write, page cache
  if (acks === 1) return { offset: base };
  await waitUntil(() => isr(tp).every(r => r.fetchedOffset > base + batch.length - 1), REPLICA_TIMEOUT_MS);
  highWatermark(tp).advanceTo(base + batch.length);           // visible to consumers only now
  return { offset: base };
}`},
  hld:{text:'Brokers hold the copies of each partition, and one copy is the leader. Producers write to the leader and the followers copy from it. A small controller group tracks the leaders and the copies that are up to date, and replaces a leader that fails. Consumers read by offset.',
    diagram:{n:[['p', 'client', 'Producers', '', 0, 1], ['b1', 'queue', 'Broker 1', 'P0 leader', 1, 0], ['b2', 'queue', 'Broker 2', 'P0 follower', 1, 2], ['ctl', 'service', 'Controllers', 'Raft', 2, 1], ['cg', 'service', 'Consumer group', '', 3, 0], ['off', 'db', 'Offsets topic', 'compacted', 3, 2]], e:'p>b1 b1>b2 ctl>b1 ctl>b2 cg>b1 cg>off', f:[['A producer appends to the partition leader; the follower replicates; then it is acknowledged.', 'p>b1:produce acks=all|b2>b1:fetch (replicate)'], ['Consumers fetch from the leader and commit offsets.', 'cg>b1:fetch @offset|cg>off:commit'], ['If broker 1 fails, the controller elects broker 2 (in sync) as leader.', 'ctl>b2:lead P0 (epoch 7)']]}},
  components:[['Brokers', 'Store the segment files, serve writes and reads, and copy data between them'], ['Controller group', 'Keeps the metadata, picks leaders and tracks the in-sync copies (ISR)'], ['Group coordinator', 'Tracks the members of a group and splits the partitions among them'], ['Client libraries', 'Choose partitions, batch messages, retry and use producer ids that make retries safe']],
  tech:[['Files that are only added to, plus the page cache', 'Sequential disk work and reads without extra copies'], ['Raft for the metadata', 'Leader choices that everyone agrees on'], ['A leader and followers, with an in-sync list (ISR)', 'Safe data, with latency you can tune'], ['Tiered storage', 'Cheap long retention in object storage']],
  tradeoffs:[['Order inside each partition', 'Scales out across many servers', 'There is no order across the whole topic'], ['acks=all', 'No confirmed message is lost', 'Higher delay'], ['Consumers pull messages', 'Consumers set their own pace and can replay easily', 'There is polling delay compared with push']],
  v1:{text:'Version 1 is a log on one node, with one file for each partition and an offset index in memory. Consumers poll by offset.', code:`class PartitionLog {
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
  bottlenecks:['One node means no protection from failure', 'Syncing the disk after every message limits speed', 'One partition for a topic caps how many consumers can work in parallel'],
  scaling:[['Failure protection', 'Copy each partition, and let the controllers pick a new leader'], ['Speed', 'Batch and compress messages, and rely on copies instead of a disk sync for every message'], ['Parallel readers', 'Use more partitions for each topic and split by a hash of the key'], ['Retention cost', 'Move old files to tiered storage']],
  improvements:['Idempotent producers and transactions (exactly-once inside the log)', 'Log compaction for topics that hold the latest state for each key', 'Place copies on different racks', 'A limit for each client'],
  failures:[['The leader broker dies', 'The controller picks an in-sync follower, and clients refresh the metadata'], ['A follower is slow', 'It is removed from the in-sync list and writes go on with the rest (min.insync.replicas is the lowest allowed)'], ['A consumer crashes', 'The group rebalances, partitions move to others and reading resumes from the saved offsets']],
  observability:{metrics:['Publish and fetch time', 'Partitions that are missing a copy', 'How far each group is behind', 'Disk use and the number of segment files'], alerts:['Partitions missing a copy for over 5 minutes', 'A group’s lag growing for 15 minutes', 'Disk over 80%'], dash:'Cluster health, the in-sync list and lag for each group.'},
  review:['A confirmed write survives a broker failure: ✓', 'Replay and consumer groups work: ✓', 'Order is kept for each key: ✓', 'Next: exactly-once transactions and tiered storage'],
  refs:['l:kafka', 'l:consensus-raft', 'pg:kafka', 'l:replication']});
P({id:'p-social-feed', level:'advanced', icon:'📰', title:'Social media feed', tagline:'Hybrid fan-out, ranking and counters for hundreds of millions.', tags:['fan-out', 'ranking', 'sharding', 'hot keys'],
  req:'<b>A small example.</b> Isha follows 150 friends and 3 famous accounts. She opens the app and sees a page of posts. Most come from a ready-made list for her. The posts from the famous accounts are added when she opens the app, so one big post does not cause millions of writes. The posts are sorted so the best come first, and the page opens in under 300 ms. Build this home feed for 500M daily users.',
  fr:['Post text and photos', 'Follow and unfollow', 'A home feed with pages and ranking', 'Counts of likes and comments'],
  nfr:['99 of 100 feeds load in under 300 ms', 'Posts reach followers within seconds', 'Survive viral posts and posts from celebrities', 'Keep the memory for timelines low'],
  est:[['Feed reads', '≈ 116K a second', '500M users × 20 opens a day = 10B. 10B ÷ 86,400 s ≈ 116,000'], ['Posts', '≈ 2,900 a second', '500M × 0.5 posts a day = 250M. 250M ÷ 86,400 s ≈ 2,900'], ['Timeline inserts (push)', '≈ 580K a second', '2,900 posts × 200 followers = 580,000'], ['Timeline memory', '≈ 3.2 TB', '500M users × 800 post ids × 8 bytes = 3.2 TB']],
  entities:{code:`CREATE TABLE posts (post_id BIGINT PRIMARY KEY, author_id BIGINT, body TEXT, media JSONB, created_at TIMESTAMPTZ);  -- sharded by author_id
CREATE TABLE follows (follower_id BIGINT, followee_id BIGINT, created_at TIMESTAMPTZ, PRIMARY KEY (follower_id, followee_id));
CREATE TABLE followers (followee_id BIGINT, follower_id BIGINT, PRIMARY KEY (followee_id, follower_id));             -- reverse index for fan-out
-- Redis: tl:{user} = list of post ids (cap 800); celeb:{author} = recent post ids
-- Counters: likes:{post} sharded counters, flushed periodically`, notes:'Post ids are made so that they sort by time. So combining timelines is just merging sorted lists of ids.'},
  apis:{list:[['POST /posts', 'Create a post'], ['GET /feed?cursor=', 'A ranked page of 20 posts'], ['POST /posts/{id}/like', 'A like that is safe to repeat'], ['POST /follow/{user}', 'Follow an account']], code:`async function onPost(post: Post) {
  const followers = await graph.followerCount(post.authorId);
  if (followers > CELEB_THRESHOLD) return redis.lpush(\`celeb:\${post.authorId}\`, post.id);   // pull at read time
  for await (const batch of graph.activeFollowers(post.authorId, 5000)) {
    const pipe = redis.pipeline(); batch.forEach(f => pipe.lpush(\`tl:\${f}\`, post.id).ltrim(\`tl:\${f}\`, 0, 799)); await pipe.exec();
  }
}`},
  hld:{text:'The feed uses both push and pull. Posts from normal accounts are pushed into their followers’ timelines. Posts from celebrities are pulled and merged when the feed is opened. A ranking service sorts the candidates, and counters are added up in the background.',
    diagram:{n:[['u', 'client', 'User', '', 0, 1], ['api', 'service', 'Feed API', '', 1, 1], ['tl', 'cache', 'Timelines', 'Redis lists', 2, 0], ['celeb', 'cache', 'Celebrity posts', '', 2, 2], ['rank', 'service', 'Ranker', 'ML', 3, 1], ['q', 'queue', 'Post events', '', 3, 0], ['fan', 'service', 'Fan-out workers', '', 4, 0], ['db', 'db', 'Posts + graph', 'sharded', 4, 2]], e:'u>api api>tl api>celeb api>rank q>fan fan>tl~-0.3 fan>db api>db~0.1 api>q~0.25', f:[['A post is published and fanned out to active followers’ timelines.', 'u>api:POST /posts|api>q|q>fan|fan>db:followers|fan>tl:push ids'], ['A feed read merges the timeline with celebrity posts and ranks them.', 'u>api:GET /feed|api>tl|api>celeb|api>rank']]}},
  components:[['Feed API', 'Collects candidates, adds the post details, ranks and cuts the pages'], ['Fan-out workers', 'Push post ids to the timelines of active followers'], ['Timeline cache', 'A list for each user, with a size limit'], ['Celebrity store', 'The recent posts of accounts with many followers'], ['Ranker', 'Gives each candidate a score'], ['Counter service', 'Adds up likes and comments']],
  tech:[['Redis Cluster', 'Timelines and counters'], ['Sharded Postgres or MySQL', 'Posts and the follow graph, split by user'], ['Kafka', 'Post and engagement events'], ['A feature store and a model server', 'Ranking']],
  tradeoffs:[['Push for normal accounts, pull for celebrities', 'Cheap reads, and no burst when a celebrity posts', 'Two code paths to keep up'], ['Timelines only for active users', 'Saves memory', 'Returning users cost a rebuild'], ['Approximate counters', 'No hot rows', 'Counts run a little behind']],
  v1:{text:'Version 1 builds the feed with a query: the latest posts from followed accounts, sorted by time. Each user’s result is cached for 30 s.', code:`app.get('/feed', auth, async (req, res) => {
  const cached = await redis.get(\`feed:\${req.user.id}\`); if (cached) return res.json(JSON.parse(cached));
  const rows = await db.query(\`SELECT p.* FROM posts p JOIN follows f ON f.followee_id = p.author_id
     WHERE f.follower_id = $1 ORDER BY p.post_id DESC LIMIT 50\`, [req.user.id]);
  await redis.set(\`feed:\${req.user.id}\`, JSON.stringify(rows.rows), 'EX', 30);
  res.json(rows.rows);
});`},
  bottlenecks:['The join of follows and posts grows too large as people follow more accounts and post more', 'Like counters become hot rows', 'Bursts of fan-out when a celebrity posts'],
  scaling:[['Read cost', 'Push posts into timelines when they are written'], ['Celebrity bursts', 'Pull celebrity posts when the feed is read, above a follower threshold'], ['Counters', 'Use sharded counters that are updated from events'], ['Memory', 'Keep timelines only for active users and limit their length']],
  improvements:['Recommended posts from accounts you do not follow', 'A “new posts” button that appears through push', 'Remove harmful posts before ranking', 'A way to run experiments on ranking'],
  failures:[['The timeline cache is lost', 'Build the feed at read time for active users, then rebuild the cache'], ['The ranker is down', 'Fall back to newest-first order'], ['The fan-out queue is behind', 'Posts appear late. Fresh posts go before the backlog']],
  observability:{metrics:['Feed time p99', 'How far behind fan-out is', 'How often a timeline is found in the cache', 'Ranking time and how often the fallback is used', 'Engagement for each session'], alerts:['Fan-out more than 60 s behind', 'Feed p99 above 500 ms', 'Fallback used more than 5% of the time'], dash:'Feed health, the fan-out pipeline and engagement.'},
  review:['A read is one list plus a small merge: ✓', 'The celebrity problem is handled: ✓', 'It falls back to newest-first order: ✓', 'Next: tune the threshold using the cost model in the Feed case'],
  refs:['case:feed', 'l:fan-out', 'pg:fanout']});
P({id:'p-payments', level:'advanced', icon:'💳', title:'Payment platform', tagline:'Charge cards and UPI, keep a ledger, pay out merchants, never lose a rupee.', tags:['idempotency', 'ledger', 'reconciliation', 'webhooks'],
  req:'<b>A small example.</b> Rahul pays ₹500 to an online shop by UPI. The shop is a merchant on this platform. The platform sends the payment to the bank. It writes two ledger entries: ₹500 out of Rahul’s side and ₹500 into the merchant’s balance. Then it tells the shop by webhook that it was paid. If Rahul’s phone retries, he is still charged once. The next morning the money is paid out to the shop’s bank account. Build this payment platform.',
  fr:['Create and confirm payments (card and UPI)', 'Refunds and disputes', 'Webhooks that tell merchants about payment events', 'Daily payouts to merchants', 'A merchant dashboard with balances'],
  nfr:['Money moves exactly once, even when requests are retried', 'The ledger always balances and can be fully audited', 'Creating a payment works 99.99% of the time', 'Keep the PCI-DSS scope (the card-data security rules) as small as possible'],
  est:[['Payments', '5M a day ≈ 58 a second, up to 500 at peak', '5,000,000 ÷ 86,400 s ≈ 58. The peak is an assumption'], ['Ledger entries', '≈ 40M a day', 'About 8 entries for each payment over its life: 5M × 8 = 40M'], ['Webhooks', '≈ 20M a day', 'About 4 events for each payment: 5M × 4'], ['Payouts', '200K merchants a day', 'This is an assumption']],
  entities:{code:`CREATE TABLE payments (
  id TEXT PRIMARY KEY, merchant_id BIGINT, amount_minor BIGINT, currency CHAR(3),
  method TEXT, status TEXT,        -- created | authorised | captured | failed | refunded
  idem_key TEXT, UNIQUE (merchant_id, idem_key)
);
CREATE TABLE ledger_entries (
  id BIGSERIAL PRIMARY KEY, txn_id TEXT NOT NULL, account TEXT NOT NULL,   -- merchant:42:pending, platform:fees, …
  amount_minor BIGINT NOT NULL, currency CHAR(3), created_at TIMESTAMPTZ DEFAULT now()
);  -- invariant: SUM(amount_minor) per txn_id = 0; never updated
CREATE TABLE webhook_deliveries (event_id TEXT, endpoint_id BIGINT, attempts INT, next_attempt_at TIMESTAMPTZ, status TEXT, PRIMARY KEY (event_id, endpoint_id));`, notes:'Card numbers never enter these tables. A separate vault turns them into tokens, which keeps the PCI scope small.'},
  apis:{list:[['POST /v1/payments', 'Send an Idempotency-Key header so a retry is safe'], ['POST /v1/payments/{id}/capture', 'Take the money for a payment that was authorised'], ['POST /v1/refunds', 'Refund (safe to retry)'], ['GET /v1/balance', 'Worked out from the ledger']], code:`async function capture(paymentId: string) {
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
  hld:{text:'The API is safe to retry. The card networks and UPI are called through adapters with timeouts and status checks. Every money movement is written to a ledger that is never edited, in the same transaction as the state change. Events trigger webhooks. A reconciliation job compares the ledger with the bank files.',
    diagram:{n:[['m', 'client', 'Merchant', '', 0, 1], ['api', 'service', 'Payments API', 'idempotent', 1, 1], ['vault', 'service', 'Card vault', 'tokenisation', 1, 0], ['proc', 'ext', 'Processors', 'cards · UPI', 2, 0], ['ledger', 'db', 'Ledger', 'double-entry', 2, 2], ['out', 'queue', 'Events', 'outbox', 3, 1], ['hooks', 'service', 'Webhooks', '', 4, 1], ['recon', 'service', 'Reconciliation', 'bank files', 3, 2]], e:'m>api api>vault api>proc api>ledger api>out out>hooks recon>ledger hooks>m~0.15', f:[['A payment is authorised through the processor and recorded in the ledger.', 'm>api:POST /payments|api>vault:token|api>proc:authorise|api>ledger:entries'], ['Events drive webhooks; reconciliation checks against bank files.', 'api>out|out>hooks|hooks>m:payment.captured|recon>ledger']]}},
  components:[['Payments API', 'Handles retries safely, runs the state machine and picks a processor'], ['Card vault', 'Turns card numbers into tokens, inside the PCI scope'], ['Processor adapters', 'Timeouts, retries and status checks for each network'], ['Ledger', 'Double-entry records that are never edited'], ['Webhook service', 'Sends signed events and retries them'], ['Settlement', 'Daily payouts and reconciliation']],
  tech:[['Postgres (serializable transactions for the ledger)', 'Strong rules that always hold'], ['Kafka with an outbox', 'Events that are not lost'], ['A vault backed by an HSM', 'Safe storage for card data'], ['A workflow tool such as Temporal', 'Settlements and disputes that take a long time']],
  tradeoffs:[['A ledger that is never edited', 'Easy to audit', 'A correction is a new entry'], ['Authorise during the request', 'The merchant gets an answer at once', 'Time depends on the networks'], ['A separate vault', 'Shrinks the PCI scope', 'One extra hop']],
  v1:{text:'Version 1 has a payments table, retry safety and one processor. Balances are columns that are updated in the same transaction.', code:`app.post('/v1/payments', merchantAuth, async (req, res) => {
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
  bottlenecks:['Processor timeouts leave payments in an unknown state', 'Many payments update one balance column at once (a very busy merchant)', 'Webhook retries overwhelm a slow merchant server'],
  scaling:[['Unknown states', 'Mark the payment PENDING and let workers check its status. Never retry with a new id'], ['Busy merchants', 'Only add ledger entries. Work out balances later in the background, or split into sub-accounts'], ['Webhooks', 'Use a queue for each endpoint, with backoff and circuit breakers'], ['Database growth', 'Split the ledger by month and archive old months']],
  improvements:['Smart routing across processors by success rate and cost', 'Fraud scoring', 'Several currencies, with exchange-rate entries', 'Instant payouts'],
  failures:[['A processor is down', 'Send new payments to a second processor. Pending ones are resolved later'], ['The ledger does not balance', 'Stop payouts for the affected accounts and investigate'], ['A merchant’s server is down', 'Retry webhooks for days, and offer an events API so the merchant can catch up']],
  observability:{metrics:['Authorisation rate for each processor and method', 'Pending payments by age', 'Results of the ledger balance check', 'Webhook success rate'], alerts:['Authorisation rate drops by more than 5 points', 'A payment pending for over 1 hour', 'Any ledger imbalance'], dash:'Money flow: volume, success, pending payments and settlements.'},
  review:['Every change to money is safe to retry: ✓', 'The ledger rule is enforced and checked: ✓', 'Unknown states are resolved and never guessed: ✓', 'Next: smart routing and currency exchange'],
  refs:['case:stripe', 'case:upi', 'l:saga-outbox', 'l:idempotency-rate-limit-headers']});
P({id:'p-job-scheduler', level:'advanced', icon:'⏰', title:'Distributed job scheduler', tagline:'Millions of cron jobs and delayed tasks, run on time, once.', tags:['scheduling', 'leases', 'partitioning', 'workflows'],
  req:'<b>A small example.</b> A team sets a job that calls their web address at 9:00 every morning in India time. Another team sets a one-off job to run in 3 hours. At 9:00:00 the scheduler fires the first job once, even if one of its servers has just died. If the call fails, it tries again later and alerts the team after a few failures. Build this scheduler for thousands of teams.',
  fr:['Register cron jobs and one-off jobs, with time zones', 'Run them by calling a web address or putting a message on a queue, with timeouts', 'Retry with a growing wait and alert on failures', 'Run history and manual re-runs'],
  nfr:['Fire within 5 s of the due time', 'No run is lost if a node dies. Duplicates are rare and can be detected', '10M jobs, with 50K due in the same second at midnight', 'Tenants are kept apart, so one cannot starve the others'],
  est:[['Jobs', '10M', 'This is an assumption'], ['Runs', '50M a day ≈ 580 a second, up to 50K in a burst', '50,000,000 ÷ 86,400 s ≈ 580. The burst is the midnight peak'], ['History', '≈ 18B rows a year', '50M runs × 365 days ≈ 18B. Keep 30 days in fast storage'], ['Scheduler nodes', '≈ 20', 'Enough to share the partitions and survive losing a few. This is an assumption']],
  entities:{code:`CREATE TABLE jobs (
  id BIGINT PRIMARY KEY, tenant_id BIGINT, partition SMALLINT NOT NULL,   -- hash(id) % 1024
  schedule TEXT,                 -- cron expression, or NULL for one-off
  tz TEXT NOT NULL, target JSONB NOT NULL,
  next_run_at TIMESTAMPTZ NOT NULL, lease_owner TEXT, lease_until TIMESTAMPTZ,
  enabled BOOLEAN DEFAULT true
);
CREATE INDEX due ON jobs (partition, next_run_at) WHERE enabled;
CREATE TABLE runs (job_id BIGINT, run_id UUID, scheduled_for TIMESTAMPTZ, status TEXT, attempts INT, finished_at TIMESTAMPTZ, PRIMARY KEY (job_id, scheduled_for));`, notes:'The pair (job_id, scheduled_for) is unique, so one run can never be recorded twice, even if two nodes race.'},
  apis:{list:[['POST /jobs', 'Create a job'], ['PATCH /jobs/{id}', 'Pause, resume or change the schedule'], ['GET /jobs/{id}/runs', 'The run history'], ['POST /jobs/{id}/run', 'Run it now']], code:`async function pollPartition(p: number) {
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
  hld:{text:'Jobs are split into partitions. Each scheduler node owns some partitions through leases. It claims the jobs that are due, records the run, puts it on a queue and works out the next time. Executor workers call the targets, with a limit on how many each tenant can run at once.',
    diagram:{n:[['t', 'client', 'Tenant', '', 0, 1], ['api', 'service', 'Jobs API', '', 1, 1], ['db', 'db', 'Jobs DB', 'partitioned', 2, 1], ['sch', 'service', 'Schedulers', 'own partitions', 2, 0], ['q', 'queue', 'Run queue', 'per-tenant fairness', 3, 0], ['ex', 'service', 'Executors', 'timeouts, retries', 4, 0], ['tgt', 'ext', 'Targets', 'webhooks, queues', 4, 2]], e:'t>api api>db sch>db sch>q q>ex ex>tgt ex>db~-0.1', f:[['Schedulers claim due jobs in their partitions and enqueue occurrences.', 'sch>db:claim due|sch>q:run job 81 @00:00'], ['Executors call targets with the run id and record results.', 'q>ex|ex>tgt:POST (run id)|ex>db:SUCCEEDED']]}},
  components:[['Jobs API', 'Create, change and delete jobs, and read the schedules'], ['Schedulers', 'Own partitions, claim due jobs and work out the next time'], ['Run queue', 'Holds a burst of runs and shares them fairly between tenants'], ['Executors', 'Make the HTTP or queue calls, with timeouts, retries and history'], ['Alerting', 'Tells owners after repeated failures']],
  tech:[['Postgres with SKIP LOCKED', 'A simple and safe way to claim jobs'], ['Partition leases in etcd or ZooKeeper', 'An even split, and takeover on failure'], ['Kafka or SQS', 'Holds bursts'], ['A cron library that knows time zones', 'Correct handling of daylight saving time']],
  tradeoffs:[['Polling the database', 'Simple and durable', 'Polling adds load, and timing is accurate only to a few seconds'], ['Run at least once', 'No lost runs', 'Targets must handle a repeat, using the run id'], ['A fair share for each tenant', 'No noisy neighbours', 'Some jobs wait during a burst']],
  v1:{text:'Version 1 is one node with a timing wheel in memory. It loads the jobs from the database at start-up and refreshes when they change.', code:`const wheel = new Map<number, number[]>();       // second → job ids
async function load() { for (const j of await db.any('SELECT id, next_run_at FROM jobs WHERE enabled')) add(j.id, +j.next_run_at); }
const add = (id: number, at: number) => { const s = Math.floor(at / 1000); (wheel.get(s) ?? wheel.set(s, []).get(s)!).push(id); };
setInterval(async () => {
  const s = Math.floor(Date.now() / 1000), ids = wheel.get(s) ?? []; wheel.delete(s);
  for (const id of ids) { const j = await jobs.get(id); runQueue.send({ jobId: id }); add(id, nextAfter(j.schedule, j.tz, Date.now())); }
}, 1000);`},
  bottlenecks:['One node means a restart misses the runs that fall during the downtime', 'The 50K jobs at midnight overwhelm the executors', 'One tenant’s slow web addresses hold every executor slot'],
  scaling:[['Availability', 'Split the schedulers into partitions with leases, and catch up missed runs when a node takes over'], ['Bursts', 'Use a queue and add executors as it grows. Spread start times with a little random delay if allowed'], ['Noisy tenants', 'Limit how many runs each tenant can do at once, with a queue for each tenant'], ['History size', 'Split the runs table by day and drop old parts']],
  improvements:['Workflows: jobs that depend on other jobs', 'Policies for missed runs: skip, run once or run all', 'Reports on how well each job meets its schedule', 'Pause everything during an incident'],
  failures:[['A scheduler node dies', 'Its lease expires, another node takes its partitions and fires the overdue jobs'], ['The target is down', 'Retry with a growing wait, and alert after N failures'], ['The database fails over', 'Scheduling pauses briefly, and overdue jobs fire when it recovers']],
  observability:{metrics:['Fire delay (actual time minus due time), p99', 'Runs by status', 'Queue length for each tenant', 'Changes in who owns a partition'], alerts:['Fire delay p99 above 30 s', 'A partition with no owner', 'A spike in failures for one tenant'], dash:'Due against fired, delays and failures for each tenant.'},
  review:['No run is lost, because each run has one unique row: ✓', 'Scheduling is split and survives a node failure: ✓', 'Tenants get a fair share: ✓', 'Next: workflows with dependencies'],
  refs:['l:workflow-orchestration', 'l:distributed-locks', 'l:delivery-semantics']});
P({id:'p-saas', level:'advanced', icon:'🏢', title:'Multi-tenant SaaS platform', tagline:'One product, thousands of companies, strict isolation and fair performance.', tags:['multi-tenancy', 'isolation', 'sharding', 'noisy neighbours'],
  req:'<b>A small example.</b> A helpdesk app serves two companies: a bakery with 5 users and a bank with 50,000 users. The bakery’s staff must never see a single bank ticket. When the bank runs a huge report, the bakery’s pages must stay fast. The bank also wants its data stored in its own country on its own servers. Build the platform for thousands of companies like these.',
  fr:['Sign up a company and set it up', 'Users, roles and single sign-on for each company', 'Data and APIs that belong to one company', 'Billing by usage and plan limits', 'Export and deletion of a company’s data'],
  nfr:['No data ever leaks between companies', 'A p99 time goal (SLO) for each plan tier', 'Large tenants are kept apart, in cells or on their own shards', 'Some tenants need their data kept in one region'],
  est:[['Tenants', '20K, and the top 1% hold 40% of the data', 'This is an assumption'], ['Users', '2M', '20K tenants × about 100 users'], ['Requests', '20K a second at peak', 'This is an assumption'], ['Data', '≈ 50 TB', 'Tickets in the database and attachments in object storage']],
  entities:{code:`CREATE TABLE tenants (id BIGINT PRIMARY KEY, name TEXT, plan TEXT, region TEXT, cell TEXT, status TEXT);
CREATE TABLE users (tenant_id BIGINT, id BIGINT, email CITEXT, role TEXT, PRIMARY KEY (tenant_id, id));
CREATE TABLE tickets (
  tenant_id BIGINT NOT NULL, id BIGINT NOT NULL, subject TEXT, status TEXT, assignee BIGINT, created_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id)
);
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tickets USING (tenant_id = current_setting('app.tenant_id')::bigint);`, notes:'tenant_id comes first in every key. Row-level security in the database enforces it as a second line of defence behind the checks in the app.'},
  apis:{list:[['POST /tenants', 'Set up a new tenant in a cell'], ['GET /api/tickets', 'The tenant comes from the token, never from the request body'], ['GET /admin/tenants/{id}/usage', 'Usage for billing'], ['POST /tenants/{id}/export', 'Export the data in the background']], code:`app.use(async (req, res, next) => {
  const claims = verifyJwt(req.get('authorization'));             // tenant comes from the token
  req.tenant = await tenants.get(claims.tid);
  if (req.tenant.cell !== THIS_CELL) return res.redirect(307, cellUrl(req.tenant.cell, req.originalUrl));
  req.db = await pool.connect();
  await req.db.query("SELECT set_config('app.tenant_id', $1, true)", [String(req.tenant.id)]);   // RLS scope for this transaction
  res.on('finish', () => req.db.release());
  next();
});`},
  hld:{text:'A global control plane handles sign-up, routing and billing. Tenants live in cells, which are independent stacks with their own databases. A router sends each request to the tenant’s cell. Inside a cell, data is keyed by tenant id and protected with it.',
    diagram:{n:[['u', 'client', 'Tenant user', '', 0, 1], ['router', 'lb', 'Cell router', 'tenant → cell', 1, 1], ['ctl', 'service', 'Control plane', 'sign-up, billing', 1, 0], ['dir', 'db', 'Tenant directory', '', 2, 0], ['c1', 'service', 'Cell A', 'shared, small tenants', 2, 1], ['c2', 'service', 'Cell B', 'enterprise', 2, 2], ['db1', 'db', 'Cell A DB', 'RLS', 3, 1], ['db2', 'db', 'Cell B DB', 'dedicated', 3, 2]], e:'u>router router>dir router>c1 router>c2 ctl>dir c1>db1 c2>db2', f:[['A request is routed to the tenant’s cell using the directory.', 'u>router:acme.helpdesk.app|router>dir:acme → cell A|router>c1'], ['The cell sets the tenant context and queries its database under row-level security.', 'c1>db1:SET app.tenant_id']]}},
  components:[['Control plane', 'Tenant life cycle, plans, billing and placement'], ['Tenant directory', 'Maps each tenant to a cell and region'], ['Cell router', 'Sends requests by subdomain or token'], ['Cells', 'Full copies of the application with their own data stores'], ['Usage metering', 'Turns usage events into bills']],
  tech:[['Postgres with row-level security (RLS)', 'A second layer of protection for shared tables'], ['Cell architecture', 'A failure stays inside one cell'], ['Limits and quotas for each tenant', 'Protect against a noisy neighbour'], ['Infrastructure as code', 'Builds new cells the same way every time']],
  tradeoffs:[['Shared tables with RLS (a pool)', 'Cheap and efficient', 'Noisy neighbours, and isolation needs great care'], ['A database for each tenant (a silo)', 'Strong isolation, easy export and delete', 'Hard to run for thousands of tenants'], ['Cells', 'A failure reaches fewer tenants', 'Features that cross cells and migrations are harder']],
  v1:{text:'Version 1 is one application and one database. Every table has a tenant_id, and a repository layer adds the tenant filter to every query.', code:`class TicketRepo {
  constructor(private db: Db, private tenantId: number) {}
  list(status?: string) {
    return this.db.any('SELECT * FROM tickets WHERE tenant_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY created_at DESC LIMIT 50',
      [this.tenantId, status ?? null]);                       // tenant filter can’t be forgotten: it’s in the constructor
  }
}`},
  bottlenecks:['One huge tenant’s reports slow everyone down', 'A bug that forgets the tenant filter leaks data', 'Schema changes lock the shared database'],
  scaling:[['Noisy neighbours', 'Set quotas for each tenant, and move large tenants to their own shard or cell'], ['Leak risk', 'Use row-level security, and tests that check every query for the tenant filter'], ['Growth', 'Add new cells instead of making databases bigger'], ['Data residency', 'Run cells in each region and place tenants by their setting']],
  improvements:['Encryption keys that each tenant owns (BYOK)', 'Let tenants move themselves between cells', 'Feature flags for each tenant', 'Analytics on usage-based pricing'],
  failures:[['A cell fails', 'Only its tenants are affected. Show a status page for each cell'], ['The directory is unavailable', 'Routers keep the mappings in a cache. New sign-ups pause'], ['A bad migration', 'Roll it out one cell at a time and stop at the first failure']],
  observability:{metrics:['Time and errors for each tenant and cell', 'The top tenants by resource use', 'Requests rejected by quotas', 'RLS policy violations (should be 0)'], alerts:['A tenant using its error budget too fast', 'A cell’s error rate', 'Any attempt to reach another tenant’s data'], dash:'An overview of cells, noisy tenants and goals by tier.'},
  review:['Isolation is enforced in the code and in the database: ✓', 'A failure is limited to one cell: ✓', 'Fair sharing through quotas: ✓', 'Next: BYOK and automatic tenant moves'],
  refs:['l:multi-tenancy', 'l:zero-trust-tenancy', 'l:bulkhead-fallback', 'l:rbac-abac']});
P({id:'p-analytics', level:'advanced', icon:'📊', title:'Real-time analytics', tagline:'Events in, live dashboards out, in seconds.', tags:['streaming', 'olap', 'windows', 'exactly-once'],
  req:'<b>A small example.</b> A shop adds a few lines of code to its app. Every page view, click and purchase is sent as an event. Within 10 seconds, the owner’s dashboard shows 1,204 people online and ₹48,000 of sales in the last 15 minutes. Next month, the owner asks how many visitors who added to the cart went on to buy. That question scans three months of history in a few seconds. Build this analytics platform.',
  fr:['Collect events from web, mobile and server SDKs', 'Live dashboards (the last 15 minutes, for each minute)', 'Funnels and retention over history', 'Ad-hoc filters by properties'],
  nfr:['Take in 1M events a second', 'Dashboards are less than 10 s old', 'Ad-hoc queries over 90 days finish in seconds', 'Retries never count an event twice'],
  est:[['Events', '1M a second at peak, 30B a day', 'This is an assumption. 30B ÷ 86,400 s ≈ 350K a second on average'], ['Raw size', '≈ 15 TB a day', '30B events × 500 bytes = 15 TB'], ['Compressed in columns', '≈ 2 TB a day', 'About 8 times smaller: 15 TB ÷ 8 ≈ 1.9 TB'], ['Distinct users', '100M', 'Counted approximately with a HyperLogLog (HLL)']],
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
-- Pre-aggregations: per-minute counts and HLL sketches per (project, name)`, notes:'ReplacingMergeTree, keyed by event_id, removes duplicate events from retries when parts are merged. Queries can also remove duplicates on their own.'},
  apis:{list:[['POST /collect', 'A batch of events, each with an event_id'], ['GET /api/metrics?metric=active_users&window=15m', 'A live metric'], ['POST /api/query', 'A funnel, retention or ad-hoc query']], code:`app.post('/collect', async (req, res) => {
  const { project_key, events } = req.body;                       // batched by SDK, gzip
  const project = await projects.byKey(project_key); if (!project) return res.status(401).end();
  const valid = events.filter(isValidEvent).map(e => ({ ...e, project_id: project.id, received_at: Date.now() }));
  await kafka.send({ topic: 'events', messages: valid.map(e => ({ key: e.user_id, value: JSON.stringify(e) })) });
  res.status(202).end();                                          // SDK retries on failure, same event_ids
});`},
  hld:{text:'A thin collector writes events to Kafka. A stream processor keeps a count for each minute, for the live dashboards. A loader writes the raw events into a columnar OLAP store for ad-hoc and historical queries.',
    diagram:{n:[['sdk', 'client', 'SDKs', 'batched events', 0, 1], ['col', 'service', 'Collectors', 'validate', 1, 1], ['k', 'queue', 'Kafka', 'events', 2, 1], ['sp', 'service', 'Stream processor', 'windows + HLL', 3, 0], ['live', 'cache', 'Live store', 'per-minute', 4, 0], ['load', 'service', 'Loader', 'batches', 3, 2], ['olap', 'db', 'Columnar OLAP', 'history', 4, 2], ['ui', 'client', 'Dashboards', '', 4, 1]], e:'sdk>col col>k k>sp sp>live k>load load>olap ui>live ui>olap', f:[['Events are collected and appended to Kafka.', 'sdk>col:batch of 50|col>k'], ['The stream processor updates per-minute aggregates for live dashboards.', 'k>sp|sp>live:active users 10:42'], ['The loader writes raw events into the columnar store for ad-hoc queries.', 'k>load|load>olap|ui>olap:funnel 30d']]}},
  components:[['SDKs', 'Batch events, retry with event ids and buffer when offline'], ['Collectors', 'Check who is sending, validate and add details such as place and device'], ['Stream processor', 'Counts in time windows, counts unique users (HLL) and raises alerts'], ['Columnar store', 'History and ad-hoc analysis'], ['Query API', 'Ready-made queries for funnels, retention and segments']],
  tech:[['Kafka', 'Holds events and lets them be replayed'], ['Flink or Kafka Streams', 'Time windows based on when the event happened'], ['ClickHouse, Druid or Pinot', 'Fast sums and counts over columns'], ['HyperLogLog', 'An approximate count of distinct users']],
  tradeoffs:[['Pre-built counts for live views', 'Dashboards are instant', 'Only the metrics you defined are live'], ['A columnar store for raw events', 'Flexible ad-hoc queries', 'Storage and compute cost'], ['Approximate unique counts', 'Cheap', 'About 1% error']],
  v1:{text:'Version 1 inserts events in batches into Postgres, split by day. Dashboards use SQL with a materialised view that is refreshed every minute.', code:`const buffer: Event[] = [];
export function track(e: Event) { buffer.push(e); if (buffer.length >= 1000) flush(); }
async function flush() {
  const batch = buffer.splice(0);
  await db.none(pgp.helpers.insert(batch, ['event_id', 'project_id', 'ts', 'user_id', 'name', 'props'], 'events') + ' ON CONFLICT (event_id) DO NOTHING');
}
setInterval(flush, 1000);
setInterval(() => db.none('REFRESH MATERIALIZED VIEW CONCURRENTLY minute_counts'), 60_000);`},
  bottlenecks:['Adding up billions of rows in a row store is slow', 'Counting unique users needs very large sets', 'Spikes in events overwhelm direct inserts into the database'],
  scaling:[['Speed of sums', 'Use a columnar OLAP store with sort keys and partitions'], ['Unique users', 'Keep an HLL sketch for each time window and merge them for longer ranges'], ['Spikes', 'Let Kafka absorb them, and load in batches'], ['Busy projects', 'Split by project and time, and set limits for each project']],
  improvements:['Rebuild sessions from events', 'Alerts when a metric looks unusual', 'Privacy: consent, removing personal data and deleting by user id', 'Sampling for very large projects'],
  failures:[['The OLAP cluster is slow', 'Live dashboards are still served by the stream path'], ['The stream processor restarts', 'It resumes from its checkpoints, and writes each result exactly once'], ['A collector is overloaded', 'SDKs keep events and retry with a growing wait']],
  observability:{metrics:['Ingest rate and the reasons events are rejected', 'End-to-end freshness', 'How far behind Kafka readers are', 'Query time p95'], alerts:['Freshness worse than 60 s', 'Lag keeps growing', 'A spike in ingest errors'], dash:'Pipeline freshness, volume for each project and query speed.'},
  review:['Live and historical data use separate paths: ✓', 'Duplicates are removed by event id: ✓', 'Kafka absorbs spikes: ✓', 'Next: privacy tools and detecting unusual metrics'],
  refs:['l:batch-vs-stream', 'l:lambda-kappa', 'l:oltp-olap', 'l:hll-cms']});
P({id:'p-global-storage', level:'advanced', icon:'🌐', title:'Global file storage', tagline:'Exabyte-scale object storage across regions with 11 nines durability.', tags:['erasure coding', 'metadata', 'replication', 'consistency'],
  req:'<b>A small example.</b> A photo app saves a 3 MB picture as <code>photos/maya/beach.jpg</code> in a bucket. A second later, anyone who asks for it gets the new picture, not an old one. A disk fails in the data center the same night, and nothing is lost, because the picture was stored in pieces across many disks. A copy is also kept in another region. Build this object store, like S3, for exabytes of data.',
  fr:['Create, read and delete buckets and objects, and LIST by prefix', 'Multipart uploads up to 5 TB', 'Versioning', 'Copies in other regions and cheaper tiers for old data'],
  nfr:['Durability of 99.999999999% (11 nines)', 'Read-after-write is strongly consistent for objects', 'Speed grows as more clients are added', 'The cost for each GB is as low as possible'],
  est:[['Objects', '1 trillion', 'This is an assumption'], ['Data', '≈ 1 EB', '1 trillion objects × about 1 MB each = 10¹⁸ bytes = 1 EB'], ['Requests', '10M a second', 'Mostly GETs. This is an assumption'], ['Disk failures', '≈ 100 a day', 'With 1M disks and about 4% failing each year: 40,000 ÷ 365 ≈ 110 a day']],
  entities:{code:`-- Metadata (sharded, strongly consistent; e.g. Raft groups by key range)
-- objects(bucket, key, version_id, size, etag, created_at, storage_class, placement[], deleted)
--   PRIMARY KEY (bucket, key, version_id DESC)
-- placement: list of (chunk_id, stripe: 10 data + 4 parity fragments on 14 disks in different racks/zones)
-- Data plane: chunk servers store immutable fragments; a repair service re-creates lost fragments`, notes:'The core idea is to keep metadata and data apart. Metadata is small and must be strongly consistent. Data is huge, never changes and is erasure-coded.'},
  apis:{list:[['PUT /{bucket}/{key}', 'Upload an object (or a part of one)'], ['GET /{bucket}/{key}', 'Download it. Reading only a byte range is allowed'], ['GET /{bucket}?prefix=&continuation=', 'LIST the objects'], ['DELETE /{bucket}/{key}', 'Delete, or add a delete marker']], code:`async function putObject(bucket: string, key: string, body: Readable) {
  const chunks = [];
  for await (const chunk of chunkStream(body, 64 * 2 ** 20)) {           // 64 MB chunks
    const fragments = erasureEncode(chunk, { data: 10, parity: 4 });     // survive loss of any 4
    const disks = placement.pick(14, { distinctRacks: true, zones: 3 });
    await Promise.all(fragments.map((f, i) => chunkServer(disks[i]).write(f)));
    chunks.push({ id: hash(chunk), disks });
  }
  await metadata.commit(bucket, key, { versionId: newVersion(), chunks });   // object becomes visible atomically here
}`},
  hld:{text:'Front-end servers check who you are and stream the data. Each object is cut into chunks, erasure-coded and spread across racks and zones. A strongly consistent metadata service maps each key to its chunks. Background services repair damage, rebalance, move data between tiers and copy it across regions.',
    diagram:{n:[['c', 'client', 'Clients', '', 0, 1], ['fe', 'lb', 'Front ends', 'auth · streaming', 1, 1], ['meta', 'db', 'Metadata', 'Raft-sharded', 2, 0], ['cs', 'db', 'Chunk servers', 'erasure-coded', 2, 2], ['rep', 'service', 'Repair', 'rebuild fragments', 3, 2], ['xr', 'service', 'Cross-region', 'replication', 3, 0], ['r2', 'db', 'Other region', '', 4, 1]], e:'c>fe fe>meta fe>cs rep>cs rep>meta xr>meta xr>r2', f:[['A PUT streams chunks to chunk servers (erasure-coded), then commits metadata.', 'c>fe:PUT|fe>cs:14 fragments per chunk|fe>meta:commit version'], ['Background repair restores fragments on failed disks; replication copies to another region.', 'rep>cs:rebuild|xr>r2:copy object']]}},
  components:[['Front ends', 'Check who you are, route requests, stream data and assemble multipart uploads'], ['Metadata service', 'Keeps keys, versions and where chunks are. Strongly consistent'], ['Chunk servers', 'Store fragments that never change, with checksums'], ['Repair service', 'Finds lost fragments and rebuilds them'], ['Lifecycle and replication', 'Moves data between tiers, expires it and copies it to other regions']],
  tech:[['Reed-Solomon erasure coding', 'Uses 1.4 times the space instead of 3 times for plain copies'], ['Metadata split into shards with Raft', 'Strong consistency'], ['Checksums everywhere, plus regular scrubbing', 'Catch damage that happens silently'], ['Spreading pieces across racks and zones', 'Survives failures that hit many disks at once']],
  tradeoffs:[['Erasure coding', 'Cheap durability', 'Reading after a failure costs extra work to rebuild the data'], ['Strongly consistent metadata', 'A read always sees the latest write', 'Metadata becomes the part that is hardest to scale'], ['Copy to other regions later', 'Fast writes', 'The other region can be seconds or minutes behind']],
  v1:{text:'Version 1 has one metadata database and files copied 3 times across three servers.', code:`async function put(bucket: string, key: string, data: Buffer) {
  const id = randomUUID(), servers = pickThree();
  await Promise.all(servers.map(s => s.write(id, data, sha256(data))));            // all three must succeed
  await db.none('INSERT INTO objects(bucket, key, blob_id, servers, size) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (bucket, key) DO UPDATE SET blob_id=$3, servers=$4, size=$5',
    [bucket, key, id, servers.map(s => s.id), data.length]);
}`},
  bottlenecks:['3 copies cost 3 times the storage', 'One metadata database limits how many objects and requests you can have', 'LIST on very large buckets is slow'],
  scaling:[['Storage cost', 'Use erasure coding for warm and cold data'], ['Metadata size', 'Split by bucket and key range, and split ranges that get hot'], ['LIST', 'Keep keys in order and return them in pages with a continuation token'], ['Hot objects', 'Put a cache or CDN in front of popular reads']],
  improvements:['Object lock (write once, read many) for compliance', 'Events when an object changes', 'Moving objects between tiers by how they are used', 'Filtering inside the store, like S3 Select'],
  failures:[['A disk dies', 'The repair service rebuilds the fragments from the remaining 10 of 14'], ['A rack or zone is lost', 'Placement makes sure enough fragments survive'], ['A metadata shard leader dies', 'Raft picks a new leader. Writes to that key range pause briefly']],
  observability:{metrics:['Durability risk: fragments that are missing', 'Repair backlog and speed', 'Request time for each kind of call', 'Which metadata shards are hot'], alerts:['Any stripe below the safety margin', 'The repair backlog keeps growing', 'The rate of checksum mismatches'], dash:'Durability health, request speed and capacity.'},
  review:['Durability comes from erasure coding, placement and repair: ✓', 'A metadata commit makes an object visible all at once: ✓', 'It scales by splitting metadata and adding chunk servers: ✓', 'Next: compliance features and smart tiering'],
  refs:['l:storage-types', 'l:replication', 'l:consensus-raft', 'case:dropbox']});
P({id:'p-search', level:'advanced', icon:'🔍', title:'Large-scale search engine', tagline:'Index billions of documents and answer in milliseconds.', tags:['inverted index', 'sharding', 'ranking', 'freshness'],
  req:'<b>A small example.</b> A reader types “vegan lasagna recipe” on a site with 1 billion documents. The page returns the 10 best matches in under 200 ms, filtered by “under 30 minutes”. The reader makes a typo, “lasagnna”, and still finds the right pages. A recipe published 30 seconds ago shows up too. Build this search for 20K queries a second.',
  fr:['Add and update documents in the index', 'Keyword search with filters and counts for each filter', 'Ranking by relevance and business signals', 'Autocomplete and spelling suggestions'],
  nfr:['99 of 100 queries finish in under 200 ms', 'New documents are searchable within 1 minute', 'Node failures do not drop queries', 'The index can be rebuilt with no downtime'],
  est:[['Documents', '1B × 5 KB of text = 5 TB', 'This is an assumption'], ['Index size', '≈ 2 TB when compressed', 'About 40% of the text size: 5 TB × 0.4 = 2 TB'], ['Queries', '20K a second', 'This is an assumption'], ['Updates', '5K a second', 'New and changed documents. This is an assumption']],
  entities:{code:`-- Source of truth (any DB) → indexing pipeline → search index
-- Index mapping (conceptual):
--   doc: {id, title (text, boosted ×3), body (text), tags (keyword), lang, created_at (date), popularity (float)}
-- Inverted index per shard: term → postings [(doc_id, tf, positions)], compressed (delta + varint)
-- Doc-values (columnar) per shard for filters, sorting and facets`, notes:'Each shard is a small, complete search engine over its own slice of the documents (this is called document partitioning).'},
  apis:{list:[['GET /search?q=&filters=&page=', 'Ranked results with filter counts'], ['PUT /docs/{id}', 'Add or update a document (in the background)'], ['GET /suggest?q=', 'Autocomplete']], code:`async function search(q: string, filters: Filters, k = 20) {
  const plan = parse(q);                                         // terms, phrases, spelling-corrected variants
  const shards = cluster.shardsFor(filters);                     // all shards, or a routing subset
  const partial = await Promise.all(shards.map(s =>
    withDeadline(s.replicaPick().topK(plan, filters, k), 120).catch(() => [])));   // partial results beat timeouts
  return rerank(mergeTopK(partial.flat(), k), q);                // second-stage ranker on the top candidates
}`},
  hld:{text:'Documents flow from the source of truth through an indexing pipeline into shards that hold slices of the documents, each with copies. A query goes to every shard and the best results are gathered. A reranker applies a heavier relevance model to the top results. A small real-time index holds the newest documents.',
    diagram:{n:[['u', 'client', 'User', '', 0, 1], ['qs', 'service', 'Query service', 'parse · merge', 1, 1], ['s1', 'db', 'Shard 1..N', '×2 replicas', 2, 0], ['rt', 'db', 'Real-time index', 'last hour', 2, 2], ['rr', 'service', 'Reranker', 'ML', 3, 1], ['src', 'db', 'Source DB', '', 4, 2], ['ix', 'service', 'Indexers', 'CDC → index', 3, 2]], e:'u>qs qs>s1 qs>rt qs>rr src>ix ix>rt ix>s1~-0.35', f:[['A query scatters to all shards and the real-time index; top results merge.', 'u>qs:q|qs>s1:top 20 each|qs>rt'], ['A reranker reorders the top candidates.', 'qs>rr:rerank 200'], ['Document changes are indexed into the real-time tier first, then merged into shards.', 'src>ix:CDC|ix>rt|ix>s1:periodic merge']]}},
  components:[['Indexing pipeline', 'Reads changes, analyses the text and builds documents'], ['Shards', 'Hold the inverted index and doc values, and find the local top results'], ['Query service', 'Parses the query, fixes spelling, sends it to shards and enforces deadlines'], ['Reranker', 'Reorders the top candidates with a learning-to-rank model'], ['Real-time index', 'Holds fresh documents until they are merged in']],
  tech:[['Elasticsearch or OpenSearch, or a custom Lucene engine', 'A proven inverted index'], ['BM25 plus learning to rank', 'Strong relevance'], ['Kafka CDC', 'Index updates that are not lost'], ['Hedged requests (send a second request if one is slow)', 'Tame the slowest responses']],
  tradeoffs:[['Split by document', 'Each shard works on its own, and scaling is easy', 'Every query visits every shard'], ['Two-stage ranking', 'Costly models run only on the top results', 'The first stage limits what can be found'], ['A real-time layer', 'Fresh results', 'Merging adds complexity']],
  v1:{text:'Version 1 uses Postgres full-text search with a GIN index and ts_rank.', code:`async function searchV1(q: string, limit = 20) {
  return db.any(\`SELECT id, title, ts_rank(search, websearch_to_tsquery('english', $1)) AS score
                 FROM docs WHERE search @@ websearch_to_tsquery('english', $1)
                 ORDER BY score DESC, created_at DESC LIMIT $2\`, [q, limit]);
}`},
  bottlenecks:['One database index cannot hold or serve 1B documents', 'Ranking can only use term statistics, so quality is limited', 'Re-indexing everything takes days'],
  scaling:[['Size', 'Split documents across many nodes'], ['Throughput', 'Add copies of each shard'], ['The slowest responses', 'Use deadlines, hedged requests and partial results'], ['Re-indexing', 'Build a new index version alongside, then switch an alias in one step']],
  improvements:['Semantic search with vector embeddings (mixed with keyword search)', 'Personalisation', 'Understanding queries (synonyms and named things)', 'Learn relevance from what users click'],
  failures:[['A shard copy is down', 'Another copy answers. Rebuild the lost one from a snapshot'], ['Indexing is behind', 'The real-time layer covers fresh documents. Alert on the lag'], ['A bad ranking model', 'Try it on a few users first, and roll back quickly to the previous model']],
  observability:{metrics:['Query time p50 and p99 for each shard', 'How often a search finds nothing', 'Click-through and abandonment', 'How far behind the index is'], alerts:['p99 above 300 ms', 'Index lag above 5 minutes', 'A spike in searches that find nothing'], dash:'Time, relevance measures and indexing health.'},
  review:['It scales out with document shards and copies: ✓', 'Fresh documents come from the real-time layer: ✓', 'Slow responses are controlled: ✓', 'Next: mixing keyword and vector retrieval'],
  refs:['case:google-search', 'l:inverted-index', 'l:bm25-ranking', 'l:elasticsearch']});
P({id:'p-recsys', level:'advanced', icon:'✨', title:'Recommendation system', tagline:'Candidate generation, ranking and feedback loops at scale.', tags:['recommendations', 'embeddings', 'feature store', 'experimentation'],
  req:'<b>A small example.</b> Dev watches three cooking videos. When he opens the app, the home page has a row “Recommended for you” with 50 videos, mostly about cooking, with a few new topics to explore. On a video page, a row of “similar videos” appears. Each time he clicks something, his recommendations adjust within minutes. The team tests every new model on a small group before it goes to everyone. Build these recommendations.',
  fr:['Personal recommendations on the home page', 'Similar items', 'Updates in real time from recent clicks', 'A/B tests of models'],
  nfr:['99 of 100 requests for 50 recommendations finish in under 100 ms', 'New signals count within minutes', 'Fallbacks when a model or its data is unavailable', 'Avoid feedback loops and filter bubbles'],
  est:[['Users and items', '100M users and 10M items', 'This is an assumption'], ['Requests', '50K a second', 'This is an assumption'], ['Interactions', '5B a day', 'About 50 a day for each of 100M users'], ['Embeddings', '≈ 2.6 GB for items and ≈ 26 GB for users', 'An embedding is 64 numbers × 4 bytes = 256 bytes. 10M × 256 B = 2.6 GB. 100M × 256 B = 26 GB']],
  entities:{code:`-- Interactions log (append-only, for training)
-- interactions(user_id, item_id, event, ts, context)   -- view, click, add_to_cart, purchase
-- Offline outputs:
--   item_embeddings(item_id, vector float[64], model_version)
--   user_embeddings(user_id, vector float[64], model_version)
--   item_neighbors(item_id, neighbors item_id[100])     -- similar items via ANN
-- Online: feature store (user recent clicks, item popularity), ANN index over item embeddings`, notes:'Training data must match what the model knew at that moment in time. Serving only reads vectors and features that were worked out ahead of time.'},
  apis:{list:[['GET /recs/home?user=', '50 items, with the reasons'], ['GET /recs/similar/{item}', 'Similar items'], ['POST /events', 'Interaction events']], code:`async function homeRecs(userId: string, n = 50) {
  const [u, recent] = await Promise.all([embeddings.user(userId), features.recentItems(userId, 20)]);
  const candidates = dedupe([
    ...(u ? await ann.search(u, 500) : []),                         // embedding retrieval
    ...(await neighbors.forItems(recent, 20)),                     // “because you viewed …”
    ...(await popular.inSegment(await features.segment(userId), 100))]);   // fallback / exploration
  const scored = await ranker.score(userId, candidates, { timeoutMs: 40 }).catch(() => candidates.map(c => ({ ...c, score: c.prior })));
  return diversify(scored.sort((a, b) => b.score - a.score), n);    // limit same-category streaks
}`},
  hld:{text:'There are two stages. First, cheap candidate generation uses ANN (nearest-neighbour search) over embeddings, items often seen together and popular items. Then a heavier ranker uses features from a feature store. Models train offline on logged interactions, and experiments give each user a model variant.',
    diagram:{n:[['u', 'client', 'App', '', 0, 1], ['api', 'service', 'Recs API', 'retrieve → rank', 1, 1], ['ann', 'cache', 'ANN index', 'item vectors', 2, 0], ['fs', 'cache', 'Feature store', 'online', 2, 2], ['rank', 'service', 'Ranker', 'model server', 3, 1], ['log', 'queue', 'Interactions', '', 1, 2], ['train', 'service', 'Training', 'offline', 3, 2]], e:'u>api api>ann api>fs api>rank u>log log>train~0.2 train>ann~-0.3 train>rank', f:[['Candidates come from the ANN index and neighbours; features from the feature store.', 'u>api:home|api>ann:500 candidates|api>fs:features'], ['The ranker scores and the API diversifies the final list.', 'api>rank:score'], ['Interactions are logged and feed training of the next model.', 'u>log:click|log>train|train>rank:new model']]}},
  components:[['Candidate generators', 'ANN search, items seen together, popular items and editor picks'], ['Feature store', 'Features for serving now and for training'], ['Ranker', 'A gradient-boosted or neural model'], ['Training pipeline', 'Datasets that match each moment in time, and evaluation'], ['Experimentation', 'Assigns users, tracks metrics and guards against harm']],
  tech:[['Two-tower embeddings and ANN (HNSW)', 'Fast search among millions of items'], ['A feature store', 'Training and serving use the same features'], ['A model server with timeouts', 'Bounded time'], ['An A/B platform', 'Measures the real effect']],
  tradeoffs:[['Two stages', 'Fast and accurate', 'What the ranker can pick is limited by the candidates'], ['Retrain daily, with real-time features', 'Fresh enough, and cheap', 'The model lags behind new trends'], ['Slots for exploration', 'Finds new items and avoids loops', 'Costs some short-term clicks']],
  v1:{text:'Version 1 uses item-to-item co-visitation (“people who viewed X also viewed Y”), computed nightly, plus popular items.', code:`-- nightly job (SQL): co-visitation within the same session
INSERT INTO item_neighbors (item_id, neighbor_id, score)
SELECT a.item_id, b.item_id, count(*) AS score
FROM interactions a JOIN interactions b
  ON a.session_id = b.session_id AND a.item_id <> b.item_id AND abs(extract(epoch FROM a.ts - b.ts)) < 1800
WHERE a.ts > now() - interval '30 days'
GROUP BY 1, 2 HAVING count(*) >= 5;`, lang:'sql', title:'v1.sql'},
  bottlenecks:['Co-visitation grows with the square of the session length and only helps items that have history', 'No personalisation beyond recent items', 'A nightly batch misses trends from the same day'],
  scaling:[['Personalisation', 'Use user and item embeddings with ANN search'], ['Cold start (new users or items)', 'Use content-based embeddings for new items and popular items for new users'], ['Freshness', 'Give the ranker streaming features such as recent clicks'], ['Time', 'Work out candidates ahead of time for heavy users, with strict timeouts and fallbacks']],
  improvements:['Rank for several goals at once (engagement, revenue and variety)', 'Bandits, which balance trying new items and using what works', 'Explanations such as “because you viewed…”', 'Fairness and safety filters'],
  failures:[['The ranker times out', 'Return the candidates ordered by their earlier scores'], ['The feature store is down', 'Use default values and log the weaker answers'], ['A bad model', 'Guardrail metrics trigger an automatic rollback']],
  observability:{metrics:['Clicks and conversions for each page area and model', 'Time for each stage', 'How often the fallback is used', 'Catalogue coverage and variety'], alerts:['Fallback used more than 5% of the time', 'Clicks drop compared with the control group', 'p99 above 150 ms'], dash:'Model performance, experiment results and pipeline freshness.'},
  review:['Two-stage search and ranking fit the time budget: ✓', 'The feature store keeps training and serving the same: ✓', 'Experiments and guardrails are in place: ✓', 'Next: ranking for several goals, and bandits'],
  refs:['l:recommendations', 'l:vector-search-rag', 'case:spotify', 'case:netflix']});
})();
