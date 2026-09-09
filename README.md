# Duo

Site em português para dividir os recebimentos de uma loja entre dois sócios. Quem recebe fica com 80%, e 20% pertencem ao outro. As obrigações são compensadas em um único saldo. Os valores são armazenados em centavos, com arredondamento da participação de 20% ao centavo mais próximo em cada recebimento.

## Executar

Requer Node.js 24 ou superior. Não há dependências para instalar.

```powershell
npm.cmd start
```

Abra http://127.0.0.1:3000. Use Configurações para definir os nomes dos sócios. O banco SQLite é criado em `data/duo.sqlite`. O histórico é permanente e pode ser exportado para CSV. A tela consulta novos dados a cada dez segundos. Os totais representam a divisão dos recebimentos, sem dedução de despesas ou impostos.

## Acesso pelos dois sócios

É necessário executar uma única instância do servidor, acessível aos dois. Na mesma rede, configure:

```powershell
$env:HOST = '0.0.0.0'
$env:APP_PASSWORD = 'substitua-por-uma-senha-forte'
npm.cmd start
```

Ambos acessam o IP da máquina na porta 3000 e entram com a senha compartilhada. Os sócios selecionam manualmente quem recebeu; não há contas individuais. Para acesso pela internet, hospede o servidor Node com armazenamento persistente e HTTPS, e defina `COOKIE_SECURE=true`. O projeto ainda não foi publicado na internet. `PORT` e `DB_PATH` são configuráveis. Mantenha a senha fora do código. Para uma cópia de segurança consistente, pare o servidor e copie a pasta `data` inteira.

## Repasses

Registrar repasse exige confirmação de que o pagamento foi feito. O site não executa Pix. Se outro recebimento mudar o saldo antes da confirmação, o acerto é recusado para revisão. Repasses anteriores permanecem no histórico e entram no cálculo dos próximos saldos.

## Verificação

```powershell
npm.cmd test
```

Inclui o exemplo R$ 100 / R$ 80 → R$ 4 a repassar, quitação, inversão do saldo e arredondamento de centavos.

## Vercel + Supabase

A versão online usa `api/cloud.mjs` e Supabase; `server.mjs` continua sendo a versão local com SQLite. O arquivo `vercel.json` publica `public` e encaminha `/api/*` para a função cloud. As sessões são assinadas e funcionam entre instâncias. Todos os acertos são conferidos dentro de uma transação no banco.

1. No projeto Supabase escolhido, execute `supabase/migrations/202609090001_duo.sql` no SQL Editor. As tabelas usam RLS, sem acesso para visitantes ou usuários autenticados do Supabase. Somente a API do servidor usa a chave administrativa.
2. Envie este repositório ao GitHub e importe-o na Vercel, usando framework **Other** e Node.js **24.x**. A pasta de saída é `public`; não há build a executar.
3. Configure as variáveis da Vercel, em Production: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (chave service_role do Supabase), `APP_PASSWORD` (mínimo 12 caracteres) e `SESSION_SECRET` (segredo aleatório com no mínimo 32 caracteres). `.env.example` contém somente os nomes e exemplos. Nunca coloque as chaves em `public` ou no GitHub.
4. Faça o deploy e abra o endereço HTTPS. Ambos usam a mesma senha e selecionam quem recebeu ao registrar. Para revogar todas as sessões, troque `SESSION_SECRET` e publique novamente.

O banco online começa vazio: registros de `data/duo.sqlite` não são enviados automaticamente. Não aponte deployments de preview para o banco de produção; configure outro projeto Supabase se precisar testar online. A conexão real e a migração precisam ser validadas no projeto escolhido antes de considerar a publicação concluída.

Referências: [Vercel: configuração e funções](https://vercel.com/docs/project-configuration/vercel-json), [Supabase: funções do banco](https://supabase.com/docs/guides/database/functions).
