"use strict";

module.exports = {
  ...require("./configuration"),
  ...require("./constants"),
  ...require("./date"),
  ...require("./documentosFiscaisOperacionais"),
  ...require("./normalization"),
  ...require("./omieOperations"),
  ...require("./omieRequest"),
  ...require("./manualActions"),
  ...require("./conclusaoRecebimento"),
  ...require("./payload"),
  ...require("./paymentWorkflow"),
  ...require("./reconciliation"),
  ...require("./resetDatabase"),
  ...require("./sidecar"),
  ...require("./utils"),
  ...require("./webhooks"),
  // As guardas ficam por último para substituir apenas os pontos de entrada
  // que não podem voltar a gerar pagamentos após uma aprovação manual.
  ...require("./manualReconciliationGuard"),
};
