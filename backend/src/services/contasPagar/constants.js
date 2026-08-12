"use strict";

const TAZAY_PERMISSIONS = Object.freeze({
  OPERATION_READ: "tazay.operation.read",
  APPROVAL_EXECUTE: "tazay.approval.execute",
  FINANCE_READ: "tazay.finance.read",
  FINANCE_EXECUTE: "tazay.finance.execute",
  CONFIGURATION_MANAGE: "tazay.configuration.manage",
  DATA_WRITE: "tazay.data.write",
});

module.exports = {
  DEFAULT_TIME_ZONE: "America/Sao_Paulo",
  ETAPA_CONCLUIDO: "Concluído",
  ETAPA_FATURADO: "Faturado pelo fornecedor",
  ETAPA_PAGO: "Pago",
  STATUS_ATIVOS: [
    "Pendente envio",
    "Pendente sincronização",
    "Aberta",
    "Pagamento cancelado",
    "Erro",
  ],
  TAZAY_PERMISSIONS,
};
