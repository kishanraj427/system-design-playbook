# Content Quality Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Playbook's full learning corpus so each piece teaches its named idea in the right sequence, explains mechanisms clearly, and helps the reader make a justified design choice.

**Architecture:** Retain the current `SDA.register()` content model and interactive simulations. Approve a dependency map for each module or content group, then rewrite its pieces sequentially. Calibrate the first piece together, and use small review checkpoints for the remaining corpus. Replace the top-of-page Deep-dive switch with an inline disclosure during the first lesson pilot.

**Tech Stack:** Vanilla HTML, CSS, and JavaScript; `bun tools/check.js` for syntax and script-path checks.

**Spec:** `docs/superpowers/specs/2026-11-18-content-quality-design.md` (conversation-derived working design). Also use the user-provided design spec and any separate gaps file once available.

**Status:** Project-level plan approved for execution. The Foundations map is approved, Lessons 1–5 have passed reader review, and Lessons 6–9 are awaiting their checkpoint review.

## Verified Baseline and Coverage

The source currently registers 143 lessons, 28 playgrounds, 28 cases, 33 challenges, 24 projects, and 15 interview solutions. The README says **27** playgrounds; the source has **28** `kind:'playground'` registrations, so the displayed count must be reconciled during inventory. It also contains 8 labs, 15 principal themes, 8 principal scenarios, and over 580 glossary terms. The unit of editorial work is a lesson, playground, lab, case, challenge, project, interview solution, theme, scenario, or glossary term. A project has 17 stages, and a case has 17 content points; those are reviewed together within their parent piece.

| Corpus | Count | Source | Editorial work |
|---|---:|---|---|
| Lessons and module quizzes | 143 in 15 modules | `js/modules/01-foundations.js` through `15-interview.js` | Opening, causal explanation, examples, deep layer, trade-offs, quiz and flashcard language |
| Playgrounds | 28 registered | `js/playgrounds/*.js` | What to change, predicted result, observed metric, explanation of surprises |
| Code labs | 8 | `js/labs/labs.js` | Task setup, code comments, hints, passing behavior and next experiment |
| Cases | 28 | `js/cases/starter-*.js`, `standard-*.js`, `flagship-*.js` | Requirements, scale assumptions, each break/fix transition, flows, trade-offs, build plan |
| Practice challenges | 33 | `js/pages/practice*.js` | Prompt, prerequisites, three escalating hints, solution reasoning |
| Guided projects | 24 | `js/pages/projects*.js` | Every stage's explanation, decision rationale, code-to-design connection |
| Interview solutions | 15 | `js/pages/interview-solutions-*.js` | Eight spoken phases, assumptions, calculations, follow-ups |
| Principal content | 15 themes and 8 scenarios | `js/pages/principal*.js` | Decision context, options, consequences, measures and leadership explanation |
| Glossary and revision | 580+ terms plus cheatsheets | module glossary arrays and `js/pages/cheatsheets.js` | One clear, non-circular definition per term; align summaries with rewritten lessons |

## Curriculum Dependency Spine

The table defines the **audit order** and the main concept transitions to preserve. It does not imply every lesson in a module is currently correct. Before each rewrite, the exact per-piece map must name terms in the current text and their actual first explanation. A deep link may bypass earlier modules, so a piece must still give the minimum context needed to follow it.

