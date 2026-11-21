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
  tagline:'The traffic is modest, and correctness is everything. Never charge twice, never lose a payment, and make the money add up to the last paisa.',
  prompt:'Design the payment system for a large e-commerce site. Customers pay for orders with cards and UPI through external payment gateways.',
  focus:'idempotency, what happens when a gateway call times out, and how you prove the books balance.',
  clarify:{
    think:`<p>First I need to know which side we are on. Building a payment gateway is a different problem from a shop that uses gateways. I assume the shop side unless told otherwise. Then the real questions are: what does “never charge twice” mean when a call times out, and do we need a ledger?</p>`,
    ask:[['Are we the gateway, or a merchant calling gateways?', 'The merchant side, using two payment service providers (PSPs)'], ['Which payment methods?', 'Cards, UPI and wallets, all through the PSPs'], ['How much volume?', 'About 10 million payments a day, and sale-day peaks of several times the average'], ['Do we store card numbers?', 'No. The PSP’s hosted fields turn cards into tokens, which keeps us mostly out of PCI scope'], ['Refunds? Seller payouts?', 'Refunds yes. Payouts are out of scope, but the ledger should support them'], ['What consistency do we need?', 'Never charge twice and never lose a payment, with daily reconciliation against the PSPs']],
    fr:['Create a payment for an order and send the user into the PSP flow (3-D Secure, UPI collect)', 'Receive results by webhook and update the order', 'Full and partial refunds', 'A double-entry ledger of every money movement', 'Daily reconciliation with the PSPs’ settlement reports'],
    nfr:['Charges and refunds take effect exactly once', 'Strong consistency and an audit trail that is only ever added to', '99.99% availability for starting a payment', 'No card data in our systems'],
    out:['fraud models (assume a risk API exists)', 'seller payouts', 'currency conversion']},
  estimate:{
    think:`<p>I expect the numbers to be small next to feeds or chat. That is the point I want to make. <b>This design is driven by correctness, not by scale</b>.</p>`,
    assume:['About 3 PSP events (webhooks) for each payment', 'About 200 bytes for each ledger entry'],
    inputs:[['perDay', 'Payments per day', 1e7, [1e6, 1e7, 5e7, 1e8, 5e8]], ['peak', 'Sale-day peak ÷ average', 5, [2, 5, 10, 20], '×'], ['entries', 'Ledger entries per payment', 4, [2, 4, 6]], ['years', 'Keep records for', 8, [5, 8, 10], 'years']],
    rows:[
      ['avg', 'Payments (average)', v => v.perDay / 86400, '/s', 'per day ÷ 86,400'],
      ['pk', 'Payments (sale peak)', (v, r) => r.avg * v.peak, '/s', 'average × peak factor'],
      ['hooks', 'Webhooks at peak', (v, r) => r.pk * 3, '/s', 'peak × 3 events'],
      ['rows', 'Ledger entries per day', v => v.perDay * v.entries, 'n', 'payments × entries'],
      ['store', 'Ledger size over retention', v => v.perDay * v.entries * 200 * 365 * v.years, 'B', 'entries × 200 B × 365 × years']],
    so:(r, f) => `Even at the sale peak (payments ${f('pk')}, webhooks ${f('hooks')}), ${r.pk < 3000 ? 'this is modest for one well-tuned relational primary. So use <b>a relational database with real transactions</b> for payments and the ledger' : 'one primary would be stretched. So <b>partition payments and ledger accounts by merchant or account id</b>, and keep each transaction inside one partition'}. The ledger grows to ${f('store')} over the retention period. Partition it by month and move old partitions to cheaper storage, but never delete or change entries.`},
  api:{
    think:`<p>Every write endpoint takes an <b>Idempotency-Key</b>. If the client retries after a timeout, it must get the original result, not a second charge. I also never trust the browser redirect to say a payment worked. The server confirms with the PSP, by webhook or by a status call.</p>`,
    rows:[['POST /v1/payments', 'Create a payment {order_id, amount_minor, currency, method} → {payment_id, status, next_action}', 'Needs an Idempotency-Key. The amount is an integer in paise'], ['GET /v1/payments/{id}', 'The current status', 'Checkout polls it until the status is final'], ['POST /v1/payments/{id}/refunds', 'Refund {amount_minor, reason}', 'Needs an Idempotency-Key. A partial refund is allowed up to the captured amount'], ['POST /webhooks/{psp}', 'Result events from the PSP', 'The signature is verified, and repeats are removed by the PSP event id']],
    code:`POST /v1/payments
Idempotency-Key: ord-77812-pay-1
{ "order_id": "77812", "amount_minor": 64000, "currency": "INR", "method": "upi" }

201 Created
{ "payment_id": "pay_3Kd9", "status": "requires_action",
  "next_action": { "type": "upi_collect", "vpa": "asha@okbank" } }

# The same request again (the client retried after a timeout):
200 OK   (identical body, and no second payment is created)`, title:'create (and retry)'},
  data:{
    think:`<p>There are two models. <b>Payments</b> are a state machine with one row for each payment. The <b>ledger</b> is append-only and double-entry: every money movement is a transaction whose entries add up to zero. Money is stored as whole minor units (paise), never as floating-point numbers.</p>`,
    code:`CREATE TABLE payments (
  id            text PRIMARY KEY,
  order_id      text NOT NULL,
  idem_key      text NOT NULL UNIQUE,         -- the database rejects duplicates
  amount_minor  bigint NOT NULL CHECK (amount_minor > 0),
  currency      char(3) NOT NULL,
  status        text NOT NULL,                -- CREATED, PENDING, CAPTURED or FAILED, then REFUNDED and so on
  psp           text, psp_ref text,
  version       int  NOT NULL DEFAULT 0,      -- stops two writers from overwriting each other
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (                  -- only ever added to: a correction is a new entry
  id          bigserial PRIMARY KEY,
  txn_id      text   NOT NULL,                 -- groups the entries of one movement
  account     text   NOT NULL,                 -- 'customer:42', 'psp_clearing:B', 'merchant:7'
  amount_minor bigint NOT NULL,                -- debit is positive and credit is negative, so each txn_id sums to 0
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox (id bigserial PRIMARY KEY, topic text, payload jsonb, sent boolean DEFAULT false);`,
    stores:[['payments, ledger, outbox', 'Postgres with a synchronous replica (RPO = 0)', 'Transactions, constraints and an audit trail'], ['idempotency responses', 'The same database, in the same transaction', 'It cannot drift from the payment row'], ['events', 'Outbox, then Kafka', 'Orders, emails, analytics and the ledger'], ['settlement files', 'Object storage', 'The PSP’s raw reports, kept for audit']]},
  hld:{
    think:`<p>The payment service owns the state machine. It talks to PSPs through a router that can pick one, or fail over between them. Results come back by webhook. Every state change writes an outbox row in the same transaction, so the ledger and the order service cannot miss an event. Reconciliation is a separate daily job.</p>`,
    diagram:{n:[['c', 'client', 'Checkout', '', 0, 1], ['ord', 'service', 'Order svc', '', 1, 0], ['pay', 'service', 'Payment svc', 'state machine', 1, 1], ['router', 'service', 'PSP router', 'pick / fail over', 2, 0], ['pdb', 'db', 'Payments DB', 'payments + outbox', 2, 1], ['psp', 'ext', 'PSP A / B', 'cards, UPI', 3, 0], ['wh', 'service', 'Webhook handler', 'verify + dedupe', 3, 1], ['q', 'queue', 'Events', 'Kafka', 2, 2], ['led', 'service', 'Ledger svc', 'double-entry', 3, 2], ['ldb', 'db', 'Ledger DB', 'append-only', 4, 2], ['rec', 'service', 'Reconciliation', 'daily', 4, 0]],
      e:'c>ord ord>pay pay>router router>psp psp>wh wh>pdb pay>pdb pdb>q q>led led>ldb rec>psp rec>ldb',
      f:[['Create: the order service asks for a payment with an idempotency key. The row starts as CREATED and goes to the chosen PSP.', 'c>ord:place order 77812|ord>pay:POST /payments (key ord-77812-pay-1)|pay>pdb:INSERT CREATED|pay>router:UPI → PSP B|router>psp:create payment intent'], ['Result: the PSP calls our webhook. We check the signature and move to CAPTURED, with an outbox row, in one transaction.', 'psp>wh:payment.captured (signed)|wh>pdb:CAPTURED + outbox'], ['Ledger: the outbox relay publishes the event, and the ledger writes balanced entries.', 'pdb>q:payment.captured|q>led|led>ldb:+64000 psp_clearing / −64000 merchant'], ['Reconciliation: each day, match the PSP’s settlement file against the ledger.', 'rec>psp:settlement report|rec>ldb:match every entry']]},
    walk:['Checkout calls the order service, which calls <code>POST /payments</code> with the key <code>ord-77812-pay-1</code>.', 'The payment row is inserted. If the key already exists, the stored response is returned instead. The router picks a PSP, and the user approves the UPI payment in their app.', 'The PSP sends a signed webhook. The handler removes repeats by event id, and moves PENDING to CAPTURED with a conditional update. It writes an outbox row in the same transaction.', 'The ledger consumes the event and posts entries that sum to zero. The order service marks the order paid.']},
  deep:[
    {t:'Idempotency from end to end',
      think:`<p>Retries happen at every hop: the browser, the order service, our calls to the PSP, and the PSP’s webhooks. Each hop needs its own guard. My rule is that <b>a retry must reuse the same identity</b>. Never retry a timed-out charge with a new id. That is exactly how people get charged twice.</p>`,
      body:`<ul><li><b>Our API:</b> a unique <code>idem_key</code>, and the response stored with the payment in the same transaction.</li><li><b>Calls to the PSP:</b> send our payment id as the PSP’s idempotency key or merchant reference.</li><li><b>Webhooks:</b> a unique constraint on the PSP event id, so each event is processed once.</li><li><b>State changes:</b> conditional updates (<code>WHERE status = 'PENDING'</code>), so a late or repeated event cannot move a payment backwards.</li></ul>`,
      code:{lang:'ts', title:'create-payment.ts', src:`export async function createPayment(req: CreateReq, key: string) {
  return db.tx(async t => {
    // 1. Have we seen this key before? Then return the original answer.
    const prev = await t.one("SELECT response FROM payments WHERE idem_key = $1", [key]).catch(() => null);
    if (prev) return prev.response;
    // 2. Insert first. A duplicate that arrives at the same time fails on the UNIQUE rule and retries step 1.
    const id = newId("pay");
    await t.none("INSERT INTO payments (id, order_id, idem_key, amount_minor, currency, status) " +
                 "VALUES ($1, $2, $3, $4, $5, 'CREATED')", [id, req.orderId, key, req.amountMinor, req.currency]);
    const response = { payment_id: id, status: "CREATED" };
    await t.none("UPDATE payments SET response = $2 WHERE id = $1", [id, response]);
    return response;
  });
  // The PSP call happens after the commit, with id as the PSP's idempotency key.
}`}},
    {t:'The unknown outcome: when the PSP call times out',
      think:`<p>The worst moment in a payment system is a timeout, because the charge may or may not have happened. The answer is to <b>never guess</b>. The payment moves to <code>PENDING</code> (unknown). We resolve it by asking the PSP for the status of <i>our</i> reference, by waiting for the webhook, and finally by reconciliation. Only a definite “failed” lets the user retry, and the retry is a new attempt linked to the same order, so the order cannot be paid twice.</p>`},
    {t:'Double-entry ledger and reconciliation',
      think:`<p>A balance column that gets updated is impossible to audit. A <b>double-entry ledger</b> records every movement as entries that sum to zero, so money moves from one account to another and never appears or vanishes. Balances are sums of entries, and a mistake is fixed with new reversing entries. Reconciliation then compares three sources every day: our payments table, our ledger, and the PSP’s settlement report. Every mismatch goes to a queue for a person to review.</p>`,
      code:{lang:'sql', title:'checks.sql', src:`-- Every transaction must balance
SELECT txn_id FROM ledger_entries GROUP BY txn_id HAVING SUM(amount_minor) <> 0;   -- expect 0 rows

-- Captured payments with no settlement line from the PSP after 3 days
SELECT p.id FROM payments p
LEFT JOIN psp_settlements s ON s.psp_ref = p.psp_ref
WHERE p.status = 'CAPTURED' AND p.updated_at < now() - interval '3 days' AND s.psp_ref IS NULL;`}}],
  bottlenecks:{
    think:`<p>At this scale the risks are the outside services and the correctness edge cases, more than raw speed.</p>`,
    rows:[['A PSP has an outage', 'The success rate for one PSP drops', 'The router fails over by payment method, and tracks the success rate for each PSP and bank'], ['Webhooks are late or lost', 'Payments are stuck in PENDING', 'Poll the PSP for anything PENDING for more than a few minutes, with reconciliation as the backstop'], ['One hot balance row for a merchant', 'Lock waits when every payment updates one row', 'Do not update a balance for each payment. Derive it from the entries plus regular snapshots'], ['A sale-day spike', 'Database CPU and connection limits', 'Pool connections, partition by merchant, and shed work that is not payments first'], ['The primary fails over', 'A risk of losing writes that were already confirmed', 'Use synchronous replication for the payments database (RPO = 0)']]},
  tradeoffs:{
    think:`<p>Every decision here leans towards <b>safety and auditability over speed</b>.</p>`,
    rows:[['Database', 'Relational, with transactions', 'NoSQL', 'Constraints and atomic multi-row writes, and partitioning takes work when you scale'], ['Consistency across services', 'Outbox and idempotent consumers (a saga)', 'Two-phase commit', 'No distributed locks, and consumers must handle duplicates'], ['Balances', 'Derived from an append-only ledger', 'A balance column you update', 'Fully auditable, and reads need sums or snapshots'], ['PSPs', 'Two, with routing', 'One', 'More resilience and better success rates, and two integrations to maintain']],
    more:['Risk scoring before authorisation', 'Smart routing by the success rates of each bank and method', 'Seller payouts from the same ledger', 'Accounts in several currencies'],
    followups:[['How does a refund work?', 'A refund is a new request with its own idempotency key. It calls the PSP’s refund API with our refund id, and when the PSP confirms, it posts reversing ledger entries. A partial refund is capped at the captured amount minus earlier refunds, and that is checked inside a transaction.'], ['The PSP charged the customer but our database write failed. Now what?', 'Our payment row already exists as CREATED or PENDING before we call the PSP, so it cannot vanish. The webhook or a status poll finishes it. If both fail, the daily settlement report shows a charge we did not record, and reconciliation flags it for capture or refund.'], ['How do you stay out of PCI scope?', 'Card numbers never touch our servers. The PSP’s hosted fields or SDK turn the card into a token in the browser, and we only see the token. That shrinks our compliance work to a much smaller self-assessment.']],
    traps:['Floating-point numbers for money', 'Retrying a timed-out charge with a new id', 'Trusting the browser redirect instead of a server-side confirmation', 'A balance column you update, with no ledger']},
  refs:['case:stripe', 'case:upi', 'l:idempotency-rate-limit-headers', 'l:saga-outbox', 'l:transactions-isolation', 'l:two-phase-commit', 'pg:saga-2pc']});

