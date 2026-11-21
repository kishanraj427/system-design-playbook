
/* =====================================================================
   PLAYGROUNDS — Part 1 (Foundations)
   #1 request journey · #21 latency chart · #19 estimation · #20 nines · tail latency
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, esc, clamp, fmtNum, fmtBytes, fmtDur, debounce} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const tmpl = html => { const t = document.createElement('template'); t.innerHTML = html; return t.content; };
const fmtBits = bps => { const u = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps', 'Pbps']; let i = 0, v = bps; while (v >= 1000 && i < u.length - 1){ v /= 1000; i++; } return (v >= 100 ? Math.round(v) : +v.toFixed(1)) + ' ' + u[i]; };
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ---------------- #1 Request journey ---------------- */
try {
SDA.register({kind:'playground', id:'request-journey', module:'foundations', icon:'🌐', title:'Request journey: DNS → TCP → TLS → HTTP',
  summary:'Change the distance, the protocol, the DNS lookup and connection reuse. The page shows every handshake and a timing bar for each step.',
  explain:`<h3>How to use it</h3><ol><li>Click <b>India → US server</b>. The round-trip time jumps to 220 ms. Note the total.</li><li>Turn on <b>Reuse a warm connection</b>. Watch the TCP and TLS bars disappear.</li><li>Switch the protocol from HTTP/1.1 to HTTP/3 and compare the totals.</li></ol><h3>What to notice</h3><ul><li>On a first visit, the handshakes cost more time than your server's own work.</li><li>This is why browsers keep connections open and why DNS answers are cached.</li></ul><div class="callout tip"><b>Important point</b><p>Every handshake costs at least one round trip. A far-away server pays that cost again and again.</p></div><p class="lab-hint">The model ignores packet loss and TCP slow start.</p>`,
  real:[{co:'IETF / Google', tier:'confirmed', text:'TLS 1.3 (RFC 8446) cut the full handshake to one round trip; QUIC (RFC 9000), originally developed at Google, carries HTTP/3 (RFC 9114) and combines the transport and TLS handshakes.', src:'RFC 8446, RFC 9000, RFC 9114'}, {co:'Browsers & CDNs', tier:'confirmed', text:'Browsers reuse connections (keep-alive) and CDNs terminate TLS near users precisely to avoid paying long round trips for every handshake.', src:'Ilya Grigorik, “High Performance Browser Networking”'}],
  mount(host, api){
    const st = {rtt:80, dns:'resolver', proto:'h2', reuse:false, cache:'miss'};
    const dgHost = el('div'); const wf = el('div', {class:'panel-b'}); let disp = null;
    const met = ui.metrics(null, [{id:'total', label:'Time to page', unit:'ms', warn:400, bad:1000}, {id:'rt', label:'Network round trips', warn:4, bad:6}, {id:'net', label:'Network share', unit:'%', max:100, warn:70, bad:85}, {id:'srv', label:'Server work', unit:'ms'}]);
    function phases(){
      const R = st.rtt, h3 = st.proto.startsWith('h3');
      const dnsMs = st.dns === 'browser' ? 0 : st.dns === 'resolver' ? 20 : 140;
      const tcp = st.reuse || h3 ? 0 : R;
      const tls = st.reuse ? 0 : st.proto === 'h11' ? 2 * R : st.proto === 'h3z' ? 0 : R;
      const srv = 1 + 15 + 1 + (st.cache === 'hit' ? 0 : 12);
      return [{k:'DNS lookup', ms:dnsMs, c:'var(--c-ext)', rt:dnsMs ? 1 : 0}, {k:'TCP handshake', ms:tcp, c:'var(--c-lb)', rt:tcp ? 1 : 0}, {k:h3 ? 'QUIC+TLS handshake' : 'TLS handshake', ms:tls, c:'var(--accent2)', rt:R ? tls / R : 0}, {k:'Request + response', ms:R, c:'var(--c-client)', rt:1}, {k:'Server work', ms:srv, c:'var(--c-service)', rt:0}, {k:'Download 60 KB', ms:24, c:'var(--c-db)', rt:0}];
    }
    function steps(ps, total){
      const R = st.rtt, S = [], h3 = st.proto.startsWith('h3');
      if (st.dns === 'browser') S.push({note:'<b>DNS:</b> answer already in the browser cache: 0 ms.', hl:['br']});
      else S.push({note:`<b>DNS</b>: ${st.dns === 'full' ? 'full recursive lookup (root → .com → authoritative)' : 'resolver cache hit'}: <b>+${ps[0].ms} ms</b>.`, flow:[['br', 'dns', 'A?'], ['dns', 'br', 'IP']], hl:['dns']});
      if (st.reuse) S.push({note:'<b>Warm connection reused.</b> There is no TCP or TLS handshake at all. This is why keep-alive and connection pools matter.', hl:['lb']});
      else if (h3){ if (st.proto === 'h3z') S.push({note:'<b>QUIC 0-RTT:</b> a returning client sends the request inside its first handshake packet: +0 ms. (0-RTT data can be replayed, so only idempotent requests should use it.)', flow:[['br', 'lb', 'Initial + 0-RTT GET']], hl:['lb']}); else S.push({note:`<b>QUIC:</b> transport and TLS 1.3 handshake in a single round trip: <b>+${R} ms</b>.`, flow:[['br', 'lb', 'Initial'], ['lb', 'br', 'Handshake']], hl:['lb']}); }
      else {
        S.push({note:`<b>TCP:</b> SYN → SYN-ACK → ACK: <b>+${R} ms</b>.`, flow:[['br', 'lb', 'SYN'], ['lb', 'br', 'SYN-ACK'], ['br', 'lb', 'ACK']], hl:['lb'], dur:650});
        if (st.proto === 'h11') S.push({note:`<b>TLS 1.2:</b> two round trips: <b>+${2 * R} ms</b>.`, flow:[['br', 'lb', 'ClientHello'], ['lb', 'br', 'ServerHello+Cert'], ['br', 'lb', 'KeyExch+Fin'], ['lb', 'br', 'Finished']], hl:['lb'], dur:650});
        else S.push({note:`<b>TLS 1.3:</b> one round trip: <b>+${R} ms</b>.`, flow:[['br', 'lb', 'ClientHello'], ['lb', 'br', 'ServerHello+Cert']], hl:['lb']});
      }
      if (st.proto === 'h3z' && !st.reuse) S.push({note:'The request already arrived inside the 0-RTT packet; the load balancer forwards it to an app server.', flow:[['lb', 'app']], hl:['app']});
      else S.push({note:'<b>HTTP request</b> reaches the load balancer (½ RTT), which forwards it to a healthy app server.', flow:[['br', 'lb', 'GET /'], ['lb', 'app']], hl:['app']});
      if (st.cache === 'hit') S.push({note:'<b>Cache hit:</b> ~1 ms. The database is never touched.', flow:[['app', 'ca', 'GET'], ['ca', 'app', 'hit']], hl:['ca']});
      else S.push({note:'<b>Cache miss</b> → database query (~12 ms) → result written back to the cache for next time.', flow:[['app', 'ca', 'GET'], ['ca', 'app', 'miss'], ['app', 'db', 'SELECT'], ['db', 'app', 'rows'], ['app', 'ca', 'SET']], hl:['ca', 'db']});
      S.push({note:`<b>Response</b> returns (½ RTT) and downloads. Total ≈ <b>${Math.round(total)} ms</b>.`, flow:[['app', 'lb', '200'], ['lb', 'br', 'HTML']], hl:['br']});
      return S;
    }
    function update(rebuild){
      const ps = phases(); const total = ps.reduce((s, p) => s + p.ms, 0);
      let off = 0; wf.innerHTML = '';
      wf.append(el('div', {class:'row', style:{justifyContent:'space-between', marginBottom:'8px'}}, el('b', null, 'Timing waterfall'), el('span', {class:'mono muted'}, `total ≈ ${Math.round(total)} ms`)));
      ps.forEach(p => {
        const bar = el('div', {class:'wf-bar', style:{left:(off / total * 100) + '%', width:'0%', background:p.c}});
        wf.append(el('div', {class:'wf-row'}, el('span', {class:'wl', title:p.k}, p.k), el('div', {class:'wf-track'}, bar), el('span', {class:'wt'}, p.ms ? Math.round(p.ms) + ' ms' : '0 ms')));
        const w = p.ms / total * 100; requestAnimationFrame(() => { bar.style.width = w + '%'; });
        off += p.ms;
      });
      const net = ps.filter(p => p.rt).reduce((s, p) => s + p.ms, 0);
      met.set('total', total); met.set('rt', ps.reduce((s, p) => s + p.rt, 0)); met.set('net', total ? net / total * 100 : 0); met.set('srv', ps[4].ms);
      if (rebuild){
        if (disp) disp(); dgHost.innerHTML = '';
        disp = SDA.withScope(() => new api.Diagram(dgHost, {title:'Animated: your request with these settings', w:800, h:270, alt:'Browser, DNS resolver, load balancer, app server, cache and database.',
          nodes:[{id:'br', type:'client', label:'Browser', x:70, y:150}, {id:'dns', type:'ext', label:'DNS resolver', x:250, y:50, w:130}, {id:'lb', type:'lb', label:'LB + TLS', x:300, y:185}, {id:'app', type:'service', label:'App server', x:500, y:185}, {id:'ca', type:'cache', label:'Cache', x:695, y:105}, {id:'db', type:'db', label:'Database', x:695, y:225}],
          edges:[{from:'br', to:'dns'}, {from:'br', to:'lb'}, {from:'lb', to:'app'}, {from:'app', to:'ca'}, {from:'app', to:'db'}], steps:steps(ps, total)}));
      }
    }
    const rebuildSoon = debounce(() => update(true), 350);
    const set = (k, v) => { st[k] = v; update(false); rebuildSoon(); };
    const rtt = ui.slider({label:'Round-trip time to the server', min:5, max:300, step:5, value:80, fmt:v => v + ' ms', onInput:v => set('rtt', v)});
    const dns = ui.select({label:'DNS', value:'resolver', options:[['browser', 'Cached in browser (0 ms)'], ['resolver', 'Resolver cache hit (~20 ms)'], ['full', 'Full recursive lookup (~140 ms)']], onChange:v => set('dns', v)});
    const proto = ui.select({label:'Protocol', value:'h2', options:[['h11', 'HTTP/1.1 + TLS 1.2'], ['h2', 'HTTP/2 + TLS 1.3'], ['h3', 'HTTP/3 (QUIC)'], ['h3z', 'HTTP/3 + 0-RTT resumption']], onChange:v => set('proto', v)});
    const cache = ui.select({label:'Server data', value:'miss', options:[['hit', 'Cache hit'], ['miss', 'Cache miss → database']], onChange:v => set('cache', v)});
    const reuse = ui.toggle({label:'Reuse a warm connection (keep-alive)', checked:false, onChange:v => set('reuse', v)});
    const presets = el('div', {class:'pill-row', style:{marginTop:'10px'}}, ...[['Same city', {rtt:8}], ['Across India', {rtt:40}], ['India → US server', {rtt:220}]].map(([t, p]) => ui.button(t, () => { rtt.set(p.rtt); set('rtt', p.rtt); }, 'sm ghost')));
    host.append(el('div', {class:'ctl-grid'}, rtt.el, dns.el, proto.el, cache.el), el('div', {style:{marginTop:'12px'}}, reuse.el), presets, dgHost, el('div', {class:'panel', style:{marginTop:'14px'}}, wf), el('div', {style:{height:'12px'}}), met.el);
    update(true);
  }
});
} catch(e){ console.error('[SDA] playground request-journey', e); SDA.errors.push({id:'request-journey', error:e}); }

