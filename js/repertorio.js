// Repertorio: canciones como recursos independientes de la biblioteca.
//
// Módulo PURO (sin Firebase): convierte el Google Sheet de repertorio de piano
// en documentos de `recursos` y planifica la sincronización. Lo usan el botón
// "Sincronizar repertorio" del Manager y scripts/sync-repertorio.mjs (simulacro
// desde Node), así que ambos producen exactamente los mismos documentos.
//
// Una canción es un recurso normal (disciplina/especialidad/categoría/público,
// igual que los demás, para que el HUB y los filtros la entiendan) con
// `tipo: "Canción"` y un mapa `cancion` con sus datos propios.

export const SHEET_REPERTORIO_PIANO =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQCSexe6ZgBbSKrzyhCkq-64aLrsu6SWqVhhiuccf3EhoMHcP_oxBLdGyZWONcHl861LrX6ZltEu3O3/pub?gid=0&single=true&output=tsv";
export const FUENTE_SHEET_PIANO = "sheet-repertorio-piano";
export const TIPO_CANCION = "Canción";

// Las 6 guías de una canción, en el orden en que se guardan en `enlaces`.
export const GUIAS = [
  { tipo: "colores", titulo: "Guía por colores", columna: "Colores" },
  { tipo: "numeros", titulo: "Guía por números", columna: "Números" },
  { tipo: "notas", titulo: "Guía con notas", columna: "Notas" },
  { tipo: "partitura", titulo: "Partitura", columna: "Partitura" },
  { tipo: "acordes", titulo: "Acordes", columna: "Cifrado/Acordes" },
  { tipo: "video", titulo: "Video tutorial", columna: "Video Tutorial" },
];
export const TIPOS_GUIA = GUIAS.map((g) => g.tipo);

export const esCancion = (r) => r?.tipo === TIPO_CANCION || !!r?.cancion;

const sinTildes = (s) =>
  String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "");

export const slug = (s) =>
  sinTildes(s)
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const idCancion = (titulo, artista) =>
  "cancion-" + slug([titulo, artista].filter(Boolean).join(" "));

