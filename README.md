# Tazay Cte Contaspagar

Central Oon declarativa gerada com `create-central-oon`.

## Objetivo funcional

A Central consulta o serviço de **Recebimento de Nota Fiscal** do Omie e sincroniza somente os documentos fiscais que estejam na etapa **Faturado pelo Fornecedor** e com status **Pendente**.

A lista operacional contempla:

- **NF-e**, identificada pelo modelo fiscal `55`;
- **CT-e**, identificado pelo modelo fiscal `57`;
- documentos retornados por `ListarRecebimentos` com a etapa Omie `50`;
- apenas documentos ainda não recebidos, cancelados, devolvidos ou denegados.

Cada documento é identificado pelo `nIdReceb`, independentemente de possuir um Pedido de Compra relacionado. Quando os itens do recebimento trazem `nIdPedido`, esse vínculo também é armazenado para rastreabilidade.

A Central calcula a próxima quarta-feira estrita e gera contas a pagar agrupadas por fornecedor e vencimento.

- documentos incluídos na quarta-feira vencem na quarta-feira da semana seguinte;
- novos documentos atualizam a conta aberta do mesmo fornecedor/vencimento;
- o primeiro envio utiliza `IncluirContaPagar` e as revisões utilizam `AlterarContaPagar`;
- a conclusão do ticket de envio atualiza a conta local para **Enviado** e **Pagamento pendente**;
- a consulta de pagamento utiliza `ConsultarContaPagar` e gera um ticket rastreável;
- título pago muda temporariamente os documentos vinculados para a etapa **Pago** e gera um ticket por documento para concluir o recebimento fiscal no Omie;
- o ticket usa o próprio `nIdReceb` e a chave fiscal sincronizados para executar `ConcluirRecebimento`;
- após a confirmação do Omie, o documento muda para **Concluído** na Central;
- baixa cancelada devolve os documentos para `Faturado pelo fornecedor`;
- exclusão do título cria uma nova geração e um novo código de integração;
- a fila de integração e a caixa de webhooks são processadas automaticamente, sem depender do botão **Processar pendências**.

A observação enviada ao Omie identifica o tipo, número e valor de cada documento:

```text
Contas a Pagar gerada pela Central Oon referente aos documentos fiscais:
NF-e 000173516 - R$ 949,10
CT-e 000009001 - R$ 431,40
```

## Parametrização

Em **Configurações > Parâmetros da operação**, configure:

- **Aprovar documento automático**: aprova o documento assim que ele entra em `Faturado pelo fornecedor`;
- **Enviar conta a pagar para o Omie automático**: cria ou atualiza o título no Omie após a geração/revisão do agrupamento;
- **Categoria padrão**;
- **Conta corrente padrão**.

A origem da sincronização não é selecionável: ela fica fixada em **NF-es e CT-es / Faturado pelo Fornecedor / Pendente**. As categorias e contas correntes são carregadas pelas listas Omie **Categorias financeiras** e **Contas correntes**.

### Operação manual

Quando a aprovação automática estiver desativada:

1. abra **Dados e parâmetros** no documento fiscal;
2. opcionalmente selecione categoria ou conta corrente diferentes dos padrões;
3. execute **Aprovar documento**.

A aprovação gera ou atualiza a conta a pagar agrupada localmente.

Quando o envio automático estiver desativado:

1. abra **Dados e parâmetros** na conta agrupada;
2. opcionalmente selecione outra categoria ou conta corrente;
3. execute **Enviar para o Omie**.

No primeiro envio, a ação utiliza `IncluirContaPagar`. Nas revisões seguintes, utiliza `AlterarContaPagar`, preservando o `codigo_lancamento_integracao` e enviando também o `codigo_lancamento_omie` quando já estiver disponível.

Para atualizar o pagamento, execute **Consultar pagamento no Omie**. A ação gera um ticket e, ao concluir, atualiza separadamente as tags **Envio para o Omie** e **Pagamento no Omie**. Quando o título estiver pago, os tickets de conclusão dos recebimentos são gerados e processados automaticamente.

## Sincronização no Omie

A lista **NF-es e CT-es pendentes** executa:

- endpoint `produtos/recebimentonfe/`;
- método `ListarRecebimentos`;
- `cEtapa: "50"`;
- `cExibirDetalhes: "S"`;
- paginação por `recebimentos` e `nTotalPaginas`.

Além do filtro enviado ao Omie, a normalização valida novamente a etapa e os indicadores de status antes de criar ou atualizar o documento local. Isso evita incorporar recebimentos já concluídos ou documentos fora do recorte operacional.

