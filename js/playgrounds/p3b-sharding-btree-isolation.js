
/* =====================================================================
   PART 3 · PLAYGROUNDS (b) — #6 sharding · #25 B-tree vs LSM · #26 isolation anomalies
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, sv, esc, clamp, fmtNum} = SDA.u; const ui = SDA.ui; const h = SDA.h;
const {fnv, color, css, frag} = SDA.ph;

/* ---------------- #6 Sharding visualizer ---------------- */
try {
SDA.register({kind:'playground', id:'sharding', module:'databases', icon:'🧩', title:'Sharding visualizer',
  summary:'Spread thousands of users across shards by hash, range, consistent hashing or a directory. Add shards, grow the user base and add a celebrity to see balance and data movement.',
  explain:`<h3>How to use it</h3><ol><li>Choose <b>Range</b> and the “new users are hot” workload, then press <b>Grow</b>. Every new user lands on the last shard.</li><li>Choose <b>Hash mod N</b> and add a shard. Most users move. Then try <b>Consistent hashing</b>.</li><li>Switch to the <b>celebrity</b> workload and compare all four strategies.</li></ol><h3>What to notice</h3><ul><li>Hash mod N moves most users when N changes. Consistent hashing moves about 1 in N.</li><li>One celebrity makes one shard hot under every strategy. Re-sharding cannot fix a hot key.</li></ul><div class="callout tip"><b>Important point</b><p>The shard key decides everything. It sets what stays balanced, what moves, and which queries must visit many shards.</p></div><p class="lab-hint">Each square is a user, ordered by ID and coloured by shard. Outlined squares moved in the last change.</p>`,
  real:[{co:'Instagram · Notion · Vitess', tier:'confirmed', text:'Production systems shard by user or workspace ID using many logical shards on fewer hosts, so rebalancing moves whole logical shards.', src:'Instagram (2012), Notion (2021), Vitess documentation'}],
  mount(host, api){
    const P = {strat:'hash', n:4, wl:'uniform', users:2000};
    const RANGE_MAX = 2000; let dir = new Map(), assign = [], moved = new Set(), info = '';
    const ring = () => { const r = []; for (let s = 0; s < P.n; s++) for (let v = 0; v < 64; v++) r.push([fnv('shard-' + s + '#' + v), s]); return r.sort((a, b) => a[0] - b[0]); };
    let R = ring();
    const shardOf = id => {
      if (P.strat === 'hash') return fnv('u' + id) % P.n;
      if (P.strat === 'range') return Math.min(P.n - 1, Math.floor((id - 1) / Math.ceil(RANGE_MAX / P.n)));
      if (P.strat === 'consistent'){ const hv = fnv('u' + id); let lo = 0, hi = R.length; while (lo < hi){ const m = (lo + hi) >> 1; if (R[m][0] < hv) lo = m + 1; else hi = m; } return R[lo % R.length][1]; }
      return dir.get(id);
    };
    const weight = id => P.wl === 'celebrity' ? (id === 7 ? P.users * .33 : 1) : P.wl === 'recent' ? Math.exp((id - P.users) / 300) : 1;
    function dirInit(){ dir = new Map(); for (let id = 1; id <= P.users; id++) dir.set(id, fnv('u' + id) % P.n); }
    function dirLeast(){ const c = new Array(P.n).fill(0); dir.forEach(s => c[s]++); return c.indexOf(Math.min(...c)); }
    function reassign(){ const prev = assign; assign = []; for (let id = 1; id <= P.users; id++){ if (P.strat === 'directory' && !dir.has(id)) dir.set(id, dirLeast()); assign[id] = shardOf(id); } moved = new Set(); if (prev.length) for (let id = 1; id < prev.length; id++) if (prev[id] != null && prev[id] !== assign[id]) moved.add(id); }
    function changeShards(delta){
      const old = P.n; const nn = clamp(old + delta, 2, 10); if (nn === old) return;
      if (P.strat === 'directory'){
        if (nn > old){ P.n = nn; const target = Math.floor(P.users / nn); const counts = new Array(nn).fill(0); dir.forEach(s => counts[s]++); for (const [id, s] of dir){ if (counts[nn - 1] >= target) break; if (counts[s] > target){ dir.set(id, nn - 1); counts[s]--; counts[nn - 1]++; } } }
        else { const gone = old - 1; P.n = nn; for (const [id, s] of dir) if (s === gone) dir.set(id, dirLeast()); }
      } else P.n = nn;
      R = ring(); reassign(); info = `${moved.size} of ${P.users} users (${Math.round(moved.size / P.users * 100)}%) moved when going from ${old} to ${nn} shards.`; draw();
    }
    const cv = el('canvas', {height:680, style:{height:'340px'}, 'aria-label':'Users as squares coloured by shard'}); const box = el('div', {class:'chart-box'}, cv);
    const side = el('div', {class:'stack'});
    function draw(){
      const W = box.clientWidth || 600, H = 340; cv.width = W * 2; const g = cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, W, H);
      const cols = 80, sz = Math.min((W - 10) / cols, (H - 10) / Math.ceil(P.users / cols));
      for (let id = 1; id <= P.users; id++){ const i = id - 1, x = 5 + (i % cols) * sz, y = 5 + Math.floor(i / cols) * sz; g.fillStyle = color(assign[id]); g.fillRect(x, y, sz - 1, sz - 1); if (moved.has(id)){ g.strokeStyle = css('--text'); g.lineWidth = 1; g.strokeRect(x + .5, y + .5, sz - 2, sz - 2); } }
      const data = new Array(P.n).fill(0), load = new Array(P.n).fill(0); let tw = 0;
      for (let id = 1; id <= P.users; id++){ data[assign[id]]++; const w = weight(id); load[assign[id]] += w; tw += w; }
      const avg = tw / P.n, hot = Math.max(...load) / avg;
      const rangeShards = new Set(); for (let id = 100; id < 200; id++) rangeShards.add(assign[id]);
      side.innerHTML = '';
      side.append(el('b', null, 'Per shard: users · traffic share'));
      for (let s = 0; s < P.n; s++) side.append(el('div', {class:'wf-row', style:{gridTemplateColumns:'64px 1fr 110px'}}, el('b', {style:{color:color(s)}}, 'Shard ' + (s + 1)), el('div', {class:'wf-track', style:{height:'16px'}}, el('div', {class:'wf-bar', style:{left:'0', width:Math.min(100, load[s] / tw * 100 * P.n / 2) + '%', background:load[s] > avg * 1.5 ? 'var(--bad)' : color(s)}})), el('span', {class:'wt'}, `${data[s]} · ${Math.round(load[s] / tw * 100)}%`)));
      side.append(el('div', {class:'verdict ' + (hot > 1.5 ? 'bad' : hot > 1.2 ? 'warn' : 'ok')}, `Hottest shard carries ${hot.toFixed(2)}× the average load${hot > 1.5 ? ', so this is a hot shard.' : '.'}`));
      side.append(el('div', {class:'verdict ok', style:{fontWeight:'500'}}, `“Get user 42” → 1 shard. “Users 100–199” (range scan) → ${rangeShards.size} shard${rangeShards.size > 1 ? 's' : ''}${rangeShards.size === P.n && P.n > 2 ? ' (scatter-gather)' : ''}.`));
      if (info) side.append(el('div', {class:'verdict warn', style:{fontWeight:'500'}}, info));
    }
    host.append(el('div', {class:'ctl-grid'},
      ui.select({label:'Strategy', value:'hash', options:[['hash', 'Hash mod N'], ['range', 'Range by user ID'], ['consistent', 'Consistent hashing (64 vnodes)'], ['directory', 'Directory (lookup table)']], onChange:v => { P.strat = v; if (v === 'directory') dirInit(); R = ring(); assign = []; reassign(); info = ''; draw(); }}).el,
      ui.select({label:'Workload', value:'uniform', options:[['uniform', 'Uniform traffic'], ['celebrity', 'One celebrity user (#7) = 25% of traffic'], ['recent', 'New users are hot']], onChange:v => { P.wl = v; draw(); }}).el),
      el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('➕ Add shard', () => changeShards(1), 'sm primary'), ui.button('➖ Remove shard', () => changeShards(-1), 'sm'), ui.button('📈 Grow: +500 new users', () => { if (P.users >= 4000) return; P.users += 500; reassign(); moved = new Set(); info = `500 new users (IDs ${P.users - 499}–${P.users}) arrived.`; draw(); }, 'sm'), ui.button('↺ Reset', () => { P.users = 2000; P.n = 4; R = ring(); dirInit(); assign = []; reassign(); info = ''; draw(); }, 'sm ghost')),
      el('div', {class:'grid c2', style:{alignItems:'start'}}, box, side));
    dirInit(); reassign(); draw();
    if ('ResizeObserver' in window){ const ro = new ResizeObserver(SDA.u.debounce(draw, 100)); ro.observe(box); api.onDispose(() => ro.disconnect()); }
  }
});
} catch(e){ console.error('[SDA] playground sharding', e); SDA.errors.push({id:'sharding', error:e}); }

