import { DEFAULT_TAXONOMIA } from "./taxonomia.js";
import { doc, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js';
import { db } from './db.js';
import { planificarJuegos } from './juegos.js';

export async function sincronizarJuegos(catalog, userEmail) {
  // Todas las lecturas preceden a las escrituras. Si otro admin importa al mismo
  // tiempo, Firestore reintenta y conserva las fichas que ya existan.
  return runTransaction(db, async transaction => {
    const entries = planificarJuegos(catalog).crear;
    const refs = entries.map(entry => doc(db, 'recursos', entry.id));
    const taxRef = doc(db, 'config', 'taxonomia');
    const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
    const taxSnapshot = await transaction.get(taxRef);
    const existing = snapshots.filter(snap => snap.exists()).map(snap => ({ ...snap.data(), id: snap.id }));
    const plan = planificarJuegos(catalog, existing);
    for (const { id, data } of plan.crear) transaction.set(doc(db, 'recursos', id), { ...data, creadoEn: serverTimestamp(), actualizadoEn: serverTimestamp(), actualizadoPor: userEmail });
    const tax = taxSnapshot.data() || DEFAULT_TAXONOMIA;
    const categorias = [...new Set([...(tax.categorias || []), 'juegos'])];
    const disciplinas = [...new Set([...(tax.disciplinas || []), 'interdisciplinar'])];
    const especialidades = { ...(tax.especialidades || {}), interdisciplinar: [...new Set([...(tax.especialidades?.interdisciplinar || []), 'general'])] };
    if (!tax.categorias?.includes('juegos') || !tax.disciplinas?.includes('interdisciplinar') || !tax.especialidades?.interdisciplinar?.includes('general')) transaction.set(taxRef, { categorias, disciplinas, especialidades, actualizadoEn: serverTimestamp(), actualizadoPor: userEmail }, { merge: true });
    return { creados: plan.crear.length, conservados: plan.conservar.length, total: plan.total };
  });
}
