/* =====================================================================
   PART 15 · INTERVIEW WORKED SOLUTIONS (B)
   Payment system · WhatsApp · Instagram · Twitter/X · Google Drive
   Numbers are illustrative unless a source is named.
   ===================================================================== */
(function(){
const SDA = window.SDA;
const S = def => SDA.register(Object.assign({kind:'solution'}, def));
const ceil = Math.ceil;

/* ------------------------------------------------------------------ */
S({id:'payment-system', level:'advanced', icon:'💳', title:'Payment system', tags:['idempotency', 'ledger', 'reconciliation'],
  tagline:'Throughput is modest; correctness is everything. Never charge twice, never lose a payment, and make the money add up to the last paisa.',
  prompt:'Design the payment system for a large e-commerce site. Customers pay for orders with cards and UPI through external payment gateways.',
  focus:'idempotency, what happens when a gateway call times out, and how you prove the books balance.',
  clarify:{
    think:`<p>First I need to know which side we are on. Building a payment gateway is a different problem from a merchant integrating gateways. I’ll assume merchant side unless told otherwise. Then the real questions: what does “never double-charge” mean when a call times out, and do we need a ledger?</p>`,
    ask:[['Are we the gateway, or a merchant calling gateways?', 'Merchant side, integrating two payment service providers (PSPs)'], ['Payment methods?', 'Cards, UPI, wallets: all through PSPs'], ['Volume?', '~10M payments/day; sale days peak at several × average'], ['Do we store card numbers?', 'No. The PSP’s hosted fields tokenise cards (keeps us mostly out of PCI scope)'], ['Refunds? Seller payouts?', 'Refunds yes; payouts out of scope, but the ledger should support them'], ['Consistency?', 'Never double-charge, never lose a payment; daily reconciliation with PSPs']],
    fr:['Create a payment for an order and hand the user to the PSP flow (3-D Secure, UPI collect)', 'Receive results by webhook and update the order', 'Full and partial refunds', 'Double-entry ledger of every money movement', 'Daily reconciliation with PSP settlement reports'],
    nfr:['Exactly-once effect for charges and refunds', 'Strong consistency and an audit trail (append-only)', '99.99% for payment initiation', 'No card data in our systems'],
    out:['fraud models (assume a risk API exists)', 'seller payouts', 'currency conversion']},
  estimate:{
    think:`<p>I expect the numbers to be small compared with feeds or chat, and that is the point I want to make: <b>this design is driven by correctness, not scale</b>.</p>`,
    assume:['~3 PSP events (webhooks) per payment', '~200 B per ledger entry'],
    inputs:[['perDay', 'Payments per day', 1e7, [1e6, 1e7, 5e7, 1e8, 5e8]], ['peak', 'Sale-day peak ÷ average', 5, [2, 5, 10, 20], '×'], ['entries', 'Ledger entries per payment', 4, [2, 4, 6]], ['years', 'Keep records for', 8, [5, 8, 10], 'years']],
    rows:[
      ['avg', 'Payments (average)', v => v.perDay / 86400, '/s', 'per day ÷ 86,400'],
      ['pk', 'Payments (sale peak)', (v, r) => r.avg * v.peak, '/s', 'average × peak factor'],
      ['hooks', 'Webhooks at peak', (v, r) => r.pk * 3, '/s', 'peak × 3 events'],
      ['rows', 'Ledger entries per day', v => v.perDay * v.entries, 'n', 'payments × entries'],
      ['store', 'Ledger size over retention', v => v.perDay * v.entries * 200 * 365 * v.years, 'B', 'entries × 200 B × 365 × years']],
    so:(r, f) => `Even at the sale peak (payments ${f('pk')}, webhooks ${f('hooks')}) ${r.pk < 3000 ? 'this is modest for one well-tuned relational primary, so use <b>a relational database with real transactions</b> for payments and the ledger' : 'one primary would be stretched, so <b>partition payments and ledger accounts by merchant or account id</b>, keeping each transaction inside one partition'}. The ledger grows to ${f('store')} over the retention period: partition by month and move old partitions to cheaper storage, but never delete or update entries.`},
  api:{
    think:`<p>Every write endpoint takes an <b>Idempotency-Key</b>. If the client retries after a timeout, it must get the original result, not a second charge. I also never trust the browser redirect to tell me a payment succeeded; the server confirms with the PSP (webhook or status call).</p>`,
    rows:[['POST /v1/payments', 'Create a payment {order_id, amount_minor, currency, method} → {payment_id, status, next_action}', 'Idempotency-Key required; amount in paise as an integer'], ['GET /v1/payments/{id}', 'Current status', 'Polled by checkout until final'], ['POST /v1/payments/{id}/refunds', 'Refund {amount_minor, reason}', 'Idempotency-Key; partial allowed up to captured amount'], ['POST /webhooks/{psp}', 'PSP result events', 'Signature verified; deduplicated by PSP event id']],
    code:`POST /v1/payments
Idempotency-Key: ord-77812-pay-1
{ "order_id": "77812", "amount_minor": 64000, "currency": "INR", "method": "upi" }

201 Created
{ "payment_id": "pay_3Kd9", "status": "requires_action",
  "next_action": { "type": "upi_collect", "vpa": "asha@okbank" } }

# The same request again (client retried after a timeout):
200 OK   (identical body, no second payment created)`, title:'create (and retry)'},
  data:{
    think:`<p>Two models. <b>Payments</b> are a state machine with one row per payment. The <b>ledger</b> is append-only double-entry: every money movement is a transaction whose entries sum to zero. Money is stored as integer minor units, never floats.</p>`,
    code:`CREATE TABLE payments (
  id            text PRIMARY KEY,
  order_id      text NOT NULL,
  idem_key      text NOT NULL UNIQUE,         -- duplicates rejected by the database
  amount_minor  bigint NOT NULL CHECK (amount_minor > 0),
  currency      char(3) NOT NULL,
  status        text NOT NULL,                -- CREATED → PENDING → CAPTURED | FAILED; REFUNDED…
  psp           text, psp_ref text,
  version       int  NOT NULL DEFAULT 0,      -- optimistic concurrency
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (                  -- append-only: corrections are new entries
  id          bigserial PRIMARY KEY,
  txn_id      text   NOT NULL,                 -- groups entries of one movement
  account     text   NOT NULL,                 -- 'customer:42', 'psp_clearing:B', 'merchant:7'
  amount_minor bigint NOT NULL,                -- +debit / -credit; SUM per txn_id = 0
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox (id bigserial PRIMARY KEY, topic text, payload jsonb, sent boolean DEFAULT false);`,
    stores:[['payments, ledger, outbox', 'Postgres (synchronous replica, RPO = 0)', 'Transactions, constraints, audit'], ['idempotency responses', 'Same database, same transaction', 'Can’t drift from the payment row'], ['events', 'Outbox → Kafka', 'Orders, emails, analytics, ledger'], ['settlement files', 'Object storage', 'Raw PSP reports kept for audit']]},
  hld:{
    think:`<p>The payment service owns the state machine and talks to PSPs through a router that can pick or fail over between them. Results come back by webhook. Every state change writes an outbox row in the same transaction, so the ledger and the order service can’t miss an event. Reconciliation is a separate daily job.</p>`,
    diagram:{n:[['c', 'client', 'Checkout', '', 0, 1], ['ord', 'service', 'Order svc', '', 1, 0], ['pay', 'service', 'Payment svc', 'state machine', 1, 1], ['router', 'service', 'PSP router', 'pick / fail over', 2, 0], ['pdb', 'db', 'Payments DB', 'payments + outbox', 2, 1], ['psp', 'ext', 'PSP A / B', 'cards, UPI', 3, 0], ['wh', 'service', 'Webhook handler', 'verify + dedupe', 3, 1], ['q', 'queue', 'Events', 'Kafka', 2, 2], ['led', 'service', 'Ledger svc', 'double-entry', 3, 2], ['ldb', 'db', 'Ledger DB', 'append-only', 4, 2], ['rec', 'service', 'Reconciliation', 'daily', 4, 0]],
      e:'c>ord ord>pay pay>router router>psp psp>wh wh>pdb pay>pdb pdb>q q>led led>ldb rec>psp rec>ldb',
      f:[['Create: the order service asks for a payment with an idempotency key; the row starts as CREATED and goes to the chosen PSP.', 'c>ord:place order 77812|ord>pay:POST /payments (key ord-77812-pay-1)|pay>pdb:INSERT CREATED|pay>router:UPI → PSP B|router>psp:create payment intent'], ['Result: the PSP calls our webhook; we verify the signature and move to CAPTURED with an outbox row in one transaction.', 'psp>wh:payment.captured (signed)|wh>pdb:CAPTURED + outbox'], ['Ledger: the outbox relay publishes the event and the ledger writes balanced entries.', 'pdb>q:payment.captured|q>led|led>ldb:+64000 psp_clearing / −64000 merchant'], ['Reconciliation: each day, match the PSP settlement file against the ledger.', 'rec>psp:settlement report|rec>ldb:match every entry']]},
    walk:['Checkout calls the order service, which calls <code>POST /payments</code> with key <code>ord-77812-pay-1</code>.', 'The payment row is inserted (or the stored response is returned if the key exists), the router picks a PSP, and the user completes UPI approval in their app.', 'The PSP sends a signed webhook; the handler dedupes by event id and moves PENDING → CAPTURED with a conditional update, writing an outbox row in the same transaction.', 'The ledger consumes the event and posts entries that sum to zero; the order service marks the order paid.']},
  deep:[
    {t:'Idempotency end to end',
      think:`<p>Retries happen at every hop: the browser, the order service, our calls to the PSP, and the PSP’s webhooks. Each hop needs its own guard. The rule I follow: <b>a retry must reuse the same identity</b>. Never retry a timed-out charge with a new id; that is exactly how people get charged twice.</p>`,
      body:`<ul><li><b>Our API:</b> unique <code>idem_key</code>; store the response with the payment in the same transaction.</li><li><b>Calls to the PSP:</b> send our payment id as the PSP’s idempotency key or merchant reference.</li><li><b>Webhooks:</b> unique constraint on the PSP event id; process each once.</li><li><b>State changes:</b> conditional updates (<code>WHERE status = 'PENDING'</code>), so a late or duplicate event can’t move a payment backwards.</li></ul>`,
      code:{lang:'ts', title:'create-payment.ts', src:`export async function createPayment(req: CreateReq, key: string) {
  return db.tx(async t => {
    // 1. Same key seen before? Return the original answer.
    const prev = await t.one("SELECT response FROM payments WHERE idem_key = $1", [key]).catch(() => null);
    if (prev) return prev.response;
    // 2. Insert first: a concurrent duplicate fails on the UNIQUE constraint and retries step 1.
    const id = newId("pay");
    await t.none("INSERT INTO payments (id, order_id, idem_key, amount_minor, currency, status) " +
                 "VALUES ($1, $2, $3, $4, $5, 'CREATED')", [id, req.orderId, key, req.amountMinor, req.currency]);
    const response = { payment_id: id, status: "CREATED" };
    await t.none("UPDATE payments SET response = $2 WHERE id = $1", [id, response]);
    return response;
  });
  // The PSP call happens after commit, using id as the PSP idempotency key.
}`}},
    {t:'The unknown outcome: when the PSP call times out',
      think:`<p>The worst moment in a payment system is a timeout: the charge may or may not have happened. The answer is <b>never guess</b>. The payment moves to <code>PENDING</code> (unknown), and we resolve it by asking the PSP for the status of <i>our</i> reference, by waiting for the webhook, and finally by reconciliation. Only a definite “failed” lets the user retry, and a retry is a new attempt linked to the same order, so the order can’t be paid twice.</p>`},
    {t:'Double-entry ledger and reconciliation',
      think:`<p>A balance column that gets updated is impossible to audit. A <b>double-entry ledger</b> records every movement as entries that sum to zero (money moves from one account to another, never appears or vanishes), and balances are sums of entries. Mistakes are corrected with new reversing entries. Reconciliation then compares three sources daily: our payments table, our ledger, and the PSP’s settlement report. Every mismatch goes to a queue for a human.</p>`,
      code:{lang:'sql', title:'checks.sql', src:`-- Every transaction must balance
SELECT txn_id FROM ledger_entries GROUP BY txn_id HAVING SUM(amount_minor) <> 0;   -- expect 0 rows

-- Captured payments with no settlement line from the PSP after 3 days
SELECT p.id FROM payments p
LEFT JOIN psp_settlements s ON s.psp_ref = p.psp_ref
WHERE p.status = 'CAPTURED' AND p.updated_at < now() - interval '3 days' AND s.psp_ref IS NULL;`}}],
  bottlenecks:{
    think:`<p>At this scale the risks are external dependencies and correctness edge cases more than raw throughput.</p>`,
    rows:[['A PSP has an outage', 'Success rate for one PSP drops', 'Router fails over by method; track success rate per PSP and bank'], ['Webhooks delayed or lost', 'Payments stuck in PENDING', 'Poll PSP status for anything PENDING > a few minutes; reconciliation as the backstop'], ['A hot merchant balance row', 'Lock waits when every payment updates one row', 'Don’t update a balance per payment; derive from entries plus periodic snapshots'], ['Sale-day spike', 'Database CPU and connection limits', 'Connection pooling, partition by merchant, shed non-payment work first'], ['Primary fails over', 'Risk of losing acknowledged writes', 'Synchronous replication for the payments database (RPO = 0)']]},
  tradeoffs:{
    think:`<p>Every decision here leans towards <b>auditability and safety over speed</b>.</p>`,
    rows:[['Database', 'Relational with transactions', 'NoSQL', 'Constraints and atomic multi-row writes; scaling needs partitioning work'], ['Cross-service consistency', 'Outbox + idempotent consumers (saga)', 'Two-phase commit', 'No distributed locks; consumers must handle duplicates'], ['Balances', 'Derived from an append-only ledger', 'Mutable balance column', 'Fully auditable; reads need sums or snapshots'], ['PSPs', 'Two, with routing', 'One', 'Resilience and better success rates; two integrations to maintain']],
    more:['Risk scoring before authorisation', 'Smart routing by bank and method success rates', 'Seller payouts from the same ledger', 'Multi-currency accounts'],
    followups:[['How does a refund work?', 'A refund is a new idempotent request with its own key. It calls the PSP’s refund API with our refund id and, when confirmed, posts reversing ledger entries. Partial refunds are capped at the captured amount minus earlier refunds, checked inside a transaction.'], ['The PSP charged the customer but our database write failed. Now what?', 'Our payment row exists as CREATED/PENDING before we call the PSP, so it can’t vanish. The webhook or a status poll finishes it; if both fail, the daily settlement report shows a charge we didn’t record, and reconciliation flags it for capture or refund.'], ['How do you stay out of PCI scope?', 'Card numbers never touch our servers: the PSP’s hosted fields or SDK tokenise the card in the browser, and we only see a token. That limits our compliance scope to a much smaller self-assessment.']],
    traps:['Floats for money', 'Retrying a timed-out charge with a new id', 'Trusting the browser redirect instead of a server-side confirmation', 'A mutable balance column with no ledger']},
  refs:['case:stripe', 'case:upi', 'l:idempotency-rate-limit-headers', 'l:saga-outbox', 'l:transactions-isolation', 'l:two-phase-commit', 'pg:saga-2pc']});

/* ------------------------------------------------------------------ */
S({id:'whatsapp', level:'intermediate', icon:'💬', title:'WhatsApp', tags:['WebSockets', 'delivery receipts', 'ordering'],
  tagline:'Hundreds of millions of open connections, messages that must arrive once and in order, and phones that are offline half the time.',
  prompt:'Design a chat app like WhatsApp: one-to-one and group messages with sent, delivered and read receipts.',
  focus:'routing a message to the right connection, delivery guarantees with ✓ / ✓✓ / read, ordering, and group fan-out.',
  clarify:{
    think:`<p>Chat has a few classic sub-problems: <b>long-lived connections</b>, <b>finding which server a user is connected to</b>, <b>at-least-once delivery without duplicates</b>, and <b>ordering</b>. I’ll check scale and features so I know how much time each deserves.</p>`,
    ask:[['1:1 and groups? Group size?', 'Both; groups up to a few hundred members'], ['Daily active users?', '~500M'], ['Messages per user per day?', '~40'], ['Receipts and presence?', 'Sent ✓, delivered ✓✓, read; online / last seen'], ['Message history on the server?', 'Kept only until delivered to every device (devices hold history)'], ['End-to-end encryption?', 'Yes: the server sees ciphertext only']],
    fr:['Send and receive 1:1 and group messages', 'Offline delivery when the user comes back', 'Sent / delivered / read receipts', 'Online status and last seen', 'Photos and videos'],
    nfr:['Real-time: under ~200 ms when both users are online', 'No lost messages; no duplicates shown', 'Messages in a chat appear in the same order for everyone', 'Works on flaky mobile networks'],
    out:['voice and video calls', 'message search on the server', 'payments']},
  estimate:{
    think:`<p>Two numbers size this: <b>concurrent connections</b> (sizes the gateway fleet) and <b>messages per second</b> (sizes routing and storage). Storage is small because the server only keeps undelivered messages.</p>`,
    assume:['~100K open connections per gateway server (illustrative)', 'peak ≈ 3× average', '~200 B per text message (ciphertext + metadata)'],
    inputs:[['dau', 'Daily active users', 5e8, [1e7, 1e8, 5e8, 2e9]], ['msgs', 'Messages per user per day', 40, [10, 40, 100]], ['online', 'Online at the same time', 30, [10, 30, 50], '%']],
    rows:[
      ['avg', 'Messages (average)', v => v.dau * v.msgs / 86400, '/s', 'users × messages ÷ 86,400'],
      ['pk', 'Messages (peak)', (v, r) => r.avg * 3, '/s', '3× average'],
      ['conns', 'Open connections', v => v.dau * v.online / 100, 'n', 'users × online share'],
      ['gws', 'Gateway servers', (v, r) => ceil(r.conns / 1e5), 'servers', 'connections ÷ 100K'],
      ['day', 'Message bytes per day', v => v.dau * v.msgs * 200, 'B/day', 'messages × 200 B']],
    so:(r, f) => `${f('conns')} open connections need about <b>${f('gws')}</b>: connection count, not message rate, sizes the edge. At ${f('pk')} at peak, every message must find the recipient’s gateway, so a fast <b>session registry</b> (user → gateway) is the key lookup. About ${f('day')} of messages pass through, but most are delivered within seconds and deleted, so storage holds only the undelivered backlog.`},
  api:{
    think:`<p>Messages travel over a persistent <b>WebSocket</b> (or MQTT-style) connection, not REST; REST is only for media upload and catching up after reconnecting. Every message carries a <b>client-generated id</b>, which makes retries safe.</p>`,
    rows:[['WS send {client_msg_id, chat_id, body}', 'Send a message', 'Server replies ack {client_msg_id, seq} → ✓'], ['WS deliver {chat_id, seq, sender, body}', 'Server → recipient device', 'Device replies delivered ack → ✓✓ to sender'], ['WS read {chat_id, up_to_seq}', 'Read receipt', 'One receipt covers all earlier messages'], ['GET /v1/sync?since={cursor}', 'Fetch pending messages after reconnect', 'Paginated'], ['POST /v1/media', 'Get an upload URL for encrypted media', 'Message carries the media key + URL']],
    code:`→ {"t":"send","client_msg_id":"c1f0-…","chat_id":981,"body":"<ciphertext>"}
← {"t":"ack","client_msg_id":"c1f0-…","seq":812}                 // ✓ sent
← {"t":"deliver","chat_id":981,"seq":812,"from":42,"body":"…"}   // to Bob
→ {"t":"delivered","chat_id":981,"seq":812}                      // Bob's phone: ✓✓
→ {"t":"read","chat_id":981,"up_to_seq":812}                     // blue ticks`, lang:'json', title:'WebSocket frames'},
  data:{
    think:`<p>Access is “append to a chat” and “give me everything pending for this device”. That’s a wide-column store partitioned by chat (and by user for the pending inbox), with ordered clustering keys. The session registry is tiny, hot and short-lived, so it lives in memory.</p>`,
    code:`-- Cassandra-style tables
CREATE TABLE messages (
  chat_id   bigint,
  seq       bigint,        -- per-chat order, assigned by the chat's owner partition
  msg_id    uuid,          -- client id: dedupe key
  sender_id bigint,
  body      blob,          -- ciphertext only
  PRIMARY KEY ((chat_id), seq)
);
CREATE TABLE pending (     -- what each device still has to receive; deleted on delivered-ack
  user_id bigint, device_id int, chat_id bigint, seq bigint,
  PRIMARY KEY ((user_id, device_id), chat_id, seq)
) WITH default_time_to_live = 2592000;   -- 30 days`,
    stores:[['messages, pending', 'Cassandra / ScyllaDB', 'Huge write rate; partition by chat / device'], ['session registry', 'Redis (user → gateway, with TTL heartbeat)', 'Looked up on every message'], ['groups, contacts', 'Sharded SQL or wide-column', 'Small, read-mostly'], ['media', 'Object storage + CDN (encrypted blobs)', 'Big bytes, fetched once or twice']]},
  hld:{
    think:`<p>Gateways hold connections and nothing else. The chat service assigns sequence numbers, stores the message, looks up where the recipient is connected, and forwards it. If the recipient is offline, the message waits in their pending inbox and a push notification wakes the phone.</p>`,
    diagram:{n:[['a', 'client', 'Alice', 'phone', 0, 0], ['b', 'client', 'Bob', 'phone', 0, 2], ['gw1', 'service', 'Gateway 1', 'WebSockets', 1, 0], ['gw2', 'service', 'Gateway 7', 'WebSockets', 1, 2], ['chat', 'service', 'Chat svc', 'seq + route', 2, 1], ['reg', 'cache', 'Session registry', 'user → gateway', 3, 0], ['db', 'db', 'Messages', 'Cassandra', 3, 1], ['push', 'ext', 'APNs / FCM', '', 3, 2]],
      e:'a>gw1 b>gw2 gw1>chat chat>gw2 chat>reg chat>db chat>push',
      f:[['Send: Alice’s gateway forwards to the chat service, which assigns seq 812, stores it and acks: one tick.', 'a>gw1:msg (client id c1f0)|gw1>chat|chat>db:append seq 812|gw1>a:✓ sent'], ['Deliver: look up Bob’s gateway, forward, and when his phone acks, tell Alice: two ticks.', 'chat>reg:where is Bob?|chat>gw2:deliver seq 812|gw2>b:message|b>gw2:delivered ack|gw2>chat|chat>gw1:✓✓|gw1>a:✓✓'], ['Offline: Bob isn’t connected, so the message waits in his pending inbox and a push wakes his phone.', 'chat>reg:Bob offline|chat>db:pending for Bob|chat>push:wake Bob']]},
    walk:['Alice’s app sends the ciphertext with a client id; the gateway forwards it to the chat service.', 'The chat service dedupes by client id, assigns the next sequence number for the chat, writes the message and Bob’s pending entry, and acks Alice (✓).', 'It looks up Bob’s gateway in the registry and forwards; Bob’s phone acks; the pending entry is deleted and Alice gets ✓✓.', 'If Bob is offline, a push notification wakes his phone, which reconnects and pulls pending messages.']},
  deep:[
    {t:'Delivery guarantees: ids, acks and receipts',
      think:`<p>Mobile networks drop packets and connections all the time. So every hop is <b>at-least-once with retries</b>, and duplicates are removed with the client message id. The sender keeps retrying until it gets the server ack; the server keeps a pending entry until the device acks. Each tick maps to a durable event: ✓ = stored by the server, ✓✓ = stored on the recipient’s device, read = opened.</p>`,
      code:{lang:'ts', title:'client-outbox.ts', src:`// The phone keeps unsent messages in a local outbox and retries with the SAME id.
async function flush(outbox: Msg[]) {
  for (const m of outbox) {
    if (m.acked) continue;
    socket.send({ t: "send", client_msg_id: m.id, chat_id: m.chat, body: m.body });
  }
}
socket.on("ack", a => { markAcked(a.client_msg_id, a.seq); });   // shows ✓
socket.on("reconnect", () => flush(loadOutbox()));                 // retry safely: server dedupes by id`}},
    {t:'Ordering within a chat',
      think:`<p>Client clocks can’t be trusted, and “global order” isn’t needed, only order within each chat. So each chat has one owner (the chat id is the partition key) that hands out an increasing <b>sequence number</b>. Clients display by sequence number and can detect gaps (“I have 810 and 812, fetch 811”). Two people typing at once still get one agreed order.</p>`},
    {t:'Groups and fan-out',
      think:`<p>A group message is stored once, then delivered to every member’s devices: 256 members × 2 devices is about 500 deliveries. With end-to-end encryption, encrypting separately for each device would be expensive; the Signal protocol’s <b>sender keys</b> (which WhatsApp’s security white paper describes) let the sender encrypt once for the group and distribute the sender key to members pairwise only when membership changes. Very large groups are paced through a fan-out queue so one message doesn’t spike a gateway.</p>`}],
  bottlenecks:{
    think:`<p>Connections are the scary part: what happens when a gateway restarts with 100K users on it?</p>`,
    rows:[['Gateway restart or network blip', 'Reconnect storm: 100K clients at once', 'Jittered reconnect backoff; drain gateways gradually before deploys'], ['Stale registry entries', 'Messages routed to a gateway the user left', 'Heartbeats refresh a TTL; on failure, fall back to pending + push'], ['Large busy groups', 'Fan-out spikes', 'Fan-out queue; batch deliveries per gateway'], ['Users offline for weeks', 'Pending inbox grows', 'TTL on pending entries; cap per device'], ['Push providers throttle', 'Delayed wake-ups', 'Collapse pushes per chat; respect provider limits']]},
  tradeoffs:{
    think:`<p>WhatsApp’s distinctive choice is keeping history on devices, which shapes storage, search and multi-device.</p>`,
    rows:[['Transport', 'Persistent WebSocket / MQTT-style', 'Long polling', 'Lowest latency and battery cost per message; stateful gateways'], ['Server storage', 'Until delivered', 'Full history on the server', 'Smaller and more private; no server-side search, harder multi-device sync'], ['Ordering', 'Per-chat sequence', 'Global order or timestamps', 'Cheap and correct where it matters'], ['Guarantee', 'At-least-once + dedupe', 'Exactly-once protocol', 'Simple and robust on bad networks']],
    more:['Multi-device: each device has its own keys and pending inbox', 'Presence with privacy controls, fanned out only to contacts who are looking', 'Media deduplication of forwarded files', 'Spam and abuse signals that work without reading content'],
    followups:[['How do you show “last seen”?', 'Gateways record connect / disconnect and heartbeats into a presence store. When a chat is open, the app subscribes to that contact’s presence. Privacy settings filter who may see it. Don’t broadcast every change to every contact.'], ['How does end-to-end encryption change the design?', 'The server can route, store and count messages but can’t read, search or moderate content. A key directory service distributes public keys; clients do all encryption. Features like link previews must be generated on the device.'], ['How would you support one account on several devices?', 'Treat each device as a separate recipient with its own keys and pending inbox. The sender encrypts for every device of the recipient (and of itself), and the chat service fans out to all of them.']],
    traps:['Using client timestamps for ordering', 'No message id, so retries create duplicates', 'Storing a message per recipient for groups', 'Forgetting reconnect storms']},
  refs:['case:whatsapp', 'l:websockets-at-scale', 'l:presence', 'l:delivery-semantics', 'l:push-notifications', 'l:offline-first-sync', 'l:fan-out']});

/* ------------------------------------------------------------------ */
S({id:'instagram', level:'intermediate', icon:'📸', title:'Instagram', tags:['feed', 'fan-out', 'media'],
  tagline:'Photos, follows and a home feed. Two problems carry the interview: building feeds cheaply and storing petabytes of images.',
  prompt:'Design Instagram: users post photos, follow other users, and scroll a home feed.',
  focus:'fan-out on write vs read (and celebrities), the photo upload pipeline, and serving images.',
  clarify:{
    think:`<p>I’ll scope to posting, following and the home feed, and ask whether the feed is ranked, because ranking changes the read path. I also want to know about celebrities, because that decides the fan-out strategy.</p>`,
    ask:[['Feed: chronological or ranked?', 'Ranked, but start from posts by people you follow'], ['Daily active users?', '~500M'], ['New posts per day?', '~100M photos'], ['How often do people open the feed?', '~10 times a day'], ['Celebrity accounts?', 'Yes: some have 100M+ followers'], ['Stories, Reels, DMs?', 'Out of scope']],
    fr:['Upload a photo with a caption', 'Follow / unfollow', 'Home feed of posts from followed accounts, newest and most relevant first', 'Like and comment, with counts'],
    nfr:['Feed loads in under ~300 ms', 'Photos load fast worldwide', 'A new post can take a few seconds to appear in followers’ feeds', 'Highly available reads'],
    out:['Stories', 'Reels', 'direct messages', 'explore page']},
  estimate:{
    think:`<p>I want the read : write ratio for the feed, the cost of fan-out, and photo storage per year, which turns out to be the biggest number by far.</p>`,
    assume:['peak ≈ 3× average'],
    inputs:[['dau', 'Daily active users', 5e8, [1e7, 1e8, 5e8, 1e9]], ['posts', 'New posts per day', 1e8, [1e7, 5e7, 1e8, 2e8]], ['opens', 'Feed opens per user per day', 10, [5, 10, 20]], ['size', 'Stored bytes per photo (all sizes)', 1.5e6, [5e5, 1.5e6, 3e6], 'B'], ['fol', 'Average followers', 200, [100, 200, 500]]],
    rows:[
      ['pqps', 'Posts', v => v.posts / 86400, '/s', 'posts ÷ 86,400'],
      ['feed', 'Feed reads (peak)', v => v.dau * v.opens / 86400 * 3, '/s', 'users × opens ÷ 86,400 × 3'],
      ['fan', 'Fan-out inserts', (v, r) => r.pqps * v.fol, '/s', 'posts/s × followers'],
      ['day', 'Photo storage per day', v => v.posts * v.size, 'B/day', 'posts × bytes'],
      ['yr', 'Photo storage per year', (v, r) => r.day * 365, 'B', 'per day × 365']],
    so:(r, f) => `Feed reads (${f('feed')} at peak) far outnumber posts (${f('pqps')}), so precompute feeds and make each read one lookup. That costs ${f('fan')} in inbox inserts at the average follower count, ${r.fan < 2e6 ? 'which is affordable' : 'which is already heavy'}; but a celebrity with 100M followers would add 100M inserts for one post, so <b>celebrities are merged in at read time</b>. Photos dominate storage at ${f('yr')} a year: object storage plus a CDN, never the database.`},
  api:{
    think:`<p>Uploads go <b>directly to object storage</b> with a presigned URL, so our API servers never carry photo bytes. The feed uses cursor pagination because the list changes while you scroll.</p>`,
    rows:[['POST /v1/uploads', 'Get a presigned upload URL', 'Client PUTs the photo straight to storage'], ['POST /v1/posts', 'Create a post {upload_id, caption}', 'Idempotency-Key'], ['GET /v1/feed?cursor=', 'Next page of the home feed', 'Returns posts + next cursor'], ['POST /v1/users/{id}/follow', 'Follow / DELETE to unfollow', ''], ['POST /v1/posts/{id}/likes', 'Like', 'Counts are eventually consistent']],
    code:`GET /v1/feed?cursor=eyJ0IjoxNzMx…
200 OK
{ "posts": [ { "id": "3197…", "author": "asha", "image": "https://cdn…/3197_1080.jpg",
               "caption": "Monsoon in Munnar", "likes": 1204 } ],
  "next_cursor": "eyJ0IjoxNzMx…" }`, title:'feed page'},
  data:{
    think:`<p>Posts and the follow graph are relational and naturally <b>sharded by user id</b>. Post ids are time-sortable 64-bit ids (Snowflake-style), so “newest first” needs no timestamp index across shards. The precomputed feed is a capped list of post ids per user in a cache.</p>`,
    code:`CREATE TABLE posts (
  id          bigint PRIMARY KEY,       -- time-sortable 64-bit id
  author_id   bigint NOT NULL,          -- shard key
  caption     text,
  media_key   text NOT NULL,            -- object storage key; sizes derived from it
  created_at  timestamptz NOT NULL
);
CREATE TABLE follows (
  follower_id bigint, followee_id bigint, created_at timestamptz,
  PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX follows_by_followee ON follows (followee_id, follower_id);  -- "who follows me" for fan-out
-- Feed cache (Redis): LIST feed:{user_id} -> newest ~500 post ids`,
    stores:[['posts, users, follows', 'Postgres sharded by user id', 'Relational; shard-local queries'], ['home feeds', 'Redis lists (active users only)', 'One read per feed open'], ['photos', 'Object storage, several sizes, behind a CDN', 'Petabytes; cacheable forever'], ['like counts', 'Counter service (batched increments)', 'Hot posts get huge write rates']]},
  hld:{
    think:`<p>Two flows: <b>write</b> (upload → post → async fan-out into followers’ feed lists) and <b>read</b> (feed list + celebrity posts → rank → hydrate → images from the CDN).</p>`,
    diagram:{n:[['u', 'client', 'App', '', 0, 1], ['cdn', 'cdn', 'CDN', 'photos', 1, 0], ['gw', 'lb', 'API gateway', '', 1, 1], ['media', 'db', 'Object storage', 'photo sizes', 2, 0], ['post', 'service', 'Post svc', '', 2, 1], ['feedsvc', 'service', 'Feed svc', 'merge + rank', 2, 2], ['fq', 'queue', 'Fan-out queue', '', 3, 0], ['pdb', 'db', 'Posts DB', 'sharded by user', 3, 2], ['graph', 'db', 'Follow graph', '', 4, 1], ['fw', 'service', 'Fan-out workers', '', 4, 0], ['fc', 'cache', 'Feed cache', 'post ids per user', 3, 1]],
      e:'u>cdn u>gw u>media cdn>media gw>post gw>feedsvc post>pdb post>fq fq>fw fw>graph fw>fc feedsvc>fc feedsvc>pdb feedsvc>graph',
      f:[['Post: the photo goes straight to object storage; then the post is created and an event queued.', 'u>media:PUT photo (presigned)|u>gw:POST /posts|gw>post|post>pdb:INSERT post|post>fq:new post event'], ['Fan-out: workers find the author’s followers and push the post id into each feed list (skipped for celebrities).', 'fq>fw|fw>graph:followers of @asha (12K)|fw>fc:push post id × 12K'], ['Read: precomputed ids + recent celebrity posts → rank → hydrate; images come from the CDN.', 'u>gw:GET /feed|gw>feedsvc|feedsvc>fc:500 post ids|feedsvc>graph:celebrities I follow|feedsvc>pdb:hydrate top 20|u>cdn:load photos']]},
    walk:['The app gets a presigned URL and uploads the photo; a background job creates resized versions.', 'The app creates the post; the post service writes it to the author’s shard and publishes an event.', 'Fan-out workers append the post id to each follower’s feed list (active followers only).', 'On feed open, the feed service reads the list, merges recent posts from followed celebrities, ranks the candidates, hydrates the top 20 and returns CDN image URLs.']},
  deep:[
    {t:'Fan-out on write, on read, or both',
      think:`<p>Push (write-time) fan-out makes reads cheap but makes a celebrity post cost one insert per follower. Pull (read-time) makes posting cheap but each feed read must query everyone you follow. A <b>hybrid</b> takes the best of both: push for normal accounts, pull for accounts above a follower threshold, and skip precomputing feeds for users who haven’t opened the app in weeks.</p>`,
      body:`<table class="tbl"><thead><tr><th></th><th>Push (on write)</th><th>Pull (on read)</th><th>Hybrid</th></tr></thead><tbody>
<tr><td>Post cost</td><td>One insert per follower</td><td>One insert</td><td>Push only below the threshold</td></tr>
<tr><td>Feed read</td><td>One list read</td><td>Query every followee</td><td>List + a few celebrities</td></tr>
<tr><td>Celebrity post</td><td>100M inserts</td><td>Cheap</td><td>Cheap</td></tr></tbody></table>`},
    {t:'The photo pipeline',
      think:`<p>Photo bytes should never pass through API servers. The client uploads to object storage with a presigned URL; a storage event triggers workers that <b>resize</b> to a few standard widths, strip location metadata, run moderation, and write the final keys. Keys include a content hash, so CDN copies can be cached forever. The post becomes visible once at least the feed-size image is ready.</p>`},
    {t:'Ranking and counters',
      think:`<p>Ranking works in two stages: <b>candidates</b> (the feed list plus celebrity posts, a few hundred ids) and <b>scoring</b> with a light model using features like relationship strength, recency and early engagement. Like counts on a viral post can reach thousands of writes per second on one row, so likes are recorded as events and counted in batches (or with sharded counters); the number shown is a few seconds behind.</p>`}],
  bottlenecks:{
    think:`<p>I check each store against the worst case, not the average.</p>`,
    rows:[['Celebrity posts', 'Fan-out queue lag spikes', 'Pull celebrities at read time'], ['Feed cache memory', 'Hundreds of millions of lists', 'Only active users; cap at ~500 ids; rebuild on demand for returning users'], ['Viral post likes', 'One hot counter row', 'Batched or sharded counters'], ['Upload spikes (festivals, New Year)', 'Resize workers backlog', 'Queue + autoscaling; show the post as “processing”'], ['Shard hot spots', 'A celebrity’s shard gets heavy reads', 'Cache their recent posts; read replicas']]},
  tradeoffs:{
    think:`<p>The feed is <b>eventually consistent on purpose</b>: a few seconds of delay buys a massively cheaper read path.</p>`,
    rows:[['Feed build', 'Hybrid fan-out', 'Pure push or pure pull', 'Cheap reads and bounded post cost; two code paths'], ['Ordering', 'Ranked candidates', 'Pure chronological', 'More engaging; harder to debug and explain'], ['Freshness', 'Seconds of lag', 'Immediate', 'Async fan-out absorbs spikes'], ['Media', 'Object storage + CDN', 'Database blobs', 'Cheap and fast; extra pipeline to manage']],
    more:['Stories: a separate store with 24-hour TTLs, pulled at read time', 'Explore: candidates from outside your network', 'Spam and integrity filters before fan-out', 'Region-local CDNs and image formats like WebP/AVIF'],
    followups:[['How do you handle unfollow?', 'Remove the relation immediately and filter that author out at read time; clean the feed list lazily. Rebuilding every follower’s list synchronously isn’t worth it.'], ['How do you paginate a ranked feed that keeps changing?', 'Rank a candidate set once per session and return a cursor pointing into that snapshot, so scrolling doesn’t show duplicates or skip posts. New posts appear on the next refresh.'], ['A user comes back after six months. Their feed list is gone. Now what?', 'Build it on demand with a pull from the accounts they follow (a slower first load), then resume normal fan-out for them.']],
    traps:['Pure push without mentioning celebrities', 'Photos in the database or through API servers', 'Offset pagination on a live feed', 'Strongly consistent like counts']},
  refs:['case:feed', 'l:fan-out', 'pg:fanout', 'l:cdn', 'l:sharding', 'l:recommendations', 'l:unique-ids']});

/* ------------------------------------------------------------------ */
S({id:'twitter', level:'advanced', icon:'🐦', title:'Twitter / X', tags:['timelines', 'real-time search', 'trends'],
  tagline:'Like Instagram’s feed but more extreme: huge follower skews, real-time search over every new post, and traffic that spikes with world events.',
  prompt:'Design Twitter/X: users post short posts, follow others, read a home timeline, and search recent posts.',
  focus:'the celebrity fan-out problem, real-time search indexing, and surviving spikes during big events.',
  clarify:{
    think:`<p>Twitter’s feed looks like Instagram’s, so I’ll spend less time on the basic fan-out and more on what is different here: <b>extreme follower skew</b>, <b>search within seconds of posting</b>, and <b>event spikes</b>. I’ll confirm all three.</p>`,
    ask:[['Timeline: chronological or “For you”?', 'Start with “Following” (chronological), mention ranking'], ['Scale?', '~250M daily users; ~500M posts per day'], ['Search?', 'Recent posts by keyword, visible within seconds'], ['Trending topics?', 'Yes, per country'], ['Follower skew?', 'Some accounts have 100M+ followers'], ['Media?', 'Images and video via a separate media service; not the focus']],
    fr:['Post (280 characters + media)', 'Follow / unfollow', 'Home timeline', 'Keyword search of recent posts', 'Trending topics'],
    nfr:['Timeline reads under ~200 ms', 'New posts searchable within ~10 s', 'Survive spikes of many times normal posting rate', 'Eventual consistency is fine for timelines and counts'],
    out:['DMs', 'ads', 'Spaces']},
  estimate:{
    think:`<p>Twitter published that it handles around 500M tweets a day and once hit a record of about 143K tweets per second during a TV event in 2013. I’ll use those as anchors and compute the fan-out cost.</p>`,
    assume:['~300 B per post (text + metadata)', 'spikes of ~25× average during big events'],
    inputs:[['dau', 'Daily active users', 2.5e8, [5e7, 1e8, 2.5e8, 5e8]], ['posts', 'Posts per day', 5e8, [1e8, 5e8, 1e9]], ['reads', 'Timeline loads per user per day', 20, [5, 20, 50]], ['fol', 'Followers per post (average)', 300, [100, 300, 1000]]],
    rows:[
      ['tps', 'Posts (average)', v => v.posts / 86400, '/s', 'posts ÷ 86,400'],
      ['spike', 'Posts (event spike)', (v, r) => r.tps * 25, '/s', '25× average'],
      ['tl', 'Timeline reads', v => v.dau * v.reads / 86400, '/s', 'users × loads ÷ 86,400'],
      ['fan', 'Timeline inserts (fan-out)', (v, r) => r.tps * v.fol, '/s', 'posts/s × followers'],
      ['store', 'New post text per day', v => v.posts * 300, 'B/day', 'posts × 300 B']],
    so:(r, f) => `Fan-out inserts (${f('fan')}) dwarf the posts themselves (${f('tps')}); that’s the price of making ${f('tl')} timeline reads a single in-memory list read. During an event spike (${f('spike')}) fan-out falls behind first, so it must be queued and allowed to lag. Text storage (${f('store')}) is small; the work is in fan-out and indexing.`},
  api:{
    think:`<p>Few endpoints, and all reads use cursors based on time-sortable post ids.</p>`,
    rows:[['POST /2/posts', 'Create a post {text, media_ids?, reply_to?}', 'Idempotency-Key; returns id'], ['GET /2/timeline/home?cursor=', 'Home timeline page', 'Cursor = last seen post id'], ['GET /2/search?q=&cursor=', 'Recent posts matching the query', 'Newest first'], ['GET /2/trends?country=IN', 'Current trending topics', 'Cached for ~a minute'], ['POST /2/users/{id}/follow', 'Follow', '']],
    code:`GET /2/search?q=%23IPLFinal&cursor=1857002318
200 OK
{ "posts": [ { "id": "1857002401…", "author": "cricfan", "text": "What a finish! #IPLFinal" } ],
  "next_cursor": "1857002299…" }`, title:'search page'},
  data:{
    think:`<p>Post ids are 64-bit and time-ordered (Twitter built Snowflake for exactly this), so sorting by id sorts by time and every shard can generate ids alone. Timelines are lists of ids in memory; the post bodies live once in a post store.</p>`,
    code:`-- 64-bit id = 41 bits ms timestamp | 10 bits machine | 12 bits sequence
CREATE TABLE posts (
  id         bigint PRIMARY KEY,   -- time-sortable
  author_id  bigint NOT NULL,
  text       varchar(280) NOT NULL,
  reply_to   bigint,
  created_at timestamptz NOT NULL
);
-- Home timeline (Redis):  LIST home:{user_id}   -> newest few hundred post ids
-- Author timeline:        LIST user:{author_id} -> that author's recent post ids (used for celebrities)
-- Search index: term -> posting list of post ids, partitioned by time (newest in memory)`,
    stores:[['posts', 'Sharded store keyed by post id', 'Hydration by id; immutable rows'], ['home / author timelines', 'Redis clusters (replicated)', 'Reads are list reads'], ['follow graph', 'Dedicated graph service', 'Followers for fan-out; followees for reads'], ['search', 'Time-partitioned inverted index', 'Fresh posts indexed in seconds'], ['events', 'Kafka-style log', 'Feeds fan-out, search, trends, analytics']]},
  hld:{
    think:`<p>A post is written once and published as an event. Three independent consumers react: <b>fan-out</b> into home timelines, the <b>search indexer</b>, and <b>trends</b> counting. Reads stay simple: list read + celebrity merge + hydrate.</p>`,
    diagram:{n:[['u', 'client', 'App', '', 0, 1], ['tdb', 'db', 'Posts store', 'by post id', 1, 0], ['gw', 'lb', 'API gateway', '', 1, 1], ['tw', 'service', 'Post svc', 'Snowflake ids', 2, 0], ['tls', 'service', 'Timeline svc', 'merge celebrities', 2, 1], ['ss', 'service', 'Search svc', '', 2, 2], ['k', 'queue', 'Post events', 'log', 3, 0], ['idx', 'db', 'Search index', 'by time', 3, 2], ['fo', 'service', 'Fan-out svc', 'skip celebrities', 4, 0], ['tl', 'cache', 'Timeline cache', 'Redis lists', 4, 1], ['ing', 'service', 'Indexer', 'seconds', 4, 2]],
      e:'u>gw gw>tw gw>tls gw>ss tw>tdb tw>k k>fo fo>tl tls>tl tls>tdb k>ing~0.25 ing>idx ss>idx',
      f:[['Post: stored with a time-sortable id and published as an event.', 'u>gw:POST post|gw>tw|tw>tdb:INSERT 1857…|tw>k:post.created'], ['Fan-out: push the id into each follower’s cached timeline, unless the author is a celebrity.', 'k>fo:followers of @cricfan (3K)|fo>tl:push id × 3K'], ['Home timeline: cached ids + recent celebrity posts, hydrated from the posts store.', 'u>gw:GET home|gw>tls|tls>tl:my ids|tls>tdb:celebrity posts + hydrate'], ['Search: the indexer adds the post to the newest in-memory partition within seconds.', 'k>ing|ing>idx:add postings|u>gw:search #IPLFinal|gw>ss|ss>idx:newest partitions first']]},
    walk:['The post service assigns an id, stores the post and publishes <code>post.created</code>.', 'Fan-out looks up followers (from the graph service) and pushes the id into each active follower’s timeline list; celebrity authors are skipped.', 'Reading the home timeline merges the cached ids with the latest posts from followed celebrities, then hydrates post bodies by id.', 'The indexer tokenises the text and appends it to the current in-memory index partition, so it is searchable within seconds.']},
  deep:[
    {t:'The celebrity problem, in numbers',
      think:`<p>An account with 100M followers posting once means 100M list inserts. Even at 1M inserts per second that’s <b>100 seconds</b> of fan-out for one post, while everything queued behind it waits. Twitter engineers described exactly this hybrid in public talks: fan out on write for most accounts, and merge high-follower accounts at read time. Most users follow only a handful of such accounts, so the read-time merge touches a few lists.</p>`,
      code:{lang:'ts', title:'home-timeline.ts', src:`async function homeTimeline(userId: string, cursor?: bigint) {
  const ids = await redis.lrange("home:" + userId, 0, 199);              // pushed ids
  const celebs = await graph.followedCelebrities(userId);                // usually < 20
  const pulled = await Promise.all(celebs.map(c => redis.lrange("user:" + c, 0, 19)));
  const merged = [...new Set([...ids, ...pulled.flat()])]
    .map(BigInt)
    .filter(id => cursor === undefined || id < cursor)
    .sort((a, b) => (a < b ? 1 : -1))                                    // ids sort by time
    .slice(0, 20);
  return hydrate(merged);                                                // fetch bodies by id
}`}},
    {t:'Real-time search',
      think:`<p>A general search engine re-indexes in batches; here a post must be searchable within seconds. The index is <b>partitioned by time</b>: the newest partition is in memory and appended to as posts arrive; older partitions are read-only and optimised. A query fans out to partitions <b>newest first</b> and stops once it has enough results. Twitter’s published Earlybird paper describes this style of in-memory real-time index.</p>`},
    {t:'Trending topics',
      think:`<p>A trend is not “most mentioned”; that would always be “good morning”. It is <b>unusual growth</b> compared with a baseline. Stream processors count terms per country in sliding windows (a count-min sketch keeps memory bounded), compare against the usual rate for that term and time of day, and filter spam and bots before ranking.</p>`}],
  bottlenecks:{
    think:`<p>Twitter’s defining failure mode is the <b>world event</b>: everyone posts and reads at once.</p>`,
    rows:[['Event spike (25× posting)', 'Fan-out queue lag; timelines go stale', 'Queue fan-out; let it lag; pre-scale for scheduled events'], ['Celebrity post', 'Fan-out of 100M', 'Read-time merge for high-follower accounts'], ['Timeline cache memory', 'Huge Redis footprint', 'Active users only; cap list length; rebuild on demand'], ['Hot post (likes, replies)', 'Hot keys on counters', 'Batched counters; cache the post object'], ['Search on a breaking event', 'Newest partition hot', 'Replicate the newest partition more; cache popular queries for a few seconds']]},
  tradeoffs:{
    think:`<p>Everything is <b>eventually consistent</b> except the post itself: a post may take seconds to appear in timelines or search, and that’s acceptable.</p>`,
    rows:[['Timelines', 'Hybrid fan-out into memory', 'Pull at read', 'Fast reads; large memory and fan-out cost'], ['Search index', 'Time-partitioned, in memory for recent', 'One big index', 'Fresh and fast for recent; older posts need a separate archive index'], ['Trends', 'Velocity vs baseline', 'Raw counts', 'Surfaces new topics; needs per-term baselines'], ['Ids', 'Snowflake (time-sortable)', 'Random UUIDs', 'Sort by id = sort by time; ids reveal creation time']],
    more:['“For you”: candidates from in-network and out-of-network, then a ranking model', 'Deletes and edits: tombstones checked at hydration time', 'Rate limits and spam filters before fan-out', 'Archive search over older posts'],
    followups:[['How do you build a ranked “For you” timeline?', 'Generate candidates (followed accounts, accounts similar to ones you engage with, popular posts), score them with a ranking model on engagement predictions, then apply rules (diversity, no more than N from one author). The chronological pipeline remains a cheap candidate source.'], ['How do you delete a post everywhere?', 'Mark it deleted in the posts store; hydration drops it from every timeline and search result immediately. Background jobs then remove the id from caches and indexes.'], ['What happens during the IPL final?', 'Pre-scale the fan-out, indexer and timeline tiers; degrade gracefully (let fan-out lag, refresh trends less often, serve cached search results for hot queries) rather than fail.']],
    traps:['Pure push without the celebrity numbers', 'Searching with a database LIKE query', 'Trends as raw counts', 'Assuming a global ordering of posts']},
  refs:['case:feed', 'l:fan-out', 'pg:fanout', 'l:inverted-index', 'l:hll-cms', 'l:unique-ids', 'pg:snowflake', 'l:kafka']});

/* ------------------------------------------------------------------ */
S({id:'google-drive', level:'intermediate', icon:'📁', title:'Google Drive', tags:['chunking', 'sync', 'sharing'],
  tagline:'Store exabytes, sync changes across every device by sending only the bytes that changed, and share files safely.',
  prompt:'Design a file storage and sync service like Google Drive or Dropbox.',
  focus:'chunking and deduplication, the sync protocol and conflicts, and splitting metadata from bytes.',
  clarify:{
    think:`<p>The central idea of this design is <b>splitting metadata from file bytes</b>. I’ll check sizes, sync expectations and sharing, and explicitly scope out real-time co-editing of documents, which is a different problem.</p>`,
    ask:[['Max file size?', 'Up to ~10 GB; most files are small'], ['Clients?', 'Web, desktop sync client, mobile'], ['Version history?', 'Keep old versions for 30 days'], ['Sharing?', 'View / edit permissions for people and links'], ['Real-time co-editing?', 'Out of scope (that’s Google Docs)'], ['Scale?', '~1B users, ~100M daily; a few GB stored per user on average']],
    fr:['Upload, download, delete files and folders', 'Sync changes to all of a user’s devices', 'Version history and restore', 'Share with view / edit permissions'],
    nfr:['Never lose or corrupt a file (durability like 11 nines)', 'Upload only changed parts of large files', 'Changes reach other devices within seconds', 'Resumable uploads on bad networks'],
    out:['real-time co-editing', 'full-text search inside files', 'office previews']},
  estimate:{
    think:`<p>Bytes dominate everything, so I’ll size storage first, then upload bandwidth, which is where chunked delta sync pays off.</p>`,
    assume:['erasure coding stores ~1.5 bytes per logical byte', '~10 metadata operations per uploaded change'],
    inputs:[['users', 'Total users', 1e9, [1e7, 1e8, 1e9]], ['per', 'Average stored per user', 2e9, [5e8, 2e9, 5e9], 'B'], ['dau', 'Daily active users', 1e8, [1e7, 5e7, 1e8, 2e8]], ['chg', 'Changed files per user per day', 10, [2, 10, 50]], ['sz', 'Bytes uploaded per change', 5e5, [1e5, 5e5, 2e6], 'B']],
    rows:[
      ['total', 'Logical storage', v => v.users * v.per, 'B', 'users × average'],
      ['raw', 'Raw storage (erasure coded)', (v, r) => r.total * 1.5, 'B', '× 1.5'],
      ['ups', 'Uploads', v => v.dau * v.chg / 86400, '/s', 'users × changes ÷ 86,400'],
      ['bw', 'Upload bandwidth', (v, r) => r.ups * v.sz * 8, 'bps', 'uploads × bytes × 8'],
      ['meta', 'Metadata operations', (v, r) => r.ups * 10, '/s', 'uploads × 10']],
    so:(r, f) => `${f('total')} of files (${f('raw')} raw) needs a dedicated blob store built for that scale, with metadata in a separate database. Uploads at ${f('ups')} use ${f('bw')} <b>only because clients send changed chunks</b>; re-uploading whole files would multiply that. Metadata at ${f('meta')} ${r.meta > 5e5 ? 'needs a sharded metadata database (by user or shared-folder namespace)' : 'fits a sharded SQL database comfortably'}.`},
  api:{
    think:`<p>Uploads are a session: the client sends the list of chunk hashes, the server answers which ones it lacks, the client uploads only those, then commits a new version. The commit includes the version the client started from, so conflicting edits are detected.</p>`,
    rows:[['POST /v1/uploads', 'Start {parent_id, name, size, chunk_hashes[]} → {session_id, missing[]}', 'Dedup: only missing chunks are sent'], ['PUT /v1/uploads/{sid}/chunks/{hash}', 'Upload one chunk', 'Resumable; verified by hash'], ['POST /v1/uploads/{sid}/commit', 'Create version {base_version}', '409 if someone else committed first'], ['GET /v1/changes?cursor=', 'What changed since my cursor', 'Long-poll; returns new cursor'], ['POST /v1/files/{id}/permissions', 'Share {email | link, role}', 'Viewer / commenter / editor']],
    code:`POST /v1/uploads
{ "parent_id": "fld_9", "name": "thesis.pdf", "size": 48211022,
  "chunk_hashes": ["a91f…", "77c2…", "e0b4…", "…12 total"] }

200 OK
{ "session_id": "up_5c1", "missing": ["77c2…", "e0b4…"] }   // only 2 of 12 chunks changed`, title:'start an upload'},
  data:{
    think:`<p>Metadata is relational: files, folders, versions, permissions and a per-namespace change journal. A version is just a list of chunk hashes. Chunks are content-addressed and reference-counted in the blob store, so identical chunks are stored once.</p>`,
    code:`CREATE TABLE files (
  id          text PRIMARY KEY,
  namespace   bigint NOT NULL,           -- a user's root or a shared folder: shard key
  parent_id   text, name text NOT NULL, is_folder boolean NOT NULL,
  head_version int, deleted boolean NOT NULL DEFAULT false
);
CREATE TABLE versions (
  file_id text, version int, size bigint, chunks text[] NOT NULL,   -- ordered chunk hashes
  created_by bigint, created_at timestamptz,
  PRIMARY KEY (file_id, version)
);
CREATE TABLE journal (                   -- the sync feed: every change in a namespace, in order
  namespace bigint, seq bigint, file_id text, op text,
  PRIMARY KEY (namespace, seq)
);
CREATE TABLE permissions (file_id text, principal text, role text, PRIMARY KEY (file_id, principal));`,
    stores:[['files, versions, journal, permissions', 'Sharded SQL by namespace', 'Transactions for commits; ordered journal'], ['chunks', 'Blob store, content-addressed, erasure coded', 'Exabytes; dedupe by hash'], ['chunk refcounts', 'Alongside the blob index', 'Garbage collection after versions expire'], ['downloads', 'CDN with signed URLs', 'Fast reads near the user']]},
  hld:{
    think:`<p>Two planes: a <b>block service</b> that moves bytes, and a <b>metadata service</b> that decides what those bytes mean. A notification service tells devices to pull changes, so clients don’t poll constantly.</p>`,
    diagram:{n:[['dev', 'client', 'Devices', 'sync client', 0, 1], ['blk', 'service', 'Block service', 'chunks', 1, 0], ['api', 'service', 'Metadata API', 'files, versions', 1, 1], ['blob', 'db', 'Blob store', 'chunks by hash', 2, 0], ['mdb', 'db', 'Metadata DB', 'by namespace', 2, 1], ['notif', 'service', 'Notify svc', 'long-poll / push', 2, 2], ['jrn', 'queue', 'Journal', 'changes', 3, 1]],
      e:'dev>blk dev>api blk>blob api>mdb mdb>jrn jrn>notif dev>notif',
      f:[['Upload: the client sends chunk hashes; the server answers which are new; only those bytes are uploaded.', 'dev>api:start upload (12 hashes)|api>mdb:which are new? → 2|dev>blk:PUT 2 chunks|blk>blob:store by hash'], ['Commit: a new version points at the full chunk list, and the change is appended to the journal.', 'dev>api:commit (base v7)|api>mdb:v8 = [h1…h12]|mdb>jrn:change 9912'], ['Sync: other devices learn something changed and pull everything after their cursor.', 'jrn>notif|notif>dev:namespace changed|dev>api:GET /changes?cursor=9911']]},
    walk:['The desktop client notices <code>thesis.pdf</code> changed, splits it into chunks and hashes them.', 'It starts an upload with the hash list; the server replies that only 2 chunks are new; the client uploads those two.', 'It commits with <code>base_version = 7</code>; the server creates version 8 and appends a journal entry.', 'The user’s laptop and phone are woken through long-poll or push, fetch changes after their cursor, and download only the chunks they lack.']},
  deep:[
    {t:'Chunking, deduplication and delta sync',
      think:`<p>With <b>fixed-size chunks</b> (Dropbox has described 4 MB blocks), editing the end of a file re-uploads one chunk, but inserting a byte at the start shifts every boundary. <b>Content-defined chunking</b> places boundaries where a rolling hash matches a pattern, so an insert only changes the chunks around it. Either way, chunks are named by hash, so identical chunks (copies, old versions) are stored once and uploads skip anything the server has.</p>`,
      body:`<p>One caution: deduplicating <i>across users</i> can leak information (an upload that completes instantly proves someone already stored that file). Many services dedupe within a user or an organisation only.</p>`},
    {t:'The sync protocol and conflicts',
      think:`<p>Each namespace has an ordered <b>journal</b>, and each device remembers its cursor in it. Syncing is “give me everything after cursor N”, so a device that was offline for a week catches up the same way as one that was offline for a second. Commits carry the base version (optimistic concurrency). If two devices edited the same version offline, the second commit gets a 409 and the client saves its copy as a <b>conflicted copy</b> next to the original. That’s what Dropbox does, because silently merging binary files is unsafe.</p>`},
    {t:'Sharing and permissions',
      think:`<p>Permissions attach to files and folders and are <b>inherited</b> down the tree. A shared folder is its own namespace, mounted into each member’s tree, so its journal is shared and sync works the same way. Every metadata read and every signed download URL checks permissions. Link sharing uses unguessable tokens that can be revoked.</p>`}],
  bottlenecks:{
    think:`<p>The blob store scales horizontally by design; metadata is where hot spots appear.</p>`,
    rows:[['A huge shared folder (a company drive)', 'One namespace shard gets heavy traffic', 'Cache listings; split very large namespaces; rate-limit bulk clients'], ['Millions of tiny files', 'Metadata operations dominate, not bytes', 'Batch commits; pack tiny files into one chunk'], ['Notification fan-out', 'Many devices per shared folder', 'Notify “something changed”, let devices pull'], ['Garbage collection', 'Risk of deleting a chunk still referenced', 'Refcounts plus a delay and a mark-and-sweep audit'], ['Large uploads on bad networks', 'Restarts from zero', 'Chunk-level resumable sessions']]},
  tradeoffs:{
    think:`<p>The main lever is how smart the client is: smarter clients (chunking, hashing) mean far less bandwidth and server work.</p>`,
    rows:[['Chunking', 'Content-defined', 'Fixed 4 MB blocks', 'Handles inserts well; more CPU on the client'], ['Dedup scope', 'Per user / organisation', 'Global', 'No cross-user leak; less storage saved'], ['Conflicts', 'Keep both copies', 'Last writer wins', 'No silent data loss; users resolve manually'], ['Durability', 'Erasure coding', '3× replication', '~1.5× overhead instead of 3×; slower rebuilds and reads of cold data']],
    more:['Thumbnails and previews generated asynchronously', 'Full-text search over documents', 'Client-side encryption for sensitive folders', 'Tiering cold data to cheaper storage'],
    followups:[['How do you resume a 5 GB upload after the Wi-Fi drops?', 'The upload session remembers which chunks arrived. The client asks for the session state and sends only the missing chunks. Nothing is visible until commit.'], ['How do old versions get cleaned up?', 'Versions older than 30 days are deleted from metadata, which decrements chunk refcounts. Chunks at zero are removed after a safety delay, and a periodic mark-and-sweep makes sure no referenced chunk is ever deleted.'], ['How is this different from Google Docs?', 'Drive syncs whole-file versions and resolves conflicts by keeping both. Docs merges concurrent character-level edits in real time with operational transformation; see the Google Docs case study.']],
    traps:['Storing file bytes in the metadata database', 'Re-uploading whole files on every change', 'Polling every few seconds from every device', 'Last-writer-wins silently overwriting offline edits']},
  refs:['case:dropbox', 'case:google-docs', 'l:storage-types', 'l:crdts-merkle', 'lab:merkle-diff', 'l:offline-first-sync', 'l:rbac-abac', 'l:cdn']});
})();
