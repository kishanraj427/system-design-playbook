# Foundations checkpoint: Lessons 6–9

**Authority:** Approved [Foundations dependency map](../maps/01-foundations.md), [rollout plan](../../superpowers/plans/2026-11-18-content-quality-rollout.md), and the user's acceptance of Lessons 1–5. Lesson 6 has a [piece-specific map](latency-numbers.md). Lessons 6–9 were rewritten one at a time. This checkpoint awaits reader review before Lesson 10.

## What a learner sees now

Open `index.html` and choose Foundations Lessons 6–9, or use these routes: `#/l/latency-numbers`, `#/l/back-of-envelope`, `#/l/vertical-vs-horizontal`, and `#/l/latency-vs-throughput`.

| Lesson | Earlier opening | Rewritten teaching path |
|---|---|---|
| 6. Latency numbers | A 200-call example followed immediately by a dense list of operation times and design advice. | A dashboard asks for 200 profiles one by one. Each 1 ms wait sounds small, but 200 waits cost at least 200 ms. The operation times help the reader spot this bottleneck. |
| 7. Back-of-envelope estimation | “Should we shard the database?” followed by unrelated UPI and URL shortener examples. | One fictional URL shortener: 20 million visitors × 20 requests/day = 400 million/day. Convert to about 4,600 average requests/s, assume and test a five-times peak of about 23,000/s, then estimate new links and stored bytes. |
| 8. Vertical vs horizontal scaling | A general choice between bigger and more servers. | Continue the URL shortener. A load test finds the app server full while the database has room. Compare a larger app server with several app servers, then show that a shared database can become the next limit. |
| 9. Latency vs throughput | Claimed latency rises from 50 ms to 2 seconds near capacity without a model or calculation. | A worker needs 10 ms on average and can finish about 100 requests/s. In the stated random single-worker model, 50 arrivals/s give 20 ms average total time, while 95 arrivals/s give 200 ms. Waiting accounts for the increase. |

The Deep Dive invitation appears after “How it works” in the rendered lessons. A reader can open detail there and continue down the page. Lesson 9's curve now fits a 360px screen with readable labels.

## Verification and remaining scope

`python3 tools/bundle.py` rebuilt `dist/index.html`. `bun tools/check.js` checked 48 files with zero problems, and `git diff --check` passed. A headless browser checked all four lesson routes in source and bundled pages at 360px, including the inline Deep Dive, stepper or diagram, and relevant playground control. The result was eight passing route checks. The numerical examples in Lessons 6, 7, and 9 were recalculated separately. The local browser test that starts a server could not bind a port in the sandbox; the direct browser route checks above covered the actual rendered pages.

Lessons 1–5 have passed reader review. Lessons 6–9 are rewritten and await it. Lessons 10–143 and the other content types have not been rewritten as part of this checkpoint. The existing lesson-linked playground controls were checked and given clearer instructions, but their full standalone articles remain separately tracked.

## Dependency path

| Lesson | Required earlier knowledge | New concepts, in the order the reader needs them | Later concepts to frame or defer | Transfer check |
|---|---|---|---|---|
| 7. Back-of-envelope estimation | Measurable requirements (3), one request and response (4), latency units (6) | Assumption → users and actions → requests/day → average requests/s → peak requests/s → rough new storage → a decision | Sharding, replicas and Redis are later database/cache lessons. Do not make them the answer to an unmeasured estimate. Cache size depends on a measured hot set, not a universal 20% rule. | Change daily users or peak factor and recompute the decision with units. |
| 8. Vertical vs horizontal scaling | Shared sessions (4), peaks and estimated capacity (7), bottleneck from 2 | Scale up one machine → machine limit/failure → scale out app servers → shared state and shared database limit | Formal load balancing in Module 3, read replicas/sharding in Module 5, autoscaling and cells later. Name those as previews only. | Given one saturated app server and a healthy database, choose a capacity move and say what fails next. |
| 9. Latency vs throughput and queues | Latency of one operation (6), peak arrival estimate (7), server capacity (8) | Time per request → completions per second → arrivals versus capacity → waiting line → utilization/headroom → user-visible delay | Little's Law and M/M/1 can be optional depth with assumptions. p99 is Lesson 10. Kafka and load shedding are later modules. A waiting line in front of one server is not a durable message queue. | Predict the effect of changing arrivals from 50/s to 95/s with a 100/s single-server capacity. |

