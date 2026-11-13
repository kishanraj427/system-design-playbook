/* =====================================================================
   PART 14 · PROJECTS (engine + beginner projects)
   #/page/projects            → 24 projects grouped by level
   #/page/projects/<id>       → one project walked through 17 stages:
     requirement → FR → NFR → estimation → entities → APIs → HLD →
     component responsibilities → tech choices → trade-offs → v1 build →
     bottlenecks → scaling problems → improvements → failure scenarios →
     observability → final review
   Code samples: TypeScript/Node + SQL.
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, esc} = SDA.u; const ui = SDA.ui; const h = SDA.h; const Store = SDA.store;
const frag = html => document.createRange().createContextualFragment(html);
SDA.projects = SDA.projects || new Map();
const LV = {beginner:{label:'Beginner', icon:'🌱'}, intermediate:{label:'Intermediate', icon:'🧱'}, advanced:{label:'Advanced', icon:'🚀'}};
const FIELDS = ['req', 'fr', 'nfr', 'est', 'entities', 'apis', 'hld', 'components', 'tech', 'tradeoffs', 'v1', 'bottlenecks', 'scaling', 'improvements', 'failures', 'observability', 'review'];
const STAGES = [['req', '1 · Requirement'], ['fr', '2 · Functional requirements'], ['nfr', '3 · Non-functional requirements'], ['est', '4 · Estimation'], ['entities', '5 · Entities (data model)'], ['apis', '6 · APIs'], ['hld', '7 · High-level design'], ['components', '8 · Component responsibilities'], ['tech', '9 · Tech choices'], ['tradeoffs', '10 · Trade-offs'], ['v1', '11 · Build v1'], ['bottlenecks', '12 · Bottlenecks'], ['scaling', '13 · Scaling problems'], ['improvements', '14 · Improvements'], ['failures', '15 · Failure scenarios'], ['observability', '16 · Observability'], ['review', '17 · Final review']];
SDA.PROJECT_STAGES = STAGES;
SDA.addKind('project', p => { ['id', 'level', 'title'].concat(FIELDS).forEach(k => { const v = p[k]; if (v == null || (Array.isArray(v) && !v.length)) throw new Error('project ' + (p.id || '?') + ' needs ' + k); }); SDA.projects.set(p.id, p); });
SDA.searchProviders.push(() => [...SDA.projects.values()].map(p => ({kind:'Projects', icon:p.icon || '🛠️', title:p.title, sub:'Project · ' + LV[p.level].label + ' · 17 stages', href:'#/page/projects/' + p.id, kw:(p.tags || []).join(' ')})));
SDA.statProviders.push({label:'Projects', count:() => SDA.projects.size});
const crumbs = list => el('nav', {class:'crumbs', 'aria-label':'Breadcrumb', html:list.map(([href, t]) => href ? `<a href="${href}">${esc(t)}</a>` : `<span aria-current="page">${esc(t)}</span>`).join('<span aria-hidden="true">/</span>')});
const stKey = id => 'sda:project-stages:' + id;
const getSt = id => { try { return JSON.parse(localStorage.getItem(stKey(id)) || '{}'); } catch(e){ return {}; } };
const setSt = (id, v) => { try { localStorage.setItem(stKey(id), JSON.stringify(v)); } catch(e){} };
const prose = html => el('div', {class:'prose'}, frag(html));

function renderStage(k, p){
  const v = p[k];
  switch (k){
    case 'req': return prose(`<p>${v}</p>`);
    case 'fr': case 'nfr': case 'bottlenecks': case 'improvements': case 'review': return prose(h.list(v));
    case 'est': return prose(h.table(['Quantity', 'Estimate', 'How'], v.map(([a, b, c]) => [a, `<b>${b}</b>`, c]), []));
    case 'entities': return prose(h.code('sql', v.code, v.title || 'schema.sql') + (v.notes ? `<p>${v.notes}</p>` : ''));
    case 'apis': return prose(h.table(['Endpoint', 'Purpose'], v.list.map(([a, b]) => [`<code>${esc(a)}</code>`, b]), []) + (v.code ? h.code('ts', v.code, v.title || 'api.ts') : ''));
    case 'hld': { const box = el('div'); if (v.text) box.append(prose(`<p>${v.text}</p>`)); const d = el('div'); box.append(d); SDA.miniDiagram(d, v.diagram, p.title + ': high-level design'); return box; }
    case 'components': return prose(h.table(['Component', 'Responsibility'], v.map(([a, b]) => [`<b>${a}</b>`, b]), []));
    case 'tech': return prose(h.table(['Choice', 'Why'], v.map(([a, b]) => [`<b>${a}</b>`, b]), []));
    case 'tradeoffs': return prose(h.table(['Decision', 'Why', 'What you give up'], v, []));
    case 'v1': return prose(`<p>${v.text}</p>` + h.code(v.lang || 'ts', v.code, v.title || 'v1.ts'));
    case 'scaling': return prose(h.table(['Problem at scale', 'Fix'], v, []));
    case 'failures': return prose(h.table(['If this fails…', 'The system…'], v, []));
    case 'observability': return prose(`<div class="grid c2"><div class="card"><b>Metrics</b>${h.list(v.metrics)}</div><div class="card"><b>Alerts</b>${h.list(v.alerts)}</div></div>` + (v.dash ? `<p><b>Dashboard:</b> ${v.dash}</p>` : ''));
  }
  return el('div');
}
function renderList(ctx){
  const c = ctx.content; ctx.wide = true;
  c.append(crumbs([['#/', 'Home'], [null, 'Projects']]), el('h1', {class:'page-title'}, '🛠️ Projects: build it stage by stage'),
    el('p', {class:'lead'}, '24 systems, each walked through the same 17 stages a real design goes through, from the first requirement to a final review, with TypeScript/Node and SQL samples. Tick stages off as you build your own version.'));
  c.append(prose(`<p class="lab-hint">Stages: ${STAGES.map(s => s[1].replace(/^\d+ · /, '')).join(' → ')}</p>`));
  Object.keys(LV).forEach(lv => {
    const list = [...SDA.projects.values()].filter(p => p.level === lv); if (!list.length) return;
    c.append(el('div', {class:'sect-h'}, el('div', null, el('h2', null, `${LV[lv].icon} ${LV[lv].label}`), el('p', null, `${list.length} projects`))));
    const g = el('div', {class:'grid c3'});
    list.forEach(p => { const n = Object.keys(getSt(p.id)).length; g.append(el('a', {class:'card glow', href:'#/page/projects/' + p.id}, el('div', {class:'row', style:{justifyContent:'space-between'}}, el('span', {class:'ico-lg', 'aria-hidden':'true'}, p.icon || '🛠️'), el('span', {class:'chip', style:n === 17 ? {color:'var(--ok)'} : {}}, n === 17 ? '✓ built' : `${n}/17 stages`)), el('b', {style:{display:'block', marginTop:'8px', color:'var(--text)', fontSize:'16px'}}, p.title), el('p', {class:'muted', style:{margin:'6px 0 0', fontSize:'14px'}}, p.tagline || ''))); });
    c.append(g);
  });
}
function renderOne(ctx, p){
  const c = ctx.content; ctx.title = p.title; ctx.track = {kind:'Project', title:p.title, icon:p.icon || '🛠️'};
  c.append(crumbs([['#/', 'Home'], ['#/page/projects', 'Projects'], [null, p.title]]));
  c.append(el('div', {class:'row', style:{marginTop:'12px', flexWrap:'wrap'}}, el('span', {class:'chip lvl'}, `${LV[p.level].icon} ${LV[p.level].label}`), ...(p.tags || []).map(t => el('span', {class:'chip'}, t))));
  c.append(el('h1', {class:'page-title'}, `${p.icon || '🛠️'} ${p.title}`));
  if (p.tagline) c.append(el('p', {class:'lead'}, p.tagline));
  let st = getSt(p.id); const prog = el('p', {class:'lab-hint'});
  const sync = () => { prog.textContent = `${Object.keys(st).length} of 17 stages ticked off.`; };
  const nav = el('div', {class:'pill-row', style:{margin:'10px 0 4px'}}, ...STAGES.map(([k, t]) => el('a', {class:'chip', href:'#stage-' + k}, t.replace(/^(\d+) · /, '$1 '))));
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) t.scrollIntoView({behavior:SDA.reduced ? 'auto' : 'smooth', block:'start'}); }));
  c.append(nav, prog);
  STAGES.forEach(([k, t]) => {
    const cb = el('input', {type:'checkbox', 'aria-label':'Mark stage done: ' + t}); cb.checked = !!st[k];
    cb.addEventListener('change', () => { if (cb.checked) st[k] = 1; else delete st[k]; setSt(p.id, st); sync(); });
    c.append(el('h2', {id:'stage-' + k, style:{margin:'28px 0 8px', display:'flex', alignItems:'center', gap:'10px', scrollMarginTop:'80px'}}, el('label', {class:'check', style:{display:'flex', alignItems:'center', gap:'10px'}}, cb, el('span', null, t))));
    c.append(renderStage(k, p));
  });
  const refs = (p.refs || []).map(r => SDA.resolve(r)).filter(Boolean);
  if (refs.length) c.append(el('h3', {style:{margin:'24px 0 8px'}}, '📚 Learn the pieces'), el('div', {class:'pill-row'}, ...refs.map(r => el('a', {class:'chip', href:r.href}, `${r.icon || ''} ${r.title}`))));
  const all = [...SDA.projects.values()], i = all.indexOf(p), prev = all[i - 1], next = all[i + 1];
  c.append(el('div', {class:'row', style:{justifyContent:'space-between', marginTop:'28px', flexWrap:'wrap', gap:'8px'}}, prev ? el('a', {class:'btn sm ghost', href:'#/page/projects/' + prev.id}, '← ' + prev.title) : el('span'), next ? el('a', {class:'btn sm', href:'#/page/projects/' + next.id}, next.title + ' →') : el('span')));
  sync();
}
SDA.register({kind:'page', id:'projects', icon:'🛠️', title:'Projects', summary:'24 systems built through 17 stages each',
  render(ctx){ const p = ctx.args[0] && SDA.projects.get(ctx.args[0]); if (ctx.args[0] && !p){ ctx.content.append(el('div', {class:'empty'}, 'Project not found. ', el('a', {href:'#/page/projects'}, 'All projects →'))); return; } p ? renderOne(ctx, p) : renderList(ctx); }});
SDA.register({kind:'nav', label:'Projects', href:'#/page/projects', icon:'🛠️', order:5, group:'explore', desc:'24 systems through 17 stages each', count:() => SDA.projects.size});

/* =========================== BEGINNER PROJECTS =========================== */
const P = def => SDA.register(Object.assign({kind:'project'}, def));
P({id:'p-url-shortener', level:'beginner', icon:'🔗', title:'URL shortener', tagline:'Turn long links into short ones and redirect billions of clicks.', tags:['base62', 'caching', 'read-heavy'],
  req:'Build a service that turns a long URL into a short link (<code>sho.rt/aZ3kQ</code>), redirects visitors to the original, and shows click counts to the link’s owner.',
  fr:['Create a short link for a long URL, optionally with a custom alias and expiry', 'Redirect <code>GET /{code}</code> to the original URL', 'Show the owner click counts per day', 'Delete or disable a link'],
  nfr:['Redirect p99 under 50 ms', 'Links never collide and never silently change target', '99.9% availability for redirects (creation can degrade)', 'Abuse protection: no phishing or malware redirects'],
  est:[['New links', '1M/day ≈ 12/s', '1M ÷ 86,400'], ['Redirects', '100M/day ≈ 1,200/s avg, 6K/s peak', '100:1 read/write; peak ×5'], ['Storage', '≈ 1 TB over 5 years', '1M × 365 × 5 × ~500 B'], ['Code length', '7 chars base62', '62⁷ ≈ 3.5 trillion codes']],
  entities:{code:`CREATE TABLE links (
  code        VARCHAR(10) PRIMARY KEY,
  long_url    TEXT        NOT NULL,
  owner_id    BIGINT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  disabled    BOOLEAN     NOT NULL DEFAULT false
);
CREATE TABLE click_daily (
  code  VARCHAR(10) REFERENCES links(code),
  day   DATE,
  clicks BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (code, day)
);`, notes:'The redirect path needs only <code>code → long_url</code>, a perfect key-value lookup. Clicks are aggregated per day, not stored per click.'},
  apis:{list:[['POST /api/links', 'Create a link {long_url, alias?, expires_at?} → {code}'], ['GET /{code}', '301/302 redirect to the long URL'], ['GET /api/links/{code}/stats', 'Daily click counts for the owner'], ['DELETE /api/links/{code}', 'Disable a link']], code:`app.post('/api/links', auth, async (req, res) => {
  const { long_url, alias } = req.body;
  if (!isSafeHttpUrl(long_url)) return res.status(400).json({ error: 'invalid url' });
  const code = alias ?? base62(await nextId());          // counter-based: no collisions
  await db.query('INSERT INTO links(code, long_url, owner_id) VALUES ($1,$2,$3)', [code, long_url, req.user.id]);
  res.status(201).json({ code, short_url: \`https://sho.rt/\${code}\` });
});`},
  hld:{text:'Writes go to the database through the API; redirects are served from a cache in front of the database. Click events are counted asynchronously so redirects stay fast.',
    diagram:{n:[['u', 'client', 'Visitor', '', 0, 1], ['lb', 'lb', 'Load balancer', '', 1, 1], ['app', 'service', 'Link service', 'stateless', 2, 1], ['cache', 'cache', 'Redis', 'code → url', 3, 0], ['db', 'db', 'Postgres', 'links', 3, 2], ['q', 'queue', 'Click events', '', 4, 1]], e:'u>lb lb>app app>cache app>db app>q', f:[['A redirect checks Redis first; a miss reads Postgres and fills the cache.', 'u>lb:GET /aZ3kQ|lb>app|app>cache:hit|app>db:miss only'], ['The click is recorded asynchronously.', 'app>q:click aZ3kQ']]}},
  components:[['Load balancer', 'TLS termination, health checks, spreads traffic'], ['Link service', 'Validate and create links, generate codes, serve redirects'], ['Redis', 'Hot code → URL mappings (LRU, TTL)'], ['Postgres', 'Source of truth for links and daily counts'], ['Click consumer', 'Aggregates click events into click_daily']],
  tech:[['Postgres', 'Simple, durable, unique constraint on code'], ['Redis', 'Sub-millisecond lookups for the 100:1 read load'], ['Base62 of a counter', 'Short, collision-free codes without retries'], ['Kafka or a simple queue', 'Decouple click counting from redirects']],
  tradeoffs:[['302 vs 301', '302 lets you count every click and change targets', 'More traffic hits you; 301 is cached by browsers'], ['Counter-based codes', 'No collisions, compact', 'Sequential codes are guessable (add a shuffle/encryption step)'], ['Async click counting', 'Fast redirects', 'Counts lag by seconds']],
  v1:{text:'The first version: one Node service, Postgres, an in-process LRU cache, and synchronous click increments. It handles hundreds of redirects per second.', code:`import express from 'express';
import { LRUCache } from 'lru-cache';
const cache = new LRUCache<string, string>({ max: 100_000 });
const app = express();

app.get('/:code', async (req, res) => {
  const code = req.params.code;
  let url = cache.get(code);
  if (!url) {
    const r = await db.query('SELECT long_url FROM links WHERE code=$1 AND NOT disabled AND (expires_at IS NULL OR expires_at > now())', [code]);
    if (!r.rowCount) return res.status(404).send('Not found');
    url = r.rows[0].long_url; cache.set(code, url);
  }
  db.query('INSERT INTO click_daily(code, day, clicks) VALUES ($1, current_date, 1) ON CONFLICT (code, day) DO UPDATE SET clicks = click_daily.clicks + 1', [code])
    .catch(() => {});                                   // v1: best effort, synchronous to the DB
  res.redirect(302, url);
});`},
  bottlenecks:['Every click writes to the database: the click upsert becomes the bottleneck long before lookups do', 'An in-process cache per server has a low hit rate across many servers', 'A single ID counter is a single point of failure for creation'],
  scaling:[['Click writes', 'Send click events to a queue; a consumer aggregates in memory and upserts every few seconds'], ['Cache hit rate', 'Shared Redis; cache-aside with TTL; preload viral links'], ['ID generation', 'Hand out ID ranges (e.g. 10,000 at a time) to each server, or a Snowflake-style generator'], ['Read scaling', 'Read replicas behind the cache; the cache absorbs >95% of reads']],
  improvements:['Custom domains per customer', 'Malware/phishing scanning on creation and periodically (Safe Browsing-style APIs)', 'Unique visitors with HyperLogLog per link', 'QR codes and link previews', 'Geographic redirects (CDN edge redirects for the hottest links)'],
  failures:[['Redis down', 'Fall back to Postgres (read replicas); redirects slower but working'], ['Postgres primary down', 'Redirects continue from cache and replicas; creation returns 503 until failover'], ['Queue down', 'Buffer clicks locally or drop them (counts are best effort); redirects unaffected'], ['A link points to malware', 'Disable flag checked on redirect; cache invalidated immediately']],
  observability:{metrics:['Redirect latency p50/p99 and rate', 'Cache hit ratio', '404 rate (broken or scanned codes)', 'Queue lag for click events', 'Creation rate per user (abuse)'], alerts:['Redirect p99 > 100 ms for 5 min', 'Cache hit ratio < 80%', 'Click consumer lag > 5 min', '5xx rate > 0.5%'], dash:'Redirects/s, latency percentiles, hit ratio, top links, creation rate.'},
  review:['Redirect path touches only cache (and rarely the DB): ✓', 'Codes are unique by construction; aliases checked by the primary key: ✓', 'Abuse: rate limits on creation, URL scanning, disable switch: ✓', 'Analytics decoupled from redirects: ✓', 'Next risk: guessable sequential codes; add a reversible shuffle of the counter before base62'],
  refs:['case:url-shortener', 'l:cache-strategies', 'l:unique-ids']});
