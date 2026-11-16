import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, setDoc } from "firebase/firestore";

const oldConfig = {
  apiKey: "AIzaSyDfC96uMpoPmvjtiKfP9UCX16XaRPPQTCs",
  authDomain: "indiestore-d9cb2.firebaseapp.com",
  projectId: "indiestore-d9cb2",
  storageBucket: "indiestore-d9cb2.firebasestorage.app",
  messagingSenderId: "939991325481",
  appId: "1:939991325481:web:83641d3e3945eb0e43b538"
};

const newConfig = {
  apiKey: "AIzaSyD3WeN_dhFxb3mzly04vqCKNWGle5p1m6o",
  authDomain: "indieplayx.firebaseapp.com",
  projectId: "indieplayx",
  storageBucket: "indieplayx.firebasestorage.app",
  messagingSenderId: "816864682458",
  appId: "1:816864682458:web:9647bacc9f26d3bae760e3",
  measurementId: "G-L4C5LYBN1S"
};

const oldApp = initializeApp(oldConfig, "oldApp");
const newApp = initializeApp(newConfig, "newApp");

const oldDb = getFirestore(oldApp);
const newDb = getFirestore(newApp);

async function migrateCollection(colName) {
  console.log(`Lettura collezione '${colName}' da indiestore-d9cb2...`);
  const snap = await getDocs(collection(oldDb, colName));
  console.log(`Trovati ${snap.size} documenti in '${colName}'. Copia verso indieplayx...`);
  let count = 0;
  for (const d of snap.docs) {
    await setDoc(doc(newDb, colName, d.id), d.data(), { merge: true });
    count++;
  }
  console.log(`✓ Copiati ${count}/${snap.size} documenti in '${colName}'.`);
}

async function run() {
  for (const col of ["games", "users", "platform_config", "transactions"]) {
    try {
      await migrateCollection(col);
    } catch (e) {
      console.error(`Attenzione migrazione '${col}':`, e.message);
    }
  }
  process.exit(0);
}

run();
