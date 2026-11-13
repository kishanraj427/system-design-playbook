
/* =====================================================================
   PART 5 · PLAYGROUNDS (a) — #9 Kafka · #13 Bloom filter
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, sv, esc, clamp, fmtNum} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const {fnv, css, frag} = SDA.ph;

/* ---------------- #9 Kafka ---------------- */
try {
SDA.register({kind:'playground', id:'kafka', module:'async', icon:'🧵', title:'Kafka: partitions, consumer groups, offsets, DLQ',
  summary:'A live partitioned log. Producers write keyed or round-robin records; a consumer group splits partitions; offsets advance; retention deletes old data; compaction keeps the latest per key; poison records go to a DLQ.',
  explain:`<ul><li>Set <b>consumers &gt; partitions</b>: extra consumers sit idle — partitions are the unit of parallelism.</li><li>Raise the producer rate above total consumer capacity: <b>lag</b> grows. With short <b>retention</b>, records are deleted before they’re read — “lost to retention”.</li><li>Switch keys to <b>round-robin</b>: the same order’s events land on different partitions and get processed out of order (violations). With <b>keyed</b> partitioning there are none.</li><li>Add <b>poison</b> records with the DLQ off: a partition gets stuck behind one record. Turn the DLQ on: it’s parked after 3 attempts.</li><li>Turn on <b>compaction</b>: older records for the same key disappear, leaving offset gaps.</li></ul>`,
  real:[{co:'Apache Kafka', tier:'confirmed', text:'Partitions, consumer groups with range/sticky assignment, committed offsets, time/size retention and log compaction are core Kafka concepts.', src:'Apache Kafka documentation'}],
  mount(host, api){
    const P = {parts:3, cons:2, rate:12, crate:6, keyed:true, ret:60, compact:false, poison:0, dlq:true, analytics:true};
    let parts, groups, t, seqOf, stats, rebalUntil, lastComp, lastUI, rr;
    const KEYS = Array.from({length:12}, (_, i) => 'order-' + (100 + i));
    function mkGroup(name, n, rate){ return {name, rate, committed:new Array(P.parts).fill(0), attempts:{}, lastSeq:{}, cons:Array.from({length:n}, (_, i) => ({i, parts:[], busy:0, rr:0}))}; }
    function assign(g){ const n = g.cons.length; g.cons.forEach(c => c.parts = []); const per = Math.floor(P.parts / n), extra = P.parts % n; let p = 0; g.cons.forEach((c, i) => { const k = per + (i < extra ? 1 : 0); for (let j = 0; j < k; j++) c.parts.push(p++); }); }
    function reset(){ parts = Array.from({length:P.parts}, () => ({log:[], start:0, next:0})); groups = [mkGroup('billing', P.cons, P.crate)]; if (P.analytics) groups.push(mkGroup('analytics', 1, 40)); groups.forEach(assign); t = 0; seqOf = {}; stats = {prod:[], cons:[], viol:0, lost:0, dlq:[], compacted:0}; rebalUntil = 0; lastComp = 0; lastUI = -1; rr = 0; }
    function rebalance(){ groups.forEach(g => { while (g.committed.length < P.parts) g.committed.push(0); g.committed.length = P.parts; }); groups[0].cons = Array.from({length:P.cons}, (_, i) => ({i, parts:[], busy:0, rr:0})); groups.forEach(assign); rebalUntil = t + 1; }
    function produce(){ const key = KEYS[Math.floor(Math.random() * KEYS.length)]; const p = P.keyed ? fnv(key) % P.parts : rr++ % P.parts; const pt = parts[p]; seqOf[key] = (seqOf[key] || 0) + 1; pt.log.push({off:pt.next++, key, seq:seqOf[key], t, poison:Math.random() * 100 < P.poison}); stats.prod.push(t); }
    function consume(g, c){
      if (t < c.busy || !c.parts.length) return;
      for (let k = 0; k < c.parts.length; k++){
        const p = c.parts[(c.rr + k) % c.parts.length], pt = parts[p];
        if (g.committed[p] < pt.start){ if (g.name === 'billing') stats.lost += pt.start - g.committed[p]; g.committed[p] = pt.start; }
        if (g.committed[p] >= pt.next) continue;
        let r = pt.log.find(x => x.off >= g.committed[p]); if (!r) continue; g.committed[p] = r.off;
        c.rr = (c.rr + k + 1) % c.parts.length; c.busy = t + 1 / g.rate;
        if (r.poison && g.name === 'billing'){ const a = (g.attempts[r.off + ':' + p] || 0) + 1; g.attempts[r.off + ':' + p] = a; if (P.dlq && a >= 3){ stats.dlq.push(`P${p}@${r.off} ${r.key}`); g.committed[p] = r.off + 1; } return; }
        if (g.name === 'billing'){ if ((g.lastSeq[r.key] || 0) > r.seq) stats.viol++; g.lastSeq[r.key] = Math.max(g.lastSeq[r.key] || 0, r.seq); stats.cons.push(t); }
        g.committed[p] = r.off + 1; return;
      }
    }
    function housekeeping(){
      if (P.ret) parts.forEach(pt => { while (pt.log.length && pt.log[0].t < t - P.ret) pt.log.shift(); pt.start = pt.log.length ? pt.log[0].off : pt.next; });
      if (P.compact && t - lastComp > 3){ lastComp = t; parts.forEach(pt => { const cutoff = t - 5, latest = {}; pt.log.forEach(r => { if (r.t < cutoff) latest[r.key] = r.off; }); const before = pt.log.length; pt.log = pt.log.filter(r => r.t >= cutoff || latest[r.key] === r.off); stats.compacted += before - pt.log.length; pt.start = pt.log.length ? pt.log[0].off : pt.next; }); }
    }
    let acc = 0;
    const lp = api.loop(dt => {
      dt = Math.min(dt, .1); t += dt; acc += dt * P.rate; while (acc >= 1){ acc--; produce(); }
      if (t >= rebalUntil) groups.forEach(g => g.cons.forEach(c => consume(g, c)));
      housekeeping();
      if (t - lastUI > .3){ lastUI = t; render(); }
    });
    const met = ui.metrics(null, [{id:'prod', label:'Produced', unit:'/s', instant:true}, {id:'cons', label:'Billing consumed', unit:'/s', instant:true}, {id:'lag', label:'Billing lag', instant:true, warn:20, bad:80}, {id:'viol', label:'Ordering violations', instant:true, bad:1}, {id:'lost', label:'Lost to retention', instant:true, bad:1}, {id:'dlq', label:'In DLQ', instant:true, warn:1}, {id:'idle', label:'Idle consumers', instant:true, warn:1}]);
    const view = el('div', {class:'stack', style:{gap:'8px'}}); const banner = el('div');
    function render(){
      stats.prod = stats.prod.filter(x => x > t - 3); stats.cons = stats.cons.filter(x => x > t - 3);
      const g = groups[0]; const lag = parts.reduce((s, pt, p) => s + Math.max(0, pt.next - Math.max(g.committed[p], pt.start)), 0);
      met.set('prod', stats.prod.length / 3); met.set('cons', stats.cons.length / 3); met.set('lag', lag); met.set('viol', stats.viol); met.set('lost', stats.lost); met.set('dlq', stats.dlq.length); met.set('idle', g.cons.filter(c => !c.parts.length).length);
      banner.innerHTML = ''; if (t < rebalUntil) banner.append(el('div', {class:'verdict warn'}, '⏳ Rebalancing: partitions are being reassigned; consumption is paused.'));
      view.innerHTML = '';
      parts.forEach((pt, p) => {
        const owner = g.cons.find(c => c.parts.includes(p)); const shown = pt.log.slice(-28); const cm = g.committed[p], an = groups[1] ? groups[1].committed[p] : null;
        const stuck = pt.log.find(r => r.off === cm && r.poison && !P.dlq);
        view.append(el('div', {class:'card', style:{padding:'10px 12px'}},
          el('div', {class:'row', style:{justifyContent:'space-between', marginBottom:'6px'}}, el('b', null, `Partition ${p}`), el('span', {class:'lab-hint'}, `offsets ${pt.start}…${pt.next - 1} · billing @${Math.max(cm, pt.start)} → ${owner ? 'consumer #' + (owner.i + 1) : 'unassigned'} · lag ${Math.max(0, pt.next - Math.max(cm, pt.start))}${an != null ? ` · analytics @${an}` : ''}`), stuck ? el('span', {class:'chip', style:{color:'var(--bad)'}}, '☠ stuck on poison record') : null),
          el('div', {style:{display:'flex', gap:'3px', flexWrap:'nowrap', overflowX:'auto'}}, ...shown.map(r => el('span', {title:`offset ${r.off} · ${r.key} #${r.seq}${r.poison ? ' · POISON' : ''}`, style:{minWidth:'30px', padding:'4px 0', textAlign:'center', borderRadius:'5px', font:'600 10px var(--font-mono)', background:`hsl(${fnv(r.key) % 360} 60% ${r.off < cm ? 35 : 55}% / ${r.off < cm ? .35 : .9})`, color:'#fff', outline:r.off === cm ? '2px solid var(--text)' : r.poison ? '2px solid var(--bad)' : 'none', outlineOffset:'-2px'}}, String(r.off))))));
      });
      view.querySelectorAll('.card > div:last-child').forEach(r => { r.scrollLeft = r.scrollWidth; });
      if (stats.dlq.length) view.append(el('div', {class:'lab-hint'}, 'DLQ: ' + stats.dlq.slice(-8).join(', ')));
    }
    const S = (k, o, after) => ui.slider(Object.assign({value:P[k], onInput:v => { P[k] = v; if (after) after(); }}, o)).el;
    host.append(el('div', {class:'ctl-grid'},
      S('parts', {label:'Partitions', min:1, max:6, step:1, fmt:v => v}, () => { while (parts.length < P.parts) parts.push({log:[], start:0, next:0}); parts.length = P.parts; rebalance(); }),
      S('cons', {label:'Consumers in group “billing”', min:1, max:8, step:1, fmt:v => v}, rebalance),
      S('rate', {label:'Producer rate', min:1, max:60, step:1, fmt:v => v + ' msg/s'}),
      S('crate', {label:'Per-consumer capacity', min:1, max:30, step:1, fmt:v => v + ' msg/s'}, () => { groups[0].rate = P.crate; }),
      S('ret', {label:'Retention (0 = forever)', min:0, max:120, step:5, fmt:v => v ? v + ' s' : 'forever'}),
      S('poison', {label:'Poison records', min:0, max:10, step:.5, fmt:v => v + '%'})),
      el('div', {class:'row', style:{gap:'16px', margin:'10px 0'}}, ui.toggle({label:'Key by order ID (vs round-robin)', checked:true, onChange:v => P.keyed = v}).el, ui.toggle({label:'Dead-letter queue after 3 attempts', checked:true, onChange:v => P.dlq = v}).el, ui.toggle({label:'Log compaction', checked:false, onChange:v => P.compact = v}).el, ui.button('↺ Reset', () => { reset(); render(); }, 'sm ghost')),
      met.el, banner, el('div', {style:{height:'8px'}}), view, el('p', {class:'lab-hint'}, 'Each box is a record (number = offset; colour = key). The outlined box is billing’s next offset; faded boxes are already consumed. A second, independent group “analytics” reads the same partitions at its own pace.'));
    reset(); render(); lp.resume();
  }
});
} catch(e){ console.error('[SDA] playground kafka', e); SDA.errors.push({id:'kafka', error:e}); }