/* ------------------------------------------------------------------ */
S({id:'whatsapp', level:'intermediate', icon:'💬', title:'WhatsApp', tags:['WebSockets', 'delivery receipts', 'ordering'],
  tagline:'Hundreds of millions of open connections, messages that must arrive once and in order, and phones that are offline half the time.',
  prompt:'Design a chat app like WhatsApp: one-to-one and group messages with sent, delivered and read receipts.',
  focus:'sending a message to the right connection, delivery guarantees with ✓, ✓✓ and read, ordering, and group fan-out.',
  clarify:{
    think:`<p>Chat has a few classic sub-problems. They are <b>long-lived connections</b>, <b>finding which server a user is connected to</b>, <b>delivering at least once without showing duplicates</b>, and <b>ordering</b>. I check the scale and the features, so I know how much time each one deserves.</p>`,
    ask:[['One-to-one chats and groups? How big is a group?', 'Both. Groups go up to a few hundred members'], ['How many daily active users?', 'About 500 million'], ['How many messages for each user each day?', 'About 40'], ['Receipts and presence?', 'Sent ✓, delivered ✓✓ and read, plus online and last seen'], ['Message history on the server?', 'Kept only until it is delivered to every device. Devices keep the history'], ['End-to-end encryption?', 'Yes. The server sees only ciphertext (scrambled text)']],
    fr:['Send and receive one-to-one and group messages', 'Deliver messages when a user comes back online', 'Sent, delivered and read receipts', 'Online status and last seen', 'Photos and videos'],
    nfr:['Real time: under about 200 ms when both users are online', 'No lost messages, and no duplicates shown', 'Messages in a chat appear in the same order for everyone', 'Works on unreliable mobile networks'],
    out:['voice and video calls', 'message search on the server', 'payments']},
  estimate:{
    think:`<p>Two numbers size this. <b>Concurrent connections</b> size the gateway fleet. <b>Messages a second</b> size the routing and the storage. Storage is small, because the server keeps only messages that are not yet delivered.</p>`,
    assume:['About 100,000 open connections for each gateway server (illustrative)', 'Peak is about 3 times the average', 'About 200 bytes for a text message (ciphertext plus details)'],
    inputs:[['dau', 'Daily active users', 5e8, [1e7, 1e8, 5e8, 2e9]], ['msgs', 'Messages per user per day', 40, [10, 40, 100]], ['online', 'Online at the same time', 30, [10, 30, 50], '%']],
    rows:[
      ['avg', 'Messages (average)', v => v.dau * v.msgs / 86400, '/s', 'users × messages ÷ 86,400'],
      ['pk', 'Messages (peak)', (v, r) => r.avg * 3, '/s', '3 × average'],
      ['conns', 'Open connections', v => v.dau * v.online / 100, 'n', 'users × online share'],
      ['gws', 'Gateway servers', (v, r) => ceil(r.conns / 1e5), 'servers', 'connections ÷ 100,000'],
      ['day', 'Message bytes per day', v => v.dau * v.msgs * 200, 'B/day', 'messages × 200 B']],
    so:(r, f) => `${f('conns')} open connections need about <b>${f('gws')}</b>. The number of connections, not the message rate, sizes the edge. At ${f('pk')} at peak, every message must find the recipient’s gateway, so a fast <b>session registry</b> (user to gateway) is the key lookup. About ${f('day')} of messages pass through, but most are delivered within seconds and deleted. So storage holds only the backlog that is not yet delivered.`},
  api:{
    think:`<p>Messages travel over a persistent <b>WebSocket</b> (or MQTT-style) connection, not REST. REST is only for uploading media and catching up after a reconnect. Every message carries a <b>client-generated id</b>, which makes retries safe.</p>`,
    rows:[['WS send {client_msg_id, chat_id, body}', 'Send a message', 'The server replies ack {client_msg_id, seq}, which shows ✓'], ['WS deliver {chat_id, seq, sender, body}', 'Server to the recipient’s device', 'The device replies with a delivered ack, which shows ✓✓ to the sender'], ['WS read {chat_id, up_to_seq}', 'A read receipt', 'One receipt covers all earlier messages'], ['GET /v1/sync?since={cursor}', 'Fetch pending messages after a reconnect', 'Paged'], ['POST /v1/media', 'Get an upload URL for encrypted media', 'The message carries the media key and the URL']],
    code:`→ {"t":"send","client_msg_id":"c1f0-…","chat_id":981,"body":"<ciphertext>"}
← {"t":"ack","client_msg_id":"c1f0-…","seq":812}                 // ✓ sent
← {"t":"deliver","chat_id":981,"seq":812,"from":42,"body":"…"}   // to Bob
→ {"t":"delivered","chat_id":981,"seq":812}                      // Bob's phone: ✓✓
→ {"t":"read","chat_id":981,"up_to_seq":812}                     // blue ticks`, lang:'json', title:'WebSocket frames'},
  data:{
    think:`<p>The access patterns are “add to a chat” and “give me everything still pending for this device”. That fits a wide-column store split by chat, and by user for the pending inbox, with ordered keys. The session registry is tiny, hot and short-lived, so it lives in memory.</p>`,
    code:`-- Cassandra-style tables
CREATE TABLE messages (
  chat_id   bigint,
  seq       bigint,        -- the order inside one chat, assigned by the chat's owner partition
  msg_id    uuid,          -- the client's id, used to remove duplicates
  sender_id bigint,
  body      blob,          -- ciphertext only
  PRIMARY KEY ((chat_id), seq)
);
CREATE TABLE pending (     -- what each device still has to receive, deleted when the device acks
  user_id bigint, device_id int, chat_id bigint, seq bigint,
  PRIMARY KEY ((user_id, device_id), chat_id, seq)
) WITH default_time_to_live = 2592000;   -- 30 days`,
    stores:[['messages, pending', 'Cassandra or ScyllaDB', 'A huge write rate, split by chat and by device'], ['session registry', 'Redis (user to gateway, with an expiry refreshed by heartbeats)', 'Looked up for every message'], ['groups, contacts', 'Sharded SQL or wide-column', 'Small, and mostly read'], ['media', 'Object storage plus a CDN (encrypted blobs)', 'Big files, fetched once or twice']]},
  hld:{
    think:`<p>Gateways hold connections and nothing else. The chat service gives each message a sequence number, stores it, looks up where the recipient is connected, and forwards it. If the recipient is offline, the message waits in their pending inbox. A push notification then wakes the phone.</p>`,
    diagram:{n:[['a', 'client', 'Alice', 'phone', 0, 0], ['b', 'client', 'Bob', 'phone', 0, 2], ['gw1', 'service', 'Gateway 1', 'WebSockets', 1, 0], ['gw2', 'service', 'Gateway 7', 'WebSockets', 1, 2], ['chat', 'service', 'Chat svc', 'seq + route', 2, 1], ['reg', 'cache', 'Session registry', 'user → gateway', 3, 0], ['db', 'db', 'Messages', 'Cassandra', 3, 1], ['push', 'ext', 'APNs / FCM', '', 3, 2]],
      e:'a>gw1 b>gw2 gw1>chat chat>gw2 chat>reg chat>db chat>push',
      f:[['Send: Alice’s gateway passes the message to the chat service, which gives it seq 812, stores it and acks. That is one tick.', 'a>gw1:msg (client id c1f0)|gw1>chat|chat>db:append seq 812|gw1>a:✓ sent'], ['Deliver: look up Bob’s gateway and forward the message. When his phone acks, tell Alice. That is two ticks.', 'chat>reg:where is Bob?|chat>gw2:deliver seq 812|gw2>b:message|b>gw2:delivered ack|gw2>chat|chat>gw1:✓✓|gw1>a:✓✓'], ['Offline: Bob is not connected, so the message waits in his pending inbox and a push wakes his phone.', 'chat>reg:Bob offline|chat>db:pending for Bob|chat>push:wake Bob']]},
    walk:['Alice’s app sends the ciphertext with a client id, and the gateway passes it to the chat service.', 'The chat service removes duplicates by client id and gives the message the next sequence number for the chat. It writes the message and Bob’s pending entry, and acks Alice (✓).', 'It looks up Bob’s gateway in the registry and forwards the message. Bob’s phone acks, the pending entry is deleted, and Alice gets ✓✓.', 'If Bob is offline, a push notification wakes his phone. The phone reconnects and pulls the pending messages.']},
  deep:[
    {t:'Delivery guarantees: ids, acks and receipts',
      think:`<p>Mobile networks drop packets and connections all the time. So every hop delivers <b>at least once, with retries</b>, and duplicates are removed using the client message id. The sender keeps retrying until it gets the server’s ack. The server keeps a pending entry until the device acks. Each tick maps to a durable event: ✓ means the server stored it, ✓✓ means the recipient’s device stored it, and read means it was opened.</p>`,
      code:{lang:'ts', title:'client-outbox.ts', src:`// The phone keeps unsent messages in a local outbox and retries with the SAME id.
async function flush(outbox: Msg[]) {
  for (const m of outbox) {
    if (m.acked) continue;
    socket.send({ t: "send", client_msg_id: m.id, chat_id: m.chat, body: m.body });
  }
}
socket.on("ack", a => { markAcked(a.client_msg_id, a.seq); });   // shows ✓
socket.on("reconnect", () => flush(loadOutbox()));                 // a safe retry: the server removes duplicates by id`}},
    {t:'Ordering inside a chat',
      think:`<p>Client clocks cannot be trusted, and we do not need a global order. We only need order inside each chat. So each chat has one owner (the chat id is the partition key) that hands out an increasing <b>sequence number</b>. Clients show messages by sequence number, and can spot a gap (“I have 810 and 812, so fetch 811”). Two people typing at once still get one agreed order.</p>`},
    {t:'Groups and fan-out',
      think:`<p>A group message is stored once, then delivered to every member’s devices. With 256 members and 2 devices each, that is about 500 deliveries. With end-to-end encryption, encrypting separately for each device would be costly. The Signal protocol’s <b>sender keys</b>, which WhatsApp’s security white paper describes, let the sender encrypt once for the group, and the sender key is shared with members one by one only when the membership changes. Very large groups are paced through a fan-out queue, so one message does not spike a gateway.</p>`}],
  bottlenecks:{
    think:`<p>Connections are the scary part. What happens when a gateway restarts with 100,000 users on it?</p>`,
    rows:[['A gateway restarts, or the network blips', 'A reconnect storm: 100,000 clients at once', 'Add random delay to reconnects, and drain gateways gradually before a deploy'], ['Stale registry entries', 'Messages are sent to a gateway the user has left', 'Heartbeats refresh an expiry time. On failure, fall back to the pending inbox plus a push'], ['Large, busy groups', 'Fan-out spikes', 'Use a fan-out queue, and batch the deliveries for each gateway'], ['Users who are offline for weeks', 'The pending inbox grows', 'Expire pending entries, and cap them for each device'], ['Push providers throttle', 'Wake-ups arrive late', 'Merge pushes for each chat, and respect the provider’s limits']]},
  tradeoffs:{
    think:`<p>WhatsApp’s distinctive choice is to keep history on devices. That shapes storage, search and multi-device support.</p>`,
    rows:[['Transport', 'A persistent WebSocket or MQTT-style connection', 'Long polling', 'The lowest delay and battery cost for each message, with stateful gateways'], ['Server storage', 'Only until delivered', 'The full history on the server', 'Smaller and more private, with no server-side search and harder multi-device sync'], ['Ordering', 'A sequence number for each chat', 'Global order or timestamps', 'Cheap, and correct where it matters'], ['Guarantee', 'At least once, plus duplicate removal', 'An exactly-once protocol', 'Simple and robust on bad networks']],
    more:['Multi-device: each device has its own keys and pending inbox', 'Presence with privacy controls, sent only to contacts who are looking', 'Removing duplicate copies of forwarded media files', 'Spam and abuse signals that work without reading content'],
    followups:[['How do you show “last seen”?', 'Gateways record connects, disconnects and heartbeats in a presence store. When a chat is open, the app subscribes to that contact’s presence. Privacy settings decide who may see it. Do not broadcast every change to every contact.'], ['How does end-to-end encryption change the design?', 'The server can route, store and count messages, but it cannot read, search or moderate their content. A key directory service hands out public keys, and the clients do all the encryption. Features such as link previews must be built on the device.'], ['How would you support one account on several devices?', 'Treat each device as a separate recipient, with its own keys and pending inbox. The sender encrypts for every device of the recipient and of itself, and the chat service sends to all of them.']],
    traps:['Using client timestamps for ordering', 'No message id, so retries create duplicates', 'Storing a copy of the message for each recipient in a group', 'Forgetting reconnect storms']},
  refs:['case:whatsapp', 'l:websockets-at-scale', 'l:presence', 'l:delivery-semantics', 'l:push-notifications', 'l:offline-first-sync', 'l:fan-out']});

