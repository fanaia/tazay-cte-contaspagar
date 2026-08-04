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
