/* =====================================================================
   PART 7 · MODULE 12 — SECURITY
   ===================================================================== */
(function(){
try {
const SDA = window.SDA; const h = SDA.h; const {el, esc, clamp, fmtNum, fmtDur} = SDA.u; const ui = SDA.ui;
const {sortGame, orderGame} = SDA.m1helpers; const {css, frag} = SDA.ph;

/* ---------- tiny crypto (SHA-256 + HMAC), pure JS so it works from file:// ---------- */
const sha256 = (function(){
  const primes = []; for (let n = 2; primes.length < 64; n++){ if (primes.every(p => n % p)) primes.push(n); }
  const frac = x => ((x - Math.floor(x)) * 4294967296) >>> 0;
  const K = primes.map(p => frac(Math.cbrt(p))); const H0 = primes.slice(0, 8).map(p => frac(Math.sqrt(p)));
  return function(bytes){
    const l = bytes.length, bitLen = l * 8, n = ((l + 9 + 63) >> 6) << 6; const m = new Uint8Array(n); m.set(bytes); m[l] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(n - 4, bitLen >>> 0); dv.setUint32(n - 8, Math.floor(bitLen / 4294967296));
    const H = H0.slice(); const w = new Uint32Array(64);
    for (let o = 0; o < n; o += 64){
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++){ const a = w[i - 15], b = w[i - 2]; const s0 = (a >>> 7 | a << 25) ^ (a >>> 18 | a << 14) ^ (a >>> 3); const s1 = (b >>> 17 | b << 15) ^ (b >>> 19 | b << 13) ^ (b >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0; }
      let [a, b, c, d, e, f, g, hh] = H;
      for (let i = 0; i < 64; i++){ const S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7); const ch = (e & f) ^ (~e & g); const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0; const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10); const mj = (a & b) ^ (a & c) ^ (b & c); const t2 = (S0 + mj) >>> 0; hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0; }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0; H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + hh) >>> 0;
    }
    const out = new Uint8Array(32); const ov = new DataView(out.buffer); H.forEach((x, i) => ov.setUint32(i * 4, x)); return out;
  };
})();
const utf8 = s => new TextEncoder().encode(s);
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
function hmac(keyBytes, msgBytes){ let k = keyBytes.length > 64 ? sha256(keyBytes) : keyBytes; const kp = new Uint8Array(64); kp.set(k); const ip = kp.map(x => x ^ 0x36), op = kp.map(x => x ^ 0x5c); const inner = new Uint8Array(64 + msgBytes.length); inner.set(ip); inner.set(msgBytes, 64); const ih = sha256(inner); const outer = new Uint8Array(96); outer.set(op); outer.set(ih, 64); return sha256(outer); }
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlDecode = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); };
SDA.sec = {sha256hex:s => hex(sha256(utf8(s))), hmacHex:(k, m) => hex(hmac(utf8(k), utf8(m))), b64url:s => b64url(utf8(s))};

/* ---------- widgets ---------- */
function jwtDemo(host){
  const secret = 'server-secret-kept-in-a-vault'; let clock = 1735700000; let token = ''; let revoked = false; const sessions = new Set(['sess_9f2c']);
  const sign = (hd, pl) => { const h64 = b64url(utf8(JSON.stringify(hd))), p64 = b64url(utf8(JSON.stringify(pl))); return `${h64}.${p64}.${b64url(hmac(utf8(secret), utf8(h64 + '.' + p64)))}`; };
  const issue = () => { token = sign({alg:'HS256', typ:'JWT'}, {sub:'u_42', name:'Asha', role:'patient', iat:clock, exp:clock + 900}); revoked = false; };
  const out = el('div'); const tokBox = el('div', {class:'mono', style:{wordBreak:'break-all', fontSize:'12.5px', padding:'10px 12px', background:'var(--surface-2)', borderRadius:'10px', border:'1px solid var(--border)'}});
  function verify(){
    const parts = token.split('.'); if (parts.length !== 3) return {ok:false, why:'malformed token'};
    let hd, pl; try { hd = JSON.parse(b64urlDecode(parts[0])); pl = JSON.parse(b64urlDecode(parts[1])); } catch(e){ return {ok:false, why:'cannot decode'}; }
    if (hd.alg !== 'HS256') return {ok:false, why:`alg "${hd.alg}" rejected; the server only accepts HS256 (never trust the token to choose its algorithm)`, pl};
    const expect = b64url(hmac(utf8(secret), utf8(parts[0] + '.' + parts[1])));
    if (expect !== parts[2]) return {ok:false, why:'signature mismatch: the payload was changed after signing', pl};
    if (clock >= pl.exp) return {ok:false, why:`expired ${fmtDur((clock - pl.exp) * 1000)} ago`, pl};
    if (revoked) return {ok:true, warn:'Valid signature and not expired, so the API accepts it, even though the user logged out. Stateless tokens can’t be revoked without a denylist or a short expiry.', pl};
    return {ok:true, pl};
  }
  function render(){
    const [a, b, c] = token.split('.'); tokBox.innerHTML = `<span style="color:var(--accent2)">${esc(a)}</span>.<span style="color:var(--accent1)">${esc(b || '')}</span>.<span style="color:var(--warn)">${esc(c || '')}</span>`;
    const v = verify(); out.innerHTML = '';
    out.append(frag(h.table(['Part', 'Decoded (anyone can read this; it is not encrypted)'], [['Header', `<code>${esc(b64urlDecode(a))}</code>`], ['Payload', `<code>${esc(b64urlDecode(b))}</code>`], ['Signature', 'HMAC-SHA256(header.payload, server secret)']], [])));
    out.append(el('div', {class:'verdict ' + (v.ok ? (v.warn ? 'warn' : 'ok') : 'bad')}, v.ok ? (v.warn || `✔ API accepts the request as ${v.pl.name} (${v.pl.role}). No database lookup was needed: the signature proves the server issued it. Expires in ${fmtDur((v.pl.exp - clock) * 1000)}.`) : `✖ API rejects the token: ${v.why}.`));
    out.append(el('p', {class:'lab-hint'}, `Server-side session for comparison: cookie “sess_9f2c” → ${sessions.has('sess_9f2c') ? 'present in the session store (valid)' : 'deleted on logout (rejected instantly)'}.`));
  }
  const tamper = () => { const [a, b, c] = token.split('.'); const pl = JSON.parse(b64urlDecode(b)); pl.role = 'admin'; token = `${a}.${b64url(utf8(JSON.stringify(pl)))}.${c}`; render(); };
  const none = () => { const [, b] = token.split('.'); token = `${b64url(utf8(JSON.stringify({alg:'none', typ:'JWT'})))}.${b}.`; render(); };
  host.append(el('div', {class:'controls'}, ui.button('🔑 Log in (issue token)', () => { issue(); sessions.add('sess_9f2c'); render(); }, 'sm primary'), ui.button('😈 Edit payload: role = admin', tamper, 'sm'), ui.button('😈 Set alg = none', none, 'sm'), ui.button('⏩ Advance clock 20 min', () => { clock += 1200; render(); }, 'sm'), ui.button('🚪 Log out', () => { revoked = true; sessions.delete('sess_9f2c'); render(); }, 'sm')), tokBox, out);
  issue(); render();
}
function policyDemo(host){
  const SUB = {meera:{name:'Dr Meera', role:'doctor', hospital:'A', shift:true}, ravi:{name:'Nurse Ravi', role:'nurse', hospital:'A', shift:true}, kabir:{name:'Dr Kabir', role:'doctor', hospital:'B', shift:true}, asha:{name:'Asha (patient)', role:'patient', hospital:null, patientId:'P1'}};
  const RES = {r1:{name:'Asha’s record (Clinic A)', hospital:'A', patient:'P1'}, r2:{name:'Rahul’s record (Clinic B)', hospital:'B', patient:'P2'}};
  const RBAC = {doctor:['read', 'write'], nurse:['read'], patient:[]};
  const P = {s:'meera', r:'r1', a:'read'}; const out = el('div');
  function abac(s, r, a){
    if (s.role === 'patient') return a === 'read' && s.patientId === r.patient ? [true, 'patients may read their own record'] : [false, 'patients can only read their own record'];
    if (s.hospital !== r.hospital) return [false, `subject.clinic (${s.hospital}) ≠ resource.clinic (${r.hospital})`];
    if (!s.shift) return [false, 'subject.onShift is false'];
    if (a === 'write' && s.role !== 'doctor') return [false, 'only doctors may write'];
    return [true, `same clinic (${s.hospital}), on shift, role ${s.role} allowed to ${a}`];
  }
  function run(){
    const s = SUB[P.s], r = RES[P.r]; const rb = RBAC[s.role].includes(P.a); const [ab, why] = abac(s, r, P.a);
    out.innerHTML = '';
    out.append(frag(h.table(['Model', 'Decision', 'Why'], [['RBAC (role → permissions)', rb ? '<span style="color:var(--ok)">ALLOW</span>' : '<span style="color:var(--bad)">DENY</span>', `role “${s.role}” has [${RBAC[s.role].join(', ') || 'nothing'}]`], ['ABAC (rules over attributes)', ab ? '<span style="color:var(--ok)">ALLOW</span>' : '<span style="color:var(--bad)">DENY</span>', why]], [])));
    if (rb !== ab) out.append(el('div', {class:'verdict warn'}, rb ? 'RBAC alone over-grants here: the role allows it, but the context (other clinic, off shift) should not.' : 'RBAC alone under-grants here: “patients can read their own record” depends on the relationship between subject and resource, which roles can’t express.'));
    else out.append(el('div', {class:'verdict ok'}, 'Both models agree for this request.'));
  }
  const shift = ui.toggle({label:'Dr Meera is on shift', checked:true, onChange:v => { SUB.meera.shift = v; run(); }});
  host.append(el('div', {class:'ctl-grid'},
    ui.select({label:'Who (subject)', value:P.s, options:Object.entries(SUB).map(([k, v]) => [k, `${v.name} · ${v.role}${v.hospital ? ' · clinic ' + v.hospital : ''}`]), onChange:v => { P.s = v; run(); }}).el,
    ui.select({label:'What (resource)', value:P.r, options:Object.entries(RES).map(([k, v]) => [k, v.name]), onChange:v => { P.r = v; run(); }}).el,
    ui.select({label:'Action', value:P.a, options:['read', 'write'], onChange:v => { P.a = v; run(); }}).el), el('div', {class:'controls', style:{margin:'8px 0'}}, shift.el), out);
  run();
}
function crackCalc(host){
  const ALG = {md5:{label:'MD5, unsalted (never)', rate:6e10}, sha256:{label:'SHA-256, salted (too fast)', rate:2e10}, bcrypt10:{label:'bcrypt, cost 10', rate:6e3}, bcrypt12:{label:'bcrypt, cost 12', rate:1.5e3}, argon:{label:'Argon2id, 64 MiB, t=3', rate:1e2}};
  const P = {alg:'sha256', len:8, set:62, gpus:8, users:1000000, pw:'password123'}; const out = el('div'); const saltOut = el('div');
  function run(){
    const space = Math.pow(P.set, P.len); const rate = ALG[P.alg].rate * P.gpus; const t = space / 2 / rate * 1000; const dict = 1e7 * 100 / rate * 1000;
    out.innerHTML = '';
    out.append(frag(h.table(['Attack on one stolen hash', 'Expected time'], [[`Brute force: ${P.len} chars from ${P.set} symbols (${space.toExponential(1)} guesses)`, fmtDur(t)], ['Dictionary: 10 million common passwords × 100 variations', fmtDur(dict)], [`All ${fmtNum(P.users)} users, if hashes are unsalted (one dictionary pass cracks everyone who shares a password)`, P.alg === 'md5' ? fmtDur(dict) : 'n/a: salts force separate work per user']], [])));
    out.append(el('div', {class:'verdict ' + (t < 864e5 * 30 ? 'bad' : 'ok')}, `${ALG[P.alg].label} on ${P.gpus} GPUs ≈ ${fmtNum(rate)} guesses/s. ${t < 864e5 * 30 ? 'Fast hashes are designed for speed, which helps the attacker.' : 'A deliberately slow, memory-hard hash makes each guess expensive.'} Length beats complexity: each extra character multiplies the work by ${P.set}.`));
    saltOut.innerHTML = '';
    const pw = P.pw; const s1 = 'f3a9c1', s2 = '07be44';
    saltOut.append(frag(h.table(['User', 'Stored value', 'Same password?'], [['user A', `<code>sha256("${esc(pw)}") = ${SDA.sec.sha256hex(pw).slice(0, 24)}…</code>`, 'yes'], ['user B', `<code>sha256("${esc(pw)}") = ${SDA.sec.sha256hex(pw).slice(0, 24)}…</code>`, '<span style="color:var(--bad)">identical hashes leak that they share a password</span>'], ['user A (salted)', `<code>${s1} : sha256("${s1}${esc(pw)}") = ${SDA.sec.sha256hex(s1 + pw).slice(0, 24)}…</code>`, ''], ['user B (salted)', `<code>${s2} : sha256("${s2}${esc(pw)}") = ${SDA.sec.sha256hex(s2 + pw).slice(0, 24)}…</code>`, '<span style="color:var(--ok)">different, so no shared work</span>']], [])));
  }
  const pwIn = el('input', {class:'input mono', value:P.pw, 'aria-label':'Password to hash', style:{maxWidth:'260px'}}); pwIn.addEventListener('input', () => { P.pw = pwIn.value; run(); });
  host.append(el('div', {class:'ctl-grid'},
    ui.select({label:'Storage algorithm', value:P.alg, options:Object.entries(ALG).map(([k, v]) => [k, v.label]), onChange:v => { P.alg = v; run(); }}).el,
    ui.slider({label:'Password length', min:4, max:20, value:P.len, fmt:v => v + ' chars', onInput:v => { P.len = v; run(); }}).el,
    ui.select({label:'Character set', value:'62', options:[['10', 'digits (10)'], ['26', 'lowercase (26)'], ['62', 'letters + digits (62)'], ['95', 'all printable (95)']], onChange:v => { P.set = +v; run(); }}).el,
    ui.slider({label:'Attacker GPUs', min:1, max:1000, value:P.gpus, fmt:v => String(v), onInput:v => { P.gpus = v; run(); }}).el), out,
    el('b', {style:{display:'block', marginTop:'10px'}}, 'Why salts matter (real SHA-256, computed in your browser)'), el('label', {class:'field', style:{maxWidth:'280px'}}, el('span', null, 'Password'), pwIn), saltOut,
    el('p', {class:'lab-hint'}, 'Guess rates are illustrative orders of magnitude for one modern GPU; real numbers depend on hardware and parameters. The SHA-256 values are real.'));
  run();
}
function sqliDemo(host){
  const USERS = [{username:'admin', pin:'9931', role:'admin'}, {username:'asha', pin:'4821', role:'patient'}, {username:'rahul', pin:'1177', role:'patient'}];
  function tokenize(s){
    const t = []; let i = 0;
    while (i < s.length){
      const c = s[i];
      if (/\s/.test(c)){ i++; continue; }
      if (c === '-' && s[i + 1] === '-'){ break; }
      if (c === "'"){ let v = ''; i++; for (;;){ if (i >= s.length) throw new Error('unterminated string literal'); if (s[i] === "'" && s[i + 1] === "'"){ v += "'"; i += 2; continue; } if (s[i] === "'"){ i++; break; } v += s[i++]; } t.push({k:'str', v}); continue; }
      if (/[0-9]/.test(c)){ let v = ''; while (i < s.length && /[0-9]/.test(s[i])) v += s[i++]; t.push({k:'num', v}); continue; }
      if (/[A-Za-z_]/.test(c)){ let v = ''; while (i < s.length && /[A-Za-z_0-9]/.test(s[i])) v += s[i++]; const up = v.toUpperCase(); t.push(['AND', 'OR', 'NOT'].includes(up) ? {k:up} : {k:'id', v}); continue; }
      if (c === '=' ){ t.push({k:'op', v:'='}); i++; continue; }
      if (c === '<' && s[i + 1] === '>'){ t.push({k:'op', v:'<>'}); i += 2; continue; }
      if (c === '(' || c === ')'){ t.push({k:c}); i++; continue; }
      throw new Error(`unexpected character “${c}”`);
    }
    return t;
  }
  function parse(t){
    let p = 0; const peek = () => t[p], eat = k => { if (!t[p] || t[p].k !== k) throw new Error(`syntax error near ${t[p] ? (t[p].v || t[p].k) : 'end of query'}`); return t[p++]; };
    const operand = () => { const x = t[p++]; if (!x) throw new Error('syntax error at end of query'); if (x.k === 'id') return row => { if (!(x.v in row)) throw new Error(`no such column ${x.v}`); return String(row[x.v]); }; if (x.k === 'str' || x.k === 'num') return () => x.v; throw new Error(`syntax error near ${x.v || x.k}`); };
    const factor = () => { if (peek() && peek().k === 'NOT'){ p++; const f = factor(); return r => !f(r); } if (peek() && peek().k === '('){ p++; const e = expr(); eat(')'); return e; } const a = operand(); const op = eat('op'); const b = operand(); return op.v === '=' ? r => a(r) === b(r) : r => a(r) !== b(r); };
    const term = () => { let f = factor(); while (peek() && peek().k === 'AND'){ p++; const g = factor(), ff = f; f = r => ff(r) && g(r); } return f; };
    const expr = () => { let f = term(); while (peek() && peek().k === 'OR'){ p++; const g = term(), ff = f; f = r => ff(r) || g(r); } return f; };
    const e = expr(); if (p < t.length) throw new Error(`syntax error near ${t[p].v || t[p].k}`); return e;
  }
  const u = el('input', {class:'input mono', value:'asha', 'aria-label':'Username'}); const pin = el('input', {class:'input mono', value:'0000', 'aria-label':'PIN'});
  let safe = false; const out = el('div');
  function run(){
    out.innerHTML = '';
    if (safe){
      out.append(frag(h.code('ts', `db.query("SELECT * FROM users WHERE username = $1 AND pin = $2", [${JSON.stringify(u.value)}, ${JSON.stringify(pin.value)}])`, 'parameterised query')));
      const rows = USERS.filter(r => r.username === u.value && r.pin === pin.value);
      out.append(el('div', {class:'verdict ' + (rows.length ? 'ok' : 'warn')}, rows.length ? `Logged in as ${rows[0].username}.` : 'Login failed. The input was treated purely as data, so quotes and dashes are just characters in a username that doesn’t exist.'));
      return;
    }
    const sql = `SELECT * FROM users WHERE username = '${u.value}' AND pin = '${pin.value}'`;
    out.append(frag(h.code('sql', sql, 'query built by string concatenation')));
    try {
      const where = sql.slice(sql.indexOf('WHERE') + 5); const f = parse(tokenize(where)); const rows = USERS.filter(f);
      if (!rows.length) out.append(el('div', {class:'verdict warn'}, 'Login failed (0 rows).'));
      else if (rows.length === 1 && rows[0].username === u.value && rows[0].pin === pin.value) out.append(el('div', {class:'verdict ok'}, `Logged in as ${rows[0].username}: correct credentials.`));
      else out.append(el('div', {class:'verdict bad'}, `💥 Injection worked: the query returned ${rows.length} row(s) and the app logs you in as “${rows[0].username}” (${rows[0].role}) without the right PIN. Your input changed the query’s logic.`));
    } catch(e){ out.append(el('div', {class:'verdict warn'}, `Database error: ${e.message}. Attackers use error messages like this to probe the query shape, so don’t show raw DB errors to users.`)); }
  }
  [u, pin].forEach(x => x.addEventListener('input', run));
  const tryP = (a, b) => { u.value = a; pin.value = b; run(); };
  host.append(el('div', {class:'ctl-grid'}, el('label', {class:'field'}, el('span', null, 'Username'), u), el('label', {class:'field'}, el('span', null, 'PIN'), pin), ui.toggle({label:'Use a parameterised query', checked:false, onChange:v => { safe = v; run(); }}).el),
    el('div', {class:'controls', style:{margin:'8px 0'}}, el('span', {class:'lab-hint'}, 'Try:'), ui.button("' OR '1'='1' --", () => tryP("' OR '1'='1' --", 'x'), 'sm'), ui.button("admin' --", () => tryP("admin' --", 'x'), 'sm'), ui.button("O'Brien", () => tryP("O'Brien", '1234'), 'sm'), ui.button('asha / 4821', () => tryP('asha', '4821'), 'sm')), out,
    el('p', {class:'lab-hint'}, 'A real (tiny) SQL WHERE-clause evaluator runs against three users. In the concatenated version, your input becomes part of the SQL code. PINs are stored in plain text here only to keep the demo short; see the password-hashing lesson.'));
  run();
}