| Module | Lessons | Core teaching sequence to establish | Specific dependency to inspect |
|---|---:|---|---|
| 1 Foundations | 14 | system design → requirements → client/server → request journey → latency and estimates → scaling and queues → tail latency → availability and SLOs → fault tolerance → architecture shape | Lesson 1 names load balancer, cache and queue immediately; the request journey mentions DNS/TCP/TLS before Module 2. Define at the needed level or mark as previews. |
| 2 Networking & APIs | 9 | address and DNS → TCP/UDP → HTTP versions → TLS → API styles → real-time transports → API contracts and idempotency → proxies | Rate-limit headers appear before Module 3's algorithms; explain the header without requiring those algorithms. |
| 3 Traffic & Edge | 7 | load balancer roles → algorithms → health checks → geo routing/CDN → rate limiting → DDoS | Consistent hashing appears in LB algorithms before the dedicated database lesson; introduce the minimum idea or preview it. |
| 4 Caching | 6 | cache layers → read/write strategies → eviction → invalidation → failure modes → Redis/Memcached | Database, TTL and CDN are prerequisites; lease and CDC details belong later unless previewed. |
| 5 Databases & Storage | 13 | store choice → transactions and indexes → storage engines → data modeling → isolation/locking → replication/sharding → hashing/pooling → analytics/storage types | Quorums, multi-leader conflict and distributed consistency receive fuller treatment in Module 6. |
| 6 Distributed Systems | 13 | partial failure → CAP/consistency → quorums/clocks → consensus and locks → failure detection/delivery → 2PC/sagas → CRDTs/IDs | Connect every guarantee to an observable read, write or failure; separate formal guarantees from product behavior. |
| 7 Async & Pipelines | 11 | queues/pub-sub/streams → Kafka and broker choice → ordering/retries/backpressure → event-driven models → fan-out → batch/stream → CDC/workflows | Build on Module 6 delivery semantics and Module 2 idempotency; do not assume Kafka is the default queue. |
| 8 Search & Special Structures | 10 | inverted index → ranking → search engine → trie/Bloom/sketches → geo/time-series/vector/recommendations | Reuse Module 5 indexes and Module 7 ingestion; distinguish exact answers from probabilistic estimates. |
| 9 Reliability | 10 | timeout/retry → circuit breaker/bulkhead/load shedding → redundancy and regions → recovery/chaos → capacity/autoscaling | Reuse Module 1 SLO and queueing ideas; show when retries amplify an outage. |
| 10 Architecture & Platform | 12 | domain boundaries → service communication/migration → serverless/containers/Kubernetes → app practices → tenancy/hexagonal/config | Docker must be clear before Kubernetes; operational choices must refer to team and workload constraints. |
| 11 Observability & Ops | 9 | logs/metrics/traces → signals/alerts/incidents → CI/CD and rollout → IaC/migrations → cost | Use Module 1 SLIs/SLOs and Module 9 failure scenarios; distinguish measurement from diagnosis. |
| 12 Security | 11 | identity → sessions/tokens → delegation/policy → service identity/encryption → secrets and OWASP → tenant isolation/compliance | Reuse Module 2 TLS and API concepts; distinguish authentication from authorization at each example. |
| 13 Real-time & Media | 8 | WebSockets/presence/push → WebRTC → live streaming/transcoding → offline sync/mobile limits | Reuse Module 2 transports, Module 7 fan-out and Module 6 conflict resolution. |
| 14 Design Principles | 4 | SOLID and simplicity → recurring patterns → trade-off thinking | This is a synthesis module despite its Intermediate level label; examples should use concepts already established. |
| 15 Interview & Meta | 6 | interview framework → speaking through trade-offs → mistakes/drills → technology choice → revision | Use the preceding curriculum as tools, not an unexplained technology checklist. |

**Known ordering tension:** Module 1 teaches the web request journey before the detailed DNS/TCP/TLS lessons. The repair is a short, plain-language preview in Module 1 and the full mechanism in Module 2. Do not solve this by silently assuming prior networking knowledge or by moving files without a separate navigation decision.

### Foundation lesson sequence to audit first

This is the initial dependency map for the recommended first module. It is a planning hypothesis, to be checked against each lesson's full prose, diagrams, quizzes, and links before any rewrite. A line does not approve that lesson's content.

| Order and ID | Concept the lesson must establish | Prior anchor or preview decision |
|---|---|---|
| 1 `what-is-system-design` | A system is cooperating parts; design chooses responsibilities and behavior under constraints. | Explain server and database in ordinary words before naming LB/cache/queue as optional responses. |
| 2 `seven-step-approach` | Clarify → estimate → API/data → design → deep dive → bottlenecks/trade-offs. | Builds on Lesson 1's idea that requirements and constraints drive choices. |
| 3 `functional-vs-nonfunctional` | What the system does versus how well it must do it. | Expands the “clarify” step; distinguish measurable target from feature. |
| 4 `client-server` | A request crosses from client to server and returns a response; state complicates scaling. | Establishes the actors before Lesson 5's network journey. |
| 5 `web-request-journey` | The visible request path and where time is spent. | DNS/TCP/TLS are plain-language previews; full protocols come in Module 2. |
| 6 `latency-numbers` | Orders of magnitude and why each hop costs time. | Uses the request path, then introduces scale comparisons without number memorization as the main goal. |
| 7 `back-of-envelope` | Convert users and actions to QPS, storage and bandwidth assumptions. | Uses Lessons 3 and 6; math must show units and peak factor. |
| 8 `vertical-vs-horizontal` | Add capacity to one machine or add machines; identify new coordination costs. | Requires Lesson 4's server model and Lesson 7's load estimates. |
| 9 `latency-vs-throughput` | Work arriving faster than service capacity creates a queue and rising wait time. | Builds on Lessons 6–8; a queue is first a waiting line, not yet a message broker. |
| 10 `percentiles-tail-latency` | Averages hide slow users; parallel fan-out amplifies tails. | Builds on latency and queueing; make p99 observable before its formula. |
| 11 `availability-nines` | Define availability over a period and quantify downtime. | Uses Lesson 1's failure question; avoid treating “nines” as a guarantee without a measurement definition. |
| 12 `sli-slo-sla` | Measure service behavior, set a target, and distinguish a promise. | Builds directly on Lesson 11; explain error budget with one example. |
| 13 `fault-tolerance-spof` | Identify a single point of failure and the conditions for useful redundancy. | Uses availability, load and the request path; do not imply two copies guarantee independence. |
| 14 `monolith-to-microservices` | Choose architecture shape from team and deployment needs, not fashion. | Uses all prior constraints; distributed failure details are previews for Module 6. |

