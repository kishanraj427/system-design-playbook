# System Design Playbook — Implementation Plan

This is the plan and checklist for building System Design Playbook. Before each part, compare it against this file. After each part, update the status columns from the **measured** audit in §11, not from memory.

- Status key: ✅ done and verified · 🟡 partly done · ⬜ planned
- Last updated: 2026-11-13, after Part 15 of 15. **All 15 parts are complete.**

---

## 1. The spec's non-negotiables

| # | Requirement (from the original spec) | How it's met | Status |
|---|---|---|---|
| R1 | One self-contained `index.html` with inline `<style>` and `<script>`, vanilla JS, no build step | **Changed 2026-11-13 at the user's request:** the source is now split into files (§3.0). It still needs no build step and opens by double-click. `python3 tools/bundle.py` produces the single-file `dist/index.html` | ✅ |
| R2 | The only CDN is Google Fonts, with a system fallback. It must work offline after load | Inter and JetBrains Mono load from Google Fonts, with system stacks as fallback | ✅ |
| R3 | No external images | Only SVG, canvas, CSS and emoji | ✅ |
| R4 | No placeholders (no TODO, lorem ipsum, "similar for the rest" or "// rest of code") | grep check before closing each part (§10) | ✅ (checked through Part 15) |
| R5 | Content stored as data, with each registration wrapped in try/catch | `SDA.register()` catches errors itself, and failures are listed in `SDA.errors` | ✅ |
| R6 | Hash routing that deep-links and supports the back button | Routes `#/`, `#/roadmap`, `#/m/:id[/tab]`, `#/l/:id`, `#/pg/:id`, `#/playgrounds`, `#/labs`, `#/lab/:id`, `#/glossary`, `#/path/:id`, `#/page/:id`, `#/cases`, `#/case/:id[/tab]` | ✅ |
| R7 | Respect `prefers-reduced-motion` | Diagrams become static step-by-step reveals, and loops do not autoplay | ✅ |
| R8 | Opens by double-click, from a 360px phone to an ultrawide desktop | Tested over `file://`. 360px screenshots checked | ✅ |
| R9 | Sequential parts. Part 1 ends with `<!-- @@NEXT-PARTS-GO-HERE@@ -->` then `</body></html>` | The marker is still in `index.html`. Each new part adds its JS files and puts their `<script src>` tags just above the marker | ✅ |
| R10 | Each part ends with `PART X/N DONE. Contains: […]. Say "Continue" for Part X+1.` | Final line of every part message | ✅ |
| R11 | Every concept follows the 7-part teaching template with a Simple/Deep toggle | The lesson schema (§3.3) enforces it, and the audit checks for missing fields | ✅ M1–M15 |
| R12 | 3 accuracy tiers on real-world claims; never invent URLs | `real[].tier` is one of `confirmed`, `inference` or `educational`. Sources are named, with no URLs | ✅ |
| R13 | Legend for component colors on every diagram (client, LB, service, cache, DB, queue, CDN, external) | `Diagram` renders `ui.legend` automatically | ✅ |
| R14 | Every diagram has Play / Pause / Step / Reset / Speed. It starts when in view and pauses when out of view | `SDA.Diagram` controls, plus `IntersectionObserver` | ✅ |
| R15 | Accessibility: semantic HTML, ARIA, keyboard nav, visible focus, AA contrast, `<title>` on SVGs | Glossary terms use `span[role=button][tabindex=0]` and work with Enter and Space | ✅ |

## 2. Site features in the spec

