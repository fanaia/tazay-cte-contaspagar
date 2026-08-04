# OonCore Contexto Consolidado para Codex

> Arquivo gerado automaticamente por `create-central-oon docs --sync`.
> Não edite manualmente. A fonte de verdade está no pacote `@oondemand/create-central-oon` instalado.

Este contexto consolida as regras mínimas para codificar Centrais Oon com segurança, usando o máximo dos recursos do OonCore.

---

<!-- source: ADVANCED_UX_PATTERNS.md -->

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

---

<!-- source: BACKEND_DOMAIN_MANIFEST.md -->

# Manifesto declarativo de domínio — `central.domain.json`

O arquivo `central.domain.json`, localizado na raiz do backend da Central, declara models, campos, fórmulas e validações sem exigir um arquivo JavaScript por model.

O OonCore carrega o manifesto durante o bootstrap, antes de carregar `src/models`, `src/validations`, `src/triggers` e os demais diretórios de extensão.

> A Central declara o domínio e as regras. O OonCore constrói schema Mongoose, metadata, CRUD, cálculos protegidos e validações.

## Escopo da versão 1

O contrato cobre:

- identidade do manifesto;
- models e seus caminhos de API;
- configuração de CRUD já aceita por `defineModel`;
- campos primitivos, enumerações, referências e moedas;
- obrigatoriedade, valor padrão, busca, unicidade e índice simples;
- limites numéricos e de tamanho de texto;
- campos somente leitura protegidos nas mutações HTTP;
- campos calculados no servidor;
- dependências entre campos calculados, ordenadas automaticamente;
- precisão e tratamento de valores ausentes em fórmulas;
- validações declarativas entre campos, com condição opcional;
- validação estrutural com todos os problemas retornados em uma única exceção.

Ainda não fazem parte desta versão:

- índices compostos;
- triggers e transições declarativas;
- migrações automáticas de dados;
- mappings de integração;
- funções JavaScript embutidas no JSON.

As expressões são interpretadas por um avaliador fechado. O Core não usa `eval`, `Function` ou execução de código vindo do manifesto.

## Exemplo financeiro

```json
{
  "name": "Central SS Eventos",
  "slug": "ss-eventos",
  "schemaVersion": 1,
  "models": [
    {
      "name": "ProjetoItem",
      "singular": "item",
      "basePath": "/itens",
      "crud": {
        "enabled": true
      },
      "fields": {
        "quantidade": {
          "kind": "number",
          "required": true
        },
        "diarias": {
          "kind": "number",
          "required": true
        },
        "valorUnitario": {
          "kind": "currency",
          "required": true
        },
        "percentualFee": {
          "kind": "number",
          "default": 0
        },
        "valorContratado": {
          "kind": "currency",
          "default": 0
        },
        "valorPago": {
          "kind": "currency",
          "default": 0
        },
        "statusIntegracao": {
          "kind": "string",
          "readonly": true
        },
        "subtotal": {
          "kind": "currency",
          "computed": {
            "precision": 2,
            "expression": {
              "op": "multiply",
              "args": [
                { "field": "quantidade" },
                { "field": "diarias" },
                { "field": "valorUnitario" }
              ]
            }
          }
        },
        "valorFee": {
          "kind": "currency",
          "computed": {
            "precision": 2,
            "expression": {
              "op": "divide",
              "args": [
                {
                  "op": "multiply",
                  "args": [
                    { "field": "subtotal" },
                    { "field": "percentualFee" }
                  ]
                },
                { "value": 100 }
              ]
            }
          }
        },
        "total": {
          "kind": "currency",
          "computed": {
            "precision": 2,
            "expression": {
              "op": "add",
              "args": [
                { "field": "subtotal" },
                { "field": "valorFee" }
              ]
            }
          }
        }
      },
      "validations": [
        {
          "name": "pagamento-limitado-ao-contratado",
          "code": "PAGAMENTO_ACIMA_CONTRATADO",
          "field": "valorPago",
          "message": "O valor pago não pode superar o valor contratado.",
          "assert": {
            "op": "lte",
            "args": [
              { "field": "valorPago" },
              { "field": "valorContratado" }
            ]
          }
        }
      ]
    }
  ]
}
```

## Estrutura principal

| Propriedade | Obrigatória | Descrição |
|---|---:|---|
| `name` | sim | Nome legível da declaração de domínio. |
| `slug` | não | Identificador em minúsculas, números e hífens. |
| `schemaVersion` | sim | Nesta versão, deve ser `1`. |
| `models` | sim | Lista não vazia de models. |

## Model

| Propriedade | Obrigatória | Descrição |
|---|---:|---|
| `name` | sim | Nome PascalCase usado no registry e no Mongoose. |
| `singular` | não | Nome singular usado pelo Core. |
| `basePath` | não | Caminho iniciado por `/`. |
| `crud` | não | Mesmo contrato aceito por `defineModel`. |
| `options` | não | Opções JSON compatíveis com o schema Mongoose. |
| `fields` | sim | Objeto com pelo menos um campo. |
| `validations` | não | Lista de regras declarativas executadas depois dos cálculos. |

Não declare a mesma model no manifesto e em `src/models`. O registry interrompe o bootstrap para impedir duas fontes de verdade.

## Tipos de campo

- `string`
- `number`
- `boolean`
- `date`
- `ref`
- `enum`
- `currency`
- `currencyCode`
- `currencyConverted`

### Opções comuns

- `label`: rótulo para metadata e frontend;
- `description`: explicação funcional;
- `required`: campo obrigatório;
- `default`: valor padrão JSON;
- `readonly`: campo controlado pelo servidor;
- `searchable`: inclui texto na busca derivada do Core;
- `unique`: índice único simples;
- `index`: índice simples;
- `computed`: fórmula declarativa para campos numéricos ou monetários.

