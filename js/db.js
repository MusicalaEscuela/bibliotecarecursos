// Acceso a Firestore: CRUD de la colección "recursos".
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { app } from "./auth.js";

export const db = getFirestore(app);
const recursosCol = collection(db, "recursos");
const sugerenciasCol = collection(db, "sugerencias");

// Lista oficial de áreas en config/areas { lista: [...] }.
const areasRef = () => doc(db, "config", "areas");

export async function fetchAreas() {
  const snap = await getDoc(areasRef());
  return snap.exists() ? snap.data().lista || [] : null; // null = aún no existe
}

export async function saveAreas(lista, userEmail) {
  await setDoc(areasRef(), {
    lista: [...new Set(lista)].sort(),
    actualizadoEn: serverTimestamp(),
    actualizadoPor: userEmail,
  });
}

// Taxonomía oficial (disciplinas, especialidades, categorías, niveles) en
// config/taxonomia. null = aún no existe (se siembra con DEFAULT_TAXONOMIA).
const taxonomiaRef = () => doc(db, "config", "taxonomia");

export async function fetchTaxonomia() {
  const snap = await getDoc(taxonomiaRef());
  return snap.exists() ? snap.data() : null;
}

export async function saveTaxonomia(tax, userEmail) {
  await setDoc(taxonomiaRef(), {
    ...tax,
    actualizadoEn: serverTimestamp(),
    actualizadoPor: userEmail,
  });
}

export async function fetchRecursos() {
  const snap = await getDocs(query(recursosCol, orderBy("titulo")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createRecurso(data, userEmail) {
  const ref = doc(recursosCol);
  await setDoc(ref, {
    ...data,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
    actualizadoPor: userEmail,
  });
  return ref.id;
}

export async function updateRecurso(id, data, userEmail) {
  await updateDoc(doc(recursosCol, id), {
    ...data,
    actualizadoEn: serverTimestamp(),
    actualizadoPor: userEmail,
  });
}

// "Eliminar" suave: archiva el recurso (las apps lectoras ignoran archivados).
export const archiveRecurso = (id, userEmail) =>
  updateRecurso(id, { estado: "archivado" }, userEmail);

// Eliminación definitiva (usar con cuidado).
export const deleteRecursoForever = (id) => deleteDoc(doc(recursosCol, id));

// Actualización masiva: aplica los mismos campos a varios ids.
export async function bulkUpdate(ids, data, userEmail) {
  // Firestore limita los batch a 500 operaciones.
  for (let i = 0; i < ids.length; i += 450) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + 450)) {
      batch.update(doc(recursosCol, id), {
        ...data,
        actualizadoEn: serverTimestamp(),
        actualizadoPor: userEmail,
      });
    }
    await batch.commit();
  }
}

// Eliminación masiva definitiva.
export async function bulkDelete(ids) {
  for (let i = 0; i < ids.length; i += 450) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + 450)) {
      batch.delete(doc(recursosCol, id));
    }
    await batch.commit();
  }
}

// --- Sugerencias (colección "sugerencias") ---
// Las crea cualquier docente autenticado; solo los admins las leen todas y las
// resuelven. Se ordenan en memoria (son pocas) para no exigir índices.

const porFechaDesc = (a, b) =>
  (b.creadoEn?.toMillis?.() || 0) - (a.creadoEn?.toMillis?.() || 0);

export async function createSugerencia(data, user) {
  const ref = doc(sugerenciasCol);
  await setDoc(ref, {
    ...data,
    estado: "pendiente",
    creadoPor: (user.email || "").toLowerCase(),
    creadoPorNombre: user.displayName || "",
    creadoEn: serverTimestamp(),
  });
  return ref.id;
}

// Todas las sugerencias (solo admins pueden leerlas).
export async function fetchSugerencias() {
  const snap = await getDocs(sugerenciasCol);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(porFechaDesc);
}

// Las sugerencias del propio usuario (lo único que un docente puede leer).
export async function fetchMisSugerencias(email) {
  const snap = await getDocs(
    query(sugerenciasCol, where("creadoPor", "==", (email || "").toLowerCase()))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(porFechaDesc);
}

export async function resolveSugerencia(id, data, userEmail) {
  await updateDoc(doc(sugerenciasCol, id), {
    ...data,
    revisadoEn: serverTimestamp(),
    revisadoPor: userEmail,
  });
}

export const deleteSugerencia = (id) => deleteDoc(doc(sugerenciasCol, id));

// Escritura masiva con ids fijos (para la importación, idempotente).
export async function bulkSet(items, userEmail) {
  for (let i = 0; i < items.length; i += 450) {
    const batch = writeBatch(db);
    for (const { id, data } of items.slice(i, i + 450)) {
      batch.set(doc(recursosCol, id), {
        ...data,
        actualizadoEn: serverTimestamp(),
        actualizadoPor: userEmail,
      });
    }
    await batch.commit();
  }
}

// Sincronización del repertorio: escribe el plan de planificarSync() en lotes.
// Las nuevas se crean completas; las existentes se actualizan con merge, así
// que `estado`, `publico` y `creadoEn` no se pisan. Un lote que falla no
// detiene los demás: se informa en `errores`.
export async function upsertCanciones(plan, userEmail, onProgress) {
  const ops = [
    ...plan.crear.map((x) => ({ ...x, nueva: true })),
    ...plan.actualizar.map((x) => ({ ...x, nueva: false })),
  ];
  const res = { creadas: 0, actualizadas: 0, errores: [] };
  for (let i = 0; i < ops.length; i += 400) {
    const lote = ops.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const { id, data, nueva } of lote) {
      const meta = { actualizadoEn: serverTimestamp(), actualizadoPor: userEmail };
      if (nueva) batch.set(doc(recursosCol, id), { ...data, ...meta, creadoEn: serverTimestamp() });
      else batch.set(doc(recursosCol, id), { ...data, ...meta }, { merge: true });
    }
    try {
      await batch.commit();
      for (const op of lote) op.nueva ? res.creadas++ : res.actualizadas++;
    } catch (err) {
      res.errores.push(`Lote ${i / 400 + 1} (${lote.length} canciones): ${err.message}`);
    }
    onProgress?.(Math.min(i + lote.length, ops.length), ops.length);
  }
  return res;
}
