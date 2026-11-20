import { db } from './firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { getActiveUser, loginWithGoogle } from './auth';
import { getLanguage, translations } from './i18n';

const SUPPORT_ADMIN_UID = 'SUPPORT_ADMIN';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(val) {
  if (!val) return '';
  try {
    const d = val?.toDate ? val.toDate() : new Date(val);
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

function showMsg(text, type = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(text, type);
  } else {
    alert(text);
  }
}

// ============================================================================
// 1. USER-FACING SUPPORT MODAL (Footer Button -> Send Message & Read Replies)
// ============================================================================
function ensureSupportModalDOM() {
  if (document.getElementById('indieplay-support-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'indieplay-support-modal';
  modal.className = 'lightbox';
  modal.style.cssText =
    'display:none; justify-content:center; align-items:center; z-index:2600; position:fixed; inset:0; background:rgba(0,5,13,0.82); backdrop-filter:blur(8px); padding:16px;';

  modal.innerHTML = `
    <div class="modal-content glass" style="background:rgba(15,23,38,0.98); border:1px solid rgba(56,189,248,0.35); border-radius:18px; padding:1.8rem 2rem; max-width:600px; width:100%; max-height:88vh; overflow-y:auto; color:white; position:relative; box-shadow:0 24px 60px rgba(0,0,0,0.75);">
      <span id="close-support-modal" style="position:absolute; top:14px; right:18px; font-size:2rem; line-height:1; cursor:pointer; color:#94a3b8;">&times;</span>
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:1.1rem;">
        <div style="width:46px; height:46px; border-radius:12px; background:rgba(0,168,225,0.16); border:1px solid rgba(56,189,248,0.45); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <i class="fas fa-headset" style="color:#38bdf8; font-size:1.35rem;"></i>
        </div>
        <div>
          <h2 id="support-modal-title" style="margin:0; font-size:1.35rem; font-weight:900; color:white;">Assistenza &amp; Supporto</h2>
          <span id="support-modal-subtitle" style="font-size:0.8rem; color:#94a3b8;">Invia un messaggio diretto allo staff di INDIE PLAY X</span>
        </div>
      </div>

      <div id="support-modal-body"></div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => {
    modal.style.display = 'none';
  };
  document.getElementById('close-support-modal').onclick = closeModal;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

async function renderSupportModalContent() {
  const body = document.getElementById('support-modal-body');
  if (!body) return;
  const user = getActiveUser();
  const lang = getLanguage();
  const dict = translations[lang] || translations.en || translations.it;

  const titleEl = document.getElementById('support-modal-title');
  const subEl = document.getElementById('support-modal-subtitle');
  if (titleEl && dict.support_title) titleEl.textContent = dict.support_title;
  if (subEl && dict.support_subtitle) subEl.textContent = dict.support_subtitle;

  if (!user) {
    body.innerHTML = `
      <div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.4); border-radius:12px; padding:1.25rem; text-align:center;">
        <i class="fas fa-lock" style="font-size:1.8rem; color:#fbbf24; margin-bottom:10px; display:block;"></i>
        <p style="margin:0 0 1rem; font-size:0.92rem; color:#e2e8f0; line-height:1.5;">
          ${escapeHtml(dict.support_login_required || 'Per inviare un messaggio all\'assistenza e ricevere una risposta diretta nel tuo account, effettua prima l\'accesso o registrati.')}
        </p>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
          <button type="button" id="support-trigger-login" class="btn btn-prime" style="padding:0.7rem 1.4rem; font-weight:800;">
            <i class="fas fa-sign-in-alt"></i> ${escapeHtml(dict.nav_login || 'Accedi')}
          </button>
          <a href="account.html" class="btn btn-prime-outline" style="text-decoration:none; padding:0.7rem 1.4rem; font-weight:700;">
            <i class="fas fa-user-plus"></i> ${escapeHtml(dict.nav_register || 'Registrati')}
          </a>
        </div>
      </div>
    `;
    const loginTrigger = document.getElementById('support-trigger-login');
    if (loginTrigger) {
      loginTrigger.onclick = () => {
        document.getElementById('indieplay-support-modal').style.display = 'none';
        const loginModal = document.getElementById('login-modal');
        if (loginModal) loginModal.style.display = 'flex';
        else window.location.href = 'index.html';
      };
    }
    return;
  }

  const senderName = user.displayName || (user.email ? user.email.split('@')[0] : 'Utente');

  body.innerHTML = `
    <form id="support-ticket-form" style="display:flex; flex-direction:column; gap:0.85rem;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
        <div>
          <label style="display:block; font-size:0.76rem; font-weight:800; color:#94a3b8; margin-bottom:4px;">${escapeHtml(dict.support_category_label || 'Argomento')}</label>
          <select id="support-category" style="width:100%; padding:10px 12px; background:#0b1320; border:1px solid rgba(255,255,255,0.16); border-radius:8px; color:white; font-size:0.88rem;">
            <option value="Supporto Tecnico">Supporto Tecnico</option>
            <option value="Account & Accesso">Account &amp; Accesso</option>
            <option value="Pubblicazione Giochi">Pubblicazione Giochi</option>
            <option value="Pagamenti & Acquisti">Pagamenti &amp; Acquisti</option>
            <option value="Segnalazione / Altro">Segnalazione / Altro</option>
          </select>
        </div>
        <div>
          <label style="display:block; font-size:0.76rem; font-weight:800; color:#94a3b8; margin-bottom:4px;">${escapeHtml(dict.support_subject_label || 'Oggetto')}</label>
          <input type="text" id="support-subject" required maxlength="140" placeholder="Es: Problema con il download..." style="width:100%; padding:10px 12px; background:#0b1320; border:1px solid rgba(255,255,255,0.16); border-radius:8px; color:white; font-size:0.88rem;">
        </div>
      </div>

      <div>
        <label style="display:block; font-size:0.76rem; font-weight:800; color:#94a3b8; margin-bottom:4px;">${escapeHtml(dict.support_message_label || 'Messaggio')}</label>
        <textarea id="support-message" rows="4" required maxlength="3500" placeholder="Scrivi qui la tua richiesta in dettaglio..." style="width:100%; padding:11px 12px; background:#0b1320; border:1px solid rgba(255,255,255,0.16); border-radius:8px; color:white; font-size:0.9rem; resize:vertical;"></textarea>
      </div>

      <button type="submit" id="support-submit-btn" class="btn btn-prime" style="padding:0.85rem 1.4rem; font-weight:900; justify-content:center;">
        <i class="fas fa-paper-plane"></i> ${escapeHtml(dict.support_send_btn || 'Invia Messaggio all\'Assistenza')}
      </button>
    </form>

    <div style="margin-top:1.4rem; padding-top:1rem; border-top:1px solid rgba(255,255,255,0.1);">
      <div style="font-size:0.8rem; font-weight:900; color:#38bdf8; text-transform:uppercase; letter-spacing:0.6px; margin-bottom:0.65rem;">
        <i class="fas fa-inbox"></i> ${escapeHtml(dict.support_replies_title || 'Risposte ricevute dallo Staff')}
      </div>
      <div id="support-user-replies" style="display:flex; flex-direction:column; gap:0.6rem; max-height:220px; overflow-y:auto;">
        <div style="font-size:0.82rem; color:#94a3b8;">Caricamento risposte...</div>
      </div>
    </div>
  `;

  // Submit support message
  const form = document.getElementById('support-ticket-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('support-submit-btn');
    const category = document.getElementById('support-category').value;
    const subject = document.getElementById('support-subject').value.trim();
    const message = document.getElementById('support-message').value.trim();
    if (!subject || !message) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Invio in corso...';
    try {
      await addDoc(collection(db, 'private_messages'), {
        type: 'support_ticket',
        toUid: SUPPORT_ADMIN_UID,
        recipientUid: SUPPORT_ADMIN_UID,
        fromUid: user.uid,
        fromName: senderName,
        fromEmail: user.email || '',
        category,
        subject,
        message,
        status: 'open',
        read: false,
        createdAt: new Date().toISOString()
      });
      form.reset();
      showMsg('Messaggio inviato allo staff! Riceverai la risposta direttamente qui e nella sezione Messaggi del tuo account.', 'success');
    } catch (err) {
      console.error('Support ticket send error:', err);
      showMsg('Errore durante l\'invio del messaggio: ' + (err.message || 'riprova più tardi'), 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-paper-plane"></i> ${escapeHtml(dict.support_send_btn || 'Invia Messaggio all\'Assistenza')}`;
    }
  };

  // Load replies received by this user
  const repliesBox = document.getElementById('support-user-replies');
  try {
    const q = query(collection(db, 'private_messages'), where('toUid', '==', user.uid));
    const snap = await getDocs(q);
    const replies = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.type === 'support_reply') {
        replies.push({ id: d.id, ...data });
      }
    });
    replies.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    if (replies.length === 0) {
      repliesBox.innerHTML = `<div style="font-size:0.82rem; color:#64748b;">${escapeHtml(dict.support_no_replies || 'Nessuna risposta ricevuta al momento. Quando lo staff risponderà, la troverai qui e nella tua area Account.')}</div>`;
    } else {
      repliesBox.innerHTML = replies
        .map(
          (r) => `
          <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.32); border-radius:10px; padding:0.75rem 0.9rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
              <strong style="font-size:0.84rem; color:#34d399;"><i class="fas fa-reply"></i> ${escapeHtml(r.subject || 'Risposta Assistenza')}</strong>
              <span style="font-size:0.72rem; color:#94a3b8;">${escapeHtml(formatDate(r.createdAt))}</span>
            </div>
            <div style="font-size:0.85rem; color:#e2e8f0; line-height:1.45; white-space:pre-wrap;">${escapeHtml(r.message)}</div>
          </div>
        `
        )
        .join('');
    }
  } catch (err) {
    console.warn('Error loading support replies:', err);
    repliesBox.innerHTML = '<div style="font-size:0.8rem; color:#94a3b8;">Le risposte saranno visibili nella tua area Account.</div>';
  }
}

