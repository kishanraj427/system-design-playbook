/* =====================================================================
   PART 15 · PRINCIPAL ENGINEER THINKING (engine, themes, tools)
   #/page/principal              → 15 themes (Decide · Shape · Sustain),
                                   8 scenarios, tools
   #/page/principal/<scenario>   → solve first (first move + your plan),
                                   then reveal the expert walkthrough
   #/page/principal/adr          → ADR template builder (live Markdown,
                                   copy / download, saved in this browser)
   #/page/principal/review       → architecture review checklist
   Scenarios live in principal-b.js.
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, esc, slug, copyText, toast} = SDA.u; const ui = SDA.ui; const h = SDA.h; const Store = SDA.store;
const frag = html => document.createRange().createContextualFragment(html);
const prose = html => el('div', {class:'prose'}, frag(html));
const crumbs = list => el('nav', {class:'crumbs', 'aria-label':'Breadcrumb', html:list.map(([href, t]) => href ? `<a href="${href}">${esc(t)}</a>` : `<span aria-current="page">${esc(t)}</span>`).join('<span aria-hidden="true">/</span>')});
const ls = {get(k, d){ try { const x = localStorage.getItem(k); return x == null ? d : JSON.parse(x); } catch(e){ return d; } }, set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }};
const refChips = refs => { const r = (refs || []).map(x => SDA.resolve(x)).filter(Boolean); return r.length ? el('div', {class:'pill-row', style:{marginTop:'8px'}}, ...r.map(x => el('a', {class:'chip', href:x.href}, `${x.icon || ''} ${x.title}`))) : null; };

SDA.scenarios = SDA.scenarios || new Map();
SDA.addKind('scenario', s => {
  ['id', 'title', 'situation', 'choices', 'walk', 'adr'].forEach(k => { if (s[k] == null) throw new Error('scenario ' + (s.id || '?') + ' needs ' + k); });
  if (!s.choices.some(c => c[1] === 'best')) throw new Error('scenario ' + s.id + ' needs a best first move');
  ['diagnose', 'options', 'decision', 'plan', 'risks', 'measure', 'say'].forEach(k => { if (!s.walk[k]) throw new Error('scenario ' + s.id + ' walkthrough needs ' + k); });
  SDA.scenarios.set(s.id, s);
});
SDA.searchProviders.push(() => [...SDA.scenarios.values()].map(s => ({kind:'Principal', icon:s.icon || '🧭', title:s.title, sub:'Principal scenario: solve, then reveal', href:'#/page/principal/' + s.id, kw:'principal engineer scenario ' + (s.tags || []).join(' ')})).concat(THEMES.map(t => ({kind:'Principal', icon:t.icon, title:t.title, sub:'Principal Engineer Thinking · theme', href:'#/page/principal', kw:'principal ' + t.one}))));
SDA.statProviders.push({label:'Principal scenarios', count:() => SDA.scenarios.size});

/* =========================== THEMES =========================== */
const CATS = {decide:{label:'Deciding', icon:'⚖️', blurb:'Making and recording good technical decisions.'}, shape:{label:'Shaping', icon:'🧩', blurb:'Setting direction and boundaries for many teams.'}, sustain:{label:'Sustaining', icon:'🌳', blurb:'Keeping systems healthy for years, not quarters.'}};
const THEMES = [
{id:'architecture-reviews', cat:'shape', icon:'🔍', title:'Architecture reviews', one:'Catch expensive mistakes while they are still cheap, without becoming a gate everyone routes around.',
  why:'Most costly design errors are visible on paper: a missing failure mode, a data model that can’t support next year’s feature, an unbounded fan-out. A review is the cheapest place to find them.',
  do:['Review the <b>problem and constraints</b> before the solution: what must be true, and how do we know?', 'Ask for a short written design doc (context, goals, non-goals, options, decision) before the meeting, and review asynchronously first', 'Focus on one-way doors: data models, public APIs, consistency guarantees, security boundaries', 'End with clear outcomes: approved, approved with changes, or needs another round, with owners and dates'],
  ask:['What happens when this dependency is slow, not just down?', 'What is the 10× version, and which part breaks first?', 'Which decision here is hardest to reverse?', 'How will we know in production that this works?'],
  smells:['Reviews that happen after the code is written', 'Reviewers redesigning the system to their taste', 'No written record of what was decided and why'],
  heuristic:'Review the riskiest decisions deeply and the rest lightly. A good review changes a design or confirms it with evidence; anything else is ceremony.',
  real:[{co:'Google', tier:'confirmed', text:'Software Engineering at Google (2020) describes design docs reviewed by peers before implementation as a core practice.', src:'Winters, Manshreck & Wright, Software Engineering at Google (2020)'}, {co:'AWS', tier:'confirmed', text:'The AWS Well-Architected Framework structures reviews around six pillars: operational excellence, security, reliability, performance efficiency, cost optimisation and sustainability.', src:'AWS Well-Architected Framework'}],
  refs:['l:tradeoff-thinking', 'l:interview-framework', 'l:fault-tolerance-spof']},
{id:'adrs', cat:'decide', icon:'📝', title:'Architecture Decision Records', one:'Write down each significant decision, its context and its consequences, so the next engineer knows why, not just what.',
  why:'Two years later, nobody remembers why the system uses event sourcing or why service B owns that table. Without the reasoning, people either follow decisions blindly or reverse them without understanding the cost.',
  do:['One short Markdown file per decision, kept in the repository next to the code', 'Record the context and the options rejected, not only the choice', 'Never edit an accepted ADR’s decision; supersede it with a new one that links back', 'Write ADRs for decisions that are expensive to reverse or that people will ask about'],
  ask:['Would a new engineer understand why we did this from the ADR alone?', 'What did we give up?', 'What would make us revisit this?', 'Who was involved, and who must be told?'],
  smells:['Decisions living only in chat threads and meetings', 'ADRs written after the fact to justify a choice', '30-page documents nobody reads'],
  heuristic:'If people will ask “why did we do it this way?”, write an ADR. Use the template builder on this page.',
  real:[{co:'Michael Nygard', tier:'confirmed', text:'Nygard’s 2011 post “Documenting Architecture Decisions” introduced the lightweight ADR format: title, status, context, decision, consequences.', src:'Michael Nygard, “Documenting Architecture Decisions” (2011)'}, {co:'Thoughtworks', tier:'confirmed', text:'The Thoughtworks Technology Radar has recommended lightweight ADRs as a technique teams should adopt.', src:'Thoughtworks Technology Radar'}],
  refs:['l:tradeoff-thinking', 'l:talking-tradeoffs']},
{id:'technical-strategy', cat:'shape', icon:'🧭', title:'Technical strategy', one:'A diagnosis of the real problem, a guiding policy, and a few coherent actions: not a list of technologies.',
  why:'Without a strategy, each team optimises locally and the organisation drifts: five queueing systems, three ways to deploy, no shared answer to “how do we get to 10×?”.',
  do:['Start from a <b>diagnosis</b>: what is actually limiting the business or the engineering org?', 'Write a guiding policy that rules options out (“we buy undifferentiated infrastructure”, “one paved road for services”)', 'Pick a small number of coherent actions with owners and milestones', 'Ground it in existing design docs: strategy that ignores what teams are already doing won’t stick'],
  ask:['What problem does this strategy solve that teams can’t solve alone?', 'What are we explicitly not doing?', 'How will we know it is working in six months?', 'Which teams change behaviour because of it?'],
  smells:['A strategy that is a technology wish list', 'No diagnosis, only goals (“be world-class”)', 'Everything is a priority'],
  heuristic:'Good strategy says no. If nothing is ruled out, it isn’t a strategy.',
  real:[{co:'Richard Rumelt', tier:'confirmed', text:'Good Strategy Bad Strategy (2011) defines the “kernel” of strategy as diagnosis, guiding policy and coherent actions.', src:'Richard Rumelt, Good Strategy Bad Strategy (2011)'}, {co:'Will Larson', tier:'confirmed', text:'Larson suggests writing several concrete design docs first and then synthesising the strategy from them (“write five, then synthesize”).', src:'Will Larson, Staff Engineer (2021) and his blog'}],
  refs:['l:tradeoff-thinking', 'm:principles']},
{id:'system-boundaries', cat:'shape', icon:'🧱', title:'System boundaries', one:'Draw service and module boundaries around business capabilities and team ownership, so most changes stay inside one boundary.',
  why:'Boundaries decide how often teams must coordinate. Wrong boundaries create services that always deploy together, shared databases, and circular calls.',
  do:['Find boundaries from the domain (bounded contexts) and from how data changes together', 'Give each boundary one owning team and one owner of each piece of data', 'Make dependencies point one way; use events where the “reverse” direction is needed', 'Check with change history: files that always change together belong together'],
  ask:['Which team owns this data, and who else writes to it?', 'How many boundaries does a typical feature touch?', 'Can this part be deployed, scaled and failed independently?', 'Does the team structure match the architecture we want?'],
  smells:['Two services sharing a database table', 'Every feature needs changes in four services', 'Services named after technical layers rather than capabilities'],
  heuristic:'Conway’s law works both ways: design the team structure and the architecture together.',
  real:[{co:'Melvin Conway', tier:'confirmed', text:'Conway observed in 1968 that organisations design systems that mirror their communication structures.', src:'Melvin Conway, “How Do Committees Invent?” (1968)'}, {co:'Team Topologies', tier:'confirmed', text:'Skelton and Pais describe stream-aligned, platform, enabling and complicated-subsystem teams, and designing boundaries around team cognitive load.', src:'Skelton & Pais, Team Topologies (2019)'}],
  refs:['l:ddd-bounded-contexts', 'l:monolith-to-microservices', 'l:hexagonal', 'l:event-driven']},
{id:'tech-debt', cat:'sustain', icon:'🧾', title:'Technical debt', one:'Treat debt like a loan: take it on deliberately, know the interest you pay, and pay down the expensive parts first.',
  why:'Some debt is a good trade (ship now, clean up later). The danger is debt nobody chose and nobody measures, which slowly turns every change into a week of work.',
  do:['Make debt visible: a register with the cost it causes (incidents, hours lost, blocked features)', 'Pay down debt where you are already working (“leave it better”) and fund the big items explicitly', 'Prioritise by interest: code changed often and painful to change, not code that is merely ugly', 'Agree with product on a steady budget (for example 15–20% of capacity) rather than heroic clean-up sprints'],
  ask:['What does this debt cost us per month, in hours or incidents?', 'Is anyone changing this code? (Ugly but stable code may not be worth touching.)', 'Was this debt a deliberate trade, and has the reason expired?', 'What is the smallest step that reduces the interest?'],
  smells:['“Tech debt” used for any work engineers want to do', 'A permanent backlog of clean-up tickets nobody schedules', 'Rewrites proposed as the fix for everything'],
  heuristic:'Hotspots = change frequency × difficulty. Fix where both are high.',
  real:[{co:'Ward Cunningham', tier:'confirmed', text:'Cunningham coined the debt metaphor in a 1992 OOPSLA experience report: shipping first-time code is like going into debt, repaid by rewriting.', src:'Ward Cunningham, OOPSLA ’92 experience report'}, {co:'Martin Fowler', tier:'confirmed', text:'Fowler’s “Technical Debt Quadrant” separates deliberate from inadvertent and prudent from reckless debt.', src:'Martin Fowler, “TechnicalDebtQuadrant” (2009)'}],
  refs:['l:kiss-yagni-soc', 'l:solid', 'l:strangler-fig']},
{id:'build-vs-buy', cat:'decide', icon:'🛒', title:'Build vs buy', one:'Build what differentiates you; buy, rent or adopt open source for everything else, and price in the full cost of each.',
  why:'Engineers enjoy building, and vendors promise everything. Both biases are expensive: a home-grown queue nobody wants to maintain, or a vendor that can’t do the one thing your business needs.',
  do:['Ask whether this capability is a <b>differentiator</b> for the business or a commodity', 'Compare total cost of ownership: licences or cloud bills vs engineers to build, run, secure and upgrade for years', 'Check exit costs: data export, API lock-in, contract terms', 'Revisit as scale changes: what you buy at 10 engineers you may build at 1,000, and the reverse'],
  ask:['Would customers notice if we did this better than competitors?', 'Who will run this at 3 a.m. in two years?', 'What does leaving this vendor cost?', 'At what scale does the answer flip?'],
  smells:['Building commodity infrastructure because it’s fun', 'Buying a platform that needs so much customisation it becomes a build', 'Ignoring operational cost in the comparison'],
  heuristic:'Default to buy for commodities; build only when it is core to how you win or when scale makes the economics overwhelming.',
  real:[{co:'Dropbox', tier:'confirmed', text:'Dropbox described moving most storage from Amazon S3 to its own system, Magic Pocket, in 2016: at its scale, storage had become core and the economics favoured building.', src:'Dropbox Tech Blog, Magic Pocket posts (2016)'}, {co:'37signals', tier:'confirmed', text:'37signals published its reasoning and expected savings for leaving the public cloud for its own hardware (2022–2023), a buy-to-build reversal for a stable workload.', src:'37signals / David Heinemeier Hansson blog posts (2022–2023)'}],
  refs:['l:tradeoff-thinking', 'l:tech-decision-tree', 'l:finops']},
{id:'tech-selection', cat:'decide', icon:'🔧', title:'Technology selection', one:'Choose boring, well-understood technology by default, and spend your limited “innovation budget” where it buys real advantage.',
  why:'Every new technology adds unknown failure modes, hiring needs and on-call knowledge. A team can absorb only a few at a time.',
  do:['Start from the requirements and access patterns, then shortlist (see the decision trees in Module 15)', 'Prefer what the organisation already runs well', 'Run a small, time-boxed spike against the hardest requirement, not a demo of the easiest', 'Record the choice and the rejected options in an ADR'],
  ask:['What problem does this solve that our current stack can’t?', 'Who has run it in production at our scale?', 'What does a failure look like, and can we debug it at night?', 'How do we get out if it disappoints?'],
  smells:['Choosing a database from a conference talk', 'A new language for one service', 'Benchmarks that don’t match our workload'],
  heuristic:'Each team gets about three “innovation tokens”. Spend them on the product, not on infrastructure novelty.',
  real:[{co:'Dan McKinley', tier:'confirmed', text:'“Choose Boring Technology” (2015) argues that well-known technology has known failure modes and that teams have a small number of innovation tokens to spend.', src:'Dan McKinley, “Choose Boring Technology” (2015)'}, {co:'Thoughtworks', tier:'confirmed', text:'The Technology Radar classifies tools as Adopt, Trial, Assess or Hold; many companies run an internal radar the same way.', src:'Thoughtworks Technology Radar'}],
  refs:['l:tech-decision-tree', 'l:sql-vs-nosql', 'l:tradeoff-thinking']},
{id:'migration', cat:'sustain', icon:'🚚', title:'Migration', one:'Move systems while they keep running: small reversible steps, both paths running side by side, and evidence before every cut-over.',
  why:'Big-bang migrations fail in big-bang ways. The safe pattern is always some form of: build the new path, run both, compare, shift traffic gradually, then remove the old path.',
  do:['Use expand → migrate → contract for schemas and APIs', 'Dual-write or mirror traffic, and compare results before switching reads', 'Shift traffic gradually (1% → 10% → 50% → 100%) with a tested rollback at each step', 'Plan the long tail: the last 5% of callers often take 50% of the time'],
  ask:['What is the rollback at each step, and have we tested it?', 'How do we know the new path is correct, not just up?', 'Who are the stragglers, and what makes them move?', 'When exactly do we delete the old system?'],
  smells:['A cut-over weekend with no way back', 'Two systems running “temporarily” for years', 'No comparison of old and new results'],
  heuristic:'Every step should be boring and reversible. If a step is exciting, split it.',
  real:[{co:'Stripe', tier:'confirmed', text:'Stripe’s engineering blog describes a four-step online migration: dual write, change reads, change writes, remove old data, while serving traffic.', src:'Stripe Engineering, “Online migrations at scale” (2017)'}, {co:'Martin Fowler', tier:'confirmed', text:'The Strangler Fig pattern (2004) gradually replaces a legacy system by routing functionality to new code piece by piece.', src:'Martin Fowler, “StranglerFigApplication” (2004)'}],
  refs:['l:strangler-fig', 'l:zero-downtime-migrations', 'l:deploy-strategies', 'l:config-feature-flags']},
{id:'legacy-modernization', cat:'sustain', icon:'🏚️', title:'Legacy modernisation', one:'Modernise for a business reason, one capability at a time, and respect the knowledge buried in the old system.',
  why:'Legacy systems usually work and encode years of edge cases. Rewrites underestimate that knowledge and stall halfway, leaving two systems to maintain.',
  do:['Name the business outcome (speed of change, cost, risk, hiring) and measure it', 'Map capabilities and pick the one with the best value-to-risk ratio first', 'Put a seam in front (a facade or proxy) so traffic can move piece by piece', 'Capture behaviour with characterisation tests before changing it'],
  ask:['What will be better for customers or the business when this is done?', 'What does the old system do that nobody has written down?', 'Can we stop halfway and still be better off?', 'Who knows this system, and are they involved?'],
  smells:['“Rewrite in a modern stack” with no business goal', 'A multi-year freeze on the old system', 'Ignoring the people who run the legacy system'],
  heuristic:'Prefer improvements that pay off at every step over a rewrite that pays off only at the end.',
  real:[{co:'Shopify', tier:'confirmed', text:'Shopify described turning its large Rails monolith into a modular monolith with enforced component boundaries, instead of splitting into microservices.', src:'Shopify Engineering, “Deconstructing the Monolith” (2019)'}, {co:'Marianne Bellotti', tier:'confirmed', text:'Kill It with Fire (2021) argues for incremental modernisation tied to concrete value, and warns against full rewrites.', src:'Marianne Bellotti, Kill It with Fire (2021)'}],
  refs:['l:strangler-fig', 'l:monolith-to-microservices', 'l:ddd-bounded-contexts']},
{id:'platform-engineering', cat:'shape', icon:'🛤️', title:'Platform engineering', one:'Build an internal platform as a product: a paved road that makes the right way the easy way for product teams.',
  why:'When every team builds its own CI, deployment, observability and service template, the organisation pays the same cost many times and gets inconsistent reliability.',
  do:['Treat product teams as customers: interview them, measure adoption and satisfaction', 'Offer a paved road (templates, pipelines, defaults) that teams choose because it’s easier', 'Provide self-service with guardrails rather than tickets', 'Keep an escape hatch for teams with genuinely different needs'],
  ask:['How long does it take to create, deploy and observe a new service?', 'Which platform features do teams actually use?', 'What do teams still build themselves, and why?', 'Is the platform team a bottleneck?'],
  smells:['A platform mandated but not adopted', 'Tickets to get a database or a DNS name', 'A platform team that builds what it finds interesting'],
  heuristic:'Measure the platform by product teams’ lead time and adoption, not by features shipped.',
  real:[{co:'Spotify', tier:'confirmed', text:'Spotify built Backstage, an internal developer portal with a software catalogue and templates, and open-sourced it in 2020.', src:'Spotify Engineering, Backstage announcement (2020)'}, {co:'Netflix', tier:'confirmed', text:'Netflix engineers describe a “paved road”: well-supported default tooling teams are encouraged, not forced, to use.', src:'Netflix Technology Blog'}],
  refs:['l:ci-cd', 'l:kubernetes-basics', 'l:infrastructure-as-code', 'l:twelve-factor']},
{id:'reliability-ownership', cat:'sustain', icon:'🛡️', title:'Reliability ownership', one:'Teams that build a service also own its reliability, with SLOs and error budgets that balance speed and stability.',
  why:'When reliability belongs to “someone else”, product teams ship risk and operations absorbs it. Explicit targets make the trade-off visible and negotiable.',
  do:['Define SLOs from the user’s point of view for each critical journey', 'Use error budgets: when the budget is spent, reliability work comes first', 'Run blameless postmortems with tracked action items', 'Practise failure: game days, chaos experiments, failover drills'],
  ask:['What does “working” mean for users, in numbers?', 'How much of this quarter’s error budget is left?', 'Which incident action items are still open?', 'When did we last test our failover?'],
  smells:['100% availability targets', 'Postmortems that end with “human error”', 'Alerts on CPU instead of user impact'],
  heuristic:'Reliability is a feature with a budget, not a virtue with no limit.',
  real:[{co:'Google SRE', tier:'confirmed', text:'Google’s Site Reliability Engineering book (2016) describes SLOs, error budgets and blameless postmortems.', src:'Beyer et al., Site Reliability Engineering (2016)'}, {co:'Amazon', tier:'confirmed', text:'Werner Vogels described Amazon’s “you build it, you run it” model in a 2006 interview: developers operate their own services.', src:'ACM Queue interview with Werner Vogels (2006)'}],
  refs:['l:sli-slo-sla', 'l:incident-postmortems', 'l:alerting-oncall', 'l:chaos-engineering']},
{id:'cost', cat:'decide', icon:'💰', title:'Cost as an architecture property', one:'Cost is a design constraint like latency: measure it per unit of business value and make it visible to the teams that cause it.',
  why:'Cloud bills grow quietly: a chatty feature, verbose logs, forgotten test environments. Architects who ignore cost hand the problem to finance, who can only cut blindly.',
  do:['Track unit cost (cost per order, per active user, per GB served) not just the total', 'Allocate cost to services and teams with tags', 'Design for cost: caching, data tiering, right-sized instances, fewer cross-zone hops', 'Buy commitments (savings plans, reserved capacity) only after right-sizing'],
  ask:['What does one more user or one more order cost us?', 'Which three line items grew fastest?', 'What do we pay for that nobody uses?', 'Does this design multiply data transfer?'],
  smells:['Nobody can say which team owns a cost', 'Across-the-board percentage cuts', 'Over-provisioning “just to be safe” with no data'],
  heuristic:'If unit cost falls while the bill grows, that is success; if unit cost grows, investigate.',
  real:[{co:'Amazon Prime Video', tier:'confirmed', text:'The Prime Video team described moving an audio/video monitoring service from distributed serverless components to a single process and cutting its infrastructure cost by over 90%.', src:'Prime Video Tech blog (2023)'}, {co:'FinOps Foundation', tier:'confirmed', text:'The FinOps Foundation describes cloud financial management in three phases: inform, optimise, operate.', src:'FinOps Foundation framework'}],
  refs:['l:finops', 'l:autoscaling', 'l:capacity-planning', 'l:storage-types']},
{id:'risk', cat:'decide', icon:'🎲', title:'Risk', one:'Separate reversible decisions from irreversible ones, move fast on the first kind, and be careful and explicit about the second.',
  why:'Treating every decision as high-stakes makes an organisation slow; treating none as high-stakes makes it fragile. Principals help teams tell them apart.',
  do:['Classify decisions as one-way or two-way doors', 'Run pre-mortems: “it’s a year later and this failed; why?”', 'Keep a risk register for big programmes with likelihood, impact, owner and mitigation', 'Reduce risk with experiments: feature flags, canaries, shadow traffic'],
  ask:['If this is wrong, how do we find out, and how fast?', 'What is the blast radius, and can we shrink it?', 'Which assumption, if false, sinks the plan?', 'Is this reversible? At what cost?'],
  smells:['Lengthy reviews for easily reversible choices', 'Launch plans with no rollback', 'Risks listed but never owned'],
  heuristic:'Make reversible decisions quickly and close to the work; escalate the irreversible ones.',
  real:[{co:'Amazon', tier:'confirmed', text:'Jeff Bezos’s 2015 shareholder letter distinguishes Type 1 (one-way door) decisions, made carefully, from Type 2 (two-way door) decisions, made quickly by small groups.', src:'Amazon 2015 letter to shareholders'}, {co:'Gary Klein', tier:'confirmed', text:'The pre-mortem technique asks a team to imagine a project has failed and explain why, surfacing risks people hesitate to raise.', src:'Gary Klein, “Performing a Project Premortem”, Harvard Business Review (2007)'}],
  refs:['l:deploy-strategies', 'l:config-feature-flags', 'l:tradeoff-thinking']},
{id:'maintainability', cat:'sustain', icon:'🧰', title:'Long-term maintainability', one:'Optimise for the people who will change this system for the next ten years: clarity, tests, small interfaces and stable contracts.',
  why:'Most of a system’s cost comes after launch. Code that is clever today and opaque tomorrow taxes every future change.',
  do:['Keep interfaces small and explicit; hide internals behind them', 'Write tests that describe behaviour, so refactoring is safe', 'Remove dead code, flags and unused endpoints regularly', 'Treat observable behaviour as a contract: someone depends on it'],
  ask:['Can a new engineer make a safe change here in their first week?', 'What implicit behaviour do callers depend on?', 'Which parts nobody dares to touch, and why?', 'How long do builds and tests take?'],
  smells:['Knowledge held by one person', 'Feature flags that never get removed', 'Slow, flaky test suites everyone ignores'],
  heuristic:'Code is read and changed far more often than it is written. Optimise for the reader.',
  real:[{co:'Google', tier:'confirmed', text:'Software Engineering at Google frames software engineering as “programming integrated over time”, focusing on sustainability of code across years.', src:'Winters, Manshreck & Wright, Software Engineering at Google (2020)'}, {co:'Hyrum’s law', tier:'confirmed', text:'Hyrum Wright observed that with enough users, every observable behaviour of an API will be depended on by somebody.', src:'Hyrum’s Law (hyrumslaw.com), cited in Software Engineering at Google'}],
  refs:['l:solid', 'l:kiss-yagni-soc', 'l:hexagonal', 'l:api-design']},
{id:'evolutionary-architecture', cat:'shape', icon:'🧬', title:'Evolutionary architecture', one:'Design for change you can’t predict: protect key qualities with automated fitness functions and keep most decisions reversible.',
  why:'Five-year plans for architecture are always wrong in the details. What survives is the ability to change safely and the qualities you protect while changing.',
  do:['Write fitness functions: automated checks for latency budgets, dependency rules, cost per request, security rules, run in CI or production', 'Version public APIs and keep backward compatibility', 'Keep business facts in an event log or well-owned data stores that new systems can consume', 'Prefer small, independently deployable steps'],
  ask:['Which qualities must never regress, and how do we check them automatically?', 'What would it take to replace this component in a year?', 'Which decisions lock us in?', 'What does the next order of magnitude require?'],
  smells:['“Future-proof” designs full of unused flexibility', 'Architecture diagrams that no longer match production', 'Breaking API changes for customers'],
  heuristic:'You can’t predict the future, but you can make change cheap and make regressions loud.',
  real:[{co:'Building Evolutionary Architectures', tier:'confirmed', text:'Ford, Parsons and Kua introduced fitness functions: objective, automated checks of architectural characteristics as a system evolves.', src:'Ford, Parsons & Kua, Building Evolutionary Architectures (2017)'}, {co:'Stripe', tier:'confirmed', text:'Stripe described date-based API versions with compatibility layers, so old integrations keep working while the API evolves.', src:'Stripe Engineering, “APIs as infrastructure: future-proofing Stripe with versioning” (2017)'}],
  refs:['l:api-design', 'l:event-driven', 'l:ci-cd', 'l:tradeoff-thinking']}];
