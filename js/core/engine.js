
/* =====================================================================
   SDA ENGINE — utilities, storage, registry, UI components, diagram
   animation engine, quiz, flashcards, code-lab runner.
   Later parts only call SDA.register({...}).
   ===================================================================== */
(function(){
'use strict';
const SDA = window.SDA = Object.assign(window.SDA || {}, {
  version:'1.0.0', modules:[], modById:new Map(), lessons:new Map(), playgrounds:new Map(), labs:new Map(),
  pages:new Map(), glossary:new Map(), nav:[], routes:{}, resolvers:{}, searchProviders:[], statProviders:[],
  errors:[], booted:false, reduced:false
});

SDA.LEVELS = [
  {id:'beginner', name:'Beginner', icon:'🌱', blurb:'How the web works, how to estimate, and how to scale for the first time.'},
  {id:'intermediate', name:'Intermediate', icon:'🧱', blurb:'Caching, databases and the design principles that hold systems together.'},
  {id:'advanced', name:'Advanced', icon:'🚀', blurb:'Search, reliability, observability and security at scale.'},
  {id:'distributed', name:'Distributed Systems', icon:'🕸️', blurb:'Consensus, consistency, clocks, queues and streams.'},
  {id:'realworld', name:'Real-World Architecture', icon:'🏗️', blurb:'Platforms, real-time media and how real products are actually built.'},
  {id:'principal', name:'Principal Engineer Thinking', icon:'🧭', blurb:'Interviews, trade-off reasoning, strategy and long-term evolvability.'}
];

/* ---------------- utilities ---------------- */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug = s => String(s).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const lerp = (a,b,t) => a + (b-a)*t;
const ease = { inOut:t => t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2, out:t => 1-Math.pow(1-t,3), linear:t => t };
let uid = 0;
function el(tag, attrs, ...kids){
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs){
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()){ if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return e;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs){ const e = document.createElementNS(SVGNS, tag); if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]); return e; }
function fmtNum(n, d=1){
  if (n == null || isNaN(n)) return '–';
  if (!isFinite(n)) return '∞';
  const a = Math.abs(n);
  for (const [v,s] of [[1e12,'T'],[1e9,'B'],[1e6,'M'],[1e3,'K']]) if (a >= v){ const x = n/v; return (Math.abs(x) >= 100 ? Math.round(x) : +x.toFixed(d)) + s; }
  return a >= 100 ? String(Math.round(n)) : String(+n.toFixed(a < 1 ? 2 : d));
}
function fmtBytes(b){
  if (!isFinite(b)) return '∞';
  const u = ['B','KB','MB','GB','TB','PB','EB','ZB']; let i = 0, v = Math.abs(b);
  while (v >= 1000 && i < u.length-1){ v /= 1000; i++; }
  const s = v >= 100 ? String(Math.round(v)) : v.toFixed(v >= 10 ? 1 : 2).replace(/\.?0+$/,'');
  return (b < 0 ? '-' : '') + s + ' ' + u[i];
}
function fmtDur(ms){
  const a = Math.abs(ms);
  if (a < 1e-3) return +(ms*1e6).toFixed(a*1e6 < 10 ? 1 : 0) + ' ns';
  if (a < 1) return +(ms*1e3).toFixed(a*1e3 < 10 ? 1 : 0) + ' µs';
  if (a < 1000) return +(ms).toFixed(a < 10 ? 1 : 0) + ' ms';
  const s = ms/1000; if (s < 60) return +s.toFixed(s < 10 ? 1 : 0) + ' s';
  const m = s/60; if (m < 60) return +m.toFixed(m < 10 ? 1 : 0) + ' min';
  const hr = m/60; if (hr < 48) return +hr.toFixed(hr < 10 ? 1 : 0) + ' h';
  const d = hr/24; if (d < 730) return +d.toFixed(d < 10 ? 1 : 0) + ' days';
  return +(d/365).toFixed(1) + ' years';
}
function rng(seed){ let a = (seed >>> 0) || 1; return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(arr, r=Math.random){ for (let i = arr.length-1; i > 0; i--){ const j = Math.floor(r()*(i+1)); [arr[i],arr[j]] = [arr[j],arr[i]]; } return arr; }
function dedent(s){
  s = String(s).replace(/\t/g,'  ').replace(/^\s*\n/,'').replace(/\s+$/,'');
  const lines = s.split('\n');
  const ind = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
  return lines.map(l => l.slice(isFinite(ind) ? ind : 0)).join('\n');
}
function debounce(fn, ms){ let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function stripHtml(html){ const d = document.createElement('div'); d.innerHTML = html; return d.textContent || ''; }

/* ---------------- storage (degrades gracefully) ---------------- */
const Store = {
  key:'sda:v1', data:{},
  load(){
    let d = null;
    try { d = JSON.parse(localStorage.getItem(this.key) || 'null'); } catch(e){ d = null; }
    this.data = Object.assign({done:{}, quiz:{}, sb:{}, last:null, theme:null, depth:'simple'}, (d && typeof d === 'object') ? d : {});
  },
  save(){ try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch(e){ /* private mode / quota: progress lives only in memory */ } },
  isDone(id){ return !!this.data.done[id]; },
  setDone(id, v){ if (v) this.data.done[id] = Date.now(); else delete this.data.done[id]; this.save(); document.dispatchEvent(new CustomEvent('sda:progress', {detail:{id, v}})); }
};
Store.load();
SDA.store = Store;

function toast(msg, ms){
  const box = document.getElementById('toasts'); if (!box) return;
  const t = el('div', {class:'toast', role:'status'}, msg); box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms || 2200);
}
async function copyText(txt){
  try { await navigator.clipboard.writeText(txt); return true; }
  catch(e){
    const ta = el('textarea', {style:{position:'fixed', left:'-9999px', top:'0'}}); ta.value = txt; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch(_){ ok = false; }
    ta.remove(); return ok;
  }
}
function errCard(title, e){
  return el('div', {class:'err-card', role:'alert'}, el('b', null, '⚠ ' + title), el('div', {class:'muted', style:{marginTop:'4px'}}, 'The rest of the site keeps working. Details: '), el('code', null, String(e && e.message || e)));
}

/* ---------------- reduced motion ---------------- */
const mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
SDA.reduced = !!(mq && mq.matches);
if (mq){ const f = e => { SDA.reduced = e.matches; }; if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f); }

/* ---------------- disposal scopes ---------------- */
const scopeStack = [[]];
function onDispose(fn){ scopeStack[scopeStack.length-1].push(fn); }
function runDisposers(list){ list.splice(0).forEach(f => { try { f(); } catch(e){ console.error('[SDA] dispose', e); } }); }
function withScope(fn){ const s = []; scopeStack.push(s); try { fn(); } finally { scopeStack.pop(); } const d = () => runDisposers(s); onDispose(d); return d; }
function disposeAll(){ runDisposers(scopeStack[0]); }

/* ---------------- visibility + animation loops ---------------- */
const visMap = new WeakMap();
const visIO = ('IntersectionObserver' in window) ? new IntersectionObserver(entries => {
  for (const en of entries){ const r = visMap.get(en.target); if (!r) continue; r.visible = en.isIntersecting; r.init = true; r.cbs.forEach(cb => cb(r.visible)); }
}, {threshold:0.02}) : null;
function watchVisible(node, cb){
  let r = visMap.get(node);
  if (!r){ r = {visible:!visIO, init:!visIO, cbs:new Set()}; visMap.set(node, r); if (visIO) visIO.observe(node); }
  r.cbs.add(cb);
  if (r.init) cb(r.visible);
  return () => { r.cbs.delete(cb); if (!r.cbs.size){ if (visIO) visIO.unobserve(node); visMap.delete(node); } };
}
/* rAF loop that only ticks while its host is on screen and the tab is visible */
function loop(host, fn){
  let raf = 0, last = 0, visible = false, running = true, dead = false;
  const frame = ts => { raf = 0; if (dead) return; const dt = last ? Math.min(0.1, (ts-last)/1000) : 0; last = ts; try { fn(dt, ts/1000); } catch(e){ console.error('[SDA] loop', e); running = false; } schedule(); };
  const schedule = () => { if (!raf && running && visible && !document.hidden && !dead) raf = requestAnimationFrame(frame); };
  const unwatch = watchVisible(host, v => { visible = v; if (v){ last = 0; schedule(); } });
  const onVis = () => { last = 0; schedule(); };
  document.addEventListener('visibilitychange', onVis);
  const ctl = {
    pause(){ running = false; if (raf){ cancelAnimationFrame(raf); raf = 0; } },
    resume(){ if (!running){ running = true; last = 0; } schedule(); },
    get visible(){ return visible; },
    destroy(){ dead = true; if (raf) cancelAnimationFrame(raf); unwatch(); document.removeEventListener('visibilitychange', onVis); }
  };
  onDispose(() => ctl.destroy());
  return ctl;
}

