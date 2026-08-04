# DETAIL_MODAL_AND_RELATED_GRIDS.md — Modal com Abas e Grids Relacionados

Este documento define o contrato desejado para evoluir o `@oondemand/oon-core-front` com modal de detalhe, abas, grids relacionados, edição inline e ações por linha.

Status: **especificação para implementação**.

## 1. Motivação

Centrais operacionais frequentemente têm uma entidade principal com filhos operacionais.

Exemplos:

- Projeto -> Itens -> Pagamentos
- Pedido -> Produtos -> Expedições
- Contrato -> Parcelas -> Documentos
- Cliente -> Atividades -> Histórico
- Migração -> Registros -> Exceções

Hoje, esses casos tendem a virar páginas customizadas. O objetivo é abstrair o padrão no Core.

## 2. Resultado esperado

O manifesto deve ser capaz de declarar:

```txt
Grid principal da coleção
└── ação editar
    └── modal com abas
        ├── Resumo
        ├── Dados Principais
        ├── Itens relacionados editáveis inline
        └── Pagamentos/Histórico somente leitura
```

## 3. Extensão proposta do manifesto

### 3.1. Collections com list e detailModal

```json
{
  "model": "OrcamentoProjeto",
  "mode": "dynamic",
  "path": "/orcamentos-projetos",
  "label": "Orçamentos/Projetos",
  "section": "Operação",
  "list": {
    "filters": [],
    "columns": [],
    "rowActions": []
  },
  "relations": {},
  "detailModal": {
    "enabled": true,
    "titleField": "nome",
    "size": "xl",
    "defaultTab": "resumo",
    "tabs": []
  }
}
```

### 3.2. list.filters

Filtros declarativos renderizados acima do grid.

```json
{
  "field": "tipoRegistro",
  "label": "Tipo",
  "type": "select",
  "options": [
    { "label": "Orçamentos e projetos", "value": "" },
    { "label": "Só orçamentos", "value": "Orçamento" },
    { "label": "Só projetos", "value": "Projeto" }
  ]
}
```

Tipos iniciais:

- `text`
- `select`
- `date`
- `dateRange`
- `numberRange`
- `boolean`
- `ref`

### 3.3. list.rowActions

Ações no grid principal.

```json
{
  "type": "openDetailModal",
  "label": "Editar",
  "icon": "edit",
  "initialTab": "resumo"
}
```

Tipos iniciais:

- `openDetailModal`
- `navigate`
- `apiAction`
- `customAction`

### 3.4. relations

Relações nomeadas reutilizáveis por abas, filtros e ações.

```json
{
  "relations": {
    "itens": {
      "model": "OrcamentoItem",
      "foreignKey": "projetoId",
      "parentKey": "_id"
    },
    "pagamentos": {
      "model": "Pagamento",
      "foreignKey": "projetoId",
      "parentKey": "_id"
    }
  }
}
```

## 4. Abas suportadas

### 4.1. summary

Cards de resumo.

```json
{
  "id": "resumo",
  "label": "Resumo",
  "type": "summary",
  "cards": [
    { "label": "Itens", "source": "relatedCount", "relation": "itens" },
    { "label": "Total PARA", "field": "totalParaComImpostos", "format": "currency" }
  ]
}
```

Fontes:

- `field`
- `relatedCount`
- `relatedSum`
- `relatedAvg`
- `customMetric`

Formatos:

- `text`
- `number`
- `currency`
- `percent`
- `date`
- `badge`

### 4.2. form

Formulário do registro principal.

```json
{
  "id": "dados",
  "label": "Dados Principais",
  "type": "form",
  "groups": [
    {
      "label": "Identificação",
      "fields": ["tipoRegistro", "codigo", "nome", "status"]
    }
  ]
}
```

### 4.3. relatedGrid

Grid de filhos editável ou não.

```json
{
  "id": "itens",
  "label": "Itens",
  "type": "relatedGrid",
  "relation": "itens",
  "editable": true,
  "editMode": "inline",
  "columns": [],
  "rowActions": []
}
```

### 4.4. readonlyGrid

Grid relacionado somente leitura.

```json
{
  "id": "pagamentos",
  "label": "Pagamentos",
  "type": "readonlyGrid",
  "relation": "pagamentos",
  "columns": ["codigo", "descricao", "statusEsteira", "valorFechamento"]
}
```

### 4.5. customComponent

Aba com componente customizado registrado por chave.

```json
{
  "id": "analise",
  "label": "Análise",
  "type": "customComponent",
  "component": "custom:AnaliseProjeto"
}
```

