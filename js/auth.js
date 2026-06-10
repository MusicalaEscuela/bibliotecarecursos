// Autenticación con Google y verificación de admins.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { firebaseConfig, ADMIN_EMAILS } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export const isAdmin = (user) =>
  !!user && ADMIN_EMAILS.includes((user.email || "").toLowerCase());

export const login = () => signInWithPopup(auth, provider);
export const logout = () => signOut(auth);

// callback recibe (user|null, esAdmin)
export const watchAuth = (callback) =>
  onAuthStateChanged(auth, (user) => callback(user, isAdmin(user)));