/* ---------------- syntax highlighting (hand-rolled) ---------------- */
const KW = {
  js:'abstract as async await break case catch class const continue debugger default delete do else enum export extends false finally for from function get if implements import in instanceof interface let new null of private protected public readonly return set static super switch this throw true try type typeof undefined var void while yield number string boolean any unknown never',
  sql:'select from where insert into values update set delete create table index unique primary key foreign references on join left right inner outer group by order limit offset having and or not null as begin commit rollback transaction isolation level read committed repeatable serializable for share returning default int bigint varchar text timestamp timestamptz boolean numeric serial bigserial if exists in is distinct count sum avg max min case when then else end constraint check uuid now interval desc asc with',
  bash:'docker compose run up down exec cd export echo curl if then fi for do done in npm bun npx kubectl apply get sudo',
  yaml:'true false null', json:'true false null', http:'GET POST PUT PATCH DELETE HTTP', py:'def return if else elif for while in import from as class None True False and or not lambda with yield try except finally raise pass'
};
const RX = {
  js:/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?n?\b)|([A-Za-z_$][\w$]*)/g,
  sql:/(--[^\n]*)|('(?:''|[^'])*'|"[^"\n]*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)/g,
  hash:/(#[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w-]*)/g,
  plain:/(\b\B)|("(?:\\.|[^"\\\n])*")|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w-]*)/g
};
function highlight(src, lang){
  lang = String(lang || '').toLowerCase();
  if (['ts','typescript','javascript','tsx','jsx','node'].includes(lang)) lang = 'js';
  if (['sh','shell','zsh','console'].includes(lang)) lang = 'bash';
  if (lang === 'yml' || lang === 'dockerfile') lang = 'yaml';
  if (lang === 'python') lang = 'py';
  const rx = lang === 'js' ? RX.js : lang === 'sql' ? RX.sql : (lang === 'bash' || lang === 'yaml' || lang === 'py') ? RX.hash : RX.plain;
  const kws = new Set((KW[lang] || '').split(' ').filter(Boolean));
  const ci = lang === 'sql';
  let out = '', last = 0, m; rx.lastIndex = 0;
  while ((m = rx.exec(src))){
    if (m[0].length === 0){ rx.lastIndex++; continue; }
    if (m.index > last) out += `<span class="tk-p">${esc(src.slice(last, m.index))}</span>`;
    if (m[1]) out += `<span class="tk-c">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="tk-s">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="tk-n">${esc(m[3])}</span>`;
    else {
      const w = m[4], lw = ci ? w.toLowerCase() : w;
      if (kws.has(lw)) out += `<span class="tk-k">${esc(w)}</span>`;
      else if (src[rx.lastIndex] === '(') out += `<span class="tk-f">${esc(w)}</span>`;
      else if (lang === 'js' && /^[A-Z]/.test(w)) out += `<span class="tk-t">${esc(w)}</span>`;
      else out += esc(w);
    }
    last = rx.lastIndex;
  }
  if (last < src.length) out += `<span class="tk-p">${esc(src.slice(last))}</span>`;
  return out;
}

/* ---------------- content helpers for authors ---------------- */
const TIER_LABEL = {confirmed:'Publicly confirmed', inference:'Reasonable inference', educational:'Simplified educational design'};
const h = {
  code:(lang, src, title) => `<div class="code"><div class="code-h"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="t">${esc(title || lang)}</span><button type="button" class="copy-btn" data-copy aria-label="Copy code to clipboard">Copy</button></div><pre tabindex="0"><code>${highlight(dedent(src), lang)}</code></pre></div>`,
  callout:(kind, title, body) => `<div class="callout ${kind}"><b class="ct">${title}</b>${body}</div>`,
  deep:html => `<div class="deep-only">${html}</div>`,
  simple:html => `<div class="simple-only">${html}</div>`,
  tier:t => `<span class="tier ${t}">${TIER_LABEL[t] || esc(t)}</span>`,
  table:(head, rows, num) => `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head.map((x,i) => `<th${num && num.includes(i) ? ' class="num"' : ''}>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c,i) => `<td${num && num.includes(i) ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
  math:s => `<div class="math">${esc(dedent(s))}</div>`,
  list:items => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`
};
SDA.TIER_LABEL = TIER_LABEL;

/* ---------------- glossary ---------------- */
let glossRx = null, glossLookup = null, glossDirty = true;
function addTerm(t){
  if (!t || !t.term || !t.def) throw new Error('glossary term needs term + def');
  const id = slug(t.term); const prev = SDA.glossary.get(id);
  SDA.glossary.set(id, Object.assign({}, prev || {}, t, {id})); glossDirty = true;
}
function buildGlossRx(){
  const pairs = [];
  for (const t of SDA.glossary.values()) [t.term, ...(t.aka || [])].forEach(w => { if (w && w.length >= 2) pairs.push([w, t.id]); });
  pairs.sort((a,b) => b[0].length - a[0].length);
  glossLookup = new Map(); pairs.forEach(([w,id]) => { const k = w.toLowerCase(); if (!glossLookup.has(k)) glossLookup.set(k, id); });
  const alt = pairs.map(([w]) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  glossRx = null;
  if (alt){ try { glossRx = new RegExp('(?<![\\w-])(' + alt + ')(?![\\w-])', 'gi'); } catch(e){ glossRx = new RegExp('\\b(' + alt + ')\\b', 'gi'); } }
  glossDirty = false;
}
const GLOSS_SKIP = 'code,pre,a,button,h1,h2,h3,h4,h5,label,input,textarea,select,svg,kbd,.no-gloss,.gl-term,.chip,.tier,.code,.math,.metric,.diagram,.stepper,.pg-host,.quiz,.lab,.tabs,.seg';
function glossify(root){
  if (glossDirty) buildGlossRx();
  if (!glossRx || !root) return;
  const used = new Set(); let count = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode(n){ if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT; const p = n.parentElement; if (!p || p.closest(GLOSS_SKIP)) return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_ACCEPT; } });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes){
    if (count >= 80) break;
    const text = node.nodeValue; glossRx.lastIndex = 0;
    let m, lastI = 0, frag = null;
    while ((m = glossRx.exec(text))){
      const id = glossLookup.get(m[1].toLowerCase());
      if (!id || used.has(id) || used.has('pg:' + id)) continue;
      used.add(id); count++;
      frag = frag || document.createDocumentFragment();
      frag.append(text.slice(lastI, m.index));
      const b = document.createElement('span'); b.className = 'gl-term'; b.tabIndex = 0; b.setAttribute('role', 'button'); b.dataset.term = id; b.textContent = m[1];
      b.setAttribute('aria-label', m[1] + ' — show definition');
      frag.append(b); lastI = m.index + m[1].length;
    }
    if (frag){ frag.append(text.slice(lastI)); node.replaceWith(frag); }
  }
}

