export function summarize(entries) {
  const received = [0, 0], profit = [0, 0];
  let balance = 0;
  for (const entry of entries) {
    const { person, amount, type } = entry;
    if (type === 'income') {
      const share = Math.round(amount * 20 / 100);
      received[person] += amount;
      profit[person] += amount - share;
      profit[1 - person] += share;
      balance += person === 0 ? share : -share;
    } else {
      balance += person === 0 ? -amount : amount;
    }
  }
  return { received, profit, balance, total: received[0] + received[1] };
}

export function validateIncome(body) {
  if (![0, 1].includes(body.person)) throw new Error('Selecione quem recebeu.');
  if (!Number.isSafeInteger(body.amount) || body.amount < 1 || body.amount > 100000000) throw new Error('Informe um valor entre R$ 0,01 e R$ 1.000.000,00.');
  if (typeof body.description !== 'string' || body.description.trim().length > 120) throw new Error('Use uma descrição de até 120 caracteres.');
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || Number.isNaN(Date.parse(body.date)) || new Date(body.date).toISOString().slice(0, 10) !== body.date) throw new Error('Informe uma data válida.');
}