## Lesson 7 plan

**Teaching move:** Use one illustrative URL shortener aligned with the calculator's URL-shortener preset. Start with 20 million daily visitors making 20 requests each per day, with 1% creating new links. That gives 400 million requests/day, about 4,600 average requests/s, about 4 million writes/day, and about 23,000 peak requests/s if the assumed peak factor is five. Estimate raw record bytes from an explicit 500-byte record. End by deciding what the estimate can and cannot justify. The existing UPI and URL shortener examples compete and introduce unsupported payment internals. Keep one worked path and use public transaction volumes only as an optional real-world data source.

**Interaction:** Keep the existing stepper and `envelope` calculator. Rewrite the stepper to match the same URL shortener assumptions. Its calculator includes an illustrative 20% hot-data input and rough capacity verdicts. The lesson must say that a cache is sized from the actual hot set and that calculator verdicts require load testing. Do not treat the 20% value or server capacity as a fact about every system. The playground article itself is a separately tracked piece.

**Checks:** Show units for each conversion. Distinguish average from peak. Separate raw data from replication and index overhead. If the assumed read ratio or record size changes, the outcome must update coherently. Do not jump from one arithmetic result straight to sharding.

## Lesson 8 plan

**Teaching move:** Reuse the URL shortener estimate only for the *app tier*, or state a separate illustrative traffic case. Compare one larger machine with several smaller app servers against the same demand. Return to Lesson 4's login-session problem and show what a shared database still limits. Carry the dhaba analogy from staffing to shared orders and the cost of coordination.

**Interaction:** Preserve the animated diagram and `scaleCalc`. Repair copy that implies a 64-vCPU box is the largest available or that adding servers gives near-limitless/linear growth. Keep the calculator's capacity and cost inputs clearly illustrative, and do not treat the single machine's failure as a whole-system outage unless it is the only app path.

**Checks:** A second app server does not fix a saturated database. A load distributor can route around a failed app server only after it detects the failure and if surviving servers have headroom. The analogy must not imply cooks operate independently of a shared kitchen.

## Lesson 9 plan

**Teaching move:** Use one toll booth with 10 ms average service time, so it can finish about 100 cars/s when continuously busy. At 50 arrivals/s the line is usually short. At 95 arrivals/s, random bunching can create long waits even though average arrivals are below capacity. Only then show the simple-queue model and its assumptions. Never claim that a 50 ms request at 1,900 of 2,000 req/s inevitably becomes a 2-second request.

**Interaction:** Preserve the queue curve and discrete-event simulation. The curve uses the single-server M/M/1 formula with 10 ms average service time. The simulation uses random arrivals/service and can show variable results. Guide the reader to change arrival rate from 50/s toward 95/s, watch queue length and average latency, then add one server. Define or explicitly preview p99 if the simulation displays it.

**Checks:** Distinguish latency from throughput and bandwidth. Explain that the formula predicts an *average* under a particular model, not every observed request. Identify the point at which arrivals exceed service capacity and the waiting line keeps growing unless work is rejected or capacity changes. Keep later Kafka/broker concepts out of the simple path.

**Narrow-screen chart repair:** A 360px browser capture revealed that the curve's fixed 680-unit SVG scales its 11px labels to roughly half size. Draw this lesson's chart with a viewBox no wider than the available narrow viewport while preserving its formula, ticks, slider range, and accessible label. Verify the new viewBox and inspect another 360px capture. Do not alter other diagrams or the queue simulation.

## Checkpoint gate

For each lesson, edit its source only after this map, verify math and primary-source claims, run `bun tools/check.js`, and inspect the rendered route and interaction. After Lesson 9, rebuild `dist/index.html`, check source and bundle routes for Lessons 6–9 at desktop and 360px, check the embedded Deep Dive and linked controls, scan for em dashes, semicolons, and unframed future terms, then update the coverage ledger. Show the four-lesson checkpoint to the reader before Lesson 10.
