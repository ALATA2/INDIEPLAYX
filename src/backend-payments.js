import { db } from './firebase';
import { collection, getDocs, addDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { getLanguage, autoTranslateDOM } from './i18n';

// Passwords richieste dalle specifiche
const MAGAZINE_PASSWORD = 'Numero11!!!';
const BACKEND_PASSWORD = 'Money68030??';

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

  // Parametri economici e chiavi Gateway
  platformFeePercent: 15, // 15% piattaforma, 85% sviluppatore in automatico
  gatewayProvider: 'stripe_connect', // 'stripe_connect' | 'paypal_commerce' | 'sepa_split'
  stripePublishableKey: 'pk_live_indieplayx_configure_me',
  stripeConnectWebhookUrl: 'https://api.indieplayx.com/v1/stripe/split-payout',
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
    coverImg: '/images/merch_neon_samurai_poster.png',
    gallery: ['/images/neon_samurai_screenshot_1_1777200476248.png'],
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
    gallery: [],
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
    coverImg: '/images/merch_tshirt_mockup_1787498735596.png',
    gallery: [],
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
// 1. INDIEPLAY MAGAZINE PUBBLICO + REDAZIONE PROTETTA DA PASSWORD (Numero11!!!)
// ============================================================================
export function isMagazineAdminUnlocked() {
  return sessionStorage.getItem(STORAGE_KEY_MAGAZINE_UNLOCKED) === 'true';
}

export function getMagazineArticles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MAGAZINE_ARTICLES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return DEFAULT_MAGAZINE_ARTICLES;
}

