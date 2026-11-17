import { db } from './firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter
} from "firebase/firestore";

const GAMES_COLLECTION = 'games';
const FAST_CACHE_KEY = 'indieplay_fast_games_v3';

export function getCachedGamesSync() {
  try {
    const raw = localStorage.getItem(FAST_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return null;
}

export function setCachedGamesSync(games) {
  try {
    // Store lightweight summary in localStorage for 0ms instant rendering
    const slim = games.map(g => ({
      id: g.id,
      title: g.title || '',
      developer: g.developer || 'IndiePlay',
      price: g.price || 'FREE',
      category: g.category || 'Indie',
      type: g.type || 'download',
      desc: g.desc || '',
      imageUrl: g.imageUrl || (g.header && g.header.type === 'image' ? g.header.src : (g.gallery && g.gallery[0] ? g.gallery[0].src : '/images/placeholder.png')),
      header: g.header && g.header.type === 'image' ? { type: 'image', src: g.header.src } : null
    }));
    localStorage.setItem(FAST_CACHE_KEY, JSON.stringify(slim));
  } catch (e) {}
}

export const addGame = async (gameData) => {
  try {
    const docRef = await addDoc(collection(db, GAMES_COLLECTION), {
      ...gameData,
      createdAt: new Date()
    });
    return docRef.id;
  } catch (error) {
    console.error("Error adding game: ", error);
    throw error;
  }
};

export const getGamesPaged = async (pageSize = 12, lastDoc = null) => {
  try {
    let q;
    if (lastDoc) {
      q = query(
        collection(db, GAMES_COLLECTION),
        orderBy('createdAt', 'desc'),
        startAfter(lastDoc),
        limit(pageSize)
      );
    } else {
      q = query(
        collection(db, GAMES_COLLECTION),
        orderBy('createdAt', 'desc'),
        limit(pageSize)
      );
    }
    const querySnapshot = await getDocs(q);
    const games = [];
    let lastVisible = null;
    if (!querySnapshot.empty) {
      lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
    }
    querySnapshot.forEach((doc) => {
      games.push({ id: doc.id, ...doc.data() });
    });
    return { games, lastVisible };
  } catch (error) {
    console.error("Error getting paged games: ", error);
    return { games: [], lastVisible: null };
  }
};

export const getGames = async () => {
  try {
    const q = query(collection(db, GAMES_COLLECTION), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const games = [];
    querySnapshot.forEach((doc) => {
      games.push({ id: doc.id, ...doc.data() });
    });
    if (games.length > 0) {
      setCachedGamesSync(games);
      return games;
    }
  } catch (error) {
    console.error("Error getting games from Firestore: ", error);
  }

  // Fallback to pre-generated static CDN cache if Firestore is still connecting
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}games-fast-cache.json`);
    if (res.ok) {
      const staticGames = await res.json();
      if (Array.isArray(staticGames) && staticGames.length > 0) {
        setCachedGamesSync(staticGames);
        return staticGames;
      }
    }
  } catch (e) {}

  return getCachedGamesSync() || [];
};
