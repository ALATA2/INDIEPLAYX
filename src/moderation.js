import { db } from './firebase.js';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs
} from 'firebase/firestore';

export const MODERATION_DOC_PATH = ['settings', 'moderation_v1'];
export const MODERATION_LOCAL_KEY = 'indieplay_moderation_v1';

export const MODERATION_REASONS = [
  'Vietato ai minori / Contenuto NSFW (18+)',
  'Contenuto offensivo, violento o illegale',
  'Violazione Copyright / Plagio',
  'Spam, Truffa o Malware',
  'Profilo falso o comportamento scorretto',
  'Altro motivo (Violazione Linee Guida)'
];

function createEmptyModerationState() {
  return {
    removedGameIds: [],
    bannedUserIds: [],
    bannedUserHandles: [],
    moderationLog: [],
    updatedAt: null
  };
}

function normalizeModerationState(raw) {
  const base = createEmptyModerationState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    removedGameIds: Array.isArray(raw.removedGameIds) ? Array.from(new Set(raw.removedGameIds.map(String))) : [],
    bannedUserIds: Array.isArray(raw.bannedUserIds) ? Array.from(new Set(raw.bannedUserIds.map(String))) : [],
    bannedUserHandles: Array.isArray(raw.bannedUserHandles)
      ? Array.from(new Set(raw.bannedUserHandles.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)))
      : [],
    moderationLog: Array.isArray(raw.moderationLog) ? raw.moderationLog.slice(0, 80) : [],
    updatedAt: raw.updatedAt || null
  };
}

export function getModerationStateSync() {
  try {
    const raw = localStorage.getItem(MODERATION_LOCAL_KEY);
    if (raw) return normalizeModerationState(JSON.parse(raw));
  } catch (e) {}
  return createEmptyModerationState();
}

export async function syncModerationStateFromCloud() {
  try {
    const snap = await getDoc(doc(db, ...MODERATION_DOC_PATH));
    if (snap.exists()) {
      const state = normalizeModerationState(snap.data());
      try {
        localStorage.setItem(MODERATION_LOCAL_KEY, JSON.stringify(state));
      } catch (e) {}
      return state;
    }
  } catch (e) {}
  return getModerationStateSync();
}

async function saveModerationState(state) {
  const normalized = normalizeModerationState({
    ...state,
    updatedAt: new Date().toISOString()
  });
  try {
    localStorage.setItem(MODERATION_LOCAL_KEY, JSON.stringify(normalized));
  } catch (e) {}
  await setDoc(doc(db, ...MODERATION_DOC_PATH), normalized, { merge: true });
  return normalized;
}

export function isUserBanned(uid = '', handleOrEmail = '') {
  const st = getModerationStateSync();
  const cleanUid = String(uid || '').trim();
  const cleanHandle = String(handleOrEmail || '').trim().toLowerCase();
  if (cleanUid && st.bannedUserIds.includes(cleanUid)) return true;
  if (cleanHandle && st.bannedUserHandles.includes(cleanHandle)) return true;
  return false;
}

export function isGameModerated(gameOrId) {
  const st = getModerationStateSync();
  if (!gameOrId) return false;
  if (typeof gameOrId === 'string') {
    return st.removedGameIds.includes(gameOrId);
  }
  const gid = String(gameOrId.id || '');
  if (gid && st.removedGameIds.includes(gid)) return true;

  const authorUid = String(gameOrId.sellerId || gameOrId.authorUid || gameOrId.userId || '').trim();
  if (authorUid && st.bannedUserIds.includes(authorUid)) return true;

  const devName = String(gameOrId.developer || gameOrId.author || '').trim().toLowerCase();
  if (devName && st.bannedUserHandles.includes(devName)) return true;

  const authorEmail = String(gameOrId.authorEmail || gameOrId.sellerEmail || '').trim().toLowerCase();
  if (authorEmail && st.bannedUserHandles.includes(authorEmail)) return true;

  return false;
}

export function filterModeratedGames(games) {
  if (!Array.isArray(games)) return [];
  return games.filter((g) => !isGameModerated(g));
}

export async function adminDeleteGame({ gameId, title = '', reason = MODERATION_REASONS[0] }) {
  const idStr = String(gameId || '').trim();
  if (!idStr) throw new Error('ID gioco non valido');

  // 1. Delete from Firestore games collection (if it exists there)
  try {
    await deleteDoc(doc(db, 'games', idStr));
  } catch (e) {
    console.warn('deleteDoc games warning:', e);
  }

  // 2. Add to moderation blacklist so static/cached copies also vanish everywhere
  const st = await syncModerationStateFromCloud();
  if (!st.removedGameIds.includes(idStr)) {
    st.removedGameIds.push(idStr);
  }
  st.moderationLog.unshift({
    ts: new Date().toISOString(),
    action: 'DELETE_GAME',
    targetId: idStr,
    targetLabel: title || idStr,
    reason
  });
  await saveModerationState(st);

  // 3. Invalidate fast local games cache
  try {
    localStorage.removeItem('indieplay_fast_games_v3');
  } catch (e) {}

  return st;
}