### Opções por tipo

- textos: `minLength`, `maxLength`;
- números e moedas: `min`, `max`;
- `ref`: `ref` com o nome da model relacionada;
- `enum`: `values` com textos únicos e não vazios;
- `currencyConverted`: `base` com código ISO de três letras.

## Campos calculados

`computed` é permitido em `number`, `currency` e `currencyConverted`.

```json
{
  "kind": "currency",
  "computed": {
    "expression": {
      "op": "multiply",
      "args": [
        { "field": "quantidade" },
        { "field": "valorUnitario" }
      ]
    },
    "precision": 2,
    "nullAsZero": true
  }
}
```

| Propriedade | Padrão | Descrição |
|---|---:|---|
| `expression` | — | Expressão obrigatória. |
| `precision` | `2` | Casas decimais, entre 0 e 8. |
| `nullAsZero` | `true` | Trata campos ausentes ou vazios como zero nas operações numéricas. |

Campos calculados:

- são automaticamente `readonly`;
- recebem `immutable` no schema Mongoose;
- são recalculados no backend em criação, edição, patch e importação;
- são calculados em ordem de dependência;
- não podem formar ciclos;
- aparecem na metadata com `readonly: true` e a declaração `computed`.

## Expressões

Uma expressão declara exatamente um destes nós:

```json
{ "value": 100 }
```

```json
{ "field": "valorUnitario" }
```

```json
{
  "op": "multiply",
  "args": [
    { "field": "quantidade" },
    { "field": "valorUnitario" }
  ]
}
```

### Operadores aritméticos

- `add`
- `subtract`
- `multiply`
- `divide`
- `min`
- `max`
- `abs`
- `negate`
- `coalesce`

### Operadores de comparação

- `eq`
- `neq`
- `gt`
- `gte`
- `lt`
- `lte`

### Operadores lógicos e de presença

- `and`
- `or`
- `not`
- `present`
- `in`

Divisão por zero e valores não numéricos em fórmulas geram `DomainRuleError` com status 422.

## Validações entre campos

As validações rodam depois que o Core consolidou o registro e recalculou todos os campos dependentes.

```json
{
  "name": "valor-pago-valido",
  "code": "PAGAMENTO_ACIMA_CONTRATADO",
  "field": "valorPago",
  "message": "O valor pago não pode superar o valor contratado.",
  "when": {
    "op": "present",
    "args": [{ "field": "valorPago" }]
  },
  "assert": {
    "op": "lte",
    "args": [
      { "field": "valorPago" },
      { "field": "valorContratado" }
    ]
  }
}
```

| Propriedade | Obrigatória | Descrição |
|---|---:|---|
| `name` | sim | Identificador único da validação dentro da model. |
| `message` | sim | Mensagem operacional apresentada ao usuário. |
| `assert` | sim | Expressão que deve resultar em verdadeiro. |
| `when` | não | Condição para executar a regra. |
| `field` | não | Campo associado ao erro. |
| `code` | não | Código em maiúsculas para tratamento programático. |

Falhas geram `DomainRuleError` com `statusCode: 422`, `code`, `field`, `rule` e detalhes compatíveis com o tratamento de erros do Core.

## Proteção de campos somente leitura

A proteção não depende apenas do frontend.

- valor readonly enviado na criação é rejeitado;
- alteração de valor readonly é rejeitada;
- em edição, o mesmo valor pode voltar no payload e é removido antes da persistência;
- campos calculados podem voltar no payload somente quando coincidem com o resultado calculado pelo servidor;
- tentativa de adulterar um campo calculado é rejeitada;
- services recebem somente campos permitidos e os resultados recalculados.

Isso permite formulários que enviam o registro completo sem abrir espaço para alterar totais, status técnicos ou identificadores controlados pelo sistema.

## Atualizações parciais

Em `PUT` ou `PATCH`, o Core:

1. carrega o registro atual quando existem regras declarativas ou `defineValidation`;
2. remove ou bloqueia campos readonly;
3. consolida os campos atuais com as alterações recebidas;
4. recalcula campos dependentes em ordem;
5. executa validações declarativas;
6. executa a validação JavaScript registrada, quando existir;
7. persiste somente as alterações permitidas e os valores calculados.

A validação JavaScript recebe:

```js
{
  op,
  method,
  id,
  current,
  requestedChanges,
  changes,
  consolidated
}
```

## Erros de validação do manifesto

Um manifesto estruturalmente inválido lança `DomainManifestError`:

```js
{
  name: "DomainManifestError",
  code: "OON_DOMAIN_MANIFEST_INVALID",
  statusCode: 422,
  issues: [
    {
      path: "models[0].fields.total.computed.expression",
      message: "dependência circular entre campos calculados: total -> fee -> total."
    }
  ]
}
```

A validação agrega os problemas para que o autor corrija o documento em uma única rodada.

## APIs públicas

```js
const {
  validateDomainManifest,
  domainManifestToDefinitions,
  registerDomainManifest,
  loadDomainManifest,
  evaluateDomainExpression,
  applyDomainMutation,
  DomainManifestError,
  DomainRuleError,
  DOMAIN_EXPRESSION_OPERATORS
} = require("@oondemand/oon-core-back");
```

Na operação normal não é necessário chamar essas funções: `oonCore-back start` descobre automaticamente `central.domain.json` e o CRUD aplica as regras.

## Compatibilidade durante a migração

Os diretórios JavaScript continuam disponíveis para regras ainda não declarativas. A ordem é:

1. `central.config.js`;
2. `central.domain.json`;
3. diretórios em `src/`.

