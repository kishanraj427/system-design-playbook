# Content Writing Guide

This guide is a working aid for the pilot. It will be revised after the first rendered lesson and reader feedback. It does not replace the approved content map for a module or piece.

## Core Teaching Move

1. Answer the title in the opening paragraph.
2. Start with one concrete situation the reader can picture.
3. Follow an actual request, write, failure, or decision in causal order.
4. Introduce one new term when it becomes useful. Explain it there.
5. Ask the reader to predict a result before revealing a diagram or simulation outcome.
6. Return to the same situation to explain the design choice and its cost.
7. End with a small changed condition so the reader applies the idea.

Use the steps that fit the topic. A comparison, a reference table, and a coding lab do not need identical shapes.

## Voice and Readability

- Write in second person when it makes the explanation concrete: “your app,” “you send a request.”
- Give each sentence one main idea and each paragraph one thought.
- Use ordinary transitions such as “Here is what happens next” only when they help the reader follow a change.
- Avoid em dashes and semicolons in running prose. Keep formulas, code, and technical punctuation intact.
- Prefer a few connected paragraphs over a pile of unrelated bullets. Use lists for true sequences, comparisons, or steps a reader can perform.
- An analogy should help the reader start. Follow it with the literal mechanism and say where the analogy stops fitting.
- Keep assumptions visible. A traffic spike can cause CPU saturation, memory pressure, connection waits, or timeouts depending on the workload and limits. Do not present one possible order as universal.
- A glossary tooltip is a reminder, not the first explanation of a new concept.
- Deep content should add internals, boundaries, and failure cases. It should not repeat the simple explanation with extra jargon.

## Before and After: What Changes

These are short editorial examples, not replacement text for a lesson.

| Format | Current pattern to avoid | Better teaching move |
|---|---|---|
| Lesson | “The server hits 100% CPU and the database runs out of connections.” | Follow a request through app and database, state the assumed arrival rate and limits, then show where requests wait and what users see. Name the first measured bottleneck before proposing a fix. |
| Playground | “Adjust the sliders to compare policies.” | Ask for a prediction: raise cache capacity while keeping the workload fixed. Watch hit ratio and database reads. Explain why the curves separate or converge. |
| Lab | “Implement LRU cache.” | State the behavior to build, show the smallest input/output example, explain what each passing check proves, and offer one extension after the base code works. |
| Case | “At 10× scale, add Redis and Kafka.” | Show what fails at 10×, the visible symptom, why the current design cannot absorb it, then introduce one change and the new cost it creates. |
| Challenge | Hint 1 names the final architecture. | Hint 1 narrows the requirement; hint 2 points to the bottleneck; hint 3 suggests the design direction. The full answer stays hidden until reveal. |
| Project | A stage lists technologies. | Connect the choice to the estimate, data access pattern, and previous stage. Explain what would make a different choice reasonable. |
| Interview solution | “Use Cassandra because it scales.” | Speak the assumption, estimate, access pattern, choice, downside, and condition for revisiting it. |
| Principal scenario | A checklist of best practices. | Diagnose what is happening, compare options, choose a reversible first step, name a measure and explain the decision to affected teams. |
| Glossary | A term defined by another undefined term. | Define it in one sentence with ordinary words or a term already taught, then revise the source lesson if the definition needs a whole paragraph. |

## Editorial Review for Each Piece

- **Title:** Can a reader answer the title after the first paragraph?
- **Sequence:** Is every required concept taught earlier, here, or clearly previewed?
- **Mechanism:** Can the reader name the initial state, trigger, internal change, and visible result?
- **Accuracy:** Are assumptions, units, source tiers, and uncertainty clear?
- **Voice:** Does it sound natural when read aloud, without compressed jargon?
- **Analogy:** Does it help without concealing the literal behavior?
- **Trade-off:** Does a choice refer back to the example and name its cost?
- **Interaction:** Does the diagram, playground, or quiz make the same point as the prose?
- **Transfer:** Can the reader apply the idea when one constraint changes?
- **Depth:** Is the simple layer sufficient, and does the deeper layer add something new at the point where curiosity arises?

## Checkpoints by Format

- **Lessons:** Review the first paragraph, causal story, diagram steps, deep material, trade-offs, and inline quiz as one unit. Inspect mobile line length and the position of the inline Deep-dive control.
- **Playgrounds:** Try at least two settings. State the expected direction of the metric and compare it with the simulation.
- **Labs:** Run the starter code. Check that each assertion has an understandable meaning and that the learner knows what to change next.
- **Cases:** Step through each break/fix pair and check that the diagram, metric, and prose describe the same system state.
- **Challenges:** Reveal hints one by one and check that each provides a useful next thought without giving away the full design.
- **Projects:** Read the 17 stages as a chain of decisions. Trace each code sample back to a requirement or data model.
- **Interview solutions:** Read the “thinking out loud” blocks aloud and test estimates at default and extreme inputs.
- **Principal content:** Check the evidence that would change a decision and the explanation to leadership.
- **Glossary:** Check one-sentence clarity, duplicate terms, and circular definitions.

## Pilot Reader Check

After the first rewritten lesson is rendered, ask the reviewer to explain its title, narrate the mechanism, and respond to one changed constraint without looking back. Record where they hesitate. Revise the same lesson before using it as the model for more work.