P({id:'p-pastebin', level:'beginner', icon:'📋', title:'Pastebin', tagline:'Share text snippets with expiry, syntax highlighting and abuse controls.', tags:['object storage', 'expiry', 'cdn'],
  req:'Build a service where users paste text or code, get a link, and share it. Pastes can expire, be private (unlisted), and be viewed many times.',
  fr:['Create a paste (up to 10 MB) with optional expiry and language', 'View a paste by link; raw and highlighted views', 'Unlisted pastes are not searchable or listed', 'Owner can delete a paste'],
  nfr:['View p99 under 100 ms', 'Pastes never served after expiry', 'Durable: no loss of unexpired pastes', 'Abuse handling: leaked secrets, malware, spam'],
  est:[['New pastes', '500K/day ≈ 6/s', ''], ['Views', '10M/day ≈ 115/s, peaks 1K/s', '20:1 read/write'], ['Average size', '10 KB', 'most small, a few MB'], ['Storage', '≈ 1.8 TB/year', '500K × 10 KB × 365']],
  entities:{code:`CREATE TABLE pastes (
  id          VARCHAR(10) PRIMARY KEY,      -- random base62, unguessable
  owner_id    BIGINT,
  title       TEXT,
  language    TEXT,
  size_bytes  INT NOT NULL,
  blob_key    TEXT NOT NULL,                -- object storage key (content lives there)
  visibility  TEXT NOT NULL DEFAULT 'unlisted',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  deleted     BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX ON pastes (expires_at) WHERE expires_at IS NOT NULL;`, notes:'Metadata in Postgres, content in object storage: rows stay small and content can be served by a CDN.'},
  apis:{list:[['POST /api/pastes', 'Create {content, language?, expires_in?, visibility} → {id, url}'], ['GET /p/{id}', 'HTML view with highlighting'], ['GET /raw/{id}', 'Raw text (cacheable until expiry)'], ['DELETE /api/pastes/{id}', 'Owner deletes']], code:`app.post('/api/pastes', rateLimit({ perMinute: 10 }), async (req, res) => {
  const { content, language, expires_in, visibility = 'unlisted' } = req.body;
  if (Buffer.byteLength(content) > 10 * 1024 * 1024) return res.status(413).end();
  const id = randomBase62(8);                              // 62^8 ≈ 2×10^14: unguessable
  const blobKey = \`pastes/\${id}\`;
  await storage.put(blobKey, content, { contentType: 'text/plain; charset=utf-8' });
  await db.query('INSERT INTO pastes(id, owner_id, language, size_bytes, blob_key, visibility, expires_at) VALUES ($1,$2,$3,$4,$5,$6, now() + $7::interval)',
    [id, req.user?.id ?? null, language, Buffer.byteLength(content), blobKey, visibility, expires_in ?? null]);
  scanQueue.send({ id });                                  // async secret / malware scan
  res.status(201).json({ id, url: \`https://paste.example/p/\${id}\` });
});`},
  hld:{text:'Metadata goes to Postgres, content to object storage; raw views are served through a CDN with a cache lifetime capped at the paste’s expiry. A sweeper deletes expired pastes and a scanner checks new ones.',
    diagram:{n:[['u', 'client', 'User', '', 0, 1], ['cdn', 'cdn', 'CDN', 'raw views', 1, 0], ['app', 'service', 'Paste service', '', 1, 1], ['db', 'db', 'Postgres', 'metadata', 2, 2], ['s3', 'db', 'Object storage', 'content', 2, 0], ['q', 'queue', 'Scan queue', '', 3, 1], ['scan', 'service', 'Scanner + sweeper', '', 4, 1]], e:'u>cdn u>app cdn>s3 app>db app>s3 app>q q>scan scan>db~-0.1', f:[['Create: content to storage, metadata to the DB, scan queued.', 'u>app:POST paste|app>s3|app>db|app>q'], ['Views of raw content come from the CDN.', 'u>cdn:GET /raw/x7Kd|cdn>s3:miss']]}},
  components:[['Paste service', 'Validation, ids, metadata, HTML rendering'], ['Object storage', 'Paste content (cheap, durable)'], ['CDN', 'Raw content delivery with TTL ≤ time to expiry'], ['Scanner', 'Detects leaked keys/tokens and malware; disables pastes'], ['Sweeper', 'Deletes expired pastes from storage and DB']],
  tech:[['Postgres', 'Metadata, expiry index, ownership'], ['S3-compatible storage', 'Blob content scales independently'], ['A CDN', 'Viral pastes served from the edge'], ['Server-side highlighting (cached)', 'Fast first paint; no heavy client JS']],
  tradeoffs:[['Content in object storage', 'Small DB, CDN-friendly', 'Two writes per create'], ['Random ids', 'Unguessable unlisted links', 'Longer than sequential ids'], ['CDN caching with expiry', 'Fast views', 'Deletion must purge the CDN']],
  v1:{text:'v1 keeps content in Postgres (TEXT column) and renders on each view; a cron job deletes expired rows every minute.', code:`app.get('/raw/:id', async (req, res) => {
  const r = await db.query(
    "SELECT content, expires_at FROM pastes WHERE id=$1 AND NOT deleted AND (expires_at IS NULL OR expires_at > now())", [req.params.id]);
  if (!r.rowCount) return res.status(404).send('Not found or expired');
  const { content, expires_at } = r.rows[0];
  const maxAge = expires_at ? Math.max(0, Math.floor((+expires_at - Date.now()) / 1000)) : 86400;
  res.set('Cache-Control', \`public, max-age=\${Math.min(maxAge, 86400)}\`).type('text/plain').send(content);
});
// cron every minute (v1)
setInterval(() => db.query('DELETE FROM pastes WHERE expires_at < now()'), 60_000);`},
  bottlenecks:['Large pastes in Postgres bloat tables and backups', 'Rendering highlighting on every view burns CPU', 'Viral pastes hammer the app servers'],
  scaling:[['Big content', 'Move content to object storage; keep metadata in Postgres'], ['Rendering CPU', 'Cache rendered HTML per paste id (until expiry)'], ['Viral views', 'CDN with TTL capped at expiry; purge on delete'], ['Expiry deletes', 'Batch deletes by expiry index; lifecycle rules in storage']],
  improvements:['Secret scanning (API keys, tokens) with automatic disable and owner notification', 'Password-protected pastes', 'Edit history (versions as new blobs)', 'Burn-after-reading pastes'],
  failures:[['Object storage slow', 'Serve cached copies from CDN; creation retries'], ['Scanner backlog', 'New pastes stay viewable; scanning catches up (or hold public ones until scanned)'], ['Sweeper stops', 'Expired pastes are still blocked by the expiry check on read; storage grows until it resumes']],
  observability:{metrics:['Create and view rates, p99 latency', 'CDN hit ratio', 'Scanner queue lag and detections', 'Expired-but-not-deleted count'], alerts:['View p99 > 200 ms', 'Scanner lag > 15 min', 'Spike in creations from one IP or ASN'], dash:'Traffic, latency, CDN offload, abuse detections.'},
  review:['Expiry enforced on read and by deletion: ✓', 'Content off the database: ✓', 'Abuse: rate limits + scanning + disable: ✓', 'Next risk: CDN purges on delete must be reliable (track purge failures)'],
  refs:['case:pastebin', 'l:storage-types', 'l:cdn']});
