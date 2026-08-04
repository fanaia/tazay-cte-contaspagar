"use strict";

function arredondarMoeda(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function primeiroValor(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = { arredondarMoeda, array, primeiroValor };
