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
  focus:'the life of an order across three apps, when to assign a rider, and the dinner peak.',
  clarify:{
    think:`<p>Food delivery has three parties, and each one sees the same order differently. I scope it to browsing, ordering, the restaurant accepting, assigning a rider, and live tracking. I also want the shape of the dinner peak, because that is when everything breaks.</p>`,
    ask:[['Which parties are there?', 'Customers, restaurants and delivery riders, each with an app'], ['How many orders a day?', 'About 2 million, with a large share in a two-hour dinner window'], ['How many riders are online at peak?', 'About 300,000'], ['How often do riders send their location?', 'About every 4 seconds while on duty'], ['Do we own payments?', 'No, they go through a payment gateway'], ['Live tracking for customers?', 'Yes, the rider on a map with an arrival time (ETA)']],
    fr:['Search for nearby restaurants and menus', 'Place and pay for an order', 'The restaurant accepts and gives a prep time', 'Assign a rider, then pickup and delivery', 'Live tracking and an ETA'],
    nfr:['Placing an order never charges twice (it is idempotent)', 'A rider is assigned within seconds of the right moment', 'ETAs are accurate to within a few minutes', 'Survive the dinner peak'],
    out:['restaurant onboarding', 'ratings and reviews', 'grocery delivery']},
  estimate:{
    think:`<p>The daily average is misleading here. I size for the dinner window. I also separate the small, valuable stream of orders from the large, throwaway stream of locations.</p>`,
    assume:['The dinner window is 2 hours', 'About 8 search requests for each order (browsing)'],
    inputs:[['perDay', 'Orders per day', 2e6, [5e5, 2e6, 5e6]], ['share', 'Share of orders at dinner', 25, [15, 25, 35], '%'], ['riders', 'Riders online at peak', 3e5, [5e4, 1e5, 3e5, 5e5]], ['ping', 'Location ping every', 4, [2, 4, 10], 's']],
    rows:[
      ['avg', 'Orders (daily average)', v => v.perDay / 86400, '/s', 'per day ÷ 86,400'],
      ['po', 'Orders (dinner peak)', v => v.perDay * v.share / 100 / 7200, '/s', 'dinner share ÷ 7,200 s'],
      ['search', 'Searches at dinner peak', (v, r) => r.po * 8, '/s', 'orders × 8'],
      ['pings', 'Rider location writes', v => v.riders / v.ping, '/s', 'riders ÷ ping interval']],
    so:(r, f, v) => `Orders peak at ${f('po')}, which is ${(r.po / r.avg).toFixed(1)} times the daily average, so the dinner window sizes the system. Orders are few and precious, so they get transactions and a state machine. Rider locations are the heavy stream (${f('pings')}), and they matter for only seconds. So they go to an <b>in-memory geo index</b>, not the order database.`},
  api:{
    think:`<p>Each app gets the endpoints for its own role. All state changes go through the order service, so every party sees one consistent story.</p>`,
    rows:[['GET /v1/restaurants?lat=&lng=&q=', 'Nearby open restaurants', 'Cached for each map cell'], ['POST /v1/orders', 'Place an order {restaurant_id, items, address, payment}', 'Needs an Idempotency-Key'], ['POST /v1/orders/{id}/accept', 'The restaurant accepts {prep_minutes}', 'Or it rejects with a reason'], ['PUT /v1/riders/me/location', 'A batch of GPS points', 'Every few seconds'], ['POST /v1/offers/{id}/accept', 'A rider accepts a delivery', 'Times out after about 20 s'], ['GET /v1/orders/{id}/track (SSE)', 'Live status, rider position and ETA', 'Updates are limited in rate']]},
  data:{
    think:`<p>The order is a <b>state machine</b>, stored in a relational database. Locations live in Redis GEO (or a map of H3 cells) with a short expiry. Restaurants and menus are indexed for search by place and text.</p>`,
    code:`CREATE TABLE orders (
  id            text PRIMARY KEY,
  idem_key      text UNIQUE NOT NULL,
  customer_id   bigint NOT NULL,
  restaurant_id bigint NOT NULL,
  rider_id      bigint,
  status        text NOT NULL,   -- PLACED, ACCEPTED, READY, PICKED_UP, then DELIVERED or CANCELLED
  prep_minutes  int,
  total_minor   bigint NOT NULL,
  placed_at     timestamptz NOT NULL DEFAULT now(),
  version       int NOT NULL DEFAULT 0
);
-- Every step is a conditional update:  UPDATE orders SET status = 'PICKED_UP', version = version + 1
--                                      WHERE id = $1 AND status = 'READY' AND rider_id = $2;
-- Rider locations (Redis):             GEOADD riders:blr 77.59 12.97 rider:881   (with an expiry refreshed by heartbeats)`,
    stores:[['orders, payments', 'Postgres, partitioned by city', 'Transactions and strict states'], ['restaurants, menus', 'A search index (place and text) plus a cache', 'Read-heavy browsing'], ['rider locations', 'Redis GEO or H3 cells in memory', 'A high write rate, and short-lived'], ['order events', 'Kafka', 'Tell the apps, feed analytics and the ETA models']]},
  hld:{
    think:`<p>There are three clients and one order service. Dispatch is separate because it is computation-heavy. It reads live rider positions and decides who gets which order, and when.</p>`,
    diagram:{n:[['c', 'client', 'Customer app', '', 0, 0], ['r', 'client', 'Restaurant', 'tablet', 0, 1], ['rd', 'client', 'Rider app', '', 0, 2], ['gw', 'lb', 'API gateway', '', 1, 1], ['search', 'service', 'Search', 'restaurants, menus', 2, 0], ['es', 'db', 'Search index', 'geo + cuisine', 3, 0], ['ord', 'service', 'Order svc', 'state machine', 2, 1], ['odb', 'db', 'Orders DB', 'by city', 3, 1], ['disp', 'service', 'Dispatch', 'assign riders', 2, 2], ['loc', 'cache', 'Rider locations', 'Redis GEO', 3, 2], ['ev', 'queue', 'Order events', 'Kafka', 4, 1]],
      e:'c>gw r>gw rd>gw gw>search search>es gw>ord ord>odb ord>disp disp>loc gw>loc odb>ev',
      f:[['Browse: nearby open restaurants come from the index that searches by place and text.', 'c>gw:biryani near me|gw>search|search>es:within 6 km, open now'], ['Order: it is placed, then the restaurant accepts with a prep time.', 'c>gw:POST /orders|gw>ord|ord>odb:PLACED|r>gw:accept, 15 min|gw>ord|ord>odb:ACCEPTED'], ['Dispatch: shortly before the food is ready, pick a nearby rider and offer the job.', 'ord>disp:ready in ~6 min|disp>loc:riders within 3 km|disp>ord:offer to R-881'], ['Tracking: rider pings update the geo index, and status events go to every app.', 'rd>gw:location every 4 s|gw>loc:GEOADD|odb>ev:PICKED_UP']]},
    walk:['The customer orders. The order service stores PLACED and starts the payment.', 'The restaurant accepts with 15 minutes of prep, and the order becomes ACCEPTED.', 'Dispatch waits until about one travel time before the food is ready. Then it finds riders nearby, scores them by ETA and offers the job.', 'The rider picks up and delivers. Each status change is a conditional update plus an event that updates all three apps.']},
  deep:[
    {t:'One order, three apps: the state machine',
      think:`<p>Every party acts on the same order, often at the same moment, for example when the customer cancels just as the restaurant accepts. So every step is a <b>conditional update</b> from an expected state, and the loser of a race gets a clear error. Timers drive the unhappy paths. A restaurant that does not accept within about 3 minutes causes an automatic cancel and refund. A rider who does not accept an offer within 20 seconds triggers the next offer.</p>`},
    {t:'When and whom to assign',
      think:`<p>If a rider is assigned the moment the order is placed, they waste time waiting at the restaurant. Assigning <b>just in time</b> (prep time minus travel time) frees riders for other work. <b>Batching</b> two orders from the same area onto one rider saves more. In this course’s dinner-rush simulation, rider-minutes for each order fell from 19.7 (assign at once) to 17.0 (just in time) to 15.5 (just in time plus batching).</p>`,
      body:`<p>Scoring candidates uses the road ETA to the restaurant, the rider’s current load, and whether the new order is on the way for a rider who already carries one. Offers go to one rider at a time with a short timeout, so two riders never race for the same pickup.</p>`},
    {t:'ETAs customers can trust',
      think:`<p>The ETA is the sum of three uncertain parts. They are the <b>prep time</b> (learned for each restaurant, dish count and time of day), and the <b>rider-to-restaurant</b> and <b>restaurant-to-customer</b> travel times (a road graph plus live speeds). I would show a range and not a single number. I would update it as events arrive (accepted, picked up). An estimate that gets more accurate feels better than a precise one that turns out wrong.</p>`}],
  bottlenecks:{
    think:`<p>The dinner peak breaks the balance of the marketplace before it breaks any server.</p>`,
    rows:[['Not enough riders at peak', 'Offers time out, and ETAs climb', 'Widen the radius, batch more, add a surge delivery fee, and pause far-away restaurants'], ['The load of location writes', 'Redis CPU', 'Split the GEO sets by city or cell, and batch pings'], ['A restaurant tablet is offline', 'Orders are stuck in PLACED', 'Fall back to an automatic call, and pause restaurants that miss accepts'], ['Search spikes at 8 p.m.', 'Index latency', 'Cache results for each map cell for a minute'], ['The payment gateway is slow', 'Orders are stuck before PLACED', 'Retry with the same key, and keep a second gateway']]},
  tradeoffs:{
    think:`<p>Most decisions trade <b>rider efficiency</b> against <b>how long the customer waits</b>.</p>`,
    rows:[['When to assign', 'Just in time plus batching', 'Assign at order time', 'Fewer idle rider-minutes, and a risk of a late rider if prep is faster than predicted'], ['Locations', 'An in-memory geo index', 'A database with a spatial index', 'Handles the write rate, and positions are lost on a crash (rebuilt in seconds)'], ['Partitioning', 'By city', 'Global', 'Cities are independent, and features across cities need care'], ['ETA display', 'A range that is updated', 'One fixed number', 'Honest, and a little less satisfying at first']],
    more:['Demand forecasts for each zone, to place riders in advance', 'Kitchen display integration for accurate prep times', 'Fairness in rider earnings when assigning', 'Fraud checks on refunds'],
    followups:[['A rider rejects, or goes offline in the middle of a delivery. What happens?', 'Offers time out and move on to the next candidate. If a rider who is carrying food goes offline, their heartbeat expires and ops are alerted. The order is then reassigned or refunded, depending on its state.'], ['How do you show the rider moving on the customer’s map?', 'The tracking endpoint (SSE or WebSocket) subscribes to that order’s rider. Positions are snapped to roads and sent every few seconds. Clients fill in between points, so the icon moves smoothly.'], ['How do you avoid showing restaurants that just closed?', 'Restaurants publish open and paused events. The index updates within seconds, and the order service checks again when the order is placed.']],
    traps:['Designing only the customer app', 'Storing every GPS ping in the orders database', 'Assigning riders at order time without discussing idle time', 'No timeouts for restaurant accepts or rider offers']},
  refs:['case:zomato', 'case:uber', 'l:geospatial', 'pg:geo', 'l:websockets-at-scale', 'l:saga-outbox', 'l:event-driven']});