P({id:'p-blog', level:'beginner', icon:'✍️', title:'Blogging platform', tagline:'Write, publish and serve articles fast, with comments and search.', tags:['cms', 'caching', 'search', 'static rendering'],
  req:'Build a multi-author blogging platform: authors write drafts in Markdown, publish them, readers browse by tag and author, comment, and search.',
  fr:['Create, edit and publish posts (Markdown, images)', 'Home page, tag pages, author pages with pagination', 'Comments with moderation', 'Search posts by text'],
  nfr:['Article pages p99 under 200 ms worldwide', 'Published posts are never lost; drafts autosave', 'SEO-friendly (server-rendered HTML)', 'Survive a post going viral'],
  est:[['Authors', '50K', ''], ['Posts', '2K new/day; 5M total', ''], ['Page views', '5M/day ≈ 60/s avg, 2K/s viral peak', ''], ['Storage', '≈ 50 GB text + 5 TB images', '5M × 10 KB; images in object storage']],
  entities:{code:`CREATE TABLE users  (id BIGSERIAL PRIMARY KEY, handle TEXT UNIQUE NOT NULL, name TEXT, bio TEXT);
CREATE TABLE posts (
  id          BIGSERIAL PRIMARY KEY,
  author_id   BIGINT NOT NULL REFERENCES users(id),
  slug        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body_md     TEXT NOT NULL,
  body_html   TEXT,                       -- rendered on publish
  status      TEXT NOT NULL DEFAULT 'draft',  -- draft | published
  published_at TIMESTAMPTZ,
  search      TSVECTOR,
  UNIQUE (author_id, slug)
);
CREATE TABLE post_tags (post_id BIGINT REFERENCES posts(id), tag TEXT, PRIMARY KEY (post_id, tag));
CREATE TABLE comments (id BIGSERIAL PRIMARY KEY, post_id BIGINT REFERENCES posts(id), author_id BIGINT, body TEXT, status TEXT DEFAULT 'visible', created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX ON posts USING GIN (search);
CREATE INDEX ON posts (published_at DESC) WHERE status = 'published';`, notes:'Render Markdown to HTML once at publish time, not on every view.'},
  apis:{list:[['POST /api/posts', 'Create a draft'], ['PUT /api/posts/{id}', 'Autosave draft'], ['POST /api/posts/{id}/publish', 'Render, publish, purge caches'], ['GET /@{handle}/{slug}', 'Server-rendered article'], ['GET /api/search?q=', 'Full-text search']], code:`app.post('/api/posts/:id/publish', auth, async (req, res) => {
  const post = await posts.getOwned(req.params.id, req.user.id);
  const html = sanitize(markdownToHtml(post.body_md));     // never trust author HTML
  await db.query(\`UPDATE posts SET body_html=$2, status='published', published_at=coalesce(published_at, now()),
                   search = to_tsvector('english', title || ' ' || body_md) WHERE id=$1\`, [post.id, html]);
  await cdn.purge([\`/@\${req.user.handle}/\${post.slug}\`, '/', ...post.tags.map(t => \`/tag/\${t}\`)]);
  res.json({ ok: true });
});`},
  hld:{text:'Pages are server-rendered from Postgres and cached at the CDN; publishing purges affected pages. Images go to object storage. Search uses Postgres full-text first, a search engine later.',
    diagram:{n:[['r', 'client', 'Reader', '', 0, 0], ['a', 'client', 'Author', '', 0, 2], ['cdn', 'cdn', 'CDN', 'HTML + images', 1, 0], ['app', 'service', 'Blog app', 'SSR', 1, 2], ['db', 'db', 'Postgres', 'posts, FTS', 2, 2], ['s3', 'db', 'Object storage', 'images', 2, 0], ['mod', 'queue', 'Comment moderation', '', 3, 2]], e:'r>cdn cdn>app cdn>s3 a>app app>db app>s3 app>mod~0.2', f:[['Readers mostly hit the CDN; a miss renders the page from Postgres.', 'r>cdn:GET article|cdn>app:miss|app>db'], ['Publishing renders HTML once, stores it and purges cached pages.', 'a>app:publish|app>db|app>cdn:purge']]}},
  components:[['Blog app', 'Auth, editor API, server-side rendering, publish workflow'], ['Postgres', 'Users, posts, tags, comments, full-text index'], ['Object storage + CDN', 'Images and cached HTML pages'], ['Moderation queue', 'Spam filtering and review of comments']],
  tech:[['Node (Next.js-style SSR)', 'SEO and fast first paint'], ['Postgres full-text search', 'Good enough for millions of posts; no extra system in v1'], ['CDN with purge API', 'Absorbs viral traffic'], ['Markdown + HTML sanitiser', 'Safe rendering of author content']],
  tradeoffs:[['Render on publish', 'Cheap views', 'Template changes need re-rendering old posts'], ['Postgres FTS before Elasticsearch', 'One system to run', 'Weaker relevance and typo tolerance'], ['CDN-cached HTML', 'Handles viral spikes', 'Purges needed on edits and new comments']],
  v1:{text:'v1: one server-rendered app with Postgres; pages cached in memory for 60 s; images on local disk.', code:`app.get('/@:handle/:slug', async (req, res) => {
  const key = req.path; const hit = pageCache.get(key);
  if (hit) return res.type('html').send(hit);
  const r = await db.query(\`SELECT p.title, p.body_html, p.published_at, u.name FROM posts p JOIN users u ON u.id = p.author_id
                            WHERE u.handle=$1 AND p.slug=$2 AND p.status='published'\`, [req.params.handle, req.params.slug]);
  if (!r.rowCount) return res.status(404).send('Not found');
  const html = renderArticle(r.rows[0]);
  pageCache.set(key, html, { ttl: 60_000 });
  res.type('html').send(html);
});`},
  bottlenecks:['Viral posts: every server re-renders and queries per cache miss', 'Images on app servers’ disks don’t scale or survive server loss', 'Comment spam floods moderation'],
  scaling:[['Viral reads', 'CDN caching of full pages; purge on publish/edit'], ['Images', 'Object storage + CDN, resized variants'], ['Search relevance', 'Move to Elasticsearch/OpenSearch fed from post updates'], ['Comments', 'Load comments client-side separately so article pages stay cacheable']],
  improvements:['Scheduled publishing', 'RSS/Atom feeds and newsletters', 'Draft collaboration (see the Google Docs case)', 'Analytics per post (async events)'],
  failures:[['Postgres down', 'Cached pages keep being served by the CDN; editing paused'], ['CDN purge fails', 'Retry purges; short TTL bounds staleness'], ['Spam wave', 'Rate limits per IP/account, CAPTCHA, hold comments for review']],
  observability:{metrics:['Page latency at origin and edge', 'CDN hit ratio', 'Publish success/failure', 'Comments flagged vs approved'], alerts:['Origin 5xx > 1%', 'CDN hit ratio < 85%', 'Purge failures'], dash:'Traffic by post, cache offload, editor errors, moderation backlog.'},
  review:['Reads served from cache; writes rare and simple: ✓', 'Author HTML sanitised: ✓', 'Comments isolated from article caching: ✓', 'Next: dedicated search when Postgres FTS relevance becomes a complaint'],
  refs:['l:cdn', 'l:cache-invalidation', 'l:inverted-index']});
