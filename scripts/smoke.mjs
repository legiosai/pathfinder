// Smoke test in a real browser: serve dist/, open the main views and a few static pages in headless
// Chrome, and fail on any page error, console error or failed request, or a view missing its content.
// Usage: npm run build && node scripts/smoke.mjs   (CHROME=/path/to/chrome to override)
// No dependencies: it speaks the DevTools protocol over Node's built-in WebSocket.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.CHROME || 'google-chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () =>
  new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

// Each check opens `path` and waits until `ready` (an expression run in the page) is true.
const VIEWS = [
  ['home', '', `document.querySelectorAll('#certs > *').length > 10
    && !document.querySelector('#view-list').hidden && !!document.querySelector('#view-list h1')?.offsetHeight
    && !document.querySelector('nav a[href="#plan"], nav a[href="#progress"], #view-plan, #view-progress')
    && !document.querySelector('#view-list .path-grid') && document.querySelector('#view-paths').hidden`],
  ['paths tab', '#paths', `!document.querySelector('#view-paths').hidden
    && document.querySelector('nav a[data-route="ask"] + a[aria-current="page"]').hash === '#paths'
    && document.querySelectorAll('#path-grid .path-card').length >= 12`],
  ['path detail', '#path?id=cloud-aws', `!document.querySelector('#view-path').hidden
    && document.querySelector('nav a[data-route="paths"]').getAttribute('aria-current') === 'page'
    && document.querySelector('#path-body a.back').hash === '#paths'`],
  ['certification', '#cert?id=aws-saa', `!document.querySelector('#view-cert').hidden && /Solutions Architect/.test(document.querySelector('#cert-body h1')?.textContent || '')`],
  ['old plan link', '#plan?cert=aws-saa&hours=40', `location.hash === '#cert?id=aws-saa' && !document.querySelector('#view-cert').hidden && /Solutions Architect/.test(document.querySelector('#cert-body h1')?.textContent || '')`],
  ['practice', '#practice?cert=aws-clf-c02', `!document.querySelector('#view-practice').hidden && !!document.querySelector('#practice-body button')`],
  ['old Progress link and backup', '#progress', `location.hash === '#about' && !document.querySelector('#view-about').hidden && document.querySelector('#study-backup-download').offsetHeight > 0 && document.querySelector('#study-backup-restore').offsetHeight > 0`],
  ['compare', '#compare?ids=aws-saa,microsoft-az-104', `!document.querySelector('#view-compare').hidden && document.querySelectorAll('#compare-body .cmp-cert').length === 2`],
  // The chat page only: nothing is sent, so the test never reaches the chat's endpoint.
  ['ask', '#ask', `!document.querySelector('#view-ask').hidden && document.querySelectorAll('#chat-log > li').length > 0 && !!document.querySelector('#chat-input')`],
  ['home in Spanish', '?lang=es', `document.documentElement.lang === 'es' && document.querySelectorAll('#certs > *').length > 10`],
  ['certification page', 'c/aws-saa/', `!!document.querySelector('main h1') && document.querySelectorAll('.stat').length > 3`],
  ['certification page in Spanish', 'es/c/aws-saa/', `document.documentElement.lang === 'es' && !!document.querySelector('main h1')`],
  ['certification index', 'c/', `document.querySelectorAll('.idx li').length > 20`],
  ['comparison page', 'c/vs/aws-saa-vs-microsoft-az-104/', `document.querySelectorAll('.vs-table tbody tr').length > 5`],
  ['study path page', 'p/cloud-aws/', `document.querySelectorAll('main section').length >= 2`],
];

async function main() {
  const dist = join(root, 'dist');
  await readFile(join(dist, 'index.html')).catch(() => {
    throw new Error('dist/ is missing: run npm run build first');
  });
  const port = await freePort();
  const server = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs'), String(port)], { stdio: 'ignore' });
  const profile = await mkdtemp(join(tmpdir(), 'pathfinder-smoke-'));
  const debugPort = await freePort();
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--window-size=1280,900', 'about:blank'];
  // CI runners don't allow Chrome's sandbox (unprivileged user namespaces are off).
  if (process.env.CI) args.unshift('--no-sandbox');
  const browser = spawn(chrome, args, { stdio: 'ignore' });
  // However this ends, the browser and the server go with it.
  process.on('exit', () => {
    browser.kill();
    server.kill();
  });
  let failed = 0;
  try {
    const page = await connect(debugPort);
    const base = `http://127.0.0.1:${port}/`;
    for (const [name, path, ready] of VIEWS) {
      const problems = await check(page, base + path, ready);
      if (problems.length) failed++;
      console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name} (/${path})${problems.map((p) => `\n       ${p}`).join('')}`);
    }
    page.close();
  } finally {
    browser.kill();
    server.kill();
    await sleep(300);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
  if (failed) {
    console.error(`${failed} of ${VIEWS.length} checks failed.`);
    process.exit(1);
  }
  console.log(`All ${VIEWS.length} checks passed.`);
}

/** The first page target of the browser on `port`, with send() and a stream of events. */
async function connect(port) {
  let target;
  // A cold runner can take well over 15 s to start Chrome the first time; wait up to a minute.
  for (let i = 0; i < 400 && !target; i++) {
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    } catch {
      /* not up yet */
    }
    if (!target) await sleep(150);
  }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) for (const fn of listeners) fn(msg);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  for (const domain of ['Page', 'Runtime', 'Log', 'Network']) await send(`${domain}.enable`);
  return { send, on: (fn) => listeners.add(fn), off: (fn) => listeners.delete(fn), close: () => ws.close() };
}

/** Load `url` in a fresh document and wait for `ready`; returns what went wrong. */
async function check(page, url, ready) {
  const problems = [];
  const requests = new Map();
  const listen = ({ method, params: p }) => {
    if (method === 'Runtime.exceptionThrown') problems.push(`page error: ${p.exceptionDetails.exception?.description?.split('\n')[0] || p.exceptionDetails.text}`);
    if (method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'assert')) problems.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (method === 'Log.entryAdded' && p.entry.level === 'error') problems.push(`browser: ${p.entry.text}${p.entry.url ? ` (${p.entry.url})` : ''}`);
    if (method === 'Network.requestWillBeSent') requests.set(p.requestId, p.request.url);
    if (method === 'Network.responseReceived' && p.response.status >= 400) problems.push(`HTTP ${p.response.status}: ${p.response.url}`);
    if (method === 'Network.loadingFailed' && !p.canceled) problems.push(`request failed (${p.errorText}): ${requests.get(p.requestId)}`);
  };
  page.on(listen);
  try {
    // about:blank in between, so a hash-only change still loads a fresh document.
    await page.send('Page.navigate', { url: 'about:blank' });
    await page.send('Page.navigate', { url });
    const deadline = Date.now() + 20000;
    let ok = false;
    while (!ok && Date.now() < deadline) {
      await sleep(150);
      const r = await page.send('Runtime.evaluate', { expression: `location.href !== 'about:blank' && document.readyState === 'complete' && (${ready})`, returnByValue: true }).catch(() => null);
      ok = r?.result?.value === true;
    }
    if (!ok) problems.push(`never showed its content: ${ready}`);
    await sleep(500); // late errors (lazy images, deferred modules)
  } finally {
    page.off(listen);
  }
  return problems;
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
