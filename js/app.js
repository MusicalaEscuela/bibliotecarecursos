// Orquestador del Manager de la Biblioteca.
import { login, logout, watchAuth } from "./auth.js";
import {
  fetchRecursos,
  createRecurso,
  updateRecurso,
  bulkUpdate,
  deleteRecursoForever,
  fetchAreas,
  saveAreas,
} from "./db.js";
import { importClassroomExport } from "./importer.js";
import { toast } from "./ui/toast.js";
import { openEditor, initEditor } from "./ui/editor.js";
import {
  renderList,
  applyFilters,
  getFilters,
  fillFilterOptions,
  selection,
  clearSelection,
} from "./ui/list.js";

const $ = (id) => document.getElementById(id);

let currentUser = null;
let recursos = [];
let areasOficiales = [];

// Áreas oficiales (config/areas); si aún no existe el doc, se siembra
// con las áreas presentes en los recursos.
const areasDeRecursos = () =>
  [...new Set(recursos.map((r) => r.area).filter(Boolean))].sort();
const areas = () => (areasOficiales.length ? areasOficiales : areasDeRecursos());

async function loadAreas() {
  const lista = await fetchAreas();
  if (lista === null && recursos.length) {
    areasOficiales = areasDeRecursos();
    await saveAreas(areasOficiales, currentUser.email);
    toast("Lista oficial de áreas creada en config/areas", "success");
  } else {
    areasOficiales = lista || [];
  }
}

function refresh() {
  fillFilterOptions(recursos);
  $("areas-list").innerHTML = areas()
    .map((a) => `<option value="${a}"></option>`)
    .join("");
  renderList(applyFilters(recursos, getFilters()), {
    onEdit: handleEdit,
    onArchive: handleArchive,
    onDelete: handleDelete,
  });
}

async function loadData() {
  $("loading").classList.remove("hidden");
  try {
    recursos = await fetchRecursos();
    await loadAreas();
    $("import-panel").classList.toggle("hidden", recursos.length > 0);
    refresh();
  } catch (err) {
    console.error(err);
    toast("Error cargando recursos: " + err.message, "error");
  } finally {
    $("loading").classList.add("hidden");
  }
}

function handleEdit(id) {
  const recurso = recursos.find((r) => r.id === id);
  openEditor(recurso, areas(), async (editId, data) => {
    try {
      if (editId) {
        await updateRecurso(editId, data, currentUser.email);
        Object.assign(recursos.find((r) => r.id === editId), data);
        toast("Recurso actualizado", "success");
      } else {
        const newId = await createRecurso(data, currentUser.email);
        recursos.push({ id: newId, ...data });
        toast("Recurso creado", "success");
      }
      refresh();
    } catch (err) {
      toast("Error al guardar: " + err.message, "error");
    }
  });
}

async function handleArchive(id) {
  const recurso = recursos.find((r) => r.id === id);
  const nuevoEstado = recurso.estado === "archivado" ? "publicado" : "archivado";
  try {
    await updateRecurso(id, { estado: nuevoEstado }, currentUser.email);
    recurso.estado = nuevoEstado;
    toast(nuevoEstado === "archivado" ? "Recurso archivado" : "Recurso restaurado", "success");
    refresh();
  } catch (err) {
    toast("Error: " + err.message, "error");
  }
}

async function handleDelete(id) {
  const recurso = recursos.find((r) => r.id === id);
  if (!confirm(`¿Eliminar definitivamente "${recurso.titulo}"?\n\nEsta acción no se puede deshacer.`))
    return;
  try {
    await deleteRecursoForever(id);
    recursos = recursos.filter((r) => r.id !== id);
    selection.delete(id);
    toast("Recurso eliminado definitivamente", "success");
    refresh();
  } catch (err) {
    toast("Error al eliminar: " + err.message, "error");
  }
}

async function handleBulk(data) {
  const ids = [...selection];
  try {
    await bulkUpdate(ids, data, currentUser.email);
    for (const id of ids) Object.assign(recursos.find((r) => r.id === id), data);
    toast(`${ids.length} recursos actualizados`, "success");
    clearSelection();
    refresh();
  } catch (err) {
    toast("Error en edición masiva: " + err.message, "error");
  }
}

