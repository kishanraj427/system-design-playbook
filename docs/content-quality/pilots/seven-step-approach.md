# Lesson 2 plan: The repeatable 7-step approach

**Status:** Lesson 2 rewritten and awaiting reader review. **Map:** [Foundations dependency map](../maps/01-foundations.md), approved 2026-11-18. **Scope:** `seven-step-approach` in `js/modules/01-foundations.js`, plus its `orderGame` completion message. The lesson ID, route, seven step names and order, design-document code example, and ordering game are preserved. Lessons 3–14 remain unchanged; Lesson 1 received one plain-language terminology correction for this dependency.

## Teaching move

Use one food-delivery interview prompt from start to finish. The prompt sounds broad; the learner first asks what is actually in scope. The seven steps then become seven questions applied to **restaurant search**, with a short decision at each step. A changed requirement sends the learner back through the relevant questions, showing why this is a repeatable loop rather than a rigid script.

The opening defines the method before any architecture terms. Lesson 1 has taught a request, server, database, peak load and bottleneck. This lesson introduces requirements, rough estimation, an API as the requests a client can make, a data model as the information the app must remember, a request-flow sketch, focused investigation of one hard part, and a final failure/cost check. Formal requirement types come in Lesson 3; API design in Module 2; database families, indexes and partitioning in Module 5; consistency in Module 6. Those details will be removed from the beginner path or framed as optional previews.

## Fields to change

- `summary` and `problem`: name the seven-question loop and show the cost of designing payments when the actual task is restaurant search.
- `intuition`: use the same restaurant-search problem to explain why an early question can invalidate a later choice. Do not introduce a new one-off analogy.
- `how.intro` and `how.stepper`: make each step an action and observable result for this one search feature. Explain the API at first use. Keep the seven existing labels so the ordering game still matches.
- `how.html`: retain a copyable design-document skeleton, using plain prompts that reflect the seven steps and one worked request path. Avoid future jargon in the core path.
- `how.deep`: add the useful second layer: how to revisit steps when assumptions change, why non-goals and alternatives matter, and how to allocate limited review time. Do not repeat the simple seven steps with denser words.
- `tradeoffs`, `real`, `mistakes`, `interview`, `tryit.note`, `sources`: tie advice to the same search example, check cited company practices against first-hand sources, and give the ordering exercise a transfer prompt. Preserve source tiers.

## Review and verification

Check title alignment, seven-step order, causal sequence, first-use definitions, forward references, natural read-aloud flow, and whether every trade-off is earned by the restaurant-search example. No em dashes or semicolons in running Lesson 2 copy. Run `bun tools/check.js`, inspect `#/l/seven-step-approach` and its Deep Dive and ordering game in the browser, rebuild `dist/index.html`, and verify the bundled route. Update the coverage ledger to `verified; awaiting reader review` after checks. This is one piece; the next lesson waits for the approved checkpoint cadence.