/* ------------------------------------------------------------------ */
S({id:'uber', level:'advanced', icon:'🚕', title:'Uber', tags:['geo index', 'matching', 'real-time'],
  tagline:'Match riders to nearby drivers in seconds while millions of drivers stream their location every few seconds.',
  prompt:'Design Uber: riders request trips and are matched with nearby drivers in real time.',
  focus:'the location index, matching (and avoiding assigning one driver twice), and surge pricing.',
  clarify:{
    think:`<p>The core loop is this. Drivers stream their locations, a rider requests a trip, we find nearby available drivers, make an offer, the driver accepts, and we track the trip. I confirm the scale and which extras matter, such as surge and shared rides. I leave payments as a later step.</p>`,
    ask:[['What is the scale?', 'Uber reports billions of trips a year. Assume about 25 million trips a day'], ['How many drivers are online at peak?', 'About 1.5 million worldwide'], ['How often do locations update?', 'About every 4 seconds'], ['How fast must matching be?', 'An offer within a few seconds'], ['Surge pricing?', 'Yes, for each area'], ['Shared rides?', 'Out of scope (mention it)']],
    fr:['Drivers go online and stream their location', 'Riders get a fare estimate and request a trip', 'Match and offer to a driver, who accepts or declines', 'The trip life cycle and live tracking', 'Surge pricing by area'],
    nfr:['Match within seconds', 'A driver is never assigned two trips', 'Location updates are absorbed without losing freshness', 'Cities keep working if another region fails'],
    out:['payments internals', 'shared rides', 'driver onboarding']},
  estimate:{
    think:`<p>Trips are a small number. The stream of locations is the big one, and it decides how the index must be built.</p>`,
    assume:['Peak is about 3 times the average', 'About 100 bytes for a location update'],
    inputs:[['trips', 'Trips per day', 2.5e7, [1e6, 5e6, 2.5e7]], ['drivers', 'Drivers online at peak', 1.5e6, [1e5, 5e5, 1.5e6, 3e6]], ['ping', 'Location update every', 4, [2, 4, 8], 's']],
    rows:[
      ['tavg', 'Trip requests (average)', v => v.trips / 86400, '/s', 'trips ÷ 86,400'],
      ['tpk', 'Trip requests (peak)', (v, r) => r.tavg * 3, '/s', '3 × average'],
      ['pings', 'Location updates', v => v.drivers / v.ping, '/s', 'drivers ÷ interval'],
      ['bw', 'Location ingest bandwidth', (v, r) => r.pings * 100 * 8, 'bps', 'updates × 100 B']],
    so:(r, f) => `Trip requests are small (${f('tpk')} at peak), but the location stream is ${f('pings')} (${f('bw')}). Each update overwrites the last one, so it belongs in an <b>in-memory index split by geography</b>. A match query must touch only the few cells around the pickup point.`},
  api:{
    think:`<p>Drivers and riders hold persistent connections, because offers and tracking are pushed to them. Requests that change the state of a trip go through the trip service with idempotency keys.</p>`,
    rows:[['WS driver → location {lat, lng, heading, ts}', 'Every few seconds', 'Batched when the connection is poor'], ['POST /v1/estimates', 'Fare, surge and pickup ETA for {pickup, dropoff, product}', 'The estimate is locked for a few minutes'], ['POST /v1/trips', 'Request a trip with an estimate id', 'Needs an Idempotency-Key'], ['WS offer → driver, then POST /v1/offers/{id}/accept', 'An offer with a timeout of about 15 s', 'The first valid accept wins'], ['GET /v1/trips/{id} (updates over WS)', 'Status, driver position and ETA', '']]},
  data:{
    think:`<p>Trips are durable and transactional. Driver positions are an in-memory map from <b>cell</b> to drivers. Uber open-sourced <b>H3</b>, a grid of hexagons, for this kind of indexing. A hexagon’s neighbours are all the same distance away, which makes “all cells within k rings” simple.</p>`,
    code:`CREATE TABLE trips (
  id          text PRIMARY KEY,
  rider_id    bigint NOT NULL,
  driver_id   bigint,
  status      text NOT NULL,     -- REQUESTED, OFFERED, ACCEPTED, ARRIVED, ON_TRIP, then COMPLETED or CANCELLED
  pickup      point NOT NULL, dropoff point NOT NULL,
  fare_minor  bigint, surge numeric(3,2),
  city        text NOT NULL,     -- the partition key
  version     int NOT NULL DEFAULT 0
);
CREATE TABLE drivers (
  id bigint PRIMARY KEY, status text NOT NULL,    -- OFFLINE, AVAILABLE, OFFERED or ON_TRIP
  current_trip text, offer_expires_at timestamptz
);
-- The location index (in memory, one shard for each city): h3_cell(res 9) -> {driver_id: (lat, lng, ts)}`,
    stores:[['trips, drivers', 'Relational, partitioned by city', 'State changes with conditional updates'], ['location index', 'In memory, split by cell or city', 'Overwritten every few seconds'], ['location stream', 'Kafka', 'Feeds the index, ETA models, surge and history'], ['trip traces', 'Object storage or a columnar store', 'Fare disputes and analytics']]},
  hld:{
    think:`<p>Locations flow through a log into the geo index. The trip service owns the state. Matching reads the index, asks the routing engine for real road ETAs, and offers the trip. Pricing works out surge for each cell from demand and supply.</p>`,
    diagram:{n:[['rider', 'client', 'Rider app', '', 0, 0], ['driver', 'client', 'Driver app', '', 0, 2], ['gw', 'lb', 'Gateway', 'WebSockets', 1, 1], ['trip', 'service', 'Trip svc', 'state machine', 2, 0], ['tdb', 'db', 'Trips DB', 'by city', 3, 0], ['match', 'service', 'Matching', 'ETA scoring', 2, 1], ['price', 'service', 'Pricing', 'surge per cell', 2, 2], ['loc', 'cache', 'Geo index', 'H3 cells', 3, 1], ['k', 'queue', 'Locations', 'Kafka stream', 3, 2], ['map', 'ext', 'Routing engine', 'road ETAs', 4, 0]],
      e:'rider>gw driver>gw gw>trip gw>price gw>k trip>tdb trip>match match>loc match>map k>loc price>loc',
      f:[['Location: drivers stream positions, and the index keeps the latest one in each cell.', 'driver>gw:lat/lng every 4 s|gw>k|k>loc:update cell 8961…'], ['Request: get an estimate with surge for the pickup cell, then create the trip.', 'rider>gw:request from MG Road|gw>price:fare, surge 1.3×|price>loc:demand vs supply|gw>trip|trip>tdb:REQUESTED'], ['Match: take candidates from nearby cells and rank them by road ETA. The best driver gets an offer.', 'trip>match|match>loc:available within 2 rings|match>map:ETAs for 12 drivers|trip>tdb:OFFERED to D-31|gw>driver:offer (15 s)']]},
    walk:['Drivers’ apps send their positions about every 4 s. The stream updates the in-memory index for their city.', 'A rider asks for an estimate. Pricing compares demand with available drivers in the pickup cell and its neighbours.', 'When the rider requests a trip, matching gathers the available drivers in nearby rings, gets road ETAs and picks the best one.', 'The driver is moved from AVAILABLE to OFFERED in one atomic step, and the offer is pushed. When the driver accepts, the trip becomes ACCEPTED and both apps start live tracking.']},
  deep:[
    {t:'The location index',
      think:`<p>A database spatial index cannot absorb hundreds of thousands of writes a second that are overwritten seconds later. So I split the map into <b>cells</b> (geohash squares, a quadtree, or H3 hexagons), keep a map from cell to drivers in memory, and shard it by city or by range of cells. A query for a pickup point finds its cell, takes the k rings around it, and filters by availability and freshness. Entries older than about 30 seconds are ignored, so a driver who loses signal drops out automatically. If an index node dies, it rebuilds from the stream in seconds.</p>`},
    {t:'Matching without assigning a driver twice',
      think:`<p>Nearest-first <b>greedy</b> matching is simple, but it can be wasteful when several requests arrive together. <b>Batched</b> matching collects requests for a second or two, and then solves an assignment problem across all of them. In this course’s simulation, batched matching was never worse than greedy and saved about 5.6% of pickup distance on average. Either way, use <b>road ETA</b> and not straight-line distance, because a river may be in the way.</p>`,
      body:`<p>To stop two trips from grabbing the same driver, the offer is a conditional update on the driver row: <code>UPDATE drivers SET status = 'OFFERED' … WHERE id = $1 AND status = 'AVAILABLE'</code>. Only one succeeds. The offer has an expiry, so a driver who ignores it becomes available again.</p>`},
    {t:'Surge pricing',
      think:`<p>For each cell and its neighbours, compare the open requests with the available drivers over a short window. Above a threshold, the price multiplier rises. That cuts demand and pulls in drivers from nearby cells. Smooth it over time and across neighbouring cells, and put a cap on it. <b>Lock the quoted price</b> for a few minutes, so the rider pays what they saw.</p>`}],
  bottlenecks:{
    think:`<p>Geography creates hot spots. Everyone leaves the stadium at the same time.</p>`,
    rows:[['A surge at a stadium or airport', 'One cell shard is overloaded', 'Use finer cells there, add replicas, and batch the matching'], ['The location stream spikes', 'The index falls behind', 'Partition the log by city or cell, and drop stale updates'], ['Two offers race for one driver', 'Two trips on one driver', 'Use a conditional update on the driver’s status'], ['The routing engine is slow', 'Matching latency rises', 'Cache ETAs between cells, and fall back to estimates from distance'], ['A region goes down', 'Cities are offline', 'Deploy for each region, copy trip state, and let drivers reconnect elsewhere']]},
  tradeoffs:{
    think:`<p>For locations, freshness and speed beat durability. For trips and money, strict correctness wins.</p>`,
    rows:[['Index', 'In-memory cells (H3)', 'A database spatial index', 'Absorbs the write rate, and is rebuilt from the stream on a failure'], ['Matching', 'Short batches', 'Greedy nearest-first', 'A better assignment overall, and it adds a second or two'], ['Offers', 'One driver at a time', 'Broadcast to many', 'No double accepts, and slower if drivers decline'], ['Partitioning', 'By city or region', 'Global', 'Isolation and locality, and trips that cross regions need care']],
    more:['Shared rides (adding stops to a route)', 'Moving idle drivers to where demand will be', 'Fraud and safety checks', 'Trip receipts built from stored GPS traces'],
    followups:[['How do you compute an ETA?', 'Route on a road graph with live and past speeds for each segment. Then apply a learned correction for pickups (finding the rider and traffic lights). Cache cell-to-cell ETAs for matching, and compute exact routes only for the chosen driver.'], ['The matching service crashes after making an offer. What happens?', 'The trip and driver rows hold the state. The offer has an expiry, so if no accept arrives, the driver goes back to AVAILABLE and another matcher instance retries the trip. Every step is safe to repeat, using the trip id.'], ['How do you scale to 10,000 cities?', 'Cities are mostly independent, so shard everything (index, trips and matching) by city or region. Only accounts, payments and analytics are global.']],
    traps:['Storing each GPS update in the trips database', 'Straight-line distance for matching', 'No guard against assigning one driver twice', 'Ignoring stale locations']},
  refs:['case:uber', 'case:google-maps', 'l:geospatial', 'pg:geo', 'l:distributed-locks', 'l:websockets-at-scale', 'l:kafka']});

