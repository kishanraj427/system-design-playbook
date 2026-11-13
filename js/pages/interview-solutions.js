/* =====================================================================
   PART 15 · INTERVIEW WORKED SOLUTIONS (engine)
   #/page/interview-solutions          → 15 solutions grouped by level
   #/page/interview-solutions/<id>     → one 45-minute interview, phase by
     phase: clarify → estimate → API → data → HLD → deep dive →
     bottlenecks → trade-offs. Each phase shows the thinking out loud,
     then the artefact (questions, numbers, endpoints, schema, diagram…).
   Two modes: 📖 Read the walkthrough, or 🎤 Mock interview (write your
   answer for a phase, then reveal; phases unlock in order; optional
   45-minute clock). Estimates are live: sliders change the inputs and
   every number and verdict is recomputed from them.
   Content lives in interview-solutions-a/b/c.js.
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, esc, fmtNum} = SDA.u; const ui = SDA.ui; const h = SDA.h; const Store = SDA.store;
const frag = html => document.createRange().createContextualFragment(html);
const prose = html => el('div', {class:'prose'}, frag(html));
SDA.solutions = SDA.solutions || new Map();
const LV = {beginner:{label:'Classic', icon:'🌱'}, intermediate:{label:'Intermediate', icon:'🧱'}, advanced:{label:'Advanced', icon:'🚀'}};

/* the eight phases and their time boxes (45 minutes, matching the M15 framework) */
const PH = [
  ['clarify', 'Clarify requirements', 5, '🎯', ['Who uses it, and for which 2–3 core actions?', 'What is out of scope?', 'Scale, latency, availability and consistency targets?']],
  ['estimate', 'Estimate', 4, '🧮', ['Users → requests per second (average and peak)', 'Read : write ratio', 'Storage per year and bandwidth']],
  ['api', 'API design', 5, '🔌', ['3–5 endpoints with inputs and outputs', 'Idempotency, pagination and auth']],
  ['data', 'Data model', 5, '🗄️', ['Entities and access patterns', 'Keys, indexes and partitioning', 'Which store for which data, and why']],
  ['hld', 'High-level design', 10, '🗺️', ['Clients → edge → services → stores → async', 'Walk one request end to end']],
  ['deep', 'Deep dive', 10, '🔬', ['The 1–2 hardest parts in detail', 'Algorithms, consistency, caching, sharding']],
  ['bottlenecks', 'Bottlenecks & failures', 3, '🔥', ['What breaks at 10×?', 'Single points of failure and hot spots']],
  ['tradeoffs', 'Trade-offs & wrap-up', 3, '⚖️', ['The 3–4 decisions you made and what you gave up', 'What you would do with more time']]];
SDA.SOLUTION_PHASES = PH;
const TOTAL = PH.reduce((a, p) => a + p[2], 0);

