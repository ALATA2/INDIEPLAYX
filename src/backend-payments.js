import { db, auth } from './firebase';
import { collection, getDocs, addDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { getLanguage, autoTranslateDOM } from './i18n';
import { escapeHTML, safeUrl, sha256Hex, checkRateLimit, resetRateLimit } from './security';
import { getSubscribersDatabase, syncSubscribersDatabaseFromCloud, exportSubscribersDatabaseCSV, checkAndSendDailySubscribersDigest, getDailySubscribersStats, getActiveUser, ADMIN_NOTIFICATION_EMAIL } from './auth';
import { initWoxlyticsTracker } from './woxlytics-tracker';

// Hash SHA-256 verificati nativamente via Web Crypto API (zero password in chiaro nel bundle)
const MAGAZINE_PASSWORD_HASH = 'f5cc70f88b12210cbd1758da2ba5e8de99787c31e70930538d0436be9756470a';
const BACKEND_PASSWORD_HASH = 'c94e1e094df381b87be436ce966fc5a4b20280dffdf0624e0d60b978499101a6';

const STORAGE_KEY_PAYMENT_CONFIG = 'indieplay_payment_config_v2';
const STORAGE_KEY_TRANSACTIONS = 'indieplay_split_transactions_v1';
const STORAGE_KEY_MAGAZINE_UNLOCKED = 'indieplay_mag_unlocked_v1';
const STORAGE_KEY_MAGAZINE_ARTICLES = 'indieplay_mag_articles_v1';

const DEFAULT_PAYMENT_CONFIG = {
  // Singole voci attivabili/disattivabili da pulsante nel Backend
  realPaymentsEnabled: false,       // 1. Transazioni Carte Reali (Default: DISATTIVATO -> Simulazione)
  splitPaymentEnabled: false,       // 2. Split-Payment Automatico verso Sviluppatori (Default: DISATTIVATO)
  strictIbanValidation: false,      // 3. Verifica Matematica IBAN Modulo-97 (Default: DISATTIVATO per test)
  merchEnabled: true,               // 4. Sezione & Acquisti Merchandising Ufficiale (Default: ATTIVO)
  magazineVisible: true,            // 5. Sezione IndiePlay Magazine in Homepage (Default: ATTIVO)
  reviewsEnabled: true,             // 6. Invio Nuove Recensioni Utenti (Default: ATTIVO)
  sellerRegistrationEnabled: true,  // 7. Registrazione Venditori & Pubblicazione Giochi (Default: ATTIVO)
  donationsEnabled: true,           // 8. Sistema Donazioni Profili Social (Privati & Professionisti) (Default: ATTIVO)
  bitbonkVisible: true,             // 9. Sezione BITBONK — Carte da Gioco & Sticker Album Series 01 (Default: ATTIVO)
  memeConsoleVisible: true,         // 10. Sezione MEME CONSOLE — Progetto Hardware Model MC-01 (Default: ATTIVO)
  maintenanceMode: false,           // 11. Modalità Sito Down / Manutenzione Temporanea (Default: DISATTIVATO)
  woxlyticsEnabled: true,           // 12. Piattaforma Analitica Privata /woxlytics (Default: ATTIVO)
  maintenanceTitle: 'WE ARE UPGRADING THE ARCADE!',
  maintenanceMessage: 'INDIE PLAY X is temporarily offline for scheduled maintenance and system upgrades. Hold tight — our team is tuning the servers and we will be back online shortly!',

  // Parametri economici e chiavi Gateway
  platformFeePercent: 15, // 15% piattaforma, 85% sviluppatore in automatico
  gatewayProvider: 'stripe_connect', // 'stripe_connect' | 'paypal_commerce' | 'sepa_split'
  stripePublishableKey: 'pk_live_indieplayx_configure_me',
  stripeConnectWebhookUrl: 'https://api.indieplayx.com/v1/stripe/split-payout',
  paypalBusinessEmail: 'devindieplay@gmail.com',
  paypalClientId: '',
  platformIban: 'IT60X0542811101000000123456',
  updatedAt: new Date().toISOString()
};

const DEFAULT_MAGAZINE_ARTICLES = [
  {
    id: 'mag-art-1',
    issue: 'Numero #1 — Edizione Lancio',
    category: 'COVER STORY',
    title: 'La Rivoluzione dell\'Indie Gaming Italiano: Dentro l\'Ecosistema IndiePlay-X',
    author: 'Redazione IndiePlay-X',
    date: 'Novembre 2026',
    readTime: '6 min',
    coverImg: '/images/merch_hoodie_samurai_1777198641485.png',
    gallery: ['/images/neon_samurai_screenshot_1_1777200476248.png'],
    linkedGameTitle: 'Alchemyst',
    linkedDev: 'NeonLabs',
    youtubeUrl: 'https://www.youtube.com/watch?v=dgITt4-wF6Y',
    likes: 24,
    summary: 'Come le nuove Vetrine Sviluppatore, il Cloud Gaming istantaneo e la distribuzione diretta stanno cambiando il modo di creare e vendere videogiochi indipendenti.',
    content: `Il panorama dello sviluppo indipendente sta vivendo una trasformazione storica. Con il lancio delle nuove Vetrine Sviluppatore su IndiePlay-X, ogni studio — dal singolo creatore nella propria stanza ai team strutturati come NeonLabs — dispone finalmente di uno spazio social e commerciale completo.

Nelle nostre interviste con i creatori di "Alchemist", "Neon Samurai" e "Serpe", emerge un punto comune: la possibilità di offrire contemporaneamente il download del pacchetto PC (.ZIP) e l'esecuzione istantanea via Cloud Browser abbatte ogni barriera tra il giocatore e l'opera.

Inoltre, l'integrazione del merchandising ufficiale direttamente nella scheda del gioco e nella vetrina dello studio permette ai fan di supportare concretamente i propri sviluppatori preferiti acquistando poster, t-shirt, felpe e action figure da collezione.`
  },
  {
    id: 'mag-art-2',
    issue: 'Numero #1 — Intervista Esclusiva',
    category: 'DIETRO LE QUINTE',
    title: 'NeonLabs racconta "Neon Samurai": Estetica Cyberpunk e Combattimenti a 60 FPS',
    author: 'Marco V. — Senior Editor',
    date: 'Novembre 2026',
    readTime: '5 min',
    coverImg: '/images/neon_samurai_screenshot_1_1777200476248.png',
    gallery: ['/images/neon_samurai_screenshot_2_1777200491479.png', '/images/neon_samurai_screenshot_3_1777200504709.png'],
    linkedGameTitle: 'Neon Samurai',
    linkedDev: 'NeonLabs',
    youtubeUrl: '',
    likes: 18,
    summary: 'Un viaggio nel level design, nella colonna sonora synthwave e nelle tecniche di ottimizzazione grafica che hanno reso Neon Samurai uno dei titoli più giocati.',
    content: `Abbiamo incontrato il team di NeonLabs per scoprire come è nato il sistema di combattimento all'arma bianca di Neon Samurai.

"Volevamo che ogni parata e ogni fendente restituissero un feedback visivo e sonoro immediato", spiega il lead designer. "Grazie alla pipeline WebGL e al pacchetto nativo distribuito su IndiePlay-X, siamo riusciti a mantenere 60 fotogrammi al secondo stabili anche nelle arene più dense di luci volumetriche e particellari."

Lo studio ha inoltre annunciato tre nuovi capitoli arcade retrò ispirati all'epoca d'oro Amiga 500, che debutteranno in esclusiva temporale proprio su IndiePlay-X nei prossimi mesi.`
  },
  {
    id: 'mag-art-3',
    issue: 'Numero #1 — Guida Tecnica',
    category: 'SVILUPPATORI & MONETIZZAZIONE',
    title: 'Dal Codice al Mercato: Come Ottimizzare la Tua Vetrina e lo Split-Payment',
    author: 'Team Tecnico IndiePlay-X',
    date: 'Novembre 2026',
    readTime: '4 min',
    coverImg: '/images/merch_tshirt_samurai_1777201074364.png',
    gallery: [],
    linkedGameTitle: '',
    linkedDev: 'IndiePlay',
    youtubeUrl: 'https://www.youtube.com/watch?v=gbRqg1oY8hs',
    likes: 15,
    summary: 'I consigli pratici per configurare il proprio profilo venditore, comprimere gli asset grafici sotto i 300KB e massimizzare le conversioni.',
    content: `Pubblicare un videogioco è solo metà dell'opera: presentarlo al meglio ai giocatori è ciò che determina il successo commerciale.

1. Cura la tua Social Bio: Accedi alla sezione Account -> Profilo Venditore e compila il Nome Brand e la Descrizione Vetrina. I giocatori che cliccano sul tuo nome nella pagina di un gioco atterreranno direttamente sulla tua vetrina pubblica.
2. Immagini leggere e nitide: Mantieni cover e screenshot ottimizzati (sotto i 300KB) per garantire un caricamento istantaneo anche su reti mobili.
3. Architettura Split-Payment: Il motore di ripartizione automatica dei ricavi di IndiePlay-X calcola istantaneamente la quota spettante allo sviluppatore e la indirizza verso l'IBAN registrato nel profilo venditore.`
  }
];

export function getPaymentConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PAYMENT_CONFIG);
    if (raw) {
      return { ...DEFAULT_PAYMENT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Error reading payment config:', e);
  }
  return { ...DEFAULT_PAYMENT_CONFIG };
}

export async function syncPaymentConfigFromCloud() {
  try {
    const snap = await getDoc(doc(db, 'platform_config', 'payments'));
    if (snap.exists()) {
      const merged = { ...DEFAULT_PAYMENT_CONFIG, ...snap.data() };
      localStorage.setItem(STORAGE_KEY_PAYMENT_CONFIG, JSON.stringify(merged));
      applyBackendFeatureFlags(merged);
      return merged;
    }
  } catch (e) {}
  const local = getPaymentConfig();
  applyBackendFeatureFlags(local);
  return local;
}

export async function savePaymentConfig(newConfig) {
  const merged = {
    ...getPaymentConfig(),
    ...newConfig,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY_PAYMENT_CONFIG, JSON.stringify(merged));
  applyBackendFeatureFlags(merged);
  try {
    await setDoc(doc(db, 'platform_config', 'payments'), merged, { merge: true });
  } catch (e) {
    console.warn('Saved payment config locally:', e);
  }
  window.dispatchEvent(new CustomEvent('indieplay:paymentconfigchange', { detail: merged }));
  return merged;
}

export function applyBackendFeatureFlags(cfg = getPaymentConfig()) {
  // Visibility of Merchandising section
  const merchSec = document.getElementById('merch-section');
  if (merchSec) {
    merchSec.style.display = cfg.merchEnabled === false ? 'none' : '';
  }
  document.querySelectorAll('a[href*="merch-section"]').forEach(link => {
    const li = link.closest('li') || link;
    li.style.display = cfg.merchEnabled === false ? 'none' : '';
  });

  // Visibility of Magazine section
  const magSec = document.getElementById('magazine-section');
  if (magSec) {
    magSec.style.display = cfg.magazineVisible === false ? 'none' : '';
  }
  document.querySelectorAll('a[href*="magazine-section"]').forEach(link => {
    const li = link.closest('li') || link;
    li.style.display = cfg.magazineVisible === false ? 'none' : '';
  });

  // Visibility of Reviews form
  const writeReviewBox = document.getElementById('write-review-container');
  if (writeReviewBox && cfg.reviewsEnabled === false) {
    writeReviewBox.innerHTML = `<div style="padding:1rem; background:rgba(255,255,255,0.03); border-radius:8px; color:var(--text-gray); text-align:center;">L'invio di nuove recensioni è temporaneamente disattivato dall'amministratore.</div>`;
  }

  // Seller registration toggle
  const sellerToggleBox = document.querySelector('.seller-toggle-box');
  if (sellerToggleBox) {
    sellerToggleBox.style.display = cfg.sellerRegistrationEnabled === false ? 'none' : '';
  }

  // Visibility of BitBonk section
  const bitbonkSec = document.getElementById('bitbonk-section');
  if (bitbonkSec) {
    bitbonkSec.style.display = cfg.bitbonkVisible === false ? 'none' : '';
  }
  document.querySelectorAll('a[href*="bitbonk-section"]').forEach(link => {
    const li = link.closest('li') || link;
    li.style.display = cfg.bitbonkVisible === false ? 'none' : '';
  });

  // Visibility of Meme Console section
  const memeSec = document.getElementById('meme-console-section');
  if (memeSec) {
    memeSec.style.display = cfg.memeConsoleVisible === false ? 'none' : '';
  }
  document.querySelectorAll('a[href*="meme-console-section"]').forEach(link => {
    const li = link.closest('li') || link;
    li.style.display = cfg.memeConsoleVisible === false ? 'none' : '';
  });

  // Full-screen Maintenance / Site Down overlay (never blocks /bitmeme admin hub)
  applyMaintenanceOverlay(cfg);
}

function applyMaintenanceOverlay(cfg = getPaymentConfig()) {
  const isBitmemeAdminPage = Boolean(
    document.getElementById('bitmeme-hub-root') ||
    (typeof window !== 'undefined' && window.location.pathname.toLowerCase().includes('bitmeme'))
  );
  const existing = document.getElementById('ipx-maintenance-overlay');

  if (!cfg.maintenanceMode || isBitmemeAdminPage) {
    if (existing) existing.remove();
    if (document.body && document.body.dataset.maintLocked === 'true') {
      document.body.style.overflow = '';
      delete document.body.dataset.maintLocked;
    }
    return;
  }

  const assetHelper = window.getAssetUrl || ((p) => p);
  const titleText = cfg.maintenanceTitle || 'WE ARE UPGRADING THE ARCADE!';
  const msgText = cfg.maintenanceMessage || 'INDIE PLAY X is temporarily offline for scheduled maintenance and system upgrades. Hold tight — our team is tuning the servers and we will be back online shortly!';

  const overlay = existing || document.createElement('div');
  overlay.id = 'ipx-maintenance-overlay';
  overlay.style.cssText = 'position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 999999; background: radial-gradient(circle at 50% 38%, #112236 0%, #050b14 58%, #00050d 100%); color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.5rem; text-align: center; overflow-y: auto;';
  overlay.innerHTML = `
    <div style="max-width: 640px; width: 100%; display: flex; flex-direction: column; align-items: center;">
      <img src="${safeUrl(assetHelper('/images/indieplayx_logo.svg'))}" alt="INDIE PLAY X" style="height: 46px; width: auto; object-fit: contain; margin-bottom: 1rem; filter: drop-shadow(0 4px 16px rgba(0, 168, 225, 0.35));">

      <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(245, 158, 11, 0.16); border: 1px solid rgba(245, 158, 11, 0.5); color: #fbbf24; padding: 5px 14px; border-radius: 999px; font-size: 0.75rem; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 1rem;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; display: inline-block; box-shadow: 0 0 10px #f59e0b;"></span>
        SCHEDULED MAINTENANCE • TEMPORARILY OFFLINE
      </div>

      <div style="position: relative; margin: 0.2rem 0 1.1rem; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 240px; height: 240px; border-radius: 50%; background: radial-gradient(circle, rgba(20, 184, 166, 0.28) 0%, rgba(250, 204, 21, 0.12) 48%, transparent 72%); filter: blur(18px); pointer-events: none;"></div>
        <img src="${safeUrl(assetHelper('/images/maintenance_retro_hero.png'))}" alt="IndiePlay-X Maintenance" style="height: clamp(230px, 38vh, 330px); width: auto; object-fit: contain; position: relative; z-index: 2; filter: drop-shadow(0 18px 35px rgba(0,0,0,0.85));">
      </div>

      <h1 style="font-size: clamp(1.55rem, 3.5vw, 2.35rem); font-weight: 900; color: #ffffff; margin: 0 0 0.7rem; letter-spacing: 0.5px; line-height: 1.2; text-shadow: 0 4px 20px rgba(0,0,0,0.7);">
        ${escapeHTML(titleText)}
      </h1>

      <p style="font-size: clamp(0.92rem, 1.6vw, 1.05rem); color: #cbd5e1; line-height: 1.65; margin: 0 0 1.4rem; max-width: 540px;">
        ${escapeHTML(msgText)}
      </p>

      <div style="display: inline-flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 0.7rem 1.2rem; font-size: 0.8rem; color: #94a3b8;">
        <i class="fas fa-tools" style="color: #38bdf8;"></i>
        <span>We'll be back online very soon • Thank you for your patience!</span>
      </div>
    </div>
  `;

  if (!existing && document.body) {
    document.body.appendChild(overlay);
  }
  if (document.body) {
    document.body.style.overflow = 'hidden';
    document.body.dataset.maintLocked = 'true';
  }
}

// Compress uploaded image via Canvas to keep base64 fast and lightweight (<200KB)
function compressImageToDataUrl(file, maxWidth = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Luhn check for real credit card validation when Real Payments are enabled
export function validateCardLuhn(cardNumberRaw) {
  const digits = (cardNumberRaw || '').replace(/\D+/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// Calculate automatic Split-Payment between Platform and Developer
export function calculateSplitPayment(priceRaw) {
  const cfg = getPaymentConfig();
  const amount = Math.max(0, parseFloat(String(priceRaw).replace(',', '.')) || 0);
  const feePct = Math.min(95, Math.max(0, Number(cfg.platformFeePercent) || 15));
  const devPct = 100 - feePct;
  const platformShare = Number(((amount * feePct) / 100).toFixed(2));
  const developerShare = Number((amount - platformShare).toFixed(2));
  return {
    totalAmount: Number(amount.toFixed(2)),
    platformFeePercent: feePct,
    developerPercent: devPct,
    platformShare,
    developerShare,
    splitActive: Boolean(cfg.splitPaymentEnabled),
    realActive: Boolean(cfg.realPaymentsEnabled),
    mode: cfg.realPaymentsEnabled
      ? (cfg.splitPaymentEnabled ? 'REAL_SPLIT_PAYMENT' : 'REAL_DIRECT')
      : 'SIMULATION'
  };
}

export function getStoredTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRANSACTIONS);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

export async function recordSplitTransaction(txData) {
  const split = calculateSplitPayment(txData.price || 0);
  const cfg = getPaymentConfig();
  const record = {
    id: 'TX-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    createdAt: new Date().toISOString(),
    gameId: txData.gameId || '',
    gameTitle: txData.gameTitle || 'Prodotto IndiePlay-X',
    developerName: txData.developerName || 'Sviluppatore Indie',
    sellerId: txData.sellerId || '',
    sellerIban: txData.sellerIban || 'IBAN Archiviato su Firestore',
    buyerUid: txData.buyerUid || '',
    buyerEmail: txData.buyerEmail || '',
    totalAmount: split.totalAmount,
    developerShare: split.developerShare,
    platformShare: split.platformShare,
    platformFeePercent: split.platformFeePercent,
    developerPercent: split.developerPercent,
    mode: cfg.realPaymentsEnabled
      ? (cfg.splitPaymentEnabled ? 'REALE + SPLIT-PAYMENT AUTO' : 'REALE (Senza Split)')
      : 'SIMULAZIONE (Test)',
    gateway: cfg.realPaymentsEnabled ? cfg.gatewayProvider : 'sandbox_simulated',
    payoutStatus: cfg.splitPaymentEnabled ? 'ACCREDITATO_SPLIT_AUTO' : 'STANDARD'
  };

  const list = getStoredTransactions();
  list.unshift(record);
  localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(list.slice(0, 100)));

  try {
    await addDoc(collection(db, 'transactions'), record);
  } catch (e) {}
  return record;
}

// ============================================================================
// 1. INDIEPLAY MAGAZINE PUBBLICO + REDAZIONE PROTETTA DA PASSWORD
// ============================================================================
export function isMagazineAdminUnlocked() {
  return sessionStorage.getItem(STORAGE_KEY_MAGAZINE_UNLOCKED) === 'true';
}

function sanitizeMagazineImg(url) {
  if (!url || typeof url !== 'string') return '/images/merch_hoodie_samurai_1777198641485.png';
  return url
    .replace('/images/merch_neon_samurai_poster.png', '/images/merch_hoodie_samurai_1777198641485.png')
    .replace('/images/merch_tshirt_mockup_1787498735596.png', '/images/merch_tshirt_samurai_1777201074364.png');
}

function sanitizeMagazineArticles(list) {
  return (list || []).map(art => ({
    ...art,
    coverImg: sanitizeMagazineImg(art.coverImg),
    gallery: Array.isArray(art.gallery) ? art.gallery.map(sanitizeMagazineImg) : []
  }));
}

export function getMagazineArticles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MAGAZINE_ARTICLES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return sanitizeMagazineArticles(parsed);
    }
  } catch (e) {}
  return sanitizeMagazineArticles(DEFAULT_MAGAZINE_ARTICLES);
}