## Global Constraints

- The user chooses the first piece. Do not draft or edit it before showing and receiving approval for its content map.
- Write one piece at a time. Review and iterate on the first before proceeding; thereafter use the approved group map and checkpoint cadence below.
- Do not change content, schema, or UI without a piece-specific plan.
- Answer the title first. Explain unfamiliar terms or frame them as explicit previews.
- Explain mechanisms causally; state assumptions for numerical and failure examples.
- Use natural prose with no em dashes or semicolons in running text.
- Keep analogies useful and connected to the explanation and trade-offs.
- Preserve interactive behavior and deep links.
- A reader must open Deep-dive where the simple explanation ends; no return to the top and no second pass through unchanged sections.

## Review Focus

- A beginner opens a lesson by deep link: its opening supplies enough context without assuming the previous page was read.
- A quiz distractor or explanation names a later concept: it does not require knowledge the reader has not yet gained.
- A failure story describes one possible sequence: its assumptions are visible and its outcome is not presented as inevitable.
- An analogy hides a technical distinction: the literal mechanism remains clear after the analogy.
- A rewrite changes content data: diagrams, quiz links, glossary references, and route rendering still work.
- A reader opens `#/l/:id/deep` or a Deep-dive table-of-contents link: the disclosure opens before scrolling to its content.

## Repository Map

- `js/modules/NN-*.js`: lesson bodies, module quizzes, flashcards, and glossary entries.
- `js/playgrounds/*.js`: playground instructions and simulations.
- `js/labs/labs.js`: code labs and their instructions.
- `js/cases/*.js`: case-study engine and case content.
- `js/pages/practice*.js`, `projects*.js`, `interview-solutions*.js`, `principal*.js`: other learning formats.
- `js/core/app.js` and `css/styles.css`: lesson rendering and Deep-dive presentation; the inline disclosure is a separately reviewed change in the first pilot.
- `index.html`: ordered script loading; `dist/index.html`: generated single-file artifact if source changes are approved.

## Editorial Changes by Content Type

These are the specific fields to inspect and the teaching result expected. Preserve the content type's native interaction; do not force the lesson template onto every format.

