# Operação das contas a pagar agrupadas

## Agrupamento

A Central mantém uma conta a pagar ativa por instância Omie e fornecedor. NF-es e CT-es aprovadas do mesmo fornecedor são relacionadas à mesma conta, e o valor total e a quantidade de documentos são recalculados automaticamente.

O vencimento do agrupamento corresponde ao maior vencimento calculado entre os documentos relacionados.

## Aprovação

A ação **Aprovar e gerar contas-pagar** aprova o documento e o relaciona à conta ativa do fornecedor. Ao excluir uma conta local elegível, os documentos retornam para **Faturado pelo fornecedor**, com aprovação **Pendente** e sem vínculo com conta a pagar.

## Exclusão

Uma conta que já tenha sido enviada ou processada pelo Omie não pode ser excluída diretamente na Central. O título deve ser excluído primeiro no Omie. Após o webhook `Financas.ContaPagar.Excluido`, a conta fica marcada como excluída e pode ser removida localmente.

A exclusão confirmada não recria automaticamente outra conta.

## Parâmetros financeiros

Categoria e conta corrente podem ser alteradas ou removidas. Campos de referência vazios são persistidos como `null`, e os códigos e nomes derivados são removidos para evitar reutilização de parâmetros antigos em novos envios.

## Rastreabilidade

O detalhe da conta possui a aba **NF-es e CT-es relacionadas**, com os documentos fiscais vinculados ao agrupamento.