P({id:'p-file-upload', level:'beginner', icon:'📤', title:'File upload service', tagline:'Upload large files reliably, scan them, and share download links.', tags:['multipart upload', 'pre-signed urls', 'virus scanning'],
  req:'Build a service that lets users upload files up to 5 GB from web and mobile, resumes interrupted uploads, scans files for malware, and shares download links that can expire.',
  fr:['Upload files up to 5 GB, resumable', 'List and download my files', 'Share a link with optional expiry and password', 'Delete files'],
  nfr:['Uploads survive network drops (resume, don’t restart)', 'App servers never proxy file bytes', 'Infected files never downloadable', 'Durability 11 nines (object storage)'],
  est:[['Uploads', '200K/day, average 50 MB', ''], ['Ingress', '≈ 10 TB/day ≈ 1 Gbps average', '200K × 50 MB'], ['Downloads', '1M/day', ''], ['Storage growth', '≈ 3.6 PB/year', 'before lifecycle deletion']],
  entities:{code:`CREATE TABLE files (
  id          UUID PRIMARY KEY,
  owner_id    BIGINT NOT NULL,
  name        TEXT NOT NULL,
  size_bytes  BIGINT,
  sha256      CHAR(64),
  storage_key TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'uploading',   -- uploading | scanning | ready | infected
  upload_id   TEXT,                                -- multipart upload id
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE shares (
  token       VARCHAR(22) PRIMARY KEY,             -- random, unguessable
  file_id     UUID REFERENCES files(id),
  expires_at  TIMESTAMPTZ,
  password_hash TEXT
);`, notes:'The status column is a small state machine: only <code>ready</code> files can be downloaded.'},
  apis:{list:[['POST /api/uploads', 'Start: returns file id + multipart upload id + part URLs'], ['POST /api/uploads/{id}/complete', 'Complete with part ETags; triggers scanning'], ['GET /api/files/{id}/download', 'Returns a short-lived pre-signed URL'], ['POST /api/files/{id}/shares', 'Create a share link']], code:`app.post('/api/uploads', auth, async (req, res) => {
  const { name, size } = req.body;
  if (size > 5 * 2 ** 30) return res.status(413).end();
  const id = randomUUID(), key = \`u/\${req.user.id}/\${id}\`;
  const { UploadId } = await s3.createMultipartUpload({ Bucket, Key: key });
  const parts = Math.ceil(size / PART_SIZE);                       // e.g. 16 MB parts
  const urls = await Promise.all(range(1, parts).map(n => presign('uploadPart', { Key: key, UploadId, PartNumber: n }, 3600)));
  await db.query("INSERT INTO files(id, owner_id, name, size_bytes, storage_key, upload_id) VALUES ($1,$2,$3,$4,$5,$6)", [id, req.user.id, name, size, key, UploadId]);
  res.json({ id, uploadId: UploadId, partUrls: urls });
});`},
  hld:{text:'Clients upload parts directly to object storage using pre-signed URLs; the API only coordinates. Completion triggers a scan; downloads use short-lived signed URLs.',
    diagram:{n:[['c', 'client', 'Client', 'web / mobile', 0, 1], ['api', 'service', 'Upload API', 'coordinates', 1, 1], ['db', 'db', 'Postgres', 'files, shares', 2, 2], ['s3', 'db', 'Object storage', 'multipart', 2, 0], ['q', 'queue', 'Scan queue', '', 3, 1], ['av', 'service', 'Scanner', 'antivirus', 4, 1]], e:'c>api c>s3~-0.3 api>db api>s3 api>q q>av av>db~-0.1 av>s3', f:[['The client gets part URLs and uploads parts straight to storage (in parallel, resumable).', 'c>api:start|c>s3:PUT parts 1..N'], ['Completion assembles the parts and queues a scan; the file becomes ready if clean.', 'c>api:complete|api>s3:complete multipart|api>q|q>av|av>db:ready']]}},
  components:[['Upload API', 'Auth, quotas, multipart orchestration, signed URLs'], ['Object storage', 'Stores parts and final objects; lifecycle rules'], ['Scanner workers', 'Download, scan, update status, quarantine'], ['Postgres', 'File metadata, state, shares']],
  tech:[['S3 multipart upload', 'Resumable, parallel, up to 5 TB objects'], ['Pre-signed URLs', 'Bytes never pass through app servers'], ['ClamAV-style scanner in workers', 'Isolated, autoscaled on queue depth'], ['Postgres', 'Transactional state machine for files']],
  tradeoffs:[['Direct-to-storage upload', 'Scales without app bandwidth', 'Validation happens after upload'], ['Scan before ready', 'No infected downloads', 'Files unavailable for minutes'], ['16 MB parts', 'Fewer requests, good throughput', 'More re-upload per failed part on bad networks']],
  v1:{text:'v1 streams uploads through the Node server to disk with a size limit; good for small files and a single server.', code:`import busboy from 'busboy';
app.post('/api/files', auth, (req, res) => {
  const bb = busboy({ headers: req.headers, limits: { fileSize: 100 * 2 ** 20 } });   // v1: 100 MB
  bb.on('file', (_field, stream, info) => {
    const id = randomUUID(), path = \`/data/\${id}\`; const hash = createHash('sha256');
    stream.on('data', d => hash.update(d)).pipe(createWriteStream(path)).on('finish', async () => {
      await db.query("INSERT INTO files(id, owner_id, name, storage_key, sha256, status) VALUES ($1,$2,$3,$4,$5,'scanning')",
        [id, req.user.id, info.filename, path, hash.digest('hex')]);
      res.status(201).json({ id });
    });
  });
  req.pipe(bb);
});`},
  bottlenecks:['App servers carry all upload bandwidth and disk', 'A dropped connection restarts multi-GB uploads', 'Synchronous scanning blocks requests'],
  scaling:[['Bandwidth', 'Pre-signed direct uploads to object storage'], ['Resumability', 'Multipart upload; client tracks completed parts and retries only failed ones'], ['Scanning', 'Queue + autoscaled scanner workers'], ['Abandoned uploads', 'Lifecycle rule aborts incomplete multipart uploads after 7 days']],
  improvements:['Content-hash dedupe within a user', 'Previews and thumbnails', 'Client-side encryption for sensitive files', 'Download acceleration via CDN for public shares'],
  failures:[['Client drops mid-upload', 'Resumes remaining parts using the same upload id'], ['Scanner down', 'Files stay in scanning; not downloadable; backlog drains later'], ['Storage region outage', 'Cross-region replication for important buckets; uploads retry later']],
  observability:{metrics:['Upload success rate and duration by size bucket', 'Part retry rate', 'Scan queue depth and age', 'Infected detections'], alerts:['Upload success < 98%', 'Scan backlog age > 30 min', 'Signed-URL error spike'], dash:'Uploads in flight, throughput, scan pipeline, storage growth.'},
  review:['No file bytes through app servers: ✓', 'Resumable uploads: ✓', 'Scan gate before download: ✓', 'Next risk: costs of storage growth; add lifecycle tiers and quotas'],
  refs:['l:storage-types', 'l:queues-pubsub-streams', 'case:dropbox']});
