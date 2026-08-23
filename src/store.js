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
    return games;
  } catch (error) {
    console.error("Error getting games: ", error);
    // Return mock data if Firebase fails (useful for initial setup)
    return [
      {
        id: '1',
        title: 'CyberNeon Runner',
        developer: 'NeonLabs',
        price: '19.99',
        imageUrl: '/images/cyberneon_runner_cover_1777108135472.png'
      },
      {
        id: '2',
        title: 'Mystic Grove',
        developer: 'Woodland Tales',
        price: '14.99',
        imageUrl: '/images/mystic_grove_cover_1777108148651.png'
      },
      {
        id: '3',
        title: 'Void Star',
        developer: 'Astro Games',
        price: '24.99',
        imageUrl: '/images/void_star_cover_1777108162772.png'
      },
      {
        id: '4',
        title: 'Card Quest',
        developer: 'Ink & Paper',
        price: '9.99',
        imageUrl: '/images/card_quest_cover_1777108176295.png'
      }
    ];
  }
};
