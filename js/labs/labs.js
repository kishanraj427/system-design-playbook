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
  id:'lru-cache', module:'caching', timeout:10000, title:'LRU cache in O(1)', summary:'Build a least-recently-used cache with O(1) get and put, then measure its hit ratio on a skewed (Zipf) workload as capacity grows.',
  explain:`<p>A JavaScript <code>Map</code> remembers insertion order, so deleting and re-inserting a key moves it to the “most recent” end, and <code>map.keys().next()</code> is the least recent. That gives O(1) operations without writing a linked list. Real caches such as Redis use approximated LRU (sampling a few keys) to save memory.</p>`,
  challenge:'Re-implement it with a hash map + doubly linked list (what interviewers usually expect), then add a per-key TTL so expired entries count as misses.',
  code:`
// LRU cache: evict the entry that was used least recently
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.map = new Map();          // key -> value, in recency order (oldest first)
    this.hits = 0; this.misses = 0;
  }
  get(key) {
    if (!this.map.has(key)) { this.misses++; return undefined; }
    const value = this.map.get(key);
    this.map.delete(key);          // move key to the most-recent end
    this.map.set(key, value);
    this.hits++;
    return value;
  }
  put(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.capacity) {
      const lru = this.map.keys().next().value;   // oldest = least recently used
      this.map.delete(lru);
    }
    this.map.set(key, value);
  }
}

const c = new LRUCache(3);
c.put('a', 1); c.put('b', 2); c.put('c', 3);
c.get('a');                 // 'a' becomes most recent
c.put('d', 4);              // evicts 'b'
console.log('keys (oldest → newest):', [...c.map.keys()]);
check('b was evicted', c.get('b') === undefined);
check('a survived because it was used', c.get('a') === 1);
check('size never exceeds capacity', c.map.size === 3);

// Hit ratio on a skewed workload: a few keys are very popular (Zipf, s = 1.1)
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
  for (let i = 0; i < 50000; i++) { const k = next(); if (cache.get(k) === undefined) cache.put(k, 'row-' + k); }
  const ratio = cache.hits / (cache.hits + cache.misses);
  results.push(ratio);
  console.log(\`capacity \${cap.toString().padStart(4)} (\${cap / 100}% of keys) → hit ratio \${(ratio * 100).toFixed(1)}%\`);
}
check('bigger cache, higher hit ratio', results[0] < results[1] && results[1] < results[2]);
check('caching 10% of keys serves most reads (skew!)', results[2] > 0.6);
`},
{
  id:'token-bucket', module:'traffic', title:'Token-bucket rate limiter', summary:'Implement a token bucket that allows bursts up to a capacity and a steady refill rate, then compute Retry-After for rejected requests.',
  explain:`<p>Tokens refill continuously at <i>rate</i> per second up to <i>capacity</i>. Each request spends one token. A full bucket allows a burst of <i>capacity</i>; after that, throughput settles at <i>rate</i>. Storing only <code>tokens</code> and <code>lastRefill</code> per client is all the state you need, so it fits in Redis with an atomic Lua script for a distributed limiter.</p>`,
  challenge:'Make it distributed: store {tokens, last} per user in a Map that imitates Redis, and make check-and-decrement atomic. Then add a cost parameter so expensive endpoints spend 5 tokens.',
  code:`
class TokenBucket {
  constructor(ratePerSec, capacity, nowMs = 0) {
    this.rate = ratePerSec; this.capacity = capacity;
    this.tokens = capacity;   // start full: allows an initial burst
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
    const retryAfterMs = Math.ceil((cost - this.tokens) / this.rate * 1000);
    return { ok: false, retryAfterMs };
  }
}

// 10 requests/second steady, bursts up to 20
const b = new TokenBucket(10, 20, 0);
let burstOk = 0, firstReject = null;
for (let i = 0; i < 50; i++) { const r = b.allow(0); if (r.ok) burstOk++; else if (!firstReject) firstReject = r; }
console.log('burst at t=0:', burstOk, 'allowed, then 429 with Retry-After', firstReject.retryAfterMs, 'ms');

let later = 0;
for (let t = 50; t <= 2000; t += 50) if (b.allow(t).ok) later++;   // one request every 50 ms for 2 s
console.log('next 2 s at 20 req/s offered:', later, 'allowed');

check('burst capped at capacity (20)', burstOk === 20);
check('Retry-After is about one token (100 ms)', firstReject.retryAfterMs === 100);
check('steady state ≈ refill rate: 10/s × 2 s = 20', later === 20);

// Per-user buckets: each client gets its own state
const buckets = new Map();
const allowUser = (user, now) => { if (!buckets.has(user)) buckets.set(user, new TokenBucket(5, 5, now)); return buckets.get(user).allow(now).ok; };
let asha = 0, ravi = 0;
for (let i = 0; i < 10; i++) { if (allowUser('asha', 0)) asha++; }
if (allowUser('ravi', 0)) ravi++;
check('one noisy user cannot exhaust another user\\'s quota', asha === 5 && ravi === 1);
`},
{
  id:'consistent-hashing', module:'databases', title:'Consistent hashing with virtual nodes', summary:'Build a hash ring with virtual nodes, measure load balance, and compare how many keys move when a node is added versus naive hash-mod-N.',
  explain:`<p>Each physical node is placed on the ring many times (virtual nodes). A key belongs to the first virtual node clockwise from its hash. Adding a node only takes keys from its new neighbours, about 1/N of keys, while <code>hash % N</code> remaps almost everything. A strong hash matters: plain FNV clusters similar strings, so we add a murmur-style finaliser.</p>`,
  challenge:'Add weights (a bigger server gets more virtual nodes), and a replication factor: return the next R distinct physical nodes clockwise.',
  code:`
function hash32(str) {                     // FNV-1a + murmur3 finaliser for good mixing
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

class HashRing {
  constructor(vnodes = 150) { this.vnodes = vnodes; this.ring = []; }   // sorted [hash, node]
  addNode(node) {
    for (let i = 0; i < this.vnodes; i++) this.ring.push([hash32(node + '#' + i), node]);
    this.ring.sort((a, b) => a[0] - b[0]);
  }
  removeNode(node) { this.ring = this.ring.filter(([, n]) => n !== node); }
  getNode(key) {
    const h = hash32(key); let lo = 0, hi = this.ring.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.ring[mid][0] < h) lo = mid + 1; else hi = mid; }
    return this.ring[lo === this.ring.length ? 0 : lo][1];   // wrap around
  }
}

const keys = Array.from({ length: 20000 }, (_, i) => 'user:' + i);
const ring = new HashRing(150);
['cache-a', 'cache-b', 'cache-c', 'cache-d'].forEach(n => ring.addNode(n));

const count = {}; const before = new Map();
for (const k of keys) { const n = ring.getNode(k); before.set(k, n); count[n] = (count[n] || 0) + 1; }
console.log('keys per node:', count);
const loads = Object.values(count), avg = keys.length / 4;
const imbalance = Math.max(...loads) / avg;
console.log('max / average load =', imbalance.toFixed(2));

ring.addNode('cache-e');
const moved = keys.filter(k => ring.getNode(k) !== before.get(k)).length / keys.length;
const modMoved = keys.filter(k => hash32(k) % 4 !== hash32(k) % 5).length / keys.length;
console.log(\`add a 5th node → consistent hashing moved \${(moved * 100).toFixed(1)}% of keys; hash % N moved \${(modMoved * 100).toFixed(1)}%\`);

check('load is reasonably balanced (max/avg < 1.3)', imbalance < 1.3);
check('about 1/5 of keys move to the new node', moved > 0.12 && moved < 0.28);
check('hash % N reshuffles most keys', modMoved > 0.7);
check('keys that moved all went to the new node', keys.every(k => ring.getNode(k) === before.get(k) || ring.getNode(k) === 'cache-e'));
`},
{
  id:'bloom-filter', module:'search', title:'Bloom filter', summary:'Size a Bloom filter from the expected item count and target false-positive rate, insert items, and measure the real false-positive rate against the formula.',
  explain:`<p>With n items and target false-positive rate p, the optimal size is <code>m = −n·ln p / (ln 2)²</code> bits and <code>k = (m/n)·ln 2</code> hash functions. Double hashing (<code>h1 + i·h2</code>) gives k hash functions from two. There are never false negatives; false positives approach <code>(1 − e^(−kn/m))^k</code>.</p>`,
  challenge:'Add a counting Bloom filter (small counters instead of bits) so items can be deleted, and measure how much memory it costs.',
  code:`
function h32(str, seed) {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

class BloomFilter {
  constructor(expectedItems, fpRate) {
    this.m = Math.ceil(-expectedItems * Math.log(fpRate) / (Math.LN2 ** 2));   // bits
    this.k = Math.max(1, Math.round(this.m / expectedItems * Math.LN2));       // hash functions
    this.bits = new Uint8Array(Math.ceil(this.m / 8));
  }
  *positions(item) {
    const a = h32(item, 0), b = h32(item, 0x9e3779b9) | 1;
    for (let i = 0; i < this.k; i++) yield (a + Math.imul(i, b) >>> 0) % this.m;
  }
  add(item) { for (const p of this.positions(item)) this.bits[p >> 3] |= 1 << (p & 7); }
  mightContain(item) { for (const p of this.positions(item)) if (!(this.bits[p >> 3] & (1 << (p & 7)))) return false; return true; }
}

const n = 5000, target = 0.01;
const bf = new BloomFilter(n, target);
console.log(\`m = \${bf.m} bits (\${(bf.m / 8 / 1024).toFixed(1)} KB, \${(bf.m / n).toFixed(1)} bits per item), k = \${bf.k} hash functions\`);

for (let i = 0; i < n; i++) bf.add('user' + i + '@mail.in');
const noFalseNegatives = Array.from({ length: n }, (_, i) => 'user' + i + '@mail.in').every(x => bf.mightContain(x));

let fp = 0; const trials = 50000;
for (let i = 0; i < trials; i++) if (bf.mightContain('stranger' + i + '@mail.in')) fp++;
const measured = fp / trials, theory = (1 - Math.exp(-bf.k * n / bf.m)) ** bf.k;
console.log(\`false-positive rate: measured \${(measured * 100).toFixed(2)}%, theory \${(theory * 100).toFixed(2)}%\`);

check('no false negatives, ever', noFalseNegatives);
check('measured FP rate close to the 1% target', measured > 0.005 && measured < 0.02);
check('about 9.6 bits per item for 1%', Math.abs(bf.m / n - 9.585) < 0.05);
`},
{
  id:'sliding-window', module:'traffic', title:'Fixed window vs sliding-window counter', summary:'Show the boundary-burst problem of fixed windows, then fix it with a sliding-window counter that weights the previous window.',
  explain:`<p>A fixed window of “100 per second” allows 100 requests at 0.99 s and another 100 at 1.00 s: 200 in 10 ms. The sliding-window counter estimates the rate over the last full window as <code>previous × (1 − elapsed fraction) + current</code>, using only two counters per key (Cloudflare described this approach).</p>`,
  challenge:'Implement the exact sliding-window log (store timestamps) and compare memory per client with the counter approach at 1,000 req/s.',
  code:`
class FixedWindow {
  constructor(limit, windowMs) { Object.assign(this, { limit, windowMs, win: -1, count: 0 }); }
  allow(now) {
    const w = Math.floor(now / this.windowMs);
    if (w !== this.win) { this.win = w; this.count = 0; }
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
    const estimate = this.prev * (1 - elapsed) + this.cur;
    if (estimate < this.limit) { this.cur++; return true; }
    return false;
  }
}

function burstAroundBoundary(limiter) {
  let ok = 0;
  for (let i = 0; i < 150; i++) if (limiter.allow(990)) ok++;    // just before the boundary
  for (let i = 0; i < 150; i++) if (limiter.allow(1000)) ok++;   // just after it
  return ok;
}
const fixed = burstAroundBoundary(new FixedWindow(100, 1000));
const sliding = burstAroundBoundary(new SlidingWindowCounter(100, 1000));
console.log('allowed within 10 ms around the boundary → fixed:', fixed, '| sliding:', sliding);

const s = new SlidingWindowCounter(100, 1000); for (let i = 0; i < 100; i++) s.allow(990);
let half = 0; for (let i = 0; i < 100; i++) if (s.allow(1500)) half++;
console.log('half a window later the sliding counter allows', half, 'more');

check('fixed window lets through 2× the limit at the boundary', fixed === 200);
check('sliding window holds the limit (100)', sliding === 100);
check('capacity frees up gradually (≈50 after half a window)', half === 50);
`},
{
  id:'snowflake-id', module:'distributed', title:'Snowflake ID generator', summary:'Generate 64-bit, roughly time-ordered unique IDs from timestamp, worker ID and sequence bits, handle sequence overflow and refuse clock rollback.',
  explain:`<p>Layout: 1 unused sign bit · 41 bits of milliseconds since a custom epoch (~69 years) · 10 bits of worker ID (1,024 workers) · 12 bits of sequence (4,096 IDs per ms per worker). BigInt keeps all 64 bits exact in JavaScript; send IDs to browsers as strings, because JSON numbers lose precision above 2⁵³.</p>`,
  challenge:'Split the 10 worker bits into 5 datacenter + 5 machine bits, and lease worker IDs from a coordinator so two machines never share one.',
  code:`
const EPOCH = 1704067200000n;          // 2024-01-01T00:00:00Z, a custom epoch
class Snowflake {
  constructor(workerId, clock) {
    if (workerId < 0 || workerId > 1023) throw new Error('workerId must fit in 10 bits');
    this.worker = BigInt(workerId); this.clock = clock; this.lastMs = -1n; this.seq = 0n; this.waits = 0;
  }
  next() {
    let now = BigInt(this.clock());
    if (now < this.lastMs) throw new Error(\`clock moved backwards by \${this.lastMs - now} ms; refusing to generate\`);
    if (now === this.lastMs) {
      this.seq = (this.seq + 1n) & 4095n;
      if (this.seq === 0n) { while (now <= this.lastMs) { now = BigInt(this.clock()); this.waits++; } }   // 4,096 used: wait for next ms
    } else this.seq = 0n;
    this.lastMs = now;
    return ((now - EPOCH) << 22n) | (this.worker << 12n) | this.seq;
  }
  static decode(id) {
    return { ms: Number((id >> 22n) + EPOCH), worker: Number((id >> 12n) & 1023n), seq: Number(id & 4095n) };
  }
}

// A fake clock: stays on the same millisecond for 5,000 calls, then advances
let t = 1735689600000, calls = 0;
const clock = () => (++calls % 5000 === 0 ? ++t : t);
const gen = new Snowflake(42, clock);
const ids = Array.from({ length: 10000 }, () => gen.next());

console.log('first id:', ids[0].toString(), '→', Snowflake.decode(ids[0]));
console.log('waited for the next millisecond', gen.waits, 'times after exhausting 4,096 sequence numbers');
check('all 10,000 IDs are unique', new Set(ids.map(String)).size === ids.length);
check('IDs strictly increase (time-ordered)', ids.every((x, i) => i === 0 || x > ids[i - 1]));
check('worker ID decodes back to 42', Snowflake.decode(ids[777]).worker === 42);
check('IDs fit in 63 bits (positive signed 64-bit)', ids.every(x => x > 0n && x < (1n << 63n)));

let refused = false;
const g2 = new Snowflake(1, (() => { let c = 0; return () => (c++ < 3 ? 1735689600500 : 1735689600400); })());
try { g2.next(); g2.next(); g2.next(); g2.next(); } catch (e) { refused = true; console.warn(e.message); }
check('clock rollback is refused instead of risking duplicates', refused);
`},
{
  id:'merkle-diff', module:'distributed', timeout:10000, title:'Merkle-tree anti-entropy', summary:'Two replicas compare Merkle trees of their key ranges to find exactly which ranges differ, exchanging a handful of hashes instead of every key.',
  explain:`<p>Dynamo-style stores (Dynamo, Cassandra, Riak) repair replicas in the background this way. Keys are bucketed by range; each leaf hashes its bucket; each parent hashes its children. If the roots match the replicas are identical. If not, descend only into children whose hashes differ. Cost is about O(d·log B) comparisons for d differing buckets out of B.</p>`,
  challenge:'Make the tree incremental: when one key changes, recompute only the hashes on its path to the root.',
  code:`
function h(str) {
  let x = 0x811c9dc5; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 0x01000193); }
  x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15;
  return (x >>> 0).toString(16).padStart(8, '0');
}
const BUCKETS = 64;                                     // leaves; must be a power of two
const bucketOf = key => parseInt(h('b:' + key), 16) % BUCKETS;

function buildTree(store) {
  const leaves = Array.from({ length: BUCKETS }, () => []);
  for (const [k, v] of [...store].sort()) leaves[bucketOf(k)].push(k + '=' + v);
  let level = leaves.map(items => h(items.join('|')));
  const levels = [level];
  while (level.length > 1) { const up = []; for (let i = 0; i < level.length; i += 2) up.push(h(level[i] + level[i + 1])); levels.unshift(up); level = up; }
  return levels;                                        // levels[0] = [root], last = leaves
}

function diff(a, b) {
  let comparisons = 0; const out = [];
  (function walk(depth, idx) {
    comparisons++;
    if (a[depth][idx] === b[depth][idx]) return;        // identical subtree: skip it entirely
    if (depth === a.length - 1) { out.push(idx); return; }
    walk(depth + 1, idx * 2); walk(depth + 1, idx * 2 + 1);
  })(0, 0);
  return { buckets: out, comparisons };
}

const replicaA = new Map(), replicaB = new Map();
for (let i = 0; i < 100000; i++) { replicaA.set('order:' + i, 'v1'); replicaB.set('order:' + i, 'v1'); }
const changed = ['order:12', 'order:5000', 'order:77777'];
replicaB.set(changed[0], 'v2'); replicaB.set(changed[1], 'v2'); replicaB.delete(changed[2]);   // B missed writes

const ta = buildTree(replicaA), tb = buildTree(replicaB);
const d = diff(ta, tb);
const expected = [...new Set(changed.map(bucketOf))].sort((x, y) => x - y);
console.log('root A', ta[0][0], 'root B', tb[0][0]);
console.log('differing buckets:', d.buckets, 'found with', d.comparisons, 'hash comparisons (vs 100,000 key comparisons)');

check('roots differ when replicas differ', ta[0][0] !== tb[0][0]);
check('finds exactly the buckets containing changed keys', JSON.stringify(d.buckets) === JSON.stringify(expected));
check('needs far fewer comparisons than keys', d.comparisons < 50);
const tc = buildTree(new Map(replicaA));
check('identical replicas need one comparison (the root)', diff(ta, tc).comparisons === 1);
`},
{
  id:'lsm-tree', module:'databases', title:'A tiny LSM-tree', summary:'Writes go to an in-memory memtable, flush to immutable sorted SSTables, deletes write tombstones, reads check newest first, and compaction merges tables.',
  explain:`<p>This is how Cassandra, RocksDB, LevelDB and ScyllaDB store data: writes are fast sequential appends, and reads may need to check several tables (<b>read amplification</b>), which Bloom filters and compaction reduce. A real system also writes a WAL for durability before the memtable; this lab skips that.</p>`,
  challenge:'Add a Bloom filter per SSTable and count how many table lookups it saves for keys that don’t exist.',
  code:`
const TOMBSTONE = Symbol('deleted');
class LSMTree {
  constructor(memtableLimit = 4) { this.limit = memtableLimit; this.memtable = new Map(); this.sstables = []; this.reads = 0; }
  put(key, value) { this.memtable.set(key, value); if (this.memtable.size >= this.limit) this.flush(); }
  delete(key) { this.put(key, TOMBSTONE); }            // deletes are writes too
  flush() {
    if (!this.memtable.size) return;
    const sorted = [...this.memtable].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    this.sstables.unshift(sorted);                     // newest table first; immutable from now on
    this.memtable = new Map();
  }
  get(key) {
    if (this.memtable.has(key)) { const v = this.memtable.get(key); return v === TOMBSTONE ? undefined : v; }
    for (const table of this.sstables) {               // newest → oldest
      this.reads++;
      let lo = 0, hi = table.length - 1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; const k = table[mid][0]; if (k === key) { const v = table[mid][1]; return v === TOMBSTONE ? undefined : v; } if (k < key) lo = mid + 1; else hi = mid - 1; }
    }
    return undefined;
  }
  compact() {                                          // merge all tables, keep newest value, drop tombstones
    const merged = new Map();
    for (const table of [...this.sstables].reverse()) for (const [k, v] of table) merged.set(k, v);
    const out = [...merged].filter(([, v]) => v !== TOMBSTONE).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    this.sstables = out.length ? [out] : [];
  }
}

const db = new LSMTree(4);
['dosa', 'idli', 'vada', 'poha', 'upma', 'chai', 'lassi', 'kulfi'].forEach((k, i) => db.put(k, 'v1-' + i));
db.put('dosa', 'v2');           // newer value lives in a newer table
db.delete('idli');              // tombstone hides the old value
db.put('jalebi', 'v1'); db.put('rasam', 'v1'); db.flush();
console.log('SSTables before compaction:', db.sstables.length, db.sstables.map(t => t.map(([k, v]) => k + (v === TOMBSTONE ? '✝' : '')).join(',')));

db.reads = 0; const before = db.get('kulfi'); const readsBefore = db.reads;
check('newest write wins', db.get('dosa') === 'v2');
check('deleted key is gone (tombstone)', db.get('idli') === undefined);
check('old keys still readable', before === 'v1-7');

db.compact();
db.reads = 0; db.get('kulfi');
console.log(\`reading "kulfi" touched \${readsBefore} table(s) before compaction, \${db.reads} after\`);
check('compaction leaves a single table', db.sstables.length === 1);
check('compaction physically drops tombstones and old versions', db.sstables[0].length === 9 && !db.sstables[0].some(([k]) => k === 'idli'));
check('compaction reduces read amplification', db.reads < readsBefore);
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
