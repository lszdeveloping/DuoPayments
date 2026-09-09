import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto';
export function sameSecret(a, b) { return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest()); }
export function issueSession(secret, now = Date.now()) {
  const payload = `${now + 86400000}.${randomBytes(24).toString('hex')}`;
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('hex')}`;
}
export function validSession(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !/^\d{13}\.[a-f0-9]{48}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expiry, nonce, signature] = token.split('.');
  return Number(expiry) > now && sameSecret(signature, createHmac('sha256', secret).update(`${expiry}.${nonce}`).digest('hex'));
}
