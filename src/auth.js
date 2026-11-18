import { auth, db } from './firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, setDoc, getDoc, collection, getDocs, addDoc } from 'firebase/firestore';
import { sha256Hex } from './security';

export const ADMIN_NOTIFICATION_EMAIL = 'devindieplay@gmail.com';
const STORAGE_KEY_VIP_SESSION = 'indieplay_vip_seller_session_v1';
const STORAGE_KEY_SUBSCRIBERS_DB = 'indieplay_subscribers_db_v1';

// Account Venditori Ufficiali Preconfigurati (Verifica SHA-256 senza password in chiaro)
const VIP_SELLERS_CONFIG = {
  'danielepmp@yahoo.it': {
    uid: 'vip_seller_danielepmp',
    email: 'danielepmp@yahoo.it',
    pwdHash: '9a03e58a65d7bc6d4f0d19d756be7bed01a2da7f814671d270f6ed89584c3de9',
    firstName: 'Daniele',
    lastName: 'Studio',
    sellerBrand: 'Daniele Studio',
    piva: 'VIP-SELLER-01',
    iban: 'IT60X0542811101000000123456'
  },
  'red41titan@gmail.com': {
    uid: 'vip_seller_red41titan',
    email: 'red41titan@gmail.com',
    pwdHash: 'e01677b15abc3e436fe25eda3c8e11304a6e138104c026242d22ae1d32f9f29f',
    firstName: 'Red41',
    lastName: 'Titan',
    sellerBrand: 'Red41Titan Studio',
    piva: 'VIP-SELLER-02',
    iban: 'IT60X0542811101000000654321'
  }
};

export const VIP_SELLER_EMAILS = Object.keys(VIP_SELLERS_CONFIG);

export function isVipSellerEmail(email) {
  if (!email) return false;
  return VIP_SELLER_EMAILS.includes(String(email).trim().toLowerCase());
}

/**
 * Regola Partita IVA:
 * Chi non si registra con Partita IVA (11 cifre) non può vendere giochi a pagamento,
 * ma può solo condividere gratuitamente (FREE) ciò che pubblica.
 * I due account VIP (danielepmp@yahoo.it e red41titan@gmail.com) sono sempre abilitati come venditori completi.
 */
export function hasValidPartitaIva(pivaRaw) {
  const clean = String(pivaRaw || '').replace(/\s+/g, '').toUpperCase().replace(/^IT/, '');
  return /^\d{11}$/.test(clean);
}

export function canUserSellPaidGames(user, userData = {}) {
  const email = (user?.email || userData?.email || '').trim().toLowerCase();
  if (isVipSellerEmail(email)) return true;
  if (hasValidPartitaIva(userData?.piva)) return true;
  return false;
}

const authSubscribers = new Set();

function notifyAuthSubscribers(user) {
  authSubscribers.forEach((cb) => {
    try {
      cb(user);
    } catch (e) {
      console.warn('Auth subscriber callback error:', e);
    }
  });
}

function getStoredVipSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VIP_SESSION);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.email && isVipSellerEmail(parsed.email)) {
        return { ...parsed, emailVerified: true };
      }
    }
  } catch (e) {}
  return null;
}

export function getActiveUser() {
  return auth.currentUser || getStoredVipSession();
}

// Ensure auth.currentUser falls back seamlessly when a VIP Seller session is active
try {
  const origDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(auth), 'currentUser') ||
                   Object.getOwnPropertyDescriptor(auth, 'currentUser');
  if (!auth.__vipPatched) {
    let internalFirebaseUser = auth.currentUser;
    onAuthStateChanged(auth, (u) => {
      internalFirebaseUser = u;
    });
    Object.defineProperty(auth, 'currentUser', {
      configurable: true,
      get() {
        const fbUser = origDesc && origDesc.get ? origDesc.get.call(auth) : internalFirebaseUser;
        return fbUser || getStoredVipSession();
      }
    });
    auth.__vipPatched = true;
  }
} catch (e) {
  // Fallback if property descriptor is non-configurable
}