/* ------------------------------------------------------------------ */
S({id:'youtube', level:'advanced', icon:'▶️', title:'YouTube', tags:['transcoding', 'CDN', 'ABR'],
  tagline:'Hundreds of hours uploaded every minute, a billion hours watched every day: a transcoding factory feeding the biggest CDN problem there is.',
  prompt:'Design YouTube: creators upload videos, and viewers anywhere stream them.',
  focus:'the upload and transcoding pipeline, adaptive streaming, and serving the traffic from a CDN.',
  clarify:{
    think:`<p>There are two very different halves: an <b>ingest pipeline</b> (upload, transcode, publish) and a <b>delivery system</b> (metadata, and video segments through a CDN). I anchor the scale on public numbers. YouTube has said that more than 500 hours of video are uploaded every minute. In 2017 it said that people watch over a billion hours a day.</p>`,
    ask:[['How much is uploaded?', 'About 500 hours of video a minute'], ['How much is watched?', 'About 1 billion hours a day'], ['How long and how big can a video be?', 'Hours long, and tens of GB'], ['Which devices?', 'Phones, TVs and browsers, on all kinds of networks'], ['Live streaming?', 'Out of scope (mention it)'], ['Comments, likes and recommendations?', 'Mention them, and focus on video']],
    fr:['Upload (with resume) and process videos', 'Watch with adaptive quality', 'View counts and likes', 'Search and recommendations (briefly)'],
    nfr:['Playback starts in about 1 to 2 s, and rarely stalls', 'Uploads survive network drops', 'Videos are available minutes after upload', 'Huge outgoing traffic (egress) at a reasonable cost'],
    out:['live streaming', 'monetisation', 'the internals of Content ID']},
  estimate:{
    think:`<p>Egress decides the architecture, and storage decides the cost. Both come from the two public numbers.</p>`,
    assume:['All renditions together are about 8 Mbps for each second of source video (an illustrative ladder)', 'The average watch bitrate is an input'],
    inputs:[['hpm', 'Hours uploaded per minute', 500, [100, 500, 1000], 'h'], ['watch', 'Hours watched per day', 1e9, [1e8, 5e8, 1e9, 2e9], 'h'], ['br', 'Average streaming bitrate', 2.5e6, [1e6, 2.5e6, 5e6], 'bps']],
    rows:[
      ['upDay', 'Hours uploaded per day', v => v.hpm * 1440, 'h', 'per minute × 1,440'],
      ['store', 'New storage per day', (v, r) => r.upDay * 3600 * 1e6, 'B/day', 'hours × 3,600 s × 8 Mbps ÷ 8'],
      ['egress', 'Average egress', v => v.watch * 3600 * v.br / 86400, 'bps', 'watch-seconds × bitrate ÷ 86,400'],
      ['viewers', 'Average concurrent viewers', v => v.watch / 24, 'n', 'hours per day ÷ 24']],
    so:(r, f) => `An egress of ${f('egress')} on average (${f('viewers')} people watching at any moment) cannot come from a few data centres. It must be served by <b>CDN caches deep inside ISPs</b>. Storage grows by ${f('store')}. Popularity is very uneven, so most videos are rarely watched. Keep fewer renditions of cold videos, and move them to cheaper storage.`},
  api:{
    think:`<p>Uploads are sessions that can resume. Playback has two steps. First, get the metadata and a manifest URL from the API. Then the player pulls segments from the CDN directly.</p>`,
    rows:[['POST /v1/videos', 'Create {title, description, visibility} → {video_id, upload_url}', 'A resumable upload session'], ['PUT {upload_url} (Content-Range)', 'Upload chunks, and resume from the last byte', 'Survives network drops'], ['GET /v1/videos/{id}', 'Metadata and the manifest URL', 'Status: PROCESSING or READY'], ['GET {cdn}/v/{id}/master.m3u8', 'The HLS or DASH manifest, then renditions, then segments', 'Cacheable'], ['POST /v1/events', 'Batched watch events', 'Views, quality and stalls']]},
  data:{
    think:`<p>Metadata is relational but huge, so it is sharded. YouTube created <b>Vitess</b> to shard MySQL. Video segments are blobs addressed by video, rendition and segment number. View counts come from event pipelines, not from updating a row.</p>`,
    code:`CREATE TABLE videos (
  id          text PRIMARY KEY,
  channel_id  bigint NOT NULL,          -- the shard key (Vitess-style)
  title       text NOT NULL,
  status      text NOT NULL,            -- UPLOADING, PROCESSING, READY or BLOCKED
  duration_s  int,
  created_at  timestamptz NOT NULL
);
CREATE TABLE renditions (
  video_id text, profile text,          -- 'h264_360p', 'vp9_1080p', 'av1_2160p' and so on
  bitrate_kbps int, manifest_key text,
  PRIMARY KEY (video_id, profile)
);
-- Segments live in blob storage:  v/{video_id}/{profile}/{segment_no}.m4s`,
    stores:[['videos, channels, renditions', 'Sharded MySQL (Vitess)', 'Relational metadata at scale'], ['source files and segments', 'Blob storage, in hot and cold tiers', 'Petabytes a day'], ['view and watch events', 'A log, then stream processing', 'Counts, quality and recommendations'], ['search', 'An inverted index over titles and captions', 'Discovery']]},
  hld:{
    think:`<p>The left half is a pipeline driven by a job queue. The right half is read-only and CDN-heavy. They meet at the metadata database and the segment store.</p>`,
    diagram:{n:[['up', 'client', 'Creator', '', 0, 0], ['vw', 'client', 'Viewer', '', 0, 2], ['upl', 'service', 'Upload svc', 'resumable', 1, 0], ['api', 'service', 'Watch API', 'metadata', 1, 2], ['raw', 'db', 'Raw uploads', '', 2, 0], ['meta', 'db', 'Metadata DB', 'sharded MySQL', 2, 1], ['cdn', 'cdn', 'CDN / ISP caches', '', 2, 2], ['tq', 'queue', 'Job queue', 'transcode', 3, 0], ['tw', 'service', 'Transcoders', 'chunks in parallel', 4, 0], ['seg', 'db', 'Segment store', 'all renditions', 4, 1]],
      e:'up>upl upl>raw upl>meta raw>tq tq>tw tw>seg tw>meta vw>api api>meta vw>cdn~-0.3 cdn>seg',
      f:[['Upload: chunks that can resume land in raw storage, and the video is PROCESSING.', 'up>upl:resumable upload|upl>raw:source file|upl>meta:PROCESSING|raw>tq:transcode job'], ['Transcode: split into chunks, encode every rendition in parallel, and write the segments and manifests.', 'tq>tw:job (60 chunks)|tw>seg:240p … 4K segments|tw>meta:READY'], ['Watch: the metadata comes from the API, and the manifest and segments come from the nearest cache. The player adapts the quality.', 'vw>api:GET video|api>meta|vw>cdn:manifest + segments|cdn>seg:miss → fill']]},
    walk:['The creator’s client uploads in chunks to a session that can resume. The source lands in raw storage.', 'A job splits the source into short pieces at keyframes. Hundreds of workers encode each piece into every rendition in parallel. A final step writes the manifests and marks the video READY.', 'A viewer opens the video. The API returns the metadata and a manifest URL on the CDN.', 'The player downloads a few seconds at a time, and picks the bitrate from the measured speed and how full its buffer is. The CDN fills any misses from the segment store.']},
  deep:[
    {t:'The transcoding pipeline',
      think:`<p>Encoding a two-hour 4K video on one machine takes hours. So the source is <b>split into chunks</b> at keyframe boundaries, encoded in parallel, and then stitched together. Each source becomes a <b>ladder</b> of renditions (240p up to 4K) in several codecs. H.264 gives compatibility, and VP9 and AV1 give smaller files at the same quality. Expensive codecs can be applied first to videos that become popular, where the bandwidth saved pays for the CPU.</p>`,
      body:`<p>The pipeline is a graph of tasks: validate, split, encode × N, stitch, thumbnails, captions and publish. Each task is retried on its own, so one failed chunk does not restart the whole job.</p>`},
    {t:'Adaptive streaming and the CDN',
      think:`<p>Segments are a few seconds long and are listed in an HLS or DASH manifest for each rendition. The player picks the quality of each next segment from the measured speed and how full its buffer is, so it drops the quality instead of stalling. Delivery relies on caches <b>inside ISPs</b>, and Google runs Google Global Cache machines in ISP networks. Popular videos are cached at the edge. The long tail is served from regional caches or the origin.</p>`},
    {t:'View counts and recommendations',
      think:`<p>Updating a counter row for every view would melt on a viral video. Views are <b>events</b> in a log, and stream jobs filter out bots and duplicates and then add them up. The count shown can lag and be corrected later. Recommendations follow the two-stage design YouTube published in 2016. <b>Candidate generation</b> narrows billions of videos to hundreds, and then a <b>ranking</b> model orders them for this viewer.</p>`}],
  bottlenecks:{
    think:`<p>Uneven popularity helps caching and hurts everything else.</p>`,
    rows:[['A video goes viral', 'Cache misses at many edges at once', 'Warm the edges once growth is detected, and merge requests at the caches'], ['Upload spikes', 'The transcode queue grows', 'Autoscale the workers, and put short videos and popular channels first'], ['The cost of long-tail storage', 'Petabytes of renditions that are rarely watched', 'Use a cold tier, drop the high renditions of cold videos, and re-encode them on demand'], ['Hot metadata rows', 'Counters and popular videos', 'Use event-based counts, and cache video metadata'], ['Slow networks', 'Stalls', 'Offer low-bitrate renditions and short first segments']]},
  tradeoffs:{
    think:`<p>Most of the trade-offs are <b>compute and storage spent to save bandwidth</b>.</p>`,
    rows:[['Renditions', 'Encode the main ladder at upload', 'On demand', 'Instant playback at any quality, and storage for videos nobody watches'], ['Codecs', 'H.264, plus VP9 or AV1 for popular videos', 'H.264 only', 'Smaller files where it matters, and far more encoding CPU'], ['Delivery', 'Caches inside ISPs', 'Central data centres', 'Lower cost and delay, and a huge fleet spread everywhere'], ['Counts', 'Event-based, approximate first', 'Exact counters', 'Scales, and the numbers lag and get corrected']],
    more:['Live streaming (real-time transcoding and low-latency HLS)', 'Detecting duplicates and copyright by fingerprint', 'Captions from speech recognition', 'Using each region’s popularity to place content in advance'],
    followups:[['How would you add live streaming?', 'Take in the stream (RTMP or SRT) at the nearest point, transcode it in real time into a smaller ladder, publish short segments with low-latency HLS or DASH, and fan out through the same CDN. The pipeline must run faster than real time, and it cannot retry slowly.'], ['How do you avoid storing the same video twice?', 'Fingerprint the uploads: exact hashes for identical files, and perceptual fingerprints for re-encodes. For exact duplicates, point the new video at the renditions that already exist.'], ['Why split videos into chunks for transcoding?', 'Parallel work turns hours into minutes, a failed chunk retries on its own, and the workers stay small and alike.']],
    traps:['Serving video from application servers', 'Transcoding on the upload server, and making the user wait', 'One fixed bitrate for every viewer', 'Counting views with a database increment']},
  refs:['case:youtube', 'case:netflix', 'l:transcoding-pipeline', 'l:live-streaming-abr', 'l:cdn', 'l:recommendations', 'l:storage-types']});

