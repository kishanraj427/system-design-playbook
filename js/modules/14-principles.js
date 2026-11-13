/* =====================================================================
   PART 8 · MODULE 14 — DESIGN PRINCIPLES BRIDGE
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, esc, clamp, fmtNum} = SDA.u; const ui = SDA.ui;
const {sortGame, orderGame} = SDA.m1helpers; const {frag} = SDA.ph;

/* ---------- widgets ---------- */
function rightSizer(host){
  const P = {rps:300, eng:6, dataGB:50, money:true, spiky:false, global:false, realtime:false, search:false};
  const out = el('div');
  function run(){
    const need = [], notYet = [];
    need.push(['One deployable app (modular monolith)', P.eng <= 25 ? `${P.eng} engineers can own one codebase with clear modules; split services later along proven boundaries.` : 'Many teams: consider splitting into a few services along bounded contexts.']);
    need.push(['Managed relational DB (Postgres/MySQL) + read replica', P.dataGB < 2000 ? `${fmtNum(P.dataGB)} GB fits comfortably in one primary; transactions and joins for free.` : 'Large data: plan partitioning/sharding for the biggest tables.']);
    need.push(['Load balancer + 2–3 stateless app instances across AZs', 'Redundancy and zero-downtime deploys from day one.']);
    if (P.rps > 1500 || P.spiky) need.push(['Cache (Redis) for hot reads', P.spiky ? 'Spiky traffic: absorb read bursts.' : `${fmtNum(P.rps)} req/s: keep hot reads off the DB.`]); else notYet.push(['Distributed cache', `${fmtNum(P.rps)} req/s is easily served by the DB with indexes; add Redis when profiling shows hot reads.`]);
    need.push(['Background job queue', 'Emails, receipts, image processing off the request path (a DB-backed queue or SQS is enough).']);
    if (P.rps > 20000) need.push(['Event streaming (Kafka) + more service boundaries', 'High volume and many consumers justify a log.']); else notYet.push(['Kafka / event streaming', 'A simple queue covers async work until you have many independent consumers or replay needs.']);
    if (P.dataGB > 5000 || P.rps > 50000) need.push(['Sharding / distributed DB', 'Single-primary write limits or data size are in sight.']); else notYet.push(['Sharding / NoSQL migration', 'A single well-indexed primary handles this; vertical scaling + replicas first.']);
    if (P.eng > 25) need.push(['Microservices per bounded context + platform team', 'Team scale is the main reason to split.']); else notYet.push(['Microservices + service mesh', `With ${P.eng} engineers, network calls, distributed transactions and on-call overhead cost more than they save.`]);
    if (P.global) need.push(['CDN + multi-region read replicas', 'Global users need edge caching; full multi-region writes only if required.']); else notYet.push(['Multi-region active-active', 'Multi-AZ in one region meets most availability targets.']);
    if (P.realtime) need.push(['WebSocket/SSE gateway', 'Live updates need a connection tier.']);
    if (P.search) need.push(['Search index (Postgres full-text first, Elasticsearch/OpenSearch when needed)', 'Start with the DB’s full-text search; move when relevance or scale demands.']);
    if (P.money) need.push(['Idempotency keys + transactional outbox', 'Money movement must be exactly-once in effect.']);
    out.innerHTML = '';
    out.append(el('div', {class:'grid c2'}, el('div', {class:'card'}, el('b', null, '✅ Build now'), frag(h.list(need.map(([a, b]) => `<b>${a}</b>: ${b}`)))), el('div', {class:'card'}, el('b', null, '⏳ Not yet (YAGNI)'), frag(h.list(notYet.map(([a, b]) => `<b>${a}</b>: ${b}`))))));
  }
  host.append(el('div', {class:'ctl-grid'},
    ui.slider({label:'Peak requests per second', min:10, max:200000, step:10, value:P.rps, fmt:v => fmtNum(v), onInput:v => { P.rps = v; run(); }}).el,
    ui.slider({label:'Engineers', min:1, max:300, value:P.eng, fmt:v => String(v), onInput:v => { P.eng = v; run(); }}).el,
    ui.slider({label:'Data size', min:1, max:50000, step:1, value:P.dataGB, fmt:v => fmtNum(v) + ' GB', onInput:v => { P.dataGB = v; run(); }}).el),
    el('div', {class:'controls', style:{margin:'8px 0'}}, ui.toggle({label:'Handles money', checked:true, onChange:v => { P.money = v; run(); }}).el, ui.toggle({label:'Spiky traffic (sales, events)', checked:false, onChange:v => { P.spiky = v; run(); }}).el, ui.toggle({label:'Global users', checked:false, onChange:v => { P.global = v; run(); }}).el, ui.toggle({label:'Live updates', checked:false, onChange:v => { P.realtime = v; run(); }}).el, ui.toggle({label:'Search', checked:false, onChange:v => { P.search = v; run(); }}).el), out,
    el('p', {class:'lab-hint'}, 'A rule-of-thumb guide, not a law. Thresholds are illustrative; measure your own system before adding complexity.'));
  run();
}
function patternExplorer(host){
  const PAT = [
    {id:'observer', label:'Observer → pub/sub', code:`// In code: subjects notify registered observers
class OrderEvents {
  private subs: Array<(o: Order) => void> = [];
  subscribe(fn: (o: Order) => void) { this.subs.push(fn); }
  placed(o: Order) { this.subs.forEach(fn => fn(o)); }   // publisher doesn't know who listens
}
events.subscribe(sendReceiptEmail);
events.subscribe(updateLoyaltyPoints);`, sys:'At system scale the same idea is <b>pub/sub and event-driven architecture</b>: Ordering publishes <code>OrderPlaced</code> to Kafka/SNS; billing, loyalty and analytics subscribe independently. Gains: decoupling and independent scaling. Costs: eventual consistency, harder tracing, duplicate delivery (consumers must be idempotent).'},
    {id:'strategy', label:'Strategy → pluggable policies', code:`// In code: swap an algorithm behind one interface
interface PickServer { pick(servers: Server[], req: Request): Server; }
class RoundRobin implements PickServer { private i = 0; pick(s: Server[]) { return s[this.i++ % s.length]; } }
class LeastConnections implements PickServer { pick(s: Server[]) { return s.reduce((a, b) => b.active < a.active ? b : a); } }
const lb = new LoadBalancer(config.policy === 'least' ? new LeastConnections() : new RoundRobin());`, sys:'At system scale: <b>configurable policies</b>, such as load-balancing algorithms (round robin, least request, ring hash), cache eviction (LRU/LFU), retry policies, and ABR algorithms in video players. Behaviour changes by config, not code changes.'},
    {id:'factory', label:'Factory → provisioning by config', code:`// In code: create the right implementation from configuration
function storageFor(cfg: { kind: 's3' | 'gcs' | 'local'; bucket: string }): BlobStore {
  switch (cfg.kind) {
    case 's3':    return new S3Store(cfg.bucket);
    case 'gcs':   return new GcsStore(cfg.bucket);
    case 'local': return new LocalDiskStore('/tmp/' + cfg.bucket);   // dev & tests
  }
}`, sys:'At system scale: <b>templates and platform “golden paths”</b>, such as an IaC module or service template that stamps out a standard service (load balancer, autoscaling, dashboards, alerts) from a few parameters, and tenant provisioning that creates a pooled or siloed stack depending on plan.'},
    {id:'breaker', label:'Circuit breaker → resilience layer', code:`// In code: wrap a dependency call
const breaker = new CircuitBreaker(callPaymentGateway, { failureRate: 50, minCalls: 20, openMs: 10_000 });
try { return await breaker.fire(order); }
catch (e) { if (e instanceof BreakerOpenError) return { status: 'PENDING', retryLater: true }; throw e; }`, sys:'At system scale: <b>service-mesh circuit breaking and outlier ejection</b> (Envoy), bulkheads per dependency, and region-level traffic shifting. They are the same state machine applied to hosts, clusters and regions.'},
    {id:'repository', label:'Repository → data ownership', code:`// In code: the domain talks to an interface, not to SQL
interface OrderRepository { byId(id: string): Promise<Order | null>; save(o: Order): Promise<void>; }
class PgOrderRepository implements OrderRepository {
  async byId(id: string) { const r = await db.query('SELECT * FROM orders WHERE id = $1', [id]); return r.rows[0] ? toOrder(r.rows[0]) : null; }
  async save(o: Order) { /* INSERT … ON CONFLICT … */ }
}`, sys:'At system scale: <b>one service owns each dataset</b> and exposes it through an API or events, never through shared tables. It also enables the strangler-fig and database migrations: swap the implementation behind the repository without touching domain logic.'}];
  const list = PAT.map(p => ({id:p.id, label:p.label, render:panel => { panel.append(frag(h.code('ts', p.code, p.label.split(' →')[0] + '.ts')), frag(h.callout('info', '🏗 At system scale', p.sys))); }}));
  ui.tabs(host, list, {initial:'observer'});
}
function tradeoffMatrix(host){
  const OPTS = ['Postgres (sharded later)', 'Cassandra', 'DynamoDB'];
  const CRIT = [{id:'cons', label:'Strong consistency / transactions', w:2, s:[5, 2, 3]}, {id:'write', label:'Write throughput at scale', w:5, s:[3, 5, 5]}, {id:'ops', label:'Low operational burden', w:2, s:[3, 2, 5]}, {id:'query', label:'Flexible queries / joins', w:1, s:[5, 1, 2]}, {id:'cost', label:'Cost predictability', w:1, s:[4, 4, 2]}, {id:'lock', label:'Avoid vendor lock-in', w:1, s:[5, 5, 1]}];
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
  host.append(el('p', {class:'lab-hint'}, 'Scenario: the message store for a chat app with 50K writes/s growing fast. Drag the weights to match YOUR requirements; scores are illustrative judgements on a 1–5 scale.'),
    el('div', {class:'ctl-grid'}, ...CRIT.map(c => ui.slider({label:c.label, min:0, max:5, value:c.w, fmt:v => '×' + v, onInput:v => { c.w = v; run(); }}).el)), out);
  run();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'solid', title:'SOLID, from classes to services', minutes:11, tags:['SOLID','single responsibility','open/closed','Liskov','interface segregation','dependency inversion'],
  summary:'The five SOLID principles keep code changeable, and each has a system-design twin: single-purpose services, extension points, substitutable implementations, small focused APIs, and depending on contracts rather than concrete systems.',
  problem:`<p>Your <code>OrderService</code> class is 4,000 lines: it prices orders, charges cards, sends SMS, writes analytics and talks directly to Postgres and a payment SDK. Every change risks breaking something unrelated, tests need a real database, and switching SMS vendors touches 40 files. The same shape appears at system scale: a “god service” every team must change.</p>`,
  intuition:`A well-run kitchen. Each cook has one station (single responsibility). New dishes are added without rebuilding the stove (open/closed). Any trained cook can cover a station (Liskov). The order slip shows each station only what it needs (interface segregation). Cooks follow the recipe card, not a particular supplier’s packaging (dependency inversion).`,
  how:{
    stepper:{title:'Five principles, two scales', items:[
      {title:'S: Single responsibility', tag:'one reason to change', text:'<b>Code:</b> a module should have one reason to change (pricing ≠ notifications). <b>System:</b> a service owns one business capability and its data (bounded context), so one team can change it alone.'},
      {title:'O: Open/closed', tag:'extend, don’t edit', text:'<b>Code:</b> add new behaviour by adding code (a new payment method class), not editing a giant switch. <b>System:</b> extension points such as events others subscribe to, plugins, webhooks and feature flags let new features attach without changing the core.'},
      {title:'L: Liskov substitution', tag:'honest contracts', text:'<b>Code:</b> a subtype must work wherever its parent is expected (a “read-only” list that throws on add breaks callers). <b>System:</b> a new implementation behind an API (a v2 service, a different DB adapter) must honour the same contract, including errors, idempotency and latency expectations.'},
      {title:'I: Interface segregation', tag:'small APIs', text:'<b>Code:</b> many small interfaces beat one fat one. <b>System:</b> focused APIs per consumer (BFFs, GraphQL fields, separate read/write endpoints) so clients don’t depend on things they don’t use, and changes don’t ripple.'},
      {title:'D: Dependency inversion', tag:'depend on contracts', text:'<b>Code:</b> high-level policy depends on abstractions (ports), and details implement them (adapters). <b>System:</b> services depend on contracts (API schemas, event schemas), not on another team’s database or internals: hexagonal architecture at service scale.'}]},
    html:h.code('ts', `// Before: one class does everything, hard-wired to vendors
class OrderService {
  async place(o) { const total = /* pricing */; await stripe.charge(o.card, total); await twilio.sms(o.phone, 'Placed!'); await pg.query('INSERT …'); }
}

// After: single responsibilities + dependency inversion (ports) + open for extension
interface PaymentGateway { charge(orderId: string, paise: number): Promise<'ok' | 'declined'>; }
interface Notifier { orderPlaced(o: Order): Promise<void>; }
class PlaceOrder {
  constructor(private pricing: Pricing, private pay: PaymentGateway, private repo: OrderRepository, private events: EventBus) {}
  async run(cmd: PlaceOrderCmd) {
    const order = Order.create(cmd, this.pricing.total(cmd));
    order.markPaid(await this.pay.charge(order.id, order.totalPaise) === 'ok');
    await this.repo.save(order);
    await this.events.publish('OrderPlaced', order);   // SMS, analytics etc. subscribe: open for extension
  }
}`, 'solid.ts'),
    deep:`<p><b>Use SOLID as a lens, not a law.</b> Taken too far it produces interfaces with one implementation, factories for everything and code that is hard to follow. Apply it where change actually happens: vendor integrations, business rules that vary by country or tenant, and boundaries between teams.</p><p><b>Coupling and cohesion</b> are the measurable ideas underneath. High cohesion (things that change together live together) and low coupling (few, stable dependencies) matter at every scale: functions, modules, services, teams. A change that requires coordinated deploys of five services means your boundaries are wrong, however “SOLID” each one looks.</p>`
  },
  tradeoffs:{use:[`Code and services that change often or have several implementations (payment providers, notifications, pricing rules)`], avoid:[`Abstractions with a single implementation and no test need`, `Splitting a cohesive module just to “follow S”`], alt:[`Simple, direct code for stable, small parts`, `Refactor toward SOLID when the second variation actually appears`]},
  real:[
    {co:'Robert C. Martin', tier:'confirmed', text:'Martin collected these principles in “Design Principles and Design Patterns” (2000); Michael Feathers later coined the SOLID acronym. Liskov substitution comes from Barbara Liskov’s 1987 keynote on data abstraction.', src:'Martin, Design Principles and Design Patterns (2000); Liskov, “Data Abstraction and Hierarchy” (1987)'},
    {co:'Shopify', tier:'confirmed', text:'Shopify kept a large Rails monolith but enforced component boundaries and public interfaces between components (a modular monolith), applying these principles at the module level instead of splitting everything into services.', src:'Shopify Engineering, “Deconstructing the Monolith” (2019)'},
    {co:'Payment provider swap', tier:'educational', text:'With a PaymentGateway port, adding a second provider for failover is a new adapter plus routing config; order logic doesn’t change.', src:'Simplified educational design'}
  ],
  mistakes:[`God classes and god services`, `Services reading each other’s tables (violates dependency inversion at system scale)`, `Interface explosion before any second implementation exists`],
  interview:[`When discussing service boundaries, mention single responsibility (bounded contexts) and depending on contracts (APIs/events), not shared databases`],
  tryit:{note:'Which principle does each smell violate?', mount:host => sortGame(host, [
    {t:'The Invoice service also sends marketing emails', c:'s', why:'Two reasons to change.'},
    {t:'Adding UPI means editing a 300-line switch in checkout', c:'o', why:'Not open for extension.'},
    {t:'A “cached” repository silently returns stale data where callers expect fresh reads', c:'l', why:'Breaks the contract callers rely on.'},
    {t:'Mobile app must call a 90-field user endpoint to show a name', c:'i', why:'Clients depend on things they don’t use.'},
    {t:'Reporting service queries the Orders team’s database tables directly', c:'d', why:'Depends on a concrete internal, not a contract.'}
  ], [{id:'s', label:'S'}, {id:'o', label:'O'}, {id:'l', label:'L'}, {id:'i', label:'I'}, {id:'d', label:'D'}])},
  sources:[`Martin, Design Principles and Design Patterns (2000); Clean Architecture (2017)`, `Liskov (1987)`, `Shopify Engineering (2019)`]
},
{
  id:'kiss-yagni-soc', title:'KISS, YAGNI and separation of concerns', minutes:10, tags:['KISS','YAGNI','separation of concerns','simplicity','over-engineering'],
  summary:'Most systems fail from unnecessary complexity, not from too little of it. Keep it simple, build what you need now (with room to grow), and separate concerns so that later change is cheap.',
  problem:`<p>A 4-person startup with 200 users builds 14 microservices, Kafka, a service mesh, Kubernetes with three clusters, and a custom feature-flag system “so we can scale like Netflix”. Six months later they ship features slowly, spend weekends debugging distributed tracing, and still have 200 users. Their competitor shipped on one Postgres and a monolith.</p>`,
  intuition:`Starting a tiffin service. You don’t build an industrial kitchen for 10,000 meals on day one. You cook well in a small kitchen, keep the recipes, billing and delivery separate (so you can change one without breaking the others), and expand when orders actually grow.`,
  how:{
    steps:[`<b>KISS</b>: prefer the simplest design that meets today’s requirements and the next order of magnitude; boring, well-understood technology wins.`, `<b>YAGNI</b>: don’t build features or infrastructure for imagined future needs; build the seam where change is likely (an interface, a module boundary), not the whole future system.`, `<b>Separation of concerns</b>: keep UI, business rules, data access and integrations in separate modules; separate read and write paths when they genuinely differ.`, `Write down <b>what would make you change the design</b> (e.g. “when writes exceed 5K/s, shard orders by customer”). That is planning without building.`, `Revisit as metrics change: simplicity is a moving target, not an excuse to never evolve.`],
    mount:host => rightSizer(host),
    deep:`<p><b>Accidental vs essential complexity</b> (Fred Brooks, “No Silver Bullet”, 1986): the problem’s inherent difficulty is essential; everything we add through tools, layers and distribution is accidental. Each new moving part adds failure modes, on-call load and cognitive cost.</p><p><b>Reversible vs irreversible decisions:</b> spend design effort on hard-to-reverse choices (data model, public APIs, money flows, tenancy model); move fast on reversible ones (internal libraries, caching layer). Amazon calls these one-way and two-way doors.</p><p><b>“Simple” is not “naive”:</b> idempotency for payments, backups, timeouts, and basic observability are essential even in v1. Skipping them is not KISS, just debt with interest.</p>`
  },
  tradeoffs:{use:[`Start with a modular monolith, one relational DB and managed services; add complexity when metrics demand it`], avoid:[`Distributed architectures for small teams and small load`, `Gold-plating features no user asked for`, `“Simple” designs that skip correctness essentials (idempotency, backups)`], alt:[`Designing seams (interfaces, module boundaries) that make later extraction easy`]},
  real:[
    {co:'Segment', tier:'confirmed', text:'Segment wrote about moving from more than 140 microservices for its destination integrations back to a single service, because operational overhead outweighed the benefits for that workload.', src:'Segment Engineering, “Goodbye Microservices: From 100s of problem children to 1 superstar” (2018)'},
    {co:'Stack Overflow', tier:'confirmed', text:'Stack Overflow has described serving very large traffic from a largely monolithic .NET application on a small number of web and SQL Server machines, with heavy caching and careful performance work.', src:'Nick Craver, “Stack Overflow: The Architecture – 2016 Edition”'},
    {co:'Kent Beck / XP', tier:'confirmed', text:'YAGNI (“You Aren’t Gonna Need It”) comes from Extreme Programming, advising against building functionality before it is needed.', src:'Beck, Extreme Programming Explained (1999); Fowler, “Yagni” (2015)'}
  ],
  mistakes:[`Choosing architecture by what big tech uses rather than by your load and team`, `Adding a queue, cache and NoSQL DB “just in case”`, `Mixing business rules into controllers and SQL so every change touches everything`],
  interview:[`Start simple, state the scaling triggers, and evolve the design step by step. Interviewers reward this over a buzzword-heavy first draft`],
  tryit:{note:'Set the sliders above to your current project. Then:', quiz:[{q:'A 5-engineer team at 300 req/s asks whether to adopt microservices. Best answer?', options:['Yes, always', 'A modular monolith with clear boundaries; extract services when team size or scaling needs demand it', 'Rewrite in Go first', 'Use serverless for everything'], answer:1, why:'Distributed complexity costs more than it saves at this scale.'}], quizId:'pr-l2'},
  sources:[`Brooks, “No Silver Bullet” (1986)`, `Segment Engineering (2018)`, `Craver, Stack Overflow Architecture (2016)`, `Dijkstra, “On the role of scientific thought” (1974)`]
},
{
  id:'patterns-in-sd', title:'Design patterns that reappear in system design', minutes:11, tags:['Observer','Strategy','Factory','Circuit Breaker','Repository','patterns'],
  summary:'Classic code patterns reappear at system scale: Observer becomes pub/sub, Strategy becomes pluggable policies, Factory becomes templated provisioning, Circuit Breaker becomes mesh resilience, Repository becomes data ownership.',
  problem:`<p>In interviews and design reviews people say “use pub/sub here” or “make the eviction policy pluggable” without realising these are the same patterns they use in code every day. Seeing the connection helps you reason about trade-offs: what the pattern buys, what it costs, and when it’s overkill, at any scale.</p>`,
  intuition:`Recipes repeat at different scales. The technique for making one cup of chai (boil, steep, strain) is the same one a tea factory uses, just with bigger equipment and new problems (quality control, logistics). Patterns are those reusable techniques.`,
  how:{
    intro:'Pick a pattern to see its code form and its system-scale twin:',
    mount:host => patternExplorer(host),
    deep:`<p><b>Patterns carry costs:</b> Observer/pub-sub hides control flow (who reacts to this event?), so you need event catalogues and tracing. Strategy multiplies configurations to test. Factory adds indirection. Circuit breakers add states to reason about. Repository can become a leaky abstraction over complex queries. Use a pattern when its problem is present.</p><p><b>More system-scale patterns</b> you’ve met in this course: Saga (process manager), Outbox, CQRS, Sidecar, Ambassador (client-side proxy), Strangler Fig, Bulkhead, Leader election, Sharding, Cache-aside. Each is a named, reusable answer to a recurring distributed-systems problem.</p>`
  },
  tradeoffs:{use:[`When the recurring problem is actually present: multiple implementations, many listeners, fragile dependencies, data-access isolation`], avoid:[`Pattern-driven design (“we need a factory”) without a concrete need`], alt:[`Plain functions and direct calls for simple, stable code paths`]},
  real:[
    {co:'Gang of Four', tier:'confirmed', text:'Gamma, Helm, Johnson and Vlissides catalogued 23 object-oriented patterns, including Observer, Strategy and Factory Method, in Design Patterns (1994).', src:'Gamma et al., Design Patterns: Elements of Reusable Object-Oriented Software (1994)'},
    {co:'Envoy load-balancing policies', tier:'confirmed', text:'Envoy offers interchangeable load-balancing policies (round robin, least request, ring hash, Maglev, random) chosen by configuration: the Strategy pattern at infrastructure scale.', src:'Envoy documentation — Load balancing'},
    {co:'Microservices.io pattern language', tier:'confirmed', text:'Chris Richardson’s catalogue documents system-scale patterns such as Saga, Transactional Outbox, API Gateway, CQRS and Database per Service.', src:'Richardson, Microservices Patterns (2018); microservices.io'}
  ],
  mistakes:[`Event-driven everything with no catalogue of who consumes what`, `Repositories that expose ORM internals`, `Using patterns as vocabulary without stating the trade-off`],
  interview:[`Name the pattern and its trade-off: “pub/sub here decouples billing from ordering, at the cost of eventual consistency and idempotent consumers”`],
  tryit:{note:'Which pattern is this, at system scale?', mount:host => sortGame(host, [
    {t:'Order events consumed independently by billing, loyalty and analytics', c:'obs', why:'Observer → pub/sub.'},
    {t:'Choose LRU or LFU eviction with a config flag', c:'str', why:'Strategy.'},
    {t:'Envoy ejects a host after 5 consecutive 5xx', c:'cb', why:'Circuit breaker / outlier detection.'},
    {t:'Only the Orders service reads and writes the orders tables; others call its API', c:'rep', why:'Repository → data ownership.'},
    {t:'A service template creates LB, autoscaling and dashboards from 5 parameters', c:'fac', why:'Factory.'}
  ], [{id:'obs', label:'Observer'}, {id:'str', label:'Strategy'}, {id:'fac', label:'Factory'}, {id:'cb', label:'Circuit breaker'}, {id:'rep', label:'Repository'}])},
  sources:[`Gamma et al. (1994)`, `Fowler, Patterns of Enterprise Application Architecture (2002)`, `Richardson, Microservices Patterns (2018)`, `Nygard, Release It!`]
},
{
  id:'tradeoff-thinking', title:'“Everything is a trade-off”: thinking like an architect', minutes:11, tags:['trade-offs','decision matrix','ADR','reversibility','sensitivity'],
  summary:'There is rarely a best design, only a best fit for specific requirements and constraints. Make the criteria explicit, weigh them, check how sensitive the choice is to your assumptions, and record the decision with its context.',
  problem:`<p>Two senior engineers argue for an hour: one wants Cassandra for the chat message store, the other wants Postgres. Both are right about something: Cassandra writes scale easily; Postgres gives transactions and flexible queries. The argument goes in circles because nobody has said which requirements matter most, or what evidence would change their mind.</p>`,
  intuition:`Choosing between a scooter, a car and the metro for your commute. None is “best”: the scooter is cheap and quick in traffic, the car is comfortable in the rain, the metro is predictable. You decide by weighing what matters to you (cost, time, comfort), and your answer changes if you move house or get a bigger family.`,
  how:{
    steps:[`<b>State the requirements and constraints</b> first: scale, latency, consistency, team skills, budget, deadlines, compliance.`, `<b>List real options</b> (at least two), including “do nothing” or “simplest thing”.`, `<b>Score against weighted criteria</b> (a decision matrix) and make the judgements visible.`, `<b>Test sensitivity</b>: which assumption, if wrong, flips the decision? Gather evidence there (benchmark, prototype, load test).`, `<b>Decide and record</b> an Architecture Decision Record: context, options, decision, consequences, and when to revisit.`],
    mount:host => tradeoffMatrix(host),
    deep:`<p><b>Common trade-off axes:</b> consistency vs availability/latency (CAP/PACELC); latency vs throughput (batching); cost vs performance (caching, replicas); simplicity vs flexibility; build vs buy; time-to-market vs long-term maintainability; read vs write optimisation (indexes, denormalisation); isolation vs efficiency (silo vs pool).</p><p><b>Language that shows judgement:</b> “We choose X because requirement A dominates; we give up B; we mitigate B with C; we will revisit if metric D crosses E.” This structure works in interviews, design reviews and ADRs alike.</p><p><b>ADRs</b> (Michael Nygard, 2011) are short markdown files kept with the code: Title, Status, Context, Decision, Consequences. They prevent re-litigating settled decisions and help newcomers understand why things are the way they are.</p>`
  },
  tradeoffs:{use:[`Any decision that is costly to reverse or contested`], avoid:[`Fake precision: weighted scores are a thinking tool, not an oracle`, `Analysis paralysis on cheap, reversible choices`], alt:[`A time-boxed spike or prototype to get real data`, `“Disagree and commit” after a clear decision process`]},
  real:[
    {co:'Fundamentals of Software Architecture', tier:'confirmed', text:'Richards and Ford state as their “First Law of Software Architecture”: everything in software architecture is a trade-off, and the “why” is more important than the “how”.', src:'Richards & Ford, Fundamentals of Software Architecture (O’Reilly, 2020)'},
    {co:'Architecture Decision Records', tier:'confirmed', text:'Michael Nygard proposed lightweight ADRs to document context, decision and consequences; many organisations keep them in their code repositories.', src:'Michael Nygard, “Documenting Architecture Decisions” (2011)'},
    {co:'AWS Well-Architected', tier:'confirmed', text:'The Well-Architected Framework discusses explicit trade-offs between its pillars (operational excellence, security, reliability, performance efficiency, cost optimisation, sustainability).', src:'AWS Well-Architected Framework'}
  ],
  mistakes:[`Arguing solutions before agreeing on requirements`, `Presenting one option as the only option`, `Not writing down why a decision was made`],
  interview:[`For every major choice say the alternative, why you chose this one, what you give up, and when you’d change your mind`],
  tryit:{note:'Change the weights above until the winner flips, and notice which criterion drives the decision. Then order the steps:', mount:host => orderGame(host, ['Agree requirements and constraints', 'List at least two real options', 'Score options against weighted criteria', 'Find the assumption that flips the decision and test it', 'Decide and write an ADR with consequences and a revisit trigger'])},
  sources:[`Richards & Ford, Fundamentals of Software Architecture (2020)`, `Nygard, Documenting Architecture Decisions (2011)`, `AWS Well-Architected Framework`]
}
];