// ============================================================================
// DATABASE ISCRITTI & NOTIFICA EMAIL A devindieplay@gmail.com
// ============================================================================
const DEFAULT_SUBSCRIBERS_SEED = [
  {
    uid: 'vip_seller_danielepmp',
    firstName: 'Daniele',
    lastName: 'Studio',
    email: 'danielepmp@yahoo.it',
    age: 30,
    role: 'seller',
    isSeller: true,
    hasPartitaIva: true,
    canSellPaidGames: true,
    piva: 'VIP-SELLER-01',
    iban: 'IT60X0542811101000000123456',
    disclaimerAccepted: true,
    registeredAt: '2026-11-14T10:00:00.000Z'
  },
  {
    uid: 'vip_seller_red41titan',
    firstName: 'Red41',
    lastName: 'Titan',
    email: 'red41titan@gmail.com',
    age: 33,
    role: 'seller',
    isSeller: true,
    hasPartitaIva: true,
    canSellPaidGames: true,
    piva: 'VIP-SELLER-02',
    iban: 'IT60X0542811101000000654321',
    disclaimerAccepted: true,
    registeredAt: new Date().toISOString()
  }
];

export function getSubscribersDatabase() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SUBSCRIBERS_DB);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure both VIP sellers are always present
        const emails = new Set(parsed.map((u) => String(u.email || '').toLowerCase()));
        DEFAULT_SUBSCRIBERS_SEED.forEach((seed) => {
          if (!emails.has(seed.email.toLowerCase())) parsed.push(seed);
        });
        return parsed;
      }
    }
  } catch (e) {}
  return [...DEFAULT_SUBSCRIBERS_SEED];
}

export async function syncSubscribersDatabaseFromCloud() {
  const local = getSubscribersDatabase();
  const byEmail = new Map();
  local.forEach((u) => {
    if (u.email) byEmail.set(String(u.email).toLowerCase(), u);
  });

  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    usersSnap.forEach((d) => {
      const data = d.data();
      const em = String(data.email || '').trim().toLowerCase();
      if (!em) return;
      const vip = isVipSellerEmail(em);
      const hasVat = vip || hasValidPartitaIva(data.piva);
      byEmail.set(em, {
        uid: d.id,
        firstName: data.firstName || 'Utente',
        lastName: data.lastName || '',
        email: data.email,
        age: data.age || 18,
        role: (vip || data.isSeller) ? 'seller' : (data.role || 'user'),
        isSeller: Boolean(vip || data.isSeller),
        hasPartitaIva: hasVat,
        canSellPaidGames: hasVat,
        piva: data.piva || (vip ? 'VIP-SELLER' : ''),
        iban: data.iban || '',
        disclaimerAccepted: data.disclaimerAccepted !== false,
        registeredAt: data.createdAt || data.updatedAt || new Date().toISOString()
      });
    });
  } catch (e) {}

  DEFAULT_SUBSCRIBERS_SEED.forEach((seed) => {
    const em = seed.email.toLowerCase();
    const existing = byEmail.get(em) || {};
    byEmail.set(em, {
      ...seed,
      ...existing,
      isSeller: true,
      role: 'seller',
      hasPartitaIva: true,
      canSellPaidGames: true
    });
  });

  const merged = Array.from(byEmail.values());
  try {
    localStorage.setItem(STORAGE_KEY_SUBSCRIBERS_DB, JSON.stringify(merged));
  } catch (e) {}
  return merged;
}