Isso permite migrar model por model. `defineValidation` continua disponível e roda depois das fórmulas e validações declarativas.

---

<!-- source: BACKEND_PATTERNS.md -->

# Padrões Backend

O backend da Central deve conter apenas domínio e extensões. Boot, infraestrutura, CRUD padrão, autenticação, RBAC e metadata pertencem ao `@oondemand/oon-core-back`.

## Estrutura esperada

```txt
backend/
├── central.config.js
├── central.manifest.json
└── src/
    ├── models/
    ├── validations/
    ├── triggers/
    ├── hooks/
    ├── mappings/
    ├── documents/
    ├── pipelines/
    ├── integrations/
    ├── routes/
    ├── controllers/
    └── services/
```

## Models

Use models para declarar entidades de negócio. Cada model deve ser pequeno, com nomes claros e campos compatíveis com as telas e integrações.

Boas práticas:

- use campos explícitos;
- defina tipos, obrigatoriedade e enums quando aplicável;
- preserve campos de status para esteiras;
- evite regras complexas diretamente no schema;
- evite dependência direta de frontend.

## Validations

Use validations para regras de negócio síncronas e mensagens claras para o usuário.

Exemplos:

- campo obrigatório condicional;
- status permitido para transição;
- valor mínimo/máximo;
- combinação inválida de campos;
- bloqueio por permissão ou perfil.

Em inclusões, a validation recebe os dados enviados. Em atualizações por `PUT` ou `PATCH`, o OonCore carrega o registro atual e entrega à validation o registro consolidado com as alterações. Isso permite que formulários em abas e datagrids enviem somente os campos modificados sem perder referências obrigatórias durante a validação.

O segundo argumento informa o contexto da operação:

```js
async function validar(dados, contexto) {
  // contexto.op: "create" ou "update"
  // contexto.method: "post", "put" ou "patch"
  // contexto.id: identificador do registro em updates
  // contexto.current: registro antes da alteração
  // contexto.changes: somente os campos enviados
  // contexto.consolidated: registro completo usado em `dados`
}
```

A validation deve avaliar `dados` como estado final pretendido. Use `contexto.changes` apenas quando a regra depender de quais campos foram efetivamente alterados.

## Triggers e hooks

Use triggers e hooks para efeitos controlados depois ou antes de alterações.

Exemplos:

- criar ticket de integração;
- recalcular campos derivados;
- gerar histórico operacional;
- disparar conector;
- atualizar etapa da esteira.

Regras:

- trigger não deve esconder regra crítica sem validação;
- evite efeitos irreversíveis sem log;
- integração externa deve passar por camada de integração/conector;
- falhas de integração devem gerar status rastreável, não quebrar silenciosamente o processo.

## Rotas customizadas

Crie rotas customizadas somente quando o CRUD/metadata do Core não resolver.

Toda rota customizada deve ter:

- autenticação;
- verificação de permissão;
- validação de entrada;
- tratamento de erro;
- resposta padronizada;
- ausência de segredo hardcoded.

## Serviços

Use `services/` para regras reutilizáveis. Evite controllers grandes.

## Segurança

Nunca confie no frontend para permissão, tenant, app ou perfil. O backend deve validar tudo que altera dados, dispara integrações ou expõe informações sensíveis.

---

<!-- source: BACKEND_PROCESS_MANIFEST.md -->

# Manifesto backend de processos

O arquivo opcional `backend/central.process.json` declara capacidades de processo que pertencem ao OonCore e não à implementação local de uma Central.

Ele complementa:

- `central.app.json`: identidade, módulos e capabilities da aplicação;
- `backend/central.domain.json`: models, campos, fórmulas do próprio registro e validações locais;
- `frontend/central.ui.json`: projeção visual, coleções, esteiras e ações exibidas.

O manifesto de processos é carregado **depois** do domínio. Por isso, toda model e todo campo citados precisam existir em `central.domain.json`.

## Contrato mínimo

```json
{
  "schemaVersion": 1,
  "models": {
    "Pagamento": {
      "workflow": {},
      "bindings": [],
      "deleteProtection": [],
      "atomicInvariants": []
    }
  }
}
```

O runtime não executa JavaScript, `eval`, nomes de funções ou módulos informados no JSON. Expressões usam a mesma AST fechada das regras de domínio.

## Workflow e transições

```json
{
  "workflow": {
    "stageField": "etapa",
    "initialStages": ["Solicitado"],
    "defaultStage": "Solicitado",
    "transitions": [
      { "from": "Solicitado", "to": "Aprovado" },
      {
        "from": "Aprovado",
        "to": "Aguardando NF",
        "when": {
          "op": "eq",
          "args": [
            { "field": "aprovadoFinanceiro" },
            { "value": true }
          ]
        }
      }
    ],
    "lockedFieldsByStage": {
      "Enviado para Omie": ["valor", "projetoId", "projetoItemId"],
      "Pagamento Ok": ["valor", "projetoId", "projetoItemId"]
    },
    "lockedMessage": "Os dados de negócio ficam bloqueados nesta etapa.",
    "onEnter": [
      {
        "stage": "Enviado para Omie",
        "set": {
          "statusTrabalho": "Trabalhando",
          "omieStatusIntegracao": "Pendente"
        }
      }
    ],
    "automaticTransitions": [
      {
        "when": {
          "op": "eq",
          "args": [
            { "field": "omieLiquidado" },
            { "value": true }
          ]
        },
        "to": "Pagamento Ok",
        "set": { "statusTrabalho": "Trabalhando" }
      }
    ]
  }
}
```

Regras importantes:

