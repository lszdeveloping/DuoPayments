import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './api/cloud.mjs';
import { issueSession } from './cloud-auth.mjs';

test('API cloud valida configuração, sessão, cálculo, conflito e login', async () => {
  const previousEnv = { ...process.env }, previousFetch = globalThis.fetch;
  async function request(path, body, cookie) {
    const response = { headers: {}, setHeader(k,v) { this.headers[k] = v; }, end(raw) { this.data = JSON.parse(raw); } };
    await handler({ url: path, method: body === undefined ? 'GET' : 'POST', body, headers: { host: 'duo.example', cookie }, socket: { remoteAddress: '127.0.0.1' } }, response);
    return response;
  }
  try {
    delete process.env.SUPABASE_URL;
    assert.equal((await request('/api/state')).statusCode, 503);
    Object.assign(process.env, { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key', APP_PASSWORD: 'test', SESSION_SECRET: 'a-test-secret-longer-than-32-characters' });
    process.env.APP_PASSWORD = '';
    assert.equal((await request('/api/state')).statusCode, 503);
    process.env.APP_PASSWORD = 'test';
    assert.equal((await request('/api/state')).statusCode, 401);
    const cookie = `duo=${issueSession(process.env.SESSION_SECRET)}`;
    const rows = [{ type: 'income', person: 0, amount: 10000 }, { type: 'income', person: 1, amount: 8000 }];
    globalThis.fetch = async (url, options) => {
      assert.equal(options.headers.apikey, 'server-only-test-key');
      const input = JSON.parse(options.body);
      return { ok: true, json: async () => url.endsWith('duo_login_attempt') ? true : input.p_action === 'settle' ? { error: 'O saldo mudou.' } : { names: ['A', 'B'], entries: rows } };
    };
    const state = await request('/api/cloud?route=state', undefined, cookie);
    assert.equal(state.statusCode, 200);
    assert.equal(state.data.summary.balance, 400);
    assert.equal((await request('/api/income', { person: 0, amount: -1 }, cookie)).statusCode, 400);
    assert.equal((await request('/api/settle', { balance: 2000 }, cookie)).statusCode, 409);
    assert.equal((await request('/api/login', { password: 'wrong' })).statusCode, 401);
    const login = await request('/api/login', { password: process.env.APP_PASSWORD });
    assert.equal(login.statusCode, 200);
    assert.match(login.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Strict/);
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_PASSWORD', 'SESSION_SECRET']) {
      if (previousEnv[key] === undefined) delete process.env[key]; else process.env[key] = previousEnv[key];
    }
  }
});