SDA.principalThemes = THEMES;

/* =========================== OVERVIEW =========================== */
function renderOverview(ctx){
  const c = ctx.content; ctx.wide = true;
  c.append(crumbs([['#/', 'Home'], [null, 'Principal Engineer Thinking']]), el('h1', {class:'page-title'}, '🧭 Principal Engineer Thinking'),
    el('p', {class:'lead'}, 'Senior engineers design systems. Principal engineers decide which systems to build, which to change, which to leave alone, and how many teams get there together over years. This page covers the 15 recurring themes, 8 real-world scenarios to solve before you see the answer, and two working tools.'));
  c.append(prose(`<div class="grid c3">${[['Start from the problem', 'Diagnose with data before proposing anything. Most bad decisions are good answers to the wrong question.'], ['Make trade-offs explicit', 'Every choice gives something up. Say what, and when you would choose differently.'], ['Optimise for years', 'Prefer reversible steps, written reasoning and boring technology over clever, permanent bets.']].map(([t, d]) => `<div class="card"><b>${t}</b><p class="muted" style="margin:6px 0 0;font-size:14px">${d}</p></div>`).join('')}</div>`));
  // themes
  c.append(el('div', {class:'sect-h', id:'themes'}, el('div', null, el('h2', null, '15 themes'), el('p', null, 'Each has why it matters, practices, the questions a principal asks, warning signs, and public examples.'))));
  let cat = 'all';
  const seg = el('div', {class:'seg wrap', role:'group', 'aria-label':'Filter themes'});
  [['all', 'All 15']].concat(Object.entries(CATS).map(([k, v]) => [k, `${v.icon} ${v.label}`])).forEach(([k, t]) => { const b = el('button', {type:'button', 'aria-pressed':String(k === cat)}, t); b.addEventListener('click', () => { cat = k; seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); }); seg.append(b); });
  const grid = el('div');
  c.append(seg, grid);
  function draw(){
    grid.innerHTML = '';
    Object.entries(CATS).forEach(([k, v]) => {
      if (cat !== 'all' && cat !== k) return;
      grid.append(el('h3', {style:{margin:'20px 0 4px'}}, `${v.icon} ${v.label}`), el('p', {class:'muted', style:{margin:'0 0 10px', fontSize:'14px'}}, v.blurb));
      const g = el('div', {class:'grid c2'});
      THEMES.filter(t => t.cat === k).forEach(t => g.append(themeCard(t)));
      grid.append(g);
    });
  }
  draw();
  // scenarios
  const all = [...SDA.scenarios.values()];
  const solved = all.filter(s => Store.isDone('scenario:' + s.id)).length;
  c.append(el('div', {class:'sect-h', id:'scenarios'}, el('div', null, el('h2', null, '8 scenarios: solve first, then reveal'), el('p', null, `Pick your first move, write your plan, then compare with an expert walkthrough. ${solved} of ${all.length} solved.`))));
  const sg = el('div', {class:'grid c2'});
  all.forEach((s, i) => { const d = Store.isDone('scenario:' + s.id); sg.append(el('a', {class:'card glow', href:'#/page/principal/' + s.id}, el('div', {class:'row', style:{justifyContent:'space-between'}}, el('span', {class:'ico-lg', 'aria-hidden':'true'}, s.icon || '🧭'), d ? el('span', {class:'chip', style:{color:'var(--ok)'}}, '✓ solved') : el('span', {class:'chip'}, `Scenario ${i + 1}`)), el('b', {style:{display:'block', marginTop:'8px', color:'var(--text)', fontSize:'16px'}}, s.title), el('p', {class:'muted', style:{margin:'6px 0 0', fontSize:'14px'}}, s.tagline || ''))); });
  c.append(sg);
  // tools
  c.append(el('div', {class:'sect-h', id:'tools'}, el('div', null, el('h2', null, 'Tools'), el('p', null, 'Use them at work, not just here.'))));
  c.append(el('div', {class:'grid c2'},
    el('a', {class:'card glow', href:'#/page/principal/adr'}, el('span', {class:'ico-lg', 'aria-hidden':'true'}, '📝'), el('b', {style:{display:'block', marginTop:'8px', color:'var(--text)', fontSize:'16px'}}, 'ADR template'), el('p', {class:'muted', style:{margin:'6px 0 0', fontSize:'14px'}}, 'Fill in a decision record and get clean Markdown to copy or download. Each scenario can pre-fill it.')),
    el('a', {class:'card glow', href:'#/page/principal/review'}, el('span', {class:'ico-lg', 'aria-hidden':'true'}, '✅'), el('b', {style:{display:'block', marginTop:'8px', color:'var(--text)', fontSize:'16px'}}, 'Architecture review checklist'), el('p', {class:'muted', style:{margin:'6px 0 0', fontSize:'14px'}}, '40 questions across 8 areas to walk through before approving a design. Ticks are saved.'))));
}
function themeCard(t){
  const det = el('details', {class:'qa'}, el('summary', null, 'Open the playbook'),
    prose(`<p><b>Why it matters.</b> ${t.why}</p><h4>What principals do</h4>${h.list(t.do)}<h4>Questions to ask</h4>${h.list(t.ask)}<h4>Warning signs</h4>${h.list(t.smells)}` +
      h.callout('tip', 'Rule of thumb', `<p>${t.heuristic}</p>`) + '<h4>In public</h4>' + t.real.map(r => `<p>${h.tier(r.tier)} <b>${r.co}.</b> ${r.text} <span class="muted">(${r.src})</span></p>`).join('')));
  const rc = refChips(t.refs); if (rc) det.append(rc);
  return el('div', {class:'card theme-card', id:'theme-' + t.id}, el('div', {class:'row', style:{gap:'8px'}}, el('span', {class:'ico-lg', 'aria-hidden':'true'}, t.icon), el('span', {class:'chip'}, CATS[t.cat].label)), el('h3', null, t.title), el('p', {class:'muted', style:{margin:'0 0 8px', fontSize:'14.5px'}}, t.one), det);
}