- o backend compara o valor anterior e o novo; enviar novamente a mesma etapa não cria uma transição;
- uma mudança manual precisa existir em `transitions` e satisfazer `when`;
- `lockedFieldsByStage` é aplicado sobre a etapa anterior e impede alterações de negócio mesmo por `PUT` ou `PATCH` diretos;
- `onEnter` produz alterações confiáveis do Core;
- `automaticTransitions` é executado pelo servidor depois dos bindings e não depende do frontend.

A UI pode continuar declarando botões `transition` e `setField`. Ela é uma projeção; a autoridade permanece no backend.

## Bindings cross-model

Bindings preenchem campos derivados a partir de outra model ou de registros relacionados. Todos são resolvidos em lote.

### Lookup

```json
{
  "field": "percentualFeeAplicado",
  "kind": "lookup",
  "sourceModel": "Projeto",
  "localField": "projetoId",
  "sourceField": "percentualFee",
  "watchFields": ["percentualFee"],
  "recalculate": "async",
  "default": 0
}
```

Quando `Projeto.percentualFee` muda, o Core encontra os itens dependentes e agenda um recálculo assíncrono. O recálculo usa uma leitura por binding e um `bulkWrite`, em vez de executar `save()` item a item na requisição do usuário.

### Agregação de relacionamento

```json
{
  "field": "pagamentoTotalPlanejado",
  "kind": "aggregate",
  "sourceModel": "Pagamento",
  "foreignField": "projetoItemId",
  "operator": "sum",
  "sourceField": "valor",
  "match": {
    "canceladoNaCentral": { "neq": true }
  },
  "default": 0
}
```

Operadores disponíveis:

- `sum`;
- `count`;
- `min`;
- `max`.

Filtros aceitam igualdade direta ou `{ "eq": ... }`, `{ "neq": ... }`, `{ "in": [...] }` e `{ "nin": [...] }`.

### Expressão derivada

```json
{
  "field": "pagamentoValorPendente",
  "kind": "expression",
  "precision": 2,
  "expression": {
    "op": "max",
    "args": [
      { "value": 0 },
      {
        "op": "subtract",
        "args": [
          { "field": "contratacaoTotal" },
          { "field": "pagamentoTotalPago" }
        ]
      }
    ]
  }
}
```

Bindings são avaliados na ordem declarada. Assim, uma expressão pode consumir lookups e agregações anteriores.

Além dos operadores numéricos e lógicos do domínio, processos podem usar:

- `if`: condição, valor verdadeiro e valor falso;
- `concat`: concatenação segura de valores;
- `formatCurrency`: valor, moeda opcional e locale opcional.

## Recálculo imediato e assíncrono

`recalculate` controla a reação quando a model de origem muda:

- `immediate` (padrão): dependentes são atualizados no mesmo ciclo da mutação;
- `async`: a resposta não percorre todos os dependentes; o Core coloca o recálculo na fila interna e usa operações em lote.

Use `async` para alterações de um pai com muitos filhos, como a mudança de percentuais de um Projeto. Use `immediate` quando o registro pai precisa refletir a alteração antes da resposta, como o resumo de pagamentos de um item.

A API `drainProcessJobs()` existe para testes e homologações determinísticas.

## Proteção declarativa de exclusão

```json
{
  "deleteProtection": [
    {
      "sourceModel": "Pagamento",
      "foreignField": "projetoItemId",
      "message": "Não é possível excluir o item porque existem pagamentos vinculados."
    }
  ]
}
```

A verificação ocorre no CRUD oficial antes de `findByIdAndDelete`. Não é necessário sobrescrever métodos do Mongoose.

## Invariável financeira atômica

```json
{
  "atomicInvariants": [
    {
      "name": "pagamentos-limitados-ao-contratado",
      "kind": "relatedSumLteParentField",
      "parentModel": "ProjetoItem",
      "parentLocalField": "projetoItemId",
      "sourceField": "valor",
      "parentField": "contratacaoTotal",
      "match": {
        "canceladoNaCentral": { "neq": true }
      },
      "tolerance": 0.01,
      "code": "PAGAMENTO_ACIMA_CONTRATADO",
      "message": "A soma {total} não pode ultrapassar o valor contratado {limit}."
    }
  ]
}
```

O Core executa a mutação em transação MongoDB e incrementa uma versão interna no registro pai antes de calcular a soma. Duas inclusões simultâneas disputam a mesma escrita do pai:

1. uma transação conclui;
2. a outra recebe conflito transitório;
3. o Core repete a transação;
4. a soma é refeita já considerando a primeira inclusão;
5. a segunda inclusão é aceita ou rejeitada pela invariável.

Uma simples validação `find + sum + save`, fora de transação, **não** oferece essa garantia.

## Alterações reais

O contexto enviado a `defineValidation` agora inclui `changedFields`. A lista contém somente campos cujo valor final difere do registro anterior, incluindo valores derivados pelo Core. Isso evita efeitos colaterais acionados por round-trips de campos sem alteração real.

## Fronteira recomendada

Pertence ao Core/process manifest:

- transições e bloqueios de etapa;
- status operacionais recorrentes;
- dependências e recálculos cross-model;
- agregações relacionadas;
- proteção de exclusão;
- invariáveis concorrentes;
- processamento em lote/assíncrono.

Permanece na Central:

- fórmula comercial específica;
- tipos de responsáveis permitidos pelo negócio;
- regras fiscais específicas;
- integrações e mapeamentos particulares;
- mensagens e condições próprias do processo.

A Central declara essas particularidades usando o contrato; não reimplementa o mecanismo.

---

<!-- source: CHECKLIST_IMPLEMENTACAO.md -->

# Checklist de Implementação

Use este checklist antes de concluir qualquer tarefa de codificação em uma Central Oon.

## Contexto

