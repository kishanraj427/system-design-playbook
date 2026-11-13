/* =====================================================================
   PART 14 · PROJECTS — intermediate (8)
   ===================================================================== */
(function(){
const SDA = window.SDA;
const P = def => SDA.register(Object.assign({kind:'project'}, def));

P({id:'p-ecommerce', level:'intermediate', icon:'🛒', title:'E-commerce checkout', tagline:'Cart → order → payment → fulfilment, without overselling or double charging.', tags:['saga', 'inventory', 'idempotency', 'outbox'],
  req:'Build the order pipeline of an online store: cart, checkout, stock reservation, payment, order confirmation and hand-off to the warehouse, correct under retries and failures.',
  fr:['Cart per user across devices', 'Checkout reserves stock, takes payment, creates the order', 'Order status updates (confirmed, packed, shipped, delivered)', 'Cancellations and refunds'],
  nfr:['Never oversell; never charge without an order (or an automatic refund)', 'Checkout p99 under 2 s (payment gateway included)', 'Survive the failure of any one service mid-checkout', 'Sale-day peak 50× normal'],
  est:[['Orders', '200K/day; sale peak 300/s', ''], ['Carts updated', '5M/day', ''], ['Order rows', '≈ 70M/year', '200K × 365'], ['Events', '~10 per order', 'state changes']],
  entities:{code:`CREATE TABLE orders (
  id          UUID PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  status      TEXT NOT NULL,          -- PENDING | RESERVED | PAID | CONFIRMED | CANCELLED
  total_minor BIGINT NOT NULL, currency CHAR(3) NOT NULL,
  idem_key    TEXT UNIQUE NOT NULL,   -- one order per checkout attempt
  version     INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE order_items (order_id UUID REFERENCES orders(id), sku TEXT, qty INT, price_minor BIGINT, PRIMARY KEY (order_id, sku));
CREATE TABLE stock (sku TEXT PRIMARY KEY, available INT NOT NULL CHECK (available >= 0), reserved INT NOT NULL DEFAULT 0);
CREATE TABLE reservations (order_id UUID, sku TEXT, qty INT, expires_at TIMESTAMPTZ, PRIMARY KEY (order_id, sku));
CREATE TABLE outbox (id BIGSERIAL PRIMARY KEY, topic TEXT, payload JSONB, published BOOLEAN DEFAULT false);`, notes:'The CHECK constraint on stock and the conditional reservation update are what make overselling impossible.'},
  apis:{list:[['PUT /cart/items', 'Add or update a cart line'], ['POST /checkout', 'Idempotency-Key; reserve → pay → confirm'], ['GET /orders/{id}', 'Order with status timeline'], ['POST /orders/{id}/cancel', 'Cancel and refund if allowed']], code:`async function reserve(tx, orderId: string, items: Item[]) {
  for (const it of items) {
    const r = await tx.query(
      'UPDATE stock SET available = available - $2, reserved = reserved + $2 WHERE sku = $1 AND available >= $2',
      [it.sku, it.qty]);
    if (r.rowCount === 0) throw new OutOfStock(it.sku);                // whole transaction rolls back
    await tx.query("INSERT INTO reservations VALUES ($1,$2,$3, now() + interval '15 minutes')", [orderId, it.sku, it.qty]);
  }
}`},
  hld:{text:'Checkout is a saga: reserve stock, take payment, confirm. Each step is a local transaction that publishes an event through an outbox; failures trigger compensations (release stock, refund).',
    diagram:{n:[['u', 'client', 'Shopper', '', 0, 1], ['gw', 'lb', 'Gateway', '', 1, 1], ['order', 'service', 'Order service', 'saga', 2, 1], ['inv', 'service', 'Inventory', 'reservations', 3, 0], ['pay', 'service', 'Payments', 'idempotent', 3, 2], ['bus', 'queue', 'Event bus', 'outbox relay', 4, 1], ['wh', 'service', 'Fulfilment', 'warehouse', 4, 2]], e:'u>gw gw>order order>inv order>pay order>bus bus>wh inv>bus~0.25', f:[['Checkout creates the order and reserves stock.', 'u>gw:POST /checkout|gw>order|order>inv:reserve'], ['Payment is charged with the order id as the idempotency key.', 'order>pay:charge'], ['The order is confirmed and fulfilment is told via the event bus.', 'order>bus:order.confirmed|bus>wh']]}},
  components:[['Cart service', 'Cart storage (highly available KV)'], ['Order service', 'Saga orchestration, order state machine'], ['Inventory', 'Atomic reservations and releases, expiry sweeper'], ['Payments', 'Gateway integration, idempotency, refunds'], ['Outbox relay', 'Publishes committed events to the bus'], ['Fulfilment', 'Consumes confirmed orders']],
  tech:[['Postgres per service', 'Transactions where invariants live'], ['Kafka', 'Durable events between services'], ['Redis/DynamoDB for carts', 'Always-writable carts'], ['Temporal-style workflows (optional)', 'Durable saga state and retries']],
  tradeoffs:[['Orchestrated saga', 'Clear flow, easy to monitor', 'Central coordinator to run'], ['Reservation with expiry', 'Abandoned checkouts free stock', 'Brief “out of stock” while reservations expire'], ['Outbox pattern', 'No lost or phantom events', 'Relay process and duplicate handling']],
  v1:{text:'v1 is a single service and database: one transaction reserves stock and creates the order; payment is called after commit; a sweeper releases unpaid orders after 15 minutes.', code:`app.post('/checkout', auth, async (req, res) => {
  const key = req.get('Idempotency-Key'); if (!key) return res.status(400).end();
  const existing = await db.oneOrNone('SELECT id, status FROM orders WHERE idem_key=$1', [key]);
  if (existing) return res.json(existing);
  const cart = await carts.get(req.user.id);
  const order = await db.tx(async tx => {
    const o = await tx.one("INSERT INTO orders(id,user_id,status,total_minor,currency,idem_key) VALUES (gen_random_uuid(),$1,'RESERVED',$2,'INR',$3) RETURNING id",
      [req.user.id, cart.total, key]);
    await reserve(tx, o.id, cart.items);
    return o;
  });
  const paid = await payments.charge({ orderId: order.id, amount: cart.total, idempotencyKey: order.id });
  await db.none("UPDATE orders SET status=$2 WHERE id=$1", [order.id, paid.ok ? 'CONFIRMED' : 'CANCELLED']);
  if (!paid.ok) await releaseReservations(order.id);
  res.json({ id: order.id, status: paid.ok ? 'CONFIRMED' : 'CANCELLED' });
});`},
  bottlenecks:['Hot SKUs during sales: one stock row serialises all buyers', 'Synchronous payment call holds request threads for seconds', 'Crash between charge and status update leaves orders unknown'],
  scaling:[['Hot stock rows', 'Atomic counter in Redis as a gate for flash-sale SKUs; reconcile to the DB'], ['Slow payments', 'Async: return PENDING, confirm via webhook/event'], ['Unknown states', 'Saga with persisted state; reconciliation job queries the gateway'], ['Sale peaks', 'Waiting room and queue-based order creation']],
  improvements:['Split services (cart, order, inventory, payment) with event-driven communication', 'Fraud scoring before payment', 'Partial fulfilment and split shipments', 'Promotions engine'],
  failures:[['Payment gateway timeout', 'Order stays PENDING; reconciliation resolves; no second charge thanks to the idempotency key'], ['Inventory down', 'Checkout returns 503; carts unaffected'], ['Event bus down', 'Outbox rows wait; relay publishes when it recovers']],
  observability:{metrics:['Checkout success rate by failure reason', 'Orders by status age (stuck PENDING)', 'Reservation expiries', 'Payment latency and errors'], alerts:['Checkout success < 95%', 'PENDING older than 30 min > 0.1%', 'Outbox backlog growing'], dash:'Funnel (cart → checkout → paid), stuck orders, stock reservations.'},
  review:['Oversell impossible by constraint: ✓', 'Idempotent checkout and payment: ✓', 'Compensations for every step: ✓', 'Next: flash-sale gate and queue (see the Amazon case)'],
  refs:['case:amazon', 'l:saga-outbox', 'l:idempotency-rate-limit-headers', 'pg:saga-2pc']});
P({id:'p-notifications', level:'intermediate', icon:'🔔', title:'Notification service', tagline:'Push, SMS, email and in-app, prioritised, deduplicated and respectful.', tags:['queues', 'priorities', 'preferences', 'providers'],
  req:'Build a central notification service that other teams call to notify users by push, SMS, email or in-app, honouring preferences and quiet hours, deduplicating, and failing over between providers.',
  fr:['Send a notification by template to a user or a segment', 'Channel choice from user preferences', 'Priority levels: OTP/transactional before marketing', 'Delivery tracking and in-app inbox'],
  nfr:['OTPs delivered in seconds, even during marketing blasts', 'No duplicates from retries', 'Survive a provider outage', '100M notifications/day'],
  est:[['Notifications', '100M/day ≈ 1.2K/s avg, 50K/s campaign peaks', ''], ['OTPs', '≈ 300/s peak', 'small but critical'], ['Delivery events', '≈ 3 per notification', 'sent, delivered, opened'], ['Inbox storage', '≈ 30 GB/month', '100M × 300 B']],
  entities:{code:`CREATE TABLE notifications (
  id           UUID PRIMARY KEY,
  user_id      BIGINT NOT NULL,
  template     TEXT NOT NULL,
  params       JSONB,
  priority     SMALLINT NOT NULL,         -- 0 = OTP, 1 = transactional, 2 = marketing
  dedupe_key   TEXT,                       -- e.g. 'order-shipped:81723'
  status       TEXT NOT NULL DEFAULT 'queued',
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);
CREATE TABLE deliveries (notification_id UUID, channel TEXT, provider TEXT, status TEXT, provider_msg_id TEXT, updated_at TIMESTAMPTZ, PRIMARY KEY (notification_id, channel));
CREATE TABLE preferences (user_id BIGINT PRIMARY KEY, channels JSONB, quiet_start TIME, quiet_end TIME, tz TEXT, marketing_opt_in BOOLEAN);`, notes:'The unique (user_id, dedupe_key) makes repeated requests from callers harmless.'},
  apis:{list:[['POST /v1/notify', '{user_id, template, params, priority, dedupe_key}'], ['POST /v1/campaigns', 'Segment send (batched internally)'], ['GET /v1/users/{id}/inbox', 'In-app inbox'], ['POST /webhooks/{provider}', 'Delivery receipts']], code:`app.post('/v1/notify', serviceAuth, async (req, res) => {
  const n = req.body;
  const r = await db.query(\`INSERT INTO notifications(id,user_id,template,params,priority,dedupe_key)
     VALUES (gen_random_uuid(),$1,$2,$3,$4,$5) ON CONFLICT (user_id, dedupe_key) DO NOTHING RETURNING id\`,
     [n.user_id, n.template, n.params, n.priority, n.dedupe_key]);
  if (!r.rowCount) return res.status(200).json({ duplicate: true });
  await queues[n.priority === 0 ? 'otp' : n.priority === 1 ? 'transactional' : 'bulk'].send({ id: r.rows[0].id });
  res.status(202).json({ id: r.rows[0].id });
});`},
  hld:{text:'Requests are validated, deduplicated and routed to priority queues; channel workers apply preferences and quiet hours, render templates and send via providers with failover; receipts update delivery status.',
    diagram:{n:[['svc', 'client', 'Calling services', '', 0, 1], ['api', 'service', 'Notify API', 'dedupe', 1, 1], ['db', 'db', 'Notifications DB', '', 1, 2], ['qp', 'queue', 'OTP queue', 'priority', 2, 0], ['qb', 'queue', 'Bulk queue', '', 2, 2], ['w', 'service', 'Channel workers', 'prefs · templates', 3, 1], ['prov', 'ext', 'Providers', 'APNs/FCM/SMS/email', 4, 1]], e:'svc>api api>db api>qp api>qb qp>w qb>w w>prov prov>db~0.4', f:[['A caller requests an OTP; it is deduplicated and placed on the priority queue.', 'svc>api:OTP for user 42|api>db|api>qp'], ['A worker sends it via the healthiest SMS provider; the receipt updates status.', 'qp>w|w>prov:send|prov>db:delivered']]}},
  components:[['Notify API', 'Validation, dedupe, routing to queues'], ['Priority queues', 'Isolate OTPs from marketing blasts'], ['Channel workers', 'Preferences, quiet hours, rendering, rate limits per provider'], ['Provider adapters', 'APNs, FCM, SMS gateways, email; health scoring and failover'], ['Receipt handler', 'Delivery status, retries, bounces']],
  tech:[['Postgres', 'Dedupe constraint and audit'], ['Kafka/SQS with separate queues', 'Priority isolation and backpressure'], ['Redis', 'Rate limits and provider health'], ['Template engine with localisation', 'Consistent content in many languages']],
  tradeoffs:[['Separate queues per priority', 'OTPs never wait behind campaigns', 'More queues and workers to run'], ['Caller-supplied dedupe keys', 'Simple exactly-once-ish behaviour', 'Callers must choose good keys'], ['Multi-provider failover', 'Survives outages', 'Integration and cost']],
  v1:{text:'v1: a single worker reads one queue and sends via one provider per channel, with a retry count.', code:`consumer.on('message', async ({ id }) => {
  const n = await notifications.get(id);
  const prefs = await preferences.get(n.user_id);
  if (n.priority === 2 && (!prefs.marketing_opt_in || inQuietHours(prefs))) return notifications.mark(id, 'skipped');
  const channel = pickChannel(n, prefs);                         // push if token present, else SMS/email
  try {
    const msgId = await providers[channel].send(render(n.template, n.params, prefs.locale));
    await deliveries.upsert(id, channel, 'sent', msgId);
  } catch (e) {
    if (n.attempts < 5) return consumer.retryLater(id, backoffMs(n.attempts));   // exponential + jitter
    await notifications.mark(id, 'failed');
  }
});`},
  bottlenecks:['Campaigns starve OTPs in a single queue', 'One provider outage stops a whole channel', 'Retries without dedupe send duplicates'],
  scaling:[['Priority', 'Separate queues and worker pools per priority'], ['Provider limits', 'Token bucket per provider; spread across providers'], ['Campaigns', 'Batch segment expansion; throttle per region and time zone'], ['Inbox reads', 'Partition inbox by user; cache recent items']],
  improvements:['Digesting (combine 10 likes into one notification)', 'Send-time optimisation per user', 'User-level frequency caps across all teams', 'WhatsApp and RCS channels'],
  failures:[['SMS provider outage', 'Health score drops; route OTPs to the backup provider within seconds'], ['Queue backlog', 'Shed marketing first; OTP queue unaffected'], ['Template error', 'Validate templates at publish time; fail one notification type, not the service']],
  observability:{metrics:['Time from request to provider accept, per priority', 'Delivery rate per provider and channel', 'Queue depth and age per priority', 'Duplicate rejections'], alerts:['OTP p95 delivery > 10 s', 'Provider error rate > 5%', 'Bulk queue age > 1 h'], dash:'Per-priority latency, provider health, campaign progress.'},
  review:['Priority isolation: ✓', 'Dedupe at the source: ✓', 'Provider failover: ✓', 'Next: global frequency caps so users aren’t spammed by many teams'],
  refs:['case:notification-service', 'l:push-notifications', 'l:ordering-dlq']});
P({id:'p-rate-limiter', level:'intermediate', icon:'🚦', title:'Rate limiter', tagline:'Protect APIs per user, key and IP, across many servers.', tags:['token bucket', 'redis', 'lua', 'distributed'],
  req:'Build a rate-limiting service for a public API: limits per API key, per user and per IP, with different plans, enforced consistently across 50 API servers with minimal added latency.',
  fr:['Configurable rules: N requests per window per key/user/IP/route', 'Burst allowance', 'Standard headers (limit, remaining, reset) and 429 responses', 'Rule changes without deploys'],
  nfr:['Added latency under 2 ms p99', 'Limits accurate within a few percent across servers', 'Fail open or closed by rule if the limiter store is down', '500K checks/s'],
  est:[['Checks', '500K/s', 'every API request'], ['Keys tracked', '≈ 10M active', 'API keys + users + IPs'], ['Memory', '≈ 1 GB', '10M × ~100 B'], ['Redis ops', '500K/s', 'one EVAL per check, sharded']],
  entities:{code:`-- Rules (Postgres, cached in every API server)
CREATE TABLE rate_rules (
  id        SERIAL PRIMARY KEY,
  scope     TEXT NOT NULL,          -- 'api_key' | 'user' | 'ip'
  route     TEXT NOT NULL DEFAULT '*',
  plan      TEXT,                   -- 'free' | 'pro' | NULL (all)
  capacity  INT NOT NULL,           -- bucket size (burst)
  refill_per_sec NUMERIC NOT NULL,
  fail_mode TEXT NOT NULL DEFAULT 'open'
);
-- State (Redis): rl:{scope}:{id}:{rule} → hash {tokens, ts}   TTL = time to refill fully`, notes:'Rules are small and read-only on the hot path; bucket state lives in Redis and expires on its own.'},
  apis:{list:[['Middleware check(key, route)', 'Returns allow + remaining + reset'], ['GET /admin/rules', 'List rules'], ['PUT /admin/rules/{id}', 'Change a rule (pushed to servers)']], code:`const TOKEN_BUCKET = \`
local tokens, ts = unpack(redis.call('HMGET', KEYS[1], 't', 'ts'))
local cap, rate, now = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
tokens = tonumber(tokens) or cap; ts = tonumber(ts) or now
tokens = math.min(cap, tokens + (now - ts) / 1000 * rate)
local allowed = tokens >= 1 and 1 or 0
if allowed == 1 then tokens = tokens - 1 end
redis.call('HSET', KEYS[1], 't', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(cap / rate * 1000))
return { allowed, math.floor(tokens) }\`;`},
  hld:{text:'API servers call the limiter as middleware; bucket state is in a sharded Redis cluster updated atomically by a Lua script; rules are cached locally and refreshed on change.',
    diagram:{n:[['c', 'client', 'API client', '', 0, 1], ['api', 'service', 'API servers', 'limiter middleware', 1, 1], ['redis', 'cache', 'Redis cluster', 'buckets (Lua)', 2, 0], ['rules', 'db', 'Rules DB', '', 2, 2], ['svc', 'service', 'Backend', '', 3, 1]], e:'c>api api>redis api>rules api>svc', f:[['Each request runs one atomic bucket update in Redis.', 'c>api:GET /v1/data|api>redis:EVAL token bucket'], ['Allowed requests continue; others get 429 with Retry-After.', 'api>svc:allowed']]}},
  components:[['Limiter middleware', 'Builds keys, evaluates rules, sets headers'], ['Redis cluster', 'Atomic bucket state, sharded by key'], ['Rules store', 'Rules with plan overrides, cached locally'], ['Admin API', 'Manage rules; audit changes']],
  tech:[['Token bucket', 'Allows bursts, smooth average rate'], ['Redis + Lua', 'Atomic read-modify-write in one round trip'], ['Local rule cache', 'No DB access on the hot path'], ['Standard RateLimit headers', 'Clients can back off politely']],
  tradeoffs:[['Central Redis', 'Accurate across servers', 'A network hop per request'], ['Local-only buckets', 'Zero latency', 'Limit × servers effective rate'], ['Fail open', 'API stays up if Redis fails', 'Temporarily unprotected']],
  v1:{text:'v1 uses in-memory fixed windows per server, which is good enough for one or two servers.', code:`const windows = new Map<string, { start: number; count: number }>();
export function allow(key: string, limit = 100, windowMs = 60_000) {
  const now = Date.now(); const w = windows.get(key);
  if (!w || now - w.start >= windowMs) { windows.set(key, { start: now, count: 1 }); return true; }
  if (w.count >= limit) return false;
  w.count++; return true;
}
// problem: up to 2× limit at window boundaries, and each server counts separately`},
  bottlenecks:['Per-server counters multiply the effective limit by the number of servers', 'Fixed windows allow 2× bursts at the boundary', 'One hot key (a big customer) concentrates on one Redis shard'],
  scaling:[['Consistency across servers', 'Central Redis buckets with Lua'], ['Boundary bursts', 'Token bucket or sliding-window counters'], ['Hot keys', 'Local pre-allocation of tokens in small batches for very high-rate keys'], ['Latency', 'Pipeline checks; place Redis in the same zone']],
  improvements:['Cost-based limits (expensive endpoints cost more tokens)', 'Global multi-region quotas (see the practice challenge)', 'Adaptive limits under overload', 'Per-tenant dashboards'],
  failures:[['Redis down', 'Per-rule fail mode: open with local fallback limits, or closed for sensitive endpoints'], ['Rule misconfiguration', 'Validate rules; staged rollout; instant revert'], ['Clock skew', 'Use Redis TIME or server-sent timestamps consistently']],
  observability:{metrics:['Checks/s and 429 rate by rule', 'Limiter latency p99', 'Redis CPU per shard', 'Fail-open events'], alerts:['Limiter p99 > 5 ms', '429 rate spike for a plan', 'Fail-open active'], dash:'Top limited keys, latency, Redis health.'},
  review:['Atomic and consistent across servers: ✓', 'Bursty clients handled by token bucket: ✓', 'Fail modes defined per rule: ✓', 'Next: cost-based and adaptive limits'],
  refs:['case:rate-limiter', 'l:rate-limiting', 'pg:rate-limiter', 'lab:token-bucket']});
P({id:'p-chat', level:'intermediate', icon:'💬', title:'Real-time chat', tagline:'1:1 and group chat with delivery receipts, history and presence.', tags:['websockets', 'fan-out', 'ordering', 'presence'],
  req:'Build a chat app: 1:1 and group conversations (up to 500 members), real-time delivery, delivered/read receipts, history on all devices, typing indicators and online presence.',
  fr:['Send and receive messages in real time', 'Groups up to 500 members', 'Delivered and read receipts', 'History synced across devices', 'Presence and typing'],
  nfr:['Delivery to online recipients under 300 ms', 'No lost or duplicated messages; per-conversation order', '5M concurrent connections', 'Works on flaky mobile networks'],
  est:[['Concurrent users', '5M', ''], ['Messages', '500M/day ≈ 6K/s, peak 30K/s', ''], ['Group fan-out', '≈ 5× average', 'deliveries ≈ 150K/s peak'], ['Storage', '≈ 100 GB/day', '500M × 200 B']],
  entities:{code:`CREATE TABLE conversations (id BIGINT PRIMARY KEY, kind TEXT, title TEXT, created_at TIMESTAMPTZ);
CREATE TABLE members (conversation_id BIGINT, user_id BIGINT, last_read_seq BIGINT DEFAULT 0, PRIMARY KEY (conversation_id, user_id));
-- Messages: wide-column store, partitioned by conversation
-- messages(conversation_id, seq, msg_id, sender_id, body, created_at)
--   PRIMARY KEY ((conversation_id), seq)   -- seq assigned per conversation
-- Presence (Redis): online:{user} → gateway id, TTL 60 s`, notes:'A per-conversation sequence number gives order and lets devices sync “everything after seq X”.'},
  apis:{list:[['WS send {conversation, client_msg_id, body}', 'Server assigns seq, acks'], ['WS event message / receipt / typing', 'Pushed to members'], ['GET /conversations/{id}/messages?after_seq=', 'History sync'], ['POST /conversations/{id}/read {seq}', 'Read receipt']], code:`ws.on('send', async (m: { conversationId: number; clientMsgId: string; body: string }) => {
  const seq = await seqAllocator.next(m.conversationId);                    // per-conversation counter
  const saved = await messages.insertIfAbsent({ ...m, seq, senderId: user.id }); // idempotent by clientMsgId
  ws.send({ type: 'ack', clientMsgId: m.clientMsgId, seq: saved.seq });
  for (const member of await members.of(m.conversationId)) {
    const gw = await presence.gatewayOf(member);
    if (gw) bus.publish(gw, { type: 'message', ...saved }); else push.notify(member, saved);
  }
});`},
  hld:{text:'Clients keep a WebSocket to a gateway; a chat service stores messages with per-conversation sequence numbers and fans them out to members’ gateways via pub/sub; offline members get push notifications and sync history on reconnect.',
    diagram:{n:[['a', 'client', 'Sender', '', 0, 0], ['b', 'client', 'Recipient', '', 0, 2], ['gw', 'service', 'WS gateways', '', 1, 1], ['chat', 'service', 'Chat service', 'seq + store', 2, 1], ['store', 'db', 'Message store', 'by conversation', 3, 2], ['pres', 'cache', 'Presence', 'user → gateway', 3, 0], ['bus', 'queue', 'Pub/sub', 'gateway channels', 2, 0], ['push', 'ext', 'Push (APNs/FCM)', '', 4, 1]], e:'a>gw b>gw gw>chat chat>store chat>pres chat>bus bus>gw chat>push', f:[['The sender’s message gets a sequence number, is stored, and acked.', 'a>gw:send|gw>chat|chat>store:seq 812|chat>gw:ack'], ['The chat service finds members’ gateways and publishes; offline members get a push.', 'chat>pres|chat>bus|bus>gw|gw>b:message|chat>push']]}},
  components:[['Gateways', 'Hold WebSockets, auth, heartbeats, forward events'], ['Chat service', 'Sequence numbers, persistence, fan-out'], ['Message store', 'Append-only history per conversation'], ['Presence', 'Online status and gateway location'], ['Push service', 'Notifications for offline users']],
  tech:[['WebSockets', 'Bidirectional, low latency'], ['Cassandra/ScyllaDB', 'Write-heavy, partition by conversation'], ['Redis pub/sub or NATS', 'Route events to gateways'], ['Redis', 'Presence with TTL heartbeats']],
  tradeoffs:[['Server-assigned seq per conversation', 'Clear order and easy sync', 'A sequencer per conversation (hot groups)'], ['Store then deliver', 'No loss on crash', 'A write before every delivery'], ['Presence with TTL', 'Self-healing', 'Up to TTL seconds stale']],
  v1:{text:'v1: one Node server with Socket.IO rooms per conversation and Postgres for history.', code:`io.on('connection', socket => {
  socket.on('join', async (conversationId: number) => {
    if (!(await members.isMember(conversationId, socket.data.userId))) return;
    socket.join(\`c:\${conversationId}\`);
  });
  socket.on('send', async ({ conversationId, clientMsgId, body }) => {
    const m = await db.one(\`INSERT INTO messages(conversation_id, client_msg_id, sender_id, body)
      VALUES ($1,$2,$3,$4) ON CONFLICT (conversation_id, client_msg_id) DO UPDATE SET body = messages.body
      RETURNING id, created_at\`, [conversationId, clientMsgId, socket.data.userId, body]);
    io.to(\`c:\${conversationId}\`).emit('message', { conversationId, id: m.id, body, from: socket.data.userId });
  });
});`},
  bottlenecks:['One server holds all sockets and rooms', 'Postgres write rate and table size for history', 'Group fan-out on the send path'],
  scaling:[['Connections', 'Many gateways; presence maps users to gateways'], ['History', 'Wide-column store partitioned by conversation (+ time bucket)'], ['Fan-out', 'Async fan-out workers; large groups via pub/sub topics'], ['Reconnect storms', 'Jittered reconnects; resume from last seq']],
  improvements:['End-to-end encryption (see the WhatsApp case)', 'Media messages via object storage', 'Message search', 'Multi-device with per-device delivery state'],
  failures:[['Gateway crash', 'Clients reconnect elsewhere and sync after their last seq'], ['Message store slow', 'Back-pressure senders; never ack before storing'], ['Pub/sub partition', 'Recipients miss live events but catch up on sync']],
  observability:{metrics:['End-to-end delivery latency', 'Connected sockets per gateway', 'Ack latency', 'Reconnect rate', 'Undelivered message age'], alerts:['Delivery p99 > 1 s', 'Reconnect spike', 'Store write errors'], dash:'Connections, message rate, latency, fan-out backlog.'},
  review:['Durable before acked; idempotent by client id: ✓', 'Ordered per conversation; sync by seq: ✓', 'Offline path via push + sync: ✓', 'Next: E2EE and huge groups'],
  refs:['case:whatsapp', 'case:discord', 'l:websockets-at-scale', 'l:presence']});
P({id:'p-autocomplete', level:'intermediate', icon:'⌨️', title:'Search autocomplete', tagline:'Top suggestions for every prefix in under 50 ms.', tags:['trie', 'top-k', 'caching', 'streaming'],
  req:'Build search-as-you-type for an e-commerce site: as users type, show the 8 most popular matching queries and products, personalised lightly, updated as trends change.',
  fr:['Suggestions for each keystroke (prefix)', 'Rank by popularity, with recency boost', 'Typo tolerance for short prefixes', 'Filter offensive suggestions'],
  nfr:['p99 under 50 ms including network', '100K suggestion requests/s at peak', 'Trending terms appear within minutes', 'Graceful degradation to cached top prefixes'],
  est:[['Requests', '100K/s peak', '~6 keystrokes per search'], ['Distinct queries', '50M', ''], ['Prefixes with top-8 lists', '≈ 200M', 'cap prefix length at 20'], ['Memory', '≈ 30 GB', 'top-8 ids per prefix, sharded']],
  entities:{code:`-- Query log (append-only, for aggregation)
CREATE TABLE query_log (q TEXT, user_id BIGINT, ts TIMESTAMPTZ, results INT);
-- Aggregated counts (hourly job)
CREATE TABLE query_counts (q TEXT PRIMARY KEY, count_7d BIGINT, count_1h BIGINT, blocked BOOLEAN DEFAULT false);
-- Serving structure (in memory / KV): prefix → [top 8 (q, score)]
--   e.g.  "iph" → ["iphone 15", "iphone 15 cover", "iphone charger", …]`, notes:'Precompute top-k per prefix offline; serving is a single key lookup.'},
  apis:{list:[['GET /suggest?q=iph', 'Top 8 suggestions'], ['POST /events/search', 'Log the final query (async)']], code:`app.get('/suggest', async (req, res) => {
  const prefix = normalise(String(req.query.q ?? '')).slice(0, 20);
  if (prefix.length < 1) return res.json([]);
  const list = (await topk.get(prefix)) ?? (await topk.get(prefix.slice(0, -1))) ?? [];   // fallback to shorter prefix
  res.set('Cache-Control', 'public, max-age=60').json(list.slice(0, 8));
});`},
  hld:{text:'An offline pipeline aggregates the query log into top-k lists per prefix and loads them into a sharded in-memory store; a streaming job adds trending boosts; responses are cached at the CDN by prefix.',
    diagram:{n:[['u', 'client', 'Search box', '', 0, 1], ['cdn', 'cdn', 'CDN', 'cache by prefix', 1, 1], ['api', 'service', 'Suggest API', '', 2, 1], ['kv', 'cache', 'Top-k store', 'sharded by prefix', 3, 1], ['log', 'queue', 'Query log', '', 2, 2], ['batch', 'service', 'Builder', 'hourly + trending', 3, 2]], e:'u>cdn cdn>api api>kv u>log~0.35 log>batch batch>kv', f:[['A keystroke is served from the CDN or the top-k store.', 'u>cdn:GET /suggest?q=iph|cdn>api:miss|api>kv'], ['Completed searches feed the builder that refreshes lists.', 'u>log:search event|log>batch|batch>kv:reload']]}},
  components:[['Suggest API', 'Normalise, lookup, fallback, filter'], ['Top-k store', 'prefix → precomputed list, in memory'], ['Builder', 'Aggregates counts, builds lists, applies blocklist'], ['Trending job', 'Recent counts boost'], ['CDN', 'Caches popular prefixes']],
  tech:[['Precomputed prefix lists in Redis/in-process', 'O(1) lookups'], ['Spark/SQL batch', 'Hourly aggregation'], ['Stream processor', 'Minute-level trending'], ['Debounce on client', 'Fewer requests per word']],
  tradeoffs:[['Precompute top-k per prefix', 'Fast, simple serving', 'Large memory; rebuild latency'], ['Live trie with counts', 'Always fresh', 'Complex concurrency and memory'], ['CDN caching', 'Absorbs common prefixes', 'Per-user personalisation limited']],
  v1:{text:'v1 builds an in-memory trie from the top 1M queries at startup and walks it per request.', code:`class Node { children = new Map<string, Node>(); top: [string, number][] = []; }
const root = new Node();
export function insert(q: string, count: number) {
  let n = root;
  for (const ch of q) {
    n = n.children.get(ch) ?? (n.children.set(ch, new Node()), n.children.get(ch)!);
    n.top.push([q, count]); n.top.sort((a, b) => b[1] - a[1]); if (n.top.length > 8) n.top.pop();   // keep top 8 per node
  }
}
export const suggest = (p: string) => { let n: Node | undefined = root; for (const ch of p) n = n?.children.get(ch); return n?.top.map(t => t[0]) ?? []; };`},
  bottlenecks:['Trie rebuild requires a restart', 'One server’s memory limits the vocabulary', 'Keystroke traffic is 6× search traffic'],
  scaling:[['Memory', 'Shard by prefix (first two characters) across nodes'], ['Freshness', 'Build new versions offline and swap atomically; trending overlay from a stream'], ['Traffic', 'Client debounce (100 ms), CDN caching, browser cache'], ['Typos', 'Fuzzy match for prefixes ≥ 4 chars with an edit-distance index']],
  improvements:['Light personalisation (re-rank with user’s categories)', 'Product thumbnails in suggestions', 'Language/transliteration support', 'Offensive-content filtering with human review'],
  failures:[['Top-k store down', 'Serve CDN-cached lists for common prefixes; empty list otherwise'], ['Builder fails', 'Keep serving the previous version'], ['Bad suggestion trending', 'Blocklist applied at serve time instantly']],
  observability:{metrics:['Suggest latency p99', 'CDN hit ratio', 'Suggestion click-through rate', 'Build freshness'], alerts:['p99 > 80 ms', 'Build older than 3 h', 'CTR drop after deploy'], dash:'Latency, freshness, CTR by prefix length.'},
  review:['Single-lookup serving: ✓', 'Fresh enough via hourly + trending: ✓', 'Safe: blocklist at serve time: ✓', 'Next: personalisation within the latency budget'],
  refs:['case:typeahead', 'l:tries-autocomplete', 'pg:trie', 'l:hll-cms']});
P({id:'p-ride-booking', level:'intermediate', icon:'🚖', title:'Ride booking', tagline:'Match riders with nearby drivers and track the trip.', tags:['geospatial', 'matching', 'state machine', 'websockets'],
  req:'Build a ride-booking backend for one country: drivers share locations, riders request rides, the system matches the nearest suitable driver, tracks the trip live and charges at the end.',
  fr:['Driver location updates and availability', 'Rider requests a ride with pickup/drop', 'Matching and offer/accept flow', 'Live tracking and trip completion with fare'],
  nfr:['Match within 10 s', 'Never assign one driver to two trips', 'Location updates every 4 s from 200K drivers', 'Trip state survives server crashes'],
  est:[['Drivers online', '200K', ''], ['Location updates', '50K/s', '200K ÷ 4 s'], ['Ride requests', '100/s peak', ''], ['Trips', '3M/day', '']],
  entities:{code:`CREATE TABLE trips (
  id         UUID PRIMARY KEY,
  rider_id   BIGINT NOT NULL,
  driver_id  BIGINT,
  status     TEXT NOT NULL,     -- REQUESTED | ACCEPTED | ARRIVED | ON_TRIP | COMPLETED | CANCELLED
  version    INT NOT NULL DEFAULT 0,
  pickup     GEOGRAPHY(Point), dropoff GEOGRAPHY(Point),
  fare_minor BIGINT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX one_active_trip_per_driver ON trips(driver_id)
  WHERE status IN ('ACCEPTED', 'ARRIVED', 'ON_TRIP');
-- Live locations (Redis GEO): GEOADD drivers:free lng lat driver_id`, notes:'The partial unique index guarantees a driver can’t hold two active trips, whatever the race.'},
  apis:{list:[['POST /driver/location', 'Batched GPS points'], ['POST /trips', 'Rider requests a ride'], ['WS offer → driver', 'Offer with 15 s timeout'], ['POST /trips/{id}/accept', 'Driver accepts (conditional update)'], ['POST /trips/{id}/complete', 'End trip, compute fare']], code:`app.post('/trips/:id/accept', driverAuth, async (req, res) => {
  try {
    const r = await db.query(\`UPDATE trips SET driver_id=$2, status='ACCEPTED', version=version+1
                               WHERE id=$1 AND status='REQUESTED'\`, [req.params.id, req.driver.id]);
    if (!r.rowCount) return res.status(409).json({ error: 'trip no longer available' });
  } catch (e) { if (isUniqueViolation(e)) return res.status(409).json({ error: 'driver busy' }); throw e; }
  await redis.zrem('drivers:free', String(req.driver.id));
  push.toRider(req.params.id, { type: 'driver_assigned', driverId: req.driver.id });
  res.json({ ok: true });
});`},
  hld:{text:'Locations go to a geo index in memory; a matcher queries nearby free drivers and offers trips over WebSockets; trips are a versioned state machine in Postgres.',
    diagram:{n:[['r', 'client', 'Rider', '', 0, 0], ['d', 'client', 'Driver', '', 0, 2], ['api', 'service', 'Trip API', '', 1, 1], ['ws', 'service', 'Realtime gateway', '', 1, 2], ['geo', 'cache', 'Geo index', 'Redis GEO', 2, 2], ['match', 'service', 'Matcher', '', 2, 0], ['db', 'db', 'Trips DB', 'state machine', 3, 1]], e:'r>api d>ws api>match match>geo ws>geo match>ws api>db', f:[['Drivers stream locations into the geo index.', 'd>ws:GPS|ws>geo:GEOADD'], ['A request triggers matching: nearest free drivers are offered the trip.', 'r>api:request|api>match|match>geo:GEOSEARCH 3 km|match>ws:offer|ws>d'], ['The driver accepts with a conditional update.', 'd>ws:accept|ws>geo:remove from free|api>db:ACCEPTED']]}},
  components:[['Location ingest', 'Validate, throttle and store latest positions'], ['Geo index', 'Nearest-free-driver queries'], ['Matcher', 'Candidate ranking, offers, timeouts'], ['Trip API', 'State machine transitions, fares'], ['Realtime gateway', 'Offers to drivers, updates to riders']],
  tech:[['Redis GEO', 'In-memory radius queries'], ['Postgres + PostGIS', 'Trips, history, geography types'], ['WebSockets', 'Offers and live tracking'], ['Routing engine (OSRM-style)', 'Road ETAs for ranking']],
  tradeoffs:[['Nearest by straight line', 'Fast and simple', 'Ignores roads and rivers (use ETAs for top candidates)'], ['Sequential offers', 'Fair, simple', 'Slower than broadcasting to several drivers'], ['Partial unique index', 'Correctness by the database', 'Retries on conflicts']],
  v1:{text:'v1: Redis GEO for free drivers, greedy nearest matching, sequential offers with a 15 s timeout.', code:`async function match(trip: Trip) {
  const candidates = await redis.geosearch('drivers:free', 'FROMLONLAT', trip.pickup.lng, trip.pickup.lat, 'BYRADIUS', 3, 'km', 'ASC', 'COUNT', 5);
  for (const driverId of candidates) {
    const accepted = await offer(driverId, trip, 15_000);          // resolves false on timeout/decline
    if (accepted) return driverId;
  }
  await trips.markNoDrivers(trip.id);
  return null;
}`},
  bottlenecks:['Location writes concentrated in dense city centres', 'Greedy matching gives poor global pickup times at peak', 'Single Redis for all cities'],
  scaling:[['Locations', 'Shard geo index by city/cell; drop stale pings'], ['Match quality', 'Batch requests for 1–2 s and solve assignment by ETA'], ['Hot cities', 'Separate matcher instances per city'], ['Rider tracking', 'Throttle driver position pushes to every 2–3 s']],
  improvements:['Surge pricing per cell', 'Pooling (shared rides)', 'ETA predictions with ML', 'Driver heat maps'],
  failures:[['Matcher crash', 'Requests retried from the REQUESTED state by another instance'], ['Redis loss', 'Rebuilt from the next location pings within seconds'], ['Driver app offline', 'Offer timeout; next candidate']],
  observability:{metrics:['Time to match p50/p95', 'Offer acceptance rate', 'Pickup ETA accuracy', 'Location ingest lag'], alerts:['Match time p95 > 30 s', 'No-driver rate spike in a city', 'Location lag > 20 s'], dash:'Supply/demand by area, match funnel, trip states.'},
  review:['No double assignment (DB constraint): ✓', 'Recoverable trip state: ✓', 'Real-time offers and tracking: ✓', 'Next: batched matching and surge'],
  refs:['case:uber', 'l:geospatial', 'pg:geo']});
P({id:'p-food-delivery', level:'intermediate', icon:'🍜', title:'Food delivery', tagline:'Restaurants, riders and customers on one live order.', tags:['marketplace', 'workflow', 'assignment', 'eta'],
  req:'Build the order flow of a food-delivery app: browse restaurants that deliver to you, order and pay, the restaurant accepts and cooks, a rider is assigned and delivers, everyone tracks it live.',
  fr:['Restaurant discovery by location', 'Order and payment', 'Restaurant accept/prep updates', 'Rider assignment, pickup and delivery', 'Live tracking for the customer'],
  nfr:['Order placement p99 under 2 s', 'No lost orders; payment and order always consistent', 'Dinner peak 8× average', 'Honest ETAs'],
  est:[['Orders', '1M/day; peak 80/s', ''], ['Riders online at peak', '40K', ''], ['Rider pings', '10K/s', '40K ÷ 4 s'], ['Order events', '≈ 10 per order', '']],
  entities:{code:`CREATE TABLE orders (
  id UUID PRIMARY KEY, customer_id BIGINT, restaurant_id BIGINT, rider_id BIGINT,
  status TEXT NOT NULL,     -- PLACED | ACCEPTED | READY | PICKED_UP | DELIVERED | CANCELLED
  prep_eta TIMESTAMPTZ, promised_at TIMESTAMPTZ, total_minor BIGINT,
  idem_key TEXT UNIQUE, version INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE order_events (order_id UUID, seq INT, type TEXT, payload JSONB, at TIMESTAMPTZ, PRIMARY KEY (order_id, seq));
CREATE TABLE restaurants (id BIGINT PRIMARY KEY, name TEXT, location GEOGRAPHY(Point), delivery_radius_m INT, open BOOLEAN);`, notes:'Every state change is also an event row, which doubles as the outbox and the audit trail.'},
  apis:{list:[['GET /restaurants?lat&lng', 'Deliverable, open restaurants'], ['POST /orders', 'Idempotent order + payment'], ['POST /restaurant/orders/{id}/accept', 'With prep minutes'], ['POST /rider/orders/{id}/pickup', 'Rider picked up'], ['WS order:{id}', 'Live status and rider location']], code:`async function onOrderAccepted(e: { orderId: string; readyAt: Date; restaurant: LatLng }) {
  // just-in-time assignment: wait until a rider's travel time ≈ remaining prep time
  const delay = Math.max(0, +e.readyAt - Date.now() - (await typicalTravelMs(e.restaurant)));
  scheduler.at(Date.now() + delay, () => assignRider(e.orderId, e.restaurant));
}`},
  hld:{text:'An event-driven order workflow: payment, restaurant acceptance, rider assignment and delivery are separate services reacting to order events; customers subscribe to their order channel.',
    diagram:{n:[['cust', 'client', 'Customer', '', 0, 0], ['rest', 'client', 'Restaurant', '', 0, 1], ['rider', 'client', 'Rider', '', 0, 2], ['api', 'service', 'Order service', '', 1, 1], ['bus', 'queue', 'Order events', '', 2, 1], ['assign', 'service', 'Assignment', 'JIT + batching', 3, 2], ['rt', 'service', 'Realtime', 'per-order channel', 3, 0], ['db', 'db', 'Orders DB', '', 2, 2]], e:'cust>api rest>api rider>api api>bus api>db bus>assign bus>rt rt>cust', f:[['The order is placed and paid; the restaurant accepts with a prep time.', 'cust>api:place order|api>db|rest>api:accept 18 min|api>bus'], ['Assignment picks a rider just in time; the customer’s channel shows progress.', 'bus>assign:assign rider|bus>rt|rt>cust:rider assigned']]}},
  components:[['Order service', 'Order state machine, payments integration'], ['Restaurant app API', 'Accept/reject, prep times, menu availability'], ['Assignment', 'Rider selection, batching, just-in-time timing'], ['Realtime', 'Order channels with rider locations'], ['ETA service', 'Prep-time and travel predictions']],
  tech:[['Postgres', 'Orders with transactional state changes'], ['Kafka', 'Order events to all consumers'], ['Redis GEO', 'Rider locations'], ['WebSockets', 'Live tracking']],
  tradeoffs:[['Just-in-time assignment', 'Riders don’t idle at restaurants', 'Depends on prep-time accuracy'], ['Event-driven workflow', 'Services evolve independently', 'Harder end-to-end debugging (needs tracing)'], ['Batching orders', 'More orders per rider-hour', 'Second customer waits longer']],
  v1:{text:'v1 assigns the nearest free rider as soon as the restaurant accepts.', code:`bus.subscribe('order.accepted', async ({ orderId, restaurant }) => {
  const [riderId] = await redis.geosearch('riders:free', 'FROMLONLAT', restaurant.lng, restaurant.lat, 'BYRADIUS', 5, 'km', 'ASC', 'COUNT', 1);
  if (!riderId) return bus.publish('order.unassigned', { orderId });
  const ok = await db.result("UPDATE orders SET rider_id=$2, version=version+1 WHERE id=$1 AND rider_id IS NULL", [orderId, riderId]);
  if (ok.rowCount) { await redis.zrem('riders:free', riderId); await rt.toRider(riderId, { type: 'new_delivery', orderId }); }
});`},
  bottlenecks:['Riders wait 10+ minutes at restaurants during the rush', 'Polling for order status floods the API', 'Restaurant tablets miss orders'],
  scaling:[['Rider idle time', 'Just-in-time assignment and batching (see the Zomato case simulator)'], ['Tracking load', 'Per-order pub/sub channels; throttled location updates'], ['Missed orders', 'Persistent connections + acceptance timers + automated calls'], ['Peaks', 'Zone-level capacity control: radius shrink, surge fees']],
  improvements:['ML prep-time prediction', 'Order batching across nearby restaurants', 'Rider incentives during peaks', 'Scheduled orders'],
  failures:[['Payment succeeded, order write failed', 'Idempotency key + reconciliation creates or refunds'], ['Assignment service down', 'Events wait in Kafka; resumes from offsets'], ['Restaurant offline', 'Timeout → call → auto-cancel and refund']],
  observability:{metrics:['Order funnel and cancellation reasons', 'Rider wait at restaurant', 'Late deliveries (> promised)', 'Assignment latency'], alerts:['Late rate > 10% in a zone', 'Unassigned orders > 5 min', 'Restaurant acceptance timeouts spike'], dash:'Zone health: orders, riders, ETAs, lateness.'},
  review:['Durable order workflow with events: ✓', 'Rider assignment correctness (conditional update): ✓', 'Live tracking without polling: ✓', 'Next: batching and ML ETAs'],
  refs:['case:zomato', 'l:event-driven', 'l:saga-outbox']});
P({id:'p-ticket-booking', level:'intermediate', icon:'🎟️', title:'Ticket booking', tagline:'Seat maps, holds with timers, and a fair queue for hot shows.', tags:['seat locking', 'ttl', 'waiting room', 'saga'],
  req:'Build ticket booking for concerts and movies: pick seats on a map, hold them while paying, confirm on payment, and survive on-sale moments when demand is 100× supply.',
  fr:['Show seat map with availability', 'Hold selected seats for 10 minutes', 'Pay and confirm; release on timeout', 'Virtual queue for high-demand on-sales'],
  nfr:['No seat sold twice', 'No charge without a ticket (or automatic refund)', 'Seat map loads in under 1 s during on-sales', '1M users in queue for one event'],
  est:[['Seats per event', '50K stadium', ''], ['Users at on-sale', '1M in 5 minutes', ''], ['Hold attempts', '≈ 20K/s at peak', 'many collide on the same best seats'], ['Seat-map reads', '≈ 200K/s', 'cacheable for 1–2 s']],
  entities:{code:`CREATE TABLE seats (
  event_id  BIGINT, seat_id TEXT,              -- 'B-12-7' (block-row-seat)
  status    TEXT NOT NULL DEFAULT 'free',      -- free | held | sold
  hold_id   UUID, hold_expires TIMESTAMPTZ,
  booking_id UUID,
  PRIMARY KEY (event_id, seat_id)
);
CREATE TABLE bookings (id UUID PRIMARY KEY, user_id BIGINT, event_id BIGINT, status TEXT, payment_ref TEXT, idem_key TEXT UNIQUE);`, notes:'Holding is a conditional update (free → held, or held-but-expired → held), so two users can’t hold the same seat.'},
  apis:{list:[['GET /events/{id}/seatmap', 'Availability snapshot (cached 1–2 s)'], ['POST /events/{id}/holds', '{seats[]} → hold id, expires_in'], ['POST /holds/{id}/checkout', 'Pay; confirm via webhook'], ['GET /queue/{event}', 'Waiting-room position']], code:`async function hold(eventId: number, seats: string[], userId: number) {
  const holdId = randomUUID();
  const r = await db.query(\`UPDATE seats SET status='held', hold_id=$3, hold_expires=now() + interval '10 minutes'
     WHERE event_id=$1 AND seat_id = ANY($2) AND (status='free' OR (status='held' AND hold_expires < now()))\`,
     [eventId, seats, holdId]);
  if (r.rowCount !== seats.length) {                       // all-or-nothing
    await db.query("UPDATE seats SET status='free', hold_id=NULL WHERE hold_id=$1", [holdId]);
    throw new SeatsTaken();
  }
  return { holdId, expiresIn: 600 };
}`},
  hld:{text:'A waiting room admits users at a sustainable rate; holds are atomic conditional updates; payment confirms via webhooks into a booking saga; seat maps are served from a short-lived cache.',
    diagram:{n:[['u', 'client', 'Fan', '', 0, 1], ['wr', 'service', 'Waiting room', 'tokens', 1, 0], ['api', 'service', 'Booking API', '', 1, 1], ['map', 'cache', 'Seat-map cache', '1–2 s', 2, 0], ['db', 'db', 'Seats DB', 'conditional holds', 2, 2], ['pay', 'ext', 'Payment gateway', '', 3, 1], ['sweep', 'service', 'Expiry sweeper', '', 3, 2]], e:'u>wr wr>api api>map api>db api>pay pay>api~0.35 sweep>db', f:[['Admitted fans see a cached seat map and hold seats atomically.', 'u>wr:join queue|wr>api:admitted|api>map|api>db:hold B-12-7'], ['Payment confirms the booking; expired holds are released.', 'api>pay:charge|pay>api:webhook success|sweep>db:release expired']]}},
  components:[['Waiting room', 'Fair admission at a controlled rate'], ['Booking API', 'Holds, checkout, idempotent confirmation'], ['Seats DB', 'Authoritative seat states'], ['Seat-map cache', 'Snapshot of availability for rendering'], ['Sweeper', 'Releases expired holds']],
  tech:[['Postgres (row per seat)', 'Atomic conditional updates; strong consistency'], ['Redis', 'Seat-map snapshots, queue tokens'], ['CDN', 'Static event pages and queue page'], ['Payment webhooks', 'Confirmation independent of the browser']],
  tradeoffs:[['Holds with expiry', 'No charge without a seat', 'Abandoned holds block seats for minutes'], ['Waiting room', 'Protects the system; fair', 'Everyone waits'], ['Cached seat map', 'Handles read storm', 'Users sometimes pick a just-taken seat']],
  v1:{text:'v1 sells general admission with a counter and no seat map: a single conditional decrement.', code:`app.post('/events/:id/buy', auth, async (req, res) => {
  const qty = Math.min(4, Number(req.body.qty) || 1);
  const r = await db.query('UPDATE events SET remaining = remaining - $2 WHERE id=$1 AND remaining >= $2 RETURNING remaining', [req.params.id, qty]);
  if (!r.rowCount) return res.status(409).json({ error: 'sold out' });
  const booking = await bookings.create(req.user.id, req.params.id, qty, req.get('Idempotency-Key'));
  res.json({ bookingId: booking.id, payBy: booking.payBy });
});`},
  bottlenecks:['On-sale traffic overwhelms everything at once', 'Best seats get hundreds of simultaneous hold attempts', 'Payment delays exceed hold time'],
  scaling:[['On-sale', 'Waiting room admitting N users/s; static pages on CDN'], ['Hot seats', 'Conditional updates fail fast; suggest alternatives; “best available” auto-pick'], ['Slow payments', 'Extend holds while payment is in progress; confirm by webhook'], ['Per-event load', 'Partition seats by event; hot events on dedicated shards']],
  improvements:['Best-available seat selection algorithm', 'Resale marketplace with transfers', 'Dynamic pricing tiers', 'Bot defences (verified fans, purchase limits)'],
  failures:[['Payment succeeded after hold expired', 'Rebook equivalent seats or refund automatically'], ['Seats DB primary fails', 'Holds pause; queue keeps users waiting rather than erroring'], ['Waiting room overload', 'Queue page is static; admission API is cheap']],
  observability:{metrics:['Hold success/conflict rate', 'Queue length and admission rate', 'Hold-to-purchase conversion', 'Refunds for expired holds'], alerts:['Conflict rate > 50% (show alternatives)', 'Webhook confirmation lag', 'Seats held but unpaid > threshold'], dash:'On-sale control room: queue, admissions, holds, sales.'},
  review:['No double sale: ✓', 'Payment-safe saga with refunds: ✓', 'Overload protection: ✓', 'Next: bot defences and best-available allocation'],
  refs:['case:irctc', 'l:distributed-locks', 'l:load-shedding']});
})();
