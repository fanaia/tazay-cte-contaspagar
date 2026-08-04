# Tazay Cte Contaspagar

Central Oon declarativa gerada com `create-central-oon`.

## Objetivo funcional

A Central sincroniza pedidos de compra do Omie que estejam em **Faturado pelo fornecedor**, calcula a próxima quarta-feira estrita e gera contas a pagar agrupadas por fornecedor e vencimento.

- compras incluídas na quarta-feira vencem na quarta-feira da semana seguinte;
- compras novas atualizam a conta aberta do mesmo fornecedor/vencimento;
- baixa realizada conclui as compras vinculadas;
- baixa cancelada devolve as compras para `Faturado pelo fornecedor`;
- exclusão do título cria uma nova geração e um novo código de integração.

## Operação inicial

1. Ative `Integrações > Omie`, informe as credenciais e teste a conexão.
2. Execute a sincronização da lista **Compras faturadas pelo fornecedor**.
3. Execute `POST /api/tazay/contas-pagar/reconciliar` com perfil `admin` ou `desenvolvedor`.
4. Mantenha o `oonCore-integration-worker` ativo para processar outbox, inbox, retries e webhooks.

O webhook público é gerenciado pelo OonCore em `/integrations/webhooks/omie/{token}`.

## Fronteira arquitetural

- `central.app.json` declara identidade, `appKind`, módulos, capabilities e compatibilidade com o OonCore;
- os models em `backend/src/models` declaram somente o domínio da Central;
- `backend/src/mappings/omie.js` declara chamadas, lista, webhooks e handlers funcionais;
- `backend/src/services/contasPagar` concentra as regras de agrupamento e reconciliação;
- `frontend/central.ui.json` declara as telas operacionais;
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
