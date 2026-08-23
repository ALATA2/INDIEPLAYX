import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDfC96uMpoPmvjtiKfP9UCX16XaRPPQTCs",
  authDomain: "indiestore-d9cb2.firebaseapp.com",
  projectId: "indiestore-d9cb2",
  storageBucket: "indiestore-d9cb2.firebasestorage.app",
  messagingSenderId: "939991325481",
  appId: "1:939991325481:web:83641d3e3945eb0e43b538",
  measurementId: "G-M75FDYVGY3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
