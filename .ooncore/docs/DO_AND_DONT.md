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
