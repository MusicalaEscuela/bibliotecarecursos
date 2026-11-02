// Diagnóstico conservador: las sugerencias no sustituyen la revisión del material.
export const normalizar = s => String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
export function diagnosticar(r) {
  const texto = normalizar([r.titulo, r.tema, r.descripcion, ...(r.etiquetas || [])].join(" "));
  const objetivos = [
    ["lectura", /lectura|solfeo|claves musicales/],
    ["ritmo", /ritmo|ritmic|pulso|compas|subdivision/],
    ["acordes", /acorde|triada|armonia/],
    ["escalas", /escala|pentaton/],
    ["arpegios", /arpegio/],
    ["coordinacion", /coordinacion|independencia|manos separadas/],
    ["afinacion", /afinacion|entonacion/],
    ["improvisacion", /improvisa/],
    ["calentamiento", /calentamiento|estiramiento/],
  ].filter(([, re]) => re.test(texto)).map(([objetivo]) => objetivo);
  const incidencias = [];
  if (!/[\p{L}\p{N}]/u.test(r.titulo || "")) incidencias.push("titulo-invalido");
  const filas = r.origenImportacion?.registros || [];
  if (filas.length && r.cancion?.nivel === 0 && filas.every(f => {
    const entrada = Object.entries(f.campos || {}).find(([k]) => normalizar(k).trim() === "nivel");
    return !entrada || String(entrada[1] ?? "").trim() === "";
  })) incidencias.push("nivel-sin-evidencia-en-origen");
  if (!r.descripcion?.trim()) incidencias.push("sin-descripcion");
  if (!r.categoria?.trim()) incidencias.push("sin-categoria");
  if (!r.nivel || r.nivel === "todos") incidencias.push("revisar-nivel");
  const enlaces = (r.enlaces || []).filter(e => e.url);
  if (!enlaces.length && !r.url) incidencias.push("sin-enlaces");
  if (enlaces.some(e => !/^https?:\/\//i.test(e.url))) incidencias.push("url-invalida");
  // Solo un nivel expresamente nombrado puede producir una propuesta.
  const niveles = [...new Set([
    [/\b(inicial|principiante)\b/, "inicial"],
    [/\bbasic[oa]s?\b/, "basico"],
    [/\bintermedi[oa]s?\b/, "intermedio"],
    [/\bavanzad[oa]s?\b/, "avanzado"],
  ].filter(([re]) => re.test(normalizar([r.titulo, r.tema].join(" ")))).map(([, n]) => n))];
  return { objetivosSugeridos: objetivos, nivelSugerido: niveles.length === 1 ? niveles[0] : null, incidencias, revision: "pendiente" };
}
