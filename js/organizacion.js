// Clasificación sustentada en los metadatos. No certifica revisión de adjuntos.
import { normalizar } from "./catalogo.js";
export const VERSION_CATALOGO = "2026-11-01.2";
export const CATEGORIAS_ADICIONALES = ["metodo", "ensamble", "juego", "planificacion", "institucional", "material-apoyo", "expresion"];
function huella(r) {
  const estable = v => Array.isArray(v) ? v.map(estable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, estable(v[k])])) : v ?? null;
  const texto = JSON.stringify(estable([r.titulo, r.tema, r.descripcion, r.especialidad, r.categoria, r.nivel, r.cancion?.nivel, r.etiquetas, r.enlaces]));
  let hash = 2166136261;
  for (let i = 0; i < texto.length; i++) hash = Math.imul(hash ^ texto.charCodeAt(i), 16777619);
  return `${(hash >>> 0).toString(16)}-${texto.length}`;
}
export function parseLineaEnlace(linea) {
  const texto = String(linea || "").trim();
  if (/^https?:\/\//i.test(texto)) return { titulo: "", url: texto };
  const match = texto.match(/^(.*?)\s*\|\s*(https?:\/\/.*)$/i);
  if (match) return { titulo: match[1].trim(), url: match[2].trim() };
  const separador = texto.lastIndexOf("|");
  return separador < 0 ? { titulo: "", url: texto } : { titulo: texto.slice(0, separador).trim(), url: texto.slice(separador + 1).trim() };
}
export function formatosDe(r) {
  const formatos = new Set();
  for (const e of r.enlaces || []) {
    const url = String(e.url || "");
    const tipo = normalizar(e.tipo || "");
    if (!/^https?:\/\//i.test(url)) continue;
    if (/youtu\.be|youtube\.com|vimeo\.com/i.test(url) || tipo === "video") formatos.add("video");
    if (/\.(mp3|wav|m4a|ogg)(?:$|[?#])/i.test(url) || /audio/.test(e.contentType || "")) formatos.add("audio");
    if (/\.(png|jpe?g|gif|webp)(?:$|[?#])/i.test(url) || /image/.test(e.contentType || "")) formatos.add("imagen");
    if (/\.pdf(?:$|[?#])/i.test(url) || e.contentType === "application/pdf") formatos.add("pdf");
    if (/docs\.google\.com\/document\//i.test(url)) formatos.add("documento");
    if (/docs\.google\.com\/spreadsheets\//i.test(url)) formatos.add("hoja-de-calculo");
    if (/docs\.google\.com\/presentation\//i.test(url)) formatos.add("presentacion");
    if (["colores", "numeros", "notas", "partitura", "acordes"].includes(tipo)) formatos.add(tipo);
  }
  return [...formatos].sort();
}
export function objetivosDe(r) {
  const texto = normalizar([r.titulo, r.tema, r.cancion?.contenido, ...(r.etiquetas || [])].join(" "));
  return [
    ["lectura-musical", /lectura|solfeo|caligrafia musical|claves musicales/],
    ["ritmo", /ritmo|ritmic|groove|fills|pulso|compas/],
    ["armonia-y-acordes", /acorde|triada|armonia|circulo de quintas/],
    ["escalas", /escala|pentaton/], ["arpegios", /arpegio/],
    ["coordinacion-e-independencia", /coordinacion|independencia|digitacion|gimnasia dactilar/],
    ["afinacion-y-oido", /afinacion|entonacion|auditiv/],
    ["improvisacion", /improvisa/], ["cuidado-corporal", /calentamiento|estiramiento|respiracion|cuerpo del musico/],
    ["interpretacion-y-ensamble", /ensamble|cuarteto|coro|interpretacion/],
    ["expresion-visual", /boceto|trazo|perspectiva|dibujo|pintura|acuarela/],
    ["expresion-corporal", /ballet|danza|baile|movimiento corporal/],
    ["planeacion-docente", /estructura de clase|objetivos|metodologia|protocolo|planeacion/],
  ].filter(([, re]) => re.test(texto)).map(([nombre]) => nombre);
}
export function categoriaDe(r) {
  const actual = r.categoria?.trim();
  if (actual) return ({ Material: "material-apoyo", acordes: "armonia", fills: "ritmo", preuniversitario: "evaluacion", minijuegos: "juego" })[actual] || actual;
  const tema = normalizar(r.tema || "");
  const titulo = normalizar(r.titulo || "");
  if (/cancion|repertorio|partitura|^coro$|^letra$/.test(tema)) return "repertorio";
  if (/metodo|cartilla/.test(tema)) return "metodo";
  if (/ensamble|direccion/.test(tema)) return "ensamble";
  if (/minijuego/.test(tema) || /juego|ruleta|semaforo|solitario/.test(titulo)) return "juego";
  if (/admision|diagnostico|universidad/.test(tema)) return "evaluacion";
  if (/estructura de clase|objetivos|metodologia|procesos|proyectos|actividades/.test(tema)) return "planificacion";
  if (/tributaria|cuenta de cobro|deberes|fechas importantes|protocolo|capacitacion/.test(tema)) return "institucional";
  if (/solfeo|caligrafia musical/.test(tema)) return "lectura";
  if (/acorde/.test(tema)) return "armonia";
  if (/groove|fills|latino|danza latina/.test(tema)) return "ritmo";
  if (/boceto|perspectiva|trazo|colores/.test(tema)) return "expresion";
  if (/escala|arpegio|patron|independencia|coordinacion|estudios|fundamentos ballet|entonacion|respiracion|musi.?gym/.test(tema)) return "tecnica";
  if (/auditiv|componentes de musica/.test(tema)) return "teoria";
  if (/wix|zoom|botones|grabacion/.test(tema)) return "herramienta";
  if (/introduccion|aprestamiento/.test(tema)) return "guia";
  if (/escala|arpegio|digitacion|drumming|patrones|triadas/.test(titulo)) return "tecnica";
  if (/acorde/.test(titulo)) return "armonia";
  if (/calentamiento|estiramiento/.test(titulo)) return "calentamiento";
  if (/ritmo|fills|groove/.test(titulo)) return "ritmo";
  if (/lectura|claves musicales/.test(titulo)) return "lectura";
  if (/guia|explicacion|como /.test(titulo)) return "guia";
  return "material-apoyo";
}
export function nivelSinFuente(r) {
  const filas = r.origenImportacion?.registros || [];
  return filas.length > 0 && r.cancion?.nivel === 0 && filas.every(f => {
    const campo = Object.entries(f.campos || {}).find(([k]) => normalizar(k).trim() === "nivel");
    return !campo || !String(campo[1] ?? "").trim();
  });
}
export function proponerOrganizacion(r, original) {
  const patch = {};
  const evidencias = [];
  if (r.catalogacion?.version === VERSION_CATALOGO && r.catalogacion?.huella === huella(r)) return patch;
  const categoria = categoriaDe(r);
  if (categoria !== r.categoria) { patch.categoria = categoria; evidencias.push("categoria-segun-tema-y-titulo"); }
  let enlaces = r.enlaces || [];
  if (original?.attachments?.length) {
    let reparados = false;
    enlaces = enlaces.map((e, i) => {
      if (/^https?:\/\//i.test(e.url || "")) return e;
      const fuente = original.attachments.find(a => e.titulo && a.name?.startsWith(e.titulo)) || (original.attachments.length === enlaces.length ? original.attachments[i] : null);
      if (!/^https?:\/\//i.test(fuente?.url || "")) return e;
      reparados = true;
      return { ...e, titulo: fuente.name || e.titulo, url: fuente.url };
    });
    if (!enlaces.length) {
      enlaces = original.attachments.filter(a => /^https?:\/\//i.test(a.url || "")).map(a => ({ titulo: a.name || "Material", url: a.url, tipo: a.type || "" }));
      reparados = enlaces.length > 0;
    }
    if (reparados) { patch.enlaces = enlaces; evidencias.push("enlaces-restaurados-del-export-original"); }
  }
  const incierto = nivelSinFuente(r);
  if (incierto) {
    patch.nivel = "por-evaluar";
    patch.cancion = { ...r.cancion, nivel: null };
    patch.etiquetas = (r.etiquetas || []).filter(e => e !== "nivel-0");
    if (r.descripcion?.includes(" · Para empezar")) patch.descripcion = r.descripcion.replace(" · Para empezar", " · Dificultad por evaluar");
    evidencias.push("celda-nivel-vacia-en-origen");
  }
  if (!r.descripcion?.trim()) {
    if (original?.description?.trim()) { patch.descripcion = original.description.trim(); evidencias.push("descripcion-del-export-original"); }
    else {
      const especialidad = (r.especialidad || r.area || "general").replaceAll("-", " ");
      const contexto = r.tema ? ` sobre ${r.tema}` : "";
      patch.descripcion = `${r.titulo}. Material de ${especialidad}${contexto}. ${enlaces.some(e => /^https?:\/\//i.test(e.url || "")) ? "Consulta los materiales adjuntos." : "Referencia de catálogo; material adjunto pendiente."}`;
      evidencias.push("descripcion-descriptiva-segun-ficha");
    }
  }
  const formatos = formatosDe({ ...r, enlaces });
  const objetivos = [...new Set([...(r.objetivos || []), ...objetivosDe(r)])].sort();
  if (JSON.stringify(r.formatos || []) !== JSON.stringify(formatos)) patch.formatos = formatos;
  if (JSON.stringify(r.objetivos || []) !== JSON.stringify(objetivos)) patch.objetivos = objetivos;
  if (!/[\p{L}\p{N}]/u.test(r.titulo || "")) {
    patch.estado = "archivado";
    patch.motivoArchivo = "Fila de importación sin título válido; se conserva como respaldo.";
    evidencias.push("titulo-sin-letras-ni-numeros");
  }
  patch.catalogacion = {
    ...r.catalogacion,
    version: VERSION_CATALOGO,
    huella: huella({ ...r, ...patch }),
    metodo: "metadatos-y-fuentes-originales",
    contenidoRevisado: false,
    nivelEstado: incierto || r.nivel === "por-evaluar" ? "por-evaluar" : "sin-validar-contenido",
    adjuntosEstado: enlaces.some(e => /^https?:\/\//i.test(e.url || "")) ? "enlaces-registrados" : "sin-adjuntos",
    evidencias,
    ...(incierto ? { nivelAnterior: r.nivel, estrellasAnteriores: r.cancion.nivel } : {}),
  };
  return patch;
}
