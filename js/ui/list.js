// Render de la tabla de recursos, filtros y selección múltiple.
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
    r.area,
    r.tipo,
    r.estado,
    ...(r.etiquetas || []),
    ...(r.enlaces || []).flatMap((e) => [e.nombre, e.url]),
  ].join(" "));

export function getFilters() {
  return {
    search: searchTokens($("filter-search").value),
    area: $("filter-area").value,
    tipo: $("filter-tipo").value,
    estado: $("filter-estado").value,
  };
}

export function applyFilters(recursos, f) {
  return recursos.filter((r) => {
    if (f.area && r.area !== f.area) return false;
    if (f.tipo && r.tipo !== f.tipo) return false;
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
  fill("filter-area", new Set(recursos.map((r) => r.area).filter(Boolean)), "Todas las áreas");
  fill("filter-tipo", new Set(recursos.map((r) => r.tipo).filter(Boolean)), "Todos los tipos");
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
        ${r.tema ? `<div class="cell-sub">${esc(r.tema)}</div>` : ""}
      </td>
      <td><span class="badge badge-area">${esc(r.area)}</span></td>
      <td>${esc(r.tipo)}</td>
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