P({id:'p-auth', level:'beginner', icon:'🔑', title:'Authentication system', tagline:'Sign-up, login, sessions, password reset and MFA done safely.', tags:['security', 'sessions', 'jwt', 'mfa'],
  req:'Build the login system for a consumer app: email + password sign-up, login, sessions on web and mobile, password reset, optional two-factor authentication, and protection against credential stuffing.',
  fr:['Sign up with email verification', 'Log in and log out; stay logged in on mobile', 'Reset a forgotten password', 'Enable TOTP two-factor authentication', 'See and revoke active sessions'],
  nfr:['Passwords stored with a slow, salted hash', 'Login p99 under 300 ms (dominated by hashing)', 'Session revocation effective within a minute', 'Resistant to brute force and credential stuffing'],
  est:[['Users', '10M', ''], ['Logins', '1M/day; peak 100/s', ''], ['Token validations', '20K/s (every API call)', 'must be cheap'], ['Password hashing', '~100 ms CPU each', 'argon2id / bcrypt cost tuned']],
  entities:{code:`CREATE TABLE users (
  id             BIGSERIAL PRIMARY KEY,
  email          CITEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,              -- argon2id (salt + params embedded)
  email_verified BOOLEAN NOT NULL DEFAULT false,
  totp_secret    BYTEA,                      -- encrypted at rest
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  id           CHAR(43) PRIMARY KEY,          -- hash of the refresh token
  user_id      BIGINT REFERENCES users(id),
  device       TEXT, ip INET,
  created_at   TIMESTAMPTZ DEFAULT now(), last_seen TIMESTAMPTZ, revoked_at TIMESTAMPTZ
);
CREATE TABLE reset_tokens (token_hash CHAR(64) PRIMARY KEY, user_id BIGINT, expires_at TIMESTAMPTZ, used_at TIMESTAMPTZ);`, notes:'Store only hashes of tokens: a database leak must not let anyone log in.'},
  apis:{list:[['POST /auth/signup', 'Create account, send verification email'], ['POST /auth/login', 'Password (+ TOTP) → short-lived access token + refresh token'], ['POST /auth/refresh', 'Rotate refresh token, new access token'], ['POST /auth/logout', 'Revoke this session'], ['POST /auth/password-reset', 'Email a single-use reset link']], code:`app.post('/auth/login', loginLimiter, async (req, res) => {
  const { email, password, totp } = req.body;
  const u = await users.byEmail(email);
  const ok = u ? await argon2.verify(u.password_hash, password) : await argon2.verify(DUMMY_HASH, password); // same timing either way
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  if (u.totp_secret && !verifyTotp(decrypt(u.totp_secret), totp)) return res.status(401).json({ error: 'mfa required' });
  const refresh = randomToken(32);
  await db.query('INSERT INTO sessions(id, user_id, device, ip) VALUES ($1,$2,$3,$4)', [sha256(refresh), u.id, req.get('user-agent'), req.ip]);
  res.cookie('rt', refresh, { httpOnly: true, secure: true, sameSite: 'strict', path: '/auth' })
     .json({ access: signJwt({ sub: u.id }, { expiresIn: '10m' }) });
});`},
  hld:{text:'An auth service owns credentials and sessions. Other services validate short-lived signed access tokens locally (public key), so they never call the auth service per request; refresh tokens are stored (hashed) and revocable.',
    diagram:{n:[['c', 'client', 'App', '', 0, 1], ['gw', 'lb', 'API gateway', 'verifies JWT', 1, 1], ['auth', 'service', 'Auth service', '', 2, 0], ['db', 'db', 'Users DB', 'hashes, sessions', 3, 0], ['rl', 'cache', 'Rate limits', 'per IP / account', 3, 1], ['svc', 'service', 'Other services', '', 2, 2], ['mail', 'ext', 'Email provider', '', 4, 0]], e:'c>gw gw>auth gw>svc auth>db auth>rl auth>mail~0.2', f:[['Login checks rate limits, verifies the password hash and creates a session.', 'c>gw:POST /auth/login|gw>auth|auth>rl|auth>db'], ['Every other call carries the access token, verified at the gateway without calling auth.', 'c>gw:GET /orders (JWT)|gw>svc']]}},
  components:[['Auth service', 'Sign-up, login, MFA, token issuance, session management'], ['Users DB', 'Password hashes, sessions, reset tokens'], ['Gateway', 'Verifies access tokens with the public key'], ['Rate limiter', 'Throttles login attempts per IP, account and device'], ['Email provider', 'Verification and reset emails']],
  tech:[['argon2id', 'Memory-hard password hashing'], ['Short-lived JWT + rotating refresh tokens', 'Cheap validation and revocability'], ['Redis', 'Rate-limit counters'], ['TOTP (RFC 6238)', 'Standard authenticator apps']],
  tradeoffs:[['JWT access tokens', 'No DB lookup per request', 'Can’t revoke before expiry (keep them ~10 min)'], ['Server-side sessions only', 'Instant revocation', 'A lookup per request'], ['Strict login limits', 'Stops stuffing', 'Can lock out real users (use soft limits + CAPTCHA)']],
  v1:{text:'v1 uses server-side sessions in Postgres with a cookie; simple and instantly revocable.', code:`app.post('/login', async (req, res) => {
  const u = await users.byEmail(req.body.email);
  if (!u || !(await argon2.verify(u.password_hash, req.body.password))) return res.status(401).end();
  const sid = randomToken(32);
  await db.query('INSERT INTO sessions(id, user_id) VALUES ($1, $2)', [sha256(sid), u.id]);
  res.cookie('sid', sid, { httpOnly: true, secure: true, sameSite: 'lax' }).json({ ok: true });
});
const requireUser = async (req, res, next) => {
  const r = await db.query('SELECT user_id FROM sessions WHERE id=$1 AND revoked_at IS NULL', [sha256(req.cookies.sid ?? '')]);
  if (!r.rowCount) return res.status(401).end();
  req.userId = r.rows[0].user_id; next();
};`},
  bottlenecks:['Session lookup in Postgres on every request', 'Password hashing CPU during login spikes', 'Credential-stuffing bots overwhelm login'],
  scaling:[['Per-request lookups', 'Short-lived JWTs verified locally; refresh tokens stored'], ['Hashing CPU', 'Dedicated autoscaled auth instances; tune cost'], ['Bots', 'Rate limits per IP/ASN/account, breached-password checks, CAPTCHA after failures'], ['Multiple apps', 'Move to OAuth 2.0 / OIDC with an identity provider']],
  improvements:['Passkeys (WebAuthn)', 'Social login via OIDC', 'Device risk scoring', 'Audit log of security events visible to users'],
  failures:[['Auth service down', 'Existing access tokens keep working until expiry; new logins fail'], ['Email provider down', 'Queue and retry; let users resend'], ['Signing key leaked', 'Rotate keys (key ids in tokens), revoke sessions, force re-login']],
  observability:{metrics:['Login success/failure rates', 'Failures per IP/account', 'MFA adoption', 'Token refresh rate', 'Hash time p99'], alerts:['Login failure spike (stuffing)', 'Auth p99 > 1 s', 'Sudden drop in successful logins'], dash:'Logins, failures by reason, suspicious IPs, session counts.'},
  review:['Passwords hashed with argon2id; tokens stored hashed: ✓', 'Same response timing for unknown users: ✓', 'Revocation path for refresh tokens; access tokens short: ✓', 'Next: passkeys and OIDC'],
  refs:['l:password-hashing', 'l:sessions-vs-jwt', 'l:oauth-oidc-sso', 'l:authn-vs-authz']});
