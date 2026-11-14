import { db } from './firebase';
import { collection, getDocs, addDoc, doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { getLanguage, autoTranslateDOM } from './i18n';

// Passwords richieste dalle specifiche
const MAGAZINE_PASSWORD = 'Numero11!!!';
const BACKEND_PASSWORD = 'Money68030??';

const STORAGE_KEY_PAYMENT_CONFIG = 'indieplay_payment_config_v1';
const STORAGE_KEY_TRANSACTIONS = 'indieplay_split_transactions_v1';
const STORAGE_KEY_MAGAZINE_UNLOCKED = 'indieplay_mag_unlocked_v1';
const STORAGE_KEY_MAGAZINE_ARTICLES = 'indieplay_mag_articles_v1';

const DEFAULT_PAYMENT_CONFIG = {
  realPaymentsEnabled: false, // Temporaneamente DISABILITATO di default (usa simulazione finché non attivato da Backend)
  strictIbanValidation: false,
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
      return merged;
    }
  } catch (e) {
    // Fallback to local config if Firestore rules restrict anonymous read
  }
  return getPaymentConfig();
}

export async function savePaymentConfig(newConfig) {
  const merged = {
    ...getPaymentConfig(),
    ...newConfig,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY_PAYMENT_CONFIG, JSON.stringify(merged));
  try {
    await setDoc(doc(db, 'platform_config', 'payments'), merged, { merge: true });
  } catch (e) {
    console.warn('Saved payment config locally (Firestore sync skipped):', e);
  }
  window.dispatchEvent(new CustomEvent('indieplay:paymentconfigchange', { detail: merged }));
  return merged;
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
    mode: cfg.realPaymentsEnabled ? 'REAL_SPLIT_PAYMENT' : 'SIMULATION'
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
    mode: cfg.realPaymentsEnabled ? 'REALE (Split-Payment Automatico)' : 'SIMULAZIONE (Test)',
    gateway: cfg.realPaymentsEnabled ? cfg.gatewayProvider : 'sandbox_simulated',
    payoutStatus: cfg.realPaymentsEnabled ? 'ACCREDITATO_SPLIT_AUTO' : 'SIMULATO'
  };

  const list = getStoredTransactions();
  list.unshift(record);
  localStorage.setItem(STORAGE_KEY_TRANSACTIONS, JSON.stringify(list.slice(0, 100)));

  try {
    await addDoc(collection(db, 'transactions'), record);
  } catch (e) {
    // Kept in local ledger if Firestore rules restrict write
  }
  return record;
}

