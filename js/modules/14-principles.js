/* =====================================================================
   PART 8 · MODULE 14 — DESIGN PRINCIPLES BRIDGE
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, esc, clamp, fmtNum} = SDA.u; const ui = SDA.ui;
const {sortGame, orderGame} = SDA.m1helpers; const {frag} = SDA.ph;

/* ---------- widgets ---------- */
function rightSizer(host){
  const P = {rps:50, eng:3, dataGB:20, money:true, spiky:false, global:false, realtime:false, search:false};
  const out = el('div');
  function run(){
    const need = [], notYet = [];
    need.push(['One deployable app (modular monolith)', P.eng <= 25 ? `${P.eng} engineers can own one codebase with clear modules; split services later along proven boundaries.` : 'Many teams: consider splitting into a few services along bounded contexts.']);
    need.push(['Managed relational DB (Postgres/MySQL) + read replica', P.dataGB < 2000 ? `${fmtNum(P.dataGB)} GB fits comfortably in one primary; transactions and joins for free.` : 'Large data: plan partitioning/sharding for the biggest tables.']);
    need.push(['Load balancer + 2–3 stateless app instances across AZs', 'Redundancy and zero-downtime deploys from day one.']);
    if (P.rps > 1500 || P.spiky) need.push(['Cache (Redis) for hot reads', P.spiky ? 'Spiky traffic: absorb read bursts.' : `${fmtNum(P.rps)} req/s: keep hot reads off the DB.`]); else notYet.push(['Distributed cache', `${fmtNum(P.rps)} req/s is easily served by the DB with indexes; add Redis when profiling shows hot reads.`]);
    need.push(['Background job queue', 'Receipts and emails off the request path (a DB-backed queue or SQS is enough).']);
    if (P.rps > 20000) need.push(['Event streaming (Kafka) + more service boundaries', 'High volume and many consumers justify a log.']); else notYet.push(['Kafka / event streaming', 'A simple queue covers async work until you have many independent consumers or replay needs.']);
    if (P.dataGB > 5000 || P.rps > 50000) need.push(['Sharding / distributed DB', 'Single-primary write limits or data size are in sight.']); else notYet.push(['Sharding / NoSQL migration', 'A single well-indexed primary handles this; vertical scaling + replicas first.']);
    if (P.eng > 25) need.push(['Microservices per bounded context + platform team', 'Team scale is the main reason to split.']); else notYet.push(['Microservices + service mesh', `With ${P.eng} engineers, network calls, distributed transactions and on-call overhead cost more than they save.`]);
    if (P.global) need.push(['CDN + multi-region read replicas', 'Global users need edge caching; full multi-region writes only if required.']); else notYet.push(['Multi-region active-active', 'Multi-AZ in one region meets most availability targets.']);
    if (P.realtime) need.push(['WebSocket/SSE gateway', 'Live updates need a connection tier.']);
    if (P.search) need.push(['Search index (Postgres full-text first, Elasticsearch/OpenSearch when needed)', 'Start with the DB’s full-text search; move when relevance or scale demands.']);
    if (P.money) need.push(['Idempotency keys + transactional outbox', 'Ride payments must be exactly-once in effect.']);
    out.innerHTML = '';
    out.append(el('div', {class:'grid c2'}, el('div', {class:'card'}, el('b', null, '✅ Build now'), frag(h.list(need.map(([a, b]) => `<b>${a}</b>: ${b}`)))), el('div', {class:'card'}, el('b', null, '⏳ Not yet (YAGNI)'), frag(h.list(notYet.map(([a, b]) => `<b>${a}</b>: ${b}`))))));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Peak requests per second', min:10, max:200000, step:10, value:P.rps, fmt:v => fmtNum(v), onInput:v => { P.rps = v; run(); }}).el,
    ui.slider({label:'Engineers', min:1, max:300, value:P.eng, fmt:v => String(v), onInput:v => { P.eng = v; run(); }}).el,
    ui.slider({label:'Data size', min:1, max:50000, step:1, value:P.dataGB, fmt:v => fmtNum(v) + ' GB', onInput:v => { P.dataGB = v; run(); }}).el),
    el('div', {class:'controls', style:{margin:'8px 0'}}, ui.toggle({label:'Handles money', checked:true, onChange:v => { P.money = v; run(); }}).el, ui.toggle({label:'Spiky traffic (rainy-day rush, events)', checked:false, onChange:v => { P.spiky = v; run(); }}).el, ui.toggle({label:'Global users', checked:false, onChange:v => { P.global = v; run(); }}).el, ui.toggle({label:'Live updates', checked:false, onChange:v => { P.realtime = v; run(); }}).el, ui.toggle({label:'Search', checked:false, onChange:v => { P.search = v; run(); }}).el), out,
    el('p', {class:'lab-hint'}, 'A rule-of-thumb guide, not a law. Thresholds are illustrative. Measure your own system before adding complexity.'));
  run();
}
function patternExplorer(host){
  const PAT = [
    {id:'observer', label:'Observer → pub/sub', code:`// In code: subjects notify registered observers
class RideEvents {
  private subs: Array<(r: Ride) => void> = [];
  subscribe(fn: (r: Ride) => void) { this.subs.push(fn); }
  ended(r: Ride) { this.subs.forEach(fn => fn(r)); }   // publisher doesn't know who listens
}
events.subscribe(sendReceiptEmail);
events.subscribe(updateRiderPoints);`, sys:'At system scale the same idea is <b>pub/sub and event-driven architecture</b>: Rides publishes <code>RideEnded</code> to Kafka/SNS, and receipts, points and analytics subscribe independently. Gains: decoupling and independent scaling. Costs: eventual consistency, harder tracing, duplicate delivery (consumers must be idempotent).'},
    {id:'strategy', label:'Strategy → pluggable policies', code:`// In code: swap an algorithm behind one interface
interface PricingRule { fare(ride: Ride): number; }
class PerMinute implements PricingRule { fare(r: Ride) { return r.minutes * 2; } }
class DayPass implements PricingRule { fare(r: Ride) { return 0; } }
const pricing = config.city === 'pune' ? new DayPass() : new PerMinute();`, sys:'At system scale: <b>configurable policies</b>, such as load-balancing algorithms (round robin, least request, ring hash), cache eviction (LRU/LFU), retry policies, and ABR algorithms in video players. Behaviour changes by config, not code changes.'},
    {id:'factory', label:'Factory → provisioning by config', code:`// In code: create the right implementation from configuration
function paymentFor(cfg: { kind: 'stripe' | 'razorpay' | 'fake'; key: string }): PaymentGateway {
  switch (cfg.kind) {
    case 'stripe':   return new StripeGateway(cfg.key);
    case 'razorpay': return new RazorpayGateway(cfg.key);
    case 'fake':     return new FakeGateway();   // dev & tests
  }
}`, sys:'At system scale: <b>templates and platform “golden paths”</b>, such as an IaC module or service template that stamps out a standard service (load balancer, autoscaling, dashboards, alerts) from a few parameters, and tenant provisioning that creates a pooled or siloed stack depending on plan.'},
    {id:'breaker', label:'Circuit breaker → resilience layer', code:`// In code: wrap a dependency call
const breaker = new CircuitBreaker(callPaymentGateway, { failureRate: 50, minCalls: 20, openMs: 10_000 });
try { return await breaker.fire(ride); }
catch (e) { if (e instanceof BreakerOpenError) return { status: 'PENDING', retryLater: true }; throw e; }`, sys:'At system scale: <b>service-mesh circuit breaking and outlier ejection</b> (Envoy), bulkheads per dependency, and region-level traffic shifting. They are the same state machine applied to hosts, clusters and regions.'},
    {id:'repository', label:'Repository → data ownership', code:`// In code: the domain talks to an interface, not to SQL
interface RideRepository { byId(id: string): Promise<Ride | null>; save(r: Ride): Promise<void>; }
class PgRideRepository implements RideRepository {
  async byId(id: string) { const r = await db.query('SELECT * FROM rides WHERE id = $1', [id]); return r.rows[0] ? toRide(r.rows[0]) : null; }
  async save(r: Ride) { /* INSERT … ON CONFLICT … */ }
}`, sys:'At system scale: <b>one service owns each dataset</b> and exposes it through an API or events, never through shared tables. It also enables the strangler-fig and database migrations: swap the implementation behind the repository without touching domain logic.'}];
  const list = PAT.map(p => ({id:p.id, label:p.label, render:panel => { panel.append(frag(h.code('ts', p.code, p.label.split(' →')[0] + '.ts')), frag(h.callout('info', '🏗 At system scale', p.sys))); }}));
  ui.tabs(host, list, {initial:'observer'});
}
function tradeoffMatrix(host){
  const OPTS = ['Postgres', 'Redis', 'DynamoDB'];
  const CRIT = [{id:'write', label:'Handles 4,000 writes a second', w:4, s:[3, 5, 4]}, {id:'read', label:'Fast “bikes near me” map reads', w:4, s:[3, 5, 2]}, {id:'dur', label:'Keeps data if a machine fails', w:2, s:[5, 2, 5]}, {id:'ops', label:'Low operational burden', w:2, s:[3, 3, 5]}, {id:'query', label:'Flexible queries (history, reports)', w:1, s:[5, 1, 2]}, {id:'cost', label:'Low cost at this size', w:1, s:[4, 2, 3]}];
  const out = el('div');
  function scores(){ return OPTS.map((_, i) => CRIT.reduce((a, c) => a + c.w * c.s[i], 0)); }
  function run(){
    const s = scores(); const best = s.indexOf(Math.max(...s));
    out.innerHTML = '';
    out.append(frag(h.table(['Criterion (weight)', ...OPTS], CRIT.map(c => [`${c.label} (×${c.w})`, ...c.s.map(x => '●'.repeat(x) + '<span style="opacity:.25">' + '●'.repeat(5 - x) + '</span>')]).concat([['<b>Weighted score</b>', ...s.map((x, i) => i === best ? `<b style="color:var(--ok)">${x} ✔</b>` : String(x))]]), [])));
    const flips = [];
    CRIT.forEach(c => { for (const d of [1, 2, -1, -2]){ const w0 = c.w, w1 = clamp(w0 + d, 0, 5); if (w1 === w0) continue; c.w = w1; const s2 = scores(); const b2 = s2.indexOf(Math.max(...s2)); c.w = w0; if (b2 !== best){ flips.push(`${w1 > w0 ? 'raising' : 'lowering'} “${c.label}” to ×${w1} makes <b>${OPTS[b2]}</b> win`); break; } } });
    out.append(el('div', {class:'verdict ' + (flips.length ? 'warn' : 'ok'), html:flips.length ? `Sensitivity: the decision is fragile. ${flips.slice(0, 3).join('; ')}. Say this out loud in a design review: it shows which assumption matters.` : 'Robust: no single ±2 weight change flips the winner.'}));
  }
  host.append(el('p', {class:'lab-hint'}, 'Scenario: where the bike app stores live bike locations (20,000 bikes, a location every 5 seconds). Drag the weights to match your own needs. Scores are illustrative judgements on a 1–5 scale.'),
    el('div', {class:'ctl-grid'}, ...CRIT.map(c => ui.slider({label:c.label, min:0, max:5, value:c.w, fmt:v => '×' + v, onInput:v => { c.w = v; run(); }}).el)), out);
  run();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'solid', title:'SOLID, from classes to services', minutes:11, tags:['SOLID','single responsibility','open/closed','Liskov','interface segregation','dependency inversion'],
  summary:'SOLID is five habits that keep code easy to change. Each one has a system-scale twin: single-purpose services, extension points, honest contracts, small APIs and depending on contracts instead of internals.',
  problem:`<h3>A small example</h3><p>A bike-sharing app has one <code>RideService</code> class. It prices rides, charges cards, sends SMS and writes to the database.</p><ul><li>The class is 4,000 lines long.</li><li>Tests need a real database.</li><li>Changing the SMS vendor touches 40 files.</li></ul><p>A new city wants a different price rule. How can we add it without breaking the rest?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>We fix <code>RideService</code> one principle at a time. The five letters spell SOLID.</p>',
    steps:[
      {icon:'🧩', title:'S: one job per part', text:'Pricing, payment and SMS become separate parts. A change to SMS cannot break pricing.'},
      {icon:'➕', title:'O: add, do not edit', text:'A new city rule is a new class. The old code stays closed to edits but open to additions.'},
      {icon:'🔁', title:'L: honest substitutes', text:'A second payment provider must behave like the first, including how it reports errors. Then callers need no special cases.'},
      {icon:'✂️', title:'I: small contracts', text:'The rider app needs the bike’s price and status, not 90 fields. Give each client a small contract.'},
      {icon:'🔌', title:'D: depend on contracts', text:'Ride logic talks to a “payment contract”, not to one vendor’s SDK. Vendors plug in behind it.'}
    ],
    stepper:{title:'Five principles, two scales', items:[
      {title:'S: Single responsibility', tag:'one reason to change', text:'<b>Code:</b> a part has one reason to change, so pricing and SMS live apart. <b>System:</b> a service owns one business capability and its data, such as Rides or Payments, so one team can change it alone.'},
      {title:'O: Open/closed', tag:'extend, don’t edit', text:'<b>Code:</b> a new city price rule is a new class, not another branch in a giant if-else. <b>System:</b> events, plugins and webhooks let new features attach without changing the core.'},
      {title:'L: Liskov substitution', tag:'honest contracts', text:'<b>Code:</b> a new payment class must work wherever the old one worked. <b>System:</b> a v2 service behind an API must keep the same errors, retries and speed promises.'},
      {title:'I: Interface segregation', tag:'small APIs', text:'<b>Code:</b> many small interfaces beat one fat one. <b>System:</b> the rider app, the repair crew app and the admin site each get a focused API, so a change for one does not ripple to the others.'},
      {title:'D: Dependency inversion', tag:'depend on contracts', text:'<b>Code:</b> ride logic depends on a payment contract, and each vendor implements it. <b>System:</b> services depend on API and event contracts, not on another team’s database.'}]},
    html:`<h3>Everyday comparison</h3><p>Think of a bike repair shop.</p><div class="simple-table">${h.table(['Repair shop', 'In the app'], [['One mechanic per job: tyres, brakes, paint', 'One part per job.'], ['A new tool is added to the wall, the shop is not rebuilt', 'A new rule is added as new code.'], ['Any trained mechanic can fix a flat tyre', 'Any payment class works in the same place.']])}</div><div class="callout tip"><b>Important point</b><p>All five ask one thing: when a change comes, how many places must we touch? Fewer is better.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Change that keeps coming', 'Principle that helps'], [['New city price rules', 'O: add a class.'], ['Switching SMS or payment vendor', 'D: plug in behind a contract.'], ['One team blocked by another team’s code', 'S: split by job and owner.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Today a change of SMS vendor touches 40 files. After the split, ride logic calls one SMS contract. A vendor change means 1 new adapter file and 1 changed line that picks it. That is 2 places, not 40.</p><p>For price rules, say 3 cities have 3 rule classes. A 4th city adds 1 new file and edits 0 old ones. With an if-else chain, it edits the one function all 4 cities share, so all 4 need retesting.</p><h4>When it goes wrong</h4><p>A substitute must keep the promises, not only the method names. Say provider A returns "declined" as a normal answer. A new provider B throws an error instead. Ride code written for A now crashes on B. The same happens between services. If v1 answers in 50 ms and v2 in 200 ms, a caller with a 100 ms timeout breaks. You will learn timeouts in Module 9.</p><h4>How it works inside</h4><p>The rider app needs 2 of the 90 fields. That leaves 88 ÷ 90, about 98%, it never reads. If it depends on all 90, it can break when any of those 88 change.</p><h4>In code</h4><p>Here is the same ride flow before and after the split. Ride logic knows only contracts, and vendors plug in from outside.</p>${h.code('ts', `// Before: one class does everything, hard-wired to vendors
class RideService {
  async endRide(r) { const fare = /* pricing */; await stripe.charge(r.card, fare); await twilio.sms(r.phone, 'Ride ended'); await pg.query('INSERT …'); }
}

// After: single responsibilities + dependency inversion (ports) + open for extension
interface PaymentGateway { charge(rideId: string, paise: number): Promise<'ok' | 'declined'>; }
interface PricingRule { fare(ride: Ride): number; }          // one class per city or pass
class EndRide {
  constructor(private pricing: PricingRule, private pay: PaymentGateway, private repo: RideRepository, private events: EventBus) {}
  async run(cmd: EndRideCmd) {
    const ride = Ride.finish(cmd, this.pricing.fare(cmd.ride));
    ride.markPaid(await this.pay.charge(ride.id, ride.farePaise) === 'ok');
    await this.repo.save(ride);
    await this.events.publish('RideEnded', ride);   // SMS, points and analytics subscribe: open for extension
  }
}`, 'solid.ts')}`
  },
  tradeoffs:{use:[`Parts that change often or have several versions, such as city price rules, payment providers and SMS vendors.`], avoid:[`An interface with only one implementation and no test need.`, `Splitting a small, cohesive module just to follow “S”.`], alt:[`Plain, direct code for stable parts, such as the bike unlock code.`, `Refactor toward SOLID when the second variation really appears.`]},
  real:[
    {co:'Robert C. Martin', tier:'confirmed', text:'Martin collected these principles in “Design Principles and Design Patterns” (2000). Michael Feathers later coined the SOLID acronym. Liskov substitution comes from Barbara Liskov’s 1987 keynote.', src:'Martin, Design Principles and Design Patterns (2000); Liskov, “Data Abstraction and Hierarchy” (1987)'},
    {co:'Shopify', tier:'confirmed', text:'Shopify kept a large Rails monolith but enforced component boundaries and public interfaces between components. That applies these ideas at the module level instead of splitting everything into services.', src:'Shopify Engineering, “Deconstructing the Monolith” (2019)'}
  ],
  mistakes:[`Building a god class or a god service that every team must change.`, `Letting one service read another service’s tables, which breaks “D” at system scale.`, `Adding interfaces before a second implementation exists.`],
  interview:[`When you draw service boundaries, say “one capability and its data per service, and services talk through contracts, not shared tables”.`],
  tryit:[
    {note:'Which principle does each smell break?', mount:host => sortGame(host, [
      {t:'The Billing service also sends marketing emails', c:'s', why:'Two reasons to change.'},
      {t:'Adding a new city means editing a 300-line if-else in pricing', c:'o', why:'Not open for extension.'},
      {t:'A “cached” bike repository silently returns old locations where callers expect fresh ones', c:'l', why:'It breaks the promise callers rely on.'},
      {t:'The rider app must call a 90-field bike endpoint just to show a battery level', c:'i', why:'Clients depend on things they do not use.'},
      {t:'The Reports service queries the Rides team’s database tables directly', c:'d', why:'It depends on an internal detail, not a contract.'}
    ], [{id:'s', label:'S'}, {id:'o', label:'O'}, {id:'l', label:'L'}, {id:'i', label:'I'}, {id:'d', label:'D'}])},
    {quiz:[
      {q:'At system scale, “single responsibility” most closely means…', options:['One server per service', 'One database table per service', 'A service owns one business capability and its data', 'One endpoint per service'], answer:2, why:'It is the same idea as a bounded context.'},
      {q:'The app adds Pune with a new price rule. Which design needs no edit to the old pricing code?', options:['A bigger if-else', 'Copying the whole service', 'One class per city that follows a shared pricing contract', 'A new database'], answer:2, why:'That is open/closed: add a class, keep the old code.'}
    ], quizId:'pr-l1'}
  ],
  sources:[`Martin, Design Principles and Design Patterns (2000); Clean Architecture (2017)`, `Liskov (1987)`, `Shopify Engineering (2019)`]
},
{
  id:'kiss-yagni-soc', title:'KISS, YAGNI and separation of concerns', minutes:10, tags:['KISS','YAGNI','separation of concerns','simplicity','over-engineering'],
  summary:'Build the simplest design that meets today’s needs, and do not build for imagined futures. Keep rules, data and integrations in separate parts so later change stays cheap.',
  problem:`<h3>A small example</h3><p>A 3-person startup runs a bike-sharing app for 500 riders. A teammate wants 6 microservices, a message queue and Kubernetes “to scale like Uber”.</p><ul><li>250 bikes on the road report a location every 5 seconds: 250 ÷ 5 = 50 requests a second.</li><li>One Postgres database can serve that easily.</li><li>Every extra part needs someone on call.</li></ul><p>What do we build now, and what do we leave for later?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>The team decides in five small moves.</p>',
    steps:[
      {icon:'🎯', title:'KISS: keep it simple', text:'Pick the simplest design that meets today’s needs and the next 10 times growth. Here that is one app and one database.'},
      {icon:'🚫', title:'YAGNI: do not build it yet', text:'“You aren’t gonna need it.” Skip Kafka and extra services until real numbers ask for them.'},
      {icon:'🗂️', title:'Separate the concerns', text:'Inside the one app, keep pricing, payment and notifications in separate modules. Each can change without touching the others.'},
      {icon:'📝', title:'Write down the triggers', text:'Note what would change the design, such as “above 5,000 requests a second, add a cache”. This is planning without building.'},
      {icon:'🔄', title:'Check the numbers again', text:'Look at traffic and team size every few months. Simple is where you start, not where you must stay.'}
    ],
    mount:host => rightSizer(host),
    html:`<h3>Everyday comparison</h3><p>Think of opening a bike rental stall.</p><div class="simple-table">${h.table(['Rental stall', 'In the app'], [['Start with 10 bikes and one repair stand', 'One app, one database.'], ['Keep bikes, cash box and tools in separate places', 'Separate modules.'], ['Open a second stall when queues form', 'Add parts when the numbers say so.']])}</div><div class="callout tip"><b>Important point</b><p>Simple does not mean careless. Safe payments and backups are needed even in version 1.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Situation', 'Choice'], [['3 engineers, 50 requests a second', 'One app and one database.'], ['40 engineers blocking each other in one codebase', 'Split along the module lines you already kept.'], ['Money moves between riders and the company', 'Add safe retries and backups now.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say each of 6 services is up 99.9% of the time, and ending a ride needs all 6. Then 0.999⁶ is about 0.994, or 99.4%. A 30-day month has 43,200 minutes. The missing 0.6% is 43,200 × 0.006 = about 259 minutes, or 4.3 hours.</p><p>One app and one database, both at 99.9%, give 0.999 × 0.999 = about 0.998. That is about 86 minutes a month. Each extra part also adds on-call work and more places to trace a fault.</p><h4>When it goes wrong</h4><p>Simple does not mean every choice is easy to undo. Some choices are one-way doors, such as the data model, public APIs and how money moves. Say a payment is saved without a unique ride ID. Retrying it safely later is hard. Spend design time on these. Choose fast on two-way doors, such as an internal library.</p><h4>How it works inside</h4><p>Fred Brooks (1986) split complexity in two. Pricing rules and bike locking are essential, because the problem needs them. Extra tools and layers are accidental, because we chose them.</p>`
  },
  tradeoffs:{use:[`Start the bike app as one app with clear modules, one relational database and managed services. Add parts when metrics demand it.`], avoid:[`Distributed designs for a 3-person team at 50 requests a second.`, `Gold-plating features no rider asked for.`], alt:[`Design seams now, such as module boundaries, so extracting a service later is easy.`]},
  real:[
    {co:'Segment', tier:'confirmed', text:'Segment wrote about moving from more than 140 microservices for its destination integrations back to a single service, because the operating overhead outweighed the benefits for that workload.', src:'Segment Engineering, “Goodbye Microservices: From 100s of problem children to 1 superstar” (2018)'},
    {co:'Kent Beck / XP', tier:'confirmed', text:'YAGNI comes from Extreme Programming. It advises against building functionality before it is needed.', src:'Beck, Extreme Programming Explained (1999); Fowler, “Yagni” (2015)'}
  ],
  mistakes:[`Choosing an architecture because big companies use it, not because your load needs it.`, `Adding a queue, a cache and a second database “just in case”.`, `Mixing price rules into controllers and SQL, so every change touches everything.`],
  interview:[`Start simple, state the scaling triggers, and evolve the design step by step. Interviewers reward this over a design full of buzzwords.`],
  tryit:{note:'Set the sliders above to the bike app today, then to a much bigger version, and watch the “Not yet” list shrink. Then check yourself.', quiz:[{q:'A 5-engineer team at 300 requests a second asks whether to adopt microservices. Best answer?', options:['Yes, always', 'Use serverless for everything', 'A modular monolith with clear boundaries, and extract services when team size or scaling needs demand it', 'Rewrite in Go first'], answer:2, why:'Distributed complexity costs more than it saves at this scale.'}, {q:'What does YAGNI tell the bike team about Kafka?', options:['Never use it', 'Add it only when real needs, such as many independent consumers, appear', 'Use it from day one', 'Use it instead of a database'], answer:1, why:'Build seams for change, not the whole future.'}], quizId:'pr-l2'},
  sources:[`Brooks, “No Silver Bullet” (1986)`, `Segment Engineering (2018)`, `Beck, Extreme Programming Explained (1999)`]
},
{
  id:'patterns-in-sd', title:'Design patterns that reappear in system design', minutes:11, tags:['Observer','Strategy','Factory','Circuit Breaker','Repository','patterns'],
  summary:'Patterns from everyday code reappear at system scale. Observer becomes pub/sub, Strategy becomes pluggable policies, Factory becomes templates, Circuit Breaker becomes mesh resilience, and Repository becomes data ownership.',
  problem:`<h3>A small example</h3><p>In a design review someone says “use pub/sub when a ride ends” and “make pricing pluggable”.</p><ul><li>When a ride ends, a receipt, points and analytics must all react.</li><li>Each city has its own price rule.</li><li>The payment provider is sometimes down.</li></ul><p>These are code patterns the team already knows. How do they look when the parts are separate services?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Five patterns show up in the bike app. Open each one below to see its code form and its system-scale twin.</p>',
    steps:[
      {icon:'👂', title:'Observer', text:'When a ride ends, the receipt, points and analytics each react. The ride code does not know who is listening.'},
      {icon:'🎛️', title:'Strategy', text:'Each city’s price rule is a swappable piece. Config picks the one to use.'},
      {icon:'🏭', title:'Factory', text:'One function reads config and creates the right payment provider.'},
      {icon:'⚡', title:'Circuit breaker', text:'If payments keep failing, stop calling for a while and answer “payment pending”. Then try again.'},
      {icon:'🗄️', title:'Repository', text:'Ride logic asks a repository for rides and never writes SQL. At system scale, only the Rides service touches ride tables.'}
    ],
    mount:host => patternExplorer(host),
    html:`<h3>Everyday comparison</h3><p>Think of a bike shop.</p><div class="simple-table">${h.table(['Bike shop', 'Pattern'], [['A notice board: pin a note and everyone who cares reads it', 'Observer.'], ['A fuse box that trips when the current is too high', 'Circuit breaker.'], ['A front desk: customers ask the desk and never walk into the stockroom', 'Repository pattern.']])}</div><div class="callout tip"><b>Important point</b><p>A pattern is a name for a problem and its usual answer. Use one only when its problem is really there.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Problem in the bike app', 'Pattern'], [['Many things must react to one event', 'Observer pattern, or pub/sub.'], ['Rules differ by city', 'Strategy pattern.'], ['A dependency keeps failing', 'Circuit breaker.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the breaker opens when 50% of calls fail, after at least 20 calls, and stays open for 10 seconds. The 20-call minimum matters. Without it, 1 failure in 2 calls is 50% and would trip it.</p><p>Say 5 rides end each second, and each payment call waits 3 seconds before giving up. With no breaker, 5 × 3 = 15 calls are stuck waiting at any moment. With the breaker open, calls fail at once and riders see "payment pending". In 10 seconds, 5 × 10 = 50 rides get that answer without touching the provider.</p><h4>When it goes wrong</h4><p>Observer and pub/sub may deliver one event twice. Then points could be added twice. Make each listener safe to repeat, for example by recording the ride IDs it already counted. You will learn this in Module 7.</p><h4>How it works inside</h4><p>Strategy multiplies what you must test. With 3 price rules and 2 payment providers, there are 3 × 2 = 6 combinations to think about.</p>`
  },
  tradeoffs:{use:[`When the problem is present: several city rules, many listeners to a ride-ended event, a fragile payment provider, or data that one service should own.`], avoid:[`Pattern-driven design, such as “we need a factory” with no concrete need.`], alt:[`Plain functions and direct calls for simple, stable paths, such as unlocking a bike.`]},
  real:[
    {co:'Gang of Four', tier:'confirmed', text:'Gamma, Helm, Johnson and Vlissides catalogued 23 object-oriented patterns, including Observer, Strategy and Factory Method, in Design Patterns (1994).', src:'Gamma et al., Design Patterns: Elements of Reusable Object-Oriented Software (1994)'},
    {co:'Envoy load-balancing policies', tier:'confirmed', text:'Envoy offers interchangeable load-balancing policies, such as round robin, least request and ring hash, chosen by configuration. That is the Strategy pattern at infrastructure scale.', src:'Envoy documentation, Load balancing'}
  ],
  mistakes:[`Using events for everything with no list of who consumes what.`, `Repositories that expose database internals to callers.`, `Naming a pattern without saying its trade-off.`],
  interview:[`Name the pattern and its trade-off: “pub/sub here decouples receipts from rides, at the cost of eventual consistency and consumers that must handle duplicates”.`],
  tryit:[
    {note:'Which pattern is this, at system scale?', mount:host => sortGame(host, [
      {t:'Ride-ended events are consumed separately by receipts, points and analytics', c:'obs', why:'Observer, as pub/sub.'},
      {t:'A config flag switches the cache between LRU and LFU eviction', c:'str', why:'Strategy.'},
      {t:'The mesh stops sending traffic to a Payments host after 5 errors in a row', c:'cb', why:'Circuit breaker, as outlier ejection.'},
      {t:'Only the Rides service reads and writes ride tables, and others call its API', c:'rep', why:'Repository, as data ownership.'},
      {t:'A service template creates the load balancer, autoscaling and dashboards from 5 settings', c:'fac', why:'Factory.'}
    ], [{id:'obs', label:'Observer'}, {id:'str', label:'Strategy'}, {id:'fac', label:'Factory'}, {id:'cb', label:'Circuit breaker'}, {id:'rep', label:'Repository'}])},
    {quiz:[
      {q:'Pub/sub is the system-scale form of which pattern?', options:['Factory', 'Repository', 'Observer', 'Singleton'], answer:2, why:'Publishers do not know their subscribers.'},
      {q:'What is the main cost of using events for everything?', options:['Events are always slow', 'It is hard to see who reacts to what, so you need a list of consumers and tracing', 'Events need a bigger database', 'Events cannot be retried'], answer:1, why:'Hidden control flow is the price of decoupling.'}
    ], quizId:'pr-l3'}
  ],
  sources:[`Gamma et al. (1994)`, `Fowler, Patterns of Enterprise Application Architecture (2002)`, `Richardson, Microservices Patterns (2018)`]
},
{
  id:'tradeoff-thinking', title:'“Everything is a trade-off”: thinking like an architect', minutes:11, tags:['trade-offs','decision matrix','ADR','reversibility','sensitivity'],
  summary:'There is rarely a best design, only a best fit for your needs. List the criteria, weigh them, check which assumption could flip the choice, and write the decision down.',
  problem:`<h3>A small example</h3><p>The bike app must store live bike locations. Two engineers argue for an hour. One wants Redis, the other wants Postgres.</p><ul><li>20,000 bikes report a location every 5 seconds: 20,000 ÷ 5 = 4,000 writes a second.</li><li>The rider map must show nearby bikes fast.</li><li>Trip history must be kept safely.</li></ul><p>Both engineers are right about something. How do we decide without going in circles?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>The team follows five steps and uses the matrix below.</p>',
    steps:[
      {icon:'📋', title:'State the needs first', text:'Write down scale, speed, safety, team skills and budget. Argue about options only after that.'},
      {icon:'🔀', title:'List real options', text:'Name at least two, such as Postgres, Redis and DynamoDB. Include the simplest one.'},
      {icon:'⚖️', title:'Score with weights', text:'Give each criterion a weight, then score every option. A matrix makes the judgements visible.'},
      {icon:'🔬', title:'Test what could flip it', text:'Find the assumption that, if wrong, changes the winner. Test that one with a small benchmark.'},
      {icon:'🗒️', title:'Decide and record it', text:'Write a short decision record with the context, the choice, what you give up, and when to look again.'}
    ],
    mount:host => tradeoffMatrix(host),
    html:`<h3>Everyday comparison</h3><p>Think of getting to work by scooter, car or metro.</p><div class="simple-table">${h.table(['Choice', 'Wins when you care about'], [['Scooter', 'Cost and speed in traffic.'], ['Car', 'Comfort in the rain.'], ['Metro', 'Being on time.']])}</div><div class="callout tip"><b>Important point</b><p>None is best everywhere. Change what you care about, or where you live, and the answer changes.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Question in the bike app', 'What we do'], [['Which store is fastest?', 'Fast for what? Write, read or both.'], ['Which store is safest?', 'Add “keeps data if a machine fails” as a criterion.'], ['What if our guess is wrong?', 'Find the guess that flips the winner and test it.']])}</div>`,
    deep:`<h4>The numbers</h4><p>In the weighted matrix, Redis scores 4 × 5 + 4 × 5 + 2 × 2 + 2 × 3 + 1 × 1 + 1 × 2 = 20 + 20 + 4 + 6 + 1 + 2 = 53. Postgres scores 12 + 12 + 10 + 6 + 5 + 4 = 49. Now raise the weight on "Keeps data if a machine fails" from 2 to 4. Postgres gains 2 × 5 = 10 and reaches 59. Redis gains 2 × 2 = 4 and reaches 57. One small change flips the winner.</p><h4>When it goes wrong</h4><p>The size of the data depends on the question. The latest location only is 20,000 bikes × 100 bytes, say, which is 2,000,000 bytes, or 2 MB. Full history is 4,000 writes × 86,400 seconds = 345,600,000 writes a day. At 100 bytes each, that is about 34.6 GB a day. A combination can beat any single store.</p><h4>How it works inside</h4><p>A decision record (Michael Nygard, 2011) has a title, status, context, decision and consequences. Add a trigger to look again. For example, at 100,000 bikes, the writes become 100,000 ÷ 5 = 20,000 each second.</p>`
  },
  tradeoffs:{use:[`Any choice that is hard to undo or hotly argued, such as where live bike locations are stored.`], avoid:[`Fake precision. A weighted score is a thinking tool, not an oracle.`, `Long analysis of cheap, reversible choices, such as a map colour.`], alt:[`A time-boxed prototype that gives real numbers.`, `“Disagree and commit” once the process was fair and the decision is written down.`]},
  real:[
    {co:'Fundamentals of Software Architecture', tier:'confirmed', text:'Richards and Ford state their “First Law of Software Architecture”: everything in software architecture is a trade-off, and the “why” is more important than the “how”.', src:'Richards & Ford, Fundamentals of Software Architecture (O’Reilly, 2020)'},
    {co:'Architecture Decision Records', tier:'confirmed', text:'Michael Nygard proposed lightweight decision records for context, decision and consequences. Many teams keep them in their code repositories.', src:'Michael Nygard, “Documenting Architecture Decisions” (2011)'}
  ],
  mistakes:[`Arguing about solutions before agreeing on needs.`, `Showing only one option, as if it were the only one.`, `Not writing down why a decision was made.`],
  interview:[`For each big choice say the alternative, why you chose this one, what you give up, and when you would change your mind.`],
  tryit:[
    {note:'Drag the weights above until the winner flips. Which criterion drives the decision? Then put the steps in order.', mount:host => orderGame(host, ['Agree needs and constraints', 'List at least two real options', 'Score options against weighted criteria', 'Find the assumption that flips the decision and test it', 'Decide and write a decision record with a revisit trigger'])},
    {quiz:[
      {q:'What is the best first step in a contested technology choice?', options:['Pick the most popular option', 'Ask a vendor', 'Benchmark everything', 'Agree on needs and weighted criteria'], answer:3, why:'Decisions follow from criteria.'},
      {q:'What does a sensitivity check tell you?', options:['Which assumption, if wrong, would flip the decision', 'The cost', 'The speed', 'Nothing useful'], answer:0, why:'It shows where to gather evidence.'},
      {q:'A decision record holds…', options:['Code style rules', 'Deployment steps', 'API docs', 'The context, decision and consequences of a choice'], answer:3, why:'It keeps the “why” with the code.'}
    ], quizId:'pr-l4'}
  ],
  sources:[`Richards & Ford, Fundamentals of Software Architecture (2020)`, `Nygard, Documenting Architecture Decisions (2011)`]
}
];

