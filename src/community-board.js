import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getActiveUser } from './auth';
import { checkRateLimit } from './security';
import { getLanguage, autoTranslateDOM } from './i18n';

const WALL_DOC_ID = 'community_board';
const LOCAL_CACHE_KEY = 'indieplay_community_board_v1';
const ADMIN_EMAILS = ['danielepmp@yahoo.it', 'devindieplay@gmail.com'];

const DEFAULT_PINNED_POST = {
  id: 'welcome_pinned_1',
  pinned: true,
  tag: 'Benvenuto',
  authorName: 'Staff INDIE PLAY X',
  authorEmail: 'devindieplay@gmail.com',
  authorUid: 'STAFF',
  text: 'Benvenuti nella Bacheca della Community di INDIE PLAY X! Scrivi qui i tuoi commenti, consigli per migliorare il portale o suggerimenti sui generi e giochi che vorresti vedere.',
  likes: 1,
  createdAt: '2026-11-20T22:00:00.000Z'
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

function isCurrentUserAdmin(user) {
  if (!user || !user.email) return false;
  return ADMIN_EMAILS.includes(String(user.email).trim().toLowerCase());
}

function showMsg(text, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(text, type);
  } else {
    alert(text);
  }
}

function loadLocalPosts() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [DEFAULT_PINNED_POST];
}

function saveLocalPosts(posts) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(posts));
  } catch {}
}

async function fetchBoardPosts() {
  try {
    const snap = await getDoc(doc(db, 'social_walls', WALL_DOC_ID));
    if (snap.exists() && Array.isArray(snap.data().posts) && snap.data().posts.length > 0) {
      const posts = snap.data().posts;
      saveLocalPosts(posts);
      return posts;
    }
  } catch (err) {
    console.warn('Community board cloud read fallback:', err);
  }
  return loadLocalPosts();
}

