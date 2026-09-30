const $ = selector => document.querySelector(selector);
let payments = [], accessVersion = 0;
const money = amount => (amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
function lock() {
  accessVersion++;
  payments = [];
  $('#payments').replaceChildren();
  $('#total').textContent = '—'; $('#count').textContent = '—';
  $('#private').hidden = true; $('#logout').hidden = true; $('#access').hidden = false;
}
async function api(path, data) {
  const response = await fetch(`/api/${path}`, data === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (response.status === 401) lock();
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível acessar os pagamentos.');
  return result;
}
function render() {
  const query = $('#search').value.trim().toLocaleLowerCase('pt-BR');
  const rows = payments.filter(({ payment: p }) => `${p.description} ${p.customerId} ${p.confirmedBy} ${p.recipient}`.toLocaleLowerCase('pt-BR').includes(query));
  $('#total').textContent = money(payments.reduce((sum, row) => sum + row.payment.amount, 0));
  $('#count').textContent = String(payments.length);
  $('#payments').replaceChildren();
  for (const { payment: p } of rows) {
    const tr = document.createElement('tr');
    for (const value of [p.description, p.date.split('-').reverse().join('/'), money(p.amount), `Sócio ${p.person + 1}`, p.customerId, p.confirmedBy]) {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    }
    if (p.recipient) { const note = document.createElement('small'); note.textContent = `Repassado para ${p.recipient} (70/15/15)`; tr.children[0].append(note); }
    const td = document.createElement('td'), link = document.createElement('a');
    link.href = `https://discord.com/channels/${encodeURIComponent(p.guildId)}/${encodeURIComponent(p.channelId)}/${encodeURIComponent(p.messageId)}`;
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Abrir ticket'; td.append(link); tr.append(td); $('#payments').append(tr);
  }
  $('#empty').hidden = rows.length > 0;
}
async function refresh() {
  const version = accessVersion;
  const result = await api('discord-payments');
  if (version !== accessVersion) return;
  payments = result.payments;
  render(); $('#private').hidden = false; $('#logout').hidden = false; $('#access').hidden = true;
  $('#status').textContent = 'Atualizado agora';
}
$('#login').onsubmit = async event => {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true; $('#login-error').textContent = '';
  try { await api('discord-login', { password: $('#password').value }); $('#login').reset(); await refresh(); }
  catch (error) { $('#login-error').textContent = error.message; }
  finally { button.disabled = false; }
};
$('#logout').onclick = async () => { try { await api('discord-logout', {}); lock(); location.replace('/'); } catch (error) { $('#status').textContent = error.message; } };
$('#refresh').onclick = () => refresh().catch(error => { $('#status').textContent = error.message; });
$('#search').oninput = render;
window.addEventListener('pagehide', lock);
window.addEventListener('pageshow', () => refresh().catch(() => {}));
setInterval(() => { if (!document.hidden && !$('#private').hidden) refresh().catch(error => { $('#status').textContent = error.message; }); }, 10000);
