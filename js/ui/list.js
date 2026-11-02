import { diagnosticar } from "../catalogo.js";
// Render de la tabla de recursos, filtros y selección múltiple.
import { esCancion, estrellas } from "../repertorio.js";

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

export const selection = new Set();

const normalizeSearchText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const searchTokens = (value) =>
  normalizeSearchText(value)
    .split(/[^a-z0-9ñ]+/i)
    .filter(Boolean);

const searchableText = (r) =>
  normalizeSearchText([
    r.titulo,
    r.descripcion,
    r.tema,
    r.disciplina,
    r.especialidad,
    r.categoria,
    r.nivel,
    ...(r.objetivos || []),
    ...(r.formatos || []),
    r.area,
    r.tipo,
    r.estado,
    r.cancion?.artista,
    r.cancion?.genero,
    r.cancion?.tonalidad,
    r.cancion?.contenido,
    ...(r.etiquetas || []),
    ...(r.enlaces || []).flatMap((e) => [e.nombre, e.titulo, e.url]),
  ].join(" "));

// Compat: lee el campo nuevo y, si falta, cae al viejo `area`/`tipo`.
const especialidadDe = (r) => r.especialidad || r.area || "";
const categoriaDe = (r) => r.categoria || r.tipo || "";

// Pestaña activa: "todos" o "repertorio" (solo canciones).
let vista = "todos";
export const setVista = (v) => (vista = v);
export const getVista = () => vista;

export function getFilters() {
  return {
    vista,
    search: searchTokens($("filter-search").value),
    tipo: $("filter-tipo").value,
    nivelCancion: $("filter-nivel-cancion").value,
    genero: $("filter-genero").value,
    contenido: $("filter-contenido").value,
    guia: $("filter-guia").value,
    disciplina: $("filter-disciplina").value,
    especialidad: $("filter-especialidad").value,
    categoria: $("filter-categoria").value,
    objetivo: $("filter-objetivo").value,
    formato: $("filter-formato").value,
    nivel: $("filter-nivel").value,
    revision: $("filter-revision").value,
    estado: $("filter-estado").value,
  };
}

export function applyFilters(recursos, f) {
  return recursos.filter((r) => {
    if (f.vista === "repertorio" && !esCancion(r)) return false;
    if (f.tipo && (r.tipo || "") !== f.tipo) return false;
    // Filtros de canción: solo aplican a canciones (el resto queda fuera).
    const c = r.cancion;
    if (f.nivelCancion !== "" && (!c || String(c.nivel) !== f.nivelCancion)) return false;
    if (f.genero && (!c || c.genero !== f.genero)) return false;
    if (f.contenido === "sin" && (!c || c.contenidoTipo)) return false;
    if (f.contenido && f.contenido !== "sin" && (!c || c.contenidoTipo !== f.contenido)) return false;
    if (f.guia === "ninguna" && (!c || (r.enlaces || []).length)) return false;
    if (f.guia && f.guia !== "ninguna" && (!c || !(r.enlaces || []).some((e) => e.tipo === f.guia)))
      return false;
    if (f.disciplina && (r.disciplina || "") !== f.disciplina) return false;
    if (f.especialidad && especialidadDe(r) !== f.especialidad) return false;
    if (f.categoria && categoriaDe(r) !== f.categoria) return false;
    if (f.objetivo && !(r.objetivos || []).includes(f.objetivo)) return false;
    if (f.formato && !(r.formatos || []).includes(f.formato)) return false;
    if (f.nivel && r.nivel !== f.nivel) return false;
    if (f.revision && !diagnosticar(r).incidencias.includes(f.revision)) return false;
    if (f.estado && r.estado !== f.estado) return false;
    if (f.search.length) {
      const haystack = searchableText(r);
      if (!f.search.every((token) => haystack.includes(token))) return false;
    }
    return true;
  });
}