SDA.register({
  kind:'module', id:'principles', order:14, level:'intermediate', icon:'🧩', title:'Design Principles Bridge',
  summary:'SOLID from classes to services; KISS, YAGNI and separation of concerns; the design patterns that reappear at system scale (Observer, Strategy, Factory, Circuit Breaker, Repository); and trade-off thinking with decision matrices and ADRs.',
  outcomes:['Map SOLID principles to service boundaries and contracts', 'Right-size an architecture to real load and team size (KISS/YAGNI)', 'Recognise classic patterns at system scale and state their trade-offs', 'Make, test and record architecture decisions with explicit trade-offs'],
  lessons,
  quiz:[
    {q:'At system scale, the Single Responsibility Principle most closely maps to…', options:['One server per service', 'A service owning one business capability and its data', 'One database table per service', 'One endpoint per service'], answer:1, why:'Bounded contexts.'},
    {q:'A reporting service reads another team’s tables directly. Which principle is violated at system scale?', options:['Liskov', 'Dependency inversion (depend on contracts, not internals)', 'KISS', 'Open/closed'], answer:1, why:'Depend on APIs/events.'},
    {q:'YAGNI advises…', options:['Never plan ahead', 'Don’t build features/infrastructure before they’re needed; design seams instead', 'Always use microservices', 'Avoid tests'], answer:1, why:'Plan triggers; build what’s needed.'},
    {q:'Pub/sub is the system-scale form of which pattern?', options:['Factory', 'Observer', 'Repository', 'Singleton'], answer:1, why:'Publishers don’t know their subscribers.'},
    {q:'Pluggable load-balancing algorithms are an example of…', options:['Strategy', 'Observer', 'Adapter', 'Decorator'], answer:0, why:'Swap the algorithm by config.'},
    {q:'The best first step in a contested technology decision is…', options:['Pick the most popular option', 'Agree on requirements and weighted criteria', 'Benchmark everything', 'Ask a vendor'], answer:1, why:'Decisions follow from criteria.'},
    {q:'An ADR records…', options:['Code style rules', 'Context, decision and consequences of an architecture choice', 'Deployment steps', 'API docs'], answer:1, why:'The why behind decisions.'},
    {q:'Which is essential complexity even in a v1 payments app?', options:['A service mesh', 'Idempotent payment requests', 'Kafka', 'Multi-region active-active'], answer:1, why:'Correctness essentials aren’t over-engineering.'},
    {q:'Sensitivity analysis in a decision matrix tells you…', options:['The cost', 'Which assumption, if wrong, would flip the decision', 'The latency', 'Nothing useful'], answer:1, why:'Gather evidence where it matters.'},
    {q:'Segment moving 140+ microservices back to one service illustrates…', options:['Microservices always fail', 'Operational complexity can outweigh benefits for a workload', 'Monoliths can’t scale', 'Kafka is required'], answer:1, why:'Fit the architecture to the problem.'},
    {type:'scenario', q:'Your CTO wants to “move to microservices” for a 12-engineer team running a Rails monolith at 2,000 req/s. How do you respond?', answer:'<ol><li>Ask what problem we’re solving: deploy contention, scaling hotspots, team autonomy, reliability isolation? Measure lead time, incident causes and hotspots.</li><li>Propose a <b>modular monolith</b> first: enforce module boundaries per bounded context, own data per module, add CI checks for dependencies.</li><li>Extract a service only where there’s a clear driver (e.g. image processing needs separate scaling; payments needs isolation), using the strangler fig with a facade.</li><li>State costs: network failures, distributed transactions (sagas), observability, on-call and platform work.</li><li>Record the decision in an ADR with triggers to revisit (team > 30 engineers, independent scaling needs).</li></ol>'},
    {type:'scenario', q:'Choose a message store for a chat app (50K writes/s, growing 3× a year, messages fetched by conversation). Walk through your trade-off reasoning.', answer:'<ul><li><b>Requirements</b>: high write throughput, reads by (conversation_id, time) range, per-conversation ordering, durability, modest query flexibility, multi-region later.</li><li><b>Options</b>: sharded Postgres (partition by conversation_id), Cassandra/ScyllaDB (partition key conversation_id, clustering by message time), DynamoDB (same model, managed).</li><li><b>Trade-off</b>: the access pattern is a classic wide-column fit. Cassandra/Scylla/DynamoDB give easy write scaling at the cost of ad-hoc queries; Postgres gives transactions and flexible queries but needs sharding work sooner.</li><li><b>Sensitivity</b>: if the team lacks Cassandra ops skills, managed DynamoDB or sharded Postgres may win; if we need complex search, add a search index regardless.</li><li><b>Decision + ADR</b>: e.g. ScyllaDB/Cassandra keyed by conversation with time-bucketed partitions; revisit if multi-region writes or cost change.</li></ul>'}
  ],
  cheatsheet:[
    {h:'🧱 SOLID at two scales', items:['S: one reason to change ↔ one capability per service', 'O: extend via new code ↔ events, plugins, webhooks', 'L: honest substitutes ↔ compatible API versions', 'I: small interfaces ↔ focused APIs/BFFs', 'D: depend on abstractions ↔ depend on contracts, not DBs']},
    {h:'✂️ Simplicity', items:['KISS: boring tech, fewest moving parts', 'YAGNI: build seams, not futures', 'Separate UI, rules, data access, integrations', 'Write down scaling triggers', 'Essential correctness (idempotency, backups) is not over-engineering']},
    {h:'🔁 Patterns ↔ systems', items:['Observer ↔ pub/sub, event-driven', 'Strategy ↔ pluggable policies (LB, eviction, retry)', 'Factory ↔ service templates, tenant provisioning', 'Circuit breaker ↔ mesh outlier ejection', 'Repository ↔ data ownership per service']},
    {h:'⚖️ Trade-offs', items:['Requirements → options → weighted criteria', 'Sensitivity: which assumption flips it?', 'Say: choose X because A; give up B; mitigate with C; revisit when D', 'ADR: context, decision, consequences', 'One-way vs two-way doors']}
  ],
  glossary:[
    {term:'SOLID', def:'Five object-oriented design principles: single responsibility, open/closed, Liskov substitution, interface segregation, dependency inversion.'},
    {term:'Single responsibility principle', aka:['SRP'], def:'A module should have one reason to change.'},
    {term:'Open/closed principle', def:'Software should be open for extension but closed for modification.'},
    {term:'Liskov substitution principle', aka:['LSP', 'Liskov substitution'], def:'Subtypes must be usable wherever their base type is expected without breaking correctness.'},
    {term:'Interface segregation principle', aka:['ISP'], def:'Clients should not depend on methods they don’t use; prefer small, focused interfaces.'},
    {term:'Dependency inversion principle', aka:['DIP', 'dependency inversion'], def:'High-level modules depend on abstractions, and details implement those abstractions.'},
    {term:'Coupling', def:'How much one component depends on another; lower is usually better.'},
    {term:'Cohesion', def:'How closely the responsibilities within a component belong together; higher is usually better.'},
    {term:'KISS', aka:['keep it simple'], def:'“Keep it simple”: prefer the simplest design that meets the requirements.'},
    {term:'YAGNI', aka:['you aren’t gonna need it'], def:'Don’t build functionality until it is actually needed.'},
    {term:'Separation of concerns', def:'Dividing a system so each part addresses a distinct concern.'},
    {term:'Accidental complexity', aka:['essential complexity'], def:'Complexity introduced by our tools and choices, as opposed to the problem’s inherent (essential) complexity.'},
    {term:'Design pattern', aka:['design patterns'], def:'A named, reusable solution to a recurring design problem.'},
    {term:'Observer pattern', aka:['Observer'], def:'Objects subscribe to a subject and are notified of its changes.'},
    {term:'Strategy pattern', aka:['Strategy'], def:'Encapsulating interchangeable algorithms behind a common interface.'},
    {term:'Factory pattern', aka:['Factory', 'factory method'], def:'Creating objects through a function or class that chooses the concrete implementation.'},
    {term:'Repository pattern', aka:['Repository'], def:'Mediating between domain logic and data storage through a collection-like interface.'},
    {term:'Decision matrix', aka:['weighted decision matrix'], def:'A table scoring options against weighted criteria to support a decision.'},
    {term:'Sensitivity analysis', def:'Checking how much a decision changes when assumptions or weights change.'},
    {term:'Architecture Decision Record', aka:['ADR', 'ADRs'], def:'A short document recording an architecture decision’s context, choice and consequences.'},
    {term:'One-way door', aka:['two-way door'], def:'A hard-to-reverse decision (one-way) versus an easily reversible one (two-way).'}
  ],
  sources:['Martin, Clean Architecture (2017); Liskov (1987)', 'Gamma et al., Design Patterns (1994); Fowler, PoEAA (2002); Richardson, Microservices Patterns (2018)', 'Brooks, No Silver Bullet (1986); Beck, Extreme Programming Explained (1999)', 'Richards & Ford, Fundamentals of Software Architecture (2020); Nygard, Documenting Architecture Decisions (2011)', 'Segment (2018), Shopify (2019), Stack Overflow (2016) engineering posts']
});
} catch(e){ console.error('[SDA] module principles', e); SDA.errors.push({id:'principles', error:e}); }
})();
