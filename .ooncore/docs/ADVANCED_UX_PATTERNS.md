# ADVANCED_UX_PATTERNS.md — UX Avançada Declarativa no OonCore

Este documento orienta Codex e outras IAs a usarem o máximo de recursos do OonCore antes de criar telas customizadas. O foco é transformar padrões recorrentes de sistemas operacionais em **manifesto declarativo** e componentes reutilizáveis.

## Objetivo

Permitir que uma Central declare experiências avançadas como:

```txt
Entidade principal
├── grid principal com filtros e ações
└── modal de detalhe com abas
    ├── resumo
    ├── dados principais
    ├── itens relacionados editáveis inline
    └── registros relacionados somente leitura
```

Caso de referência: `OrcamentoProjeto -> OrcamentoItem -> Pagamento`.

## Regra de ouro para IAs

Antes de criar uma página React customizada, verifique se a necessidade pode ser resolvida por:

1. `collections[]` no `central.ui.json`.
2. `list.filters` e `list.rowActions`.
3. `detailModal.tabs`.
4. `form.groups`.
5. `relatedGrid`.
6. `rowActions` declarativas.
7. Um pequeno `customComponent` isolado.

Código customizado de página inteira deve ser a última opção.

## Padrão 1 — Tela principal limpa

A tela principal de uma coleção operacional deve conter apenas:

- título e descrição;
- filtros;
- busca;
- botão novo;
- grid principal;
- ações por linha.

Ela **não deve** expandir detalhes complexos abaixo do grid. Relações, edição profunda e acompanhamento devem ir para a modal de detalhe.

## Padrão 2 — Modal de detalhe com abas

Use uma modal quando o usuário precisar operar um registro com várias perspectivas.

Abas recomendadas:

- `summary`: visão rápida de indicadores e contadores.
- `form`: dados principais do registro.
- `relatedGrid`: filhos editáveis, como itens do orçamento.
- `readonlyGrid`: registros relacionados apenas para consulta, como pagamentos gerados.

## Padrão 3 — Formulários agrupados

Formulários longos devem ser divididos em grupos semânticos:

```json
{
  "type": "form",
  "groups": [
    { "label": "Identificação", "fields": ["codigo", "nome", "status"] },
    { "label": "Faturamento", "fields": ["cliente", "cnpj", "contato"] },
    { "label": "Observações", "fields": ["observacoes"] }
  ]
}
```

## Padrão 4 — Itens relacionados editáveis inline

Quando uma entidade principal tem muitos itens filhos, como itens de orçamento, serviços, parcelas, documentos ou pedidos, prefira `relatedGrid` com `editMode: "inline"`.

Comportamento esperado:

- edição célula a célula;
- indicação de linha alterada;
- botão `Salvar` por linha;
- botão `Cancelar` por linha;
- validação antes de salvar;
- loading por linha;
- erro por linha;
- atualização automática dos dados relacionados.

## Padrão 5 — Ações por linha

Ações de domínio devem ser declaradas no manifesto e executadas por HTTP.

Exemplo:

```json
{
  "id": "gerarPagamento",
  "label": "Gerar pagamento",
  "type": "apiAction",
  "method": "POST",
  "endpoint": "/api/ss-eventos/orcamentos-itens/:id/gerar-pagamento",
  "disabledWhen": { "field": "pagamentoId", "exists": true },
  "refresh": ["self", "pagamentos", "resumo"]
}
```

A regra de negócio continua na Central ou no backend. O Core apenas renderiza, valida permissões, executa a ação e atualiza a interface.

## Padrão 6 — Relações declarativas

Sempre que possível, declare relações no manifesto:

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

Assim, qualquer aba pode referenciar `relation: "itens"` sem repetir configuração.

## Padrão 7 — Abas somente leitura

Use `readonlyGrid` para dados relacionados que não devem ser editados naquela tela.

Exemplo: pagamentos gerados a partir dos itens de um orçamento.

## Padrão 8 — Refresh entre abas

Ações em uma aba podem afetar outras abas. O manifesto deve declarar o refresh esperado:

```json
"refresh": ["self", "pagamentos", "resumo"]
```

Significado:

- `self`: recarrega o grid atual;
- `pagamentos`: recarrega a aba pagamentos;
- `resumo`: recalcula cards da aba resumo;
- `parent`: recarrega o registro principal.

## Quando ainda usar componente customizado

Use componente customizado apenas quando:

- houver visualização muito específica de negócio;
- o padrão ainda não existir no Core;
- a regra envolver interação visual não generalizável;
- o componente puder ser isolado e reaproveitado.

Mesmo nesses casos, prefira plugar o componente em uma aba `customComponent` da modal, e não substituir a página inteira.

## Checklist para Codex

Antes de criar tela customizada:

- [ ] A coleção principal pode usar `collections[]`?
- [ ] Os filtros cabem em `list.filters`?
- [ ] As ações de linha cabem em `list.rowActions`?
- [ ] O detalhe cabe em `detailModal`?
- [ ] Os campos cabem em `form.groups`?
- [ ] Os filhos cabem em `relatedGrid`?
- [ ] As ações dos filhos cabem em `rowActions`?
- [ ] A consulta relacionada cabe em `readonlyGrid`?
- [ ] O refresh entre abas está declarado?
- [ ] RBAC está no backend e refletido no manifesto?

## Antipadrões

Evite:

- recriar shell, menu, roteamento e providers;
- codificar página inteira só para mudar layout do formulário;
- chamar `fetch` direto se `useOonApi`/client do Core atende;
- duplicar regra de permissão apenas no frontend;
- hardcode de endpoints quando a metadata pode resolver;
- editar `.ooncore/` manualmente;
- criar variações visuais fora do padrão sem necessidade.

## Implementação disponível no Core

Use `collections[].list` para filtros, colunas e ações da lista principal. Use `collections[].relations` para nomear relações reutilizáveis e `collections[].detailModal.tabs` para declarar abas `summary`, `form`, `relatedGrid`, `readonlyGrid` ou `customComponent`.

Ações por linha (`rowActions`) podem abrir a modal (`openDetailModal`), navegar (`navigate`) ou chamar endpoints (`apiAction`). Condições declarativas (`exists`, `equals`, `notEquals`, `in`, `gt`, `gte`, `lt`, `lte`) controlam visibilidade e bloqueio sem hardcode de Central no Core.
