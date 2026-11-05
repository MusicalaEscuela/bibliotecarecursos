import { parseLineaEnlace } from "../organizacion.js";
// Modal de creación/edición de un recurso.
import { especialidadesDe } from "../taxonomia.js";
import { uidActual } from "../auth.js";
import { subirArchivos, mensajeErrorSubida } from "../storage.js";
import { mostrarProgreso } from "./sugerencias.js";
import { toast } from "./toast.js";
import {
  GUIAS,
  TIPOS_GUIA,
  TIPO_CANCION,
  FUENTE_SHEET_PIANO,
  esCancion,
  esUrlValida,
  camposDeCancion,
} from "../repertorio.js";

const $ = (id) => document.getElementById(id);

let onSaveCallback = null;
let editingId = null;
let taxonomia = null;
// Enlaces tal como llegaron: el textarea solo guarda "nombre | url", así que hay
// que reponer los campos extra (storagePath, tamaño…) al recomponerlos.
let enlacesOriginales = [];
let recursoOriginal = null;

const fillSelect = (sel, valores, seleccionado) => {
  sel.innerHTML = valores
    .map((v) => `<option value="${v}">${v}</option>`)
    .join("");
  // Conserva un valor legacy que ya no esté en la lista oficial.
  if (seleccionado && !valores.includes(seleccionado)) {
    sel.innerHTML += `<option value="${seleccionado}">${seleccionado} (fuera de lista)</option>`;
  }
  sel.value = seleccionado || valores[0] || "";
};

// Repuebla las especialidades según la disciplina elegida.
const refreshEspecialidades = (seleccionada) => {
  const disc = $("f-disciplina").value;
  fillSelect($("f-especialidad"), especialidadesDe(taxonomia, disc), seleccionada);
};

// Muestra u oculta los campos propios de una canción.
const refreshTipo = () => {
  const cancion = $("f-tipo").value === TIPO_CANCION;
  $("f-cancion").classList.toggle("hidden", !cancion);
  $("f-enlaces-label").innerHTML = cancion
    ? "Otros enlaces (uno por línea: <code>nombre | url</code>)"
    : "Enlaces (uno por línea: <code>nombre | url</code>)";
};

// Rellena los campos de canción. Las guías salen de `enlaces` por su `tipo`;
// lo demás se queda en el textarea de enlaces.
function fillCancion(recurso, generos) {
  const c = recurso?.cancion || {};
  $("f-artista").value = c.artista || "";
  $("f-genero").value = c.genero || "";
  $("f-generos").innerHTML = generos.map((g) => `<option value="${g}">`).join("");
  $("f-nivel-cancion").value = c.nivel == null ? "" : String(c.nivel);
  $("f-tonalidad").value = c.tonalidad || "";
  $("f-contenido").value = c.contenido || "";
  const enlaces = recurso?.enlaces || [];
  $("f-guias").innerHTML = GUIAS.map((g) => {
    const e = enlaces.find((x) => x.tipo === g.tipo);
    return `<label>${g.titulo}
      <input type="url" data-guia="${g.tipo}" value="${(e?.url || "").replace(/"/g, "&quot;")}" placeholder="https://…">
    </label>`;
  }).join("");
  const box = $("f-cancion");
  box.querySelector(".aviso-sheet")?.remove();
  if (c.fuente === FUENTE_SHEET_PIANO) {
    box.insertAdjacentHTML(
      "afterbegin",
      `<p class="modal-hint aviso-sheet">⚠️ Esta canción viene del Sheet de repertorio: los datos de
        la canción, guías, título y clasificación se vuelven a copiar del Sheet en cada sincronización.
        Para cambios duraderos, corrígelos en el Sheet. El estado y el público sí se respetan.</p>`
    );
  }
}

