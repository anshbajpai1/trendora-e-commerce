import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBFh6tNI6roZQecdYGtzs7tX75lY4NHbqo",
  authDomain: "trendora-1cd23.firebaseapp.com",
  projectId: "trendora-1cd23",
  storageBucket: "trendora-1cd23.appspot.com",
  messagingSenderId: "1080352553475",
  appId: "1:1080352553475:web:850319561617a21fdfec36"
};

// The named app keeps the staff session separate from the storefront's customer session.
const adminAppName = "trendora-admin";
export const app = getApps().some(existingApp => existingApp.name === adminAppName)
  ? getApp(adminAppName)
  : initializeApp(firebaseConfig, adminAppName);
export const auth = getAuth(app);
export const db = getFirestore(app);
