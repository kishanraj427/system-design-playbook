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
  const issue = () => { token = sign({alg:'HS256', typ:'JWT'}, {sub:'u_42', name:'Asha', role:'customer', iat:clock, exp:clock + 900}); revoked = false; };
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
  const RES = {r1:{name:'Asha’s record (Hospital A)', hospital:'A', patient:'P1'}, r2:{name:'Rahul’s record (Hospital B)', hospital:'B', patient:'P2'}};
  const RBAC = {doctor:['read', 'write'], nurse:['read'], patient:[]};
  const P = {s:'meera', r:'r1', a:'read'}; const out = el('div');
  function abac(s, r, a){
    if (s.role === 'patient') return a === 'read' && s.patientId === r.patient ? [true, 'patients may read their own record'] : [false, 'patients can only read their own record'];
    if (s.hospital !== r.hospital) return [false, `subject.hospital (${s.hospital}) ≠ resource.hospital (${r.hospital})`];
    if (!s.shift) return [false, 'subject.onShift is false'];
    if (a === 'write' && s.role !== 'doctor') return [false, 'only doctors may write'];
    return [true, `same hospital (${s.hospital}), on shift, role ${s.role} allowed to ${a}`];
  }
  function run(){
    const s = SUB[P.s], r = RES[P.r]; const rb = RBAC[s.role].includes(P.a); const [ab, why] = abac(s, r, P.a);
    out.innerHTML = '';
    out.append(frag(h.table(['Model', 'Decision', 'Why'], [['RBAC (role → permissions)', rb ? '<span style="color:var(--ok)">ALLOW</span>' : '<span style="color:var(--bad)">DENY</span>', `role “${s.role}” has [${RBAC[s.role].join(', ') || 'nothing'}]`], ['ABAC (rules over attributes)', ab ? '<span style="color:var(--ok)">ALLOW</span>' : '<span style="color:var(--bad)">DENY</span>', why]], [])));
    if (rb !== ab) out.append(el('div', {class:'verdict warn'}, rb ? 'RBAC alone over-grants here: the role allows it, but the context (other hospital, off shift) should not.' : 'RBAC alone under-grants here: “patients can read their own record” depends on the relationship between subject and resource, which roles can’t express.'));
    else out.append(el('div', {class:'verdict ok'}, 'Both models agree for this request.'));
  }
  const shift = ui.toggle({label:'Dr Meera is on shift', checked:true, onChange:v => { SUB.meera.shift = v; run(); }});
  host.append(el('div', {class:'ctl-grid'},
    ui.select({label:'Who (subject)', value:P.s, options:Object.entries(SUB).map(([k, v]) => [k, `${v.name} · ${v.role}${v.hospital ? ' · hospital ' + v.hospital : ''}`]), onChange:v => { P.s = v; run(); }}).el,
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
  const USERS = [{username:'admin', pin:'9931', role:'admin'}, {username:'asha', pin:'4821', role:'customer'}, {username:'rahul', pin:'1177', role:'customer'}];
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
  summary:'Authentication proves who you are; authorisation decides what you may do. Keep them separate: verify identity once at the edge, then check permissions on every request, on the server, for every resource.',
  problem:`<p>A food-delivery API checks the login token and then returns <code>/orders/{id}</code> for whatever ID is requested. A curious user changes 1001 to 1002 and sees a stranger’s address and phone number. The user <i>was</i> authenticated; the API just never checked whether this user may see <i>that</i> order. This is the most common serious web vulnerability: broken access control.</p>`,
  intuition:`At an airport, showing your passport at check-in proves who you are (authentication). Your boarding pass decides which flight, seat and lounge you may use (authorisation). A valid passport doesn’t let you board any plane you like.`,
  how:{
    steps:[`<b>Authenticate</b>: verify credentials (password + MFA, passkey, SSO via OIDC, client certificate) and issue a session or token that identifies the principal.`, `Carry identity with each request (session cookie or access token) and validate it at the edge.`, `<b>Authorise every request</b> on the server: can <i>this</i> principal do <i>this</i> action on <i>this</i> resource? Check object ownership/tenant, not just “is logged in”.`, `Apply <b>least privilege</b>: default deny; grant the minimum needed; scope tokens (read vs write).`, `Log authentication and authorisation decisions for audit and detection.`],
    diagram:{title:'Identity at the edge, permission at the resource', w:800, h:230, alt:'A user logs in at the identity provider, gets a token, calls the API gateway which validates the token, and the order service checks ownership.',
      nodes:[{id:'u', type:'client', label:'User app', x:80, y:120}, {id:'idp', type:'ext', label:'Identity provider', sub:'password + MFA', x:250, y:40, w:150}, {id:'gw', type:'lb', label:'API gateway', sub:'validate token', x:330, y:150, w:140}, {id:'ord', type:'service', label:'Orders service', sub:'owner check', x:550, y:150, w:140}, {id:'db', type:'db', label:'Orders DB', x:730, y:150}],
      edges:[{from:'u', to:'idp'}, {from:'u', to:'gw'}, {from:'gw', to:'ord'}, {from:'ord', to:'db'}],
      steps:[
        {note:'<b>Authentication:</b> Asha proves who she is (password + OTP) and receives a short-lived token for subject <code>u_42</code>.', flow:[['u', 'idp', 'login + MFA'], ['idp', 'u', 'token(sub=u_42)']]},
        {note:'The gateway validates the token (signature, expiry, audience) and forwards the verified identity.', flow:[['u', 'gw', 'GET /orders/1002'], ['gw', 'ord', 'sub=u_42']]},
        {note:'<b>Authorisation:</b> the service loads order 1002, sees its owner is <code>u_77</code>, not u_42, and returns <b>404/403</b>. That check is what stops the attack.', flow:[['ord', 'db', 'SELECT … WHERE id=1002'], ['db', 'ord', 'owner=u_77']], status:{ord:'hot'}, hl:['ord']}
      ]},
    deep:`<p><b>IDOR</b> (insecure direct object reference) is the classic broken-access-control bug: authorise by ownership/tenant on every object lookup, ideally in a shared data-access layer (<code>WHERE id = $1 AND owner_id = $2</code>), not ad hoc in each handler. Random IDs reduce guessing but are not authorisation.</p><p><b>Where to enforce:</b> coarse checks (is authenticated, has scope <code>orders:read</code>) at the gateway; fine-grained checks (owns this order, same tenant) in the service that owns the data; database row-level security as defence in depth.</p><p><b>Strong authentication:</b> MFA (TOTP, push, hardware keys), passkeys (WebAuthn/FIDO2, phishing-resistant), rate-limited login with lockout/backoff, and credential-stuffing defences (breached-password checks, bot detection).</p>`
  },
  tradeoffs:{use:[`Central identity (IdP, SSO) with per-service, per-object authorisation`], avoid:[`Trusting user IDs or roles sent by the client`, `Authorisation only in the UI (hiding buttons)`], alt:[`Policy engines (OPA, Cedar) for complex, shared rules`, `Relationship-based access (Zanzibar-style) for sharing models`]},
  real:[
    {co:'OWASP Top 10 (2021)', tier:'confirmed', text:'Broken Access Control ranked #1 in the 2021 OWASP Top 10, found in some form in 94% of applications OWASP tested.', src:'OWASP Top 10:2021 — A01 Broken Access Control'},
    {co:'FIDO passkeys', tier:'confirmed', text:'Passkeys (FIDO2/WebAuthn) replace passwords with device-bound public-key credentials that resist phishing; Apple, Google and Microsoft support them across platforms.', src:'FIDO Alliance and W3C WebAuthn specification'},
    {co:'Order lookup in a delivery app', tier:'educational', text:'Every /orders/{id} query includes the caller’s user ID (or the restaurant’s/rider’s assignment), so guessing IDs returns nothing.', src:'Simplified educational design'}
  ],
  mistakes:[`Checking “is logged in” but not “owns this resource”`, `Accepting role or tenant from request bodies`, `Different authorisation logic copied into many handlers`],
  interview:[`Separate AuthN (IdP, tokens, MFA) and AuthZ (per-request, per-object, least privilege) in every design`],
  tryit:{note:'Authentication or authorisation?', mount:host => sortGame(host, [
    {t:'Verifying the OTP sent to the user’s phone', c:'n', why:'Proving identity.'},
    {t:'Checking that the order belongs to the caller', c:'z', why:'Permission on a resource.'},
    {t:'Validating a password against its hash', c:'n', why:'Identity.'},
    {t:'Allowing only admins to issue refunds', c:'z', why:'Permission.'},
    {t:'Signing in with Google', c:'n', why:'Federated identity (OIDC).'},
    {t:'A token scope of orders:read but not orders:write', c:'z', why:'Limits what can be done.'}
  ], [{id:'n', label:'Authentication'}, {id:'z', label:'Authorisation'}])},
  sources:[`OWASP Top 10:2021`, `OWASP Authorization and Authentication Cheat Sheets`, `NIST SP 800-63B Digital Identity Guidelines`]
},
{
  id:'sessions-vs-jwt', title:'Sessions vs JWTs', minutes:11, tags:['session','cookie','JWT','token','revocation','refresh token'],
  summary:'Server-side sessions store state on the server and give the client a random ID; JWTs put signed claims in the token so any service can verify it without a lookup. JWTs scale verification but are hard to revoke, so keep them short-lived and pair them with refresh tokens.',
  problem:`<p>Your monolith used server sessions in Redis. Now 30 microservices each need to know who the user is. Calling a session service on every request adds latency and a single point of failure, so someone proposes JWTs. Then a user reports a stolen phone: how do you log out a token that every service accepts on its own?</p>`,
  intuition:`A <b>session</b> is a cloakroom token: a plain numbered tag, and the attendant looks up your coat in the register. A <b>JWT</b> is a signed letter of introduction: anyone who recognises the signature trusts what it says without calling the issuer. But you can’t take a letter back once it has been handed out; you can only write an expiry date on it.`,
  how:{
    steps:[`<b>Session</b>: after login, the server stores {user, expiry, …} under a random ID and sets it in an <code>HttpOnly; Secure; SameSite</code> cookie. Each request looks it up. Logout deletes it immediately.`, `<b>JWT</b>: header.payload.signature, base64url-encoded. The payload holds claims (sub, exp, scopes). Services verify the signature (HMAC shared secret or, better across services, RSA/ECDSA public keys from a JWKS endpoint).`, `JWT payloads are <b>signed, not encrypted</b>: anyone can read them, so never put secrets or sensitive personal data in them.`, `Keep <b>access tokens short-lived</b> (5–15 min) and use a <b>refresh token</b> (stored safely, rotated on use, revocable server-side) to get new ones.`, `For revocation: short expiry, a denylist of token IDs (jti) checked at the gateway, or token introspection for high-risk actions.`],
    mount:host => jwtDemo(host),
    deep:`<p><b>Validate properly:</b> pin the expected algorithm (reject <code>alg: none</code> and algorithm-switching tricks), check <code>exp</code>, <code>nbf</code>, <code>iss</code> and <code>aud</code>, allow small clock skew, and rotate signing keys via <code>kid</code> + JWKS.</p><p><b>Where to store tokens in browsers:</b> localStorage is readable by any injected script (XSS steals it). HttpOnly cookies can’t be read by scripts but need CSRF protection (SameSite, CSRF tokens). Many teams use a backend-for-frontend that keeps tokens server-side and gives the browser only a session cookie.</p><p><b>Hybrid is common:</b> a session at the edge (gateway/BFF) for the browser, and short-lived internal JWTs minted by the gateway for service-to-service calls.</p>`
  },
  tradeoffs:{use:[`Sessions for browser apps where instant logout/revocation matters and a session store is easy`, `Short-lived JWTs for stateless verification across many services and for APIs`], avoid:[`Long-lived JWTs (days) without revocation`, `Sensitive data inside JWT payloads`, `JWTs in localStorage on XSS-prone apps`], alt:[`Opaque tokens + introspection endpoint`, `BFF pattern with server-side token storage`, `PASETO-style tokens with fewer footguns`]},
  real:[
    {co:'JWT standards', tier:'confirmed', text:'JWT (RFC 7519) defines claims like sub, exp and aud; JWS (RFC 7515) defines signing. Libraries that once accepted alg=none or confused HMAC and RSA keys led to well-known vulnerabilities.', src:'IETF RFC 7519, RFC 7515; Auth0 security advisory on JWT libraries (2015)'},
    {co:'OWASP guidance', tier:'confirmed', text:'OWASP’s cheat sheets recommend short-lived tokens, strict algorithm validation, HttpOnly/Secure/SameSite cookies and server-side revocation for sensitive applications.', src:'OWASP JSON Web Token Cheat Sheet; Session Management Cheat Sheet'},
    {co:'Super-app login', tier:'educational', text:'A 10-minute access token for APIs plus a rotating refresh token tied to the device; “log out of all devices” revokes refresh tokens and adds active token IDs to a short-lived denylist at the gateway.', src:'Simplified educational design'}
  ],
  mistakes:[`Thinking JWTs are encrypted`, `Trusting the token’s alg header`, `30-day access tokens with no way to revoke`],
  interview:[`Compare stateful sessions vs stateless tokens: revocation, scaling, storage, XSS/CSRF`, `Propose short access tokens + rotating refresh tokens + denylist for logout`],
  tryit:{note:'Edit the payload, switch alg to none, advance the clock and log out above. Then:', quiz:[{q:'You change role to admin inside a JWT’s payload without the secret. What happens?', options:['You become admin', 'The signature no longer matches, so the server rejects it', 'The token is encrypted so you can’t edit it', 'The server re-signs it'], answer:1, why:'Integrity is protected by the signature.'}, {q:'A user logs out. With 1-hour stateless JWTs and no denylist…', options:['The token is dead immediately', 'The token still works until it expires', 'The server deletes it', 'The browser encrypts it'], answer:1, why:'Stateless tokens can’t be recalled.'}], quizId:'sec-l2'},
  sources:[`RFC 7519, RFC 7515`, `OWASP JWT and Session Management Cheat Sheets`]
},
{
  id:'oauth-oidc-sso', title:'OAuth 2.0, OpenID Connect and SSO', minutes:12, tags:['OAuth 2.0','OIDC','PKCE','SSO','authorization code','ID token'],
  summary:'OAuth 2.0 lets an app get limited access to a user’s resources without their password (delegated authorisation). OpenID Connect adds a standard identity layer (ID tokens) for login and SSO. Use the authorization code flow with PKCE.',
  problem:`<p>A budgeting app wants to read your bank transactions. Giving it your net-banking password would let it do <i>anything</i> forever. Meanwhile your company has 40 internal tools, each with its own password, so people reuse weak ones and leavers keep access. You need delegated, limited, revocable access and one place to log in.</p>`,
  intuition:`A hotel key card. Reception (authorisation server) checks your ID once, then gives you a card (access token) that opens only your room and the gym (scopes), only until checkout (expiry). The room door never sees your passport. OIDC adds a small printed slip saying who you are (ID token).`,
  how:{
    steps:[`The app redirects the user to the <b>authorisation server</b> with client_id, redirect_uri, requested <b>scopes</b> and a <b>PKCE code_challenge</b> (hash of a random verifier).`, `The user logs in there (password, MFA, SSO) and consents to the scopes; the app never sees the password.`, `The server redirects back with a one-time <b>authorisation code</b>.`, `The app exchanges the code + <b>code_verifier</b> at the token endpoint for an <b>access token</b> (and refresh token). PKCE proves it is the same app that started the flow, so a stolen code is useless.`, `With <b>OIDC</b> (<code>scope=openid</code>) the response also includes an <b>ID token</b> (a JWT about the user) for login. SSO: other apps reuse the IdP session, so there is no new password prompt.`],
    diagram:{title:'Authorization code flow with PKCE (+ OIDC)', w:820, h:260, alt:'Browser is redirected to the authorization server, user logs in, a code returns to the app, which exchanges it with the verifier for tokens, then calls the API.',
      nodes:[{id:'b', type:'client', label:'Browser / mobile app', x:90, y:130, w:150}, {id:'app', type:'service', label:'Client app', sub:'holds code_verifier', x:300, y:200, w:150}, {id:'as', type:'ext', label:'Authorisation server', sub:'IdP · login + consent', x:520, y:60, w:180}, {id:'api', type:'service', label:'Resource API', sub:'checks scopes', x:720, y:200, w:140}],
      edges:[{from:'b', to:'as'}, {from:'b', to:'app'}, {from:'app', to:'as'}, {from:'app', to:'api'}],
      steps:[
        {note:'The app sends the user to the IdP with <code>scope=openid transactions:read</code> and a <b>code_challenge</b> = SHA-256(code_verifier).', flow:[['b', 'as', '/authorize + challenge']]},
        {note:'The user authenticates <b>at the IdP</b> (password + MFA) and approves read-only access. The app never sees the password.', hl:['as']},
        {note:'The IdP redirects back with a short-lived, single-use <b>code</b>.', flow:[['as', 'b', 'redirect ?code=…'], ['b', 'app', 'code']]},
        {note:'The app exchanges code + <b>code_verifier</b> for an access token, refresh token and (OIDC) ID token. The IdP checks SHA-256(verifier) = challenge.', flow:[['app', 'as', 'code + verifier'], ['as', 'app', 'tokens']]},
        {note:'The app calls the API with the access token; the API validates it and enforces the <code>transactions:read</code> scope.', flow:[['app', 'api', 'Bearer token'], ['api', 'app', 'transactions']]}
      ]},
    deep:`<p><b>Pick the right grant:</b> authorization code + PKCE for web, SPA and mobile apps; client credentials for service-to-service (no user); device authorization grant for TVs and CLIs. The implicit grant and resource-owner password grant are discouraged by current security best practice (RFC 9700) and dropped in the OAuth 2.1 draft.</p><p><b>OAuth ≠ authentication:</b> an access token says “the bearer may call this API”, not “this is Asha”. For login use OIDC’s ID token, and validate its iss, aud (your client_id), exp and nonce.</p><p><b>SSO in companies:</b> OIDC or SAML to a central IdP (Okta, Entra ID, Google Workspace, Keycloak) with SCIM provisioning, so disabling one account removes access everywhere. That is a big security win for offboarding.</p>`
  },
  tradeoffs:{use:[`Third-party/delegated API access with scopes`, `“Sign in with …” and enterprise SSO via OIDC`], avoid:[`Building your own authorisation server unless you must`, `Implicit or password grants`, `Using access tokens as proof of identity`], alt:[`SAML for older enterprise SSO`, `Simple sessions for a single first-party web app`, `API keys for server-to-server with no user context`]},
  real:[
    {co:'IETF / OpenID Foundation', tier:'confirmed', text:'OAuth 2.0 is RFC 6749 (2012), PKCE is RFC 7636, and the OAuth 2.0 Security Best Current Practice is RFC 9700; OpenID Connect Core 1.0 (2014) defines ID tokens and the UserInfo endpoint.', src:'IETF RFCs 6749, 7636, 9700; OpenID Connect Core 1.0'},
    {co:'Sign in with Google', tier:'confirmed', text:'Google’s sign-in for websites and apps is an OpenID Connect implementation; apps receive an ID token about the user and can request OAuth scopes for Google APIs.', src:'Google Identity — OpenID Connect documentation'},
    {co:'Account Aggregator framework (India)', tier:'confirmed', text:'India’s RBI-regulated Account Aggregator system lets users share financial data with apps through consent artefacts managed by licensed aggregators, rather than by sharing bank passwords: the same delegated-consent idea.', src:'RBI Master Direction on NBFC – Account Aggregators; Sahamati documentation'}
  ],
  mistakes:[`Skipping PKCE in mobile apps or SPAs`, `Requesting broad scopes “just in case”`, `Not validating the ID token’s audience and nonce`],
  interview:[`Draw the authorization-code + PKCE flow; explain scopes, access vs refresh vs ID tokens, and why OIDC is needed for login`],
  tryit:{note:'Order the flow:', mount:host => orderGame(host, ['App creates a random code_verifier and its SHA-256 code_challenge', 'Redirect the user to /authorize with scopes and the challenge', 'User logs in and consents at the identity provider', 'IdP redirects back with a one-time authorization code', 'App exchanges code + verifier for tokens', 'App calls the API with the access token'])},
  sources:[`RFC 6749, RFC 7636, RFC 9700`, `OpenID Connect Core 1.0`, `Aaron Parecki, OAuth 2.0 Simplified`]
},
{
  id:'rbac-abac', title:'RBAC, ABAC and relationship-based access', minutes:10, tags:['RBAC','ABAC','ReBAC','policy','least privilege','Zanzibar'],
  summary:'RBAC grants permissions through roles; ABAC evaluates rules over attributes of user, resource, action and context; ReBAC derives access from relationships (owner, member, shared-with). Most real systems combine them.',
  problem:`<p>A hospital system starts with roles: doctor, nurse, admin. Then come the requirements: doctors may only see patients in <i>their</i> hospital, only while on shift; patients may see their own records; a specialist may see a record only if it is shared with them. Roles alone lead to “role explosion” (doctor-hospitalA-dayshift-cardiology…).</p>`,
  intuition:`An office building. <b>RBAC</b>: badges by job (“manager badge opens floors 3–5”). <b>ABAC</b>: the door checks several things (department, time of day, clearance, which building). <b>ReBAC</b>: “you can enter this room because you are on the guest list of the person who booked it.”`,
  how:{
    steps:[`<b>RBAC</b>: users → roles → permissions. Easy to audit (“who is an admin?”). Struggles with per-resource and contextual rules.`, `<b>ABAC</b>: a policy evaluates attributes (user.department, resource.owner, resource.classification, time, device posture) for each request. Very expressive, harder to audit and test.`, `<b>ReBAC</b>: store relationships as tuples (doc:42#viewer@user:asha, folder:7#parent@doc:42) and check by traversing them (Google Zanzibar, OpenFGA, SpiceDB). Natural for sharing.`, `Centralise decisions in a <b>policy engine</b> (OPA/Rego, AWS Cedar) or authorisation service, with policies in code, tested and versioned; enforce in each service.`, `Default deny, least privilege, regular access reviews, and audit logs of decisions.`],
    mount:host => policyDemo(host),
    deep:`<p><b>Performance:</b> authorisation sits on every request. Cache decisions briefly; push coarse checks to the gateway; for ReBAC, systems like Zanzibar maintain consistency tokens (“zookies”) so a check is at least as fresh as the change that granted or revoked access, avoiding the “new enemy” problem (seeing a document after being removed from it).</p><p><b>List filtering:</b> “show me all documents I can see” is harder than “can I see doc 42?”. ABAC rules can sometimes compile into SQL filters; ReBAC systems provide reverse-index/lookup APIs.</p><p><b>Cloud IAM</b> is a mix: AWS IAM policies are ABAC-capable (conditions on tags, IP, MFA), attached to roles (RBAC), evaluated with explicit deny overriding allow.</p>`
  },
  tradeoffs:{use:[`RBAC for coarse org permissions`, `ABAC for contextual rules (tenant, region, time, data classification)`, `ReBAC for user-driven sharing (docs, folders, projects)`], avoid:[`Hundreds of fine-grained roles (role explosion)`, `Policy logic scattered in if-statements across services`], alt:[`Policy engines (OPA, Cedar)`, `Authorisation-as-a-service (OpenFGA, SpiceDB)`]},
  real:[
    {co:'Google Zanzibar', tier:'confirmed', text:'Zanzibar is Google’s global authorisation system for relationship-based access, serving Drive, YouTube, Photos and others; the paper describes trillions of ACL tuples and millions of checks per second with low latency.', src:'Pang et al., “Zanzibar: Google’s Consistent, Global Authorization System”, USENIX ATC 2019'},
    {co:'NIST', tier:'confirmed', text:'NIST standardised RBAC (ANSI INCITS 359-2004) and published guidance on ABAC (SP 800-162).', src:'NIST RBAC standard; NIST SP 800-162'},
    {co:'AWS IAM', tier:'confirmed', text:'IAM policies attach to roles and can include conditions on tags, source IP, MFA and time, supporting attribute-based access; an explicit deny always overrides an allow.', src:'AWS IAM documentation — policy evaluation logic, ABAC'}
  ],
  mistakes:[`Role explosion instead of attributes`, `Forgetting tenant/hospital attributes in checks`, `No way to answer “why was this allowed?”`],
  interview:[`Pick RBAC/ABAC/ReBAC per requirement and centralise policy; mention caching and audit`],
  tryit:{note:'Try Dr Kabir on Asha’s record, Dr Meera off shift, and Asha on her own record in the demo above. Then:', quiz:[{q:'“Anyone a document is shared with can view it” is most naturally modelled with…', options:['RBAC', 'ABAC', 'ReBAC (relationships)', 'Firewall rules'], answer:2, why:'Access derives from a relationship tuple.'}], quizId:'sec-l4'},
  sources:[`Zanzibar, USENIX ATC 2019`, `NIST SP 800-162`, `Open Policy Agent and AWS Cedar documentation`]
},
{
  id:'api-keys-mtls', title:'API keys, TLS and mutual TLS', minutes:9, tags:['API key','TLS','mTLS','certificate','SPIFFE','service identity'],
  summary:'API keys identify a calling application (not a user) and must be treated as secrets. TLS encrypts and authenticates the server; mutual TLS also authenticates the client with a certificate, giving strong service-to-service identity.',
  problem:`<p>A merchant integrates with a payment gateway using an API key. A developer pastes it into a public GitHub repo; within minutes bots find it. Inside your platform, 200 services call each other over plain HTTP on the internal network, so anyone who gets into that network can impersonate any service.</p>`,
  intuition:`An API key is a building access card with the company’s name on it: whoever holds it gets in. mTLS is a meeting where both sides show government-issued ID cards (certificates signed by a trusted authority) before talking, and then speak in a private language (encryption).`,
  how:{
    steps:[`<b>API keys</b>: random, high-entropy, prefixed for detection (<code>sk_live_…</code>), shown once, stored hashed server-side, scoped (read-only, per-resource), rate-limited, rotatable, and revocable.`, `<b>TLS</b>: the server presents a certificate chain to a trusted CA; the handshake agrees keys; traffic is encrypted and integrity-protected (TLS 1.3).`, `<b>mTLS</b>: the server also requests a client certificate and verifies it, so each side knows exactly which service is calling.`, `Automate certificates: short-lived certs issued and rotated automatically (service mesh, SPIFFE/SPIRE, cert-manager), with workload identity like <code>spiffe://prod/ns/payments/sa/api</code>.`, `Authorise on that identity: “only orders may call payments/charge”.`],
    diagram:{title:'Mutual TLS between two services', w:780, h:230, alt:'Orders and payments exchange certificates signed by an internal CA, verify each other, and then communicate over an encrypted channel.',
      nodes:[{id:'o', type:'service', label:'Orders', sub:'cert: spiffe://…/orders', x:120, y:130, w:170}, {id:'ca', type:'ext', label:'Internal CA', sub:'issues 24 h certs', x:390, y:40, w:150}, {id:'p', type:'service', label:'Payments', sub:'cert: spiffe://…/payments', x:660, y:130, w:180}],
      edges:[{from:'ca', to:'o', dashed:true}, {from:'ca', to:'p', dashed:true}, {from:'o', to:'p'}],
      steps:[
        {note:'An internal CA (or mesh control plane) issues each workload a <b>short-lived certificate</b> naming its identity.', flow:[['ca', 'o', 'cert'], ['ca', 'p', 'cert']], parallel:true},
        {note:'Orders connects; Payments presents its certificate. Orders verifies it chains to the CA and names <code>payments</code>.', flow:[['p', 'o', 'server cert']]},
        {note:'Payments requests a <b>client certificate</b>; Orders presents its own; Payments verifies it.', flow:[['o', 'p', 'client cert']]},
        {note:'Both sides are authenticated and traffic is encrypted. Payments’ policy allows identity <code>orders</code> to call <code>/charge</code>.', flow:[['o', 'p', 'POST /charge (encrypted)']], hl:['p']}
      ]},
    deep:`<p><b>API key hygiene:</b> keys in headers (not URLs, which end up in logs), secret scanning in repos and CI (GitHub push protection; providers revoke leaked keys automatically through partner programmes), separate test/live keys, and per-key audit logs. For user-delegated access prefer OAuth tokens; API keys don’t carry user identity or consent.</p><p><b>Certificate operations:</b> expiry is a classic outage cause, so automate renewal, monitor expiry dates, and prefer short lifetimes with automation over long lifetimes with manual renewal. Let’s Encrypt’s 90-day certificates pushed the industry toward automation (ACME).</p><p><b>Edge vs internal:</b> public clients use server-auth TLS plus tokens; partners or B2B integrations sometimes use mTLS at the edge (banking APIs, payment networks); internal service-to-service traffic increasingly uses mTLS everywhere (zero trust).</p>`
  },
  tradeoffs:{use:[`API keys for simple server-to-server integrations without user context`, `mTLS for service identity inside the platform and for high-trust B2B links`], avoid:[`API keys in mobile apps or front-end code (they will be extracted)`, `Long-lived manually renewed certificates`], alt:[`OAuth client credentials with short-lived tokens`, `Signed requests (HMAC of the request, as in AWS SigV4)`]},
  real:[
    {co:'Stripe API keys', tier:'confirmed', text:'Stripe uses publishable and secret keys with live/test prefixes, restricted keys with limited permissions, and participates in GitHub secret scanning to detect leaked keys.', src:'Stripe documentation — API keys; GitHub secret scanning partner programme'},
    {co:'SPIFFE / SPIRE', tier:'confirmed', text:'A CNCF-graduated standard and implementation for issuing short-lived, verifiable workload identities (SVIDs) used for mTLS between services.', src:'SPIFFE and SPIRE documentation'},
    {co:'Let’s Encrypt', tier:'confirmed', text:'A free, automated certificate authority (ACME protocol) issuing 90-day certificates, which made HTTPS-everywhere and automated renewal the norm.', src:'Let’s Encrypt documentation'}
  ],
  mistakes:[`Committing keys to git or embedding them in apps`, `One all-powerful key shared by many integrations`, `Certificates that expire unnoticed`],
  interview:[`Distinguish app identity (API key, client credentials, mTLS) from user identity (OIDC); mention rotation and scoping`],
  tryit:{note:'Pick the best fit:', mount:host => sortGame(host, [
    {t:'A merchant’s backend calling a payment gateway', c:'key', why:'Server-to-server, no user; scoped secret key.'},
    {t:'Orders service calling payments inside your cluster', c:'mtls', why:'Workload identity + encryption.'},
    {t:'A fitness app reading your Google Fit data', c:'oauth', why:'User-delegated access with consent.'},
    {t:'A bank-to-bank API on a private network', c:'mtls', why:'High-trust B2B identity.'},
    {t:'A third-party dashboard reading your GitHub repos', c:'oauth', why:'Delegated, scoped, revocable.'}
  ], [{id:'key', label:'API key'}, {id:'mtls', label:'mTLS'}, {id:'oauth', label:'OAuth token'}])},
  sources:[`RFC 8446 (TLS 1.3)`, `SPIFFE specification`, `OWASP REST Security Cheat Sheet`]
},
{
  id:'encryption', title:'Encryption in transit and at rest', minutes:10, tags:['encryption','AES-GCM','KMS','envelope encryption','TLS 1.3','HSM'],
  summary:'Encrypt in transit with TLS everywhere, and at rest with AES via a key management service using envelope encryption. The hard part is not the algorithm but key management: who can use which key, rotation and audit.',
  problem:`<p>A backup disk from your data centre goes missing. An engineer with database access exports the customers table. A misconfigured bucket exposes files to the internet. Which of these does “we encrypt everything” actually prevent? It depends on <i>where</i> the keys are and who can use them.</p>`,
  intuition:`A bank locker. Your valuables are in a box (data) locked with your key (data key). Your key itself is kept in the bank’s vault (KMS), which only lets authorised people use it and writes down every time someone does. A stolen box is useless without the vault’s cooperation.`,
  how:{
    stepper:{title:'Envelope encryption with a KMS', items:[
      {title:'Generate a data key', tag:'KMS', text:'The app asks the KMS for a new data key. It receives the key in plaintext <i>and</i> encrypted under a master key that never leaves the KMS/HSM.'},
      {title:'Encrypt the data', tag:'AES-256-GCM', text:'The app encrypts the record or file locally with the plaintext data key using authenticated encryption (AES-GCM), then wipes the plaintext key from memory.'},
      {title:'Store together', tag:'envelope', text:'Store the ciphertext next to the <b>encrypted</b> data key (the “envelope”). The database or bucket never holds a usable key.'},
      {title:'Decrypt', tag:'IAM + audit', text:'To read, the app sends the encrypted data key to the KMS, which checks IAM policy, logs the request and returns the plaintext data key.'},
      {title:'Rotate', tag:'lifecycle', text:'Rotating the master key only re-wraps data keys, so there is no need to re-encrypt terabytes. Revoking access to the master key crypto-shreds the data.'}]},
    deep:`<p><b>Layers at rest:</b> full-disk/volume encryption (protects against stolen disks), database TDE (stolen files/backups), application/field-level encryption (protects specific fields such as Aadhaar or card numbers even from DBAs and compromised DB credentials). Higher layers protect against more attackers but cost search/indexing ability.</p><p><b>In transit:</b> TLS 1.3 for every hop, including internal ones (mTLS); HSTS for browsers; disable old protocols and ciphers. Encryption doesn’t stop a legitimate-but-compromised app from reading data, so pair it with authorisation and monitoring.</p><p><b>Don’t roll your own:</b> use vetted libraries (libsodium/Tink, platform crypto), authenticated modes (GCM, ChaCha20-Poly1305), unique nonces, and KMS/HSM-held keys. Hashing (one-way) is not encryption (two-way); passwords need slow hashes (next lesson).</p>`
  },
  tradeoffs:{use:[`TLS everywhere; KMS-managed encryption at rest by default`, `Field-level encryption for the most sensitive identifiers`], avoid:[`Keys stored next to the data or in code`, `Home-made crypto or unauthenticated modes (ECB, raw CBC)`], alt:[`Tokenisation (replace values with tokens; keep originals in a vault)`, `Customer-managed keys for enterprise tenants`]},
  real:[
    {co:'AWS KMS / Google Cloud KMS', tier:'confirmed', text:'Cloud KMS services implement envelope encryption: data keys encrypt data and are wrapped by KMS keys held in HSMs, with IAM-controlled use and audit logging (e.g. CloudTrail).', src:'AWS KMS and Google Cloud KMS documentation'},
    {co:'TLS 1.3', tier:'confirmed', text:'TLS 1.3 (RFC 8446, 2018) removed legacy ciphers, made forward secrecy mandatory, and reduced the handshake to one round trip.', src:'IETF RFC 8446'},
    {co:'Card tokenisation in India', tier:'confirmed', text:'RBI’s card-on-file tokenisation rules (effective October 2022) stop merchants from storing actual card numbers; they store network tokens instead.', src:'RBI circulars on Card-on-File Tokenisation (2021–2022)'}
  ],
  mistakes:[`Believing disk encryption protects against SQL injection or stolen app credentials`, `Hard-coded encryption keys in config`, `Reusing nonces with AES-GCM`],
  interview:[`Say “TLS everywhere; KMS envelope encryption at rest; field-level for sensitive data; keys separated from data with audited access”`],
  tryit:{quiz:[{q:'Envelope encryption means…', options:['Encrypting emails', 'Data encrypted with a data key, which is itself encrypted by a master key in a KMS', 'Double TLS', 'Hashing twice'], answer:1, why:'Keys protect keys.'}, {q:'Which layer protects card numbers even from someone with full database read access?', options:['Disk encryption', 'TLS', 'Application/field-level encryption or tokenisation', 'Backups'], answer:2, why:'Lower layers decrypt transparently for DB users.'}], quizId:'sec-l6'},
  sources:[`AWS KMS documentation`, `RFC 8446`, `OWASP Cryptographic Storage Cheat Sheet`, `RBI tokenisation circulars`]
},
{
  id:'password-hashing', title:'Password hashing: bcrypt, scrypt, Argon2', minutes:9, tags:['password hashing','salt','bcrypt','Argon2id','pepper','credential stuffing'],
  summary:'Never store passwords, or fast hashes of them. Use a slow, salted, memory-hard password hash (Argon2id, scrypt or bcrypt) so each guess costs an attacker real time even after a breach.',
  problem:`<p>Your user table leaks. If passwords are stored as plain SHA-256, attackers with GPUs try billions of guesses a second, and common passwords fall in minutes. Worse, identical hashes reveal which users share a password. Since people reuse passwords, your breach becomes their email and bank breach too.</p>`,
  intuition:`A safe with a lock that takes 1 second to try each combination, instead of one you can spin through a million combinations a second. Honest users try once; a thief must try millions. Salt is like giving every safe a different lock model, so a thief can’t prepare one master list for all of them.`,
  how:{
    steps:[`On signup, generate a random per-user <b>salt</b> and compute a <b>slow password hash</b>: Argon2id (memory-hard), scrypt, or bcrypt (cost ≥ 10). Store algorithm, parameters, salt and hash together.`, `On login, recompute with the stored parameters and compare in constant time.`, `Tune cost so one hash takes ~100–500 ms on your servers; raise it over time and <b>rehash on next login</b>.`, `Optionally add a <b>pepper</b>: a secret kept in a KMS/HSM, outside the database.`, `Defend the login flow too: rate limits, MFA, breached-password checks, and credential-stuffing detection.`],
    mount:host => crackCalc(host),
    deep:`<p><b>OWASP’s current recommendations:</b> Argon2id with at least 19 MiB memory, 2 iterations and parallelism 1 (or equivalent trade-offs); scrypt with N=2¹⁷, r=8, p=1; bcrypt with work factor ≥ 10 (mind its 72-byte input limit); PBKDF2-HMAC-SHA256 with 600,000 iterations where FIPS compliance requires it.</p><p><b>Why memory-hard:</b> GPUs and ASICs have huge compute but limited fast memory per core. Requiring tens of MiB per guess slashes how many guesses run in parallel.</p><p><b>Capacity planning:</b> deliberate slowness means login is CPU-expensive. A 250 ms hash at 500 logins/s needs ~125 CPU cores, so protect login endpoints from floods with rate limits, or attackers can DoS you with the hash function.</p>`
  },
  tradeoffs:{use:[`Argon2id (or scrypt/bcrypt) for any user password`], avoid:[`MD5, SHA-1, SHA-256 alone, or any unsalted hash`, `Reversible encryption of passwords`, `Rolling your own scheme`], alt:[`Passkeys (no password to steal)`, `Delegating login to an IdP (OIDC)`]},
  real:[
    {co:'LinkedIn, 2012', tier:'confirmed', text:'LinkedIn’s 2012 breach exposed unsalted SHA-1 password hashes; millions were cracked quickly, and in 2016 a much larger set of credentials from the same breach (over 100 million) was offered for sale.', src:'LinkedIn statements (2012, 2016); widely reported breach analyses'},
    {co:'OWASP Password Storage Cheat Sheet', tier:'confirmed', text:'Recommends Argon2id first, then scrypt, bcrypt or PBKDF2, with specific minimum parameters.', src:'OWASP Password Storage Cheat Sheet'},
    {co:'Password Hashing Competition', tier:'confirmed', text:'Argon2 won the Password Hashing Competition in 2015 and is specified in RFC 9106.', src:'Password Hashing Competition; IETF RFC 9106'}
  ],
  mistakes:[`“We hash with SHA-256, so we’re safe”`, `A global salt shared by all users`, `Logging passwords in request logs or error traces`],
  interview:[`State “per-user salt + Argon2id/bcrypt with tuned cost, rehash on login, rate-limit login, MFA”`],
  tryit:{note:'Switch algorithms and lengths above, and type a password to see real salted SHA-256 values. Then:', quiz:[{q:'Two users have the same unsalted hash. An attacker learns…', options:['Nothing', 'They share a password; cracking one cracks both', 'Their emails', 'The salt'], answer:1, why:'Salts make identical passwords hash differently.'}], quizId:'sec-l7'},
  sources:[`OWASP Password Storage Cheat Sheet`, `RFC 9106 (Argon2)`, `NIST SP 800-63B`]
},
{
  id:'secrets-rotation', title:'Secrets management and key rotation', minutes:9, tags:['secrets','Vault','rotation','dynamic credentials','secret scanning'],
  summary:'Keep secrets out of code and images, deliver them at runtime from a secrets manager with access control and audit, make them short-lived where possible, and rotate without downtime using overlapping credentials.',
  problem:`<p>The production database password has been the same for four years. It is in a <code>.env</code> file in the repo, in three CI systems, on two laptops and in a Slack message from 2022. An employee left last month. Rotating it means editing 30 services at once and praying nothing breaks, so nobody does it.</p>`,
  intuition:`Office keys. Instead of everyone keeping copies of a master key forever, a security desk hands out a key card that works only for today and only for your floor, logs every use, and can deactivate it instantly.`,
  how:{
    stepper:{title:'Rotating a database password with zero downtime', items:[
      {title:'Store centrally', tag:'secrets manager', text:'The secret lives in Vault / AWS Secrets Manager / GCP Secret Manager, encrypted with KMS, readable only by specific service identities, with every read audited.'},
      {title:'Deliver at runtime', tag:'no code', text:'Services fetch it at start-up (or via a sidecar/CSI volume) using their workload identity. Nothing is in git, images or CI logs.'},
      {title:'Create credential B', tag:'overlap', text:'Rotation creates a second valid credential (new user or password) while A still works.'},
      {title:'Roll services to B', tag:'reload', text:'Services pick up B on refresh or restart. Both A and B work during the overlap, so there are no failures.'},
      {title:'Revoke A', tag:'verify', text:'After confirming nothing uses A (connection/audit logs), disable it.'},
      {title:'Go dynamic', tag:'best', text:'Better still: the secrets manager issues per-service, short-lived database credentials on demand (e.g. 1 hour), so there is nothing long-lived to leak.'}]},
    deep:`<p><b>Secret sprawl detection:</b> pre-commit hooks and server-side secret scanning (GitHub push protection, gitleaks, trufflehog) catch keys before they land; if one does land, <i>rotate</i>, because deleting the commit is not enough (it is in clones, forks and caches).</p><p><b>Bootstrapping (“secret zero”):</b> how does a service authenticate to the secrets manager without a secret? Use platform identity: cloud instance/workload identity, Kubernetes service account tokens, or SPIFFE identities.</p><p><b>Environment variables</b> are convenient but leak into crash dumps, child processes and debug endpoints; mounted files or direct API fetches with short TTLs are safer for high-value secrets.</p>`
  },
  tradeoffs:{use:[`A central secrets manager with workload identity and audit`, `Dynamic, short-lived credentials where supported`], avoid:[`Secrets in repos, images, tickets or chat`, `Shared credentials used by many services`], alt:[`IAM roles/workload identity to remove static secrets entirely`, `mTLS identities instead of shared passwords`]},
  real:[
    {co:'Uber, 2016 breach', tier:'confirmed', text:'Attackers used credentials found in a private GitHub repository to access an AWS S3 bucket containing data on about 57 million riders and drivers; Uber disclosed it in 2017.', src:'Uber statement (Nov 2017); U.S. FTC settlement (2018)'},
    {co:'HashiCorp Vault', tier:'confirmed', text:'Vault’s database secrets engine generates dynamic, time-limited database credentials per client and revokes them when leases expire.', src:'HashiCorp Vault documentation — Database secrets engine'},
    {co:'GitHub secret scanning', tier:'confirmed', text:'GitHub scans repositories for known secret formats and, with partner providers, can notify them so leaked tokens are revoked; push protection blocks commits containing secrets.', src:'GitHub documentation — secret scanning and push protection'}
  ],
  mistakes:[`Deleting a leaked key from git history instead of rotating it`, `Rotation scripts that switch all services at once with no overlap`, `Secrets printed in CI logs`],
  interview:[`Mention a secrets manager, workload identity, rotation with overlap, and dynamic credentials`],
  tryit:{note:'Order a zero-downtime rotation:', mount:host => orderGame(host, ['Create a second valid credential (B) alongside A', 'Store B in the secrets manager', 'Services reload and start using B', 'Confirm from logs that nothing still uses A', 'Revoke credential A'])},
  sources:[`HashiCorp Vault docs`, `OWASP Secrets Management Cheat Sheet`, `GitHub secret scanning docs`]
},
{
  id:'owasp-top10', title:'OWASP Top 10: XSS, CSRF, SQL injection, SSRF', minutes:13, tags:['OWASP','XSS','CSRF','SQL injection','SSRF','input validation'],
  summary:'Most breaches exploit a handful of well-known flaws. Parameterise queries (injection), encode output and use CSP (XSS), use SameSite cookies and tokens (CSRF), and restrict outbound requests (SSRF), plus fix access control, patch dependencies and log security events.',
  problem:`<p>A login form builds SQL by gluing strings together. A comment box renders user text as HTML. A “fetch image from URL” feature fetches whatever URL you give it, including the cloud metadata endpoint that hands out credentials. Each looks harmless in a code review; each has caused real breaches.</p>`,
  intuition:`A bank clerk who follows any instruction written on a deposit slip (“…and also transfer ₹1 lakh to me”) is an injection bug. The fix is to treat the slip’s contents strictly as data, never as instructions.`,
  how:{
    steps:[`<b>Injection</b> (SQL, NoSQL, OS command, LDAP): never build queries from strings; use parameterised queries/ORMs; validate input; run with least-privilege DB users.`, `<b>XSS</b>: untrusted data rendered as HTML/JS runs in victims’ browsers. Contextually encode output (frameworks do it by default; avoid <code>innerHTML</code>/<code>dangerouslySetInnerHTML</code>), sanitise rich text, and add a strict Content-Security-Policy; HttpOnly cookies limit damage.`, `<b>CSRF</b>: a malicious site makes the victim’s browser send an authenticated request. Use <code>SameSite=Lax/Strict</code> cookies, anti-CSRF tokens for state-changing requests, and check Origin.`, `<b>SSRF</b>: the server is tricked into fetching internal URLs (metadata services, admin panels). Allow-list destinations, block private/link-local ranges after DNS resolution, use IMDSv2, and egress proxies.`, `Also: broken access control (#1), outdated components (patch, SBOM, dependency scanning), security misconfiguration, logging and monitoring.`],
    mount:host => sqliDemo(host),
    html:h.table(['OWASP Top 10 (2021)', 'Typical fix'], [['A01 Broken Access Control', 'Server-side per-object authorisation, deny by default'], ['A02 Cryptographic Failures', 'TLS everywhere, strong at-rest encryption, no weak hashes'], ['A03 Injection (incl. XSS)', 'Parameterised queries, output encoding, CSP'], ['A04 Insecure Design', 'Threat modelling, secure patterns, abuse cases'], ['A05 Security Misconfiguration', 'Hardened defaults, no debug in prod, IaC + policy checks'], ['A06 Vulnerable & Outdated Components', 'SBOM, dependency scanning, fast patching'], ['A07 Identification & Authentication Failures', 'MFA, rate limits, secure sessions'], ['A08 Software & Data Integrity Failures', 'Signed artifacts, protected CI/CD, safe deserialisation'], ['A09 Security Logging & Monitoring Failures', 'Log auth/access events, alert, retain'], ['A10 Server-Side Request Forgery', 'Egress allow-lists, block internal ranges, IMDSv2']], []),
    deep:`<p><b>Defence in depth:</b> each control assumes another may fail. For XSS: auto-escaping templates + CSP with nonces + HttpOnly cookies + Trusted Types. For SSRF: URL allow-list + resolved-IP checks (beware DNS rebinding and redirects) + network egress rules + IMDSv2 (requires a session token via PUT, which simple SSRF can’t perform).</p><p><b>Process:</b> threat modelling at design time (STRIDE), SAST/DAST/dependency scanning in CI, bug bounties, and security review for risky changes. OWASP revises the Top 10 every few years, so check the latest edition.</p>`
  },
  tradeoffs:{use:[`Framework defaults (ORMs, auto-escaping) plus explicit reviews for dangerous sinks`], avoid:[`Blocklists of “bad characters” as the main defence`, `Disabling CSP or SameSite because something broke`], alt:[`Web application firewalls as an extra layer (not a substitute)`]},
  real:[
    {co:'Capital One, 2019', tier:'confirmed', text:'An SSRF-style attack against a misconfigured web application firewall let the attacker obtain cloud credentials from the instance metadata service and read data on about 100 million customers. AWS later promoted IMDSv2, which resists such attacks.', src:'Capital One statement (2019); U.S. DOJ complaint; AWS IMDSv2 announcement (Nov 2019)'},
    {co:'Equifax, 2017', tier:'confirmed', text:'Attackers exploited a known, already-patched Apache Struts vulnerability (CVE-2017-5638) that Equifax hadn’t applied, exposing data on about 147 million people: a vulnerable-components failure.', src:'U.S. GAO report on the Equifax breach (2018); FTC settlement'},
    {co:'OWASP Foundation', tier:'confirmed', text:'The OWASP Top 10 is a widely used awareness document of the most critical web application security risks, last fully updated in 2021 at the time of writing.', src:'OWASP Top 10:2021'}
  ],
  mistakes:[`String-concatenated SQL “because the input is validated”`, `innerHTML with user content`, `Server-side URL fetchers with no destination checks`],
  interview:[`Name concrete mitigations per risk: parameterised queries, output encoding + CSP, SameSite + CSRF tokens, egress allow-lists + IMDSv2`],
  tryit:{note:'Run the injection payloads above, then switch on parameterised queries. Then match each attack to its main defence:', mount:host => sortGame(host, [
    {t:'Comment field shows <script> to other users', c:'xss', why:'Encode output; CSP.'},
    {t:'Evil site auto-submits a transfer form using your cookie', c:'csrf', why:'SameSite cookies + CSRF tokens.'},
    {t:'Login with  admin\' --  as the username', c:'sqli', why:'Parameterised queries.'},
    {t:'“Import from URL” fetches http://169.254.169.254/', c:'ssrf', why:'Egress allow-list; block metadata/private IPs; IMDSv2.'}
  ], [{id:'sqli', label:'Injection'}, {id:'xss', label:'XSS'}, {id:'csrf', label:'CSRF'}, {id:'ssrf', label:'SSRF'}])},
  sources:[`OWASP Top 10:2021`, `OWASP Cheat Sheet Series (SQLi, XSS, CSRF, SSRF)`, `GAO-18-559 (Equifax)`, `AWS IMDSv2 documentation`]
},
{
  id:'zero-trust-tenancy', title:'Zero trust and tenant isolation', minutes:9, tags:['zero trust','BeyondCorp','least privilege','segmentation','tenant isolation'],
  summary:'Zero trust drops the idea of a trusted internal network: every request is authenticated, authorised and encrypted based on user, device and service identity. In SaaS, tenant isolation applies the same thinking between customers.',
  problem:`<p>Your security model is a strong firewall around the office and data centre: inside the VPN, everything trusts everything. One phished laptop on the VPN can reach the admin panel, the database and the build server. Attackers love flat networks because one foothold gives them everything.</p>`,
  intuition:`A castle with a moat versus a modern office. In the castle, once you cross the drawbridge you can wander anywhere. In the office, your badge is checked at every door, the badge reader also checks you’re on the right team, and some rooms need a fingerprint too.`,
  how:{
    steps:[`<b>Identity everywhere</b>: users via SSO + MFA; devices via managed certificates and posture checks; services via workload identity (mTLS/SPIFFE).`, `<b>Per-request access decisions</b> by an access proxy or policy engine using identity, device health, resource sensitivity and context, instead of network location.`, `<b>Least privilege and segmentation</b>: services can only reach what they need (network policies, mesh authorisation); just-in-time admin access.`, `<b>Encrypt everything</b>, including internal traffic, and <b>log everything</b> for detection.`, `<b>Tenant isolation</b> in SaaS: tenant identity in every request context, enforced in data access (RLS, per-tenant keys), compute (quotas, pools) and support tooling (no “view any tenant” without approval and audit).`],
    diagram:{title:'Zero-trust access (BeyondCorp-style)', w:800, h:240, alt:'An employee laptop reaches internal apps through an access proxy that checks user identity, device state and policy on every request.',
      nodes:[{id:'u', type:'client', label:'Employee laptop', sub:'any network', x:90, y:120, w:140}, {id:'ap', type:'lb', label:'Access proxy', sub:'per-request decision', x:320, y:120, w:150}, {id:'idp', type:'ext', label:'IdP + MFA', x:320, y:30, w:120}, {id:'dev', type:'ext', label:'Device inventory', sub:'patched? managed?', x:320, y:215, w:160}, {id:'app', type:'service', label:'Internal app', x:560, y:80, w:120}, {id:'adm', type:'service', label:'Admin panel', sub:'needs extra policy', x:580, y:180, w:150}],
      edges:[{from:'u', to:'ap'}, {from:'ap', to:'idp'}, {from:'ap', to:'dev'}, {from:'ap', to:'app'}, {from:'ap', to:'adm'}],
      steps:[
        {note:'From home Wi-Fi or office alike, all requests go through the <b>access proxy</b>; there is no “trusted network”.', flow:[['u', 'ap', 'GET /dashboard']]},
        {note:'The proxy checks <b>user identity</b> (SSO + MFA) and <b>device state</b> (managed, disk encrypted, OS patched).', flow:[['ap', 'idp', 'who?'], ['ap', 'dev', 'device ok?']], parallel:true},
        {note:'Policy allows the dashboard for this user and device: the request is forwarded over mTLS.', flow:[['ap', 'app', 'allowed']]},
        {note:'The same user on the same device is <b>denied</b> the admin panel: they lack the role, and admin access also requires a hardware key. Least privilege applies per resource.', status:{adm:'down'}, hl:['adm']}
      ]},
    deep:`<p><b>NIST SP 800-207</b> describes the components: policy decision point (policy engine + administrator) and policy enforcement points in the data path, fed by identity, device, threat-intelligence and activity signals.</p><p><b>Migration path:</b> start with SSO + MFA for all apps, put internal web apps behind an identity-aware proxy, enforce device management, then segment service-to-service traffic with mTLS and authorisation policies, and finally remove broad VPN access.</p><p><b>Tenant isolation failures</b> are often in “side doors”: admin/support tools, exports, search indexes, caches keyed without tenant ID, and analytics pipelines. Threat-model those as carefully as the main API.</p>`
  },
  tradeoffs:{use:[`Remote/hybrid workforces, cloud-native platforms, multi-tenant SaaS`], avoid:[`“Zero trust” as a product purchase without identity, device and policy foundations`], alt:[`Network segmentation + VPN as an interim step`]},
  real:[
    {co:'Google BeyondCorp', tier:'confirmed', text:'Google moved from a privileged corporate network to BeyondCorp, where access depends on user and device credentials checked by an access proxy, regardless of network location.', src:'Ward & Beyer, “BeyondCorp: A New Approach to Enterprise Security”, ;login: (2014)'},
    {co:'NIST SP 800-207', tier:'confirmed', text:'NIST’s Zero Trust Architecture (2020) defines zero-trust principles and logical components for enterprises.', src:'NIST Special Publication 800-207'},
    {co:'SaaS support tooling', tier:'educational', text:'Support engineers get time-boxed, approved, audited access to one tenant’s data at a time, never a global “impersonate any customer” button.', src:'Simplified educational design'}
  ],
  mistakes:[`Trusting traffic because it comes from an internal IP`, `Permanent broad admin rights`, `Tenant ID missing from cache keys or search indexes`],
  interview:[`Explain identity-based, per-request access with device posture, mTLS between services, and tenant isolation enforcement points`],
  tryit:{quiz:[{q:'In zero trust, being on the corporate network means…', options:['Full access', 'Nothing by itself: every request is authenticated and authorised', 'Admin rights', 'No MFA needed'], answer:1, why:'Network location is not a credential.'}, {q:'A cache key is "invoice:123" in a multi-tenant app. Risk?', options:['None', 'Tenant A may be served tenant B’s cached invoice 123', 'Slower cache', 'More memory'], answer:1, why:'Include tenant ID in keys.'}], quizId:'sec-l10'},
  sources:[`Ward & Beyer, BeyondCorp (2014)`, `NIST SP 800-207`, `AWS SaaS Tenant Isolation Strategies`]
},
{
  id:'compliance', title:'Privacy and compliance: GDPR, India’s DPDP Act, PCI DSS', minutes:11, tags:['GDPR','DPDP','PCI DSS','privacy','data localisation','consent'],
  summary:'Regulation shapes architecture: what you may collect, where it may live, how long you keep it, who can see it and how fast you must report breaches. Design for data minimisation, consent, residency, deletion and auditability from the start.',
  problem:`<p>Your app stores card numbers “for faster checkout”, keeps every user’s full history forever, copies production data into staging for testing, and runs analytics in a foreign cloud region. A user asks you to delete their data, a regulator asks where data is stored, and an auditor asks who accessed card data last quarter. None of these has an easy answer.</p>`,
  intuition:`A hospital’s patient files. You keep only what treatment needs, lock the cabinet, log who opened which file, return or destroy files when they are no longer needed, and some files may never leave the country. The rules exist because the data belongs to the patient, not the hospital.`,
  how:{
    stepper:{title:'Privacy by design: architecture checklist', items:[
      {title:'Map the data', tag:'inventory', text:'Classify data (public, internal, personal, sensitive personal, payment, health) and draw where it flows, including logs, backups, analytics and vendors.'},
      {title:'Minimise', tag:'collect less', text:'Collect only what the purpose needs; mask or tokenise (show the last 4 digits); avoid copying production personal data into lower environments.'},
      {title:'Consent & purpose', tag:'lawful basis', text:'Record consent and purpose per data use; let users withdraw consent; respect purpose limits in analytics and marketing.'},
      {title:'Residency', tag:'where', text:'Keep regulated data in permitted regions (e.g. Indian payment-system data stored in India per RBI); check where backups, logs and vendors process it.'},
      {title:'Rights & deletion', tag:'erase', text:'Support access, correction and erasure requests across all stores (including search indexes, caches and data lakes); define retention and delete on schedule; crypto-shred where deletion is hard.'},
      {title:'Protect & audit', tag:'controls', text:'Encryption, least privilege, access logs, breach detection; know your notification deadlines (e.g. GDPR 72 hours to the supervisory authority; CERT-In 6 hours for reportable incidents in India).'},
      {title:'Shrink PCI scope', tag:'cards', text:'Never store CVV after authorisation; use a PCI-compliant gateway/vault and network tokens so card data never touches most of your systems.'}]},
    html:h.table(['Regime', 'Applies to', 'Architecture impact'], [['<b>GDPR</b> (EU, 2018)', 'Personal data of people in the EU, wherever you are', 'Lawful basis/consent, data-subject rights, 72 h breach notification, transfer rules; fines up to €20M or 4% of global turnover'], ['<b>DPDP Act</b> (India, 2023)', 'Digital personal data processed in India, and abroad when offering goods/services to people in India', 'Notice + consent (with consent managers), purpose limitation, erasure, breach intimation, Data Protection Board; penalties up to ₹250 crore per instance. Rules set timelines; check the current notified status.'], ['<b>PCI DSS</b> v4', 'Anyone storing, processing or transmitting card data', 'Segment the cardholder-data environment, never store sensitive authentication data (CVV) after authorisation, encrypt PAN, quarterly scans, logging'], ['<b>RBI directions</b>', 'Payment systems and card networks in India', 'Payment data stored only in India (2018); card-on-file tokenisation (2022)']], []),
    deep:`<p><b>Deletion in distributed systems</b> is hard: data sits in primary DBs, replicas, caches, search indexes, event logs (Kafka retention), data lakes and backups. Design a deletion pipeline (a “forget user” event every store consumes), keep backups on a bounded retention, and use per-user encryption keys so deleting the key makes leftover copies unreadable (crypto-shredding).</p><p><b>Pseudonymisation vs anonymisation:</b> replacing names with IDs is still personal data if you can re-identify; true anonymisation (aggregation, k-anonymity, differential privacy) is much harder.</p><p><b>Not legal advice:</b> requirements change and depend on facts; involve legal/compliance teams and check the current text of laws and rules.</p>`
  },
  tradeoffs:{use:[`Minimisation, tokenisation, residency-aware storage, deletion pipelines and audit logs as default architecture`], avoid:[`Collecting everything “for future ML”`, `Copying raw production personal data into dev/test`, `Storing card numbers or CVV yourself`], alt:[`Outsourcing card storage to a PCI-compliant gateway/vault`, `Consent-management platforms`]},
  real:[
    {co:'GDPR', tier:'confirmed', text:'The EU General Data Protection Regulation (applicable since May 2018) allows fines up to €20 million or 4% of worldwide annual turnover, and requires notifying the supervisory authority of certain breaches within 72 hours.', src:'Regulation (EU) 2016/679, Articles 33 and 83'},
    {co:'India DPDP Act, 2023', tier:'confirmed', text:'The Digital Personal Data Protection Act, 2023 defines data principals and data fiduciaries, consent and consent managers, rights to correction and erasure, a Data Protection Board, and penalties of up to ₹250 crore.', src:'Digital Personal Data Protection Act, 2023 (Government of India)'},
    {co:'RBI and CERT-In', tier:'confirmed', text:'RBI’s 2018 directive requires payment-system data to be stored only in India; CERT-In’s April 2022 directions require reporting specified cyber incidents within 6 hours.', src:'RBI circular on Storage of Payment System Data (April 2018); CERT-In Directions under Section 70B (April 2022)'}
  ],
  mistakes:[`Personal data in application logs forever`, `Deletion that misses search indexes, analytics and backups`, `Ignoring where vendors process your users’ data`],
  interview:[`Mention data classification, residency, retention/deletion, PCI scope reduction via tokenisation, and audit logging`],
  tryit:{note:'What should you do with each piece of data?', mount:host => sortGame(host, [
    {t:'Card CVV after a successful payment', c:'never', why:'PCI DSS forbids storing sensitive authentication data after authorisation.'},
    {t:'Full card number for one-click checkout', c:'token', why:'Use network/gateway tokens instead.'},
    {t:'Aadhaar number used only for one-time KYC', c:'token', why:'Mask/vault it; keep only what you must.'},
    {t:'User’s email for login', c:'keep', why:'Needed for the service; protect it.'},
    {t:'Raw GPS trail from 4 years ago with no purpose', c:'never', why:'Delete per retention; minimise.'},
    {t:'Delivery address for active orders', c:'keep', why:'Needed for the purpose.'}
  ], [{id:'keep', label:'Keep (protected)'}, {id:'token', label:'Tokenise / mask / vault'}, {id:'never', label:'Don’t store / delete'}])},
  sources:[`GDPR (EU 2016/679)`, `Digital Personal Data Protection Act, 2023`, `PCI DSS v4.0 / v4.0.1`, `RBI circulars (2018 data storage; tokenisation)`, `CERT-In Directions (2022)`]
}
];