/* ---------------- registry ---------------- */
function report(def, e){ SDA.errors.push({id:def && (def.id || def.kind), error:e}); console.error('[SDA] failed to register', def && (def.id || def.kind), e); }
const registrars = {}; const pending = [];
let refreshT = 0;
SDA.addKind = function(kind, fn){
  registrars[kind] = fn;
  const keep = [];
  pending.splice(0).forEach(d => { if ((d.kind || 'module') === kind){ try { fn(d); } catch(e){ report(d, e); } } else keep.push(d); });
  pending.push(...keep);
};
SDA.register = function(def){
  try {
    if (!def || typeof def !== 'object') throw new Error('register() expects an object');
    const kind = def.kind || 'module'; const fn = registrars[kind];
    if (!fn){ pending.push(def); return; }
    fn(def);
  } catch(e){ report(def, e); return; }
  if (SDA.booted){ clearTimeout(refreshT); refreshT = setTimeout(() => SDA.refresh && SDA.refresh(), 60); }
};
function need(o, ...keys){ for (const k of keys) if (o[k] == null) throw new Error(`"${o.id || o.kind}" is missing "${k}"`); }
SDA.addKind('module', m => {
  need(m, 'id', 'title', 'level', 'lessons');
  m.lessons.forEach((l, i) => { need(l, 'id', 'title'); l.module = m.id; l.index = i; SDA.lessons.set(l.id, l); });
  const i = SDA.modules.findIndex(x => x.id === m.id); if (i >= 0) SDA.modules[i] = m; else SDA.modules.push(m);
  SDA.modules.sort((a,b) => (a.order || 999) - (b.order || 999));
  SDA.modById.set(m.id, m);
  (m.glossary || []).forEach(t => { try { addTerm(Object.assign({module:m.id}, t)); } catch(e){ report(t, e); } });
});
SDA.addKind('playground', p => { need(p, 'id', 'title', 'mount'); SDA.playgrounds.set(p.id, p); });
SDA.addKind('lab', l => { need(l, 'id', 'title', 'code'); SDA.labs.set(l.id, l); });
SDA.addKind('glossary', g => { (g.terms || []).forEach(t => { try { addTerm(Object.assign(g.module ? {module:g.module} : {}, t)); } catch(e){ report(t, e); } }); });
SDA.addKind('page', p => { need(p, 'id', 'title', 'render'); SDA.pages.set(p.id, p); });
SDA.addKind('nav', n => { need(n, 'label', 'href'); SDA.nav = SDA.nav.filter(x => x.href !== n.href); SDA.nav.push(n); SDA.nav.sort((a,b) => (a.order || 99) - (b.order || 99)); });
SDA.addKind('extend', x => { if (typeof x.install !== 'function') throw new Error('extend needs install(SDA)'); x.install(SDA); });

