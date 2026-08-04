# Referência do Manifesto Frontend OonCore

Este documento é a referência operacional para o Codex criar ou alterar manifestos do frontend OonCore.

Use este arquivo junto com `FRONTEND_PATTERNS.md`. O arquivo de padrões explica como pensar a UI; este arquivo lista as opções do contrato atual e das extensões planejadas para UX avançada.

Para modal com abas, grids relacionados editáveis e ações por linha, leia também:

- `ADVANCED_UX_PATTERNS.md`
- `DETAIL_MODAL_AND_RELATED_GRIDS.md`

## Arquivos envolvidos

```txt
frontend/central.ui.json               # manifesto declarativo da Central
frontend/src/main.tsx                   # bootstrap do frontend
packages/oonCore-front/src/manifest.ts # conversão central.ui.json -> OonCoreFrontConfig
packages/oonCore-front/src/types.ts    # tipos oficiais do contrato
```

## Regra principal

O manifesto JSON não deve carregar componentes React. Ele só pode declarar dados e chaves de renderer, como:

```txt
custom:MeusAppsHeader
fields.password
cells.statusBadge
cards.appLauncher
actions.ativarApp
menus.portal
```

Os componentes reais devem ser registrados em código TypeScript/React pelo `registry`.

## Níveis de contrato

Existem três níveis importantes:

1. `central.ui.json`: entrada declarativa usada pelas Centrais geradas.
2. `CentralUiManifest`: contrato lido por `startFromManifest`.
3. `OonUiManifest` / `OonCoreFrontConfig`: contrato interno mais completo do Core Front.

Para Codex, a ordem recomendada é:

1. Começar pelo `central.ui.json`.
2. Usar `pages` e `blocks` quando precisar de UI v2.
3. Usar `collections[].list`, `collections[].detailModal`, `form.groups`, `relations` e `relatedGrid` para UX operacional avançada.
4. Usar registry/overrides em TypeScript quando precisar de componentes customizados.
5. Evitar recriar shell, rotas, menu, grid, cards ou formulários manualmente.

## CentralUiManifest

Contrato aceito por `startFromManifest(manifest, runtime)`.

```ts
interface CentralUiManifest {
  name: string;
  slug: string;
  backend?: { metadataUrl?: string };
  schemaVersion?: 1 | 2;
  layout?: OonLayoutConfig;
  registry?: OonComponentRegistry;
  navigation?: OonNavigationConfig;
  pages?: OonPageDef[];
  collections?: OonCollectionManifestDef[];
  pipelines?: Array<{
    name?: string;
    model?: string;
    mode?: string;
    stageField?: string;
    path?: string;
    label?: string;
    section?: string;
  }>;
  documents?: Array<{
    model: string;
    mode?: string;
    path?: string;
    label?: string;
    section?: string;
    approval?: boolean;
    attachments?: boolean;
  }>;
}
```

## Opções de raiz

| Campo | Tipo | Uso |
| --- | --- | --- |
| `name` | `string` | Nome exibido da Central. |
| `slug` | `string` | Identificador da Central/app. |
| `backend.metadataUrl` | `string` | URL explícita de metadata, quando aplicável. |
| `schemaVersion` | `1 \| 2` | Sem valor = compatibilidade v1. Use `2` para UI v2. |
| `layout` | `OonLayoutConfig` | Shell, sidebar, topbar, header, footer e slots. |
| `navigation` | `OonNavigationConfig` | Modo do menu e itens manuais. |
| `pages` | `OonPageDef[]` | Páginas por blocos da UI v2. |
| `collections` | `Array` | Views de coleção, simples ou avançadas. |
| `pipelines` | `Array` | Atalho para gerar esteiras. |
| `documents` | `Array` | Atalho para gerar documentos. |

## Layout

```ts
type OonSlotConfig = "core" | "none" | `custom:${string}`;

interface OonLayoutConfig {
  shell?: "default" | "portal" | "content-only" | `custom:${string}`;
  sidebar?: OonSlotConfig;
  topbar?: OonSlotConfig;
  header?: "none" | `custom:${string}`;
  footer?: "core" | "none" | `custom:${string}`;
  assistant?: "core" | "none" | `custom:${string}`;
  main?: "core";
}
```

