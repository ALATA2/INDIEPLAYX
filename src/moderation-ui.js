import { db } from './firebase.js';
import { collection, getDocs } from 'firebase/firestore';
import { escapeHTML } from './security.js';
import {
  MODERATION_REASONS,
  syncModerationStateFromCloud,
  adminDeleteGame,
  adminRestoreGame,
  adminBanOrDeleteUser,
  adminUnbanUser
} from './moderation.js';

export async function mountBitmemeModerationPanel(containerId = 'bm-moderation-panel-root') {
  const container = document.getElementById(containerId);
  if (!container) return;

  let activeTab = 'games'; // games | users | log
  let searchQuery = '';
  let selectedReason = MODERATION_REASONS[0];
  let loading = true;
  let allGames = [];
  let allUsers = [];
  let modState = await syncModerationStateFromCloud();

  const loadData = async () => {
    loading = true;
    render();

    modState = await syncModerationStateFromCloud();

    // Load all games from Firestore + static cache (deduped by id)
    const gamesMap = new Map();
    try {
      const gSnap = await getDocs(collection(db, 'games'));
      gSnap.forEach((d) => {
        gamesMap.set(d.id, { id: d.id, _source: 'Firestore', ...d.data() });
      });
    } catch (e) {}
    try {
      const res = await fetch('/games-fast-cache.json');
      if (res.ok) {
        const arr = await res.json();
        if (Array.isArray(arr)) {
          arr.forEach((g) => {
            if (g && g.id && !gamesMap.has(String(g.id))) {
              gamesMap.set(String(g.id), { ...g, id: String(g.id), _source: 'Catalogo' });
            }
          });
        }
      }
    } catch (e) {}
    allGames = Array.from(gamesMap.values());

    // Load all users from Firestore
    const usersList = [];
    try {
      const uSnap = await getDocs(collection(db, 'users'));
      uSnap.forEach((d) => {
        usersList.push({ uid: d.id, ...d.data() });
      });
    } catch (e) {}
    allUsers = usersList;

    loading = false;
    render();
  };

  const render = () => {
    const removedSet = new Set(modState.removedGameIds || []);
    const bannedUidSet = new Set(modState.bannedUserIds || []);
    const bannedHandleSet = new Set((modState.bannedUserHandles || []).map((x) => x.toLowerCase()));

    const q = searchQuery.trim().toLowerCase();

    const filteredGames = allGames.filter((g) => {
      if (!q) return true;
      return `${g.title || ''} ${g.developer || ''} ${g.category || ''} ${g.id || ''}`.toLowerCase().includes(q);
    });

    const filteredUsers = allUsers.filter((u) => {
      if (!q) return true;
      const fullName = `${u.displayName || ''} ${u.firstName || ''} ${u.lastName || ''} ${u.studioName || ''} ${u.email || ''} ${u.uid || ''}`;
      return fullName.toLowerCase().includes(q);
    });

    const activeGamesCount = allGames.filter((g) => !removedSet.has(String(g.id))).length;
    const removedCount = removedSet.size;
    const bannedUsersCount = bannedUidSet.size;

    container.innerHTML = `
      <div style="margin-top: 2rem; background: rgba(15, 23, 34, 0.96); border: 1px solid rgba(239, 68, 68, 0.45); border-radius: 18px; padding: 1.8rem; box-shadow: 0 20px 50px rgba(0,0,0,0.65);">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; margin-bottom: 1.2rem;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(239, 68, 68, 0.16); border: 1px solid #ef4444; display: flex; align-items: center; justify-content: center;">
              <i class="fas fa-gavel" style="color: #f87171; font-size: 1.35rem;"></i>
            </div>
            <div>
              <span style="font-size: 0.72rem; font-weight: 900; color: #f87171; letter-spacing: 0.8px;">SICUREZZA & CONTROLLO CONTENUTI (18+ / NSFW / VIOLAZIONI)</span>
              <h2 style="margin: 2px 0 0; font-size: 1.35rem; font-weight: 900; color: white;">Centro Moderazione — Rimozione Giochi & Profili</h2>
            </div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <span style="font-size: 0.75rem; font-weight: 800; color: #94a3b8; background: rgba(255,255,255,0.05); padding: 5px 10px; border-radius: 999px;">
              Giochi Attivi: <strong style="color:#34d399;">${activeGamesCount}</strong> • Rimossi: <strong style="color:#f87171;">${removedCount}</strong> • Profili Bannati: <strong style="color:#fbbf24;">${bannedUsersCount}</strong>
            </span>
            <button type="button" id="bm-mod-refresh-btn" class="btn btn-prime-outline" style="padding: 0.5rem 0.9rem; font-size: 0.76rem; font-weight: 800;">
              <i class="fas fa-sync-alt ${loading ? 'fa-spin' : ''}"></i> Aggiorna Liste
            </button>
          </div>
        </div>

        <!-- Tabs + Search + Reason Selector -->
        <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 1.1rem;">
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button type="button" class="bm-mod-tab btn" data-tab="games" style="padding: 0.55rem 1rem; font-size: 0.8rem; font-weight: 800; border-radius: 8px; border: 1px solid ${activeTab === 'games' ? '#ef4444' : 'rgba(255,255,255,0.12)'}; background: ${activeTab === 'games' ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.04)'}; color: ${activeTab === 'games' ? '#fca5a5' : '#cbd5e1'}; cursor: pointer;">
              <i class="fas fa-gamepad"></i> Giochi (${allGames.length})
            </button>
            <button type="button" class="bm-mod-tab btn" data-tab="users" style="padding: 0.55rem 1rem; font-size: 0.8rem; font-weight: 800; border-radius: 8px; border: 1px solid ${activeTab === 'users' ? '#ef4444' : 'rgba(255,255,255,0.12)'}; background: ${activeTab === 'users' ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.04)'}; color: ${activeTab === 'users' ? '#fca5a5' : '#cbd5e1'}; cursor: pointer;">
              <i class="fas fa-users-slash"></i> Profili Utenti (${allUsers.length})
            </button>
            <button type="button" class="bm-mod-tab btn" data-tab="log" style="padding: 0.55rem 1rem; font-size: 0.8rem; font-weight: 800; border-radius: 8px; border: 1px solid ${activeTab === 'log' ? '#fbbf24' : 'rgba(255,255,255,0.12)'}; background: ${activeTab === 'log' ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.04)'}; color: ${activeTab === 'log' ? '#fde68a' : '#cbd5e1'}; cursor: pointer;">
              <i class="fas fa-history"></i> Registro & Ripristino (${(modState.moderationLog || []).length})
            </button>
          </div>

          <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
            <select id="bm-mod-reason-select" style="padding: 0.55rem 0.8rem; border-radius: 8px; background: #090e16; border: 1px solid rgba(239,68,68,0.4); color: #fca5a5; font-size: 0.78rem; font-weight: 700;">
              ${MODERATION_REASONS.map((r) => `<option value="${escapeHTML(r)}" ${r === selectedReason ? 'selected' : ''}>Motivo: ${escapeHTML(r)}</option>`).join('')}
            </select>
            ${activeTab !== 'log' ? `
              <input type="text" id="bm-mod-search" value="${escapeHTML(searchQuery)}" placeholder="Cerca titolo, autore, email..." style="padding: 0.55rem 0.9rem; border-radius: 8px; background: #090e16; border: 1px solid rgba(255,255,255,0.15); color: white; font-size: 0.8rem; min-width: 210px;">
            ` : ''}
          </div>
        </div>

        ${loading ? `
          <div style="padding: 2rem; text-align: center; color: #94a3b8;">
            <i class="fas fa-spinner fa-spin"></i> Caricamento giochi e profili dal Cloud...
          </div>
        ` : activeTab === 'games' ? `
          <div style="max-height: 430px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px;">
            ${filteredGames.length ? filteredGames.map((g) => {
              const isRemoved = removedSet.has(String(g.id));
              const thumb = g.imageUrl || (g.header && g.header.src) || (g.gallery && g.gallery[0] && g.gallery[0].src) || '/images/placeholder.png';
              return `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; background: ${isRemoved ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${isRemoved ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.08)'}; border-radius: 10px; padding: 0.75rem 1rem;">
                  <div style="display: flex; align-items: center; gap: 12px; min-width: 240px; flex: 1;">
                    <img src="${escapeHTML(thumb)}" alt="" style="width: 56px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,0.12);" onerror="this.src='/images/placeholder.png'">
                    <div style="min-width: 0;">
                      <div style="font-weight: 800; color: white; font-size: 0.88rem; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span>${escapeHTML(g.title || 'Senza Titolo')}</span>
                        ${isRemoved ? '<span style="background:#ef4444; color:white; font-size:0.65rem; padding:2px 7px; border-radius:999px;">RIMOSSO</span>' : `<span style="background:rgba(56,189,248,0.16); color:#38bdf8; font-size:0.65rem; padding:2px 7px; border-radius:999px;">${escapeHTML(g._source || 'Cloud')}</span>`}
                      </div>
                      <div style="font-size: 0.75rem; color: #94a3b8;">
                        Autore: <strong style="color:#cbd5e1;">${escapeHTML(g.developer || g.author || 'N/D')}</strong> • ${escapeHTML(g.category || 'Indie')} • ${escapeHTML(g.price || 'FREE')} • ID: <code>${escapeHTML(g.id)}</code>
                      </div>
                    </div>
                  </div>
                  <div style="display: flex; gap: 6px; align-items: center;">
                    <a href="/game.html?id=${encodeURIComponent(g.id)}" target="_blank" class="btn btn-prime-outline" style="padding: 0.45rem 0.75rem; font-size: 0.74rem; text-decoration: none;">
                      <i class="fas fa-eye"></i> Vedi
                    </a>
                    ${isRemoved ? `
                      <button type="button" class="bm-mod-restore-game-btn btn" data-id="${escapeHTML(g.id)}" style="padding: 0.45rem 0.8rem; font-size: 0.74rem; font-weight: 800; border-radius: 7px; border: none; background: #10b981; color: white; cursor: pointer;">
                        <i class="fas fa-undo"></i> Ripristina
                      </button>
                    ` : `
                      <button type="button" class="bm-mod-delete-game-btn btn" data-id="${escapeHTML(g.id)}" data-title="${escapeHTML(g.title || g.id)}" style="padding: 0.45rem 0.85rem; font-size: 0.74rem; font-weight: 800; border-radius: 7px; border: none; background: #ef4444; color: white; cursor: pointer;">
                        <i class="fas fa-trash-alt"></i> Elimina Gioco
                      </button>
                    `}
                  </div>
                </div>
              `;
            }).join('') : '<div style="padding:1.5rem; text-align:center; color:#64748b;">Nessun gioco trovato.</div>'}
          </div>
        ` : activeTab === 'users' ? `
          <div style="max-height: 430px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px;">
            ${filteredUsers.length ? filteredUsers.map((u) => {
              const displayName = u.studioName || u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Utente';
              const email = u.email || '';
              const isBanned = u.banned === true || bannedUidSet.has(u.uid) || bannedHandleSet.has(displayName.toLowerCase()) || (email && bannedHandleSet.has(email.toLowerCase()));
              return `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; background: ${isBanned ? 'rgba(239,68,68,0.09)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${isBanned ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}; border-radius: 10px; padding: 0.75rem 1rem;">
                  <div style="display: flex; align-items: center; gap: 12px; min-width: 240px; flex: 1;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: rgba(56,189,248,0.18); border: 1px solid rgba(56,189,248,0.4); display: flex; align-items: center; justify-content: center; font-weight: 900; color: #38bdf8; overflow: hidden;">
                      ${u.photoURL ? `<img src="${escapeHTML(u.photoURL)}" style="width:100%; height:100%; object-fit:cover;">` : escapeHTML(displayName.charAt(0).toUpperCase())}
                    </div>
                    <div style="min-width: 0;">
                      <div style="font-weight: 800; color: white; font-size: 0.88rem; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span>${escapeHTML(displayName)}</span>
                        ${isBanned ? '<span style="background:#ef4444; color:white; font-size:0.65rem; padding:2px 7px; border-radius:999px;">BANNATO / SOSPESO</span>' : '<span style="background:rgba(16,185,129,0.2); color:#34d399; font-size:0.65rem; padding:2px 7px; border-radius:999px;">ATTIVO</span>'}
                        ${u.isSeller ? '<span style="background:rgba(245,158,11,0.18); color:#fbbf24; font-size:0.65rem; padding:2px 7px; border-radius:999px;">VENDITORE</span>' : ''}
                      </div>
                      <div style="font-size: 0.74rem; color: #94a3b8;">
                        ${email ? `Email (privata admin): <strong style="color:#cbd5e1;">${escapeHTML(email)}</strong> • ` : ''}UID: <code>${escapeHTML(u.uid)}</code>
                        ${u.banReason ? `<div style="color:#fca5a5; margin-top:2px;">Motivo sospensione: ${escapeHTML(u.banReason)}</div>` : ''}
                      </div>
                    </div>
                  </div>
                  <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                    <a href="/showcase.html?uid=${encodeURIComponent(u.uid)}&dev=${encodeURIComponent(displayName)}" target="_blank" class="btn btn-prime-outline" style="padding: 0.42rem 0.7rem; font-size: 0.72rem; text-decoration: none;">
                      <i class="fas fa-store"></i> Vetrina
                    </a>
                    ${isBanned ? `
                      <button type="button" class="bm-mod-unban-user-btn btn" data-uid="${escapeHTML(u.uid)}" data-name="${escapeHTML(displayName)}" data-email="${escapeHTML(email)}" style="padding: 0.42rem 0.8rem; font-size: 0.72rem; font-weight: 800; border-radius: 7px; border: none; background: #10b981; color: white; cursor: pointer;">
                        <i class="fas fa-user-check"></i> Riabilita
                      </button>
                    ` : `
                      <button type="button" class="bm-mod-ban-user-btn btn" data-uid="${escapeHTML(u.uid)}" data-name="${escapeHTML(displayName)}" data-email="${escapeHTML(email)}" style="padding: 0.42rem 0.8rem; font-size: 0.72rem; font-weight: 800; border-radius: 7px; border: none; background: #f59e0b; color: #0f172a; cursor: pointer;">
                        <i class="fas fa-ban"></i> Banna + Rimuovi Giochi
                      </button>
                    `}
                    <button type="button" class="bm-mod-harddelete-user-btn btn" data-uid="${escapeHTML(u.uid)}" data-name="${escapeHTML(displayName)}" data-email="${escapeHTML(email)}" style="padding: 0.42rem 0.8rem; font-size: 0.72rem; font-weight: 800; border-radius: 7px; border: none; background: #dc2626; color: white; cursor: pointer;">
                      <i class="fas fa-user-times"></i> Elimina Definitivamente
                    </button>
                  </div>
                </div>
              `;
            }).join('') : '<div style="padding:1.5rem; text-align:center; color:#64748b;">Nessun profilo utente trovato in Firestore.</div>'}
          </div>
        ` : `
          <div style="max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 7px; padding-right: 4px;">
            ${(modState.moderationLog || []).length ? modState.moderationLog.map((entry) => `
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 9px; padding: 0.65rem 0.9rem; font-size: 0.78rem;">
                <div>
                  <strong style="color:${entry.action.includes('DELETE') || entry.action.includes('BAN') ? '#f87171' : '#34d399'};">[${escapeHTML(entry.action)}]</strong>
                  <strong style="color:white; margin-left:6px;">${escapeHTML(entry.targetLabel || entry.targetId)}</strong>
                  <div style="color:#94a3b8; font-size:0.73rem; margin-top:2px;">
                    ${new Date(entry.ts).toLocaleString('it-IT')} • Motivo: ${escapeHTML(entry.reason || '')}
                  </div>
                </div>
                ${entry.action === 'DELETE_GAME' && removedSet.has(String(entry.targetId)) ? `
                  <button type="button" class="bm-mod-restore-game-btn btn" data-id="${escapeHTML(entry.targetId)}" style="padding: 0.35rem 0.75rem; font-size: 0.72rem; font-weight: 800; border-radius: 6px; border: none; background: #10b981; color: white; cursor: pointer;">
                    <i class="fas fa-undo"></i> Ripristina ID
                  </button>
                ` : ''}
              </div>
            `).join('') : '<div style="padding:1.5rem; text-align:center; color:#64748b;">Nessuna azione di moderazione registrata finora.</div>'}
          </div>
        `}
      </div>
    `;

    // Wire events
    const refreshBtn = document.getElementById('bm-mod-refresh-btn');
    if (refreshBtn) refreshBtn.onclick = () => loadData();

    container.querySelectorAll('.bm-mod-tab').forEach((btn) => {
      btn.onclick = () => {
        activeTab = btn.getAttribute('data-tab') || 'games';
        render();
      };
    });

    const reasonSel = document.getElementById('bm-mod-reason-select');
    if (reasonSel) {
      reasonSel.onchange = (e) => {
        selectedReason = e.target.value;
      };
    }

    const searchInput = document.getElementById('bm-mod-search');
    if (searchInput) {
      searchInput.oninput = (e) => {
        searchQuery = e.target.value;
        const pos = searchInput.selectionStart;
        render();
        const next = document.getElementById('bm-mod-search');
        if (next) {
          next.focus();
          try { next.setSelectionRange(pos, pos); } catch (err) {}
        }
      };
    }

    container.querySelectorAll('.bm-mod-delete-game-btn').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-id');
        const title = btn.getAttribute('data-title');
        const ok = window.confirm(`Confermi la RIMOZIONE IMMEDIATA del gioco "${title}"?\nMotivo: ${selectedReason}\n\nIl gioco scomparirà dal sito per tutti i visitatori.`);
        if (!ok) return;
        btn.disabled = true;
        await adminDeleteGame({ gameId: id, title, reason: selectedReason });
        if (window.showToast) window.showToast(`Gioco "${title}" eliminato e rimosso dal portale!`, 'info');
        await loadData();
      };
    });

    container.querySelectorAll('.bm-mod-restore-game-btn').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        await adminRestoreGame(id);
        if (window.showToast) window.showToast(`ID gioco "${id}" rimosso dalla blacklist.`, 'success');
        await loadData();
      };
    });

    container.querySelectorAll('.bm-mod-ban-user-btn').forEach((btn) => {
      btn.onclick = async () => {
        const uid = btn.getAttribute('data-uid');
        const name = btn.getAttribute('data-name');
        const email = btn.getAttribute('data-email');
        const ok = window.confirm(`Vuoi BANNARE il profilo "${name}" ed ELIMINARE tutti i suoi giochi e la sua bacheca social?\nMotivo: ${selectedReason}`);
        if (!ok) return;
        btn.disabled = true;
        const res = await adminBanOrDeleteUser({ uid, displayName: name, email, reason: selectedReason, hardDelete: false });
        if (window.showToast) window.showToast(`Profilo "${name}" bannato (${res.deletedGamesCount} giochi rimossi)!`, 'info');
        await loadData();
      };
    });

    container.querySelectorAll('.bm-mod-harddelete-user-btn').forEach((btn) => {
      btn.onclick = async () => {
        const uid = btn.getAttribute('data-uid');
        const name = btn.getAttribute('data-name');
        const email = btn.getAttribute('data-email');
        const ok = window.confirm(`⚠️ ATTENZIONE: Confermi la CANCELLAZIONE DEFINITIVA da Firestore del profilo "${name}", della sua bacheca social e di TUTTI i suoi giochi?\nMotivo: ${selectedReason}`);
        if (!ok) return;
        btn.disabled = true;
        const res = await adminBanOrDeleteUser({ uid, displayName: name, email, reason: selectedReason, hardDelete: true });
        if (window.showToast) window.showToast(`Profilo "${name}" eliminato definitivamente (${res.deletedGamesCount} giochi rimossi)!`, 'info');
        await loadData();
      };
    });

    container.querySelectorAll('.bm-mod-unban-user-btn').forEach((btn) => {
      btn.onclick = async () => {
        const uid = btn.getAttribute('data-uid');
        const name = btn.getAttribute('data-name');
        const email = btn.getAttribute('data-email');
        btn.disabled = true;
        await adminUnbanUser({ uid, displayName: name, email });
        if (window.showToast) window.showToast(`Profilo "${name}" riabilitato!`, 'success');
        await loadData();
      };
    });
  };

  await loadData();
}
