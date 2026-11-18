# Content Fix Plan

**Goal:** make every lesson easy to understand, using short steps, pictures, tables and one clear example.
**Rules:** see `AGENTS.md`. The model lesson is `what-is-system-design`.
**Who decides:** the owner approves each step before the next one starts.

## Step 0: Clean up (owner does this, or asks an agent)

- [ ] Save the current work as one commit on this branch, so nothing is lost.
- [ ] Add `AGENTS.md` and this plan.
- [ ] Move the old heavy docs to `docs/content-quality/archive/`. These are the 40 KB rollout plan, the 135 KB ledger, the editorial guide, the maps and the pilot/checkpoint files. They are history now, not instructions.
- [ ] Create `docs/content-quality/PROGRESS.md` with one line per Foundations lesson.

## Step 1: Build the model lesson (one task)

- [ ] Add one small "picture steps" building block to the engine: a numbered list where each step has an icon (SVG or emoji), a short heading and 1 or 2 sentences. Make it work on phones and in both light and dark themes.
- [ ] Rewrite Lesson 1 (`what-is-system-design`) in the shape described in `AGENTS.md` section 2, using the owner's server-overload example as the style guide:
  - 1 app server, 1 database, then a sudden crowd of users
  - steps: requests arrive → CPU busy → memory fills → database connections run out → requests wait, then time out
  - kitchen table (orders → what happens)
  - important point: a server usually gets slow before it crashes
  - "how we handle it" table, with later topics marked as previews
  - registered vs active vs concurrent users
- [ ] **Owner reviews Lesson 1 in the browser.** Fix until approved.

Nothing else starts until Lesson 1 is approved. It becomes the copy-this example for every other lesson.

## Step 2: Foundations, Lessons 2 to 14

- [ ] Agent shows a one-row-per-lesson table (example, pictures, new ideas). Owner says OK.
- [ ] Lessons 2 to 5: reshape to the model style. They already exist but are too long, so cut them down.
- [ ] **Owner reviews.**
- [ ] Lessons 6 to 9: same.
- [ ] **Owner reviews.**
- [ ] Lessons 10 to 14: rewrite from the old version.
- [ ] Update the Foundations module quiz, flashcards and cheat sheet to match.
- [ ] **Owner reviews.** Run the bundle. Commit when the owner says so.

## Step 3: Modules 2 to 15, one module per task

For each module:

- [ ] Agent shows the lesson table. Owner says OK.
- [ ] Agent rewrites the module's lessons, then its quiz, flashcards and cheat sheet.
- [ ] Owner reviews the module in the browser. Commit when the owner says so.

Order: Networking → Traffic → Caching → Databases → Distributed → Async → Search → Reliability → Architecture → Observability → Security → Real-time → Principles → Interview.

## Step 4: Other content (later, one type at a time)

Playgrounds, labs, case studies, practice, projects, interview solutions, principal pages, glossary.
For each type: fix **one** item first as a model, owner approves it, then do the rest.

## What "done" means for a lesson

- [ ] Title answered in the first 2 or 3 lines.
- [ ] One example, with numbered steps and a picture per step.
- [ ] At least one table.
- [ ] Simple part is about 350 words or fewer.
- [ ] No topic used before it is taught.
- [ ] Trade-offs use the same example.
- [ ] Go deeper adds new detail and does not repeat.
- [ ] `bun tools/check.js` passes and the page looks right on a phone.
