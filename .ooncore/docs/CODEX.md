# CODEX.md — Regras de Codificação OonCore

Este arquivo é a porta de entrada para o Codex codificar uma Central Oon.

A fonte de verdade desta documentação é a versão instalada do pacote `@oondemand/create-central-oon`. A pasta `.ooncore/` gerada em cada Central é apenas um cache local, criado por `create-central-oon docs --sync`.

## Antes de codificar

1. Rode `npm run ooncore:docs:check` na raiz da Central.
2. Se estiver desatualizado, rode `npm run ooncore:docs`.
3. Leia `.ooncore/context.generated.md`.
4. Identifique o recurso do Core que resolve a necessidade antes de criar código customizado.

## Leitura obrigatória por tipo de tarefa

### Backend/domínio

- `BACKEND_DOMAIN_MANIFEST.md`
- `BACKEND_PATTERNS.md`
- `COLLECTIONS_AND_PIPELINES.md`
- `CONNECTORS_AND_INTEGRATIONS.md`
- `RBAC_SECURITY.md`

### Frontend/manifesto

- `FRONTEND_PATTERNS.md`
- `FRONTEND_MANIFEST_REFERENCE.md`
- `REACTIVE_DOMAIN_FORMULAS.md`

### UX avançada, modais, abas e itens relacionados

Leia antes de criar páginas customizadas:

- `ADVANCED_UX_PATTERNS.md`
- `DETAIL_MODAL_AND_RELATED_GRIDS.md`

Use estes documentos quando a necessidade envolver:

- modal com abas;
- dados principais agrupados;
- grids relacionados;
- edição inline;
- ações por linha;
- registros filhos como itens, parcelas, produtos, documentos ou pagamentos;
- telas onde o usuário opera um registro principal e seus relacionamentos.

## Princípios obrigatórios

- Escreva apenas o domínio da Central.
- Use `central.domain.json` para models, campos, fórmulas e validações cobertos pelo contrato declarativo vigente.
- Não repita fórmulas do domínio em componentes React: os formulários do Core geram a prévia reativa a partir da metadata e o backend recalcula antes de persistir.
- Use `@oondemand/oon-core-back` para boot, autenticação, RBAC, CRUD, metadata, auditoria e padrões de API.
- Use `@oondemand/oon-core-front` para shell, rotas, menu, datagrid, formulários, badges, ações e renderização por metadata.
- Não recrie infraestrutura que já existe no Core.
- Não crie autenticação paralela.
- Não duplique RBAC no frontend.
- Não hardcode tenant, app, usuário, perfil, permissões, URLs sensíveis ou segredos.
- Não exponha chaves em código, templates ou documentação gerada.
- Não altere arquivos gerados do Core se houver extensão declarativa disponível.
- Prefira manifestos, validations, triggers, hooks, mappings, documents, pipelines, integrations e overrides declarativos.
- Antes de criar uma página React customizada, tente resolver com `central.ui.json`, `detailModal`, `form.groups`, `relatedGrid`, `readonlyGrid` e `rowActions`.

## Ordem de decisão

Ao implementar uma necessidade, siga esta ordem:

1. Configuração existente do Core.
2. Declaração em `central.config.js`, `central.domain.json` ou `central.ui.json`.
3. Validation, trigger, hook ou mapping no backend da Central.
4. Modal, abas, grid relacionado, ação e renderer declarativos do Core.
5. Override local pequeno e isolado.
6. Código customizado somente quando o Core não oferecer extensão adequada.

## Entrega segura

Toda alteração deve manter:

- rastreabilidade;
- validação de entrada;
- RBAC no backend;
- ausência de segredo hardcoded;
- separação entre domínio da Central e infraestrutura do Core;
- compatibilidade com atualização futura dos pacotes `@oondemand/*`.
