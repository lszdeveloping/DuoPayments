import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import handler from './api/cloud.mjs';
import { issueSession, appSessionSecret } from './cloud-auth.mjs';
import { discordSessionSecret } from './discord-payments.mjs';

test('cloud rejects legacy sessions and revokes both scopes when the main password changes', async () => {
  const previous = { ...process.env }, originalFetch = globalThis.fetch;
  try {
    const secret = 'test-secret-with-at-least-32-characters';
    Object.assign(process.env, { SUPABASE_URL: 'https://test.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-key', SESSION_SECRET: secret, APP_PASSWORD: 'current-password', DISCORD_VIEW_PASSWORD_HASH: createHash('sha256').update('private-password').digest('hex') });
    globalThis.fetch = async url => ({ ok: true, json: async () => url.endsWith('duo_login_attempt') ? true : url.endsWith('duo_discord_list') ? { payments: [] } : { names: ['A', 'B'], entries: [] } });
    const request = async (path, cookie, body) => {
      const res = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(raw) { this.data = JSON.parse(raw); } };
      await handler({ url: `/api/${path}`, method: body ? 'POST' : 'GET', body, headers: { host: 'test', cookie } }, res);
      return res;
    };
    assert.equal((await request('state', `duo=${issueSession(secret)}`)).statusCode, 401);
    assert.equal((await request('discord-payments', `duo_discord=${issueSession(discordSessionSecret(secret))}`)).statusCode, 401);
    const login = await request('login', '', { password: 'current-password' });
    assert.equal(login.statusCode, 200);
    assert.doesNotMatch(login.headers['Set-Cookie'], /Max-Age|Expires/i);
    const cookie = login.headers['Set-Cookie'].split(';')[0];
    assert.equal((await request('state', cookie)).statusCode, 200);
    const privateLogin = await request('discord-login', '', { password: 'private-password' });
    const privateCookie = privateLogin.headers['Set-Cookie'].split(';')[0];
    assert.equal((await request('discord-payments', privateCookie)).statusCode, 200);
    const logout = await request('logout', cookie, {});
    assert.equal(logout.headers['Set-Cookie'].length, 2);
    for (const header of logout.headers['Set-Cookie']) assert.match(header, /Max-Age=0/);
    process.env.APP_PASSWORD = 'changed-password';
    assert.equal((await request('state', cookie)).statusCode, 401);
    assert.equal((await request('discord-payments', privateCookie)).statusCode, 401);
    assert.equal((await request('login', '', { password: 'current-password' })).statusCode, 401);
    assert.equal((await request('state', `duo=${issueSession(appSessionSecret(secret, 'changed-password'))}`)).statusCode, 200);
  } finally { process.env = previous; globalThis.fetch = originalFetch; }
});
