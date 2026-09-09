const $ = s => document.querySelector(s);
let state = { names: ['Você', 'Seu sócio'], entries: [], summary: { received: [0, 0], profit: [0, 0], balance: 0, total: 0 } };
let filter = 'all', confirmedBalance = 0, toastTimer;
const money = cents => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateLabel = date => date.split('-').reverse().join('/');
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
function cents(value) { const clean = value.trim().replace(/\s/g, ''); if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(clean)) return NaN; const [whole, fraction = ''] = clean.replaceAll('.', '').split(','); return Number(whole) * 100 + Number(fraction.padEnd(2, '0')); }
async function api(path, data) {
  const response = await fetch(`/api/${path}`, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (response.status === 401 && path !== 'login') { if (!$('#login-dialog').open) $('#login-dialog').showModal(); throw new Error(result.error); }
  if (!response.ok) throw new Error(result.error || 'Não foi possível salvar.');
  return result;
}
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 4500); }
function render() {
  const { names, summary, entries } = state;
  $('#total').textContent = money(summary.total);
  names.forEach((name, index) => { const suffix = index ? 'b' : 'a'; $(`#name-${suffix}`).textContent = name; $(`#profit-${suffix}`).textContent = money(summary.profit[index]); $(`#avatar-${suffix}`).textContent = name[0].toUpperCase(); });
  const b = summary.balance, from = b > 0 ? 0 : 1;
  $('#balance-status').textContent = b ? 'Repasse pendente' : 'Em dia';
  $('#balance-title').textContent = b ? `${names[from]} tem um repasse a fazer` : 'Tudo certo entre vocês';
  $('#balance-description').textContent = b ? 'Valores compensados. Este é o único acerto necessário.' : 'Os recebimentos viram um único saldo de repasse.';
  $('#balance-amount').textContent = money(Math.abs(b));
  $('#balance-direction').textContent = b ? `${names[from]} → ${names[1 - from]}` : 'Nenhum repasse pendente';
  $('#settle-button').disabled = !b;
  $('#entry-count').textContent = entries.length;
  renderRows();
}
function filteredRows() { const query = $('#search').value.trim().toLocaleLowerCase('pt-BR'); return state.entries.filter(e => (filter === 'all' || e.type === filter) && `${e.description} ${state.names[e.person]} ${dateLabel(e.date)}`.toLocaleLowerCase('pt-BR').includes(query)); }
function renderRows() {
  const rows = filteredRows();
  $('#entries').innerHTML = rows.map(e => `<tr><td title="${escape(e.description)}">${escape(e.description)}</td><td><span class="person-badge ${e.person ? 'b' : ''}">${escape(state.names[e.person][0].toUpperCase())}</span>${escape(state.names[e.person])}</td><td>${dateLabel(e.date)}</td><td class="money">${money(e.amount)}</td><td>${e.type === 'income' ? money(Math.round(e.amount * .2)) : '—'}</td><td><span class="type-badge ${e.type}">${e.type === 'income' ? 'Recebimento' : 'Repasse'}</span></td></tr>`).join('');
  $('#empty').hidden = rows.length > 0;
  $('#empty h3').textContent = state.entries.length ? 'Nenhuma movimentação encontrada' : 'Uma parceria começa com o primeiro registro';
  $('#empty p').textContent = state.entries.length ? 'Experimente outro termo ou filtro.' : 'Adicione um recebimento e deixe as contas com o Duo.';
  $('#empty-add').hidden = state.entries.length > 0;
  $('#result-count').textContent = `${rows.length} movimentaç${rows.length === 1 ? 'ão' : 'ões'}`;
}
function openIncome() { const form = $('#income-form'); form.reset(); form.querySelector('.form-error').textContent = ''; $('#person').innerHTML = state.names.map((name, i) => `<option value="${i}">${escape(name)}</option>`).join(''); form.elements.date.value = today(); updatePreview(); $('#income-dialog').showModal(); }
function updatePreview() { const amount = cents($('#income-form').elements.amount.value), person = Number($('#person').value), share = Math.round(amount * .2); $('#split-preview').textContent = Number.isSafeInteger(amount) && amount > 0 ? `${state.names[person]} fica com ${money(amount - share)} · ${money(share)} para ${state.names[1 - person]}` : '80% para quem recebeu · 20% para o sócio'; }
$('#add-button').onclick = openIncome; $('#empty-add').onclick = openIncome;
$('#income-form').addEventListener('input', updatePreview);
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(`#${button.dataset.close}`).close());
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { filter = button.dataset.filter; document.querySelectorAll('.tab').forEach(b => b.classList.toggle('selected', b === button)); renderRows(); });
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => { const history = button.dataset.view === 'history'; $('#overview').hidden = history; $('#page-label').textContent = history ? 'Histórico' : 'Visão geral'; $('#page-title').innerHTML = `${history ? 'Histórico' : 'Visão geral'}<span>.</span>`; document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b === button)); });
$('#search').addEventListener('input', renderRows);
$('#settings-button').onclick = () => { $('#settings-form').elements.first.value = state.names[0]; $('#settings-form').elements.second.value = state.names[1]; $('#settings-form .form-error').textContent = ''; $('#settings-dialog').showModal(); };
$('#settle-button').onclick = () => { confirmedBalance = state.summary.balance; const from = confirmedBalance > 0 ? 0 : 1; $('#settle-text').textContent = `${state.names[from]} pagou ${money(Math.abs(confirmedBalance))} para ${state.names[1 - from]}. Ao confirmar, o repasse entra no histórico e o saldo atual é quitado.`; $('#settle-form .form-error').textContent = ''; $('#settle-dialog').showModal(); };
function submit(selector, action) { $(selector).addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget, button = form.querySelector('[type="submit"], .full'); button.disabled = true; form.querySelector('.form-error').textContent = ''; try { await action(form); form.closest('dialog').close(); } catch (error) { form.querySelector('.form-error').textContent = error.message; } finally { button.disabled = false; } }); }
submit('#income-form', async form => { const amount = cents(form.elements.amount.value); if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Informe o valor em reais, por exemplo: 100,00.'); state = await api('income', { person: Number(form.elements.person.value), amount, description: form.elements.description.value, date: form.elements.date.value }); render(); toast('Recebimento salvo. Saldo atualizado!'); });
submit('#settings-form', async form => { state = await api('settings', { names: [form.elements.first.value, form.elements.second.value] }); render(); toast('Nomes atualizados.'); });
submit('#settle-form', async () => { state = await api('settle', { balance: confirmedBalance }); render(); toast('Repasse registrado. Vocês estão em dia!'); });
submit('#login-form', async form => { await api('login', { password: form.elements.password.value }); form.reset(); await refresh(); });
$('#login-dialog').addEventListener('cancel', e => e.preventDefault());
$('#export-button').onclick = () => { const cell = value => `"${String(value).replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`; const rows = [['Descrição', 'Sócio', 'Data', 'Valor (R$)', 'Parte do sócio (R$)', 'Tipo'], ...filteredRows().map(e => [e.description, state.names[e.person], dateLabel(e.date), (e.amount / 100).toFixed(2).replace('.', ','), e.type === 'income' ? (Math.round(e.amount * .2) / 100).toFixed(2).replace('.', ',') : '', e.type === 'income' ? 'Recebimento' : 'Repasse'])]; const url = URL.createObjectURL(new Blob(['\ufeff' + rows.map(r => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `duo-movimentacoes-${today()}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
async function refresh() { try { state = await api('state'); render(); $('.live').innerHTML = '<i></i>Conectado'; } catch (error) { $('.live').textContent = 'Sem conexão'; if (!$('#login-dialog').open) toast('Não foi possível atualizar. Verifique a conexão.'); } }
await refresh();
setInterval(() => { if (!document.hidden && !document.querySelector('dialog[open]')) refresh(); }, 10000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !document.querySelector('dialog[open]')) refresh(); });