| Type | Rewrite target | Reader should be able to do afterward |
|---|---|---|
| Lesson | `summary` answers the title in plain language. `problem` starts from an observable situation, explains the trigger and the causal sequence. `intuition` gives one useful mental model. `how` explains the mechanism in the order it runs. `deep` adds internals and boundary cases. `tradeoffs` returns to the same scenario. `mistakes` and `interview` explain the mistake or reasoning, not just name it. | Explain what happens, why the choice helps, and when it fails. |
| Quiz/flashcard | Audit `tryit.quiz`, module `quiz`, and `flashcards` separately. Inline checks use current or earlier lesson knowledge. Module quizzes may use any lesson in that module. Distractors do not rely on unexplained jargon to be ruled out. | Answer from understanding rather than recognition of a term. |
| Playground | Rewrite `summary`, `explain`, controls, status messages, and metric labels where needed. Give an initial prediction, one control to change, the metric to watch, and an explanation of the result. Keep the model's assumptions visible. | Change an input, predict the direction of the outcome, then explain the observed difference. |
| Lab | Rewrite `summary`, `explain`, `challenge`, code comments, and `check()` messages. State the task before starter code, give a useful hint ladder where needed, explain what passing output means, and name one meaningful extension. Preserve runnable code and self-checks. | Implement or alter the algorithm and recognize correct output. |
| Case | Rewrite `overview`, `challenges`, `scale`, each `evolution` break/fix, `flows`, `breakIt`, `tradeoffs`, `lab`, and `twists` as one arc. Make the failed component and observed symptom explicit before revealing a fix. Tie each fix to a previously taught concept or explain it in place. | Narrate why the architecture changed at each scale step, including what it costs. |
| Challenge | Rewrite `prompt`, `constraints`, three `hints`, and `solution`. Hint 1 exposes a requirement or bottleneck, hint 2 a useful model, hint 3 a design direction. Keep the complete design in the solution. | Make a first attempt before seeing the answer and understand each hint's purpose. |
| Project | Preserve all 17 stage keys. In `req` through `review`, explain why each decision follows from the earlier stage. Tie code samples to the data model, API and failure assumptions. Do not turn stage text into longer checklists. | Move from requirement to v1, scale, failure handling and review with a reason for each step. |
| Interview solution | Keep eight phases and their time boxes. Rewrite `think` blocks as plausible spoken reasoning: ask, assume, calculate, choose, name the cost, and adjust. Check live estimates at default/min/max inputs. | Practice saying a defensible answer under time pressure. |
| Principal theme/scenario | Make the decision context concrete. Show options, what evidence would change the choice, a phased action, and what to measure. Keep the scenario answer hidden until the learner commits to a first move. | Explain a decision to engineers and leaders, including its risks and reversal path. |
| Glossary/cheatsheet | Give a one-sentence definition using earlier terms or ordinary words. Remove definitions that only repeat the term or point to another undefined term. Update cheat sheets after their source lessons, not before. | Recall a concept without opening a chain of other definitions. |

## Teaching Method for Difficult Ideas

Use these moves when they help the topic; do not force every piece into the same template.

1. **One question first:** Begin with the question in the title and answer it in ordinary language. Give the reader one reason to care before introducing components.
2. **One running situation:** Choose a small, concrete example. Change one condition at a time, such as traffic, failure, data size, or correctness requirement. Keep the same example through explanation and trade-offs so the reader can see what each decision changes.
3. **Predict, observe, explain:** Before a diagram or playground reveals the result, ask what the reader expects. Then show the internal steps and the visible outcome. Explain why a surprising result occurred. Use existing `how.intro`, `how.steps`, diagram captions, `tryit.note`, or playground `explain` before adding a new schema field.
4. **Literal mechanism after analogy:** Use an analogy to start intuition, then map its parts to real components and state where it stops matching. Never let the analogy replace the actual request, write, retry, or failure path.
5. **One new term at a time:** Spell out an acronym at first meaningful use. If a future concept is unavoidable, give the minimum plain-language preview and point to its full lesson. A glossary tooltip is a reminder, not the first explanation.
6. **A transfer check:** End with a small change to the scenario, such as “what if traffic is only 200 users?” or “what if the database is healthy but slow?” The reader should apply the rule rather than repeat a sentence. Reuse an inline quiz or `tryit` where possible.

**Deep content must add something new.** It should explain internals, edge cases, assumptions, or limits that matter after the simple mechanism is understood. Do not make a reader open it merely to reread the same paragraph with more jargon.

**Reading comfort check:** The current body text is 16px with 1.7 line height, but lesson text may use the full 880px content width. On the pilot lesson, inspect paragraph line length, paragraph size, contrast, diagram captions, glossary interruptions, and 360px reading flow. If prose is too wide, plan a text-only width limit while leaving diagrams and tables wide. Prefer shorter, purposeful paragraphs over adding more cards or bullets.

### Example of a planned content change, not a draft

For `what-is-system-design` in `js/modules/01-foundations.js`, the current problem states that a single server reaches 100% CPU and the database runs out of connections. The rewrite will first define system design as deciding how parts of an application work together under real requirements. It will then follow a single results request through the app at small scale, increase arrivals, explain where work waits, show one plausible bottleneck with stated assumptions, and only then introduce candidate changes and their costs. The restaurant analogy will support the mechanism and return in the trade-offs. The inline quiz will test the definition and causal reasoning; it will not require knowledge of a later technology to choose an answer. This is the default pilot **only if the user selects or approves it as the first piece**.

