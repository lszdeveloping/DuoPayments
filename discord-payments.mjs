import { sameSecret } from './cloud-auth.mjs';
import { validateIncome } from './ledger.mjs';
import { createHash } from 'node:crypto';
export function discordPasswordMatches(password) {
  const hash = process.env.DISCORD_VIEW_PASSWORD_HASH;
  return typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash) && sameSecret(createHash('sha256').update(String(password || '')).digest('hex'), hash);
}
export function discordSessionSecret(secret) {
  const hash = process.env.DISCORD_VIEW_PASSWORD_HASH;
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('A senha da área Discord não foi configurada.');
  return createHash('sha256').update(`${secret}:discord:${hash}`).digest('hex');
}

export function authorizedBot(header) {
  const secret = process.env.DISCORD_PAYMENTS_TOKEN;
  return typeof secret === 'string' && secret.length >= 32 && typeof header === 'string' && sameSecret(header, `Bearer ${secret}`);
}
export function validateDiscordPayment(input) {
  if (!input || typeof input !== 'object') throw new Error('Pagamento inválido.');
  validateIncome(input);
  for (const field of ['guildId', 'channelId', 'messageId', 'customerId', 'confirmedBy']) {
    if (typeof input[field] !== 'string' || !/^\d{17,20}$/.test(input[field])) throw new Error(`Identificação inválida: ${field}.`);
  }
  if (process.env.DISCORD_GUILD_ID && input.guildId !== process.env.DISCORD_GUILD_ID) throw new Error('Servidor Discord não autorizado.');
  if (typeof input.protocol !== 'string' || !/^[A-Z0-9]{1,32}$/.test(input.protocol)) throw new Error('Protocolo inválido.');
  return { person: input.person, amount: input.amount, description: input.description.trim(), date: input.date, recipient: (input.recipient || '').trim(), guildId: input.guildId, channelId: input.channelId, messageId: input.messageId, customerId: input.customerId, confirmedBy: input.confirmedBy, protocol: input.protocol };
}