P({id:'p-catalog', level:'beginner', icon:'🏷️', title:'Product catalog', tagline:'Millions of products, browsed by category and filters, updated by sellers.', tags:['catalog', 'search', 'caching', 'cdc'],
  req:'Build the product catalog for an online store: sellers create products with variants (size, colour) and prices; shoppers browse categories, filter (brand, price, rating) and view product pages.',
  fr:['Sellers create and update products, variants, images and prices', 'Category pages with filters and sorting', 'Product detail page', 'Search by keyword'],
  nfr:['Product page p99 under 150 ms', 'Price changes visible within a minute', 'Catalog of 10M products; 100:1 read/write', 'Consistent prices between listing and checkout'],
  est:[['Products', '10M with 3 variants each', ''], ['Updates', '1M/day (mostly prices and stock)', ''], ['Page views', '50M/day ≈ 600/s, sale peaks 10K/s', ''], ['Data', '≈ 30 GB rows + images in object storage', '10M × ~3 KB']],
  entities:{code:`CREATE TABLE products (
  id          BIGSERIAL PRIMARY KEY,
  seller_id   BIGINT NOT NULL,
  title       TEXT NOT NULL,
  brand       TEXT,
  category_id INT NOT NULL,
  attributes  JSONB,                     -- category-specific (screen size, fabric…)
  status      TEXT NOT NULL DEFAULT 'active',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE variants (
  sku         TEXT PRIMARY KEY,
  product_id  BIGINT REFERENCES products(id),
  options     JSONB,                     -- {"size":"M","colour":"blue"}
  price_minor BIGINT NOT NULL, currency CHAR(3) NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE categories (id SERIAL PRIMARY KEY, parent_id INT, name TEXT, path TEXT);  -- 'electronics/phones'
CREATE INDEX ON products (category_id, status);`, notes:'JSONB attributes keep category-specific fields flexible; the search index gets a flattened copy for filtering.'},
  apis:{list:[['POST /seller/products', 'Create product with variants'], ['PATCH /seller/variants/{sku}', 'Update price/stock'], ['GET /c/{category}?brand=&price=&sort=', 'Category listing with facets'], ['GET /p/{id}', 'Product detail']], code:`app.get('/p/:id', async (req, res) => {
  const key = \`product:\${req.params.id}\`;
  const cached = await redis.get(key);
  if (cached) return res.json(JSON.parse(cached));
  const p = await catalog.loadProductWithVariants(req.params.id);   // 2 queries
  if (!p) return res.status(404).end();
  await redis.set(key, JSON.stringify(p), 'EX', 300);
  res.json(p);
});
// on any product/variant write: await redis.del(\`product:\${id}\`) and publish a change event`},
  hld:{text:'Postgres is the source of truth; product pages are cached in Redis; a search index (fed by change events) serves category pages with filters and facets.',
    diagram:{n:[['shop', 'client', 'Shopper', '', 0, 0], ['seller', 'client', 'Seller', '', 0, 2], ['api', 'service', 'Catalog API', '', 1, 1], ['cache', 'cache', 'Redis', 'product pages', 2, 0], ['db', 'db', 'Postgres', 'source of truth', 2, 2], ['cdc', 'queue', 'Change events', 'CDC', 3, 2], ['search', 'service', 'Search index', 'facets', 3, 0]], e:'shop>api seller>api api>cache api>db db>cdc cdc>search api>search', f:[['A product page comes from cache, falling back to Postgres.', 'shop>api:GET /p/81|api>cache'], ['A price change updates Postgres, invalidates the cache, and flows to the search index.', 'seller>api:PATCH price|api>db|db>cdc|cdc>search']]}},
  components:[['Catalog API', 'Seller writes, validation, product reads'], ['Postgres', 'Products, variants, categories'], ['Redis', 'Hot product pages'], ['CDC stream', 'Publishes every change for downstream consumers'], ['Search index', 'Category listings, filters, facets, keyword search']],
  tech:[['Postgres + JSONB', 'Relational core with flexible attributes'], ['Redis cache-aside', 'Fast product pages'], ['Debezium-style CDC', 'Reliable change stream without dual writes'], ['OpenSearch/Elasticsearch', 'Facets and relevance']],
  tradeoffs:[['Search index for listings', 'Fast filters and facets', 'Index lag of seconds'], ['Cache invalidation on write', 'Fresh product pages', 'Write path must reliably delete keys'], ['JSONB attributes', 'Flexible per category', 'Weaker constraints and harder SQL queries']],
  v1:{text:'v1: Postgres only; category pages are SQL queries with indexes; filters by brand and price range.', code:`app.get('/c/:category', async (req, res) => {
  const { brand, min = 0, max = 1e12, sort = 'popular', cursor } = req.query;
  const r = await db.query(\`
    SELECT p.id, p.title, p.brand, min(v.price_minor) AS from_price
    FROM products p JOIN variants v ON v.product_id = p.id
    JOIN categories c ON c.id = p.category_id
    WHERE c.path LIKE $1 || '%' AND p.status = 'active'
      AND ($2::text IS NULL OR p.brand = $2) AND v.price_minor BETWEEN $3 AND $4
      AND ($5::bigint IS NULL OR p.id < $5)
    GROUP BY p.id ORDER BY p.id DESC LIMIT 48\`, [req.params.category, brand ?? null, min, max, cursor ?? null]);
  res.json({ items: r.rows, next: r.rows.at(-1)?.id });
});`},
  bottlenecks:['Faceted category queries with JOINs and GROUP BY get slow at millions of products', 'Product pages hit Postgres on every view during sales', 'Price updates in bulk lock rows during peak'],
  scaling:[['Listings', 'Search index with facets; Postgres only for detail and writes'], ['Product pages', 'Redis + CDN for images; invalidate on change'], ['Bulk price updates', 'Batch in small transactions off-peak; queue seller imports'], ['Read load', 'Read replicas behind the cache']],
  improvements:['Personalised ranking in listings', 'Variant-level inventory from a dedicated inventory service', 'Multi-language titles', 'Image CDN with resizing'],
  failures:[['Search index down', 'Fallback to simple SQL listings for top categories (degraded)'], ['CDC lag', 'Listings show old prices briefly; checkout always re-reads prices from Postgres'], ['Redis down', 'Postgres replicas serve product pages']],
  observability:{metrics:['Product page latency and cache hit ratio', 'CDC lag', 'Search latency and zero-result rate', 'Seller import failures'], alerts:['CDC lag > 2 min', 'Cache hit < 85%', 'Search p99 > 500 ms'], dash:'Reads, cache, search health, index lag, seller activity.'},
  review:['Single source of truth with derived read models: ✓', 'Checkout re-validates price against the source of truth: ✓', 'Cache invalidation on writes: ✓', 'Next: dedicated inventory service for flash sales (see Amazon case)'],
  refs:['l:cache-strategies', 'l:cdc', 'l:elasticsearch', 'case:amazon']});
})();
