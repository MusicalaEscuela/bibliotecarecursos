// Sugerencias de recursos: formulario del docente y panel de revisión del admin.
import { especialidadesDe } from "../taxonomia.js";

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

const fillSelect = (sel, valores, seleccionado) => {
  sel.innerHTML = valores.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  sel.value = seleccionado || valores[0] || "";
};

// Parsea el textarea de enlaces ("nombre | url" por línea).
const parseEnlaces = (texto) =>
  texto
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [titulo, url] = line.split("|").map((s) => s.trim());
      return url ? { titulo, url } : { titulo: "", url: titulo };
    });

const fecha = (ts) =>
  ts?.toDate ? ts.toDate().toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "";

// --- Formulario del docente ---

let taxonomia = null;

export function initSugerenciaForm(tax, onSubmit) {
  taxonomia = tax;
  fillSelect($("s-disciplina"), taxonomia.disciplinas, "musica");
  fillSelect($("s-especialidad"), especialidadesDe(taxonomia, "musica"), "general");
  // La categoría puede quedar en blanco: si el docente no la sabe, la define el admin.
  fillSelect($("s-categoria"), ["", ...taxonomia.categorias], "");
  $("s-categoria").options[0].textContent = "(que la defina el equipo)";
  fillSelect($("s-nivel"), taxonomia.niveles, "todos");

  $("s-disciplina").addEventListener("change", () => {
    fillSelect($("s-especialidad"), especialidadesDe(taxonomia, $("s-disciplina").value));
  });

  $("sug-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const titulo = $("s-titulo").value.trim();
    if (!titulo) return;
    const especialidad = $("s-especialidad").value;
    const data = {
      titulo,
      descripcion: $("s-descripcion").value.trim(),
      disciplina: $("s-disciplina").value,
      especialidad,
      area: especialidad, // compat con las apps que aún leen `area`
      categoria: $("s-categoria").value,
      nivel: $("s-nivel").value,
      nota: $("s-nota").value.trim(),
      etiquetas: $("s-etiquetas").value.split(",").map((t) => t.trim()).filter(Boolean),
      enlaces: parseEnlaces($("s-enlaces").value),
    };
    $("sug-submit").disabled = true;
    try {
      await onSubmit(data);
      resetSugerenciaForm();
    } catch {
      // El llamador ya avisó del error; se conserva lo escrito para reintentar.
    } finally {
      $("sug-submit").disabled = false;
    }
  });
}

export function resetSugerenciaForm() {
  ["s-titulo", "s-descripcion", "s-enlaces", "s-etiquetas", "s-nota"].forEach((id) => ($(id).value = ""));
  $("s-titulo").focus();
}

// --- Render de la lista (la usan el docente y el admin) ---

const badgeEstado = {
  pendiente: "badge-borrador",
  aceptada: "badge-publicado",
  rechazada: "badge-archivado",
};

function cardHTML(s, esAdmin) {
  const enlaces = (s.enlaces || [])
    .map((e) => `<li><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.titulo || e.url)}</a></li>`)
    .join("");
  return `
    <article class="sug-card" data-id="${esc(s.id)}">
      <div class="sug-head">
        <strong>${esc(s.titulo)}</strong>
        <span class="badge ${badgeEstado[s.estado] || "badge-archivado"}">${esc(s.estado)}</span>
      </div>
      <div class="cell-sub">
        ${esc([s.disciplina, s.especialidad, s.categoria, s.nivel].filter(Boolean).join(" · "))}
        ${esAdmin ? ` — ${esc(s.creadoPorNombre || s.creadoPor)}` : ""}
        ${fecha(s.creadoEn) ? ` · ${esc(fecha(s.creadoEn))}` : ""}
      </div>
      ${s.descripcion ? `<p class="sug-text">${esc(s.descripcion)}</p>` : ""}
      ${s.nota ? `<p class="sug-text sug-nota">Nota: ${esc(s.nota)}</p>` : ""}
      ${enlaces ? `<ul class="sug-links">${enlaces}</ul>` : ""}
      ${s.motivo ? `<p class="sug-text sug-nota">Respuesta del equipo: ${esc(s.motivo)}</p>` : ""}
      ${
        esAdmin && s.estado === "pendiente"
          ? `<div class="sug-actions">
               <button class="btn btn-small btn-primary act-aceptar">Revisar y aceptar</button>
               <button class="btn btn-small act-rechazar">Rechazar</button>
             </div>`
          : ""
      }
      ${
        esAdmin && s.estado !== "pendiente"
          ? `<div class="sug-actions">
               <button class="btn btn-small btn-danger act-eliminar">Eliminar sugerencia</button>
             </div>`
          : ""
      }
    </article>`;
}

export function renderSugerencias(containerId, lista, { esAdmin = false, onAceptar, onRechazar, onEliminar } = {}) {
  const host = $(containerId);
  if (!lista.length) {
    host.innerHTML = `<p class="modal-hint">${
      esAdmin ? "No hay sugerencias con ese estado." : "Todavía no has enviado sugerencias."
    }</p>`;
    return;
  }
  host.innerHTML = lista.map((s) => cardHTML(s, esAdmin)).join("");
  host.querySelectorAll(".sug-card").forEach((card) => {
    const id = card.dataset.id;
    card.querySelector(".act-aceptar")?.addEventListener("click", () => onAceptar?.(id));
    card.querySelector(".act-rechazar")?.addEventListener("click", () => onRechazar?.(id));
    card.querySelector(".act-eliminar")?.addEventListener("click", () => onEliminar?.(id));
  });
}

// Convierte una sugerencia en el borrador de recurso que verá el editor.
// Nace como "borrador": el admin decide cuándo publicarlo.
export const sugerenciaARecurso = (s) => ({
  titulo: s.titulo || "",
  descripcion: s.descripcion || "",
  disciplina: s.disciplina || "musica",
  especialidad: s.especialidad || "general",
  area: s.especialidad || "general",
  categoria: s.categoria || "",
  nivel: s.nivel || "todos",
  etiquetas: s.etiquetas || [],
  enlaces: s.enlaces || [],
  estado: "borrador",
  esDeMusicala: true,
});