// ============================================================================
// 1. MAGAZINE EDITORIALE (PROTETTO DA PASSWORD: Numero11!!!)
// ============================================================================
export function isMagazineUnlocked() {
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

export function initMagazineSystem() {
  const magSection = document.getElementById('magazine-section');
  if (!magSection) return;

  // Ensure Modals exist in DOM
  injectMagazineModals();

  renderMagazineSection();

  window.addEventListener('indieplay:langchange', () => {
    autoTranslateDOM(getLanguage());
  });
}

function renderMagazineSection() {
  const magSection = document.getElementById('magazine-section');
  if (!magSection) return;

  const unlocked = isMagazineUnlocked();
  const articles = getMagazineArticles();
  const assetHelper = window.getAssetUrl || ((p) => p);

  magSection.style.opacity = '1';
  magSection.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-top: 1rem; margin-bottom: 1.5rem;">
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
        <h2 style="margin: 0; font-size: 1.6rem; color: white; font-weight: 900;" data-i18n="title_magazine">Magazine Editoriale IndiePlay-X</h2>
        <span style="background: ${unlocked ? '#10b981' : 'var(--prime-blue)'}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.5px;">
          <i class="fas ${unlocked ? 'fa-unlock-alt' : 'fa-lock'}"></i> ${unlocked ? 'ACCESSO SBLOCCATO' : 'PROTETTO DA PASSWORD'}
        </span>
      </div>
      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        ${!unlocked ? `
          <button id="open-mag-login-btn" class="btn btn-prime" style="padding: 0.65rem 1.3rem; font-weight: 800; display: inline-flex; align-items: center; gap: 8px;">
            <i class="fas fa-key"></i> <span data-i18n="mag_Access_btn">Accedi al Magazine (Login Password)</span>
          </button>
        ` : `
          <button id="open-mag-cms-btn" class="btn btn-prime" style="padding: 0.65rem 1.2rem; font-weight: 800; display: inline-flex; align-items: center; gap: 8px;">
            <i class="fas fa-plus-circle"></i> <span data-i18n="mag_new_article_btn">Pubblica / Gestisci Articoli</span>
          </button>
          <button id="lock-mag-btn" class="btn btn-prime-outline" style="padding: 0.65rem 1.1rem; font-weight: 700;">
            <i class="fas fa-lock"></i> <span data-i18n="mag_logout_btn">Blocca Magazine</span>
          </button>
        `}
      </div>
    </div>

    ${!unlocked ? `
      <!-- Vista Pre-Login: Copertina + Richiesta Password -->
      <div style="background: linear-gradient(135deg, rgba(0, 168, 225, 0.12) 0%, rgba(15, 23, 30, 0.95) 100%); border: 1px solid rgba(0, 168, 225, 0.35); border-radius: 14px; padding: 2rem; display: flex; gap: 2rem; align-items: center; flex-wrap: wrap; box-shadow: 0 15px 35px rgba(0,0,0,0.45);">
        <div style="width: 140px; height: 190px; background: linear-gradient(160deg, #00a8e1, #0f172a); border-radius: 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.2); flex-shrink: 0; box-shadow: 0 10px 25px rgba(0,0,0,0.6); padding: 1rem; text-align: center;">
          <i class="fas fa-book-reader" style="font-size: 2.8rem; color: white; margin-bottom: 10px;"></i>
          <span style="font-size: 0.7rem; font-weight: 900; color: #e0f2fe; letter-spacing: 1px;">INDIEPLAY-X</span>
          <span style="font-size: 0.85rem; font-weight: 800; color: white;">MAGAZINE #1</span>
        </div>
        <div style="flex: 1; min-width: 260px;">
          <div style="display: inline-block; background: rgba(0,168,225,0.2); color: var(--prime-blue); font-size: 0.75rem; font-weight: 800; padding: 3px 10px; border-radius: 4px; margin-bottom: 8px;">RIVISTA UFFICIALE & REDAZIONE</div>
          <h3 style="color: white; margin-bottom: 10px; font-size: 1.35rem; font-weight: 800;">IndiePlay Magazine — Edizione Digitale Interattiva</h3>
          <p style="color: var(--text-gray); font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.2rem;">
            La rivista digitale ufficiale dedicata allo sviluppo indipendente: interviste esclusive agli studi, recensioni approfondite, dietro le quinte e guide sulla monetizzazione. L'accesso alla lettura integrale degli articoli e al CMS redazionale è protetto da password.
          </p>
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <button id="open-mag-login-btn-2" class="btn btn-prime" style="padding: 0.75rem 1.6rem; font-weight: 800;">
              <i class="fas fa-unlock"></i> Inserisci Password Magazine
            </button>
            <span style="font-size: 0.82rem; color: var(--text-gray);"><i class="fas fa-shield-alt" style="color: var(--prime-blue);"></i> Contenuto riservato (${articles.length} articoli pubblicati)</span>
          </div>
        </div>
      </div>
    ` : `
      <!-- Vista Sbloccata: Griglia Articoli Interattivi -->
      <div class="magazine-articles-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 1.5rem;">
        ${articles.map((art, idx) => `
          <article class="mag-article-card" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.25s ease, border-color 0.25s ease;">
            <div>
              <div style="height: 170px; background: url('${assetHelper(art.coverImg)}') no-repeat center center; background-size: cover; position: relative;">
                <span style="position: absolute; top: 12px; left: 12px; background: var(--prime-blue); color: white; padding: 3px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: 800;">${art.category || 'EDITORIALE'}</span>
                <span style="position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.75); color: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 600;"><i class="far fa-clock"></i> ${art.readTime || '5 min'}</span>
              </div>
              <div style="padding: 1.3rem;">
                <div style="font-size: 0.78rem; color: var(--prime-blue); font-weight: 700; margin-bottom: 4px;">${art.issue || 'Numero #1'} • ${art.date || '2026'}</div>
                <h3 style="color: white; font-size: 1.12rem; font-weight: 800; line-height: 1.35; margin-bottom: 10px;">${art.title}</h3>
                <p style="color: var(--text-gray); font-size: 0.88rem; line-height: 1.55; margin-bottom: 1rem;">${art.summary}</p>
              </div>
            </div>
            <div style="padding: 0 1.3rem 1.3rem; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
              <span style="font-size: 0.78rem; color: var(--text-gray); font-weight: 600;"><i class="fas fa-pen-nib"></i> ${art.author || 'Redazione'}</span>
              <button class="btn btn-prime-outline read-mag-article-btn" data-idx="${idx}" style="padding: 0.5rem 1rem; font-size: 0.82rem; font-weight: 700;">
                <i class="fas fa-book-open"></i> <span data-i18n="mag_read_btn">Leggi Articolo</span>
              </button>
            </div>
          </article>
        `).join('')}
      </div>
    `}
  `;

  // Wire buttons
  const openLogin1 = document.getElementById('open-mag-login-btn');
  const openLogin2 = document.getElementById('open-mag-login-btn-2');
  const openLoginModal = () => {
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
  if (openLogin1) openLogin1.onclick = openLoginModal;
  if (openLogin2) openLogin2.onclick = openLoginModal;

  const lockBtn = document.getElementById('lock-mag-btn');
  if (lockBtn) {
    lockBtn.onclick = () => {
      sessionStorage.removeItem(STORAGE_KEY_MAGAZINE_UNLOCKED);
      renderMagazineSection();
      if (window.showToast) window.showToast('Magazine bloccato con successo.', 'info');
    };
  }

  const openCmsBtn = document.getElementById('open-mag-cms-btn');
  if (openCmsBtn) {
    openCmsBtn.onclick = () => {
      openMagazineCmsModal();
    };
  }

  magSection.querySelectorAll('.read-mag-article-btn').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      openMagazineReaderModal(articles[idx]);
    };
  });

  autoTranslateDOM(getLanguage());
}

function injectMagazineModals() {
  if (document.getElementById('magazine-auth-modal')) return;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <!-- Modal Login Password Magazine (Numero11!!!) -->
    <div id="magazine-auth-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3000;">
      <div class="modal-content glass" style="background: rgba(18, 26, 36, 0.98); border: 1px solid rgba(0, 168, 225, 0.4); border-radius: 16px; padding: 2.2rem; max-width: 440px; width: 92%; color: white; position: relative; box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
        <span class="close-lightbox" id="close-mag-auth" style="position: absolute; top: 0.8rem; right: 1.2rem; font-size: 2.2rem; cursor: pointer; color: var(--text-gray);">&times;</span>
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 1.2rem;">
          <div style="width: 46px; height: 46px; border-radius: 12px; background: rgba(0, 168, 225, 0.15); border: 1px solid var(--prime-blue); display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-newspaper" style="color: var(--prime-blue); font-size: 1.3rem;"></i>
          </div>
          <div>
            <h3 style="margin: 0; font-size: 1.3rem; font-weight: 800;">Accesso Magazine</h3>
            <span style="font-size: 0.8rem; color: var(--text-gray);">Area Editoriale & Lettura Integrale</span>
          </div>
        </div>
        <form id="magazine-auth-form" style="display: flex; flex-direction: column; gap: 1rem;">
          <div class="form-group">
            <label style="font-size: 0.82rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 6px;">PASSWORD MAGAZINE</label>
            <input type="password" id="magazine-password-input" required placeholder="Inserisci password Magazine..." style="width: 100%; padding: 12px; background: #111922; border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; color: white; font-size: 1rem;">
          </div>
          <button type="submit" class="btn btn-prime" style="width: 100%; padding: 0.9rem; font-weight: 800; justify-content: center;">
            <i class="fas fa-unlock-alt"></i> Sblocca Magazine Editoriale
          </button>
        </form>
      </div>
    </div>

    <!-- Modal Lettore Articolo Magazine -->
    <div id="magazine-reader-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3100;">
      <div class="modal-content glass" style="background: rgba(18, 26, 36, 0.99); border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; padding: 2.2rem; max-width: 720px; width: 94%; max-height: 86vh; overflow-y: auto; color: white; position: relative;">
        <span class="close-lightbox" id="close-mag-reader" style="position: absolute; top: 0.8rem; right: 1.2rem; font-size: 2.2rem; cursor: pointer; color: var(--text-gray);">&times;</span>
        <div id="magazine-reader-body"></div>
      </div>
    </div>

    <!-- Modal CMS Redazione Magazine -->
    <div id="magazine-cms-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3100;">
      <div class="modal-content glass" style="background: rgba(18, 26, 36, 0.99); border: 1px solid rgba(0, 168, 225, 0.4); border-radius: 16px; padding: 2rem; max-width: 680px; width: 94%; max-height: 88vh; overflow-y: auto; color: white; position: relative;">
        <span class="close-lightbox" id="close-mag-cms" style="position: absolute; top: 0.8rem; right: 1.2rem; font-size: 2.2rem; cursor: pointer; color: var(--text-gray);">&times;</span>
        <h3 style="font-size: 1.4rem; font-weight: 800; margin-bottom: 0.3rem;"><i class="fas fa-feather-alt" style="color: var(--prime-blue);"></i> Redazione Magazine — Pubblica Nuovo Articolo</h3>
        <p style="font-size: 0.85rem; color: var(--text-gray); margin-bottom: 1.2rem;">Gli articoli pubblicati vengono salvati in modo permanente e resi subito disponibili nel Magazine.</p>
        <form id="magazine-cms-form" style="display: flex; flex-direction: column; gap: 0.9rem;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem;">
            <div>
              <label style="font-size: 0.8rem; color: var(--text-gray); font-weight: 700;">Numero / Edizione</label>
              <input type="text" id="cms-mag-issue" required value="Numero #1 — Speciale" style="width: 100%; padding: 10px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white;">
            </div>
            <div>
              <label style="font-size: 0.8rem; color: var(--text-gray); font-weight: 700;">Categoria Badge</label>
              <input type="text" id="cms-mag-cat" required placeholder="Es. INTERVISTA, RECENSIONE" value="EDITORIALE" style="width: 100%; padding: 10px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white;">
            </div>
          </div>
          <div>
            <label style="font-size: 0.8rem; color: var(--text-gray); font-weight: 700;">Titolo Articolo</label>
            <input type="text" id="cms-mag-title" required placeholder="Inserisci il titolo dell'articolo..." style="width: 100%; padding: 10px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white;">
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem;">
            <div>
              <label style="font-size: 0.8rem; color: var(--text-gray); font-weight: 700;">Autore</label>
              <input type="text" id="cms-mag-author" required value="Redazione IndiePlay-X" style="width: 100%; padding: 10px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white;">
            </div>
            <div>
              <label style="font-size: 0.8rem; color: var(--text-gray); font-weight: 700;">URL Immagine Copertina</label>
              <input type="text" id="cms-mag-img" value="/images/merch_neon_samurai_poster.png" style="width: 100%; padding: 10px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white;">
            </div>
          </div>
          <div>
            <label style="font-size: 0.8rem; color: var(--text-gray); font-weight: 700;">Sommario Breve</label>
            <textarea id="cms-mag-summary" rows="2" required placeholder="Breve anteprima dell'articolo..." style="width: 100%; padding: 10px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white;"></textarea>
          </div>
          <div>
            <label style="font-size: 0.8rem; color: var(--text-gray); font-weight: 700;">Contenuto Integrale dell'Articolo</label>
            <textarea id="cms-mag-content" rows="5" required placeholder="Scrivi qui il testo completo dell'articolo..." style="width: 100%; padding: 10px; background: #111922; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white;"></textarea>
          </div>
          <button type="submit" class="btn btn-prime" style="padding: 0.9rem; font-weight: 800; justify-content: center;">
            <i class="fas fa-paper-plane"></i> Pubblica Articolo nel Magazine
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

  document.getElementById('magazine-auth-form').onsubmit = (e) => {
    e.preventDefault();
    const val = document.getElementById('magazine-password-input').value;
    if (val === MAGAZINE_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY_MAGAZINE_UNLOCKED, 'true');
      authModal.style.display = 'none';
      renderMagazineSection();
      if (window.showToast) window.showToast('Accesso al Magazine Editoriale sbloccato!', 'success');
    } else {
      if (window.showToast) window.showToast('Password Magazine errata! Riprova.', 'error');
    }
  };

  document.getElementById('magazine-cms-form').onsubmit = async (e) => {
    e.preventDefault();
    const articles = getMagazineArticles();
    const newArt = {
      id: 'mag-art-' + Date.now(),
      issue: document.getElementById('cms-mag-issue').value.trim(),
      category: document.getElementById('cms-mag-cat').value.trim().toUpperCase(),
      title: document.getElementById('cms-mag-title').value.trim(),
      author: document.getElementById('cms-mag-author').value.trim(),
      date: new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
      readTime: '5 min',
      coverImg: document.getElementById('cms-mag-img').value.trim() || '/images/merch_neon_samurai_poster.png',
      summary: document.getElementById('cms-mag-summary').value.trim(),
      content: document.getElementById('cms-mag-content').value.trim()
    };
    articles.unshift(newArt);
    await saveMagazineArticles(articles);
    cmsModal.style.display = 'none';
    renderMagazineSection();
    if (window.showToast) window.showToast('Nuovo articolo pubblicato nel Magazine!', 'success');
  };
}

function openMagazineReaderModal(article) {
  if (!article) return;
  const readerModal = document.getElementById('magazine-reader-modal');
  const body = document.getElementById('magazine-reader-body');
  const assetHelper = window.getAssetUrl || ((p) => p);

  const paragraphs = (article.content || '').split('\n\n').map(p => `<p style="margin-bottom: 1rem; line-height: 1.75; color: #e2e8f0; font-size: 1rem;">${p}</p>`).join('');

  body.innerHTML = `
    <div style="height: 220px; background: url('${assetHelper(article.coverImg)}') no-repeat center center; background-size: cover; border-radius: 10px; margin-bottom: 1.4rem; position: relative;">
      <span style="position: absolute; top: 12px; left: 12px; background: var(--prime-blue); color: white; padding: 4px 12px; border-radius: 4px; font-size: 0.75rem; font-weight: 800;">${article.category}</span>
    </div>
    <div style="font-size: 0.85rem; color: var(--prime-blue); font-weight: 700; margin-bottom: 6px;">${article.issue} • ${article.date} • ${article.author}</div>
    <h2 style="font-size: 1.65rem; font-weight: 900; color: white; margin-bottom: 1.2rem; line-height: 1.3;">${article.title}</h2>
    <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.2rem;">
      ${paragraphs}
    </div>
  `;
  readerModal.style.display = 'flex';
}

function openMagazineCmsModal() {
  const cmsModal = document.getElementById('magazine-cms-modal');
  if (cmsModal) cmsModal.style.display = 'flex';
}

// ============================================================================
// 2. SEZIONE BACKEND TRANSAZIONI REALI & SPLIT-PAYMENT (PASSWORD: Money68030??)
// ============================================================================
export function initBackendSystem() {
  syncPaymentConfigFromCloud();
  injectBackendModals();

  // Bind all ".open-backend-link" buttons in footers/navs
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
            <span style="font-size: 0.8rem; color: var(--text-gray);">Controllo Transazioni Reali & Split-Payment</span>
          </div>
        </div>
        <form id="backend-auth-form" style="display: flex; flex-direction: column; gap: 1rem;">
          <div class="form-group">
            <label style="font-size: 0.82rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 6px;">PASSWORD AMMINISTRATORE BACKEND</label>
            <input type="password" id="backend-password-input" required placeholder="Inserisci password Backend..." style="width: 100%; padding: 12px; background: #0f1722; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: white; font-size: 1rem;">
          </div>
          <button type="submit" class="btn btn-prime" style="width: 100%; padding: 0.9rem; font-weight: 800; background: #f59e0b; color: #0f172a; justify-content: center;">
            <i class="fas fa-key"></i> Accedi alla Console Backend
          </button>
        </form>
      </div>
    </div>

    <!-- Console Completa Backend Pagamenti Reali, Split-Payment & Salvaguardia Utenti -->
    <div id="backend-console-modal" class="lightbox" style="display: none; justify-content: center; align-items: center; z-index: 3600;">
      <div class="modal-content glass" style="background: rgba(15, 23, 34, 0.99); border: 1px solid rgba(0, 168, 225, 0.45); border-radius: 16px; padding: 2rem; max-width: 820px; width: 95%; max-height: 90vh; overflow-y: auto; color: white; position: relative; box-shadow: 0 25px 60px rgba(0,0,0,0.9);">
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

  body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 1.4rem;">
      <div>
        <span style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; padding: 3px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: 800;">ADMIN BACKEND PROTETTO</span>
        <h2 style="margin: 6px 0 0; font-size: 1.5rem; font-weight: 900;">Gestione Transazioni Reali, Split-Payment & Cloud DB</h2>
      </div>
      <div style="padding: 8px 14px; border-radius: 8px; font-weight: 800; font-size: 0.85rem; background: ${cfg.realPaymentsEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${cfg.realPaymentsEnabled ? '#34d399' : '#f87171'}; border: 1px solid ${cfg.realPaymentsEnabled ? '#10b981' : '#ef4444'};">
        ${cfg.realPaymentsEnabled ? '● TRANSAZIONI REALI & SPLIT-PAYMENT ATTIVI' : '● DISABILITATO (Modalità Simulazione Attiva)'}
      </div>
    </div>

    <form id="backend-config-form" style="display: flex; flex-direction: column; gap: 1.2rem;">
      <!-- Interruttore Principale Transazioni Reali -->
      <div style="background: rgba(255,255,255,0.04); border: 1px solid ${cfg.realPaymentsEnabled ? '#10b981' : 'rgba(255,255,255,0.12)'}; padding: 1.2rem; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 240px;">
          <h4 style="margin: 0 0 4px; font-size: 1.05rem; color: white;"><i class="fas fa-random" style="color: var(--prime-blue); margin-right: 6px;"></i> Attiva Transazioni Reali & Split-Payment Automatico</h4>
          <p style="margin: 0; font-size: 0.84rem; color: var(--text-gray);">
            Quando disabilitato (impostazione predefinita di sicurezza), il sito utilizza la simulazione carte/IBAN. Quando attivato, ogni acquisto esegue la validazione reale Luhn/Gateway e ripartisce automaticamente l'incasso tra Piattaforma e IBAN dello Sviluppatore.
          </p>
        </div>
        <label style="display: inline-flex; align-items: center; gap: 10px; cursor: pointer; background: rgba(0,0,0,0.4); padding: 10px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);">
          <input type="checkbox" id="be-enable-real" ${cfg.realPaymentsEnabled ? 'checked' : ''} style="width: 22px; height: 22px; accent-color: #10b981; cursor: pointer;">
          <span style="font-weight: 800; font-size: 0.9rem;">${cfg.realPaymentsEnabled ? 'ATTIVO' : 'DISABILITATO'}</span>
        </label>
      </div>

      <!-- Parametri Split-Payment -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;">
        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); padding: 1rem; border-radius: 10px;">
          <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 6px;">COMMISSIONE PIATTAFORMA (%)</label>
          <input type="number" id="be-fee-pct" min="0" max="95" step="0.5" value="${cfg.platformFeePercent}" style="width: 100%; padding: 10px; background: #0f1722; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: white; font-weight: 800; font-size: 1rem;">
          <div id="be-split-preview" style="font-size: 0.78rem; color: #38bdf8; margin-top: 6px; font-weight: 700;">
            Ripartizione: ${devSharePct}% Sviluppatore / ${cfg.platformFeePercent}% IndiePlay-X
          </div>
        </div>

        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); padding: 1rem; border-radius: 10px;">
          <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 6px;">GATEWAY DI PAGAMENTO</label>
          <select id="be-gateway" style="width: 100%; padding: 10px; background: #0f1722; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: white; font-weight: 700;">
            <option value="stripe_connect" ${cfg.gatewayProvider === 'stripe_connect' ? 'selected' : ''}>Stripe Connect (Split Automatico)</option>
            <option value="paypal_commerce" ${cfg.gatewayProvider === 'paypal_commerce' ? 'selected' : ''}>PayPal Commerce Marketplace</option>
            <option value="sepa_split" ${cfg.gatewayProvider === 'sepa_split' ? 'selected' : ''}>Bonifico SEPA Split Diretto (IBAN)</option>
          </select>
          <label style="display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 0.78rem; color: var(--text-gray); cursor: pointer;">
            <input type="checkbox" id="be-strict-iban" ${cfg.strictIbanValidation ? 'checked' : ''}> Richiedi verifica matematica IBAN (Mod-97)
          </label>
        </div>

        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); padding: 1rem; border-radius: 10px;">
          <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 6px;">IBAN MASTER PIATTAFORMA</label>
          <input type="text" id="be-platform-iban" value="${cfg.platformIban}" style="width: 100%; padding: 10px; background: #0f1722; border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: white; font-family: monospace;">
          <div style="font-size: 0.74rem; color: var(--text-gray); margin-top: 6px;">Conto su cui converge la quota piattaforma</div>
        </div>
      </div>

      <!-- Chiavi Live Stripe / PayPal -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div>
          <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 4px;">Stripe Publishable Key (Live)</label>
          <input type="text" id="be-stripe-pk" value="${cfg.stripePublishableKey}" style="width: 100%; padding: 9px; background: #0f1722; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white; font-family: monospace; font-size: 0.85rem;">
        </div>
        <div>
          <label style="font-size: 0.78rem; color: var(--text-gray); font-weight: 700; display: block; margin-bottom: 4px;">Endpoint Webhook Split-Payment</label>
          <input type="text" id="be-stripe-webhook" value="${cfg.stripeConnectWebhookUrl}" style="width: 100%; padding: 9px; background: #0f1722; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: white; font-family: monospace; font-size: 0.85rem;">
        </div>
      </div>

      <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
        <button type="submit" class="btn btn-prime" style="padding: 0.85rem 1.8rem; font-weight: 800;">
          <i class="fas fa-save"></i> Salva Configurazione Backend
        </button>
        <button type="button" id="be-export-backup-btn" class="btn btn-prime-outline" style="padding: 0.85rem 1.4rem; font-weight: 700;">
          <i class="fas fa-database"></i> Esporta Backup Utenti, Vetrine & Giochi (JSON)
        </button>
      </div>
    </form>

    <!-- Registro Split-Payment -->
    <div style="margin-top: 1.8rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.2rem;">
      <h4 style="margin: 0 0 0.8rem; font-size: 1rem; color: white;"><i class="fas fa-receipt" style="color: var(--prime-blue);"></i> Ultime Transazioni & Ripartizione Split-Payment (${txs.length})</h4>
      ${txs.length === 0 ? `
        <div style="padding: 1rem; background: rgba(255,255,255,0.02); border-radius: 8px; color: var(--text-gray); font-size: 0.85rem;">
          Nessuna transazione registrata in questa sessione. Effettua un acquisto per visualizzare il dettaglio dello split-payment.
        </div>
      ` : `
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
            <thead>
              <tr style="background: rgba(255,255,255,0.06); text-align: left;">
                <th style="padding: 8px;">ID / Data</th>
                <th style="padding: 8px;">Gioco & Studio</th>
                <th style="padding: 8px;">Totale</th>
                <th style="padding: 8px;">Quota Sviluppatore</th>
                <th style="padding: 8px;">Quota Piattaforma</th>
                <th style="padding: 8px;">Modalità</th>
              </tr>
            </thead>
            <tbody>
              ${txs.slice(0, 8).map(t => `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                  <td style="padding: 8px; font-family: monospace;">${t.id.slice(0, 12)}</td>
                  <td style="padding: 8px;"><strong>${t.gameTitle}</strong><br><span style="color: var(--text-gray);">${t.developerName}</span></td>
                  <td style="padding: 8px; font-weight: 800;">€${Number(t.totalAmount).toFixed(2)}</td>
                  <td style="padding: 8px; color: #34d399; font-weight: 800;">€${Number(t.developerShare).toFixed(2)} (${t.developerPercent}%)</td>
                  <td style="padding: 8px; color: #38bdf8; font-weight: 700;">€${Number(t.platformShare).toFixed(2)} (${t.platformFeePercent}%)</td>
                  <td style="padding: 8px;">${t.mode}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  consoleModal.style.display = 'flex';

  const feeInput = document.getElementById('be-fee-pct');
  const splitPreview = document.getElementById('be-split-preview');
  if (feeInput && splitPreview) {
    feeInput.oninput = () => {
      const f = Math.min(95, Math.max(0, Number(feeInput.value) || 0));
      splitPreview.textContent = `Ripartizione: ${(100 - f).toFixed(1)}% Sviluppatore / ${f.toFixed(1)}% IndiePlay-X`;
    };
  }

  document.getElementById('backend-config-form').onsubmit = async (e) => {
    e.preventDefault();
    const updated = await savePaymentConfig({
      realPaymentsEnabled: document.getElementById('be-enable-real').checked,
      strictIbanValidation: document.getElementById('be-strict-iban').checked,
      platformFeePercent: parseFloat(document.getElementById('be-fee-pct').value) || 15,
      gatewayProvider: document.getElementById('be-gateway').value,
      platformIban: document.getElementById('be-platform-iban').value.trim(),
      stripePublishableKey: document.getElementById('be-stripe-pk').value.trim(),
      stripeConnectWebhookUrl: document.getElementById('be-stripe-webhook').value.trim()
    });
    openBackendConsole(); // Re-render status
    if (window.showToast) {
      window.showToast(
        updated.realPaymentsEnabled
          ? 'Transazioni Reali con Split-Payment ATTIVATE!'
          : 'Transazioni Reali DISABILITATE (Modalità Simulazione attiva).',
        'success'
      );
    }
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
