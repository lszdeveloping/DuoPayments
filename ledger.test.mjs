import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, validateIncome } from './ledger.mjs';
const income = (person, amount) => ({ type: 'income', person, amount });
test('R$ 100 e R$ 80 compensam R$ 20 contra R$ 16 e deixam R$ 4', () => {
  assert.deepEqual(summarize([income(0, 10000), income(1, 8000)]), { received: [10000, 8000], profit: [9600, 8400], balance: 400, total: 18000 });
});
test('repasse quita saldo sem alterar recebimentos ou lucro', () => {
  const rows = [income(0, 10000), income(1, 8000), { type: 'transfer', person: 0, amount: 400 }];
  assert.equal(summarize(rows).balance, 0);
  assert.equal(summarize(rows).total, 18000);
  assert.equal(summarize([...rows, income(1, 10000)]).balance, -2000);
});
test('arredondamento mantém centavos e conserva o total', () => {
  const summary = summarize([income(0, 3), income(1, 7)]);
  assert.equal(summary.profit[0] + summary.profit[1], 10);
  assert.equal(summary.balance, 0);
});
test('sem registros e recebimentos iguais não exigem repasse', () => {
  assert.equal(summarize([]).balance, 0);
  assert.equal(summarize([income(0, 10000), income(1, 10000)]).balance, 0);
});
test('rejeita valores inválidos, sócio desconhecido e data inexistente', () => {
  const valid = { person: 0, amount: 10000, description: '', date: '2026-09-09' };
  assert.doesNotThrow(() => validateIncome(valid));
  for (const amount of [0, -1, 0.5, NaN, 100000001]) assert.throws(() => validateIncome({ ...valid, amount }));
  assert.throws(() => validateIncome({ ...valid, person: 2 }));
  assert.throws(() => validateIncome({ ...valid, date: '2026-02-30' }));
});
