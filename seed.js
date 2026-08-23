import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDfC96uMpoPmvjtiKfP9UCX16XaRPPQTCs",
  authDomain: "indiestore-d9cb2.firebaseapp.com",
  projectId: "indiestore-d9cb2",
  storageBucket: "indiestore-d9cb2.firebasestorage.app",
  messagingSenderId: "939991325481",
  appId: "1:939991325481:web:83641d3e3945eb0e43b538",
  measurementId: "G-M75FDYVGY3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const games = [];

async function seed() {
  for (const game of games) {
    try {
      await addDoc(collection(db, "games"), game);
      console.log(`Aggiunto: ${game.title}`);
    } catch (e) {
      console.error("Errore aggiunta gioco: ", e);
    }
  }
  process.exit();
}

seed();
