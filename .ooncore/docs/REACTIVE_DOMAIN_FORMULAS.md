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