/* ---------------- #21 Latency numbers, log scale ---------------- */
try {
SDA.register({kind:'playground', id:'latency-chart', module:'foundations', icon:'⏱️', title:'Latency numbers on a log scale',
  summary:'See how far apart common computer actions are, from a CPU cache to a trip across the world. Switch to human time to feel the gaps.',
  explain:`<h3>How to use it</h3><ol><li>Keep all four groups on and read the chart from top to bottom. Each grid line is 10 times bigger than the one before.</li><li>Use the two menus to compare <b>Main memory reference</b> with <b>SSD random 4 KB read</b>.</li><li>Turn on <b>Human time</b>. One nanosecond becomes one second.</li></ol><h3>What to notice</h3><ul><li>A round trip to another region is thousands of times slower than reading memory.</li><li>The exact values change with hardware. The ratios stay about the same.</li></ul><div class="callout tip"><b>Important point</b><p>Fix the biggest gap first. One extra network trip costs more than thousands of memory reads.</p></div>`,
  real:[{co:'Google', tier:'confirmed', text:'Jeff Dean popularised this list to teach engineers to reason about designs before building them.', src:'Jeff Dean, LADIS 2009 keynote'}, {co:'Jakob Nielsen', tier:'confirmed', text:'Response-time limits: ~0.1 s feels instantaneous, ~1 s keeps the user’s flow of thought, ~10 s is the limit of attention.', src:'Nielsen Norman Group, “Response Times: The 3 Important Limits”'}],
  mount(host){
    const ITEMS = [['L1 cache reference', 1, 'cpu', '~0.5–1 ns'], ['Branch mispredict', 3, 'cpu', '~3 ns'], ['L2 cache reference', 4, 'cpu', '~4 ns'], ['Mutex lock/unlock', 17, 'cpu', '~17–25 ns'], ['Main memory reference', 100, 'cpu', '~100 ns'], ['Compress 1 KB (Snappy)', 2e3, 'cpu', '~2–3 µs'], ['Send 1 KB over 1 Gbps', 1e4, 'net', '~8–10 µs of wire time'], ['Read 1 MB sequentially from RAM', 5e4, 'cpu', '~20–100 µs (memory bandwidth)'], ['SSD random 4 KB read', 1e5, 'disk', '~10–150 µs (NVMe is faster)'], ['Round trip inside a datacenter', 5e5, 'net', '~0.1–0.5 ms'], ['Read 1 MB sequentially from SSD', 1e6, 'disk', '~0.3–2 ms'], ['Round trip between zones in a region', 1.5e6, 'net', '~1–2 ms'], ['Read 1 MB sequentially from HDD', 7e6, 'disk', '~5–10 ms'], ['HDD seek', 1e7, 'disk', '~2–10 ms'], ['Mumbai ↔ Delhi round trip', 3e7, 'net', '~25–40 ms typical; physics floor ≈ 12 ms'], ['TCP + TLS 1.3 setup at 50 ms RTT', 1e8, 'net', '2 round trips before the first request'], ['Feels instant to a human', 1e8, 'human', '~100 ms'], ['California ↔ Netherlands round trip', 1.5e8, 'net', '~150 ms'], ['India ↔ US East round trip', 2e8, 'net', '~180–250 ms; physics floor ≈ 125 ms'], ['Keeps a user’s flow of thought', 1e9, 'human', '~1 s']];
    const CAT = {cpu:['CPU & memory', 'var(--c-service)'], disk:['Storage', 'var(--c-db)'], net:['Network', 'var(--c-client)'], human:['Human perception', 'var(--accent3)']};
    const on = {cpu:true, disk:true, net:true, human:true}; let human = false;
    const rows = el('div', {class:'panel-b'});
    const pos = ns => clamp((Math.log10(ns) + .5) / 9.5 * 100, 1, 100);
    const fmtV = ns => human ? fmtDur(ns * 1000) : fmtDur(ns / 1e6);
    function render(){
      rows.innerHTML = '';
      const axis = el('div', {class:'wf-row', style:{fontSize:'11px'}}, el('span', {class:'wl muted'}, human ? 'human scale →' : 'real time →'), el('div', {style:{position:'relative', height:'16px'}}, ...[1, 1e3, 1e6, 1e9].map(v => el('span', {class:'mono muted', style:{position:'absolute', left:pos(v) + '%', transform:'translateX(-50%)'}}, human ? fmtDur(v * 1000) : fmtDur(v / 1e6)))), el('span'));
      rows.append(axis);
      ITEMS.filter(i => on[i[2]]).forEach(([label, ns, cat, note]) => {
        const bar = el('div', {class:'wf-bar', style:{left:'0', width:'0%', background:CAT[cat][1]}});
        rows.append(el('div', {class:'wf-row', title:note}, el('span', {class:'wl'}, label, el('div', {class:'lab-hint', style:{fontSize:'11px'}}, note)), el('div', {class:'wf-track', style:{height:'18px', backgroundImage:'repeating-linear-gradient(90deg,transparent 0,transparent calc(10.526% - 1px),var(--border) calc(10.526% - 1px),var(--border) 10.526%)'}}, bar), el('span', {class:'wt'}, fmtV(ns))));
        requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = pos(ns) + '%'; }));
      });
    }
    const cats = el('div', {class:'pill-row'}, ...Object.entries(CAT).map(([k, [t, c]]) => { const b = ui.button(`<span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c}"></span> ${t}`, () => { on[k] = !on[k]; b.classList.toggle('active', on[k]); b.setAttribute('aria-pressed', String(on[k])); render(); }, 'sm active'); b.setAttribute('aria-pressed', 'true'); return b; }));
    const hum = ui.toggle({label:'Human time (1 ns = 1 second)', checked:false, onChange:v => { human = v; render(); cmp(); }});
    const names = ITEMS.map(i => [i[0], i[0]]);
    const a = ui.select({label:'Compare', value:'Main memory reference', options:names, onChange:() => cmp()});
    const b = ui.select({label:'with', value:'SSD random 4 KB read', options:names, onChange:() => cmp()});
    const res = el('div', {class:'verdict ok', role:'status'});
    function cmp(){ const A = ITEMS.find(i => i[0] === a.value), B = ITEMS.find(i => i[0] === b.value); const r = B[1] / A[1]; res.textContent = r >= 1 ? `“${B[0]}” is ~${fmtNum(r)}× slower than “${A[0]}” (${fmtV(B[1])} vs ${fmtV(A[1])}).` : `“${B[0]}” is ~${fmtNum(1 / r)}× faster than “${A[0]}” (${fmtV(B[1])} vs ${fmtV(A[1])}).`; }
    host.append(el('div', {class:'row', style:{justifyContent:'space-between'}}, cats, hum.el), el('div', {class:'panel', style:{marginTop:'14px'}}, rows), el('div', {class:'ctl-grid', style:{marginTop:'14px'}}, a.el, b.el), el('div', {style:{height:'10px'}}), res);
    render(); cmp();
  }
});
} catch(e){ console.error('[SDA] playground latency-chart', e); SDA.errors.push({id:'latency-chart', error:e}); }