/* ------------------------------------------------------------------ */
S({id:'instagram', level:'intermediate', icon:'📸', title:'Instagram', tags:['feed', 'fan-out', 'media'],
  tagline:'Photos, follows and a home feed. Two problems carry the interview: building feeds cheaply and storing petabytes of images.',
  prompt:'Design Instagram: users post photos, follow other users, and scroll a home feed.',
  focus:'fan-out on write against fan-out on read (and celebrities), the photo upload pipeline, and serving images.',
  clarify:{
    think:`<p>I scope it to posting, following and the home feed. I ask whether the feed is ranked, because ranking changes the read path. I also ask about celebrities, because they decide the fan-out strategy.</p>`,
    ask:[['Is the feed chronological or ranked?', 'Ranked, but it starts from posts by people you follow'], ['How many daily active users?', 'About 500 million'], ['How many new posts a day?', 'About 100 million photos'], ['How often do people open the feed?', 'About 10 times a day'], ['Are there celebrity accounts?', 'Yes. Some have over 100 million followers'], ['Stories, Reels and direct messages?', 'Out of scope']],
    fr:['Upload a photo with a caption', 'Follow and unfollow', 'A home feed of posts from followed accounts, newest and most relevant first', 'Like and comment, with counts'],
    nfr:['The feed loads in under about 300 ms', 'Photos load fast worldwide', 'A new post may take a few seconds to appear in followers’ feeds', 'Highly available reads'],
    out:['Stories', 'Reels', 'direct messages', 'the explore page']},
  estimate:{
    think:`<p>I want three things. One is the ratio of feed reads to writes. Another is the cost of fan-out. The third is photo storage for each year, which turns out to be the biggest number by far.</p>`,
    assume:['Peak is about 3 times the average'],
    inputs:[['dau', 'Daily active users', 5e8, [1e7, 1e8, 5e8, 1e9]], ['posts', 'New posts per day', 1e8, [1e7, 5e7, 1e8, 2e8]], ['opens', 'Feed opens per user per day', 10, [5, 10, 20]], ['size', 'Stored bytes per photo (all sizes)', 1.5e6, [5e5, 1.5e6, 3e6], 'B'], ['fol', 'Average followers', 200, [100, 200, 500]]],
    rows:[
      ['pqps', 'Posts', v => v.posts / 86400, '/s', 'posts ÷ 86,400'],
      ['feed', 'Feed reads (peak)', v => v.dau * v.opens / 86400 * 3, '/s', 'users × opens ÷ 86,400 × 3'],
      ['fan', 'Fan-out inserts', (v, r) => r.pqps * v.fol, '/s', 'posts a second × followers'],
      ['day', 'Photo storage per day', v => v.posts * v.size, 'B/day', 'posts × bytes'],
      ['yr', 'Photo storage per year', (v, r) => r.day * 365, 'B', 'per day × 365']],
    so:(r, f) => `Feed reads (${f('feed')} at peak) far outnumber posts (${f('pqps')}), so precompute feeds and make each read one lookup. That costs ${f('fan')} in inbox inserts at the average follower count, ${r.fan < 2e6 ? 'which is affordable' : 'which is already heavy'}. But a celebrity with 100 million followers would add 100 million inserts for one post, so <b>celebrities are merged in at read time</b>. Photos dominate storage at ${f('yr')} a year. Use object storage plus a CDN, and never the database.`},
  api:{
    think:`<p>Uploads go <b>straight to object storage</b> with a presigned URL (a short-lived upload link), so our API servers never carry photo bytes. The feed uses cursor paging, because the list changes while you scroll.</p>`,
    rows:[['POST /v1/uploads', 'Get a presigned upload URL', 'The client PUTs the photo straight to storage'], ['POST /v1/posts', 'Create a post {upload_id, caption}', 'Needs an Idempotency-Key'], ['GET /v1/feed?cursor=', 'The next page of the home feed', 'Returns posts and the next cursor'], ['POST /v1/users/{id}/follow', 'Follow (DELETE to unfollow)', ''], ['POST /v1/posts/{id}/likes', 'Like a post', 'Counts are eventually consistent']],
    code:`GET /v1/feed?cursor=eyJ0IjoxNzMx…
200 OK
{ "posts": [ { "id": "3197…", "author": "asha", "image": "https://cdn…/3197_1080.jpg",
               "caption": "Monsoon in Munnar", "likes": 1204 } ],
  "next_cursor": "eyJ0IjoxNzMx…" }`, title:'feed page'},
  data:{
    think:`<p>Posts and the follow graph are relational, and they are naturally <b>sharded by user id</b>. Post ids are 64-bit numbers that sort by time (Snowflake-style), so “newest first” needs no timestamp index across shards. The precomputed feed is a capped list of post ids for each user, kept in a cache.</p>`,
    code:`CREATE TABLE posts (
  id          bigint PRIMARY KEY,       -- a 64-bit id that sorts by time
  author_id   bigint NOT NULL,          -- the shard key
  caption     text,
  media_key   text NOT NULL,            -- the object storage key. The image sizes come from it
  created_at  timestamptz NOT NULL
);
CREATE TABLE follows (
  follower_id bigint, followee_id bigint, created_at timestamptz,
  PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX follows_by_followee ON follows (followee_id, follower_id);  -- "who follows me", used for fan-out
-- Feed cache (Redis): LIST feed:{user_id} holds the newest ~500 post ids`,
    stores:[['posts, users, follows', 'Postgres sharded by user id', 'Relational, with queries that stay inside one shard'], ['home feeds', 'Redis lists (active users only)', 'One read each time a feed is opened'], ['photos', 'Object storage, in several sizes, behind a CDN', 'Petabytes, and cacheable for ever'], ['like counts', 'A counter service (batched increments)', 'Hot posts get huge write rates']]},
  hld:{
    think:`<p>There are two flows. <b>Write</b>: upload, then post, then fan-out in the background into followers’ feed lists. <b>Read</b>: the feed list plus celebrity posts, then rank, then fetch the post details, with images coming from the CDN.</p>`,
    diagram:{n:[['u', 'client', 'App', '', 0, 1], ['cdn', 'cdn', 'CDN', 'photos', 1, 0], ['gw', 'lb', 'API gateway', '', 1, 1], ['media', 'db', 'Object storage', 'photo sizes', 2, 0], ['post', 'service', 'Post svc', '', 2, 1], ['feedsvc', 'service', 'Feed svc', 'merge + rank', 2, 2], ['fq', 'queue', 'Fan-out queue', '', 3, 0], ['pdb', 'db', 'Posts DB', 'sharded by user', 3, 2], ['graph', 'db', 'Follow graph', '', 4, 1], ['fw', 'service', 'Fan-out workers', '', 4, 0], ['fc', 'cache', 'Feed cache', 'post ids per user', 3, 1]],
      e:'u>cdn u>gw u>media cdn>media gw>post gw>feedsvc post>pdb post>fq fq>fw fw>graph fw>fc feedsvc>fc feedsvc>pdb feedsvc>graph',
      f:[['Post: the photo goes straight to object storage. Then the post is created and an event is queued.', 'u>media:PUT photo (presigned)|u>gw:POST /posts|gw>post|post>pdb:INSERT post|post>fq:new post event'], ['Fan-out: workers find the author’s followers and push the post id into each feed list (skipped for celebrities).', 'fq>fw|fw>graph:followers of @asha (12K)|fw>fc:push post id × 12K'], ['Read: take the precomputed ids and recent celebrity posts, rank them, and fetch the details. Images come from the CDN.', 'u>gw:GET /feed|gw>feedsvc|feedsvc>fc:500 post ids|feedsvc>graph:celebrities I follow|feedsvc>pdb:hydrate top 20|u>cdn:load photos']]},
    walk:['The app gets a presigned URL and uploads the photo. A background job makes the resized versions.', 'The app creates the post. The post service writes it to the author’s shard and publishes an event.', 'Fan-out workers add the post id to each follower’s feed list (active followers only).', 'When a feed is opened, the feed service reads the list and adds recent posts from celebrities the user follows. It ranks the candidates, fetches the top 20 and returns CDN image URLs.']},
  deep:[
    {t:'Fan-out on write, on read, or both',
      think:`<p>Push fan-out (at write time) makes reads cheap, but a celebrity post then costs one insert for every follower. Pull fan-out (at read time) makes posting cheap, but each feed read must query everyone you follow. A <b>hybrid</b> takes the best of both. It pushes for normal accounts and pulls for accounts above a follower threshold. It also skips precomputing feeds for users who have not opened the app in weeks.</p>`,
      body:`<table class="tbl"><thead><tr><th></th><th>Push (on write)</th><th>Pull (on read)</th><th>Hybrid</th></tr></thead><tbody>
<tr><td>Cost of a post</td><td>One insert for each follower</td><td>One insert</td><td>Push only below the threshold</td></tr>
<tr><td>Feed read</td><td>One list read</td><td>Query everyone you follow</td><td>The list, plus a few celebrities</td></tr>
<tr><td>Celebrity post</td><td>100 million inserts</td><td>Cheap</td><td>Cheap</td></tr></tbody></table>`},
    {t:'The photo pipeline',
      think:`<p>Photo bytes should never pass through API servers. The client uploads to object storage with a presigned URL. A storage event then starts workers that <b>resize</b> the photo to a few standard widths, strip the location data, run moderation, and write the final keys. The keys include a content hash, so CDN copies can be cached for ever. The post becomes visible once at least the feed-size image is ready.</p>`},
    {t:'Ranking and counters',
      think:`<p>Ranking has two stages. The first is <b>candidates</b>: the feed list plus celebrity posts, a few hundred ids. The second is <b>scoring</b> with a light model, using signals such as how close the relationship is, how recent the post is, and early engagement. A viral post can get thousands of like writes a second on one row. So likes are recorded as events and counted in batches, or with sharded counters, and the number shown is a few seconds behind.</p>`}],
  bottlenecks:{
    think:`<p>I check each store against the worst case, not the average.</p>`,
    rows:[['Celebrity posts', 'The fan-out queue falls far behind', 'Pull celebrity posts at read time'], ['Feed cache memory', 'Hundreds of millions of lists', 'Keep lists only for active users, cap them at about 500 ids, and rebuild them on demand for returning users'], ['Likes on a viral post', 'One hot counter row', 'Use batched or sharded counters'], ['Upload spikes (festivals, New Year)', 'The resize workers fall behind', 'Use a queue and autoscaling, and show the post as “processing”'], ['Hot shards', 'A celebrity’s shard gets heavy reads', 'Cache their recent posts, and add read replicas']]},
  tradeoffs:{
    think:`<p>The feed is <b>eventually consistent on purpose</b>. A few seconds of delay buys a far cheaper read path.</p>`,
    rows:[['Building the feed', 'Hybrid fan-out', 'Pure push or pure pull', 'Cheap reads and a bounded cost for a post, and two code paths'], ['Ordering', 'Ranked candidates', 'Purely chronological', 'More engaging, and harder to debug and explain'], ['Freshness', 'Seconds of delay', 'Immediate', 'Fan-out in the background absorbs spikes'], ['Media', 'Object storage plus a CDN', 'Blobs in the database', 'Cheap and fast, with an extra pipeline to manage']],
    more:['Stories: a separate store with a 24-hour expiry, pulled at read time', 'Explore: candidates from outside your network', 'Spam and integrity filters before fan-out', 'CDNs in each region, and image formats such as WebP and AVIF'],
    followups:[['How do you handle unfollow?', 'Remove the relation at once, and filter that author out at read time. Clean the feed list lazily. Rebuilding every follower’s list right away is not worth it.'], ['How do you page through a ranked feed that keeps changing?', 'Rank a set of candidates once for each session, and return a cursor that points into that snapshot. Then scrolling shows no duplicates and skips no posts. New posts appear on the next refresh.'], ['A user comes back after six months, and their feed list is gone. Now what?', 'Build it on demand with a pull from the accounts they follow, which makes the first load slower. Then resume normal fan-out for them.']],
    traps:['Pure push, with no mention of celebrities', 'Photos in the database or through API servers', 'Offset paging on a live feed', 'Strongly consistent like counts']},
  refs:['case:feed', 'l:fan-out', 'pg:fanout', 'l:cdn', 'l:sharding', 'l:recommendations', 'l:unique-ids']});

