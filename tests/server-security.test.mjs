import test from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 39000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${PORT}`;

async function waitUp() {
  for (let i = 0; i < 50; i++) {
    try { await fetch(base + '/api/bot/status'); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('server no arrancó');
}

test('servidor: localhost, token obligatorio, CORS restringido, claves ignoradas', async (t) => {
  const env = { ...process.env, PORT: String(PORT), BOT_API_TOKEN: 'secreto-test', DITTO_API_KEY: '', PRIVATE_KEY: '', WALLET_ADDRESS: '' };
  delete env.HOST;
  delete env.NODE_TEST_CONTEXT;
  const proc = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  proc.stdout.on('data', (d) => (out += d));
  t.after(() => proc.kill());
  await waitUp();
  assert.match(out, /127\.0\.0\.1/);

  assert.strictEqual((await fetch(base + '/api/bot/status')).status, 401);
  assert.strictEqual((await fetch(base + '/api/bot/status', { headers: { Authorization: 'Bearer malo' } })).status, 401);

  const auth = { Authorization: 'Bearer secreto-test' };
  let r;
  for (let i = 0; i < 50; i++) {
    r = await fetch(base + '/api/bot/status', { headers: auth });
    if (r.status !== 503) break;
    await new Promise((res) => setTimeout(res, 100));
  }
  assert.strictEqual(r.status, 200);
  const st = await r.json();
  assert.strictEqual(st.leverage, 1);
  assert.strictEqual(st.maxConcurrentTrades, 1);
  assert.strictEqual(st.hasAgentKey, false);

  const evil = await fetch(base + '/api/bot/status', { headers: { ...auth, Origin: 'https://evil.example' } });
  assert.strictEqual(evil.status, 403);
  assert.strictEqual(evil.headers.get('access-control-allow-origin'), null);
  const ok = await fetch(base + '/api/bot/status', { headers: { ...auth, Origin: `http://localhost:${PORT}` } });
  assert.strictEqual(ok.headers.get('access-control-allow-origin'), `http://localhost:${PORT}`);

  // Intento de inyectar clave y apalancamiento por API: se ignora / se limita
  const cfg = await fetch(base + '/api/bot/config', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentPrivateKey: 'ditto_sk_fake', leverage: 20, maxConcurrentTrades: 9, allowedSymbols: ['PEPE'] }),
  });
  const body = await cfg.json();
  assert.strictEqual(body.status.hasAgentKey, false);
  assert.strictEqual(body.status.leverage, 1);
  assert.strictEqual(body.status.maxConcurrentTrades, 1);
  assert.deepStrictEqual(body.status.allowedSymbols, ['BTC', 'ETH']);
});
