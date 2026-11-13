
/* =====================================================================
   PART 4 · PLAYGROUNDS (b) — #18 Saga vs 2PC · #24 Snowflake IDs · #27 vector clocks & CRDTs
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, sv, esc, clamp, fmtNum} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const {css, frag} = SDA.ph;
const wait = ms => new Promise(r => setTimeout(r, SDA.reduced ? 80 : ms));

/* ---------------- #18 Saga vs 2PC ---------------- */
try {
SDA.register({kind:'playground', id:'saga-2pc', module:'distributed', icon:'🧾', title:'Saga vs two-phase commit',
  summary:'Place a food order across Order, Payment, Restaurant and Delivery services using 2PC, an orchestrated saga or a choreographed saga. Inject a failure and watch locks, votes, compensations and events.',
  explain:`<ul><li><b>2PC + restaurant rejects:</b> everyone aborts cleanly — but every service held locks for the whole protocol.</li><li><b>2PC + coordinator crash:</b> all participants voted YES and are stuck <b>in doubt</b>, locks held, until you press Recover.</li><li><b>Saga + restaurant rejects:</b> payment already happened, so the orchestrator runs <b>compensations</b> in reverse: refund, then cancel. Users briefly see a PENDING order — sagas trade isolation for availability.</li><li><b>Choreography</b> does the same through events on a bus, with no central coordinator — notice how much harder it is to see the whole flow.</li></ul>`,
  real:[{co:'Temporal · Netflix Conductor · AWS Step Functions', tier:'confirmed', text:'Durable workflow engines commonly used to orchestrate sagas with retries and compensations.', src:'Project documentation'}, {co:'Google Spanner', tier:'confirmed', text:'Uses 2PC across Paxos groups so the coordinator itself is replicated.', src:'Corbett et al., OSDI 2012'}],
  mount(host, api){
    let mode = '2pc', fail = 'none', busy = false, crashed = null, lockT = 0, lockTimer = 0, msgs = 0;
    const SV = ['order', 'pay', 'rest', 'deliv']; const NAME = {order:'Order', pay:'Payment', rest:'Restaurant', deliv:'Delivery'};
    const state = {}; const logBox = el('div', {class:'lab-out', style:{maxHeight:'200px', borderRadius:'10px', border:'1px solid var(--border)'}, 'aria-live':'polite'});
    const holder = el('div'); const res = el('div', {class:'verdict warn', role:'status'}, 'Choose a protocol and a failure, then Run.');
    const met = ui.metrics(null, [{id:'msgs', label:'Messages', instant:true}, {id:'locks', label:'Lock time (all services)', unit:'s', instant:true, warn:3, bad:10, fmt:v => v.toFixed(1)}, {id:'final', label:'Final outcome', instant:true}]);
    let d;
    function build(){
      holder.innerHTML = ''; SDA.withScope(() => {
        d = new api.Diagram(holder, {title:mode === '2pc' ? 'Two-phase commit' : mode === 'orch' ? 'Orchestrated saga' : 'Choreographed saga', w:800, h:300, alt:'A coordinator or event bus connects order, payment, restaurant and delivery services.',
          nodes:[{id:'u', type:'client', label:'Customer', x:70, y:150, w:110}, {id:'co', type:mode === 'chor' ? 'queue' : 'service', label:mode === '2pc' ? 'Coordinator' : mode === 'orch' ? 'Orchestrator' : 'Event bus', sub:'', x:250, y:150, w:140}].concat(SV.map((s, i) => ({id:s, type:'service', label:NAME[s], sub:'', x:560, y:40 + i * 73, w:150}))),
          edges:[{from:'u', to:'co'}].concat(SV.map(s => ({from:'co', to:s})))});
      });
      SV.forEach(s => { state[s] = {s:'—', lock:false}; d.setSub(s, '—'); }); d.setSub('co', '');
    }
    const log = s => { logBox.prepend(el('div', {class:'ln'}, s)); };
    const set = (s, txt, lock) => { state[s].s = txt; if (lock != null) state[s].lock = lock; d.setSub(s, txt + (state[s].lock ? ' 🔒' : '')); };
    const flow = async hops => { msgs += hops.length; met.set('msgs', msgs); await d.flow(hops, {parallel:hops.length > 1 && (hops.every(hp => hp[0] === hops[0][0]) || hops.every(hp => hp[1] === hops[0][1]))}); };
    const startLocks = () => { clearInterval(lockTimer); lockTimer = setInterval(() => { const n = SV.filter(s => state[s].lock).length; lockT += n * .1; met.set('locks', lockT); }, 100); };
    api.onDispose(() => clearInterval(lockTimer));
    const failsAt = s => (fail === 'pay' && s === 'pay') || (fail === 'rest' && s === 'rest') || (fail === 'deliv' && s === 'deliv');
    async function run2pc(){
      d.setCaption('<b>Phase 1:</b> coordinator asks everyone to PREPARE (do the work, lock rows, vote).'); log('Coordinator → PREPARE to all participants');
      await flow([['u', 'co', 'place order']]); await flow(SV.map(s => ['co', s, 'PREPARE']));
      SV.forEach(s => set(s, failsAt(s) ? 'voted NO' : 'prepared', !failsAt(s))); startLocks();
      await flow(SV.map(s => [s, 'co', failsAt(s) ? 'NO' : 'YES']));
      const no = SV.filter(failsAt);
      if (no.length){ log(`${no.map(s => NAME[s]).join(', ')} voted NO → ABORT`); d.setCaption('<b>Phase 2:</b> a NO vote → ABORT everywhere; locks released.'); await flow(SV.map(s => ['co', s, 'ABORT'])); SV.forEach(s => set(s, 'aborted', false)); finish('Aborted cleanly (atomic)', 'ok'); return; }
      if (fail === 'crash'){ crashed = '2pc'; d.setStatus('co', 'down'); d.setSub('co', 'log: COMMIT (unsent)'); d.setCaption('All voted YES, the coordinator logged COMMIT… and <b>crashed</b> before telling anyone. Participants are <b>in doubt</b>: they can’t commit or abort alone and keep holding locks.'); SV.forEach(s => set(s, 'IN DOUBT', true)); log('Coordinator crashed after the votes. Participants blocked, locks held.'); res.className = 'verdict bad'; res.textContent = 'Blocked: participants hold locks until the coordinator recovers. Press “Recover coordinator”.'; busy = false; return; }
      await commit2pc();
    }
    async function commit2pc(){ d.setStatus('co', 'ok'); d.setCaption('<b>Phase 2:</b> all YES → coordinator logs and sends COMMIT; locks released.'); log('All YES → COMMIT'); await flow(SV.map(s => ['co', s, 'COMMIT'])); SV.forEach(s => set(s, 'committed', false)); await flow([['co', 'u', 'confirmed']]); finish('Committed atomically', 'ok'); }
    async function runSaga(resumeFrom){
      const steps = [['order', 'create (PENDING)', 'cancel order'], ['pay', 'charge ₹499', 'refund ₹499'], ['rest', 'accept order', 'notify cancel'], ['deliv', 'assign rider', 'release rider']];
      if (!resumeFrom){ await flow([['u', 'co', 'place order']]); }
      const done = [];
      for (let k = resumeFrom || 0; k < steps.length; k++){
        const [s, act] = steps[k];
        if (k === 2 && fail === 'crash' && !resumeFrom && mode === 'orch'){ crashed = 'saga'; d.setStatus('co', 'down'); d.setSub('co', 'state: step 2 done'); log('Orchestrator crashed after step 2. Its progress is in a durable workflow store.'); d.setCaption('The orchestrator <b>crashed</b> — but saga state is durable. No locks are held; the order is visibly PENDING. Press Recover to resume.'); res.className = 'verdict warn'; res.textContent = 'Paused mid-saga (no locks held). Press “Recover coordinator”.'; busy = false; return; }
        if (mode === 'orch'){ d.setCaption(`T${k + 1}: orchestrator → ${NAME[s]}: ${act}`); await flow([['co', s, act.split(' ')[0]]]); }
        else { d.setCaption(`T${k + 1}: ${NAME[s]} reacts to the previous event and does: ${act}`); await flow([['co', s, k ? ['OrderCreated', 'PaymentDone', 'Accepted'][k - 1] : 'OrderPlaced']]); }
        if (failsAt(s)){ set(s, 'FAILED'); d.setStatus(s, 'hot'); log(`T${k + 1} ${NAME[s]} failed → compensate ${done.length} completed step(s) in reverse`); await (mode === 'orch' ? flow([[s, 'co', 'failed']]) : flow([[s, 'co', 'Failed event']]));
          for (let j = done.length - 1; j >= 0; j--){ const [cs, , comp] = steps[done[j]]; d.setCaption(`Compensate C${done[j] + 1}: ${NAME[cs]} → ${comp}`); await flow([['co', cs, comp.split(' ')[0]]]); set(cs, comp + ' ✓'); log(`C${done[j] + 1}: ${NAME[cs]} ${comp}`); }
          d.setStatus(s, 'ok'); await flow([['co', 'u', 'sorry, cancelled']]); finish('Compensated: consistent, not atomic', 'ok', true); return; }
        set(s, act + ' ✓'); log(`T${k + 1}: ${NAME[s]} ${act}`); done.push(k);
        if (mode === 'chor') await flow([[s, 'co', ['OrderCreated', 'PaymentDone', 'Accepted', 'RiderAssigned'][k]]]);
      }
      set('order', 'CONFIRMED ✓'); await flow([['co', 'u', 'confirmed']]); finish('Completed', 'ok');
    }
    function finish(txt, cls, comp){ clearInterval(lockTimer); SV.forEach(s => state[s].lock = false); met.set('final', txt); res.className = 'verdict ' + cls; res.textContent = `${txt}. ${mode === '2pc' ? `Locks were held for ${lockT.toFixed(1)} service-seconds in total.` : comp ? 'Users could see the PENDING order and the charge/refund — sagas give up isolation.' : 'No distributed locks were ever held; each step committed locally.'}`; d.setCaption(txt); busy = false; }
    async function run(){ if (busy) return; busy = true; crashed = null; lockT = 0; msgs = 0; res.className = 'verdict warn'; res.textContent = 'Running…'; met.set('msgs', 0); met.set('locks', 0); met.set('final', '…'); logBox.innerHTML = ''; build(); if (mode === '2pc') await run2pc(); else await runSaga(); }
    async function recover(){ if (!crashed || busy) return; busy = true; log('Coordinator restarted and read its durable log.'); if (crashed === '2pc'){ crashed = null; await commit2pc(); } else { crashed = null; d.setStatus('co', 'ok'); await runSaga(2); } }
    host.append(el('div', {class:'ctl-grid'}, ui.select({label:'Protocol', value:'2pc', options:[['2pc', 'Two-phase commit'], ['orch', 'Saga — orchestration'], ['chor', 'Saga — choreography']], onChange:v => { mode = v; build(); }}).el, ui.select({label:'Inject failure', value:'none', options:[['none', 'No failure'], ['pay', 'Payment declines'], ['rest', 'Restaurant rejects'], ['deliv', 'No rider available'], ['crash', 'Coordinator/orchestrator crashes mid-way']], onChange:v => fail = v}).el),
      el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('▶ Run', run, 'sm primary'), ui.button('♻️ Recover coordinator', recover, 'sm ok')), holder, res, el('div', {style:{height:'10px'}}), met.el, el('h4', {style:{margin:'12px 0 6px'}}, 'Log'), logBox);
    build();
  }
});
} catch(e){ console.error('[SDA] playground saga-2pc', e); SDA.errors.push({id:'saga-2pc', error:e}); }