/* ------------------------------------------------------------------ */
S({id:'netflix', level:'advanced', icon:'🎬', title:'Netflix', tags:['Open Connect', 'personalisation', 'resilience'],
  tagline:'A small, curated catalogue watched by hundreds of millions in the same evening hours: put the bytes in place early, precompute the home page, and expect failures.',
  prompt:'Design Netflix: a subscription service streaming films and series to hundreds of millions of members.',
  focus:'how this differs from YouTube (catalogue size and predictability), the CDN strategy, personalisation and resilience.',
  clarify:{
    think:`<p>On the surface it is “YouTube again”, but the constraints are the opposite. The catalogue is <b>small and curated</b>, and uploads are not a feature for users. Demand is <b>predictable</b>, with evenings and new releases. That changes the CDN strategy completely, so I confirm those properties first.</p>`,
    ask:[['How big is the catalogue?', 'Thousands to tens of thousands of titles'], ['How many members?', 'Hundreds of millions'], ['How many streams at once at peak?', 'About 30 million in the busiest hour (illustrative)'], ['Which devices?', 'Mostly TVs, plus phones and browsers'], ['A personalised home page?', 'Yes: rows and artwork for each profile'], ['Downloads, live events and games?', 'Out of scope (mention live)']],
    fr:['Browse a personalised home page', 'Play with adaptive quality and DRM (copy protection)', 'Continue watching across devices', 'Profiles and parental controls'],
    nfr:['Playback starts in about 1 to 2 s, with almost no stalls', 'The peak egress is served at a low cost', 'The home page loads fast even if recommendation services fail', 'Survive the loss of a cloud region'],
    out:['studio and content-production tools', 'billing internals', 'games']},
  estimate:{
    think:`<p>The peak egress is the problem, and the size of the catalogue is the opportunity. If the whole popular catalogue fits in a cache machine, you can copy it there ahead of time.</p>`,
    assume:['About 100 Gbps for each cache machine (illustrative)', 'The stored bytes for a title include every codec, resolution and audio track'],
    inputs:[['streams', 'Peak concurrent streams', 3e7, [5e6, 1e7, 3e7, 5e7]], ['br', 'Average bitrate', 5e6, [3e6, 5e6, 8e6], 'bps'], ['titles', 'Titles in catalogue', 15000, [5000, 15000, 30000]], ['per', 'Stored bytes per title (all encodes)', 1e11, [5e10, 1e11, 3e11], 'B']],
    rows:[
      ['egress', 'Peak egress', v => v.streams * v.br, 'bps', 'streams × bitrate'],
      ['cat', 'Whole catalogue', v => v.titles * v.per, 'B', 'titles × bytes per title'],
      ['apps', 'Cache machines (minimum)', (v, r) => ceil(r.egress / 1e11), 'appliances', 'egress ÷ 100 Gbps']],
    so:(r, f) => `A peak egress of ${f('egress')} is the whole problem. The entire catalogue is only ${f('cat')}, and the popular part is much smaller. So the popular files can be <b>copied into caches inside ISPs every night</b>: fill them off-peak and serve at peak, instead of caching on demand. At about 100 Gbps each, that is at least ${f('apps')} machines before redundancy, spread over ISPs and cities.`},
  api:{
    think:`<p>The playback call is the important one. It checks entitlement, picks which nearby caches should serve this client, and returns the manifest and a DRM licence endpoint.</p>`,
    rows:[['GET /v1/home?profile=', 'Personalised rows (precomputed)', 'Falls back to popular rows'], ['GET /v1/titles/{id}', 'Details, episodes and artwork', 'Cached'], ['POST /v1/playback/{title}', 'A manifest with ranked cache URLs, and the licence URL', 'Checks the plan, region and device'], ['POST /v1/license', 'A DRM licence for the content keys', 'Widevine, PlayReady or FairPlay'], ['POST /v1/events', 'Heartbeats: position, bitrate and errors', 'For continue watching and quality monitoring']]},
  data:{
    think:`<p>Different data goes in different stores. Netflix has written publicly about using Cassandra for viewing history, and EVCache (a memcached-based cache) for precomputed data.</p>`,
    code:`-- Viewing history (Cassandra-style): one partition for each profile, newest first
CREATE TABLE viewing (
  profile_id bigint, title_id bigint, watched_at timestamp,
  position_s int, device text,
  PRIMARY KEY ((profile_id), watched_at, title_id)
) WITH CLUSTERING ORDER BY (watched_at DESC);

-- Precomputed home rows (cache): rows:{profile_id} -> [{row: "Because you watched…", titles: […]}]
-- Content map: which cache machine holds which encoded files
--   cache_files(appliance_id, file_id), appliances(id, isp, city, health, load)`,
    stores:[['members, plans, billing', 'Relational', 'Money and entitlements'], ['viewing history', 'Cassandra', 'A huge write volume, and reads for each profile'], ['home rows', 'EVCache (precomputed offline)', 'A fast home page'], ['encoded files', 'Cloud storage as the origin, and cache machines in ISPs', 'The bytes are served from inside the ISP']]},
  hld:{
    think:`<p>The control plane runs in the cloud across regions. It covers the home page, playback decisions and history. The data plane carries the video bytes, and it runs on cache machines inside ISPs that are filled overnight from the origin.</p>`,
    diagram:{n:[['tv', 'client', 'TV / phone', '', 0, 1], ['gw', 'lb', 'API gateway', '', 1, 0], ['oca', 'cdn', 'ISP caches', 'Open Connect', 1, 2], ['home', 'service', 'Home rows', 'personalised', 2, 0], ['play', 'service', 'Playback', 'steering + DRM', 2, 1], ['origin', 'db', 'Origin storage', 'all encodes', 2, 2], ['evc', 'cache', 'Precomputed rows', 'EVCache', 3, 0], ['map', 'db', 'Content map', 'who has what', 3, 2], ['recs', 'service', 'Rec pipelines', 'offline ML', 4, 0], ['hist', 'db', 'Viewing history', 'Cassandra', 4, 1]],
      e:'tv>gw tv>oca gw>home home>evc gw>play play>map play>hist origin>oca recs>evc hist>recs',
      f:[['Night: the popular files for each region are copied from the origin into ISP caches, off-peak.', 'origin>oca:fill tomorrow’s popular files'], ['Home: the rows were precomputed offline, and the API reads them from the cache.', 'tv>gw:GET home (profile Asha)|gw>home|home>evc:rows for Asha'], ['Play: check entitlement, choose nearby caches that hold the files, and return URLs and a licence. The bytes come from the ISP cache.', 'tv>gw:play title 8812|gw>play|play>map:caches near this ISP|tv>oca:stream segments'], ['Progress: heartbeats update the history, which feeds the next recommendations.', 'tv>gw:heartbeat 42:10|gw>play|play>hist:continue watching|hist>recs|recs>evc:new rows']]},
    walk:['Overnight, a fill job copies each region’s predicted popular files into its ISP caches.', 'The TV loads the home page. The rows were computed by offline pipelines, and are read from the cache in milliseconds.', 'When the member presses play, the playback service checks the plan and region. It ranks the healthy caches near the client’s ISP that hold the files, and returns a manifest and a licence URL.', 'The player streams from the ISP cache and adapts the bitrate. Heartbeats update the viewing history.']},
  deep:[
    {t:'Pre-positioning instead of caching on demand',
      think:`<p>Netflix built its own CDN, <b>Open Connect</b>, and places machines inside ISP networks and at internet exchange points. The catalogue is small and the demand is predictable, so the machines are <b>filled during off-peak hours</b> with the files expected to be popular. They are not filled on a cache miss at 9 p.m. The playback service “steers” each client to machines that have the file and are healthy. This course’s Netflix case models it: in the default scenario 92% of traffic is served inside the ISP.</p>`},
    {t:'Encoding: per title, then per shot',
      think:`<p>A fixed bitrate ladder wastes bits on simple content, such as animation, and starves complex content, such as sports and film grain. Netflix described <b>per-title encoding</b> in 2015, and later per-shot optimisation. They choose the bitrates for each title, or each scene, to reach a quality target. Encoding is done once for each title in many profiles, and the bandwidth saved on every stream pays for it. In this course’s model, an animated title reaches the target quality at about 1.8 Mbps instead of a fixed rung of 5.8 Mbps.</p>`},
    {t:'Resilience: regions, chaos and fallbacks',
      think:`<p>Netflix has written about running <b>active-active across AWS regions</b>, and about being able to move all traffic out of one region. It has also written about <b>Chaos Monkey</b>, which randomly terminates instances in production so that failures become routine. Every dependency of the home page has a fallback. If personalisation is down, show popular rows, and if artwork personalisation fails, show the default image. Members get a slightly worse page instead of an error.</p>`}],
  bottlenecks:{
    think:`<p>Pre-filling handles the predictable peak. The unpredictable ones are new hits and failures.</p>`,
    rows:[['A surprise hit', 'Cache misses for a title that was not pre-filled', 'Fill on demand from nearby machines, and adjust the predictions every hour'], ['A big release night', 'Everyone requests the same files', 'Pre-fill before launch, and add capacity at the exchanges'], ['Personalisation is down', 'Home page errors', 'Fall back to cached popular rows'], ['The DRM licence service', 'Playback cannot start', 'Run it in several regions with high availability, and cache licences for each session'], ['Heartbeat volume', 'The event pipeline falls behind', 'Batch on the device, and use a partitioned log']]},
  tradeoffs:{
    think:`<p>Netflix trades large investments up front (its own CDN, heavy encoding and offline machine learning) for cheap, reliable evenings.</p>`,
    rows:[['CDN', 'Its own machines inside ISPs, pre-filled', 'A commercial CDN that fills on a miss', 'Lower cost at huge scale and better quality, and a big operations effort'], ['Home page', 'Precomputed offline', 'Computed on each request', 'Fast and resilient, and slightly stale'], ['Encoding', 'Many profiles for each title', 'One fixed ladder', 'Fewer bits for each stream, and more storage and compute'], ['Regions', 'Active-active', 'Active-passive', 'A region can be evacuated, and data must be copied both ways']],
    more:['Live events (no pre-fill: live encoding and a tree of caches)', 'Downloads with offline DRM', 'Experiments with personalised artwork', 'Quality dashboards for each ISP'],
    followups:[['How do you make playback start fast?', 'Use short first segments at a modest bitrate. Fetch the manifest and licence while the member is still on the title page. Steer to a nearby healthy cache. Then raise the quality as the buffer fills.'], ['How would live events change this?', 'Pre-filling no longer works. You need real-time encoding, a tree of caches that pulls from the origin once and fans out, and capacity planning for one huge spike.'], ['How is this different from YouTube?', 'YouTube has a huge, unpredictable catalogue uploaded by users. So it caches on demand and runs a giant upload pipeline. Netflix has a small curated catalogue with predictable demand. So it places files early and precomputes the home page.']],
    traps:['Copying the YouTube answer without using the small catalogue', 'No fallback when recommendations fail', 'Forgetting DRM licensing on the playback path', 'Treating regions as backups instead of serving from both']},
  refs:['case:netflix', 'case:youtube', 'case:hotstar', 'l:cdn', 'l:live-streaming-abr', 'l:chaos-engineering', 'l:multi-az-region', 'l:bulkhead-fallback']});

