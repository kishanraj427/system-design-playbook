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
  tagline:'The warm-up question. People open links 100 times more than they create them, so it is really about making unique codes and caching.',
  prompt:'Design a URL shortener like bit.ly.',
  focus:'how short codes are made without clashes, and how redirects stay fast.',
  clarify:{
    think:`<p>I do not draw anything yet. A URL shortener sounds easy, so the interviewer wants to see if I find the two real problems. One is <b>making unique short codes</b>, which are letters and digits (called base62). The other is <b>serving a huge number of redirects fast</b>. First I confirm the traffic and which extras are in scope.</p>`,
    ask:[['How many new links a day?', '100 million a day'], ['How many redirects for each new link?', 'About 100. Reads far outnumber writes'], ['Custom names? Expiry dates?', 'Both are optional. By default links never expire'], ['Do we need click counts?', 'Counts per link per day. They may be a few minutes late'], ['Can a link be edited to point somewhere else?', 'No. Links never change, and are deleted only for abuse']],
    fr:['Create a short link for a long address (a custom name and an expiry date are optional)', 'Send a visitor from the short link to the long address (a redirect)', 'Show click counts for each link'],
    nfr:['Redirects: 99 out of 100 answered in under about 50 ms on the server (p99)', '99.99% availability for redirects. Creating links can be a little lower', 'Codes never clash, and are short (7 or 8 characters at most)', 'Codes are hard to guess in order'],
    out:['user account screens', 'editing links', 'QR codes', 'detailed location stats']},
  estimate:{
    think:`<p>Three numbers matter. First, redirects a second, which sizes the read path. Second, the total number of links, which sizes storage and the code length. Third, how much is worth keeping in a cache.</p>`,
    assume:['Peak is about 3 times the average', 'About 500 bytes for each stored link', 'The cache holds 20% of a day’s redirects. That is an upper limit, because popular links repeat', 'These numbers are bigger than in the case study, so we can see when splitting the data (sharding) is needed'],
    inputs:[['perDay', 'New links per day', 1e8, [1e6, 1e7, 1e8, 5e8, 1e9]], ['ratio', 'Redirects per new link', 100, [10, 50, 100, 500]], ['years', 'Keep links for', 5, [1, 3, 5, 10], 'years']],
    rows:[
      ['wqps', 'Creates (average)', v => v.perDay / 86400, '/s', 'links per day ÷ 86,400 s'],
      ['rqps', 'Redirects (average)', (v, r) => r.wqps * v.ratio, '/s', 'creates × read ratio'],
      ['rpeak', 'Redirects (peak)', (v, r) => r.rqps * 3, '/s', '3 × average'],
      ['total', 'Links stored', v => v.perDay * 365 * v.years, 'n', 'per day × 365 × years'],
      ['storage', 'Storage', (v, r) => r.total * 500, 'B', 'links × 500 B'],
      ['chars', 'Code length needed (base62)', (v, r) => { let L = 1; while (Math.pow(62, L) < r.total * 10) L++; return L; }, 'chars', 'smallest L where 62^L is at least 10 × links (room to spare)'],
      ['cache', 'Cache size', (v, r) => r.rqps * 86400 * 0.2 * 500, 'B', '20% of a day’s redirects × 500 B']],
    so:(r, f) => `Creating links (${f('wqps')}) is easy for one database. Redirects at ${f('rpeak')} at peak are the real load, so most of them must come from a cache. ${f('total')} links need <b>${r.chars}-character</b> base62 codes. Storage of ${f('storage')} ${r.storage > 5e12 ? 'is more than one database can comfortably hold, so split it by short code from the start' : 'fits one database plus copies, and can be split later'}. A cache of ${f('cache')} ${r.cache > 5e11 ? 'needs a small Redis cluster' : 'fits on one or two cache machines'}.`},
  api:{
    think:`<p>Two public calls matter: create a link, and redirect. Create needs an idempotency key, so a retried request does not make two links. For the redirect I must choose between status 301 and 302. That choice changes the click counts, so I say it out loud.</p>`,
    rows:[['POST /v1/links', 'Create a link from {long_url, alias?, expires_at?}. Returns {code, short_url}', 'Needs an API key and an Idempotency-Key header. Returns 409 if the custom name is taken'], ['GET /{code}', 'Redirect to the long address', 'Use 302 with a short Cache-Control, so every click is counted. Browsers keep a 301 forever'], ['GET /v1/links/{code}/stats', 'Clicks per day', 'Owner only'], ['DELETE /v1/links/{code}', 'Remove a link (the owner or the abuse team)', 'Mark it deleted, and clear the cache']],
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
    think:`<p>The one busy question is “which long address belongs to this code?”. That is a lookup by one key, with no joins. So a key-value store, or Postgres split by code, fits. Click counts are a different pattern: many small additions. They get their own table, filled in the background.</p>`,
    code:`CREATE TABLE links (
  code        varchar(10) PRIMARY KEY,      -- base62 text, also used to pick the shard
  long_url    text        NOT NULL,
  owner_id    bigint,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,                  -- NULL means it never expires
  deleted     boolean     NOT NULL DEFAULT false
);

CREATE TABLE click_counts (                  -- filled by the counting job, not by redirects
  code    varchar(10),
  day     date,
  clicks  bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (code, day)
);`,
    stores:[['links', 'DynamoDB or Cassandra, or Postgres split by code', 'Lookups by one key, and it scales out'], ['hot codes', 'Redis (cache-aside)', 'Most redirects use a small set of popular links'], ['click events', 'Kafka, then a counting job', 'Keeps counting off the redirect path'], ['click_counts', 'The same store, or a column store', 'Small, and read by (code, day)']]},
  hld:{
    think:`<p>I keep the read path apart from the write path. They differ in size, and in how much failure they can take. The redirect service only talks to the cache and the database. Creating links goes through a separate API that gets numbers from an allocator.</p>`,
    diagram:{n:[['u', 'client', 'Browser', '', 0, 1], ['lb', 'lb', 'Load balancer', '', 1, 1], ['red', 'service', 'Redirect svc', 'GET /{code}', 2, 1], ['api', 'service', 'Create API', 'POST /links', 2, 2], ['cache', 'cache', 'Redis', 'code → URL', 3, 0], ['db', 'db', 'Links DB', 'sharded by code', 3, 1], ['ids', 'service', 'ID allocator', 'blocks of 1,000', 3, 2], ['q', 'queue', 'Click events', 'Kafka', 4, 0], ['agg', 'service', 'Aggregator', 'counts per day', 4, 1]],
      e:'u>lb lb>red lb>api red>cache red>db red>q api>ids api>db q>agg agg>db',
      f:[['Create: the API takes the next number from a block it reserved earlier, turns it into base62 and inserts the row.', 'u>lb:POST /links|lb>api|api>ids:next id (local block)|api>db:INSERT 4fRz9Ka'], ['Redirect: a cache hit answers in about a millisecond. On a miss, the server reads the database and fills the cache.', 'u>lb:GET /4fRz9Ka|lb>red|red>cache:GET 4fRz9Ka|red>db:miss → SELECT'], ['Every redirect sends a click event. The counting happens in the background.', 'red>q:click event|q>agg|agg>db:+1 for (code, day)']]},
    walk:['The browser asks for <code>/4fRz9Ka</code>. The load balancer sends it to a redirect server.', 'The server checks Redis. On a miss, it reads the links table by primary key and saves the answer in the cache. It also saves “not found” for a short time.', 'It replies 302 with the long address, then sends a click event without waiting.', 'The counting job groups click events and adds them to <code>click_counts</code>.']},
  deep:[
    {t:'Making short codes without clashes',
      think:`<p>There are three kinds of answer. I compare them, and do not jump to one. Hashing the address and cutting it short, or picking random codes, both need a clash check on every insert. A <b>counter turned into base62</b> can never clash, but it needs coordination. I avoid one global lock by giving each server a <b>block of 1,000 numbers</b> at a time.</p>`,
      body:`<p>Base62 uses 62 characters: 0 to 9, a to z and A to Z.</p><table class="tbl"><thead><tr><th>Approach</th><th>Clashes</th><th>Cost</th></tr></thead><tbody>
<tr><td>MD5 or SHA of the address, first 7 characters</td><td>Possible. Check, then hash again with extra salt</td><td>A read before every write. The same address gives the same code, which may be a feature</td></tr>
<tr><td>Random 7 characters</td><td>Rare at first, then more often. With 183 billion of 3.5 trillion codes used, about 5% of new codes hit an old one</td><td>A conditional insert and a retry</td></tr>
<tr><td>Counter turned into base62</td><td>Never</td><td>Needs an allocator. Codes come in order, so scramble them with a reversible shuffle if that matters</td></tr></tbody></table>
<p>The allocator can be a database sequence or a small replicated service. Each create server asks for a range, such as 1,000 numbers, and uses it locally. So the allocator sees one request for every 1,000 links. If a server crashes, the rest of its block is skipped. Gaps do not matter.</p>`,
      code:{lang:'ts', title:'ids.ts', src:`const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function base62(n: bigint): string {
  if (n === 0n) return "0";
  let s = "";
  while (n > 0n) { s = ALPHABET[Number(n % 62n)] + s; n /= 62n; }
  return s;
}

// Each server reserves a block of numbers, then hands them out locally.
export class IdBlock {
  private next = 0n; private end = 0n;
  constructor(private reserve: (size: number) => Promise<bigint>, private size = 1000) {}
  async take(): Promise<bigint> {
    if (this.next >= this.end) {               // the block is used up: ask for a new one
      this.next = await this.reserve(this.size); // for example: UPDATE counter SET v = v + 1000 RETURNING v - 1000
      this.end = this.next + BigInt(this.size);
    }
    return this.next++;
  }
}`}},
    {t:'Keeping redirects fast and the database quiet',
      think:`<p>A few links get most of the clicks. So cache-aside in Redis, with an expiry time, works well. Links never change, so only a deletion needs to clear the cache. The less obvious risk is <b>lookups for codes that do not exist</b>. A bot guessing random codes would hammer the database, so I cache “not found” for a minute and limit requests per IP.</p>`,
      body:`<ul><li><b>301 or 302:</b> a 301 lets browsers and CDNs skip us next time, which is cheaper, but we lose the click. I use 302 with a short <code>max-age</code>, or 301 for customers who opt out of counts.</li><li><b>Viral links:</b> one Redis key can get over 100,000 reads a second. Keep a small in-memory LRU cache (5 to 10 seconds) on each redirect server, in front of Redis.</li><li><b>Split the data by a hash of the code</b>, and not by creation time. Then new, busy links spread across shards.</li></ul>`},
    {t:'Counting clicks without slowing redirects',
      think:`<p>Adding to a counter row inside the redirect would add a write to every read, and make hot rows for viral links. Instead the redirect sends an event and moves on. The counting job adds up events in memory for a few seconds, then writes one update for each (code, day). Counts lag a little, which the requirements allow.</p>`}],
  bottlenecks:{
    think:`<p>I walk along the request path and ask: what is the first thing to fall over at 10 times the load? Here it is the hottest cache keys, then the shard that holds them.</p>`,
    rows:[['A link goes viral', 'One Redis shard has high CPU, and p99 rises for unrelated links on it', 'Add an in-memory LRU cache on the redirect servers, and serve popular links from the CDN with short times'], ['One database shard grows faster than the others', 'Disk and IOPS alarms on one shard', 'Split by a hash of the code, and add shards with consistent hashing'], ['The ID allocator is unavailable', 'Creating links fails once local blocks run out', 'Large blocks give minutes of room. Run the allocator as a replicated sequence'], ['Abuse: phishing links and code guessing', 'A spike in 404s or in reports', 'Limit creates and lookups, check addresses against blocklists, and cache “not found”'], ['The cache is empty after a restart', 'Database reads jump', 'Warm it with yesterday’s top links, and merge requests for the same code into one']]},
  tradeoffs:{
    think:`<p>I sum up the decisions, and I say plainly what each one costs.</p>`,
    rows:[['Making codes', 'Counter blocks and base62', 'Hash or random codes', 'No clash checks and short codes. Codes are in order unless scrambled'], ['Redirect status', '302 with short caching', '301 permanent', 'Complete click counts. More traffic reaches us'], ['Store', 'Key-value store, split by code', 'One Postgres', 'Scales evenly for lookups by key. Counts need a separate store'], ['Click counts', 'Events, then totals in the background', 'Add in the redirect itself', 'Fast redirects. Counts lag by seconds']],
    more:['Custom domains for each customer', 'Expiry: delete when a link is read, plus a background sweeper', 'Serve redirects from several regions. Links never change, so copying them slowly between regions is safe', 'A scanning pipeline for harmful new links'],
    followups:[['How do custom names work?', 'They go in the same table. Use a conditional insert (<code>INSERT … ON CONFLICT DO NOTHING</code>, or a DynamoDB condition) that returns 409 if the name is taken. Keep custom names in a space that generated codes can never reach. For example, generated codes are exactly 7 characters, and custom names must be 8 or more. Then a future counter value can never clash with a custom name.'], ['Two users shorten the same address. Do they get the same code?', 'You can return the old code, which needs an index on a hash of the address and reveals that someone else shortened it. Or you can make a new code, which is simpler and keeps counts separate per user. Most services make a new code for each user and only dedupe inside one account.'], ['How would you go multi-region?', 'Links never change, so copy them slowly to every region and serve redirects locally. Give each region its own range of numbers, or a region bit in the number, so creating links never needs a cross-region call.']],
    traps:['Spending ten minutes choosing a hash function', 'Cutting an MD5 short without handling clashes', 'Designing the write path in detail when reads are 100 times bigger', 'Updating a click counter inside every redirect']},
  refs:['case:url-shortener', 'l:unique-ids', 'l:cache-strategies', 'l:consistent-hashing', 'lab:snowflake-id', 'pg:cache-sim']});

