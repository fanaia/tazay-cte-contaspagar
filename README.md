# Tazay Cte Contaspagar

Central Oon declarativa gerada com `create-central-oon`.

## Objetivo funcional

A Central sincroniza pedidos de compra do Omie que estejam em **Faturado pelo fornecedor**, calcula a próxima quarta-feira estrita e gera contas a pagar agrupadas por fornecedor e vencimento.

- compras incluídas na quarta-feira vencem na quarta-feira da semana seguinte;
- compras novas atualizam a conta aberta do mesmo fornecedor/vencimento;
- o primeiro envio utiliza `IncluirContaPagar` e as revisões utilizam `AlterarContaPagar`;
- a conclusão do ticket de envio atualiza a conta local para **Enviado** e **Pagamento pendente**;
- a consulta de pagamento utiliza `ConsultarContaPagar` e gera um ticket rastreável;
- título pago muda os pedidos vinculados para a etapa **Pago**;
- baixa cancelada devolve as compras para `Faturado pelo fornecedor`;
- exclusão do título cria uma nova geração e um novo código de integração.

A observação enviada ao Omie identifica os CTes e os respectivos valores:

```text
Contas a Pagar gerada pela Central Oon referente aos CTes:
cte 00000 - R$ 100,00
cte 00001 - R$ 200,00
```

## Parametrização

Em **Configurações > Contas a pagar**, configure:

- **Aprovar compra automático**: aprova a compra assim que ela entra em `Faturado pelo fornecedor`;
- **Enviar conta a pagar para o Omie automático**: cria ou atualiza o título no Omie após a geração/revisão do agrupamento;
- **Categoria padrão**;
- **Conta corrente padrão**.

As categorias e contas correntes são carregadas pelas listas Omie **Categorias financeiras** e **Contas correntes**.

### Operação manual

Quando a aprovação automática estiver desativada:

1. abra **Dados e parâmetros** na compra;
2. opcionalmente selecione categoria ou conta corrente diferentes dos padrões;
3. execute **Aprovar compra**.

A aprovação gera ou atualiza a conta a pagar agrupada localmente.

Quando o envio automático estiver desativado:

1. abra **Dados e parâmetros** na conta agrupada;
2. opcionalmente selecione outra categoria ou conta corrente;
3. execute **Enviar para o Omie**.

No primeiro envio, a ação utiliza `IncluirContaPagar`. Nas revisões seguintes, utiliza `AlterarContaPagar`, preservando o `codigo_lancamento_integracao` e enviando também o `codigo_lancamento_omie` quando já estiver disponível.

Para atualizar o pagamento, execute **Consultar pagamento no Omie**. A ação gera um ticket e, ao concluir, atualiza separadamente as tags **Envio para o Omie** e **Pagamento no Omie**.

## Limitação da API pública do Omie

A API pública de pedidos de compra documenta inclusão, alteração, consulta, pesquisa e exclusão, mas não disponibiliza um método para executar o comando **Encerrar** nem uma lista de **motivos de encerramento**. Por isso, a Central não envia um método não documentado nem cria um ticket fictício para essa operação. O pedido é atualizado localmente para **Pago**; o encerramento automático no Omie permanece bloqueado até existir um método oficial ou contrato técnico fornecido pelo Omie.

## Operação inicial

1. Ative `Integrações > Omie`, informe as credenciais e teste a conexão.
2. Sincronize as listas **Categorias financeiras** e **Contas correntes**.
3. Crie ou edite o registro em **Configurações > Contas a pagar**.
4. Execute a sincronização da lista **Compras faturadas pelo fornecedor**.
5. Execute `POST /api/tazay/contas-pagar/reconciliar` com perfil `admin` ou `desenvolvedor`.
6. Mantenha o `oonCore-integration-worker` ativo para processar outbox, inbox, retries e webhooks.

O webhook público é gerenciado pelo OonCore em `/integrations/webhooks/omie/{token}`.

## Endpoints funcionais

- `POST /api/tazay/contas-pagar/reconciliar` — processa as compras pendentes respeitando a parametrização;
- `POST /api/tazay/contas-pagar/compras/:id/aprovar` — aprova manualmente e gera/revisa o agrupamento;
- `POST /api/tazay/contas-pagar/contas/:id/enviar` — envia manualmente a conta agrupada ao Omie;
- `POST /api/tazay/contas-pagar/contas/:id/consultar-pagamento` — gera um ticket para consultar o título no Omie e atualizar o pagamento;
- `POST /api/tazay/contas-pagar/configuracao/inicializar` — cria a configuração padrão quando ainda não existir.

## Fronteira arquitetural

- `central.app.json` declara identidade, `appKind`, módulos, capabilities e compatibilidade com o OonCore;
- os models em `backend/src/models` declaram somente o domínio da Central;
- `backend/src/mappings/omie.js` declara chamadas, listas, webhooks e handlers funcionais;
- `backend/src/services/contasPagar` concentra as regras de aprovação, agrupamento, reconciliação e envio;
- `frontend/central.ui.json` declara as telas operacionais e as ações manuais;
- autenticação, shell, roteamento, RBAC, metadata, CRUD, filas, retry, idempotência e infraestrutura pertencem ao OonCore.

## Documentação e conformidade

```bash
npm run ooncore:docs        # sincroniza .ooncore/
npm run ooncore:docs:check  # valida versão/hash do cache local
npm run ooncore:conformance # valida a fronteira da Central
npm run test                # testes de regra de negócio
npm run check               # executa todos os gates locais
```

## Rodando

```bash
npm install
npm run check

cd backend && cp .env.example .env && npm install && npm run dev
cd ../frontend && cp .env.example .env && npm install && npm run dev
```

Em desenvolvimento, configure o mesmo valor em `DEV_TOKEN` no backend e `VITE_DEV_TOKEN` no frontend. A validação do token local é fornecida pelo Core; não implemente `auth.verifyToken` na Central.
