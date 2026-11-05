// Catálogo canónico: una ficha por juego, sin tocar los materiales históricos.
export const DISCIPLINAS_JUEGOS = ['musica', 'danza', 'teatro', 'artes-plasticas'];
const nombres = { musica: 'Música', danza: 'Danzas', teatro: 'Teatro', 'artes-plasticas': 'Artes plásticas' };
export function urlJuego(value) {
  const url = new URL(String(value));
  if (url.protocol !== 'https:' || !['musicalaescuela.github.io', 'alekcaballero20.github.io'].includes(url.hostname)) throw new Error('Enlace de juego no permitido');
  url.hash = ''; url.search = '';
  return url.href.replace(/\/$/, '').toLowerCase();
}
export function idJuego(game) {
  return 'juego-' + urlJuego(game.url).replace('https://', '').replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
}
export function recursoJuego(game, version) {
  const disciplinas = [...new Set(game.disciplinas || [])];
  if (!disciplinas.length || disciplinas.some(d => !DISCIPLINAS_JUEGOS.includes(d))) throw new Error(`Disciplina inválida: ${game.title}`);
  if (!game.title?.trim() || !game.description?.trim()) throw new Error('Juego sin título o descripción');
  const url = urlJuego(game.url) + '/';
  const nivel = { Inicial: 'inicial', Básico: 'basico', Intermedio: 'intermedio', Avanzado: 'avanzado' }[game.level] || 'por-evaluar';
  return {
    titulo: game.title, descripcion: game.description, tipo: 'Juego', categoria: 'juegos',
    disciplina: disciplinas.length === 1 ? disciplinas[0] : 'interdisciplinar', disciplinas,
    especialidad: 'general', area: disciplinas.length === 1 ? nombres[disciplinas[0]] : 'Interdisciplinar',
    tema: 'Juegos', nivel, publico: ['estudiantes', 'docentes'], estado: 'publicado', esDeMusicala: true,
    etiquetas: [...new Set(['juegos', 'juego', ...disciplinas.map(d => nombres[d]), game.skill, ...(game.tags || [])].filter(Boolean))],
    enlaces: [{ titulo: 'Jugar', tipo: 'juego', url }],
    juego: { habilidad: game.skill || '', nivelOriginal: game.level || '', edadSugerida: game.age || '', objetivo: game.mission || '', instrucciones: game.howToPlay || '', reto: game.challenge || '', actividadClase: game.classMode || '' },
    origen: { fuente: 'musijuegos', catalogo: game.source, versionCatalogo: version, juegoId: game.id },
  };
}
export function planificarJuegos(catalog, existentes = []) {
  if (!Array.isArray(catalog?.games) || !catalog.games.length || catalog.games.length > 100) throw new Error('Catálogo de juegos inválido');
  const ids = new Set(); const urls = new Set(); const byId = new Map(existentes.map(r => [r.id, r]));
  const crear = []; const conservar = [];
  for (const game of catalog.games) {
    const id = idJuego(game); const url = urlJuego(game.url); const data = recursoJuego(game, catalog.version);
    if (ids.has(id) || urls.has(url)) throw new Error(`Juego repetido en el catálogo: ${game.title}`);
    ids.add(id); urls.add(url);
    const existing = byId.get(id);
    if (existing) {
      if (existing.origen?.fuente !== 'musijuegos') throw new Error(`ID ocupado por otro recurso: ${id}`);
      conservar.push({ id, titulo: existing.titulo });
    } else crear.push({ id, data });
  }
  return { crear, conservar, total: ids.size };
}
