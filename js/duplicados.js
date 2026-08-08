// Detección de posibles duplicados: se usa antes de guardar una sugerencia
// (y antes de convertirla en recurso) para no llenar la biblioteca de repetidos.

const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();

// Dos URLs son "la misma" aunque cambien el protocolo, el www o la barra final.
const normalizarUrl = (u) =>
  String(u ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#]+$/, "");

const urlsDe = (item) =>
  (item?.enlaces || []).map((e) => normalizarUrl(e.url)).filter(Boolean);

// Devuelve los elementos de `existentes` que probablemente sean el mismo
// recurso que `candidato`: mismo título normalizado o algún enlace en común.
export function buscarDuplicados(candidato, existentes = []) {
  const titulo = normalizar(candidato.titulo);
  const urls = new Set(urlsDe(candidato));
  return existentes.filter((item) => {
    if (titulo && normalizar(item.titulo) === titulo) return true;
    return urlsDe(item).some((u) => urls.has(u));
  });
}

// Texto para el confirm(): qué se encontró y de qué tipo.
export function mensajeDuplicados(coincidencias, tipo) {
  const lista = coincidencias
    .slice(0, 5)
    .map((c) => `• ${c.titulo || "(sin título)"}${c.estado ? ` [${c.estado}]` : ""}`)
    .join("\n");
  const resto = coincidencias.length > 5 ? `\n…y ${coincidencias.length - 5} más` : "";
  return `Esto ya parece existir en ${tipo}:\n\n${lista}${resto}\n\n¿Quieres continuar de todos modos?`;
}