export function openSupportModal() {
  ensureSupportModalDOM();
  const modal = document.getElementById('indieplay-support-modal');
  modal.style.display = 'flex';
  renderSupportModalContent();
}

export function initSupportWidget() {
  ensureSupportModalDOM();
  document.querySelectorAll('.open-support-modal-btn, #open-support-modal-btn').forEach((btn) => {
    if (btn.dataset.supportBound) return;
    btn.dataset.supportBound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openSupportModal();
    });
  });
}

// ============================================================================
// 2. ADMIN SUPPORT INBOX IN /BITMEME (Read Messages & Reply Directly to Users)
// ============================================================================
export async function renderBitmemeSupportPanel(containerId = 'bm-support-panel-root') {
  const root = document.getElementById(containerId);
  if (!root) return;

  root.innerHTML = `
    <div style="margin-top:2rem; background:rgba(15,23,34,0.96); border:1px solid rgba(56,189,248,0.45); border-radius:18px; padding:1.8rem 2rem; box-shadow:0 20px 50px rgba(0,0,0,0.65);">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:1.2rem;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:46px; height:46px; border-radius:12px; background:rgba(56,189,248,0.15); border:1px solid #38bdf8; display:flex; align-items:center; justify-content:center;">
            <i class="fas fa-headset" style="color:#38bdf8; font-size:1.35rem;"></i>
          </div>
          <div>
            <span style="font-size:0.72rem; font-weight:900; color:#38bdf8; letter-spacing:0.8px;">CENTRO ASSISTENZA UTENTI</span>
            <h2 style="margin:2px 0 0; font-size:1.28rem; font-weight:900; color:white;">Messaggi di Supporto &amp; Risposte Dirette</h2>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span id="bm-support-count-badge" style="padding:4px 11px; border-radius:999px; font-size:0.74rem; font-weight:900; background:rgba(56,189,248,0.16); color:#7dd3fc;">Caricamento...</span>
          <button type="button" id="bm-support-refresh-btn" class="btn btn-prime-outline" style="padding:0.45rem 0.9rem; font-size:0.78rem; font-weight:800;">
            <i class="fas fa-sync-alt"></i> Aggiorna
          </button>
        </div>
      </div>

      <div id="bm-support-filter-bar" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:1rem;">
        <button type="button" class="filter-chip active bm-sup-filter" data-filter="all">Tutti</button>
        <button type="button" class="filter-chip bm-sup-filter" data-filter="open">Da rispondere</button>
        <button type="button" class="filter-chip bm-sup-filter" data-filter="replied">Risposti</button>
      </div>

      <div id="bm-support-tickets-list" style="display:flex; flex-direction:column; gap:1rem;">
        <div class="loading">Caricamento messaggi utenti...</div>
      </div>
    </div>
  `;

  let currentFilter = 'all';
  let cachedTickets = [];

  const renderList = () => {
    const listEl = document.getElementById('bm-support-tickets-list');
    const badgeEl = document.getElementById('bm-support-count-badge');
    if (!listEl) return;

    const openCount = cachedTickets.filter((t) => t.status !== 'replied').length;
    if (badgeEl) {
      badgeEl.textContent = `${openCount} da rispondere • ${cachedTickets.length} totali`;
      badgeEl.style.background = openCount > 0 ? 'rgba(239,68,68,0.22)' : 'rgba(16,185,129,0.2)';
      badgeEl.style.color = openCount > 0 ? '#fca5a5' : '#34d399';
    }

    const filtered = cachedTickets.filter((t) => {
      if (currentFilter === 'open') return t.status !== 'replied';
      if (currentFilter === 'replied') return t.status === 'replied';
      return true;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="padding:1.4rem; text-align:center; color:#94a3b8; background:rgba(255,255,255,0.03); border:1px dashed rgba(255,255,255,0.12); border-radius:12px;">Nessun messaggio di assistenza in questa vista.</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((t) => {
        const isReplied = t.status === 'replied';
        return `
          <div style="background:rgba(255,255,255,0.03); border:1px solid ${isReplied ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.45)'}; border-radius:12px; padding:1.1rem 1.2rem;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap; margin-bottom:0.55rem;">
              <div>
                <span style="display:inline-block; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:900; margin-right:6px; background:${isReplied ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}; color:${isReplied ? '#34d399' : '#fbbf24'};">
                  ${isReplied ? '✓ RISPOSTO' : '● NUOVO'}
                </span>
                <span style="font-size:0.74rem; color:#38bdf8; font-weight:800;">${escapeHtml(t.category || 'Supporto')}</span>
                <h3 style="margin:4px 0 2px; font-size:1rem; font-weight:900; color:white;">${escapeHtml(t.subject || 'Richiesta Assistenza')}</h3>
                <div style="font-size:0.78rem; color:#94a3b8;">
                  Da: <strong style="color:#e2e8f0;">${escapeHtml(t.fromName || 'Utente')}</strong> (${escapeHtml(t.fromEmail || 'N/D')}) • ${escapeHtml(formatDate(t.createdAt))}
                </div>
              </div>
              <button type="button" class="bm-sup-delete-btn btn btn-prime-outline" data-id="${escapeHtml(t.id)}" title="Elimina messaggio" style="padding:5px 9px; font-size:0.74rem; border-color:rgba(239,68,68,0.45); color:#f87171;">
                <i class="fas fa-trash"></i>
              </button>
            </div>

            <div style="background:rgba(0,5,13,0.5); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:0.8rem 0.95rem; color:#e2e8f0; font-size:0.88rem; line-height:1.5; white-space:pre-wrap; margin-bottom:0.8rem;">${escapeHtml(t.message)}</div>

            ${
              t.adminReply
                ? `<div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:8px; padding:0.65rem 0.9rem; margin-bottom:0.8rem; font-size:0.83rem; color:#a7f3d0;">
                    <strong><i class="fas fa-check-double"></i> Risposta inviata (${escapeHtml(formatDate(t.repliedAt))}):</strong><br>
                    <span style="white-space:pre-wrap;">${escapeHtml(t.adminReply)}</span>
                  </div>`
                : ''
            }

            <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap;">
              <textarea class="bm-sup-reply-input" data-id="${escapeHtml(t.id)}" rows="2" placeholder="Scrivi qui la risposta diretta all'utente (arriverà nel suo account e nella finestra Assistenza)..." style="flex:1; min-width:240px; padding:9px 11px; background:#090e16; border:1px solid rgba(56,189,248,0.35); border-radius:8px; color:white; font-size:0.84rem; resize:vertical;"></textarea>
              <button type="button" class="bm-sup-send-reply-btn btn btn-prime" data-id="${escapeHtml(t.id)}" style="padding:0.65rem 1.15rem; font-weight:900; font-size:0.82rem; white-space:nowrap;">
                <i class="fas fa-paper-plane"></i> Rispondi all'Utente
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    // Wire reply buttons
    listEl.querySelectorAll('.bm-sup-send-reply-btn').forEach((btn) => {
      btn.onclick = async () => {
        const ticketId = btn.getAttribute('data-id');
        const ticket = cachedTickets.find((x) => x.id === ticketId);
        const textarea = listEl.querySelector(`.bm-sup-reply-input[data-id="${ticketId}"]`);
        const replyText = textarea ? textarea.value.trim() : '';
        if (!ticket || !replyText) {
          showMsg('Scrivi una risposta prima di inviare.', 'error');
          return;
        }
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Invio...';
        try {
          const nowIso = new Date().toISOString();
          if (ticket.fromUid) {
            await addDoc(collection(db, 'private_messages'), {
              type: 'support_reply',
              toUid: ticket.fromUid,
              recipientUid: ticket.fromUid,
              fromUid: SUPPORT_ADMIN_UID,
              fromName: 'Assistenza INDIE PLAY X',
              replyToTicketId: ticket.id,
              subject: `Re: ${ticket.subject || 'Richiesta Assistenza'}`,
              message: replyText,
              read: false,
              createdAt: nowIso
            });
          }
          await updateDoc(doc(db, 'private_messages', ticket.id), {
            status: 'replied',
            adminReply: replyText,
            repliedAt: nowIso,
            read: true
          });
          showMsg(`Risposta inviata direttamente a ${ticket.fromName || 'utente'}!`, 'success');
          await loadTickets();
        } catch (err) {
          console.error('Support reply error:', err);
          showMsg('Errore invio risposta: ' + (err.message || 'verifica accesso Admin Firebase'), 'error');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-paper-plane"></i> Rispondi all\'Utente';
        }
      };
    });

    // Wire delete buttons
    listEl.querySelectorAll('.bm-sup-delete-btn').forEach((btn) => {
      btn.onclick = async () => {
        const ticketId = btn.getAttribute('data-id');
        if (!confirm('Vuoi eliminare definitivamente questo messaggio di assistenza?')) return;
        try {
          await deleteDoc(doc(db, 'private_messages', ticketId));
          showMsg('Messaggio eliminato.', 'success');
          await loadTickets();
        } catch (err) {
          showMsg('Errore eliminazione: ' + err.message, 'error');
        }
      };
    });
  };

  const loadTickets = async () => {
    const listEl = document.getElementById('bm-support-tickets-list');
    if (listEl) listEl.innerHTML = '<div class="loading">Caricamento messaggi utenti...</div>';
    try {
      const q = query(collection(db, 'private_messages'), where('toUid', '==', SUPPORT_ADMIN_UID));
      const snap = await getDocs(q);
      const rows = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      cachedTickets = rows;
      renderList();
    } catch (err) {
      console.error('Load support tickets error:', err);
      if (listEl) {
        listEl.innerHTML = `
          <div style="background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.45); border-radius:12px; padding:1.2rem; text-align:center;">
            <p style="margin:0 0 0.85rem; font-size:0.86rem; color:#fde68a;">
              <i class="fas fa-user-shield"></i> Per leggere e rispondere ai messaggi privati su Firestore, accedi prima con il tuo account amministratore Firebase (<code>danielepmp@yahoo.it</code> o <code>devindieplay@gmail.com</code>).
            </p>
            <button type="button" id="bm-support-admin-google-btn" class="btn btn-prime" style="padding:0.65rem 1.25rem; font-weight:800;">
              <i class="fab fa-google"></i> Accedi come Admin per sbloccare la Casella
            </button>
          </div>
        `;
        const gBtn = document.getElementById('bm-support-admin-google-btn');
        if (gBtn) {
          gBtn.onclick = async () => {
            try {
              await loginWithGoogle();
              await loadTickets();
            } catch (e) {
              showMsg('Accesso annullato: ' + e.message, 'error');
            }
          };
        }
      }
    }
  };

  root.querySelectorAll('.bm-sup-filter').forEach((btn) => {
    btn.onclick = () => {
      root.querySelectorAll('.bm-sup-filter').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter') || 'all';
      renderList();
    };
  });

  const refreshBtn = document.getElementById('bm-support-refresh-btn');
  if (refreshBtn) refreshBtn.onclick = loadTickets;

  await loadTickets();
}
