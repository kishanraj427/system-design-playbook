/* =====================================================================
   PART 8 · RUNNABLE CODE LABS
   LRU cache · token bucket · consistent hashing · Bloom filter ·
   sliding-window limiter · Snowflake IDs · Merkle-tree diff · LSM-tree
   Each lab runs in a sandboxed Web Worker. check(name, condition) prints ✅/❌.
   ===================================================================== */
(function(){
const SDA = window.SDA;
const LABS = [
{
  id:'lru-cache', module:'caching', timeout:10000, title:'LRU cache in O(1)', summary:'Build a cache for the news app that drops the article nobody has read for the longest time. Then see how much of the traffic it serves as it grows.',
  explain:`<h3>What you will build</h3><p>A small cache for article summaries. When it is full, it removes the article that was read least recently. This rule is called <b>LRU</b> (least recently used).</p><h3>How it works</h3><ol><li>A JavaScript <code>Map</code> remembers the order in which keys were added.</li><li>When an article is read, delete it and add it again. That moves it to the “newest” end.</li><li>The first key in the Map is always the oldest, so that is the one to remove when the cache is full.</li><li>Every step takes the same short time, however many articles are stored. This is called O(1).</li></ol><h3>What to notice</h3><ul><li>The checks print ✅ or ❌ so you can see if your change broke something.</li><li>A few popular stories get most of the reads, so even a small cache serves many of them.</li></ul><div class="callout tip"><b>Important point</b><p>LRU keeps what readers just used. That works well when recent articles are the ones people open again.</p></div>`,
  challenge:'Part 1: build the same cache again with a hash map and a doubly linked list. Interviewers often ask for this version. Part 2: add a time limit (TTL) to each article, so an old copy counts as a miss.',
  code:`
// News app cache: when it is full, remove the article read least recently
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();          // article id -> summary, oldest first
    this.hits = 0; this.misses = 0;
  }
  get(key) {
    if (!this.map.has(key)) { this.misses++; return undefined; }
    const value = this.map.get(key);
    this.map.delete(key);          // take it out and put it back at the newest end
    this.map.set(key, value);
    this.hits++;
    return value;
  }
  put(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.capacity) {
      const lru = this.map.keys().next().value;   // the first key is the oldest
      this.map.delete(lru);
    }
    this.map.set(key, value);
  }
}

const c = new LRUCache(3);          // room for 3 article summaries
c.put('A', 'summary A'); c.put('B', 'summary B'); c.put('C', 'summary C');
c.get('A');                 // a reader opens A again, so A is now the newest
c.put('D', 'summary D');    // a new article arrives and B is removed
console.log('articles (oldest first):', [...c.map.keys()]);
check('B was removed (nobody read it for the longest time)', c.get('B') === undefined);
check('A stayed because a reader opened it again', c.get('A') === 'summary A');
check('the cache never holds more than 3 articles', c.map.size === 3);

// Now a busier day: 10,000 articles, but a few are read far more than the rest (this pattern is called Zipf)
function rng(seed) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; }
function zipfSampler(n, s, rand) {
  const w = Array.from({ length: n }, (_, i) => 1 / Math.pow(i + 1, s));
  const total = w.reduce((a, b) => a + b, 0); const cdf = []; let acc = 0;
  for (const x of w) { acc += x / total; cdf.push(acc); }
  return () => { const u = rand(); let lo = 0, hi = n - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < u) lo = mid + 1; else hi = mid; } return lo; };
}
const rand = rng(42), next = zipfSampler(10000, 1.1, rand);
const results = [];
for (const cap of [10, 100, 1000]) {
  const cache = new LRUCache(cap);
  // a miss means the article is fetched and saved
  for (let i = 0; i < 50000; i++) { const k = next(); if (cache.get(k) === undefined) cache.put(k, 'summary-' + k); }
  const ratio = cache.hits / (cache.hits + cache.misses);
  results.push(ratio);
  console.log(\`cache holds \${cap.toString().padStart(4)} articles (\${cap / 100}% of all) → served from cache \${(ratio * 100).toFixed(1)}% of the time\`);
}
check('a bigger cache serves more reads', results[0] < results[1] && results[1] < results[2]);
check('keeping just 10% of the articles serves most reads', results[2] > 0.6);
`},
{
  id:'token-bucket', module:'traffic', title:'Token-bucket rate limiter', summary:'Build a rate limiter that allows a short burst and then a steady speed. When it says no, it also says how long to wait.',
  explain:`<h3>What you will build</h3><p>A limiter for the ticket site’s seat checks. A buyer may check many seats at once, but a script must not send thousands a second.</p><h3>How it works</h3><ol><li>Each buyer has a bucket that holds up to 20 tokens.</li><li>Every seat check spends 1 token.</li><li>Tokens refill at 10 a second, up to the size of the bucket.</li><li>If the bucket is empty, the answer is “no”, with how long to wait.</li></ol><h3>What to notice</h3><ul><li>The first 20 checks pass at once. After that the speed settles at 10 a second.</li><li>Each buyer needs only two numbers saved: the tokens left and the time of the last refill.</li></ul><div class="callout tip"><b>Important point</b><p>A token bucket allows a short burst but caps the long-run speed. That is why a normal buyer is never blocked, and a script is.</p></div>`,
  challenge:'Part 1: keep each buyer’s tokens and last refill time in a Map that imitates Redis, and make the check-and-spend one atomic step. Part 2: add a cost, so an expensive check spends 5 tokens.',
  code:`
class TokenBucket {
  constructor(ratePerSec, capacity, nowMs = 0) {
    this.rate = ratePerSec; this.capacity = capacity;
    this.tokens = capacity;   // start full, so a first burst is allowed
    this.last = nowMs;
  }
  refill(nowMs) {
    const elapsed = (nowMs - this.last) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.rate);
    this.last = nowMs;
  }
  allow(nowMs, cost = 1) {
    this.refill(nowMs);
    if (this.tokens >= cost) { this.tokens -= cost; return { ok: true }; }
    const retryAfterMs = Math.ceil((cost - this.tokens) / this.rate * 1000);   // how long until enough tokens
    return { ok: false, retryAfterMs };
  }
}

// 10 seat checks a second steady, with bursts up to 20
const b = new TokenBucket(10, 20, 0);
let burstOk = 0, firstReject = null;
for (let i = 0; i < 50; i++) { const r = b.allow(0); if (r.ok) burstOk++; else if (!firstReject) firstReject = r; }
console.log('50 checks at the same instant:', burstOk, 'allowed, then “429 Too Many Requests” with a wait of', firstReject.retryAfterMs, 'ms');

let later = 0;
for (let t = 50; t <= 2000; t += 50) if (b.allow(t).ok) later++;   // one check every 50 ms for 2 seconds
console.log('over the next 2 seconds, 20 checks a second were offered:', later, 'allowed');

check('the burst is capped at the bucket size (20)', burstOk === 20);
check('the wait time is about one token (100 ms)', firstReject.retryAfterMs === 100);
check('the steady speed matches the refill rate: 10 a second × 2 seconds = 20', later === 20);

// Every client gets its own bucket
const buckets = new Map();
const allowUser = (user, now) => { if (!buckets.has(user)) buckets.set(user, new TokenBucket(5, 5, now)); return buckets.get(user).allow(now).ok; };
let bot = 0, asha = 0;
for (let i = 0; i < 10; i++) { if (allowUser('bot', 0)) bot++; }
if (allowUser('asha', 0)) asha++;
check('a noisy script cannot use up another buyer\\'s limit', bot === 5 && asha === 1);
`},
{
  id:'consistent-hashing', module:'databases', title:'Consistent hashing with virtual nodes', summary:'Place servers on a ring so each hotel record goes to the next server clockwise. Measure how evenly they share the load, and how many records move when a server is added.',
  explain:`<h3>What you will build</h3><p>A hash ring for the hotel app’s data servers. Each server gets many positions on the ring, called virtual nodes.</p><h3>How it works</h3><ol><li>Hash each server’s name many times to place it on the ring.</li><li>Hash a hotel ID, then walk clockwise to the first server position.</li><li>When a fifth server is added, it takes records only from its new neighbours, about 1 in 5.</li><li>The old rule, <code>hash % N</code>, moves almost every record.</li></ol><h3>What to notice</h3><ul><li>A good hash matters. Plain FNV puts similar strings close together, so this lab adds a murmur-style final mix.</li></ul><div class="callout tip"><b>Important point</b><p>Adding a server should move only a small share of the records. Consistent hashing gives that, and <code>hash % N</code> does not.</p></div>`,
  challenge:'Part 1: add weights, so a bigger server gets more virtual nodes. Part 2: add a replication factor R and return the next R different servers clockwise.',
  code:`
function hash32(str) {                     // FNV-1a plus a murmur3 final mix, so similar strings spread out
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

class HashRing {
  constructor(vnodes = 150) { this.vnodes = vnodes; this.ring = []; }   // sorted list of [hash, server]
  addNode(node) {
    for (let i = 0; i < this.vnodes; i++) this.ring.push([hash32(node + '#' + i), node]);
    this.ring.sort((a, b) => a[0] - b[0]);
  }
  removeNode(node) { this.ring = this.ring.filter(([, n]) => n !== node); }
  getNode(key) {
    const h = hash32(key); let lo = 0, hi = this.ring.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.ring[mid][0] < h) lo = mid + 1; else hi = mid; }
    return this.ring[lo === this.ring.length ? 0 : lo][1];   // past the end? wrap around to the start
  }
}

const keys = Array.from({ length: 20000 }, (_, i) => 'hotel:' + i);
const ring = new HashRing(150);
['server-a', 'server-b', 'server-c', 'server-d'].forEach(n => ring.addNode(n));

const count = {}; const before = new Map();
for (const k of keys) { const n = ring.getNode(k); before.set(k, n); count[n] = (count[n] || 0) + 1; }
console.log('hotels per server:', count);
const loads = Object.values(count), avg = keys.length / 4;
const imbalance = Math.max(...loads) / avg;
console.log('busiest server ÷ average =', imbalance.toFixed(2));

ring.addNode('server-e');
const moved = keys.filter(k => ring.getNode(k) !== before.get(k)).length / keys.length;
const modMoved = keys.filter(k => hash32(k) % 4 !== hash32(k) % 5).length / keys.length;
console.log(\`add a 5th server → consistent hashing moved \${(moved * 100).toFixed(1)}% of hotels; hash % N moved \${(modMoved * 100).toFixed(1)}%\`);

check('the load is fairly even (busiest ÷ average is under 1.3)', imbalance < 1.3);
check('about 1 in 5 hotels move to the new server', moved > 0.12 && moved < 0.28);
check('hash % N moves most hotels', modMoved > 0.7);
check('every hotel that moved went to the new server', keys.every(k => ring.getNode(k) === before.get(k) || ring.getNode(k) === 'server-e'));
`},
{
  id:'bloom-filter', module:'search', title:'Bloom filter', summary:'Build a Bloom filter that says a book ID is definitely absent or might be present. Then check its real error rate against the formula.',
  explain:`<h3>What you will build</h3><p>A small filter for the library catalogue. A branch uses it to skip files that cannot hold a book.</p><h3>How it works</h3><ol><li>Choose the size from the number of books n and the error rate p you accept: <code>m = −n·ln p / (ln 2)²</code> bits.</li><li>Choose the number of hash functions: <code>k = (m/n)·ln 2</code>.</li><li>Adding a book sets k bits. Checking a book looks at the same k bits.</li><li>Double hashing (<code>h1 + i·h2</code>) makes k hash functions from just two.</li></ol><h3>What to notice</h3><ul><li>The filter never says “absent” for a book that was added, so it has no false negatives.</li><li>The false-positive rate is close to <code>(1 − e^(−kn/m))^k</code>.</li></ul><div class="callout tip"><b>Important point</b><p>“Absent” is always true. “Might be present” still needs a real lookup.</p></div>`,
  challenge:'Part 1: build a counting Bloom filter, which uses small counters instead of bits, so books can be removed. Part 2: measure how much more memory it needs.',
  code:`
function h32(str, seed) {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

class BloomFilter {
  constructor(expectedItems, fpRate) {
    this.m = Math.ceil(-expectedItems * Math.log(fpRate) / (Math.LN2 ** 2));   // number of bits
    this.k = Math.max(1, Math.round(this.m / expectedItems * Math.LN2));       // number of hash functions
    this.bits = new Uint8Array(Math.ceil(this.m / 8));
  }
  *positions(item) {                                  // k positions made from two hashes
    const a = h32(item, 0), b = h32(item, 0x9e3779b9) | 1;
    for (let i = 0; i < this.k; i++) yield (a + Math.imul(i, b) >>> 0) % this.m;
  }
  add(item) { for (const p of this.positions(item)) this.bits[p >> 3] |= 1 << (p & 7); }
  mightContain(item) { for (const p of this.positions(item)) if (!(this.bits[p >> 3] & (1 << (p & 7)))) return false; return true; }
}

const n = 5000, target = 0.01;
const bf = new BloomFilter(n, target);
console.log(\`m = \${bf.m} bits (\${(bf.m / 8 / 1024).toFixed(1)} KB, \${(bf.m / n).toFixed(1)} bits per book), k = \${bf.k} hash functions\`);

for (let i = 0; i < n; i++) bf.add('book-' + i);
const noFalseNegatives = Array.from({ length: n }, (_, i) => 'book-' + i).every(x => bf.mightContain(x));

let fp = 0; const trials = 50000;
for (let i = 0; i < trials; i++) if (bf.mightContain('missing-book-' + i)) fp++;   // books that were never added
const measured = fp / trials, theory = (1 - Math.exp(-bf.k * n / bf.m)) ** bf.k;
console.log(\`false-positive rate: measured \${(measured * 100).toFixed(2)}%, formula \${(theory * 100).toFixed(2)}%\`);
check('no false negatives, ever', noFalseNegatives);
check('the measured false-positive rate is close to the 1% target', measured > 0.005 && measured < 0.02);
check('about 9.6 bits per book for 1%', Math.abs(bf.m / n - 9.585) < 0.05);
`},
{
  id:'sliding-window', module:'traffic', title:'Fixed window vs sliding-window counter', summary:'See why a fixed window lets a burst through at the edge between two windows. Then fix it with a sliding-window counter.',
  explain:`<h3>What you will build</h3><p>Two limiters for the ticket site’s seat checks, both set to “100 a second”. One uses a fixed window and one uses a sliding window.</p><h3>How it works</h3><ol><li>A fixed window counts checks in each whole second, then resets at the start of the next one.</li><li>A script sends 100 checks at 0.99 s and 100 more at 1.00 s. That is 200 in 10 ms.</li><li>The sliding counter estimates the last second as <code>previous × (1 − elapsed fraction) + current</code>.</li><li>It needs only two counters for each user.</li></ol><h3>What to notice</h3><ul><li>The fixed window lets 200 through. The sliding counter holds the limit at 100.</li><li>Room frees up gradually, not all at once. Cloudflare has described this approach.</li></ul><div class="callout tip"><b>Important point</b><p>A fixed window can allow twice the limit across the edge of two windows. A sliding window removes that gap.</p></div>`,
  challenge:'Part 1: build the exact sliding-window log, which stores one timestamp for each check. Part 2: compare its memory for each user with the counter at 1,000 checks a second.',
  code:`
class FixedWindow {
  constructor(limit, windowMs) { Object.assign(this, { limit, windowMs, win: -1, count: 0 }); }
  allow(now) {
    const w = Math.floor(now / this.windowMs);
    if (w !== this.win) { this.win = w; this.count = 0; }   // a new window: start counting again
    if (this.count < this.limit) { this.count++; return true; }
    return false;
  }
}
class SlidingWindowCounter {
  constructor(limit, windowMs) { Object.assign(this, { limit, windowMs, win: -1, cur: 0, prev: 0 }); }
  allow(now) {
    const w = Math.floor(now / this.windowMs);
    if (w !== this.win) { this.prev = (w === this.win + 1) ? this.cur : 0; this.cur = 0; this.win = w; }
    const elapsed = (now % this.windowMs) / this.windowMs;
    const estimate = this.prev * (1 - elapsed) + this.cur;   // part of the last window, plus this one
    if (estimate < this.limit) { this.cur++; return true; }
    return false;
  }
}

function burstAroundBoundary(limiter) {
  let ok = 0;
  for (let i = 0; i < 150; i++) if (limiter.allow(990)) ok++;    // just before the edge
  for (let i = 0; i < 150; i++) if (limiter.allow(1000)) ok++;   // just after it
  return ok;
}
const fixed = burstAroundBoundary(new FixedWindow(100, 1000));
const sliding = burstAroundBoundary(new SlidingWindowCounter(100, 1000));
console.log('seat checks allowed within 10 ms around the edge → fixed window:', fixed, '| sliding window:', sliding);

const s = new SlidingWindowCounter(100, 1000); for (let i = 0; i < 100; i++) s.allow(990);
let half = 0; for (let i = 0; i < 100; i++) if (s.allow(1500)) half++;
console.log('half a window later, the sliding counter allows', half, 'more');

check('the fixed window lets through twice the limit at the edge', fixed === 200);
check('the sliding window holds the limit (100)', sliding === 100);
check('room frees up gradually (about 50 after half a window)', half === 50);
`},
{
  id:'snowflake-id', module:'distributed', title:'Snowflake ID generator', summary:'Make 64-bit IDs that are unique and roughly in time order, from a timestamp, a server number and a counter. Handle the counter running out, and refuse to run if the clock goes backwards.',
  explain:`<h3>What you will build</h3><p>An ID maker for the workspace app, so many servers can name new tasks without asking each other.</p><h3>How it works</h3><ol><li>Take the current millisecond, counted from your own start date. This uses 41 bits and lasts about 69 years.</li><li>Add the server number. This uses 10 bits, so up to 1,024 servers.</li><li>Add a counter that restarts every millisecond. This uses 12 bits, so 4,096 IDs per millisecond per server.</li><li>If the counter is used up, wait for the next millisecond. The first bit is left unused.</li></ol><h3>What to notice</h3><ul><li>BigInt keeps all 64 bits exact in JavaScript. Send IDs to browsers as strings, because JSON numbers lose precision above 2⁵³.</li><li>If the clock moves backwards, the same ID could be made twice. So the generator refuses to run.</li></ul><div class="callout tip"><b>Important point</b><p>The time part makes IDs sort by creation time. The server number and counter keep them unique, with no central machine to ask.</p></div>`,
  challenge:'Part 1: split the 10 server bits into 5 datacenter bits and 5 machine bits. Part 2: lease server numbers from a coordinator, so two machines never share one.',
  code:`
const EPOCH = 1704067200000n;          // our own start date: 2024-01-01T00:00:00Z
class Snowflake {
  constructor(workerId, clock) {
    if (workerId < 0 || workerId > 1023) throw new Error('the server number must fit in 10 bits');
    this.worker = BigInt(workerId); this.clock = clock; this.lastMs = -1n; this.seq = 0n; this.waits = 0;
  }
  next() {
    let now = BigInt(this.clock());
    if (now < this.lastMs) throw new Error(\`clock moved backwards by \${this.lastMs - now} ms, so no ID is made\`);
    if (now === this.lastMs) {
      this.seq = (this.seq + 1n) & 4095n;
      if (this.seq === 0n) { while (now <= this.lastMs) { now = BigInt(this.clock()); this.waits++; } }   // all 4,096 used: wait for the next millisecond
    } else this.seq = 0n;
    this.lastMs = now;
    return ((now - EPOCH) << 22n) | (this.worker << 12n) | this.seq;
  }
  static decode(id) {
    return { ms: Number((id >> 22n) + EPOCH), worker: Number((id >> 12n) & 1023n), seq: Number(id & 4095n) };
  }
}

// A fake clock that stays on the same millisecond for 5,000 calls, then moves on
let t = 1735689600000, calls = 0;
const clock = () => (++calls % 5000 === 0 ? ++t : t);
const gen = new Snowflake(42, clock);
const ids = Array.from({ length: 10000 }, () => gen.next());

console.log('first task ID:', ids[0].toString(), '→', Snowflake.decode(ids[0]));
console.log('waited for the next millisecond', gen.waits, 'times after the 4,096 counter values ran out');
check('all 10,000 IDs are unique', new Set(ids.map(String)).size === ids.length);
check('IDs always increase (they sort by time)', ids.every((x, i) => i === 0 || x > ids[i - 1]));
check('the server number decodes back to 42', Snowflake.decode(ids[777]).worker === 42);
check('IDs fit in 63 bits (a positive signed 64-bit number)', ids.every(x => x > 0n && x < (1n << 63n)));

let refused = false;
const g2 = new Snowflake(1, (() => { let c = 0; return () => (c++ < 3 ? 1735689600500 : 1735689600400); })());
try { g2.next(); g2.next(); g2.next(); g2.next(); } catch (e) { refused = true; console.warn(e.message); }
check('a clock that goes backwards is refused, so no duplicate is made', refused);
`},
{
  id:'merkle-diff', module:'distributed', timeout:10000, title:'Merkle-tree anti-entropy', summary:'Two copies of a workspace compare small hashes of their tasks to find which groups differ. They exchange a handful of hashes instead of every task.',
  explain:`<h3>What you will build</h3><p>A check that finds which tasks differ between two copies of a workspace. Dynamo-style stores such as Cassandra and Riak repair their copies this way in the background.</p><h3>How it works</h3><ol><li>Put the tasks into 64 buckets, using a hash of each key.</li><li>Hash each bucket. Then hash pairs of hashes, level by level, up to one root hash.</li><li>If the two roots match, the copies are identical.</li><li>If not, go down only into the branches whose hashes differ.</li></ol><h3>What to notice</h3><ul><li>The cost is about d × log B hash comparisons, for d different buckets out of B buckets.</li></ul><div class="callout tip"><b>Important point</b><p>Matching hashes let you skip a whole branch at once. That is how two copies find a few differences without comparing every task.</p></div>`,
  challenge:'Part 1: make the tree update only the hashes on one task’s path to the root when that task changes. Part 2: count how many hashes are recomputed for one change.',
  code:`
function h(str) {
  let x = 0x811c9dc5; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 0x01000193); }
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15;
  return (x >>> 0).toString(16).padStart(8, '0');
}
const BUCKETS = 64;                                     // the leaves of the tree (a power of two)
const bucketOf = key => parseInt(h('b:' + key), 16) % BUCKETS;

function buildTree(store) {
  const leaves = Array.from({ length: BUCKETS }, () => []);
  for (const [k, v] of [...store].sort()) leaves[bucketOf(k)].push(k + '=' + v);
  let level = leaves.map(items => h(items.join('|')));   // one hash per bucket
  const levels = [level];
  while (level.length > 1) { const up = []; for (let i = 0; i < level.length; i += 2) up.push(h(level[i] + level[i + 1])); levels.unshift(up); level = up; }
  return levels;                                        // levels[0] is the root, the last level is the leaves
}

function diff(a, b) {
  let comparisons = 0; const out = [];
  (function walk(depth, idx) {
    comparisons++;
    if (a[depth][idx] === b[depth][idx]) return;        // same hash: skip this whole branch
    if (depth === a.length - 1) { out.push(idx); return; }
    walk(depth + 1, idx * 2); walk(depth + 1, idx * 2 + 1);
  })(0, 0);
  return { buckets: out, comparisons };
}

const replicaA = new Map(), replicaB = new Map();
for (let i = 0; i < 100000; i++) { replicaA.set('task:' + i, 'open'); replicaB.set('task:' + i, 'open'); }
const changed = ['task:12', 'task:5000', 'task:77777'];
replicaB.set(changed[0], 'done'); replicaB.set(changed[1], 'done'); replicaB.delete(changed[2]);   // copy B missed some changes

const ta = buildTree(replicaA), tb = buildTree(replicaB);
const d = diff(ta, tb);
const expected = [...new Set(changed.map(bucketOf))].sort((x, y) => x - y);
console.log('root of copy A', ta[0][0], '| root of copy B', tb[0][0]);
console.log('buckets that differ:', d.buckets, '→ found with', d.comparisons, 'hash comparisons (instead of 100,000 task comparisons)');

check('the roots differ when the copies differ', ta[0][0] !== tb[0][0]);
check('it finds exactly the buckets that hold the changed tasks', JSON.stringify(d.buckets) === JSON.stringify(expected));
check('it needs far fewer comparisons than there are tasks', d.comparisons < 50);
const tc = buildTree(new Map(replicaA));
check('identical copies need one comparison (the root)', diff(ta, tc).comparisons === 1);
`},
{
  id:'lsm-tree', module:'databases', title:'A tiny LSM-tree', summary:'Build a tiny store where writes go to memory first and are saved as sorted files. Deletes leave a marker, reads check the newest file first, and compaction merges the files.',
  explain:`<h3>What you will build</h3><p>A price store for the hotel app, which receives many price changes. Cassandra, RocksDB, LevelDB and ScyllaDB store data this way.</p><h3>How it works</h3><ol><li>A write goes into a table in memory, called the memtable.</li><li>When it is full, it is saved as a sorted file that never changes (an SSTable).</li><li>A delete writes a marker called a tombstone.</li><li>A read checks memory, then the files from newest to oldest.</li><li>Compaction merges the files, keeps the newest value and drops the tombstones.</li></ol><h3>What to notice</h3><ul><li>Writes are fast, because they are only appends. A read may check several files, which is called read amplification.</li><li>A real system also writes a log (a WAL) first, so a crash loses nothing. This lab skips it.</li></ul><div class="callout tip"><b>Important point</b><p>An LSM-tree makes writes cheap and pays for it later on reads, until compaction cleans up.</p></div>`,
  challenge:'Part 1: add a Bloom filter to each file. Part 2: count how many file lookups it saves for rooms that do not exist.',
  code:`
const TOMBSTONE = Symbol('deleted');
class LSMTree {
  constructor(memtableLimit = 4) { this.limit = memtableLimit; this.memtable = new Map(); this.sstables = []; this.reads = 0; }
  put(key, value) { this.memtable.set(key, value); if (this.memtable.size >= this.limit) this.flush(); }
  delete(key) { this.put(key, TOMBSTONE); }            // a delete is a write too
  flush() {
    if (!this.memtable.size) return;
    const sorted = [...this.memtable].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    this.sstables.unshift(sorted);                     // newest file first, and it never changes again
    this.memtable = new Map();
  }
  get(key) {
    if (this.memtable.has(key)) { const v = this.memtable.get(key); return v === TOMBSTONE ? undefined : v; }
    for (const table of this.sstables) {               // check the files from newest to oldest
      this.reads++;
      let lo = 0, hi = table.length - 1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; const k = table[mid][0]; if (k === key) { const v = table[mid][1]; return v === TOMBSTONE ? undefined : v; } if (k < key) lo = mid + 1; else hi = mid - 1; }
    }
    return undefined;
  }
  compact() {                                          // merge all files, keep the newest value, drop tombstones
    const merged = new Map();
    for (const table of [...this.sstables].reverse()) for (const [k, v] of table) merged.set(k, v);
    const out = [...merged].filter(([, v]) => v !== TOMBSTONE).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    this.sstables = out.length ? [out] : [];
  }
}

const db = new LSMTree(4);
['r101', 'r102', 'r103', 'r104', 'r105', 'r106', 'r107', 'r108'].forEach((k, i) => db.put(k, 'price-v1-' + i));   // the first room prices
db.put('r101', 'price-v2');     // a price change: the newer price lives in a newer file
db.delete('r102');              // the room is no longer sold: a tombstone hides the old price
db.put('r109', 'price-v1'); db.put('r110', 'price-v1'); db.flush();
console.log('files before compaction:', db.sstables.length, db.sstables.map(t => t.map(([k, v]) => k + (v === TOMBSTONE ? '✝' : '')).join(',')));

db.reads = 0; const before = db.get('r108'); const readsBefore = db.reads;
check('the newest price wins', db.get('r101') === 'price-v2');
check('a deleted room is gone (the tombstone hides it)', db.get('r102') === undefined);
check('older rooms can still be read', before === 'price-v1-7');

db.compact();
db.reads = 0; db.get('r108');
console.log(\`reading "r108" checked \${readsBefore} file(s) before compaction and \${db.reads} after\`);
check('compaction leaves a single file', db.sstables.length === 1);
check('compaction drops tombstones and old versions for good', db.sstables[0].length === 9 && !db.sstables[0].some(([k]) => k === 'r102'));
check('compaction means fewer files to read', db.reads < readsBefore);
`}
];
LABS.forEach(l => { try { SDA.register(Object.assign({kind:'lab'}, l)); } catch(e){ console.error('[SDA] lab ' + l.id, e); SDA.errors.push({id:l.id, error:e}); } });

/* Link labs into the matching lessons’ “Try it” sections */
try {
  const LINKS = {'cache-eviction':'lru-cache', 'rate-limiting':['token-bucket', 'sliding-window'], 'consistent-hashing':'consistent-hashing', 'bloom-filters':'bloom-filter', 'unique-ids':'snowflake-id', 'crdts-merkle':'merkle-diff', 'btree-vs-lsm':'lsm-tree'};
  SDA.register({kind:'extend', install(S){
    Object.entries(LINKS).forEach(([lessonId, labs]) => {
      const l = S.lessons.get(lessonId); if (!l) return;
      const arr = Array.isArray(l.tryit) ? l.tryit.slice() : (l.tryit ? [l.tryit] : []);
      [].concat(labs).forEach(id => { if (!arr.some(x => x.lab === id)) arr.push({note:`<b>Code lab:</b> build it yourself and run it here.`, lab:id}); });
      l.tryit = arr;
    });
  }});
} catch(e){ console.error('[SDA] lab links', e); SDA.errors.push({id:'lab-links', error:e}); }
})();
