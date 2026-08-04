# Tazay Cte Contaspagar

Central Oon declarativa gerada com `create-central-oon`.

## Fronteira arquitetural

- `central.app.json` declara identidade, `appKind`, módulos, capabilities e compatibilidade com o OonCore;
- `backend/central.domain.json` declara models e regras do domínio;
- `frontend/central.ui.json` declara telas, formulários, grids e esteiras;
- `backend/central.config.js` fica reservado a extensões excepcionais de runtime;
- `frontend/src/main.tsx` é um bootstrap gerado e não deve transformar manifestos.

Autenticação, shell, roteamento, RBAC, metadata, CRUD, páginas genéricas e infraestrutura pertencem ao OonCore.

## Documentação e conformidade

```bash
npm run ooncore:docs        # sincroniza .ooncore/
npm run ooncore:docs:check  # valida versão/hash do cache local
npm run ooncore:conformance # valida a fronteira da Central
npm run check               # executa os gates locais
```

A pasta `.ooncore/` é um cache regenerável da documentação publicada no pacote. Não edite `context.generated.md` manualmente.

## Rodando

```bash
npm install
npm run check

cd backend && cp .env.example .env && npm install && npm run dev
cd ../frontend && cp .env.example .env && npm install && npm run dev
```

Em desenvolvimento, configure o mesmo valor em `DEV_TOKEN` no backend e `VITE_DEV_TOKEN` no frontend. A validação do token local é fornecida pelo Core; não implemente `auth.verifyToken` na Central.

## Evoluindo a Central

1. Declare domínio e fórmulas em `backend/central.domain.json`.
2. Declare telas em `frontend/central.ui.json`.
3. Use validações, triggers, hooks, mappings e regras somente para comportamento específico do negócio.
4. Execute `npm run check` antes de abrir o PR.

O OonCore implementa como a aplicação funciona; a Central declara o que pertence ao negócio.
