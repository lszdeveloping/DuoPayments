import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import handler from './api/cloud.mjs';
import { issueSession } from './cloud-auth.mjs';
const privatePassword = 'private-test-password';
const token = 'test-bot-token-with-at-least-32-characters';
const payment = { person: 0, amount: 2000, description: 'ABC123 • Boost • Platina 1 → Platina 2', date: '2026-09-30', recipient: '', protocol: 'ABC123', guildId: '12345678901234567', channelId: '12345678901234568', messageId: '12345678901234569', customerId: '12345678901234570', confirmedBy: '12345678901234571' };
const env = { DISCORD_PAYMENTS_TOKEN: token, DISCORD_VIEW_PASSWORD_HASH: createHash('sha256').update(privatePassword).digest('hex'), DISCORD_GUILD_ID: payment.guildId, SESSION_SECRET: 'test-session-secret-with-at-least-32-characters' };
test('local: registro privado, senha exclusiva, duplicidade e isolamento do histórico normal', async () => {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('.', import.meta.url), env: { ...process.env, ...env, HOST: '127.0.0.1', PORT: '3099', DB_PATH: ':memory:', APP_PASSWORD: 'normal-test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Servidor não iniciou')), 10000); child.once('error', reject); child.once('exit', code => { clearTimeout(timer); reject(Error(`Servidor encerrou: ${code}`)); }); child.stdout.once('data', () => { clearTimeout(timer); resolve(); }); });
    const request = (path, data, headers = {}) => fetch(`http://127.0.0.1:3099/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
    assert.equal((await request('discord-payments')).status, 401);
    assert.equal((await request('discord-payment', payment)).status, 401);
    const bot = { Authorization: `Bearer ${token}` };
    const first = await request('discord-payment', payment, bot);
    assert.equal(first.status, 201);
    assert.deepEqual(Object.keys(await first.json()).sort(), ['duplicate', 'id', 'ok']);
    assert.equal((await request('discord-payment', payment, bot)).status, 200);
    assert.equal((await request('discord-payment', { ...payment, amount: 3000 }, bot)).status, 409);
    assert.equal((await request('discord-payment', { ...payment, messageId: '12345678901234599', guildId: '99999999999999999' }, bot)).status, 400);
    assert.equal((await request('discord-payments', undefined, bot)).status, 401);
    const normalLogin = await request('login', { password: 'normal-test' });
    const normal = { Cookie: normalLogin.headers.get('set-cookie').split(';')[0] };
    assert.equal((await request('discord-payments', undefined, normal)).status, 401);
    assert.equal((await (await request('state', undefined, normal)).json()).entries.length, 0);
    assert.equal((await request('discord-login', { password: 'normal-test' })).status, 401);
    const login = await request('login', { password: privatePassword });
    assert.equal((await login.json()).scope, 'discord');
    const privateCookie = { Cookie: login.headers.get('set-cookie').split(';')[0] };
    const records = await (await request('discord-payments', undefined, privateCookie)).json();
    assert.equal(records.payments.length, 1);
    assert.equal(records.payments[0].payment.amount, 2000);
    assert.equal((await request('state', undefined, privateCookie)).status, 401);
    assert.match((await request('discord-logout', {})).headers.get('set-cookie'), /Max-Age=0/);
  } finally { child.kill(); }
});
test('cloud: senha normal e token do bot não leem dados privados; confirmação usa RPC isolada', async () => {
  const previous = { ...process.env }, previousFetch = globalThis.fetch;
  Object.assign(process.env, env, { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-key', APP_PASSWORD: 'normal-test' });
  async function request(path, body, headers = {}) {
    const res = { headers: {}, setHeader(k,v) { this.headers[k] = v; }, end(raw) { this.data = JSON.parse(raw); } };
    await handler({ url: `/api/${path}`, method: body === undefined ? 'GET' : 'POST', body, headers: { host: 'duo.test', ...headers }, socket: { remoteAddress: '127.0.0.1' } }, res);
    return res;
  }
  try {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push(url);
      if (url.endsWith('duo_discord_payment')) assert.deepEqual(JSON.parse(options.body), { p_input: payment });
      return { ok: true, json: async () => url.endsWith('duo_login_attempt') ? true : url.endsWith('duo_discord_list') ? { payments: [{ payment }] } : { id: payment.messageId, duplicate: false } };
    };
    assert.equal((await request('discord-payments', undefined, { cookie: `duo=${issueSession(env.SESSION_SECRET)}` })).statusCode, 401);
    assert.equal((await request('discord-payments', undefined, { authorization: `Bearer ${token}` })).statusCode, 401);
    assert.equal(calls.length, 0);
    assert.equal((await request('discord-payment', payment, { authorization: `Bearer ${token}` })).statusCode, 201);
    assert.equal((await request('discord-login', { password: 'normal-test' })).statusCode, 401);
    const login = await request('login', { password: privatePassword });
    assert.equal(login.data.scope, 'discord');
    const cookie = login.headers['Set-Cookie'].split(';')[0];
    assert.equal((await request('discord-payments', undefined, { cookie })).data.payments.length, 1);
    assert.equal((await request('state', undefined, { cookie })).statusCode, 401);
    assert.ok(calls.every(url => !url.endsWith('duo_ledger')));
  } finally { globalThis.fetch = previousFetch; for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); }
});