/* =========================== SCENARIO =========================== */
const notesKey = id => 'sda:principal-notes:' + id;
function renderScenario(ctx, s){
  const c = ctx.content; ctx.title = s.title; ctx.track = {kind:'Principal', title:s.title, icon:s.icon || '🧭'};
  const all = [...SDA.scenarios.values()], i = all.indexOf(s);
  c.append(crumbs([['#/', 'Home'], ['#/page/principal', 'Principal Engineer Thinking'], [null, `Scenario ${i + 1}`]]));
  const doneB = ui.button(Store.isDone('scenario:' + s.id) ? '✓ Solved' : 'Mark as solved', () => { const v = !Store.isDone('scenario:' + s.id); Store.setDone('scenario:' + s.id, v); doneB.innerHTML = v ? '✓ Solved' : 'Mark as solved'; }, 'sm');
  c.append(el('div', {class:'row', style:{marginTop:'12px', flexWrap:'wrap'}}, el('span', {class:'chip lvl'}, `🧭 Scenario ${i + 1} of ${all.length}`), ...(s.tags || []).map(t => el('span', {class:'chip'}, t)), doneB));
  c.append(el('h1', {class:'page-title'}, `${s.icon || '🧭'} ${s.title}`));
  c.append(el('div', {class:'callout info'}, el('b', {class:'ct'}, 'The situation'), frag(s.situation)));
  if (s.facts) c.append(prose('<h4>What you know</h4>' + h.list(s.facts)));
  if (s.before){ const d = el('div'); c.append(d); SDA.miniDiagram(d, s.before, s.title + ': today'); }
  // 1. first move
  c.append(el('h2', {class:'ph-h'}, el('span', {class:'ph-n'}, '1'), 'Your first move'), el('p', {class:'muted'}, s.ask || 'What do you do first? Pick one; you can try the others after.'));
  const fb = el('div');
  const list = el('div', {class:'choice-list', role:'group', 'aria-label':'First move options'});
  s.choices.forEach(([text, grade, why]) => { const b = el('button', {type:'button'}, text); b.addEventListener('click', () => { list.querySelectorAll('button').forEach(x => x.classList.remove('picked')); b.classList.add(grade, 'picked'); fb.innerHTML = ''; fb.append(el('div', {class:'callout ' + (grade === 'best' ? 'tip' : grade === 'meh' ? 'warn' : 'bad')}, el('b', {class:'ct'}, grade === 'best' ? '✓ Strong first move' : grade === 'meh' ? '≈ Reasonable, but not first' : '✗ Risky first move'), frag(`<p>${why}</p>`))); }); list.append(b); });
  c.append(list, fb);
  // 2. your plan
  c.append(el('h2', {class:'ph-h'}, el('span', {class:'ph-n'}, '2'), 'Your plan'));
  const ta = el('textarea', {class:'input', rows:'7', style:{width:'100%', fontFamily:'var(--font-mono)', fontSize:'13px'}, placeholder:'Diagnosis → options → decision → phased plan → risks → how you will measure success → what you tell leadership (saved in this browser)', 'aria-label':'Your plan'}); ta.value = ls.get(notesKey(s.id), '');
  ta.addEventListener('input', () => ls.set(notesKey(s.id), ta.value));
  c.append(ta);
  // 3. reveal
  c.append(el('h2', {class:'ph-h'}, el('span', {class:'ph-n'}, '3'), 'Expert walkthrough'));
  const box = el('div');
  const rev = ui.button('🔓 Reveal the walkthrough', () => { rev.disabled = true; rev.innerHTML = 'Revealed ↓'; renderWalk(box, s); }, 'primary');
  c.append(el('div', {class:'row', style:{gap:'10px', flexWrap:'wrap'}}, rev, el('span', {class:'muted', style:{fontSize:'13px'}}, 'Commit to an answer first: comparing is where the learning happens.')), box);
  const prev = all[i - 1], next = all[i + 1];
  c.append(el('div', {class:'row', style:{justifyContent:'space-between', marginTop:'28px', flexWrap:'wrap', gap:'8px'}}, prev ? el('a', {class:'btn sm ghost', href:'#/page/principal/' + prev.id}, '← ' + prev.title) : el('a', {class:'btn sm ghost', href:'#/page/principal'}, '← All scenarios'), next ? el('a', {class:'btn sm', href:'#/page/principal/' + next.id}, next.title + ' →') : el('a', {class:'btn sm', href:'#/page/principal/adr'}, 'ADR template →')));
}
function renderWalk(box, s){
  const w = s.walk;
  box.append(prose('<h3>🩺 Diagnose before deciding</h3>' + h.list(w.diagnose)));
  box.append(prose('<h3>🧭 Options</h3>' + h.table(['Option', 'For', 'Against', 'Verdict'], w.options.map(([a, b, cc, d]) => [`<b>${a}</b>`, b, cc, d]), [])));
  box.append(el('div', {class:'callout tip'}, el('b', {class:'ct'}, 'Decision'), frag(`<p>${w.decision}</p>`)));
  if (s.after){ const d = el('div'); box.append(el('h3', {style:{margin:'18px 0 6px'}}, '🗺️ Where it ends up')); box.append(d); SDA.miniDiagram(d, s.after, s.title + ': after'); }
  box.append(prose('<h3>📅 Plan</h3>' + h.table(['Phase', 'What', 'Done when'], w.plan.map(([a, b, cc]) => [`<b>${a}</b>`, b, cc]), [])));
  box.append(prose('<h3>⚠️ Risks</h3>' + h.table(['Risk', 'Mitigation'], w.risks, [])));
  box.append(prose('<h3>📏 How we will know it worked</h3>' + h.list(w.measure)));
  box.append(el('div', {class:'callout deep'}, el('b', {class:'ct'}, '🗣️ What I would tell leadership'), frag(`<p>${w.say}</p>`)));
  if (w.real) box.append(prose('<h4>In public</h4>' + w.real.map(r => `<p>${h.tier(r.tier)} <b>${r.co}.</b> ${r.text} <span class="muted">(${r.src})</span></p>`).join('')));
  // ADR excerpt
  const a = s.adr;
  box.append(el('h3', {style:{margin:'20px 0 6px'}}, '📝 The decision record'));
  box.append(el('pre', {class:'adr-prev'}, adrMarkdown(Object.assign({num:'', status:'Accepted', date:today(), deciders:'Principal engineer, engineering leads'}, a))));
  box.append(el('div', {class:'row', style:{gap:'8px', flexWrap:'wrap', marginTop:'8px'}}, ui.button('Open in the ADR template', () => { ls.set(ADR_KEY, Object.assign(blankAdr(), a, {status:'Proposed'})); location.hash = '#/page/principal/adr'; }, 'sm primary')));
  const rc = refChips(s.refs); if (rc) box.append(el('h4', {style:{margin:'18px 0 6px'}}, '📚 Related lessons'), rc);
}

