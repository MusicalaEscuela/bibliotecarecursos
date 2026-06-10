// Configuración del proyecto Firebase de Musicala.
// Nota: estos valores son públicos por diseño; la seguridad real está en firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyD8p1Ges94PMBPE-wuFVjeE5uGzeUQYBS0",
  authDomain: "biblioteca-guitarra-fa182.firebaseapp.com",
  projectId: "biblioteca-guitarra-fa182",
  storageBucket: "biblioteca-guitarra-fa182.firebasestorage.app",
  messagingSenderId: "803045423554",
  appId: "1:803045423554:web:9bd5bda0d45f9e33f07e5b",
};

// Correos con permiso de administración (debe coincidir con firestore.rules).
export const ADMIN_EMAILS = [
  "alekcaballeromusic@gmail.com",
  "catalina.medina.leal@gmail.com",
  "imusicaladocente@gmail.com",
  "musicalaasesor@gmail.com",
  "imusicala@gmail.com",
];
