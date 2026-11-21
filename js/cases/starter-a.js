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
    out.append(frag(h.table(['Quantity', 'Value'], [['Possible codes (62^' + P.len + ')', fmtNum(space)], ['Codes already used', fmtNum(P.n)], ['Chance the next random code clashes', (pNext * 100).toPrecision(3) + '%'], ['Chance of at least one clash so far (the “birthday effect”)', (pAny * 100).toPrecision(3) + '%']], [1])));
    out.append(el('div', {class:'verdict ' + (pNext > .01 ? 'bad' : pNext > 1e-4 ? 'warn' : 'ok')}, pNext > .01 ? 'Random codes now clash often. Every insert needs a check and a retry, and creating links gets slower as the space fills. Use longer codes or counter-based IDs.' : pAny > .5 ? 'At this volume at least one clash is almost certain. Random codes always need a unique rule plus a retry, even if each single insert rarely clashes.' : 'Clashes are rare, but keep the unique rule and the retry anyway.'));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Code length (base62 characters)', min:5, max:10, value:P.len, fmt:v => String(v), onInput:v => { P.len = v; run(); }}).el, ui.slider({label:'Codes already issued', min:6, max:12, step:.1, value:Math.log10(P.n), fmt:v => fmtNum(Math.pow(10, v)), onInput:v => { P.n = Math.pow(10, v); run(); }}).el), out);
  run();
}
function base62Demo(host){
  const inp = el('input', {class:'input mono', value:'125000000000', 'aria-label':'Numeric ID', style:{maxWidth:'240px'}}); const out = el('div');
  const code = el('input', {class:'input mono', value:'', 'aria-label':'Short code', style:{maxWidth:'160px'}});
  function run(){ out.innerHTML = ''; try { const n = BigInt(inp.value.trim() || '0'); const c = toB62(n); code.value = c; out.append(el('div', {class:'verdict ok'}, `The number ${n.toLocaleString('en-IN')} becomes “${c}” (${c.length} characters). 62⁷ is about 3.5 trillion, so 7 characters cover trillions of links.`)); } catch(e){ out.append(el('div', {class:'verdict warn'}, 'Enter a whole number.')); } }
  inp.addEventListener('input', run); code.addEventListener('input', () => { try { inp.value = fromB62(code.value.trim()).toString(); out.innerHTML = ''; out.append(el('div', {class:'verdict ok'}, `“${code.value.trim()}” turns back into the number ${inp.value}.`)); } catch(e){ out.innerHTML = ''; out.append(el('div', {class:'verdict warn'}, e.message)); } });
  host.append(el('div', {class:'ctl-grid'}, el('label', {class:'field'}, el('span', null, 'Number (from the ID range allocator)'), inp), el('label', {class:'field'}, el('span', null, 'Base62 short code'), code)), out);
  run();
}

