import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'public', 'images', 'db_games');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const firebaseConfig = {
  apiKey: "AIzaSyD3WeN_dhFxb3mzly04vqCKNWGle5p1m6o",
  authDomain: "indieplayx.firebaseapp.com",
  projectId: "indieplayx",
  storageBucket: "indieplayx.firebasestorage.app",
  messagingSenderId: "816864682458",
  appId: "1:816864682458:web:9647bacc9f26d3bae760e3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function saveDataUrlToFile(dataUrl, filenameBase) {
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (!match) return null;
  let ext = match[1].toLowerCase();
  if (ext === 'jpeg') ext = 'jpg';
  const buf = Buffer.from(match[2], 'base64');
  const fileName = `${filenameBase}.${ext}`;
  const fullPath = path.join(OUT_DIR, fileName);
  fs.writeFileSync(fullPath, buf);
  return {
    url: `/images/db_games/${fileName}`,
    bytes: buf.length
  };
}

async function run() {
  console.log('Analisi documenti nella collezione Firestore "games"...');
  const snap = await getDocs(collection(db, 'games'));
  let totalBeforeBytes = 0;
  let totalAfterBytes = 0;
  const fastCatalog = [];

  for (const d of snap.docs) {
    const data = d.data();
    const rawJson = JSON.stringify(data);
    totalBeforeBytes += Buffer.byteLength(rawJson, 'utf8');
    console.log(`- Gioco "${data.title}" (${d.id}): ${(Buffer.byteLength(rawJson, 'utf8') / 1024).toFixed(1)} KB`);

    let modified = false;
    const updated = { ...data };

    // 1. Extract header.src if Base64
    if (updated.header && typeof updated.header.src === 'string' && updated.header.src.startsWith('data:image')) {
      const saved = saveDataUrlToFile(updated.header.src, `${d.id}_header`);
      if (saved) {
        updated.header = { ...updated.header, src: saved.url };
        modified = true;
        console.log(`  ✓ Estratto header Base64 -> ${saved.url} (${(saved.bytes / 1024).toFixed(1)} KB)`);
      }
    }

    // 2. Extract imageUrl if Base64
    if (typeof updated.imageUrl === 'string' && updated.imageUrl.startsWith('data:image')) {
      const saved = saveDataUrlToFile(updated.imageUrl, `${d.id}_cover`);
      if (saved) {
        updated.imageUrl = saved.url;
        modified = true;
        console.log(`  ✓ Estratto imageUrl Base64 -> ${saved.url}`);
      }
    }

    // 3. Extract gallery[] images if Base64
    if (Array.isArray(updated.gallery)) {
      const newGallery = [];
      for (let i = 0; i < updated.gallery.length; i++) {
        const item = updated.gallery[i];
        if (item && typeof item.src === 'string' && item.src.startsWith('data:image')) {
          const saved = saveDataUrlToFile(item.src, `${d.id}_gal_${i}`);
          if (saved) {
            newGallery.push({ ...item, src: saved.url });
            modified = true;
            console.log(`  ✓ Estratta gallery[${i}] Base64 -> ${saved.url} (${(saved.bytes / 1024).toFixed(1)} KB)`);
          } else {
            newGallery.push(item);
          }
        } else {
          newGallery.push(item);
        }
      }
      updated.gallery = newGallery;
    }

    // Ensure imageUrl is set for fast card rendering
    if (!updated.imageUrl) {
      updated.imageUrl = (updated.header && updated.header.type === 'image' && updated.header.src)
        ? updated.header.src
        : (Array.isArray(updated.gallery) && updated.gallery[0]?.src ? updated.gallery[0].src : '/images/placeholder.png');
      modified = true;
    }

    if (modified) {
      await setDoc(doc(db, 'games', d.id), updated);
    }

    const afterJson = JSON.stringify(updated);
    totalAfterBytes += Buffer.byteLength(afterJson, 'utf8');

    fastCatalog.push({
      id: d.id,
      title: updated.title || '',
      developer: updated.developer || 'IndiePlay',
      price: updated.price || 'FREE',
      category: updated.category || 'Indie',
      type: updated.type || 'download',
      desc: updated.desc || '',
      imageUrl: updated.imageUrl || '/images/placeholder.png',
      header: updated.header || null
    });
  }

  // Save pre-warmed catalog JSON in public/games-fast-cache.json
  fs.writeFileSync(
    path.join(ROOT_DIR, 'public', 'games-fast-cache.json'),
    JSON.stringify(fastCatalog, null, 2),
    'utf8'
  );

  console.log(`\n=============================================================`);
  console.log(`🚀 OTTIMIZZAZIONE FIRESTORE COMPLETATA!`);
  console.log(`Dimensione JSON prima: ${(totalBeforeBytes / 1024).toFixed(1)} KB`);
  console.log(`Dimensione JSON dopo:  ${(totalAfterBytes / 1024).toFixed(1)} KB`);
  console.log(`=============================================================\n`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
