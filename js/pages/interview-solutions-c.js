/* =====================================================================
   PART 15 · INTERVIEW WORKED SOLUTIONS (C)
   Zomato · Uber · YouTube · Netflix · Google Search
   Numbers are illustrative unless a public source is named.
   ===================================================================== */
(function(){
const SDA = window.SDA;
const S = def => SDA.register(Object.assign({kind:'solution'}, def));
const ceil = Math.ceil;

/* ------------------------------------------------------------------ */
S({id:'zomato', level:'intermediate', icon:'🍛', title:'Zomato / Swiggy', tags:['marketplace', 'dispatch', 'geo'],
  tagline:'A three-sided marketplace: customers, restaurants and riders, each with its own app, all coordinated by one order state machine at dinner time.',
  prompt:'Design a food delivery app like Zomato or Swiggy.',
  focus:'the order lifecycle across three apps, rider assignment timing, and the dinner peak.',
  clarify:{
    think:`<p>Food delivery has three parties, and each one sees the same order differently. I’ll scope it to browsing, ordering, the restaurant accepting, assigning a rider and live tracking. I also want the dinner-peak shape, because that’s when everything breaks.</p>`,
    ask:[['Which parties?', 'Customers, restaurants, delivery riders, each with an app'], ['Orders per day?', '~2M, a large share in a two-hour dinner window'], ['Riders online at peak?', '~300K'], ['How often do riders send location?', 'Every ~4 seconds while on duty'], ['Do we own payments?', 'Through a payment gateway'], ['Live tracking for customers?', 'Yes, rider on a map with an ETA']],
    fr:['Search nearby restaurants and menus', 'Place and pay for an order', 'Restaurant accepts with a prep time', 'Assign a rider; pickup; delivery', 'Live tracking and ETA'],
    nfr:['Order placement never double-charges (idempotent)', 'Assignment within seconds of the right moment', 'ETAs accurate to a few minutes', 'Survive the dinner peak'],
    out:['restaurant onboarding', 'ratings and reviews', 'grocery delivery']},
  estimate:{
    think:`<p>The daily average is misleading here. I’ll size for the dinner window, and separate the small, valuable order stream from the large, disposable location stream.</p>`,
    assume:['dinner window = 2 hours', '~8 search requests per order (browsing)'],
    inputs:[['perDay', 'Orders per day', 2e6, [5e5, 2e6, 5e6]], ['share', 'Share of orders at dinner', 25, [15, 25, 35], '%'], ['riders', 'Riders online at peak', 3e5, [5e4, 1e5, 3e5, 5e5]], ['ping', 'Location ping every', 4, [2, 4, 10], 's']],
    rows:[
      ['avg', 'Orders (daily average)', v => v.perDay / 86400, '/s', 'per day ÷ 86,400'],
      ['po', 'Orders (dinner peak)', v => v.perDay * v.share / 100 / 7200, '/s', 'dinner share ÷ 7,200 s'],
      ['search', 'Searches at dinner peak', (v, r) => r.po * 8, '/s', 'orders × 8'],
      ['pings', 'Rider location writes', v => v.riders / v.ping, '/s', 'riders ÷ ping interval']],
    so:(r, f, v) => `Orders peak at ${f('po')}, ${(r.po / r.avg).toFixed(1)}× the daily average, so the dinner window sizes the system. Orders are few and precious: transactions and a state machine. Rider locations are the heavy stream (${f('pings')}) and are only useful for seconds, so they go to an <b>in-memory geo index</b>, not the order database.`},
  api:{
    think:`<p>Each app gets the endpoints for its own role. All state changes go through the order service so that every party sees one consistent story.</p>`,
    rows:[['GET /v1/restaurants?lat=&lng=&q=', 'Nearby open restaurants', 'Cached per area cell'], ['POST /v1/orders', 'Place {restaurant_id, items, address, payment}', 'Idempotency-Key'], ['POST /v1/orders/{id}/accept', 'Restaurant accepts {prep_minutes}', 'Or reject with a reason'], ['PUT /v1/riders/me/location', 'Batched GPS points', 'Every few seconds'], ['POST /v1/offers/{id}/accept', 'Rider accepts a delivery', 'Times out after ~20 s'], ['GET /v1/orders/{id}/track (SSE)', 'Live status, rider position, ETA', 'Throttled updates']]},
  data:{
    think:`<p>The order is a <b>state machine</b> stored relationally. Locations live in Redis GEO (or an H3-cell map) with a short TTL. Restaurants and menus are indexed for geo + text search.</p>`,
    code:`CREATE TABLE orders (
  id            text PRIMARY KEY,
  idem_key      text UNIQUE NOT NULL,
  customer_id   bigint NOT NULL,
  restaurant_id bigint NOT NULL,
  rider_id      bigint,
  status        text NOT NULL,   -- PLACED → ACCEPTED → READY → PICKED_UP → DELIVERED | CANCELLED
  prep_minutes  int,
  total_minor   bigint NOT NULL,
  placed_at     timestamptz NOT NULL DEFAULT now(),
  version       int NOT NULL DEFAULT 0
);
-- Transitions are conditional:  UPDATE orders SET status = 'PICKED_UP', version = version + 1
--                               WHERE id = $1 AND status = 'READY' AND rider_id = $2;
-- Rider locations (Redis):      GEOADD riders:blr 77.59 12.97 rider:881   (+ TTL heartbeat)`,
    stores:[['orders, payments', 'Postgres, partitioned by city', 'Transactions; strict states'], ['restaurants, menus', 'Search index (geo + text) + cache', 'Read-heavy browsing'], ['rider locations', 'Redis GEO / H3 cells in memory', 'High write rate, short-lived'], ['order events', 'Kafka', 'Notify apps, analytics, ETA models']]},
  hld:{
    think:`<p>Three clients, one order service. Dispatch is separate because it is computational: it reads live rider positions and decides who gets which order and when.</p>`,
    diagram:{n:[['c', 'client', 'Customer app', '', 0, 0], ['r', 'client', 'Restaurant', 'tablet', 0, 1], ['rd', 'client', 'Rider app', '', 0, 2], ['gw', 'lb', 'API gateway', '', 1, 1], ['search', 'service', 'Search', 'restaurants, menus', 2, 0], ['es', 'db', 'Search index', 'geo + cuisine', 3, 0], ['ord', 'service', 'Order svc', 'state machine', 2, 1], ['odb', 'db', 'Orders DB', 'by city', 3, 1], ['disp', 'service', 'Dispatch', 'assign riders', 2, 2], ['loc', 'cache', 'Rider locations', 'Redis GEO', 3, 2], ['ev', 'queue', 'Order events', 'Kafka', 4, 1]],
      e:'c>gw r>gw rd>gw gw>search search>es gw>ord ord>odb ord>disp disp>loc gw>loc odb>ev',
      f:[['Browse: nearby open restaurants from the geo + text index.', 'c>gw:biryani near me|gw>search|search>es:within 6 km, open now'], ['Order: placed, then the restaurant accepts with a prep time.', 'c>gw:POST /orders|gw>ord|ord>odb:PLACED|r>gw:accept, 15 min|gw>ord|ord>odb:ACCEPTED'], ['Dispatch: shortly before the food is ready, pick a nearby rider and offer the job.', 'ord>disp:ready in ~6 min|disp>loc:riders within 3 km|disp>ord:offer to R-881'], ['Tracking: rider pings update the geo index; status events go to every app.', 'rd>gw:location every 4 s|gw>loc:GEOADD|odb>ev:PICKED_UP']]},
    walk:['The customer orders; the order service stores PLACED and starts payment.', 'The restaurant accepts with 15 minutes of prep; the order becomes ACCEPTED.', 'Dispatch waits until about one travel time before the food is ready, finds candidate riders nearby, scores them by ETA and offers the job.', 'The rider picks up and delivers; each status change is a conditional update plus an event that updates all three apps.']},
  deep:[
    {t:'One order, three apps: the state machine',
      think:`<p>Every party acts on the same order, often at the same moment (the customer cancels just as the restaurant accepts). So every transition is a <b>conditional update</b> from an expected state, and the loser of a race gets a clear error. Timers drive the unhappy paths: a restaurant that doesn’t accept within ~3 minutes auto-cancels and refunds; a rider who doesn’t accept an offer in 20 seconds triggers the next offer.</p>`},
    {t:'When and whom to assign',
      think:`<p>Assigning a rider the moment the order is placed wastes rider time waiting at the restaurant. Assigning <b>just in time</b> (prep time minus travel time) frees riders for other work, and <b>batching</b> two orders from the same area onto one rider saves more. In this course’s dinner-rush simulation, rider-minutes per order fell from 19.7 (assign at once) to 17.0 (just in time) to 15.5 (just in time + batching).</p>`,
      body:`<p>Scoring candidates uses road ETA to the restaurant, current load, and whether the new order is on the way for a rider already carrying one. Offers go to one rider at a time with a short timeout, so two riders never race to the same pickup.</p>`},
    {t:'ETAs customers can trust',
      think:`<p>The ETA is the sum of three uncertain parts: <b>prep time</b> (learned per restaurant, dish count and time of day), <b>rider-to-restaurant</b> and <b>restaurant-to-customer</b> travel time (road graph plus live speeds). I’d show a range rather than a single number, and update it as events arrive (accepted, picked up), because a moving estimate that gets more accurate feels better than a precise one that turns out wrong.</p>`}],
  bottlenecks:{
    think:`<p>Dinner peak breaks the marketplace balance before it breaks any server.</p>`,
    rows:[['Not enough riders at peak', 'Offers time out; ETAs climb', 'Widen radius, batch more, surge delivery fee, pause far-away restaurants'], ['Location write load', 'Redis CPU', 'Shard GEO sets by city / cell; batch pings'], ['Restaurant tablet offline', 'Orders stuck in PLACED', 'Auto-call fallback; auto-pause restaurants that miss accepts'], ['Search spikes at 8 p.m.', 'Index latency', 'Cache results per area cell for a minute'], ['Payment gateway slow', 'Orders stuck before PLACED', 'Retry with the same key; second gateway']]},
  tradeoffs:{
    think:`<p>Most decisions trade <b>rider efficiency</b> against <b>customer wait</b>.</p>`,
    rows:[['Assignment timing', 'Just in time + batching', 'Assign at order', 'Fewer idle rider-minutes; risk of a late rider if prep is faster than predicted'], ['Locations', 'In-memory geo index', 'Database with spatial index', 'Handles the write rate; positions lost on crash (rebuilt in seconds)'], ['Partitioning', 'By city', 'Global', 'Cities are independent; cross-city features need care'], ['ETA display', 'A range, updated', 'One fixed number', 'Honest; slightly less satisfying at first']],
    more:['Demand forecasting per zone to pre-position riders', 'Kitchen display integration for accurate prep times', 'Rider earnings fairness in assignment', 'Fraud checks on refunds'],
    followups:[['A rider rejects or goes offline mid-delivery. What happens?', 'Offers time out and cascade to the next candidate. If a rider with food goes offline, their heartbeat expires, ops are alerted, and the order is reassigned or refunded depending on its state.'], ['How do you show the rider moving on the customer’s map?', 'The tracking endpoint (SSE or WebSocket) subscribes to that order’s rider; positions are snapped to roads and sent every few seconds. Clients interpolate between points so the icon moves smoothly.'], ['How do you avoid showing restaurants that just closed?', 'Restaurants publish open/paused events; the index updates within seconds, and the order service re-checks at placement time.']],
    traps:['Designing only the customer app', 'Storing every GPS ping in the orders database', 'Assigning riders at order time without discussing idle time', 'No timeouts for restaurant accept or rider offers']},
  refs:['case:zomato', 'case:uber', 'l:geospatial', 'pg:geo', 'l:websockets-at-scale', 'l:saga-outbox', 'l:event-driven']});

/* ------------------------------------------------------------------ */
S({id:'uber', level:'advanced', icon:'🚕', title:'Uber', tags:['geo index', 'matching', 'real-time'],
  tagline:'Match riders to nearby drivers in seconds while millions of drivers stream their location every few seconds.',
  prompt:'Design Uber: riders request trips and are matched with nearby drivers in real time.',
  focus:'the location index, matching (and avoiding double assignment), and surge pricing.',
  clarify:{
    think:`<p>The core loop is: drivers stream locations → a rider requests → find nearby available drivers → offer → accept → track. I’ll confirm scale and which extras (surge, pooling) matter, and leave payments as a downstream step.</p>`,
    ask:[['Scale?', 'Uber reports billions of trips a year; assume ~25M trips/day'], ['Drivers online at peak?', '~1.5M worldwide'], ['Location update interval?', '~4 seconds'], ['Matching latency?', 'Offer within a few seconds'], ['Surge pricing?', 'Yes, per area'], ['Shared rides?', 'Out of scope (mention)']],
    fr:['Drivers go online and stream location', 'Riders get a fare estimate and request a trip', 'Match and offer to a driver; accept or decline', 'Trip lifecycle and live tracking', 'Surge pricing by area'],
    nfr:['Match within seconds', 'A driver is never assigned two trips', 'Location updates absorbed without loss of freshness', 'Cities keep working if another region fails'],
    out:['payments internals', 'shared rides', 'driver onboarding']},
  estimate:{
    think:`<p>Trips are a small number. The location stream is the big one, and it determines how the index must be built.</p>`,
    assume:['peak ≈ 3× average', '~100 bytes per location update'],
    inputs:[['trips', 'Trips per day', 2.5e7, [1e6, 5e6, 2.5e7]], ['drivers', 'Drivers online at peak', 1.5e6, [1e5, 5e5, 1.5e6, 3e6]], ['ping', 'Location update every', 4, [2, 4, 8], 's']],
    rows:[
      ['tavg', 'Trip requests (average)', v => v.trips / 86400, '/s', 'trips ÷ 86,400'],
      ['tpk', 'Trip requests (peak)', (v, r) => r.tavg * 3, '/s', '3× average'],
      ['pings', 'Location updates', v => v.drivers / v.ping, '/s', 'drivers ÷ interval'],
      ['bw', 'Location ingest bandwidth', (v, r) => r.pings * 100 * 8, 'bps', 'updates × 100 B']],
    so:(r, f) => `Trip requests are small (${f('tpk')} at peak) but the location stream is ${f('pings')} (${f('bw')}). Each update overwrites the last, so it belongs in an <b>in-memory index sharded by geography</b>, and a match query must touch only the few cells around the pickup point.`},
  api:{
    think:`<p>Drivers and riders hold persistent connections (offers and tracking are pushed). Requests that change trip state go through the trip service with idempotency keys.</p>`,
    rows:[['WS driver → location {lat, lng, heading, ts}', 'Every few seconds', 'Batched when the connection is poor'], ['POST /v1/estimates', 'Fare + surge + pickup ETA for {pickup, dropoff, product}', 'Estimate is locked for a few minutes'], ['POST /v1/trips', 'Request a trip with an estimate id', 'Idempotency-Key'], ['WS offer → driver; POST /v1/offers/{id}/accept', 'Offer with a ~15 s timeout', 'First valid accept wins'], ['GET /v1/trips/{id} (WS updates)', 'Status, driver position, ETA', '']]},
  data:{
    think:`<p>Trips are durable and transactional. Driver positions are an in-memory map from <b>cell</b> to drivers. Uber open-sourced <b>H3</b>, a hexagonal grid, for this kind of indexing: hexagons have equal-distance neighbours, which makes “all cells within k rings” simple.</p>`,
    code:`CREATE TABLE trips (
  id          text PRIMARY KEY,
  rider_id    bigint NOT NULL,
  driver_id   bigint,
  status      text NOT NULL,     -- REQUESTED → OFFERED → ACCEPTED → ARRIVED → ON_TRIP → COMPLETED | CANCELLED
  pickup      point NOT NULL, dropoff point NOT NULL,
  fare_minor  bigint, surge numeric(3,2),
  city        text NOT NULL,     -- partition key
  version     int NOT NULL DEFAULT 0
);
CREATE TABLE drivers (
  id bigint PRIMARY KEY, status text NOT NULL,    -- OFFLINE | AVAILABLE | OFFERED | ON_TRIP
  current_trip text, offer_expires_at timestamptz
);
-- Location index (in memory, per city shard): h3_cell(res 9) -> {driver_id: (lat, lng, ts)}`,
    stores:[['trips, drivers', 'Relational, partitioned by city', 'State transitions with conditional updates'], ['location index', 'In-memory, sharded by cell / city', 'Overwritten every few seconds'], ['location stream', 'Kafka', 'Feeds index, ETA models, surge, history'], ['trip traces', 'Object storage / columnar store', 'Fare disputes, analytics']]},
  hld:{
    think:`<p>Locations flow through a log into the geo index. The trip service owns state. Matching reads the index, asks the routing engine for real road ETAs, and offers the trip. Pricing computes surge per cell from demand and supply.</p>`,
    diagram:{n:[['rider', 'client', 'Rider app', '', 0, 0], ['driver', 'client', 'Driver app', '', 0, 2], ['gw', 'lb', 'Gateway', 'WebSockets', 1, 1], ['trip', 'service', 'Trip svc', 'state machine', 2, 0], ['tdb', 'db', 'Trips DB', 'by city', 3, 0], ['match', 'service', 'Matching', 'ETA scoring', 2, 1], ['price', 'service', 'Pricing', 'surge per cell', 2, 2], ['loc', 'cache', 'Geo index', 'H3 cells', 3, 1], ['k', 'queue', 'Locations', 'Kafka stream', 3, 2], ['map', 'ext', 'Routing engine', 'road ETAs', 4, 0]],
      e:'rider>gw driver>gw gw>trip gw>price gw>k trip>tdb trip>match match>loc match>map k>loc price>loc',
      f:[['Location: drivers stream positions; the index keeps the latest per cell.', 'driver>gw:lat/lng every 4 s|gw>k|k>loc:update cell 8961…'], ['Request: estimate with surge for the pickup cell, then create the trip.', 'rider>gw:request from MG Road|gw>price:fare, surge 1.3×|price>loc:demand vs supply|gw>trip|trip>tdb:REQUESTED'], ['Match: candidates from nearby cells, ranked by road ETA; the best driver gets an offer.', 'trip>match|match>loc:available within 2 rings|match>map:ETAs for 12 drivers|trip>tdb:OFFERED to D-31|gw>driver:offer (15 s)']]},
    walk:['Drivers’ apps send positions every ~4 s; the stream updates the in-memory index for their city.', 'A rider asks for an estimate; pricing looks at demand vs available drivers in the pickup cell and its neighbours.', 'On request, matching gathers available drivers in nearby rings, gets road ETAs, and picks the best.', 'The driver is atomically moved AVAILABLE → OFFERED; the offer is pushed; on accept the trip becomes ACCEPTED and both apps start live tracking.']},
  deep:[
    {t:'The location index',
      think:`<p>A database spatial index can’t absorb hundreds of thousands of writes per second that are overwritten seconds later. So: split the map into <b>cells</b> (geohash squares, a quadtree, or H3 hexagons), keep cell → drivers in memory, and shard by city or cell range. A query for a pickup point computes its cell, takes the surrounding k rings, and filters by availability and freshness. Entries older than ~30 seconds are ignored, so a driver who loses signal drops out automatically. If an index node dies, it rebuilds from the stream in seconds.</p>`},
    {t:'Matching without double assignment',
      think:`<p>Nearest-first <b>greedy</b> matching is simple but can be wasteful when several requests arrive together. <b>Batched</b> matching collects requests for a second or two and solves an assignment problem across all of them. In this course’s simulation, batched matching was never worse than greedy and saved about 5.6% of pickup distance on average. Either way, use <b>road ETA</b>, not straight-line distance (a river is in the way).</p>`,
      body:`<p>To prevent two trips grabbing the same driver, the offer is a conditional update on the driver row: <code>UPDATE drivers SET status = 'OFFERED' … WHERE id = $1 AND status = 'AVAILABLE'</code>. Only one succeeds. The offer has an expiry, so a driver who ignores it becomes available again.</p>`},
    {t:'Surge pricing',
      think:`<p>For each cell (and its neighbours), compare open requests with available drivers over a short window. Above a threshold, the price multiplier rises, which both reduces demand and attracts drivers from nearby cells. Smooth it over time and across neighbouring cells, cap it, and <b>lock the quoted price</b> for a few minutes so the rider pays what they saw.</p>`}],
  bottlenecks:{
    think:`<p>Geography creates hot spots: everyone leaves the stadium at the same time.</p>`,
    rows:[['Stadium or airport surge', 'One cell shard overloaded', 'Finer cells there; more replicas; batch matching'], ['Location stream spikes', 'Index lag', 'Partition the log by city / cell; drop stale updates'], ['Double offers in a race', 'Two trips on one driver', 'Conditional update on driver status'], ['Routing engine slow', 'Matching latency', 'Cache ETAs between cells; fall back to distance-based estimates'], ['A region goes down', 'Cities offline', 'Deploy per region; replicate trip state; drivers reconnect elsewhere']]},
  tradeoffs:{
    think:`<p>Freshness and speed beat durability for locations; strict correctness wins for trips and money.</p>`,
    rows:[['Index', 'In-memory cells (H3)', 'Database spatial index', 'Absorbs the write rate; rebuilt from the stream on failure'], ['Matching', 'Short batches', 'Greedy nearest', 'Better global assignment; adds a second or two'], ['Offers', 'One driver at a time', 'Broadcast to many', 'No double accepts; slower if drivers decline'], ['Partitioning', 'By city / region', 'Global', 'Isolation and locality; trips crossing regions need care']],
    more:['Shared rides (route insertion)', 'Predictive positioning of idle drivers', 'Fraud and safety checks', 'Trip receipts from stored GPS traces'],
    followups:[['How do you compute an ETA?', 'Route on a road graph with live and historical speeds per segment, then apply a learned correction for pickups (finding the rider, traffic lights). Cache cell-to-cell ETAs for matching; compute exact routes only for the chosen driver.'], ['The matching service crashes after offering. What happens?', 'The trip and driver rows hold the state. The offer has an expiry, so if no accept arrives the driver returns to AVAILABLE and another matcher instance retries the trip. Every step is idempotent by trip id.'], ['How do you scale to 10,000 cities?', 'Cities are mostly independent, so shard everything (index, trips, matching) by city or region. Global services are limited to accounts, payments and analytics.']],
    traps:['Storing each GPS update in the trips database', 'Straight-line distance for matching', 'No guard against assigning one driver twice', 'Ignoring stale locations']},
  refs:['case:uber', 'case:google-maps', 'l:geospatial', 'pg:geo', 'l:distributed-locks', 'l:websockets-at-scale', 'l:kafka']});

/* ------------------------------------------------------------------ */
S({id:'youtube', level:'advanced', icon:'▶️', title:'YouTube', tags:['transcoding', 'CDN', 'ABR'],
  tagline:'Hundreds of hours uploaded every minute, a billion hours watched every day: a transcoding factory feeding the biggest CDN problem there is.',
  prompt:'Design YouTube: creators upload videos, and viewers anywhere stream them.',
  focus:'the upload and transcoding pipeline, adaptive streaming, and serving the egress from a CDN.',
  clarify:{
    think:`<p>Two very different halves: an <b>ingest pipeline</b> (upload → transcode → publish) and a <b>delivery system</b> (metadata + segments through a CDN). I’ll anchor scale on public numbers: YouTube has said more than 500 hours of video are uploaded every minute, and in 2017 that people watch over a billion hours a day.</p>`,
    ask:[['Upload volume?', '~500 hours of video per minute'], ['Watch volume?', '~1B hours per day'], ['Max video length / size?', 'Hours long; tens of GB'], ['Devices?', 'Phones, TVs, browsers on all kinds of networks'], ['Live streaming?', 'Out of scope (mention)'], ['Comments, likes, recommendations?', 'Mention; focus on video']],
    fr:['Upload (resumable) and process videos', 'Watch with adaptive quality', 'View counts, likes', 'Search and recommendations (brief)'],
    nfr:['Playback starts in ~1–2 s; rare rebuffering', 'Uploads survive network drops', 'Videos available minutes after upload', 'Huge egress at reasonable cost'],
    out:['live streaming', 'monetisation', 'Content ID internals']},
  estimate:{
    think:`<p>Egress decides the architecture. Storage decides the cost. Both come from the two public anchors.</p>`,
    assume:['all renditions together ≈ 8 Mbps per source second (illustrative ladder)', 'average watch bitrate is an input'],
    inputs:[['hpm', 'Hours uploaded per minute', 500, [100, 500, 1000], 'h'], ['watch', 'Hours watched per day', 1e9, [1e8, 5e8, 1e9, 2e9], 'h'], ['br', 'Average streaming bitrate', 2.5e6, [1e6, 2.5e6, 5e6], 'bps']],
    rows:[
      ['upDay', 'Hours uploaded per day', v => v.hpm * 1440, 'h', 'per minute × 1,440'],
      ['store', 'New storage per day', (v, r) => r.upDay * 3600 * 1e6, 'B/day', 'hours × 3,600 s × 8 Mbps ÷ 8'],
      ['egress', 'Average egress', v => v.watch * 3600 * v.br / 86400, 'bps', 'watch-seconds × bitrate ÷ 86,400'],
      ['viewers', 'Average concurrent viewers', v => v.watch / 24, 'n', 'hours per day ÷ 24']],
    so:(r, f) => `Egress of ${f('egress')} on average (${f('viewers')} people watching at any moment) can’t come from a few data centres: it must be served by <b>CDN caches deep inside ISPs</b>. Storage grows by ${f('store')}. Popularity is heavily skewed, so most of it is rarely watched: keep fewer renditions of cold videos and move them to cheaper storage.`},
  api:{
    think:`<p>Uploads are resumable sessions. Playback is two steps: get metadata and a manifest URL from the API, then the player pulls segments from the CDN directly.</p>`,
    rows:[['POST /v1/videos', 'Create {title, description, visibility} → {video_id, upload_url}', 'Resumable upload session'], ['PUT {upload_url} (Content-Range)', 'Upload chunks; resume from the last byte', 'Survives network drops'], ['GET /v1/videos/{id}', 'Metadata + manifest URL', 'Status: PROCESSING / READY'], ['GET {cdn}/v/{id}/master.m3u8', 'HLS/DASH manifest → renditions → segments', 'Cacheable'], ['POST /v1/events', 'Batched watch events', 'Views, quality, rebuffering']]},
  data:{
    think:`<p>Metadata is relational but huge, so it is sharded; YouTube created <b>Vitess</b> to shard MySQL. Video segments are blobs addressed by (video, rendition, segment number). View counts come from event pipelines, not row updates.</p>`,
    code:`CREATE TABLE videos (
  id          text PRIMARY KEY,
  channel_id  bigint NOT NULL,          -- shard key (Vitess-style)
  title       text NOT NULL,
  status      text NOT NULL,            -- UPLOADING | PROCESSING | READY | BLOCKED
  duration_s  int,
  created_at  timestamptz NOT NULL
);
CREATE TABLE renditions (
  video_id text, profile text,          -- 'h264_360p', 'vp9_1080p', 'av1_2160p', …
  bitrate_kbps int, manifest_key text,
  PRIMARY KEY (video_id, profile)
);
-- Segments in blob storage:  v/{video_id}/{profile}/{segment_no}.m4s`,
    stores:[['videos, channels, renditions', 'Sharded MySQL (Vitess)', 'Relational metadata at scale'], ['source files + segments', 'Blob storage, tiered hot / cold', 'Petabytes per day'], ['view and watch events', 'Log → stream processing', 'Counts, quality, recommendations'], ['search', 'Inverted index over titles, captions', 'Discovery']]},
  hld:{
    think:`<p>The left half is a pipeline driven by a job queue; the right half is read-only and CDN-heavy. They meet at the metadata database and the segment store.</p>`,
    diagram:{n:[['up', 'client', 'Creator', '', 0, 0], ['vw', 'client', 'Viewer', '', 0, 2], ['upl', 'service', 'Upload svc', 'resumable', 1, 0], ['api', 'service', 'Watch API', 'metadata', 1, 2], ['raw', 'db', 'Raw uploads', '', 2, 0], ['meta', 'db', 'Metadata DB', 'sharded MySQL', 2, 1], ['cdn', 'cdn', 'CDN / ISP caches', '', 2, 2], ['tq', 'queue', 'Job queue', 'transcode', 3, 0], ['tw', 'service', 'Transcoders', 'chunks in parallel', 4, 0], ['seg', 'db', 'Segment store', 'all renditions', 4, 1]],
      e:'up>upl upl>raw upl>meta raw>tq tq>tw tw>seg tw>meta vw>api api>meta vw>cdn~-0.3 cdn>seg',
      f:[['Upload: resumable chunks land in raw storage; the video is PROCESSING.', 'up>upl:resumable upload|upl>raw:source file|upl>meta:PROCESSING|raw>tq:transcode job'], ['Transcode: split into chunks, encode every rendition in parallel, write segments and manifests.', 'tq>tw:job (60 chunks)|tw>seg:240p … 4K segments|tw>meta:READY'], ['Watch: metadata from the API, manifest and segments from the nearest cache; the player adapts quality.', 'vw>api:GET video|api>meta|vw>cdn:manifest + segments|cdn>seg:miss → fill']]},
    walk:['The creator’s client uploads in chunks to a resumable session; the source lands in raw storage.', 'A job splits the source into short pieces at keyframes; hundreds of workers encode each piece into every rendition in parallel; a final step writes manifests and marks the video READY.', 'A viewer opens the video; the API returns metadata and a manifest URL on the CDN.', 'The player downloads a few seconds at a time, choosing the bitrate from measured throughput and buffer level; the CDN fills misses from the segment store.']},
  deep:[
    {t:'The transcoding pipeline',
      think:`<p>Encoding a two-hour 4K video on one machine takes hours, so the source is <b>split into chunks</b> at keyframe boundaries and encoded in parallel, then stitched. Each source becomes a <b>ladder</b> of renditions (240p … 4K) in several codecs: H.264 for compatibility, and VP9 and AV1, which YouTube uses for smaller files at the same quality. Expensive codecs can be applied first to videos that become popular, where the bandwidth savings pay for the CPU.</p>`,
      body:`<p>The pipeline is a DAG of tasks (validate → split → encode × N → stitch → thumbnails → captions → publish), each retried independently, so one failed chunk doesn’t restart the whole job.</p>`},
    {t:'Adaptive streaming and the CDN',
      think:`<p>Segments are a few seconds long and listed in an HLS or DASH manifest per rendition. The player picks each next segment’s quality from measured throughput and how full its buffer is, so it drops quality instead of stalling. Delivery relies on caches <b>inside ISPs</b>; Google runs Google Global Cache appliances in ISP networks. Popular videos are cached at the edge; the long tail is served from regional caches or the origin.</p>`},
    {t:'View counts and recommendations',
      think:`<p>Updating a counter row per view would melt on a viral video. Views are <b>events</b> in a log; stream jobs filter bots and duplicates, then aggregate. The count shown can lag and be corrected later. Recommendations follow the two-stage design YouTube published in 2016: <b>candidate generation</b> narrows billions of videos to hundreds, then a <b>ranking</b> model orders them for this viewer.</p>`}],
  bottlenecks:{
    think:`<p>Popularity skew helps caching and hurts everything else.</p>`,
    rows:[['A video goes viral', 'Cache misses at many edges at once', 'Pre-warm edges once growth is detected; request coalescing at caches'], ['Upload spikes', 'Transcode queue grows', 'Autoscale workers; prioritise short videos and popular channels'], ['Long-tail storage cost', 'Petabytes of rarely watched renditions', 'Cold tier; drop high renditions for cold videos and re-encode on demand'], ['Metadata hot rows', 'Counters, popular videos', 'Event-based counts; cache video metadata'], ['Slow networks', 'Rebuffering', 'Low-bitrate renditions; short first segments']]},
  tradeoffs:{
    think:`<p>Most trade-offs are <b>compute and storage spent to save bandwidth</b>.</p>`,
    rows:[['Renditions', 'Encode the main ladder at upload', 'On demand', 'Instant playback at any quality; storage for videos nobody watches'], ['Codecs', 'H.264 + VP9/AV1 for popular videos', 'H.264 only', 'Smaller files where it matters; far more encoding CPU'], ['Delivery', 'Caches inside ISPs', 'Central data centres', 'Lower cost and latency; huge distributed fleet'], ['Counts', 'Event-based, approximate first', 'Exact counters', 'Scales; numbers lag and get corrected']],
    more:['Live streaming (real-time transcode, low-latency HLS)', 'Duplicate and copyright detection by fingerprint', 'Captions with speech recognition', 'Per-region popularity to pre-position content'],
    followups:[['How would you add live streaming?', 'Ingest RTMP or SRT at the nearest point, transcode in real time into a smaller ladder, publish short segments with low-latency HLS/DASH, and fan out through the same CDN. The pipeline must be faster than real time and can’t retry slowly.'], ['How do you avoid storing the same video twice?', 'Fingerprint uploads (exact hashes for identical files, perceptual fingerprints for re-encodes); for exact duplicates, point the new video at the existing renditions.'], ['Why split videos into chunks for transcoding?', 'Parallelism turns hours into minutes, a failed chunk retries alone, and workers stay small and uniform.']],
    traps:['Serving video from application servers', 'Transcoding on the upload server synchronously', 'One fixed bitrate for every viewer', 'Counting views with a database increment']},
  refs:['case:youtube', 'case:netflix', 'l:transcoding-pipeline', 'l:live-streaming-abr', 'l:cdn', 'l:recommendations', 'l:storage-types']});

/* ------------------------------------------------------------------ */
S({id:'netflix', level:'advanced', icon:'🎬', title:'Netflix', tags:['Open Connect', 'personalisation', 'resilience'],
  tagline:'A small, curated catalogue watched by hundreds of millions in the same evening hours: pre-position the bytes, precompute the home page, and expect failures.',
  prompt:'Design Netflix: a subscription service streaming films and series to hundreds of millions of members.',
  focus:'how this differs from YouTube (catalogue size, predictability), the CDN strategy, personalisation and resilience.',
  clarify:{
    think:`<p>On the surface it’s “YouTube again”, but the constraints are opposite. The catalogue is <b>small and curated</b>, uploads are not a user feature, and demand is <b>predictable</b> (evenings, new releases). That changes the CDN strategy completely, so I’ll confirm those properties first.</p>`,
    ask:[['Catalogue size?', 'Thousands to tens of thousands of titles'], ['Members?', 'Hundreds of millions'], ['Peak concurrent streams?', '~30M in the busiest hour (illustrative)'], ['Devices?', 'TVs mostly, phones, browsers'], ['Personalised home page?', 'Yes: rows and artwork per profile'], ['Downloads, live events, games?', 'Out of scope (mention live)']],
    fr:['Browse a personalised home page', 'Play with adaptive quality and DRM', 'Continue watching across devices', 'Profiles and parental controls'],
    nfr:['Playback starts in ~1–2 s, almost no rebuffering', 'Peak egress served at low cost', 'Home page loads fast even if recommendation services fail', 'Survive the loss of a cloud region'],
    out:['studio and content-production tools', 'billing internals', 'games']},
  estimate:{
    think:`<p>The peak egress is the problem; the catalogue size is the opportunity. If the whole popular catalogue fits in a cache box, you can copy it ahead of time.</p>`,
    assume:['~100 Gbps per cache appliance (illustrative)', 'stored bytes per title include every codec, resolution and audio track'],
    inputs:[['streams', 'Peak concurrent streams', 3e7, [5e6, 1e7, 3e7, 5e7]], ['br', 'Average bitrate', 5e6, [3e6, 5e6, 8e6], 'bps'], ['titles', 'Titles in catalogue', 15000, [5000, 15000, 30000]], ['per', 'Stored bytes per title (all encodes)', 1e11, [5e10, 1e11, 3e11], 'B']],
    rows:[
      ['egress', 'Peak egress', v => v.streams * v.br, 'bps', 'streams × bitrate'],
      ['cat', 'Whole catalogue', v => v.titles * v.per, 'B', 'titles × bytes per title'],
      ['apps', 'Cache appliances (minimum)', (v, r) => ceil(r.egress / 1e11), 'appliances', 'egress ÷ 100 Gbps']],
    so:(r, f) => `Peak egress of ${f('egress')} is the whole problem. The entire catalogue is only ${f('cat')}, and the popular part is much smaller, so the popular files can be <b>copied into caches inside ISPs every night</b> (fill off-peak, serve at peak) instead of caching on demand. At ~100 Gbps each, that’s at least ${f('apps')} before redundancy, spread over ISPs and cities.`},
  api:{
    think:`<p>The playback call is the important one: it checks entitlement, picks which nearby caches should serve this client, and returns the manifest and a DRM licence endpoint.</p>`,
    rows:[['GET /v1/home?profile=', 'Personalised rows (precomputed)', 'Falls back to popular rows'], ['GET /v1/titles/{id}', 'Details, episodes, artwork', 'Cached'], ['POST /v1/playback/{title}', 'Manifest with ranked cache URLs + licence URL', 'Checks plan, region, device'], ['POST /v1/license', 'DRM licence for the content keys', 'Widevine / PlayReady / FairPlay'], ['POST /v1/events', 'Heartbeats: position, bitrate, errors', 'Continue watching + quality monitoring']]},
  data:{
    think:`<p>Different data, different stores. Netflix has written publicly about using Cassandra for viewing history and EVCache (a memcached-based cache) for precomputed data.</p>`,
    code:`-- Viewing history (Cassandra-style): one partition per profile, newest first
CREATE TABLE viewing (
  profile_id bigint, title_id bigint, watched_at timestamp,
  position_s int, device text,
  PRIMARY KEY ((profile_id), watched_at, title_id)
) WITH CLUSTERING ORDER BY (watched_at DESC);

-- Precomputed home rows (cache): rows:{profile_id} -> [{row: "Because you watched…", titles: […]}]
-- Content map: which cache appliance holds which encoded files
--   cache_files(appliance_id, file_id), appliances(id, isp, city, health, load)`,
    stores:[['members, plans, billing', 'Relational', 'Money and entitlements'], ['viewing history', 'Cassandra', 'Huge write volume, per-profile reads'], ['home rows', 'EVCache (precomputed offline)', 'Fast home page'], ['encoded files', 'Cloud storage origin + cache appliances in ISPs', 'Bytes served from inside the ISP']]},
  hld:{
    think:`<p>The control plane (home page, playback decisions, history) runs in the cloud across regions. The data plane (video bytes) runs on cache appliances inside ISPs, filled overnight from the origin.</p>`,
    diagram:{n:[['tv', 'client', 'TV / phone', '', 0, 1], ['gw', 'lb', 'API gateway', '', 1, 0], ['oca', 'cdn', 'ISP caches', 'Open Connect', 1, 2], ['home', 'service', 'Home rows', 'personalised', 2, 0], ['play', 'service', 'Playback', 'steering + DRM', 2, 1], ['origin', 'db', 'Origin storage', 'all encodes', 2, 2], ['evc', 'cache', 'Precomputed rows', 'EVCache', 3, 0], ['map', 'db', 'Content map', 'who has what', 3, 2], ['recs', 'service', 'Rec pipelines', 'offline ML', 4, 0], ['hist', 'db', 'Viewing history', 'Cassandra', 4, 1]],
      e:'tv>gw tv>oca gw>home home>evc gw>play play>map play>hist origin>oca recs>evc hist>recs',
      f:[['Night: popular files for each region are copied from origin into ISP caches off-peak.', 'origin>oca:fill tomorrow’s popular files'], ['Home: rows were precomputed offline; the API reads them from cache.', 'tv>gw:GET home (profile Asha)|gw>home|home>evc:rows for Asha'], ['Play: check entitlement, choose nearby caches holding the files, return URLs + licence; bytes come from the ISP cache.', 'tv>gw:play title 8812|gw>play|play>map:caches near this ISP|tv>oca:stream segments'], ['Progress: heartbeats update history, which feeds the next recommendations.', 'tv>gw:heartbeat 42:10|gw>play|play>hist:continue watching|hist>recs|recs>evc:new rows']]},
    walk:['Overnight, a fill job copies each region’s predicted popular files into its ISP caches.', 'The TV loads the home page: rows were computed by offline pipelines and are read from cache in milliseconds.', 'Pressing play: the playback service checks the plan and region, ranks healthy caches near the client’s ISP that hold the needed files, and returns a manifest plus licence URL.', 'The player streams from the ISP cache, adapting bitrate; heartbeats update viewing history.']},
  deep:[
    {t:'Pre-positioning instead of caching on demand',
      think:`<p>Netflix built its own CDN, <b>Open Connect</b>, and places appliances inside ISP networks and at exchange points. Because the catalogue is small and demand predictable, appliances are <b>filled during off-peak hours</b> with the files expected to be popular, rather than filling on a cache miss at 9 p.m. The playback service “steers” each client to appliances that have the file and are healthy. This course’s Netflix case models it: in the default scenario 92% of traffic is served inside the ISP.</p>`},
    {t:'Encoding: per-title, then per-shot',
      think:`<p>A fixed bitrate ladder wastes bits on simple content (animation) and starves complex content (sports, grain). Netflix described <b>per-title encoding</b> in 2015 and later per-shot optimisation: choose bitrates per title (or scene) to hit a quality target. Encoding is done once per title in many profiles; the bandwidth saved on every stream pays for it. In this course’s model, an animated title reaches the target quality at ~1.8 Mbps instead of a fixed 5.8 Mbps rung.</p>`},
    {t:'Resilience: regions, chaos and fallbacks',
      think:`<p>Netflix has written about running <b>active-active across AWS regions</b> and being able to evacuate a region, and about <b>Chaos Monkey</b>, which randomly terminates instances in production so failures are routine. Every dependency of the home page has a fallback: if personalisation is down, show popular rows; if artwork personalisation fails, show the default image. Members get a slightly worse page instead of an error.</p>`}],
  bottlenecks:{
    think:`<p>The predictable peak is handled by pre-filling; the unpredictable ones are new hits and failures.</p>`,
    rows:[['A surprise hit', 'Cache misses for a title not pre-filled', 'Fill on demand from nearby appliances; adjust predictions hourly'], ['Big release night', 'Everyone requests the same files', 'Pre-fill before launch; extra capacity at exchanges'], ['Personalisation down', 'Home page errors', 'Fallback to cached popular rows'], ['DRM licence service', 'Playback can’t start', 'Multi-region, highly available; cache licences per session'], ['Heartbeat volume', 'Event pipeline lag', 'Batch on device; partitioned log']]},
  tradeoffs:{
    think:`<p>Netflix trades large upfront investments (own CDN, heavy encoding, offline ML) for cheap, reliable evenings.</p>`,
    rows:[['CDN', 'Own appliances inside ISPs, pre-filled', 'Commercial CDN, fill on miss', 'Lower cost at huge scale and better quality; a big operational investment'], ['Home page', 'Precomputed offline', 'Computed per request', 'Fast and resilient; slightly stale'], ['Encoding', 'Many per-title profiles', 'One fixed ladder', 'Fewer bits per stream; more storage and compute'], ['Regions', 'Active-active', 'Active-passive', 'Can evacuate a region; data must replicate both ways']],
    more:['Live events (no pre-fill: live encode and a cache tree)', 'Downloads with offline DRM', 'Artwork personalisation experiments', 'Quality-of-experience dashboards per ISP'],
    followups:[['How do you make playback start fast?', 'Short first segments at a modest bitrate, manifests and licences fetched while the user browses the title page, and steering to a nearby healthy cache. Then ramp up quality as the buffer fills.'], ['How would live events change this?', 'Pre-filling no longer works. You need real-time encoding, a cache hierarchy that pulls from the origin once and fans out, and capacity planning for a single huge spike.'], ['How is this different from YouTube?', 'YouTube has a huge, unpredictable, user-uploaded catalogue, so it caches on demand and runs a giant upload pipeline. Netflix has a small curated catalogue with predictable demand, so it pre-positions files and precomputes the home page.']],
    traps:['Copying the YouTube answer without using the small catalogue', 'No fallback when recommendations fail', 'Forgetting DRM licensing on the playback path', 'Treating regions as backups instead of serving both']},
  refs:['case:netflix', 'case:youtube', 'case:hotstar', 'l:cdn', 'l:live-streaming-abr', 'l:chaos-engineering', 'l:multi-az-region', 'l:bulkhead-fallback']});

/* ------------------------------------------------------------------ */
S({id:'google-search', level:'advanced', icon:'🔎', title:'Google Search', tags:['crawling', 'inverted index', 'tail latency'],
  tagline:'Crawl the web, index it, and answer any query from every index shard in a couple of hundred milliseconds.',
  prompt:'Design a web search engine like Google Search.',
  focus:'how the index is partitioned, how a query fans out and stays fast at the tail, and two-stage ranking.',
  clarify:{
    think:`<p>Search is three systems: <b>crawling</b>, <b>indexing</b> and <b>serving</b>. In 45 minutes I can’t do all three deeply, so I’ll sketch crawling and indexing and spend most of the time on serving, which is what users feel. Google’s “How Search works” pages say the index covers hundreds of billions of pages.</p>`,
    ask:[['Pages to index?', 'Tens of billions (illustrative: 50B)'], ['Queries per day?', 'Billions'], ['Latency?', 'Results in ~200 ms'], ['Freshness?', 'News within minutes; most pages within days'], ['Personalisation, ads, images?', 'Out of scope'], ['Languages?', 'Many; tokenisation per language']],
    fr:['Crawl and recrawl the web politely', 'Build and update an inverted index', 'Answer keyword queries with ranked results and snippets', 'Spelling suggestions (brief)'],
    nfr:['p99 latency in a few hundred ms', 'Very high availability (partial results beat errors)', 'Fresh results for news', 'Resistant to spam'],
    out:['ads', 'image / video search', 'personalisation']},
  estimate:{
    think:`<p>The number that shapes serving is <b>how many shards each query must touch</b>; the one that shapes crawling is <b>pages per second</b>.</p>`,
    assume:['~10M documents per index shard', 'peak ≈ 2× average', '~100 KB per fetched page'],
    inputs:[['pages', 'Pages indexed', 5e10, [1e9, 1e10, 5e10, 1e11]], ['qpd', 'Queries per day', 8e9, [1e9, 5e9, 8e9]], ['days', 'Recrawl every', 10, [1, 10, 30], 'days'], ['txt', 'Text per page', 2e4, [1e4, 2e4, 5e4], 'B']],
    rows:[
      ['qps', 'Queries (peak)', v => v.qpd / 86400 * 2, '/s', 'per day ÷ 86,400 × 2'],
      ['shards', 'Index shards', v => ceil(v.pages / 1e7), 'shards', 'pages ÷ 10M'],
      ['crawl', 'Pages fetched', v => v.pages / (v.days * 86400), '/s', 'pages ÷ recrawl period'],
      ['cbw', 'Crawl bandwidth', (v, r) => r.crawl * 1e5 * 8, 'bps', 'fetches × 100 KB'],
      ['text', 'Text to index', v => v.pages * v.txt, 'B', 'pages × text size']],
    so:(r, f, v) => `Every query has to consult all ${f('shards')} (each holds a slice of the documents) within ~200 ms, at ${f('qps')}. That forces a <b>tree of aggregators</b>, many replicas of every shard, and caching of popular queries. Recrawling every ${v.days} days means fetching pages at ${f('crawl')} (${f('cbw')}) while staying polite to each website.`},
  api:{
    think:`<p>One public endpoint. Internally, each layer passes a query and a deadline down, and gets back top-k results.</p>`,
    rows:[['GET /search?q=&start=&hl=', 'Ranked results with titles, URLs, snippets', 'Cached for popular queries'], ['shard.search(query, k, deadline)', 'Top k doc ids + scores from one shard', 'Internal RPC'], ['docs.snippets(ids, query)', 'Titles and highlighted snippets', 'Internal RPC'], ['GET /complete?q=', 'Autocomplete suggestions', 'Separate service']]},
  data:{
    think:`<p>The heart is the <b>inverted index</b>: term → sorted list of documents containing it (with positions and per-term signals), heavily compressed. It is <b>partitioned by document</b>: each shard indexes a subset of pages, so each shard can answer a query on its own.</p>`,
    code:`-- Logical model (real systems use custom compressed files, not SQL)
-- posting list for one term, sorted by doc id, delta + varint encoded:
--   "monsoon" -> [(doc 1048, tf 3, pos [12, 88, 301]), (doc 1192, tf 1, pos [7]), …]
CREATE TABLE documents (            -- the doc store (Bigtable-style), keyed by URL
  url         text PRIMARY KEY,
  doc_id      bigint UNIQUE,
  fetched_at  timestamptz,
  content     bytea,                -- compressed page
  page_rank   real,                 -- static quality score
  simhash     bigint                -- near-duplicate detection
);
CREATE TABLE frontier (             -- URLs to crawl, prioritised, one queue per host
  host text, url text, priority real, next_fetch_at timestamptz,
  PRIMARY KEY (host, next_fetch_at, url)
);`,
    stores:[['inverted index shards', 'Custom files on local SSD, replicated', 'Read-only between updates; served from memory where possible'], ['documents', 'Wide-column store (Bigtable-style)', 'Snippets and re-indexing'], ['frontier', 'Distributed priority queues per host', 'Politeness and priorities'], ['query cache', 'In-memory at the front end', 'Popular queries repeat']]},
  hld:{
    think:`<p>Offline: crawler → indexer → shards. Online: front end → cache → root aggregator → every shard (in parallel) → merge → snippets.</p>`,
    diagram:{n:[['user', 'client', 'User', '', 0, 1], ['cache', 'cache', 'Result cache', 'popular queries', 1, 0], ['fe', 'lb', 'Front end', '', 1, 1], ['root', 'service', 'Root aggregator', 'merge top-k', 2, 1], ['docs', 'db', 'Doc store', 'snippets', 2, 2], ['s1', 'service', 'Index shard A', 'replicas ×N', 3, 0], ['s2', 'service', 'Index shard B', 'replicas ×N', 3, 1], ['s3', 'service', 'Index shard C', 'replicas ×N', 3, 2], ['ib', 'service', 'Indexer', 'postings + PageRank', 4, 1], ['cr', 'service', 'Crawler', 'frontier, polite', 4, 2], ['web', 'ext', 'The web', '', 4, 3]],
      e:'user>fe fe>cache fe>root root>s1 root>s2 root>s3 root>docs cr>web cr>ib ib>s1 ib>s2 ib>s3 ib>docs',
      f:[['Crawl: fetch pages politely and hand new or changed pages to the indexer.', 'cr>web:fetch (≤ 1 req/s per host)|cr>ib:new + changed pages'], ['Index: build posting lists per shard and store page text for snippets.', 'ib>s1:postings|ib>s2:postings|ib>s3:postings|ib>docs:page text'], ['Query: cache first; on a miss, ask every shard in parallel, merge, then fetch snippets for the winners.', 'user>fe:monsoon trek kerala|fe>cache:miss|fe>root|root>s1:top 10|root>s2:top 10|root>s3:top 10|root>docs:snippets for best 10']]},
    walk:['The front end normalises the query and checks the result cache.', 'On a miss, the root sends the query to one replica of every shard (via intermediate aggregators at real scale), with a deadline.', 'Each shard intersects posting lists, scores candidates cheaply, and returns its top results; aggregators merge them and the best few hundred are re-ranked with a more expensive model.', 'Snippets for the final 10 are generated from the doc store and the page is cached briefly.']},
  deep:[
    {t:'Partitioning the index',
      think:`<p><b>By term</b> (each shard owns some words): a query touches few shards, but multi-word queries must ship huge posting lists between machines, and popular terms create hot shards. <b>By document</b> (each shard owns some pages): every query touches every shard, but each does purely local work and returns a tiny top-k. Big web search engines use document partitioning; Google’s 2003 “Web Search for a Planet” paper describes index shards, each replicated many times, behind aggregators. Throughput comes from replicas; latency comes from parallelism.</p>`},
    {t:'Ranking in two stages',
      think:`<p>Scoring every matching document with an expensive model is impossible. Stage one is cheap: posting-list intersection with text relevance (BM25-style) plus <b>static quality</b> such as PageRank, the link-based score from Brin and Page’s 1998 paper. That narrows to a few hundred candidates per query. Stage two applies expensive signals and machine-learned models to only those.</p>`},
    {t:'Staying fast at the tail',
      think:`<p>With thousands of shards, the query is only as fast as the <b>slowest</b> one: if each shard has a 1% chance of a 1-second hiccup, almost every query hits one. Dean and Barroso’s “The Tail at Scale” describes the fixes: <b>hedged requests</b> (send a second copy to another replica if the first is slow), <b>deadlines with partial results</b> (answer without the stragglers; missing one shard rarely changes the top 10), and keeping shards small enough to answer quickly.</p>`}],
  bottlenecks:{
    think:`<p>Scale is solved with replicas; the subtle problems are the tail, freshness and spam.</p>`,
    rows:[['Slow shard replicas', 'p99 rises with shard count', 'Hedged requests; partial results after the deadline'], ['Rebuilding the whole index', 'Hours-old results', 'Incremental indexing (Google described this with Percolator / Caffeine); a fresh tier for news'], ['Crawler overloading a site', 'Complaints, blocks', 'Per-host queues and rate limits; robots.txt; adaptive back-off'], ['Duplicate and spam pages', 'Index bloat, bad results', 'Simhash near-duplicate detection; spam classifiers before indexing'], ['Popular query bursts', 'Same work repeated', 'Result cache with short TTLs']]},
  tradeoffs:{
    think:`<p>Search keeps choosing <b>good enough, fast</b> over perfect and slow.</p>`,
    rows:[['Index partitioning', 'By document', 'By term', 'Local work and simple merging; every query touches every shard'], ['Ranking', 'Cheap first stage + expensive re-rank', 'Expensive model on everything', 'Feasible latency; recall limited by stage one'], ['Completeness', 'Partial results after a deadline', 'Wait for every shard', 'Fast and available; rarely misses a result'], ['Freshness', 'Tiers by recrawl rate', 'Uniform recrawl', 'News fresh in minutes; crawl budget spent where it matters']],
    more:['Spelling correction from query logs', 'Query understanding (entities, intent)', 'Knowledge panels from a knowledge graph', 'Index tiers: a small high-quality tier searched first'],
    followups:[['How do you correct typos?', 'Generate candidate corrections by edit distance and from query logs (what people retyped after a failed query), score them with a language model of queries, and show “Did you mean” or search the correction directly when confidence is high.'], ['How do news results show up within minutes?', 'A separate fresh tier: news sites are crawled every few minutes and indexed incrementally into small, fast shards. The query searches both tiers and merges.'], ['How does autocomplete fit in?', 'It’s a separate service: a trie or prefix index over popular past queries, updated from query logs, with its own latency budget (tens of ms). See the typeahead case.']],
    traps:['A database LIKE query for search', 'Ignoring tail latency in the fan-out', 'An impolite crawler', 'Scoring every document with the expensive model']},
  refs:['case:google-search', 'case:web-crawler', 'case:typeahead', 'l:inverted-index', 'l:bm25-ranking', 'l:percentiles-tail-latency', 'pg:tail-latency']});
})();
