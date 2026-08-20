// Run 3d-babylon/?xrtest=1 in headless Chrome and print the verdict.
//
// The browser MCP is not always available, and this suite is the only thing
// standing between a code change and a broken viewer on a URL the dossier now
// links. Node 22+ has a WebSocket client built in, so driving Chrome over the
// DevTools protocol needs no dependencies at all.
//
//   node tools/run-xrtest.mjs [url]
//
// Exits non-zero if any assertion fails, so it can gate a commit.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_ = process.argv[2] || 'http://localhost:8777/3d-babylon/?xrtest=1';
const CHROME = process.env.CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333 + (process.pid % 200);
const profile = mkdtempSync(join(tmpdir(), 'xrtest-'));

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--window-size=1280,800',
  '--no-first-run', '--no-default-browser-check',
  URL_,
], { stdio: ['ignore', 'ignore', 'pipe'] });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch {}
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);

async function targets() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(500);
  }
  throw new Error('Chrome never exposed a debuggable page');
}

const page = await targets();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
ws.onmessage = e => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise(res => {
  const n = ++id;
  pending.set(n, res);
  ws.send(JSON.stringify({ id: n, method, params }));
});

const evaluate = async expr => {
  const r = await send('Runtime.evaluate', {
    expression: expr, awaitPromise: true, returnByValue: true,
  });
  if (r.result?.exceptionDetails) {
    throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw');
  }
  return r.result?.result?.value;
};

// The suite spawns pets, loads a 2 MB wasm and a glTF plugin; give it room.
const DEADLINE = Date.now() + 5 * 60 * 1000;
let out = null;
process.stdout.write('running');
while (Date.now() < DEADLINE) {
  await sleep(2000);
  process.stdout.write('.');
  try {
    out = await evaluate('window.__arTest && window.__arTest.done ? JSON.stringify(window.__arTest) : null');
  } catch (e) {
    // A page-level SyntaxError means the viewer never booted at all.
    const err = await evaluate('String(window.__bootError || "")').catch(() => '');
    if (err) { console.error('\nviewer failed to boot:', err); process.exit(2); }
  }
  if (out) break;
}
console.log();

if (!out) { console.error('timed out waiting for the suite'); process.exit(3); }
const res = JSON.parse(out);
// A thrown suite sets `error` and leaves `failed` undefined — reporting only
// `failed` printed "57/57 passed" over a run that had died two thirds of the way
// through. Treat a throw as a failure, loudly.
if (res.error) console.error('\nsuite threw:\n' + res.error);
const failed = res.failed || [];
for (const f of failed) console.error(`  FAIL  ${f.name}${f.detail ? '  — ' + f.detail : ''}`);
console.log(`${res.results.length - failed.length}/${res.results.length} passed`);
process.exit(failed.length || res.error ? 1 : 0);
