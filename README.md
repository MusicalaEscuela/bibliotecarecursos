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
│   ├── importer.js         Migración del export de Classroom a Firestore
│   ├── app.js              Orquestador
│   └── ui/                 Componentes (lista, editor, toasts)
├── data/classroom-export.json  Export original de Classroom (1.566 recursos)
├── legacy/                 Versión estática anterior (solo consulta)
└── firestore.rules         Reglas de seguridad (¡publicarlas en Firebase!)
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

## Seguridad

- La config de Firebase en `firebase-config.js` es pública por diseño; la protección real son las reglas de Firestore.
- Solo los 5 correos admin definidos en `firestore.rules` pueden escribir. La lista del front (`firebase-config.js`) es solo para UX; si se cambia, hay que cambiar también las reglas.
