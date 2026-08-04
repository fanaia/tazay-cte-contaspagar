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