/* ---------------- #19 Back-of-envelope calculator ---------------- */
try {
SDA.register({kind:'playground', id:'envelope', module:'foundations', icon:'🧮', title:'Back-of-envelope calculator',
  summary:'Change users, actions, sizes and the busy-hour multiplier. Requests per second, storage, bandwidth and servers update live, and each number shows its math.',
  explain:`<h3>How to use it</h3><ol><li>Click the <b>URL shortener</b> preset. It matches the Module 1 lesson: 20 million visitors, 20 requests each, about 23,000 requests a second at peak.</li><li>Change <b>one</b> slider at a time, such as “Peak ÷ average”.</li><li>Watch which numbers move. Press “Hide math”, then “Next line”, to see the formulas one at a time.</li></ol><h3>What to notice</h3><ul><li>The busy-hour rate, not the average, decides how many servers you need.</li><li>Storage grows with how long you keep data and how many copies you keep.</li><li>The green, yellow and red notes are rough rules of thumb. A load test gives the real answer.</li></ul><div class="callout tip"><b>Important point</b><p>An estimate is a set of guesses written down. Change one guess and every number after it updates.</p></div><p class="lab-hint">All presets are illustrative guesses, not figures from the companies.</p>`,
  real:[{co:'NPCI (UPI)', tier:'confirmed', text:'Publishes monthly UPI volumes. Use them to sanity-check the UPI preset.', src:'npci.org.in UPI statistics'}, {co:'Twitter', tier:'confirmed', text:'Reported about 5,700 Tweets a second on average and a record of 143,199 a second in 2013. That is a peak of about 25 times the average for one event.', src:'Twitter Engineering (2013)'}],
  mount(host){
    const PRESETS = {
      'URL shortener':{dau:Math.log10(2e7), rpu:20, wpct:Math.log10(1), wsize:Math.log10(500), rsize:Math.log10(500), years:5, repl:3, peak:5, hot:20, cap:Math.log10(2000)},
      'Photo sharing':{dau:Math.log10(5e8), rpu:50, wpct:Math.log10(.4), wsize:Math.log10(2e6), rsize:Math.log10(2e5), years:10, repl:3, peak:3, hot:10, cap:Math.log10(1000)},
      'Chat app':{dau:Math.log10(5e8), rpu:100, wpct:Math.log10(50), wsize:Math.log10(200), rsize:Math.log10(200), years:.1, repl:3, peak:3, hot:5, cap:Math.log10(5000)},
      'UPI-like payments':{dau:Math.log10(2.5e8), rpu:4, wpct:Math.log10(50), wsize:Math.log10(1000), rsize:Math.log10(1000), years:10, repl:3, peak:3, hot:5, cap:Math.log10(1000)},
      'Food delivery':{dau:Math.log10(1.5e7), rpu:30, wpct:Math.log10(1), wsize:Math.log10(2000), rsize:Math.log10(2e4), years:5, repl:3, peak:4, hot:20, cap:Math.log10(1000)},
      'Exam results day':{dau:Math.log10(2e6), rpu:5, wpct:Math.log10(.1), wsize:Math.log10(500), rsize:Math.log10(5000), years:5, repl:3, peak:20, hot:20, cap:Math.log10(2000)}
    };
    const P = Object.assign({}, PRESETS['URL shortener']);
    const S = {};
    const mk = (k, o) => { S[k] = ui.slider(Object.assign({value:P[k], onInput:v => { P[k] = v; calc(); }}, o)); return S[k].el; };
    const grid = el('div', {class:'ctl-grid'},
      mk('dau', {label:'Daily active users (people who use it each day)', min:3, max:9.3, step:.01, fmt:v => fmtNum(Math.pow(10, v))}),
      mk('rpu', {label:'Requests per user per day', min:1, max:300, step:1, fmt:v => v}),
      mk('wpct', {label:'Share of requests that write', min:-1, max:2, step:.01, fmt:v => +Math.pow(10, v).toFixed(Math.pow(10, v) < 1 ? 2 : 1) + '%'}),
      mk('wsize', {label:'Size of each write', min:1, max:7.5, step:.01, fmt:v => fmtBytes(Math.pow(10, v))}),
      mk('rsize', {label:'Size of each response', min:1, max:6.5, step:.01, fmt:v => fmtBytes(Math.pow(10, v))}),
      mk('years', {label:'Retention', min:.1, max:20, step:.1, fmt:v => v < 1 ? Math.round(v * 365) + ' days' : v + ' years'}),
      mk('repl', {label:'Replication factor', min:1, max:5, step:1, fmt:v => '×' + v}),
      mk('peak', {label:'Peak ÷ average (busy-hour multiplier)', min:1, max:30, step:.5, fmt:v => '×' + v}),
      mk('hot', {label:'Share of hot data kept in a cache (Module 4 preview)', min:1, max:60, step:1, fmt:v => v + '%'}),
      mk('cap', {label:'Requests per second one server handles', min:1.5, max:4.7, step:.01, fmt:v => fmtNum(Math.pow(10, v))}));
    const presets = el('div', {class:'pill-row', style:{marginBottom:'14px'}}, el('span', {class:'muted', style:{fontSize:'13px', alignSelf:'center'}}, 'Presets (illustrative):'), ...Object.keys(PRESETS).map(name => ui.button(name, () => { Object.assign(P, PRESETS[name]); Object.keys(S).forEach(k => S[k].set(P[k])); calc(); }, 'sm ghost')));
    const met = ui.metrics(null, [{id:'avg', label:'Average requests/s'}, {id:'peak', label:'Peak requests/s'}, {id:'w', label:'Peak writes/s'}, {id:'r', label:'Peak reads/s'}, {id:'sd', label:'New data per day', fmt:fmtBytes}, {id:'st', label:'Total storage', fmt:fmtBytes}, {id:'bw', label:'Peak egress', fmt:v => fmtBits(v)}, {id:'cache', label:'Cache RAM', fmt:fmtBytes}, {id:'srv', label:'App servers needed at peak', fmt:v => String(Math.ceil(v))}]);
    const verdicts = el('div', {class:'stack', style:{marginTop:'14px'}});
    const math = el('div', {class:'math', style:{whiteSpace:'normal', marginTop:'14px'}}); let shown = 99;
    const stepCtl = el('div', {class:'controls', style:{marginTop:'8px'}}, ui.button('⏮ Hide math', () => { shown = 0; paintMath(); }, 'sm ghost'), ui.button('⏭ Next line', () => { shown++; paintMath(); }, 'sm'), ui.button('Show all', () => { shown = 99; paintMath(); }, 'sm ghost'));
    let lines = [];
    function paintMath(){ math.innerHTML = ''; lines.forEach((ln, i) => math.append(el('div', {style:{opacity:i < shown ? '1' : '.18', transition:'opacity .3s', whiteSpace:'pre-wrap'}}, ln))); }
    function calc(){
      const dau = Math.pow(10, P.dau), w = Math.pow(10, P.wpct) / 100, ws = Math.pow(10, P.wsize), rs = Math.pow(10, P.rsize), cap = Math.pow(10, P.cap);
      const perDay = dau * P.rpu, avg = perDay / 86400, peak = avg * P.peak, wq = peak * w, rq = peak * (1 - w);
      const sd = perDay * w * ws, st = sd * 365 * P.years * P.repl, bw = rq * rs * 8, cacheB = perDay * (1 - w) * (P.hot / 100) * rs, servers = Math.max(2, peak / (cap * .7));
      met.set('avg', avg); met.set('peak', peak); met.set('w', wq); met.set('r', rq); met.set('sd', sd); met.set('st', st); met.set('bw', bw); met.set('cache', cacheB); met.set('srv', servers);
      lines = [
        `requests/day = ${fmtNum(dau)} users × ${P.rpu} = ${fmtNum(perDay)}`,
        `average rate = ${fmtNum(perDay)} ÷ 86,400 s ≈ ${fmtNum(avg)} req/s`,
        `peak rate    = ${fmtNum(avg)} × ${P.peak} ≈ ${fmtNum(peak)} req/s  →  writes ${fmtNum(wq)}/s, reads ${fmtNum(rq)}/s`,
        `new data/day = ${fmtNum(perDay * w)} writes × ${fmtBytes(ws)} ≈ ${fmtBytes(sd)}`,
        `storage      = ${fmtBytes(sd)} × 365 × ${P.years} yr × ${P.repl} replicas ≈ ${fmtBytes(st)}  (plus indexes and backups)`,
        `peak egress  = ${fmtNum(rq)} reads/s × ${fmtBytes(rs)} × 8 bits ≈ ${fmtBits(bw)}`,
        `cache        = ${P.hot}% of a day’s read bytes ≈ ${fmtBytes(cacheB)}`,
        `app servers  = ${fmtNum(peak)} ÷ (${fmtNum(cap)} req/s × 70% target) ≈ ${Math.ceil(servers)} (min 2 for redundancy)`
      ];
      paintMath();
      const V = [];
      V.push(wq < 2000 ? ['ok', `Writes (${fmtNum(wq)}/s at peak): one relational primary can probably handle this. Confirm with a load test.`] : wq < 20000 ? ['warn', `Writes (${fmtNum(wq)}/s at peak): possible on one large, tuned primary, but plan batching and partitioning.`] : ['bad', `Writes (${fmtNum(wq)}/s at peak): split the write path, using sharding or a store built for writes.`]);
      V.push(st < 2e12 ? ['ok', `Storage (${fmtBytes(st)}): fits on one database cluster.`] : st < 5e13 ? ['warn', `Storage (${fmtBytes(st)}): split the data, or move old data to cheaper storage.`] : ['bad', `Storage (${fmtBytes(st)}): needs distributed or object storage, with old data moved to cheaper tiers.`]);
      V.push(cacheB < 6.4e10 ? ['ok', `Cache (${fmtBytes(cacheB)}): fits on one large cache machine. Add a copy for availability.`] : cacheB < 1e12 ? ['warn', `Cache (${fmtBytes(cacheB)}): needs a small group of cache machines.`] : ['bad', `Cache (${fmtBytes(cacheB)}): too big to cache everything hot. Cache only the hottest keys and serve media from a CDN.`]);
      V.push(bw < 1e10 ? ['ok', `Egress (${fmtBits(bw)} at peak): your own load balancers can handle this.`] : ['warn', `Egress (${fmtBits(bw)} at peak): serve images and media from a CDN.`]);
      verdicts.innerHTML = ''; V.forEach(([c, t]) => verdicts.append(el('div', {class:'verdict ' + c}, t)));
    }
    host.append(presets, grid, el('div', {style:{height:'16px'}}), met.el, math, stepCtl, verdicts);
    calc();
  }
});
} catch(e){ console.error('[SDA] playground envelope', e); SDA.errors.push({id:'envelope', error:e}); }

