export function summarize(entries) {
  const received = [0, 0], profit = [0, 0];
  let balance = 0;
  for (const entry of entries) {
    const { person, amount, type } = entry;
    if (type === 'income') {
      const share = Math.round(amount * (entry.recipient ? 15 : 20) / 100);
      received[person] += amount;
      profit[person] += entry.recipient ? share : amount - share;
      profit[1 - person] += share;
      balance += person === 0 ? share : -share;
    } else {
      balance += person === 0 ? -amount : amount;
    }
  }
  return { received, profit, balance, total: received[0] + received[1] };
}

export function validateIncome(body) {
  if (body.recipient !== undefined && (typeof body.recipient !== 'string' || body.recipient.length > 80 || (body.recipient !== '' && !body.recipient.trim()))) throw new Error('Informe o nome de quem recebeu o serviço, com até 80 caracteres.');
  if (![0, 1].includes(body.person)) throw new Error('Selecione quem recebeu.');
  if (!Number.isSafeInteger(body.amount) || body.amount < 1 || body.amount > 100000000) throw new Error('Informe um valor entre R$ 0,01 e R$ 1.000.000,00.');
  if (typeof body.description !== 'string' || body.description.trim().length > 120) throw new Error('Use uma descrição de até 120 caracteres.');
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || Number.isNaN(Date.parse(body.date)) || new Date(body.date).toISOString().slice(0, 10) !== body.date) throw new Error('Informe uma data válida.');
}

export function validateIncomeChange(body) {
  if (!Number.isSafeInteger(body.id) || body.id < 1) throw new Error('Recebimento inválido.');
  if (!body.expected) throw new Error('Atualize a página e tente novamente.');
  validateIncome(body.expected);
}

export function sameIncome(entry, expected) {
  return ['person', 'amount', 'description', 'date'].every(key => entry[key] === expected[key]) && (entry.recipient || '') === (expected.recipient || '');
}