export async function saveMagazineArticles(articles) {
  const clean = sanitizeMagazineArticles(articles);
  localStorage.setItem(STORAGE_KEY_MAGAZINE_ARTICLES, JSON.stringify(clean));
  try {
    await setDoc(doc(db, 'platform_config', 'magazine'), {
      articles: clean,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (e) {}
}

export async function syncMagazineFromCloud() {
  try {
    const snap = await getDoc(doc(db, 'platform_config', 'magazine'));
    if (snap.exists() && Array.isArray(snap.data().articles) && snap.data().articles.length > 0) {
      const clean = sanitizeMagazineArticles(snap.data().articles);
      localStorage.setItem(STORAGE_KEY_MAGAZINE_ARTICLES, JSON.stringify(clean));
      renderMagazineSection();
    }
  } catch (e) {}
}

let currentMagazineCategory = 'TUTTE';
let editingMagazineArticleId = null;

function extractYouTubeEmbedUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const match = url.trim().match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : '';
}

function getLikedMagazineIds() {
  try {
    return JSON.parse(localStorage.getItem('indieplay_mag_likes_v1') || '[]');
  } catch (e) {
    return [];
  }
}

export function initMagazineSystem() {
  const magSection = document.getElementById('magazine-section');
  if (!magSection) return;

  injectMagazineModals();
  renderMagazineSection();
  syncMagazineFromCloud();

  // Deep-link: apri direttamente l'articolo condiviso se presente ?article=<id>
  try {
    const params = new URLSearchParams(window.location.search);
    const articleId = params.get('article');
    if (articleId) {
      const target = getMagazineArticles().find(a => a.id === articleId);
      if (target) {
        setTimeout(() => openMagazineReaderModal(target), 250);
      }
    }
  } catch (e) {}

  window.addEventListener('indieplay:langchange', () => {
    autoTranslateDOM(getLanguage());
  });
}

function renderMagazineSection() {
  const magSection = document.getElementById('magazine-section');
  if (!magSection) return;

  const isEditor = isMagazineAdminUnlocked();
  const articles = getMagazineArticles();
  const assetHelper = window.getAssetUrl || ((p) => p);

  const categories = ['TUTTE', ...new Set(articles.map(a => (a.category || 'EDITORIALE').toUpperCase()))];
  if (!categories.includes(currentMagazineCategory)) currentMagazineCategory = 'TUTTE';

  const filtered = currentMagazineCategory === 'TUTTE'
    ? articles
    : articles.filter(a => (a.category || 'EDITORIALE').toUpperCase() === currentMagazineCategory);

  const coverStory = (currentMagazineCategory === 'TUTTE' && filtered.length > 0) ? filtered[0] : null;
  const gridArticles = coverStory ? filtered.slice(1) : filtered;
  const likedIds = getLikedMagazineIds();

  const renderCardActions = (art) => {
    const liked = likedIds.includes(art.id);
    const likesCount = Number(art.likes || 0);
    return `
      <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
        <button class="btn btn-prime-outline like-mag-btn" data-art-id="${art.id}" title="Mi piace" style="padding: 0.42rem 0.7rem; font-size: 0.78rem; border-color: ${liked ? '#f43f5e' : 'rgba(255,255,255,0.18)'}; color: ${liked ? '#fb7185' : '#cbd5e1'};">
          <i class="${liked ? 'fas' : 'far'} fa-heart"></i> <span>${likesCount}</span>
        </button>
        <button class="btn btn-prime-outline share-mag-btn" data-art-id="${art.id}" title="Condividi link articolo" style="padding: 0.42rem 0.7rem; font-size: 0.78rem;">
          <i class="fas fa-share-alt"></i>
        </button>
        ${isEditor ? `
          <button class="btn btn-prime-outline edit-mag-article-btn" data-art-id="${art.id}" title="Modifica articolo" style="padding: 0.42rem 0.7rem; font-size: 0.78rem; border-color: #fbbf24; color: #fbbf24;">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-prime-outline delete-mag-article-btn" data-art-id="${art.id}" title="Elimina articolo" style="padding: 0.42rem 0.7rem; font-size: 0.78rem; border-color: #ef4444; color: #f87171;">
            <i class="fas fa-trash"></i>
          </button>
        ` : ''}
        <button class="btn btn-prime read-mag-article-btn" data-art-id="${art.id}" style="padding: 0.48rem 0.95rem; font-size: 0.82rem; font-weight: 700;">
          <i class="fas fa-book-open"></i> <span data-i18n="mag_read_btn">Leggi Articolo</span>
        </button>
      </div>
    `;
  };

  magSection.style.opacity = '1';
  magSection.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-top: 1rem; margin-bottom: 1.1rem;">
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <h2 id="open-mag-title-trigger" title="Clicca per entrare nella rivista sfogliabile" style="margin: 0; font-size: 1.65rem; color: white; font-weight: 900; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; transition: color 0.2s ease;" data-i18n="title_magazine">IndiePlay Magazine</h2>
        <button id="open-mag-issue-btn" class="btn btn-prime" style="padding: 0.45rem 1rem; border-radius: 999px; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.4px; display: inline-flex; align-items: center; gap: 7px; box-shadow: 0 4px 14px rgba(0, 168, 225, 0.35);">
          <i class="fas fa-book-open"></i> <span>ENTRA NELLA RIVISTA</span>
        </button>
      </div>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        ${!isEditor ? '' : `
          <button id="open-mag-cms-btn" class="btn btn-prime" style="padding: 0.65rem 1.2rem; font-weight: 800; display: inline-flex; align-items: center; gap: 8px;">
            <i class="fas fa-plus-circle"></i> <span>Carica Nuovo Articolo / Foto</span>
          </button>
          <button id="lock-mag-btn" class="btn btn-prime-outline" style="padding: 0.65rem 1.1rem; font-weight: 700;">
            <i class="fas fa-sign-out-alt"></i> <span>Esci da Redazione</span>
          </button>
        `}
      </div>
    </div>

    <!-- Filtri per Rubrica / Categoria -->
    <div class="mag-category-filters" style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 0.8rem; margin-bottom: 1.2rem; scrollbar-width: none;">
      ${categories.map(cat => {
        const active = cat === currentMagazineCategory;
        return `
          <button type="button" class="mag-cat-pill" data-cat="${cat}" style="white-space: nowrap; padding: 6px 14px; border-radius: 999px; font-size: 0.78rem; font-weight: 800; cursor: pointer; border: 1px solid ${active ? 'var(--prime-blue)' : 'rgba(255,255,255,0.14)'}; background: ${active ? 'var(--prime-blue)' : 'rgba(255,255,255,0.04)'}; color: white; transition: all 0.2s ease;">
            ${cat === 'TUTTE' ? '✦ Tutte le Rubriche' : cat}
          </button>
        `;
      }).join('')}
    </div>

    ${coverStory ? `
      <!-- Cover Story in Primo Piano -->
      <article class="mag-cover-story" style="background: linear-gradient(135deg, rgba(0, 168, 225, 0.08), rgba(255, 255, 255, 0.02)); border: 1px solid rgba(0, 168, 225, 0.35); border-radius: 14px; overflow: hidden; display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); margin-bottom: 1.8rem;">
        <div class="read-mag-article-trigger" data-art-id="${coverStory.id}" style="min-height: 250px; background: url('${assetHelper(coverStory.coverImg)}') no-repeat center center; background-size: cover; position: relative; cursor: pointer;">
          <span style="position: absolute; top: 14px; left: 14px; background: linear-gradient(135deg, #f59e0b, #ea580c); color: white; padding: 4px 12px; border-radius: 6px; font-size: 0.74rem; font-weight: 900; box-shadow: 0 4px 12px rgba(0,0,0,0.4);">
            <i class="fas fa-star"></i> IN COPERTINA • ${coverStory.category || 'COVER STORY'}
          </span>
          ${coverStory.youtubeUrl ? `<span style="position: absolute; bottom: 12px; left: 12px; background: rgba(220, 38, 38, 0.9); color: white; padding: 3px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: 800;"><i class="fab fa-youtube"></i> Video Inclusi</span>` : ''}
        </div>
        <div style="padding: 1.6rem; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
          <div>
            <div style="font-size: 0.82rem; color: var(--prime-blue); font-weight: 800; margin-bottom: 6px;">
              ${coverStory.issue || 'Numero #1'} • ${coverStory.date || '2026'} • <i class="far fa-clock"></i> ${coverStory.readTime || '5 min'}
            </div>
            <h3 class="read-mag-article-trigger" data-art-id="${coverStory.id}" style="color: white; font-size: 1.45rem; font-weight: 900; line-height: 1.28; margin-bottom: 0.75rem; cursor: pointer;">${coverStory.title}</h3>
            <p style="color: #cbd5e1; font-size: 0.94rem; line-height: 1.6; margin-bottom: 0.9rem;">${coverStory.summary}</p>
            ${(coverStory.linkedGameTitle || coverStory.linkedDev) ? `
              <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 0.4rem;">
                ${coverStory.linkedGameTitle ? `<span style="background: rgba(16,185,129,0.14); border: 1px solid rgba(16,185,129,0.35); color: #34d399; padding: 3px 10px; border-radius: 6px; font-size: 0.74rem; font-weight: 700;"><i class="fas fa-gamepad"></i> Gioco: ${coverStory.linkedGameTitle}</span>` : ''}
                ${coverStory.linkedDev ? `<span style="background: rgba(56,189,248,0.14); border: 1px solid rgba(56,189,248,0.35); color: #38bdf8; padding: 3px 10px; border-radius: 6px; font-size: 0.74rem; font-weight: 700;"><i class="fas fa-user-astronaut"></i> Studio: ${coverStory.linkedDev}</span>` : ''}
              </div>
            ` : ''}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 0.9rem;">
            <span style="font-size: 0.8rem; color: var(--text-gray); font-weight: 600;"><i class="fas fa-pen-nib"></i> ${coverStory.author || 'Redazione'}</span>
            ${renderCardActions(coverStory)}
          </div>
        </div>
      </article>
    ` : ''}

    <!-- Griglia Pubblica degli Articoli del Magazine (Scrollabile su Mobile) -->
    <div class="magazine-articles-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(295px, 1fr)); gap: 1.5rem;">
      ${gridArticles.map((art) => `
        <article class="mag-article-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.25s ease, border-color 0.25s ease;">
          <div>
            <div style="height: 185px; background: url('${assetHelper(art.coverImg)}') no-repeat center center; background-size: cover; position: relative; cursor: pointer;" class="read-mag-article-trigger" data-art-id="${art.id}">
              <span style="position: absolute; top: 12px; left: 12px; background: var(--prime-blue); color: white; padding: 3px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: 800;">${art.category || 'EDITORIALE'}</span>
              ${Array.isArray(art.gallery) && art.gallery.length > 0 ? `
                <span style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.75); color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">
                  <i class="fas fa-images"></i> +${art.gallery.length} foto
                </span>
              ` : ''}
              ${art.youtubeUrl ? `
                <span style="position: absolute; bottom: 10px; left: 10px; background: rgba(220,38,38,0.9); color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 800;">
                  <i class="fab fa-youtube"></i> Video
                </span>
              ` : ''}
              <span style="position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.75); color: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;"><i class="far fa-clock"></i> ${art.readTime || '5 min'}</span>
            </div>
            <div style="padding: 1.3rem;">
              <div style="font-size: 0.78rem; color: var(--prime-blue); font-weight: 700; margin-bottom: 4px;">${escapeHTML(art.issue || 'Numero #1')} • ${escapeHTML(art.date || '2026')}</div>
              <h3 style="color: white; font-size: 1.12rem; font-weight: 800; line-height: 1.35; margin-bottom: 10px; cursor: pointer;" class="read-mag-article-trigger" data-art-id="${escapeHTML(art.id)}">${escapeHTML(art.title)}</h3>
              <p style="color: var(--text-gray); font-size: 0.88rem; line-height: 1.55; margin-bottom: 1rem;">${escapeHTML(art.summary)}</p>
            </div>
          </div>
          <div style="padding: 0 1.3rem 1.3rem; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 0.78rem; color: var(--text-gray); font-weight: 600;"><i class="fas fa-pen-nib"></i> ${escapeHTML(art.author || 'Redazione')}</span>
            ${renderCardActions(art)}
          </div>
        </article>
      `).join('')}
    </div>
  `;

  // Wire category filter pills
  magSection.querySelectorAll('.mag-cat-pill').forEach(pill => {
    pill.onclick = () => {
      currentMagazineCategory = pill.getAttribute('data-cat') || 'TUTTE';
      renderMagazineSection();
    };
  });

  // Wire Enter Full Interactive Magazine Viewer (clicking title or "Entra nella Rivista" button)
  const enterMagTitle = document.getElementById('open-mag-title-trigger');
  const enterMagBtn = document.getElementById('open-mag-issue-btn');
  if (enterMagTitle) enterMagTitle.onclick = () => openMagazineIssueViewer(0);
  if (enterMagBtn) enterMagBtn.onclick = () => openMagazineIssueViewer(0);

  // Wire Editorial Login button
  const openLoginBtn = document.getElementById('open-mag-login-btn');
  if (openLoginBtn) {
    openLoginBtn.onclick = () => {
      const m = document.getElementById('magazine-auth-modal');
      const inp = document.getElementById('magazine-password-input');
      if (m) {
        m.style.display = 'flex';
        if (inp) {
          inp.value = '';
          setTimeout(() => inp.focus(), 100);
        }
      }
    };
  }

  // Wire Logout from Editorial Mode
  const lockBtn = document.getElementById('lock-mag-btn');
  if (lockBtn) {
    lockBtn.onclick = () => {
      sessionStorage.removeItem(STORAGE_KEY_MAGAZINE_UNLOCKED);
      renderMagazineSection();
      if (window.showToast) window.showToast('Sessione Redazione chiusa.', 'info');
    };
  }

  // Wire Open CMS Modal (New Article)
  const openCmsBtn = document.getElementById('open-mag-cms-btn');
  if (openCmsBtn) {
    openCmsBtn.onclick = () => openMagazineCmsModal(null);
  }

  // Wire Read Article triggers (public for everyone)
  magSection.querySelectorAll('.read-mag-article-btn, .read-mag-article-trigger').forEach(el => {
    el.onclick = () => {
      const id = el.getAttribute('data-art-id');
      const found = articles.find(a => a.id === id);
      openMagazineReaderModal(found);
    };
  });

  // Wire Like buttons
  magSection.querySelectorAll('.like-mag-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-art-id');
      const liked = getLikedMagazineIds();
      const alreadyLiked = liked.includes(id);
      const nextLiked = alreadyLiked ? liked.filter(x => x !== id) : [...liked, id];
      localStorage.setItem('indieplay_mag_likes_v1', JSON.stringify(nextLiked));

      const updated = articles.map(a => {
        if (a.id !== id) return a;
        const baseLikes = Number(a.likes || 0);
        return { ...a, likes: Math.max(0, baseLikes + (alreadyLiked ? -1 : 1)) };
      });
      await saveMagazineArticles(updated);
      renderMagazineSection();
    };
  });

  // Wire Share buttons
  magSection.querySelectorAll('.share-mag-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-art-id');
      const shareUrl = `${window.location.origin}${window.location.pathname}?article=${encodeURIComponent(id)}`;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).catch(() => {});
      }
      if (window.showToast) window.showToast('Link diretto dell\'articolo copiato negli appunti!', 'success');
    };
  });

  // Wire Edit Article buttons (only visible in Editorial mode)
  magSection.querySelectorAll('.edit-mag-article-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-art-id');
      const found = articles.find(a => a.id === id);
      if (found) openMagazineCmsModal(found);
    };
  });

  // Wire Delete Article buttons (only visible in Editorial mode)
  magSection.querySelectorAll('.delete-mag-article-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-art-id');
      const updated = articles.filter(a => a.id !== id);
      await saveMagazineArticles(updated);
      renderMagazineSection();
      if (window.showToast) window.showToast('Articolo rimosso dal Magazine.', 'info');
    };
  });

  autoTranslateDOM(getLanguage());
}

let pendingCoverDataUrl = '';
let pendingGalleryDataUrls = [];

function injectMagazineModals() {
  if (document.getElementById('magazine-auth-modal')) return;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <!-- Modal Login Password Redazione Magazine -->
    <div id="magazine-auth-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3000;">
      <div class="modal-content glass" style="background: rgba(18, 26, 36, 0.98); border: 1px solid rgba(0, 168, 225, 0.4); border-radius: 16px; padding: 2.2rem; max-width: 440px; width: 92%; color: white; position: relative; box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
        <span class="close-lightbox" id="close-mag-auth" style="position: absolute; top: 0.8rem; right: 1.2rem; font-size: 2.2rem; cursor: pointer; color: var(--text-gray);">&times;</span>
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 1.2rem;">
          <div style="width: 46px; height: 46px; border-radius: 12px; background: rgba(0, 168, 225, 0.15); border: 1px solid var(--prime-blue); display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-camera-retro" style="color: var(--prime-blue); font-size: 1.3rem;"></i>
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.25rem; font-weight: 800;">Redazione IndiePlay Magazine</h3>
            <span style="font-size: 0.8rem; color: var(--text-gray);">Inserisci la password per caricare articoli e foto</span>
          </div>
        </div>
        <form id="magazine-auth-form" style="display: flex; flex-direction: column; gap: 1rem;">
          <div class="form-group">
            <label style="font-size: 0.82rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 6px;">PASSWORD REDAZIONE</label>
            <input type="password" id="magazine-password-input" required placeholder="Inserisci password Redazione..." style="width: 100%; padding: 12px; background: #111922; border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; color: white; font-size: 1rem;">
          </div>
          <button type="submit" class="btn btn-prime" style="width: 100%; padding: 0.9rem; font-weight: 800; justify-content: center;">
            <i class="fas fa-unlock-alt"></i> Accedi al Caricamento Articoli & Foto
          </button>
        </form>
      </div>
    </div>

    <!-- Modal Lettore Pubblico Articolo Magazine -->
    <div id="magazine-reader-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3100;">
      <div class="modal-content glass" style="background: rgba(18, 26, 36, 0.99); border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; padding: 2.2rem; max-width: 740px; width: 94%; max-height: 88vh; overflow-y: auto; color: white; position: relative;">
        <span class="close-lightbox" id="close-mag-reader" style="position: absolute; top: 0.8rem; right: 1.2rem; font-size: 2.2rem; cursor: pointer; color: var(--text-gray);">&times;</span>
        <div id="magazine-reader-body"></div>
      </div>
    </div>

    <!-- Lightbox Ingrandimento Foto Articolo Magazine -->
    <div id="magazine-photo-lightbox" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3300; background: rgba(0,0,0,0.92);">
      <span class="close-lightbox" id="close-mag-photo-lightbox" style="position: absolute; top: 1.2rem; right: 1.8rem; font-size: 2.8rem; cursor: pointer; color: white;">&times;</span>
      <img id="magazine-photo-lightbox-img" src="" alt="Foto Ingrandita" style="max-width: 92vw; max-height: 88vh; border-radius: 10px; box-shadow: 0 20px 60px rgba(0,0,0,0.9); object-fit: contain;">
    </div>

    <!-- Modal Rivista Digitale Sfogliabile a Tutto Schermo (Digital Issue Viewer) -->
    <div id="magazine-issue-viewer-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3200; background: rgba(2, 6, 14, 0.96); backdrop-filter: blur(16px);">
      <div id="magazine-issue-shell" style="width: 96vw; max-width: 1120px; height: 92vh; background: #0c1420; border: 1px solid rgba(0, 168, 225, 0.35); border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.9);">
        <!-- Masthead Barra Superiore della Rivista -->
        <div style="background: rgba(15, 23, 36, 0.98); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 0.75rem 1.25rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="background: linear-gradient(135deg, #00a8e1, #0284c7); color: white; padding: 4px 10px; border-radius: 6px; font-weight: 900; font-size: 0.76rem; letter-spacing: 0.8px;">INDIEPLAY MAGAZINE</span>
            <span id="mag-issue-page-indicator" style="font-size: 0.8rem; color: #94a3b8; font-weight: 700;">Copertina</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <select id="mag-issue-toc-select" style="background: #172231; border: 1px solid rgba(255,255,255,0.18); color: white; padding: 6px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; max-width: 230px; cursor: pointer;"></select>
            <button type="button" id="close-mag-issue-viewer" class="btn btn-prime-outline" style="padding: 5px 12px; font-size: 0.8rem; font-weight: 800; border-color: rgba(255,255,255,0.2);">
              <i class="fas fa-times"></i> Chiudi Rivista
            </button>
          </div>
        </div>

        <!-- Area Pagina Sfogliabile -->
        <div id="magazine-issue-stage" style="flex: 1; overflow-y: auto; padding: 1.5rem 2rem; position: relative;"></div>

        <!-- Barra Inferiore Sfoglia Pagina -->
        <div style="background: rgba(15, 23, 36, 0.98); border-top: 1px solid rgba(255,255,255,0.1); padding: 0.7rem 1.25rem; display: flex; justify-content: space-between; align-items: center; gap: 0.8rem;">
          <button type="button" id="mag-prev-page-btn" class="btn btn-prime-outline" style="padding: 0.55rem 1.1rem; font-size: 0.82rem; font-weight: 800;">
            <i class="fas fa-chevron-left"></i> Pagina Precedente
          </button>
          <button type="button" id="mag-cover-jump-btn" class="btn btn-prime-outline" style="padding: 0.5rem 0.95rem; font-size: 0.78rem; font-weight: 700; border-color: rgba(0,168,225,0.4); color: #38bdf8;">
            <i class="fas fa-th-list"></i> Sommario / Copertina
          </button>
          <button type="button" id="mag-next-page-btn" class="btn btn-prime" style="padding: 0.55rem 1.1rem; font-size: 0.82rem; font-weight: 800;">
            Pagina Successiva <i class="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Modal CMS Redazione Magazine (Caricamento & Modifica Articoli + Upload Foto) -->
    <div id="magazine-cms-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3100;">
      <div class="modal-content glass" style="background: rgba(18, 26, 36, 0.99); border: 1px solid rgba(0, 168, 225, 0.45); border-radius: 16px; padding: 2rem; max-width: 720px; width: 94%; max-height: 90vh; overflow-y: auto; color: white; position: relative;">
        <span class="close-lightbox" id="close-mag-cms" style="position: absolute; top: 0.8rem; right: 1.2rem; font-size: 2.2rem; cursor: pointer; color: var(--text-gray);">&times;</span>
        <h3 id="cms-mag-modal-heading" style="font-size: 1.35rem; font-weight: 800; margin-bottom: 0.3rem;"><i class="fas fa-feather-alt" style="color: var(--prime-blue);"></i> Carica Nuovo Articolo & Foto nel Magazine</h3>
        <p style="font-size: 0.84rem; color: var(--text-gray); margin-bottom: 1.2rem;">Compila il testo, collega un gioco o uno studio, aggiungi un video YouTube o carica foto direttamente dal tuo dispositivo.</p>
        <form id="magazine-cms-form" style="display: flex; flex-direction: column; gap: 0.9rem;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem;">
            <div>
              <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 700;">Numero / Edizione</label>
              <input type="text" id="cms-mag-issue" required value="Numero #1 — Speciale" style="width: 100%; padding: 10px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white;">
            </div>
            <div>
              <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 700;">Categoria Badge</label>
              <input type="text" id="cms-mag-cat" required placeholder="Es. INTERVISTA, RECENSIONE" value="EDITORIALE" style="width: 100%; padding: 10px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white;">
            </div>
          </div>

          <div>
            <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 700;">Titolo Articolo</label>
            <input type="text" id="cms-mag-title" required placeholder="Inserisci il titolo dell'articolo..." style="width: 100%; padding: 10px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white;">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem;">
            <div>
              <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 700;">Autore</label>
              <input type="text" id="cms-mag-author" required value="Redazione IndiePlay-X" style="width: 100%; padding: 10px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white;">
            </div>
            <div>
              <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 700;">Tempo di lettura stimato</label>
              <input type="text" id="cms-mag-readtime" value="5 min" style="width: 100%; padding: 10px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white;">
            </div>
          </div>

          <!-- Upload Foto di Copertina + Galleria Foto Articolo -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem;">
            <div style="background: rgba(255,255,255,0.03); border: 1px dashed rgba(0, 168, 225, 0.45); border-radius: 8px; padding: 12px; text-align: center;">
              <label for="cms-mag-cover-file" style="cursor: pointer; display: block;">
                <i class="fas fa-cloud-upload-alt" style="font-size: 1.5rem; color: var(--prime-blue); margin-bottom: 4px; display: block;"></i>
                <span style="font-size: 0.82rem; font-weight: 700; color: white;">Carica Foto Copertina da PC/Smartphone</span>
                <span id="cms-cover-status" style="display: block; font-size: 0.72rem; color: var(--text-gray); margin-top: 3px;">Oppure usa URL qui sotto</span>
              </label>
              <input type="file" id="cms-mag-cover-file" accept="image/*" hidden>
              <input type="text" id="cms-mag-img" placeholder="URL immagine (opzionale)" value="/images/merch_hoodie_samurai_1777198641485.png" style="width: 100%; margin-top: 8px; padding: 7px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; color: white; font-size: 0.78rem;">
            </div>

            <div style="background: rgba(255,255,255,0.03); border: 1px dashed rgba(255, 255, 255, 0.25); border-radius: 8px; padding: 12px; text-align: center;">
              <label for="cms-mag-gallery-files" style="cursor: pointer; display: block;">
                <i class="fas fa-images" style="font-size: 1.5rem; color: #34d399; margin-bottom: 4px; display: block;"></i>
                <span style="font-size: 0.82rem; font-weight: 700; color: white;">Carica Foto Aggiuntive Articolo</span>
                <span id="cms-gallery-status" style="display: block; font-size: 0.72rem; color: var(--text-gray); margin-top: 3px;">Puoi selezionare più foto insieme</span>
              </label>
              <input type="file" id="cms-mag-gallery-files" accept="image/*" multiple hidden>
              <div id="cms-gallery-preview" style="display: flex; gap: 6px; overflow-x: auto; margin-top: 8px;"></div>
            </div>
          </div>

          <div>
            <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 700;">Sommario Breve (visibile nella card)</label>
            <textarea id="cms-mag-summary" rows="2" required placeholder="Breve anteprima dell'articolo..." style="width: 100%; padding: 10px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white;"></textarea>
          </div>
          <div>
            <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 700;">Testo Completo dell'Articolo</label>
            <textarea id="cms-mag-content" rows="5" required placeholder="Scrivi qui l'articolo completo..." style="width: 100%; padding: 10px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white;"></textarea>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0.8rem;">
            <div>
              <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 700;"><i class="fab fa-youtube" style="color: #ef4444;"></i> Video YouTube (Opzionale)</label>
              <input type="text" id="cms-mag-yt" placeholder="https://www.youtube.com/watch?v=..." style="width: 100%; padding: 9px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white; font-size: 0.84rem;">
            </div>
            <div>
              <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 700;"><i class="fas fa-gamepad" style="color: #34d399;"></i> Gioco Collegato (Opzionale)</label>
              <input type="text" id="cms-mag-game" placeholder="Es. Alchemyst, Neon Samurai" style="width: 100%; padding: 9px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white; font-size: 0.84rem;">
            </div>
            <div>
              <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 700;"><i class="fas fa-user-astronaut" style="color: #38bdf8;"></i> Studio / Creator (Opzionale)</label>
              <input type="text" id="cms-mag-dev" placeholder="Es. NeonLabs, Astro Games" style="width: 100%; padding: 9px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white; font-size: 0.84rem;">
            </div>
          </div>
          <button type="submit" id="cms-mag-submit-btn" class="btn btn-prime" style="padding: 0.95rem; font-weight: 800; justify-content: center;">
            <i class="fas fa-paper-plane"></i> Pubblica Articolo e Foto nel Magazine
          </button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  const authModal = document.getElementById('magazine-auth-modal');
  const readerModal = document.getElementById('magazine-reader-modal');
  const cmsModal = document.getElementById('magazine-cms-modal');

  document.getElementById('close-mag-auth').onclick = () => (authModal.style.display = 'none');
  document.getElementById('close-mag-reader').onclick = () => (readerModal.style.display = 'none');
  document.getElementById('close-mag-cms').onclick = () => (cmsModal.style.display = 'none');
  const photoLb = document.getElementById('magazine-photo-lightbox');
  const closePhotoLb = document.getElementById('close-mag-photo-lightbox');
  if (closePhotoLb && photoLb) closePhotoLb.onclick = () => (photoLb.style.display = 'none');
  if (photoLb) photoLb.onclick = (e) => { if (e.target === photoLb) photoLb.style.display = 'none'; };

  const issueModal = document.getElementById('magazine-issue-viewer-modal');
  const closeIssueBtn = document.getElementById('close-mag-issue-viewer');
  if (closeIssueBtn && issueModal) closeIssueBtn.onclick = () => (issueModal.style.display = 'none');
  if (issueModal) issueModal.onclick = (e) => { if (e.target === issueModal) issueModal.style.display = 'none'; };

  // Handle cover file upload
  const coverFileInput = document.getElementById('cms-mag-cover-file');
  const coverStatus = document.getElementById('cms-cover-status');
  if (coverFileInput) {
    coverFileInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      coverStatus.textContent = 'Compressione foto in corso...';
      try {
        pendingCoverDataUrl = await compressImageToDataUrl(file, 1000, 0.82);
        coverStatus.innerHTML = `<span style="color:#34d399; font-weight:700;">✓ Foto caricata: ${file.name}</span>`;
      } catch (err) {
        coverStatus.textContent = 'Errore caricamento foto';
      }
    };
  }

  // Handle multiple gallery photos upload
  const galleryFilesInput = document.getElementById('cms-mag-gallery-files');
  const galleryStatus = document.getElementById('cms-gallery-status');
  const galleryPreview = document.getElementById('cms-gallery-preview');
  if (galleryFilesInput) {
    galleryFilesInput.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      galleryStatus.textContent = `Caricamento di ${files.length} foto...`;
      pendingGalleryDataUrls = [];
      galleryPreview.innerHTML = '';
      for (const f of files.slice(0, 6)) {
        try {
          const dataUrl = await compressImageToDataUrl(f, 900, 0.8);
          pendingGalleryDataUrls.push(dataUrl);
          const thumb = document.createElement('img');
          thumb.src = dataUrl;
          thumb.style.cssText = 'width:46px; height:34px; object-fit:cover; border-radius:4px; border:1px solid rgba(255,255,255,0.2);';
          galleryPreview.appendChild(thumb);
        } catch (err) {}
      }
      galleryStatus.innerHTML = `<span style="color:#34d399; font-weight:700;">✓ ${pendingGalleryDataUrls.length} foto pronte</span>`;
    };
  }

  document.getElementById('magazine-auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const rl = checkRateLimit('mag_auth', 5, 60000);
    if (!rl.allowed) {
      if (window.showToast) window.showToast(`Troppi tentativi falliti. Riprova tra ${rl.remainingSec}s.`, 'error');
      return;
    }
    const val = document.getElementById('magazine-password-input').value;
    const digest = await sha256Hex(val);
    if (digest === MAGAZINE_PASSWORD_HASH) {
      resetRateLimit('mag_auth');
      sessionStorage.setItem(STORAGE_KEY_MAGAZINE_UNLOCKED, 'true');
      authModal.style.display = 'none';
      renderMagazineSection();
      openMagazineCmsModal();
      if (window.showToast) window.showToast('Modalità Redazione attivata! Ora puoi caricare articoli e foto.', 'success');
    } else {
      if (window.showToast) window.showToast('Password Redazione errata!', 'error');
    }
  };

  document.getElementById('magazine-cms-form').onsubmit = async (e) => {
    e.preventDefault();
    const articles = getMagazineArticles();
    const coverImg = pendingCoverDataUrl || document.getElementById('cms-mag-img').value.trim() || '/images/merch_hoodie_samurai_1777198641485.png';
    const existingArt = editingMagazineArticleId ? articles.find(a => a.id === editingMagazineArticleId) : null;

    const artPayload = {
      id: editingMagazineArticleId || ('mag-art-' + Date.now()),
      issue: document.getElementById('cms-mag-issue').value.trim(),
      category: document.getElementById('cms-mag-cat').value.trim().toUpperCase(),
      title: document.getElementById('cms-mag-title').value.trim(),
      author: document.getElementById('cms-mag-author').value.trim(),
      date: existingArt ? existingArt.date : new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
      readTime: document.getElementById('cms-mag-readtime').value.trim() || '5 min',
      coverImg,
      gallery: pendingGalleryDataUrls.length > 0 ? [...pendingGalleryDataUrls] : (existingArt && Array.isArray(existingArt.gallery) ? existingArt.gallery : []),
      youtubeUrl: document.getElementById('cms-mag-yt').value.trim(),
      linkedGameTitle: document.getElementById('cms-mag-game').value.trim(),
      linkedDev: document.getElementById('cms-mag-dev').value.trim(),
      likes: existingArt ? (existingArt.likes || 0) : 0,
      summary: document.getElementById('cms-mag-summary').value.trim(),
      content: document.getElementById('cms-mag-content').value.trim()
    };

    const nextArticles = editingMagazineArticleId
      ? articles.map(a => (a.id === editingMagazineArticleId ? artPayload : a))
      : [artPayload, ...articles];

    await saveMagazineArticles(nextArticles);
    editingMagazineArticleId = null;
    pendingCoverDataUrl = '';
    pendingGalleryDataUrls = [];
    cmsModal.style.display = 'none';
    renderMagazineSection();
    window.dispatchEvent(new CustomEvent('indieplay:magazinearticleschange'));
    if (window.showToast) window.showToast(existingArt ? 'Articolo aggiornato con successo!' : 'Articolo e foto pubblicati nel Magazine!', 'success');
  };
}

function openMagazineReaderModal(article) {
  if (!article) return;
  const readerModal = document.getElementById('magazine-reader-modal');
  const body = document.getElementById('magazine-reader-body');
  const assetHelper = window.getAssetUrl || ((p) => p);

  const paragraphs = (article.content || '')
    .split('\n\n')
    .map(p => `<p style="margin-bottom: 1rem; line-height: 1.75; color: #e2e8f0; font-size: 1rem;">${escapeHTML(p)}</p>`)
    .join('');

  const ytEmbed = extractYouTubeEmbedUrl(article.youtubeUrl || '');
  const youtubeHtml = ytEmbed
    ? `
      <div style="margin: 1.4rem 0; border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); background: #000;">
        <div style="position: relative; padding-bottom: 56.25%; height: 0;">
          <iframe src="${ytEmbed}" loading="lazy" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen></iframe>
        </div>
      </div>
    `
    : '';

  const galleryHtml = Array.isArray(article.gallery) && article.gallery.length > 0
    ? `
      <div style="margin-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.2rem;">
        <h4 style="color: white; font-size: 1rem; margin-bottom: 0.8rem;"><i class="fas fa-images" style="color: var(--prime-blue);"></i> Galleria Fotografica dell'Articolo (clicca per ingrandire)</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap: 10px;">
          ${article.gallery.map(img => `<img src="${assetHelper(img)}" class="mag-zoomable-photo" alt="Foto Articolo" style="width: 100%; height: 140px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,0.14); cursor: zoom-in;">`).join('')}
        </div>
      </div>
    `
    : '';

  const ctaHtml = (article.linkedGameTitle || article.linkedDev)
    ? `
      <div style="margin-top: 1.5rem; background: rgba(0, 168, 225, 0.08); border: 1px solid rgba(0, 168, 225, 0.35); border-radius: 12px; padding: 1.1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
        <div>
          <strong style="color: white; font-size: 0.95rem; display: block;">Esplora su IndiePlay-X</strong>
          <span style="font-size: 0.8rem; color: var(--text-gray);">Scopri il gioco o visita la vetrina social dello sviluppatore citato nell'articolo.</span>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${article.linkedGameTitle ? `
            <button type="button" id="mag-reader-go-game" class="btn btn-prime" style="padding: 0.55rem 1rem; font-size: 0.82rem; font-weight: 800;">
              <i class="fas fa-gamepad"></i> Vai a ${article.linkedGameTitle}
            </button>
          ` : ''}
          ${article.linkedDev ? `
            <a href="showcase.html?dev=${encodeURIComponent(article.linkedDev)}" class="btn btn-prime-outline" style="padding: 0.55rem 1rem; font-size: 0.82rem; font-weight: 700; text-decoration: none;">
              <i class="fas fa-user-astronaut"></i> Profilo ${article.linkedDev}
            </a>
          ` : ''}
        </div>
      </div>
    `
    : '';

  body.innerHTML = `
    <div class="mag-zoomable-photo" data-src="${safeUrl(assetHelper(article.coverImg))}" style="height: 245px; background: url('${safeUrl(assetHelper(article.coverImg))}') no-repeat center center; background-size: cover; border-radius: 10px; margin-bottom: 1.4rem; position: relative; cursor: zoom-in;">
      <span style="position: absolute; top: 12px; left: 12px; background: var(--prime-blue); color: white; padding: 4px 12px; border-radius: 4px; font-size: 0.75rem; font-weight: 800;">${escapeHTML(article.category)}</span>
      <span style="position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.72); color: white; padding: 3px 9px; border-radius: 4px; font-size: 0.72rem;"><i class="fas fa-search-plus"></i> Ingrandisci</span>
    </div>
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
      <div style="font-size: 0.85rem; color: var(--prime-blue); font-weight: 700;">${escapeHTML(article.issue)} • ${escapeHTML(article.date)} • ${escapeHTML(article.author)}</div>
      <button type="button" id="mag-reader-share-btn" class="btn btn-prime-outline" style="padding: 4px 10px; font-size: 0.76rem; font-weight: 700;">
        <i class="fas fa-share-alt"></i> Condividi Articolo
      </button>
    </div>
    <h2 style="font-size: 1.65rem; font-weight: 900; color: white; margin-bottom: 1.2rem; line-height: 1.3;">${escapeHTML(article.title)}</h2>
    <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.2rem;">
      ${paragraphs}
    </div>
    ${youtubeHtml}
    ${galleryHtml}
    ${ctaHtml}
  `;

  // Wire zoomable photos
  body.querySelectorAll('.mag-zoomable-photo').forEach(el => {
    el.onclick = () => {
      const lb = document.getElementById('magazine-photo-lightbox');
      const lbImg = document.getElementById('magazine-photo-lightbox-img');
      const src = el.getAttribute('src') || el.getAttribute('data-src');
      if (lb && lbImg && src) {
        lbImg.src = src;
        lb.style.display = 'flex';
      }
    };
  });

  // Wire Share button in reader
  const shareBtn = document.getElementById('mag-reader-share-btn');
  if (shareBtn) {
    shareBtn.onclick = () => {
      const shareUrl = `${window.location.origin}${window.location.pathname}?article=${encodeURIComponent(article.id)}`;
      if (navigator.clipboard) navigator.clipboard.writeText(shareUrl).catch(() => {});
      if (window.showToast) window.showToast('Link diretto dell\'articolo copiato negli appunti!', 'success');
    };
  }

  // Wire Go to Game CTA
  const goGameBtn = document.getElementById('mag-reader-go-game');
  if (goGameBtn && article.linkedGameTitle) {
    goGameBtn.onclick = () => {
      try {
        const cached = JSON.parse(localStorage.getItem('indieplay_fast_games_v3') || '[]');
        const target = article.linkedGameTitle.toLowerCase();
        const found = cached.find(g => g.title && g.title.toLowerCase().includes(target));
        if (found) {
          window.location.href = `game.html?id=${encodeURIComponent(found.id)}`;
          return;
        }
      } catch (e) {}
      window.location.href = `index.html?search=${encodeURIComponent(article.linkedGameTitle)}`;
    };
  }

  readerModal.style.display = 'flex';
}

function openMagazineIssueViewer(startPage = 0) {
  const modal = document.getElementById('magazine-issue-viewer-modal');
  const stage = document.getElementById('magazine-issue-stage');
  const indicator = document.getElementById('mag-issue-page-indicator');
  const tocSelect = document.getElementById('mag-issue-toc-select');
  const prevBtn = document.getElementById('mag-prev-page-btn');
  const nextBtn = document.getElementById('mag-next-page-btn');
  const coverBtn = document.getElementById('mag-cover-jump-btn');
  if (!modal || !stage) return;

  const articles = getMagazineArticles();
  const assetHelper = window.getAssetUrl || ((p) => p);
  const totalPages = articles.length + 1; // Pagina 0 = Copertina, 1..N = Articoli
  let currentPage = Math.max(0, Math.min(startPage, totalPages - 1));

  if (tocSelect) {
    tocSelect.innerHTML = [
      `<option value="0">📖 Copertina & Sommario</option>`,
      ...articles.map((a, idx) => `<option value="${idx + 1}">Pag. ${idx + 1}: ${a.title.slice(0, 38)}${a.title.length > 38 ? '...' : ''}</option>`)
    ].join('');
    tocSelect.onchange = () => {
      currentPage = parseInt(tocSelect.value, 10) || 0;
      renderIssuePage();
    };
  }

  const renderIssuePage = () => {
    if (tocSelect) tocSelect.value = String(currentPage);
    if (indicator) {
      indicator.textContent = currentPage === 0
        ? `Copertina • ${articles.length} Articoli`
        : `Pagina ${currentPage} di ${articles.length}`;
    }
    if (prevBtn) prevBtn.disabled = currentPage <= 0;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages - 1;

    stage.scrollTop = 0;

    if (currentPage === 0) {
      const lead = articles[0] || {};
      stage.innerHTML = `
        <div class="mag-issue-cover" style="position: relative; min-height: 100%; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); background: linear-gradient(180deg, rgba(8,14,26,0.35) 0%, rgba(8,14,26,0.92) 65%, #070c16 100%), url('${assetHelper(lead.coverImg || '/images/merch_hoodie_samurai_1777198641485.png')}') no-repeat center center; background-size: cover; padding: 2rem; display: flex; flex-direction: column; justify-content: space-between; gap: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; border-bottom: 2px solid rgba(0, 168, 225, 0.7); padding-bottom: 1rem;">
            <div>
              <div style="font-size: 0.78rem; font-weight: 800; letter-spacing: 2px; color: #fbbf24;">LA RIVISTA UFFICIALE DEL VIDEOGIOCO INDIPENDENTE</div>
              <h1 style="margin: 4px 0 0; font-size: clamp(2rem, 5vw, 3.3rem); font-weight: 900; letter-spacing: -1px; color: white; line-height: 1;">
                INDIEPLAY <span style="color: #38bdf8;">MAGAZINE</span>
              </h1>
            </div>
            <div style="text-align: right;">
              <div style="background: #f59e0b; color: #0f172a; font-weight: 900; font-size: 0.76rem; padding: 4px 10px; border-radius: 4px; display: inline-block;">${lead.issue || 'EDIZIONE #1'}</div>
              <div style="font-size: 0.8rem; color: #cbd5e1; margin-top: 4px; font-weight: 700;">${lead.date || 'Novembre 2026'} • GRATIS</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.5rem; align-items: end;">
            <div>
              <span style="background: var(--prime-blue); color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.74rem; font-weight: 800;">COVER STORY</span>
              <h2 style="font-size: clamp(1.35rem, 3vw, 2rem); font-weight: 900; color: white; margin: 10px 0 8px; line-height: 1.2;">${lead.title || 'Speciale IndiePlay-X'}</h2>
              <p style="color: #cbd5e1; font-size: 0.94rem; line-height: 1.55; margin-bottom: 1.2rem;">${lead.summary || ''}</p>
              <button type="button" id="mag-cover-start-btn" class="btn btn-prime" style="padding: 0.8rem 1.5rem; font-weight: 900; font-size: 0.92rem;">
                <i class="fas fa-book-open"></i> Sfoglia la Rivista <i class="fas fa-arrow-right"></i>
              </button>
            </div>

            <div style="background: rgba(10, 18, 30, 0.86); border: 1px solid rgba(255,255,255,0.14); border-radius: 12px; padding: 1.2rem; backdrop-filter: blur(10px);">
              <div style="font-size: 0.78rem; font-weight: 900; color: #38bdf8; letter-spacing: 0.8px; margin-bottom: 0.8rem; text-transform: uppercase;">
                <i class="fas fa-list-ul"></i> In questo numero (Sommario):
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.55rem;">
                ${articles.map((art, idx) => `
                  <button type="button" class="mag-toc-jump" data-page="${idx + 1}" style="text-align: left; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 8px 10px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <span style="font-size: 0.82rem; font-weight: 700; line-height: 1.3;">
                      <strong style="color: #38bdf8;">0${idx + 1}.</strong> ${art.title}
                    </span>
                    <span style="font-size: 0.7rem; color: #94a3b8; white-space: nowrap;">Pag. ${idx + 1} →</span>
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
      const startBtn = document.getElementById('mag-cover-start-btn');
      if (startBtn) startBtn.onclick = () => { if (totalPages > 1) { currentPage = 1; renderIssuePage(); } };
      stage.querySelectorAll('.mag-toc-jump').forEach(btn => {
        btn.onclick = () => {
          currentPage = parseInt(btn.getAttribute('data-page'), 10) || 1;
          renderIssuePage();
        };
      });
      return;
    }

    const art = articles[currentPage - 1];
    if (!art) return;
    const paragraphs = (art.content || '')
      .split('\n\n')
      .map((p, idx) => `<p class="${idx === 0 ? 'mag-dropcap-p' : ''}" style="margin-bottom: 1rem; line-height: 1.75; color: #e2e8f0; font-size: 0.98rem;">${escapeHTML(p)}</p>`)
      .join('');
    const ytEmbed = extractYouTubeEmbedUrl(art.youtubeUrl || '');

    stage.innerHTML = `
      <div class="mag-issue-spread">
        <!-- Colonna Sinistra: Testo Editoriale -->
        <div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 0.6rem;">
            <span style="background: var(--prime-blue); color: white; padding: 3px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: 800;">${escapeHTML(art.category || 'EDITORIALE')}</span>
            <span style="font-size: 0.8rem; color: #94a3b8; font-weight: 700;">${escapeHTML(art.issue || '')} • ${escapeHTML(art.date || '')} • ${escapeHTML(art.readTime || '5 min')}</span>
          </div>
          <h2 style="font-size: clamp(1.4rem, 2.6vw, 1.95rem); font-weight: 900; color: white; line-height: 1.22; margin-bottom: 0.6rem;">${escapeHTML(art.title)}</h2>
          <div style="font-size: 0.82rem; color: #38bdf8; font-weight: 700; margin-bottom: 1.1rem; padding-bottom: 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <i class="fas fa-pen-nib"></i> Di ${escapeHTML(art.author || 'Redazione IndiePlay-X')}
          </div>
          <div>${paragraphs}</div>
        </div>

        <!-- Colonna Destra: Media, Galleria Foto, Video & CTA Gioco/Studio -->
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <div class="mag-zoomable-photo" data-src="${assetHelper(art.coverImg)}" style="height: 230px; border-radius: 10px; background: url('${assetHelper(art.coverImg)}') no-repeat center center; background-size: cover; position: relative; cursor: zoom-in; border: 1px solid rgba(255,255,255,0.12);">
            <span style="position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.75); color: white; padding: 3px 9px; border-radius: 4px; font-size: 0.72rem;"><i class="fas fa-search-plus"></i> Ingrandisci</span>
          </div>

          ${ytEmbed ? `
            <div style="border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); background: #000;">
              <div style="position: relative; padding-bottom: 56.25%; height: 0;">
                <iframe src="${ytEmbed}" loading="lazy" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen></iframe>
              </div>
            </div>
          ` : ''}

          ${Array.isArray(art.gallery) && art.gallery.length > 0 ? `
            <div>
              <div style="font-size: 0.8rem; font-weight: 800; color: #94a3b8; margin-bottom: 6px;"><i class="fas fa-images" style="color: var(--prime-blue);"></i> Galleria Fotografica</div>
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                ${art.gallery.map(img => `<img src="${assetHelper(img)}" class="mag-zoomable-photo" alt="Foto" style="width: 100%; height: 95px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,0.14); cursor: zoom-in;">`).join('')}
              </div>
            </div>
          ` : ''}

          ${(art.linkedGameTitle || art.linkedDev) ? `
            <div style="background: rgba(0, 168, 225, 0.09); border: 1px solid rgba(0, 168, 225, 0.35); border-radius: 10px; padding: 1rem; display: flex; flex-direction: column; gap: 8px;">
              <strong style="font-size: 0.86rem; color: white;">Collegamenti su IndiePlay-X</strong>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                ${art.linkedGameTitle ? `
                  <button type="button" id="mag-issue-go-game" class="btn btn-prime" style="padding: 0.5rem 0.9rem; font-size: 0.8rem; font-weight: 800;">
                    <i class="fas fa-gamepad"></i> Vai a ${art.linkedGameTitle}
                  </button>
                ` : ''}
                ${art.linkedDev ? `
                  <a href="showcase.html?dev=${encodeURIComponent(art.linkedDev)}" class="btn btn-prime-outline" style="padding: 0.5rem 0.9rem; font-size: 0.8rem; font-weight: 700; text-decoration: none;">
                    <i class="fas fa-user-astronaut"></i> Profilo ${art.linkedDev}
                  </a>
                ` : ''}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    stage.querySelectorAll('.mag-zoomable-photo').forEach(el => {
      el.onclick = () => {
        const lb = document.getElementById('magazine-photo-lightbox');
        const lbImg = document.getElementById('magazine-photo-lightbox-img');
        const src = el.getAttribute('src') || el.getAttribute('data-src');
        if (lb && lbImg && src) {
          lbImg.src = src;
          lb.style.display = 'flex';
        }
      };
    });

    const goGame = document.getElementById('mag-issue-go-game');
    if (goGame && art.linkedGameTitle) {
      goGame.onclick = () => {
        try {
          const cached = JSON.parse(localStorage.getItem('indieplay_fast_games_v3') || '[]');
          const found = cached.find(g => g.title && g.title.toLowerCase().includes(art.linkedGameTitle.toLowerCase()));
          if (found) {
            window.location.href = `game.html?id=${encodeURIComponent(found.id)}`;
            return;
          }
        } catch (e) {}
        window.location.href = `index.html?search=${encodeURIComponent(art.linkedGameTitle)}`;
      };
    }
  };

  if (prevBtn) prevBtn.onclick = () => { if (currentPage > 0) { currentPage--; renderIssuePage(); } };
  if (nextBtn) nextBtn.onclick = () => { if (currentPage < totalPages - 1) { currentPage++; renderIssuePage(); } };
  if (coverBtn) coverBtn.onclick = () => { currentPage = 0; renderIssuePage(); };

  // Touch swipe support inside the digital magazine
  let touchStartX = 0;
  stage.ontouchstart = (e) => { touchStartX = e.changedTouches?.[0]?.screenX || 0; };
  stage.ontouchend = (e) => {
    const dx = (e.changedTouches?.[0]?.screenX || 0) - touchStartX;
    if (dx < -65 && currentPage < totalPages - 1) { currentPage++; renderIssuePage(); }
    if (dx > 65 && currentPage > 0) { currentPage--; renderIssuePage(); }
  };

  // Keyboard navigation
  const keyHandler = (e) => {
    if (modal.style.display !== 'flex') {
      window.removeEventListener('keydown', keyHandler);
      return;
    }
    if (e.key === 'ArrowRight' && currentPage < totalPages - 1) { currentPage++; renderIssuePage(); }
    if (e.key === 'ArrowLeft' && currentPage > 0) { currentPage--; renderIssuePage(); }
    if (e.key === 'Escape') { modal.style.display = 'none'; window.removeEventListener('keydown', keyHandler); }
  };
  window.addEventListener('keydown', keyHandler);

  renderIssuePage();
  modal.style.display = 'flex';
}

function openMagazineCmsModal(articleToEdit = null) {
  editingMagazineArticleId = articleToEdit ? articleToEdit.id : null;
  pendingCoverDataUrl = articleToEdit ? (articleToEdit.coverImg || '') : '';
  pendingGalleryDataUrls = articleToEdit && Array.isArray(articleToEdit.gallery) ? [...articleToEdit.gallery] : [];

  const heading = document.getElementById('cms-mag-modal-heading');
  const submitBtn = document.getElementById('cms-mag-submit-btn');
  if (heading) {
    heading.innerHTML = articleToEdit
      ? '<i class="fas fa-edit" style="color: #fbbf24;"></i> Modifica Articolo Magazine'
      : '<i class="fas fa-feather-alt" style="color: var(--prime-blue);"></i> Carica Nuovo Articolo & Foto nel Magazine';
  }
  if (submitBtn) {
    submitBtn.innerHTML = articleToEdit
      ? '<i class="fas fa-save"></i> Salva Modifiche Articolo'
      : '<i class="fas fa-paper-plane"></i> Pubblica Articolo e Foto nel Magazine';
  }

  document.getElementById('cms-mag-issue').value = articleToEdit ? (articleToEdit.issue || '') : 'Numero #1 — Speciale';
  document.getElementById('cms-mag-cat').value = articleToEdit ? (articleToEdit.category || 'EDITORIALE') : 'EDITORIALE';
  document.getElementById('cms-mag-title').value = articleToEdit ? (articleToEdit.title || '') : '';
  document.getElementById('cms-mag-author').value = articleToEdit ? (articleToEdit.author || '') : 'Redazione IndiePlay-X';
  document.getElementById('cms-mag-readtime').value = articleToEdit ? (articleToEdit.readTime || '5 min') : '5 min';
  document.getElementById('cms-mag-img').value = articleToEdit && !String(articleToEdit.coverImg || '').startsWith('data:') ? (articleToEdit.coverImg || '') : '/images/merch_hoodie_samurai_1777198641485.png';
  document.getElementById('cms-mag-summary').value = articleToEdit ? (articleToEdit.summary || '') : '';
  document.getElementById('cms-mag-content').value = articleToEdit ? (articleToEdit.content || '') : '';
  document.getElementById('cms-mag-yt').value = articleToEdit ? (articleToEdit.youtubeUrl || '') : '';
  document.getElementById('cms-mag-game').value = articleToEdit ? (articleToEdit.linkedGameTitle || '') : '';
  document.getElementById('cms-mag-dev').value = articleToEdit ? (articleToEdit.linkedDev || '') : '';

  const coverStatus = document.getElementById('cms-cover-status');
  const galleryStatus = document.getElementById('cms-gallery-status');
  const galleryPreview = document.getElementById('cms-gallery-preview');
  if (coverStatus) coverStatus.textContent = articleToEdit ? 'Copertina attuale mantenuta (puoi caricarne una nuova)' : 'Oppure usa URL qui sotto';
  if (galleryStatus) galleryStatus.textContent = pendingGalleryDataUrls.length > 0 ? `${pendingGalleryDataUrls.length} foto già presenti` : 'Puoi selezionare più foto insieme';
  if (galleryPreview) {
    galleryPreview.innerHTML = '';
    pendingGalleryDataUrls.forEach(src => {
      const thumb = document.createElement('img');
      thumb.src = src;
      thumb.style.cssText = 'width:46px; height:34px; object-fit:cover; border-radius:4px; border:1px solid rgba(255,255,255,0.2);';
      galleryPreview.appendChild(thumb);
    });
  }
  const cmsModal = document.getElementById('magazine-cms-modal');
  if (cmsModal) cmsModal.style.display = 'flex';
}

// ============================================================================
// 2. SEZIONE BACKEND CON PULSANTI SINGOLI ATTIVA/DISATTIVA
// ============================================================================
export function initBackendSystem() {
  syncPaymentConfigFromCloud();
  syncPortalNewsFromCloud();
  injectBackendModals();
  injectPortalNewsModals();
  initExpress1ClickSystem();
  initSpecialProjectsSections();
  initFirstVisitLegalConsentModal();
  trackPrivatePageView();
  initWoxlyticsTracker(getLanguage);
  setTimeout(() => {
    checkAndSendDailySubscribersDigest(false).catch(() => {});
  }, 2500);

  document.querySelectorAll('.open-backend-link').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      openBackendPasswordPrompt();
    };
  });
}

