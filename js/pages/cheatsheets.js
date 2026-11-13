/* =====================================================================
   PART 8 · PAGE — All cheat sheets in one place
   ===================================================================== */
(function(){
const SDA = window.SDA; const {el, esc, stripHtml, copyText, toast} = SDA.u; const ui = SDA.ui;
try {
  const toMarkdown = mods => mods.map(m => `# ${m.title}\n\n` + m.cheatsheet.map(s => `## ${stripHtml(s.h)}\n` + s.items.map(i => '- ' + stripHtml(i)).join('\n')).join('\n\n')).join('\n\n---\n\n');
  SDA.register({kind:'page', id:'cheatsheets', icon:'📋', title:'All cheat sheets', summary:'Every module’s cheat sheet on one page',
    render(ctx){
      const c = ctx.content; let level = 'all', q = '';
      c.append(el('nav', {class:'crumbs', 'aria-label':'Breadcrumb', html:'<a href="#/">Home</a><span aria-hidden="true">/</span><span aria-current="page">Cheat sheets</span>'}),
        el('h1', {class:'page-title'}, '📋 All cheat sheets'),
        el('p', {class:'lead'}, 'One page for revision: every module’s key facts, patterns and numbers. Filter by level or keyword, then copy everything as Markdown for your notes.'));
      const list = el('div', {class:'prose'}); const count = el('span', {class:'chip mono'});
      const mods = () => SDA.modules.filter(m => m.cheatsheet && m.cheatsheet.length && (level === 'all' || m.level === level));
      function render(){
        list.innerHTML = ''; let shown = 0; const ql = q.trim().toLowerCase();
        mods().forEach(m => {
          const secs = m.cheatsheet.map(s => ({h:s.h, items:ql ? s.items.filter(i => stripHtml(i).toLowerCase().includes(ql) || stripHtml(s.h).toLowerCase().includes(ql)) : s.items})).filter(s => s.items.length);
          if (!secs.length) return; shown += secs.reduce((a, s) => a + s.items.length, 0);
          const lv = SDA.LEVELS.find(x => x.id === m.level) || {};
          const g = el('div', {class:'grid c3'}); secs.forEach(s => g.append(el('div', {class:'card'}, el('h4', {html:s.h}), el('ul', {html:s.items.map(i => `<li>${i}</li>`).join('')}))));
          list.append(el('section', {class:'reveal in', style:{margin:'22px 0'}}, el('div', {class:'row', style:{justifyContent:'space-between', alignItems:'baseline'}}, el('h2', {id:'cs-' + m.id, style:{margin:'0 0 10px'}}, `${m.icon || ''} ${m.title}`), el('span', {class:'row', style:{gap:'8px'}}, el('span', {class:'chip'}, `${lv.icon || ''} ${lv.name || ''}`), el('a', {class:'chip', href:'#/m/' + m.id}, 'Open module →'))), g));
        });
        count.textContent = `${shown} facts`;
        if (!shown) list.append(el('div', {class:'empty'}, 'Nothing matches that filter.'));
        if (SDA.glossify) try { SDA.glossify(list); } catch(e){}
      }
      const search = el('input', {class:'input', type:'search', placeholder:'Filter, e.g. “idempotency”, “p99”, “CDN”', 'aria-label':'Filter cheat sheets'}); search.addEventListener('input', () => { q = search.value; render(); });
      c.append(el('div', {class:'ctl-grid'}, ui.select({label:'Level', value:'all', options:[['all', 'All levels']].concat(SDA.LEVELS.map(l => [l.id, `${l.icon} ${l.name}`])), onChange:v => { level = v; render(); }}).el, el('label', {class:'field'}, el('span', null, 'Keyword'), search)),
        el('div', {class:'controls', style:{margin:'10px 0'}}, ui.button('📋 Copy all as Markdown', async () => { const ok = await copyText(toMarkdown(mods())); toast(ok ? '📋 Cheat sheets copied as Markdown' : 'Copy failed: select and copy manually'); }, 'sm primary'), el('a', {class:'btn sm', href:'#/glossary'}, '📖 Glossary'), el('a', {class:'btn sm', href:'#/labs'}, '⌨️ Code labs'), count), list);
      render();
    }});
  SDA.register({kind:'nav', label:'Cheat sheets', href:'#/page/cheatsheets', icon:'📋', order:6, group:'explore', desc:'Every module’s cheat sheet on one page', count:() => SDA.modules.filter(m => m.cheatsheet && m.cheatsheet.length).length});
} catch(e){ console.error('[SDA] page cheatsheets', e); SDA.errors.push({id:'cheatsheets', error:e}); }
})();