export const esUrlValida = (u) => {
  try {
    const url = new URL(String(u).trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

// --- Nivel (0–5) ---

export const nivelLegible = (n) => n == null ? "Dificultad por evaluar" : (n > 0 ? `Nivel ${n}` : "Para empezar");
export const estrellas = (n) => Number.isInteger(n) && n >= 0 && n <= 5 ? "★".repeat(n) + "☆".repeat(5 - n) : "Por evaluar";

// Equivalencia con el nivel de la taxonomía general, para que el HUB y los
// filtros de siempre también ubiquen la canción.
export const nivelTaxonomia = (n) =>
  n == null ? "por-evaluar" : n <= 0 ? "inicial" : n <= 2 ? "basico" : n === 3 ? "intermedio" : "avanzado";

// "★★☆☆☆" → 2. Vacío → 0. Devuelve también si el texto era raro.
export function parseNivel(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return { nivel: null, raro: false };
  if (/^[0-5](?:\.0)?$/.test(t)) return { nivel: Number(t), raro: false };
  const llenas = (t.match(/★/g) || []).length;
  const raro = !/^[★☆]{5}$/.test(t);
  return { nivel: raro ? null : Math.min(5, llenas), raro };
}

// --- Contenido ---

const ACORDE = /^[A-G](#|b)?(m|maj7?|m7|7|9|sus[24]?|dim|aug|add9)?$/;

// Clasifica la columna Contenido: notas (con cuántas), acordes o nada.
export function analizarContenido(texto) {
  const t = String(texto ?? "").trim();
  const base = sinTildes(t).toLowerCase();
  const notas = base.match(/notas?\s*:?\s*(\d+)/);
  if (notas) {
    return { contenidoTipo: "notas", numeroNotas: notas[1].length };
  }
  if (/acorde/.test(base)) return { contenidoTipo: "acordes", numeroNotas: null };
  // Secuencias de acordes sueltas: "D-G-A", "C D Em D", "E.G#m-B-F#".
  const tokens = t.split(/[\s,.\-–/]+/).filter(Boolean);
  if (tokens.length >= 2 && tokens.every((x) => ACORDE.test(x))) {
    return { contenidoTipo: "acordes", numeroNotas: null, inferido: true };
  }
  return { contenidoTipo: "", numeroNotas: null };
}

export function contenidoLegible(texto, { contenidoTipo, numeroNotas }) {
  if (contenidoTipo === "notas") return `Melodía con ${numeroNotas} notas`;
  return String(texto ?? "").trim();
}

// --- Género ---

// Unifica variantes de escritura del Sheet ("Clasico", "Clásico ", "Kpop"…).
const GENEROS_CANONICOS = {
  clasico: "Clásico",
  pelicula: "Película",
  folclor: "Folclor",
  kpop: "K-pop",
  "k pop": "K-pop",
  "pop rock": "Pop rock",
};

export function normalizarGenero(texto) {
  const limpio = String(texto ?? "").trim().replace(/\s+/g, " ");
  if (!limpio) return "";
  const clave = sinTildes(limpio).toLowerCase().replace(/-/g, " ");
  if (GENEROS_CANONICOS[clave]) return GENEROS_CANONICOS[clave];
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

// --- Documento ---

// Arma los campos derivados de una canción (descripción, etiquetas, nivel de
// taxonomía…). Lo usa tanto la importación como el editor del Manager.
export function camposDeCancion({ titulo, cancion, enlaces, instrumento = "piano" }) {
  const c = cancion;
  const info = analizarContenido(c.contenido);
  const cancionFinal = {
    ...c,
    contenidoTipo: info.contenidoTipo,
    numeroNotas: info.numeroNotas,
  };
  const partes = [
    `Canción${c.artista ? ` de ${c.artista}` : ""} para ${instrumento}`,
    nivelLegible(c.nivel),
    contenidoLegible(c.contenido, info),
  ].filter(Boolean);
  const etiquetas = [
    "repertorio",
    "canción",
    c.genero ? c.genero.toLowerCase() : "",
    c.nivel == null ? "nivel-por-evaluar" : `nivel-${c.nivel}`,
    info.contenidoTipo === "notas" ? `notas-${info.numeroNotas}` : "",
    info.contenidoTipo === "acordes" ? "acordes" : "",
  ].filter(Boolean);
  return {
    titulo,
    descripcion: partes.join(" · "),
    tema: "Repertorio",
    tipo: TIPO_CANCION,
    // Clasificación general (igual que el resto de la biblioteca).
    disciplina: "musica",
    especialidad: instrumento,
    area: instrumento, // compat con las apps que aún leen `area`
    categoria: "repertorio",
    nivel: nivelTaxonomia(c.nivel),
    etiquetas: [...new Set(etiquetas)],
    enlaces,
    esDeMusicala: true,
    cancion: cancionFinal,
  };
}

// --- Sheet ---

export function parseTsv(texto) {
  const filas = String(texto).replace(/\r/g, "").split("\n");
  const encabezados = filas.shift().split("\t").map((h) => h.trim());
  return filas
    .map((linea, i) => ({ fila: i + 2, celdas: linea.split("\t") }))
    .filter(({ celdas }) => celdas.some((c) => c.trim()))
    .map(({ fila, celdas }) => {
      const obj = { _fila: fila };
      encabezados.forEach((h, j) => (obj[h] = (celdas[j] ?? "").trim()));
      return obj;
    });
}

// Convierte una fila del Sheet en { id, data, avisos }.
export function filaACancion(fila) {
  const avisos = [];
  const titulo = fila["Nombre de la canción"];
  const artista = fila["Artista"];
  if (!titulo) return { error: `Fila ${fila._fila}: sin nombre de canción` };

  const { nivel, raro } = parseNivel(fila["Nivel"]);
  if (!fila["Nivel"]) avisos.push("sin nivel (queda por evaluar)");
  else if (raro) avisos.push(`nivel raro "${fila["Nivel"]}" (se leyó ${nivel})`);

  const generoOriginal = fila["Género"];
  const genero = normalizarGenero(generoOriginal);
  if (generoOriginal && genero !== generoOriginal) {
    avisos.push(`género "${generoOriginal}" → "${genero}"`);
  }

  const contenido = fila["Contenido"];
  const info = analizarContenido(contenido);
  if (contenido && !info.contenidoTipo) {
    avisos.push(`contenido "${contenido}" no es de notas ni acordes (queda como texto)`);
  }
  if (info.inferido) avisos.push(`contenido "${contenido}" leído como acordes`);

  const enlaces = [];
  for (const g of GUIAS) {
    const valor = fila[g.columna];
    if (!valor) continue;
    const url = valor.split(/\s+/)[0];
    if (!esUrlValida(url)) {
      avisos.push(`${g.columna}: "${valor}" no es una URL válida (omitida)`);
      continue;
    }
    if (valor.includes(" ")) avisos.push(`${g.columna}: la celda trae más de un valor, se usa el primero`);
    enlaces.push({ titulo: g.titulo, url, tipo: g.tipo });
  }
  if (!artista) avisos.push("sin artista");

  const data = camposDeCancion({
    titulo,
    enlaces,
    cancion: {
      artista,
      genero,
      nivel,
      tonalidad: fila["Tonalidad"],
      contenido,
      fuente: FUENTE_SHEET_PIANO,
    },
  });
  return { id: idCancion(titulo, artista), data, avisos, fila: fila._fila };
}

// Campos que manda el Sheet. `estado` y `publico` solo se ponen al crear:
// si un admin archiva una canción o cambia su público, re-sincronizar no lo pisa.
const CAMPOS_DEL_SHEET = [
  "titulo", "descripcion", "tema", "tipo", "disciplina", "especialidad", "area",
  "categoria", "nivel", "etiquetas", "enlaces", "esDeMusicala", "cancion",
];

const sinQuery = (u) => String(u).split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();

// Firestore no conserva el orden de las claves de un mapa: se comparan ordenadas.
const estable = (v) =>
  Array.isArray(v)
    ? v.map(estable)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, estable(v[k])]))
      : v ?? null;
const igual = (a, b) => JSON.stringify(estable(a)) === JSON.stringify(estable(b));

// Compara el Sheet con lo que ya hay en Firestore y decide qué hacer.
// Nunca toca un recurso que no sea una canción importada de este Sheet.
export function planificarSync(textoTsv, recursosExistentes) {
  const porId = new Map(recursosExistentes.map((r) => [r.id, r]));
  const plan = {
    crear: [], actualizar: [], sinCambios: [], errores: [],
    sinGuias: [], raros: [], duplicadosEnSheet: [], parecidosExistentes: [],
    soloEnFirestore: [],
  };
  const vistos = new Map();

  for (const fila of parseTsv(textoTsv)) {
    const r = filaACancion(fila);
    if (r.error) { plan.errores.push(r.error); continue; }

    if (vistos.has(r.id)) {
      // Misma canción y artista en otra fila. Si no aporta ningún enlace nuevo
      // es una repetición y se omite; si trae otros enlaces es otro arreglo
      // (otro nivel, otra guía) y se guarda como versión aparte: "-2", "-3"…
      const primera = vistos.get(r.id);
      const nuevos = r.data.enlaces.filter((e) => !primera.urls.has(sinQuery(e.url)));
      if (!nuevos.length) {
        plan.duplicadosEnSheet.push(
          `"${r.data.titulo}" (fila ${r.fila}) repite la fila ${primera.fila}: se omite`
        );
        continue;
      }
      let n = 2;
      while (vistos.has(`${r.id}-${n}`)) n++;
      plan.duplicadosEnSheet.push(
        `"${r.data.titulo}" (fila ${r.fila}) es otro arreglo de la fila ${primera.fila}: se guarda como ${r.id}-${n}`
      );
      r.id = `${r.id}-${n}`;
    }
    vistos.set(r.id, { fila: r.fila, urls: new Set(r.data.enlaces.map((e) => sinQuery(e.url))) });

    if (!r.data.enlaces.length) plan.sinGuias.push(r.data.titulo);
    if (r.avisos.length) plan.raros.push({ titulo: r.data.titulo, fila: r.fila, avisos: r.avisos });

    const existente = porId.get(r.id);
    if (!existente) {
      plan.crear.push({
        id: r.id,
        data: { ...r.data, estado: "publicado", publico: ["estudiantes"] },
      });
      // ¿Ya había este material cargado a mano o desde Classroom?
      const t = slug(r.data.titulo);
      const parecidos = recursosExistentes.filter(
        (x) => !x.id.startsWith("cancion-") && slug(x.titulo) === t
      );
      if (parecidos.length) {
        plan.parecidosExistentes.push({
          titulo: r.data.titulo,
          ids: parecidos.map((x) => `${x.id} [${x.estado || "?"}]`),
        });
      }
    } else if (existente.cancion?.fuente !== FUENTE_SHEET_PIANO) {
      plan.errores.push(
        `"${r.data.titulo}": ya existe ${r.id} pero no viene de este Sheet; no se toca`
      );
    } else {
      const cambios = CAMPOS_DEL_SHEET.filter((k) => !igual(existente[k], r.data[k]));
      if (cambios.length) plan.actualizar.push({ id: r.id, data: r.data, cambios });
      else plan.sinCambios.push({ id: r.id });
    }
  }

  // Canciones del Sheet que ya no están en él: se informan, no se borran.
  for (const r of recursosExistentes) {
    if (r.cancion?.fuente === FUENTE_SHEET_PIANO && !vistos.has(r.id)) {
      plan.soloEnFirestore.push(`${r.titulo} (${r.id})`);
    }
  }
  return plan;
}

// Resumen de texto del simulacro (para el Manager y para la consola).
export function resumenPlan(plan) {
  const l = [];
  l.push(`Se crearían: ${plan.crear.length}`);
  l.push(`Se actualizarían: ${plan.actualizar.length}`);
  l.push(`Sin cambios: ${plan.sinCambios.length}`);
  l.push(`Errores (no se escriben): ${plan.errores.length}`);
  plan.errores.forEach((e) => l.push(`  • ${e}`));
  l.push(`\nSin ningún enlace de guía: ${plan.sinGuias.length}`);
  plan.sinGuias.forEach((t) => l.push(`  • ${t}`));
  if (plan.duplicadosEnSheet.length) {
    l.push(`\nRepetidas en el Sheet: ${plan.duplicadosEnSheet.length}`);
    plan.duplicadosEnSheet.forEach((t) => l.push(`  • ${t}`));
  }
  if (plan.parecidosExistentes.length) {
    l.push(`\nYa hay un recurso con el mismo título (se crea igual, revisar): ${plan.parecidosExistentes.length}`);
    plan.parecidosExistentes.forEach((p) => l.push(`  • ${p.titulo} → ${p.ids.join(", ")}`));
  }
  if (plan.soloEnFirestore.length) {
    l.push(`\nImportadas antes pero ya no están en el Sheet (no se borran): ${plan.soloEnFirestore.length}`);
    plan.soloEnFirestore.forEach((t) => l.push(`  • ${t}`));
  }
  const sinArtista = plan.raros.filter((r) => r.avisos.includes("sin artista"));
  const raros = plan.raros
    .map((r) => ({ ...r, avisos: r.avisos.filter((a) => a !== "sin artista") }))
    .filter((r) => r.avisos.length);
  l.push(`\nDatos raros: ${raros.length} canciones`);
  raros.forEach((r) => l.push(`  • [fila ${r.fila}] ${r.titulo}: ${r.avisos.join("; ")}`));
  l.push(`\nSin artista: ${sinArtista.length}`);
  l.push(`  ${sinArtista.map((r) => r.titulo).join(" · ")}`);
  return l.join("\n");
}