export function openBackendPasswordPrompt() {
  injectBackendModals();
  const authModal = document.getElementById('backend-auth-modal');
  const inp = document.getElementById('backend-password-input');
  if (authModal) {
    authModal.style.display = 'flex';
    if (inp) {
      inp.value = '';
      setTimeout(() => inp.focus(), 100);
    }
  }
}

function injectBackendModals() {
  if (document.getElementById('backend-auth-modal')) return;

  const container = document.createElement('div');
  container.innerHTML = `
    <!-- Modal Password Backend -->
    <div id="backend-auth-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3500;">
      <div class="modal-content glass" style="background: rgba(15, 23, 34, 0.98); border: 1px solid rgba(245, 158, 11, 0.5); border-radius: 16px; padding: 2.2rem; max-width: 440px; width: 92%; color: white; position: relative; box-shadow: 0 20px 50px rgba(0,0,0,0.85);">
        <span class="close-lightbox" id="close-backend-auth" style="position: absolute; top: 0.8rem; right: 1.2rem; font-size: 2.2rem; cursor: pointer; color: var(--text-gray);">&times;</span>
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 1.2rem;">
          <div style="width: 46px; height: 46px; border-radius: 12px; background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-server" style="color: #f59e0b; font-size: 1.3rem;"></i>
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.3rem; font-weight: 800;">Accesso Backend</h3>
            <span style="font-size: 0.8rem; color: var(--text-gray);">Pannello di Controllo Moduli & Pagamenti</span>
          </div>
        </div>
        <form id="backend-auth-form" style="display: flex; flex-direction: column; gap: 1rem;">
          <div class="form-group">
            <label style="font-size: 0.82rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 6px;">PASSWORD AMMINISTRATORE BACKEND</label>
            <input type="password" id="backend-password-input" required placeholder="Inserisci password Backend..." style="width: 100%; padding: 12px; background: #0f1722; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; font-size: 1rem;">
          </div>
          <button type="submit" class="btn btn-prime" style="width: 100%; padding: 0.9rem; font-weight: 800; background: #f59e0b; color: #0f172a; justify-content: center;">
            <i class="fas fa-key"></i> Apri Console Backend
          </button>
        </form>
      </div>
    </div>

    <!-- Console Completa Backend con Singole Voci Attivabili da Pulsante -->
    <div id="backend-console-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3600;">
      <div class="modal-content glass" style="background: rgba(15, 23, 34, 0.99); border: 1px solid rgba(0, 168, 225, 0.45); border-radius: 16px; padding: 2rem; max-width: 860px; width: 95%; max-height: 90vh; overflow-y: auto; color: white; position: relative; box-shadow: 0 25px 60px rgba(0,0,0,0.9);">
        <span class="close-lightbox" id="close-backend-console" style="position: absolute; top: 0.8rem; right: 1.2rem; font-size: 2.2rem; cursor: pointer; color: var(--text-gray);">&times;</span>
        <div id="backend-console-body"></div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  const authModal = document.getElementById('backend-auth-modal');
  const consoleModal = document.getElementById('backend-console-modal');

  document.getElementById('close-backend-auth').onclick = () => (authModal.style.display = 'none');
  document.getElementById('close-backend-console').onclick = () => (consoleModal.style.display = 'none');

  document.getElementById('backend-auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const rl = checkRateLimit('backend_auth', 5, 60000);
    if (!rl.allowed) {
      if (window.showToast) window.showToast(`Accesso temporaneamente bloccato per sicurezza. Riprova tra ${rl.remainingSec}s.`, 'error');
      return;
    }
    const pwd = document.getElementById('backend-password-input').value;
    const digest = await sha256Hex(pwd);
    if (digest === BACKEND_PASSWORD_HASH) {
      resetRateLimit('backend_auth');
      authModal.style.display = 'none';
      openBackendConsole();
      if (window.showToast) window.showToast('Accesso Backend autorizzato!', 'success');
    } else {
      if (window.showToast) window.showToast('Password Backend errata! Accesso negato.', 'error');
    }
  };
}

function openBackendConsole() {
  const consoleModal = document.getElementById('backend-console-modal');
  const body = document.getElementById('backend-console-body');
  const cfg = getPaymentConfig();
  const txs = getStoredTransactions();
  const devSharePct = 100 - (Number(cfg.platformFeePercent) || 15);

  const featureItems = [
    {
      key: 'realPaymentsEnabled',
      icon: 'fa-credit-card',
      title: '1. Transazioni Reali (Gateway Carte Live)',
      desc: 'Quando disattivato usa la simulazione test. Quando attivato processa pagamenti reali con controllo bancario Luhn e chiavi Live.',
      active: Boolean(cfg.realPaymentsEnabled)
    },
    {
      key: 'splitPaymentEnabled',
      icon: 'fa-random',
      title: '2. Split-Payment Automatico verso Sviluppatori',
      desc: `Ripartisce in automatico ogni vendita: ${devSharePct}% accreditato allo Sviluppatore e ${cfg.platformFeePercent}% di commissione a IndiePlay-X.`,
      active: Boolean(cfg.splitPaymentEnabled)
    },
    {
      key: 'strictIbanValidation',
      icon: 'fa-university',
      title: '3. Verifica Matematica Rigorosa IBAN (Modulo-97)',
      desc: 'Se disattivato consente IBAN di prova (27 caratteri) per facilitare i test. Se attivato accetta solo IBAN bancari reali verificati.',
      active: Boolean(cfg.strictIbanValidation)
    },
    {
      key: 'merchEnabled',
      icon: 'fa-tshirt',
      title: '4. Sezione & Acquisti Merchandising Ufficiale',
      desc: 'Mostra o nasconde istantaneamente la sezione Merchandising e i relativi pulsanti nel menu di navigazione.',
      active: cfg.merchEnabled !== false
    },
    {
      key: 'magazineVisible',
      icon: 'fa-newspaper',
      title: '5. Sezione Pubblica IndiePlay Magazine',
      desc: 'Mostra o nasconde la sezione editoriale IndiePlay Magazine nella homepage.',
      active: cfg.magazineVisible !== false
    },
    {
      key: 'reviewsEnabled',
      icon: 'fa-star',
      title: '6. Invio Nuove Recensioni Utenti',
      desc: 'Abilita o sospende la possibilità per gli utenti di inviare nuove recensioni nelle pagine dei giochi.',
      active: cfg.reviewsEnabled !== false
    },
    {
      key: 'sellerRegistrationEnabled',
      icon: 'fa-store',
      title: '7. Registrazione Nuovi Venditori & Pubblicazione',
      desc: 'Consente o blocca temporaneamente l\'opzione di registrazione per nuovi profili sviluppatore/venditore.',
      active: cfg.sellerRegistrationEnabled !== false
    },
    {
      key: 'donationsEnabled',
      icon: 'fa-hand-holding-heart',
      title: '8. Sistema Donazioni Profili Social (Privati & Professionisti)',
      desc: 'Abilita o disabilita la possibilità per utenti privati e studi professionali di ricevere donazioni sul proprio profilo social.',
      active: cfg.donationsEnabled !== false
    },
    {
      key: 'bitbonkVisible',
      icon: 'fa-clone',
      title: '9. Sezione BITBONK™ (Carte da Gioco Collezionabili & Sticker Album Series 01)',
      desc: 'Mostra o nasconde la sezione dedicata al progetto di carte collezionabili e sticker album BITBONK in Homepage.',
      active: cfg.bitbonkVisible !== false
    },
    {
      key: 'memeConsoleVisible',
      icon: 'fa-microchip',
      title: '10. Sezione MEME CONSOLE™ (Progetto Hardware Model MC-01)',
      desc: 'Mostra o nasconde la vetrina tecnologica della futura MEME CONSOLE in Homepage.',
      active: cfg.memeConsoleVisible !== false
    }
  ];

  body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 1.2rem;">
      <div>
        <span style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; padding: 3px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: 800;">CONSOLE AMMINISTRATORE BACKEND</span>
        <span style="background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 3px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: 800; margin-left: 6px;"><i class="fas fa-sync-alt"></i> SYNC TRIPLA ATTIVA: HARD DISK • GITHUB • CLOUDFLARE/VERCEL</span>
        <h2 style="margin: 6px 0 0; font-size: 1.45rem; font-weight: 900;">Controllo Singole Funzioni, Pagamenti Reali & Split-Payment</h2>
      </div>
      <div style="display: flex; gap: 8px;">
        <button type="button" id="be-enable-all-payments-btn" class="btn btn-prime" style="padding: 0.55rem 1rem; font-size: 0.78rem; font-weight: 800; background: #10b981;">
          <i class="fas fa-bolt"></i> Attiva Pagamenti Reali + Split
        </button>
        <button type="button" id="be-disable-all-payments-btn" class="btn btn-prime-outline" style="padding: 0.55rem 1rem; font-size: 0.78rem; font-weight: 700; border-color: #ef4444; color: #f87171;">
          <i class="fas fa-power-off"></i> Torna a Simulazione
        </button>
      </div>
    </div>

    <!-- Lista Voci Attivabili/Disattivabili Singolarmente da Pulsante -->
    <div style="margin-bottom: 1.5rem;">
      <h4 style="margin: 0 0 0.8rem; font-size: 0.95rem; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px;">
        <i class="fas fa-sliders-h"></i> Voci Backend Attivabili Singolarmente (Clicca sul pulsante di ogni voce)
      </h4>
      <div style="display: flex; flex-direction: column; gap: 0.7rem;">
        ${featureItems.map(item => `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid ${item.active ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255,255,255,0.1)'}; border-radius: 10px; padding: 0.9rem 1.1rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 240px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
                <i class="fas ${item.icon}" style="color: ${item.active ? '#34d399' : 'var(--text-gray)'};"></i>
                <strong style="font-size: 0.96rem; color: white;">${item.title}</strong>
                <span style="padding: 2px 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 800; background: ${item.active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${item.active ? '#34d399' : '#f87171'};">
                  ${item.active ? '● ATTIVO' : '● DISATTIVATO'}
                </span>
              </div>
              <p style="margin: 0; font-size: 0.8rem; color: var(--text-gray); line-height: 1.4;">${item.desc}</p>
            </div>
            <button type="button" class="btn single-feature-toggle-btn" data-feature-key="${item.key}" style="min-width: 155px; padding: 0.65rem 1.1rem; font-weight: 800; font-size: 0.82rem; border-radius: 8px; cursor: pointer; border: none; background: ${item.active ? '#ef4444' : '#10b981'}; color: white; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
              <i class="fas ${item.active ? 'fa-toggle-off' : 'fa-toggle-on'}"></i>
              ${item.active ? 'Disattiva Voce' : 'Attiva Voce'}
            </button>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Form Parametri Economici & Chiavi Gateway -->
    <form id="backend-config-form" style="display: flex; flex-direction: column; gap: 1rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.2rem;">
      <h4 style="margin: 0; font-size: 0.95rem; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.5px;">
        <i class="fas fa-percentage"></i> Parametri Ripartizione Split-Payment & Coordinate Gateway
      </h4>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.9rem;">
        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); padding: 0.9rem; border-radius: 10px;">
          <label style="font-size: 0.76rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 5px;">COMMISSIONE PIATTAFORMA (%)</label>
          <input type="number" id="be-fee-pct" min="0" max="95" step="0.5" value="${cfg.platformFeePercent}" style="width: 100%; padding: 9px; background: #0f1722; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: white; font-weight: 800; font-size: 0.95rem;">
          <div id="be-split-preview" style="font-size: 0.76rem; color: #38bdf8; margin-top: 5px; font-weight: 700;">
            Split: ${devSharePct}% Sviluppatore / ${cfg.platformFeePercent}% IndiePlay-X
          </div>
        </div>

        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); padding: 0.9rem; border-radius: 10px;">
          <label style="font-size: 0.76rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 5px;">PROVIDER GATEWAY</label>
          <select id="be-gateway" style="width: 100%; padding: 9px; background: #0f1722; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: white; font-weight: 700;">
            <option value="stripe_connect" ${cfg.gatewayProvider === 'stripe_connect' ? 'selected' : ''}>Stripe Connect (Split Automatico)</option>
            <option value="paypal_commerce" ${cfg.gatewayProvider === 'paypal_commerce' ? 'selected' : ''}>PayPal Commerce Marketplace</option>
            <option value="sepa_split" ${cfg.gatewayProvider === 'sepa_split' ? 'selected' : ''}>Bonifico SEPA Split Diretto (IBAN)</option>
          </select>
        </div>

        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); padding: 0.9rem; border-radius: 10px;">
          <label style="font-size: 0.76rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 5px;">IBAN MASTER PIATTAFORMA</label>
          <input type="text" id="be-platform-iban" value="${cfg.platformIban}" style="width: 100%; padding: 9px; background: #0f1722; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: white; font-family: monospace;">
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.9rem;">
        <div>
          <label style="font-size: 0.76rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 4px;"><i class="fab fa-paypal" style="color:#38bdf8;"></i> Contatto Email PayPal Piattaforma</label>
          <input type="email" id="be-paypal-email" value="${escapeHTML(cfg.paypalBusinessEmail || 'devindieplay@gmail.com')}" placeholder="devindieplay@gmail.com" style="width: 100%; padding: 8px; background: #0f1722; border: 1px solid rgba(56,189,248,0.35); border-radius: 6px; color: white; font-size: 0.84rem; font-weight: 700;">
        </div>
        <div>
          <label style="font-size: 0.76rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 4px;">Stripe Publishable Key (Live)</label>
          <input type="text" id="be-stripe-pk" value="${cfg.stripePublishableKey}" style="width: 100%; padding: 8px; background: #0f1722; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white; font-family: monospace; font-size: 0.82rem;">
        </div>
        <div>
          <label style="font-size: 0.76rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 4px;">Endpoint Webhook Split-Payment</label>
          <input type="text" id="be-stripe-webhook" value="${cfg.stripeConnectWebhookUrl}" style="width: 100%; padding: 8px; background: #0f1722; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white; font-family: monospace; font-size: 0.82rem;">
        </div>
      </div>

      <div style="display: flex; gap: 0.8rem; flex-wrap: wrap;">
        <button type="submit" class="btn btn-prime" style="padding: 0.8rem 1.6rem; font-weight: 800;">
          <i class="fas fa-save"></i> Salva Parametri & Chiavi
        </button>
        <button type="button" id="be-export-subscribers-csv-btn" class="btn btn-prime-outline" style="padding: 0.8rem 1.2rem; font-weight: 800; border-color: #34d399; color: #34d399;">
          <i class="fas fa-users"></i> Scarica File Database Iscritti (.CSV)
        </button>
        <button type="button" id="be-export-backup-btn" class="btn btn-prime-outline" style="padding: 0.8rem 1.3rem; font-weight: 700;">
          <i class="fas fa-database"></i> Esporta Backup Utenti, Vetrine & Giochi (JSON)
        </button>
      </div>
    </form>

    <!-- Registro Split-Payment -->
    <div style="margin-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1rem;">
      <h4 style="margin: 0 0 0.7rem; font-size: 0.95rem; color: white;"><i class="fas fa-receipt" style="color: var(--prime-blue);"></i> Registro Transazioni & Split-Payment (${txs.length})</h4>
      ${txs.length === 0 ? `
        <div style="padding: 0.9rem; background: rgba(255,255,255,0.02); border-radius: 8px; color: var(--text-gray); font-size: 0.82rem;">
          Nessuna transazione registrata in questa sessione.
        </div>
      ` : `
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.78rem;">
            <thead>
              <tr style="background: rgba(255,255,255,0.06); text-align: left;">
                <th style="padding: 7px;">ID</th>
                <th style="padding: 7px;">Gioco & Studio</th>
                <th style="padding: 7px;">Totale</th>
                <th style="padding: 7px;">Quota Sviluppatore</th>
                <th style="padding: 7px;">Quota Piattaforma</th>
                <th style="padding: 7px;">Modalità</th>
              </tr>
            </thead>
            <tbody>
              ${txs.slice(0, 8).map(t => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                  <td style="padding: 7px; font-family: monospace;">${t.id.slice(0, 12)}</td>
                  <td style="padding: 7px;"><strong>${t.gameTitle}</strong> (${t.developerName})</td>
                  <td style="padding: 7px; font-weight: 800;">€${Number(t.totalAmount).toFixed(2)}</td>
                  <td style="padding: 7px; color: #34d399; font-weight: 800;">€${Number(t.developerShare).toFixed(2)} (${t.developerPercent}%)</td>
                  <td style="padding: 7px; color: #38bdf8; font-weight: 700;">€${Number(t.platformShare).toFixed(2)} (${t.platformFeePercent}%)</td>
                  <td style="padding: 7px;">${t.mode}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  consoleModal.style.display = 'flex';

  // Wire each individual feature toggle button!
  body.querySelectorAll('.single-feature-toggle-btn').forEach(btn => {
    btn.onclick = async () => {
      const key = btn.getAttribute('data-feature-key');
      const currentCfg = getPaymentConfig();
      const currentVal = key in currentCfg ? Boolean(currentCfg[key]) : true;
      const nextVal = !currentVal;
      await savePaymentConfig({ [key]: nextVal });
      openBackendConsole();
      if (window.showToast) {
        window.showToast(
          `Voce "${key}" ${nextVal ? 'ATTIVATA' : 'DISATTIVATA'} con successo!`,
          nextVal ? 'success' : 'info'
        );
      }
    };
  });

  // Quick preset buttons
  const enableAllPaymentsBtn = document.getElementById('be-enable-all-payments-btn');
  if (enableAllPaymentsBtn) {
    enableAllPaymentsBtn.onclick = async () => {
      await savePaymentConfig({ realPaymentsEnabled: true, splitPaymentEnabled: true });
      openBackendConsole();
      if (window.showToast) window.showToast('Transazioni Reali e Split-Payment Automatico ATTIVATI!', 'success');
    };
  }

  const disableAllPaymentsBtn = document.getElementById('be-disable-all-payments-btn');
  if (disableAllPaymentsBtn) {
    disableAllPaymentsBtn.onclick = async () => {
      await savePaymentConfig({ realPaymentsEnabled: false, splitPaymentEnabled: false });
      openBackendConsole();
      if (window.showToast) window.showToast('Ripristinata Modalità Simulazione (Pagamenti Reali disattivati).', 'info');
    };
  }

  const feeInput = document.getElementById('be-fee-pct');
  const splitPreview = document.getElementById('be-split-preview');
  if (feeInput && splitPreview) {
    feeInput.oninput = () => {
      const f = Math.min(95, Math.max(0, Number(feeInput.value) || 0));
      splitPreview.textContent = `Split: ${(100 - f).toFixed(1)}% Sviluppatore / ${f.toFixed(1)}% IndiePlay-X`;
    };
  }

  document.getElementById('backend-config-form').onsubmit = async (e) => {
    e.preventDefault();
    await savePaymentConfig({
      platformFeePercent: parseFloat(document.getElementById('be-fee-pct').value) || 15,
      gatewayProvider: document.getElementById('be-gateway').value,
      platformIban: document.getElementById('be-platform-iban').value.trim(),
      paypalBusinessEmail: document.getElementById('be-paypal-email')?.value.trim() || 'devindieplay@gmail.com',
      stripePublishableKey: document.getElementById('be-stripe-pk').value.trim(),
      stripeConnectWebhookUrl: document.getElementById('be-stripe-webhook').value.trim()
    });
    openBackendConsole();
    if (window.showToast) window.showToast('Parametri economici, email PayPal e chiavi salvati!', 'success');
  };

  const subCsvBtn = document.getElementById('be-export-subscribers-csv-btn');
  if (subCsvBtn) {
    subCsvBtn.onclick = async () => {
      await syncSubscribersDatabaseFromCloud();
      exportSubscribersDatabaseCSV();
      if (window.showToast) window.showToast('File Database Iscritti (.CSV) scaricato!', 'success');
    };
  }

  const backupBtn = document.getElementById('be-export-backup-btn');
  if (backupBtn) {
    backupBtn.onclick = async () => {
      backupBtn.disabled = true;
      backupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Esportazione Cloud in corso...';
      try {
        const gamesSnap = await getDocs(collection(db, 'games'));
        const games = gamesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        let users = [];
        try {
          const usersSnap = await getDocs(collection(db, 'users'));
          users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {}

        const payload = {
          exportedAt: new Date().toISOString(),
          platform: 'INDIE PLAY X',
          firebaseProject: 'indieplayx',
          gamesCount: games.length,
          usersCount: users.length,
          games,
          users,
          magazineArticles: getMagazineArticles(),
          transactions: getStoredTransactions()
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `indieplayx_cloud_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        if (window.showToast) window.showToast('Backup completo di Giochi, Utenti e Vetrine scaricato!', 'success');
      } catch (err) {
        if (window.showToast) window.showToast('Errore durante il backup: ' + err.message, 'error');
      } finally {
        backupBtn.disabled = false;
        backupBtn.innerHTML = '<i class="fas fa-database"></i> Esporta Backup Utenti, Vetrine & Giochi (JSON)';
      }
    };
  }
}

