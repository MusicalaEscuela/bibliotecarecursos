import { proponerOrganizacion, CATEGORIAS_ADICIONALES } from "../organizacion.js";
const BASE = "https://firestore.googleapis.com/v1/projects/biblioteca-guitarra-fa182/databases/(default)/documents";
const PREFIJO = BASE.replace("https://firestore.googleapis.com/v1/", "");
const valor = v => v.arrayValue ? (v.arrayValue.values || []).map(valor) : v.mapValue ? campos(v.mapValue.fields || {}) : "integerValue" in v ? Number(v.integerValue) : "nullValue" in v ? null : Object.values(v)[0];
const campos = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, valor(v)]));
function codificar(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(codificar) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, codificar(x)])) } };
}
export function abrirOrganizador(user, onComplete) {
  document.getElementById("organizador-backdrop")?.remove();
  const modal = document.createElement("div");
  modal.id = "organizador-backdrop";
  modal.className = "modal-backdrop open";
  modal.innerHTML = `<div class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="organizador-title">
    <h2 id="organizador-title">Organizar catálogo</h2>
    <p>Completa categorías y fichas con sus metadatos, recupera enlaces del export original y separa la dificultad desconocida del nivel inicial. Cada registro conserva su ID. Los adjuntos quedan pendientes de revisión pedagógica.</p>
    <p id="organizador-paso" role="status" style="font-weight:700">Paso 1 de 3: prepara el plan. Todavía no se ha guardado ningún cambio.</p>
    <progress id="organizador-progreso" max="100" value="0" hidden style="width:100%" aria-label="Documentos guardados"></progress>
    <pre class="sync-resumen" id="organizador-status" aria-live="polite">Prepara el plan para ver el alcance exacto.</pre>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" id="organizador-cerrar">Cerrar</button><button type="button" class="btn" id="organizador-preparar">Preparar plan</button><button type="button" class="btn" id="organizador-respaldo" disabled>Descargar respaldo y plan</button><button type="button" class="btn btn-primary" id="organizador-aplicar" disabled>Aplicar organización</button></div>
  </div>`;
  document.body.append(modal);
  const el = id => modal.querySelector(`#organizador-${id}`);
  const status = el("status");
  const paso = el("paso");
  const progreso = el("progreso");
  let plan, respaldo, recibos = [], ocupado = false;
  const HISTORIAL = "musicala.catalogo.organizacion.ultima";
  const recordar = datos => { try { localStorage.setItem(HISTORIAL, JSON.stringify({ ...datos, fecha: new Date().toISOString() })); } catch {} };
  try {
    const anterior = JSON.parse(localStorage.getItem(HISTORIAL) || "null");
    if (anterior) paso.textContent = anterior.estado === "completado"
      ? `La última ejecución terminó: ${anterior.confirmados} documentos guardados. Prepara un plan nuevo para comprobar si quedan cambios pendientes.`
      : `Hay una ejecución anterior sin finalización confirmada (${anterior.confirmados || 0} documentos confirmados). Prepara un plan nuevo para comprobar lo que falta.`;
  } catch {}
  const cerrar = () => { if (!ocupado) modal.remove(); };
  el("cerrar").onclick = cerrar;
  modal.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(); });
  el("preparar").focus();
  async function request(url, options = {}) {
    let temporizador;
    const token = await Promise.race([
      user.getIdToken(),
      new Promise((_, reject) => { temporizador = setTimeout(() => reject(Error("La sesión no respondió. Vuelve a iniciar sesión y prepara un plan nuevo.")), 30000); }),
    ]).finally(() => clearTimeout(temporizador));
    const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Firestore ${response.status}: ${(await response.text()).slice(0, 350)}`);
    return response.json();
  }
  function descargar() {
    const blob = new Blob([JSON.stringify({ respaldo, plan, recibos }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `biblioteca-organizacion-${recibos.length ? "resultado" : "respaldo"}-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  el("respaldo").onclick = () => {
    descargar();
    el("aplicar").disabled = ocupado || !plan?.cambios.length || recibos.length > 0;
    if (!el("aplicar").disabled) paso.textContent = "Paso 3 de 3: comprueba que se descargó el respaldo y pulsa Aplicar organización. Todavía no se ha guardado ningún cambio.";
  };
  el("preparar").onclick = async () => {
    ocupado = true; el("preparar").disabled = true; el("aplicar").disabled = true; el("respaldo").disabled = true;
    recibos = []; plan = null; respaldo = null;
    el("aplicar").textContent = "Aplicar organización";
    paso.textContent = "Preparando el plan… Solo se están leyendo los datos.";
    progreso.hidden = true;
    try {
      const originalesResponse = await fetch("./data/classroom-export.json");
      if (!originalesResponse.ok) throw Error("No se pudo leer el export original");
      const originales = await originalesResponse.json();
      const porId = new Map((originales.resources || []).map(r => [`cr-${r.id}`, r]));
      const documentos = []; let token = "";
      do {
        status.textContent = `Leyendo catálogo: ${documentos.length} registros…`;
        const pagina = await request(`${BASE}/recursos?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`);
        documentos.push(...(pagina.documents || [])); token = pagina.nextPageToken || "";
      } while (token);
      const taxonomia = await request(`${BASE}/config/taxonomia`);
      const cambios = documentos.map(d => {
        const id = d.name.split("/").pop();
        return { name: d.name, updateTime: d.updateTime, patch: proponerOrganizacion({ id, ...campos(d.fields || {}) }, porId.get(id)) };
      }).filter(c => Object.keys(c.patch).length);
      const actual = campos(taxonomia.fields || {});
      const taxPatch = {
        niveles: [...new Set([...(actual.niveles || []), "por-evaluar"])],
        categorias: [...new Set([...(actual.categorias || []), ...CATEGORIAS_ADICIONALES])],
        objetivos: [...new Set([...(actual.objetivos || []), ...cambios.flatMap(c => c.patch.objetivos || [])])].sort(),
        formatos: [...new Set([...(actual.formatos || []), ...cambios.flatMap(c => c.patch.formatos || [])])].sort(),
      };
      respaldo = { fecha: new Date().toISOString(), documentos, taxonomia };
      plan = { cambios, taxonomia: { name: taxonomia.name, updateTime: taxonomia.updateTime, patch: taxPatch } };
      const contar = campo => cambios.filter(c => campo in c.patch).length;
      status.textContent = `Catálogo: ${documentos.length} registros\nFichas a organizar: ${cambios.length}\nCategorías: ${contar("categoria")}\nDescripciones nuevas o corregidas: ${contar("descripcion")}\nDificultades sin fuente → por evaluar: ${contar("nivel")}\nRecursos con enlaces recuperados: ${contar("enlaces")}\nObjetivos: ${contar("objetivos")}\nFormatos: ${contar("formatos")}\nFilas inválidas a archivar (recuperables): ${contar("motivoArchivo")}\n\nDescarga el respaldo antes de aplicar. No se elimina ningún registro.`;
      el("respaldo").disabled = false;
      paso.textContent = cambios.length ? "Paso 2 de 3: descarga el respaldo para habilitar Aplicar organización. Todavía no se ha guardado ningún cambio." : "No hay fichas pendientes de organizar. No hace falta aplicar otra vez.";
    } catch (error) { paso.textContent = "No se pudo preparar el plan. No se guardó ningún cambio."; status.textContent = `No se preparó el plan: ${error.message}`; }
    finally { ocupado = false; el("preparar").disabled = false; }
  };
  el("aplicar").onclick = async () => {
    if (ocupado || !plan || !respaldo || recibos.length) return;
    ocupado = true; el("aplicar").disabled = true; el("preparar").disabled = true; el("cerrar").disabled = true;
    el("aplicar").textContent = "Aplicando…";
    el("respaldo").disabled = true;
    paso.textContent = "Organización en curso. Mantén esta ventana abierta.";
    progreso.hidden = false; progreso.value = 0;
    modal.setAttribute("aria-busy", "true");
    recordar({ estado: "en-curso", confirmados: 0 });
    // Deja que el navegador muestre el estado antes de preparar las escrituras.
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      const operaciones = [plan.taxonomia, ...plan.cambios].map(c => {
        if (!c.name.startsWith(`${PREFIJO}/recursos/`) && c.name !== `${PREFIJO}/config/taxonomia`) throw Error("Documento fuera del catálogo");
        return {
          update: { name: c.name, fields: Object.fromEntries(Object.entries({ ...c.patch, actualizadoPor: user.email }).map(([k, v]) => [k, codificar(v)])) },
          updateMask: { fieldPaths: [...Object.keys(c.patch), "actualizadoPor"] },
          currentDocument: { updateTime: c.updateTime },
          updateTransforms: [{ fieldPath: "actualizadoEn", setToServerValue: "REQUEST_TIME" }],
        };
      });
      for (let i = 0; i < operaciones.length; i += 150) {
        const lote = operaciones.slice(i, i + 150);
        status.textContent = `Aplicando ${i + 1}–${Math.min(i + 150, operaciones.length)} de ${operaciones.length} documentos…`;
        const resultado = await request(`${BASE}:commit`, { method: "POST", body: JSON.stringify({ writes: lote }) });
        recibos.push({ nombres: lote.map(w => w.update.name), ...resultado });
        const confirmados = recibos.reduce((total, r) => total + r.nombres.length, 0);
        progreso.value = Math.round(confirmados / operaciones.length * 100);
        paso.textContent = `Guardados ${confirmados} de ${operaciones.length} documentos (${progreso.value} %). Organización en curso…`;
        recordar({ estado: "en-curso", confirmados, total: operaciones.length });
      }
      paso.textContent = "Organización completada y guardada en Firebase.";
      progreso.value = 100;
      el("aplicar").textContent = "Organización completada";
      recordar({ estado: "completado", confirmados: operaciones.length, total: operaciones.length });
      status.textContent = `COMPLETADO: ${plan.cambios.length} fichas organizadas y taxonomía actualizada.\nIDs y asignaciones conservados. Contenido de adjuntos pendiente de revisión pedagógica.\nDescarga el resultado para conservar los comprobantes.`;
      el("respaldo").textContent = "Descargar resultado y comprobantes";
      await onComplete?.();
    } catch (error) {
      paso.textContent = "El proceso se detuvo. Revisa el mensaje y prepara un plan nuevo antes de continuar.";
      el("aplicar").textContent = "Proceso detenido";
      recordar({ estado: "detenido", confirmados: recibos.reduce((total, r) => total + r.nombres.length, 0) });
      status.textContent = `Proceso detenido: ${error.message}\nLotes confirmados: ${recibos.length}. Descarga el resultado y prepara un plan nuevo para los registros restantes.`;
      el("preparar").disabled = false;
    }
    finally { ocupado = false; modal.setAttribute("aria-busy", "false"); el("cerrar").disabled = false; el("respaldo").disabled = false; }
  };
}
