// Simulacro de la sincronización del repertorio de piano, desde la terminal.
//
//   node scripts/sync-repertorio.mjs            → resumen
//   node scripts/sync-repertorio.mjs --json     → además guarda el plan en repertorio-plan.json
//
// Solo LEE (el Sheet publicado y la colección `recursos`, que es de lectura
// pública). La escritura real se hace desde el Manager con el botón
// "Sincronizar repertorio", que exige sesión de admin y usa este mismo plan.
import { writeFileSync } from "node:fs";
import { SHEET_REPERTORIO_PIANO, planificarSync, resumenPlan } from "../js/repertorio.js";

const PROYECTO = "biblioteca-guitarra-fa182";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)/documents/recursos`;

// Valor REST de Firestore → JS plano.
function valor(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(valor);
  if ("mapValue" in v) return campos(v.mapValue.fields || {});
  return undefined;
}
const campos = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, valor(v)]));

async function leerRecursos() {
  const todos = [];
  let token = "";
  do {
    const res = await fetch(`${BASE}?pageSize=300${token ? `&pageToken=${token}` : ""}`);
    if (!res.ok) throw new Error(`Firestore ${res.status}: ${await res.text()}`);
    const json = await res.json();
    for (const d of json.documents || []) {
      todos.push({ id: d.name.split("/").pop(), ...campos(d.fields || {}) });
    }
    token = json.nextPageToken || "";
  } while (token);
  return todos;
}

const res = await fetch(SHEET_REPERTORIO_PIANO);
if (!res.ok) throw new Error(`No se pudo leer el Sheet (${res.status})`);
const tsv = await res.text();
const recursos = await leerRecursos();
console.log(`Recursos actuales en Firestore: ${recursos.length}\n`);

const plan = planificarSync(tsv, recursos);
console.log(resumenPlan(plan));

if (process.argv.includes("--json")) {
  writeFileSync("repertorio-plan.json", JSON.stringify(plan, null, 2));
  console.log("\nPlan guardado en repertorio-plan.json");
}