// ============================================================================
// 3. MOTORE ACQUISTO RAPIDO "1-CLICK" & CARRELLO AMAZON-STYLE
// ============================================================================
const STORAGE_KEY_OWNED_EXPRESS = 'indieplay_owned_games_v1';
const STORAGE_KEY_QUICK_CART = 'indieplay_quick_cart_v1';
const STORAGE_KEY_1CLICK_WALLET = 'indieplay_1click_wallet_v1';

const DEFAULT_1CLICK_WALLET = {
  enabled: true,
  method: 'saved_card', // 'saved_card' | 'paypal_express' | 'gpay_apple' | 'new_card'
  cardHolder: 'Cliente IndiePlay-X',
  last4: '4242',
  brand: 'Visa',
  expiry: '12/29',
  buyerEmail: ''
};

export function get1ClickWallet() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_1CLICK_WALLET);
    if (raw) return { ...DEFAULT_1CLICK_WALLET, ...JSON.parse(raw) };
  } catch (e) {}
  return { ...DEFAULT_1CLICK_WALLET };
}

export function save1ClickWallet(partial) {
  const merged = { ...get1ClickWallet(), ...partial };
  try {
    localStorage.setItem(STORAGE_KEY_1CLICK_WALLET, JSON.stringify(merged));
  } catch (e) {}
  return merged;
}

export function isGameOwnedExpress(gameId) {
  if (!gameId) return false;
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY_OWNED_EXPRESS) || '[]');
    return Array.isArray(list) && list.includes(String(gameId));
  } catch (e) {
    return false;
  }
}

export function markGameOwnedExpress(gameId) {
  if (!gameId) return;
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY_OWNED_EXPRESS) || '[]');
    const idStr = String(gameId);
    if (!list.includes(idStr)) {
      list.push(idStr);
      localStorage.setItem(STORAGE_KEY_OWNED_EXPRESS, JSON.stringify(list));
    }
  } catch (e) {}
}

export function getQuickCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_QUICK_CART);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {}
  return [];
}

export function saveQuickCart(items) {
  try {
    localStorage.setItem(STORAGE_KEY_QUICK_CART, JSON.stringify(items));
  } catch (e) {}
  updateHeaderCartBadge();
  window.dispatchEvent(new CustomEvent('indieplay:cartchange', { detail: items }));
}

export function addToQuickCart(item) {
  if (!item || !item.id) return;
  if (isGameOwnedExpress(item.id)) {
    if (window.showToast) window.showToast('Hai già questo titolo nella tua libreria!', 'info');
    return;
  }
  const cart = getQuickCart();
  if (cart.some(x => String(x.id) === String(item.id))) {
    if (window.showToast) window.showToast(`"${item.title}" è già nel carrello rapido!`, 'info');
    openQuickCartDrawer();
    return;
  }
  const cleanPrice = item.price === 'FREE' || item.price === '0' || !item.price ? 0 : (parseFloat(String(item.price).replace(',', '.')) || 0);
  cart.push({
    id: String(item.id),
    title: item.title || 'Titolo IndiePlay-X',
    price: cleanPrice,
    imageUrl: item.imageUrl || '/images/placeholder.png',
    developer: item.developer || 'Indie Studio',
    sellerId: item.sellerId || '',
    type: item.type || 'download',
    content: item.content || '',
    downloadUrl: item.downloadUrl || '',
    onlineUrl: item.onlineUrl || '',
    isMerch: Boolean(item.isMerch)
  });
  saveQuickCart(cart);
  if (window.showToast) window.showToast(`🛒 "${item.title}" aggiunto al Carrello Rapido!`, 'success');
}

export function removeFromQuickCart(itemId) {
  const next = getQuickCart().filter(x => String(x.id) !== String(itemId));
  saveQuickCart(next);
}

