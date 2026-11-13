/* =====================================================================
   PART 9 · STARTER CASES (a) — URL shortener · Pastebin · Rate limiter · Unique ID generator
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, esc, fmtNum} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const frag = html => document.createRange().createContextualFragment(html);
const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const toB62 = n => { n = BigInt(n); if (n === 0n) return '0'; let s = ''; while (n > 0n){ s = B62[Number(n % 62n)] + s; n /= 62n; } return s; };
const fromB62 = s => [...s].reduce((a, ch) => { const i = B62.indexOf(ch); if (i < 0) throw new Error('not base62: ' + ch); return a * 62n + BigInt(i); }, 0n);
SDA.base62 = {toB62, fromB62};
function collisionCalc(host, o){
  const P = {len:o.len || 7, n:o.n || 1e9}; const out = el('div');
  function run(){
    const space = Math.pow(62, P.len); const pAny = 1 - Math.exp(-P.n * P.n / (2 * space)); const pNext = P.n / space;
    out.innerHTML = '';
    out.append(frag(h.table(['Quantity', 'Value'], [['Possible codes 62^' + P.len, fmtNum(space)], ['Codes already used', fmtNum(P.n)], ['Chance the NEXT random code collides', (pNext * 100).toPrecision(3) + '%'], ['Chance of at least one collision so far (birthday bound)', (pAny * 100).toPrecision(3) + '%']], [1])));
    out.append(el('div', {class:'verdict ' + (pNext > .01 ? 'bad' : pNext > 1e-4 ? 'warn' : 'ok')}, pNext > .01 ? 'Random codes now collide often: every insert needs a uniqueness check and retries, and latency grows as the space fills. Use longer codes or counter-based IDs.' : pAny > .5 ? 'At least one collision is practically certain at this volume, so random codes always need a unique constraint plus retry, even if each insert rarely collides.' : 'Collisions are rare, but keep a unique constraint and retry anyway.'));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Code length (base62 chars)', min:5, max:10, value:P.len, fmt:v => String(v), onInput:v => { P.len = v; run(); }}).el, ui.slider({label:'Codes already issued', min:6, max:12, step:.1, value:Math.log10(P.n), fmt:v => fmtNum(Math.pow(10, v)), onInput:v => { P.n = Math.pow(10, v); run(); }}).el), out);
  run();
}
function base62Demo(host){
  const inp = el('input', {class:'input mono', value:'125000000000', 'aria-label':'Numeric ID', style:{maxWidth:'240px'}}); const out = el('div');
  const code = el('input', {class:'input mono', value:'', 'aria-label':'Short code', style:{maxWidth:'160px'}});
  function run(){ out.innerHTML = ''; try { const n = BigInt(inp.value.trim() || '0'); const c = toB62(n); code.value = c; out.append(el('div', {class:'verdict ok'}, `ID ${n.toLocaleString('en-IN')} → “${c}” (${c.length} chars). 62⁷ ≈ 3.5 trillion, so 7 characters cover trillions of links.`)); } catch(e){ out.append(el('div', {class:'verdict warn'}, 'Enter a whole number.')); } }
  inp.addEventListener('input', run); code.addEventListener('input', () => { try { inp.value = fromB62(code.value.trim()).toString(); out.innerHTML = ''; out.append(el('div', {class:'verdict ok'}, `“${code.value.trim()}” decodes back to ID ${inp.value}.`)); } catch(e){ out.innerHTML = ''; out.append(el('div', {class:'verdict warn'}, e.message)); } });
  host.append(el('div', {class:'ctl-grid'}, el('label', {class:'field'}, el('span', null, 'Numeric ID (from the range allocator)'), inp), el('label', {class:'field'}, el('span', null, 'Base62 short code'), code)), out);
  run();
}

/* ======================= 1. URL SHORTENER ======================= */
SDA.register({kind:'case', id:'url-shortener', tier:'starter', icon:'🔗', title:'URL shortener (TinyURL / Bitly-style)', tagline:'Billions of redirects, a few writes: the classic read-heavy warm-up.', tags:['base62', 'cache', 'redirect', 'id generation', 'analytics'],
  modules:['foundations', 'caching', 'databases', 'distributed', 'async'],
  summary:'Turn long URLs into short codes and redirect clicks in milliseconds, worldwide. The design is about generating unique short codes, serving a 100:1 read-heavy workload from caches and edges, and keeping click analytics off the hot path.',
  accuracy:'A simplified reference design. Company facts are labelled in the Sources tab; scale numbers are illustrative.',
  overview:{what:'Users paste a long URL and get <code>https://sho.rt/aZ3k9Qx</code>. Anyone clicking it is redirected to the original URL. Owners see click counts.', in:['Create short links (optional custom alias and expiry)', 'Redirect clicks with HTTP 301/302', 'Basic click analytics (count, country, day)', 'Disable/delete links'], out:['Full user-account system and billing', 'Link-in-bio pages, QR design tools', 'Deep fraud ML (we add a hook for scanning)']},
  challenges:['Extremely read-heavy (≈100 reads per write) with viral spikes on single links', 'Generating short, unique codes across many servers without collisions or coordination on every write', 'Redirect latency matters worldwide, since it sits before every page load', 'Counting clicks without slowing redirects or creating hot rows', 'Abuse: phishing and malware links'],
  fr:['<code>POST /v1/links</code> creates a short code for a long URL (custom alias optional, must be unique)', '<code>GET /{code}</code> redirects to the long URL (302 by default, 301 optional)', 'Links can expire or be disabled', 'Owners can read click stats'],
  nfr:['Redirect p99 < 50 ms from the user’s region (illustrative target)', '99.99% availability for redirects; creation can be slightly less', 'No two long URLs share a code (unless deliberately deduplicated); no mapping is ever lost', 'Analytics may lag by minutes (eventual consistency)', 'Codes should not be trivially enumerable'],
  scale:[
    {k:'New links', v:'≈ 40 writes/s', math:'100M links/month ÷ (30 × 86,400 s) ≈ 38.6/s', tag:'illustrative'},
    {k:'Redirects', v:'≈ 4K/s avg, ~20K/s peak', math:'100 reads per write × 40/s; peak ≈ 5× average', tag:'illustrative'},
    {k:'Storage (5 years)', v:'≈ 3 TB', math:'100M × 12 × 5 = 6B links × ~500 B/row', tag:'illustrative'},
    {k:'Code length', v:'7 base62 chars', math:'62^7 ≈ 3.5 × 10^12 ≫ 6 × 10^9 links', tag:'illustrative'},
    {k:'Cache for hot links', v:'≈ 10–20 GB', math:'top 20% of daily-clicked links (80/20) × ~500 B, with headroom', tag:'illustrative'}],
  arch:{w:880, h:330, nodes:[
    {id:'c', type:'client', label:'Browser', x:66, y:165, w:100},
    {id:'cdn', type:'cdn', label:'Edge / CDN', sub:'caches redirects', x:190, y:165, w:120, stage:3},
    {id:'lb', type:'lb', label:'Load balancer', x:335, y:165, w:120, stage:1},
    {id:'app', type:'service', label:'App servers', sub:'1 server', x:490, y:165, w:130},
    {id:'kgs', type:'service', label:'ID range allocator', sub:'hands out blocks', x:490, y:55, w:150, stage:2},
    {id:'cache', type:'cache', label:'Redis', sub:'code → URL', x:690, y:65, w:120, stage:1},
    {id:'db', type:'db', label:'Links DB', sub:'Postgres', x:690, y:170, w:120},
    {id:'q', type:'queue', label:'Click events', sub:'Kafka', x:490, y:275, w:130, stage:4},
    {id:'an', type:'db', label:'Analytics store', sub:'columnar', x:690, y:275, w:140, stage:4}],
   edges:[{from:'c', to:'app', gone:1}, {from:'c', to:'lb', stage:1, gone:3}, {from:'c', to:'cdn', stage:3}, {from:'cdn', to:'lb', stage:3}, {from:'lb', to:'app', stage:1}, {from:'app', to:'cache', stage:1}, {from:'app', to:'db'}, {from:'app', to:'kgs', stage:2}, {from:'app', to:'q', stage:4}, {from:'q', to:'an', stage:4}]},
  evolution:[
    {title:'One server + one database', scale:'1K links/day', fix:'<p>A single app server with Postgres. Codes come from the DB’s auto-increment ID encoded in base62. Simple, correct, cheap.</p>', after:{lat:30, err:.05, load:15}},
    {title:'A link goes viral', scale:'5M clicks/day', hot:['app', 'db'], breaks:'<p>A celebrity shares a link: 3,000 redirects/s hit one server and the database. CPU pegs, the DB connection pool is exhausted, redirects time out.</p>', fix:'<p>Put a <b>load balancer</b> in front of 3+ <b>stateless app servers</b>, and add <b>Redis</b> with cache-aside on <code>code → long_url</code>. Hot links are served from RAM; the DB sees only misses.</p>', sub:{app:'×4 stateless'}, before:{lat:2400, err:7, load:160}, after:{lat:22, err:.03, load:40}, flow:[['c', 'lb', 'GET /aZ3k'], ['lb', 'app'], ['app', 'cache', 'hit']], lesson:['cache-strategies', 'lb-algorithms']},
    {title:'Writes from many servers collide', scale:'100M links/month', hot:['db'], breaks:'<p>Random codes need “check, then insert” and retry on collision; with many servers they race. Using the single DB sequence makes every create wait on one hot counter.</p>', fix:'<p>An <b>ID range allocator</b> hands each app server a block (e.g. 10,000 IDs) at a time; servers base62-encode IDs locally. No collisions, no per-write coordination. A unique constraint stays as a safety net. To stop enumeration, the ID is shuffled (e.g. a reversible permutation) before encoding.</p>', before:{lat:140, err:.9, load:85}, after:{lat:20, err:.02, load:40}, flow:[['app', 'kgs', 'next block'], ['app', 'db', 'INSERT']], lesson:['unique-ids']},
    {title:'Users worldwide', scale:'Global users', hot:['lb'], breaks:'<p>Users in Europe and the US see 250+ ms before the redirect even starts, since every click crosses an ocean to one region.</p>', fix:'<p>Serve redirects from the <b>edge</b>: CDN/edge workers cache popular <code>code → URL</code> responses close to users (short TTL), with origin read replicas in more regions. 302 + short edge TTL keeps analytics accurate; 301 would let browsers skip you entirely.</p>', before:{lat:290, err:.1, load:60}, after:{lat:35, err:.02, load:25}, flow:[['c', 'cdn', 'edge hit']], lesson:['cdn', 'geodns-anycast']},
    {title:'Analytics melt the DB', scale:'10B clicks/month', hot:['db'], breaks:'<p>Doing <code>UPDATE links SET clicks = clicks + 1</code> on every redirect creates hot rows and lock contention; redirects slow down whenever a link trends.</p>', fix:'<p>Redirect first, then emit a <b>click event</b> to Kafka asynchronously. Stream processors aggregate per code/day/country into a <b>columnar analytics store</b>. Redirect latency is unaffected; stats lag by seconds to minutes.</p>', before:{lat:450, err:2.2, load:120}, after:{lat:30, err:.02, load:35}, flow:[['app', 'q', 'click'], ['q', 'an', 'aggregate']], lesson:['queues-pubsub-streams', 'batch-vs-stream']}],
  flows:[
    {name:'Click a short link', steps:[
      {note:'The browser requests <code>/aZ3k9Qx</code>. The nearest edge has no cached copy (miss).', flow:[['c', 'cdn', 'GET /aZ3k9Qx']]},
      {note:'The edge forwards to the origin load balancer, which picks a healthy app server.', flow:[['cdn', 'lb'], ['lb', 'app']]},
      {note:'Cache-aside: Redis miss, so read the DB once and populate Redis (TTL 24 h).', flow:[['app', 'cache', 'GET'], ['app', 'db', 'SELECT'], ['app', 'cache', 'SET']]},
      {note:'Respond <b>302 Location: long URL</b>. The edge caches it for 60 s, so the next clicks never reach the origin.', flow:[['app', 'lb', '302'], ['lb', 'cdn'], ['cdn', 'c', '302']]},
      {note:'After responding, the app emits a click event; analytics are updated asynchronously.', flow:[['app', 'q', 'click{code,country}'], ['q', 'an']]}]},
    {name:'Create a short link', steps:[
      {note:'<code>POST /v1/links</code> with the long URL arrives at an app server.', flow:[['c', 'cdn', 'POST'], ['cdn', 'lb'], ['lb', 'app']]},
      {note:'The server takes the next ID from its pre-fetched block (fetching a new block only every 10,000 links), shuffles and base62-encodes it.', flow:[['app', 'kgs', 'block (rare)']]},
      {note:'Insert <code>(code, long_url, …)</code> with a unique constraint and warm the cache, then return <code>201 {short_url}</code>.', flow:[['app', 'db', 'INSERT'], ['app', 'cache', 'SET'], ['app', 'lb', '201'], ['lb', 'cdn'], ['cdn', 'c']]}]}],
  breakIt:[
    {label:'Kill Redis', kill:['cache'], verdict:'degrades', text:'Redirects fall back to the DB (and edge caches still absorb hot links). Latency rises and DB load jumps, so the DB must be sized to survive a cold cache, ideally with request coalescing.', flow:[['app', 'db', 'cache miss']]},
    {label:'Kill an app server', kill:['app'], verdict:'survives', text:'Health checks remove it; the other stateless servers take the traffic. Its unused ID block is simply skipped, since gaps in IDs are harmless.', flow:[['lb', 'app', 'reroute']]},
    {label:'Primary DB down', kill:['db'], verdict:'degrades', text:'Hot links keep redirecting from edge caches and Redis; new links and cold links fail until a replica is promoted (≈ a minute with automated failover).', flow:[['c', 'cdn', 'edge hit']]},
    {label:'Kafka down', kill:['q'], verdict:'survives', text:'Redirects are unaffected. Click events are buffered locally or dropped with sampling, and analytics catch up later. Analytics must never block redirects.'},
    {label:'ID allocator down', kill:['kgs'], verdict:'survives', text:'Servers keep issuing from their current blocks (minutes of runway). Run 2+ allocator instances backed by the DB so a new block is always available.'}],
  dataModel:{lang:'sql', title:'links schema', code:`CREATE TABLE links (
  code         VARCHAR(10) PRIMARY KEY,          -- base62 of a shuffled 64-bit ID
  long_url     TEXT        NOT NULL,
  owner_id     BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ,
  disabled     BOOLEAN     NOT NULL DEFAULT false
);
CREATE INDEX links_owner ON links (owner_id, created_at DESC);

-- Analytics (columnar store, written by the stream aggregator)
-- clicks_daily(code, day, country, referrer_domain, clicks)`, notes:'One small row per link: 6B rows × ~500 B ≈ 3 TB fits a sharded or even single large Postgres. A key-value store (DynamoDB/Cassandra) also fits well, because access is almost always “get by code”.'},
  apis:[
    {m:'POST', path:'/v1/links', note:'Idempotency-Key header so client retries don’t create duplicates.', req:'{ "long_url": "https://www.example.in/sale?id=42", "custom_alias": null, "expires_at": "2026-12-31T00:00:00Z" }', res:'201 Created\n{ "code": "aZ3k9Qx", "short_url": "https://sho.rt/aZ3k9Qx" }'},
    {m:'GET', path:'/{code}', note:'302 by default (keeps analytics); 301 only if the owner opts in. 404 if unknown, 410 if expired/disabled.', res:'302 Found\nLocation: https://www.example.in/sale?id=42\nCache-Control: public, max-age=60'},
    {m:'GET', path:'/v1/links/{code}/stats?from=2026-11-01', res:'{ "code": "aZ3k9Qx", "total": 182344, "by_day": [{"day":"2026-11-01","clicks":9120}], "top_countries": ["IN","US","AE"] }'}],
  algorithm:{title:'Unique short codes', html:'<p><b>Options:</b> (1) random 7-char codes with a uniqueness check, (2) hash of the URL truncated (same URL → same code, but collisions need handling), (3) a counter (DB sequence or range allocator) encoded in base62. We use (3): each server leases a block of IDs, shuffles each ID with a reversible permutation (so codes aren’t sequential), and encodes it in base62. Try the encoder and the collision maths for random codes below.</p>', mount:host => { base62Demo(host); host.append(el('hr', {style:{border:'0', borderTop:'1px solid var(--border)', margin:'16px 0'}})); collisionCalc(host, {len:7, n:6e9}); }},
  tradeoffs:[['Counter blocks + base62', 'No collisions or retries; short codes; tiny coordination (one call per block)', 'Sequential IDs are guessable, so add a reversible shuffle; gaps when servers die'], ['302 redirects (default)', 'Every click reaches us, so analytics are accurate and links can be disabled', 'More traffic than 301, which browsers cache permanently'], ['Cache-aside Redis + edge caching', 'Absorbs the 100:1 read load and viral spikes', 'Staleness after disable/edit, so use short TTLs and purge on change'], ['Async click analytics', 'Redirect latency independent of analytics', 'Stats lag; events can be lost if buffers overflow']],
  alternatives:[['Random codes + check-and-insert', 'Retries grow as the space fills; needs a uniqueness check on every write'], ['MD5/SHA of the URL, first 7 chars', 'Collisions must still be handled; the same URL from different users gets the same code (sometimes desired, sometimes not)'], ['UUIDs as codes', 'Far too long for a “short” link'], ['NoSQL (DynamoDB/Cassandra) instead of Postgres', 'Also a great fit for get-by-key at scale; chosen if the team prefers managed horizontal scaling over SQL features']],
  failures:[['Redis cluster', 'Fall back to the DB with request coalescing; edge caches keep hot links alive'], ['Primary DB', 'Automated failover to a synchronous replica; redirects from cache continue'], ['A region', 'GeoDNS sends users to another region; replicated links table serves redirects'], ['Kafka/analytics', 'Redirects continue; events buffered/sampled; backfill later']],
  lab:{stack:['Node.js (Fastify) or Go', 'PostgreSQL', 'Redis', 'Nginx', 'Docker Compose', 'k6'], milestones:[
    {day:'Day 1: core', items:['POST /links and GET /{code} with Postgres', 'Base62 encode a DB sequence ID', 'Unique constraint + Idempotency-Key handling', 'Return 302 with Cache-Control']},
    {day:'Day 2: scale reads', items:['Redis cache-aside with TTL', 'Two app containers behind Nginx', 'Range allocator: lease 1,000 IDs per process', 'k6 test: 2,000 redirects/s, p99 < 50 ms locally']},
    {day:'Day 3: analytics & safety', items:['Emit click events to Redis Streams or Kafka', 'Consumer aggregates clicks per code per day', 'Rate-limit link creation per IP/user', 'Block known-bad domains with a deny list']}],
   pseudocode:{lang:'ts', code:`// Redirect handler: cache-aside, fire-and-forget analytics
app.get('/:code', async (req, reply) => {
  const code = req.params.code;
  let url = await redis.get('l:' + code);
  if (!url) {
    const row = await db.oneOrNone('SELECT long_url, disabled, expires_at FROM links WHERE code = $1', [code]);
    if (!row) return reply.code(404).send();
    if (row.disabled || (row.expires_at && row.expires_at < new Date())) return reply.code(410).send();
    url = row.long_url;
    await redis.set('l:' + code, url, 'EX', 86400);
  }
  reply.header('Cache-Control', 'public, max-age=60').redirect(302, url);
  events.publish('clicks', { code, ts: Date.now(), country: req.headers['cf-ipcountry'] }).catch(() => {}); // never block
});`},
   loadTest:'<p>Seed 1M links, then run a k6 scenario with Zipf-distributed codes (a few very hot): ramp to 2,000 req/s for 5 minutes. Watch p99 latency, Redis hit ratio (target > 95%) and DB CPU. Then flush Redis mid-test and confirm the DB survives the cold-cache stampede.</p>'},
  twists:[
    {q:'Traffic grows 100× overnight because of an IPL promotion. What changes?', a:'Most load is redirects, so lean on the edge: longer edge TTLs for hot codes, pre-warm the CDN for campaign links, scale stateless app servers horizontally, add Redis replicas/shards, and make sure the DB can survive a cold cache (request coalescing, read replicas). Creation (≈40 → 4,000/s) is still fine with range allocation; shard the links table by code hash if a single primary gets close to limits.'},
    {q:'How do you stop people using it for phishing?', a:'Check new URLs against threat-intelligence lists (e.g. Safe Browsing-style APIs) asynchronously and disable links that match; rate-limit creation per account/IP; show an interstitial for suspicious or newly created links; let users report links; make disabled links return 410 everywhere (purge edge caches).'},
    {q:'Can two users get the same short code for the same long URL?', a:'It’s a product decision. Deduplicating saves space but leaks “someone else shortened this” and mixes analytics. Most services give each user (or each request) its own code; optionally dedupe per owner with a unique index on (owner_id, hash(long_url)).'}],
  real:[
    {co:'Twitter/X t.co', tier:'confirmed', text:'Links posted on Twitter/X are wrapped with the t.co shortener, which lets the platform check links against malicious-site lists and count clicks.', src:'X Help Center — “About Twitter’s link service (t.co)”'},
    {co:'HTTP redirects', tier:'confirmed', text:'301 (Moved Permanently) may be cached by clients, while 302 (Found) is temporary. This is why shorteners that need click analytics typically use 302/307.', src:'IETF RFC 9110 (HTTP Semantics), §15.4'},
    {co:'Twitter Snowflake', tier:'confirmed', text:'Twitter open-sourced Snowflake (2010) to generate unique, roughly time-ordered 64-bit IDs without central coordination, an alternative to range allocation.', src:'Twitter Engineering blog, “Announcing Snowflake” (2010)'}],
  sources:['Xu, System Design Interview, ch. 8 “Design a URL Shortener” (2020)', 'IETF RFC 9110 — HTTP Semantics (redirect status codes)', 'Twitter Engineering — Announcing Snowflake (2010)', 'Flickr Engineering — “Ticket Servers: Distributed Unique Primary Keys on the Cheap” (2010)', 'Redis documentation — caching patterns']
});

