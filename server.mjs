import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { summarize, validateIncome, validateIncomeChange, sameIncome } from './ledger.mjs';

const host = process.env.HOST || '127.0.0.1';
const password = process.env.APP_PASSWORD;
if (host !== '127.0.0.1' && host !== 'localhost' && !password) throw new Error('Para acesso externo, defina APP_PASSWORD.');
mkdirSync(new URL('./data/', import.meta.url), { recursive: true });
const db = new DatabaseSync(process.env.DB_PATH || fileURLToPath(new URL('./data/duo.sqlite', import.meta.url)));
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, names TEXT NOT NULL); INSERT OR IGNORE INTO settings VALUES (1, '["Você","Seu sócio"]'); CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, person INTEGER NOT NULL, amount INTEGER NOT NULL, description TEXT NOT NULL, date TEXT NOT NULL, created TEXT DEFAULT CURRENT_TIMESTAMP);`);
if (!db.prepare('PRAGMA table_info(entries)').all().some(column => column.name === 'recipient')) db.exec("ALTER TABLE entries ADD COLUMN recipient TEXT NOT NULL DEFAULT ''");
const sessions = new Map();
const attempts = new Map();
const entries = () => db.prepare('SELECT * FROM entries ORDER BY id DESC').all();
const state = () => { const rows = entries(); return { names: JSON.parse(db.prepare('SELECT names FROM settings WHERE id=1').get().names), entries: rows, summary: summarize(rows) }; };
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
async function body(req) { let result = ''; for await (const chunk of req) { result += chunk; if (result.length > 8192) throw new Error('Solicitação muito grande.'); } return JSON.parse(result || '{}'); }
const files = { '/theme.js': ['theme.js', 'text/javascript'], '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'Origem não permitida.' });
    if (path === '/api/login' && req.method === 'POST') {
      const key = req.socket.remoteAddress;
      const attempt = attempts.get(key);
      if (attempt && attempt.until > Date.now() && attempt.count >= 10) return json(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos.' });
      const input = await body(req);
      if (password && !timingSafeEqual(createHash('sha256').update(String(input.password || '')).digest(), createHash('sha256').update(password).digest())) {
        attempts.set(key, { count: attempt && attempt.until > Date.now() ? attempt.count + 1 : 1, until: Date.now() + 900000 });
        return json(res, 401, { error: 'Senha incorreta.' });
      }
      attempts.delete(key);
      const token = randomBytes(32).toString('hex');
      sessions.set(token, Date.now() + 86400000);
      res.setHeader('Set-Cookie', `duo=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`);
      return json(res, 200, { ok: true });
    }
    if (path.startsWith('/api/')) {
      const token = req.headers.cookie?.match(/(?:^|;\s*)duo=([^;]+)/)?.[1];
      if (password && (!token || (sessions.get(token) || 0) < Date.now())) return json(res, 401, { error: 'Entre com a senha da loja.' });
      if (path === '/api/state' && req.method === 'GET') return json(res, 200, state());
      if (path === '/api/income' && req.method === 'POST') {
        const input = await body(req); validateIncome(input);
        db.prepare('INSERT INTO entries (type,person,amount,description,date,recipient) VALUES (?,?,?,?,?,?)').run('income', input.person, input.amount, input.description.trim() || 'Recebimento', input.date, (input.recipient || '').trim());
        return json(res, 201, state());
      }
      if (['/api/income-edit', '/api/income-delete'].includes(path) && req.method === 'POST') {
        const input = await body(req); validateIncomeChange(input);
        if (path === '/api/income-edit') validateIncome(input);
        const entry = db.prepare("SELECT * FROM entries WHERE id=? AND type='income'").get(input.id);
        if (!entry || !sameIncome(entry, input.expected)) return json(res, 409, { error: 'Este recebimento foi alterado ou excluído. Atualize a página e tente novamente.' });
        if (path === '/api/income-delete') db.prepare("DELETE FROM entries WHERE id=? AND type='income'").run(input.id);
        else db.prepare("UPDATE entries SET person=?,amount=?,description=?,date=?,recipient=? WHERE id=? AND type='income'").run(input.person, input.amount, input.description.trim() || 'Recebimento', input.date, (input.recipient || '').trim(), input.id);
        return json(res, 200, state());
      }
      if (path === '/api/settle' && req.method === 'POST') {
        const input = await body(req);
        const balance = summarize(entries()).balance;
        if (!balance) throw new Error('O saldo já está em dia.');
        if (balance !== input.balance) return json(res, 409, { error: 'O saldo mudou. Atualize a página antes de confirmar o repasse.' });
        db.prepare('INSERT INTO entries (type,person,amount,description,date) VALUES (?,?,?,?,?)').run('transfer', balance > 0 ? 0 : 1, Math.abs(balance), 'Acerto de saldo', new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }));
        return json(res, 201, state());
      }
      if (path === '/api/settings' && req.method === 'POST') {
        const input = await body(req);
        if (!Array.isArray(input.names) || input.names.length !== 2 || input.names.some(n => typeof n !== 'string' || !n.trim() || n.trim().length > 30) || input.names[0].trim().toLowerCase() === input.names[1].trim().toLowerCase()) throw new Error('Informe dois nomes diferentes, com até 30 caracteres.');
        db.prepare('UPDATE settings SET names=? WHERE id=1').run(JSON.stringify(input.names.map(n => n.trim())));
        return json(res, 200, state());
      }
      return json(res, 404, { error: 'Página não encontrada.' });
    }
    if (files[path] && req.method === 'GET') { const [file, type] = files[path]; res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(readFileSync(new URL(`./public/${file}`, import.meta.url))); return; }
    json(res, 404, { error: 'Página não encontrada.' });
  } catch (error) { json(res, 400, { error: error.message || 'Não foi possível concluir.' }); }
}).listen(Number(process.env.PORT || 3000), host, () => console.log(`Duo disponível em http://${host}:${process.env.PORT || 3000}`));
