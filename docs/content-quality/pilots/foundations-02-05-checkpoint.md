# Foundations checkpoint: Lessons 2–5

**Authority:** Approved [Foundations content map](../maps/01-foundations.md) and [rollout plan](../../superpowers/plans/2026-11-18-content-quality-rollout.md). Lessons 2–5 were edited one at a time and verified as a combined learning path. The reader passed this checkpoint. Lesson 1 is also accepted.

## Lesson 3: Functional vs non-functional requirements

- **Starting knowledge:** Lesson 1 distinguishes what an app does from how well it handles demand; Lesson 2 begins with clarifying needs.
- **Teaching move:** In one train-booking example, contrast “find a train and reserve a berth” with “a confirmed berth is not given to two people” and “search stays responsive at opening time.” Show how two teams can deliver the same buttons yet differ in user outcome. Convert vague wishes into measurable promises one at a time.
- **First-use definitions:** functional requirement, non-functional requirement, response time, correctness, availability. Percentiles, SLOs, CAP/PACELC, payment regulation and replication are later lessons. Do not make them required for the sorting game.
- **Content fields:** rewrite summary, problem, intuition, how steps/stepper/table, deep explanation, trade-offs, real examples, mistakes, interview prompts and sorting exercise copy. Preserve the existing sorting game categories and answer keys.
- **Checks:** each example genuinely fits its category; no claim of inevitable double booking; technical targets state their measurement and window. Deep Dive adds conflicts between requirements instead of repeating the definition.

## Lesson 4: The client–server model

- **Starting knowledge:** request, server and database from Lesson 1; user needs and measurable qualities from Lesson 3.
- **Teaching move:** Follow one menu request from phone to server to database and back. Then follow a login request when a second server is added. Show why a session stored only in one server's memory can disappear from the user's point of view. The library analogy should return when explaining shared state.
- **First-use definitions:** client, response, session, stateful/stateless, shared session store. HTTP details (Lesson 5 and Module 2), load-balancing algorithms (Module 3), Redis (Module 4), tokens (Module 12), and real-time transports (Modules 2/13) are previews only.
- **Content fields:** rewrite prose, diagram notes, deep material, trade-offs, real examples, mistakes, interview prompts and session-demo instructions. Preserve the diagram structure and functioning embedded session demo.
- **Checks:** every state transition in the demo matches prose; no claim that a shared store is the only solution; simple path explains the problem before naming Redis.

## Lesson 5: The life of a web request

- **Starting knowledge:** client, request, server and response from Lesson 4; latency as a measurable quality from Lesson 3.
- **Teaching move:** Trace one slow page load from URL entry through address lookup, connection, secure channel, request, server work and browser rendering. Show why a 40 ms server log does not account for the whole page. Use the parcel analogy only where each mapping is technically faithful.
- **First-use definitions:** DNS as address lookup, TCP as connection, TLS as secure channel, HTTP as request/response format. Full protocol mechanics are Module 2; load-balancer internals are Module 3. The simple path needs no HTTP/2, QUIC or 0-RTT vocabulary.
- **Content fields:** rewrite prose, request diagram notes, deep material, trade-offs, real examples, mistakes, interview prompts and linked `request-journey` playground instruction. Preserve the diagram and playground route.
- **Checks:** latency example arithmetic and hop assumptions are explicit; server time and total page time are not conflated; the playground says what to change and observe.

## Checkpoint verification

For each lesson: read its dependency row, inspect the source and interaction, edit only that piece, run `bun tools/check.js`, and inspect the route. After Lesson 5: rebuild `dist/index.html`, check the four rewritten routes, their Deep Dive controls and relevant interactions at desktop and 360px, scan source copy for em dashes/semicolons and unframed later terms, then update the ledger. Show the checkpoint to the user before Lesson 6.

## Review of the implemented learning path

1. **Lesson 2, the approach:** A restaurant-search question moves through the seven decisions. The ordering exercise asks which earlier question to revisit when restaurant hours change.
2. **Lesson 3, requirements:** A train-booking story distinguishes actions from quality targets. The no-double-booking rule is taught as a business rule that must hold under load, not forced into the wrong sorting category.
3. **Lesson 4, client and server:** A menu request establishes the request/response path. The library's private notebook explains why the second server cannot see a login session held only in the first server's memory. The existing two-server demo remains in place.
4. **Lesson 5, web request:** Two stopwatches separate server work from the customer's visible wait. The illustrative 1,500 ms timeline allocates 60 ms to DNS, 200 ms to connection setup, 100 ms to request and response travel, 40 ms to app work, and 1,100 ms to later downloads and browser work. The linked playground instructions say what to change and clarify that its waterfall excludes browser rendering.

The optional Deep Dive stays directly after each lesson's simple How section. These four lessons reserve protocol mechanics, load balancing algorithms, Redis internals, and signed login data for later modules. Their real-world cards now link to the primary documentation that supports each claim.

**Verification:** The source and bundled routes for Lessons 2–5 render with the inline Deep Dive button and their linked interactions. `bun tools/check.js` reports 48 files checked and zero problems. The Deep Dive browser test passes for source and bundle. A headless browser clicked the Lesson 4 demo and observed a failed cross-server request with private sessions, then a successful cross-server request with the shared store. All four lessons fit a 360px viewport without horizontal overflow. The Lessons 2–5 source copy contains no em dashes or semicolons.

**Review focus:** Read the four lessons in order. Check whether each opening answers its title, whether the jump from one lesson to the next feels natural, whether the session demo and timing waterfall make the explanation easier to follow, and whether any sentence still requires knowledge from a later module. The `request-journey` playground's own article and advanced controls are a separate content piece in the coverage ledger. Lesson 5 gives a beginner route through that playground without treating those controls as prerequisites.
