# Lesson 1 pilot plan

**Status:** Foundations map approved by the user on 2026-11-18. Lesson 1 and the shared Deep Dive presentation were implemented, verified, and accepted by the user. The rest of the module remains for later review checkpoints.

## Scope and teaching decision

- **Content:** edit only `what-is-system-design` in `js/modules/01-foundations.js` (title, summary, problem, intuition, how/diagram notes, deep content, trade-offs, real-world copy if necessary, mistakes, interview prompts, inline quiz). Keep its ID, route, interactive diagram and two quiz items. Avoid edits to lessons 2–14 and the module quiz in this pilot.
- **Opening:** answer “What system design is” before naming any infrastructure. Use the college results app as one running example, then the restaurant kitchen to make the same choices tangible. The example traces a request at small scale, a peak that exceeds one measured limit, waiting, timeout, and a reasoned next step. CPU, memory and database limits are conditional possibilities, not a guaranteed failure sequence.
- **Basic vocabulary:** define request, server and database in the story. Introduce a load distributor, cache or background queue only when the diagram calls for it, in plain language. Remove unexplained microservices, Kafka and Kubernetes from the first lesson's mistakes and quiz. Leave full implementations to later lessons.
- **Trade-off:** return to the 200-user version. A single server can be enough at that scale; extra boxes add cost and failure paths. At the peak, measure the first limit before choosing a change. The quiz checks that decision and the title's definition.
- **Depth:** add genuinely new information about requirements, bottleneck measurement, failure boundaries and reversible choices, using brief definitions. Deep content is optional and follows the simple explanation.

## Shared Deep Dive interaction

- **Files:** `js/core/app.js`, `css/styles.css`; possibly a small browser behavior test under `tools/` if the repository's available runtime supports it. Do not change the lesson schema or diagram engine.
- **Current:** `depthSeg()` appears at the top of each lesson and module overview. `how.deep` is hidden in How; `l.deep` is a hidden separate section; the CTA after How tells the reader to go to the top. The TOC hides deep links unless global depth is deep.
- **Proposed:** remove the top depth controls from lesson and module header. Put one button labeled “Go deeper” directly after the simple How explanation (or after the last explanatory section if there is no How). Clicking reveals all available `how.deep` and `l.deep` content in one controlled region at that point, changes the label to “Hide deeper explanation”, and leaves other sections untouched. No page rerender. `aria-expanded`, `aria-controls`, keyboard activation and a visible focus state are required.
- **Routes:** `#/l/:id/deep` and the Deep Dive TOC entry open the region before scrolling to its heading. A direct lesson visit starts collapsed regardless of the old stored depth preference. Do not erase that preference or unrelated progress data.
- **Responsive behavior:** disclosure and text fit a 360px viewport, both themes, and reduced-motion mode. Keep diagrams and tables at their useful width. Apply a narrower text measure only if the pilot page inspection shows the 880px prose width is difficult to read.

## Ordered implementation and checks

1. Record baseline syntax check and current route/deep-link behavior. Inspect a lesson with `how.deep`, and search for `l.deep` variants so the disclosure handles both.
2. Write one behavior test for the UI change and watch it fail on the current renderer. Cover initial collapse, click-to-open, deep-link opening, and keyboard/ARIA state. Implement the smallest renderer/CSS change and rerun the test.
3. Rewrite only Lesson 1 after its content-map gate. Check every forward reference and read the entire lesson aloud, including diagram notes and quiz explanations. Review all numbers as assumptions.
4. Run `bun tools/check.js`, the UI behavior test, and the affected hash routes. Inspect the lesson at desktop and 360px in light and dark themes. Verify that reveal occurs in place without repeating unchanged sections.
5. Build `dist/index.html` with `python3 tools/bundle.py` once the pilot is stable; check the same route in the generated bundle. Mark the Lesson 1 ledger row as rewritten/verified, leaving the other 13 as map approved.
6. Show the rendered pilot to the user. Ask them to explain the title, narrate the overload path, and decide what they would do if only 200 users remained. Revise this lesson and the editorial guide from that feedback before starting Lesson 2.

## Remaining Foundations queue

After the pilot is accepted: lessons 2–5 (process, requirements, client/server, web request) → review checkpoint → 6–9 (latency, estimation, scaling, queueing) → review checkpoint → 10–14 (tail latency, availability, SLOs, fault tolerance, architectures) → module quiz, flashcards, glossary, cheat sheet and linked playgrounds → module-end review. Each lesson is edited and checked separately.
