/* =====================================================================
   PART 14 · PROJECTS — intermediate (8)
   ===================================================================== */
(function(){
const SDA = window.SDA;
const P = def => SDA.register(Object.assign({kind:'project'}, def));

P({id:'p-ecommerce', level:'intermediate', icon:'🛒', title:'E-commerce checkout', tagline:'Cart → order → payment → fulfilment, without overselling or double charging.', tags:['saga', 'inventory', 'idempotency', 'outbox'],
  req:'<b>A small example.</b> Karan adds 2 books to his cart on his laptop and pays on his phone. Only 1 copy of one book is left, and another shopper wants it at the same moment. The system gives it to only one of them. If the payment times out, Karan is charged once at most, and his order is either confirmed or refunded. Build this order flow for a busy store.',
  fr:['A cart for each user that works across devices', 'Checkout holds the stock, takes payment and creates the order', 'Order status updates: confirmed, packed, shipped, delivered', 'Cancellations and refunds'],
  nfr:['Never sell more than the stock, and never charge without an order (or an automatic refund)', 'Checkout takes under 2 s for 99 of 100 shoppers, including the payment gateway', 'Survive one service failing in the middle of checkout', 'On a sale day, handle up to 50 times the normal traffic'],
  est:[['Orders', '200K a day ≈ 2 a second, up to 300 at a sale peak', '200,000 ÷ 86,400 s ≈ 2.3. The sale peak is an assumption for the busiest minute'], ['Carts updated', '5M a day ≈ 58 a second', '5,000,000 ÷ 86,400 s ≈ 58'], ['Order rows', '≈ 70M a year', '200K × 365 = 73M'], ['Events', 'About 10 for each order', '200K × 10 = 2M events a day ≈ 23 a second']],
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
CREATE TABLE outbox (id BIGSERIAL PRIMARY KEY, topic TEXT, payload JSONB, published BOOLEAN DEFAULT false);`, notes:'Two things make overselling impossible: the CHECK rule on stock, and a reservation update that only works while stock is left.'},
  apis:{list:[['PUT /cart/items', 'Add or change a cart line'], ['POST /checkout', 'Send an Idempotency-Key. The steps are: hold stock, pay, confirm'], ['GET /orders/{id}', 'The order with its status history'], ['POST /orders/{id}/cancel', 'Cancel, and refund if allowed']], code:`async function reserve(tx, orderId: string, items: Item[]) {
  for (const it of items) {
    const r = await tx.query(
      'UPDATE stock SET available = available - $2, reserved = reserved + $2 WHERE sku = $1 AND available >= $2',
      [it.sku, it.qty]);
    if (r.rowCount === 0) throw new OutOfStock(it.sku);                // whole transaction rolls back
    await tx.query("INSERT INTO reservations VALUES ($1,$2,$3, now() + interval '15 minutes')", [orderId, it.sku, it.qty]);
  }
}`},
  hld:{text:'Checkout is a saga: hold stock, take payment, confirm. Each step is a local transaction that publishes an event through an outbox. If a step fails, a compensation undoes the earlier ones, by releasing the stock or refunding.',
    diagram:{n:[['u', 'client', 'Shopper', '', 0, 1], ['gw', 'lb', 'Gateway', '', 1, 1], ['order', 'service', 'Order service', 'saga', 2, 1], ['inv', 'service', 'Inventory', 'reservations', 3, 0], ['pay', 'service', 'Payments', 'idempotent', 3, 2], ['bus', 'queue', 'Event bus', 'outbox relay', 4, 1], ['wh', 'service', 'Fulfilment', 'warehouse', 4, 2]], e:'u>gw gw>order order>inv order>pay order>bus bus>wh inv>bus~0.25', f:[['Checkout creates the order and reserves stock.', 'u>gw:POST /checkout|gw>order|order>inv:reserve'], ['Payment is charged with the order id as the idempotency key.', 'order>pay:charge'], ['The order is confirmed and fulfilment is told via the event bus.', 'order>bus:order.confirmed|bus>wh']]}},
  components:[['Cart service', 'Stores carts in a key-value store that is almost always available'], ['Order service', 'Runs the saga and the order state machine'], ['Inventory', 'Holds and releases stock in one step, and a sweeper frees expired holds'], ['Payments', 'Talks to the gateway, handles idempotency and refunds'], ['Outbox relay', 'Publishes saved events to the event bus'], ['Fulfilment', 'Picks up confirmed orders']],
  tech:[['Postgres for each service', 'Transactions exist where the rules must hold'], ['Kafka', 'Durable events between services'], ['Redis or DynamoDB for carts', 'A cart can always be written'], ['A workflow tool such as Temporal (optional)', 'Keeps the saga state and retries safely']],
  tradeoffs:[['An orchestrated saga', 'The flow is clear and easy to watch', 'You must run a central coordinator'], ['Stock holds that expire', 'Abandoned checkouts free their stock', 'An item may show “out of stock” for a short time until holds expire'], ['The outbox pattern', 'No lost or invented events', 'You need a relay process and must handle duplicates']],
  v1:{text:'Version 1 is one service and one database. One transaction holds the stock and creates the order. Payment is called after the commit, and a sweeper releases unpaid orders after 15 minutes.', code:`app.post('/checkout', auth, async (req, res) => {
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
  bottlenecks:['Hot items in a sale: one stock row makes all buyers wait in line', 'A payment call that waits for seconds holds a request thread', 'A crash between the charge and the status update leaves orders in an unknown state'],
  scaling:[['Hot stock rows', 'Use an atomic counter in Redis as a gate for flash-sale items, then reconcile with the database'], ['Slow payments', 'Return PENDING and confirm later with a webhook or an event'], ['Unknown states', 'Save the saga state, and run a job that asks the gateway what happened'], ['Sale peaks', 'Use a waiting room and create orders through a queue']],
  improvements:['Split into separate services (cart, order, inventory, payment) that talk through events', 'A fraud check before payment', 'Partial fulfilment and split shipments', 'A promotions engine'],
  failures:[['The payment gateway times out', 'The order stays PENDING and a reconciliation job resolves it. The idempotency key prevents a second charge'], ['Inventory is down', 'Checkout returns 503. Carts are not affected'], ['The event bus is down', 'Outbox rows wait. The relay publishes them when the bus recovers']],
  observability:{metrics:['Checkout success rate, split by failure reason', 'Orders by how long they have been in each status (stuck PENDING)', 'How many stock holds expire', 'Payment time and errors'], alerts:['Checkout success below 95%', 'More than 0.1% of orders PENDING for over 30 minutes', 'The outbox backlog keeps growing'], dash:'The funnel (cart, checkout, paid), stuck orders and stock holds.'},
  review:['Overselling is blocked by a database rule: ✓', 'Checkout and payment are idempotent: ✓', 'Every step has a compensation: ✓', 'Next: a flash-sale gate and queue (see the Amazon case)'],
  refs:['case:amazon', 'l:saga-outbox', 'l:idempotency-rate-limit-headers', 'pg:saga-2pc']});
P({id:'p-notifications', level:'intermediate', icon:'🔔', title:'Notification service', tagline:'Push, SMS, email and in-app, prioritised, deduplicated and respectful.', tags:['queues', 'priorities', 'preferences', 'providers'],
  req:'<b>A small example.</b> Priya asks for a login code. The service sends it by SMS within seconds. At the same moment, the marketing team sends a sale offer to 5 million people. Priya’s code must not wait behind the offer. If the SMS provider is down, the code goes through a second provider. And if her app retries by mistake, she gets one code and not two. Build this central notification service.',
  fr:['Send a notification from a template to one user or to a group', 'Pick the channel from the user’s preferences', 'Priority levels: login codes and receipts go before marketing', 'Track delivery and keep an in-app inbox'],
  nfr:['Login codes (OTPs) arrive in seconds, even during a marketing blast', 'Retries never cause duplicates', 'Survive a provider outage', 'Handle 100M notifications a day'],
  est:[['Notifications', '100M a day ≈ 1,200 a second, up to 50,000 in a campaign', '100M ÷ 86,400 s ≈ 1,157. The campaign peak is an assumption'], ['OTPs', '≈ 300 a second at peak', 'Few, but they matter most. This is an assumption'], ['Delivery events', 'About 3 for each notification', 'Sent, delivered and opened: 100M × 3 = 300M a day ≈ 3,500 a second'], ['Inbox storage', '≈ 30 GB a day', '100M × 300 bytes = 30 GB']],
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
CREATE TABLE preferences (user_id BIGINT PRIMARY KEY, channels JSONB, quiet_start TIME, quiet_end TIME, tz TEXT, marketing_opt_in BOOLEAN);`, notes:'The unique pair (user_id, dedupe_key) makes a repeated request from a caller harmless.'},
  apis:{list:[['POST /v1/notify', 'Send a notification. Give the user, template, values, priority and a dedupe key'], ['POST /v1/campaigns', 'Send to a whole group. The service splits it into batches'], ['GET /v1/users/{id}/inbox', 'The in-app inbox'], ['POST /webhooks/{provider}', 'Delivery receipts from the providers']], code:`app.post('/v1/notify', serviceAuth, async (req, res) => {
  const n = req.body;
  const r = await db.query(\`INSERT INTO notifications(id,user_id,template,params,priority,dedupe_key)
     VALUES (gen_random_uuid(),$1,$2,$3,$4,$5) ON CONFLICT (user_id, dedupe_key) DO NOTHING RETURNING id\`,
     [n.user_id, n.template, n.params, n.priority, n.dedupe_key]);
  if (!r.rowCount) return res.status(200).json({ duplicate: true });
  await queues[n.priority === 0 ? 'otp' : n.priority === 1 ? 'transactional' : 'bulk'].send({ id: r.rows[0].id });
  res.status(202).json({ id: r.rows[0].id });
});`},
  hld:{text:'A request is checked, de-duplicated and put on a queue for its priority. Channel workers apply preferences and quiet hours, fill in the template and send through a provider, with a backup provider ready. Receipts update the delivery status.',
    diagram:{n:[['svc', 'client', 'Calling services', '', 0, 1], ['api', 'service', 'Notify API', 'dedupe', 1, 1], ['db', 'db', 'Notifications DB', '', 1, 2], ['qp', 'queue', 'OTP queue', 'priority', 2, 0], ['qb', 'queue', 'Bulk queue', '', 2, 2], ['w', 'service', 'Channel workers', 'prefs · templates', 3, 1], ['prov', 'ext', 'Providers', 'APNs/FCM/SMS/email', 4, 1]], e:'svc>api api>db api>qp api>qb qp>w qb>w w>prov prov>db~0.4', f:[['A caller requests an OTP; it is deduplicated and placed on the priority queue.', 'svc>api:OTP for user 42|api>db|api>qp'], ['A worker sends it via the healthiest SMS provider; the receipt updates status.', 'qp>w|w>prov:send|prov>db:delivered']]}},
  components:[['Notify API', 'Checks requests, removes duplicates and picks a queue'], ['Priority queues', 'Keep login codes apart from marketing blasts'], ['Channel workers', 'Apply preferences and quiet hours, fill in templates and respect each provider’s rate limit'], ['Provider adapters', 'Connect to APNs, FCM, SMS gateways and email. Score each provider’s health and switch when it fails'], ['Receipt handler', 'Updates delivery status and handles retries and bounces']],
  tech:[['Postgres', 'Holds the duplicate rule and an audit record'], ['Kafka or SQS, with separate queues', 'Priorities stay apart, and a slow queue pushes back on senders'], ['Redis', 'Rate limits and provider health'], ['A template engine with languages', 'The same message in many languages']],
  tradeoffs:[['A separate queue for each priority', 'Login codes never wait behind campaigns', 'More queues and workers to run'], ['Dedupe keys chosen by the caller', 'Simple, and close to exactly-once', 'Callers must pick good keys'], ['Several providers with failover', 'Survives an outage', 'More integration work and cost']],
  v1:{text:'Version 1 is one worker that reads one queue and sends through one provider for each channel. A failed send is retried a fixed number of times.', code:`consumer.on('message', async ({ id }) => {
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
  bottlenecks:['In a single queue, campaigns starve login codes', 'One provider outage stops a whole channel', 'Retries without dedupe send duplicates'],
  scaling:[['Priority', 'Use separate queues and worker pools for each priority'], ['Provider limits', 'Use a token bucket for each provider, and spread the load across providers'], ['Campaigns', 'Expand the group in batches and slow down for each region and time zone'], ['Inbox reads', 'Split the inbox by user and cache recent items']],
  improvements:['Digests (combine 10 likes into one notification)', 'Choose the best send time for each user', 'A limit on how many notifications a user gets, across all teams', 'WhatsApp and RCS channels'],
  failures:[['The SMS provider is down', 'Its health score drops and login codes switch to the backup provider within seconds'], ['A queue backs up', 'Drop marketing first. The login-code queue is not affected'], ['A template has an error', 'Check templates when they are published. Only that one type fails, not the whole service']],
  observability:{metrics:['Time from request to the provider accepting it, for each priority', 'Delivery rate for each provider and channel', 'Queue length and age for each priority', 'Duplicates that were rejected'], alerts:['OTP p95 delivery above 10 s', 'Provider error rate above 5%', 'Oldest bulk message older than 1 hour'], dash:'Time for each priority, provider health and campaign progress.'},
  review:['Priorities are kept apart: ✓', 'Duplicates are stopped at the source: ✓', 'Providers can fail over: ✓', 'Next: a global limit so users are not spammed by many teams'],
  refs:['case:notification-service', 'l:push-notifications', 'l:ordering-dlq']});
P({id:'p-rate-limiter', level:'intermediate', icon:'🚦', title:'Rate limiter', tagline:'Protect APIs per user, key and IP, across many servers.', tags:['token bucket', 'redis', 'lua', 'distributed'],
  req:'<b>A small example.</b> A public API allows each customer 100 requests a minute. A customer sends 100 requests in the first 10 seconds. The 101st gets a <code>429</code> reply that says when to try again. The API runs on 50 servers, so every server must count the same customer together. The check must add almost no delay. Build this rate-limiting service.',
  fr:['Rules you can set: N requests per time window, per key, user, IP address or route', 'A burst allowance', 'Standard headers (limit, remaining, reset) and 429 replies', 'Rule changes without a new deploy'],
  nfr:['Adds under 2 ms for 99 of 100 checks', 'Limits are accurate within a few percent across servers', 'If the limiter store is down, each rule says whether to allow (fail open) or block (fail closed)', 'Handle 500K checks a second'],
  est:[['Checks', '500K a second', 'Every API request needs one check'], ['Keys tracked', '≈ 10M active', 'API keys, users and IP addresses together. This is an assumption'], ['Memory', '≈ 1 GB', '10M keys × about 100 bytes = 1 GB'], ['Redis operations', '500K a second', 'One script call for each check, spread over many Redis shards']],
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
-- State (Redis): rl:{scope}:{id}:{rule} → hash {tokens, ts}   TTL = time to refill fully`, notes:'Rules are small, and the hot path only reads them. The count for each key lives in Redis and expires on its own.'},
  apis:{list:[['Middleware check(key, route)', 'Returns allow or block, how many are left and when the limit resets'], ['GET /admin/rules', 'List the rules'], ['PUT /admin/rules/{id}', 'Change a rule (it is pushed to the servers)']], code:`const TOKEN_BUCKET = \`
local tokens, ts = unpack(redis.call('HMGET', KEYS[1], 't', 'ts'))
local cap, rate, now = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
tokens = tonumber(tokens) or cap; ts = tonumber(ts) or now
tokens = math.min(cap, tokens + (now - ts) / 1000 * rate)
local allowed = tokens >= 1 and 1 or 0
if allowed == 1 then tokens = tokens - 1 end
redis.call('HSET', KEYS[1], 't', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(cap / rate * 1000))
return { allowed, math.floor(tokens) }\`;`},
  hld:{text:'Each API server calls the limiter as middleware. The counts live in a Redis cluster split into shards, and a small Lua script updates each count in one step. Servers keep rules in a local cache and refresh it when a rule changes.',
    diagram:{n:[['c', 'client', 'API client', '', 0, 1], ['api', 'service', 'API servers', 'limiter middleware', 1, 1], ['redis', 'cache', 'Redis cluster', 'buckets (Lua)', 2, 0], ['rules', 'db', 'Rules DB', '', 2, 2], ['svc', 'service', 'Backend', '', 3, 1]], e:'c>api api>redis api>rules api>svc', f:[['Each request runs one atomic bucket update in Redis.', 'c>api:GET /v1/data|api>redis:EVAL token bucket'], ['Allowed requests continue; others get 429 with Retry-After.', 'api>svc:allowed']]}},
  components:[['Limiter middleware', 'Builds the key, checks the rules and sets the headers'], ['Redis cluster', 'Holds each key’s count, split into shards by key'], ['Rules store', 'Holds the rules and plan overrides, cached on each server'], ['Admin API', 'Manages rules and records every change']],
  tech:[['Token bucket', 'Allows bursts and keeps a steady average rate'], ['Redis with Lua', 'Reads and updates a count in one step and one round trip'], ['A local rule cache', 'No database call on the hot path'], ['Standard RateLimit headers', 'Clients can slow down politely']],
  tradeoffs:[['One central Redis', 'Counts are accurate across servers', 'One network hop for every request'], ['Counts kept on each server only', 'No added delay', 'The real limit becomes the limit × the number of servers'], ['Fail open', 'The API stays up if Redis fails', 'It is unprotected for a short time']],
  v1:{text:'Version 1 keeps fixed-window counts in each server’s memory. This is good enough for one or two servers.', code:`const windows = new Map<string, { start: number; count: number }>();
export function allow(key: string, limit = 100, windowMs = 60_000) {
  const now = Date.now(); const w = windows.get(key);
  if (!w || now - w.start >= windowMs) { windows.set(key, { start: now, count: 1 }); return true; }
  if (w.count >= limit) return false;
  w.count++; return true;
}
// problem: up to 2× limit at window boundaries, and each server counts separately`},
  bottlenecks:['Counts on each server multiply the real limit by the number of servers', 'A fixed window lets through a double burst at its edge', 'One hot key (a big customer) lands on a single Redis shard'],
  scaling:[['Agreement across servers', 'Keep the counts in a central Redis and update them with a Lua script'], ['Bursts at the window edge', 'Use a token bucket or a sliding-window counter'], ['Hot keys', 'For very busy keys, give each server a small batch of tokens ahead of time'], ['Delay', 'Send several checks together and put Redis in the same zone as the servers']],
  improvements:['Cost-based limits: expensive endpoints use more tokens', 'Global quotas across regions (see the practice challenge)', 'Limits that adapt when the system is overloaded', 'A dashboard for each tenant'],
  failures:[['Redis is down', 'Each rule decides. Most rules fail open with a small local limit. Sensitive endpoints fail closed'], ['A rule is wrong', 'Check rules before they go live, roll them out in stages, and allow an instant revert'], ['Clocks disagree', 'Always use Redis TIME, or timestamps sent by the server']],
  observability:{metrics:['Checks a second and the 429 rate for each rule', 'Limiter time p99', 'Redis CPU for each shard', 'How often the limiter failed open'], alerts:['Limiter p99 above 5 ms', 'A spike in 429 replies for one plan', 'Fail open is active'], dash:'The most limited keys, time and Redis health.'},
  review:['Counts are atomic and agree across servers: ✓', 'Bursty clients are handled by the token bucket: ✓', 'Each rule has a defined fail mode: ✓', 'Next: cost-based and adaptive limits'],
  refs:['case:rate-limiter', 'l:rate-limiting', 'pg:rate-limiter', 'lab:token-bucket']});
P({id:'p-chat', level:'intermediate', icon:'💬', title:'Real-time chat', tagline:'1:1 and group chat with delivery receipts, history and presence.', tags:['websockets', 'fan-out', 'ordering', 'presence'],
  req:'<b>A small example.</b> Sana sends “Hi!” to her friend Leo. Leo’s phone shows it within a second, and Sana sees two ticks when it arrives. Leo is offline for an hour, so he gets a push notification and sees the message when he reconnects. Sana also posts in a group of 200 people, and her laptop shows the same history as her phone. Build this chat app.',
  fr:['Send and receive messages in real time', 'Groups of up to 500 members', 'Delivered and read receipts', 'History that matches on every device', 'Online status and typing signals'],
  nfr:['A message reaches an online recipient in under 300 ms', 'No lost or duplicated messages, and messages stay in order within a conversation', 'Support 5M connected users at once', 'Work on poor mobile networks'],
  est:[['Connected users', '5M at once', 'This is an assumption'], ['Messages', '500M a day ≈ 6,000 a second, up to 30,000 at peak', '500M ÷ 86,400 s ≈ 5,800. The peak is an assumption'], ['Group fan-out', '≈ 5 deliveries for each message', '30,000 a second × 5 = 150,000 deliveries a second at peak'], ['Storage', '≈ 100 GB a day', '500M × 200 bytes = 100 GB']],
  entities:{code:`CREATE TABLE conversations (id BIGINT PRIMARY KEY, kind TEXT, title TEXT, created_at TIMESTAMPTZ);
CREATE TABLE members (conversation_id BIGINT, user_id BIGINT, last_read_seq BIGINT DEFAULT 0, PRIMARY KEY (conversation_id, user_id));
-- Messages: wide-column store, partitioned by conversation
-- messages(conversation_id, seq, msg_id, sender_id, body, created_at)
--   PRIMARY KEY ((conversation_id), seq)   -- seq assigned per conversation
-- Presence (Redis): online:{user} → gateway id, TTL 60 s`, notes:'A number that counts up in each conversation gives the order. A device can then ask for “everything after number X”.'},
  apis:{list:[['WS send {conversation, client_msg_id, body}', 'The server gives the message a number and confirms it'], ['WS event message / receipt / typing', 'Pushed to the members'], ['GET /conversations/{id}/messages?after_seq=', 'Sync the history'], ['POST /conversations/{id}/read {seq}', 'Send a read receipt']], code:`ws.on('send', async (m: { conversationId: number; clientMsgId: string; body: string }) => {
  const seq = await seqAllocator.next(m.conversationId);                    // per-conversation counter
  const saved = await messages.insertIfAbsent({ ...m, seq, senderId: user.id }); // idempotent by clientMsgId
  ws.send({ type: 'ack', clientMsgId: m.clientMsgId, seq: saved.seq });
  for (const member of await members.of(m.conversationId)) {
    const gw = await presence.gatewayOf(member);
    if (gw) bus.publish(gw, { type: 'message', ...saved }); else push.notify(member, saved);
  }
});`},
  hld:{text:'Each client keeps a WebSocket open to a gateway. The chat service saves each message with a number for its conversation, then passes it to the members’ gateways through pub/sub. Offline members get a push notification and sync their history when they reconnect.',
    diagram:{n:[['a', 'client', 'Sender', '', 0, 0], ['b', 'client', 'Recipient', '', 0, 2], ['gw', 'service', 'WS gateways', '', 1, 1], ['chat', 'service', 'Chat service', 'seq + store', 2, 1], ['store', 'db', 'Message store', 'by conversation', 3, 2], ['pres', 'cache', 'Presence', 'user → gateway', 3, 0], ['bus', 'queue', 'Pub/sub', 'gateway channels', 2, 0], ['push', 'ext', 'Push (APNs/FCM)', '', 4, 1]], e:'a>gw b>gw gw>chat chat>store chat>pres chat>bus bus>gw chat>push', f:[['The sender’s message gets a sequence number, is stored, and acked.', 'a>gw:send|gw>chat|chat>store:seq 812|chat>gw:ack'], ['The chat service finds members’ gateways and publishes; offline members get a push.', 'chat>pres|chat>bus|bus>gw|gw>b:message|chat>push']]}},
  components:[['Gateways', 'Hold the WebSockets, check who the user is, listen for heartbeats and pass events on'], ['Chat service', 'Gives each message a number, saves it and fans it out'], ['Message store', 'Keeps the history of each conversation, added to at the end'], ['Presence', 'Tracks who is online and which gateway they use'], ['Push service', 'Sends notifications to offline users']],
  tech:[['WebSockets', 'Two-way, with low delay'], ['Cassandra or ScyllaDB', 'Handle many writes and split data by conversation'], ['Redis pub/sub or NATS', 'Send events to the right gateways'], ['Redis', 'Online status that expires unless the client keeps sending heartbeats']],
  tradeoffs:[['A server-assigned number for each conversation', 'The order is clear and syncing is easy', 'Each conversation needs one numbering point, which a busy group can overload'], ['Save, then deliver', 'No loss if a server crashes', 'One write before every delivery'], ['Online status that expires', 'Fixes itself', 'It can be wrong for a few seconds']],
  v1:{text:'Version 1 is one Node server using Socket.IO rooms for conversations, with Postgres for history.', code:`io.on('connection', socket => {
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
  bottlenecks:['One server holds every socket and room', 'The write rate and size of the history table in Postgres', 'Fan-out to a large group slows the send path'],
  scaling:[['Connections', 'Run many gateways, and let presence map each user to a gateway'], ['History', 'Use a wide-column store split by conversation, with a time bucket'], ['Fan-out', 'Use background workers, and pub/sub topics for large groups'], ['Reconnect storms', 'Reconnect after a random delay and resume from the last number']],
  improvements:['End-to-end encryption (see the WhatsApp case)', 'Photos and videos through object storage', 'Message search', 'Several devices per user, each with its own delivery state'],
  failures:[['A gateway crashes', 'Clients reconnect to another gateway and sync after their last number'], ['The message store is slow', 'Slow down senders, and never confirm a message before it is saved'], ['Pub/sub is split', 'Recipients miss live events but catch up when they sync']],
  observability:{metrics:['Time for a message to reach its recipient', 'Connected sockets for each gateway', 'Time to confirm a message', 'Reconnect rate', 'Age of the oldest undelivered message'], alerts:['Delivery p99 above 1 s', 'A spike in reconnects', 'Errors writing to the store'], dash:'Connections, message rate, time and fan-out backlog.'},
  review:['Saved before it is confirmed, and safe to retry by client id: ✓', 'Ordered within a conversation, and synced by number: ✓', 'The offline path uses push and sync: ✓', 'Next: end-to-end encryption and very large groups'],
  refs:['case:whatsapp', 'case:discord', 'l:websockets-at-scale', 'l:presence']});
P({id:'p-autocomplete', level:'intermediate', icon:'⌨️', title:'Search autocomplete', tagline:'Top suggestions for every prefix in under 50 ms.', tags:['trie', 'top-k', 'caching', 'streaming'],
  req:'<b>A small example.</b> Tara types <code>iph</code> into a shop’s search box. Before she finishes, a list shows the 8 most popular searches that start with those letters, such as “iphone 15 case”. Each new letter updates the list in under 50 ms. When a new product goes viral, it shows up in the list within minutes. Build this search-as-you-type feature.',
  fr:['Suggestions for every prefix the user types', 'Rank by popularity, with a boost for recent searches', 'Fix small typos in short prefixes', 'Hide offensive suggestions'],
  nfr:['99 of 100 answers arrive in under 50 ms, including the network', 'Handle 100K suggestion requests a second at peak', 'Trending terms show up within minutes', 'If something fails, fall back to saved lists for common prefixes'],
  est:[['Requests', '100K a second at peak', 'A search has about 6 keystrokes, so each search makes about 6 requests'], ['Distinct queries', '50M', 'This is an assumption'], ['Prefixes with a top-8 list', '≈ 200M', 'Cap the prefix at 20 letters. Each query adds a few prefixes'], ['Memory', '≈ 30 GB', '200M prefixes × about 150 bytes (8 ids plus overhead) = 30 GB, split over several servers']],
  entities:{code:`-- Query log (append-only, for aggregation)
CREATE TABLE query_log (q TEXT, user_id BIGINT, ts TIMESTAMPTZ, results INT);
-- Aggregated counts (hourly job)
CREATE TABLE query_counts (q TEXT PRIMARY KEY, count_7d BIGINT, count_1h BIGINT, blocked BOOLEAN DEFAULT false);
-- Serving structure (in memory / KV): prefix → [top 8 (q, score)]
--   e.g.  "iph" → ["iphone 15", "iphone 15 cover", "iphone charger", …]`, notes:'The top list for each prefix is built ahead of time, offline. Serving is then one key lookup.'},
  apis:{list:[['GET /suggest?q=iph', 'The top 8 suggestions'], ['POST /events/search', 'Record the final search (in the background)']], code:`app.get('/suggest', async (req, res) => {
  const prefix = normalise(String(req.query.q ?? '')).slice(0, 20);
  if (prefix.length < 1) return res.json([]);
  const list = (await topk.get(prefix)) ?? (await topk.get(prefix.slice(0, -1))) ?? [];   // fallback to shorter prefix
  res.set('Cache-Control', 'public, max-age=60').json(list.slice(0, 8));
});`},
  hld:{text:'A background job counts the search log and builds a top list for every prefix. The lists are loaded into a sharded in-memory store. A streaming job adds a boost for trending searches. The CDN caches answers by prefix.',
    diagram:{n:[['u', 'client', 'Search box', '', 0, 1], ['cdn', 'cdn', 'CDN', 'cache by prefix', 1, 1], ['api', 'service', 'Suggest API', '', 2, 1], ['kv', 'cache', 'Top-k store', 'sharded by prefix', 3, 1], ['log', 'queue', 'Query log', '', 2, 2], ['batch', 'service', 'Builder', 'hourly + trending', 3, 2]], e:'u>cdn cdn>api api>kv u>log~0.35 log>batch batch>kv', f:[['A keystroke is served from the CDN or the top-k store.', 'u>cdn:GET /suggest?q=iph|cdn>api:miss|api>kv'], ['Completed searches feed the builder that refreshes lists.', 'u>log:search event|log>batch|batch>kv:reload']]}},
  components:[['Suggest API', 'Cleans the input, looks up the list, falls back and filters'], ['Top-k store', 'Maps each prefix to its saved list, in memory'], ['Builder', 'Counts searches, builds the lists and applies the blocklist'], ['Trending job', 'Boosts recent searches'], ['CDN', 'Caches popular prefixes']],
  tech:[['Saved prefix lists in Redis or in the app’s memory', 'Each lookup takes one step'], ['Spark or SQL batch job', 'Counts searches every hour'], ['A stream processor', 'Finds trends within a minute'], ['Debounce in the browser', 'Waits a moment after the last key, so fewer requests are sent']],
  tradeoffs:[['Build the top list for each prefix ahead of time', 'Fast and simple to serve', 'Needs a lot of memory, and a rebuild takes time'], ['A live trie with counts', 'Always up to date', 'Hard to make safe for many threads, and uses more memory'], ['CDN caching', 'Absorbs the common prefixes', 'Little room to personalise for each user']],
  v1:{text:'Version 1 builds an in-memory trie from the 1M most popular searches when the server starts, and walks it for each request.', code:`class Node { children = new Map<string, Node>(); top: [string, number][] = []; }
const root = new Node();
export function insert(q: string, count: number) {
  let n = root;
  for (const ch of q) {
    n = n.children.get(ch) ?? (n.children.set(ch, new Node()), n.children.get(ch)!);
    n.top.push([q, count]); n.top.sort((a, b) => b[1] - a[1]); if (n.top.length > 8) n.top.pop();   // keep top 8 per node
  }
}
export const suggest = (p: string) => { let n: Node | undefined = root; for (const ch of p) n = n?.children.get(ch); return n?.top.map(t => t[0]) ?? []; };`},
  bottlenecks:['Rebuilding the trie needs a restart', 'One server’s memory limits how many searches it can hold', 'Keystroke traffic is about 6 times the search traffic'],
  scaling:[['Memory', 'Split by prefix (the first two letters) across servers'], ['Freshness', 'Build each new version offline and swap it in one step. Add trending from a stream on top'], ['Traffic', 'Wait 100 ms in the browser after the last key, and cache in the CDN and the browser'], ['Typos', 'For prefixes of 4 or more letters, use an index that finds close matches (edit distance)']],
  improvements:['Light personalisation: re-rank using the user’s favourite categories', 'Product thumbnails in suggestions', 'Other languages and transliteration', 'Filter offensive suggestions, with a person checking the hard cases'],
  failures:[['The top-k store is down', 'Serve saved lists from the CDN for common prefixes, and an empty list for the rest'], ['The builder fails', 'Keep serving the previous version'], ['A bad suggestion starts trending', 'The blocklist is applied when serving, so it takes effect at once']],
  observability:{metrics:['Suggest time p99', 'CDN hit ratio', 'How often users click a suggestion', 'How old the latest build is'], alerts:['p99 above 80 ms', 'Latest build older than 3 hours', 'Click rate drops after a deploy'], dash:'Time, freshness and click rate by prefix length.'},
  review:['Serving takes one lookup: ✓', 'Fresh enough through the hourly build and trending: ✓', 'Safe, because the blocklist applies when serving: ✓', 'Next: personalisation within the time budget'],
  refs:['case:typeahead', 'l:tries-autocomplete', 'pg:trie', 'l:hll-cms']});
P({id:'p-ride-booking', level:'intermediate', icon:'🚖', title:'Ride booking', tagline:'Match riders with nearby drivers and track the trip.', tags:['geospatial', 'matching', 'state machine', 'websockets'],
  req:'<b>A small example.</b> Neha opens the app at a bus stop and asks for a ride. Within 10 seconds the app finds a free driver 800 m away and sends the driver an offer. The driver accepts, and Neha watches the car come closer on the map. At the end, the app works out the fare and charges her. No driver is ever given two trips at once. Build this ride-booking backend for one country.',
  fr:['Drivers send their location and say if they are free', 'A rider asks for a ride with a pickup and a drop-off', 'Matching, then an offer that the driver can accept', 'Live tracking, then trip completion with a fare'],
  nfr:['A match within 10 s', 'Never give one driver two trips', 'Handle a location update every 4 s from 200K drivers', 'Trip state survives a server crash'],
  est:[['Drivers online', '200K', 'This is an assumption'], ['Location updates', '50K a second', '200,000 drivers ÷ 4 s = 50,000'], ['Ride requests', '100 a second at peak', '3M trips a day ≈ 35 a second on average. The peak is about 3 times that'], ['Trips', '3M a day', 'This is an assumption']],
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
-- Live locations (Redis GEO): GEOADD drivers:free lng lat driver_id`, notes:'A partial unique index means a driver can never hold two active trips, even if two requests race.'},
  apis:{list:[['POST /driver/location', 'A batch of GPS points'], ['POST /trips', 'A rider asks for a ride'], ['WS offer → driver', 'An offer that expires after 15 s'], ['POST /trips/{id}/accept', 'The driver accepts (a conditional update)'], ['POST /trips/{id}/complete', 'End the trip and work out the fare']], code:`app.post('/trips/:id/accept', driverAuth, async (req, res) => {
  try {
    const r = await db.query(\`UPDATE trips SET driver_id=$2, status='ACCEPTED', version=version+1
                               WHERE id=$1 AND status='REQUESTED'\`, [req.params.id, req.driver.id]);
    if (!r.rowCount) return res.status(409).json({ error: 'trip no longer available' });
  } catch (e) { if (isUniqueViolation(e)) return res.status(409).json({ error: 'driver busy' }); throw e; }
  await redis.zrem('drivers:free', String(req.driver.id));
  push.toRider(req.params.id, { type: 'driver_assigned', driverId: req.driver.id });
  res.json({ ok: true });
});`},
  hld:{text:'Locations go into an in-memory map index. A matcher asks for nearby free drivers and sends offers over WebSockets. Trips live in Postgres as a state machine with version numbers.',
    diagram:{n:[['r', 'client', 'Rider', '', 0, 0], ['d', 'client', 'Driver', '', 0, 2], ['api', 'service', 'Trip API', '', 1, 1], ['ws', 'service', 'Realtime gateway', '', 1, 2], ['geo', 'cache', 'Geo index', 'Redis GEO', 2, 2], ['match', 'service', 'Matcher', '', 2, 0], ['db', 'db', 'Trips DB', 'state machine', 3, 1]], e:'r>api d>ws api>match match>geo ws>geo match>ws api>db', f:[['Drivers stream locations into the geo index.', 'd>ws:GPS|ws>geo:GEOADD'], ['A request triggers matching: nearest free drivers are offered the trip.', 'r>api:request|api>match|match>geo:GEOSEARCH 3 km|match>ws:offer|ws>d'], ['The driver accepts with a conditional update.', 'd>ws:accept|ws>geo:remove from free|api>db:ACCEPTED']]}},
  components:[['Location ingest', 'Checks, slows down and stores the latest positions'], ['Geo index', 'Finds the nearest free drivers'], ['Matcher', 'Ranks candidates, sends offers and handles timeouts'], ['Trip API', 'Moves trips between states and works out fares'], ['Realtime gateway', 'Sends offers to drivers and updates to riders']],
  tech:[['Redis GEO', 'Finds drivers within a radius, in memory'], ['Postgres with PostGIS', 'Trips, history and map data types'], ['WebSockets', 'Offers and live tracking'], ['A routing engine (OSRM-style)', 'Road travel times used to rank drivers']],
  tradeoffs:[['Nearest by straight line', 'Fast and simple', 'Ignores roads and rivers, so use travel times for the best few candidates'], ['One offer at a time', 'Fair and simple', 'Slower than offering to several drivers'], ['A partial unique index', 'The database guarantees it is correct', 'Some requests must retry after a conflict']],
  v1:{text:'Version 1 uses Redis GEO for free drivers, picks the nearest driver each time, and sends one offer at a time that expires after 15 s.', code:`async function match(trip: Trip) {
  const candidates = await redis.geosearch('drivers:free', 'FROMLONLAT', trip.pickup.lng, trip.pickup.lat, 'BYRADIUS', 3, 'km', 'ASC', 'COUNT', 5);
  for (const driverId of candidates) {
    const accepted = await offer(driverId, trip, 15_000);          // resolves false on timeout/decline
    if (accepted) return driverId;
  }
  await trips.markNoDrivers(trip.id);
  return null;
}`},
  bottlenecks:['Location writes pile up in busy city centres', 'Picking the nearest driver one request at a time gives poor pickup times at peak', 'One Redis serves every city'],
  scaling:[['Locations', 'Split the geo index by city or map cell, and drop old pings'], ['Match quality', 'Collect requests for 1 to 2 s, then solve the whole assignment using travel times'], ['Busy cities', 'Run a separate matcher for each city'], ['Rider tracking', 'Push driver positions only every 2 to 3 s']],
  improvements:['Surge pricing for each map cell', 'Pooling (shared rides)', 'Travel time predictions with machine learning', 'Heat maps for drivers'],
  failures:[['The matcher crashes', 'Another instance retries requests that are still in the REQUESTED state'], ['Redis loses its data', 'It is rebuilt from the next location pings within seconds'], ['The driver’s app is offline', 'The offer times out and the next candidate gets it']],
  observability:{metrics:['Time to match, p50 and p95', 'How often drivers accept offers', 'How accurate the pickup time estimates are', 'How far behind location ingest is'], alerts:['Match time p95 above 30 s', 'A spike in “no driver found” in one city', 'Location ingest more than 20 s behind'], dash:'Supply and demand by area, the match funnel and trip states.'},
  review:['No driver gets two trips, because of a database rule: ✓', 'Trip state can be recovered: ✓', 'Offers and tracking happen in real time: ✓', 'Next: batched matching and surge pricing'],
  refs:['case:uber', 'l:geospatial', 'pg:geo']});
P({id:'p-food-delivery', level:'intermediate', icon:'🍜', title:'Food delivery', tagline:'Restaurants, riders and customers on one live order.', tags:['marketplace', 'workflow', 'assignment', 'eta'],
  req:'<b>A small example.</b> Aman opens the app at 8 pm and sees only the restaurants that deliver to his street. He orders a biryani and pays. The restaurant accepts and says it will take 20 minutes. A rider is sent so they arrive at the restaurant just as the food is ready. Aman watches the rider on a map until the food arrives. Build this order flow.',
  fr:['Find restaurants by location', 'Place an order and pay', 'The restaurant accepts the order and sends cooking updates', 'A rider is assigned, picks up and delivers', 'The customer tracks the order live'],
  nfr:['99 of 100 orders are placed in under 2 s', 'No lost orders, and payment and order always agree', 'The dinner peak is 8 times the average', 'Honest delivery time estimates'],
  est:[['Orders', '1M a day ≈ 12 a second, up to 80 at peak', '1,000,000 ÷ 86,400 s ≈ 12. The peak is an assumption for the dinner rush'], ['Riders online at peak', '40K', 'This is an assumption'], ['Rider pings', '10K a second', '40,000 riders ÷ 4 s = 10,000'], ['Order events', 'About 10 for each order', '1M × 10 = 10M events a day ≈ 115 a second']],
  entities:{code:`CREATE TABLE orders (
  id UUID PRIMARY KEY, customer_id BIGINT, restaurant_id BIGINT, rider_id BIGINT,
  status TEXT NOT NULL,     -- PLACED | ACCEPTED | READY | PICKED_UP | DELIVERED | CANCELLED
  prep_eta TIMESTAMPTZ, promised_at TIMESTAMPTZ, total_minor BIGINT,
  idem_key TEXT UNIQUE, version INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE order_events (order_id UUID, seq INT, type TEXT, payload JSONB, at TIMESTAMPTZ, PRIMARY KEY (order_id, seq));
CREATE TABLE restaurants (id BIGINT PRIMARY KEY, name TEXT, location GEOGRAPHY(Point), delivery_radius_m INT, open BOOLEAN);`, notes:'Every state change is also saved as an event row. That row doubles as the outbox and as an audit trail.'},
  apis:{list:[['GET /restaurants?lat&lng', 'Restaurants that are open and deliver here'], ['POST /orders', 'Place an order and pay, safe to retry'], ['POST /restaurant/orders/{id}/accept', 'Accept, with the cooking time in minutes'], ['POST /rider/orders/{id}/pickup', 'The rider has picked up the food'], ['WS order:{id}', 'Live status and rider location']], code:`async function onOrderAccepted(e: { orderId: string; readyAt: Date; restaurant: LatLng }) {
  // just-in-time assignment: wait until a rider's travel time ≈ remaining prep time
  const delay = Math.max(0, +e.readyAt - Date.now() - (await typicalTravelMs(e.restaurant)));
  scheduler.at(Date.now() + delay, () => assignRider(e.orderId, e.restaurant));
}`},
  hld:{text:'The order moves through events. Payment, restaurant acceptance, rider assignment and delivery are separate services that react to order events. Customers listen to the channel for their own order.',
    diagram:{n:[['cust', 'client', 'Customer', '', 0, 0], ['rest', 'client', 'Restaurant', '', 0, 1], ['rider', 'client', 'Rider', '', 0, 2], ['api', 'service', 'Order service', '', 1, 1], ['bus', 'queue', 'Order events', '', 2, 1], ['assign', 'service', 'Assignment', 'JIT + batching', 3, 2], ['rt', 'service', 'Realtime', 'per-order channel', 3, 0], ['db', 'db', 'Orders DB', '', 2, 2]], e:'cust>api rest>api rider>api api>bus api>db bus>assign bus>rt rt>cust', f:[['The order is placed and paid; the restaurant accepts with a prep time.', 'cust>api:place order|api>db|rest>api:accept 18 min|api>bus'], ['Assignment picks a rider just in time; the customer’s channel shows progress.', 'bus>assign:assign rider|bus>rt|rt>cust:rider assigned']]}},
  components:[['Order service', 'The order state machine and the payment link'], ['Restaurant app API', 'Accept or reject, cooking times and menu availability'], ['Assignment', 'Picks riders, batches orders and times the pickup'], ['Realtime', 'A channel for each order, with rider locations'], ['ETA service', 'Predicts cooking and travel times']],
  tech:[['Postgres', 'Orders, with safe state changes'], ['Kafka', 'Sends order events to every service that needs them'], ['Redis GEO', 'Rider locations'], ['WebSockets', 'Live tracking']],
  tradeoffs:[['Assign the rider just in time', 'Riders do not wait at restaurants', 'Depends on accurate cooking times'], ['A workflow driven by events', 'Services can change on their own', 'Harder to debug end to end, so you need tracing'], ['Batch orders together', 'More orders for each rider-hour', 'The second customer waits longer']],
  v1:{text:'Version 1 assigns the nearest free rider as soon as the restaurant accepts the order.', code:`bus.subscribe('order.accepted', async ({ orderId, restaurant }) => {
  const [riderId] = await redis.geosearch('riders:free', 'FROMLONLAT', restaurant.lng, restaurant.lat, 'BYRADIUS', 5, 'km', 'ASC', 'COUNT', 1);
  if (!riderId) return bus.publish('order.unassigned', { orderId });
  const ok = await db.result("UPDATE orders SET rider_id=$2, version=version+1 WHERE id=$1 AND rider_id IS NULL", [orderId, riderId]);
  if (ok.rowCount) { await redis.zrem('riders:free', riderId); await rt.toRider(riderId, { type: 'new_delivery', orderId }); }
});`},
  bottlenecks:['Riders wait 10 minutes or more at restaurants in the rush', 'Apps that ask for order status again and again flood the API', 'Restaurant tablets miss new orders'],
  scaling:[['Rider waiting time', 'Assign just in time and batch orders (see the Zomato case simulator)'], ['Tracking load', 'Use a pub/sub channel for each order, and send location updates less often'], ['Missed orders', 'Keep a connection open, use a timer for acceptance, and call the restaurant if needed'], ['Peaks', 'Control capacity for each zone: shrink the delivery radius, add surge fees']],
  improvements:['Predict cooking times with machine learning', 'Batch orders from nearby restaurants', 'Rider bonuses during peaks', 'Scheduled orders'],
  failures:[['Payment worked but the order was not saved', 'The idempotency key and a reconciliation job either create the order or refund the payment'], ['The assignment service is down', 'Events wait in Kafka and processing resumes from the saved offsets'], ['The restaurant is offline', 'After a timeout, call the restaurant. If there is no answer, cancel and refund']],
  observability:{metrics:['The order funnel and the reasons for cancellation', 'How long riders wait at restaurants', 'Late deliveries (later than promised)', 'Time to assign a rider'], alerts:['More than 10% of orders late in a zone', 'Orders without a rider for over 5 minutes', 'A spike in restaurant acceptance timeouts'], dash:'Zone health: orders, riders, delivery times and late orders.'},
  review:['The order workflow is durable and event-driven: ✓', 'Rider assignment is correct (a conditional update): ✓', 'Live tracking without polling: ✓', 'Next: batching and ML delivery times'],
  refs:['case:zomato', 'l:event-driven', 'l:saga-outbox']});
P({id:'p-ticket-booking', level:'intermediate', icon:'🎟️', title:'Ticket booking', tagline:'Seat maps, holds with timers, and a fair queue for hot shows.', tags:['seat locking', 'ttl', 'waiting room', 'saga'],
  req:'<b>A small example.</b> A concert has 50,000 seats, and 1,000,000 fans arrive the minute sales open. Zoya joins a waiting room, then enters and picks 2 seats on the map. The seats are held for her for 10 minutes while she pays. If she pays in time, the seats are hers. If not, they go back on sale. No seat is ever sold twice. Build this booking system.',
  fr:['Show a seat map with what is free', 'Hold the chosen seats for 10 minutes', 'Pay and confirm, and release the seats on timeout', 'A virtual waiting room for very popular sales'],
  nfr:['No seat is sold twice', 'No charge without a ticket (or an automatic refund)', 'The seat map loads in under 1 s during a sale', 'Handle 1M users waiting for one event'],
  est:[['Seats per event', '50K for a stadium', 'This is an assumption'], ['Users at the sale', '1M in 5 minutes', '1,000,000 ÷ 300 s ≈ 3,300 arrivals a second'], ['Hold attempts', '≈ 20K a second at peak', 'Many users go for the same best seats. This is an assumption'], ['Seat-map reads', '≈ 200K a second', 'The map can be cached for 1 to 2 s']],
  entities:{code:`CREATE TABLE seats (
  event_id  BIGINT, seat_id TEXT,              -- 'B-12-7' (block-row-seat)
  status    TEXT NOT NULL DEFAULT 'free',      -- free | held | sold
  hold_id   UUID, hold_expires TIMESTAMPTZ,
  booking_id UUID,
  PRIMARY KEY (event_id, seat_id)
);
CREATE TABLE bookings (id UUID PRIMARY KEY, user_id BIGINT, event_id BIGINT, status TEXT, payment_ref TEXT, idem_key TEXT UNIQUE);`, notes:'A hold is a conditional update. A seat moves from free to held, or from an expired hold to held. So two users can never hold the same seat.'},
  apis:{list:[['GET /events/{id}/seatmap', 'A snapshot of what is free (cached for 1 to 2 s)'], ['POST /events/{id}/holds', 'Send the seats. Get a hold id and the time left'], ['POST /holds/{id}/checkout', 'Pay, then confirm by webhook'], ['GET /queue/{event}', 'Your place in the waiting room']], code:`async function hold(eventId: number, seats: string[], userId: number) {
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
  hld:{text:'A waiting room lets users in at a speed the system can handle. A hold is one atomic conditional update. Payment is confirmed by a webhook into a booking saga. The seat map is served from a short-lived cache.',
    diagram:{n:[['u', 'client', 'Fan', '', 0, 1], ['wr', 'service', 'Waiting room', 'tokens', 1, 0], ['api', 'service', 'Booking API', '', 1, 1], ['map', 'cache', 'Seat-map cache', '1–2 s', 2, 0], ['db', 'db', 'Seats DB', 'conditional holds', 2, 2], ['pay', 'ext', 'Payment gateway', '', 3, 1], ['sweep', 'service', 'Expiry sweeper', '', 3, 2]], e:'u>wr wr>api api>map api>db api>pay pay>api~0.35 sweep>db', f:[['Admitted fans see a cached seat map and hold seats atomically.', 'u>wr:join queue|wr>api:admitted|api>map|api>db:hold B-12-7'], ['Payment confirms the booking; expired holds are released.', 'api>pay:charge|pay>api:webhook success|sweep>db:release expired']]}},
  components:[['Waiting room', 'Lets users in fairly, at a controlled speed'], ['Booking API', 'Holds, checkout and safe-to-retry confirmation'], ['Seats database', 'The true state of every seat'], ['Seat-map cache', 'A snapshot of what is free, used to draw the map'], ['Sweeper', 'Releases holds that have expired']],
  tech:[['Postgres, one row for each seat', 'Atomic conditional updates and strong consistency'], ['Redis', 'Seat-map snapshots and queue tokens'], ['CDN', 'Static event pages and the queue page'], ['Payment webhooks', 'Confirmation that does not depend on the browser']],
  tradeoffs:[['Holds that expire', 'No charge without a seat', 'Abandoned holds block seats for a few minutes'], ['A waiting room', 'Protects the system and is fair', 'Everyone has to wait'], ['A cached seat map', 'Handles the flood of reads', 'Users sometimes pick a seat that was just taken']],
  v1:{text:'Version 1 sells general admission with a counter and no seat map. A single conditional decrease takes one ticket.', code:`app.post('/events/:id/buy', auth, async (req, res) => {
  const qty = Math.min(4, Number(req.body.qty) || 1);
  const r = await db.query('UPDATE events SET remaining = remaining - $2 WHERE id=$1 AND remaining >= $2 RETURNING remaining', [req.params.id, qty]);
  if (!r.rowCount) return res.status(409).json({ error: 'sold out' });
  const booking = await bookings.create(req.user.id, req.params.id, qty, req.get('Idempotency-Key'));
  res.json({ bookingId: booking.id, payBy: booking.payBy });
});`},
  bottlenecks:['Sale-day traffic overloads everything at once', 'The best seats get hundreds of hold attempts at the same moment', 'Payment takes longer than the hold time'],
  scaling:[['The sale', 'Let N users in each second from a waiting room, and serve static pages from the CDN'], ['Hot seats', 'Conditional updates fail fast. Suggest other seats, and offer a “best available” choice'], ['Slow payments', 'Extend the hold while a payment is in progress, and confirm by webhook'], ['Load for each event', 'Split seats by event, and give very popular events their own shards']],
  improvements:['An algorithm that picks the best available seats', 'A resale marketplace with transfers', 'Pricing tiers that change with demand', 'Defences against bots (verified fans, purchase limits)'],
  failures:[['Payment succeeds after the hold expired', 'Rebook equal seats or refund automatically'], ['The seats database primary fails', 'Holds pause. The queue keeps users waiting instead of showing errors'], ['The waiting room is overloaded', 'The queue page is static and the admission call is cheap']],
  observability:{metrics:['How often holds succeed or conflict', 'Queue length and the speed users are let in', 'How many holds turn into purchases', 'Refunds for expired holds'], alerts:['More than 50% of holds conflict (show other seats)', 'Webhook confirmations running late', 'Too many seats held but not paid'], dash:'The sale control room: queue, admissions, holds and sales.'},
  review:['No seat is sold twice: ✓', 'Payment is safe, using a saga with refunds: ✓', 'The system is protected from overload: ✓', 'Next: bot defences and best-available seat allocation'],
  refs:['case:irctc', 'l:distributed-locks', 'l:load-shedding']});
})();