/* ------------------------------------------------------------------ */
S({id:'rate-limiter', level:'beginner', icon:'🚦', title:'Rate limiter', tags:['token bucket', 'Redis', 'gateway'],
  tagline:'Small state, huge request rate, and a failure that can take your whole API down if you get it wrong.',
  prompt:'Design a rate limiter for a public API.',
  focus:'which algorithm to use, how to make the check safe across many gateway servers, and what happens when the limiter itself fails.',
  clarify:{
    think:`<p>“Rate limiter” can mean a library inside one program, or a shared service in front of a whole fleet. I pin down where it runs and what it limits by. Most important, I ask what should happen if the limiter is down. That answer decides whether the limiter can take the API down.</p>`,
    ask:[['Client-side or server-side?', 'Server-side, in the API gateway'], ['Limit by what?', 'The API key (per plan), plus the IP address for routes with no login'], ['What do the rules look like?', 'For example 100 requests a minute with bursts up to 20. Some routes cost more'], ['How many gateway servers?', 'About 50, in 2 regions'], ['What if the limiter is down?', 'Allow requests for normal routes (fail open). Block them for login and OTP (fail closed)'], ['Exact or approximate?', 'Within a few percent is fine']],
    fr:['Check each request against the rules for its key, IP and route', 'Reject requests over the limit with status 429, a Retry-After header and rate-limit headers', 'Change rules without a new deploy'],
    nfr:['Adds under about 2 ms at p99 (99 out of 100 checks are faster)', 'Correct across all gateways, so a client cannot multiply its limit by spreading requests', 'A limiter outage must not become an API outage'],
    out:['monthly billing and quotas', 'DDoS protection at the network layer']},
  estimate:{
    think:`<p>The data is tiny. What sizes this system is the <b>request rate</b>, because every API call needs a check.</p>`,
    assume:['About 100 bytes for each bucket in Redis (key, tokens, time and overhead)', 'One Redis call for each request', 'About 100,000 operations a second for each Redis shard is a safe budget'],
    inputs:[['rps', 'API requests per second (peak)', 5e5, [1e4, 1e5, 5e5, 1e6, 5e6], '/s'], ['keys', 'Active API keys', 1e6, [1e4, 1e5, 1e6, 1e7]], ['nodes', 'Gateway servers', 50, [5, 20, 50, 200], 'servers']],
    rows:[
      ['perNode', 'Checks per gateway', v => v.rps / v.nodes, '/s', 'requests ÷ gateways'],
      ['mem', 'Bucket memory', v => v.keys * 100, 'B', 'keys × 100 B'],
      ['ops', 'Redis operations', v => v.rps, '/s', 'one atomic script for each request'],
      ['shards', 'Redis shards needed', (v, r) => Math.max(1, ceil(r.ops / 1e5)), 'shards', 'operations ÷ 100,000 for each shard']],
    so:(r, f, v) => `The state is tiny (${f('mem')}), but every request needs a check, so Redis must absorb ${f('ops')}. That needs <b>${r.shards} shard${r.shards > 1 ? 's' : ''}</b>${r.shards > 1 ? ', split by key so each key’s bucket lives on exactly one shard' : ''}. Each of the ${v.nodes} gateways makes ${f('perNode')}. ${r.perNode > 2e4 ? 'At that rate it is worth leasing small batches of tokens to each gateway, to save round trips for the busiest keys.' : 'One Redis round trip for each request is affordable.'}`},
  api:{
    think:`<p>The limiter sits inside the gateway, so its “API” is the decision it returns plus the headers clients see. I also add an admin API for rules, so limits can change without a deploy.</p>`,
    rows:[['check(key, route, cost) → {allowed, remaining, resetMs}', 'A call inside the gateway (a library or a sidecar) on every request', 'Must answer in about a millisecond'], ['PUT /v1/rules/{id}', 'Create or update a rule {match, limit, window, burst, failMode}', 'Admin only. Pushed to gateways within seconds'], ['GET /v1/limits/{key}', 'Current usage for one key', 'For support and dashboards']],
    code:`HTTP/1.1 429 Too Many Requests
Retry-After: 2
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 2
Content-Type: application/json

{ "error": "rate_limited", "message": "Plan limit 100 req/min exceeded" }`, title:'what a blocked client sees'},
  data:{
    think:`<p>There are two kinds of data. <b>Rules</b> are small, rarely change and are read everywhere, so they live in a database and are cached in every gateway. <b>Counters</b> are tiny, change constantly and are short-lived, so they live in Redis with an expiry time.</p>`,
    code:`CREATE TABLE rate_rules (
  id          serial PRIMARY KEY,
  match_plan  text,            -- 'free', 'pro', or NULL for any plan
  match_route text,            -- '/v1/search*', or NULL for any route
  limit_n     int  NOT NULL,   -- tokens per window
  window_s    int  NOT NULL,   -- refill window in seconds
  burst       int  NOT NULL,   -- bucket size
  fail_mode   text NOT NULL DEFAULT 'open'  -- 'open' or 'closed'
);
-- Counters live in Redis: HASH rl:{api_key}:{rule_id} -> { tokens, ts }, expiring after 2 x window`,
    stores:[['rules', 'Postgres, plus a copy in memory in each gateway', 'Read on every request, and rarely changed'], ['buckets', 'A Redis cluster, split by key', 'Atomic scripts, under a millisecond, and expiry cleans up idle keys']]},
  hld:{
    think:`<p>Every request already passes the gateway, so the check goes there. Redis holds the shared buckets. A rules service pushes settings into each gateway’s local cache. The backend never sees rejected traffic.</p>`,
    diagram:{n:[['c', 'client', 'Clients', 'API keys', 0, 1], ['gw', 'lb', 'API gateway', 'limiter middleware', 1, 1], ['local', 'cache', 'Local cache', 'rules', 1, 0], ['redis', 'cache', 'Redis cluster', 'buckets by key', 2, 0], ['svc', 'service', 'Backend services', '', 3, 1], ['rules', 'service', 'Rules service', '', 2, 2], ['rdb', 'db', 'Rules DB', '', 3, 2]],
      e:'c>gw gw>local gw>redis gw>svc rules>rdb rules>gw',
      f:[['Allowed: one atomic script on the key’s shard refills the bucket and takes a token. Tokens remain, so the request passes.', 'c>gw:GET /v1/orders (key k_42)|gw>redis:EVAL bucket k_42|gw>svc:allowed (37 left)'], ['Blocked: the bucket is empty, so the gateway answers 429 and the backend never sees the request.', 'c>gw:request 101 this minute|gw>redis:EVAL → 0 tokens|gw>c:429, Retry-After 2'], ['Rule change: it is saved, then pushed to every gateway within seconds.', 'rules>rdb:pro plan → 1,000/min|rules>gw:push rules v12|gw>local:cache v12']]},
    walk:['A request arrives with API key <code>k_42</code>. The gateway matches it to a rule in its local cache.', 'It runs one Lua script on the Redis shard that owns <code>rl:k_42:7</code>. The script refills the bucket from the elapsed time, then takes one token if there is one.', 'If allowed, the gateway forwards the request with <code>RateLimit-Remaining</code>. If denied, it replies 429 with <code>Retry-After</code>.', 'If Redis does not answer within about 5 ms, the gateway applies the rule’s fail mode.']},
  deep:[
    {t:'Choosing the algorithm',
      think:`<p>I list the usual options and the flaw of each, then pick one. The requirement says bursts are allowed, so a <b>token bucket</b> fits. It stores two numbers for each key: the tokens left and the time of the last refill. It allows a burst up to the bucket size, then a steady rate.</p>`,
      body:`<table class="tbl"><thead><tr><th>Algorithm</th><th>Weakness</th></tr></thead><tbody>
<tr><td>Fixed window counter</td><td>Up to 2 times the limit across a window edge (100 at 0:59 and 100 at 1:00)</td></tr>
<tr><td>Sliding log</td><td>Exact, but it stores one timestamp for every request</td></tr>
<tr><td>Sliding window counter</td><td>Approximate (it weights the previous window), but good and cheap</td></tr>
<tr><td>Token bucket</td><td>Allows bursts by design, and needs two numbers for each key</td></tr>
<tr><td>Leaky bucket (a queue)</td><td>Smooths the output but adds waiting. Better for outgoing traffic</td></tr></tbody></table>`,
      code:{lang:'ts', title:'token-bucket.ts', src:`// Refill from the elapsed time when a request arrives, so no background timer is needed.
export function take(b: { tokens: number; ts: number }, now: number,
                     ratePerMs: number, capacity: number, cost = 1) {
  const tokens = Math.min(capacity, b.tokens + (now - b.ts) * ratePerMs);
  if (tokens < cost) return { allowed: false, state: { tokens, ts: now },
                              retryMs: Math.ceil((cost - tokens) / ratePerMs) };
  return { allowed: true, state: { tokens: tokens - cost, ts: now }, retryMs: 0 };
}`}},
    {t:'Making the check safe across 50 gateways',
      think:`<p>Suppose two gateways both read “1 token left” and both write back “0”. Both requests pass. A read followed by a write from the application is a race. So I run the whole refill-and-take inside Redis as one <b>Lua script</b>, which Redis runs as a single step, so no two checks can mix. I also use Redis’s own clock, so gateways with different clocks still agree.</p>`,
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
      think:`<p>This is where the design can do more harm than good. If every request waits on Redis and Redis stalls, the whole API stalls. So the call gets a <b>tight timeout</b> of a few ms, and a circuit breaker. When the breaker trips, normal routes <b>fail open</b> but fall back to a local, rough limit (the rule’s limit ÷ the number of gateways). Sensitive routes such as login and OTP <b>fail closed</b>, because unlimited guessing there is worse than a short outage.</p>`}],
  bottlenecks:{
    think:`<p>The limiter sits on the critical path of every request. So I look for added delay and for single hot keys.</p>`,
    rows:[['One very busy key, such as a big customer', 'One Redis shard runs hot', 'Lease tokens to each gateway in small batches for that key, and refill them locally'], ['A Redis round trip on every request', 'The p99 of the whole API rises with Redis latency', 'Keep Redis in the same zone, use pipelining, and skip the check for keys far below their limit'], ['A global limit across regions', 'Either cross-region delay or too many requests let through', 'Split the limit by region, and rebalance from the traffic you see'], ['Local maps in gateways that grow without limit', 'Memory keeps growing', 'Use an LRU cache with a size cap, and expire idle entries']]},
  tradeoffs:{
    think:`<p>The main tension is <b>accuracy against speed and availability</b>. A perfectly exact global limit needs a shared store on every request.</p>`,
    rows:[['Algorithm', 'Token bucket', 'Sliding window counter', 'Supports bursts with two numbers. Bursts are allowed by design'], ['Where state lives', 'Shared Redis', 'Local memory only', 'Correct across gateways, and it costs a network call'], ['Failure behaviour', 'Fail open (closed for login)', 'Always closed', 'Availability first. A brief period of too many requests during incidents'], ['Hot keys', 'Batches of token leases', 'An exact check on every request', 'Fewer calls, and it may overshoot by one batch']],
    more:['Cost-based limits (an export costs 50 tokens)', 'Fairness between tenants inside a shared limit', 'Dashboards that show who is limited and why', 'Limits that tighten when backends are overloaded (load shedding)'],
    followups:[['How do you limit by cost instead of by count?', 'Pass a cost into the same token bucket. A search takes 10 tokens and a GET takes 1. The rules set the cost for each route.'], ['How would you enforce one global limit across three regions?', 'Give each region a share, for example 40, 30 and 30 from recent traffic, and rebalance every few seconds. Or accept up to one window of overshoot. A synchronous cross-region check adds about 100 ms to every request and is not worth it.'], ['Client, gateway or service: where should limits live?', 'Put per-key and per-IP limits in the gateway. It is one place, and it protects everything behind it. Services keep their own limits on concurrent work and their own load shedding, because only they know when they are overloaded. Clients should obey Retry-After and back off with jitter.']],
    traps:['Choosing a fixed window without mentioning the burst at the window edge', 'Reading with GET and then writing with SET from the application (a race)', 'No answer to “what if Redis is down?”', 'Returning 429 without Retry-After or rate-limit headers']},
  refs:['case:rate-limiter', 'l:rate-limiting', 'pg:rate-limiter', 'lab:token-bucket', 'lab:sliding-window', 'l:idempotency-rate-limit-headers', 'l:load-shedding']});