/* ======================= 2. PASTEBIN ======================= */
SDA.register({kind:'case', id:'pastebin', tier:'starter', icon:'📋', title:'Pastebin (text & code sharing)', tagline:'Metadata in a database, blobs in object storage, expiry at scale.', tags:['object storage', 'expiry', 'TTL', 'CDN', 'abuse scanning'],
  modules:['databases', 'caching', 'traffic', 'async', 'security'],
  summary:'Store pasted text or code and serve it by a short key. The interesting parts are separating large blobs from metadata, deleting billions of expired pastes cheaply, serving viral pastes from a CDN, and scanning content for abuse and leaked secrets.',
  accuracy:'A simplified reference design. Numbers are illustrative; product facts are labelled in Sources.',
  overview:{what:'Users paste up to ~10 MB of text, choose syntax highlighting, visibility and expiry (10 minutes to never), and share <code>/p/Xy7Kp2Qa</code>.', in:['Create a paste (text, language, visibility, expiry)', 'View rendered and raw', 'Expire and delete automatically', 'Basic view counts'], out:['Real-time collaborative editing', 'Version history / diffs', 'Full-text search across all public pastes']},
  challenges:['Large blobs (KB to MB) don’t belong in the primary database', 'Expiry of billions of pastes without expensive full scans', 'Read-heavy with sudden viral pastes', 'Abuse: malware, doxxing, leaked API keys and passwords'],
  fr:['Create a paste → returns a unique 8-character key', 'Read paste (HTML view and raw)', 'Optional expiry; expired pastes are never served', 'Visibility: public, unlisted, private (owner only)'],
  nfr:['Read p99 < 100 ms for cached pastes', 'Durability: no accepted paste is lost before expiry', '99.9% availability', 'Content is immutable after creation (simplifies caching)'],
  scale:[
    {k:'New pastes', v:'≈ 120/s', math:'10M/day ÷ 86,400', tag:'illustrative'},
    {k:'Reads', v:'≈ 1.2K/s avg, 5K/s peak', math:'10 reads per paste', tag:'illustrative'},
    {k:'Content storage', v:'≈ 36 TB/year', math:'10M × 10 KB avg = 100 GB/day × 365', tag:'illustrative'},
    {k:'Metadata', v:'≈ 0.7 TB/year', math:'10M × ~200 B/day × 365', tag:'illustrative'},
    {k:'Key space', v:'62^8 ≈ 2 × 10^14', math:'8 base62 chars; ~3.6B pastes/year uses < 0.002%', tag:'illustrative'}],
  arch:{w:880, h:330, nodes:[
    {id:'c', type:'client', label:'Users', x:66, y:165, w:100},
    {id:'cdn', type:'cdn', label:'CDN', sub:'raw pastes', x:190, y:165, stage:2},
    {id:'lb', type:'lb', label:'Load balancer', x:330, y:165, w:120, stage:2},
    {id:'app', type:'service', label:'Paste service', sub:'1 server', x:480, y:165, w:130},
    {id:'cache', type:'cache', label:'Redis', sub:'metadata', x:480, y:55, w:110, stage:2},
    {id:'db', type:'db', label:'Metadata DB', sub:'Postgres', x:690, y:120, w:130},
    {id:'blob', type:'db', label:'Object storage', sub:'S3-style', x:690, y:230, w:140, stage:1},
    {id:'sweep', type:'service', label:'Expiry sweeper', x:815, y:175, w:110, stage:3},
    {id:'q', type:'queue', label:'Scan queue', x:480, y:275, w:132, stage:4},
    {id:'scan', type:'service', label:'Abuse / secret scanner', x:300, y:280, w:170, stage:4}],
   edges:[{from:'c', to:'app', gone:2}, {from:'c', to:'cdn', stage:2}, {from:'cdn', to:'lb', stage:2}, {from:'lb', to:'app', stage:2}, {from:'app', to:'cache', stage:2}, {from:'app', to:'db'}, {from:'app', to:'blob', stage:1}, {from:'sweep', to:'db', stage:3}, {from:'sweep', to:'blob', stage:3}, {from:'app', to:'q', stage:4}, {from:'q', to:'scan', stage:4}]},
  evolution:[
    {title:'One server, pastes in Postgres', scale:'5K pastes/day', fix:'<p>A single server stores each paste (text included) as a row in Postgres. Keys are random 8-char base62 strings with a unique constraint.</p>', after:{lat:40, err:.05, load:15}},
    {title:'Big pastes bloat the database', scale:'500K pastes/day', hot:['db'], breaks:'<p>Multi-MB log dumps make the table huge: backups take hours, replication lags, the buffer cache is full of rarely-read text, and queries on metadata slow down.</p>', fix:'<p>Store content in <b>object storage</b> (key = paste key) and keep only small <b>metadata</b> in Postgres (owner, size, language, visibility, expiry, object key). Object storage is cheap, durable and scales without effort.</p>', before:{lat:900, err:1.5, load:95}, after:{lat:60, err:.05, load:30}, flow:[['app', 'blob', 'PUT content'], ['app', 'db', 'INSERT meta']], lesson:['storage-types']},
    {title:'A paste goes viral', scale:'Viral spikes', hot:['app'], breaks:'<p>A paste linked from a popular forum gets 20K views a minute; the single server spends its time streaming the same bytes from object storage.</p>', fix:'<p>Content is immutable, so it is perfect for caching: <b>CDN</b> for raw/rendered content, <b>Redis</b> for metadata, and a <b>load balancer</b> with several stateless servers. Unlisted/private pastes use signed, short-lived URLs instead of public caching.</p>', sub:{app:'×3 stateless'}, before:{lat:1600, err:4, load:150}, after:{lat:35, err:.02, load:30}, flow:[['c', 'cdn', 'edge hit']], lesson:['cdn', 'cache-layers']},
    {title:'Expired pastes pile up', scale:'3B pastes stored', hot:['db'], breaks:'<p>Half of all pastes have expiries. A nightly <code>DELETE … WHERE expires_at < now()</code> scans huge ranges, locks the table and fights live traffic, while expired content keeps costing money.</p>', fix:'<p>Check expiry <b>on read</b> (never serve an expired paste), and run an <b>expiry sweeper</b> that deletes in small batches via an index on <code>expires_at</code> (or partitions the table by expiry day and drops whole partitions). Object-storage <b>lifecycle rules</b> delete blobs automatically.</p>', before:{lat:300, err:.4, load:110}, after:{lat:40, err:.02, load:35}, flow:[['sweep', 'db', 'DELETE batch'], ['sweep', 'blob', 'delete']], lesson:['indexes']},
    {title:'Abuse and leaked secrets', scale:'Public platform', hot:['app'], breaks:'<p>People paste stolen credentials, malware and personal data; cloud API keys pasted by mistake get exploited within minutes.</p>', fix:'<p>After saving, enqueue the paste for <b>asynchronous scanning</b>: secret patterns (cloud keys, tokens), malware signatures, personal data. Matching pastes are hidden or reported (e.g. to key providers for revocation). Add rate limits and size caps on creation.</p>', before:{lat:45, err:.1, load:40}, after:{lat:45, err:.05, load:38}, flow:[['app', 'q', 'scan job'], ['q', 'scan']], lesson:['owasp-top10', 'secrets-rotation']}],
  flows:[
    {name:'Create a paste', steps:[
      {note:'The client POSTs the content. The service validates size, generates a random 8-char key, and checks uniqueness via the DB constraint.', flow:[['c', 'cdn', 'POST'], ['cdn', 'lb'], ['lb', 'app']]},
      {note:'Content goes to object storage first, then the metadata row is inserted; if the insert fails, the orphan blob is removed by lifecycle cleanup.', flow:[['app', 'blob', 'PUT'], ['app', 'db', 'INSERT']]},
      {note:'Respond 201 with the URL; enqueue an asynchronous abuse/secret scan.', flow:[['app', 'lb', '201'], ['lb', 'cdn'], ['cdn', 'c'], ['app', 'q', 'scan']]}]},
    {name:'Read a paste', steps:[
      {note:'Public raw pastes are usually CDN hits.', flow:[['c', 'cdn', 'GET /raw/Xy7Kp2Qa']]},
      {note:'On a miss, the service reads metadata from Redis (or the DB) and checks expiry and visibility.', flow:[['cdn', 'lb'], ['lb', 'app'], ['app', 'cache', 'meta']]},
      {note:'It streams the content from object storage; the CDN caches it until expiry.', flow:[['app', 'blob', 'GET'], ['app', 'lb'], ['lb', 'cdn'], ['cdn', 'c', '200']]}]}],
  breakIt:[
    {label:'Object storage slow in one zone', hot:['blob'], verdict:'survives', text:'Object storage is replicated across zones by the provider; reads retry. CDN-cached pastes are unaffected.'},
    {label:'Metadata DB primary down', kill:['db'], verdict:'degrades', text:'Cached pastes still serve from the CDN and Redis; new pastes fail until failover. Reads of uncached pastes fail briefly.', flow:[['c', 'cdn', 'edge hit']]},
    {label:'Scanner backlog', kill:['scan'], verdict:'survives', text:'Paste creation continues; scans queue up. Pastes remain visible until scanned (a risk window to monitor).'},
    {label:'Kill a paste server', kill:['app'], verdict:'survives', text:'The load balancer routes around it; servers are stateless.', flow:[['lb', 'app', 'reroute']]}],
  dataModel:{lang:'sql', title:'paste metadata', code:`CREATE TABLE pastes (
  key          CHAR(8)     PRIMARY KEY,           -- random base62
  owner_id     BIGINT,
  object_key   TEXT        NOT NULL,              -- e.g. pastes/Xy/Xy7Kp2Qa
  size_bytes   INT         NOT NULL CHECK (size_bytes <= 10485760),
  language     VARCHAR(32),
  visibility   VARCHAR(10) NOT NULL DEFAULT 'public',  -- public | unlisted | private
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ,
  scan_status  VARCHAR(12) NOT NULL DEFAULT 'pending'
);
CREATE INDEX pastes_expiry ON pastes (expires_at) WHERE expires_at IS NOT NULL;`, notes:'Content lives in object storage under <code>object_key</code>. For very large volumes, partition <code>pastes</code> by expiry day so cleanup is a cheap DROP PARTITION.'},
  apis:[
    {m:'POST', path:'/v1/pastes', req:'{ "content": "SELECT * FROM …", "language": "sql", "visibility": "unlisted", "expires_in": "1d" }', res:'201 Created\n{ "key": "Xy7Kp2Qa", "url": "https://paste.example/p/Xy7Kp2Qa", "expires_at": "2026-11-14T10:00:00Z" }'},
    {m:'GET', path:'/raw/{key}', note:'410 Gone if expired; 404 if unknown or not visible to the caller.', res:'200 OK\nContent-Type: text/plain; charset=utf-8\nCache-Control: public, max-age=3600'},
    {m:'DELETE', path:'/v1/pastes/{key}', note:'Owner only; purges CDN and cache.', res:'204 No Content'}],
  algorithm:{title:'Random keys and expiry', html:'<p><b>Keys:</b> random 8-character base62 keys are not enumerable (good for unlisted pastes). With a unique constraint, a rare collision just retries. Use the calculator to see how rare.</p><p><b>Expiry:</b> combine (1) a check on every read, (2) batched deletes via an <code>expires_at</code> index or daily partitions, and (3) object-storage lifecycle rules. Never do a single giant DELETE.</p>', mount:host => collisionCalc(host, {len:8, n:3.6e9})},
  tradeoffs:[['Metadata in SQL, content in object storage', 'Small, fast DB; cheap, durable, unlimited blob storage', 'Two writes per create (handle orphans); extra hop on cache misses'], ['Random keys (not counters)', 'Unlisted pastes can’t be enumerated', 'Must handle (rare) collisions with retries'], ['CDN caching of immutable content', 'Viral pastes cost almost nothing', 'Deleting needs CDN purges; private pastes need signed URLs'], ['Async scanning', 'Creation stays fast', 'Short window where bad content is visible']],
  alternatives:[['Store content in the DB as TEXT/BLOB', 'Fine at small scale; painful backups, replication and cost at large scale'], ['A wide-column store for everything', 'Works, but object storage is far cheaper for large immutable blobs'], ['Synchronous scanning before publishing', 'Higher creation latency; acceptable for high-risk categories only']],
  failures:[['Object storage regional issue', 'Serve from CDN; cross-region replication for critical data'], ['Metadata DB', 'Replica promotion; read-only mode for cached content'], ['CDN', 'Origin must handle a burst, so autoscale and rate-limit'], ['Sweeper stops', 'Read-time expiry check keeps correctness; storage cost rises until it resumes']],
  lab:{stack:['Node.js or Python (FastAPI)', 'PostgreSQL', 'MinIO (S3-compatible)', 'Redis', 'Nginx', 'Docker Compose'], milestones:[
    {day:'Day 1: core', items:['Create/read API with metadata in Postgres', 'Content in MinIO (S3 API)', 'Random 8-char keys with unique constraint + retry', 'Read-time expiry check (410)']},
    {day:'Day 2: performance', items:['Redis for metadata', 'Nginx caching for raw content', 'Batch expiry sweeper using the expires_at index', 'MinIO lifecycle rule for expired objects']},
    {day:'Day 3: safety', items:['Queue + worker scanning for secret patterns (regex for common key formats)', 'Rate limit creation per IP', 'Size limit (10 MB) enforced at Nginx and app', 'Metrics: creates/s, read hit ratio, sweeper lag']}],
   pseudocode:{lang:'ts', code:`async function createPaste(body, user) {
  if (Buffer.byteLength(body.content) > 10 * 1024 * 1024) throw httpError(413);
  for (let attempt = 0; attempt < 3; attempt++) {
    const key = randomBase62(8);
    const objectKey = \`pastes/\${key.slice(0, 2)}/\${key}\`;
    await s3.putObject({ Bucket: 'pastes', Key: objectKey, Body: body.content });
    try {
      await db.none('INSERT INTO pastes(key, owner_id, object_key, size_bytes, language, visibility, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [key, user?.id, objectKey, Buffer.byteLength(body.content), body.language, body.visibility, expiryFrom(body.expires_in)]);
      await queue.add('scan', { key, objectKey });
      return { key };
    } catch (e) { if (!isUniqueViolation(e)) throw e; }   // collision: try a new key (blob cleaned up by lifecycle)
  }
  throw httpError(503);
}`},
   loadTest:'<p>Create 1M pastes with a mix of sizes (90% < 10 KB, a few 5 MB), then read with a Zipf distribution. Measure p99 for cache hits vs misses, sweeper throughput (rows/s) while reads continue, and confirm expired pastes return 410.</p>'},
  twists:[
    {q:'How do you support private pastes on a CDN?', a:'Don’t cache them publicly. Serve through the app after an auth check, or issue short-lived signed URLs (object storage presigned URLs or CDN signed cookies) per viewer, with Cache-Control: private.'},
    {q:'Storage costs explode. How do you cut them?', a:'Compress content (text compresses 3–10×), dedupe identical content by content hash, move old pastes to cheaper storage tiers via lifecycle rules, enforce default expiries for anonymous pastes, and cap sizes.'},
    {q:'What if a region fails?', a:'Replicate metadata to another region (async) and enable cross-region object replication; route reads via GeoDNS. Creation can fail over with some RPO for the most recent pastes. State it explicitly.'}],
  real:[
    {co:'Amazon S3', tier:'confirmed', text:'S3 is designed for 99.999999999% (11 nines) durability by storing objects redundantly across multiple Availability Zones, and supports lifecycle rules to expire or transition objects automatically.', src:'Amazon S3 documentation — durability and lifecycle configuration'},
    {co:'GitHub secret scanning', tier:'confirmed', text:'GitHub scans public content for known credential formats and notifies partner providers so leaked tokens can be revoked: the same idea as scanning pastes.', src:'GitHub documentation — secret scanning'},
    {co:'Pastebin-style services', tier:'educational', text:'Text-sharing sites typically separate metadata from content and use expiries and abuse reporting; the exact internals of specific services are not public.', src:'Simplified educational design'}],
  sources:['Amazon S3 documentation (durability, lifecycle rules, presigned URLs)', 'PostgreSQL documentation — partial indexes, table partitioning', 'GitHub secret scanning documentation', 'Martin, The System Design Primer — Pastebin exercise']
});

