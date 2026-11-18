# Rules for AI agents working on this repo

Read this whole file before every task. If a rule here conflicts with any other doc in the repo, this file wins.

## 1. The goal

Make every lesson **easy to understand for a beginner**. The reader should be able to explain the idea in their own words after reading once.

Easy to understand is the goal. Every other rule here exists to serve it. If a rule makes a lesson harder to read, stop and ask the owner.

## 2. How a lesson must look

Copy the style of the model lesson: `#/l/what-is-system-design` in `js/modules/01-foundations.js`. When unsure, open it and do the same thing.

A lesson has these parts, in this order:

1. **In short.** Answer the title in 2 or 3 short lines. A reader who stops here should still know what the topic is.
2. **A small example.** One concrete situation with small, real-looking numbers. List the setup as bullets (for example: 1 app server, 1 database, 100 users).
3. **What happens behind the scenes.** Numbered steps. Each step has:
   - a picture (simple SVG icon, emoji, or the animated diagram)
   - a bold heading of a few words
   - 1 or 2 short sentences
   Use 3 to 6 steps. One idea per step.
4. **Everyday comparison.** One analogy (kitchen, train, toll booth). Show it as a small **table** when there are levels or cases (for example: orders → what happens).
5. **Important point.** One box with the single thing to remember.
6. **How we handle it.** A table: solution → what it does. Use only ideas already taught. A later idea may appear only with "(you will learn this in Lesson X)".
7. **Go deeper** button. Sits right after the simple explanation. Deep content adds new detail. It never repeats the simple part.
8. **Trade-offs.** Use the **same example** from part 2. No new example here.
9. Real-world, common mistakes, interview tips, quiz. Keep each short.

Each part must move the reader forward: basic first, then a bit deeper. Never repeat a point that an earlier part already made.

## 3. Writing rules

- Short sentences: about 20 words or fewer.
- Short paragraphs: 3 sentences or fewer. Prefer steps, bullets and tables over long paragraphs.
- Simple words. Explain every new technical word in plain words the first time it appears.
- **Simple part limit: about 350 words.** Longer detail goes behind Go deeper.
- Write like a person explaining to a friend. Do not use em dashes (—). Use semicolons rarely. Normal bullet points are fine.
- Say a caveat **once**, in plain words, only if it really matters. Example: "A server usually gets slow before it crashes." Do not add "this is only an example" warnings across the lesson.
- Numbers must be correct. Show simple math step by step.

## 4. Order of topics

- Use only ideas taught in earlier lessons, or explained right here.
- Do not put a later topic (monolith, microservices, Kafka, sharding) in a lesson, quiz or mistake list before it is taught. Mention it only as a preview: "(you will learn this in Module X)".
- Within one module, reuse the same example app when it fits, so the reader does not start over in each lesson.

## 5. Pictures

- No photos or image files. The app must work offline. Use inline SVG, emoji, or the existing diagram engine (`SDA.Diagram`, `SDA.miniDiagram`).
- Every "behind the scenes" step gets a picture.
- Keep the existing animated diagrams, playgrounds and quizzes. Do not delete interactive parts.

## 6. How to work

- **Do only the task you are given.** One module, or the part named in the task. Do not touch other modules, the app code (`js/core/`) or CSS unless the task says so.
- **Before writing a module**, show the owner one short table: one row per lesson with the example used, the pictures planned and the new ideas. Wait for "OK". Do not write long planning documents.
- **While working**, update only `docs/content-quality/PROGRESS.md`, with one line per lesson. Do not create other plan, map, ledger or checkpoint files.
- **Do not search the web** unless you are adding or changing a real company fact. Do not add links. Name the source in plain text (for example: "Netflix Tech Blog").
- **Checks:** run `bun tools/check.js` after editing. Run `python3 tools/bundle.py` only when the module is finished.
- **Do not commit, push, or delete files** unless the owner asks.
- **If unsure, ask.** Do not invent new rules or new process.

## 7. When you finish a task

Reply with only this:

1. What changed (one line per lesson).
2. Which pages to open (for example, `#/l/latency-numbers`).
3. Anything you were unsure about.

Keep it short.

## 8. Do not change

- Lesson, module and playground `id`s, and routes. Links depend on them.
- The schema field names (`problem`, `intuition`, `how`, `deep`, `tradeoffs`, `real`, `mistakes`, `interview`, `tryit`, `sources`).
- Simulation logic in `js/playgrounds/`, `js/labs/`, `js/cases/engine.js`.
