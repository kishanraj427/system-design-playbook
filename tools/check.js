// Syntax-check every js/**/*.js file without running it.  Usage: bun tools/check.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'); let n = 0, bad = 0;
const walk = d => fs.readdirSync(d, {withFileTypes: true}).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) { n++; try { new Function(fs.readFileSync(p, 'utf8')); } catch (err) { bad++; console.log('ERROR ' + path.relative(root, p) + ': ' + err.message); } } });
walk(path.join(root, 'js'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const missing = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(f => !fs.existsSync(path.join(root, f)));
missing.forEach(f => { bad++; console.log('MISSING ' + f); });
console.log(`${n} files checked, ${bad} problems`); process.exit(bad ? 1 : 0);