/* =========================== ADR TEMPLATE =========================== */
const ADR_KEY = 'sda:adr-draft';
const today = () => new Date().toISOString().slice(0, 10);
const FIELDS = [['title', 'Title', 'input', 'Use PostgreSQL as the system of record for orders'], ['num', 'Number', 'input', '7'], ['status', 'Status', 'select', ['Proposed', 'Accepted', 'Deprecated', 'Superseded']], ['date', 'Date', 'input', today()], ['deciders', 'Deciders', 'input', 'Names or roles'],
  ['context', 'Context', 'area', 'What is the situation and the forces at play? Facts, numbers, constraints.'], ['drivers', 'Decision drivers (one per line)', 'area', 'Must handle 5K writes/s at peak\nTeam already operates PostgreSQL'], ['options', 'Options considered (one per line)', 'area', 'PostgreSQL with partitioning\nDynamoDB\nCassandra'], ['decision', 'Decision', 'area', 'We will … because …'], ['positive', 'Positive consequences (one per line)', 'area', ''], ['negative', 'Negative consequences and risks (one per line)', 'area', ''], ['revisit', 'Revisit when', 'input', 'e.g. writes exceed 20K/s, or in 12 months']];
const blankAdr = () => ({title:'', num:'', status:'Proposed', date:today(), deciders:'', context:'', drivers:'', options:'', decision:'', positive:'', negative:'', revisit:''});
const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
function adrMarkdown(a){
  const L = [];
  L.push(`# ${a.num ? 'ADR-' + a.num + ': ' : ''}${a.title || 'Untitled decision'}`, '');
  L.push(`- **Status:** ${a.status || 'Proposed'}`, `- **Date:** ${a.date || today()}`); if (a.deciders) L.push(`- **Deciders:** ${a.deciders}`);
  L.push('', '## Context', '', a.context || '_What is the situation, and what forces are at play?_');
  if (lines(a.drivers).length) L.push('', '## Decision drivers', '', ...lines(a.drivers).map(x => '- ' + x));
  if (lines(a.options).length) L.push('', '## Options considered', '', ...lines(a.options).map((x, i) => `${i + 1}. ${x}`));
  L.push('', '## Decision', '', a.decision || '_We will … because …_');
  L.push('', '## Consequences');
  if (lines(a.positive).length) L.push('', '### Positive', '', ...lines(a.positive).map(x => '- ' + x));
  if (lines(a.negative).length) L.push('', '### Negative and risks', '', ...lines(a.negative).map(x => '- ' + x));
  if (!lines(a.positive).length && !lines(a.negative).length) L.push('', '_What becomes easier, and what becomes harder?_');
  if (a.revisit) L.push('', '## Revisit when', '', a.revisit);
  return L.join('\n') + '\n';
}
SDA.adrMarkdown = adrMarkdown;
const EXAMPLE = {title:'Keep a modular monolith and extract services only on explicit criteria', num:'12', status:'Accepted', date:today(), deciders:'Principal engineer, heads of Orders and Catalog teams',
  context:'The monolith (120 engineers, 14 teams) deploys weekly and 25% of releases are rolled back. A full rewrite into microservices was proposed. Analysis of a year of commits shows most pain comes from a 90-minute flaky test suite and from three domains that change together.',
  drivers:'Lead time from merge to production is 3 weeks\nTeams block each other on the release train\nNo budget for a multi-year rewrite\nMust keep shipping customer features', options:'Big-bang rewrite into microservices\nStrangler-fig extraction of all domains\nModular monolith with enforced boundaries, plus selective extraction\nOnly fix CI and deployment',
  decision:'We will fix the delivery pipeline first, then enforce module boundaries inside the monolith with automated dependency checks and team ownership. A module is extracted into a service only when it needs independent scaling, a different availability target, or is owned by a team blocked by others.',
  positive:'Benefits arrive within one quarter\nNo distributed-systems failure modes introduced prematurely\nBoundaries make later extraction cheap', negative:'One shared database remains for now\nBoundary rules need tooling and discipline\nSome engineers wanted microservices experience', revisit:'Lead time is still over 3 days after two quarters, or a module meets the extraction criteria'};