- [ ] Rodei `npm run ooncore:docs:check`.
- [ ] Rodei `npm run ooncore:docs` se havia documentação desatualizada.
- [ ] Li `.ooncore/context.generated.md`.
- [ ] Entendi qual recurso do Core já resolve parte da necessidade.

## Backend

- [ ] Usei model, validation, trigger, hook, mapping ou integration quando aplicável.
- [ ] Evitei recriar CRUD.
- [ ] Validei entrada.
- [ ] Validei permissão no backend.
- [ ] Tratei erros.
- [ ] Não hardcodei segredos.
- [ ] Mantive rastreabilidade.

## Frontend

- [ ] Usei `central.ui.json` antes de criar componente customizado.
- [ ] Evitei recriar shell, rotas, menu, datagrid ou form.
- [ ] Usei override apenas quando necessário.
- [ ] Não coloquei regra crítica apenas no frontend.

## Integrações

- [ ] Usei camada de integração/conector.
- [ ] Modelei mapping.
- [ ] Registrei status de integração.
- [ ] Normalizei erros externos.
- [ ] Não expus credenciais.

## Entrega

- [ ] A Central continua atualizável com novas versões do Core.
- [ ] A alteração é pequena, coesa e aderente à arquitetura.
- [ ] O comportamento esperado está documentado no README ou no próprio módulo quando necessário.

---

<!-- source: CODEX.md -->

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

---

<!-- source: COLLECTIONS_AND_PIPELINES.md -->

# Coleções, Documentos e Esteiras

Coleções, documentos e esteiras são a base operacional da Central Oon.

## Coleções

Use coleções para entidades de negócio:

- clientes;
- fornecedores;
- pedidos;
- pagamentos;
- documentos fiscais;
- serviços tomados;
- serviços prestados;
- integrações;
- tickets operacionais.

Cada coleção deve ter:

- model no backend;
- metadata para CRUD;
- campos de status quando participar de esteira;
- validações de negócio;
- configuração de tela no frontend.

## Documentos

Use documentos para entidades que exigem governança documental, aprovação, anexos ou histórico específico.

Exemplos:

- NF;
- contrato;
- proposta;
- comprovante;
- ordem de serviço;
- pedido de compra.

## Esteiras de processo

Use esteiras para fluxos operacionais com etapas claras.

Boas práticas:

- status/etapa deve estar no backend;
- transições devem ser validadas;
- ações devem registrar usuário e data;
- exceções devem ter status próprio;
- cada etapa deve representar uma decisão operacional real.

## Esteiras de integração

Use esteiras de integração para acompanhar comunicação com sistemas externos.

Estados recomendados:

- pendente;
- em processamento;
- enviado;
- concluído;
- falha;
- aguardando retry;
- cancelado.

Integrações não devem ser caixas-pretas. O usuário operacional precisa enxergar o que aconteceu, qual erro ocorreu e qual ação pode ser tomada.

---

<!-- source: CONNECTORS_AND_INTEGRATIONS.md -->

# Conectores e Integrações

Toda integração deve ser modelada como um processo rastreável, não como chamada solta dentro de controller.

## Objetivo

Transformar cada integração em:

```txt
configuração + mapping + execução + status + rastreabilidade
```

## Estrutura recomendada

```txt
backend/src/integrations/
├── <sistema>/
│   ├── client.js
│   ├── mappings/
│   ├── services/
│   └── README.md
```

## Client

O client deve concentrar:

- URL base;
- autenticação;
- headers;
- timeout;
- retry técnico;
- normalização de erro.

Não coloque regra de negócio no client.

## Mapping

Mappings devem transformar dados entre a Central e o sistema externo.

Regras:

- mapping deve ser explícito;
- campos obrigatórios devem ser validados antes do envio;
- resposta externa deve ser normalizada;
- erros devem ser compreensíveis para operação.

## Esteira de integração

Toda integração relevante deve gerar registro operacional com:

- origem;
- destino;
- payload resumido ou referência;
- status;
- tentativas;
- erro normalizado;
- data/hora;
- usuário ou processo responsável.

## Segurança

- Nunca versionar app key, secret, token ou credencial.
- Não logar payloads sensíveis sem necessidade.
- Não expor credenciais no frontend.
- Usar `.env` e configuração de ambiente.

---

<!-- source: DETAIL_MODAL_AND_RELATED_GRIDS.md -->

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

---

<!-- source: DO_AND_DONT.md -->

# Do and Don't

## Faça

- Use o Core antes de criar código novo.
- Modele o domínio com clareza.
- Prefira configuração e metadata.
- Escreva validações explícitas.
- Mantenha regras críticas no backend.
- Use esteiras para processos com status.
- Use conectores para integrações.
- Registre erros de forma operacional.
- Mantenha compatibilidade com atualização dos pacotes.
- Atualize `.ooncore/` com `npm run ooncore:docs`.

## Não faça

- Não recrie CRUD.
- Não recrie autenticação.
- Não duplique RBAC no frontend.
- Não criar um frontend inteiro se um override resolve.
- Não chamar APIs externas direto de qualquer lugar.
- Não hardcode tenant, app, usuário, URL sensível ou segredo.
- Não colocar regra crítica apenas no frontend.
- Não ignorar logs e rastreabilidade.
- Não editar `.ooncore/context.generated.md` manualmente.
- Não depender de documentação externa para codificar a arquitetura.

---

<!-- source: FRONTEND_MANIFEST_REFERENCE.md -->

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

---

<!-- source: FRONTEND_PATTERNS.md -->

# Padrões Frontend

O frontend da Central deve ser declarativo. Shell, providers, rotas, menu, datagrid, formulários, documentos, esteiras, modais de detalhe e grids relacionados pertencem ao `@oondemand/oon-core-front`.