/* ---------- number formatting for estimates ---------- */
const scale = (v, units, base) => { let i = 0; while (Math.abs(v) >= base && i < units.length - 1){ v /= base; i++; } return (Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(Math.abs(v) >= 10 ? 0 : 1)) + ' ' + units[i]; };
function fmtU(v, u){
  if (v == null || isNaN(v)) return '–';
  switch (u || 'n'){
    case 'B': return scale(v, ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'], 1000);
    case 'B/day': return scale(v, ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'], 1000) + '/day';
    case 'B/yr': return scale(v, ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'], 1000) + '/year';
    case 'bps': return scale(v, ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps', 'Pbps'], 1000);
    case '/s': return fmtNum(v) + '/s';
    case '$': return '$' + fmtNum(v);
    case '%': return (+v.toFixed(v < 1 ? 2 : 1)) + '%';
    case 'n': return fmtNum(v);
    case '×': return fmtNum(v) + '×';
    default: return fmtNum(v) + ' ' + u;
  }
}
SDA.fmtU = fmtU;
/* compute every estimate row from inputs (exported so the checker can verify them) */
SDA.solEstimate = function(s, over){
  const v = {}; s.estimate.inputs.forEach(([k, , def]) => { v[k] = over && over[k] != null ? over[k] : def; });
  const r = {}; s.estimate.rows.forEach(([k, , fn]) => { r[k] = fn(v, r); });
  const units = {}; s.estimate.inputs.forEach(([k, , , , u]) => { units[k] = u || 'n'; }); s.estimate.rows.forEach(([k, , , u]) => { units[k] = u || 'n'; });
  const f = k => fmtU(k in r ? r[k] : v[k], units[k]);
  return {v, r, f};
};

/* ---------- registry ---------- */
SDA.addKind('solution', s => {
  ['id', 'level', 'title', 'prompt', 'clarify', 'estimate', 'api', 'data', 'hld', 'deep', 'bottlenecks', 'tradeoffs'].forEach(k => { if (s[k] == null) throw new Error('solution ' + (s.id || '?') + ' needs ' + k); });
  if (s.clarify.ask.length < 3) throw new Error('solution ' + s.id + ': ask at least 3 clarifying questions');
  if (s.estimate.rows.length < 3) throw new Error('solution ' + s.id + ': needs 3+ estimate rows');
  if (s.deep.length < 2) throw new Error('solution ' + s.id + ': needs 2+ deep dives');
  if ((s.tradeoffs.followups || []).length < 2) throw new Error('solution ' + s.id + ': needs 2+ follow-ups');
  SDA.solutions.set(s.id, s);
});
SDA.resolvers.sol = id => { const s = SDA.solutions.get(id); return s && {icon:s.icon || '🎤', title:s.title + ' (worked solution)', sub:'Interview solution · 45 min', href:'#/page/interview-solutions/' + id, pct:Store.isDone('solution:' + id) ? 100 : 0}; };
SDA.searchProviders.push(() => [...SDA.solutions.values()].map(s => ({kind:'Interview', icon:s.icon || '🎤', title:s.title + ': worked solution', sub:'Interview solution · ' + LV[s.level].label, href:'#/page/interview-solutions/' + s.id, kw:(s.tags || []).join(' ') + ' interview'})));
SDA.statProviders.push({label:'Interview solutions', count:() => SDA.solutions.size});

const crumbs = list => el('nav', {class:'crumbs', 'aria-label':'Breadcrumb', html:list.map(([href, t]) => href ? `<a href="${href}">${esc(t)}</a>` : `<span aria-current="page">${esc(t)}</span>`).join('<span aria-hidden="true">/</span>')});
const ls = {get(k, d){ try { const x = localStorage.getItem(k); return x == null ? d : JSON.parse(x); } catch(e){ return d; } }, set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }};
const MODE_KEY = 'sda:sol-mode', notesKey = id => 'sda:sol-notes:' + id;
const think = html => el('div', {class:'callout deep think'}, el('b', {class:'ct'}, '🧠 Thinking out loud'), frag(html));
const timeBar = () => el('div', {class:'ph-bar', 'aria-hidden':'true'}, ...PH.map(([k, t, m, ic]) => el('span', {style:{flex:m}, title:`${t} · ${m} min`}, `${ic} ${m}′`)));

/* ---------- phase renderers ---------- */
function renderPhase(k, s){
  const box = el('div');
  switch (k){
    case 'clarify': {
      const c = s.clarify; box.append(think(c.think));
      box.append(prose('<h4>Questions I ask (and the answers I assume)</h4>' + h.table(['I ask', 'Assume'], c.ask.map(([q, a]) => [q, a]), [])));
      box.append(prose(`<div class="grid c2"><div class="card"><b>Functional (in scope)</b>${h.list(c.fr)}</div><div class="card"><b>Non-functional</b>${h.list(c.nfr)}</div></div>` + (c.out && c.out.length ? `<p><b>Out of scope (said out loud):</b> ${c.out.join(' · ')}</p>` : '')));
      break;
    }
    case 'estimate': {
      const E = s.estimate; box.append(think(E.think));
      const st = SDA.solEstimate(s); const v = st.v;
      const ctl = el('div', {class:'ctl-grid'});
      E.inputs.forEach(([key, label, def, opts, u]) => { const sl = ui.slider({label, min:0, max:opts.length - 1, value:Math.max(0, opts.indexOf(def)), fmt:i => fmtU(opts[i], u), onInput:i => { v[key] = opts[i]; paint(); }}); ctl.append(sl.el); });
      const tb = el('div'), so = el('div', {class:'callout tip'});
      if (E.assume && E.assume.length) box.append(prose('<p class="lab-hint">Fixed assumptions: ' + E.assume.join(' · ') + '</p>'));
      box.append(el('p', {class:'lab-hint'}, 'Drag an input: every number below and the conclusion are recomputed.'), ctl, tb, so);
      function paint(){
        const x = SDA.solEstimate(s, v);
        tb.innerHTML = h.table(['Quantity', 'Estimate', 'How'], E.rows.map(([key, label, , , how]) => [label, `<b class="mono">${esc(x.f(key))}</b>`, how || '']), []);
        so.innerHTML = '<b class="ct">So what?</b><p>' + E.so(x.r, x.f, x.v) + '</p>';
      }
      paint();
      break;
    }
    case 'api': {
      const a = s.api; box.append(think(a.think));
      box.append(prose(h.table(['Endpoint', 'Does', 'Notes'], a.rows.map(([e, d, n]) => [`<code>${esc(e)}</code>`, d, n || '']), []) + (a.code ? h.code(a.lang || 'http', a.code, a.title || 'example') : '')));
      break;
    }
    case 'data': {
      const d = s.data; box.append(think(d.think));
      box.append(prose((d.code ? h.code(d.lang || 'sql', d.code, d.title || 'schema.sql') : '') + (d.stores ? '<h4>Where each piece of data lives</h4>' + h.table(['Data', 'Store', 'Why'], d.stores.map(([a, b, c]) => [a, `<b>${b}</b>`, c]), []) : '')));
      break;
    }
    case 'hld': {
      const H = s.hld; box.append(think(H.think));
      const dg = el('div'); box.append(dg); SDA.miniDiagram(dg, H.diagram, s.title + ': high-level design');
      if (H.walk) box.append(prose('<h4>One request, end to end</h4>' + `<ol>${H.walk.map(x => `<li>${x}</li>`).join('')}</ol>`));
      break;
    }
    case 'deep': {
      s.deep.forEach((d, i) => {
        box.append(el('h3', {class:'dd-h'}, `${i + 1}. ${d.t}`));
        box.append(think(d.think));
        if (d.body) box.append(prose(d.body));
        if (d.diagram){ const dg = el('div'); box.append(dg); SDA.miniDiagram(dg, d.diagram, d.t); }
        if (d.code) box.append(prose(h.code(d.code.lang || 'ts', d.code.src, d.code.title || 'sketch')));
      });
      break;
    }
    case 'bottlenecks': {
      const b = s.bottlenecks; box.append(think(b.think));
      box.append(prose(h.table(['What breaks', 'How you would notice', 'Fix'], b.rows, [])));
      break;
    }
    case 'tradeoffs': {
      const t = s.tradeoffs; box.append(think(t.think));
      box.append(prose(h.table(['Decision', 'I chose', 'Over', 'Because / what I give up'], t.rows.map(([a, b, c, d]) => [`<b>${a}</b>`, b, c, d]), [])));
      if (t.more) box.append(prose('<h4>With more time I would…</h4>' + h.list(t.more)));
      if (t.followups){ box.append(el('h4', {style:{margin:'16px 0 8px'}}, '🎙️ Follow-ups interviewers ask')); t.followups.forEach(([q, a]) => box.append(el('details', {class:'qa'}, el('summary', null, q), prose(`<p>${a}</p>`)))); }
      if (t.traps) box.append(el('div', {class:'callout warn'}, el('b', {class:'ct'}, 'Mistakes candidates make on this one'), frag(h.list(t.traps))));
      break;
    }
  }
  return box;
}

/* ---------- list ---------- */
function renderList(ctx){
  const c = ctx.content; ctx.wide = true;
  c.append(crumbs([['#/', 'Home'], [null, 'Interview solutions']]), el('h1', {class:'page-title'}, '🎤 Interview worked solutions'),
    el('p', {class:'lead'}, '15 classic system design interview questions, answered the way a strong candidate does it in 45 minutes. Each one shows the thinking at every step, not just the final diagram. Read the walkthrough, or switch to mock-interview mode and answer each phase yourself before you reveal it.'));
  c.append(el('div', {class:'card', style:{margin:'14px 0'}}, el('b', null, 'The same eight phases, every time'), timeBar(),
    prose(`<p class="lab-hint">${PH.map(([, t, m]) => `${t} (${m} min)`).join(' → ')} = ${TOTAL} minutes. The framework itself is taught in <a href="#/l/interview-framework">the interview framework lesson</a>; untimed problems with hints are in the <a href="#/page/practice">Practice Arena</a>.</p>`)));
  const all = [...SDA.solutions.values()];
  const done = all.filter(s => Store.isDone('solution:' + s.id)).length;
  c.append(el('p', {class:'lab-hint'}, `${done} of ${all.length} studied.`));
  Object.keys(LV).forEach(lv => {
    const list = all.filter(s => s.level === lv); if (!list.length) return;
    c.append(el('div', {class:'sect-h'}, el('div', null, el('h2', null, `${LV[lv].icon} ${LV[lv].label}`), el('p', null, `${list.length} questions`))));
    const g = el('div', {class:'grid c3'});
    list.forEach(s => { const d = Store.isDone('solution:' + s.id); g.append(el('a', {class:'card glow', href:'#/page/interview-solutions/' + s.id}, el('div', {class:'row', style:{justifyContent:'space-between'}}, el('span', {class:'ico-lg', 'aria-hidden':'true'}, s.icon || '🎤'), d ? el('span', {class:'chip', style:{color:'var(--ok)'}}, '✓ studied') : el('span', {class:'chip'}, '45 min')), el('b', {style:{display:'block', marginTop:'8px', color:'var(--text)', fontSize:'16px'}}, s.title), el('p', {class:'muted', style:{margin:'6px 0 0', fontSize:'14px'}}, s.tagline || ''))); });
    c.append(g);
  });
}

/* ---------- one solution ---------- */
function renderOne(ctx, s){
  const c = ctx.content; ctx.title = s.title + ': worked solution'; ctx.track = {kind:'Interview', title:s.title, icon:s.icon || '🎤'};
  c.append(crumbs([['#/', 'Home'], ['#/page/interview-solutions', 'Interview solutions'], [null, s.title]]));
  const doneB = ui.button(Store.isDone('solution:' + s.id) ? '✓ Studied' : 'Mark as studied', () => { const v = !Store.isDone('solution:' + s.id); Store.setDone('solution:' + s.id, v); doneB.innerHTML = v ? '✓ Studied' : 'Mark as studied'; }, 'sm');
  c.append(el('div', {class:'row', style:{marginTop:'12px', flexWrap:'wrap'}}, el('span', {class:'chip lvl'}, `${LV[s.level].icon} ${LV[s.level].label}`), el('span', {class:'chip'}, `⏱ ${TOTAL} min`), ...(s.tags || []).map(t => el('span', {class:'chip'}, t)), doneB));
  c.append(el('h1', {class:'page-title'}, `${s.icon || '🎤'} ${s.title}`));
  if (s.tagline) c.append(el('p', {class:'lead'}, s.tagline));
  c.append(el('div', {class:'callout info'}, el('b', {class:'ct'}, 'The interviewer says'), frag(`<p>“${s.prompt}”</p>` + (s.focus ? `<p class="muted" style="margin:6px 0 0">Where interviewers usually push: ${s.focus}</p>` : ''))));
  // mode switch
  let mode = ls.get(MODE_KEY, 'read');
  const seg = el('div', {class:'seg wrap', role:'group', 'aria-label':'How to use this solution'});
  const mk = (m, t) => { const b = el('button', {type:'button', 'aria-pressed':String(mode === m)}, t); b.addEventListener('click', () => { if (mode === m) return; mode = m; ls.set(MODE_KEY, m); seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); }); return b; };
  seg.append(mk('read', '📖 Read the walkthrough'), mk('mock', '🎤 Mock interview: answer first'));
  c.append(el('div', {class:'row', style:{flexWrap:'wrap', gap:'10px', margin:'14px 0 6px'}}, seg));
  const nav = el('div', {class:'pill-row', style:{margin:'8px 0 4px'}}, ...PH.map(([k, t, m, ic], i) => el('a', {class:'chip', href:'#ph-' + k}, `${ic} ${i + 1} ${t} · ${m}′`)));
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) t.scrollIntoView({behavior:SDA.reduced ? 'auto' : 'smooth', block:'start'}); }));
  c.append(nav, timeBar());
  const body = el('div'); c.append(body);
  let clockIv = null; SDA.onDispose(() => clearInterval(clockIv));
  function draw(){
    clearInterval(clockIv); clockIv = null; body.innerHTML = '';
    if (mode === 'mock') body.append(mockIntro());
    const notes = ls.get(notesKey(s.id), {}); let revealed = 0; const reveals = [];
    PH.forEach(([k, t, m, ic], i) => {
      body.append(el('h2', {id:'ph-' + k, class:'ph-h'}, el('span', {class:'ph-n'}, String(i + 1)), `${ic} ${t}`, el('span', {class:'chip mono'}, `${m} min`)));
      if (mode === 'read'){ body.append(renderPhase(k, s)); return; }
      const slot = el('div');
      const ta = el('textarea', {class:'input', rows:'4', style:{width:'100%', fontFamily:'var(--font-mono)', fontSize:'13px'}, placeholder:'Your answer for this phase (saved in this browser)…', 'aria-label':`Your answer: ${t}`}); ta.value = notes[k] || '';
      ta.addEventListener('input', () => { notes[k] = ta.value; ls.set(notesKey(s.id), notes); });
      const btn = ui.button(`Reveal phase ${i + 1}`, () => { if (btn.disabled) return; btn.disabled = true; btn.innerHTML = 'Revealed ↓'; slot.append(renderPhase(k, s)); revealed++; if (reveals[revealed]) reveals[revealed].disabled = false; }, 'sm primary');
      btn.disabled = i > 0; reveals.push(btn);
      body.append(el('div', {class:'card your-turn'}, el('b', null, '🎤 Your turn'), prose(h.list(PH[i][4])), ta, el('div', {class:'row', style:{marginTop:'8px', flexWrap:'wrap', gap:'8px'}}, btn, i > 0 ? el('span', {class:'muted', style:{fontSize:'13px'}}, 'Unlocks after the previous phase is revealed.') : null)), slot);
    });
    const refs = (s.refs || []).map(r => SDA.resolve(r)).filter(Boolean);
    if (refs.length) body.append(el('h3', {style:{margin:'26px 0 8px'}}, '📚 Go deeper'), el('div', {class:'pill-row'}, ...refs.map(r => el('a', {class:'chip', href:r.href}, `${r.icon || ''} ${r.title}`))));
  }
  function mockIntro(){
    const clock = el('span', {class:'chip mono', style:{fontSize:'15px'}}, '00:00'), where = el('span', {class:'muted'}, 'Clock not started.');
    let t0 = 0;
    const b = ui.button('▶ Start the 45-minute clock', () => {
      if (clockIv){ clearInterval(clockIv); clockIv = null; b.innerHTML = '▶ Restart the clock'; where.textContent = 'Clock stopped.'; return; }
      t0 = Date.now(); b.innerHTML = '■ Stop'; const tick = () => { const sec = Math.floor((Date.now() - t0) / 1000); clock.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; let acc = 0, ph = PH.length - 1; for (let i = 0; i < PH.length; i++){ acc += PH[i][2]; if (sec < acc * 60){ ph = i; break; } } where.textContent = sec >= TOTAL * 60 ? 'Time is up: summarise your trade-offs.' : `You should be on phase ${ph + 1}: ${PH[ph][1]}.`; }; tick(); clockIv = setInterval(tick, 1000);
    }, 'sm');
    return el('div', {class:'callout tip'}, el('b', {class:'ct'}, 'Mock interview mode'), prose('<p>Answer each phase in the box (out loud is even better), then reveal how a strong candidate would do it. Phases unlock in order, like the real thing. Your answers are saved in this browser.</p>'), el('div', {class:'row', style:{flexWrap:'wrap', gap:'10px'}}, b, clock, where));
  }
  draw();
  const all = [...SDA.solutions.values()], i = all.indexOf(s), prev = all[i - 1], next = all[i + 1];
  c.append(el('div', {class:'row', style:{justifyContent:'space-between', marginTop:'28px', flexWrap:'wrap', gap:'8px'}}, prev ? el('a', {class:'btn sm ghost', href:'#/page/interview-solutions/' + prev.id}, '← ' + prev.title) : el('span'), next ? el('a', {class:'btn sm', href:'#/page/interview-solutions/' + next.id}, next.title + ' →') : el('span')));
}

SDA.register({kind:'page', id:'interview-solutions', icon:'🎤', title:'Interview worked solutions', summary:'15 full 45-minute answers, with the thinking at every step',
  render(ctx){ const s = ctx.args[0] && SDA.solutions.get(ctx.args[0]); if (ctx.args[0] && !s){ ctx.content.append(el('div', {class:'empty'}, 'Solution not found. ', el('a', {href:'#/page/interview-solutions'}, 'All solutions →'))); return; } s ? renderOne(ctx, s) : renderList(ctx); }});
SDA.register({kind:'nav', label:'Interview solutions', href:'#/page/interview-solutions', icon:'🎤', order:1, group:'principal', desc:'15 worked 45-minute answers: clarify → estimate → API → data → HLD → deep dive → bottlenecks → trade-offs', count:() => SDA.solutions.size});
})();
