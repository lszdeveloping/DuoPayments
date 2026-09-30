import { createHash } from 'node:crypto';
import { summarize, validateIncome, validateIncomeChange } from '../ledger.mjs';
import { issueSession, validSession, sameSecret } from '../cloud-auth.mjs';
import { authorizedBot, validateDiscordPayment, discordPasswordMatches, discordSessionSecret } from '../discord-payments.mjs';

const send = (res, status, data) => { res.setHeader('Cache-Control', 'no-store'); res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); };
async function readBody(req) {
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(raw) > 8192) throw new Error('Solicitação muito grande.');
    return JSON.parse(raw);
  }
  let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 8192) throw new Error('Solicitação muito grande.'); }
  return JSON.parse(raw || '{}');
}
export default async function handler(req, res) {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, APP_PASSWORD: password, SESSION_SECRET: secret } = process.env;
  if (!url || !key || !password || !secret || secret.length < 32) return send(res, 503, { error: 'A configuração do servidor ainda não foi concluída.' });
  async function rpc(name, input) {
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Não foi possível acessar o banco. Tente novamente.');
    return response.json();
  }
  try {
    const requestUrl = new URL(req.url, 'https://localhost');
    const path = requestUrl.pathname === '/api/cloud' ? `/api/${requestUrl.searchParams.get('route') || ''}` : requestUrl.pathname;
    if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(res, 403, { error: 'Origem não permitida.' });
    if (path === '/api/login' && req.method === 'POST') {
      const input = await readBody(req);
      const ip = String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
      const bucket = createHash('sha256').update(`${secret}:${ip}`).digest('hex');
      if (!await rpc('duo_login_attempt', { p_bucket: bucket })) return send(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos.' });
      if (discordPasswordMatches(input.password)) {
        res.setHeader('Set-Cookie', `duo_discord=${issueSession(discordSessionSecret(secret))}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`);
        return send(res, 200, { ok: true, scope: 'discord' });
      }
      if (!sameSecret(String(input.password || ''), password)) return send(res, 401, { error: 'Senha incorreta.' });
      res.setHeader('Set-Cookie', `duo=${issueSession(secret)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`);
      return send(res, 200, { ok: true });
    }
    if (path === '/api/discord-payment') {
      if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido.' });
      if (!authorizedBot(req.headers.authorization)) return send(res, 401, { error: 'Integração não autorizada.' });
      const input = validateDiscordPayment(await readBody(req));
      const result = await rpc('duo_discord_payment', { p_input: input });
      if (result.error) return send(res, 409, result);
      return send(res, result.duplicate ? 200 : 201, { ok: true, id: result.id, duplicate: !!result.duplicate });
    }
    if (path === '/api/discord-login' && req.method === 'POST') {
      const input = await readBody(req);
      const ip = String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
      const bucket = createHash('sha256').update(`${secret}:discord:${ip}`).digest('hex');
      if (!await rpc('duo_login_attempt', { p_bucket: bucket })) return send(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos.' });
      if (discordPasswordMatches(input.password)) {
        res.setHeader('Set-Cookie', `duo_discord=${issueSession(discordSessionSecret(secret))}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`);
        return send(res, 200, { ok: true, scope: 'discord' });
      }
      return send(res, 401, { error: 'Senha incorreta.' });
    }
    if (path === '/api/discord-logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', 'duo_discord=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
      return send(res, 200, { ok: true });
    }
    if (path === '/api/discord-payments') {
      if (req.method !== 'GET') return send(res, 405, { error: 'Método não permitido.' });
      const token = req.headers.cookie?.match(/(?:^|;\s*)duo_discord=([^;]+)/)?.[1];
      if (!validSession(token, discordSessionSecret(secret))) return send(res, 401, { error: 'Entre com a senha da área Discord.' });
      return send(res, 200, await rpc('duo_discord_list', {}));
    }
    const token = req.headers.cookie?.match(/(?:^|;\s*)duo=([^;]+)/)?.[1];
    if (!validSession(token, secret)) return send(res, 401, { error: 'Entre com a senha da loja.' });
    const actions = { '/api/state': ['GET', 'state'], '/api/income': ['POST', 'income'], '/api/income-edit': ['POST', 'income-edit'], '/api/income-delete': ['POST', 'income-delete'], '/api/settings': ['POST', 'settings'], '/api/settle': ['POST', 'settle'] };
    const action = actions[path];
    if (!action) return send(res, 404, { error: 'Página não encontrada.' });
    if (req.method !== action[0]) return send(res, 405, { error: 'Método não permitido.' });
    const input = req.method === 'GET' ? {} : await readBody(req);
    if (['income', 'income-edit'].includes(action[1])) validateIncome(input);
    if (['income-edit', 'income-delete'].includes(action[1])) validateIncomeChange(input);
    if (action[1] === 'settings') {
      if (!Array.isArray(input.names) || input.names.length !== 2 || input.names.some(n => typeof n !== 'string' || !n.trim() || n.trim().length > 30) || input.names[0].trim().toLowerCase() === input.names[1].trim().toLowerCase()) return send(res, 400, { error: 'Informe dois nomes diferentes, com até 30 caracteres.' });
      input.names = input.names.map(n => n.trim());
    }
    if (action[1] === 'settle' && (!Number.isSafeInteger(input.balance) || !input.balance)) return send(res, 400, { error: 'Informe um saldo válido para o acerto.' });
    const result = await rpc('duo_ledger', { p_action: action[1], p_input: input });
    if (result.error) return send(res, 409, result);
    return send(res, ['income', 'settle'].includes(action[1]) ? 201 : 200, { ...result, summary: summarize(result.entries) });
  } catch (error) { return send(res, 400, { error: error.name === 'SyntaxError' ? 'Dados inválidos.' : error.message }); }
}
