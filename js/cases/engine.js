/* =====================================================================
   PART 9 · CASE-STUDY ENGINE
   kind:'case' registry · #/cases index · #/case/:id/:tab pages (A–F)
   Evolution player (Day 1 → planet scale) · request-flow animations ·
   Break-It failure simulator · weekend-lab checklist · interview twists
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, esc, fmtNum, clamp} = SDA.u; const ui = SDA.ui; const h = SDA.h; const Store = SDA.store;
const frag = html => document.createRange().createContextualFragment(html);
const TIERS = {
  starter:{label:'Starter', icon:'🌱', blurb:'Compact designs in 5 evolution steps. The classic interview warm-ups.'},
  flagship:{label:'Flagship', icon:'🏆', blurb:'Full-depth, 8–10 step evolutions of real products with interactive simulations.'},
  standard:{label:'Standard', icon:'🧱', blurb:'Focused 5–6 step designs of well-known products.'}};
SDA.CASE_TIERS = TIERS;
SDA.cases = SDA.cases || new Map();
const crumbs = list => el('nav', {class:'crumbs', 'aria-label':'Breadcrumb', html:list.map(([href, t]) => href ? `<a href="${href}">${esc(t)}</a>` : `<span aria-current="page">${esc(t)}</span>`).join('<span aria-hidden="true">/</span>')});

SDA.addKind('case', c => {
  ['id', 'title', 'tier', 'arch', 'evolution'].forEach(k => { if (c[k] == null) throw new Error(`case ${c.id || '?'} needs ${k}`); });
  if (!TIERS[c.tier]) throw new Error('unknown case tier ' + c.tier);
  SDA.cases.set(c.id, c);
});
SDA.resolvers.case = id => { const c = SDA.cases.get(id); return c && {icon:c.icon || '🏗️', title:c.title, sub:`Case study · ${TIERS[c.tier].label}`, href:'#/case/' + id, pct:Store.isDone('case:' + id) ? 100 : 0}; };
SDA.searchProviders.push(() => [...SDA.cases.values()].map(c => ({kind:'Case studies', icon:c.icon || '🏗️', title:c.title, sub:c.tagline || '', href:'#/case/' + c.id, kw:(c.tags || []).join(' ') + ' ' + (c.summary || '')})));
SDA.statProviders.push({label:'Case studies', count:() => SDA.cases.size});

/* ---------- node / edge visibility across evolution steps ---------- */
const shown = (x, k, fixed) => { const s = x.stage || 0, g = x.gone == null ? Infinity : x.gone; const on = s === 0 || s < k || (s === k && fixed); const off = g < k || (g === k && fixed); return on && !off; };
const finalShown = x => x.gone == null;
function archDiagram(host, c, opts){
  const A = c.arch;
  return new SDA.Diagram(host, Object.assign({title:opts.title, w:A.w || 860, h:A.h || 330, minW:A.minW || 620, alt:A.alt || c.title + ' architecture', caption:opts.caption != null ? opts.caption : null,
    nodes:A.nodes.map(n => Object.assign({}, n, {hidden:opts.hidden ? opts.hidden(n) : !finalShown(n)})),
    edges:A.edges.map(e => Object.assign({}, e, {hidden:opts.hidden ? opts.hidden(e) : !finalShown(e)})), steps:opts.steps, autoplay:opts.autoplay}, opts.extra || {}));
}

