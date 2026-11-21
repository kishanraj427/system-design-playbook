
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
    if (scheme === 'geodns'){ const pre = best(false); if (!alive[pre]){ const nx = best(true); return [nx, rtts[nx], `Some saved answers still point to Singapore for up to about ${ttl} seconds plus check time. After they expire, fans can reach ${POPS[nx]}.`, true]; } return [pre, rtts[pre], 'The resolver location helps choose a regional address.']; }
    const b = best(true); return [b, rtts[b], down && best(false) !== b ? `Singapore withdrew its route. The same IP can now reach ${POPS[b]} without a DNS change.` : 'The same IP is announced in several places. Network routing chooses a path.'];
  }
  function render(){
    out.innerHTML = '';
    const rows = Object.keys(USERS).map(c => { const [i, r, note, gap] = route(c); return [`<b>${c}</b>`, i < 0 ? '<span style="color:var(--bad)">✗ none</span>' : POPS[i], i < 0 ? 'none' : r + ' ms', (gap ? '<span style="color:var(--warn)">⚠ </span>' : '') + note]; });
    out.append(frag(h.table(['User city', 'Served by', 'RTT', 'What happens'], rows, [2])));
    out.append(el('p', {class:'lab-hint'}, 'Round-trip times are illustrative orders of magnitude, not measurements.'));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.select({label:'Routing scheme', value:'anycast', options:[['unicast', 'One region (unicast IP)'], ['geodns', 'GeoDNS: different IP per region'], ['anycast', 'Anycast: same IP from every POP']], onChange:v => { scheme = v; render(); }}).el, ui.slider({label:'DNS TTL (GeoDNS)', min:10, max:600, step:10, value:60, fmt:v => v + ' s', onInput:v => { ttl = v; render(); }}).el), el('div', {style:{marginTop:'10px'}}, ui.toggle({label:'💥 Singapore POP goes down', checked:false, onChange:v => { down = v; render(); }}).el), out);
  render();
}
function ddosCalc(host){
  const V = {dns:[50, 'DNS response'], ntp:[556, 'NTP response'], ssdp:[31, 'Device discovery response'], chargen:[359, 'Character generator response'], memcached:[10000, 'Very large UDP response'], http:[1, 'HTTP requests from bots']};
  const P = {v:'ntp', up:1000, link:10, bots:20000, rpsBot:20, cap:50000};
  const out = el('div', {style:{marginTop:'12px'}});
  function calc(){
    out.innerHTML = '';
    if (P.v === 'http'){
      const rps = P.bots * P.rpsBot; const ok = rps < P.cap;
      out.append(frag(`${h.math(`attack = ${fmtNum(P.bots)} bots × ${P.rpsBot} requests/s = ${fmtNum(rps)} requests/s  compared with app capacity ${fmtNum(P.cap)} requests/s`)}<div class="verdict ${ok ? 'warn' : 'bad'}">${ok ? 'The app has room in this model, but every seat check still uses work.' : `The bots send about ${(rps / P.cap).toFixed(1)} times the app capacity. Check requests at the edge before they reach the seat service.`}</div>`));
      return;
    }
    const [f] = V[P.v]; const gbps = P.up / 1000 * f; const ok = gbps < P.link;
    out.append(frag(`${h.math(`reflected traffic = forged requests ${fmtNum(P.up)} Mbps × response factor about ${fmtNum(f)} = ${gbps >= 1000 ? (gbps / 1000).toFixed(2) + ' Tbps' : gbps.toFixed(1) + ' Gbps'}`)}<div class="verdict ${ok ? 'warn' : 'bad'}">${ok ? 'This link has capacity for this example, but its servers still spend work on unwanted traffic.' : `The traffic is about ${(gbps / P.link).toFixed(0)} times this link’s capacity. A larger upstream edge must absorb it before the ticket app.`}</div>`));
  }
  const sel = ui.select({label:'Attack vector', value:'ntp', options:Object.entries(V).map(([k, [f, n]]) => [k, `${n}${f > 1 ? ' (~' + fmtNum(f) + '×)' : ''}`]), onChange:v => { P.v = v; calc(); }});
  host.append(el('div', {class:'ctl-grid'}, sel.el, ui.slider({label:'Forged request traffic', min:10, max:10000, step:10, value:P.up, fmt:v => fmtNum(v) + ' Mbps', onInput:v => { P.up = v; calc(); }}).el, ui.slider({label:'Ticket site internet link', min:1, max:100, step:1, value:P.link, fmt:v => v + ' Gbps', onInput:v => { P.link = v; calc(); }}).el, ui.slider({label:'Number of bots', min:1000, max:500000, step:1000, value:P.bots, fmt:v => fmtNum(v), onInput:v => { P.bots = v; calc(); }}).el, ui.slider({label:'Seat checks each second per bot', min:1, max:100, step:1, value:P.rpsBot, fmt:v => v, onInput:v => { P.rpsBot = v; calc(); }}).el, ui.slider({label:'Ticket app capacity', min:1000, max:1000000, step:1000, value:P.cap, fmt:v => fmtNum(v) + ' req/s', onInput:v => { P.cap = v; calc(); }}).el), out, el('p', {class:'lab-hint'}, 'These response factors come from historical attacks. They show how a small forged request can lead to much larger traffic. The values are teaching examples.'));
  calc();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'lb-l4-vs-l7', title:'Load balancers: L4 vs L7', minutes:9, tags:['load balancer','L4','L7','TLS termination','Maglev'],
  summary:'A load balancer spreads traffic across servers. L4 chooses where a connection goes using addresses and ports. L7 reads HTTP requests and can route by their paths.',
  problem:`<h3>A small example</h3><p>A concert ticket site opens sales at 10 AM. Browsing events and buying tickets need different server groups.</p><ul><li>GET /events shows concerts.</li><li>POST /checkout buys a seat.</li><li>Many customers keep one connection open.</li></ul><p>Which balancer can send each request to the right group?</p>`,
  intuition:`A mail sorter reads only the address on an envelope. A receptionist opens the letter and sends its message to the right desk. L4 acts like the sorter. L7 acts like the receptionist.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one connection carrying several ticket requests.</p>',
    steps:[
      {icon:'🔌', title:'A connection arrives', text:'The customer opens a network connection. An L4 balancer sees its addresses and ports.'},
      {icon:'↪️', title:'L4 chooses a proxy', text:'L4 sends the connection to one L7 proxy. It does not read /events or /checkout.'},
      {icon:'📨', title:'L7 reads a request', text:'The L7 proxy reads HTTP and sends /events to browsing servers.'},
      {icon:'🎟️', title:'L7 routes another request', text:'The same connection may carry /checkout next. L7 can send that request to checkout servers.'},
      {icon:'🔒', title:'Protected traffic needs a key', text:'To read an HTTPS path, L7 must end the protected TLS connection and handle the request there.'}
    ],
    diagram:{title:'Connection first, requests next', w:800, h:300, alt:'An L4 balancer sends a connection to an L7 proxy. The proxy routes concert browsing and checkout requests by path.',
      nodes:[{id:'c', type:'client', label:'Customers', x:70, y:150}, {id:'l4', type:'lb', label:'L4 balancer', sub:'address + port', x:220, y:150, w:120}, {id:'p1', type:'lb', label:'L7 proxy 1', x:410, y:90}, {id:'p2', type:'lb', label:'L7 proxy 2', x:410, y:210}, {id:'s', type:'service', label:'/events', x:640, y:50, w:130}, {id:'k', type:'service', label:'/checkout', x:640, y:150, w:130}, {id:'cn', type:'service', label:'Preview group', sub:'preview=1', x:640, y:250, w:130}],
      edges:[{from:'c', to:'l4'}, {from:'l4', to:'p1'}, {from:'l4', to:'p2'}, {from:'p1', to:'s'}, {from:'p1', to:'k'}, {from:'p2', to:'k'}, {from:'p2', to:'cn'}],
      steps:[
        {note:'L4 sees a new connection and chooses one L7 proxy.', flow:[['c', 'l4', 'connect'], ['l4', 'p1']], hl:['l4']},
        {note:'L7 reads GET /events and sends it to the browsing servers.', flow:[['c', 'l4', 'GET /events'], ['l4', 'p1'], ['p1', 's']], hl:['p1', 's']},
        {note:'The same connection carries POST /checkout. L7 chooses checkout servers.', flow:[['c', 'l4', 'POST /checkout'], ['l4', 'p1'], ['p1', 'k']], hl:['k']},
        {note:'A preview request carries a marker. L7 can read it and choose the preview group.', flow:[['c', 'l4', 'preview=1'], ['l4', 'p2'], ['p2', 'cn']], hl:['cn']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Mail desk', 'Balancer'], [['Read the envelope address', 'L4 sees addresses and ports.'], ['Read the letter inside', 'L7 sees an HTTP path.']])}</div><div class="callout tip"><b>Important point</b><p>L4 chooses per connection. L7 can choose per HTTP request.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Choice'], [['Spread connections without reading HTTP', 'L4.'], ['Send /events and /checkout to different groups', 'L7.'], ['Use both at a busy front door', 'L4 sends connections to several L7 proxies.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say 10,000 buyers each keep one HTTP/2 connection open and send 20 requests each minute. An L4 balancer sees 10,000 connections. An L7 balancer sees 10,000 × 20 = 200,000 requests each minute. That is 200,000 ÷ 60, about 3,333 requests each second, each one read and routed.</p><h4>How it works inside</h4><p>L4 often picks a server by hashing five values: source address, source port, destination address, destination port and protocol. Every packet of one connection has the same five values. So they all reach the same server.</p><h4>When it goes wrong</h4><p>Connections can last a long time. Say 3 servers each hold 3,000 connections. You add a fourth server. It starts with 0, because the old connections stay where they are. A fair share would be 9,000 ÷ 4 = 2,250. The new server fills only as old connections end and new ones arrive.</p><p>L7 also decrypts and reads every request. That costs processor time. At the busiest moment, watch the L7 proxies for overload.</p>`
  },
  tradeoffs:{use:[`For the ticket site, use L7 when browsing and checkout paths need different server groups.`, `Use L4 to spread many connections across L7 proxies when the front door grows.`], avoid:[`Do not ask L4 to read /checkout inside HTTP.`, `Do not make one L7 proxy the only path to ticket buying.`], alt:[`If the site has one simple server group, start with one suitable balancing layer.`]},
  real:[
    {co:'AWS', tier:'confirmed', text:'AWS documents network and application load balancers with different routing abilities.', src:'AWS Elastic Load Balancing documentation'}
  ],
  mistakes:[`Expecting L4 to send /checkout to one group and /events to another.`, `Forgetting that the L7 proxy also needs a spare path.`],
  interview:[`Explain what L4 can see and what L7 can see.`, `Use /events and /checkout to justify the choice.`],
  tryit:[{quiz:[
    {q:'Which layer can route /checkout separately from /events?', options:['The database', 'L7', 'L4 only', 'Neither'], answer:1, why:'L7 reads the HTTP path.'},
    {q:'What does L4 usually choose for a new connection?', options:['An HTTP path', 'A page color', 'An L7 proxy or backend', 'A ticket seat'], answer:2, why:'L4 uses network addresses and ports to pick where the connection goes.'}
  ]}, {note:'Sort ticket-site routing tasks by what L4 or L7 can see.', mount:host => sortGame(host, [
    {t:'Send /events and /checkout to different server groups', c:'7', why:'The decision needs the HTTP path.'},
    {t:'Spread new TCP connections across two proxies', c:'4', why:'The connection address and port are enough.'},
    {t:'Leave HTTPS protected until it reaches the app server', c:'4', why:'L4 can forward bytes without reading HTTP.'},
    {t:'Send a marked preview request to preview servers', c:'7', why:'L7 reads a request marker.'},
    {t:'Choose a server for UDP voice traffic', c:'4', why:'L4 can handle traffic without HTTP.'}
  ], [{id:'4', label:'L4 can do it'}, {id:'7', label:'Needs L7'}])}],
  sources:[`AWS Elastic Load Balancing documentation`]
},
{
  id:'lb-algorithms', title:'Load-balancing algorithms', minutes:10, tags:['round robin','least connections','IP hash','consistent hashing','power of two choices'],
  summary:'A load-balancing algorithm chooses the next server. Round robin takes turns. Weighted routing favors larger servers. Least outstanding requests watches current work.',
  problem:`<h3>A small example</h3><p>The concert site has three ticket servers. Server C is older and handles requests more slowly.</p><ul><li>Server A is fast.</li><li>Server B is fast.</li><li>Server C stays busy longer.</li></ul><p>Should each server receive the same number of new ticket requests?</p>`,
  intuition:`At a ticket counter, a guide can send people to desks in rotation. Or the guide can look for a desk with the shortest active line. The second choice notices a slow desk.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Compare two ways to send ticket requests to A, B, and C.</p>',
    steps:[
      {icon:'🔄', title:'Take turns', text:'Round robin sends one request to A, then B, then C, and repeats.'},
      {icon:'⌛', title:'Watch C fall behind', text:'C takes longer to finish. Equal request counts leave more work waiting there.'},
      {icon:'📊', title:'Check active work', text:'Least outstanding requests chooses the server handling the fewest requests now.'},
      {icon:'⚖️', title:'Use weights if needed', text:'If C is known to be half as capable, a weighted rule can send it fewer new requests.'},
      {icon:'🎲', title:'Sample two choices', text:'Another rule checks two random servers and chooses the less busy one. It needs less shared information.'}
    ],
    diagram:{title:'One slow ticket server', w:760, h:290, alt:'Round robin sends equal ticket request counts to three servers. Server C falls behind, while a work-aware choice favors A and B.',
      nodes:[{id:'c', type:'client', label:'Ticket buyers', x:70, y:145}, {id:'lb', type:'lb', label:'Load balancer', x:250, y:145}, {id:'a', type:'service', label:'Server A', sub:'fast', x:500, y:55}, {id:'b', type:'service', label:'Server B', sub:'fast', x:500, y:145}, {id:'s', type:'service', label:'Server C', sub:'slow', x:500, y:235}],
      edges:[{from:'c', to:'lb'}, {from:'lb', to:'a'}, {from:'lb', to:'b'}, {from:'lb', to:'s'}],
      steps:[
        {note:'Round robin sends ticket requests to A, B, and C in turn.', flow:[['lb', 'a', '1'], ['lb', 'b', '2'], ['lb', 's', '3']], dur:500, hl:['lb']},
        {note:'A and B finish quickly. C still gets every third request.', flow:[['lb', 'a', '4'], ['lb', 'b', '5'], ['lb', 's', '6']], dur:500, status:{s:'hot'}, sub:{s:'2 waiting'}},
        {note:'The line at C grows while A and B have room.', flow:[['lb', 's', '9'], ['lb', 's', '12']], status:{s:'hot'}, sub:{s:'4 waiting'}},
        {note:'Least outstanding requests sends more new work to A and B.', status:{s:'ok'}, sub:{s:'1 waiting'}, flow:[['lb', 'a', '13'], ['lb', 'b', '14'], ['lb', 'a', '15']], dur:500, hl:['a', 'b']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Ticket counter guide', 'Balancer rule'], [['Send buyers to desks in order', 'Round robin.'], ['Give the bigger desk more buyers', 'Weighted routing.'], ['Choose the desk with less work', 'Least outstanding requests.']])}</div><div class="callout tip"><b>Important point</b><p>Equal request counts do not mean equal work when servers or requests differ.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Ticket workload', 'Useful rule'], [['Similar servers and requests', 'Round robin.'], ['Known unequal server capacity', 'Weighted routing.'], ['Mixed or slow requests', 'Least outstanding requests.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say A and B each handle 100 requests each second. Older C handles 50. Total capacity is 100 + 100 + 50 = 250. Now 240 requests arrive each second.</p><p>Round robin gives each server 240 ÷ 3 = 80. C can do only 50, so 80 - 50 = 30 extra requests pile up on C every second.</p><p>Weights of 2, 2 and 1 split the traffic in fifths. A gets 96, B gets 96 and C gets 48. All three are under their limits.</p><h4>When it goes wrong</h4><p>A new server has 0 outstanding requests. A least-outstanding rule sends it every new request at once, and it may be overwhelmed. A slow start raises its share step by step. Also, a broken server that returns errors instantly looks idle. It can attract traffic unless health checks remove it.</p><h4>How it works inside</h4><p>Picking two random servers and taking the less busy one works well. It avoids the worst pile-ups far better than a single random pick, and it needs no shared view of every server.</p>`
  },
  tradeoffs:{use:[`For the concert site, round robin works if A, B, and C finish similar requests at similar speeds.`, `Least outstanding requests helps when C stays busy longer.`], avoid:[`Do not keep giving C every third request if its line keeps growing.`, `Do not treat one momentary queue length as proof of future capacity.`], alt:[`Use a lower weight for C if its tested capacity is consistently smaller.`]},
  real:[
    {co:'Nginx', tier:'confirmed', text:'Nginx documents round robin and least-connections choices for groups of servers.', src:'Nginx upstream documentation'},
    {co:'AWS', tier:'confirmed', text:'AWS documents a least-outstanding-requests option for its application load balancer.', src:'AWS Application Load Balancer documentation'}
  ],
  mistakes:[`Choosing round robin for the slow C server without watching its waiting line.`, `Choosing a rule by name instead of measuring completed ticket requests.`],
  interview:[`Compare round robin and least outstanding requests for the old ticket server.`, `Explain when a weight for C would be useful.`],
  tryit:[{quiz:[
    {q:'What does round robin ignore when it sends A, B, C in turn?', options:['The number of servers', 'The ticket URL', 'The existence of requests', 'A server may still be busy'], answer:3, why:'It takes turns without checking whether C has finished earlier work.'},
    {q:'Which rule can avoid a server with many unfinished ticket requests?', options:['Least outstanding requests', 'Equal round robin', 'Always choose C', 'Choose by page color'], answer:0, why:'It checks active work before sending the next request.'}
  ]}, {note:'Make one ticket server slow. Compare round robin with a rule that watches unfinished work.', pg:'load-balancer'}],
  sources:[`Nginx upstream documentation`, `AWS Application Load Balancer documentation`]
},
{
  id:'health-checks-sticky', title:'Health checks, draining and sticky sessions', minutes:9, tags:['health check','readiness','liveness','draining','sticky sessions'],
  summary:'Health checks tell a load balancer which servers can answer. Draining lets a server finish current work before stopping. Sticky sessions keep one buyer on one server.',
  problem:`<h3>A small example</h3><p>One concert ticket server runs out of disk space. It still accepts connections, but checkout requests fail.</p><ul><li>4 ticket servers behind one balancer</li><li>1 server returning errors</li><li>An organizer uploading a large event poster during a deploy</li></ul><p>How should the balancer stop new work without cutting off work already in progress?</p>`,
  intuition:`A counter supervisor checks who can serve the next buyer. A worker ending a shift stops taking new buyers but finishes the person already at the counter. Sending every buyer to the same worker can help memory, but it creates a problem when that worker leaves.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Watch one failed server and one planned restart.</p>',
    steps:[
      {icon:'❤️', title:'Check each server', text:'The balancer asks each server whether it can take a ticket request now.'},
      {icon:'⚠️', title:'Notice repeated failures', text:'After several failed checks, the balancer stops sending new buyers to that server.'},
      {icon:'👀', title:'Watch real requests too', text:'Errors from actual checkout requests can reveal a bad server between scheduled checks.'},
      {icon:'⏳', title:'Drain before a restart', text:'A server stops taking new requests but lets an organizer’s poster upload finish.'},
      {icon:'🔖', title:'Understand stickiness', text:'A sticky session sends one buyer back to the same server. That buyer can lose their place if it stops.'}
    ],
    diagram:{title:'Detect a failure, then drain a server', w:760, h:270, alt:'A balancer checks ticket servers. It stops using a failing server and lets another finish an upload before restarting.',
      nodes:[{id:'lb', type:'lb', label:'Ticket balancer', x:150, y:135}, {id:'a', type:'service', label:'Server A', x:470, y:50}, {id:'b', type:'service', label:'Server B', x:470, y:135}, {id:'c', type:'service', label:'Server C', x:470, y:220}, {id:'u', type:'client', label:'Buyers', x:150, y:240, w:100}],
      edges:[{from:'u', to:'lb'}, {from:'lb', to:'a'}, {from:'lb', to:'b'}, {from:'lb', to:'c'}],
      steps:[
        {note:'The balancer asks each ticket server whether it can answer.', flow:[['lb', 'a', 'ready?'], ['lb', 'b', 'ready?'], ['lb', 'c', 'ready?']], parallel:true},
        {note:'B starts returning errors after its disk fills.', status:{b:'hot'}, flow:[['lb', 'b', 'ready?'], ['b', 'lb', 'error']], hl:['b']},
        {note:'Repeated failures remove B from new ticket requests.', status:{b:'down'}, flow:[['u', 'lb', 'ticket?'], ['lb', 'a'], ['u', 'lb', 'ticket?'], ['lb', 'c']]},
        {note:'A is due for a restart. It finishes its current upload before stopping.', status:{a:'hot'}, sub:{a:'draining'}, flow:[['u', 'lb', 'ticket?'], ['lb', 'c']]},
        {note:'A returns after it can answer new requests again.', status:{a:'ok'}, sub:{a:'ready'}, flow:[['lb', 'a', 'ready?'], ['a', 'lb', 'yes']], hl:['a']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Ticket counter', 'Server check'], [['Can this worker serve the next buyer?', 'Readiness check.'], ['Is this worker still running?', 'Liveness check.'], ['Finish the buyer already here', 'Drain before stopping.']])}</div><div class="callout tip"><b>Important point</b><p>Stop new requests to a bad server, but give active work time to finish during a planned restart.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Situation', 'Action'], [['B fails several checks', 'Send new buyers to A and C.'], ['A starts a deploy', 'Drain A before stopping it.'], ['A buyer returns after B stops', 'Shared login data lets another server answer.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say 2,000 requests arrive each second across 4 servers, so each gets 500. Checks run every 5 seconds, a check times out after 2 seconds, and 2 failures remove a server. Worst case, the fault starts just after a good check at second 0. The check at 5 fails at 7. The check at 10 fails at 12. The server is removed at about 12 seconds. 500 × 12 = 6,000 failed requests. Faster checks cut that, but they have a cost.</p><p>Say a healthy server fails one check by chance 1 time in 100. Removing it after 1 failure would happen 1% of checks. Removing it after 2 in a row happens 0.01 × 0.01 = 0.0001, or 0.01%.</p><h4>When it goes wrong</h4><p>Say a poster upload can take up to 60 seconds. Set the drain time above that, such as 120 seconds. After that, the server stops anyway.</p><p>Say 4 sticky servers each hold one fourth of the buyers. If one stops, 25% of buyers lose any cart kept only on it. Keep carts in shared storage. You will learn caches in Module 4.</p>`
  },
  tradeoffs:{use:[`For ticket checkout, check whether each server can answer and watch errors from real requests.`, `Drain a server before a planned restart so an organizer upload can finish.`], avoid:[`Do not keep sending buyers to B just because it accepts a connection.`, `Do not make every health check depend on one shared database.`], alt:[`Keep buyer login information in shared storage when requests may move to another server.`]},
  real:[
    {co:'AWS', tier:'confirmed', text:'AWS load balancers document health checks and a delay that lets current requests finish before a server leaves.', src:'AWS Elastic Load Balancing documentation'}
  ],
  mistakes:[`Checking only that B accepts a connection while checkout still fails.`, `Stopping A before its poster upload finishes.`],
  interview:[`Explain how the balancer decides B is unready.`, `Show why A should finish current work before it restarts.`],
  tryit:[{quiz:[
    {q:'What should the balancer do after B repeatedly fails its readiness check?', options:['Delete every ticket', 'Stop sending B new requests', 'Send B all buyers', 'Turn off A and C'], answer:1, why:'B cannot answer new work reliably.'},
    {q:'What does draining protect during a planned restart?', options:['The site name', 'The ticket price', 'Requests already in progress', 'Only new requests'], answer:2, why:'The server stops taking new work while current work finishes.'}
  ]}, {note:'Change check timing and draining delay. Watch failed requests and whether a long organizer upload is cut off.', mount:host => healthCalc(host)}],
  sources:[`AWS Elastic Load Balancing documentation`]
},
{
  id:'geodns-anycast', title:'GeoDNS and Anycast', minutes:8, tags:['GeoDNS','anycast','BGP','multi-region','POP'],
  summary:'GeoDNS can give different site addresses to people in different places. Anycast uses one address from several places and lets network routing choose a path.',
  problem:`<h3>A small example</h3><p>Fans in Chennai, Jakarta, and London open the same concert ticket site.</p><ul><li>One familiar site name</li><li>Ticket entry points in several cities</li><li>One city may lose its entry point</li></ul><p>How can each fan reach a nearby working entry point?</p>`,
  intuition:`GeoDNS is a directory that gives a caller the number of a nearby branch. Anycast is one phone number announced by several branches. The phone network chooses a reachable branch.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Compare two ways to find an entry point for the ticket site.</p>',
    steps:[
      {icon:'📇', title:'GeoDNS chooses an address', text:'DNS can answer with a different IP address based on the location it sees for the caller.'},
      {icon:'⏳', title:'Saved answers linger', text:'If one entry point fails, a saved DNS answer may keep pointing there until its TTL expires.'},
      {icon:'🌐', title:'Anycast shares an address', text:'Several entry points announce the same IP address. Internet routing chooses a path to one of them.'},
      {icon:'🛠️', title:'A failed point withdraws', text:'If Singapore stops announcing the address, Jakarta traffic can take another route to Mumbai.'},
      {icon:'🎟️', title:'The app still answers', text:'The entry point can pass a ticket request to the ticket app behind it.'}
    ],
    diagram:{title:'One ticket address, several entry points', w:780, h:280, alt:'Fans in three cities use one Anycast address. When Singapore stops announcing it, Jakarta can reach Mumbai.',
      nodes:[{id:'u1', type:'client', label:'Fan, Chennai', x:80, y:60, w:130}, {id:'u2', type:'client', label:'Fan, Jakarta', x:80, y:150, w:130}, {id:'u3', type:'client', label:'Fan, London', x:80, y:240, w:130}, {id:'m', type:'cdn', label:'Entry Mumbai', sub:'203.0.113.1', x:470, y:60, w:150}, {id:'s', type:'cdn', label:'Entry Singapore', sub:'203.0.113.1', x:470, y:150, w:150}, {id:'f', type:'cdn', label:'Entry Frankfurt', sub:'203.0.113.1', x:470, y:240, w:150}, {id:'o', type:'service', label:'Ticket app', x:690, y:150}],
      edges:[{from:'u1', to:'m'}, {from:'u2', to:'s'}, {from:'u3', to:'f'}, {from:'u2', to:'m', dashed:true}, {from:'m', to:'o'}, {from:'s', to:'o'}, {from:'f', to:'o'}],
      steps:[
        {note:'Mumbai, Singapore, and Frankfurt announce the same address.', flow:[['u1', 'm', 'connect'], ['u2', 's', 'connect'], ['u3', 'f', 'connect']], parallel:true},
        {note:'Singapore stops announcing the address after a failure.', status:{s:'down'}, hl:['s']},
        {note:'Jakarta can now reach Mumbai without learning a new address.', flow:[['u2', 'm', 'connect']], hl:['m']},
        {note:'With GeoDNS, a saved Singapore answer may remain until its TTL expires.', status:{s:'down'}, hl:['u2']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Phone network', 'Ticket site'], [['Directory gives a nearby branch number', 'GeoDNS gives an address by location.'], ['One number rings at several branches', 'Anycast announces one address in several places.']])}</div><div class="callout tip"><b>Important point</b><p>GeoDNS changes the answer to a name lookup. Anycast changes the network route to one shared address.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Possible choice'], [['Send fans to a chosen ticket region', 'GeoDNS.'], ['Let fans reach a nearby entry point using one IP', 'Anycast.'], ['Handle an entry point failure', 'Test route change and saved DNS answers.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Light in fiber travels about 200 km each millisecond. Say Chennai to London is about 8,000 km. A round trip is 16,000 km, so at least 16,000 ÷ 200 = 80 ms. Chennai to Singapore is about 3,000 km. Its round trip is 6,000 ÷ 200 = 30 ms. Real routes are longer, so these are minimums.</p><p>Say the GeoDNS TTL is 300 seconds. After a failure, some fans may use a dead address for up to 5 minutes. With a 30-second TTL, that drops to 30 seconds. But there are 300 ÷ 30 = 10 times as many lookups.</p><h4>When it goes wrong</h4><p>Say a route changes while a fan holds a long connection. The packets now reach another entry point. It has no record of that connection, so it may reset it. The fan's app must reconnect.</p><p>GeoDNS often sees the resolver's location, not the fan's. A fan in Chennai who uses a resolver in another country may be sent to a far entry point.</p>`
  },
  tradeoffs:{use:[`For the ticket site, GeoDNS can choose a regional app address for fans in different places.`, `Anycast can give fans one address for several nearby entry points.`], avoid:[`Do not promise Anycast always reaches the physically nearest city.`, `Do not expect an old GeoDNS answer to disappear before its TTL ends.`], alt:[`Use one global entry address that forwards to a chosen ticket region when regional control matters.`]},
  real:[
    {co:'Cloudflare', tier:'confirmed', text:'Cloudflare documents announcing the same addresses from many locations through Anycast.', src:'Cloudflare Anycast documentation'},
    {co:'Amazon Route 53', tier:'confirmed', text:'Route 53 documents location and latency choices for DNS answers.', src:'Amazon Route 53 developer guide'}
  ],
  mistakes:[`Assuming one Anycast address means one physical server.`, `Forgetting saved GeoDNS answers when Singapore stops.`],
  interview:[`Compare how GeoDNS and Anycast choose an entry point.`, `Explain what a Jakarta fan sees when Singapore stops.`],
  tryit:[{quiz:[
    {q:'What does GeoDNS vary by location?', options:['The buyer’s password', 'The ticket price', 'The number of seats', 'The IP address returned for a site name'], answer:3, why:'GeoDNS can answer the same name with different regional addresses.'},
    {q:'What stays the same across Anycast entry points?', options:['The announced IP address', 'Every machine', 'Every travel time', 'Every open connection'], answer:0, why:'Several locations announce the same address.'}
  ]}, {note:'Choose GeoDNS and Anycast, then stop Singapore. Compare the routes and any waiting for saved DNS answers.', mount:host => geoMount(host)}],
  sources:[`RFC 4786`, `Cloudflare Anycast documentation`, `Amazon Route 53 developer guide`]
},
{
  id:'cdn', title:'CDNs: push vs pull, caching and invalidation', minutes:10, tags:['CDN','edge','cache-control','invalidation','origin shield'],
  summary:'A CDN keeps copies of files near readers. A pull CDN gets a copy on the first request, and a push CDN places it early. Updating a wrong copy needs a clear plan.',
  problem:`<h3>A small example</h3><p>The concert ticket site shows an event poster to fans in Delhi and Lucknow. Its original file lives in Mumbai.</p><ul><li>One poster requested by many fans</li><li>Nearby CDN servers in both cities</li><li>A poster that may need a correction</li></ul><p>How do the nearby servers get the poster, and how does the site replace a wrong one?</p>`,
  intuition:`A local shop can order a concert poster when the first fan asks, or receive posters before ticket sales open. If the venue changes, every shop needs the corrected poster.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one poster from Mumbai to nearby fans.</p>',
    steps:[
      {icon:'📍', title:'Reach a nearby edge', text:'The fan’s request reaches a CDN server near their city.'},
      {icon:'📥', title:'Pull on first request', text:'If Delhi lacks the poster, it fetches a copy from the original server in Mumbai.'},
      {icon:'📤', title:'Push before a rush', text:'The site could place the poster at nearby servers before ticket sales open.'},
      {icon:'⚡', title:'Serve later fans locally', text:'The next Delhi fan receives the saved copy without another trip to Mumbai.'},
      {icon:'🔄', title:'Replace a wrong poster', text:'The site can remove old copies or publish a corrected poster at a new file address.'}
    ],
    diagram:{title:'Pulling a concert poster to nearby cities', w:800, h:280, alt:'Delhi fetches a concert poster through a shared shield from Mumbai. Lucknow and later fans use nearby copies.',
      nodes:[{id:'u1', type:'client', label:'Fan, Delhi', x:80, y:70, w:120}, {id:'u2', type:'client', label:'Fan, Lucknow', x:80, y:210, w:130}, {id:'e1', type:'cdn', label:'Edge Delhi', x:300, y:70}, {id:'e2', type:'cdn', label:'Edge Lucknow', x:300, y:210, w:130}, {id:'sh', type:'cache', label:'Shared shield', x:520, y:140}, {id:'o', type:'service', label:'Original Mumbai', x:710, y:140, w:140}],
      edges:[{from:'u1', to:'e1'}, {from:'u2', to:'e2'}, {from:'e1', to:'sh'}, {from:'e2', to:'sh'}, {from:'sh', to:'o'}],
      steps:[
        {note:'Delhi asks first. Its edge fetches the poster through a shared shield from Mumbai.', flow:[['u1', 'e1', 'GET poster'], ['e1', 'sh', 'need copy'], ['sh', 'o', 'need copy'], ['o', 'sh', 'poster'], ['sh', 'e1'], ['e1', 'u1']], hl:['o']},
        {note:'Lucknow asks next. The shared shield already has a copy.', flow:[['u2', 'e2', 'GET poster'], ['e2', 'sh', 'need copy'], ['sh', 'e2', 'poster'], ['e2', 'u2']], hl:['sh']},
        {note:'Later fans receive the poster from their nearby edge.', flow:[['u1', 'e1', 'GET'], ['e1', 'u1', 'poster'], ['u2', 'e2', 'GET'], ['e2', 'u2', 'poster']], hl:['e1', 'e2']},
        {note:'The venue was wrong. Remove the old copies or link the page to a corrected poster file.', hl:['e1', 'e2', 'sh'], status:{e1:'hot', e2:'hot'}}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Local shop', 'CDN'], [['Order a poster after the first request', 'Pull a copy on demand.'], ['Stock posters before opening', 'Push copies before a rush.'], ['Recall a wrong poster', 'Remove the old copy or use a new file address.']])}</div><div class="callout tip"><b>Important point</b><p>Copies reduce repeated trips to Mumbai, but the site must say when a copy is old.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Choice'], [['Normal page files', 'Pull on first request.'], ['Known large release', 'Push before demand.'], ['Correct a poster', 'Update the page link and publish a new file address.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the poster is 500 KB and 100,000 Delhi fans open it in an hour. With no CDN, Mumbai sends 100,000 × 500 KB = 50,000,000 KB, about 50 GB. With a pull CDN, Mumbai sends it once. That is 1 miss and 99,999 hits, a hit ratio of 99.999%.</p><p>Say there are 50 edge servers. Each pulls once, so Mumbai sends 50 copies. With one shield server between them, Mumbai sends 1 copy.</p><h4>When it goes wrong</h4><p>A purge can take from seconds to a few minutes to reach every edge, depending on the provider. For a wrong poster, a new file address such as poster-v2.jpg is safer. Old and new copies then never clash.</p><p>For a file with a new address, a long TTL is safe. One year is 365 × 24 × 3,600 = 31,536,000 seconds.</p><h4>How it works inside</h4><p>You will learn caching in Module 4. For now, know that the file address is the cache key. Some CDNs treat poster.jpg?v=2 as a different file from poster.jpg. Others can be set to ignore the part after the question mark. Check your CDN's setting.</p>`
  },
  tradeoffs:{use:[`For the concert poster, pull is simple when the first request can wait for Mumbai.`, `Push the poster early if the ticket opening time is known and the first-request delay matters.`], avoid:[`Do not share a buyer’s private checkout page as a public CDN copy.`, `Do not replace a poster at the same address and assume every old copy disappears at once.`], alt:[`Use a short TTL for event details that change often, and a new file address for each poster version.`]},
  real:[
    {co:'Netflix Open Connect', tier:'confirmed', text:'Netflix describes placing popular video content near viewers ahead of demand.', src:'Netflix Open Connect documentation'},
    {co:'Fastly', tier:'confirmed', text:'Fastly documents removing content from its edge network before a stored copy would expire.', src:'Fastly purge documentation'}
  ],
  mistakes:[`Serving a private ticket checkout response as one shared public copy.`, `Correcting the poster in Mumbai while old edge copies remain visible.`],
  interview:[`Explain how a first fan gets the poster and how later fans get it.`, `State how the corrected poster reaches every city.`],
  tryit:[{quiz:[
    {q:'What does a pull CDN do on the first poster request at an empty edge?', options:['Wait for a new IP address', 'Fetch a copy from an upstream server', 'Delete the event', 'Change every buyer’s seat'], answer:1, why:'The edge gets a copy when a reader first asks for it.'},
    {q:'What else must change when a corrected poster gets a new file address?', options:['The server clock only', 'The DNS root', 'The page link to that poster', 'The ticket buyer’s name'], answer:2, why:'Fans need a page that points to the corrected file.'}
  ]}, {note:'Compare pull and push for a concert poster. Change TTL and remove an old copy to see when fans receive the update.', pg:'cdn-edge'}],
  sources:[`RFC 9111`, `Netflix Open Connect documentation`, `Fastly purge documentation`]
},
{
  id:'rate-limiting', title:'Rate limiting algorithms', minutes:11, tags:['rate limiting','token bucket','leaky bucket','fixed window','sliding window'],
  summary:'Rate limiting controls how often one caller may send requests. Different algorithms allow short bursts, smooth traffic, or count requests over a time window.',
  problem:`<h3>A small example</h3><p>Ticket sales open at 10 AM. Real buyers check a few seats quickly, while one script sends thousands of checks.</p><ul><li>A buyer may check several seats at once.</li><li>The script sends 5,000 checks each second.</li><li>The seat service has limited capacity.</li></ul><p>How can the site slow the script without blocking a normal short burst?</p>`,
  intuition:`A ticket gate can give each buyer tokens that return over time. Another gate can let people through at a steady pace. A clerk can also count entries during the last minute.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Give each buyer a separate allowance before a request reaches the seat service.</p>',
    steps:[
      {icon:'🪙', title:'Save tokens for a burst', text:'A token bucket gives a caller tokens that refill over time. Each seat check spends one.'},
      {icon:'🚰', title:'Release work steadily', text:'A leaky bucket waits in a short line and passes requests through at a steady rate.'},
      {icon:'🕒', title:'Count by clock period', text:'A fixed window counts checks in each minute, then resets at the next minute.'},
      {icon:'📏', title:'Look back from now', text:'A sliding window counts checks across the most recent minute, even when the clock minute changes.'},
      {icon:'🚦', title:'Reject excess early', text:'When one caller exceeds its allowance, the gateway returns 429 and a wait time before seat work begins.'}
    ],
    diagram:{title:'Limit one ticket buyer before seat work', w:760, h:250, alt:'A ticket gateway checks separate allowances for a buyer and a busy script. Excess requests get 429 before reaching the seat service.',
      nodes:[{id:'c1', type:'client', label:'Ticket buyer', x:80, y:70, w:120}, {id:'c2', type:'client', label:'Busy script', x:80, y:180, w:120}, {id:'gw', type:'lb', label:'Ticket gateway', x:320, y:125, w:150}, {id:'r', type:'cache', label:'Allowances', x:320, y:225, w:130, h:40}, {id:'s', type:'service', label:'Seat service', x:600, y:125}],
      edges:[{from:'c1', to:'gw'}, {from:'c2', to:'gw'}, {from:'gw', to:'r'}, {from:'gw', to:'s'}],
      steps:[
        {note:'The buyer has tokens, so one seat check reaches the service.', flow:[['c1', 'gw', 'check seat'], ['gw', 'r', 'token?'], ['r', 'gw', 'yes'], ['gw', 's']], hl:['gw']},
        {note:'The script sends many checks and spends its own tokens.', flow:[['c2', 'gw', 'check'], ['c2', 'gw', 'check'], ['c2', 'gw', 'check']], parallel:true, status:{c2:'hot'}},
        {note:'The script runs out. Extra checks receive 429 before seat work starts.', flow:[['gw', 'r', 'token?'], ['r', 'gw', 'empty'], ['gw', 'c2', '429']], hl:['c2']},
        {note:'The buyer has a separate allowance and can still check a seat.', flow:[['c1', 'gw', 'check'], ['gw', 's']], status:{c2:'ok'}, hl:['c1', 's']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Ticket gate', 'Algorithm'], [['Keep a few entry tokens ready', 'Token bucket allows a short burst.'], ['Let a short line move at one pace', 'Leaky bucket smooths arrivals.'], ['Count entry during each clock minute', 'Fixed window.'], ['Count entry during the last minute', 'Sliding window.']])}</div><div class="callout tip"><b>Important point</b><p>Apply the allowance before a costly seat check, and keep one caller from using everyone’s share.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Choice'], [['Normal buyers make short bursts', 'Token bucket.'], ['Seat service needs a steady pace', 'Leaky bucket.'], ['A clear limit over any recent minute', 'Sliding window.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say a token bucket holds 10 tokens and refills 2 each second. A buyer checks 6 seats at once, and 4 tokens remain. After 3 seconds, 3 × 2 = 6 more tokens return, but the bucket stops at 10.</p><p>The script sends 5,000 checks each second. In the first 10 seconds it sends 50,000. It passes 10 + 2 × 10 = 30. That is 30 ÷ 50,000 = 0.06%.</p><p>A sliding counter limit is 100 each minute. Say the last minute had 80 and this minute has 30 so far, 15 seconds in. Last minute still covers 45 of the 60 seconds, so 80 × 0.75 = 60. The estimate is 60 + 30 = 90. Up to 10 more requests are allowed.</p><h4>How it works inside</h4><p>A sliding log stores each time. Say 100 times at 8 bytes each is 800 bytes per buyer. For 1,000,000 buyers, that is 800 MB. A counter needs only a few numbers per buyer.</p><h4>When it goes wrong</h4><p>Limiting by IP address can punish a whole office that shares one. Limit by account or key when you can.</p>`
    },
  tradeoffs:{use:[`For ticket seat checks, token bucket lets a real buyer check several seats quickly.`, `Use a sliding window if checks near a clock-minute boundary must count together.`], avoid:[`Do not use one shared allowance for all buyers and let a script consume it.`, `Do not rely on fixed windows if a two-minute-boundary burst can hurt the seat service.`], alt:[`If the seat service needs a steady flow, let requests pass through a small leaky-bucket waiting line.`]},
  real:[
    {co:'Stripe', tier:'confirmed', text:'Stripe Engineering describes using token-bucket rules to protect its API.', src:'Stripe Engineering, Scaling your API with rate limiters (2017)'},
    {co:'Cloudflare', tier:'confirmed', text:'Cloudflare describes a sliding-window counter that tracks recent requests with little stored data.', src:'Cloudflare blog, How we built rate limiting (2017)'}
  ],
  mistakes:[`Counting requests only after the seat service has done the costly work.`, `Giving the busy script and every buyer one shared allowance.`],
  interview:[`Compare token bucket and fixed window for a buyer’s short burst.`, `Explain why a sliding window counts checks across a clock-minute boundary.`],
  tryit:[{quiz:[
    {q:'Which rule lets a buyer save a few tokens for a quick burst?', options:['Fixed window only', 'Always reject', 'Random server choice', 'Token bucket'], answer:3, why:'Tokens accumulate up to a limit and each request spends one.'},
    {q:'Why can a fixed window allow a sharp boundary burst?', options:['Its count resets at the clock boundary', 'It checks every past request forever', 'It has no clock', 'It removes the gateway'], answer:0, why:'A caller can use one window’s allowance just before reset and another just after.'}
  ]}, {note:'Try the window-boundary burst in the limiter playground, then compare the other algorithms on the same requests.', pg:'rate-limiter'}],
  sources:[`Stripe Engineering (2017)`, `Cloudflare blog (2017)`]
},
{
  id:'ddos-basics', title:'DDoS basics', minutes:8, tags:['DDoS','amplification','SYN flood','WAF','scrubbing'],
  summary:'A DDoS attack uses many sources to overwhelm a service. It may fill the network link or send costly requests. Protection starts before traffic reaches the ticket servers.',
  problem:`<h3>A small example</h3><p>Concert tickets open at 10 AM. Real buyers arrive, but thousands of automated machines also send seat checks.</p><ul><li>Real ticket buyers need the site.</li><li>Attackers send far more traffic than normal.</li><li>The ticket servers and internet link have limits.</li></ul><p>How can the site protect buyers while dropping harmful traffic?</p>`,
  intuition:`A venue entrance can be blocked by a fake crowd. Guards need room to handle the crowd outside and a way to let real ticket holders through.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow attack traffic and real buyers toward the ticket app.</p>',
    steps:[
      {icon:'🤖', title:'Many sources send traffic', text:'A distributed denial of service attack, or DDoS, uses many machines to send unwanted traffic.'},
      {icon:'🌊', title:'One attack fills the link', text:'A large flood can fill the site’s internet connection before ticket servers see the packets.'},
      {icon:'🎟️', title:'Another attack costs work', text:'Many valid-looking /seats requests can force the app to do expensive work repeatedly.'},
      {icon:'🛡️', title:'Filter at the edge', text:'A large network in front of the app absorbs traffic and applies rules to suspicious requests.'},
      {icon:'✅', title:'Pass buyers through', text:'The edge sends allowed requests to the ticket app. The site watches for real buyers blocked by mistake.'}
    ],
    diagram:{title:'Protect ticket servers at the edge', w:780, h:280, alt:'Bots, reflected traffic, and real buyers reach a large edge network. It filters traffic before the ticket app.',
      nodes:[{id:'b1', type:'ext', label:'Bot machines', x:80, y:60}, {id:'rf', type:'ext', label:'Reflected traffic', x:80, y:150, w:130}, {id:'u', type:'client', label:'Real buyers', x:80, y:240}, {id:'e', type:'cdn', label:'Large edge', sub:'filter traffic', x:360, y:150, w:150}, {id:'o', type:'service', label:'Ticket app', x:650, y:150, w:150}],
      edges:[{from:'b1', to:'e'}, {from:'rf', to:'e'}, {from:'u', to:'e'}, {from:'e', to:'o'}],
      steps:[
        {note:'Bots and reflected traffic arrive along with real ticket buyers.', flow:[['rf', 'e', 'flood'], ['rf', 'e', 'flood'], ['b1', 'e', 'GET /seats'], ['b1', 'e', 'GET /seats']], parallel:true, status:{e:'hot'}},
        {note:'The edge absorbs a large flood and checks suspicious seat requests.', status:{e:'ok'}, hl:['e']},
        {note:'A real buyer can still receive the public event page from the edge.', flow:[['u', 'e', 'GET /events'], ['e', 'u', 'page']], hl:['u']},
        {note:'Allowed checkout requests pass to the ticket app.', flow:[['u', 'e', 'POST /checkout'], ['e', 'o']], hl:['o']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Venue entrance', 'Ticket site'], [['Crowd blocks the street', 'A flood fills the network link.'], ['Fake buyers ask for seats', 'Automated requests use app work.'], ['Guards work outside', 'The edge filters before the ticket app.']])}</div><div class="callout tip"><b>Important point</b><p>Protect the path before the ticket servers. More ticket servers cannot clear a network link that is already full.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Attack pressure', 'First defense'], [['Too much network traffic', 'Absorb it on a larger upstream edge.'], ['Too many costly seat checks', 'Apply request rules and per-caller limits early.'], ['Real buyers blocked too', 'Review rules and measure false blocks.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say a seat check takes 20 ms of processor time. One core handles 1,000 ÷ 20 = 50 each second. Say bots send 400,000 each second. That needs 400,000 ÷ 50 = 8,000 cores. Adding servers is far more costly than rejecting bad requests early.</p><p>A SYN flood uses the first step of a TCP connection. The attacker sends many setup requests with fake sources. Say the server can hold 100,000 half-open connections and gets 50,000 each second. The table is full in 100,000 ÷ 50,000 = 2 seconds. SYN cookies let the server remember nothing until the buyer answers.</p><h4>When it goes wrong</h4><p>A per-address limit may not catch bots that each send little. Say the limit is 30 checks each second per address. 20,000 bots each sending 20 stay under it, yet they still total 400,000.</p><p>A real sale also looks like an attack. If a filter wrongly blocks 0.1% of 500,000 real buyers, that is 500 buyers. Measure it.</p>`
  },
  tradeoffs:{use:[`For the concert site, place a large filtering edge before the ticket app.`, `Apply per-caller limits to costly seat checks while keeping the event page available.`], avoid:[`Do not rely on extra app servers to fix a full internet link.`, `Do not block every buyer from one network just because a bot used it.`], alt:[`A provider that already has a large edge network can absorb traffic before it reaches the site’s link.`]},
  real:[
    {co:'GitHub', tier:'confirmed', text:'GitHub reported routing a large 2018 attack through a mitigation provider to absorb the traffic.', src:'GitHub Engineering, February 28th DDoS Incident Report (2018)'}
  ],
  mistakes:[`Adding only app servers while the attack fills the site’s link.`, `Blocking suspicious traffic without checking how many real buyers are affected.`],
  interview:[`Separate a link-filling flood from costly /seats requests.`, `Explain which defense belongs at the edge and what reaches the ticket app.`],
  tryit:[{quiz:[
    {q:'Why can extra ticket servers fail to help during a large network flood?', options:['Every fan uses UDP', 'The internet link fills before traffic reaches them', 'Tickets have no IDs', 'The CDN cannot show a poster'], answer:1, why:'Servers cannot process packets that never pass the full link.'},
    {q:'What should the site measure while filtering a DDoS attack?', options:['Only server names', 'Only the clock time', 'Attack traffic and blocked real buyers', 'Only the number of posters'], answer:2, why:'A rule can reduce attack traffic and still block legitimate buyers.'}
  ]}, {note:'Compare a reflected traffic flood with the site’s link capacity, then try the costly HTTP request scenario.', mount:host => ddosCalc(host)}],
  sources:[`US-CERT alert TA14-017A`, `GitHub Engineering, February 28th DDoS Incident Report (2018)`]
}
];