/* ---------------- #25 B-tree vs LSM-tree ---------------- */
try {
SDA.register({kind:'playground', id:'btree-lsm', module:'databases', icon:'🌳', title:'B-tree vs LSM-tree, side by side',
  summary:'Add the same keys to a B-tree and an LSM-tree side by side. Compare writes, splits, flushes, compaction and how each one reads a key.',
  explain:`<h3>How to use it</h3><ol><li>Insert several keys. The B-tree changes pages in place and splits full pages. The LSM-tree only adds to a small in-memory table and flushes it to a file now and then.</li><li>Keep inserting until the LSM-tree has 3 level-0 files. Watch it merge them (compaction).</li><li>Read a key. Compare the pages the B-tree touches with the files the LSM-tree checks.</li></ol><h3>What to notice</h3><ul><li>Compaction rewrites data. That is the LSM-tree’s extra write cost.</li><li>Bloom filters let the LSM-tree skip most files when it reads.</li></ul><div class="callout tip"><b>Important point</b><p>A B-tree favours reads and an LSM-tree favours writes. The other side pays in extra work later.</p></div>`,
  real:[{co:'PostgreSQL/InnoDB vs RocksDB/Cassandra', tier:'confirmed', text:'Mainstream relational engines use B-tree-family structures; RocksDB, LevelDB, Cassandra and Bigtable use LSM designs with Bloom filters and compaction.', src:'Engine documentation; Bigtable (OSDI 2006)'}],
  mount(host, api){
    let root, bw, bsplits, mem, L0, L1, lw, inserts, flushes, compactions, nextSeq, log;
    const bloomBits = k => [0, 1, 2].map(s => fnv(k + ':' + s) % 64);
    const mkTable = entries => { const b = new Uint8Array(64); entries.forEach(([k]) => bloomBits(String(k)).forEach(i => b[i] = 1)); return {e:entries, b, min:entries[0][0], max:entries[entries.length - 1][0], fresh:true}; };
    const bloomHas = (t, k) => bloomBits(String(k)).every(i => t.b[i]);
    function reset(){ root = {keys:[], kids:[]}; bw = 0; bsplits = 0; mem = new Map(); L0 = []; L1 = []; lw = 0; inserts = 0; flushes = 0; compactions = 0; nextSeq = 1; log = []; render(); }
    function btFind(n, k){ let i = 0; while (i < n.keys.length && k > n.keys[i]) i++; if (i < n.keys.length && n.keys[i] === k) return true; return n.kids.length ? btFind(n.kids[i], k) : false; }
    function split(x, i){ const y = x.kids[i]; const z = {keys:y.keys.slice(2), kids:y.kids.slice(2)}; const mid = y.keys[1]; y.keys = y.keys.slice(0, 1); y.kids = y.kids.slice(0, 2); x.kids.splice(i + 1, 0, z); x.keys.splice(i, 0, mid); bw += 3; bsplits++; }
    function insNF(x, k){ if (!x.kids.length){ let i = 0; while (i < x.keys.length && x.keys[i] < k) i++; x.keys.splice(i, 0, k); bw++; return; } let i = 0; while (i < x.keys.length && k > x.keys[i]) i++; if (x.kids[i].keys.length === 3){ split(x, i); if (k > x.keys[i]) i++; } insNF(x.kids[i], k); }
    function btInsert(k){ if (btFind(root, k)){ bw++; return; } if (root.keys.length === 3){ const s = {keys:[], kids:[root]}; root = s; split(s, 0); } insNF(root, k); }
    function lsmInsert(k){ mem.set(k, nextSeq++); if (mem.size >= 4){ const entries = [...mem.entries()].sort((a, b) => a[0] - b[0]); L0.unshift(mkTable(entries)); lw += entries.length; flushes++; mem = new Map(); log.unshift(`Flush: memtable → new L0 SSTable [${entries.map(e => e[0]).join(', ')}]`); if (L0.length >= 3) compact(); } }
    function compact(){ const merged = new Map(); L1.forEach(t => t.e.forEach(([k, v]) => merged.set(k, v))); [...L0].reverse().forEach(t => t.e.forEach(([k, v]) => merged.set(k, v))); const all = [...merged.entries()].sort((a, b) => a[0] - b[0]); L1 = []; for (let i = 0; i < all.length; i += 6) L1.push(mkTable(all.slice(i, i + 6))); lw += all.length; compactions++; const was = L0.reduce((s, t) => s + t.e.length, 0); L0 = []; log.unshift(`Compaction: merged 3 L0 tables (${was} entries) with L1 → rewrote ${all.length} entries into ${L1.length} L1 tables`); }
    function insert(k){ inserts++; btInsert(k); lsmInsert(k); }
    function read(k){
      const steps = []; let n = root, pages = 0;
      while (n){ pages++; let i = 0; while (i < n.keys.length && k > n.keys[i]) i++; if (n.keys[i] === k){ steps.push(`page [${n.keys.join(' ')}] → found`); break; } steps.push(`page [${n.keys.join(' ')}] → ${n.kids.length ? 'go to child ' + (i + 1) : 'not found'}`); n = n.kids[i]; }
      const ls = []; let reads = 0, found = false;
      if (mem.has(k)){ ls.push('memtable → found'); found = true; } else ls.push('memtable → miss');
      if (!found) for (const t of L0){ if (!bloomHas(t, k)){ ls.push(`L0 [${t.min}…${t.max}] → Bloom says no, skipped`); continue; } reads++; if (t.e.some(e => e[0] === k)){ ls.push(`L0 [${t.min}…${t.max}] → read → found`); found = true; break; } ls.push(`L0 [${t.min}…${t.max}] → Bloom false positive, read → miss`); }
      if (!found){ const t = L1.find(t => k >= t.min && k <= t.max); if (!t) ls.push('L1 → no table covers this key'); else if (!bloomHas(t, k)) ls.push(`L1 [${t.min}…${t.max}] → Bloom says no`); else { reads++; const f = t.e.some(e => e[0] === k); ls.push(`L1 [${t.min}…${t.max}] → read → ${f ? 'found' : 'miss'}`); } }
      readOut.innerHTML = '';
      readOut.append(el('div', {class:'grid c2'}, el('div', {class:'card'}, el('b', null, `B-tree read: ${pages} page(s)`), el('ol', {class:'prose', style:{fontSize:'13px', margin:'6px 0 0'}, html:steps.map(s => `<li>${esc(s)}</li>`).join('')})), el('div', {class:'card'}, el('b', null, `LSM read: ${reads} SSTable read(s)`), el('ol', {class:'prose', style:{fontSize:'13px', margin:'6px 0 0'}, html:ls.map(s => `<li>${esc(s)}</li>`).join('')}))));
    }
    const btBox = el('div', {class:'chart-box', style:{minHeight:'120px', padding:'8px'}}), lsmBox = el('div', {class:'stack', style:{gap:'8px'}});
    const met = ui.metrics(null, [{id:'bw', label:'B-tree page writes', instant:true}, {id:'bs', label:'B-tree splits · height', instant:true}, {id:'lw', label:'LSM entries written to disk', instant:true}, {id:'wa', label:'LSM write amplification', instant:true, fmt:v => v.toFixed(2) + '×'}, {id:'fc', label:'Flushes · compactions', instant:true}]);
    const readOut = el('div', {style:{marginTop:'10px'}}); const logBox = el('div', {class:'lab-out', style:{maxHeight:'120px', borderRadius:'10px', border:'1px solid var(--border)'}});
    function height(n){ return n.kids.length ? 1 + height(n.kids[0]) : 1; }
    function drawBT(){
      btBox.innerHTML = '';
      if (!root.keys.length){ btBox.append(el('div', {class:'muted', style:{padding:'20px', textAlign:'center'}}, 'Empty B-tree')); return; }
      const levels = []; const lay = (n, d) => { (levels[d] = levels[d] || []).push(n); n.kids.forEach(c => lay(c, d + 1)); }; lay(root, 0);
      const NW = k => k.length * 28 + 12, GAP = 10; let x = 0; const pos = new Map();
      levels[levels.length - 1].forEach(n => { pos.set(n, x + NW(n.keys) / 2); x += NW(n.keys) + GAP; });
      for (let d = levels.length - 2; d >= 0; d--) levels[d].forEach(n => pos.set(n, (pos.get(n.kids[0]) + pos.get(n.kids[n.kids.length - 1])) / 2));
      const W = Math.max(200, x), H = levels.length * 62 + 10;
      const s = sv('svg', {viewBox:`0 0 ${W} ${H}`, role:'img'}); const t = sv('title'); t.textContent = 'B-tree pages by level'; s.append(t);
      levels.forEach((lv, d) => lv.forEach(n => { const cx = pos.get(n), y = 10 + d * 62; n.kids.forEach(c => { const l = sv('line', {x1:cx, y1:y + 30, x2:pos.get(c), y2:y + 62}); l.style.stroke = css('--edge'); l.style.strokeWidth = '1.5'; s.append(l); }); const w = NW(n.keys); const r = sv('rect', {x:cx - w / 2, y, width:w, height:30, rx:6}); r.style.fill = css('--node-bg'); r.style.stroke = css('--c-db'); r.style.strokeWidth = '1.6'; s.append(r); n.keys.forEach((k, i) => { const tx = sv('text', {x:cx - w / 2 + 6 + i * 28 + 14, y:y + 20, 'text-anchor':'middle'}); tx.style.fill = css('--text'); tx.style.font = '600 12px var(--font-mono)'; tx.textContent = k; s.append(tx); }); }));
      s.style.width = '100%'; s.style.maxHeight = '300px'; btBox.append(s);
    }
    function drawLSM(){
      lsmBox.innerHTML = '';
      const row = (label, tables, cls) => el('div', null, el('div', {class:'lab-hint', style:{fontWeight:'700'}}, label), el('div', {class:'pill-row'}, ...(tables.length ? tables : [el('span', {class:'muted', style:{fontSize:'13px'}}, 'empty')])));
      const tbl = (t, tag) => el('span', {class:'chip mono', style:{borderColor:'var(--c-db)'}, title:'Bloom bits set: ' + t.b.reduce((a, b) => a + b, 0) + '/64'}, `${tag}[${t.e.map(e => e[0]).join(' ')}]`);
      lsmBox.append(row('Memtable (RAM, sorted on flush), capacity 4', [...mem.keys()].sort((a, b) => a - b).map(k => el('span', {class:'chip mono', style:{borderColor:'var(--c-cache)'}}, String(k)))));
      lsmBox.append(row('L0 SSTables (newest first), compact at 3', L0.map(t => tbl(t, ''))));
      lsmBox.append(row('L1 SSTables (one sorted run, ≤ 6 keys each)', L1.map(t => tbl(t, ''))));
    }
    function render(){ drawBT(); drawLSM(); met.set('bw', bw); met.set('bs', `${bsplits} · ${root.keys.length ? height(root) : 0}`); met.set('lw', lw); met.set('wa', inserts ? lw / inserts : 0); met.set('fc', `${flushes} · ${compactions}`); logBox.innerHTML = ''; log.slice(0, 12).forEach(l => logBox.append(el('div', {class:'ln'}, l))); }
    let seqKey = 100;
    const keyIn = el('input', {class:'input', type:'number', min:'1', max:'999', value:'42', 'aria-label':'Key', style:{width:'110px'}});
    const allKeys = () => { const s = new Set(); const walk = n => { n.keys.forEach(k => s.add(k)); n.kids.forEach(walk); }; walk(root); return [...s]; };
    host.append(el('div', {class:'controls'}, ui.button('➕ Insert random', () => { insert(1 + Math.floor(Math.random() * 999)); render(); }, 'sm primary'), ui.button('➕ 10 random', () => { for (let i = 0; i < 10; i++) insert(1 + Math.floor(Math.random() * 999)); render(); }, 'sm'), ui.button('➕ 10 sequential', () => { for (let i = 0; i < 10; i++) insert(seqKey++); render(); }, 'sm'), ui.button('✏️ Update an existing key', () => { const ks = allKeys(); if (ks.length){ const k = ks[Math.floor(Math.random() * ks.length)]; insert(k); log.unshift(`Update key ${k}: B-tree rewrote 1 page in place; LSM appended a new version`); render(); } }, 'sm'), ui.button('↺ Reset', () => { seqKey = 100; reset(); readOut.innerHTML = ''; }, 'sm ghost')),
      el('div', {class:'row', style:{margin:'10px 0'}}, keyIn, ui.button('➕ Insert this key', () => { insert(clamp(+keyIn.value || 1, 1, 999)); render(); }, 'sm'), ui.button('🔎 Read this key', () => read(+keyIn.value), 'sm')),
      met.el, el('div', {class:'grid c2', style:{marginTop:'12px', alignItems:'start'}}, el('div', null, el('h4', {style:{margin:'0 0 6px'}}, '🌳 B-tree (in-place pages)'), btBox), el('div', null, el('h4', {style:{margin:'0 0 6px'}}, '📚 LSM-tree (append + merge)'), lsmBox)), readOut, el('h4', {style:{margin:'12px 0 6px'}}, 'LSM event log'), logBox);
    reset(); for (let i = 0; i < 12; i++) insert(1 + Math.floor(Math.random() * 999)); render();
  }
});
} catch(e){ console.error('[SDA] playground btree-lsm', e); SDA.errors.push({id:'btree-lsm', error:e}); }