export function fillFilterOptions(recursos) {
  const fill = (id, values, label) => {
    const sel = $(id);
    const current = sel.value;
    sel.innerHTML =
      `<option value="">${label}</option>` +
      [...values].sort().map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    sel.value = current;
  };
  fill("filter-disciplina", new Set(recursos.map((r) => r.disciplina).filter(Boolean)), "Todas las disciplinas");
  fill("filter-especialidad", new Set(recursos.map(especialidadDe).filter(Boolean)), "Todas las especialidades");
  fill("filter-categoria", new Set(recursos.map(categoriaDe).filter(Boolean)), "Todas las categorías");
  fill("filter-objetivo", new Set(recursos.flatMap(r => r.objetivos || [])), "Objetivo: todos");
  fill("filter-formato", new Set(recursos.flatMap(r => r.formatos || [])), "Formato: todos");
  fill("filter-nivel", new Set(recursos.map(r => r.nivel).filter(Boolean)), "Dificultad: todas");
  fill("filter-tipo", new Set(recursos.map((r) => r.tipo).filter(Boolean)), "Todos los tipos");
  fill("filter-genero", new Set(recursos.map((r) => r.cancion?.genero).filter(Boolean)), "Todos los géneros");
}

// Debajo del título: artista · estrellas · género para canciones; tema para el resto.
function subtitulo(r) {
  if (esCancion(r) && r.cancion) {
    const c = r.cancion;
    const partes = [
      c.artista ? esc(c.artista) : "",
      `<span class="stars" title="${c.nivel == null ? "Dificultad por evaluar" : `Nivel ${c.nivel}`}">${estrellas(c.nivel)}</span>`,
      c.genero ? esc(c.genero) : "",
      c.tonalidad ? `en ${esc(c.tonalidad)}` : "",
      c.contenido ? esc(c.contenido) : "",
    ].filter(Boolean);
    return `<div class="cell-sub">🎵 ${partes.join(" · ")}</div>`;
  }
  return r.tema ? `<div class="cell-sub">${esc(r.tema)}</div>` : "";
}

export function renderList(recursos, { onEdit, onArchive, onDelete }) {
  const tbody = $("list-body");
  $("list-count").textContent = `${recursos.length} recurso${recursos.length === 1 ? "" : "s"}`;
  tbody.innerHTML = recursos
    .map(
      (r) => `
    <tr data-id="${esc(r.id)}" class="${r.estado === "archivado" ? "row-archived" : ""}">
      <td><input type="checkbox" class="row-check" ${selection.has(r.id) ? "checked" : ""}></td>
      <td>
        <div class="cell-title">${esc(r.titulo)}</div>
        ${subtitulo(r)}
      </td>
      <td>${r.disciplina ? `<span class="badge badge-area">${esc(r.disciplina)}</span>` : ""}</td>
      <td>${esc(especialidadDe(r))}</td>
      <td>${esc(categoriaDe(r))}</td>
      <td><span class="badge badge-${esc(r.estado)}">${esc(r.estado)}</span></td>
      <td>${(r.enlaces || []).length ? `🔗 ${(r.enlaces || []).length}` : ""}</td>
      <td class="cell-actions">
        <button class="btn btn-small act-edit">Editar</button>
        <button class="btn btn-small btn-ghost act-archive">${r.estado === "archivado" ? "Restaurar" : "Archivar"}</button>
        ${r.estado === "archivado" ? `<button class="btn btn-small btn-danger act-delete">Eliminar</button>` : ""}
      </td>
    </tr>`
    )
    .join("");

  // Seleccionar/deseleccionar todos los recursos filtrados actualmente visibles.
  const checkAll = document.getElementById("check-all");
  const visibleIds = recursos.map((r) => r.id);
  checkAll.checked = visibleIds.length > 0 && visibleIds.every((id) => selection.has(id));
  checkAll.onchange = () => {
    if (checkAll.checked) visibleIds.forEach((id) => selection.add(id));
    else visibleIds.forEach((id) => selection.delete(id));
    tbody.querySelectorAll(".row-check").forEach((c) => (c.checked = checkAll.checked));
    updateBulkBar();
  };

  tbody.querySelectorAll("tr").forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector(".act-edit").addEventListener("click", () => onEdit(id));
    tr.querySelector(".act-archive").addEventListener("click", () => onArchive(id));
    tr.querySelector(".act-delete")?.addEventListener("click", () => onDelete(id));
    tr.querySelector(".row-check").addEventListener("change", (e) => {
      e.target.checked ? selection.add(id) : selection.delete(id);
      updateBulkBar();
    });
  });
  updateBulkBar();
}

export function updateBulkBar() {
  const bar = $("bulk-bar");
  bar.classList.toggle("hidden", selection.size === 0);
  $("bulk-count").textContent = `${selection.size} seleccionados`;
}

export function clearSelection() {
  selection.clear();
  document.querySelectorAll(".row-check").forEach((c) => (c.checked = false));
  updateBulkBar();
}