/* ---------------- #20 Availability nines calculator ---------------- */
try {
SDA.register({kind:'playground', id:'nines', module:'foundations', icon:'📈', title:'Availability nines calculator',
  summary:'Turn a number of nines into allowed downtime. Then build a system from parts and see how its total availability changes.',
  explain:`<h3>How to use it</h3><ol><li>Pick <b>99.9%</b> under Availability target and read the downtime per year.</li><li>In the system below, press <b>+</b> on App servers to add a copy. Watch the total change.</li><li>Turn on <b>All replicas share one zone</b> and watch the total drop.</li></ol><h3>What to notice</h3><ul><li>Parts in a chain multiply, so the total is always lower than the weakest part.</li><li>Extra copies help only when they fail independently of each other.</li></ul><div class="callout tip"><b>Important point</b><p>A chain is only as available as its weakest link. Improve that part first.</p></div><p class="lab-hint">The year simulation is a teaching model. Real failures last longer and come in clusters.</p>`,
  real:[{co:'Amazon S3', tier:'confirmed', text:'Designed for 99.99% availability and 11 nines durability; the SLA commits to 99.9%. Three different numbers for three different promises.', src:'AWS S3 documentation and SLA'}, {co:'Microsoft Azure', tier:'confirmed', text:'Azure’s documentation explains composite SLAs: chaining services multiplies their SLAs, and redundancy across regions raises it.', src:'Azure architecture guidance on composite SLAs'}],
  mount(host, api){
    const OPTS = [99, 99.5, 99.9, 99.95, 99.99, 99.999];
    const tiers = [{n:'Load balancer', t:'lb', a:99.99, k:1}, {n:'App servers', t:'service', a:99.5, k:2}, {n:'Cache', t:'cache', a:99.9, k:1}, {n:'Database', t:'db', a:99.95, k:1}, {n:'Payment gateway', t:'ext', a:99.9, k:1}];
    let oneZone = false, disp = null;
    /* Part A — nines → downtime */
    const aOut = el('div');
    const aSel = ui.select({label:'Availability target', value:'99.9', options:OPTS.map(v => [String(v), v + '%']).concat([['custom', 'Custom…']]), onChange:v => { aIn.hidden = v !== 'custom'; downtime(); }});
    const aIn = el('input', {class:'input', type:'number', min:'0', max:'100', step:'0.001', value:'99.95', hidden:true, 'aria-label':'Custom availability percent'}); aIn.addEventListener('input', downtime);
    function downtime(){
      const A = clamp(aSel.value === 'custom' ? +aIn.value : +aSel.value, 0, 100) / 100, d = 1 - A;
      aOut.innerHTML = '';
      aOut.append(tmpl(h.table(['Per', 'Allowed downtime'], [['Year', fmtDur(d * 365.25 * 864e5)], ['Month (30 d)', fmtDur(d * 30 * 864e5)], ['Week', fmtDur(d * 7 * 864e5)], ['Day', fmtDur(d * 864e5)]], [1])));
    }
    /* Part B — composite system */
    const tbl = el('div', {class:'stack'}); const dg = el('div'); const comp = el('div');
    const met = ui.metrics(null, [{id:'a', label:'Composite availability', fmt:v => v.toFixed(4), unit:'%'}, {id:'dt', label:'Expected downtime / yr', fmt:v => fmtDur(v * 3600000)}, {id:'n', label:'Nines', fmt:v => v.toFixed(2)}]);
    const tierA = t => 1 - Math.pow(1 - t.a / 100, t.k);
    function compute(){
      let A = tiers.reduce((p, t) => p * tierA(t), 1); if (oneZone) A *= .999;
      const weakest = tiers.reduce((w, t) => tierA(t) < tierA(w) ? t : w, tiers[0]);
      return {A, weakest};
    }
    function render(rebuild){
      const {A, weakest} = compute();
      tbl.innerHTML = '';
      tiers.forEach(t => {
        const s = el('select', {class:'input', style:{width:'auto', minWidth:'100px'}, 'aria-label':t.n + ' availability per replica'}); OPTS.forEach(v => s.append(el('option', {value:String(v)}, v + '%'))); s.value = String(t.a);
        s.addEventListener('change', () => { t.a = +s.value; render(true); });
        const minus = ui.button('−', () => { t.k = Math.max(1, t.k - 1); render(true); }, 'sm'); minus.setAttribute('aria-label', 'Fewer ' + t.n);
        const plus = ui.button('+', () => { t.k = Math.min(5, t.k + 1); render(true); }, 'sm'); plus.setAttribute('aria-label', 'More ' + t.n);
        tbl.append(el('div', {class:'sort-item' + (t === weakest ? ' wrong' : ''), style:{gap:'10px'}}, el('span', {class:'legend'}, el('span', {class:'lg t-' + t.t}, el('span', {class:'sw ' + t.t}), el('b', {style:{color:'var(--text)'}}, t.n))), el('div', {class:'row'}, s, minus, el('span', {class:'chip mono'}, '×' + t.k), plus, el('span', {class:'mono', style:{minWidth:'92px', textAlign:'right'}}, (tierA(t) * 100).toFixed(5) + '%'), t === weakest ? el('span', {class:'chip', style:{color:'var(--bad)'}}, 'weakest link') : null)));
      });
      met.set('a', A * 100); met.set('dt', (1 - A) * 8766); met.set('n', -Math.log10(Math.max(1e-12, 1 - A)));
      comp.innerHTML = ''; comp.append(el('div', {class:'math'}, `A = ${tiers.map(t => t.k > 1 ? `[1 − (1 − ${t.a / 100})^${t.k}]` : `${t.a / 100}`).join(' × ')}${oneZone ? ' × 0.999 (shared zone)' : ''}\n  = ${(A * 100).toFixed(5)}%`));
      if (rebuild){
        if (disp) disp(); dg.innerHTML = '';
        const W = 820, step = (W - 160) / (tiers.length - 1);
        disp = SDA.withScope(() => {
          const d = new api.Diagram(dg, {title:'Your system: tiers in series, replicas in parallel', w:W, h:170, nodes:[{id:'u', type:'client', label:'Users', x:50, y:85, w:80}].concat(tiers.map((t, i) => ({id:'t' + i, type:t.t, label:t.n, sub:`×${t.k} · ${(tierA(t) * 100).toFixed(3)}%`, x:150 + i * step, y:85, w:132}))), edges:tiers.map((t, i) => ({from:i ? 't' + (i - 1) : 'u', to:'t' + i})), caption:`Weakest link: <b>${esc(weakest.n)}</b>. Improve it first.`});
          d.setStatus('t' + tiers.indexOf(weakest), 'hot');
        });
      }
    }
    /* Year simulation */
    const year = el('div', {style:{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(10px,1fr))', gap:'2px', marginTop:'10px'}, role:'img', 'aria-label':'365 days; red days had downtime'});
    const yearInfo = el('div', {class:'lab-hint', style:{marginTop:'6px'}});
    function simulate(){
      const r = Math.random; let down = 0; const days = new Array(365).fill(0);
      for (let hr = 0; hr < 8760; hr++){
        let up = !oneZone || r() < .999;
        for (const t of tiers){ if (!up) break; let any = false; for (let k = 0; k < t.k; k++) if (r() < t.a / 100){ any = true; break; } up = any; }
        if (!up){ down++; days[Math.floor(hr / 24)]++; }
      }
      year.innerHTML = ''; days.forEach((x, i) => year.append(el('span', {title:`Day ${i + 1}: ${x} h down`, style:{height:'10px', borderRadius:'2px', background:x ? `color-mix(in srgb, var(--bad) ${Math.min(100, 35 + x * 20)}%, transparent)` : 'var(--surface-3)'}})));
      const {A} = compute(); yearInfo.textContent = `Simulated: ${down} hours down on ${days.filter(Boolean).length} days. Expected ≈ ${((1 - A) * 8760).toFixed(1)} h. Run it again. The result changes a little each time because it is random.`;
    }
    const zone = ui.toggle({label:'All replicas share one zone (zone availability 99.9%)', checked:false, onChange:v => { oneZone = v; render(true); }});
    host.append(el('h3', {style:{margin:'0 0 8px'}}, '① Nines → downtime'), el('div', {class:'ctl-grid'}, aSel.el, aIn), aOut,
      el('h3', {style:{margin:'24px 0 8px'}}, '② Build a system'), tbl, el('div', {style:{margin:'12px 0'}}, zone.el), met.el, comp, dg,
      el('h3', {style:{margin:'24px 0 8px'}}, '③ Simulate a year'), el('div', {class:'controls'}, ui.button('🎲 Simulate 365 days', simulate, 'sm primary')), year, yearInfo);
    downtime(); render(true); simulate();
  }
});
} catch(e){ console.error('[SDA] playground nines', e); SDA.errors.push({id:'nines', error:e}); }

/* ---------------- Tail latency + fan-out simulator ---------------- */
try {
SDA.register({kind:'playground', id:'tail-latency', module:'foundations', icon:'🐢', title:'Tail latency & fan-out simulator',
  summary:'Simulate thousands of requests where one page makes many backend calls and waits for the slowest one. Then add backup requests to cut the slow tail.',
  explain:`<h3>How to use it</h3><ol><li>Set <b>Fan-out</b> to 1 and note the user p99.</li><li>Raise Fan-out to 100. The typical user time moves up toward the backend's slow time.</li><li>Turn on <b>Hedged requests</b>. A backup copy of each slow call is sent, and the tail shrinks.</li></ol><h3>What to notice</h3><ul><li>If 1 call in 100 is slow, then at fan-out 100 about 63% of users hit a slow call (1 − 0.99<sup>100</sup>).</li><li>Hedging adds only a few percent of extra load.</li></ul><div class="callout tip"><b>Important point</b><p>The more calls a page makes, the more likely it waits for one slow call. Hedge only safe, repeatable reads.</p></div>`,
  real:[{co:'Google', tier:'confirmed', text:'“The Tail at Scale” reports hedging after a 10 ms delay cut 99.9th-percentile latency for a 1,000-key read across 100 servers from 1,800 ms to 74 ms with ~2% more requests.', src:'Dean & Barroso, CACM 2013'}],
  mount(host, api){
    const P = {k:20, sigma:.45, hic:1, hedge:false};
    const cv = el('canvas', {height:480, style:{height:'240px'}, 'aria-label':'Histogram of user-visible latency with p50, p95 and p99 markers'});
    const box = el('div', {class:'chart-box'}, cv);
    const met = ui.metrics(null, [{id:'b50', label:'Backend p50', unit:'ms'}, {id:'b99', label:'Backend p99', unit:'ms'}, {id:'u50', label:'User p50', unit:'ms', warn:60, bad:150}, {id:'u95', label:'User p95', unit:'ms', warn:150, bad:300}, {id:'u99', label:'User p99', unit:'ms', warn:200, bad:400}, {id:'slow', label:'Users hitting ≥1 slow call', unit:'%', max:100, warn:20, bad:50}, {id:'extra', label:'Extra load from hedging', unit:'%'}]);
    const theory = el('div', {class:'math'});
    let bins = [], shown = [], marks = {}, raf = 0;
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const sample = () => { let x = 20 * Math.exp(P.sigma * gauss()); if (Math.random() < P.hic / 100) x += 150 + Math.random() * 250; return x; };
    const pct = (s, p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    function run(){
      const back = Array.from({length:20000}, sample).sort((a, b) => a - b);
      const b95 = pct(back, .95), b99 = pct(back, .99);
      const N = 3000, users = new Float64Array(N); let hedges = 0, calls = 0, slowUsers = 0;
      for (let i = 0; i < N; i++){
        let mx = 0, slow = false;
        for (let k = 0; k < P.k; k++){
          let a = sample(); calls++;
          if (a > b99) slow = true;
          if (P.hedge && a > b95){ hedges++; a = Math.min(a, b95 + sample()); }
          if (a > mx) mx = a;
        }
        users[i] = mx; if (slow) slowUsers++;
      }
      const u = Array.from(users).sort((a, b) => a - b);
      const u50 = pct(u, .5), u95 = pct(u, .95), u99 = pct(u, .99);
      met.set('b50', pct(back, .5)); met.set('b99', b99); met.set('u50', u50); met.set('u95', u95); met.set('u99', u99); met.set('slow', slowUsers / N * 100); met.set('extra', hedges / calls * 100);
      theory.textContent = `P(user request hits ≥ 1 call slower than the backend p99) = 1 − 0.99^${P.k} = ${((1 - Math.pow(.99, P.k)) * 100).toFixed(1)}%   (measured without hedging effects: ${(slowUsers / N * 100).toFixed(1)}%)`;
      const cap = Math.max(60, pct(u, .995) * 1.15), B = 56; bins = new Array(B).fill(0);
      u.forEach(x => { bins[Math.min(B - 1, Math.floor(x / cap * B))]++; });
      marks = {cap, u50, u95, u99};
      if (shown.length !== B) shown = new Array(B).fill(0);
      animate();
    }
    function animate(){
      cancelAnimationFrame(raf); const from = shown.slice(), t0 = performance.now(), D = api.reduced ? 1 : 450;
      const f = now => { const p = clamp((now - t0) / D, 0, 1), e = SDA.u.ease.out(p); shown = bins.map((b, i) => from[i] + (b - from[i]) * e); draw(); if (p < 1) raf = requestAnimationFrame(f); };
      raf = requestAnimationFrame(f);
    }
    api.onDispose(() => cancelAnimationFrame(raf));
    function draw(){
      const W = box.clientWidth || 640, H = 240; if (cv.width !== Math.round(W * 2)) cv.width = Math.round(W * 2);
      const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, W, H);
      const L = 10, R = W - 10, T = 26, Bm = H - 26, mx = Math.max(1, ...shown), bw = (R - L) / shown.length;
      const A = css('--accent1'), V = css('--accent2'), BAD = css('--bad'), TX = css('--muted'), BR = css('--border-strong');
      shown.forEach((v, i) => { const x0 = (i / shown.length) * marks.cap; g.fillStyle = x0 <= marks.u50 ? A : x0 <= marks.u95 ? V : BAD; const hh = Math.sqrt(v / mx) * (Bm - T); g.globalAlpha = .85; g.fillRect(L + i * bw + 1, Bm - hh, bw - 2, hh); });
      g.globalAlpha = 1; g.strokeStyle = BR; g.beginPath(); g.moveTo(L, Bm); g.lineTo(R, Bm); g.stroke();
      g.font = '11px ' + css('--font-mono');
      [['p50', marks.u50], ['p95', marks.u95], ['p99', marks.u99]].forEach(([n, v], i) => { const x = L + v / marks.cap * (R - L); g.strokeStyle = TX; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x, T - 4); g.lineTo(x, Bm); g.stroke(); g.setLineDash([]); g.fillStyle = css('--text'); g.fillText(`${n} ${Math.round(v)}ms`, Math.min(x + 4, R - 80), 12 + i * 0); });
      g.fillStyle = TX; g.fillText('0 ms', L, H - 8); g.fillText(Math.round(marks.cap) + ' ms', R - 50, H - 8);
    }
    const rerun = debounce(run, 140);
    const k = ui.slider({label:'Fan-out (backend calls per user request)', min:1, max:200, step:1, value:20, fmt:v => v, onInput:v => { P.k = v; rerun(); }});
    const sg = ui.slider({label:'Tail heaviness (variance)', min:.1, max:1.2, step:.05, value:.45, fmt:v => v.toFixed(2), onInput:v => { P.sigma = v; rerun(); }});
    const hc = ui.slider({label:'Hiccup rate (GC pause, noisy neighbour)', min:0, max:5, step:.1, value:1, fmt:v => v + '%', onInput:v => { P.hic = v; rerun(); }});
    const hg = ui.toggle({label:'Hedged requests (backup after backend p95)', checked:false, onChange:v => { P.hedge = v; run(); }});
    host.append(el('div', {class:'ctl-grid'}, k.el, sg.el, hc.el), el('div', {class:'row', style:{margin:'12px 0', justifyContent:'space-between'}}, hg.el, ui.button('🎲 Resample', run, 'sm')), box, el('div', {class:'legend', style:{margin:'8px 0 12px'}}, el('span', null, '■ ≤ p50', ), el('span', {style:{color:'var(--accent2)'}}, '■ p50–p95'), el('span', {style:{color:'var(--bad)'}}, '■ > p95'), el('span', null, 'bar height = √count, so the tail stays visible')), met.el, theory);
    run();
  }
});
} catch(e){ console.error('[SDA] playground tail-latency', e); SDA.errors.push({id:'tail-latency', error:e}); }
})();