/* ======================= 1. URL SHORTENER ======================= */
SDA.register({kind:'case', id:'url-shortener', tier:'starter', icon:'🔗', title:'URL shortener (TinyURL / Bitly-style)', tagline:'Billions of redirects, a few writes: the classic read-heavy warm-up.', tags:['base62', 'cache', 'redirect', 'id generation', 'analytics'],
  modules:['foundations', 'caching', 'databases', 'distributed', 'async'],
  summary:'A URL shortener gives each long web address a short code, and sends visitors from the code to the address. People open links about 100 times more than they create them, so the design is about unique codes and fast reads.',
  accuracy:'This is a simplified design for learning. The scale numbers are illustrative guesses. Company facts are listed in the Sources tab.',
  overview:{what:'<b>A small example.</b> Asha pastes <code>https://www.example.in/sale?id=42&amp;ref=newsletter</code> and gets <code>https://sho.rt/aZ3k9Qx</code>. She sends it in a chat. Each friend who taps it is sent to the long address in a few milliseconds. Later, Asha can see how many people tapped it.', in:['Create a short link (a custom name and an expiry date are optional)', 'Send visitors on to the long address (a redirect), using HTTP status 301 or 302', 'Basic click counts by day and country', 'Turn off or delete a link'], out:['User accounts and billing', 'Link-in-bio pages and QR code design', 'Deep scam detection (we only add a hook to scan links)']},
  challenges:['Reads far outnumber writes, about 100 to 1. One viral link can get thousands of opens a second.', 'Many servers must make unique short codes without clashing, and without asking each other on every write.', 'The redirect happens before every page load, so it must be fast for visitors around the world.', 'Counting clicks must not slow the redirect, or pile many updates onto one database row.', 'People misuse short links for phishing and malware.'],
  fr:['<code>POST /v1/links</code> creates a short code for a long address. A custom name is optional and must be unique.', '<code>GET /{code}</code> sends the visitor to the long address. We use status 302 by default, and 301 if the owner asks.', 'A link can expire or be turned off.', 'Owners can read their click counts.'],
  nfr:['Redirect p99 under 50 ms from the visitor’s region. p99 means 99 out of 100 redirects are faster than this. The target is illustrative.', '99.99% availability for redirects. Creating links may be slightly lower.', 'No two long addresses share a code, and no link is ever lost.', 'Click counts may be a few minutes late.', 'Codes should be hard to guess one after another.'],
  scale:[
    {k:'New links', v:'≈ 40 a second', math:'100M ÷ (30 days × 86,400 s) = 100M ÷ 2.6M ≈ 39 a second', tag:'illustrative'},
    {k:'Redirects', v:'≈ 4,000 a second on average, ≈ 20,000 at peak', math:'100 reads per write × 40 = 4,000. Peak: 5 × 4,000 = 20,000', tag:'illustrative'},
    {k:'Storage (5 years)', v:'≈ 3 TB', math:'100M × 12 × 5 = 6B links. 6B × 500 B = 3 TB', tag:'illustrative'},
    {k:'Code length', v:'7 characters', math:'62^7 ≈ 3.5 trillion, far more than 6 billion links', tag:'illustrative'},
    {k:'Cache for hot links', v:'≈ 10 to 20 GB', math:'Assume 100M links are opened in a day. The hottest 20% is 20M × 500 B = 10 GB. Add room to spare', tag:'illustrative'}],
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
    {title:'One server and one database', scale:'1K links a day', fix:'<p>One app server and one Postgres database. The database counts links 1, 2, 3 and so on. We turn each number into letters and digits (this is called base62) to make the code. It is simple, correct and cheap.</p>', after:{lat:30, err:.05, load:15}},
    {title:'A link goes viral', scale:'5M clicks a day', hot:['app', 'db'], breaks:'<p>A celebrity shares one link. 3,000 redirects a second hit one server and one database. The server is overloaded, the database runs out of connections, and redirects time out.</p>', fix:'<p>Add a <b>load balancer</b>, which shares requests between several app servers. Add <b>Redis</b>, a fast in-memory store, and keep each <code>code → long address</code> pair there.</p><p>This is <b>cache-aside</b>: look in Redis first. Only on a miss, read the database and save the answer in Redis. Popular links then never reach the database.</p>', sub:{app:'×4 stateless'}, before:{lat:2400, err:7, load:160}, after:{lat:22, err:.03, load:40}, flow:[['c', 'lb', 'GET /aZ3k'], ['lb', 'app'], ['app', 'cache', 'hit']], lesson:['cache-strategies', 'lb-algorithms']},
    {title:'Many servers make clashing codes', scale:'100M links a month', hot:['db'], breaks:'<p>With random codes, a server must check that a code is free before saving it. Two servers can pick the same code at the same moment. Using one database counter instead makes every create wait in line.</p>', fix:'<p>An <b>ID range allocator</b> hands each app server a block of 10,000 numbers. Each server turns its numbers into codes without asking anyone. A unique rule in the database stays as a safety net.</p><p>To make codes hard to guess, we scramble each number with a reversible shuffle before turning it into letters.</p>', before:{lat:140, err:.9, load:85}, after:{lat:20, err:.02, load:40}, flow:[['app', 'kgs', 'next block'], ['app', 'db', 'INSERT']], lesson:['unique-ids']},
    {title:'Visitors around the world', scale:'Global users', hot:['lb'], breaks:'<p>Visitors in Europe and the US wait 250 ms or more before the redirect even starts. Every click crosses an ocean to reach one region.</p>', fix:'<p>Serve redirects from the <b>edge</b>: servers close to users (a CDN) keep popular answers for a short time. Add database copies in more regions.</p><p>We use status 302 with a short edge time, so clicks still reach us for counting. A 301 would let browsers skip us entirely.</p>', before:{lat:290, err:.1, load:60}, after:{lat:35, err:.02, load:25}, flow:[['c', 'cdn', 'edge hit']], lesson:['cdn', 'geodns-anycast']},
    {title:'Counting clicks melts the database', scale:'10B clicks a month', hot:['db'], breaks:'<p>Running <code>UPDATE links SET clicks = clicks + 1</code> on every redirect makes many requests fight over one row. Redirects slow down whenever a link trends.</p>', fix:'<p>Redirect first, then send a <b>click event</b> to Kafka, a queue that stores events. Stream jobs add them up by code, day and country in an analytics store built for sums.</p><p>Redirects stay fast. The counts lag by seconds or minutes.</p>', before:{lat:450, err:2.2, load:120}, after:{lat:30, err:.02, load:35}, flow:[['app', 'q', 'click'], ['q', 'an', 'aggregate']], lesson:['queues-pubsub-streams', 'batch-vs-stream']}],
  flows:[
    {name:'Click a short link', steps:[
      {note:'The browser asks for <code>/aZ3k9Qx</code>. The nearest edge has no saved copy yet (a miss).', flow:[['c', 'cdn', 'GET /aZ3k9Qx']]},
      {note:'The edge passes the request to the load balancer, which picks a healthy app server.', flow:[['cdn', 'lb'], ['lb', 'app']]},
      {note:'The app looks in Redis and finds nothing. It reads the database once and saves the answer in Redis for 24 hours.', flow:[['app', 'cache', 'GET'], ['app', 'db', 'SELECT'], ['app', 'cache', 'SET']]},
      {note:'The app replies <b>302 Location: long address</b>. The edge keeps it for 60 seconds, so the next clicks never reach the origin.', flow:[['app', 'lb', '302'], ['lb', 'cdn'], ['cdn', 'c', '302']]},
      {note:'After replying, the app sends a click event. The counts are updated later, in the background.', flow:[['app', 'q', 'click{code,country}'], ['q', 'an']]}]},
    {name:'Create a short link', steps:[
      {note:'<code>POST /v1/links</code> arrives with the long address.', flow:[['c', 'cdn', 'POST'], ['cdn', 'lb'], ['lb', 'app']]},
      {note:'The server takes the next number from its block. It asks for a new block only once every 10,000 links. It scrambles the number and turns it into a code.', flow:[['app', 'kgs', 'block (rare)']]},
      {note:'It saves <code>(code, long_url, …)</code> with a unique rule, warms the cache, and replies <code>201 {short_url}</code>.', flow:[['app', 'db', 'INSERT'], ['app', 'cache', 'SET'], ['app', 'lb', '201'], ['lb', 'cdn'], ['cdn', 'c']]}]}],
  breakIt:[
    {label:'Kill Redis', kill:['cache'], verdict:'degrades', text:'Redirects fall back to the database, and edge caches still absorb hot links. Latency rises and database load jumps. So the database must survive an empty cache, ideally by merging identical lookups into one (request coalescing).', flow:[['app', 'db', 'cache miss']]},
    {label:'Kill an app server', kill:['app'], verdict:'survives', text:'Health checks remove it, and the other servers take the traffic. Its unused block of numbers is skipped. Gaps in the numbers are harmless.', flow:[['lb', 'app', 'reroute']]},
    {label:'Primary DB down', kill:['db'], verdict:'degrades', text:'Hot links keep redirecting from the edge and Redis. New links and cold links fail until a copy is promoted, which takes about a minute with automatic failover.', flow:[['c', 'cdn', 'edge hit']]},
    {label:'Kafka down', kill:['q'], verdict:'survives', text:'Redirects are unaffected. Click events are held locally or sampled, and the counts catch up later. Counting must never block redirects.'},
    {label:'ID allocator down', kill:['kgs'], verdict:'survives', text:'Servers keep making codes from their current blocks, which gives minutes of room. Run 2 or more allocators backed by the database, so a new block is always available.'}],
  dataModel:{lang:'sql', title:'links schema', code:`CREATE TABLE links (
  code         VARCHAR(10) PRIMARY KEY,          -- letters and digits made from a scrambled 64-bit number
  long_url     TEXT        NOT NULL,
  owner_id     BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ,
  disabled     BOOLEAN     NOT NULL DEFAULT false
);
CREATE INDEX links_owner ON links (owner_id, created_at DESC);

-- Click counts live in a separate store built for sums.
-- It is written by the stream job:
-- clicks_daily(code, day, country, referrer_domain, clicks)`, notes:'Each link is one small row. 6B rows × 500 B = 3 TB, which fits a sharded Postgres or even one large one. A key-value store such as DynamoDB or Cassandra also fits, because almost every read is “get by code”.'},
  apis:[
    {m:'POST', path:'/v1/links', note:'The client sends an Idempotency-Key header. If it retries, the server does not create a second link.', req:'{ "long_url": "https://www.example.in/sale?id=42", "custom_alias": null, "expires_at": "2026-12-31T00:00:00Z" }', res:'201 Created\n{ "code": "aZ3k9Qx", "short_url": "https://sho.rt/aZ3k9Qx" }'},
    {m:'GET', path:'/{code}', note:'<b>Why 302 and not 301?</b> A 301 says “moved for good”, so browsers remember it and never ask us again. Then we cannot count clicks or turn the link off. A 302 says “moved for now”, so every click reaches us. We reply 404 if the code is unknown and 410 if it expired or was turned off.', res:'302 Found\nLocation: https://www.example.in/sale?id=42\nCache-Control: public, max-age=60'},
    {m:'GET', path:'/v1/links/{code}/stats?from=2026-11-01', res:'{ "code": "aZ3k9Qx", "total": 182344, "by_day": [{"day":"2026-11-01","clicks":9120}], "top_countries": ["IN","US","AE"] }'}],
  algorithm:{title:'Unique short codes', html:'<p>There are three ways to make unique codes.</p><ol><li><b>Random 7-character codes</b>, with a check that the code is free.</li><li><b>A hash of the address</b>, cut short. The same address always gives the same code, but clashes still need handling.</li><li><b>A counter turned into letters and digits (base62).</b> Base62 uses 62 characters: 0 to 9, a to z and A to Z.</li></ol><p>We choose the third. Each server leases a block of numbers, scrambles each one with a reversible shuffle so codes are not in order, and turns it into base62. Try the encoder below. Then see how often random codes would clash.</p>', mount:host => { base62Demo(host); host.append(el('hr', {style:{border:'0', borderTop:'1px solid var(--border)', margin:'16px 0'}})); collisionCalc(host, {len:7, n:6e9}); }},
  tradeoffs:[['Counter blocks and base62', 'No clashes and no retries. Codes are short. One call per block is the only coordination.', 'Plain numbers are guessable, so we add a reversible shuffle. Gaps appear when a server dies.'], ['302 redirects (the default)', 'Every click reaches us, so counts are exact and links can be turned off.', 'More traffic than 301, which browsers keep forever.'], ['Redis cache-aside plus edge caching', 'Absorbs the 100 to 1 read load and viral spikes.', 'Copies can be stale after a link is turned off or edited. Use short times and clear the copy on change.'], ['Click counting in the background', 'Redirect speed does not depend on counting.', 'Counts lag. Events can be lost if buffers overflow.']],
  alternatives:[['Random codes with check-and-insert', 'Retries grow as the code space fills, and every write needs a uniqueness check.'], ['MD5 or SHA of the address, first 7 characters', 'Clashes still need handling. The same address from two users gets the same code, which is sometimes wanted and sometimes not.'], ['UUIDs as codes', 'Far too long for a “short” link.'], ['A NoSQL store (DynamoDB or Cassandra) instead of Postgres', 'Also a great fit for get-by-key at scale. Choose it if the team prefers managed scaling over SQL features.']],
  failures:[['The Redis cluster', 'Fall back to the database, merge identical lookups, and let edge caches keep hot links alive.'], ['The primary database', 'Automatic failover to a synchronous copy. Redirects from cache continue meanwhile.'], ['A whole region', 'GeoDNS sends users to another region, where a copy of the links table serves redirects.'], ['Kafka or analytics', 'Redirects continue. Events are held or sampled, and counts are filled in later.']],
  lab:{stack:['Node.js (Fastify) or Go', 'PostgreSQL', 'Redis', 'Nginx', 'Docker Compose', 'k6'], milestones:[
    {day:'Day 1: the basics', items:['POST /links and GET /{code} with Postgres', 'Turn a database counter into base62', 'A unique rule plus Idempotency-Key handling', 'Return 302 with a Cache-Control header']},
    {day:'Day 2: faster reads', items:['Redis cache-aside with an expiry time', 'Two app containers behind Nginx', 'Range allocator: each process leases 1,000 numbers', 'k6 test: 2,000 redirects a second with p99 under 50 ms on your laptop']},
    {day:'Day 3: counts and safety', items:['Send click events to Redis Streams or Kafka', 'A consumer adds up clicks per code per day', 'Limit link creation per IP and per user', 'Block known-bad domains with a deny list']}],
   pseudocode:{lang:'ts', code:`// Redirect handler: look in the cache first, count clicks in the background
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
  events.publish('clicks', { code, ts: Date.now(), country: req.headers['cf-ipcountry'] }).catch(() => {}); // never wait for this
});`},
   loadTest:'<p>Save 1 million links. Then run a k6 test where a few codes are very popular, and ramp up to 2,000 requests a second for 5 minutes. Watch three things: p99 latency, the Redis hit ratio (aim for over 95%) and database CPU.</p><p>Then empty Redis in the middle of the test. Check that the database survives the sudden rush of misses.</p>'},
  twists:[
    {q:'Traffic grows 100 times overnight because of a big cricket promotion. What changes?', a:'Most of the load is redirects, so lean on the edge. Use longer edge times for hot codes, and warm the CDN for campaign links. Add more app servers, and add Redis copies or shards. Make sure the database survives an empty cache, using request coalescing and read copies. Creating links goes from 40 to 4,000 a second, which range allocation still handles. Shard the links table by a hash of the code if one primary gets close to its limit.'},
    {q:'How do you stop people using it for phishing?', a:'Check new addresses against lists of known-bad sites, in the background, and turn off links that match. Limit link creation per account and per IP. Show a warning page for new or suspicious links, and let users report links. Make turned-off links return 410 everywhere, which means clearing edge caches too.'},
    {q:'Can two users get the same short code for the same long address?', a:'It is a product decision. Sharing one code saves space, but it leaks that someone else shortened this address, and it mixes their click counts. Most services give each user, or each request, its own code. If you want to dedupe, do it per owner with a unique index on the owner and a hash of the address.'},
    {q:'A user wants a custom name such as /sale. What do you check?', a:'The name must be unique, so use the same unique rule as normal codes. Keep a list of reserved words such as “api” and “admin”. Keep custom names apart from generated codes, for example by length, so a custom name can never take a code the system will make later. Limit custom names per account to stop squatting.'}],
  real:[
    {co:'Twitter/X t.co', tier:'confirmed', text:'Links posted on Twitter/X are wrapped with the t.co shortener. This lets the platform check links against lists of harmful sites and count clicks.', src:'X Help Center, “About Twitter’s link service (t.co)”'},
    {co:'HTTP redirects', tier:'confirmed', text:'A 301 (Moved Permanently) may be cached by clients, while a 302 (Found) is temporary. That is why shorteners that need click counts usually use 302 or 307.', src:'IETF RFC 9110 (HTTP Semantics), section 15.4'},
    {co:'Twitter Snowflake', tier:'confirmed', text:'Twitter open-sourced Snowflake in 2010 to make unique, roughly time-ordered 64-bit IDs without a central counter. It is an alternative to range allocation.', src:'Twitter Engineering blog, “Announcing Snowflake” (2010)'}],
  sources:['Xu, System Design Interview, ch. 8 “Design a URL Shortener” (2020)', 'IETF RFC 9110, HTTP Semantics (redirect status codes)', 'Twitter Engineering, Announcing Snowflake (2010)', 'Flickr Engineering, “Ticket Servers: Distributed Unique Primary Keys on the Cheap” (2010)', 'Redis documentation, caching patterns']
});