/* ---------------- #24 Snowflake ID bit layout ---------------- */
try {
SDA.register({kind:'playground', id:'snowflake', module:'distributed', icon:'❄️', title:'Snowflake IDs bit by bit (vs UUIDv4, UUIDv7, ULID)',
  summary:'Generate real 64-bit Snowflake IDs and watch the timestamp, datacenter, worker and sequence bits compose. Overflow the sequence, roll the clock back, and compare sortability with UUIDv4, UUIDv7 and ULID.',
  explain:`<ul><li>Generate a few IDs: only the low <b>sequence</b> bits change within a millisecond; the high <b>timestamp</b> bits make IDs sort by time.</li><li><b>Burst 5,000</b> in one millisecond: the sequence overflows at 4,096 and the generator must wait for the next millisecond.</li><li>Turn on <b>clock rollback</b>: a correct generator refuses to issue IDs rather than risk duplicates.</li><li>The <b>sortability test</b> generates IDs a few milliseconds apart: Snowflake, UUIDv7 and ULID sort in creation order; UUIDv4 doesn’t.</li></ul>`,
  real:[{co:'Twitter · Discord · Instagram', tier:'confirmed', text:'Twitter introduced Snowflake (2010, epoch 1288834974657 ms); Discord uses Snowflake-format IDs; Instagram used 41 time bits + 13 shard bits + 10 sequence bits.', src:'Twitter Engineering (2010); Discord docs; Instagram Engineering (2012)'}],
  mount(host){
    const EPOCHS = {custom:1577836800000n, twitter:1288834974657n};
    let ep = 'custom', dc = 3, wk = 7, lastMs = -1n, seq = 0n, rollback = false, ids = [], waits = 0;
    const out = el('div'); const list = el('div', {class:'lab-out', style:{maxHeight:'200px', borderRadius:'10px', border:'1px solid var(--border)'}});
    function gen(nowMs){
      let ms = BigInt(nowMs != null ? nowMs : Date.now()); if (rollback) ms = (lastMs > 0n ? lastMs : ms) - 5n; /* simulate the clock stepping 5 ms behind the last issued ID */
      if (ms < lastMs) throw new Error(`Clock moved backwards by ${lastMs - ms} ms — refusing to generate IDs`);
      if (ms === lastMs){ seq = (seq + 1n) & 4095n; if (seq === 0n){ waits++; ms = lastMs + 1n; } } else seq = 0n;
      lastMs = ms; const t = ms - EPOCHS[ep];
      return (t << 22n) | (BigInt(dc) << 17n) | (BigInt(wk) << 12n) | seq;
    }
    function show(id){
      const bits = id.toString(2).padStart(64, '0'); const seg = [[0, 1, 'sign', '--faint'], [1, 42, 'timestamp (41)', '--accent1'], [42, 47, 'datacenter (5)', '--c-lb'], [47, 52, 'worker (5)', '--c-cache'], [52, 64, 'sequence (12)', '--c-db']];
      const ts = Number((id >> 22n) + EPOCHS[ep]);
      out.innerHTML = '';
      out.append(el('div', {class:'mono', style:{fontSize:'clamp(13px,2.4vw,20px)', fontWeight:'700', wordBreak:'break-all'}}, id.toString()));
      out.append(el('div', {style:{display:'flex', flexWrap:'wrap', gap:'1px', margin:'10px 0', font:'600 12px var(--font-mono)'}, role:'img', 'aria-label':'64 bits of the ID'}, ...seg.flatMap(([a, b, , c]) => bits.slice(a, b).split('').map(ch => el('span', {style:{width:'14px', textAlign:'center', padding:'3px 0', borderRadius:'3px', background:`color-mix(in srgb, var(${c}) 30%, transparent)`, color:'var(--text)'}}, ch)))));
      out.append(el('div', {class:'legend'}, ...seg.map(([, , n, c]) => el('span', null, el('span', {style:{display:'inline-block', width:'12px', height:'10px', borderRadius:'3px', background:`var(${c})`, marginRight:'5px'}}), n))));
      out.append(frag(h.table(['Field', 'Bits', 'Value'], [['Timestamp', '41', `${(id >> 22n).toString()} ms since epoch → ${new Date(ts).toISOString()}`], ['Datacenter', '5', String(Number((id >> 17n) & 31n))], ['Worker', '5', String(Number((id >> 12n) & 31n))], ['Sequence', '12', String(Number(id & 4095n))]])));
    }
    function one(){ try { const id = gen(); ids.unshift(id); list.prepend(el('div', {class:'ln'}, id.toString())); show(id); } catch(e){ list.prepend(el('div', {class:'ln err'}, '✗ ' + e.message)); } }
    function burst(){ waits = 0; const now = Date.now(); let id; try { for (let i = 0; i < 5000; i++) id = gen(Math.max(now, Number(lastMs))); show(id); list.prepend(el('div', {class:'ln warn'}, `Generated 5,000 IDs in one requested millisecond: the sequence wrapped ${waits} time(s), so the generator advanced to the next millisecond (in real code: spin-wait).`)); } catch(e){ list.prepend(el('div', {class:'ln err'}, '✗ ' + e.message)); } }
    const hex = (n, len) => n.toString(16).padStart(len, '0');
    const rnd = bits => { const a = new Uint32Array(Math.ceil(bits / 32)); crypto.getRandomValues(a); let v = 0n; a.forEach(x => v = (v << 32n) | BigInt(x)); return v & ((1n << BigInt(bits)) - 1n); };
    const uuid = v => `${hex(v >> 96n, 8)}-${hex((v >> 80n) & 0xffffn, 4)}-${hex((v >> 64n) & 0xffffn, 4)}-${hex((v >> 48n) & 0xffffn, 4)}-${hex(v & 0xffffffffffffn, 12)}`;
    const uuid4 = () => uuid((rnd(128) & ~(0xfn << 76n) | (4n << 76n)) & ~(0x3n << 62n) | (2n << 62n));
    const uuid7 = ms => uuid((BigInt(ms) << 80n) | (7n << 76n) | (rnd(12) << 64n) | (2n << 62n) | rnd(62));
    const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const ulid = ms => { let v = (BigInt(ms) << 80n) | rnd(80), s = ''; for (let i = 0; i < 26; i++){ s = B32[Number(v & 31n)] + s; v >>= 5n; } return s; };
    const cmpOut = el('div');
    function sortTest(){
      const base = Date.now(); const rows = [];
      const fmts = {Snowflake:i => { lastMs = -1n; seq = 0n; return gen(base + i * 3).toString().padStart(20, '0'); }, 'UUIDv4':() => uuid4(), 'UUIDv7':i => uuid7(base + i * 3), 'ULID':i => ulid(base + i * 3)};
      Object.entries(fmts).forEach(([n, f]) => { const arr = Array.from({length:6}, (_, i) => f(i)); const sorted = arr.slice().sort(); const ok = arr.every((x, i) => x === sorted[i]); rows.push([`<b>${n}</b>`, `<span class="mono" style="font-size:12px">${arr.map(esc).join('<br>')}</span>`, ok ? '<b style="color:var(--ok)">✓ sorts in creation order</b>' : '<b style="color:var(--bad)">✗ random order</b>']); });
      cmpOut.innerHTML = ''; cmpOut.append(frag(h.table(['Format', '6 IDs created 3 ms apart (in order)', 'Sorted as strings?'], rows)));
      lastMs = -1n;
    }
    host.append(el('div', {class:'ctl-grid'}, ui.select({label:'Epoch', value:'custom', options:[['custom', 'Custom: 2020-01-01'], ['twitter', 'Twitter’s: 2010-11-04 (1288834974657)']], onChange:v => { ep = v; lastMs = -1n; }}).el, ui.slider({label:'Datacenter ID (5 bits)', min:0, max:31, step:1, value:dc, fmt:v => v, onInput:v => dc = v}).el, ui.slider({label:'Worker ID (5 bits)', min:0, max:31, step:1, value:wk, fmt:v => v, onInput:v => wk = v}).el),
      el('div', {class:'row', style:{margin:'10px 0', gap:'14px'}}, ui.toggle({label:'⏪ Clock steps back 5 ms behind the last ID (NTP correction)', checked:false, onChange:v => rollback = v}).el),
      el('div', {class:'controls'}, ui.button('❄️ Generate one', one, 'sm primary'), ui.button('💥 Burst 5,000 in one ms', burst, 'sm'), ui.button('🔤 Sortability test', sortTest, 'sm')),
      el('div', {class:'card', style:{margin:'12px 0'}}, out), el('b', null, 'Recent IDs'), list, el('h4', {style:{margin:'16px 0 6px'}}, 'UUIDv4 vs UUIDv7 vs ULID vs Snowflake'), cmpOut,
      el('p', {class:'lab-hint'}, `Capacity: 2⁴¹ ms ≈ 69.7 years from the epoch; 1,024 generators; 4,096 IDs per ms each. UUIDv4/v7 and ULID here are generated with crypto.getRandomValues per RFC 9562 and the ULID spec.`));
    one(); sortTest();
  }
});
} catch(e){ console.error('[SDA] playground snowflake', e); SDA.errors.push({id:'snowflake', error:e}); }