/* ------------------------------------------------------------------ */
S({id:'google-search', level:'advanced', icon:'🔎', title:'Google Search', tags:['crawling', 'inverted index', 'tail latency'],
  tagline:'Crawl the web, index it, and answer any query from every index shard in a couple of hundred milliseconds.',
  prompt:'Design a web search engine like Google Search.',
  focus:'how the index is split, how a query fans out and stays fast at the tail, and two-stage ranking.',
  clarify:{
    think:`<p>Search is three systems: <b>crawling</b>, <b>indexing</b> and <b>serving</b>. In 45 minutes I cannot do all three in depth. So I sketch crawling and indexing, and spend most of the time on serving, which is what users feel. Google’s “How Search works” pages say the index covers hundreds of billions of pages.</p>`,
    ask:[['How many pages are indexed?', 'Tens of billions (illustrative: 50 billion)'], ['How many queries a day?', 'Billions'], ['What is the latency target?', 'Results in about 200 ms'], ['How fresh must results be?', 'News within minutes, and most pages within days'], ['Personalisation, ads and images?', 'Out of scope'], ['Which languages?', 'Many, with word splitting for each language']],
    fr:['Crawl and recrawl the web politely', 'Build and update an inverted index', 'Answer keyword queries with ranked results and snippets', 'Spelling suggestions (briefly)'],
    nfr:['p99 latency of a few hundred ms', 'Very high availability (partial results are better than errors)', 'Fresh results for news', 'Resistant to spam'],
    out:['ads', 'image and video search', 'personalisation']},
  estimate:{
    think:`<p>The number that shapes serving is <b>how many shards each query must touch</b>. The number that shapes crawling is <b>pages a second</b>.</p>`,
    assume:['About 10 million documents for each index shard', 'Peak is about 2 times the average', 'About 100 KB for each fetched page'],
    inputs:[['pages', 'Pages indexed', 5e10, [1e9, 1e10, 5e10, 1e11]], ['qpd', 'Queries per day', 8e9, [1e9, 5e9, 8e9]], ['days', 'Recrawl every', 10, [1, 10, 30], 'days'], ['txt', 'Text per page', 2e4, [1e4, 2e4, 5e4], 'B']],
    rows:[
      ['qps', 'Queries (peak)', v => v.qpd / 86400 * 2, '/s', 'per day ÷ 86,400 × 2'],
      ['shards', 'Index shards', v => ceil(v.pages / 1e7), 'shards', 'pages ÷ 10 million'],
      ['crawl', 'Pages fetched', v => v.pages / (v.days * 86400), '/s', 'pages ÷ recrawl period'],
      ['cbw', 'Crawl bandwidth', (v, r) => r.crawl * 1e5 * 8, 'bps', 'fetches × 100 KB'],
      ['text', 'Text to index', v => v.pages * v.txt, 'B', 'pages × text size']],
    so:(r, f, v) => `Every query has to consult all ${f('shards')} shards (each holds a slice of the documents) within about 200 ms, at ${f('qps')}. That forces a <b>tree of aggregators</b>, many replicas of every shard, and caching of popular queries. Recrawling every ${v.days} days means fetching pages at ${f('crawl')} (${f('cbw')}), while staying polite to each website.`},
  api:{
    think:`<p>There is one public endpoint. Inside, each layer passes a query and a deadline down, and gets back the top k results.</p>`,
    rows:[['GET /search?q=&start=&hl=', 'Ranked results with titles, URLs and snippets', 'Cached for popular queries'], ['shard.search(query, k, deadline)', 'The top k doc ids and scores from one shard', 'An internal RPC'], ['docs.snippets(ids, query)', 'Titles and highlighted snippets', 'An internal RPC'], ['GET /complete?q=', 'Autocomplete suggestions', 'A separate service']]},
  data:{
    think:`<p>The heart is the <b>inverted index</b>. For each word, it holds a sorted list of the documents that contain it, with positions and other signals, heavily compressed. It is <b>split by document</b>: each shard indexes a subset of pages, so each shard can answer a query on its own.</p>`,
    code:`-- A logical model (real systems use custom compressed files, not SQL)
-- the posting list for one word, sorted by doc id, stored as compressed differences:
--   "monsoon" -> [(doc 1048, tf 3, pos [12, 88, 301]), (doc 1192, tf 1, pos [7]), …]
CREATE TABLE documents (            -- the doc store (Bigtable-style), keyed by URL
  url         text PRIMARY KEY,
  doc_id      bigint UNIQUE,
  fetched_at  timestamptz,
  content     bytea,                -- the compressed page
  page_rank   real,                 -- a static quality score
  simhash     bigint                -- used to detect near-duplicates
);
CREATE TABLE frontier (             -- URLs to crawl, with priorities, one queue for each host
  host text, url text, priority real, next_fetch_at timestamptz,
  PRIMARY KEY (host, next_fetch_at, url)
);`,
    stores:[['inverted index shards', 'Custom files on local SSD, replicated', 'Read-only between updates, and served from memory where possible'], ['documents', 'A wide-column store (Bigtable-style)', 'Snippets and re-indexing'], ['frontier', 'Distributed priority queues for each host', 'Politeness and priorities'], ['query cache', 'In memory at the front end', 'Popular queries repeat']]},
  hld:{
    think:`<p>Offline: the crawler feeds the indexer, which feeds the shards. Online: the front end checks the cache, then asks the root aggregator, which asks every shard in parallel. Then the results are merged and the snippets are added.</p>`,
    diagram:{n:[['user', 'client', 'User', '', 0, 1], ['cache', 'cache', 'Result cache', 'popular queries', 1, 0], ['fe', 'lb', 'Front end', '', 1, 1], ['root', 'service', 'Root aggregator', 'merge top-k', 2, 1], ['docs', 'db', 'Doc store', 'snippets', 2, 2], ['s1', 'service', 'Index shard A', 'replicas ×N', 3, 0], ['s2', 'service', 'Index shard B', 'replicas ×N', 3, 1], ['s3', 'service', 'Index shard C', 'replicas ×N', 3, 2], ['ib', 'service', 'Indexer', 'postings + PageRank', 4, 1], ['cr', 'service', 'Crawler', 'frontier, polite', 4, 2], ['web', 'ext', 'The web', '', 4, 3]],
      e:'user>fe fe>cache fe>root root>s1 root>s2 root>s3 root>docs cr>web cr>ib ib>s1 ib>s2 ib>s3 ib>docs',
      f:[['Crawl: fetch pages politely, and hand new or changed pages to the indexer.', 'cr>web:fetch (≤ 1 req/s per host)|cr>ib:new + changed pages'], ['Index: build the posting lists for each shard, and store the page text for snippets.', 'ib>s1:postings|ib>s2:postings|ib>s3:postings|ib>docs:page text'], ['Query: check the cache first. On a miss, ask every shard in parallel, merge the answers, and then fetch snippets for the winners.', 'user>fe:monsoon trek kerala|fe>cache:miss|fe>root|root>s1:top 10|root>s2:top 10|root>s3:top 10|root>docs:snippets for best 10']]},
    walk:['The front end cleans up the query and checks the result cache.', 'On a miss, the root sends the query to one replica of every shard, through intermediate aggregators at real scale, with a deadline.', 'Each shard intersects posting lists, scores the candidates cheaply and returns its top results. Aggregators merge them, and the best few hundred are re-ranked with a more expensive model.', 'Snippets for the final 10 are built from the doc store, and the page is cached briefly.']},
  deep:[
    {t:'Splitting the index',
      think:`<p>Splitting <b>by term</b> means each shard owns some words. A query touches few shards, but multi-word queries must ship huge posting lists between machines, and popular words create hot shards. Splitting <b>by document</b> means each shard owns some pages, so every query touches every shard, but each does purely local work and returns a tiny top-k. Big web search engines split by document, and Google’s 2003 paper “Web Search for a Planet” describes index shards, each copied many times, behind aggregators. Throughput comes from the replicas, and low latency comes from working in parallel.</p>`},
    {t:'Ranking in two stages',
      think:`<p>Scoring every matching document with an expensive model is impossible. Stage one is cheap. It intersects posting lists and scores text relevance (BM25-style), plus a <b>static quality</b> score such as PageRank, the link-based score from Brin and Page’s 1998 paper. That narrows the results to a few hundred candidates for each query. Stage two applies expensive signals and machine-learned models to only those.</p>`},
    {t:'Staying fast at the tail',
      think:`<p>With thousands of shards, a query is only as fast as its <b>slowest</b> shard. If each shard has a 1% chance of a 1-second hiccup, almost every query hits one. Dean and Barroso’s “The Tail at Scale” describes the fixes: <b>hedged requests</b> send a second copy to another replica if the first is slow, <b>deadlines with partial results</b> answer without the slow shards (missing one rarely changes the top 10), and shards are kept small enough to answer quickly.</p>`}],
  bottlenecks:{
    think:`<p>Replicas solve the scale. The subtle problems are the tail, freshness and spam.</p>`,
    rows:[['Slow shard replicas', 'p99 rises with the number of shards', 'Use hedged requests, and partial results after the deadline'], ['Rebuilding the whole index', 'Results that are hours old', 'Index step by step (Google described this with Percolator and Caffeine), and keep a fresh tier for news'], ['A crawler overloads a site', 'Complaints and blocks', 'Use a queue and a rate limit for each host, obey robots.txt, and back off when a site is slow'], ['Duplicate and spam pages', 'A bloated index and bad results', 'Detect near-duplicates with simhash, and run spam classifiers before indexing'], ['Bursts of popular queries', 'The same work is repeated', 'Use a result cache with short expiry times']]},
  tradeoffs:{
    think:`<p>Search keeps choosing <b>good enough, and fast</b> over perfect and slow.</p>`,
    rows:[['Index split', 'By document', 'By term', 'Local work and simple merging, and every query touches every shard'], ['Ranking', 'A cheap first stage, then an expensive re-rank', 'An expensive model on everything', 'A feasible latency, and the recall is limited by stage one'], ['Completeness', 'Partial results after a deadline', 'Wait for every shard', 'Fast and available, and it rarely misses a result'], ['Freshness', 'Tiers by recrawl rate', 'The same recrawl rate for all', 'News is fresh in minutes, and the crawl budget goes where it matters']],
    more:['Spelling correction from query logs', 'Understanding the query (entities and intent)', 'Knowledge panels from a knowledge graph', 'Index tiers: a small, high-quality tier is searched first'],
    followups:[['How do you correct typos?', 'Generate candidate corrections by edit distance and from query logs, which show what people retyped after a failed query. Score them with a language model of queries. Then show “Did you mean”, or search the correction directly when confidence is high.'], ['How do news results show up within minutes?', 'A separate fresh tier handles it. News sites are crawled every few minutes and indexed step by step into small, fast shards. The query searches both tiers and merges the results.'], ['How does autocomplete fit in?', 'It is a separate service: a trie or prefix index over popular past queries, updated from the query logs, with its own latency budget of tens of ms. See the typeahead case.']],
    traps:['A database LIKE query for search', 'Ignoring tail latency in the fan-out', 'An impolite crawler', 'Scoring every document with the expensive model']},
  refs:['case:google-search', 'case:web-crawler', 'case:typeahead', 'l:inverted-index', 'l:bm25-ranking', 'l:percentiles-tail-latency', 'pg:tail-latency']});
})();
