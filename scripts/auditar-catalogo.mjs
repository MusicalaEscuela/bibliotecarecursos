import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { diagnosticar, normalizar } from "../js/catalogo.js";

const base = "https://firestore.googleapis.com/v1/projects/biblioteca-guitarra-fa182/databases/(default)/documents/";
const salida = resolve(process.argv[2] || "output/auditoria-biblioteca");
function valor(v) {
  if (v.arrayValue) return (v.arrayValue.values || []).map(valor);
  if (v.mapValue) return campos(v.mapValue.fields || {});
  if ("integerValue" in v) return Number(v.integerValue);
  return Object.values(v)[0];
}
const campos = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, valor(v)]));
const documentos = [];
let token = "";
do {
  const res = await fetch(`${base}recursos?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`);
  if (!res.ok) throw new Error(`Lectura fallida: ${res.status}`);
  const pagina = await res.json();
  documentos.push(...(pagina.documents || []));
  token = pagina.nextPageToken || "";
} while (token);
const recursos = documentos.map(d => ({ id: d.name.split("/").pop(), ...campos(d.fields || {}) }));
const plan = recursos.map(r => ({ id: r.id, titulo: r.titulo, especialidad: r.especialidad, nivelActual: r.nivel, ...diagnosticar(r) }));
const grupos = new Map();
for (const r of recursos) {
  const clave = `${r.especialidad}|${normalizar(r.titulo).replace(/[^a-z0-9]+/g, " ").trim()}`;
  if (!grupos.has(clave)) grupos.set(clave, []);
  grupos.get(clave).push(r.id);
}
const repetidos = [...grupos].filter(([, ids]) => ids.length > 1).map(([clave, ids]) => ({ clave, ids }));
const resumen = { fecha: new Date().toISOString(), total: recursos.length, incidencias: {}, posiblesRepetidosMismaEspecialidad: repetidos.length, nivelesSugeridos: plan.filter(r => r.nivelSugerido).length };
for (const r of plan) for (const i of r.incidencias) resumen.incidencias[i] = (resumen.incidencias[i] || 0) + 1;
await mkdir(salida, { recursive: true });
for (const [nombre, datos] of Object.entries({ "respaldo-firestore": documentos, recursos, plan, resumen, "posibles-repetidos": repetidos })) {
  await writeFile(resolve(salida, `${nombre}.json`), JSON.stringify(datos, null, 2));
}
const csv = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
await writeFile(resolve(salida, "revision.csv"), '\uFEFF' + [
  ["ID", "Título", "Especialidad", "Nivel actual", "Nivel sugerido (sin validar)", "Objetivos sugeridos", "Incidencias"],
  ...plan.map(r => [r.id, r.titulo, r.especialidad, r.nivelActual, r.nivelSugerido, r.objetivosSugeridos.join(", "), r.incidencias.join(", ")]),
].map(f => f.map(csv).join(";")).join("\r\n"));
console.log(JSON.stringify(resumen, null, 2));
console.log(`Respaldo y revisión: ${salida}`);
