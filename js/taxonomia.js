// Taxonomía oficial de la biblioteca de recursos.
//
// Cuatro ejes para clasificar un recurso, todos con listas CERRADAS para que
// el Manager y el HUB de estudiantes hablen el mismo idioma y dejen de adivinar
// por texto libre:
//
//   disciplina    -> el arte grande (música, danza, teatro…)
//   especialidad  -> lo que el estudiante practica (piano, ballet…) o "general"
//   categoria     -> el tipo pedagógico del recurso (técnica, repertorio…)
//   nivel         -> inicial / básico / intermedio / avanzado / todos
//
// La lista vive en Firestore (config/taxonomia) y es editable desde el Manager.
// DEFAULT_TAXONOMIA es la semilla que se guarda la primera vez.

export const DEFAULT_TAXONOMIA = {
  disciplinas: [
    "musica",
    "danza",
    "teatro",
    "artes-plasticas",
    "institucional",
    "vacacionales",
  ],
  // Especialidades por disciplina. Siempre incluyen "general" (material que ven
  // todos dentro de la disciplina, sin importar su instrumento).
  especialidades: {
    musica: [
      "general",
      "piano",
      "guitarra",
      "bajo",
      "bateria",
      "canto",
      "violin",
      "cello",
      "flauta-traversa",
      "teoria-musical",
      "lenguaje-musical",
    ],
    danza: ["general", "ballet", "danza-urbana", "contemporaneo"],
    teatro: ["general"],
    "artes-plasticas": ["general", "dibujo", "pintura", "acuarela"],
    institucional: ["general"],
    vacacionales: ["general"],
  },
  categorias: [
    "tecnica",
    "repertorio",
    "teoria",
    "lectura",
    "ritmo",
    "armonia",
    "improvisacion",
    "calentamiento",
    "tarea",
    "guia",
    "playlist",
    "herramienta",
    "evaluacion",
  ],
  niveles: ["inicial", "basico", "intermedio", "avanzado", "todos"],
  publico: ["estudiantes", "docentes", "acudientes", "admin"],
  // Especialidades que cuentan como "comunes" a toda la disciplina: un estudiante
  // de música las ve aunque su instrumento no coincida (teoría, lenguaje, lectura…).
  generales: ["general", "teoria-musical", "lenguaje-musical", "lectura", "ritmo"],
};

// Garantiza que un objeto de taxonomía (venga de Firestore o esté incompleto)
// tenga todas las claves esperadas, rellenando con los valores por defecto.
export function withDefaults(tax) {
  const t = tax || {};
  return {
    disciplinas: t.disciplinas?.length ? t.disciplinas : DEFAULT_TAXONOMIA.disciplinas,
    especialidades: { ...DEFAULT_TAXONOMIA.especialidades, ...(t.especialidades || {}) },
    categorias: t.categorias?.length ? t.categorias : DEFAULT_TAXONOMIA.categorias,
    niveles: t.niveles?.length ? t.niveles : DEFAULT_TAXONOMIA.niveles,
    publico: t.publico?.length ? t.publico : DEFAULT_TAXONOMIA.publico,
    generales: t.generales?.length ? t.generales : DEFAULT_TAXONOMIA.generales,
  };
}

// Especialidades disponibles para una disciplina (siempre con "general" delante).
export function especialidadesDe(tax, disciplina) {
  const lista = tax.especialidades?.[disciplina] || ["general"];
  return lista.includes("general") ? lista : ["general", ...lista];
}

const normalizar = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

// Deriva los campos nuevos a partir del viejo `area`/`tipo`/texto de un recurso
// ya existente. Se usa en la migración para no tener que reclasificar a mano.
export function derivarCampos(recurso, tax) {
  const texto = normalizar(
    [recurso.area, recurso.tipo, recurso.titulo, recurso.tema, ...(recurso.etiquetas || [])].join(" ")
  );

  // 1) Especialidad: busca el primer instrumento/especialidad conocido en el texto.
  let disciplina = "musica";
  let especialidad = "general";
  for (const disc of tax.disciplinas) {
    for (const esp of especialidadesDe(tax, disc)) {
      if (esp === "general") continue;
      if (texto.includes(normalizar(esp).replace(/-/g, " ")) || texto.includes(normalizar(esp))) {
        disciplina = disc;
        especialidad = esp;
      }
    }
  }
  // Disciplinas no musicales nombradas explícitamente.
  for (const disc of tax.disciplinas) {
    if (disc !== "musica" && texto.includes(normalizar(disc).replace(/-/g, " "))) {
      disciplina = disc;
    }
  }

  // 2) Categoría: primer término pedagógico que aparezca en el texto.
  let categoria = "";
  for (const cat of tax.categorias) {
    if (texto.includes(normalizar(cat))) {
      categoria = cat;
      break;
    }
  }

  // 3) Nivel: por palabras clave.
  let nivel = "todos";
  if (/(inicial|principiante|basico|nivel 1)/.test(texto)) nivel = "inicial";
  else if (/(intermedio|nivel 2)/.test(texto)) nivel = "intermedio";
  else if (/(avanzado|nivel 3)/.test(texto)) nivel = "avanzado";

  return { disciplina, especialidad, categoria, nivel };
}