function updateHeaderCartBadge() {
  const count = getQuickCart().length;
  const badge = document.getElementById('ipx-cart-count-badge');
  if (badge) {
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
}

function injectHeaderCartButton() {
  const navRight = document.querySelector('.nav-right');
  if (!navRight || document.getElementById('ipx-header-cart-btn')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'ipx-header-cart-btn';
  btn.className = 'btn btn-prime-outline';
  btn.title = 'Carrello Rapido & Impostazioni 1-Click';
  btn.style.cssText = 'position: relative; padding: 6px 12px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; font-size: 0.84rem; font-weight: 800; border-color: rgba(245, 158, 11, 0.55); color: #fbbf24; background: rgba(245, 158, 11, 0.1); cursor: pointer;';
  btn.innerHTML = `
    <i class="fas fa-shopping-cart"></i>
    <span class="cart-label-text" style="display: inline;">Carrello</span>
    <span id="ipx-cart-count-badge" style="display: none; background: #f59e0b; color: #0f172a; font-size: 0.72rem; font-weight: 900; min-width: 19px; height: 19px; border-radius: 999px; align-items: center; justify-content: center; padding: 0 5px;">0</span>
  `;
  btn.onclick = () => openQuickCartDrawer();

  const authButtons = navRight.querySelector('.auth-buttons');
  if (authButtons) {
    navRight.insertBefore(btn, authButtons);
  } else {
    navRight.appendChild(btn);
  }
  updateHeaderCartBadge();
}

export function initExpress1ClickSystem() {
  injectHeaderCartButton();
  injectExpress1ClickModals();
  wireMerchCardsFor1Click();

  window.openQuickBuyModal = openQuickBuyModal;
  window.addToQuickCart = addToQuickCart;
  window.openQuickCartDrawer = openQuickCartDrawer;
  window.isGameOwnedExpress = isGameOwnedExpress;
}

function wireMerchCardsFor1Click() {
  // Wire Merchandising cards on index.html and game.html so they can be bought in 1-Click too!
  document.querySelectorAll('.merch-card, .merch-item-card-horizontal').forEach((card, idx) => {
    if (card.dataset.wired1click === 'true') return;
    card.dataset.wired1click = 'true';
    const titleEl = card.querySelector('h3');
    const priceEl = card.querySelector('.price');
    const imgEl = card.querySelector('img');
    if (!titleEl || !priceEl) return;

    const title = titleEl.textContent.trim();
    const rawPrice = priceEl.textContent.replace(/[^0-9.,]/g, '').replace(',', '.');
    const price = parseFloat(rawPrice) || 29.9;
    const imageUrl = imgEl ? imgEl.getAttribute('src') : '/images/merch_hoodie_samurai_1777198641485.png';
    const merchItem = {
      id: 'merch-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + idx,
      title,
      price,
      imageUrl,
      developer: 'IndiePlay Official Store',
      isMerch: true
    };

    const existingBtn = card.querySelector('button');
    if (existingBtn) {
      existingBtn.innerHTML = '<i class="fas fa-bolt" style="color:#fbbf24;"></i> Acquista 1-Click';
      existingBtn.onclick = (e) => {
        e.stopPropagation();
        openQuickBuyModal(merchItem);
      };
    } else {
      const overlay = card.querySelector('.merch-card-overlay');
      if (overlay && !overlay.querySelector('.merch-1click-bar')) {
        const bar = document.createElement('div');
        bar.className = 'merch-1click-bar';
        bar.style.cssText = 'display: flex; gap: 6px; margin-top: 8px;';
        bar.innerHTML = `
          <button type="button" class="btn-1click-merch" style="flex: 1; background: linear-gradient(135deg, #f59e0b, #ea580c); color: #0f172a; border: none; padding: 6px 10px; border-radius: 6px; font-size: 0.76rem; font-weight: 900; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px;">
            <i class="fas fa-bolt"></i> Acquista 1-Click
          </button>
          <button type="button" class="btn-cart-merch" title="Aggiungi al Carrello" style="background: rgba(255,255,255,0.14); color: white; border: 1px solid rgba(255,255,255,0.25); padding: 6px 10px; border-radius: 6px; font-size: 0.76rem; font-weight: 800; cursor: pointer;">
            <i class="fas fa-cart-plus"></i>
          </button>
        `;
        overlay.appendChild(bar);
        bar.querySelector('.btn-1click-merch').onclick = (e) => {
          e.stopPropagation();
          openQuickBuyModal(merchItem);
        };
        bar.querySelector('.btn-cart-merch').onclick = (e) => {
          e.stopPropagation();
          addToQuickCart(merchItem);
        };
      }
      card.style.cursor = 'pointer';
      card.onclick = () => openQuickBuyModal(merchItem);
    }
  });
}

function injectExpress1ClickModals() {
  if (document.getElementById('ipx-1click-modal')) return;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <!-- Modal Acquisto Istantaneo 1-Click (Amazon + Steam Style) -->
    <div id="ipx-1click-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3800;">
      <div class="modal-content glass" style="background: rgba(13, 20, 30, 0.99); border: 1px solid rgba(245, 158, 11, 0.55); border-radius: 16px; padding: 1.8rem; max-width: 520px; width: 94%; max-height: 92vh; overflow-y: auto; color: white; position: relative; box-shadow: 0 25px 65px rgba(0,0,0,0.92);">
        <span class="close-lightbox" id="close-ipx-1click" style="position: absolute; top: 0.7rem; right: 1.1rem; font-size: 2.1rem; cursor: pointer; color: var(--text-gray);">&times;</span>
        <div id="ipx-1click-body"></div>
      </div>
    </div>

    <!-- Drawer / Modal Carrello Rapido Multi-Titolo -->
    <div id="ipx-quick-cart-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3750;">
      <div class="modal-content glass" style="background: rgba(13, 20, 30, 0.99); border: 1px solid rgba(0, 168, 225, 0.45); border-radius: 16px; padding: 1.8rem; max-width: 540px; width: 94%; max-height: 90vh; overflow-y: auto; color: white; position: relative; box-shadow: 0 25px 65px rgba(0,0,0,0.92);">
        <span class="close-lightbox" id="close-ipx-cart" style="position: absolute; top: 0.7rem; right: 1.1rem; font-size: 2.1rem; cursor: pointer; color: var(--text-gray);">&times;</span>
        <div id="ipx-quick-cart-body"></div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  const m1 = document.getElementById('ipx-1click-modal');
  const mCart = document.getElementById('ipx-quick-cart-modal');
  document.getElementById('close-ipx-1click').onclick = () => (m1.style.display = 'none');
  document.getElementById('close-ipx-cart').onclick = () => (mCart.style.display = 'none');
  m1.onclick = (e) => { if (e.target === m1) m1.style.display = 'none'; };
  mCart.onclick = (e) => { if (e.target === mCart) mCart.style.display = 'none'; };
}

export function openQuickCartDrawer() {
  injectExpress1ClickModals();
  const modal = document.getElementById('ipx-quick-cart-modal');
  const body = document.getElementById('ipx-quick-cart-body');
  const cart = getQuickCart();
  const assetHelper = window.getAssetUrl || ((p) => p);
  const total = cart.reduce((acc, item) => acc + (Number(item.price) || 0), 0);

  body.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.8rem;">
      <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; display: flex; align-items: center; justify-content: center;">
        <i class="fas fa-shopping-cart" style="color: #fbbf24; font-size: 1.1rem;"></i>
      </div>
      <div>
        <h3 style="margin: 0; font-size: 1.25rem; font-weight: 900;">Il Tuo Carrello Rapido (${cart.length})</h3>
        <span style="font-size: 0.78rem; color: var(--text-gray);">Checkout immediato stile Amazon 1-Click</span>
      </div>
    </div>

    ${cart.length === 0 ? `
      <div style="padding: 2rem 1rem; text-align: center; color: var(--text-gray);">
        <i class="fas fa-shopping-basket" style="font-size: 2.2rem; margin-bottom: 0.6rem; opacity: 0.5;"></i>
        <p style="margin: 0; font-size: 0.92rem;">Il tuo carrello è vuoto. Clicca su <strong>⚡ 1-Click</strong> o su <strong>🛒</strong> su qualsiasi gioco per acquistarlo all'istante!</p>
      </div>
    ` : `
      <div style="display: flex; flex-direction: column; gap: 0.65rem; max-height: 290px; overflow-y: auto; margin-bottom: 1.1rem;">
        ${cart.map(item => `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 8px 10px;">
            <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
              <img src="${safeUrl(assetHelper(item.imageUrl))}" alt="${escapeHTML(item.title)}" style="width: 54px; height: 38px; object-fit: cover; border-radius: 6px; flex-shrink: 0;">
              <div style="min-width: 0;">
                <div style="font-weight: 800; font-size: 0.88rem; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(item.title)}</div>
                <div style="font-size: 0.74rem; color: var(--text-gray);">${escapeHTML(item.developer || 'IndiePlay-X')}</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
              <strong style="color: #fbbf24; font-size: 0.9rem;">${Number(item.price) === 0 ? 'GRATIS' : '€' + Number(item.price).toFixed(2)}</strong>
              <button type="button" class="remove-cart-item-btn" data-id="${escapeHTML(item.id)}" title="Rimuovi" style="background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; width: 28px; height: 28px; cursor: pointer;">
                <i class="fas fa-trash-alt" style="font-size: 0.75rem;"></i>
              </button>
            </div>
          </div>
        `).join('')}
      </div>

      <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 10px; padding: 0.9rem 1rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <span style="font-size: 0.9rem; font-weight: 700; color: #e2e8f0;">Totale Ordine (${cart.length} ${cart.length === 1 ? 'articolo' : 'articoli'}):</span>
        <strong style="font-size: 1.25rem; font-weight: 900; color: #fbbf24;">€${total.toFixed(2)}</strong>
      </div>

      <div style="display: flex; gap: 0.7rem;">
        <button type="button" id="clear-quick-cart-btn" class="btn btn-prime-outline" style="padding: 0.75rem 1rem; font-size: 0.82rem;">Svuota</button>
        <button type="button" id="checkout-all-1click-btn" class="btn btn-prime" style="flex: 1; padding: 0.85rem 1.2rem; font-weight: 900; font-size: 0.95rem; background: linear-gradient(135deg, #f59e0b, #ea580c); color: #0f172a; border: none; justify-content: center;">
          <i class="fas fa-bolt"></i> Procedi all'Acquisto 1-Click (€${total.toFixed(2)})
        </button>
      </div>
    `}
  `;

  modal.style.display = 'flex';

  body.querySelectorAll('.remove-cart-item-btn').forEach(btn => {
    btn.onclick = () => {
      removeFromQuickCart(btn.getAttribute('data-id'));
      openQuickCartDrawer();
    };
  });

  const clearBtn = document.getElementById('clear-quick-cart-btn');
  if (clearBtn) {
    clearBtn.onclick = () => {
      saveQuickCart([]);
      openQuickCartDrawer();
    };
  }

  const checkoutAllBtn = document.getElementById('checkout-all-1click-btn');
  if (checkoutAllBtn) {
    checkoutAllBtn.onclick = () => {
      modal.style.display = 'none';
      openQuickBuyModal(cart, true);
    };
  }
}

/**
 * Opens the Amazon-Style 1-Click Instant Checkout for a single game/merch item or an array of cart items.
 */
export function openQuickBuyModal(itemOrItems, isCartBatch = false) {
  injectExpress1ClickModals();
  const modal = document.getElementById('ipx-1click-modal');
  const body = document.getElementById('ipx-1click-body');
  const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
  if (items.length === 0 || !items[0]) return;

  const assetHelper = window.getAssetUrl || ((p) => p);
  const wallet = get1ClickWallet();
  const user = getActiveUser();
  const payCfg = getPaymentConfig();

  const totalAmount = items.reduce((sum, it) => {
    const p = (it.price === 'FREE' || it.price === '0' || !it.price) ? 0 : (parseFloat(String(it.price).replace(',', '.')) || 0);
    return sum + p;
  }, 0);
  const isFreeOrder = totalAmount === 0;
  const split = calculateSplitPayment(totalAmount);
  const firstItem = items[0];

  let selectedMethod = wallet.method || 'saved_card';

  const renderCheckoutStep = () => {
    body.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 0.9rem; padding-bottom: 0.7rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="background: linear-gradient(135deg, #f59e0b, #ea580c); color: #0f172a; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 900; letter-spacing: 0.4px;">
            <i class="fas fa-bolt"></i> ${isFreeOrder ? 'RISCATTO ISTANTANEO 1-CLICK' : 'ACQUISTO 1-CLICK®'}
          </span>
          <span style="font-size: 0.78rem; color: #34d399; font-weight: 700;"><i class="fas fa-lock"></i> Cifratura SSL 256-bit</span>
        </div>
      </div>

      <!-- Riepilogo Prodotto / Ordine -->
      <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 0.9rem; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
          <img src="${safeUrl(assetHelper(firstItem.imageUrl || '/images/placeholder.png'))}" alt="${escapeHTML(firstItem.title)}" style="width: 68px; height: 48px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); flex-shrink: 0;">
          <div style="min-width: 0;">
            <div style="font-size: 1rem; font-weight: 900; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${items.length === 1 ? escapeHTML(firstItem.title) : `${items.length} Prodotti nel Carrello`}
            </div>
            <div style="font-size: 0.78rem; color: var(--text-gray);">
              ${items.length === 1 ? `Sviluppatore: <strong style="color:#38bdf8;">${escapeHTML(firstItem.developer || 'IndiePlay Studio')}</strong>` : items.map(i => escapeHTML(i.title)).join(', ')}
            </div>
          </div>
        </div>
        <div style="text-align: right; flex-shrink: 0;">
          <div style="font-size: 1.25rem; font-weight: 900; color: #fbbf24;">${isFreeOrder ? 'GRATIS' : '€' + totalAmount.toFixed(2)}</div>
          <div style="font-size: 0.7rem; color: #34d399; font-weight: 700;">Consegna Digitale Immediata</div>
        </div>
      </div>

      ${!isFreeOrder ? `
        <!-- Scelta Metodo Rapido (1 Toccco, stile Amazon) -->
        <div style="margin-bottom: 1rem;">
          <label style="font-size: 0.76rem; color: var(--text-gray); font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">
            Metodo di Pagamento Rapido (1-Click)
          </label>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 10px;">
            <button type="button" class="ipx-pay-method-tab" data-method="saved_card" style="padding: 9px 6px; border-radius: 8px; border: 1px solid ${selectedMethod === 'saved_card' ? '#f59e0b' : 'rgba(255,255,255,0.14)'}; background: ${selectedMethod === 'saved_card' ? 'rgba(245, 158, 11, 0.18)' : 'rgba(255,255,255,0.03)'}; color: white; font-size: 0.76rem; font-weight: 800; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;">
              <i class="fas fa-bolt" style="color: #fbbf24; font-size: 1rem;"></i>
              <span>Carta 1-Click</span>
              <small style="font-size: 0.66rem; color: #94a3b8;">•••• ${escapeHTML(wallet.last4 || '4242')}</small>
            </button>
            <button type="button" class="ipx-pay-method-tab" data-method="paypal_express" style="padding: 9px 6px; border-radius: 8px; border: 1px solid ${selectedMethod === 'paypal_express' ? '#38bdf8' : 'rgba(255,255,255,0.14)'}; background: ${selectedMethod === 'paypal_express' ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255,255,255,0.03)'}; color: white; font-size: 0.76rem; font-weight: 800; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;">
              <i class="fab fa-paypal" style="color: #38bdf8; font-size: 1rem;"></i>
              <span>PayPal / GPay</span>
              <small style="font-size: 0.66rem; color: #94a3b8;">Express 1-Click</small>
            </button>
            <button type="button" class="ipx-pay-method-tab" data-method="new_card" style="padding: 9px 6px; border-radius: 8px; border: 1px solid ${selectedMethod === 'new_card' ? '#34d399' : 'rgba(255,255,255,0.14)'}; background: ${selectedMethod === 'new_card' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(255,255,255,0.03)'}; color: white; font-size: 0.76rem; font-weight: 800; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px;">
              <i class="far fa-credit-card" style="color: #34d399; font-size: 1rem;"></i>
              <span>Nuova Carta</span>
              <small style="font-size: 0.66rem; color: #94a3b8;">Visa / Master</small>
            </button>
          </div>

          ${selectedMethod === 'saved_card' ? `
            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 10px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem;">
              <div>
                <div style="font-weight: 800; color: #34d399;"><i class="fas fa-check-circle"></i> Metodo Predefinito 1-Click Attivo</div>
                <div style="color: #cbd5e1; font-size: 0.78rem; margin-top: 2px;">${escapeHTML(wallet.brand)} terminante con <strong>•••• ${escapeHTML(wallet.last4)}</strong> (Scad. ${escapeHTML(wallet.expiry)})</div>
              </div>
              <span style="font-size: 0.72rem; background: rgba(255,255,255,0.08); padding: 3px 8px; border-radius: 4px; color: #fbbf24; font-weight: 700;">Zero Campi</span>
            </div>
          ` : ''}

          ${selectedMethod === 'paypal_express' ? `
            <div style="background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 10px; padding: 10px 12px; font-size: 0.82rem; color: #e2e8f0;">
              <i class="fab fa-paypal" style="color: #38bdf8;"></i> <strong>Wallet Express collegato:</strong> conferma con 1 solo clic senza inserire i numeri della carta.
            </div>
          ` : ''}

          ${selectedMethod === 'new_card' ? `
            <div style="background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
              <input type="text" id="ipx-1c-card-holder" placeholder="Intestatario Carta (es. Mario Rossi)" value="${escapeHTML(wallet.cardHolder || '')}" style="width: 100%; padding: 9px; background: #0f1722; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: white; font-size: 0.86rem;">
              <input type="text" id="ipx-1c-card-num" placeholder="Numero Carta (es. 4000 1234 5678 4242)" maxlength="19" style="width: 100%; padding: 9px; background: #0f1722; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: white; font-size: 0.86rem;">
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <input type="text" id="ipx-1c-card-exp" placeholder="MM/AA" maxlength="5" value="12/29" style="width: 100%; padding: 9px; background: #0f1722; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: white; font-size: 0.86rem; text-align: center;">
                <input type="text" id="ipx-1c-card-cvv" placeholder="CVV" maxlength="4" value="123" style="width: 100%; padding: 9px; background: #0f1722; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: white; font-size: 0.86rem; text-align: center;">
              </div>
              <label style="display: flex; align-items: center; gap: 8px; font-size: 0.78rem; color: #fbbf24; cursor: pointer; margin-top: 2px;">
                <input type="checkbox" id="ipx-1c-save-card" checked style="accent-color: #f59e0b;">
                <span>Salva per i prossimi acquisti istantanei <strong>1-Click</strong></span>
              </label>
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- Email Ricevuta Rapida (se l'utente non è loggato non viene bloccato!) -->
      <div style="margin-bottom: 1rem;">
        ${user ? `
          <div style="font-size: 0.78rem; color: #94a3b8; display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); padding: 7px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
            <span><i class="fas fa-user-check" style="color: #34d399;"></i> Account collegato: <strong style="color: white;">${escapeHTML(user.email)}</strong></span>
            <span style="color: #38bdf8; font-weight: 700;">Sincronizzato in Cloud</span>
          </div>
        ` : `
          <label style="font-size: 0.75rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 4px;">
            <i class="fas fa-envelope" style="color: var(--prime-blue);"></i> Email per Ricevuta & Sblocco Immediato (Senza obbligo di registrazione)
          </label>
          <input type="email" id="ipx-1c-guest-email" placeholder="La tua email (opzionale per test rapido)..." value="${escapeHTML(wallet.buyerEmail || '')}" style="width: 100%; padding: 9px 11px; background: #0f1722; border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; color: white; font-size: 0.86rem;">
        `}
      </div>

      ${!isFreeOrder ? `
        <div style="font-size: 0.74rem; color: #94a3b8; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 7px 10px; margin-bottom: 1rem; display: flex; justify-content: space-between;">
          <span>Quota Sviluppatore (${split.developerPercent}%): <strong style="color:#34d399;">€${split.developerShare.toFixed(2)}</strong></span>
          <span>Fee Piattaforma (${split.platformFeePercent}%): <strong>€${split.platformShare.toFixed(2)}</strong></span>
        </div>
      ` : ''}

      <button type="button" id="ipx-confirm-1click-btn" class="btn btn-prime" style="width: 100%; padding: 1rem; font-size: 1.02rem; font-weight: 900; border-radius: 10px; background: linear-gradient(135deg, #f59e0b, #ea580c); color: #0f172a; border: none; justify-content: center; box-shadow: 0 8px 22px rgba(245, 158, 11, 0.35); cursor: pointer;">
        <i class="fas fa-bolt"></i> ${isFreeOrder ? 'Ottieni e Sblocca Subito (Gratis)' : `Compra Ora con 1-Click — €${totalAmount.toFixed(2)}`}
      </button>
    `;

    body.querySelectorAll('.ipx-pay-method-tab').forEach(tab => {
      tab.onclick = () => {
        selectedMethod = tab.getAttribute('data-method');
        save1ClickWallet({ method: selectedMethod });
        renderCheckoutStep();
      };
    });

    const confirmBtn = document.getElementById('ipx-confirm-1click-btn');
    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        if (!isFreeOrder && selectedMethod === 'new_card') {
          const rawNum = (document.getElementById('ipx-1c-card-num')?.value || '').trim();
          const holder = (document.getElementById('ipx-1c-card-holder')?.value || 'Cliente IndiePlay-X').trim();
          const exp = (document.getElementById('ipx-1c-card-exp')?.value || '12/29').trim();
          if (payCfg.realPaymentsEnabled && !validateCardLuhn(rawNum)) {
            if (window.showToast) window.showToast('Numero di carta non valido (controllo Luhn).', 'error');
            return;
          }
          const digits = rawNum.replace(/\D+/g, '');
          const last4 = digits.length >= 4 ? digits.slice(-4) : '4242';
          if (document.getElementById('ipx-1c-save-card')?.checked) {
            save1ClickWallet({
              method: 'saved_card',
              cardHolder: holder,
              last4,
              expiry: exp
            });
          }
        }

        const guestEmailEl = document.getElementById('ipx-1c-guest-email');
        const buyerEmail = user ? user.email : (guestEmailEl?.value.trim() || wallet.buyerEmail || 'guest@indieplayx.com');
        if (!user && buyerEmail) save1ClickWallet({ buyerEmail });

        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sblocco immediato in corso...';

        try {
          for (const it of items) {
            markGameOwnedExpress(it.id);

            if (user && !it.isMerch) {
              try {
                const libRef = collection(db, 'users', user.uid, 'library');
                await addDoc(libRef, {
                  gameId: String(it.id),
                  title: it.title || 'Gioco IndiePlay-X',
                  imageUrl: it.imageUrl || '/images/placeholder.png',
                  addedAt: new Date()
                });
              } catch (e) {}
            }

            if (!isFreeOrder) {
              await recordSplitTransaction({
                gameId: String(it.id),
                gameTitle: it.title,
                developerName: it.developer || 'Indie Studio',
                sellerId: it.sellerId || '',
                price: it.price,
                buyerUid: user ? user.uid : 'express_guest',
                buyerEmail
              });
            }
          }

          if (isCartBatch) {
            saveQuickCart([]);
          } else {
            removeFromQuickCart(firstItem.id);
          }

          window.dispatchEvent(new CustomEvent('indieplay:purchasecomplete', { detail: { items } }));

          // Render Instant Success & Direct Download / Play Action!
          const hasOnline = firstItem.type === 'online' || firstItem.type === 'browser' || firstItem.type === 'both' || firstItem.onlineUrl || (firstItem.content && String(firstItem.content).startsWith('http'));
          const onlineUrl = firstItem.onlineUrl || (firstItem.content && String(firstItem.content).startsWith('http') ? firstItem.content : '');

          body.innerHTML = `
            <div style="text-align: center; padding: 0.6rem 0.2rem;">
              <div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(16, 185, 129, 0.18); border: 2px solid #34d399; display: flex; align-items: center; justify-content: center; margin: 0 auto 0.9rem;">
                <i class="fas fa-check" style="color: #34d399; font-size: 1.8rem;"></i>
              </div>
              <h3 style="margin: 0 0 6px; font-size: 1.4rem; font-weight: 900; color: white;">
                ${isFreeOrder ? 'Titolo Sbloccato!' : 'Acquisto 1-Click Completato!'}
              </h3>
              <p style="margin: 0 0 1.2rem; font-size: 0.86rem; color: #94a3b8;">
                <strong>${items.length === 1 ? escapeHTML(firstItem.title) : `${items.length} titoli`}</strong> ${firstItem.isMerch ? 'ordinato con successo! Riceverai il tracking via email.' : 'è ora attivo e pronto per il download o l\'avvio immediato.'}
              </p>

              <div style="display: flex; flex-direction: column; gap: 0.65rem;">
                ${!firstItem.isMerch && hasOnline && onlineUrl ? `
                  <a href="${safeUrl(onlineUrl)}" target="_blank" class="btn btn-prime" style="padding: 0.9rem; font-weight: 900; justify-content: center; text-decoration: none; background: #10b981;">
                    <i class="fas fa-play"></i> Gioca Subito in Cloud
                  </a>
                ` : ''}

                ${!firstItem.isMerch ? `
                  <a href="game.html?id=${encodeURIComponent(firstItem.id)}&autostart=1" class="btn btn-prime" style="padding: 0.9rem; font-weight: 900; justify-content: center; text-decoration: none;">
                    <i class="fas fa-download"></i> ${window.location.pathname.includes('game.html') ? 'Scarica / Avvia Ora dalla Pagina' : 'Vai al Download Immediato (.ZIP / Cloud)'}
                  </a>
                ` : ''}

                <button type="button" id="ipx-1click-done-btn" class="btn btn-prime-outline" style="padding: 0.75rem; font-weight: 700; justify-content: center;">
                  Continua su IndiePlay-X
                </button>
              </div>
            </div>
          `;

          const doneBtn = document.getElementById('ipx-1click-done-btn');
          if (doneBtn) {
            doneBtn.onclick = () => {
              modal.style.display = 'none';
            };
          }
        } catch (err) {
          if (window.showToast) window.showToast('Errore durante l\'operazione: ' + err.message, 'error');
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = '<i class="fas fa-bolt"></i> Riprova 1-Click';
        }
      };
    }
  };

  renderCheckoutStep();
  modal.style.display = 'flex';
}

// ============================================================================
// 4. PROGETTI SPECIALI INDIEPLAY-X: BITBONK™ (FASE 1) & MEME CONSOLE™ (FASE 2)
// ============================================================================
const STORAGE_KEY_WAITLISTS = 'indieplay_special_waitlists_v1';

function getWaitlists() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WAITLISTS);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { bitbonk: false, memeConsole: false, email: '' };
}

function saveWaitlistFlag(projectKey, email = '') {
  const curr = getWaitlists();
  curr[projectKey] = true;
  if (email) curr.email = email;
  try {
    localStorage.setItem(STORAGE_KEY_WAITLISTS, JSON.stringify(curr));
  } catch (e) {}
  return curr;
}

export function initSpecialProjectsSections() {
  injectSpecialProjectsModals();
  renderBitBonkSection();
  renderMemeConsoleSection();
  applyBackendFeatureFlags(getPaymentConfig());
}

function renderBitBonkSection() {
  const sec = document.getElementById('bitbonk-section');
  if (!sec) return;
  const assetHelper = window.getAssetUrl || ((p) => p);
  const wl = getWaitlists();

  sec.innerHTML = `
    <div class="section-header" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.2rem;">
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <span style="background: linear-gradient(135deg, #ec4899, #eab308); color: #0f172a; padding: 5px 12px; border-radius: 6px; font-weight: 900; font-size: 0.76rem; letter-spacing: 0.8px;">
          <i class="fas fa-bolt"></i> FASE 1 • PROSSIMO LANCIO
        </span>
        <h2 style="margin: 0; font-size: 1.55rem; font-weight: 900; color: white;">
          BITBONK™ <span style="color: #f472b6; font-weight: 700; font-size: 1.05rem;">— Carte da Gioco Collezionabili & Sticker Album (Series 01)</span>
        </h2>
      </div>
      <div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
        <button type="button" id="open-bitbonk-preview-btn" class="btn btn-prime" style="background: linear-gradient(135deg, #ec4899, #8b5cf6); border: none; padding: 0.6rem 1.15rem; font-size: 0.84rem; font-weight: 800; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 16px rgba(236, 72, 153, 0.35);">
          <i class="fas fa-clone"></i> Esplora Carte & Album Series 01
        </button>
        <button type="button" id="join-bitbonk-waitlist-btn" class="btn btn-prime-outline" style="padding: 0.58rem 1rem; font-size: 0.82rem; font-weight: 800; border-color: ${wl.bitbonk ? '#34d399' : 'rgba(244, 114, 182, 0.5)'}; color: ${wl.bitbonk ? '#34d399' : '#f472b6'}; display: inline-flex; align-items: center; gap: 6px;">
          <i class="fas ${wl.bitbonk ? 'fa-check-circle' : 'fa-bell'}"></i> ${wl.bitbonk ? 'Iscritto al Drop Series 01' : 'Avvisami al Lancio'}
        </button>
      </div>
    </div>

    <div class="special-project-card bitbonk-showcase-banner" style="background: linear-gradient(135deg, rgba(30, 14, 46, 0.92) 0%, rgba(12, 19, 31, 0.96) 100%); border: 1px solid rgba(236, 72, 153, 0.32); border-radius: 16px; padding: 1.8rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; align-items: center; box-shadow: 0 18px 45px rgba(0, 0, 0, 0.55); position: relative; overflow: hidden;">
      <!-- Colonna Sinistra: Concept, Lore & Roadmap Fase 1 -->
      <div style="z-index: 2;">
        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(236, 72, 153, 0.14); border: 1px solid rgba(236, 72, 153, 0.35); color: #f472b6; padding: 4px 12px; border-radius: 999px; font-size: 0.74rem; font-weight: 800; margin-bottom: 0.9rem;">
          <i class="fas fa-fire"></i> ARCADE CHAOS • TRADING CARDS & STICKER ALBUM
        </div>
        <h3 style="font-size: clamp(1.35rem, 2.4vw, 1.9rem); font-weight: 900; color: white; line-height: 1.2; margin: 0 0 0.8rem;">
          L'Universo Collezionabile <span style="color: #facc15;">Arcade Chaos</span> & <span style="color: #f472b6;">Sticker Series</span> targato IndiePlay-X
        </h3>
        <p style="color: #cbd5e1; font-size: 0.94rem; line-height: 1.65; margin: 0 0 1.2rem;">
          <strong>BITBONK™ Series 01</strong> porta su IndiePlay-X una collezione esplosiva di <strong>carte da gioco collezionabili</strong> e uno <strong>Sticker Album interattivo</strong> dedicato ai personaggi più iconici e folli della scena arcade indipendente — a partire dal leggendario <em>"Peperito Saltellito"</em>.
        </p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 1.3rem;">
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 0.75rem 0.9rem;">
            <div style="color: #facc15; font-weight: 800; font-size: 0.82rem; margin-bottom: 3px;"><i class="fas fa-star"></i> Carte Foil & Rarità</div>
            <div style="color: #94a3b8; font-size: 0.76rem; line-height: 1.4;">Personaggi iconici, eroi Pixel-Art e boss Arcade numerati per rarità.</div>
          </div>
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 0.75rem 0.9rem;">
            <div style="color: #f472b6; font-weight: 800; font-size: 0.82rem; margin-bottom: 3px;"><i class="fas fa-book-open"></i> Sticker Album Series 01</div>
            <div style="color: #94a3b8; font-size: 0.76rem; line-height: 1.4;">Completa l'album ufficiale, sblocca ricompense e scambia con la community.</div>
          </div>
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 0.75rem 0.9rem;">
            <div style="color: #38bdf8; font-weight: 800; font-size: 0.82rem; margin-bottom: 3px;"><i class="fas fa-gamepad"></i> Deck & Sfide Rapide</div>
            <div style="color: #94a3b8; font-size: 0.76rem; line-height: 1.4;">Usa le tue carte in duelli rapidi da browser e colleziona edizioni fisiche.</div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <button type="button" class="open-bitbonk-card-trigger btn btn-prime" style="background: linear-gradient(135deg, #facc15, #f97316); color: #0f172a; border: none; padding: 0.75rem 1.3rem; font-weight: 900; font-size: 0.86rem;">
            <i class="fas fa-search-plus"></i> Ispeziona "Peperito Saltellito" & Album
          </button>
          <span style="font-size: 0.78rem; color: #94a3b8;"><i class="fas fa-calendar-check" style="color: #f472b6;"></i> Priorità Sviluppo: <strong>Prima di Meme Console</strong></span>
        </div>
      </div>

      <!-- Colonna Destra: Visual Showcase 3D delle 2 Immagini BitBonk -->
      <div style="display: flex; align-items: center; justify-content: center; gap: 1.2rem; flex-wrap: wrap; z-index: 2;">
        <!-- Copertina Album BITBONK Series 01 -->
        <div class="bitbonk-3d-card open-bitbonk-card-trigger" data-focus="album" title="Clicca per ingrandire lo Sticker Album Series 01" style="width: 215px; border-radius: 14px; overflow: hidden; border: 2px solid rgba(236, 72, 153, 0.55); box-shadow: 0 14px 32px rgba(236, 72, 153, 0.28); cursor: pointer; position: relative; background: #090d16;">
          <img src="${safeUrl(assetHelper('/images/bitbonk_album_series01.jpg'))}" alt="BIT BONK Arcade Chaos Sticker Album Series 01" loading="lazy" style="width: 100%; height: 285px; object-fit: cover; display: block;">
          <div style="padding: 8px 10px; background: rgba(15, 23, 34, 0.95); display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.74rem; font-weight: 900; color: #f472b6;">ALBUM SERIES 01</span>
            <span style="font-size: 0.68rem; background: #facc15; color: #0f172a; padding: 2px 6px; border-radius: 4px; font-weight: 900;">UFFICIALE</span>
          </div>
        </div>

        <!-- Carta "Peperito Saltellito" Special Foil Edition -->
        <div class="bitbonk-3d-card open-bitbonk-card-trigger" data-focus="card" title="Clicca per ispezionare la carta Peperito Saltellito" style="width: 205px; border-radius: 14px; overflow: hidden; border: 2px solid rgba(250, 204, 21, 0.65); box-shadow: 0 14px 32px rgba(250, 204, 21, 0.25); cursor: pointer; position: relative; background: #090d16;">
          <img src="${safeUrl(assetHelper('/images/bitbonk_peperito_card.jpg'))}" alt="Carta BitBonk Peperito Saltellito" loading="lazy" style="width: 100%; height: 285px; object-fit: cover; display: block;">
          <div style="padding: 8px 10px; background: rgba(15, 23, 34, 0.95); display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.74rem; font-weight: 900; color: #facc15;">#001 PEPERITO</span>
            <span style="font-size: 0.68rem; background: rgba(236, 72, 153, 0.25); color: #f472b6; border: 1px solid rgba(236, 72, 153, 0.5); padding: 2px 6px; border-radius: 4px; font-weight: 800;">SPECIAL FOIL</span>
          </div>
        </div>
      </div>
    </div>
  `;

  const previewBtn = document.getElementById('open-bitbonk-preview-btn');
  if (previewBtn) previewBtn.onclick = () => openBitBonkModal('album');

  sec.querySelectorAll('.open-bitbonk-card-trigger').forEach(el => {
    el.onclick = () => openBitBonkModal(el.getAttribute('data-focus') || 'album');
  });

  const wlBtn = document.getElementById('join-bitbonk-waitlist-btn');
  if (wlBtn) {
    wlBtn.onclick = () => {
      saveWaitlistFlag('bitbonk');
      renderBitBonkSection();
      if (window.showToast) window.showToast('🃏 Sei iscritto alla lista prioritaria di BITBONK™ Series 01!', 'success');
    };
  }
}