/* ======================= 3. RATE LIMITER ======================= */
SDA.register({kind:'case', id:'rate-limiter', tier:'starter', icon:'🚦', title:'Distributed rate limiter', tagline:'One quota, many gateway servers, under 2 ms of overhead.', tags:['token bucket', 'Redis', 'Lua', '429', 'gateway'],
  modules:['traffic', 'caching', 'reliability', 'networking'],
  summary:'Enforce limits such as “100 requests per minute per API key” across dozens of gateway servers, accurately enough, fast enough, and without becoming the thing that takes the API down.',
  accuracy:'A reference design combining publicly described approaches (Stripe, Cloudflare, Envoy). Numbers are illustrative.',
  overview:{what:'Every API request passes through gateways that check per-key, per-user and per-IP limits and return <code>429 Too Many Requests</code> with headers when exceeded.', in:['Rules by API key, user, IP and endpoint', 'Token-bucket limits with burst', 'Rate-limit headers and Retry-After', 'Live rule updates'], out:['Billing/quotas over months', 'Bot detection ML', 'DDoS scrubbing at the network layer (handled upstream)']},
  challenges:['Counts must be shared across many gateway servers', 'Overhead must be tiny (it sits on every request)', 'Race conditions between concurrent requests', 'The limiter must not become a single point of failure', 'Hot keys (one big customer) and multi-region traffic'],
  fr:['Check and consume quota for a key in one atomic step', 'Support multiple rules per request (per-second burst + per-minute)', 'Return RateLimit headers and Retry-After on 429', 'Update rules without redeploying gateways'],
  nfr:['Added p99 latency < 2 ms', '99.99% availability: if the limiter fails, the API must keep working (fail open by default)', 'Accuracy within a few percent across servers', 'Scale to ~1M checks/s'],
  scale:[
    {k:'Checks', v:'≈ 1M/s peak', math:'every API request × 1–3 rules', tag:'illustrative'},
    {k:'Active keys', v:'≈ 50M', math:'API keys + users + IPs seen in the last hour', tag:'illustrative'},
    {k:'State in Redis', v:'≈ 3–5 GB', math:'50M keys × (tokens + timestamp ≈ 50–100 B incl. overhead)', tag:'illustrative'},
    {k:'Redis ops', v:'≈ 1M/s → 10+ shards', math:'~100K ops/s per Redis shard (illustrative) ⇒ ≥ 10 shards with headroom', tag:'illustrative'}],
  arch:{w:880, h:330, nodes:[
    {id:'c', type:'client', label:'API clients', x:70, y:165, w:110},
    {id:'lb', type:'lb', label:'Load balancer', x:200, y:165, w:120, stage:1},
    {id:'gw', type:'service', label:'API gateways', sub:'in-memory counters', x:370, y:165, w:150},
    {id:'redis', type:'cache', label:'Redis', sub:'shared counters', x:600, y:75, w:140, stage:1},
    {id:'api', type:'service', label:'Backend APIs', x:600, y:255, w:130},
    {id:'cfg', type:'db', label:'Rules service', sub:'config + push', x:370, y:45, w:130, stage:4},
    {id:'obs', type:'queue', label:'Limit events', sub:'→ alerts', x:790, y:165, w:140, stage:4}],
   edges:[{from:'c', to:'gw', gone:1}, {from:'c', to:'lb', stage:1}, {from:'lb', to:'gw', stage:1}, {from:'gw', to:'redis', stage:1}, {from:'gw', to:'api'}, {from:'cfg', to:'gw', stage:4}, {from:'redis', to:'obs', stage:4}]},
  evolution:[
    {title:'In-memory counter in one server', scale:'1 gateway', fix:'<p>A single gateway keeps a token bucket per key in memory. Perfectly accurate and sub-microsecond, but only while there is one server.</p>', after:{lat:2, err:.01, load:20}},
    {title:'Scale out: limits multiply', scale:'10 gateways', hot:['api'], breaks:'<p>With 10 gateways behind a load balancer, each keeps its own counter, so a customer limited to 100/min actually gets ~1,000/min. Backends get overloaded by “limited” clients.</p>', fix:'<p>Move counters to a <b>shared Redis</b>. Every gateway checks the same key (<code>rl:{apiKey}:{rule}</code>).</p>', sub:{gw:'×10, stateless'}, before:{lat:60, err:3, load:140}, after:{lat:3, err:.05, load:60}, flow:[['gw', 'redis', 'check']], lesson:['rate-limiting']},
    {title:'Races and boundary bursts', scale:'Concurrent requests', hot:['redis'], breaks:'<p>“GET count; if < limit then INCR” from two gateways at once lets both through, and fixed windows allow 2× the limit around minute boundaries. Customers notice the inconsistency.</p>', fix:'<p>Make check-and-consume <b>atomic</b> with a Redis <b>Lua script</b> implementing a token bucket (or a sliding-window counter). One round trip, no races, smooth limits.</p>', sub:{redis:'Lua token bucket'}, before:{lat:4, err:.3, load:70}, after:{lat:2, err:.02, load:55}, flow:[['gw', 'redis', 'EVALSHA']], lesson:['rate-limiting']},
    {title:'Redis becomes the bottleneck', scale:'1M checks/s', hot:['redis'], breaks:'<p>One Redis node maxes out on operations and is a single point of failure: when it hiccups, every request waits or errors.</p>', fix:'<p><b>Redis Cluster</b> sharded by key with replicas; short client timeouts (~5 ms). On Redis errors the gateway <b>fails open</b> to a conservative local limit, so the API stays up. Optionally batch: keep a small local allowance per key and sync to Redis every few hundred ms.</p>', sub:{redis:'12 shards + replicas'}, before:{lat:40, err:2.5, load:120}, after:{lat:1.6, err:.02, load:45}, lesson:['redis-vs-memcached', 'circuit-breaker']},
    {title:'Rules change daily, ops needs visibility', scale:'Many products', breaks:'<p>Every limit change needs a deploy; nobody can see which customers are being throttled until they complain.</p>', fix:'<p>A <b>rules service</b> stores limits (per plan, key, endpoint) and pushes them to gateways (watched config, cached locally). Throttle decisions emit <b>events/metrics</b> for dashboards and alerts.</p>', before:{lat:2, err:.1, load:45}, after:{lat:1.6, err:.02, load:45}, flow:[['cfg', 'gw', 'rules v42'], ['redis', 'obs', 'events']], lesson:['config-feature-flags']}],
  flows:[
    {name:'Allowed request', steps:[
      {note:'A request with <code>API-Key: sk_…</code> reaches a gateway via the load balancer.', flow:[['c', 'lb'], ['lb', 'gw']]},
      {note:'The gateway runs the Lua token-bucket script on the key’s shard: refill by elapsed time, take one token, return remaining. One round trip, ~0.5 ms.', flow:[['gw', 'redis', 'EVALSHA'], ['redis', 'gw', 'allowed, 37 left']]},
      {note:'The request proceeds to the backend; the response carries <code>RateLimit-Limit</code>, <code>RateLimit-Remaining</code>, <code>RateLimit-Reset</code>.', flow:[['gw', 'api'], ['api', 'gw'], ['gw', 'lb'], ['lb', 'c', '200']]}]},
    {name:'Rejected request', steps:[
      {note:'The client bursts beyond its quota.', flow:[['c', 'lb', 'burst'], ['lb', 'gw']]},
      {note:'The script finds no tokens and returns the wait until the next token.', flow:[['gw', 'redis', 'EVALSHA'], ['redis', 'gw', 'denied, retry 300 ms']]},
      {note:'The gateway returns <b>429</b> with <code>Retry-After</code>, without touching the backend. Clients should back off with jitter.', flow:[['gw', 'lb', '429'], ['lb', 'c']]}]}],
  breakIt:[
    {label:'Redis shard down', kill:['redis'], verdict:'degrades', text:'Gateways time out fast (5 ms) and fail open to per-gateway local limits (limit ÷ number of gateways). Accuracy drops but the API stays up; replicas are promoted in seconds.'},
    {label:'Rules service down', kill:['cfg'], verdict:'survives', text:'Gateways keep enforcing the last known rules from their local cache; only rule changes are delayed.'},
    {label:'A customer floods the API', hot:['gw'], verdict:'survives', text:'Their key runs out of tokens, so they get 429s while everyone else is unaffected. That is the limiter doing its job.', flow:[['c', 'lb', 'flood'], ['lb', 'gw'], ['gw', 'lb', '429']]},
    {label:'Kill a gateway', kill:['gw'], verdict:'survives', text:'Stateless gateways: the load balancer routes around it. Counters live in Redis, so nothing is lost.'}],
  dataModel:{lang:'lua', title:'token bucket (Redis Lua)', code:`-- KEYS[1] = "rl:{apiKey}:{rule}"  ARGV: rate/s, capacity, now_ms, cost
local rate, cap, now, cost = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4])
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(b[1]) or cap
local ts     = tonumber(b[2]) or now
tokens = math.min(cap, tokens + (now - ts) / 1000 * rate)         -- refill
local allowed = tokens >= cost
if allowed then tokens = tokens - cost end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(cap / rate * 1000) * 2)  -- idle keys disappear
local retry = allowed and 0 or math.ceil((cost - tokens) / rate * 1000)
return { allowed and 1 or 0, math.floor(tokens), retry }`, notes:'Rules live in the rules service, e.g. <code>{ key: "api_key", endpoint: "/v1/charges", rate: 25, burst: 50 }</code>. Use the client’s timestamp carefully: passing the gateway’s clock is fine if clocks are NTP-synced; alternatively use Redis <code>TIME</code>.'},
  apis:[
    {m:'GW', path:'check(key, rule, cost) → {allowed, remaining, retryAfterMs}', note:'Internal call inside the gateway middleware, with a 5 ms timeout and fail-open fallback.'},
    {m:'HTTP', path:'429 Too Many Requests', res:'HTTP/1.1 429 Too Many Requests\nRetry-After: 1\nRateLimit-Limit: 100\nRateLimit-Remaining: 0\nRateLimit-Reset: 1\n\n{ "error": "rate_limited", "retry_after_ms": 300 }'},
    {m:'PUT', path:'/admin/v1/rules/{id}', req:'{ "match": { "plan": "free", "endpoint": "/v1/*" }, "rate_per_sec": 2, "burst": 20 }', res:'200 OK { "version": 42 }'}],
  algorithm:{title:'Token bucket vs windows', html:'<p>Token bucket allows controlled bursts and a steady rate with two numbers of state per key. Sliding-window counters avoid fixed-window boundary bursts with two counters. Compare all four algorithms live in the playground, and build two of them in the labs.</p>', pg:'rate-limiter', lab:['token-bucket', 'sliding-window']},
  tradeoffs:[['Central Redis counters', 'Accurate global limits', 'A network hop per check; Redis must be highly available'], ['Atomic Lua script', 'No races, one round trip', 'Scripts must be fast and deterministic; cluster keys must hash to one slot'], ['Fail open on limiter errors', 'Limiter outages don’t become API outages', 'Temporary over-admission; protect backends with load shedding too'], ['Local allowance + periodic sync', 'Lower latency and Redis load', 'Small overshoot of limits between syncs']],
  alternatives:[['Purely local limits (limit ÷ N per gateway)', 'No shared state, but inaccurate when traffic is uneven across gateways'], ['Sticky routing by key to one limiter node', 'Accurate without Redis but needs consistent hashing and rebalancing'], ['Managed: API gateway / Envoy global rate-limit service', 'Less code; less flexibility on algorithms and rules']],
  failures:[['Redis shard', 'Fail open with local limits; replica promotion'], ['Clock skew between gateways', 'Use Redis TIME or tolerate small drift; never let refill go negative'], ['Hot key (huge customer)', 'Local pre-allowance for that key, or split limits per region'], ['Rules push broken', 'Validate config; canary to a few gateways; roll back to the previous version']],
  lab:{stack:['Node.js or Go gateway', 'Redis (Cluster mode optional)', 'Nginx', 'Docker Compose', 'k6 or vegeta'], milestones:[
    {day:'Day 1', items:['In-memory token bucket middleware', 'Redis Lua script with EVALSHA', 'Return RateLimit headers + Retry-After', 'Unit tests for refill and burst']},
    {day:'Day 2', items:['Three gateway replicas sharing Redis', 'Fail-open fallback with a 5 ms timeout', 'Per-plan rules loaded from a config file and hot-reloaded', 'Prometheus metrics: allowed/denied per rule']},
    {day:'Day 3', items:['Load test 20K req/s; measure added p99', 'Kill Redis during the test and confirm fail-open', 'Compare token bucket vs sliding-window accuracy', 'Grafana dashboard of throttled keys']}],
   pseudocode:{lang:'ts', code:`async function rateLimit(req, reply) {
  const rule = rules.match(req);                         // e.g. { rate: 25, burst: 50 }
  const key = \`rl:{\${req.apiKey}}:\${rule.id}\`;           // {…} keeps the key in one cluster slot
  let res;
  try {
    res = await withTimeout(redis.evalsha(SCRIPT_SHA, 1, key, rule.rate, rule.burst, Date.now(), 1), 5);
  } catch {
    res = localFallback.take(key, rule.rate / gatewayCount, rule.burst / gatewayCount);  // fail open, conservatively
  }
  const [allowed, remaining, retryMs] = res;
  reply.header('RateLimit-Limit', rule.burst).header('RateLimit-Remaining', remaining);
  if (!allowed) return reply.code(429).header('Retry-After', Math.ceil(retryMs / 1000)).send({ error: 'rate_limited', retry_after_ms: retryMs });
}`},
   loadTest:'<p>Run 3 gateways and drive 1,000 keys at varying rates. Verify the total allowed rate per key stays within ~5% of its limit across gateways, measure added p99 (target < 2 ms), then stop Redis and check that p99 stays low and requests are still served (fail-open).</p>'},
  twists:[
    {q:'Your API is multi-region. Is a customer’s limit global or per region?', a:'Usually per region (simple, fast) with the global limit split by expected traffic share, plus asynchronous reconciliation for billing-grade quotas. A truly global limit needs cross-region coordination on every request, which costs latency and availability.'},
    {q:'Rate limiting vs load shedding: what’s the difference?', a:'Rate limiting enforces fairness per client (contracts and quotas). Load shedding protects the service when total load exceeds capacity, regardless of who sends it. Stripe, for example, describes using both: request-rate and concurrency limiters plus fleet-wide load shedders that drop lower-priority traffic first.'},
    {q:'How would you rate-limit by cost, e.g. expensive search queries?', a:'Assign each endpoint (or query) a token cost (e.g. 1 for reads, 10 for exports) and consume <i>cost</i> tokens; or use a separate concurrency limiter for expensive operations.'}],
  real:[
    {co:'Stripe', tier:'confirmed', text:'Stripe described running four kinds of limiters (request rate, concurrent requests, fleet-usage load shedder and worker-utilisation load shedder), implemented with token buckets in Redis.', src:'Stripe Engineering, “Scaling your API with rate limiters” (2017)'},
    {co:'Cloudflare', tier:'confirmed', text:'Cloudflare explained its sliding-window counter approach, which approximates a sliding log using the previous and current window counts, enabling rate limiting across a huge number of domains.', src:'Cloudflare blog, “How we built rate limiting capable of scaling to millions of domains” (2017)'},
    {co:'GitHub API', tier:'confirmed', text:'GitHub’s REST API documents a primary limit of 5,000 requests per hour for authenticated users and returns x-ratelimit-* headers.', src:'GitHub REST API documentation — Rate limits'}],
  sources:['Stripe Engineering (2017)', 'Cloudflare blog (2017)', 'Envoy / Lyft ratelimit service documentation', 'IETF draft “RateLimit header fields for HTTP”', 'Redis documentation — EVAL/EVALSHA and Lua scripting']
});

