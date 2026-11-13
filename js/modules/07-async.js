
/* =====================================================================
   PART 5 · MODULE 7 — ASYNC & PIPELINES
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, sv, esc, clamp, fmtNum, fmtBytes} = SDA.u; const ui = SDA.ui;
const {sortGame, lineChart} = SDA.m1helpers; const {fnv, css, frag} = SDA.ph;
const wait = ms => new Promise(r => setTimeout(r, SDA.reduced ? 60 : ms));

/* ---------- widgets ---------- */
function poisonDemo(host){
  let mode = 'none', timers = [], running = false;
  const box = el('div', {class:'pill-row', style:{margin:'12px 0', gap:'8px'}}); const dlq = el('div', {class:'pill-row'}); const res = el('div', {class:'verdict warn', role:'status'}, 'Pick a policy and press Run.');
  SDA.onDispose(() => timers.forEach(clearTimeout));
  const msgs = () => Array.from({length:8}, (_, i) => ({id:i + 1, poison:i === 2, st:'pending', tries:0}));
  let M = msgs();
  const chip = m => el('span', {class:'chip mono', style:{padding:'8px 12px', borderColor:m.st === 'done' ? 'var(--ok)' : m.st === 'work' ? 'var(--accent1)' : m.st === 'dlq' ? 'var(--warn)' : m.st === 'fail' ? 'var(--bad)' : 'var(--border)', background:m.st === 'done' ? 'var(--ok-bg)' : m.st === 'fail' ? 'var(--bad-bg)' : 'var(--surface-2)'}}, `#${m.id}${m.poison ? ' ☠' : ''}${m.tries ? ' ×' + m.tries : ''}`);
  const paint = () => { box.innerHTML = ''; M.filter(m => m.st !== 'dlq').forEach(m => box.append(chip(m))); dlq.innerHTML = ''; dlq.append(el('b', {style:{marginRight:'6px'}}, 'Dead-letter queue:')); const d = M.filter(m => m.st === 'dlq'); if (!d.length) dlq.append(el('span', {class:'muted'}, 'empty')); d.forEach(m => dlq.append(chip(m))); };
  function run(){
    if (running) return; running = true; timers.forEach(clearTimeout); timers = []; M = msgs(); paint(); let i = 0, stuck = 0;
    const step = () => {
      const m = M.find(x => x.st === 'pending' || x.st === 'fail' || x.st === 'work');
      if (!m){ res.className = 'verdict ok'; res.textContent = `Done: ${M.filter(x => x.st === 'done').length} processed, ${M.filter(x => x.st === 'dlq').length} parked in the DLQ for a human or a fix-and-replay.`; running = false; return; }
      m.st = 'work'; m.tries++; paint();
      timers.push(setTimeout(() => {
        if (!m.poison){ m.st = 'done'; }
        else if (mode === 'dlq' && m.tries >= 3){ m.st = 'dlq'; }
        else { m.st = 'fail'; stuck++; if (mode === 'none' && m.tries >= 8){ paint(); res.className = 'verdict bad'; res.textContent = `Stuck: message #3 failed ${m.tries} times and blocks everything behind it (#4–#8 never processed). In a real system this retries forever, the partition lag grows, and alerts fire.`; running = false; return; } }
        paint(); timers.push(setTimeout(step, SDA.reduced ? 30 : 250));
      }, SDA.reduced ? 30 : 420));
    };
    step();
  }
  host.append(el('div', {class:'row', style:{gap:'14px'}}, ui.select({label:'Failure policy', value:'none', options:[['none', 'Retry forever (no DLQ)'], ['dlq', 'Retry 3×, then dead-letter queue']], onChange:v => mode = v}).el, ui.button('▶ Run', run, 'sm primary')), box, dlq, el('div', {style:{height:'10px'}}), res);
  paint();
}
function backpressureSim(host){
  const P = {strat:'unbounded', cap:150, cons:150};
  const cv = el('canvas', {height:440, style:{height:'220px'}, 'aria-label':'Queue depth over 60 seconds'}); const box = el('div', {class:'chart-box', style:{marginTop:'12px'}}, cv);
  const met = ui.metrics(null, [{id:'q', label:'Max queue depth', instant:true}, {id:'mem', label:'Max buffer memory', instant:true, fmt:fmtBytes}, {id:'lat', label:'Max wait in queue', unit:'s', instant:true, warn:5, bad:20, fmt:v => v.toFixed(1)}, {id:'drop', label:'Dropped', instant:true, bad:1}, {id:'blk', label:'Producer blocked', unit:'s', instant:true, fmt:v => v.toFixed(1)}]);
  function run(){
    const T = 60, dt = .1, BUF = 2000; let q = 0, maxQ = 0, drop = 0, blk = 0, cons = P.cons, lagSince = -1, scaleAt = -1; const qs = [], cs = [];
    for (let t = 0; t < T; t += dt){
      const burst = (t % 15) < 4; let inRate = burst ? 450 : 100; let inN = inRate * dt;
      if (P.strat === 'autoscale'){ if (q > 300 && lagSince < 0) lagSince = t; if (lagSince >= 0 && t - lagSince > 3 && scaleAt < 0){ scaleAt = t + 4; } if (scaleAt > 0 && t >= scaleAt){ cons = P.cons * 3; } if (q === 0 && t > scaleAt + 5 && scaleAt > 0){ cons = P.cons; scaleAt = -1; lagSince = -1; } }
      if (P.strat !== 'unbounded' && P.strat !== 'autoscale' && q + inN > BUF){ const room = Math.max(0, BUF - q); if (P.strat === 'drop') drop += inN - room; else blk += dt * (1 - room / inN); inN = room; }
      q = Math.max(0, q + inN - cons * dt); maxQ = Math.max(maxQ, q); qs.push(q); cs.push(cons);
    }
    met.set('q', maxQ); met.set('mem', maxQ * 1000); met.set('lat', maxQ / P.cons); met.set('drop', drop); met.set('blk', blk);
    const W = box.clientWidth || 640, H = 220; cv.width = W * 2; const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0);
    const mx = Math.max(BUF * 1.1, maxQ); g.font = '11px ' + css('--font-mono'); g.fillStyle = css('--muted'); g.fillText(`queue depth (max ${fmtNum(maxQ)} msgs)`, 10, 14);
    if (P.strat === 'drop' || P.strat === 'block'){ const y = H - 20 - BUF / mx * (H - 40); g.strokeStyle = css('--bad'); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(10, y); g.lineTo(W - 10, y); g.stroke(); g.setLineDash([]); g.fillStyle = css('--bad'); g.fillText('buffer limit', W - 90, y - 4); }
    g.strokeStyle = css('--c-queue'); g.lineWidth = 2; g.beginPath(); qs.forEach((v, i) => { const x = 10 + i / qs.length * (W - 20), y = H - 20 - v / mx * (H - 40); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.lineWidth = 1;
    g.fillStyle = css('--muted'); g.fillText('0 s', 10, H - 4); g.fillText('60 s', W - 40, H - 4);
  }
  host.append(el('div', {class:'ctl-grid'}, ui.select({label:'Strategy when producers outpace consumers', value:'unbounded', options:[['unbounded', 'Unbounded buffer (just queue it)'], ['drop', 'Bounded buffer, drop overflow (load shedding)'], ['block', 'Bounded buffer, block producers (backpressure)'], ['autoscale', 'Autoscale consumers on lag']], onChange:v => { P.strat = v; run(); }}).el, ui.slider({label:'Consumer capacity', min:80, max:400, step:10, value:150, fmt:v => v + ' msg/s', onInput:v => { P.cons = v; run(); }}).el), box, el('div', {style:{height:'10px'}}), met.el, el('p', {class:'lab-hint'}, 'Traffic: 100 msg/s with 4-second bursts of 450 msg/s every 15 s. Buffer limit 2,000 messages (~1 KB each). Autoscaling triggers after 3 s of lag > 300 and takes 4 s to start new consumers.'));
  run();
}
function eventSourcingDemo(host){
  let events = [{t:'Opened', amt:0}], snap = null, at = 0;
  const out = el('div'); const tslider = el('input', {type:'range', min:'0', max:'0', value:'0', 'aria-label':'Time travel: state after event N'}); const tlab = el('span', {class:'mono'});
  const amt = el('input', {class:'input', type:'number', value:'500', min:'1', style:{width:'110px'}, 'aria-label':'Amount'});
  const replay = (upto, fromSnap) => { let bal = 0, n = 0, start = 0; if (fromSnap && snap && snap.idx <= upto){ bal = snap.bal; start = snap.idx + 1; } for (let i = start; i <= upto; i++){ const e = events[i]; n++; if (e.t === 'Deposited') bal += e.amt; if (e.t === 'Withdrew') bal -= e.amt; } return {bal, n}; };
  function render(msg){
    tslider.max = String(events.length - 1); if (at > events.length - 1 || +tslider.value === events.length - 2) at = events.length - 1; tslider.value = String(at); tlab.textContent = `after event #${at + 1}`;
    const cur = replay(at, false), fast = replay(events.length - 1, true);
    out.innerHTML = '';
    out.append(frag(h.table(['#', 'Event (immutable, append-only)', 'Balance after'], events.map((e, i) => [String(i + 1), `${e.t}${e.amt ? ' ₹' + e.amt : ''}${e.note ? ` <span class="lab-hint">${e.note}</span>` : ''}`, '₹' + replay(i, false).bal]).map((r, i) => i <= at ? r : r.map(c => `<span style="opacity:.35">${c}</span>`)), [2])));
    out.append(el('div', {class:'verdict ok'}, `State at event #${at + 1}: balance ₹${cur.bal} (rebuilt by replaying ${cur.n} event(s)). Current state with ${snap ? `snapshot at #${snap.idx + 1}` : 'no snapshot'}: replayed ${fast.n} event(s).`));
    if (msg) out.append(el('div', {class:'verdict ' + (msg[0] === '✗' ? 'bad' : 'warn')}, msg));
  }
  tslider.addEventListener('input', () => { at = +tslider.value; render(); });
  const cmd = kind => { const a = Math.max(1, +amt.value || 0); const bal = replay(events.length - 1, false).bal; if (kind === 'w' && a > bal){ render(`✗ Command rejected: withdraw ₹${a} exceeds balance ₹${bal}. Commands are validated against current state; only valid commands become events.`); return; } events.push({t:kind === 'd' ? 'Deposited' : 'Withdrew', amt:a}); at = events.length - 1; render(); };
  host.append(el('div', {class:'row'}, amt, ui.button('➕ Deposit', () => cmd('d'), 'sm primary'), ui.button('➖ Withdraw', () => cmd('w'), 'sm'), ui.button('📸 Snapshot now', () => { snap = {idx:events.length - 1, bal:replay(events.length - 1, false).bal}; render(`Snapshot saved at event #${snap.idx + 1}. Rebuilding current state now starts from it.`); }, 'sm'), ui.button('🩹 Fix a mistake', () => { const last = [...events].reverse().find(e => e.t === 'Deposited'); if (!last){ render('No deposit to correct.'); return; } events.push({t:'Withdrew', amt:last.amt, note:'(correction: reverses a mistaken deposit)'}); at = events.length - 1; render('Events are never edited or deleted — mistakes are fixed with a new compensating event, preserving the audit trail.'); }, 'sm ghost')), el('label', {class:'field', style:{margin:'12px 0'}}, el('span', null, '⏳ Time travel', tlab), tslider), out);
  [['d', 1000], ['w', 200], ['d', 300]].forEach(([k, a]) => { amt.value = a; cmd(k); }); amt.value = 500; render();
}
function mapReduceDemo(host){
  const ta = el('textarea', {class:'input mono', rows:4, 'aria-label':'Input text, one split per line'}); ta.value = 'chai samosa chai\nsamosa jalebi chai\njalebi chai lassi';
  const out = el('div'); let stage = 3;
  function run(){
    const splits = ta.value.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 6); const R = 2;
    const mapped = splits.map(s => s.toLowerCase().split(/[^a-zऀ-ॿ]+/).filter(Boolean).map(w => [w, 1]));
    const part = Array.from({length:R}, () => ({}));
    mapped.flat().forEach(([w]) => { const r = fnv(w) % R; (part[r][w] = part[r][w] || []).push(1); });
    const reduced = part.map(p => Object.entries(p).map(([w, ones]) => [w, ones.length]).sort((a, b) => b[1] - a[1]));
    out.innerHTML = '';
    const col = (title, items, show) => el('div', {class:'card', style:{opacity:show ? '1' : '.3', transition:'opacity .3s'}}, el('b', null, title), el('div', {class:'stack', style:{marginTop:'6px', gap:'6px'}}, ...items));
    out.append(el('div', {class:'grid c3'},
      col('① Map (one task per split)', mapped.map((m, i) => el('div', {class:'mono', style:{fontSize:'12px'}}, `split ${i + 1}: ` + m.map(([w]) => `(${w},1)`).join(' '))), stage >= 1),
      col(`② Shuffle (hash(word) mod ${R})`, part.map((p, i) => el('div', {class:'mono', style:{fontSize:'12px'}}, `reducer ${i + 1}: ` + Object.entries(p).map(([w, o]) => `${w}→[${o.join(',')}]`).join(' '))), stage >= 2),
      col('③ Reduce (sum per word)', reduced.map((r, i) => el('div', {class:'mono', style:{fontSize:'12px'}}, `reducer ${i + 1}: ` + r.map(([w, c]) => `${w}=${c}`).join(', '))), stage >= 3)));
  }
  ta.addEventListener('input', run);
  host.append(ta, el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('⏮ Reset', () => { stage = 0; run(); }, 'sm ghost'), ui.button('⏭ Next phase', () => { stage = Math.min(3, stage + 1); run(); }, 'sm primary'), ui.button('Show all', () => { stage = 3; run(); }, 'sm')), out);
  stage = 0; run();
}
function windowDemo(host){
  const P = {late:2}; let ev = []; const out = el('div');
  const gen = () => { ev = []; for (let s = 0; s < 60; s += .2){ if (Math.random() < .55){ const r = Math.random(); const delay = r < .8 ? Math.random() * 1.5 : r < .97 ? 2 + Math.random() * 4 : 8 + Math.random() * 10; ev.push({et:s, at:s + delay}); } } ev.sort((a, b) => a.at - b.at); run(); };
  function run(){
    const WIN = 10, wins = {}; let wm = -Infinity, maxEt = -Infinity, dropped = 0;
    for (let w = 0; w < 6; w++) wins[w] = {truth:0, got:0, late:0, emitAt:null};
    ev.forEach(e => { wins[Math.floor(e.et / WIN)].truth++; });
    ev.forEach(e => {
      maxEt = Math.max(maxEt, e.et); wm = maxEt - P.late; const w = wins[Math.floor(e.et / WIN)];
      if (w.emitAt != null){ w.late++; dropped++; } else w.got++;
      for (let k = 0; k < 6; k++){ if (wins[k].emitAt == null && wm >= (k + 1) * WIN) wins[k].emitAt = e.at; }
    });
    out.innerHTML = '';
    out.append(frag(h.table(['Window (event time)', 'True count', 'Emitted count', 'Late & dropped', 'Emitted at (processing time)'], Object.entries(wins).map(([k, w]) => [`${k * WIN}–${(+k + 1) * WIN} s`, String(w.truth), w.got === w.truth ? `<span style="color:var(--ok)">${w.got}</span>` : `<span style="color:var(--bad)">${w.got}</span>`, w.late ? `<span style="color:var(--bad)">${w.late}</span>` : '0', w.emitAt == null ? 'still open' : `${w.emitAt.toFixed(1)} s (+${(w.emitAt - (+k + 1) * WIN).toFixed(1)} s)`]), [1, 2, 3])));
    out.append(el('div', {class:'verdict ' + (dropped ? 'warn' : 'ok')}, dropped ? `With ${P.late} s allowed lateness, ${dropped} late event(s) arrived after their window had already been emitted — the result is fast but slightly wrong. Increase lateness for accuracy at the cost of delay.` : `All events were counted: correct results, emitted ~${P.late} s after each window ends.`));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Allowed lateness (watermark delay)', min:0, max:20, step:.5, value:2, fmt:v => v + ' s', onInput:v => { P.late = v; run(); }}).el), el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('🎲 New event stream', gen, 'sm')), out, el('p', {class:'lab-hint'}, 'Events happen over 60 s (event time) but reach the processor late: most within 1.5 s, some 2–6 s, a few 8–18 s (phones offline, retries). Tumbling 10-second windows close when the watermark (max event time seen − allowed lateness) passes their end.'));
  gen();
}
function cdcDemo(host, api){
  let rows = [{id:1, name:'Masala Dosa', price:120}, {id:2, name:'Paneer Tikka', price:240}], lsn = 1000, nextId = 3, searchDown = false, busy = false, backlog = [];
  const holder = el('div'); const tbl = el('div'); const logBox = el('div', {class:'lab-out', style:{maxHeight:'170px', borderRadius:'10px', border:'1px solid var(--border)'}});
  const d = new api.Diagram(holder, {title:'Change data capture pipeline', w:800, h:260, alt:'A database WAL is read by a CDC connector, published to Kafka, and consumed by search, cache invalidation and a warehouse.', nodes:[{id:'app', type:'service', label:'Menu service', x:80, y:130, w:120}, {id:'db', type:'db', label:'Postgres', sub:'WAL', x:240, y:130, w:110}, {id:'cdc', type:'service', label:'CDC connector', sub:'Debezium', x:400, y:130, w:130}, {id:'k', type:'queue', label:'Kafka topic', sub:'menu.items', x:560, y:130, w:130}, {id:'es', type:'db', label:'Search index', x:720, y:45, w:120}, {id:'ca', type:'cache', label:'Cache invalidator', x:720, y:130, w:140}, {id:'wh', type:'db', label:'Warehouse', x:720, y:215, w:120}], edges:[{from:'app', to:'db'}, {from:'db', to:'cdc'}, {from:'cdc', to:'k'}, {from:'k', to:'es'}, {from:'k', to:'ca'}, {from:'k', to:'wh'}]});
  const paint = () => { tbl.innerHTML = ''; tbl.append(frag(h.table(['id', 'name', 'price'], rows.map(r => [String(r.id), esc(r.name), '₹' + r.price]), [2]))); };
  async function change(op){
    if (busy) return; busy = true; let before = null, after = null;
    if (op === 'c'){ after = {id:nextId, name:['Vada Pav', 'Chole Bhature', 'Idli'][nextId % 3], price:60 + nextId * 10}; rows.push(after); nextId++; }
    else if (op === 'u'){ const r = rows[0]; if (!r){ busy = false; return; } before = {...r}; r.price += 10; after = {...r}; }
    else { const r = rows.pop(); if (!r){ busy = false; return; } before = r; }
    lsn += 8; paint();
    const evt = {op, before, after, source:{lsn}}; logBox.prepend(el('div', {class:'ln'}, JSON.stringify(evt)));
    await d.flow([['app', 'db', op === 'c' ? 'INSERT' : op === 'u' ? 'UPDATE' : 'DELETE'], ['db', 'cdc', 'WAL lsn ' + lsn], ['cdc', 'k', 'op=' + op]]);
    if (searchDown){ backlog.push(lsn); d.setSub('es', `down · lag ${backlog.length}`); await d.flow([['k', 'ca'], ['k', 'wh']], {parallel:true}); }
    else await d.flow([['k', 'es'], ['k', 'ca'], ['k', 'wh']], {parallel:true});
    busy = false;
  }
  host.append(el('div', {class:'controls'}, ui.button('➕ Insert dish', () => change('c'), 'sm primary'), ui.button('✏️ Update price', () => change('u'), 'sm'), ui.button('🗑 Delete dish', () => change('d'), 'sm'), ui.toggle({label:'Search consumer down', checked:false, onChange:async v => { searchDown = v; d.setStatus('es', v ? 'down' : 'ok'); if (!v && backlog.length){ d.setSub('es', `catching up ${backlog.length}`); for (const l of backlog) await d.flow([['k', 'es', 'lsn ' + l]], {dur:350}); backlog = []; d.setSub('es', 'in sync'); } }}).el), holder, el('div', {class:'grid c2'}, el('div', null, el('b', null, 'Source table'), tbl), el('div', null, el('b', null, 'Change events (Debezium-style)'), logBox)), el('p', {class:'lab-hint'}, 'The application only writes to its database. Every downstream copy is fed from the database log, in commit order. A consumer that was down resumes from its last offset and catches up in order.'));
  paint();
}
function dagDemo(host){
  const T = {extract_orders:{d:3, deps:[]}, extract_users:{d:2, deps:[]}, extract_payments:{d:2, deps:[]}, clean_orders:{d:2, deps:['extract_orders']}, join:{d:3, deps:['clean_orders', 'extract_users', 'extract_payments']}, daily_revenue:{d:2, deps:['join']}, train_model:{d:5, deps:['join']}, dashboard:{d:1, deps:['daily_revenue']}, email_report:{d:1, deps:['daily_revenue', 'train_model']}};
  const P = {workers:2, fail:'none', retries:1}; const out = el('div');
  function run(){
    const st = {}, attempts = {}; Object.keys(T).forEach(k => { st[k] = 'wait'; attempts[k] = 0; });
    let t = 0; const running = []; const gantt = []; let guard = 0;
    while (guard++ < 200){
      running.slice().forEach(r => { if (r.end <= t){ running.splice(running.indexOf(r), 1); if (r.ok){ st[r.k] = 'done'; } else if (attempts[r.k] <= P.retries){ st[r.k] = 'wait'; } else { st[r.k] = 'failed'; } } });
      Object.keys(T).forEach(k => { if (st[k] === 'wait' && T[k].deps.some(dd => st[dd] === 'failed' || st[dd] === 'upstream_failed')) st[k] = 'upstream_failed'; });
      const ready = Object.keys(T).filter(k => st[k] === 'wait' && T[k].deps.every(dd => st[dd] === 'done'));
      while (running.length < P.workers && ready.length){ const k = ready.shift(); attempts[k]++; const ok = !(k === P.fail && attempts[k] === 1) && !(k === P.fail && P.retries === 0); st[k] = 'run'; const end = t + T[k].d; running.push({k, end, ok}); gantt.push({k, s:t, e:end, ok, a:attempts[k], w:running.length - 1}); }
      if (!running.length) break;
      t = Math.min(...running.map(r => r.end));
    }
    const total = Math.max(...gantt.map(g => g.e), 0); const W = 100 / Math.max(1, total);
    out.innerHTML = '';
    Object.keys(T).forEach(k => { const bars = gantt.filter(g => g.k === k); out.append(el('div', {class:'wf-row', style:{gridTemplateColumns:'130px 1fr 110px'}}, el('span', {class:'wl mono'}, k), el('div', {class:'wf-track', style:{height:'20px'}}, ...bars.map(b => el('div', {class:'wf-bar', title:`attempt ${b.a}: ${b.s}–${b.e}`, style:{left:(b.s * W) + '%', width:((b.e - b.s) * W) + '%', background:b.ok ? 'var(--c-service)' : 'var(--bad)'}}))), el('span', {class:'wt', style:{color:st[k] === 'done' ? 'var(--ok)' : 'var(--bad)'}}, st[k].replace('_', ' ')))); });
    const ok = Object.values(st).every(s => s === 'done');
    out.append(el('div', {class:'verdict ' + (ok ? 'ok' : 'bad'), style:{marginTop:'10px'}}, ok ? `Pipeline finished in ${total} time units with ${P.workers} worker(s). Tasks ran as soon as all their upstream dependencies succeeded.` : `Pipeline failed: “${P.fail}” exhausted its retries, so everything downstream was marked upstream_failed and skipped. Independent branches still completed.`));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Parallel workers', min:1, max:4, step:1, value:2, fmt:v => v, onInput:v => { P.workers = v; run(); }}).el, ui.select({label:'Inject a failure (first attempt)', value:'none', options:[['none', 'No failure']].concat(Object.keys(T).map(k => [k, k])), onChange:v => { P.fail = v; run(); }}).el, ui.slider({label:'Retries per task', min:0, max:2, step:1, value:1, fmt:v => v, onInput:v => { P.retries = v; run(); }}).el), el('p', {class:'lab-hint'}, 'Nightly pipeline: three extracts → clean → join → (daily revenue → dashboard) and (train model) → email report. Red bars are failed attempts.'), out);
  run();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'queues-pubsub-streams', title:'Queues vs pub/sub vs event streams', minutes:9, tags:['message queue','pub/sub','event stream','broker','async'],
  summary:'A queue hands each message to one worker. Pub/sub copies each message to every subscriber. An event stream is a durable, replayable log that many consumers read at their own pace.',
  problem:`<p>When a customer places an order, you must charge the card, email a receipt, update analytics, notify the restaurant and award loyalty points. Doing it all inside the HTTP request makes checkout slow and fragile — if the email server hiccups, the order fails. You need to hand work off <strong>asynchronously</strong>. But hand it to whom: one worker, every interested service, or a log that anyone can replay?</p>`,
  intuition:`A <b>queue</b> is the token counter at a bank: each token is served by exactly one free cashier. <b>Pub/sub</b> is a WhatsApp group: every member gets every message. An <b>event stream</b> is the bank’s passbook: an ordered, permanent record anyone can read from any page, re-read later, or start reading for the first time today.`,
  how:{
    steps:[`<b>Message queue</b> (SQS, RabbitMQ queues): producers enqueue; competing consumers each take a message; it’s deleted once acknowledged. Great for distributing work.`, `<b>Pub/sub</b> (SNS, Google Pub/Sub, RabbitMQ fanout exchanges): each subscriber gets its own copy. Great for notifying many independent services.`, `<b>Event stream / log</b> (Kafka, Kinesis, Pulsar): an append-only, partitioned, retained log. Consumers track their own offsets, so many groups read independently and can <b>replay</b> history.`, `All three decouple producers from consumers in time (async), load (buffering) and knowledge (producers don’t know who consumes).`, `The cost: eventual consistency, duplicates, ordering questions and harder debugging — covered in the next lessons.`],
    diagram:{title:'One order event, three delivery styles', w:800, h:280, alt:'An order service emits an event; a queue distributes jobs to one of several workers; pub/sub copies to every subscriber; a log keeps events for replay.',
      nodes:[{id:'o', type:'service', label:'Order service', x:90, y:140, w:130}, {id:'q', type:'queue', label:'Queue', sub:'email jobs', x:300, y:50, w:120}, {id:'w1', type:'service', label:'Email worker 1', x:520, y:25, w:140}, {id:'w2', type:'service', label:'Email worker 2', x:520, y:85, w:140}, {id:'log', type:'queue', label:'Event log', sub:'orders topic', x:300, y:220, w:130}, {id:'an', type:'service', label:'Analytics', x:520, y:170, w:120}, {id:'loy', type:'service', label:'Loyalty', x:520, y:235, w:120}, {id:'new', type:'service', label:'New ML service', sub:'replays from day 1', x:700, y:200, w:150}],
      edges:[{from:'o', to:'q'}, {from:'q', to:'w1'}, {from:'q', to:'w2'}, {from:'o', to:'log'}, {from:'log', to:'an'}, {from:'log', to:'loy'}, {from:'log', to:'new', curve:-.1}],
      steps:[
        {note:'<b>Queue:</b> each email job goes to exactly <b>one</b> free worker; add workers to go faster.', flow:[['o', 'q', 'job #1'], ['q', 'w1'], ['o', 'q', 'job #2'], ['q', 'w2']]},
        {note:'<b>Pub/sub & streams:</b> every subscribed service receives its own copy of OrderPlaced.', flow:[['o', 'log', 'OrderPlaced'], ['log', 'an'], ['log', 'loy']], hl:['log']},
        {note:'<b>Event log:</b> events are retained, so a service built next month can <b>replay</b> history from offset 0 at its own pace.', flow:[['log', 'new', 'offset 0…']], hl:['new']}
      ]},
    deep:`<p><b>Push vs pull:</b> RabbitMQ pushes messages to consumers (with a prefetch limit for flow control); Kafka consumers pull batches, which gives natural backpressure and lets slow consumers fall behind without affecting others. <b>Retention vs deletion:</b> queues delete on ack; logs keep data for a time/size window (or forever with compaction), decoupling consumption from storage.</p><p><b>Choosing:</b> “do this task once” → queue; “tell everyone something happened” → pub/sub or log; “I need history, replay, multiple independent readers, high throughput, per-key ordering” → log. Many architectures combine them: a log as the backbone, with queues for task distribution behind particular consumers.</p>`
  },
  tradeoffs:{use:[`<b>Queue:</b> background jobs, email/SMS sending, image processing`, `<b>Pub/sub:</b> fan-out notifications to independent services`, `<b>Log:</b> event-driven backbones, analytics pipelines, CDC, replayable history`], avoid:[`Async when the user needs the result right now (just call synchronously)`, `A log as a work queue for long, uneven jobs (partition-level parallelism limits)`], alt:[`Synchronous calls with timeouts for request/response`, `Database-backed job tables (SKIP LOCKED) for small systems`]},
  real:[
    {co:'LinkedIn → Apache Kafka', tier:'confirmed', text:'Kafka was built at LinkedIn as a distributed log for activity and operational data; LinkedIn reported processing over 7 trillion messages a day by 2019.', src:'Kreps, Narkhede & Rao, “Kafka: a Distributed Messaging System for Log Processing”, NetDB 2011; LinkedIn Engineering (2019)'},
    {co:'Amazon SQS & SNS', tier:'confirmed', text:'SQS provides queues with competing consumers; SNS provides pub/sub topics that can fan out to many SQS queues — a common combination on AWS.', src:'AWS SQS and SNS documentation'},
    {co:'Zomato / Swiggy-style ordering', tier:'educational', text:'Order placement publishes one event; payments, restaurant notification, rider assignment and analytics each consume it independently instead of being called inside the checkout request.', src:'Simplified educational design'}
  ],
  mistakes:[`Putting slow side-effects (email, PDF generation) inside the request path`, `Using a queue where several services each need every event`, `Expecting a queue to keep history for new consumers`],
  interview:[`Say which work is synchronous and which is async, and justify queue vs pub/sub vs log`],
  tryit:{note:'Queue, pub/sub or event log?', mount:host => sortGame(host, [
    {t:'Resize each uploaded photo exactly once, using 20 workers', c:'q', why:'One job, one worker — competing consumers.'},
    {t:'Tell billing, analytics and loyalty that an order was placed', c:'p', why:'Every subscriber needs its own copy.'},
    {t:'A new fraud model must re-process the last 30 days of payments', c:'l', why:'Needs retained, replayable history.'},
    {t:'Send password-reset emails', c:'q', why:'Each email sent once by one worker.'},
    {t:'Stream database changes to search, cache and warehouse in commit order', c:'l', why:'Ordered, durable log with independent consumers (CDC).'},
    {t:'Push a “sale starts now” notice to five internal services', c:'p', why:'Broadcast to all subscribers.'}
  ], [{id:'q', label:'Queue'}, {id:'p', label:'Pub/sub'}, {id:'l', label:'Event log'}])},
  sources:[`Kreps et al., NetDB 2011`, `Jay Kreps, “The Log: What every software engineer should know about real-time data’s unifying abstraction” (2013)`, `AWS SQS/SNS documentation`]
},
{
  id:'kafka', title:'Kafka: topics, partitions, consumer groups, offsets', minutes:12, tags:['Kafka','partition','consumer group','offset','retention','compaction'],
  summary:'Kafka is a partitioned, replicated, append-only log. Partitions give parallelism and per-key ordering; consumer groups split partitions among consumers; offsets record progress; retention and compaction bound storage.',
  problem:`<p>A ride-hailing app emits 500,000 location and trip events per second. Billing needs every trip event exactly in order per trip; analytics needs all events; a fraud team wants to replay last week. One queue can’t handle the volume, ordering and replay at once. Kafka’s design answers all three — if you choose partitions and keys well.</p>`,
  intuition:`A multi-lane highway toll register. Each lane (partition) is a numbered ledger written in order. Cars of the same company always use the same lane (key → partition), so their entries stay in order. A team of auditors (consumer group) splits the lanes among themselves; each auditor bookmarks the last entry they checked (offset). Another team can audit the same ledgers independently with their own bookmarks.`,
  how:{
    steps:[`A <b>topic</b> is split into <b>partitions</b>; each partition is an ordered, append-only log of records with increasing <b>offsets</b>.`, `Producers choose a partition: by <b>key hash</b> (same key → same partition → per-key ordering) or spread evenly when there’s no key.`, `Partitions are <b>replicated</b> across brokers (leader + followers); <code>acks=all</code> + <code>min.insync.replicas</code> trade latency for durability.`, `A <b>consumer group</b> divides partitions among its members — each partition is read by exactly one consumer in the group. More consumers than partitions → idle consumers.`, `Consumers <b>commit offsets</b>; after a crash or rebalance, a consumer resumes from the last committed offset (at-least-once if you commit after processing).`, `<b>Retention</b> deletes old segments by time/size; <b>log compaction</b> keeps only the latest record per key (great for changelogs and state).`],
    diagram:{title:'Partitions and a consumer group', w:780, h:280, alt:'Producers write keyed records to three partitions; a consumer group of two consumers splits the partitions; a second group reads independently.',
      nodes:[{id:'pr', type:'service', label:'Trip service', sub:'key = trip_id', x:90, y:140, w:140}, {id:'p0', type:'queue', label:'Partition 0', x:340, y:55, w:130}, {id:'p1', type:'queue', label:'Partition 1', x:340, y:140, w:130}, {id:'p2', type:'queue', label:'Partition 2', x:340, y:225, w:130}, {id:'c1', type:'service', label:'Billing #1', sub:'P0, P1', x:610, y:85, w:130}, {id:'c2', type:'service', label:'Billing #2', sub:'P2', x:610, y:195, w:130}],
      edges:[{from:'pr', to:'p0'}, {from:'pr', to:'p1'}, {from:'pr', to:'p2'}, {from:'p0', to:'c1'}, {from:'p1', to:'c1'}, {from:'p2', to:'c2'}],
      steps:[
        {note:'Events for trip <b>T42</b> hash to Partition 1 — always — so they stay in order.', flow:[['pr', 'p1', 'T42 start'], ['pr', 'p1', 'T42 end']], hl:['p1']},
        {note:'Other trips spread across partitions, giving parallelism.', flow:[['pr', 'p0', 'T7'], ['pr', 'p2', 'T19']], parallel:true},
        {note:'The billing <b>consumer group</b> splits partitions: #1 reads P0 and P1, #2 reads P2. Each commits its offsets.', flow:[['p0', 'c1'], ['p1', 'c1'], ['p2', 'c2']], parallel:true},
        {note:'Billing #2 crashes → <b>rebalance</b>: #1 takes over P2 and resumes from P2’s last committed offset.', status:{c2:'down'}, sub:{c1:'P0, P1, P2'}, flow:[['p2', 'c1', 'from offset 812']]}
      ]},
    deep:`<p><b>Sizing partitions:</b> throughput needed ÷ per-partition throughput (producer and consumer side), and enough partitions for the consumer parallelism you want — but each partition costs file handles, replication traffic and rebalance time. Increasing partitions later changes key → partition mapping (breaks per-key ordering for existing keys), so plan ahead.</p><p><b>Durability knobs:</b> replication factor 3, <code>acks=all</code>, <code>min.insync.replicas=2</code> survives one broker loss without losing acknowledged writes. <b>Exactly-once</b> within Kafka uses idempotent producers and transactions (KIP-98). <b>Consumer lag</b> (log end offset − committed offset) is the key health metric. KRaft (KIP-500) replaced ZooKeeper for metadata. Kafka’s speed comes from sequential disk I/O, the OS page cache, batching and zero-copy transfer (<code>sendfile</code>).</p>`
  },
  tradeoffs:{use:[`High-throughput event backbones, CDC, analytics pipelines, stream processing`, `Per-key ordering at scale`, `Multiple independent consumers and replay`], avoid:[`Per-message routing logic, priorities or delayed delivery (classic brokers do this better)`, `Very few, very long-running jobs (a partition stalls behind one)`, `Tiny systems where operating Kafka costs more than it saves`], alt:[`Managed Kafka (MSK, Confluent Cloud), Kinesis, Pulsar, Redpanda`, `RabbitMQ/SQS for task queues`]},
  real:[
    {co:'LinkedIn', tier:'confirmed', text:'Created Kafka (open-sourced 2011) and reported over 7 trillion messages per day by 2019 across its clusters.', src:'LinkedIn Engineering, “How LinkedIn customizes Apache Kafka for 7 trillion messages per day” (2019)'},
    {co:'Apache Kafka design', tier:'confirmed', text:'Relies on sequential I/O, the page cache, batching and zero-copy transfer for throughput, with consumers pulling data at their own pace.', src:'Apache Kafka documentation — design'},
    {co:'Uber', tier:'inference', text:'Uber has written publicly about running Kafka at very large scale for trip and marketplace events, including tooling for consumer reliability and cross-region replication.', src:'Uber Engineering blog posts on Kafka'}
  ],
  mistakes:[`Too few partitions (can’t scale consumers later without reordering keys)`, `No key when per-entity ordering matters`, `Auto-committing offsets before processing (silent loss)`, `Ignoring consumer lag until retention deletes unread data`],
  interview:[`Explain partition = unit of parallelism and ordering; choose the key; size partitions with numbers`, `Mention consumer lag, retention and at-least-once with idempotent consumers`],
  tryit:{note:'A live Kafka-style topic: change partitions, consumers, keys, retention and compaction; inject poison messages and watch lag and the DLQ.', pg:'kafka'},
  sources:[`Kreps et al., NetDB 2011`, `Apache Kafka documentation; KIP-98; KIP-500`, `LinkedIn Engineering (2019)`]
},
{
  id:'rabbitmq-sqs', title:'RabbitMQ, SQS and Kafka compared', minutes:8, tags:['RabbitMQ','SQS','AMQP','exchange','visibility timeout','broker comparison'],
  summary:'RabbitMQ routes messages flexibly with exchanges; SQS is a fully managed queue with visibility timeouts; Kafka is a replayable log. Pick by routing, ordering, replay and ops needs.',
  problem:`<p>Your team must choose a broker for: background jobs with retries and delays, routing notifications by type and region, and an analytics firehose. One tool for everything is tempting — but each broker has a different model, and the wrong one turns simple features into weeks of workarounds.</p>`,
  intuition:`RabbitMQ is a smart post office that sorts letters into boxes by rules (exchanges and bindings). SQS is a reliable drop box managed by someone else: you drop letters, workers pick them up, and if a worker doesn’t confirm in time the letter reappears. Kafka is a public archive of every letter ever posted, readable from any page.`,
  how:{
    html:h.table(['', 'RabbitMQ', 'Amazon SQS', 'Apache Kafka'], [['Model', 'Broker with exchanges → queues (AMQP)', 'Managed queue (standard / FIFO)', 'Partitioned, replicated log'], ['Routing', 'Direct, topic (wildcards), fanout, headers', 'One queue per consumer type (use SNS for fan-out)', 'Topics + keys; consumers filter'], ['Ordering', 'Per queue (with a single consumer)', 'Best-effort (standard); per group (FIFO)', 'Per partition'], ['Delivery', 'Push with acks, prefetch', 'Pull; visibility timeout; at-least-once', 'Pull; offsets; at-least-once (EOS within Kafka)'], ['Retention / replay', 'Deleted on ack', 'Deleted on ack (max retention 14 days)', 'Retained by time/size; replay any time'], ['Retries / DLQ', 'Dead-letter exchanges, TTL, delayed plugins', 'Redrive policy (maxReceiveCount → DLQ)', 'Application-level retry topics + DLQ'], ['Ops', 'You run it (or managed)', 'Zero ops, pay per request', 'You run it (or managed)']]),
    steps:[`<b>RabbitMQ</b>: flexible routing and per-message features (priorities, TTL, dead-lettering). Quorum queues (Raft) for durability.`, `<b>SQS</b>: a message becomes invisible when received; if not deleted before the <b>visibility timeout</b>, it reappears for another consumer. After <code>maxReceiveCount</code> receives, it moves to a DLQ.`, `<b>Kafka</b>: throughput, ordering per key, retention and replay; routing and per-message niceties live in your code.`],
    stepper:{title:'SQS visibility timeout lifecycle', items:[
      {title:'Send', tag:'producer', text:'Message stored redundantly across servers.'},
      {title:'Receive', tag:'consumer A', text:'Message becomes <b>invisible</b> to others for the visibility timeout (e.g. 30 s).'},
      {title:'Work', tag:'processing', text:'Consumer A processes. If it needs longer, it can extend the timeout.'},
      {title:'Delete', tag:'success', text:'Consumer A deletes the message — done.'},
      {title:'Or reappear', tag:'failure', text:'If A crashes and never deletes, the message becomes visible again and consumer B receives it (at-least-once → be idempotent).'},
      {title:'Dead-letter', tag:'poison', text:'After maxReceiveCount failures, SQS moves it to the dead-letter queue for inspection.'}
    ]},
    deep:`<p><b>RabbitMQ</b> classic mirrored queues were superseded by <b>quorum queues</b> (Raft-based) for data safety; <b>streams</b> add a Kafka-like log. Prefetch (<code>basic.qos</code>) bounds unacknowledged messages per consumer — RabbitMQ’s backpressure. <b>SQS FIFO</b> queues give ordering within a message group and deduplication within a 5-minute window, with lower throughput limits than standard queues (higher with batching and high-throughput mode). Long polling (<code>WaitTimeSeconds</code>) cuts empty receives and cost.</p>`
  },
  tradeoffs:{use:[`<b>RabbitMQ:</b> complex routing, per-message TTL/priority, request/reply`, `<b>SQS:</b> simple, serverless job queues with zero ops`, `<b>Kafka:</b> high-throughput streams, replay, many consumers, per-key order`], avoid:[`Kafka for delayed jobs or priority queues`, `SQS standard when strict ordering matters`, `RabbitMQ as a long-term event archive`], alt:[`Google Pub/Sub, Azure Service Bus, NATS JetStream, Redis Streams`]},
  real:[
    {co:'RabbitMQ', tier:'confirmed', text:'Implements AMQP 0-9-1 with direct, topic, fanout and headers exchanges, dead-letter exchanges and Raft-based quorum queues.', src:'RabbitMQ documentation'},
    {co:'Amazon SQS', tier:'confirmed', text:'Uses visibility timeouts and redrive policies (maxReceiveCount) to move repeatedly failing messages to a dead-letter queue; retention up to 14 days.', src:'Amazon SQS developer guide'},
    {co:'Apache Kafka', tier:'confirmed', text:'Retains records by time or size and lets consumers re-read from any offset.', src:'Apache Kafka documentation'}
  ],
  mistakes:[`Visibility timeout shorter than processing time (duplicate processing)`, `No DLQ — poison messages retry forever`, `Choosing Kafka for features it deliberately doesn’t have`],
  interview:[`Name the broker and the one property that made you choose it`],
  tryit:{quiz:[
    {q:'You need jobs delayed by 15 minutes and routed by region and type with wildcards. Best fit?', options:['Kafka', 'RabbitMQ', 'A Bloom filter', 'SQS standard alone'], answer:1, why:'Topic exchanges route by pattern; TTL/dead-lettering or delayed-message plugins handle delays.'},
    {q:'An SQS consumer takes 60 s but the visibility timeout is 30 s. What happens?', options:['Nothing', 'The message reappears and another consumer processes it again', 'It’s deleted', 'SQS waits'], answer:1, why:'It becomes visible again after 30 s — duplicate processing.'},
    {q:'Ten teams need to re-read last week’s events independently. Best fit?', options:['RabbitMQ classic queue', 'SQS', 'Kafka', 'Memcached'], answer:2, why:'Retention + per-group offsets allow independent replay.'}
  ]},
  sources:[`RabbitMQ documentation`, `Amazon SQS developer guide`, `Apache Kafka documentation`]
},
{
  id:'ordering-dlq', title:'Ordering, retries and dead-letter queues', minutes:9, tags:['ordering','retry','poison message','DLQ','head-of-line blocking'],
  summary:'Ordering is only guaranteed within a partition or queue. Retries create duplicates and reordering; poison messages need a dead-letter queue so they don’t block everything behind them.',
  problem:`<p>One malformed order event (a null price) makes the consumer throw an exception. The consumer retries it… forever. Every order behind it on that partition waits; consumer lag climbs to millions; the restaurant app shows no new orders for an hour. One bad message stopped the line.</p>`,
  intuition:`A single-file queue at a ticket counter. If one person’s payment keeps failing and the clerk insists on retrying them, nobody behind gets served. A sensible clerk tries three times, then sends that person to the help desk (DLQ) and serves the next person.`,
  how:{
    steps:[`Ordering is per <b>partition</b> (Kafka), per <b>message group</b> (SQS FIFO), or per queue with a single consumer. Global ordering doesn’t scale.`, `Put everything that must stay ordered under one <b>key</b> (order ID, account ID).`, `Retries: transient errors (timeout) → retry with backoff; permanent errors (bad data) → don’t retry endlessly.`, `<b>Dead-letter queue</b>: after N attempts, park the message with error details; alert; fix and <b>replay</b>.`, `Retrying in place blocks the partition (head-of-line); a <b>retry topic</b> with delay lets newer messages proceed — at the cost of reordering for that key.`, `Make consumers <b>idempotent</b>: retries and rebalances produce duplicates.`],
    diagram:{title:'Retry topics and a DLQ', w:780, h:250, alt:'A consumer fails on a message, moves it to a retry topic with delay, and after repeated failure to a dead-letter queue.',
      nodes:[{id:'m', type:'queue', label:'orders', x:90, y:120}, {id:'c', type:'service', label:'Consumer', x:290, y:120}, {id:'r', type:'queue', label:'orders.retry', sub:'delay 1 min', x:500, y:45, w:140}, {id:'dlq', type:'queue', label:'orders.DLQ', x:500, y:200, w:130}, {id:'ops', type:'client', label:'On-call / fix & replay', x:700, y:200, w:150}],
      edges:[{from:'m', to:'c'}, {from:'c', to:'r'}, {from:'r', to:'c', curve:.2}, {from:'c', to:'dlq'}, {from:'dlq', to:'ops'}],
      steps:[
        {note:'Message #3 fails with a timeout — maybe transient. Instead of blocking, it goes to a <b>retry topic</b>; #4, #5 continue.', flow:[['m', 'c', '#3'], ['c', 'r', '#3 attempt 1']], hl:['r']},
        {note:'After the delay it’s retried — and fails again (it’s actually malformed).', flow:[['r', 'c', '#3 attempt 2'], ['c', 'r', 'fail']]},
        {note:'After the max attempts it goes to the <b>DLQ</b> with the error attached.', flow:[['r', 'c', '#3 attempt 3'], ['c', 'dlq', '#3 + error']], hl:['dlq']},
        {note:'An alert fires; an engineer fixes the bug or data and <b>replays</b> the DLQ.', flow:[['dlq', 'ops', 'alert']], hl:['ops']}
      ]},
    deep:`<p><b>Ordering vs progress trade-off:</b> if per-key order is critical (account ledger), a failure must block that key — you can park subsequent messages for the same key too (“blocked keys” set) while letting other keys proceed. Uber has written about this pattern for Kafka consumers (non-blocking retries with DLQs).</p><p><b>Classify errors:</b> deserialization/validation errors are permanent → DLQ immediately; downstream 5xx/timeouts are transient → exponential backoff with jitter; rate-limit responses → back off longer. Always alert on DLQ depth, and keep enough context (original topic, partition, offset, headers, stack trace) to replay safely.</p>`
  },
  tradeoffs:{use:[`DLQ on every consumer`, `Keyed partitions for per-entity order`, `Retry topics for transient downstream failures`], avoid:[`Infinite in-place retries`, `Global ordering requirements`, `DLQs nobody monitors`], alt:[`Blocking retries for strictly ordered ledgers (with alerts)`, `Saga timeouts and compensation for long failures`]},
  real:[
    {co:'Uber', tier:'confirmed', text:'Described building reliable reprocessing with Kafka retry topics and dead-letter queues so failing messages don’t block consumer progress.', src:'Uber Engineering, “Building Reliable Reprocessing and Dead Letter Queues with Apache Kafka” (2018)'},
    {co:'Amazon SQS', tier:'confirmed', text:'Redrive policies move messages to a DLQ after maxReceiveCount, and DLQ redrive moves them back after fixes.', src:'Amazon SQS developer guide'}
  ],
  mistakes:[`Retrying permanent errors`, `Losing message context when dead-lettering`, `Assuming retries preserve order`],
  interview:[`Mention DLQ + alerting + replay whenever you add a consumer`],
  tryit:{note:'Message #3 is poison. Compare retrying forever with a 3-attempt DLQ policy.', mount:host => poisonDemo(host)},
  sources:[`Uber Engineering (2018)`, `Amazon SQS docs`, `Confluent docs on error handling`]
},
{
  id:'backpressure', title:'Backpressure and flow control', minutes:8, tags:['backpressure','flow control','load shedding','buffer','autoscaling'],
  summary:'When producers are faster than consumers, something must give: memory (unbounded buffers), data (dropping), producers (blocking) or capacity (scaling). Choose deliberately.',
  problem:`<p>A flash sale generates 5× normal order events for ten minutes. The notification consumer can’t keep up; its in-memory buffer grows until the process runs out of memory and crashes — losing everything buffered and restarting into the same flood. “Just buffer it” turned a slowdown into an outage.</p>`,
  intuition:`A water tank fed by a tap and drained by a pipe. If the tap runs faster than the pipe, the tank fills. You can build a bigger tank (buffer, but it eventually overflows), let excess spill over (drop/shed), turn down the tap (backpressure), or add more pipes (scale consumers).`,
  how:{
    steps:[`<b>Unbounded buffers</b> hide the problem until memory runs out — and latency grows with queue length.`, `<b>Bounded buffer + block</b>: when full, the producer waits (TCP flow control, Reactive Streams demand, Kafka’s producer buffer). Pressure propagates upstream.`, `<b>Bounded buffer + drop</b>: shed load (oldest, newest, or lowest priority). Fine for telemetry, not for orders.`, `<b>Scale consumers</b> on lag — with delay, and only up to partition count in Kafka.`, `<b>Pull-based</b> consumers (Kafka) naturally apply backpressure: they only fetch what they can handle; the log absorbs the rest durably.`, `Measure: queue depth, consumer lag, age of oldest message.`],
    diagram:{title:'Pressure propagating upstream', w:760, h:230, alt:'A fast producer fills a bounded buffer; a slow consumer signals demand; the producer slows down.',
      nodes:[{id:'p', type:'service', label:'Producer', sub:'500/s', x:100, y:115}, {id:'b', type:'queue', label:'Bounded buffer', sub:'2,000 max', x:370, y:115, w:150}, {id:'c', type:'service', label:'Consumer', sub:'150/s', x:640, y:115}],
      edges:[{from:'p', to:'b'}, {from:'b', to:'c'}],
      steps:[
        {note:'The producer sends 500 msg/s; the consumer handles 150 msg/s. The buffer fills.', flow:[['p', 'b'], ['p', 'b'], ['p', 'b'], ['b', 'c']], status:{b:'hot'}},
        {note:'Buffer full → the consumer signals limited demand (or the buffer refuses writes).', flow:[['c', 'b', 'request(150)'], ['b', 'p', 'slow down']], hl:['b']},
        {note:'The producer slows to the consumer’s pace (or sheds low-value work). Memory stays bounded; latency is visible and controlled.', sub:{p:'150/s'}, status:{b:'ok'}, flow:[['p', 'b'], ['b', 'c']]}
      ]},
    deep:`<p><b>Reactive Streams</b> (and RxJava, Project Reactor, Akka Streams) formalise demand-based flow: subscribers request n items; publishers never send more. <b>TCP</b> does it with the receive window. In HTTP services, backpressure becomes <b>load shedding</b> (return 503/429 early, Module 9) and bounded thread pools/queues with rejection policies.</p><p><b>Little’s Law again:</b> a queue of 100,000 messages drained at 1,000/s means 100 s of latency for the newest message — check “age of oldest message”, not just depth, against your freshness SLO.</p>`
  },
  tradeoffs:{use:[`Bounded buffers everywhere`, `Blocking/backpressure for must-not-lose data`, `Dropping for telemetry and best-effort signals`, `Lag-based autoscaling for spiky consumers`], avoid:[`Unbounded in-memory queues`, `Autoscaling as the only plan (it’s slow and bounded)`], alt:[`Durable logs (Kafka) as shock absorbers`, `Priority queues and admission control`]},
  real:[
    {co:'Reactive Streams', tier:'confirmed', text:'An industry specification for asynchronous stream processing with non-blocking backpressure, adopted in Java 9 as java.util.concurrent.Flow.', src:'reactive-streams.org; JDK documentation'},
    {co:'Apache Kafka', tier:'confirmed', text:'Consumers pull at their own pace, so a slow consumer accumulates lag on disk rather than overwhelming itself.', src:'Apache Kafka documentation — design'},
    {co:'Kubernetes KEDA', tier:'confirmed', text:'KEDA autoscales consumers based on event-source metrics such as Kafka consumer lag or SQS queue length.', src:'KEDA documentation'}
  ],
  mistakes:[`Unbounded in-memory queues in consumers`, `Monitoring depth but not message age`, `Retry storms adding load exactly when consumers are behind`],
  interview:[`When drawing a queue, say what happens when it fills up`],
  tryit:{note:'Bursty traffic hits a consumer that’s too slow. Compare four strategies over 60 seconds.', mount:host => backpressureSim(host)},
  sources:[`reactive-streams.org`, `Apache Kafka documentation`, `Kleppmann, DDIA ch. 11`]
},
{
  id:'event-driven', title:'Event-driven architecture, event sourcing and CQRS', minutes:11, tags:['event-driven','event sourcing','CQRS','projection','read model'],
  summary:'Event-driven: services react to facts. Event sourcing: store the facts themselves as the source of truth. CQRS: separate the write model from read-optimised views.',
  problem:`<p>A wallet service stores only the current balance. A customer disputes a charge from three weeks ago: what was the balance then, and which operations produced it? The database can’t say — every update overwrote the past. Meanwhile, the “transaction history” screen runs heavy queries against the same table that handles payments.</p>`,
  intuition:`A bank passbook vs a whiteboard. The whiteboard shows only today’s balance (state). The passbook records every deposit and withdrawal (events); today’s balance is just the sum, and you can read the balance on any past date by adding up to that line. CQRS is keeping a separate, pre-summarised statement for customers to read, so tellers writing in the passbook aren’t disturbed.`,
  how:{
    steps:[`<b>Event-driven architecture</b>: services publish facts (<code>OrderPlaced</code>) and others react, instead of calling each other directly.`, `<b>Event sourcing</b>: the append-only event log <i>is</i> the system of record. Current state = replay of events (often from a snapshot).`, `Events are immutable; mistakes are fixed by new compensating events — a full audit trail.`, `<b>CQRS</b>: commands go to a write model that validates and appends events; queries hit <b>read models (projections)</b> built from the events, each shaped for a screen or query.`, `Read models are eventually consistent with the write side (projection lag).`, `Snapshots bound replay time; versioned event schemas keep old events readable.`],
    diagram:{title:'Event-sourced wallet with CQRS', w:780, h:260, alt:'Commands are validated by the write model and appended as events; projections build read models for history and balance screens.',
      nodes:[{id:'u', type:'client', label:'App', x:80, y:130}, {id:'cmd', type:'service', label:'Command handler', x:270, y:70, w:150}, {id:'es', type:'db', label:'Event store', sub:'append-only', x:470, y:70, w:140}, {id:'pj', type:'service', label:'Projector', x:470, y:200, w:120}, {id:'rm1', type:'db', label:'Balance view', x:680, y:150, w:130}, {id:'rm2', type:'db', label:'History view', x:680, y:235, w:130}],
      edges:[{from:'u', to:'cmd'}, {from:'cmd', to:'es'}, {from:'es', to:'pj'}, {from:'pj', to:'rm1'}, {from:'pj', to:'rm2'}, {from:'u', to:'rm1', curve:.25, dashed:true}],
      steps:[
        {note:'Command “Withdraw ₹200” is validated against current state (rebuilt from events), then appended as <b>Withdrew ₹200</b>.', flow:[['u', 'cmd', 'Withdraw 200'], ['cmd', 'es', 'append event']], hl:['es']},
        {note:'The projector consumes new events and updates <b>read models</b> optimised for each query.', flow:[['es', 'pj', 'Withdrew 200'], ['pj', 'rm1'], ['pj', 'rm2']], hl:['pj']},
        {note:'Queries read the views directly — fast, and isolated from the write path. They may lag by milliseconds to seconds.', flow:[['u', 'rm1', 'GET balance']], hl:['rm1']},
        {note:'Need a new report? Build a new projection by <b>replaying</b> the whole event history.', flow:[['es', 'pj', 'replay 0…n']], hl:['es']}
      ]},
    deep:`<p><b>Costs of event sourcing:</b> schema evolution of immutable events (upcasters), replay time (snapshots), eventual consistency of read models (users may not see their own write in a view — route reads to the write model or wait on a version), GDPR erasure versus immutability (crypto-shredding: encrypt per-user data and delete the key), and a steeper learning curve. Use it where the history <i>is</i> the business (ledgers, auditing, workflows), not for every CRUD screen.</p><p><b>CQRS without event sourcing</b> is common and simpler: one database for writes, CDC-fed denormalized read stores (search index, cache, materialised views). Event-driven integration between services (“event notification” vs “event-carried state transfer”, in Martin Fowler’s terms) reduces temporal coupling but makes flows harder to see — invest in tracing and an event catalogue.</p>`
  },
  tradeoffs:{use:[`<b>Event sourcing:</b> ledgers, audit-heavy domains, workflow histories, “what was true on date X”`, `<b>CQRS:</b> very different read and write shapes or scales`, `<b>Event-driven:</b> decoupling many services that react to the same facts`], avoid:[`Event sourcing for simple CRUD`, `CQRS where one well-indexed table suffices`, `Events as a hidden RPC mechanism (“please do X” disguised as an event)`], alt:[`Audit log tables alongside current-state tables`, `CDC-fed read models`, `Temporal tables (system-versioned)`]},
  real:[
    {co:'Martin Fowler', tier:'confirmed', text:'Described event sourcing (2005) and the LMAX architecture (2011), where business logic processes an event stream in memory and state is rebuilt by replaying events.', src:'martinfowler.com — “Event Sourcing”, “The LMAX Architecture”'},
    {co:'Double-entry ledgers', tier:'confirmed', text:'Accounting ledgers are the original event-sourced systems: balances are derived from immutable journal entries, and errors are corrected with reversing entries.', src:'Standard accounting practice'},
    {co:'Git', tier:'educational', text:'Git’s history of commits works like an event log: the working tree is derived from commits, and you can check out any past state.', src:'Analogy'}
  ],
  mistakes:[`Editing or deleting events`, `Projections that can’t be rebuilt`, `Ignoring projection lag in UX`, `Event-sourcing everything`],
  interview:[`For ledgers/payments, mention append-only events and reversing entries`, `Explain CQRS read models and their staleness`],
  tryit:{note:'An event-sourced wallet: append events, time-travel to any point, snapshot, and fix a mistake without deleting history.', mount:host => eventSourcingDemo(host)},
  sources:[`Martin Fowler — Event Sourcing (2005), CQRS (2011), “What do you mean by Event-Driven?” (2017)`, `Greg Young — CQRS documents`]
},
{
  id:'fan-out', title:'Fan-out on write vs fan-out on read', minutes:9, tags:['fan-out','timeline','feed','push vs pull','celebrity problem'],
  summary:'Precompute every follower’s feed when someone posts (push), or assemble the feed when a user opens the app (pull). Real feeds use a hybrid to handle celebrities.',
  problem:`<p>A user with 200 followers posts: copying the post ID into 200 timelines is trivial. A cricketer with 50 million followers posts: copying into 50 million timelines takes minutes and floods your storage — while a user who follows 2,000 accounts expects their feed in under 200 ms. One strategy can’t serve both.</p>`,
  intuition:`A newspaper vs a library. Fan-out on write is home delivery: the paper is printed and dropped at every subscriber’s door in advance, so reading is instant. Fan-out on read is going to the library and assembling today’s news from every shelf you care about — no delivery cost, but slow to read. Celebrities are like a national newspaper: delivering to every door is huge, so readers fetch it themselves.`,
  how:{
    steps:[`<b>Fan-out on write (push):</b> when A posts, append the post ID to each follower’s precomputed timeline (e.g. a Redis list). Reads are a single fetch.`, `Push cost ∝ followers per post; delay before followers see it grows with follower count; wasted work for inactive followers.`, `<b>Fan-out on read (pull):</b> at read time, fetch recent posts from everyone you follow and merge. Write is O(1); read cost ∝ accounts followed.`, `<b>Hybrid:</b> push for normal accounts; for celebrities (followers above a threshold), skip fan-out and merge their recent posts at read time.`, `Fan-out runs asynchronously through a queue; timelines are capped (e.g. last 800 IDs) and hydrated with post bodies from a cache.`],
    diagram:{title:'Hybrid fan-out', w:780, h:270, alt:'A normal user’s post is pushed into follower timelines via a queue; a celebrity’s post is stored once and merged into feeds at read time.',
      nodes:[{id:'n', type:'client', label:'Normal user', x:80, y:70, w:120}, {id:'c', type:'client', label:'Celebrity', x:80, y:200, w:120}, {id:'q', type:'queue', label:'Fan-out queue', x:280, y:70, w:130}, {id:'w', type:'service', label:'Fan-out workers', x:470, y:70, w:140}, {id:'tl', type:'cache', label:'Timelines (Redis)', x:660, y:70, w:150}, {id:'posts', type:'db', label:'Posts store', x:380, y:200, w:120}, {id:'r', type:'service', label:'Feed reader', x:660, y:200, w:130}],
      edges:[{from:'n', to:'q'}, {from:'q', to:'w'}, {from:'w', to:'tl'}, {from:'c', to:'posts'}, {from:'n', to:'posts', dashed:true}, {from:'r', to:'tl'}, {from:'r', to:'posts'}],
      steps:[
        {note:'A normal user (300 followers) posts: the post is stored and a fan-out job pushes its ID into 300 timelines.', flow:[['n', 'q', 'post 991'], ['q', 'w'], ['w', 'tl', '×300']], hl:['tl']},
        {note:'A celebrity (50M followers) posts: <b>no fan-out</b>. The post is stored once.', flow:[['c', 'posts', 'post 992']], hl:['posts']},
        {note:'Reading a feed: fetch the precomputed timeline <b>and</b> merge recent posts from the few celebrities you follow.', flow:[['r', 'tl', 'GET timeline'], ['r', 'posts', 'celebs since t']], parallel:true, hl:['r']}
      ]},
    deep:`<p><b>Cost model:</b> push write cost = Σ followers over posts; pull read cost = Σ followees over feed reads. With read:write ratios often around 100:1 for social feeds and most users having modest follower counts, push wins overall — except for the long tail of huge accounts. Thresholds and “active followers only” fan-out cut waste further.</p><p><b>Details that matter:</b> timelines store IDs, not bodies (hydrate from a post cache); deletions and privacy changes need fan-out too (or filtering at read); ranking is a separate stage that re-orders candidates from the timeline. Twitter publicly described pushing tweet IDs into Redis-backed home timelines with special handling for high-follower accounts.</p>`
  },
  tradeoffs:{use:[`<b>Push</b> for typical users and read-heavy feeds`, `<b>Pull</b> for celebrities, rarely-read feeds, or very write-heavy sources`, `<b>Hybrid</b> for real social products`], avoid:[`Pure push with power-law follower counts`, `Pure pull at high read QPS with many followees`], alt:[`Ranked feeds built from candidate generation + ranking (Module 8)`]},
  real:[
    {co:'Twitter / X', tier:'confirmed', text:'Engineers described a fan-out-on-write system pushing tweet IDs into in-memory (Redis) home timelines, with high-follower accounts handled differently to avoid enormous fan-out.', src:'Raffi Krikorian, “Timelines at Scale” (QCon 2013)'},
    {co:'Instagram / Facebook feeds', tier:'inference', text:'Large feeds combine precomputed candidate sets with read-time aggregation and ML ranking rather than a single pure strategy.', src:'Public engineering talks; details proprietary'}
  ],
  mistakes:[`Fanning out post bodies instead of IDs`, `Synchronous fan-out inside the post request`, `Ignoring deletes/blocks in precomputed timelines`],
  interview:[`Compute fan-out cost with numbers and propose a celebrity threshold`],
  tryit:{note:'Run push, pull and hybrid on the same social graph — then let a celebrity post.', pg:'fanout'},
  sources:[`Raffi Krikorian, “Timelines at Scale”, QCon 2013`, `Kleppmann, DDIA ch. 1 (Twitter example)`]
},
{
  id:'batch-vs-stream', title:'Batch vs stream processing (MapReduce, Spark, Flink)', minutes:11, tags:['batch','stream processing','MapReduce','Spark','Flink','Kafka Streams','windowing'],
  summary:'Batch processes a bounded dataset (high throughput, high latency). Streaming processes unbounded events continuously (low latency, harder correctness). Same ideas — map, shuffle, aggregate — different clocks.',
  problem:`<p>The finance team wants yesterday’s revenue by city every morning; the fraud team wants a card blocked within 2 seconds of a suspicious pattern; the growth team wants “orders in the last 5 minutes” on a live dashboard. One nightly job can’t do the second and third; one real-time pipeline is overkill (and harder to get right) for the first.</p>`,
  intuition:`Batch is counting a full day’s sales receipts at closing time. Streaming is a cashier keeping a running tally as each customer pays — instant, but they must handle receipts that arrive late (a delivery driver hands in cash an hour later).`,
  how:{
    steps:[`<b>MapReduce</b>: <i>map</i> each input record to key-value pairs → <i>shuffle</i> (group by key across machines) → <i>reduce</i> each group. Fault tolerance by re-running failed tasks on immutable input.`, `<b>Spark</b>: keeps intermediate data in memory across stages (RDDs/DataFrames), far faster for multi-stage and iterative jobs.`, `<b>Stream processors</b> (Flink, Kafka Streams, Spark Structured Streaming): operate on unbounded event streams with <b>windows</b> (tumbling, sliding, session) and <b>state</b> (checkpointed).`, `<b>Event time vs processing time</b>: aggregate by when events happened, not when they arrived; <b>watermarks</b> decide when a window is complete enough to emit.`, `Exactly-once results in streaming come from checkpointed state + replayable sources + transactional sinks.`],
    diagram:{title:'MapReduce word count', w:780, h:270, alt:'Input splits are mapped to word-count pairs, shuffled by key to reducers, and summed.',
      nodes:[{id:'i1', type:'db', label:'Split 1', x:80, y:60, w:100}, {id:'i2', type:'db', label:'Split 2', x:80, y:140, w:100}, {id:'i3', type:'db', label:'Split 3', x:80, y:220, w:100}, {id:'m1', type:'service', label:'Map 1', x:260, y:60, w:100}, {id:'m2', type:'service', label:'Map 2', x:260, y:140, w:100}, {id:'m3', type:'service', label:'Map 3', x:260, y:220, w:100}, {id:'r1', type:'service', label:'Reduce A–M', x:480, y:95, w:130}, {id:'r2', type:'service', label:'Reduce N–Z', x:480, y:190, w:130}, {id:'o', type:'db', label:'Output', x:680, y:140, w:110}],
      edges:[{from:'i1', to:'m1'}, {from:'i2', to:'m2'}, {from:'i3', to:'m3'}, {from:'m1', to:'r1'}, {from:'m1', to:'r2'}, {from:'m2', to:'r1'}, {from:'m2', to:'r2'}, {from:'m3', to:'r1'}, {from:'m3', to:'r2'}, {from:'r1', to:'o'}, {from:'r2', to:'o'}],
      steps:[
        {note:'<b>Map</b> (in parallel, close to the data): each split emits (word, 1) pairs.', flow:[['i1', 'm1'], ['i2', 'm2'], ['i3', 'm3']], parallel:true},
        {note:'<b>Shuffle</b>: pairs are partitioned by key and sent across the network to reducers.', flow:[['m1', 'r1', 'chai'], ['m2', 'r1', 'chai'], ['m3', 'r2', 'samosa']], parallel:true, hl:['r1', 'r2']},
        {note:'<b>Reduce</b>: each reducer sums counts per word and writes output. A failed task just re-runs from its immutable input.', flow:[['r1', 'o', 'chai=4'], ['r2', 'o', 'samosa=2']], parallel:true, hl:['o']}
      ]},
    deep:`<p><b>Google’s papers</b> shaped the field: MapReduce (2004) for batch; MillWheel and the Dataflow model (2015) for streaming with event-time windows, watermarks and triggers — the model behind Apache Beam and Flink’s semantics. <b>Spark</b> (Zaharia et al., NSDI 2012) introduced resilient distributed datasets with lineage-based recovery.</p><p><b>Stream state:</b> joins and aggregations keep state per key (RocksDB in Flink/Kafka Streams), periodically checkpointed (Flink’s asynchronous barrier snapshots) so a failure rewinds sources to the checkpoint and replays. <b>Skew</b> (one hot key) hurts both batch and streaming: salt keys or pre-aggregate.</p>`
  },
  tradeoffs:{use:[`<b>Batch</b> for daily reports, backfills, ML training, large joins`, `<b>Streaming</b> for fraud, alerting, live dashboards, real-time features`], avoid:[`Streaming when hourly freshness is fine (cost, complexity)`, `Processing-time windows for business metrics`], alt:[`Micro-batch (Spark Structured Streaming)`, `Real-time OLAP stores (ClickHouse, Druid, Pinot) querying fresh data directly`]},
  real:[
    {co:'Google MapReduce', tier:'confirmed', text:'Introduced map, shuffle and reduce with automatic parallelisation and re-execution of failed tasks on commodity clusters.', src:'Dean & Ghemawat, “MapReduce”, OSDI 2004'},
    {co:'Apache Spark', tier:'confirmed', text:'Originated at UC Berkeley with resilient distributed datasets for in-memory, fault-tolerant cluster computing.', src:'Zaharia et al., NSDI 2012'},
    {co:'Google Dataflow model', tier:'confirmed', text:'Formalised event-time windowing, watermarks and triggers for unbounded data; implemented in Cloud Dataflow and Apache Beam.', src:'Akidau et al., “The Dataflow Model”, VLDB 2015'}
  ],
  mistakes:[`Counting by arrival time instead of event time`, `Ignoring late data`, `Hot keys in shuffles`],
  interview:[`Pick batch vs stream from the freshness requirement; mention windows and watermarks for streaming`],
  tryit:{note:'Run a real MapReduce word count phase by phase on your own text.', mount:host => mapReduceDemo(host)},
  sources:[`Dean & Ghemawat, OSDI 2004`, `Zaharia et al., NSDI 2012`, `Akidau et al., VLDB 2015`, `Carbone et al., “Apache Flink” (IEEE Data Eng. Bull. 2015)`]
},
{
  id:'lambda-kappa', title:'Lambda vs Kappa architectures (and late data)', minutes:9, tags:['Lambda architecture','Kappa architecture','watermark','late data','reprocessing'],
  summary:'Lambda runs a batch layer for correctness and a speed layer for freshness. Kappa uses one streaming pipeline and reprocesses by replaying the log. Both must handle late data.',
  problem:`<p>Your real-time dashboard shows 10,412 orders for yesterday; the nightly batch report says 10,438. Users notice the numbers disagree. The streaming job dropped orders whose events arrived late (phones offline), and the two pipelines are written in different code that drifted apart.</p>`,
  intuition:`Lambda is keeping both a quick rough tally during the day and an accountant’s careful count every night, then showing the accountant’s number once it’s ready. Kappa is having one careful cashier whose tally is good enough — and if you change the counting rules, they recount from the archived receipts.`,
  how:{
    steps:[`<b>Lambda</b> (Nathan Marz): an immutable master dataset; a <b>batch layer</b> recomputes accurate views periodically; a <b>speed layer</b> covers the gap with approximate real-time views; queries merge both.`, `Lambda’s cost: the same logic implemented twice (batch + streaming) and kept consistent.`, `<b>Kappa</b> (Jay Kreps): only a streaming pipeline over a durable log. To change logic or fix bugs, start a new job that replays the log from the beginning, then switch over.`, `Kappa needs long retention (or tiered storage) and a stream processor capable of correct, stateful reprocessing.`, `Either way, correctness hinges on <b>event time</b>, <b>watermarks</b> and a policy for <b>late events</b> (allowed lateness, side outputs, corrections).`],
    diagram:{title:'Lambda vs Kappa', w:780, h:270, alt:'Lambda sends events to both a batch layer and a speed layer merged at serving; Kappa uses one streaming job over a replayable log.',
      nodes:[{id:'src', type:'queue', label:'Event log', x:90, y:140, w:120}, {id:'b', type:'service', label:'Batch layer', sub:'nightly, exact', x:320, y:60, w:140}, {id:'s', type:'service', label:'Speed layer', sub:'streaming, approx', x:320, y:140, w:150}, {id:'srv', type:'db', label:'Serving (merge)', x:560, y:100, w:150}, {id:'k', type:'service', label:'Kappa: one stream job', sub:'replay to reprocess', x:320, y:235, w:180}, {id:'kv', type:'db', label:'Kappa views', x:560, y:235, w:120}],
      edges:[{from:'src', to:'b'}, {from:'src', to:'s'}, {from:'b', to:'srv'}, {from:'s', to:'srv'}, {from:'src', to:'k'}, {from:'k', to:'kv'}],
      steps:[
        {note:'<b>Lambda:</b> every event goes to both a batch layer and a speed layer — two codebases.', flow:[['src', 'b'], ['src', 's']], parallel:true},
        {note:'Queries merge: exact batch results up to last night + approximate real-time results since.', flow:[['b', 'srv'], ['s', 'srv']], parallel:true, hl:['srv']},
        {note:'<b>Kappa:</b> one streaming job. To change logic, replay the log into a new version of the job, then switch readers.', flow:[['src', 'k', 'replay'], ['k', 'kv']], hl:['k']}
      ]},
    deep:`<p><b>Late data policies</b> (Dataflow model): <i>watermark</i> = the system’s estimate that no older events will arrive; <i>allowed lateness</i> keeps window state open longer and emits <i>updated</i> results (retractions/accumulations) when late events arrive; very late events go to a side output for batch correction. Choosing lateness trades latency against completeness — exactly what the widget below shows.</p><p><b>Practice today:</b> many teams run Kappa-style pipelines (Flink/Kafka Streams over Kafka with tiered storage) plus periodic batch reconciliation against the warehouse — a pragmatic hybrid that catches drift.</p>`
  },
  tradeoffs:{use:[`<b>Lambda</b> when streaming accuracy can’t be trusted for official numbers`, `<b>Kappa</b> when one stateful streaming engine can be correct and the log is retained long enough`], avoid:[`Two independent codebases computing “the same” metric without reconciliation`, `Dropping late events silently`], alt:[`Streaming + periodic batch reconciliation`, `Unified engines (Beam, Spark) running the same code in batch and streaming modes`]},
  real:[
    {co:'Nathan Marz', tier:'confirmed', text:'Proposed the Lambda architecture (batch + speed + serving layers) in his work on Storm and the book “Big Data” (2015).', src:'Marz & Warren, “Big Data: Principles and best practices of scalable realtime data systems” (2015)'},
    {co:'Jay Kreps', tier:'confirmed', text:'Proposed the Kappa architecture in “Questioning the Lambda Architecture” (2014): reprocess by replaying a log through the stream processor.', src:'O’Reilly Radar (2014)'},
    {co:'Apache Beam', tier:'confirmed', text:'Provides one programming model for batch and streaming with event-time windows, watermarks, triggers and allowed lateness.', src:'Apache Beam documentation'}
  ],
  mistakes:[`Ignoring the gap between event time and processing time`, `No reconciliation between real-time and batch numbers`, `Short log retention that makes Kappa reprocessing impossible`],
  interview:[`Mention watermarks and late-data handling whenever you add streaming aggregates`],
  tryit:{note:'Events arrive late. Tune allowed lateness and compare emitted window counts with the truth.', mount:host => windowDemo(host)},
  sources:[`Marz & Warren (2015)`, `Kreps, “Questioning the Lambda Architecture” (2014)`, `Akidau et al., VLDB 2015; Akidau, Chernyak & Lax, “Streaming Systems” (2018)`]
},
{
  id:'cdc', title:'Change data capture (CDC)', minutes:9, tags:['CDC','Debezium','WAL','binlog','logical replication'],
  summary:'Read a database’s own change log and turn every committed insert, update and delete into an ordered event stream — the reliable way to keep search, caches and warehouses in sync.',
  problem:`<p>Product data lives in PostgreSQL, but search runs on Elasticsearch, prices are cached in Redis and analytics run in a warehouse. Application code that “also updates search and cache” misses writes from scripts, migrations and other services — so search shows deleted products and the cache serves old prices.</p>`,
  intuition:`Instead of asking every clerk to remember to tell the other departments about each change, you give the other departments a photocopy of the official ledger’s new pages every few seconds. Nothing gets forgotten, because the ledger records everything.`,
  how:{
    steps:[`Databases already log every committed change for crash recovery and replication (PostgreSQL WAL, MySQL binlog, MongoDB oplog).`, `A <b>CDC connector</b> (Debezium, cloud DMS, native logical replication) reads that log and publishes change events (before/after images, operation, position) to a stream.`, `Consumers update derived systems: search indexes, caches (invalidate), warehouses, other services.`, `Events arrive in <b>commit order</b> per table/key; consumers track offsets and can rebuild from a snapshot + stream.`, `CDC also powers the transactional outbox, zero-downtime migrations and database replication across engines.`],
    diagram:{title:'One write, many derived copies', w:780, h:240, alt:'An application writes Postgres; Debezium reads the WAL into Kafka; search, cache and warehouse consume.',
      nodes:[{id:'a', type:'service', label:'App', x:70, y:120, w:90}, {id:'db', type:'db', label:'Postgres', sub:'WAL', x:220, y:120, w:120}, {id:'cdc', type:'service', label:'Debezium', x:380, y:120, w:120}, {id:'k', type:'queue', label:'Kafka', x:530, y:120, w:100}, {id:'s', type:'db', label:'Search', x:690, y:45, w:100}, {id:'c', type:'cache', label:'Cache', x:690, y:120, w:100}, {id:'w', type:'db', label:'Warehouse', x:690, y:195, w:110}],
      edges:[{from:'a', to:'db'}, {from:'db', to:'cdc'}, {from:'cdc', to:'k'}, {from:'k', to:'s'}, {from:'k', to:'c'}, {from:'k', to:'w'}],
      steps:[
        {note:'The app only writes to its database — nothing else.', flow:[['a', 'db', 'UPDATE price']], hl:['db']},
        {note:'Debezium tails the WAL (logical decoding) and emits a change event with before/after values.', flow:[['db', 'cdc', 'lsn 0/16B3'], ['cdc', 'k', 'op=u']], hl:['cdc']},
        {note:'Search reindexes, the cache invalidates the key, the warehouse appends the change — all from one ordered stream.', flow:[['k', 's'], ['k', 'c'], ['k', 'w']], parallel:true}
      ]},
    deep:`<p><b>Snapshot + stream:</b> a connector first takes a consistent snapshot of existing rows, then switches to the log at the snapshot’s position so nothing is missed or duplicated (Netflix’s DBLog interleaves chunked snapshots with log events to avoid long locks). <b>Ordering:</b> Kafka topics keyed by primary key keep per-row order. <b>Schema changes</b> flow through as events (schema registry). <b>Operational gotchas:</b> a stalled connector keeps a PostgreSQL replication slot open, so WAL accumulates and can fill the disk — monitor slot lag.</p>`
  },
  tradeoffs:{use:[`Keeping search, caches, warehouses and other services in sync with a database`, `Outbox publishing`, `Live migrations between databases`], avoid:[`Exposing raw table changes as a public contract to other teams (couples them to your schema — publish domain events instead)`, `CDC without monitoring replication slot lag`], alt:[`Application-level dual writes (risky)`, `Periodic batch extracts for low-freshness needs`]},
  real:[
    {co:'Debezium', tier:'confirmed', text:'An open-source CDC platform with connectors for PostgreSQL, MySQL, MongoDB, SQL Server and others, typically running on Kafka Connect.', src:'debezium.io documentation'},
    {co:'LinkedIn Databus', tier:'confirmed', text:'LinkedIn’s CDC system captured database changes into a stream to keep caches, search indexes and other derived stores consistent.', src:'Das et al., “All Aboard the Databus!”, SoCC 2012'},
    {co:'Netflix DBLog', tier:'confirmed', text:'A CDC framework that combines full-state capture with log events without stalling log processing.', src:'Andreakis & Papapanagiotou, “DBLog: A Watermark Based Change-Data-Capture Framework” (2020)'}
  ],
  mistakes:[`Dual writes instead of CDC/outbox`, `Unmonitored replication slots`, `Treating raw CDC events as a stable API`],
  interview:[`When you add a search index or warehouse, say “fed by CDC from the source DB”`],
  tryit:{note:'Insert, update and delete rows; watch change events flow to three consumers. Take one consumer down and bring it back.', mount:(host, api) => cdcDemo(host, api)},
  sources:[`Debezium documentation`, `Das et al., SoCC 2012`, `Netflix DBLog (2020)`, `Kleppmann, DDIA ch. 11`]
},
{
  id:'workflow-orchestration', title:'Workflow orchestration: Airflow and Temporal', minutes:9, tags:['Airflow','Temporal','DAG','durable execution','orchestration'],
  summary:'Airflow schedules DAGs of batch tasks (data pipelines). Temporal runs durable, long-lived application workflows whose state survives crashes. Both replace fragile cron + scripts.',
  problem:`<p>The nightly pipeline is ten cron jobs timed to start “after the previous one probably finishes”. One night an extract runs late; the join starts on half the data and the dashboard shows wrong revenue. Separately, a 7-day user-onboarding flow (emails, reminders, KYC checks) is a tangle of database flags and timers that breaks on every deploy.</p>`,
  intuition:`A wedding planner’s checklist with dependencies: “caterer only after venue confirmed; invitations only after guest list”. Airflow is the planner running the checklist every night. Temporal is a planner with perfect memory: if they fall asleep mid-plan, they wake up and continue exactly where they left off — even days later.`,
  how:{
    steps:[`<b>DAG orchestration</b> (Airflow, Dagster, Prefect): tasks with explicit dependencies; scheduler runs ready tasks in parallel, retries failures, backfills dates, shows lineage.`, `Tasks should be <b>idempotent</b> and parameterised by date so reruns and backfills are safe.`, `<b>Durable execution</b> (Temporal, Cadence, AWS Step Functions): workflow code’s progress is persisted as an event history; after crashes it replays deterministically and resumes; timers can last days or months.`, `Activities (side effects) are retried with policies; workflows coordinate them — sagas are a natural fit.`, `Use Airflow-style for data pipelines on a schedule; Temporal-style for business processes triggered by events.`],
    diagram:{title:'A DAG run', w:780, h:250, alt:'Extract tasks run in parallel, then clean and join, then downstream tasks; a failed task is retried.',
      nodes:[{id:'e1', type:'service', label:'extract_orders', x:100, y:50, w:150}, {id:'e2', type:'service', label:'extract_users', x:100, y:130, w:150}, {id:'e3', type:'service', label:'extract_payments', x:100, y:210, w:160}, {id:'c', type:'service', label:'clean_orders', x:320, y:50, w:140}, {id:'j', type:'service', label:'join', x:480, y:130, w:100}, {id:'r', type:'service', label:'daily_revenue', x:660, y:80, w:140}, {id:'m', type:'service', label:'train_model', x:660, y:190, w:130}],
      edges:[{from:'e1', to:'c'}, {from:'c', to:'j'}, {from:'e2', to:'j'}, {from:'e3', to:'j'}, {from:'j', to:'r'}, {from:'j', to:'m'}],
      steps:[
        {note:'Independent extracts run <b>in parallel</b>.', status:{e1:'hot', e2:'hot', e3:'hot'}},
        {note:'<code>clean_orders</code> runs only after <code>extract_orders</code> succeeds.', status:{e1:'ok', e2:'ok', e3:'ok', c:'hot'}, flow:[['e1', 'c']]},
        {note:'<code>join</code> waits for all three upstreams. Then two downstream branches run in parallel.', status:{c:'ok', j:'hot'}, flow:[['c', 'j'], ['e2', 'j'], ['e3', 'j']], parallel:true},
        {note:'<code>train_model</code> fails → retried with backoff; if it keeps failing, only its downstream is skipped.', status:{j:'ok', r:'ok', m:'down'}, hl:['m']}
      ]},
    deep:`<p><b>Airflow</b> (created at Airbnb, 2014; Apache top-level project) defines DAGs in Python; the scheduler is not meant for sub-second latency or passing large data between tasks (use storage). <b>Temporal</b> (founded by Cadence’s creators from Uber) requires workflow code to be deterministic so it can be replayed from history; non-deterministic work goes into activities. Versioning workflow code while executions are in flight is the main operational subtlety.</p>`
  },
  tradeoffs:{use:[`<b>Airflow-style</b> for scheduled data pipelines, ETL/ELT, ML training`, `<b>Temporal-style</b> for long-running business workflows, sagas, human-in-the-loop steps`], avoid:[`Cron chains with time-based guesses`, `Ad-hoc state machines in database flags`, `Using Airflow for per-request business transactions`], alt:[`dbt for SQL transformations inside the warehouse`, `Cloud-native (Step Functions, Cloud Workflows)`]},
  real:[
    {co:'Airbnb → Apache Airflow', tier:'confirmed', text:'Airflow was created at Airbnb in 2014 to author, schedule and monitor data pipelines as DAGs, and became an Apache top-level project.', src:'Apache Airflow documentation and project history'},
    {co:'Uber Cadence → Temporal', tier:'confirmed', text:'Cadence was built at Uber for durable workflows; Temporal continued the design as an independent open-source project.', src:'Uber Engineering; temporal.io'},
    {co:'Netflix Conductor', tier:'confirmed', text:'Netflix open-sourced Conductor, a workflow orchestration engine for microservices.', src:'Netflix Tech Blog (2016)'}
  ],
  mistakes:[`Non-idempotent tasks (reruns double data)`, `Passing big data through the orchestrator`, `Non-deterministic code in Temporal workflows`],
  interview:[`For multi-step processes, name the orchestrator and its retry/idempotency story`],
  tryit:{note:'Run a nightly DAG with 1–4 workers, inject a failure, and change retries.', mount:host => dagDemo(host)},
  sources:[`Apache Airflow docs`, `Temporal docs`, `Netflix Tech Blog — Conductor`]
}
];

SDA.register({
  kind:'module', id:'async', order:7, level:'distributed', icon:'📨', title:'Async & Pipelines',
  summary:'Queues vs pub/sub vs logs, Kafka internals, RabbitMQ and SQS, ordering and DLQs, backpressure, event-driven design with event sourcing and CQRS, feed fan-out, batch vs stream processing, Lambda vs Kappa, CDC and workflow orchestration.',
  outcomes:['Choose queue, pub/sub or log for a given integration', 'Size Kafka partitions and reason about keys, groups, offsets and lag', 'Design retries, DLQs and backpressure so failures stay contained', 'Apply event sourcing, CQRS and fan-out strategies where they fit', 'Pick batch vs streaming, handle late data, and feed derived systems with CDC'],
  lessons,
  quiz:[
    {q:'Each image must be resized exactly once by one of 20 workers. Best primitive?', options:['Pub/sub topic', 'Work queue with competing consumers', 'Event log with 20 consumer groups', 'Bloom filter'], answer:1, why:'Each message goes to one worker.'},
    {q:'A Kafka topic has 4 partitions; a consumer group has 6 consumers. What happens?', options:['All 6 share load evenly', '2 consumers sit idle', 'Kafka creates 2 partitions', 'Messages are duplicated'], answer:1, why:'A partition is consumed by one member per group.'},
    {q:'How do you guarantee all events for one order are processed in order?', options:['Use more partitions', 'Use the order ID as the message key', 'Use random keys', 'Use a DLQ'], answer:1, why:'Same key → same partition → ordered.'},
    {q:'A poison message is retried forever. What is the main damage?', options:['Duplicates', 'Head-of-line blocking: everything behind it stalls', 'Data is encrypted', 'Nothing'], answer:1, why:'Partition progress stops; lag grows.'},
    {q:'Which strategy guarantees bounded memory without losing must-keep messages?', options:['Unbounded buffer', 'Bounded buffer with drop', 'Bounded buffer with backpressure (block producers)', 'Bigger RAM'], answer:2, why:'Pressure propagates upstream; nothing is dropped.'},
    {q:'In event sourcing, how do you correct a wrong deposit?', options:['Edit the event', 'Delete the event', 'Append a compensating event', 'Restore a backup'], answer:2, why:'Events are immutable; corrections are new events.'},
    {q:'A celebrity with 50M followers posts. Best timeline strategy?', options:['Fan-out on write to all followers', 'Skip fan-out; merge their posts at read time (hybrid)', 'Email everyone', 'Pull for everyone'], answer:1, why:'Hybrid avoids enormous write fan-out.'},
    {q:'Your streaming dashboard undercounts compared with the nightly batch. Most likely cause?', options:['Late events dropped after windows closed', 'Too many partitions', 'Cache stampede', 'TLS'], answer:0, why:'Watermarks/allowed lateness decide whether late events count.'},
    {q:'What does CDC read?', options:['Application logs', 'The database’s replication/transaction log (WAL, binlog)', 'HTTP traffic', 'Cron output'], answer:1, why:'Committed changes in commit order.'},
    {q:'Which tool fits a 7-day onboarding flow with timers and retries that must survive deploys?', options:['A cron job', 'A durable workflow engine like Temporal', 'Memcached', 'A Bloom filter'], answer:1, why:'Durable execution persists workflow state and timers.'},
    {type:'scenario', q:'Design the async backbone for food-delivery order events (placement, payment, restaurant, rider, notifications, analytics).', answer:'<ul><li><b>Kafka topic</b> <code>orders</code> keyed by order_id (per-order ordering), partitions sized for peak (e.g. 5K events/s ÷ ~1K/s per consumer → ≥ 12 partitions, plan 48 for growth), RF 3, acks=all.</li><li>Services publish via <b>outbox + CDC</b>; consumers are <b>idempotent</b> (processed-event table).</li><li>Separate consumer groups: payments, restaurant, rider-matching, notifications, analytics → each independent offsets and lag alerts.</li><li><b>Notifications</b> fan out through a work queue (SQS/RabbitMQ) to SMS/push workers with retries and DLQ.</li><li><b>Retry topics + DLQ</b> per consumer; alert on DLQ depth and on oldest-message age.</li><li>Analytics via a streaming job with event-time windows into a real-time OLAP store; nightly batch reconciliation to the warehouse.</li></ul>'},
    {type:'scenario', q:'A consumer’s lag grows every evening peak and drains overnight. What do you check and change?', answer:'<ol><li>Measure per-partition lag and processing time per message; find hot partitions/keys (skew).</li><li>If evenly loaded and CPU-bound: add consumers up to the partition count; if already at the limit, increase partitions (plan key remapping) or parallelise within a consumer (ordered per key).</li><li>If waiting on a downstream (DB/API): batch writes, add caching, or apply backpressure/limits so the downstream isn’t overwhelmed.</li><li>Autoscale on lag (KEDA) ahead of the peak.</li><li>Alert on <b>age of oldest unprocessed message</b> versus the freshness SLO, and make sure retention comfortably exceeds worst-case lag.</li></ol>'}
  ],
  cheatsheet:[
    {h:'📨 Primitives', items:['Queue: one consumer per message', 'Pub/sub: copy per subscriber', 'Log: retained, replayable, per-partition order', 'Async = decoupling + eventual consistency']},
    {h:'🧵 Kafka', items:['Partition = unit of order & parallelism', 'Key → partition → per-key order', 'Group: 1 consumer per partition', 'Commit offsets after processing', 'Lag = end offset − committed', 'Retention vs compaction']},
    {h:'♻️ Failure handling', items:['Retry transient with backoff + jitter', 'DLQ permanent failures; alert; replay', 'Idempotent consumers (dedupe IDs)', 'Retry topics avoid head-of-line blocking']},
    {h:'🚰 Flow control', items:['Bounded buffers always', 'Block (backpressure) / drop (shed) / scale', 'Pull consumers self-limit', 'Watch oldest-message age']},
    {h:'🏛️ Patterns', items:['Event sourcing: events = truth; snapshots', 'CQRS: write model + read projections', 'Fan-out: push, pull, hybrid for celebrities', 'CDC: DB log → stream → derived stores']},
    {h:'⚙️ Processing', items:['MapReduce: map → shuffle → reduce', 'Spark: in-memory stages', 'Streaming: windows, state, checkpoints', 'Event time + watermarks + allowed lateness', 'Lambda (batch+speed) vs Kappa (replay)', 'Airflow DAGs vs Temporal durable workflows']}
  ],
  glossary:[
    {term:'Message queue', aka:['queue'], def:'A buffer where producers enqueue messages and competing consumers each take one.'},
    {term:'Pub/sub', aka:['publish-subscribe'], def:'Messaging where each published message is delivered to every subscriber.'},
    {term:'Event stream', aka:['event log', 'commit log'], def:'A durable, ordered, append-only log of events that many consumers read independently.'},
    {term:'Kafka', aka:['Apache Kafka'], def:'A distributed, partitioned, replicated commit log for high-throughput event streaming.'},
    {term:'Topic', def:'A named stream of messages, split into partitions in Kafka.'},
    {term:'Partition (Kafka)', aka:['partitions'], def:'An ordered, append-only log within a topic; the unit of parallelism and ordering.'},
    {term:'Offset', aka:['offsets'], def:'A record’s position within a partition; consumers commit offsets to track progress.'},
    {term:'Consumer group', def:'A set of consumers that divide a topic’s partitions so each partition is read by one member.'},
    {term:'Consumer lag', aka:['lag'], def:'How far a consumer group is behind the end of the log.'},
    {term:'Rebalance', def:'Reassignment of partitions among consumers when group membership changes.'},
    {term:'Retention', def:'How long a log keeps records before deleting them (by time or size).'},
    {term:'Log compaction', def:'Keeping only the latest record for each key in a log.'},
    {term:'RabbitMQ', def:'An AMQP message broker with flexible routing through exchanges and bindings.'},
    {term:'Exchange', def:'A RabbitMQ component that routes messages to queues by type (direct, topic, fanout, headers).'},
    {term:'SQS', aka:['Amazon SQS'], def:'Amazon’s fully managed message queue service.'},
    {term:'Visibility timeout', def:'In SQS, the period a received message is hidden from other consumers before reappearing if not deleted.'},
    {term:'Dead-letter queue', aka:['DLQ', 'dead letter queue'], def:'A queue holding messages that repeatedly failed processing, for inspection and replay.'},
    {term:'Poison message', def:'A message that always fails processing, e.g. due to malformed data.'},
    {term:'Backpressure', def:'A mechanism for slow consumers to signal producers to slow down.'},
    {term:'Load shedding', def:'Deliberately dropping or rejecting work when overloaded to protect the system.'},
    {term:'Event-driven architecture', aka:['event-driven'], def:'Services communicate by publishing and reacting to events rather than calling each other directly.'},
    {term:'Event sourcing', def:'Storing every state change as an immutable event; current state is derived by replay.'},
    {term:'CQRS', def:'Command Query Responsibility Segregation: separate models for writes and reads.'},
    {term:'Projection', aka:['read model', 'projections'], def:'A view built by consuming events, shaped for specific queries.'},
    {term:'Snapshot', def:'Saved state at a point in an event stream to speed up rebuilding.'},
    {term:'Fan-out on write', aka:['push model'], def:'Precomputing each follower’s feed when content is created.'},
    {term:'Fan-out on read', aka:['pull model'], def:'Assembling a feed at read time from the sources a user follows.'},
    {term:'MapReduce', def:'A batch model: map records to key-value pairs, shuffle by key, reduce each group.'},
    {term:'Shuffle', def:'Redistributing intermediate data by key across machines between processing stages.'},
    {term:'Apache Spark', aka:['Spark'], def:'A distributed engine for in-memory batch and micro-batch processing.'},
    {term:'Apache Flink', aka:['Flink'], def:'A stateful stream-processing engine with event-time semantics and checkpoints.'},
    {term:'Stream processing', aka:['streaming'], def:'Continuously processing unbounded data as it arrives.'},
    {term:'Batch processing', def:'Processing a bounded dataset in one job, typically on a schedule.'},
    {term:'Event time', def:'When an event actually happened, as opposed to when it was processed.'},
    {term:'Watermark', aka:['watermarks'], def:'A stream processor’s estimate that no events older than a timestamp remain to arrive.'},
    {term:'Tumbling window', aka:['windowing', 'window'], def:'Fixed, non-overlapping time buckets for stream aggregation.'},
    {term:'Lambda architecture', def:'Combining a batch layer for accuracy with a speed layer for freshness.'},
    {term:'Kappa architecture', def:'Using a single streaming pipeline over a replayable log, reprocessing by replay.'},
    {term:'Debezium', def:'An open-source change-data-capture platform reading database logs into Kafka.'},
    {term:'DAG', aka:['directed acyclic graph'], def:'A graph of tasks with dependencies and no cycles, used to define pipelines.'},
    {term:'Apache Airflow', aka:['Airflow'], def:'A platform for authoring, scheduling and monitoring DAG-based data pipelines.'},
    {term:'Temporal', def:'A durable-execution platform that persists workflow progress so long-running workflows survive failures.'},
    {term:'Durable execution', def:'Running workflow code whose progress is persisted and resumed automatically after crashes.'}
  ],
  sources:['Kreps et al., Kafka (NetDB 2011); Kreps, “The Log” (2013); “Questioning the Lambda Architecture” (2014)', 'Dean & Ghemawat, MapReduce (2004); Zaharia et al., Spark (2012); Akidau et al., Dataflow (2015)', 'Fowler — Event Sourcing, CQRS; Krikorian, “Timelines at Scale” (2013)', 'Debezium, Airflow, Temporal, RabbitMQ, SQS and Kafka documentation']
});
} catch(e){ console.error('[SDA] Module "async" failed to load', e); window.SDA && SDA.errors.push({id:'async', error:e}); }
})();