Para a lista completa de opções do manifesto, use `FRONTEND_MANIFEST_REFERENCE.md`.
Para UX avançada com abas e itens relacionados, use também `ADVANCED_UX_PATTERNS.md` e `DETAIL_MODAL_AND_RELATED_GRIDS.md`.

## Estrutura esperada

```txt
frontend/
├── central.ui.json
└── src/
    ├── main.tsx
    ├── collections/
    ├── documents/
    ├── pipelines/
    ├── dashboards/
    └── overrides/
```

## central.ui.json

Use `central.ui.json` como entrada principal para declarar:

- menu;
- coleções;
- campos exibidos;
- filtros;
- ações;
- formulários;
- documentos;
- esteiras;
- dashboards;
- agrupamentos;
- layout v2;
- páginas por blocos;
- renderers por chave;
- modais de detalhe;
- abas;
- relações;
- grids relacionados;
- edição inline;
- ações por linha.

## Manifesto v1 e v2

- Manifesto sem `schemaVersion` mantém compatibilidade v1.
- Manifesto com `schemaVersion: 2` habilita composição por `layout`, `navigation`, `pages`, `blocks`, coleções avançadas e componentes declarativos.
- Componentes React não devem ser serializados no JSON; use chaves e registre os componentes no `registry` em TypeScript.

## Padrão de tela operacional

A tela principal de uma coleção operacional deve ser simples:

```txt
Título
Filtros
Busca
Botão novo
Grid principal
Ações por linha
```

Ela não deve acumular detalhe de filhos, formulários longos ou fluxos complexos abaixo do grid. Use `detailModal` para concentrar a operação do registro.

## Padrão de detalhe avançado

Quando a operação envolve um registro principal e seus relacionamentos, use:

```txt
CoreDetailModal
├── Resumo
├── Dados Principais
├── RelatedGrid editável
└── ReadonlyGrid
```

Exemplos:

- Projeto -> Itens -> Pagamentos
- Pedido -> Produtos -> Entregas
- Contrato -> Parcelas -> Documentos
- Cliente -> Atividades -> Histórico

## Formulários agrupados

Campos longos devem ser agrupados por sentido de negócio:

- Identificação;
- Evento/Faturamento;
- Equipe;
- Regras;
- Totais;
- Observações.

Prefira `form.groups` em vez de criar uma tela customizada apenas para organizar campos.

## Grids relacionados

Quando o usuário precisa operar filhos do registro principal, use `relatedGrid`.

Regras:

- Relação deve usar `foreignKey` + `parentKey`.
- Edição inline deve ser usada para ajustes rápidos de muitos itens.
- Ação por linha deve ser declarada como `rowActions`.
- A regra de negócio da ação fica no backend da Central.
- O Core deve executar e atualizar a interface.

## Regras

- Não recrie layout completo se o Core já renderiza.
- Não duplique chamada REST manual se o SDK do Core já atende.
- Não coloque regra de permissão apenas no frontend.
- Não hardcode endpoints quando a metadata puder fornecer.
- Não crie variações visuais fora do padrão sem necessidade real.
- Use overrides pequenos, específicos e documentados.
- Não crie página React customizada para resolver apenas: filtro, modal, abas, agrupamento de campos, grid relacionado ou ação por linha.

## Overrides

Overrides são permitidos para:

- campo especial;
- ação específica;
- card customizado;
- cabeçalho customizado;
- dashboard customizado;
- integração visual pontual;
- aba customizada dentro de `detailModal`.

Overrides não devem virar uma reimplementação do Core.

## Experiência padrão

A Central deve manter o padrão OonCore:

- navegação consistente;
- datagrids densos;
- formulários claros;
- feedback visual;
- status por badges;
- ações rastreáveis;
- responsividade;
- edição inline quando melhora a produtividade;
- detalhe em modal quando o registro possui relações operacionais.

## Contrato avançado implementado

Para telas mestre-detalhe, declare `detailModal` diretamente na coleção. A aba `form` salva o registro principal, `relatedGrid` busca filhos por `foreignKey=parent[parentKey]` e permite edição inline quando `editable: true` e `editMode: "inline"`, e `readonlyGrid` lista relações sem edição. Use `refresh` nas ações para coordenar recarga de `self`, `parent`, `all` ou abas específicas.

---

<!-- source: OONCORE_ARCHITECTURE.md -->

# Arquitetura OonCore

O OonCore é a base para criar Centrais operacionais sob demanda com arquitetura padronizada, segura e evolutiva.

A Central gerada não deve nascer como um sistema completo do zero. Ela deve nascer como uma camada de domínio que consome os recursos do Core.

## Separação de responsabilidades

```txt
Central
├── backend/   domínio, regras, validações, integrações e esteiras
└── frontend/  declaração de telas, coleções, documentos e overrides

OonCore Back
├── boot Express
├── Mongo/Mongoose
├── autenticação
├── RBAC
├── CRUD metadata-driven
├── auditoria
├── triggers/hooks
└── APIs padrão

OonCore Front
├── shell React
├── providers
├── roteamento
├── menu
├── datagrid
├── formulários
├── documentos
├── esteiras
└── SDK REST
```

## Modelo mini-monolítico

Cada Central começa como um mini-monolito de negócio: pequeno, coeso, isolado e capaz de entregar valor rapidamente. Quando uma parte do domínio se tornar reutilizável, crítica ou independente, ela pode evoluir para conector, serviço compartilhado ou micro-serviço.

## Fonte de verdade

- Dados e regras ficam no backend.
- Metadata operacional é exposta pelo backend.
- Frontend renderiza a experiência a partir da metadata.
- Permissões são decididas no backend.
- Integrações são tratadas como conectores, mappings, triggers e esteiras de integração.