export function openEditor(recurso, tax, onSave, { generos = [] } = {}) {
  onSaveCallback = onSave;
  taxonomia = tax;
  editingId = recurso?.id || null;
  recursoOriginal = recurso || null;
  const cancion = esCancion(recurso);

  $("editor-title").textContent = editingId ? "Editar recurso" : "Nuevo recurso";
  $("f-titulo").value = recurso?.titulo || "";
  $("f-descripcion").value = recurso?.descripcion || "";
  $("f-tema").value = recurso?.tema || "";
  $("f-etiquetas").value = (recurso?.etiquetas || []).join(", ");
  $("f-estado").value = recurso?.estado || "publicado";
  enlacesOriginales = recurso?.enlaces || [];
  $("f-tipo").value = cancion ? TIPO_CANCION : recurso?.tipo === "Juego" ? "Juego" : "";
  fillCancion(recurso, generos);
  refreshTipo();
  // En una canción, las guías van en sus propios campos, no en el textarea.
  $("f-enlaces").value = enlacesOriginales
    .filter((e) => !(cancion && TIPOS_GUIA.includes(e.tipo)))
    .map((e) => `${e.titulo || e.nombre || ""} | ${e.url || ""}`)
    .join("\n");
  $("f-archivos").value = "";
  $("f-upload").textContent = "";

  // Disciplina → especialidad (dependiente) → categoría → nivel.
  // Compat: si el recurso es viejo, deriva la especialidad del campo `area`.
  fillSelect($("f-disciplina"), taxonomia.disciplinas, recurso?.disciplina || "musica");
  refreshEspecialidades(recurso?.especialidad || recurso?.area || "general");
  fillSelect($("f-categoria"), taxonomia.categorias, recurso?.categoria || recurso?.tipo || "");
  fillSelect($("f-nivel"), taxonomia.niveles, recurso?.nivel || "por-evaluar");

  // Público: checkboxes (por defecto, estudiantes).
  const publicoSel = recurso?.publico?.length ? recurso.publico : ["estudiantes"];
  $("f-publico").innerHTML = taxonomia.publico
    .map(
      (p) => `<label class="check-label"><input type="checkbox" value="${p}"
        ${publicoSel.includes(p) ? "checked" : ""}> ${p}</label>`
    )
    .join("");

  $("editor-backdrop").classList.add("open");
  $("f-titulo").focus();
}

export function closeEditor() {
  $("editor-backdrop").classList.remove("open");
  editingId = null;
  recursoOriginal = null;
}

// Completa y valida los campos de una canción. Devuelve un mensaje de error o null.
function aplicarCancion(data) {
  const valorNivel = $("f-nivel-cancion").value;
  const nivel = valorNivel === "" ? null : Number(valorNivel);
  if (nivel !== null && (!Number.isInteger(nivel) || nivel < 0 || nivel > 5)) return "El nivel debe estar entre 0 y 5.";

  const guias = [];
  for (const g of GUIAS) {
    const url = $("f-guias").querySelector(`[data-guia="${g.tipo}"]`).value.trim();
    if (!url) continue;
    if (!esUrlValida(url)) return `«${g.titulo}» no es una URL válida (debe empezar por https://).`;
    const original = enlacesOriginales.find((o) => o.url === url);
    guias.push({ ...(original || {}), titulo: g.titulo, url, tipo: g.tipo });
  }

  const orig = recursoOriginal?.cancion || {};
  const auto = camposDeCancion({
    titulo: data.titulo,
    instrumento: data.especialidad === "general" ? "piano" : data.especialidad,
    enlaces: [...guias, ...data.enlaces],
    cancion: {
      artista: $("f-artista").value.trim(),
      genero: $("f-genero").value.trim(),
      nivel,
      tonalidad: $("f-tonalidad").value.trim(),
      contenido: $("f-contenido").value.trim(),
      fuente: orig.fuente || "manager",
    },
  });

  // Descripción y etiquetas: si eran las automáticas (o están vacías), se
  // regeneran; si alguien las escribió a mano, se respetan.
  const autoAnterior = esCancion(recursoOriginal) && recursoOriginal.cancion
    ? camposDeCancion({
        titulo: recursoOriginal.titulo,
        instrumento: recursoOriginal.especialidad || "piano",
        enlaces: [],
        cancion: recursoOriginal.cancion,
      })
    : null;
  const descripcion =
    !data.descripcion || data.descripcion === autoAnterior?.descripcion
      ? auto.descripcion
      : data.descripcion;
  const etiquetasViejasAuto = new Set(autoAnterior?.etiquetas || []);
  const etiquetas = [
    ...new Set([...auto.etiquetas, ...data.etiquetas.filter((t) => !etiquetasViejasAuto.has(t))]),
  ];

  Object.assign(data, {
    tipo: TIPO_CANCION,
    tema: data.tema || auto.tema,
    categoria: data.categoria || "repertorio",
    nivel: auto.nivel, // el nivel general sale de las estrellas
    descripcion,
    etiquetas,
    enlaces: auto.enlaces,
    cancion: auto.cancion,
  });
  return null;
}

