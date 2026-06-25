// Orquestador del Manager de la Biblioteca.
import { login, logout, watchAuth } from "./auth.js";
import {
  fetchRecursos,
  createRecurso,
  updateRecurso,
  bulkUpdate,
  bulkDelete,
  deleteRecursoForever,
  fetchTaxonomia,
  saveTaxonomia,
} from "./db.js";
import { importClassroomExport } from "./importer.js";
import { toast } from "./ui/toast.js";
import { openEditor, initEditor } from "./ui/editor.js";
import {
  DEFAULT_TAXONOMIA,
  withDefaults,
  especialidadesDe,
  derivarCampos,
} from "./taxonomia.js";
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
let taxonomia = withDefaults(null);

// Taxonomía oficial (config/taxonomia); si aún no existe el doc, se siembra con
// la taxonomía por defecto.
async function loadTaxonomia() {
  const tax = await fetchTaxonomia();
  if (tax === null) {
    taxonomia = withDefaults(DEFAULT_TAXONOMIA);
    await saveTaxonomia(taxonomia, currentUser.email);
    toast("Taxonomía oficial creada en config/taxonomia", "success");
  } else {
    taxonomia = withDefaults(tax);
  }
}

function refresh() {
  fillFilterOptions(recursos);
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
    await loadTaxonomia();
    fillSelectOptions("bulk-disciplina", "Disciplina…", taxonomia.disciplinas);
    fillSelectOptions("bulk-categoria", "Categoría…", taxonomia.categorias);
    $("import-panel").classList.add("hidden");
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
  openEditor(recurso, taxonomia, async (editId, data) => {
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

// Rellena un <select> con opciones, conservando un placeholder inicial.
function fillSelectOptions(id, placeholder, values) {
  const sel = $(id);
  const current = sel.value;
  sel.innerHTML =
    `<option value="">${placeholder}</option>` +
    values.map((v) => `<option value="${v}">${v}</option>`).join("");
  sel.value = current;
}

function initBulkBar() {
  // La especialidad disponible depende de la disciplina elegida en la barra.
  $("bulk-disciplina").addEventListener("change", () => {
    const disc = $("bulk-disciplina").value;
    fillSelectOptions(
      "bulk-especialidad",
      "Especialidad…",
      disc ? especialidadesDe(taxonomia, disc) : []
    );
  });

  $("bulk-apply").addEventListener("click", () => {
    const data = {};
    const disc = $("bulk-disciplina").value;
    const esp = $("bulk-especialidad").value;
    const cat = $("bulk-categoria").value;
    if (disc) data.disciplina = disc;
    if (esp) {
      data.especialidad = esp;
      data.area = esp; // compat
    }
    if (cat) data.categoria = cat;
    if (!Object.keys(data).length) {
      toast("Elige al menos disciplina, especialidad o categoría.", "error");
      return;
    }
    handleBulk(data);
  });

  $("bulk-archive").addEventListener("click", () => handleBulk({ estado: "archivado" }));
  $("bulk-delete").addEventListener("click", async () => {
    // Solo elimina los seleccionados que ya están archivados (doble paso de seguridad).
    const archivados = [...selection].filter(
      (id) => recursos.find((r) => r.id === id)?.estado === "archivado"
    );
    const omitidos = selection.size - archivados.length;
    if (!archivados.length) {
      toast("Ninguno de los seleccionados está archivado. Archívalos primero.", "error");
      return;
    }
    if (!confirm(
      `¿Eliminar definitivamente ${archivados.length} recursos archivados?` +
      (omitidos ? `\n(${omitidos} seleccionados no están archivados y se omitirán.)` : "") +
      `\n\nEsta acción no se puede deshacer.`
    )) return;
    try {
      await bulkDelete(archivados);
      const borrados = new Set(archivados);
      recursos = recursos.filter((r) => !borrados.has(r.id));
      toast(`${archivados.length} recursos eliminados definitivamente`, "success");
      clearSelection();
      refresh();
    } catch (err) {
      toast("Error en eliminación masiva: " + err.message, "error");
    }
  });
  $("bulk-publish").addEventListener("click", () => handleBulk({ estado: "publicado" }));
  $("bulk-clear").addEventListener("click", clearSelection);
}

function initToolbar() {
  ["filter-search", "filter-disciplina", "filter-especialidad", "filter-categoria", "filter-estado"].forEach(
    (id) => $(id).addEventListener("input", refresh)
  );
  $("btn-new").addEventListener("click", () => handleEdit(null));
  $("btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(recursos, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `biblioteca-musicala-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });
  $("btn-import-toolbar").addEventListener("click", () => {
    $("import-panel").classList.toggle("hidden");
  });
  $("btn-import").addEventListener("click", async () => {
    if (!confirm("Importar los recursos faltantes de Classroom a Firestore? Los recursos que ya existen se omiten."))
      return;
    $("btn-import").disabled = true;
    try {
      const existingIds = recursos.map((r) => r.id);
      const result = await importClassroomExport(currentUser.email, (done, all, skipped) => {
        $("import-progress").textContent =
          all > 0
            ? `Importando... ${done}/${all} (${skipped} ya existian)`
            : `${skipped} recursos ya existian. No hay faltantes.`;
      }, existingIds, taxonomia);
      toast(
        `Importacion completa: ${result.imported} nuevos, ${result.skipped} omitidos`,
        "success"
      );
      await loadData();
    } catch (err) {
      toast("Error importando: " + err.message, "error");
    } finally {
      $("btn-import").disabled = false;
      $("import-progress").textContent = "";
    }
  });
}

// --- Gestor de la taxonomía oficial ---
let taxDraft = null;
let taxDiscSel = "musica"; // disciplina cuyas especialidades se editan

function renderTaxList(ulId, items, onDelete) {
  const ul = $(ulId);
  ul.innerHTML = items
    .map(
      (v, i) => `<li>${v}
        <button class="btn btn-small btn-ghost tax-del" data-i="${i}">✕</button></li>`
    )
    .join("");
  ul.querySelectorAll(".tax-del").forEach((b) =>
    b.addEventListener("click", () => {
      onDelete(Number(b.dataset.i));
    })
  );
}

function renderTaxModal() {
  // Selector de disciplina para la columna de especialidades.
  $("tax-disc-sel").innerHTML = taxDraft.disciplinas
    .map((d) => `<option value="${d}">${d}</option>`)
    .join("");
  if (!taxDraft.disciplinas.includes(taxDiscSel)) taxDiscSel = taxDraft.disciplinas[0];
  $("tax-disc-sel").value = taxDiscSel;

  renderTaxList("tax-disciplinas", taxDraft.disciplinas, (i) => {
    const removed = taxDraft.disciplinas[i];
    taxDraft.disciplinas.splice(i, 1);
    delete taxDraft.especialidades[removed];
    renderTaxModal();
  });

  const esp = taxDraft.especialidades[taxDiscSel] || ["general"];
  renderTaxList("tax-especialidades", esp, (i) => {
    esp.splice(i, 1);
    taxDraft.especialidades[taxDiscSel] = esp;
    renderTaxModal();
  });

  renderTaxList("tax-categorias", taxDraft.categorias, (i) => {
    taxDraft.categorias.splice(i, 1);
    renderTaxModal();
  });
  renderTaxList("tax-niveles", taxDraft.niveles, (i) => {
    taxDraft.niveles.splice(i, 1);
    renderTaxModal();
  });
}

const limpiar = (s) =>
  s.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, "-");

function initTaxModal() {
  $("btn-taxonomia").addEventListener("click", () => {
    // Copia profunda del estado actual para editar sin tocar el vivo.
    taxDraft = JSON.parse(JSON.stringify(taxonomia));
    renderTaxModal();
    $("tax-backdrop").classList.add("open");
  });
  $("tax-close").addEventListener("click", () => $("tax-backdrop").classList.remove("open"));
  $("tax-backdrop").addEventListener("click", (e) => {
    if (e.target === $("tax-backdrop")) $("tax-backdrop").classList.remove("open");
  });
  $("tax-disc-sel").addEventListener("change", (e) => {
    taxDiscSel = e.target.value;
    renderTaxModal();
  });

  const addTo = (inputId, getArr) => {
    const v = limpiar($(inputId).value);
    if (v && !getArr().includes(v)) {
      getArr().push(v);
      getArr().sort();
      renderTaxModal();
    }
    $(inputId).value = "";
  };
  $("tax-disciplina-add").addEventListener("click", () => {
    const v = limpiar($("tax-disciplina-new").value);
    if (v && !taxDraft.disciplinas.includes(v)) {
      taxDraft.disciplinas.push(v);
      taxDraft.disciplinas.sort();
      if (!taxDraft.especialidades[v]) taxDraft.especialidades[v] = ["general"];
      renderTaxModal();
    }
    $("tax-disciplina-new").value = "";
  });
  $("tax-especialidad-add").addEventListener("click", () =>
    addTo("tax-especialidad-new", () => (taxDraft.especialidades[taxDiscSel] ||= ["general"]))
  );
  $("tax-categoria-add").addEventListener("click", () =>
    addTo("tax-categoria-new", () => taxDraft.categorias)
  );
  $("tax-nivel-add").addEventListener("click", () =>
    addTo("tax-nivel-new", () => taxDraft.niveles)
  );

  $("tax-save").addEventListener("click", async () => {
    try {
      await saveTaxonomia(taxDraft, currentUser.email);
      taxonomia = withDefaults(taxDraft);
      toast("Taxonomía guardada en config/taxonomia", "success");
      $("tax-backdrop").classList.remove("open");
      refresh();
    } catch (err) {
      toast("Error guardando taxonomía: " + err.message, "error");
    }
  });

  $("tax-normalizar").addEventListener("click", normalizarRecursos);
}

// Deriva disciplina/especialidad/categoría/nivel en los recursos que aún no los
// tienen, a partir de su `area`/`tipo`/texto. No pisa lo ya clasificado a mano.
async function normalizarRecursos() {
  const pendientes = recursos.filter((r) => !r.disciplina || !r.especialidad);
  if (!pendientes.length) {
    toast("Todos los recursos ya tienen los campos nuevos.", "success");
    return;
  }
  if (!confirm(
    `Se derivarán los campos nuevos en ${pendientes.length} recursos a partir de su área y texto.\n` +
    `Podrás revisarlos y corregirlos después. ¿Continuar?`
  )) return;
  try {
    let n = 0;
    for (const r of pendientes) {
      const campos = derivarCampos(r, taxonomia);
      const data = {
        ...campos,
        area: campos.especialidad, // compat
        publico: r.publico?.length ? r.publico : ["estudiantes"],
      };
      await updateRecurso(r.id, data, currentUser.email);
      Object.assign(r, data);
      n++;
    }
    toast(`${n} recursos normalizados.`, "success");
    refresh();
  } catch (err) {
    toast("Error normalizando: " + err.message, "error");
  }
}

// --- Arranque ---
initTaxModal();
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