### Valores de `layout.shell`

| Valor | Comportamento |
| --- | --- |
| `default` | Shell operacional padrão com sidebar/topbar. |
| `portal` | Shell para portal, útil para Meus Apps ou home de cards. |
| `content-only` | Experiência focada em conteúdo. |
| `custom:<key>` | Shell registrado em `registry.layoutSlots`. |

## Navigation

```ts
type OonNavigationMode = "auto" | "manual" | "mixed";

interface OonNavigationConfig {
  mode?: OonNavigationMode;
  items?: OonMenuItem[];
}
```

## Collections no central.ui.json

Atalho para coleções simples ou avançadas.

```ts
interface OonCollectionManifestDef {
  model: string;
  mode?: "full" | "minimal" | "dynamic";
  path?: string;
  label?: string;
  section?: string;
  list?: OonCollectionListConfig;
  relations?: Record<string, OonRelationDef>;
  detailModal?: OonDetailModalConfig;
}
```

### Exemplo simples

```json
{
  "collections": [
    {
      "model": "Cliente",
      "mode": "dynamic",
      "path": "/clientes",
      "label": "Clientes",
      "section": "Cadastros"
    }
  ]
}
```

### Exemplo avançado

```json
{
  "collections": [
    {
      "model": "OrcamentoProjeto",
      "mode": "dynamic",
      "path": "/orcamentos-projetos",
      "label": "Orçamentos/Projetos",
      "section": "Operação",
      "list": {
        "filters": [
          {
            "field": "tipoRegistro",
            "label": "Tipo",
            "type": "select",
            "options": [
              { "label": "Todos", "value": "" },
              { "label": "Orçamento", "value": "Orçamento" },
              { "label": "Projeto", "value": "Projeto" }
            ]
          }
        ],
        "rowActions": [
          { "type": "openDetailModal", "icon": "edit", "label": "Editar", "initialTab": "resumo" }
        ]
      },
      "relations": {
        "itens": { "model": "OrcamentoItem", "foreignKey": "projetoId", "parentKey": "_id" },
        "pagamentos": { "model": "Pagamento", "foreignKey": "projetoId", "parentKey": "_id" }
      },
      "detailModal": {
        "enabled": true,
        "titleField": "nome",
        "defaultTab": "resumo",
        "tabs": []
      }
    }
  ]
}
```

## list

Configura filtros, colunas e ações do grid principal.

```ts
interface OonCollectionListConfig {
  filters?: OonListFilterDef[];
  columns?: Array<string | OonColumnDef>;
  rowActions?: OonRowActionDef[];
}
```

### list.filters

```json
{
  "field": "tipoRegistro",
  "label": "Tipo",
  "type": "select",
  "options": [
    { "label": "Todos", "value": "" },
    { "label": "Orçamento", "value": "Orçamento" }
  ]
}
```

Tipos previstos:

- `text`
- `select`
- `date`
- `dateRange`
- `numberRange`
- `boolean`
- `ref`

### list.rowActions

```json
{
  "type": "openDetailModal",
  "label": "Editar",
  "icon": "edit",
  "initialTab": "resumo"
}
```

## relations

Relações nomeadas entre model pai e models filhos.

```json
{
  "relations": {
    "itens": {
      "model": "OrcamentoItem",
      "foreignKey": "projetoId",
      "parentKey": "_id"
    }
  }
}
```

## detailModal

Configura modal de detalhe/criação com abas.

```ts
interface OonDetailModalConfig {
  enabled?: boolean;
  titleField?: string;
  size?: "md" | "lg" | "xl" | "full";
  defaultTab?: string;
  tabs: OonDetailTabDef[];
}
```

### Abas suportadas

- `summary`
- `form`
- `relatedGrid`
- `readonlyGrid`
- `customComponent`

### Aba summary

