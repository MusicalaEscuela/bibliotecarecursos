# Biblioteca de Recursos Musicala — Manager

Manager central de la biblioteca general de Musicala. Permite agregar, editar, clasificar por área y archivar recursos. Todo se guarda en **Firestore** (colección `recursos`), de donde las demás apps de Musicala leen la información.

## Estructura

```
├── index.html              Shell del Manager
├── css/styles.css          Estilos
├── js/
│   ├── firebase-config.js  Config de Firebase + lista de correos admin
│   ├── auth.js             Login con Google y verificación de admins
│   ├── db.js               CRUD de Firestore (incluye operaciones masivas)
│   ├── storage.js          Subida y borrado de archivos adjuntos
│   ├── importer.js         Migración del export de Classroom a Firestore
│   ├── repertorio.js       Canciones: Sheet → documentos, plan de sincronización (sin Firebase)
│   ├── app.js              Orquestador
│   └── ui/                 Componentes (lista, editor, toasts)
├── scripts/sync-repertorio.mjs  Simulacro de la sincronización desde la terminal (solo lee)
├── data/classroom-export.json  Export original de Classroom (1.566 recursos)
├── legacy/                 Versión estática anterior (solo consulta)
├── firebase.json           Apunta el CLI a los dos archivos de reglas
├── .firebaserc             Proyecto por defecto (biblioteca-guitarra-fa182)
├── firestore.rules         Reglas de Firestore
└── storage.rules           Reglas de Storage
```

## Publicar las reglas

Las reglas del repo **no protegen nada hasta que estén publicadas**. Con `firebase.json`
en su sitio, las dos se publican de una:

```
firebase deploy --only firestore:rules,storage --project biblioteca-guitarra-fa182
```

Si la cuenta con la que arranca el CLI no ve el proyecto, agregar `--account correo@…`.
Cada vez que se toque `firestore.rules` o `storage.rules`, volver a correr esto.

## Puesta en marcha

