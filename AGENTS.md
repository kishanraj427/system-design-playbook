# Rules for AI agents working on this repo

Read this whole file before every task. If anything else in the repo disagrees with this file, this file wins.

## 0. Hard rules (breaking one means the task failed)

1. **Never run any git command.** That includes `status`, `diff`, `log`, `add`, `commit`, `mv`, `reset`, `checkout`, `stash` and `push`. The owner runs git.
2. **Do only the task you are given.** If the task names one module file, edit only that file.
3. **Never edit `js/core/`, `css/`, `tools/` or `index.html`** unless the task says so by name.
4. **Never put a lesson id inside app code or CSS.** For example, `if (l.id === "what-is-system-design")` is not allowed. App and CSS changes must work for every lesson.
5. **Never change a check or test to make your work pass.** Fix the lesson. If you think a check is wrong, say so in your report.
6. **Never write planning, map, ledger or checkpoint documents.** Do not edit `docs/content-quality/PROGRESS.md`. The owner updates it.
7. **Never run `python3 tools/bundle.py`** unless the task says so. Several agents may be working at the same time, and the bundle is one shared file.
8. **Never delete files.**

## 1. The goal

Make every lesson **easy to understand for a beginner**. After reading once, the reader can explain the idea in their own words.

Easy to understand matters more than any other rule here. If a rule makes a lesson harder to read, follow the goal and mention it in your report.

## 2. The model lesson

`what-is-system-design` in `js/modules/01-foundations.js` is the model. Open it before you write, and copy its shape and tone.

## 3. Lesson shape

Fill the existing lesson fields like this:

```js
{
  id:'keep-the-same-id', title:'Keep the same title unless asked', minutes:7, tags:[...],
  summary:'2 short sentences that answer the title. Do not start with "In short", the app adds it.',
  problem:`<h3>A small example</h3><p>One situation.</p><ul><li>1 app server</li><li>1 database</li><li>100 users</li></ul><p>A question that makes the reader curious.</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>One line to set up the steps.</p>',
    steps:[ // 3 to 6 steps, one idea each
      {icon:'📱', title:'Few words', text:'One or two short sentences.'},
    ],
    diagram / stepper / mount: keep the lesson's existing one, and make it show the same story as the steps.
    html:`<h3>Everyday comparison</h3> + a small table
          <div class="callout tip"><b>Important point</b><p>The one thing to remember.</p></div>
          <h3>How we handle it</h3> (or <h3>When to use which</h3>) + a small table`,
    deep:`New detail only: numbers, edge cases, internals. Never repeat the simple part.`
  },
  tradeoffs:{use:[...], avoid:[...], alt:[...]},  // use the SAME example as the problem
  real:[ up to 2 short items ],
  mistakes:[ 2 or 3 ], interview:[ 2 or 3 ],
  tryit:{ keep the existing playground/lab link, plus a quiz of 2 or 3 questions },
  sources:[ plain names, no links ]
}
```

- Wrap every table in `<div class="simple-table">${h.table([...], [...])}</div>`.
- If the lesson has a playground, lab, stepper or diagram, **keep it**. Change only its text so it matches the new story.
- For a topic that is not about failure (for example SOLID or OAuth), the steps show how the thing works, one step at a time.

## 4. Writing rules

- Short sentences, about 20 words or fewer. Paragraphs of 3 sentences or fewer.
- Simple words. Explain each new technical word in plain words the first time it appears.
- **Simple part: about 350 words or fewer.** This covers `summary`, `problem`, `how.intro`, `how.steps` and `how.html`. Everything longer goes in `how.deep`.
- Write like a person explaining to a friend. No em dashes (—). Avoid semicolons.
- Say a caveat **once**, and only if it matters. Do not repeat "this is only an example" style warnings.
- Numbers must be correct. Show the math in small steps (for example, 40,000 ÷ 20 s = 2,000 per second).
- Each part must add something new. Never say the same point twice.

## 5. Order of topics

Use only ideas from earlier lessons, or explain them right where they appear. A later idea may appear only as a preview: "(you will learn this in Module 7)". This applies to quizzes and mistake lists too.

| Module | Teaches |
|---|---|
| 1 Foundations | system design, requirements, client/server, latency, estimation, scaling, queues as waiting lines, p99, availability, SLOs, single points of failure, monolith vs microservices |
| 2 Networking | DNS, TCP/UDP, HTTP, TLS, REST/GraphQL/gRPC, WebSockets, API design, idempotency |
| 3 Traffic | load balancers, CDN, rate limiting, DDoS |
| 4 Caching | caches, Redis, eviction, invalidation |
| 5 Databases | SQL/NoSQL, indexes, replication, sharding, consistent hashing |
| 6 Distributed | CAP, consistency, quorums, Raft, locks, 2PC, sagas, CRDTs, unique IDs |
| 7 Async | message queues, Kafka, pub/sub, event-driven, CDC, stream processing |
| 8 Search | inverted index, Elasticsearch, tries, Bloom filters, geo, vector search |
| 9 Reliability | timeouts, retries, circuit breakers, bulkheads, failover, chaos, autoscaling |
| 10 Architecture | DDD, service mesh, Docker, Kubernetes, serverless, multi-tenancy |
| 11 Observability | logs/metrics/traces, alerts, CI/CD, deploys |
| 12 Security | authN/authZ, OAuth, JWT, encryption, OWASP |
| 13 Real-time | WebSockets at scale, WebRTC, streaming, offline sync |
| 14 Principles | SOLID, KISS/YAGNI, patterns, trade-off thinking |
| 15 Interview | interview framework, estimation drills |

Inside one module, reuse the same example app across lessons when it fits.

## 6. Pictures

No photos or image files, because the app must work offline. Use emoji or inline SVG in `how.steps`, and the existing diagram engine.

## 7. Module task (the normal task)

When asked to rewrite a module:

1. Read the model lesson and the whole module file.
2. Rewrite **every lesson** in the module, in order. Do not stop to ask before starting.
3. Update the module's `quiz`, `cheatsheet` and `glossary` in the same file so they match the new lessons.
4. Run `bun tools/check.js` and `bun tools/lesson-check.js <module-id>`. Fix the lessons until both pass.
5. Read each lesson's simple part once as a beginner would. Fix anything confusing or repeated.
6. Report.

If one lesson is unclear, finish the others and ask about it in your report. Do not invent new process.

## 8. Report (the only thing you write at the end)

```
Module: <id>  lesson-check: PASS/FAIL
Changed: <lesson id> (one short line each)
Open: #/l/<id>, #/l/<id>, ...
Questions: <only real questions, or "none">
```

## 9. Do not change

- Lesson, module, playground, lab and case `id`s, and routes.
- Field names (`summary`, `problem`, `intuition`, `how`, `deep`, `tradeoffs`, `real`, `mistakes`, `interview`, `tryit`, `sources`).
- Simulation logic in `js/playgrounds/`, `js/labs/` and `js/cases/engine.js`.
