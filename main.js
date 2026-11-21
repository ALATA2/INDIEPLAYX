import { registerUser, loginUser, logoutUser, resetUserPassword, subscribeToAuthChanges, loginWithGoogle, isVipSellerEmail, hasValidPartitaIva } from './src/auth';
import { getGames, getGamesPaged, getCachedGamesSync } from './src/store';
import { db, auth } from './src/firebase';
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { initLanguageSelectors, translations, getLanguage, autoTranslateDOM, translatePage } from './src/i18n';
import { renderVersionBadge } from './src/version';
import { initMagazineSystem, initBackendSystem, getPaymentConfig, openQuickBuyModal, addToQuickCart, isGameOwnedExpress, getPortalNews, openPortalNewsReaderModal } from './src/backend-payments';
import { renderCommunityBoardSection } from './src/community-board';
import { isInWishlist, toggleWishlist, getWishlist, syncWishlistFromCloud, getNewGamesFromFollowedCreators, markFollowedGamesSeen, initPwaSupport } from './src/community-features';
initPwaSupport();

// Initialize language selector and translate page
initLanguageSelectors();


const getAssetUrl = (path) => {
  if (!path) return `${import.meta.env.BASE_URL}images/placeholder.png`;
  if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${import.meta.env.BASE_URL}${cleanPath}`;
};
window.getAssetUrl = getAssetUrl;

// DOM Elements
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');
const userDisplay = document.getElementById('user-display');
const loginModal = document.getElementById('login-modal');
const registerModal = document.getElementById('register-modal');
const sellLink = document.getElementById('sell-link');
const gameList = document.getElementById('game-grid');


const privacyModal = document.getElementById('privacy-modal');
const cookieModal = document.getElementById('cookie-modal');

// Close buttons
document.querySelectorAll('.close-modal, .close-lightbox').forEach(btn => {
  btn.onclick = () => {
    loginModal.style.display = 'none';
    registerModal.style.display = 'none';
    if (privacyModal) privacyModal.style.display = 'none';
    if (cookieModal) cookieModal.style.display = 'none';
  }
});

const confirmPrivacyBtn = document.getElementById('confirm-privacy-btn');
const confirmCookieBtn = document.getElementById('confirm-cookie-btn');
if (confirmPrivacyBtn) confirmPrivacyBtn.onclick = () => privacyModal.style.display = 'none';
if (confirmCookieBtn) confirmCookieBtn.onclick = () => cookieModal.style.display = 'none';

document.querySelectorAll('.open-privacy-link').forEach(btn => {
  btn.onclick = (e) => {
    e.preventDefault();
    if (privacyModal) privacyModal.style.display = 'flex';
  };
});

document.querySelectorAll('.open-cookie-link').forEach(btn => {
  btn.onclick = (e) => {
    e.preventDefault();
    if (cookieModal) cookieModal.style.display = 'flex';
  };
});

window.onclick = (event) => {
  if (event.target == loginModal) loginModal.style.display = 'none';
  if (event.target == registerModal) registerModal.style.display = 'none';
  if (event.target == privacyModal) privacyModal.style.display = 'none';
  if (event.target == cookieModal) cookieModal.style.display = 'none';
}

// Auth Handlers
loginBtn.onclick = () => loginModal.style.display = 'flex';
registerBtn.onclick = () => registerModal.style.display = 'flex';
if (sellLink) {
  sellLink.onclick = (e) => {
    e.preventDefault();
    window.location.href = 'account.html?tab=my-games';
  };
}

document.getElementById('login-form').onsubmit = async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-password').value;
  try {
    await loginUser(email, pass);
    loginModal.style.display = 'none';
    window.showToast('Benvenuto!', 'success');
  } catch (err) {
    window.showToast('Errore: ' + err.message, 'error');
  }
};

const forgotPasswordLink = document.getElementById('forgot-password-link');
if (forgotPasswordLink) {
  forgotPasswordLink.onclick = async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('login-email');
    const email = (emailInput?.value || '').trim() || 'danielepmp@yahoo.it';
    if (emailInput && !emailInput.value) emailInput.value = email;
    try {
      await resetUserPassword(email);
      window.showToast(`Email di recupero password inviata a ${email}! Controlla la posta (anche Spam).`, 'success');
    } catch (err) {
      window.showToast('Errore invio recupero: ' + err.message, 'error');
    }
  };
}

const handleGoogleAuth = async () => {
  try {
    await loginWithGoogle();
    loginModal.style.display = 'none';
    registerModal.style.display = 'none';
    window.showToast('Accesso effettuato con Google!', 'success');
  } catch (err) {
    window.showToast('Errore Google Auth: ' + err.message, 'error');
  }
};

const googleLoginBtn = document.getElementById('google-login-btn');
const googleRegisterBtn = document.getElementById('google-register-btn');
if (googleLoginBtn) googleLoginBtn.onclick = handleGoogleAuth;
if (googleRegisterBtn) googleRegisterBtn.onclick = handleGoogleAuth;

// Seller toggle logic
const isSellerCheckbox = document.getElementById('is-seller');
const sellerFields = document.getElementById('seller-fields');

isSellerCheckbox.onchange = () => {
  if (isSellerCheckbox.checked) {
    sellerFields.classList.remove('hidden');
  } else {
    sellerFields.classList.add('hidden');
  }
};

function validateCForPIVA(value) {
  const val = value.trim().toUpperCase();
  const cfRegex = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPR-T][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;
  const pivaRegex = /^\d{11}$/;
  return cfRegex.test(val) || pivaRegex.test(val);
}

function validateIBAN(value) {
  const iban = value.replace(/\s+/g, '').toUpperCase();
  if (iban.startsWith('IT')) {
    if (iban.length !== 27) return false;
  } else {
    if (iban.length < 15 || iban.length > 34) return false;
  }
  const cfg = getPaymentConfig();
  if (!cfg.strictIbanValidation) {
    return true;
  }
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let numericString = '';
  for (let i = 0; i < rearranged.length; i++) {
    const code = rearranged.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      numericString += (code - 55).toString();
    } else {
      numericString += rearranged[i];
    }
  }
  let remainder = 0;
  for (let i = 0; i < numericString.length; i += 7) {
    const chunk = remainder.toString() + numericString.slice(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }
  return remainder === 1;
}

document.getElementById('register-form').onsubmit = async (e) => {
  e.preventDefault();
  const email = document.getElementById('register-email').value;
  const pass = document.getElementById('register-password').value;
  const confirmPass = document.getElementById('register-password-confirm').value;
  const name = document.getElementById('register-name').value;
  const surname = document.getElementById('register-surname').value;
  const age = document.getElementById('register-age').value;
  const isSeller = isSellerCheckbox.checked;
  const piva = document.getElementById('register-piva').value.trim();
  const iban = document.getElementById('register-iban').value.trim();
  const disclaimerChecked = document.getElementById('register-accept-disclaimer')?.checked;

  if (!disclaimerChecked) {
    window.showToast('Devi accettare lo Scarico di Responsabilità, la Privacy e l\'Informativa Cookie per iscriverti!', 'error');
    return;
  }

  if (pass !== confirmPass) {
    window.showToast('Le password inserite non coincidono!', 'error');
    return;
  }

  const isVip = isVipSellerEmail(email);
  if (isSeller && !isVip) {
    if (!hasValidPartitaIva(piva)) {
      window.showToast('Per vendere titoli a pagamento è obbligatoria una Partita IVA valida (11 cifre). Se non hai P.IVA, deseleziona la spunta: potrai comunque iscriverti e condividere giochi gratis!', 'error');
      return;
    }
    if (getPaymentConfig().strictIbanValidation && (!iban || !validateIBAN(iban))) {
      window.showToast('IBAN non valido! Inserisci un formato IBAN corretto (es: IT00...).', 'error');
      return;
    }
  }

  const hasVat = isVip || (isSeller && hasValidPartitaIva(piva));

  const userData = {
    firstName: name,
    lastName: surname,
    age: parseInt(age),
    isSeller: hasVat,
    hasPartitaIva: hasVat,
    canSellPaidGames: hasVat,
    piva: hasVat ? piva.toUpperCase() : '',
    iban: hasVat && iban ? iban.replace(/\s+/g, '').toUpperCase() : '',
    role: hasVat ? 'seller' : 'user',
    disclaimerAccepted: true,
    cookiePrivacyAccepted: true,
    verified: false
  };

  try {
    await registerUser(email, pass, userData);
    registerModal.style.display = 'none';
    
    // Clear registration fields
    document.getElementById('register-form').reset();
    if (sellerFields) sellerFields.classList.add('hidden');

    window.showToast('Registrazione avvenuta con successo! Ti abbiamo inviato un\'email di verifica reale all\'indirizzo specificato. Clicca sul link di conferma al suo interno.', 'success');
    setTimeout(() => {
        window.location.reload();
    }, 3000);
  } catch (err) {
    window.showToast('Errore: ' + err.message, 'error');
  }
};

logoutBtn.onclick = async () => {
  await logoutUser();
  window.showToast('Disconnesso.', 'info');
};

// Store Handlers
function isAndroidGame(game) {
    if (!game) return false;
    const typeStr = String(game.type || '').toLowerCase();
    const catStr = String(game.category || '').toLowerCase();
    const fmtStr = String(game.fileFormat || '').toLowerCase();
    const platStr = `${game.platform || ''} ${game.platforms || ''} ${game.os || ''} ${game.downloadUrl || ''} ${game.content || ''}`.toLowerCase();
    return (
        typeStr === 'android' ||
        fmtStr.includes('apk') ||
        platStr.includes('android') ||
        platStr.includes('.apk') ||
        platStr.includes('.xapk') ||
        catStr.includes('android') ||
        catStr.includes('mobile')
    );
}

function createGameCard(game) {
    const lang = getLanguage();
    const dict = translations[lang] || translations['en'];
    const includedTag = dict.game_included || '✓ Incluso con IndiePlay';

    const card = document.createElement('div');
    card.className = 'game-card';
    card.style.cursor = 'pointer';
    card.onclick = () => {
        window.location.href = `${import.meta.env.BASE_URL}game.html?id=${game.id}`;
    };
    const imgUrl = getAssetUrl(game.imageUrl);
    const placeholderUrl = getAssetUrl('/images/placeholder.png');
    const isFree = game.price === 'FREE' || game.price === '0' || !game.price;
    const isOwned = isGameOwnedExpress(game.id);
    const inWish = isInWishlist(game.id);
    const isAndroid = isAndroidGame(game);
    const authorName = (game.developer || game.author || 'IndiePlay Creator').trim();
    const authorUid = game.sellerId || game.authorUid || game.userId || '';
    const showcaseHref = `${import.meta.env.BASE_URL}showcase.html?${authorUid ? `uid=${encodeURIComponent(authorUid)}&` : ''}dev=${encodeURIComponent(authorName)}`;
    card.innerHTML = `
        ${isAndroid ? '<span class="card-android-badge" title="Videogioco Mobile Android (.APK)"><i class="fab fa-android"></i> APK</span>' : ''}
        <button type="button" class="card-wishlist-btn ${inWish ? 'saved' : ''}" title="${inWish ? 'Rimuovi dalla Wishlist' : 'Salva nella Wishlist'}" aria-label="Wishlist">
            <i class="${inWish ? 'fas' : 'far'} fa-heart"></i>
        </button>
        <img src="${imgUrl}" alt="${game.title}" loading="lazy" decoding="async" onerror="this.onerror=null; this.src='${placeholderUrl}'">
        <div class="card-info">
            <span class="prime-tag" style="color: #00a8e1; font-weight: bold; font-size: 0.78rem;">${includedTag}</span>
            <h3 style="margin-bottom: 2px;">${game.title}</h3>
            <a href="${showcaseHref}" class="card-creator-link" title="Vedi profilo e altri giochi di ${authorName}">
                <i class="fas fa-user-astronaut" style="color:#38bdf8; font-size:0.7rem;"></i> by ${authorName}
            </a>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 6px;">
                <div class="price" style="margin: 0;">${isFree ? (dict.free_label || 'GRATIS') : '€' + game.price}</div>
                <div class="card-quick-buy-bar" style="display: flex; align-items: center; gap: 5px;">
                    ${isOwned ? `
                        <button type="button" class="card-1click-btn owned" title="Già nella tua Libreria">
                            <i class="fas fa-check-circle"></i> ${dict.card_play || 'Gioca'}
                        </button>
                    ` : isFree ? `
                        <button type="button" class="card-1click-btn free" title="Sblocca subito con 1-Click">
                            <i class="fas fa-bolt"></i> ${dict.card_get || 'Ottieni'}
                        </button>
                    ` : `
                        <button type="button" class="card-1click-btn" title="Acquisto Immediato 1-Click">
                            <i class="fas fa-bolt"></i> 1-Click
                        </button>
                        <button type="button" class="card-cart-btn" title="Aggiungi al Carrello Rapido">
                            <i class="fas fa-cart-plus"></i>
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
    const wishBtn = card.querySelector('.card-wishlist-btn');
    if (wishBtn) {
        wishBtn.onclick = async (e) => {
            e.stopPropagation();
            const savedNow = await toggleWishlist(game);
            wishBtn.classList.toggle('saved', savedNow);
            wishBtn.innerHTML = `<i class="${savedNow ? 'fas' : 'far'} fa-heart"></i>`;
            wishBtn.title = savedNow ? 'Rimuovi dalla Wishlist' : 'Salva nella Wishlist';
            updateWishlistBadgeUI();
        };
    }
    const creatorLink = card.querySelector('.card-creator-link');
    if (creatorLink) {
        creatorLink.onclick = (e) => {
            e.stopPropagation();
        };
    }
    const quickBtn = card.querySelector('.card-1click-btn');
    if (quickBtn && !isOwned) {
        quickBtn.onclick = (e) => {
            e.stopPropagation();
            openQuickBuyModal({ ...game, imageUrl: imgUrl });
        };
    }
    const cartBtn = card.querySelector('.card-cart-btn');
    if (cartBtn) {
        cartBtn.onclick = (e) => {
            e.stopPropagation();
            addToQuickCart({ ...game, imageUrl: imgUrl });
        };
    }
    return card;
}

const newsGrid = document.getElementById('news-grid');
const bestsellersGrid = document.getElementById('bestsellers-grid');
const dealsGrid = document.getElementById('deals-grid');
const recentGamesGrid = document.getElementById('recent-games-grid');
const androidGamesGrid = document.getElementById('android-games-grid');

function renderAndroidGamesSection(allGames) {
    if (!androidGamesGrid) return;
    const androidGames = (Array.isArray(allGames) ? allGames : []).filter(isAndroidGame);
    androidGamesGrid.innerHTML = '';
    if (androidGames.length === 0) {
        androidGamesGrid.innerHTML = `
            <div class="android-empty-card">
                <div style="display:flex; align-items:center; gap:14px; min-width:240px; flex:1;">
                    <div style="width:48px; height:48px; border-radius:12px; background:rgba(61,220,132,0.14); border:1px solid rgba(61,220,132,0.4); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        <i class="fab fa-android" style="color:#3ddc84; font-size:1.6rem;"></i>
                    </div>
                    <div>
                        <div style="font-weight:900; color:white; font-size:1rem; margin-bottom:3px;">Sezione Mobile Android pronta per i primi titoli!</div>
                        <div style="font-size:0.84rem; color:#94a3b8;">Sei uno sviluppatore Android? Carica il tuo videogioco in formato <strong>.APK</strong> (o <strong>.XAPK/.ZIP</strong>) direttamente dal tuo pannello Creator.</div>
                    </div>
                </div>
                <a href="account.html?tab=publish&platform=android" class="btn btn-prime" style="text-decoration:none; background:linear-gradient(135deg, #16a34a, #22c55e); border:none; color:#04120a; font-weight:800; white-space:nowrap;">
                    <i class="fas fa-upload"></i> Carica il primo APK
                </a>
            </div>
        `;
        return;
    }
    androidGames.forEach((game) => {
        androidGamesGrid.appendChild(createGameCard(game));
    });
}

let globalAllGames = [];
let lastVisibleGameDoc = null;
const PAGE_SIZE = 12;
const loadMoreBtn = document.getElementById('load-more-btn');

const fetchNextGamesPage = async () => {
  if (!gameList) return;
  if (loadMoreBtn) {
    loadMoreBtn.disabled = true;
    loadMoreBtn.innerText = 'Caricamento...';
  }
  
  try {
    const { games, lastVisible } = await getGamesPaged(PAGE_SIZE, lastVisibleGameDoc);
    
    // Process image URLs
    games.forEach(game => {
        if (!game.imageUrl) {
            const headerSrc = (game.header && game.header.type === 'image') ? game.header.src : (game.gallery && game.gallery[0] ? game.gallery[0].src : '');
            game.imageUrl = headerSrc || '/images/placeholder.png';
        }
    });

    if (games.length === 0 && !lastVisibleGameDoc) {
      gameList.innerHTML = '<div class="loading">Nessun gioco disponibile.</div>';
      loadMoreBtn?.classList.add('hidden');
      return;
    }

    games.forEach(game => {
      gameList.appendChild(createGameCard(game));
    });

    lastVisibleGameDoc = lastVisible;

    if (games.length < PAGE_SIZE || !lastVisible) {
      loadMoreBtn?.classList.add('hidden');
    } else {
      loadMoreBtn?.classList.remove('hidden');
      loadMoreBtn.innerText = 'Carica Altri';
      loadMoreBtn.disabled = false;
    }
  } catch (err) {
    console.error("Paged load error:", err);
  }
};

if (loadMoreBtn) {
  loadMoreBtn.onclick = fetchNextGamesPage;
}

const loadGames = async () => {
  const containers = [newsGrid, bestsellersGrid, dealsGrid, recentGamesGrid].filter(c => c !== null);
  containers.forEach(c => c.innerHTML = '<div class="loading">Caricamento...</div>');
  
  if (gameList) {
    gameList.innerHTML = '<div class="loading">Caricamento...</div>';
  }
  
  let allGames = [];
  try {
    allGames = await getGames();
    // Ensure all games have a proper imageUrl
    allGames.forEach(game => {
        if (!game.imageUrl) {
            const headerSrc = (game.header && game.header.type === 'image') ? game.header.src : (game.gallery && game.gallery[0] ? game.gallery[0].src : '');
            game.imageUrl = headerSrc || '/images/placeholder.png';
        }
        });
        globalAllGames = allGames;
  } catch (e) {
    console.error("DB load error", e);
  }
  
  if (allGames.length === 0) {
    containers.forEach(c => c.innerHTML = '<div class="loading">Nessun gioco disponibile.</div>');
    if (gameList) gameList.innerHTML = '<div class="loading">Nessun gioco disponibile.</div>';
    return;
  }

  // Clear loaders
  containers.forEach(c => c.innerHTML = '');

  // Populate Recently Added specifically (First 20 from DB, already sorted by createdAt desc)
  if (recentGamesGrid) {
      allGames.slice(0, 20).forEach(game => {
          const card = createGameCard(game);
          recentGamesGrid.appendChild(card);
      });
  }

  // Load official news cards instead of games
  loadNewsFeed();

  // Distribute all games across other sections
  allGames.forEach((game, index) => {

    // 3. I più venduti (Simulated)
    if (bestsellersGrid && index % 2 === 0) bestsellersGrid.appendChild(createGameCard(game));

    // 4. Offerte (Simulated)
    if (dealsGrid && game.price < 15 || game.price === 'FREE') dealsGrid.appendChild(createGameCard(game));
  });

  // Now, load the main gameList paged
  if (gameList) {
    gameList.innerHTML = '';
    lastVisibleGameDoc = null;
    allGames.slice(0, PAGE_SIZE).forEach(game => gameList.appendChild(createGameCard(game)));
    renderAndroidGamesSection(allGames);
    renderTopCreatorsLeaderboard(allGames);
    renderFollowedUpdatesBanner(allGames);
    updateWishlistBadgeUI();
    loadMoreBtn?.classList.add('hidden');
  }

  // Cleanup empty grids
  containers.forEach(c => {
    if (c.innerHTML === '') c.innerHTML = '<div class="loading">In arrivo...</div>';
  });

  // Dynamic details links for Alchemist, Rogue Like, and Serpe
  const alchemist = allGames.find(g => g.title && (g.title.toLowerCase().includes('alchemist') || g.title.toLowerCase().includes('alchemyst')));
  if (alchemist) {
      const heroBtn = document.getElementById('hero-btn');
      if (heroBtn) {
          heroBtn.href = `${import.meta.env.BASE_URL}game.html?id=${alchemist.id}`;
      }
      const heroImg = document.getElementById('hero-main-img');
      if (heroImg) {
          const alchemistHeroImg = alchemist.header?.src || alchemist.imageUrl;
          heroImg.src = getAssetUrl(alchemistHeroImg);
          heroImg.style.cursor = 'pointer';
          heroImg.onclick = () => {
              window.location.href = `${import.meta.env.BASE_URL}game.html?id=${alchemist.id}`;
          };
      }
      const heroTitle = document.getElementById('hero-main-title');
      if (heroTitle) {
          heroTitle.innerText = alchemist.title.toUpperCase();
      }
      const heroDesc = document.getElementById('hero-main-desc');
      if (heroDesc && alchemist.desc) {
          heroDesc.innerText = alchemist.desc;
      }
  }

  const rogueLike = allGames.find(g => g.title && (g.title.toLowerCase().includes('rogue') || g.title.toLowerCase().includes('rougue')));
  if (rogueLike) {
      const rogueEl = document.getElementById('hero-side-1');
      if (rogueEl) {
          rogueEl.style.cursor = 'pointer';
          rogueEl.onclick = () => {
              window.location.href = `${import.meta.env.BASE_URL}game.html?id=${rogueLike.id}`;
          };
          const img = rogueEl.querySelector('img');
          if (img) {
              const rogueLikeHeroImg = rogueLike.header?.src || rogueLike.imageUrl || (rogueLike.gallery && rogueLike.gallery[0]?.src);
              img.src = getAssetUrl(rogueLikeHeroImg);
          }
          const title = document.getElementById('hero-side-title-1');
          if (title) {
              title.innerText = rogueLike.title;
          }
      }
  }

  const serpe = allGames.find(g => g.title && g.title.toLowerCase().includes('serpe'));
  if (serpe) {
      const serpeEl = document.getElementById('hero-side-2');
      if (serpeEl) {
          serpeEl.style.cursor = 'pointer';
          serpeEl.onclick = () => {
              window.location.href = `${import.meta.env.BASE_URL}game.html?id=${serpe.id}`;
          };
          const img = serpeEl.querySelector('img');
          if (img) {
              const serpeHeroImg = serpe.header?.src || serpe.imageUrl || (serpe.gallery && serpe.gallery[0]?.src);
              img.src = getAssetUrl(serpeHeroImg);
          }
          const title = document.getElementById('hero-side-title-2');
          if (title) {
              title.innerText = serpe.title;
          }
      }
  }
};

// State Subscription
subscribeToAuthChanges(async (user) => {
  renderCommunityBoardSection(getPaymentConfig().communityBoardEnabled !== false);
  const sellLink = document.getElementById('sell-link');
  if (user) {
    loginBtn.classList.add('hidden');
    registerBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
    userDisplay.classList.remove('hidden');
    
    // Fetch additional user data from Firestore
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (isVipSellerEmail(user.email)) userData.isSeller = true;
        const canSell = isVipSellerEmail(user.email) || hasValidPartitaIva(userData.piva);
        userDisplay.innerText = `${userData.firstName || 'Utente'} ${userData.lastName || ''} ${canSell ? '(Venditore)' : '(Creator)'}`.trim();
        sellLink?.classList.remove('hidden');
      } else {
        const safeNick = user.displayName || (user.email ? user.email.split('@')[0] : 'Utente');
        userDisplay.innerText = safeNick;
        sellLink?.classList.remove('hidden');
      }
    } catch (e) {
      console.error("Error fetching user profile:", e);
      const safeNick = user.displayName || (user.email ? user.email.split('@')[0] : 'Utente');
      userDisplay.innerText = safeNick;
      sellLink?.classList.remove('hidden');
    }
    
  } else {
    loginBtn.classList.remove('hidden');
    registerBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    userDisplay.classList.add('hidden');
    userDisplay.innerText = '';
    sellLink?.classList.add('hidden');
  }
});

// Initial Load
loadGames();

// Drag-to-scroll implementation for all horizontal rows
const initDragToScroll = (slider) => {
  if (!slider) return;
  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;
  let isDragging = false;

  slider.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDown = true;
    isDragging = false;
    slider.classList.add('active-drag');
    startX = e.pageX - slider.offsetLeft;
    scrollLeft = slider.scrollLeft;
  });
  
  slider.addEventListener('mouseleave', () => {
    isDown = false;
    slider.classList.remove('active-drag');
  });
  
  slider.addEventListener('mouseup', () => {
    isDown = false;
    slider.classList.remove('active-drag');
    setTimeout(() => { isDragging = false; }, 50);
  });
  
  slider.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - slider.offsetLeft;
    const walk = (x - startX) * 1.8;
    if (Math.abs(walk) > 5) isDragging = true;
    slider.scrollLeft = scrollLeft - walk;
  });

  slider.addEventListener('click', (e) => {
    if (isDragging) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
};

// Initialize drag-to-scroll on all horizontal lists
const initAllScrollContainers = () => {
  const containers = document.querySelectorAll('.genre-row, .game-row, #news-grid, #recent-games-grid, #bestsellers-grid, #deals-grid, .hero-split');
  containers.forEach(initDragToScroll);
};
initAllScrollContainers();

// Hero Carousel Controller (Touch Swiping, Dots, and Auto-Rotation)
const initHeroCarousel = () => {
  const heroSlider = document.querySelector('.hero-split');
  const dots = document.querySelectorAll('.hero-dots .dot');
  if (!heroSlider) return;

  let currentSlide = 0;
  const totalSlides = 3;
  let autoSlideTimer = null;
  let touchStartX = 0;
  let touchEndX = 0;

  const getSlideWidth = () => heroSlider.offsetWidth || window.innerWidth;

  const goToSlide = (index, smooth = true) => {
    currentSlide = (index + totalSlides) % totalSlides;
    const width = getSlideWidth();
    heroSlider.scrollTo({
      left: currentSlide * width,
      behavior: smooth ? 'smooth' : 'auto'
    });
    updateDots(currentSlide);
  };

  const updateDots = (index) => {
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
  };

  // Sync dots with manual scrolling
  heroSlider.addEventListener('scroll', () => {
    const width = getSlideWidth();
    if (width > 0) {
      const activeIdx = Math.round(heroSlider.scrollLeft / width);
      updateDots(activeIdx);
      currentSlide = activeIdx;
    }
  }, { passive: true });

  // Dot click handlers
  dots.forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      const index = parseInt(dot.getAttribute('data-index'), 10);
      goToSlide(index);
      resetAutoSlide();
    });
  });

  // Touch Swipe gestures for mobile
  heroSlider.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    stopAutoSlide();
  }, { passive: true });

  heroSlider.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
    startAutoSlide();
  }, { passive: true });

  const handleSwipe = () => {
    const swipeDistance = touchEndX - touchStartX;
    if (Math.abs(swipeDistance) > 40) {
      if (swipeDistance < 0) {
        goToSlide(currentSlide + 1);
      } else {
        goToSlide(currentSlide - 1);
      }
    }
  };

  // Auto rotation timer (only on small screens <= 900px)
  const startAutoSlide = () => {
    stopAutoSlide();
    if (window.innerWidth <= 900) {
      autoSlideTimer = setInterval(() => {
        goToSlide(currentSlide + 1);
      }, 5000);
    }
  };

  const stopAutoSlide = () => {
    if (autoSlideTimer) {
      clearInterval(autoSlideTimer);
      autoSlideTimer = null;
    }
  };

  const resetAutoSlide = () => {
    stopAutoSlide();
    startAutoSlide();
  };

  heroSlider.addEventListener('mouseenter', stopAutoSlide);
  heroSlider.addEventListener('mouseleave', startAutoSlide);

  // Initialize
  startAutoSlide();
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) stopAutoSlide();
    else startAutoSlide();
  });
};

initHeroCarousel();

// ============================================================================
// UNIFIED CATEGORIES, SCROLL ARROWS, ADVANCED FILTERS, WISHLIST & CREATORS
// ============================================================================
const catalogFilterState = {
  genreKey: 'all',
  genreLabel: '',
  price: 'all',
  platform: 'all',
  sort: 'recent',
  wishlistOnly: false,
  search: ''
};

function updateWishlistBadgeUI() {
  const badge = document.getElementById('wishlist-count-badge');
  if (badge) badge.textContent = String(getWishlist().length);
}
window.addEventListener('indieplay:wishlistchange', () => {
  updateWishlistBadgeUI();
  if (catalogFilterState.wishlistOnly) applyCatalogFilters();
});

function renderFollowedUpdatesBanner(allGames) {
  const banner = document.getElementById('followed-updates-banner');
  if (!banner) return;
  const fresh = getNewGamesFromFollowedCreators(allGames);
  if (!fresh.length) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  banner.innerHTML = `<i class="fas fa-bell"></i> ${fresh.length} nuov${fresh.length === 1 ? 'o titolo' : 'i titoli'} dai creatori che segui!`;
  banner.onclick = () => {
    markFollowedGamesSeen(fresh.map((g) => g.id));
    banner.classList.add('hidden');
    if (gameList) {
      gameList.classList.add('filtered-grid-mode');
      gameList.innerHTML = '';
      fresh.forEach((g) => gameList.appendChild(createGameCard(g)));
      const heading = document.getElementById('main-catalog-heading');
      if (heading) heading.textContent = 'Novità dai Creatori che Segui';
    }
  };
}

function renderTopCreatorsLeaderboard(allGames) {
  const grid = document.getElementById('top-creators-grid');
  if (!grid || !Array.isArray(allGames)) return;

  const creatorMap = new Map();
  allGames.forEach((g) => {
    const name = String(g.developer || g.author || 'IndiePlay').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!creatorMap.has(key)) {
      creatorMap.set(key, { name, uid: g.sellerId || g.authorUid || g.userId || '', games: [], score: 0 });
    }
    const entry = creatorMap.get(key);
    if (!entry.uid && (g.sellerId || g.authorUid || g.userId)) entry.uid = g.sellerId || g.authorUid || g.userId;
    entry.games.push(g);
    entry.score += 10 + Number(g.downloads || 0) + Number(g.likes || 0) * 2 + Number(g.rating || 4.5) * 3;
  });

  const ranked = Array.from(creatorMap.values())
    .sort((a, b) => b.games.length - a.games.length || b.score - a.score)
    .slice(0, 6);

  if (!ranked.length) {
    grid.innerHTML = '<div class="loading">Nessun creatore ancora in classifica.</div>';
    return;
  }

  const medals = ['🥇', '🥈', '🥉', '⭐', '⭐', '⭐'];
  grid.innerHTML = ranked.map((c, idx) => {
    const href = `${import.meta.env.BASE_URL}showcase.html?${c.uid ? `uid=${encodeURIComponent(c.uid)}&` : ''}dev=${encodeURIComponent(c.name)}`;
    const sampleTitles = c.games.slice(0, 2).map((g) => g.title).filter(Boolean).join(', ');
    const coverImg = getAssetUrl(c.games[0]?.imageUrl || '/images/placeholder.png');
    return `
      <div class="creator-rank-card">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px; min-width:0;">
            <span style="font-size:1.35rem;">${medals[idx] || '⭐'}</span>
            <div style="min-width:0;">
              <div style="font-weight:900; color:white; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${c.name}</div>
              <div style="font-size:0.74rem; color:#38bdf8; font-weight:700;">${c.games.length} ${c.games.length === 1 ? 'titolo pubblicato' : 'titoli pubblicati'}</div>
            </div>
          </div>
          <img src="${coverImg}" alt="${c.name}" style="width:48px; height:36px; object-fit:cover; border-radius:6px; border:1px solid rgba(255,255,255,0.15);" onerror="this.src='/images/placeholder.png'">
        </div>
        <div style="font-size:0.76rem; color:#94a3b8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          <i class="fas fa-gamepad" style="color:#64748b;"></i> ${sampleTitles || 'Giochi Indie'}
        </div>
        <a href="${href}" class="btn btn-prime-outline" style="text-decoration:none; padding:0.48rem 0.85rem; font-size:0.76rem; font-weight:800; justify-content:center; text-align:center;">
          <i class="fas fa-store"></i> Visita Spazio Social &amp; Giochi
        </a>
      </div>
    `;
  }).join('');
}

function applyCatalogFilters() {
  if (!gameList) return;
  const genreMap = {
    'genre_android': ['android', 'mobile', 'apk'],
    'genre_fight': ['picchiaduro', 'fighting'],
    'genre_amiga': ['amiga', 'retro', 'c64', 'commodore'],
    'genre_action': ['azione', 'avventura', 'action', 'adventure'],
    'genre_platform': ['platform', 'piattaforme'],
    'genre_horror': ['horror', 'survival'],
    'genre_puzzle': ['puzzle', 'rompicapo'],
    'genre_rpg': ['gdr', 'rpg', 'ruolo'],
    'genre_fps': ['sparatutto', 'fps', 'shooter'],
    'genre_race': ['corse', 'racing', 'volo'],
    'genre_strategy': ['strategia', 'simulazione', 'strategy', 'simulation'],
    'genre_sport': ['sport', 'sports'],
    'genre_roguelike': ['roguelike', 'roguelite', 'rogue'],
    'genre_cards': ['carte', 'card', 'deckbuilding', 'deck'],
    'genre_family': ['bambini', 'famiglia', 'indie', 'arcade', 'casual']
  };

  const wishSet = new Set(getWishlist());
  let list = [...globalAllGames];

  if (catalogFilterState.genreKey && catalogFilterState.genreKey !== 'all') {
    if (catalogFilterState.genreKey === 'genre_android') {
      list = list.filter((g) => isAndroidGame(g));
    } else {
      const tokens = genreMap[catalogFilterState.genreKey] || [catalogFilterState.genreKey.toLowerCase()];
      list = list.filter((g) => {
        const cat = String(g.category || '').toLowerCase();
        return tokens.some((tk) => cat.includes(tk));
      });
    }
  }

  if (catalogFilterState.price === 'free') {
    list = list.filter((g) => g.price === 'FREE' || g.price === '0' || !g.price || Number(g.price) === 0);
  } else if (catalogFilterState.price === 'paid') {
    list = list.filter((g) => g.price && g.price !== 'FREE' && Number(g.price) > 0);
  }

  if (catalogFilterState.platform !== 'all') {
    const pf = catalogFilterState.platform;
    list = list.filter((g) => {
      const typeStr = String(g.type || '').toLowerCase();
      const platStr = `${g.platform || ''} ${g.platforms || ''} ${g.os || ''} ${g.downloadUrl || ''}`.toLowerCase();
      if (pf === 'web') return typeStr.includes('web') || typeStr.includes('html') || platStr.includes('web') || platStr.includes('browser') || Boolean(g.gameUrl);
      if (pf === 'windows') return platStr.includes('win') || platStr.includes('.exe') || platStr.includes('.zip') || typeStr === 'download';
      if (pf === 'mac') return platStr.includes('mac') || platStr.includes('osx') || platStr.includes('.dmg');
      if (pf === 'linux') {
        const linuxStr = `${platStr} ${g.fileFormat || ''}`.toLowerCase();
        return linuxStr.includes('linux') || linuxStr.includes('.appimage') || linuxStr.includes('.deb') || linuxStr.includes('.tar.gz');
      }
      if (pf === 'android') return isAndroidGame(g);
      if (pf === 'amiga') {
        const amigaStr = `${platStr} ${g.category || ''} ${g.fileFormat || ''}`.toLowerCase();
        return amigaStr.includes('amiga') || amigaStr.includes('.adf') || amigaStr.includes('.lha') || amigaStr.includes('.dms') || amigaStr.includes('.hdf');
      }
      if (pf === 'c64') {
        const c64Str = `${platStr} ${g.category || ''} ${g.fileFormat || ''}`.toLowerCase();
        return c64Str.includes('c64') || c64Str.includes('commodore') || c64Str.includes('.d64') || c64Str.includes('.prg') || c64Str.includes('.crt') || c64Str.includes('.t64') || c64Str.includes('.tap');
      }
      return true;
    });
  }

  if (catalogFilterState.wishlistOnly) {
    list = list.filter((g) => wishSet.has(String(g.id)));
  }

  if (catalogFilterState.search) {
    const q = catalogFilterState.search;
    list = list.filter((g) => {
      const hay = `${g.title || ''} ${g.developer || ''} ${g.author || ''} ${g.category || ''} ${g.desc || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  if (catalogFilterState.sort === 'popular') {
    list.sort((a, b) => (Number(b.downloads || 0) + Number(b.views || 0)) - (Number(a.downloads || 0) + Number(a.views || 0)));
  } else if (catalogFilterState.sort === 'rated') {
    list.sort((a, b) => (Number(b.rating || 0) + Number(b.likes || 0)) - (Number(a.rating || 0) + Number(a.likes || 0)));
  }

  const isAnyFilterActive =
    catalogFilterState.genreKey !== 'all' ||
    catalogFilterState.price !== 'all' ||
    catalogFilterState.platform !== 'all' ||
    catalogFilterState.sort !== 'recent' ||
    catalogFilterState.wishlistOnly ||
    Boolean(catalogFilterState.search);

  const resetBtn = document.getElementById('filter-reset-btn');
  const summaryEl = document.getElementById('catalog-active-summary');
  const headingEl = document.getElementById('main-catalog-heading');

  if (resetBtn) resetBtn.classList.toggle('hidden', !isAnyFilterActive);
  gameList.classList.toggle('filtered-grid-mode', isAnyFilterActive);
  loadMoreBtn?.classList.add('hidden');

  if (headingEl) {
    if (catalogFilterState.wishlistOnly) {
      headingEl.textContent = `❤️ La mia Wishlist (${list.length})`;
    } else if (catalogFilterState.genreLabel && catalogFilterState.genreKey !== 'all') {
      headingEl.textContent = `${catalogFilterState.genreLabel} (${list.length})`;
    } else if (catalogFilterState.search) {
      headingEl.textContent = `Risultati per "${catalogFilterState.search}" (${list.length})`;
    } else {
      const lang = getLanguage();
      const dict = translations[lang] || translations['en'];
      headingEl.textContent = dict.title_added || 'Aggiunti di recente su IndiePlay';
    }
  }

  if (summaryEl) {
    if (isAnyFilterActive) {
      summaryEl.classList.remove('hidden');
      summaryEl.textContent = `Trovati ${list.length} titoli con i filtri selezionati.`;
    } else {
      summaryEl.classList.add('hidden');
    }
  }

  gameList.innerHTML = '';
  if (list.length === 0) {
    gameList.innerHTML = '<div class="loading" style="grid-column:1/-1; padding:2rem;">Nessun gioco corrisponde ai filtri selezionati. Prova ad azzerare i filtri.</div>';
    return;
  }

  (isAnyFilterActive ? list : list.slice(0, PAGE_SIZE)).forEach((game) => {
    gameList.appendChild(createGameCard(game));
  });
}

function initCategoryFilters() {
  const row = document.getElementById('genre-row-scroll') || document.querySelector('.genre-row');
  const leftBtn = document.getElementById('genre-scroll-left');
  const rightBtn = document.getElementById('genre-scroll-right');
  const expandBtn = document.getElementById('genre-expand-btn');
  const cards = document.querySelectorAll('.genre-card');

  if (row && leftBtn && rightBtn) {
    leftBtn.onclick = () => row.scrollBy({ left: -340, behavior: 'smooth' });
    rightBtn.onclick = () => row.scrollBy({ left: 340, behavior: 'smooth' });
    row.addEventListener('wheel', (e) => {
      if (!row.classList.contains('expanded-grid') && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        row.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  if (row && expandBtn) {
    expandBtn.onclick = () => {
      const expanded = row.classList.toggle('expanded-grid');
      expandBtn.classList.toggle('active', expanded);
      expandBtn.innerHTML = expanded ? '<i class="fas fa-compress-alt"></i> Compatta' : '<i class="fas fa-th-large"></i> Tutte';
    };
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      const dataGenre = card.getAttribute('data-genre');
      const span = card.querySelector('span span');
      const i18nKey = span ? span.getAttribute('data-i18n') : null;

      cards.forEach((c) => c.classList.remove('active', 'active-genre'));
      card.classList.add('active', 'active-genre');

      if (dataGenre === 'all' || !i18nKey) {
        catalogFilterState.genreKey = 'all';
        catalogFilterState.genreLabel = '';
      } else {
        catalogFilterState.genreKey = i18nKey;
        catalogFilterState.genreLabel = span.textContent.trim();
      }
      applyCatalogFilters();
    });
  });

  document.querySelectorAll('[data-price]').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('[data-price]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      catalogFilterState.price = btn.getAttribute('data-price') || 'all';
      applyCatalogFilters();
    };
  });

  const platformSel = document.getElementById('filter-platform-select');
  if (platformSel) {
    platformSel.onchange = (e) => {
      catalogFilterState.platform = e.target.value;
      applyCatalogFilters();
    };
  }

  const androidShortcutBtn = document.getElementById('filter-android-shortcut-btn');
  if (androidShortcutBtn) {
    androidShortcutBtn.onclick = () => {
      catalogFilterState.platform = 'android';
      if (platformSel) platformSel.value = 'android';
      applyCatalogFilters();
      document.getElementById('store')?.scrollIntoView({ behavior: 'smooth' });
    };
  }

  const sortSel = document.getElementById('filter-sort-select');
  if (sortSel) {
    sortSel.onchange = (e) => {
      catalogFilterState.sort = e.target.value;
      applyCatalogFilters();
    };
  }

  const wishFilterBtn = document.getElementById('filter-wishlist-btn');
  if (wishFilterBtn) {
    wishFilterBtn.onclick = () => {
      catalogFilterState.wishlistOnly = !catalogFilterState.wishlistOnly;
      wishFilterBtn.classList.toggle('active', catalogFilterState.wishlistOnly);
      applyCatalogFilters();
    };
  }

  const resetBtn = document.getElementById('filter-reset-btn');
  if (resetBtn) {
    resetBtn.onclick = () => {
      catalogFilterState.genreKey = 'all';
      catalogFilterState.genreLabel = '';
      catalogFilterState.price = 'all';
      catalogFilterState.platform = 'all';
      catalogFilterState.sort = 'recent';
      catalogFilterState.wishlistOnly = false;
      catalogFilterState.search = '';
      cards.forEach((c) => c.classList.remove('active', 'active-genre'));
      document.querySelector('.genre-card[data-genre="all"]')?.classList.add('active-genre');
      document.querySelectorAll('[data-price]').forEach((b) => b.classList.toggle('active', b.getAttribute('data-price') === 'all'));
      if (platformSel) platformSel.value = 'all';
      if (sortSel) sortSel.value = 'recent';
      if (wishFilterBtn) wishFilterBtn.classList.remove('active');
      const searchInput = document.querySelector('.search-bar input');
      if (searchInput) searchInput.value = '';
      applyCatalogFilters();
    };
  }
}

function initSearchFilter() {
  const searchInput = document.querySelector('.search-bar input');
  if (!searchInput) return;

  let debounceTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    const query = e.target.value.trim().toLowerCase();
    debounceTimeout = setTimeout(() => {
      catalogFilterState.search = query;
      applyCatalogFilters();
    }, 220);
  });

  const urlParams = new URLSearchParams(window.location.search);
  const searchQuery = urlParams.get('search');
  if (searchQuery) {
    searchInput.value = searchQuery;
    catalogFilterState.search = searchQuery.trim().toLowerCase();
    const checkInterval = setInterval(() => {
      if (globalAllGames && globalAllGames.length > 0) {
        clearInterval(checkInterval);
        applyCatalogFilters();
      }
    }, 100);
  }
}