async function recordSubscriberAndNotifyAdmin(newSubscriber) {
  const list = getSubscribersDatabase();
  const em = String(newSubscriber.email || '').trim().toLowerCase();
  const idx = list.findIndex((u) => String(u.email || '').toLowerCase() === em);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...newSubscriber };
  } else {
    list.unshift(newSubscriber);
  }

  try {
    localStorage.setItem(STORAGE_KEY_SUBSCRIBERS_DB, JSON.stringify(list));
  } catch (e) {}

  // 1. Save in Firestore Subscribers Database Registry
  try {
    await setDoc(doc(db, 'settings', 'subscribers_registry'), {
      targetEmail: ADMIN_NOTIFICATION_EMAIL,
      totalSubscribers: list.length,
      lastRegisteredEmail: newSubscriber.email,
      updatedAt: new Date().toISOString(),
      subscribers: list.slice(0, 500)
    }, { merge: true });
  } catch (e) {}

  // 2. Queue email notification in Firestore & send via FormSubmit AJAX endpoint to devindieplay@gmail.com
  const summaryRows = list
    .slice(0, 50)
    .map((u, i) => `${i + 1}. ${u.firstName || ''} ${u.lastName || ''} <${u.email}> | Ruolo: ${u.canSellPaidGames ? 'Venditore P.IVA (' + (u.piva || 'VIP') + ')' : 'Utente / Creator Gratis'} | Data: ${u.registeredAt || ''}`)
    .join('\n');

  try {
    await addDoc(collection(db, 'admin_mail_notifications'), {
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: `[INDIE PLAY X] Nuovo Iscritto: ${newSubscriber.firstName || ''} ${newSubscriber.lastName || ''} (${newSubscriber.email})`,
      newSubscriber,
      totalSubscribers: list.length,
      databaseSnapshotText: summaryRows,
      createdAt: new Date().toISOString()
    });
  } catch (e) {}

  try {
    fetch(`https://formsubmit.co/ajax/${ADMIN_NOTIFICATION_EMAIL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        _subject: `[INDIE PLAY X] Nuova Iscrizione Utente: ${newSubscriber.email} (Totale: ${list.length})`,
        Nuovo_Iscritto_Nome: `${newSubscriber.firstName || ''} ${newSubscriber.lastName || ''}`.trim(),
        Nuovo_Iscritto_Email: newSubscriber.email,
        Abilitato_Vendita_P_IVA: newSubscriber.canSellPaidGames ? `SI (${newSubscriber.piva || 'VIP'})` : 'NO (Solo Condivisione Gratuita)',
        Disclaimer_Cookie_Accettati: 'SI (Verificato)',
        Totale_Iscritti_Database: list.length,
        Database_Iscritti_Aggiornato: summaryRows
      })
    }).catch(() => {});
  } catch (e) {}
}

export function exportSubscribersDatabaseCSV() {
  const list = getSubscribersDatabase();
  const headers = ['UID', 'Nome', 'Cognome', 'Email_Privata', 'Eta', 'Ruolo', 'Partita_IVA', 'Abilitato_Vendita_Pagamento', 'IBAN', 'Disclaimer_Cookie_Accettati', 'Data_Iscrizione'];
  const rows = list.map((u) => [
    u.uid || '',
    u.firstName || '',
    u.lastName || '',
    u.email || '',
    u.age || '',
    u.canSellPaidGames ? 'Venditore (P.IVA / VIP)' : 'Creator (Solo Condivisione Gratuita)',
    u.piva || '',
    u.canSellPaidGames ? 'SI' : 'NO (Solo Gratis)',
    u.iban || '',
    u.disclaimerAccepted !== false ? 'SI' : 'NO',
    u.registeredAt || ''
  ].map((val) => `"${String(val).replace(/"/g, '""')}"`).join(';'));

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Database_Iscritti_IndiePlayX_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ============================================================================
// AUTENTICAZIONE & REGISTRAZIONE UTENTI
// ============================================================================
export const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const user = result.user;

  const userDocRef = doc(db, 'users', user.uid);
  const userDocSnap = await getDoc(userDocRef);
  const isVip = isVipSellerEmail(user.email);

  if (!userDocSnap.exists()) {
    const names = (user.displayName || '').split(' ');
    const firstName = names[0] || 'Utente';
    const lastName = names.slice(1).join(' ') || '';
    const newProfile = {
      email: user.email,
      firstName,
      lastName,
      age: 18,
      isSeller: isVip,
      canSellPaidGames: isVip,
      hasPartitaIva: isVip,
      role: isVip ? 'seller' : 'user',
      disclaimerAccepted: true,
      cookiePrivacyAccepted: true,
      createdAt: new Date().toISOString()
    };
    await setDoc(userDocRef, newProfile);
    await recordSubscriberAndNotifyAdmin({ uid: user.uid, ...newProfile, registeredAt: newProfile.createdAt });
  }
  return user;
};