/* ------------------------------------------------------------------ */
S({id:'twitter', level:'advanced', icon:'🐦', title:'Twitter / X', tags:['timelines', 'real-time search', 'trends'],
  tagline:'Like Instagram’s feed but more extreme: huge follower skews, real-time search over every new post, and traffic that spikes with world events.',
  prompt:'Design Twitter/X: users post short posts, follow others, read a home timeline, and search recent posts.',
  focus:'the celebrity fan-out problem, real-time search indexing, and surviving spikes during big events.',
  clarify:{
    think:`<p>Twitter’s feed looks like Instagram’s. So I spend less time on the basic fan-out and more on what is different here. That is <b>extreme follower skew</b>, <b>search within seconds of posting</b>, and <b>spikes during events</b>. I confirm all three.</p>`,
    ask:[['Is the timeline chronological or “For you”?', 'Start with “Following” (chronological), and mention ranking'], ['What is the scale?', 'About 250 million daily users and 500 million posts a day'], ['What about search?', 'Recent posts by keyword, visible within seconds'], ['Trending topics?', 'Yes, for each country'], ['How skewed are follower counts?', 'Some accounts have over 100 million followers'], ['Media?', 'Images and video go through a separate media service, which is not the focus']],
    fr:['Post (280 characters plus media)', 'Follow and unfollow', 'A home timeline', 'Keyword search of recent posts', 'Trending topics'],
    nfr:['Timeline reads in under about 200 ms', 'New posts are searchable within about 10 s', 'Survive spikes of many times the normal posting rate', 'Eventual consistency is fine for timelines and counts'],
    out:['direct messages', 'ads', 'Spaces']},
  estimate:{
    think:`<p>Twitter has said it handles around 500 million tweets a day. It once hit a record of about 143,000 tweets a second during a TV event in 2013. I use those as anchors, and I work out the cost of fan-out.</p>`,
    assume:['About 300 bytes for a post (text plus details)', 'Spikes of about 25 times the average during big events'],
    inputs:[['dau', 'Daily active users', 2.5e8, [5e7, 1e8, 2.5e8, 5e8]], ['posts', 'Posts per day', 5e8, [1e8, 5e8, 1e9]], ['reads', 'Timeline loads per user per day', 20, [5, 20, 50]], ['fol', 'Followers per post (average)', 300, [100, 300, 1000]]],
    rows:[
      ['tps', 'Posts (average)', v => v.posts / 86400, '/s', 'posts ÷ 86,400'],
      ['spike', 'Posts (event spike)', (v, r) => r.tps * 25, '/s', '25 × average'],
      ['tl', 'Timeline reads', v => v.dau * v.reads / 86400, '/s', 'users × loads ÷ 86,400'],
      ['fan', 'Timeline inserts (fan-out)', (v, r) => r.tps * v.fol, '/s', 'posts a second × followers'],
      ['store', 'New post text per day', v => v.posts * 300, 'B/day', 'posts × 300 B']],
    so:(r, f) => `The fan-out inserts (${f('fan')}) dwarf the posts themselves (${f('tps')}). That is the price of making ${f('tl')} timeline reads a single in-memory list read. During an event spike (${f('spike')}), fan-out falls behind first, so it must be queued and allowed to lag. The text storage (${f('store')}) is small. The work is in fan-out and indexing.`},
  api:{
    think:`<p>There are few endpoints, and all the reads use cursors based on post ids that sort by time.</p>`,
    rows:[['POST /2/posts', 'Create a post {text, media_ids?, reply_to?}', 'Needs an Idempotency-Key. Returns the id'], ['GET /2/timeline/home?cursor=', 'A page of the home timeline', 'The cursor is the last post id seen'], ['GET /2/search?q=&cursor=', 'Recent posts that match the query', 'Newest first'], ['GET /2/trends?country=IN', 'The current trending topics', 'Cached for about a minute'], ['POST /2/users/{id}/follow', 'Follow', '']],
    code:`GET /2/search?q=%23IPLFinal&cursor=1857002318
200 OK
{ "posts": [ { "id": "1857002401…", "author": "cricfan", "text": "What a finish! #IPLFinal" } ],
  "next_cursor": "1857002299…" }`, title:'search page'},
  data:{
    think:`<p>Post ids are 64-bit and ordered by time. Twitter built Snowflake for exactly this, so sorting by id sorts by time, and every shard can make ids on its own. Timelines are lists of ids in memory, and the post bodies live once in a post store.</p>`,
    code:`-- A 64-bit id is 41 bits of millisecond timestamp, 10 bits for the machine and 12 bits for a counter
CREATE TABLE posts (
  id         bigint PRIMARY KEY,   -- sorts by time
  author_id  bigint NOT NULL,
  text       varchar(280) NOT NULL,
  reply_to   bigint,
  created_at timestamptz NOT NULL
);
-- Home timeline (Redis):  LIST home:{user_id}   holds the newest few hundred post ids
-- Author timeline:        LIST user:{author_id} holds that author's recent post ids (used for celebrities)
-- Search index: each word points to a list of post ids, split by time (the newest part is in memory)`,
    stores:[['posts', 'A sharded store keyed by post id', 'Fetched by id, and the rows never change'], ['home and author timelines', 'Redis clusters (replicated)', 'Reads are list reads'], ['follow graph', 'A dedicated graph service', 'Followers for fan-out, and followees for reads'], ['search', 'An inverted index split by time', 'Fresh posts are indexed in seconds'], ['events', 'A Kafka-style log', 'Feeds fan-out, search, trends and analytics']]},
  hld:{
    think:`<p>A post is written once and published as an event. Three separate consumers react: <b>fan-out</b> into home timelines, the <b>search indexer</b>, and <b>trends</b> counting. Reads stay simple: a list read, a celebrity merge, and then fetching the posts.</p>`,
    diagram:{n:[['u', 'client', 'App', '', 0, 1], ['tdb', 'db', 'Posts store', 'by post id', 1, 0], ['gw', 'lb', 'API gateway', '', 1, 1], ['tw', 'service', 'Post svc', 'Snowflake ids', 2, 0], ['tls', 'service', 'Timeline svc', 'merge celebrities', 2, 1], ['ss', 'service', 'Search svc', '', 2, 2], ['k', 'queue', 'Post events', 'log', 3, 0], ['idx', 'db', 'Search index', 'by time', 3, 2], ['fo', 'service', 'Fan-out svc', 'skip celebrities', 4, 0], ['tl', 'cache', 'Timeline cache', 'Redis lists', 4, 1], ['ing', 'service', 'Indexer', 'seconds', 4, 2]],
      e:'u>gw gw>tw gw>tls gw>ss tw>tdb tw>k k>fo fo>tl tls>tl tls>tdb k>ing~0.25 ing>idx ss>idx',
      f:[['Post: it is stored with an id that sorts by time, and published as an event.', 'u>gw:POST post|gw>tw|tw>tdb:INSERT 1857…|tw>k:post.created'], ['Fan-out: push the id into each follower’s cached timeline, unless the author is a celebrity.', 'k>fo:followers of @cricfan (3K)|fo>tl:push id × 3K'], ['Home timeline: take the cached ids plus recent celebrity posts, and fetch the posts from the posts store.', 'u>gw:GET home|gw>tls|tls>tl:my ids|tls>tdb:celebrity posts + hydrate'], ['Search: the indexer adds the post to the newest in-memory part within seconds.', 'k>ing|ing>idx:add postings|u>gw:search #IPLFinal|gw>ss|ss>idx:newest partitions first']]},
    walk:['The post service gives the post an id, stores it and publishes <code>post.created</code>.', 'Fan-out looks up the followers (from the graph service) and pushes the id into each active follower’s timeline list. Celebrity authors are skipped.', 'Reading the home timeline merges the cached ids with the latest posts from followed celebrities, then fetches the post bodies by id.', 'The indexer splits the text into words and adds the post to the current in-memory part of the index, so it is searchable within seconds.']},
  deep:[
    {t:'The celebrity problem, in numbers',
      think:`<p>An account with 100 million followers posting once means 100 million list inserts. Even at 1 million inserts a second, that is <b>100 seconds</b> of fan-out for one post, while everything behind it waits. Twitter engineers described exactly this hybrid in public talks. They fan out on write for most accounts, and merge high-follower accounts at read time. Most users follow only a handful of such accounts, so the merge at read time touches a few lists.</p>`,
      code:{lang:'ts', title:'home-timeline.ts', src:`async function homeTimeline(userId: string, cursor?: bigint) {
  const ids = await redis.lrange("home:" + userId, 0, 199);              // ids that were pushed to this user
  const celebs = await graph.followedCelebrities(userId);                // usually fewer than 20
  const pulled = await Promise.all(celebs.map(c => redis.lrange("user:" + c, 0, 19)));
  const merged = [...new Set([...ids, ...pulled.flat()])]
    .map(BigInt)
    .filter(id => cursor === undefined || id < cursor)
    .sort((a, b) => (a < b ? 1 : -1))                                    // ids sort by time
    .slice(0, 20);
  return hydrate(merged);                                                // fetch the bodies by id
}`}},
    {t:'Real-time search',
      think:`<p>A general search engine re-indexes in batches. Here a post must be searchable within seconds. The index is <b>split by time</b>: the newest part is in memory and posts are added to it as they arrive, and older parts are read-only and optimised. A query goes to the parts <b>newest first</b>, and stops once it has enough results. Twitter’s published Earlybird paper describes this style of in-memory real-time index.</p>`},
    {t:'Trending topics',
      think:`<p>A trend is not “most mentioned”, because that would always be “good morning”. It is <b>unusual growth</b> compared with a baseline. Stream jobs count terms for each country in sliding windows, and a count-min sketch keeps the memory bounded. They compare each count with the usual rate for that term at that time of day. They also filter out spam and bots before ranking.</p>`}],
  bottlenecks:{
    think:`<p>Twitter’s defining failure is the <b>world event</b>, when everyone posts and reads at once.</p>`,
    rows:[['An event spike (25 times the posting rate)', 'The fan-out queue falls behind, and timelines go stale', 'Queue the fan-out, let it lag, and scale up early for events you know about'], ['A celebrity post', 'A fan-out of 100 million', 'Merge high-follower accounts at read time'], ['Timeline cache memory', 'A huge Redis footprint', 'Keep lists only for active users, cap their length, and rebuild on demand'], ['A hot post (likes and replies)', 'Hot keys on counters', 'Use batched counters, and cache the post object'], ['Search during breaking news', 'The newest part gets hot', 'Replicate the newest part more, and cache popular queries for a few seconds']]},
  tradeoffs:{
    think:`<p>Everything is <b>eventually consistent</b> except the post itself. A post may take seconds to appear in timelines or search, and that is acceptable.</p>`,
    rows:[['Timelines', 'Hybrid fan-out into memory', 'Pull at read time', 'Fast reads, with a large memory and fan-out cost'], ['Search index', 'Split by time, with recent posts in memory', 'One big index', 'Fresh and fast for recent posts, and older posts need a separate archive index'], ['Trends', 'Growth against a baseline', 'Raw counts', 'Surfaces new topics, and needs a baseline for each term'], ['Ids', 'Snowflake (they sort by time)', 'Random UUIDs', 'Sorting by id sorts by time, and ids reveal when a post was made']],
    more:['“For you”: candidates from inside and outside your network, then a ranking model', 'Deletes and edits: markers that are checked when the post is fetched', 'Rate limits and spam filters before fan-out', 'Archive search over older posts'],
    followups:[['How do you build a ranked “For you” timeline?', 'Generate candidates (followed accounts, accounts similar to ones you engage with, and popular posts). Score them with a ranking model that predicts engagement. Then apply rules, such as variety and no more than N posts from one author. The chronological pipeline stays on as a cheap source of candidates.'], ['How do you delete a post everywhere?', 'Mark it deleted in the posts store. When posts are fetched, deleted ones are dropped from every timeline and search result at once. Background jobs then remove the id from caches and indexes.'], ['What happens during the IPL final?', 'Scale up the fan-out, the indexer and the timeline tiers early. Degrade gracefully instead of failing: let fan-out lag, refresh trends less often, and serve cached search results for hot queries.']],
    traps:['Pure push, without the celebrity numbers', 'Searching with a database LIKE query', 'Trends as raw counts', 'Assuming one global order of posts']},
  refs:['case:feed', 'l:fan-out', 'pg:fanout', 'l:inverted-index', 'l:hll-cms', 'l:unique-ids', 'pg:snowflake', 'l:kafka']});

