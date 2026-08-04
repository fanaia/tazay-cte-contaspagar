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