/* ---------- B1: evolution player ---------- */
function evolutionPlayer(host, c){
  const E = c.evolution; let k = 0, fixed = true;
  const chips = el('div', {class:'pill-row', role:'list', style:{margin:'4px 0 10px'}});
  const dHost = el('div');
  const d = archDiagram(dHost, c, {title:'Day 1 → planet scale', caption:'', hidden:n => !shown(n, 0, true)});
  const met = ui.metrics(null, [{id:'scale', label:'Scale'}, {id:'lat', label:'p99 latency', instant:true, fmt:v => v >= 1000 ? (v / 1000).toFixed(1) + ' s' : Math.round(v) + ' ms', warn:300, bad:1000}, {id:'err', label:'Error rate', unit:'%', instant:true, fmt:v => v < 1 ? v.toFixed(2) : v.toFixed(1), warn:.5, bad:2}, {id:'load', label:'Peak load vs capacity', unit:'%', instant:true, fmt:v => String(Math.round(v)), warn:75, bad:100}]);
  const story = el('div'); const ctl = el('div', {class:'controls', style:{margin:'10px 0'}});
  const fixB = ui.button('🔧 Apply the fix', () => { if (fixed) return; fixed = true; render(true); }, 'sm primary');
  const nextB = ui.button('Next step →', () => { if (k < E.length - 1){ k++; fixed = false; render(false); } }, 'sm');
  const prevB = ui.button('← Back', () => { if (k > 0){ k--; fixed = true; render(false); } }, 'sm ghost');
  const restartB = ui.button('⏮ Restart', () => { k = 0; fixed = true; render(false); }, 'sm ghost');
  ctl.append(prevB, fixB, nextB, restartB);
  function setMetrics(m){ met.set('scale', E[k].scale || ''); met.set('lat', m.lat); met.set('err', m.err); met.set('load', m.load); }
  function render(justFixed){
    const s = E[k];
    for (const n of c.arch.nodes) d.setHidden(n.id, !shown(n, k, fixed));
    for (const e of c.arch.edges) d.setEdgeHidden(e.from, e.to, !shown(e, k, fixed));
    const sub = {}; for (let i = 0; i <= k; i++){ if (i < k || fixed) Object.assign(sub, E[i].sub || {}); }
    for (const n of c.arch.nodes) d.setSub(n.id, sub[n.id] != null ? sub[n.id] : (n.sub || ''));
    for (const n of c.arch.nodes) d.setStatus(n.id, 'ok');
    if (!fixed){ (s.hot || []).forEach(id => d.setStatus(id, 'hot')); (s.down || []).forEach(id => d.setStatus(id, 'down')); }
    d.highlight(fixed && k > 0 ? c.arch.nodes.filter(n => (n.stage || 0) === k).map(n => n.id) : []);
    setMetrics(fixed || k === 0 ? s.after : s.before);
    d.setCaption(`<b>Step ${k}/${E.length - 1}: ${esc(s.title)}</b>`);
    story.innerHTML = '';
    if (k === 0) story.append(el('div', {class:'grid c2'}, el('div', {class:'card'}, el('b', null, '🌱 Day 1'), el('div', {class:'prose', html:s.fix}))));
    else story.append(el('div', {class:'grid c2'},
      el('div', {class:'card', style:{borderColor:fixed ? 'var(--border)' : 'var(--bad)'}}, el('b', null, '💥 What breaks?'), el('div', {class:'prose', html:s.breaks})),
      el('div', {class:'card', style:{borderColor:fixed ? 'var(--ok)' : 'var(--border)', opacity:fixed ? '1' : '.55'}}, el('b', null, '🔧 The fix'), el('div', {class:'prose', html:fixed ? s.fix : '<p class="muted">Press <b>Apply the fix</b> to reveal it.</p>'}))));
    if (s.lesson && fixed) story.append(el('p', {class:'lab-hint', html:'📘 Related: ' + [].concat(s.lesson).map(id => { const l = SDA.lessons.get(id); return l ? `<a href="#/l/${id}">${esc(l.title)}</a>` : ''; }).filter(Boolean).join(' · ')}));
    chips.innerHTML = '';
    E.forEach((x, i) => { const b = el('button', {type:'button', class:'chip', role:'listitem', 'aria-current':i === k ? 'step' : 'false', style:{cursor:'pointer', borderColor:i === k ? 'var(--accent1)' : i < k ? 'var(--ok)' : 'var(--border)', color:i <= k ? 'var(--text)' : 'var(--muted)'}}, `${i < k || (i === k && fixed && i > 0) ? '✓ ' : ''}${i}. ${x.title}`); b.addEventListener('click', () => { k = i; fixed = i === 0; render(false); }); chips.append(b); });
    fixB.disabled = fixed; fixB.style.display = k === 0 ? 'none' : ''; nextB.disabled = !fixed || k === E.length - 1; prevB.disabled = k === 0;
    nextB.innerHTML = k === E.length - 1 ? '🏁 Final architecture' : 'Next step →';
    if (justFixed && s.flow && s.flow.length) d.flow(s.flow, {dur:600});
  }
  host.append(el('p', {class:'lab-hint'}, 'Start with one server and one database. At each step traffic grows, something breaks (red metrics, hot or failed components), and you apply the fix that real systems use.'), chips, dHost, met.el, story, ctl);
  render(false);
}
/* ---------- B2: request flows ---------- */
function flowPlayer(host, c){
  const box = el('div'); let cur = 0;
  function render(){ box.innerHTML = ''; const f = c.flows[cur]; archDiagram(box, c, {title:'▶ ' + f.name, steps:f.steps, autoplay:false}); }
  if (c.flows.length > 1) host.append(el('div', {class:'pill-row', style:{marginBottom:'6px'}}, ...c.flows.map((f, i) => { const b = ui.button(f.name, () => { cur = i; render(); [...b.parentNode.children].forEach((x, j) => x.classList.toggle('primary', j === i)); }, 'sm' + (i === 0 ? ' primary' : '')); return b; })));
  host.append(box); render();
}
/* ---------- B3: Break It ---------- */
function breakIt(host, c){
  const dHost = el('div'); const d = archDiagram(dHost, c, {title:'💥 Break it', caption:'Pick a failure to inject.'});
  const out = el('div');
  const reset = () => { c.arch.nodes.forEach(n => d.setStatus(n.id, 'ok')); d.highlight([]); };
  const btns = el('div', {class:'pill-row'});
  c.breakIt.forEach(b => btns.append(ui.button(b.label, async () => {
    reset(); (b.kill || []).forEach(id => d.setStatus(id, 'down')); (b.hot || []).forEach(id => d.setStatus(id, 'hot')); d.highlight(b.kill || []);
    const cls = b.verdict === 'survives' ? 'ok' : b.verdict === 'degrades' ? 'warn' : 'bad';
    const tag = b.verdict === 'survives' ? '✅ Survives' : b.verdict === 'degrades' ? '⚠️ Degrades gracefully' : '❌ Outage for some users';
    d.setCaption(`<b>${esc(b.label)}</b>: ${tag}`);
    out.innerHTML = ''; out.append(el('div', {class:'verdict ' + cls, html:`<b>${tag}.</b> ${b.text}`}));
    if (b.flow && b.flow.length) await d.flow(b.flow, {dur:550});
  }, 'sm')));
  btns.append(ui.button('↺ Heal everything', () => { reset(); d.setCaption('All components healthy.'); out.innerHTML = ''; }, 'sm ghost'));
  host.append(dHost, btns, out);
}
/* ---------- E: milestones checklist (per-browser) ---------- */
function milestones(host, c){
  const key = 'sda:case-ms:' + c.id; let st = {}; try { st = JSON.parse(localStorage.getItem(key) || '{}'); } catch(e){ st = {}; }
  const save = () => { try { localStorage.setItem(key, JSON.stringify(st)); } catch(e){} };
  const g = el('div', {class:'grid c3'});
  c.lab.milestones.forEach((m, i) => { const card = el('div', {class:'card'}, el('b', null, m.day)); m.items.forEach((it, j) => { const id = i + ':' + j; const cb = el('input', {type:'checkbox'}); cb.checked = !!st[id]; cb.addEventListener('change', () => { if (cb.checked) st[id] = 1; else delete st[id]; save(); }); card.append(el('label', {class:'check', style:{display:'flex', gap:'8px', margin:'6px 0', fontWeight:'500', alignItems:'flex-start'}}, cb, el('span', {html:it}))); }); g.append(card); });
  host.append(g);
}
function twists(host, c){
  c.twists.forEach((t, i) => { const ans = el('div', {class:'q-why ok', hidden:true, html:'<b>Strong answer</b><div style="margin-top:6px">' + t.a + '</div>'}); const b = ui.button('Reveal a strong answer', () => { ans.hidden = false; b.disabled = true; }, 'sm'); host.append(el('div', {class:'card', style:{margin:'10px 0'}}, el('b', null, `${i + 1}. ${t.q}`), el('div', {style:{margin:'8px 0'}}, b), ans)); });
}
const sec = (p, title, node) => { p.append(el('h3', {style:{margin:'22px 0 8px'}}, title)); if (node) p.append(node); };
const prose = html => el('div', {class:'prose', html});
const tagChip = t => t === 'public' ? '<span class="tier confirmed">publicly disclosed</span>' : '<span class="tier educational">illustrative estimate</span>';