## 5. Colunas de relatedGrid

```json
{
  "field": "totalParaComImpostos",
  "label": "Total PARA",
  "editable": true,
  "format": "currency",
  "width": 140
}
```

Propriedades:

- `field`
- `label`
- `editable`
- `readonly`
- `format`
- `renderer`
- `editor`
- `width`
- `hidden`
- `roles`
- `required`

## 6. Edição inline

O grid editável deve manter alterações em estado local por linha.

Requisitos:

- célula editável conforme metadata do campo;
- linha marcada como alterada;
- botão `Salvar` por linha;
- botão `Cancelar` por linha;
- `PUT /:modelPath/:id` usando CRUD genérico;
- loading por linha;
- erro por linha;
- refresh pós-salvamento configurável.

## 7. Row actions

### 7.1. apiAction

```json
{
  "id": "gerarPagamento",
  "label": "Gerar pagamento",
  "type": "apiAction",
  "method": "POST",
  "endpoint": "/api/ss-eventos/orcamentos-itens/:id/gerar-pagamento",
  "confirm": {
    "title": "Gerar pagamento?",
    "description": "Será criado um ticket financeiro vinculado a este item."
  },
  "disabledWhen": {
    "field": "pagamentoId",
    "exists": true
  },
  "refresh": ["self", "pagamentos", "resumo", "parent"]
}
```

### 7.2. Interpolação de endpoint

Suportar:

- `:id` -> `_id` da linha;
- `:parentId` -> `_id` do registro pai;
- `:fieldName` -> valor do campo na linha;
- `:parent.fieldName` -> valor do campo no pai.

### 7.3. disabledWhen

Operadores mínimos:

```json
{ "field": "pagamentoId", "exists": true }
{ "field": "status", "equals": "Cancelado" }
{ "field": "valor", "gt": 0 }
{ "field": "tipo", "in": ["A", "B"] }
```

### 7.4. refresh

Alvos:

- `self`: grid/aba atual;
- `parent`: registro principal;
- nome de aba: `pagamentos`, `resumo` etc.;
- `all`: todas as queries da modal.

## 8. RBAC

Cada nível pode ter `roles` ou `permissions`.

```json
{
  "id": "gerarPagamento",
  "roles": ["admin", "financeiro"]
}
```

A UI deve ocultar/desabilitar conforme permissão, mas a autoridade final continua no backend.

## 9. Componentes Core necessários

### CoreDetailModal

Responsável por:

- abrir detalhe/criação;
- buscar registro principal;
- controlar abas;
- salvar dados principais;
- orquestrar refresh;
- validar RBAC visual;
- renderizar erros.

### CoreTabbedDetail

Renderiza abas configuradas no manifesto.

### CoreRelatedGrid

Renderiza grid relacionado pelo `relation`.

### CoreInlineEditableCell

Renderiza o editor apropriado por tipo de campo.

### CoreRowAction

Executa ações declaradas por linha.

### CoreSummaryCards

Renderiza cards de resumo por fields e agregações relacionadas.

## 10. Compatibilidade

A implementação deve ser compatível com manifestos existentes.

- `collections[]` atual continua funcionando.
- `detailModal` é opcional.
- `list` é opcional.
- Sem `rowActions`, mantém ação padrão do Core.
- Sem `form.groups`, mantém formulário atual.

## 11. Critérios de aceite

- O manifesto consegue declarar a tela de Orçamentos/Projetos da SS Eventos sem página React customizada.
- A tela principal renderiza filtros, busca, grid e ação editar.
- A ação editar abre modal com abas.
- A aba Dados Principais salva o registro pai.
- A aba Itens carrega apenas filhos do pai selecionado.
- A aba Itens permite edição inline por linha.
- A aba Itens executa ação `Gerar pagamento` por linha.
- Após gerar pagamento, o item mostra badge de pagamento gerado.
- A aba Pagamentos recarrega automaticamente.
- A aba Resumo atualiza contadores/totais.
- RBAC visual respeita roles/permissions declaradas.
- Sem regressão em coleções simples.

## 12. Exemplo completo SS Eventos

