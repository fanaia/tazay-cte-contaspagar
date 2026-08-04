"use strict";

const { DEFAULT_TIME_ZONE } = require("./constants");

function partesDaData(date, timeZone = DEFAULT_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

function formatarIsoDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function calcularProximaQuarta(input = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) throw new TypeError("Data inválida para cálculo do vencimento.");
  const { year, month, day } = partesDaData(date, timeZone);
  const localDate = new Date(Date.UTC(year, month - 1, day));
  let daysToWednesday = (3 - localDate.getUTCDay() + 7) % 7;
  if (daysToWednesday === 0) daysToWednesday = 7;
  localDate.setUTCDate(localDate.getUTCDate() + daysToWednesday);
  return formatarIsoDate(localDate);
}

function formatarDataOmie(isoDate) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new TypeError(`Data ISO inválida: ${isoDate}`);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

module.exports = { calcularProximaQuarta, formatarDataOmie };