| Feature | Spec requirement | Part | Status |
|---|---|---|---|
| Home | Animated hero (network canvas, shimmer headline, typewriter, scroll cue), 5 learning paths, "Continue where you left off", progress ring | 1 | ✅ |
| Navigation | Sticky top bar, Ctrl/Cmd+K, theme toggle, progress ring, sidebar grouped by level, "On this page" TOC (IntersectionObserver), mobile drawer | 1 | ✅ |
| Roadmap | Beginner → Intermediate → Advanced → Distributed → Real-World → Principal, with lesson checkboxes saved to localStorage (`sda:v1`) | 1 | ✅ |
| Search palette | Searches topics, glossary and case studies | 1, 9 | ✅ (cases added via `SDA.searchProviders`) |
| Glossary | 150+ terms, auto-highlighted in lessons, with hover/tap tooltips | 1–8 | ✅ 581 terms |
| Quizzes | At least 5 per module: MCQs with instant feedback and explanation, plus scenario questions | each module | ✅ M1–M15 (10–12 MCQ + 2 scenario each) |
| Flashcards | One mode per module | each module | ✅ (built from the module's MCQs when `m.flashcards` is absent) |
| Cheat sheets | One per module, with a copy button | each module | ✅ M1–M15, plus the all-modules page `#/page/cheatsheets` |
| Code labs | In-page editor with Run, for LRU, token bucket, consistent hashing and Bloom filter. Runs in a Worker or sandboxed iframe | 8 | ✅ 8 labs (`js/labs/labs.js`): lru-cache, token-bucket, consistent-hashing, bloom-filter, sliding-window, snowflake-id, merkle-diff, lsm-tree. All checks pass in the in-browser Worker, and each lab is linked from its lesson’s Try it |
| Practice Arena | 30+ challenges, each with hints 1→2→3 and then a full solution outline with a diagram | 14 | ✅ 33 challenges (10/11/12), `#/page/practice` |
| Projects | 24 projects, each walked through 17 stages (§7) | 14 | ✅ 24 projects × 17 stages, `#/page/projects` |
| Interview prep | Framework and time-boxing, plus 15 full worked solutions | 8 (M15), 15 | ✅ M15 framework and drills, plus 15 worked solutions at `#/page/interview-solutions` (read mode and a timed mock-interview mode) |
| Principal thinking | 15 themes and 8 scenarios, solved before the reveal | 15 | ✅ `#/page/principal`: 15 themes, 8 scenarios (graded first move → your plan → walkthrough), ADR template builder, 40-item review checklist |
| Case studies | 28 cases with the 17-point structure | 9–13 | ✅ all 28: 8 starter + 10 flagship + 10 standard |

## 3. Architecture and contracts

### 3.0 File layout (split 2026-11-13)

```
index.html                 shell markup + <link>/<script src> tags in load order
css/styles.css             the whole design system
js/core/engine.js          SDA registry, Diagram engine, ui kit, quiz, labs runner
js/core/app.js             router, pages, home, palette, sidebar, boot
js/modules/NN-<id>.js      one file per module (01-foundations … 08-search)
js/playgrounds/pN*-*.js    playground files, grouped by part
tools/bundle.py            inlines everything into dist/index.html (single-file build)
tools/check.js             syntax-checks every js file and every <script src> path (bun tools/check.js)
```

**How each new part is added:**
1. Create the new files, for example `js/modules/09-reliability.js` and `js/playgrounds/p6-*.js`. Later parts will use `js/cases/`, `js/labs/` and `js/pages/`.
2. Add one `<script src>` tag per new file just above `<!-- @@NEXT-PARTS-GO-HERE@@ -->`.

**Rules:**
- **Order:** load order matters. Core files come first, then content.
- **Classic scripts only:** use plain scripts, never `type=module`. ES modules and `fetch()` are blocked when the page is opened from `file://`.
- **No literal `</script`:** files must not contain it. If needed, write `<\/script`; the bundler escapes it anyway.
- **Same contracts:** the split changed no code. The bundle was confirmed byte-identical to the old single file.

New parts must follow these so they slot in cleanly.

### 3.1 Registry (`SDA`)

- **`SDA.register(def)`**
  - Kinds: `module`, `playground`, `lab`, `glossary`, `page`, `nav`, `extend`.
  - An unknown kind is queued until `SDA.addKind(kind, fn)` is called. This is how Part 9 will add `case`.
  - Each registration is wrapped in try/catch, and errors go to `SDA.errors`.
- **Maps:** `SDA.modules` (array), `SDA.modById`, `SDA.lessons`, `SDA.playgrounds`, `SDA.labs`, `SDA.pages`, `SDA.glossary`.
- **Extension hooks:**
  - `SDA.routes[name] = ctx => …`
  - `SDA.resolvers[kind] = id => ({icon,title,sub,href})`, used by path refs like `case:uber`.
  - `SDA.searchProviders.push(() => [...])`
  - `SDA.statProviders.push(…)`, for home-page counters.
  - `SDA.nav`, for sidebar links.
- **Learning paths** are in `SDA.paths`. They already reference refs that don't exist yet. These render as "coming soon" until registered:
  - modules `principles`, `reliability`, `architecture`, `observability`, `security`, `realtime`, `interview`
  - pages `interview-solutions`, `practice`
  - cases `url-shortener`, `pastebin`, `rate-limiter`, `notification-service`, `typeahead`, `kv-store`, `web-crawler`, `whatsapp`, `youtube`, `uber`, `zomato`, `upi`, `irctc`, `netflix`, `google-search`, `feed`, `amazon`

  **These ids must be used exactly.**

### 3.2 Module schema

```
{kind:'module', id, order, level, icon, title, summary, outcomes[],
 lessons[], quiz[ {q, options[], answer, why} | {type:'scenario', q, answer} ],
 flashcards[]?, cheatsheet[{h, items[]}], glossary[{term, aka[], def}], sources[]}
```

`level` must be one of: `beginner`, `intermediate`, `advanced`, `distributed`, `realworld`, `principal`.

### 3.3 Lesson schema (the 7-part template)

```
{id, title, minutes, tags[], summary,
 problem,                 // 1 The problem
 intuition,               // 2 Intuition (everyday / India-friendly analogy)
 how:{intro, steps[], diagram|stepper|mount|html, deep},   // 3 How it works + animated diagram
 deep,                    // Deep-dive layer (Simple/Deep toggle)
 tradeoffs:{use[], avoid[], alt[]},                         // 4 Trade-offs box
 real:[{co, tier:'confirmed'|'inference'|'educational', text, src}],  // 5 Real-world
 mistakes[], interview[], // 6 Common mistakes + interview angle
 tryit,                   // 7 Try it: {note, pg|lab|quiz|mount|html} or array
 sources[]}
```

### 3.4 Playground schema

```
{kind:'playground', id, module, icon, title, summary, explain, real, mount(host, api)}
```

`api` contains `onDispose`, `loop`, `reduced`, `ui`, `h`, `u`, `Diagram`, `host` and `compact`.

### 3.5 Engine utilities

- **`SDA.Diagram(host, spec)`**
  - Node types: client, lb, service, cache, db, queue, cdn, ext.
  - Step fields: `flow`, `parallel`, `dur`, `dwell`, `hl`, `status` (down/hot), `reveal`, `hide`, `showEdges`, `hideEdges`, `sub`.
  - Methods: `flow()`, `setStatus`, `setHidden`, `setEdgeHidden`, `setSub`, `setCaption`, `highlight`, `on('node')`.
- **`SDA.ui`:** `slider`, `select`, `toggle`, `button`, `metrics`, `legend`, `stepper`, `quiz`, `flashcards`, `tabs`, `lab`, `countUp`, `speedSelect`.
- **`SDA.h`:** `code`, `callout`, `deep`, `simple`, `tier`, `table`, `math`, `list`.
- **Part 14–15 additions:** `SDA.miniDiagram(host, spec, title)` / `SDA.miniSpec(spec)` (grid DSL); `SDA.fmtU(v, unit)` and `SDA.solEstimate(solution, overrides)` (live estimates); `SDA.adrMarkdown(fields)`; kinds `challenge`, `project`, `solution`, `scenario`; resolver `sol:<id>`.
- **Loop and cleanup:** `SDA.loop(host, fn)` runs a requestAnimationFrame loop only while the host is visible. `SDA.withScope` and `onDispose` handle cleanup.
- **`SDA.runJS`** runs code labs in a Web Worker, falling back to a sandboxed iframe.
- **Shared helpers:**
  - `SDA.m1helpers` = {`orderGame`, `sortGame`, `lineChart`}
  - `SDA.ph` = {`fnv`, `color`, `css`, `frag`}
- **Canvas rule:** the backing store is 2× (`cv.width=W*2; g.setTransform(2,0,0,2,0,0)`), and the CSS height is always set explicitly.

### 3.6 Case-study schema (implemented in Part 9: `js/cases/engine.js`)

The 17 points map to fields like this:

```
{kind:'case', id, tier:'starter'|'flagship'|'standard', icon, title, summary, modules[],
 A: overview{in[], out[]} (1), challenges[] (2), fr[] (3), nfr[] (4),
    scale:{rows[{label, value, math, label:'illustrative'|'public'}]} (5),
 B: evolution[{title, breaks, fix, reveal[], metrics{latency,load,errors}}] (6)
      — Step 0 = 1 server + 1 DB; starter 5 steps, flagship 8–10, standard 5–6,
    flows[{name, hops[]}] (7) Play/Pause/Step/Speed,
    breakIt[{label, kill[], effect, survives}] (8),
 C: dataModel (9), apis[{method, path, req, res}] (10), algorithm{title, body, mount?} (11),
 D: tradeoffs[{option, why, giveUp}] (12), alternatives[] (13), failures[{what, reaction}] (14),
 E: lab{stack[], milestones[{day, items[]}], pseudocode, loadTest} (15), twists[3] (16),
 F: sources[] (17)  // named papers/blogs, no URLs
}
```

**As built, concrete field names** (match these exactly in Parts 10–13):
- `{kind:'case', id, tier, icon, title, tagline, tags[], modules[], summary, accuracy, overview{what, in[], out[]}, challenges[], fr[], nfr[], scale[{k, v, math, tag:'illustrative'|'public'}]}`
- `arch{w, h, nodes[{id, type, label, sub, x, y, w, stage?, gone?}], edges[{from, to, stage?, gone?, dashed?}]}`. A node or edge is visible from evolution step `stage` (after its fix) until step `gone` (after that fix).
- `evolution[{title, scale, hot[], down[], breaks(html), fix(html), sub{nodeId: text}, before{lat, err, load}, after{lat, err, load}, flow[[a, b, label]], lesson}]`. Step 0 has only `fix` and `after`.
- `flows[{name, steps[diagram steps]}]`, `breakIt[{label, kill[], hot[], verdict:'survives'|'degrades'|'fails', text, flow}]`
- `dataModel{lang, title, code, notes}`, `apis[{m, path, note, req, res}]`, `algorithm{title, html, mount?(host), pg?, lab?}`
- `tradeoffs[[decision, why, giveUp]]`, `alternatives[[alt, whyNot]]`, `failures[[what, reaction]]`
- `lab{stack[], milestones[{day, items[]}], pseudocode{lang, code}, loadTest}`, `twists[{q, a}]`, `real[{co, tier, text, src}]`, `sources[]`
- Flagship cases should use 8–10 evolution steps and a richer `algorithm.mount` simulation.

Engine pieces:
- Routes `#/cases` (grid filtered by tier) and `#/case/:id` (tabs for A–F).
- A `SDA.resolvers.case`, a search provider, and a stat provider for the case count.
- A shared **Evolution player** (Next step button, metrics that degrade, a "What breaks? → The fix" panel, and components that animate in).
- A **Break It** panel, driven by `Diagram.setStatus`.

## 4. Part plan (15 parts)

| Part | Contents | Status |
|---|---|---|
| 1 | Shell, CSS design system, core engine, Home, M1 Foundations, playgrounds #1 #19 #20 #21 and tail latency | ✅ |
| 2 | M2 Networking & APIs, M3 Traffic & Edge, playgrounds #2 #10 #16 | ✅ |
| 3 | M4 Caching, M5 Databases & Storage, playgrounds #3 #4 #5 #6 #25 #26 | ✅ |
| 4 | M6 Distributed Systems, playgrounds #7 #8 #18 #24 #27 | ✅ |
| 5 | M7 Async & Pipelines, M8 Search & Special Structures, playgrounds #9 #13 #14 #15 #17 | ✅ |
| 6 | M9 Reliability, M10 Architecture & Platform, playgrounds **#11 circuit breaker, #12 retry/backoff/jitter, #22 autoscaling, #23 chaos monkey**. This completes all 27 playgrounds | ✅ |
| 7 | M11 Observability & Ops, M12 Security, M13 Real-time & Media | ✅ |
| 8 | M14 Design Principles, M15 Interview & Meta (framework, estimation drills, tech decision tree, glossary and cheat-sheet hub), code labs (LRU, token bucket, consistent hashing, Bloom, plus extras), glossary top-up | ✅ |
| 9 | Case-study engine (§3.6), 8 starter cases | ✅ |
| 10 | Flagship: Google Search, YouTube, Netflix (`js/cases/flagship-a.js`) | ✅ |
| 11 | Flagship: Uber/Ola, Zomato/Swiggy, WhatsApp (`js/cases/flagship-b.js`) + engine node-text auto-fit | ✅ |
| 12 | Flagship: Instagram/X feed, Amazon/Flipkart (incl. flash sale), UPI/PhonePe/Paytm, IRCTC/BookMyShow (`js/cases/flagship-c.js`) | ✅ |
| 13 | 10 standard cases (`js/cases/standard-a.js`, `standard-b.js`) | ✅ |
| 14 | Practice Arena (30+ challenges), 24 projects (`js/pages/practice*.js`, `projects*.js`) | ✅ |
| 15 | 15 interview worked solutions, Principal Engineer Thinking (themes, 8 scenarios, ADR template) (`js/pages/interview-solutions*.js`, `principal*.js`) | ✅ |

If a part runs out of room, stop at a module or case boundary and say exactly where the next part resumes.

## 5. Topic map coverage, module by module

### Done (measured audit, §11)

| Module | id · level | Lessons |
|---|---|---|
| M1 Foundations | `foundations` · beginner | what-is-system-design, seven-step-approach, functional-vs-nonfunctional, client-server, web-request-journey, latency-numbers, back-of-envelope, vertical-vs-horizontal, latency-vs-throughput, percentiles-tail-latency, availability-nines, sli-slo-sla, fault-tolerance-spof, monolith-to-microservices **(14)** |
| M2 Networking & APIs | `networking` · beginner | ip-and-dns, tcp-vs-udp, http-versions, https-tls, rest-graphql-grpc, realtime-transports, api-design, idempotency-rate-limit-headers, proxies-gateway-bff **(9)** |
| M3 Traffic & Edge | `traffic` · beginner | lb-l4-vs-l7, lb-algorithms, health-checks-sticky, geodns-anycast, cdn, rate-limiting, ddos-basics **(7)** |
| M4 Caching | `caching` · intermediate | cache-layers, cache-strategies, cache-eviction, cache-invalidation, cache-failure-modes, redis-vs-memcached **(6)** |
| M5 Databases & Storage | `databases` · intermediate | sql-vs-nosql, acid-vs-base, indexes, btree-vs-lsm, normalization, transactions-isolation, locking, replication, sharding, consistent-hashing, connection-pooling, oltp-olap, storage-types **(13)** |
| M6 Distributed Systems | `distributed` · distributed | fallacies, cap-pacelc, consistency-models, quorums, clocks, consensus-raft, distributed-locks, failure-detection, delivery-semantics, two-phase-commit, saga-outbox, crdts-merkle, unique-ids **(13)** |
| M7 Async & Pipelines | `async` · distributed | queues-pubsub-streams, kafka, rabbitmq-sqs, ordering-dlq, backpressure, event-driven, fan-out, batch-vs-stream, lambda-kappa, cdc, workflow-orchestration **(11)** |
| M8 Search & Special Structures | `search` · advanced | inverted-index, bm25-ranking, elasticsearch, tries-autocomplete, bloom-filters, hll-cms, geospatial, time-series, vector-search-rag, recommendations **(10)** |
| M9 Reliability | `reliability` · advanced | timeouts-retries, circuit-breaker, bulkhead-fallback, load-shedding, redundancy-failover, multi-az-region, disaster-recovery, chaos-engineering, capacity-planning, autoscaling **(10)** |
| M11 Observability & Ops | `observability` · advanced | logs-metrics-traces, golden-signals-red-use, alerting-oncall, incident-postmortems, ci-cd, deploy-strategies, infrastructure-as-code, zero-downtime-migrations, finops **(9)** |
| M12 Security | `security` · advanced | authn-vs-authz, sessions-vs-jwt, oauth-oidc-sso, rbac-abac, api-keys-mtls, encryption, password-hashing, secrets-rotation, owasp-top10, zero-trust-tenancy, compliance **(11)** |
| M13 Real-time & Media | `realtime` · realworld | websockets-at-scale, presence, push-notifications, webrtc, live-streaming-abr, transcoding-pipeline, offline-first-sync, mobile-constraints **(8)** |
| M14 Design Principles Bridge | `principles` · intermediate | solid, kiss-yagni-soc, patterns-in-sd, tradeoff-thinking **(4)** |
| M15 Interview & Meta | `interview` · principal | interview-framework, talking-tradeoffs, interview-mistakes, estimation-drills, tech-decision-tree, glossary-cheatsheets **(6)** |
| M10 Architecture & Platform | `architecture` · realworld | ddd-bounded-contexts, service-discovery, service-mesh-sidecar, api-composition, strangler-fig, serverless, docker-containers, kubernetes-basics, twelve-factor, multi-tenancy, hexagonal, config-feature-flags **(12)** |

### Planned

Lesson ids are drafts. Each one maps to the phrases in the spec's topic map; every phrase must be covered somewhere.

M9 and M10 are done (see the table above).

M11, M12 and M13 are done (see the table above).

M14 and M15 are done (see the table above). All 15 modules are now complete.

Every new module needs:
- all 7 template fields on every lesson
- Deep layer on every lesson
- an animated diagram, stepper or mount on every lesson
- at least 5 MCQs (target 10) and 2 scenario questions
- a cheat sheet
- glossary terms
- named sources
- real-world examples labelled with a tier

## 6. The 27 playgrounds

| # | Playground (spec) | id | Module | Part | Status |
|---|---|---|---|---|---|
| 1 | Request journey | request-journey | foundations | 1 | ✅ |
| 2 | Load balancer | load-balancer | traffic | 2 | ✅ |
| 3 | Consistent-hashing ring | hash-ring | databases | 3 | ✅ |
| 4 | Cache simulator + strategies | cache-sim | caching | 3 | ✅ |
| 5 | Replication | replication | databases | 3 | ✅ |
| 6 | Sharding visualizer | sharding | databases | 3 | ✅ |
| 7 | CAP/PACELC + quorum | cap-quorum | distributed | 4 | ✅ |
| 8 | Raft leader election | raft | distributed | 4 | ✅ |
| 9 | Message queue / Kafka | kafka | async | 5 | ✅ |
| 10 | Rate limiter (4 algorithms side by side) | rate-limiter | traffic | 2 | ✅ |
| 11 | Circuit breaker | circuit-breaker | reliability | 6 | ✅ |
| 12 | Retry + backoff + jitter | retry-jitter | reliability | 6 | ✅ |
| 13 | Bloom filter | bloom | search | 5 | ✅ |
| 14 | Trie autocomplete | trie | search | 5 | ✅ |
| 15 | Geohash / quadtree | geo | search | 5 | ✅ |
| 16 | CDN edge map | cdn-edge | traffic | 2 | ✅ |
| 17 | Fan-out write vs read | fanout | async | 5 | ✅ |
| 18 | Saga vs 2PC | saga-2pc | distributed | 4 | ✅ |
| 19 | Back-of-envelope calculator | envelope | foundations | 1 | ✅ |
| 20 | Availability nines | nines | foundations | 1 | ✅ |
| 21 | Latency log-scale chart | latency-chart | foundations | 1 | ✅ |
| 22 | Autoscaling simulator | autoscaling | reliability | 6 | ✅ |
| 23 | Chaos monkey | chaos-monkey | reliability | 6 | ✅ |
| 24 | Snowflake ID bits | snowflake | distributed | 4 | ✅ |
| 25 | B-tree vs LSM | btree-lsm | databases | 3 | ✅ |
| 26 | Isolation anomalies | isolation | databases | 3 | ✅ |
| 27 | Vector clock / CRDT | vector-clock | distributed | 4 | ✅ |
| — | Bonus: tail latency and fan-out | tail-latency | foundations | 1 | ✅ |

Every playground needs:
- a visual, controls, an explanation and live metrics
- Reset and step-through
- a real-world example
- **real logic, not a fake loop**
- verification via CDP against theory (§10)

Acceptance targets for Part 6 (all met; measured results in §11):
- **#11 circuit breaker:** the state machine trips at the failure threshold, goes half-open after the cool-down, and closes again after N successful probes. The p99 and error rate shown must match the simulation.
- **#12 retry/jitter:** without jitter, retry storms appear as synchronized spikes; with full jitter, the load is flattened. Show peak load and total attempts. A retry budget caps amplification.
- **#22 autoscaling:** a diurnal or spike traffic curve, target-tracking on CPU, warm-up and cooldown delays. Show SLO breaches when scaling is too slow, and wasted cost when there are too many instances.
- **#23 chaos monkey:** kill a random service, watch the health check eject it, failover or replacement, and circuit breakers isolating it. Show blast radius with and without bulkheads, and recovery time.

## 7. Case studies (28) and learning content

### Case studies

**Starter** (5 steps, Part 9): ✅ all 8 done

| Spec name | id |
|---|---|
| URL shortener | `url-shortener` |
| Pastebin | `pastebin` |
| Rate limiter | `rate-limiter` |
| **Unique ID generator** | `unique-id` |
| Dynamo-style KV store | `kv-store` |
| Notification service | `notification-service` |
| Typeahead | `typeahead` |
| Web crawler | `web-crawler` |

Unique ID generator is in the spec but was missing from my earlier id list. It is added here; don't drop it.

**Flagship** (8–10 steps plus an interactive sim, Parts 10–12):

| Spec name | id | Part |
|---|---|---|
| Google Search | `google-search` | 10 ✅ |
| YouTube | `youtube` | 10 ✅ |
| Netflix | `netflix` | 10 ✅ |
| Uber/Ola | `uber` | 11 ✅ |
| Zomato/Swiggy | `zomato` | 11 ✅ |
| WhatsApp | `whatsapp` | 11 ✅ |
| Instagram/X feed | `feed` | 12 ✅ |
| Amazon/Flipkart + flash sale | `amazon` | 12 ✅ |
| UPI/PhonePe/Paytm | `upi` | 12 ✅ |
| IRCTC/BookMyShow seat locking | `irctc` | 12 ✅ |

Google Search internals are proprietary. Say so explicitly and teach a labelled reference design.

**Standard** (5–6 steps, Part 13):

| Spec name | id |
|---|---|
| Dropbox/Drive | `dropbox` |
| Google Maps | `google-maps` |
| Zoom/Meet | `zoom` |
| Hotstar IPL live | `hotstar` |
| Spotify | `spotify` |
| Airbnb | `airbnb` |
| Stripe | `stripe` |
| Slack/Discord | `discord` |
| Google Docs (OT vs CRDT) | `google-docs` |
| ChatGPT-style LLM serving | `llm-serving` |

**Every case has all 17 points (§3.6), including:**
- step 0 is one server and one DB
- metrics that visibly degrade
- "What breaks? → The fix"
- an animated end-to-end request flow with controls
- a Break It button
- scale math labelled "illustrative" or "publicly disclosed"
- a weekend lab with stack, milestones, pseudocode and a load-test plan
- 3 interview twists
- named sources only

### Practice Arena

30+ challenges, Part 14. Each has hint 1 → 2 → 3, then a solution outline with a diagram (rendered by `SDA.Diagram`). Difficulty ranges from beginner to advanced. The page id is `practice`.

### Projects

24 projects, Part 14. Each one walks through 17 stages: requirement → FR → NFR → estimation → entities → APIs → HLD → component responsibilities → tech choices → trade-offs → v1 build → bottlenecks → scaling problems → improvements → failure scenarios → observability → final review. Code samples are TypeScript/Node + SQL.

| Level | Projects |
|---|---|
| Beginner (6) | URL shortener, Pastebin, Blog, File upload, Auth system, Product catalog |
| Intermediate (8) | E-commerce, Notification service, Rate limiter, Real-time chat, Search autocomplete, Ride booking, Food delivery, Ticket booking |
| Advanced (10) | Video streaming, Distributed MQ, Social feed, Payment platform, Job scheduler, Multi-tenant SaaS, Real-time analytics, Global file storage, Large-scale search, Recommendation system |

### Interview worked solutions

15 solutions, Part 15. The page id is `interview-solutions`. Each shows the thinking process (clarify → estimate → API → data → HLD → deep dive → bottlenecks → trade-offs), not just the final answer.

YouTube · Google Search · Uber · Zomato · WhatsApp · Instagram · Twitter/X · Netflix · URL shortener · Notification service · Payment · Distributed cache · Ticket booking · Rate limiter · Google Drive

### Principal Engineer Thinking

Part 15.

**Themes (15):** architecture reviews, ADRs, technical strategy, system boundaries, tech debt, build vs buy, tech selection, migration, legacy modernization, platform engineering, reliability ownership, cost, risk, long-term maintainability, evolutionary architecture.

**Scenarios (8), each with "solve first, then reveal the expert walkthrough":**
1. App growing, monolith unmaintainable
2. DB is the bottleneck
3. Two services with a circular dependency
4. Cloud bill doubled
5. Frequent cascading failures
6. Team wants microservices with no business need
7. Need multi-region
8. 5-year evolvability

### Code labs

Part 8. Required: LRU cache, token bucket, consistent hashing, Bloom filter. Planned extras: sliding-window limiter, Snowflake generator, Merkle diff, LSM memtable flush.

Each lab has runnable starter code, a Run button, an output console and self-checking asserts printed to the console. The asserts are lab content, not a test suite.

## 8. Accuracy and honesty rules

- Only publicly documented architecture facts. Never invent internal details, metrics or links.
- Use the tier chip on every real-world claim:
  - `confirmed`: a public paper, blog or talk exists
  - `inference`: a reasonable architectural inference
  - `educational`: a simplified design made for teaching
- Numbers are labelled "illustrative" unless publicly disclosed.
- Sources are named papers and blogs (e.g., MapReduce, Bigtable, Spanner, Dynamo, Raft, Kafka, Netflix Tech Blog, Uber Engineering, Discord Engineering, AWS/Azure Architecture Centers), **with no URLs**.
- Show trade-offs, not a single "right answer". Prefer correct over impressive.

## 9. Design rules (keep them consistent)

- Dark-first navy and charcoal, a cyan→violet accent, glass cards, grain, Inter and JetBrains Mono.
- Reveal on scroll via IntersectionObserver, never on the scroll event.
- Use animated counters, magnetic buttons, ripple, copy buttons on code blocks, and the hand-rolled syntax highlighter.
- Use the same component color legend everywhere.
- Must work at 360px:
  - controls wrap
  - canvases scale to their container width
  - no horizontal page scroll

## 10. Definition of Done for each part (verification recipe)

1. **Syntax:** `bun tools/check.js` reports `N files checked, 0 problems`. This covers every JS file and every `<script src>` path.
1b. **Bundle:** `python3 tools/bundle.py` writes `dist/index.html`. Run the route sweep against both the multi-file `index.html` and the bundle at least once per part.
2. **Load:** headless Chrome `--dump-dom` shows no `SDA.errors`.
3. **Route sweep:** CDP (`--remote-debugging-port=9333`, navigate to `about:blank` first, then the URL). Every new `#/l/…`, `#/m/…/{quiz,cheatsheet,flashcards}` and `#/pg/…` route must have **0 console errors and 0 exceptions**.
4. **Content audit:** run the §11 expression. Required results for every new module:
   - `missing:{}`
   - `deep` and `diag` both equal `lessons`
   - mcq ≥ 5 and scenario ≥ 2
   - cheat > 0, gloss > 0, srcs > 0
5. **Live simulation check:** let each new playground run for real seconds, then read the `.metric` values and compare them with theory (formula or expected behaviour). Re-run harnesses with fresh state, and set timeouts much longer than message delays.
6. **Visual:** screenshots at desktop width and at 360px, in both themes for at least one new page.
7. **Reduced motion:** emulate `prefers-reduced-motion` and confirm the diagrams show static steps.
8. **Placeholder grep:** no `TODO`, `lorem`, `similar for the rest` or `rest of code` in new blocks.
9. **Marker:** `<!-- @@NEXT-PARTS-GO-HERE@@ -->` is still immediately before `</body></html>`.
10. **Update this file:** status columns and audit numbers. Also update the memory file.
11. **Message:** what was built, what was verified (with numbers), fixes made during testing, then the `PART X/15 DONE…` line.

Test suites: the user's CLAUDE.md says the user runs tests and Claude must not. This project has no test suite. Verification is done with syntax checks and headless-browser checks only.

## 11. Measured audit snapshot (after Part 15, final)

Part 15 checks (scratchpad wiped again, so `cdp.js` and `sweep.js` were recreated; new `soltest.js` (bun), `solcheck.js`, `princheck.js`, `interact15.js`, `mobile15.js`, `reduced15.js`, `tipcheck.js`):
- **Interview solutions:** 15 (3 classic, 6 intermediate, 6 advanced), each with all 8 phases (clarify 5′ → estimate 4′ → API 5′ → data 5′ → HLD 10′ → deep dive 10′ → bottlenecks 3′ → trade-offs 3′ = 45′), a “thinking out loud” block per phase, an animated HLD, 2–3 deep dives, bottleneck and trade-off tables, 3 follow-ups and refs. 0 bad refs, 0 diagram problems (clipping, edges through nodes, flow hops that aren’t edges, isolated nodes) after fixing 2 (Instagram re-laid out, Twitter `k>ing~0.25`).
- **Live estimates:** every row is computed from slider inputs, and every “So what?” verdict is generated from the numbers. bun check at defaults and at every slider’s min and max: 0 non-finite values, 0 `undefined`/`NaN` in text. Hand-checked examples: URL shortener 1.2K creates/s, 347K redirects/s at peak, 183B links → 7-char codes (8 at max, 6 at min, confirmed live); WhatsApp 150M connections → 1.5K gateways; YouTube 104 Tbps average egress; Netflix 150 Tbps peak, 1.5 PB catalogue; Google Search 5K shards, 185K queries/s.
- **Mock-interview mode:** phases locked until the previous one is revealed (1 → 8), notes and mode persist across reload, 45-minute clock tracks the expected phase; “Mark as studied” shows on the list.
- **Principal Engineer Thinking:** 15 themes (5 Deciding / 5 Shaping / 5 Sustaining, filter works), each with why, practices, questions, warning signs, a rule of thumb and 2 public examples (tier `confirmed`, named sources, no URLs); 8 scenarios, each with exactly one “best” first move (graded best / reasonable / risky feedback), saved plan, walkthrough (diagnose, options table, decision, phased plan, risks, measures, what to tell leadership) and an ADR. 4 scenarios have before/after diagrams (0 geometry problems after moving one node). ADR handoff pre-fills the template; edits persist; Copy / Download / example / Clear work; review checklist (40 items) persists ticks.
- **Wiring:** `page:interview-solutions` now resolves (the Interview Sprint path has 0 “coming soon” items); both pages are listed under the Principal level in the roadmap and sidebar; search gains 38 entries.
- **Text fit:** 332 node texts on the new diagrams, 0 overflowing; 5 labels that shrank below 0.7 were shortened.
- **Fixed while testing:** the glossary tooltip’s `.tip` class also matched every `callout tip`, making those boxes invisible (opacity 0, fixed position): tooltip CSS is now scoped to `#tip`. Long ref chips overflowed at 360 px: chips inside `.pill-row` now wrap.
- **Sweep:** 504 routes (every solution, scenario, ADR and review page included), 0 problems on `index.html` and `dist/index.html` (3.09 MB, 48 JS files). 0 px horizontal scroll at 360 px on all six new page types. Reduced motion: stepping shows static highlighted hops with captions.

### Snapshot after Part 14

Part 14 checks (scratchpad `pagecheck.js`, `fixgeo.js`, `interact.js`, `sweep.js`; the scratchpad had been wiped, so `cdp.js` and `sweep.js` were recreated and a stale Chrome with a deleted profile had to be killed):
- **Content:** 33 challenges (10 beginner, 11 intermediate, 12 advanced), each with constraints, exactly 3 hints, a solution outline, trade-offs, refs and an animated diagram; 24 projects (6/8/10), each with all 17 stages, SQL entities, TypeScript v1, API table, HLD diagram and refs. All refs resolve; `SDA.errors` = 0.
- **New `SDA.miniDiagram` DSL** (nodes by column/row, `a>b~curve` edges, `a>b:label|…` flows) used by 57 diagrams. Checked for clipping, edges through nodes (with curves), isolated nodes and flow hops that aren't edges: first run 30 problems (15 fixed with curves found by search, 2 edges re-routed, 3 node widths); now 0.
- **Interactions:** hints unlock 1→2→3 and only then the solution; “Skip to solution” works; notes and “solved” persist; level filter (12 advanced); project stage ticks persist (2/17); stage links scroll without changing the route; search palette lists 33 practice + 24 project entries.
- **Sweep:** 478 routes (every challenge and project page included), 0 problems on `index.html` and `dist/index.html` (2.77 MB, 42 JS files). 0 px horizontal scroll at 360 px on practice/project list and detail pages.
- **Known:** `page:interview-solutions` in the Interview Sprint path resolves in Part 15.

### Snapshot after Part 13

Part 13 checks (bun `simtestS.js` / `llmtune.js`, then `casevis.js` / `live.js` / `textfit.js` / `sweep.js` in headless Chrome):
- **Structure:** dropbox, google-maps, zoom, hotstar, spotify, airbnb, stripe, discord, google-docs, llm-serving: 6 evolution steps each (Day 1 + 5), all 17 sections, step 0 = 1 server + 1 DB, 2–3 flows, 4 Break-It, 0 problems (including the edge-vs-node geometry check).
- **Live click-through:** all 50 steps show red/amber metrics and hot components before the fix and recover after; 21 flows and 40 Break-It scenarios ran; 0 errors.
- **Simulations vs theory / brute force:**
  - Chunking (1 MB file, 100-byte insert): fixed 16 KB blocks re-upload 64% (42/65 chunks); content-defined chunking 2 chunks. Overwrite/append: fixed blocks fine (1 chunk).
  - Routing: A* = Dijkstra distance on 200 random trips (0 mismatches); Dijkstra = Bellman-Ford on a small grid (0 mismatches); A* settles 860 vs 1,215 intersections on average.
  - Video calls: exact formulas (12 people: mesh 27.5 Mbps up; SFU 360 Mbps server; simulcast 4.9 Mbps down).
  - Live streaming: 25M × 1.5 Mbps = 37.5 Tbps; origin 9 req/s with shield vs 300 without.
  - Collaborative filtering: cosine values equal hand computation (0.8165).
  - Availability: bitmap = interval scan = night-by-night truth on 5,000 calendars × 208 queries (0 mismatches); 24× fewer operations.
  - Idempotency (20K payments): no key 2,195 double-charged customers, look-up key 1,361, atomic claim 0.
  - Coalescing: λ/(1 + λd) matched within 1% at four (λ, d) settings; mean latency matched.
  - OT: 0 divergences in 100,000 random concurrent pairs (78% diverge without transformation).
  - LLM serving: KV per token for Llama 2 70B = 327,680 B exactly; at 2 req/s continuous batching gives 433 tok/s and 110 ms p95 first token vs static 210 tok/s and 245 s.
- **Fixed while testing:** Spotify default listener had no recommendations (misleading “cold start” message); Google Docs default example converged even without OT (changed to one that diverges); LLM default load overloaded both policies; 4 nodes clipped canvases; 2 edges crossed nodes; 3 long subtitles.
- **Totals:** 28 cases; 1,559 node texts, 0 overflowing; 419 routes, 0 problems on `index.html` and `dist/index.html` (2.50 MB, 37 JS files); 0 px horizontal scroll at 360 px on all new evolve and deep pages.

### Snapshot after Part 12

Part 12 checks (scratchpad `simtestC.js` / `simtestC2.js` in bun, then `casevis.js` / `live.js` / `textfit.js` / `sweep.js` in headless Chrome):
- **Structure:** feed (12 nodes, 17 edges, flows 4/4/2, 7 Break-It, tiers 6/1/1), amazon (13 / 16, flows 3/4/3, 7, tiers 5/1/1), upi (13 / 18, flows 6/4/2, 7, tiers 5/1/1), irctc (12 / 17, flows 6/3/3, 6, tiers 4/1/1): 10 steps each, step 0 = 1 server + 1 DB, 0 problems.
- **New geometry check:** `casevis.js` now verifies that no visible edge (straight or curved) passes through another visible node box at any step. It found 6 such edges in older cases, all fixed: pastebin sweeper moved; notification-service w2→pr and w→pr2, netflix app→events and youtube edge→blob now curve around nodes (youtube’s bottom row moved down 25 px to make room). All 18 cases: 0 geometry problems.
- **Live click-through:** all 36 steps degrade then recover; 12 flows and 27 Break-It scenarios ran; 0 errors.
- **Simulations vs theory / brute force:**
  - Feed: truncated-Pareto analytics vs 2M-sample Monte Carlo (mean 200.00 vs 200.95; edge share above 1e5 followers 4.79% vs 5.13%; α = 1.15: 12.52% vs 12.54%); push-only inserts = posts/s × K exactly; pull-only merges per read = K exactly. Default (500M users, 1M-follower threshold): push-only 579K ops/s but a 150M-insert worst case (2.5 min); hybrid 1.8M ops/s with a 1 s worst case. The verdict says push-only is cheapest on average (the first draft wrongly implied the hybrid was cheapest).
  - Flash sale (50K buyers / 1K phones / 2 s): read-then-write oversells 49K; row lock sells 1K with 47.5K timeouts (500 req/s = 1/2 ms); atomic DECR sells exactly 1K at 5 ms p99 with 1K DB writes/s. At 200K buyers / 20K stock / 1 s the row lock leaves 16K unsold.
  - UPI (1M payments): naive retry 2,920 double payments vs theory 2,911; same-id + status check + reversal: 0.
  - Holds (3,000 users, 300 seats): pay-first 1,933 refunds; 5-min hold 0 refunds, 286 sold, 14 unsold (abandoned holds). TTL 3 min → 98 refunds; 7–10 min → 68 unsold.
  - Segment allocator: offline optimum (sort by end, latest-free berth) equals brute force on 300 tiny instances; 0 overlapping sales in all runs. Under overload, random berth choice beat first/best fit (222 vs 203), and the optimum is 274, so the verdict compares online rules with the optimum rather than claiming best-fit wins (the first draft’s claim was false).
- **Chart:** the feed cost chart uses a log y-axis (linear hid the trade-off under the pull-only extreme).
- **Text fit:** 1,094 node texts in 18 cases, 0 overflowing. **Route sweep:** 359 routes, 0 problems on `index.html` and `dist/index.html` (2.28 MB, 35 JS files). 360 px: 0 px horizontal scroll on all new pages.

### Snapshot after Part 11

Part 11 checks (headless Chrome via scratchpad `cdp.js` + `casevis.js` / `live.js` / `textfit.js` / `sweep.js`, plus `simtest.js` in bun):
- **Structure:** uber (13 nodes, 20 edges, 3 flows 6/4/4, 7 Break-It, tiers 6/2/1, 9 sources), zomato (15 / 25, flows 6/5/3, 7 Break-It, tiers 2/2/1, 6 sources), whatsapp (13 / 17, flows 5/5/5, 7 Break-It, tiers 6/1/1, 8 sources): 10 steps each, step 0 = 1 server + 1 DB, 0 problems.
- **Live click-through:** all 27 steps red → fix → recovered, 1–2 hot/failed components per “What breaks?”; all 9 flows and 21 Break-It scenarios ran; 0 errors.
- **Simulations vs theory / brute force (bun + page agree):**
  - Uber matcher: Hungarian = brute-force optimum on 300 random instances; grid-index nearest = brute-force nearest on 600 rounds; batched ≤ greedy in every round (avg saving 5.6%); default round checks 11.2 of 150 drivers per lookup.
  - WhatsApp delivery: fire-and-forget loss 18.8% at p = 0.1 (theory 1 − (1 − p)² = 19.0%) and 49.5% at p = 0.3 (theory 51%); ids + acks + dedupe + sequence gives 0 lost, 0 duplicates, 0 out of order, with 2.479 transmissions per message (theory 2/(1 − p)² = 2.469) and 4.06 at p = 0.3 (theory 4.08). Retry without ids: 1,172 duplicates at p = 0.1.
  - WhatsApp fan-out: 256 members × 2 devices → 511 deliveries; pairwise 511 encryptions vs sender keys 1.
  - Zomato dinner rush (default 40 riders, 334 orders): average delivery 35.4 / 34.7 / 32.9 min, late > 45 min 15.0% / 9.9% / 2.7%, rider-minutes per order 19.7 / 17.0 / 15.5 for at-once / just-in-time / JIT + batching. Light load: JIT cuts rider idle time 12.9 → 2.3 min per order. Overload (2 + 5/min): every policy drowns, as the verdict says.
- **Bugs found and fixed while testing:** a batched “mate” order could be assigned twice and `splice(indexOf = −1)` silently dropped a different order (undelivered orders); the first rush parameters were saturated (2-hour deliveries) and taught nothing; the first verdict text claimed JIT always improves throughput, which the sim did not show, so the verdict is now generated from the measured numbers.
- **Engine change (all diagrams):** node labels and subtitles now auto-shrink to fit their box (`fitText` in `js/core/engine.js`, re-run on `setSub`, on step changes and after web fonts load). Before: 107 texts overflowed across the 14 cases. After: 0 of 816 rendered node texts overflow; texts that needed shrinking below 0.7 were shortened or their nodes widened (in starter, flagship-a and flagship-b).
- **Route sweep:** 335 routes, 0 problems on both `index.html` and `dist/index.html` (2.14 MB, 34 JS files). 360 px: 0 px horizontal scroll; dispatch canvas 318 × 318 CSS px with a 636 × 636 backing store. Reduced motion: static highlighted hops.

### Snapshot after Part 10

Part 10 checks (all measured in headless Chrome, scratchpad harness `cdp.js` + `casevis.js` / `live.js` / `sims.js` / `sweep.js`):
- **Structure (casevis):** google-search, youtube and netflix each have 10 evolution steps, all 17 sections, step 0 = 1 server + 1 DB, 0 problems. Every evolution, flow and Break-It hop is a real edge visible at that step; every lesson, playground and module ref resolves; no node clips the SVG; no final node is isolated.
  - google-search: 14 nodes, 17 edges, 2 flows (6/3 steps), 6 Break-It, 6 scale rows, tiers 5/1/1, 8 sources
  - youtube: 14 nodes, 18 edges, 2 flows (5/4), 6 Break-It, 7 scale rows, tiers 6/1/1, 7 sources
  - netflix: 13 nodes, 14 edges, 3 flows (5/3/3), 7 Break-It, 6 scale rows, tiers 7/1/1, 8 sources
- **Live click-through (live.js):** every step was clicked Next → Apply the fix to the final architecture. Each “What breaks?” shows red/amber metrics and 1–2 hot or failed components, and recovers after the fix (e.g. YouTube step 1: 4.0 s / 6% / 170% → 700 ms / 0.2% / 55%; Netflix step 7 region loss: 6.0 s / 35% → 350 ms / 0.1%). All 7 flows stepped to their end; all 19 Break-It scenarios show the labelled verdict. 0 errors.
- **Simulations vs theory (sims.js):**
  - Mini-Google PageRank: power iteration (47 rounds, d = 0.85) matches an exact linear solve within 4.5e-10; sums to 1. “live cricket score” ranks the keyword-stuffed page E #1 at w = 0 and #2 at w = 0.3.
  - Zipf: H(1e9, 1) = 21.3005 = ln n + γ; H(1e6, 0.8) matches the exact sum; top 1% of 1B videos = 78.38% of views (theory 78.38%).
  - YouTube transcode defaults: 4.73 PB/day and 765K cores, equal to the hand calculation.
  - Netflix Open Connect defaults: 5 Tbps demand, 92.3% served inside the ISP, 18 TB/night fill = 5 Gbps over 8 h (hand calculation equal). Per-title: animation reaches q95 at 1,795 kbps (600·ln 20 = 1,797), 69% below the fixed 5,800 kbps rung; sports needs 7,789 kbps.
- **Route sweep:** 317 routes (11 cases × 6 tabs included), 0 problems, from both `index.html` and `dist/index.html` (2.02 MB, 33 JS files).
- **Visual:** desktop dark + light and 360px light + dark screenshots checked; 0 px horizontal scroll at 360 px on the evolve, deep, setup, reason, build and index pages. Reduced motion: static flow highlight, `SDA.reduced` = true.
- **Part 9 fixes found by the stricter validator:** notification-service’s Providers node touched the right SVG edge and its subtitle overflowed (moved to x 785, w 170); its step 4 showed p99 *worse* after the fix (1,300 ms → now 950 ms, amber).
- **Known, accepted:** some starter steps have correctness failures that don’t move latency/load (unique-id, typeahead freshness, pastebin abuse), and four starter cases adapt step 0 to the domain (rate limiter has no DB; KV store is itself the DB; crawler starts with a frontier). Flagship cases meet the strict rule.

### Snapshot after Part 9

All values below were measured live in headless Chrome. `SDA.errors` = 0.

| Module | Lessons | MCQ | Scenario | Cheat sections | Glossary | Sources | Missing fields | Deep / Diagram | Tiers (confirmed / inference / educational) |
|---|---|---|---|---|---|---|---|---|---|
| foundations | 14 | 12 | 2 | 7 | 44 | 7 | none | 14 / 14 | 38 / 2 / 2 |
| networking | 9 | 10 | 2 | 6 | 33 | 3 | none | 9 / 9 | 28 / 0 / 0 |
| traffic | 7 | 10 | 2 | 6 | 36 | 6 | none | 7 / 7 | 21 / 0 / 0 |
| caching | 6 | 10 | 2 | 6 | 23 | 5 | none | 6 / 6 | 15 / 1 / 1 |
| databases | 13 | 11 | 2 | 6 | 55 | 5 | none | 13 / 13 | 39 / 0 / 0 |
| distributed | 13 | 12 | 2 | 6 | 52 | 6 | none | 13 / 13 | 38 / 0 / 0 |
| async | 11 | 10 | 2 | 6 | 43 | 4 | none | 11 / 11 | 27 / 2 / 2 |
| search | 10 | 10 | 2 | 6 | 35 | 6 | none | 10 / 10 | 26 / 0 / 0 |
| reliability | 10 | 11 | 2 | 6 | 45 | 8 | none | 10 / 10 | 25 / 2 / 3 |
| architecture | 12 | 12 | 2 | 6 | 48 | 8 | none | 12 / 12 | 27 / 0 / 9 |
| observability | 9 | 11 | 2 | 6 | 44 | 7 | none | 9 / 9 | 23 / 0 / 4 |
| security | 11 | 12 | 2 | 6 | 58 | 7 | none | 11 / 11 | 30 / 0 / 3 |
| realtime | 8 | 10 | 2 | 6 | 37 | 7 | none | 8 / 8 | 21 / 0 / 3 |
| principles | 4 | 10 | 2 | 4 | 21 | 5 | none | 4 / 4 | 11 / 0 / 1 |
| interview | 6 | 10 | 2 | 5 | 7 | 6 | none | 6 / 6 | 10 / 1 / 7 |
| **Total** | **143** | | | | **581** | | | | |

Other counts:
- Playgrounds: all 27 (plus the bonus): 28 registered
- Labs: 0
- Pages: 0
- Cases: 0 (engine not built yet)
- Size: `dist/index.html` is about 1.91 MB, built from 32 JS files plus `css/styles.css`.
- All 299 routes (including `#/cases` and all 6 tabs of the 8 cases) were swept with 0 console errors, from both the multi-file `index.html` and `dist/index.html`.

Part 9 checks:
- **Structure:** all 8 cases have all 17 sections and 5 evolution steps. Every flow hop is a real edge, and every node, lesson, playground, lab and module reference resolves.
- **Visibility:** no animation or highlight uses a component hidden at that step (checked with scratchpad `casevis.js`).
- **Live run:** every evolution was clicked through to the final architecture, and every Break-It scenario was triggered.
- **Evolution metrics:** each “What breaks?” step shows degraded p99, error rate and load, and recovers after the fix (e.g. URL shortener step 1: 2.4 s / 7% / 160% → 22 ms / 0.03% / 40%).

Part 8 results:
- **Labs:** all 8 pass every check, both in bun and in the in-browser Worker (Run button).
  - Bloom filter: false-positive rate 1.00% measured vs 1.00% theory
  - Consistent hashing: adding a node moves 18.4% of keys vs 79.9% for mod-N; max/avg load 1.12
  - Token bucket: exactly 20 burst + 20 steady requests allowed
  - Sliding window: 100 allowed at the boundary vs 200 for a fixed window
  - Snowflake: 10K unique, ordered IDs; refuses clock rollback
  - Merkle diff: finds the 3 changed buckets in 23 comparisons
  - LSM tree: compaction cuts read amplification from 2 tables to 1
- **Widgets:**
  - estimation drills grade answers by order of magnitude
  - all three decision trees resolve
  - the trade-off matrix shows a fragile decision and which weights flip it
  - the right-sizer separates build-now from YAGNI
  - cheat-sheet page: 428 facts, filterable
- **Code fonts:** ligatures are disabled, so `!==` and `=>` render as typed.

Part 7 widget results, checked against theory:
- **Crypto:** the pure-JS SHA-256 matches the official test vectors (“abc”, the empty string, the 448-bit message), and HMAC matches RFC 4231 case 2.
- **JWT demo:** it rejects a tampered payload, `alg: none` and expired tokens. It still accepts a token after logout, which demonstrates the revocation problem.
- **SQL-injection demo:** a real mini evaluator. `' OR '1'='1' --` returns 3 rows and logs in as admin; `admin' --` bypasses the PIN; `O'Brien` raises a syntax error; the parameterised version blocks all of them.
- **Burn-rate alerts:**
  - outage: pages after 9 min
  - slow burn: ticket after 4.7 h, with no page
  - blips: stays quiet, while the 1-minute static threshold fires 6 false pages
- **Deploys with a 20% bad release:** canary fails 1.2K requests, rolling 4.8K, blue-green 23.9K.
- **ABR (commute / stadium):**
  - always-1080p rebuffers 35.8 s and 127.7 s
  - throughput-based and buffer-based both rebuffer 0 s
  - buffer-based reaches a higher average bitrate (3.6 vs 2.3 Mbps on the commute)

Part 6 simulation results, checked against theory:
- **#11 circuit breaker:** with the dependency failing, it opens at 10/20 failures. Calls to the dependency drop from 40/s to 0/s while fallbacks serve 100%. A failed probe re-opens it, and 3/3 good probes close it. With the dependency slow and no breaker, the pool saturates at 30/30 and the dependency gets 30 calls/s (Little’s law).
- **#12 retry/jitter (herd of 2,000):**
  - peak retry load: 39.8K/s plain exponential, 25K/s full jitter, 11.9K/s decorrelated
  - requests succeeded: 54.9%, 65.0% and 76.8% respectively
  - the retry budget caps amplification at 1.01×
- **#22 autoscaling:**
  - live match: target tracking breaches for 8 min (1.45% dropped); scheduled and predictive, 0
  - 10:00/11:00 booking windows: step scaling drops 7.2%; predictive and scheduled, 0
- **#23 chaos monkey:**
  - an instance kill without health checks gives 66.7% home success
  - a zone-B kill with self-healing gives 82.4% during detection, back to 15/15 in 11 s (3 s detection + 8 s boot)
  - slow recommendations take the home page to 0%; the breaker and fallback restore it to 100%, all degraded

Lessons for later parts:
- **Use the `inference` and `educational` tiers more often.** Several modules show 100% `confirmed`. The proprietary-system cases in Parts 10–13 need explicit `inference` and `educational` labels.
- **Check each new module's `tryit` and `deep` content by reading it, not just by counting.** The audit only proves the fields exist.

## 12. Decisions, deviations and lessons from bugs so far

**Decisions**
- **Multi-file source (2026-11-13):** the user said one file wasn't required. Smaller files mean cheaper and safer edits and checks. The single-file deliverable is still available through `tools/bundle.py`.
- **Direct insertion:** I edit the file directly and insert above the marker, instead of handing the user code blocks to paste. Contents are the same, and the marker protocol is kept.
- **Flashcards:** auto-generated from the MCQs when a module has no `flashcards` array.

**Bug lessons, to apply in later parts**
- **(Part 15) Check class names against global CSS:** the glossary tooltip used the bare class `.tip`, which silently hid any `callout tip`. Probes that read text passed; only a screenshot showed the empty space. Scope one-off UI to an id, and look at screenshots of every new box type.
- **(Part 15) Mobile overflow probes:** with mobile emulation the layout viewport (`innerWidth`) grows to fit wide content, so compare element edges with the device width (360), not `innerWidth`.
- **Canvas sizing:** always set a 2× backing store **and** an explicit CSS height. Without it, canvases rendered at half height.
- **Distributed sims:** timeouts must be much longer than message delays, with randomized timeouts (Raft split votes).
- **Replicated logs:** catch up from the log after a partition, and truncate divergent entries on failover.
- **Probabilistic metrics:** use large samples (Bloom false-positive test at 5,000, CAP stale-read at 500 trials), or the noise reads as a bug.
- **State machines and FIFO tracking:** use explicit counters, not inferred positions (the fan-out celebrity bug).
- **Clamp sliders visibly:** quorum W/R, CAP sliders.
- **Inline buttons:** use `span[role=button]` for inline glossary terms, because `<button>` wraps badly.
- **Test harnesses:** reset verdict state before every run (the Saga harness read a stale verdict).
- **(Part 6) Glossary collisions:** a new term whose slug matches an existing one *overwrites* it, so check slugs first. “Cold start” already meant the recommendation-system cold start, so the serverless one is “Serverless cold start”.
- **(Part 6) Choose metrics that discriminate:** “peak load” was dominated by the herd’s first burst, so it measures peak *retry* load instead. “Time to stabilise” rewarded clients that gave up, so the herd scenario reports herd clients served.
- **(Part 6) Skewed charts:** when one spike dominates a chart, use a √ scale with labelled ticks.
- **(Part 6) Detection delays:** a health-checked load balancer must still route to a dead instance until detection completes. Model that delay explicitly.
- **(Part 7) Glossary aliases are matched across all lessons, case-insensitively.** Avoid everyday words as aliases (scope, session, image, deployment, cell, spot, claim, chunk, encoding, stall). Check alias clashes as well as term slugs. Removed duplicates: Burn rate, MTTR, Connection draining, RTT.
- **(Part 7) No `crypto.subtle` dependency:** SubtleCrypto may be unavailable on `file://` pages, so `SDA.sec` implements SHA-256 and HMAC in pure JS, verified against official test vectors.
- **(Part 14) Check the harness before the code:** when every page “fails” with no errors, suspect the probe (wrong selector) or the browser (stale instance), not the app.
- **(Part 13) Make every default teach the point:** three defaults (an empty recommendation list, an OT example that converged anyway, an LLM load that overloaded both policies) were technically correct but taught nothing. Check each widget’s default output by reading it.
- **(Part 12) Check edges against node boxes:** a straight edge can pass through an unrelated node; `casevis.js` now tests every visible edge (sampling curves) at every step. Use the engine’s `curve` on an edge, or move a node, until it passes.
- **(Part 12) Let theory overrule the story:** two first drafts (hybrid feed is ‘cheapest’, best-fit beats first-fit) were contradicted by the models. Write the claim after running the model, and keep both the average and the worst case when they disagree.
- **(Part 11) Measure text, don’t eyeball it:** node text overflow was invisible to every structural check; `textfit.js` measures each label and every subtitle a node can show at any step. Keep subtitles ≤ ~18 mono characters for a 140 px node.
- **(Part 11) Let simulations write their own verdicts:** derive verdict sentences from the measured numbers, and check the default inputs teach the intended point (tune them so the system is stressed but not saturated).
- **(Part 11) Test sims in bun first:** load the case file with a stub `window.SDA` (`simtest.js`) and compare against brute force or closed-form theory before writing any case text.
- **(Part 10) Validate more than presence:** check that every step's metrics are worse *before* the fix than after, and that node boxes (including subtitles) fit inside the SVG width. The Part 9 checks missed both in notification-service.
- **(Part 9) Validate case data mechanically:** check that every hop is an existing edge and is visible at that step, and that all lesson/playground/lab references exist. The diagram engine silently ignores a missing edge.
- **(Part 9) Diagrams:** keep the leftmost node’s x ≥ 66 with width ≤ 110, or it clips at the SVG edge. Wide architecture diagrams scroll sideways at 360px (`minW` 620) rather than shrinking text below readable size.
- **(Part 9) Calculator realism:** report user-visible totals (queueing wait + provider time), not just queueing delay (the OTP calculator first said “213 µs”).
- **(Part 8) Make demo defaults match the lesson:** the trade-off matrix’s default weights initially contradicted the scenario. Check that every widget’s default state teaches the intended point.
- **(Part 8) Testing labs:** run lab code in bun with `new Function('check','console', code)` (scratchpad `labtest.js`), then click Run in Chrome to confirm the Worker path.
- **(Part 7) Verification tooling:** `pkill -f remote-debugging-port` also matches the shell running it. Kill Chrome in a separate command, or use `pkill -f 'chrome.*9333'` carefully.
- **(Part 6) Tables at 360px:** `.tbl` has `min-width:520px`. Compact grids need an inline `minWidth:0`.