/* ---------------- #13 Bloom filter ---------------- */
try {
SDA.register({kind:'playground', id:'bloom', module:'search', icon:'🌸', title:'Bloom filter: insert, query, measure false positives',
  summary:'A real Bloom filter with m bits and k hash functions. Insert words, query others, then measure the false-positive rate against the formula (1 − e^(−kn/m))^k.',
  explain:`<ul><li>Insert a word: k bits light up. Query a word you never inserted: if any of its bits is 0 → <b>definitely not present</b>.</li><li>Press <b>Insert 100 random</b> a few times: the array fills and the measured false-positive rate climbs, tracking the formula.</li><li>Change <b>k</b>: too few hashes and too many both hurt; the optimum is ≈ (m/n)·ln 2.</li><li>There are never false negatives — every inserted word always tests positive.</li></ul>`,
  real:[{co:'Bigtable · Cassandra · RocksDB · Akamai', tier:'confirmed', text:'LSM engines keep a Bloom filter per SSTable to skip disk reads; Akamai used Bloom filters to avoid caching one-hit-wonder objects.', src:'Chang et al. (2006); Maggs & Sitaraman (2015)'}],
  mount(host){
    let m = 256, k = 3, bits, items, lastIdx = [], lastMsg = '', measured = null;
    const hashes = w => { const h1 = fnv(w), h2 = fnv(w + '#salt') | 1; return Array.from({length:k}, (_, i) => ((h1 + Math.imul(i, h2)) >>> 0) % m); };
    const reset = () => { bits = new Uint8Array(m); items = new Set(); lastIdx = []; measured = null; lastMsg = 'Empty filter. Insert some words.'; render(); };
    const insert = w => { w = w.trim().toLowerCase(); if (!w) return; hashes(w).forEach(i => bits[i] = 1); items.add(w); };
    const has = w => hashes(w).every(i => bits[i]);
    const rnd = () => Math.random().toString(36).slice(2, 9);
    const grid = el('div', {style:{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(14px,1fr))', gap:'2px', margin:'10px 0'}, role:'img', 'aria-label':'Bit array'}); const msg = el('div', {role:'status'});
    const met = ui.metrics(null, [{id:'n', label:'Items inserted', instant:true}, {id:'fill', label:'Bits set', unit:'%', max:100, instant:true, warn:50, bad:75}, {id:'th', label:'Theoretical FP rate', unit:'%', instant:true, fmt:v => v.toFixed(2)}, {id:'ms', label:'Measured FP (5,000 tests)', instant:true}, {id:'ok', label:'Optimal k for this n', instant:true}, {id:'bpi', label:'Bits per item', instant:true, fmt:v => v.toFixed(1)}]);
    function render(){
      const n = items.size, set = bits.reduce((a, b) => a + b, 0);
      grid.innerHTML = ''; const show = Math.min(m, 1024);
      for (let i = 0; i < show; i++) grid.append(el('span', {style:{height:'14px', borderRadius:'3px', background:lastIdx.includes(i) ? 'var(--accent1)' : bits[i] ? 'var(--accent2)' : 'var(--surface-3)', boxShadow:lastIdx.includes(i) ? '0 0 0 2px var(--text)' : 'none'}, title:`bit ${i}: ${bits[i]}`}));
      met.set('n', n); met.set('fill', set / m * 100); met.set('th', n ? Math.pow(1 - Math.exp(-k * n / m), k) * 100 : 0); met.set('ms', measured == null ? '—' : measured.toFixed(2) + '%'); met.set('ok', n ? Math.max(1, Math.round(m / n * Math.LN2)) : '—'); met.set('bpi', n ? m / n : 0);
      msg.innerHTML = ''; msg.append(el('div', {class:'verdict ' + (lastMsg.startsWith('✗') ? 'ok' : lastMsg.startsWith('⚠') ? 'bad' : 'warn')}, lastMsg));
      if (m > 1024) grid.append(el('span', {class:'lab-hint', style:{gridColumn:'1/-1'}}, `Showing the first 1,024 of ${m} bits.`));
    }
    const wIn = el('input', {class:'input', value:'biryani', 'aria-label':'Word'});
    const doInsert = () => { const w = wIn.value.trim().toLowerCase(); if (!w) return; lastIdx = hashes(w); insert(w); lastMsg = `Inserted “${w}”: set bits ${lastIdx.join(', ')}.`; render(); };
    const doQuery = () => { const w = wIn.value.trim().toLowerCase(); if (!w) return; lastIdx = hashes(w); const p = has(w); const real = items.has(w); lastMsg = !p ? `✗ “${w}” is DEFINITELY NOT in the set — bit ${lastIdx.find(i => !bits[i])} is 0.` : real ? `“${w}” is probably in the set — and it really is (bits ${lastIdx.join(', ')} all 1).` : `⚠ FALSE POSITIVE: “${w}” was never inserted, but bits ${lastIdx.join(', ')} were all set by other words.`; render(); };
    host.append(el('div', {class:'ctl-grid'}, ui.slider({label:'Bits m', min:32, max:4096, step:32, value:256, fmt:v => v, onInput:v => { m = v; reset(); }}).el, ui.slider({label:'Hash functions k', min:1, max:10, step:1, value:3, fmt:v => v, onInput:v => { k = v; reset(); }}).el),
      el('div', {class:'row', style:{margin:'10px 0'}}, wIn, ui.button('➕ Insert', doInsert, 'sm primary'), ui.button('🔎 Query', doQuery, 'sm'), ui.button('➕ Insert 100 random words', () => { for (let i = 0; i < 100; i++) insert(rnd()); lastIdx = []; lastMsg = `Inserted 100 random words (n = ${items.size}).`; render(); }, 'sm'), ui.button('🧪 Test 5,000 non-members', () => { let fp = 0; for (let i = 0; i < 5000; i++){ const w = 'zz' + rnd(); if (!items.has(w) && has(w)) fp++; } measured = fp / 50; lastIdx = []; lastMsg = `${fp} of 5,000 never-inserted words tested positive (${measured.toFixed(2)}%). Compare with the formula.`; render(); }, 'sm'), ui.button('↺ Reset', reset, 'sm ghost')),
      msg, grid, met.el);
    reset(); ['biryani', 'dosa', 'paneer'].forEach(insert); lastMsg = 'Pre-loaded: biryani, dosa, paneer. Try querying “idli” or “pizza”.'; render();
  }
});
} catch(e){ console.error('[SDA] playground bloom', e); SDA.errors.push({id:'bloom', error:e}); }
})();
