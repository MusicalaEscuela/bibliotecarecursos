// Modal de creación/edición de un recurso.
const $ = (id) => document.getElementById(id);

let onSaveCallback = null;
let editingId = null;

export function openEditor(recurso, areas, onSave) {
  onSaveCallback = onSave;
  editingId = recurso?.id || null;

  $("editor-title").textContent = editingId ? "Editar recurso" : "Nuevo recurso";
  $("f-titulo").value = recurso?.titulo || "";
  $("f-descripcion").value = recurso?.descripcion || "";
  $("f-tipo").value = recurso?.tipo || "";
  $("f-tema").value = recurso?.tema || "";
  $("f-etiquetas").value = (recurso?.etiquetas || []).join(", ");
  $("f-estado").value = recurso?.estado || "publicado";
  $("f-musicala").checked = recurso?.esDeMusicala !== false;
  $("f-enlaces").value = (recurso?.enlaces || [])
    .map((e) => `${e.titulo} | ${e.url}`)
    .join("\n");

  const sel = $("f-area");
  sel.innerHTML = areas
    .map((a) => `<option value="${a}">${a}</option>`)
    .join("");
  if (recurso?.area && !areas.includes(recurso.area)) {
    sel.innerHTML += `<option value="${recurso.area}">${recurso.area}</option>`;
  }
  sel.value = recurso?.area || areas[0] || "";

  $("editor-backdrop").classList.add("open");
  $("f-titulo").focus();
}

export function closeEditor() {
  $("editor-backdrop").classList.remove("open");
  editingId = null;
}

function collectForm() {
  return {
    titulo: $("f-titulo").value.trim(),
    descripcion: $("f-descripcion").value.trim(),
    area: $("f-area").value,
    tipo: $("f-tipo").value.trim(),
    tema: $("f-tema").value.trim(),
    estado: $("f-estado").value,
    esDeMusicala: $("f-musicala").checked,
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
        return url ? { titulo, url } : { titulo: "", url: titulo };
      }),
  };
}

export function initEditor() {
  $("editor-cancel").addEventListener("click", closeEditor);
  $("editor-backdrop").addEventListener("click", (e) => {
    if (e.target === $("editor-backdrop")) closeEditor();
  });
  $("editor-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = collectForm();
    if (!data.titulo) return;
    onSaveCallback?.(editingId, data);
    closeEditor();
  });
}