/* ------------------------------------------------------------------ */
S({id:'google-drive', level:'intermediate', icon:'📁', title:'Google Drive', tags:['chunking', 'sync', 'sharing'],
  tagline:'Store exabytes, sync changes across every device by sending only the bytes that changed, and share files safely.',
  prompt:'Design a file storage and sync service like Google Drive or Dropbox.',
  focus:'chunking and removing duplicate data, the sync protocol and conflicts, and keeping metadata apart from bytes.',
  clarify:{
    think:`<p>The central idea of this design is <b>keeping metadata apart from the file bytes</b>. I check the file sizes, the sync expectations and sharing. I also say clearly that real-time co-editing of documents is out of scope, because it is a different problem.</p>`,
    ask:[['What is the biggest file?', 'Up to about 10 GB, and most files are small'], ['Which clients?', 'Web, a desktop sync client, and mobile'], ['Version history?', 'Keep old versions for 30 days'], ['Sharing?', 'View and edit permissions, for people and for links'], ['Real-time co-editing?', 'Out of scope (that is Google Docs)'], ['What is the scale?', 'About 1 billion users, about 100 million active each day, and a few GB stored for each user on average']],
    fr:['Upload, download and delete files and folders', 'Sync changes to all of a user’s devices', 'Version history and restore', 'Share with view or edit permissions'],
    nfr:['Never lose or corrupt a file (durability of about 11 nines)', 'Upload only the changed parts of large files', 'Changes reach other devices within seconds', 'Uploads that can resume on bad networks'],
    out:['real-time co-editing', 'full-text search inside files', 'office previews']},
  estimate:{
    think:`<p>Bytes dominate everything. So I size the storage first. Then I size the upload bandwidth, which is where syncing only changed chunks pays off.</p>`,
    assume:['Erasure coding stores about 1.5 bytes for each logical byte', 'About 10 metadata operations for each uploaded change'],
    inputs:[['users', 'Total users', 1e9, [1e7, 1e8, 1e9]], ['per', 'Average stored per user', 2e9, [5e8, 2e9, 5e9], 'B'], ['dau', 'Daily active users', 1e8, [1e7, 5e7, 1e8, 2e8]], ['chg', 'Changed files per user per day', 10, [2, 10, 50]], ['sz', 'Bytes uploaded per change', 5e5, [1e5, 5e5, 2e6], 'B']],
    rows:[
      ['total', 'Logical storage', v => v.users * v.per, 'B', 'users × average'],
      ['raw', 'Raw storage (erasure coded)', (v, r) => r.total * 1.5, 'B', '× 1.5'],
      ['ups', 'Uploads', v => v.dau * v.chg / 86400, '/s', 'users × changes ÷ 86,400'],
      ['bw', 'Upload bandwidth', (v, r) => r.ups * v.sz * 8, 'bps', 'uploads × bytes × 8'],
      ['meta', 'Metadata operations', (v, r) => r.ups * 10, '/s', 'uploads × 10']],
    so:(r, f) => `${f('total')} of files (${f('raw')} raw) needs a dedicated blob store built for that scale, with metadata in a separate database. Uploads at ${f('ups')} use ${f('bw')}, <b>but only because clients send just the changed chunks</b>. Re-uploading whole files would multiply that. Metadata at ${f('meta')} ${r.meta > 5e5 ? 'needs a sharded metadata database (split by user or by shared-folder namespace)' : 'fits a sharded SQL database comfortably'}.`},
  api:{
    think:`<p>An upload is a session. The client sends the list of chunk hashes, and the server answers which ones it lacks. The client uploads only those, then commits a new version. The commit names the version the client started from, so conflicting edits can be detected.</p>`,
    rows:[['POST /v1/uploads', 'Start {parent_id, name, size, chunk_hashes[]} → {session_id, missing[]}', 'Removes duplicates: only the missing chunks are sent'], ['PUT /v1/uploads/{sid}/chunks/{hash}', 'Upload one chunk', 'Can resume, and the hash is verified'], ['POST /v1/uploads/{sid}/commit', 'Create a version {base_version}', 'Returns 409 if someone else committed first'], ['GET /v1/changes?cursor=', 'What changed since my cursor', 'Long-poll, and it returns a new cursor'], ['POST /v1/files/{id}/permissions', 'Share {email or link, role}', 'Viewer, commenter or editor']],
    code:`POST /v1/uploads
{ "parent_id": "fld_9", "name": "thesis.pdf", "size": 48211022,
  "chunk_hashes": ["a91f…", "77c2…", "e0b4…", "…12 total"] }

200 OK
{ "session_id": "up_5c1", "missing": ["77c2…", "e0b4…"] }   // only 2 of the 12 chunks changed`, title:'start an upload'},
  data:{
    think:`<p>Metadata is relational: files, folders, versions, permissions and a change journal for each namespace. A version is just a list of chunk hashes. Chunks are named by their content and counted by the number of references in the blob store, so identical chunks are stored once.</p>`,
    code:`CREATE TABLE files (
  id          text PRIMARY KEY,
  namespace   bigint NOT NULL,           -- a user's root or a shared folder, and the shard key
  parent_id   text, name text NOT NULL, is_folder boolean NOT NULL,
  head_version int, deleted boolean NOT NULL DEFAULT false
);
CREATE TABLE versions (
  file_id text, version int, size bigint, chunks text[] NOT NULL,   -- the chunk hashes, in order
  created_by bigint, created_at timestamptz,
  PRIMARY KEY (file_id, version)
);
CREATE TABLE journal (                   -- the sync feed: every change in a namespace, in order
  namespace bigint, seq bigint, file_id text, op text,
  PRIMARY KEY (namespace, seq)
);
CREATE TABLE permissions (file_id text, principal text, role text, PRIMARY KEY (file_id, principal));`,
    stores:[['files, versions, journal, permissions', 'Sharded SQL, split by namespace', 'Transactions for commits, and an ordered journal'], ['chunks', 'A blob store, named by content and erasure coded', 'Exabytes, with duplicates removed by hash'], ['chunk reference counts', 'Next to the blob index', 'Garbage collection after versions expire'], ['downloads', 'A CDN with signed URLs', 'Fast reads near the user']]},
  hld:{
    think:`<p>There are two planes. A <b>block service</b> moves the bytes. A <b>metadata service</b> decides what those bytes mean. A notification service tells devices to pull changes, so clients do not have to poll all the time.</p>`,
    diagram:{n:[['dev', 'client', 'Devices', 'sync client', 0, 1], ['blk', 'service', 'Block service', 'chunks', 1, 0], ['api', 'service', 'Metadata API', 'files, versions', 1, 1], ['blob', 'db', 'Blob store', 'chunks by hash', 2, 0], ['mdb', 'db', 'Metadata DB', 'by namespace', 2, 1], ['notif', 'service', 'Notify svc', 'long-poll / push', 2, 2], ['jrn', 'queue', 'Journal', 'changes', 3, 1]],
      e:'dev>blk dev>api blk>blob api>mdb mdb>jrn jrn>notif dev>notif',
      f:[['Upload: the client sends chunk hashes, the server answers which are new, and only those bytes are uploaded.', 'dev>api:start upload (12 hashes)|api>mdb:which are new? → 2|dev>blk:PUT 2 chunks|blk>blob:store by hash'], ['Commit: a new version points at the full chunk list, and the change is added to the journal.', 'dev>api:commit (base v7)|api>mdb:v8 = [h1…h12]|mdb>jrn:change 9912'], ['Sync: other devices learn that something changed and pull everything after their cursor.', 'jrn>notif|notif>dev:namespace changed|dev>api:GET /changes?cursor=9911']]},
    walk:['The desktop client notices that <code>thesis.pdf</code> changed, splits it into chunks and hashes them.', 'It starts an upload with the list of hashes. The server replies that only 2 chunks are new, and the client uploads those two.', 'It commits with <code>base_version = 7</code>. The server creates version 8 and adds a journal entry.', 'The user’s laptop and phone are woken by long-poll or push. They fetch the changes after their cursor and download only the chunks they lack.']},
  deep:[
    {t:'Chunking, removing duplicates and syncing only the changes',
      think:`<p>With <b>fixed-size chunks</b> (Dropbox has described 4 MB blocks), editing the end of a file re-uploads one chunk, but adding a byte at the start shifts every boundary. <b>Content-defined chunking</b> puts boundaries where a rolling hash matches a pattern, so an insert changes only the chunks around it. Either way, chunks are named by their hash. So identical chunks (copies and old versions) are stored once, and uploads skip anything the server already has.</p>`,
      body:`<p>One caution: removing duplicates <i>across users</i> can leak information. An upload that finishes instantly proves that someone has already stored that file. Many services remove duplicates only inside one user’s files or one organisation.</p>`},
    {t:'The sync protocol and conflicts',
      think:`<p>Each namespace has an ordered <b>journal</b>, and each device remembers its cursor in it. Syncing means “give me everything after cursor N”, so a device that was offline for a week catches up the same way as one that was offline for a second. Commits carry the base version (optimistic concurrency). If two devices edited the same version offline, the second commit gets a 409, and the client saves its copy as a <b>conflicted copy</b> next to the original. Dropbox does this, because silently merging binary files is unsafe.</p>`},
    {t:'Sharing and permissions',
      think:`<p>Permissions attach to files and folders, and they are <b>inherited</b> down the tree. A shared folder is its own namespace, mounted into each member’s tree, so its journal is shared and sync works the same way. Every metadata read, and every signed download URL, checks permissions. Link sharing uses tokens that cannot be guessed and can be revoked.</p>`}],
  bottlenecks:{
    think:`<p>The blob store is built to scale sideways. The metadata is where hot spots appear.</p>`,
    rows:[['A huge shared folder, such as a company drive', 'One namespace shard gets heavy traffic', 'Cache listings, split very large namespaces, and rate-limit bulk clients'], ['Millions of tiny files', 'Metadata operations dominate, not bytes', 'Batch commits, and pack tiny files into one chunk'], ['Fan-out of notifications', 'Many devices for each shared folder', 'Notify only that “something changed”, and let devices pull'], ['Garbage collection', 'A risk of deleting a chunk that is still used', 'Use reference counts, a delay, and a mark-and-sweep check'], ['Large uploads on bad networks', 'They restart from zero', 'Use upload sessions that resume chunk by chunk']]},
  tradeoffs:{
    think:`<p>The main lever is how smart the client is. A smarter client (chunking and hashing) means far less bandwidth and less server work.</p>`,
    rows:[['Chunking', 'Content-defined', 'Fixed 4 MB blocks', 'Handles inserts well, and uses more CPU on the client'], ['Duplicate removal', 'For each user or organisation', 'Across everyone', 'No leak between users, and less storage saved'], ['Conflicts', 'Keep both copies', 'The last writer wins', 'No silent data loss, and users must resolve conflicts by hand'], ['Durability', 'Erasure coding', 'Three full copies', 'About 1.5 times the space instead of 3 times, and slower rebuilds and reads of cold data']],
    more:['Thumbnails and previews made in the background', 'Full-text search over documents', 'Client-side encryption for sensitive folders', 'Moving cold data to cheaper storage tiers'],
    followups:[['How do you resume a 5 GB upload after the Wi-Fi drops?', 'The upload session remembers which chunks arrived. The client asks for the state of the session and sends only the missing chunks. Nothing is visible until the commit.'], ['How do old versions get cleaned up?', 'Versions older than 30 days are deleted from the metadata, which lowers the reference count of their chunks. Chunks that reach zero are removed after a safety delay. A regular mark-and-sweep makes sure that no chunk that is still referenced is ever deleted.'], ['How is this different from Google Docs?', 'Drive syncs versions of whole files, and resolves conflicts by keeping both. Docs merges edits made at the same time, character by character, in real time, using operational transformation. See the Google Docs case study.']],
    traps:['Storing file bytes in the metadata database', 'Re-uploading whole files on every change', 'Polling every few seconds from every device', 'A last-writer-wins rule that silently overwrites offline edits']},
  refs:['case:dropbox', 'case:google-docs', 'l:storage-types', 'l:crdts-merkle', 'lab:merkle-diff', 'l:offline-first-sync', 'l:rbac-abac', 'l:cdn']});
})();