function initBulkBar() {
  $("bulk-area-apply").addEventListener("click", () => {
    const area = $("bulk-area").value.trim().toLowerCase();
    if (!area) return;
    if (areasOficiales.length && !areasOficiales.includes(area)) {
      toast(`"${area}" no está en la lista oficial. Agrégala primero en "Áreas".`, "error");
      return;
    }
    handleBulk({ area });
  });
  $("bulk-archive").addEventListener("click", () => handleBulk({ estado: "archivado" }));
  $("bulk-publish").addEventListener("click", () => handleBulk({ estado: "publicado" }));
  $("bulk-clear").addEventListener("click", clearSelection);
}

function initToolbar() {
  ["filter-search", "filter-area", "filter-tipo", "filter-estado"].forEach((id) =>
    $(id).addEventListener("input", refresh)
  );
  $("btn-new").addEventListener("click", () => handleEdit(null));
  $("btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(recursos, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `biblioteca-musicala-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });
  $("btn-import").addEventListener("click", async () => {
    if (!confirm("¿Importar el export de Classroom a Firestore? Es seguro re-ejecutarlo (no duplica)."))
      return;
    $("btn-import").disabled = true;
    try {
      const total = await importClassroomExport(currentUser.email, (done, all) => {
        $("import-progress").textContent = `Importando… ${done}/${all}`;
      });
      toast(`Importación completa: ${total} recursos`, "success");
      await loadData();
    } catch (err) {
      toast("Error importando: " + err.message, "error");
    } finally {
      $("btn-import").disabled = false;
      $("import-progress").textContent = "";
    }
  });
}

// --- Gestor de áreas oficiales ---
let areasDraft = [];

function renderAreasModal() {
  $("areas-items").innerHTML = areasDraft
    .map(
      (a, i) => `<li>${a}
        <button class="btn btn-small btn-ghost area-del" data-i="${i}">✕</button></li>`
    )
    .join("");
  $("areas-items")
    .querySelectorAll(".area-del")
    .forEach((b) =>
      b.addEventListener("click", () => {
        areasDraft.splice(Number(b.dataset.i), 1);
        renderAreasModal();
      })
    );
}

function initAreasModal() {
  $("btn-areas").addEventListener("click", () => {
    areasDraft = [...areas()];
    renderAreasModal();
    $("areas-backdrop").classList.add("open");
  });
  $("areas-close").addEventListener("click", () =>
    $("areas-backdrop").classList.remove("open")
  );
  $("areas-backdrop").addEventListener("click", (e) => {
    if (e.target === $("areas-backdrop")) $("areas-backdrop").classList.remove("open");
  });
  const addArea = () => {
    const v = $("area-new").value.trim().toLowerCase();
    if (v && !areasDraft.includes(v)) {
      areasDraft.push(v);
      areasDraft.sort();
      renderAreasModal();
    }
    $("area-new").value = "";
  };
  $("area-add").addEventListener("click", addArea);
  $("area-new").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addArea(); }
  });
  $("areas-save").addEventListener("click", async () => {
    try {
      await saveAreas(areasDraft, currentUser.email);
      areasOficiales = [...areasDraft].sort();
      toast("Áreas guardadas en config/areas", "success");
      $("areas-backdrop").classList.remove("open");
      refresh();
    } catch (err) {
      toast("Error guardando áreas: " + err.message, "error");
    }
  });
}

// --- Arranque ---
initAreasModal();
initEditor();
initToolbar();
initBulkBar();
$("btn-login").addEventListener("click", () => login().catch((e) => toast(e.message, "error")));
$("btn-logout").addEventListener("click", logout);

watchAuth((user, esAdmin) => {
  currentUser = user;
  $("view-login").classList.toggle("hidden", !!user && esAdmin);
  $("view-app").classList.toggle("hidden", !user || !esAdmin);
  $("login-denied").classList.toggle("hidden", !user || esAdmin);
  if (user && esAdmin) {
    $("user-email").textContent = user.email;
    loadData();
  } else if (user && !esAdmin) {
    logout();
  }
});
