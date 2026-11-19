import { db } from './firebase.js';
import { doc, setDoc, getDoc, collection, addDoc } from 'firebase/firestore';
import { getActiveUser } from './auth.js';

const WISHLIST_KEY = 'indieplay_wishlist_v1';
const FOLLOWED_DEVS_KEY = 'indieplay_followed_devs_v1';
const SEEN_GAMES_KEY = 'indieplay_seen_followed_games_v1';
const WAITLIST_KEY = 'indieplay_waitlist_v1';

// ============================================================================
// 1. WISHLIST ("LISTA DESIDERI") — LOCAL + CLOUD FIRESTORE SYNC
// ============================================================================
export function getWishlist() {
  try {
    const raw = localStorage.getItem(WISHLIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

export function isInWishlist(gameId) {
  return getWishlist().includes(String(gameId));
}

export async function syncWishlistFromCloud() {
  const user = getActiveUser();
  if (!user || !user.uid) return getWishlist();
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists() && Array.isArray(snap.data()?.wishlist)) {
      const merged = Array.from(new Set([...getWishlist(), ...snap.data().wishlist.map(String)]));
      localStorage.setItem(WISHLIST_KEY, JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent('indieplay:wishlistchange', { detail: merged }));
      return merged;
    }
  } catch (e) {}
  return getWishlist();
}

export async function toggleWishlist(game) {
  const idStr = String(game?.id || game || '');
  if (!idStr) return false;

  const list = getWishlist();
  const exists = list.includes(idStr);
  const next = exists ? list.filter((x) => x !== idStr) : [idStr, ...list];
  try {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(next));
  } catch (e) {}

  window.dispatchEvent(new CustomEvent('indieplay:wishlistchange', { detail: next }));

  const user = getActiveUser();
  if (user && user.uid) {
    try {
      await setDoc(doc(db, 'users', user.uid), { wishlist: next }, { merge: true });
    } catch (e) {}
  }

  if (window.showToast) {
    const title = game?.title ? `"${game.title}"` : 'Gioco';
    window.showToast(
      exists ? `${title} rimosso dalla Lista Desideri.` : `❤️ ${title} aggiunto alla tua Lista Desideri!`,
      exists ? 'info' : 'success'
    );
  }
  return !exists;
}

// ============================================================================
// 2. CREATORI SEGUITI & NOTIFICHE NUOVI GIOCHI
// ============================================================================
export function getFollowedCreators() {
  try {
    const raw = localStorage.getItem(FOLLOWED_DEVS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

export function trackFollowedCreator(devName) {
  const clean = String(devName || '').trim();
  if (!clean) return;
  const current = getFollowedCreators();
  if (!current.some((d) => d.toLowerCase() === clean.toLowerCase())) {
    current.push(clean);
    try {
      localStorage.setItem(FOLLOWED_DEVS_KEY, JSON.stringify(current));
    } catch (e) {}
  }
}

export function untrackFollowedCreator(devName) {
  const clean = String(devName || '').trim().toLowerCase();
  const next = getFollowedCreators().filter((d) => d.toLowerCase() !== clean);
  try {
    localStorage.setItem(FOLLOWED_DEVS_KEY, JSON.stringify(next));
  } catch (e) {}
}

export function getNewGamesFromFollowedCreators(allGames = []) {
  const followed = getFollowedCreators().map((d) => d.toLowerCase());
  if (!followed.length || !Array.isArray(allGames)) return [];

  let seenIds = [];
  try {
    seenIds = JSON.parse(localStorage.getItem(SEEN_GAMES_KEY) || '[]');
  } catch (e) {}

  return allGames.filter((g) => {
    const dev = String(g.developer || g.author || '').trim().toLowerCase();
    return dev && followed.includes(dev) && !seenIds.includes(String(g.id));
  });
}

export function markFollowedGamesSeen(gameIds = []) {
  try {
    const prev = JSON.parse(localStorage.getItem(SEEN_GAMES_KEY) || '[]');
    const merged = Array.from(new Set([...prev, ...gameIds.map(String)]));
    localStorage.setItem(SEEN_GAMES_KEY, JSON.stringify(merged));
  } catch (e) {}
}

// ============================================================================
// 3. LINK REFERRAL / UTM CREATORI (TRACCIATO AUTOMATICAMENTE IN /WOXLYTICS)
// ============================================================================
export function slugifyCreatorHandle(name) {
  return String(name || 'creator')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'creator';
}

export function buildCreatorReferralLink(handle, targetPath = '/', medium = 'social') {
  const slug = slugifyCreatorHandle(handle);
  const base = 'https://www.indieplayx.com';
  const sep = targetPath.includes('?') ? '&' : '?';
  return `${base}${targetPath}${sep}utm_source=creator_${encodeURIComponent(slug)}&utm_medium=${encodeURIComponent(medium)}&utm_campaign=community_share`;
}

// ============================================================================
// 4. WAITLIST ("AVVISAMI AL LANCIO") — BITBONK™ & MEME CONSOLE™
// ============================================================================
export function getWaitlistLocal() {
  try {
    const raw = localStorage.getItem(WAITLIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {}
  return [];
}

export async function submitWaitlistEmail(project, email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Inserisci un indirizzo email valido.');
  }

  const list = getWaitlistLocal();
  const already = list.find((item) => item.project === project && item.email === cleanEmail);
  if (already) {
    return { alreadyRegistered: true };
  }

  const entry = {
    project,
    email: cleanEmail,
    lang: (navigator.language || 'en').slice(0, 5),
    createdAt: new Date().toISOString()
  };

  list.unshift(entry);
  try {
    localStorage.setItem(WAITLIST_KEY, JSON.stringify(list.slice(0, 200)));
  } catch (e) {}

  try {
    await addDoc(collection(db, 'waitlist_leads'), entry);
  } catch (e) {
    // Graceful fallback if offline
  }

  return { alreadyRegistered: false, entry };
}

// ============================================================================
// 5. OPEN GRAPH / TWITTER DYNAMIC META UPDATER + SAFE PWA SERVICE WORKER
// ============================================================================
export function updateSocialMetaTags({ title, description, image, url } = {}) {
  if (typeof document === 'undefined') return;

  const setMeta = (attr, key, val) => {
    if (!val) return;
    let el = document.querySelector(`meta[${attr}="${key}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', val);
  };

  if (title) {
    document.title = title;
    setMeta('property', 'og:title', title);
    setMeta('name', 'twitter:title', title);
  }
  if (description) {
    setMeta('name', 'description', description);
    setMeta('property', 'og:description', description);
    setMeta('name', 'twitter:description', description);
  }
  if (image) {
    const absImg = image.startsWith('http') ? image : `https://www.indieplayx.com${image.startsWith('/') ? '' : '/'}${image}`;
    setMeta('property', 'og:image', absImg);
    setMeta('name', 'twitter:image', absImg);
  }
  if (url) {
    setMeta('property', 'og:url', url);
  }
}

export function initPwaSupport() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const p = (window.location.pathname || '').toLowerCase();
  if (p.includes('bitmeme') || p.includes('woxlytics')) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