// Help and About Modals
function initModals() {
  const aboutModal = document.getElementById('about-modal');
  const closeAbout = document.getElementById('close-about');
  const openAboutLinks = document.querySelectorAll('.open-about-link');

  openAboutLinks.forEach(link => {
    link.onclick = (e) => {
      e.preventDefault();
      if (aboutModal) aboutModal.style.display = 'flex';
    };
  });
  if (closeAbout && aboutModal) {
    closeAbout.onclick = () => aboutModal.style.display = 'none';
  }

  const helpModal = document.getElementById('help-modal');
  const closeHelp = document.getElementById('close-help');
  const openHelpLinks = document.querySelectorAll('.open-help-link');
  const helpForm = document.getElementById('help-contact-form');

  openHelpLinks.forEach(link => {
    link.onclick = (e) => {
      e.preventDefault();
      if (helpModal) helpModal.style.display = 'flex';
    };
  });
  if (closeHelp && helpModal) {
    closeHelp.onclick = () => helpModal.style.display = 'none';
  }

  if (helpForm) {
    helpForm.onsubmit = (e) => {
      e.preventDefault();
      showToast('Messaggio inviato con successo! Ti risponderemo presto.', 'success');
      helpForm.reset();
      if (helpModal) helpModal.style.display = 'none';
    };
  }
  
  window.addEventListener('click', (e) => {
    if (e.target === aboutModal) aboutModal.style.display = 'none';
    if (e.target === helpModal) helpModal.style.display = 'none';
  });
}