function renderMemeConsoleSection() {
  const sec = document.getElementById('meme-console-section');
  if (!sec) return;
  const assetHelper = window.getAssetUrl || ((p) => p);
  const wl = getWaitlists();

  sec.innerHTML = `
    <div class="section-header" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.2rem;">
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <span style="background: rgba(168, 85, 247, 0.2); border: 1px solid #a855f7; color: #d8b4fe; padding: 5px 12px; border-radius: 6px; font-weight: 900; font-size: 0.76rem; letter-spacing: 0.8px;">
          <i class="fas fa-microchip"></i> FASE 2 • HARDWARE LAB IN SVILUPPO
        </span>
        <h2 style="margin: 0; font-size: 1.55rem; font-weight: 900; color: white;">
          MEME CONSOLE™ <span style="color: #c084fc; font-weight: 700; font-size: 1.05rem;">— Progetto Hardware Indie & Arcade (Model MC-01)</span>
        </h2>
      </div>
      <div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
        <button type="button" id="open-meme-console-lab-btn" class="btn btn-prime" style="background: linear-gradient(135deg, #9333ea, #3b82f6); border: none; padding: 0.6rem 1.15rem; font-size: 0.84rem; font-weight: 800; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 16px rgba(147, 51, 234, 0.35);">
          <i class="fas fa-cubes"></i> Blueprint & Scheda Tecnica MC-01
        </button>
        <button type="button" id="join-meme-waitlist-btn" class="btn btn-prime-outline" style="padding: 0.58rem 1rem; font-size: 0.82rem; font-weight: 800; border-color: ${wl.memeConsole ? '#34d399' : 'rgba(192, 132, 252, 0.5)'}; color: ${wl.memeConsole ? '#34d399' : '#c084fc'}; display: inline-flex; align-items: center; gap: 6px;">
          <i class="fas ${wl.memeConsole ? 'fa-check-circle' : 'fa-satellite-dish'}"></i> ${wl.memeConsole ? 'Insider Hardware Attivo' : 'Segui lo Sviluppo'}
        </button>
      </div>
    </div>

    <div class="special-project-card meme-console-banner" style="background: linear-gradient(135deg, rgba(16, 20, 34, 0.96) 0%, rgba(24, 14, 42, 0.94) 100%); border: 1px solid rgba(168, 85, 247, 0.32); border-radius: 16px; padding: 1.8rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; align-items: center; box-shadow: 0 18px 45px rgba(0, 0, 0, 0.55);">
      <!-- Colonna Sinistra: Render Hardware Ritagliati & Blueprint Esploso -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem;">
        <div class="open-meme-view-trigger" data-view="front" title="Clicca per ingrandire il Design Frontale MC-01" style="background: #0b101b; border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 12px; overflow: hidden; cursor: pointer; transition: transform 0.2s ease;">
          <img src="${safeUrl(assetHelper('/images/meme_console_front.jpg'))}" alt="Meme Console Model MC-01 Front LED View" loading="lazy" style="width: 100%; height: 185px; object-fit: cover; display: block;">
          <div style="padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; background: rgba(15, 23, 34, 0.95);">
            <span style="font-size: 0.74rem; font-weight: 800; color: #e2e8f0;">Scocca & LED Viola</span>
            <span style="font-size: 0.68rem; color: #c084fc; font-weight: 800;"><i class="fas fa-expand"></i> 3D</span>
          </div>
        </div>

        <div class="open-meme-view-trigger" data-view="exploded" title="Clicca per ispezionare l'Esploso Tecnico & Porte I/O" style="background: #0b101b; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 12px; overflow: hidden; cursor: pointer; transition: transform 0.2s ease;">
          <img src="${safeUrl(assetHelper('/images/meme_console_exploded.jpg'))}" alt="Meme Console Exploded Hardware View" loading="lazy" style="width: 100%; height: 185px; object-fit: cover; display: block;">
          <div style="padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; background: rgba(15, 23, 34, 0.95);">
            <span style="font-size: 0.74rem; font-weight: 800; color: #e2e8f0;">Esploso & I/O</span>
            <span style="font-size: 0.68rem; color: #38bdf8; font-weight: 800;"><i class="fas fa-project-diagram"></i> CAD</span>
          </div>
        </div>
      </div>

      <!-- Colonna Destra: Specifiche Concept MC-01 -->
      <div>
        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(168, 85, 247, 0.14); border: 1px solid rgba(168, 85, 247, 0.35); color: #c084fc; padding: 4px 12px; border-radius: 999px; font-size: 0.74rem; font-weight: 800; margin-bottom: 0.85rem;">
          <i class="fas fa-flask"></i> INDIEPLAY-X HARDWARE DIVISION • MODEL MC-01
        </div>
        <h3 style="font-size: clamp(1.3rem, 2.2vw, 1.75rem); font-weight: 900; color: white; line-height: 1.22; margin: 0 0 0.75rem;">
          Il Cubo Compatto per Portare il Catalogo IndiePlay-X in Salotto
        </h3>
        <p style="color: #cbd5e1; font-size: 0.92rem; line-height: 1.62; margin: 0 0 1.1rem;">
          <strong>MEME CONSOLE™ (Model MC-01)</strong> è la micro-console proprietaria attualmente in fase di ingegnerizzazione nei laboratori IndiePlay-X: scocca unibody minimalista con anello LED viola, pulsante frontale Pixel-Smile illuminato e accesso nativo immediato a tutti i titoli indie e alle carte <em>BitBonk</em>.
        </p>

        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 1.2rem;">
          <span style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); padding: 5px 10px; border-radius: 6px; font-size: 0.75rem; color: #e2e8f0; font-weight: 700;"><i class="fas fa-tv" style="color:#c084fc;"></i> Dual HDMI Out</span>
          <span style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); padding: 5px 10px; border-radius: 6px; font-size: 0.75rem; color: #e2e8f0; font-weight: 700;"><i class="fab fa-usb" style="color:#38bdf8;"></i> Dual USB 3.0 + LAN</span>
          <span style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); padding: 5px 10px; border-radius: 6px; font-size: 0.75rem; color: #e2e8f0; font-weight: 700;"><i class="fas fa-bolt" style="color:#fbbf24;"></i> Power 19V ⎓ 3.42A</span>
          <span style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); padding: 5px 10px; border-radius: 6px; font-size: 0.75rem; color: #e2e8f0; font-weight: 700;"><i class="fas fa-wind" style="color:#34d399;"></i> Flusso Aria Inferiore Silenzioso</span>
        </div>

        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <button type="button" class="open-meme-view-trigger btn btn-prime-outline" data-view="bottom" style="padding: 0.65rem 1.15rem; font-size: 0.82rem; font-weight: 800; border-color: rgba(168, 85, 247, 0.55); color: #d8b4fe;">
            <i class="fas fa-layer-group"></i> Vedi Tutte le 3 Viste Hardware (Fronte • Esploso • Base)
          </button>
          <span style="font-size: 0.76rem; color: #94a3b8;">Sviluppo previsto dopo il lancio di <strong>BitBonk™</strong></span>
        </div>
      </div>
    </div>
  `;

  const labBtn = document.getElementById('open-meme-console-lab-btn');
  if (labBtn) labBtn.onclick = () => openMemeConsoleModal('front');

  sec.querySelectorAll('.open-meme-view-trigger').forEach(el => {
    el.onclick = () => openMemeConsoleModal(el.getAttribute('data-view') || 'front');
  });

  const wlBtn = document.getElementById('join-meme-waitlist-btn');
  if (wlBtn) {
    wlBtn.onclick = () => {
      saveWaitlistFlag('memeConsole');
      renderMemeConsoleSection();
      if (window.showToast) window.showToast('🚀 Ti sei registrato agli aggiornamenti R&D di MEME CONSOLE (Model MC-01)!', 'success');
    };
  }
}

function injectSpecialProjectsModals() {
  if (document.getElementById('bitbonk-lab-modal')) return;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <!-- Modal Interattivo BITBONK Series 01 -->
    <div id="bitbonk-lab-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3850;">
      <div class="modal-content glass" style="background: rgba(14, 18, 29, 0.99); border: 1px solid rgba(236, 72, 153, 0.55); border-radius: 18px; padding: 1.8rem; max-width: 820px; width: 95%; max-height: 92vh; overflow-y: auto; color: white; position: relative; box-shadow: 0 25px 70px rgba(0,0,0,0.92);">
        <span class="close-lightbox" id="close-bitbonk-modal" style="position: absolute; top: 0.7rem; right: 1.1rem; font-size: 2.2rem; cursor: pointer; color: var(--text-gray);">&times;</span>
        <div id="bitbonk-lab-body"></div>
      </div>
    </div>

    <!-- Modal Interattivo MEME CONSOLE Blueprint & 3D Lab -->
    <div id="meme-console-lab-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3850;">
      <div class="modal-content glass" style="background: rgba(13, 17, 28, 0.99); border: 1px solid rgba(168, 85, 247, 0.55); border-radius: 18px; padding: 1.8rem; max-width: 820px; width: 95%; max-height: 92vh; overflow-y: auto; color: white; position: relative; box-shadow: 0 25px 70px rgba(0,0,0,0.92);">
        <span class="close-lightbox" id="close-meme-console-modal" style="position: absolute; top: 0.7rem; right: 1.1rem; font-size: 2.2rem; cursor: pointer; color: var(--text-gray);">&times;</span>
        <div id="meme-console-lab-body"></div>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  const bModal = document.getElementById('bitbonk-lab-modal');
  const mModal = document.getElementById('meme-console-lab-modal');
  document.getElementById('close-bitbonk-modal').onclick = () => (bModal.style.display = 'none');
  document.getElementById('close-meme-console-modal').onclick = () => (mModal.style.display = 'none');
  bModal.onclick = (e) => { if (e.target === bModal) bModal.style.display = 'none'; };
  mModal.onclick = (e) => { if (e.target === mModal) mModal.style.display = 'none'; };
}

export function openBitBonkModal(initialFocus = 'album') {
  injectSpecialProjectsModals();
  const modal = document.getElementById('bitbonk-lab-modal');
  const body = document.getElementById('bitbonk-lab-body');
  const assetHelper = window.getAssetUrl || ((p) => p);
  let activeTab = initialFocus;

  const render = () => {
    const wl = getWaitlists();
    const isAlbum = activeTab === 'album';
    const currentImg = isAlbum ? '/images/bitbonk_album_series01.jpg' : '/images/bitbonk_peperito_card.jpg';

    body.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.8rem; flex-wrap: wrap;">
        <span style="background: linear-gradient(135deg, #ec4899, #eab308); color: #0f172a; padding: 4px 10px; border-radius: 6px; font-size: 0.74rem; font-weight: 900;">
          BITBONK™ • SERIES 01
        </span>
        <h3 style="margin: 0; font-size: 1.3rem; font-weight: 900;">Anteprima Ufficiale Carte Collezionabili & Sticker Album</h3>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(275px, 1fr)); gap: 1.5rem; align-items: center;">
        <div style="text-align: center;">
          <img src="${safeUrl(assetHelper(currentImg))}" alt="BitBonk Preview" style="max-height: 410px; width: auto; max-width: 100%; border-radius: 14px; border: 2px solid ${isAlbum ? '#ec4899' : '#facc15'}; box-shadow: 0 18px 40px rgba(0,0,0,0.75);">
          <div style="display: flex; justify-content: center; gap: 8px; margin-top: 12px;">
            <button type="button" class="bb-switch-tab btn ${isAlbum ? 'btn-prime' : 'btn-prime-outline'}" data-tab="album" style="padding: 6px 14px; font-size: 0.8rem; font-weight: 800;">
              <i class="fas fa-book"></i> Sticker Album Series 01
            </button>
            <button type="button" class="bb-switch-tab btn ${!isAlbum ? 'btn-prime' : 'btn-prime-outline'}" data-tab="card" style="padding: 6px 14px; font-size: 0.8rem; font-weight: 800;">
              <i class="fas fa-id-badge"></i> Carta #001 Peperito Saltellito
            </button>
          </div>
        </div>

        <div>
          <h4 style="font-size: 1.25rem; font-weight: 900; color: ${isAlbum ? '#f472b6' : '#facc15'}; margin: 0 0 0.6rem;">
            ${isAlbum ? 'Sticker Album "Arcade Chaos — Series 01"' : 'Carta #001: "Peperito Saltellito" (Special Foil)'}
          </h4>
          <p style="font-size: 0.9rem; color: #cbd5e1; line-height: 1.6; margin: 0 0 1rem;">
            ${isAlbum
              ? 'Il primo raccoglitore ufficiale targato IndiePlay-X: un mix esplosivo di estetica Arcade anni \'90, sticker olografici e personaggi originali nati dalla community indipendente.'
              : 'Il peperoncino messicano più piccante del multiverso platform! Dotato di sombrero corazzato e doppio salto infuocato, Peperito Saltellito inaugura il set base di BITBONK Series 01.'}
          </p>

          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.09); border-radius: 10px; padding: 0.9rem; margin-bottom: 1.1rem; font-size: 0.82rem; color: #e2e8f0;">
            <div style="font-weight: 800; color: white; margin-bottom: 6px;"><i class="fas fa-layer-group" style="color:#f472b6;"></i> Tabella di Marcia Sviluppo BitBonk:</div>
            <div style="margin-bottom: 4px;">• <strong>Step 1 (In preparazione):</strong> Apertura bustine digitali e collezione Album su IndiePlay-X.</div>
            <div style="margin-bottom: 4px;">• <strong>Step 2:</strong> Mercatino scambi rapido 1-Click e classifiche collezionisti.</div>
            <div>• <strong>Step 3:</strong> Stampa fisica limitata Series 01 nel reparto Merchandising.</div>
          </div>

          <div style="background: rgba(236, 72, 153, 0.08); border: 1px solid rgba(236, 72, 153, 0.3); border-radius: 10px; padding: 0.95rem;">
            <label style="font-size: 0.76rem; font-weight: 800; color: #f472b6; display: block; margin-bottom: 6px;">
              RICEVI UN PACCHETTO OMAGGIO AL LANCIO DI BITBONK:
            </label>
            <div style="display: flex; gap: 8px;">
              <input type="email" id="bb-waitlist-email" placeholder="La tua email..." value="${escapeHTML(wl.email || '')}" style="flex: 1; padding: 9px 11px; background: #090d16; border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; color: white; font-size: 0.85rem;">
              <button type="button" id="bb-waitlist-submit" class="btn btn-prime" style="background: #ec4899; border: none; padding: 0 14px; font-weight: 800; font-size: 0.82rem;">
                ${wl.bitbonk ? '✓ Registrato' : 'Prenota'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    body.querySelectorAll('.bb-switch-tab').forEach(btn => {
      btn.onclick = () => {
        activeTab = btn.getAttribute('data-tab');
        render();
      };
    });

    const sub = document.getElementById('bb-waitlist-submit');
    if (sub) {
      sub.onclick = () => {
        const em = document.getElementById('bb-waitlist-email')?.value.trim() || '';
        saveWaitlistFlag('bitbonk', em);
        renderBitBonkSection();
        render();
        if (window.showToast) window.showToast('🃏 Prenotazione registrata per il lancio di BITBONK Series 01!', 'success');
      };
    }
  };

  render();
  modal.style.display = 'flex';
}

export function openMemeConsoleModal(initialView = 'front') {
  injectSpecialProjectsModals();
  const modal = document.getElementById('meme-console-lab-modal');
  const body = document.getElementById('meme-console-lab-body');
  const assetHelper = window.getAssetUrl || ((p) => p);
  let activeView = initialView;

  const views = {
    front: {
      img: '/images/meme_console_front.jpg',
      title: 'Vista Superiore & Frontale — Anello LED Viola & Tasto Pixel-Smile',
      desc: 'Scocca monoblocco bianca satinata con angoli arrotondati, logo frontale inciso MEME CONSOLE, tasto capacitivo retroilluminato con icona Pixel-Smile e barra perimetrale LED RGB/Viola.'
    },
    exploded: {
      img: '/images/meme_console_exploded.jpg',
      title: 'Esploso Ingegneristico & Dotazione Porte I/O Posteriori',
      desc: 'Architettura modulare ispezionabile: scheda logica custom fissata su 4 torrette anti-vibrazione, griglie di dissipazione laterali, doppia uscita HDMI, doppia porta USB 3.0 High-Speed, porta Gigabit Ethernet e ingresso alimentazione DC.'
    },
    bottom: {
      img: '/images/meme_console_bottom.jpg',
      title: 'Scocca Inferiore Antiscivolo & Targhetta Specifiche Model MC-01',
      desc: 'Base in polimero dark-matte con 4 piedini smorzanti in gomma ad alta aderenza, matrice di ventilazione a 144 micro-fori e targhetta tecnica ufficiale: Model MC-01 • Input 19V ⎓ 3.42A • Certificazioni CE, FC, RoHS.'
    },
    pov: {
      img: '/images/meme_console_pov.jpg',
      title: 'Tavola Comparativa Completa (Vista Superiore + Vista Inferiore)',
      desc: 'Confronto diretto tra il profilo superiore bianco con LED viola acceso e la base inferiore ventilata del prototipo MC-01.'
    }
  };

  const render = () => {
    const wl = getWaitlists();
    const cur = views[activeView] || views.front;

    body.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.8rem; flex-wrap: wrap;">
        <span style="background: rgba(168, 85, 247, 0.25); border: 1px solid #a855f7; color: #e9d5ff; padding: 4px 10px; border-radius: 6px; font-size: 0.74rem; font-weight: 900;">
          HARDWARE R&D • MODEL MC-01
        </span>
        <h3 style="margin: 0; font-size: 1.3rem; font-weight: 900;">MEME CONSOLE™ — Laboratorio Progettazione & Specifiche</h3>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 1.5rem; align-items: center;">
        <div>
          <div style="background: #080c14; border: 1px solid rgba(168, 85, 247, 0.45); border-radius: 14px; overflow: hidden; margin-bottom: 10px;">
            <img src="${safeUrl(assetHelper(cur.img))}" alt="${escapeHTML(cur.title)}" style="width: 100%; max-height: 340px; object-fit: contain; display: block; background: #e5e7eb;">
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
            <button type="button" class="mc-view-tab btn ${activeView === 'front' ? 'btn-prime' : 'btn-prime-outline'}" data-view="front" style="padding: 6px; font-size: 0.74rem; font-weight: 800; justify-content: center;">Fronte 3D</button>
            <button type="button" class="mc-view-tab btn ${activeView === 'exploded' ? 'btn-prime' : 'btn-prime-outline'}" data-view="exploded" style="padding: 6px; font-size: 0.74rem; font-weight: 800; justify-content: center;">Esploso CAD</button>
            <button type="button" class="mc-view-tab btn ${activeView === 'bottom' ? 'btn-prime' : 'btn-prime-outline'}" data-view="bottom" style="padding: 6px; font-size: 0.74rem; font-weight: 800; justify-content: center;">Base MC-01</button>
            <button type="button" class="mc-view-tab btn ${activeView === 'pov' ? 'btn-prime' : 'btn-prime-outline'}" data-view="pov" style="padding: 6px; font-size: 0.74rem; font-weight: 800; justify-content: center;">Dual POV</button>
          </div>
        </div>

        <div>
          <h4 style="font-size: 1.2rem; font-weight: 900; color: #c084fc; margin: 0 0 0.55rem;">
            ${escapeHTML(cur.title)}
          </h4>
          <p style="font-size: 0.88rem; color: #cbd5e1; line-height: 1.6; margin: 0 0 1rem;">
            ${escapeHTML(cur.desc)}
          </p>

          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 0.85rem; margin-bottom: 1rem; font-size: 0.8rem;">
            <div style="font-weight: 800; color: white; margin-bottom: 6px;"><i class="fas fa-sliders-h" style="color:#c084fc;"></i> Specifiche Tecniche Preliminari (Model MC-01):</div>
            <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05);"><span style="color:#94a3b8;">Modello Hardware:</span><strong>MC-01 (Meme Console Rev.1)</strong></div>
            <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05);"><span style="color:#94a3b8;">Alimentazione:</span><strong>19V ⎓ 3.42A (65W High-Efficiency)</strong></div>
            <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05);"><span style="color:#94a3b8;">Connettività Video & Dati:</span><strong>2× HDMI • 2× USB 3.0 • RJ45 LAN</strong></div>
            <div style="display: flex; justify-content: space-between; padding: 3px 0;"><span style="color:#94a3b8;">Sistema Operativo:</span><strong>IndiePlay-X OS (Cloud + Local ZIP)</strong></div>
          </div>

          <div style="background: rgba(168, 85, 247, 0.09); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 10px; padding: 0.9rem;">
            <label style="font-size: 0.75rem; font-weight: 800; color: #d8b4fe; display: block; margin-bottom: 6px;">
               ENTRA NELLA LISTA INSIDER HARDWARE (SVILUPPO FASE 2):
            </label>
            <div style="display: flex; gap: 8px;">
              <input type="email" id="mc-waitlist-email" placeholder="La tua email per i devlog hardware..." value="${escapeHTML(wl.email || '')}" style="flex: 1; padding: 9px 11px; background: #090d16; border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; color: white; font-size: 0.85rem;">
              <button type="button" id="mc-waitlist-submit" class="btn btn-prime" style="background: #9333ea; border: none; padding: 0 14px; font-weight: 800; font-size: 0.82rem;">
                ${wl.memeConsole ? '✓ Iscritto' : 'Segui'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    body.querySelectorAll('.mc-view-tab').forEach(btn => {
      btn.onclick = () => {
        activeView = btn.getAttribute('data-view');
        render();
      };
    });

    const sub = document.getElementById('mc-waitlist-submit');
    if (sub) {
      sub.onclick = () => {
        const em = document.getElementById('mc-waitlist-email')?.value.trim() || '';
        saveWaitlistFlag('memeConsole', em);
        renderMemeConsoleSection();
        render();
        if (window.showToast) window.showToast('🚀 Iscrizione confermata ai Devlog Hardware di MEME CONSOLE!', 'success');
      };
    }
  };

  render();
  modal.style.display = 'flex';
}

// ============================================================================
// 5. GESTIONE DINAMICA "ULTIME NOVITÀ" + PAGINA RISERVATA /BITMEME
// ============================================================================
const STORAGE_KEY_BACKEND_UNLOCKED = 'indieplay_backend_unlocked_v1';
const STORAGE_KEY_PORTAL_NEWS = 'indieplay_portal_news_v1';

const DEFAULT_PORTAL_NEWS = [
  {
    id: 'news-1',
    title: 'Rilascio Feature: Le Vetrine Sviluppatore!',
    desc: 'Ora i venditori possono personalizzare la propria pagina social con descrizione, prodotti e accessori di merchandising ufficiale.',
    date: 'Novembre 2026',
    badge: 'NUOVA FEATURE',
    img: '/images/merch_hoodie_samurai_1777198641485.png'
  },
  {
    id: 'news-2',
    title: 'Accordo Strategico con NeonLabs',
    desc: 'NeonLabs pubblicherà in esclusiva temporale i suoi prossimi titoli arcade e picchiaduro retrò su IndiePlay-X.',
    date: 'Novembre 2026',
    badge: 'PARTNERSHIP',
    img: '/images/neon_samurai_screenshot_1_1777200476248.png'
  },
  {
    id: 'news-3',
    title: 'Sicurezza dei Pagamenti e Acquisto 1-Click',
    desc: 'Abbiamo integrato il nuovo sistema di acquisto istantaneo 1-Click e nuovi protocolli di cifratura per proteggere le transazioni.',
    date: 'Novembre 2026',
    badge: 'SICUREZZA',
    img: '/images/merch_tshirt_samurai_1777201074364.png'
  }
];

export function getPortalNews() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PORTAL_NEWS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return [...DEFAULT_PORTAL_NEWS];
}

export async function savePortalNews(newsList) {
  const clean = Array.isArray(newsList) ? newsList : [];
  try {
    localStorage.setItem(STORAGE_KEY_PORTAL_NEWS, JSON.stringify(clean));
  } catch (e) {}
  try {
    await setDoc(doc(db, 'settings', 'portal_news'), {
      items: clean,
      updatedAt: new Date().toISOString()
    });
  } catch (e) {}
  window.dispatchEvent(new CustomEvent('indieplay:portalnewschange', { detail: clean }));
  return clean;
}

export async function syncPortalNewsFromCloud() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'portal_news'));
    if (snap.exists() && Array.isArray(snap.data().items) && snap.data().items.length > 0) {
      localStorage.setItem(STORAGE_KEY_PORTAL_NEWS, JSON.stringify(snap.data().items));
      window.dispatchEvent(new CustomEvent('indieplay:portalnewschange', { detail: snap.data().items }));
      return snap.data().items;
    }
  } catch (e) {}
  return getPortalNews();
}

let editingNewsId = null;
let pendingNewsImgDataUrl = '';