function collectForm() {
  const especialidad = $("f-especialidad").value;
  return {
    titulo: $("f-titulo").value.trim(),
    descripcion: $("f-descripcion").value.trim(),
    disciplina: $("f-disciplina").value,
    especialidad,
    categoria: $("f-categoria").value,
    nivel: $("f-nivel").value,
    tema: $("f-tema").value.trim(),
    estado: $("f-estado").value,
    publico: [...$("f-publico").querySelectorAll("input:checked")].map((c) => c.value),
    // Compatibilidad: las apps que aún leen `area` siguen funcionando.
    area: especialidad,
    etiquetas: $("f-etiquetas")
      .value.split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    tipo: $("f-tipo").value === "Juego" ? "Juego" : $("f-tipo").value === TIPO_CANCION
      ? TIPO_CANCION
      : (recursoOriginal?.tipo === TIPO_CANCION ? "" : recursoOriginal?.tipo || ""),
    enlaces: $("f-enlaces")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const enlace = parseLineaEnlace(line);
        // Si el enlace ya existía, conserva sus metadatos (storagePath…).
        const original = enlacesOriginales.find((o) => o.url === enlace.url);
        return original ? { ...original, ...enlace } : enlace;
      }),
  };
}

export function initEditor() {
  $("f-tipo").addEventListener("change", () => {
    refreshTipo();
    // Una canción nueva nace como repertorio de piano (se puede cambiar).
    if ($("f-tipo").value === TIPO_CANCION) {
      if ($("f-especialidad").value === "general") refreshEspecialidades("piano");
      if (!$("f-categoria").value || $("f-categoria").value === taxonomia.categorias[0]) {
        $("f-categoria").value = "repertorio";
      }
    }
  });
  $("f-disciplina").addEventListener("change", () => {
    refreshEspecialidades();
    // Al elegir "institucional", sugiere público docentes (el usuario puede cambiarlo).
    if ($("f-disciplina").value === "institucional") {
      $("f-publico").querySelectorAll("input").forEach((c) => {
        c.checked = c.value === "docentes";
      });
    }
  });
  $("editor-cancel").addEventListener("click", closeEditor);
  $("editor-backdrop").addEventListener("click", (e) => {
    if (e.target === $("editor-backdrop")) closeEditor();
  });
  $("editor-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = collectForm();
    if (!data.titulo) {
      toast("El título es obligatorio.", "error");
      return;
    }
    // Solo se validan los enlaces nuevos o cambiados: los que ya venían (p. ej.
    // de Classroom) no deben impedir guardar otros cambios.
    const malas = data.enlaces.filter(
      (e) => !esUrlValida(e.url) && !enlacesOriginales.some((o) => o.url === e.url)
    );
    if (malas.length) {
      toast(`Enlace no válido: «${malas[0].url}». Usa una URL completa (https://…).`, "error");
      return;
    }
    if (data.tipo === TIPO_CANCION) {
      const error = aplicarCancion(data);
      if (error) {
        toast(error, "error");
        return;
      }
    } else if (esCancion(recursoOriginal)) {
      data.cancion = null; // dejó de ser canción
    }
    const btnGuardar = $("editor-form").querySelector('button[type="submit"]');
    btnGuardar.disabled = true;
    try {
      const archivos = $("f-archivos").files;
      if (archivos.length) {
        const subidos = await subirArchivos(archivos, uidActual(), (i, total, nombre, pct) =>
          mostrarProgreso("f-upload", i, total, nombre, pct)
        );
        data.enlaces = [...data.enlaces, ...subidos];
      }
      onSaveCallback?.(editingId, data);
      closeEditor();
    } catch (err) {
      toast(mensajeErrorSubida(err), "error");
    } finally {
      btnGuardar.disabled = false;
      $("f-upload").textContent = "";
    }
  });
}
