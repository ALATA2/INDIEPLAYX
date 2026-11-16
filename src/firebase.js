import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Configurazione ufficiale Firebase del progetto indieplayx (Daniele)
const firebaseConfig = {
  apiKey: "AIzaSyD3WeN_dhFxb3mzly04vqCKNWGle5p1m6o",
  authDomain: "indieplayx.firebaseapp.com",
  projectId: "indieplayx",
  storageBucket: "indieplayx.firebasestorage.app",
  messagingSenderId: "816864682458",
  appId: "1:816864682458:web:9647bacc9f26d3bae760e3",
  measurementId: "G-L4C5LYBN1S"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
