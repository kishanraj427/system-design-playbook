# 🏗️ System Design Playbook

> **Learn system design from zero to principal-engineer thinking** — with animated diagrams, interactive simulations, hands-on labs, and real-world case studies.

A fully self-contained, single-page web application built with **vanilla HTML, CSS, and JavaScript** — no frameworks, no build step required. Open [System Design Playbook](https://kishanraj427.github.io/system-design-playbook) in your browser and start learning.

---

## ✨ Features at a Glance

| Feature | Description |
|---|---|
| 📚 **15 Modules, 143+ Lessons** | Structured curriculum from beginner to principal-engineer level |
| 🎮 **27 Interactive Playgrounds** | Hands-on simulations with real logic (not fake loops) |
| 🧪 **8 Code Labs** | In-browser coding with a Run button and self-checking asserts |
| 📊 **28 Case Studies** | Real-world system designs (URL Shortener → Google Search → Netflix) |
| 🏋️ **33 Practice Challenges** | Hint-based problem solving with animated solution diagrams |
| 🛠️ **24 Guided Projects** | Full 17-stage system design walkthroughs with code samples |
| 🎯 **15 Interview Solutions** | Worked examples with timed mock-interview mode |
| 🧠 **Principal Engineer Thinking** | 15 themes, 8 scenarios, ADR template builder |
| 📖 **580+ Glossary Terms** | Auto-highlighted in lessons with hover/tap tooltips |
| 🌙 **Dark/Light Theme** | Respects system preference, toggleable |
| 📱 **Fully Responsive** | Works on 360px phones to ultrawide desktops |
| ♿ **Accessible** | Semantic HTML, ARIA, keyboard navigation, AA contrast |

---

## 📖 Curriculum

### Learning Paths

The curriculum is organized into **6 progressive levels**, each building on the last:

```
Beginner → Intermediate → Advanced → Distributed → Real-World → Principal
```

### Module Breakdown

| # | Module | Level | Lessons | Topics |
|---|---|---|---|---|
| 1 | **Foundations** | Beginner | 14 | Client-server, latency numbers, back-of-envelope, availability nines, SLI/SLO/SLA, monolith to microservices |
| 2 | **Networking & APIs** | Beginner | 9 | DNS, TCP/UDP, HTTP, TLS, REST/GraphQL/gRPC, WebSockets, API design, idempotency |
| 3 | **Traffic & Edge** | Beginner | 7 | Load balancing (L4/L7), CDN, rate limiting, DDoS, GeoDNS |
| 4 | **Caching** | Intermediate | 6 | Cache strategies, eviction, invalidation, failure modes, Redis vs Memcached |
| 5 | **Databases & Storage** | Intermediate | 13 | SQL/NoSQL, ACID/BASE, indexes, B-tree/LSM, replication, sharding, consistent hashing |
| 6 | **Distributed Systems** | Distributed | 13 | CAP/PACELC, consensus (Raft), distributed locks, CRDTs, Saga, unique IDs |
| 7 | **Async & Pipelines** | Distributed | 11 | Kafka, message queues, event-driven, fan-out, CDC, stream processing |
| 8 | **Search & Special Structures** | Advanced | 10 | Inverted index, Elasticsearch, tries, Bloom filters, geospatial, vector search |
| 9 | **Reliability** | Advanced | 10 | Circuit breakers, bulkheads, chaos engineering, autoscaling, disaster recovery |
| 10 | **Architecture & Platform** | Real-World | 12 | DDD, service mesh, Kubernetes, serverless, 12-factor, multi-tenancy |
| 11 | **Observability & Ops** | Advanced | 9 | Logs/metrics/traces, golden signals, CI/CD, deploy strategies, FinOps |
| 12 | **Security** | Advanced | 11 | AuthN/AuthZ, OAuth/OIDC, JWT, RBAC, encryption, OWASP Top 10, zero trust |
| 13 | **Real-time & Media** | Real-World | 8 | WebSockets at scale, WebRTC, live streaming, transcoding, offline-first sync |
| 14 | **Design Principles** | Intermediate | 4 | SOLID, KISS/YAGNI, patterns in system design, tradeoff thinking |
| 15 | **Interview & Meta** | Principal | 6 | Interview framework, estimation drills, tech decision tree |

### Every Lesson Includes

Each lesson follows a **7-part teaching template**:

1. 🔴 **The Problem** — What breaks without this?
2. 💡 **Intuition** — Everyday analogy (India-friendly)
3. ⚙️ **How It Works** — Animated diagram with Play/Pause/Step/Reset/Speed controls
4. ⚖️ **Trade-offs** — When to use, when to avoid, alternatives
5. 🏢 **Real-World** — Who uses this (with accuracy tiers: confirmed / inference / educational)
6. ⚠️ **Common Mistakes & Interview Angles**
7. 🧪 **Try It** — Link to a playground, lab, or quiz

Plus a **Simple/Deep toggle** on every lesson for progressive disclosure.

---

## 🎮 Interactive Playgrounds (27)

Each playground has **real simulation logic**, live metrics, and controls (Reset, Step, Speed):

| Playground | What You Simulate |
|---|---|
| Request Journey | Trace a web request end-to-end |
| Load Balancer | Round-robin, weighted, least-connections, consistent hashing |
| Rate Limiter | 4 algorithms side by side (fixed window, sliding window, token bucket, leaky bucket) |
| CDN Edge Map | GeoDNS and edge caching |
| Consistent Hashing Ring | Virtual nodes, key distribution, node add/remove |
| Cache Simulator | Write-through, write-back, write-around strategies |
| Replication | Leader-follower, multi-leader, quorum writes |
| Sharding | Range vs hash partitioning |
| B-tree vs LSM | Write/read amplification comparison |
| Isolation Anomalies | Dirty reads, phantom reads, serialization |
| CAP/PACELC + Quorum | Toggle consistency vs availability |
| Raft Leader Election | Term voting, heartbeats, split-brain |
| Saga vs 2PC | Distributed transaction orchestration |
| Snowflake ID | Bit layout explorer |
| Vector Clock / CRDT | Causal ordering and conflict resolution |
| Kafka | Partitions, consumer groups, offsets |
| Bloom Filter | False positive rates with tunable parameters |
| Trie Autocomplete | Prefix search with ranked suggestions |
| Geohash / Quadtree | Spatial indexing and proximity queries |
| Fan-out | Write vs read fan-out trade-offs |
| Circuit Breaker | State machine: closed → open → half-open |
| Retry + Backoff + Jitter | Retry storms vs smoothed retries |
| Autoscaling | Target-tracking with warm-up/cooldown delays |
| Chaos Monkey | Kill services, watch recovery with/without bulkheads |
| Back-of-Envelope Calculator | Quick capacity estimation |
| Availability Nines | Downtime per year at each nines level |
| Latency Chart | Log-scale latency numbers |
| Tail Latency & Fan-out | P99 amplification across parallel calls |

---

## 🧪 Code Labs (8)

Write and run code **in the browser** (executes in a Web Worker):

- **LRU Cache** — Implement a least-recently-used cache
- **Token Bucket** — Rate limiting algorithm
- **Consistent Hashing** — Hash ring with virtual nodes
- **Bloom Filter** — Probabilistic membership testing
- **Sliding Window** — Rate limiter variant
- **Snowflake ID** — Distributed unique ID generator
- **Merkle Diff** — Tree-based data synchronization
- **LSM Memtable** — Memtable flush to sorted runs

---

## 📊 Case Studies (28)

Every case study follows a **17-point structure** with animated architecture evolution:

### Starter Cases (5 evolution steps)
URL Shortener · Pastebin · Rate Limiter · Unique ID Generator · KV Store · Notification Service · Typeahead · Web Crawler

### Flagship Cases (8–10 evolution steps + interactive simulations)
Google Search · YouTube · Netflix · Uber/Ola · Zomato/Swiggy · WhatsApp · Instagram/X Feed · Amazon/Flipkart (flash sale) · UPI/PhonePe/Paytm · IRCTC/BookMyShow

### Standard Cases (5–6 evolution steps)
Dropbox/Drive · Google Maps · Zoom/Meet · Hotstar IPL · Spotify · Airbnb · Stripe · Slack/Discord · Google Docs (OT vs CRDT) · ChatGPT/LLM Serving

### Each Case Includes
- 📈 **Evolution Player** — Step through from 1-server MVP to production scale
- 🔴 **"What Breaks?"** — See metrics degrade, then apply the fix
- 🔄 **Animated Request Flows** — Follow requests through the architecture
- 💥 **Break It** — Kill components and observe failure/recovery
- 📐 **Scale Math** — Labelled as "illustrative" or "publicly disclosed"
- 🔧 **Weekend Lab** — Tech stack, milestones, pseudocode, load test plan
- 🎤 **3 Interview Twists** — Curveball follow-ups

---

## 🏋️ Practice & Projects

### Practice Arena (33 challenges)
- **Beginner (10)** · **Intermediate (11)** · **Advanced (12)**
- 3 progressive hints → full solution outline with animated diagram
- Covers estimation, data modeling, API design, scaling, and failure scenarios

### Guided Projects (24)
Each walks through **17 stages** from requirements to final review:

| Level | Projects |
|---|---|
| **Beginner** (6) | URL Shortener, Pastebin, Blog, File Upload, Auth System, Product Catalog |
| **Intermediate** (8) | E-commerce, Notification Service, Rate Limiter, Real-time Chat, Search Autocomplete, Ride Booking, Food Delivery, Ticket Booking |
| **Advanced** (10) | Video Streaming, Distributed MQ, Social Feed, Payment Platform, Job Scheduler, Multi-tenant SaaS, Real-time Analytics, Global File Storage, Large-scale Search, Recommendation System |

---

## 🎯 Interview Preparation

### 15 Worked Solutions
Full 45-minute mock interview format:
```
Clarify (5′) → Estimate (4′) → API (5′) → Data Model (5′) →
HLD (10′) → Deep Dive (10′) → Bottlenecks (3′) → Trade-offs (3′)
```

Systems covered: YouTube, Google Search, Uber, Zomato, WhatsApp, Instagram, Twitter/X, Netflix, URL Shortener, Notification Service, Payment, Distributed Cache, Ticket Booking, Rate Limiter, Google Drive

**Features:**
- 🎯 "Thinking out loud" blocks per phase
- ⏱️ Timed mock-interview mode (phases unlock sequentially)
- 📊 Animated HLD diagrams
- 📝 Notes that persist across reload

### Principal Engineer Thinking
- **15 Themes** — Architecture reviews, ADRs, tech debt, build vs buy, migration, platform engineering
- **8 Scenarios** — "Solve first, then reveal the expert walkthrough"
- **ADR Template Builder** — Generate Architecture Decision Records
- **40-item Review Checklist** — Persistent progress tracking

---

## 🏛️ Architecture

### Design Principles
- **Zero dependencies** — Vanilla HTML/CSS/JS only
- **No build step** — Open `index.html` directly from filesystem (`file://`)
- **Offline-capable** — Works after initial Google Fonts load
- **Data-driven** — All content registered via `SDA.register()` with try/catch
- **Hash routing** — Deep-linkable URLs with back button support (`#/m/caching`, `#/case/uber`)

### Core Engine (`SDA`)
- **Registry** — Modules, playgrounds, labs, cases, pages, glossary
- **Diagram Engine** — Animated node-graph diagrams with Play/Pause/Step/Reset/Speed
- **UI Kit** — Sliders, toggles, metrics, legends, steppers, tabs, quizzes, flashcards
- **Rendering** — Syntax-highlighted code blocks, callout boxes, tier chips, math formatting

### Key Technical Details
- Classic `<script>` tags (no ES modules — blocked by `file://`)
- Canvas diagrams use 2× backing store for Retina displays
- `IntersectionObserver` for scroll reveals and diagram auto-play/pause
- `localStorage` for progress persistence (`sda:v1`)
- `prefers-reduced-motion` support — diagrams become static step-by-step reveals
- Accessible: semantic HTML, ARIA roles, keyboard navigation, visible focus rings

---

## 🎨 Design System

- **Dark-first** — Navy + charcoal background, with a light theme toggle
- **Accent** — Cyan → Violet gradient
- **Typography** — Inter (body) + JetBrains Mono (code)
- **Cards** — Glass-morphism with subtle grain texture
- **Consistent legend** — Same color coding for architectural components across all diagrams:
  - 🟦 Client · 🟩 Load Balancer · 🟨 Service · 🟧 Cache · 🟥 Database · 🟪 Queue · 🟫 CDN · ⬜ External

---

## 📜 Content Accuracy

All real-world claims are tagged with an accuracy tier:

| Tier | Meaning |
|---|---|
| ✅ **Confirmed** | Backed by a public paper, blog, or talk |
| 🔍 **Inference** | Reasonable architectural inference |
| 📚 **Educational** | Simplified design made for teaching |

Numbers are labelled **"illustrative"** unless publicly disclosed. Sources are named (e.g., _MapReduce paper_, _Netflix Tech Blog_, _Uber Engineering_) — **no URLs are used** to avoid link rot.

---

## 🤝 Contributing

1. Fork the repository
2. Create content in the appropriate `js/` directory
3. Register it via `SDA.register({ kind: '...', ... })`
4. Add the `<script src>` tag above `<!-- @@NEXT-PARTS-GO-HERE@@ -->` in `index.html`
5. Run `bun tools/check.js` to validate
6. Run `python3 tools/bundle.py` to regenerate the bundle

---

## 📄 License

This project is for **educational purposes**. All architecture discussions reference publicly available information and named sources.

---

<p align="center">
  <b>System Design Playbook</b> — Zero → Principal<br>
  <i>Built with ❤️ using nothing but vanilla HTML, CSS, and JavaScript</i>
</p>