/* ---------------- #26 Isolation-level anomaly demo ---------------- */
try {
SDA.register({kind:'playground', id:'isolation', module:'databases', icon:'🔬', title:'Isolation levels: anomaly lab',
  summary:'Two transactions run step by step on a small database. Pick a problem and an isolation level, then see what each one reads and whether it can commit.',
  explain:`<h3>How to use it</h3><ol><li>Pick <b>Lost update</b> at Read Committed and step through. One increment disappears.</li><li>Move to Repeatable Read. The second writer is stopped, so the app can retry.</li><li>Pick <b>Write skew</b> and compare Repeatable Read with Serializable.</li></ol><h3>What to notice</h3><ul><li>A dirty read appears only at Read Uncommitted.</li><li>Only Serializable stops write skew.</li></ul><div class="callout tip"><b>Important point</b><p>A stronger level prevents more problems but aborts more transactions. Your code must be ready to retry.</p></div><p class="lab-hint">The lab shows textbook behaviour. PostgreSQL treats Read Uncommitted as Read Committed.</p>`,
  real:[{co:'PostgreSQL · MySQL · Oracle', tier:'confirmed', text:'PostgreSQL defaults to Read Committed and uses SSI for Serializable. MySQL InnoDB defaults to Repeatable Read. Oracle’s SERIALIZABLE is snapshot isolation (write skew possible).', src:'Vendor documentation, Kleppmann, DDIA ch. 7'}],
  mount(host){
    const SC = {
      dirty:{name:'Dirty read', init:{x:100}, steps:[[1, 'begin'], [1, 'write', 'x', 200], [2, 'begin'], [2, 'read', 'x'], [1, 'rollback'], [2, 'read', 'x'], [2, 'commit']], check:(r, db) => r[2].reads.includes(200) ? 'T2 read x = 200, a value that was rolled back and never existed.' : null},
      nonrep:{name:'Non-repeatable read', init:{x:100}, steps:[[1, 'begin'], [1, 'read', 'x'], [2, 'begin'], [2, 'write', 'x', 150], [2, 'commit'], [1, 'read', 'x'], [1, 'commit']], check:r => r[1].reads.length === 2 && r[1].reads[0] !== r[1].reads[1] ? `T1 read x twice and got ${r[1].reads[0]} then ${r[1].reads[1]}.` : null},
      phantom:{name:'Phantom', init:{'orders:1':50, 'orders:2':150}, steps:[[1, 'begin'], [1, 'count', 'orders', '> 100'], [2, 'begin'], [2, 'write', 'orders:3', 500], [2, 'commit'], [1, 'count', 'orders', '> 100'], [1, 'commit']], check:r => r[1].reads.length === 2 && r[1].reads[0] !== r[1].reads[1] ? `T1 ran the same COUNT twice: ${r[1].reads[0]} then ${r[1].reads[1]}. A phantom row appeared.` : null},
      lost:{name:'Lost update', init:{c:10}, steps:[[1, 'begin'], [1, 'read', 'c'], [2, 'begin'], [2, 'read', 'c'], [1, 'write', 'c', '+1'], [1, 'commit'], [2, 'write', 'c', '+1'], [2, 'commit']], check:(r, db) => r[1].status === 'committed' && r[2].status === 'committed' && db.c === 11 ? 'Two increments committed but c = 11, not 12. One update was lost.' : null},
      skew:{name:'Write skew', init:{'doctors:asha':1, 'doctors:ravi':1}, steps:[[1, 'begin'], [1, 'count', 'doctors', '= 1'], [2, 'begin'], [2, 'count', 'doctors', '= 1'], [1, 'write', 'doctors:asha', 0], [2, 'write', 'doctors:ravi', 0], [1, 'commit'], [2, 'commit']], check:(r, db) => r[1].status === 'committed' && r[2].status === 'committed' && !db['doctors:asha'] && !db['doctors:ravi'] ? 'Both doctors went off call: zero on call. Each transaction’s check was valid on its snapshot.' : null}
    };
    const LV = {ru:'Read Uncommitted', rc:'Read Committed', rr:'Repeatable Read (snapshot)', ser:'Serializable'};
    let scn = 'lost', lvl = 'rc', st;
    function reset(){
      const store = {}; Object.entries(SC[scn].init).forEach(([k, v]) => store[k] = [{v, by:0, committed:true, cts:0}]);
      st = {store, clock:0, i:0, committedLog:[], tx:{1:{id:1, status:'idle', reads:[], writes:new Map(), rset:new Set(), snap:0, last:null}, 2:{id:2, status:'idle', reads:[], writes:new Map(), rset:new Set(), snap:0, last:null}}, results:[]};
      render();
    }
    const visible = (t, key) => {
      if (t.writes.has(key)) return t.writes.get(key);
      const vs = (st.store[key] || []).filter(v => v.by !== -1);
      let pick = null;
      for (const v of vs){
        if (lvl === 'ru'){ pick = v; }
        else if (lvl === 'rc'){ if (v.committed) pick = v; }
        else if (v.committed && v.cts <= t.snap) pick = v;
      }
      return pick ? pick.v : undefined;
    };
    function exec(step){
      const [n, op, a, b] = step; const t = st.tx[n];
      if (t.status === 'aborted' || t.status === 'committed' && op !== 'begin') return `skipped (T${n} already ${t.status})`;
      if (op === 'begin'){ t.status = 'active'; t.snap = st.clock; return `BEGIN (snapshot @${t.snap})`; }
      if (op === 'read'){ const v = visible(t, a); t.reads.push(v); t.last = v; t.rset.add(a); return `SELECT ${a} → ${v}`; }
      if (op === 'count'){ const keys = Object.keys(st.store).filter(k => k.startsWith(a + ':')); let c = 0; keys.forEach(k => { const v = visible(t, k); if (v === undefined) return; if (b === '> 100' ? v > 100 : v === 1) c++; }); t.reads.push(c); t.rset.add('table:' + a); return `SELECT COUNT(*) FROM ${a} WHERE value ${b} → ${c}`; }
      if (op === 'write'){
        const val = b === '+1' ? (t.last ?? 0) + 1 : b;
        const vs = st.store[a] || (st.store[a] = []);
        if (vs.some(v => !v.committed && v.by !== n && v.by !== -1)) return 'would block (another transaction holds an uncommitted write)';
        if ((lvl === 'rr' || lvl === 'ser') && vs.some(v => v.committed && v.cts > t.snap)){ abort(t); return `UPDATE ${a} = ${val} → ✗ ERROR: could not serialize access due to concurrent update (T${n} aborted; the app should retry)`; }
        vs.filter(v => v.by === n && !v.committed).forEach(v => v.by = -1);
        vs.push({v:val, by:n, committed:false, cts:null}); t.writes.set(a, val);
        return `UPDATE ${a} = ${val}${b === '+1' ? ` (computed from the value it read, ${t.last})` : ''}`;
      }
      if (op === 'rollback'){ abort(t); t.status = 'aborted'; return 'ROLLBACK'; }
      if (op === 'commit'){
        if (lvl === 'ser' && t.writes.size){
          const later = st.committedLog.filter(c => c.cts > t.snap);
          const clash = [...t.rset].some(r => later.some(c => [...c.keys].some(k => r.startsWith('table:') ? k.startsWith(r.slice(6) + ':') : k === r)));
          if (clash){ abort(t); return '✗ ERROR: could not serialize access due to read/write dependencies among transactions (aborted; retry)'; }
        }
        st.clock++; const keys = new Set(t.writes.keys());
        Object.values(st.store).forEach(vs => vs.forEach(v => { if (v.by === n && !v.committed){ v.committed = true; v.cts = st.clock; } }));
        st.committedLog.push({cts:st.clock, keys}); t.status = 'committed'; return `COMMIT ✓ (commit @${st.clock})`;
      }
    }
    function abort(t){ Object.values(st.store).forEach(vs => vs.forEach(v => { if (v.by === t.id && !v.committed) v.by = -1; })); t.writes.clear(); t.status = 'aborted'; }
    const current = () => { const db = {}; Object.entries(st.store).forEach(([k, vs]) => { const c = vs.filter(v => v.committed && v.by !== -1); if (c.length) db[k] = c[c.length - 1].v; }); return db; };
    const tl = el('div'); const verdict = el('div', {style:{marginTop:'12px'}});
    function render(){
      const steps = SC[scn].steps; const rows = steps.map((s, i) => { const done = i < st.i; const txt = s[1] === 'write' ? `UPDATE ${s[2]} = ${s[3] === '+1' ? 'read + 1' : s[3]}` : s[1] === 'read' ? `SELECT ${s[2]}` : s[1] === 'count' ? `COUNT ${s[2]} ${s[3]}` : s[1].toUpperCase(); const cell = done ? `<span class="mono">${esc(st.results[i])}</span>` : `<span class="muted mono">${esc(txt)}</span>`; return [String(i + 1), s[0] === 1 ? cell : '', s[0] === 2 ? cell : '']; });
      tl.innerHTML = ''; tl.append(frag(h.table(['#', 'Transaction T1', 'Transaction T2'], rows)));
      verdict.innerHTML = '';
      if (st.i >= steps.length){
        const db = current(); const anomaly = SC[scn].check({1:st.tx[1], 2:st.tx[2]}, db); const aborted = [1, 2].filter(n => st.tx[n].status === 'aborted' && !(scn === 'dirty' && n === 1));
        verdict.append(el('div', {class:'verdict ' + (anomaly ? 'bad' : 'ok')}, anomaly ? `⚠ Anomaly at ${LV[lvl]}: ${anomaly}` : `✓ No ${SC[scn].name.toLowerCase()} at ${LV[lvl]}.${aborted.length ? ` The database aborted T${aborted.join(' and T')} instead. Correctness is preserved and the application retries.` : ''}`));
        verdict.append(el('div', {class:'lab-hint', style:{marginTop:'6px'}}, 'Final committed state: ' + Object.entries(db).map(([k, v]) => `${k} = ${v}`).join(', ')));
      }
    }
    const next = () => { const s = SC[scn].steps[st.i]; if (!s) return; st.results[st.i] = exec(s); st.i++; render(); };
    host.append(el('div', {class:'ctl-grid'}, ui.select({label:'Anomaly scenario', value:scn, options:Object.entries(SC).map(([k, v]) => [k, v.name]), onChange:v => { scn = v; reset(); }}).el, ui.select({label:'Isolation level', value:lvl, options:Object.entries(LV), onChange:v => { lvl = v; reset(); }}).el),
      el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('⏭ Next step', next, 'sm primary'), ui.button('⏩ Run all', () => { while (st.i < SC[scn].steps.length) next(); }, 'sm'), ui.button('↺ Reset', reset, 'sm ghost')), tl, verdict);
    reset();
  }
});
} catch(e){ console.error('[SDA] playground isolation', e); SDA.errors.push({id:'isolation', error:e}); }
})();