/* ---------- routes ---------- */
SDA.routes.cases = function(ctx){
  ctx.title = 'Case studies'; ctx.wide = true; const c = ctx.content;
  c.append(crumbs([['#/', 'Home'], [null, 'Case studies']]), el('h1', {class:'page-title'}, '🏗️ Case studies: Day 1 → planet scale'),
    el('p', {class:'lead'}, 'Each case starts with one server and one database, then grows step by step: what breaks, the fix, an animated request flow, a Break-It failure simulator, deep dives, trade-offs, a weekend build plan and interview twists.'));
  c.append(prose(h.callout('info', 'How accurate are these?', `<p>Each claim is labelled: ${h.tier('confirmed')} means a public paper, blog or talk exists; ${h.tier('inference')} is a reasonable architectural inference; ${h.tier('educational')} is a simplified design for learning. Numbers are marked as publicly disclosed or illustrative. Internal details of proprietary systems are never invented.</p>`)));
  Object.entries(TIERS).forEach(([tid, t]) => {
    const list = [...SDA.cases.values()].filter(x => x.tier === tid); if (!list.length) return;
    c.append(el('div', {class:'sect-h'}, el('div', null, el('h2', null, `${t.icon} ${t.label}`), el('p', null, t.blurb))));
    const g = el('div', {class:'grid c3'});
    list.forEach(x => { const done = Store.isDone('case:' + x.id); g.append(el('a', {class:'card glow', href:'#/case/' + x.id}, el('div', {class:'row', style:{justifyContent:'space-between'}}, el('span', {class:'ico-lg', 'aria-hidden':'true'}, x.icon || '🏗️'), done ? el('span', {class:'chip', style:{color:'var(--ok)'}}, '✓ studied') : el('span', {class:'chip'}, `${x.evolution.length} steps`)), el('b', {style:{display:'block', marginTop:'8px', color:'var(--text)', fontSize:'16px'}}, x.title), el('p', {class:'muted', style:{margin:'6px 0 0', fontSize:'14px'}}, x.tagline || ''))); });
    c.append(g);
  });
};
SDA.routes.case = function(ctx){
  const c = SDA.cases.get(ctx.args[0]); if (!c){ ctx.content.append(el('div', {class:'empty'}, 'Case study not found. ', el('a', {href:'#/cases'}, 'See all case studies →'))); return; }
  ctx.title = c.title; ctx.wide = true; ctx.track = {kind:'Case study', title:c.title, icon:c.icon || '🏗️'};
  const p = ctx.content; const t = TIERS[c.tier]; const tab = ctx.args[1] || 'setup';
  p.append(crumbs([['#/', 'Home'], ['#/cases', 'Case studies'], [null, c.title]]));
  const studied = Store.isDone('case:' + c.id);
  const markB = ui.button(studied ? '✓ Studied' : 'Mark as studied', () => { const v = !Store.isDone('case:' + c.id); Store.setDone('case:' + c.id, v); markB.innerHTML = v ? '✓ Studied' : 'Mark as studied'; }, 'sm' + (studied ? '' : ' primary'));
  p.append(el('div', {class:'row', style:{marginTop:'12px', flexWrap:'wrap'}}, el('span', {class:'chip lvl'}, `${t.icon} ${t.label} case`), ...(c.modules || []).map(id => { const m = SDA.modById.get(id); return m ? el('a', {class:'chip', href:'#/m/' + id}, `${m.icon || ''} ${m.title}`) : null; }), markB));
  p.append(el('h1', {class:'page-title'}, `${c.icon || '🏗️'} ${c.title}`));
  if (c.summary) p.append(el('p', {class:'lead', html:c.summary}));
  if (c.accuracy) p.append(prose(h.callout('info', 'Accuracy note', `<p>${c.accuracy}</p>`)));
  const list = [
    {id:'setup', label:'A · Setup', render:x => {
      sec(x, '1 · Product overview', el('div', {class:'grid c2'}, el('div', {class:'card'}, el('b', null, '✅ In scope'), prose(h.list(c.overview.in))), el('div', {class:'card'}, el('b', null, '🚫 Out of scope'), prose(h.list(c.overview.out)))));
      if (c.overview.what) x.insertBefore(prose(`<p>${c.overview.what}</p>`), x.lastChild);
      sec(x, '2 · What makes it hard', prose(h.list(c.challenges)));
      sec(x, '3 · Functional requirements', prose(h.list(c.fr)));
      sec(x, '4 · Non-functional requirements', prose(h.list(c.nfr)));
      sec(x, '5 · Scale estimates (math shown)', prose(h.table(['Quantity', 'Estimate', 'Math', 'Source'], c.scale.map(r => [r.k, `<b>${r.v}</b>`, `<code>${esc(r.math)}</code>`, tagChip(r.tag)]), [])));
    }},
    {id:'evolve', label:'B · Day 1 → planet scale', render:x => {
      sec(x, '6 · Evolution: step by step', null); evolutionPlayer(x, c);
      sec(x, '7 · End-to-end request flow', null); flowPlayer(x, c);
      sec(x, '8 · Break it', null); breakIt(x, c);
    }},
    {id:'deep', label:'C · Deep dives', render:x => {
      sec(x, '9 · Data model', prose(h.code(c.dataModel.lang || 'sql', c.dataModel.code, c.dataModel.title || 'schema') + (c.dataModel.notes ? `<p>${c.dataModel.notes}</p>` : '')));
      sec(x, '10 · Key APIs', null);
      c.apis.forEach(a => x.append(el('div', {class:'card', style:{margin:'10px 0'}}, el('div', {class:'row'}, el('span', {class:'chip mono', style:{color:'var(--accent1)'}}, a.m), el('b', {class:'mono'}, a.path)), a.note ? prose(`<p>${a.note}</p>`) : null, prose((a.req ? h.code('json', a.req, 'request') : '') + (a.res ? h.code('json', a.res, 'response') : '')))));
      sec(x, '11 · Core algorithm: ' + c.algorithm.title, prose(c.algorithm.html));
      if (c.algorithm.mount){ const m = el('div', {class:'pg-host panel', style:{padding:'16px', margin:'12px 0'}}); x.append(m); c.algorithm.mount(m, {onDispose:SDA.onDispose, ui, h, u:SDA.u}); }
      (c.algorithm.pg ? [].concat(c.algorithm.pg) : []).forEach(id => SDA.mountPg(x, id, true));
      (c.algorithm.lab ? [].concat(c.algorithm.lab) : []).forEach(id => { const l = SDA.labs.get(id); if (l) ui.lab(x, l); });
    }},
    {id:'reason', label:'D · Trade-offs', render:x => {
      sec(x, '12 · Trade-offs', prose(h.table(['Decision', 'Why it wins here', 'What we give up'], c.tradeoffs, [])));
      sec(x, '13 · Alternative designs', prose(h.table(['Alternative', 'Why not (here)'], c.alternatives, [])));
      sec(x, '14 · Failure scenarios', prose(h.table(['If this fails…', 'The system reacts by…'], c.failures, [])));
    }},
    {id:'build', label:'E · Build it', render:x => {
      sec(x, '15 · Weekend lab', prose(`<p><b>Stack:</b> ${c.lab.stack.map(s => `<span class="chip">${esc(s)}</span>`).join(' ')}</p>`));
      milestones(x, c);
      if (c.lab.pseudocode) x.append(prose(h.code(c.lab.pseudocode.lang || 'ts', c.lab.pseudocode.code, c.lab.pseudocode.title || 'key pseudocode')));
      if (c.lab.loadTest) x.append(prose(`<h4>Load-test it</h4>${c.lab.loadTest}`));
      sec(x, '16 · Interview twists', null); twists(x, c);
    }},
    {id:'sources', label:'F · Sources', render:x => {
      if (c.real && c.real.length){ sec(x, 'Real-world facts used in this case', null); c.real.forEach(r => x.append(el('div', {class:'card', style:{margin:'10px 0'}, html:`<div class="row" style="justify-content:space-between"><b>${esc(r.co)}</b>${h.tier(r.tier)}</div><p style="margin:6px 0">${r.text}</p><p class="lab-hint" style="margin:0">Source: ${r.src}</p>`}))); }
      sec(x, '17 · Sources & further reading', prose(`<ul>${c.sources.map(s => `<li>${s}</li>`).join('')}</ul><p class="lab-hint">No links are given on purpose: search the titles to find the originals.</p>`));
    }}];
  ui.tabs(p, list, {initial:list.some(l => l.id === tab) ? tab : 'setup', onSelect:(tid, user) => { if (user) history.replaceState(null, '', '#/case/' + c.id + '/' + tid); }});
};
SDA.register({kind:'nav', label:'Case studies', href:'#/cases', icon:'🏗️', order:3, group:'explore', desc:'Day 1 → planet-scale system walkthroughs', count:() => SDA.cases.size});
})();