/* ------------------------------------------------------------------ */
S({id:'notification-service', level:'beginner', icon:'🔔', title:'Notification service', tags:['queues', 'priorities', 'providers'],
  tagline:'Push, SMS and email for 100M users. The hard parts are priorities, duplicates and third-party providers you do not control.',
  prompt:'Design a notification system that sends push notifications, SMS and email for an app with 100M users.',
  focus:'keeping OTPs fast during a marketing blast, avoiding duplicate sends, and surviving a provider outage.',
  clarify:{
    think:`<p>Notification systems fail in predictable ways. Marketing floods delay one-time passwords (OTPs). Retries send duplicates. One SMS provider goes down. I ask about priorities and delivery guarantees first, because they shape the queues.</p>`,
    ask:[['Which channels?', 'Mobile push, SMS and email'], ['Who sends?', 'Internal services: OTPs, order updates and marketing campaigns'], ['How much volume?', 'About 1 billion notifications a day, with marketing bursts several times the average'], ['What speed targets?', 'OTPs within about 5 s, order updates within a minute, and marketing within hours'], ['User preferences?', 'Opt out by category and channel, and quiet hours for marketing'], ['Is a duplicate acceptable?', 'Rarely. Never for payment messages, and never an OTP storm']],
    fr:['A send API: user, template, parameters and priority', 'Respect preferences, opt-outs and quiet hours', 'Templates for each channel and language', 'Track delivery status for each channel', 'Scheduled and bulk campaigns'],
    nfr:['OTPs never wait behind marketing', 'No lost notifications (at-least-once delivery, with duplicates removed)', 'Survive one provider failing', '99.95% availability for the send API'],
    out:['the in-app inbox screen', 'A/B testing of message text']},
  estimate:{
    think:`<p>I want three things. The average and burst rate sizes the workers and queues. The SMS volume matters because each message costs real money. The size of the status log sizes the storage.</p>`,
    assume:['An SMS costs about $0.005 (illustrative, and it varies a lot by country)', 'About 500 bytes for each delivery-status record, kept for 30 days'],
    inputs:[['perDay', 'Notifications per day', 1e9, [1e7, 1e8, 1e9, 5e9]], ['burst', 'Peak ÷ average', 5, [2, 5, 10, 20], '×'], ['sms', 'Share sent by SMS', 2, [0.5, 2, 5, 10], '%']],
    rows:[
      ['avg', 'Sends (average)', v => v.perDay / 86400, '/s', 'per day ÷ 86,400'],
      ['peak', 'Sends (peak)', (v, r) => r.avg * v.burst, '/s', 'average × burst factor'],
      ['smsDay', 'SMS per day', v => v.perDay * v.sms / 100, 'n', 'per day × SMS share'],
      ['smsCost', 'SMS cost per day', (v, r) => r.smsDay * 0.005, '$', 'SMS × $0.005'],
      ['log', 'Status log (30 days)', v => v.perDay * 500 * 30, 'B', 'per day × 500 B × 30']],
    so:(r, f) => `Workers and queues must absorb ${f('peak')} at peak, not the ${f('avg')} average. So marketing gets its own paced queue. SMS is the expensive channel: ${f('smsCost')} a day at this mix${r.smsCost > 2e4 ? ', so prefer push, and keep SMS for OTPs and critical alerts' : ''}. The ${f('log')} status log is write-heavy and short-lived. A wide-column store with expiry times fits better than the main database.`},
  api:{
    think:`<p>Senders should not know about providers or device tokens. They say “user 42, template order_shipped, these values, high priority”. They also send an idempotency key, so their retries do not notify twice.</p>`,
    rows:[['POST /v1/notifications', 'Send to one user: {user_id, template, params, priority, channels?, send_at?}', 'Needs an Idempotency-Key. Returns 202 and an id'], ['POST /v1/campaigns', 'Send in bulk to a segment, on a schedule', 'Paced, and can be cancelled'], ['GET /v1/notifications/{id}', 'Status for each channel', 'queued, sent, delivered or failed'], ['PUT /v1/users/{id}/preferences', 'Opt-outs and quiet hours', 'For each category and channel'], ['POST /hooks/{provider}', 'Delivery receipts from providers', 'Signed webhooks']],
    code:`POST /v1/notifications
Idempotency-Key: order-77812-shipped
{ "user_id": 42, "template": "order_shipped", "priority": "high",
  "params": { "order": "77812", "eta": "Tue" } }

202 Accepted
{ "id": "ntf_9Qx2", "status": "queued" }`, title:'send'},
  data:{
    think:`<p>Preferences, templates and device tokens are classic relational data, and they are read often. Delivery records are huge, mostly appended, and kept only for weeks. So they go to a wide-column store with expiry times.</p>`,
    code:`CREATE TABLE notifications (
  id          text PRIMARY KEY,
  idem_key    text UNIQUE NOT NULL,      -- the sender's key, so duplicates are rejected here
  user_id     bigint NOT NULL,
  template    text NOT NULL,
  priority    text NOT NULL,             -- 'critical', 'high' or 'bulk'
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
-- deliveries live in Cassandra, with a 30-day expiry:
--   PRIMARY KEY ((notification_id), channel) -> status, provider, provider_msg_id, attempts`,
    stores:[['preferences, devices, templates', 'Postgres plus a cache', 'Relational and read-heavy'], ['deliveries', 'Cassandra or DynamoDB with an expiry time', 'Write-heavy and short-lived'], ['work queues', 'Kafka topics for each priority (or SQS queues)', 'Isolation and replay'], ['dedupe keys', 'Redis SET NX with an expiry time', 'A fast “already sent?” check']]},
  hld:{
    think:`<p>The key choice is <b>separate queues and worker pools for each priority</b>. Then a 50M-message campaign can never sit in front of an OTP. Channel workers handle the provider details: rendering, rate limits, retries and failover.</p>`,
    diagram:{n:[['p', 'client', 'Producers', 'all services', 0, 1], ['api', 'service', 'Notify API', 'dedupe + prefs', 1, 1], ['pdb', 'db', 'Prefs & templates', '', 1, 2], ['qh', 'queue', 'High priority', 'OTP, alerts', 2, 0], ['ql', 'queue', 'Bulk queue', 'campaigns', 2, 2], ['w', 'service', 'Channel workers', 'render + pace', 3, 1], ['prov', 'ext', 'Providers', 'APNs · FCM · SMS', 4, 1], ['log', 'db', 'Delivery log', 'status, TTL', 3, 2]],
      e:'p>api api>pdb api>qh api>ql qh>w ql>w w>prov w>log prov>log',
      f:[['OTP: it is checked against preferences, built from the template, and put on the high-priority queue.', 'p>api:OTP for user 42 (key otp-9f1)|api>pdb:prefs + template|api>qh:priority high|qh>w|w>prov:SMS via provider A|w>log:SENT'], ['Campaign: batches go to the bulk queue, and workers pace them for each provider.', 'p>api:campaign batch|api>ql:1,000 messages|ql>w:paced 2K/s|w>prov:push via FCM'], ['Receipts: providers report delivery through webhooks.', 'prov>log:DELIVERED']]},
    walk:['The order service sends <code>order_shipped</code> with an idempotency key. The API inserts it. A repeated key returns the original id.', 'The API loads preferences and drops the channels the user opted out of. It picks the queue by priority.', 'A worker builds the message from the template and checks the dedupe key in Redis. It sends through the provider within that provider’s rate limit, and saves the provider’s message id.', 'Delivery receipts arrive later by webhook and update the log.']},
  deep:[
    {t:'Priority isolation and pacing',
      think:`<p>A single queue with a “priority” field still makes OTPs wait if workers are busy with campaign messages. Separate topics and <b>separate worker pools</b> give hard isolation. The bulk pool is paced with a token bucket for each provider. That respects provider limits, and it avoids waking 50M phones in the same second.</p>`,
      body:`<ul><li><b>Critical</b> (OTPs and security alerts): its own queue and workers, kept far below capacity, with no quiet hours.</li><li><b>High</b> (orders and payments): its own queue, with short retries.</li><li><b>Bulk</b> (marketing): paced, with quiet hours applied in each user’s time zone, and cancellable in the middle of a campaign.</li></ul>`},
    {t:'At-least-once delivery without duplicate sends',
      think:`<p>Queues redeliver messages after timeouts, and providers sometimes time out while still delivering. I cannot get exactly-once delivery across a third-party API, but I can make duplicates rare. I remove duplicates at the API with a unique idempotency key. I remove them again at the worker with Redis SET NX on the notification and channel before sending. I pass the provider’s own idempotency key when it has one, and I retry with backoff and jitter and end in a dead-letter queue.</p>`,
      code:{lang:'ts', title:'worker.ts', src:`async function handle(msg: Job) {
  const key = "sent:" + msg.id + ":" + msg.channel;
  // Claim the send. If another worker already did, skip it.
  const claimed = await redis.set(key, "1", { NX: true, EX: 86400 });
  if (!claimed) return ack(msg);
  try {
    const res = await provider(msg.channel).send(render(msg), { idempotencyKey: msg.id });
    await log.put(msg.id, msg.channel, { status: "SENT", providerId: res.id });
    ack(msg);
  } catch (e) {
    await redis.del(key);                       // release the claim so a retry can send
    if (msg.attempts >= 5) return deadLetter(msg, e);
    retryLater(msg, backoffWithJitter(msg.attempts));
  }
}`}},
    {t:'Provider failover',
      think:`<p>SMS and email providers fail or throttle often, so each channel has an ordered list of providers. A <b>circuit breaker for each provider</b> opens on errors or slow replies, and the worker moves to the next provider. For OTPs I also watch the delivery-receipt rate. Some failures look like success at the API, because the message is accepted but never delivered.</p>`}],
  bottlenecks:{
    think:`<p>Most of the failures here come from outside: providers, devices and campaign spikes.</p>`,
    rows:[['A campaign floods the system', 'OTP latency rises', 'Use separate queues and worker pools, and pace bulk sends'], ['A provider throttles or fails', '429 errors or timeouts from one provider', 'Set a rate limit for each provider, add a breaker, and keep a failover order'], ['Stale device tokens', 'A high “unregistered” error rate on push', 'Delete tokens when APNs or FCM report them invalid'], ['Delivery-log write volume', 'Write latency on the log store', 'Use a wide-column store with an expiry time, and batch the writes'], ['CPU for building messages', 'Worker CPU is high during campaigns', 'Cache compiled templates, and build once for each language in bulk sends']]},
  tradeoffs:{
    think:`<p>The recurring trade-off is <b>speed against duplicates</b>. More retries mean fewer losses and more duplicates, so the duplicate removal has to be layered.</p>`,
    rows:[['Queues', 'One queue and worker pool for each priority', 'A single queue with a priority field', 'Hard isolation, and more infrastructure'], ['Delivery guarantee', 'At-least-once plus duplicate removal', 'Exactly-once', 'Achievable. A rare duplicate after a provider timeout remains'], ['Providers', 'Several for each channel, with failover', 'One provider', 'Resilience and better prices, and more integrations to build'], ['Content storage', 'Template id and values. Never store OTP values', 'The full message text', 'Better privacy and size, and it is harder to show the exact text in support tools']],
    more:['An in-app inbox with read state', 'Batching (“5 new likes”) and limits on how often a user is notified', 'Choosing each user’s channel from how they respond', 'Choosing between SMS providers by cost'],
    followups:[['How do you avoid a 3 a.m. marketing push?', 'Store each user’s time zone. The bulk worker checks quiet hours and reschedules the message for the next allowed time, using a delay queue or a scheduled job. Critical messages ignore quiet hours.'], ['A user has three devices. What happens?', 'Send one delivery to each active device token. Use the platform’s collapse key, so an updated notification replaces the old one instead of piling up.'], ['How do you know a push was actually seen?', 'APNs and FCM only confirm that they accepted it. For real delivery and open rates, the app reports receipt and open events back to an analytics endpoint.']],
    traps:['One queue for everything', 'No idempotency key, so a retry by the sender notifies twice', 'Logging OTP values in plain text', 'Ignoring provider rate limits until they throttle you']},
  refs:['case:notification-service', 'l:push-notifications', 'l:queues-pubsub-streams', 'l:delivery-semantics', 'l:ordering-dlq', 'l:circuit-breaker', 'pg:retry-jitter']});

