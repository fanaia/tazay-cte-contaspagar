"use strict";

const crypto = require("node:crypto");
const { GenericError } = require("@oondemand/oon-core-back");
const { core, models } = require("./runtime");

const DEFAULT_MIN_INTERVAL_MS = 5000;
const DEFAULT_LOCK_MS = 30000;
const MAX_LOCK_WAIT_MS = 20000;

function limparValor(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  if (Array.isArray(value)) {
    const items = value.map(limparValor).filter((item) => item !== undefined);
    return items.length ? items : undefined;
  }
  if (typeof value === "object" && !(value instanceof Date)) {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, limparValor(item)])
      .filter(([, item]) => item !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return value;
}

function normalizarParametrosOmie(param) {
  const input = Array.isArray(param) ? param : [param];
  const normalized = limparValor(input);
  if (!Array.isArray(normalized) || !normalized.length) {
    throw new GenericError("A chamada Omie foi bloqueada porque não possui parâmetros.", {
      statusCode: 422,
      retryable: false,
      details: { field: "param", message: "Informe ao menos um parâmetro válido." },
    });
  }
  for (const item of normalized) {
    if (!item || typeof item !== "object" || Array.isArray(item) || !Object.keys(item).length) {
      throw new GenericError("A chamada Omie foi bloqueada porque contém parâmetros vazios.", {
        statusCode: 422,
        retryable: false,
        details: { field: "param", message: "Objetos vazios não são enviados ao Omie." },
      });
    }
  }
  return normalized;
}

function extrairCooldownSegundos(error) {
  const text = [error?.message, error?.response?.data?.faultstring, error?.response?.data?.message]
    .filter(Boolean)
    .join(" ");
  const match = text.match(/(?:tente novamente em|aguarde)\s+(\d+)\s*segundos?/i);
  return match ? Math.max(1, Number(match[1])) : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throttleCollection() {
  const { Compra } = models();
  return Compra.db.collection("tazay_omie_request_throttle");
}

function minIntervalMs() {
  return Math.max(1000, Number(process.env.OON_OMIE_MIN_INTERVAL_MS || DEFAULT_MIN_INTERVAL_MS));
}

async function initializeThrottle(instanceId) {
  const collection = throttleCollection();
  const epoch = new Date(0);
  await collection.updateOne(
    { _id: String(instanceId || "default") },
    {
      $setOnInsert: {
        lockedUntil: epoch,
        nextAllowedAt: epoch,
        cooldownUntil: epoch,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
  return collection;
}

async function acquireThrottle(instanceId) {
  const key = String(instanceId || "default");
  const collection = await initializeThrottle(key);
  const token = crypto.randomUUID();
  const deadline = Date.now() + MAX_LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    const now = new Date();
    const state = await collection.findOne({ _id: key });
    if (state?.cooldownUntil && new Date(state.cooldownUntil) > now) {
      const seconds = Math.max(1, Math.ceil((new Date(state.cooldownUntil).getTime() - now.getTime()) / 1000));
      throw new GenericError(`A instância Omie está em pausa preventiva por mais ${seconds} segundos. Nenhuma requisição foi enviada.`, {
        statusCode: 429,
        code: "OMIE_COOLDOWN_ACTIVE",
        retryable: false,
      });
    }

    const acquired = await collection.findOneAndUpdate(
      {
        _id: key,
        lockedUntil: { $lte: now },
        nextAllowedAt: { $lte: now },
        cooldownUntil: { $lte: now },
      },
      {
        $set: {
          lockedBy: token,
          lockedUntil: new Date(now.getTime() + DEFAULT_LOCK_MS),
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    const acquiredDocument = acquired?.value === undefined ? acquired : acquired.value;
    if (acquiredDocument?.lockedBy === token) return { collection, key, token };

    const nextState = await collection.findOne({ _id: key });
    const waitUntil = Math.max(
      Number(new Date(nextState?.lockedUntil || 0)),
      Number(new Date(nextState?.nextAllowedAt || 0)),
    );
    await sleep(Math.min(1000, Math.max(100, waitUntil - Date.now())));
  }

  throw new GenericError("A chamada Omie foi bloqueada porque já existe outra operação em andamento para esta instância.", {
    statusCode: 409,
    code: "OMIE_REQUEST_IN_PROGRESS",
    retryable: false,
  });
}

async function releaseThrottle(lock, options = {}) {
  const now = new Date();
  const cooldownSeconds = Math.max(0, Number(options.cooldownSeconds || 0));
  const nextAllowedAt = new Date(now.getTime() + minIntervalMs());
  const cooldownUntil = cooldownSeconds
    ? new Date(now.getTime() + cooldownSeconds * 1000)
    : new Date(0);
  await lock.collection.updateOne(
    { _id: lock.key, lockedBy: lock.token },
    {
      $set: {
        lockedUntil: now,
        lockedBy: "",
        lastRequestAt: now,
        nextAllowedAt,
        cooldownUntil,
        updatedAt: now,
      },
    },
  );
}

async function executarChamadaOmie(call, instanceId, param, context = {}) {
  const callKey = String(call || "").trim();
  if (!callKey) {
    throw new GenericError("A chamada Omie foi bloqueada porque o método não foi informado.", {
      statusCode: 422,
      retryable: false,
    });
  }
  const normalizedParam = normalizarParametrosOmie(param);
  const { omie } = core();
  if (!omie?.call) {
    throw new GenericError("O runtime Omie não disponibiliza execução de chamadas declaradas.", {
      statusCode: 500,
      retryable: false,
    });
  }

  const lock = await acquireThrottle(instanceId);
  try {
    const result = await omie.call({
      callKey,
      instanceId,
      payload: { param: normalizedParam },
    }, { context, maxAttempts: 1 });
    await releaseThrottle(lock);
    return result;
  } catch (error) {
    const cooldownSeconds = extrairCooldownSegundos(error);
    try {
      await releaseThrottle(lock, { cooldownSeconds });
    } catch (releaseError) {
      error.throttleReleaseError = String(releaseError?.message || releaseError);
    }
    error.retryable = false;
    throw error;
  }
}

module.exports = {
  executarChamadaOmie,
  extrairCooldownSegundos,
  normalizarParametrosOmie,
};