## Per-Piece Content Map Contract

Each map is shown before editing. For lessons, create **one per-module dependency graph with a row for every lesson**. Each row records: `id/title`, reader level, prior concepts with exact lesson IDs, new terms in introduction order, future terms with preview wording, existing diagram/playground/lab links, quiz scope, and the one takeaway. Show the causal sequence as `situation → trigger → internal state changes → user-visible result → design response → new trade-off`. If the lesson is a comparison or reference topic, adapt the sequence and explain why. The user approves the module map before any lesson in that module is rewritten; new discoveries update the map and are shown at the next checkpoint.

For other formats add the following to that base map:

- **Playground/lab:** prerequisite lesson IDs, each control or code edit, expected observation, model assumptions, and self-check or metric.
- **Case:** prerequisite lesson IDs for **each evolution step**, new concepts introduced by the case, and which break/fix pair teaches each one.
- **Challenge:** prerequisite module/lesson IDs, what each of the three hints reveals, and what the solution must justify.
- **Project:** prerequisite modules, new idea at each of the 17 stages, and which earlier stage each later decision depends on.
- **Interview solution:** prerequisite modules, assumptions and formulas in each of the eight phases, and any named technology introduced only for the worked example.
- **Principal content:** prerequisite experience or lessons, the decision being practiced, options, consequences, and evidence that would change the answer.
- **Glossary:** the first lesson that teaches the term and any definition-to-definition dependency that could form a jargon loop.

**Map format shown to the user:** `Existing knowledge | New knowledge in order | Preview/remove | Mechanism or decision path | Linked interaction | Quiz/answer boundary | Proposed edit`. A case has a row per evolution step; a project has a row per stage. For playgrounds, labs, practice, solutions, principal content, and glossary, a group map names every item in the selected module, level, or source file and its prerequisites. The map is an approval artifact, not a rewrite.

## Delivery Sequence and Review Gates

The user chooses the first piece and can change the order. The recommended sequence below keeps prerequisite teaching ahead of advanced applications. Each row is an inventory of pieces to process, **not** permission to rewrite a whole row at once. The repeated unit after the pilot is: map a module or content group → user approves its map → edit one piece → verify and record it → continue sequentially to a small checkpoint → show results and incorporate feedback → continue.

| Wave | Scope and exact source | Why this order | Exit check |
|---|---|---|---|
| 0 | Audit every registration and link; create the editorial guide, concept index, and coverage ledger under `docs/content-quality/` after plan approval. Reconcile 28 source playgrounds with README's 27. | Establish names, prerequisites and real counts before rewrites. | Every piece has an ID, file, type, entry route, prerequisite status and review state. |
| 1 | Pilot one user-selected piece. Recommended pilot: `what-is-system-design` in `js/modules/01-foundations.js`; implement the separately reviewed inline Deep-dive UI alongside the pilot. | Validate voice, teaching depth and the reading flow before repeating them 143 times. | User accepts the first piece and can open deeper detail where the simple explanation ends. |
| 2 | Foundations, 14 lessons in `js/modules/01-foundations.js`; five Foundation playgrounds in `js/playgrounds/p1-foundations.js`. | The rest of the curriculum depends on these mental models. | Lesson order and inline quizzes have no unexplained prerequisites; playground instructions agree with lessons. |
| 3 | Networking (9) and Traffic (7) in `js/modules/02-networking.js`, `03-traffic.js`; three Traffic playgrounds in `js/playgrounds/p2-lb-ratelimit-cdn.js`. | Establish request mechanics and edge behavior. | DNS/TCP/TLS and load-balancing terminology has a clear first explanation. |
| 4 | Caching (6), Databases (13), Distributed (13), Async (11), Search (10) in modules 4–8; related playgrounds and all eight labs. | Build state, consistency and data-flow reasoning before product cases. | 53 lessons, their linked interactions and labs have coherent prerequisites and passing explanations. |
| 5 | Reliability (10), Architecture (12), Observability (9), Security (11), Real-time (8), Principles (4), Interview (6) in modules 9–15; related playgrounds. | Extend the foundation into operations, product decisions and synthesis. | 60 lessons and linked interactions have no unframed forward references. |
| 6 | Starter cases (8), then standard (10), then flagship (10) in `js/cases/*.js`. | Apply taught concepts to increasing product complexity. | Each of 28 cases has a coherent break/fix chain, stage prerequisites, stated scale assumptions and earned trade-offs. |
| 7 | Practice (33), projects (24), interview solutions (15), principal themes (15) and scenarios (8) in `js/pages/*.js`. | Move from guided examples to independent decisions and spoken reasoning. | Hints reveal progressively; 17 project stages and eight interview phases form complete reasoning chains. |
| 8 | Module glossary arrays, `js/pages/cheatsheets.js`, search/summary copy and cross-corpus terminology. | Align revision material after the primary teaching pieces settle. | No circular definitions, contradictory names, or stale summaries remain. |
| 9 | Final cross-corpus Deep-dive check across all rewritten lessons, using `js/core/app.js` and `css/styles.css` only if the first-pilot implementation needs correction. | Confirm the first-pilot interaction still fits lessons with different structures. | Every lesson with deeper content exposes it in place; direct links and keyboard access still work. |

