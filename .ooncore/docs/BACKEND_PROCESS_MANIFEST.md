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