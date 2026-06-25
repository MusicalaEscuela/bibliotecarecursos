// Importa el export de Classroom (data/classroom-export.json) a Firestore.
// Es idempotente: usa el id de Classroom como id del documento, así que
// re-ejecutarla actualiza en vez de duplicar.
import { bulkSet } from "./db.js";
import { derivarCampos } from "./taxonomia.js";

function mapResource(r, taxonomia) {
  const base = {
    titulo: r.title || "(sin título)",
    descripcion: r.description || "",
    area: (r.courseShort || "").toLowerCase() || "sin-area",
    tipo: r.workType || r.recordType || "otro",
    tema: r.topic || "",
    etiquetas: r.tags || [],
    enlaces: (r.attachments || []).map((a) => ({
      titulo: a.name || "",
      url: a.url || "",
      tipo: a.type || "",
      thumbnail: a.thumbnail || "",
    })),
    esDeMusicala: true,
    estado: "publicado",
    origen: {
      fuente: "classroom",
      curso: r.course || "",
      classroomUrl: r.classroomUrl || "",
      creadoEnClassroom: r.createdAt || "",
    },
  };
  // Clasificación nueva derivada del texto/área de Classroom.
  const campos = derivarCampos(base, taxonomia);
  return { ...base, ...campos, area: campos.especialidad, publico: ["estudiantes"] };
}

export async function importClassroomExport(userEmail, onProgress, existingIds = [], taxonomia) {
  const res = await fetch("./data/classroom-export.json");
  if (!res.ok) throw new Error("No se pudo leer data/classroom-export.json");
  const json = await res.json();
  const existing = new Set(existingIds);
  const allItems = (json.resources || []).map((r) => ({
    id: `cr-${r.id}`,
    data: mapResource(r, taxonomia),
  }));
  const items = allItems.filter((item) => !existing.has(item.id));
  let done = 0;
  for (let i = 0; i < items.length; i += 450) {
    const chunk = items.slice(i, i + 450);
    await bulkSet(chunk, userEmail);
    done += chunk.length;
    onProgress?.(done, items.length, allItems.length - items.length);
  }
  return {
    total: allItems.length,
    imported: items.length,
    skipped: allItems.length - items.length,
  };
}