function injectPortalNewsModals() {
  if (document.getElementById('portal-news-cms-modal')) return;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <!-- Modal Lettura Notizia ("Ultime novità") -->
    <div id="portal-news-reader-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3820;">
      <div class="modal-content glass" style="background: rgba(14, 21, 31, 0.99); border: 1px solid rgba(0, 168, 225, 0.45); border-radius: 16px; padding: 1.8rem; max-width: 620px; width: 93%; max-height: 90vh; overflow-y: auto; color: white; position: relative; box-shadow: 0 25px 60px rgba(0,0,0,0.9);">
        <span class="close-lightbox" id="close-portal-news-reader" style="position: absolute; top: 0.7rem; right: 1.1rem; font-size: 2.2rem; cursor: pointer; color: var(--text-gray);">&times;</span>
        <div id="portal-news-reader-body"></div>
      </div>
    </div>

    <!-- Modal CMS Creazione / Modifica "Ultime novità" -->
    <div id="portal-news-cms-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3860;">
      <div class="modal-content glass" style="background: rgba(14, 21, 31, 0.99); border: 1px solid rgba(56, 189, 248, 0.5); border-radius: 16px; padding: 1.8rem; max-width: 580px; width: 94%; max-height: 92vh; overflow-y: auto; color: white; position: relative; box-shadow: 0 25px 65px rgba(0,0,0,0.92);">
        <span class="close-lightbox" id="close-portal-news-cms" style="position: absolute; top: 0.7rem; right: 1.1rem; font-size: 2.2rem; cursor: pointer; color: var(--text-gray);">&times;</span>
        <h3 id="portal-news-cms-heading" style="margin: 0 0 1rem; font-size: 1.3rem; font-weight: 900; color: white;">
          <i class="fas fa-bullhorn" style="color: #38bdf8;"></i> Pubblica in "Ultime novità"
        </h3>
        <form id="portal-news-cms-form" style="display: flex; flex-direction: column; gap: 0.85rem;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem;">
            <div>
              <label style="font-size: 0.76rem; color: var(--text-gray); font-weight: 700;">Badge / Etichetta</label>
              <input type="text" id="cms-news-badge" required placeholder="Es. NUOVA FEATURE, EVENTO" value="NOVITÀ" style="width: 100%; padding: 9px; background: #0f1722; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: white;">
            </div>
            <div>
              <label style="font-size: 0.76rem; color: var(--text-gray); font-weight: 700;">Data</label>
              <input type="text" id="cms-news-date" required placeholder="Es. 18 Novembre 2026" style="width: 100%; padding: 9px; background: #0f1722; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: white;">
            </div>
          </div>
          <div>
            <label style="font-size: 0.76rem; color: var(--text-gray); font-weight: 700;">Titolo della Notizia</label>
            <input type="text" id="cms-news-title" required placeholder="Inserisci il titolo dell'annuncio..." style="width: 100%; padding: 10px; background: #0f1722; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: white; font-weight: 700;">
          </div>
          <div style="background: rgba(255,255,255,0.03); border: 1px dashed rgba(56, 189, 248, 0.45); border-radius: 10px; padding: 0.85rem;">
            <label style="font-size: 0.78rem; color: white; font-weight: 800; display: block; margin-bottom: 6px;">
              <i class="fas fa-camera" style="color: #38bdf8;"></i> Foto della Notizia (Dal PC o URL)
            </label>
            <label for="cms-news-file" class="btn btn-prime-outline" style="display: inline-flex; padding: 6px 12px; font-size: 0.78rem; cursor: pointer; margin-bottom: 6px;">
              <i class="fas fa-upload"></i> Carica Foto dal PC
            </label>
            <input type="file" id="cms-news-file" accept="image/*" hidden>
            <span id="cms-news-file-status" style="font-size: 0.75rem; color: var(--text-gray); margin-left: 8px;">Oppure indica URL qui sotto</span>
            <input type="text" id="cms-news-img" placeholder="/images/merch_hoodie_samurai_1777198641485.png" style="width: 100%; padding: 8px; background: #0f1722; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white; font-size: 0.82rem;">
          </div>
          <div>
            <label style="font-size: 0.76rem; color: var(--text-gray); font-weight: 700;">Testo / Descrizione della Notizia</label>
            <textarea id="cms-news-desc" rows="4" required placeholder="Scrivi il contenuto della notizia..." style="width: 100%; padding: 10px; background: #0f1722; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: white;"></textarea>
          </div>
          <button type="submit" class="btn btn-prime" style="padding: 0.9rem; font-weight: 900; justify-content: center;">
            <i class="fas fa-paper-plane"></i> Salva e Pubblica in "Ultime novità"
          </button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  const readerModal = document.getElementById('portal-news-reader-modal');
  const cmsModal = document.getElementById('portal-news-cms-modal');
  document.getElementById('close-portal-news-reader').onclick = () => (readerModal.style.display = 'none');
  document.getElementById('close-portal-news-cms').onclick = () => (cmsModal.style.display = 'none');
  readerModal.onclick = (e) => { if (e.target === readerModal) readerModal.style.display = 'none'; };
  cmsModal.onclick = (e) => { if (e.target === cmsModal) cmsModal.style.display = 'none'; };

  const fileInp = document.getElementById('cms-news-file');
  const statusEl = document.getElementById('cms-news-file-status');
  if (fileInp) {
    fileInp.onchange = async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      statusEl.textContent = 'Compressione foto...';
      try {
        pendingNewsImgDataUrl = await compressImageToDataUrl(f, 900, 0.82);
        statusEl.innerHTML = `<span style="color:#34d399; font-weight:700;">✓ Foto pronta: ${escapeHTML(f.name)}</span>`;
      } catch (err) {
        statusEl.textContent = 'Errore caricamento foto';
      }
    };
  }

  document.getElementById('portal-news-cms-form').onsubmit = async (e) => {
    e.preventDefault();
    const list = getPortalNews();
    const imgVal = pendingNewsImgDataUrl || document.getElementById('cms-news-img').value.trim() || '/images/merch_hoodie_samurai_1777198641485.png';
    const payload = {
      id: editingNewsId || ('news-' + Date.now()),
      badge: document.getElementById('cms-news-badge').value.trim().toUpperCase() || 'NOVITÀ',
      date: document.getElementById('cms-news-date').value.trim() || new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }),
      title: document.getElementById('cms-news-title').value.trim(),
      desc: document.getElementById('cms-news-desc').value.trim(),
      img: imgVal
    };
    const next = editingNewsId
      ? list.map(n => (n.id === editingNewsId ? payload : n))
      : [payload, ...list];
    await savePortalNews(next);
    editingNewsId = null;
    pendingNewsImgDataUrl = '';
    cmsModal.style.display = 'none';
    if (window.showToast) window.showToast('Notizia pubblicata in "Ultime novità"!', 'success');
  };
}

export function openPortalNewsCmsModal(newsToEdit = null) {
  injectPortalNewsModals();
  editingNewsId = newsToEdit ? newsToEdit.id : null;
  pendingNewsImgDataUrl = newsToEdit && String(newsToEdit.img || '').startsWith('data:') ? newsToEdit.img : '';

  const heading = document.getElementById('portal-news-cms-heading');
  if (heading) {
    heading.innerHTML = newsToEdit
      ? '<i class="fas fa-edit" style="color: #fbbf24;"></i> Modifica Notizia ("Ultime novità")'
      : '<i class="fas fa-bullhorn" style="color: #38bdf8;"></i> Pubblica Nuova Notizia ("Ultime novità")';
  }
  document.getElementById('cms-news-badge').value = newsToEdit ? (newsToEdit.badge || 'NOVITÀ') : 'NUOVA FEATURE';
  document.getElementById('cms-news-date').value = newsToEdit ? (newsToEdit.date || '') : new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('cms-news-title').value = newsToEdit ? (newsToEdit.title || '') : '';
  document.getElementById('cms-news-desc').value = newsToEdit ? (newsToEdit.desc || '') : '';
  document.getElementById('cms-news-img').value = newsToEdit && !String(newsToEdit.img || '').startsWith('data:') ? (newsToEdit.img || '') : '/images/merch_hoodie_samurai_1777198641485.png';
  const statusEl = document.getElementById('cms-news-file-status');
  if (statusEl) statusEl.textContent = newsToEdit ? 'Immagine attuale mantenuta (o caricane una nuova)' : 'Oppure indica URL qui sotto';

  document.getElementById('portal-news-cms-modal').style.display = 'flex';
}

export function openPortalNewsReaderModal(newsItem) {
  if (!newsItem) return;
  injectPortalNewsModals();
  const modal = document.getElementById('portal-news-reader-modal');
  const body = document.getElementById('portal-news-reader-body');
  const assetHelper = window.getAssetUrl || ((p) => p);

  body.innerHTML = `
    <div style="height: 225px; background: url('${safeUrl(assetHelper(newsItem.img))}') no-repeat center center; background-size: cover; border-radius: 10px; margin-bottom: 1.2rem; position: relative;">
      <span style="position: absolute; top: 12px; left: 12px; background: var(--prime-blue); color: white; padding: 4px 12px; border-radius: 4px; font-size: 0.75rem; font-weight: 800;">${escapeHTML(newsItem.badge || 'NOVITÀ')}</span>
    </div>
    <div style="font-size: 0.82rem; color: #38bdf8; font-weight: 700; margin-bottom: 6px;">
      <i class="far fa-calendar-alt"></i> ${escapeHTML(newsItem.date || '')}
    </div>
    <h2 style="font-size: 1.45rem; font-weight: 900; color: white; margin: 0 0 1rem; line-height: 1.3;">
      ${escapeHTML(newsItem.title)}
    </h2>
    <p style="font-size: 0.96rem; color: #e2e8f0; line-height: 1.7; margin: 0; white-space: pre-line;">
      ${escapeHTML(newsItem.desc)}
    </p>
  `;
  modal.style.display = 'flex';
}