```json
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
          { "label": "Orçamentos e projetos", "value": "" },
          { "label": "Só orçamentos", "value": "Orçamento" },
          { "label": "Só projetos", "value": "Projeto" }
        ]
      }
    ],
    "columns": ["tipoRegistro", "codigo", "nome", "cliente", "status", "totalItens", "totalParaComImpostos", "lucroTotalEvento"],
    "rowActions": [
      { "type": "openDetailModal", "label": "Editar", "icon": "edit", "initialTab": "resumo" }
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
    "tabs": [
      {
        "id": "resumo",
        "label": "Resumo",
        "type": "summary",
        "cards": [
          { "label": "Itens", "source": "relatedCount", "relation": "itens" },
          { "label": "Pagamentos", "source": "relatedCount", "relation": "pagamentos" },
          { "label": "Total PARA", "field": "totalParaComImpostos", "format": "currency" },
          { "label": "Lucro", "field": "lucroTotalEvento", "format": "currency" }
        ]
      },
      {
        "id": "dados",
        "label": "Dados Principais",
        "type": "form",
        "groups": [
          { "label": "Identificação", "fields": ["tipoRegistro", "codigo", "nome", "status", "cliente"] },
          { "label": "Evento", "fields": ["dataEvento", "localEvento", "contato"] },
          { "label": "Totais", "fields": ["totalItens", "totalParaComImpostos", "lucroTotalEvento"] }
        ]
      },
      {
        "id": "itens",
        "label": "Itens",
        "type": "relatedGrid",
        "relation": "itens",
        "editable": true,
        "editMode": "inline",
        "columns": [
          { "field": "linhaPlanilha", "readonly": true },
          { "field": "categoria", "editable": true },
          { "field": "item", "editable": true },
          { "field": "fornecedorRazaoSocial", "editable": true },
          { "field": "status", "editable": true },
          { "field": "totalParaComImpostos", "editable": true, "format": "currency" },
          { "field": "formaPagamento", "editable": true },
          { "field": "pagamentoId", "label": "Pagamento", "readonly": true, "display": "badgeExists" }
        ],
        "rowActions": [
          {
            "id": "gerarPagamento",
            "label": "Gerar pagamento",
            "type": "apiAction",
            "method": "POST",
            "endpoint": "/api/ss-eventos/orcamentos-itens/:id/gerar-pagamento",
            "disabledWhen": { "field": "pagamentoId", "exists": true },
            "refresh": ["self", "pagamentos", "resumo", "parent"]
          }
        ]
      },
      {
        "id": "pagamentos",
        "label": "Pagamentos",
        "type": "readonlyGrid",
        "relation": "pagamentos",
        "columns": ["codigo", "descricao", "fornecedorRazaoSocial", "statusEsteira", "valorFechamento", "formaPagamento", "dataPagamento"]
      }
    ]
  }
}
```

## 11. Status implementado no Core

O `@oondemand/oon-core-front` implementa o contrato acima de forma genérica nos componentes `CoreDetailModal`, `CoreTabbedDetail`, `CoreSummaryCards`, `CoreRelatedGrid`, `CoreInlineEditableCell` e `CoreRowAction`.

Exemplo completo:

```json
{
  "model": "OrcamentoProjeto",
  "mode": "dynamic",
  "path": "/orcamentos-projetos",
  "label": "Orçamentos/Projetos",
  "section": "Operação",
  "list": {
    "filters": [{ "field": "tipoRegistro", "label": "Tipo", "type": "select", "options": [{ "label": "Todos", "value": "" }] }],
    "rowActions": [{ "type": "openDetailModal", "label": "Editar", "initialTab": "resumo" }]
  },
  "relations": {
    "itens": { "model": "OrcamentoItem", "foreignKey": "projetoId", "parentKey": "_id" },
    "pagamentos": { "model": "Pagamento", "foreignKey": "projetoId", "parentKey": "_id" }
  },
  "detailModal": {
    "enabled": true,
    "titleField": "nome",
    "defaultTab": "resumo",
    "tabs": [
      { "id": "resumo", "label": "Resumo", "type": "summary", "cards": [{ "label": "Itens", "source": "relatedCount", "relation": "itens" }] },
      { "id": "dados", "label": "Dados Principais", "type": "form", "groups": [{ "label": "Identificação", "fields": ["codigo", "nome", "status"] }] },
      { "id": "itens", "label": "Itens", "type": "relatedGrid", "relation": "itens", "editable": true, "editMode": "inline", "columns": ["item", "status"] },
      { "id": "pagamentos", "label": "Pagamentos", "type": "readonlyGrid", "relation": "pagamentos", "columns": ["codigo", "valorFechamento"] }
    ]
  }
}
```

`rowActions` do tipo `apiAction` suportam interpolação de `:id`, `:parentId`, `:fieldName` e `:parent.fieldName`, além de `confirm`, `disabledWhen`, `hiddenWhen` e `refresh` com `self`, `parent`, `all` ou o id de uma aba.
