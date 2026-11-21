
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
  let events = [{t:'VideoCreated', amt:0}], snap = null, at = 0;
  const out = el('div'); const tslider = el('input', {type:'range', min:'0', max:'0', value:'0', 'aria-label':'Time travel: state after event N'}); const tlab = el('span', {class:'mono'});
  const amt = el('input', {class:'input', type:'number', value:'500', min:'1', style:{width:'110px'}, 'aria-label':'View count'});
  const replay = (upto, fromSnap) => { let bal = 0, n = 0, start = 0; if (fromSnap && snap && snap.idx <= upto){ bal = snap.bal; start = snap.idx + 1; } for (let i = start; i <= upto; i++){ const e = events[i]; n++; if (e.t === 'ViewsAdded') bal += e.amt; if (e.t === 'ViewsRemoved') bal -= e.amt; } return {bal, n}; };
  function render(msg){
    tslider.max = String(events.length - 1); if (at > events.length - 1 || +tslider.value === events.length - 2) at = events.length - 1; tslider.value = String(at); tlab.textContent = `after event #${at + 1}`;
    const cur = replay(at, false), fast = replay(events.length - 1, true);
    out.innerHTML = '';
    out.append(frag(h.table(['#', 'Saved event', 'Views after'], events.map((e, i) => [String(i + 1), `${e.t}${e.amt ? ' ' + e.amt : ''}${e.note ? ` <span class="lab-hint">${e.note}</span>` : ''}`, String(replay(i, false).bal)]).map((r, i) => i <= at ? r : r.map(c => `<span style="opacity:.35">${c}</span>`)), [2])));
    out.append(el('div', {class:'verdict ok'}, `After event #${at + 1}: ${cur.bal} views from ${cur.n} event(s). ${snap ? `Snapshot at #${snap.idx + 1}` : 'No snapshot'} means rebuilding current count reads ${fast.n} event(s).`));
    if (msg) out.append(el('div', {class:'verdict ' + (msg[0] === '✗' ? 'bad' : 'warn')}, msg));
  }
  tslider.addEventListener('input', () => { at = +tslider.value; render(); });
  const cmd = kind => { const a = Math.max(1, +amt.value || 0); const bal = replay(events.length - 1, false).bal; if (kind === 'w' && a > bal){ render(`✗ Cannot remove ${a} views when the current count is ${bal}. Only valid commands become events.`); return; } events.push({t:kind === 'd' ? 'ViewsAdded' : 'ViewsRemoved', amt:a}); at = events.length - 1; render(); };
  host.append(el('div', {class:'row'}, amt, ui.button('➕ Add views', () => cmd('d'), 'sm primary'), ui.button('➖ Remove views', () => cmd('w'), 'sm'), ui.button('📸 Snapshot now', () => { snap = {idx:events.length - 1, bal:replay(events.length - 1, false).bal}; render(`Snapshot saved at event #${snap.idx + 1}. Rebuilding the count now starts from it.`); }, 'sm'), ui.button('🩹 Fix a mistake', () => { const last = [...events].reverse().find(e => e.t === 'ViewsAdded'); if (!last){ render('No added views to correct.'); return; } events.push({t:'ViewsRemoved', amt:last.amt, note:'(correction of a mistaken view count)'}); at = events.length - 1; render('The mistaken event stays in history. A new event corrects it.'); }, 'sm ghost')), el('label', {class:'field', style:{margin:'12px 0'}}, el('span', null, '⏳ View count after event', tlab), tslider), out);
  [['d', 1000], ['w', 200], ['d', 300]].forEach(([k, a]) => { amt.value = a; cmd(k); }); amt.value = 500; render();
}
function mapReduceDemo(host){
  const ta = el('textarea', {class:'input mono', rows:4, 'aria-label':'Video caption text, one split per line'}); ta.value = 'mountain walk mountain\ncity walk music\nmountain music walk';
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
    out.append(el('div', {class:'verdict ' + (dropped ? 'warn' : 'ok')}, dropped ? `With ${P.late} s allowed lateness, ${dropped} late view event(s) arrived after their window closed. The displayed count is missing those views. Increase the wait to include more late events.` : `All view events were counted. The results appeared about ${P.late} seconds after each window ended.`));
  }
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Allowed lateness (watermark delay)', min:0, max:20, step:.5, value:2, fmt:v => v + ' s', onInput:v => { P.late = v; run(); }}).el), el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('🎲 New view events', gen, 'sm')), out, el('p', {class:'lab-hint'}, 'Views happen over 60 seconds. Most reports arrive within 1.5 seconds. Some take 2 to 6 seconds, and a few take 8 to 18 seconds when phones reconnect. Each 10-second window closes when the watermark passes its end.'));
  gen();
}
function cdcDemo(host, api){
  let rows = [{id:1, name:'Mountain Walk', price:120}, {id:2, name:'City Tour', price:240}], lsn = 1000, nextId = 3, searchDown = false, busy = false, backlog = [];
  const holder = el('div'); const tbl = el('div'); const logBox = el('div', {class:'lab-out', style:{maxHeight:'170px', borderRadius:'10px', border:'1px solid var(--border)'}});
  const d = new api.Diagram(holder, {title:'Video title change pipeline', w:800, h:260, alt:'A saved video edit reaches search and reporting through CDC.', nodes:[{id:'app', type:'service', label:'Video app', x:80, y:130, w:120}, {id:'db', type:'db', label:'Postgres', sub:'WAL', x:240, y:130, w:110}, {id:'cdc', type:'service', label:'CDC connector', sub:'Debezium', x:400, y:130, w:130}, {id:'k', type:'queue', label:'Kafka topic', sub:'video.items', x:560, y:130, w:130}, {id:'es', type:'db', label:'Search index', x:720, y:45, w:120}, {id:'ca', type:'cache', label:'Cache invalidator', x:720, y:130, w:140}, {id:'wh', type:'db', label:'Reports', x:720, y:215, w:120}], edges:[{from:'app', to:'db'}, {from:'db', to:'cdc'}, {from:'cdc', to:'k'}, {from:'k', to:'es'}, {from:'k', to:'ca'}, {from:'k', to:'wh'}]});
  const paint = () => { tbl.innerHTML = ''; tbl.append(frag(h.table(['id', 'video title', 'views'], rows.map(r => [String(r.id), esc(r.name), String(r.price)]), [2]))); };
  async function change(op){
    if (busy) return; busy = true; let before = null, after = null;
    if (op === 'c'){ after = {id:nextId, name:['Forest Trail', 'Street Music', 'Night Sky'][nextId % 3], price:60 + nextId * 10}; rows.push(after); nextId++; }
    else if (op === 'u'){ const r = rows[0]; if (!r){ busy = false; return; } before = {...r}; r.name += ' updated'; after = {...r}; }
    else { const r = rows.pop(); if (!r){ busy = false; return; } before = r; }
    lsn += 8; paint();
    const evt = {op, before, after, source:{lsn}}; logBox.prepend(el('div', {class:'ln'}, JSON.stringify(evt)));
    await d.flow([['app', 'db', op === 'c' ? 'INSERT' : op === 'u' ? 'UPDATE' : 'DELETE'], ['db', 'cdc', 'WAL lsn ' + lsn], ['cdc', 'k', 'op=' + op]]);
    if (searchDown){ backlog.push(lsn); d.setSub('es', `down · lag ${backlog.length}`); await d.flow([['k', 'ca'], ['k', 'wh']], {parallel:true}); }
    else await d.flow([['k', 'es'], ['k', 'ca'], ['k', 'wh']], {parallel:true});
    busy = false;
  }
  host.append(el('div', {class:'controls'}, ui.button('➕ Add video', () => change('c'), 'sm primary'), ui.button('✏️ Update title', () => change('u'), 'sm'), ui.button('🗑 Delete video', () => change('d'), 'sm'), ui.toggle({label:'Search consumer down', checked:false, onChange:async v => { searchDown = v; d.setStatus('es', v ? 'down' : 'ok'); if (!v && backlog.length){ d.setSub('es', `catching up ${backlog.length}`); for (const l of backlog) await d.flow([['k', 'es', 'lsn ' + l]], {dur:350}); backlog = []; d.setSub('es', 'in sync'); } }}).el), holder, el('div', {class:'grid c2'}, el('div', null, el('b', null, 'Source table'), tbl), el('div', null, el('b', null, 'Change events'), logBox)), el('p', {class:'lab-hint'}, 'The video app writes to its database. Search and reports follow saved changes. A stopped consumer resumes from its last position.'));
  paint();
}
function dagDemo(host){
  const T = {extract_views:{d:3, deps:[]}, extract_creators:{d:2, deps:[]}, extract_payments:{d:2, deps:[]}, clean_views:{d:2, deps:['extract_views']}, combine:{d:3, deps:['clean_views', 'extract_creators', 'extract_payments']}, daily_report:{d:2, deps:['combine']}, trend_report:{d:5, deps:['combine']}, dashboard:{d:1, deps:['daily_report']}, email_report:{d:1, deps:['daily_report', 'trend_report']}};
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
  host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Parallel workers', min:1, max:4, step:1, value:2, fmt:v => v, onInput:v => { P.workers = v; run(); }}).el, ui.select({label:'Inject a failure (first attempt)', value:'none', options:[['none', 'No failure']].concat(Object.keys(T).map(k => [k, k])), onChange:v => { P.fail = v; run(); }}).el, ui.slider({label:'Retries per task', min:0, max:2, step:1, value:1, fmt:v => v, onInput:v => { P.retries = v; run(); }}).el), el('p', {class:'lab-hint'}, 'Nightly video report: views, creators, and payments are extracted. Views are cleaned before data is combined. The daily and trend reports follow. Red bars show failed attempts.'), out);
  run();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'queues-pubsub-streams', title:'Queues vs pub/sub vs event streams', minutes:9, tags:['message queue','pub/sub','event stream','broker','async'],
  summary:'A queue gives a job to one worker at a time. Pub/sub sends news to every interested subscriber. An event stream keeps an ordered record that readers can revisit.',
  problem:`<h3>A small example</h3><p>A creator uploads a video. The app has more work after accepting it.</p><ul><li>Convert the video into playable sizes.</li><li>Tell followers it is ready.</li><li>Count views and keep publishing history.</li></ul><p>Which work goes to one worker, which news reaches several services, and which events need replay?</p>`,
  intuition:`A queue is a job tray where one worker takes a task. Pub/sub is an announcement heard by every subscriber. A stream is a dated notebook readers can reopen later.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the video after upload, when the creator no longer needs to wait.</p>',
    steps:[
      {icon:'📥', title:'Put conversion in a queue', text:'One free worker takes a video conversion job. Another worker can take the next job.'},
      {icon:'📣', title:'Publish ready news', text:'Pub/sub gives each interested service its own VideoReady notice.'},
      {icon:'📜', title:'Keep a stream', text:'An event stream retains ordered notices so analytics or a new service can read earlier events.'},
      {icon:'⏳', title:'Let work finish later', text:'The upload request can answer before conversion and follower notices finish.'},
      {icon:'🔁', title:'Plan for repeats', text:'A worker may see a job again after an uncertain result. Use the repeated-ID rule from Module 6.'}
    ],
    diagram:{title:'One video, three ways to hand off work', w:800, h:280, alt:'A video service gives conversion jobs to workers, broadcasts ready news, and retains a log for later readers.',
      nodes:[{id:'o', type:'service', label:'Video service', x:90, y:140, w:130}, {id:'q', type:'queue', label:'Work queue', sub:'convert videos', x:300, y:50, w:120}, {id:'w1', type:'service', label:'Convert worker 1', x:520, y:25, w:140}, {id:'w2', type:'service', label:'Convert worker 2', x:520, y:85, w:140}, {id:'log', type:'queue', label:'Event log', sub:'video events', x:300, y:220, w:130}, {id:'an', type:'service', label:'Analytics', x:520, y:170, w:120}, {id:'loy', type:'service', label:'Followers', x:520, y:235, w:120}, {id:'new', type:'service', label:'New service', sub:'replays history', x:700, y:200, w:150}],
      edges:[{from:'o', to:'q'}, {from:'q', to:'w1'}, {from:'q', to:'w2'}, {from:'o', to:'log'}, {from:'log', to:'an'}, {from:'log', to:'loy'}, {from:'log', to:'new', curve:-.1}],
      steps:[
        {note:'Each conversion job goes to one free worker for this attempt.', flow:[['o', 'q', 'video 1'], ['q', 'w1'], ['o', 'q', 'video 2'], ['q', 'w2']]},
        {note:'Analytics and follower notices each receive VideoReady news.', flow:[['o', 'log', 'VideoReady'], ['log', 'an'], ['log', 'loy']], hl:['log']},
        {note:'The retained log lets a new service read earlier video events.', flow:[['log', 'new', 'from start']], hl:['new']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Office handoff', 'Video app'], [['One job from a tray', 'Queue gives conversion to one worker.'], ['Announcement to every team', 'Pub/sub tells interested services.'], ['Notebook kept for later', 'Stream lets a new reader replay history.']])}</div><div class="callout tip"><b>Important point</b><p>Choose by who needs the message and whether later readers need its history.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Video task', 'Choice'], [['Convert one upload', 'Work queue.'], ['Tell several services a video is ready', 'Pub/sub.'], ['Let a new service rebuild past video activity', 'Event stream.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say each conversion takes 60 seconds and 1,000 videos arrive in an hour. One worker finishes 3,600 ÷ 60 = 60 videos an hour. So the queue needs 1,000 ÷ 60 = 16.7 workers, which rounds up to 17. Adding workers to a queue is easy because each job goes to only one of them.</p><p>For pub/sub, say 3 services listen for VideoReady. One event becomes 3 deliveries, one for each service. For a stream, say each event is 200 bytes and the app records 1 million a day. That is 200 MB a day, or 1.4 GB for 7 days of replay.</p><h4>When it goes wrong</h4><p>Most systems deliver at least once. A worker may finish a conversion and crash before it confirms. The queue then hands the same job to another worker. So conversion must be safe to run twice.</p>`
  },
  tradeoffs:{use:[`For video conversion, a queue shares jobs across workers.`, `For VideoReady, pub/sub reaches followers and analytics independently.`, `For a later video service, a retained log allows replay.`], avoid:[`Do not make upload wait for a slow follower email.`, `Do not expect a short-lived work queue to provide all historical video events.`], alt:[`For a small first version, a database job table may be enough for conversion work.`]},
  real:[
    {co:'AWS', tier:'confirmed', text:'AWS documents work queues and publish-subscribe topics as separate messaging tools.', src:'AWS SQS and SNS documentation'}
  ],
  mistakes:[`Doing video conversion inside the upload request.`, `Using one-worker queue semantics when every interested service needs VideoReady.`],
  interview:[`Choose a work queue, pub/sub, or stream for three video actions.`, `Explain what the creator sees while conversion runs.`],
  tryit:[{quiz:[
    {q:'Which tool gives one conversion job to one worker at a time?', options:['Work queue', 'Broadcast to all workers', 'DNS', 'A browser tab'], answer:0, why:'One worker handles each delivery attempt.'},
    {q:'Which tool lets a new service read older VideoReady events?', options:['Retained event stream', 'A deleted work job', 'A phone call', 'A cache key only'], answer:0, why:'The stream keeps events for later readers.'}
  ]}, {note:'Sort video actions by who needs the work and whether history matters.', mount:host => sortGame(host, [
    {t:'Convert each uploaded video', c:'q', why:'One free worker takes a job.'},
    {t:'Tell followers and analytics a video is ready', c:'p', why:'Both subscribers need the news.'},
    {t:'Let a new service rebuild months of published-video history', c:'l', why:'It needs retained events to replay.'}
  ], [{id:'q', label:'Queue'}, {id:'p', label:'Pub/sub'}, {id:'l', label:'Event log'}])}],
  sources:[`AWS SQS and SNS documentation`]
},
{
  id:'kafka', title:'Kafka: topics, partitions, consumer groups, offsets', minutes:12, tags:['Kafka','partition','consumer group','offset','retention','compaction'],
  summary:'Kafka keeps events in named topics split into ordered partitions. A key keeps one video’s events together. Consumer groups divide the partitions, and offsets mark reading progress.',
  problem:`<h3>A small example</h3><p>The video app records upload, ready, and removed events for each video.</p><ul><li>Events for one video must stay ordered.</li><li>Analytics and follower notices both need the events.</li><li>A new service may read earlier events.</li></ul><p>How can Kafka divide the work without losing the order for one video?</p>`,
  intuition:`A library keeps numbered event ledgers in several lanes. All entries for video 42 use one lane. Each reading team keeps its own bookmark.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow VideoReady for video 42 through a three-partition topic.</p>',
    steps:[
      {icon:'📚', title:'Create a topic', text:'A topic is a named event stream. Kafka splits it into ordered parts called partitions.'},
      {icon:'🔑', title:'Key by video ID', text:'Video 42 events use the same key and go to the same partition in order.'},
      {icon:'👥', title:'Divide one group', text:'Two analytics workers in one consumer group split three partitions. Only one member reads each partition for that group.'},
      {icon:'🔖', title:'Save a bookmark', text:'An offset is a record’s numbered place in its partition. A worker saves progress after processing.'},
      {icon:'🔁', title:'Keep events for replay', text:'Kafka retains events for a chosen period so another group can read earlier video history.'}
    ],
    diagram:{title:'Video events in three Kafka partitions', w:780, h:280, alt:'Events keyed by video ID go to one partition. Two workers in one group divide three partitions and track progress.',
      nodes:[{id:'pr', type:'service', label:'Video service', sub:'key = video ID', x:90, y:140, w:140}, {id:'p0', type:'queue', label:'Partition 0', x:340, y:55, w:130}, {id:'p1', type:'queue', label:'Partition 1', x:340, y:140, w:130}, {id:'p2', type:'queue', label:'Partition 2', x:340, y:225, w:130}, {id:'c1', type:'service', label:'Analytics #1', sub:'P0, P1', x:610, y:85, w:130}, {id:'c2', type:'service', label:'Analytics #2', sub:'P2', x:610, y:195, w:130}],
      edges:[{from:'pr', to:'p0'}, {from:'pr', to:'p1'}, {from:'pr', to:'p2'}, {from:'p0', to:'c1'}, {from:'p1', to:'c1'}, {from:'p2', to:'c2'}],
      steps:[
        {note:'Video 42 upload and ready events reach Partition 1 in order.', flow:[['pr', 'p1', '42 upload'], ['pr', 'p1', '42 ready']], hl:['p1']},
        {note:'Other video IDs can use other partitions.', flow:[['pr', 'p0', 'video 7'], ['pr', 'p2', 'video 19']], parallel:true},
        {note:'Analytics workers divide the partitions within their group.', flow:[['p0', 'c1'], ['p1', 'c1'], ['p2', 'c2']], parallel:true},
        {note:'Worker 2 stops. Worker 1 can resume P2 from its saved offset.', status:{c2:'down'}, sub:{c1:'P0, P1, P2'}, flow:[['p2', 'c1', 'offset 812']]}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Numbered ledger', 'Kafka idea'], [['Ledger lane', 'Partition.'], ['Video ID on each entry', 'Key chooses the lane.'], ['Reader bookmark', 'Offset.'], ['Team divides lanes', 'Consumer group.']])}</div><div class="callout tip"><b>Important point</b><p>Order is within a partition. Use one video ID as the key for events that must stay in order.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Need', 'Kafka choice'], [['Keep one video’s events ordered', 'Key events by video ID.'], ['Use two analytics workers', 'Split partitions within one group.'], ['Let a new service read old events', 'Keep a retention period.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say a topic has 6 partitions. A group of 4 workers gets 2, 2, 1 and 1 partitions. A group of 8 workers still uses only 6, so 2 sit idle. The partition count is the most parallel workers one group can have.</p><p>Say the newest offset is 10,500 and the group saved 10,200. The lag is 300 events. If workers read 100 events a second and 50 new ones arrive each second, the lag drops by 50 each second. It clears in 300 ÷ 50 = 6 seconds.</p><h4>When it goes wrong</h4><p>Kafka picks a partition as the key hash mod the number of partitions. Say a key hashes to 7. With 3 partitions, 7 mod 3 = 1. After adding a fourth, 7 mod 4 = 3. The key moves to a new partition.</p><p>Saving the offset after processing can repeat an event if the worker crashes. Saving it before can skip an event. Most video apps save after.</p>`
  },
  tradeoffs:{use:[`For VideoReady history, Kafka helps when several services read independently and a new reader needs replay.`, `Key events by video ID when one video’s order matters.`], avoid:[`Do not start Kafka only to run a few slow conversion jobs.`, `Do not assume order across different partitions.`], alt:[`Use a simpler work queue when each video only needs one conversion job.`]},
  real:[
    {co:'Apache Kafka', tier:'confirmed', text:'Kafka documents partitioned topics, consumer groups, offsets, and retained records.', src:'Apache Kafka documentation'}
  ],
  mistakes:[`Sending VideoReady without a video ID key when per-video order matters.`, `Adding workers beyond the partition count and expecting more parallel work.`],
  interview:[`Explain video ID, partition, group, and offset with one VideoReady event.`, `Describe what the group does after one worker stops.`],
  tryit:[{quiz:[
    {q:'Why use video ID as a Kafka key?', options:['Events for one video keep one partition order', 'It changes the video title', 'Every event reaches every worker', 'It removes offsets'], answer:0, why:'The same key chooses the same partition.'},
    {q:'With three partitions and five workers in one group, how many can read a partition at once?', options:['One worker per partition', 'Five workers per partition', 'No workers', 'All groups must stop'], answer:0, why:'One group member owns each partition at a time.'}
  ]}, {note:'Key events by video ID, change worker count, and watch offsets and lag in the Kafka playground.', pg:'kafka'}],
  sources:[`Apache Kafka documentation`]
},
{
  id:'rabbitmq-sqs', title:'RabbitMQ, SQS and Kafka compared', minutes:8, tags:['RabbitMQ','SQS','AMQP','exchange','visibility timeout','broker comparison'],
  summary:'RabbitMQ routes jobs through flexible rules. SQS is a managed work queue that lets unfinished jobs reappear. Kafka retains an event history for independent readers.',
  problem:`<h3>A small example</h3><p>The video app needs three different handoffs.</p><ul><li>Convert uploaded videos with workers.</li><li>Route notices by type.</li><li>Let analytics replay VideoReady history.</li></ul><p>Which tool fits each need without making the others harder?</p>`,
  intuition:`RabbitMQ is a post office that sorts letters by address rules. SQS is a managed job box. Kafka is a numbered archive readers can revisit.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Match each video handoff to the tool’s strongest job.</p>',
    steps:[
      {icon:'📮', title:'RabbitMQ sorts notices', text:'An exchange can route one notice to different work boxes using its type, such as video.ready.'},
      {icon:'📦', title:'SQS holds conversion work', text:'A worker receives a job that becomes temporarily hidden from other workers.'},
      {icon:'⏳', title:'Unfinished SQS work returns', text:'If the worker does not finish before its visibility time ends, the job can reappear.'},
      {icon:'📜', title:'Kafka keeps history', text:'Analytics readers track offsets and can replay retained VideoReady events.'}
    ],
    stepper:{title:'SQS visibility timeout lifecycle', items:[
      {title:'Send conversion', tag:'job', text:'The video app sends a job for one uploaded file.'},
      {title:'Worker receives', tag:'hidden', text:'The job is hidden from other workers for a set time.'},
      {title:'Worker converts', tag:'work', text:'If conversion needs longer, the worker can request more time.'},
      {title:'Finish', tag:'delete', text:'After success, the worker deletes the job from the queue.'},
      {title:'Worker stops', tag:'reappear', text:'Without deletion, the job becomes visible for another worker to try.'},
      {title:'Repeated failure', tag:'inspect', text:'After a limit, send the job to a dead-letter queue for inspection.'}
    ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Office tool', 'Video app tool'], [['Mail sorter', 'RabbitMQ routes by notice type.'], ['Managed job box', 'SQS lends conversion work.'], ['Numbered archive', 'Kafka keeps VideoReady history.']])}</div><div class="callout tip"><b>Important point</b><p>Choose by routing, who operates the tool, and whether later readers need old events.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Video need', 'Useful tool'], [['Route several notice types to different workers', 'RabbitMQ.'], ['Run a managed conversion queue', 'SQS.'], ['Replay publishing events', 'Kafka.']])}</div>`,
    deep:`<h4>The numbers</h4><p>SQS hides a received job for the visibility timeout, 30 seconds by default. Say one conversion takes 90 seconds. At 30 seconds the job reappears and a second worker takes it. At 60 seconds a third worker takes it. Three workers now convert the same video. Setting the timeout to 120 seconds, above the slowest conversion, stops this.</p><h4>How it works inside</h4><p>A RabbitMQ topic exchange matches a notice type against patterns. A queue bound to video.* receives video.ready and video.removed. A queue bound to video.ready receives only the first one.</p><p>If a RabbitMQ worker dies before it confirms a job, the broker puts the job back in the queue.</p><h4>When it goes wrong</h4><p>A standard SQS queue may deliver jobs out of order and may deliver one twice. A FIFO queue keeps order inside a message group, and a video ID can be the group. Its price is lower throughput.</p>`
  },
  tradeoffs:{use:[`For video conversion, SQS can lend each job to a worker without the team running a broker.`, `For many notice routes, RabbitMQ’s exchange rules can help.`, `For retained VideoReady history, Kafka fits replay.`], avoid:[`Do not choose Kafka for one small conversion job solely because it keeps history.`, `Do not expect a queue to preserve every old event for a new analytics reader.`], alt:[`A small app can begin with a database job table if these separate tools are not needed yet.`]},
  real:[
    {co:'RabbitMQ', tier:'confirmed', text:'RabbitMQ documents exchanges that route messages to queues.', src:'RabbitMQ documentation'},
    {co:'Amazon SQS', tier:'confirmed', text:'SQS documents visibility timeouts for received work.', src:'Amazon SQS developer guide'}
  ],
  mistakes:[`Using a visibility time shorter than video conversion without extending it.`, `Expecting a failed job to disappear without deletion or a retry policy.`],
  interview:[`Choose a tool for conversion, routed notices, and replay.`, `Explain why an SQS job can reappear.`],
  tryit:{quiz:[
    {q:'Which tool can route video notices by type with an exchange?', options:['RabbitMQ', 'A browser tab', 'Only a CDN', 'A photo editor'], answer:0, why:'RabbitMQ exchanges apply routing rules.'},
    {q:'What may happen when SQS visibility time ends before conversion finishes?', options:['The job can reappear for another worker', 'The video must be deleted', 'Kafka loses offsets', 'The creator pays twice'], answer:0, why:'SQS may lend the unfinished job again.'},
    {q:'Which tool retains VideoReady events for a new reader to replay?', options:['Kafka', 'A deleted work job', 'Only a local file', 'A DNS answer'], answer:0, why:'Kafka retains events and lets groups read old offsets.'}
  ]},
  sources:[`RabbitMQ documentation`, `Amazon SQS developer guide`, `Apache Kafka documentation`]
},
{
  id:'ordering-dlq', title:'Ordering, retries and dead-letter queues', minutes:9, tags:['ordering','retry','poison message','DLQ','head-of-line blocking'],
  summary:'A queue keeps order only within its ordered lane. Failed jobs need limited retries and a place for inspection so later jobs can move.',
  problem:`<h3>A small example</h3><p>The video app converts uploads in the order they arrive.</p><ul><li>Video #1 converts.</li><li>Video #2 converts.</li><li>Video #3 has a broken file and always fails.</li></ul><p>Should video #4 wait forever behind #3?</p>`,
  intuition:`Think of one checkout line. If one payment fails repeatedly, the cashier can send it to a help desk and serve the next person.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the failed conversion job through a limited retry policy.</p>',
    steps:[
      {icon:'🔢', title:'Keep related jobs together', text:'Jobs for one video use the same key, so one Kafka partition keeps their order.'},
      {icon:'⏳', title:'Retry a temporary failure', text:'If storage briefly times out, wait before trying again. The worker may receive the job twice.'},
      {icon:'📦', title:'Park a broken job', text:'After three failures, move video #3 to a dead-letter queue, or DLQ, with its error.'},
      {icon:'🔧', title:'Fix and replay', text:'An engineer inspects the error, fixes the cause, then sends the job through again.'}
    ],
    diagram:{title:'Retry topics and a DLQ', w:780, h:250, alt:'A consumer fails on a message, moves it to a retry topic with delay, and after repeated failure to a dead-letter queue.',
      nodes:[{id:'m', type:'queue', label:'video.jobs', x:90, y:120}, {id:'c', type:'service', label:'Converter', x:290, y:120}, {id:'r', type:'queue', label:'video.retry', sub:'wait 1 min', x:500, y:45, w:140}, {id:'dlq', type:'queue', label:'video.DLQ', x:500, y:200, w:130}, {id:'ops', type:'client', label:'Inspect and replay', x:700, y:200, w:150}],
      edges:[{from:'m', to:'c'}, {from:'c', to:'r'}, {from:'r', to:'c', curve:.2}, {from:'c', to:'dlq'}, {from:'dlq', to:'ops'}],
      steps:[
        {note:'Video #3 fails. It moves to a delayed retry queue, so #4 can start.', flow:[['m', 'c', '#3'], ['c', 'r', 'attempt 1']], hl:['r']},
        {note:'The converter tries video #3 again after the wait.', flow:[['r', 'c', 'attempt 2'], ['c', 'r', 'fail']]},
        {note:'After three failures, video #3 and its error move to the DLQ.', flow:[['r', 'c', 'attempt 3'], ['c', 'dlq', '#3 + error']], hl:['dlq']},
        {note:'An engineer inspects the file, fixes the cause, and replays the job.', flow:[['dlq', 'ops', 'alert']], hl:['ops']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Checkout line', 'Video jobs'], [['Payment may work on retry', 'Temporary storage timeout'], ['Payment cannot work', 'Broken video file'], ['Help desk', 'DLQ for inspection']])}</div><div class="callout tip"><b>Important point</b><p>A delayed retry lets later jobs move, but can change their processing order.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Failure', 'Action'], [['Short storage outage', 'Retry after a wait'], ['Broken file', 'Send to DLQ'], ['Later job depends on #3', 'Pause that video’s jobs until #3 is fixed']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say a retry waits 1 second, then 2, then 4. Each wait doubles. Three retries add 1 + 2 + 4 = 7 seconds of waiting. This is called exponential backoff. A small random extra wait, called jitter, stops many failed jobs from retrying at the same instant.</p><p>Say a bad deploy breaks 200 jobs and they all land in the DLQ. After the fix, you replay them at 10 jobs a second. That takes 200 ÷ 10 = 20 seconds, and it does not flood the workers.</p><h4>When it goes wrong</h4><p>A DLQ is only useful if someone looks at it. Alert when it has even 1 job. Also check its retention. SQS keeps messages at most 14 days, so an unfixed job can vanish.</p><p>Keep the attempt count with the job. Without it, a replayed job can loop forever between the queue and the DLQ.</p>`
  },
  tradeoffs:{use:[`Use a limited retry for a temporary video storage outage.`, `Keep jobs for one video under one key.`], avoid:[`Retrying a broken video forever.`, `Leaving the video DLQ unmonitored.`], alt:[`If later steps require conversion first, pause only that video’s later jobs.`]},
  real:[
    {co:'Uber', tier:'confirmed', text:'Described building reliable reprocessing with Kafka retry topics and dead-letter queues so failing messages don’t block consumer progress.', src:'Uber Engineering, “Building Reliable Reprocessing and Dead Letter Queues with Apache Kafka” (2018)'},
    {co:'Amazon SQS', tier:'confirmed', text:'Redrive policies move messages to a DLQ after maxReceiveCount, and DLQ redrive moves them back after fixes.', src:'Amazon SQS developer guide'}
  ],
  mistakes:[`Retrying a broken file with no limit.`, `Losing the video ID and error when parking the job.`, `Assuming delayed retries keep completion order.`],
  interview:[`Explain what happens to video #4 while #3 is retried.`, `Describe when an engineer can replay a job from the DLQ.`],
  tryit:[{quiz:[{q:'A video file is broken and fails every time. What should happen?', options:['Move it to a DLQ after limited attempts', 'Retry forever', 'Delete the whole queue', 'Pause every worker forever'], answer:0, why:'The broken job needs inspection while other jobs proceed.'}, {q:'What can a separate delayed retry queue change?', options:['Processing order', 'The original video file', 'The creator’s account name', 'The number of registered users'], answer:0, why:'Later jobs may finish before the retried job.'}]}, {note:'Message #3 is broken. Compare endless retry with a three-attempt DLQ policy.', mount:host => poisonDemo(host)}],
  sources:[`Uber Engineering (2018)`, `Amazon SQS docs`, `Confluent docs on error handling`]
},
{
  id:'backpressure', title:'Backpressure and flow control', minutes:8, tags:['backpressure','flow control','load shedding','buffer','autoscaling'],
  summary:'Backpressure slows incoming work when workers cannot keep up. A fixed queue size makes the overload visible before memory fills.',
  problem:`<h3>A small example</h3><p>A popular creator uploads many videos at once.</p><ul><li>New conversion jobs arrive at 500 each second.</li><li>Workers finish 150 jobs each second.</li><li>A memory queue holds at most 2,000 jobs.</li></ul><p>What happens when the queue fills?</p>`,
  intuition:`Imagine a sink. Water enters faster than it drains. The sink fills unless you turn down the tap or add drainage.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>The conversion queue shows why incoming work needs a limit.</p>',
    steps:[
      {icon:'📥', title:'Jobs arrive', text:'The app adds 500 conversion jobs each second.'},
      {icon:'🎞️', title:'Workers finish fewer', text:'Workers finish 150 each second, so 350 jobs pile up each second.'},
      {icon:'🧺', title:'The queue fills', text:'At that rate, 2,000 free slots fill in about six seconds.'},
      {icon:'✋', title:'Slow the sender', text:'The app waits or refuses new uploads for now. This is backpressure.'},
      {icon:'📈', title:'Watch the wait', text:'Queue size and the age of the oldest job show how far behind conversion is.'}
    ],
    diagram:{title:'Pressure propagating upstream', w:760, h:230, alt:'A fast upload app fills a bounded job queue. Slow converters signal the app to reduce new work.',
      nodes:[{id:'p', type:'service', label:'Upload app', sub:'500/s', x:100, y:115}, {id:'b', type:'queue', label:'Job queue', sub:'2,000 max', x:370, y:115, w:150}, {id:'c', type:'service', label:'Converters', sub:'150/s', x:640, y:115}],
      edges:[{from:'p', to:'b'}, {from:'b', to:'c'}],
      steps:[
        {note:'Uploads create 500 jobs each second. Converters finish 150, so the queue fills.', flow:[['p', 'b'], ['p', 'b'], ['p', 'b'], ['b', 'c']], status:{b:'hot'}},
        {note:'The full queue asks the upload app to slow down.', flow:[['c', 'b', '150/s'], ['b', 'p', 'wait']], hl:['b']},
        {note:'The app admits work at the pace converters can handle.', sub:{p:'150/s'}, status:{b:'ok'}, flow:[['p', 'b'], ['b', 'c']]}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Sink', 'Video app'], [['Tap', 'New uploads'], ['Basin', 'Waiting job queue'], ['Drain', 'Conversion workers']])}</div><div class="callout tip"><b>Important point</b><p>A bigger queue buys time but does not fix a lasting speed gap.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Choice', 'Effect'], [['Wait when full', 'Keep conversion jobs without growing memory'], ['Add workers', 'Finish jobs faster, if capacity allows'], ['Drop optional previews', 'Protect the main conversion jobs']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say 3 workers finish 50 jobs a second each. That is 3 × 50 = 150 a second. To match 500 arrivals, you need 500 ÷ 50 = 10 workers. So the gap is 7 workers, not a bigger queue.</p><p>A job added to a full queue waits for the 2,000 jobs ahead of it. At 150 a second, that is 2,000 ÷ 150 = 13.3 seconds. A smaller queue of 500 slots would make the wait 500 ÷ 150 = 3.3 seconds. A smaller queue turns overload into a quick refusal, not a long wait.</p><h4>When it goes wrong</h4><p>Refusing an upload can make things worse. If the app retries at once, the load grows again. Reply with a clear busy answer and a time to try again, such as the 429 rate-limit reply from Module 3. Add a random delay so retries do not arrive together.</p>`
  },
  tradeoffs:{use:[`Bound the video conversion queue.`, `Wait or refuse new uploads when conversion is full.`], avoid:[`Letting an in-memory conversion queue grow without limit.`, `Dropping video conversion jobs silently.`], alt:[`Add conversion workers if storage and CPU can support them.`]},
  real:[
    {co:'Reactive Streams', tier:'confirmed', text:'An industry specification for asynchronous stream processing with non-blocking backpressure, adopted in Java 9 as java.util.concurrent.Flow.', src:'Reactive Streams and JDK documentation'},
    {co:'Apache Kafka', tier:'confirmed', text:'Consumers pull at their own pace, so a slow consumer accumulates lag on disk rather than overwhelming itself.', src:'Apache Kafka documentation'},
    {co:'Kubernetes KEDA', tier:'confirmed', text:'KEDA can adjust worker count using queue length or Kafka lag. You will learn autoscaling in Module 9.', src:'KEDA documentation'}
  ],
  mistakes:[`Using a conversion queue with no size limit.`, `Watching queue size but ignoring how long videos wait.`, `Adding retries that increase an already full queue.`],
  interview:[`Calculate how fast a video job queue fills.`, `Explain what the app does when the queue is full.`],
  tryit:[{quiz:[{q:'Jobs arrive at 500 per second and workers finish 150. How fast does the queue grow?', options:['350 per second', '150 per second', '500 per second', '650 per second'], answer:0, why:'500 minus 150 is 350.'}, {q:'What should happen when a must-keep job queue is full?', options:['Pause or reject new work until there is room', 'Grow memory forever', 'Silently drop jobs', 'Delete old videos'], answer:0, why:'Backpressure protects memory without losing accepted work.'}]}, {note:'Try a burst of upload jobs. Compare what happens when the queue blocks, drops, or scales.', mount:host => backpressureSim(host)}],
  sources:[`reactive-streams.org`, `Apache Kafka documentation`, `Kleppmann, DDIA ch. 11`]
},
{
  id:'event-driven', title:'Event-driven architecture, event sourcing and CQRS', minutes:11, tags:['event-driven','event sourcing','CQRS','projection','read model'],
  summary:'Event-driven services react to recorded facts. Event sourcing keeps those facts as history, while CQRS gives reads and writes separate views.',
  problem:`<h3>A small example</h3><p>A creator asks why a video disappeared from the public feed.</p><ul><li>The database shows only its current status: hidden.</li><li>The creator remembers publishing it yesterday.</li><li>Support needs the changes between those moments.</li></ul><p>How can the app explain what happened?</p>`,
  intuition:`A diary records each change. A notice board shows only the latest status. Both answer different questions.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one change to a video’s status.</p>',
    steps:[
      {icon:'📣', title:'Publish a fact', text:'The app records VideoPublished. Feed and notification workers can react to that event.'},
      {icon:'📚', title:'Keep the history', text:'With event sourcing, VideoUploaded, VideoPublished, and VideoHidden are the saved record of the video.'},
      {icon:'🧮', title:'Build current status', text:'Reading those events in order gives the latest status and explains how it changed.'},
      {icon:'👀', title:'Serve a read view', text:'CQRS keeps a separate view for fast creator screens. It may update a moment after the event.'}
    ],
    diagram:{title:'Video history and read views', w:780, h:260, alt:'A video status change is stored as an event, then used to update creator and public views.',
      nodes:[{id:'u', type:'client', label:'Creator app', x:80, y:130}, {id:'cmd', type:'service', label:'Status handler', x:270, y:70, w:150}, {id:'es', type:'db', label:'Event history', sub:'append-only', x:470, y:70, w:140}, {id:'pj', type:'service', label:'View builder', x:470, y:200, w:120}, {id:'rm1', type:'db', label:'Creator view', x:680, y:150, w:130}, {id:'rm2', type:'db', label:'Public view', x:680, y:235, w:130}],
      edges:[{from:'u', to:'cmd'}, {from:'cmd', to:'es'}, {from:'es', to:'pj'}, {from:'pj', to:'rm1'}, {from:'pj', to:'rm2'}, {from:'u', to:'rm1', curve:.25, dashed:true}],
      steps:[
        {note:'The creator publishes a video. The handler stores VideoPublished.', flow:[['u', 'cmd', 'publish'], ['cmd', 'es', 'VideoPublished']], hl:['es']},
        {note:'The view builder reads the event and updates the creator and public views.', flow:[['es', 'pj', 'VideoPublished'], ['pj', 'rm1'], ['pj', 'rm2']], hl:['pj']},
        {note:'The creator reads the status from the creator view.', flow:[['u', 'rm1', 'GET status']], hl:['rm1']},
        {note:'To investigate a later hide, replay the video’s event history.', flow:[['es', 'pj', 'replay']], hl:['es']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Diary and board', 'Video app'], [['Diary entry', 'Video status event'], ['Current notice board', 'Creator status view'], ['Reading the diary again', 'Rebuilding the status view']])}</div><div class="callout tip"><b>Important point</b><p>Publishing events does not require event sourcing. The app can publish facts while storing current status normally.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Approach'], [['Let several workers react to publishing', 'Event-driven'], ['Explain every status change', 'Event sourcing'], ['Serve a fast creator screen', 'CQRS read view']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say a snapshot is saved every 100 events. A video has 1,050 events. Without a snapshot, rebuilding replays 1,050 events. With one, the app loads the snapshot at event 1,000 and replays only 50.</p><p>Say the creator screen view updates 200 ms after an event. A creator who refreshes at 100 ms still sees the old status. Showing the just-saved status in the reply hides this gap.</p><h4>When it goes wrong</h4><p>Saving to the database and publishing the event are two steps. If the app crashes between them, the event is lost. Fix it by writing the event into the database in the same transaction. A separate process then publishes it. The CDC lesson later in this module shows one way to do that.</p><p>Old events stay forever. When the app adds a new field, new code must still read old events that lack it, so give the field a default.</p>`
  },
  tradeoffs:{use:[`Publish VideoPublished when feeds and notifications both react.`, `Keep video status history when support needs to explain changes.`], avoid:[`Adding event sourcing to a simple video title edit.`, `Pretending a lagging read view is always current.`], alt:[`Keep the current video row plus a small status audit table.`]},
  real:[
    {co:'Martin Fowler', tier:'confirmed', text:'Described event sourcing (2005) and the LMAX architecture (2011), where business logic processes an event stream in memory and state is rebuilt by replaying events.', src:'martinfowler.com, Event Sourcing and The LMAX Architecture'},
    {co:'Double-entry ledgers', tier:'confirmed', text:'Accounting ledgers are the original event-sourced systems: balances are derived from immutable journal entries, and errors are corrected with reversing entries.', src:'Standard accounting practice'},
    {co:'Git', tier:'educational', text:'Git’s history of commits works like an event log: the working tree is derived from commits, and you can check out any past state.', src:'Analogy'}
  ],
  mistakes:[`Changing an old video event instead of recording a correction.`, `Building a creator view that cannot be rebuilt.`, `Ignoring delay between a status change and its read view.`],
  interview:[`Explain how VideoHidden appears in history and the creator view.`, `Explain why a read view can briefly show an older status.`],
  tryit:[{quiz:[{q:'Which record explains why a video is hidden now?', options:['Its ordered status events', 'Only its latest title', 'Its file size alone', 'The number of workers'], answer:0, why:'The events preserve the changes that led to the current status.'}, {q:'What can happen just after a status change in CQRS?', options:['The read view may briefly show old status', 'The old event disappears', 'Every video is deleted', 'Reads must stop forever'], answer:0, why:'The read view updates after it consumes the event.'}]}, {note:'Add view-count events, inspect an earlier count, and correct a mistaken event without deleting it.', mount:host => eventSourcingDemo(host)}],
  sources:[`Martin Fowler, Event Sourcing (2005), CQRS (2011), What do you mean by Event-Driven? (2017)`, `Greg Young, CQRS documents`]
},
{
  id:'fan-out', title:'Fan-out on write vs fan-out on read', minutes:9, tags:['fan-out','timeline','feed','push vs pull','celebrity problem'],
  summary:'Fan-out on write copies a new video into follower feeds early. Fan-out on read gathers videos when someone opens a feed.',
  problem:`<h3>A small example</h3><p>The video app has two creators.</p><ul><li>Mina has 300 followers.</li><li>Arun has 50 million followers.</li><li>Both publish one new video.</li></ul><p>Should the app copy each video ID into every follower’s feed?</p>`,
  intuition:`Think of home delivery and a library. Delivery prepares each person’s feed early. A library gathers what they ask for when they arrive.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Watch how the two videos enter a follower’s feed.</p>',
    steps:[
      {icon:'📤', title:'Mina publishes', text:'Workers add Mina’s video ID to 300 follower feeds. This is fan-out on write.'},
      {icon:'📚', title:'Arun publishes', text:'The app stores Arun’s video once instead of copying it 50 million times.'},
      {icon:'📱', title:'A follower opens the app', text:'The feed loads its prepared IDs and fetches Arun’s recent videos. This is fan-out on read.'},
      {icon:'🧩', title:'Merge the results', text:'The app combines both sets into one feed. This mix of approaches is called hybrid fan-out.'}
    ],
    diagram:{title:'Hybrid fan-out', w:780, h:270, alt:'Mina’s video ID is copied into follower feeds. Arun’s video is fetched when a follower reads their feed.',
      nodes:[{id:'n', type:'client', label:'Mina', x:80, y:70, w:120}, {id:'c', type:'client', label:'Arun', x:80, y:200, w:120}, {id:'q', type:'queue', label:'Feed jobs', x:280, y:70, w:130}, {id:'w', type:'service', label:'Feed workers', x:470, y:70, w:140}, {id:'tl', type:'cache', label:'Follower feeds', x:660, y:70, w:150}, {id:'posts', type:'db', label:'Video store', x:380, y:200, w:120}, {id:'r', type:'service', label:'Feed reader', x:660, y:200, w:130}],
      edges:[{from:'n', to:'q'}, {from:'q', to:'w'}, {from:'w', to:'tl'}, {from:'c', to:'posts'}, {from:'n', to:'posts', dashed:true}, {from:'r', to:'tl'}, {from:'r', to:'posts'}],
      steps:[
        {note:'Mina publishes. A job adds her video ID to 300 follower feeds.', flow:[['n', 'q', 'video 991'], ['q', 'w'], ['w', 'tl', '×300']], hl:['tl']},
        {note:'Arun publishes. His video is stored once.', flow:[['c', 'posts', 'video 992']], hl:['posts']},
        {note:'A follower opens the feed. It reads prepared IDs and Arun’s recent videos.', flow:[['r', 'tl', 'GET feed'], ['r', 'posts', 'Arun videos']], parallel:true, hl:['r']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Delivery choice', 'Video feed'], [['Deliver to homes', 'Copy Mina’s video ID into follower feeds'], ['Visit a library', 'Fetch Arun’s video when the feed opens']])}</div><div class="callout tip"><b>Important point</b><p>Store video IDs in prepared feeds, then load video details when needed.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Creator', 'Approach'], [['Mina with 300 followers', 'Fan-out on write'], ['Arun with 50 million followers', 'Fan-out on read'], ['App with both', 'Hybrid']])}</div>`,
    deep:`<h4>The numbers</h4><p>Arun has 50 million followers. Say workers write 100,000 feed entries a second. That takes 50,000,000 ÷ 100,000 = 500 seconds, about 8 minutes, for one video. Storage adds up too. At 8 bytes per video ID, one video costs 50,000,000 × 8 = 400 MB of feed entries.</p><p>Mina needs 300 writes. At the same speed that takes 0.003 seconds.</p><h4>When it goes wrong</h4><p>Most followers never open the app today. The app can write only to feeds of people active in, say, the last 7 days. Everyone else builds a feed when they return.</p><p>The follower limit between the two methods is a number you choose, for example 1 million. Test it with real write and read costs. A follower of 200 creators with 5 above the limit merges 5 recent lists with a prepared feed. That is a small, fixed extra cost on each open.</p>`
  },
  tradeoffs:{use:[`Copy Mina’s video ID for her 300 followers.`, `Fetch Arun’s video at read time for his huge audience.`], avoid:[`Copying Arun’s video ID 50 million times for each upload.`, `Making Mina wait for feed copies before publishing succeeds.`], alt:[`Start with read-time feeds while the video app is small.`]},
  real:[
    {co:'Twitter / X', tier:'confirmed', text:'Engineers described a fan-out-on-write system pushing tweet IDs into in-memory (Redis) home timelines, with high-follower accounts handled differently to avoid enormous fan-out.', src:'Raffi Krikorian, “Timelines at Scale” (QCon 2013)'},
    {co:'Instagram / Facebook feeds', tier:'inference', text:'Large feeds combine prepared candidates with read-time aggregation and ranking.', src:'Public engineering talks'}
  ],
  mistakes:[`Copying whole video files into follower feeds.`, `Making the publish request wait for every feed copy.`, `Showing deleted videos from prepared feeds.`],
  interview:[`Compare the writes for 300 and 50 million followers.`, `Explain how the hybrid feed loads Arun’s video.`],
  tryit:[{quiz:[{q:'Why avoid copying Arun’s video ID to all 50 million feeds?', options:['It creates too many writes for one upload', 'Videos cannot have IDs', 'Followers cannot open feeds', 'Kafka has no keys'], answer:0, why:'One upload would require about 50 million feed writes.'}, {q:'What does Mina’s prepared feed store?', options:['Video IDs', 'Copies of full video files', 'Only passwords', 'Nothing'], answer:0, why:'IDs are small and can be used to fetch details later.'}]}, {note:'Compare write, read, and hybrid fan-out with a creator who has many followers.', pg:'fanout'}],
  sources:[`Raffi Krikorian, “Timelines at Scale”, QCon 2013`, `Kleppmann, DDIA ch. 1 (Twitter example)`]
},
{
  id:'batch-vs-stream', title:'Batch vs stream processing (MapReduce, Spark, Flink)', minutes:11, tags:['batch','stream processing','MapReduce','Spark','Flink','Kafka Streams','windowing'],
  summary:'Batch processing handles a saved set of data, such as yesterday’s views. Stream processing updates results as new view events arrive.',
  problem:`<h3>A small example</h3><p>The video app counts views for creators.</p><ul><li>The daily report can be ready each morning.</li><li>The live dashboard should update within seconds.</li><li>Some viewers reconnect after being offline.</li></ul><p>Should one processing method serve both screens?</p>`,
  intuition:`Batch is counting all tickets after a show. Streaming is updating the count as people enter.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>The same view events can feed reports at different speeds.</p>',
    steps:[
      {icon:'📅', title:'Save the day’s views', text:'A batch job reads the saved events after the day ends.'},
      {icon:'🧩', title:'Group and count', text:'MapReduce groups records by video ID and adds each group. Spark can run similar work in several stages.'},
      {icon:'⚡', title:'Update live counts', text:'A stream job reads each new view event and updates its current count.'},
      {icon:'🕒', title:'Count by viewing time', text:'A view may arrive late. Use the time it happened when deciding which period to count.'}
    ],
    diagram:{title:'MapReduce video view count', w:780, h:270, alt:'Saved view events are grouped by video ID and counted in parallel.',
      nodes:[{id:'i1', type:'db', label:'Split 1', x:80, y:60, w:100}, {id:'i2', type:'db', label:'Split 2', x:80, y:140, w:100}, {id:'i3', type:'db', label:'Split 3', x:80, y:220, w:100}, {id:'m1', type:'service', label:'Map 1', x:260, y:60, w:100}, {id:'m2', type:'service', label:'Map 2', x:260, y:140, w:100}, {id:'m3', type:'service', label:'Map 3', x:260, y:220, w:100}, {id:'r1', type:'service', label:'Reduce A–M', x:480, y:95, w:130}, {id:'r2', type:'service', label:'Reduce N–Z', x:480, y:190, w:130}, {id:'o', type:'db', label:'Output', x:680, y:140, w:110}],
      edges:[{from:'i1', to:'m1'}, {from:'i2', to:'m2'}, {from:'i3', to:'m3'}, {from:'m1', to:'r1'}, {from:'m1', to:'r2'}, {from:'m2', to:'r1'}, {from:'m2', to:'r2'}, {from:'m3', to:'r1'}, {from:'m3', to:'r2'}, {from:'r1', to:'o'}, {from:'r2', to:'o'}],
      steps:[
        {note:'Map turns each saved view into a pair: video ID and 1.', flow:[['i1', 'm1'], ['i2', 'm2'], ['i3', 'm3']], parallel:true},
        {note:'Shuffle sends pairs with the same video ID to the same counter.', flow:[['m1', 'r1', 'video A'], ['m2', 'r1', 'video A'], ['m3', 'r2', 'video Z']], parallel:true, hl:['r1', 'r2']},
        {note:'Reduce adds each video’s counts and saves the results.', flow:[['r1', 'o', 'A=4'], ['r2', 'o', 'Z=2']], parallel:true, hl:['o']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Ticket count', 'Video views'], [['Count after the show', 'Daily batch report'], ['Count as people enter', 'Live stream dashboard']])}</div><div class="callout tip"><b>Important point</b><p>Choose based on how fresh the answer must be.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Method'], [['Yesterday’s final view count', 'Batch'], ['Views in the last minute', 'Stream'], ['Several saved datasets joined together', 'Batch with Spark']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the app gets 100 million views a day. That is 100,000,000 ÷ 86,400 = about 1,157 events a second. At 100 bytes each, a day is 100,000,000 × 100 = 10 GB. A batch job can read that after midnight. A stream job must keep up with 1,157 events every second.</p><p>In MapReduce, each machine can first add up its own pairs before the shuffle. Say 10 machines each see 50,000 different videos. The shuffle then moves 10 × 50,000 = 500,000 pairs, not 100 million.</p><h4>When it goes wrong</h4><p>A stream job keeps counts in memory. If it crashes, those counts are gone. Stream tools such as Flink save checkpoints, which are copies of the counts, so a restarted job continues from the last one.</p><p>One-minute windows give 24 × 60 = 1,440 windows a day for each video.</p>`
  },
  tradeoffs:{use:[`Use batch for the video app’s final daily view report.`, `Use streaming for a live creator dashboard.`], avoid:[`Building a stream job when tomorrow morning is soon enough.`, `Counting late views by arrival time without deciding why.`], alt:[`Run a short batch every few minutes if the dashboard need is modest.`]},
  real:[
    {co:'Google MapReduce', tier:'confirmed', text:'Introduced map, shuffle and reduce with automatic parallelisation and re-execution of failed tasks on commodity clusters.', src:'Dean & Ghemawat, “MapReduce”, OSDI 2004'},
    {co:'Apache Spark', tier:'confirmed', text:'Originated at UC Berkeley with resilient distributed datasets for in-memory, fault-tolerant cluster computing.', src:'Zaharia et al., NSDI 2012'},
    {co:'Google Dataflow model', tier:'confirmed', text:'Formalised event-time windowing, watermarks, and triggers for unbounded data.', src:'Akidau et al., The Dataflow Model (2015)'}
  ],
  mistakes:[`Using arrival time for a viewer who reconnects later.`, `Running a costly live job for a daily report.`, `Ignoring a popular video that sends most counts to one worker.`],
  interview:[`Choose batch or stream for the video app’s two view screens.`, `Explain map, shuffle, and reduce using video IDs.`],
  tryit:[{quiz:[{q:'A creator needs yesterday’s final view count each morning. Which fits?', options:['Batch processing', 'A new queue for each viewer', 'A live stream job only', 'Manual counting'], answer:0, why:'The report can process the saved day as one batch.'}, {q:'What does shuffle do in MapReduce?', options:['Groups pairs by video ID', 'Deletes all videos', 'Changes watch time', 'Starts a browser'], answer:0, why:'The same video’s pairs reach the same counter.'}]}, {note:'Count words in video captions to practice map, shuffle, and reduce. The same steps can count views by video ID.', mount:host => mapReduceDemo(host)}],
  sources:[`Dean & Ghemawat, OSDI 2004`, `Zaharia et al., NSDI 2012`, `Akidau et al., VLDB 2015`, `Carbone et al., “Apache Flink” (IEEE Data Eng. Bull. 2015)`]
},
{
  id:'lambda-kappa', title:'Lambda vs Kappa architectures (and late data)', minutes:9, tags:['Lambda architecture','Kappa architecture','watermark','late data','reprocessing'],
  summary:'Lambda combines a quick stream count with a later batch count. Kappa uses one stream job and replays saved events to recalculate.',
  problem:`<h3>A small example</h3><p>A creator sees two counts for yesterday’s video.</p><ul><li>The live dashboard shows 10,412 views.</li><li>The next morning’s report shows 10,438 views.</li><li>Some view events arrived after offline phones reconnected.</li></ul><p>How should the app handle the late events and explain the difference?</p>`,
  intuition:`Imagine a running tally during a show and a final count afterward. You can keep both tallies, or recount saved tickets with one method.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>There are two ways to produce a current and a corrected count.</p>',
    steps:[
      {icon:'⚡', title:'Count views now', text:'A stream job updates the creator dashboard as view events arrive.'},
      {icon:'📅', title:'Recount later', text:'In Lambda, a batch job recalculates yesterday’s views from saved events.'},
      {icon:'🔁', title:'Replay instead', text:'In Kappa, one stream job can read the saved event log again to rebuild the count.'},
      {icon:'🕒', title:'Allow late views', text:'Both approaches need a rule for views that arrive after their time window seemed complete.'}
    ],
    diagram:{title:'Lambda vs Kappa', w:780, h:270, alt:'Lambda combines batch and live view counts. Kappa recalculates counts by replaying saved view events through one stream job.',
      nodes:[{id:'src', type:'queue', label:'Event log', x:90, y:140, w:120}, {id:'b', type:'service', label:'Batch layer', sub:'nightly, exact', x:320, y:60, w:140}, {id:'s', type:'service', label:'Speed layer', sub:'streaming, approx', x:320, y:140, w:150}, {id:'srv', type:'db', label:'Serving (merge)', x:560, y:100, w:150}, {id:'k', type:'service', label:'Kappa: one stream job', sub:'replay to reprocess', x:320, y:235, w:180}, {id:'kv', type:'db', label:'Kappa views', x:560, y:235, w:120}],
      edges:[{from:'src', to:'b'}, {from:'src', to:'s'}, {from:'b', to:'srv'}, {from:'s', to:'srv'}, {from:'src', to:'k'}, {from:'k', to:'kv'}],
      steps:[
        {note:'Lambda sends saved view events to a nightly batch count and a live count.', flow:[['src', 'b'], ['src', 's']], parallel:true},
        {note:'The dashboard uses the final batch count for past days and live counts for today.', flow:[['b', 'srv'], ['s', 'srv']], parallel:true, hl:['srv']},
        {note:'<b>Kappa:</b> one streaming job. To change logic, replay the log into a new version of the job, then switch readers.', flow:[['src', 'k', 'replay'], ['k', 'kv']], hl:['k']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Ticket counting', 'Video views'], [['Running tally plus final count', 'Lambda'], ['Recount saved tickets with one counter', 'Kappa replay']])}</div><div class="callout tip"><b>Important point</b><p>A fast count can change when a late view arrives. Show the time period and whether its number is final.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Need', 'Approach'], [['Separate daily final report', 'Lambda'], ['One processing rule with replayable history', 'Kappa'], ['Late phone events', 'Allow corrections to past counts']])}</div>`,
    deep:`<h4>The numbers</h4><p>The report has 10,438 views and the dashboard had 10,412. The gap is 10,438 − 10,412 = 26 late views. That is 26 ÷ 10,438 = about 0.25%. The gap is small, but a creator who sees two numbers still needs a reason.</p><p>For Kappa, say replay runs 10 times faster than live. Rebuilding 24 hours of events takes 24 ÷ 10 = 2.4 hours. The old job keeps serving the dashboard meanwhile. When the new job catches up, the app switches to it.</p><h4>When it goes wrong</h4><p>Say the stream job waits 10 minutes for late events. A phone offline for 2 hours misses that window. The job can send such views to a side list for a later recount. Then the dashboard can label yesterday as final only after that recount.</p><p>Lambda also means two code paths. If a fix lands in one and not the other, the two counts drift apart.</p>`
  },
  tradeoffs:{use:[`Use Lambda if the video app already has a trusted daily recount.`, `Use Kappa if it can replay enough saved view history.`], avoid:[`Showing two counts without saying which is final.`, `Silently discarding late view events.`], alt:[`Keep one live count and reconcile it with a periodic saved-data report.`]},
  real:[
    {co:'Nathan Marz', tier:'confirmed', text:'Proposed the Lambda architecture (batch + speed + serving layers) in his work on Storm and the book “Big Data” (2015).', src:'Marz & Warren, “Big Data: Principles and best practices of scalable realtime data systems” (2015)'},
    {co:'Jay Kreps', tier:'confirmed', text:'Proposed the Kappa architecture in “Questioning the Lambda Architecture” (2014): reprocess by replaying a log through the stream processor.', src:'O’Reilly Radar (2014)'},
    {co:'Apache Beam', tier:'confirmed', text:'Provides one programming model for batch and streaming with event-time windows, watermarks, triggers and allowed lateness.', src:'Apache Beam documentation'}
  ],
  mistakes:[`Treating a watermark as a promise that no older view will arrive.`, `Keeping too little history for a Kappa replay.`, `Never comparing live and daily video counts.`],
  interview:[`Explain why the two video counts can differ.`, `Choose a late-view correction policy.`],
  tryit:[{quiz:[{q:'What does Kappa need to recalculate an old view count?', options:['Saved events covering that period', 'Only the latest count', 'A bigger web browser', 'No event history'], answer:0, why:'The stream job replays saved events.'}, {q:'What does a watermark mean?', options:['An estimate that earlier events are mostly in', 'A promise no late event can arrive', 'A database password', 'The total number of videos'], answer:0, why:'Late views can still arrive after the estimate.'}]}, {note:'Let view events arrive late, then change the allowed wait and compare the displayed count.', mount:host => windowDemo(host)}],
  sources:[`Marz and Warren (2015)`, `Kreps, Questioning the Lambda Architecture (2014)`, `Akidau et al., The Dataflow Model (2015)`, `Akidau, Chernyak and Lax, Streaming Systems (2018)`]
},
{
  id:'cdc', title:'Change data capture (CDC)', minutes:9, tags:['CDC','Debezium','WAL','binlog','logical replication'],
  summary:'Change data capture, or CDC, reads committed database changes and sends them to other systems. It keeps derived copies updated from one source.',
  problem:`<h3>A small example</h3><p>A creator changes a video title in the app’s database.</p><ul><li>The creator page shows the new title.</li><li>Search still shows the old title.</li><li>A reporting database also needs the change.</li></ul><p>How can both copies learn about every saved update?</p>`,
  intuition:`Imagine the database keeps a notebook of every saved edit. Other desks read the notebook instead of hoping someone remembers to tell them.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one saved title change.</p>',
    steps:[
      {icon:'✍️', title:'Save the title', text:'The video app writes the new title to its main database.'},
      {icon:'📖', title:'Record the change', text:'The database records the committed write in its transaction log, a record of saved changes.'},
      {icon:'📡', title:'Read the log', text:'A CDC connector, such as Debezium, reads that record and publishes a change event.'},
      {icon:'🔎', title:'Update copies', text:'Search updates the title, and the reporting database records the change.'}
    ],
    diagram:{title:'One write, many derived copies', w:780, h:240, alt:'The video app saves a change in Postgres. Debezium reads the log and sends the change to search, cache, and reports.',
      nodes:[{id:'a', type:'service', label:'App', x:70, y:120, w:90}, {id:'db', type:'db', label:'Postgres', sub:'WAL', x:220, y:120, w:120}, {id:'cdc', type:'service', label:'Debezium', x:380, y:120, w:120}, {id:'k', type:'queue', label:'Kafka', x:530, y:120, w:100}, {id:'s', type:'db', label:'Search', x:690, y:45, w:100}, {id:'c', type:'cache', label:'Cache', x:690, y:120, w:100}, {id:'w', type:'db', label:'Warehouse', x:690, y:195, w:110}],
      edges:[{from:'a', to:'db'}, {from:'db', to:'cdc'}, {from:'cdc', to:'k'}, {from:'k', to:'s'}, {from:'k', to:'c'}, {from:'k', to:'w'}],
      steps:[
        {note:'The app saves the new video title in Postgres.', flow:[['a', 'db', 'UPDATE title']], hl:['db']},
        {note:'The CDC connector reads the database log and publishes the title change.', flow:[['db', 'cdc', 'title update'], ['cdc', 'k', 'change']], hl:['cdc']},
        {note:'Search, cache, and reports update from the same change event.', flow:[['k', 's'], ['k', 'c'], ['k', 'w']], parallel:true}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Office notebook', 'Video app'], [['Saved page', 'Committed database write'], ['Notebook reader', 'CDC connector'], ['Other desks', 'Search and reporting copies']])}</div><div class="callout tip"><b>Important point</b><p>CDC starts from a change that the main database has already saved.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Need', 'Action'], [['New search copy', 'Load existing videos, then follow new changes'], ['Stale cache title', 'Clear the old cached title after a change'], ['Stopped connector', 'Watch its lag and restart it']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the app has 20 million videos and the connector reads 5,000 rows a second for the first copy. That takes 20,000,000 ÷ 5,000 = 4,000 seconds, about 67 minutes. During that time, at 50 edits a second, 4,000 × 50 = 200,000 changes pile up. The connector replays them after the copy.</p><p>Say the connector stops for one hour. That leaves 3,600 × 50 = 180,000 changes waiting. If it processes 500 a second, it gains 500 − 50 = 450 a second on new edits. It catches up in 180,000 ÷ 450 = 400 seconds.</p><h4>When it goes wrong</h4><p>Changes can arrive twice after a restart. Apply each one by video ID and keep the newest version, so a repeat does nothing. Use the video ID as the key so one video's changes stay in order, as in the Kafka lesson.</p>`
  },
  tradeoffs:{use:[`Feed the video search copy from saved title changes.`, `Update reports from the same change stream.`], avoid:[`Forgetting changes made outside the video app’s normal request path.`, `Running CDC without watching connector lag.`], alt:[`Run a daily export if search freshness is not needed.`]},
  real:[
    {co:'Debezium', tier:'confirmed', text:'An open-source CDC platform with connectors for PostgreSQL, MySQL, MongoDB, SQL Server and others, typically running on Kafka Connect.', src:'debezium.io documentation'},
    {co:'LinkedIn Databus', tier:'confirmed', text:'LinkedIn’s CDC system captured database changes into a stream to keep caches, search indexes and other derived stores consistent.', src:'Das et al., “All Aboard the Databus!”, SoCC 2012'},
    {co:'Netflix DBLog', tier:'confirmed', text:'A CDC framework that combines full-state capture with log events without stalling log processing.', src:'Andreakis & Papapanagiotou, “DBLog: A Watermark Based Change-Data-Capture Framework” (2020)'}
  ],
  mistakes:[`Starting a search copy with future changes but no existing videos.`, `Leaving a stopped CDC reader unnoticed.`, `Treating raw video table columns as a lasting public API.`],
  interview:[`Explain how one video title change reaches search.`, `Explain why a new copy needs a snapshot first.`],
  tryit:[{quiz:[{q:'Where does CDC read a saved video title edit?', options:['The database transaction log', 'The creator’s browser history', 'The video file bytes', 'A DNS answer'], answer:0, why:'CDC follows committed writes in the database log.'}, {q:'Why does a new search copy need a snapshot?', options:['It needs existing videos before following new changes', 'It removes all events', 'It changes the video format', 'It stops the database'], answer:0, why:'A change stream alone does not contain all current rows.'}]}, {note:'Edit a video title and watch the change reach search and reports. Stop search once, then let it catch up.', mount:(host, api) => cdcDemo(host, api)}],
  sources:[`Debezium documentation`, `Das et al., SoCC 2012`, `Netflix DBLog (2020)`, `Kleppmann, DDIA ch. 11`]
},
{
  id:'workflow-orchestration', title:'Workflow orchestration: Airflow and Temporal', minutes:9, tags:['Airflow','Temporal','DAG','durable execution','orchestration'],
  summary:'Airflow runs scheduled tasks in dependency order. Temporal remembers the progress of a longer workflow so it can continue after a failure.',
  problem:`<h3>A small example</h3><p>The video app has two kinds of multi-step work.</p><ul><li>Each night, it builds a report from views, creators, and payments.</li><li>After upload, it converts a video, checks it, and publishes it.</li><li>A worker may stop during either flow.</li></ul><p>How can each flow continue from the right step?</p>`,
  intuition:`Think of a checklist that records completed steps. The next step starts only when its required earlier steps finish.`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Start with the nightly report, then compare the upload flow.</p>',
    steps:[
      {icon:'🗂️', title:'List dependencies', text:'The report needs view, creator, and payment data before it can combine them.'},
      {icon:'📅', title:'Run the scheduled job', text:'Airflow starts independent extracts together, then runs the combine step when they finish.'},
      {icon:'🔁', title:'Retry a failed task', text:'If one extract fails, the scheduler retries it without pretending later steps are complete.'},
      {icon:'🎞️', title:'Remember upload progress', text:'Temporal gives durable execution. It records each completed video step so a stopped worker can continue conversion, checks, or publishing.'}
    ],
    diagram:{title:'Video report task order', w:780, h:250, alt:'View, creator, and payment extracts run first. The app combines them, then builds reports.',
      nodes:[{id:'e1', type:'service', label:'extract_views', x:100, y:50, w:150}, {id:'e2', type:'service', label:'extract_creators', x:100, y:130, w:150}, {id:'e3', type:'service', label:'extract_payments', x:100, y:210, w:160}, {id:'c', type:'service', label:'clean_views', x:320, y:50, w:140}, {id:'j', type:'service', label:'combine', x:480, y:130, w:100}, {id:'r', type:'service', label:'daily_report', x:660, y:80, w:140}, {id:'m', type:'service', label:'trend_report', x:660, y:190, w:130}],
      edges:[{from:'e1', to:'c'}, {from:'c', to:'j'}, {from:'e2', to:'j'}, {from:'e3', to:'j'}, {from:'j', to:'r'}, {from:'j', to:'m'}],
      steps:[
        {note:'The three data extracts start together.', status:{e1:'hot', e2:'hot', e3:'hot'}},
        {note:'View cleanup starts after the view extract finishes.', status:{e1:'ok', e2:'ok', e3:'ok', c:'hot'}, flow:[['e1', 'c']]},
        {note:'The combine step waits for all three inputs.', status:{c:'ok', j:'hot'}, flow:[['c', 'j'], ['e2', 'j'], ['e3', 'j']], parallel:true},
        {note:'A failed trend report can retry while the daily report remains complete.', status:{j:'ok', r:'ok', m:'down'}, hl:['m']}
      ]},
    html:`<h3>Everyday comparison</h3><div class="simple-table">${h.table(['Checklist', 'Video app'], [['Daily checklist', 'Airflow report tasks'], ['Checklist saved mid-task', 'Temporal upload workflow'], ['Only begin after earlier steps', 'Task dependency']])}</div><div class="callout tip"><b>Important point</b><p>A retry can run a task twice, so each task must be safe to repeat.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Video work', 'Tool style'], [['Nightly creator report', 'Airflow schedule and task graph'], ['Upload, convert, check, publish', 'Temporal durable workflow']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the three nightly extracts take 10, 20 and 15 minutes, and the combine step takes 5. Run one after another, the report needs 10 + 20 + 15 + 5 = 50 minutes. Run together, the extracts take the longest one, 20 minutes, so the report needs 20 + 5 = 25 minutes.</p><p>Say the 15-minute extract fails. Airflow reruns only that task. The other two results are kept.</p><h4>When it goes wrong</h4><p>A rerun must not add the same numbers twice. Tie each run to its report date. Rerunning 20 November then replaces that date's output instead of appending to it.</p><h4>How it works inside</h4><p>Temporal rebuilds a workflow by replaying its saved history. So workflow code cannot use random numbers or read the clock directly. Those would give different answers on replay. It asks Temporal for the time instead.</p>`
  },
  tradeoffs:{use:[`Use Airflow for the video app’s nightly report.`, `Use Temporal when upload steps need to survive worker failures.`], avoid:[`Starting a report join at a guessed time.`, `Publishing a video twice after a retry.`], alt:[`A small app can begin with a database job table for a short upload flow.`]},
  real:[
    {co:'Airbnb → Apache Airflow', tier:'confirmed', text:'Airflow was created at Airbnb in 2014 to author, schedule and monitor data pipelines as DAGs, and became an Apache top-level project.', src:'Apache Airflow documentation and project history'},
    {co:'Uber Cadence to Temporal', tier:'confirmed', text:'Cadence was built at Uber for durable workflows, and Temporal continued the design as an independent open-source project.', src:'Uber Engineering and Temporal documentation'},
    {co:'Netflix Conductor', tier:'confirmed', text:'Netflix open-sourced Conductor, a workflow orchestration engine for microservices.', src:'Netflix Tech Blog (2016)'}
  ],
  mistakes:[`Running the video report join before its inputs finish.`, `Making a retry publish the same video twice.`, `Passing full video files through the scheduler.`],
  interview:[`Explain why the report join waits for all extracts.`, `Explain how an upload continues after a worker stops.`],
  tryit:[{quiz:[{q:'When should the nightly report combine its inputs?', options:['After all required extracts finish', 'At a guessed clock time', 'Before any extract starts', 'Only after a user opens the app'], answer:0, why:'Dependencies decide when a task is ready.'}, {q:'What helps a video upload workflow continue after a worker stops?', options:['Saved workflow progress', 'A browser refresh', 'Deleting every task', 'Skipping failed steps'], answer:0, why:'Temporal records progress for replay and continuation.'}]}, {note:'Run the report task graph with several workers and a failed task.', mount:host => dagDemo(host)}],
  sources:[`Apache Airflow documentation`, `Temporal documentation`, `Netflix Tech Blog, Conductor`]
}
];

