// Modal de creación/edición de un recurso.
import { especialidadesDe } from "../taxonomia.js";
import { uidActual } from "../auth.js";
import { subirArchivos, mensajeErrorSubida } from "../storage.js";
import { mostrarProgreso } from "./sugerencias.js";
import { toast } from "./toast.js";

const $ = (id) => document.getElementById(id);

let onSaveCallback = null;
let editingId = null;
let taxonomia = null;
// Enlaces tal como llegaron: el textarea solo guarda "nombre | url", así que hay
// que reponer los campos extra (storagePath, tamaño…) al recomponerlos.
let enlacesOriginales = [];

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

export function openEditor(recurso, tax, onSave) {
  onSaveCallback = onSave;
  taxonomia = tax;
  editingId = recurso?.id || null;

  $("editor-title").textContent = editingId ? "Editar recurso" : "Nuevo recurso";
  $("f-titulo").value = recurso?.titulo || "";
  $("f-descripcion").value = recurso?.descripcion || "";
  $("f-tema").value = recurso?.tema || "";
  $("f-etiquetas").value = (recurso?.etiquetas || []).join(", ");
  $("f-estado").value = recurso?.estado || "publicado";
  enlacesOriginales = recurso?.enlaces || [];
  $("f-enlaces").value = enlacesOriginales
    .map((e) => `${e.titulo || e.nombre || ""} | ${e.url || ""}`)
    .join("\n");
  $("f-archivos").value = "";
  $("f-upload").textContent = "";

  // Disciplina → especialidad (dependiente) → categoría → nivel.
  // Compat: si el recurso es viejo, deriva la especialidad del campo `area`.
  fillSelect($("f-disciplina"), taxonomia.disciplinas, recurso?.disciplina || "musica");
  refreshEspecialidades(recurso?.especialidad || recurso?.area || "general");
  fillSelect($("f-categoria"), taxonomia.categorias, recurso?.categoria || recurso?.tipo || "");
  fillSelect($("f-nivel"), taxonomia.niveles, recurso?.nivel || "todos");

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
    enlaces: $("f-enlaces")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [titulo, url] = line.split("|").map((s) => s.trim());
        const enlace = url ? { titulo, url } : { titulo: "", url: titulo };
        // Si el enlace ya existía, conserva sus metadatos (storagePath…).
        const original = enlacesOriginales.find((o) => o.url === enlace.url);
        return original ? { ...original, ...enlace } : enlace;
      }),
  };
}

export function initEditor() {
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
    if (!data.titulo) return;
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