async function persistBoardPosts(posts) {
  const cleanPosts = posts.slice(0, 120);
  saveLocalPosts(cleanPosts);
  await setDoc(
    doc(db, 'social_walls', WALL_DOC_ID),
    {
      posts: cleanPosts,
      followersCount: cleanPosts.length,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );
}

const TAG_META = {
  Consiglio: { icon: 'fa-lightbulb', color: '#fbbf24', bg: 'rgba(251,191,36,0.14)', border: 'rgba(251,191,36,0.4)' },
  Commento: { icon: 'fa-comment-dots', color: '#38bdf8', bg: 'rgba(56,189,248,0.14)', border: 'rgba(56,189,248,0.4)' },
  'Richiesta Gioco': { icon: 'fa-gamepad', color: '#c084fc', bg: 'rgba(192,132,252,0.14)', border: 'rgba(192,132,252,0.4)' },
  Feedback: { icon: 'fa-star', color: '#34d399', bg: 'rgba(52,211,153,0.14)', border: 'rgba(52,211,153,0.4)' },
  Benvenuto: { icon: 'fa-thumbtack', color: '#3ddc84', bg: 'rgba(61,220,132,0.14)', border: 'rgba(61,220,132,0.45)' }
};

export async function renderCommunityBoardSection(isEnabled = true) {
  const section = document.getElementById('community-board-section');
  if (!section) return;

  if (!isEnabled) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  const user = getActiveUser();
  const isAdmin = isCurrentUserAdmin(user);
  const posts = await fetchBoardPosts();

  const sortedPosts = [...posts].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  section.innerHTML = `
    <div class="community-board-card">
      <div class="section-header" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:1rem;">
        <div>
          <span style="display:inline-flex; align-items:center; gap:6px; background:rgba(56,189,248,0.14); border:1px solid rgba(56,189,248,0.42); color:#38bdf8; padding:3px 10px; border-radius:999px; font-size:0.72rem; font-weight:900; letter-spacing:0.7px; text-transform:uppercase;">
            <i class="fas fa-comments"></i> COMMUNITY &amp; FEEDBACK
          </span>
          <h2 style="margin:6px 0 0; font-size:1.5rem; font-weight:900; color:white;">Bacheca Commenti &amp; Consigli</h2>
        </div>
        <span style="font-size:0.8rem; color:#94a3b8; font-weight:700;">
          <i class="fas fa-message" style="color:#38bdf8;"></i> ${sortedPosts.length} ${sortedPosts.length === 1 ? 'messaggio' : 'messaggi'}
        </span>
      </div>

      ${
        user
          ? `
        <form id="community-board-form" style="background:rgba(0,5,13,0.45); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:1rem 1.15rem; margin-bottom:1.25rem;">
          <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:0.65rem;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-size:0.78rem; color:#94a3b8; font-weight:700;">Categoria:</span>
              <select id="cb-post-tag" style="padding:6px 10px; background:#0b1320; border:1px solid rgba(255,255,255,0.18); border-radius:8px; color:white; font-size:0.82rem; font-weight:700;">
                <option value="Consiglio">💡 Consiglio</option>
                <option value="Commento">💬 Commento</option>
                <option value="Richiesta Gioco">🎮 Richiesta Gioco</option>
                <option value="Feedback">⭐ Feedback</option>
              </select>
            </div>
            <span id="cb-char-counter" style="font-size:0.75rem; color:#64748b; font-weight:700;">0 / 500</span>
          </div>
          <textarea id="cb-post-text" rows="2" maxlength="500" required placeholder="Lascia un commento, un consiglio o un'idea per la community di INDIE PLAY X..." style="width:100%; padding:10px 12px; background:#090e16; border:1px solid rgba(255,255,255,0.16); border-radius:10px; color:white; font-size:0.88rem; resize:vertical; margin-bottom:0.7rem;"></textarea>
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <span style="font-size:0.76rem; color:#94a3b8;">
              Pubblichi come <strong style="color:#38bdf8;">${escapeHtml(user.displayName || (user.email ? user.email.split('@')[0] : 'Utente'))}</strong>
            </span>
            <button type="submit" id="cb-submit-btn" class="btn btn-prime" style="padding:0.55rem 1.2rem; font-size:0.84rem; font-weight:800;">
              <i class="fas fa-paper-plane"></i> Pubblica in Bacheca
            </button>
          </div>
        </form>
      `
          : `
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; background:rgba(0,168,225,0.08); border:1px solid rgba(0,168,225,0.28); border-radius:12px; padding:0.9rem 1.15rem; margin-bottom:1.25rem;">
          <div style="font-size:0.86rem; color:#cbd5e1;">
            <i class="fas fa-lock" style="color:#38bdf8; margin-right:6px;"></i>
            Vuoi lasciare un commento o un consiglio alla community? <strong>Accedi o registrati gratis</strong> per scrivere in bacheca!
          </div>
          <button type="button" id="cb-login-cta-btn" class="btn btn-prime" style="padding:0.5rem 1.1rem; font-size:0.82rem; font-weight:800; white-space:nowrap;">
            <i class="fas fa-sign-in-alt"></i> Accedi per Scrivere
          </button>
        </div>
      `
      }

      <div id="community-board-list" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(290px, 1fr)); gap:12px; max-height:460px; overflow-y:auto; padding-right:4px;">
        ${sortedPosts
          .map((p) => {
            const tm = TAG_META[p.tag] || TAG_META.Commento;
            const canDelete = isAdmin || (user && p.authorUid && p.authorUid === user.uid);
            return `
            <div class="cb-post-item" style="background:rgba(15,23,38,0.88); border:1px solid ${p.pinned ? 'rgba(61,220,132,0.4)' : 'rgba(255,255,255,0.09)'}; border-radius:12px; padding:0.95rem 1.05rem; display:flex; flex-direction:column; justify-content:space-between; gap:8px;">
              <div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; margin-bottom:6px;">
                  <span style="display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:900; background:${tm.bg}; border:1px solid ${tm.border}; color:${tm.color};">
                    <i class="fas ${tm.icon}"></i> ${escapeHtml(p.tag || 'Commento')}
                  </span>
                  <span style="font-size:0.7rem; color:#64748b;">${escapeHtml(formatDate(p.createdAt))}</span>
                </div>
                <p style="margin:0; font-size:0.86rem; color:#e2e8f0; line-height:1.5; white-space:pre-wrap; word-break:break-word;">${escapeHtml(p.text)}</p>
              </div>
              <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.06);">
                <span style="font-size:0.76rem; color:#94a3b8; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  <i class="fas fa-user-circle" style="color:#38bdf8;"></i> ${escapeHtml(p.authorName || 'Utente')}
                </span>
                <div style="display:flex; align-items:center; gap:6px;">
                  <button type="button" class="cb-like-btn" data-id="${escapeHtml(p.id)}" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.12); color:#cbd5e1; border-radius:999px; padding:3px 9px; font-size:0.74rem; font-weight:800; cursor:pointer;">
                    <i class="fas fa-thumbs-up" style="color:#38bdf8;"></i> ${Number(p.likes || 0)}
                  </button>
                  ${
                    canDelete
                      ? `<button type="button" class="cb-delete-btn" data-id="${escapeHtml(p.id)}" title="Elimina messaggio" style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.35); color:#f87171; border-radius:999px; padding:3px 8px; font-size:0.72rem; cursor:pointer;"><i class="fas fa-trash"></i></button>`
                      : ''
                  }
                </div>
              </div>
            </div>
          `;
          })
          .join('')}
      </div>
    </div>
  `;

  // Login CTA
  const loginCta = document.getElementById('cb-login-cta-btn');
  if (loginCta) {
    loginCta.onclick = () => {
      const loginModal = document.getElementById('login-modal');
      if (loginModal) loginModal.style.display = 'flex';
      else window.location.href = 'account.html';
    };
  }

  // Char counter
  const textInput = document.getElementById('cb-post-text');
  const charCounter = document.getElementById('cb-char-counter');
  if (textInput && charCounter) {
    textInput.oninput = () => {
      charCounter.textContent = `${textInput.value.length} / 500`;
    };
  }

  // Submit new comment
  const form = document.getElementById('community-board-form');
  if (form && user) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const rl = checkRateLimit('community_board_post', 2, 60000);
      if (!rl.allowed) {
        showMsg('Attendi qualche secondo prima di inviare un altro messaggio in bacheca.', 'error');
        return;
      }
      const text = (document.getElementById('cb-post-text')?.value || '').trim();
      const tag = document.getElementById('cb-post-tag')?.value || 'Commento';
      if (!text || text.length < 2) return;

      const btn = document.getElementById('cb-submit-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Invio...';
      }
      try {
        const latest = await fetchBoardPosts();
        const authorName = user.displayName || (user.email ? user.email.split('@')[0] : 'Utente IndiePlay');
        const newPost = {
          id: 'cb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          pinned: false,
          tag,
          authorName,
          authorEmail: user.email || '',
          authorUid: user.uid,
          text,
          likes: 0,
          createdAt: new Date().toISOString()
        };
        await persistBoardPosts([newPost, ...latest]);
        showMsg('Messaggio pubblicato in bacheca!', 'success');
        await renderCommunityBoardSection(true);
      } catch (err) {
        console.error('Community board post error:', err);
        showMsg('Errore durante la pubblicazione: ' + (err.message || 'riprova'), 'error');
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-paper-plane"></i> Pubblica in Bacheca';
        }
      }
    };
  }

  // Like buttons
  section.querySelectorAll('.cb-like-btn').forEach((btn) => {
    btn.onclick = async () => {
      const postId = btn.getAttribute('data-id');
      const likedKey = 'indieplay_cb_liked_' + postId;
      if (localStorage.getItem(likedKey)) {
        showMsg('Hai già messo Mi piace a questo messaggio!', 'info');
        return;
      }
      try {
        const latest = await fetchBoardPosts();
        const updated = latest.map((p) => (p.id === postId ? { ...p, likes: (Number(p.likes) || 0) + 1 } : p));
        localStorage.setItem(likedKey, '1');
        await persistBoardPosts(updated);
        await renderCommunityBoardSection(true);
      } catch (err) {
        console.warn('Like error:', err);
      }
    };
  });

  // Delete buttons
  section.querySelectorAll('.cb-delete-btn').forEach((btn) => {
    btn.onclick = async () => {
      const postId = btn.getAttribute('data-id');
      if (!confirm('Vuoi eliminare questo messaggio dalla bacheca?')) return;
      try {
        const latest = await fetchBoardPosts();
        const updated = latest.filter((p) => p.id !== postId);
        await persistBoardPosts(updated.length ? updated : [DEFAULT_PINNED_POST]);
        showMsg('Messaggio rimosso dalla bacheca.', 'success');
        await renderCommunityBoardSection(true);
      } catch (err) {
        showMsg('Errore eliminazione: ' + err.message, 'error');
      }
    };
  });

  autoTranslateDOM(getLanguage());
}
