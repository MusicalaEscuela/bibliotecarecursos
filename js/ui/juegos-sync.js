import { fetchRecursos } from '../db.js';
import { planificarJuegos } from '../juegos.js';
import { sincronizarJuegos } from '../juegos-sync.js';

export function initJuegosSync({ getUser, onComplete }) {
  document.getElementById('btn-sync-juegos')?.addEventListener('click', async () => {
    if (document.getElementById('juegos-sync-dialog')) return;
    const dialog = document.createElement('dialog'); dialog.id = 'juegos-sync-dialog';
    dialog.style.cssText = 'box-sizing:border-box;width:min(680px,calc(100% - 32px));max-height:85dvh;overflow:auto;border:1px solid #ddd;border-radius:18px;padding:24px;font:inherit';
    dialog.innerHTML = `<h2>Juegos en la Biblioteca</h2><p>Una ficha por juego, disponible para todos los estudiantes de su disciplina. Los materiales existentes se conservan.</p><p data-summary role="status">Revisando catálogo y recursos actuales…</p><ul data-games style="max-height:35dvh;overflow:auto"></ul><div style="display:flex;gap:12px;flex-wrap:wrap"><button type="button" class="btn btn-ghost" data-close>Cerrar</button><button type="button" class="btn" data-apply disabled>Añadir juegos a la Biblioteca</button></div>`;
    document.body.append(dialog); dialog.showModal();
    let applying = false;
    const close = () => { if (!applying) { dialog.close(); dialog.remove(); } };
    dialog.querySelector('[data-close]').onclick = close;
    dialog.addEventListener('cancel', event => { if (applying) event.preventDefault(); });
    dialog.addEventListener('close', () => dialog.remove());
    const summary = dialog.querySelector('[data-summary]'); const apply = dialog.querySelector('[data-apply]');
    try {
      const response = await fetch(new URL('../../data/juegos-musicala.json', import.meta.url), { cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo leer el catálogo de juegos');
      const catalog = await response.json();
      const plan = planificarJuegos(catalog, await fetchRecursos());
      summary.textContent = `${plan.total} juegos · ${plan.crear.length} nuevos · ${plan.conservar.length} ya disponibles. No se borrarán ni sobrescribirán recursos.`;
      catalog.games.forEach(game => { const li = document.createElement('li'); li.textContent = `${game.title} · ${game.disciplinas.join(' / ')}`; dialog.querySelector('[data-games]').append(li); });
      apply.disabled = !plan.crear.length;
      apply.onclick = async () => {
        const user = getUser(); if (!user) { summary.textContent = 'Inicia sesión como administrador para continuar.'; return; }
        applying = true; apply.disabled = true; dialog.querySelector('[data-close]').disabled = true;
        summary.textContent = 'Añadiendo juegos a la Biblioteca…';
        try {
          const result = await sincronizarJuegos(catalog, user.email);
          summary.textContent = `Listo: ${result.creados} juegos añadidos · ${result.conservados} conservados · ${result.total} disponibles.`;
          await onComplete();
        } catch (error) { summary.textContent = `No se completó la importación: ${error.message}. Puedes volver a revisar sin duplicar juegos.`; apply.disabled = false; }
        finally { applying = false; dialog.querySelector('[data-close]').disabled = false; }
      };
    } catch (error) { summary.textContent = `Error: ${error.message}`; }
  });
}
