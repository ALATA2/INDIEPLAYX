import { registerUser, loginUser, logoutUser, subscribeToAuthChanges, loginWithGoogle } from './src/auth';
import { getGames, getGamesPaged } from './src/store';
import { db, auth } from './src/firebase';
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { initLanguageSelectors, translations, getLanguage } from './src/i18n';

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
    const itRegex = /^IT\d{2}[A-Z]\d{10}[A-Z0-9]{12}$/;
    if (!itRegex.test(iban)) return false;
  } else {
    if (iban.length < 15 || iban.length > 34) return false;
    const genericRegex = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
    if (!genericRegex.test(iban)) return false;
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
  const piva = document.getElementById('register-piva').value;
  const iban = document.getElementById('register-iban').value;

  if (pass !== confirmPass) {
    window.showToast('Le password inserite non coincidono!', 'error');
    return;
  }

  if (isSeller) {
    if (!piva || !validateCForPIVA(piva)) {
      window.showToast('Codice Fiscale o Partita IVA non valido! Inserisci un Codice Fiscale di 16 caratteri o una P.IVA di 11 cifre.', 'error');
      return;
    }
    if (!iban || !validateIBAN(iban)) {
      window.showToast('IBAN non valido! Inserisci un formato IBAN corretto (es: IT00...).', 'error');
      return;
    }
  }

  const userData = {
    firstName: name,
    lastName: surname,
    age: parseInt(age),
    isSeller: isSeller,
    role: isSeller ? 'seller' : 'user',
    verified: false // Email verification state
  };

  if (isSeller) {
    userData.piva = piva.trim().toUpperCase();
    userData.iban = iban.replace(/\s+/g, '').toUpperCase();
  }

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
    card.innerHTML = `
        <img src="${imgUrl}" alt="${game.title}" onerror="this.onerror=null; this.src='${placeholderUrl}'">
        <div class="card-info">
            <span class="prime-tag" style="color: #00a8e1; font-weight: bold; font-size: 0.8rem;">${includedTag}</span>
            <h3>${game.title}</h3>
            <div class="price">${game.price === 'FREE' ? 'GRATIS' : '€' + game.price}</div>
        </div>
    `;
    return card;
}

const newsGrid = document.getElementById('news-grid');
const bestsellersGrid = document.getElementById('bestsellers-grid');
const dealsGrid = document.getElementById('deals-grid');
const recentGamesGrid = document.getElementById('recent-games-grid');

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
    await fetchNextGamesPage();
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
        userDisplay.innerText = `${userData.firstName} ${userData.lastName} ${userData.isSeller ? '(Venditore)' : ''}`;
        if (userData.isSeller) {
          sellLink?.classList.remove('hidden');
        } else {
          sellLink?.classList.add('hidden');
        }
      } else {
        userDisplay.innerText = user.email;
        sellLink?.classList.add('hidden');
      }
    } catch (e) {
      console.error("Error fetching user profile:", e);
      userDisplay.innerText = user.email;
      sellLink?.classList.add('hidden');
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

// Category filtering
function initCategoryFilters() {
  const cards = document.querySelectorAll('.genre-card');
  const gameGridHeader = document.querySelector('.game-section .section-header h2');
  
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const span = card.querySelector('span span');
      if (!span) return;
      const i18nKey = span.getAttribute('data-i18n');
      
      const wasActive = card.classList.contains('active');
      cards.forEach(c => c.classList.remove('active'));
      
      if (wasActive) {
        // Deselect category, show all games
        if (gameGridHeader) {
            const lang = getLanguage();
            const dict = translations[lang] || translations['en'];
            gameGridHeader.textContent = dict.title_added || "Aggiunti di recente su IndiePlay";
        }
        resetStoreGrid();
      } else {
        card.classList.add('active');
        const categoryName = span.textContent.trim();
        if (gameGridHeader) {
            gameGridHeader.textContent = categoryName;
        }
        filterGamesByCategory(i18nKey);
      }
    });
  });
}

