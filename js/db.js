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
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { app } from "./auth.js";

export const db = getFirestore(app);
const recursosCol = collection(db, "recursos");

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
