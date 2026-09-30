# Pagamentos privados do Discord

Implementação para os pedidos de Valorant criados pelo simulador do WaveBoost.

## Uso

1. A equipe ajusta serviço, elos e valor em **Editar pagamento**, se necessário.
2. Um membro com a permissão **Administrador** clica em **Confirmar pagamento**.
3. O formulário mostra o valor e pede quem recebeu: `1` corresponde ao primeiro sócio, `2` ao segundo. O campo de executor é opcional para serviços repassados.
4. O bot envia o pagamento ao site. Somente após a resposta de sucesso, marca o ticket como registrado e bloqueia alterações no pedido.
5. No login normal de `https://payments-duo.vercel.app/`, a senha privada configurada abre **Pagamentos do Discord**. Também é possível acessar `/discord.html` e entrar por lá.

Os pagamentos ficam em uma tabela separada. Não aparecem no histórico, nas exportações ou nos totais compartilhados do Duo. A senha normal do Duo e o token do bot não autorizam a consulta privada. A senha privada não abre o histórico normal.

Um ticket gera no máximo um registro. Em caso de falha ou timeout, o administrador pode tentar novamente. Se o site já tiver salvo a primeira tentativa, devolve o registro existente; dados diferentes para o mesmo ticket são recusados. O registro privado guarda cliente, ticket, protocolo, valor, sócio, executor quando informado e administrador responsável. Esta versão oferece consulta, sem edição ou exclusão desses registros privados.

## Publicação no site existente

1. No Supabase usado pelo site, aplique `supabase/migrations/202609300001_discord_payments.sql`, após as migrações anteriores. Ela cria a tabela privada e duas funções, com acesso restrito à chave administrativa.
2. Nas variáveis de ambiente **Production** do projeto Vercel existente, copie de `DuoPayments2/.env` somente:
   - `DISCORD_PAYMENTS_TOKEN`
   - `DISCORD_VIEW_PASSWORD_HASH`
   - `DISCORD_GUILD_ID`
3. Preserve os valores existentes de `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_PASSWORD` e `SESSION_SECRET`. O `SESSION_SECRET` do arquivo local é para execução local; não é necessário substituir o de produção.
4. Publique o conteúdo atualizado de `DuoPayments2` no mesmo projeto Vercel. Os arquivos `.env` são privados e estão excluídos do Git e do upload Vercel.

## Publicação do bot

O `.env` da raiz já contém `DUO_PAYMENTS_URL=https://payments-duo.vercel.app` e `DUO_PAYMENTS_TOKEN`, com o mesmo token do site. Preserve as demais configurações.

Atualize o código `dist` e a configuração privada na aplicação Discloud e reinicie. Esta cópia contém JavaScript compilado; não execute `npm run build`, pois os fontes TypeScript não estão nesta pasta. O comando de inicialização continua `npm start`.

Opcionalmente configure `DUO_PARTNER_1_NAME` e `DUO_PARTNER_2_NAME` no bot para exibir nomes no formulário. Mantenha a mesma ordem dos sócios do Duo. O token da integração é exclusivo para envio e nunca deve ser colocado em `public` ou enviado ao Discord.

Na inicialização, o bot acrescenta os botões aos pedidos existentes acessíveis, sem recriar os tickets.

## Verificação

- Bot, a partir da raiz: `node --test tests/*.test.js`.
- Site, a partir de `DuoPayments2`: `npm test`.
- Testes cobrem autorização de administrador, valor em centavos, formulário desatualizado, falha de rede, repetição de envio, login privado e isolamento do histórico normal.
- Os testes cloud simulam o Supabase. A aplicação da migração e a confirmação real Discord → Vercel → Supabase devem ser verificadas após a publicação.
