/* =====================================================================
   PART 15 · INTERVIEW WORKED SOLUTIONS (A): the classics
   URL shortener · Rate limiter · Notification service ·
   Distributed cache · Ticket booking
   Numbers are illustrative unless a source is named.
   ===================================================================== */
(function(){
const SDA = window.SDA;
const S = def => SDA.register(Object.assign({kind:'solution'}, def));
const ceil = Math.ceil;

/* ------------------------------------------------------------------ */
S({id:'url-shortener', level:'beginner', icon:'🔗', title:'URL shortener', tags:['IDs', 'caching', 'read-heavy'],
  tagline:'The warm-up question. Reads outnumber writes 100 : 1, so it is really a question about ID generation and caching.',
  prompt:'Design a URL shortener like bit.ly.',
  focus:'how short codes are generated without collisions, and how redirects stay fast.',
  clarify:{
    think:`<p>I won’t draw anything yet. A shortener sounds trivial, so the interviewer wants to see whether I find the two real problems: <b>generating unique short codes</b> and <b>serving a huge number of redirects fast</b>. I’ll confirm the traffic shape and which extras (aliases, analytics, expiry) are in scope.</p>`,
    ask:[['How many new links per day?', '100M per day'], ['How many redirects per new link?', '~100 : 1 read-heavy'], ['Custom aliases? Expiry?', 'Both optional; default links never expire'], ['Do we need click analytics?', 'Counts per link per day, may lag a few minutes'], ['Can a short link be edited to point elsewhere?', 'No, links are immutable (deletion only for abuse)']],
    fr:['Create a short link for a long URL (optional alias and expiry)', 'Redirect a short link to its long URL', 'Show click counts per link'],
    nfr:['Redirect p99 under ~50 ms server-side', '99.99% availability for redirects (creates can be a bit less)', 'Codes never collide; short (≤ 7–8 characters)', 'Codes not trivially enumerable'],
    out:['user accounts UI', 'link editing', 'QR codes', 'detailed geo analytics']},
  estimate:{
    think:`<p>I care about three numbers: redirect QPS (sizes the read path), total links over the retention period (sizes storage <i>and</i> the code length), and how much is worth caching.</p>`,
    assume:['peak ≈ 3× average', '~500 bytes per stored link', 'cache 20% of a day’s redirects (an upper bound: popular links repeat)'],
    inputs:[['perDay', 'New links per day', 1e8, [1e6, 1e7, 1e8, 5e8, 1e9]], ['ratio', 'Redirects per new link', 100, [10, 50, 100, 500]], ['years', 'Keep links for', 5, [1, 3, 5, 10], 'years']],
    rows:[
      ['wqps', 'Creates (average)', v => v.perDay / 86400, '/s', 'links per day ÷ 86,400 s'],
      ['rqps', 'Redirects (average)', (v, r) => r.wqps * v.ratio, '/s', 'creates × read ratio'],
      ['rpeak', 'Redirects (peak)', (v, r) => r.rqps * 3, '/s', '3× average'],
      ['total', 'Links stored', v => v.perDay * 365 * v.years, 'n', 'per day × 365 × years'],
      ['storage', 'Storage', (v, r) => r.total * 500, 'B', 'links × 500 B'],
      ['chars', 'Code length needed (base62)', (v, r) => { let L = 1; while (Math.pow(62, L) < r.total * 10) L++; return L; }, 'chars', 'smallest L with 62^L ≥ 10 × links (headroom)'],
      ['cache', 'Cache size', (v, r) => r.rqps * 86400 * 0.2 * 500, 'B', '20% of daily redirects × 500 B']],
    so:(r, f) => `Creates (${f('wqps')}) are easy for one database. Redirects at ${f('rpeak')} peak are the real load, so the read path must be served mostly from cache. ${f('total')} links need <b>${r.chars}-character</b> base62 codes. Storage of ${f('storage')} ${r.storage > 5e12 ? 'is more than one comfortable database: shard by short code from the start' : 'fits one database plus replicas; shard later if growth continues'}. A cache of ${f('cache')} ${r.cache > 5e11 ? 'is a small Redis cluster' : 'fits on one or two cache nodes'}.`},
  api:{
    think:`<p>Two public calls matter: create and redirect. Create needs an idempotency key so a retried request doesn’t make two links. For redirect I have to choose between 301 and 302, and that choice affects analytics, so I’ll say it out loud.</p>`,
    rows:[['POST /v1/links', 'Create a link from {long_url, alias?, expires_at?}; returns {code, short_url}', 'API key auth; Idempotency-Key header; 409 if alias taken'], ['GET /{code}', 'Redirect to the long URL', '302 + short Cache-Control so clicks are counted (301 is cached forever by browsers)'], ['GET /v1/links/{code}/stats', 'Clicks per day', 'Owner only'], ['DELETE /v1/links/{code}', 'Remove (owner or abuse team)', 'Soft delete + cache purge']],
    code:`POST /v1/links
Idempotency-Key: 6f1c…
{ "long_url": "https://example.com/very/long/path?utm=…", "alias": null }

201 Created
{ "code": "4fRz9Ka", "short_url": "https://sho.rt/4fRz9Ka" }

GET /4fRz9Ka
302 Found
Location: https://example.com/very/long/path?utm=…
Cache-Control: private, max-age=60`, title:'create + redirect'},
  data:{
    think:`<p>The only hot access pattern is “code → long URL”: a single-key lookup, no joins. That points to a key-value or wide-column store, or Postgres sharded by code. Analytics are a separate, append-heavy pattern, so they get their own table fed asynchronously.</p>`,
    code:`CREATE TABLE links (
  code        varchar(10) PRIMARY KEY,      -- base62, also the shard key
  long_url    text        NOT NULL,
  owner_id    bigint,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,                  -- NULL = never
  deleted     boolean     NOT NULL DEFAULT false
);

CREATE TABLE click_counts (                  -- written by the aggregator, not by redirects
  code    varchar(10),
  day     date,
  clicks  bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (code, day)
);`,
    stores:[['links', 'DynamoDB / Cassandra, or Postgres sharded by code', 'Point lookups by key; scales horizontally'], ['hot codes', 'Redis (cache-aside)', 'Most redirects hit a small set of popular links'], ['click events', 'Kafka → aggregator', 'Keeps counting off the redirect path'], ['click_counts', 'Same KV store or a column store', 'Small, query by (code, day)']]},
  hld:{
    think:`<p>I’ll split the read path from the write path, since they have different scale and different failure tolerance. The redirect service only talks to the cache and the database. Creates go through a separate API that hands out IDs.</p>`,
    diagram:{n:[['u', 'client', 'Browser', '', 0, 1], ['lb', 'lb', 'Load balancer', '', 1, 1], ['red', 'service', 'Redirect svc', 'GET /{code}', 2, 1], ['api', 'service', 'Create API', 'POST /links', 2, 2], ['cache', 'cache', 'Redis', 'code → URL', 3, 0], ['db', 'db', 'Links DB', 'sharded by code', 3, 1], ['ids', 'service', 'ID allocator', 'blocks of 1,000', 3, 2], ['q', 'queue', 'Click events', 'Kafka', 4, 0], ['agg', 'service', 'Aggregator', 'counts per day', 4, 1]],
      e:'u>lb lb>red lb>api red>cache red>db red>q api>ids api>db q>agg agg>db',
      f:[['Create: the API takes the next ID from a block it reserved earlier, encodes it in base62 and inserts the row.', 'u>lb:POST /links|lb>api|api>ids:next id (local block)|api>db:INSERT 4fRz9Ka'], ['Redirect: a cache hit answers in about a millisecond; a miss reads the database and fills the cache.', 'u>lb:GET /4fRz9Ka|lb>red|red>cache:GET 4fRz9Ka|red>db:miss → SELECT'], ['Every redirect emits a click event; counts are aggregated off the hot path.', 'red>q:click event|q>agg|agg>db:+1 for (code, day)']]},
    walk:['The browser requests <code>/4fRz9Ka</code>; the load balancer routes it to a redirect server.', 'The server checks Redis; on a miss it reads the links table by primary key and caches the answer (also caching “not found” for a short time).', 'It returns 302 with the long URL, then publishes a click event without waiting.', 'The aggregator batches click events and adds them to <code>click_counts</code>.']},
  deep:[
    {t:'Generating short codes without collisions',
      think:`<p>There are three families of answers, and I’ll compare them rather than jump to one. Hashing the URL and truncating, or picking random codes, both need a collision check on every insert. A <b>counter encoded in base62</b> can never collide, but it needs coordination. I avoid a global lock by handing each server a <b>block of 1,000 IDs</b> at a time.</p>`,
      body:`<table class="tbl"><thead><tr><th>Approach</th><th>Collisions</th><th>Cost</th></tr></thead><tbody>
<tr><td>MD5/SHA of URL, take 7 chars</td><td>Possible: check and re-hash with a salt</td><td>A read before every write; same URL → same code (may be a feature)</td></tr>
<tr><td>Random 7 chars</td><td>Rare but grows: with 183B of 3.5T codes used, ~5% of new codes hit an existing one</td><td>Conditional insert + retry</td></tr>
<tr><td>Counter + base62</td><td>Never</td><td>Needs an allocator; codes are sequential (scramble with a reversible permutation if that matters)</td></tr></tbody></table>
<p>The allocator can be a database sequence or a small replicated service. Each create server asks for a range (for example 1,000 IDs) and uses it locally, so the allocator sees only one request per 1,000 links. If a server crashes, the rest of its block is simply skipped; gaps are fine.</p>`,
      code:{lang:'ts', title:'ids.ts', src:`const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function base62(n: bigint): string {
  if (n === 0n) return "0";
  let s = "";
  while (n > 0n) { s = ALPHABET[Number(n % 62n)] + s; n /= 62n; }
  return s;
}

// Each server reserves a block of ids, then hands them out locally.
export class IdBlock {
  private next = 0n; private end = 0n;
  constructor(private reserve: (size: number) => Promise<bigint>, private size = 1000) {}
  async take(): Promise<bigint> {
    if (this.next >= this.end) {               // block used up: one round trip
      this.next = await this.reserve(this.size); // e.g. UPDATE counter SET v = v + 1000 RETURNING v - 1000
      this.end = this.next + BigInt(this.size);
    }
    return this.next++;
  }
}`}},
    {t:'Keeping redirects fast and the database quiet',
      think:`<p>Redirect traffic follows a power law: a few links get most clicks. So cache-aside in Redis with a TTL works well, and links are immutable, so there is nothing to invalidate except deletions. The less obvious risk is <b>misses on codes that don’t exist</b>. A bot guessing random codes would hammer the database, so I cache “not found” for a minute and rate-limit by IP.</p>`,
      body:`<ul><li><b>301 vs 302:</b> 301 lets browsers and CDNs skip us next time (cheaper), but we lose the click. I’d use 302 with a short <code>max-age</code>, or 301 for customers who opt out of analytics.</li><li><b>Viral links:</b> one Redis key can see 100K+ reads per second. Keep a small in-process LRU (5–10 s TTL) on each redirect server in front of Redis.</li><li><b>Shard by hash of the code</b>, not by creation time, so new (hot) links spread across shards.</li></ul>`},
    {t:'Counting clicks without slowing redirects',
      think:`<p>Incrementing a counter row in the redirect path would add a write to every read and create hot rows for viral links. Instead the redirect publishes an event and moves on. The aggregator sums events in memory for a few seconds and writes one increment per (code, day). Counts lag slightly, which the requirements allow.</p>`}],
  bottlenecks:{
    think:`<p>I’ll walk the request path and ask “what is the first thing to fall over at 10×?” Here it is the hottest cache keys, then the shard holding them.</p>`,
    rows:[['A link goes viral', 'One Redis shard at high CPU; p99 rises for unrelated links on that shard', 'In-process LRU on redirect servers; serve popular links from the CDN with short TTLs'], ['Database shard grows unevenly', 'Disk and IOPS alarms on one shard', 'Hash-based sharding by code; add shards with consistent hashing'], ['ID allocator unavailable', 'Creates fail once local blocks run out', 'Large blocks give minutes of runway; run the allocator as a replicated sequence'], ['Abuse: phishing links, code guessing', 'Spike in 404s or reports', 'Rate-limit creates and lookups; scan URLs against blocklists; negative caching'], ['Cold cache after a restart', 'Database reads jump', 'Warm with yesterday’s top links; coalesce concurrent misses for the same code']]},
  tradeoffs:{
    think:`<p>I’ll summarise the decisions and be explicit about what each one costs.</p>`,
    rows:[['Code generation', 'Counter blocks + base62', 'Hash or random codes', 'No collision checks and short codes; sequential unless scrambled'], ['Redirect status', '302 with short caching', '301 permanent', 'Complete click counts; more traffic reaches us'], ['Store', 'Key-value, sharded by code', 'A single Postgres', 'Linear scaling for point lookups; analytics need a separate store'], ['Analytics', 'Async events → aggregates', 'Increment in the redirect path', 'Fast redirects; counts lag by seconds']],
    more:['Custom domains per customer', 'Expiry: delete lazily on read plus a background sweeper', 'Serve redirects from several regions (links are immutable, so asynchronous replication is safe)', 'Malware scanning pipeline for new links'],
    followups:[['How do custom aliases work?', 'Same table, inserted with a conditional write (<code>INSERT … ON CONFLICT DO NOTHING</code>, or a DynamoDB condition) that returns 409 if taken. Keep aliases in a namespace generated codes can never produce (for example, generated codes are exactly 7 characters and aliases must be 8+, or contain a dash), so a future counter value can’t collide with an alias.'], ['Two users shorten the same URL. Same code?', 'Either return the existing code (needs an index on a hash of the long URL, and reveals that someone else shortened it) or create a new one (simpler, and analytics stay per user). Most services create a new code per user and only dedupe within one account.'], ['How would you go multi-region?', 'Links never change, so replicate them asynchronously to every region and serve redirects locally. Give each region its own ID range (or a region bit in the ID) so creates never need cross-region coordination.']],
    traps:['Spending ten minutes choosing a hash function', 'Truncating an MD5 without handling collisions', 'Designing the write path in detail when reads are 100× larger', 'Updating click counters synchronously on every redirect']},
  refs:['case:url-shortener', 'l:unique-ids', 'l:cache-strategies', 'l:consistent-hashing', 'lab:snowflake-id', 'pg:cache-sim']});

/* ------------------------------------------------------------------ */
S({id:'rate-limiter', level:'beginner', icon:'🚦', title:'Rate limiter', tags:['token bucket', 'Redis', 'gateway'],
  tagline:'Small state, huge request rate, and a failure mode that can take your whole API down if you get it wrong.',
  prompt:'Design a rate limiter for a public API.',
  focus:'the algorithm choice, making the check atomic across many gateway servers, and what happens when the limiter itself fails.',
  clarify:{
    think:`<p>“Rate limiter” can mean a library in one process or a shared service in front of a whole fleet. I’ll pin down where it runs, what it limits by, and, most importantly, what should happen if the limiter is unavailable, because that decides whether it can take the API down.</p>`,
    ask:[['Client-side or server-side?', 'Server-side, in the API gateway'], ['Limit by what?', 'API key (per plan), plus per IP for unauthenticated routes'], ['What do rules look like?', 'e.g. 100 requests/minute with bursts up to 20; some routes cost more'], ['How many gateway servers?', '~50 across 2 regions'], ['What if the limiter is down?', 'Fail open for normal routes; fail closed for login and OTP'], ['Exact or approximate?', 'Within a few % is fine']],
    fr:['Check each request against the rules for its key, IP and route', 'Reject over-limit requests with 429, Retry-After and rate-limit headers', 'Change rules without redeploying'],
    nfr:['Adds under ~2 ms p99 per request', 'Correct across all gateways (a client can’t multiply its limit by spreading requests)', 'A limiter outage must not become an API outage'],
    out:['billing / quotas per month', 'DDoS protection at the network layer']},
  estimate:{
    think:`<p>The state is tiny; the <b>request rate</b> is what sizes this, because every API call triggers a check.</p>`,
    assume:['~100 B per bucket in Redis (key, tokens, timestamp, overhead)', 'one Redis call per request', '~100K ops/s per Redis shard as a safe budget'],
    inputs:[['rps', 'API requests per second (peak)', 5e5, [1e4, 1e5, 5e5, 1e6, 5e6], '/s'], ['keys', 'Active API keys', 1e6, [1e4, 1e5, 1e6, 1e7]], ['nodes', 'Gateway servers', 50, [5, 20, 50, 200], 'servers']],
    rows:[
      ['perNode', 'Checks per gateway', v => v.rps / v.nodes, '/s', 'requests ÷ gateways'],
      ['mem', 'Bucket memory', v => v.keys * 100, 'B', 'keys × 100 B'],
      ['ops', 'Redis operations', v => v.rps, '/s', 'one atomic script per request'],
      ['shards', 'Redis shards needed', (v, r) => Math.max(1, ceil(r.ops / 1e5)), 'shards', 'ops ÷ 100K per shard']],
    so:(r, f, v) => `State is tiny (${f('mem')}), but every request needs a check, so Redis must absorb ${f('ops')}: that’s <b>${r.shards} shard${r.shards > 1 ? 's' : ''}</b>${r.shards > 1 ? ', sharded by key so each key’s bucket lives on exactly one shard' : ''}. At ${f('perNode')} per gateway (${v.nodes} gateways), ${r.perNode > 2e4 ? 'at that rate it’s worth leasing small batches of tokens locally to save round trips for the busiest keys' : 'one Redis round trip per request is affordable'}.`},
  api:{
    think:`<p>The limiter sits inside the gateway, so its “API” is the decision it returns plus the headers clients see. I’ll also add an admin API for rules, so limits can change without a deploy.</p>`,
    rows:[['check(key, route, cost) → {allowed, remaining, resetMs}', 'In-gateway call (library or sidecar) on every request', 'Must answer in about a millisecond'], ['PUT /v1/rules/{id}', 'Create or update a rule {match, limit, window, burst, failMode}', 'Admin only; pushed to gateways in seconds'], ['GET /v1/limits/{key}', 'Current usage for a key', 'For support and dashboards']],
    code:`HTTP/1.1 429 Too Many Requests
Retry-After: 2
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 2
Content-Type: application/json

{ "error": "rate_limited", "message": "Plan limit 100 req/min exceeded" }`, title:'what a blocked client sees'},
  data:{
    think:`<p>Two kinds of data: <b>rules</b>, which are small, rarely change and are read everywhere, so they live in a database and are cached in every gateway; and <b>counters</b>, which are tiny, constantly updated and short-lived, so they live in Redis with a TTL.</p>`,
    code:`CREATE TABLE rate_rules (
  id          serial PRIMARY KEY,
  match_plan  text,            -- 'free' | 'pro' | NULL (any)
  match_route text,            -- '/v1/search*' | NULL
  limit_n     int  NOT NULL,   -- tokens per window
  window_s    int  NOT NULL,   -- refill window in seconds
  burst       int  NOT NULL,   -- bucket capacity
  fail_mode   text NOT NULL DEFAULT 'open'  -- 'open' | 'closed'
);
-- Counters (Redis): HASH rl:{api_key}:{rule_id} -> { tokens, ts }  with TTL = 2 x window`,
    stores:[['rules', 'Postgres + in-memory copy in each gateway', 'Read on every request; changes rarely'], ['buckets', 'Redis cluster, sharded by key', 'Atomic scripts, sub-millisecond, TTL cleans up idle keys']]},
  hld:{
    think:`<p>The gateway is where every request already passes, so the check goes there. Redis holds the shared buckets. A rules service pushes configuration to the gateways’ local caches. The backend never sees rejected traffic.</p>`,
    diagram:{n:[['c', 'client', 'Clients', 'API keys', 0, 1], ['gw', 'lb', 'API gateway', 'limiter middleware', 1, 1], ['local', 'cache', 'Local cache', 'rules', 1, 0], ['redis', 'cache', 'Redis cluster', 'buckets by key', 2, 0], ['svc', 'service', 'Backend services', '', 3, 1], ['rules', 'service', 'Rules service', '', 2, 2], ['rdb', 'db', 'Rules DB', '', 3, 2]],
      e:'c>gw gw>local gw>redis gw>svc rules>rdb rules>gw',
      f:[['Allowed: one atomic script on the key’s shard refills and takes a token; tokens remain, so the request passes.', 'c>gw:GET /v1/orders (key k_42)|gw>redis:EVAL bucket k_42|gw>svc:allowed (37 left)'], ['Blocked: the bucket is empty, so the gateway answers 429 and the backend never sees it.', 'c>gw:request 101 this minute|gw>redis:EVAL → 0 tokens|gw>c:429, Retry-After 2'], ['Rule change: saved, then pushed to every gateway within seconds.', 'rules>rdb:pro plan → 1,000/min|rules>gw:push rules v12|gw>local:cache v12']]},
    walk:['A request arrives with API key <code>k_42</code>; the gateway matches it to a rule from its local cache.', 'It runs one Lua script on the Redis shard that owns <code>rl:k_42:7</code>: refill based on elapsed time, then take one token if available.', 'Allowed → forward with <code>RateLimit-Remaining</code>; denied → 429 with <code>Retry-After</code>.', 'If Redis doesn’t answer within ~5 ms, apply the rule’s fail mode.']},
  deep:[
    {t:'Choosing the algorithm',
      think:`<p>I’ll list the standard options with their flaw, then pick one. The requirement says bursts are allowed, so a <b>token bucket</b> fits: two numbers per key (tokens, last refill time), allows a burst up to the capacity, then a steady rate.</p>`,
      body:`<table class="tbl"><thead><tr><th>Algorithm</th><th>Weakness</th></tr></thead><tbody>
<tr><td>Fixed window counter</td><td>Up to 2× the limit across a window boundary (100 at 0:59 + 100 at 1:00)</td></tr>
<tr><td>Sliding log</td><td>Exact, but stores one timestamp per request</td></tr>
<tr><td>Sliding window counter</td><td>Approximate (weights the previous window); good and cheap</td></tr>
<tr><td>Token bucket</td><td>Allows bursts by design; two numbers per key</td></tr>
<tr><td>Leaky bucket (queue)</td><td>Smooths output but adds waiting; better for outgoing traffic</td></tr></tbody></table>`,
      code:{lang:'ts', title:'token-bucket.ts', src:`// Refill lazily from elapsed time: no background timers needed.
export function take(b: { tokens: number; ts: number }, now: number,
                     ratePerMs: number, capacity: number, cost = 1) {
  const tokens = Math.min(capacity, b.tokens + (now - b.ts) * ratePerMs);
  if (tokens < cost) return { allowed: false, state: { tokens, ts: now },
                              retryMs: Math.ceil((cost - tokens) / ratePerMs) };
  return { allowed: true, state: { tokens: tokens - cost, ts: now }, retryMs: 0 };
}`}},
    {t:'Making the check atomic across 50 gateways',
      think:`<p>If two gateways each read “1 token left” and both write back “0”, both requests pass. A read-then-write from the application is a race. I’ll run the whole refill-and-take inside Redis as one <b>Lua script</b>; Redis executes a script atomically, so no two checks interleave. I also use the Redis server’s clock (or pass the time in) so gateways with skewed clocks agree.</p>`,
      code:{lang:'ts', title:'bucket.lua (as a string sent with EVALSHA)', src:`// KEYS[1] = bucket key, ARGV = rate per ms, capacity, cost
const BUCKET_LUA = [
  "local t = redis.call('TIME')",
  "local now = t[1] * 1000 + math.floor(t[2] / 1000)",
  "local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')",
  "local cap = tonumber(ARGV[2])",
  "local tokens = tonumber(b[1]) or cap",
  "local ts = tonumber(b[2]) or now",
  "tokens = math.min(cap, tokens + (now - ts) * tonumber(ARGV[1]))",
  "local ok = tokens >= tonumber(ARGV[3])",
  "if ok then tokens = tokens - tonumber(ARGV[3]) end",
  "redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)",
  "redis.call('PEXPIRE', KEYS[1], 120000)",
  "return { ok and 1 or 0, math.floor(tokens) }"
].join("\\n");`}},
    {t:'When Redis is slow or down',
      think:`<p>This is where the design can hurt more than it helps. If every request waits on Redis and Redis stalls, the whole API stalls. So the call has a <b>tight timeout</b> (a few ms) and a circuit breaker. When it trips, normal routes <b>fail open</b> but fall back to a local, approximate limit (the rule’s limit ÷ number of gateways). Sensitive routes such as login and OTP <b>fail closed</b>, because unlimited guessing is worse than a short outage there.</p>`}],
  bottlenecks:{
    think:`<p>The limiter is on every request’s critical path, so I look for added latency and single hot keys.</p>`,
    rows:[['One very busy key (a big customer)', 'One Redis shard runs hot', 'Lease tokens to each gateway in small batches for that key; refill locally'], ['Redis round trip on every request', 'p99 of the whole API rises with Redis latency', 'Keep Redis in the same zone; pipelining; skip the check for keys far below their limit'], ['A global limit across regions', 'Either cross-region latency or over-admission', 'Split the limit per region and rebalance periodically from observed traffic'], ['Unbounded local maps in gateways', 'Memory growth', 'LRU with a cap; TTL on idle entries']]},
  tradeoffs:{
    think:`<p>The main tension is <b>accuracy vs latency and availability</b>. A perfectly exact global limit needs a shared store on every request.</p>`,
    rows:[['Algorithm', 'Token bucket', 'Sliding window counter', 'Supports bursts with two numbers; bursts are allowed by design'], ['Where state lives', 'Shared Redis', 'Local memory only', 'Correct across gateways; costs a network call'], ['Failure behaviour', 'Fail open (closed for auth)', 'Always closed', 'Availability first; brief over-admission during incidents'], ['Hot keys', 'Batch token leases', 'Exact per-request checks', 'Fewer calls; may overshoot by one batch']],
    more:['Cost-based limits (an export costs 50 tokens)', 'Per-tenant fairness inside a shared limit', 'Dashboards showing who is being limited and why', 'Adaptive limits that tighten when backends are overloaded (load shedding)'],
    followups:[['How do you limit by cost instead of by count?', 'Pass a cost into the same token bucket: a search takes 10 tokens, a GET takes 1. Rules define the cost per route.'], ['How would you enforce one global limit across three regions?', 'Give each region a share (for example 40/30/30 from recent traffic) and rebalance every few seconds; or accept up to one window of overshoot. A synchronous cross-region check costs ~100 ms on every request and isn’t worth it.'], ['Client, gateway or service: where should limits live?', 'Gateway for per-key and per-IP limits (one place, protects everything behind it). Services keep their own concurrency limits and load shedding, because only they know when they are overloaded. Clients should respect Retry-After and back off with jitter.']],
    traps:['Choosing a fixed window without mentioning the boundary burst', 'GET then SET from the application (a race)', 'No answer for “what if Redis is down?”', 'Returning 429 without Retry-After or rate-limit headers']},
  refs:['case:rate-limiter', 'l:rate-limiting', 'pg:rate-limiter', 'lab:token-bucket', 'lab:sliding-window', 'l:idempotency-rate-limit-headers', 'l:load-shedding']});

/* ------------------------------------------------------------------ */
S({id:'notification-service', level:'beginner', icon:'🔔', title:'Notification service', tags:['queues', 'priorities', 'providers'],
  tagline:'Push, SMS and email for 100M users. The hard parts are priorities, duplicates and third-party providers you don’t control.',
  prompt:'Design a notification system that sends push notifications, SMS and email for an app with 100M users.',
  focus:'keeping OTPs fast during a marketing blast, avoiding duplicate sends, and surviving a provider outage.',
  clarify:{
    think:`<p>Notification systems fail in predictable ways: marketing floods delay OTPs, retries send duplicates, and one SMS provider goes down. I’ll ask about priorities and delivery guarantees first, because they shape the queues.</p>`,
    ask:[['Which channels?', 'Mobile push, SMS, email'], ['Who sends?', 'Internal services: OTP, order updates, and marketing campaigns'], ['Volume?', '~1B notifications/day, with marketing bursts several times the average'], ['Latency targets?', 'OTP within ~5 s; transactional within a minute; marketing within hours'], ['User preferences?', 'Opt-out per category and channel; quiet hours for marketing'], ['Is a duplicate acceptable?', 'Rarely; never for payments copy or OTP storms']],
    fr:['Send API: user + template + parameters + priority', 'Respect preferences, opt-outs and quiet hours', 'Templates per channel and language', 'Track delivery status per channel', 'Scheduled and bulk campaigns'],
    nfr:['OTPs never wait behind marketing', 'No lost notifications (at-least-once, deduplicated)', 'Survive one provider failing', '99.95% for the send API'],
    out:['in-app inbox UI', 'A/B testing of copy']},
  estimate:{
    think:`<p>I want the average and burst rate (sizes the workers and queues), the SMS volume (it costs real money per message), and the size of the status log.</p>`,
    assume:['SMS cost ~$0.005 per message (illustrative; varies a lot by country)', '~500 B per delivery-status record, kept 30 days'],
    inputs:[['perDay', 'Notifications per day', 1e9, [1e7, 1e8, 1e9, 5e9]], ['burst', 'Peak ÷ average', 5, [2, 5, 10, 20], '×'], ['sms', 'Share sent by SMS', 2, [0.5, 2, 5, 10], '%']],
    rows:[
      ['avg', 'Sends (average)', v => v.perDay / 86400, '/s', 'per day ÷ 86,400'],
      ['peak', 'Sends (peak)', (v, r) => r.avg * v.burst, '/s', 'average × burst factor'],
      ['smsDay', 'SMS per day', v => v.perDay * v.sms / 100, 'n', 'per day × SMS share'],
      ['smsCost', 'SMS cost per day', (v, r) => r.smsDay * 0.005, '$', 'SMS × $0.005'],
      ['log', 'Status log (30 days)', v => v.perDay * 500 * 30, 'B', 'per day × 500 B × 30']],
    so:(r, f) => `Workers and queues must absorb ${f('peak')} at peak, not the ${f('avg')} average, so marketing gets its own paced queue. SMS is the expensive channel: ${f('smsCost')} a day at this mix${r.smsCost > 2e4 ? ', so prefer push and keep SMS for OTPs and critical alerts' : ''}. The ${f('log')} status log is write-heavy and short-lived: a wide-column store with TTLs fits better than the main database.`},
  api:{
    think:`<p>Producers should not know about providers or device tokens. They send “user 42, template order_shipped, these params, priority high”, with an idempotency key so their retries don’t notify twice.</p>`,
    rows:[['POST /v1/notifications', 'Send to one user: {user_id, template, params, priority, channels?, send_at?}', 'Idempotency-Key required; returns 202 + id'], ['POST /v1/campaigns', 'Bulk send to a segment on a schedule', 'Paced; can be cancelled'], ['GET /v1/notifications/{id}', 'Status per channel', 'queued / sent / delivered / failed'], ['PUT /v1/users/{id}/preferences', 'Opt-outs and quiet hours', 'Per category × channel'], ['POST /hooks/{provider}', 'Delivery receipts from providers', 'Signed webhooks']],
    code:`POST /v1/notifications
Idempotency-Key: order-77812-shipped
{ "user_id": 42, "template": "order_shipped", "priority": "high",
  "params": { "order": "77812", "eta": "Tue" } }

202 Accepted
{ "id": "ntf_9Qx2", "status": "queued" }`, title:'send'},
  data:{
    think:`<p>Preferences, templates and device tokens are classic relational data that is read often. Delivery records are huge, append-mostly and only kept for weeks, so they go to a wide-column store with TTLs.</p>`,
    code:`CREATE TABLE notifications (
  id          text PRIMARY KEY,
  idem_key    text UNIQUE NOT NULL,      -- producer's key: duplicates rejected here
  user_id     bigint NOT NULL,
  template    text NOT NULL,
  priority    text NOT NULL,             -- 'critical' | 'high' | 'bulk'
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE preferences (
  user_id bigint, category text, channel text, enabled boolean NOT NULL,
  PRIMARY KEY (user_id, category, channel)
);
CREATE TABLE devices (
  token text PRIMARY KEY, user_id bigint NOT NULL, platform text NOT NULL,
  last_seen timestamptz NOT NULL
);
-- deliveries (Cassandra, TTL 30 days):
--   PRIMARY KEY ((notification_id), channel) -> status, provider, provider_msg_id, attempts`,
    stores:[['preferences, devices, templates', 'Postgres + cache', 'Relational, read-heavy'], ['deliveries', 'Cassandra / DynamoDB with TTL', 'Write-heavy, short-lived'], ['work queues', 'Kafka topics per priority (or SQS queues)', 'Isolation and replay'], ['dedupe keys', 'Redis SET NX with TTL', 'Fast “already sent?” check']]},
  hld:{
    think:`<p>The key structural decision is <b>separate queues and worker pools per priority</b>, so a 50M-message campaign can never sit in front of an OTP. Channel workers own provider details: rendering, rate limits, retries and failover.</p>`,
    diagram:{n:[['p', 'client', 'Producers', 'all services', 0, 1], ['api', 'service', 'Notify API', 'dedupe + prefs', 1, 1], ['pdb', 'db', 'Prefs & templates', '', 1, 2], ['qh', 'queue', 'High priority', 'OTP, alerts', 2, 0], ['ql', 'queue', 'Bulk queue', 'campaigns', 2, 2], ['w', 'service', 'Channel workers', 'render + pace', 3, 1], ['prov', 'ext', 'Providers', 'APNs · FCM · SMS', 4, 1], ['log', 'db', 'Delivery log', 'status, TTL', 3, 2]],
      e:'p>api api>pdb api>qh api>ql qh>w ql>w w>prov w>log prov>log',
      f:[['OTP: checked against preferences, rendered from the template, and put on the high-priority queue.', 'p>api:OTP for user 42 (key otp-9f1)|api>pdb:prefs + template|api>qh:priority high|qh>w|w>prov:SMS via provider A|w>log:SENT'], ['Campaign: batches go to the bulk queue and workers pace them per provider.', 'p>api:campaign batch|api>ql:1,000 messages|ql>w:paced 2K/s|w>prov:push via FCM'], ['Receipts: providers report delivery through webhooks.', 'prov>log:DELIVERED']]},
    walk:['The order service sends <code>order_shipped</code> with an idempotency key; the API inserts it (a duplicate key returns the original id).', 'The API loads preferences and drops channels the user opted out of; it picks the queue by priority.', 'A worker renders the template, checks the dedupe key in Redis, sends through the provider under that provider’s rate limit, and records the provider’s message id.', 'Delivery receipts arrive later by webhook and update the log.']},
  deep:[
    {t:'Priority isolation and pacing',
      think:`<p>A single queue with a “priority” field still makes OTPs wait if workers are busy with campaign messages. Separate topics and <b>separate worker pools</b> give hard isolation. The bulk pool is paced with a token bucket per provider, both to respect provider limits and to avoid waking 50M phones in the same second.</p>`,
      body:`<ul><li><b>Critical</b> (OTP, security alerts): own queue and workers, kept far below capacity, no quiet hours.</li><li><b>High</b> (orders, payments): own queue; short retries.</li><li><b>Bulk</b> (marketing): paced, quiet hours applied per user time zone, cancellable mid-campaign.</li></ul>`},
    {t:'At-least-once delivery without duplicate sends',
      think:`<p>Queues redeliver messages after timeouts, and providers time out while still delivering. I can’t get exactly-once across a third-party API, but I can make duplicates rare: <b>dedupe at the API</b> (unique idempotency key), <b>dedupe at the worker</b> (Redis SET NX on notification + channel before sending), pass a provider idempotency key when the provider supports one, and retry with exponential backoff and jitter into a dead-letter queue.</p>`,
      code:{lang:'ts', title:'worker.ts', src:`async function handle(msg: Job) {
  const key = "sent:" + msg.id + ":" + msg.channel;
  // Claim the send. If another worker already did, skip.
  const claimed = await redis.set(key, "1", { NX: true, EX: 86400 });
  if (!claimed) return ack(msg);
  try {
    const res = await provider(msg.channel).send(render(msg), { idempotencyKey: msg.id });
    await log.put(msg.id, msg.channel, { status: "SENT", providerId: res.id });
    ack(msg);
  } catch (e) {
    await redis.del(key);                       // allow a retry
    if (msg.attempts >= 5) return deadLetter(msg, e);
    retryLater(msg, backoffWithJitter(msg.attempts));
  }
}`}},
    {t:'Provider failover',
      think:`<p>SMS and email providers fail or throttle regularly, so each channel has an ordered list of providers. A <b>circuit breaker per provider</b> opens on errors or latency, and the worker moves to the next provider. For OTPs I’d also watch the delivery-receipt rate, because some failures look like success at the API (accepted but never delivered).</p>`}],
  bottlenecks:{
    think:`<p>Most failures here come from outside: providers, devices and campaign spikes.</p>`,
    rows:[['A campaign floods the system', 'OTP latency rises', 'Separate queues and worker pools; pace bulk sends'], ['Provider throttles or fails', '429s / timeouts from one provider', 'Per-provider rate limits; breaker; failover order'], ['Stale device tokens', 'High “unregistered” error rate on push', 'Delete tokens when APNs/FCM report them invalid'], ['Delivery-log write volume', 'Write latency on the log store', 'Wide-column store with TTL; batch writes'], ['Template rendering CPU', 'Worker CPU high during campaigns', 'Cache compiled templates; render once per locale for bulk']]},
  tradeoffs:{
    think:`<p>The recurring trade-off is <b>speed vs duplicates</b>: more retries reduce losses and increase duplicates, so dedupe has to be layered.</p>`,
    rows:[['Queues', 'One queue + worker pool per priority', 'Single queue with a priority field', 'Hard isolation; more infrastructure'], ['Delivery guarantee', 'At-least-once + dedupe', 'Exactly-once', 'Achievable; a rare duplicate after a provider timeout remains'], ['Providers', 'Several per channel, with failover', 'One provider', 'Resilience and price leverage; more integrations'], ['Content storage', 'Template id + params; never store OTP values', 'Full rendered content', 'Privacy and size; harder to show exact text in support tools']],
    more:['In-app inbox with read state', 'Notification batching (“5 new likes”) and frequency caps', 'Per-user channel choice learned from engagement', 'Cost-aware routing between SMS providers'],
    followups:[['How do you avoid a 3 a.m. marketing push?', 'Store each user’s time zone; the bulk worker checks quiet hours and reschedules the message to the next allowed time (a delay queue or a scheduled job). Critical messages ignore quiet hours.'], ['A user has three devices. What happens?', 'Fan out one delivery per active device token. Use the platform’s collapse key so an updated notification replaces the old one rather than stacking.'], ['How do you know a push was actually seen?', 'APNs and FCM only confirm they accepted it. For real delivery and open rates, the app reports receipt and open events back to an analytics endpoint.']],
    traps:['One queue for everything', 'No idempotency key, so producer retries double-notify', 'Logging OTP values in plain text', 'Ignoring provider rate limits until they throttle you']},
  refs:['case:notification-service', 'l:push-notifications', 'l:queues-pubsub-streams', 'l:delivery-semantics', 'l:ordering-dlq', 'l:circuit-breaker', 'pg:retry-jitter']});

/* ------------------------------------------------------------------ */
S({id:'distributed-cache', level:'intermediate', icon:'⚡', title:'Distributed cache', tags:['consistent hashing', 'eviction', 'hot keys'],
  tagline:'Build Memcached or Redis Cluster: partition data across many RAM-heavy nodes, evict sensibly, and survive node loss without melting the database.',
  prompt:'Design a distributed in-memory cache that many services share.',
  focus:'partitioning (consistent hashing), eviction, hot keys and what happens to the database when a node dies.',
  clarify:{
    think:`<p>A cache is allowed to forget, and that changes everything: no durability, and losing a node is a performance event, not data loss. I’ll confirm that, then the operations, size and request rate.</p>`,
    ask:[['Which operations?', 'GET, SET with TTL, DELETE, multi-get'], ['How much hot data?', '~10 TB'], ['Request rate?', '~10M operations/s at peak'], ['May it lose data?', 'Yes; the source of truth is a database'], ['Can a read be stale?', 'Briefly yes; but it must never return another key’s value'], ['Shared by many teams?', 'Yes, with namespaces and per-tenant limits']],
    fr:['get / set (TTL) / delete / multi-get by key', 'Eviction when memory is full', 'Add and remove nodes without downtime'],
    nfr:['p99 under ~1 ms within a data centre', 'Losing one node must not overload the database', 'Linear scaling: twice the nodes, twice the capacity'],
    out:['persistence', 'cross-region replication', 'complex data types (lists, sets)']},
  estimate:{
    think:`<p>Two things decide the node count: <b>memory</b> (data × replicas ÷ usable RAM per node) and <b>throughput</b> (ops ÷ ops per node). Whichever is larger wins.</p>`,
    assume:['~70% of RAM usable after overhead and fragmentation', '~250K ops/s per node (illustrative)', '~1 KB average value'],
    inputs:[['data', 'Hot data', 1e13, [1e12, 5e12, 1e13, 5e13], 'B'], ['ops', 'Operations per second', 1e7, [1e6, 5e6, 1e7, 5e7], '/s'], ['ram', 'RAM per node', 256e9, [64e9, 128e9, 256e9, 512e9], 'B'], ['copies', 'Copies of each key', 2, [1, 2, 3], 'copies']],
    rows:[
      ['usable', 'Usable memory per node', v => v.ram * 0.7, 'B', 'RAM × 0.7'],
      ['nMem', 'Nodes for memory', (v, r) => ceil(v.data * v.copies / r.usable), 'nodes', 'data × copies ÷ usable'],
      ['nOps', 'Nodes for throughput', v => ceil(v.ops / 2.5e5), 'nodes', 'ops ÷ 250K'],
      ['nodes', 'Nodes needed', (v, r) => Math.max(r.nMem, r.nOps), 'nodes', 'the larger of the two'],
      ['perNode', 'Ops per node', (v, r) => v.ops / r.nodes, '/s', 'ops ÷ nodes'],
      ['net', 'Network traffic', v => v.ops * 1000 * 8, 'bps', 'ops × 1 KB']],
    so:(r, f) => `${r.nMem >= r.nOps ? '<b>Memory decides</b>' : '<b>Throughput decides</b>'}: ${f('nodes')} (${f('nMem')} for memory, ${f('nOps')} for throughput). Each node serves ${f('perNode')}, ${r.perNode < 2.5e5 * 0.5 ? 'well under its limit, so a single hot key, not average load, is the real risk' : 'close to its limit, so add headroom for hot keys and node failures'}. Total traffic is ${f('net')}, so spread it over many nodes and keep clients in the same data centre.`},
  api:{
    think:`<p>Keep the interface small. The interesting part is that the <b>client library</b> does the routing: it hashes the key to find the node, so there’s no extra hop.</p>`,
    rows:[['get(key) → value | miss', 'Single read', 'Client routes by hash ring'], ['mget(keys[]) → values', 'Batch read, fanned out per node in parallel', 'Big win for page renders'], ['set(key, value, ttl)', 'Write with expiry', 'Overwrites; last write wins'], ['delete(key)', 'Invalidate after a database write', 'Idempotent'], ['add(key, value, ttl)', 'Set only if absent', 'Used for locks and leases']],
    code:`// app code (cache-aside)
let user = await cache.get("u:42");
if (user === MISS) {
  user = await db.users.find(42);
  await cache.set("u:42", user, 300);   // 5-minute TTL as a backstop
}`, lang:'ts', title:'client usage'},
  data:{
    think:`<p>Inside one node it’s a hash table for lookups plus a recency structure for eviction. Across nodes it’s a <b>hash ring</b>: each node owns many small arcs (virtual nodes), so load is even and adding a node moves only its share of keys.</p>`,
    code:`// One node: O(1) get/set with LRU eviction (Map keeps insertion order)
class Node {
  private m = new Map<string, { v: Buffer; exp: number }>();
  constructor(private maxBytes: number, private used = 0) {}
  get(k: string, now: number) {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.exp <= now) { this.drop(k); return undefined; }   // lazy expiry
    this.m.delete(k); this.m.set(k, e);                       // mark as recently used
    return e.v;
  }
  set(k: string, v: Buffer, ttlMs: number, now: number) {
    this.drop(k);
    this.m.set(k, { v, exp: now + ttlMs }); this.used += v.length;
    while (this.used > this.maxBytes) this.drop(this.m.keys().next().value!); // evict LRU
  }
  private drop(k: string) { const e = this.m.get(k); if (e) { this.used -= e.v.length; this.m.delete(k); } }
}`, lang:'ts', title:'node.ts',
    stores:[['keys + values', 'RAM on cache nodes', 'The whole point'], ['ring membership', 'Small config service (etcd / ZooKeeper)', 'Clients need one agreed view, versioned'], ['source of truth', 'The application’s database', 'Cache is rebuilt from it']]},
  hld:{
    think:`<p>Apps embed a client that knows the ring. Each primary has an asynchronous replica, used only to take over after a failure. A config service holds membership and a ring version so all clients agree.</p>`,
    diagram:{n:[['app', 'client', 'App servers', 'client + ring', 0, 1], ['cfg', 'service', 'Config service', 'ring version', 1, 0], ['db', 'db', 'Source DB', '', 1, 2], ['a', 'cache', 'Cache node A', 'slots 0–5k', 2, 0], ['b', 'cache', 'Cache node B', 'slots 5k–11k', 2, 1], ['c', 'cache', 'Cache node C', 'slots 11k–16k', 2, 2], ['ra', 'cache', 'Replica A', 'async', 3, 0], ['rb', 'cache', 'Replica B', 'async', 3, 1], ['rc', 'cache', 'Replica C', 'async', 3, 2]],
      e:'app>cfg app>db app>a app>b app>c cfg>a a>ra b>rb c>rc',
      f:[['Hit: the client hashes the key to node B and reads it directly.', 'app>b:GET u:42 (slot 7120)'], ['Miss: read the database, then fill the cache with a TTL.', 'app>c:GET p:9 → miss|app>db:SELECT product 9|app>c:SET p:9 TTL 300'], ['Node A fails: the config service promotes its replica and publishes a new ring version.', 'cfg>a:health check fails|a>ra:replica promoted|app>cfg:ring v8']]},
    walk:['The client computes <code>hash("u:42")</code> and finds the slot’s owner (node B) from its cached ring.', 'It sends GET over a pooled connection; B answers from RAM in well under a millisecond.', 'On a miss the app reads the database and sets the value with a TTL.', 'After a database write the app deletes the key (not updates it), so the next read reloads fresh data.']},
  deep:[
    {t:'Partitioning: consistent hashing with virtual nodes',
      think:`<p>With <code>hash(key) mod N</code>, changing N remaps almost every key, and every remapped key is a miss that hits the database. With a <b>hash ring</b>, adding a node moves only about 1/N of keys. Giving each node 100+ virtual points smooths out the load. Redis Cluster uses a variant: 16,384 fixed hash slots assigned to nodes, so moving data means moving whole slots.</p>`,
      code:{lang:'ts', title:'ring.ts', src:`class Ring {
  private points: { h: number; node: string }[] = [];
  add(node: string, vnodes = 128) {
    for (let i = 0; i < vnodes; i++) this.points.push({ h: hash32(node + "#" + i), node });
    this.points.sort((a, b) => a.h - b.h);
  }
  owner(key: string): string {
    const h = hash32(key);
    let lo = 0, hi = this.points.length;          // first point clockwise from h
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.points[m].h < h) lo = m + 1; else hi = m; }
    return this.points[lo % this.points.length].node;
  }
}`}},
    {t:'Eviction and memory efficiency',
      think:`<p>True LRU needs a linked list update on every read. Redis instead <b>samples a few keys and evicts the oldest</b> (approximate LRU, and LFU is available), which is cheaper and close enough. Memcached uses a <b>slab allocator</b> (fixed-size chunk classes) to avoid fragmentation, at the cost of some wasted space when values don’t fit a class neatly. TTLs are enforced lazily on read plus a background sampler.</p>`},
    {t:'Hot keys, stampedes and node failure',
      think:`<p>Average load is rarely the problem; spikes are. Three patterns protect the database:</p>`,
      body:`<ul><li><b>Request coalescing (single-flight):</b> when 1,000 requests miss the same key at once, one goes to the database and the rest wait for its answer.</li><li><b>Early refresh:</b> refresh a popular key shortly before its TTL ends (probabilistically), so it never expires under load.</li><li><b>Hot-key replication:</b> copy the hottest keys to several nodes or to an in-process L1 cache with a few seconds’ TTL.</li><li><b>Node failure:</b> promote the replica, or let the ring move the slots elsewhere and accept a temporary miss rate. Rate-limit cache refills so a miss storm doesn’t overload the database.</li></ul>`}],
  bottlenecks:{
    think:`<p>I think about what happens to the <b>database</b> when the cache misbehaves, because that’s the real blast radius.</p>`,
    rows:[['One hot key', 'One node’s CPU or NIC saturates', 'L1 in-process cache; replicate the key to several nodes'], ['Popular key expires', 'Burst of identical database queries', 'Single-flight; early refresh; jittered TTLs'], ['Node dies', 'Miss rate jumps for ~1/N of keys', 'Replica promotion; refill rate limits; capacity for N−1'], ['Too many connections', 'Every app server × every node', 'Connection pooling or a proxy layer (e.g. mcrouter, twemproxy)'], ['Large values', 'Latency spikes, eviction churn', 'Cap value size; compress; store big blobs elsewhere']]},
  tradeoffs:{
    think:`<p>The big choices are where routing lives and how much to pay for availability.</p>`,
    rows:[['Routing', 'Client-side hash ring', 'Proxy tier', 'No extra hop; every client must agree on the ring version'], ['Replicas', 'One async replica per primary', 'None', 'Fast failover; a few writes lost on failover (fine for a cache)'], ['Eviction', 'Approximate LRU', 'Exact LRU / LFU', 'Cheap per operation; slightly worse hit rate in some workloads'], ['Writes', 'Delete on write (cache-aside)', 'Update in place', 'Avoids racing writers caching stale values; one extra miss']],
    more:['Per-tenant memory quotas and eviction isolation', 'Leases to stop a slow reader caching stale data (as described in Facebook’s memcache paper)', 'Warm-up of new nodes before they take traffic', 'Hot-key detection with a count-min sketch'],
    followups:[['How do you keep the cache consistent with the database?', 'Cache-aside with delete after the database commit, TTL as a safety net, and optionally change-data-capture events that delete keys. A known race (a slow read caches an old value after a delete) is closed with leases or versioned values.'], ['What happens when you add a node?', 'About 1/N of keys move to it. They start as misses, so add nodes before you need them and warm them gradually, or migrate slots while serving (Redis Cluster moves slots key by key).'], ['Why not just make the cache durable?', 'Then it becomes a database with all the costs of one (fsync, replication lag, backups). If data must survive, keep it in a database and cache it.']],
    traps:['Using mod-N hashing', 'Ignoring what a node failure does to the database', 'Updating cache values on write (racy) instead of deleting', 'Treating the cache as the only copy of important data']},
  refs:['l:consistent-hashing', 'l:cache-eviction', 'l:cache-failure-modes', 'l:redis-vs-memcached', 'l:cache-invalidation', 'pg:hash-ring', 'lab:lru-cache', 'case:kv-store']});

/* ------------------------------------------------------------------ */
S({id:'ticket-booking', level:'intermediate', icon:'🎟️', title:'Ticket booking', tags:['seat holds', 'concurrency', 'flash crowds'],
  tagline:'BookMyShow-style seat booking: never sell a seat twice, and survive a concert launch where a million people want 50,000 seats.',
  prompt:'Design a movie and event ticket booking system like BookMyShow.',
  focus:'preventing double booking under concurrency, seat holds during payment, and the launch-day flash crowd.',
  clarify:{
    think:`<p>Booking systems are mostly ordinary CRUD with one very sharp edge: <b>two people must never get the same seat</b>, and the busiest moment is a predictable stampede. I’ll confirm the hold behaviour and the launch-day numbers.</p>`,
    ask:[['Assigned seats or general admission?', 'Assigned seats from a seat map'], ['How long can a user hold seats while paying?', 'About 8 minutes'], ['Normal volume?', '~5M bookings a day across cinemas'], ['Biggest event?', 'A concert: ~1M people at launch for ~50K seats'], ['Payments?', 'External payment gateway'], ['Can the seat map be slightly stale?', 'Yes, but the final booking must be exact']],
    fr:['Browse cities, shows and seat maps', 'Hold seats for a few minutes', 'Pay and confirm; issue tickets', 'Release unpaid holds automatically'],
    nfr:['Zero double bookings (strong consistency on seats)', 'Seat map loads fast (can be a few seconds stale)', 'Survive launch-day spikes fairly', 'Payment failures never leave seats stuck'],
    out:['dynamic pricing', 'resale marketplace', 'venue management tools']},
  estimate:{
    think:`<p>Ordinary days are small. The interesting number is the <b>launch spike</b>: how many buyers compete for each seat, and how fast they arrive.</p>`,
    assume:['evening peak ≈ 5× the daily average', 'launch: most buyers click in the first minute'],
    inputs:[['perDay', 'Bookings per day', 5e6, [1e5, 1e6, 5e6, 2e7]], ['browse', 'Seat-map views per booking', 30, [10, 30, 100]], ['buyers', 'Launch buyers', 1e6, [1e5, 5e5, 1e6, 5e6]], ['seats', 'Launch seats', 5e4, [1e4, 5e4, 1e5]]],
    rows:[
      ['bpeak', 'Bookings at evening peak', v => v.perDay / 86400 * 5, '/s', 'per day ÷ 86,400 × 5'],
      ['mpeak', 'Seat-map reads at peak', (v, r) => r.bpeak * v.browse, '/s', 'bookings × views'],
      ['ratio', 'Buyers per seat at launch', v => v.buyers / v.seats, 'n', 'buyers ÷ seats'],
      ['lqps', 'Hold attempts at launch', v => v.buyers / 60, '/s', 'buyers in the first minute']],
    so:(r, f) => `Normal days are easy: bookings peak at ${f('bpeak')}, and seat-map reads (${f('mpeak')}) come from cache. The launch is the design driver: ${f('lqps')} hold attempts for ${f('seats')} seats (${r.ratio >= 1 ? f('ratio') + ' buyers per seat' : 'more seats than buyers'}). ${r.ratio > 3 ? 'Most of those requests can only fail, so a <b>virtual waiting room</b> should admit buyers at the rate the booking path can absorb instead of letting them all hit the seat rows.' : 'Demand is close to supply, so row-level locking in the database can take it directly.'}`},
  api:{
    think:`<p>I separate <b>hold</b> from <b>book</b>. Holding is the contested step, so it must be atomic for all requested seats. Booking turns a hold into a ticket after payment. Both take idempotency keys, because people double-click and mobile networks retry.</p>`,
    rows:[['GET /v1/shows?city=&date=&movie=', 'List shows', 'Cached, paginated'], ['GET /v1/shows/{id}/seats', 'Seat map with status', 'From cache, seconds stale'], ['POST /v1/holds', 'Hold {show_id, seat_ids[]} → {hold_id, expires_at}', 'All-or-nothing; 409 if any seat taken'], ['POST /v1/bookings', 'Confirm {hold_id, payment_id} → ticket', 'Idempotent on hold_id'], ['DELETE /v1/holds/{id}', 'Release early', 'Seats return immediately']],
    code:`POST /v1/holds
Idempotency-Key: 1a7e…
{ "show_id": "s_8812", "seat_ids": ["A7", "A8"] }

201 Created
{ "hold_id": "h_55f", "expires_at": "2026-11-13T19:42:00Z" }

409 Conflict
{ "error": "seats_unavailable", "seats": ["A8"] }`, title:'hold'},
  data:{
    think:`<p>One row per seat per show is the unit of contention, so I make the hold a single <b>conditional UPDATE</b> on those rows. Expired holds are treated as free inside the same WHERE clause, so a crashed sweeper can’t lock seats forever.</p>`,
    code:`CREATE TABLE show_seats (
  show_id         text,
  seat_id         text,
  status          text NOT NULL DEFAULT 'FREE',   -- FREE | HELD | BOOKED
  hold_id         text,
  hold_expires_at timestamptz,
  booking_id      text,
  PRIMARY KEY (show_id, seat_id)
);

-- Hold A7 and A8 atomically: both rows or neither
BEGIN;
UPDATE show_seats
   SET status = 'HELD', hold_id = 'h_55f', hold_expires_at = now() + interval '8 minutes'
 WHERE show_id = 's_8812' AND seat_id IN ('A7', 'A8')
   AND (status = 'FREE' OR (status = 'HELD' AND hold_expires_at < now()));
-- application: if rows updated <> 2 then ROLLBACK (409) else COMMIT
COMMIT;`,
    stores:[['shows, venues, movies', 'Postgres + search index + cache', 'Read-heavy catalogue'], ['show_seats, holds, bookings', 'Postgres, partitioned by show_id', 'Transactions where it matters'], ['seat-map snapshots', 'Redis', 'Fast reads; refreshed on change'], ['booking events', 'Outbox → Kafka', 'Tickets, emails, analytics']]},
  hld:{
    think:`<p>Browsing and booking have different consistency needs, so they are different services. A waiting room sits in front of hot events only. Payment is a separate service talking to the gateway, and confirmation events leave through an outbox so a crash can’t lose them.</p>`,
    diagram:{n:[['u', 'client', 'Users', 'app / web', 0, 1], ['wr', 'service', 'Waiting room', 'admit N/s', 1, 0], ['gw', 'lb', 'API gateway', '', 1, 1], ['cat', 'service', 'Catalog', 'shows, search', 2, 0], ['cache', 'cache', 'Seat-map cache', 'Redis', 3, 0], ['bk', 'service', 'Booking svc', 'holds + confirm', 2, 1], ['db', 'db', 'Bookings DB', 'by show_id', 3, 1], ['pay', 'service', 'Payment svc', '', 2, 2], ['psp', 'ext', 'Payment gateway', '', 3, 2], ['q', 'queue', 'Events', 'tickets, email', 4, 2]],
      e:'u>wr wr>gw u>gw gw>cat cat>cache gw>bk bk>db bk>cache bk>pay pay>psp db>q',
      f:[['Launch day: users queue in the waiting room and are admitted at a steady rate.', 'u>wr:join queue|wr>gw:admitted (signed token)'], ['Hold: one conditional update claims both seats or neither; the seat-map cache is updated.', 'u>gw:select A7, A8|gw>bk:POST /holds|bk>db:UPDATE … 2 rows|bk>cache:A7, A8 held'], ['Pay and confirm: charge, then HELD → BOOKED and an outbox event in the same transaction.', 'u>gw:pay|gw>bk:POST /bookings|bk>pay:charge ₹640|pay>psp:payment intent|bk>db:BOOKED + outbox row|db>q:booking.confirmed']]},
    walk:['The user opens the seat map; it comes from the Redis snapshot for that show.', 'They pick A7 and A8; the booking service runs the conditional UPDATE. Two rows changed → 201 with an 8-minute hold; fewer → rollback and 409.', 'They pay; on success the booking service marks the seats BOOKED, inserts the booking and an outbox row in one transaction.', 'A relay publishes the outbox event; ticket and email services consume it.']},
  deep:[
    {t:'Never double-book',
      think:`<p>Options, from heaviest to lightest: <b>SELECT … FOR UPDATE</b> then update (correct, holds locks across a round trip); <b>optimistic versioning</b> (retry on conflict); a <b>conditional UPDATE</b> (one statement, the database checks and writes atomically). I pick the conditional update. A Redis SETNX hold would be faster, but then two systems must agree on who owns a seat, and the database is the source of truth anyway.</p>`,
      body:`<p>Two subtle points: the WHERE clause treats expired holds as free, so correctness doesn’t depend on a sweeper; and seats are always updated in a consistent order (sorted seat ids), so two multi-seat holds can’t deadlock each other.</p>`},
    {t:'Payment races with the hold timer',
      think:`<p>The nasty case: a user pays at minute 7:59, the gateway takes 30 seconds, the hold expires, and someone else grabs the seat. So when payment <b>starts</b> I extend the hold (once, by a few minutes). If a payment still succeeds after the seat was resold, the booking service refunds automatically. Payment results arrive by webhook and are processed idempotently by hold id; a reconciliation job polls the gateway for payments with no final status.</p>`},
    {t:'Surviving the launch: a virtual waiting room',
      think:`<p>With 20 buyers per seat, 95% of requests will fail no matter what. Letting all of them hit the seat rows creates lock contention and timeouts for the 5% who could succeed. A <b>waiting room</b> admits users at a rate the booking path can serve (say 2,000 per minute), with a signed token checked at the gateway. Assign queue positions randomly among people who arrived before the sale opened (fairer than “fastest connection wins”), and FIFO after that. Show live queue position and “sold out” early.</p>`}],
  bottlenecks:{
    think:`<p>The hot spot is predictable: all launch traffic targets one show, which lives on one database partition.</p>`,
    rows:[['One huge show on one partition', 'Lock waits and timeouts on show_seats', 'Waiting room limits admission; keep transactions tiny; split very large venues by section'], ['Stale seat map', 'Users pick seats that are already held → 409s', 'Refresh the snapshot on every change; return the conflicting seats so the UI updates instantly'], ['Abandoned holds', 'Seats look sold out but aren’t paid', 'Short hold TTL; release on app close; expired holds count as free'], ['Payment gateway slow', 'Holds expire mid-payment', 'Extend hold when payment starts; breaker; second gateway'], ['Bots', 'Holds from a few accounts', 'Per-account seat caps, CAPTCHA at the waiting room, device checks']]},
  tradeoffs:{
    think:`<p>The theme: be <b>strict where money and seats are involved</b>, relaxed everywhere else.</p>`,
    rows:[['Seat claim', 'Conditional UPDATE in the database', 'Redis locks', 'One source of truth; database load during spikes'], ['Hold length', '~8 minutes', 'Pay-first, no hold', 'No refunds for lost races; abandoned holds lock seats briefly'], ['Launch traffic', 'Waiting room', 'Let everyone in', 'Fair and stable; adds a queue step for users'], ['Catalogue', 'Eventually consistent cache', 'Read from primary', 'Fast browsing; occasional stale seat status']],
    more:['“Best available” seat selection (search contiguous free seats per row)', 'Group bookings that must sit together', 'Dynamic hold length based on demand', 'Multi-region read replicas for browsing'],
    followups:[['Why not lock seats only in Redis?', 'It works and is fast, but then Redis and the database must agree on ownership through crashes and failovers (Redis replication is asynchronous). Unless the database truly can’t keep up, one source of truth is simpler and safer.'], ['Payment succeeds but your service crashes before marking BOOKED. Now what?', 'The gateway webhook (or the reconciliation poll) delivers the result again; confirm is idempotent by hold id. If the hold already expired and the seat was resold, the booking service refunds automatically and notifies the user.'], ['How do you show live availability to thousands of viewers?', 'Push seat changes over WebSocket or SSE from the snapshot, throttled to a few updates per second per show; the final check is always the database update.']],
    traps:['Check-then-update in two statements (a race)', 'Holds that depend on a sweeper to expire', 'No plan for the launch spike', 'Forgetting payment-after-expiry and refunds']},
  refs:['case:irctc', 'l:locking', 'l:transactions-isolation', 'l:saga-outbox', 'l:idempotency-rate-limit-headers', 'l:load-shedding', 'pg:isolation']});
})();