SDA.register({
  kind:'module', id:'async', order:7, level:'distributed', icon:'📨', title:'Async & Pipelines',
  summary:'Follow a video from upload to conversion, publishing, follower feeds, and view reports. Learn how queues, event logs, retries, and data pipelines keep those steps moving.',
  outcomes:['Choose a queue, pub/sub, or log for video work', 'Explain Kafka keys, partitions, groups, offsets, and lag', 'Handle broken jobs with limited retries, DLQs, and backpressure', 'Choose feed fan-out and event history patterns', 'Count views with batch or streaming and keep search updated with CDC'],
  lessons,
  quiz:[
    {q:'Each video conversion job should go to one of 20 workers. Best primitive?', options:['Pub/sub topic', 'Work queue with competing consumers', 'Event log with 20 consumer groups', 'A creator feed'], answer:1, why:'Each job goes to one worker.'},
    {q:'A Kafka topic has 4 partitions; a consumer group has 6 consumers. What happens?', options:['All 6 share load evenly', '2 consumers sit idle', 'Kafka creates 2 partitions', 'Messages are duplicated'], answer:1, why:'A partition is consumed by one member per group.'},
    {q:'How do you keep events for one video in Kafka partition order?', options:['Use more partitions', 'Use the video ID as the message key', 'Use random keys', 'Use a DLQ'], answer:1, why:'The same video key selects the same ordered partition.'},
    {q:'A poison message is retried forever. What is the main damage?', options:['Duplicates', 'Head-of-line blocking: everything behind it stalls', 'Data is encrypted', 'Nothing'], answer:1, why:'Partition progress stops; lag grows.'},
    {q:'Which strategy guarantees bounded memory without losing must-keep messages?', options:['Unbounded buffer', 'Bounded buffer with drop', 'Bounded buffer with backpressure (block producers)', 'Bigger RAM'], answer:2, why:'Pressure propagates upstream; nothing is dropped.'},
    {q:'In event sourcing, how do you correct a wrong video status?', options:['Edit the old event', 'Delete the event', 'Append a correcting event', 'Restore a backup'], answer:2, why:'The correction is a new event in the history.'},
    {q:'A creator with 50 million followers publishes. What saves 50 million feed writes?', options:['Copy to every feed', 'Fetch that creator’s recent videos at read time', 'Email everyone', 'Stop all uploads'], answer:1, why:'Read-time fan-out avoids a huge copy job.'},
    {q:'The live view count is lower than the daily report. What may explain it?', options:['Late views arrived after the live window closed', 'Too many creators registered', 'A title was edited', 'The video has a thumbnail'], answer:0, why:'Offline phones can send view events late.'},
    {q:'What does CDC read?', options:['Application logs', 'The database’s replication/transaction log (WAL, binlog)', 'HTTP traffic', 'Cron output'], answer:1, why:'Committed changes in commit order.'},
    {q:'What fits a video upload flow that must resume after a worker stops?', options:['A guessed timer', 'A durable workflow engine like Temporal', 'A browser tab', 'A static report'], answer:1, why:'A durable workflow remembers completed steps.'},
    {type:'scenario', q:'Plan async work for a video upload, publishing notice, follower feeds, and view counts.', answer:'<ol><li>Put conversion jobs in a work queue so one worker handles each job.</li><li>After publishing, send VideoReady to independent feed and notification readers.</li><li>Use video ID as a key when events for that video must stay ordered.</li><li>Retry temporary failures, then park broken jobs in a monitored DLQ.</li><li>Use hybrid fan-out for creators with very large audiences.</li><li>Count views continuously for a live dashboard and from saved events for a daily report.</li></ol>'},
    {type:'scenario', q:'Video conversion lag rises each evening and falls overnight. What do you check?', answer:'<ol><li>Compare arriving jobs per second with completed jobs per second.</li><li>Check queue depth and age of the oldest waiting video.</li><li>Find whether one video key or slow storage is holding workers.</li><li>Add workers if the queue and storage support it, or slow new uploads when full.</li><li>Set an alert before the waiting time becomes unacceptable.</li></ol>'}
  ],
  cheatsheet:[
    {h:'📨 Handoffs', items:['Queue gives each conversion job to one worker', 'Pub/sub sends VideoReady to each subscriber', 'Event log keeps VideoReady for later replay']},
    {h:'🧵 Kafka', items:['A video ID key keeps its events in one partition', 'One group member reads each partition at a time', 'An offset marks a position in a partition', 'Lag shows how far a group is behind']},
    {h:'♻️ Failed jobs', items:['Retry temporary conversion failures after a wait', 'Move a broken job to a monitored DLQ', 'A repeated job must not publish the video twice']},
    {h:'🚰 Flow control', items:['A fixed job queue can fill', 'Backpressure slows or refuses new work', 'Watch the oldest waiting video, not only queue size']},
    {h:'🏛️ App patterns', items:['Event sourcing keeps video status history', 'CQRS builds separate views for reading', 'Hybrid fan-out handles creators with huge audiences', 'CDC carries saved title edits to search']},
    {h:'⚙️ Reports and workflows', items:['Batch counts saved views', 'Streaming updates live counts', 'Late views can correct older time windows', 'Lambda keeps batch and stream counts', 'Kappa replays one stream pipeline', 'Airflow schedules reports', 'Temporal remembers upload progress']}
  ],
  glossary:[
    {term:'Message queue', aka:['queue', 'message queues', 'queues'], def:'A waiting line for messages. A producer adds messages, and consumers each take one to process. Example: video uploads wait in a queue until a worker converts them.'},
    {term:'Pub/sub', aka:['publish-subscribe'], def:'A messaging style where each published message goes to every subscriber. Example: when a video is published, the search service and the notice service both receive it.'},
    {term:'Event stream', aka:['event log', 'commit log', 'event streams'], def:'A saved, ordered list of events that many readers can read at their own pace. Example: every VideoReady event is kept, so a new service can read the history.'},
    {term:'Kafka', aka:['Apache Kafka'], def:'A system that stores events in ordered logs and lets many services read them, even at very high volume. Example: video events flow through Kafka to analytics and notices.'},
    {term:'Topic', aka:['topics'], def:'A named stream of messages. In Kafka it is split into partitions. Example: the topic video-events holds every video event.'},
    {term:'Partition (Kafka)', aka:['partitions'], def:'One ordered part of a topic. Order is kept inside a partition, and partitions let many consumers work in parallel. Example: all events for video 42 go to the same partition.'},
    {term:'Offset', aka:['offsets'], def:'A record’s position number inside a partition. Consumers save their offset to remember where they stopped. Example: a worker that saved offset 120 resumes after the next record when it restarts.'},
    {term:'Consumer group', aka:['consumer groups'], def:'A team of consumers that share a topic’s partitions, so each partition is read by one member of the team. Example: 3 analytics workers split 6 partitions, 2 each.'},
    {term:'Consumer lag', def:'How far a consumer is behind the newest record. Example: the newest offset is 5,000 and the group is at 4,200, so the lag is 800 records.'},
    {term:'Rebalance', aka:['rebalancing'], def:'When consumers join or leave a group, the partitions are handed out again. Example: a worker crashes, so its partitions move to the others.'},
    {term:'Retention', def:'How long a log keeps records before deleting them, by time or size. Example: keep events for 7 days.'},
    {term:'Log compaction', def:'Keeping only the latest record for each key in a log. Example: a log of profile changes keeps only the newest profile for each user.'},
    {term:'Message broker', aka:['broker', 'brokers'], def:'A server that receives messages from producers and delivers them to consumers. Example: RabbitMQ and SQS are message brokers.'},
    {term:'RabbitMQ', def:'A message broker that routes messages through exchanges to queues using rules. Example: a notice about a new video is routed to both the email queue and the push-notification queue.'},
    {term:'Exchange', aka:['exchanges'], def:'The part of RabbitMQ that receives messages and routes them to queues by rules (direct, topic, fanout or headers). Example: a fanout exchange copies a message to every queue attached to it.'},
    {term:'SQS', aka:['Amazon SQS'], def:'Amazon’s managed message queue service. Example: video-convert jobs wait in an SQS queue.'},
    {term:'Visibility timeout', def:'In SQS, how long a received message is hidden from other workers. If the worker does not delete it in time, the message appears again. Example: a 60-second timeout gives a worker one minute to finish.'},
    {term:'Dead-letter queue', aka:['DLQ', 'dead letter queue', 'dead-letter queues'], def:'A separate queue for messages that keep failing, kept so people can inspect and replay them. Example: video #3 fails 5 times, so it is moved to the dead-letter queue.'},
    {term:'Poison message', aka:['poison messages'], def:'A message that fails every time it is processed, such as one with broken data. Example: a malformed upload record that crashes the worker on each retry.'},
    {term:'Backpressure', def:'A way for a slow consumer to tell producers to slow down. Example: when the converter is busy, the upload queue stops accepting new jobs for a moment.'},
    {term:'Load shedding', def:'Rejecting or dropping some work on purpose when overloaded, to protect the rest. Example: refuse low-priority requests so important ones still finish.'},
    {term:'Event-driven architecture', aka:['event-driven'], def:'Services talk by publishing events and reacting to them, instead of calling each other directly. Example: the upload service publishes “video uploaded” and other services react.'},
    {term:'Event sourcing', def:'Saving every change as an event and rebuilding the current state by replaying them. Example: a video’s status is built from uploaded, converted and published events.'},
    {term:'CQRS', def:'Command Query Responsibility Segregation: use one model for writes and a separate one for reads. Example: writes go to the main table, while a separate read view serves the creator screen.'},
    {term:'Projection', aka:['read model', 'projections', 'read view', 'read views'], def:'A view built by reading events, shaped for one kind of query. Example: a table that lists each creator’s videos, built from video events.'},
    {term:'Snapshot', def:'Saved state at one point in an event stream, so rebuilding starts from there and not from the beginning. Example: save the state after every 1,000 events.'},
    {term:'Fan-out on write', aka:['push model'], def:'Copying new content into each follower’s feed when it is created. Example: when a creator posts, the video ID is added to every follower’s feed.'},
    {term:'Fan-out on read', aka:['pull model'], def:'Building a feed when the user opens it, by collecting posts from the people they follow. Example: when you open the app, the server gathers the latest videos from the 200 creators you follow.'},
    {term:'MapReduce', def:'A batch method: map records into key-value pairs, shuffle them by key, then reduce each group. Example: count views per video across billions of log lines.'},
    {term:'Shuffle', def:'Moving data between machines so that records with the same key end up together. Example: all views of video 42 are sent to one machine to be counted.'},
    {term:'Apache Spark', aka:['Spark'], def:'A tool that processes large data sets in parallel, mostly in memory. Example: compute daily watch time for every video.'},
    {term:'Apache Flink', aka:['Flink'], def:'A tool that processes streams with saved state, event time and checkpoints. Example: count views per minute as events arrive.'},
    {term:'Stream processing', aka:['streaming'], def:'Processing data continuously as it arrives, with no end. Example: update view counts every second.'},
    {term:'Batch processing', def:'Processing a fixed set of data in one job, often on a schedule. Example: a nightly job computes yesterday’s revenue.'},
    {term:'Event time', def:'When an event actually happened, not when the system processed it. Example: a view on a phone that was offline counts for the hour it was watched, not the hour it was uploaded.'},
    {term:'Watermark', aka:['watermarks'], def:'A stream processor’s estimate that most events before a certain time have arrived. Later events can still appear. Example: at watermark 10:05, the 10:00 window can close, though a late event may still arrive.'},
    {term:'Tumbling window', aka:['windowing', 'tumbling windows'], def:'Fixed, non-overlapping time buckets for counting. Example: views per minute in the buckets 10:00 to 10:01, 10:01 to 10:02 and so on.'},
    {term:'Lambda architecture', def:'Running a slow, accurate batch layer and a fast, fresh speed layer side by side. Example: an hourly job gives exact totals while a stream gives live counts.'},
    {term:'Kappa architecture', def:'Using one streaming pipeline over a replayable log, and reprocessing by replaying the log. Example: fix a bug, then replay all events to rebuild the results.'},
    {term:'Change data capture', aka:['CDC'], def:'Reading a database’s saved changes and sending them to other systems. Example: when a video title changes, the change is copied to search.'},
    {term:'Debezium', def:'A tool that reads database logs and publishes each change as an event. Example: it turns a title change in Postgres into a message.'},
    {term:'DAG', aka:['directed acyclic graph', 'DAGs'], def:'Directed acyclic graph: a set of tasks with dependencies and no loops. Example: extract views, extract payments, then combine them.'},
    {term:'Apache Airflow', aka:['Airflow'], def:'A tool for scheduling and monitoring jobs that run in dependency order. Example: run the nightly report after all extracts finish.'},
    {term:'Temporal', def:'A platform that records the progress of long workflows, so they continue after a crash. Example: a video conversion resumes after the worker restarts.'},
    {term:'Durable execution', def:'Running workflow code whose progress is saved, so it resumes after a crash. Example: step 3 of 5 finishes, the worker dies, and a new worker continues at step 4.'}
  ],
  sources:['Kreps et al., Kafka (NetDB 2011); Kreps, “The Log” (2013); “Questioning the Lambda Architecture” (2014)', 'Dean & Ghemawat, MapReduce (2004); Zaharia et al., Spark (2012); Akidau et al., Dataflow (2015)', 'Fowler — Event Sourcing, CQRS; Krikorian, “Timelines at Scale” (2013)', 'Debezium, Airflow, Temporal, RabbitMQ, SQS and Kafka documentation']
});
} catch(e){ console.error('[SDA] Module "async" failed to load', e); window.SDA && SDA.errors.push({id:'async', error:e}); }
})();