SDA.register({
  kind:'module', id:'traffic', order:3, level:'beginner', icon:'🚦', title:'Traffic & Edge',
  summary:'Follow concert buyers from the site entrance to ticket servers. Learn how to spread traffic, use nearby file copies, limit costly work, and handle attacks.',
  outcomes:['Explain what L4 and L7 can see when they route a ticket request', 'Choose a balancing rule for unequal ticket servers', 'Stop new work on a failed server and drain one during a deploy', 'Compare GeoDNS, Anycast, and a CDN for fans in different cities', 'Limit seat checks and protect the ticket site during an attack'],
  lessons,
  quiz:[
    {q:'Which layer can send /events and /checkout to different server groups?', options:['L4', 'L7', 'The database', 'The customer phone'], answer:1, why:'L7 can read the HTTP path in each request.'},
    {q:'Server C stays busy longer than A and B. Which rule watches unfinished work?', options:['Always choose C', 'Equal round robin', 'Least outstanding requests', 'Choose by buyer name'], answer:2, why:'It favors servers with fewer current requests.'},
    {q:'What should happen after ticket server B repeatedly fails readiness checks?', options:['Stop all buyers', 'Delete every event', 'Send every request to B', 'Stop sending B new work'], answer:3, why:'The balancer should use servers that can answer new requests.'},
    {q:'What does draining let server A do during a planned restart?', options:['Forget current uploads', 'Take every new buyer', 'Change the event date', 'Finish current work before stopping'], answer:3, why:'A stops taking new requests while its active work finishes.'},
    {q:'Which scheme announces one IP address from several entry locations?', options:['GeoDNS', 'Anycast', 'One database', 'A fixed window'], answer:1, why:'Anycast lets network routing choose a path to one shared address.'},
    {q:'How does a pull CDN get the poster at an empty Delhi edge?', options:['It waits for every fan to leave', 'It changes the ticket price', 'It fetches a copy on the first request', 'It asks the buyer to upload it'], answer:2, why:'Pull fills the nearby edge when a fan first asks for the file.'},
    {q:'What must the event page do after a corrected poster gets a new file address?', options:['Link to the new file', 'Keep linking to the old file', 'Change the fan’s phone', 'Remove the ticket servers'], answer:0, why:'A new poster address helps only when the page points to it.'},
    {q:'Which rule lets a buyer save tokens for a short seat-check burst?', options:['Always reject', 'Round robin', 'GeoDNS', 'Token bucket'], answer:3, why:'A token bucket refills up to a limit, then each check spends one token.'},
    {q:'Why can a fixed window allow a sharp burst around 11:00?', options:['It never counts requests', 'Its count resets at the clock boundary', 'It uses another IP address', 'It removes the balancer'], answer:1, why:'One allowance can be used just before reset and another just after.'},
    {q:'Why can extra ticket servers fail to help during a large DDoS flood?', options:['They cannot sell concerts', 'They use the wrong algorithm', 'The internet link fills before traffic reaches them', 'The poster is too small'], answer:2, why:'More servers cannot process packets that cannot pass the full link.'},
    {type:'scenario', q:'At 10 AM, ticket buyers arrive and server C slows down. What should the team check first?', answer:'<ol><li>Measure how many ticket requests reach each server and how long they wait.</li><li>Check whether C is failing health checks or simply working more slowly.</li><li>If C has more unfinished work, compare least outstanding requests with equal round robin.</li><li>Check that A and B have enough spare capacity before sending them more buyers.</li></ol>'},
    {type:'scenario', q:'The concert poster has the wrong venue while automated seat checks hit the site. What should the team do?', answer:'<ol><li>Publish a corrected poster at a new file address and update the event page link.</li><li>Keep public event pages available from nearby CDN servers.</li><li>Limit costly seat checks per caller before they reach the ticket app.</li><li>Watch whether filtering also blocks real buyers.</li></ol>'}
  ],
  cheatsheet:[
    {h:'⚖️ Route ticket requests', items:['L4 chooses where a connection goes using addresses and ports.', 'L7 reads HTTP paths such as /events and /checkout.', 'Round robin takes turns across servers.', 'Least outstanding requests checks current work.', 'Weighted routing gives a slower server fewer requests.']},
    {h:'❤️ Keep servers ready', items:['A readiness check asks whether a server can take new work.', 'Watch errors from real requests between scheduled checks.', 'Drain a server before a planned restart.', 'Sticky sessions need a plan for a failed server.']},
    {h:'🌍 Reach nearby fans', items:['GeoDNS can return different addresses by location.', 'Saved DNS answers may last until their TTL expires.', 'Anycast announces one address from several places.', 'Anycast routing can change without a new DNS answer.']},
    {h:'📦 Serve concert files', items:['A CDN keeps file copies near fans.', 'Pull gets a poster after the first request.', 'Push places a poster before demand.', 'A corrected poster needs a new file address or removal of old copies.', 'The event page must link to the corrected file.']},
    {h:'🚦 Protect seat checks', items:['Token bucket lets a buyer save a short burst.', 'Leaky bucket passes work at a steady pace.', 'Fixed windows reset at clock boundaries.', 'Sliding windows count the recent span from now.', 'Return 429 with a wait time when one caller exceeds its allowance.']},
    {h:'🛡️ Handle DDoS', items:['Many sources can fill a network link or send costly app requests.', 'Absorb a large flood before it reaches ticket servers.', 'Filter costly requests at the edge.', 'Measure real buyers blocked by mistake.']}
  ],
  glossary:[
    {term:'Load balancer', aka:['load balancers', 'load balancing'], def:'A server in front of your servers that spreads incoming requests across them. Example: 4 ticket servers behind one balancer share the load.'},
    {term:'Layer 4 load balancer', aka:['L4', 'L4 load balancer'], def:'A balancer that picks a server using only IP addresses and ports, without reading the request. Example: it sends a whole connection to server 2 without opening the web request.'},
    {term:'Layer 7 load balancer', aka:['L7', 'L7 load balancer'], def:'A balancer that reads the HTTP request and can pick a server for each request. Example: it sends /seats to one group of servers and /images to another.'},
    {term:'TLS termination', def:'Ending the encrypted TLS connection at the balancer, so it can read the request and pass it on. Example: the balancer decrypts the traffic, then forwards it to the app servers.'},
    {term:'Round robin', def:'Sending requests to servers one after another in a repeating order. Example: server 1, 2, 3, then 1, 2, 3 again.'},
    {term:'Weighted routing', def:'Giving a stronger server a bigger share of requests. Example: a server with weight 3 gets three times as many requests as a server with weight 1.'},
    {term:'Least outstanding requests', aka:['least connections'], def:'Sending new work to the server with the fewest unfinished requests. Example: server A has 2 requests in progress and server B has 9, so the next request goes to A.'},
    {term:'Power of two choices', aka:['P2C'], def:'Pick two servers at random and send the request to the less busy one. Example: it picks B and D, sees that B has 3 requests and D has 8, and chooses B.'},
    {term:'IP hash', def:'Using the client’s IP address to always pick the same server for that client. Example: the same user keeps reaching server 2.'},
    {term:'Health check', aka:['health checks'], def:'A regular test that decides whether a server should get new requests. Example: the balancer calls /health every 5 seconds and removes a server that fails.'},
    {term:'Outlier detection', def:'Spotting a server that keeps returning errors for real requests and sending it no new work. Example: after 5 errors in a row, the balancer pauses that server for 30 seconds.'},
    {term:'Readiness', aka:['readiness check', 'readiness probe', 'readiness probes'], def:'Whether a server is ready to take a new request right now. In Kubernetes this test is called a readiness probe. Example: a server that is still loading data is alive but not ready.'},
    {term:'Liveness', aka:['liveness check'], def:'Whether a server process is still running. Example: a frozen process fails the liveness check and gets restarted.'},
    {term:'Connection draining', aka:['draining'], def:'Letting current requests finish before a server shuts down, while sending it no new ones. Example: a server being updated finishes its 20 open requests first.'},
    {term:'Sticky sessions', aka:['session affinity'], def:'Sending the same client back to the same server each time. Example: a cart kept in one server’s memory needs the shopper to return to that server.'},
    {term:'GeoDNS', def:'DNS that gives different answers depending on where the asker is. Example: a user in Delhi gets the Mumbai server’s address, and a user in London gets the London one.'},
    {term:'Anycast', def:'Announcing the same IP address from many places, so the network sends each user to a nearby one. Example: 8.8.8.8 is answered by a nearby copy of Google’s DNS.'},
    {term:'BGP', aka:['Border Gateway Protocol'], def:'The system networks use to tell each other which IP addresses they can reach. Example: a network announces “send traffic for this address to me”.'},
    {term:'POP', aka:['point of presence', 'POPs'], def:'Point of presence: a place near users where a network keeps equipment. Example: a CDN has a POP in Delhi.'},
    {term:'CDN', aka:['content delivery network', 'CDNs'], def:'Content delivery network: servers around the world that keep copies of files near readers. Example: a poster file is served from a nearby city instead of the home server.'},
    {term:'Edge server', aka:['edge servers', 'edge location'], def:'A CDN server close to readers. Example: the server in Delhi that answers Delhi fans.'},
    {term:'Pull CDN', aka:['pull CDNs'], def:'A CDN that fetches a file from your server the first time someone asks, then keeps the copy. Example: the first Delhi fan waits a little, and later fans get the saved copy.'},
    {term:'Push CDN', aka:['push CDNs'], def:'A CDN where you upload files in advance, before anyone asks. Example: upload tomorrow’s ticket-sale poster to every city tonight.'},
    {term:'CDN invalidation', aka:['purge', 'purges'], def:'Removing an old file copy from the CDN so readers get the new version. Example: purge poster.jpg after fixing a typo.'},
    {term:'Origin shield', aka:['origin shields', 'shared shield'], def:'A shared middle copy between nearby CDN servers and your server, so your server gets fewer repeated requests. Example: Delhi and Lucknow both ask the shield, and the shield asks Mumbai once.'},
    {term:'Rate limiting', aka:['rate limiter'], def:'Limiting how often one caller can send requests. Example: allow 10 requests a second per user and reject the rest.'},
    {term:'Token bucket', def:'A bucket that fills with tokens over time. Each request spends one, and a full bucket allows a short burst. Example: 10 tokens per second with a bucket of 20 allows 20 quick requests, then 10 a second.'},
    {term:'Leaky bucket', def:'A short waiting line that lets requests out at a steady speed. Example: a burst waits in line and leaves at 5 requests per second.'},
    {term:'Fixed window', def:'Counting requests in each clock period, such as each minute, then resetting. Example: a limit of 100 per minute starts again at every :00.'},
    {term:'Sliding window', def:'Counting requests over the last period, measured back from right now. Example: a limit of 100 in any 60 seconds, so there is no reset spike.'},
    {term:'DDoS', aka:['distributed denial of service'], def:'Distributed denial of service: an attack where many machines flood a service so real users cannot get in. Example: 20,000 bots each send 20 requests a second.'},
    {term:'Botnet', aka:['botnets', 'bots'], def:'A group of hijacked computers controlled by an attacker. Example: thousands of infected devices send junk requests to a ticket site.'},
    {term:'Reflection attack', aka:['amplification attack'], def:'A trick where small fake requests make other servers send big answers to the victim. Example: a 60-byte request that triggers a 3,000-byte answer gives a 50 times boost.'},
    {term:'WAF', aka:['web application firewall'], def:'Web application firewall: a filter that blocks suspicious web requests using rules. Example: it blocks a request that has SQL commands in its URL.'}
  ],
  sources:['AWS Elastic Load Balancing documentation', 'Nginx upstream documentation', 'Cloudflare Anycast documentation', 'RFC 4786 and RFC 9111', 'Stripe Engineering (2017)', 'Cloudflare blog (2017)', 'US-CERT alert TA14-017A', 'GitHub Engineering (2018)']
});
} catch(e){ console.error('[SDA] Module "traffic" failed to load', e); window.SDA && SDA.errors.push({id:'traffic', error:e}); }
})();