/* ------------------------------------------------------------------ */
S({id:'distributed-cache', level:'intermediate', icon:'⚡', title:'Distributed cache', tags:['consistent hashing', 'eviction', 'hot keys'],
  tagline:'Build Memcached or Redis Cluster: spread data across many memory-heavy machines, evict sensibly, and survive the loss of a machine without melting the database.',
  prompt:'Design a distributed in-memory cache that many services share.',
  focus:'how to split the data (consistent hashing), eviction, hot keys, and what happens to the database when a machine dies.',
  clarify:{
    think:`<p>A cache is allowed to forget, and that changes everything. There is no need for durability, and losing a machine is a speed problem, not data loss. I confirm that first. Then I ask about the operations, the size and the request rate.</p>`,
    ask:[['Which operations?', 'GET, SET with an expiry time, DELETE and multi-get'], ['How much hot data?', 'About 10 TB'], ['What request rate?', 'About 10 million operations a second at peak'], ['May it lose data?', 'Yes. The source of truth is a database'], ['Can a read be stale?', 'Briefly, yes. But it must never return another key’s value'], ['Is it shared by many teams?', 'Yes, with namespaces and a limit for each team']],
    fr:['Get, set (with an expiry time), delete and multi-get by key', 'Evict entries when memory is full', 'Add and remove machines with no downtime'],
    nfr:['p99 under about 1 ms inside a data centre (99 out of 100 reads are faster)', 'Losing one machine must not overload the database', 'Linear scaling: twice the machines give twice the capacity'],
    out:['saving data to disk', 'copying across regions', 'complex data types such as lists and sets']},
  estimate:{
    think:`<p>Two things decide the number of machines. One is <b>memory</b>: the data × copies ÷ the usable RAM of one machine. The other is <b>throughput</b>: operations ÷ operations one machine can serve. Whichever is larger wins.</p>`,
    assume:['About 70% of RAM is usable after overhead and fragmentation', 'About 250,000 operations a second for each machine (illustrative)', 'About 1 KB for an average value'],
    inputs:[['data', 'Hot data', 1e13, [1e12, 5e12, 1e13, 5e13], 'B'], ['ops', 'Operations per second', 1e7, [1e6, 5e6, 1e7, 5e7], '/s'], ['ram', 'RAM per node', 256e9, [64e9, 128e9, 256e9, 512e9], 'B'], ['copies', 'Copies of each key', 2, [1, 2, 3], 'copies']],
    rows:[
      ['usable', 'Usable memory per node', v => v.ram * 0.7, 'B', 'RAM × 0.7'],
      ['nMem', 'Nodes for memory', (v, r) => ceil(v.data * v.copies / r.usable), 'nodes', 'data × copies ÷ usable memory'],
      ['nOps', 'Nodes for throughput', v => ceil(v.ops / 2.5e5), 'nodes', 'operations ÷ 250,000'],
      ['nodes', 'Nodes needed', (v, r) => Math.max(r.nMem, r.nOps), 'nodes', 'the larger of the two'],
      ['perNode', 'Operations per node', (v, r) => v.ops / r.nodes, '/s', 'operations ÷ nodes'],
      ['net', 'Network traffic', v => v.ops * 1000 * 8, 'bps', 'operations × 1 KB']],
    so:(r, f) => `${r.nMem >= r.nOps ? '<b>Memory decides</b>' : '<b>Throughput decides</b>'}: ${f('nodes')} (${f('nMem')} for memory and ${f('nOps')} for throughput). Each node serves ${f('perNode')}. ${r.perNode < 2.5e5 * 0.5 ? 'That is well under its limit, so a single hot key, and not the average load, is the real risk.' : 'That is close to its limit, so add room for hot keys and for machine failures.'} The total traffic is ${f('net')}, so spread it over many nodes and keep clients in the same data centre.`},
  api:{
    think:`<p>I keep the interface small. The interesting part is that the <b>client library</b> does the routing. It hashes the key to find the machine, so there is no extra hop.</p>`,
    rows:[['get(key) → value or miss', 'One read', 'The client routes by the hash ring'], ['mget(keys[]) → values', 'A batch read, sent to each machine in parallel', 'A big win when building a page'], ['set(key, value, ttl)', 'A write with an expiry time', 'Overwrites. The last write wins'], ['delete(key)', 'Remove an entry after a database write', 'Safe to repeat'], ['add(key, value, ttl)', 'Set only if the key is absent', 'Used for locks and leases']],
    code:`// app code (cache-aside)
let user = await cache.get("u:42");
if (user === MISS) {
  user = await db.users.find(42);
  await cache.set("u:42", user, 300);   // 5-minute expiry, as a safety net
}`, lang:'ts', title:'client usage'},
  data:{
    think:`<p>Inside one machine it is a hash table for lookups, plus a structure that tracks recent use for eviction. Across machines it is a <b>hash ring</b>. Each machine owns many small arcs (virtual nodes), so the load is even, and adding a machine moves only its share of the keys.</p>`,
    code:`// One node: fast get and set, with LRU eviction (a Map keeps the order keys were added)
class Node {
  private m = new Map<string, { v: Buffer; exp: number }>();
  constructor(private maxBytes: number, private used = 0) {}
  get(k: string, now: number) {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.exp <= now) { this.drop(k); return undefined; }   // expire it only when it is read
    this.m.delete(k); this.m.set(k, e);                       // mark it as recently used
    return e.v;
  }
  set(k: string, v: Buffer, ttlMs: number, now: number) {
    this.drop(k);
    this.m.set(k, { v, exp: now + ttlMs }); this.used += v.length;
    while (this.used > this.maxBytes) this.drop(this.m.keys().next().value!); // evict the least recently used
  }
  private drop(k: string) { const e = this.m.get(k); if (e) { this.used -= e.v.length; this.m.delete(k); } }
}`, lang:'ts', title:'node.ts',
    stores:[['keys and values', 'RAM on the cache machines', 'This is the whole point'], ['ring membership', 'A small config service (etcd or ZooKeeper)', 'Clients need one agreed, versioned view'], ['the source of truth', 'The application’s database', 'The cache is rebuilt from it']]},
  hld:{
    think:`<p>Apps embed a client that knows the ring. Each primary has an asynchronous replica, used only to take over after a failure. A config service holds the members and a ring version, so all clients agree.</p>`,
    diagram:{n:[['app', 'client', 'App servers', 'client + ring', 0, 1], ['cfg', 'service', 'Config service', 'ring version', 1, 0], ['db', 'db', 'Source DB', '', 1, 2], ['a', 'cache', 'Cache node A', 'slots 0–5k', 2, 0], ['b', 'cache', 'Cache node B', 'slots 5k–11k', 2, 1], ['c', 'cache', 'Cache node C', 'slots 11k–16k', 2, 2], ['ra', 'cache', 'Replica A', 'async', 3, 0], ['rb', 'cache', 'Replica B', 'async', 3, 1], ['rc', 'cache', 'Replica C', 'async', 3, 2]],
      e:'app>cfg app>db app>a app>b app>c cfg>a a>ra b>rb c>rc',
      f:[['Hit: the client hashes the key to node B and reads it directly.', 'app>b:GET u:42 (slot 7120)'], ['Miss: read the database, then fill the cache with an expiry time.', 'app>c:GET p:9 → miss|app>db:SELECT product 9|app>c:SET p:9 TTL 300'], ['Node A fails: the config service promotes its replica and publishes a new ring version.', 'cfg>a:health check fails|a>ra:replica promoted|app>cfg:ring v8']]},
    walk:['The client works out <code>hash("u:42")</code> and finds the owner of that slot, node B, from its saved copy of the ring.', 'It sends GET over a pooled connection. B answers from RAM in well under a millisecond.', 'On a miss the app reads the database and sets the value with an expiry time.', 'After a database write the app deletes the key (it does not update it), so the next read loads fresh data.']},
  deep:[
    {t:'Splitting the data: consistent hashing with virtual nodes',
      think:`<p>With <code>hash(key) mod N</code>, changing N remaps almost every key, and every remapped key is a miss that hits the database. With a <b>hash ring</b>, adding a machine moves only about 1/N of the keys. Giving each machine 100 or more virtual points evens out the load. Redis Cluster uses a variant: 16,384 fixed hash slots are assigned to machines, so moving data means moving whole slots.</p>`,
      code:{lang:'ts', title:'ring.ts', src:`class Ring {
  private points: { h: number; node: string }[] = [];
  add(node: string, vnodes = 128) {
    for (let i = 0; i < vnodes; i++) this.points.push({ h: hash32(node + "#" + i), node });
    this.points.sort((a, b) => a.h - b.h);
  }
  owner(key: string): string {
    const h = hash32(key);
    let lo = 0, hi = this.points.length;          // find the first point clockwise from h
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.points[m].h < h) lo = m + 1; else hi = m; }
    return this.points[lo % this.points.length].node;
  }
}`}},
    {t:'Eviction and memory efficiency',
      think:`<p>Exact LRU needs a linked-list update on every read. Redis instead <b>samples a few keys and evicts the oldest</b>. This is approximate LRU (LFU is also available), and it is cheaper and close enough. Memcached uses a <b>slab allocator</b> (chunks of fixed size classes) to avoid fragmentation, and some space is wasted when a value does not fit a class. Expiry times are applied when a key is read, plus a background sampler.</p>`},
    {t:'Hot keys, stampedes and machine failure',
      think:`<p>The average load is rarely the problem. Spikes are. Four habits protect the database.</p>`,
      body:`<ul><li><b>Request coalescing (single-flight):</b> when 1,000 requests miss the same key at once, one goes to the database and the rest wait for its answer.</li><li><b>Early refresh:</b> refresh a popular key shortly before its expiry, chosen at random, so it never expires under load.</li><li><b>Hot-key copies:</b> copy the hottest keys to several machines, or to a small in-process cache (L1) with a few seconds of expiry.</li><li><b>Machine failure:</b> promote the replica, or let the ring move the slots elsewhere and accept some misses for a while. Rate-limit cache refills, so a storm of misses does not overload the database.</li></ul>`}],
  bottlenecks:{
    think:`<p>I think about what happens to the <b>database</b> when the cache misbehaves, because that is the real blast radius.</p>`,
    rows:[['One hot key', 'One machine’s CPU or network card is full', 'Use an in-process L1 cache, and copy the key to several machines'], ['A popular key expires', 'A burst of identical database queries', 'Use single-flight, early refresh and random expiry times'], ['A machine dies', 'The miss rate jumps for about 1/N of the keys', 'Promote a replica, limit refills, and keep capacity for N−1 machines'], ['Too many connections', 'Every app server connects to every machine', 'Pool connections, or add a proxy layer (such as mcrouter or twemproxy)'], ['Large values', 'Latency spikes and eviction churn', 'Cap the value size, compress, and keep big blobs elsewhere']]},
  tradeoffs:{
    think:`<p>The big choices are where the routing lives and how much to pay for availability.</p>`,
    rows:[['Routing', 'A hash ring in the client', 'A proxy tier', 'No extra hop, but every client must agree on the ring version'], ['Replicas', 'One asynchronous replica for each primary', 'None', 'Fast failover, and a few writes are lost on failover (fine for a cache)'], ['Eviction', 'Approximate LRU', 'Exact LRU or LFU', 'Cheap for each operation, and a slightly worse hit rate for some workloads'], ['Writes', 'Delete on write (cache-aside)', 'Update in place', 'Stops racing writers from caching stale values, at the cost of one extra miss']],
    more:['A memory quota for each team, and eviction that stays inside each team’s share', 'Leases, so a slow reader cannot cache a stale value (as in Facebook’s memcache paper)', 'Warming new machines before they take traffic', 'Finding hot keys with a count-min sketch'],
    followups:[['How do you keep the cache consistent with the database?', 'Use cache-aside: delete the key after the database commit, and keep the expiry time as a safety net. You can also use change data capture events to delete keys. A known race is a slow read that caches an old value after a delete. Leases or versioned values close it.'], ['What happens when you add a machine?', 'About 1/N of the keys move to it, and they start as misses. So add machines before you need them and warm them gradually. Or move slots while serving, as Redis Cluster does, key by key.'], ['Why not just make the cache durable?', 'Then it becomes a database, with all the costs of one: fsync, replication lag and backups. If data must survive, keep it in a database and cache it.']],
    traps:['Using mod-N hashing', 'Ignoring what a machine failure does to the database', 'Updating cache values on write (racy) instead of deleting them', 'Treating the cache as the only copy of important data']},
  refs:['l:consistent-hashing', 'l:cache-eviction', 'l:cache-failure-modes', 'l:redis-vs-memcached', 'l:cache-invalidation', 'pg:hash-ring', 'lab:lru-cache', 'case:kv-store']});

