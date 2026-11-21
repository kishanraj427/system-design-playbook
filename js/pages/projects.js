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
const STAGES = [['req', '1 · What we’re building'], ['fr', '2 · What it must do'], ['nfr', '3 · How well it must do it'], ['est', '4 · How big it gets (estimates)'], ['entities', '5 · Data we store'], ['apis', '6 · Requests the app accepts'], ['hld', '7 · The big picture'], ['components', '8 · What each part does'], ['tech', '9 · Tools we pick, and why'], ['tradeoffs', '10 · Trade-offs'], ['v1', '11 · Build the first version'], ['bottlenecks', '12 · What slows down first'], ['scaling', '13 · What breaks as we grow'], ['improvements', '14 · How we improve it'], ['failures', '15 · What happens when parts fail'], ['observability', '16 · How we watch it'], ['review', '17 · Final checklist']];
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
  req:'<b>A small example.</b> Dev has an article with a very long web address. He pastes it into the service and gets back <code>sho.rt/aZ3kQ</code>. He shares that short link, and everyone who opens it lands on the article. Later, Dev sees how many people clicked it each day. Build this for millions of links.',
  fr:['Create a short link for a long URL, with an optional custom name and expiry date', 'Open <code>GET /{code}</code> and send the visitor to the original URL', 'Show the owner how many clicks the link got each day', 'Turn a link off or delete it'],
  nfr:['A redirect takes under 50 ms for 99 of 100 visitors', 'A code never points to two different URLs and never changes its target on its own', 'Redirects work 99.9% of the time. Creating links may pause briefly during a failure', 'No phishing or malware links'],
  est:[['New links', '1M a day ≈ 12 a second', '1,000,000 ÷ 86,400 s ≈ 12'], ['Redirects', '100M a day ≈ 1,200 a second, 6,000 at peak', 'Assume 100 reads for every write: 100M ÷ 86,400 s ≈ 1,157. Peak is about 5 times the average'], ['Storage', '≈ 1 TB over 5 years', '1M × 365 days × 5 years × 500 bytes ≈ 0.9 TB'], ['Code length', '7 letters or digits', 'There are 62 characters. 7 places give 62⁷ ≈ 3.5 trillion codes']],
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
);`, notes:'A redirect needs only one lookup: <code>code → long_url</code>. Clicks are counted per day, not stored one by one.'},
  apis:{list:[['POST /api/links', 'Create a link. Send the long URL and an optional name or expiry date. Get back the code'], ['GET /{code}', 'Redirect to the long URL (301 or 302)'], ['GET /api/links/{code}/stats', 'Daily click counts for the owner'], ['DELETE /api/links/{code}', 'Turn a link off']], code:`app.post('/api/links', auth, async (req, res) => {
  const { long_url, alias } = req.body;
  if (!isSafeHttpUrl(long_url)) return res.status(400).json({ error: 'invalid url' });
  const code = alias ?? base62(await nextId());          // counter-based: no collisions
  await db.query('INSERT INTO links(code, long_url, owner_id) VALUES ($1,$2,$3)', [code, long_url, req.user.id]);
  res.status(201).json({ code, short_url: \`https://sho.rt/\${code}\` });
});`},
  hld:{text:'Creating a link writes to the database. A redirect reads from a cache in front of the database. Each click goes on a queue and is counted later, so the redirect stays fast.',
    diagram:{n:[['u', 'client', 'Visitor', '', 0, 1], ['lb', 'lb', 'Load balancer', '', 1, 1], ['app', 'service', 'Link service', 'stateless', 2, 1], ['cache', 'cache', 'Redis', 'code → url', 3, 0], ['db', 'db', 'Postgres', 'links', 3, 2], ['q', 'queue', 'Click events', '', 4, 1]], e:'u>lb lb>app app>cache app>db app>q', f:[['A redirect checks Redis first; a miss reads Postgres and fills the cache.', 'u>lb:GET /aZ3kQ|lb>app|app>cache:hit|app>db:miss only'], ['The click is recorded asynchronously.', 'app>q:click aZ3kQ']]}},
  components:[['Load balancer', 'Spreads requests across servers, handles HTTPS and skips servers that are down'], ['Link service', 'Checks URLs, makes codes and serves redirects'], ['Redis', 'Keeps popular codes in memory so most redirects skip the database'], ['Postgres', 'The permanent record of links and daily click counts'], ['Click consumer', 'Reads click events from the queue and adds them to the daily counts']],
  tech:[['Postgres', 'Simple and safe. A unique rule on the code stops two links from sharing one'], ['Redis', 'Answers in under a millisecond, which suits 100 reads for every write'], ['Base62 of a counter', 'Gives short codes that never collide, with no retries'], ['A queue (Kafka or a simpler one)', 'Lets clicks be counted later, so a redirect never waits for the count']],
  tradeoffs:[['302 or 301 redirect', '302 lets you count every click and change the target later', '301 is cached by browsers. You get less traffic but you can no longer see every click'], ['Codes from a counter', 'No collisions and the codes stay short', 'Codes in order are easy to guess, so shuffle the number first'], ['Count clicks later', 'Redirects stay fast', 'The counts are a few seconds behind']],
  v1:{text:'Version 1 is one Node service, one Postgres database, a cache inside the service and a click counter that updates the database on every click. It handles hundreds of redirects a second.', code:`import express from 'express';
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
  bottlenecks:['Every click writes to the database. This write, not the lookup, becomes the bottleneck first', 'Each server has its own cache, so with many servers a click often misses it', 'One counter for new codes is a single point of failure for creating links'],
  scaling:[['Click writes', 'Put click events on a queue. A consumer adds them up in memory and writes the totals every few seconds'], ['Cache misses', 'Use one shared Redis. Keep a code in the cache after it is read, and load viral links ahead of time'], ['Making codes', 'Give each server a block of numbers, such as 10,000 at a time. Or use a Snowflake-style generator'], ['Reads', 'Add read replicas behind the cache. The cache answers more than 95% of reads']],
  improvements:['Custom domains for each customer', 'Check every new link for malware or phishing, and check old links again from time to time', 'Count unique visitors per link with a HyperLogLog (a small structure that counts distinct items)', 'QR codes and link previews', 'Redirect the hottest links at the CDN edge, close to the visitor'],
  failures:[['Redis is down', 'Read from the Postgres replicas. Redirects get slower but still work'], ['Postgres primary is down', 'Redirects keep working from the cache and replicas. Creating a link returns 503 until the failover finishes'], ['The queue is down', 'Keep clicks in memory for a short time or drop them. Redirects are not affected'], ['A link points to malware', 'Turn the link off and remove it from the cache at once, so no one is sent there']],
  observability:{metrics:['Redirect time (p50 and p99) and requests a second', 'Cache hit ratio', '404 rate (broken or guessed codes)', 'How far behind the click queue is', 'Links created per user, to spot abuse'], alerts:['Redirect p99 above 100 ms for 5 minutes', 'Cache hit ratio below 80%', 'Click queue more than 5 minutes behind', '5xx errors above 0.5%'], dash:'Redirects a second, time percentiles, hit ratio, top links and creation rate.'},
  review:['A redirect reads only the cache, and rarely the database: ✓', 'Codes are unique because the primary key enforces it: ✓', 'Abuse is limited by creation limits, URL scanning and an off switch: ✓', 'Click counting is separate from redirects: ✓', 'Next risk: codes in order are easy to guess. Shuffle the counter number before base62'],
  refs:['case:url-shortener', 'l:cache-strategies', 'l:unique-ids']});
P({id:'p-pastebin', level:'beginner', icon:'📋', title:'Pastebin', tagline:'Share text snippets with expiry, syntax highlighting and abuse controls.', tags:['object storage', 'expiry', 'cdn'],
  req:'<b>A small example.</b> Asha hits an error and wants help. She pastes 40 lines of her log into the service and gets a link. She sends the link to a friend, who opens it and sees the text with colours. The link stops working after one day. Build this for millions of pastes.',
  fr:['Create a paste (up to 10 MB) with an optional expiry time and language', 'Open a paste by its link, as plain text or with colours', 'Keep unlisted pastes out of search and lists', 'Let the owner delete a paste'],
  nfr:['A paste opens in under 100 ms for 99 of 100 viewers', 'An expired paste is never shown', 'A paste that has not expired is never lost', 'Abuse is handled: leaked secrets, malware and spam'],
  est:[['New pastes', '500K a day ≈ 6 a second', '500,000 ÷ 86,400 s ≈ 6'], ['Views', '10M a day ≈ 115 a second, up to 1,000 at peak', 'Assume 20 views per paste: 500K × 20 = 10M. 10M ÷ 86,400 s ≈ 115'], ['Average size', '10 KB', 'Most pastes are small and a few are several MB. This is an assumption'], ['Storage', '≈ 1.8 TB a year', '500K × 10 KB = 5 GB a day. 5 GB × 365 ≈ 1.8 TB']],
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
CREATE INDEX ON pastes (expires_at) WHERE expires_at IS NOT NULL;`, notes:'The details go in Postgres and the text goes in object storage. The database rows stay small, and a CDN can serve the text.'},
  apis:{list:[['POST /api/pastes', 'Create a paste. Send the text and an optional language, expiry and visibility. Get back the id and link'], ['GET /p/{id}', 'The page with coloured text'], ['GET /raw/{id}', 'Plain text. A cache may keep it until the paste expires'], ['DELETE /api/pastes/{id}', 'The owner deletes the paste']], code:`app.post('/api/pastes', rateLimit({ perMinute: 10 }), async (req, res) => {
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
  hld:{text:'The details go to Postgres and the text goes to object storage. A CDN serves the plain text and keeps it no longer than the paste lives. A sweeper deletes expired pastes, and a scanner checks new ones.',
    diagram:{n:[['u', 'client', 'User', '', 0, 1], ['cdn', 'cdn', 'CDN', 'raw views', 1, 0], ['app', 'service', 'Paste service', '', 1, 1], ['db', 'db', 'Postgres', 'metadata', 2, 2], ['s3', 'db', 'Object storage', 'content', 2, 0], ['q', 'queue', 'Scan queue', '', 3, 1], ['scan', 'service', 'Scanner + sweeper', '', 4, 1]], e:'u>cdn u>app cdn>s3 app>db app>s3 app>q q>scan scan>db~-0.1', f:[['Create: content to storage, metadata to the DB, scan queued.', 'u>app:POST paste|app>s3|app>db|app>q'], ['Views of raw content come from the CDN.', 'u>cdn:GET /raw/x7Kd|cdn>s3:miss']]}},
  components:[['Paste service', 'Checks input, makes ids, saves details and builds the page'], ['Object storage', 'Holds the paste text. It is cheap and does not lose data'], ['CDN', 'Delivers plain text. It keeps a copy no longer than the time left before expiry'], ['Scanner', 'Looks for leaked keys, tokens and malware, and turns off bad pastes'], ['Sweeper', 'Deletes expired pastes from storage and from the database']],
  tech:[['Postgres', 'Stores the details, an index on expiry time and the owner'], ['S3-compatible storage', 'The text can grow without growing the database'], ['A CDN', 'A viral paste is served from a server close to the viewer'], ['Colours added on the server (and cached)', 'The page shows fast and needs no heavy browser code']],
  tradeoffs:[['Text in object storage', 'A small database that works well with a CDN', 'Each create makes two writes'], ['Random ids', 'Unlisted links cannot be guessed', 'Longer than ids in order'], ['CDN caching with an expiry', 'Fast views', 'A delete must also clear the CDN copy']],
  v1:{text:'Version 1 keeps the text in a Postgres column and adds colours on every view. A job deletes expired rows every minute.', code:`app.get('/raw/:id', async (req, res) => {
  const r = await db.query(
    "SELECT content, expires_at FROM pastes WHERE id=$1 AND NOT deleted AND (expires_at IS NULL OR expires_at > now())", [req.params.id]);
  if (!r.rowCount) return res.status(404).send('Not found or expired');
  const { content, expires_at } = r.rows[0];
  const maxAge = expires_at ? Math.max(0, Math.floor((+expires_at - Date.now()) / 1000)) : 86400;
  res.set('Cache-Control', \`public, max-age=\${Math.min(maxAge, 86400)}\`).type('text/plain').send(content);
});
// cron every minute (v1)
setInterval(() => db.query('DELETE FROM pastes WHERE expires_at < now()'), 60_000);`},
  bottlenecks:['Large pastes in Postgres make tables and backups huge', 'Adding colours on every view uses a lot of CPU', 'A viral paste overloads the app servers'],
  scaling:[['Big text', 'Move the text to object storage and keep only the details in Postgres'], ['CPU for colours', 'Save the finished page for each paste until it expires'], ['Viral views', 'Use a CDN with a cache time no longer than the expiry. Clear it when the paste is deleted'], ['Deleting expired pastes', 'Delete in batches using the expiry index. Add storage rules that remove old files']],
  improvements:['Scan for secrets (API keys and tokens), turn off the paste and tell the owner', 'Password-protected pastes', 'Edit history, with each version saved as a new file', 'Burn after reading: the paste is deleted after its first view'],
  failures:[['Object storage is slow', 'Serve saved copies from the CDN and retry creates'], ['The scanner falls behind', 'New pastes stay viewable and scanning catches up. Or hold public pastes until they are scanned'], ['The sweeper stops', 'Expired pastes are still blocked by the expiry check on every read. Storage grows until the sweeper runs again']],
  observability:{metrics:['Create and view rates, and p99 time', 'CDN hit ratio', 'How far behind the scanner is, and what it found', 'Count of pastes that expired but are not yet deleted'], alerts:['View p99 above 200 ms', 'Scanner more than 15 minutes behind', 'A spike in new pastes from one IP address or network'], dash:'Traffic, time, how much the CDN serves, and abuse found.'},
  review:['Expiry is checked on every read and enforced by deletion: ✓', 'The text is kept out of the database: ✓', 'Abuse is limited by rate limits, scanning and an off switch: ✓', 'Next risk: CDN clears on delete must be reliable, so track clear failures'],
  refs:['case:pastebin', 'l:storage-types', 'l:cdn']});
P({id:'p-blog', level:'beginner', icon:'✍️', title:'Blogging platform', tagline:'Write, publish and serve articles fast, with comments and search.', tags:['cms', 'caching', 'search', 'static rendering'],
  req:'<b>A small example.</b> Maya writes a post in Markdown on Monday and presses Publish. Within a minute, readers anywhere can open it, comment on it and find it by searching. Build this for many authors: they write drafts, publish them, and readers browse by tag and author.',
  fr:['Create, edit and publish posts, written in Markdown, with images', 'A home page, tag pages and author pages, split into pages of results', 'Comments, with a way to remove spam', 'Search posts by their text'],
  nfr:['An article opens in under 200 ms for 99 of 100 readers, worldwide', 'A published post is never lost, and drafts save automatically', 'Pages are plain HTML from the server, so search engines can read them', 'A post that goes viral must not crash the site'],
  est:[['Authors', '50,000', 'Assumed'], ['Posts', '2,000 new a day, 5M in total', '2,000 × 365 ≈ 730,000 a year, so 5M is about 7 years of posts'], ['Page views', '≈ 58 a second on average, 2,000 a second for a viral post', '5M ÷ 86,400 s ≈ 58 a second. The viral figure is an assumption'], ['Storage', '≈ 50 GB of text and ≈ 5 TB of images', 'Text: 5M × 10 KB = 50 GB. Images: 5M × 1 MB = 5 TB, kept in object storage']],
  entities:{code:`CREATE TABLE users  (id BIGSERIAL PRIMARY KEY, handle TEXT UNIQUE NOT NULL, name TEXT, bio TEXT);
CREATE TABLE posts (
  id          BIGSERIAL PRIMARY KEY,
  author_id   BIGINT NOT NULL REFERENCES users(id),
  slug        TEXT NOT NULL,                 -- the readable part of the address, like "my-first-post"
  title       TEXT NOT NULL,
  body_md     TEXT NOT NULL,                 -- what the author wrote, in Markdown
  body_html   TEXT,                          -- the page HTML, made once when the post is published
  status      TEXT NOT NULL DEFAULT 'draft',  -- draft or published
  published_at TIMESTAMPTZ,
  search      TSVECTOR,                      -- the searchable words of the post
  UNIQUE (author_id, slug)
);
CREATE TABLE post_tags (post_id BIGINT REFERENCES posts(id), tag TEXT, PRIMARY KEY (post_id, tag));
CREATE TABLE comments (id BIGSERIAL PRIMARY KEY, post_id BIGINT REFERENCES posts(id), author_id BIGINT, body TEXT, status TEXT DEFAULT 'visible', created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX ON posts USING GIN (search);     -- makes text search fast
CREATE INDEX ON posts (published_at DESC) WHERE status = 'published';   -- newest published posts first`, notes:'Turn Markdown into HTML once, when the post is published, and not on every view. That keeps reads cheap.'},
  apis:{list:[['POST /api/posts', 'Create a draft'], ['PUT /api/posts/{id}', 'Save the draft as the author types'], ['POST /api/posts/{id}/publish', 'Make the HTML, publish, and clear the old cached pages'], ['GET /@{handle}/{slug}', 'Open an article (the server builds the HTML)'], ['GET /api/search?q=', 'Search the text of posts']], code:`app.post('/api/posts/:id/publish', auth, async (req, res) => {
  const post = await posts.getOwned(req.params.id, req.user.id);
  const html = sanitize(markdownToHtml(post.body_md));     // remove any dangerous HTML the author typed
  await db.query(\`UPDATE posts SET body_html=$2, status='published', published_at=coalesce(published_at, now()),
                   search = to_tsvector('english', title || ' ' || body_md) WHERE id=$1\`, [post.id, html]);
  await cdn.purge([\`/@\${req.user.handle}/\${post.slug}\`, '/', ...post.tags.map(t => \`/tag/\${t}\`)]);   // tell the CDN to drop its old copies
  res.json({ ok: true });
});`},
  hld:{text:'The server builds each page from Postgres, and a CDN keeps copies of the pages close to readers. Publishing clears the copies that changed. Images go to object storage. Search uses Postgres at first, and a search engine later.',
    diagram:{n:[['r', 'client', 'Reader', '', 0, 0], ['a', 'client', 'Author', '', 0, 2], ['cdn', 'cdn', 'CDN', 'HTML + images', 1, 0], ['app', 'service', 'Blog app', 'builds pages', 1, 2], ['db', 'db', 'Postgres', 'posts, search', 2, 2], ['s3', 'db', 'Object storage', 'images', 2, 0], ['mod', 'queue', 'Comment moderation', '', 3, 2]], e:'r>cdn cdn>app cdn>s3 a>app app>db app>s3 app>mod~0.2', f:[['Most readers get the page from the CDN. On a miss, the app builds it from Postgres.', 'r>cdn:GET article|cdn>app:miss|app>db'], ['Publishing makes the HTML once, saves it, and clears the old cached pages.', 'a>app:publish|app>db|app>cdn:purge']]}},
  components:[['Blog app', 'Login, the editor API, building pages and the publish steps'], ['Postgres', 'Users, posts, tags, comments and the search index'], ['Object storage and CDN', 'Images, and cached copies of pages'], ['Moderation queue', 'Filters spam and holds comments for review']],
  tech:[['Node with server-side rendering (for example Next.js)', 'The server sends finished HTML. Pages show quickly and search engines can read them'], ['Postgres full-text search', 'Good enough for millions of posts, and there is no extra system to run in v1'], ['A CDN with a purge command', 'It keeps page copies near readers and absorbs a viral spike'], ['Markdown and an HTML sanitiser', 'Authors write simply, and dangerous HTML is removed before showing it']],
  tradeoffs:[['Make the HTML when publishing', 'Views are cheap', 'If the page design changes, old posts must be rebuilt'], ['Postgres search before Elasticsearch', 'One system to run', 'Weaker ranking and no typo tolerance'], ['Cache full pages at the CDN', 'Handles viral spikes', 'You must clear copies when a post or its comments change']],
  v1:{text:'In v1 there is one app and one Postgres database. Pages are kept in memory for 60 seconds, and images sit on the server’s disk.', code:`app.get('/@:handle/:slug', async (req, res) => {
  const key = req.path; const hit = pageCache.get(key);
  if (hit) return res.type('html').send(hit);          // saved copy, no database work
  const r = await db.query(\`SELECT p.title, p.body_html, p.published_at, u.name FROM posts p JOIN users u ON u.id = p.author_id
                            WHERE u.handle=$1 AND p.slug=$2 AND p.status='published'\`, [req.params.handle, req.params.slug]);
  if (!r.rowCount) return res.status(404).send('Not found');
  const html = renderArticle(r.rows[0]);
  pageCache.set(key, html, { ttl: 60_000 });           // keep it for 60 seconds
  res.type('html').send(html);
});`},
  bottlenecks:['A viral post: every server builds the page and queries the database on each cache miss', 'Images on an app server’s disk do not scale, and are lost if the server dies', 'Comment spam floods the moderators'],
  scaling:[['A viral post is read thousands of times a second', 'Cache the full page at the CDN, and clear it when the post is published or edited'], ['Images fill the servers’ disks', 'Move them to object storage, behind the CDN, with resized versions'], ['Search results feel weak', 'Move to Elasticsearch or OpenSearch, fed whenever a post changes'], ['Comments change often', 'Load comments separately in the browser, so the article page stays cacheable']],
  improvements:['Schedule a post to publish later', 'RSS feeds and a newsletter', 'Let two authors edit a draft together (see the Google Docs case)', 'Count views per post in the background'],
  failures:[['Postgres is down', 'The CDN keeps serving cached pages. Editing pauses'], ['A CDN purge fails', 'Retry the purge. A short cache time limits how stale a page can be'], ['A spam wave arrives', 'Limit requests per IP and account, add a CAPTCHA, and hold new comments for review']],
  observability:{metrics:['Page speed at the origin and at the edge', 'CDN hit ratio (how many requests the CDN answers itself)', 'Publish successes and failures', 'Comments flagged compared with approved'], alerts:['Origin errors above 1% of requests', 'CDN hit ratio below 85%', 'Any purge failure'], dash:'Traffic by post, how much the cache absorbs, editor errors and the moderation backlog.'},
  review:['Reads come from cache, and writes are rare and simple: ✓', 'Author HTML is cleaned before it is shown: ✓', 'Comments are kept apart from the cached article: ✓', 'Next step: a dedicated search engine once Postgres search ranking becomes a complaint'],
  refs:['l:cdn', 'l:cache-invalidation', 'l:inverted-index']});
P({id:'p-file-upload', level:'beginner', icon:'📤', title:'File upload service', tagline:'Upload large files reliably, scan them, and share download links.', tags:['multipart upload', 'pre-signed urls', 'virus scanning'],
  req:'<b>A small example.</b> Ravi records a 2 GB video on his phone and starts uploading it. His train goes into a tunnel and the network drops. When the signal returns, the upload carries on from where it stopped. The service scans the file, then Ravi shares a link that stops working after a week. Build this for many users.',
  fr:['Upload files up to 5 GB, and carry on after a break', 'List and download my files', 'Share a link, with an optional expiry date and password', 'Delete files'],
  nfr:['An upload survives a network drop. It resumes and does not restart', 'App servers never carry the file bytes', 'A file with a virus can never be downloaded', 'Files are very safe: 11 nines of durability from object storage'],
  est:[['Uploads', '200K a day, 50 MB on average', 'This is an assumption'], ['Incoming data', '≈ 10 TB a day ≈ 1 Gbps on average', '200K × 50 MB = 10 TB. 10 TB ÷ 86,400 s ≈ 115 MB a second ≈ 0.9 Gbps'], ['Downloads', '1M a day', 'Assume 5 downloads for each upload'], ['Storage growth', '≈ 3.6 PB a year', '10 TB × 365 days, before old files are deleted']],
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
);`, notes:'The status column is a small set of states. Only a file marked <code>ready</code> can be downloaded.'},
  apis:{list:[['POST /api/uploads', 'Start an upload. Get back a file id, an upload id and a link for each part'], ['POST /api/uploads/{id}/complete', 'Finish the upload by sending the part tags. This starts the scan'], ['GET /api/files/{id}/download', 'Get a short-lived signed link to download the file'], ['POST /api/files/{id}/shares', 'Create a share link']], code:`app.post('/api/uploads', auth, async (req, res) => {
  const { name, size } = req.body;
  if (size > 5 * 2 ** 30) return res.status(413).end();
  const id = randomUUID(), key = \`u/\${req.user.id}/\${id}\`;
  const { UploadId } = await s3.createMultipartUpload({ Bucket, Key: key });
  const parts = Math.ceil(size / PART_SIZE);                       // e.g. 16 MB parts
  const urls = await Promise.all(range(1, parts).map(n => presign('uploadPart', { Key: key, UploadId, PartNumber: n }, 3600)));
  await db.query("INSERT INTO files(id, owner_id, name, size_bytes, storage_key, upload_id) VALUES ($1,$2,$3,$4,$5,$6)", [id, req.user.id, name, size, key, UploadId]);
  res.json({ id, uploadId: UploadId, partUrls: urls });
});`},
  hld:{text:'The client sends each part straight to object storage using signed links. The API only keeps track. When the upload completes, a scan runs. Downloads use short-lived signed links.',
    diagram:{n:[['c', 'client', 'Client', 'web / mobile', 0, 1], ['api', 'service', 'Upload API', 'coordinates', 1, 1], ['db', 'db', 'Postgres', 'files, shares', 2, 2], ['s3', 'db', 'Object storage', 'multipart', 2, 0], ['q', 'queue', 'Scan queue', '', 3, 1], ['av', 'service', 'Scanner', 'antivirus', 4, 1]], e:'c>api c>s3~-0.3 api>db api>s3 api>q q>av av>db~-0.1 av>s3', f:[['The client gets part URLs and uploads parts straight to storage (in parallel, resumable).', 'c>api:start|c>s3:PUT parts 1..N'], ['Completion assembles the parts and queues a scan; the file becomes ready if clean.', 'c>api:complete|api>s3:complete multipart|api>q|q>av|av>db:ready']]}},
  components:[['Upload API', 'Checks who you are, applies limits, manages the parts and makes signed links'], ['Object storage', 'Holds the parts and the finished files, with rules for cleaning up'], ['Scanner workers', 'Download the file, scan it, update its status and isolate bad files'], ['Postgres', 'Holds file details, status and share links']],
  tech:[['S3 multipart upload', 'Uploads in parallel and can resume. Objects can reach 5 TB'], ['Signed links', 'The file bytes never pass through app servers'], ['A ClamAV-style scanner in workers', 'Runs apart from the app. Add more workers when the queue grows'], ['Postgres', 'Keeps each file’s status safely, as a small state machine']],
  tradeoffs:[['Upload straight to storage', 'No app bandwidth is needed, so it scales easily', 'Checks on the file happen after it is uploaded'], ['Scan before a file is ready', 'No infected downloads', 'A file is unavailable for a few minutes'], ['Parts of 16 MB', 'Fewer requests and good speed', 'On a bad network, a failed part means more to re-send']],
  v1:{text:'Version 1 streams each upload through the Node server onto disk, with a size limit. This works for small files and one server.', code:`import busboy from 'busboy';
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
  bottlenecks:['App servers carry all the upload traffic and use their disks', 'A dropped connection restarts an upload that is several GB', 'Scanning during the request blocks the user'],
  scaling:[['Bandwidth', 'Upload directly to object storage with signed links'], ['Resuming', 'Use multipart upload. The client remembers finished parts and retries only the failed ones'], ['Scanning', 'Use a queue and add scanner workers as it grows'], ['Abandoned uploads', 'A storage rule cancels unfinished uploads after 7 days']],
  improvements:['Skip duplicate files by comparing a hash of the content', 'Previews and thumbnails', 'Encrypt sensitive files on the user’s device before upload', 'Serve public shares through a CDN so downloads are faster'],
  failures:[['The client drops mid-upload', 'It resumes the missing parts using the same upload id'], ['The scanner is down', 'Files wait in the scanning state and cannot be downloaded. The backlog clears later'], ['A storage region is down', 'Copy important buckets to another region. Uploads retry later']],
  observability:{metrics:['Upload success rate and time, grouped by file size', 'How often parts are retried', 'How many files wait for a scan and for how long', 'Infected files found'], alerts:['Upload success below 98%', 'Oldest file waiting for a scan older than 30 minutes', 'A spike in signed-link errors'], dash:'Uploads in progress, speed, the scan queue and storage growth.'},
  review:['No file bytes pass through app servers: ✓', 'Uploads can resume: ✓', 'A scan gate stands before every download: ✓', 'Next risk: storage cost grows with the files. Add cheaper storage tiers and user limits'],
  refs:['l:storage-types', 'l:queues-pubsub-streams', 'case:dropbox']});
P({id:'p-auth', level:'beginner', icon:'🔑', title:'Authentication system', tagline:'Sign-up, login, sessions, password reset and MFA done safely.', tags:['security', 'sessions', 'jwt', 'mfa'],
  req:'<b>A small example.</b> Meera signs up with her email and a password, and gets an email to confirm it. She logs in on her phone and stays logged in for weeks. Later she forgets her password, asks for a reset link and sets a new one. She also turns on a code from an authenticator app. Build this login system for a consumer app, and keep attackers out.',
  fr:['Sign up and confirm the email address', 'Log in and log out, and stay logged in on a phone', 'Reset a forgotten password', 'Turn on two-factor login with a TOTP code (a code that changes every 30 seconds)', 'See all active sessions and end any of them'],
  nfr:['Store passwords with a slow, salted hash', 'Login takes under 300 ms for 99 of 100 users. Most of that time is the hashing', 'Ending a session works within a minute', 'Withstand password guessing and credential stuffing (trying leaked passwords from other sites)'],
  est:[['Users', '10M', 'This is an assumption'], ['Logins', '1M a day ≈ 12 a second, up to 100 at peak', '1,000,000 ÷ 86,400 s ≈ 12. The peak is an assumption'], ['Token checks', '20,000 a second', 'Every API call carries a token, so this check must be cheap'], ['Password hashing', 'About 100 ms of CPU each', 'At 100 logins a second: 100 × 0.1 s = 10 CPU cores busy']],
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
CREATE TABLE reset_tokens (token_hash CHAR(64) PRIMARY KEY, user_id BIGINT, expires_at TIMESTAMPTZ, used_at TIMESTAMPTZ);`, notes:'Store only hashes of tokens. If the database leaks, nobody can use it to log in.'},
  apis:{list:[['POST /auth/signup', 'Create an account and send a confirmation email'], ['POST /auth/login', 'Send a password (and a TOTP code if turned on). Get a short-lived access token and a refresh token'], ['POST /auth/refresh', 'Swap the refresh token for a new one, and get a new access token'], ['POST /auth/logout', 'End this session'], ['POST /auth/password-reset', 'Email a reset link that works once']], code:`app.post('/auth/login', loginLimiter, async (req, res) => {
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
  hld:{text:'One auth service owns passwords and sessions. Other services check a short-lived signed access token themselves with a public key, so they never call the auth service on every request. Refresh tokens are stored as hashes and can be revoked.',
    diagram:{n:[['c', 'client', 'App', '', 0, 1], ['gw', 'lb', 'API gateway', 'verifies JWT', 1, 1], ['auth', 'service', 'Auth service', '', 2, 0], ['db', 'db', 'Users DB', 'hashes, sessions', 3, 0], ['rl', 'cache', 'Rate limits', 'per IP / account', 3, 1], ['svc', 'service', 'Other services', '', 2, 2], ['mail', 'ext', 'Email provider', '', 4, 0]], e:'c>gw gw>auth gw>svc auth>db auth>rl auth>mail~0.2', f:[['Login checks rate limits, verifies the password hash and creates a session.', 'c>gw:POST /auth/login|gw>auth|auth>rl|auth>db'], ['Every other call carries the access token, verified at the gateway without calling auth.', 'c>gw:GET /orders (JWT)|gw>svc']]}},
  components:[['Auth service', 'Sign-up, login, two-factor, tokens and sessions'], ['Users database', 'Password hashes, sessions and reset tokens'], ['Gateway', 'Checks access tokens using the public key'], ['Rate limiter', 'Slows down login attempts per IP address, account and device'], ['Email provider', 'Sends confirmation and reset emails']],
  tech:[['argon2id', 'A password hash that needs a lot of memory, so guessing is costly'], ['Short-lived JWT and refresh tokens that rotate', 'Checking is cheap and sessions can still be ended'], ['Redis', 'Holds the counters for the rate limiter'], ['TOTP (RFC 6238)', 'The standard that authenticator apps use']],
  tradeoffs:[['JWT access tokens', 'No database lookup on each request', 'They cannot be cancelled before they expire, so keep them to about 10 minutes'], ['Server-side sessions only', 'A session can be ended at once', 'Each request needs a lookup'], ['Strict login limits', 'Stops stuffing attacks', 'Real users can be locked out, so use soft limits and a CAPTCHA']],
  v1:{text:'Version 1 keeps sessions in Postgres and sends a cookie. It is simple, and a session can be ended at once.', code:`app.post('/login', async (req, res) => {
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
  bottlenecks:['A Postgres lookup for the session on every request', 'Password hashing uses a lot of CPU when many people log in at once', 'Credential-stuffing bots flood the login'],
  scaling:[['A lookup on every request', 'Use short-lived JWTs that each server checks itself. Store only the refresh tokens'], ['Hashing CPU', 'Run separate auth servers and add more when needed. Tune the hash cost'], ['Bots', 'Limit by IP address, network and account. Check for breached passwords. Show a CAPTCHA after failures'], ['Many apps', 'Move to OAuth 2.0 and OIDC with an identity provider']],
  improvements:['Passkeys (WebAuthn), which replace passwords', 'Social login through OIDC', 'A risk score for each device', 'A log of security events that users can see'],
  failures:[['The auth service is down', 'Access tokens that already exist keep working until they expire. New logins fail'], ['The email provider is down', 'Queue the emails and retry. Let users ask again'], ['The signing key leaks', 'Switch to a new key (tokens carry a key id), end all sessions and ask everyone to log in again']],
  observability:{metrics:['Login success and failure rates', 'Failures per IP address and per account', 'How many users turned on two-factor', 'How often tokens are refreshed', 'Hash time p99'], alerts:['A spike in failed logins (a stuffing attack)', 'Auth p99 above 1 s', 'A sudden drop in successful logins'], dash:'Logins, failures by reason, suspicious IP addresses and session counts.'},
  review:['Passwords use argon2id and tokens are stored as hashes: ✓', 'Unknown users get the same response time as known ones: ✓', 'Refresh tokens can be revoked and access tokens are short-lived: ✓', 'Next: passkeys and OIDC'],
  refs:['l:password-hashing', 'l:sessions-vs-jwt', 'l:oauth-oidc-sso', 'l:authn-vs-authz']});
P({id:'p-catalog', level:'beginner', icon:'🏷️', title:'Product catalog', tagline:'Millions of products, browsed by category and filters, updated by sellers.', tags:['catalog', 'search', 'caching', 'cdc'],
  req:'<b>A small example.</b> A seller adds a T-shirt in 3 sizes and 2 colours, with a price for each. A shopper opens the “T-shirts” page, filters by brand and price, and opens the product. An hour later the seller lowers the price, and the shopper sees the new price within a minute. Build the product catalog for a store with millions of products.',
  fr:['Sellers create and update products, variants, images and prices', 'Category pages with filters and sorting', 'A product detail page', 'Search by keyword'],
  nfr:['A product page loads in under 150 ms for 99 of 100 shoppers', 'A price change shows within a minute', '10M products, with about 100 reads for every write', 'The price on the list and the price at checkout must match'],
  est:[['Products', '10M with about 3 variants each', '10M × 3 = 30M variants. This is an assumption'], ['Updates', '1M a day ≈ 12 a second', '1,000,000 ÷ 86,400 s ≈ 12. Most are price and stock changes'], ['Page views', '50M a day ≈ 600 a second, up to 10,000 in a sale', '50M ÷ 86,400 s ≈ 580. The sale peak is an assumption'], ['Data', '≈ 30 GB of rows, plus images in object storage', '10M products × about 3 KB = 30 GB']],
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
CREATE INDEX ON products (category_id, status);`, notes:'JSONB attributes let each category have its own fields. The search index gets a flattened copy so filters stay fast.'},
  apis:{list:[['POST /seller/products', 'Create a product with its variants'], ['PATCH /seller/variants/{sku}', 'Change the price or stock'], ['GET /c/{category}?brand=&price=&sort=', 'A category page with filters and counts for each filter'], ['GET /p/{id}', 'The product detail page']], code:`app.get('/p/:id', async (req, res) => {
  const key = \`product:\${req.params.id}\`;
  const cached = await redis.get(key);
  if (cached) return res.json(JSON.parse(cached));
  const p = await catalog.loadProductWithVariants(req.params.id);   // 2 queries
  if (!p) return res.status(404).end();
  await redis.set(key, JSON.stringify(p), 'EX', 300);
  res.json(p);
});
// on any product/variant write: await redis.del(\`product:\${id}\`) and publish a change event`},
  hld:{text:'Postgres is the source of truth. Product pages are cached in Redis. A search index, fed by change events, serves category pages with filters and counts.',
    diagram:{n:[['shop', 'client', 'Shopper', '', 0, 0], ['seller', 'client', 'Seller', '', 0, 2], ['api', 'service', 'Catalog API', '', 1, 1], ['cache', 'cache', 'Redis', 'product pages', 2, 0], ['db', 'db', 'Postgres', 'source of truth', 2, 2], ['cdc', 'queue', 'Change events', 'CDC', 3, 2], ['search', 'service', 'Search index', 'facets', 3, 0]], e:'shop>api seller>api api>cache api>db db>cdc cdc>search api>search', f:[['A product page comes from cache, falling back to Postgres.', 'shop>api:GET /p/81|api>cache'], ['A price change updates Postgres, invalidates the cache, and flows to the search index.', 'seller>api:PATCH price|api>db|db>cdc|cdc>search']]}},
  components:[['Catalog API', 'Seller writes, checks and product reads'], ['Postgres', 'Products, variants and categories'], ['Redis', 'Popular product pages'], ['CDC stream', 'Publishes every change so other systems can follow it'], ['Search index', 'Category lists, filters, counts and keyword search']],
  tech:[['Postgres with JSONB', 'A solid table design with flexible extra fields'], ['Redis cache-aside', 'Fast product pages'], ['Debezium-style CDC', 'A reliable stream of changes, with no double writes'], ['OpenSearch or Elasticsearch', 'Fast filters, counts and ranking of results']],
  tradeoffs:[['A search index for lists', 'Fast filters and counts', 'The index is a few seconds behind'], ['Clear the cache on every write', 'Product pages stay fresh', 'The write path must delete the right keys every time'], ['JSONB attributes', 'Flexible for each category', 'Weaker rules and harder SQL queries']],
  v1:{text:'Version 1 uses Postgres only. Category pages are SQL queries with indexes, and filters work on brand and price range.', code:`app.get('/c/:category', async (req, res) => {
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
  bottlenecks:['Category queries with JOINs and GROUP BY get slow at millions of products', 'Product pages read Postgres on every view during sales', 'Bulk price updates lock rows at peak time'],
  scaling:[['Lists', 'Use a search index with filter counts. Use Postgres only for details and writes'], ['Product pages', 'Use Redis, and a CDN for images. Clear a page when the product changes'], ['Bulk price updates', 'Run them in small batches when it is quiet, and queue seller imports'], ['Read load', 'Add read replicas behind the cache']],
  improvements:['Ranking tuned to each shopper', 'Stock for each variant from a separate inventory service', 'Titles in several languages', 'An image CDN that resizes pictures'],
  failures:[['The search index is down', 'Fall back to simple SQL lists for the top categories. They are slower'], ['The CDC stream is behind', 'Lists show old prices for a short time. Checkout always reads the price from Postgres'], ['Redis is down', 'Postgres replicas serve the product pages']],
  observability:{metrics:['Product page time and cache hit ratio', 'How far behind the CDC stream is', 'Search time and how often a search finds nothing', 'Failed seller imports'], alerts:['CDC more than 2 minutes behind', 'Cache hit ratio below 85%', 'Search p99 above 500 ms'], dash:'Reads, cache, search health, index delay and seller activity.'},
  review:['One source of truth, with copies made only for reading: ✓', 'Checkout checks the price against the source of truth: ✓', 'The cache is cleared on every write: ✓', 'Next: a separate inventory service for flash sales (see the Amazon case)'],
  refs:['l:cache-strategies', 'l:cdc', 'l:elasticsearch', 'case:amazon']});
})();