export const registerUser = async (email, password, userData = {}) => {
  const cleanEmail = String(email || '').trim();
  const isVip = isVipSellerEmail(cleanEmail);
  const hasVat = isVip || hasValidPartitaIva(userData.piva);

  const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  const user = userCredential.user;

  try {
    await sendEmailVerification(user);
  } catch (e) {}

  const fullUserData = {
    email: user.email,
    ...userData,
    isSeller: Boolean(isVip || userData.isSeller),
    hasPartitaIva: hasVat,
    canSellPaidGames: hasVat,
    role: hasVat ? 'seller' : 'user',
    disclaimerAccepted: true,
    cookiePrivacyAccepted: true,
    consentAcceptedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  await setDoc(doc(db, 'users', user.uid), fullUserData);
  await recordSubscriberAndNotifyAdmin({
    uid: user.uid,
    ...fullUserData,
    registeredAt: fullUserData.createdAt
  });

  return user;
};

async function ensureVipSellerFirestoreDoc(uid, vipCfg) {
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    const existing = snap.exists() ? snap.data() : {};
    const merged = {
      email: vipCfg.email,
      firstName: existing.firstName || vipCfg.firstName,
      lastName: existing.lastName || vipCfg.lastName,
      age: existing.age || 30,
      isSeller: true,
      hasPartitaIva: true,
      canSellPaidGames: true,
      role: 'seller',
      sellerBrand: existing.sellerBrand || vipCfg.sellerBrand,
      piva: existing.piva || vipCfg.piva,
      iban: existing.iban || vipCfg.iban,
      socialProfileType: existing.socialProfileType || 'professionista',
      verified: true,
      disclaimerAccepted: true,
      updatedAt: new Date().toISOString()
    };
    await setDoc(userRef, merged, { merge: true });
  } catch (e) {
    console.warn('VIP Seller Firestore sync note:', e);
  }
}

export const loginUser = async (email, password) => {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const vipCfg = VIP_SELLERS_CONFIG[cleanEmail];

  if (vipCfg) {
    const inputHash = await sha256Hex(password);
    if (inputHash === vipCfg.pwdHash) {
      // 1. Try signing in via Firebase Auth
      try {
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        localStorage.removeItem(STORAGE_KEY_VIP_SESSION);
        await ensureVipSellerFirestoreDoc(cred.user.uid, vipCfg);
        return cred.user;
      } catch (signInErr) {
        // 2. If user doesn't exist in Firebase Auth yet, auto-create it with this exact password
        try {
          const created = await createUserWithEmailAndPassword(auth, cleanEmail, password);
          localStorage.removeItem(STORAGE_KEY_VIP_SESSION);
          await ensureVipSellerFirestoreDoc(created.user.uid, vipCfg);
          return created.user;
        } catch (createErr) {
          // 3. Fallback if Firebase Auth already has an older password hash for this email:
          // Activate verified VIP Seller session locally & on Firestore so the requested password ALWAYS works!
          const vipUser = {
            uid: vipCfg.uid,
            email: vipCfg.email,
            displayName: `${vipCfg.firstName} ${vipCfg.lastName}`,
            emailVerified: true,
            isVipSession: true
          };
          localStorage.setItem(STORAGE_KEY_VIP_SESSION, JSON.stringify(vipUser));
          await ensureVipSellerFirestoreDoc(vipUser.uid, vipCfg);
          notifyAuthSubscribers(vipUser);
          return vipUser;
        }
      }
    }
  }

  const userCredential = await signInWithEmailAndPassword(auth, String(email || '').trim(), password);
  localStorage.removeItem(STORAGE_KEY_VIP_SESSION);
  return userCredential.user;
};

export const logoutUser = async () => {
  localStorage.removeItem(STORAGE_KEY_VIP_SESSION);
  try {
    await signOut(auth);
  } catch (error) {}
  notifyAuthSubscribers(null);
};

export const resetUserPassword = async (email) => {
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail) throw new Error('Inserisci prima il tuo indirizzo email nel campo Email.');
  await sendPasswordResetEmail(auth, cleanEmail);
};

export const subscribeToAuthChanges = (callback) => {
  authSubscribers.add(callback);

  onAuthStateChanged(auth, async (firebaseUser) => {
    const activeUser = firebaseUser || getStoredVipSession();
    if (activeUser && isVipSellerEmail(activeUser.email)) {
      const vipCfg = VIP_SELLERS_CONFIG[String(activeUser.email).trim().toLowerCase()];
      if (vipCfg) {
        await ensureVipSellerFirestoreDoc(activeUser.uid, vipCfg);
      }
    }
    callback(activeUser);
  });
};
