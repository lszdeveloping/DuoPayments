import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import handler from './api/cloud.mjs';
import { issueSession, appSessionSecret } from './cloud-auth.mjs';

test('reset local exige login, senha e confirmação e apaga os registros', async () => {
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, HOST: '127.0.0.1', PORT: '3096', DB_PATH: ':memory:', APP_PASSWORD: 'test-login', RESET_PASSWORD: 'test-reset', DISCORD_PAYMENTS_TOKEN: 't'.repeat(32), DISCORD_GUILD_ID: '1559035931418304534' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => { child.stdout.once('data', resolve); child.once('error', reject); child.once('exit', code => reject(new Error(`exit ${code}`))); });
    let cookie = '';
    const post = (path, body, headers = {}) => fetch(`http://127.0.0.1:3096/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie, ...headers }, body: JSON.stringify(body) });
    const valid = { password: 'test-reset', confirm: 'APAGAR TUDO' };
    assert.equal((await post('reset', valid)).status, 401);
    const login = await post('login', { password: 'test-login' });
    cookie = login.headers.get('set-cookie').split(';')[0];
    await post('settings', { names: ['A', 'B'] });
    await post('income', { person: 0, amount: 10000, description: 'Teste', date: '2026-10-14' });
    const payment = { person: 0, amount: 10000, description: 'Teste', date: '2026-10-14', guildId: '1559035931418304534', channelId: '1559035931418304535', messageId: '1559035931418304536', customerId: '1559035931418304537', confirmedBy: '1559035931418304538', protocol: 'TEST' };
    const bot = { Authorization: `Bearer ${'t'.repeat(32)}` };
    assert.equal((await post('discord-payment', payment, bot)).status, 201);
    assert.equal((await post('reset', { ...valid, password: 'wrong' })).status, 403);
    assert.equal((await post('reset', { password: 'test-reset' })).status, 400);
    assert.equal((await (await fetch('http://127.0.0.1:3096/api/state', { headers: { cookie } })).json()).entries.length, 1);
    const reset = await post('reset', valid);
    assert.equal(reset.status, 200);
    const data = await reset.json();
    assert.deepEqual(data.entries, []);
    assert.deepEqual(data.names, ['Você', 'Seu sócio']);
    assert.equal(data.summary.total, 0);
    assert.equal(data.summary.balance, 0);
    // A fresh insert proves the private receipt was deleted too.
    assert.equal((await post('discord-payment', payment, bot)).status, 201);
    for (let i = 0; i < 7; i++) await post('reset', { ...valid, password: 'wrong' });
    assert.equal((await post('reset', valid)).status, 429);
  } finally { child.kill(); }
});

test('reset cloud valida autorização antes do RPC e limita tentativas', async () => {
  const previous = { ...process.env }, originalFetch = globalThis.fetch;
  try {
    Object.assign(process.env, { SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test', APP_PASSWORD: 'test', RESET_PASSWORD: 'test-reset', SESSION_SECRET: 's'.repeat(32) });
    let resets = 0, allowed = true;
    globalThis.fetch = async url => ({ ok: true, json: async () => { if (url.endsWith('duo_login_attempt')) return allowed; assert.ok(url.endsWith('duo_reset')); resets++; return { names: ['Você', 'Seu sócio'], entries: [] }; } });
    const cookie = `duo=${issueSession(appSessionSecret(process.env.SESSION_SECRET, process.env.APP_PASSWORD))}`;
    const request = async (body, auth = cookie, method = 'POST') => {
      const res = { setHeader() {}, end(raw) { this.data = JSON.parse(raw); } };
      await handler({ url: '/api/reset', method, body, headers: { host: 'test', cookie: auth } }, res);
      return res;
    };
    const valid = { password: 'test-reset', confirm: 'APAGAR TUDO' };
    assert.equal((await request(valid, '')).statusCode, 401);
    assert.equal((await request(valid, `duo_discord=${issueSession(appSessionSecret(process.env.SESSION_SECRET, process.env.APP_PASSWORD))}`)).statusCode, 401);
    assert.equal((await request(valid, cookie, 'GET')).statusCode, 405);
    assert.equal((await request({ ...valid, password: 'wrong' })).statusCode, 403);
    assert.equal((await request({ password: 'test-reset' })).statusCode, 400);
    assert.equal(resets, 0);
    assert.equal((await request(valid)).data.summary.total, 0);
    assert.equal(resets, 1);
    for (const [code, text] of [['PGRST202', 'não encontrou'], ['42P01', 'Falta uma tabela'], ['42501', 'permissão'], ['XX000', 'XX000']]) {
      globalThis.fetch = async url => url.endsWith('duo_login_attempt')
        ? { ok: true, json: async () => true }
        : { ok: false, status: 400, json: async () => ({ code, message: 'PRIVATE_DATABASE_DETAILS' }) };
      const failure = await request(valid);
      assert.equal(failure.statusCode, 400);
      assert.ok(failure.data.error.includes(text));
      assert.ok(!failure.data.error.includes('PRIVATE_DATABASE_DETAILS'));
    }
    globalThis.fetch = async () => ({ ok: true, json: async () => allowed });
    allowed = false;
    assert.equal((await request(valid)).statusCode, 429);
    delete process.env.RESET_PASSWORD;
    assert.equal((await request(valid)).statusCode, 503);
    assert.equal(resets, 1);
  } finally { process.env = previous; globalThis.fetch = originalFetch; }
});