```json
{
  "id": "resumo",
  "label": "Resumo",
  "type": "summary",
  "cards": [
    { "label": "Itens", "source": "relatedCount", "relation": "itens" },
    { "label": "Total", "field": "total", "format": "currency" }
  ]
}
```

### Aba form

```json
{
  "id": "dados",
  "label": "Dados Principais",
  "type": "form",
  "groups": [
    { "label": "Identificação", "fields": ["codigo", "nome", "status"] }
  ]
}
```

### Aba relatedGrid

```json
{
  "id": "itens",
  "label": "Itens",
  "type": "relatedGrid",
  "relation": "itens",
  "editable": true,
  "editMode": "inline",
  "columns": [
    { "field": "item", "editable": true },
    { "field": "status", "editable": true },
    { "field": "total", "editable": true, "format": "currency" }
  ],
  "rowActions": []
}
```

### Aba readonlyGrid

```json
{
  "id": "pagamentos",
  "label": "Pagamentos",
  "type": "readonlyGrid",
  "relation": "pagamentos",
  "columns": ["codigo", "descricao", "status", "valor"]
}
```

## rowActions

Ações reutilizáveis em grid principal ou grids relacionados.

```ts
interface OonRowActionDef {
  id?: string;
  label: string;
  icon?: string;
  type: "openDetailModal" | "navigate" | "apiAction" | "customAction";
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint?: string;
  initialTab?: string;
  confirm?: { title?: string; description?: string };
  disabledWhen?: OonConditionDef;
  hiddenWhen?: OonConditionDef;
  refresh?: string[];
  roles?: string[];
  permissions?: string[];
}
```

### apiAction

```json
{
  "id": "gerarPagamento",
  "label": "Gerar pagamento",
  "type": "apiAction",
  "method": "POST",
  "endpoint": "/api/ss-eventos/orcamentos-itens/:id/gerar-pagamento",
  "disabledWhen": { "field": "pagamentoId", "exists": true },
  "refresh": ["self", "pagamentos", "resumo", "parent"]
}
```

## CollectionViewDef completo

Contrato interno completo quando a coleção já está em `ui.views` ou em blocos.

```ts
interface CollectionViewDef {
  type: "collection";
  id?: string;
  model: string;
  label?: string;
  path?: string;
  icon?: ReactNode;
  section?: string;
  mode?: "full" | "minimal" | "dynamic";
  columns?: OonColumnDef[];
  form?: OonFormFieldDef[];
  importExport?: boolean;
  renderer?: string;
  cardRenderer?: string;
  actions?: OonActionDef[];
  permissions?: string[];
  list?: OonCollectionListConfig;
  relations?: Record<string, OonRelationDef>;
  detailModal?: OonDetailModalConfig;
}
```

## Compatibilidade

- Os campos `list`, `relations` e `detailModal` são opcionais.
- Manifestos existentes continuam funcionando.
- Sem `detailModal`, o Core mantém comportamento atual.
- Sem `form.groups`, o Core mantém formulário padrão.

## UX avançada implementada

Campos aceitos em `collections[]`:

- `list.filters`: filtros acima do grid principal.
- `list.columns`: colunas declarativas opcionais.
- `list.rowActions`: ações por linha (`openDetailModal`, `navigate`, `apiAction`, `customAction`).
- `relations`: mapa de relações `{ model, foreignKey, parentKey }`.
- `detailModal`: modal genérica com `titleField`, `defaultTab`, `size` e `tabs`.

Tipos de aba:

- `summary`: cards com `field`, `relatedCount`, `relatedSum`, `relatedAvg` ou `customMetric`.
- `form`: campos ou `groups` do registro principal.
- `relatedGrid`: registros filhos, opcionalmente editáveis inline.
- `readonlyGrid`: registros filhos sem edição.
- `customComponent`: chave de componente registrado.

`apiAction.endpoint` aceita `:id`, `:parentId`, `:fieldName` e `:parent.fieldName`. `refresh` aceita `self`, `parent`, `all` ou ids de abas.