export async function saveMagazineArticles(articles) {
  localStorage.setItem(STORAGE_KEY_MAGAZINE_ARTICLES, JSON.stringify(articles));
  try {
    await setDoc(doc(db, 'platform_config', 'magazine'), {
      articles,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (e) {}
}

export async function syncMagazineFromCloud() {
  try {
    const snap = await getDoc(doc(db, 'platform_config', 'magazine'));
    if (snap.exists() && Array.isArray(snap.data().articles) && snap.data().articles.length > 0) {
      localStorage.setItem(STORAGE_KEY_MAGAZINE_ARTICLES, JSON.stringify(snap.data().articles));
      renderMagazineSection();
    }
  } catch (e) {}
}

export function initMagazineSystem() {
  const magSection = document.getElementById('magazine-section');
  if (!magSection) return;

  injectMagazineModals();
  renderMagazineSection();
  syncMagazineFromCloud();

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

  magSection.style.opacity = '1';
  magSection.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-top: 1rem; margin-bottom: 1.5rem;">
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <h2 style="margin: 0; font-size: 1.6rem; color: white; font-weight: 900;" data-i18n="title_magazine">IndiePlay Magazine</h2>
        <span style="background: rgba(0, 168, 225, 0.2); border: 1px solid var(--prime-blue); color: #38bdf8; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.5px;">
          <i class="fas fa-book-open"></i> EDIZIONE PUBBLICA GRATUITA
        </span>
      </div>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        ${!isEditor ? `
          <button id="open-mag-login-btn" class="btn btn-prime-outline" style="padding: 0.6rem 1.2rem; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; border-color: rgba(0,168,225,0.5);">
            <i class="fas fa-lock" style="color: var(--prime-blue);"></i> <span>Redazione: Carica Articoli & Foto</span>
          </button>
        ` : `
          <button id="open-mag-cms-btn" class="btn btn-prime" style="padding: 0.65rem 1.2rem; font-weight: 800; display: inline-flex; align-items: center; gap: 8px;">
            <i class="fas fa-plus-circle"></i> <span>Carica Nuovo Articolo / Foto</span>
          </button>
          <button id="lock-mag-btn" class="btn btn-prime-outline" style="padding: 0.65rem 1.1rem; font-weight: 700;">
            <i class="fas fa-sign-out-alt"></i> <span>Esci da Redazione</span>
          </button>
        `}
      </div>
    </div>

    <!-- Griglia Pubblica degli Articoli del Magazine (Sempre visibile a tutti gli utenti) -->
    <div class="magazine-articles-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(295px, 1fr)); gap: 1.5rem;">
      ${articles.map((art, idx) => `
        <article class="mag-article-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.25s ease, border-color 0.25s ease;">
          <div>
            <div style="height: 185px; background: url('${assetHelper(art.coverImg)}') no-repeat center center; background-size: cover; position: relative; cursor: pointer;" class="read-mag-article-trigger" data-idx="${idx}">
              <span style="position: absolute; top: 12px; left: 12px; background: var(--prime-blue); color: white; padding: 3px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: 800;">${art.category || 'EDITORIALE'}</span>
              ${Array.isArray(art.gallery) && art.gallery.length > 0 ? `
                <span style="position: absolute; top: 12px; right: 12px; background: rgba(0,0,0,0.75); color: white; padding: 3px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">
                  <i class="fas fa-images"></i> +${art.gallery.length} foto
                </span>
              ` : ''}
              <span style="position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.75); color: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;"><i class="far fa-clock"></i> ${art.readTime || '5 min'}</span>
            </div>
            <div style="padding: 1.3rem;">
              <div style="font-size: 0.78rem; color: var(--prime-blue); font-weight: 700; margin-bottom: 4px;">${art.issue || 'Numero #1'} • ${art.date || '2026'}</div>
              <h3 style="color: white; font-size: 1.12rem; font-weight: 800; line-height: 1.35; margin-bottom: 10px; cursor: pointer;" class="read-mag-article-trigger" data-idx="${idx}">${art.title}</h3>
              <p style="color: var(--text-gray); font-size: 0.88rem; line-height: 1.55; margin-bottom: 1rem;">${art.summary}</p>
            </div>
          </div>
          <div style="padding: 0 1.3rem 1.3rem; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="font-size: 0.78rem; color: var(--text-gray); font-weight: 600;"><i class="fas fa-pen-nib"></i> ${art.author || 'Redazione'}</span>
            <div style="display: flex; gap: 6px;">
              ${isEditor ? `
                <button class="btn btn-prime-outline delete-mag-article-btn" data-idx="${idx}" title="Elimina articolo" style="padding: 0.45rem 0.75rem; font-size: 0.78rem; border-color: #ef4444; color: #f87171;">
                  <i class="fas fa-trash"></i>
                </button>
              ` : ''}
              <button class="btn btn-prime read-mag-article-btn" data-idx="${idx}" style="padding: 0.5rem 1rem; font-size: 0.82rem; font-weight: 700;">
                <i class="fas fa-book-open"></i> <span data-i18n="mag_read_btn">Leggi Articolo</span>
              </button>
            </div>
          </div>
        </article>
      `).join('')}
    </div>
  `;

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

  // Wire Open CMS Modal
  const openCmsBtn = document.getElementById('open-mag-cms-btn');
  if (openCmsBtn) {
    openCmsBtn.onclick = () => openMagazineCmsModal();
  }

  // Wire Read Article triggers (public for everyone)
  magSection.querySelectorAll('.read-mag-article-btn, .read-mag-article-trigger').forEach(el => {
    el.onclick = () => {
      const idx = parseInt(el.getAttribute('data-idx'), 10);
      openMagazineReaderModal(articles[idx]);
    };
  });

  // Wire Delete Article buttons (only visible in Editorial mode)
  magSection.querySelectorAll('.delete-mag-article-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      const updated = articles.filter((_, i) => i !== idx);
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
    <!-- Modal Login Password Redazione Magazine (Numero11!!!) -->
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

    <!-- Modal CMS Redazione Magazine (Caricamento Articoli + Upload Foto) -->
    <div id="magazine-cms-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3100;">
      <div class="modal-content glass" style="background: rgba(18, 26, 36, 0.99); border: 1px solid rgba(0, 168, 225, 0.45); border-radius: 16px; padding: 2rem; max-width: 700px; width: 94%; max-height: 90vh; overflow-y: auto; color: white; position: relative;">
        <span class="close-lightbox" id="close-mag-cms" style="position: absolute; top: 0.8rem; right: 1.2rem; font-size: 2.2rem; cursor: pointer; color: var(--text-gray);">&times;</span>
        <h3 style="font-size: 1.35rem; font-weight: 800; margin-bottom: 0.3rem;"><i class="fas fa-feather-alt" style="color: var(--prime-blue);"></i> Carica Nuovo Articolo & Foto nel Magazine</h3>
        <p style="font-size: 0.84rem; color: var(--text-gray); margin-bottom: 1.2rem;">Compila il testo e carica la foto di copertina o una galleria fotografica direttamente dal tuo dispositivo.</p>
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
              <input type="text" id="cms-mag-img" placeholder="URL immagine (opzionale)" value="/images/merch_neon_samurai_poster.png" style="width: 100%; margin-top: 8px; padding: 7px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; color: white; font-size: 0.78rem;">
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
          <button type="submit" class="btn btn-prime" style="padding: 0.95rem; font-weight: 800; justify-content: center;">
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

  document.getElementById('magazine-auth-form').onsubmit = (e) => {
    e.preventDefault();
    const val = document.getElementById('magazine-password-input').value;
    if (val === MAGAZINE_PASSWORD) {
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
    const coverImg = pendingCoverDataUrl || document.getElementById('cms-mag-img').value.trim() || '/images/merch_neon_samurai_poster.png';
    const newArt = {
      id: 'mag-art-' + Date.now(),
      issue: document.getElementById('cms-mag-issue').value.trim(),
      category: document.getElementById('cms-mag-cat').value.trim().toUpperCase(),
      title: document.getElementById('cms-mag-title').value.trim(),
      author: document.getElementById('cms-mag-author').value.trim(),
      date: new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
      readTime: document.getElementById('cms-mag-readtime').value.trim() || '5 min',
      coverImg,
      gallery: [...pendingGalleryDataUrls],
      summary: document.getElementById('cms-mag-summary').value.trim(),
      content: document.getElementById('cms-mag-content').value.trim()
    };
    articles.unshift(newArt);
    await saveMagazineArticles(articles);
    pendingCoverDataUrl = '';
    pendingGalleryDataUrls = [];
    cmsModal.style.display = 'none';
    renderMagazineSection();
    if (window.showToast) window.showToast('Articolo e foto pubblicati nel Magazine!', 'success');
  };
}

function openMagazineReaderModal(article) {
  if (!article) return;
  const readerModal = document.getElementById('magazine-reader-modal');
  const body = document.getElementById('magazine-reader-body');
  const assetHelper = window.getAssetUrl || ((p) => p);

  const paragraphs = (article.content || '')
    .split('\n\n')
    .map(p => `<p style="margin-bottom: 1rem; line-height: 1.75; color: #e2e8f0; font-size: 1rem;">${p}</p>`)
    .join('');

  const galleryHtml = Array.isArray(article.gallery) && article.gallery.length > 0
    ? `
      <div style="margin-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.2rem;">
        <h4 style="color: white; font-size: 1rem; margin-bottom: 0.8rem;"><i class="fas fa-images" style="color: var(--prime-blue);"></i> Galleria Fotografica dell'Articolo</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;">
          ${article.gallery.map(img => `<img src="${assetHelper(img)}" alt="Foto Articolo" style="width: 100%; height: 140px; object-fit: cover; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12);">`).join('')}
        </div>
      </div>
    `
    : '';

  body.innerHTML = `
    <div style="height: 240px; background: url('${assetHelper(article.coverImg)}') no-repeat center center; background-size: cover; border-radius: 10px; margin-bottom: 1.4rem; position: relative;">
      <span style="position: absolute; top: 12px; left: 12px; background: var(--prime-blue); color: white; padding: 4px 12px; border-radius: 4px; font-size: 0.75rem; font-weight: 800;">${article.category}</span>
    </div>
    <div style="font-size: 0.85rem; color: var(--prime-blue); font-weight: 700; margin-bottom: 6px;">${article.issue} • ${article.date} • ${article.author}</div>
    <h2 style="font-size: 1.65rem; font-weight: 900; color: white; margin-bottom: 1.2rem; line-height: 1.3;">${article.title}</h2>
    <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.2rem;">
      ${paragraphs}
    </div>
    ${galleryHtml}
  `;
  readerModal.style.display = 'flex';
}

function openMagazineCmsModal() {
  pendingCoverDataUrl = '';
  pendingGalleryDataUrls = [];
  const coverStatus = document.getElementById('cms-cover-status');
  const galleryStatus = document.getElementById('cms-gallery-status');
  const galleryPreview = document.getElementById('cms-gallery-preview');
  if (coverStatus) coverStatus.textContent = 'Oppure usa URL qui sotto';
  if (galleryStatus) galleryStatus.textContent = 'Puoi selezionare più foto insieme';
  if (galleryPreview) galleryPreview.innerHTML = '';
  const cmsModal = document.getElementById('magazine-cms-modal');
  if (cmsModal) cmsModal.style.display = 'flex';
}

// ============================================================================
// 2. SEZIONE BACKEND CON PULSANTI SINGOLI ATTIVA/DISATTIVA (PASSWORD: Money68030??)
// ============================================================================
export function initBackendSystem() {
  syncPaymentConfigFromCloud();
  injectBackendModals();

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
    <!-- Modal Password Backend (Money68030??) -->
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

  document.getElementById('backend-auth-form').onsubmit = (e) => {
    e.preventDefault();
    const pwd = document.getElementById('backend-password-input').value;
    if (pwd === BACKEND_PASSWORD) {
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
    }
  ];

  body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 1.2rem;">
      <div>
        <span style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; padding: 3px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: 800;">CONSOLE AMMINISTRATORE BACKEND</span>
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

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem;">
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
      stripePublishableKey: document.getElementById('be-stripe-pk').value.trim(),
      stripeConnectWebhookUrl: document.getElementById('be-stripe-webhook').value.trim()
    });
    openBackendConsole();
    if (window.showToast) window.showToast('Parametri economici e chiavi salvati!', 'success');
  };

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
          firebaseProject: 'indiestore-d9cb2',
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