/* ---------------- #27 Vector clocks & CRDT counters ---------------- */
try {
SDA.register({kind:'playground', id:'vector-clock', module:'distributed', icon:'🕰️', title:'Vector clocks, Lamport clocks & CRDT counters',
  summary:'Build a space-time diagram with three processes: create events, send messages, deliver them in any order, then compare any two events. A second tab merges CRDT counters across replicas.',
  explain:`<ul><li>Click two events to compare them. Vector clocks tell you exactly whether one <b>happened before</b> the other or they are <b>concurrent</b>; Lamport numbers can be ordered even for concurrent events.</li><li>Leave messages pending and deliver them late or out of order — the clocks still capture causality.</li><li><b>CRDT tab:</b> increment and decrement on different replicas while “offline”, then sync in any order. The PN-Counter always converges to the true total; the last-write-wins counter loses updates.</li></ul>`,
  real:[{co:'Amazon Dynamo · Riak · Redis Enterprise', tier:'confirmed', text:'Dynamo used vector clocks to detect conflicting versions; Riak and Redis Enterprise Active-Active ship CRDT counters and sets.', src:'DeCandia et al. (2007); Riak and Redis documentation'}],
  mount(host, api){
    ui.tabs(host, [{id:'clk', label:'🕰️ Clocks', render:p => clocks(p)}, {id:'crdt', label:'🧬 CRDT counters', render:p => crdts(p)}]);
    function clocks(p){
      const PN = ['A', 'B', 'C'];
      let evs, pend, L, V, sel, nextMsg;
      const reset = () => { evs = []; pend = []; L = [0, 0, 0]; V = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; sel = []; nextMsg = 1; draw(); };
      const add = (pi, type, extra) => { const e = Object.assign({id:evs.length, p:pi, type, lam:L[pi], vc:V[pi].slice()}, extra || {}); evs.push(e); return e; };
      const local = pi => { L[pi]++; V[pi][pi]++; add(pi, 'local'); draw(); };
      const send = (pi, to) => { L[pi]++; V[pi][pi]++; const e = add(pi, 'send', {msg:nextMsg, to}); pend.push({id:nextMsg++, from:pi, to, lam:L[pi], vc:V[pi].slice(), sendEv:e.id}); draw(); if (autoDel) deliver(pend[pend.length - 1].id); };
      const deliver = id => { const m = pend.find(x => x.id === id); if (!m) return; pend = pend.filter(x => x !== m); const pi = m.to; L[pi] = Math.max(L[pi], m.lam) + 1; V[pi] = V[pi].map((v, k) => Math.max(v, m.vc[k])); V[pi][pi]++; add(pi, 'recv', {msg:m.id, from:m.from, sendEv:m.sendEv}); draw(); };
      let autoDel = false;
      const svgBox = el('div', {class:'chart-box', style:{overflowX:'auto'}}); const rel = el('div', {style:{marginTop:'10px'}}); const pendBox = el('div', {class:'pill-row'});
      function draw(){
        const W = Math.max(700, 120 + evs.length * 54), H = 260, Y = i => 50 + i * 80, X = e => 100 + e.id * 54;
        const s = sv('svg', {viewBox:`0 0 ${W} ${H}`, role:'img', style:{minWidth:W + 'px'}}); const t = sv('title'); t.textContent = 'Space-time diagram of processes A, B and C'; s.append(t);
        PN.forEach((n, i) => { const l = sv('line', {x1:60, y1:Y(i), x2:W - 10, y2:Y(i), 'stroke-width':2}); l.style.stroke = css('--border-strong'); s.append(l); const tx = sv('text', {x:20, y:Y(i) + 5}); tx.style.font = '700 15px var(--font-ui)'; tx.style.fill = css('--text'); tx.textContent = n; s.append(tx); });
        evs.filter(e => e.type === 'recv').forEach(e => { const se = evs[e.sendEv]; const a = sv('line', {x1:X(se), y1:Y(se.p), x2:X(e), y2:Y(e.p), 'stroke-width':1.6, 'marker-end':''}); a.style.stroke = css('--accent1'); s.append(a); });
        pend.forEach(m => { const se = evs[m.sendEv]; const a = sv('line', {x1:X(se), y1:Y(se.p), x2:X(se) + 40, y2:(Y(se.p) + Y(m.to)) / 2, 'stroke-dasharray':'4 4', 'stroke-width':1.6}); a.style.stroke = css('--warn'); s.append(a); });
        evs.forEach(e => { const g = sv('g', {transform:`translate(${X(e)} ${Y(e.p)})`}); g.style.cursor = 'pointer'; const on = sel.includes(e.id); const c = sv('circle', {r:on ? 9 : 7}); c.style.fill = e.type === 'local' ? css('--c-service') : e.type === 'send' ? css('--accent1') : css('--c-db'); c.style.stroke = on ? css('--text') : 'none'; c.style.strokeWidth = '2.5'; g.append(c); const t1 = sv('text', {y:-14, 'text-anchor':'middle'}); t1.style.font = '10px var(--font-mono)'; t1.style.fill = css('--text'); t1.textContent = `[${e.vc.join(',')}]`; g.append(t1); const t2 = sv('text', {y:24, 'text-anchor':'middle'}); t2.style.font = '10px var(--font-mono)'; t2.style.fill = css('--muted'); t2.textContent = 'L' + e.lam; g.append(t2); g.addEventListener('click', () => { sel = sel.includes(e.id) ? sel.filter(x => x !== e.id) : sel.concat(e.id).slice(-2); draw(); }); s.append(g); });
        svgBox.innerHTML = ''; svgBox.append(s);
        pendBox.innerHTML = ''; pendBox.append(el('span', {class:'lab-hint'}, pend.length ? 'In flight (deliver in any order):' : 'No messages in flight.')); pend.forEach(m => pendBox.append(ui.button(`📨 #${m.id} ${PN[m.from]}→${PN[m.to]} deliver`, () => deliver(m.id), 'sm')));
        rel.innerHTML = '';
        if (sel.length === 2){ const [a, b] = sel.map(i => evs[i]); const le = (x, y) => x.vc.every((v, k) => v <= y.vc[k]); const r = le(a, b) && !le(b, a) ? 'ab' : le(b, a) && !le(a, b) ? 'ba' : 'conc'; const nm = e => `${PN[e.p]}${e.id}`;
          rel.append(el('div', {class:'verdict ' + (r === 'conc' ? 'warn' : 'ok')}, r === 'conc' ? `${nm(a)} [${a.vc}] and ${nm(b)} [${b.vc}] are CONCURRENT: neither vector is ≤ the other. Lamport says L${a.lam} vs L${b.lam} — an order that means nothing causally.` : `${r === 'ab' ? nm(a) : nm(b)} HAPPENED BEFORE ${r === 'ab' ? nm(b) : nm(a)}: every entry of [${(r === 'ab' ? a : b).vc}] ≤ [${(r === 'ab' ? b : a).vc}]. Lamport agrees (L${(r === 'ab' ? a : b).lam} < L${(r === 'ab' ? b : a).lam}).`)); }
        else rel.append(el('div', {class:'lab-hint'}, 'Click two events to compare them.'));
      }
      const ctl = el('div', {class:'stack'});
      PN.forEach((n, i) => ctl.append(el('div', {class:'row'}, el('b', {style:{width:'70px'}}, 'Process ' + n), ui.button('● local event', () => local(i), 'sm'), ...PN.map((m, j) => j === i ? null : ui.button(`✉️ send → ${m}`, () => send(i, j), 'sm')).filter(Boolean))));
      p.append(ctl, el('div', {class:'row', style:{margin:'10px 0', gap:'14px'}}, ui.toggle({label:'Deliver messages instantly', checked:false, onChange:v => autoDel = v}).el, ui.button('📋 Load an example', () => { reset(); local(0); send(0, 1); local(2); send(2, 1); deliver(2); deliver(1); local(1); send(1, 0); local(2); deliver(3); }, 'sm'), ui.button('↺ Reset', reset, 'sm ghost')), pendBox, svgBox, rel, el('div', {class:'legend', style:{marginTop:'8px'}}, el('span', {style:{color:'var(--c-service)'}}, '● local'), el('span', {style:{color:'var(--accent1)'}}, '● send'), el('span', {style:{color:'var(--c-db)'}}, '● receive'), el('span', null, '[vector clock] above · Lamport below')));
      reset();
    }
    function crdts(p){
      const R = ['A', 'B', 'C']; let st, truth;
      const reset = () => { st = R.map(() => ({P:[0, 0, 0], N:[0, 0, 0], lww:{v:0, ts:0}})); truth = 0; draw(); };
      const val = s => s.P.reduce((a, b) => a + b, 0) - s.N.reduce((a, b) => a + b, 0);
      let clock = 0;
      const op = (i, d) => { const s = st[i]; if (d > 0) s.P[i]++; else s.N[i]++; truth += d; s.lww = {v:s.lww.v + d, ts:++clock}; draw(); };
      const merge = (i, j) => { const a = st[i], b = st[j]; const P = a.P.map((v, k) => Math.max(v, b.P[k])), N = a.N.map((v, k) => Math.max(v, b.N[k])); const lw = a.lww.ts >= b.lww.ts ? a.lww : b.lww; [a, b].forEach(x => { x.P = P.slice(); x.N = N.slice(); x.lww = {...lw}; }); draw(); };
      const out = el('div');
      function draw(){
        const rows = st.map((s, i) => [`<b>Replica ${R[i]}</b>`, `<span class="mono">P[${s.P}] N[${s.N}]</span>`, `<b>${val(s)}</b>`, `<span class="mono">${s.lww.v}</span> <span class="lab-hint">(ts ${s.lww.ts})</span>`]);
        out.innerHTML = ''; out.append(frag(h.table(['Replica', 'PN-Counter state', 'PN value', 'Last-write-wins counter'], rows, [2, 3])));
        const conv = st.every(s => val(s) === val(st[0])), lwwOk = st.every(s => s.lww.v === truth);
        out.append(el('div', {class:'verdict ' + (conv && val(st[0]) === truth ? 'ok' : 'warn')}, `True total of all increments/decrements: ${truth}. ${conv ? `All PN replicas agree on ${val(st[0])}${val(st[0]) === truth ? ' ✓' : ''}.` : 'PN replicas haven’t all synced yet — keep merging.'} ${conv && !lwwOk ? `The LWW counter shows ${st[0].lww.v}: updates were overwritten and lost.` : ''}`));
      }
      p.append(el('div', {class:'stack'}, ...R.map((n, i) => el('div', {class:'row'}, el('b', {style:{width:'90px'}}, 'Replica ' + n), ui.button('+1', () => op(i, 1), 'sm ok'), ui.button('−1', () => op(i, -1), 'sm danger')))), el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('🔄 Sync A ⇄ B', () => merge(0, 1), 'sm'), ui.button('🔄 Sync B ⇄ C', () => merge(1, 2), 'sm'), ui.button('🔄 Sync A ⇄ C', () => merge(0, 2), 'sm'), ui.button('↺ Reset', reset, 'sm ghost')), out, el('p', {class:'lab-hint'}, 'Try: A +1 +1, B +1, C −1 (all “offline”), then sync pairs in any order, even repeatedly. Merge = element-wise max of the P and N vectors.'));
      reset();
    }
  }
});
} catch(e){ console.error('[SDA] playground vector-clock', e); SDA.errors.push({id:'vector-clock', error:e}); }
})();
