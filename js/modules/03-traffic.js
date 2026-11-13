
/* =====================================================================
   PART 2 · MODULE 3 — TRAFFIC & EDGE
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, esc, clamp, fmtNum, fmtDur} = SDA.u; const ui = SDA.ui;
const {sortGame} = SDA.m1helpers;
const frag = html => { const t = document.createElement('template'); t.innerHTML = html; return t.content; };

/* ---------- widgets ---------- */
function healthCalc(host){
  const P = {iv:10, to:5, th:3, rps:2000, n:4, retry:false, outlier:false, drain:30, longest:120};
  const out = el('div', {style:{marginTop:'12px'}});
  function calc(){
    const detect = P.outlier ? Math.max(.05, 5 / (P.rps / P.n)) : P.th * P.iv + P.to;
    const share = P.rps / P.n; const failed = P.retry ? Math.round(share * detect * .02) : Math.round(share * detect);
    const cut = P.drain < P.longest;
    out.innerHTML = '';
    out.append(frag(`<div class="metrics">
      <div class="metric ${detect > 30 ? 'bad' : detect > 10 ? 'warn' : ''}"><div class="ml">Time to detect a dead server</div><div class="mv">${fmtDur(detect * 1000)}</div></div>
      <div class="metric ${failed > 10000 ? 'bad' : failed > 500 ? 'warn' : ''}"><div class="ml">Requests failed meanwhile</div><div class="mv">${fmtNum(failed)}</div></div>
      <div class="metric ${cut ? 'bad' : ''}"><div class="ml">Deploy draining</div><div class="mv" style="font-size:16px">${cut ? 'cuts long requests' : 'safe'}</div></div></div>`));
    out.append(frag(h.math(`detection ≈ ${P.outlier ? `5 consecutive errors ÷ ${fmtNum(share)} req/s per server` : `unhealthy threshold × interval + timeout = ${P.th} × ${P.iv}s + ${P.to}s`} = ${detect.toFixed(2)} s
failed    ≈ ${fmtNum(share)} req/s to the dead server × ${detect.toFixed(2)} s${P.retry ? ' × ~2% (LB retries idempotent requests on another server)' : ''} ≈ ${fmtNum(failed)}
draining  : deregistration delay ${P.drain}s vs longest request ${P.longest}s → ${cut ? 'in-flight requests longer than the delay are cut off' : 'in-flight requests finish before the instance stops'}`)));
  }
  const S = (k, o) => ui.slider(Object.assign({value:P[k], onInput:v => { P[k] = v; calc(); }}, o)).el;
  host.append(el('div', {class:'ctl-grid'}, S('iv', {label:'Health-check interval', min:1, max:30, step:1, fmt:v => v + ' s'}), S('to', {label:'Check timeout', min:1, max:10, step:1, fmt:v => v + ' s'}), S('th', {label:'Unhealthy threshold', min:1, max:10, step:1, fmt:v => v + ' failures'}), S('rps', {label:'Total traffic', min:100, max:20000, step:100, fmt:v => fmtNum(v) + ' req/s'}), S('n', {label:'Servers', min:2, max:20, step:1, fmt:v => v}), S('drain', {label:'Deregistration (drain) delay', min:0, max:300, step:5, fmt:v => v + ' s'}), S('longest', {label:'Longest request (e.g. upload)', min:1, max:600, step:1, fmt:v => v + ' s'})),
    el('div', {class:'stack', style:{marginTop:'12px'}}, ui.toggle({label:'Passive outlier detection (eject after 5 consecutive 5xx)', checked:false, onChange:v => { P.outlier = v; calc(); }}).el, ui.toggle({label:'LB retries failed idempotent requests on another server', checked:false, onChange:v => { P.retry = v; calc(); }}).el), out);
  calc();
}
function geoMount(host){
  const POPS = ['Mumbai', 'Singapore', 'Frankfurt', 'Virginia'];
  const USERS = {Chennai:[20, 40, 140, 230], Delhi:[25, 70, 130, 220], London:[120, 170, 15, 80], 'São Paulo':[300, 330, 200, 120], Jakarta:[90, 20, 180, 250]};
  let scheme = 'anycast', down = false, ttl = 60;
  const out = el('div', {style:{marginTop:'12px'}});
  function route(city){
    const rtts = USERS[city]; const alive = POPS.map((p, i) => !(down && p === 'Singapore'));
    const best = (aliveOnly) => { let b = -1; rtts.forEach((r, i) => { if ((!aliveOnly || alive[i]) && (b < 0 || r < rtts[b])) b = i; }); return b; };
    if (scheme === 'unicast'){ return alive[0] ? [0, rtts[0], 'Single region: everyone goes to Mumbai.'] : [-1, 0, 'down']; }
    if (scheme === 'geodns'){ const pre = best(false); if (!alive[pre]){ const nx = best(true); return [nx, rtts[nx], `DNS still hands out Singapore until health checks fail it and cached answers expire (up to ~${ttl}s + check time). Then → ${POPS[nx]}.`, true]; } return [pre, rtts[pre], 'Resolver location → nearest region’s IP.']; }
    const b = best(true); return [b, rtts[b], down && best(false) !== b ? `Singapore withdrew its BGP route; the same IP now reaches ${POPS[b]} within seconds — no DNS change needed.` : 'Same IP everywhere; BGP delivers to the topologically nearest POP.'];
  }
  function render(){
    out.innerHTML = '';
    const rows = Object.keys(USERS).map(c => { const [i, r, note, gap] = route(c); return [`<b>${c}</b>`, i < 0 ? '<span style="color:var(--bad)">✗ none</span>' : POPS[i], i < 0 ? '—' : r + ' ms', (gap ? '<span style="color:var(--warn)">⚠ </span>' : '') + note]; });
    out.append(frag(h.table(['User city', 'Served by', 'RTT', 'What happens'], rows, [2])));
    out.append(el('p', {class:'lab-hint'}, 'Round-trip times are illustrative orders of magnitude, not measurements.'));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.select({label:'Routing scheme', value:'anycast', options:[['unicast', 'One region (unicast IP)'], ['geodns', 'GeoDNS: different IP per region'], ['anycast', 'Anycast: same IP from every POP']], onChange:v => { scheme = v; render(); }}).el, ui.slider({label:'DNS TTL (GeoDNS)', min:10, max:600, step:10, value:60, fmt:v => v + ' s', onInput:v => { ttl = v; render(); }}).el), el('div', {style:{marginTop:'10px'}}, ui.toggle({label:'💥 Singapore POP goes down', checked:false, onChange:v => { down = v; render(); }}).el), out);
  render();
}
function ddosCalc(host){
  const V = {dns:[50, 'DNS open resolvers'], ntp:[556, 'NTP monlist'], ssdp:[31, 'SSDP'], chargen:[359, 'CharGEN'], memcached:[10000, 'Exposed memcached (UDP)'], http:[1, 'HTTP flood from a botnet (no amplification)']};
  const P = {v:'ntp', up:1000, link:10, bots:20000, rpsBot:20, cap:50000};
  const out = el('div', {style:{marginTop:'12px'}});
  function calc(){
    out.innerHTML = '';
    if (P.v === 'http'){
      const rps = P.bots * P.rpsBot; const ok = rps < P.cap;
      out.append(frag(`${h.math(`attack = ${fmtNum(P.bots)} bots × ${P.rpsBot} req/s = ${fmtNum(rps)} req/s  vs  your app capacity ${fmtNum(P.cap)} req/s`)}<div class="verdict ${ok ? 'warn' : 'bad'}">${ok ? 'Your servers survive, but every expensive request (search, login) costs real CPU and money.' : `Overwhelmed ${(rps / P.cap).toFixed(1)}×. Layer-7 floods need edge defences: WAF rules, bot challenges, per-IP/per-token rate limits, caching, and making expensive endpoints require auth.`}</div>`));
      return;
    }
    const [f] = V[P.v]; const gbps = P.up / 1000 * f; const ok = gbps < P.link;
    out.append(frag(`${h.math(`reflected attack = attacker’s spoofed request bandwidth ${fmtNum(P.up)} Mbps × amplification ~${fmtNum(f)}× ≈ ${gbps >= 1000 ? (gbps / 1000).toFixed(2) + ' Tbps' : gbps.toFixed(1) + ' Gbps'}`)}<div class="verdict ${ok ? 'warn' : 'bad'}">${ok ? 'Your link survives this one — barely. Packets still burn firewall and kernel time.' : `Your ${P.link} Gbps link is saturated ${(gbps / P.link).toFixed(0)}× before a single packet reaches your servers. No server tuning helps — you need upstream absorption: an anycast CDN/scrubbing network with far more capacity than any one origin.`}</div>`));
  }
  const sel = ui.select({label:'Attack vector', value:'ntp', options:Object.entries(V).map(([k, [f, n]]) => [k, `${n}${f > 1 ? ' (~' + fmtNum(f) + '×)' : ''}`]), onChange:v => { P.v = v; calc(); }});
  host.append(el('div', {class:'ctl-grid'}, sel.el, ui.slider({label:'Attacker spoofed request bandwidth', min:10, max:10000, step:10, value:P.up, fmt:v => fmtNum(v) + ' Mbps', onInput:v => { P.up = v; calc(); }}).el, ui.slider({label:'Your internet link', min:1, max:100, step:1, value:P.link, fmt:v => v + ' Gbps', onInput:v => { P.link = v; calc(); }}).el, ui.slider({label:'Botnet size (HTTP flood)', min:1000, max:500000, step:1000, value:P.bots, fmt:v => fmtNum(v), onInput:v => { P.bots = v; calc(); }}).el, ui.slider({label:'Requests/s per bot', min:1, max:100, step:1, value:P.rpsBot, fmt:v => v, onInput:v => { P.rpsBot = v; calc(); }}).el, ui.slider({label:'Your app capacity', min:1000, max:1000000, step:1000, value:P.cap, fmt:v => fmtNum(v) + ' req/s', onInput:v => { P.cap = v; calc(); }}).el), out, el('p', {class:'lab-hint'}, 'Amplification factors: DNS, NTP, SSDP and CharGEN from US-CERT alert TA14-017A (ranges; midpoints used); memcached has been measured at 10,000× and above (Cloudflare, 2018). Use for intuition only.'));
  calc();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'lb-l4-vs-l7', title:'Load balancers: L4 vs L7', minutes:9, tags:['load balancer','L4','L7','TLS termination','Maglev'],
  summary:'L4 balances connections by IP and port — fast and protocol-agnostic. L7 understands HTTP — it can route by path, header or cookie, retry and rewrite.',
  problem:`<p>An e-commerce site wants <code>/api/search</code> to go to search servers, <code>/static</code> to the asset origin, and beta-flagged mobile users to canary servers. A layer-4 load balancer can’t see URLs at all — it only sees IPs and ports. But layer-7 balancing costs more CPU per request and must decrypt TLS.</p>`,
  intuition:`An L4 balancer is a post-office sorter who reads only the PIN code on the envelope and never opens it — very fast. An L7 balancer is a secretary who opens each letter, reads the request, and sends it to the right department — smarter, slower, and needs the key to open the envelope (TLS).`,
  how:{
    steps:[`<b>Layer 4 (transport):</b> chooses a backend per TCP/UDP <i>connection</i> using IPs and ports. Forwards packets (NAT, tunnelling or direct server return). Millions of connections, very low overhead, any protocol.`, `<b>Layer 7 (application):</b> terminates the HTTP connection, parses each request, picks a backend per <i>request</i> by host, path, header or cookie. Can retry, rewrite, compress, add auth, apply WAF rules.`, `Large sites stack them: an L4 tier spreads connections across a fleet of L7 proxies, which route requests to services.`, `Both run health checks and remove dead backends.`],
    diagram:{title:'Two tiers of load balancing', w:800, h:300, alt:'Clients connect to an L4 balancer that spreads connections to L7 proxies, which route by path to search, catalog and canary pools.',
      nodes:[{id:'c', type:'client', label:'Clients', x:70, y:150}, {id:'l4', type:'lb', label:'L4 LB', sub:'IP:port only', x:220, y:150, w:120}, {id:'p1', type:'lb', label:'L7 proxy 1', x:410, y:90}, {id:'p2', type:'lb', label:'L7 proxy 2', x:410, y:210}, {id:'s', type:'service', label:'/api/search', x:640, y:50, w:130}, {id:'k', type:'service', label:'/catalog', x:640, y:150, w:130}, {id:'cn', type:'service', label:'canary pool', sub:'header: beta=1', x:640, y:250, w:130}],
      edges:[{from:'c', to:'l4'}, {from:'l4', to:'p1'}, {from:'l4', to:'p2'}, {from:'p1', to:'s'}, {from:'p1', to:'k'}, {from:'p2', to:'k'}, {from:'p2', to:'cn'}],
      steps:[
        {note:'A TCP connection arrives. The <b>L4</b> balancer hashes the 5-tuple and forwards the whole connection to one L7 proxy — without reading a byte of HTTP.', flow:[['c', 'l4', 'SYN'], ['l4', 'p1']], hl:['l4']},
        {note:'The <b>L7</b> proxy terminates TLS, reads <code>GET /api/search?q=shoes</code>, and routes this request to the search pool.', flow:[['c', 'l4', 'GET /api/search'], ['l4', 'p1'], ['p1', 's']], hl:['p1', 's']},
        {note:'Another request on the same connection — <code>GET /catalog/42</code> — goes to a different pool. L7 balances <b>per request</b>.', flow:[['c', 'l4', 'GET /catalog/42'], ['l4', 'p1'], ['p1', 'k']], hl:['k']},
        {note:'A request carrying <code>beta=1</code> is routed to the canary pool — impossible at L4.', flow:[['c', 'l4', 'GET / (beta=1)'], ['l4', 'p2'], ['p2', 'cn']], hl:['cn']}
      ]},
    deep:`<p><b>L4 internals:</b> Google’s <b>Maglev</b> (NSDI 2016) is a software L4 balancer on commodity Linux servers: routers spread packets to Maglev machines with ECMP, and Maglev uses its own consistent hashing so any machine picks the same backend for a connection. Facebook’s <b>Katran</b> uses XDP/eBPF to forward packets in the kernel fast path. <b>Direct server return</b> lets responses bypass the balancer — useful when responses are much larger than requests.</p><p><b>L7 internals:</b> Envoy, Nginx and HAProxy maintain connection pools to backends, apply timeouts and retries per route, and emit rich per-request metrics. Because HTTP/2 and gRPC multiplex many requests over long-lived connections, connection-level (L4) balancing leads to hot backends — L7 or client-side per-request balancing fixes it.</p>`
  },
  tradeoffs:{use:[`<b>L4:</b> very high throughput, non-HTTP protocols (databases, MQTT, game servers), TLS passthrough, the first tier in front of L7 proxies`, `<b>L7:</b> path/host/header routing, canaries, retries, WAF, per-request balancing for HTTP/2 and gRPC`], avoid:[`L4 for gRPC/HTTP-2 traffic that needs even per-request spread`, `Heavy L7 logic where plain forwarding would do`], alt:[`Client-side load balancing (gRPC with a service registry)`, `DNS-based balancing for coarse global distribution`]},
  real:[
    {co:'AWS', tier:'confirmed', text:'Offers the Network Load Balancer (layer 4: TCP/UDP/TLS, very high throughput, static IPs) and the Application Load Balancer (layer 7: host/path/header routing, HTTP/2, gRPC).', src:'Elastic Load Balancing documentation'},
    {co:'Google', tier:'confirmed', text:'Maglev, a distributed software network load balancer, has fronted Google services since 2008 according to the NSDI 2016 paper.', src:'Eisenbud et al., “Maglev: A Fast and Reliable Software Network Load Balancer”, NSDI 2016'},
    {co:'Facebook / Meta', tier:'confirmed', text:'Open-sourced Katran in 2018, an XDP/eBPF-based layer-4 load balancer forwarding plane.', src:'Engineering at Meta, “Open-sourcing a layer 4 load balancer” (2018)'}
  ],
  mistakes:[`Expecting an L4 balancer to route by URL`, `Balancing gRPC at L4 and getting one hot backend`, `Forgetting the balancer itself needs redundancy`],
  interview:[`State which layer your LB works at and why`, `Mention TLS termination location and health checks in the same breath`],
  tryit:{note:'Can an L4 balancer do it, or does it need L7?', mount:host => sortGame(host, [
    {t:'Send /api/* and /images/* to different server pools', c:'7', why:'Needs the URL path — only visible after parsing HTTP.'},
    {t:'Balance raw TCP connections to a PostgreSQL replica pool', c:'4', why:'Not HTTP; connection-level balancing is exactly L4’s job.'},
    {t:'Keep TLS encrypted end-to-end to the backend (passthrough)', c:'4', why:'L4 forwards encrypted bytes without terminating TLS.'},
    {t:'Route users with cookie beta=1 to canary servers', c:'7', why:'Cookies are HTTP headers.'},
    {t:'Retry a failed GET on another backend', c:'7', why:'Request-level retries require understanding requests.'},
    {t:'Forward UDP game traffic to the nearest healthy server', c:'4', why:'UDP isn’t HTTP; L4 handles it.'},
    {t:'Spread gRPC calls evenly across backends', c:'7', why:'gRPC multiplexes calls over long-lived HTTP/2 connections; balance per request.'}
  ], [{id:'4', label:'L4 can do it'}, {id:'7', label:'Needs L7'}])},
  sources:[`Eisenbud et al., “Maglev”, NSDI 2016`, `AWS Elastic Load Balancing docs`, `Engineering at Meta — Katran (2018)`]
},
{
  id:'lb-algorithms', title:'Load-balancing algorithms', minutes:10, tags:['round robin','least connections','IP hash','consistent hashing','power of two choices'],
  summary:'Round robin, weighted, least connections, IP hash, consistent hash, power-of-two-choices — and why the “fair” one can be the worst choice.',
  problem:`<p>Four servers; one is an older machine half as fast. Most requests take 5 ms, but report exports take 2 seconds. Round robin hands every server the same <em>count</em> of requests — the slow server drowns while the others idle. Which algorithm should the load balancer use?</p>`,
  intuition:`Billing counters at a supermarket. <b>Round robin</b>: the guard sends shoppers to counters 1, 2, 3, 4, 1, 2… <b>Weighted</b>: the counter with two cashiers gets twice as many. <b>Least connections</b>: go to the shortest queue. <b>IP hash</b>: you always go to “your” cashier. <b>Power of two choices</b>: glance at two random counters and join the shorter one.`,
  how:{
    steps:[`<b>Round robin:</b> rotate through servers. Simple and fair by count; blind to speed and request cost.`, `<b>Weighted round robin:</b> bigger machines get proportionally more requests.`, `<b>Least connections / least outstanding requests:</b> pick the server with the fewest in-flight requests — adapts to slow servers and expensive requests automatically.`, `<b>IP hash:</b> hash(client IP) mod N → the same client hits the same server (cheap stickiness). Adding/removing a server remaps almost everyone.`, `<b>Consistent hashing:</b> servers on a hash ring; a server change remaps only ~1/N of keys. Used for caches and stateful routing (Module 4).`, `<b>Power of two choices (P2C):</b> pick two servers at random, send to the less loaded. Nearly as good as least-connections with far less coordination.`],
    diagram:{title:'Round robin vs least connections with one slow server', w:760, h:290, alt:'A load balancer distributes requests to three servers; one is slow and accumulates a queue under round robin.',
      nodes:[{id:'c', type:'client', label:'Clients', x:70, y:145}, {id:'lb', type:'lb', label:'Load balancer', x:250, y:145}, {id:'a', type:'service', label:'Server A', sub:'fast', x:500, y:55}, {id:'b', type:'service', label:'Server B', sub:'fast', x:500, y:145}, {id:'s', type:'service', label:'Server C', sub:'slow (old)', x:500, y:235}],
      edges:[{from:'c', to:'lb'}, {from:'lb', to:'a'}, {from:'lb', to:'b'}, {from:'lb', to:'s'}],
      steps:[
        {note:'<b>Round robin</b> sends requests A → B → C → A → B → C…', flow:[['lb', 'a', '1'], ['lb', 'b', '2'], ['lb', 's', '3']], dur:500, hl:['lb']},
        {note:'A and B finish quickly. C is still busy with request 3 — but it still gets every third request.', flow:[['lb', 'a', '4'], ['lb', 'b', '5'], ['lb', 's', '6']], dur:500, status:{s:'hot'}, sub:{s:'queue: 2'}},
        {note:'C’s queue grows; one-third of users now see multi-second latency even though A and B are idle much of the time.', flow:[['lb', 's', '9'], ['lb', 's', '12']], status:{s:'hot'}, sub:{s:'queue: 4 😰'}},
        {note:'<b>Least connections</b> sees C has 4 in flight and A/B have 0 — new requests go to A and B until C catches up.', status:{s:'ok'}, sub:{s:'queue: 1'}, flow:[['lb', 'a', '13'], ['lb', 'b', '14'], ['lb', 'a', '15']], dur:500, hl:['a', 'b']}
      ]},
    deep:`<p><b>Power of two choices:</b> Mitzenmacher showed that sampling two random servers and choosing the less loaded one reduces the maximum load exponentially compared with purely random assignment — while needing only local, possibly stale information. Envoy’s <code>LEAST_REQUEST</code> balancer uses P2C by default.</p><p><b>Smooth weighted round robin</b> (as in Nginx) interleaves picks so a weight-5 server doesn’t receive five requests in a row. <b>Latency-aware</b> balancers (e.g. peak-EWMA in Finagle and Linkerd) prefer servers with lower recent latency.</p><p><b>Slow start</b> ramps new instances up gradually (cold caches, JIT warm-up) — supported by AWS ALB and Envoy. <b>Hash-based</b> methods trade balance for locality: great for cache hit rates, risky with hot keys (one celebrity user hammering one server).</p>`
  },
  tradeoffs:{use:[`<b>Round robin:</b> identical servers, uniform cheap requests`, `<b>Least connections / P2C:</b> mixed request costs or heterogeneous servers (a good default)`, `<b>Consistent hashing:</b> caches and stateful shards where locality matters`], avoid:[`Round robin with long-running or highly variable requests`, `IP hash behind carrier-grade NAT (thousands of users share one IP)`, `Mod-N hashing when servers change often`], alt:[`Client-side balancing with a service registry`, `Latency-based (EWMA) selection`, `Queue-based pull: workers take jobs when free`]},
  real:[
    {co:'Nginx', tier:'confirmed', text:'Defaults to round robin and supports <code>least_conn</code>, <code>ip_hash</code> and <code>hash … consistent</code> (ketama consistent hashing) for upstream groups.', src:'Nginx documentation — ngx_http_upstream_module'},
    {co:'Envoy', tier:'confirmed', text:'Its least-request load balancer uses the power-of-two-choices technique by default, and it also offers ring-hash and Maglev hashing policies.', src:'Envoy documentation — load balancing'},
    {co:'AWS ALB', tier:'confirmed', text:'Supports round robin and “least outstanding requests” routing, plus slow-start for newly registered targets.', src:'AWS Application Load Balancer documentation'}
  ],
  mistakes:[`Round robin with a mix of 5 ms and 2 s requests`, `IP hash for “stickiness” behind mobile NAT`, `Ignoring warm-up: a new instance gets full traffic with cold caches`],
  interview:[`Default to least-outstanding-requests / P2C and say why`, `Use consistent hashing when routing to caches or shards, and mention hot keys`],
  tryit:{note:'Pick an algorithm, make a server slow, kill one, and watch distribution and latency live.', pg:'load-balancer'},
  sources:[`Michael Mitzenmacher, “The Power of Two Choices in Randomized Load Balancing” (2001)`, `Nginx and Envoy documentation`, `AWS ALB documentation`]
},
{
  id:'health-checks-sticky', title:'Health checks, draining and sticky sessions', minutes:9, tags:['health check','readiness','liveness','draining','sticky sessions'],
  summary:'Detect dead servers fast but don’t eject healthy ones; drain gracefully during deploys; avoid sticky sessions unless you must.',
  problem:`<p>A server’s disk fills up. It still accepts TCP connections but returns 500 errors. The load balancer keeps sending it a quarter of all traffic for ten minutes because the health check only opens a TCP connection. Meanwhile every deploy kills instances abruptly and users lose in-flight uploads.</p>`,
  intuition:`A supervisor checking on staff. “Are you alive?” is a liveness check. “Can you take a new customer right now?” is a readiness check. Before someone’s shift ends, they stop taking new customers but finish serving the current ones (draining). Sticky sessions are always sending a customer to the same staff member who remembers them — convenient, until that person goes on leave.`,
  how:{
    steps:[`<b>Active health checks:</b> the LB calls <code>/healthz</code> every <i>interval</i>; after <i>N</i> failures (threshold) the server is marked unhealthy; after <i>M</i> successes it returns.`, `<b>Passive checks / outlier detection:</b> eject a backend after observing consecutive real errors — detects failure in milliseconds at high traffic.`, `<b>Liveness vs readiness</b> (Kubernetes): liveness failing → restart the process; readiness failing → stop sending traffic but don’t kill it.`, `<b>Draining</b> (connection draining / deregistration delay): on deploy or scale-in, stop new requests, let in-flight ones finish, then terminate.`, `<b>Sticky sessions</b> pin a client to one server (cookie or IP hash). They hide stateful design and cause imbalance; prefer stateless servers with shared session storage.`],
    diagram:{title:'Detect, eject, drain', w:760, h:270, alt:'A load balancer health-checks three servers; one starts failing and is ejected; another is drained during a deploy.',
      nodes:[{id:'lb', type:'lb', label:'Load balancer', x:150, y:135}, {id:'a', type:'service', label:'Server A', x:470, y:50}, {id:'b', type:'service', label:'Server B', x:470, y:135}, {id:'c', type:'service', label:'Server C', x:470, y:220}, {id:'u', type:'client', label:'Users', x:150, y:240, w:100}],
      edges:[{from:'u', to:'lb'}, {from:'lb', to:'a'}, {from:'lb', to:'b'}, {from:'lb', to:'c'}],
      steps:[
        {note:'Every 5 s the LB calls <code>GET /healthz</code> on each server. All return 200.', flow:[['lb', 'a', '/healthz'], ['lb', 'b', '/healthz'], ['lb', 'c', '/healthz']], parallel:true},
        {note:'Server B’s disk fills: it now returns 500 for real requests and fails its (deep enough) health check: strike 1… 2… 3.', status:{b:'hot'}, flow:[['lb', 'b', '/healthz'], ['b', 'lb', '500']], hl:['b']},
        {note:'Threshold reached → B is marked <b>unhealthy</b> and receives no traffic.', status:{b:'down'}, flow:[['u', 'lb', 'req'], ['lb', 'a'], ['u', 'lb', 'req'], ['lb', 'c']]},
        {note:'Deploy time for A: it is <b>deregistered</b> — no new requests — but its in-flight upload is allowed to finish (draining).', status:{a:'hot'}, sub:{a:'draining'}, flow:[['u', 'lb', 'req'], ['lb', 'c']]},
        {note:'A finishes, restarts with the new version, passes readiness, and rejoins.', status:{a:'ok'}, sub:{a:'v2 ✓'}, flow:[['lb', 'a', '/ready'], ['a', 'lb', '200']], hl:['a']}
      ]},
    deep:`<p><b>Shallow vs deep checks:</b> if every instance’s health check calls the shared database, a database blip makes <i>all</i> instances unhealthy at once and the LB ejects the whole fleet — turning a partial outage into a total one. Keep liveness shallow (own process), make readiness reflect only what this instance controls, and rely on balancer safety nets: AWS load balancers <b>fail open</b> (route to all targets) when every target is unhealthy, and Envoy has a <b>panic threshold</b> (default 50%) below which it ignores health status.</p><p><b>Graceful shutdown:</b> on SIGTERM stop accepting, finish in-flight requests, close idle keep-alive connections, then exit. Kubernetes waits <code>terminationGracePeriodSeconds</code> (30 s by default) before SIGKILL; a <code>preStop</code> sleep gives load balancers time to stop routing first.</p>`
  },
  tradeoffs:{use:[`Active + passive checks together`, `Draining on every deploy and scale-in`, `Sticky sessions only for legacy stateful apps or WebSocket affinity`], avoid:[`Deep health checks that depend on shared infrastructure`, `Thresholds so sensitive that a GC pause ejects a server`, `Sticky sessions as a substitute for proper session storage`], alt:[`Shared session store (Redis) or signed tokens`, `Client-side retries on another instance for idempotent calls`]},
  real:[
    {co:'Kubernetes', tier:'confirmed', text:'Defines liveness, readiness and startup probes with configurable periods and failure thresholds, and a default 30-second termination grace period.', src:'Kubernetes documentation — probes and pod termination'},
    {co:'AWS ELB', tier:'confirmed', text:'Uses a deregistration delay (300 seconds by default) to drain in-flight requests, and fails open when all targets are unhealthy.', src:'Elastic Load Balancing target group documentation'},
    {co:'Envoy', tier:'confirmed', text:'Combines active health checking with passive outlier detection (ejecting hosts after consecutive errors) and a configurable panic threshold.', src:'Envoy documentation — outlier detection, panic threshold'}
  ],
  mistakes:[`TCP-only health checks that miss application failures`, `Health checks that call the database (fleet-wide ejection)`, `Killing instances without draining`, `Sticky sessions causing one server to hold most heavy users`],
  interview:[`State check interval × threshold = detection time, and the traffic lost meanwhile`, `Mention graceful shutdown and draining when discussing deployments`],
  tryit:{note:'Tune health checks and draining. See detection time, lost requests and whether deploys cut users off.', mount:host => healthCalc(host)},
  sources:[`Kubernetes docs — configure liveness, readiness and startup probes`, `AWS ELB docs`, `Envoy docs — outlier detection`]
},
{
  id:'geodns-anycast', title:'GeoDNS and Anycast', minutes:8, tags:['GeoDNS','anycast','BGP','multi-region','POP'],
  summary:'GeoDNS gives each user the IP of a nearby region. Anycast announces one IP from many places and lets internet routing pick the nearest.',
  problem:`<p>Your users are in Chennai, London and São Paulo. With a single region in Mumbai, São Paulo pays ~300 ms per round trip. You add regions and edge locations — but how does each user find the nearest one, and what happens when one of them goes down?</p>`,
  intuition:`GeoDNS is a directory-enquiry operator who hears where you’re calling from and gives you the number of your nearest branch. Anycast is one toll-free number that the phone network automatically connects to the nearest call centre — and if one centre closes, calls quietly go to the next one.`,
  how:{
    steps:[`<b>GeoDNS / latency-based DNS:</b> the authoritative DNS answers differently depending on where the query comes from (usually the resolver’s location).`, `Failover with DNS needs health checks <i>and</i> waiting for cached answers to expire (TTL).`, `<b>Anycast:</b> the same IP prefix is announced via BGP from many locations; routers deliver packets to the “closest” announcement.`, `If a location fails, it withdraws its route and traffic shifts to the next nearest within seconds — no DNS change.`, `Common combination: anycast for the edge (CDN, DNS, DDoS absorption) and GeoDNS or global load balancers to pick application regions.`],
    diagram:{title:'One IP, many places', w:780, h:280, alt:'Users in different cities reach the same anycast IP served from the nearest point of presence; one POP fails and traffic shifts.',
      nodes:[{id:'u1', type:'client', label:'User, Chennai', x:80, y:60, w:130}, {id:'u2', type:'client', label:'User, Jakarta', x:80, y:150, w:130}, {id:'u3', type:'client', label:'User, London', x:80, y:240, w:130}, {id:'m', type:'cdn', label:'POP Mumbai', sub:'203.0.113.1', x:470, y:60, w:150}, {id:'s', type:'cdn', label:'POP Singapore', sub:'203.0.113.1', x:470, y:150, w:150}, {id:'f', type:'cdn', label:'POP Frankfurt', sub:'203.0.113.1', x:470, y:240, w:150}, {id:'o', type:'service', label:'Origin', x:690, y:150}],
      edges:[{from:'u1', to:'m'}, {from:'u2', to:'s'}, {from:'u3', to:'f'}, {from:'u2', to:'m', dashed:true}, {from:'m', to:'o'}, {from:'s', to:'o'}, {from:'f', to:'o'}],
      steps:[
        {note:'All three POPs announce the <b>same IP</b>. Each user’s packets follow BGP to the nearest one.', flow:[['u1', 'm', 'SYN'], ['u2', 's', 'SYN'], ['u3', 'f', 'SYN']], parallel:true},
        {note:'Singapore fails and <b>withdraws</b> its BGP announcement.', status:{s:'down'}, hl:['s']},
        {note:'Within seconds, Jakarta’s packets to the same IP arrive at Mumbai instead. No DNS change, no client change.', flow:[['u2', 'm', 'SYN']], hl:['m']},
        {note:'With <b>GeoDNS</b> instead, Jakarta’s resolver keeps the Singapore IP until health checks remove it <i>and</i> the cached record’s TTL expires.', status:{s:'down'}, hl:['u2']}
      ]},
    deep:`<p><b>“Nearest” in BGP</b> means shortest AS path and operator policy, not necessarily lowest latency; large anycast networks tune announcements and peering to approximate latency. Route changes mid-connection can move a TCP flow to a different POP that has no state for it, so anycast suits short connections, UDP (DNS) and stateless edges; long-lived connections need care.</p><p><b>GeoDNS accuracy</b> depends on the resolver’s location; EDNS Client Subnet (RFC 7871) passes a truncated client subnet so the answer reflects the user rather than a distant public resolver.</p><p><b>Anycast and DDoS:</b> because attack traffic is also delivered to the nearest POP, a globally distributed botnet’s traffic is split across hundreds of locations instead of converging on one.</p>`
  },
  tradeoffs:{use:[`<b>Anycast:</b> DNS, CDN edges, DDoS absorption, stateless UDP services`, `<b>GeoDNS:</b> choosing an application region; data-residency routing (keep Indian users in India)`], avoid:[`Anycast for long-lived stateful TCP without mitigation`, `GeoDNS with long TTLs as your only failover mechanism`], alt:[`Global L7 load balancers (one anycast IP fronting regional backends)`, `Client-side region selection with latency probes`]},
  real:[
    {co:'Cloudflare', tier:'confirmed', text:'Runs an anycast network: the same IP addresses are announced from all its data centres, so traffic (including attack traffic) lands at the nearest one.', src:'Cloudflare documentation and blog'},
    {co:'Google Public DNS (8.8.8.8)', tier:'confirmed', text:'Served via anycast from many locations worldwide behind a single, memorable IP address.', src:'Google Public DNS documentation'},
    {co:'Amazon Route 53', tier:'confirmed', text:'Provides geolocation, geoproximity and latency-based routing policies with health-checked failover.', src:'Amazon Route 53 developer guide'}
  ],
  mistakes:[`DNS failover with 1-hour TTLs`, `Assuming anycast always picks the lowest-latency POP`, `Forgetting data-residency rules when routing users across borders`],
  interview:[`Explain how users reach the nearest region and what happens when that region dies`, `Combine anycast edge + regional backends in multi-region designs`],
  tryit:{note:'Choose a routing scheme, then knock out the Singapore POP.', mount:host => geoMount(host)},
  sources:[`RFC 4786 (operation of anycast services)`, `RFC 7871 (EDNS Client Subnet)`, `Cloudflare and Route 53 documentation`]
},
{
  id:'cdn', title:'CDNs: push vs pull, caching and invalidation', minutes:10, tags:['CDN','edge','cache-control','invalidation','origin shield'],
  summary:'Copy content to edge servers near users. Pull fills on demand; push pre-loads. The hard part is updating it: TTLs, purges and versioned URLs.',
  problem:`<p>A cricket final streams to millions; a sale page serves product images to the whole country. One origin in Mumbai can’t push those bytes alone, and distant users pay 200 ms+ per round trip. So you put copies near users — but how do the copies get there, and how do you fix a wrong price image once a thousand edges have cached it?</p>`,
  intuition:`Instead of every customer driving to the factory in Pune, the company stocks local kirana shops (edges). <b>Pull</b>: a shopkeeper orders an item the first time a customer asks for it. <b>Push</b>: the company delivers stock to every shop before the festival rush. <b>Invalidation</b>: recalling a bad batch from every shop at once.`,
  how:{
    steps:[`Users are routed (anycast or DNS) to a nearby <b>edge POP</b>.`, `<b>Cache key</b> = usually the URL (plus selected headers/query params). Hit → served from the edge in milliseconds.`, `<b>Pull CDN</b>: on a miss the edge fetches from the origin, caches it per <code>Cache-Control</code> (max-age / s-maxage), and serves it.`, `<b>Push CDN</b>: you upload or pre-position content ahead of demand — great for big, predictable files (video, game patches).`, `<b>Invalidation</b>: wait for the TTL, purge explicitly, or — best — use <b>versioned URLs</b> (<code>app.3f9a1c.js</code>) so new content has a new key.`, `An <b>origin shield</b> (mid-tier cache) collapses misses from many edges into one origin request.`],
    diagram:{title:'Pull-through caching with an origin shield', w:800, h:280, alt:'Users request from edges; misses go to a shield cache then the origin; later requests hit at the edge.',
      nodes:[{id:'u1', type:'client', label:'User, Delhi', x:80, y:70, w:120}, {id:'u2', type:'client', label:'User, Lucknow', x:80, y:210, w:130}, {id:'e1', type:'cdn', label:'Edge Delhi', x:300, y:70}, {id:'e2', type:'cdn', label:'Edge Lucknow', x:300, y:210, w:130}, {id:'sh', type:'cache', label:'Origin shield', x:520, y:140}, {id:'o', type:'service', label:'Origin (Mumbai)', x:710, y:140, w:140}],
      edges:[{from:'u1', to:'e1'}, {from:'u2', to:'e2'}, {from:'e1', to:'sh'}, {from:'e2', to:'sh'}, {from:'sh', to:'o'}],
      steps:[
        {note:'First request for <code>/img/phone.jpg</code> in Delhi: <b>edge miss</b> → shield miss → origin.', flow:[['u1', 'e1', 'GET'], ['e1', 'sh', 'miss'], ['sh', 'o', 'miss'], ['o', 'sh', '200 max-age=86400'], ['sh', 'e1'], ['e1', 'u1']], hl:['o']},
        {note:'Lucknow asks for the same image: edge miss, but the <b>shield hits</b> — the origin isn’t touched.', flow:[['u2', 'e2', 'GET'], ['e2', 'sh', 'miss'], ['sh', 'e2', 'hit'], ['e2', 'u2']], hl:['sh']},
        {note:'Everyone after that is an <b>edge hit</b>: a few milliseconds, zero origin load.', flow:[['u1', 'e1', 'GET'], ['e1', 'u1', 'hit'], ['u2', 'e2', 'GET'], ['e2', 'u2', 'hit']], hl:['e1', 'e2']},
        {note:'The image had the wrong price! Either <b>purge</b> it everywhere or deploy <code>/img/phone.v2.jpg</code> — a new URL is a guaranteed miss and needs no purge.', hl:['e1', 'e2', 'sh'], status:{e1:'hot', e2:'hot'}}
      ]},
    deep:`<p><b>Headers that matter:</b> <code>Cache-Control: public, max-age=31536000, immutable</code> for fingerprinted assets; <code>s-maxage</code> to give shared caches a different TTL; <code>stale-while-revalidate</code> and <code>stale-if-error</code> (RFC 5861) to serve slightly stale content while refreshing or when the origin is down; <code>Vary</code> to add headers to the cache key (use sparingly — it fragments the cache).</p><p><b>Request collapsing</b> (coalescing): when 10,000 users miss on the same new object at once, the edge sends <i>one</i> request to the origin and queues the rest — preventing a thundering herd. <b>Tiered caching</b> and shields raise hit ratios for the long tail.</p><p><b>Beyond static:</b> CDNs accelerate dynamic APIs (persistent, tuned connections back to the origin), terminate TLS near users, run edge compute, and serve video as small cacheable segments (HLS/DASH, Module 13). Measure hit ratio by <i>bytes</i> as well as requests — egress cost follows bytes.</p>`
  },
  tradeoffs:{use:[`<b>Pull:</b> websites, images, APIs with cacheable GETs — easy, self-filling`, `<b>Push:</b> large, predictable content (video libraries, app updates) where you control timing`, `<b>Versioned URLs</b> for every build asset`], avoid:[`Caching personalised responses without per-user keys (data leak!)`, `Purging everything on every deploy`, `Long TTLs on un-versioned URLs that change`], alt:[`Multi-CDN for resilience and price leverage`, `Regional origins/replicas when content is too dynamic to cache`]},
  real:[
    {co:'Netflix Open Connect', tier:'confirmed', text:'Netflix’s own CDN uses a <b>push</b> model: appliances inside ISP networks are proactively filled with predicted-popular content during off-peak hours, so prime-time viewing is served locally.', src:'Netflix Open Connect documentation'},
    {co:'Akamai', tier:'confirmed', text:'Founded in 1998, it pioneered the commercial CDN model of serving content from servers deployed deep inside many networks worldwide.', src:'Akamai corporate history; Nygren et al., “The Akamai Network”, SIGOPS 2010'},
    {co:'Fastly', tier:'confirmed', text:'Advertises “Instant Purge”, invalidating content across its global network in about 150 milliseconds, enabling longer TTLs on content that occasionally changes.', src:'Fastly documentation'}
  ],
  mistakes:[`Caching a page with a user’s name in it for everyone`, `Changing a file without changing its URL, then waiting a day for TTLs`, `Forgetting the origin must survive a cold-cache stampede (enable collapsing / a shield)`],
  interview:[`Put static and media on a CDN in almost every design; state the TTL and invalidation strategy`, `Mention origin shield and request collapsing for flash crowds`],
  tryit:{note:'Run a CDN: pull vs push, TTLs, purges and an origin shield — with live hit ratios per city.', pg:'cdn-edge'},
  sources:[`RFC 9111 (HTTP caching)`, `RFC 5861 (stale-while-revalidate, stale-if-error)`, `Nygren et al., “The Akamai Network” (2010)`, `Netflix Open Connect docs`]
},
{
  id:'rate-limiting', title:'Rate limiting algorithms', minutes:11, tags:['rate limiting','token bucket','leaky bucket','fixed window','sliding window'],
  summary:'Token bucket, leaky bucket, fixed window, sliding log and sliding counter — how each counts, what bursts it allows, and what it costs.',
  problem:`<p>A buggy partner integration retries in a tight loop: 5,000 requests a second to your OTP endpoint — burning SMS money and starving real users. Bots scrape every price. You need to cap each client fairly while still allowing short, legitimate bursts (a user opening the app fires ten calls at once).</p>`,
  intuition:`<b>Token bucket</b>: a metro card topped up at a fixed rate; each ride costs one token and you can save a few for a burst. <b>Leaky bucket</b>: a funnel — pour as fast as you like, it drips out at a steady rate, overflow spills. <b>Fixed window</b>: “10 tickets per clock minute”, resetting at :00. <b>Sliding window</b>: “10 in any 60-second span”, no matter where it starts.`,
  how:{
    steps:[`<b>Token bucket</b> (capacity B, refill r/s): allow if a token is available. Permits bursts up to B, average rate r. State: tokens + last refill time.`, `<b>Leaky bucket</b> (queue size B, drain r/s): requests queue and are processed at a constant rate; excess is rejected. Smooths output; adds delay.`, `<b>Fixed window counter</b>: count per clock window. Tiny state — but up to <b>2× the limit</b> can pass around a window boundary.`, `<b>Sliding window log</b>: store every timestamp; allow if fewer than N in the last window. Exact, but memory grows with the limit.`, `<b>Sliding window counter</b>: estimate = current count + previous count × (overlap fraction). Nearly exact with two counters.`, `Enforce at the gateway per API key/user/IP; in a distributed system keep counters in a shared store (Redis) with atomic operations, and answer 429 + Retry-After.`],
    diagram:{title:'Where the limiter sits', w:760, h:250, alt:'Clients pass through a gateway with a rate limiter backed by Redis; allowed requests reach the service, others get 429.',
      nodes:[{id:'c1', type:'client', label:'Normal user', x:80, y:70, w:120}, {id:'c2', type:'client', label:'Buggy script', x:80, y:180, w:120}, {id:'gw', type:'lb', label:'Gateway + limiter', x:320, y:125, w:150}, {id:'r', type:'cache', label:'Redis counters', x:320, y:225, w:130, h:40}, {id:'s', type:'service', label:'OTP service', x:600, y:125}],
      edges:[{from:'c1', to:'gw'}, {from:'c2', to:'gw'}, {from:'gw', to:'r'}, {from:'gw', to:'s'}],
      steps:[
        {note:'A normal request: the gateway atomically checks and decrements this key’s bucket in Redis → allowed.', flow:[['c1', 'gw', 'POST /otp'], ['gw', 'r', 'EVAL bucket'], ['r', 'gw', 'ok'], ['gw', 's']], hl:['gw']},
        {note:'The buggy script bursts. Its bucket empties after a few requests…', flow:[['c2', 'gw', 'POST'], ['c2', 'gw', 'POST'], ['c2', 'gw', 'POST']], parallel:true, status:{c2:'hot'}},
        {note:'…so further requests get <b>429 Too Many Requests</b> with <code>Retry-After</code> — they never reach the OTP service.', flow:[['gw', 'r', 'EVAL'], ['r', 'gw', 'empty'], ['gw', 'c2', '429']], hl:['c2']},
        {note:'Meanwhile the normal user is unaffected: limits are <b>per key</b>.', flow:[['c1', 'gw', 'POST'], ['gw', 's']], status:{c2:'ok'}, hl:['c1', 's']}
      ]},
    html:h.code('ts', `// Token bucket — one per client key.
class TokenBucket {
  private tokens: number;
  private last = Date.now();
  constructor(private capacity: number, private refillPerSec: number) { this.tokens = capacity; }

  tryRemove(cost = 1): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.refillPerSec);
    this.last = now;
    if (this.tokens >= cost) { this.tokens -= cost; return true; }
    return false; // caller responds 429 with Retry-After ≈ (cost - tokens) / refillPerSec
  }
}

// Sliding window counter — two integers per key.
function slidingAllowed(prevCount: number, currCount: number, elapsedInWindow: number, windowMs: number, limit: number) {
  const estimate = currCount + prevCount * (1 - elapsedInWindow / windowMs);
  return estimate < limit;
}`, 'rate-limiters.ts'),
    deep:`<p><b>Distributed correctness:</b> a read-then-write from many gateway nodes races; use a single atomic operation — a Redis Lua script for token buckets, or <code>INCR</code> + <code>EXPIRE</code> for fixed windows. To avoid a Redis round trip per request at very high scale, keep local buckets and sync periodically (accepting slight over-admission), or shard keys across Redis nodes.</p><p><b>GCRA</b> (generic cell rate algorithm) expresses a token bucket as a single “theoretical arrival time” per key — one value of state (used by libraries such as redis-cell). <b>Fairness and priority:</b> under global overload, shed low-priority traffic first (Module 9’s load shedding) rather than rejecting uniformly. Return limits in headers so clients can self-throttle, and log limited requests for abuse analysis.</p>`,
    },
  tradeoffs:{use:[`<b>Token bucket:</b> APIs that should allow short bursts (the common default)`, `<b>Leaky bucket:</b> protecting a downstream that needs a smooth, constant rate`, `<b>Sliding window counter:</b> accurate per-key limits with tiny memory at scale`], avoid:[`<b>Fixed window</b> when boundary bursts matter (2× spikes)`, `<b>Sliding log</b> with large limits (memory per key)`, `Per-IP limits only, behind carrier-grade NAT`], alt:[`Concurrency limits (max in-flight) instead of rate`, `Adaptive limits based on server health`, `Queues for work that can wait`]},
  real:[
    {co:'Stripe', tier:'confirmed', text:'Described using token-bucket rate limiters implemented in Redis, along with load shedders that prioritise critical traffic during overload.', src:'Stripe Engineering, “Scaling your API with rate limiters” (2017)'},
    {co:'Cloudflare', tier:'confirmed', text:'Built its rate limiting on a sliding-window-counter approximation (current + weighted previous window) to get near-exact results with little memory across a huge number of domains.', src:'Cloudflare blog, “How we built rate limiting capable of scaling to millions of domains” (2017)'},
    {co:'Nginx', tier:'confirmed', text:'The <code>limit_req</code> module implements the leaky bucket method, with an optional <code>burst</code> queue and <code>nodelay</code>.', src:'Nginx documentation — ngx_http_limit_req_module'}
  ],
  mistakes:[`Non-atomic check-then-set in Redis`, `Global limits that let one tenant starve others`, `Not telling clients the limit (no headers)`, `Rate limiting after the expensive work instead of before`],
  interview:[`Name two algorithms and their burst behaviour; justify your choice`, `Explain distributed counters and what happens if Redis is down (fail open vs closed)`],
  tryit:{note:'All five algorithms side by side on the same traffic. Try the “window-edge burst” pattern.', pg:'rate-limiter'},
  sources:[`Stripe Engineering (2017)`, `Cloudflare blog (2017)`, `Nginx limit_req docs`]
},
{
  id:'ddos-basics', title:'DDoS basics', minutes:8, tags:['DDoS','amplification','SYN flood','WAF','scrubbing'],
  summary:'Volumetric floods, protocol attacks and application-layer floods — and why defence happens at the edge, not on your servers.',
  problem:`<p>Minutes after a big promotion goes live, traffic jumps 400× — but it isn’t customers. A botnet floods your login API, while a reflection attack bounces amplified DNS and NTP responses at your IPs, saturating your 10 Gbps link before a single packet reaches your servers.</p>`,
  intuition:`A shop flooded by thousands of fake customers who never buy anything. You need a bouncer at the street corner (edge scrubbing), a far bigger entrance than any crowd (huge distributed capacity), and rules that spot fakes (rate limits, challenges) — all while still letting real customers in.`,
  how:{
    steps:[`<b>Volumetric</b> attacks fill your pipe: UDP floods and <b>reflection/amplification</b> (spoofed small requests to open servers that send big responses to you).`, `<b>Protocol</b> attacks exhaust state: SYN floods fill half-open connection tables; fragmented packets stress firewalls.`, `<b>Application-layer (L7)</b> attacks send valid-looking HTTP requests to expensive endpoints (search, login).`, `Defences: anycast edge networks with massive capacity, scrubbing centres, SYN cookies, WAF rules, bot challenges, per-key rate limits, caching, and <b>hiding your origin</b> (accept traffic only from the CDN).`, `Autoscaling alone isn’t a defence — it can turn an attack into a huge bill.`],
    diagram:{title:'Absorb at the edge, protect the origin', w:780, h:280, alt:'Attackers and real users reach an anycast edge network that drops attack traffic; only clean traffic reaches the hidden origin.',
      nodes:[{id:'b1', type:'ext', label:'Botnet', x:80, y:60}, {id:'rf', type:'ext', label:'Open reflectors', x:80, y:150, w:130}, {id:'u', type:'client', label:'Real users', x:80, y:240}, {id:'e', type:'cdn', label:'Anycast edge', sub:'scrub + WAF', x:360, y:150, w:150}, {id:'o', type:'service', label:'Origin (hidden IP)', x:650, y:150, w:150}],
      edges:[{from:'b1', to:'e'}, {from:'rf', to:'e'}, {from:'u', to:'e'}, {from:'e', to:'o'}],
      steps:[
        {note:'Reflected UDP floods and botnet HTTP floods converge on your public IPs — which belong to an <b>anycast edge network</b>, so the load is split across hundreds of locations.', flow:[['rf', 'e', 'NTP 468B'], ['rf', 'e', 'NTP'], ['b1', 'e', 'GET /search'], ['b1', 'e', 'POST /login']], parallel:true, status:{e:'hot'}},
        {note:'The edge drops unsolicited UDP outright, answers SYN floods with SYN cookies, and challenges or rate-limits suspicious HTTP clients.', status:{e:'ok'}, hl:['e']},
        {note:'Real users pass through normally; cacheable pages are served from the edge without touching the origin.', flow:[['u', 'e', 'GET /'], ['e', 'u', 'cached']], hl:['u']},
        {note:'Only clean, uncacheable traffic reaches the origin — whose IP is unpublished and firewalled to accept connections only from the edge.', flow:[['u', 'e', 'POST /cart'], ['e', 'o']], hl:['o']}
      ]},
    deep:`<p><b>Amplification:</b> UDP protocols that answer a small spoofed request with a large response let attackers multiply bandwidth: US-CERT alert TA14-017A lists factors such as DNS 28–54×, NTP ~557×, CharGEN ~359×; exposed memcached servers produced amplification above 10,000× in 2018. Network-level source-address validation (BCP 38) stops spoofing at its source but isn’t universally deployed.</p><p><b>L7 asymmetry:</b> the attacker pays one cheap request; you pay a database query. Cache aggressively, require authentication for expensive operations, add cost-based limits, and queue rather than fan out.</p><p><b>Protocol-level surprises:</b> the 2023 HTTP/2 “Rapid Reset” technique (CVE-2023-44487) abused stream cancellation to generate record request rates — Google reported a peak of 398 million requests per second — and required patches in servers and proxies industry-wide.</p>`
  },
  tradeoffs:{use:[`An anycast CDN/DDoS provider in front of anything public`, `Origin IP allow-listing (only the CDN may connect)`, `Rate limits and bot management on expensive endpoints`], avoid:[`Relying on your own servers’ capacity or autoscaling as protection`, `Exposing origin IPs in DNS history, email headers or certificates`], alt:[`Cloud provider DDoS services (e.g. AWS Shield, Google Cloud Armor)`, `Upstream ISP blackholing as a last resort`]},
  real:[
    {co:'GitHub', tier:'confirmed', text:'Was hit in February 2018 by a memcached-amplified attack peaking at about 1.35 Tbps; traffic was routed through its DDoS mitigation provider and the site recovered within minutes.', src:'GitHub Engineering, “February 28th DDoS Incident Report” (2018)'},
    {co:'Dyn', tier:'confirmed', text:'In October 2016 a Mirai botnet of compromised IoT devices attacked DNS provider Dyn, making many major websites unreachable for users who depended on it.', src:'Dyn / Oracle incident analysis (2016)'},
    {co:'Google', tier:'confirmed', text:'Mitigated an HTTP/2 Rapid Reset attack in 2023 that peaked at 398 million requests per second.', src:'Google Cloud blog (October 2023); CVE-2023-44487'}
  ],
  mistakes:[`Publishing the origin IP (attackers bypass the CDN)`, `Expensive unauthenticated endpoints with no limits`, `Autoscaling without spend limits during an attack`, `No runbook — deciding what to do mid-attack`],
  interview:[`Separate volumetric (edge capacity) from L7 (rate limits, WAF, caching) defences`, `Mention hiding the origin behind the CDN`],
  tryit:{note:'How big can a reflection attack get? Compare it with your link — or model an HTTP flood.', mount:host => ddosCalc(host)},
  sources:[`US-CERT alert TA14-017A (UDP-based amplification attacks)`, `GitHub Engineering (2018)`, `Google Cloud blog (2023)`, `BCP 38 (RFC 2827)`]
}
];