/* ======================= 4. UNIQUE ID GENERATOR ======================= */
SDA.register({kind:'case', id:'unique-id', tier:'starter', icon:'🆔', title:'Unique ID generator (Snowflake-style)', tagline:'64-bit, time-ordered, unique IDs with no central bottleneck.', tags:['Snowflake', 'ticket server', 'clock', 'ZooKeeper', 'UUIDv7'],
  modules:['distributed', 'databases'],
  summary:'Generate unique, roughly time-ordered 64-bit IDs for orders, posts and messages across hundreds of servers, fast, without collisions, and safely when clocks misbehave.',
  accuracy:'Based on publicly described designs (Flickr ticket servers, Twitter Snowflake, Instagram). Numbers are illustrative.',
  overview:{what:'Every service that creates records needs IDs that are unique across the whole company, fit in a 64-bit integer column, and sort roughly by creation time.', in:['nextId() in-process or via a service', 'Uniqueness across datacentres', 'Rough time ordering', 'Decoding for debugging'], out:['Human-friendly codes (see the URL shortener)', 'Strictly gap-free sequences (invoices need a different design)']},
  challenges:['Uniqueness without a coordination round trip per ID', 'Fit in 64 bits (for DB indexes and APIs)', 'Time ordering for feeds and pagination', 'Clocks can drift or jump backwards', 'Assigning machine IDs safely as servers come and go'],
  fr:['Return a unique 64-bit ID', 'IDs roughly increase with time (k-sorted)', 'Support ≥ 10K IDs/s per node', 'Decode timestamp, worker and sequence'],
  nfr:['Zero duplicates, ever', 'Sub-millisecond latency (ideally in-process)', 'No single point of failure', 'Lifetime of decades'],
  scale:[
    {k:'Peak ID demand', v:'≈ 100K IDs/s', math:'all writes across services (illustrative)', tag:'illustrative'},
    {k:'Per-node capacity', v:'4,096 IDs/ms', math:'12-bit sequence ⇒ 2^12 per millisecond per worker', tag:'illustrative'},
    {k:'Workers', v:'1,024', math:'10-bit worker ID (e.g. 5 datacentre + 5 machine bits)', tag:'illustrative'},
    {k:'Lifetime', v:'≈ 69 years', math:'2^41 ms ÷ (1000 × 86,400 × 365.25)', tag:'illustrative'}],
  arch:{w:860, h:320, nodes:[
    {id:'svc', type:'service', label:'Order service', sub:'needs IDs', x:110, y:160, w:140},
    {id:'db', type:'db', label:'Orders DB', sub:'AUTO_INCREMENT', x:380, y:250, w:140},
    {id:'t1', type:'db', label:'Ticket server A', sub:'odd IDs', x:380, y:70, w:140, stage:1, gone:2},
    {id:'t2', type:'db', label:'Ticket server B', sub:'even IDs', x:600, y:70, w:140, stage:1, gone:2},
    {id:'snow', type:'service', label:'Snowflake (in-process)', sub:'time|worker|seq', x:380, y:160, w:170, stage:2},
    {id:'zk', type:'ext', label:'Coordinator', sub:'ZooKeeper/etcd lease', x:640, y:160, w:160, stage:3},
    {id:'ntp', type:'ext', label:'Time sync', sub:'NTP / chrony', x:640, y:255, w:130, stage:4}],
   edges:[{from:'svc', to:'db'}, {from:'svc', to:'t1', stage:1, gone:2}, {from:'svc', to:'t2', stage:1, gone:2}, {from:'svc', to:'snow', stage:2}, {from:'snow', to:'zk', stage:3}, {from:'snow', to:'ntp', stage:4}]},
  evolution:[
    {title:'Database auto-increment', scale:'One database', fix:'<p>The DB assigns <code>BIGINT AUTO_INCREMENT</code> IDs. Unique, ordered and simple, while there is one database.</p>', after:{lat:2, err:0, load:20}},
    {title:'Sharding breaks auto-increment', scale:'8 DB shards', hot:['db'], breaks:'<p>After sharding, each shard’s counter produces the same IDs (1, 2, 3…) so IDs collide across shards; a single global counter DB becomes a bottleneck and a SPOF.</p>', fix:'<p><b>Ticket servers</b> (Flickr-style): two dedicated MySQL servers using <code>REPLACE INTO</code> with auto-increment offset/step (one hands out odd, the other even IDs). Services fetch IDs (or blocks of IDs) from them.</p>', before:{lat:25, err:1.5, load:110}, after:{lat:3, err:.01, load:50}, flow:[['svc', 't1', 'next id'], ['svc', 'db', 'INSERT']], lesson:['unique-ids', 'sharding']},
    {title:'Network hop per ID, no time order', scale:'100K IDs/s', hot:['t1', 't2'], breaks:'<p>Every ID needs a network call to a ticket server; at peak they queue up, and IDs from A and B don’t sort by time, so feeds and cursors need a second column.</p>', fix:'<p><b>Snowflake</b>: generate IDs <b>in-process</b> from <code>41 bits ms timestamp | 10 bits worker | 12 bits sequence</code>. No network call, 4,096 IDs per ms per worker, roughly time-sorted.</p>', sub:{svc:'×200 instances'}, before:{lat:45, err:.8, load:130}, after:{lat:.01, err:0, load:10}, flow:[['svc', 'snow', 'nextId()']], lesson:['unique-ids']},
    {title:'Who gets which worker ID?', scale:'Autoscaling fleet', hot:['snow'], breaks:'<p>Containers come and go; two instances accidentally configured with the same worker ID generate <b>duplicate IDs</b> in the same millisecond.</p>', fix:'<p>Each instance <b>leases</b> a worker ID from a coordinator (ZooKeeper ephemeral node / etcd lease) at start-up and stops generating if the lease is lost. IDs are released when instances die.</p>', before:{lat:.01, err:.2, load:10}, after:{lat:.01, err:0, load:10}, flow:[['snow', 'zk', 'lease worker 42']], lesson:['distributed-locks']},
    {title:'The clock jumps backwards', scale:'Real-world clocks', down:['snow'], breaks:'<p>An NTP correction moves a server’s clock back 300 ms. The generator re-issues timestamps it already used, so duplicates are possible.</p>', fix:'<p>Remember the last timestamp; if the clock goes backwards, <b>wait</b> (small skew) or <b>refuse and alert</b> (large skew). Configure time sync to <b>slew</b> (adjust gradually) rather than step, and monitor clock offset.</p>', before:{lat:.01, err:.05, load:10}, after:{lat:.01, err:0, load:10}, flow:[['snow', 'ntp', 'slew']], lesson:['clocks']}],
  flows:[
    {name:'Service starts and creates orders', steps:[
      {note:'On start-up the instance leases a free worker ID from the coordinator (an ephemeral node that disappears if the instance dies).', flow:[['svc', 'snow', 'init'], ['snow', 'zk', 'lease']]},
      {note:'Each order gets an ID locally: current ms since epoch, the worker ID, and a per-ms sequence. No network call.', flow:[['svc', 'snow', 'nextId()'], ['snow', 'svc', '1863…']]},
      {note:'The order is inserted with that ID; because IDs grow with time, the primary-key index stays append-friendly.', flow:[['svc', 'db', 'INSERT id=1863…']]}]}],
  breakIt:[
    {label:'Coordinator down', kill:['zk'], verdict:'survives', text:'Running instances keep their leased worker IDs and continue generating. New instances can’t start generating until it recovers, so autoscaling pauses.'},
    {label:'Clock steps back 2 s', hot:['snow'], verdict:'degrades', text:'The generator refuses to issue IDs (and alerts) until its clock passes the last used timestamp. Requests on that instance fail or are routed elsewhere, rather than risking duplicates.'},
    {label:'Kill an instance', kill:['svc'], verdict:'survives', text:'Its lease expires and the worker ID becomes reusable after a safe delay; other instances are unaffected.'},
    {label:'Orders DB shard down', kill:['db'], verdict:'degrades', text:'ID generation doesn’t depend on the DB at all; only inserts to that shard fail.'}],
  dataModel:{lang:'text', title:'64-bit layout', code:`  0 | 41 bits: milliseconds since custom epoch | 10 bits: worker | 12 bits: sequence
  ^ sign bit unused, so IDs stay positive in signed BIGINT columns

  id = (ms - EPOCH) << 22 | worker << 12 | seq

CREATE TABLE orders (
  id          BIGINT PRIMARY KEY,      -- Snowflake ID: unique and time-ordered
  customer_id BIGINT NOT NULL,
  total_paise BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL     -- also recoverable from the ID
);`, notes:'Send IDs to JavaScript clients as strings: JSON numbers lose precision above 2^53.'},
  apis:[
    {m:'LIB', path:'idgen.nextId(): bigint', note:'In-process library call: no network, about a microsecond.'},
    {m:'GET', path:'/v1/ids?count=100', note:'Optional HTTP service for clients that can’t embed the library.', res:'{ "ids": ["186327438912659456", "186327438912659457"] }'},
    {m:'LIB', path:'idgen.decode(id)', res:'{ "timestamp": "2026-11-13T09:31:02.114Z", "worker": 42, "sequence": 3 }'}],
  algorithm:{title:'Snowflake bits', html:'<p>Watch the bits compose in the playground, then implement it, with sequence overflow and clock-rollback handling, in the code lab.</p>', pg:'snowflake', lab:'snowflake-id'},
  tradeoffs:[['In-process Snowflake', 'No network hop, huge throughput, time-ordered', 'Depends on clocks and correct worker-ID assignment'], ['64-bit IDs', 'Compact indexes, native integer columns', 'Limited bits for time, worker and sequence; plan the layout'], ['Coordinator leases for worker IDs', 'No duplicate workers', 'Another dependency (only at start-up)'], ['Refuse on clock rollback', 'Correctness over availability', 'Brief unavailability on that instance']],
  alternatives:[['UUIDv4 (random 128-bit)', 'No coordination at all, but 128 bits, not time-ordered, and fragments B-tree indexes'], ['UUIDv7 (RFC 9562)', 'Time-ordered 128-bit with random bits; a great default when 128 bits is acceptable'], ['ULID', 'Similar to UUIDv7, lexicographically sortable strings'], ['DB sequence per shard with shard bits (Instagram)', 'Generated inside Postgres; ties ID generation to the DB shard']],
  failures:[['Coordinator', 'Existing leases keep working; new instances wait'], ['Clock rollback', 'Wait or refuse; alert on clock offset'], ['Sequence exhausted within a ms', 'Spin until the next millisecond (4,096 IDs/ms per worker)'], ['Epoch overflow (~69 years)', 'Choose a recent custom epoch; document it']],
  lab:{stack:['Any language with 64-bit integers (Go, Java, Node BigInt)', 'etcd or ZooKeeper', 'PostgreSQL', 'Docker Compose'], milestones:[
    {day:'Day 1', items:['Implement nextId() with 41/10/12 bits', 'Unit tests: uniqueness, monotonicity, decode', 'Handle sequence overflow by waiting for the next ms', 'Refuse on clock rollback']},
    {day:'Day 2', items:['Lease worker IDs from etcd with a TTL', 'Stop generating if the lease is lost', 'Run 10 instances and generate 1M IDs each', 'Check for duplicates across all instances']},
    {day:'Day 3', items:['Expose /ids HTTP for other languages', 'Benchmark IDs/s per instance', 'Compare index size: BIGINT Snowflake vs UUIDv4 vs UUIDv7 in Postgres', 'Dashboard: clock offset per host']}],
   pseudocode:{lang:'ts', code:`class Snowflake {
  private last = -1n; private seq = 0n;
  constructor(private worker: bigint, private epoch = 1704067200000n) {}
  next(): bigint {
    let now = BigInt(Date.now());
    if (now < this.last) throw new Error('clock moved backwards');   // or wait if the skew is tiny
    if (now === this.last) {
      this.seq = (this.seq + 1n) & 4095n;
      if (this.seq === 0n) while ((now = BigInt(Date.now())) <= this.last) {}  // next millisecond
    } else this.seq = 0n;
    this.last = now;
    return ((now - this.epoch) << 22n) | (this.worker << 12n) | this.seq;
  }
}`},
   loadTest:'<p>Run 10 generator instances with leased worker IDs, generate 10M IDs in total, insert into a table with a primary key (any duplicate fails the insert), and measure throughput. Then shift one host’s clock back 1 s and confirm it refuses rather than duplicates.</p>'},
  twists:[
    {q:'Can you guarantee strict global ordering of IDs across machines?', a:'Not cheaply. Snowflake IDs are only k-sorted (ordered within clock skew). Strict global order needs a single sequencer or consensus (a bottleneck). Most systems accept k-sorted IDs and use per-entity ordering where it matters.'},
    {q:'You need IDs in 3 datacentres. How do you split the bits?', a:'Reserve bits for the datacentre (e.g. 5 datacentre + 5 machine bits = 32 DCs × 32 machines), or lease worker IDs from a global coordinator with per-DC ranges. Keep the timestamp first so IDs still sort by time.'},
    {q:'Invoices must be gap-free and sequential by law. Does Snowflake work?', a:'No. Snowflake has gaps and is not strictly sequential. Use a per-entity sequence allocated transactionally in the database (e.g. per GSTIN/company per financial year), and accept the coordination cost for that small volume.'}],
  real:[
    {co:'Flickr ticket servers', tier:'confirmed', text:'Flickr generated unique IDs with dedicated MySQL “ticket servers” using REPLACE INTO and auto-increment offset/step across two servers for redundancy.', src:'Flickr Engineering, “Ticket Servers: Distributed Unique Primary Keys on the Cheap” (2010)'},
    {co:'Twitter Snowflake', tier:'confirmed', text:'Twitter built Snowflake to generate roughly time-ordered, unique 64-bit IDs (timestamp, worker number, sequence) without coordination per ID.', src:'Twitter Engineering, “Announcing Snowflake” (2010)'},
    {co:'Instagram', tier:'confirmed', text:'Instagram generated 64-bit IDs inside sharded PostgreSQL using 41 bits of time, 13 bits of logical shard ID and 10 bits of per-shard sequence.', src:'Instagram Engineering, “Sharding & IDs at Instagram” (2012)'},
    {co:'UUIDv7', tier:'confirmed', text:'RFC 9562 (2024) defines UUID version 7: a 48-bit Unix millisecond timestamp plus random bits, giving time-ordered 128-bit UUIDs.', src:'IETF RFC 9562'}],
  sources:['Flickr Engineering (2010)', 'Twitter Engineering — Snowflake (2010)', 'Instagram Engineering (2012)', 'IETF RFC 9562 — UUIDs', 'Kleppmann, Designing Data-Intensive Applications, ch. 8 (unreliable clocks)']
});
})();