**Interleaving rule:** Waves 2–5 include their related playgrounds, labs, glossary terms and cheat sheet updates when a lesson's rewrite would otherwise leave them inconsistent. Waves 6–8 then do the full cross-corpus editorial pass. Writing remains sequential; review happens at the checkpoints below after the first pilot.

## Bulk-Work Cadence

The corpus is too large for a fresh approval after each of hundreds of terms and pieces. This cadence is a **proposal for the user's review**; the first piece still gets direct, iterative review.

| Stage | Work unit | User-visible checkpoint | What happens if the checkpoint finds a pattern error |
|---|---|---|---|
| Pilot | One selected lesson, preferably `what-is-system-design`, with its content map and inline Deep-dive UI | Review the rendered lesson and three comprehension prompts; revise until accepted. | Change the editorial guide before any further writing. |
| Lesson calibration | One representative technical lesson such as `cache-invalidation` and one advanced lesson such as `consensus-raft`, reached when their module maps are approved | Check that the beginner voice scales to dense topics without flattening accuracy. | Adjust the guide for level-specific depth and repair the examples. |
| Module rewrite | One approved module map; edit lessons **one at a time**, in dependency order | Show a review set after roughly 3–5 lessons, then a module-end review including quiz, flashcards, glossary and linked playgrounds/labs. | Stop that module, correct the shared misconception or terminology, and recheck earlier pieces in the set. |
| New content type | First playground, lab, case, challenge, project, interview solution, principal scenario, and glossary batch | Review one representative item of that format before continuing its bulk pass. | Update that format's guidance before the remaining items. |
| Applied-content pass | Approved group maps for cases, challenges, projects and solutions; edit each parent piece sequentially | Show 2–3 cases or projects at a checkpoint, and 3–5 challenges or solutions. | Recheck their prerequisite map and shared assumptions before continuing. |
| Glossary/cheatsheets | One module's terms and revision sheet at a time | Review one module's batch against its completed lessons. | Repair definitions and dependent summaries within that module. |
| Final integration | All reviewed units | Show the coverage ledger, unresolved issues, route checks and representative beginner/advanced pages. | Do not claim complete until missing or inconsistent units are resolved. |

**Stop rule:** If a piece exposes a missing prerequisite, incorrect mechanism, unsupported number, or misleading analogy that affects other pieces, stop that review set. Repair the concept map and affected earlier pieces before expanding the pattern.

## Editorial Acceptance for Every Piece

1. **Title:** The first paragraph answers the title in the reader's vocabulary. A comparison explains both sides before judging them. A case or project states the product problem before listing infrastructure.
2. **Knowledge:** Every required technical term has an earlier lesson, an in-piece explanation, or an explicit preview. An inline quiz tests only current/earlier teaching; a module quiz can test its whole module.
3. **Mechanism:** For a failure or algorithm, the reader can identify the initial state, trigger, state changes, and visible result. Conditional outcomes are labeled as such.
4. **Technical truth:** Numerical examples show assumptions and units. Real-world architecture claims retain their `confirmed`, `inference`, or `educational` tier. Avoid invented internal details or an inevitable failure order.
5. **Voice:** Read the prose aloud. Break compressed sentences. Remove em dashes and semicolons from running copy. Keep code, formulas, titles, and genuine technical notation legible rather than applying a blind replacement.
6. **Analogy:** When used, it maps cleanly to the mechanism and returns at the decision point. If the mapping becomes misleading, use a direct example instead.
7. **Trade-off:** At least one choice is tied to the piece's own scenario, states the benefit, and names the cost or condition that would change the choice.
8. **Interaction:** A diagram, playground, lab, hint, or reveal tells the learner what to do or notice. The reader can connect the interaction's output to the prose.
9. **Reader check:** After reading, a learner at the stated level can explain the key idea and one boundary case in their own words. The user reviews this qualitatively for the pilot; automated word counts do not substitute for it.
10. **Transfer:** The learner can apply the idea when one input or constraint changes. A quiz or prompt should ask for that decision and explain the reasoning behind the answer.
11. **Depth:** The Deep-dive adds a genuinely new layer and opens at the point of curiosity; the simple explanation stands on its own.