## Objetivo do Codex

O Codex deve acelerar a construção da Central usando a arquitetura existente. O objetivo não é gerar um app genérico, mas sim completar a camada de domínio com segurança e aderência ao Core.

---

<!-- source: PORTAL_COCKPIT_PATTERNS.md -->

# Portal/Cockpit com OonCore

Este padrão atende aplicações como **Meus Apps**, Portal do Cliente, Portal de Parceiros, Suporte, Copilotos e outros Cockpits first-party.

O objetivo é evitar que um portal precise recriar Shell, Router, AuthProvider, Menu, Guards e SDK HTTP. O portal deve usar o `central.ui.json` + `startFromManifest` e registrar apenas os componentes realmente customizados.

## Perfis arquiteturais

O OonCore diferencia três perfis:

| Perfil | Uso |
| --- | --- |
| `root-central` | Central de Ativações, raiz de confiança. |
| `member-central` | Central cliente/licenciada, ativada por instância. |
| `portal-cockpit` | Portal/Cockpit first-party, autenticado por AppClient/BFF. |

## Auth modes

| `auth.mode` | Uso |
| --- | --- |
| `bearer` | Token local simples, compatível com Centrais existentes. |
| `cookie` | Sessão futura via cookie HTTP-only. |
| `external-sso` | Redireciona para login externo. |
| `central-instance` | Central membro usando instância ativada. |
| `central-client` | Portal/Cockpit usando AppClient/BFF. |

## Capabilities no manifesto

Além de `permissions`, o manifesto pode declarar `capabilities`. Elas são permissões dinâmicas vindas da Central de Ativações e evitam criar campos fixos para cada produto.

Exemplos:

```txt
apps:read
users:manage
tickets:read
tickets:assign
copilots:read
copilots:test
billing:read
```

O Core trata `permissions` e `capabilities` como requisitos de UI. A segurança real continua no backend.

## Manifesto recomendado

```json
{
  "schemaVersion": 2,
  "name": "Portal Cliente",
  "slug": "portal-cliente",
  "appKind": "portal-cockpit",
  "auth": {
    "mode": "central-client",
    "tokenParam": "code"
  },
  "layout": {
    "shell": "portal",
    "sidebar": "core",
    "topbar": "none",
    "header": "none",
    "footer": "core"
  },
  "navigation": {
    "mode": "manual",
    "items": [
      { "label": "Meus Apps", "href": "/apps", "capabilities": ["apps:read"], "order": 10 },
      { "label": "Suporte", "href": "/suporte", "capabilities": ["tickets:read"], "order": 20 },
      { "label": "Copilotos", "href": "/copilotos", "capabilities": ["copilots:read"], "order": 30 },
      { "label": "Usuários", "href": "/usuarios", "capabilities": ["users:manage"], "order": 40 }
    ]
  },
  "pages": [
    { "path": "/apps", "label": "Meus Apps", "component": "AppsPortalPage", "capabilities": ["apps:read"] },
    { "path": "/suporte", "label": "Suporte", "component": "SupportPage", "capabilities": ["tickets:read"] },
    { "path": "/copilotos", "label": "Copilotos", "component": "CopilotsPage", "capabilities": ["copilots:read"] },
    { "path": "/usuarios", "label": "Usuários", "component": "UsersPermissionsPage", "capabilities": ["users:manage"] }
  ],
  "collections": [],
  "pipelines": [],
  "documents": []
}
```

## Bootstrap recomendado

```ts
import { startFromManifest } from "@oondemand/oon-core-front";
import manifest from "../central.ui.json";
import { AppsPortalPage } from "./custom/AppsPortalPage";
import { SupportPage } from "./custom/SupportPage";
import { CopilotsPage } from "./custom/CopilotsPage";
import { UsersPermissionsPage } from "./custom/UsersPermissionsPage";

startFromManifest(manifest, {
  apiBaseUrl: import.meta.env.VITE_API_URL,
  appKind: "portal-cockpit",
  auth: {
    mode: "central-client"
  },
  customComponents: {
    AppsPortalPage,
    SupportPage,
    CopilotsPage,
    UsersPermissionsPage
  }
});
```

## Contrato esperado do BFF

O frontend conversa apenas com o BFF do portal. O BFF fala com a Central de Ativações usando AppClient.

Rotas genéricas esperadas no BFF podem espelhar a Central de Ativações:

```http
GET /api/portal/contexto
GET /api/portal/apps
GET /api/portal/apps/:appCode
GET /api/portal/apps/:appCode/capabilities
POST /api/portal/apps/:appCode/authorize
```

O BFF também pode expor rotas de domínio próprias, como:

```http
GET /api/suporte/tickets
POST /api/suporte/tickets
GET /api/copilotos/assistentes
POST /api/copilotos/assistentes/:id/testar
```

Essas rotas de domínio validam capability na Central de Ativações antes de executar a ação.

## Regra de segurança

O frontend nunca deve receber `clientSecret`, `x-oon-instance-token`, hash de credencial ou segredo completo. Portais devem falar com um BFF próprio, e o BFF fala com a Central de Ativações usando AppClient.

## Quando usar página custom

Use página custom apenas quando a tela não for CRUD/esteira/documento declarativo, por exemplo:

- cards de apps licenciados;
- matriz de permissões;
- cockpit de status;
- tickets de suporte;
- gestão de copilotos;
- onboarding orientado por negócio.

Mesmo nesses casos, o Shell, Router, Auth, Menu, Guards e SDK HTTP devem continuar no Core.

---

<!-- source: RBAC_SECURITY.md -->

# RBAC e Segurança