SDA.register({
  kind:'module', id:'traffic', order:3, level:'beginner', icon:'🚦', title:'Traffic & Edge',
  summary:'Layer-4 vs layer-7 load balancing, balancing algorithms, health checks and draining, GeoDNS and anycast, CDNs and invalidation, rate limiting algorithms and DDoS defence.',
  outcomes:['Choose L4 vs L7 balancing and the right algorithm for your traffic', 'Configure health checks and draining without causing outages', 'Explain how users reach the nearest region (GeoDNS vs anycast)', 'Design CDN caching with a clear invalidation strategy', 'Implement and compare five rate-limiting algorithms; outline DDoS defences'],
  lessons,
  quiz:[
    {q:'You need to route <code>/api</code> and <code>/static</code> to different server pools. Which balancer?', options:['Layer 4', 'Layer 7', 'DNS round robin', 'Either; paths are visible at L4'], answer:1, why:'Paths are inside HTTP; only an L7 balancer parses them.'},
    {q:'One of four servers is twice as slow. Which algorithm adapts automatically?', options:['Round robin', 'IP hash', 'Least outstanding requests', 'Random'], answer:2, why:'The slow server accumulates in-flight requests, so it receives fewer new ones.'},
    {q:'With mod-N hashing, adding a 5th server to 4 remaps about what share of keys?', options:['~20%', '~25%', '~80%', '0%'], answer:2, why:'Only keys with the same hash mod 4 and mod 5 stay put — roughly 1 in 5. Consistent hashing would move only ~1/5.'},
    {q:'Health check: interval 10 s, threshold 3, timeout 5 s. Worst-case detection time?', options:['~5 s', '~15 s', '~35 s', '~3 min'], answer:2, why:'≈ threshold × interval + timeout = 30 + 5 s.'},
    {q:'Why can deep health checks (which query the shared DB) be dangerous?', options:['They are slow to write', 'A DB blip fails every instance’s check, so the LB ejects the whole fleet', 'They leak passwords', 'They break TLS'], answer:1, why:'Correlated health-check failures turn a partial outage into a total one.'},
    {q:'A POP fails. Which scheme moves users to another POP without any DNS change?', options:['GeoDNS', 'Anycast', 'CNAME flattening', 'Round-robin DNS'], answer:1, why:'The failed POP withdraws its BGP route; packets to the same IP reach the next nearest POP.'},
    {q:'What is the most reliable way to update a cached JS file on a CDN?', options:['Lower max-age to 1 second', 'Purge everything on every deploy', 'Change the file name (content hash) so it has a new cache key', 'Ask users to refresh'], answer:2, why:'A new URL is guaranteed to miss and needs no purge; old pages keep their old, consistent assets.'},
    {q:'Which algorithm can let up to 2× the limit through around a boundary?', options:['Token bucket', 'Sliding window log', 'Fixed window counter', 'Leaky bucket'], answer:2, why:'A burst at the end of one window plus another at the start of the next both pass.'},
    {q:'Which algorithm smooths traffic to a constant output rate?', options:['Token bucket', 'Leaky bucket', 'Fixed window', 'Sliding window counter'], answer:1, why:'Requests drain from the queue at a fixed rate; bursts are delayed or dropped.'},
    {q:'An NTP reflection attack has ~556× amplification. 1 Gbps of spoofed requests becomes about…', options:['1 Gbps', '56 Gbps', '~0.5 Tbps', '5 Tbps'], answer:2, why:'1 Gbps × 556 ≈ 556 Gbps — far beyond any single origin link, hence edge absorption.'},
    {type:'scenario', q:'Your login endpoint is being hammered by a credential-stuffing botnet from 50,000 IPs, each sending a few requests per minute. Per-IP limits don’t trigger. What do you do?', answer:'<ul><li><b>Rate-limit by more than IP:</b> per-username/account attempts (e.g. 5 per 15 minutes), per device fingerprint, per ASN for datacentre ranges.</li><li><b>Challenge suspicious traffic</b> at the edge (bot management, proof-of-work or CAPTCHA after failures); block known-breached-password attempts.</li><li><b>Make the attack expensive and slow:</b> constant-time responses, progressive delays per account, MFA.</li><li><b>Protect capacity:</b> the login path isolated (bulkhead) so the rest of the site keeps working; cache nothing sensitive.</li><li><b>Observe:</b> alert on login failure ratio, not just volume; feed blocked patterns back into WAF rules.</li></ul>'},
    {type:'scenario', q:'Design the edge for a flash sale expected to bring 50× normal traffic at 12:00 noon.', answer:'<ul><li><b>CDN everything cacheable:</b> product pages with short TTL + stale-while-revalidate, images with versioned URLs and long TTLs; request collapsing and an origin shield to avoid stampedes.</li><li><b>Pre-scale</b> L7 proxies and app servers (don’t rely on reactive autoscaling for a step change); pre-warm load balancers with the provider if needed.</li><li><b>Rate limit per user</b> on add-to-cart/checkout; a virtual waiting room in front of checkout to admit users at the rate inventory/payment can handle.</li><li><b>Least-outstanding-requests</b> balancing and outlier detection; strict timeouts; load shedding of non-critical endpoints (recommendations).</li><li><b>DDoS posture:</b> origin only reachable from the CDN; WAF/bot rules ready; runbook and dashboards rehearsed.</li></ul>'}
  ],
  cheatsheet:[
    {h:'⚖️ L4 vs L7', items:['L4: IP:port, per connection, any protocol, fastest', 'L7: HTTP-aware, per request, routing/retries/WAF', 'Stack them: L4 → fleet of L7 proxies', 'gRPC/HTTP-2 → balance per request (L7)']},
    {h:'🎲 Algorithms', items:['Round robin: equal servers, uniform requests', 'Weighted: different machine sizes', 'Least outstanding / P2C: good default', 'IP hash: cheap stickiness, remaps on change', 'Consistent hash: caches/shards, ~1/N moves']},
    {h:'❤️ Health & deploys', items:['Detection ≈ threshold × interval + timeout', 'Passive outlier detection for fast ejection', 'Liveness shallow; readiness = can serve', 'Fail-open / panic threshold safety nets', 'Drain ≥ longest request; graceful SIGTERM']},
    {h:'🌍 Global routing', items:['GeoDNS: per-region IPs; failover waits for TTL', 'Anycast: one IP, BGP picks nearest POP', 'ECS improves GeoDNS accuracy', 'Anycast spreads DDoS across POPs']},
    {h:'📦 CDN', items:['Pull = fill on miss; push = pre-position', 'Cache-Control: max-age, s-maxage, immutable', 'stale-while-revalidate / stale-if-error', 'Versioned URLs > purges > waiting for TTL', 'Origin shield + request collapsing']},
    {h:'🚦 Rate limiting & DDoS', items:['Token bucket: bursts ≤ B, avg r', 'Leaky bucket: constant output', 'Fixed window: 2× boundary burst', 'Sliding counter: curr + prev × overlap', '429 + Retry-After; atomic Redis ops', 'DDoS: absorb at anycast edge, hide origin']}
  ],
  glossary:[
    {term:'Layer 4 load balancer', aka:['L4', 'L4 load balancer'], def:'Balances TCP/UDP connections using IP addresses and ports, without parsing application data.'},
    {term:'Layer 7 load balancer', aka:['L7', 'L7 load balancer'], def:'Terminates HTTP and routes each request by host, path, headers or cookies.'},
    {term:'TLS termination', def:'Decrypting TLS at a proxy or load balancer so it can inspect and route traffic.'},
    {term:'Direct server return', aka:['DSR'], def:'An L4 technique where backends reply to clients directly, bypassing the load balancer.'},
    {term:'Round robin', def:'Load-balancing algorithm that assigns requests to servers in rotation.'},
    {term:'Least connections', aka:['least outstanding requests'], def:'Algorithm that sends each request to the server with the fewest in-flight requests.'},
    {term:'Power of two choices', aka:['P2C'], def:'Pick two servers at random and send to the less loaded one; near-optimal with little coordination.'},
    {term:'IP hash', def:'Routing by a hash of the client IP so a client keeps hitting the same server.'},
    {term:'Consistent hashing', def:'Hashing scheme where adding or removing a node remaps only about 1/N of keys.'},
    {term:'Health check', aka:['health checks'], def:'Periodic probe a load balancer uses to decide whether a backend should receive traffic.'},
    {term:'Outlier detection', def:'Passive health checking that ejects a backend after observing consecutive real errors.'},
    {term:'Readiness probe', aka:['readiness'], def:'Check that a service can accept traffic now; failing removes it from rotation without restarting it.'},
    {term:'Liveness probe', aka:['liveness'], def:'Check that a process is alive; failing causes a restart.'},
    {term:'Connection draining', aka:['draining', 'deregistration delay'], def:'Stopping new requests to an instance while letting in-flight ones finish before shutdown.'},
    {term:'Sticky sessions', aka:['session affinity'], def:'Routing all of a client’s requests to the same backend, usually via a cookie.'},
    {term:'GeoDNS', def:'DNS that returns different answers depending on the querier’s location.'},
    {term:'Anycast', def:'Announcing the same IP prefix from many locations so routing delivers packets to the nearest one.'},
    {term:'BGP', aka:['Border Gateway Protocol'], def:'The protocol networks use to exchange routes on the internet.'},
    {term:'POP', aka:['point of presence', 'edge location'], def:'A data-centre location at the network edge where a CDN or provider serves users.'},
    {term:'CDN', aka:['content delivery network'], def:'A distributed network of edge caches serving content from locations near users.'},
    {term:'Pull CDN', def:'CDN mode where edges fetch content from the origin on the first miss.'},
    {term:'Push CDN', def:'CDN mode where content is uploaded or pre-positioned at edges ahead of demand.'},
    {term:'Cache invalidation', aka:['purge', 'invalidation'], def:'Removing or marking stale cached copies so the next request fetches fresh content.'},
    {term:'Origin shield', def:'A mid-tier cache between edges and the origin that collapses misses.'},
    {term:'Request collapsing', aka:['request coalescing'], def:'Merging simultaneous misses for the same object into one origin fetch.'},
    {term:'Cache hit ratio', aka:['hit ratio', 'hit rate'], def:'Fraction of requests (or bytes) served from cache.'},
    {term:'Rate limiting', aka:['rate limiter', 'rate limiters'], def:'Restricting how many requests a client may make in a period.'},
    {term:'Token bucket', def:'Rate limiter that refills tokens at a fixed rate up to a capacity; each request spends a token.'},
    {term:'Leaky bucket', def:'Rate limiter that queues requests and processes them at a constant rate, dropping overflow.'},
    {term:'Fixed window', aka:['fixed window counter'], def:'Rate limiter counting requests per clock-aligned window; allows boundary bursts.'},
    {term:'Sliding window', aka:['sliding window log', 'sliding window counter'], def:'Rate limiters that consider the last full window from now, either exactly (log) or approximately (counter).'},
    {term:'DDoS', aka:['distributed denial of service'], def:'An attack using many sources to exhaust a target’s bandwidth, connection state or compute.'},
    {term:'Amplification attack', aka:['reflection attack', 'amplification'], def:'Spoofed small requests to third-party servers that send much larger responses to the victim.'},
    {term:'SYN flood', def:'Attack sending many TCP SYNs to exhaust a server’s half-open connection table.'},
    {term:'SYN cookies', def:'Technique encoding connection state in the SYN-ACK so servers need no memory until the handshake completes.'},
    {term:'WAF', aka:['web application firewall'], def:'Web Application Firewall: filters HTTP requests using rules against attacks and abuse.'}
  ],
  sources:['Eisenbud et al., “Maglev”, NSDI 2016', 'Mitzenmacher, “The Power of Two Choices” (2001)', 'Nginx, Envoy, AWS ELB, Kubernetes and Route 53 documentation', 'RFC 9111, RFC 5861, RFC 4786, RFC 7871', 'Stripe (2017) and Cloudflare (2017) rate-limiting posts', 'US-CERT TA14-017A; GitHub (2018); Google Cloud (2023)']
});
} catch(e){ console.error('[SDA] Module "traffic" failed to load', e); window.SDA && SDA.errors.push({id:'traffic', error:e}); }
})();