export async function initBitmemeAdminHub() {
  const root = document.getElementById('bitmeme-hub-root');
  if (!root) return;

  injectMagazineModals();
  injectBackendModals();
  injectPortalNewsModals();
  await Promise.all([syncPaymentConfigFromCloud(), syncMagazineFromCloud(), syncPortalNewsFromCloud()]);

  const renderHub = () => {
    const isMagUnlocked = sessionStorage.getItem(STORAGE_KEY_MAGAZINE_UNLOCKED) === 'true';
    const isBeUnlocked = sessionStorage.getItem(STORAGE_KEY_BACKEND_UNLOCKED) === 'true';
    const articles = getMagazineArticles();
    const portalNews = getPortalNews();
    const cfg = getPaymentConfig();
    const isDown = Boolean(cfg.maintenanceMode);

    root.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 2rem; align-items: start;">
        <!-- CARD 1: REDAZIONE INDIEPLAY MAGAZINE & ULTIME NOVITÀ -->
        <div style="background: rgba(15, 23, 34, 0.96); border: 1px solid ${isMagUnlocked ? 'rgba(16, 185, 129, 0.5)' : 'rgba(0, 168, 225, 0.45)'}; border-radius: 18px; padding: 2rem; box-shadow: 0 20px 50px rgba(0,0,0,0.65);">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 1.3rem; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(0, 168, 225, 0.15); border: 1px solid var(--prime-blue); display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-newspaper" style="color: var(--prime-blue); font-size: 1.35rem;"></i>
              </div>
              <div>
                <span style="font-size: 0.72rem; font-weight: 900; color: var(--prime-blue); letter-spacing: 0.8px;">ACCESSO 1 • CMS EDITORIALE & NEWS</span>
                <h2 style="margin: 2px 0 0; font-size: 1.3rem; font-weight: 900; color: white;">Magazine & Ultime Novità</h2>
              </div>
            </div>
            <span style="padding: 4px 10px; border-radius: 999px; font-size: 0.72rem; font-weight: 800; background: ${isMagUnlocked ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.06)'}; color: ${isMagUnlocked ? '#34d399' : '#94a3b8'};">
              ${isMagUnlocked ? '● SBLOCCATO' : '🔒 PROTETTO'}
            </span>
          </div>

          ${!isMagUnlocked ? `
            <p style="font-size: 0.88rem; color: var(--text-gray); line-height: 1.55; margin: 0 0 1.2rem;">
              Inserisci la password Redazione per gestire sia gli articoli completi di <strong>IndiePlay Magazine</strong> sia gli annunci rapidi della sezione <strong>"Ultime novità"</strong> in Homepage.
            </p>
            <form id="bm-mag-login-form" style="display: flex; flex-direction: column; gap: 0.9rem;">
              <div>
                <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 800; display: block; margin-bottom: 6px;">PASSWORD REDAZIONE MAGAZINE & NEWS</label>
                <input type="password" id="bm-mag-pwd" required placeholder="Inserisci password Redazione..." style="width: 100%; padding: 12px; background: #090e16; border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; color: white; font-size: 0.98rem;">
              </div>
              <button type="submit" class="btn btn-prime" style="width: 100%; padding: 0.95rem; font-weight: 900; justify-content: center; font-size: 0.95rem;">
                <i class="fas fa-unlock-alt"></i> Entra in Redazione & News
              </button>
            </form>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              <!-- Gestione IndiePlay Magazine -->
              <div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 0.7rem;">
                  <button type="button" id="bm-open-new-art-btn" class="btn btn-prime" style="flex: 1; padding: 0.8rem 0.9rem; font-weight: 900; font-size: 0.84rem; justify-content: center;">
                    <i class="fas fa-plus-circle"></i> + Nuovo Articolo Magazine
                  </button>
                  <button type="button" id="bm-open-issue-viewer-btn" class="btn btn-prime-outline" style="padding: 0.8rem 0.9rem; font-weight: 800; font-size: 0.82rem;">
                    <i class="fas fa-book-open"></i> Rivista
                  </button>
                  <button type="button" id="bm-lock-mag-btn" class="btn btn-prime-outline" title="Chiudi sessione Redazione" style="padding: 0.8rem 0.85rem; border-color: rgba(239,68,68,0.4); color: #f87171;">
                    <i class="fas fa-sign-out-alt"></i>
                  </button>
                </div>

                <div style="font-size: 0.76rem; font-weight: 800; color: #38bdf8; margin-bottom: 0.5rem; text-transform: uppercase;">
                  <i class="fas fa-book"></i> Articoli IndiePlay Magazine (${articles.length})
                </div>
                <div style="display: flex; flex-direction: column; gap: 0.45rem; max-height: 195px; overflow-y: auto;">
                  ${articles.map(art => `
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 9px; padding: 0.55rem 0.8rem; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                      <div style="min-width: 0;">
                        <div style="font-size: 0.68rem; color: var(--prime-blue); font-weight: 800;">${escapeHTML(art.category || 'EDITORIALE')} • ${escapeHTML(art.issue || '')}</div>
                        <div style="font-size: 0.84rem; font-weight: 800; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(art.title)}</div>
                      </div>
                      <div style="display: flex; gap: 5px; flex-shrink: 0;">
                        <button type="button" class="bm-edit-art-btn btn btn-prime-outline" data-id="${escapeHTML(art.id)}" style="padding: 4px 8px; font-size: 0.72rem; border-color: #fbbf24; color: #fbbf24;"><i class="fas fa-edit"></i></button>
                        <button type="button" class="bm-del-art-btn btn btn-prime-outline" data-id="${escapeHTML(art.id)}" style="padding: 4px 8px; font-size: 0.72rem; border-color: #ef4444; color: #f87171;"><i class="fas fa-trash"></i></button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Gestione Sezione "Ultime novità" (Homepage) -->
              <div style="border-top: 1px solid rgba(255,255,255,0.12); padding-top: 0.95rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 0.6rem; flex-wrap: wrap;">
                  <div style="font-size: 0.76rem; font-weight: 800; color: #34d399; text-transform: uppercase;">
                    <i class="fas fa-bullhorn"></i> Sezione "Ultime novità" (${portalNews.length})
                  </div>
                  <button type="button" id="bm-open-new-news-btn" class="btn btn-prime" style="padding: 5px 11px; font-size: 0.76rem; font-weight: 800; background: #10b981; border: none;">
                    <i class="fas fa-plus"></i> + Aggiungi Notizia
                  </button>
                </div>
                <div style="display: flex; flex-direction: column; gap: 0.45rem; max-height: 205px; overflow-y: auto;">
                  ${portalNews.map(n => `
                    <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 9px; padding: 0.55rem 0.8rem; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                      <div style="min-width: 0;">
                        <div style="font-size: 0.68rem; color: #34d399; font-weight: 800;">${escapeHTML(n.badge || 'NOVITÀ')} • ${escapeHTML(n.date || '')}</div>
                        <div style="font-size: 0.84rem; font-weight: 800; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(n.title)}</div>
                      </div>
                      <div style="display: flex; gap: 5px; flex-shrink: 0;">
                        <button type="button" class="bm-edit-news-btn btn btn-prime-outline" data-id="${escapeHTML(n.id)}" style="padding: 4px 8px; font-size: 0.72rem; border-color: #fbbf24; color: #fbbf24;"><i class="fas fa-edit"></i></button>
                        <button type="button" class="bm-del-news-btn btn btn-prime-outline" data-id="${escapeHTML(n.id)}" style="padding: 4px 8px; font-size: 0.72rem; border-color: #ef4444; color: #f87171;"><i class="fas fa-trash"></i></button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          `}
        </div>

        <!-- CARD 2: CONSOLE AMMINISTRATORE BACKEND & INTERRUTTORE SITO DOWN -->
        <div style="background: rgba(15, 23, 34, 0.96); border: 1px solid ${isBeUnlocked ? 'rgba(16, 185, 129, 0.5)' : 'rgba(245, 158, 11, 0.45)'}; border-radius: 18px; padding: 2rem; box-shadow: 0 20px 50px rgba(0,0,0,0.65);">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 1.3rem; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(245, 158, 11, 0.15); border: 1px solid #f59e0b; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-server" style="color: #fbbf24; font-size: 1.35rem;"></i>
              </div>
              <div>
                <span style="font-size: 0.72rem; font-weight: 900; color: #fbbf24; letter-spacing: 0.8px;">ACCESSO 2 • CONTROLLO SISTEMA</span>
                <h2 style="margin: 2px 0 0; font-size: 1.3rem; font-weight: 900; color: white;">Backend & Stato Sito</h2>
              </div>
            </div>
            <span style="padding: 4px 10px; border-radius: 999px; font-size: 0.72rem; font-weight: 800; background: ${isBeUnlocked ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.06)'}; color: ${isBeUnlocked ? '#34d399' : '#94a3b8'};">
              ${isBeUnlocked ? '● SBLOCCATO' : '🔒 PROTETTO'}
            </span>
          </div>

          ${!isBeUnlocked ? `
            <p style="font-size: 0.88rem; color: var(--text-gray); line-height: 1.55; margin: 0 0 1.2rem;">
              Inserisci la password Amministratore Backend per gestire l'interruttore <strong>Sito Offline / Manutenzione</strong>, Transazioni Reali, Split-Payment, visibilità sezioni ed esportare il Backup Cloud.
            </p>
            <form id="bm-be-login-form" style="display: flex; flex-direction: column; gap: 0.9rem;">
              <div>
                <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 800; display: block; margin-bottom: 6px;">PASSWORD AMMINISTRATORE BACKEND</label>
                <input type="password" id="bm-be-pwd" required placeholder="Inserisci password Backend..." style="width: 100%; padding: 12px; background: #090e16; border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; color: white; font-size: 0.98rem;">
              </div>
              <button type="submit" class="btn btn-prime" style="width: 100%; padding: 0.95rem; font-weight: 900; background: #f59e0b; color: #0f172a; border: none; justify-content: center; font-size: 0.95rem;">
                <i class="fas fa-key"></i> Apri Console Amministratore Backend
              </button>
            </form>
          ` : `
            <div style="display: flex; flex-direction: column; gap: 1rem;">
              <!-- BOX INTERRUTTORE SITO DOWN / MANUTENZIONE CON PERSONAGGIO RETRO -->
              <div style="background: ${isDown ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.08)'}; border: 1px solid ${isDown ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.35)'}; border-radius: 12px; padding: 1rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 0.7rem;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="/images/maintenance_retro_hero.png" alt="Maintenance Hero" style="width: 44px; height: 56px; object-fit: contain; border-radius: 6px; background: rgba(0,0,0,0.35); padding: 2px;">
                    <div>
                      <div style="font-size: 0.72rem; font-weight: 900; color: ${isDown ? '#f87171' : '#34d399'}; letter-spacing: 0.5px;">
                        ${isDown ? '🔴 SITO PUBBLICO IN MANUTENZIONE (DOWN)' : '🟢 SITO PUBBLICO ONLINE E RAGGIUNGIBILE'}
                      </div>
                      <div style="font-size: 0.84rem; font-weight: 800; color: white;">Modalità Manutenzione (Schermata in Inglese)</div>
                    </div>
                  </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 0.8rem;">
                  <input type="text" id="bm-maint-title" value="${escapeHTML(cfg.maintenanceTitle || 'WE ARE UPGRADING THE ARCADE!')}" placeholder="Titolo in inglese..." style="width: 100%; padding: 7px 10px; background: #090e16; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white; font-size: 0.8rem; font-weight: 700;">
                  <textarea id="bm-maint-msg" rows="2" placeholder="Messaggio in inglese..." style="width: 100%; padding: 7px 10px; background: #090e16; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #cbd5e1; font-size: 0.78rem;">${escapeHTML(cfg.maintenanceMessage || 'INDIE PLAY X is temporarily offline for scheduled maintenance and system upgrades. Hold tight — our team is tuning the servers and we will be back online shortly!')}</textarea>
                </div>

                <button type="button" id="bm-toggle-maintenance-btn" class="btn" style="width: 100%; padding: 0.85rem; font-weight: 900; font-size: 0.86rem; border-radius: 8px; border: none; cursor: pointer; justify-content: center; display: inline-flex; align-items: center; gap: 8px; background: ${isDown ? '#10b981' : '#ef4444'}; color: white; box-shadow: 0 6px 18px ${isDown ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'};">
                  <i class="fas ${isDown ? 'fa-globe' : 'fa-power-off'}"></i>
                  ${isDown ? 'RIMETTI SUBITO IL SITO ONLINE (DISATTIVA DOWN)' : 'METTI IL SITO IN MANUTENZIONE / DOWN TEMPORANEO'}
                </button>
              </div>

              <!-- Controllo & Accesso Diretto Woxlytics (/woxlytics) -->
              <div style="background: ${cfg.woxlyticsEnabled !== false ? 'rgba(14, 165, 233, 0.12)' : 'rgba(100, 116, 139, 0.12)'}; border: 1px solid ${cfg.woxlyticsEnabled !== false ? 'rgba(56, 189, 248, 0.5)' : 'rgba(148, 163, 184, 0.35)'}; border-radius: 12px; padding: 1rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 0.65rem; flex-wrap: wrap;">
                  <div style="font-size: 0.84rem; font-weight: 900; color: ${cfg.woxlyticsEnabled !== false ? '#38bdf8' : '#94a3b8'};">
                    <i class="fas fa-chart-pie"></i> Woxlytics Analytics Suite (/woxlytics)
                  </div>
                  <span style="padding: 3px 9px; border-radius: 999px; font-size: 0.7rem; font-weight: 900; background: ${cfg.woxlyticsEnabled !== false ? '#0284c7' : '#475569'}; color: white;">
                    ${cfg.woxlyticsEnabled !== false ? 'ATTIVO & PROTETTO' : 'DISATTIVATO'}
                  </span>
                </div>
                <p style="margin: 0 0 0.75rem; font-size: 0.76rem; color: #cbd5e1; line-height: 1.4;">
                  Protetto da autenticazione SHA-256. Cliccando dal link interno qui sotto accedi direttamente senza reinserire la password.
                </p>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <button type="button" id="bm-toggle-woxlytics-btn" class="btn" style="flex: 1; min-width: 170px; padding: 0.7rem 0.9rem; font-weight: 900; font-size: 0.78rem; border-radius: 8px; border: none; cursor: pointer; justify-content: center; display: inline-flex; align-items: center; gap: 7px; background: ${cfg.woxlyticsEnabled !== false ? '#475569' : '#10b981'}; color: white;">
                    <i class="fas ${cfg.woxlyticsEnabled !== false ? 'fa-pause-circle' : 'fa-play-circle'}"></i>
                    ${cfg.woxlyticsEnabled !== false ? 'Disattiva Woxlytics' : 'Attiva Woxlytics'}
                  </button>
                  <a href="/woxlytics" class="btn btn-prime" style="flex: 1; min-width: 170px; padding: 0.7rem 0.9rem; font-weight: 900; font-size: 0.78rem; border-radius: 8px; text-decoration: none; justify-content: center; display: inline-flex; align-items: center; gap: 7px; background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white; border: none;">
                    <i class="fas fa-arrow-up-right-from-square"></i> Apri /woxlytics
                  </a>
                </div>
              </div>

              <div style="display: flex; gap: 8px;">
                <button type="button" id="bm-open-be-console-btn" class="btn btn-prime" style="flex: 1; padding: 0.9rem 1rem; font-weight: 900; background: #f59e0b; color: #0f172a; border: none; justify-content: center; font-size: 0.86rem;">
                  <i class="fas fa-sliders-h"></i> Apri Pannello Completo Backend (10 Voci & Pagamenti)
                </button>
                <button type="button" id="bm-lock-be-btn" class="btn btn-prime-outline" title="Chiudi sessione Backend" style="padding: 0.9rem 0.9rem; border-color: rgba(239,68,68,0.4); color: #f87171;">
                  <i class="fas fa-sign-out-alt"></i>
                </button>
              </div>

              <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 0.85rem; font-size: 0.8rem;">
                <div style="font-weight: 800; color: #fbbf24; margin-bottom: 5px;">Stato Rapido Moduli, PayPal & Database Iscritti:</div>
                <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05);"><span>Modalità Pagamenti:</span><strong style="color:${cfg.realPaymentsEnabled ? '#34d399' : '#fbbf24'};">${cfg.realPaymentsEnabled ? 'TRANSAZIONI REALI LIVE' : 'SIMULAZIONE TEST'}</strong></div>
                <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05);"><span>Split-Payment Sviluppatori:</span><strong style="color:${cfg.splitPaymentEnabled ? '#34d399' : '#94a3b8'};">${cfg.splitPaymentEnabled ? `ATTIVO (${100 - (Number(cfg.platformFeePercent) || 15)}% Dev / ${cfg.platformFeePercent}% Sito)` : `PRONTO (${100 - (Number(cfg.platformFeePercent) || 15)}% Dev / ${cfg.platformFeePercent}% Sito)`}</strong></div>
                <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05);"><span>Contatto PayPal Piattaforma:</span><strong style="color:#38bdf8;">${escapeHTML(cfg.paypalBusinessEmail || 'devindieplay@gmail.com')}</strong></div>
                <div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05);"><span>Report Giornaliero Iscritti (1/giorno):</span><strong style="color:#34d399;">${escapeHTML(ADMIN_NOTIFICATION_EMAIL)} (Oggi: ${getDailySubscribersStats().dailyCount})</strong></div>
                <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 6px;">
                  <button type="button" id="bm-download-subscribers-csv-btn" class="btn btn-prime-outline" style="width: 100%; padding: 0.65rem; font-size: 0.8rem; font-weight: 800; border-color: #34d399; color: #34d399; justify-content: center;">
                    <i class="fas fa-file-csv"></i> Scarica File Database Iscritti (.CSV Excel — ${getSubscribersDatabase().length} Utenti)
                  </button>
                  <button type="button" id="bm-send-daily-digest-now-btn" class="btn btn-prime-outline" style="width: 100%; padding: 0.6rem; font-size: 0.78rem; font-weight: 800; border-color: #38bdf8; color: #38bdf8; justify-content: center;">
                    <i class="fas fa-paper-plane"></i> Invia Ora Riepilogo Giornaliero Iscritti a ${escapeHTML(ADMIN_NOTIFICATION_EMAIL)}
                  </button>
                </div>
              </div>
            </div>
          `}
        </div>
      </div>

      ${(isBeUnlocked || isMagUnlocked) ? renderPrivateAnalyticsDashboardHTML() : ''}
    `;

    // Wire Redazione Magazine & News login form
    const magForm = document.getElementById('bm-mag-login-form');
    if (magForm) {
      magForm.onsubmit = async (e) => {
        e.preventDefault();
        const rl = checkRateLimit('mag_auth', 5, 60000);
        if (!rl.allowed) {
          if (window.showToast) window.showToast(`Troppi tentativi falliti. Riprova tra ${rl.remainingSec}s.`, 'error');
          return;
        }
        const val = document.getElementById('bm-mag-pwd').value;
        const digest = await sha256Hex(val);
        if (digest === MAGAZINE_PASSWORD_HASH) {
          resetRateLimit('mag_auth');
          sessionStorage.setItem(STORAGE_KEY_MAGAZINE_UNLOCKED, 'true');
          renderHub();
          if (window.showToast) window.showToast('Accesso Redazione & Ultime Novità autorizzato!', 'success');
        } else {
          if (window.showToast) window.showToast('Password Redazione errata!', 'error');
        }
      };
    }

    const newArtBtn = document.getElementById('bm-open-new-art-btn');
    if (newArtBtn) newArtBtn.onclick = () => openMagazineCmsModal();

    const viewerBtn = document.getElementById('bm-open-issue-viewer-btn');
    if (viewerBtn) viewerBtn.onclick = () => openMagazineIssueViewer(0);

    const lockMagBtn = document.getElementById('bm-lock-mag-btn');
    if (lockMagBtn) {
      lockMagBtn.onclick = () => {
        sessionStorage.removeItem(STORAGE_KEY_MAGAZINE_UNLOCKED);
        renderHub();
        if (window.showToast) window.showToast('Sessione Redazione chiusa.', 'info');
      };
    }

    root.querySelectorAll('.bm-edit-art-btn').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        const found = getMagazineArticles().find(a => a.id === id);
        if (found) openMagazineCmsModal(found);
      };
    });

    root.querySelectorAll('.bm-del-art-btn').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-id');
        const updated = getMagazineArticles().filter(a => a.id !== id);
        await saveMagazineArticles(updated);
        renderHub();
        if (window.showToast) window.showToast('Articolo rimosso dal Magazine.', 'info');
      };
    });

    // Wire "Ultime novità" buttons
    const newNewsBtn = document.getElementById('bm-open-new-news-btn');
    if (newNewsBtn) newNewsBtn.onclick = () => openPortalNewsCmsModal();

    root.querySelectorAll('.bm-edit-news-btn').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-id');
        const found = getPortalNews().find(n => n.id === id);
        if (found) openPortalNewsCmsModal(found);
      };
    });

    root.querySelectorAll('.bm-del-news-btn').forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-id');
        const updated = getPortalNews().filter(n => n.id !== id);
        await savePortalNews(updated);
        renderHub();
        if (window.showToast) window.showToast('Notizia rimossa da "Ultime novità".', 'info');
      };
    });

    // Wire Backend login form
    const beForm = document.getElementById('bm-be-login-form');
    if (beForm) {
      beForm.onsubmit = async (e) => {
        e.preventDefault();
        const rl = checkRateLimit('backend_auth', 5, 60000);
        if (!rl.allowed) {
          if (window.showToast) window.showToast(`Accesso temporaneamente bloccato. Riprova tra ${rl.remainingSec}s.`, 'error');
          return;
        }
        const pwd = document.getElementById('bm-be-pwd').value;
        const digest = await sha256Hex(pwd);
        if (digest === BACKEND_PASSWORD_HASH) {
          resetRateLimit('backend_auth');
          sessionStorage.setItem(STORAGE_KEY_BACKEND_UNLOCKED, 'true');
          renderHub();
          if (window.showToast) window.showToast('Accesso Console Backend autorizzato!', 'success');
        } else {
          if (window.showToast) window.showToast('Password Backend errata! Accesso negato.', 'error');
        }
      };
    }

    // Wire Maintenance Mode 1-Click Toggle
    const toggleMaintBtn = document.getElementById('bm-toggle-maintenance-btn');
    if (toggleMaintBtn) {
      toggleMaintBtn.onclick = async () => {
        const nextState = !Boolean(getPaymentConfig().maintenanceMode);
        const titleVal = document.getElementById('bm-maint-title')?.value.trim() || 'WE ARE UPGRADING THE ARCADE!';
        const msgVal = document.getElementById('bm-maint-msg')?.value.trim() || 'INDIE PLAY X is temporarily offline for scheduled maintenance and system upgrades. Hold tight — our team is tuning the servers and we will be back online shortly!';
        toggleMaintBtn.disabled = true;
        await savePaymentConfig({
          maintenanceMode: nextState,
          maintenanceTitle: titleVal,
          maintenanceMessage: msgVal
        });
        renderHub();
        if (window.showToast) {
          window.showToast(
            nextState
              ? '🔴 Sito messo in MANUTENZIONE (Offline temporaneo attivo per tutti i visitatori)!'
              : '🟢 Sito rimesso ONLINE e accessibile a tutti!',
            nextState ? 'info' : 'success'
          );
        }
      };
    }

    // Wire Woxlytics 1-Click Toggle
    const toggleWoxBtn = document.getElementById('bm-toggle-woxlytics-btn');
    if (toggleWoxBtn) {
      toggleWoxBtn.onclick = async () => {
        const nextState = getPaymentConfig().woxlyticsEnabled === false;
        toggleWoxBtn.disabled = true;
        await savePaymentConfig({ woxlyticsEnabled: nextState });
        renderHub();
        if (window.showToast) {
          window.showToast(
            nextState
              ? '🟢 Woxlytics ATTIVATO! Tracciamento e dashboard operativi su /woxlytics.'
              : '⏸️ Woxlytics DISATTIVATO! Il tracciamento visite è in pausa.',
            nextState ? 'success' : 'info'
          );
        }
      };
    }

    const openBeBtn = document.getElementById('bm-open-be-console-btn');
    if (openBeBtn) openBeBtn.onclick = () => openBackendConsole();

    const dlSubBtn = document.getElementById('bm-download-subscribers-csv-btn');
    if (dlSubBtn) {
      dlSubBtn.onclick = async () => {
        await syncSubscribersDatabaseFromCloud();
        exportSubscribersDatabaseCSV();
        renderHub();
        if (window.showToast) window.showToast('File Database Iscritti (.CSV) scaricato con successo!', 'success');
      };
    }

    const sendDailyNowBtn = document.getElementById('bm-send-daily-digest-now-btn');
    if (sendDailyNowBtn) {
      sendDailyNowBtn.onclick = async () => {
        sendDailyNowBtn.disabled = true;
        sendDailyNowBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Invio riepilogo giornaliero in corso...';
        await syncSubscribersDatabaseFromCloud();
        const res = await checkAndSendDailySubscribersDigest(true);
        renderHub();
        if (window.showToast) {
          window.showToast(
            `Riepilogo giornaliero (${res.date}: ${res.dailyCount} iscritti oggi, ${res.totalCount} totali) inviato a ${ADMIN_NOTIFICATION_EMAIL}!`,
            'success'
          );
        }
      };
    }

    const refreshAnalyticsBtn = document.getElementById('bm-refresh-analytics-btn');
    if (refreshAnalyticsBtn) {
      refreshAnalyticsBtn.onclick = async () => {
        refreshAnalyticsBtn.disabled = true;
        await syncPrivateAnalyticsFromCloud();
        renderHub();
        if (window.showToast) window.showToast('Dati Analytics Traffico aggiornati dal Cloud!', 'success');
      };
    }

    const exportAnalyticsCsvBtn = document.getElementById('bm-export-analytics-csv-btn');
    if (exportAnalyticsCsvBtn) {
      exportAnalyticsCsvBtn.onclick = () => {
        exportPrivateAnalyticsCSV();
        if (window.showToast) window.showToast('Report Traffico Analytics (.CSV) scaricato!', 'success');
      };
    }

    const lockBeBtn = document.getElementById('bm-lock-be-btn');
    if (lockBeBtn) {
      lockBeBtn.onclick = () => {
        sessionStorage.removeItem(STORAGE_KEY_BACKEND_UNLOCKED);
        const cm = document.getElementById('backend-console-modal');
        if (cm) cm.style.display = 'none';
        renderHub();
        if (window.showToast) window.showToast('Sessione Backend chiusa.', 'info');
      };
    }
  };

  window.addEventListener('indieplay:magazinearticleschange', renderHub);
  window.addEventListener('indieplay:portalnewschange', renderHub);
  window.addEventListener('indieplay:paymentconfigchange', renderHub);
  renderHub();
}

// ============================================================================
// 6. POP-UP DI PRIMO AVVIO: SCARICO DI RESPONSABILITÀ (DISCLAIMER), PRIVACY & COOKIE
// ============================================================================
const STORAGE_KEY_FIRST_VISIT_CONSENT = 'indieplay_legal_consent_v1';

export function initFirstVisitLegalConsentModal() {
  if (typeof window === 'undefined' || !document.body) return;
  if (window.location.pathname.toLowerCase().includes('bitmeme') || document.getElementById('bitmeme-hub-root')) {
    return;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FIRST_VISIT_CONSENT);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.accepted === true) return;
    }
  } catch (e) {}

  if (document.getElementById('ipx-first-visit-consent-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'ipx-first-visit-consent-modal';
  modal.className = 'lightbox';
  modal.style.cssText = 'display: flex; justify-content: center; align-items: center; z-index: 9500; background: rgba(0, 5, 13, 0.92); backdrop-filter: blur(10px);';
  modal.innerHTML = `
    <div class="modal-content glass" style="background: rgba(14, 21, 32, 0.99); border: 1px solid rgba(0, 168, 225, 0.45); border-radius: 18px; padding: 2rem; max-width: 600px; width: 93%; max-height: 92vh; overflow-y: auto; color: white; position: relative; box-shadow: 0 25px 70px rgba(0,0,0,0.95); text-align: left;">
      <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 1.1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.9rem;">
        <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(0, 168, 225, 0.16); border: 1px solid var(--prime-blue); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <i class="fas fa-shield-alt" style="color: var(--prime-blue); font-size: 1.45rem;"></i>
        </div>
        <div>
          <span style="font-size: 0.72rem; font-weight: 900; color: #38bdf8; letter-spacing: 0.8px; text-transform: uppercase;">BENVENUTO SU INDIE PLAY X</span>
          <h2 style="margin: 2px 0 0; font-size: 1.35rem; font-weight: 900; color: white;">Scarico di Responsabilità, Privacy & Cookie</h2>
        </div>
      </div>

      <div style="background: rgba(0,0,0,0.38); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 1rem 1.15rem; margin-bottom: 1.1rem; font-size: 0.85rem; line-height: 1.58; color: #cbd5e1; max-height: 240px; overflow-y: auto;">
        <p style="margin: 0 0 0.7rem;">
          <strong style="color: #fbbf24;"><i class="fas fa-exclamation-triangle"></i> 1. Scarico di Responsabilità (Disclaimer Contenuti & Software):</strong><br>
          <strong>INDIE PLAY X</strong> è un portale e vetrina per sviluppatori indipendenti. I videogiochi, gli archivi scaricabili (<code>.ZIP</code>) e i link esterni pubblicati dagli utenti sono forniti da terze parti <em>"così come sono"</em>. Il download e l'esecuzione del software avvengono sotto l'esclusiva responsabilità dell'utente; la piattaforma declina ogni responsabilità per eventuali bug, incompatibilità o danni hardware/software.
        </p>
        <p style="margin: 0 0 0.7rem;">
          <strong style="color: #34d399;"><i class="fas fa-user-lock"></i> 2. Tutela Privacy & Riservatezza Email (GDPR):</strong><br>
          Nel rispetto del Regolamento UE 2016/679 (GDPR), gli indirizzi email degli utenti iscritti sono strettamente privati e <strong>non vengono mai resi visibili agli altri utenti</strong> sul portale. Chi si iscrive senza Partita IVA può condividere gratuitamente le proprie opere; la vendita a pagamento è riservata ai titolari di Partita IVA.
        </p>
        <p style="margin: 0;">
          <strong style="color: #38bdf8;"><i class="fas fa-cookie-bite"></i> 3. Cookie Tecnici & Funzionali:</strong><br>
          Utilizziamo cookie tecnici e storage locale essenziali per mantenere attiva la sessione di accesso, rilevare automaticamente la lingua del browser, gestire il carrello rapido 1-Click e garantire la sicurezza delle transazioni.
        </p>
      </div>

      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 1rem; font-size: 0.78rem;">
        <a href="javascript:void(0)" id="fv-open-privacy" style="color: #38bdf8; text-decoration: none; font-weight: 700;"><i class="fas fa-file-contract"></i> Leggi Informativa Privacy Completa</a>
        <a href="javascript:void(0)" id="fv-open-cookie" style="color: #34d399; text-decoration: none; font-weight: 700;"><i class="fas fa-cookie"></i> Leggi Informativa Cookie Completa</a>
      </div>

      <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 0.85rem 1rem; margin-bottom: 1.15rem;">
        <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; user-select: none; font-size: 0.84rem; color: white; font-weight: 600; line-height: 1.45;">
          <input type="checkbox" id="fv-consent-checkbox" checked style="width: 19px; height: 19px; margin-top: 2px; accent-color: var(--prime-blue); cursor: pointer; flex-shrink: 0;">
          <span>Dichiaro di aver letto e compreso lo <strong>Scarico di Responsabilità (Disclaimer)</strong>, l'<strong>Informativa Privacy (GDPR)</strong> e l'<strong>Informativa sui Cookie</strong> e accetto integralmente le condizioni d'uso del portale.</span>
        </label>
      </div>

      <button type="button" id="fv-accept-consent-btn" class="btn btn-prime" style="width: 100%; padding: 0.95rem; font-size: 0.98rem; font-weight: 900; border-radius: 10px; justify-content: center; cursor: pointer;">
        <i class="fas fa-check-circle"></i> Accetta Scarico di Responsabilità, Cookie & Entra nel Portale
      </button>
    </div>
  `;
  document.body.appendChild(modal);

  const chk = document.getElementById('fv-consent-checkbox');
  const acceptBtn = document.getElementById('fv-accept-consent-btn');
  if (chk && acceptBtn) {
    chk.onchange = () => {
      acceptBtn.disabled = !chk.checked;
      acceptBtn.style.opacity = chk.checked ? '1' : '0.5';
    };
    acceptBtn.onclick = () => {
      if (!chk.checked) {
        if (window.showToast) window.showToast('Spunta la casella di accettazione per proseguire.', 'error');
        return;
      }
      try {
        localStorage.setItem(STORAGE_KEY_FIRST_VISIT_CONSENT, JSON.stringify({
          accepted: true,
          acceptedAt: new Date().toISOString()
        }));
      } catch (e) {}
      modal.remove();
      if (window.showToast) window.showToast('Preferenze legali, Disclaimer e Cookie salvati.', 'success');
    };
  }

  const openPriv = document.getElementById('fv-open-privacy');
  if (openPriv) {
    openPriv.onclick = () => {
      const pm = document.getElementById('privacy-modal');
      if (pm) {
        pm.style.zIndex = '9600';
        pm.style.display = 'flex';
      }
    };
  }
  const openCook = document.getElementById('fv-open-cookie');
  if (openCook) {
    openCook.onclick = () => {
      const cm = document.getElementById('cookie-modal');
      if (cm) {
        cm.style.zIndex = '9600';
        cm.style.display = 'flex';
      }
    };
  }
}

// ============================================================================
// 7. MOTORE ANALYTICS PRIVATO TRAFFICO SITO (VISIBILE SOLO IN /BITMEME)
// ============================================================================
const STORAGE_KEY_PRIVATE_ANALYTICS = 'indieplay_private_analytics_v1';
const SESSION_KEY_VISITOR_COUNTED = 'indieplay_visitor_session_counted_v1';

function getLast7DateKeys() {
  const keys = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

function getDefaultAnalyticsState() {
  const days = getLast7DateKeys();
  const dailyHistory = {};
  const seedViews = [18, 24, 31, 29, 42, 54, 12];
  const seedUniques = [11, 15, 19, 17, 26, 34, 8];
  days.forEach((day, idx) => {
    dailyHistory[day] = {
      views: seedViews[idx] || 10,
      uniques: seedUniques[idx] || 6
    };
  });

  return {
    totalViews: 210,
    totalUniqueVisitors: 130,
    dailyHistory,
    pages: {
      home: 112,
      game: 58,
      showcase: 26,
      account: 14
    },
    devices: {
      desktop: 124,
      mobile: 86
    },
    languages: {
      it: 118,
      en: 64,
      es: 12,
      fr: 9,
      de: 7
    },
    sources: {
      direct: 115,
      search: 62,
      social: 33
    },
    lastVisitAt: new Date().toISOString()
  };
}

export function getPrivateAnalytics() {
  const def = getDefaultAnalyticsState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRIVATE_ANALYTICS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...def,
        ...parsed,
        dailyHistory: { ...def.dailyHistory, ...(parsed.dailyHistory || {}) },
        pages: { ...def.pages, ...(parsed.pages || {}) },
        devices: { ...def.devices, ...(parsed.devices || {}) },
        languages: { ...def.languages, ...(parsed.languages || {}) },
        sources: { ...def.sources, ...(parsed.sources || {}) }
      };
    }
  } catch (e) {}
  return def;
}

export async function syncPrivateAnalyticsFromCloud() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'private_analytics'));
    if (snap.exists()) {
      const cloud = snap.data();
      const local = getPrivateAnalytics();
      const merged = {
        ...local,
        ...cloud,
        totalViews: Math.max(Number(local.totalViews || 0), Number(cloud.totalViews || 0)),
        totalUniqueVisitors: Math.max(Number(local.totalUniqueVisitors || 0), Number(cloud.totalUniqueVisitors || 0)),
        dailyHistory: { ...local.dailyHistory, ...(cloud.dailyHistory || {}) },
        pages: { ...local.pages, ...(cloud.pages || {}) },
        devices: { ...local.devices, ...(cloud.devices || {}) },
        languages: { ...local.languages, ...(cloud.languages || {}) },
        sources: { ...local.sources, ...(cloud.sources || {}) }
      };
      localStorage.setItem(STORAGE_KEY_PRIVATE_ANALYTICS, JSON.stringify(merged));
      return merged;
    }
  } catch (e) {}
  return getPrivateAnalytics();
}

export function trackPrivatePageView() {
  if (typeof window === 'undefined') return;
  const path = (window.location.pathname || '').toLowerCase();
  // Non conteggiare le aperture delle pagine interne /bitmeme o /woxlytics
  if (path.includes('bitmeme') || path.includes('woxlytics') || document.getElementById('bitmeme-hub-root') || document.getElementById('woxlytics-app-root')) return;

  setTimeout(async () => {
    try {
      const stats = await syncPrivateAnalyticsFromCloud();
      const todayKey = new Date().toISOString().slice(0, 10);
      const isNewSession = !sessionStorage.getItem(SESSION_KEY_VISITOR_COUNTED);
      if (isNewSession) {
        sessionStorage.setItem(SESSION_KEY_VISITOR_COUNTED, 'true');
      }

      stats.totalViews = (Number(stats.totalViews) || 0) + 1;
      if (isNewSession) {
        stats.totalUniqueVisitors = (Number(stats.totalUniqueVisitors) || 0) + 1;
      }

      if (!stats.dailyHistory[todayKey]) {
        stats.dailyHistory[todayKey] = { views: 0, uniques: 0 };
      }
      stats.dailyHistory[todayKey].views += 1;
      if (isNewSession) {
        stats.dailyHistory[todayKey].uniques += 1;
      }

      // Page category
      let pageKey = 'home';
      if (path.includes('game')) pageKey = 'game';
      else if (path.includes('showcase')) pageKey = 'showcase';
      else if (path.includes('account')) pageKey = 'account';
      stats.pages[pageKey] = (Number(stats.pages[pageKey]) || 0) + 1;

      // Device
      const isMobile = window.innerWidth <= 900 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '');
      const devKey = isMobile ? 'mobile' : 'desktop';
      stats.devices[devKey] = (Number(stats.devices[devKey]) || 0) + 1;

      // Language
      const lang = getLanguage() || 'en';
      stats.languages[lang] = (Number(stats.languages[lang]) || 0) + 1;

      // Referrer source
      const ref = (document.referrer || '').toLowerCase();
      let srcKey = 'direct';
      if (ref.includes('google') || ref.includes('bing') || ref.includes('duckduckgo') || ref.includes('yahoo')) {
        srcKey = 'search';
      } else if (ref && !ref.includes(window.location.hostname)) {
        srcKey = 'social';
      }
      stats.sources[srcKey] = (Number(stats.sources[srcKey]) || 0) + 1;
      stats.lastVisitAt = new Date().toISOString();

      localStorage.setItem(STORAGE_KEY_PRIVATE_ANALYTICS, JSON.stringify(stats));
      await setDoc(doc(db, 'settings', 'private_analytics'), stats, { merge: true });
    } catch (e) {}
  }, 900);
}

function renderPrivateAnalyticsDashboardHTML() {
  const stats = getPrivateAnalytics();
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayObj = stats.dailyHistory?.[todayKey] || { views: 1, uniques: 1 };
  const subStats = getDailySubscribersStats(todayKey);
  const days = getLast7DateKeys();
  const maxDayViews = Math.max(10, ...days.map((d) => Number(stats.dailyHistory?.[d]?.views || 0)));

  const totalDev = Math.max(1, (Number(stats.devices?.desktop) || 0) + (Number(stats.devices?.mobile) || 0));
  const desktopPct = Math.round(((Number(stats.devices?.desktop) || 0) / totalDev) * 100);
  const mobilePct = 100 - desktopPct;

  return `
    <div style="margin-top: 2rem; background: rgba(15, 23, 34, 0.96); border: 1px solid rgba(56, 189, 248, 0.45); border-radius: 18px; padding: 2rem; box-shadow: 0 20px 50px rgba(0,0,0,0.65);">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.4rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-chart-line" style="color: #38bdf8; font-size: 1.35rem;"></i>
          </div>
          <div>
            <span style="font-size: 0.72rem; font-weight: 900; color: #38bdf8; letter-spacing: 0.8px;">TELEMETRIA PRIVATA FIRST-PARTY • ZERO COOKIE TERZE PARTI</span>
            <h2 style="margin: 2px 0 0; font-size: 1.35rem; font-weight: 900; color: white;">Analytics Privato Traffico Sito & Iscritti</h2>
          </div>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <a href="/woxlytics" class="btn btn-prime-outline" style="padding: 0.55rem 1rem; font-size: 0.78rem; font-weight: 800; text-decoration: none; border-color: #38bdf8; color: #38bdf8;">
            <i class="fas fa-chart-pie"></i> Apri Woxlytics Completo
          </a>
          <button type="button" id="bm-refresh-analytics-btn" class="btn btn-prime-outline" style="padding: 0.55rem 1rem; font-size: 0.78rem; font-weight: 800;">
            <i class="fas fa-sync-alt"></i> Aggiorna Live
          </button>
          <button type="button" id="bm-export-analytics-csv-btn" class="btn btn-prime" style="padding: 0.55rem 1rem; font-size: 0.78rem; font-weight: 800;">
            <i class="fas fa-download"></i> Esporta Traffico (.CSV)
          </button>
        </div>
      </div>

      <!-- 4 KPI Cards -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 12px; padding: 1rem;">
          <div style="font-size: 0.72rem; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Traffico di Oggi (${todayKey})</div>
          <div style="font-size: 1.75rem; font-weight: 900; color: #38bdf8; margin: 4px 0;">${todayObj.views} <span style="font-size: 0.82rem; font-weight: 700; color: #cbd5e1;">visite</span></div>
          <div style="font-size: 0.76rem; color: #34d399; font-weight: 700;"><i class="fas fa-user-check"></i> ${todayObj.uniques} visitatori unici oggi</div>
        </div>

        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 1rem;">
          <div style="font-size: 0.72rem; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Traffico Totale Storico</div>
          <div style="font-size: 1.75rem; font-weight: 900; color: #34d399; margin: 4px 0;">${stats.totalViews} <span style="font-size: 0.82rem; font-weight: 700; color: #cbd5e1;">visite</span></div>
          <div style="font-size: 0.76rem; color: #94a3b8; font-weight: 700;">${stats.totalUniqueVisitors} visitatori unici complessivi</div>
        </div>

        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 12px; padding: 1rem;">
          <div style="font-size: 0.72rem; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Nuovi Iscritti Oggi</div>
          <div style="font-size: 1.75rem; font-weight: 900; color: #fbbf24; margin: 4px 0;">+${subStats.dailyCount} <span style="font-size: 0.82rem; font-weight: 700; color: #cbd5e1;">oggi</span></div>
          <div style="font-size: 0.76rem; color: #cbd5e1; font-weight: 700;">Totale Database: <strong>${subStats.totalCount} iscritti</strong></div>
        </div>

        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(192, 132, 252, 0.3); border-radius: 12px; padding: 1rem;">
          <div style="font-size: 0.72rem; font-weight: 800; color: #94a3b8; text-transform: uppercase;">Dispositivi Visitatori</div>
          <div style="font-size: 1.45rem; font-weight: 900; color: #c084fc; margin: 6px 0;">${desktopPct}% PC • ${mobilePct}% Mobile</div>
          <div style="font-size: 0.76rem; color: #94a3b8; font-weight: 700;">Desktop: ${stats.devices?.desktop || 0} | Smartphone: ${stats.devices?.mobile || 0}</div>
        </div>
      </div>

      <!-- Grafico Traffico Ultimi 7 Giorni & Dettagli Pagine/Sorgenti -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 1.4rem;">
        <!-- Bar Chart 7 Giorni -->
        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 1.2rem;">
          <div style="font-size: 0.84rem; font-weight: 800; color: white; margin-bottom: 1rem;">
            <i class="fas fa-chart-bar" style="color: #38bdf8;"></i> Andamento Visite — Ultimi 7 Giorni
          </div>
          <div style="display: flex; align-items: flex-end; justify-content: space-between; height: 145px; gap: 8px; padding-top: 15px; border-bottom: 1px solid rgba(255,255,255,0.1);">
            ${days.map((d) => {
              const v = Number(stats.dailyHistory?.[d]?.views || 0);
              const u = Number(stats.dailyHistory?.[d]?.uniques || 0);
              const hPct = Math.max(10, Math.round((v / maxDayViews) * 100));
              const isToday = d === todayKey;
              return `
                <div style="flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end;" title="${d}: ${v} visite (${u} unici)">
                  <span style="font-size: 0.7rem; font-weight: 800; color: ${isToday ? '#fbbf24' : '#cbd5e1'}; margin-bottom: 4px;">${v}</span>
                  <div style="width: 100%; max-width: 34px; height: ${hPct}%; background: ${isToday ? 'linear-gradient(180deg, #f59e0b, #ea580c)' : 'linear-gradient(180deg, #38bdf8, #0284c7)'}; border-radius: 6px 6px 0 0;"></div>
                </div>
              `;
            }).join('')}
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 6px; font-size: 0.68rem; color: #94a3b8; font-weight: 700;">
            ${days.map((d) => `<span style="flex:1; text-align:center;">${d.slice(5)}</span>`).join('')}
          </div>
        </div>

        <!-- Sezioni Piu Visitate & Sorgenti -->
        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 1.2rem; display: flex; flex-direction: column; justify-content: space-between; gap: 1rem;">
          <div>
            <div style="font-size: 0.84rem; font-weight: 800; color: white; margin-bottom: 0.6rem;">
              <i class="fas fa-layer-group" style="color: #34d399;"></i> Pagine Più Visitate del Portale
            </div>
            <div style="display: flex; flex-direction: column; gap: 5px; font-size: 0.8rem;">
              <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);"><span>Homepage & Catalogo Giochi:</span><strong style="color:#38bdf8;">${stats.pages?.home || 0} visite</strong></div>
              <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);"><span>Schede Dettaglio Giochi & Download:</span><strong style="color:#34d399;">${stats.pages?.game || 0} visite</strong></div>
              <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);"><span>Vetrine Social Sviluppatori:</span><strong style="color:#fbbf24;">${stats.pages?.showcase || 0} visite</strong></div>
              <div style="display: flex; justify-content: space-between; padding: 4px 0;"><span>Area Account & Pubblicazione:</span><strong style="color:#c084fc;">${stats.pages?.account || 0} visite</strong></div>
            </div>
          </div>

          <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 0.7rem; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 0.76rem; color: #94a3b8;">
            <span><strong>Diretto:</strong> ${stats.sources?.direct || 0}</span>
            <span><strong>Motori Ricerca (SEO):</strong> ${stats.sources?.search || 0}</span>
            <span><strong>Social / Referral:</strong> ${stats.sources?.social || 0}</span>
            <span><strong>Lingue Top:</strong> IT (${stats.languages?.it || 0}) • EN (${stats.languages?.en || 0})</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function exportPrivateAnalyticsCSV() {
  const stats = getPrivateAnalytics();
  const rows = [
    ['Data', 'Visite_Giornaliere', 'Visitatori_Unici_Giornalieri'],
    ...Object.entries(stats.dailyHistory || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, obj]) => [date, obj.views || 0, obj.uniques || 0])
  ];
  const csv = '\uFEFF' + rows.map((r) => r.join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Analytics_Traffico_IndiePlayX_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}




