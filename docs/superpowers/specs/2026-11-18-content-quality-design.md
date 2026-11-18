# Content Quality Working Design

This records the design direction supplied in the conversation on 2026-11-18. The separate gaps file mentioned there was not available in the workspace. The first content map and rewrite remain subject to the user's approval.

## Intent

Make the System Design Playbook teach system design progressively and naturally across lessons, playgrounds, labs, cases, challenges, projects, interview solutions, principal content, and glossary entries. The reader should understand a mechanism and its trade-offs, not merely recognize terminology.

## Goals

- Answer each piece's title at the start and match its reader's level.
- Map prerequisites, new concepts, and explicit previews before drafting a piece.
- Explain cause and effect step by step where a mechanism or failure is central.
- Use clear, conversational prose. Avoid em dashes and semicolons in running text.
- Carry useful analogies into the explanation and trade-offs without forcing one where it adds confusion.
- Put a “Go deeper” control immediately after the simple explanation. Opening it reveals the lesson's extra detail in place, so the reader does not return to the top or reread unchanged sections.
- Keep technical claims and numerical examples accurate, with assumptions stated.
- Give the reader a reason to think before revealing an explanation, then check whether they can use the idea in a new situation.
- Keep diagrams, prose, and examples synchronized so the reader learns one change at a time.

## Content-specific shape

- Lessons may use the current seven-part schema when it fits the topic.
- Playgrounds tell the reader what to change and what to observe.
- Labs lead with the coding task, useful hints, and a clear passing state.
- Cases show architecture evolving as constraints change and failures appear.
- Challenges reveal hints progressively.
- Projects keep the 17-stage sequence while making each stage explanatory.
- Interview solutions show the reasoning spoken at each phase.
- Principal content may be denser while remaining clear.
- Glossary entries define one concept in one clear sentence without circular jargon.

## Agreed workflow

The user names the first piece. Before drafting, show the dependency map for its module or content group and wait for approval. Write one piece, review it together, and iterate on that first piece before moving on. For the remaining corpus, write pieces sequentially under approved group maps and show small review checkpoints. The proposed checkpoint cadence is in the rollout plan and remains subject to the user's review. No lesson or UI changes are authorized by this document alone.

## Constraints and risks

- Preserve the app's useful diagrams, playgrounds, quizzes, links, and routing when rewriting content.
- A reader may enter from a deep link. Required context must be available in the piece or linked clearly.
- The college-app failure example is a clarity reference, not a universal failure sequence. CPU saturation, memory pressure, connection exhaustion, and timeouts depend on the actual system.
- The existing Simple/Deep control is global and placed near the top of a lesson. A callout after “How it works” sends readers back to it. Replace that route through the page with an inline disclosure after the explanation, and preserve direct links to the deep section.
- Avoid treating punctuation counts or rigid templates as substitutes for editorial judgment.
- Readability includes paragraph length, text width, contrast, and the amount of new terminology on one screen. Verify these on the first rewritten lesson before applying a site-wide style change.