/* ---------- lessons ---------- */
const lessons = [
{
  id:'authn-vs-authz', title:'Authentication vs authorisation', minutes:8, tags:['authentication','authorization','identity','MFA','least privilege'],
  summary:'Authentication proves who you are. Authorisation decides what you may do. Check identity once at the edge, then check permission on every request and for every record.',
  problem:`<h3>A small example</h3><p>A patient logs in to the clinic app and opens <code>/records/1001</code>. Then she changes 1001 to 1002 in the address bar.</p><ul><li>She is logged in, so the app knows who she is.</li><li>The app returns record 1002 without checking whose it is.</li><li>She now reads a stranger’s diagnosis.</li></ul><p>She was authenticated. What did the app forget to check?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one patient request from login to the record.</p>',
    steps:[
      {icon:'🔑', title:'Prove who you are', text:'Asha logs in with a password and a one-time code. The identity provider gives her a short-lived token that names her.'},
      {icon:'🎫', title:'Carry the token', text:'Her phone sends the token with every request. The gateway checks that it is real and not expired.'},
      {icon:'🧾', title:'Check the record', text:'The records service loads record 1002 and sees that someone else owns it. It refuses the request.'},
      {icon:'🔒', title:'Grant the minimum', text:'Start from deny. Give each token only what it needs, such as read but not write.'},
      {icon:'📓', title:'Write it down', text:'Log each login and each refusal. The log helps you spot someone trying one record after another.'}
    ],
    diagram:{title:'Identity at the edge, permission at the record', w:800, h:230, alt:'A patient logs in at the identity provider, gets a token, and calls the API gateway, which validates it. The records service then checks ownership.',
      nodes:[{id:'u', type:'client', label:'Patient app', x:80, y:120, w:130}, {id:'idp', type:'ext', label:'Identity provider', sub:'password + MFA', x:250, y:40, w:150}, {id:'gw', type:'lb', label:'API gateway', sub:'validate token', x:330, y:150, w:140}, {id:'ord', type:'service', label:'Records service', sub:'owner check', x:550, y:150, w:150}, {id:'db', type:'db', label:'Records DB', x:730, y:150}],
      edges:[{from:'u', to:'idp'}, {from:'u', to:'gw'}, {from:'gw', to:'ord'}, {from:'ord', to:'db'}],
      steps:[
        {note:'<b>Authentication:</b> Asha proves who she is with a password and a one-time code. She receives a short-lived token for subject <code>u_42</code>.', flow:[['u', 'idp', 'login + MFA'], ['idp', 'u', 'token(sub=u_42)']]},
        {note:'The gateway checks the token for a valid signature, expiry and audience. It forwards the verified identity.', flow:[['u', 'gw', 'GET /records/1002'], ['gw', 'ord', 'sub=u_42']]},
        {note:'<b>Authorisation:</b> the service loads record 1002 and sees that its owner is <code>u_77</code>, not u_42. It returns <b>403</b> or <b>404</b>. That check stops the attack.', flow:[['ord', 'db', 'read record 1002'], ['db', 'ord', 'owner=u_77']], status:{ord:'hot'}, hl:['ord']}
      ]},
    html:`<h3>Everyday comparison</h3><p>Think of an airport.</p><div class="simple-table">${h.table(['At the airport', 'In the clinic app'], [['The desk checks your passport', 'Authentication: you log in.'], ['A boarding pass names one flight and seat', 'Authorisation: access to one record.'], ['A valid passport does not open every plane', 'A valid login does not open every record.']])}</div><div class="callout tip"><b>Important point</b><p>Being logged in is not the same as being allowed. Check ownership on every request.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Question', 'Answer'], [['Who is asking?', 'Authentication, with a login and a token.'], ['May they do this?', 'Authorisation, checked on the server.'], ['Whose record is it?', 'Check the owner every time.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the clinic has 1,000,000 records with IDs 1 to 1,000,000. A script asks for one every 0.1 seconds, which is 10 per second. Reading them all takes 1,000,000 ÷ 10 = 100,000 seconds, about 28 hours. Once the owner check exists, each wrong guess is refused. A rule that alerts after 20 refusals in a minute then catches the script within seconds.</p><h4>When it goes wrong</h4><p>The same flaw hides outside the address bar. It can sit in a request body, a download link, an export, or a list that includes other people’s rows. Check ownership on every path that returns data. Random IDs make guessing harder but do not fix it, because a leaked link still works.</p><h4>How it works inside</h4><p>The status codes differ. 401 means “I do not know who you are”. 403 means “I know you, but no”. For a record that belongs to someone else, returning 404 does not even confirm that the record exists.</p>`
  },
  tradeoffs:{use:[`Use one identity provider for login and a per-record permission check in the records service.`], avoid:[`Do not trust a user ID or role that the patient’s phone sends.`, `Do not hide the “view” button and call that authorisation.`], alt:[`Use a policy engine when many services share complex rules.`, `Use relationship-based access when patients share records with others.`]},
  real:[
    {co:'OWASP Top 10', tier:'confirmed', text:'Broken access control ranked first in the 2021 list. OWASP found it in some form in 94% of the applications it tested.', src:'OWASP Top 10:2021, A01 Broken Access Control'},
    {co:'FIDO passkeys', tier:'confirmed', text:'Passkeys replace passwords with device-bound keys that resist phishing. Apple, Google and Microsoft support them.', src:'FIDO Alliance and W3C WebAuthn specification'}
  ],
  mistakes:[`Checking “is logged in” but not “owns this record”.`, `Accepting a role or clinic ID from the request body.`, `Copying different permission checks into many handlers.`],
  interview:[`Separate authentication (identity provider, tokens, MFA) from authorisation (every request, every record, least privilege).`],
  tryit:[
    {quiz:[{q:'A logged-in patient changes 1001 to 1002 and sees another record. What is missing?', options:['A stronger password', 'A per-record permission check', 'A longer token', 'A faster login'], answer:1, why:'Authentication told the app who she is. Nobody checked whether she may see that record.'}, {q:'Which step proves who someone is?', options:['Authentication', 'Authorisation', 'Least privilege', 'A log entry'], answer:0, why:'Authentication is about identity. Authorisation is about permission.'}]},
    {note:'Authentication or authorisation?', mount:host => sortGame(host, [
      {t:'Checking the code sent to the patient’s phone', c:'n', why:'It proves identity.'},
      {t:'Checking that the record belongs to the caller', c:'z', why:'It is a permission on one record.'},
      {t:'Checking the password the patient typed', c:'n', why:'It proves identity.'},
      {t:'Letting only billing staff issue refunds', c:'z', why:'It is a permission.'},
      {t:'Signing in with Google', c:'n', why:'It is federated identity.'},
      {t:'A token that can read records but not change them', c:'z', why:'It limits what the token can do.'}
    ], [{id:'n', label:'Authentication'}, {id:'z', label:'Authorisation'}])}
  ],
  sources:[`OWASP Top 10:2021`, `OWASP Authorization and Authentication Cheat Sheets`, `NIST SP 800-63B Digital Identity Guidelines`]
},
{
  id:'sessions-vs-jwt', title:'Sessions vs JWTs', minutes:11, tags:['session','cookie','JWT','token','revocation','refresh token'],
  summary:'A session keeps login state on the server and gives the client a random ID. A JWT carries signed facts, so any service can check it without a lookup. JWTs are hard to cancel, so keep them short-lived.',
  problem:`<h3>A small example</h3><p>The clinic app used server sessions kept in a shared store. Now 30 services need to know who the patient is.</p><ul><li>Asking the session store on every call adds delay.</li><li>The store becomes a single point of failure.</li><li>A patient reports a stolen phone and wants to be logged out.</li></ul><p>Can services trust the patient without a lookup, and still log a stolen phone out?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one patient login through a session and through a JWT.</p>',
    steps:[
      {icon:'🍪', title:'Use a session', text:'After login, the server saves who the user is under a random ID and sends the ID in a secure cookie. Each request looks it up.'},
      {icon:'✉️', title:'Or use a JWT', text:'A JWT is a signed token with facts such as user ID and expiry. Any service can check the signature without asking the server.'},
      {icon:'👀', title:'Remember it is readable', text:'A JWT is signed, not hidden. Anyone can read it, so keep secrets out.'},
      {icon:'⏳', title:'Keep tokens short', text:'An access token lasts about 10 minutes. A refresh token gets a new one without asking for the password.'},
      {icon:'🚪', title:'Log out properly', text:'A session is deleted at once. A JWT keeps working until it expires, unless you keep a denylist of cancelled tokens.'}
    ],
    mount:host => jwtDemo(host),
    html:`<h3>Everyday comparison</h3><p>Think of a cloakroom and a letter of introduction.</p><div class="simple-table">${h.table(['Everyday item', 'In the app'], [['A cloakroom tag checked against a register', 'A session ID looked up on the server.'], ['A signed letter of introduction', 'A JWT checked by its signature.'], ['A letter cannot be taken back', 'A JWT works until it expires.']])}</div><div class="callout tip"><b>Important point</b><p>A JWT is signed, not encrypted. Never put secrets in it.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Need', 'Choice'], [['Instant logout in a browser app', 'Sessions'], ['Many services checking identity', 'Short-lived JWTs'], ['A stolen phone', 'Cancel the refresh token and denylist the access token']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say access tokens last 10 minutes and 100 patients log out in one hour. A denylist needs each token only until it expires. So it holds about 100 × 10 ÷ 60 ≈ 17 entries at a time. That is tiny, so every service can keep a copy.</p><p>Compare with the session store. At 2,000 requests per second, that is 2,000 extra store calls every second, and each one adds wait time.</p><h4>How it works inside</h4><p>A JWT has three parts joined by dots: a header, a payload and a signature. The payload is only encoded, so anyone can read it. With 30 services, sign with a private key held by the login service. The services check with the public key, so they can verify tokens but cannot make them.</p><h4>When it goes wrong</h4><p>Use each refresh token only once. Every use gives a new refresh token. If an old one shows up again, someone copied it. Cancel the whole chain and ask the patient to log in again.</p>`
  },
  tradeoffs:{use:[`Use sessions for the browser app, where instant logout matters.`, `Use short-lived JWTs between the 30 services and for APIs.`], avoid:[`Do not issue JWTs that last for days with no way to cancel them.`, `Do not put diagnoses or other sensitive data inside a JWT.`], alt:[`Use opaque tokens and ask the login server whether each one is valid.`, `Use a backend that keeps tokens on the server and gives the browser a session cookie.`]},
  real:[
    {co:'JWT standards', tier:'confirmed', text:'RFC 7519 defines JWT claims such as sub, exp and aud. Libraries that once accepted alg=none caused well-known vulnerabilities.', src:'IETF RFC 7519 and RFC 7515'},
    {co:'OWASP', tier:'confirmed', text:'OWASP recommends short-lived tokens, strict algorithm checks and HttpOnly, Secure and SameSite cookies.', src:'OWASP JSON Web Token and Session Management Cheat Sheets'}
  ],
  mistakes:[`Thinking a JWT is encrypted.`, `Trusting the token’s own alg header.`, `Using a 30-day access token with no way to cancel it.`],
  interview:[`Compare sessions and tokens on cancelling, scaling and storage.`, `Propose short access tokens, rotating refresh tokens and a denylist for logout.`],
  tryit:{note:'Edit the payload, switch alg to none, advance the clock and log out above. Then check yourself.', quiz:[{q:'You change role to doctor inside a JWT’s payload without the secret. What happens?', options:['You become a doctor', 'The token turns into a session', 'The server re-signs it', 'The signature no longer matches, so the server rejects it'], answer:3, why:'The signature protects the payload from changes.'}, {q:'A patient logs out. The access token lasts 1 hour and there is no denylist. What happens?', options:['The token is dead at once', 'The token still works until it expires', 'The server deletes it', 'The token becomes a session'], answer:1, why:'Services check only the signature and the expiry, so the token stays valid.'}], quizId:'sec-l2'},
  sources:[`RFC 7519 and RFC 7515`, `OWASP JWT and Session Management Cheat Sheets`]
},
{
  id:'oauth-oidc-sso', title:'OAuth 2.0, OpenID Connect and SSO', minutes:12, tags:['OAuth 2.0','OIDC','PKCE','SSO','authorization code','ID token'],
  summary:'OAuth 2.0 lets an app get limited access to someone’s data without their password. OpenID Connect adds a standard way to say who logged in, which also powers single sign-on. Use the authorization code flow with PKCE.',
  problem:`<h3>A small example</h3><p>A lab app wants to show a patient’s blood test results from the clinic. Giving it the clinic password would let it do anything, forever.</p><ul><li>The patient wants to share only test results.</li><li>She wants to stop the sharing later.</li><li>Clinic staff also use 40 internal tools, each with its own password.</li></ul><p>How can she share limited access without sharing her password, and how can staff log in once?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the lab app as it asks for permission to read results.</p>',
    steps:[
      {icon:'↪️', title:'Send her to the clinic login', text:'The lab app sends the patient to the clinic login page. It asks for one named permission, or scope, called results:read, and adds a secret challenge called PKCE.'},
      {icon:'🔐', title:'Log in at the clinic', text:'The patient logs in and approves read-only access. The lab app never sees her password.'},
      {icon:'🎟️', title:'Get a one-time code', text:'The clinic sends her back to the lab app with a short code that works only once.'},
      {icon:'🔁', title:'Swap the code for a token', text:'The lab app sends the code and the secret it made at the start. If they match, it receives an access token.'},
      {icon:'🧾', title:'Read the results', text:'The lab app calls the clinic API with the token. The API allows only results:read.'}
    ],
    diagram:{title:'Authorization code flow with PKCE and OIDC', w:820, h:260, alt:'The patient’s phone is sent to the clinic login server, logs in, and a code returns to the lab app. The app swaps the code and its secret for tokens, then calls the records API.',
      nodes:[{id:'b', type:'client', label:'Patient’s phone', x:90, y:130, w:150}, {id:'app', type:'service', label:'Lab app', sub:'holds code_verifier', x:300, y:200, w:150}, {id:'as', type:'ext', label:'Clinic login server', sub:'login + consent', x:520, y:60, w:190}, {id:'api', type:'service', label:'Clinic records API', sub:'checks scopes', x:720, y:200, w:160}],
      edges:[{from:'b', to:'as'}, {from:'b', to:'app'}, {from:'app', to:'as'}, {from:'app', to:'api'}],
      steps:[
        {note:'The lab app sends the patient to the clinic with <code>scope=openid results:read</code> and a <b>code_challenge</b>, which is the SHA-256 of a random secret.', flow:[['b', 'as', '/authorize + challenge']]},
        {note:'The patient logs in <b>at the clinic</b> with a password and MFA, and approves read-only access. The lab app never sees the password.', hl:['as']},
        {note:'The clinic sends her back with a short-lived, single-use <b>code</b>.', flow:[['as', 'b', 'redirect ?code=…'], ['b', 'app', 'code']]},
        {note:'The lab app swaps the code and its <b>code_verifier</b> for an access token, a refresh token and an ID token. The clinic checks that the verifier matches the challenge.', flow:[['app', 'as', 'code + verifier'], ['as', 'app', 'tokens']]},
        {note:'The lab app calls the API with the access token. The API checks it and enforces the <code>results:read</code> scope.', flow:[['app', 'api', 'Bearer token'], ['api', 'app', 'test results']]}
      ]},
    html:`<h3>Everyday comparison</h3><p>Think of a hotel key card.</p><div class="simple-table">${h.table(['Hotel', 'OAuth'], [['Reception checks your ID once', 'The login server checks the patient once.'], ['The card opens your room and the gym only', 'The token allows only the chosen scopes.'], ['The card stops working at checkout', 'The token expires.'], ['A printed slip says who you are', 'OpenID Connect adds an ID token.']])}</div><div class="callout tip"><b>Important point</b><p>OAuth gives an app limited access. OpenID Connect tells the app who logged in.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Need', 'Use'], [['Share limited access with another app', 'OAuth with the authorization code flow and PKCE'], ['Log in with Google or the staff directory', 'OpenID Connect'], ['One login for 40 internal tools', 'Single sign-on through an identity provider']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the clinic has 150 staff and 40 tools, each with its own password. That is 150 × 40 = 6,000 accounts. When one person leaves, you must disable 40 of them. With single sign-on you disable 1 account at the identity provider.</p><h4>How it works inside</h4><p>PKCE works with a hash. The lab app makes a random string called the verifier, from 43 to 128 characters. At the start it sends only the SHA-256 hash of it, called the challenge. When it swaps the code for a token, it sends the verifier. The clinic hashes it and compares. A thief who copied the code never saw the verifier.</p><h4>When it goes wrong</h4><p>The clinic must match the redirect address exactly, character by character. A loose match lets an attacker steer the code to their own site. Also send a random state value and check it when the patient returns, so a forged return is rejected. Codes should work once and last at most 10 minutes.</p>`
  },
  tradeoffs:{use:[`Use OAuth scopes so the lab app can read results and nothing else.`, `Use OpenID Connect for “Sign in with Google” and for staff single sign-on.`], avoid:[`Do not build your own login server unless you must.`, `Do not use the implicit or password flows.`, `Do not treat an access token as proof of who someone is.`], alt:[`Use SAML for older enterprise single sign-on.`, `Use simple sessions for a single first-party web app.`, `Use API keys for server-to-server calls with no user.`]},
  real:[
    {co:'IETF and OpenID Foundation', tier:'confirmed', text:'OAuth 2.0 is RFC 6749. PKCE is RFC 7636. The security best practice is RFC 9700. OpenID Connect Core 1.0 defines ID tokens.', src:'IETF RFCs 6749, 7636 and 9700, and OpenID Connect Core 1.0'},
    {co:'Sign in with Google', tier:'confirmed', text:'Google’s sign-in is an OpenID Connect service. Apps receive an ID token about the user and can ask for OAuth scopes for Google APIs.', src:'Google Identity, OpenID Connect documentation'}
  ],
  mistakes:[`Skipping PKCE in mobile apps and single-page apps.`, `Asking for broad scopes just in case.`, `Not checking the ID token’s audience and nonce.`],
  interview:[`Draw the authorization code flow with PKCE and explain scopes.`, `Say how access, refresh and ID tokens differ, and why login needs OpenID Connect.`],
  tryit:[
    {quiz:[{q:'Which flow is recommended for a mobile app?', options:['Implicit', 'Authorization code with PKCE', 'Resource-owner password', 'Client credentials'], answer:1, why:'PKCE protects apps that cannot keep a secret.'}, {q:'What does OpenID Connect add to OAuth?', options:['More encryption', 'Faster tokens', 'An ID token that says who logged in', 'A longer refresh time'], answer:2, why:'OAuth alone is about permission, not identity.'}]},
    {note:'Order the flow:', mount:host => orderGame(host, ['App creates a random code_verifier and its SHA-256 code_challenge', 'Redirect the user to /authorize with scopes and the challenge', 'User logs in and consents at the identity provider', 'IdP redirects back with a one-time authorization code', 'App exchanges code + verifier for tokens', 'App calls the API with the access token'], '✓ All six steps in order. The lab app never saw the patient’s password.')}
  ],
  sources:[`RFC 6749, RFC 7636 and RFC 9700`, `OpenID Connect Core 1.0`, `Aaron Parecki, OAuth 2.0 Simplified`]
},
{
  id:'rbac-abac', title:'RBAC, ABAC and relationship-based access', minutes:10, tags:['RBAC','ABAC','ReBAC','policy','least privilege','Zanzibar'],
  summary:'RBAC gives permissions through roles. ABAC checks rules over facts about the person, the record and the moment. ReBAC grants access through relationships such as owner or shared with. Real systems mix all three.',
  problem:`<h3>A small example</h3><p>The clinic app starts with three roles: doctor, nurse and admin. Then new rules arrive.</p><ul><li>A doctor may see only patients at their own clinic.</li><li>The doctor must be on shift.</li><li>A patient may see their own record.</li></ul><p>Can roles alone express this?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one request to read a patient record through each model.</p>',
    steps:[
      {icon:'🏷️', title:'Start with roles', text:'RBAC gives permissions to roles, such as doctor, and roles to people. It is easy to audit.'},
      {icon:'🔎', title:'Add rules on facts', text:'ABAC checks facts about the person, the record and the moment. For example: same clinic and on shift.'},
      {icon:'🤝', title:'Use relationships', text:'ReBAC grants access through links such as owner or shared with. Sharing a record with a specialist is one link.'},
      {icon:'🧮', title:'Decide in one place', text:'A policy engine answers every question using the same rules. Services ask it instead of writing their own checks.'},
      {icon:'🚫', title:'Default to deny', text:'If no rule says yes, the answer is no. Log each decision so you can explain it later.'}
    ],
    mount:host => policyDemo(host),
    html:`<h3>Everyday comparison</h3><p>Think of an office building.</p><div class="simple-table">${h.table(['Office building', 'Access model'], [['A badge by job: managers open floors 3 to 5', 'RBAC'], ['A door that checks department, time and building', 'ABAC'], ['A room you may enter because you are on the guest list', 'ReBAC']])}</div><div class="callout tip"><b>Important point</b><p>Roles say what a person is. Facts and relationships say whether this request is allowed.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Rule', 'Model'], [['Doctors may write records', 'RBAC'], ['Same clinic and on shift', 'ABAC'], ['A patient sees their own record, or one shared with a specialist', 'ReBAC']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the clinic has 5 clinics, 3 shifts and 4 specialties. With roles only, you need one role for each mix. That is 5 × 3 × 4 = 60 doctor roles. With attributes you keep 1 doctor role and check 3 facts: clinic, shift and specialty.</p><h4>When it goes wrong</h4><p>Checking one record is easy. Listing is harder. Say the clinic has 2 million records and a doctor opens “my patients”. You cannot ask the policy engine 2 million times. Turn the rule into a filter the database can use, such as clinic = 7, so only allowed rows come back.</p><h4>How it works inside</h4><p>ReBAC stores links as facts, such as “record 42 is shared with Dr. Rao” and “Dr. Rao is in the cardiology team”. A check follows the links from the person to the record. Google’s Zanzibar is a well-known system built this way. Put a limit on how far a check may follow links.</p>`
  },
  tradeoffs:{use:[`Use RBAC for coarse permissions such as doctor and nurse.`, `Use ABAC for context such as same clinic and on shift.`, `Use ReBAC when patients share records with specialists.`], avoid:[`Do not create hundreds of fine-grained roles.`, `Do not scatter permission checks as if-statements across services.`], alt:[`Use a policy engine such as OPA or Cedar.`, `Use an authorisation service such as OpenFGA or SpiceDB.`]},
  real:[
    {co:'Google Zanzibar', tier:'confirmed', text:'Zanzibar is Google’s global authorisation system for relationship-based access. It serves Drive, YouTube and Photos at very high volume.', src:'Pang et al., Zanzibar (USENIX ATC 2019)'},
    {co:'NIST', tier:'confirmed', text:'NIST standardised RBAC and published guidance on ABAC in SP 800-162.', src:'NIST RBAC standard and NIST SP 800-162'}
  ],
  mistakes:[`Creating a new role for every combination of clinic and shift.`, `Forgetting the clinic attribute in a check.`, `Having no way to answer “why was this allowed?”.`],
  interview:[`Pick RBAC, ABAC or ReBAC for each requirement and keep the policy in one place.`, `Mention caching and an audit log.`],
  tryit:{note:'Try Dr Kabir on Asha’s record, Dr Meera off shift, and Asha on her own record in the demo above. Then check yourself.', quiz:[{q:'“Anyone a record is shared with can view it” is most naturally modelled with…', options:['RBAC', 'ABAC', 'ReBAC (relationships)', 'Firewall rules'], answer:2, why:'Access comes from a relationship, here “shared with”.'}, {q:'Why is “a doctor at the same clinic, on shift” hard to express with roles alone?', options:['Roles cannot see the clinic or the shift', 'Roles are not secure', 'Doctors have no role', 'Shifts do not exist'], answer:0, why:'Roles name a job. They do not hold facts about the clinic or the time.'}], quizId:'sec-l4'},
  sources:[`Zanzibar, USENIX ATC 2019`, `NIST SP 800-162`, `Open Policy Agent and AWS Cedar documentation`]
},
{
  id:'api-keys-mtls', title:'API keys, TLS and mutual TLS', minutes:9, tags:['API key','TLS','mTLS','certificate','SPIFFE','service identity'],
  summary:'An API key identifies a calling app, not a person, and must be kept secret. TLS encrypts traffic and proves the server’s identity. Mutual TLS also proves the client’s identity with a certificate.',
  problem:`<h3>A small example</h3><p>The clinic app sends lab orders to an outside lab through an API key. Inside the clinic platform, 200 services call each other.</p><ul><li>A developer pastes the lab’s API key into a public GitHub repository.</li><li>Bots find it within minutes.</li><li>Inside the network, services talk over plain HTTP, so anyone who gets in can pretend to be any service.</li></ul><p>How can each caller prove who it is?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow a lab order from the Records service to the Lab service.</p>',
    steps:[
      {icon:'🔑', title:'Use an API key', text:'A key is a long random secret that names the calling app. Give it only the permissions it needs, and make it easy to replace.'},
      {icon:'🔒', title:'Add TLS', text:'The server shows a certificate signed by a trusted authority. Both sides agree on keys, and the traffic is encrypted.'},
      {icon:'🪪', title:'Ask for a client certificate', text:'With mutual TLS, or mTLS, the server also asks the caller for a certificate. Now both sides know exactly who they are talking to.'},
      {icon:'🤖', title:'Automate certificates', text:'An internal authority issues short-lived certificates to each service. Renewal is automatic, so nothing expires by surprise.'},
      {icon:'🚦', title:'Allow by identity', text:'The Lab service allows only the identity “records” to call its order endpoint. Everyone else is refused.'}
    ],
    diagram:{title:'Mutual TLS between two services', w:780, h:230, alt:'The Records and Lab services get certificates from an internal authority, verify each other, and then talk over an encrypted channel.',
      nodes:[{id:'o', type:'service', label:'Records', sub:'cert: spiffe://clinic/records', x:120, y:130, w:190}, {id:'ca', type:'ext', label:'Internal CA', sub:'issues 24 h certs', x:390, y:40, w:150}, {id:'p', type:'service', label:'Lab', sub:'cert: spiffe://clinic/lab', x:660, y:130, w:180}],
      edges:[{from:'ca', to:'o', dashed:true}, {from:'ca', to:'p', dashed:true}, {from:'o', to:'p'}],
      steps:[
        {note:'An internal certificate authority issues each service a <b>short-lived certificate</b> that names its identity.', flow:[['ca', 'o', 'cert'], ['ca', 'p', 'cert']], parallel:true},
        {note:'Records connects and Lab shows its certificate. Records checks that it was signed by the authority and names <code>lab</code>.', flow:[['p', 'o', 'server cert']]},
        {note:'Lab asks for a <b>client certificate</b>. Records shows its own, and Lab checks it.', flow:[['o', 'p', 'client cert']]},
        {note:'Both sides are known and the traffic is encrypted. Lab’s policy allows the identity <code>records</code> to call <code>/lab-orders</code>.', flow:[['o', 'p', 'POST /lab-orders (encrypted)']], hl:['p']}
      ]},
    html:`<h3>Everyday comparison</h3><p>Think of an access card and a meeting with ID checks.</p><div class="simple-table">${h.table(['Everyday item', 'In the platform'], [['An access card with the company name', 'An API key: whoever holds it gets in.'], ['A guard who shows an official ID', 'TLS: the server proves who it is.'], ['Both people show official IDs before talking', 'mTLS: both services prove who they are.']])}</div><div class="callout tip"><b>Important point</b><p>An API key proves which app is calling. It does not prove which person is behind it.</p></div><h3>When to use which</h3><div class="simple-table">${h.table(['Situation', 'Best fit'], [['An outside lab calling your API', 'An API key with limited scope'], ['Records calling Lab inside your platform', 'mTLS'], ['A patient app reading Google Fit data', 'An OAuth token']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say each pair of the 200 services shared its own API key. That would be 200 × 199 ÷ 2 = 19,900 keys. With mTLS, each service has just 1 certificate, so 200 in total.</p><p>Say certificates last 24 hours and renew after 16 hours. If the internal authority is down, each service still has 24 − 16 = 8 hours of working certificate left to wait it out.</p><h4>How it works inside</h4><p>A key should be long and random, for example 32 random bytes. Guessing it is hopeless, so leaks come from people. Keep only a hash of each key in your database. Show the key once, when it is created.</p><h4>When it goes wrong</h4><p>A leaked key works until someone cancels it. So allow two keys per caller at the same time. The lab adds the new key, switches over, and then cancels the old one, with no outage. Alert when a key is used from a new place.</p>`
  },
  tradeoffs:{use:[`Use an API key for the outside lab, with permission to create lab orders only.`, `Use mTLS between Records, Lab and the other services inside the platform.`], avoid:[`Do not put API keys in mobile apps or web pages. They will be extracted.`, `Do not renew certificates by hand.`], alt:[`Use OAuth client credentials with short-lived tokens.`, `Sign each request with a secret, as AWS SigV4 does.`]},
  real:[
    {co:'Stripe', tier:'confirmed', text:'Stripe uses publishable and secret keys with live and test prefixes, and restricted keys with limited permissions. It works with GitHub secret scanning to find leaked keys.', src:'Stripe documentation, API keys'},
    {co:'SPIFFE and SPIRE', tier:'confirmed', text:'A CNCF-graduated standard and tool for issuing short-lived, checkable identities to services, used for mTLS between them.', src:'SPIFFE and SPIRE documentation'}
  ],
  mistakes:[`Committing keys to git or building them into apps.`, `Sharing one powerful key between many integrations.`, `Letting certificates expire unnoticed.`],
  interview:[`Separate app identity (API key, client credentials, mTLS) from user identity (OpenID Connect).`, `Mention scoping and rotation.`],
  tryit:[
    {quiz:[{q:'A developer pastes an API key into a public repository. What should the team do first?', options:['Delete the commit and carry on', 'Revoke the key and issue a new one', 'Make the repository private', 'Nothing, since keys are long'], answer:1, why:'Bots find keys within minutes, so assume it is already stolen.'}, {q:'What does mTLS add compared with ordinary TLS?', options:['Faster handshakes', 'It hides the URL', 'The client proves its identity with a certificate too', 'It replaces encryption'], answer:2, why:'In plain TLS only the server proves who it is.'}]},
    {note:'Pick the best fit:', mount:host => sortGame(host, [
      {t:'An outside lab’s backend calling your lab-order API', c:'key', why:'Server to server with no user, using a scoped secret key.'},
      {t:'The Records service calling the Lab service inside your platform', c:'mtls', why:'It needs service identity and encryption.'},
      {t:'A fitness app reading a patient’s Google Fit data', c:'oauth', why:'The user gives consent to limited access.'},
      {t:'A clinic-to-clinic API on a private link', c:'mtls', why:'It is a high-trust link between two organisations.'},
      {t:'A third-party dashboard reading a user’s GitHub repositories', c:'oauth', why:'The access is delegated, scoped and can be cancelled.'}
    ], [{id:'key', label:'API key'}, {id:'mtls', label:'mTLS'}, {id:'oauth', label:'OAuth token'}])}
  ],
  sources:[`RFC 8446 (TLS 1.3)`, `SPIFFE specification`, `OWASP REST Security Cheat Sheet`]
},
{
  id:'encryption', title:'Encryption in transit and at rest', minutes:10, tags:['encryption','AES-GCM','KMS','envelope encryption','TLS 1.3','HSM'],
  summary:'Encrypt data in transit with TLS and at rest with AES, using keys held in a key management service. The algorithm is the easy part. The hard part is deciding who may use each key, and watching every use.',
  problem:`<h3>A small example</h3><p>The clinic’s patient records sit in a database and in backups.</p><ul><li>A backup disk goes missing from the data centre.</li><li>An engineer with database access exports the patients table.</li><li>A misconfigured storage bucket exposes files to the internet.</li></ul><p>Which of these does “we encrypt everything” actually stop?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one patient record as it is locked and later opened.</p>',
    steps:[
      {icon:'🌐', title:'Protect data in transit', text:'TLS locks the connection between phone and server, and between services. Anyone listening on the network sees only scrambled bytes.'},
      {icon:'💾', title:'Protect data at rest', text:'Encryption at rest scrambles the stored copy on disk and in backups. A stolen disk is then useless.'},
      {icon:'🗝️', title:'Use a data key', text:'The app asks a key management service, or KMS, for a data key. It locks the record with that key.'},
      {icon:'✉️', title:'Wrap the data key', text:'The KMS also returns the data key locked under a master key that never leaves the KMS or its hardware module, an HSM. The app stores the locked key next to the record.'},
      {icon:'🔓', title:'Open with permission', text:'To read the record, the app asks the KMS to unlock the data key. The KMS checks who is asking and writes it in a log.'}
    ],
    stepper:{title:'Envelope encryption with a KMS', items:[
      {title:'Generate a data key', tag:'KMS', text:'The app asks the KMS for a new data key. It receives the key in plain form and also locked under a master key that never leaves the KMS or its hardware module.'},
      {title:'Encrypt the data', tag:'AES-256-GCM', text:'The app locks the record on its own side with the plain data key. It uses authenticated encryption (AES-GCM), then wipes the plain key from memory.'},
      {title:'Store together', tag:'envelope', text:'Store the locked record next to the locked data key, which is the “envelope”. The database never holds a usable key.'},
      {title:'Decrypt', tag:'IAM + audit', text:'To read, the app sends the locked data key to the KMS. The KMS checks the access policy, logs the request and returns the plain data key.'},
      {title:'Rotate', tag:'lifecycle', text:'Rotating the master key only re-wraps the data keys, so terabytes need no re-encryption. Removing access to the master key makes the data unreadable for good.'}]},
    html:`<h3>Everyday comparison</h3><p>Think of a bank locker.</p><div class="simple-table">${h.table(['Bank locker', 'Encryption'], [['Your valuables are in a locked box', 'The record is locked with a data key.'], ['Your box key sits in the bank vault', 'The data key is locked by a master key in the KMS.'], ['The vault records every visit', 'The KMS logs each use of a key.']])}</div><div class="callout tip"><b>Important point</b><p>Encryption is only as strong as the control over its keys. Keep keys away from the data.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Threat', 'What helps'], [['A stolen backup disk', 'Encryption at rest'], ['Someone listening on the network', 'TLS'], ['An engineer who can read the whole database', 'Field-level encryption or tokens for the most sensitive fields']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say the clinic has 10 million records, one data key each, and 5 TB of data. To rotate the master key, the KMS re-locks the 10 million small data keys. It does not touch the 5 TB of data. Re-encrypting the data itself would mean reading and writing all 5 TB.</p><p>Reading 1,000 records a second would mean 1,000 KMS calls a second. So apps keep a data key in memory for a few minutes.</p><h4>How it works inside</h4><p>AES-GCM does more than hide data. It adds a tag, and a changed byte makes unlocking fail. So it also detects tampering. It needs a fresh nonce, a one-time number, for every encryption with the same key. Reusing one breaks its security.</p><h4>When it goes wrong</h4><p>Deleting a master key makes everything it locks unreadable, including backups. Cloud services add a waiting period for deletion, such as 7 to 30 days in AWS KMS. Treat key deletion as data deletion, and limit who can do it.</p>`
  },
  tradeoffs:{use:[`Use TLS everywhere and KMS-managed encryption at rest as the default.`, `Use field-level encryption for the most sensitive patient identifiers.`], avoid:[`Do not store keys next to the data or in code.`, `Do not invent your own cryptography or use ECB mode.`], alt:[`Use tokens in place of sensitive values, and keep the originals in a vault.`, `Let a big clinic bring its own keys.`]},
  real:[
    {co:'AWS KMS and Google Cloud KMS', tier:'confirmed', text:'Cloud KMS services use envelope encryption. Data keys lock the data, and master keys held in hardware wrap the data keys. Each use is checked and logged.', src:'AWS KMS and Google Cloud KMS documentation'},
    {co:'TLS 1.3', tier:'confirmed', text:'TLS 1.3 (RFC 8446, 2018) removed old ciphers, made forward secrecy mandatory and cut the handshake to one round trip.', src:'IETF RFC 8446'}
  ],
  mistakes:[`Believing disk encryption protects against SQL injection or stolen app credentials.`, `Hard-coding encryption keys in config files.`, `Reusing a nonce with AES-GCM.`],
  interview:[`Say: TLS everywhere, KMS envelope encryption at rest, field-level encryption for sensitive data, and keys kept apart from the data with audited access.`],
  tryit:{quiz:[{q:'Envelope encryption means…', options:['Encrypting emails', 'Data locked with a data key, which a master key in a KMS locks in turn', 'Using TLS twice', 'Hashing twice'], answer:1, why:'Keys protect keys, so a usable key never sits next to the data.'}, {q:'Which layer protects patient ID numbers even from someone with full database read access?', options:['Disk encryption', 'TLS', 'Backups', 'Field-level encryption or tokenisation'], answer:3, why:'Lower layers decrypt for any database user. Field-level protection does not.'}], quizId:'sec-l6'},
  sources:[`AWS KMS documentation`, `RFC 8446`, `OWASP Cryptographic Storage Cheat Sheet`]
},
{
  id:'password-hashing', title:'Password hashing: bcrypt, scrypt, Argon2', minutes:9, tags:['password hashing','salt','bcrypt','Argon2id','pepper','credential stuffing'],
  summary:'Never store passwords, and never store fast hashes of them. Use a slow, salted, memory-hungry password hash such as Argon2id, scrypt or bcrypt, so every guess costs an attacker real time even after a breach.',
  problem:`<h3>A small example</h3><p>The clinic’s patient table leaks. Passwords are stored as plain SHA-256.</p><ul><li>An attacker with GPUs tries billions of guesses a second.</li><li>Common passwords fall in minutes.</li><li>Identical hashes show which patients share a password.</li></ul><p>People reuse passwords, so this breach becomes a breach of their email too. How should the clinic store passwords?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow one new patient password from signup to login.</p>',
    steps:[
      {icon:'🧂', title:'Add a salt', text:'On signup, the app makes a random salt for this patient. The salt is mixed into the password before hashing.'},
      {icon:'🐌', title:'Use a slow hash', text:'The app uses Argon2id, scrypt or bcrypt, which are deliberately slow. It stores the algorithm, its settings, the salt and the hash together.'},
      {icon:'✅', title:'Check at login', text:'At login, the app repeats the same steps with the stored salt and settings. It compares the result with the stored hash.'},
      {icon:'⚙️', title:'Tune the cost', text:'Choose settings so one hash takes about 100 to 500 ms on your servers. Raise the cost over time and rehash at the next login.'},
      {icon:'🛡️', title:'Protect the login page', text:'Limit login attempts and offer MFA. Watch for credential stuffing, which means trying passwords stolen from other sites.'}
    ],
    mount:host => crackCalc(host),
    html:`<h3>Everyday comparison</h3><p>Think of a safe with a slow lock.</p><div class="simple-table">${h.table(['Safe', 'Password storage'], [['A lock that takes 1 second to try each code', 'A slow hash: each guess costs time.'], ['A different lock model on every safe', 'A salt: each patient hashes differently.'], ['An honest person tries once', 'A real login hashes once.']])}</div><div class="callout tip"><b>Important point</b><p>Fast hashes help the attacker. A slow, salted hash makes each guess expensive.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Choice', 'Verdict'], [['Plain or fast hash such as MD5 or SHA-256', 'Do not use'], ['Reversible encryption of passwords', 'Do not use'], ['Argon2id, scrypt or bcrypt with a salt', 'Use']])}</div>`,
    deep:`<h4>The numbers</h4><p>Take a password of 8 lowercase letters and digits. There are 36⁸ ≈ 2.8 trillion of them. Say a GPU rig tries 10 billion plain SHA-256 guesses a second. Then 2.8 × 10¹² ÷ 10¹⁰ ≈ 280 seconds, under 5 minutes. With a slow hash, say it manages 10,000 guesses a second. Then 2.8 × 10¹² ÷ 10⁴ = 2.8 × 10⁸ seconds, about 9 years. Both rates are examples.</p><h4>How it works inside</h4><p>The stored text holds everything needed to check a login, for example <code>$argon2id$v=19$m=19456,t=2,p=1$salt$hash</code>. Here m is memory in KiB, t is the number of passes and p is the number of parallel lanes. Because the settings are stored, you can raise them later.</p><h4>When it goes wrong</h4><p>If a username does not exist, still run a hash. Otherwise a fast reply tells attackers which names are real. Also cap password length, say at 128 characters, so nobody can send a huge password to burn your CPU. bcrypt reads only the first 72 bytes.</p>`
  },
  tradeoffs:{use:[`Use Argon2id, scrypt or bcrypt with a salt for every patient and staff password.`], avoid:[`Do not use MD5, SHA-1 or plain SHA-256, and do not use an unsalted hash.`, `Do not encrypt passwords in a way that can be reversed.`, `Do not invent your own scheme.`], alt:[`Use passkeys, so there is no password to steal.`, `Let a login service, through OpenID Connect, handle passwords for you.`]},
  real:[
    {co:'LinkedIn, 2012', tier:'confirmed', text:'LinkedIn’s 2012 breach exposed unsalted SHA-1 password hashes. Millions were cracked quickly, and in 2016 more than 100 million credentials from the breach were offered for sale.', src:'LinkedIn statements (2012 and 2016)'},
    {co:'OWASP', tier:'confirmed', text:'The OWASP Password Storage Cheat Sheet recommends Argon2id first, then scrypt, bcrypt or PBKDF2, with minimum settings. Argon2 won the Password Hashing Competition in 2015 and is specified in RFC 9106.', src:'OWASP Password Storage Cheat Sheet and IETF RFC 9106'}
  ],
  mistakes:[`Saying “we hash with SHA-256, so we are safe”.`, `Using one global salt for every user.`, `Logging passwords in request logs or error traces.`],
  interview:[`Say: a salt per user, Argon2id or bcrypt with a tuned cost, rehash at login, rate-limit login and offer MFA.`],
  tryit:{note:'Switch algorithms and lengths above, and type a password to see real salted SHA-256 values. Then check yourself.', quiz:[{q:'Two patients have the same unsalted hash. What does an attacker learn?', options:['Nothing', 'Their email addresses', 'The salt', 'They share a password, and cracking one cracks both'], answer:3, why:'A salt makes the same password hash differently for each person.'}, {q:'Why is a slow hash better than a fast one for passwords?', options:['It makes each guess cost the attacker time', 'It saves server memory', 'It removes the need for a salt', 'It hides the password length'], answer:0, why:'An honest login hashes once. An attacker needs billions of guesses.'}], quizId:'sec-l7'},
  sources:[`OWASP Password Storage Cheat Sheet`, `RFC 9106 (Argon2)`, `NIST SP 800-63B`]
},
{
  id:'secrets-rotation', title:'Secrets management and key rotation', minutes:9, tags:['secrets','Vault','rotation','dynamic credentials','secret scanning'],
  summary:'Keep secrets out of code and images, and give them to services at runtime from a secrets manager. Replace them without downtime by letting the old and the new one work together for a while.',
  problem:`<h3>A small example</h3><p>The clinic’s production database password has not changed in four years.</p><ul><li>It sits in a <code>.env</code> file in the repo, in three build systems and on two laptops.</li><li>It was also pasted in a chat message in 2022.</li><li>An employee left last month, and changing it means editing 30 services at once.</li></ul><p>How can the clinic replace the password without an outage?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the database password from storage to replacement.</p>',
    steps:[
      {icon:'🏦', title:'Store it in one place', text:'A secrets manager keeps the password, encrypted. Only named services may read it, and every read is logged.'},
      {icon:'📲', title:'Hand it over at runtime', text:'A service asks for the password when it starts, using its own identity. Nothing sits in git, images or build logs.'},
      {icon:'🆕', title:'Create a second password', text:'The manager creates a new valid password B while the old one, A, still works.'},
      {icon:'🔄', title:'Move services to the new one', text:'Services pick up B as they refresh. Both A and B work meanwhile, so nothing fails.'},
      {icon:'🗑️', title:'Cancel the old one', text:'When the logs show that nothing uses A, disable it. Better still, let the manager issue short-lived passwords on demand.'}
    ],
    stepper:{title:'Rotating a database password with zero downtime', items:[
      {title:'Store centrally', tag:'secrets manager', text:'The secret lives in a manager such as Vault, AWS Secrets Manager or GCP Secret Manager. It is encrypted with a KMS, readable only by named service identities, and every read is logged.'},
      {title:'Deliver at runtime', tag:'no code', text:'Services fetch it at start-up, or through a sidecar or mounted volume, using their workload identity. Nothing is in git, images or build logs.'},
      {title:'Create credential B', tag:'overlap', text:'Rotation creates a second valid credential, a new user or password, while A still works.'},
      {title:'Roll services to B', tag:'reload', text:'Services pick up B on refresh or restart. A and B both work during the overlap, so there are no failures.'},
      {title:'Revoke A', tag:'verify', text:'After you confirm from connection and audit logs that nothing uses A, disable it.'},
      {title:'Go dynamic', tag:'best', text:'Better still, the secrets manager issues short-lived database credentials per service, for example for 1 hour. Then there is nothing long-lived to leak.'}]},
    html:`<h3>Everyday comparison</h3><p>Think of keys in an office.</p><div class="simple-table">${h.table(['Office keys', 'Secrets'], [['A master key that everyone copies forever', 'One password shared by everyone for years.'], ['A day pass for your floor, logged and cancellable', 'A short-lived credential, logged and revocable.'], ['The security desk hands out passes', 'The secrets manager hands out secrets.']])}</div><div class="callout tip"><b>Important point</b><p>If a secret leaks, replace it. Deleting the commit is not enough.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Situation', 'Action'], [['A secret was pasted in git or chat', 'Rotate it at once.'], ['An employee with access leaves', 'Rotate the secrets they could read.'], ['You want less risk long term', 'Use short-lived, per-service credentials.']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say services reread the password every 5 minutes, and old password A stays valid for 15 minutes after B is created. Each service gets 15 ÷ 5 = 3 chances to switch. A service that was down for an hour just fetches the newest password when it starts, so it misses nothing.</p><h4>How it works inside</h4><p>Most databases allow one password per user. So “two passwords at once” is done with two users, for example app_a and app_b. The manager sets a new password on the idle user, services move to it, and then the old user is locked. Next time, the roles swap. Dynamic credentials go further. The manager makes a new user for each service that expires after, say, 1 hour.</p><h4>When it goes wrong</h4><p>Open connections can fool you. A connection made with password A may stay open after A is cancelled, which hides a service that never got B. The failure shows later, when the pool opens a new connection. Before you disable A, check the logs for its last use and make pools recycle connections.</p>`
  },
  tradeoffs:{use:[`Use a secrets manager with workload identity and an audit log.`, `Use short-lived database credentials where the database supports them.`], avoid:[`Do not keep secrets in repos, images, tickets or chat.`, `Do not share one credential across many services.`], alt:[`Use cloud roles so services need no stored secret at all.`, `Use mTLS identities in place of shared passwords.`]},
  real:[
    {co:'Uber, 2016 breach', tier:'confirmed', text:'Attackers used credentials found in a private GitHub repository to open an AWS storage bucket that held data on about 57 million riders and drivers. Uber disclosed it in 2017.', src:'Uber statement (2017) and U.S. FTC settlement (2018)'},
    {co:'HashiCorp Vault', tier:'confirmed', text:'Vault’s database secrets engine creates short-lived database credentials for each client and cancels them when their lease ends.', src:'HashiCorp Vault documentation, Database secrets engine'}
  ],
  mistakes:[`Deleting a leaked key from git history instead of rotating it.`, `Rotation scripts that switch every service at once with no overlap.`, `Printing secrets in build logs.`],
  interview:[`Mention a secrets manager, workload identity, rotation with overlap and dynamic credentials.`],
  tryit:[
    {quiz:[{q:'A secret was committed to a public repository yesterday. What is the first action?', options:['Delete the commit', 'Make the repository private', 'Rotate or revoke the secret now', 'Wait and watch'], answer:2, why:'Assume it is already stolen. Cloned copies keep the old commit.'}, {q:'Why let old credential A and new credential B work together for a while?', options:['To save storage', 'So no service fails while others are still moving over', 'To make logs shorter', 'To avoid a secrets manager'], answer:1, why:'Services refresh at different times, so both must work during the move.'}]},
    {note:'Order a zero-downtime rotation:', mount:host => orderGame(host, ['Create a second valid credential (B) alongside A', 'Store B in the secrets manager', 'Services reload and start using B', 'Confirm from logs that nothing still uses A', 'Revoke credential A'], '✓ All five steps in order. No service ever lost access.')}
  ],
  sources:[`HashiCorp Vault documentation`, `OWASP Secrets Management Cheat Sheet`, `GitHub secret scanning documentation`]
},
{
  id:'owasp-top10', title:'OWASP Top 10: XSS, CSRF, SQL injection, SSRF', minutes:13, tags:['OWASP','XSS','CSRF','SQL injection','SSRF','input validation'],
  summary:'Most breaches use a few well-known flaws. Keep user input as data in queries, encode output, use SameSite cookies and tokens, and limit where the server may fetch from.',
  problem:`<h3>A small example</h3><p>Three features of the patient portal look harmless.</p><ul><li>The login form builds its database query by joining strings.</li><li>Doctor notes are shown to other users as raw HTML.</li><li>“Import a lab report from a link” fetches any address you give it.</li></ul><p>Each has caused real breaches. How would an attacker use them?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow an attacker through the three features, then see the fix for each.</p>',
    steps:[
      {icon:'💉', title:'Injection', text:'An attacker types SQL into the login box, and a string-built query runs it as code. Parameterised queries send values separately, so input stays data.'},
      {icon:'📜', title:'Cross-site scripting', text:'In cross-site scripting (XSS), a note containing a script runs in other users’ browsers. Encode output so it shows as plain text, and add a Content Security Policy.'},
      {icon:'🪤', title:'Forged requests', text:'In cross-site request forgery (CSRF), a bad site makes the patient’s browser send a request with her cookie. SameSite cookies and anti-forgery tokens stop it.'},
      {icon:'🌐', title:'Server-side requests', text:'In server-side request forgery (SSRF), the import feature is tricked into fetching internal addresses, such as the cloud metadata service. Allow only known destinations and block internal ranges.'},
      {icon:'🧰', title:'Cover the rest', text:'Also fix access control, patch libraries and log security events. Each defence assumes another may fail.'}
    ],
    mount:host => sqliDemo(host),
    html:`<h3>Everyday comparison</h3><p>Think of a bank clerk who follows any text written on a deposit slip.</p><div class="simple-table">${h.table(['Bank clerk', 'Injection'], [['A slip says: deposit ₹100 and also transfer ₹1 lakh to me', 'Input that contains commands.'], ['A clerk who obeys any text on the slip', 'An app that builds queries from strings.'], ['Treat the slip as data, never as instructions', 'Parameterised queries.']])}</div><div class="callout tip"><b>Important point</b><p>Treat user input as data, never as instructions.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Attack', 'Main defence'], [['Injection', 'Parameterised queries'], ['XSS', 'Output encoding and a Content Security Policy'], ['CSRF', 'SameSite cookies and tokens'], ['SSRF', 'Allow-lists and blocking internal addresses']])}</div>`,
    deep:`<h4>How it works inside</h4><p>Take a string-built login query. If a user types <code>' OR '1'='1</code> as the password, the database reads it as part of the SQL and the check always passes. With a parameterised query, the database reads the SQL first and gets the value separately. The quote is then just a character. Parameters cannot replace table or column names, so pick those from a fixed allow-list.</p><h4>When it goes wrong</h4><p>Encoding depends on the place. Text in a page body, in an HTML attribute, in a URL and in a script each need different escaping. Use a template system that escapes by place.</p><p>For SSRF, block the cloud metadata address 169.254.169.254 and the internal ranges. Check the IP address the name resolves to, connect to that same address, and check again after each redirect. A safe-looking site can redirect to an internal address.</p><h4>Reference table</h4><p>This table lists all ten categories from 2021, each with its usual fix.</p><div class="simple-table">${h.table(['OWASP Top 10 (2021)', 'Typical fix'], [['A01 Broken Access Control', 'Per-record checks on the server, deny by default'], ['A02 Cryptographic Failures', 'TLS everywhere, strong encryption at rest, no weak hashes'], ['A03 Injection (including XSS)', 'Parameterised queries, output encoding, CSP'], ['A04 Insecure Design', 'Threat modelling, secure patterns, abuse cases'], ['A05 Security Misconfiguration', 'Hardened defaults, no debug mode in production, policy checks'], ['A06 Vulnerable and Outdated Components', 'A list of parts, dependency scanning, fast patching'], ['A07 Identification and Authentication Failures', 'MFA, rate limits, secure sessions'], ['A08 Software and Data Integrity Failures', 'Signed artifacts, protected build pipelines'], ['A09 Security Logging and Monitoring Failures', 'Log login and access events, alert, keep logs'], ['A10 Server-Side Request Forgery', 'Egress allow-lists, block internal ranges, IMDSv2']])}</div>`
  },
  tradeoffs:{use:[`Use framework defaults, such as an ORM and auto-escaping templates, and review every risky spot by hand.`], avoid:[`Do not rely on a blocklist of “bad characters” as the main defence.`, `Do not switch off CSP or SameSite because something broke.`], alt:[`Add a web application firewall as an extra layer, not as a substitute.`]},
  real:[
    {co:'Capital One, 2019', tier:'confirmed', text:'An SSRF-style attack on a misconfigured firewall let the attacker get cloud credentials from the metadata service and read data on about 100 million customers. AWS later promoted IMDSv2, which resists such attacks.', src:'Capital One statement (2019), U.S. DOJ complaint and AWS IMDSv2 announcement'},
    {co:'Equifax, 2017', tier:'confirmed', text:'Attackers used a known Apache Struts flaw (CVE-2017-5638) that Equifax had not patched. Data on about 147 million people was exposed.', src:'U.S. GAO report on the Equifax breach (2018)'}
  ],
  mistakes:[`Building SQL from strings “because the input is validated”.`, `Using innerHTML with user content.`, `Fetching URLs on the server with no check of the destination.`],
  interview:[`Name a concrete fix for each risk: parameterised queries, output encoding with CSP, SameSite with tokens, and egress allow-lists with IMDSv2.`],
  tryit:[
    {quiz:[{q:'What is the main defence against SQL injection?', options:['Escaping quotes by hand', 'Parameterised queries', 'Hiding error messages', 'A web firewall alone'], answer:1, why:'The input stays data and can never change the query.'}, {q:'SameSite cookies mainly defend against…', options:['SQL injection', 'SSRF', 'CSRF', 'Brute force'], answer:2, why:'A cross-site request no longer carries the cookie.'}]},
    {note:'Run the injection payloads above, then switch on parameterised queries. Then match each attack to its main defence:', mount:host => sortGame(host, [
      {t:'A doctor note shows a <script> tag to other users', c:'xss', why:'Encode output and use a CSP.'},
      {t:'A bad site auto-submits a change using the patient’s cookie', c:'csrf', why:'SameSite cookies and anti-forgery tokens.'},
      {t:"Login with admin' -- as the username", c:'sqli', why:'Parameterised queries.'},
      {t:'“Import from link” fetches http://169.254.169.254/', c:'ssrf', why:'Allow-list destinations, block internal addresses and use IMDSv2.'}
    ], [{id:'sqli', label:'Injection'}, {id:'xss', label:'XSS'}, {id:'csrf', label:'CSRF'}, {id:'ssrf', label:'SSRF'}])}
  ],
  sources:[`OWASP Top 10:2021`, `OWASP Cheat Sheet Series (SQLi, XSS, CSRF, SSRF)`, `GAO-18-559 (Equifax)`, `AWS IMDSv2 documentation`]
},
{
  id:'zero-trust-tenancy', title:'Zero trust and tenant isolation', minutes:9, tags:['zero trust','BeyondCorp','least privilege','segmentation','tenant isolation'],
  summary:'Zero trust drops the idea of a trusted internal network. Every request is checked for user, device and service identity. In a shared app, tenant isolation applies the same thinking between customers.',
  problem:`<h3>A small example</h3><p>The clinic network has a strong firewall. Inside it, everything trusts everything.</p><ul><li>One phished laptop on the staff VPN can reach the admin panel.</li><li>From there it can reach the database and the build server.</li><li>Many clinics share one app, so one mistake can expose all of them.</li></ul><p>How can the clinics stop one foothold from becoming everything?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow a staff member who opens the scheduling app from home.</p>',
    steps:[
      {icon:'🪪', title:'Identify everything', text:'Staff log in through single sign-on with MFA. Devices and services get their own certificates.'},
      {icon:'🚪', title:'Check every request', text:'An access proxy checks who is asking, whether the device is healthy and what the policy says. Network location does not count.'},
      {icon:'🧱', title:'Limit the reach', text:'Each service can talk only to what it needs. Admin access is granted for a short time, with approval.'},
      {icon:'🔒', title:'Encrypt and log', text:'Encrypt internal traffic too, and record every access.'},
      {icon:'🏥', title:'Keep clinics apart', text:'Put the clinic ID in every query, cache key and search index. One clinic can then never read another clinic’s data.'}
    ],
    diagram:{title:'Zero-trust access (BeyondCorp style)', w:800, h:240, alt:'A staff laptop reaches internal apps through an access proxy that checks user identity, device state and policy on every request.',
      nodes:[{id:'u', type:'client', label:'Staff laptop', sub:'any network', x:90, y:120, w:140}, {id:'ap', type:'lb', label:'Access proxy', sub:'per-request decision', x:320, y:120, w:150}, {id:'idp', type:'ext', label:'IdP + MFA', x:320, y:30, w:120}, {id:'dev', type:'ext', label:'Device inventory', sub:'patched? managed?', x:320, y:215, w:160}, {id:'app', type:'service', label:'Scheduling app', x:570, y:80, w:140}, {id:'adm', type:'service', label:'Admin panel', sub:'needs extra policy', x:580, y:180, w:150}],
      edges:[{from:'u', to:'ap'}, {from:'ap', to:'idp'}, {from:'ap', to:'dev'}, {from:'ap', to:'app'}, {from:'ap', to:'adm'}],
      steps:[
        {note:'From home Wi-Fi or the clinic alike, every request goes through the <b>access proxy</b>. There is no trusted network.', flow:[['u', 'ap', 'GET /schedule']]},
        {note:'The proxy checks the <b>user identity</b> (single sign-on with MFA) and the <b>device state</b> (managed, disk encrypted, up to date).', flow:[['ap', 'idp', 'who?'], ['ap', 'dev', 'device ok?']], parallel:true},
        {note:'Policy allows the scheduling app for this user and device, so the request is forwarded over mTLS.', flow:[['ap', 'app', 'allowed']]},
        {note:'The same user on the same device is <b>refused</b> the admin panel. They lack the role, and admin access also needs a hardware key.', status:{adm:'down'}, hl:['adm']}
      ]},
    html:`<h3>Everyday comparison</h3><p>Think of a castle compared with a modern office.</p><div class="simple-table">${h.table(['Castle and office', 'Zero trust'], [['Cross the drawbridge and wander anywhere', 'Being on the network proves nothing.'], ['A badge is checked at every door', 'Every request is checked.'], ['Some rooms need a fingerprint too', 'Sensitive tools need extra proof.']])}</div><div class="callout tip"><b>Important point</b><p>Network location is not a credential. Check identity, device and policy on every request.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Risk', 'Control'], [['A phished laptop', 'Device checks and MFA'], ['One service is breached', 'Limited reach and mTLS'], ['One clinic’s data shown to another', 'Clinic ID in every key, query and index']])}</div>`,
    deep:`<h4>The numbers</h4><p>Say 200 services share a flat network. A breached one can reach the other 199. With allow rules, say each service accepts calls from about 4 others. The breached one can then reach only the few services that list it. For admin access, say you grant 1 hour on request. Standing access for 365 days is 365 × 24 = 8,760 hours, so exposure is 8,760 times shorter.</p><h4>When it goes wrong</h4><p>Tenant leaks happen at the side doors. A background job may carry only a record ID, so it runs without a clinic filter. Put the clinic ID inside every job message. Check exports and reports too. Test with two clinics that use the same record numbers, and confirm each sees only its own.</p><h4>How it works inside</h4><p>A zero trust decision is not made once. Tokens are short-lived, say 15 minutes. At each renewal the proxy checks again. Is the device still healthy? Is the person still employed? A phished laptop loses access at the next check, not next month.</p>`
  },
  tradeoffs:{use:[`Use zero trust for remote staff, cloud services and a multi-clinic app.`], avoid:[`Do not buy a “zero trust” product and skip the identity, device and policy work.`], alt:[`Use network segmentation and a VPN as a temporary step.`]},
  real:[
    {co:'Google BeyondCorp', tier:'confirmed', text:'Google moved from a trusted office network to BeyondCorp. Access depends on user and device credentials checked by an access proxy, wherever the person is.', src:'Ward and Beyer, BeyondCorp: A New Approach to Enterprise Security (2014)'},
    {co:'NIST', tier:'confirmed', text:'NIST’s Zero Trust Architecture (SP 800-207, 2020) defines zero-trust principles and logical components.', src:'NIST Special Publication 800-207'}
  ],
  mistakes:[`Trusting traffic because it comes from an internal IP address.`, `Giving staff permanent broad admin rights.`, `Leaving the clinic ID out of cache keys and search indexes.`],
  interview:[`Explain identity-based, per-request access with device checks, mTLS between services and tenant isolation at each enforcement point.`],
  tryit:{quiz:[{q:'In zero trust, being on the clinic network means…', options:['Full access', 'Nothing by itself, since every request is still checked', 'Admin rights', 'No MFA needed'], answer:1, why:'Network location is not a credential.'}, {q:'A cache key is “record:123” in an app shared by many clinics. What is the risk?', options:['None', 'More memory use', 'Clinic A may be served clinic B’s cached record 123', 'A slower cache'], answer:2, why:'Put the clinic ID in every cache key.'}], quizId:'sec-l10'},
  sources:[`Ward and Beyer, BeyondCorp (2014)`, `NIST SP 800-207`, `AWS SaaS Tenant Isolation Strategies`]
},
{
  id:'compliance', title:'Privacy and compliance: GDPR, India’s DPDP Act, PCI DSS', minutes:11, tags:['GDPR','DPDP','PCI DSS','privacy','data localisation','consent'],
  summary:'Laws shape the design. They decide what you may collect, where it may live, how long you keep it and how fast you report a breach. Plan for less data, consent, location, deletion and audit from the start.',
  problem:`<h3>A small example</h3><p>The clinic app stores card numbers “for faster checkout” and keeps every patient’s full history forever.</p><ul><li>It copies real patient data into the test system.</li><li>It runs analytics in a foreign cloud region.</li><li>A patient asks to delete her data, and a regulator asks where it is stored.</li></ul><p>Can the clinic answer these questions today?</p>`,
  how:{
    intro:'<h3>What happens behind the scenes</h3><p>Follow the clinic as it fixes these problems one step at a time.</p>',
    steps:[
      {icon:'🗺️', title:'Map the data', text:'List what data you hold and where it flows, including logs, backups and vendors.'},
      {icon:'✂️', title:'Collect less', text:'Keep only what the purpose needs, which is called data minimisation. Mask or tokenise values, for example by showing only the last 4 digits of a card.'},
      {icon:'✅', title:'Record consent', text:'Save what each patient agreed to and why. Let her withdraw consent later.'},
      {icon:'📍', title:'Keep data in its place', text:'Store regulated data only in allowed regions, which is called data residency. Check where backups, logs and vendors process it.'},
      {icon:'🧹', title:'Delete on request', text:'Remove a patient’s data from every store, including search indexes and caches. Delete old data on a schedule.'}
    ],
    stepper:{title:'Privacy by design: an architecture checklist', items:[
      {title:'Map the data', tag:'inventory', text:'Sort data into public, internal, personal, sensitive personal, payment and health. Draw where it flows, including logs, backups, analytics and vendors.'},
      {title:'Minimise', tag:'collect less', text:'Collect only what the purpose needs. Mask or tokenise values. Do not copy real personal data into test systems.'},
      {title:'Consent and purpose', tag:'lawful basis', text:'Record consent and purpose for each use of data. Let users withdraw consent, and respect purpose limits in analytics and marketing.'},
      {title:'Residency', tag:'where', text:'Keep regulated data in allowed regions, for example Indian payment data stored in India under RBI rules. Check where backups, logs and vendors process it.'},
      {title:'Rights and deletion', tag:'erase', text:'Support access, correction and deletion requests across every store, including search indexes, caches and data lakes. Set retention times, delete on schedule, and use crypto-shredding where deletion is hard.'},
      {title:'Protect and audit', tag:'controls', text:'Use encryption, least privilege, access logs and breach detection. Know your deadlines, for example 72 hours to tell the GDPR regulator and 6 hours for reportable incidents to CERT-In in India.'},
      {title:'Shrink PCI scope', tag:'cards', text:'Never store the CVV after authorisation. Use a PCI-compliant gateway and tokens, so card data never touches most of your systems.'}]},
    html:`<h3>Everyday comparison</h3><p>Think of a hospital’s patient files.</p><div class="simple-table">${h.table(['Hospital files', 'Privacy rules'], [['Keep only what treatment needs', 'Collect less.'], ['Lock the cabinet and log who opened it', 'Protect and audit.'], ['Destroy old files, and some never leave the country', 'Delete on schedule and keep data local.']])}</div><div class="callout tip"><b>Important point</b><p>The data belongs to the patient, not the clinic. Design for consent, deletion and audit from the start.</p></div><h3>How we handle it</h3><div class="simple-table">${h.table(['Data', 'What to do'], [['Card CVV after payment', 'Never store it.'], ['Full card number', 'Use a token from a payment gateway.'], ['Old data with no purpose', 'Delete it on schedule.']])}</div>`,
    deep:`<h4>The numbers</h4><p>The GDPR fine cap is the higher of the two figures in the table below. For a company with €1 billion turnover, 4% is €40 million, so that is the cap. For €100 million turnover, 4% is €4 million, so €20 million is the cap.</p><h4>When it goes wrong</h4><p>Backups keep deleted data. Say daily backups are kept for 35 days. One patient’s data then sits in up to 35 copies, and rewriting them is not practical. Two answers work. Give each patient her own encryption key, so deleting the key makes every copy unreadable. This is crypto-shredding. Or keep a list of deletions and replay it after any restore.</p><h4>How it works inside</h4><p>A card number can be replaced by a token from the payment gateway. Your systems then hold only the token, so far fewer of them fall under PCI DSS rules. This is not legal advice. Check the current rules with your legal team.</p><h4>Reference table</h4><p>This table shows the main rules and what each means for the design.</p><div class="simple-table">${h.table(['Rule', 'Applies to', 'Design impact'], [['<b>GDPR</b> (EU, 2018)', 'Personal data of people in the EU, wherever you are', 'Lawful basis or consent, data-subject rights, 72 hour breach notice, transfer rules. Fines reach €20 million or 4% of worldwide turnover.'], ['<b>DPDP Act</b> (India, 2023)', 'Digital personal data processed in India, and abroad when offering services to people in India', 'Notice and consent, purpose limits, erasure, breach notice, a Data Protection Board. Penalties reach ₹250 crore. Check the current status of the rules.'], ['<b>PCI DSS</b> v4', 'Anyone who stores, processes or sends card data', 'Separate the cardholder data environment, never store the CVV after authorisation, encrypt the card number, scan and log.'], ['<b>RBI directions</b>', 'Payment systems and card networks in India', 'Payment data is stored only in India (2018), and card-on-file tokenisation applies (2022).']])}</div>`
  },
  tradeoffs:{use:[`Use less data, tokens, region-aware storage, deletion pipelines and audit logs as the default design.`], avoid:[`Do not collect everything “for future ML”.`, `Do not copy real patient data into test systems.`, `Do not store card numbers or the CVV yourself.`], alt:[`Let a PCI-compliant gateway store the cards.`, `Use a consent management platform.`]},
  real:[
    {co:'GDPR', tier:'confirmed', text:'The EU General Data Protection Regulation has applied since May 2018. Fines reach €20 million or 4% of worldwide turnover, and some breaches must be reported within 72 hours.', src:'Regulation (EU) 2016/679, Articles 33 and 83'},
    {co:'India DPDP Act, 2023', tier:'confirmed', text:'The Digital Personal Data Protection Act, 2023 sets rules on consent, correction and erasure, creates a Data Protection Board, and allows penalties of up to ₹250 crore.', src:'Digital Personal Data Protection Act, 2023 (Government of India)'}
  ],
  mistakes:[`Keeping personal data in application logs forever.`, `Deleting a patient’s data but missing search indexes, analytics and backups.`, `Ignoring where vendors process patients’ data.`],
  interview:[`Mention data classes, residency, retention and deletion, PCI scope reduction with tokens, and audit logging.`],
  tryit:[
    {quiz:[{q:'After a payment is authorised, what should the clinic app do with the card CVV?', options:['Keep it encrypted', 'Keep it for 90 days', 'Never store it', 'Store it for refunds'], answer:2, why:'PCI DSS does not allow storing the CVV after authorisation.'}, {q:'Why give each user their own encryption key?', options:['To speed up logins', 'Deleting the key makes leftover copies unreadable', 'To avoid TLS', 'To hide the schema'], answer:1, why:'This is crypto-shredding. It helps when copies sit in backups.'}]},
    {note:'What should you do with each piece of data?', mount:host => sortGame(host, [
      {t:'Card CVV after a successful payment', c:'never', why:'PCI DSS forbids storing it after authorisation.'},
      {t:'Full card number for one-click checkout', c:'token', why:'Use a gateway token instead.'},
      {t:'Aadhaar number used only for one-time KYC', c:'token', why:'Mask or vault it, and keep only what you must.'},
      {t:'Patient’s email for login', c:'keep', why:'The service needs it, so protect it.'},
      {t:'Raw GPS trail from 4 years ago with no purpose', c:'never', why:'Delete it under the retention rule.'},
      {t:'Appointment address for an active booking', c:'keep', why:'It is needed for the purpose.'}
    ], [{id:'keep', label:'Keep (protected)'}, {id:'token', label:'Tokenise, mask or vault'}, {id:'never', label:'Do not store or delete'}])}
  ],
  sources:[`GDPR (EU 2016/679)`, `Digital Personal Data Protection Act, 2023`, `PCI DSS v4.0 and v4.0.1`, `RBI circulars (2018 data storage, tokenisation)`, `CERT-In Directions (2022)`]
}
];