function loadNewsFeed() {
  if (!newsGrid) return;
  newsGrid.innerHTML = '';

  const news = getPortalNews();

  news.forEach(item => {
    const card = document.createElement('div');
    card.className = 'news-card';
    card.style.cursor = 'pointer';
    card.onclick = () => {
      openPortalNewsReaderModal(item);
    };

    card.innerHTML = `
      <div style="height: 150px; background: url('${getAssetUrl(item.img)}') no-repeat center center; background-size: cover; position: relative;">
        <span style="position: absolute; top: 10px; left: 10px; background: var(--prime-blue); color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700;">${item.badge}</span>
      </div>
      <div style="padding: 1.2rem;">
        <span style="font-size: 0.8rem; color: var(--text-gray); font-weight: 600;">${item.date}</span>
        <h3 style="color: white; font-size: 1.1rem; margin: 5px 0 10px; font-weight: 800; line-height: 1.4;">${item.title}</h3>
        <p style="color: var(--text-gray); font-size: 0.85rem; line-height: 1.5; margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${item.desc}</p>
      </div>
    `;
    newsGrid.appendChild(card);
  });
  initDragToScroll(newsGrid);
  autoTranslateDOM(getLanguage());
}

window.addEventListener('indieplay:portalnewschange', () => {
  loadNewsFeed();
});

// Initialize all features
initCategoryFilters();
initSearchFilter();
initModals();

// Initialize Version Badge, Editorial Magazine & Payments Backend
renderVersionBadge();
initMagazineSystem();
initBackendSystem();
setTimeout(() => translatePage(), 500);

window.addEventListener('indieplay:purchasecomplete', () => {
  loadGames();
});

window.addEventListener('indieplay:langchange', (e) => {
  const lang = e.detail?.lang || getLanguage();
  applyCatalogFilters();
  renderAndroidGamesSection(globalAllGames);
  loadNewsFeed();
  autoTranslateDOM(lang);
});