/* ------------------------------------------------------------------ */
S({id:'ticket-booking', level:'intermediate', icon:'🎟️', title:'Ticket booking', tags:['seat holds', 'concurrency', 'flash crowds'],
  tagline:'BookMyShow-style seat booking: never sell a seat twice, and survive a concert launch where a million people want 50,000 seats.',
  prompt:'Design a movie and event ticket booking system like BookMyShow.',
  focus:'preventing double booking when many people act at once, holding seats while a buyer pays, and the flash crowd on launch day.',
  clarify:{
    think:`<p>A booking system is mostly ordinary CRUD with one very sharp edge: <b>two people must never get the same seat</b>. The busiest moment is also a predictable stampede. I confirm how long a hold lasts and the launch-day numbers.</p>`,
    ask:[['Assigned seats, or general admission?', 'Assigned seats, chosen from a seat map'], ['How long can a user hold seats while paying?', 'About 8 minutes'], ['What is normal volume?', 'About 5 million bookings a day across all cinemas'], ['What is the biggest event?', 'A concert: about 1 million people at launch for about 50,000 seats'], ['How do payments work?', 'Through an external payment gateway'], ['Can the seat map be slightly stale?', 'Yes. But the final booking must be exact']],
    fr:['Browse cities, shows and seat maps', 'Hold seats for a few minutes', 'Pay, confirm and issue tickets', 'Release unpaid holds automatically'],
    nfr:['Zero double bookings (strong consistency on seats)', 'The seat map loads fast, and can be a few seconds stale', 'Survive launch-day spikes, and treat buyers fairly', 'A failed payment never leaves seats stuck'],
    out:['dynamic pricing', 'a resale marketplace', 'venue management tools']},
  estimate:{
    think:`<p>Ordinary days are small. The interesting number is the <b>launch spike</b>: how many buyers compete for each seat, and how fast they arrive.</p>`,
    assume:['The evening peak is about 5 times the daily average', 'At launch, most buyers click in the first minute'],
    inputs:[['perDay', 'Bookings per day', 5e6, [1e5, 1e6, 5e6, 2e7]], ['browse', 'Seat-map views per booking', 30, [10, 30, 100]], ['buyers', 'Launch buyers', 1e6, [1e5, 5e5, 1e6, 5e6]], ['seats', 'Launch seats', 5e4, [1e4, 5e4, 1e5]]],
    rows:[
      ['bpeak', 'Bookings at evening peak', v => v.perDay / 86400 * 5, '/s', 'per day ÷ 86,400 × 5'],
      ['mpeak', 'Seat-map reads at peak', (v, r) => r.bpeak * v.browse, '/s', 'bookings × views'],
      ['ratio', 'Buyers per seat at launch', v => v.buyers / v.seats, 'n', 'buyers ÷ seats'],
      ['lqps', 'Hold attempts at launch', v => v.buyers / 60, '/s', 'buyers in the first minute']],
    so:(r, f) => `Normal days are easy. Bookings peak at ${f('bpeak')}, and seat-map reads (${f('mpeak')}) come from a cache. The launch drives the design: ${f('lqps')} hold attempts for ${f('seats')} seats (${r.ratio >= 1 ? f('ratio') + ' buyers for each seat' : 'more seats than buyers'}). ${r.ratio > 3 ? 'Most of those requests can only fail. So a <b>virtual waiting room</b> should let buyers in at the rate the booking path can handle, and not let them all hit the seat rows at once.' : 'Demand is close to supply, so row-level locking in the database can take it directly.'}`},
  api:{
    think:`<p>I separate <b>hold</b> from <b>book</b>. Holding is the contested step, so it must be atomic for all the seats asked for. Booking turns a hold into a ticket after payment. Both take idempotency keys, because people double-click and mobile networks retry.</p>`,
    rows:[['GET /v1/shows?city=&date=&movie=', 'List shows', 'Cached and paged'], ['GET /v1/shows/{id}/seats', 'The seat map with each seat’s status', 'From the cache, a few seconds stale'], ['POST /v1/holds', 'Hold {show_id, seat_ids[]} → {hold_id, expires_at}', 'All or nothing. Returns 409 if any seat is taken'], ['POST /v1/bookings', 'Confirm {hold_id, payment_id} → ticket', 'Safe to repeat for the same hold_id'], ['DELETE /v1/holds/{id}', 'Release early', 'The seats return at once']],
    code:`POST /v1/holds
Idempotency-Key: 1a7e…
{ "show_id": "s_8812", "seat_ids": ["A7", "A8"] }

201 Created
{ "hold_id": "h_55f", "expires_at": "2026-11-13T19:42:00Z" }

409 Conflict
{ "error": "seats_unavailable", "seats": ["A8"] }`, title:'hold'},
  data:{
    think:`<p>One row for each seat in each show is where the contention happens. So I make the hold a single <b>conditional UPDATE</b> on those rows. The same WHERE clause treats expired holds as free, so a crashed cleanup job cannot lock seats for ever.</p>`,
    code:`CREATE TABLE show_seats (
  show_id         text,
  seat_id         text,
  status          text NOT NULL DEFAULT 'FREE',   -- FREE, HELD or BOOKED
  hold_id         text,
  hold_expires_at timestamptz,
  booking_id      text,
  PRIMARY KEY (show_id, seat_id)
);

-- Hold A7 and A8 together: both rows or neither
BEGIN;
UPDATE show_seats
   SET status = 'HELD', hold_id = 'h_55f', hold_expires_at = now() + interval '8 minutes'
 WHERE show_id = 's_8812' AND seat_id IN ('A7', 'A8')
   AND (status = 'FREE' OR (status = 'HELD' AND hold_expires_at < now()));
-- in the application: if the number of rows updated is not 2, ROLLBACK and return 409. Otherwise COMMIT
COMMIT;`,
    stores:[['shows, venues, movies', 'Postgres, a search index and a cache', 'A read-heavy catalogue'], ['show_seats, holds, bookings', 'Postgres, partitioned by show_id', 'Transactions where it matters'], ['seat-map snapshots', 'Redis', 'Fast reads, refreshed on every change'], ['booking events', 'Outbox, then Kafka', 'Tickets, emails and analytics']]},
  hld:{
    think:`<p>Browsing and booking need different levels of consistency, so they are different services. A waiting room sits in front of the hottest events only. Payment is a separate service that talks to the gateway. Confirmation events leave through an outbox, so a crash cannot lose them.</p>`,
    diagram:{n:[['u', 'client', 'Users', 'app / web', 0, 1], ['wr', 'service', 'Waiting room', 'admit N/s', 1, 0], ['gw', 'lb', 'API gateway', '', 1, 1], ['cat', 'service', 'Catalog', 'shows, search', 2, 0], ['cache', 'cache', 'Seat-map cache', 'Redis', 3, 0], ['bk', 'service', 'Booking svc', 'holds + confirm', 2, 1], ['db', 'db', 'Bookings DB', 'by show_id', 3, 1], ['pay', 'service', 'Payment svc', '', 2, 2], ['psp', 'ext', 'Payment gateway', '', 3, 2], ['q', 'queue', 'Events', 'tickets, email', 4, 2]],
      e:'u>wr wr>gw u>gw gw>cat cat>cache gw>bk bk>db bk>cache bk>pay pay>psp db>q',
      f:[['Launch day: users wait in the waiting room and are let in at a steady rate.', 'u>wr:join queue|wr>gw:admitted (signed token)'], ['Hold: one conditional update claims both seats or neither, and the seat-map cache is updated.', 'u>gw:select A7, A8|gw>bk:POST /holds|bk>db:UPDATE … 2 rows|bk>cache:A7, A8 held'], ['Pay and confirm: charge the card, then change HELD to BOOKED and write an outbox event in the same transaction.', 'u>gw:pay|gw>bk:POST /bookings|bk>pay:charge ₹640|pay>psp:payment intent|bk>db:BOOKED + outbox row|db>q:booking.confirmed']]},
    walk:['The user opens the seat map. It comes from the Redis snapshot for that show.', 'They pick A7 and A8, and the booking service runs the conditional UPDATE. If 2 rows changed, it replies 201 with an 8-minute hold. If fewer changed, it rolls back and replies 409.', 'They pay. On success, the booking service marks the seats BOOKED and inserts the booking and an outbox row in one transaction.', 'A relay publishes the outbox event, and the ticket and email services consume it.']},
  deep:[
    {t:'Never double-book',
      think:`<p>There are three options, from heaviest to lightest. <b>SELECT … FOR UPDATE</b> then update is correct, but it holds locks across a round trip. <b>Optimistic versioning</b> retries on a conflict. A <b>conditional UPDATE</b> is one statement, so the database checks and writes in one step, and that is my pick. A Redis SETNX hold would be faster, but then two systems must agree on who owns a seat, and the database is the source of truth anyway.</p>`,
      body:`<p>Two small points matter. The WHERE clause treats expired holds as free, so correctness does not depend on a cleanup job. And seats are always updated in the same order (sorted by seat id), so two holds on several seats cannot block each other for ever (a deadlock).</p>`},
    {t:'Payment races with the hold timer',
      think:`<p>The nasty case is this. A user pays at minute 7:59, the gateway takes 30 seconds, the hold expires, and someone else grabs the seat. So when payment <b>starts</b>, I extend the hold once, by a few minutes. If a payment still succeeds after the seat was resold, the booking service refunds it automatically. Payment results arrive by webhook and repeats are ignored by hold id, and a reconciliation job asks the gateway about payments with no final status.</p>`},
    {t:'Surviving the launch: a virtual waiting room',
      think:`<p>With 20 buyers for each seat, 95% of requests will fail whatever we do. If all of them hit the seat rows, the lock contention and timeouts hurt the 5% who could succeed. A <b>waiting room</b> lets users in at a rate the booking path can serve, say 2,000 a minute, using a signed token that the gateway checks. Queue positions are random among people who arrived before the sale opened, which is fairer than “fastest connection wins”, and first in first out after that. Show the live queue position, and show “sold out” early.</p>`}],
  bottlenecks:{
    think:`<p>The hot spot is predictable. All the launch traffic targets one show, which lives on one database partition.</p>`,
    rows:[['One huge show on one partition', 'Lock waits and timeouts on show_seats', 'The waiting room limits entry, transactions stay tiny, and very large venues are split by section'], ['A stale seat map', 'Users pick seats that are already held and get 409 errors', 'Refresh the snapshot on every change, and return the clashing seats so the screen updates at once'], ['Abandoned holds', 'Seats look sold out but are not paid for', 'Use a short hold time, release on app close, and count expired holds as free'], ['A slow payment gateway', 'Holds expire in the middle of a payment', 'Extend the hold when payment starts, add a breaker, and keep a second gateway'], ['Bots', 'Holds come from a few accounts', 'Limit seats for each account, add a CAPTCHA at the waiting room, and check devices']]},
  tradeoffs:{
    think:`<p>The theme is to be <b>strict where money and seats are involved</b>, and relaxed everywhere else.</p>`,
    rows:[['Claiming a seat', 'A conditional UPDATE in the database', 'Redis locks', 'One source of truth, and more load on the database during spikes'], ['Hold length', 'About 8 minutes', 'Pay first, with no hold', 'No refunds for lost races, and abandoned holds lock seats briefly'], ['Launch traffic', 'A waiting room', 'Let everyone in', 'Fair and stable, and users face an extra queue step'], ['The catalogue', 'An eventually consistent cache', 'Read from the primary', 'Fast browsing, and now and then a stale seat status']],
    more:['“Best available” seat selection (search for free seats side by side in a row)', 'Group bookings that must sit together', 'A hold time that changes with demand', 'Read replicas in several regions for browsing'],
    followups:[['Why not lock seats only in Redis?', 'It works and it is fast. But then Redis and the database must agree on who owns a seat through crashes and failovers, and Redis replication is asynchronous. Unless the database truly cannot keep up, one source of truth is simpler and safer.'], ['Payment succeeds but your service crashes before marking the seat BOOKED. Now what?', 'The gateway webhook, or the reconciliation poll, delivers the result again, and confirming is safe to repeat for the same hold id. If the hold already expired and the seat was resold, the booking service refunds the payment and tells the user.'], ['How do you show live availability to thousands of viewers?', 'Push seat changes over WebSocket or SSE from the snapshot, limited to a few updates a second for each show. The final check is always the database update.']],
    traps:['Checking, then updating, in two statements (a race)', 'Holds that rely on a cleanup job to expire', 'No plan for the launch spike', 'Forgetting a payment that arrives after the hold expires, and the refund']},
  refs:['case:irctc', 'l:locking', 'l:transactions-isolation', 'l:saga-outbox', 'l:idempotency-rate-limit-headers', 'l:load-shedding', 'pg:isolation']});
})();