SDA.register({
  kind:'module', id:'security', order:12, level:'advanced', icon:'🔐', title:'Security',
  summary:'AuthN vs AuthZ; sessions vs JWT; OAuth 2.0, OIDC and SSO; RBAC/ABAC/ReBAC; API keys, TLS and mTLS; encryption and KMS; password hashing; secrets and rotation; OWASP Top 10 (injection, XSS, CSRF, SSRF); zero trust and tenant isolation; GDPR, India’s DPDP Act and PCI DSS.',
  outcomes:['Separate authentication from per-object authorisation and choose sessions or tokens', 'Explain OAuth/OIDC flows with PKCE and pick RBAC/ABAC/ReBAC models', 'Protect data with TLS/mTLS, KMS envelope encryption and proper password hashing', 'Manage and rotate secrets, and prevent the common OWASP vulnerabilities', 'Design for zero trust, tenant isolation and privacy regulations (GDPR, DPDP, PCI DSS)'],
  lessons,
  quiz:[
    {q:'A logged-in patient changes /records/1001 to /records/1002 and sees someone else’s record. The flaw is…', options:['Weak password hashing', 'Broken access control (no per-record permission check)', 'XSS', 'Missing TLS'], answer:1, why:'Authenticated does not mean authorised.'},
    {q:'JWT payloads are…', options:['Encrypted', 'Hashed', 'Signed but readable by anyone', 'Compressed secrets'], answer:2, why:'They are base64url-encoded JSON with a signature.'},
    {q:'The recommended OAuth flow for a mobile app is…', options:['Authorization code with PKCE', 'Implicit', 'Resource-owner password', 'Client credentials'], answer:0, why:'PKCE protects apps that cannot keep a secret.'},
    {q:'What does OpenID Connect add to OAuth 2.0?', options:['Encryption', 'An ID token that says who logged in', 'Rate limiting', 'Refresh tokens'], answer:1, why:'OAuth alone is about permission, not identity.'},
    {q:'“Doctors can read records only at their own clinic while on shift” is best expressed with…', options:['RBAC only', 'API keys', 'Firewall rules', 'ABAC'], answer:3, why:'It needs facts about the person, the record and the moment.'},
    {q:'Which is the best way to store user passwords?', options:['Argon2id with a per-user salt', 'AES-encrypted', 'SHA-256', 'MD5 with a global salt'], answer:0, why:'Slow, salted and memory-hungry makes each guess expensive.'},
    {q:'Envelope encryption protects data keys by…', options:['Storing them in the database', 'Locking them with a master key held in a KMS or HSM', 'Hashing them', 'Emailing them'], answer:1, why:'A usable key never sits next to the data.'},
    {q:'A secret was committed to a public repo yesterday. What is the first action?', options:['Delete the commit', 'Make the repo private', 'Rotate or revoke the secret now', 'Do nothing'], answer:2, why:'Assume it is already stolen.'},
    {q:'The main defence against SQL injection is…', options:['Escaping quotes by hand', 'Hiding error messages', 'A web firewall only', 'Parameterised queries'], answer:3, why:'Input stays data and never becomes code.'},
    {q:'SameSite cookies mainly defend against…', options:['SQL injection', 'CSRF', 'SSRF', 'Brute force'], answer:1, why:'A cross-site request does not carry the cookie.'},
    {q:'Under PCI DSS, storing the card CVV after authorisation is…', options:['Allowed if encrypted', 'Allowed for 90 days', 'Required', 'Not allowed'], answer:3, why:'Sensitive authentication data must not be stored.'},
    {q:'Zero trust means…', options:['No firewalls', 'No passwords', 'No trust from network location, so identity and policy are checked on every request', 'Trust all employees'], answer:2, why:'Access is based on identity and policy, not on where the request comes from.'},
    {type:'scenario', q:'Design authentication and authorisation for a clinic platform with patients, doctors, front-desk staff and internal support staff.', answer:'<ul><li><b>Identity:</b> patients log in with a phone one-time code and a bound device, or with a passkey. Doctors and front-desk staff use app login with MFA. Support staff use company single sign-on (OpenID Connect) with hardware-key MFA.</li><li><b>Tokens:</b> short-lived access tokens of about 10 minutes plus rotating refresh tokens for each device. The gateway checks JWTs against a JWKS and passes on an internal identity. A denylist handles logout and theft.</li><li><b>Authorisation:</b> RBAC for coarse roles (patient, doctor, front desk, support). ABAC and ReBAC for record rules: a patient owns her record, a doctor sees patients at their clinic while on shift, and a specialist sees a record only if it is shared. Enforce the rules in the records service and add row-level security in the database.</li><li><b>Support access:</b> time-boxed, linked to a ticket and audited, for one patient at a time.</li><li><b>Audit:</b> log every access to a patient record.</li></ul>'},
    {type:'scenario', q:'You run a clinic payments feature in India. Outline the security and compliance design for card and UPI data.', answer:'<ul><li><b>Scope reduction:</b> a PCI-DSS-compliant gateway handles card data and gives network tokens (RBI card-on-file rules). Your systems store only tokens and the last 4 digits, and never the CVV.</li><li><b>Residency:</b> payment-system data stays in Indian regions (RBI 2018), including backups and logs. The emergency region is also in India.</li><li><b>Crypto:</b> TLS 1.3 everywhere, mTLS between services, KMS envelope encryption with hardware-backed keys, field-level encryption for sensitive IDs, and key rotation.</li><li><b>Access:</b> least privilege and just-in-time admin access, audited, with the card data environment kept apart.</li><li><b>Detection and response:</b> central security logs, alerts, a CERT-In 6-hour reporting process, a DPDP breach notice process, and regular penetration tests and audits.</li></ul>'}
  ],
  cheatsheet:[
    {h:'🪪 Identity', items:['AuthN is who, AuthZ is what (every request, every record)', 'MFA or passkeys, and limit login attempts', 'Sessions can be cancelled but need a store', 'JWT is signed, not encrypted, so keep it short-lived and refresh it', 'Pin the algorithm and check exp, iss and aud']},
    {h:'🔁 OAuth, OIDC and access models', items:['Authorization code with PKCE for apps, client credentials for services', 'Scopes are least privilege', 'OIDC ID token for login, SSO through an identity provider', 'RBAC roles, ABAC facts, ReBAC relationships', 'One policy engine, default deny']},
    {h:'🔒 Crypto', items:['TLS 1.3 everywhere and mTLS inside', 'KMS envelope encryption, keys kept away from data', 'Field-level encryption or tokens for sensitive IDs', 'Passwords: Argon2id, scrypt or bcrypt with a salt', 'Never invent your own crypto']},
    {h:'🗝 Secrets', items:['Secrets manager and workload identity', 'No secrets in git, images or logs', 'Rotate with overlap and use dynamic credentials', 'A leaked secret means rotate first']},
    {h:'🛡 OWASP', items:['A01 broken access control', 'Injection: parameterised queries', 'XSS: output encoding, CSP and HttpOnly', 'CSRF: SameSite cookies and tokens', 'SSRF: egress allow-list and IMDSv2', 'Patch dependencies and keep a parts list']},
    {h:'⚖️ Zero trust and privacy', items:['No trust from network location', 'Check user, device and service identity on every request', 'Tenant ID in every key, query and index', 'Collect less, get consent, keep data local, delete on request', 'GDPR 72 h, CERT-In 6 h, DPDP up to ₹250 crore', 'PCI: never store the CVV, use tokens']}
  ],
  glossary:[
    {term:'Authentication', aka:['AuthN', 'authenticated'], def:'Checking who someone is. Example: a patient proves her identity with a password and a one-time code.'},
    {term:'Authorization', aka:['authorisation', 'AuthZ', 'access control'], def:'Deciding what an identified person may do. Example: a patient may read her own record but not another patient’s.'},
    {term:'Multi-factor authentication', aka:['MFA', '2FA'], def:'Proving who you are with two or more different things. Example: a password plus a code sent to your phone.'},
    {term:'Passkey', aka:['passkeys', 'WebAuthn', 'FIDO2'], def:'A login method that replaces the password with a key stored on your device, so phishing cannot steal it. Example: unlock the clinic app with your fingerprint.'},
    {term:'IDOR', aka:['insecure direct object reference'], def:'Insecure direct object reference: a flaw where changing an ID in the address shows someone else’s data. Example: changing /records/1001 to /records/1002 shows another patient’s record.'},
    {term:'Least privilege', def:'Giving only the minimum access needed for a job. Example: a billing clerk can see invoices but not diagnoses.'},
    {term:'Server-side session', aka:['session cookie', 'server sessions'], def:'Login state kept on the server, with a random ID in the user’s cookie. Example: the cookie says session 9f2c, and the server knows that means Asha.'},
    {term:'JWT', aka:['JSON Web Token', 'JWTs'], def:'JSON Web Token: a compact signed token with facts such as user ID and expiry. Any service can check it without calling the server. Example: a token that says user u_42 until 10:15.'},
    {term:'Token claims', aka:['JWT claims'], def:'The facts stored inside a token, such as who it is for, when it expires and what it allows. Example: sub = u_42 and exp = 10:15.'},
    {term:'Access token', def:'A short-lived credential that an app shows to an API to prove it may call it. Example: a token that is valid for 10 minutes.'},
    {term:'Refresh token', def:'A longer-lived credential used to get a new access token without asking for the password again. The server can cancel it. Example: the phone swaps it for a fresh 10-minute token.'},
    {term:'JWKS', aka:['JSON Web Key Set'], def:'JSON Web Key Set: a published list of public keys that services use to check token signatures. Example: the login server publishes its keys at one address.'},
    {term:'Denylist', def:'A list of tokens or IDs that must be refused even though they look valid. Example: a stolen phone’s token is added to the denylist.'},
    {term:'OAuth 2.0', aka:['OAuth'], def:'A standard that lets an app get limited access to someone’s data without their password. Example: a lab app reads a patient’s test results after she approves it.'},
    {term:'OpenID Connect', aka:['OIDC'], def:'A layer on top of OAuth that tells the app who logged in, using an ID token. Example: “Sign in with Google”.'},
    {term:'ID token', def:'A token from OpenID Connect that says who the user is, meant for the app that asked. Example: it says the user is asha@example.com.'},
    {term:'PKCE', aka:['proof key for code exchange'], def:'Proof Key for Code Exchange: a secret challenge that stops a stolen OAuth code from being used. Example: the app proves it is the same one that started the login.'},
    {term:'OAuth scope', aka:['OAuth scopes'], def:'A named permission that an app asks for and the user approves. Example: results:read allows reading test results but not changing them.'},
    {term:'Client credentials', aka:['client credentials flow'], def:'An OAuth flow where one service gets a token for itself, with no user involved. Example: the Records service gets a token to call the Lab service.'},
    {term:'Single sign-on', aka:['SSO'], def:'Logging in once, then using many apps without logging in again. Example: staff sign in once and open all 40 internal tools.'},
    {term:'Identity provider', aka:['IdP'], def:'A service that checks who users are and tells other apps. Example: the clinic’s staff login service.'},
    {term:'SAML', def:'An older XML-based standard for single sign-on, common in large companies. Example: a company directory lets staff into a vendor’s website.'},
    {term:'RBAC', aka:['role-based access control'], def:'Role-based access control: permissions go to roles, and people get roles. Example: the doctor role may read and write records.'},
    {term:'ABAC', aka:['attribute-based access control'], def:'Attribute-based access control: rules that check facts about the person, the record and the situation. Example: allow if same clinic and on shift.'},
    {term:'ReBAC', aka:['relationship-based access control', 'Zanzibar'], def:'Relationship-based access control: access comes from links such as owner or shared with. Example: a specialist can open a record that a doctor shared with them.'},
    {term:'Policy engine', aka:['OPA', 'Open Policy Agent', 'Cedar'], def:'A component that decides access using rules written as code. Example: services ask it “may Dr Meera read record 7?”.'},
    {term:'API key', aka:['API keys'], def:'A long secret string that identifies a calling app. Example: an outside lab sends its key with each lab-order request.'},
    {term:'SPIFFE', aka:['SPIRE', 'workload identity'], def:'A standard that gives each service a verifiable identity. Example: spiffe://clinic/records names the Records service.'},
    {term:'Encryption at rest', aka:['data at rest', 'at rest'], def:'Scrambling stored data on disks, databases and backups. Example: a stolen backup disk shows only unreadable bytes.'},
    {term:'Encryption in transit', aka:['data in transit', 'in transit'], def:'Scrambling data while it travels over a network, usually with TLS. Example: the patient’s phone talks to the server over HTTPS.'},
    {term:'AES-GCM', aka:['AES', 'AES-256'], def:'A widely used way to encrypt data that also detects tampering. Example: it locks a patient record with a data key.'},
    {term:'KMS', aka:['key management service'], def:'Key management service: a service that stores keys and uses them for you under strict rules. Example: the app asks it to unlock a data key, and it logs the request.'},
    {term:'HSM', aka:['hardware security module'], def:'Hardware security module: a tamper-resistant device that keeps keys and does the cryptography inside. Example: the master key never leaves it.'},
    {term:'Envelope encryption', def:'Locking data with a data key, then locking that data key with a master key. Example: the record and its locked data key are stored together.'},
    {term:'Field-level encryption', aka:['field-level'], def:'Encrypting single fields, such as an ID number, so even database administrators cannot read them. Example: the Aadhaar number column is stored encrypted.'},
    {term:'Crypto-shredding', def:'Making data unreadable by destroying the key that locks it. Example: delete a patient’s key, and every copy, even in backups, becomes useless.'},
    {term:'Tokenisation', aka:['network token'], def:'Replacing a sensitive value, such as a card number, with a harmless token, and keeping the original in a secure vault. Example: the clinic stores token tok_93f and not the card number.'},
    {term:'Salt', aka:['salted'], def:'A random value added to a password before hashing, different for each user. Example: two patients with the same password get different hashes.'},
    {term:'Pepper', def:'A secret value added to every password hash and kept outside the database, for example in a KMS. Example: a stolen database alone is not enough to crack the passwords.'},
    {term:'bcrypt', def:'A slow password hashing function with an adjustable cost. Example: cost 12 makes each guess take noticeably longer.'},
    {term:'Argon2', aka:['Argon2id'], def:'A modern password hashing function that needs a lot of memory, so guessing is expensive. Example: Argon2id is the usual choice today.'},
    {term:'Credential stuffing', def:'Trying usernames and passwords stolen from other sites against your login. Example: an attacker tries 10 million leaked pairs on the clinic portal.'},
    {term:'Secrets manager', aka:['Vault', 'secret store'], def:'A service that stores secrets, hands them to services, logs each use and can rotate them. Example: Vault or AWS Secrets Manager.'},
    {term:'Secret rotation', aka:['key rotation', 'credential rotation', 'rotation', 'rotate'], def:'Replacing a password or key regularly, or after a leak. Example: change the database password every 30 days without downtime.'},
    {term:'Dynamic secrets', aka:['dynamic credentials'], def:'Short-lived credentials made on demand for each client. Example: a service gets a database password that lasts one hour.'},
    {term:'OWASP Top 10', aka:['OWASP'], def:'A regularly updated list of the most serious web application risks. Example: broken access control is number one.'},
    {term:'SQL injection', aka:['SQLi', 'injection'], def:'An attack where input changes the meaning of a database query. Example: typing a trick string into a login box logs the attacker in without the right password.'},
    {term:'Parameterized query', aka:['parameterised query', 'parameterised queries', 'parameterized queries', 'prepared statement'], def:'A query where values are sent separately from the SQL code, so they cannot change it. Example: the login query treats the typed name as plain text.'},
    {term:'Cross-site scripting', aka:['XSS'], def:'An attack where a script from an attacker runs inside other users’ pages. Example: a doctor note with a script steals someone’s session.'},
    {term:'Content Security Policy', aka:['CSP'], def:'A browser rule that limits where scripts and other content may load from. Example: only scripts from the clinic’s own site may run.'},
    {term:'CSRF', aka:['cross-site request forgery', 'XSRF'], def:'Cross-site request forgery: a bad site makes your browser send a request to another site where you are logged in. Example: a hidden form changes your email at the clinic portal.'},
    {term:'SameSite cookie', aka:['SameSite'], def:'A cookie setting that stops the browser from sending the cookie on requests that start from other sites. Example: the forged request arrives without the login cookie.'},
    {term:'SSRF', aka:['server-side request forgery'], def:'Server-side request forgery: tricking a server into sending requests to places it should not, often internal ones. Example: an “import from link” feature fetches the cloud metadata address.'},
    {term:'IMDSv2', aka:['instance metadata service'], def:'AWS’s protected metadata service that needs a session token, so a simple SSRF cannot read it. Example: a trick request cannot fetch the server’s cloud credentials.'},
    {term:'Zero trust', aka:['zero-trust'], def:'A security approach with no trust based on network location. Every request is checked. Example: being on the clinic Wi-Fi gives no access by itself.'},
    {term:'BeyondCorp', def:'Google’s zero-trust model, where access depends on user and device identity and not on the network. Example: an employee works from home with the same access as in the office.'},
    {term:'Access proxy', aka:['identity-aware proxy'], def:'A gate in front of internal apps that checks identity, device and policy on every request. Example: it refuses the admin panel to a user without a hardware key.'},
    {term:'Threat modelling', aka:['threat model'], def:'Thinking through how an attacker could break a design, before you build it. Example: asking what happens if someone changes the record ID.'},
    {term:'GDPR', def:'The EU’s General Data Protection Regulation for personal data. Example: a person in the EU may ask a company to delete their data.'},
    {term:'DPDP Act', aka:['Digital Personal Data Protection Act', 'DPDP'], def:'India’s 2023 law on processing digital personal data. Example: a clinic must get consent and honour deletion requests.'},
    {term:'PCI DSS', aka:['PCI-DSS', 'PCI'], def:'The Payment Card Industry Data Security Standard for handling card data. Example: it forbids storing the CVV after authorisation.'},
    {term:'Data residency', aka:['data localisation', 'data localization'], def:'Rules saying certain data must be stored or processed in a given country. Example: Indian payment data is stored in India.'},
    {term:'Data minimisation', aka:['data minimization'], def:'Collecting and keeping only the personal data you need. Example: ask for a phone number only if the clinic really calls patients.'},
    {term:'Personal data', aka:['personal information'], def:'Any information that can identify a person. Example: a name, a phone number or a diagnosis linked to a patient.'},
    {term:'Consent', def:'A person’s clear, recorded agreement to a stated use of their data. Example: a patient agrees that the lab app may read her results.'}
  ],
  sources:['OWASP Top 10:2021 and OWASP Cheat Sheet Series', 'IETF RFCs 6749, 7636, 9700 (OAuth), 7519/7515 (JWT/JWS), 8446 (TLS 1.3), 9106 (Argon2); OpenID Connect Core 1.0', 'NIST SP 800-63B, SP 800-162, SP 800-207', 'Pang et al., Zanzibar (USENIX ATC 2019); Ward & Beyer, BeyondCorp (2014)', 'AWS KMS, IAM and IMDSv2 docs; HashiCorp Vault docs; SPIFFE docs', 'GDPR (EU 2016/679); Digital Personal Data Protection Act, 2023; PCI DSS v4; RBI circulars; CERT-In Directions (2022)', 'Public breach reports: Capital One (2019), Equifax (GAO 2018), Uber (2017), LinkedIn (2012)']
});
} catch(e){ console.error('[SDA] module security', e); SDA.errors.push({id:'security', error:e}); }
})();
