// Subida de archivos a Firebase Storage.
//
// Un archivo subido se convierte en un `enlace` más del recurso
// ({ titulo, url, storagePath }), así que las apps lectoras no distinguen entre
// "pegué una URL" y "subí un archivo": todo llega como enlace.
//
// No hay carpeta de "pendientes": el archivo se sube una sola vez a su ruta
// definitiva (Storage no permite mover objetos desde el cliente) y lo que el
// admin aprueba es el enlace, no el archivo.
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-storage.js";
import { app } from "./auth.js";

export const storage = getStorage(app);

// Debe coincidir con storage.rules (ahí está la validación que de verdad manda).
export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_MB = 25;

// Mismos tipos que acepta storage.rules. Se comprueba también aquí para dar un
// mensaje claro en vez de un "permiso denegado" del servidor.
const TIPO_OK =
  /^(application\/pdf|image\/|audio\/|video\/|text\/plain|application\/msword|application\/vnd\.ms-|application\/vnd\.openxmlformats-officedocument\.|application\/vnd\.oasis\.opendocument\.)/;

export const tipoPermitido = (contentType) => TIPO_OK.test(contentType || "");

// Traduce los errores del SDK a algo accionable.
export function mensajeErrorSubida(err) {
  if (err?.code === "storage/unauthorized")
    return "Storage rechazó el archivo. Revisa que storage.rules esté publicado en Firebase.";
  if (err?.code === "storage/canceled") return "Subida cancelada.";
  if (err?.code === "storage/retry-limit-exceeded")
    return "La subida tardó demasiado. Revisa tu conexión e inténtalo otra vez.";
  return err?.message || "No se pudo subir el archivo.";
}

// Nombre de archivo seguro para una ruta de Storage (sin tildes ni espacios).
const nombreSeguro = (nombre) =>
  nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-80);

export const formatoTamano = (bytes) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Sube los archivos uno por uno. onProgress recibe (indice, total, nombre, %).
export async function subirArchivos(files, uid, onProgress) {
  if (!uid) throw new Error("No hay sesión activa para subir archivos.");
  const lista = [...files];
  const subidos = [];

  for (const [i, file] of lista.entries()) {
    if (file.size > MAX_BYTES) {
      throw new Error(`"${file.name}" pesa ${formatoTamano(file.size)}; el máximo es ${MAX_MB} MB.`);
    }
    if (!tipoPermitido(file.type)) {
      throw new Error(
        `"${file.name}" no es un tipo aceptado (PDF, imagen, audio, video o documento de texto).`
      );
    }
    const storagePath = `biblioteca/${uid}/${Date.now()}-${nombreSeguro(file.name)}`;
    const tarea = uploadBytesResumable(ref(storage, storagePath), file, {
      contentType: file.type || "application/octet-stream",
    });

    await new Promise((resolve, reject) => {
      tarea.on(
        "state_changed",
        (snap) =>
          onProgress?.(
            i + 1,
            lista.length,
            file.name,
            Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
          ),
        reject,
        resolve
      );
    });

    subidos.push({
      titulo: file.name,
      url: await getDownloadURL(tarea.snapshot.ref),
      storagePath,
      contentType: file.type || "",
      tamano: file.size,
    });
  }
  return subidos;
}

// Borra los archivos de un conjunto de enlaces (los que vivan en Storage).
// No revienta si el archivo ya no existe: borrar es limpieza, no una operación
// crítica.
export async function borrarArchivosDe(enlaces) {
  for (const e of enlaces || []) {
    if (!e.storagePath) continue;
    try {
      await deleteObject(ref(storage, e.storagePath));
    } catch (err) {
      console.warn("No se pudo borrar", e.storagePath, err.code || err.message);
    }
  }
}
