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
