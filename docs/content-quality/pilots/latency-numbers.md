# Lesson 6 content map and rewrite plan: Latency numbers every engineer should know

**Authority:** The user approved the [Foundations dependency map](../maps/01-foundations.md), accepted Lesson 1, and passed the Lessons 2–5 checkpoint. This plan covers one lesson, `latency-numbers`, before any product copy changes.

## What the reader brings

| Earlier piece | Knowledge used here |
|---|---|
| `functional-vs-nonfunctional` (3) | Response time can be a measured quality target. |
| `client-server` (4) | A client can make a request to a server and wait for a response. |
| `web-request-journey` (5) | A page load includes network trips, server work, later downloads, and browser work. |

The reader may know everyday milliseconds but need not know nanoseconds or microseconds. Define the units before comparing them. A CPU's L1 cache is tiny hardware storage close to the processor. It is different from the application data cache previewed in Lessons 1 and 5.

## This lesson introduces, in order

1. **Latency estimate:** a rough time for one specified operation, useful for finding which wait dominates a design. These are orders of magnitude, not promises for all hardware.
2. **Units:** 1 millisecond = 1,000 microseconds; 1 microsecond = 1,000 nanoseconds.
3. **Comparison ladder:** illustrative L1 CPU cache access (~1 ns), main-memory access (~100 ns), local SSD random read (~100 µs), same-datacenter round trip (~0.5 ms), and long-distance round trip (~150 ms). Name the operation being timed each time. Explain that an external or remote SSD can be slower.
4. **Sequential waiting:** 200 dependent profile calls at 1 ms each add at least 200 ms of waiting before the other page work. The result assumes each call finishes before the next begins.
5. **Decision:** first remove or combine unnecessary calls. If the wait is a long network trip, bringing suitable data nearer can help. If the wait is storage, measure that operation before adding a cache.

The opening answers the title before any table: engineers should know the relative sizes of common waits so they can spot an obviously slow design. A story about 200 sequential profile calls shows why. The stretched-time analogy (1 ns becomes 1 second) then stays consistent across the ladder and returns when choosing which wait to fix.

## Future concepts and previews

| Term | Handling |
|---|---|
| `p99` and tail latency | Lesson 10. Remove from the beginner path. If mentioned at all, say later lessons examine unusually slow requests; do not require it for this lesson. |
| Batching and parallel calls | Briefly explain as fewer network trips or several calls in flight together. Their capacity and failure costs come later. |
| CDN and Redis | Name only if the point is plain: a closer copy reduces distance; a shared in-memory store still incurs a network trip. Full cache design is Module 4. |
| Throughput or bandwidth | Optional Deep Dive only. Define as how much data a link can carry per second before comparing it with one request's wait. Lesson 9 treats throughput fully. |

## Existing interaction and evidence

- Preserve the `#/l/latency-numbers` route and its link to the `latency-chart` playground. The chart is a separately tracked content piece, so this pass rewrites the lesson's instruction to predict and observe a comparison without recasting the playground's whole article.
- Keep the stepper, but make its items the same five anchor operations taught in the prose. The chart can retain more examples for exploration.
- The original Jeff Dean 2009 keynote lists ~100 ns main memory and ~0.5 ms same-datacenter round trip. Its disk figures refer to the hardware of that era. Treat the lesson's SSD figure as an illustrative local-device estimate, not a number from Dean's slide. AWS documents that even high-performance network-attached SSD volumes can average under 500 µs for a 16 KiB operation, showing why “SSD” is not one universal number.
- Check primary sources for real-world cards: [Jeff Dean's LADIS 2009 talk](https://cis.temple.edu/~giorgio/cis307/readings/dean-keynote-ladis2009.pdf), [Netflix Open Connect](https://openconnect.netflix.com/), and [Redis benchmark guidance](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/benchmarks/).

## Field plan and acceptance

Rewrite summary, problem, intuition, How steps and stepper, Deep Dive, trade-offs, real cards, mistakes, interview prompts, and Try it note. No renderer or simulation algorithm changes. The Deep Dive will add the distinction between one call's latency and link data rate, plus boundaries of the numbers, rather than repeat the ladder.

Check the arithmetic for 200 × 1 ms and every stretched-time label. Scan for em dashes, semicolons in running copy, and undefined future terms. Run `bun tools/check.js`, rebuild `dist/index.html`, render source and bundle routes, and inspect the embedded chart. Verify the inline Deep Dive remains directly after How. Update the coverage ledger to `verified; awaiting reader review` when the checks pass. Review Lessons 6–9 together at the next checkpoint, editing one lesson at a time.
