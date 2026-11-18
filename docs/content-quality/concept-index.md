# Concept Index

This is the curriculum's initial dependency spine. An anchor is the first **dedicated lesson** for a concept, not proof that every earlier mention is already explained well. Each module map checks the actual prose, diagrams, quizzes, and links before its rewrite.

| Concept | Dedicated lesson | Earlier mention or dependency to audit |
|---|---|---|
| What system design means | `what-is-system-design` | This lesson currently names load balancers, caches and queues before explaining them. |
| Design process | `seven-step-approach` | Lesson 1 should first establish why requirements and constraints drive design. |
| Functional vs non-functional requirements | `functional-vs-nonfunctional` | Lesson 1 and the seven-step framework mention requirements. |
| Client, server and request | `client-server` | Lesson 1's scenario already uses a server and database. |
| Web request journey | `web-request-journey` | DNS, TCP and TLS receive their full explanations in Module 2. |
| Latency scale | `latency-numbers` | The request journey introduces where latency can occur. |
| Estimation and QPS | `back-of-envelope` | The seven-step framework previews estimation. |
| Vertical and horizontal scaling | `vertical-vs-horizontal` | Lesson 1's diagram adds servers before this lesson explains the choice. |
| Queueing under load | `latency-vs-throughput` | Lesson 1 names a job queue; a waiting line and a message broker are different ideas. |
| Percentiles and tail latency | `percentiles-tail-latency` | Earlier lessons may use p99 as a target before defining it. |
| Availability | `availability-nines` | Lesson 1 asks what happens when a component fails. |
| SLI, SLO, SLA and error budget | `sli-slo-sla` | Availability and measurement need to be clear first. |
| Fault tolerance and SPOFs | `fault-tolerance-spof` | Lesson 1's diagram asks about database failure. |
| Monolith and microservices | `monolith-to-microservices` | Lesson 1's mistakes and quiz distractor mention microservices. |
| IP address and DNS | `ip-and-dns` | `web-request-journey` previews DNS. |
| TCP and UDP | `tcp-vs-udp` | `web-request-journey` previews TCP. |
| HTTP versions | `http-versions` | HTTP appears in the request journey. |
| TLS and HTTPS | `https-tls` | `web-request-journey` previews TLS. |
| API styles | `rest-graphql-grpc` | `seven-step-approach` names APIs before Module 2. |
| WebSockets and SSE | `realtime-transports` | Full scale behavior comes in `websockets-at-scale`. |
| Idempotency | `idempotency-rate-limit-headers` | Reappears in delivery semantics, payments and retries. |
| Load balancing | `lb-l4-vs-l7` | Lesson 1 and scaling lessons introduce its purpose informally. |
| Load-balancing algorithms | `lb-algorithms` | Consistent hashing is taught fully in `consistent-hashing`. |
| CDN and edge caching | `cdn` | `cache-layers` revisits the cache layer distinction. |
| Rate limiting | `rate-limiting` | Rate-limit headers appear in Module 2. |
| Cache layers and TTL | `cache-layers` | CDN and browser caching are taught earlier at a basic level. |
| Cache read/write strategies | `cache-strategies` | Requires a basic database read and write path. |
| Cache eviction | `cache-eviction` | TTL and eviction are different mechanisms. |
| Cache invalidation | `cache-invalidation` | Leases and CDC receive fuller explanations later. |
| Cache failure modes | `cache-failure-modes` | Builds on expiry, invalidation and request load. |
| SQL and NoSQL families | `sql-vs-nosql` | Earlier lessons use “database” as a generic store. |
| ACID and transactions | `acid-vs-base` | `transactions-isolation` adds isolation detail. |
| Indexes | `indexes` | `inverted-index` is also a dedicated search lesson. |
| B-tree and LSM storage | `btree-vs-lsm` | Builds on indexes and write paths. |
| Isolation and MVCC | `transactions-isolation` | Builds on ACID and concurrent requests. |
| Replication | `replication` | Quorum guarantees are explained in Module 6. |
| Sharding | `sharding` | Consistent hashing follows as one placement technique. |
| Consistent hashing | `consistent-hashing` | First appears in traffic algorithms as a preview. |
| Database connection pooling | `connection-pooling` | Lesson 1 mentions connection exhaustion. |
| CAP and partitions | `cap-pacelc` | Needs partial failure from `fallacies` and replication from Module 5. |
| Consistency models | `consistency-models` | Distinguish guarantees from a user's observation. |
| Quorums | `quorums` | Leaderless replication in Module 5 may preview them. |
| Clocks and causality | `clocks` | Used later in CRDTs and conflict resolution. |
| Consensus and Raft | `consensus-raft` | Requires failures, majority and replica state. |
| Delivery semantics | `delivery-semantics` | Depends on retries and idempotency. |
| Sagas and outbox | `saga-outbox` | Depends on transactions and distributed failure. |
| CRDTs and Merkle trees | `crdts-merkle` | Requires convergence, conflicts and replication. |
| Queues, pub/sub and streams | `queues-pubsub-streams` | Lesson 1's job queue is only a simple preview. |
| Kafka | `kafka` | Should follow the queue/stream distinction. |
| Backpressure | `backpressure` | Builds on queueing under load and async consumers. |
| Fan-out | `fan-out` | Tail latency and async delivery provide different contexts. |
| CDC | `cdc` | May appear in database and caching lessons as a preview. |
| Inverted index | `inverted-index` | First appears in the database glossary/index lesson. |
| Search ranking | `bm25-ranking` | Needs the inverted index and relevance question. |
| Bloom filter | `bloom-filters` | Requires a clear false-positive example. |
| Geospatial indexing | `geospatial` | Used in ride-hailing cases and projects. |
| Vector search | `vector-search-rag` | Distinguish approximate similarity from keyword matching. |
| Timeout and retry behavior | `timeouts-retries` | Earlier idempotency lesson covers safe retry of API requests. |
| Circuit breaker | `circuit-breaker` | Requires timeout and dependency failure. |
| Load shedding | `load-shedding` | Builds on saturation and queueing from Module 1. |
| Multi-region recovery | `multi-az-region` | Builds on redundancy, failure domains and consistency. |
| Domain boundaries | `ddd-bounded-contexts` | Monolith/microservices lesson gives an earlier architecture overview. |
| Containers and Kubernetes | `docker-containers`, then `kubernetes-basics` | Kubernetes should not be required by an earlier beginner quiz. |
| Observability signals | `logs-metrics-traces` | SLI/SLO gives the measurement goal. |
| Authentication vs authorization | `authn-vs-authz` | Security examples must keep identity and permission separate. |
| OAuth and OIDC | `oauth-oidc-sso` | Requires API and token basics. |
| WebSockets at scale | `websockets-at-scale` | `realtime-transports` teaches the transport first. |
| Offline sync | `offline-first-sync` | Builds on conflicts, consistency and client state. |
| Trade-off reasoning | `tradeoff-thinking` | The lesson format asks for trade-offs throughout the curriculum. |
| Interview synthesis | `interview-framework` | Uses earlier requirements, estimates and architecture choices. |

## Open Audit Questions

- Does each earlier mention give a sufficient plain-language preview, or does it require the later lesson to understand the current one?
- Do inline quizzes test only current or prior learning, while module quizzes test the whole module?
- Does a glossary tooltip introduce a term before the lesson explains why it matters?
- Do cases and projects that deep-link directly give enough context for a reader who did not follow the recommended path?