function renderAdr(ctx){
  const c = ctx.content; ctx.title = 'ADR template'; ctx.wide = true;
  c.append(crumbs([['#/', 'Home'], ['#/page/principal', 'Principal Engineer Thinking'], [null, 'ADR template']]), el('h1', {class:'page-title'}, '📝 ADR template'),
    el('p', {class:'lead'}, 'An Architecture Decision Record captures one significant decision: the context, the options, what you chose, and what it costs. Fill in the form; the Markdown updates as you type and is saved in this browser. Commit the file next to your code, for example docs/adr/0012-modular-monolith.md.'));
  let a = Object.assign(blankAdr(), ls.get(ADR_KEY, {}));
  const form = el('div'), pre = el('pre', {class:'adr-prev', 'aria-live':'polite'});
  const inputs = {};
  FIELDS.forEach(([k, label, type, ph]) => {
    let inp;
    if (type === 'select'){ inp = el('select', {class:'input', 'aria-label':label}); ph.forEach(o => inp.append(el('option', {value:o}, o))); }
    else if (type === 'area') inp = el('textarea', {class:'input', rows:k === 'context' || k === 'decision' ? '4' : '3', placeholder:ph, 'aria-label':label});
    else inp = el('input', {class:'input', type:'text', placeholder:ph, 'aria-label':label});
    inp.value = a[k] || ''; inp.addEventListener('input', () => { a[k] = inp.value; save(); });
    inputs[k] = inp; form.append(el('label', {class:'field', style:{marginBottom:'10px'}}, el('span', null, label), inp));
  });
  const fill = v => { a = Object.assign(blankAdr(), v); FIELDS.forEach(([k]) => { inputs[k].value = a[k] || ''; }); save(); };
  function save(){ ls.set(ADR_KEY, a); pre.textContent = adrMarkdown(a); }
  const md = () => adrMarkdown(a);
  const fname = () => `${String(a.num || '0').padStart(4, '0')}-${slug(a.title || 'decision') || 'decision'}.md`;
  const tools = el('div', {class:'pill-row', style:{margin:'10px 0'}},
    ui.button('📋 Copy Markdown', async () => { const ok = await copyText(md()); toast(ok ? '📋 ADR copied' : 'Copy failed: select the text and copy manually'); }, 'sm primary'),
    ui.button('⬇️ Download .md', () => { const url = URL.createObjectURL(new Blob([md()], {type:'text/markdown'})); const l = el('a', {href:url, download:fname()}); document.body.append(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }, 'sm'),
    ui.button('Load the example', () => fill(EXAMPLE), 'sm ghost'),
    ui.button('Clear', () => fill(blankAdr()), 'sm ghost'));
  c.append(tools, el('div', {class:'adr-grid'}, el('div', null, form), el('div', null, el('b', {style:{display:'block', marginBottom:'6px'}}, 'Markdown preview'), pre)));
  c.append(prose(`<h3>What makes a good ADR</h3>${h.list(['<b>One decision per record.</b> Short enough to read in five minutes.', '<b>Context first.</b> Facts and constraints at the time; a later reader can judge whether they still hold.', '<b>Real options.</b> Include the ones you rejected and why; that is what saves the next debate.', '<b>Honest consequences.</b> List what gets harder, not only what gets better.', '<b>Immutable once accepted.</b> To change your mind, write a new ADR that supersedes this one and link both ways.', '<b>A revisit trigger.</b> A number or date that tells future readers when to look again.'])}<p class="muted">Format based on Michael Nygard’s “Documenting Architecture Decisions” (2011), with decision drivers and options as popularised by later templates such as MADR.</p>`));
  save();
}

/* =========================== REVIEW CHECKLIST =========================== */
const REVIEW = [
  ['🎯 Problem and requirements', ['The problem and who has it are stated in one paragraph', 'Goals and explicit non-goals are listed', 'Scale numbers (users, QPS, data size, growth) are written down with sources', 'Latency, availability and consistency targets are stated per critical flow', 'Success metrics are defined before building']],
  ['🗺️ Architecture', ['At least two alternatives were considered, with reasons for rejecting them', 'Each component has one clear responsibility and one owning team', 'Dependencies point one way; no cycles between services', 'Synchronous call chains are short; async is used where users don’t wait', 'The design is the simplest that meets the requirements (no speculative complexity)']],
  ['🗄️ Data', ['Every piece of data has one owner (system of record)', 'Access patterns drive the choice of store, keys and indexes', 'Schema changes can be made without downtime (expand / contract)', 'Retention, deletion and privacy rules are defined', 'Backups exist and a restore has been tested']],
  ['🛡️ Reliability', ['Every remote call has a timeout and a bounded retry policy', 'Behaviour when each dependency is slow or down is described (fallbacks, breakers)', 'No single point of failure on critical paths, or it is accepted explicitly', 'Load beyond capacity is shed gracefully', 'RTO and RPO are defined and achievable']],
  ['🔐 Security', ['Authentication and authorisation are defined for every entry point', 'Secrets are managed by a secrets service and rotated', 'Sensitive data is encrypted in transit and at rest', 'Inputs are validated; injection risks are addressed', 'A threat model exists for the riskiest flows']],
  ['📈 Operability', ['SLIs and SLOs are defined for user-facing flows', 'Dashboards and alerts are planned, alerting on symptoms not causes', 'Logs, metrics and traces correlate by request id', 'Rollout uses canaries or flags, with a tested rollback', 'Runbooks exist for the likely failures']],
  ['💰 Cost', ['Cost is estimated at launch and at 10× scale', 'Unit cost (per request, user or order) is known', 'Data transfer, logging and storage growth are accounted for', 'Resources are tagged to an owning team', 'A cheaper option was considered']],
  ['🧬 Evolution', ['The decisions that are hard to reverse are identified', 'Public APIs and events are versioned', 'Fitness functions (automated checks) protect key qualities', 'Migration from the current system is planned step by step', 'An ADR records the key decisions']]];
const REV_KEY = 'sda:review-checklist';
function renderReview(ctx){
  const c = ctx.content; ctx.title = 'Architecture review checklist';
  c.append(crumbs([['#/', 'Home'], ['#/page/principal', 'Principal Engineer Thinking'], [null, 'Review checklist']]), el('h1', {class:'page-title'}, '✅ Architecture review checklist'),
    el('p', {class:'lead'}, 'Forty questions to walk through before approving a design. Not every item applies to every system; the point is to skip items on purpose, not by accident. Ticks are saved in this browser.'));
  let st = ls.get(REV_KEY, {}); const total = REVIEW.reduce((n, [, it]) => n + it.length, 0);
  const prog = el('div', {class:'card', style:{margin:'12px 0'}}), bar = el('i');
  const sync = () => { const n = Object.keys(st).length; prog.firstChild.textContent = `${n} of ${total} checked`; bar.style.width = Math.round(n * 100 / total) + '%'; };
  prog.append(el('b', null, ''), el('div', {class:'progress', style:{marginTop:'8px'}}, bar));
  const reset = ui.button('Reset all', () => { st = {}; ls.set(REV_KEY, st); c.querySelectorAll('.chk-group input').forEach(x => { x.checked = false; }); sync(); }, 'sm ghost');
  c.append(prog, reset);
  REVIEW.forEach(([hd, items], gi) => {
    const g = el('div', {class:'card chk-group'}, el('b', null, hd));
    items.forEach((t, ii) => { const k = gi + '.' + ii; const cb = el('input', {type:'checkbox', 'aria-label':t}); cb.checked = !!st[k]; cb.addEventListener('change', () => { if (cb.checked) st[k] = 1; else delete st[k]; ls.set(REV_KEY, st); sync(); }); g.append(el('label', {class:'check'}, cb, el('span', null, t))); });
    c.append(g);
  });
  c.append(prose('<p class="muted">Grouped like the pillars of the AWS Well-Architected Framework, plus requirements, data and evolution. Pair it with an ADR for each decision the review changes.</p>'), refChips(['l:tradeoff-thinking', 'l:sli-slo-sla', 'l:fault-tolerance-spof', 'l:zero-downtime-migrations']) || el('span'));
  sync();
}

SDA.register({kind:'page', id:'principal', icon:'🧭', title:'Principal Engineer Thinking', summary:'15 themes, 8 solve-first scenarios, ADR template and review checklist',
  render(ctx){
    const a = ctx.args[0];
    if (!a) return renderOverview(ctx);
    if (a === 'adr') return renderAdr(ctx);
    if (a === 'review') return renderReview(ctx);
    const s = SDA.scenarios.get(a);
    if (!s){ ctx.content.append(el('div', {class:'empty'}, 'Scenario not found. ', el('a', {href:'#/page/principal'}, 'All scenarios →'))); return; }
    renderScenario(ctx, s);
  }});
SDA.register({kind:'nav', label:'Principal Engineer Thinking', href:'#/page/principal', icon:'🧭', order:2, group:'principal', desc:'15 themes, 8 solve-first scenarios, ADR template, review checklist', count:() => SDA.scenarios.size});
})();