A lista usa o modo `import`: sincroniza os documentos retornados sem inativar automaticamente registros ausentes. A transição posterior de cada documento é controlada pelo fluxo financeiro e pelo ticket de conclusão.

## Conclusão do recebimento no Omie

O comando visual **Concluir**, exibido no recebimento da NF-e/CT-e, pertence ao serviço **Recebimento de Nota Fiscal**. A Central usa os métodos `ListarRecebimentos` e `ConcluirRecebimento` desse serviço.

Como o documento já foi sincronizado pelo `nIdReceb`, a conclusão utiliza prioritariamente esse identificador. O vínculo pelo `nIdPedido` permanece como apoio para documentos legados e rastreabilidade. A Central registra o ID do recebimento, a chave fiscal, o status da conclusão e o horário da confirmação para manter idempotência.

Esta operação é diferente do comando **Encerrar** de um Pedido de Compra.

## Processamento automático de integrações

O arquivo `backend/src/hooks/integrationAutoProcessor.js` executa continuamente o `drainOnce` do Integration Engine. Por padrão, a Central verifica a fila e os webhooks a cada 3 segundos.

Parâmetros opcionais:

- `OON_INTEGRATION_AUTO_PROCESS=false` — desativa o processamento embutido;
- `OON_INTEGRATION_AUTO_INTERVAL_MS` — intervalo em milissegundos;
- `OON_INTEGRATION_AUTO_BATCH_SIZE` — quantidade máxima de tickets por ciclo;
- `OON_INTEGRATION_AUTO_WEBHOOK_BATCH_SIZE` — quantidade máxima de webhooks por ciclo.

O botão **Processar pendências** permanece apenas como ação administrativa e não é necessário para o fluxo normal.

## Operação inicial

1. Ative `Integrações > Omie`, informe as credenciais e teste a conexão.
2. Sincronize as listas **Categorias financeiras** e **Contas correntes**.
3. Crie ou edite o registro em **Configurações > Parâmetros da operação**.
4. Execute a sincronização da lista **NF-es e CT-es pendentes**.
5. Execute `POST /api/tazay/contas-pagar/reconciliar` com perfil `admin` ou `desenvolvedor`, caso deseje reconciliar manualmente registros já importados.

O webhook público é gerenciado pelo OonCore em `/integrations/webhooks/omie/{token}`. O processamento da outbox e da inbox é iniciado automaticamente com a Central.

## Endpoints funcionais

- `POST /api/tazay/contas-pagar/reconciliar` — processa os documentos pendentes respeitando a parametrização;
- `POST /api/tazay/contas-pagar/compras/:id/aprovar` — aprova manualmente e gera/revisa o agrupamento;
- `POST /api/tazay/contas-pagar/contas/:id/enviar` — envia manualmente a conta agrupada ao Omie;
- `POST /api/tazay/contas-pagar/contas/:id/consultar-pagamento` — gera um ticket para consultar o título no Omie e atualizar o pagamento;
- `POST /api/tazay/contas-pagar/configuracao/inicializar` — cria a configuração padrão quando ainda não existir.

## Fronteira arquitetural

- `central.app.json` declara identidade, `appKind`, módulos, capabilities e compatibilidade com o OonCore;
- os models em `backend/src/models` declaram somente o domínio da Central;
- `backend/src/mappings/omie.js` declara chamadas, listas, webhooks e handlers funcionais;
- `backend/src/services/contasPagar` concentra as regras de normalização, aprovação, agrupamento, reconciliação e envio;
- `backend/src/hooks/integrationAutoProcessor.js` inicia o consumo automático da fila e dos webhooks;
- `frontend/central.ui.json` declara as telas operacionais e as ações manuais;
- autenticação, shell, roteamento, RBAC, metadata, CRUD, filas, retry, idempotência e infraestrutura pertencem ao OonCore.

## Documentação e conformidade

```bash
npm run ooncore:docs        # sincroniza .ooncore/
npm run ooncore:docs:check  # valida versão/hash do cache local
npm run ooncore:conformance # valida a fronteira da Central
npm run test                # testes de regra de negócio
npm run check               # executa todos os gates locais
```

## Rodando

```bash
npm install
npm run check

cd backend && cp .env.example .env && npm install && npm run dev
cd ../frontend && cp .env.example .env && npm install && npm run dev
```

Em desenvolvimento, configure o mesmo valor em `DEV_TOKEN` no backend e `VITE_DEV_TOKEN` no frontend. A validação do token local é fornecida pelo Core; não implemente `auth.verifyToken` na Central.
