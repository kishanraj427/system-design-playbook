// Browser check for the real lesson renderer. Usage: bun tools/deep-dive-test.js
const root = new URL('../', import.meta.url).pathname;
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml'};
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = Bun.file(root + path.slice(1));
    if (path.includes('..') || !(await file.exists())) return new Response('Not found', {status: 404});
    const ext = path.slice(path.lastIndexOf('.'));
    return new Response(file, {headers: {'Content-Type': mime[ext] || 'application/octet-stream'}});
  }
});
const appPath = process.argv[2] || '/index.html';
const chrome = Bun.spawn([
  'google-chrome', '--headless=new', '--no-sandbox', '--disable-gpu',
  '--disable-dev-shm-usage', '--disable-background-networking', '--virtual-time-budget=6000',
  '--dump-dom', `http://127.0.0.1:${server.port}/tools/deep-dive-test.html?app=${encodeURIComponent(appPath)}`
], {stdout:'pipe', stderr:'pipe'});
const output = await new Response(chrome.stdout).text();
const errors = await new Response(chrome.stderr).text();
const code = await chrome.exited;
server.stop();
if (code !== 0) {
  console.error(errors.slice(-1000));
  process.exit(1);
}
const result = output.match(/<pre id="result">([^<]+)<\/pre>/)?.[1] || 'No test result';
console.log(result);
process.exit(result === 'PASS' ? 0 : 1);
