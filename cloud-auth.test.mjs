import test from 'node:test';
import assert from 'node:assert/strict';
import { issueSession, validSession } from './cloud-auth.mjs';
test('sessão assinada funciona entre instâncias e rejeita adulteração e expiração', () => {
  const secret = 'test-secret-with-at-least-32-characters';
  const now = 1800000000000;
  const token = issueSession(secret, now);
  assert.equal(validSession(token, secret, now), true);
  assert.equal(validSession(token, 'different-secret', now), false);
  assert.equal(validSession(token.replace(/^./, '9'), secret, now), false);
  assert.equal(validSession(token, secret, now + 86400000), false);
  assert.equal(validSession(undefined, secret, now), false);
});