/* ======================= 2. PASTEBIN ======================= */
SDA.register({kind:'case', id:'pastebin', tier:'starter', icon:'📋', title:'Pastebin (text & code sharing)', tagline:'Metadata in a database, blobs in object storage, expiry at scale.', tags:['object storage', 'expiry', 'TTL', 'CDN', 'abuse scanning'],
  modules:['databases', 'caching', 'traffic', 'async', 'security'],
  summary:'A paste service stores text or code and gives back a short link. The design is about keeping big text out of the database, deleting expired pastes cheaply, and serving viral pastes from a CDN.',
  accuracy:'This is a simplified design for learning. The scale numbers are illustrative guesses. Company facts are listed in the Sources tab.',
  overview:{what:'<b>A small example.</b> Asha hits an error and pastes 40 lines of her log into the service. She picks “unlisted” and “delete after one day”, and gets <code>/p/Xy7Kp2Qa</code>. She sends the link to a friend, who opens it and reads the log with colours. After a day, the link shows “gone”.', in:['Create a paste (text, language, visibility, expiry)', 'View rendered and raw', 'Expire and delete automatically', 'Basic view counts'], out:['Real-time collaborative editing', 'Version history / diffs', 'Full-text search across all public pastes']},
  challenges:['Large blobs (KB to MB) don’t belong in the primary database', 'Expiry of billions of pastes without expensive full scans', 'Read-heavy with sudden viral pastes', 'Abuse: malware, doxxing, leaked API keys and passwords'],
  fr:['Create a paste and get back a unique 8-character key', 'Read a paste, as a page or as plain text', 'An optional expiry time. An expired paste is never shown', 'Visibility: public, unlisted (only people with the link), or private (only the owner)'],
  nfr:['Read p99 < 100 ms for cached pastes', 'Durability: no accepted paste is lost before expiry', '99.9% availability', 'Content is immutable after creation (simplifies caching)'],
  scale:[{k:'New pastes', v:'≈ 120 a second', math:'10M a day ÷ 86,400 s ≈ 116', tag:'illustrative'}, {k:'Reads', v:'≈ 1,200 a second on average, ≈ 5,000 at peak', math:'10 reads for each paste: 10 × 120 = 1,200. The peak is about 4 times the average', tag:'illustrative'}, {k:'Content storage', v:'≈ 36 TB a year', math:'10M × 10 KB = 100 GB a day. 100 GB × 365 ≈ 36 TB', tag:'illustrative'}, {k:'Metadata', v:'≈ 0.7 TB a year', math:'10M × about 200 bytes = 2 GB a day. 2 GB × 365 ≈ 0.7 TB', tag:'illustrative'}, {k:'Key space', v:'62⁸ ≈ 2 × 10¹⁴ keys', math:'8 characters from 62 choices. 10M × 365 = 3.6B pastes a year uses less than 0.002% of the keys', tag:'illustrative'}],
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
    {title:'One server, pastes in Postgres', scale:'5K pastes/day', fix:'<p>One server stores each paste, text included, as a row in Postgres. Each key is 8 random letters and digits (base62), and a unique rule in the database stops two pastes sharing a key.</p>', after:{lat:40, err:.05, load:15}},
    {title:'Big pastes bloat the database', scale:'500K pastes/day', hot:['db'], breaks:'<p>Pastes with several MB of logs make the table huge. Backups take hours and copies fall behind. The memory cache fills with text nobody reads again, and even small lookups slow down.</p>', fix:'<p>Put the text in <b>object storage</b> (a cheap, safe file store) under the paste key. Keep only the small details in Postgres: owner, size, language, visibility, expiry time and the storage key. Object storage scales without effort.</p>', before:{lat:900, err:1.5, load:95}, after:{lat:60, err:.05, load:30}, flow:[['app', 'blob', 'PUT content'], ['app', 'db', 'INSERT meta']], lesson:['storage-types']},
    {title:'A paste goes viral', scale:'Viral spikes', hot:['app'], breaks:'<p>A forum links to one paste, and it gets 20,000 views a minute. The single server spends all its time sending the same bytes from object storage.</p>', fix:'<p>Pastes never change after they are created, so they are easy to cache. Use a <b>CDN</b> for the text, <b>Redis</b> for the details, and a <b>load balancer</b> in front of several servers that keep no state. Unlisted and private pastes use short-lived signed links instead of public caching.</p>', sub:{app:'×3 stateless'}, before:{lat:1600, err:4, load:150}, after:{lat:35, err:.02, load:30}, flow:[['c', 'cdn', 'edge hit']], lesson:['cdn', 'cache-layers']},
    {title:'Expired pastes pile up', scale:'3B pastes stored', hot:['db'], breaks:'<p>Half of all pastes have an expiry. A nightly <code>DELETE … WHERE expires_at < now()</code> scans huge ranges and locks the table, while live traffic waits. Expired text also keeps costing money.</p>', fix:'<p>Check the expiry <b>on every read</b>, so an expired paste is never shown. Run a <b>sweeper</b> that deletes small batches using an index on <code>expires_at</code>. Or split the table by expiry day and drop a whole day at once.</p><p>Storage <b>lifecycle rules</b> delete the old text files by themselves.</p>', before:{lat:300, err:.4, load:110}, after:{lat:40, err:.02, load:35}, flow:[['sweep', 'db', 'DELETE batch'], ['sweep', 'blob', 'delete']], lesson:['indexes']},
    {title:'Abuse and leaked secrets', scale:'Public platform', hot:['app'], breaks:'<p>People paste stolen passwords, malware and private data. Cloud keys pasted by mistake are abused within minutes.</p>', fix:'<p>After saving, put the paste on a queue for a <b>background scan</b>. It looks for secret patterns (cloud keys and tokens), malware and personal data. A match hides the paste or is reported, for example to the key provider so the key is revoked.</p><p>Also limit how often and how large a user can create pastes.</p>', before:{lat:45, err:.1, load:40}, after:{lat:45, err:.05, load:38}, flow:[['app', 'q', 'scan job'], ['q', 'scan']], lesson:['owasp-top10', 'secrets-rotation']}],
  flows:[
    {name:'Create a paste', steps:[
      {note:'The client sends the text. The service checks the size, makes a random 8-character key, and relies on the database rule to confirm the key is unique.', flow:[['c', 'cdn', 'POST'], ['cdn', 'lb'], ['lb', 'app']]},
      {note:'The text goes to object storage first, then the details row is saved. If the save fails, the lonely file is removed later by the cleanup rules.', flow:[['app', 'blob', 'PUT'], ['app', 'db', 'INSERT']]},
      {note:'It answers 201 with the link, and puts a background scan for abuse and secrets on a queue.', flow:[['app', 'lb', '201'], ['lb', 'cdn'], ['cdn', 'c'], ['app', 'q', 'scan']]}]},
    {name:'Read a paste', steps:[
      {note:'Public raw pastes are usually CDN hits.', flow:[['c', 'cdn', 'GET /raw/Xy7Kp2Qa']]},
      {note:'On a miss, the service reads the details from Redis (or the database) and checks the expiry and visibility.', flow:[['cdn', 'lb'], ['lb', 'app'], ['app', 'cache', 'meta']]},
      {note:'It streams the text from object storage, and the CDN keeps it until it expires.', flow:[['app', 'blob', 'GET'], ['app', 'lb'], ['lb', 'cdn'], ['cdn', 'c', '200']]}]}],
  breakIt:[
    {label:'Object storage slow in one zone', hot:['blob'], verdict:'survives', text:'The provider already keeps object storage copies in several zones, and reads retry. Pastes cached in the CDN are not affected.'},
    {label:'Metadata DB primary down', kill:['db'], verdict:'degrades', text:'Cached pastes still come from the CDN and Redis. New pastes fail until the failover finishes. Uncached pastes fail to load for a short time.', flow:[['c', 'cdn', 'edge hit']]},
    {label:'Scanner backlog', kill:['scan'], verdict:'survives', text:'Creating pastes keeps working and scans wait in the queue. Pastes stay visible until they are scanned, so watch that gap.'},
    {label:'Kill a paste server', kill:['app'], verdict:'survives', text:'The load balancer routes around it, because the servers keep no state.', flow:[['lb', 'app', 'reroute']]}],
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
CREATE INDEX pastes_expiry ON pastes (expires_at) WHERE expires_at IS NOT NULL;`, notes:'The text lives in object storage under <code>object_key</code>. At very large sizes, split <code>pastes</code> by expiry day. Cleanup is then one cheap DROP PARTITION.'},
  apis:[
    {m:'POST', path:'/v1/pastes', req:'{ "content": "SELECT * FROM …", "language": "sql", "visibility": "unlisted", "expires_in": "1d" }', res:'201 Created\n{ "key": "Xy7Kp2Qa", "url": "https://paste.example/p/Xy7Kp2Qa", "expires_at": "2026-11-14T10:00:00Z" }'},
    {m:'GET', path:'/raw/{key}', note:'410 Gone if the paste expired. 404 if the key is unknown or the caller may not see it.', res:'200 OK\nContent-Type: text/plain; charset=utf-8\nCache-Control: public, max-age=3600'},
    {m:'DELETE', path:'/v1/pastes/{key}', note:'Only the owner can do this. It also clears the CDN and the cache.', res:'204 No Content'}],
  algorithm:{title:'Random keys and expiry', html:'<p><b>Keys:</b> random 8-character base62 keys cannot be counted through, which is good for unlisted pastes. A unique rule in the database catches a rare clash and the service retries. The calculator shows how rare a clash is.</p><p><b>Expiry:</b> use three things together. Check on every read, delete in batches (by an <code>expires_at</code> index or daily parts), and use storage lifecycle rules. Never run one giant DELETE.</p>', mount:host => collisionCalc(host, {len:8, n:3.6e9})},
  tradeoffs:[['Details in SQL, text in object storage', 'The database stays small and fast. File storage is cheap, safe and has no size limit', 'Each create makes two writes, so you must handle lonely files. A cache miss adds one more hop'], ['Random keys, not counters', 'Unlisted pastes cannot be found by counting', 'A rare clash must be handled with a retry'], ['CDN caching of text that never changes', 'A viral paste costs almost nothing', 'A delete needs a CDN purge, and private pastes need signed links'], ['Scan in the background', 'Creating stays fast', 'Bad content is visible for a short time']],
  alternatives:[['Keep the text in the database (TEXT or BLOB)', 'Fine when small. At large scale, backups, copies and cost all hurt'], ['One wide-column store for everything', 'It works, but object storage is far cheaper for big files that never change'], ['Scan before the paste goes live', 'Creating is slower. Use it only for high-risk categories']],
  failures:[['A storage region has problems', 'Serve from the CDN, and copy critical data to another region'], ['The details database fails', 'Promote a replica. Go read-only for cached content'], ['The CDN fails', 'The origin must absorb a burst, so add servers automatically and rate-limit'], ['The sweeper stops', 'The expiry check on read keeps results correct. Storage cost rises until the sweeper runs again']],
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
  twists:[{q:'How do you support private pastes on a CDN?', a:'Do not cache them in public. Serve them through the app after a login check. Or give each viewer a short-lived signed link (a presigned storage URL or a CDN signed cookie) and mark the response <code>Cache-Control: private</code>.'}, {q:'Storage costs explode. How do you cut them?', a:'Compress the text (it shrinks 3 to 10 times). Store identical text once, using a hash of the content. Move old pastes to cheaper storage with lifecycle rules. Give anonymous pastes a default expiry, and cap the size.'}, {q:'What if a whole region fails?', a:'Copy the details to another region in the background, and turn on cross-region copies of the files. Send reads to the other region with GeoDNS. Creating can fail over too, but the newest pastes may be missing. Say that limit out loud.'}, {q:'Two people paste the exact same text. Do you store it twice?', a:'You can store it once. Keep a hash of the content and point both pastes at one file. The catch is deletion: count how many pastes use the file, and delete it only when the count reaches zero. Most small services skip this and only dedupe very large files.'}],
  real:[
    {co:'Amazon S3', tier:'confirmed', text:'S3 is designed for 99.999999999% (11 nines) durability by storing objects redundantly across multiple Availability Zones, and supports lifecycle rules to expire or transition objects automatically.', src:'Amazon S3 documentation: durability and lifecycle configuration'},
    {co:'GitHub secret scanning', tier:'confirmed', text:'GitHub scans public content for known credential formats and notifies partner providers so leaked tokens can be revoked. This is the same idea as scanning pastes.', src:'GitHub documentation: secret scanning'},
    {co:'Pastebin-style services', tier:'educational', text:'Text-sharing sites typically separate details from content and use expiries and abuse reporting. The exact internals of specific services are not public.', src:'Simplified educational design'}],
  sources:['Amazon S3 documentation (durability, lifecycle rules, presigned URLs)', 'PostgreSQL documentation: partial indexes, table partitioning', 'GitHub secret scanning documentation', 'Martin, The System Design Primer: Pastebin exercise']
});

/* ======================= 3. RATE LIMITER ======================= */
SDA.register({kind:'case', id:'rate-limiter', tier:'starter', icon:'🚦', title:'Distributed rate limiter', tagline:'One quota, many gateway servers, under 2 ms of overhead.', tags:['token bucket', 'Redis', 'Lua', '429', 'gateway'],
  modules:['traffic', 'caching', 'reliability', 'networking'],
  summary:'A rate limiter enforces rules such as “100 requests a minute for each API key” across many gateway servers. The design is about shared counts, tiny delay, and not becoming the thing that takes the API down.',
  accuracy:'This is a simplified design that combines approaches the companies describe in public (Stripe, Cloudflare, Envoy). The scale numbers are illustrative guesses.',
  overview:{what:'<b>A small example.</b> A customer’s plan allows 100 requests a minute. Their script sends 100 requests in the first 10 seconds, and the 101st gets <code>429 Too Many Requests</code> with a header that says when to try again. The API runs on 30 gateway servers, so all of them must count this customer together.', in:['Rules by API key, user, IP and endpoint', 'Token-bucket limits with burst', 'Rate-limit headers and Retry-After', 'Live rule updates'], out:['Billing/quotas over months', 'Bot detection ML', 'DDoS scrubbing at the network layer (handled upstream)']},
  challenges:['Many gateway servers must share one count for each key', 'The check runs on every request, so it must add almost no delay', 'Two requests can arrive at the same moment and both read the same count (a race)', 'The limiter must never become a single point of failure', 'One huge customer (a hot key) and several regions make it harder'],
  fr:['Check and use up quota for a key in one atomic step', 'Allow several rules for one request, such as a burst limit per second and a limit per minute', 'Return RateLimit headers, and Retry-After on a 429', 'Change rules without redeploying the gateways'],
  nfr:['Adds under 2 ms for 99 of 100 checks', 'Available 99.99% of the time. If the limiter fails, the API keeps working (fail open by default)', 'Counts are accurate within a few percent across servers', 'Handle about 1M checks a second'],
  scale:[{k:'Checks', v:'≈ 1M a second at peak', math:'Say 500K API requests a second × 2 rules each = 1M checks a second', tag:'illustrative'}, {k:'Active keys', v:'≈ 50M', math:'API keys, users and IP addresses seen in the last hour. Say 1M keys + 9M users + 40M IPs = 50M', tag:'illustrative'}, {k:'State in Redis', v:'≈ 3 to 5 GB', math:'50M keys × about 100 bytes (tokens, timestamp and overhead) = 5 GB', tag:'illustrative'}, {k:'Redis operations', v:'≈ 1M a second, so 10 or more shards', math:'One Redis shard handles about 100K operations a second. 1M ÷ 100K = 10 shards, so add spare room', tag:'illustrative'}],
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
    {title:'In-memory counter in one server', scale:'1 gateway', fix:'<p>One gateway keeps a token bucket for each key in its own memory. It is exact and takes under a microsecond, but this only works while there is one server.</p>', after:{lat:2, err:.01, load:20}},
    {title:'Scale out: limits multiply', scale:'10 gateways', hot:['api'], breaks:'<p>With 10 gateways behind a load balancer, each one keeps its own count. A customer limited to 100 a minute can really send about 1,000 a minute, and “limited” clients overload the backends.</p>', fix:'<p>Move the counts to a <b>shared Redis</b>. Every gateway checks the same key, such as <code>rl:{apiKey}:{rule}</code>.</p>', sub:{gw:'×10, stateless'}, before:{lat:60, err:3, load:140}, after:{lat:3, err:.05, load:60}, flow:[['gw', 'redis', 'check']], lesson:['rate-limiting']},
    {title:'Races and boundary bursts', scale:'Concurrent requests', hot:['redis'], breaks:'<p>Two gateways each do “read the count, and if it is below the limit, add one” at the same moment. Both read the same number, so both let the request through. A fixed window also allows twice the limit around the minute boundary. Customers see limits that do not add up.</p>', fix:'<p>Make the check and the update <b>atomic</b> with a Redis <b>Lua script</b> that runs a token bucket (or a sliding-window counter). It takes one round trip, has no race, and gives smooth limits.</p>', sub:{redis:'Lua token bucket'}, before:{lat:4, err:.3, load:70}, after:{lat:2, err:.02, load:55}, flow:[['gw', 'redis', 'EVALSHA']], lesson:['rate-limiting']},
    {title:'Redis becomes the bottleneck', scale:'1M checks/s', hot:['redis'], breaks:'<p>One Redis node runs out of operations per second, and it is a single point of failure. When it hiccups, every request waits or fails.</p>', fix:'<p>Use <b>Redis Cluster</b>, split by key and with replicas, and give the client a short timeout (about 5 ms). If Redis fails, the gateway <b>fails open</b> and uses a cautious local limit, so the API stays up.</p><p>For even less load, each gateway can keep a small local allowance for a key and sync with Redis every few hundred milliseconds.</p>', sub:{redis:'12 shards + replicas'}, before:{lat:40, err:2.5, load:120}, after:{lat:1.6, err:.02, load:45}, lesson:['redis-vs-memcached', 'circuit-breaker']},
    {title:'Rules change daily, ops needs visibility', scale:'Many products', breaks:'<p>Every limit change needs a deploy. Nobody can see which customers are being throttled until they complain.</p>', fix:'<p>A <b>rules service</b> stores the limits (for each plan, key and endpoint) and pushes them to the gateways, which cache them. Every throttle decision sends an <b>event and a metric</b> for dashboards and alerts.</p>', before:{lat:2, err:.1, load:45}, after:{lat:1.6, err:.02, load:45}, flow:[['cfg', 'gw', 'rules v42'], ['redis', 'obs', 'events']], lesson:['config-feature-flags']}],
  flows:[
    {name:'Allowed request', steps:[
      {note:'A request with <code>API-Key: sk_…</code> reaches a gateway via the load balancer.', flow:[['c', 'lb'], ['lb', 'gw']]},
      {note:'The gateway runs a Lua token-bucket script on the key’s Redis shard. It refills tokens for the time that passed, takes one, and returns how many are left. This is one round trip of about 0.5 ms.', flow:[['gw', 'redis', 'EVALSHA'], ['redis', 'gw', 'allowed, 37 left']]},
      {note:'The request goes on to the backend. The response carries <code>RateLimit-Limit</code>, <code>RateLimit-Remaining</code> and <code>RateLimit-Reset</code>.', flow:[['gw', 'api'], ['api', 'gw'], ['gw', 'lb'], ['lb', 'c', '200']]}]},
    {name:'Rejected request', steps:[
      {note:'The client bursts beyond its quota.', flow:[['c', 'lb', 'burst'], ['lb', 'gw']]},
      {note:'The script finds no tokens and returns the wait until the next token.', flow:[['gw', 'redis', 'EVALSHA'], ['redis', 'gw', 'denied, retry 300 ms']]},
      {note:'The gateway returns <b>429</b> with <code>Retry-After</code> and never touches the backend. Clients should back off with a random delay (jitter).', flow:[['gw', 'lb', '429'], ['lb', 'c']]}]}],
  breakIt:[
    {label:'Redis shard down', kill:['redis'], verdict:'degrades', text:'Gateways time out fast (5 ms) and fail open to local limits (the limit divided by the number of gateways). Accuracy drops but the API stays up, and a replica is promoted within seconds.'},
    {label:'Rules service down', kill:['cfg'], verdict:'survives', text:'Gateways keep enforcing the last rules they saw, from their local cache. Only rule changes are delayed.'},
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
return { allowed and 1 or 0, math.floor(tokens), retry }`, notes:'Rules live in the rules service, for example <code>{ key: "api_key", endpoint: "/v1/charges", rate: 25, burst: 50 }</code>. Use one clock for refills. The gateway clock is fine if the servers are NTP-synced. Or use Redis <code>TIME</code>.'},
  apis:[
    {m:'GW', path:'check(key, rule, cost) → {allowed, remaining, retryAfterMs}', note:'Internal call inside the gateway middleware, with a 5 ms timeout and fail-open fallback.'},
    {m:'HTTP', path:'429 Too Many Requests', res:'HTTP/1.1 429 Too Many Requests\nRetry-After: 1\nRateLimit-Limit: 100\nRateLimit-Remaining: 0\nRateLimit-Reset: 1\n\n{ "error": "rate_limited", "retry_after_ms": 300 }'},
    {m:'PUT', path:'/admin/v1/rules/{id}', req:'{ "match": { "plan": "free", "endpoint": "/v1/*" }, "rate_per_sec": 2, "burst": 20 }', res:'200 OK { "version": 42 }'}],
  algorithm:{title:'Token bucket vs windows', html:'<p>Token bucket allows controlled bursts and a steady rate with two numbers of state per key. Sliding-window counters avoid fixed-window boundary bursts with two counters. Compare all four algorithms live in the playground, and build two of them in the labs.</p>', pg:'rate-limiter', lab:['token-bucket', 'sliding-window']},
  tradeoffs:[['Central Redis counters', 'Accurate limits across all gateways', 'One network hop for every check, and Redis must be highly available'], ['An atomic Lua script', 'No races and one round trip', 'Scripts must be fast and predictable, and the keys must live in one cluster slot'], ['Fail open when the limiter fails', 'A limiter outage does not become an API outage', 'Too many requests may get through for a while, so also protect the backends by shedding load'], ['A local allowance with a sync every so often', 'Less delay and less load on Redis', 'A small overshoot between syncs']],
  alternatives:[['Local limits only (limit ÷ N for each gateway)', 'No shared state, but it is inaccurate when traffic is uneven across gateways'], ['Sticky routing: one limiter node for each key', 'Accurate without Redis, but you need consistent hashing and rebalancing'], ['A managed service: API gateway or Envoy global rate limit service', 'Less code, but less choice of algorithms and rules']],
  failures:[['A Redis shard fails', 'Fail open with local limits, and promote a replica'], ['Clocks differ between gateways', 'Use Redis TIME or accept small drift, and never let a refill go negative'], ['A hot key (a huge customer)', 'Give that key a local allowance, or split its limit per region'], ['A bad rules push', 'Check the rules first, try them on a few gateways, and roll back to the last version']],
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
  twists:[{q:'Your API runs in several regions. Is a customer’s limit global or per region?', a:'Usually per region, which is simple and fast. Split the global limit by each region’s expected share of traffic, and reconcile in the background for quotas that matter for billing. A truly global limit needs a cross-region call on every request. That costs delay and availability.'}, {q:'What is the difference between rate limiting and load shedding?', a:'Rate limiting is about fairness for each client, using contracts and quotas. Load shedding protects the service when the total load is more than it can handle, no matter who sends it. Stripe describes using both: limiters for request rate and for concurrent requests, plus load shedders that drop lower-priority traffic first.'}, {q:'How would you limit by cost, such as expensive search queries?', a:'Give each endpoint or query a token cost, for example 1 for a read and 10 for an export, and take that many tokens. Or use a separate concurrency limit for the expensive operations.'}, {q:'A client retries at once after every 429. What do you do?', a:'Always return Retry-After and tell clients to wait a random time before retrying. Count the rejected calls against the client too, so a retry storm keeps draining its tokens. For repeat offenders, add a short temporary block.'}],
  real:[
    {co:'Stripe', tier:'confirmed', text:'Stripe described running four kinds of limiters (request rate, concurrent requests, fleet-usage load shedder and worker-utilisation load shedder), implemented with token buckets in Redis.', src:'Stripe Engineering, “Scaling your API with rate limiters” (2017)'},
    {co:'Cloudflare', tier:'confirmed', text:'Cloudflare explained its sliding-window counter approach, which approximates a sliding log using the previous and current window counts, enabling rate limiting across a huge number of domains.', src:'Cloudflare blog, “How we built rate limiting capable of scaling to millions of domains” (2017)'},
    {co:'GitHub API', tier:'confirmed', text:'GitHub’s REST API documents a primary limit of 5,000 requests per hour for authenticated users and returns x-ratelimit-* headers.', src:'GitHub REST API documentation: Rate limits'}],
  sources:['Stripe Engineering (2017)', 'Cloudflare blog (2017)', 'Envoy / Lyft ratelimit service documentation', 'IETF draft “RateLimit header fields for HTTP”', 'Redis documentation: EVAL/EVALSHA and Lua scripting']
});