### Pilot comprehension check before scaling the voice

After the first lesson is rewritten, show it to the user as a rendered page and ask three concrete checks: (1) explain the title in their own words, (2) narrate the cause-and-effect path in the running example, and (3) choose a sensible response when one constraint changes, including its cost. Record confusing terms, places where the story jumps, and any point where the diagram and prose disagree. Revise that **same lesson** until those gaps are resolved. Only then use it as a voice reference for the next lesson. This is a comprehension review, not a claim that the rewrite is proven effective for every reader.

## Verification for Approved Edits

- Before editing, record the current route, IDs, referenced lesson/playground/lab links, diagram steps, source tiers, and quiz answers. Do not change simulation algorithms as a side effect of prose edits.
- After each content edit, inspect the diff for scope and copy, run `bun tools/check.js`, and verify the affected hash route and relevant interaction in a browser when available. For an HTML-bearing string, confirm markup renders as intended and glossary highlighting does not break it.
- At each review checkpoint, run `python3 tools/bundle.py` and check affected routes in both `index.html` and `dist/index.html`. The multi-file source remains the working copy between checkpoints; the released bundle is synchronized at each checkpoint.
- For a lab, run its code and check the named `check()` results. For a playground, compare at least two control settings and explain the metric movement from the model's assumptions. For a case, step through each touched evolution state before and after applying a fix.
- For the Deep-dive UI change, inspect desktop and 360px layouts, keyboard operation, `aria-expanded`, theme contrast, reduced motion, and deep links. Confirm the old top control is gone and opening detail does not rerender or repeat simple sections.
- Keep a coverage ledger of `unmapped → group map approved → rewritten → verified → checkpoint reviewed` for every unit. A syntax pass alone does not mark editorial work complete.

## Task 0: Establish the editorial inventory after plan approval

**Files:** Create `docs/content-quality/editorial-guide.md`, `docs/content-quality/concept-index.md`, and `docs/content-quality/coverage-ledger.md`. Read `README.md`, `IMPLEMENTATION_PLAN.md`, all `js/modules/*.js`, `js/playgrounds/*.js`, `js/labs/labs.js`, `js/cases/*.js`, and the relevant `js/pages/*.js` registrations.

- [ ] Record every content unit's ID, title, source file, route, type, module or level, and current review state in the ledger. Reconcile the README's 27-playground claim with 28 source registrations.
- [ ] In the concept index, record the **first full explanation** of each major concept and earlier plain-language previews; distinguish a glossary tooltip from teaching the concept.
- [ ] In the editorial guide, document a before/after example for each content type, including Lesson 1's conditional overload story, a playground instruction, a case break/fix, a project stage, and a glossary definition.
- [ ] Add the eleven acceptance checks above and the predict/observe/explain method to the guide with examples of passing and failing prose. Keep the guide short enough to use during each review.
- [ ] Show the inventory, guide, and concept index to the user before starting the first rewrite.

**Checkable result:** All registered units have one ledger row; counts match source registrations; the guide demonstrates actual content transformation rather than only style rules.

## Task 1: Map the first named piece and its content group

**Files:** Read the relevant content file and prerequisite content. Save no content changes.

- [ ] Record the selected piece's title, audience, current opening, and intended takeaway.
- [ ] Build the map for its parent module or content group, with one row per lesson or item and exact earlier lesson locations for required concepts.
- [ ] For each item, list new concepts in teaching order and later concepts with proposed preview wording or a reason to remove them.
- [ ] For cases, map each evolution stage to prerequisite lessons; for projects, map all 17 stages and required modules; adapt the same dependency check to other formats.
- [ ] Show the group map, highlight the selected pilot piece, and wait for the user's approval before drafting.

**Checkable result:** The user can trace every unfamiliar term in the piece to an earlier explanation, an explanation in this piece, or an explicit preview.