A segurança da Central deve ser aplicada no backend. O frontend pode ocultar ou exibir ações, mas não é a fonte de decisão.

## Regras obrigatórias

- Toda operação sensível deve validar usuário autenticado.
- Toda alteração de dados deve validar permissão.
- Toda ação de integração deve validar permissão e contexto.
- Nunca confiar em `tenantId`, `appId`, `perfil` ou `roles` enviados livremente pelo frontend.
- Segredos devem vir de variáveis de ambiente ou vault equivalente.
- Logs não devem expor tokens, senhas, app keys ou dados sensíveis desnecessários.

## RBAC

Use o RBAC do Core para:

- controlar acesso por app;
- controlar perfis;
- controlar ações;
- filtrar funcionalidades;
- proteger rotas;
- permitir evolução de permissões sem reconstruir telas.

## Checklist de segurança para Codex

Antes de concluir uma alteração, confirme:

- Existe validação de entrada?
- Existe validação de permissão no backend?
- Existe tratamento de erro?
- A operação gera rastreabilidade?
- Algum segredo foi colocado no código?
- Algum dado sensível foi exposto no frontend?
- O comportamento funciona para múltiplos usuários e múltiplos apps?

---

<!-- source: REACTIVE_DOMAIN_FORMULAS.md -->

# Fórmulas reativas nos formulários OonCore

A partir do contrato declarativo de domínio, campos com `computed` são recalculados imediatamente nos formulários padrão do `@oondemand/oon-core-front`.

A Central não precisa repetir a fórmula em `central.ui.json` nem criar componentes React específicos. A declaração continua existindo uma única vez no `central.domain.json` do backend.

## Fluxo

1. O backend carrega e valida o `central.domain.json`.
2. A metadata da model expõe `readonly` e `computed`.
3. O frontend interpreta a mesma AST fechada para apresentar uma prévia imediata.
4. Campos calculados e readonly são removidos do payload enviado pelo formulário.
5. O backend recalcula novamente, executa as validações e persiste o valor autoritativo.
6. Depois da resposta, o formulário passa a exibir o registro devolvido pelo servidor.

> O cálculo no navegador melhora a experiência do usuário. Ele nunca substitui o cálculo, a proteção readonly ou a validação do backend.

## Formulários atendidos

- formulário dinâmico de coleções (`DynamicForm`);
- formulário principal em modal com abas (`CoreTabbedDetail`);
- criação e edição;
- formulários derivados integralmente da metadata;
- formulários com overrides de apresentação no `central.ui.json`, desde que a model continue sendo carregada pela metadata do Core.

## Exemplo

A declaração permanece somente no domínio:

```json
{
  "subtotal": {
    "kind": "currency",
    "computed": {
      "precision": 2,
      "expression": {
        "op": "multiply",
        "args": [
          { "field": "quantidade" },
          { "field": "diarias" },
          { "field": "valorUnitario" }
        ]
      }
    }
  }
}
```

Ao alterar quantidade, diárias ou valor unitário, o campo subtotal é atualizado na tela. Ao salvar, subtotal não é enviado pelo cliente: o backend calcula novamente e devolve o valor persistido.

## Paridade da AST

O frontend suporta o mesmo vocabulário do backend:

- aritméticos: `add`, `subtract`, `multiply`, `divide`, `min`, `max`, `abs`, `negate`, `coalesce`;
- comparação: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`;
- lógicos e presença: `and`, `or`, `not`, `present`, `in`;
- nós de valor: `{ "value": ... }`;
- referências: `{ "field": "nomeDoCampo" }`.

Os testes de caracterização usam cadeias financeiras equivalentes às do backend para reduzir o risco de divergência sem permitir execução de JavaScript arbitrário no navegador.

## Tratamento de erros

Erros de prévia, como divisão por zero ou valor não numérico, aparecem associados ao campo calculado. O usuário pode corrigir as entradas imediatamente.

A decisão final continua no backend, que retorna `DomainRuleError` com status 422 quando a mutação viola o contrato.

## Extensões locais

Não crie funções de cálculo em componentes da Central para campos já descritos por `computed`.

Use código local apenas quando a regra:

- não puder ser representada pela AST;
- depender de consulta externa;
- exigir agregação de registros relacionados;
- ainda não possuir contrato declarativo no OonCore.

Nesses casos, mantenha o backend como fonte de verdade e registre a lacuna para evolução do Core.

---

<!-- source: releases/0.3.41.md -->

# OonCore 0.3.41 — Manifesto declarativo de domínio

Versão destinada à homologação do primeiro contrato declarativo completo de domínio no backend.

## Recursos incluídos

- carregamento automático de `central.domain.json`;
- declaração versionada de models e campos;
- validação estrutural agregada;
- fórmulas declarativas sem execução de JavaScript arbitrário;
- campos calculados no servidor;
- ordenação de dependências e detecção de ciclos;
- proteção de campos `readonly` em criação, atualização e importação;
- validações declarativas entre campos;
- atualização parcial com consolidação e recálculo;
- compatibilidade com `defineValidation` durante a migração gradual.

## Objetivo da homologação

Validar o contrato em uma Central de teste antes da conversão dos models e regras da SS-Eventos.

A homologação deve confirmar:

1. criação e carregamento do manifesto;
2. geração de metadata e CRUD;
3. recálculo de campos em `POST`, `PUT` e `PATCH`;
4. rejeição de adulteração em campos controlados pelo servidor;
5. mensagens de validação associadas ao campo correto;
6. compatibilidade com models e validações JavaScript ainda não migrados.

## Fora do escopo

- fórmulas reativas no frontend;
- índices compostos;
- triggers e transições declarativas;
- engine genérica de integrações;
- migração da SS-Eventos.