1. **Firebase Console** ([biblioteca-guitarra-fa182](https://console.firebase.google.com/project/biblioteca-guitarra-fa182)):
   - Authentication → habilitar proveedor **Google**.
   - Firestore Database → crear base de datos (modo producción).
   - Publicar las reglas (ver «Publicar las reglas» más abajo).
   - Authentication → Settings → Authorized domains → agregar el dominio donde se publique (p. ej. `usuario.github.io`).
2. Servir el proyecto (no funciona con `file://` por los módulos ES):
   ```
   npx serve .
   ```
3. Entrar con un correo admin y pulsar **Importar export de Classroom** (solo la primera vez; es idempotente, re-ejecutarlo no duplica).

## Modelo de datos (`recursos/{id}`)

| Campo | Descripción |
|---|---|
| `titulo`, `descripcion`, `tema` | Texto descriptivo |
| `area` | Área a la que pertenece (`bajo`, `guitarra`, `piano`…) |
| `tipo` | Tarea / ejercicio, guía, material… |
| `etiquetas` | Array de strings |
| `enlaces` | Array `{ titulo, url, tipo, thumbnail }` |
| `esDeMusicala` | Booleano |
| `estado` | `publicado` · `borrador` · `archivado` (las apps lectoras solo muestran `publicado`) |
| `origen` | Trazabilidad del export de Classroom |
| `actualizadoEn`, `actualizadoPor` | Auditoría automática |

## Repertorio (canciones)

Cada canción es **un recurso independiente** de `recursos`, clasificado como cualquier otro
(`disciplina: "musica"`, `especialidad: "piano"`, `categoria: "repertorio"`, `publico`, `estado`)
y además con `tipo: "Canción"` y un mapa `cancion` con sus datos propios:

| Campo | Descripción |
|---|---|
| `cancion.artista`, `cancion.genero`, `cancion.tonalidad` | Texto (género normalizado: "Clasico" → "Clásico") |
| `cancion.nivel` | Número 0–5 (estrellas). El `nivel` general se deriva: 0 → inicial, 1–2 → basico, 3 → intermedio, 4–5 → avanzado |
| `cancion.contenido` | Texto original ("Notas 1234", "Acordes I-IV-V"…) |
| `cancion.contenidoTipo`, `cancion.numeroNotas` | `"notas"`/`"acordes"`/`""` y número de notas o `null` |
| `cancion.fuente` | `sheet-repertorio-piano` (importada) o `manager` (creada a mano) |
| `enlaces[].tipo` | Las guías: `colores`, `numeros`, `notas`, `partitura`, `acordes`, `video` |

En el Manager, la pestaña **🎵 Repertorio** muestra solo canciones, con filtros de nivel, género,
contenido y guía disponible; el buscador también busca por artista, tonalidad y contenido.

**Sincronizar desde el Sheet:** botón «Sincronizar repertorio» → «Simular» (no escribe) →
«Confirmar y escribir». Id estable `cancion-<slug título + artista>`: re-sincronizar actualiza en
vez de duplicar. Solo toca documentos con `cancion.fuente == "sheet-repertorio-piano"`; nunca borra
(las que desaparecen del Sheet solo se informan) y no pisa `estado`, `publico` ni `creadoEn`. Lo
demás (título, guías, datos de la canción) lo manda el Sheet: **corregir en el Sheet**, no en el
Manager. Una fila repetida con enlaces distintos es otro arreglo y se guarda como `…-2`.

Simulacro desde la terminal (lee el Sheet y Firestore, no escribe):

```
node scripts/sync-repertorio.mjs
```

## Cómo leen las otras apps

```js
import { collection, query, where, getDocs } from "firebase/firestore";
const q = query(
  collection(db, "recursos"),
  where("area", "==", "guitarra"),
  where("estado", "==", "publicado")
);

// Repertorio de piano:
const canciones = query(
  collection(db, "recursos"),
  where("tipo", "==", "Canción"),
  where("especialidad", "==", "piano"),
  where("estado", "==", "publicado")
);
```

## Roles y sugerencias de docentes

Cualquier persona puede entrar con su cuenta de Google, pero lo que ve depende del rol:

| Rol | Qué puede hacer |
|---|---|
| **Admin** (correos de `firestore.rules`) | Todo: ver, crear, editar, clasificar, archivar, eliminar, y aceptar o rechazar sugerencias. |
| **Docente** (cualquier otra cuenta de Google) | Solo enviar sugerencias y ver el estado de las suyas. No lee ni escribe la colección `recursos` desde el Manager. |

Las sugerencias viven en la colección `sugerencias`, **separada de `recursos`**: un docente puede
crear documentos ahí, pero nunca tocar la biblioteca. Un recurso solo nace cuando un admin abre la
sugerencia, revisa los datos en el editor y guarda; entonces la sugerencia queda como `aceptada`
(con `recursoId`) o `rechazada` (con `motivo`, que el autor sí ve).

### Archivos adjuntos (Firebase Storage)

Tanto el docente como el admin pueden **pegar una URL o subir un archivo**; ambas cosas terminan
como entradas de `enlaces`, así que las apps lectoras no notan la diferencia. Un archivo subido
añade `storagePath`, `contentType` y `tamano` al enlace.

Los archivos van a `biblioteca/{uid}/{timestamp}-{nombre}` y se suben **en el momento del envío**,
antes de que el admin revise: la revisión decide si el recurso entra a la biblioteca, no si el
archivo llega al bucket. Los límites automáticos (25 MB por archivo y lista de tipos permitidos)
están en `storage.rules` y actúan antes que cualquier persona. Al eliminar una sugerencia
**no aceptada**, sus archivos se borran junto con ella; si ya fue aceptada, se conservan porque
ahora pertenecen a un recurso.

No hay carpeta de "pendientes" ni movimiento de archivos: Storage no permite mover objetos desde
el cliente (haría falta Cloud Functions), así que el archivo se sube una sola vez a su ruta
definitiva y lo que se aprueba es el enlace.

### Modelo de datos (`sugerencias/{id}`)

| Campo | Descripción |
|---|---|
| `titulo`, `descripcion`, `nota` | Propuesta del docente (`nota` es el mensaje para el equipo) |
| `disciplina`, `especialidad`, `categoria`, `nivel`, `etiquetas`, `enlaces` | Igual que en `recursos` |
| `estado` | `pendiente` · `aceptada` · `rechazada` |
| `creadoPor`, `creadoPorNombre`, `creadoEn` | Autor de la sugerencia |
| `revisadoPor`, `revisadoEn`, `recursoId`, `motivo` | Resolución del admin |

## Seguridad

- La config de Firebase en `firebase-config.js` es pública por diseño; la protección real son las reglas de Firestore.
- Solo los 5 correos admin definidos en `firestore.rules` pueden escribir en `recursos` y `config`. La lista del front (`firebase-config.js`) es solo para UX; si se cambia, hay que cambiar también las reglas.
- En `sugerencias`: crear requiere sesión iniciada y que `creadoPor` sea el correo del propio usuario con `estado: "pendiente"`; leer, solo el autor (lo suyo) o un admin (todo); actualizar y borrar, solo admins.
- En Storage (`storage.rules`): escribir solo en la carpeta del propio `uid`, máximo 25 MB por archivo y solo tipos permitidos (PDF, imagen, audio, video, documentos de texto). Borrar: el autor lo suyo, los admins cualquier cosa.
- Abrir un archivo por su URL (`get`) es público, porque el HUB de estudiantes abre los enlaces sin autenticarse. **Listar** el bucket (`list`) es solo de admins: si no, cualquiera podía enumerar y descargar todo el material de una. Cerrar el listado no afecta ningún enlace ya publicado.
- La lectura de `recursos` sigue abierta **a propósito**: el HUB de estudiantes lee este proyecto sin autenticarse (usa `getFirestore` sin `getAuth`, contra un proyecto distinto al de su login). Cerrarla exige tocar antes el repo del HUB; ver el comentario en `firestore.rules`.
- Al cambiar las reglas hay que **volver a publicarlas** (ver «Publicar las reglas»). Mientras no se publiquen, el repo puede decir una cosa y Firebase estar aplicando otra.