SDA.register({
  kind:'module', id:'security', order:12, level:'advanced', icon:'🔐', title:'Security',
  summary:'AuthN vs AuthZ; sessions vs JWT; OAuth 2.0, OIDC and SSO; RBAC/ABAC/ReBAC; API keys, TLS and mTLS; encryption and KMS; password hashing; secrets and rotation; OWASP Top 10 (injection, XSS, CSRF, SSRF); zero trust and tenant isolation; GDPR, India’s DPDP Act and PCI DSS.',
  outcomes:['Separate authentication from per-object authorisation and choose sessions or tokens', 'Explain OAuth/OIDC flows with PKCE and pick RBAC/ABAC/ReBAC models', 'Protect data with TLS/mTLS, KMS envelope encryption and proper password hashing', 'Manage and rotate secrets, and prevent the common OWASP vulnerabilities', 'Design for zero trust, tenant isolation and privacy regulations (GDPR, DPDP, PCI DSS)'],
  lessons,
  quiz:[
    {q:'A logged-in user changes /orders/1001 to /orders/1002 and sees someone else’s order. The flaw is…', options:['Weak password hashing', 'Broken access control (missing per-object authorisation)', 'XSS', 'Missing TLS'], answer:1, why:'Authenticated ≠ authorised.'},
    {q:'JWT payloads are…', options:['Encrypted', 'Signed but readable by anyone', 'Hashed', 'Compressed secrets'], answer:1, why:'Base64url-encoded JSON with a signature.'},
    {q:'The recommended OAuth flow for a mobile app is…', options:['Implicit', 'Resource-owner password', 'Authorization code with PKCE', 'Client credentials'], answer:2, why:'PKCE protects public clients.'},
    {q:'OIDC adds what to OAuth 2.0?', options:['Encryption', 'An ID token and standard identity claims for login', 'Rate limiting', 'Refresh tokens'], answer:1, why:'OAuth alone is authorisation.'},
    {q:'“Doctors can read records only in their own hospital while on shift” is best expressed with…', options:['RBAC only', 'ABAC', 'API keys', 'Firewall rules'], answer:1, why:'Attributes and context.'},
    {q:'Which is the best way to store user passwords?', options:['AES-encrypted', 'SHA-256', 'Argon2id with a per-user salt', 'MD5 with a global salt'], answer:2, why:'Slow, salted, memory-hard.'},
    {q:'Envelope encryption protects data keys by…', options:['Storing them in the DB', 'Encrypting them with a master key held in a KMS/HSM', 'Hashing them', 'Emailing them'], answer:1, why:'Keys never sit unprotected next to data.'},
    {q:'A secret was committed to a public repo yesterday. First action?', options:['Delete the commit', 'Rotate/revoke the secret immediately', 'Make the repo private', 'Nothing'], answer:1, why:'Assume it is compromised.'},
    {q:'Main defence against SQL injection:', options:['Escaping quotes by hand', 'Parameterised queries', 'Hiding error messages', 'A WAF only'], answer:1, why:'Input stays data, never code.'},
    {q:'SameSite cookies mainly defend against…', options:['SQL injection', 'CSRF', 'SSRF', 'Brute force'], answer:1, why:'Cross-site requests don’t carry the cookie.'},
    {q:'Under PCI DSS, storing the card CVV after authorisation is…', options:['Allowed if encrypted', 'Not allowed', 'Required', 'Allowed for 90 days'], answer:1, why:'Sensitive authentication data must not be stored.'},
    {q:'Zero trust means…', options:['No firewalls', 'No implicit trust from network location; verify identity and policy per request', 'No passwords', 'Trust all employees'], answer:1, why:'Identity-based, per-request access.'},
    {type:'scenario', q:'Design authentication and authorisation for a food-delivery platform with customers, restaurant partners, riders and internal support staff.', answer:'<ul><li><b>Identity</b>: customers via phone OTP + device binding (optionally passkeys); partners and riders via app login + MFA; staff via corporate SSO (OIDC) + hardware-key MFA.</li><li><b>Tokens</b>: short-lived access tokens (10 min) + rotating refresh tokens per device; gateway validates JWTs (JWKS) and mints internal tokens; denylist for logout/compromise.</li><li><b>Authorisation</b>: RBAC for coarse roles (customer, partner, rider, support); ABAC/ReBAC for object rules (customer owns order; restaurant sees its orders; rider sees only assigned order, address revealed near pickup); enforced in owning services + RLS.</li><li><b>Support</b>: time-boxed, ticket-linked, audited access to one customer at a time; masked phone numbers (call bridging).</li><li><b>Service-to-service</b>: mTLS with workload identities and allow-lists.</li></ul>'},
    {type:'scenario', q:'You run a payments app in India. Outline the security and compliance architecture for card and UPI data.', answer:'<ul><li><b>Scope reduction</b>: card data handled by a PCI-DSS-compliant gateway/vault with network tokenisation (RBI CoFT); your systems store tokens + last 4 digits only; never CVV.</li><li><b>Residency</b>: payment-system data stored in Indian regions only (RBI 2018), including backups and logs; DR region also in India.</li><li><b>Crypto</b>: TLS 1.3 everywhere, mTLS internally, KMS envelope encryption with HSM-backed keys, field-level encryption for sensitive identifiers; key rotation.</li><li><b>Access</b>: least privilege, JIT admin access, audited; segregated cardholder-data environment.</li><li><b>Detection & response</b>: centralised security logs, alerting, CERT-In 6-hour reporting process, DPDP breach intimation, regular VAPT and audits.</li><li><b>Privacy</b>: consent and purpose records, retention schedules, deletion pipeline.</li></ul>'}
  ],
  cheatsheet:[
    {h:'🪪 Identity', items:['AuthN = who; AuthZ = what (per request, per object)', 'MFA / passkeys; rate-limit login', 'Sessions: revocable, need a store', 'JWT: signed not encrypted; short-lived + refresh', 'Pin alg; check exp/iss/aud']},
    {h:'🔁 OAuth/OIDC & access models', items:['Auth code + PKCE for apps; client credentials for services', 'Scopes = least privilege', 'OIDC ID token for login; SSO via IdP', 'RBAC roles · ABAC attributes · ReBAC relationships', 'Central policy engine, default deny']},
    {h:'🔒 Crypto', items:['TLS 1.3 everywhere; mTLS inside', 'KMS envelope encryption; keys ≠ data', 'Field-level encryption / tokenisation for sensitive IDs', 'Passwords: Argon2id/scrypt/bcrypt + salt', 'Never roll your own']},
    {h:'🗝 Secrets', items:['Secrets manager + workload identity', 'No secrets in git, images, logs', 'Rotate with overlap; dynamic creds', 'Leaked? Rotate first']},
    {h:'🛡 OWASP', items:['A01 broken access control', 'Injection → parameterised queries', 'XSS → output encoding + CSP + HttpOnly', 'CSRF → SameSite + tokens', 'SSRF → egress allow-list + IMDSv2', 'Patch dependencies (SBOM)']},
    {h:'⚖️ Zero trust & privacy', items:['No trust from network location', 'User + device + service identity per request', 'Tenant ID in every key, query and index', 'Minimise, consent, residency, deletion', 'GDPR 72 h · CERT-In 6 h · DPDP up to ₹250 cr', 'PCI: never store CVV; tokenise']}
  ],
  glossary:[
    {term:'Authentication', aka:['AuthN'], def:'Verifying the identity of a user, device or service.'},
    {term:'Authorization', aka:['authorisation', 'AuthZ', 'access control'], def:'Deciding whether an authenticated principal may perform an action on a resource.'},
    {term:'Multi-factor authentication', aka:['MFA', '2FA'], def:'Requiring two or more independent proofs of identity, such as a password and a one-time code.'},
    {term:'Passkey', aka:['passkeys', 'WebAuthn', 'FIDO2'], def:'A phishing-resistant credential based on public-key cryptography, replacing passwords.'},
    {term:'IDOR', aka:['insecure direct object reference'], def:'An access-control flaw where changing an identifier exposes another user’s object.'},
    {term:'Least privilege', def:'Granting only the minimum access needed to perform a task.'},
    {term:'Server-side session', aka:['session cookie', 'server sessions'], def:'Server-stored login state referenced by a random identifier in a cookie.'},
    {term:'JWT', aka:['JSON Web Token', 'JWTs'], def:'A compact, signed token carrying claims, verifiable without a server-side lookup.'},
    {term:'Token claims', aka:['JWT claims'], def:'Statements inside a token, such as subject, expiry, audience and scopes.'},
    {term:'Access token', def:'A credential presented to an API to authorise requests, usually short-lived.'},
    {term:'Refresh token', def:'A longer-lived credential used to obtain new access tokens, revocable server-side.'},
    {term:'JWKS', aka:['JSON Web Key Set'], def:'A published set of public keys used to verify token signatures.'},
    {term:'OAuth 2.0', aka:['OAuth'], def:'A framework for delegated authorisation, letting apps access resources on a user’s behalf with limited scopes.'},
    {term:'OpenID Connect', aka:['OIDC'], def:'An identity layer on OAuth 2.0 that provides ID tokens for login and SSO.'},
    {term:'ID token', def:'An OIDC JWT describing the authenticated user, meant for the client app.'},
    {term:'PKCE', aka:['proof key for code exchange'], def:'An OAuth extension binding the authorisation code to the client that requested it.'},
    {term:'OAuth scope', aka:['OAuth scopes'], def:'A named permission requested by and granted to an OAuth client.'},
    {term:'Single sign-on', aka:['SSO'], def:'Logging in once at an identity provider to access many applications.'},
    {term:'Identity provider', aka:['IdP'], def:'A service that authenticates users and issues identity assertions or tokens.'},
    {term:'SAML', def:'An XML-based standard for enterprise single sign-on.'},
    {term:'RBAC', aka:['role-based access control'], def:'Granting permissions to roles and assigning roles to users.'},
    {term:'ABAC', aka:['attribute-based access control'], def:'Authorisation by evaluating rules over attributes of subject, resource, action and context.'},
    {term:'ReBAC', aka:['relationship-based access control', 'Zanzibar'], def:'Authorisation derived from relationships between subjects and objects.'},
    {term:'Policy engine', aka:['OPA', 'Open Policy Agent', 'Cedar'], def:'A component that evaluates authorisation policies defined as code.'},
    {term:'API key', aka:['API keys'], def:'A secret string identifying a calling application, used for simple server-to-server authentication.'},
    {term:'SPIFFE', aka:['SPIRE', 'workload identity'], def:'A standard for issuing verifiable identities to software workloads.'},
    {term:'Encryption at rest', def:'Encrypting stored data on disks, databases and backups.'},
    {term:'Encryption in transit', def:'Encrypting data as it moves over networks, typically with TLS.'},
    {term:'AES-GCM', aka:['AES', 'AES-256'], def:'A widely used authenticated symmetric encryption mode.'},
    {term:'KMS', aka:['key management service'], def:'A managed service that stores keys and performs cryptographic operations under access control.'},
    {term:'HSM', aka:['hardware security module'], def:'Tamper-resistant hardware that stores keys and performs crypto operations.'},
    {term:'Envelope encryption', def:'Encrypting data with a data key and encrypting that data key with a master key.'},
    {term:'Crypto-shredding', def:'Making data unreadable by destroying the keys that encrypt it.'},
    {term:'Tokenisation', aka:['tokenization (payments)', 'network token'], def:'Replacing sensitive values like card numbers with non-sensitive tokens, keeping originals in a secure vault.'},
    {term:'Salt', aka:['salted'], def:'A random per-user value combined with a password before hashing.'},
    {term:'Pepper', def:'A secret added to password hashing and stored outside the database.'},
    {term:'bcrypt', def:'An adaptive password-hashing function with a configurable work factor.'},
    {term:'Argon2', aka:['Argon2id'], def:'A memory-hard password-hashing function, winner of the Password Hashing Competition.'},
    {term:'Credential stuffing', def:'Trying username/password pairs leaked from other sites against your login.'},
    {term:'Secrets manager', aka:['Vault', 'secret store'], def:'A service that stores, delivers, audits and rotates secrets.'},
    {term:'Secret rotation', aka:['key rotation', 'credential rotation'], def:'Replacing credentials or keys periodically or after exposure.'},
    {term:'Dynamic secrets', aka:['dynamic credentials'], def:'Short-lived credentials generated on demand for each client.'},
    {term:'OWASP Top 10', aka:['OWASP'], def:'A regularly updated list of the most critical web application security risks.'},
    {term:'SQL injection', aka:['SQLi', 'injection'], def:'An attack where input alters the structure of a database query.'},
    {term:'Parameterized query', aka:['parameterised query', 'prepared statement'], def:'A query where values are sent separately from SQL code so they can’t change its structure.'},
    {term:'Cross-site scripting', aka:['XSS'], def:'Injecting scripts into pages viewed by other users.'},
    {term:'Content Security Policy', aka:['CSP'], def:'A browser policy restricting where scripts and other resources may load from.'},
    {term:'CSRF', aka:['cross-site request forgery', 'XSRF'], def:'Tricking a user’s browser into sending an authenticated request to another site.'},
    {term:'SameSite cookie', aka:['SameSite'], def:'A cookie attribute limiting when browsers send cookies on cross-site requests.'},
    {term:'SSRF', aka:['server-side request forgery'], def:'Tricking a server into making requests to unintended, often internal, destinations.'},
    {term:'IMDSv2', aka:['instance metadata service'], def:'AWS’s session-token-protected instance metadata service, resistant to simple SSRF.'},
    {term:'Zero trust', aka:['zero-trust'], def:'A security model with no implicit trust based on network location; every request is verified.'},
    {term:'BeyondCorp', def:'Google’s zero-trust access model based on user and device identity rather than network.'},
    {term:'GDPR', def:'The EU’s General Data Protection Regulation governing personal data.'},
    {term:'DPDP Act', aka:['Digital Personal Data Protection Act', 'DPDP'], def:'India’s 2023 law governing the processing of digital personal data.'},
    {term:'PCI DSS', aka:['PCI-DSS', 'PCI'], def:'The Payment Card Industry Data Security Standard for handling card data.'},
    {term:'Data residency', aka:['data localisation', 'data localization'], def:'Requirements that certain data be stored or processed within specific jurisdictions.'},
    {term:'Data minimisation', aka:['data minimization'], def:'Collecting and keeping only the personal data necessary for a purpose.'}
  ],
  sources:['OWASP Top 10:2021 and OWASP Cheat Sheet Series', 'IETF RFCs 6749, 7636, 9700 (OAuth), 7519/7515 (JWT/JWS), 8446 (TLS 1.3), 9106 (Argon2); OpenID Connect Core 1.0', 'NIST SP 800-63B, SP 800-162, SP 800-207', 'Pang et al., Zanzibar (USENIX ATC 2019); Ward & Beyer, BeyondCorp (2014)', 'AWS KMS, IAM and IMDSv2 docs; HashiCorp Vault docs; SPIFFE docs', 'GDPR (EU 2016/679); Digital Personal Data Protection Act, 2023; PCI DSS v4; RBI circulars; CERT-In Directions (2022)', 'Public breach reports: Capital One (2019), Equifax (GAO 2018), Uber (2017), LinkedIn (2012)']
});
} catch(e){ console.error('[SDA] module security', e); SDA.errors.push({id:'security', error:e}); }
})();
