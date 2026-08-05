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
│   ├── app.js              Orquestador
│   └── ui/                 Componentes (lista, editor, toasts)
├── data/classroom-export.json  Export original de Classroom (1.566 recursos)
├── legacy/                 Versión estática anterior (solo consulta)
├── firestore.rules         Reglas de Firestore (¡publicarlas en Firebase!)
└── storage.rules           Reglas de Storage (¡publicarlas aparte!)
```

## Puesta en marcha

1. **Firebase Console** ([biblioteca-guitarra-fa182](https://console.firebase.google.com/project/biblioteca-guitarra-fa182)):
   - Authentication → habilitar proveedor **Google**.
   - Firestore Database → crear base de datos (modo producción).
   - Firestore → Reglas → pegar el contenido de `firestore.rules` y publicar.
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

## Cómo leen las otras apps

```js
import { collection, query, where, getDocs } from "firebase/firestore";
const q = query(
  collection(db, "recursos"),
  where("area", "==", "guitarra"),
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
- En Storage (`storage.rules`): escribir solo en la carpeta del propio `uid`, máximo 25 MB por archivo y solo tipos permitidos (PDF, imagen, audio, video, documentos de texto). Lectura pública, porque el HUB de estudiantes abre los enlaces sin autenticarse. Borrar: el autor lo suyo, los admins cualquier cosa.
- Al cambiar las reglas hay que **volver a publicarlas** en Firebase Console: `firestore.rules` en Firestore → Reglas, y `storage.rules` en Storage → Reglas. Son dos publicaciones distintas.