/* ======================= 4. UNIQUE ID GENERATOR ======================= */
SDA.register({kind:'case', id:'unique-id', tier:'starter', icon:'🆔', title:'Unique ID generator (Snowflake-style)', tagline:'64-bit, time-ordered, unique IDs with no central bottleneck.', tags:['Snowflake', 'ticket server', 'clock', 'ZooKeeper', 'UUIDv7'],
  modules:['distributed', 'databases'],
  summary:'A unique ID service makes 64-bit IDs that are unique and roughly in time order, for orders, posts and messages on hundreds of servers. The design is about speed without clashes, even when clocks misbehave.',
  accuracy:'This is a simplified design based on what the companies describe in public (Flickr ticket servers, Twitter Snowflake, Instagram). The scale numbers are illustrative guesses.',
  overview:{what:'<b>A small example.</b> A shop has 200 servers that save orders. Each new order needs an ID that no other order has ever had, even if two servers save orders in the same millisecond. The ID must fit in a 64-bit number and grow with time, so “newest orders first” is a simple sort.', in:['nextId() in-process or via a service', 'Uniqueness across datacentres', 'Rough time ordering', 'Decoding for debugging'], out:['Human-friendly codes (see the URL shortener)', 'Strictly gap-free sequences (invoices need a different design)']},
  challenges:['IDs must be unique without a network call for each one', 'They must fit in 64 bits, for database indexes and APIs', 'Feeds and pages need IDs that sort by time', 'Clocks can drift or jump backwards', 'Servers come and go, so machine numbers must be given out safely'],
  fr:['Return a unique 64-bit ID', 'IDs grow with time (roughly sorted)', 'At least 10,000 IDs a second for each node', 'Read the time, worker and sequence back out of an ID'],
  nfr:['No duplicates, ever', 'Under a millisecond, ideally inside the process', 'No single point of failure', 'Works for decades'],
  scale:[{k:'Peak ID demand', v:'≈ 100K IDs a second', math:'Say 100 services × 1,000 writes a second each = 100,000 a second', tag:'illustrative'}, {k:'Capacity of one node', v:'4,096 IDs every millisecond', math:'A 12-bit sequence gives 2¹² = 4,096 IDs for each millisecond, for each worker', tag:'illustrative'}, {k:'Workers', v:'1,024', math:'A 10-bit worker number gives 2¹⁰ = 1,024 workers (for example 5 bits for the data center and 5 for the machine)', tag:'illustrative'}, {k:'Lifetime', v:'≈ 69 years', math:'2⁴¹ ms ÷ (1,000 × 86,400 × 365.25) ≈ 69.7 years', tag:'illustrative'}],
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
    {title:'Database auto-increment', scale:'One database', fix:'<p>The database gives out <code>BIGINT AUTO_INCREMENT</code> IDs. They are unique, ordered and simple, as long as there is one database.</p>', after:{lat:2, err:0, load:20}},
    {title:'Sharding breaks auto-increment', scale:'8 DB shards', hot:['db'], breaks:'<p>After sharding, each shard counts 1, 2, 3 on its own, so IDs clash across shards. One global counter database would be a bottleneck and a single point of failure.</p>', fix:'<p>Use <b>ticket servers</b> (the Flickr way): two dedicated MySQL servers use <code>REPLACE INTO</code> with an auto-increment offset and step. One hands out odd IDs and the other even IDs. Services ask them for an ID, or for a block of IDs.</p>', before:{lat:25, err:1.5, load:110}, after:{lat:3, err:.01, load:50}, flow:[['svc', 't1', 'next id'], ['svc', 'db', 'INSERT']], lesson:['unique-ids', 'sharding']},
    {title:'Network hop per ID, no time order', scale:'100K IDs/s', hot:['t1', 't2'], breaks:'<p>Every ID needs a network call to a ticket server, and the calls queue up at peak. IDs from server A and server B do not sort by time, so feeds and cursors need a second column.</p>', fix:'<p>Use <b>Snowflake</b>: make each ID <b>inside the process</b> from <code>41 bits of time in ms | 10 bits of worker | 12 bits of sequence</code>. There is no network call, a worker makes 4,096 IDs a millisecond, and IDs sort roughly by time.</p>', sub:{svc:'×200 instances'}, before:{lat:45, err:.8, load:130}, after:{lat:.01, err:0, load:10}, flow:[['svc', 'snow', 'nextId()']], lesson:['unique-ids']},
    {title:'Who gets which worker ID?', scale:'Autoscaling fleet', hot:['snow'], breaks:'<p>Containers come and go. If two instances are set up with the same worker number, they make <b>duplicate IDs</b> in the same millisecond.</p>', fix:'<p>When an instance starts, it <b>leases</b> a worker number from a coordinator (a ZooKeeper temporary node or an etcd lease). It stops making IDs if it loses the lease, and the number is freed when the instance dies.</p>', before:{lat:.01, err:.2, load:10}, after:{lat:.01, err:0, load:10}, flow:[['snow', 'zk', 'lease worker 42']], lesson:['distributed-locks']},
    {title:'The clock jumps backwards', scale:'Real-world clocks', down:['snow'], breaks:'<p>A time-sync (NTP) correction moves a server’s clock back by 300 ms. The generator now reuses timestamps it has already used, so duplicates are possible.</p>', fix:'<p>The generator remembers the last timestamp. If the clock goes backwards, it <b>waits</b> (for a small jump) or <b>refuses and raises an alert</b> (for a large one). Set time sync to <b>slew</b>, which means adjust slowly instead of jumping, and watch the clock offset.</p>', before:{lat:.01, err:.05, load:10}, after:{lat:.01, err:0, load:10}, flow:[['snow', 'ntp', 'slew']], lesson:['clocks']}],
  flows:[
    {name:'Service starts and creates orders', steps:[
      {note:'When it starts, the instance leases a free worker number from the coordinator. The lease is a temporary node that disappears if the instance dies.', flow:[['svc', 'snow', 'init'], ['snow', 'zk', 'lease']]},
      {note:'Each order gets its ID locally from the current time in ms since the epoch, the worker number, and a sequence for that millisecond. There is no network call.', flow:[['svc', 'snow', 'nextId()'], ['snow', 'svc', '1863…']]},
      {note:'The order is saved with that ID. IDs grow with time, so the primary key index only adds at its end, which is cheap.', flow:[['svc', 'db', 'INSERT id=1863…']]}]}],
  breakIt:[
    {label:'Coordinator down', kill:['zk'], verdict:'survives', text:'Running instances keep their worker numbers and carry on making IDs. New instances cannot start making IDs until it recovers, so autoscaling pauses.'},
    {label:'Clock steps back 2 s', hot:['snow'], verdict:'degrades', text:'The generator refuses to give IDs, and raises an alert, until its clock passes the last timestamp it used. Requests to that instance fail or go elsewhere, instead of risking duplicates.'},
    {label:'Kill an instance', kill:['svc'], verdict:'survives', text:'Its lease expires, and the worker number can be reused after a safe wait. Other instances are not affected.'},
    {label:'Orders DB shard down', kill:['db'], verdict:'degrades', text:'Making IDs does not use the database at all. Only inserts into that shard fail.'}],
  dataModel:{lang:'text', title:'64-bit layout', code:`  0 | 41 bits: milliseconds since custom epoch | 10 bits: worker | 12 bits: sequence
  ^ sign bit unused, so IDs stay positive in signed BIGINT columns

  id = (ms - EPOCH) << 22 | worker << 12 | seq

CREATE TABLE orders (
  id          BIGINT PRIMARY KEY,      -- Snowflake ID: unique and time-ordered
  customer_id BIGINT NOT NULL,
  total_paise BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL     -- also recoverable from the ID
);`, notes:'Send IDs to JavaScript clients as strings. JSON numbers lose precision above 2⁵³.'},
  apis:[
    {m:'LIB', path:'idgen.nextId(): bigint', note:'A call inside the process, with no network, in about a microsecond.'},
    {m:'GET', path:'/v1/ids?count=100', note:'An optional HTTP service for clients that cannot include the library.', res:'{ "ids": ["186327438912659456", "186327438912659457"] }'},
    {m:'LIB', path:'idgen.decode(id)', res:'{ "timestamp": "2026-11-13T09:31:02.114Z", "worker": 42, "sequence": 3 }'}],
  algorithm:{title:'Snowflake bits', html:'<p>Watch the bits compose in the playground, then implement it, with sequence overflow and clock-rollback handling, in the code lab.</p>', pg:'snowflake', lab:'snowflake-id'},
  tradeoffs:[['Snowflake inside the process', 'No network hop, huge throughput and time order', 'Depends on clocks and on correct worker numbers'], ['64-bit IDs', 'Small indexes and a normal integer column', 'Few bits for time, worker and sequence, so plan the layout'], ['Worker numbers leased from a coordinator', 'No two workers share a number', 'One more dependency (needed only at start-up)'], ['Refuse when the clock goes back', 'Correctness over availability', 'That one instance is briefly unavailable']],
  alternatives:[['UUIDv4 (random, 128 bits)', 'No coordination at all, but it is 128 bits, has no time order and breaks up B-tree indexes'], ['UUIDv7 (RFC 9562)', 'A time-ordered 128-bit ID with random bits. A great default when 128 bits is fine'], ['ULID', 'Like UUIDv7, but as a string that sorts correctly'], ['A database sequence for each shard, with shard bits (Instagram)', 'The IDs are made inside Postgres, so ID making is tied to the database shard']],
  failures:[['The coordinator fails', 'Leases that exist keep working. New instances wait'], ['The clock goes back', 'Wait or refuse, and alert on the clock offset'], ['The sequence runs out inside one millisecond', 'Wait for the next millisecond (4,096 IDs a ms for each worker)'], ['The epoch runs out (after about 69 years)', 'Choose a recent custom start date and write it down']],
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
  twists:[{q:'Can you guarantee strict global order of IDs across machines?', a:'Not cheaply. Snowflake IDs are only roughly sorted, within the clock difference. Strict global order needs one sequencer or consensus, which is a bottleneck. Most systems accept rough order and use exact order only inside one entity.'}, {q:'You need IDs in 3 data centers. How do you split the bits?', a:'Give some bits to the data center, for example 5 bits for the data center and 5 for the machine (32 data centers × 32 machines). Or lease worker numbers from one global coordinator with a range for each data center. Keep the timestamp first so IDs still sort by time.'}, {q:'Invoices must be sequential with no gaps, by law. Does Snowflake work?', a:'No. Snowflake IDs have gaps and are not strictly in sequence. Use a counter for each company and financial year, given out inside a database transaction, and accept the cost because the volume is small.'}, {q:'Two instances start at the same moment. How do you stop them taking the same worker number?', a:'Taking a number is a create-if-absent step in ZooKeeper or etcd, so only one instance can win each number. The other one gets an error and tries the next free number. It does not make IDs until it holds a lease.'}],
  real:[
    {co:'Flickr ticket servers', tier:'confirmed', text:'Flickr generated unique IDs with dedicated MySQL “ticket servers” using REPLACE INTO and auto-increment offset/step across two servers for redundancy.', src:'Flickr Engineering, “Ticket Servers: Distributed Unique Primary Keys on the Cheap” (2010)'},
    {co:'Twitter Snowflake', tier:'confirmed', text:'Twitter built Snowflake to generate roughly time-ordered, unique 64-bit IDs (timestamp, worker number, sequence) without coordination per ID.', src:'Twitter Engineering, “Announcing Snowflake” (2010)'},
    {co:'Instagram', tier:'confirmed', text:'Instagram generated 64-bit IDs inside sharded PostgreSQL using 41 bits of time, 13 bits of logical shard ID and 10 bits of per-shard sequence.', src:'Instagram Engineering, “Sharding & IDs at Instagram” (2012)'},
    {co:'UUIDv7', tier:'confirmed', text:'RFC 9562 (2024) defines UUID version 7: a 48-bit Unix millisecond timestamp plus random bits, giving time-ordered 128-bit UUIDs.', src:'IETF RFC 9562'}],
  sources:['Flickr Engineering (2010)', 'Twitter Engineering: Snowflake (2010)', 'Instagram Engineering (2012)', 'IETF RFC 9562: UUIDs', 'Kleppmann, Designing Data-Intensive Applications, ch. 8 (unreliable clocks)']
});
})();