## Task 2: Plan the pilot and its group

**Files:** Name the exact content file and any rendering file after Task 1 identifies the piece; list the remaining files in its group.

- [ ] Identify the teaching move suited to this topic and content type.
- [ ] Write a pilot plan naming the exact fields or sections to change and the interactions to preserve. Include a short ordered work queue for the rest of its approved group.
- [ ] Define a short editorial review: title alignment, causal clarity, prerequisites, technical accuracy, analogy, trade-offs, and read-aloud quality.
- [ ] Define technical checks for the files touched, including `bun tools/check.js` and a rendered route check when UI or markup changes.
- [ ] Show the pilot plan and group work queue before making content changes.

**Checkable result:** The approved map determines the rewrite's scope, and the plan identifies one reviewable piece.

## Task 3: Rewrite and calibrate the first piece

**Files:** Only those named in the piece-specific plan.

- [ ] Rewrite the approved piece without altering adjacent pieces.
- [ ] Read it aloud for flow and remove compressed or reference-manual phrasing.
- [ ] Check every technical claim and number against its stated assumptions.
- [ ] Check that the example changes one condition at a time, the diagram agrees with the prose, and the Deep-dive adds new insight.
- [ ] Run `bun tools/check.js` and inspect the affected route and interaction.
- [ ] Show the rendered piece, run the three pilot comprehension checks with the user for the first lesson, and revise before starting another piece.

**Checkable result:** The first piece passes its editorial review, existing interactive behavior remains usable, and the user's feedback is incorporated into the guide before bulk work.

## Task 4: Execute approved groups sequentially

- [ ] Select the next group in the user's chosen order, show its complete map, and wait for map approval.
- [ ] Edit one piece at a time in dependency order. Update its ledger row and run the relevant checks before moving to the next piece.
- [ ] Stop after roughly 3–5 lessons or the smaller content-type checkpoint, show the rendered changes, and incorporate feedback before continuing.
- [ ] At each module or type boundary, audit quizzes, links, glossary terms, diagrams, and terminology across the completed group. Regenerate and check the bundle.
- [ ] Repeat until every registered content unit has a verified and checkpoint-reviewed ledger state; present remaining exceptions explicitly.

**Checkable result:** Every content unit has an approved dependency context and a verified editorial state. The first sample of each new format is accepted before its bulk pass, and no unresolved pattern issue is propagated.

## Separate UI Task: Deep-dive discoverability

- [ ] Inspect one lesson with `how.deep`, one with `l.deep`, and one with both. Record the current top toggle, the post-How callout, and the hidden Deep-dive table-of-contents link.
- [ ] Remove `depthSeg()` from the lesson header and module overview. Keep the lesson completion control in place.
- [ ] At the end of the simple “How it works” explanation, render one visible `Go deeper` button when `how.deep` or `l.deep` exists. If a lesson has no `how`, place it after the last simple explanatory section.
- [ ] On activation, reveal the existing `how.deep` and `l.deep` material immediately below the button in reading order. Change the button to `Hide deeper explanation`; collapsing restores the same scroll position. Other simple sections do not change.
- [ ] Use a real button and a controlled region with `aria-expanded` and `aria-controls`. Keep focus on the button, make the revealed content available to screen readers, and avoid unnecessary animation in reduced-motion mode.
- [ ] Preserve `#/l/:id/deep` and any Deep-dive table-of-contents navigation by opening the disclosure before scrolling. The table-of-contents link remains visible and has an understandable target.
- [ ] Treat the old `Store.data.depth` preference as legacy state for this interaction: do not make a reader's new lesson open in Deep mode unexpectedly, and do not erase stored progress or notes.
- [ ] Show the exact UI change for approval as part of the pilot plan before editing `js/core/app.js` or `css/styles.css`; after implementation, check keyboard, deep link, desktop, 360px, both themes, and reduced motion.

**Checkable result:** Readers reach the end of the simple explanation, open the deeper material there, and continue reading without returning to the top or revisiting unchanged sections.

## Plan Status

The source inventory, editorial guide, concept index, and 14-lesson Foundations map are available under `docs/content-quality/`. The user approved the Foundations map and Lesson 1 pilot on 2026-11-18, then accepted Lessons 2–5. Lessons 6–9 are rewritten on the `content-quality-lesson-1` branch and await reader review. The inline Deep Dive interaction is implemented and preserved. Lessons 10–14 and other content types remain in the plan.
