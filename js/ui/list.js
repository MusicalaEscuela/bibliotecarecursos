// Render de la tabla de recursos, filtros y selección múltiple.
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

export const selection = new Set();

export function getFilters() {
  return {
    search: $("filter-search").value.trim().toLowerCase(),
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
    if (f.search) {
      const haystack = [r.titulo, r.descripcion, r.tema, ...(r.etiquetas || [])]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(f.search)) return false;
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

export function renderList(recursos, { onEdit, onArchive }) {
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
      </td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("tr").forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector(".act-edit").addEventListener("click", () => onEdit(id));
    tr.querySelector(".act-archive").addEventListener("click", () => onArchive(id));
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