/* ---------------- reveal on scroll (IntersectionObserver, never scroll events) ---------------- */
const revIO = ('IntersectionObserver' in window) ? new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting){ en.target.classList.add('in'); revIO.unobserve(en.target); } }), {rootMargin:'0px 0px -6% 0px', threshold:0.04}) : null;
function revealScan(root){ $$('.reveal:not(.in)', root || document).forEach((e, i) => { if (!revIO || SDA.reduced) e.classList.add('in'); else { e.style.transitionDelay = (i % 5) * 55 + 'ms'; revIO.observe(e); } }); }
function countUp(node, to, dur){
  const fmt = v => Math.round(v).toLocaleString();
  if (SDA.reduced){ node.textContent = fmt(to); return; }
  let started = false;
  const un = watchVisible(node, v => {
    if (!v || started) return; started = true;
    const t0 = performance.now(), D = dur || 1400;
    const f = now => { const p = clamp((now - t0) / D, 0, 1); node.textContent = fmt(to * ease.out(p)); if (p < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
    setTimeout(un, 0);
  });
}

/* ---------------- form + UI builders ---------------- */
function slider(o){
  const id = 'sl' + (++uid);
  const out = el('output', {for:id});
  const inp = el('input', {type:'range', id, min:o.min, max:o.max, step:o.step || 1, value:o.value, 'aria-label':o.label});
  const fmt = o.fmt || (v => v);
  const paint = () => { const p = (inp.value - o.min) / (o.max - o.min) * 100; inp.style.setProperty('--p', p + '%'); out.textContent = fmt(+inp.value); };
  inp.addEventListener('input', () => { paint(); if (o.onInput) o.onInput(+inp.value); });
  paint();
  return { el:el('label', {class:'field'}, el('span', null, o.label, out), inp), input:inp, get value(){ return +inp.value; }, set(v){ inp.value = v; paint(); } };
}
function select(o){
  const s = el('select', {class:'input', 'aria-label':o.label});
  o.options.forEach(op => { const [v,t] = Array.isArray(op) ? op : [op, op]; s.append(el('option', {value:v}, t)); });
  if (o.value != null) s.value = o.value;
  s.addEventListener('change', () => o.onChange && o.onChange(s.value));
  return { el:el('label', {class:'field'}, el('span', null, o.label), s), input:s, get value(){ return s.value; }, set(v){ s.value = v; } };
}
function toggle(o){
  const i = el('input', {type:'checkbox', role:'switch'}); i.checked = !!o.checked;
  i.addEventListener('change', () => o.onChange && o.onChange(i.checked));
  return { el:el('label', {class:'toggle'}, i, o.label), input:i, get value(){ return i.checked; }, set(v){ i.checked = !!v; } };
}
function button(label, onClick, cls){ const b = el('button', {type:'button', class:'btn ' + (cls || '')}); b.innerHTML = label; if (onClick) b.addEventListener('click', onClick); return b; }
function metrics(host, defs){
  const box = el('div', {class:'metrics'}); const map = {};
  const stateOf = (d, v) => { if (d.bad == null && d.warn == null) return ''; const hi = d.dir !== 'down'; if (d.bad != null && (hi ? v >= d.bad : v <= d.bad)) return 'bad'; if (d.warn != null && (hi ? v >= d.warn : v <= d.warn)) return 'warn'; return ''; };
  const paint = (m, v) => {
    const d = m.d; m.shown = v;
    m.mv.innerHTML = esc(typeof v === 'number' ? (d.fmt || fmtNum)(v) : v) + (d.unit ? `<small>${esc(d.unit)}</small>` : '');
    if (m.bar && typeof v === 'number') m.bar.style.width = clamp(v / d.max, 0, 1) * 100 + '%';
  };
  defs.forEach(d => {
    const mv = el('div', {class:'mv'}); const bar = d.max != null ? el('i') : null;
    const card = el('div', {class:'metric'}, el('div', {class:'ml'}, d.label), mv, bar ? el('div', {class:'mbar'}, bar) : null);
    if (d.title) card.title = d.title;
    box.append(card); map[d.id] = {d, card, mv, bar, shown:0, raf:0};
    paint(map[d.id], d.value != null ? d.value : 0);
  });
  if (host) host.append(box);
  return {
    el:box,
    set(id, v, state){
      const m = map[id]; if (!m) return;
      const st = state != null ? state : (typeof v === 'number' ? stateOf(m.d, v) : '');
      m.card.classList.toggle('warn', st === 'warn'); m.card.classList.toggle('bad', st === 'bad');
      if (typeof v !== 'number' || SDA.reduced || m.d.instant || typeof m.shown !== 'number'){ paint(m, v); return; }
      cancelAnimationFrame(m.raf); const from = m.shown, t0 = performance.now();
      const f = now => { const p = clamp((now - t0) / 420, 0, 1); paint(m, p < 1 ? lerp(from, v, ease.out(p)) : v); if (p < 1) m.raf = requestAnimationFrame(f); };
      m.raf = requestAnimationFrame(f);
    }
  };
}

/* ---------------- diagram engine ---------------- */
const TYPES = {
  client:{label:'Client', icon:'💻'}, lb:{label:'Load balancer', icon:'⚖️'}, service:{label:'Service', icon:'⚙️'}, cache:{label:'Cache', icon:'⚡'},
  db:{label:'Database', icon:'🗄️'}, queue:{label:'Queue', icon:'📨'}, cdn:{label:'CDN / Edge', icon:'🌐'}, ext:{label:'External service', icon:'🔌'}
};
SDA.TYPES = TYPES;
function legend(types){
  const box = el('div', {class:'legend', role:'list', 'aria-label':'Diagram legend'});
  (types || Object.keys(TYPES)).forEach(t => { if (TYPES[t]) box.append(el('span', {class:'lg t-' + t, role:'listitem'}, el('span', {class:'sw ' + t, 'aria-hidden':'true'}), TYPES[t].label)); });
  return box;
}
function speedSelect(onChange){
  const s = el('select', {class:'input', 'aria-label':'Animation speed', style:{width:'auto', padding:'4px 8px', fontSize:'13px', minHeight:'32px'}});
  [['0.5','0.5×'],['1','1×'],['1.5','1.5×'],['2','2×'],['3','3×']].forEach(([v,t]) => s.append(el('option', {value:v}, t)));
  s.value = '1'; s.addEventListener('change', () => onChange(+s.value)); return s;
}
/* node text auto-fit: shrink a label/subtitle's font just enough to stay inside its node */
const textProbe = (() => { let g = null; return (cls, s) => {
  if (!g){ const svg = sv('svg', {'aria-hidden':'true', width:10, height:10}); svg.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none'; g = sv('g', {class:'dg-node'}); svg.append(g); document.body.append(svg); }
  const t = sv('text', {class:cls}); t.textContent = s; g.append(t); let w = 0, fs = 0;
  try { w = t.getComputedTextLength(); fs = parseFloat(getComputedStyle(t).fontSize) || 0; } catch(e){}
  t.remove(); return {w, fs}; }; })();
function fitText(t, avail){
  t.style.fontSize = ''; t.dataset.fit = avail; if (!t.textContent || !(avail > 0)) return;
  const m = textProbe(t.getAttribute('class'), t.textContent); if (m.w > avail && m.fs) t.style.fontSize = (m.fs * avail / m.w).toFixed(2) + 'px';
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => document.querySelectorAll('.dg-node text[data-fit]').forEach(t => fitText(t, +t.dataset.fit)));
SDA.fitText = fitText;
class Diagram {
  constructor(host, spec){
    this.spec = spec || {}; this.uid = 'dg' + (++uid); this.speed = 1; this.i = -1; this.t = 0; this.stepTotal = 0;
    this.mode = 'idle'; this.ended = false; this.nodes = new Map(); this.edges = []; this.cur = []; this.adhoc = []; this.handlers = {};
    this.build(host);
    this.loop = loop(this.root, dt => this.tick(dt)); this.loop.pause();
    const steps = this.spec.steps || [];
    if (steps.length){
      this.applyStep(-1);
      if (this.spec.autoplay !== false && !SDA.reduced){
        let started = false;
        onDispose(watchVisible(this.root, v => { if (v && !started){ started = true; setTimeout(() => { if (this.i < 0 && this.mode === 'idle') this.play(); }, 400); } }));
      }
    }
  }
  on(ev, fn){ (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
  emit(ev, ...a){ (this.handlers[ev] || []).forEach(f => { try { f(...a); } catch(e){ console.error(e); } }); }
  build(host){
    const s = this.spec, W = s.w || 760, H = s.h || 300;
    const fig = el('figure', {class:'diagram', style:{margin:'18px 0'}});
    if (s.title) fig.append(el('div', {class:'dg-head'}, el('h4', null, s.title), s.badge ? el('span', {class:'chip'}, s.badge) : null));
    const stage = el('div', {class:'dg-stage'});
    const svg = sv('svg', {viewBox:`0 0 ${W} ${H}`, role:s.clickable ? 'group' : 'img', 'aria-labelledby':this.uid + '-t'});
    if (s.minW) svg.style.minWidth = s.minW + 'px';
    const ttl = sv('title', {id:this.uid + '-t'}); ttl.textContent = (s.title || 'System diagram') + (s.alt ? ' — ' + s.alt : ''); svg.append(ttl);
    const defs = sv('defs'); const fl = sv('filter', {id:this.uid + '-glow', x:'-100%', y:'-100%', width:'300%', height:'300%'});
    fl.append(sv('feGaussianBlur', {stdDeviation:'2.5', result:'b'})); const mg = sv('feMerge'); mg.append(sv('feMergeNode', {in:'b'}), sv('feMergeNode', {in:'SourceGraphic'})); fl.append(mg); defs.append(fl); svg.append(defs);
    this.gE = sv('g'); this.gL = sv('g'); this.gN = sv('g'); this.gP = sv('g', {'aria-hidden':'true'}); svg.append(this.gE, this.gL, this.gN, this.gP);
    this.svg = svg; this.root = fig;
    (s.nodes || []).forEach(n => this.addNode(n, false));
    (s.edges || []).forEach(e => this.addEdge(e));
    stage.append(svg); fig.append(stage);
    if ((s.steps || []).length){ this.capN = el('span', {class:'stepn'}); this.capT = el('div'); fig.append(el('div', {class:'dg-cap', 'aria-live':'polite'}, this.capN, this.capT)); }
    else if (s.caption != null){ this.capT = el('div', {html:s.caption}); fig.append(el('div', {class:'dg-cap', 'aria-live':'polite'}, this.capT)); }
    const foot = el('div', {class:'dg-foot'});
    const used = [...new Set((s.nodes || []).map(n => TYPES[n.type] ? n.type : 'service'))];
    foot.append(legend(s.legend || used));
    if ((s.steps || []).length) foot.append(this.buildControls());
    if (s.extraControls) foot.append(s.extraControls);
    fig.append(foot);
    host.append(fig);
    onDispose(() => this.destroy());
  }
  buildControls(){
    const c = el('div', {class:'controls'});
    this.bPlay = button('▶ Play', () => this.mode === 'play' ? this.pause() : this.play(), 'sm primary');
    this.bStep = button('⏭ Step', () => this.step(), 'sm'); this.bStep.setAttribute('aria-label', 'Next step');
    this.bReset = button('↺ Reset', () => this.reset(), 'sm ghost'); this.bReset.setAttribute('aria-label', 'Reset animation');
    this.counter = el('span', {class:'chip mono', 'aria-hidden':'true'});
    c.append(this.bPlay, this.bStep, this.bReset, speedSelect(v => this.speed = v), this.counter);
    return c;
  }
  geo(a, b, curve){ if (!curve) return {a:{x:a.x, y:a.y}, b:{x:b.x, y:b.y}, c:null}; const dx = b.x - a.x, dy = b.y - a.y; return {a:{x:a.x, y:a.y}, b:{x:b.x, y:b.y}, c:{x:(a.x+b.x)/2 - dy*curve, y:(a.y+b.y)/2 + dx*curve}}; }
  pathD(G){ return G.c ? `M${G.a.x} ${G.a.y} Q${G.c.x} ${G.c.y} ${G.b.x} ${G.b.y}` : `M${G.a.x} ${G.a.y} L${G.b.x} ${G.b.y}`; }
  pt(G, t){ if (!G.c) return {x:lerp(G.a.x, G.b.x, t), y:lerp(G.a.y, G.b.y, t)}; const u = 1 - t; return {x:u*u*G.a.x + 2*u*t*G.c.x + t*t*G.b.x, y:u*u*G.a.y + 2*u*t*G.c.y + t*t*G.b.y}; }
  addNode(n, animate=true){
    const type = TYPES[n.type] ? n.type : 'service';
    const w = n.w || this.spec.nodeW || 124, hgt = n.h || this.spec.nodeH || 50, hw = w/2, hh = hgt/2;
    const g = sv('g', {class:`dg-node t-${type}`, transform:`translate(${n.x} ${n.y})`, 'data-id':n.id});
    const inner = sv('g', {class:'dg-inner'});
    let shape;
    if (type === 'db'){
      const e = 7;
      shape = sv('path', {class:'shape', d:`M${-hw} ${-hh+e} A${hw} ${e} 0 0 1 ${hw} ${-hh+e} L${hw} ${hh-e} A${hw} ${e} 0 0 1 ${-hw} ${hh-e} Z`});
      inner.append(shape, sv('path', {class:'rim', d:`M${-hw} ${-hh+e} A${hw} ${e} 0 0 0 ${hw} ${-hh+e}`}));
    } else if (type === 'lb'){
      const c = 12; shape = sv('path', {class:'shape', d:`M${-hw+c} ${-hh} H${hw-c} L${hw} 0 L${hw-c} ${hh} H${-hw+c} L${-hw} 0 Z`}); inner.append(shape);
    } else {
      const rx = type === 'cdn' ? hh : type === 'client' ? 12 : type === 'cache' ? 4 : type === 'queue' ? 6 : 10;
      shape = sv('rect', {class:'shape', x:-hw, y:-hh, width:w, height:hgt, rx}); if (type === 'ext') shape.setAttribute('stroke-dasharray', '5 4');
      inner.append(shape);
      if (type === 'queue') for (let k = 0; k < 3; k++) inner.append(sv('line', {class:'rim', x1:hw-9-k*6, y1:-hh+9, x2:hw-9-k*6, y2:hh-9}));
    }
    const tint = shape.cloneNode(); tint.setAttribute('class', 'tint'); tint.removeAttribute('stroke-dasharray'); inner.insertBefore(tint, shape.nextSibling);
    const icon = n.icon !== undefined ? n.icon : TYPES[type].icon;
    const lines = String(n.label || n.id).split('\n');
    const tx = icon ? 9 : 0;
    if (icon){ const ic = sv('text', {class:'ico', x:-hw+16, y:5, 'text-anchor':'middle'}); ic.textContent = icon; inner.append(ic); }
    const total = lines.length + (n.sub ? 1 : 0), lh = 13.5, y0 = -(total-1)*lh/2 + 4.5;
    const avail = !icon ? w - 16 : type === 'queue' ? w - 66 : type === 'lb' ? w - 40 : w - 34;
    lines.forEach((ln, k) => { const t = sv('text', {class:'lbl', x:tx, y:y0 + k*lh, 'text-anchor':'middle'}); t.textContent = ln; inner.append(t); fitText(t, avail); });
    const subEl = sv('text', {class:'sub', x:tx, y:y0 + lines.length*lh, 'text-anchor':'middle'}); subEl.textContent = n.sub || ''; inner.append(subEl); fitText(subEl, avail);
    inner.append(sv('path', {class:'xmark', d:`M${hw-15} ${-hh+6} l9 9 m0 -9 l-9 9`}));
    const tt = sv('title'); tt.textContent = lines.join(' ') + ' (' + TYPES[type].label + ')'; g.append(tt);
    g.append(inner); this.gN.append(g);
    const rec = {n:Object.assign({}, n, {type}), g, inner, subEl, avail, status:'ok'};
    this.nodes.set(n.id, rec);
    if (this.spec.clickable || n.click){
      g.classList.add('clickable'); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button'); g.setAttribute('aria-label', tt.textContent);
      const fire = () => this.emit('node', n.id, rec);
      g.addEventListener('click', fire);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fire(); } });
    }
    if (n.hidden) g.classList.add('hidden');
    if (n.status) this._setStatus(n.id, n.status);
    if (animate && !SDA.reduced){ g.classList.add('enter'); setTimeout(() => g.classList.remove('enter'), 800); }
    return rec;
  }
  addEdge(e){
    const a = this.nodes.get(e.from), b = this.nodes.get(e.to);
    if (!a || !b){ console.warn('[SDA] edge references unknown node', e); return null; }
    const G = this.geo(a.n, b.n, e.curve || 0);
    const p = sv('path', {class:'dg-edge' + (e.dashed ? ' dashed' : ''), d:this.pathD(G)}); this.gE.append(p);
    let lab = null;
    if (e.label){ const m = this.pt(G, .5); lab = sv('text', {class:'dg-elabel', x:m.x, y:m.y - 7, 'text-anchor':'middle'}); lab.textContent = e.label; this.gL.append(lab); }
    const rec = Object.assign({}, e, {G, path:p, lab, n:0, hidden0:!!e.hidden}); this.edges.push(rec); this.updateEdges(); return rec;
  }
  findEdge(a, b){ for (const e of this.edges){ if (e.from === a && e.to === b) return {e, rev:false}; if (e.from === b && e.to === a) return {e, rev:true}; } return null; }
  moveNode(id, x, y){
    const r = this.nodes.get(id); if (!r) return; r.n.x = x; r.n.y = y; r.g.setAttribute('transform', `translate(${x} ${y})`);
    this.edges.forEach(e => { if (e.from === id || e.to === id){ const A = this.nodes.get(e.from).n, B = this.nodes.get(e.to).n; e.G = this.geo(A, B, e.curve || 0); e.path.setAttribute('d', this.pathD(e.G)); if (e.lab){ const m = this.pt(e.G, .5); e.lab.setAttribute('x', m.x); e.lab.setAttribute('y', m.y - 7); } } });
  }
  _setStatus(id, s){ const r = this.nodes.get(id); if (!r) return; r.status = s || 'ok'; r.g.classList.toggle('down', s === 'down'); r.g.classList.toggle('hot', s === 'hot'); }
  _setHidden(id, hid, animate){ const r = this.nodes.get(id); if (!r) return; const was = r.g.classList.contains('hidden'); r.g.classList.toggle('hidden', !!hid); if (was && !hid && animate && !SDA.reduced){ r.g.classList.add('enter'); setTimeout(() => r.g.classList.remove('enter'), 800); } }
  updateEdges(){
    this.edges.forEach(e => {
      const A = this.nodes.get(e.from), B = this.nodes.get(e.to);
      const hid = A.g.classList.contains('hidden') || B.g.classList.contains('hidden') || !!e.hidden;
      e.path.classList.toggle('hidden', hid); if (e.lab) e.lab.classList.toggle('hidden', hid);
      e.path.classList.toggle('dead', A.status === 'down' || B.status === 'down');
    });
  }
  setStatus(id, s){ this._setStatus(id, s); this.updateEdges(); }
  status(id){ const r = this.nodes.get(id); return r ? r.status : null; }
  setHidden(id, hid){ this._setHidden(id, hid, true); this.updateEdges(); }
  setEdgeHidden(from, to, hid){ const f = this.findEdge(from, to); if (f){ f.e.hidden = !!hid; this.updateEdges(); } }
  setSub(id, txt){ const r = this.nodes.get(id); if (r && r.subEl.textContent !== txt){ r.subEl.textContent = txt; fitText(r.subEl, r.avail); } }
  highlight(ids){ const s = new Set(ids || []); for (const [id, r] of this.nodes) r.g.classList.toggle('hl', s.has(id)); }
  setCaption(html){ if (this.capT) this.capT.innerHTML = html; }
  ping(id){ const r = this.nodes.get(id); if (!r) return; r.g.classList.add('ping'); setTimeout(() => r.g.classList.remove('ping'), 380); }
  spawn(from, to, label, color){
    const fa = this.nodes.get(from), fb = this.nodes.get(to); if (!fa || !fb) return null;
    const f = this.findEdge(from, to); const G = f ? f.e.G : this.geo(fa.n, fb.n, 0); const rev = f ? f.rev : false;
    const col = color || `var(--c-${fa.n.type})`;
    const g = sv('g', {class:'dg-packet'});
    const trail = [0.34, 0.2, 0.1].map((o, k) => { const c = sv('circle', {r:4 - k}); c.style.fill = col; c.style.opacity = o; g.append(c); return c; });
    const head = sv('g'); const halo = sv('circle', {class:'halo', r:10}); halo.style.fill = col;
    const core = sv('circle', {r:5.5, filter:`url(#${this.uid}-glow)`}); core.style.fill = col; core.style.stroke = '#fff'; core.style.strokeWidth = '1.2';
    head.append(halo, core);
    if (label){ const t = sv('text', {y:-12, 'text-anchor':'middle'}); t.textContent = label; head.append(t); }
    g.append(head); this.gP.append(g);
    if (f){ f.e.n++; f.e.path.classList.add('active'); }
    return {g, head, trail, G, rev, f};
  }
  place(pk, p){
    const e = ease.inOut(clamp(p, 0, 1)); const at = q => this.pt(pk.G, pk.rev ? 1 - q : q);
    const P = at(e); pk.head.setAttribute('transform', `translate(${P.x} ${P.y})`);
    pk.trail.forEach((c, k) => { const Q = at(clamp(e - 0.045*(k+1), 0, 1)); c.setAttribute('cx', Q.x); c.setAttribute('cy', Q.y); });
  }
  kill(pk){ if (!pk) return; pk.g.remove(); if (pk.f){ pk.f.e.n = Math.max(0, pk.f.e.n - 1); if (!pk.f.e.n) pk.f.e.path.classList.remove('active'); } }
  stepDur(st){ const hop = st.dur || 950, n = (st.flow || []).length; return (n ? (st.parallel ? hop : hop*n) : 0) + (st.dwell != null ? st.dwell : (n ? 700 : 1600)); }
  applyStep(i){
    const steps = this.spec.steps || [];
    this.cur.forEach(c => this.kill(c.pk)); this.cur = [];
    this.edges.forEach(e => { e.n = 0; e.path.classList.remove('active'); });
    const status = {}, hidden = {};
    for (const [id, r] of this.nodes){ status[id] = r.n.status || 'ok'; hidden[id] = !!r.n.hidden; }
    for (let k = 0; k <= i; k++){ const st = steps[k]; if (st.status) Object.assign(status, st.status); (st.reveal || []).forEach(id => hidden[id] = false); (st.hide || []).forEach(id => hidden[id] = true); }
    const subs = {}; for (const [id, r] of this.nodes) subs[id] = r.n.sub || '';
    this.edges.forEach(e => { e.hidden = e.hidden0; });
    for (let k = 0; k <= i; k++){
      const st = steps[k]; if (st.sub) Object.assign(subs, st.sub);
      (st.hideEdges || []).forEach(([a, b]) => { const f = this.findEdge(a, b); if (f) f.e.hidden = true; });
      (st.showEdges || []).forEach(([a, b]) => { const f = this.findEdge(a, b); if (f) f.e.hidden = false; });
    }
    const now = new Set(i >= 0 ? (steps[i].reveal || []) : []);
    for (const [id, r] of this.nodes){ this._setStatus(id, status[id]); this._setHidden(id, hidden[id], now.has(id)); if (r.subEl.textContent !== subs[id]){ r.subEl.textContent = subs[id]; fitText(r.subEl, r.avail); } }
    this.updateEdges();
    this.highlight(i >= 0 ? steps[i].hl : []);
    this.i = i; this.t = 0; const st = steps[i];
    if (st){
      this.cur = (st.flow || []).map((hop, k) => ({h:hop, k, pk:null, done:false}));
      this.stepTotal = SDA.reduced ? 2600 : this.stepDur(st);
      if (SDA.reduced) this.cur.forEach(c => { const f = this.findEdge(c.h[0], c.h[1]); if (f) f.e.path.classList.add('active'); });
    } else this.stepTotal = 0;
    if (this.capT) this.capT.innerHTML = st ? st.note : (this.spec.intro || 'Press <b>Play</b> to animate, or <b>Step</b> to move one stage at a time.');
    this.syncUI(); this.emit('step', i, st);
  }
  tick(dt){
    const adv = dt * 1000 * this.speed, steps = this.spec.steps || [];
    if ((this.mode === 'play' || this.mode === 'step') && this.i >= 0){
      this.t += adv; const st = steps[this.i];
      if (!SDA.reduced){
        const hop = st.dur || 950;
        this.cur.forEach(c => {
          if (c.done) return;
          const p = (this.t - (st.parallel ? 0 : c.k*hop)) / hop; if (p < 0) return;
          if (!c.pk) c.pk = this.spawn(c.h[0], c.h[1], c.h[2], c.h[3]);
          if (!c.pk){ c.done = true; return; }
          if (p >= 1){ this.kill(c.pk); c.pk = null; c.done = true; this.ping(c.h[1]); } else this.place(c.pk, p);
        });
      }
      if (this.t >= this.stepTotal){
        if (this.mode === 'step'){ this.mode = 'idle'; this.syncUI(); }
        else if (this.i < steps.length - 1) this.applyStep(this.i + 1);
        else { this.mode = 'idle'; this.ended = true; this.syncUI(); this.emit('end'); }
      }
    }
    if (this.adhoc.length){
      for (const x of this.adhoc){
        x.t += adv;
        if (!x.pk) x.pk = this.spawn(x.a, x.b, x.label, x.color);
        if (!x.pk){ x.done = true; x.res(); continue; }
        const p = x.t / x.dur;
        if (p >= 1){ this.kill(x.pk); this.ping(x.b); x.done = true; x.res(); } else this.place(x.pk, p);
      }
      this.adhoc = this.adhoc.filter(x => !x.done);
    }
    if (this.mode !== 'play' && this.mode !== 'step' && !this.adhoc.length) this.loop.pause();
  }
  syncUI(){
    const n = (this.spec.steps || []).length;
    if (this.capN) this.capN.textContent = this.i < 0 ? 'Start' : `${this.i+1}/${n}`;
    if (!this.bPlay) return;
    const playing = this.mode === 'play';
    this.bPlay.innerHTML = playing ? '⏸ Pause' : (this.ended ? '↻ Replay' : '▶ Play');
    this.bPlay.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
    this.counter.textContent = `${Math.max(0, this.i+1)} / ${n}`;
  }
  play(){ const n = (this.spec.steps || []).length; if (!n) return; if (this.ended || this.i < 0){ this.ended = false; this.applyStep(0); } this.mode = 'play'; this.loop.resume(); this.syncUI(); }
  pause(){ if (this.mode === 'play'){ this.mode = 'idle'; this.syncUI(); } }
  step(){ const n = (this.spec.steps || []).length; if (!n) return; this.ended = false; const next = this.i + 1 >= n ? 0 : this.i + 1; this.applyStep(next); this.mode = SDA.reduced ? 'idle' : 'step'; if (!SDA.reduced) this.loop.resume(); this.syncUI(); }
  reset(){ this.mode = 'idle'; this.ended = false; this.adhoc.forEach(x => { this.kill(x.pk); x.res(); }); this.adhoc = []; this.applyStep(-1); }
  /* ad-hoc packets for simulations: d.flow([['a','b','GET'],['b','c']], {parallel, dur}) → Promise */
  flow(hops, opts){
    opts = opts || {}; const dur = opts.dur || 750;
    const run = hp => this._hop(hp[0], hp[1], hp[2], hp[3], dur);
    if (opts.parallel) return Promise.all(hops.map(run));
    return hops.reduce((p, hp) => p.then(() => run(hp)), Promise.resolve());
  }
  _hop(a, b, label, color, dur){
    return new Promise(res => {
      if (SDA.reduced){ const f = this.findEdge(a, b); if (f) f.e.path.classList.add('active'); setTimeout(() => { if (f && !f.e.n) f.e.path.classList.remove('active'); this.ping(b); res(); }, 260); return; }
      this.adhoc.push({a, b, label, color, dur, t:0, pk:null, res, done:false}); this.loop.resume();
    });
  }
  destroy(){ this.adhoc.forEach(x => x.res()); this.adhoc = []; }
}

/* ---------------- stepper: animated timeline of stages ---------------- */
function stepper(host, spec){
  const items = spec.items || []; let i = -1, mode = 'idle', t = 0, speed = 1, ended = false;
  const box = el('div', {class:'stepper'});
  if (spec.title) box.append(el('div', {class:'dg-head'}, el('h4', null, spec.title), spec.badge ? el('span', {class:'chip'}, spec.badge) : null));
  const track = el('div', {class:'st-track', role:'list'});
  const detail = el('div', {class:'st-detail', 'aria-live':'polite'});
  const counter = el('span', {class:'chip mono', 'aria-hidden':'true'});
  const cards = items.map((it, k) => {
    const c = el('button', {type:'button', class:'st-item', role:'listitem'});
    c.innerHTML = `<span class="stt"><i>${k+1}</i>${esc(it.title)}</span>${it.tag ? `<span class="sttag">${esc(it.tag)}</span>` : ''}`;
    c.addEventListener('click', () => { mode = 'idle'; ended = false; go(k); sync(); });
    track.append(c); return c;
  });
  function go(k){
    i = k; t = 0;
    cards.forEach((c, j) => { c.classList.toggle('done', j < k); c.classList.toggle('cur', j === k); c.setAttribute('aria-current', j === k ? 'step' : 'false'); });
    detail.innerHTML = k < 0 ? (spec.intro || 'Press <b>Play</b> to walk through every stage, or click any stage.') : items[k].text;
    counter.textContent = `${Math.max(0, k+1)} / ${items.length}`;
    if (spec.onStep) spec.onStep(k);
  }
  const bPlay = button('▶ Play', () => { if (mode === 'play'){ mode = 'idle'; } else { if (ended || i < 0){ ended = false; go(0); } mode = 'play'; lp.resume(); } sync(); }, 'sm primary');
  const sync = () => { bPlay.innerHTML = mode === 'play' ? '⏸ Pause' : (ended ? '↻ Replay' : '▶ Play'); bPlay.setAttribute('aria-label', mode === 'play' ? 'Pause' : 'Play'); };
  const bStep = button('⏭ Step', () => { mode = 'idle'; ended = false; go(i + 1 >= items.length ? 0 : i + 1); sync(); }, 'sm');
  const bReset = button('↺ Reset', () => { mode = 'idle'; ended = false; go(-1); sync(); }, 'sm ghost');
  const lp = loop(box, dt => {
    if (mode !== 'play'){ lp.pause(); return; }
    t += dt * 1000 * speed;
    if (t >= (spec.dwell || 2800)){ if (i < items.length - 1) go(i + 1); else { mode = 'idle'; ended = true; sync(); } }
  });
  lp.pause();
  box.append(track, detail, el('div', {class:'dg-foot'}, el('span', {class:'lab-hint'}, spec.hint || 'Click any stage to jump to it.'), el('div', {class:'controls'}, bPlay, bStep, bReset, speedSelect(v => speed = v), counter)));
  host.append(box); go(-1);
  if (spec.autoplay !== false && !SDA.reduced){ let started = false; onDispose(watchVisible(box, v => { if (v && !started){ started = true; setTimeout(() => { if (i < 0 && mode === 'idle'){ go(0); mode = 'play'; lp.resume(); sync(); } }, 500); } })); }
  return {go, el:box};
}

/* ---------------- quiz engine ---------------- */
function quiz(host, qs, opts){
  opts = opts || {}; const id = opts.id; const box = el('div', {class:'quiz'}); host.append(box);
  function render(){
    box.innerHTML = '';
    const mcqs = qs.filter(q => q.type !== 'scenario'); let answered = 0, correct = 0;
    const scoreTxt = el('span', {class:'mono', style:{fontSize:'13px'}}); const bar = el('i');
    const best = id && Store.data.quiz[id];
    box.append(el('div', {class:'q-score'}, el('b', null, '🎯 Score'), scoreTxt, el('div', {class:'progress'}, bar), best ? el('span', {class:'chip'}, `Best: ${best.score}/${best.total}`) : null, button('↺ Retry', render, 'sm ghost')));
    const upd = () => {
      scoreTxt.textContent = `${correct}/${mcqs.length} correct · ${answered}/${mcqs.length} answered`;
      bar.style.width = (mcqs.length ? answered / mcqs.length * 100 : 0) + '%';
      if (answered === mcqs.length && mcqs.length){
        if (id){ const prev = Store.data.quiz[id]; if (!prev || correct >= prev.score){ Store.data.quiz[id] = {score:correct, total:mcqs.length, at:Date.now()}; Store.save(); } }
        toast(correct === mcqs.length ? '🎉 Perfect score!' : `Quiz complete: ${correct}/${mcqs.length}`);
      }
    };
    qs.forEach((q, qi) => {
      const card = el('div', {class:'q-card'});
      card.append(el('div', {class:'qn'}, q.type === 'scenario' ? `Scenario ${qi+1}` : `Question ${qi+1}`));
      const qq = el('div', {class:'qq'}); qq.innerHTML = q.q; card.append(qq);
      if (q.type === 'scenario'){
        const ta = el('textarea', {class:'input', rows:3, placeholder:'Think first: jot your approach here (not graded)…', 'aria-label':'Your approach'});
        const ans = el('div', {class:'q-why ok', hidden:true}); ans.innerHTML = '<b>Expert walkthrough</b><div style="margin-top:6px">' + q.answer + '</div>';
        const b = button('Reveal expert answer', () => { ans.hidden = false; b.disabled = true; }, 'sm');
        card.append(ta, el('div', {class:'row', style:{marginTop:'10px'}}, b), ans);
      } else {
        const grp = el('div', {class:'q-opts', role:'group', 'aria-label':'Answer options'});
        const order = shuffle(q.options.map((_, k) => k));
        const btns = order.map((k, pos) => {
          const b = el('button', {type:'button', class:'q-opt', 'data-k':k});
          b.innerHTML = `<span class="k">${'ABCDEF'[pos]}</span><span>${q.options[k]}</span>`;
          b.addEventListener('click', () => {
            const ok = k === q.answer; answered++; if (ok) correct++;
            btns.forEach(x => { x.disabled = true; const kk = +x.dataset.k; if (kk === q.answer) x.classList.add('correct'); else if (x === b) x.classList.add('wrong'); else x.classList.add('dim'); });
            const why = el('div', {class:'q-why ' + (ok ? 'ok' : 'no')}); why.innerHTML = (ok ? '<b>✓ Correct.</b> ' : '<b>✗ Not quite.</b> ') + (q.why || '');
            card.append(why); upd();
          });
          grp.append(b); return b;
        });
        card.append(grp);
      }
      box.append(card);
    });
    upd();
  }
  render();
}

/* ---------------- flashcards ---------------- */
function flashcards(host, cards){
  if (!cards || !cards.length){ host.append(el('div', {class:'empty'}, 'No flashcards for this module yet.')); return; }
  let order = cards.map((_, i) => i), pos = 0; const known = new Set();
  const wrap = el('div', {class:'fc-wrap', tabindex:'-1'});
  const info = el('div', {class:'chip mono'});
  const front = el('span', {class:'fc-face front'}), back = el('span', {class:'fc-face back'});
  const card = el('button', {type:'button', class:'fc', 'aria-label':'Flashcard. Press to flip.'}, el('span', {class:'fc-inner'}, front, back));
  const show = () => { const c = cards[order[pos]]; card.classList.remove('flipped'); front.innerHTML = '<small>PROMPT</small><span>' + c.front + '</span>'; back.innerHTML = '<small>ANSWER</small><span>' + c.back + '</span>'; info.textContent = `Card ${pos+1} / ${order.length} · Known ${known.size}`; card.setAttribute('aria-pressed', 'false'); };
  const flip = () => { card.classList.toggle('flipped'); card.setAttribute('aria-pressed', String(card.classList.contains('flipped'))); };
  const go = d => { pos = (pos + d + order.length) % order.length; show(); };
  card.addEventListener('click', flip);
  wrap.addEventListener('keydown', e => { if (e.key === 'ArrowRight'){ go(1); } else if (e.key === 'ArrowLeft'){ go(-1); } });
  const ctr = el('div', {class:'controls', style:{justifyContent:'center'}},
    button('← Prev', () => go(-1), 'sm'), button('Flip', flip, 'sm'), button('Next →', () => go(1), 'sm'),
    button('✓ Knew it', () => { known.add(order[pos]); go(1); }, 'sm ok'),
    button('↺ Again later', () => { const x = order.splice(pos, 1)[0]; order.push(x); if (pos >= order.length) pos = 0; show(); }, 'sm'),
    button('🔀 Shuffle', () => { shuffle(order); pos = 0; show(); }, 'sm ghost'));
  wrap.append(info, card, ctr, el('div', {class:'lab-hint'}, 'Tip: click the card to flip · ← → to move'));
  host.append(wrap); show();
}

/* ---------------- tabs ---------------- */
function tabs(host, list, opts){
  opts = opts || {};
  const bar = el('div', {class:'tabs', role:'tablist'}); const panel = el('div', {role:'tabpanel', tabindex:'0'});
  let disp = null;
  const btns = list.map(t => { const b = el('button', {type:'button', role:'tab', 'aria-selected':'false', id:'tab-' + t.id}, t.label); b.addEventListener('click', () => sel(t.id, true)); bar.append(b); return b; });
  bar.addEventListener('keydown', e => {
    const k = btns.indexOf(document.activeElement); if (k < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft'){ e.preventDefault(); const n = (k + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length; btns[n].focus(); sel(list[n].id, true); }
  });
  function sel(id, user){
    const k = Math.max(0, list.findIndex(t => t.id === id)); const cur = list[k];
    btns.forEach((b, j) => { b.setAttribute('aria-selected', String(j === k)); b.tabIndex = j === k ? 0 : -1; });
    if (disp) disp(); panel.innerHTML = ''; panel.setAttribute('aria-labelledby', 'tab-' + cur.id);
    disp = withScope(() => { try { cur.render(panel); } catch(e){ console.error(e); panel.append(errCard('This tab failed to render', e)); } });
    revealScan(panel); $$('.prose', panel).forEach(p => glossify(p));
    if (opts.onSelect) opts.onSelect(cur.id, user);
  }
  host.append(bar, panel); sel(opts.initial || list[0].id, false);
  return {select:sel};
}

/* ---------------- code lab runner: Web Worker, sandboxed-iframe fallback ---------------- */
function __labPrelude(){
  const fmt = (v, depth, seen) => {
    depth = depth || 0; seen = seen || new WeakSet();
    if (typeof v === 'string') return depth ? JSON.stringify(v) : v;
    if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
    if (typeof v === 'bigint') return v + 'n';
    if (typeof v === 'symbol') return v.toString();
    if (v === null || typeof v !== 'object') return String(v);
    if (seen.has(v)) return '[Circular]'; seen.add(v);
    if (v instanceof Error) return v.stack || String(v);
    if (depth > 4) return Array.isArray(v) ? '[Array]' : '[Object]';
    if (Array.isArray(v)) return '[' + v.map(x => fmt(x, depth+1, seen)).join(', ') + ']';
    if (v instanceof Map) return 'Map(' + v.size + ') {' + Array.from(v).map(([k, x]) => fmt(k, depth+1, seen) + ' => ' + fmt(x, depth+1, seen)).join(', ') + '}';
    if (v instanceof Set) return 'Set(' + v.size + ') {' + Array.from(v).map(x => fmt(x, depth+1, seen)).join(', ') + '}';
    if (ArrayBuffer.isView(v)) return v.constructor.name + '[' + Array.from(v).join(', ') + ']';
    const name = v.constructor && v.constructor !== Object ? v.constructor.name + ' ' : '';
    return name + '{ ' + Object.keys(v).map(k => k + ': ' + fmt(v[k], depth+1, seen)).join(', ') + ' }';
  };
  let n = 0;
  const send = (level, args) => { if (++n > 500){ if (n === 501) postMessage({t:'log', level:'warn', v:'… output truncated after 500 lines'}); return; } postMessage({t:'log', level, v:args.map(a => fmt(a)).join(' ')}); };
  const timers = {};
  self.console = {
    log:(...a) => send('log', a), info:(...a) => send('log', a), debug:(...a) => send('log', a),
    warn:(...a) => send('warn', a), error:(...a) => send('err', a),
    assert:(c, ...a) => { if (!c) send('err', ['Assertion failed:', ...a]); },
    table:d => { try { send('log', [JSON.stringify(d, null, 2)]); } catch(e){ send('log', [d]); } },
    time:l => { timers[l || 'default'] = performance.now(); },
    timeEnd:l => { const k = l || 'default'; if (timers[k] != null) send('log', [k + ': ' + (performance.now() - timers[k]).toFixed(2) + ' ms']); }
  };
  self.check = (name, cond) => send(cond ? 'ok' : 'err', [(cond ? '✅ ' : '❌ ') + name]);
}
function runJS(code, onMsg, timeoutMs){
  timeoutMs = timeoutMs || 4000;
  return new Promise(resolve => {
    const pre = '(' + __labPrelude.toString() + ')();\n;(async () => {\n';
    const preLines = pre.split('\n').length - 1;
    const src = pre + code + '\n})().then(() => postMessage({t:"done"}), e => { postMessage({t:"log", level:"err", v:String(e && e.stack || e)}); postMessage({t:"done"}); });';
    let finished = false, w = null, url = null, timer = 0, cleanup = null;
    const finish = reason => { if (finished) return; finished = true; clearTimeout(timer); try { if (w) w.terminate(); } catch(_){} if (url) URL.revokeObjectURL(url); if (cleanup) cleanup(); resolve(reason); };
    try {
      url = URL.createObjectURL(new Blob([src], {type:'text/javascript'}));
      w = new Worker(url);
      w.onmessage = e => { const m = e.data; if (m && m.t === 'done') finish('done'); else if (m) onMsg(m); };
      w.onerror = e => { if (e.preventDefault) e.preventDefault(); onMsg({t:'log', level:'err', v:(e.message || 'Error') + (e.lineno ? ` (line ${Math.max(1, e.lineno - preLines)})` : '')}); finish('error'); };
    } catch(err){
      /* Fallback: opaque-origin sandboxed iframe (no access to this page) */
      const token = Math.random().toString(36).slice(2);
      const ifr = document.createElement('iframe'); ifr.setAttribute('sandbox', 'allow-scripts'); ifr.style.display = 'none'; ifr.title = 'Code sandbox';
      const onWin = e => { const m = e.data; if (!m || m.__sda !== token) return; if (m.t === 'done') finish('done'); else onMsg(m); };
      window.addEventListener('message', onWin);
      cleanup = () => { window.removeEventListener('message', onWin); ifr.remove(); };
      const boot = 'window.postMessage=function(m){parent.postMessage(Object.assign({__sda:"' + token + '"},m),"*")};window.onerror=function(m,s,l){postMessage({t:"log",level:"err",v:m+" (line "+(l-' + preLines + ')+")"});postMessage({t:"done"});};';
      ifr.srcdoc = '<!doctype html><script>' + boot + '<\/script><script>' + src.replace(/<\/script/gi, '<\\/script') + '<\/script>';
      document.body.append(ifr);
    }
    timer = setTimeout(() => { onMsg({t:'log', level:'warn', v:`⏱ Stopped after ${timeoutMs/1000}s — infinite loop or very slow code?`}); finish('timeout'); }, timeoutMs);
  });
}
function labUI(host, lab){
  const box = el('div', {class:'lab'});
  const ta = el('textarea', {spellcheck:'false', autocapitalize:'off', autocomplete:'off', 'aria-label':'Code editor: ' + lab.title + '. Tab inserts spaces; press Escape then Tab to leave the editor.'});
  const original = dedent(lab.code); ta.value = original;
  ta.style.minHeight = Math.min(560, Math.max(220, original.split('\n').length * 21 + 30)) + 'px';
  const out = el('div', {class:'lab-out', role:'log', 'aria-live':'polite'});
  const write = (level, v) => { out.append(el('div', {class:'ln ' + (level || '')}, v)); out.scrollTop = out.scrollHeight; };
  write('sys', 'Press ▶ Run (or Ctrl/⌘ + Enter). Output appears here.');
  let running = false, escaped = false;
  const run = async () => {
    if (running) return; running = true; runB.disabled = true; out.innerHTML = ''; write('sys', '▶ Running…');
    const t0 = performance.now();
    const r = await runJS(ta.value, m => { if (m.t === 'log') write(m.level === 'log' ? '' : m.level, m.v); }, lab.timeout || 4000);
    write('sys', `■ ${r === 'done' ? 'Finished' : r === 'timeout' ? 'Stopped' : 'Errored'} in ${Math.round(performance.now() - t0)} ms`);
    running = false; runB.disabled = false;
  };
  const runB = button('▶ Run', run, 'sm primary');
  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape'){ escaped = true; return; }
    if (e.key === 'Tab' && !e.shiftKey && !escaped){ e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter'){ e.preventDefault(); run(); }
    escaped = false;
  });
  const copyB = button('Copy', async () => { const ok = await copyText(ta.value); toast(ok ? '📋 Code copied' : 'Copy failed — select and copy manually'); }, 'sm ghost');
  const resetB = button('↺ Reset', () => { ta.value = original; out.innerHTML = ''; write('sys', 'Code reset to the original.'); }, 'sm ghost');
  box.append(el('div', {class:'lab-h'}, el('span', {class:'t'}, '🧪 ' + lab.title), el('span', {class:'lab-hint'}, 'Ctrl/⌘+Enter runs'), runB, resetB, copyB), ta, out);
  host.append(box);
  return {run, el:box};
}

/* ---------------- exports ---------------- */
SDA.u = {$, $$, el, sv, esc, slug, clamp, lerp, ease, fmtNum, fmtBytes, fmtDur, rng, shuffle, dedent, debounce, stripHtml, copyText, toast};
SDA.h = h;
SDA.ui = {slider, select, toggle, button, metrics, legend, stepper, quiz, flashcards, tabs, lab:labUI, countUp, speedSelect, diagram:(host, spec) => new Diagram(host, spec)};
Object.assign(SDA, {Diagram, loop, watchVisible, onDispose, withScope, disposeAll, highlight, glossify, addTerm, toast, copyText, runJS, revealScan, errCard});
})();