SDA.register({
  kind:'module', id:'principles', order:14, level:'intermediate', icon:'🧩', title:'Design Principles Bridge',
  summary:'SOLID from classes to services; KISS, YAGNI and separation of concerns; the design patterns that reappear at system scale (Observer, Strategy, Factory, Circuit Breaker, Repository); and trade-off thinking with decision matrices and ADRs.',
  outcomes:['Map SOLID principles to service boundaries and contracts', 'Right-size an architecture to real load and team size (KISS/YAGNI)', 'Recognise classic patterns at system scale and state their trade-offs', 'Make, test and record architecture decisions with explicit trade-offs'],
  lessons,
  quiz:[
    {q:'At system scale, the single responsibility principle most closely maps to…', options:['One server per service', 'One endpoint per service', 'One database table per service', 'A service that owns one business capability and its data'], answer:3, why:'It is the same idea as a bounded context.'},
    {q:'The Reports service reads the Rides team’s tables directly. Which principle does this break at system scale?', options:['Liskov', 'Dependency inversion: depend on contracts, not internals', 'KISS', 'Open/closed'], answer:1, why:'Depend on APIs and events instead.'},
    {q:'YAGNI advises…', options:['Never plan ahead', 'Always use microservices', 'Do not build features or infrastructure before they are needed, and design seams instead', 'Avoid tests'], answer:2, why:'Write down the triggers, and build only what is needed.'},
    {q:'Pub/sub is the system-scale form of which pattern?', options:['Factory', 'Observer', 'Repository', 'Singleton'], answer:1, why:'Publishers do not know their subscribers.'},
    {q:'Pluggable load-balancing algorithms are an example of…', options:['Observer', 'Adapter', 'Decorator', 'Strategy'], answer:3, why:'Config swaps the algorithm.'},
    {q:'What is the best first step in a contested technology choice?', options:['Agree on needs and weighted criteria', 'Pick the most popular option', 'Benchmark everything', 'Ask a vendor'], answer:0, why:'Decisions follow from criteria.'},
    {q:'A decision record holds…', options:['Code style rules', 'The context, decision and consequences of a design choice', 'Deployment steps', 'API docs'], answer:1, why:'It keeps the “why” next to the code.'},
    {q:'Which of these is still needed in version 1 of a ride-payment app?', options:['A service mesh', 'Kafka', 'Safe retries so a rider is never charged twice', 'Multi-region active-active'], answer:2, why:'Correctness basics are not over-engineering.'},
    {q:'A sensitivity check in a decision matrix tells you…', options:['The cost', 'The speed', 'Nothing useful', 'Which assumption, if wrong, would flip the decision'], answer:3, why:'It shows where to gather evidence.'},
    {q:'Segment moving more than 140 microservices back into one service shows that…', options:['Microservices always fail', 'Monoliths cannot scale', 'The operating cost of many services can outweigh their benefits for a workload', 'Kafka is required'], answer:2, why:'Fit the design to the problem.'},
    {type:'scenario', q:'The CTO wants to “move to microservices” for a 12-engineer team that runs the bike app as one Rails app at 2,000 requests a second. How do you respond?', answer:'<ol><li>Ask which problem we are solving: slow deploys, one hot spot, team independence or fault isolation. Measure lead time and past incidents.</li><li>Propose a <b>modular monolith</b> first: one module per bounded context, each with its own data, and a build check that blocks cross-module shortcuts.</li><li>Extract a service only with a clear reason. For example, image processing may need its own scaling, and payments may need isolation. Use the strangler fig with a facade.</li><li>State the costs: network failures, distributed transactions (sagas), tracing, on-call load and platform work.</li><li>Write a decision record with triggers to look again, such as more than 30 engineers or a need for independent scaling.</li></ol>'},
    {type:'scenario', q:'Choose a store for the bike app’s ride history: 2 million rides a day, each written once and later read by riders or by reports. Walk through your trade-off reasoning.', answer:'<ul><li><b>Numbers first</b>: 2,000,000 ÷ 86,400 seconds ≈ 23 writes a second. At about 1 KB a ride, that is about 2 GB a day, or about 730 GB a year.</li><li><b>Options</b>: Postgres, a wide-column store such as Cassandra, or DynamoDB.</li><li><b>Trade-off</b>: 23 writes a second is tiny. Postgres gives transactions, joins and easy reports, with no extra system to run. A wide-column store buys write scale we do not need and costs ad-hoc queries.</li><li><b>Sensitivity</b>: if rides grew 100 times to about 2,300 writes a second, a single Postgres primary may still cope, but we should partition by month and add read replicas for reports.</li><li><b>Decision and record</b>: Postgres with monthly partitions. Revisit when yearly data passes a few terabytes or writes pass a few thousand a second.</li></ul>'}
  ],
  cheatsheet:[
    {h:'🧱 SOLID at two scales', items:['S: one reason to change ↔ one capability per service', 'O: add new code ↔ events, plugins, webhooks', 'L: honest substitutes ↔ compatible API versions', 'I: small contracts ↔ focused APIs per client', 'D: depend on contracts ↔ not on another team’s database']},
    {h:'✂️ Keep it simple', items:['KISS: the simplest design that meets today’s needs', 'YAGNI: build seams, not futures', 'Separate pricing, payment and notifications', 'Write down the triggers that would change the design', 'Safe retries and backups are not over-engineering']},
    {h:'🔁 Patterns and their system twins', items:['Observer ↔ pub/sub', 'Strategy ↔ pluggable policies', 'Factory ↔ service templates', 'Circuit breaker ↔ mesh outlier ejection', 'Repository ↔ one service owns each dataset']},
    {h:'⚖️ Trade-offs', items:['Needs → options → weighted criteria', 'Sensitivity: which assumption flips it?', 'Say: choose X because A, give up B, soften with C, revisit when D', 'Decision record: context, decision, consequences', 'One-way doors need care, two-way doors need speed']}
  ],
  glossary:[
    {term:'SOLID', def:'Five habits that keep code easy to change: single responsibility, open/closed, Liskov substitution, interface segregation and dependency inversion. Example: after the split, a new city price rule is a new class, not an edit to old code.'},
    {term:'Single responsibility principle', aka:['SRP'], def:'A part should have only one reason to change. Example: pricing and SMS live in separate parts, so an SMS change cannot break pricing.'},
    {term:'Open/closed principle', aka:['open/closed'], def:'Add new behaviour by adding new code, not by editing old code. Example: Pune’s price rule is a new class, and the old rules are untouched.'},
    {term:'Liskov substitution principle', aka:['LSP', 'Liskov substitution'], def:'A replacement must work everywhere the original worked, with the same promises. Example: a second payment provider reports declines the same way as the first.'},
    {term:'Interface segregation principle', aka:['ISP', 'interface segregation'], def:'Give each client a small contract with only what it needs. Example: the rider app gets bike status and price, not a 90-field bike record.'},
    {term:'Dependency inversion principle', aka:['DIP', 'dependency inversion'], def:'Business logic depends on contracts, and details plug in behind them. Example: ride logic calls a payment contract, and each vendor implements it.'},
    {term:'God class', aka:['god classes', 'god service', 'god services'], def:'One huge class or service that does too many jobs, so every change touches it. Example: a 4,000-line RideService that prices, charges, texts and saves.'},
    {term:'Coupling', def:'How much one part depends on another. Lower is usually better. Example: if ending a ride needs five services deployed together, coupling is high.'},
    {term:'Cohesion', def:'How well the things inside one part belong together. Higher is usually better. Example: everything about fares lives in one pricing module.'},
    {term:'KISS', aka:['keep it simple'], def:'“Keep it simple”: choose the simplest design that meets today’s needs. Example: one app and one database for 500 riders.'},
    {term:'YAGNI', aka:['you aren’t gonna need it'], def:'“You aren’t gonna need it”: do not build something until it is really needed. Example: no Kafka until many independent consumers exist.'},
    {term:'Separation of concerns', def:'Keeping different kinds of work in different parts. Example: pricing, payment and notifications are separate modules in one app.'},
    {term:'Essential complexity', def:'Difficulty that comes from the problem itself. Example: pricing rides by time and city is hard whatever tools you use.'},
    {term:'Accidental complexity', def:'Difficulty we add with our tools and design choices. Example: six services and a message queue for 50 requests a second.'},
    {term:'Design pattern', aka:['design patterns'], def:'A named, reusable answer to a problem that keeps coming back. Example: “Observer” names the idea of many parts reacting to one event.'},
    {term:'Observer pattern', aka:['Observer'], def:'Parts subscribe to a source and are told when it changes. At system scale it becomes pub/sub. Example: receipts, points and analytics all react to RideEnded.'},
    {term:'Strategy pattern', def:'Keep interchangeable rules behind one contract and pick one by config. Example: each city has its own pricing rule.'},
    {term:'Factory pattern', aka:['Factory', 'factory method'], def:'A function that creates the right version of something from config. Example: paymentFor(config) returns the right payment provider.'},
    {term:'Repository pattern', def:'A single place that stores and fetches one kind of data, so other code never writes SQL. Example: ride logic asks RideRepository for rides.'},
    {term:'Decision matrix', aka:['weighted decision matrix'], def:'A table that scores each option against weighted criteria. Example: Postgres, Redis and DynamoDB scored for live bike locations.'},
    {term:'Sensitivity analysis', aka:['sensitivity check'], def:'Checking which assumption, if wrong, would change the decision. Example: if “keeps data if a machine fails” counts double, Redis stops winning.'},
    {term:'Architecture Decision Record', aka:['ADR', 'ADRs', 'decision record', 'decision records'], def:'A short note that records a design choice, its context and its consequences. Example: “We store live bike locations in Redis. Revisit if we need history there.”'},
    {term:'One-way door', aka:['one-way doors'], def:'A decision that is hard to undo, so it deserves careful thought. Example: the data model for rides and payments.'},
    {term:'Two-way door', aka:['two-way doors'], def:'A decision that is easy to undo, so it is fine to decide fast. Example: picking a map colour or a small internal library.'}
  ],
  sources:['Martin, Clean Architecture (2017); Liskov (1987)', 'Gamma et al., Design Patterns (1994); Fowler, PoEAA (2002); Richardson, Microservices Patterns (2018)', 'Brooks, No Silver Bullet (1986); Beck, Extreme Programming Explained (1999)', 'Richards & Ford, Fundamentals of Software Architecture (2020); Nygard, Documenting Architecture Decisions (2011)', 'Segment (2018), Shopify (2019), Stack Overflow (2016) engineering posts']
});
} catch(e){ console.error('[SDA] module principles', e); SDA.errors.push({id:'principles', error:e}); }
})();
