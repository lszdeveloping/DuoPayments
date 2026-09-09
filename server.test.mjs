import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('API exige senha, persiste registros e impede acerto de saldo desatualizado', async () => {
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, HOST: '127.0.0.1', PORT: '3098', DB_PATH: ':memory:', APP_PASSWORD: 'test-password-123' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Servidor não iniciou')), 10000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Servidor encerrou: ${code}`)); });
      child.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
    });
    const base = 'http://127.0.0.1:3098';
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/style.css`)).status, 200);
    assert.equal((await fetch(`${base}/api/state`)).status, 401);
    const login = await fetch(`${base}/api/login`, { method: 'POST', body: JSON.stringify({ password: 'test-password-123' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const post = (path, data) => fetch(`${base}/api/${path}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    assert.equal((await post('settings', { names: ['Lucas', 'Pedro'] })).status, 200);
    assert.equal((await post('income', { person: 0, amount: 10000, date: '2026-09-09', description: 'Serviço A' })).status, 201);
    const second = await post('income', { person: 1, amount: 8000, date: '2026-09-09', description: 'Serviço B' });
    assert.equal((await second.json()).summary.balance, 400);
    assert.equal((await post('settle', { balance: 2000 })).status, 409);
    const settled = await post('settle', { balance: 400 });
    const result = await settled.json();
    assert.equal(result.summary.balance, 0);
    assert.equal(result.entries.length, 3);
    assert.deepEqual(result.names, ['Lucas', 'Pedro']);
    assert.equal((await post('settle', { balance: 400 })).status, 400);
    assert.equal((await fetch(`${base}/api/settings`, { method: 'POST', headers: { Cookie: cookie, Origin: 'http://untrusted.example' }, body: JSON.stringify({ names: ['X', 'Y'] }) })).status, 403);
  } finally { child.kill(); }
});