function filterGamesByCategory(i18nKey) {
  if (!gameList) return;
  gameList.innerHTML = '';
  loadMoreBtn?.classList.add('hidden');

  const map = {
    'genre_fight': ['Picchiaduro'],
    'genre_amiga': ['Amiga'],
    'genre_action': ['Azione', 'Avventura'],
    'genre_platform': ['Platform'],
    'genre_horror': ['Horror'],
    'genre_puzzle': ['Puzzle'],
    'genre_rpg': ['GDR'],
    'genre_fps': ['Sparatutto'],
    'genre_race': ['Corse'],
    'genre_strategy': ['Strategia', 'Simulazione'],
    'genre_sport': ['Sport'],
    'genre_family': ['Bambini e Famiglia', 'Indie', 'Carte']
  };

  const targetCategories = map[i18nKey] || [];
  const filtered = globalAllGames.filter(g => targetCategories.includes(g.category));

  if (filtered.length === 0) {
    gameList.innerHTML = '<div class="loading">Nessun gioco trovato in questa categoria.</div>';
    return;
  }

  filtered.forEach(game => {
    gameList.appendChild(createGameCard(game));
  });
}

async function resetStoreGrid() {
  if (!gameList) return;
  gameList.innerHTML = '';
  lastVisibleGameDoc = null;
  await fetchNextGamesPage();
}

// Global Search functionality
function initSearchFilter() {
  const searchInput = document.querySelector('.search-bar input');
  if (!searchInput) return;

  let debounceTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimeout);
    const query = e.target.value.trim().toLowerCase();

    debounceTimeout = setTimeout(() => {
      executeSearch(query);
    }, 300);
  });

  // Check for search parameter in URL
  const urlParams = new URLSearchParams(window.location.search);
  const searchQuery = urlParams.get('search');
  if (searchQuery) {
    searchInput.value = searchQuery;
    const checkInterval = setInterval(() => {
      if (globalAllGames && globalAllGames.length > 0) {
        clearInterval(checkInterval);
        executeSearch(searchQuery.trim().toLowerCase());
      }
    }, 100);
  }
}

function executeSearch(query) {
  if (!gameList) return;
  
  if (!query) {
    resetStoreGrid();
    return;
  }

  gameList.innerHTML = '';
  loadMoreBtn?.classList.add('hidden');

  const filtered = globalAllGames.filter(g => {
    const title = (g.title || '').toLowerCase();
    const dev = (g.developer || '').toLowerCase();
    const cat = (g.category || '').toLowerCase();
    return title.includes(query) || dev.includes(query) || cat.includes(query);
  });

  if (filtered.length === 0) {
    gameList.innerHTML = '<div class="loading">Nessun risultato trovato per la tua ricerca.</div>';
    return;
  }

  filtered.forEach(game => {
    gameList.appendChild(createGameCard(game));
  });
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
  
  const news = [
    {
      title: "Rilascio Feature: Le Vetrine Sviluppatore!",
      desc: "Ora i venditori possono personalizzare la propria pagina social con descrizione, prodotti e accessori di merchandising ufficiale.",
      date: "31 Agosto 2026",
      badge: "NUOVA FEATURE",
      img: "/images/merch_neon_samurai_poster.png"
    },
    {
      title: "Accordo Strategico con NeonLabs",
      desc: "NeonLabs pubblicherà in esclusiva temporale i suoi prossimi titoli arcade e picchiaduro retrò su IndiePlay-X.",
      date: "28 Agosto 2026",
      badge: "PARTNERSHIP",
      img: "/images/neon_samurai_screenshot_1_1777200476248.png"
    },
    {
      title: "Sicurezza dei Pagamenti e Transazioni",
      desc: "Abbiamo integrato nuovi sistemi di cifratura end-to-end per proteggere gli acquisti e l'inserimento dei metodi di pagamento.",
      date: "25 Agosto 2026",
      badge: "SICUREZZA",
      img: "/images/merch_tshirt_mockup_1787498735596.png"
    }
  ];

  news.forEach(item => {
    const card = document.createElement('div');
    card.className = 'news-card';
    
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
}

// Initialize all features
initCategoryFilters();
initSearchFilter();
initModals();