export async function adminRestoreGame(gameId) {
  const idStr = String(gameId || '').trim();
  const st = await syncModerationStateFromCloud();
  st.removedGameIds = st.removedGameIds.filter((id) => id !== idStr);
  st.moderationLog.unshift({
    ts: new Date().toISOString(),
    action: 'RESTORE_GAME',
    targetId: idStr,
    targetLabel: idStr,
    reason: 'Ripristinato dall\'amministratore'
  });
  await saveModerationState(st);
  try {
    localStorage.removeItem('indieplay_fast_games_v3');
  } catch (e) {}
  return st;
}

export async function adminBanOrDeleteUser({
  uid = '',
  displayName = '',
  email = '',
  reason = MODERATION_REASONS[0],
  hardDelete = false
}) {
  const cleanUid = String(uid || '').trim();
  const cleanName = String(displayName || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const lowerName = cleanName.toLowerCase();

  const st = await syncModerationStateFromCloud();
  if (cleanUid && !st.bannedUserIds.includes(cleanUid)) {
    st.bannedUserIds.push(cleanUid);
  }
  if (lowerName && !st.bannedUserHandles.includes(lowerName)) {
    st.bannedUserHandles.push(lowerName);
  }
  if (cleanEmail && !st.bannedUserHandles.includes(cleanEmail)) {
    st.bannedUserHandles.push(cleanEmail);
  }

  // 1. Delete all games belonging to this user from Firestore + blacklist their IDs
  let deletedGamesCount = 0;
  try {
    const gamesSnap = await getDocs(collection(db, 'games'));
    for (const gDoc of gamesSnap.docs) {
      const g = gDoc.data() || {};
      const matchUid = cleanUid && (g.sellerId === cleanUid || g.authorUid === cleanUid || g.userId === cleanUid);
      const matchName = lowerName && String(g.developer || g.author || '').trim().toLowerCase() === lowerName;
      const matchEmail = cleanEmail && String(g.authorEmail || g.sellerEmail || '').trim().toLowerCase() === cleanEmail;
      if (matchUid || matchName || matchEmail) {
        try {
          await deleteDoc(doc(db, 'games', gDoc.id));
        } catch (err) {}
        if (!st.removedGameIds.includes(gDoc.id)) {
          st.removedGameIds.push(gDoc.id);
        }
        deletedGamesCount += 1;
      }
    }
  } catch (e) {
    console.warn('Error deleting banned user games:', e);
  }

  // 2. Delete their social wall document if present
  const wallKeys = Array.from(
    new Set([cleanUid, lowerName.replace(/[^a-z0-9_-]/g, '_')].filter(Boolean))
  );
  for (const wk of wallKeys) {
    try {
      await deleteDoc(doc(db, 'social_walls', wk));
    } catch (e) {}
  }

  // 3. Hard-delete or mark banned in Firestore users collection
  if (cleanUid) {
    try {
      if (hardDelete) {
        await deleteDoc(doc(db, 'users', cleanUid));
      } else {
        await setDoc(
          doc(db, 'users', cleanUid),
          {
            banned: true,
            banReason: reason,
            bannedAt: new Date().toISOString()
          },
          { merge: true }
        );
      }
    } catch (e) {
      console.warn('User Firestore ban/delete warning:', e);
    }
  }

  st.moderationLog.unshift({
    ts: new Date().toISOString(),
    action: hardDelete ? 'DELETE_USER' : 'BAN_USER',
    targetId: cleanUid || cleanEmail || cleanName,
    targetLabel: `${cleanName || cleanEmail || cleanUid} (${deletedGamesCount} giochi rimossi)`,
    reason
  });

  await saveModerationState(st);
  try {
    localStorage.removeItem('indieplay_fast_games_v3');
  } catch (e) {}

  return { state: st, deletedGamesCount };
}

export async function adminUnbanUser({ uid = '', displayName = '', email = '' }) {
  const cleanUid = String(uid || '').trim();
  const lowerName = String(displayName || '').trim().toLowerCase();
  const cleanEmail = String(email || '').trim().toLowerCase();

  const st = await syncModerationStateFromCloud();
  if (cleanUid) st.bannedUserIds = st.bannedUserIds.filter((x) => x !== cleanUid);
  if (lowerName) st.bannedUserHandles = st.bannedUserHandles.filter((x) => x !== lowerName);
  if (cleanEmail) st.bannedUserHandles = st.bannedUserHandles.filter((x) => x !== cleanEmail);

  if (cleanUid) {
    try {
      const uRef = doc(db, 'users', cleanUid);
      const snap = await getDoc(uRef);
      if (snap.exists()) {
        await setDoc(uRef, { banned: false, banReason: '', unbannedAt: new Date().toISOString() }, { merge: true });
      }
    } catch (e) {}
  }

  st.moderationLog.unshift({
    ts: new Date().toISOString(),
    action: 'UNBAN_USER',
    targetId: cleanUid || cleanEmail || lowerName,
    targetLabel: displayName || email || cleanUid,
    reason: 'Profilo riabilitato dall\'amministratore'
  });

  await saveModerationState(st);
  return st;
}
